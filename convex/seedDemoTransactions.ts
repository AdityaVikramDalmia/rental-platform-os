// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import {
  DEMO_EMAILS,
  DEMO_PHONES,
  daysAgo,
  lookupOwnerByPhone,
  lookupUserDoc,
} from "./seedHelpers";

export const seedDemoTransactions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingTx = await ctx.db.query("rental_transactions").first();
    if (existingTx) {
      return;
    }

    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", "admin@example.com"))
      .first();
    const tenant1 = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", "tenant1@test.demorentals.com"))
      .first();
    const tenant2 = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", "tenant2@test.demorentals.com"))
      .first();
    const owner1 = await ctx.db
      .query("owners")
      .withIndex("by_phone", (q) => q.eq("phone", "7000000001"))
      .first();
    const owner2 = await ctx.db
      .query("owners")
      .withIndex("by_phone", (q) => q.eq("phone", "7000000002"))
      .first();
    const ops1 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", "8888888888"))
      .first();
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "PUBLISHED"))
      .collect();

    if (!founder_one || !tenant1 || !tenant2 || !owner1 || !owner2 || !ops1 || listings.length === 0) {
      throw new Error(
        "seedDemoTransactions: Missing required demo users, owners, OPS user, or published listings",
      );
    }

    const founder_oneId: Id<"users"> = founder_one._id;
    const ops1Id: Id<"users"> = ops1._id;

    const tx1Id = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant1._id,
      listing_id: listings[0]._id,
      owner_id: owner1._id,
      status: "INITIATED",
      monthly_rent_paise: 2500000,
      deposit_amount_paise: 5000000,
      created_at: now - 5 * DAY,
      updated_at: now - 5 * DAY,
      is_deleted: false,
    });

    const tx2Id = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant1._id,
      listing_id: listings[1 % listings.length]._id,
      owner_id: owner1._id,
      status: "KYC_PENDING",
      monthly_rent_paise: 3000000,
      deposit_amount_paise: 6000000,
      created_at: now - 4 * DAY,
      updated_at: now - 3 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: tx2Id,
      tenant_user_id: tenant1._id,
      aadhaar_verified: true,
      employer_verified: false,
      overall_status: "IN_PROGRESS",
      police_verification_status: "NOT_STARTED",
      created_at: now - 3 * DAY,
      updated_at: now - 3 * DAY,
      is_deleted: false,
    });

    const tx3Id = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant2._id,
      listing_id: listings[2 % listings.length]._id,
      owner_id: owner2._id,
      status: "AGREEMENT_SENT",
      monthly_rent_paise: 4500000,
      deposit_amount_paise: 9000000,
      created_at: now - 7 * DAY,
      updated_at: now - 2 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: tx3Id,
      tenant_user_id: tenant2._id,
      aadhaar_verified: true,
      employer_verified: true,
      landlord_reference: {
        name: "Previous Landlord Singh",
        phone: "9800000001",
        notes: "Good tenant",
      },
      overall_status: "VERIFIED",
      police_verification_status: "SUBMITTED",
      verified_at: now - 3 * DAY,
      created_at: now - 5 * DAY,
      updated_at: now - 3 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("rental_agreements", {
      transaction_id: tx3Id,
      template_version: "v1.0",
      terms: {
        monthly_rent_paise: 4500000,
        deposit_amount_paise: 9000000,
        lock_in_months: 11,
        notice_period_months: 1,
        maintenance_paise: 500000,
        escalation_percent: 5,
        agreement_start_date: now + 14 * DAY,
        agreement_end_date: now + 14 * DAY + 365 * DAY,
        special_conditions: "No pets allowed. Painting to be done by tenant at move-out.",
      },
      status: "SENT",
      created_at: now - 2 * DAY,
      updated_at: now - 2 * DAY,
      is_deleted: false,
    });

    const tx4Id = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant1._id,
      listing_id: listings[3 % listings.length]._id,
      owner_id: owner2._id,
      status: "TOKEN_RECEIVED",
      monthly_rent_paise: 2000000,
      deposit_amount_paise: 4000000,
      token_booking_amount: 2000000,
      created_at: now - 10 * DAY,
      updated_at: now - DAY,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: tx4Id,
      tenant_user_id: tenant1._id,
      aadhaar_verified: true,
      employer_verified: true,
      overall_status: "VERIFIED",
      police_verification_status: "VERIFIED",
      verified_at: now - 7 * DAY,
      created_at: now - 9 * DAY,
      updated_at: now - 7 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("rental_agreements", {
      transaction_id: tx4Id,
      template_version: "v1.0",
      terms: {
        monthly_rent_paise: 2000000,
        deposit_amount_paise: 4000000,
        lock_in_months: 11,
        notice_period_months: 1,
        maintenance_paise: 200000,
        escalation_percent: 5,
        agreement_start_date: now + 7 * DAY,
        agreement_end_date: now + 7 * DAY + 365 * DAY,
      },
      tenant_signature: {
        signed_at: now - 3 * DAY,
        signer_name: "Ankit Mehta",
        signer_email: "tenant1@test.demorentals.com",
        signature_payload: "DEMO_SIG_TENANT_TX4",
      },
      owner_signature: {
        signed_at: now - 2 * DAY,
        signer_name: "Kavita Joshi",
        signer_email: "owner2@test.demorentals.com",
        signature_payload: "DEMO_SIG_OWNER_TX4",
      },
      status: "SIGNED",
      created_at: now - 5 * DAY,
      updated_at: now - 2 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("token_bookings", {
      transaction_id: tx4Id,
      amount_paise: 2000000,
      policy_snapshot: {
        refund_type: "FULL",
        conditions: "Refundable within 7 days of booking",
      },
      payment_reference: "UPI/DEMO/TX4/TOKEN",
      status: "CONFIRMED",
      held_at: now - DAY,
      is_deleted: false,
    });

    const tx5Id = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant2._id,
      listing_id: listings[0]._id,
      owner_id: owner1._id,
      status: "DEPOSIT_RECEIVED",
      monthly_rent_paise: 3500000,
      deposit_amount_paise: 7000000,
      token_booking_amount: 3500000,
      move_in_date: now + 3 * DAY,
      created_at: now - 14 * DAY,
      updated_at: now - 12 * 60 * 60 * 1000,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: tx5Id,
      tenant_user_id: tenant2._id,
      aadhaar_verified: true,
      employer_verified: true,
      overall_status: "VERIFIED",
      police_verification_status: "VERIFIED",
      verified_at: now - 10 * DAY,
      created_at: now - 12 * DAY,
      updated_at: now - 10 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("rental_agreements", {
      transaction_id: tx5Id,
      template_version: "v1.0",
      terms: {
        monthly_rent_paise: 3500000,
        deposit_amount_paise: 7000000,
        lock_in_months: 11,
        notice_period_months: 1,
        maintenance_paise: 350000,
        escalation_percent: 5,
        agreement_start_date: now + 3 * DAY,
        agreement_end_date: now + 3 * DAY + 365 * DAY,
      },
      tenant_signature: {
        signed_at: now - 5 * DAY,
        signer_name: "Sneha Reddy",
        signer_email: "tenant2@test.demorentals.com",
        signature_payload: "DEMO_SIG_TENANT_TX5",
      },
      owner_signature: {
        signed_at: now - 4 * DAY,
        signer_name: "Ramesh Gupta",
        signer_email: "owner1@test.demorentals.com",
        signature_payload: "DEMO_SIG_OWNER_TX5",
      },
      status: "SIGNED",
      created_at: now - 8 * DAY,
      updated_at: now - 4 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("token_bookings", {
      transaction_id: tx5Id,
      amount_paise: 3500000,
      policy_snapshot: {
        refund_type: "PARTIAL",
        conditions: "50% refundable if cancelled within 3 days",
      },
      payment_reference: "NEFT/DEMO/TX5/TOKEN",
      status: "CONFIRMED",
      held_at: now - 3 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("deposit_records", {
      transaction_id: tx5Id,
      amount_paise: 7000000,
      paid_by_tenant_at: now - DAY,
      confirmed_by_owner_at: now - 12 * 60 * 60 * 1000,
      payment_reference: "NEFT/DEMO/TX5/DEPOSIT",
      payment_events: [
        {
          amount_paise: 7000000,
          payment_reference: "NEFT/DEMO/TX5/DEPOSIT",
          recorded_at: now - DAY,
          recorded_by: founder_oneId,
        },
      ],
      status: "CONFIRMED",
      created_at: now - 2 * DAY,
      updated_at: now - 12 * 60 * 60 * 1000,
      is_deleted: false,
    });

    const tx6Id = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant1._id,
      listing_id: listings[1 % listings.length]._id,
      owner_id: owner2._id,
      status: "COMPLETED",
      monthly_rent_paise: 2800000,
      deposit_amount_paise: 5600000,
      token_booking_amount: 2800000,
      move_in_date: now - 2 * DAY,
      created_at: now - 21 * DAY,
      updated_at: now - 2 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: tx6Id,
      tenant_user_id: tenant1._id,
      aadhaar_verified: true,
      employer_verified: true,
      overall_status: "VERIFIED",
      police_verification_status: "VERIFIED",
      verified_at: now - 12 * DAY,
      created_at: now - 14 * DAY,
      updated_at: now - 12 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("rental_agreements", {
      transaction_id: tx6Id,
      template_version: "v1.0",
      terms: {
        monthly_rent_paise: 2800000,
        deposit_amount_paise: 5600000,
        lock_in_months: 11,
        notice_period_months: 1,
        maintenance_paise: 280000,
        escalation_percent: 5,
        agreement_start_date: now - 2 * DAY,
        agreement_end_date: now - 2 * DAY + 365 * DAY,
      },
      tenant_signature: {
        signed_at: now - 8 * DAY,
        signer_name: "Ankit Mehta",
        signer_email: "tenant1@test.demorentals.com",
        signature_payload: "DEMO_SIG_TENANT_TX6",
      },
      owner_signature: {
        signed_at: now - 7 * DAY,
        signer_name: "Kavita Joshi",
        signer_email: "owner2@test.demorentals.com",
        signature_payload: "DEMO_SIG_OWNER_TX6",
      },
      status: "SIGNED",
      created_at: now - 11 * DAY,
      updated_at: now - 7 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("token_bookings", {
      transaction_id: tx6Id,
      amount_paise: 2800000,
      policy_snapshot: {
        refund_type: "FULL",
        conditions: "No refund after handover completion",
      },
      payment_reference: "UPI/DEMO/TX6/TOKEN",
      status: "CONFIRMED",
      held_at: now - 9 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("deposit_records", {
      transaction_id: tx6Id,
      amount_paise: 5600000,
      paid_by_tenant_at: now - 6 * DAY,
      confirmed_by_owner_at: now - 5 * DAY,
      payment_reference: "NEFT/DEMO/TX6/DEPOSIT",
      payment_events: [
        {
          amount_paise: 5600000,
          payment_reference: "NEFT/DEMO/TX6/DEPOSIT",
          recorded_at: now - 6 * DAY,
          recorded_by: founder_oneId,
        },
      ],
      status: "CONFIRMED",
      created_at: now - 6 * DAY,
      updated_at: now - 5 * DAY,
      is_deleted: false,
    });

    await ctx.db.insert("handover_checklists", {
      transaction_id: tx6Id,
      items: [
        {
          label: "Main door lock and keys handed over",
          checked: true,
          checked_at: now - 2 * DAY,
          checked_by: ops1Id,
        },
        {
          label: "Electricity meter reading captured",
          checked: true,
          checked_at: now - 2 * DAY,
          checked_by: ops1Id,
        },
        {
          label: "Water supply and taps verified",
          checked: true,
          checked_at: now - 2 * DAY,
          checked_by: ops1Id,
        },
        {
          label: "Basic appliances and lights checked",
          checked: true,
          checked_at: now - 2 * DAY,
          checked_by: ops1Id,
        },
        {
          label: "Inventory and damage notes captured",
          checked: true,
          checked_at: now - 2 * DAY,
          checked_by: ops1Id,
        },
        {
          label: "Society move-in formalities completed",
          checked: true,
          checked_at: now - 2 * DAY,
          checked_by: ops1Id,
        },
      ],
      completed_at: now - 2 * DAY,
      completed_by: ops1Id,
      is_deleted: false,
      created_at: now - 3 * DAY,
      updated_at: now - 2 * DAY,
    });

    void tx1Id;
  },
});

const TRANSACTION_EDGE_MARKERS = {
  kycRejected: "SEED_EDGE_KYC_REJECTED",
  agreementExpired: "SEED_EDGE_AGREEMENT_EXPIRED",
  depositDisputed: "SEED_EDGE_DEPOSIT_DISPUTED",
  cancelled: "SEED_EDGE_CANCELLED",
} as const;

async function getSeedTransactionContext(ctx: MutationCtx): Promise<{
  founder_one: Doc<"users">;
  tenant1: Doc<"users">;
  tenant2: Doc<"users">;
  owner1: Doc<"owners">;
  owner2: Doc<"owners">;
  listings: Array<Doc<"listings">>;
}> {
  const [founder_one, tenant1, tenant2, owner1Maybe, owner2Maybe, listings] = await Promise.all([
    lookupUserDoc(ctx, DEMO_EMAILS.founder_one),
    lookupUserDoc(ctx, DEMO_EMAILS.tenant1),
    lookupUserDoc(ctx, DEMO_EMAILS.tenant2),
    lookupOwnerByPhone(ctx, DEMO_PHONES.owner1),
    lookupOwnerByPhone(ctx, DEMO_PHONES.owner2),
    ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "PUBLISHED"))
      .collect(),
  ]);

  if (!owner1Maybe || !owner2Maybe || listings.length === 0) {
    throw new Error(
      "seedDemoTransactions edge scenarios: Missing required owners or published listings",
    );
  }

  return {
    founder_one,
    tenant1,
    tenant2,
    owner1: owner1Maybe,
    owner2: owner2Maybe,
    listings,
  };
}

function pickListing(listings: Array<Doc<"listings">>, index: number): Doc<"listings"> {
  return listings[index % listings.length];
}

async function findEdgeTransactionByMarker(
  ctx: MutationCtx,
  status: Doc<"rental_transactions">["status"],
  marker: string,
): Promise<Doc<"rental_transactions"> | null> {
  return await ctx.db
    .query("rental_transactions")
    .withIndex("by_status", (q) => q.eq("status", status))
    .filter((q) => q.eq(q.field("last_override_reason"), marker))
    .first();
}

export const seedTransactionKycRejected = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await findEdgeTransactionByMarker(
      ctx,
      "KYC_REJECTED",
      TRANSACTION_EDGE_MARKERS.kycRejected,
    );
    if (existing) {
      return existing._id;
    }

    const { tenant1, owner1, listings } = await getSeedTransactionContext(ctx);
    const initiatedAt = daysAgo(10);
    const submittedAt = daysAgo(8);
    const rejectedAt = daysAgo(7);

    const transactionId = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant1._id,
      listing_id: pickListing(listings, 0)._id,
      owner_id: owner1._id,
      status: "KYC_REJECTED",
      monthly_rent_paise: 2600000,
      deposit_amount_paise: 5200000,
      last_override_reason: TRANSACTION_EDGE_MARKERS.kycRejected,
      created_at: initiatedAt,
      updated_at: rejectedAt,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: transactionId,
      tenant_user_id: tenant1._id,
      aadhaar_verified: false,
      employer_verified: false,
      overall_status: "REJECTED",
      status_note: `Aadhaar document expired | aadhaar_number: XXXX-XXXX-7812 | verification_method: MANUAL_DOC_REVIEW | submitted_at: ${submittedAt} | reviewed_at: ${rejectedAt}`,
      police_verification_status: "NOT_STARTED",
      created_at: submittedAt,
      updated_at: rejectedAt,
      is_deleted: false,
    });

    return transactionId;
  },
});

