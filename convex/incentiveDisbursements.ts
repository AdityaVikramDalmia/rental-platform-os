import { anyApi } from "convex/server";
import { v } from "convex/values";
import {
  DISBURSEMENT_SOURCE_TYPE,
  DISBURSEMENT_STATUS,
  INCENTIVE_PERSONA,
  PERMISSIONS,
} from "../lib/constants";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAuth, requirePermission } from "./auth.helpers";
import { internalMutation, mutation, query } from "./functions";

type IncentivePersona = (typeof INCENTIVE_PERSONA)[keyof typeof INCENTIVE_PERSONA];

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

const disbursementSourceTypeValidator = v.union(
  v.literal(DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT),
  v.literal(DISBURSEMENT_SOURCE_TYPE.QUEST_REWARD),
  v.literal(DISBURSEMENT_SOURCE_TYPE.TEAM_POOL),
  v.literal(DISBURSEMENT_SOURCE_TYPE.V2_MIGRATION),
);

const disbursementStatusValidator = v.union(
  v.literal(DISBURSEMENT_STATUS.PENDING),
  v.literal(DISBURSEMENT_STATUS.APPROVED),
  v.literal(DISBURSEMENT_STATUS.DISBURSED),
  v.literal(DISBURSEMENT_STATUS.FAILED),
  v.literal(DISBURSEMENT_STATUS.VOIDED),
);

const rolloutModeValidator = v.union(
  v.literal("OFF"),
  v.literal("SHADOW"),
  v.literal("PARTIAL"),
  v.literal("FULL"),
);

const rolloutEnableablePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
);

const rolloutPolicyOverrideValidator = v.object({
  mode: rolloutModeValidator,
  enabled_personas: v.array(rolloutEnableablePersonaValidator),
  notes: v.string(),
});

const ALL_DISBURSEMENT_STATUSES = [
  DISBURSEMENT_STATUS.PENDING,
  DISBURSEMENT_STATUS.APPROVED,
  DISBURSEMENT_STATUS.DISBURSED,
  DISBURSEMENT_STATUS.FAILED,
  DISBURSEMENT_STATUS.VOIDED,
] as const;

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function assertPositiveIntegerPaise(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("amount_paise must be a positive whole number in paise");
  }
}

async function resolveRecipientPersona(
  ctx: MutationCtx,
  recipientUserId: Id<"users">,
  fallbackPersona: IncentivePersona,
): Promise<IncentivePersona> {
  const now = Date.now();
  const activeInWindowProfiles = await ctx.db
    .query("incentive_actor_profiles")
    .withIndex("by_user", (q) => q.eq("user_id", recipientUserId))
    .filter((q) => q.eq(q.field("is_active"), true))
    .filter((q) => q.lte(q.field("effective_from"), now))
    .filter((q) =>
      q.or(q.eq(q.field("effective_to"), undefined), q.gt(q.field("effective_to"), now)),
    )
    .collect();

  if (activeInWindowProfiles.length === 0) {
    return fallbackPersona;
  }

  const activeInWindow = activeInWindowProfiles.sort(
    (left, right) => right.effective_from - left.effective_from,
  );

  return activeInWindow[0]!.persona;
}

export const createFromSplit = internalMutation({
  args: {
    recipient_user_id: v.id("users"),
    recipient_persona: incentivePersonaValidator,
    source_type: disbursementSourceTypeValidator,
    source_record_id: v.string(),
    source_key: v.string(),
    closure_id: v.optional(v.id("closures")),
    amount_paise: v.number(),
    rollout_policy_override: v.optional(rolloutPolicyOverrideValidator),
  },
  handler: async (ctx, args) => {
    const sourceKey = normalizeRequiredString(args.source_key, "source_key");

    const existing = await ctx.db
      .query("incentive_disbursements")
      .withIndex("by_source_key", (q) => q.eq("source_key", sourceKey))
      .first();

    if (existing) {
      return existing._id;
    }

    const recipientPersona = await resolveRecipientPersona(
      ctx,
      args.recipient_user_id,
      args.recipient_persona,
    );

    const rolloutPolicy =
      args.rollout_policy_override ??
      (await ctx.runQuery(anyApi["shadowRollout"].getRolloutPolicyInternal, {}));

    if (rolloutPolicy.mode === "OFF" || rolloutPolicy.mode === "SHADOW") {
      console.info(
        `Skipping v3 disbursement for user ${args.recipient_user_id}; rollout mode ${rolloutPolicy.mode} is observation-only.`,
      );
      return null;
    }

    if (rolloutPolicy.mode === "PARTIAL") {
      const enabledPersonas: readonly string[] = rolloutPolicy.enabled_personas;
      const personaEnabled = enabledPersonas.includes(recipientPersona);

      if (!personaEnabled) {
        console.info(
          `Skipping v3 disbursement for user ${args.recipient_user_id}; persona ${recipientPersona} is not enabled in rollout mode ${rolloutPolicy.mode}.`,
        );
        return null;
      }
    }

    if (args.closure_id) {
      const existingForClosure = await ctx.db
        .query("incentive_disbursements")
        .withIndex("by_closure", (q) => q.eq("closure_id", args.closure_id))
        .filter((q) => q.eq(q.field("recipient_user_id"), args.recipient_user_id))
        .filter((q) => q.eq(q.field("source_type"), args.source_type))
        .filter((q) => q.neq(q.field("status"), "VOIDED"))
        .first();

      if (existingForClosure) {
        console.warn(
          `Anti-double-pay: Disbursement already exists for closure ${args.closure_id} + recipient ${args.recipient_user_id} + source_type ${args.source_type}. ` +
            `Existing: ${existingForClosure._id} (source_key: ${existingForClosure.source_key}), ` +
            `Attempted: ${args.source_key}. Returning existing for same source_type.`,
        );
        return existingForClosure._id;
      }
    }

    assertPositiveIntegerPaise(args.amount_paise);

    return await ctx.db.insert("incentive_disbursements", {
      recipient_user_id: args.recipient_user_id,
      recipient_persona: recipientPersona,
      source_type: args.source_type,
      source_record_id: normalizeRequiredString(args.source_record_id, "source_record_id"),
      source_key: sourceKey,
      closure_id: args.closure_id,
      amount_paise: args.amount_paise,
      status: DISBURSEMENT_STATUS.PENDING,
      approved_by_admin_id: undefined,
      approved_at: undefined,
      disbursed_at: undefined,
      created_at: Date.now(),
    });
  },
});

