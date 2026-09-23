import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  AGREEMENT_STATUS,
  DEPOSIT_RECORD_STATUS,
  KYC_PACKET_STATUS,
  PERMISSIONS,
  SYSTEM_CONFIG_DEFAULTS,
  SYSTEM_CONFIG_KEYS,
  TENANT_INQUIRY_STATUS,
  TOKEN_BOOKING_STATUS,
  TRANSACTION_STATUS,
  USER_STATUS,
  VALID_TRANSACTION_TRANSITIONS,
  type TransactionStatus,
  USER_TYPE,
} from "../lib/constants";
import { requireAuth, requirePermission, requireTenant } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { getSystemConfigNumber } from "./systemConfig.helpers";

const transactionStatusValidator = v.union(
  v.literal(TRANSACTION_STATUS.INITIATED),
  v.literal(TRANSACTION_STATUS.KYC_PENDING),
  v.literal(TRANSACTION_STATUS.KYC_VERIFIED),
  v.literal(TRANSACTION_STATUS.KYC_REJECTED),
  v.literal(TRANSACTION_STATUS.AGREEMENT_PENDING),
  v.literal(TRANSACTION_STATUS.AGREEMENT_SENT),
  v.literal(TRANSACTION_STATUS.AGREEMENT_SIGNED),
  v.literal(TRANSACTION_STATUS.TOKEN_PENDING),
  v.literal(TRANSACTION_STATUS.TOKEN_RECEIVED),
  v.literal(TRANSACTION_STATUS.DEPOSIT_PENDING),
  v.literal(TRANSACTION_STATUS.DEPOSIT_RECEIVED),
  v.literal(TRANSACTION_STATUS.MOVE_IN_SCHEDULED),
  v.literal(TRANSACTION_STATUS.COMPLETED),
  v.literal(TRANSACTION_STATUS.CANCELLED),
);

const ADMIN_TRANSACTION_STATUS_FILTER_GROUPS: Record<
  TransactionStatus,
  readonly TransactionStatus[]
