import { v } from "convex/values";
import {
  AGREEMENT_STATUS,
  DEPOSIT_RECORD_STATUS,
  PERMISSIONS,
  TRANSACTION_STATUS,
  VALID_DEPOSIT_RECORD_TRANSITIONS,
  type DepositRecordStatus,
} from "../lib/constants";
import { requireAdmin, requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { advanceTransactionStatusInternal } from "./rentalTransactions";
import {
  ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
  validateOptionalStoredFile,
} from "./storageValidation";

const depositRecordStatusValidator = v.union(
  v.literal(DEPOSIT_RECORD_STATUS.PENDING),
  v.literal(DEPOSIT_RECORD_STATUS.RECORDED),
  v.literal(DEPOSIT_RECORD_STATUS.CONFIRMED),
  v.literal(DEPOSIT_RECORD_STATUS.DISPUTED),
  v.literal(DEPOSIT_RECORD_STATUS.CANCELLED),
);

function isValidTransition(current: DepositRecordStatus, target: DepositRecordStatus): boolean {
  return (VALID_DEPOSIT_RECORD_TRANSITIONS[current] ?? []).includes(target);
}

function assertPositivePaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer in paise`);
  }
}

function computeTotalFromEvents(events: Array<{ amount_paise: number }>): number {
  return events.reduce((total, event) => total + event.amount_paise, 0);
}

async function getLatestAgreementForTransaction(
  ctx: QueryCtx | MutationCtx,
  transactionId: Id<"rental_transactions">,
): Promise<Doc<"rental_agreements">> {
  const signedAgreement = await ctx.db
    .query("rental_agreements")
    .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transactionId))
    .filter((q) =>
      q.and(q.neq(q.field("is_deleted"), true), q.eq(q.field("status"), AGREEMENT_STATUS.SIGNED)),
    )
    .order("desc")
    .first();

  if (signedAgreement) {
    return signedAgreement;
  }

  const latestNonCancelled = await ctx.db
    .query("rental_agreements")
    .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transactionId))
    .filter((q) =>
      q.and(
        q.neq(q.field("is_deleted"), true),
        q.neq(q.field("status"), AGREEMENT_STATUS.CANCELLED),
      ),
    )
    .order("desc")
    .first();

  if (latestNonCancelled) {
    return latestNonCancelled;
  }

  const latestAgreement = await ctx.db
    .query("rental_agreements")
    .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transactionId))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .order("desc")
    .first();

  if (!latestAgreement) {
    throw new Error("No rental agreement exists for this transaction");
  }

  throw new Error("No eligible rental agreement found; latest agreements are cancelled");
}

function getComplianceWarning(amountPaise: number, monthlyRentPaise: number): string | undefined {
  if (amountPaise > 2 * monthlyRentPaise) {
    return "DEPOSIT_EXCEEDS_TWO_MONTHS";
  }
  return undefined;
}

export const markPaid = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
    amount_paise: v.number(),
    payment_reference: v.optional(v.string()),
    receipt_storage_id: v.optional(v.id("_storage")),
    mismatch_reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);
    assertPositivePaise(args.amount_paise, "amount_paise");

    await validateOptionalStoredFile(ctx, args.receipt_storage_id, {
      fieldName: "receipt_storage_id",
      allowedContentTypes: ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
      allowedLabel: "JPEG, PNG, WebP, and PDF",
    });

    const transaction = await ctx.db.get(args.transaction_id);
    if (!transaction || transaction.is_deleted) {
      throw new Error("Transaction not found");
    }

    const agreement = await getLatestAgreementForTransaction(ctx, transaction._id);
    const agreementDepositPaise = agreement.terms.deposit_amount_paise;

    if (
      transaction.status !== TRANSACTION_STATUS.DEPOSIT_PENDING &&
      transaction.status !== TRANSACTION_STATUS.DEPOSIT_RECEIVED
    ) {
      if (transaction.status !== TRANSACTION_STATUS.TOKEN_RECEIVED) {
        throw new Error(`Cannot mark deposit paid in transaction status: ${transaction.status}`);
      }

      await advanceTransactionStatusInternal(
        ctx,
        transaction._id,
        TRANSACTION_STATUS.DEPOSIT_PENDING,
      );
    }

    const existing = await ctx.db
      .query("deposit_records")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .unique();

    const now = Date.now();
    const paymentReference = args.payment_reference?.trim() || undefined;
    const mismatchReason = args.mismatch_reason?.trim();

    const buildPaymentEvent = () => ({
      amount_paise: args.amount_paise,
      payment_reference: paymentReference,
      recorded_at: now,
      recorded_by: actor._id,
    });

    if (existing) {
      if (
        existing.status === DEPOSIT_RECORD_STATUS.CONFIRMED ||
        existing.status === DEPOSIT_RECORD_STATUS.DISPUTED ||
        existing.status === DEPOSIT_RECORD_STATUS.CANCELLED
      ) {
        throw new Error(`Cannot mark paid for deposit in status: ${existing.status}`);
      }

      if (
        existing.status !== DEPOSIT_RECORD_STATUS.PENDING &&
        existing.status !== DEPOSIT_RECORD_STATUS.RECORDED
      ) {
        throw new Error(`Cannot mark paid for deposit in status: ${existing.status}`);
      }

      const paymentEvents = [...(existing.payment_events ?? []), buildPaymentEvent()];
      const nextPaidAmount = computeTotalFromEvents(paymentEvents);
      const outstanding = agreementDepositPaise - nextPaidAmount;

      if (outstanding < 0 && !mismatchReason) {
        throw new Error(
          "Recorded deposit exceeds agreement deposit amount. Provide mismatch_reason.",
        );
      }

      const complianceWarning =
        getComplianceWarning(nextPaidAmount, transaction.monthly_rent_paise) ??
        existing.compliance_warning;

      await ctx.db.patch(existing._id, {
        amount_paise: nextPaidAmount,
        payment_reference: paymentReference ?? existing.payment_reference,
        receipt_storage_id: args.receipt_storage_id ?? existing.receipt_storage_id,
        mismatch_reason:
          outstanding !== 0 ? (mismatchReason ?? existing.mismatch_reason) : undefined,
        payment_events: paymentEvents,
        compliance_warning: complianceWarning,
        paid_by_tenant_at: now,
        status: DEPOSIT_RECORD_STATUS.RECORDED,
        updated_at: now,
      });

      return await ctx.db.get(existing._id);
    }

    const paymentEvents = [buildPaymentEvent()];
    const totalPaidAmount = computeTotalFromEvents(paymentEvents);
    const outstanding = agreementDepositPaise - totalPaidAmount;
    if (outstanding < 0 && !mismatchReason) {
      throw new Error(
        "Recorded deposit exceeds agreement deposit amount. Provide mismatch_reason.",
      );
    }

    const complianceWarning = getComplianceWarning(totalPaidAmount, transaction.monthly_rent_paise);

    const depositRecordId = await ctx.db.insert("deposit_records", {
      transaction_id: transaction._id,
      amount_paise: totalPaidAmount,
      paid_by_tenant_at: now,
      confirmed_by_owner_at: undefined,
      payment_reference: paymentReference,
      receipt_storage_id: args.receipt_storage_id,
      mismatch_reason: outstanding !== 0 ? mismatchReason : undefined,
      payment_events: paymentEvents,
      compliance_warning: complianceWarning,
      status: DEPOSIT_RECORD_STATUS.RECORDED,
      status_note: undefined,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });

    return await ctx.db.get(depositRecordId);
  },
});

export const confirmByOwner = mutation({
  args: {
    deposit_record_id: v.id("deposit_records"),
    receipt_storage_id: v.optional(v.id("_storage")),
    override_reason: v.optional(v.string()),
    override_by: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);

    await validateOptionalStoredFile(ctx, args.receipt_storage_id, {
      fieldName: "receipt_storage_id",
      allowedContentTypes: ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
      allowedLabel: "JPEG, PNG, WebP, and PDF",
    });

    const record = await ctx.db.get(args.deposit_record_id);
    if (!record || record.is_deleted) {
      throw new Error("Deposit record not found");
    }

    if (!isValidTransition(record.status, DEPOSIT_RECORD_STATUS.CONFIRMED)) {
      throw new Error(`Cannot confirm deposit in status: ${record.status}`);
    }

    const agreement = await getLatestAgreementForTransaction(ctx, record.transaction_id);
    const agreementDepositPaise = agreement.terms.deposit_amount_paise;
    const totalPaidAmount = computeTotalFromEvents(record.payment_events ?? []);
    const outstanding = agreementDepositPaise - totalPaidAmount;
    const hasMismatch = outstanding !== 0;
    const now = Date.now();

    let overridePatch:
      | {
          override_reason?: string;
          override_by?: Id<"users">;
          override_at?: number;
        }
      | undefined;

    if (hasMismatch) {
      const admin = await requireAdmin(ctx);
      const overrideReason = args.override_reason?.trim();

      if (!overrideReason || !args.override_by) {
        throw new Error("override_reason and override_by are required for mismatched confirmation");
      }

      if (args.override_by !== admin._id) {
        throw new Error("override_by must match the confirming admin user");
      }

      overridePatch = {
        override_reason: overrideReason,
        override_by: args.override_by,
        override_at: now,
      };
    }

    await ctx.db.patch(record._id, {
      amount_paise: totalPaidAmount,
      status: DEPOSIT_RECORD_STATUS.CONFIRMED,
      confirmed_by_owner_at: now,
      receipt_storage_id: args.receipt_storage_id ?? record.receipt_storage_id,
      updated_at: now,
      ...(overridePatch ?? {}),
    });

    const transaction = await ctx.db.get(record.transaction_id);
    if (
      transaction &&
      transaction.status === TRANSACTION_STATUS.DEPOSIT_PENDING &&
      outstanding <= 0
    ) {
      await advanceTransactionStatusInternal(
        ctx,
        record.transaction_id,
        TRANSACTION_STATUS.DEPOSIT_RECEIVED,
      );
    }

    return await ctx.db.get(record._id);
  },
});

export const updateStatus = mutation({
  args: {
    deposit_record_id: v.id("deposit_records"),
    target_status: depositRecordStatusValidator,
    status_note: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);

    if (args.target_status === DEPOSIT_RECORD_STATUS.CONFIRMED) {
      throw new Error("Use confirmByOwner for CONFIRMED transition");
    }

    const record = await ctx.db.get(args.deposit_record_id);
    if (!record || record.is_deleted) {
      throw new Error("Deposit record not found");
    }

    if (record.status !== args.target_status) {
      if (!isValidTransition(record.status, args.target_status)) {
        throw new Error(`Invalid deposit transition: ${record.status} -> ${args.target_status}`);
      }
    }

    const transitionReason = args.reason?.trim();
    if (
      (args.target_status === DEPOSIT_RECORD_STATUS.CANCELLED ||
        args.target_status === DEPOSIT_RECORD_STATUS.DISPUTED) &&
      !transitionReason
    ) {
      throw new Error("reason is required for CANCELLED or DISPUTED transitions");
    }

    const now = Date.now();
    await ctx.db.patch(record._id, {
      status: args.target_status,
      status_note: args.status_note?.trim() || transitionReason || undefined,
      updated_at: now,
      confirmed_by_owner_at: record.confirmed_by_owner_at,
    });

    if (args.target_status === DEPOSIT_RECORD_STATUS.CANCELLED) {
      const transaction = await ctx.db.get(record.transaction_id);
      if (transaction && transaction.status === TRANSACTION_STATUS.DEPOSIT_PENDING) {
        // Transaction sync for deposit cancel handled by admin via advanceStatus
      }
    }

    return await ctx.db.get(record._id);
  },
});

export const getByTransaction = query({
  args: {
    transaction_id: v.id("rental_transactions"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_VIEW);
    return await ctx.db
      .query("deposit_records")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", args.transaction_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .unique();
  },
});
