import { v } from "convex/values";
import {
  MAINTENANCE_PAID_BY,
  NEGOTIATION_PROPOSAL_STATUS,
  NEGOTIATION_ROOM_TYPE,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  RENT_ESCALATION_TYPE,
  USER_TYPE,
} from "../lib/constants";
import {
  isNegotiationTerminal,
  validateNegotiationTransition,
  validateProposalTransition,
} from "../lib/negotiation";
import { requireAuth, requireBackoffice, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const maintenancePaidByValidator = v.union(
  v.literal(MAINTENANCE_PAID_BY.TENANT),
  v.literal(MAINTENANCE_PAID_BY.OWNER),
  v.literal(MAINTENANCE_PAID_BY.SPLIT),
);

const rentEscalationTypeValidator = v.union(
  v.literal(RENT_ESCALATION_TYPE.PERCENTAGE),
  v.literal(RENT_ESCALATION_TYPE.FIXED_AMOUNT),
  v.literal(RENT_ESCALATION_TYPE.NONE),
);

const negotiationRoomTypeValidator = v.union(
  v.literal(NEGOTIATION_ROOM_TYPE.OPS_TENANT),
  v.literal(NEGOTIATION_ROOM_TYPE.OPS_OWNER),
  v.literal(NEGOTIATION_ROOM_TYPE.COMBINED),
);

type NegotiationDoc = Doc<"negotiations">;
type ProposalDoc = Doc<"negotiation_terms_proposals">;
type ProposalSignerRole = "TENANT" | "OWNER";
type ReadWriteCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

const PROPOSAL_BLOCKED_STATUSES = new Set<NegotiationDoc["status"]>([
  NEGOTIATION_STATUS.TERMS_AGREED,
  NEGOTIATION_STATUS.TOKEN_COLLECTED,
  NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
  NEGOTIATION_STATUS.READY_FOR_CLOSURE,
  NEGOTIATION_STATUS.CLOSED,
  NEGOTIATION_STATUS.FAILED,
  NEGOTIATION_STATUS.EXPIRED,
]);

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

function assertNonNegativeIntegerPaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative whole number in paise`);
  }
}

function assertPositiveIntegerPaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

type ProposalTermValidationInput = {
  monthly_rent_paise?: number;
  security_deposit_months?: number;
  lock_in_period_months?: number;
  notice_period_months?: number;
  move_in_date?: number;
  rent_escalation_type?: ProposalDoc["rent_escalation_type"];
  rent_escalation_value?: number;
  brokerage_tenant_side_paise?: number;
  brokerage_owner_side_paise?: number;
};

function validateProposalTermBoundaries(terms: ProposalTermValidationInput): void {
  const monthFields: Array<{
    name: "security_deposit_months" | "lock_in_period_months" | "notice_period_months";
    value: number | undefined;
    max: number;
  }> = [
    {
      name: "security_deposit_months",
      value: terms.security_deposit_months,
      max: 24,
    },
    {
      name: "lock_in_period_months",
      value: terms.lock_in_period_months,
      max: 60,
    },
    {
      name: "notice_period_months",
      value: terms.notice_period_months,
      max: 12,
    },
  ];

  for (const field of monthFields) {
    if (field.value !== undefined) {
      if (!Number.isInteger(field.value) || field.value < 0 || field.value > field.max) {
        throw new Error(`${field.name} must be an integer between 0 and ${field.max}`);
      }
    }
  }

  if (terms.monthly_rent_paise !== undefined) {
    assertPositiveIntegerPaise(terms.monthly_rent_paise, "monthly_rent_paise");
  }

  if (terms.brokerage_tenant_side_paise !== undefined) {
    assertNonNegativeIntegerPaise(terms.brokerage_tenant_side_paise, "brokerage_tenant_side_paise");
  }

  if (terms.brokerage_owner_side_paise !== undefined) {
    assertNonNegativeIntegerPaise(terms.brokerage_owner_side_paise, "brokerage_owner_side_paise");
  }

  if (terms.move_in_date !== undefined) {
    const now = Date.now();
    const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (
      !Number.isInteger(terms.move_in_date) ||
      terms.move_in_date < now - oneDayMs ||
      terms.move_in_date > now + twoYearsMs
    ) {
      throw new Error(
        "move_in_date must be within a reasonable range (not past, not more than 2 years out)",
      );
    }
  }

  if (
    terms.rent_escalation_type === RENT_ESCALATION_TYPE.NONE &&
    terms.rent_escalation_value !== undefined &&
    terms.rent_escalation_value !== 0
  ) {
    throw new Error("rent_escalation_value must be 0 when type is NONE");
  }

  if (
    terms.rent_escalation_type === RENT_ESCALATION_TYPE.PERCENTAGE &&
    terms.rent_escalation_value !== undefined
  ) {
    if (
      !Number.isFinite(terms.rent_escalation_value) ||
      terms.rent_escalation_value < 0 ||
      terms.rent_escalation_value > 100
    ) {
      throw new Error("rent_escalation_value percentage must be 0-100");
    }
  }

  if (
    terms.rent_escalation_type === RENT_ESCALATION_TYPE.FIXED_AMOUNT &&
    terms.rent_escalation_value !== undefined
  ) {
    if (!Number.isInteger(terms.rent_escalation_value) || terms.rent_escalation_value < 0) {
      throw new Error(
        "rent_escalation_value for FIXED_AMOUNT must be a non-negative integer (paise)",
      );
    }
  }
}

async function getNegotiationOrThrow(
  ctx: ReadWriteCtx,
  negotiationId: ProposalDoc["negotiation_id"],
): Promise<NegotiationDoc> {
  const negotiation = await ctx.db.get(negotiationId);
  if (!negotiation || negotiation.is_deleted) {
    throw new Error("Negotiation not found");
  }

  if (isNegotiationTerminal(negotiation.status)) {
    throw new Error("Cannot modify proposals for terminal negotiation");
  }

  return negotiation;
}

function assertProposalMutationAllowed(negotiation: NegotiationDoc): void {
  if (PROPOSAL_BLOCKED_STATUSES.has(negotiation.status)) {
    throw new Error(
      `Cannot create proposals when negotiation is ${negotiation.status}. Negotiation must be rolled back to active state first.`,
    );
  }
}

function getProposalTermsSnapshot(proposal: ProposalDoc) {
  return {
    monthly_rent_paise: proposal.monthly_rent_paise,
    security_deposit_paise: proposal.security_deposit_paise,
    security_deposit_months: proposal.security_deposit_months,
    lock_in_period_months: proposal.lock_in_period_months,
    notice_period_months: proposal.notice_period_months,
    move_in_date: proposal.move_in_date,
    maintenance_charges_paise: proposal.maintenance_charges_paise,
    maintenance_paid_by: proposal.maintenance_paid_by,
    rent_escalation_type: proposal.rent_escalation_type,
    rent_escalation_value: proposal.rent_escalation_value,
    furnishing_terms: proposal.furnishing_terms,
    brokerage_tenant_side_paise: proposal.brokerage_tenant_side_paise,
    brokerage_owner_side_paise: proposal.brokerage_owner_side_paise,
    token_advance_amount_paise: proposal.token_advance_amount_paise,
    special_conditions: proposal.special_conditions,
  };
}

function resolveSignerRole(user: Doc<"users">, negotiation: NegotiationDoc): ProposalSignerRole {
  if (
    user.user_type === USER_TYPE.TENANT &&
    user._id.toString() === negotiation.tenant_user_id.toString()
  ) {
    return "TENANT";
  }

  if (
    user.user_type === USER_TYPE.OWNER &&
    negotiation.owner_user_id &&
    user._id.toString() === negotiation.owner_user_id.toString()
  ) {
    return "OWNER";
  }

  throw new Error("Only linked tenant/owner can sign proposal terms");
}

function getSignerRoomType(signerRole: ProposalSignerRole): "OPS_TENANT" | "OPS_OWNER" {
  return signerRole === "TENANT"
    ? NEGOTIATION_ROOM_TYPE.OPS_TENANT
    : NEGOTIATION_ROOM_TYPE.OPS_OWNER;
}

function isProposalSharedToRoom(
  proposal: ProposalDoc,
  roomType: "OPS_TENANT" | "OPS_OWNER" | "COMBINED",
): boolean {
  const sharedRoomTypes = (proposal.shared_to_rooms ?? []) as (
    | "OPS_TENANT"
    | "OPS_OWNER"
    | "COMBINED"
  )[];
  return (
    sharedRoomTypes.includes(roomType) || sharedRoomTypes.includes(NEGOTIATION_ROOM_TYPE.COMBINED)
  );
}

export const create = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    monthly_rent_paise: v.number(),
    security_deposit_paise: v.number(),
    security_deposit_months: v.number(),
    lock_in_period_months: v.number(),
    notice_period_months: v.number(),
    move_in_date: v.number(),
    maintenance_charges_paise: v.number(),
    maintenance_paid_by: maintenancePaidByValidator,
    rent_escalation_type: rentEscalationTypeValidator,
    rent_escalation_value: v.number(),
    furnishing_terms: v.string(),
    brokerage_tenant_side_paise: v.number(),
    brokerage_owner_side_paise: v.number(),
    token_advance_amount_paise: v.number(),
    special_conditions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actingUser = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    await rateLimiter.limit(ctx, "negotiation:propose_terms", {
      key: actingUser._id,
      throws: true,
    });

    validateProposalTermBoundaries({
      monthly_rent_paise: args.monthly_rent_paise,
      security_deposit_months: args.security_deposit_months,
      lock_in_period_months: args.lock_in_period_months,
      notice_period_months: args.notice_period_months,
      move_in_date: args.move_in_date,
      rent_escalation_type: args.rent_escalation_type,
      rent_escalation_value: args.rent_escalation_value,
      brokerage_tenant_side_paise: args.brokerage_tenant_side_paise,
      brokerage_owner_side_paise: args.brokerage_owner_side_paise,
    });

    assertNonNegativeIntegerPaise(args.security_deposit_paise, "security_deposit_paise");
    assertNonNegativeIntegerPaise(args.maintenance_charges_paise, "maintenance_charges_paise");
    assertNonNegativeIntegerPaise(args.brokerage_tenant_side_paise, "brokerage_tenant_side_paise");
    assertNonNegativeIntegerPaise(args.brokerage_owner_side_paise, "brokerage_owner_side_paise");
    assertNonNegativeIntegerPaise(args.token_advance_amount_paise, "token_advance_amount_paise");

    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    assertProposalMutationAllowed(negotiation);

    const existingProposals = await ctx.db
      .query("negotiation_terms_proposals")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation._id))
      .collect();

    const maxVersion = existingProposals.reduce(
      (currentMax, proposal) => (proposal.version > currentMax ? proposal.version : currentMax),
      0,
    );
    const activeProposalCount =
      existingProposals.filter((proposal) => !proposal.is_deleted).length + 1;

    const now = Date.now();

    const proposalId = await ctx.db.insert("negotiation_terms_proposals", {
      negotiation_id: negotiation._id,
      version: maxVersion + 1,
      status: NEGOTIATION_PROPOSAL_STATUS.DRAFT,
      monthly_rent_paise: args.monthly_rent_paise,
      security_deposit_paise: args.security_deposit_paise,
      security_deposit_months: args.security_deposit_months,
      lock_in_period_months: args.lock_in_period_months,
      notice_period_months: args.notice_period_months,
      move_in_date: args.move_in_date,
      maintenance_charges_paise: args.maintenance_charges_paise,
      maintenance_paid_by: args.maintenance_paid_by,
      rent_escalation_type: args.rent_escalation_type,
      rent_escalation_value: args.rent_escalation_value,
      furnishing_terms: normalizeRequiredString(args.furnishing_terms, "furnishing_terms"),
      brokerage_tenant_side_paise: args.brokerage_tenant_side_paise,
      brokerage_owner_side_paise: args.brokerage_owner_side_paise,
      token_advance_amount_paise: args.token_advance_amount_paise,
      special_conditions: normalizeOptionalString(args.special_conditions),
      created_by_admin_id: actingUser._id,
      created_at: now,
      shared_to_rooms: undefined,
      shared_at: undefined,
      is_locked: false,
      locked_at: undefined,
      is_deleted: false,
    });

    await ctx.db.patch(negotiation._id, {
      active_proposal_id: proposalId,
      last_activity_at: now,
    });

    await ctx.runMutation(internal.negotiations.checkExcessiveRounds, {
      negotiation_id: negotiation._id,
      proposal_count: activeProposalCount,
    });

    return proposalId;
  },
});

export const edit = mutation({
  args: {
    proposal_id: v.id("negotiation_terms_proposals"),
    monthly_rent_paise: v.optional(v.number()),
    security_deposit_paise: v.optional(v.number()),
    security_deposit_months: v.optional(v.number()),
    lock_in_period_months: v.optional(v.number()),
    notice_period_months: v.optional(v.number()),
    move_in_date: v.optional(v.number()),
    maintenance_charges_paise: v.optional(v.number()),
    maintenance_paid_by: v.optional(maintenancePaidByValidator),
    rent_escalation_type: v.optional(rentEscalationTypeValidator),
    rent_escalation_value: v.optional(v.number()),
    furnishing_terms: v.optional(v.string()),
    brokerage_tenant_side_paise: v.optional(v.number()),
    brokerage_owner_side_paise: v.optional(v.number()),
    token_advance_amount_paise: v.optional(v.number()),
    special_conditions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const proposal = await ctx.db.get(args.proposal_id);
    if (!proposal || proposal.is_deleted) {
      throw new Error("Proposal not found");
    }

    if (proposal.status !== NEGOTIATION_PROPOSAL_STATUS.DRAFT) {
      throw new Error("Only draft proposals can be edited");
    }

    if (proposal.is_locked) {
      throw new Error("Locked proposals cannot be edited");
    }

    const negotiation = await getNegotiationOrThrow(ctx, proposal.negotiation_id);
    assertProposalMutationAllowed(negotiation);

    const shouldValidateEscalation =
      args.rent_escalation_type !== undefined || args.rent_escalation_value !== undefined;
    const nextRentEscalationType = args.rent_escalation_type ?? proposal.rent_escalation_type;
    const nextRentEscalationValue = args.rent_escalation_value ?? proposal.rent_escalation_value;

    validateProposalTermBoundaries({
      monthly_rent_paise: args.monthly_rent_paise,
      security_deposit_months: args.security_deposit_months,
      lock_in_period_months: args.lock_in_period_months,
      notice_period_months: args.notice_period_months,
      move_in_date: args.move_in_date,
      rent_escalation_type: shouldValidateEscalation ? nextRentEscalationType : undefined,
      rent_escalation_value: shouldValidateEscalation ? nextRentEscalationValue : undefined,
      brokerage_tenant_side_paise: args.brokerage_tenant_side_paise,
      brokerage_owner_side_paise: args.brokerage_owner_side_paise,
    });

    const patch: Partial<ProposalDoc> = {};

    if (args.monthly_rent_paise !== undefined) {
      patch.monthly_rent_paise = args.monthly_rent_paise;
    }

    if (args.security_deposit_paise !== undefined) {
      assertNonNegativeIntegerPaise(args.security_deposit_paise, "security_deposit_paise");
      patch.security_deposit_paise = args.security_deposit_paise;
    }

    if (args.security_deposit_months !== undefined) {
      patch.security_deposit_months = args.security_deposit_months;
    }

    if (args.lock_in_period_months !== undefined) {
      patch.lock_in_period_months = args.lock_in_period_months;
    }

    if (args.notice_period_months !== undefined) {
      patch.notice_period_months = args.notice_period_months;
    }

    if (args.move_in_date !== undefined) {
      patch.move_in_date = args.move_in_date;
    }

    if (args.maintenance_charges_paise !== undefined) {
      assertNonNegativeIntegerPaise(args.maintenance_charges_paise, "maintenance_charges_paise");
      patch.maintenance_charges_paise = args.maintenance_charges_paise;
    }

    if (args.maintenance_paid_by !== undefined) {
      patch.maintenance_paid_by = args.maintenance_paid_by;
    }

    if (args.rent_escalation_type !== undefined) {
      patch.rent_escalation_type = args.rent_escalation_type;
    }

    if (args.rent_escalation_value !== undefined) {
      patch.rent_escalation_value = args.rent_escalation_value;
    }

    if (args.furnishing_terms !== undefined) {
      patch.furnishing_terms = normalizeRequiredString(args.furnishing_terms, "furnishing_terms");
    }

    if (args.brokerage_tenant_side_paise !== undefined) {
      assertNonNegativeIntegerPaise(
        args.brokerage_tenant_side_paise,
        "brokerage_tenant_side_paise",
      );
      patch.brokerage_tenant_side_paise = args.brokerage_tenant_side_paise;
    }

    if (args.brokerage_owner_side_paise !== undefined) {
      assertNonNegativeIntegerPaise(args.brokerage_owner_side_paise, "brokerage_owner_side_paise");
      patch.brokerage_owner_side_paise = args.brokerage_owner_side_paise;
    }

    if (args.token_advance_amount_paise !== undefined) {
      assertNonNegativeIntegerPaise(args.token_advance_amount_paise, "token_advance_amount_paise");
      patch.token_advance_amount_paise = args.token_advance_amount_paise;
    }

    if (args.special_conditions !== undefined) {
      patch.special_conditions = normalizeOptionalString(args.special_conditions);
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(proposal._id, patch);
    }

    return proposal._id;
  },
});

export const share = mutation({
  args: {
    proposal_id: v.id("negotiation_terms_proposals"),
    room_types: v.array(negotiationRoomTypeValidator),
  },
  handler: async (ctx, args) => {
    const actingUser = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const proposal = await ctx.db.get(args.proposal_id);
    if (!proposal || proposal.is_deleted) {
      throw new Error("Proposal not found");
    }

    if (proposal.status !== NEGOTIATION_PROPOSAL_STATUS.DRAFT) {
      throw new Error("Only draft proposals can be shared");
    }

    if (!validateProposalTransition(proposal.status, NEGOTIATION_PROPOSAL_STATUS.SHARED)) {
      throw new Error("Invalid proposal status transition from DRAFT to SHARED");
    }

    if (args.room_types.length === 0) {
      throw new Error("room_types must include at least one negotiation room type");
    }

    const negotiation = await getNegotiationOrThrow(ctx, proposal.negotiation_id);
    assertProposalMutationAllowed(negotiation);

    if (negotiation.active_proposal_id?.toString() !== proposal._id.toString()) {
      throw new Error("Can only share the active proposal");
    }

    const proposalsInNegotiation = await ctx.db
      .query("negotiation_terms_proposals")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation._id))
      .collect();

    const priorSharedProposals = proposalsInNegotiation.filter(
      (existingProposal) =>
        existingProposal._id.toString() !== proposal._id.toString() &&
        !existingProposal.is_deleted &&
        existingProposal.shared_at !== undefined &&
        existingProposal.shared_to_rooms !== undefined &&
        existingProposal.shared_to_rooms.length > 0,
    );
    const hasPreviouslySharedProposal = priorSharedProposals.length > 0;

    const nextNegotiationStatus = hasPreviouslySharedProposal
      ? NEGOTIATION_STATUS.COUNTER_PROPOSED
      : NEGOTIATION_STATUS.TERMS_PROPOSED;

    const now = Date.now();
    const sharedRoomTypes = Array.from(new Set(args.room_types));
    const sharedChannels = sharedRoomTypes.map((roomType) => {
      if (roomType === NEGOTIATION_ROOM_TYPE.OPS_TENANT) {
        if (!negotiation.ops_tenant_channel_id) {
          throw new Error(`Cannot share to ${roomType} — room not yet created`);
        }
        return {
          roomType,
          channelId: negotiation.ops_tenant_channel_id,
        };
      }

      if (roomType === NEGOTIATION_ROOM_TYPE.OPS_OWNER) {
        if (!negotiation.ops_owner_channel_id) {
          throw new Error(`Cannot share to ${roomType} — room not yet created`);
        }
        return {
          roomType,
          channelId: negotiation.ops_owner_channel_id,
        };
      }

      if (!negotiation.combined_channel_id) {
        throw new Error(`Cannot share to ${roomType} — room not yet created`);
      }

      return {
        roomType,
        channelId: negotiation.combined_channel_id,
      };
    });

    await Promise.all(
      sharedChannels.map(async ({ roomType, channelId }) => {
        const channel = await ctx.db.get(channelId);
        if (!channel || channel.negotiation_id?.toString() !== negotiation._id.toString()) {
          throw new Error(`Channel for ${roomType} is invalid or belongs to another negotiation`);
        }
      }),
    );

    const sharedChannelIds = sharedChannels.map(({ channelId }) => channelId);

    await ctx.db.patch(proposal._id, {
      status: NEGOTIATION_PROPOSAL_STATUS.SHARED,
      shared_to_rooms: sharedRoomTypes,
      shared_at: now,
    });

    if (sharedChannelIds.length > 0) {
      const content = `NEGOTIATION_PROPOSAL_SHARED:${proposal.negotiation_id}:${proposal._id}`;

      await Promise.all(
        sharedChannelIds.map((channelId) =>
          ctx.db.insert("chat_messages", {
            channel_id: channelId,
            sender_user_id: actingUser._id,
            sender_role: "SYSTEM",
            original_content: content,
            masked_content: content,
            batch_id: undefined,
            status: "DELIVERED",
            failure_reason: undefined,
            admin_review_required: false,
            is_ai_processed: false,
            is_impersonated: false,
            is_deleted: false,
            created_at: now,
            delivered_at: now,
          }),
        ),
      );
    }

    if (negotiation.status === nextNegotiationStatus) {
      await ctx.db.patch(negotiation._id, {
        last_activity_at: now,
      });
      return proposal._id;
    }

    if (!validateNegotiationTransition(negotiation.status, nextNegotiationStatus)) {
      throw new Error(
        `Invalid negotiation status transition from ${negotiation.status} to ${nextNegotiationStatus}`,
      );
    }

    await ctx.db.patch(negotiation._id, {
      status: nextNegotiationStatus,
      last_activity_at: now,
    });

    return proposal._id;
  },
});

export const supersede = mutation({
  args: {
    proposal_id: v.id("negotiation_terms_proposals"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const proposal = await ctx.db.get(args.proposal_id);
    if (!proposal || proposal.is_deleted) {
      throw new Error("Proposal not found");
    }

    if (
      proposal.status !== NEGOTIATION_PROPOSAL_STATUS.DRAFT &&
      proposal.status !== NEGOTIATION_PROPOSAL_STATUS.SHARED
    ) {
      throw new Error("Only draft or shared proposals can be superseded");
    }

    if (proposal.is_locked) {
      throw new Error("Locked proposals cannot be superseded");
    }

    const negotiation = await getNegotiationOrThrow(ctx, proposal.negotiation_id);
    assertProposalMutationAllowed(negotiation);

    validateProposalTermBoundaries({
      monthly_rent_paise: proposal.monthly_rent_paise,
      security_deposit_months: proposal.security_deposit_months,
      lock_in_period_months: proposal.lock_in_period_months,
      notice_period_months: proposal.notice_period_months,
      move_in_date: proposal.move_in_date,
      rent_escalation_type: proposal.rent_escalation_type,
      rent_escalation_value: proposal.rent_escalation_value,
      brokerage_tenant_side_paise: proposal.brokerage_tenant_side_paise,
      brokerage_owner_side_paise: proposal.brokerage_owner_side_paise,
    });

    if (!validateProposalTransition(proposal.status, NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED)) {
      throw new Error(`Invalid proposal status transition from ${proposal.status} to SUPERSEDED`);
    }

    await ctx.db.patch(proposal._id, {
      status: NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED,
    });

    if (negotiation.active_proposal_id === proposal._id) {
      await ctx.db.patch(negotiation._id, {
        active_proposal_id: undefined,
        last_activity_at: Date.now(),
      });
    }

    return proposal._id;
  },
});

export const list = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const proposals = await ctx.db
      .query("negotiation_terms_proposals")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", args.negotiation_id))
      .collect();

    return proposals
      .filter((proposal) => !proposal.is_deleted)
      .sort((a, b) => b.version - a.version);
  },
});

export const getById = query({
  args: {
    proposal_id: v.id("negotiation_terms_proposals"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const proposal = await ctx.db.get(args.proposal_id);
    if (!proposal || proposal.is_deleted) {
      return null;
    }

    return proposal;
  },
});

export const signTerms = mutation({
  args: {
    proposal_id: v.id("negotiation_terms_proposals"),
    agreement_text: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    await rateLimiter.limit(ctx, "negotiation:sign_terms", {
      key: user._id,
      throws: true,
    });

    const proposal = await ctx.db.get(args.proposal_id);
    if (!proposal || proposal.is_deleted) {
      throw new Error("Proposal not found");
    }

    if (proposal.status !== NEGOTIATION_PROPOSAL_STATUS.SHARED) {
      throw new Error("Only shared proposals can be signed");
    }

    const negotiation = await getNegotiationOrThrow(ctx, proposal.negotiation_id);
    const signerRole = resolveSignerRole(user, negotiation);
    const signerRoomType = getSignerRoomType(signerRole);

    if (negotiation.active_proposal_id?.toString() !== proposal._id.toString()) {
      throw new Error("Proposal is no longer active — it has been superseded.");
    }

    if (!isProposalSharedToRoom(proposal, signerRoomType)) {
      throw new Error("Proposal is not shared to your room");
    }

    const existingSignature = await ctx.db
      .query("negotiation_terms_signatures")
      .withIndex("by_proposal_user", (q) =>
        q.eq("proposal_id", proposal._id).eq("user_id", user._id).eq("is_deleted", false),
      )
      .first();

    if (existingSignature) {
      throw new Error("You have already signed this proposal");
    }

    const signedAt = Date.now();
    const signaturePayload = {
      proposal_id: proposal._id,
      negotiation_id: negotiation._id,
      version: proposal.version,
      user_id: user._id,
      user_role: signerRole,
      terms: getProposalTermsSnapshot(proposal),
      signed_at: signedAt,
    };

    const hashInput = JSON.stringify(signaturePayload);
    const encodedPayload = new TextEncoder().encode(hashInput);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encodedPayload);
    const signatureHashHex = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    if (signatureHashHex.length !== 64) {
      throw new Error("Failed to generate signature hash");
    }

    const signatureId = await ctx.db.insert("negotiation_terms_signatures", {
      proposal_id: proposal._id,
      negotiation_id: negotiation._id,
      user_id: user._id,
      user_role: signerRole,
      signed_at: signedAt,
      agreement_text: normalizeRequiredString(args.agreement_text, "agreement_text"),
      proposal_version: proposal.version,
      is_deleted: false,
    });

    // Race condition check: if the same user signs twice simultaneously, both inserts succeed.
    // Query for all signatures by this user for this proposal. If >1, delete our insert.
    const signaturesForUser = await ctx.db
      .query("negotiation_terms_signatures")
      .withIndex("by_proposal_user", (q) =>
        q.eq("proposal_id", proposal._id).eq("user_id", user._id).eq("is_deleted", false),
      )
      .collect();

    if (signaturesForUser.length > 1) {
      await ctx.db.delete(signatureId);
      throw new Error("Signature already exists. Another request may have signed simultaneously.");
    }

    await ctx.db.patch(negotiation._id, {
      last_activity_at: Date.now(),
    });

    const signatures = await ctx.db
      .query("negotiation_terms_signatures")
      .withIndex("by_proposal_id", (q) => q.eq("proposal_id", proposal._id))
      .collect();

    const activeSignatures = signatures.filter((signature) => !signature.is_deleted);
    const hasTenantSignature = activeSignatures.some(
      (signature) => signature.user_role === "TENANT",
    );
    const hasOwnerSignature = activeSignatures.some((signature) => signature.user_role === "OWNER");

    if (hasTenantSignature && hasOwnerSignature) {
      if (!validateProposalTransition(proposal.status, NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED)) {
        throw new Error("Invalid proposal status transition from SHARED to BOTH_AGREED");
      }

      if (!validateNegotiationTransition(negotiation.status, NEGOTIATION_STATUS.TERMS_AGREED)) {
        throw new Error(
          `Invalid negotiation status transition from ${negotiation.status} to TERMS_AGREED`,
        );
      }

      const now = Date.now();

      await ctx.db.patch(proposal._id, {
        status: NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED,
        is_locked: true,
        locked_at: now,
      });

      await ctx.db.patch(negotiation._id, {
        status: NEGOTIATION_STATUS.TERMS_AGREED,
        terms_agreed_at: now,
        last_activity_at: now,
      });
    }

    return signatureId;
  },
});

export const getActiveProposal = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    let viewerRoomType: "OPS_TENANT" | "OPS_OWNER" | null = null;

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
      viewerRoomType = NEGOTIATION_ROOM_TYPE.OPS_TENANT;
    } else if (
      user.user_type === USER_TYPE.OWNER &&
      negotiation.owner_user_id &&
      user._id.toString() === negotiation.owner_user_id.toString()
    ) {
      viewerRoomType = NEGOTIATION_ROOM_TYPE.OPS_OWNER;
    } else {
      return null;
    }

    if (!negotiation.active_proposal_id) {
      return null;
    }

    const proposal = await ctx.db.get(negotiation.active_proposal_id);
    if (!proposal || proposal.is_deleted) {
      return null;
    }

    if (viewerRoomType) {
      const isShareVisibleStatus =
        proposal.status === NEGOTIATION_PROPOSAL_STATUS.SHARED ||
        proposal.status === NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED;
      if (!isShareVisibleStatus) {
        return null;
      }

      if (!isProposalSharedToRoom(proposal, viewerRoomType)) {
        return null;
      }
    }

    const signatures = await ctx.db
      .query("negotiation_terms_signatures")
      .withIndex("by_proposal_id", (q) => q.eq("proposal_id", proposal._id))
      .collect();

    return {
      proposal,
      signatures: signatures.filter((signature) => !signature.is_deleted),
    };
  },
});

export const getProposalHistory = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const proposals = await ctx.db
      .query("negotiation_terms_proposals")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", args.negotiation_id))
      .collect();

    const sortedProposals = proposals
      .filter((proposal) => !proposal.is_deleted)
      .sort((a, b) => b.version - a.version);

    return await Promise.all(
      sortedProposals.map(async (proposal) => {
        const signatures = await ctx.db
          .query("negotiation_terms_signatures")
          .withIndex("by_proposal_id", (q) => q.eq("proposal_id", proposal._id))
          .collect();

        return {
          proposal,
          signatures: signatures.filter((signature) => !signature.is_deleted),
        };
      }),
    );
  },
});
