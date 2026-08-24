import { v } from "convex/values";
import {
  CONTRIBUTION_SOURCE_ENTITY,
  CONTRIBUTION_STAGE,
  INCENTIVE_PERSONA,
  PERMISSIONS,
} from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import { internalMutation, mutation, query } from "./functions";

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

const contributionStageValidator = v.union(
  v.literal(CONTRIBUTION_STAGE.DISCOVERY),
  v.literal(CONTRIBUTION_STAGE.VERIFICATION),
  v.literal(CONTRIBUTION_STAGE.CLOSURE),
  v.literal(CONTRIBUTION_STAGE.SUPPORT),
);

const contributionSourceEntityValidator = v.union(
  v.literal(CONTRIBUTION_SOURCE_ENTITY.LEAD),
  v.literal(CONTRIBUTION_SOURCE_ENTITY.VISIT),
  v.literal(CONTRIBUTION_SOURCE_ENTITY.CLOSURE),
  v.literal(CONTRIBUTION_SOURCE_ENTITY.AUDIT_LOG),
  v.literal(CONTRIBUTION_SOURCE_ENTITY.MANUAL),
);

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

function normalizeContributionUnits(value: number | undefined): number {
  const normalized = value ?? 1;

  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("contribution_units must be a positive number");
  }

  return normalized;
}

export const logContribution = internalMutation({
  args: {
    closure_id: v.id("closures"),
    lead_id: v.optional(v.id("leads")),
    actor_user_id: v.id("users"),
    actor_persona: incentivePersonaValidator,
    stage: contributionStageValidator,
    source_entity_type: contributionSourceEntityValidator,
    source_entity_id: v.string(),
    event_key: v.string(),
    contribution_units: v.optional(v.number()),
    quality_score_snapshot: v.optional(v.number()),
    timeliness_score_snapshot: v.optional(v.number()),
    handoff_from_user_id: v.optional(v.id("users")),
    handoff_reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const eventKey = normalizeRequiredString(args.event_key, "event_key");

    const existing = await ctx.db
      .query("deal_contributions")
      .withIndex("by_event_key", (q) => q.eq("event_key", eventKey))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("deal_contributions", {
      closure_id: args.closure_id,
      lead_id: args.lead_id,
      actor_user_id: args.actor_user_id,
      actor_persona: args.actor_persona,
      stage: args.stage,
      source_entity_type: args.source_entity_type,
      source_entity_id: normalizeRequiredString(args.source_entity_id, "source_entity_id"),
      event_key: eventKey,
      contribution_units: normalizeContributionUnits(args.contribution_units),
      quality_score_snapshot: args.quality_score_snapshot,
      timeliness_score_snapshot: args.timeliness_score_snapshot,
      handoff_from_user_id: args.handoff_from_user_id,
      handoff_reason: normalizeOptionalString(args.handoff_reason),
      occurred_at: Date.now(),
      metadata: args.metadata,
      is_voided: false,
      voided_reason: undefined,
      voided_by_admin_id: undefined,
      voided_at: undefined,
      is_deleted: false,
    });
  },
});

export const voidContribution = mutation({
  args: {
    contribution_id: v.id("deal_contributions"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_OVERRIDE);

    const contribution = await ctx.db.get(args.contribution_id);
    if (!contribution || contribution.is_deleted) {
      throw new Error("Contribution not found");
    }

    if (contribution.is_voided) {
      return contribution;
    }

    await ctx.db.patch(contribution._id, {
      is_voided: true,
      voided_reason: normalizeRequiredString(args.reason, "reason"),
      voided_by_admin_id: admin._id,
      voided_at: Date.now(),
    });

    return await ctx.db.get(contribution._id);
  },
});

export const listByClosureId = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_VIEW);

    return await ctx.db
      .query("deal_contributions")
      .withIndex("by_closure", (q) => q.eq("closure_id", args.closure_id))
      .filter((q) => q.eq(q.field("is_voided"), false))
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .order("desc")
      .collect();
  },
});

export const listByActor = query({
  args: {
    actor_user_id: v.id("users"),
    from_ts: v.optional(v.number()),
    to_ts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_VIEW);

    if (args.from_ts !== undefined && args.to_ts !== undefined && args.from_ts > args.to_ts) {
      throw new Error("from_ts must be less than or equal to to_ts");
    }

    const contributionsQuery =
      args.from_ts !== undefined && args.to_ts !== undefined
        ? ctx.db
            .query("deal_contributions")
            .withIndex("by_actor", (q) =>
              q
                .eq("actor_user_id", args.actor_user_id)
                .gte("occurred_at", args.from_ts!)
                .lte("occurred_at", args.to_ts!),
            )
        : args.from_ts !== undefined
          ? ctx.db
              .query("deal_contributions")
              .withIndex("by_actor", (q) =>
                q.eq("actor_user_id", args.actor_user_id).gte("occurred_at", args.from_ts!),
              )
          : args.to_ts !== undefined
            ? ctx.db
                .query("deal_contributions")
                .withIndex("by_actor", (q) =>
                  q.eq("actor_user_id", args.actor_user_id).lte("occurred_at", args.to_ts!),
                )
            : ctx.db
                .query("deal_contributions")
                .withIndex("by_actor", (q) => q.eq("actor_user_id", args.actor_user_id));

    return await contributionsQuery
      .filter((q) => q.eq(q.field("is_voided"), false))
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .order("desc")
      .collect();
  },
});
