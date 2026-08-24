import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { SYSTEM_CONFIG_KEYS } from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery } from "./functions";

type IncentiveV3FeatureFlags = {
  shadow_mode?: boolean;
  split_preview_enabled?: boolean;
  disbursement_enabled?: boolean;
  gamification_enabled?: boolean;
};

function parseFeatureFlags(value: string | undefined): IncentiveV3FeatureFlags {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as IncentiveV3FeatureFlags;
  } catch {
    return {};
  }
}

export const getMigrationReadiness = internalQuery({
  args: {},
  handler: async (ctx) => {
    const featureFlagConfig = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS))
      .first();

    const featureFlags = parseFeatureFlags(featureFlagConfig?.value);

    const gamificationReady = featureFlags.gamification_enabled === true;
    const disbursementReady = featureFlags.disbursement_enabled === true;

    return {
      feature_flags: featureFlags,
      gamification_ready: gamificationReady,
      disbursement_ready: disbursementReady,
      reasons: {
        gamification: gamificationReady
          ? []
          : [
              "gamification_profiles table is not in schema yet (planned for Phase 32 E04)",
              "Set incentive_v3_feature_flags.gamification_enabled=true only after E04 is complete",
            ],
        disbursement: disbursementReady
          ? []
          : [
              "incentive_disbursements table is not in schema yet (planned for Phase 32 E03)",
              "Set incentive_v3_feature_flags.disbursement_enabled=true only after E03 is complete",
            ],
      },
    };
  },
});

export const listQualityHistoryBatch = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quality_score_history")
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

const incentiveCardStatusValidator = v.union(v.literal("active"), v.literal("redeemed"));

export const listIncentiveCardsBatch = internalQuery({
  args: {
    status: incentiveCardStatusValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("incentive_cards")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const listActiveStreaksByGuards = internalQuery({
  args: {
    guard_user_ids: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const guardIds = [...new Set(args.guard_user_ids)];

    const streakRows = await Promise.all(
      guardIds.map(async (guardId) => {
        const rows = await ctx.db
          .query("guard_streaks")
          .withIndex("by_guard", (q) => q.eq("guard_user_id", guardId))
          .filter((q) =>
            q.and(q.eq(q.field("is_active"), true), q.neq(q.field("is_deleted"), true)),
          )
          .collect();

        const currentStreakDays = rows.reduce((maxCount, row) => {
          return Math.max(maxCount, row.current_count);
        }, 0);

        return {
          guard_user_id: guardId,
          current_streak_days: currentStreakDays,
        };
      }),
    );

    return streakRows;
  },
});

export const getGuardUserTypeMap = internalQuery({
  args: {
    user_ids: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userIds = [...new Set(args.user_ids)];

    const rows = await Promise.all(
      userIds.map(async (userId) => {
        const user = await ctx.db.get(userId);
        return {
          user_id: userId,
          exists: !!user,
          user_type: user?.user_type,
        };
      }),
    );

    return rows;
  },
});

export type QualityHistoryDoc = Doc<"quality_score_history">;
export type IncentiveCardDoc = Doc<"incentive_cards">;
export type GuardId = Id<"users">;
