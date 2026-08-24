// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import {
  AGREEMENT_STATUS,
  AVAILABILITY_TYPE,
  BHK_CONFIG,
  CALL_OUTCOME,
  CHAT_CHANNEL_STATUS,
  CHAT_SENDER_ROLE,
  CLOSURE_STATUS,
  DEAL_CHECKLIST_ITEM_OVERALL_STATUS,
  DEAL_CHECKLIST_ITEM_SOURCE,
  DEAL_CHECKLIST_STATUS,
  DEAL_TERM_TYPE,
  DEPOSIT_RECORD_STATUS,
  FURNISHING,
  KYC_PACKET_STATUS,
  LEAD_STATUS,
  LISTING_STATUS,
  MAINTENANCE_PAID_BY,
  NEGOTIATION_PROPOSAL_STATUS,
  NEGOTIATION_STATUS,
  PAYOUT_METHOD,
  PAYOUT_STATUS,
  POLICE_VERIFICATION_STATUS,
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  REFERRAL_STATUS,
  REFERRAL_TYPE,
  RENT_ESCALATION_TYPE,
  TENANT_INQUIRY_STATUS,
  TOKEN_BOOKING_STATUS,
  TOKEN_COLLECTION_METHOD,
  TOKEN_RECORD_STATUS,
  TOKEN_REFUND_POLICY,
  TRANSACTION_STATUS,
  VISIT_OUTCOME,
  VISIT_STATUS,
} from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import {
  DEMO_EMAILS,
  DEMO_PHONES,
  daysAgo,
  ensureSeedRecord,
  lookupBuildingInSociety,
  lookupLeadByFlat,
  lookupListingBySlug,
  lookupOwnerByPhone,
  lookupSocietyDoc,
  lookupUserDoc,
} from "./seedHelpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const JOURNEY_PHONES = {
  happyTenant: "9555100101",
  negotiationTenant: "9555100201",
  dealRoomTenant: "9555100401",
  referralLeadOwner: "9555300301",
  verificationK201: "9555200201",
  verificationK202: "9555200202",
  verificationK203: "9555200203",
  verificationK204: "9555200204",
} as const;

type SeedContext = {
  admin: Doc<"users">;
  guard1: Doc<"users">;
  guard2: Doc<"users">;
  guard3: Doc<"users">;
  tenant1: Doc<"users">;
  tenant2: Doc<"users">;
  owner1User: Doc<"users">;
  owner2User: Doc<"users">;
  owner1Entity: Doc<"owners">;
  owner2Entity: Doc<"owners">;
  testSociety: Doc<"societies">;
  testBuildingId: Id<"buildings">;
};