export const seedTransactionAgreementExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await findEdgeTransactionByMarker(
      ctx,
      "AGREEMENT_PENDING",
      TRANSACTION_EDGE_MARKERS.agreementExpired,
    );
    if (existing) {
      return existing._id;
    }

    const { tenant2, owner2, listings } = await getSeedTransactionContext(ctx);
    const initiatedAt = daysAgo(20);
    const kycVerifiedAt = daysAgo(17);
    const agreementGeneratedAt = daysAgo(15);
    const agreementExpiredAt = daysAgo(5);

    const transactionId = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant2._id,
      listing_id: pickListing(listings, 1)._id,
      owner_id: owner2._id,
      status: "AGREEMENT_PENDING",
      monthly_rent_paise: 3100000,
      deposit_amount_paise: 6200000,
      last_override_reason: TRANSACTION_EDGE_MARKERS.agreementExpired,
      last_override_at: agreementExpiredAt,
      created_at: initiatedAt,
      updated_at: agreementExpiredAt,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: transactionId,
      tenant_user_id: tenant2._id,
      aadhaar_verified: true,
      employer_verified: true,
      overall_status: "VERIFIED",
      police_verification_status: "SUBMITTED",
      verified_at: kycVerifiedAt,
      created_at: daysAgo(18),
      updated_at: kycVerifiedAt,
      is_deleted: false,
    });

    await ctx.db.insert("rental_agreements", {
      transaction_id: transactionId,
      template_version: "v1.0-seed-edge-agreement-expired",
      terms: {
        monthly_rent_paise: 3100000,
        deposit_amount_paise: 6200000,
        lock_in_months: 11,
        notice_period_months: 1,
        maintenance_paise: 250000,
        escalation_percent: 5,
        agreement_start_date: daysAgo(4),
        agreement_end_date: daysAgo(1),
        special_conditions: `Unsigned agreement auto-expired after eSign deadline (expires_at: ${agreementExpiredAt})`,
      },
      status: "EXPIRED",
      created_at: agreementGeneratedAt,
      updated_at: agreementExpiredAt,
      is_deleted: false,
    });

    return transactionId;
  },
});

