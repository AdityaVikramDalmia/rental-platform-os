// Payout lifecycle: creation guards, approval amount precedence, disbursement records,
// guard earnings visibility and the payoutTotals aggregate staying in step with the table.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAYOUT_STATUS, PERMISSIONS, type PayoutStatus, type UserType } from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { validatePayoutTransition } from "./payouts";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_payouts";
process.env.WORKOS_API_KEY ??= "sk_test_payouts";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_payouts";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const FIXED_NOW = new Date("2026-03-10T06:30:00.000Z");

const PAYOUT_ADMIN_PERMISSIONS = [
  PERMISSIONS.PAYOUTS_VIEW,
  PERMISSIONS.PAYOUTS_CREATE,
  PERMISSIONS.PAYOUTS_APPROVE,
  PERMISSIONS.PAYOUTS_DISBURSE,
  PERMISSIONS.PAYOUTS_VOID,
  PERMISSIONS.ANALYTICS_VIEW,
];

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
  const workosUserId = `workos_payouts_${userType.toLowerCase()}_${sequence}`;

  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} payouts ${sequence}`,
      email: `${workosUserId}@example.com`,
      phone: `97${String(sequence).padStart(8, "0")}`,
      status: "ACTIVE",
      must_change_password: false,
    });

    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Payouts role ${sequence}`,
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

// Guard (with profile + quality score) → lead carrying a prospective bounty → closure.
async function createClosureFixture(
  t: TestBackend,
  adminId: Id<"users">,
  options: {
    qualityScore?: number;
    closureStatus?: "PENDING" | "CONFIRMED" | "CANCELLED";
    guard?: Awaited<ReturnType<typeof createUser>>;
  } = {},
) {
  const guard = options.guard ?? (await createUser(t, "GUARD"));

  const ids = await t.run(async (ctx) => {
    const societyId = await ctx.db.insert("societies", {
      name: `Payout Society ${sequence}`,
      city: "Mumbai",
      status: "ACTIVE",
      created_by_admin_id: adminId,
    });
    const existingProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", guard.userId))
      .unique();
    if (!existingProfile) {
      await ctx.db.insert("guard_profiles", {
        user_id: guard.userId,
        society_id: societyId,
        guard_type: "MAIN_GATE",
        has_seen_onboarding: true,
        quality_score: options.qualityScore ?? 0,
      });
    }
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower P",
      total_floors: 12,
      floor_labels: ["1", "2", "3"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "2",
      flat_number: `P-${sequence}`,
      owner_phone: "9222222222",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: guard.userId,
      status: "VERIFIED",
      prospective_bounty: 100_000,
    });
    const closureId = await ctx.db.insert("closures", {
      lead_id: leadId,
      move_in_date: FIXED_NOW.getTime(),
      status: options.closureStatus ?? "CONFIRMED",
      closed_by_admin_id: adminId,
      confirmed_at: FIXED_NOW.getTime(),
    });
    return { leadId, closureId };
  });

  return { guard, ...ids };
}

async function getLiveAdjustment(t: TestBackend, payoutId: Id<"payouts">) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("payout_adjustments")
      .withIndex("by_payout", (q) => q.eq("payout_id", payoutId))
      .collect();
    return rows.filter((row) => !row.is_deleted);
  });
}

async function getScheduledEvents(t: TestBackend, eventType: string) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs
      .filter((job) => job.name.includes("emitEvent"))
      .map((job) => job.args[0] as { event_type: string; payload: Record<string, unknown> })
      .filter((args) => args.event_type === eventType);
  });
}

