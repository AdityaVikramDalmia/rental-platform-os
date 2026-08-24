import { v } from "convex/values";
import {
  CHAT_CHANNEL_STATUS,
  NEGOTIATION_PROPOSAL_STATUS,
  NEGOTIATION_ROOM_TYPE,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  SYSTEM_CONFIG_DEFAULTS,
  SYSTEM_CONFIG_KEYS,
  TENANT_INQUIRY_STATUS,
  TOKEN_RECORD_STATUS,
  USER_TYPE,
} from "../lib/constants";
import { isNegotiationTerminal, validateNegotiationTransition } from "../lib/negotiation";
import { getSystemConfigNumber } from "./systemConfig.helpers";
import { requireAdmin, requireAuth, requireBackoffice, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";
import { validateTenantInquiryTransition } from "./tenantInquiries";

const negotiationRoomTypeValidator = v.union(
  v.literal(NEGOTIATION_ROOM_TYPE.OPS_TENANT),
  v.literal(NEGOTIATION_ROOM_TYPE.OPS_OWNER),
  v.literal(NEGOTIATION_ROOM_TYPE.COMBINED),
);

const negotiationStatusValidator = v.union(
  v.literal(NEGOTIATION_STATUS.INITIATED),
  v.literal(NEGOTIATION_STATUS.ACTIVE),
  v.literal(NEGOTIATION_STATUS.TERMS_PROPOSED),
  v.literal(NEGOTIATION_STATUS.COUNTER_PROPOSED),
  v.literal(NEGOTIATION_STATUS.TERMS_AGREED),
  v.literal(NEGOTIATION_STATUS.TOKEN_COLLECTED),
  v.literal(NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS),
  v.literal(NEGOTIATION_STATUS.READY_FOR_CLOSURE),
  v.literal(NEGOTIATION_STATUS.CLOSED),
  v.literal(NEGOTIATION_STATUS.FAILED),
  v.literal(NEGOTIATION_STATUS.STALLED),
  v.literal(NEGOTIATION_STATUS.EXPIRED),
);

const negotiationSortByValidator = v.union(
  v.literal("created_at"),
  v.literal("last_activity_at"),
  v.literal("days_in_status"),
);

const negotiationSortOrderValidator = v.union(v.literal("asc"), v.literal("desc"));

const publicInitiationStatuses = new Set<string>([
  TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
  TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
]);

const visitHookInitiationStatuses = new Set<string>([
  TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
  TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
]);

const DAY_MS = 86_400_000;
const DEFAULT_NEGOTIATION_STALE_DAYS = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.NEGOTIATION_STALE_DAYS],
  10,
);
const DEFAULT_NEGOTIATION_MAX_ROUNDS = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.NEGOTIATION_MAX_ROUNDS],
  10,
);
const DEFAULT_NEGOTIATION_TOKEN_AGREEMENT_DAYS = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.NEGOTIATION_TOKEN_AGREEMENT_DAYS],
  10,
);

const ESCALATION_NEGOTIATION_STATUSES = [
  NEGOTIATION_STATUS.INITIATED,
  NEGOTIATION_STATUS.ACTIVE,
  NEGOTIATION_STATUS.TERMS_PROPOSED,
  NEGOTIATION_STATUS.COUNTER_PROPOSED,
  NEGOTIATION_STATUS.TERMS_AGREED,
  NEGOTIATION_STATUS.TOKEN_COLLECTED,
  NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
  NEGOTIATION_STATUS.READY_FOR_CLOSURE,
  NEGOTIATION_STATUS.STALLED,
] as const;

const ALL_NEGOTIATION_PROPOSAL_STATUSES = [
  NEGOTIATION_PROPOSAL_STATUS.DRAFT,
  NEGOTIATION_PROPOSAL_STATUS.SHARED,
  NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED,
  NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED,
] as const;

type NegotiationReaderCtx = {
  db: Pick<QueryCtx["db"], "query">;
};

async function getEscalationNegotiations(ctx: MutationCtx): Promise<Doc<"negotiations">[]> {
  const negotiationGroups = await Promise.all(
    ESCALATION_NEGOTIATION_STATUSES.map(async (status) => {
      return await ctx.db
        .query("negotiations")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(1000);
    }),
  );

  return negotiationGroups
    .flat()
    .filter((negotiation) => !negotiation.is_deleted && !isNegotiationTerminal(negotiation.status));
}

function normalizeRequiredReason(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("failure_reason is required");
  }
  return normalized;
}

function normalizeOptionalSearch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized.toLowerCase() : undefined;
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function normalizeThreshold(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

type EscalationFlags = {
  is_stale: boolean;
  too_many_rounds: boolean;
  token_without_agreement: boolean;
};

async function getEscalationThresholds(ctx: MutationCtx | QueryCtx): Promise<{
  staleDays: number;
  maxRounds: number;
  tokenAgreementDays: number;
}> {
  const [staleDays, maxRounds, tokenAgreementDays] = await Promise.all([
    getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NEGOTIATION_STALE_DAYS,
      DEFAULT_NEGOTIATION_STALE_DAYS,
    ),
    getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NEGOTIATION_MAX_ROUNDS,
      DEFAULT_NEGOTIATION_MAX_ROUNDS,
    ),
    getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NEGOTIATION_TOKEN_AGREEMENT_DAYS,
      DEFAULT_NEGOTIATION_TOKEN_AGREEMENT_DAYS,
    ),
  ]);

  return {
    staleDays: normalizeThreshold(staleDays, DEFAULT_NEGOTIATION_STALE_DAYS),
    maxRounds: normalizeThreshold(maxRounds, DEFAULT_NEGOTIATION_MAX_ROUNDS),
    tokenAgreementDays: normalizeThreshold(
      tokenAgreementDays,
      DEFAULT_NEGOTIATION_TOKEN_AGREEMENT_DAYS,
    ),
  };
}