export const seedTransactionDepositDisputed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await findEdgeTransactionByMarker(
      ctx,
      "DEPOSIT_PENDING",
      TRANSACTION_EDGE_MARKERS.depositDisputed,
    );
    if (existing) {
      return existing._id;
    }

    const { founder_one, tenant1, owner2, listings } = await getSeedTransactionContext(ctx);
    const initiatedAt = daysAgo(15);
    const kycVerifiedAt = daysAgo(12);
    const agreementSignedAt = daysAgo(10);
    const tokenHeldAt = daysAgo(8);
    const depositAttemptedAt = daysAgo(3);

    const transactionId = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant1._id,
      listing_id: pickListing(listings, 2)._id,
      owner_id: owner2._id,
      status: "DEPOSIT_PENDING",
      monthly_rent_paise: 2500000,
      deposit_amount_paise: 5000000,
      token_booking_amount: 2500000,
      last_override_reason: TRANSACTION_EDGE_MARKERS.depositDisputed,
      created_at: initiatedAt,
      updated_at: depositAttemptedAt,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: transactionId,
      tenant_user_id: tenant1._id,
      aadhaar_verified: true,
      employer_verified: true,
      overall_status: "VERIFIED",
      police_verification_status: "VERIFIED",
      verified_at: kycVerifiedAt,
      created_at: daysAgo(13),
      updated_at: kycVerifiedAt,
      is_deleted: false,
    });

    await ctx.db.insert("rental_agreements", {
      transaction_id: transactionId,
      template_version: "v1.0-seed-edge-deposit-dispute",
      terms: {
        monthly_rent_paise: 2500000,
        deposit_amount_paise: 5000000,
        lock_in_months: 11,
        notice_period_months: 1,
        maintenance_paise: 200000,
        escalation_percent: 5,
        agreement_start_date: daysAgo(2),
        agreement_end_date: daysAgo(2) + 365 * 24 * 60 * 60 * 1000,
      },
      tenant_signature: {
        signed_at: agreementSignedAt,
        signer_name: tenant1.name,
        signer_email: tenant1.email,
        signature_payload: "SEED_EDGE_SIG_TENANT_DEPOSIT_DISPUTE",
      },
      owner_signature: {
        signed_at: daysAgo(9),
        signer_name: owner2.name,
        signer_email: owner2.email,
        signature_payload: "SEED_EDGE_SIG_OWNER_DEPOSIT_DISPUTE",
      },
      status: "SIGNED",
      created_at: daysAgo(11),
      updated_at: daysAgo(9),
      is_deleted: false,
    });

    await ctx.db.insert("token_bookings", {
      transaction_id: transactionId,
      amount_paise: 2500000,
      policy_snapshot: {
        refund_type: "PARTIAL",
        conditions: "Token refundable only if owner cancels",
      },
      payment_reference: "UPI/SEED/EDGE/DEPOSIT_DISPUTE/TOKEN",
      status: "CONFIRMED",
      held_at: tokenHeldAt,
      resolved_at: tokenHeldAt,
      is_deleted: false,
    });

    await ctx.db.insert("deposit_records", {
      transaction_id: transactionId,
      amount_paise: 4500000,
      paid_by_tenant_at: depositAttemptedAt,
      payment_reference: "NEFT/SEED/EDGE/DEPOSIT_DISPUTE",
      payment_events: [
        {
          amount_paise: 4500000,
          payment_reference: "NEFT/SEED/EDGE/DEPOSIT_DISPUTE",
          recorded_at: depositAttemptedAt,
          recorded_by: founder_one._id,
        },
      ],
      mismatch_reason: "Amount received ₹45,000 but expected ₹50,000",
      status_note: "Amount received ₹45,000 but expected ₹50,000",
      status: "DISPUTED",
      created_at: depositAttemptedAt,
      updated_at: depositAttemptedAt,
      is_deleted: false,
    });

    return transactionId;
  },
});