function daysAgoAt(dayCount: number, hour: number, minute = 0): number {
  const ts = daysAgo(dayCount);
  const date = new Date(ts);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

function daysFromNowAt(dayCount: number, hour: number, minute = 0): number {
  const date = new Date(Date.now() + dayCount * DAY_MS);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

async function resolveSeedContext(ctx: MutationCtx): Promise<SeedContext> {
  const [
    admin,
    guard1,
    guard2,
    guard3,
    tenant1,
    tenant2,
    owner1User,
    owner2User,
    testSociety,
    owner1EntityMaybe,
    owner2EntityMaybe,
  ] = await Promise.all([
    lookupUserDoc(ctx, DEMO_EMAILS.founder_one),
    lookupUserDoc(ctx, DEMO_EMAILS.guard1),
    lookupUserDoc(ctx, DEMO_EMAILS.guard2),
    lookupUserDoc(ctx, DEMO_EMAILS.guard3),
    lookupUserDoc(ctx, DEMO_EMAILS.tenant1),
    lookupUserDoc(ctx, DEMO_EMAILS.tenant2),
    lookupUserDoc(ctx, DEMO_EMAILS.owner1),
    lookupUserDoc(ctx, DEMO_EMAILS.owner2),
    lookupSocietyDoc(ctx, "Test Society"),
    lookupOwnerByPhone(ctx, DEMO_PHONES.owner1),
    lookupOwnerByPhone(ctx, DEMO_PHONES.owner2),
  ]);

  const owner1Entity = owner1EntityMaybe;
  const owner2Entity = owner2EntityMaybe;
  if (!owner1Entity || !owner2Entity) {
    throw new Error("seedDemoJourneys: owner entities missing. Run seedDemo:seedMega first.");
  }

  const testBuildingId = await lookupBuildingInSociety(ctx, testSociety._id, "Test Tower A");

  return {
    admin,
    guard1,
    guard2,
    guard3,
    tenant1,
    tenant2,
    owner1User,
    owner2User,
    owner1Entity,
    owner2Entity,
    testSociety,
    testBuildingId,
  };
}

async function ensureLeadByFlat(
  ctx: MutationCtx,
  args: {
    buildingId: Id<"buildings">;
    societyId: Id<"societies">;
    flatNumber: string;
    floorNumber: string;
    ownerName: string;
    ownerPhone: string;
    ownerId?: Id<"owners">;
    submittedByGuardId: Id<"users">;
    status: Doc<"leads">["status"];
    rentExpected: number;
    availabilityDate?: number;
    notes: string;
  },
): Promise<Doc<"leads">> {
  const lead = await ensureSeedRecord(ctx, {
    label: `lead ${args.flatNumber}`,
    lookup: () => lookupLeadByFlat(ctx, args.buildingId, args.flatNumber),
    create: async () =>
      await ctx.db.insert("leads", {
        society_id: args.societyId,
        building_id: args.buildingId,
        floor_number: args.floorNumber,
        flat_number: args.flatNumber,
        owner_name: args.ownerName,
        owner_phone: args.ownerPhone,
        owner_id: args.ownerId,
        availability_type: AVAILABILITY_TYPE.VACANT_FROM,
        availability_date: args.availabilityDate,
        rent_expected: args.rentExpected,
        furnishing: FURNISHING.SEMI_FURNISHED,
        notes: args.notes,
        owner_consent_to_call: true,
        submitted_by_guard_id: args.submittedByGuardId,
        status: args.status,
        notes_thread: undefined,
        quality_flags: undefined,
        duplicate_of_lead_id: undefined,
        prospective_bounty: 25000,
        searchable_text: `${args.ownerName} ${args.ownerPhone} ${args.flatNumber}`,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        floor_number: args.floorNumber,
        owner_name: args.ownerName,
        owner_phone: args.ownerPhone,
        owner_id: args.ownerId,
        availability_type: AVAILABILITY_TYPE.VACANT_FROM,
        availability_date: args.availabilityDate,
        rent_expected: args.rentExpected,
        furnishing: FURNISHING.SEMI_FURNISHED,
        notes: args.notes,
        owner_consent_to_call: true,
        submitted_by_guard_id: args.submittedByGuardId,
        status: args.status,
        duplicate_of_lead_id: undefined,
        searchable_text: `${args.ownerName} ${args.ownerPhone} ${args.flatNumber}`,
      });
    },
  });

  return lead.doc;
}

async function getAnyPublishedListing(
  ctx: MutationCtx,
  options?: { excludeSlugs?: string[] },
): Promise<Doc<"listings">> {
  const excludeSet = new Set(options?.excludeSlugs ?? []);
  const candidateSlugs = [
    "1bhk-test-society-andheri-302",
    "2bhk-test-society-andheri-604",
    "2bhk-sunshine-heights-bandra-501",
    "1bhk-wingb-sunshine-bandra-202",
    "3bhk-green-valley-powai-904",
  ];

  for (const slug of candidateSlugs) {
    if (excludeSet.has(slug)) continue;
    const listing = await lookupListingBySlug(ctx, slug);
    if (listing && listing.status === LISTING_STATUS.PUBLISHED) {
      return listing;
    }
  }

  const fallback = await ctx.db
    .query("listings")
    .withIndex("by_status", (q) => q.eq("status", LISTING_STATUS.PUBLISHED))
    .first();
  if (!fallback) {
    throw new Error(
      "seedDemoJourneys: no published listing available. Run seedDemo:seedMega first.",
    );
  }
  return fallback;
}

async function ensureJourneyLeadToClosureHappy(ctx: MutationCtx) {
  const seed = await resolveSeedContext(ctx);

  const verificationAt = daysAgoAt(40, 11);
  const inquiryVisitDate = daysAgoAt(15, 16);
  const visitStart = daysAgoAt(14, 16);
  const visitEnd = visitStart + HOUR_MS;
  const visitCompletedAt = visitStart + 40 * 60 * 1000;
  const closureConfirmedAt = daysAgoAt(5, 18);
  const payoutApprovedAt = daysAgoAt(4, 13);
  const payoutDisbursedAt = daysAgoAt(3, 15);

  const lead = await ensureLeadByFlat(ctx, {
    buildingId: seed.testBuildingId,
    societyId: seed.testSociety._id,
    flatNumber: "J-101",
    floorNumber: "10",
    ownerName: "Ramesh Gupta",
    ownerPhone: DEMO_PHONES.owner1,
    ownerId: seed.owner1Entity._id,
    submittedByGuardId: seed.guard1._id,
    status: LEAD_STATUS.VERIFIED,
    rentExpected: 2500000,
    availabilityDate: daysAgoAt(44, 10),
    notes: "Journey happy path lead from J-101.",
  });

  const verification = await ensureSeedRecord(ctx, {
    label: "verification J-101",
    lookup: async () =>
      await ctx.db
        .query("owner_verifications")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .filter((q) => q.eq(q.field("notes"), "Journey-Happy:J-101:VERIFIED"))
        .first(),
    create: async () =>
      await ctx.db.insert("owner_verifications", {
        lead_id: lead._id,
        called_by_admin_id: seed.admin._id,
        call_outcome: CALL_OUTCOME.VERIFIED,
        consent_contact_demorentals: true,
        consent_visit_coordination: true,
        preferred_visit_slots: "Weekdays after 6 PM",
        rent_confirmed: 2500000,
        notes: "Journey-Happy:J-101:VERIFIED",
        verified_at: verificationAt,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        call_outcome: CALL_OUTCOME.VERIFIED,
        consent_contact_demorentals: true,
        consent_visit_coordination: true,
        preferred_visit_slots: "Weekdays after 6 PM",
        rent_confirmed: 2500000,
        verified_at: verificationAt,
      });
    },
  });

  const listing = await ensureSeedRecord(ctx, {
    label: "listing journey-j-101-happy",
    lookup: async () => await lookupListingBySlug(ctx, "journey-j-101-happy"),
    create: async () =>
      await ctx.db.insert("listings", {
        lead_id: lead._id,
        owner_id: seed.owner1Entity._id,
        slug: "journey-j-101-happy",
        status: LISTING_STATUS.PUBLISHED,
        rent_monthly: 2500000,
        deposit: 7500000,
        maintenance: 250000,
        bhk_config: BHK_CONFIG["2BHK"],
        furnishing: FURNISHING.SEMI_FURNISHED,
        floor_number: "10",
        carpet_area_sqft: 920,
        available_from: daysAgoAt(35, 10),
        description: "Happy path listing for journey seed J-101.",
        house_rules: ["No loud parties", "Society rules apply"],
        parking: "COVERED",
        pet_friendly: true,
        amenities: ["security", "lift", "cctv", "parking"],
        created_by_admin_id: seed.admin._id,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        lead_id: lead._id,
        owner_id: seed.owner1Entity._id,
        status: LISTING_STATUS.PUBLISHED,
        rent_monthly: 2500000,
        deposit: 7500000,
        maintenance: 250000,
        bhk_config: BHK_CONFIG["2BHK"],
        furnishing: FURNISHING.SEMI_FURNISHED,
        floor_number: "10",
        carpet_area_sqft: 920,
        available_from: daysAgoAt(35, 10),
        description: "Happy path listing for journey seed J-101.",
        house_rules: ["No loud parties", "Society rules apply"],
        parking: "COVERED",
        pet_friendly: true,
        amenities: ["security", "lift", "cctv", "parking"],
        created_by_admin_id: seed.admin._id,
      });
    },
  });

  const inquiry = await ensureSeedRecord(ctx, {
    label: "tenant inquiry J-101",
    lookup: async () =>
      await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_tenant_phone", (q) => q.eq("tenant_phone", JOURNEY_PHONES.happyTenant))
        .filter((q) => q.eq(q.field("listing_id"), listing.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("tenant_inquiries", {
        listing_id: listing.doc._id,
        tenant_id: seed.tenant1._id,
        tenant_name: seed.tenant1.name,
        tenant_phone: JOURNEY_PHONES.happyTenant,
        tenant_email: DEMO_EMAILS.tenant1,
        preferred_visit_date: inquiryVisitDate,
        preferred_visit_slot: "Evening",
        message: "Journey happy path inquiry for J-101.",
        status: TENANT_INQUIRY_STATUS.CLOSED,
        bounty_amount: 50000,
        bounty_posted_at: daysAgoAt(19, 11),
        bounty_expires_at: daysAgoAt(11, 11),
        assigned_guard_id: seed.guard1._id,
        visit_id: undefined,
        ops_notes: "Journey happy path moved to closure.",
        rejection_reason: undefined,
        reviewed_by_admin_id: seed.admin._id,
        updated_at: daysAgoAt(5, 19),
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        tenant_id: seed.tenant1._id,
        tenant_name: seed.tenant1.name,
        tenant_email: DEMO_EMAILS.tenant1,
        preferred_visit_date: inquiryVisitDate,
        preferred_visit_slot: "Evening",
        message: "Journey happy path inquiry for J-101.",
        status: TENANT_INQUIRY_STATUS.CLOSED,
        bounty_amount: 50000,
        bounty_posted_at: daysAgoAt(19, 11),
        bounty_expires_at: daysAgoAt(11, 11),
        assigned_guard_id: seed.guard1._id,
        ops_notes: "Journey happy path moved to closure.",
        reviewed_by_admin_id: seed.admin._id,
        updated_at: daysAgoAt(5, 19),
      });
    },
  });

  const visit = await ensureSeedRecord(ctx, {
    label: "visit J-101",
    lookup: async () =>
      await ctx.db
        .query("visits")
        .withIndex("by_tenant_inquiry_id", (q) => q.eq("tenant_inquiry_id", inquiry.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("visits", {
        lead_id: lead._id,
        society_id: seed.testSociety._id,
        listing_id: listing.doc._id,
        scheduled_start: visitStart,
        scheduled_end: visitEnd,
        assigned_guard_id: seed.guard1._id,
        status: VISIT_STATUS.COMPLETED,
        outcome: VISIT_OUTCOME.INTERESTED,
        outcome_notes: "Tenant interested and ready to proceed.",
        started_at: visitStart + 5 * 60 * 1000,
        completed_at: visitCompletedAt,
        needs_reassignment: false,
        checklist_instance_id: undefined,
        tenant_inquiry_id: inquiry.doc._id,
        created_by_admin_id: seed.admin._id,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        lead_id: lead._id,
        society_id: seed.testSociety._id,
        listing_id: listing.doc._id,
        scheduled_start: visitStart,
        scheduled_end: visitEnd,
        assigned_guard_id: seed.guard1._id,
        status: VISIT_STATUS.COMPLETED,
        outcome: VISIT_OUTCOME.INTERESTED,
        outcome_notes: "Tenant interested and ready to proceed.",
        started_at: visitStart + 5 * 60 * 1000,
        completed_at: visitCompletedAt,
        needs_reassignment: false,
        tenant_inquiry_id: inquiry.doc._id,
      });
    },
  });

  await ctx.db.patch(inquiry.doc._id, {
    visit_id: visit.doc._id,
    status: TENANT_INQUIRY_STATUS.CLOSED,
    updated_at: daysAgoAt(5, 19),
  });

  const closure = await ensureSeedRecord(ctx, {
    label: "closure JRN-HAPPY-J101",
    lookup: async () =>
      await ctx.db
        .query("closures")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .filter((q) => q.eq(q.field("demorentals_deal_id"), "JRN-HAPPY-J101"))
        .first(),
    create: async () =>
      await ctx.db.insert("closures", {
        lead_id: lead._id,
        listing_id: listing.doc._id,
        owner_id: seed.owner1Entity._id,
        visit_id: visit.doc._id,
        transaction_id: undefined,
        negotiation_id: undefined,
        demorentals_deal_id: "JRN-HAPPY-J101",
        move_in_date: daysAgoAt(5, 11),
        status: CLOSURE_STATUS.CONFIRMED,
        rent_agreement_storage_id: undefined,
        commission_amount: 125000,
        brokerage_tenant_side: 62500,
        brokerage_owner_side: 62500,
        notes: "Happy path journey closure confirmed.",
        additional_documents: undefined,
        deal_checklist_id: undefined,
        closed_by_admin_id: seed.admin._id,
        confirmed_at: closureConfirmedAt,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        listing_id: listing.doc._id,
        owner_id: seed.owner1Entity._id,
        visit_id: visit.doc._id,
        transaction_id: undefined,
        negotiation_id: undefined,
        move_in_date: daysAgoAt(5, 11),
        status: CLOSURE_STATUS.CONFIRMED,
        commission_amount: 125000,
        brokerage_tenant_side: 62500,
        brokerage_owner_side: 62500,
        notes: "Happy path journey closure confirmed.",
        closed_by_admin_id: seed.admin._id,
        confirmed_at: closureConfirmedAt,
      });
    },
  });

  const payout = await ensureSeedRecord(ctx, {
    label: "payout JRN-HAPPY-J101",
    lookup: async () =>
      await ctx.db
        .query("payouts")
        .withIndex("by_closure_id", (q) => q.eq("closure_id", closure.doc._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("guard_user_id"), seed.guard1._id),
            q.eq(q.field("payment_reference"), "JRN-HAPPY-J101-UPI"),
          ),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("payouts", {
        guard_user_id: seed.guard1._id,
        lead_id: lead._id,
        closure_id: closure.doc._id,
        amount_paise: 85000,
        method: PAYOUT_METHOD.UPI,
        status: PAYOUT_STATUS.DISBURSED,
        initiated_by_admin_id: seed.admin._id,
        approved_by_admin_id: seed.admin._id,
        approved_at: payoutApprovedAt,
        disbursed_at: payoutDisbursedAt,
        payment_reference: "JRN-HAPPY-J101-UPI",
        failure_reason: undefined,
        voided_reason: undefined,
        voided_by: undefined,
        voided_at: undefined,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        amount_paise: 85000,
        method: PAYOUT_METHOD.UPI,
        status: PAYOUT_STATUS.DISBURSED,
        approved_by_admin_id: seed.admin._id,
        approved_at: payoutApprovedAt,
        disbursed_at: payoutDisbursedAt,
      });
    },
  });

  return {
    lead_id: lead._id,
    verification_id: verification.doc._id,
    listing_id: listing.doc._id,
    tenant_inquiry_id: inquiry.doc._id,
    visit_id: visit.doc._id,
    closure_id: closure.doc._id,
    payout_id: payout.doc._id,
  };
}

