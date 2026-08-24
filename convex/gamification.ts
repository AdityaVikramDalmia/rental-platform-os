import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPE,
  BADGE_CODE_V3,
  INCENTIVE_PERSONA,
  PERMISSIONS,
  STREAK_MILESTONES,
  WEEKLY_TIER,
  WEEKLY_TIER_THRESHOLDS,
} from "../lib/constants";
import { requireAuth, requirePermission } from "./auth.helpers";
import { internalMutation, mutation, query } from "./functions";

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

type FunctionCtx = QueryCtx | MutationCtx;
type GamificationProfileDoc = Doc<"gamification_profiles">;
type GamificationPersona = GamificationProfileDoc["persona"];
type WeeklyTier = (typeof WEEKLY_TIER)[keyof typeof WEEKLY_TIER];
type BadgeCodeV3 = (typeof BADGE_CODE_V3)[keyof typeof BADGE_CODE_V3];
type StreakMilestoneBadgeName = Exclude<
  (typeof STREAK_MILESTONES)[keyof typeof STREAK_MILESTONES]["badge"],
  null
>;

const GAMIFICATION_XP_EVENT_LEDGER_ENTITY_TYPE = "gamification_xp_event";
const IST_TIMEZONE = "Asia/Kolkata";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getIstDateKey(timestampMs: number): string {
  const parts = IST_DATE_FORMATTER.formatToParts(new Date(timestampMs));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to derive IST date key");
  }

  return `${year}-${month}-${day}`;
}

function getISOWeekKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayOfWeek);

  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / ONE_DAY_MS + 1) / 7);

  return `${isoYear}-${String(weekNumber).padStart(2, "0")}`;
}

function getWeeklyTierFromXp(weeklyXp: number): WeeklyTier {
  if (weeklyXp >= WEEKLY_TIER_THRESHOLDS.PLATINUM) {
    return WEEKLY_TIER.PLATINUM;
  }

  if (weeklyXp >= WEEKLY_TIER_THRESHOLDS.GOLD) {
    return WEEKLY_TIER.GOLD;
  }

  if (weeklyXp >= WEEKLY_TIER_THRESHOLDS.SILVER) {
    return WEEKLY_TIER.SILVER;
  }

  return WEEKLY_TIER.BRONZE;
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return value;
}

function normalizeTotalXp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeLevel(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return 1;
  }

  return value;
}

function mapUserTypeToPersona(userType: Doc<"users">["user_type"]): GamificationPersona | null {
  if (userType === "GUARD") {
    return INCENTIVE_PERSONA.GUARD;
  }

  if (userType === "OPS") {
    return INCENTIVE_PERSONA.OPS;
  }

  if (userType === "TENANT") {
    return INCENTIVE_PERSONA.SALES;
  }

  if (userType === "OWNER") {
    return INCENTIVE_PERSONA.RM;
  }

  return null;
}

async function getProfileByUserAndPersona(
  ctx: FunctionCtx,
  userId: Id<"users">,
  persona: GamificationPersona,
): Promise<GamificationProfileDoc | null> {
  return await ctx.db
    .query("gamification_profiles")
    .withIndex("by_user_persona", (q) => q.eq("user_id", userId).eq("persona", persona))
    .first();
}

async function createProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  persona: GamificationPersona,
): Promise<GamificationProfileDoc> {
  const profileId = await ctx.db.insert("gamification_profiles", {
    user_id: userId,
    persona,
    xp_total: 0,
    level: 1,
    weekly_tier: WEEKLY_TIER.BRONZE,
    weekly_xp: 0,
    streak_days: 0,
    longest_streak: 0,
    streak_freezes_remaining: 1,
    streak_freezes_used_this_month: 0,
    badges: [],
    is_active: true,
    updated_at: Date.now(),
  });

  const profile = await ctx.db.get(profileId);
  if (!profile) {
    throw new Error("Failed to create gamification profile");
  }

  return profile;
}

