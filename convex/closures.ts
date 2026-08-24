import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  CLOSURE_STATUS,
  CONTRIBUTION_SOURCE_ENTITY,
  CONTRIBUTION_STAGE,
  INCENTIVE_PERSONA,
  LEAD_STATUS,
  NEGOTIATION_STATUS,
  NEGOTIATION_PROPOSAL_STATUS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  OWNER_LIFECYCLE_STAGE,
  PAYOUT_STATUS,
  PERMISSIONS,
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  REFERRAL_STATUS,
  REFERRAL_TYPE,
  RM_ASSIGNMENT_STATUS,
  TENANT_INQUIRY_STATUS,
  TRANSACTION_STATUS,
  USER_TYPE,
  VISIT_STATUS,
  XP_AWARDS,
  type ClosureStatus,
} from "../lib/constants";
import { calculateSplitAmount } from "../lib/referral";
import { validateNegotiationTransition } from "../lib/negotiation";
import { requireAnyPermission, requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { internal } from "./_generated/api";
import { progressLifecycleStage } from "./owners";
import { evaluateCommissionForClosure } from "./commissionEngine";

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const closureStatusValidator = v.union(
  v.literal(CLOSURE_STATUS.PENDING),
  v.literal(CLOSURE_STATUS.CONFIRMED),
  v.literal(CLOSURE_STATUS.CANCELLED),
);

const additionalDocumentValidator = v.object({
  name: v.string(),
  storage_id: v.id("_storage"),
});

type ClosureDoc = Doc<"closures">;
type AdditionalDocumentInput = {
  name: string;
  storage_id: Id<"_storage">;
};

async function resolveBrokerageFromNegotiationProposal(
  ctx: MutationCtx,
  negotiationId: Id<"negotiations">,
): Promise<{
  negotiation: Doc<"negotiations">;
  brokerage_tenant_side: number;
  brokerage_owner_side: number;
}> {
  const negotiation = await ctx.db.get(negotiationId);

  if (!negotiation || negotiation.is_deleted) {
    throw new Error("Negotiation not found");
  }

  if (!negotiation.active_proposal_id) {
    throw new Error("Negotiation has no active proposal");
  }

  const proposal = await ctx.db.get(negotiation.active_proposal_id);

  if (!proposal || proposal.is_deleted) {
    throw new Error("Active negotiation proposal not found");
  }

  if (proposal.negotiation_id !== negotiation._id) {
    throw new Error("Active proposal is not linked to the provided negotiation");
  }

  if (proposal.status !== NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED) {
    throw new Error("Only BOTH_AGREED negotiation proposals can be used for closure brokerage");
  }

  assertMoneyPaise(proposal.brokerage_tenant_side_paise, "brokerage_tenant_side_paise");
  assertMoneyPaise(proposal.brokerage_owner_side_paise, "brokerage_owner_side_paise");

  return {
    negotiation,
    brokerage_tenant_side: proposal.brokerage_tenant_side_paise,
    brokerage_owner_side: proposal.brokerage_owner_side_paise,
  };
}

async function getLatestActiveReferralByType(
  ctx: MutationCtx,
  referredUserId: Id<"users">,
  referralType: typeof REFERRAL_TYPE.TENANT_FINDING | typeof REFERRAL_TYPE.OWNER_FINDING,
): Promise<Doc<"referrals"> | null> {
  const referrals = await ctx.db
    .query("referrals")
    .withIndex("by_referred_user_id", (q) => q.eq("referred_user_id", referredUserId))
    .order("desc")
    .collect();

  return (
    referrals.find(
      (candidate) =>
        candidate.status !== REFERRAL_STATUS.VOIDED && candidate.referral_type === referralType,
    ) ?? null
  );
}

async function getTenantReferralForClosure(
  ctx: MutationCtx,
  closure: Doc<"closures">,
): Promise<Doc<"referrals"> | null> {
  let tenantInquiryId: Id<"tenant_inquiries"> | undefined;

  if (closure.visit_id) {
    const visit = await ctx.db.get(closure.visit_id);

    if (visit?.lead_id === closure.lead_id && visit.tenant_inquiry_id) {
      tenantInquiryId = visit.tenant_inquiry_id;
    } else {
      console.warn("Unable to resolve tenant inquiry from closure visit for referral attribution", {
        closure_id: closure._id,
        lead_id: closure.lead_id,
        visit_id: closure.visit_id,
      });
    }
  }

  if (!tenantInquiryId && closure.negotiation_id) {
    const negotiation = await ctx.db.get(closure.negotiation_id);

    if (!negotiation || negotiation.is_deleted) {
      console.warn("Unable to resolve negotiation for closure referral attribution fallback", {
        closure_id: closure._id,
        lead_id: closure.lead_id,
        negotiation_id: closure.negotiation_id,
      });
      return null;
    }

    const inquiryId = negotiation.tenant_inquiry_id;
    const visitsForInquiry = await ctx.db
      .query("visits")
      .withIndex("by_tenant_inquiry_id", (q) => q.eq("tenant_inquiry_id", inquiryId))
      .collect();
    const matchingVisit = visitsForInquiry.find((visit) => visit.lead_id === closure.lead_id);

    if (matchingVisit?.tenant_inquiry_id) {
      tenantInquiryId = matchingVisit.tenant_inquiry_id;
    } else {
      tenantInquiryId = inquiryId;
      console.warn(
        "Fallback visit lookup failed for closure referral attribution; using negotiation inquiry",
        {
          closure_id: closure._id,
          lead_id: closure.lead_id,
          negotiation_id: closure.negotiation_id,
          inquiry_id: inquiryId,
        },
      );
    }
  }

  if (!tenantInquiryId) {
    console.warn("Tenant referral attribution skipped; no visit/inquiry linkage found", {
      closure_id: closure._id,
      lead_id: closure.lead_id,
      visit_id: closure.visit_id,
      negotiation_id: closure.negotiation_id,
    });
    return null;
  }

  const tenantInquiry = await ctx.db.get(tenantInquiryId);

  if (!tenantInquiry?.tenant_id) {
    console.warn("Tenant referral attribution skipped; tenant inquiry has no tenant_id", {
      closure_id: closure._id,
      lead_id: closure.lead_id,
      inquiry_id: tenantInquiryId,
    });
    return null;
  }

  return await getLatestActiveReferralByType(
    ctx,
    tenantInquiry.tenant_id,
    REFERRAL_TYPE.TENANT_FINDING,
  );
}

async function validateClosureVisitLink(
  ctx: MutationCtx,
  leadId: Id<"leads">,
  visitId: Id<"visits"> | undefined,
): Promise<Id<"tenant_inquiries"> | undefined> {
  if (!visitId) {
    return undefined;
  }

  const visit = await ctx.db.get(visitId);

  if (!visit) {
    throw new Error("Visit not found");
  }

  if (visit.lead_id !== leadId) {
    throw new Error("visit_id must belong to the same lead as the closure");
  }

  if (!visit.tenant_inquiry_id) {
    throw new Error("visit_id must be linked to a tenant inquiry");
  }

  return visit.tenant_inquiry_id;
}

async function validateDealChecklistLink(
  ctx: MutationCtx,
  dealChecklistId: Id<"deal_checklists">,
  closureInquiryId: Id<"tenant_inquiries"> | undefined,
): Promise<void> {
  const checklist = await ctx.db.get(dealChecklistId);

  if (!checklist) {
    throw new Error("Deal checklist not found");
  }

  const checklistStatus = checklist.status as string;

  if (checklistStatus !== "APPROVED") {
    throw new Error("Deal checklist must be approved");
  }

  if (!closureInquiryId) {
    throw new Error("deal_checklist_id requires a closure linked to a tenant inquiry");
  }

  if (checklist.inquiry_id !== closureInquiryId) {
    throw new Error("deal_checklist_id must match the closure tenant inquiry");
  }
}

async function getReferralMilestoneByType(
  ctx: MutationCtx,
  referralId: Id<"referrals">,
  milestoneType: Doc<"referral_milestones">["milestone_type"],
): Promise<Doc<"referral_milestones"> | null> {
  return await ctx.db
    .query("referral_milestones")
    .withIndex("by_referral_id", (q) => q.eq("referral_id", referralId))
    .filter((q) => q.eq(q.field("milestone_type"), milestoneType))
    .first();
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function hasNonTerminalRmAssignmentStatus(status: string): boolean {
  return (
    status === RM_ASSIGNMENT_STATUS.ACTIVE ||
    status === RM_ASSIGNMENT_STATUS.WARNING ||
    status === RM_ASSIGNMENT_STATUS.ESCALATED
  );
}

function shouldCreateV2Payout(policy: { mode: string; enabled_personas: string[] }): boolean {
  if (policy.mode === "OFF" || policy.mode === "SHADOW") {
    return true;
  }

  if (policy.mode === "FULL") {
    return false;
  }

  return !policy.enabled_personas.includes(INCENTIVE_PERSONA.GUARD);
}

async function appendClosureFollowUpNote(
  ctx: MutationCtx,
  closureId: Id<"closures">,
  note: string,
): Promise<void> {
  const latestClosure = await ctx.db.get(closureId);

  if (!latestClosure) {
    return;
  }

  const trimmedExistingNotes = latestClosure.notes?.trim();
  if (trimmedExistingNotes?.includes(note)) {
    return;
  }

  await ctx.db.patch(closureId, {
    notes: trimmedExistingNotes ? `${trimmedExistingNotes}\n${note}` : note,
  });
}

async function createV2PayoutIfMissing(
  ctx: MutationCtx,
  closureId: Id<"closures">,
  initiatedByAdminId: Id<"users">,
): Promise<
  | {
      created: true;
      payoutId: Id<"payouts">;
      guardUserId: Id<"users">;
      amountPaise: number;
    }
  | {
      created: false;
      reason: "existing_payout" | "lead_not_found" | "missing_prospective_bounty";
      guardUserId?: Id<"users">;
      amountPaise?: number;
    }
> {
  const existingPayout = await ctx.db
    .query("payouts")
    .withIndex("by_closure_id", (q) => q.eq("closure_id", closureId))
    .first();

  if (existingPayout) {
    return {
      created: false,
      reason: "existing_payout",
      guardUserId: existingPayout.guard_user_id,
      amountPaise: existingPayout.amount_paise,
    };
  }

  const closure = await ctx.db.get(closureId);
  if (!closure) {
    throw new Error("Closure not found for v2 payout creation");
  }

  const lead = await ctx.db.get(closure.lead_id);

  if (!lead) {
    return {
      created: false,
      reason: "lead_not_found",
    };
  }

  const payoutAmountPaise = lead.prospective_bounty;
  if (payoutAmountPaise === undefined) {
    return {
      created: false,
      reason: "missing_prospective_bounty",
      guardUserId: lead.submitted_by_guard_id,
    };
  }

  assertMoneyPaise(payoutAmountPaise, "lead.prospective_bounty");

  const payoutId = await ctx.db.insert("payouts", {
    guard_user_id: lead.submitted_by_guard_id,
    lead_id: lead._id,
    closure_id: closureId,
    amount_paise: payoutAmountPaise,
    status: PAYOUT_STATUS.PENDING,
    initiated_by_admin_id: initiatedByAdminId,
    payment_reference: undefined,
  });

  await ctx.runMutation(internal.incentives.computePayoutAdjustment, {
    payout_id: payoutId,
    guard_user_id: lead.submitted_by_guard_id,
    base_amount_paise: payoutAmountPaise,
  });

  return {
    created: true,
    payoutId,
    guardUserId: lead.submitted_by_guard_id,
    amountPaise: payoutAmountPaise,
  };
}

async function progressOwnerLifecycleAfterClosure(
  ctx: MutationCtx,
  ownerId: Id<"owners">,
  rmAssignmentCreated: boolean,
): Promise<Doc<"owners"> | null> {
  const owner = await ctx.db.get(ownerId);
  if (!owner || owner.is_deleted) {
    return null;
  }

  let latestOwner = owner;
  const progressTo = async (
    stage: (typeof OWNER_LIFECYCLE_STAGE)[keyof typeof OWNER_LIFECYCLE_STAGE],
  ) => {
    latestOwner = await progressLifecycleStage(ctx, ownerId, stage);
  };

  if (rmAssignmentCreated) {
    if (latestOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.PROSPECT) {
      await progressTo(OWNER_LIFECYCLE_STAGE.VERIFIED);
      await progressTo(OWNER_LIFECYCLE_STAGE.ACTIVE);
      await progressTo(OWNER_LIFECYCLE_STAGE.MANAGED);
    } else if (latestOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.VERIFIED) {
      await progressTo(OWNER_LIFECYCLE_STAGE.ACTIVE);
      await progressTo(OWNER_LIFECYCLE_STAGE.MANAGED);
    } else if (latestOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.ACTIVE) {
      await progressTo(OWNER_LIFECYCLE_STAGE.MANAGED);
    } else if (latestOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.DORMANT) {
      await progressTo(OWNER_LIFECYCLE_STAGE.ACTIVE);
      await progressTo(OWNER_LIFECYCLE_STAGE.MANAGED);
    }

    return latestOwner;
  }

  if (latestOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.PROSPECT) {
    await progressTo(OWNER_LIFECYCLE_STAGE.VERIFIED);
    await progressTo(OWNER_LIFECYCLE_STAGE.ACTIVE);
  } else if (
    latestOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.VERIFIED ||
    latestOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.DORMANT
  ) {
    await progressTo(OWNER_LIFECYCLE_STAGE.ACTIVE);
  }

  return latestOwner;
}

function normalizeAdditionalDocuments(
  documents: AdditionalDocumentInput[] | undefined,
): AdditionalDocumentInput[] | undefined {
  if (documents === undefined) {
    return undefined;
  }

  return documents.map((document, index) => {
    const normalizedName = document.name.trim();

    if (!normalizedName) {
      throw new Error(`additional_documents[${index}].name is required`);
    }

    return {
      name: normalizedName,
      storage_id: document.storage_id,
    };
  });
}

function assertMoneyPaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be a whole number in paise`);
  }

  if (value < 0) {
    throw new Error(`${fieldName} must be a non-negative amount in paise`);
  }
}

export function validateClosureTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions: Record<string, ClosureStatus[]> = {
    [CLOSURE_STATUS.PENDING]: [CLOSURE_STATUS.CONFIRMED, CLOSURE_STATUS.CANCELLED],
    [CLOSURE_STATUS.CONFIRMED]: [],
    [CLOSURE_STATUS.CANCELLED]: [],
  };

  return (validTransitions[currentStatus] ?? []).some((status) => status === newStatus);
}

async function validateStorageDocument(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  fieldName: string,
): Promise<void> {
  const metadata = await ctx.db.system.get("_storage", storageId);

  if (!metadata) {
    throw new Error(`${fieldName}: file not found in storage`);
  }

  const contentType = metadata.contentType ?? "";

  if (!ALLOWED_DOCUMENT_CONTENT_TYPES.has(contentType)) {
    throw new Error(`${fieldName}: only PDF, JPEG, and PNG files are allowed`);
  }

  if (metadata.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error(`${fieldName}: file too large. Maximum size is 10MB`);
  }
}

async function validateClosureDocuments(
  ctx: MutationCtx,
  rentAgreementStorageId: Id<"_storage"> | undefined,
  additionalDocuments: AdditionalDocumentInput[] | undefined,
): Promise<void> {
  if (rentAgreementStorageId !== undefined) {
    await validateStorageDocument(ctx, rentAgreementStorageId, "rent_agreement_storage_id");
  }

  if (!additionalDocuments || additionalDocuments.length === 0) {
    return;
  }

  await Promise.all(
    additionalDocuments.map(async (document, index) => {
      await validateStorageDocument(
        ctx,
        document.storage_id,
        `additional_documents[${index}].storage_id`,
      );
    }),
  );
}

async function getClosureContext(ctx: QueryCtx | MutationCtx, closure: ClosureDoc) {
  const [lead, listing, payout] = await Promise.all([
    ctx.db.get(closure.lead_id),
    closure.listing_id ? ctx.db.get(closure.listing_id) : Promise.resolve(null),
    ctx.db
      .query("payouts")
      .withIndex("by_closure_id", (q) => q.eq("closure_id", closure._id))
      .first(),
  ]);

  if (!lead) {
    return {
      lead: null,
      building: null,
      society: null,
      guard: null,
      listing,
      payout,
    };
  }

  const [building, society, guardUser] = await Promise.all([
    ctx.db.get(lead.building_id),
    ctx.db.get(lead.society_id),
    ctx.db.get(lead.submitted_by_guard_id),
  ]);

  return {
    lead,
    building,
    society,
    guard: guardUser
      ? {
          user_id: guardUser._id,
          name: guardUser.name,
          phone: guardUser.phone,
          status: guardUser.status,
        }
      : null,
    listing,
    payout,
  };
}

export const create = mutation({
  args: {
    lead_id: v.id("leads"),
    visit_id: v.optional(v.id("visits")),
    transaction_id: v.optional(v.id("rental_transactions")),
    negotiation_id: v.optional(v.id("negotiations")),
    demorentals_deal_id: v.optional(v.string()),
    move_in_date: v.number(),
    rent_agreement_storage_id: v.optional(v.id("_storage")),
    commission_amount: v.optional(v.number()),
    brokerage_tenant_side: v.optional(v.number()),
    brokerage_owner_side: v.optional(v.number()),
    additional_documents: v.optional(v.array(additionalDocumentValidator)),
    notes: v.optional(v.string()),
    deal_checklist_id: v.optional(v.id("deal_checklists")),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.CLOSURES_CREATE);
    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (lead.status !== LEAD_STATUS.VERIFIED) {
      throw new Error("Only VERIFIED leads can have closures");
    }

    const ownerId = lead.owner_id;

    const existingClosure = await ctx.db
      .query("closures")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .first();

    if (existingClosure) {
      throw new Error("A closure already exists for this lead");
    }

    const negotiationBrokerage =
      args.negotiation_id !== undefined
        ? await resolveBrokerageFromNegotiationProposal(ctx, args.negotiation_id)
        : null;

    if (
      negotiationBrokerage &&
      negotiationBrokerage.negotiation.status !== NEGOTIATION_STATUS.READY_FOR_CLOSURE
    ) {
      throw new Error("Negotiation must be READY_FOR_CLOSURE before creating closure");
    }

    const brokerageTenantSide =
      negotiationBrokerage?.brokerage_tenant_side ?? args.brokerage_tenant_side;
    const brokerageOwnerSide =
      negotiationBrokerage?.brokerage_owner_side ?? args.brokerage_owner_side;

    if (args.commission_amount !== undefined) {
      assertMoneyPaise(args.commission_amount, "commission_amount");
    }

    if (brokerageTenantSide !== undefined) {
      assertMoneyPaise(brokerageTenantSide, "brokerage_tenant_side");
    }

    if (brokerageOwnerSide !== undefined) {
      assertMoneyPaise(brokerageOwnerSide, "brokerage_owner_side");
    }

    const normalizedAdditionalDocuments = normalizeAdditionalDocuments(args.additional_documents);

    await validateClosureDocuments(
      ctx,
      args.rent_agreement_storage_id,
      normalizedAdditionalDocuments,
    );

    const visitInquiryId = await validateClosureVisitLink(ctx, args.lead_id, args.visit_id);
    const negotiationInquiryId = negotiationBrokerage?.negotiation.tenant_inquiry_id;

    if (
      visitInquiryId &&
      negotiationInquiryId &&
      visitInquiryId.toString() !== negotiationInquiryId.toString()
    ) {
      throw new Error("Visit and negotiation reference different inquiries");
    }

    const closureInquiryId = visitInquiryId ?? negotiationInquiryId;

    if (args.deal_checklist_id !== undefined) {
      await validateDealChecklistLink(ctx, args.deal_checklist_id, closureInquiryId);
    }

    const linkedListing = await ctx.db
      .query("listings")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .first();

    if (
      negotiationBrokerage &&
      linkedListing &&
      negotiationBrokerage.negotiation.listing_id !== linkedListing._id
    ) {
      throw new Error("negotiation_id must belong to the same listing as this closure");
    }

    const closureListingId = linkedListing?._id ?? negotiationBrokerage?.negotiation.listing_id;

    if (args.transaction_id) {
      const linkedTransaction = await ctx.db.get(args.transaction_id);
      if (!linkedTransaction || linkedTransaction.is_deleted) {
        throw new Error("Linked transaction not found");
      }

      if (!closureListingId || linkedTransaction.listing_id !== closureListingId) {
        throw new Error("Linked transaction must belong to the same listing as this closure");
      }

      if (ownerId && linkedTransaction.owner_id !== ownerId) {
        throw new Error("Linked transaction must belong to the same owner as this closure");
      }

      if (linkedTransaction.closure_id) {
        throw new Error("Linked transaction is already attached to another closure");
      }
    }

    const closureId = await ctx.db.insert("closures", {
      lead_id: args.lead_id,
      listing_id: closureListingId,
      owner_id: ownerId,
      visit_id: args.visit_id,
      transaction_id: args.transaction_id,
      negotiation_id: args.negotiation_id,
      demorentals_deal_id: normalizeOptionalString(args.demorentals_deal_id),
      move_in_date: args.move_in_date,
      status: CLOSURE_STATUS.PENDING,
      rent_agreement_storage_id: args.rent_agreement_storage_id,
      commission_amount: args.commission_amount,
      brokerage_tenant_side: brokerageTenantSide,
      brokerage_owner_side: brokerageOwnerSide,
      notes: normalizeOptionalString(args.notes),
      additional_documents: normalizedAdditionalDocuments,
      deal_checklist_id: args.deal_checklist_id,
      closed_by_admin_id: admin._id,
    });

    if (args.transaction_id) {
      await ctx.db.patch(args.transaction_id, {
        closure_id: closureId,
        updated_at: Date.now(),
      });
    }

    return closureId;
  },
});

export const getCreateFormLinkOptions = query({
  args: {
    lead_id: v.optional(v.id("leads")),
    negotiation_id: v.optional(v.id("negotiations")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_CREATE);

    let resolvedLeadId = args.lead_id;
    let resolvedListingId: Id<"listings"> | undefined;
    let preselectedNegotiation: Doc<"negotiations"> | null = null;

    if (args.negotiation_id) {
      const negotiation = await ctx.db.get(args.negotiation_id);

      if (!negotiation || negotiation.is_deleted) {
        throw new Error("Negotiation not found");
      }

      preselectedNegotiation = negotiation;
      resolvedListingId = negotiation.listing_id;

      if (!resolvedLeadId) {
        const negotiationListing = await ctx.db.get(negotiation.listing_id);
        if (negotiationListing) {
          resolvedLeadId = negotiationListing.lead_id;
        }
      }
    }

    if (resolvedLeadId && !resolvedListingId) {
      const linkedListing = await ctx.db
        .query("listings")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", resolvedLeadId))
        .first();
      resolvedListingId = linkedListing?._id;
    }

    const allLeadVisits = resolvedLeadId
      ? await ctx.db
          .query("visits")
          .withIndex("by_lead_id", (q) => q.eq("lead_id", resolvedLeadId))
          .collect()
      : [];

    const visits = allLeadVisits
      .filter((visit) => visit.tenant_inquiry_id !== undefined)
      .sort((a, b) => b.scheduled_start - a.scheduled_start);

    let negotiations = resolvedListingId
      ? await ctx.db
          .query("negotiations")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", resolvedListingId))
          .collect()
      : [];

    negotiations = negotiations.filter((negotiation) => !negotiation.is_deleted);

    negotiations = negotiations.filter(
      (negotiation) =>
        negotiation.status === NEGOTIATION_STATUS.READY_FOR_CLOSURE ||
        negotiation._id === args.negotiation_id,
    );

    if (
      preselectedNegotiation &&
      !negotiations.some((negotiation) => negotiation._id === preselectedNegotiation._id)
    ) {
      negotiations.push(preselectedNegotiation);
    }

    negotiations.sort((a, b) => b.last_activity_at - a.last_activity_at);

    const inquiryIds = new Map<string, Id<"tenant_inquiries">>();

    for (const visit of visits) {
      if (visit.tenant_inquiry_id) {
        inquiryIds.set(visit.tenant_inquiry_id.toString(), visit.tenant_inquiry_id);
      }
    }

    for (const negotiation of negotiations) {
      inquiryIds.set(negotiation.tenant_inquiry_id.toString(), negotiation.tenant_inquiry_id);
    }

    const approvedChecklists = (
      await Promise.all(
        Array.from(inquiryIds.values()).map(async (inquiryId) => {
          const latestApprovedChecklist = await ctx.db
            .query("deal_checklists")
            .withIndex("by_inquiry_and_version", (q) => q.eq("inquiry_id", inquiryId))
            .order("desc")
            .filter((q) => q.eq(q.field("status"), "APPROVED"))
            .first();

          if (!latestApprovedChecklist) {
            return null;
          }

          return {
            _id: latestApprovedChecklist._id,
            inquiry_id: latestApprovedChecklist.inquiry_id,
            version: latestApprovedChecklist.version,
            status: latestApprovedChecklist.status,
            approved_at: latestApprovedChecklist.approved_at,
          };
        }),
      )
    ).filter((checklist) => checklist !== null);

    return {
      lead_id: resolvedLeadId,
      listing_id: resolvedListingId,
      visits: visits.map((visit) => ({
        _id: visit._id,
        status: visit.status,
        scheduled_start: visit.scheduled_start,
        tenant_inquiry_id: visit.tenant_inquiry_id,
      })),
      negotiations: negotiations.map((negotiation) => ({
        _id: negotiation._id,
        status: negotiation.status,
        tenant_inquiry_id: negotiation.tenant_inquiry_id,
        last_activity_at: negotiation.last_activity_at,
      })),
      approved_checklists: approvedChecklists,
    };
  },
});

export const confirm = mutation({
  args: {
    id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    const confirmingUser = await requirePermission(ctx, PERMISSIONS.CLOSURES_CONFIRM);
    const closure = await ctx.db.get(args.id);

    if (!closure) {
      throw new Error("Closure not found");
    }

    if (!validateClosureTransition(closure.status, CLOSURE_STATUS.CONFIRMED)) {
      throw new Error(`Cannot confirm a closure with status: ${closure.status}`);
    }

    if (closure.transaction_id) {
      const transaction = await ctx.db.get(closure.transaction_id);
      if (!transaction || transaction.is_deleted) {
        throw new Error("Linked transaction not found");
      }

      if (transaction.status !== TRANSACTION_STATUS.COMPLETED) {
        throw new Error(
          `Cannot confirm closure until linked transaction is COMPLETED (current: ${transaction.status})`,
        );
      }
    }

    const now = Date.now();

    await ctx.db.patch(args.id, {
      status: CLOSURE_STATUS.CONFIRMED,
      confirmed_at: now,
    });

    let linkedNegotiationInquiryId: Id<"tenant_inquiries"> | undefined;

    if (closure.negotiation_id) {
      const linkedNegotiation = await ctx.db.get(closure.negotiation_id);

      if (!linkedNegotiation || linkedNegotiation.is_deleted) {
        throw new Error("Linked negotiation not found");
      }

      if (!validateNegotiationTransition(linkedNegotiation.status, NEGOTIATION_STATUS.CLOSED)) {
        throw new Error(
          `Invalid negotiation status transition from ${linkedNegotiation.status} to CLOSED`,
        );
      }

      await ctx.db.patch(linkedNegotiation._id, {
        status: NEGOTIATION_STATUS.CLOSED,
        last_activity_at: now,
        is_stale: false,
        too_many_rounds: false,
        token_without_agreement: false,
        stale_flagged: false,
        rounds_flagged: false,
        escalation_flags_updated_at: now,
      });

      linkedNegotiationInquiryId = linkedNegotiation.tenant_inquiry_id;
    }

    let linkedVisitInquiryId: Id<"tenant_inquiries"> | undefined;

    if (closure.visit_id) {
      const linkedVisit = await ctx.db.get(closure.visit_id);

      if (linkedVisit?.tenant_inquiry_id) {
        linkedVisitInquiryId = linkedVisit.tenant_inquiry_id;
      }
    }

    if (
      linkedNegotiationInquiryId &&
      linkedVisitInquiryId &&
      linkedNegotiationInquiryId.toString() !== linkedVisitInquiryId.toString()
    ) {
      console.warn("Closure confirm found mismatched inquiry links between negotiation and visit", {
        closure_id: args.id,
        negotiation_id: closure.negotiation_id,
        visit_id: closure.visit_id,
        negotiation_inquiry_id: linkedNegotiationInquiryId,
        visit_inquiry_id: linkedVisitInquiryId,
      });
    }

    const linkedInquiryId = linkedNegotiationInquiryId ?? linkedVisitInquiryId;

    if (linkedInquiryId) {
      const linkedInquiry = await ctx.db.get(linkedInquiryId);

      if (!linkedInquiry) {
        console.warn("Linked tenant inquiry not found during closure confirmation", {
          closure_id: args.id,
          inquiry_id: linkedInquiryId,
        });
      } else if (linkedInquiry.status !== TENANT_INQUIRY_STATUS.CLOSED) {
        if (
          linkedInquiry.status === TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED ||
          linkedInquiry.status === TENANT_INQUIRY_STATUS.VISIT_COMPLETED
        ) {
          await ctx.db.patch(linkedInquiry._id, {
            status: TENANT_INQUIRY_STATUS.CLOSED,
          });
        } else {
          console.warn("Tenant inquiry not auto-closed due to incompatible status", {
            closure_id: args.id,
            inquiry_id: linkedInquiry._id,
            inquiry_status: linkedInquiry.status,
          });
        }
      }
    }

    const closureLead = await ctx.db.get(closure.lead_id);
    if (closureLead) {
      const leadsInBuilding = await ctx.db
        .query("leads")
        .withIndex("by_building_id", (q) => q.eq("building_id", closureLead.building_id))
        .collect();

      const listingsInBuilding = await Promise.all(
        leadsInBuilding.map(async (leadInBuilding) => {
          return await ctx.db
            .query("listings")
            .withIndex("by_lead_id", (q) => q.eq("lead_id", leadInBuilding._id))
            .first();
        }),
      );

      const listingIds = listingsInBuilding
        .filter((listing): listing is Doc<"listings"> => listing !== null)
        .map((listing) => listing._id);

      await Promise.all(
        listingIds.map(async (listingId) => {
          await ctx.scheduler.runAfter(0, internal.trustBadges.computeForListing, {
            listing_id: listingId,
          });
        }),
      );

      const building = await ctx.db.get(closureLead.building_id);

      try {
        // TODO(P35): Add channel templates for event_type "closure_confirmed".
        await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
          user_id: closureLead.submitted_by_guard_id,
          event_type: "closure_confirmed",
          category: NOTIFICATION_CATEGORY.PAYOUT_UPDATE,
          severity: NOTIFICATION_SEVERITY.IMPORTANT,
          payload: {
            flat_number: closureLead.flat_number,
            building_name: building?.name ?? "Unknown building",
            move_in_date: closure.move_in_date,
            next_step: "Payout review in progress",
          },
          dedup_key: `closure:${args.id}:confirmed:${closureLead.submitted_by_guard_id}`,
          action_url: "/guard/earnings",
        });
      } catch (error) {
        console.error("Failed to enqueue closure confirmed notification (non-blocking):", error);
      }
    }

    let rmAssignmentCreated = false;
    let rmAssignmentFailureMessage: string | undefined;

    if (closure.owner_id) {
      try {
        const lead = await ctx.db.get(closure.lead_id);

        if (!lead || !lead.submitted_by_guard_id) {
          throw new Error("Lead not found or not linked to a guard");
        }

        const guardProfile = await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", lead.submitted_by_guard_id))
          .first();

        if (!guardProfile) {
          throw new Error("Guard profile not found for lead submitter");
        }

        const existingAssignments = await ctx.db
          .query("owner_rm_assignments")
          .withIndex("by_owner", (q) => q.eq("owner_id", closure.owner_id as Id<"owners">))
          .collect();

        const hasNonTerminalAssignment = existingAssignments.some((assignment) =>
          hasNonTerminalRmAssignmentStatus(assignment.status),
        );

        if (hasNonTerminalAssignment) {
          rmAssignmentCreated = true;
        } else {
          await ctx.runMutation(internal.rmAssignments.createAssignmentInternal, {
            owner_id: closure.owner_id,
            rm_guard_id: guardProfile._id,
            rm_user_id: lead.submitted_by_guard_id,
            source_closure_id: closure._id,
          });
          rmAssignmentCreated = true;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("already has a non-terminal RM assignment")) {
          rmAssignmentCreated = true;
        } else {
          rmAssignmentFailureMessage = errorMessage;
          console.error(`Failed to create RM assignment for closure ${args.id}:`, errorMessage);
        }
      }
    }

    if (rmAssignmentFailureMessage) {
      const rmFailureNote = `RM assignment requires manual follow-up: ${rmAssignmentFailureMessage}`;
      const existingNotes = closure.notes?.trim();
      await ctx.db.patch(args.id, {
        notes: existingNotes ? `${existingNotes}\n${rmFailureNote}` : rmFailureNote,
      });
    }

    if (closure.owner_id) {
      const owner = await progressOwnerLifecycleAfterClosure(
        ctx,
        closure.owner_id,
        rmAssignmentCreated,
      );
      if (owner) {
        await ctx.db.patch(closure.owner_id, {
          total_closures_count: owner.total_closures_count + 1,
          last_activity_at: now,
          updated_at: now,
        });
      }
    }

    try {
      const existingReferrals = await ctx.db
        .query("referrals")
        .withIndex("by_closure_id", (q) => q.eq("closure_id", args.id))
        .order("desc")
        .collect();

      const referralsToTrigger = new Map<Id<"referrals">, Doc<"referrals">>();

      const existingOwnerReferral = existingReferrals.find(
        (referral) =>
          referral.status !== REFERRAL_STATUS.VOIDED &&
          referral.referral_type === REFERRAL_TYPE.OWNER_FINDING,
      );

      if (existingOwnerReferral) {
        referralsToTrigger.set(existingOwnerReferral._id, existingOwnerReferral);
      }

      const lead = await ctx.db.get(closure.lead_id);
      const owner = closure.owner_id
        ? await ctx.db.get(closure.owner_id)
        : lead?.owner_id
          ? await ctx.db.get(lead.owner_id)
          : null;
      const ownerUserId = owner?.user_id;

      if (ownerUserId) {
        const ownerReferral = await getLatestActiveReferralByType(
          ctx,
          ownerUserId,
          REFERRAL_TYPE.OWNER_FINDING,
        );

        if (ownerReferral) {
          referralsToTrigger.set(ownerReferral._id, ownerReferral);
        }
      }

      const tenantReferral = await getTenantReferralForClosure(ctx, closure);

      if (tenantReferral) {
        referralsToTrigger.set(tenantReferral._id, tenantReferral);
      }

      for (const referral of referralsToTrigger.values()) {
        const dealClosedMilestone = await getReferralMilestoneByType(
          ctx,
          referral._id,
          REFERRAL_MILESTONE_TYPE.DEAL_CLOSED,
        );
        const listingPublishedMilestone =
          referral.referral_type === REFERRAL_TYPE.TENANT_FINDING
            ? await getReferralMilestoneByType(
                ctx,
                referral._id,
                REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
              )
            : null;
        const canOverwriteDealLinkage =
          referral.closure_id === undefined ||
          !dealClosedMilestone ||
          dealClosedMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING;

        const patch: Partial<
          Pick<
            Doc<"referrals">,
            "lead_id" | "listing_id" | "closure_id" | "building_id" | "society_id"
          >
        > = {};

        if (
          referral.lead_id === undefined ||
          (canOverwriteDealLinkage && referral.lead_id !== closure.lead_id)
        ) {
          patch.lead_id = closure.lead_id;
        }

        if (
          closure.listing_id &&
          (referral.listing_id === undefined ||
            (canOverwriteDealLinkage && referral.listing_id !== closure.listing_id))
        ) {
          patch.listing_id = closure.listing_id;
        }

        if (canOverwriteDealLinkage && referral.closure_id !== args.id) {
          patch.closure_id = args.id;
        }

        if (
          lead &&
          (referral.building_id === undefined ||
            (canOverwriteDealLinkage && referral.building_id !== lead.building_id))
        ) {
          patch.building_id = lead.building_id;
        }

        if (
          lead &&
          (referral.society_id === undefined ||
            (canOverwriteDealLinkage && referral.society_id !== lead.society_id))
        ) {
          patch.society_id = lead.society_id;
        }

        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(referral._id, patch);
        }

        if (
          lead &&
          ((dealClosedMilestone &&
            dealClosedMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING) ||
            (listingPublishedMilestone &&
              listingPublishedMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING))
        ) {
          const scopedConfig = await ctx.runQuery(internal.referralConfig.getForScope, {
            referral_type: referral.referral_type,
            building_id: lead.building_id,
            society_id: lead.society_id,
          });

          if (
            dealClosedMilestone &&
            dealClosedMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING
          ) {
            const scopedDealAmount = calculateSplitAmount(
              scopedConfig.finding_bonus_total,
              scopedConfig.closure_split_pct,
            );

            if (dealClosedMilestone.amount !== scopedDealAmount) {
              await ctx.db.patch(dealClosedMilestone._id, {
                amount: scopedDealAmount,
              });
            }
          }

          if (
            listingPublishedMilestone &&
            listingPublishedMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING
          ) {
            const scopedListingAmount = calculateSplitAmount(
              scopedConfig.finding_bonus_total,
              scopedConfig.publish_split_pct,
            );

            if (listingPublishedMilestone.amount !== scopedListingAmount) {
              await ctx.db.patch(listingPublishedMilestone._id, {
                amount: scopedListingAmount,
              });
            }
          }
        }

        if (referral.referral_type === REFERRAL_TYPE.TENANT_FINDING && closure.listing_id) {
          if (
            listingPublishedMilestone &&
            listingPublishedMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING
          ) {
            await ctx.runMutation(internal.referralMilestones.trigger, {
              referral_id: referral._id,
              milestone_type: REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
              source_event: `listing_published:${closure.listing_id}`,
            });
          }
        }

        await ctx.runMutation(internal.referralMilestones.trigger, {
          referral_id: referral._id,
          milestone_type: REFERRAL_MILESTONE_TYPE.DEAL_CLOSED,
          source_event: `closure_confirmed:${args.id}`,
        });
      }
    } catch (error) {
      console.error("Referral milestone trigger error:", error);
    }

    const rolloutPolicySnapshot = await ctx.runQuery(
      internal.shadowRollout.getRolloutPolicyInternal,
      {},
    );

    try {
      const shouldCreateGuardV2Payout = shouldCreateV2Payout(rolloutPolicySnapshot);

      if (!shouldCreateGuardV2Payout) {
        console.info(
          `Skipping v2 payout creation for closure ${args.id}; guard payout source is v3 per rollout policy`,
        );
      } else {
        const payoutCreationResult = await createV2PayoutIfMissing(
          ctx,
          args.id,
          confirmingUser._id,
        );

        if (!payoutCreationResult.created) {
          if (payoutCreationResult.reason === "missing_prospective_bounty") {
            console.warn(
              `Skipping v2 payout creation for closure ${args.id}; lead prospective_bounty is not set`,
            );
          } else if (payoutCreationResult.reason === "lead_not_found") {
            console.warn(`Skipping v2 payout creation for closure ${args.id}; lead not found`);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`V2 payout creation failed for closure ${args.id}:`, errorMessage);
    }

    const shouldRunShadow =
      rolloutPolicySnapshot.mode === "SHADOW" || rolloutPolicySnapshot.mode === "PARTIAL";

    if (shouldRunShadow) {
      try {
        const commissionEvaluation = await evaluateCommissionForClosure(ctx, {
          closure_id: args.id,
        });

        try {
          const [v2Payouts, configVersion] = await Promise.all([
            ctx.db
              .query("payouts")
              .withIndex("by_closure_id", (q) => q.eq("closure_id", args.id))
              .collect(),
            ctx.db
              .query("incentive_config_versions")
              .withIndex("by_version", (q) =>
                q.eq("version_code", commissionEvaluation.config_version),
              )
              .first(),
          ]);

          const v2TotalPaise = v2Payouts.reduce((sum, payout) => {
            if (payout.status === PAYOUT_STATUS.FAILED || payout.status === PAYOUT_STATUS.VOIDED) {
              return sum;
            }

            return sum + payout.amount_paise;
          }, 0);
          const v3TotalPaise = commissionEvaluation.incentive_pool_paise;
          const percentageDelta =
            v2TotalPaise === 0 ? null : ((v3TotalPaise - v2TotalPaise) / v2TotalPaise) * 100;

          const v2Result =
            v2TotalPaise === 0
              ? {
                  total_paise: 0,
                  note: "no_v2_payouts_found",
                }
              : {
                  total_paise: v2TotalPaise,
                };

          const v3Result = {
            evaluation_id: commissionEvaluation._id,
            commission_pool_paise: commissionEvaluation.incentive_pool_paise,
            effective_rate_bps: commissionEvaluation.effective_rate_bps,
            base_rate_bps: commissionEvaluation.base_rate_bps,
            flat_bonus_paise: commissionEvaluation.flat_bonus_paise,
            commission_base_profit_paise: commissionEvaluation.commission_base_profit_paise,
            config_version: commissionEvaluation.config_version,
            persona: commissionEvaluation.persona,
            computed_at: commissionEvaluation.computed_at,
          };

          const deltaSummary = {
            v2_total_paise: v2TotalPaise,
            v3_total_paise: v3TotalPaise,
            absolute_delta_paise: v3TotalPaise - v2TotalPaise,
            percentage_delta: percentageDelta,
          };

          await ctx.db.insert("shadow_mode_deltas", {
            deal_id: args.id,
            entity_type: "commission",
            persona: commissionEvaluation.persona,
            config_version_id: configVersion?._id,
            v2_result_json: JSON.stringify(v2Result),
            v3_result_json: JSON.stringify(v3Result),
            delta_summary: JSON.stringify(deltaSummary),
            created_at: Date.now(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Shadow delta insert failed for closure ${args.id}:`, errorMessage);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Commission shadow evaluation failed for closure ${args.id}:`, errorMessage);

        const latestClosure = await ctx.db.get(args.id);
        if (latestClosure) {
          const shadowFailureNote = `Commission shadow evaluation failed: ${errorMessage}`;
          const existingNotes = latestClosure.notes?.trim();
          await ctx.db.patch(args.id, {
            notes: existingNotes ? `${existingNotes}\n${shadowFailureNote}` : shadowFailureNote,
          });
        }
      }
    }

    try {
      const lead = await ctx.db.get(closure.lead_id);
      if (!lead) {
        throw new Error("Lead not found for closure attribution logging");
      }

      await ctx.runMutation(internal.dealContributions.logContribution, {
        closure_id: args.id,
        lead_id: lead._id,
        actor_user_id: lead.submitted_by_guard_id,
        actor_persona: INCENTIVE_PERSONA.GUARD,
        stage: CONTRIBUTION_STAGE.DISCOVERY,
        source_entity_type: CONTRIBUTION_SOURCE_ENTITY.LEAD,
        source_entity_id: `${lead._id}`,
        event_key: `${args.id}:DISCOVERY:${lead.submitted_by_guard_id}:lead_submit`,
        contribution_units: 1,
      });

      const completedVisits = await ctx.db
        .query("visits")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .filter((q) => q.eq(q.field("status"), VISIT_STATUS.COMPLETED))
        .collect();

      await Promise.all(
        completedVisits.map(async (visit) => {
          await ctx.runMutation(internal.dealContributions.logContribution, {
            closure_id: args.id,
            lead_id: lead._id,
            actor_user_id: visit.assigned_guard_id,
            actor_persona: INCENTIVE_PERSONA.GUARD,
            stage: CONTRIBUTION_STAGE.VERIFICATION,
            source_entity_type: CONTRIBUTION_SOURCE_ENTITY.VISIT,
            source_entity_id: `${visit._id}`,
            event_key: `${args.id}:VERIFICATION:${visit.assigned_guard_id}:visit_completed:${visit._id}`,
            contribution_units: 1,
          });
        }),
      );

      const closureActorPersona =
        confirmingUser.user_type === USER_TYPE.OPS ? INCENTIVE_PERSONA.OPS : INCENTIVE_PERSONA.ALL;

      await ctx.runMutation(internal.dealContributions.logContribution, {
        closure_id: args.id,
        lead_id: lead._id,
        actor_user_id: confirmingUser._id,
        actor_persona: closureActorPersona,
        stage: CONTRIBUTION_STAGE.CLOSURE,
        source_entity_type: CONTRIBUTION_SOURCE_ENTITY.CLOSURE,
        source_entity_id: `${args.id}`,
        event_key: `${args.id}:CLOSURE:${confirmingUser._id}:closure_confirm`,
        contribution_units: 1,
      });

      const verificationRecords = await ctx.db
        .query("owner_verifications")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .collect();

      await Promise.all(
        verificationRecords.map(async (verification) => {
          await ctx.runMutation(internal.dealContributions.logContribution, {
            closure_id: args.id,
            lead_id: lead._id,
            actor_user_id: verification.called_by_admin_id,
            actor_persona: INCENTIVE_PERSONA.ALL,
            stage: CONTRIBUTION_STAGE.SUPPORT,
            source_entity_type: CONTRIBUTION_SOURCE_ENTITY.AUDIT_LOG,
            source_entity_id: `${verification._id}`,
            event_key: `${args.id}:SUPPORT:${verification.called_by_admin_id}:owner_verification:${verification._id}`,
            contribution_units: 1,
          });
        }),
      );

      await ctx.runMutation(internal.attribution.computeAttribution, {
        closure_id: args.id,
      });

      await ctx.runMutation(internal.attribution.finalizeAttribution, {
        closure_id: args.id,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const leadForFallback = await ctx.db.get(closure.lead_id);

      console.error("V3 attribution hook failed; attempting v2 payout fallback", {
        closure_id: args.id,
        lead_id: closure.lead_id,
        guard_user_id: leadForFallback?.submitted_by_guard_id,
        prospective_bounty_paise: leadForFallback?.prospective_bounty,
        rollout_mode: rolloutPolicySnapshot.mode,
        rollout_enabled_personas: rolloutPolicySnapshot.enabled_personas,
        error: errorMessage,
      });

      try {
        const fallbackResult = await createV2PayoutIfMissing(ctx, args.id, confirmingUser._id);

        if (fallbackResult.created) {
          console.info("V3 payout fallback recovered by creating v2 payout", {
            closure_id: args.id,
            payout_id: fallbackResult.payoutId,
            guard_user_id: fallbackResult.guardUserId,
            amount_paise: fallbackResult.amountPaise,
          });
        } else if (fallbackResult.reason === "existing_payout") {
          console.info("V3 payout fallback skipped because payout already exists", {
            closure_id: args.id,
            guard_user_id: fallbackResult.guardUserId,
            amount_paise: fallbackResult.amountPaise,
          });
        } else {
          const followUpNote =
            "Payout requires manual follow-up: v3 attribution failed and automatic v2 fallback could not create payout.";
          await appendClosureFollowUpNote(ctx, args.id, followUpNote);
          console.error("V3 payout fallback could not create v2 payout", {
            closure_id: args.id,
            reason: fallbackResult.reason,
            guard_user_id: fallbackResult.guardUserId,
          });
        }
      } catch (fallbackError) {
        const fallbackErrorMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        const followUpNote = `Payout requires manual follow-up: v3 attribution failed and v2 fallback errored (${fallbackErrorMessage}).`;
        await appendClosureFollowUpNote(ctx, args.id, followUpNote);
        console.error("V3 payout fallback failed", {
          closure_id: args.id,
          lead_id: closure.lead_id,
          error: fallbackErrorMessage,
        });
      }
    }

    try {
      const lead = await ctx.db.get(closure.lead_id);
      if (!lead) {
        throw new Error("Lead not found for closure XP award");
      }

      await ctx.runMutation(internal.gamification.awardXp, {
        user_id: lead.submitted_by_guard_id,
        persona: INCENTIVE_PERSONA.GUARD,
        xp_amount: XP_AWARDS.CLOSURE_COMPLETED,
        event_key: `${args.id}:CLOSURE_CONFIRMED:${lead.submitted_by_guard_id}:closure_confirm`,
        reason: "Closure confirmed",
      });
    } catch (error) {
      console.error("V3 gamification XP hook failed (non-blocking):", error);
    }

    return await ctx.db.get(args.id);
  },
});

export const cancel = mutation({
  args: {
    id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const closure = await ctx.db.get(args.id);

    if (!closure) {
      throw new Error("Closure not found");
    }

    if (!validateClosureTransition(closure.status, CLOSURE_STATUS.CANCELLED)) {
      throw new Error(`Cannot cancel a closure with status: ${closure.status}`);
    }

    const linkedPayouts = await ctx.db
      .query("payouts")
      .withIndex("by_closure_id", (q) => q.eq("closure_id", args.id))
      .collect();

    await Promise.all(
      linkedPayouts.map(async (payout) => {
        if (payout.status !== PAYOUT_STATUS.PENDING && payout.status !== PAYOUT_STATUS.APPROVED) {
          return;
        }

        await ctx.db.patch(payout._id, {
          status: PAYOUT_STATUS.VOIDED,
        });
      }),
    );

    await ctx.db.patch(args.id, {
      status: CLOSURE_STATUS.CANCELLED,
    });

    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id("closures"),
    visit_id: v.optional(v.id("visits")),
    demorentals_deal_id: v.optional(v.string()),
    move_in_date: v.optional(v.number()),
    rent_agreement_storage_id: v.optional(v.id("_storage")),
    commission_amount: v.optional(v.number()),
    brokerage_tenant_side: v.optional(v.number()),
    brokerage_owner_side: v.optional(v.number()),
    additional_documents: v.optional(v.array(additionalDocumentValidator)),
    notes: v.optional(v.string()),
    deal_checklist_id: v.optional(v.id("deal_checklists")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const closure = await ctx.db.get(args.id);

    if (!closure) {
      throw new Error("Closure not found");
    }

    if (
      closure.status === CLOSURE_STATUS.CONFIRMED ||
      closure.status === CLOSURE_STATUS.CANCELLED
    ) {
      throw new Error(`Cannot edit closure in terminal status: ${closure.status}`);
    }

    const patch: Partial<
      Pick<
        ClosureDoc,
        | "demorentals_deal_id"
        | "visit_id"
        | "move_in_date"
        | "rent_agreement_storage_id"
        | "commission_amount"
        | "brokerage_tenant_side"
        | "brokerage_owner_side"
        | "additional_documents"
        | "deal_checklist_id"
        | "notes"
      >
    > = {};

    let closureInquiryId: Id<"tenant_inquiries"> | undefined;
    const hasVisitUpdate = Object.prototype.hasOwnProperty.call(args, "visit_id");
    const hasChecklistUpdate = Object.prototype.hasOwnProperty.call(args, "deal_checklist_id");

    if (Object.prototype.hasOwnProperty.call(args, "demorentals_deal_id")) {
      patch.demorentals_deal_id = normalizeOptionalString(args.demorentals_deal_id);
    }

    if (hasVisitUpdate) {
      closureInquiryId = await validateClosureVisitLink(ctx, closure.lead_id, args.visit_id);
      patch.visit_id = args.visit_id;
    }

    if (args.move_in_date !== undefined) {
      patch.move_in_date = args.move_in_date;
    }

    if (Object.prototype.hasOwnProperty.call(args, "rent_agreement_storage_id")) {
      patch.rent_agreement_storage_id = args.rent_agreement_storage_id;
    }

    if (args.commission_amount !== undefined) {
      assertMoneyPaise(args.commission_amount, "commission_amount");
      patch.commission_amount = args.commission_amount;
    }

    if (args.brokerage_tenant_side !== undefined) {
      assertMoneyPaise(args.brokerage_tenant_side, "brokerage_tenant_side");
      patch.brokerage_tenant_side = args.brokerage_tenant_side;
    }

    if (args.brokerage_owner_side !== undefined) {
      assertMoneyPaise(args.brokerage_owner_side, "brokerage_owner_side");
      patch.brokerage_owner_side = args.brokerage_owner_side;
    }

    if (Object.prototype.hasOwnProperty.call(args, "additional_documents")) {
      patch.additional_documents = normalizeAdditionalDocuments(args.additional_documents);
    }

    if (Object.prototype.hasOwnProperty.call(args, "notes")) {
      patch.notes = normalizeOptionalString(args.notes);
    }

    if (hasChecklistUpdate) {
      if (args.deal_checklist_id !== undefined) {
        if (closureInquiryId === undefined) {
          const effectiveVisitId = hasVisitUpdate ? args.visit_id : closure.visit_id;
          closureInquiryId = await validateClosureVisitLink(ctx, closure.lead_id, effectiveVisitId);
        }

        await validateDealChecklistLink(ctx, args.deal_checklist_id, closureInquiryId);
      }

      patch.deal_checklist_id = args.deal_checklist_id;
    }

    if (hasVisitUpdate && !hasChecklistUpdate && closure.deal_checklist_id !== undefined) {
      try {
        await validateDealChecklistLink(ctx, closure.deal_checklist_id, closureInquiryId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Existing deal_checklist_id is incompatible with the updated visit. Update or clear deal_checklist_id before saving. ${reason}`,
        );
      }
    }

    await validateClosureDocuments(
      ctx,
      patch.rent_agreement_storage_id,
      patch.additional_documents,
    );

    if (Object.keys(patch).length === 0) {
      return closure;
    }

    await ctx.db.patch(args.id, patch);

    return await ctx.db.get(args.id);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAnyPermission(ctx, [PERMISSIONS.CLOSURES_CREATE, PERMISSIONS.CLOSURES_EDIT]);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getById = query({
  args: {
    id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_VIEW);
    const closure = await ctx.db.get(args.id);

    if (!closure) {
      throw new Error("Closure not found");
    }

    const context = await getClosureContext(ctx, closure);
    const rentAgreementUrl = closure.rent_agreement_storage_id
      ? await ctx.storage.getUrl(closure.rent_agreement_storage_id)
      : null;

    const additionalDocumentUrls = await Promise.all(
      (closure.additional_documents ?? []).map(async (document) => ({
        name: document.name,
        storage_id: document.storage_id,
        url: await ctx.storage.getUrl(document.storage_id),
      })),
    );

    return {
      closure,
      lead: context.lead,
      building: context.building,
      society: context.society,
      guard: context.guard,
      listing: context.listing,
      payout: context.payout,
      rent_agreement_url: rentAgreementUrl,
      additional_document_urls: additionalDocumentUrls,
    };
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(closureStatusValidator),
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
    society_id: v.optional(v.id("societies")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_VIEW);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    let paginatedResults: PaginationResult<ClosureDoc>;

    if (args.status === undefined) {
      paginatedResults = await ctx.db.query("closures").order("desc").paginate(args.paginationOpts);
    } else {
      const status = args.status;
      paginatedResults = await ctx.db
        .query("closures")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const enrichedClosures = await Promise.all(
      paginatedResults.page.map(async (closure) => {
        const context = await getClosureContext(ctx, closure);

        return {
          ...closure,
          lead: context.lead,
          building: context.building,
          society: context.society,
          guard: context.guard,
          listing: context.listing,
          payout_status: context.payout?.status ?? null,
        };
      }),
    );

    const filteredClosures = enrichedClosures.filter((closure) => {
      if (args.date_from !== undefined && closure.move_in_date < args.date_from) {
        return false;
      }

      if (args.date_to !== undefined && closure.move_in_date > args.date_to) {
        return false;
      }

      if (args.society_id !== undefined && closure.society?._id !== args.society_id) {
        return false;
      }

      return true;
    });

    return {
      ...paginatedResults,
      page: filteredClosures,
    } as PaginationResult<(typeof filteredClosures)[number]>;
  },
});

export const getByLeadId = query({
  args: {
    lead_id: v.id("leads"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_VIEW);

    return await ctx.db
      .query("closures")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .first();
  },
});