async function ensureJourneyNegotiationToClosure(ctx: MutationCtx) {
  const seed = await resolveSeedContext(ctx);
  // Exclude listings already used by v2.0 negotiation scenarios (NEG_1..NEG_4)
  // to avoid duplicate listing rows on the negotiations admin page
  const listing = await getAnyPublishedListing(ctx, {
    excludeSlugs: [
      "2bhk-sunshine-heights-bandra-501",
      "1bhk-wingb-sunshine-bandra-202",
      "3bhk-green-valley-powai-904",
      "2bhk-test-society-andheri-604",
    ],
  });

  const inquiry = await ensureSeedRecord(ctx, {
    label: "negotiation journey inquiry",
    lookup: async () =>
      await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_tenant_phone", (q) => q.eq("tenant_phone", JOURNEY_PHONES.negotiationTenant))
        .filter((q) => q.eq(q.field("listing_id"), listing._id))
        .first(),
    create: async () =>
      await ctx.db.insert("tenant_inquiries", {
        listing_id: listing._id,
        tenant_id: seed.tenant2._id,
        tenant_name: seed.tenant2.name,
        tenant_phone: JOURNEY_PHONES.negotiationTenant,
        tenant_email: DEMO_EMAILS.tenant2,
        preferred_visit_date: daysAgoAt(29, 15),
        preferred_visit_slot: "Afternoon",
        message: "Negotiation-to-closure journey inquiry.",
        status: TENANT_INQUIRY_STATUS.CLOSED,
        bounty_amount: 60000,
        bounty_posted_at: daysAgoAt(28, 12),
        bounty_expires_at: daysAgoAt(21, 12),
        assigned_guard_id: seed.guard2._id,
        visit_id: undefined,
        ops_notes: "Negotiation journey completed to closure.",
        rejection_reason: undefined,
        reviewed_by_admin_id: seed.admin._id,
        updated_at: daysAgoAt(7, 18),
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        tenant_id: seed.tenant2._id,
        tenant_name: seed.tenant2.name,
        tenant_email: DEMO_EMAILS.tenant2,
        status: TENANT_INQUIRY_STATUS.CLOSED,
        assigned_guard_id: seed.guard2._id,
        ops_notes: "Negotiation journey completed to closure.",
        updated_at: daysAgoAt(7, 18),
      });
    },
  });

  const negotiation = await ensureSeedRecord(ctx, {
    label: "negotiation journey",
    lookup: async () =>
      await ctx.db
        .query("negotiations")
        .withIndex("by_tenant_inquiry_id", (q) => q.eq("tenant_inquiry_id", inquiry.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("negotiations", {
        tenant_inquiry_id: inquiry.doc._id,
        listing_id: listing._id,
        tenant_user_id: seed.tenant2._id,
        owner_user_id: seed.owner1User._id,
        initiated_by_admin_id: seed.admin._id,
        status: NEGOTIATION_STATUS.CLOSED,
        failure_reason: undefined,
        failure_notes: undefined,
        ops_tenant_channel_id: undefined,
        ops_owner_channel_id: undefined,
        combined_channel_id: undefined,
        active_proposal_id: undefined,
        police_verification_status: "COMPLETED",
        society_noc_status: "OBTAINED",
        owner_kyc_status: "VERIFIED",
        agreement_drafting_status: "COMPLETED",
        stamp_registration_status: "COMPLETED",
        rent_agreement_storage_id: undefined,
        rent_agreement_status: "STAMP_REGISTERED",
        key_handover_status: "COMPLETED",
        move_in_inspection_status: "COMPLETED",
        move_in_inspection_notes: "Mandatory checklist fully completed.",
        police_verification_waive_reason: undefined,
        society_noc_waive_reason: undefined,
        owner_kyc_waive_reason: undefined,
        rent_agreement_waive_reason: undefined,
        key_handover_waive_reason: undefined,
        move_in_inspection_waive_reason: undefined,
        initiated_at: daysAgoAt(30, 10),
        terms_agreed_at: daysAgoAt(16, 16),
        ready_for_closure_at: daysAgoAt(12, 18),
        failed_at: undefined,
        last_activity_at: daysAgoAt(7, 18),
        stale_flagged: false,
        rounds_flagged: false,
        is_stale: false,
        too_many_rounds: false,
        token_without_agreement: false,
        escalation_flags_updated_at: daysAgoAt(7, 18),
        flag_dismissed_at: undefined,
        flag_dismissed_reason: undefined,
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        listing_id: listing._id,
        tenant_user_id: seed.tenant2._id,
        owner_user_id: seed.owner1User._id,
        initiated_by_admin_id: seed.admin._id,
        status: NEGOTIATION_STATUS.CLOSED,
        police_verification_status: "COMPLETED",
        society_noc_status: "OBTAINED",
        owner_kyc_status: "VERIFIED",
        agreement_drafting_status: "COMPLETED",
        stamp_registration_status: "COMPLETED",
        rent_agreement_status: "STAMP_REGISTERED",
        key_handover_status: "COMPLETED",
        move_in_inspection_status: "COMPLETED",
        move_in_inspection_notes: "Mandatory checklist fully completed.",
        initiated_at: daysAgoAt(30, 10),
        terms_agreed_at: daysAgoAt(16, 16),
        ready_for_closure_at: daysAgoAt(12, 18),
        last_activity_at: daysAgoAt(7, 18),
        stale_flagged: false,
        rounds_flagged: false,
        is_stale: false,
        too_many_rounds: false,
        token_without_agreement: false,
        escalation_flags_updated_at: daysAgoAt(7, 18),
        is_deleted: false,
      });
    },
  });

  const proposalV1 = await ensureSeedRecord(ctx, {
    label: "negotiation proposal v1",
    lookup: async () =>
      await ctx.db
        .query("negotiation_terms_proposals")
        .withIndex("by_negotiation_and_version", (q) =>
          q.eq("negotiation_id", negotiation.doc._id).eq("version", 1),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("negotiation_terms_proposals", {
        negotiation_id: negotiation.doc._id,
        version: 1,
        status: NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED,
        monthly_rent_paise: 3900000,
        security_deposit_paise: 11700000,
        security_deposit_months: 3,
        lock_in_period_months: 12,
        notice_period_months: 2,
        move_in_date: daysFromNowAt(25, 11),
        maintenance_charges_paise: 350000,
        maintenance_paid_by: MAINTENANCE_PAID_BY.TENANT,
        rent_escalation_type: RENT_ESCALATION_TYPE.PERCENTAGE,
        rent_escalation_value: 5,
        furnishing_terms: "Semi-furnished with wardrobes.",
        brokerage_tenant_side_paise: 195000,
        brokerage_owner_side_paise: 195000,
        token_advance_amount_paise: 2500000,
        special_conditions: "Round 1 proposal.",
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(28, 11),
        shared_to_rooms: ["OPS_TENANT", "OPS_OWNER", "COMBINED"],
        shared_at: daysAgoAt(27, 11),
        is_locked: false,
        locked_at: undefined,
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        status: NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED,
        monthly_rent_paise: 3900000,
        security_deposit_paise: 11700000,
        security_deposit_months: 3,
        lock_in_period_months: 12,
        notice_period_months: 2,
        move_in_date: daysFromNowAt(25, 11),
        maintenance_charges_paise: 350000,
        maintenance_paid_by: MAINTENANCE_PAID_BY.TENANT,
        rent_escalation_type: RENT_ESCALATION_TYPE.PERCENTAGE,
        rent_escalation_value: 5,
        furnishing_terms: "Semi-furnished with wardrobes.",
        brokerage_tenant_side_paise: 195000,
        brokerage_owner_side_paise: 195000,
        token_advance_amount_paise: 2500000,
        special_conditions: "Round 1 proposal.",
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(28, 11),
        shared_to_rooms: ["OPS_TENANT", "OPS_OWNER", "COMBINED"],
        shared_at: daysAgoAt(27, 11),
        is_locked: false,
        is_deleted: false,
      });
    },
  });

  const proposalV2 = await ensureSeedRecord(ctx, {
    label: "negotiation proposal v2",
    lookup: async () =>
      await ctx.db
        .query("negotiation_terms_proposals")
        .withIndex("by_negotiation_and_version", (q) =>
          q.eq("negotiation_id", negotiation.doc._id).eq("version", 2),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("negotiation_terms_proposals", {
        negotiation_id: negotiation.doc._id,
        version: 2,
        status: NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED,
        monthly_rent_paise: 3700000,
        security_deposit_paise: 7400000,
        security_deposit_months: 2,
        lock_in_period_months: 10,
        notice_period_months: 2,
        move_in_date: daysFromNowAt(22, 11),
        maintenance_charges_paise: 325000,
        maintenance_paid_by: MAINTENANCE_PAID_BY.SPLIT,
        rent_escalation_type: RENT_ESCALATION_TYPE.PERCENTAGE,
        rent_escalation_value: 4,
        furnishing_terms: "Counter proposal round with split maintenance.",
        brokerage_tenant_side_paise: 185000,
        brokerage_owner_side_paise: 185000,
        token_advance_amount_paise: 2600000,
        special_conditions: "Round 2 counter proposal.",
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(24, 12),
        shared_to_rooms: ["OPS_TENANT", "OPS_OWNER", "COMBINED"],
        shared_at: daysAgoAt(23, 12),
        is_locked: false,
        locked_at: undefined,
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        status: NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED,
        monthly_rent_paise: 3700000,
        security_deposit_paise: 7400000,
        security_deposit_months: 2,
        lock_in_period_months: 10,
        notice_period_months: 2,
        move_in_date: daysFromNowAt(22, 11),
        maintenance_charges_paise: 325000,
        maintenance_paid_by: MAINTENANCE_PAID_BY.SPLIT,
        rent_escalation_type: RENT_ESCALATION_TYPE.PERCENTAGE,
        rent_escalation_value: 4,
        furnishing_terms: "Counter proposal round with split maintenance.",
        brokerage_tenant_side_paise: 185000,
        brokerage_owner_side_paise: 185000,
        token_advance_amount_paise: 2600000,
        special_conditions: "Round 2 counter proposal.",
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(24, 12),
        shared_to_rooms: ["OPS_TENANT", "OPS_OWNER", "COMBINED"],
        shared_at: daysAgoAt(23, 12),
        is_locked: false,
        is_deleted: false,
      });
    },
  });

  const proposalV3 = await ensureSeedRecord(ctx, {
    label: "negotiation proposal v3",
    lookup: async () =>
      await ctx.db
        .query("negotiation_terms_proposals")
        .withIndex("by_negotiation_and_version", (q) =>
          q.eq("negotiation_id", negotiation.doc._id).eq("version", 3),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("negotiation_terms_proposals", {
        negotiation_id: negotiation.doc._id,
        version: 3,
        status: NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED,
        monthly_rent_paise: 3600000,
        security_deposit_paise: 7200000,
        security_deposit_months: 2,
        lock_in_period_months: 8,
        notice_period_months: 2,
        move_in_date: daysFromNowAt(19, 11),
        maintenance_charges_paise: 300000,
        maintenance_paid_by: MAINTENANCE_PAID_BY.SPLIT,
        rent_escalation_type: RENT_ESCALATION_TYPE.PERCENTAGE,
        rent_escalation_value: 3,
        furnishing_terms: "Final agreed proposal round.",
        brokerage_tenant_side_paise: 180000,
        brokerage_owner_side_paise: 180000,
        token_advance_amount_paise: 2500000,
        special_conditions: "Round 3 final terms agreed.",
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(20, 13),
        shared_to_rooms: ["OPS_TENANT", "OPS_OWNER", "COMBINED"],
        shared_at: daysAgoAt(19, 13),
        is_locked: true,
        locked_at: daysAgoAt(18, 13),
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        status: NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED,
        monthly_rent_paise: 3600000,
        security_deposit_paise: 7200000,
        security_deposit_months: 2,
        lock_in_period_months: 8,
        notice_period_months: 2,
        move_in_date: daysFromNowAt(19, 11),
        maintenance_charges_paise: 300000,
        maintenance_paid_by: MAINTENANCE_PAID_BY.SPLIT,
        rent_escalation_type: RENT_ESCALATION_TYPE.PERCENTAGE,
        rent_escalation_value: 3,
        furnishing_terms: "Final agreed proposal round.",
        brokerage_tenant_side_paise: 180000,
        brokerage_owner_side_paise: 180000,
        token_advance_amount_paise: 2500000,
        special_conditions: "Round 3 final terms agreed.",
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(20, 13),
        shared_to_rooms: ["OPS_TENANT", "OPS_OWNER", "COMBINED"],
        shared_at: daysAgoAt(19, 13),
        is_locked: true,
        locked_at: daysAgoAt(18, 13),
        is_deleted: false,
      });
    },
  });

  await ctx.db.patch(negotiation.doc._id, {
    active_proposal_id: proposalV3.doc._id,
    status: NEGOTIATION_STATUS.CLOSED,
    terms_agreed_at: daysAgoAt(16, 16),
    ready_for_closure_at: daysAgoAt(12, 18),
    last_activity_at: daysAgoAt(7, 18),
  });

  const tenantSignature = await ensureSeedRecord(ctx, {
    label: "negotiation tenant signature",
    lookup: async () =>
      await ctx.db
        .query("negotiation_terms_signatures")
        .withIndex("by_proposal_user", (q) =>
          q
            .eq("proposal_id", proposalV3.doc._id)
            .eq("user_id", seed.tenant2._id)
            .eq("is_deleted", false),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("negotiation_terms_signatures", {
        proposal_id: proposalV3.doc._id,
        negotiation_id: negotiation.doc._id,
        user_id: seed.tenant2._id,
        user_role: "TENANT",
        signed_at: daysAgoAt(17, 10),
        agreement_text: "Tenant sign-off on proposal v3.",
        proposal_version: 3,
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        user_role: "TENANT",
        signed_at: daysAgoAt(17, 10),
        agreement_text: "Tenant sign-off on proposal v3.",
        proposal_version: 3,
        is_deleted: false,
      });
    },
  });

  const ownerSignature = await ensureSeedRecord(ctx, {
    label: "negotiation owner signature",
    lookup: async () =>
      await ctx.db
        .query("negotiation_terms_signatures")
        .withIndex("by_proposal_user", (q) =>
          q
            .eq("proposal_id", proposalV3.doc._id)
            .eq("user_id", seed.owner1User._id)
            .eq("is_deleted", false),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("negotiation_terms_signatures", {
        proposal_id: proposalV3.doc._id,
        negotiation_id: negotiation.doc._id,
        user_id: seed.owner1User._id,
        user_role: "OWNER",
        signed_at: daysAgoAt(17, 11),
        agreement_text: "Owner sign-off on proposal v3.",
        proposal_version: 3,
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        user_role: "OWNER",
        signed_at: daysAgoAt(17, 11),
        agreement_text: "Owner sign-off on proposal v3.",
        proposal_version: 3,
        is_deleted: false,
      });
    },
  });

  const tokenRecord = await ensureSeedRecord(ctx, {
    label: "negotiation token record",
    lookup: async () =>
      await ctx.db
        .query("negotiation_token_records")
        .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation.doc._id))
        .filter((q) => q.eq(q.field("notes"), "Journey-Negotiation:token-collected"))
        .first(),
    create: async () =>
      await ctx.db.insert("negotiation_token_records", {
        negotiation_id: negotiation.doc._id,
        amount_paise: 2500000,
        collected_at: daysAgoAt(15, 15),
        collection_method: TOKEN_COLLECTION_METHOD.UPI,
        refund_policy: TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS,
        refund_days: 7,
        refund_percentage: undefined,
        tenant_agreed_at: daysAgoAt(16, 17),
        status: TOKEN_RECORD_STATUS.COLLECTED,
        collected_by_admin_id: seed.admin._id,
        notes: "Journey-Negotiation:token-collected",
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        amount_paise: 2500000,
        collected_at: daysAgoAt(15, 15),
        collection_method: TOKEN_COLLECTION_METHOD.UPI,
        refund_policy: TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS,
        refund_days: 7,
        tenant_agreed_at: daysAgoAt(16, 17),
        status: TOKEN_RECORD_STATUS.COLLECTED,
        collected_by_admin_id: seed.admin._id,
        notes: "Journey-Negotiation:token-collected",
        is_deleted: false,
      });
    },
  });

  const closure = await ensureSeedRecord(ctx, {
    label: "closure JRN-NEG-001",
    lookup: async () =>
      await ctx.db
        .query("closures")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", listing.lead_id))
        .filter((q) => q.eq(q.field("demorentals_deal_id"), "JRN-NEG-001"))
        .first(),
    create: async () =>
      await ctx.db.insert("closures", {
        lead_id: listing.lead_id,
        listing_id: listing._id,
        owner_id: seed.owner1Entity._id,
        visit_id: undefined,
        transaction_id: undefined,
        negotiation_id: negotiation.doc._id,
        demorentals_deal_id: "JRN-NEG-001",
        move_in_date: daysAgoAt(6, 11),
        status: CLOSURE_STATUS.CONFIRMED,
        rent_agreement_storage_id: undefined,
        commission_amount: 180000,
        brokerage_tenant_side: 90000,
        brokerage_owner_side: 90000,
        notes: "Negotiation journey closure after 3 proposal rounds.",
        additional_documents: undefined,
        deal_checklist_id: undefined,
        closed_by_admin_id: seed.admin._id,
        confirmed_at: daysAgoAt(7, 17),
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        listing_id: listing._id,
        owner_id: seed.owner1Entity._id,
        negotiation_id: negotiation.doc._id,
        move_in_date: daysAgoAt(6, 11),
        status: CLOSURE_STATUS.CONFIRMED,
        commission_amount: 180000,
        brokerage_tenant_side: 90000,
        brokerage_owner_side: 90000,
        notes: "Negotiation journey closure after 3 proposal rounds.",
        closed_by_admin_id: seed.admin._id,
        confirmed_at: daysAgoAt(7, 17),
      });
    },
  });

  return {
    tenant_inquiry_id: inquiry.doc._id,
    negotiation_id: negotiation.doc._id,
    proposal_ids: [proposalV1.doc._id, proposalV2.doc._id, proposalV3.doc._id],
    signature_ids: [tenantSignature.doc._id, ownerSignature.doc._id],
    token_record_id: tokenRecord.doc._id,
    closure_id: closure.doc._id,
  };
}