async function patchEscalationFlagsIfChanged(
  ctx: MutationCtx,
  negotiation: Doc<"negotiations">,
  nextFlags: EscalationFlags,
): Promise<boolean> {
  const patch: Partial<Doc<"negotiations">> = {};

  if ((negotiation.is_stale ?? false) !== nextFlags.is_stale) {
    patch.is_stale = nextFlags.is_stale;
  }

  if ((negotiation.too_many_rounds ?? false) !== nextFlags.too_many_rounds) {
    patch.too_many_rounds = nextFlags.too_many_rounds;
  }

  if ((negotiation.token_without_agreement ?? false) !== nextFlags.token_without_agreement) {
    patch.token_without_agreement = nextFlags.token_without_agreement;
  }

  if (negotiation.stale_flagged !== nextFlags.is_stale) {
    patch.stale_flagged = nextFlags.is_stale;
  }

  if (negotiation.rounds_flagged !== nextFlags.too_many_rounds) {
    patch.rounds_flagged = nextFlags.too_many_rounds;
  }

  if (Object.keys(patch).length === 0) {
    return false;
  }

  patch.escalation_flags_updated_at = Date.now();
  const hasActiveFlags =
    nextFlags.is_stale || nextFlags.too_many_rounds || nextFlags.token_without_agreement;
  if (hasActiveFlags) {
    patch.flag_dismissed_at = undefined;
    patch.flag_dismissed_reason = undefined;
  }

  await ctx.db.patch(negotiation._id, patch);
  return true;
}

async function getNegotiationOrThrow(
  ctx: MutationCtx | QueryCtx,
  negotiationId: Id<"negotiations">,
) {
  const negotiation = await ctx.db.get(negotiationId);
  if (!negotiation || negotiation.is_deleted) {
    throw new Error("Negotiation not found");
  }
  return negotiation;
}

async function getActiveNegotiationForInquiry(
  ctx: NegotiationReaderCtx,
  tenantInquiryId: Id<"tenant_inquiries">,
) {
  const negotiations = await ctx.db
    .query("negotiations")
    .withIndex("by_tenant_inquiry_id", (q) => q.eq("tenant_inquiry_id", tenantInquiryId))
    .take(1000);

  return (
    negotiations.find(
      (negotiation) => !negotiation.is_deleted && !isNegotiationTerminal(negotiation.status),
    ) ?? null
  );
}

async function initiateNegotiationInternal(
  ctx: MutationCtx,
  args: {
    tenant_inquiry_id: Id<"tenant_inquiries">;
    initiated_by_admin_id: Id<"users">;
    allow_visit_scheduled_status: boolean;
    return_null_if_exists: boolean;
  },
): Promise<Id<"negotiations"> | null> {
  const inquiry = await ctx.db.get(args.tenant_inquiry_id);
  if (!inquiry) {
    throw new Error("Tenant inquiry not found");
  }

  const allowedStatuses = args.allow_visit_scheduled_status
    ? visitHookInitiationStatuses
    : publicInitiationStatuses;

  if (!allowedStatuses.has(inquiry.status)) {
    throw new Error(
      "Negotiation can only be initiated for VISIT_COMPLETED or existing NEGOTIATION_INITIATED inquiries",
    );
  }

  const activeNegotiation = await getActiveNegotiationForInquiry(ctx, inquiry._id);
  if (activeNegotiation) {
    return args.return_null_if_exists ? null : activeNegotiation._id;
  }

  if (!inquiry.tenant_id) {
    throw new Error("Tenant inquiry is missing tenant linkage");
  }

  const listing = await ctx.db.get(inquiry.listing_id);
  if (!listing) {
    throw new Error("Listing not found for tenant inquiry");
  }

  const tenantUser = await ctx.db.get(inquiry.tenant_id);
  if (!tenantUser) {
    throw new Error("Tenant user not found");
  }

  if (
    !(
      tenantUser.user_types?.includes(USER_TYPE.TENANT) ?? tenantUser.user_type === USER_TYPE.TENANT
    )
  ) {
    throw new Error("Tenant inquiry is not linked to a tenant user");
  }

  const now = Date.now();

  const negotiationId = await ctx.db.insert("negotiations", {
    tenant_inquiry_id: inquiry._id,
    listing_id: inquiry.listing_id,
    tenant_user_id: inquiry.tenant_id,
    owner_user_id: undefined,
    initiated_by_admin_id: args.initiated_by_admin_id,
    status: NEGOTIATION_STATUS.INITIATED,
    failure_reason: undefined,
    failure_notes: undefined,
    ops_tenant_channel_id: undefined,
    ops_owner_channel_id: undefined,
    combined_channel_id: undefined,
    active_proposal_id: undefined,
    police_verification_status: undefined,
    society_noc_status: undefined,
    owner_kyc_status: undefined,
    agreement_drafting_status: undefined,
    stamp_registration_status: undefined,
    rent_agreement_storage_id: undefined,
    rent_agreement_status: undefined,
    key_handover_status: undefined,
    move_in_inspection_status: undefined,
    move_in_inspection_notes: undefined,
    police_verification_waive_reason: undefined,
    society_noc_waive_reason: undefined,
    owner_kyc_waive_reason: undefined,
    rent_agreement_waive_reason: undefined,
    key_handover_waive_reason: undefined,
    move_in_inspection_waive_reason: undefined,
    initiated_at: now,
    terms_agreed_at: undefined,
    ready_for_closure_at: undefined,
    failed_at: undefined,
    last_activity_at: now,
    stale_flagged: false,
    rounds_flagged: false,
    is_stale: false,
    too_many_rounds: false,
    token_without_agreement: false,
    escalation_flags_updated_at: now,
    flag_dismissed_at: undefined,
    flag_dismissed_reason: undefined,
    is_deleted: false,
  });

  const opsTenantChannelId = await ctx.runMutation(internal.negotiations.createNegotiationRoom, {
    negotiation_id: negotiationId,
    inquiry_id: inquiry._id,
    channel_type: NEGOTIATION_ROOM_TYPE.OPS_TENANT,
    admin_id: args.initiated_by_admin_id,
  });

  await ctx.db.patch(negotiationId, {
    ops_tenant_channel_id: opsTenantChannelId,
    last_activity_at: Date.now(),
  });

  if (!validateNegotiationTransition(NEGOTIATION_STATUS.INITIATED, NEGOTIATION_STATUS.ACTIVE)) {
    throw new Error("Invalid negotiation status transition from INITIATED to ACTIVE");
  }

  await ctx.db.patch(negotiationId, {
    status: NEGOTIATION_STATUS.ACTIVE,
    last_activity_at: Date.now(),
  });

  if (inquiry.status !== TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED) {
    if (
      !validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED)
    ) {
      throw new Error(`Cannot initiate negotiation for inquiry with status: ${inquiry.status}`);
    }

    await ctx.db.patch(inquiry._id, {
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
      updated_at: Date.now(),
    });
  }

  return negotiationId;
}

