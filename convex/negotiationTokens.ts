import { v } from "convex/values";
import {
  NEGOTIATION_PROPOSAL_STATUS,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  TOKEN_COLLECTION_METHOD,
  TOKEN_RECORD_STATUS,
  TOKEN_REFUND_POLICY,
  USER_TYPE,
  type TokenRefundPolicy,
} from "../lib/constants";
import { isNegotiationTerminal, validateNegotiationTransition } from "../lib/negotiation";
import { requireAuth, requireBackoffice, requirePermission } from "./auth.helpers";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./functions";

const tokenCollectionMethodValidator = v.union(
  v.literal(TOKEN_COLLECTION_METHOD.CASH),
  v.literal(TOKEN_COLLECTION_METHOD.UPI),
  v.literal(TOKEN_COLLECTION_METHOD.BANK_TRANSFER),
  v.literal(TOKEN_COLLECTION_METHOD.CHEQUE),
);

const tokenRefundPolicyValidator = v.union(
  v.literal(TOKEN_REFUND_POLICY.NON_REFUNDABLE),
  v.literal(TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS),
  v.literal(TOKEN_REFUND_POLICY.PARTIAL_REFUND),
  v.literal(TOKEN_REFUND_POLICY.CASE_BY_CASE),
);

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function validateRefundPolicyDetails(
  policy: TokenRefundPolicy,
  refundDays: number | undefined,
  refundPercentage: number | undefined,
): void {
  if (refundDays !== undefined && (!Number.isInteger(refundDays) || refundDays <= 0)) {
    throw new Error("refund_days must be a positive whole number");
  }

  if (
    refundPercentage !== undefined &&
    (!Number.isFinite(refundPercentage) || refundPercentage < 0 || refundPercentage > 100)
  ) {
    throw new Error("refund_percentage must be between 0 and 100");
  }

  if (policy === TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS) {
    if (refundDays === undefined) {
      throw new Error("refund_days is required for REFUNDABLE_WITHIN_DAYS");
    }

    if (refundPercentage !== undefined) {
      throw new Error("refund_percentage is only allowed for PARTIAL_REFUND");
    }

    return;
  }

  if (policy === TOKEN_REFUND_POLICY.PARTIAL_REFUND) {
    if (refundPercentage === undefined) {
      throw new Error("refund_percentage is required for PARTIAL_REFUND");
    }

    if (refundDays !== undefined) {
      throw new Error("refund_days is only allowed for REFUNDABLE_WITHIN_DAYS");
    }

    return;
  }

  if (refundDays !== undefined || refundPercentage !== undefined) {
    throw new Error(
      "refund_days/refund_percentage are only allowed for conditional refund policies",
    );
  }
}

export const tenantAgreeToPolicy = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (user.user_type !== USER_TYPE.TENANT) {
      throw new Error("Tenant access required");
    }

    const negotiation = await ctx.db.get(args.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      throw new Error("Negotiation not found");
    }

    if (negotiation.tenant_user_id.toString() !== user._id.toString()) {
      throw new Error("Only linked tenant can agree to token policy");
    }

    // Verify tenant identity through the inquiry path as well
    const inquiry = await ctx.db.get(negotiation.tenant_inquiry_id);
    if (!inquiry) {
      throw new Error("Associated inquiry not found");
    }

    if (!inquiry.tenant_id || inquiry.tenant_id.toString() !== user._id.toString()) {
      throw new Error("Not authorized: you are not the tenant for this negotiation");
    }

    if (isNegotiationTerminal(negotiation.status)) {
      throw new Error("Cannot record token policy for terminal negotiation");
    }

    if (negotiation.status !== NEGOTIATION_STATUS.TERMS_AGREED) {
      throw new Error("Token policy can only be agreed after terms are finalized");
    }

    if (!negotiation.active_proposal_id) {
      throw new Error("Cannot consent to policy - active proposal is not fully agreed");
    }

    const proposal = await ctx.db.get(negotiation.active_proposal_id);
    if (
      !proposal ||
      proposal.is_deleted ||
      proposal.status !== NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED
    ) {
      throw new Error("Cannot consent to policy - active proposal is not fully agreed");
    }

    const existingTokenRecord = await ctx.db
      .query("negotiation_token_records")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation._id))
      .order("desc")
      .collect();

    const latestNonDeletedTokenRecord = existingTokenRecord.find((record) => !record.is_deleted);

    if (latestNonDeletedTokenRecord) {
      return latestNonDeletedTokenRecord._id;
    }

    if (
      !Number.isInteger(proposal.token_advance_amount_paise) ||
      proposal.token_advance_amount_paise < 0
    ) {
      throw new Error("token_advance_amount_paise must be a non-negative whole number in paise");
    }

    const now = Date.now();

    const tokenRecordId = await ctx.db.insert("negotiation_token_records", {
      negotiation_id: negotiation._id,
      amount_paise: proposal.token_advance_amount_paise,
      collected_at: now,
      collection_method: TOKEN_COLLECTION_METHOD.CASH,
      refund_policy: TOKEN_REFUND_POLICY.CASE_BY_CASE,
      refund_days: undefined,
      refund_percentage: undefined,
      tenant_agreed_at: now,
      status: TOKEN_RECORD_STATUS.PENDING,
      collected_by_admin_id: negotiation.initiated_by_admin_id,
      notes: "Tenant agreed to refund policy; collection pending",
      is_deleted: false,
    });

    await ctx.db.patch(negotiation._id, {
      last_activity_at: now,
    });

    return tokenRecordId;
  },
});