async function ensureProfileRecord(
  ctx: MutationCtx,
  userId: Id<"users">,
  persona: GamificationPersona,
): Promise<GamificationProfileDoc> {
  const existing = await getProfileByUserAndPersona(ctx, userId, persona);
  if (existing) {
    return existing;
  }

  const raced = await getProfileByUserAndPersona(ctx, userId, persona);
  if (raced) {
    return raced;
  }

  return await createProfile(ctx, userId, persona);
}

async function recordDailyStreakActivity(
  ctx: MutationCtx,
  userId: Id<"users">,
  persona: GamificationPersona,
): Promise<void> {
  const profile = await ensureProfileRecord(ctx, userId, persona);
  const now = Date.now();
  const todayKey = getIstDateKey(now);

  if (profile.last_streak_date === todayKey) {
    return;
  }

  const yesterdayKey = getIstDateKey(now - ONE_DAY_MS);
  const nextStreakDays = profile.last_streak_date === yesterdayKey ? profile.streak_days + 1 : 1;

  await ctx.db.patch(profile._id, {
    streak_days: nextStreakDays,
    longest_streak: Math.max(profile.longest_streak, nextStreakDays),
    last_streak_date: todayKey,
    updated_at: now,
  });
}

async function getXpEventLedgerEntry(
  ctx: FunctionCtx,
  eventKey: string,
): Promise<Doc<"audit_logs"> | null> {
  return await ctx.db
    .query("audit_logs")
    .withIndex("by_entity", (q) =>
      q.eq("entity_type", GAMIFICATION_XP_EVENT_LEDGER_ENTITY_TYPE).eq("entity_id", eventKey),
    )
    .first();
}

async function markXpEventProcessed(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    persona: GamificationPersona;
    eventKey: string;
    xpAmount: number;
    reason: string | undefined;
  },
): Promise<void> {
  await ctx.db.insert("audit_logs", {
    actor_user_id: undefined,
    actor_type: AUDIT_ACTOR_TYPE.SYSTEM,
    action: AUDIT_ACTIONS.GAMIFICATION_PROFILES_UPDATE,
    entity_type: GAMIFICATION_XP_EVENT_LEDGER_ENTITY_TYPE,
    entity_id: args.eventKey,
    changes: undefined,
    metadata: {
      user_id: args.userId,
      persona: args.persona,
      xp_amount: args.xpAmount,
      reason: args.reason,
    },
  });
}

function formatCollisionMetadataValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assertMatchingXpEventMetadata(
  ledgerEntry: Doc<"audit_logs">,
  args: {
    eventKey: string;
    userId: Id<"users">;
    persona: GamificationPersona;
    xpAmount: number;
  },
): void {
  const metadata = ledgerEntry.metadata;
  const metadataRecord =
    metadata !== null && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : undefined;

  const existingUserId = metadataRecord?.user_id;
  const existingPersona = metadataRecord?.persona;
  const existingXpAmount = metadataRecord?.xp_amount;

  const mismatches: string[] = [];

  if (existingUserId !== args.userId) {
    mismatches.push(
      `user_id existing=${formatCollisionMetadataValue(existingUserId)} incoming=${formatCollisionMetadataValue(args.userId)}`,
    );
  }

  if (existingPersona !== args.persona) {
    mismatches.push(
      `persona existing=${formatCollisionMetadataValue(existingPersona)} incoming=${formatCollisionMetadataValue(args.persona)}`,
    );
  }

  if (existingXpAmount !== args.xpAmount) {
    mismatches.push(
      `xp_amount existing=${formatCollisionMetadataValue(existingXpAmount)} incoming=${formatCollisionMetadataValue(args.xpAmount)}`,
    );
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Event key collision for ${formatCollisionMetadataValue(args.eventKey)}: existing entry has different metadata (${mismatches.join(
        "; ",
      )}). This likely indicates a bug in event key generation.`,
    );
  }
}

async function patchProfileBadges(
  ctx: MutationCtx,
  profile: GamificationProfileDoc,
  badgesToAdd: string[],
): Promise<GamificationProfileDoc> {
  if (badgesToAdd.length === 0) {
    return profile;
  }

  const mergedBadges = Array.from(new Set([...profile.badges, ...badgesToAdd]));

  await ctx.db.patch(profile._id, {
    badges: mergedBadges,
    updated_at: Date.now(),
  });

  const updatedProfile = await ctx.db.get(profile._id);
  if (!updatedProfile) {
    throw new Error("Gamification profile not found after badge update");
  }

  return updatedProfile;
}

async function checkAndAwardLevelBadges(
  ctx: MutationCtx,
  profile: GamificationProfileDoc,
): Promise<void> {
  const levelBadges: Array<{ level: number; badge: BadgeCodeV3 }> = [
    { level: 10, badge: BADGE_CODE_V3.EXPERIENCED },
    { level: 30, badge: BADGE_CODE_V3.VETERAN },
    { level: 50, badge: BADGE_CODE_V3.ELITE },
    { level: 100, badge: BADGE_CODE_V3.LEGEND },
  ];

  const badgesToAdd = levelBadges
    .filter(({ level, badge }) => profile.level >= level && !profile.badges.includes(badge))
    .map(({ badge }) => badge);

  await patchProfileBadges(ctx, profile, badgesToAdd);
}

async function checkAndAwardStreakBadges(
  ctx: MutationCtx,
  profile: GamificationProfileDoc,
): Promise<void> {
  const streakBadgeByName: Record<StreakMilestoneBadgeName, BadgeCodeV3> = {
    WEEK_WARRIOR: BADGE_CODE_V3.WEEK_WARRIOR,
    MONTHLY_CHAMPION: BADGE_CODE_V3.MONTHLY_CHAMPION,
    DEDICATION: BADGE_CODE_V3.DEDICATION,
    CENTURY: BADGE_CODE_V3.CENTURY_STREAK,
    YEAR_OF_EXCELLENCE: BADGE_CODE_V3.YEAR_OF_EXCELLENCE,
  };

  const badgesToAdd: BadgeCodeV3[] = [];

  for (const [milestoneDaysRaw, milestoneConfig] of Object.entries(STREAK_MILESTONES)) {
    const milestoneDays = Number(milestoneDaysRaw);
    const milestoneBadge = milestoneConfig.badge;

    if (!milestoneBadge || profile.streak_days < milestoneDays) {
      continue;
    }

    const badgeCode = streakBadgeByName[milestoneBadge as StreakMilestoneBadgeName];
    if (!profile.badges.includes(badgeCode)) {
      badgesToAdd.push(badgeCode);
    }
  }

  await patchProfileBadges(ctx, profile, badgesToAdd);
}

export function xpToNextLevel(level: number): number {
  const normalizedLevel = normalizeLevel(level);
  return Math.floor(100 * Math.pow(normalizedLevel, 1.5));
}

export function getLevelFromTotalXp(totalXp: number): {
  level: number;
  xpInCurrentLevel: number;
  xpToNext: number;
  progressPercent: number;
} {
  let level = 1;
  let remainingXp = normalizeTotalXp(totalXp);

  while (true) {
    const xpRequired = xpToNextLevel(level);
    if (remainingXp < xpRequired) {
      const progressPercent = xpRequired > 0 ? (remainingXp / xpRequired) * 100 : 100;
      return {
        level,
        xpInCurrentLevel: remainingXp,
        xpToNext: xpRequired,
        progressPercent,
      };
    }

    remainingXp -= xpRequired;
    level += 1;
  }
}

export const ensureProfile = internalMutation({
  args: {
    user_id: v.id("users"),
    persona: incentivePersonaValidator,
  },
  handler: async (ctx, args) => {
    return await ensureProfileRecord(ctx, args.user_id, args.persona);
  },
});

export const awardBadge = internalMutation({
  args: {
    user_id: v.id("users"),
    persona: incentivePersonaValidator,
    badge_code: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfileRecord(ctx, args.user_id, args.persona);

    if (profile.badges.includes(args.badge_code)) {
      return profile;
    }

    return await patchProfileBadges(ctx, profile, [args.badge_code]);
  },
});

export const awardXp = internalMutation({
  args: {
    user_id: v.id("users"),
    persona: incentivePersonaValidator,
    xp_amount: v.number(),
    event_key: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const xpAmount = normalizePositiveInteger(args.xp_amount, "xp_amount");
    const eventKey = normalizeRequiredString(args.event_key, "event_key");
    const normalizedReason = normalizeOptionalString(args.reason);

    const processedEvent = await getXpEventLedgerEntry(ctx, eventKey);
    if (processedEvent) {
      assertMatchingXpEventMetadata(processedEvent, {
        eventKey,
        userId: args.user_id,
        persona: args.persona,
        xpAmount,
      });

      const existingProfile = await getProfileByUserAndPersona(ctx, args.user_id, args.persona);
      if (!existingProfile) {
        throw new Error("Gamification profile missing for processed XP event");
      }

      return existingProfile;
    }

    const profile = await ensureProfileRecord(ctx, args.user_id, args.persona);

    const racedProcessedEvent = await getXpEventLedgerEntry(ctx, eventKey);
    if (racedProcessedEvent) {
      assertMatchingXpEventMetadata(racedProcessedEvent, {
        eventKey,
        userId: args.user_id,
        persona: args.persona,
        xpAmount,
      });

      return profile;
    }

    // TODO(phase-32-round-2): move event-key dedup to a dedicated gamification XP ledger table.
    await markXpEventProcessed(ctx, {
      userId: args.user_id,
      persona: args.persona,
      eventKey,
      xpAmount,
      reason: normalizedReason,
    });

    const nextXpTotal = profile.xp_total + xpAmount;
    const nextWeeklyXp = profile.weekly_xp + xpAmount;
    const levelState = getLevelFromTotalXp(nextXpTotal);

    await ctx.db.patch(profile._id, {
      xp_total: nextXpTotal,
      weekly_xp: nextWeeklyXp,
      level: levelState.level,
      updated_at: Date.now(),
    });

    await recordDailyStreakActivity(ctx, args.user_id, args.persona);

    const updatedProfile = await ctx.db.get(profile._id);
    if (!updatedProfile) {
      throw new Error("Gamification profile not found after XP award");
    }

    await checkAndAwardLevelBadges(ctx, updatedProfile);

    const latestProfile = await ctx.db.get(profile._id);
    if (!latestProfile) {
      throw new Error("Gamification profile not found after badge checks");
    }

    return latestProfile;
  },
});

export const getProfile = query({
  args: {
    user_id: v.id("users"),
    persona: incentivePersonaValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GAMIFICATION_VIEW);
    return await getProfileByUserAndPersona(ctx, args.user_id, args.persona);
  },
});

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const persona = mapUserTypeToPersona(user.user_type);

    if (!persona) {
      return null;
    }

    return await getProfileByUserAndPersona(ctx, user._id, persona);
  },
});

export const recalculateWeeklyTiers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    if (now.getUTCDay() !== 0) {
      return { skipped: true, reason: "Not Sunday" };
    }

    const currentWeekKey = getISOWeekKey(Date.now());

    const activeProfiles = await ctx.db
      .query("gamification_profiles")
      .filter((q) => q.eq(q.field("is_active"), true))
      .collect();

    const tierDistribution: Record<WeeklyTier, number> = {
      [WEEKLY_TIER.BRONZE]: 0,
      [WEEKLY_TIER.SILVER]: 0,
      [WEEKLY_TIER.GOLD]: 0,
      [WEEKLY_TIER.PLATINUM]: 0,
    };

    const updatedAt = Date.now();
    let profilesProcessed = 0;

    for (const profile of activeProfiles) {
      if (profile.last_weekly_reset_week === currentWeekKey) {
        continue;
      }

      const weeklyTier = getWeeklyTierFromXp(profile.weekly_xp);
      tierDistribution[weeklyTier] += 1;

      await ctx.db.patch(profile._id, {
        weekly_tier: weeklyTier,
        weekly_xp: 0,
        last_weekly_reset_week: currentWeekKey,
        updated_at: updatedAt,
      });

      profilesProcessed += 1;
    }

    return {
      profiles_processed: profilesProcessed,
      tier_distribution: tierDistribution,
    };
  },
});

export const resetDailyQuests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const activeQuests = await ctx.db
      .query("gamification_quests")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();

    let questsEnded = 0;

    for (const quest of activeQuests) {
      if (quest.end_at < now) {
        await ctx.db.patch(quest._id, { status: "ENDED" });
        questsEnded += 1;
      }
    }

    return {
      quests_ended: questsEnded,
      progress_reset: 0,
    };
  },
});

export const checkDailyStreaks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const todayKey = getIstDateKey(now);
    const yesterdayKey = getIstDateKey(now - ONE_DAY_MS);

    const activeProfiles = await ctx.db
      .query("gamification_profiles")
      .filter((q) => q.and(q.eq(q.field("is_active"), true), q.gt(q.field("streak_days"), 0)))
      .collect();

    let freezesUsed = 0;
    let streaksBroken = 0;

    for (const profile of activeProfiles) {
      await checkAndAwardStreakBadges(ctx, profile);

      if (profile.last_streak_date === todayKey || profile.last_streak_date === yesterdayKey) {
        continue;
      }

      if (!profile.last_streak_date) {
        const nextLongestStreak = Math.max(profile.longest_streak, profile.streak_days);

        await ctx.db.patch(profile._id, {
          streak_days: 0,
          longest_streak: nextLongestStreak,
          updated_at: now,
        });

        streaksBroken += 1;
        continue;
      }

      if (profile.streak_freezes_remaining > 0) {
        await ctx.db.patch(profile._id, {
          streak_freezes_remaining: profile.streak_freezes_remaining - 1,
          streak_freezes_used_this_month: profile.streak_freezes_used_this_month + 1,
          updated_at: now,
        });

        freezesUsed += 1;
        continue;
      }

      const nextLongestStreak = Math.max(profile.longest_streak, profile.streak_days);

      await ctx.db.patch(profile._id, {
        streak_days: 0,
        longest_streak: nextLongestStreak,
        updated_at: now,
      });

      streaksBroken += 1;
    }

    return {
      checked: activeProfiles.length,
      freezes_used: freezesUsed,
      streaks_broken: streaksBroken,
    };
  },
});

export const refillMonthlyFreezes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (now.getUTCMonth() === tomorrow.getUTCMonth()) {
      return { skipped: true };
    }

    const activeProfiles = await ctx.db
      .query("gamification_profiles")
      .filter((q) => q.eq(q.field("is_active"), true))
      .collect();

    for (const profile of activeProfiles) {
      await ctx.db.patch(profile._id, {
        streak_freezes_remaining: Math.max(profile.streak_freezes_remaining, 1),
        streak_freezes_used_this_month: 0,
      });
    }

    return { profiles_refilled: activeProfiles.length };
  },
});

export const createQuest = mutation({
  args: {
    quest_code: v.string(),
    applicable_personas: v.array(incentivePersonaValidator),
    scope: v.union(v.literal("INDIVIDUAL"), v.literal("TEAM")),
    target_metric_key: v.string(),
    target_value: v.number(),
    reward_type: v.union(v.literal("XP"), v.literal("PAISE"), v.literal("PERK")),
    reward_value: v.number(),
    start_at: v.number(),
    end_at: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GAMIFICATION_MANAGE);

    if (args.start_at < 1e12 || args.end_at < 1e12) {
      throw new Error("start_at/end_at must be Unix milliseconds (>= 1e12)");
    }
    if (args.end_at <= args.start_at) {
      throw new Error("end_at must be after start_at");
    }
    if (args.target_value <= 0) {
      throw new Error("target_value must be positive");
    }
    if (args.reward_value <= 0) {
      throw new Error("reward_value must be positive");
    }
    if (args.reward_type === "PAISE" && !Number.isInteger(args.reward_value)) {
      throw new Error("reward_value must be an integer when reward_type is PAISE");
    }

    const questId = await ctx.db.insert("gamification_quests", {
      quest_code: args.quest_code,
      applicable_personas: args.applicable_personas,
      scope: args.scope,
      target_metric_key: args.target_metric_key,
      target_value: args.target_value,
      reward_type: args.reward_type,
      reward_value: args.reward_value,
      start_at: args.start_at,
      end_at: args.end_at,
      status: "ACTIVE",
    });

    return await ctx.db.get(questId);
  },
});

export const updateQuest = mutation({
  args: {
    id: v.id("gamification_quests"),
    quest_code: v.optional(v.string()),
    applicable_personas: v.optional(v.array(incentivePersonaValidator)),
    scope: v.optional(v.union(v.literal("INDIVIDUAL"), v.literal("TEAM"))),
    target_metric_key: v.optional(v.string()),
    target_value: v.optional(v.number()),
    reward_type: v.optional(v.union(v.literal("XP"), v.literal("PAISE"), v.literal("PERK"))),
    reward_value: v.optional(v.number()),
    start_at: v.optional(v.number()),
    end_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GAMIFICATION_MANAGE);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Quest not found");
    }

    if (args.target_value !== undefined && args.target_value <= 0) {
      throw new Error("target_value must be positive");
    }
    if (args.reward_value !== undefined && args.reward_value <= 0) {
      throw new Error("reward_value must be positive");
    }
    if (
      (args.start_at !== undefined && args.start_at < 1e12) ||
      (args.end_at !== undefined && args.end_at < 1e12)
    ) {
      throw new Error("start_at/end_at must be Unix milliseconds (>= 1e12)");
    }

    const effectiveRewardType = args.reward_type ?? existing.reward_type;
    const effectiveRewardValue = args.reward_value ?? existing.reward_value;
    if (effectiveRewardType === "PAISE" && !Number.isInteger(effectiveRewardValue)) {
      throw new Error("reward_value must be an integer when reward_type is PAISE");
    }

    const effectiveStart = args.start_at ?? existing.start_at;
    const effectiveEnd = args.end_at ?? existing.end_at;
    if (effectiveEnd <= effectiveStart) {
      throw new Error("end_at must be after start_at");
    }

    await ctx.db.patch(args.id, {
      ...(args.quest_code !== undefined ? { quest_code: args.quest_code } : {}),
      ...(args.applicable_personas !== undefined
        ? { applicable_personas: args.applicable_personas }
        : {}),
      ...(args.scope !== undefined ? { scope: args.scope } : {}),
      ...(args.target_metric_key !== undefined
        ? { target_metric_key: args.target_metric_key }
        : {}),
      ...(args.target_value !== undefined ? { target_value: args.target_value } : {}),
      ...(args.reward_type !== undefined ? { reward_type: args.reward_type } : {}),
      ...(args.reward_value !== undefined ? { reward_value: args.reward_value } : {}),
      ...(args.start_at !== undefined ? { start_at: args.start_at } : {}),
      ...(args.end_at !== undefined ? { end_at: args.end_at } : {}),
    });

    return await ctx.db.get(args.id);
  },
});

export const endQuest = mutation({
  args: {
    id: v.id("gamification_quests"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GAMIFICATION_MANAGE);

    const quest = await ctx.db.get(args.id);
    if (!quest) {
      throw new Error("Quest not found");
    }
    if (quest.status === "ENDED") {
      throw new Error("Quest is already ended");
    }

    await ctx.db.patch(args.id, { status: "ENDED" });
    return await ctx.db.get(args.id);
  },
});

export const listQuests = query({
  args: {
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("ENDED"))),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GAMIFICATION_VIEW);

    let quests: Doc<"gamification_quests">[];
    if (args.status) {
      const statusFilter = args.status;
      quests = await ctx.db
        .query("gamification_quests")
        .withIndex("by_status", (q) => q.eq("status", statusFilter))
        .collect();
    } else {
      quests = await ctx.db.query("gamification_quests").collect();
    }

    return quests.sort((a, b) => b.start_at - a.start_at);
  },
});

export const listProfiles = query({
  args: {
    persona: v.optional(incentivePersonaValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GAMIFICATION_VIEW);

    let profiles = await ctx.db
      .query("gamification_profiles")
      .filter((q) => q.eq(q.field("is_active"), true))
      .collect();

    if (args.persona) {
      profiles = profiles.filter((p) => p.persona === args.persona);
    }

    return await Promise.all(
      profiles.map(async (profile) => {
        const user = await ctx.db.get(profile.user_id);
        return {
          ...profile,
          user_name: user?.name ?? "Unknown",
          user_email: user?.email ?? null,
        };
      }),
    );
  },
});