export const initiate = mutation({
  args: {
    tenant_inquiry_id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const actingUser = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    await rateLimiter.limit(ctx, "negotiation:initiate", {
      key: actingUser._id,
      throws: true,
    });

    const negotiationId = await initiateNegotiationInternal(ctx, {
      tenant_inquiry_id: args.tenant_inquiry_id,
      initiated_by_admin_id: actingUser._id,
      allow_visit_scheduled_status: false,
      return_null_if_exists: false,
    });

    if (!negotiationId) {
      throw new Error("Failed to initiate negotiation");
    }

    return negotiationId;
  },
});

export const linkOwnerToNegotiation = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    owner_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);

    if (isNegotiationTerminal(negotiation.status)) {
      throw new Error("Cannot link owner for terminal negotiation");
    }

    if (negotiation.owner_user_id) {
      if (negotiation.owner_user_id.toString() === args.owner_user_id.toString()) {
        return negotiation._id;
      }

      throw new Error("Negotiation already linked to a different owner");
    }

    const ownerUser = await ctx.db.get(args.owner_user_id);
    if (!ownerUser) {
      throw new Error("Owner user not found");
    }

    if (
      !(ownerUser.user_types?.includes(USER_TYPE.OWNER) ?? ownerUser.user_type === USER_TYPE.OWNER)
    ) {
      throw new Error("Linked user must be an OWNER");
    }

    await ctx.db.patch(negotiation._id, {
      owner_user_id: ownerUser._id,
      last_activity_at: Date.now(),
    });

    return negotiation._id;
  },
});

export const openOwnerRoom = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args): Promise<Id<"chat_channels">> => {
    const actingUser = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const negotiation = await ctx.db.get(args.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      throw new Error("Negotiation not found");
    }

    if (isNegotiationTerminal(negotiation.status)) {
      throw new Error("Cannot open room for terminal negotiation");
    }

    if (!negotiation.owner_user_id) {
      throw new Error("Owner must be linked before opening owner room");
    }

    if (negotiation.ops_owner_channel_id) {
      return negotiation.ops_owner_channel_id;
    }

    const channelId: Id<"chat_channels"> = await ctx.runMutation(
      internal.negotiations.createNegotiationRoom,
      {
        negotiation_id: negotiation._id,
        inquiry_id: negotiation.tenant_inquiry_id,
        channel_type: NEGOTIATION_ROOM_TYPE.OPS_OWNER,
        admin_id: actingUser._id,
      },
    );

    await ctx.db.patch(negotiation._id, {
      ops_owner_channel_id: channelId,
      last_activity_at: Date.now(),
    });

    return channelId;
  },
});

export const openCombinedRoom = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args): Promise<Id<"chat_channels">> => {
    const actingUser = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const negotiation = await ctx.db.get(args.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      throw new Error("Negotiation not found");
    }

    if (isNegotiationTerminal(negotiation.status)) {
      throw new Error("Cannot open room for terminal negotiation");
    }

    if (negotiation.combined_channel_id) {
      return negotiation.combined_channel_id;
    }

    if (!negotiation.ops_tenant_channel_id || !negotiation.ops_owner_channel_id) {
      throw new Error("Both OPS_TENANT and OPS_OWNER rooms must be open before combined room");
    }

    const channelId: Id<"chat_channels"> = await ctx.runMutation(
      internal.negotiations.createNegotiationRoom,
      {
        negotiation_id: negotiation._id,
        inquiry_id: negotiation.tenant_inquiry_id,
        channel_type: NEGOTIATION_ROOM_TYPE.COMBINED,
        admin_id: actingUser._id,
      },
    );

    await ctx.db.patch(negotiation._id, {
      combined_channel_id: channelId,
      last_activity_at: Date.now(),
    });

    return channelId;
  },
});

export const markFailed = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    failure_reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const failureReason = normalizeRequiredReason(args.failure_reason);
    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);

    if (isNegotiationTerminal(negotiation.status)) {
      throw new Error("Cannot update terminal negotiation");
    }

    if (!validateNegotiationTransition(negotiation.status, NEGOTIATION_STATUS.FAILED)) {
      throw new Error(
        `Invalid negotiation status transition from ${negotiation.status} to ${NEGOTIATION_STATUS.FAILED}`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(negotiation._id, {
      status: NEGOTIATION_STATUS.FAILED,
      failure_reason: failureReason,
      failed_at: now,
      last_activity_at: now,
      is_stale: false,
      too_many_rounds: false,
      token_without_agreement: false,
      stale_flagged: false,
      rounds_flagged: false,
      escalation_flags_updated_at: now,
    });

    return await ctx.db.get(negotiation._id);
  },
});

export const markStalled = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    failure_reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const failureReason = normalizeRequiredReason(args.failure_reason);
    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);

    if (isNegotiationTerminal(negotiation.status)) {
      throw new Error("Cannot update terminal negotiation");
    }

    if (!validateNegotiationTransition(negotiation.status, NEGOTIATION_STATUS.STALLED)) {
      throw new Error(
        `Invalid negotiation status transition from ${negotiation.status} to ${NEGOTIATION_STATUS.STALLED}`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(negotiation._id, {
      status: NEGOTIATION_STATUS.STALLED,
      failure_reason: failureReason,
      last_activity_at: now,
    });

    return await ctx.db.get(negotiation._id);
  },
});

