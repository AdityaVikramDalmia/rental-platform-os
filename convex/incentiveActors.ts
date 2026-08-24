import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import { INCENTIVE_PERSONA, PERMISSIONS } from "../lib/constants";
import type { Doc } from "./_generated/dataModel";
import { requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

type IncentiveActorProfileDoc = Doc<"incentive_actor_profiles">;

function assertOptionalBps(value: number | undefined, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
}

function assertEffectiveWindow(effectiveFrom: number, effectiveTo: number | undefined): void {
  if (!Number.isInteger(effectiveFrom) || effectiveFrom <= 0) {
    throw new Error("effective_from must be a valid Unix millisecond timestamp");
  }

  if (effectiveTo === undefined) {
    return;
  }

  if (!Number.isInteger(effectiveTo) || effectiveTo <= 0) {
    throw new Error("effective_to must be a valid Unix millisecond timestamp");
  }

  if (effectiveTo < effectiveFrom) {
    throw new Error("effective_to must be greater than or equal to effective_from");
  }
}

function assertCommissionBounds(args: {
  commission_base_bps: number | undefined;
  commission_min_bps: number | undefined;
  commission_max_bps: number | undefined;
}): void {
  assertOptionalBps(args.commission_base_bps, "commission_base_bps");
  assertOptionalBps(args.commission_min_bps, "commission_min_bps");
  assertOptionalBps(args.commission_max_bps, "commission_max_bps");

  if (
    args.commission_min_bps !== undefined &&
    args.commission_max_bps !== undefined &&
    args.commission_min_bps > args.commission_max_bps
  ) {
    throw new Error("commission_min_bps cannot be greater than commission_max_bps");
  }

  if (
    args.commission_base_bps !== undefined &&
    args.commission_min_bps !== undefined &&
    args.commission_base_bps < args.commission_min_bps
  ) {
    throw new Error("commission_base_bps cannot be lower than commission_min_bps");
  }

  if (
    args.commission_base_bps !== undefined &&
    args.commission_max_bps !== undefined &&
    args.commission_base_bps > args.commission_max_bps
  ) {
    throw new Error("commission_base_bps cannot be higher than commission_max_bps");
  }
}

export const assign = mutation({
  args: {
    user_id: v.id("users"),
    persona: incentivePersonaValidator,
    commission_base_bps: v.optional(v.number()),
    commission_min_bps: v.optional(v.number()),
    commission_max_bps: v.optional(v.number()),
    effective_from: v.number(),
    effective_to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const user = await ctx.db.get(args.user_id);
    if (!user) {
      throw new Error("User not found");
    }

    assertCommissionBounds({
      commission_base_bps: args.commission_base_bps,
      commission_min_bps: args.commission_min_bps,
      commission_max_bps: args.commission_max_bps,
    });
    assertEffectiveWindow(args.effective_from, args.effective_to);

    const now = Date.now();
    return await ctx.db.insert("incentive_actor_profiles", {
      user_id: args.user_id,
      persona: args.persona,
      commission_base_bps: args.commission_base_bps,
      commission_min_bps: args.commission_min_bps,
      commission_max_bps: args.commission_max_bps,
      effective_from: args.effective_from,
      effective_to: args.effective_to,
      is_active: true,
      assigned_by: admin._id,
      updated_by: undefined,
      created_at: now,
      updated_at: undefined,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("incentive_actor_profiles"),
    commission_base_bps: v.optional(v.number()),
    commission_min_bps: v.optional(v.number()),
    commission_max_bps: v.optional(v.number()),
    effective_from: v.optional(v.number()),
    effective_to: v.optional(v.number()),
    is_active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const existingProfile = await ctx.db.get(args.id);
    if (!existingProfile) {
      throw new Error("Incentive actor profile not found");
    }

    const hasMutationFields =
      args.commission_base_bps !== undefined ||
      args.commission_min_bps !== undefined ||
      args.commission_max_bps !== undefined ||
      args.effective_from !== undefined ||
      args.effective_to !== undefined ||
      args.is_active !== undefined;

    if (!hasMutationFields) {
      throw new Error("At least one field must be provided");
    }

    const nextBaseBps =
      args.commission_base_bps !== undefined
        ? args.commission_base_bps
        : existingProfile.commission_base_bps;
    const nextMinBps =
      args.commission_min_bps !== undefined
        ? args.commission_min_bps
        : existingProfile.commission_min_bps;
    const nextMaxBps =
      args.commission_max_bps !== undefined
        ? args.commission_max_bps
        : existingProfile.commission_max_bps;
    const nextEffectiveFrom =
      args.effective_from !== undefined ? args.effective_from : existingProfile.effective_from;
    const nextEffectiveTo =
      args.effective_to !== undefined ? args.effective_to : existingProfile.effective_to;

    assertCommissionBounds({
      commission_base_bps: nextBaseBps,
      commission_min_bps: nextMinBps,
      commission_max_bps: nextMaxBps,
    });
    assertEffectiveWindow(nextEffectiveFrom, nextEffectiveTo);

    await ctx.db.patch(existingProfile._id, {
      commission_base_bps: nextBaseBps,
      commission_min_bps: nextMinBps,
      commission_max_bps: nextMaxBps,
      effective_from: nextEffectiveFrom,
      effective_to: nextEffectiveTo,
      is_active: args.is_active !== undefined ? args.is_active : existingProfile.is_active,
      updated_by: admin._id,
      updated_at: Date.now(),
    });

    return await ctx.db.get(existingProfile._id);
  },
});

export const deactivate = mutation({
  args: {
    id: v.id("incentive_actor_profiles"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const existingProfile = await ctx.db.get(args.id);
    if (!existingProfile) {
      throw new Error("Incentive actor profile not found");
    }

    if (!existingProfile.is_active) {
      return existingProfile;
    }

    await ctx.db.patch(existingProfile._id, {
      is_active: false,
      updated_by: admin._id,
      updated_at: Date.now(),
    });

    return await ctx.db.get(existingProfile._id);
  },
});

export const getByUser = query({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const profiles = await ctx.db
      .query("incentive_actor_profiles")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .collect();

    return profiles.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const listByPersona = query({
  args: {
    persona: incentivePersonaValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const page = await ctx.db
      .query("incentive_actor_profiles")
      .withIndex("by_persona_active", (q) => q.eq("persona", args.persona).eq("is_active", true))
      .order("desc")
      .paginate(args.paginationOpts);

    return page as PaginationResult<IncentiveActorProfileDoc>;
  },
});

export const getActiveProfile = query({
  args: {
    user_id: v.id("users"),
    persona: incentivePersonaValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const now = Date.now();
    const activeProfiles = await ctx.db
      .query("incentive_actor_profiles")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .filter((q) => q.eq(q.field("persona"), args.persona))
      .filter((q) => q.eq(q.field("is_active"), true))
      .filter((q) => q.lte(q.field("effective_from"), now))
      .filter((q) =>
        q.or(q.eq(q.field("effective_to"), undefined), q.gte(q.field("effective_to"), now)),
      )
      .collect();

    if (activeProfiles.length === 0) {
      return null;
    }

    return activeProfiles.reduce((latest, current) => {
      if (current.effective_from !== latest.effective_from) {
        return current.effective_from > latest.effective_from ? current : latest;
      }

      return current._creationTime > latest._creationTime ? current : latest;
    });
  },
});