async function ensureJourneyTransactionComplete(ctx: MutationCtx) {
  const seed = await resolveSeedContext(ctx);

  const sourceInquiry = await ctx.db
    .query("tenant_inquiries")
    .withIndex("by_tenant_phone", (q) => q.eq("tenant_phone", "9300000001"))
    .first();
  if (!sourceInquiry) {
    throw new Error("seedDemoJourneys: expected existing inquiry missing (phone 9300000001)");
  }

  const listing = await ctx.db.get(sourceInquiry.listing_id);
  if (!listing) {
    throw new Error("seedDemoJourneys: source inquiry listing missing");
  }

  const transaction = await ensureSeedRecord(ctx, {
    label: "transaction journey",
    lookup: async () =>
      await ctx.db
        .query("rental_transactions")
        .withIndex("by_tenant_inquiry_id", (q) => q.eq("tenant_inquiry_id", sourceInquiry._id))
        .first(),
    create: async () =>
      await ctx.db.insert("rental_transactions", {
        tenant_user_id: sourceInquiry.tenant_id ?? seed.tenant1._id,
        listing_id: listing._id,
        owner_id: seed.owner2Entity._id,
        closure_id: undefined,
        tenant_inquiry_id: sourceInquiry._id,
        source_negotiation_id: undefined,
        status: TRANSACTION_STATUS.COMPLETED,
        monthly_rent_paise: 3200000,
        deposit_amount_paise: 6400000,
        token_booking_amount: 3200000,
        move_in_date: daysAgoAt(2, 11),
        cancellation_reason: undefined,
        last_override_reason: "Journey transaction path: INITIATED→...→COMPLETED",
        last_override_by: seed.admin._id,
        last_override_at: daysAgoAt(2, 18),
        created_at: daysAgoAt(25, 10),
        updated_at: daysAgoAt(2, 18),
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        tenant_user_id: sourceInquiry.tenant_id ?? seed.tenant1._id,
        listing_id: listing._id,
        owner_id: seed.owner2Entity._id,
        status: TRANSACTION_STATUS.COMPLETED,
        monthly_rent_paise: 3200000,
        deposit_amount_paise: 6400000,
        token_booking_amount: 3200000,
        move_in_date: daysAgoAt(2, 11),
        last_override_reason: "Journey transaction path: INITIATED→...→COMPLETED",
        last_override_by: seed.admin._id,
        last_override_at: daysAgoAt(2, 18),
        created_at: daysAgoAt(25, 10),
        updated_at: daysAgoAt(2, 18),
        is_deleted: false,
      });
    },
  });

  const kycPacket = await ensureSeedRecord(ctx, {
    label: "transaction journey kyc",
    lookup: async () =>
      await ctx.db
        .query("kyc_packets")
        .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("kyc_packets", {
        transaction_id: transaction.doc._id,
        tenant_user_id: sourceInquiry.tenant_id ?? seed.tenant1._id,
        aadhaar_verified: true,
        employer_verified: true,
        landlord_reference: {
          name: "Previous Landlord",
          phone: "9444404404",
          notes: "Good payment history",
        },
        overall_status: KYC_PACKET_STATUS.VERIFIED,
        status_note: "KYC stage completed in transaction journey.",
        police_verification_status: POLICE_VERIFICATION_STATUS.VERIFIED,
        police_form_storage_id: undefined,
        police_ack_storage_id: undefined,
        verified_at: daysAgoAt(21, 16),
        created_at: daysAgoAt(24, 9),
        updated_at: daysAgoAt(21, 16),
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        tenant_user_id: sourceInquiry.tenant_id ?? seed.tenant1._id,
        aadhaar_verified: true,
        employer_verified: true,
        landlord_reference: {
          name: "Previous Landlord",
          phone: "9444404404",
          notes: "Good payment history",
        },
        overall_status: KYC_PACKET_STATUS.VERIFIED,
        status_note: "KYC stage completed in transaction journey.",
        police_verification_status: POLICE_VERIFICATION_STATUS.VERIFIED,
        verified_at: daysAgoAt(21, 16),
        created_at: daysAgoAt(24, 9),
        updated_at: daysAgoAt(21, 16),
        is_deleted: false,
      });
    },
  });

  const agreement = await ensureSeedRecord(ctx, {
    label: "transaction journey agreement",
    lookup: async () =>
      await ctx.db
        .query("rental_agreements")
        .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("rental_agreements", {
        transaction_id: transaction.doc._id,
        template_version: "journey-v1",
        terms: {
          monthly_rent_paise: 3200000,
          deposit_amount_paise: 6400000,
          lock_in_months: 11,
          notice_period_months: 2,
          maintenance_paise: 300000,
          escalation_percent: 5,
          agreement_start_date: daysAgoAt(2, 11),
          agreement_end_date: daysFromNowAt(363, 11),
          special_conditions: "Transaction journey agreement completed.",
        },
        tenant_signature: {
          signed_at: daysAgoAt(17, 12),
          signer_name: seed.tenant1.name,
          signer_email: DEMO_EMAILS.tenant1,
          session_id: "journey-tx-tenant-sign",
          signature_payload: "JOURNEY_TX_TENANT_SIG",
        },
        owner_signature: {
          signed_at: daysAgoAt(16, 14),
          signer_name: seed.owner2User.name,
          signer_email: DEMO_EMAILS.owner2,
          session_id: "journey-tx-owner-sign",
          signature_payload: "JOURNEY_TX_OWNER_SIG",
        },
        document_storage_id: undefined,
        status: AGREEMENT_STATUS.SIGNED,
        created_at: daysAgoAt(19, 10),
        updated_at: daysAgoAt(16, 14),
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        template_version: "journey-v1",
        terms: {
          monthly_rent_paise: 3200000,
          deposit_amount_paise: 6400000,
          lock_in_months: 11,
          notice_period_months: 2,
          maintenance_paise: 300000,
          escalation_percent: 5,
          agreement_start_date: daysAgoAt(2, 11),
          agreement_end_date: daysFromNowAt(363, 11),
          special_conditions: "Transaction journey agreement completed.",
        },
        tenant_signature: {
          signed_at: daysAgoAt(17, 12),
          signer_name: seed.tenant1.name,
          signer_email: DEMO_EMAILS.tenant1,
          session_id: "journey-tx-tenant-sign",
          signature_payload: "JOURNEY_TX_TENANT_SIG",
        },
        owner_signature: {
          signed_at: daysAgoAt(16, 14),
          signer_name: seed.owner2User.name,
          signer_email: DEMO_EMAILS.owner2,
          session_id: "journey-tx-owner-sign",
          signature_payload: "JOURNEY_TX_OWNER_SIG",
        },
        status: AGREEMENT_STATUS.SIGNED,
        created_at: daysAgoAt(19, 10),
        updated_at: daysAgoAt(16, 14),
        is_deleted: false,
      });
    },
  });

  const tokenBooking = await ensureSeedRecord(ctx, {
    label: "transaction journey token booking",
    lookup: async () =>
      await ctx.db
        .query("token_bookings")
        .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("token_bookings", {
        transaction_id: transaction.doc._id,
        amount_paise: 3200000,
        policy_snapshot: {
          refund_type: "PARTIAL",
          conditions: "50% refundable if cancelled before agreement signing.",
        },
        payment_reference: "JRN-TX-TOKEN-001",
        receipt_storage_id: undefined,
        refunded_by: undefined,
        refunded_at: undefined,
        refund_amount_paise: undefined,
        refund_reference: undefined,
        override_reason: undefined,
        override_approved_by: undefined,
        cancelled_by: undefined,
        cancelled_at: undefined,
        cancel_reason: undefined,
        status: TOKEN_BOOKING_STATUS.CONFIRMED,
        status_note: "Token held and confirmed in journey flow.",
        held_at: daysAgoAt(12, 12),
        resolved_at: daysAgoAt(11, 15),
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        amount_paise: 3200000,
        policy_snapshot: {
          refund_type: "PARTIAL",
          conditions: "50% refundable if cancelled before agreement signing.",
        },
        payment_reference: "JRN-TX-TOKEN-001",
        status: TOKEN_BOOKING_STATUS.CONFIRMED,
        status_note: "Token held and confirmed in journey flow.",
        held_at: daysAgoAt(12, 12),
        resolved_at: daysAgoAt(11, 15),
        is_deleted: false,
      });
    },
  });

  const deposit = await ensureSeedRecord(ctx, {
    label: "transaction journey deposit",
    lookup: async () =>
      await ctx.db
        .query("deposit_records")
        .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("deposit_records", {
        transaction_id: transaction.doc._id,
        amount_paise: 6400000,
        paid_by_tenant_at: daysAgoAt(8, 13),
        confirmed_by_owner_at: daysAgoAt(7, 16),
        payment_reference: "JRN-TX-DEPOSIT-001",
        receipt_storage_id: undefined,
        payment_events: [
          {
            amount_paise: 6400000,
            payment_reference: "JRN-TX-DEPOSIT-001",
            recorded_at: daysAgoAt(8, 13),
            recorded_by: seed.admin._id,
          },
        ],
        mismatch_reason: undefined,
        override_reason: undefined,
        override_by: undefined,
        override_at: undefined,
        compliance_warning: undefined,
        status: DEPOSIT_RECORD_STATUS.CONFIRMED,
        status_note: "Deposit confirmed in transaction journey.",
        created_at: daysAgoAt(8, 12),
        updated_at: daysAgoAt(7, 16),
        is_deleted: false,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        amount_paise: 6400000,
        paid_by_tenant_at: daysAgoAt(8, 13),
        confirmed_by_owner_at: daysAgoAt(7, 16),
        payment_reference: "JRN-TX-DEPOSIT-001",
        payment_events: [
          {
            amount_paise: 6400000,
            payment_reference: "JRN-TX-DEPOSIT-001",
            recorded_at: daysAgoAt(8, 13),
            recorded_by: seed.admin._id,
          },
        ],
        status: DEPOSIT_RECORD_STATUS.CONFIRMED,
        status_note: "Deposit confirmed in transaction journey.",
        created_at: daysAgoAt(8, 12),
        updated_at: daysAgoAt(7, 16),
        is_deleted: false,
      });
    },
  });

  const handover = await ensureSeedRecord(ctx, {
    label: "transaction journey handover",
    lookup: async () =>
      await ctx.db
        .query("handover_checklists")
        .withIndex("by_transaction_id", (q) => q.eq("transaction_id", transaction.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("handover_checklists", {
        transaction_id: transaction.doc._id,
        items: [
          {
            label: "Main keys handed over",
            checked: true,
            checked_at: daysAgoAt(2, 10),
            checked_by: seed.guard2._id,
          },
          {
            label: "Meter reading captured",
            checked: true,
            checked_at: daysAgoAt(2, 10),
            checked_by: seed.guard2._id,
          },
          {
            label: "Inventory checklist signed",
            checked: true,
            checked_at: daysAgoAt(2, 10),
            checked_by: seed.guard2._id,
          },
        ],
        completed_at: daysAgoAt(2, 11),
        completed_by: seed.guard2._id,
        is_deleted: false,
        created_at: daysAgoAt(3, 11),
        updated_at: daysAgoAt(2, 11),
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        items: [
          {
            label: "Main keys handed over",
            checked: true,
            checked_at: daysAgoAt(2, 10),
            checked_by: seed.guard2._id,
          },
          {
            label: "Meter reading captured",
            checked: true,
            checked_at: daysAgoAt(2, 10),
            checked_by: seed.guard2._id,
          },
          {
            label: "Inventory checklist signed",
            checked: true,
            checked_at: daysAgoAt(2, 10),
            checked_by: seed.guard2._id,
          },
        ],
        completed_at: daysAgoAt(2, 11),
        completed_by: seed.guard2._id,
        is_deleted: false,
        created_at: daysAgoAt(3, 11),
        updated_at: daysAgoAt(2, 11),
      });
    },
  });

  await ctx.db.patch(sourceInquiry._id, {
    transaction_id: transaction.doc._id,
    status: TENANT_INQUIRY_STATUS.CLOSED,
    updated_at: daysAgoAt(2, 18),
  });

  return {
    source_inquiry_id: sourceInquiry._id,
    transaction_id: transaction.doc._id,
    kyc_packet_id: kycPacket.doc._id,
    agreement_id: agreement.doc._id,
    token_booking_id: tokenBooking.doc._id,
    deposit_record_id: deposit.doc._id,
    handover_checklist_id: handover.doc._id,
  };
}