export const markExpired = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    failure_reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const failureReason = normalizeRequiredReason(args.failure_reason);
    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);

    if (isNegotiationTerminal(negotiation.status)) {
      throw new Error("Cannot update terminal negotiation");
    }

    if (!validateNegotiationTransition(negotiation.status, NEGOTIATION_STATUS.EXPIRED)) {
      throw new Error(
        `Invalid negotiation status transition from ${negotiation.status} to ${NEGOTIATION_STATUS.EXPIRED}`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(negotiation._id, {
      status: NEGOTIATION_STATUS.EXPIRED,
      failure_reason: failureReason,
      last_activity_at: now,
      is_stale: false,
      too_many_rounds: false,
      token_without_agreement: false,
      stale_flagged: false,
      rounds_flagged: false,
      escalation_flags_updated_at: now,
    });

    return await ctx.db.get(negotiation._id);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getRentAgreementFile = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    if (!negotiation.rent_agreement_storage_id) {
      return null;
    }

    return {
      storage_id: negotiation.rent_agreement_storage_id,
      url: await ctx.storage.getUrl(negotiation.rent_agreement_storage_id),
    };
  },
});

export const createNegotiationRoom = internalMutation({
  args: {
    negotiation_id: v.id("negotiations"),
    inquiry_id: v.id("tenant_inquiries"),
    channel_type: negotiationRoomTypeValidator,
    admin_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const negotiation = await ctx.db.get(args.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      throw new Error("Negotiation not found");
    }

    if (negotiation.tenant_inquiry_id !== args.inquiry_id) {
      throw new Error("inquiry_id does not match negotiation's tenant_inquiry_id");
    }

    const inquiry = await ctx.db.get(args.inquiry_id);
    if (!inquiry) {
      throw new Error("Tenant inquiry not found");
    }

    return await ctx.db.insert("chat_channels", {
      inquiry_id: args.inquiry_id,
      status: CHAT_CHANNEL_STATUS.ACTIVE,
      created_by_admin_id: args.admin_id,
      created_at: Date.now(),
      channel_type: args.channel_type,
      negotiation_id: args.negotiation_id,
    });
  },
});

export const initiateFromVisit = internalMutation({
  args: {
    tenant_inquiry_id: v.id("tenant_inquiries"),
    initiated_by_admin_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await initiateNegotiationInternal(ctx, {
      tenant_inquiry_id: args.tenant_inquiry_id,
      initiated_by_admin_id: args.initiated_by_admin_id,
      allow_visit_scheduled_status: true,
      return_null_if_exists: true,
    });
  },
});

export const checkStaleNegotiations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { staleDays } = await getEscalationThresholds(ctx);
    const now = Date.now();
    const staleWindowMs = staleDays * DAY_MS;

    const negotiations = await getEscalationNegotiations(ctx);

    let processed = 0;
    let flagged = 0;
    let cleared = 0;

    for (const negotiation of negotiations) {
      processed += 1;
      const shouldBeStale = now - negotiation.last_activity_at > staleWindowMs;
      const wasStale = negotiation.is_stale ?? false;

      const updated = await patchEscalationFlagsIfChanged(ctx, negotiation, {
        is_stale: shouldBeStale,
        too_many_rounds: negotiation.too_many_rounds ?? false,
        token_without_agreement: negotiation.token_without_agreement ?? false,
      });

      if (updated && !wasStale && shouldBeStale) {
        flagged += 1;
      }

      if (updated && wasStale && !shouldBeStale) {
        cleared += 1;
      }
    }

    return {
      processed,
      flagged,
      cleared,
      staleDays,
      processedAt: now,
    };
  },
});

export const checkTokenWithoutAgreement = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { tokenAgreementDays } = await getEscalationThresholds(ctx);
    const now = Date.now();
    const tokenWindowMs = tokenAgreementDays * DAY_MS;

    const negotiations = await getEscalationNegotiations(ctx);

    let processed = 0;
    let flagged = 0;
    let cleared = 0;

    for (const negotiation of negotiations) {
      processed += 1;
      const wasFlagged = negotiation.token_without_agreement ?? false;
      let shouldFlag = false;

      if (negotiation.status === NEGOTIATION_STATUS.TOKEN_COLLECTED) {
        const tokenRecords = await ctx.db
          .query("negotiation_token_records")
          .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation._id))
          .order("desc")
          .take(1000);

        const latestCollectedTokenRecord = tokenRecords.find(
          (tokenRecord) =>
            !tokenRecord.is_deleted && tokenRecord.status === TOKEN_RECORD_STATUS.COLLECTED,
        );

        if (latestCollectedTokenRecord) {
          const tokenCollectedAt =
            latestCollectedTokenRecord.collected_at ?? latestCollectedTokenRecord._creationTime;
          shouldFlag = now - tokenCollectedAt > tokenWindowMs;
        }
      }

      const updated = await patchEscalationFlagsIfChanged(ctx, negotiation, {
        is_stale: negotiation.is_stale ?? false,
        too_many_rounds: negotiation.too_many_rounds ?? false,
        token_without_agreement: shouldFlag,
      });

      if (updated && !wasFlagged && shouldFlag) {
        flagged += 1;
      }

      if (updated && wasFlagged && !shouldFlag) {
        cleared += 1;
      }
    }

    return {
      processed,
      flagged,
      cleared,
      tokenAgreementDays,
      processedAt: now,
    };
  },
});

export const checkExcessiveRounds = internalMutation({
  args: {
    negotiation_id: v.id("negotiations"),
    proposal_count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const negotiation = await ctx.db.get(args.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      throw new Error("Negotiation not found");
    }

    const { maxRounds } = await getEscalationThresholds(ctx);

    const proposalCount =
      args.proposal_count ??
      (
        await ctx.db
          .query("negotiation_terms_proposals")
          .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", args.negotiation_id))
          .take(1000)
      ).filter((proposal) => !proposal.is_deleted).length;

    const shouldFlag = proposalCount > maxRounds;
    const wasFlagged = negotiation.too_many_rounds ?? false;
    const updated = await patchEscalationFlagsIfChanged(ctx, negotiation, {
      is_stale: negotiation.is_stale ?? false,
      too_many_rounds: shouldFlag,
      token_without_agreement: negotiation.token_without_agreement ?? false,
    });

    return {
      negotiationId: negotiation._id,
      proposalCount,
      maxRounds,
      tooManyRounds: shouldFlag,
      changed: updated,
      previousValue: wasFlagged,
      processedAt: Date.now(),
    };
  },
});

