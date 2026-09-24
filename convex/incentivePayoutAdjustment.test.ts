// incentives.computePayoutAdjustment: suggested payout =
// max(0, round(base x tier multiplier) + streak bonus + task bonuses - penalties).
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayoutStatus } from "../lib/constants";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_adjustment";
process.env.WORKOS_API_KEY ??= "sk_test_adjustment";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_adjustment";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const FIXED_NOW = new Date("2026-06-15T08:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

type Components = Doc<"quality_score_history">["components"];

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

// Admin + guard (with profile) → lead → confirmed closure → payout row in `status`.
async function createGuardPayout(
  t: TestBackend,
  options: {
    qualityScore?: number;
    status?: PayoutStatus;
    baseAmount?: number;
    qualityFlags?: Doc<"leads">["quality_flags"];
    guardId?: Id<"users">;
  } = {},
) {
  sequence += 1;
  return await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      workos_user_id: `workos_adj_admin_${sequence}`,
      user_type: "ADMIN",
      name: "Adjustment admin",
      status: "ACTIVE",
      must_change_password: false,
    });
    const societyId = await ctx.db.insert("societies", {
      name: `Adjustment Society ${sequence}`,
      city: "Bengaluru",
      status: "ACTIVE",
      created_by_admin_id: adminId,
    });
    let guardId = options.guardId;
    if (!guardId) {
      guardId = await ctx.db.insert("users", {
        workos_user_id: `workos_adj_guard_${sequence}`,
        user_type: "GUARD",
        name: `Guard ${sequence}`,
        status: "ACTIVE",
        must_change_password: false,
      });
      await ctx.db.insert("guard_profiles", {
        user_id: guardId,
        society_id: societyId,
        guard_type: "MAIN_GATE",
        has_seen_onboarding: true,
        quality_score: options.qualityScore,
      });
    }
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Wing B",
      total_floors: 6,
      floor_labels: ["1"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "1",
      flat_number: `B-${sequence}`,
      owner_phone: "9555555555",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: guardId,
      status: "VERIFIED",
      quality_flags: options.qualityFlags,
    });
    const closureId = await ctx.db.insert("closures", {
      lead_id: leadId,
      move_in_date: FIXED_NOW.getTime(),
      status: "CONFIRMED",
      closed_by_admin_id: adminId,
    });
    const payoutId = await ctx.db.insert("payouts", {
      guard_user_id: guardId,
      lead_id: leadId,
      closure_id: closureId,
      amount_paise: options.baseAmount ?? 100_000,
      status: options.status ?? "pending",
      initiated_by_admin_id: adminId,
    });
    return { adminId, guardId, payoutId, baseAmount: options.baseAmount ?? 100_000 };
  });
}

async function compute(t: TestBackend, fixture: Awaited<ReturnType<typeof createGuardPayout>>) {
  const adjustment = await t.mutation(internal.incentives.computePayoutAdjustment, {
    payout_id: fixture.payoutId,
    guard_user_id: fixture.guardId,
    base_amount_paise: fixture.baseAmount,
  });
  return adjustment!;
}

async function addQualityHistory(
  t: TestBackend,
  guardId: Id<"users">,
  entries: Array<{ score: number; components: Components; ageDays: number }>,
) {
  await t.run(async (ctx) => {
    for (const entry of entries) {
      await ctx.db.insert("quality_score_history", {
        guard_user_id: guardId,
        score: entry.score,
        components: entry.components,
        trigger: "CRON_DAILY",
        tier: "BRONZE",
        computed_at: FIXED_NOW.getTime() - entry.ageDays * DAY_MS,
        is_deleted: false,
      });
    }
  });
}

async function addActiveStreak(t: TestBackend, guardId: Id<"users">, count: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("guard_streaks", {
      guard_user_id: guardId,
      streak_type: "DAILY_ACTIVE",
      current_count: count,
      longest_count: count,
      is_active: true,
      last_activity_date: "2026-06-14",
      started_at: FIXED_NOW.getTime() - count * DAY_MS,
      updated_at: FIXED_NOW.getTime() - DAY_MS,
      is_deleted: false,
    });
  });
}

const neutralComponents: Components = {
  checklist: 50,
  photo: 50,
  speed: 50,
  verification: 50,
  document: 50,
};

