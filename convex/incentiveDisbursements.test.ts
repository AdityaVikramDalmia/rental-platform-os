// Incentive disbursements: rollout gating and anti-double-pay in createFromSplit, and the
// approve -> disburse / void lifecycle with its permission checks.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_disbursements";
process.env.WORKOS_API_KEY ??= "sk_test_authz";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_disbursements";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const FIXED_NOW = new Date("2026-05-04T10:00:00.000Z");

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTest>;

let sequence = 0;

async function createUser(t: TestBackend, userType: UserType, permissions: string[] = []) {
  sequence += 1;
  const workosUserId = `workos_disb_${userType.toLowerCase()}_${sequence}`;

  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} disbursement ${sequence}`,
      email: `${workosUserId}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });

    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Disbursement role ${sequence}`,
        permissions,
        is_system_role: false,
        is_deleted: false,
      });
      await ctx.db.insert("user_role_assignments", {
        user_id: id,
        role_id: roleId,
        assigned_by_admin_id: id,
        is_deleted: false,
      });
    }

    return id;
  });

  return {
    userId,
    as: t.withIdentity({ subject: workosUserId, issuer: WORKOS_ISSUER }),
  };
}

async function setRolloutPolicy(
  t: TestBackend,
  adminId: Id<"users">,
  mode: "OFF" | "SHADOW" | "PARTIAL" | "FULL",
  enabledPersonas: string[] = [],
) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", "incentive_v3_rollout_policy"))
      .first();
    const value = JSON.stringify({ mode, enabled_personas: enabledPersonas, notes: "test" });
    if (existing) {
      await ctx.db.patch(existing._id, { value });
      return;
    }
    await ctx.db.insert("system_config", {
      key: "incentive_v3_rollout_policy",
      value,
      updated_by_admin_id: adminId,
    });
  });
}

// A confirmed closure so disbursements can be tied to a deal.
async function createClosure(t: TestBackend, adminId: Id<"users">, guardId: Id<"users">) {
  return await t.run(async (ctx) => {
    const societyId = await ctx.db.insert("societies", {
      name: `Disbursement Society ${sequence}`,
      city: "Delhi",
      status: "ACTIVE",
      created_by_admin_id: adminId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Block D",
      total_floors: 4,
      floor_labels: ["1"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "1",
      flat_number: `D-${sequence}`,
      owner_phone: "9444444444",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: guardId,
      status: "VERIFIED",
    });
    return await ctx.db.insert("closures", {
      lead_id: leadId,
      move_in_date: FIXED_NOW.getTime(),
      status: "CONFIRMED",
      closed_by_admin_id: adminId,
    });
  });
}

function splitArgs(
  recipientId: Id<"users">,
  sourceKey: string,
  overrides: Partial<{
    amount_paise: number;
    closure_id: Id<"closures">;
    recipient_persona: "GUARD" | "OPS";
  }> = {},
) {
  return {
    recipient_user_id: recipientId,
    recipient_persona: overrides.recipient_persona ?? ("GUARD" as const),
    source_type: "ATTRIBUTION_SPLIT" as const,
    source_record_id: sourceKey,
    source_key: sourceKey,
    closure_id: overrides.closure_id,
    amount_paise: overrides.amount_paise ?? 25_000,
  };
}

async function allDisbursements(t: TestBackend) {
  return await t.run(async (ctx) => ctx.db.query("incentive_disbursements").collect());
}

describe("incentiveDisbursements", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("createFromSplit", () => {
    it("writes nothing while the rollout is OFF (the default) or SHADOW", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN");
      const guard = await createUser(t, "GUARD");

      const offResult = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:off"),
      );
      await setRolloutPolicy(t, admin.userId, "SHADOW");
      const shadowResult = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:shadow"),
      );

      expect(offResult).toBeNull();
      expect(shadowResult).toBeNull();
      expect(await allDisbursements(t)).toEqual([]);
    });

    it("pays only enabled personas under PARTIAL, using the recipient's active actor profile", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN");
      const guard = await createUser(t, "GUARD");
      const reassigned = await createUser(t, "GUARD");
      await setRolloutPolicy(t, admin.userId, "PARTIAL", ["GUARD"]);
      await t.run(async (ctx) => {
        await ctx.db.insert("incentive_actor_profiles", {
          user_id: reassigned.userId,
          persona: "OPS",
          effective_from: FIXED_NOW.getTime() - 1_000,
          is_active: true,
          assigned_by: admin.userId,
          created_at: FIXED_NOW.getTime() - 1_000,
        });
      });

      const guardId = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:guard"),
      );
      const reassignedId = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(reassigned.userId, "split:reassigned"),
      );

      expect(reassignedId).toBeNull();
      const rows = await allDisbursements(t);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        _id: guardId,
        recipient_user_id: guard.userId,
        recipient_persona: "GUARD",
        status: "PENDING",
        amount_paise: 25_000,
        created_at: FIXED_NOW.getTime(),
      });
    });

    it("never pays the same source key twice, nor two live splits for one closure and recipient", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", [PERMISSIONS.DISBURSEMENT_VOID]);
      const guard = await createUser(t, "GUARD");
      const closureId = await createClosure(t, admin.userId, guard.userId);
      await setRolloutPolicy(t, admin.userId, "FULL");

      const first = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:1", { closure_id: closureId }),
      );
      const sameKey = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:1", { closure_id: closureId, amount_paise: 99_999 }),
      );
      const sameClosure = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:2", { closure_id: closureId, amount_paise: 40_000 }),
      );

      expect(sameKey).toBe(first);
      expect(sameClosure).toBe(first);
      expect(await allDisbursements(t)).toHaveLength(1);

      await admin.as.mutation(api.incentiveDisbursements.voidDisbursement, {
        disbursement_id: first!,
      });
      const replacement = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:3", { closure_id: closureId, amount_paise: 40_000 }),
      );

      expect(replacement).not.toBe(first);
      const live = (await allDisbursements(t)).filter((row) => row.status !== "VOIDED");
      expect(live).toHaveLength(1);
      expect(live[0]).toMatchObject({ _id: replacement, amount_paise: 40_000 });
    });

    it("rejects amounts that are not positive whole paise once the rollout is live", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN");
      const guard = await createUser(t, "GUARD");
      await setRolloutPolicy(t, admin.userId, "FULL");

      for (const [index, amount] of [0, -1, 10.5].entries()) {
        await expect(
          t.mutation(
            internal.incentiveDisbursements.createFromSplit,
            splitArgs(guard.userId, `split:bad:${index}`, { amount_paise: amount }),
          ),
        ).rejects.toThrow("amount_paise must be a positive whole number in paise");
      }
      expect(await allDisbursements(t)).toEqual([]);
    });
  });

  describe("approve / disburse / voidDisbursement", () => {
    it("moves PENDING -> APPROVED -> DISBURSED and refuses every out-of-order step", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", [
        PERMISSIONS.DISBURSEMENT_APPROVE,
        PERMISSIONS.DISBURSEMENT_VOID,
      ]);
      const guard = await createUser(t, "GUARD");
      await setRolloutPolicy(t, admin.userId, "FULL");
      const id = (await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:lifecycle"),
      ))!;

      await expect(
        admin.as.mutation(api.incentiveDisbursements.disburse, { disbursement_id: id }),
      ).rejects.toThrow("Only APPROVED disbursements can be disbursed");

      const approved = await admin.as.mutation(api.incentiveDisbursements.approve, {
        disbursement_id: id,
      });
      expect(approved).toMatchObject({
        status: "APPROVED",
        approved_by_admin_id: admin.userId,
        approved_at: FIXED_NOW.getTime(),
      });
      await expect(
        admin.as.mutation(api.incentiveDisbursements.approve, { disbursement_id: id }),
      ).rejects.toThrow("Only PENDING disbursements can be approved");

      vi.setSystemTime(FIXED_NOW.getTime() + 60_000);
      const disbursed = await admin.as.mutation(api.incentiveDisbursements.disburse, {
        disbursement_id: id,
      });
      expect(disbursed).toMatchObject({
        status: "DISBURSED",
        disbursed_at: FIXED_NOW.getTime() + 60_000,
      });
      await expect(
        admin.as.mutation(api.incentiveDisbursements.voidDisbursement, { disbursement_id: id }),
      ).rejects.toThrow("Only PENDING or APPROVED disbursements can be voided");
    });

    it("requires disbursement.void to void while the permitted admin still can", async () => {
      const t = createTest();
      const approver = await createUser(t, "ADMIN", [PERMISSIONS.DISBURSEMENT_APPROVE]);
      const voider = await createUser(t, "ADMIN", [PERMISSIONS.DISBURSEMENT_VOID]);
      const guard = await createUser(t, "GUARD");
      await setRolloutPolicy(t, voider.userId, "FULL");
      const id = (await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:void"),
      ))!;
      await approver.as.mutation(api.incentiveDisbursements.approve, { disbursement_id: id });

      await expect(
        approver.as.mutation(api.incentiveDisbursements.voidDisbursement, { disbursement_id: id }),
      ).rejects.toThrow("Missing permission: disbursement.void");
      await expect(
        voider.as.mutation(api.incentiveDisbursements.approve, { disbursement_id: id }),
      ).rejects.toThrow("Missing permission: disbursement.approve");

      const voided = await voider.as.mutation(api.incentiveDisbursements.voidDisbursement, {
        disbursement_id: id,
      });
      expect(voided?.status).toBe("VOIDED");
    });
  });

  describe("listByRecipient", () => {
    it("lets a recipient list their own disbursements but not someone else's", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", [PERMISSIONS.DISBURSEMENT_APPROVE]);
      const guard = await createUser(t, "GUARD");
      const otherGuard = await createUser(t, "GUARD");
      await setRolloutPolicy(t, admin.userId, "FULL");
      const olderId = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:older"),
      );
      vi.setSystemTime(FIXED_NOW.getTime() + 1_000);
      const newerId = await t.mutation(
        internal.incentiveDisbursements.createFromSplit,
        splitArgs(guard.userId, "split:newer"),
      );
      await admin.as.mutation(api.incentiveDisbursements.approve, { disbursement_id: olderId! });

      const own = await guard.as.query(api.incentiveDisbursements.listByRecipient, {
        recipient_user_id: guard.userId,
      });
      expect(own.map((row) => row._id)).toEqual([newerId, olderId]);

      const approvedOnly = await guard.as.query(api.incentiveDisbursements.listByRecipient, {
        recipient_user_id: guard.userId,
        status: "APPROVED",
      });
      expect(approvedOnly.map((row) => row._id)).toEqual([olderId]);

      await expect(
        otherGuard.as.query(api.incentiveDisbursements.listByRecipient, {
          recipient_user_id: guard.userId,
        }),
      ).rejects.toThrow("Admin or OPS access required");
      const asAdmin = await admin.as.query(api.incentiveDisbursements.listByRecipient, {
        recipient_user_id: guard.userId,
      });
      expect(asAdmin).toHaveLength(2);
    });
  });
});