async function ensureJourneyDealRoomApproved(ctx: MutationCtx) {
  const seed = await resolveSeedContext(ctx);
  const listing = await getAnyPublishedListing(ctx);

  const inquiry = await ensureSeedRecord(ctx, {
    label: "deal room inquiry",
    lookup: async () =>
      await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_tenant_phone", (q) => q.eq("tenant_phone", JOURNEY_PHONES.dealRoomTenant))
        .filter((q) => q.eq(q.field("listing_id"), listing._id))
        .first(),
    create: async () =>
      await ctx.db.insert("tenant_inquiries", {
        listing_id: listing._id,
        tenant_id: seed.tenant1._id,
        tenant_name: seed.tenant1.name,
        tenant_phone: JOURNEY_PHONES.dealRoomTenant,
        tenant_email: DEMO_EMAILS.tenant1,
        preferred_visit_date: daysAgoAt(18, 14),
        preferred_visit_slot: "Morning",
        message: "Deal room approval journey inquiry.",
        status: TENANT_INQUIRY_STATUS.CLOSED,
        bounty_amount: undefined,
        bounty_posted_at: undefined,
        bounty_expires_at: undefined,
        assigned_guard_id: seed.guard1._id,
        visit_id: undefined,
        ops_notes: "Deal room approved journey.",
        rejection_reason: undefined,
        reviewed_by_admin_id: seed.admin._id,
        updated_at: daysAgoAt(14, 18),
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        tenant_id: seed.tenant1._id,
        tenant_name: seed.tenant1.name,
        tenant_email: DEMO_EMAILS.tenant1,
        status: TENANT_INQUIRY_STATUS.CLOSED,
        assigned_guard_id: seed.guard1._id,
        ops_notes: "Deal room approved journey.",
        reviewed_by_admin_id: seed.admin._id,
        updated_at: daysAgoAt(14, 18),
      });
    },
  });

  const channel = await ensureSeedRecord(ctx, {
    label: "deal room channel",
    lookup: async () =>
      await ctx.db
        .query("chat_channels")
        .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", inquiry.doc._id))
        .first(),
    create: async () =>
      await ctx.db.insert("chat_channels", {
        inquiry_id: inquiry.doc._id,
        channel_type: "COMBINED",
        negotiation_id: undefined,
        status: CHAT_CHANNEL_STATUS.ACTIVE,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(20, 10),
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        channel_type: "COMBINED",
        negotiation_id: undefined,
        status: CHAT_CHANNEL_STATUS.ACTIVE,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(20, 10),
      });
    },
  });

  const messageSeeds: Array<{
    text: string;
    sender_user_id: Id<"users">;
    sender_role: Doc<"chat_messages">["sender_role"];
    created_at: number;
  }> = [
    {
      text: "Journey-DealRoom: Tenant shared move-in expectations.",
      sender_user_id: seed.tenant1._id,
      sender_role: CHAT_SENDER_ROLE.TENANT,
      created_at: daysAgoAt(20, 12),
    },
    {
      text: "Journey-DealRoom: Owner confirmed basic terms.",
      sender_user_id: seed.owner1User._id,
      sender_role: CHAT_SENDER_ROLE.OWNER,
      created_at: daysAgoAt(19, 12),
    },
    {
      text: "Journey-DealRoom: Admin shared checklist draft.",
      sender_user_id: seed.admin._id,
      sender_role: CHAT_SENDER_ROLE.OPS,
      created_at: daysAgoAt(18, 12),
    },
  ];

  for (const messageSeed of messageSeeds) {
    await ensureSeedRecord(ctx, {
      label: `deal room message ${messageSeed.text}`,
      lookup: async () =>
        await ctx.db
          .query("chat_messages")
          .withIndex("by_channel_id", (q) => q.eq("channel_id", channel.doc._id))
          .filter((q) => q.eq(q.field("original_content"), messageSeed.text))
          .first(),
      create: async () =>
        await ctx.db.insert("chat_messages", {
          channel_id: channel.doc._id,
          sender_user_id: messageSeed.sender_user_id,
          sender_role: messageSeed.sender_role,
          original_content: messageSeed.text,
          masked_content: messageSeed.text,
          batch_id: undefined,
          status: "DELIVERED",
          failure_reason: undefined,
          admin_review_required: false,
          is_ai_processed: true,
          is_impersonated: false,
          impersonated_by_admin_id: undefined,
          is_deleted: false,
          created_at: messageSeed.created_at,
          delivered_at: messageSeed.created_at,
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          sender_user_id: messageSeed.sender_user_id,
          sender_role: messageSeed.sender_role,
          masked_content: messageSeed.text,
          status: "DELIVERED",
          admin_review_required: false,
          is_ai_processed: true,
          is_impersonated: false,
          is_deleted: false,
          created_at: messageSeed.created_at,
          delivered_at: messageSeed.created_at,
        });
      },
    });
  }

  const draftItems: Doc<"deal_checklists">["items"] = [
    {
      item_id: "journey-dr-rent",
      term_type: DEAL_TERM_TYPE.RENT_AMOUNT,
      source: DEAL_CHECKLIST_ITEM_SOURCE.ADMIN_ADDED,
      description: "Rent amount alignment",
      extracted_value: "36000",
      admin_edited_value: "36000",
      source_message_ids: undefined,
      confidence: 0.95,
      tenant_approval: { status: "PENDING", responded_at: undefined, comment: undefined },
      owner_approval: { status: "PENDING", responded_at: undefined, comment: undefined },
      overall_status: DEAL_CHECKLIST_ITEM_OVERALL_STATUS.UNREVIEWED,
    },
    {
      item_id: "journey-dr-deposit",
      term_type: DEAL_TERM_TYPE.DEPOSIT,
      source: DEAL_CHECKLIST_ITEM_SOURCE.ADMIN_ADDED,
      description: "Deposit amount alignment",
      extracted_value: "72000",
      admin_edited_value: "72000",
      source_message_ids: undefined,
      confidence: 0.95,
      tenant_approval: { status: "PENDING", responded_at: undefined, comment: undefined },
      owner_approval: { status: "PENDING", responded_at: undefined, comment: undefined },
      overall_status: DEAL_CHECKLIST_ITEM_OVERALL_STATUS.UNREVIEWED,
    },
  ];

  const sharedItems: Doc<"deal_checklists">["items"] = draftItems.map((item) => ({
    ...item,
    tenant_approval: {
      status: "COMMENTED",
      responded_at: daysAgoAt(17, 12),
      comment: "Need confirmation on final numbers.",
    },
    overall_status: DEAL_CHECKLIST_ITEM_OVERALL_STATUS.NEEDS_DISCUSSION,
  }));

  const inReviewItems: Doc<"deal_checklists">["items"] = draftItems.map((item) => ({
    ...item,
    tenant_approval: { status: "AGREED", responded_at: daysAgoAt(16, 12), comment: "Agreed" },
    owner_approval: { status: "AGREED", responded_at: daysAgoAt(16, 13), comment: "Agreed" },
    overall_status: DEAL_CHECKLIST_ITEM_OVERALL_STATUS.RESOLVED,
  }));

  const approvedItems: Doc<"deal_checklists">["items"] = draftItems.map((item) => ({
    ...item,
    tenant_approval: { status: "AGREED", responded_at: daysAgoAt(15, 10), comment: "Signed off" },
    owner_approval: { status: "AGREED", responded_at: daysAgoAt(15, 11), comment: "Signed off" },
    overall_status: DEAL_CHECKLIST_ITEM_OVERALL_STATUS.RESOLVED,
  }));

  const draftChecklist = await ensureSeedRecord(ctx, {
    label: "deal checklist v1",
    lookup: async () =>
      await ctx.db
        .query("deal_checklists")
        .withIndex("by_inquiry_and_version", (q) =>
          q.eq("inquiry_id", inquiry.doc._id).eq("version", 1),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("deal_checklists", {
        inquiry_id: inquiry.doc._id,
        channel_id: channel.doc._id,
        version: 1,
        previous_version_id: undefined,
        items: draftItems,
        status: DEAL_CHECKLIST_STATUS.DRAFT,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(20, 13),
        shared_at: undefined,
        approved_at: undefined,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        channel_id: channel.doc._id,
        previous_version_id: undefined,
        items: draftItems,
        status: DEAL_CHECKLIST_STATUS.DRAFT,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(20, 13),
        shared_at: undefined,
        approved_at: undefined,
      });
    },
  });

  const sharedChecklist = await ensureSeedRecord(ctx, {
    label: "deal checklist v2",
    lookup: async () =>
      await ctx.db
        .query("deal_checklists")
        .withIndex("by_inquiry_and_version", (q) =>
          q.eq("inquiry_id", inquiry.doc._id).eq("version", 2),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("deal_checklists", {
        inquiry_id: inquiry.doc._id,
        channel_id: channel.doc._id,
        version: 2,
        previous_version_id: draftChecklist.doc._id,
        items: sharedItems,
        status: DEAL_CHECKLIST_STATUS.SHARED,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(18, 12),
        shared_at: daysAgoAt(18, 13),
        approved_at: undefined,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        channel_id: channel.doc._id,
        previous_version_id: draftChecklist.doc._id,
        items: sharedItems,
        status: DEAL_CHECKLIST_STATUS.SHARED,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(18, 12),
        shared_at: daysAgoAt(18, 13),
        approved_at: undefined,
      });
    },
  });

  const inReviewChecklist = await ensureSeedRecord(ctx, {
    label: "deal checklist v3",
    lookup: async () =>
      await ctx.db
        .query("deal_checklists")
        .withIndex("by_inquiry_and_version", (q) =>
          q.eq("inquiry_id", inquiry.doc._id).eq("version", 3),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("deal_checklists", {
        inquiry_id: inquiry.doc._id,
        channel_id: channel.doc._id,
        version: 3,
        previous_version_id: sharedChecklist.doc._id,
        items: inReviewItems,
        status: DEAL_CHECKLIST_STATUS.IN_REVIEW,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(16, 12),
        shared_at: daysAgoAt(16, 12),
        approved_at: undefined,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        channel_id: channel.doc._id,
        previous_version_id: sharedChecklist.doc._id,
        items: inReviewItems,
        status: DEAL_CHECKLIST_STATUS.IN_REVIEW,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(16, 12),
        shared_at: daysAgoAt(16, 12),
        approved_at: undefined,
      });
    },
  });

  const approvedChecklist = await ensureSeedRecord(ctx, {
    label: "deal checklist v4",
    lookup: async () =>
      await ctx.db
        .query("deal_checklists")
        .withIndex("by_inquiry_and_version", (q) =>
          q.eq("inquiry_id", inquiry.doc._id).eq("version", 4),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("deal_checklists", {
        inquiry_id: inquiry.doc._id,
        channel_id: channel.doc._id,
        version: 4,
        previous_version_id: inReviewChecklist.doc._id,
        items: approvedItems,
        status: DEAL_CHECKLIST_STATUS.APPROVED,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(14, 12),
        shared_at: daysAgoAt(14, 12),
        approved_at: daysAgoAt(14, 15),
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        channel_id: channel.doc._id,
        previous_version_id: inReviewChecklist.doc._id,
        items: approvedItems,
        status: DEAL_CHECKLIST_STATUS.APPROVED,
        created_by_admin_id: seed.admin._id,
        created_at: daysAgoAt(14, 12),
        shared_at: daysAgoAt(14, 12),
        approved_at: daysAgoAt(14, 15),
      });
    },
  });

  const tenantSignature = await ensureSeedRecord(ctx, {
    label: "deal checklist tenant signature",
    lookup: async () =>
      await ctx.db
        .query("deal_checklist_signatures")
        .withIndex("by_signer", (q) =>
          q.eq("signer_user_id", seed.tenant1._id).eq("checklist_id", approvedChecklist.doc._id),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("deal_checklist_signatures", {
        checklist_id: approvedChecklist.doc._id,
        signer_user_id: seed.tenant1._id,
        signer_role: "TENANT",
        signature_hash: "a1b2c3d4e5f60123456789abcdef00112233445566778899aabbccddeeff0011",
        signed_at: daysAgoAt(14, 16),
        ip_address: "127.0.0.1",
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        signer_role: "TENANT",
        signature_hash: "a1b2c3d4e5f60123456789abcdef00112233445566778899aabbccddeeff0011",
        signed_at: daysAgoAt(14, 16),
        ip_address: "127.0.0.1",
      });
    },
  });

  const ownerSignature = await ensureSeedRecord(ctx, {
    label: "deal checklist owner signature",
    lookup: async () =>
      await ctx.db
        .query("deal_checklist_signatures")
        .withIndex("by_signer", (q) =>
          q.eq("signer_user_id", seed.owner1User._id).eq("checklist_id", approvedChecklist.doc._id),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("deal_checklist_signatures", {
        checklist_id: approvedChecklist.doc._id,
        signer_user_id: seed.owner1User._id,
        signer_role: "OWNER",
        signature_hash: "11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff",
        signed_at: daysAgoAt(14, 17),
        ip_address: "127.0.0.1",
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        signer_role: "OWNER",
        signature_hash: "11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff",
        signed_at: daysAgoAt(14, 17),
        ip_address: "127.0.0.1",
      });
    },
  });

  return {
    tenant_inquiry_id: inquiry.doc._id,
    channel_id: channel.doc._id,
    checklist_ids: [
      draftChecklist.doc._id,
      sharedChecklist.doc._id,
      inReviewChecklist.doc._id,
      approvedChecklist.doc._id,
    ],
    signature_ids: [tenantSignature.doc._id, ownerSignature.doc._id],
  };
}

