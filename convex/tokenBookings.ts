import { v } from "convex/values";
import {
  PERMISSIONS,
  TOKEN_BOOKING_STATUS,
  TRANSACTION_STATUS,
  VALID_TOKEN_BOOKING_TRANSITIONS,
  type TokenBookingStatus,
} from "../lib/constants";
import { requireAdmin, requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";
import { advanceTransactionStatusInternal } from "./rentalTransactions";
import {
  ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
  validateOptionalStoredFile,
} from "./storageValidation";

const tokenBookingStatusValidator = v.union(
  v.literal(TOKEN_BOOKING_STATUS.PENDING),
  v.literal(TOKEN_BOOKING_STATUS.RECORDED),
  v.literal(TOKEN_BOOKING_STATUS.CONFIRMED),
  v.literal(TOKEN_BOOKING_STATUS.DISPUTED),
  v.literal(TOKEN_BOOKING_STATUS.CANCELLED),
);

const tokenRefundTypeValidator = v.union(
  v.literal("FULL"),
  v.literal("PARTIAL"),
  v.literal("FORFEITED"),
);

const policySnapshotValidator = v.object({
  refund_type: tokenRefundTypeValidator,
  conditions: v.optional(v.string()),
});

function isValidTransition(current: TokenBookingStatus, target: TokenBookingStatus): boolean {
  return (VALID_TOKEN_BOOKING_TRANSITIONS[current] ?? []).includes(target);
}

function assertPositivePaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer in paise`);
  }
}

function getExpectedTokenAmount(transaction: {
  token_booking_amount?: number;
}): number | undefined {
  return transaction.token_booking_amount;
}

export const hold = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
    amount_paise: v.number(),
    policy_snapshot: policySnapshotValidator,
    payment_reference: v.optional(v.string()),
    receipt_storage_id: v.optional(v.id("_storage")),
    override_reason: v.optional(v.string()),
    override_approved_by: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);
    assertPositivePaise(args.amount_paise, "amount_paise");

    const transaction = await ctx.db.get(args.transaction_id);
    if (!transaction || transaction.is_deleted) {
      throw new Error("Transaction not found");
    }

    const refundType = args.policy_snapshot.refund_type;

    const expectedTokenAmount = getExpectedTokenAmount(transaction);
    const overrideReason = args.override_reason?.trim();
    const hasOverrideMismatch =
      expectedTokenAmount !== undefined && args.amount_paise !== expectedTokenAmount;

    if (hasOverrideMismatch) {
      if (!overrideReason) {
        throw new Error(
          "override_reason is required when token amount differs from expected amount",
        );
      }
      if (!args.override_approved_by) {
        throw new Error(
          "override_approved_by is required when token amount differs from expected amount",
        );
      }

      const overrideAdmin = await requireAdmin(ctx);
      if (args.override_approved_by !== overrideAdmin._id) {
        throw new Error("override_approved_by must match the approving admin user");
      }
    }

    if (
      transaction.status !== TRANSACTION_STATUS.TOKEN_PENDING &&
      transaction.status !== TRANSACTION_STATUS.TOKEN_RECEIVED
    ) {
      if (transaction.status !== TRANSACTION_STATUS.AGREEMENT_SIGNED) {
        throw new Error(`Cannot hold token in transaction status: ${transaction.status}`);
      }

      await advanceTransactionStatusInternal(
        ctx,
        transaction._id,
        TRANSACTION_STATUS.TOKEN_PENDING,
      );
    }

    const existing = await ctx.db
      .query("token_bookings")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .unique();

    if (existing) {
      return existing;
    }

    await validateOptionalStoredFile(ctx, args.receipt_storage_id, {
      fieldName: "receipt_storage_id",
      allowedContentTypes: ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
      allowedLabel: "JPEG, PNG, WebP, and PDF",
    });

    const now = Date.now();
    const tokenBookingId = await ctx.db.insert("token_bookings", {
      transaction_id: transaction._id,
      amount_paise: args.amount_paise,
      policy_snapshot: {
        refund_type: refundType,
        conditions: args.policy_snapshot.conditions?.trim() || undefined,
      },
      payment_reference: args.payment_reference?.trim() || undefined,
      receipt_storage_id: args.receipt_storage_id,
      override_reason: hasOverrideMismatch ? overrideReason : undefined,
      override_approved_by: hasOverrideMismatch ? args.override_approved_by : undefined,
      status: TOKEN_BOOKING_STATUS.PENDING,
      status_note: undefined,
      held_at: now,
      resolved_at: undefined,
      is_deleted: false,
    });

    const created = await ctx.db.get(tokenBookingId);
    if (!created) {
      throw new Error("Failed to create token booking");
    }

    return created;
  },
});

export const resolve = mutation({
  args: {
    token_booking_id: v.id("token_bookings"),
    target_status: tokenBookingStatusValidator,
    status_note: v.optional(v.string()),
    reason: v.optional(v.string()),
    payment_reference: v.optional(v.string()),
    receipt_storage_id: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);

    const tokenBooking = await ctx.db.get(args.token_booking_id);
    if (!tokenBooking || tokenBooking.is_deleted) {
      throw new Error("Token booking not found");
    }

    if (tokenBooking.status !== args.target_status) {
      if (!isValidTransition(tokenBooking.status, args.target_status)) {
        throw new Error(
          `Invalid token booking transition: ${tokenBooking.status} -> ${args.target_status}`,
        );
      }
    }

    const paymentReference = args.payment_reference?.trim();
    if (
      args.target_status === TOKEN_BOOKING_STATUS.RECORDED &&
      tokenBooking.status !== TOKEN_BOOKING_STATUS.RECORDED &&
      !paymentReference
    ) {
      throw new Error("Payment reference is required for recorded token bookings");
    }

    const cancellationReason = args.reason?.trim();
    if (args.target_status === TOKEN_BOOKING_STATUS.CANCELLED && !cancellationReason) {
      throw new Error("Cancellation reason is required");
    }

    await validateOptionalStoredFile(ctx, args.receipt_storage_id, {
      fieldName: "receipt_storage_id",
      allowedContentTypes: ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
      allowedLabel: "JPEG, PNG, WebP, and PDF",
    });

    const now = Date.now();
    await ctx.db.patch(tokenBooking._id, {
      status: args.target_status,
      status_note: args.status_note?.trim() || undefined,
      payment_reference: paymentReference || tokenBooking.payment_reference,
      receipt_storage_id: args.receipt_storage_id ?? tokenBooking.receipt_storage_id,
      resolved_at:
        args.target_status === TOKEN_BOOKING_STATUS.CONFIRMED ||
        args.target_status === TOKEN_BOOKING_STATUS.CANCELLED
          ? now
          : undefined,
      ...(args.target_status === TOKEN_BOOKING_STATUS.CANCELLED
        ? {
            cancelled_by: actor._id,
            cancelled_at: now,
            cancel_reason: cancellationReason,
          }
        : {}),
    });

    if (
      args.target_status === TOKEN_BOOKING_STATUS.RECORDED ||
      args.target_status === TOKEN_BOOKING_STATUS.CONFIRMED
    ) {
      const transaction = await ctx.db.get(tokenBooking.transaction_id);
      if (transaction && transaction.status === TRANSACTION_STATUS.TOKEN_PENDING) {
        await advanceTransactionStatusInternal(
          ctx,
          tokenBooking.transaction_id,
          TRANSACTION_STATUS.TOKEN_RECEIVED,
        );
      }
    }

    if (args.target_status === TOKEN_BOOKING_STATUS.CANCELLED) {
      const transaction = await ctx.db.get(tokenBooking.transaction_id);
      if (transaction && transaction.status !== TRANSACTION_STATUS.CANCELLED) {
        await advanceTransactionStatusInternal(
          ctx,
          tokenBooking.transaction_id,
          TRANSACTION_STATUS.CANCELLED,
          {
            cancellationReason: cancellationReason,
          },
        );
      }
    }

    return await ctx.db.get(tokenBooking._id);
  },
});

export const refundToken = mutation({
  args: {
    token_booking_id: v.id("token_bookings"),
    refund_amount_paise: v.number(),
    refund_reference: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_MANAGE);
    assertPositivePaise(args.refund_amount_paise, "refund_amount_paise");

    const reason = args.reason.trim();
    if (reason.length === 0) {
      throw new Error("Refund reason is required");
    }

    const tokenBooking = await ctx.db.get(args.token_booking_id);
    if (!tokenBooking || tokenBooking.is_deleted) {
      throw new Error("Token booking not found");
    }

    if (
      tokenBooking.status !== TOKEN_BOOKING_STATUS.RECORDED &&
      tokenBooking.status !== TOKEN_BOOKING_STATUS.DISPUTED
    ) {
      throw new Error(`Cannot refund token booking in status: ${tokenBooking.status}`);
    }

    if (args.refund_amount_paise > tokenBooking.amount_paise) {
      throw new Error("Refund amount cannot exceed held token amount");
    }

    if (tokenBooking.policy_snapshot) {
      const policyRefundType = String(tokenBooking.policy_snapshot.refund_type)
        .trim()
        .toUpperCase();

      if (policyRefundType === "FULL" && args.refund_amount_paise !== tokenBooking.amount_paise) {
        throw new Error("Full refund policy requires refunding the entire held token amount");
      }

      if (policyRefundType === "PARTIAL" && args.refund_amount_paise >= tokenBooking.amount_paise) {
        throw new Error("Partial refund policy requires refund amount below held token amount");
      }

      if (policyRefundType === "FORFEITED" || policyRefundType === "NO_REFUND") {
        await requireAdmin(ctx);
      }
    }

    const now = Date.now();
    await ctx.db.patch(tokenBooking._id, {
      status: TOKEN_BOOKING_STATUS.CANCELLED,
      status_note: reason,
      refunded_by: actor._id,
      refunded_at: now,
      refund_amount_paise: args.refund_amount_paise,
      refund_reference: args.refund_reference?.trim() || undefined,
      cancelled_by: actor._id,
      cancelled_at: now,
      cancel_reason: "REFUND_PROCESSED",
      resolved_at: now,
    });

    const transaction = await ctx.db.get(tokenBooking.transaction_id);
    if (transaction && transaction.status !== TRANSACTION_STATUS.CANCELLED) {
      await advanceTransactionStatusInternal(
        ctx,
        tokenBooking.transaction_id,
        TRANSACTION_STATUS.CANCELLED,
        {
          cancellationReason: "REFUND_PROCESSED",
        },
      );
    }

    return await ctx.db.get(tokenBooking._id);
  },
});

export const getByTransaction = query({
  args: {
    transaction_id: v.id("rental_transactions"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_VIEW);
    return await ctx.db
      .query("token_bookings")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", args.transaction_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .unique();
  },
});