export const checkExcessiveRoundsCron = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { maxRounds } = await getEscalationThresholds(ctx);
    const negotiations = await getEscalationNegotiations(ctx);

    let processed = 0;
    let flagged = 0;
    let cleared = 0;

    for (const negotiation of negotiations) {
      const proposalCount = (
        await ctx.db
          .query("negotiation_terms_proposals")
          .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation._id))
          .take(1000)
      ).filter((proposal) => !proposal.is_deleted).length;

      const shouldFlag = proposalCount > maxRounds;
      const wasFlagged = negotiation.too_many_rounds ?? false;

      if (shouldFlag !== wasFlagged) {
        await patchEscalationFlagsIfChanged(ctx, negotiation, {
          is_stale: negotiation.is_stale ?? false,
          too_many_rounds: shouldFlag,
          token_without_agreement: negotiation.token_without_agreement ?? false,
        });

        if (shouldFlag) {
          flagged++;
        } else {
          cleared++;
        }
      }

      processed++;
    }

    return { processed, flagged, cleared };
  },
});

export const listRoomsForNegotiation = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const negotiation = await ctx.db.get(args.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      return [];
    }

    const channels = await ctx.db
      .query("chat_channels")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", args.negotiation_id))
      .take(1000);

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);
      return channels;
    }

    if (
      (user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT) &&
      user._id.toString() === negotiation.tenant_user_id.toString()
    ) {
      return channels.filter(
        (channel) =>
          channel.channel_type === NEGOTIATION_ROOM_TYPE.OPS_TENANT ||
          channel.channel_type === NEGOTIATION_ROOM_TYPE.COMBINED,
      );
    }

    if (
      (user.user_types?.includes(USER_TYPE.OWNER) ?? user.user_type === USER_TYPE.OWNER) &&
      negotiation.owner_user_id &&
      user._id.toString() === negotiation.owner_user_id.toString()
    ) {
      return channels.filter(
        (channel) =>
          channel.channel_type === NEGOTIATION_ROOM_TYPE.OPS_OWNER ||
          channel.channel_type === NEGOTIATION_ROOM_TYPE.COMBINED,
      );
    }

    return [];
  },
});

export const getById = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);
    const negotiation = await ctx.db.get(args.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      return null;
    }
    return negotiation;
  },
});

export const getByInquiryId = query({
  args: {
    tenant_inquiry_id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const activeNegotiation = await getActiveNegotiationForInquiry(ctx, args.tenant_inquiry_id);

    if (!activeNegotiation) {
      return null;
    }

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);
      return activeNegotiation;
    }

    if (
      (user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT) &&
      user._id.toString() === activeNegotiation.tenant_user_id.toString()
    ) {
      const { ops_owner_channel_id: _opsOwnerChannelId, ...tenantScopedNegotiation } =
        activeNegotiation;
      return tenantScopedNegotiation;
    }

    if (
      (user.user_types?.includes(USER_TYPE.OWNER) ?? user.user_type === USER_TYPE.OWNER) &&
      activeNegotiation.owner_user_id &&
      user._id.toString() === activeNegotiation.owner_user_id.toString()
    ) {
      const { ops_tenant_channel_id: _opsTenantChannelId, ...ownerScopedNegotiation } =
        activeNegotiation;
      return ownerScopedNegotiation;
    }

    return null;
  },
});