async function ensureJourneyReferralFullCycle(ctx: MutationCtx) {
  const seed = await resolveSeedContext(ctx);

  const lead = await ensureLeadByFlat(ctx, {
    buildingId: seed.testBuildingId,
    societyId: seed.testSociety._id,
    flatNumber: "J-301",
    floorNumber: "30",
    ownerName: "Referral Journey Owner",
    ownerPhone: JOURNEY_PHONES.referralLeadOwner,
    submittedByGuardId: seed.guard3._id,
    status: LEAD_STATUS.VERIFIED,
    rentExpected: 2800000,
    availabilityDate: daysAgoAt(33, 10),
    notes: "Referral full-cycle lead submitted by Guard3.",
  });

  await ensureSeedRecord(ctx, {
    label: "referral lead verification",
    lookup: async () =>
      await ctx.db
        .query("owner_verifications")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .filter((q) => q.eq(q.field("notes"), "Journey-Referral:J-301:VERIFIED"))
        .first(),
    create: async () =>
      await ctx.db.insert("owner_verifications", {
        lead_id: lead._id,
        called_by_admin_id: seed.admin._id,
        call_outcome: CALL_OUTCOME.VERIFIED,
        consent_contact_demorentals: true,
        consent_visit_coordination: true,
        preferred_visit_slots: "Morning",
        rent_confirmed: 2800000,
        notes: "Journey-Referral:J-301:VERIFIED",
        verified_at: daysAgoAt(32, 11),
      }),
  });

  const referralCode = await ensureSeedRecord(ctx, {
    label: "referral code guard1->guard3",
    lookup: async () =>
      await ctx.db
        .query("referral_codes")
        .withIndex("by_code", (q) => q.eq("code", "JRN-G1-G3-REF"))
        .first(),
    create: async () =>
      await ctx.db.insert("referral_codes", {
        user_id: seed.guard1._id,
        code: "JRN-G1-G3-REF",
        is_active: true,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        user_id: seed.guard1._id,
        code: "JRN-G1-G3-REF",
        is_active: true,
      });
    },
  });

  const referral = await ensureSeedRecord(ctx, {
    label: "referral guard1->guard3",
    lookup: async () =>
      await ctx.db
        .query("referrals")
        .withIndex("by_referrer_user_id", (q) => q.eq("referrer_user_id", seed.guard1._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("referred_user_id"), seed.guard3._id),
            q.eq(q.field("referral_type"), REFERRAL_TYPE.GUARD),
          ),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("referrals", {
        referrer_user_id: seed.guard1._id,
        referred_user_id: seed.guard3._id,
        referral_code_id: referralCode.doc._id,
        referral_type: REFERRAL_TYPE.GUARD,
        status: REFERRAL_STATUS.FULLY_PAID,
        lead_id: lead._id,
        listing_id: undefined,
        closure_id: undefined,
        building_id: seed.testBuildingId,
        society_id: seed.testSociety._id,
        attributed_by_admin_id: seed.admin._id,
        attributed_at: daysAgoAt(34, 10),
        attribution_source: "seedDemoJourneys.referralFullCycle",
        voided_reason: undefined,
        voided_by_admin_id: undefined,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        referral_code_id: referralCode.doc._id,
        status: REFERRAL_STATUS.FULLY_PAID,
        lead_id: lead._id,
        building_id: seed.testBuildingId,
        society_id: seed.testSociety._id,
        attributed_by_admin_id: seed.admin._id,
        attributed_at: daysAgoAt(34, 10),
        attribution_source: "seedDemoJourneys.referralFullCycle",
        voided_reason: undefined,
        voided_by_admin_id: undefined,
      });
    },
  });

  const milestoneDefinitions: Array<{
    sourceEvent: string;
    milestoneType: Doc<"referral_milestones">["milestone_type"];
    amount: number;
    status: Doc<"referral_milestones">["status"];
    triggeredAt: number;
    approvedAt?: number;
    paidAt?: number;
  }> = [
    {
      sourceEvent: "journey_guard3_signup",
      milestoneType: REFERRAL_MILESTONE_TYPE.SIGN_UP,
      amount: 50000,
      status: REFERRAL_MILESTONE_STATUS.PAID,
      triggeredAt: daysAgoAt(34, 11),
      approvedAt: daysAgoAt(34, 13),
      paidAt: daysAgoAt(34, 14),
    },
    {
      sourceEvent: "journey_guard3_first_verified_lead_j301",
      milestoneType: REFERRAL_MILESTONE_TYPE.FIRST_VERIFIED_LEAD,
      amount: 50000,
      status: REFERRAL_MILESTONE_STATUS.PAID,
      triggeredAt: daysAgoAt(32, 12),
      approvedAt: daysAgoAt(32, 14),
      paidAt: daysAgoAt(32, 15),
    },
    {
      sourceEvent: "journey_guard3_listing_pending",
      milestoneType: REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
      amount: 25000,
      status: REFERRAL_MILESTONE_STATUS.PENDING,
      triggeredAt: daysAgoAt(31, 12),
    },
    {
      sourceEvent: "journey_guard3_deal_closed_pending",
      milestoneType: REFERRAL_MILESTONE_TYPE.DEAL_CLOSED,
      amount: 25000,
      status: REFERRAL_MILESTONE_STATUS.PENDING,
      triggeredAt: daysAgoAt(30, 12),
    },
  ];

  const milestoneIds: Array<Id<"referral_milestones">> = [];
  for (const milestoneDefinition of milestoneDefinitions) {
    const milestone = await ensureSeedRecord(ctx, {
      label: `referral milestone ${milestoneDefinition.sourceEvent}`,
      lookup: async () =>
        await ctx.db
          .query("referral_milestones")
          .withIndex("by_referral_and_source_event", (q) =>
            q
              .eq("referral_id", referral.doc._id)
              .eq("source_event", milestoneDefinition.sourceEvent),
          )
          .first(),
      create: async () =>
        await ctx.db.insert("referral_milestones", {
          referral_id: referral.doc._id,
          milestone_type: milestoneDefinition.milestoneType,
          amount: milestoneDefinition.amount,
          status: milestoneDefinition.status,
          source_event: milestoneDefinition.sourceEvent,
          triggered_at: milestoneDefinition.triggeredAt,
          approved_by_admin_id:
            milestoneDefinition.status === REFERRAL_MILESTONE_STATUS.PAID ||
            milestoneDefinition.status === REFERRAL_MILESTONE_STATUS.APPROVED
              ? seed.admin._id
              : undefined,
          paid_at: milestoneDefinition.paidAt,
          payout_method:
            milestoneDefinition.status === REFERRAL_MILESTONE_STATUS.PAID
              ? PAYOUT_METHOD.UPI
              : undefined,
          voided_reason: undefined,
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          milestone_type: milestoneDefinition.milestoneType,
          amount: milestoneDefinition.amount,
          status: milestoneDefinition.status,
          triggered_at: milestoneDefinition.triggeredAt,
          approved_by_admin_id:
            milestoneDefinition.status === REFERRAL_MILESTONE_STATUS.PAID ||
            milestoneDefinition.status === REFERRAL_MILESTONE_STATUS.APPROVED
              ? seed.admin._id
              : undefined,
          paid_at: milestoneDefinition.paidAt,
          payout_method:
            milestoneDefinition.status === REFERRAL_MILESTONE_STATUS.PAID
              ? PAYOUT_METHOD.UPI
              : undefined,
          voided_reason: undefined,
        });
      },
    });
    milestoneIds.push(milestone.doc._id);
  }

  return {
    referral_code_id: referralCode.doc._id,
    referral_id: referral.doc._id,
    referred_guard_id: seed.guard3._id,
    lead_id: lead._id,
    milestone_ids: milestoneIds,
  };
}

