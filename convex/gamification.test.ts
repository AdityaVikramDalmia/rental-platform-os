// Gamification daily-streak cron (checkDailyStreaks), streak freezes and their monthly refill,
// and XP awards keyed by event. Dates are IST calendar days; the cron fires at 18:34 UTC,
// which is 00:04 IST on the next day.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_gamification";
process.env.WORKOS_API_KEY ??= "sk_test_authz";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_gamification";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

// 2026-03-10 00:04 IST: "today" is 2026-03-10 and "yesterday" is 2026-03-09.
const STREAK_CRON_RUN = new Date("2026-03-09T18:34:00.000Z");

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTest>;
type ProfileOverrides = Partial<
  Pick<
    Doc<"gamification_profiles">,
    | "streak_days"
    | "last_streak_date"
    | "longest_streak"
    | "streak_freezes_remaining"
    | "streak_freezes_used_this_month"
    | "badges"
    | "is_active"
  >
>;

let sequence = 0;

async function createGuardProfile(t: TestBackend, overrides: ProfileOverrides = {}) {
  sequence += 1;
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      workos_user_id: `workos_gam_guard_${sequence}`,
      user_type: "GUARD",
      name: `Streak guard ${sequence}`,
      status: "ACTIVE",
      must_change_password: false,
    });
    const profileId = await ctx.db.insert("gamification_profiles", {
      user_id: userId,
      persona: "GUARD",
      xp_total: 0,
      level: 1,
      weekly_tier: "BRONZE",
      weekly_xp: 0,
      streak_days: 0,
      longest_streak: 0,
      streak_freezes_remaining: 1,
      streak_freezes_used_this_month: 0,
      badges: [],
      is_active: true,
      updated_at: 0,
      ...overrides,
    });
    return { userId, profileId };
  });
}

async function getProfile(t: TestBackend, profileId: Id<"gamification_profiles">) {
  return (await t.run(async (ctx) => ctx.db.get(profileId)))!;
}