export const listForAdmin = query({
  args: {
    status_filter: v.optional(negotiationStatusValidator),
    search: v.optional(v.string()),
    sort_by: v.optional(negotiationSortByValidator),
    sort_order: v.optional(negotiationSortOrderValidator),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const limit = Math.min(Math.max(Math.floor(args.limit ?? 20), 1), 100);
    const cursorOffset = decodeCursor(args.cursor);
    const search = normalizeOptionalSearch(args.search);
    const sortBy = args.sort_by ?? "last_activity_at";
    const sortOrder = args.sort_order ?? "desc";
    const now = Date.now();

    const negotiationDocs = args.status_filter
      ? await ctx.db
          .query("negotiations")
          .withIndex("by_status", (q) => q.eq("status", args.status_filter!))
          .take(500)
      : await ctx.db.query("negotiations").withIndex("by_last_activity_at").order("desc").take(500);

    const negotiations = negotiationDocs.filter((negotiation) => !negotiation.is_deleted);

    if (negotiations.length === 0) {
      return {
        items: [],
        next_cursor: null,
        has_more: false,
        total_count: 0,
      };
    }

    const listingIds = [
      ...new Map(
        negotiations.map((negotiation) => [
          negotiation.listing_id.toString(),
          negotiation.listing_id,
        ]),
      ).values(),
    ];
    const userIds = [
      ...new Map(
        negotiations.flatMap((negotiation) => {
          const ids = [negotiation.tenant_user_id, negotiation.initiated_by_admin_id];
          if (negotiation.owner_user_id) {
            ids.push(negotiation.owner_user_id);
          }
          return ids.map((id) => [id.toString(), id] as const);
        }),
      ).values(),
    ];

    const listingMap = new Map<string, Doc<"listings"> | null>();
    await Promise.all(
      listingIds.map(async (listingId) => {
        listingMap.set(listingId.toString(), await ctx.db.get(listingId));
      }),
    );

    const userMap = new Map<string, Doc<"users"> | null>();
    await Promise.all(
      userIds.map(async (userId) => {
        userMap.set(userId.toString(), await ctx.db.get(userId));
      }),
    );

    const rows = negotiations.map((negotiation) => {
      const listing = listingMap.get(negotiation.listing_id.toString()) ?? null;
      const tenant = userMap.get(negotiation.tenant_user_id.toString()) ?? null;
      const owner = negotiation.owner_user_id
        ? (userMap.get(negotiation.owner_user_id.toString()) ?? null)
        : null;

      const statusStartedAt = negotiation.last_activity_at ?? negotiation.initiated_at;
      const daysInStatus = Math.max(0, Math.floor((now - statusStartedAt) / DAY_MS));

      return {
        _id: negotiation._id,
        negotiation,
        tenant_inquiry_id: negotiation.tenant_inquiry_id,
        listing_id: negotiation.listing_id,
        status: negotiation.status,
        created_at: negotiation.initiated_at,
        last_activity_at: negotiation.last_activity_at,
        listing_slug: listing?.slug ?? null,
        listing_name: listing
          ? `${listing.bhk_config} • ${listing.slug}`
          : `Listing ${negotiation.listing_id.slice(-6)}`,
        tenant_name: tenant?.name ?? "Unknown Tenant",
        owner_name: owner?.name ?? "Owner Unlinked",
        days_in_status: daysInStatus,
      };
    });

    const filteredRows = search
      ? rows.filter((row) => {
          const haystack =
            `${row.listing_name} ${row.listing_slug ?? ""} ${row.tenant_name} ${row.owner_name}`.toLowerCase();
          return haystack.includes(search);
        })
      : rows;

    const sortedRows = [...filteredRows].sort((a, b) => {
      let delta = 0;

      if (sortBy === "created_at") {
        delta = a.created_at - b.created_at;
      } else if (sortBy === "days_in_status") {
        delta = a.days_in_status - b.days_in_status;
      } else {
        delta = a.last_activity_at - b.last_activity_at;
      }

      if (delta === 0) {
        delta = a.created_at - b.created_at;
      }

      return sortOrder === "asc" ? delta : -delta;
    });

    const items = sortedRows.slice(cursorOffset, cursorOffset + limit);

    if (items.length === 0) {
      return {
        items: [],
        next_cursor: null,
        has_more: false,
        total_count: sortedRows.length,
      };
    }

    const itemNegotiationIds = new Set(items.map((item) => item._id.toString()));

    const [
      draftProposals,
      sharedProposals,
      agreedProposals,
      supersededProposals,
      collectedTokenRows,
    ] = await Promise.all([
      ctx.db
        .query("negotiation_terms_proposals")
        .withIndex("by_status", (q) => q.eq("status", NEGOTIATION_PROPOSAL_STATUS.DRAFT))
        .take(1000),
      ctx.db
        .query("negotiation_terms_proposals")
        .withIndex("by_status", (q) => q.eq("status", NEGOTIATION_PROPOSAL_STATUS.SHARED))
        .take(1000),
      ctx.db
        .query("negotiation_terms_proposals")
        .withIndex("by_status", (q) => q.eq("status", NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED))
        .take(1000),
      ctx.db
        .query("negotiation_terms_proposals")
        .withIndex("by_status", (q) => q.eq("status", NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED))
        .take(1000),
      ctx.db
        .query("negotiation_token_records")
        .withIndex("by_status", (q) => q.eq("status", TOKEN_RECORD_STATUS.COLLECTED))
        .take(1000),
    ]);

    const proposalCounts = new Map<string, number>();
    const allProposals = [
      ...draftProposals,
      ...sharedProposals,
      ...agreedProposals,
      ...supersededProposals,
    ];

    for (const proposal of allProposals) {
      if (proposal.is_deleted) {
        continue;
      }

      const negotiationId = proposal.negotiation_id.toString();
      if (!itemNegotiationIds.has(negotiationId)) {
        continue;
      }

      proposalCounts.set(negotiationId, (proposalCounts.get(negotiationId) ?? 0) + 1);
    }

    const negotiationsWithCollectedToken = new Set<string>();
    for (const tokenRecord of collectedTokenRows) {
      if (tokenRecord.is_deleted) {
        continue;
      }

      const negotiationId = tokenRecord.negotiation_id.toString();
      if (itemNegotiationIds.has(negotiationId)) {
        negotiationsWithCollectedToken.add(negotiationId);
      }
    }

    const enrichedItems = items.map(({ negotiation, ...item }) => {
      const negotiationId = negotiation._id.toString();
      const proposalCount = proposalCounts.get(negotiationId) ?? 0;
      const hasCollectedToken = negotiationsWithCollectedToken.has(negotiationId);

      const tokenWithoutAgreement =
        hasCollectedToken &&
        negotiation.status !== NEGOTIATION_STATUS.TOKEN_COLLECTED &&
        negotiation.status !== NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS &&
        negotiation.status !== NEGOTIATION_STATUS.READY_FOR_CLOSURE &&
        negotiation.status !== NEGOTIATION_STATUS.CLOSED;

      return {
        ...item,
        proposal_count: proposalCount,
        flags: {
          is_stale: negotiation.is_stale ?? negotiation.stale_flagged,
          too_many_rounds: negotiation.too_many_rounds ?? negotiation.rounds_flagged,
          token_without_agreement: negotiation.token_without_agreement ?? tokenWithoutAgreement,
        },
      };
    });

    const nextOffset = cursorOffset + items.length;
    const hasMore = nextOffset < sortedRows.length;

    return {
      items: enrichedItems,
      next_cursor: hasMore ? String(nextOffset) : null,
      has_more: hasMore,
      total_count: sortedRows.length,
    };
  },
});

export const statusCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const negotiations = await ctx.db
      .query("negotiations")
      .withIndex("by_last_activity_at")
      .order("desc")
      .take(500);

    const counts: Record<string, number> = {
      [NEGOTIATION_STATUS.INITIATED]: 0,
      [NEGOTIATION_STATUS.ACTIVE]: 0,
      [NEGOTIATION_STATUS.TERMS_PROPOSED]: 0,
      [NEGOTIATION_STATUS.COUNTER_PROPOSED]: 0,
      [NEGOTIATION_STATUS.TERMS_AGREED]: 0,
      [NEGOTIATION_STATUS.TOKEN_COLLECTED]: 0,
      [NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS]: 0,
      [NEGOTIATION_STATUS.READY_FOR_CLOSURE]: 0,
      [NEGOTIATION_STATUS.CLOSED]: 0,
      [NEGOTIATION_STATUS.FAILED]: 0,
      [NEGOTIATION_STATUS.STALLED]: 0,
      [NEGOTIATION_STATUS.EXPIRED]: 0,
    };

    for (const negotiation of negotiations) {
      if (negotiation.is_deleted) {
        continue;
      }

      counts[negotiation.status] = (counts[negotiation.status] ?? 0) + 1;
    }

    return counts;
  },
});