describe("incentives.computePayoutAdjustment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("multiplies the base by the quality tier: 1x below 50, 1.25x, 1.5x from 75, 2x from 90", async () => {
    const t = createTest();
    const expectations: Array<[number, string, number, number]> = [
      [49, "BRONZE", 1, 100_001],
      [50, "SILVER", 1.25, 125_001],
      [74, "SILVER", 1.25, 125_001],
      [75, "GOLD", 1.5, 150_002],
      [89, "GOLD", 1.5, 150_002],
      [90, "PLATINUM", 2, 200_002],
    ];

    for (const [score, tier, multiplier, total] of expectations) {
      const fixture = await createGuardPayout(t, { qualityScore: score, baseAmount: 100_001 });
      const adjustment = await compute(t, fixture);

      expect(adjustment, `score ${score}`).toMatchObject({
        quality_tier: tier,
        quality_multiplier: multiplier,
        suggested_total_paise: total,
        final_amount_paise: total,
        streak_bonus_paise: 0,
        task_bonuses: [],
        penalties: [],
      });
    }
  });

  it("reads tier thresholds from system_config and falls back to the latest history score", async () => {
    const t = createTest();
    const fixture = await createGuardPayout(t, { qualityScore: undefined });
    await addQualityHistory(t, fixture.guardId, [
      { score: 45, components: neutralComponents, ageDays: 1 },
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("system_config", {
        key: "quality_tier_silver_min",
        value: "40",
        updated_by_admin_id: fixture.adminId,
      });
    });

    const adjustment = await compute(t, fixture);

    expect(adjustment).toMatchObject({
      quality_score: 45,
      quality_tier: "SILVER",
      suggested_total_paise: 125_000,
    });
  });

  it("adds the highest streak milestone bonus reached, once per streak", async () => {
    const t = createTest();
    const first = await createGuardPayout(t, { qualityScore: 0 });
    await addActiveStreak(t, first.guardId, 8);
    const second = await createGuardPayout(t, { guardId: first.guardId });

    const firstAdjustment = await compute(t, first);
    const secondAdjustment = await compute(t, second);

    // An 8-day streak has passed the 3- and 7-day milestones; the 7-day bonus is ₹500.
    expect(firstAdjustment).toMatchObject({
      streak_bonus_paise: 50_000,
      final_amount_paise: 150_000,
    });
    expect(secondAdjustment).toMatchObject({ streak_bonus_paise: 0, final_amount_paise: 100_000 });
  });

  it("adds percentage task bonuses from the latest quality components", async () => {
    const t = createTest();
    const fixture = await createGuardPayout(t, { qualityScore: 0, baseAmount: 200_000 });
    await addQualityHistory(t, fixture.guardId, [
      { score: 10, components: neutralComponents, ageDays: 3 },
      {
        score: 10,
        components: { checklist: 60, photo: 95, speed: 80, verification: 50, document: 92 },
        ageDays: 1,
      },
    ]);

    const adjustment = await compute(t, fixture);

    expect(adjustment.task_bonuses.map((bonus) => [bonus.bonus_type, bonus.amount_paise])).toEqual([
      ["ALL_GPS_PHOTOS", 10_000],
      ["WITHIN_SLA", 20_000],
      ["ALL_REQUIRED_DOCS", 30_000],
    ]);
    expect(adjustment).toMatchObject({
      task_bonuses_total_paise: 60_000,
      penalty_total_paise: 0,
      final_amount_paise: 260_000,
    });
  });

  it("floors the total at zero when penalties exceed the adjusted base", async () => {
    const t = createTest();
    const fixture = await createGuardPayout(t, {
      qualityScore: 0,
      baseAmount: 50_000,
      qualityFlags: ["DUPLICATE_PHONE_MATCH"],
    });
    const poor: Components = {
      checklist: 20,
      photo: 10,
      speed: 50,
      verification: 50,
      document: 50,
    };
    await addQualityHistory(t, fixture.guardId, [
      { score: 35, components: poor, ageDays: 3 },
      { score: 20, components: poor, ageDays: 2 },
      { score: 10, components: poor, ageDays: 1 },
    ]);

    const adjustment = await compute(t, fixture);

    expect(
      adjustment.penalties.map((penalty) => [penalty.penalty_type, penalty.amount_paise]),
    ).toEqual([
      ["LOW_COMPLETENESS", 50_000],
      ["MISSING_PHOTOS", 30_000],
      ["FALSE_LEAD", 100_000],
      ["CONSECUTIVE_POOR", 50_000],
    ]);
    expect(adjustment).toMatchObject({
      penalty_total_paise: 230_000,
      suggested_total_paise: 0,
      final_amount_paise: 0,
    });
  });

  it("keeps exactly one live adjustment per payout after a recompute", async () => {
    const t = createTest();
    const fixture = await createGuardPayout(t, { qualityScore: 80 });

    const first = await compute(t, fixture);
    vi.setSystemTime(FIXED_NOW.getTime() + 5_000);
    const second = await compute(t, fixture);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("payout_adjustments")
        .withIndex("by_payout", (q) => q.eq("payout_id", fixture.payoutId))
        .collect(),
    );
    const live = rows.filter((row) => !row.is_deleted);
    expect(rows).toHaveLength(2);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ _id: second._id, computed_at: FIXED_NOW.getTime() + 5_000 });
    expect(rows.find((row) => row._id === first._id)?.is_deleted).toBe(true);
  });

  it.fails(
    "keeps the streak bonus when recomputing the payout that already received it (BUG-042)",
    async () => {
      const t = createTest();
      const fixture = await createGuardPayout(t, { qualityScore: 0 });
      await addActiveStreak(t, fixture.guardId, 3);

      const first = await compute(t, fixture);
      expect(first.streak_bonus_paise).toBe(20_000);

      const recomputed = await compute(t, fixture);
      expect(recomputed.streak_bonus_paise).toBe(20_000);
    },
  );

  it("refuses disbursed, failed and voided payouts and a mismatched guard", async () => {
    const t = createTest();

    for (const status of ["disbursed", "failed", "voided"] as const) {
      const fixture = await createGuardPayout(t, { qualityScore: 0, status });
      await expect(compute(t, fixture)).rejects.toThrow(
        "Cannot compute payout adjustment for a finalized payout",
      );
    }

    const pending = await createGuardPayout(t, { qualityScore: 0 });
    const other = await createGuardPayout(t, { qualityScore: 0 });
    await expect(
      t.mutation(internal.incentives.computePayoutAdjustment, {
        payout_id: pending.payoutId,
        guard_user_id: other.guardId,
        base_amount_paise: 100_000,
      }),
    ).rejects.toThrow("guard_user_id does not match payout guard");

    const adjustments = await t.run(async (ctx) => ctx.db.query("payout_adjustments").collect());
    expect(adjustments).toEqual([]);
  });
});
