// Referral milestones: trigger -> approve -> paid / void, the referral status derived from
// them, and the referrer's paid-earnings summary.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_milestones";
process.env.WORKOS_API_KEY ??= "sk_test_authz";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_milestones";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const FIXED_NOW = new Date("2026-07-01T12:00:00.000Z");

type MilestoneType = Doc<"referral_milestones">["milestone_type"];
type MilestoneStatus = Doc<"referral_milestones">["status"];
type ReferralStatus = Doc<"referrals">["status"];

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
  const workosUserId = `workos_milestone_${userType.toLowerCase()}_${sequence}`;

  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} milestone ${sequence}`,
      email: `${workosUserId}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });

    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Milestone role ${sequence}`,
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

// A TENANT_FINDING referral between two tenants with the given milestones.
async function createReferral(
  t: TestBackend,
  referrerId: Id<"users">,
  status: ReferralStatus,
  milestones: Array<{ type: MilestoneType; status: MilestoneStatus; amount: number }>,
) {
  const referred = await createUser(t, "TENANT");
  return await t.run(async (ctx) => {
    const referralId = await ctx.db.insert("referrals", {
      referrer_user_id: referrerId,
      referred_user_id: referred.userId,
      referral_type: "TENANT_FINDING",
      status,
    });
    const milestoneIds: Partial<Record<MilestoneType, Id<"referral_milestones">>> = {};
    for (const milestone of milestones) {
      milestoneIds[milestone.type] = await ctx.db.insert("referral_milestones", {
        referral_id: referralId,
        milestone_type: milestone.type,
        amount: milestone.amount,
        status: milestone.status,
      });
    }
    return { referralId, milestoneIds };
  });
}

async function referralStatus(t: TestBackend, referralId: Id<"referrals">) {
  return (await t.run(async (ctx) => ctx.db.get(referralId)))!.status;
}

const STANDARD_MILESTONES: Array<{ type: MilestoneType; status: MilestoneStatus; amount: number }> =
  [
    { type: "SIGN_UP", status: "TRIGGERED", amount: 20_000 },
    { type: "LISTING_PUBLISHED", status: "PENDING", amount: 30_000 },
    { type: "DEAL_CLOSED", status: "PENDING", amount: 70_000 },
  ];

describe("referralMilestones", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("trigger", () => {
    it("triggers a pending milestone once per source event and qualifies a pending referral", async () => {
      const t = createTest();
      const referrer = await createUser(t, "TENANT");
      const { referralId, milestoneIds } = await createReferral(t, referrer.userId, "PENDING", [
        { type: "LISTING_PUBLISHED", status: "PENDING", amount: 30_000 },
      ]);

      const triggered = await t.mutation(internal.referralMilestones.trigger, {
        referral_id: referralId,
        milestone_type: "LISTING_PUBLISHED",
        source_event: "listing:published:1",
      });
      const replay = await t.mutation(internal.referralMilestones.trigger, {
        referral_id: referralId,
        milestone_type: "LISTING_PUBLISHED",
        source_event: "listing:published:1",
      });

      expect(triggered).toBe(milestoneIds.LISTING_PUBLISHED);
      expect(replay).toBeNull();
      const milestone = await t.run(async (ctx) => ctx.db.get(milestoneIds.LISTING_PUBLISHED!));
      expect(milestone).toMatchObject({
        status: "TRIGGERED",
        source_event: "listing:published:1",
        triggered_at: FIXED_NOW.getTime(),
      });
      expect(await referralStatus(t, referralId)).toBe("QUALIFIED");
    });

    it("ignores milestones on a voided referral", async () => {
      const t = createTest();
      const referrer = await createUser(t, "TENANT");
      const { referralId, milestoneIds } = await createReferral(t, referrer.userId, "VOIDED", [
        { type: "DEAL_CLOSED", status: "PENDING", amount: 70_000 },
      ]);

      const result = await t.mutation(internal.referralMilestones.trigger, {
        referral_id: referralId,
        milestone_type: "DEAL_CLOSED",
        source_event: "closure:1",
      });

      expect(result).toBeNull();
      const milestone = await t.run(async (ctx) => ctx.db.get(milestoneIds.DEAL_CLOSED!));
      expect(milestone?.status).toBe("PENDING");
    });
  });

  describe("approve and markPaid", () => {
    it("pays only approved milestones and derives PARTIALLY_PAID then FULLY_PAID", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", [PERMISSIONS.REFERRALS_APPROVE_PAYOUT]);
      const referrer = await createUser(t, "TENANT");
      const { referralId, milestoneIds } = await createReferral(t, referrer.userId, "QUALIFIED", [
        { type: "SIGN_UP", status: "TRIGGERED", amount: 20_000 },
        { type: "DEAL_CLOSED", status: "PENDING", amount: 70_000 },
      ]);
      const signUp = milestoneIds.SIGN_UP!;
      const dealClosed = milestoneIds.DEAL_CLOSED!;

      await expect(
        admin.as.mutation(api.referralMilestones.markPaid, { id: signUp, payout_method: "UPI" }),
      ).rejects.toThrow("Invalid milestone transition: TRIGGERED -> PAID");
      await expect(
        admin.as.mutation(api.referralMilestones.approve, { id: dealClosed }),
      ).rejects.toThrow("Invalid milestone transition: PENDING -> APPROVED");

      const approved = await admin.as.mutation(api.referralMilestones.approve, { id: signUp });
      expect(approved).toMatchObject({ status: "APPROVED", approved_by_admin_id: admin.userId });
      const paid = await admin.as.mutation(api.referralMilestones.markPaid, {
        id: signUp,
        payout_method: "UPI",
      });
      expect(paid).toMatchObject({
        status: "PAID",
        payout_method: "UPI",
        paid_at: FIXED_NOW.getTime(),
      });
      expect(await referralStatus(t, referralId)).toBe("PARTIALLY_PAID");

      await t.mutation(internal.referralMilestones.trigger, {
        referral_id: referralId,
        milestone_type: "DEAL_CLOSED",
        source_event: "closure:77",
      });
      await admin.as.mutation(api.referralMilestones.approve, { id: dealClosed });
      await admin.as.mutation(api.referralMilestones.markPaid, {
        id: dealClosed,
        payout_method: "BANK_TRANSFER",
      });
      expect(await referralStatus(t, referralId)).toBe("FULLY_PAID");
    });

    it("rejects callers without referrals.approve_payout while the permitted admin still pays", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", [PERMISSIONS.REFERRALS_APPROVE_PAYOUT]);
      const manager = await createUser(t, "ADMIN", [PERMISSIONS.REFERRALS_MANAGE]);
      const referrer = await createUser(t, "TENANT");
      const { milestoneIds } = await createReferral(t, referrer.userId, "QUALIFIED", [
        { type: "SIGN_UP", status: "APPROVED", amount: 20_000 },
      ]);
      const id = milestoneIds.SIGN_UP!;

      await expect(
        manager.as.mutation(api.referralMilestones.markPaid, { id, payout_method: "CASH" }),
      ).rejects.toThrow("Missing permission: referrals.approve_payout");
      await expect(
        referrer.as.mutation(api.referralMilestones.markPaid, { id, payout_method: "CASH" }),
      ).rejects.toThrow("Admin or OPS access required");

      const paid = await admin.as.mutation(api.referralMilestones.markPaid, {
        id,
        payout_method: "CASH",
      });
      expect(paid?.status).toBe("PAID");
    });
  });

  describe("voidMilestone", () => {
    it("requires a reason and never voids a paid milestone", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", [PERMISSIONS.REFERRALS_MANAGE]);
      const referrer = await createUser(t, "TENANT");
      const { milestoneIds } = await createReferral(t, referrer.userId, "PARTIALLY_PAID", [
        { type: "SIGN_UP", status: "PAID", amount: 20_000 },
        { type: "LISTING_PUBLISHED", status: "TRIGGERED", amount: 30_000 },
      ]);

      await expect(
        admin.as.mutation(api.referralMilestones.voidMilestone, {
          id: milestoneIds.SIGN_UP!,
          reason: "fraud",
        }),
      ).rejects.toThrow("Cannot void a paid milestone");
      await expect(
        admin.as.mutation(api.referralMilestones.voidMilestone, {
          id: milestoneIds.LISTING_PUBLISHED!,
          reason: "   ",
        }),
      ).rejects.toThrow("reason is required");

      const voided = await admin.as.mutation(api.referralMilestones.voidMilestone, {
        id: milestoneIds.LISTING_PUBLISHED!,
        reason: " listing withdrawn ",
      });
      expect(voided).toMatchObject({ status: "VOIDED", voided_reason: "listing withdrawn" });
    });

    it.fails(
      "marks the referral FULLY_PAID once every milestone that was not voided is paid (BUG-044)",
      async () => {
        const t = createTest();
        const admin = await createUser(t, "ADMIN", [
          PERMISSIONS.REFERRALS_MANAGE,
          PERMISSIONS.REFERRALS_APPROVE_PAYOUT,
        ]);
        const referrer = await createUser(t, "TENANT");
        const { referralId, milestoneIds } = await createReferral(
          t,
          referrer.userId,
          "QUALIFIED",
          STANDARD_MILESTONES,
        );

        // The deal fell through, so its milestone is voided; the other two are paid.
        await admin.as.mutation(api.referralMilestones.voidMilestone, {
          id: milestoneIds.DEAL_CLOSED!,
          reason: "deal cancelled",
        });
        await t.mutation(internal.referralMilestones.trigger, {
          referral_id: referralId,
          milestone_type: "LISTING_PUBLISHED",
          source_event: "listing:9",
        });
        for (const id of [milestoneIds.SIGN_UP!, milestoneIds.LISTING_PUBLISHED!]) {
          await admin.as.mutation(api.referralMilestones.approve, { id });
          await admin.as.mutation(api.referralMilestones.markPaid, { id, payout_method: "UPI" });
        }

        expect(await referralStatus(t, referralId)).toBe("FULLY_PAID");
      },
    );
  });

  describe("getEarningsSummary", () => {
    it("sums paid milestones by type across the caller's non-voided referrals only", async () => {
      const t = createTest();
      const referrer = await createUser(t, "TENANT");
      const stranger = await createUser(t, "TENANT");
      await createReferral(t, referrer.userId, "PARTIALLY_PAID", [
        { type: "SIGN_UP", status: "PAID", amount: 20_000 },
        { type: "LISTING_PUBLISHED", status: "PAID", amount: 30_000 },
        { type: "DEAL_CLOSED", status: "APPROVED", amount: 70_000 },
      ]);
      await createReferral(t, referrer.userId, "FULLY_PAID", [
        { type: "DEAL_CLOSED", status: "PAID", amount: 70_000 },
      ]);
      await createReferral(t, referrer.userId, "VOIDED", [
        { type: "SIGN_UP", status: "PAID", amount: 20_000 },
      ]);

      const summary = await referrer.as.query(api.referralMilestones.getEarningsSummary, {
        user_id: referrer.userId,
      });

      expect(summary).toEqual({
        sign_up_bonus_paid_paise: 20_000,
        listing_bonus_paid_paise: 30_000,
        closure_bonus_paid_paise: 70_000,
        first_verified_lead_bonus_paid_paise: 0,
        total_earned_paid_paise: 120_000,
      });
      await expect(
        stranger.as.query(api.referralMilestones.getEarningsSummary, { user_id: referrer.userId }),
      ).rejects.toThrow("You can only view your own referral earnings summary");
    });
  });
});