async function ensureVerificationOutcome(
  ctx: MutationCtx,
  args: {
    flatNumber: string;
    floorNumber: string;
    ownerName: string;
    ownerPhone: string;
    leadStatus: Doc<"leads">["status"];
    callOutcome: Doc<"owner_verifications">["call_outcome"];
    notes: string;
    rentExpected: number;
    rentConfirmed?: number;
    consentContactDemoRentals: boolean;
    consentVisitCoordination?: boolean;
    verifiedAt: number;
  },
) {
  const seed = await resolveSeedContext(ctx);
  const lead = await ensureLeadByFlat(ctx, {
    buildingId: seed.testBuildingId,
    societyId: seed.testSociety._id,
    flatNumber: args.flatNumber,
    floorNumber: args.floorNumber,
    ownerName: args.ownerName,
    ownerPhone: args.ownerPhone,
    submittedByGuardId: seed.guard2._id,
    status: args.leadStatus,
    rentExpected: args.rentExpected,
    availabilityDate: daysAgoAt(18, 10),
    notes: `Verification outcome seed for ${args.flatNumber}`,
  });

  const verification = await ensureSeedRecord(ctx, {
    label: `verification ${args.flatNumber}`,
    lookup: async () =>
      await ctx.db
        .query("owner_verifications")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .filter((q) => q.eq(q.field("notes"), args.notes))
        .first(),
    create: async () =>
      await ctx.db.insert("owner_verifications", {
        lead_id: lead._id,
        called_by_admin_id: seed.admin._id,
        call_outcome: args.callOutcome,
        consent_contact_demorentals: args.consentContactDemoRentals,
        consent_visit_coordination: args.consentVisitCoordination,
        preferred_visit_slots: args.callOutcome === CALL_OUTCOME.VERIFIED ? "Evening" : undefined,
        rent_confirmed: args.rentConfirmed,
        notes: args.notes,
        verified_at: args.verifiedAt,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        call_outcome: args.callOutcome,
        consent_contact_demorentals: args.consentContactDemoRentals,
        consent_visit_coordination: args.consentVisitCoordination,
        preferred_visit_slots: args.callOutcome === CALL_OUTCOME.VERIFIED ? "Evening" : undefined,
        rent_confirmed: args.rentConfirmed,
        verified_at: args.verifiedAt,
      });
    },
  });

  await ctx.db.patch(lead._id, {
    status: args.leadStatus,
    rent_expected: args.rentExpected,
  });

  return { lead_id: lead._id, verification_id: verification.doc._id };
}

