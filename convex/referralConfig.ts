import { v } from "convex/values";
import {
  PERMISSIONS,
  REFERRAL_CONFIG_SCOPE_TYPE,
  REFERRAL_TYPE,
  type ReferralConfigScopeType,
  type ReferralType,
} from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const referralTypeValidator = v.union(
  v.literal(REFERRAL_TYPE.TENANT_FINDING),
  v.literal(REFERRAL_TYPE.OWNER_FINDING),
  v.literal(REFERRAL_TYPE.GUARD),
);

const referralConfigScopeTypeValidator = v.union(
  v.literal(REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL),
  v.literal(REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY),
  v.literal(REFERRAL_CONFIG_SCOPE_TYPE.BUILDING),
);

type ResolvedReferralConfig = {
  referral_type: ReferralType;
  scope_type: ReferralConfigScopeType;
  scope_id: string | undefined;
  sign_up_bonus: number;
  finding_bonus_total: number;
  publish_split_pct: number;
  closure_split_pct: number;
  is_active: boolean;
  updated_by_admin_id: Id<"users"> | undefined;
  resolved_scope: ReferralConfigScopeType;
};

function toResolvedConfig(
  config: Doc<"referral_config">,
  resolvedScope: ReferralConfigScopeType,
): ResolvedReferralConfig {
  return {
    referral_type: config.referral_type,
    scope_type: config.scope_type,
    scope_id: config.scope_id,
    sign_up_bonus: config.sign_up_bonus,
    finding_bonus_total: config.finding_bonus_total,
    publish_split_pct: config.publish_split_pct,
    closure_split_pct: config.closure_split_pct,
    is_active: config.is_active,
    updated_by_admin_id: config.updated_by_admin_id,
    resolved_scope: resolvedScope,
  };
}

function getDefaultResolvedConfig(referralType: ReferralType): ResolvedReferralConfig {
  if (referralType === REFERRAL_TYPE.GUARD) {
    return {
      referral_type: REFERRAL_TYPE.GUARD,
      scope_type: REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL,
      scope_id: undefined,
      sign_up_bonus: 0,
      finding_bonus_total: 50000,
      publish_split_pct: 0,
      closure_split_pct: 100,
      is_active: true,
      updated_by_admin_id: undefined,
      resolved_scope: REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL,
    };
  }

  if (referralType === REFERRAL_TYPE.OWNER_FINDING) {
    return {
      referral_type: REFERRAL_TYPE.OWNER_FINDING,
      scope_type: REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL,
      scope_id: undefined,
      sign_up_bonus: 20000,
      finding_bonus_total: 200000,
      publish_split_pct: 30,
      closure_split_pct: 70,
      is_active: true,
      updated_by_admin_id: undefined,
      resolved_scope: REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL,
    };
  }

  return {
    referral_type: REFERRAL_TYPE.TENANT_FINDING,
    scope_type: REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL,
    scope_id: undefined,
    sign_up_bonus: 20000,
    finding_bonus_total: 100000,
    publish_split_pct: 30,
    closure_split_pct: 70,
    is_active: true,
    updated_by_admin_id: undefined,
    resolved_scope: REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL,
  };
}

function assertNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

function assertPercentage(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${fieldName} must be an integer between 0 and 100`);
  }

  return value;
}

async function getConfigByScope(
  ctx: QueryCtx,
  referralType: ReferralType,
  scopeType: ReferralConfigScopeType,
  scopeId: string | undefined,
): Promise<Doc<"referral_config"> | null> {
  return await ctx.db
    .query("referral_config")
    .withIndex("by_scope", (q) => q.eq("scope_type", scopeType).eq("scope_id", scopeId))
    .filter((q) => q.eq(q.field("referral_type"), referralType))
    .filter((q) => q.eq(q.field("is_active"), true))
    .first();
}

export const upsert = mutation({
  args: {
    referral_type: referralTypeValidator,
    scope_type: referralConfigScopeTypeValidator,
    scope_id: v.optional(v.string()),
    sign_up_bonus: v.number(),
    finding_bonus_total: v.number(),
    publish_split_pct: v.number(),
    closure_split_pct: v.number(),
    is_active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.REFERRALS_CONFIGURE);

    const signUpBonus = assertNonNegativeInteger(args.sign_up_bonus, "sign_up_bonus");
    const findingBonusTotal = assertNonNegativeInteger(
      args.finding_bonus_total,
      "finding_bonus_total",
    );
    const publishSplitPct = assertPercentage(args.publish_split_pct, "publish_split_pct");
    const closureSplitPct = assertPercentage(args.closure_split_pct, "closure_split_pct");

    if (publishSplitPct + closureSplitPct !== 100) {
      throw new Error("publish_split_pct and closure_split_pct must sum to 100");
    }

    let scopeId = args.scope_id;

    if (args.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL) {
      if (scopeId !== undefined) {
        throw new Error("scope_id must be undefined for GLOBAL scope");
      }
      scopeId = undefined;
    }

    if (args.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY) {
      if (!scopeId) {
        throw new Error("scope_id is required for SOCIETY scope");
      }

      const society = await ctx.db.get(scopeId as Id<"societies">);

      if (!society) {
        throw new Error("Society not found");
      }
    }

    if (args.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.BUILDING) {
      if (!scopeId) {
        throw new Error("scope_id is required for BUILDING scope");
      }

      const building = await ctx.db.get(scopeId as Id<"buildings">);

      if (!building || building.is_deleted) {
        throw new Error("Building not found");
      }
    }

    const existing = await ctx.db
      .query("referral_config")
      .withIndex("by_scope", (q) => q.eq("scope_type", args.scope_type).eq("scope_id", scopeId))
      .filter((q) => q.eq(q.field("referral_type"), args.referral_type))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        sign_up_bonus: signUpBonus,
        finding_bonus_total: findingBonusTotal,
        publish_split_pct: publishSplitPct,
        closure_split_pct: closureSplitPct,
        is_active: args.is_active,
        updated_by_admin_id: admin._id,
      });

      return existing._id;
    }

    return await ctx.db.insert("referral_config", {
      referral_type: args.referral_type,
      scope_type: args.scope_type,
      scope_id: scopeId,
      sign_up_bonus: signUpBonus,
      finding_bonus_total: findingBonusTotal,
      publish_split_pct: publishSplitPct,
      closure_split_pct: closureSplitPct,
      is_active: args.is_active,
      updated_by_admin_id: admin._id,
    });
  },
});

export const getForScope = internalQuery({
  args: {
    referral_type: referralTypeValidator,
    building_id: v.optional(v.id("buildings")),
    society_id: v.optional(v.id("societies")),
  },
  handler: async (ctx, args) => {
    if (args.building_id) {
      const buildingConfig = await getConfigByScope(
        ctx,
        args.referral_type,
        REFERRAL_CONFIG_SCOPE_TYPE.BUILDING,
        args.building_id,
      );

      if (buildingConfig) {
        return toResolvedConfig(buildingConfig, REFERRAL_CONFIG_SCOPE_TYPE.BUILDING);
      }
    }

    if (args.society_id) {
      const societyConfig = await getConfigByScope(
        ctx,
        args.referral_type,
        REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY,
        args.society_id,
      );

      if (societyConfig) {
        return toResolvedConfig(societyConfig, REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY);
      }
    }

    const globalConfig = await getConfigByScope(
      ctx,
      args.referral_type,
      REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL,
      undefined,
    );

    if (globalConfig) {
      return toResolvedConfig(globalConfig, REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL);
    }

    return getDefaultResolvedConfig(args.referral_type);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_VIEW);

    return await ctx.db.query("referral_config").collect();
  },
});