describe("payouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("validatePayoutTransition", () => {
    it("allows pending -> approved/voided and approved -> disbursed/failed/voided only", () => {
      const statuses = Object.values(PAYOUT_STATUS) as PayoutStatus[];
      const allowed = new Set([
        "pending>approved",
        "pending>voided",
        "approved>disbursed",
        "approved>failed",
        "approved>voided",
      ]);

      for (const from of statuses) {
        for (const to of statuses) {
          expect(validatePayoutTransition(from, to), `${from} -> ${to}`).toBe(
            allowed.has(`${from}>${to}`),
          );
        }
      }
    });
  });

  describe("create", () => {
    it("creates one pending payout per confirmed closure and rejects a second one", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const fixture = await createClosureFixture(t, admin.userId);

      const payout = await admin.as.mutation(api.payouts.create, {
        closure_id: fixture.closureId,
        amount_paise: 100_000,
        payment_reference: "  UTR-0001  ",
      });

      expect(payout).toMatchObject({
        status: PAYOUT_STATUS.PENDING,
        amount_paise: 100_000,
        guard_user_id: fixture.guard.userId,
        lead_id: fixture.leadId,
        initiated_by_admin_id: admin.userId,
        payment_reference: "UTR-0001",
      });
      expect(await getLiveAdjustment(t, payout!._id)).toHaveLength(1);

      await expect(
        admin.as.mutation(api.payouts.create, {
          closure_id: fixture.closureId,
          amount_paise: 50_000,
        }),
      ).rejects.toThrow("A payout already exists for this closure");

      const payoutsForClosure = await t.run(async (ctx) =>
        ctx.db
          .query("payouts")
          .withIndex("by_closure_id", (q) => q.eq("closure_id", fixture.closureId))
          .collect(),
      );
      expect(payoutsForClosure).toHaveLength(1);
    });

    it("rejects closures that are not CONFIRMED", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const pending = await createClosureFixture(t, admin.userId, { closureStatus: "PENDING" });
      const cancelled = await createClosureFixture(t, admin.userId, {
        closureStatus: "CANCELLED",
      });

      for (const fixture of [pending, cancelled]) {
        await expect(
          admin.as.mutation(api.payouts.create, {
            closure_id: fixture.closureId,
            amount_paise: 100_000,
          }),
        ).rejects.toThrow("Only CONFIRMED closures can have payouts");
      }
    });

    it("rejects amounts that are not positive whole paise", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const fixture = await createClosureFixture(t, admin.userId);

      for (const amount of [0, -100, 100.5]) {
        await expect(
          admin.as.mutation(api.payouts.create, {
            closure_id: fixture.closureId,
            amount_paise: amount,
          }),
        ).rejects.toThrow("amount_paise must be a positive whole number in paise");
      }
    });

    it("rejects callers without payouts.create while the permitted admin still succeeds", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const viewer = await createUser(t, "ADMIN", [PERMISSIONS.PAYOUTS_VIEW]);
      const fixture = await createClosureFixture(t, admin.userId);

      await expect(
        viewer.as.mutation(api.payouts.create, {
          closure_id: fixture.closureId,
          amount_paise: 100_000,
        }),
      ).rejects.toThrow("Missing permission: payouts.create");
      await expect(
        fixture.guard.as.mutation(api.payouts.create, {
          closure_id: fixture.closureId,
          amount_paise: 100_000,
        }),
      ).rejects.toThrow("Admin or OPS access required");

      const payout = await admin.as.mutation(api.payouts.create, {
        closure_id: fixture.closureId,
        amount_paise: 100_000,
      });
      expect(payout?.status).toBe(PAYOUT_STATUS.PENDING);
    });
  });

  describe("approve", () => {
    it("approves at the admin override, else the adjustment's final amount, else the original amount", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      // quality_score 80 is GOLD, whose 1.5x multiplier turns ₹1,000 into ₹1,500.
      const adjusted = await createClosureFixture(t, admin.userId, { qualityScore: 80 });
      const overridden = await createClosureFixture(t, admin.userId, { qualityScore: 80 });
      const legacy = await createClosureFixture(t, admin.userId, { qualityScore: 80 });

      const create = (closureId: Id<"closures">) =>
        admin.as.mutation(api.payouts.create, { closure_id: closureId, amount_paise: 100_000 });
      const adjustedPayout = await create(adjusted.closureId);
      const overriddenPayout = await create(overridden.closureId);
      const legacyPayout = await create(legacy.closureId);

      await admin.as.mutation(api.payouts.overrideAmount, {
        payout_id: overriddenPayout!._id,
        override_amount_paise: 120_000,
      });
      const [legacyAdjustment] = await getLiveAdjustment(t, legacyPayout!._id);
      await t.run(async (ctx) => {
        await ctx.db.patch(legacyAdjustment!._id, { is_deleted: true });
      });

      const approvedAdjusted = await admin.as.mutation(api.payouts.approve, {
        id: adjustedPayout!._id,
      });
      const approvedOverridden = await admin.as.mutation(api.payouts.approve, {
        id: overriddenPayout!._id,
      });
      const approvedLegacy = await admin.as.mutation(api.payouts.approve, {
        id: legacyPayout!._id,
      });

      expect(approvedAdjusted).toMatchObject({ status: "approved", amount_paise: 150_000 });
      expect(approvedOverridden).toMatchObject({ status: "approved", amount_paise: 120_000 });
      expect(approvedLegacy).toMatchObject({ status: "approved", amount_paise: 100_000 });
      expect(approvedAdjusted?.approved_by_admin_id).toBe(admin.userId);
      expect(approvedAdjusted?.approved_at).toBe(FIXED_NOW.getTime());
    });

    it.fails(
      "tells the guard the approved amount, not the pre-adjustment base (BUG-040)",
      async () => {
        const t = createTest();
        const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
        const fixture = await createClosureFixture(t, admin.userId, { qualityScore: 80 });
        const payout = await admin.as.mutation(api.payouts.create, {
          closure_id: fixture.closureId,
          amount_paise: 100_000,
        });

        const approved = await admin.as.mutation(api.payouts.approve, { id: payout!._id });
        expect(approved?.amount_paise).toBe(150_000);

        const [event] = await getScheduledEvents(t, "payout_approved");
        expect(event?.payload.amount_inr).toBe("Rs 1,500");
      },
    );
  });

  describe("fail", () => {
    it("requires a reason and leaves a failed payout terminal", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const fixture = await createClosureFixture(t, admin.userId);
      const payout = await admin.as.mutation(api.payouts.create, {
        closure_id: fixture.closureId,
        amount_paise: 100_000,
      });
      const id = payout!._id;

      await expect(
        admin.as.mutation(api.payouts.fail, { id, failure_reason: "x" }),
      ).rejects.toThrow("Cannot fail payout with status: pending");
      await admin.as.mutation(api.payouts.approve, { id });
      await expect(
        admin.as.mutation(api.payouts.fail, { id, failure_reason: "   " }),
      ).rejects.toThrow("failure_reason is required");

      const failed = await admin.as.mutation(api.payouts.fail, {
        id,
        failure_reason: " Bank rejected UPI handle ",
      });
      expect(failed).toMatchObject({
        status: "failed",
        failure_reason: "Bank rejected UPI handle",
      });

      await expect(admin.as.mutation(api.payouts.approve, { id })).rejects.toThrow(
        "Cannot approve payout with status: failed",
      );
      await expect(admin.as.mutation(api.payouts.disburse, { id })).rejects.toThrow(
        "Cannot disburse payout with status: failed",
      );
      await expect(admin.as.mutation(api.payouts.voidPayout, { id })).rejects.toThrow(
        "Cannot void payout with status: failed",
      );
    });
  });

  describe("disburse", () => {
    it("records the method, trimmed reference and time, and only from approved", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const fixture = await createClosureFixture(t, admin.userId);
      const payout = await admin.as.mutation(api.payouts.create, {
        closure_id: fixture.closureId,
        amount_paise: 100_000,
      });
      const id = payout!._id;

      await expect(admin.as.mutation(api.payouts.disburse, { id })).rejects.toThrow(
        "Cannot disburse payout with status: pending",
      );
      await admin.as.mutation(api.payouts.approve, { id });

      const disbursed = await admin.as.mutation(api.payouts.disburse, {
        id,
        payment_reference: "  UTR-9001 ",
        method: "UPI",
      });

      expect(disbursed).toMatchObject({
        status: "disbursed",
        payment_reference: "UTR-9001",
        method: "UPI",
        disbursed_at: FIXED_NOW.getTime(),
      });
    });

    it("tells the guard the creation-time reference when disbursing without a new one", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const fixture = await createClosureFixture(t, admin.userId);
      const payout = await admin.as.mutation(api.payouts.create, {
        closure_id: fixture.closureId,
        amount_paise: 100_000,
        payment_reference: "UTR-CREATE-7",
      });

      await admin.as.mutation(api.payouts.approve, { id: payout!._id });
      await admin.as.mutation(api.payouts.disburse, { id: payout!._id, method: "CASH" });

      const [event] = await getScheduledEvents(t, "payout_disbursed");
      expect(event?.payload.payment_ref).toBe("UTR-CREATE-7");
    });

    it.fails(
      "keeps the creation-time payment reference when disbursing without a new one (BUG-041)",
      async () => {
        const t = createTest();
        const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
        const fixture = await createClosureFixture(t, admin.userId);
        const payout = await admin.as.mutation(api.payouts.create, {
          closure_id: fixture.closureId,
          amount_paise: 100_000,
          payment_reference: "UTR-CREATE-7",
        });

        await admin.as.mutation(api.payouts.approve, { id: payout!._id });
        const disbursed = await admin.as.mutation(api.payouts.disburse, {
          id: payout!._id,
          method: "CASH",
        });

        expect(disbursed?.payment_reference).toBe("UTR-CREATE-7");
      },
    );
  });

  describe("getGuardEarnings", () => {
    it("hides pending amounts from the guard and totals only disbursed payouts", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const first = await createClosureFixture(t, admin.userId);
      const second = await createClosureFixture(t, admin.userId, { guard: first.guard });
      const third = await createClosureFixture(t, admin.userId, { guard: first.guard });

      const create = (closureId: Id<"closures">, amount: number) =>
        admin.as.mutation(api.payouts.create, { closure_id: closureId, amount_paise: amount });
      const pending = await create(first.closureId, 40_000);
      const disbursedA = await create(second.closureId, 100_000);
      const disbursedB = await create(third.closureId, 250_000);
      for (const payout of [disbursedA, disbursedB]) {
        await admin.as.mutation(api.payouts.approve, { id: payout!._id });
        await admin.as.mutation(api.payouts.disburse, { id: payout!._id, method: "UPI" });
      }

      const earnings = await first.guard.as.query(api.payouts.getGuardEarnings, {});

      expect(earnings.total_earned).toBe(350_000);
      expect(earnings.pending).toHaveLength(1);
      expect(earnings.pending[0]?.payout_id).toBe(pending!._id);
      expect(earnings.pending[0]).not.toHaveProperty("amount_paise");
      expect(earnings.disbursed.map((row) => row.amount_paise).sort()).toEqual([100_000, 250_000]);
      expect(earnings.failed).toEqual([]);
    });
  });

  describe("payoutTotals aggregate", () => {
    it("reports per-status counts and sums equal to the payouts table after every transition", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", PAYOUT_ADMIN_PERMISSIONS);
      const amounts = [10_000, 20_000, 30_000, 40_000, 50_000];
      const payoutIds: Id<"payouts">[] = [];
      for (const amount of amounts) {
        const fixture = await createClosureFixture(t, admin.userId);
        const payout = await admin.as.mutation(api.payouts.create, {
          closure_id: fixture.closureId,
          amount_paise: amount,
        });
        payoutIds.push(payout!._id);
      }
      // payoutIds[0] stays pending.
      const [, stayApproved, toDisburse, toFail, toVoid] = payoutIds as [
        Id<"payouts">,
        Id<"payouts">,
        Id<"payouts">,
        Id<"payouts">,
        Id<"payouts">,
      ];

      for (const id of [stayApproved, toDisburse, toFail]) {
        await admin.as.mutation(api.payouts.approve, { id });
      }
      await admin.as.mutation(api.payouts.disburse, { id: toDisburse, method: "BANK_TRANSFER" });
      await admin.as.mutation(api.payouts.fail, { id: toFail, failure_reason: "IFSC mismatch" });
      await admin.as.mutation(api.payouts.voidPayout, { id: toVoid, voided_reason: "duplicate" });

      const overview = await admin.as.query(api.analytics.getFinancialOverview, {
        time_window: "all_time",
      });
      const tableRows = await t.run(async (ctx) => ctx.db.query("payouts").collect());

      for (const status of Object.values(PAYOUT_STATUS)) {
        const rows = tableRows.filter((row) => row.status === status);
        expect(overview.payout_breakdown?.[status], status).toEqual({
          count: rows.length,
          total_paise: rows.reduce((sum, row) => sum + row.amount_paise, 0),
        });
      }
      expect(overview.total_payouts_paise).toBe(30_000);
    });
  });
});
