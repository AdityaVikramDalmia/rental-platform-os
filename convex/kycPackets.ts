import { v } from "convex/values";
import {
  KYC_PACKET_STATUS,
  PERMISSIONS,
  POLICE_VERIFICATION_STATUS,
  TRANSACTION_STATUS,
  USER_TYPE,
  VALID_KYC_TRANSITIONS,
  type KycPacketStatus,
  type PoliceVerificationStatus,
} from "../lib/constants";
import { normalizePhone } from "../lib/validators";
import { requireAuth, requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";
import { advanceTransactionStatusInternal } from "./rentalTransactions";
import {
  ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
  validateOptionalStoredFile,
} from "./storageValidation";

const kycPacketStatusValidator = v.union(
  v.literal(KYC_PACKET_STATUS.PENDING),
  v.literal(KYC_PACKET_STATUS.IN_PROGRESS),
  v.literal(KYC_PACKET_STATUS.PROVIDER_ERROR),
  v.literal(KYC_PACKET_STATUS.NEEDS_REVIEW),
  v.literal(KYC_PACKET_STATUS.VERIFIED),
  v.literal(KYC_PACKET_STATUS.REJECTED),
);

const policeVerificationStatusValidator = v.union(
  v.literal(POLICE_VERIFICATION_STATUS.NOT_STARTED),
  v.literal(POLICE_VERIFICATION_STATUS.FORM_GENERATED),
  v.literal(POLICE_VERIFICATION_STATUS.SUBMITTED),
  v.literal(POLICE_VERIFICATION_STATUS.VERIFIED),
  v.literal(POLICE_VERIFICATION_STATUS.REJECTED),
);

function isValidKycTransition(current: KycPacketStatus, target: KycPacketStatus): boolean {
  return (VALID_KYC_TRANSITIONS[current] ?? []).includes(target);
}

// Strict transitions enforced in code. notes/04-state-machines.md describes this as
// "manual" but we enforce order for data integrity. See P34 adversarial review decision.
const VALID_POLICE_VERIFICATION_TRANSITIONS: Record<
  PoliceVerificationStatus,
  PoliceVerificationStatus[]
> = {
  [POLICE_VERIFICATION_STATUS.NOT_STARTED]: [POLICE_VERIFICATION_STATUS.FORM_GENERATED],
  [POLICE_VERIFICATION_STATUS.FORM_GENERATED]: [POLICE_VERIFICATION_STATUS.SUBMITTED],
  [POLICE_VERIFICATION_STATUS.SUBMITTED]: [
    POLICE_VERIFICATION_STATUS.VERIFIED,
    POLICE_VERIFICATION_STATUS.REJECTED,
  ],
  [POLICE_VERIFICATION_STATUS.VERIFIED]: [],
  [POLICE_VERIFICATION_STATUS.REJECTED]: [],
};

function isValidPoliceVerificationTransition(
  current: PoliceVerificationStatus,
  target: PoliceVerificationStatus,
): boolean {
  return (VALID_POLICE_VERIFICATION_TRANSITIONS[current] ?? []).includes(target);
}

export const create = mutation({
  args: {
    transaction_id: v.id("rental_transactions"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.KYC_VERIFY);

    const transaction = await ctx.db.get(args.transaction_id);
    if (!transaction || transaction.is_deleted) {
      throw new Error("Transaction not found");
    }

    const existing = await ctx.db
      .query("kyc_packets")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .unique();

    if (existing) {
      if (
        transaction.status === TRANSACTION_STATUS.INITIATED ||
        transaction.status === TRANSACTION_STATUS.KYC_REJECTED
      ) {
        await advanceTransactionStatusInternal(
          ctx,
          transaction._id,
          TRANSACTION_STATUS.KYC_PENDING,
        );
      }
      return existing;
    }

    const now = Date.now();
    const kycPacketId = await ctx.db.insert("kyc_packets", {
      transaction_id: transaction._id,
      tenant_user_id: transaction.tenant_user_id,
      aadhaar_verified: false,
      employer_verified: false,
      landlord_reference: undefined,
      overall_status: KYC_PACKET_STATUS.PENDING,
      status_note: undefined,
      police_verification_status: POLICE_VERIFICATION_STATUS.NOT_STARTED,
      police_form_storage_id: undefined,
      police_ack_storage_id: undefined,
      verified_at: undefined,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });

    await advanceTransactionStatusInternal(ctx, transaction._id, TRANSACTION_STATUS.KYC_PENDING);

    // V1: Manual workflow. V2: Wire ctx.scheduler.runAfter(0, internal.actions.kyc.verifyAadhaar, { ... })

    const created = await ctx.db.get(kycPacketId);
    if (!created) {
      throw new Error("Failed to create KYC packet");
    }

    return created;
  },
});

export const updateStatus = mutation({
  args: {
    kyc_packet_id: v.id("kyc_packets"),
    overall_status: kycPacketStatusValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.KYC_VERIFY);

    const kycPacket = await ctx.db.get(args.kyc_packet_id);
    if (!kycPacket || kycPacket.is_deleted) {
      throw new Error("KYC packet not found");
    }

    if (kycPacket.overall_status !== args.overall_status) {
      if (!isValidKycTransition(kycPacket.overall_status, args.overall_status)) {
        throw new Error(
          `Invalid KYC status transition: ${kycPacket.overall_status} -> ${args.overall_status}`,
        );
      }
    }

    if (args.overall_status === KYC_PACKET_STATUS.VERIFIED && kycPacket.aadhaar_verified !== true) {
      throw new Error("Cannot verify KYC: Aadhaar verification is incomplete");
    }

    const now = Date.now();
    await ctx.db.patch(kycPacket._id, {
      overall_status: args.overall_status,
      status_note: args.notes?.trim() || undefined,
      verified_at:
        args.overall_status === KYC_PACKET_STATUS.VERIFIED
          ? now
          : args.overall_status === KYC_PACKET_STATUS.REJECTED
            ? undefined
            : kycPacket.verified_at,
      updated_at: now,
    });

    if (args.overall_status === KYC_PACKET_STATUS.VERIFIED) {
      await advanceTransactionStatusInternal(
        ctx,
        kycPacket.transaction_id,
        TRANSACTION_STATUS.KYC_VERIFIED,
      );
    } else if (args.overall_status === KYC_PACKET_STATUS.REJECTED) {
      await advanceTransactionStatusInternal(
        ctx,
        kycPacket.transaction_id,
        TRANSACTION_STATUS.KYC_REJECTED,
      );
    } else if (args.overall_status === KYC_PACKET_STATUS.PENDING) {
      const transaction = await ctx.db.get(kycPacket.transaction_id);
      if (transaction && transaction.status === TRANSACTION_STATUS.KYC_REJECTED) {
        await advanceTransactionStatusInternal(
          ctx,
          kycPacket.transaction_id,
          TRANSACTION_STATUS.KYC_PENDING,
        );
      }
    }

    return await ctx.db.get(kycPacket._id);
  },
});