export const approve = mutation({
  args: {
    disbursement_id: v.id("incentive_disbursements"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.DISBURSEMENT_APPROVE);
    const disbursement = await ctx.db.get(args.disbursement_id);

    if (!disbursement) {
      throw new Error("Disbursement not found");
    }

    if (disbursement.status !== DISBURSEMENT_STATUS.PENDING) {
      throw new Error(`Only ${DISBURSEMENT_STATUS.PENDING} disbursements can be approved`);
    }

    await ctx.db.patch(disbursement._id, {
      status: DISBURSEMENT_STATUS.APPROVED,
      approved_by_admin_id: admin._id,
      approved_at: Date.now(),
    });

    return await ctx.db.get(disbursement._id);
  },
});

export const disburse = mutation({
  args: {
    disbursement_id: v.id("incentive_disbursements"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.DISBURSEMENT_APPROVE);
    const disbursement = await ctx.db.get(args.disbursement_id);

    if (!disbursement) {
      throw new Error("Disbursement not found");
    }

    if (disbursement.status !== DISBURSEMENT_STATUS.APPROVED) {
      throw new Error(`Only ${DISBURSEMENT_STATUS.APPROVED} disbursements can be disbursed`);
    }

    await ctx.db.patch(disbursement._id, {
      status: DISBURSEMENT_STATUS.DISBURSED,
      disbursed_at: Date.now(),
    });

    return await ctx.db.get(disbursement._id);
  },
});

export const voidDisbursement = mutation({
  args: {
    disbursement_id: v.id("incentive_disbursements"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.DISBURSEMENT_VOID);
    const disbursement = await ctx.db.get(args.disbursement_id);

    if (!disbursement) {
      throw new Error("Disbursement not found");
    }

    if (
      disbursement.status !== DISBURSEMENT_STATUS.PENDING &&
      disbursement.status !== DISBURSEMENT_STATUS.APPROVED
    ) {
      throw new Error(
        `Only ${DISBURSEMENT_STATUS.PENDING} or ${DISBURSEMENT_STATUS.APPROVED} disbursements can be voided`,
      );
    }

    await ctx.db.patch(disbursement._id, {
      status: DISBURSEMENT_STATUS.VOIDED,
    });

    return await ctx.db.get(disbursement._id);
  },
});

export const listByRecipient = query({
  args: {
    recipient_user_id: v.id("users"),
    status: v.optional(disbursementStatusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (user._id !== args.recipient_user_id) {
      await requirePermission(ctx, PERMISSIONS.DISBURSEMENT_APPROVE);
    }

    if (args.status) {
      return await ctx.db
        .query("incentive_disbursements")
        .withIndex("by_recipient_status", (q) =>
          q.eq("recipient_user_id", args.recipient_user_id).eq("status", args.status!),
        )
        .order("desc")
        .collect();
    }

    const recordsByStatus = await Promise.all(
      ALL_DISBURSEMENT_STATUSES.map((status) =>
        ctx.db
          .query("incentive_disbursements")
          .withIndex("by_recipient_status", (q) =>
            q.eq("recipient_user_id", args.recipient_user_id).eq("status", status),
          )
          .collect(),
      ),
    );

    return recordsByStatus.flat().sort((a, b) => b.created_at - a.created_at);
  },
});

export const listByClosure = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_VIEW);

    return await ctx.db
      .query("incentive_disbursements")
      .withIndex("by_closure", (q) => q.eq("closure_id", args.closure_id))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: {
    disbursement_id: v.id("incentive_disbursements"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const disbursement = await ctx.db.get(args.disbursement_id);

    if (!disbursement) {
      throw new Error("Disbursement not found");
    }

    if (disbursement.recipient_user_id !== user._id) {
      await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_VIEW);
    }

    return disbursement;
  },
});