describe("gamification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(STREAK_CRON_RUN);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkDailyStreaks", () => {
    it("leaves streaks active today or yesterday alone and breaks one with no recorded day", async () => {
      const t = createTest();
      const activeToday = await createGuardProfile(t, {
        streak_days: 3,
        longest_streak: 3,
        last_streak_date: "2026-03-10",
      });
      const activeYesterday = await createGuardProfile(t, {
        streak_days: 4,
        longest_streak: 4,
        last_streak_date: "2026-03-09",
      });
      const undated = await createGuardProfile(t, { streak_days: 6, longest_streak: 2 });
      await createGuardProfile(t, { streak_days: 0, last_streak_date: "2026-01-01" });

      const result = await t.mutation(internal.gamification.checkDailyStreaks, {});

      expect(result).toEqual({ checked: 3, freezes_used: 0, streaks_broken: 1 });
      expect((await getProfile(t, activeToday.profileId)).streak_days).toBe(3);
      expect((await getProfile(t, activeYesterday.profileId)).streak_days).toBe(4);
      expect(await getProfile(t, undated.profileId)).toMatchObject({
        streak_days: 0,
        longest_streak: 6,
      });
    });

    it("spends one freeze on a missed day and keeps the streak count", async () => {
      const t = createTest();
      const guard = await createGuardProfile(t, {
        streak_days: 5,
        longest_streak: 9,
        last_streak_date: "2026-03-08",
        streak_freezes_remaining: 2,
      });

      const result = await t.mutation(internal.gamification.checkDailyStreaks, {});

      expect(result).toEqual({ checked: 1, freezes_used: 1, streaks_broken: 0 });
      expect(await getProfile(t, guard.profileId)).toMatchObject({
        streak_days: 5,
        streak_freezes_remaining: 1,
        streak_freezes_used_this_month: 1,
        last_streak_date: "2026-03-08",
      });
    });

    it("resets a missed-day streak once no freeze is left, keeping the longest streak", async () => {
      const t = createTest();
      const guard = await createGuardProfile(t, {
        streak_days: 12,
        longest_streak: 10,
        last_streak_date: "2026-03-07",
        streak_freezes_remaining: 0,
      });

      const result = await t.mutation(internal.gamification.checkDailyStreaks, {});

      expect(result).toEqual({ checked: 1, freezes_used: 0, streaks_broken: 1 });
      expect(await getProfile(t, guard.profileId)).toMatchObject({
        streak_days: 0,
        longest_streak: 12,
        streak_freezes_remaining: 0,
      });
    });

    it.fails(
      "continues a freeze-covered streak when the guard is active the next day (BUG-043)",
      async () => {
        const t = createTest();
        const guard = await createGuardProfile(t, {
          streak_days: 5,
          longest_streak: 5,
          last_streak_date: "2026-03-08",
          streak_freezes_remaining: 1,
        });

        // 00:04 IST on 2026-03-10: 2026-03-09 was missed and the freeze covers it.
        await t.mutation(internal.gamification.checkDailyStreaks, {});
        expect((await getProfile(t, guard.profileId)).streak_freezes_remaining).toBe(0);

        // Same IST day, 10:00: the guard earns XP again.
        vi.setSystemTime(new Date("2026-03-10T04:30:00.000Z"));
        await t.mutation(internal.gamification.awardXp, {
          user_id: guard.userId,
          persona: "GUARD",
          xp_amount: 10,
          event_key: "visit:after-freeze",
        });

        expect((await getProfile(t, guard.profileId)).streak_days).toBe(6);
      },
    );

    it("awards the WEEK_WARRIOR badge once a streak reaches seven days, without duplicates", async () => {
      const t = createTest();
      const guard = await createGuardProfile(t, {
        streak_days: 7,
        longest_streak: 7,
        last_streak_date: "2026-03-09",
        badges: ["FIRST_CLOSURE"],
      });

      await t.mutation(internal.gamification.checkDailyStreaks, {});
      await t.mutation(internal.gamification.checkDailyStreaks, {});

      expect((await getProfile(t, guard.profileId)).badges).toEqual([
        "FIRST_CLOSURE",
        "WEEK_WARRIOR",
      ]);
    });
  });

  describe("refillMonthlyFreezes", () => {
    it("does nothing except on the last UTC day of the month", async () => {
      const t = createTest();
      const guard = await createGuardProfile(t, {
        streak_freezes_remaining: 0,
        streak_freezes_used_this_month: 3,
      });

      vi.setSystemTime(new Date("2026-03-30T18:36:00.000Z"));
      const result = await t.mutation(internal.gamification.refillMonthlyFreezes, {});

      expect(result).toEqual({ skipped: true });
      expect(await getProfile(t, guard.profileId)).toMatchObject({
        streak_freezes_remaining: 0,
        streak_freezes_used_this_month: 3,
      });
    });

    it("tops active profiles up to at least one freeze and clears the monthly usage", async () => {
      const t = createTest();
      const empty = await createGuardProfile(t, {
        streak_freezes_remaining: 0,
        streak_freezes_used_this_month: 2,
      });
      const stocked = await createGuardProfile(t, {
        streak_freezes_remaining: 3,
        streak_freezes_used_this_month: 1,
      });
      const inactive = await createGuardProfile(t, {
        streak_freezes_remaining: 0,
        streak_freezes_used_this_month: 4,
        is_active: false,
      });

      vi.setSystemTime(new Date("2026-03-31T18:36:00.000Z"));
      const result = await t.mutation(internal.gamification.refillMonthlyFreezes, {});

      expect(result).toEqual({ profiles_refilled: 2 });
      expect(await getProfile(t, empty.profileId)).toMatchObject({
        streak_freezes_remaining: 1,
        streak_freezes_used_this_month: 0,
      });
      expect(await getProfile(t, stocked.profileId)).toMatchObject({
        streak_freezes_remaining: 3,
        streak_freezes_used_this_month: 0,
      });
      expect(await getProfile(t, inactive.profileId)).toMatchObject({
        streak_freezes_remaining: 0,
        streak_freezes_used_this_month: 4,
      });
    });
  });

  describe("awardXp", () => {
    it("credits an event key once and rejects the same key reused with a different amount", async () => {
      const t = createTest();
      const guard = await createGuardProfile(t);
      const award = (xp: number) =>
        t.mutation(internal.gamification.awardXp, {
          user_id: guard.userId,
          persona: "GUARD",
          xp_amount: xp,
          event_key: "closure:abc",
        });

      const first = await award(120);
      const replay = await award(120);

      // Level 1 needs 100 XP, so 120 XP is level 2 with 20 XP carried over.
      expect(first).toMatchObject({ xp_total: 120, weekly_xp: 120, level: 2 });
      expect(replay).toMatchObject({ xp_total: 120, level: 2 });
      await expect(award(500)).rejects.toThrow('Event key collision for "closure:abc"');
      expect((await getProfile(t, guard.profileId)).xp_total).toBe(120);
    });
  });
});