> = {
  [TRANSACTION_STATUS.INITIATED]: [
    TRANSACTION_STATUS.INITIATED,
    TRANSACTION_STATUS.KYC_PENDING,
    TRANSACTION_STATUS.KYC_VERIFIED,
    TRANSACTION_STATUS.KYC_REJECTED,
  ],
  [TRANSACTION_STATUS.KYC_PENDING]: [
    TRANSACTION_STATUS.INITIATED,
    TRANSACTION_STATUS.KYC_PENDING,
    TRANSACTION_STATUS.KYC_VERIFIED,
    TRANSACTION_STATUS.KYC_REJECTED,
  ],
  [TRANSACTION_STATUS.KYC_VERIFIED]: [
    TRANSACTION_STATUS.INITIATED,
    TRANSACTION_STATUS.KYC_PENDING,
    TRANSACTION_STATUS.KYC_VERIFIED,
    TRANSACTION_STATUS.KYC_REJECTED,
  ],
  [TRANSACTION_STATUS.KYC_REJECTED]: [
    TRANSACTION_STATUS.INITIATED,
    TRANSACTION_STATUS.KYC_PENDING,
    TRANSACTION_STATUS.KYC_VERIFIED,
    TRANSACTION_STATUS.KYC_REJECTED,
  ],
  [TRANSACTION_STATUS.AGREEMENT_PENDING]: [
    TRANSACTION_STATUS.AGREEMENT_PENDING,
    TRANSACTION_STATUS.AGREEMENT_SENT,
    TRANSACTION_STATUS.AGREEMENT_SIGNED,
  ],
  [TRANSACTION_STATUS.AGREEMENT_SENT]: [
    TRANSACTION_STATUS.AGREEMENT_PENDING,
    TRANSACTION_STATUS.AGREEMENT_SENT,
    TRANSACTION_STATUS.AGREEMENT_SIGNED,
  ],
  [TRANSACTION_STATUS.AGREEMENT_SIGNED]: [
    TRANSACTION_STATUS.AGREEMENT_PENDING,
    TRANSACTION_STATUS.AGREEMENT_SENT,
    TRANSACTION_STATUS.AGREEMENT_SIGNED,
  ],
  [TRANSACTION_STATUS.TOKEN_PENDING]: [
    TRANSACTION_STATUS.TOKEN_PENDING,
    TRANSACTION_STATUS.TOKEN_RECEIVED,
    TRANSACTION_STATUS.DEPOSIT_PENDING,
    TRANSACTION_STATUS.DEPOSIT_RECEIVED,
  ],
  [TRANSACTION_STATUS.TOKEN_RECEIVED]: [
    TRANSACTION_STATUS.TOKEN_PENDING,
    TRANSACTION_STATUS.TOKEN_RECEIVED,
    TRANSACTION_STATUS.DEPOSIT_PENDING,
    TRANSACTION_STATUS.DEPOSIT_RECEIVED,
  ],
  [TRANSACTION_STATUS.DEPOSIT_PENDING]: [
    TRANSACTION_STATUS.TOKEN_PENDING,
    TRANSACTION_STATUS.TOKEN_RECEIVED,
    TRANSACTION_STATUS.DEPOSIT_PENDING,
    TRANSACTION_STATUS.DEPOSIT_RECEIVED,
  ],
  [TRANSACTION_STATUS.DEPOSIT_RECEIVED]: [
    TRANSACTION_STATUS.TOKEN_PENDING,
    TRANSACTION_STATUS.TOKEN_RECEIVED,
    TRANSACTION_STATUS.DEPOSIT_PENDING,
    TRANSACTION_STATUS.DEPOSIT_RECEIVED,
  ],
  [TRANSACTION_STATUS.MOVE_IN_SCHEDULED]: [TRANSACTION_STATUS.MOVE_IN_SCHEDULED],
  [TRANSACTION_STATUS.COMPLETED]: [TRANSACTION_STATUS.COMPLETED],
  [TRANSACTION_STATUS.CANCELLED]: [TRANSACTION_STATUS.CANCELLED],
};

const TERMINAL_TRANSACTION_STATUSES = new Set<TransactionStatus>([
  TRANSACTION_STATUS.COMPLETED,
  TRANSACTION_STATUS.CANCELLED,
]);

const NON_TERMINAL_TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  TRANSACTION_STATUS.INITIATED,
  TRANSACTION_STATUS.KYC_PENDING,
  TRANSACTION_STATUS.KYC_VERIFIED,
  TRANSACTION_STATUS.KYC_REJECTED,
  TRANSACTION_STATUS.AGREEMENT_PENDING,
  TRANSACTION_STATUS.AGREEMENT_SENT,
  TRANSACTION_STATUS.AGREEMENT_SIGNED,
  TRANSACTION_STATUS.TOKEN_PENDING,
  TRANSACTION_STATUS.TOKEN_RECEIVED,
  TRANSACTION_STATUS.DEPOSIT_PENDING,
  TRANSACTION_STATUS.DEPOSIT_RECEIVED,
  TRANSACTION_STATUS.MOVE_IN_SCHEDULED,
];

const DEFAULT_HANDOVER_ITEMS = [
  "Main door lock and keys handed over",
  "Electricity meter reading captured",
  "Water supply and taps verified",
  "Basic appliances and lights checked",
  "Inventory and damage notes captured",
  "Society move-in formalities completed",
] as const;

function isTerminal(status: TransactionStatus): boolean {
  return TERMINAL_TRANSACTION_STATUSES.has(status);
}

function isValidTransactionTransition(
  current: TransactionStatus,
  target: TransactionStatus,
): boolean {
  return (VALID_TRANSACTION_TRANSITIONS[current] ?? []).includes(target);
}

function assertPaiseInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer in paise`);
  }
}

function stripStorageIdFields<T extends Record<string, unknown>>(
  record: T | null,
): Partial<T> | null {
  if (!record) {
    return null;
  }

  const sanitized: Partial<T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!key.endsWith("_storage_id")) {
      sanitized[key as keyof T] = value as T[keyof T];
    }
  }

  return sanitized;
}

async function getTransactionOrThrow(
  ctx: QueryCtx | MutationCtx,
  transactionId: Id<"rental_transactions">,
): Promise<Doc<"rental_transactions">> {
  const transaction = await ctx.db.get(transactionId);
  if (!transaction || transaction.is_deleted) {
    throw new Error("Transaction not found");
  }
  return transaction;
}

async function enrichTransaction(
  ctx: QueryCtx | MutationCtx,
  transaction: Doc<"rental_transactions">,
) {
  const [tenant, listing, owner, inquiry, closure] = await Promise.all([
    ctx.db.get(transaction.tenant_user_id),
    ctx.db.get(transaction.listing_id),
    ctx.db.get(transaction.owner_id),
    transaction.tenant_inquiry_id
      ? ctx.db.get(transaction.tenant_inquiry_id)
      : Promise.resolve(null),
    transaction.closure_id ? ctx.db.get(transaction.closure_id) : Promise.resolve(null),
  ]);

  return {
    ...transaction,
    tenant,
    listing,
    owner,
    inquiry,
    closure,
  };
}

type EnrichedTransaction = Awaited<ReturnType<typeof enrichTransaction>>;

// Tenant-facing shape: the tenant's own deal without the owner's contact record,
// the closure's commission/brokerage data, inquiry ops fields, or override audit.
function toTenantTransactionView(enriched: EnrichedTransaction): EnrichedTransaction {
  return {
    ...enriched,
    last_override_reason: undefined,
    last_override_by: undefined,
    last_override_at: undefined,
    owner: null,
    inquiry: null,
    closure: null,
  };
}

export async function advanceTransactionStatusInternal(
  ctx: MutationCtx,
  transactionId: Id<"rental_transactions">,
  targetStatus: TransactionStatus,
  options?: { cancellationReason?: string },
): Promise<Doc<"rental_transactions">> {
  const transaction = await getTransactionOrThrow(ctx, transactionId);

  if (isTerminal(transaction.status)) {
    throw new Error(`Cannot advance transaction in terminal state: ${transaction.status}`);
  }

  if (transaction.status === targetStatus) {
    return transaction;
  }

  if (!isValidTransactionTransition(transaction.status, targetStatus)) {
    throw new Error(`Invalid transaction transition: ${transaction.status} -> ${targetStatus}`);
  }

  const now = Date.now();
  const patch: Partial<Doc<"rental_transactions">> = {
    status: targetStatus,
    updated_at: now,
  };

  if (targetStatus === TRANSACTION_STATUS.CANCELLED) {
    const reason = options?.cancellationReason?.trim();
    if (!reason) {
      throw new Error("Cancellation reason is required");
    }
    patch.cancellation_reason = reason;
  }

  await ctx.db.patch(transactionId, patch);

  const updated = await ctx.db.get(transactionId);
  if (!updated) {
    throw new Error("Transaction not found after update");
  }

  return updated;
}

async function assertAdvanceStatusPrerequisites(
  ctx: MutationCtx,
  transactionId: Id<"rental_transactions">,
  targetStatus: TransactionStatus,
): Promise<void> {
  if (targetStatus === TRANSACTION_STATUS.AGREEMENT_SIGNED) {
    const agreement = await ctx.db
      .query("rental_agreements")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transactionId))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .first();

    if (
      !agreement ||
      agreement.status !== AGREEMENT_STATUS.SIGNED ||
      !agreement.tenant_signature ||
      !agreement.owner_signature
    ) {
      throw new Error(
        "Cannot advance to AGREEMENT_SIGNED: agreement with tenant and owner signatures is required",
      );
    }
  }

  if (targetStatus === TRANSACTION_STATUS.TOKEN_RECEIVED) {
    const tokenBooking = await ctx.db
      .query("token_bookings")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transactionId))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .unique();

    if (
      !tokenBooking ||
      (tokenBooking.status !== TOKEN_BOOKING_STATUS.RECORDED &&
        tokenBooking.status !== TOKEN_BOOKING_STATUS.CONFIRMED)
    ) {
      throw new Error(
        "Cannot advance to TOKEN_RECEIVED: token booking with RECORDED or CONFIRMED status is required",
      );
    }
  }

  if (targetStatus === TRANSACTION_STATUS.DEPOSIT_RECEIVED) {
    const [depositRecord, signedAgreement] = await Promise.all([
      ctx.db
        .query("deposit_records")
        .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transactionId))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .order("desc")
        .unique(),
      ctx.db
        .query("rental_agreements")
        .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transactionId))
        .filter((q) =>
          q.and(
            q.neq(q.field("is_deleted"), true),
            q.eq(q.field("status"), AGREEMENT_STATUS.SIGNED),
          ),
        )
        .order("desc")
        .first(),
    ]);

    if (!depositRecord || depositRecord.status !== DEPOSIT_RECORD_STATUS.CONFIRMED) {
      throw new Error(
        "Cannot advance to DEPOSIT_RECEIVED: deposit record with CONFIRMED status is required",
      );
    }

    if (!signedAgreement) {
      throw new Error("Cannot advance to DEPOSIT_RECEIVED: signed agreement is required");
    }

    if (depositRecord.amount_paise < signedAgreement.terms.deposit_amount_paise) {
      throw new Error("Deposit amount insufficient for transition");
    }
  }

  if (targetStatus === TRANSACTION_STATUS.KYC_VERIFIED) {
    const kycPacket = await ctx.db
      .query("kyc_packets")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transactionId))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .unique();

    if (!kycPacket || kycPacket.overall_status !== KYC_PACKET_STATUS.VERIFIED) {
      throw new Error(
        "Cannot advance to KYC_VERIFIED: kyc packet with VERIFIED status is required",
      );
    }
  }
}

export const createTransaction = mutation({
  args: {
    tenant_inquiry_id: v.id("tenant_inquiries"),
    monthly_rent_paise: v.number(),
    deposit_amount_paise: v.number(),
    move_in_date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);

    assertPaiseInteger(args.monthly_rent_paise, "monthly_rent_paise");
    assertPaiseInteger(args.deposit_amount_paise, "deposit_amount_paise");

    const inquiry = await ctx.db.get(args.tenant_inquiry_id);
    if (!inquiry) {
      throw new Error("Tenant inquiry not found");
    }

    if (
      inquiry.status !== TENANT_INQUIRY_STATUS.VISIT_COMPLETED &&
      inquiry.status !== TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED
    ) {
      throw new Error(
        "Transaction can only be started from VISIT_COMPLETED or NEGOTIATION_INITIATED inquiries",
      );
    }

    if (!inquiry.tenant_id) {
      throw new Error(
        "Cannot start transaction: inquiry is missing tenant linkage. Ask tenant to sign in and re-submit.",
      );
    }

    const tenantUser = await ctx.db.get(inquiry.tenant_id);
    if (!tenantUser) {
      throw new Error("Cannot start transaction: tenant user not found");
    }

    if (
      !(
        tenantUser.user_types?.includes(USER_TYPE.TENANT) ??
        tenantUser.user_type === USER_TYPE.TENANT
      )
    ) {
      throw new Error("Cannot start transaction: inquiry tenant linkage is not a TENANT user");
    }

    if (inquiry.transaction_id) {
      throw new Error("A transaction is already linked to this inquiry");
    }

    const listing = await ctx.db.get(inquiry.listing_id);
    if (!listing) {
      throw new Error("Listing not found");
    }

    const lead = await ctx.db.get(listing.lead_id);
    if (!lead) {
      throw new Error("Lead not found for listing");
    }

    const ownerId = listing.owner_id ?? lead.owner_id;
    if (!ownerId) {
      throw new Error("Cannot start transaction: listing is not linked to an owner");
    }

    const owner = await ctx.db.get(ownerId);
    if (!owner) {
      throw new Error("Cannot start transaction: owner record not found");
    }

    if (owner.is_deleted) {
      throw new Error("Owner record is inactive");
    }

    const existingForListing = await ctx.db
      .query("rental_transactions")
      .withIndex("by_listing", (q) => q.eq("listing_id", listing._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const hasActive = existingForListing.some((transaction) => !isTerminal(transaction.status));
    if (hasActive) {
      throw new Error("An active transaction already exists for this listing");
    }

    const now = Date.now();
    const transactionId = await ctx.db.insert("rental_transactions", {
      tenant_user_id: inquiry.tenant_id,
      listing_id: listing._id,
      owner_id: ownerId,
      closure_id: undefined,
      tenant_inquiry_id: inquiry._id,
      source_negotiation_id: undefined,
      status: TRANSACTION_STATUS.INITIATED,
      monthly_rent_paise: args.monthly_rent_paise,
      deposit_amount_paise: args.deposit_amount_paise,
      move_in_date: args.move_in_date,
      cancellation_reason: undefined,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });

    // TODO: Auto-create KYC packet when transaction is initiated. Currently requires manual creation via admin.

    await ctx.db.patch(inquiry._id, {
      transaction_id: transactionId,
      updated_at: now,
    });

    return await getTransactionOrThrow(ctx, transactionId);
  },
});

export const advanceStatus = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
    target_status: transactionStatusValidator,
    override_reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const overrideReason = args.override_reason.trim();

    if (!overrideReason) {
      throw new Error("override_reason is required");
    }

    if (args.target_status === TRANSACTION_STATUS.CANCELLED) {
      throw new Error(
        "Use the cancel() mutation to cancel transactions (requires cancellation reason)",
      );
    }

    await assertAdvanceStatusPrerequisites(ctx, args.transaction_id, args.target_status);

    const updatedTransaction = await advanceTransactionStatusInternal(
      ctx,
      args.transaction_id,
      args.target_status,
    );

    const now = Date.now();
    await ctx.db.patch(updatedTransaction._id, {
      last_override_reason: overrideReason,
      last_override_by: identity.subject,
      last_override_at: now,
      updated_at: now,
    });

    return await getTransactionOrThrow(ctx, args.transaction_id);
  },
});

export const cancel = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);
    const transaction = await getTransactionOrThrow(ctx, args.transaction_id);

    if (isTerminal(transaction.status)) {
      throw new Error(`Cannot cancel transaction in terminal state: ${transaction.status}`);
    }

    return await advanceTransactionStatusInternal(
      ctx,
      args.transaction_id,
      TRANSACTION_STATUS.CANCELLED,
      {
        cancellationReason: args.reason,
      },
    );
  },
});

export const createMoveInChecklist = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);
    const transaction = await getTransactionOrThrow(ctx, args.transaction_id);

    const existingChecklist = await ctx.db
      .query("handover_checklists")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .unique();

    if (existingChecklist) {
      return existingChecklist;
    }

    if (isTerminal(transaction.status)) {
      throw new Error(`Cannot create checklist: transaction is ${transaction.status}`);
    }

    if (
      transaction.status !== TRANSACTION_STATUS.DEPOSIT_RECEIVED &&
      transaction.status !== TRANSACTION_STATUS.MOVE_IN_SCHEDULED
    ) {
      throw new Error(
        `Cannot create checklist: transaction is ${transaction.status}. Expected ${TRANSACTION_STATUS.DEPOSIT_RECEIVED} or ${TRANSACTION_STATUS.MOVE_IN_SCHEDULED}`,
      );
    }

    const now = Date.now();
    const checklistId = await ctx.db.insert("handover_checklists", {
      transaction_id: transaction._id,
      items: DEFAULT_HANDOVER_ITEMS.map((label) => ({
        label,
        checked: false,
        checked_at: undefined,
        checked_by: undefined,
      })),
      completed_at: undefined,
      completed_by: undefined,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    if (transaction.status === TRANSACTION_STATUS.DEPOSIT_RECEIVED) {
      await advanceTransactionStatusInternal(
        ctx,
        transaction._id,
        TRANSACTION_STATUS.MOVE_IN_SCHEDULED,
      );
    }

    const checklist = await ctx.db.get(checklistId);
    if (!checklist) {
      throw new Error("Failed to create handover checklist");
    }

    return checklist;
  },
});

export const updateChecklistItem = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
    item_index: v.number(),
    checked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);
    const transaction = await getTransactionOrThrow(ctx, args.transaction_id);

    if (transaction.status !== TRANSACTION_STATUS.MOVE_IN_SCHEDULED) {
      throw new Error(`Cannot update checklist: transaction is ${transaction.status}`);
    }

    const checklist = await ctx.db
      .query("handover_checklists")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", args.transaction_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .unique();

    if (!checklist) {
      throw new Error("Handover checklist not found");
    }

    if (checklist.completed_at) {
      throw new Error("Cannot modify checklist items after checklist is completed");
    }

    if (!Number.isInteger(args.item_index)) {
      throw new Error("item_index must be an integer");
    }

    if (args.item_index < 0 || args.item_index >= checklist.items.length) {
      throw new Error("item_index is out of range for this checklist");
    }

    const now = Date.now();
    const updatedItems = checklist.items.map((item, index) => {
      if (index !== args.item_index) {
        return item;
      }

      return {
        ...item,
        checked: args.checked,
        checked_at: args.checked ? now : undefined,
        checked_by: args.checked ? actor._id : undefined,
      };
    });

    const allChecked = updatedItems.every((item) => item.checked);
    const checklistPatch: Partial<Doc<"handover_checklists">> = {
      items: updatedItems,
      updated_at: now,
    };

    if (allChecked) {
      checklistPatch.completed_at = now;
      checklistPatch.completed_by = actor._id;
    }

    await ctx.db.patch(checklist._id, checklistPatch);

    return await ctx.db.get(checklist._id);
  },
});

export const complete = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
    handover_checklist_id: v.id("handover_checklists"),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);
    const transaction = await getTransactionOrThrow(ctx, args.transaction_id);
    const checklist = await ctx.db.get(args.handover_checklist_id);

    if (!checklist || checklist.is_deleted) {
      throw new Error("Handover checklist not found");
    }

    if (checklist.transaction_id !== transaction._id) {
      throw new Error("Handover checklist does not belong to this transaction");
    }

    const hasUnchecked = checklist.items.some((item) => !item.checked);
    if (hasUnchecked) {
      throw new Error("All handover checklist items must be checked before completion");
    }

    if (!checklist.completed_at) {
      const now = Date.now();
      await ctx.db.patch(checklist._id, {
        completed_at: now,
        completed_by: actor._id,
        updated_at: now,
      });
    }

    const updatedTransaction = await advanceTransactionStatusInternal(
      ctx,
      transaction._id,
      TRANSACTION_STATUS.COMPLETED,
    );

    if (updatedTransaction.closure_id) {
      const closure = await ctx.db.get(updatedTransaction.closure_id);
      if (closure && closure.transaction_id && closure.transaction_id !== updatedTransaction._id) {
        throw new Error("Closure is already linked to a different transaction");
      }

      if (closure && !closure.transaction_id) {
        await ctx.db.patch(closure._id, { transaction_id: updatedTransaction._id });
      }
    }

    return updatedTransaction;
  },
});

export const expireStaleAgreements = internalMutation({
  args: {},
  handler: async (ctx) => {
    const defaultDeadlineDays = Number.parseInt(
      SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.ESIGN_DEADLINE_DAYS],
      10,
    );
    const esignDeadlineDays = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.ESIGN_DEADLINE_DAYS,
      defaultDeadlineDays,
    );
    const cutoff = Date.now() - esignDeadlineDays * 24 * 60 * 60 * 1000;

    const staleAgreements = await ctx.db
      .query("rental_agreements")
      .withIndex("by_status", (q) => q.eq("status", AGREEMENT_STATUS.SENT))
      .filter((q) => q.and(q.neq(q.field("is_deleted"), true), q.lt(q.field("updated_at"), cutoff)))
      .collect();

    let expiredCount = 0;

    for (const agreement of staleAgreements) {
      const now = Date.now();
      await ctx.db.patch(agreement._id, {
        status: AGREEMENT_STATUS.EXPIRED,
        updated_at: now,
      });

      const transaction = await ctx.db.get(agreement.transaction_id);
      if (
        transaction &&
        !transaction.is_deleted &&
        transaction.status === TRANSACTION_STATUS.AGREEMENT_SENT
      ) {
        await advanceTransactionStatusInternal(
          ctx,
          transaction._id,
          TRANSACTION_STATUS.AGREEMENT_PENDING,
        );
      }

      expiredCount += 1;
    }

    return { expiredCount };
  },
});

export const autoTimeoutTransactions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const defaultAutoCancelDays = Number.parseInt(
      SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.TRANSACTION_AUTO_CANCEL_DAYS],
      10,
    );
    const autoCancelDays = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.TRANSACTION_AUTO_CANCEL_DAYS,
      defaultAutoCancelDays,
    );
    const cutoff = Date.now() - autoCancelDays * 24 * 60 * 60 * 1000;

    // V1: Full scan acceptable at current scale (<1000 transactions).
    // V2: Add by_updated_at index for time-bounded selection.
    const staleTransactions = (
      await Promise.all(
        NON_TERMINAL_TRANSACTION_STATUSES.map(async (status) => {
          return await ctx.db
            .query("rental_transactions")
            .withIndex("by_status", (q) => q.eq("status", status))
            .filter((q) =>
              q.and(q.neq(q.field("is_deleted"), true), q.lt(q.field("updated_at"), cutoff)),
            )
            .collect();
        }),
      )
    ).flat();

    let cancelledCount = 0;

    for (const transaction of staleTransactions) {
      try {
        if (transaction.is_deleted || isTerminal(transaction.status)) {
          continue;
        }

        await advanceTransactionStatusInternal(ctx, transaction._id, TRANSACTION_STATUS.CANCELLED, {
          cancellationReason: "AUTO_TIMEOUT",
        });
        cancelledCount += 1;
      } catch (error) {
        console.error(
          `[rentalTransactions:autoTimeoutTransactions] Failed to auto-timeout transaction ${transaction._id}`,
          error,
        );
      }
    }

    return { cancelledCount };
  },
});

export const getById = query({
  args: {
    id: v.id("rental_transactions"),
  },
  handler: async (ctx, args) => {
    let user: Doc<"users">;
    try {
      user = await requireAuth(ctx);
    } catch {
      throw new Error("Not authorized to view this transaction");
    }

    let transaction: Doc<"rental_transactions">;
    let isTenantView = false;
    if (user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT) {
      const tenantAccessError = "Transaction not found or access denied";
      if (user.status !== USER_STATUS.ACTIVE) {
        throw new Error(tenantAccessError);
      }

      try {
        transaction = await getTransactionOrThrow(ctx, args.id);
      } catch {
        throw new Error(tenantAccessError);
      }

      if (transaction.tenant_user_id !== user._id) {
        throw new Error(tenantAccessError);
      }
      isTenantView = true;
    } else {
      try {
        await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_VIEW);
      } catch {
        throw new Error("Not authorized to view this transaction");
      }
      transaction = await getTransactionOrThrow(ctx, args.id);
    }

    const [agreement, kycPacket, tokenBooking, depositRecord, handoverChecklist, enriched] =
      await Promise.all([
        ctx.db
          .query("rental_agreements")
          .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .first(),
        ctx.db
          .query("kyc_packets")
          .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .unique(),
        ctx.db
          .query("token_bookings")
          .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .unique(),
        ctx.db
          .query("deposit_records")
          .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .unique(),
        ctx.db
          .query("handover_checklists")
          .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .unique(),
        enrichTransaction(ctx, transaction),
      ]);

    const kycPacketResponse = stripStorageIdFields(kycPacket);

    return {
      transaction: isTenantView ? toTenantTransactionView(enriched) : enriched,
      agreement,
      kyc_packet: kycPacketResponse,
      token_booking: tokenBooking,
      deposit_record: depositRecord,
      handover_checklist: handoverChecklist,
    };
  },
});

export const listByTenant = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    const paginated = await ctx.db
      .query("rental_transactions")
      .withIndex("by_tenant", (q) => q.eq("tenant_user_id", tenant._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      paginated.page.map(async (transaction) =>
        toTenantTransactionView(await enrichTransaction(ctx, transaction)),
      ),
    );

    return {
      ...paginated,
      page,
    } as PaginationResult<(typeof page)[number]>;
  },
});

export const listForAdmin = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(transactionStatusValidator),
    owner_id: v.optional(v.id("owners")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_VIEW);

    const paginated = await (async () => {
      if (args.status) {
        const statuses = ADMIN_TRANSACTION_STATUS_FILTER_GROUPS[args.status];

        if (statuses.length === 1) {
          let scopedQuery = ctx.db
            .query("rental_transactions")
            .withIndex("by_status", (q) => q.eq("status", statuses[0]))
            .filter((q) => q.neq(q.field("is_deleted"), true));

          if (args.owner_id) {
            scopedQuery = scopedQuery.filter((q) => q.eq(q.field("owner_id"), args.owner_id));
          }

          return await scopedQuery.order("desc").paginate(args.paginationOpts);
        }

        let groupedQuery = args.owner_id
          ? ctx.db
              .query("rental_transactions")
              .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id!))
          : ctx.db.query("rental_transactions");

        groupedQuery = groupedQuery.filter((q) =>
          q.and(
            q.neq(q.field("is_deleted"), true),
            q.or(...statuses.map((status) => q.eq(q.field("status"), status))),
          ),
        );

        return await groupedQuery.order("desc").paginate(args.paginationOpts);
      }

      if (args.owner_id) {
        return await ctx.db
          .query("rental_transactions")
          .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id!))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .paginate(args.paginationOpts);
      }

      return await ctx.db
        .query("rental_transactions")
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .order("desc")
        .paginate(args.paginationOpts);
    })();

    const page = await Promise.all(
      paginated.page.map((transaction) => enrichTransaction(ctx, transaction)),
    );

    return {
      ...paginated,
      page,
    } as PaginationResult<(typeof page)[number]>;
  },
});

export const listForOps = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(transactionStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_VIEW);

    const paginated = await (async () => {
      if (args.status) {
        return await ctx.db
          .query("rental_transactions")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .paginate(args.paginationOpts);
      }

      return await ctx.db
        .query("rental_transactions")
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .order("desc")
        .paginate(args.paginationOpts);
    })();

    const page = await Promise.all(
      paginated.page.map((transaction) => enrichTransaction(ctx, transaction)),
    );

    return {
      ...paginated,
      page,
    } as PaginationResult<(typeof page)[number]>;
  },
});