export const seedJourneyLeadToClosureHappy = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ensureJourneyLeadToClosureHappy(ctx);
  },
});

export const seedJourneyNegotiationToClosure = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ensureJourneyNegotiationToClosure(ctx);
  },
});

export const seedJourneyTransactionComplete = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ensureJourneyTransactionComplete(ctx);
  },
});

export const seedJourneyDealRoomApproved = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ensureJourneyDealRoomApproved(ctx);
  },
});

export const seedJourneyReferralFullCycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ensureJourneyReferralFullCycle(ctx);
  },
});

export const seedVerificationVerified = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ensureVerificationOutcome(ctx, {
      flatNumber: "K-201",
      floorNumber: "20",
      ownerName: "Verification Owner Verified",
      ownerPhone: JOURNEY_PHONES.verificationK201,
      leadStatus: LEAD_STATUS.VERIFIED,
      callOutcome: CALL_OUTCOME.VERIFIED,
      notes: "Verification-K-201: owner confirmed renting; consent captured; rent matched.",
      rentExpected: 2700000,
      rentConfirmed: 2700000,
      consentContactDemoRentals: true,
      consentVisitCoordination: true,
      verifiedAt: daysAgoAt(12, 12),
    });
  },
});

export const seedVerificationUnreachable = internalMutation({
  args: {},
  handler: async (ctx) => {
    const seed = await resolveSeedContext(ctx);
    const lead = await ensureLeadByFlat(ctx, {
      buildingId: seed.testBuildingId,
      societyId: seed.testSociety._id,
      flatNumber: "K-202",
      floorNumber: "20",
      ownerName: "Verification Owner No Answer",
      ownerPhone: JOURNEY_PHONES.verificationK202,
      submittedByGuardId: seed.guard2._id,
      status: LEAD_STATUS.SUBMITTED,
      rentExpected: 2600000,
      availabilityDate: daysAgoAt(17, 10),
      notes: "Verification outcome NO_ANSWER / UNREACHABLE scenario.",
    });

    const attemptNotes = [
      "Verification-K-202: attempt-1 no answer",
      "Verification-K-202: attempt-2 no answer",
      "Verification-K-202: attempt-3 no answer",
    ];

    const verificationIds: Array<Id<"owner_verifications">> = [];
    for (let index = 0; index < attemptNotes.length; index += 1) {
      const result = await ensureSeedRecord(ctx, {
        label: attemptNotes[index],
        lookup: async () =>
          await ctx.db
            .query("owner_verifications")
            .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
            .filter((q) => q.eq(q.field("notes"), attemptNotes[index]))
            .first(),
        create: async () =>
          await ctx.db.insert("owner_verifications", {
            lead_id: lead._id,
            called_by_admin_id: seed.admin._id,
            call_outcome: CALL_OUTCOME.UNREACHABLE,
            consent_contact_demorentals: false,
            consent_visit_coordination: undefined,
            preferred_visit_slots: undefined,
            rent_confirmed: undefined,
            notes: attemptNotes[index],
            verified_at: daysAgoAt(11 - index, 11),
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            call_outcome: CALL_OUTCOME.UNREACHABLE,
            consent_contact_demorentals: false,
            consent_visit_coordination: undefined,
            preferred_visit_slots: undefined,
            rent_confirmed: undefined,
            verified_at: daysAgoAt(11 - index, 11),
          });
        },
      });
      verificationIds.push(result.doc._id);
    }

    await ctx.db.patch(lead._id, { status: LEAD_STATUS.SUBMITTED });

    return { lead_id: lead._id, verification_attempt_ids: verificationIds };
  },
});

export const seedVerificationDeclined = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ensureVerificationOutcome(ctx, {
      flatNumber: "K-203",
      floorNumber: "20",
      ownerName: "Verification Owner Declined",
      ownerPhone: JOURNEY_PHONES.verificationK203,
      leadStatus: LEAD_STATUS.REJECTED,
      callOutcome: CALL_OUTCOME.DECLINED,
      notes: "Verification-K-203: owner explicitly declined, not renting.",
      rentExpected: 2550000,
      rentConfirmed: undefined,
      consentContactDemoRentals: false,
      consentVisitCoordination: false,
      verifiedAt: daysAgoAt(10, 12),
    });
  },
});

export const seedVerificationFalseInfo = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ensureVerificationOutcome(ctx, {
      flatNumber: "K-204",
      floorNumber: "20",
      ownerName: "Verification Owner False Info",
      ownerPhone: JOURNEY_PHONES.verificationK204,
      leadStatus: LEAD_STATUS.REJECTED,
      callOutcome: CALL_OUTCOME.FALSE,
      notes: "Verification-K-204: false information (wrong owner and rent mismatch).",
      rentExpected: 2450000,
      rentConfirmed: undefined,
      consentContactDemoRentals: false,
      consentVisitCoordination: false,
      verifiedAt: daysAgoAt(9, 12),
    });
  },
});