export const seedTransactionCancelled = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await findEdgeTransactionByMarker(
      ctx,
      "CANCELLED",
      TRANSACTION_EDGE_MARKERS.cancelled,
    );
    if (existing) {
      return existing._id;
    }

    const { founder_one, tenant2, owner1, listings } = await getSeedTransactionContext(ctx);
    const initiatedAt = daysAgo(12);
    const kycVerifiedAt = daysAgo(9);
    const agreementSignedAt = daysAgo(7);
    const tokenHeldAt = daysAgo(4);
    const cancelledAt = daysAgo(2);
    const cancellationReason = "Tenant relocated to different city";

    const transactionId = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant2._id,
      listing_id: pickListing(listings, 3)._id,
      owner_id: owner1._id,
      status: "CANCELLED",
      monthly_rent_paise: 2200000,
      deposit_amount_paise: 4400000,
      token_booking_amount: 2200000,
      cancellation_reason: cancellationReason,
      last_override_reason: TRANSACTION_EDGE_MARKERS.cancelled,
      last_override_by: String(founder_one._id),
      last_override_at: cancelledAt,
      created_at: initiatedAt,
      updated_at: cancelledAt,
      is_deleted: false,
    });

    await ctx.db.insert("kyc_packets", {
      transaction_id: transactionId,
      tenant_user_id: tenant2._id,
      aadhaar_verified: true,
      employer_verified: true,
      overall_status: "VERIFIED",
      police_verification_status: "VERIFIED",
      verified_at: kycVerifiedAt,
      created_at: daysAgo(10),
      updated_at: kycVerifiedAt,
      is_deleted: false,
    });

    await ctx.db.insert("rental_agreements", {
      transaction_id: transactionId,
      template_version: "v1.0-seed-edge-cancelled",
      terms: {
        monthly_rent_paise: 2200000,
        deposit_amount_paise: 4400000,
        lock_in_months: 11,
        notice_period_months: 1,
        maintenance_paise: 220000,
        escalation_percent: 5,
        agreement_start_date: daysAgo(1),
        agreement_end_date: daysAgo(1) + 365 * 24 * 60 * 60 * 1000,
      },
      tenant_signature: {
        signed_at: agreementSignedAt,
        signer_name: tenant2.name,
        signer_email: tenant2.email,
        signature_payload: "SEED_EDGE_SIG_TENANT_CANCELLED",
      },
      owner_signature: {
        signed_at: daysAgo(6),
        signer_name: owner1.name,
        signer_email: owner1.email,
        signature_payload: "SEED_EDGE_SIG_OWNER_CANCELLED",
      },
      status: "SIGNED",
      created_at: daysAgo(8),
      updated_at: daysAgo(6),
      is_deleted: false,
    });

    await ctx.db.insert("token_bookings", {
      transaction_id: transactionId,
      amount_paise: 2200000,
      policy_snapshot: {
        refund_type: "FULL",
        conditions: "Full refund when tenant cancellation is approved by admin",
      },
      payment_reference: "UPI/SEED/EDGE/CANCELLED/TOKEN",
      refund_reference: "UPI/SEED/EDGE/CANCELLED/REFUND",
      refunded_by: founder_one._id,
      refunded_at: cancelledAt,
      refund_amount_paise: 2200000,
      cancelled_by: founder_one._id,
      cancelled_at: cancelledAt,
      cancel_reason: cancellationReason,
      status_note: "Refund initiated after transaction cancellation",
      status: "CANCELLED",
      held_at: tokenHeldAt,
      resolved_at: cancelledAt,
      is_deleted: false,
    });

    return transactionId;
  },
});