export const getDetailForAdmin = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const negotiation = await ctx.db.get(args.negotiation_id);
    if (!negotiation || negotiation.is_deleted) {
      return null;
    }

    const [listing, tenant, owner, initiatedBy, tokenRecords, proposals] = await Promise.all([
      ctx.db.get(negotiation.listing_id),
      ctx.db.get(negotiation.tenant_user_id),
      negotiation.owner_user_id ? ctx.db.get(negotiation.owner_user_id) : Promise.resolve(null),
      ctx.db.get(negotiation.initiated_by_admin_id),
      ctx.db
        .query("negotiation_token_records")
        .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation._id))
        .take(1000),
      ctx.db
        .query("negotiation_terms_proposals")
        .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation._id))
        .take(1000),
    ]);

    const hasCollectedToken = tokenRecords.some(
      (record) => !record.is_deleted && record.status === TOKEN_RECORD_STATUS.COLLECTED,
    );

    const fallbackTokenWithoutAgreement =
      hasCollectedToken &&
      negotiation.status !== NEGOTIATION_STATUS.TOKEN_COLLECTED &&
      negotiation.status !== NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS &&
      negotiation.status !== NEGOTIATION_STATUS.READY_FOR_CLOSURE &&
      negotiation.status !== NEGOTIATION_STATUS.CLOSED;

    const statusStartedAt = negotiation.last_activity_at ?? negotiation.initiated_at;
    const daysInStatus = Math.max(0, Math.floor((Date.now() - statusStartedAt) / DAY_MS));

    return {
      negotiation,
      listing: listing
        ? {
            _id: listing._id,
            slug: listing.slug,
            bhk_config: listing.bhk_config,
            status: listing.status,
          }
        : null,
      tenant: tenant
        ? {
            _id: tenant._id,
            name: tenant.name,
            phone: tenant.phone,
            user_type: tenant.user_type,
          }
        : null,
      owner: owner
        ? {
            _id: owner._id,
            name: owner.name,
            phone: owner.phone,
            user_type: owner.user_type,
          }
        : null,
      initiated_by: initiatedBy
        ? {
            _id: initiatedBy._id,
            name: initiatedBy.name,
            user_type: initiatedBy.user_type,
          }
        : null,
      proposal_count: proposals.filter((proposal) => !proposal.is_deleted).length,
      days_in_status: daysInStatus,
      flags: {
        is_stale: negotiation.is_stale ?? negotiation.stale_flagged,
        too_many_rounds: negotiation.too_many_rounds ?? negotiation.rounds_flagged,
        token_without_agreement:
          negotiation.token_without_agreement ?? fallbackTokenWithoutAgreement,
      },
    };
  },
});

export const flaggedNegotiations = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const now = Date.now();
    const negotiations = await ctx.db
      .query("negotiations")
      .withIndex("by_last_activity_at")
      .order("desc")
      .take(500);
    const flagged = negotiations
      .filter((negotiation) => {
        if (negotiation.is_deleted || negotiation.flag_dismissed_at !== undefined) {
          return false;
        }

        return Boolean(
          negotiation.is_stale ||
          negotiation.too_many_rounds ||
          negotiation.token_without_agreement,
        );
      })
      .sort((a, b) => {
        const aUpdatedAt = a.escalation_flags_updated_at ?? a.last_activity_at;
        const bUpdatedAt = b.escalation_flags_updated_at ?? b.last_activity_at;
        return bUpdatedAt - aUpdatedAt;
      })
      .slice(0, 50);

    if (flagged.length === 0) {
      return [];
    }

    const listingIds = [...new Set(flagged.map((negotiation) => negotiation.listing_id))];
    const userIds = [
      ...new Set(
        flagged.flatMap((negotiation) =>
          negotiation.owner_user_id
            ? [negotiation.tenant_user_id, negotiation.owner_user_id]
            : [negotiation.tenant_user_id],
        ),
      ),
    ];

    const listingDocs = await Promise.all(listingIds.map((listingId) => ctx.db.get(listingId)));
    const listingMap = new Map(
      listingDocs
        .filter((listing): listing is NonNullable<typeof listing> => listing !== null)
        .map((listing) => [listing._id, listing]),
    );

    const leadIds = [
      ...new Set(
        listingDocs
          .filter((listing): listing is NonNullable<typeof listing> => listing !== null)
          .map((listing) => listing.lead_id),
      ),
    ];
    const leadDocs = await Promise.all(leadIds.map((leadId) => ctx.db.get(leadId)));
    const leadMap = new Map(
      leadDocs
        .filter((lead): lead is NonNullable<typeof lead> => lead !== null)
        .map((lead) => [lead._id, lead]),
    );

    const buildingIds = [
      ...new Set(
        leadDocs
          .filter((lead): lead is NonNullable<typeof lead> => lead !== null)
          .map((lead) => lead.building_id),
      ),
    ];
    const societyIds = [
      ...new Set(
        leadDocs
          .filter((lead): lead is NonNullable<typeof lead> => lead !== null)
          .map((lead) => lead.society_id),
      ),
    ];

    const [buildingDocs, societyDocs, userDocs] = await Promise.all([
      Promise.all(buildingIds.map((buildingId) => ctx.db.get(buildingId))),
      Promise.all(societyIds.map((societyId) => ctx.db.get(societyId))),
      Promise.all(userIds.map((userId) => ctx.db.get(userId))),
    ]);

    const buildingMap = new Map(
      buildingDocs
        .filter((building): building is NonNullable<typeof building> => building !== null)
        .map((building) => [building._id, building]),
    );
    const societyMap = new Map(
      societyDocs
        .filter((society): society is NonNullable<typeof society> => society !== null)
        .map((society) => [society._id, society]),
    );
    const userMap = new Map(
      userDocs
        .filter((user): user is NonNullable<typeof user> => user !== null)
        .map((user) => [user._id, user]),
    );

    return flagged.map((negotiation) => {
      const listing = listingMap.get(negotiation.listing_id);
      const lead = listing ? leadMap.get(listing.lead_id) : null;
      const building = lead ? buildingMap.get(lead.building_id) : null;
      const society = lead ? societyMap.get(lead.society_id) : null;

      const tenant = userMap.get(negotiation.tenant_user_id) ?? null;
      const owner = negotiation.owner_user_id
        ? (userMap.get(negotiation.owner_user_id) ?? null)
        : null;

      const activeFlags = {
        is_stale: negotiation.is_stale ?? false,
        too_many_rounds: negotiation.too_many_rounds ?? false,
        token_without_agreement: negotiation.token_without_agreement ?? false,
      };

      const activeFlagLabels = [
        activeFlags.is_stale ? "STALE" : null,
        activeFlags.too_many_rounds ? "TOO_MANY_ROUNDS" : null,
        activeFlags.token_without_agreement ? "TOKEN_WITHOUT_AGREEMENT" : null,
      ].filter((flag): flag is string => flag !== null);

      const flagsUpdatedAt =
        negotiation.escalation_flags_updated_at ?? negotiation.last_activity_at;

      return {
        _id: negotiation._id,
        status: negotiation.status,
        listing_address:
          lead && building && society
            ? `${lead.flat_number}, Floor ${lead.floor_number}, ${building.name}, ${society.name}`
            : listing?.slug
              ? `/listing/${listing.slug}`
              : `Listing ${negotiation.listing_id.slice(-6)}`,
        tenant_name: tenant?.name ?? "Unknown Tenant",
        owner_name: owner?.name ?? "Owner Unlinked",
        active_flags: activeFlags,
        active_flag_labels: activeFlagLabels,
        escalation_flags_updated_at: flagsUpdatedAt,
        days_since_flag_set: Math.max(0, Math.floor((now - flagsUpdatedAt) / DAY_MS)),
      };
    });
  },
});