export const updateVerificationField = mutation({
  args: {
    kyc_packet_id: v.id("kyc_packets"),
    field: v.union(v.literal("aadhaar_verified"), v.literal("employer_verified")),
    value: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.KYC_VERIFY);

    const kycPacket = await ctx.db.get(args.kyc_packet_id);
    if (!kycPacket || kycPacket.is_deleted) {
      throw new Error("KYC packet not found");
    }

    if (
      args.value === false &&
      (kycPacket.overall_status === KYC_PACKET_STATUS.VERIFIED ||
        kycPacket.overall_status === KYC_PACKET_STATUS.NEEDS_REVIEW)
    ) {
      throw new Error(
        `Cannot downgrade verification field after KYC is ${kycPacket.overall_status}. Create a new review cycle instead.`,
      );
    }

    if (args.field === "aadhaar_verified") {
      await ctx.db.patch(kycPacket._id, {
        aadhaar_verified: args.value,
        updated_at: Date.now(),
      });

      // V1: Manual workflow. V2: Wire ctx.scheduler.runAfter(0, internal.actions.kyc.verifyAadhaar, { ... })
    } else {
      await ctx.db.patch(kycPacket._id, {
        employer_verified: args.value,
        updated_at: Date.now(),
      });
    }

    return await ctx.db.get(kycPacket._id);
  },
});

