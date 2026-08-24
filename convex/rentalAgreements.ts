import { v } from "convex/values";
import {
  AGREEMENT_STATUS,
  PERMISSIONS,
  TRANSACTION_STATUS,
  USER_STATUS,
  USER_TYPE,
  VALID_AGREEMENT_TRANSITIONS,
  type AgreementStatus,
} from "../lib/constants";
import { requireAuth, requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { advanceTransactionStatusInternal } from "./rentalTransactions";
import { ALLOWED_PDF_CONTENT_TYPES, validateStoredFile } from "./storageValidation";

type AgreementSignature = NonNullable<Doc<"rental_agreements">["tenant_signature"]>;
type SignerRole = "tenant" | "owner";

function buildAgreementSignature(payload: {
  signed_at: number;
  signer_name?: string;
  signer_email?: string;
  signature_payload: string;
}): AgreementSignature {
  return {
    signed_at: payload.signed_at,
    signer_name: payload.signer_name,
    signer_email: payload.signer_email,
    session_id: undefined,
    signature_payload: payload.signature_payload,
  };
}

const agreementStatusValidator = v.union(
  v.literal(AGREEMENT_STATUS.DRAFT),
  v.literal(AGREEMENT_STATUS.SENT),
  v.literal(AGREEMENT_STATUS.PARTIALLY_SIGNED),
  v.literal(AGREEMENT_STATUS.SIGNED),
  v.literal(AGREEMENT_STATUS.EXPIRED),
  v.literal(AGREEMENT_STATUS.CANCELLED),
);

const agreementTermsValidator = v.object({
  monthly_rent_paise: v.number(),
  deposit_amount_paise: v.number(),
  lock_in_months: v.optional(v.number()),
  notice_period_months: v.optional(v.number()),
  maintenance_paise: v.optional(v.number()),
  escalation_percent: v.optional(v.number()),
  agreement_start_date: v.optional(v.number()),
  agreement_end_date: v.optional(v.number()),
  special_conditions: v.optional(v.string()),
});

function isValidTransition(current: AgreementStatus, target: AgreementStatus): boolean {
  return (VALID_AGREEMENT_TRANSITIONS[current] ?? []).includes(target);
}

function validatePaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer in paise`);
  }
}

async function getAgreementOrThrow(
  ctx: QueryCtx | MutationCtx,
  agreementId: Id<"rental_agreements">,
): Promise<Doc<"rental_agreements">> {
  const agreement = await ctx.db.get(agreementId);
  if (!agreement || agreement.is_deleted) {
    throw new Error("Agreement not found");
  }
  return agreement;
}

export const generate = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
    template_version: v.string(),
    terms: agreementTermsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AGREEMENTS_GENERATE);

    validatePaise(args.terms.monthly_rent_paise, "terms.monthly_rent_paise");
    validatePaise(args.terms.deposit_amount_paise, "terms.deposit_amount_paise");

    const transaction = await ctx.db.get(args.transaction_id);
    if (!transaction || transaction.is_deleted) {
      throw new Error("Transaction not found");
    }

    const now = Date.now();
    const existingActiveAgreement = await ctx.db
      .query("rental_agreements")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
      .filter((q) =>
        q.and(
          q.neq(q.field("is_deleted"), true),
          q.neq(q.field("status"), AGREEMENT_STATUS.CANCELLED),
        ),
      )
      .order("desc")
      .first();

    if (existingActiveAgreement) {
      if (existingActiveAgreement.status !== AGREEMENT_STATUS.DRAFT) {
        throw new Error("Active agreement already exists — cancel it first");
      }

      await ctx.db.patch(existingActiveAgreement._id, {
        status: AGREEMENT_STATUS.CANCELLED,
        updated_at: now,
      });
    }

    const agreementId = await ctx.db.insert("rental_agreements", {
      transaction_id: transaction._id,
      template_version: args.template_version.trim(),
      terms: args.terms,
      tenant_signature: undefined,
      owner_signature: undefined,
      document_storage_id: undefined,
      status: AGREEMENT_STATUS.DRAFT,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });

    if (transaction.status !== TRANSACTION_STATUS.AGREEMENT_PENDING) {
      await advanceTransactionStatusInternal(
        ctx,
        transaction._id,
        TRANSACTION_STATUS.AGREEMENT_PENDING,
      );
    }

    const agreement = await ctx.db.get(agreementId);
    if (!agreement) {
      throw new Error("Failed to create agreement");
    }

    return agreement;
  },
});

export const attachDocument = mutation({
  args: {
    agreement_id: v.id("rental_agreements"),
    document_storage_id: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AGREEMENTS_GENERATE);
    const agreement = await getAgreementOrThrow(ctx, args.agreement_id);

    if (agreement.status !== AGREEMENT_STATUS.DRAFT) {
      throw new Error(
        `Cannot attach document while agreement is ${agreement.status}. Document upload is allowed only in DRAFT status.`,
      );
    }

    await validateStoredFile(ctx, args.document_storage_id, {
      fieldName: "document_storage_id",
      allowedContentTypes: ALLOWED_PDF_CONTENT_TYPES,
      allowedLabel: "PDF",
    });

    await ctx.db.patch(agreement._id, {
      document_storage_id: args.document_storage_id,
      updated_at: Date.now(),
    });

    return await ctx.db.get(agreement._id);
  },
});

export const send = mutation({
  args: {
    agreement_id: v.id("rental_agreements"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AGREEMENTS_GENERATE);
    const agreement = await getAgreementOrThrow(ctx, args.agreement_id);

    if (!agreement.document_storage_id) {
      throw new Error(
        "Cannot send agreement: document PDF must be attached first. Use the attach-document mutation.",
      );
    }

    if (!isValidTransition(agreement.status, AGREEMENT_STATUS.SENT)) {
      throw new Error(`Cannot send agreement in status: ${agreement.status}`);
    }

    await ctx.db.patch(agreement._id, {
      status: AGREEMENT_STATUS.SENT,
      updated_at: Date.now(),
    });

    // V1: Manual workflow. V2: Wire ctx.scheduler.runAfter(0, internal.actions.esign.createSigningSession, { ... })

    await advanceTransactionStatusInternal(
      ctx,
      agreement.transaction_id,
      TRANSACTION_STATUS.AGREEMENT_SENT,
    );

    return await ctx.db.get(agreement._id);
  },
});

export const recordSignature = mutation({
  args: {
    agreement_id: v.id("rental_agreements"),
    signer_role: v.union(v.literal("tenant"), v.literal("owner")),
    signature_payload: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const signerRole = args.signer_role as SignerRole;
    const signaturePayload = args.signature_payload.trim();

    if (!signaturePayload || signaturePayload.length === 0) {
      throw new Error("Signature payload cannot be empty");
    }

    if (signaturePayload.length > 10000) {
      throw new Error("Signature payload exceeds maximum length");
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(signaturePayload)) {
      throw new Error("Invalid signature format");
    }

    const agreement = await getAgreementOrThrow(ctx, args.agreement_id);
    const transaction = await ctx.db.get(agreement.transaction_id);

    if (!transaction || transaction.is_deleted) {
      throw new Error("Transaction not found");
    }

    if (signerRole === "tenant") {
      if (actor.user_types?.includes(USER_TYPE.TENANT) ?? actor.user_type === USER_TYPE.TENANT) {
        if (transaction.tenant_user_id !== actor._id) {
          throw new Error("You can only sign your own agreement");
        }
        if (actor.status !== USER_STATUS.ACTIVE) {
          throw new Error("Inactive account cannot sign agreements");
        }
      } else {
        await requirePermission(ctx, PERMISSIONS.AGREEMENTS_SIGN);
      }
      if (agreement.tenant_signature) {
        return agreement;
      }
    }

    if (signerRole === "owner") {
      const owner = await ctx.db.get(transaction.owner_id);
      if (!owner) {
        throw new Error("Owner not found");
      }

      const ownerCanSign =
        (actor.user_types?.includes(USER_TYPE.OWNER) ?? actor.user_type === USER_TYPE.OWNER) &&
        owner.user_id === actor._id;
      if (ownerCanSign && actor.status !== USER_STATUS.ACTIVE) {
        throw new Error("Inactive account cannot sign agreements");
      }
      if (!ownerCanSign) {
        await requirePermission(ctx, PERMISSIONS.AGREEMENTS_SIGN);
      }

      if (agreement.owner_signature) {
        return agreement;
      }
    }

    if (
      agreement.status !== AGREEMENT_STATUS.SENT &&
      agreement.status !== AGREEMENT_STATUS.PARTIALLY_SIGNED
    ) {
      throw new Error(`Cannot record signature while agreement is ${agreement.status}`);
    }

    const now = Date.now();
    const nextTenantSignature =
      signerRole === "tenant"
        ? buildAgreementSignature({
            signed_at: now,
            signer_name: actor.name,
            signer_email: actor.email,
            signature_payload: signaturePayload,
          })
        : agreement.tenant_signature;

    const nextOwnerSignature =
      signerRole === "owner"
        ? buildAgreementSignature({
            signed_at: now,
            signer_name: actor.name,
            signer_email: actor.email,
            signature_payload: signaturePayload,
          })
        : agreement.owner_signature;

    const bothSigned = !!nextTenantSignature && !!nextOwnerSignature;
    const targetStatus = bothSigned ? AGREEMENT_STATUS.SIGNED : AGREEMENT_STATUS.PARTIALLY_SIGNED;

    if (agreement.status !== targetStatus && !isValidTransition(agreement.status, targetStatus)) {
      throw new Error(`Cannot move agreement from ${agreement.status} to ${targetStatus}`);
    }

    await ctx.db.patch(agreement._id, {
      tenant_signature: nextTenantSignature,
      owner_signature: nextOwnerSignature,
      status: targetStatus,
      updated_at: now,
    });

    if (bothSigned) {
      await advanceTransactionStatusInternal(
        ctx,
        agreement.transaction_id,
        TRANSACTION_STATUS.AGREEMENT_SIGNED,
      );
    }

    return await ctx.db.get(agreement._id);
  },
});

export const cancel = mutation({
  args: {
    agreement_id: v.id("rental_agreements"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AGREEMENTS_GENERATE);
    const agreement = await getAgreementOrThrow(ctx, args.agreement_id);

    if (!isValidTransition(agreement.status, AGREEMENT_STATUS.CANCELLED)) {
      throw new Error(`Cannot cancel agreement in status: ${agreement.status}`);
    }

    const now = Date.now();
    await ctx.db.patch(agreement._id, {
      status: AGREEMENT_STATUS.CANCELLED,
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
        agreement.transaction_id,
        TRANSACTION_STATUS.AGREEMENT_PENDING,
      );
    }

    return await ctx.db.get(agreement._id);
  },
});

export const getByTransaction = query({
  args: {
    transaction_id: v.id("rental_transactions"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const transaction = await ctx.db.get(args.transaction_id);

    if (!transaction || transaction.is_deleted) {
      throw new Error("Transaction not found");
    }

    if (
      (user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT) &&
      transaction.tenant_user_id !== user._id
    ) {
      throw new Error("You can only view your own agreement");
    }

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.TRANSACTIONS_VIEW);
    }

    if (user.user_types?.includes(USER_TYPE.OWNER) ?? user.user_type === USER_TYPE.OWNER) {
      const owner = await ctx.db.get(transaction.owner_id);
      if (!owner || owner.user_id !== user._id) {
        throw new Error("You can only view agreements for your own properties");
      }
    }

    const hasBackofficePersona =
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS);
    const hasTenantPersona =
      user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT;
    const hasOwnerPersona =
      user.user_types?.includes(USER_TYPE.OWNER) ?? user.user_type === USER_TYPE.OWNER;

    if (!hasBackofficePersona && !hasTenantPersona && !hasOwnerPersona) {
      throw new Error("Not authorized to view agreement");
    }

    return await ctx.db
      .query("rental_agreements")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", args.transaction_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .first();
  },
});

export const updateStatus = mutation({
  args: {
    agreement_id: v.id("rental_agreements"),
    target_status: agreementStatusValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AGREEMENTS_GENERATE);
    const agreement = await getAgreementOrThrow(ctx, args.agreement_id);
    const transaction = await ctx.db.get(agreement.transaction_id);

    if (!transaction || transaction.is_deleted) {
      throw new Error("Transaction not found");
    }

    if (args.target_status === AGREEMENT_STATUS.SENT && !agreement.document_storage_id) {
      throw new Error("Cannot send agreement without attached document");
    }

    if (
      args.target_status === AGREEMENT_STATUS.SIGNED &&
      (!agreement.tenant_signature || !agreement.owner_signature)
    ) {
      throw new Error(
        "Cannot mark agreement as SIGNED: both tenant and owner signatures are required",
      );
    }

    if (
      args.target_status === AGREEMENT_STATUS.SIGNED &&
      transaction.status !== TRANSACTION_STATUS.AGREEMENT_PENDING &&
      transaction.status !== TRANSACTION_STATUS.AGREEMENT_SENT
    ) {
      throw new Error("Transaction is not in agreement stage — cannot mark agreement as signed");
    }

    if (!isValidTransition(agreement.status, args.target_status)) {
      throw new Error(`Invalid agreement transition: ${agreement.status} -> ${args.target_status}`);
    }

    const patch: Record<string, unknown> = {
      status: args.target_status,
      updated_at: Date.now(),
    };

    if (args.target_status === AGREEMENT_STATUS.DRAFT) {
      patch.tenant_signature = undefined;
      patch.owner_signature = undefined;
    }

    await ctx.db.patch(agreement._id, patch);

    if (args.target_status === AGREEMENT_STATUS.SENT) {
      if (transaction.status === TRANSACTION_STATUS.AGREEMENT_PENDING) {
        await advanceTransactionStatusInternal(
          ctx,
          agreement.transaction_id,
          TRANSACTION_STATUS.AGREEMENT_SENT,
        );
      }
    }

    if (args.target_status === AGREEMENT_STATUS.SIGNED) {
      if (transaction.status === TRANSACTION_STATUS.AGREEMENT_PENDING) {
        await advanceTransactionStatusInternal(
          ctx,
          agreement.transaction_id,
          TRANSACTION_STATUS.AGREEMENT_SENT,
        );
        await advanceTransactionStatusInternal(
          ctx,
          agreement.transaction_id,
          TRANSACTION_STATUS.AGREEMENT_SIGNED,
        );
      } else if (transaction.status === TRANSACTION_STATUS.AGREEMENT_SENT) {
        await advanceTransactionStatusInternal(
          ctx,
          agreement.transaction_id,
          TRANSACTION_STATUS.AGREEMENT_SIGNED,
        );
      }
    }

    if (
      (args.target_status === AGREEMENT_STATUS.EXPIRED ||
        args.target_status === AGREEMENT_STATUS.CANCELLED) &&
      transaction.status === TRANSACTION_STATUS.AGREEMENT_SENT
    ) {
      await advanceTransactionStatusInternal(
        ctx,
        agreement.transaction_id,
        TRANSACTION_STATUS.AGREEMENT_PENDING,
      );
    }

    return await ctx.db.get(agreement._id);
  },
});