export const negotiationAnalytics = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const now = Date.now();
    const negotiations = (
      await ctx.db.query("negotiations").withIndex("by_last_activity_at").order("desc").take(500)
    ).filter((negotiation) => !negotiation.is_deleted);

    const proposalGroups = await Promise.all(
      ALL_NEGOTIATION_PROPOSAL_STATUSES.map(async (status) => {
        return await ctx.db
          .query("negotiation_terms_proposals")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(1000);
      }),
    );

    const proposals = proposalGroups.flat().filter((proposal) => !proposal.is_deleted);

    const statusDistribution: Record<string, number> = {
      [NEGOTIATION_STATUS.INITIATED]: 0,
      [NEGOTIATION_STATUS.ACTIVE]: 0,
      [NEGOTIATION_STATUS.TERMS_PROPOSED]: 0,
      [NEGOTIATION_STATUS.COUNTER_PROPOSED]: 0,
      [NEGOTIATION_STATUS.TERMS_AGREED]: 0,
      [NEGOTIATION_STATUS.TOKEN_COLLECTED]: 0,
      [NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS]: 0,
      [NEGOTIATION_STATUS.READY_FOR_CLOSURE]: 0,
      [NEGOTIATION_STATUS.CLOSED]: 0,
      [NEGOTIATION_STATUS.FAILED]: 0,
      [NEGOTIATION_STATUS.STALLED]: 0,
      [NEGOTIATION_STATUS.EXPIRED]: 0,
    };

    const nonActiveStatuses = new Set<string>([
      NEGOTIATION_STATUS.CLOSED,
      NEGOTIATION_STATUS.FAILED,
      NEGOTIATION_STATUS.EXPIRED,
      "CANCELLED",
    ]);

    const totalNegotiations = negotiations.length;
    const closedAgeDays: number[] = [];
    let activeNegotiations = 0;
    let staleActiveCount = 0;
    let flaggedCount = 0;

    for (const negotiation of negotiations) {
      statusDistribution[negotiation.status] = (statusDistribution[negotiation.status] ?? 0) + 1;

      const isActive = !nonActiveStatuses.has(negotiation.status);
      if (isActive) {
        activeNegotiations += 1;
        if (negotiation.is_stale ?? false) {
          staleActiveCount += 1;
        }
      }

      if (negotiation.status === NEGOTIATION_STATUS.CLOSED) {
        const closedAt = negotiation.last_activity_at;
        closedAgeDays.push((closedAt - negotiation.initiated_at) / DAY_MS);
      }

      const hasAnyFlag = Boolean(
        negotiation.is_stale || negotiation.too_many_rounds || negotiation.token_without_agreement,
      );
      if (hasAnyFlag && negotiation.flag_dismissed_at === undefined) {
        flaggedCount += 1;
      }
    }

    const proposalCountsByNegotiation = new Map<string, number>();
    for (const proposal of proposals) {
      const negotiationId = proposal.negotiation_id.toString();
      proposalCountsByNegotiation.set(
        negotiationId,
        (proposalCountsByNegotiation.get(negotiationId) ?? 0) + 1,
      );
    }

    const proposalRoundsTotal = negotiations.reduce(
      (sum, negotiation) =>
        sum + (proposalCountsByNegotiation.get(negotiation._id.toString()) ?? 0),
      0,
    );

    const avgDaysToClose =
      closedAgeDays.length === 0
        ? 0
        : Math.round(
            (closedAgeDays.reduce((sum, value) => sum + value, 0) / closedAgeDays.length) * 100,
          ) / 100;

    const avgProposalRounds =
      totalNegotiations === 0
        ? 0
        : Math.round((proposalRoundsTotal / totalNegotiations) * 100) / 100;

    const staleRate =
      activeNegotiations === 0
        ? 0
        : Math.round((staleActiveCount / activeNegotiations) * 10000) / 100;

    return {
      total_negotiations: totalNegotiations,
      active_negotiations: activeNegotiations,
      avg_days_to_close: avgDaysToClose,
      avg_proposal_rounds: avgProposalRounds,
      stale_rate: staleRate,
      flagged_count: flaggedCount,
      status_distribution: statusDistribution,
    };
  },
});

export const dismissEscalationFlag = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    await rateLimiter.limit(ctx, "negotiation:dismiss_flag", {
      key: user._id,
      throws: true,
    });

    const normalizedReason = args.reason.trim();
    if (normalizedReason.length < 5) {
      throw new Error("Dismiss reason must be at least 5 characters");
    }

    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    const now = Date.now();

    await ctx.db.patch(negotiation._id, {
      flag_dismissed_at: now,
      flag_dismissed_reason: normalizedReason,
    });

    return await ctx.db.get(negotiation._id);
  },
});