export const updateLandlordReference = mutation({
  args: {
    kyc_packet_id: v.id("kyc_packets"),
    reference: v.object({
      name: v.string(),
      phone: v.string(),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.KYC_VERIFY);

    const kycPacket = await ctx.db.get(args.kyc_packet_id);
    if (!kycPacket || kycPacket.is_deleted) {
      throw new Error("KYC packet not found");
    }

    const name = args.reference.name.trim();
    if (!name) {
      throw new Error("reference.name is required");
    }

    await ctx.db.patch(kycPacket._id, {
      landlord_reference: {
        name,
        phone: normalizePhone(args.reference.phone),
        notes: args.reference.notes?.trim() || undefined,
      },
      updated_at: Date.now(),
    });

    return await ctx.db.get(kycPacket._id);
  },
});

export const updatePoliceVerification = mutation({
  args: {
    kyc_packet_id: v.id("kyc_packets"),
    police_verification_status: policeVerificationStatusValidator,
    police_form_storage_id: v.optional(v.id("_storage")),
    police_ack_storage_id: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.KYC_VERIFY);

    const kycPacket = await ctx.db.get(args.kyc_packet_id);
    if (!kycPacket || kycPacket.is_deleted) {
      throw new Error("KYC packet not found");
    }

    const currentPoliceStatus: PoliceVerificationStatus =
      kycPacket.police_verification_status ?? POLICE_VERIFICATION_STATUS.NOT_STARTED;

    if (
      currentPoliceStatus !== args.police_verification_status &&
      !isValidPoliceVerificationTransition(currentPoliceStatus, args.police_verification_status)
    ) {
      throw new Error(
        `Invalid police verification transition: ${currentPoliceStatus} -> ${args.police_verification_status}`,
      );
    }

    const hasPoliceFormStorageId =
      args.police_form_storage_id !== undefined || kycPacket.police_form_storage_id !== undefined;
    if (
      args.police_verification_status === POLICE_VERIFICATION_STATUS.FORM_GENERATED &&
      !hasPoliceFormStorageId
    ) {
      throw new Error("Police form evidence is required for FORM_GENERATED status");
    }

    const hasPoliceAckStorageId =
      args.police_ack_storage_id !== undefined || kycPacket.police_ack_storage_id !== undefined;
    if (
      args.police_verification_status === POLICE_VERIFICATION_STATUS.SUBMITTED &&
      !hasPoliceAckStorageId
    ) {
      throw new Error("Police acknowledgment evidence is required for SUBMITTED status");
    }

    await validateOptionalStoredFile(ctx, args.police_form_storage_id, {
      fieldName: "police_form_storage_id",
      allowedContentTypes: ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
      allowedLabel: "JPEG, PNG, WebP, and PDF",
    });

    await validateOptionalStoredFile(ctx, args.police_ack_storage_id, {
      fieldName: "police_ack_storage_id",
      allowedContentTypes: ALLOWED_IMAGE_OR_PDF_CONTENT_TYPES,
      allowedLabel: "JPEG, PNG, WebP, and PDF",
    });

    const patch: Record<string, unknown> = {
      police_verification_status: args.police_verification_status,
      updated_at: Date.now(),
    };

    if (args.police_form_storage_id !== undefined) {
      patch.police_form_storage_id = args.police_form_storage_id;
    }

    if (args.police_ack_storage_id !== undefined) {
      patch.police_ack_storage_id = args.police_ack_storage_id;
    }

    // Police verification adverse result is recorded in police_verification_status.
    // It does not auto-downgrade overall KYC status or clear verified_at. Admin must
    // review and take manual action via the KYC admin interface if the adverse result
    // invalidates the verification.

    await ctx.db.patch(kycPacket._id, patch);

    return await ctx.db.get(kycPacket._id);
  },
});

export const getByTransaction = query({
  args: {
    transaction_id: v.id("rental_transactions"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const packet = await ctx.db
      .query("kyc_packets")
      .withIndex("by_transaction_id", (q) => q.eq("transaction_id", args.transaction_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .unique();

    if (!packet) {
      return null;
    }

    if (
      (user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT) &&
      packet.tenant_user_id !== user._id
    ) {
      throw new Error("You can only view your own KYC packet");
    }

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.KYC_VERIFY);
    }

    const hasBackofficePersona =
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS);
    const hasTenantPersona =
      user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT;

    if (!hasBackofficePersona && !hasTenantPersona) {
      throw new Error("Not authorized to view KYC packet");
    }

    if (user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT) {
      return {
        _id: packet._id,
        transaction_id: packet.transaction_id,
        overall_status: packet.overall_status,
        aadhaar_verified: packet.aadhaar_verified,
        employer_verified: packet.employer_verified,
        police_verification_status: packet.police_verification_status,
        _creationTime: packet._creationTime,
      };
    }

    return packet;
  },
});