export const recordCollection = mutation({
  args: {
    negotiation_id: v.optional(v.id("negotiations")),
    token_record_id: v.optional(v.id("negotiation_token_records")),
    collection_method: tokenCollectionMethodValidator,
    refund_policy: v.optional(tokenRefundPolicyValidator),
    refund_days: v.optional(v.number()),
    refund_percentage: v.optional(v.number()),
    receipt_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actingUser = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const hasNegotiationId = args.negotiation_id !== undefined;
    const hasTokenRecordId = args.token_record_id !== undefined;

    if (hasNegotiationId === hasTokenRecordId) {
      throw new Error("Provide exactly one of negotiation_id or token_record_id");
    }

    let tokenRecord: Doc<"negotiation_token_records"> | null;

    if (args.token_record_id !== undefined) {
      tokenRecord = await ctx.db.get(args.token_record_id);
    } else {
      const records = await ctx.db
        .query("negotiation_token_records")
        .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", args.negotiation_id!))
        .order("desc")
        .collect();
      tokenRecord = records.find((record) => !record.is_deleted) ?? null;
    }

    if (!tokenRecord || tokenRecord.is_deleted) {
      throw new Error("Token record not found");
    }

    if (tokenRecord.status !== TOKEN_RECORD_STATUS.PENDING) {
      throw new Error("Token record must be in PENDING status");
    }

    if (!tokenRecord.tenant_agreed_at) {
      throw new Error("Tenant must agree to token policy before collection");
    }

    const negotiation = await ctx.db.get(tokenRecord.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      throw new Error("Negotiation not found");
    }

    if (negotiation.status !== NEGOTIATION_STATUS.TERMS_AGREED) {
      throw new Error("Token can only be collected while negotiation is in TERMS_AGREED");
    }

    if (!negotiation.active_proposal_id) {
      throw new Error("Cannot collect token - active proposal is not fully agreed");
    }

    const activeProposal = await ctx.db.get(negotiation.active_proposal_id);
    if (
      !activeProposal ||
      activeProposal.is_deleted ||
      activeProposal.status !== NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED
    ) {
      throw new Error("Cannot collect token - active proposal is not fully agreed");
    }

    if (!validateNegotiationTransition(negotiation.status, NEGOTIATION_STATUS.TOKEN_COLLECTED)) {
      throw new Error(
        `Invalid negotiation status transition from ${negotiation.status} to TOKEN_COLLECTED`,
      );
    }

    const refundPolicy = args.refund_policy ?? tokenRecord.refund_policy;
    const refundDays = args.refund_days ?? tokenRecord.refund_days;
    const refundPercentage = args.refund_percentage ?? tokenRecord.refund_percentage;

    validateRefundPolicyDetails(refundPolicy, refundDays, refundPercentage);

    const now = Date.now();
    const normalizedNotes = normalizeOptionalString(args.receipt_notes);

    await ctx.db.patch(tokenRecord._id, {
      status: TOKEN_RECORD_STATUS.COLLECTED,
      collected_at: now,
      collected_by_admin_id: actingUser._id,
      collection_method: args.collection_method,
      refund_policy: refundPolicy,
      refund_days: refundDays,
      refund_percentage: refundPercentage,
      notes: normalizedNotes ?? tokenRecord.notes,
    });

    await ctx.db.patch(negotiation._id, {
      status: NEGOTIATION_STATUS.TOKEN_COLLECTED,
      last_activity_at: now,
    });

    return tokenRecord._id;
  },
});

export const getForNegotiation = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const negotiation = await ctx.db.get(args.negotiation_id);

    if (!negotiation || negotiation.is_deleted) {
      return null;
    }

    if (user.user_type === USER_TYPE.ADMIN || user.user_type === USER_TYPE.OPS) {
      await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);
    } else if (
      user.user_type === USER_TYPE.TENANT &&
      user._id.toString() === negotiation.tenant_user_id.toString()
    ) {
    } else if (
      user.user_type === USER_TYPE.OWNER &&
      negotiation.owner_user_id &&
      user._id.toString() === negotiation.owner_user_id.toString()
    ) {
    } else {
      return null;
    }

    const tokenRecord = await ctx.db
      .query("negotiation_token_records")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", args.negotiation_id))
      .order("desc")
      .collect();

    const latestNonDeletedTokenRecord = tokenRecord.find((record) => !record.is_deleted);

    if (!latestNonDeletedTokenRecord) {
      return null;
    }

    return latestNonDeletedTokenRecord;
  },
});
