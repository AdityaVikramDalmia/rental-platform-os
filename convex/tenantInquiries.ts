import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  LISTING_STATUS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  PERMISSIONS,
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  REFERRAL_STATUS,
  REFERRAL_TYPE,
  SYSTEM_CONFIG_KEYS,
  TENANT_INQUIRY_STATUS,
  USER_STATUS,
  VISIT_OUTCOME,
  VISIT_STATUS,
  type TenantInquiryStatus,
} from "../lib/constants";
import { calculateSplitAmount } from "../lib/referral";
import { requireFieldWorker, requirePermission, requireTenant } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { mutation, internalMutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const tenantInquiryStatusValidator = v.union(
  v.literal(TENANT_INQUIRY_STATUS.SUBMITTED),
  v.literal(TENANT_INQUIRY_STATUS.REVIEWED),
  v.literal(TENANT_INQUIRY_STATUS.BOUNTY_POSTED),
  v.literal(TENANT_INQUIRY_STATUS.GUARD_ACCEPTED),
  v.literal(TENANT_INQUIRY_STATUS.VISIT_SCHEDULED),
  v.literal(TENANT_INQUIRY_STATUS.VISIT_COMPLETED),
  v.literal(TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED),
  v.literal(TENANT_INQUIRY_STATUS.CLOSED),
  v.literal(TENANT_INQUIRY_STATUS.REJECTED),
  v.literal(TENANT_INQUIRY_STATUS.EXPIRED),
);

const VALID_TRANSITIONS: Record<string, string[]> = {
  [TENANT_INQUIRY_STATUS.SUBMITTED]: [
    TENANT_INQUIRY_STATUS.REVIEWED,
    TENANT_INQUIRY_STATUS.REJECTED,
  ],
  [TENANT_INQUIRY_STATUS.REVIEWED]: [
    TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
    TENANT_INQUIRY_STATUS.REJECTED,
  ],
  [TENANT_INQUIRY_STATUS.BOUNTY_POSTED]: [
    TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
    TENANT_INQUIRY_STATUS.EXPIRED,
  ],
  [TENANT_INQUIRY_STATUS.GUARD_ACCEPTED]: [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED],
  [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED]: [
    TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
    TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
  ],
  [TENANT_INQUIRY_STATUS.VISIT_COMPLETED]: [
    TENANT_INQUIRY_STATUS.CLOSED,
    TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
  ],
  [TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED]: [TENANT_INQUIRY_STATUS.CLOSED],
};

const TRACKABLE_GUARD_INQUIRY_STATUSES: TenantInquiryStatus[] = [
  TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
  TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
  TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
  TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
  TENANT_INQUIRY_STATUS.CLOSED,
];

const TENANT_INQUIRY_MAX_MESSAGE_LENGTH = 5000;
const TENANT_INQUIRY_MAX_NOTES_LENGTH = 2000;
const TENANT_INQUIRY_MAX_PREFERRED_SLOT_LENGTH = 200;

function validateMessageLength(message: string | undefined): void {
  if (message && message.length > TENANT_INQUIRY_MAX_MESSAGE_LENGTH) {
    throw new Error("Message too long");
  }
}

function validateNotesLength(notes: string | undefined): void {
  if (notes && notes.length > TENANT_INQUIRY_MAX_NOTES_LENGTH) {
    throw new Error("Notes too long");
  }
}

function validatePreferredVisitSlotLength(preferredVisitSlot: string | undefined): void {
  if (preferredVisitSlot && preferredVisitSlot.length > TENANT_INQUIRY_MAX_PREFERRED_SLOT_LENGTH) {
    throw new Error("Preferred visit slot too long");
  }
}

export function validateTenantInquiryTransition(currentStatus: string, newStatus: string): boolean {
  return (VALID_TRANSITIONS[currentStatus] ?? []).includes(newStatus);
}

type InquiryContext = {
  listing: Doc<"listings"> | null;
  lead: Doc<"leads"> | null;
  building: Doc<"buildings"> | null;
  society: Doc<"societies"> | null;
  guard: { _id: Id<"users">; name: string; phone: string | undefined } | null;
  visit: Doc<"visits"> | null;
};

type TenantSafeInquiry = {
  _id: Id<"tenant_inquiries">;
  _creationTime: number;
  inquiry_id: Id<"tenant_inquiries">;
  status: Doc<"tenant_inquiries">["status"];
  preferred_visit_date: Doc<"tenant_inquiries">["preferred_visit_date"];
  preferred_visit_slot: Doc<"tenant_inquiries">["preferred_visit_slot"];
  created_at: number;
  updated_at: number;
  listing: {
    _id: Id<"listings">;
    id: Id<"listings">;
    title: string;
    slug: string;
    rent_monthly: number;
    bhk_config: Doc<"listings">["bhk_config"];
  } | null;
  building: {
    name: string;
  } | null;
  society: {
    name: string;
  } | null;
  building_name: string | null;
  society_name: string | null;
  visit: {
    id: Id<"visits">;
    status: Doc<"visits">["status"];
    scheduled_start: number;
    scheduled_end: number;
    outcome: Doc<"visits">["outcome"];
  } | null;
  guard: {
    id: Id<"users">;
    first_name: string;
  } | null;
};

function getFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Guard";
  }

  const parts = trimmed.split(/\s+/);
  return parts[0] ?? trimmed;
}

const visitOutcomeValidator = v.union(
  v.literal(VISIT_OUTCOME.INTERESTED),
  v.literal(VISIT_OUTCOME.NOT_INTERESTED),
  v.literal(VISIT_OUTCOME.FOLLOWUP),
);

function getListingTitleForTenant(context: InquiryContext): string {
  if (context.building && context.lead?.flat_number) {
    return `${context.building.name} Flat ${context.lead.flat_number}`;
  }

  if (context.lead?.flat_number) {
    return `Flat ${context.lead.flat_number}`;
  }

  if (context.listing?.slug) {
    return context.listing.slug
      .split("-")
      .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
      .join(" ");
  }

  if (context.listing) {
    return `${context.listing.bhk_config} listing`;
  }

  return "Listing";
}

async function getLatestActiveTenantReferral(
  ctx: MutationCtx,
  tenantUserId: Id<"users">,
): Promise<Doc<"referrals"> | null> {
  const referrals = await ctx.db
    .query("referrals")
    .withIndex("by_referred_user_id", (q) => q.eq("referred_user_id", tenantUserId))
    .order("desc")
    .collect();

  return (
    referrals.find(
      (referral) =>
        referral.status !== REFERRAL_STATUS.VOIDED &&
        referral.referral_type === REFERRAL_TYPE.TENANT_FINDING,
    ) ?? null
  );
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

async function getInquiryContext(
  ctx: QueryCtx | MutationCtx,
  inquiry: Doc<"tenant_inquiries">,
): Promise<InquiryContext> {
  const listing = await ctx.db.get(inquiry.listing_id);
  const lead = listing ? await ctx.db.get(listing.lead_id) : null;
  const building = lead?.building_id ? await ctx.db.get(lead.building_id) : null;
  const society = building?.society_id ? await ctx.db.get(building.society_id) : null;

  let guard: InquiryContext["guard"] = null;
  if (inquiry.assigned_guard_id) {
    const guardUser = await ctx.db.get(inquiry.assigned_guard_id);
    if (guardUser) {
      guard = {
        _id: guardUser._id,
        name: guardUser.name,
        phone: guardUser.phone,
      };
    }
  }

  const visit = inquiry.visit_id ? await ctx.db.get(inquiry.visit_id) : null;

  return { listing, lead, building, society, guard, visit };
}

async function enrichInquiry(
  ctx: QueryCtx | MutationCtx,
  inquiry: Doc<"tenant_inquiries">,
): Promise<
  Doc<"tenant_inquiries"> & {
    listing: InquiryContext["listing"];
    lead: InquiryContext["lead"];
    building: InquiryContext["building"];
    society: InquiryContext["society"];
    guard: InquiryContext["guard"];
    visit: InquiryContext["visit"];
  }
> {
  const context = await getInquiryContext(ctx, inquiry);

  return {
    ...inquiry,
    listing: context.listing,
    lead: context.lead,
    building: context.building,
    society: context.society,
    guard: context.guard,
    visit: context.visit,
  };
}

async function enrichInquiryForTenant(
  ctx: QueryCtx | MutationCtx,
  inquiry: Doc<"tenant_inquiries">,
): Promise<TenantSafeInquiry> {
  const context = await getInquiryContext(ctx, inquiry);

  return {
    _id: inquiry._id,
    _creationTime: inquiry._creationTime,
    inquiry_id: inquiry._id,
    status: inquiry.status,
    preferred_visit_date: inquiry.preferred_visit_date,
    preferred_visit_slot: inquiry.preferred_visit_slot,
    created_at: inquiry._creationTime,
    updated_at: inquiry.updated_at ?? inquiry._creationTime,
    listing: context.listing
      ? {
          _id: context.listing._id,
          id: context.listing._id,
          title: getListingTitleForTenant(context),
          slug: context.listing.slug,
          rent_monthly: context.listing.rent_monthly,
          bhk_config: context.listing.bhk_config,
        }
      : null,
    building: context.building
      ? {
          name: context.building.name,
        }
      : null,
    society: context.society
      ? {
          name: context.society.name,
        }
      : null,
    building_name: context.building?.name ?? null,
    society_name: context.society?.name ?? null,
    visit: context.visit
      ? {
          id: context.visit._id,
          status: context.visit.status,
          scheduled_start: context.visit.scheduled_start,
          scheduled_end: context.visit.scheduled_end,
          outcome: context.visit.outcome,
        }
      : null,
    guard: context.guard
      ? {
          id: context.guard._id,
          first_name: getFirstName(context.guard.name),
        }
      : null,
  };
}

export const submit = mutation({
  args: {
    listing_id: v.id("listings"),
    preferred_visit_date: v.optional(v.number()),
    preferred_visit_slot: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);
    const preferredVisitSlot = args.preferred_visit_slot?.trim() || undefined;
    const message = args.message?.trim() || undefined;

    validatePreferredVisitSlotLength(preferredVisitSlot);
    validateMessageLength(message);

    const listing = await ctx.db.get(args.listing_id);
    if (!listing) {
      throw new Error("Listing not found");
    }
    if (listing.status !== LISTING_STATUS.PUBLISHED) {
      throw new Error("Can only submit inquiries for published listings");
    }

    const phone = tenant.phone?.replace(/\D/g, "") ?? "";
    if (phone.length !== 10) {
      throw new Error("Tenant profile must include a valid 10-digit phone number");
    }

    const name = tenant.name.trim();
    if (name.length < 2) {
      throw new Error("Tenant profile must include a valid name");
    }

    await rateLimiter.limit(ctx, "tenant:inquiry_submission", {
      key: tenant._id,
      throws: true,
    });

    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: args.listing_id,
      tenant_id: tenant._id,
      tenant_name: name,
      tenant_phone: phone,
      tenant_email: tenant.email?.trim() || undefined,
      preferred_visit_date: args.preferred_visit_date,
      preferred_visit_slot: preferredVisitSlot,
      message,
      status: TENANT_INQUIRY_STATUS.SUBMITTED,
      bounty_amount: undefined,
      bounty_posted_at: undefined,
      bounty_expires_at: undefined,
      assigned_guard_id: undefined,
      visit_id: undefined,
      ops_notes: undefined,
      rejection_reason: undefined,
      reviewed_by_admin_id: undefined,
    });

    try {
      const tenantReferral = await getLatestActiveTenantReferral(ctx, tenant._id);

      if (tenantReferral) {
        const listingPublishedMilestone = await getReferralMilestoneByType(
          ctx,
          tenantReferral._id,
          REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
        );
        const publishMilestonePending =
          listingPublishedMilestone?.status === REFERRAL_MILESTONE_STATUS.PENDING;

        if (publishMilestonePending) {
          const lead = await ctx.db.get(listing.lead_id);

          if (lead) {
            const patch: Partial<
              Pick<Doc<"referrals">, "lead_id" | "listing_id" | "building_id" | "society_id">
            > = {};

            if (tenantReferral.lead_id !== lead._id) {
              patch.lead_id = lead._id;
            }

            if (tenantReferral.listing_id !== listing._id) {
              patch.listing_id = listing._id;
            }

            if (tenantReferral.building_id !== lead.building_id) {
              patch.building_id = lead.building_id;
            }

            if (tenantReferral.society_id !== lead.society_id) {
              patch.society_id = lead.society_id;
            }

            if (Object.keys(patch).length > 0) {
              await ctx.db.patch(tenantReferral._id, {
                ...patch,
              });
            }

            const scopedConfig = await ctx.runQuery(internal.referralConfig.getForScope, {
              referral_type: tenantReferral.referral_type,
              building_id: lead.building_id,
              society_id: lead.society_id,
            });

            const scopedListingAmount = calculateSplitAmount(
              scopedConfig.finding_bonus_total,
              scopedConfig.publish_split_pct,
            );

            if (
              listingPublishedMilestone &&
              listingPublishedMilestone.amount !== scopedListingAmount
            ) {
              await ctx.db.patch(listingPublishedMilestone._id, {
                amount: scopedListingAmount,
              });
            }

            await ctx.runMutation(internal.referralMilestones.trigger, {
              referral_id: tenantReferral._id,
              milestone_type: REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
              source_event: `listing_published:${listing._id}`,
            });
          }
        }
      }
    } catch (error) {
      console.error("Referral publish milestone backfill error:", error);
    }

    return inquiryId;
  },
});

export const review = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE);
    const opsNotes = args.ops_notes?.trim() || undefined;
    validateNotesLength(opsNotes);

    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.REVIEWED)) {
      throw new Error(`Cannot review inquiry with status: ${inquiry.status}`);
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.REVIEWED,
      reviewed_by_admin_id: admin._id,
      ops_notes: opsNotes || inquiry.ops_notes,
    });

    return await ctx.db.get(args.id);
  },
});

export const reject = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    ops_notes: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.REJECTED)) {
      throw new Error(`Cannot reject inquiry with status: ${inquiry.status}`);
    }

    const opsNotes = args.ops_notes.trim();
    if (opsNotes.length === 0) {
      throw new Error("Ops notes are required");
    }
    validateNotesLength(opsNotes);

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.REJECTED,
      ops_notes: opsNotes,
      rejection_reason: opsNotes,
      reviewed_by_admin_id: admin._id,
    });

    return await ctx.db.get(args.id);
  },
});

export const postBounty = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    bounty_amount: v.number(),
    expiry_days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.BOUNTY_POSTED)) {
      throw new Error(`Cannot post bounty for inquiry with status: ${inquiry.status}`);
    }

    if (!Number.isInteger(args.bounty_amount) || args.bounty_amount <= 0) {
      throw new Error("Bounty amount must be a positive integer (paise)");
    }

    let expiryDays = args.expiry_days;
    if (expiryDays === undefined) {
      const expiryConfig = await ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_EXPIRY_DAYS))
        .first();

      if (!expiryConfig) {
        throw new Error("Missing system config: tenant_bounty_expiry_days");
      }

      const parsedExpiry = Number.parseInt(expiryConfig.value, 10);
      if (!Number.isInteger(parsedExpiry)) {
        throw new Error("Invalid tenant_bounty_expiry_days system config value");
      }

      expiryDays = parsedExpiry;
    }

    if (expiryDays < 1 || expiryDays > 30) {
      throw new Error("Expiry must be between 1 and 30 days");
    }

    const now = Date.now();
    const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
      bounty_amount: args.bounty_amount,
      bounty_posted_at: now,
      bounty_expires_at: expiresAt,
      reviewed_by_admin_id: admin._id,
    });

    return await ctx.db.get(args.id);
  },
});

export const acceptBounty = mutation({
  args: {
    id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const { user: guard, guardProfile } = await requireFieldWorker(ctx);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.GUARD_ACCEPTED)) {
      throw new Error(`Cannot accept bounty for inquiry with status: ${inquiry.status}`);
    }

    if (inquiry.bounty_expires_at && inquiry.bounty_expires_at < Date.now()) {
      throw new Error("This bounty has expired");
    }

    const listing = await ctx.db.get(inquiry.listing_id);
    if (!listing) throw new Error("Listing not found");

    if (listing.status !== LISTING_STATUS.PUBLISHED) {
      throw new Error("Cannot accept bounty for a listing that is not published");
    }

    const lead = await ctx.db.get(listing.lead_id);
    if (!lead) throw new Error("Lead not found");

    if (guardProfile.society_id !== lead.society_id) {
      throw new Error("You can only accept bounties for listings in your society");
    }

    if (inquiry.assigned_guard_id) {
      throw new Error("This bounty has already been accepted");
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
      assigned_guard_id: guard._id,
    });

    const tenantId = inquiry.tenant_id;

    if (tenantId) {
      try {
        // TODO(P35): Add channel templates for event_type "inquiry_bounty_accepted".
        await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
          user_id: tenantId,
          event_type: "inquiry_bounty_accepted",
          category: NOTIFICATION_CATEGORY.INQUIRY_UPDATE,
          severity: NOTIFICATION_SEVERITY.IMPORTANT,
          payload: {
            guard_name: guard.name,
            flat_number: lead.flat_number,
            bounty_amount: inquiry.bounty_amount,
          },
          dedup_key: `tenant_inquiry:${args.id}:guard_accepted`,
          action_url: `/tenant/inquiries/${args.id}`,
        });
      } catch (error) {
        console.error(
          "Failed to enqueue inquiry bounty accepted notification (non-blocking):",
          error,
        );
      }
    }

    // Field workers never receive the tenant's contact details or ops notes.
    return { _id: args.id, status: TENANT_INQUIRY_STATUS.GUARD_ACCEPTED };
  },
});

export const emitVisitCompletedNotification = internalMutation({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
    visit_id: v.id("visits"),
    outcome: visitOutcomeValidator,
  },
  handler: async (ctx, args) => {
    const inquiry = await ctx.db.get(args.inquiry_id);

    if (!inquiry) {
      return { scheduled: false, reason: "inquiry_not_found" as const };
    }

    const tenantId = inquiry.tenant_id;

    if (!tenantId) {
      return { scheduled: false, reason: "tenant_missing" as const };
    }

    const visit = await ctx.db.get(args.visit_id);
    const context = await getInquiryContext(ctx, inquiry);

    try {
      // TODO(P35): Add channel templates for event_type "inquiry_visit_completed".
      await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
        user_id: tenantId,
        event_type: "inquiry_visit_completed",
        category: NOTIFICATION_CATEGORY.INQUIRY_UPDATE,
        severity: NOTIFICATION_SEVERITY.IMPORTANT,
        payload: {
          flat_number: context.lead?.flat_number ?? "Unknown",
          building_name: context.building?.name ?? "Unknown building",
          visit_outcome: args.outcome,
          visit_completed_at: visit?.completed_at,
        },
        dedup_key: `tenant_inquiry:${args.inquiry_id}:visit_completed:${args.visit_id}`,
        action_url: `/tenant/inquiries/${args.inquiry_id}`,
      });
      return { scheduled: true };
    } catch (error) {
      console.error(
        "Failed to enqueue inquiry visit completed notification (non-blocking):",
        error,
      );
      return { scheduled: false, reason: "schedule_failed" as const };
    }
  },
});

export const scheduleVisit = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    scheduled_start: v.number(),
    scheduled_end: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.VISIT_SCHEDULED)) {
      throw new Error(`Cannot schedule visit for inquiry with status: ${inquiry.status}`);
    }

    if (!inquiry.assigned_guard_id) {
      throw new Error("No guard assigned to this inquiry");
    }

    const guard = await ctx.db.get(inquiry.assigned_guard_id);
    if (!guard) throw new Error("Assigned guard not found");
    if (guard.status !== USER_STATUS.ACTIVE) {
      throw new Error("Assigned guard is no longer active");
    }

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", guard._id))
      .unique();

    if (!guardProfile) throw new Error("Assigned guard profile not found");

    if (args.scheduled_start >= args.scheduled_end) {
      throw new Error("scheduled_start must be less than scheduled_end");
    }

    const listing = await ctx.db.get(inquiry.listing_id);
    if (!listing) throw new Error("Listing not found");

    if (listing.status !== LISTING_STATUS.PUBLISHED) {
      throw new Error("Cannot schedule visit for a listing that is not published");
    }

    const lead = await ctx.db.get(listing.lead_id);
    if (!lead) throw new Error("Lead not found");

    const building = await ctx.db.get(lead.building_id);
    if (!building) throw new Error("Building not found");

    if (guardProfile.society_id !== building.society_id) {
      throw new Error("Guard is not assigned to this listing's society");
    }

    const visitId = await ctx.db.insert("visits", {
      lead_id: lead._id,
      society_id: lead.society_id,
      listing_id: listing._id,
      scheduled_start: args.scheduled_start,
      scheduled_end: args.scheduled_end,
      assigned_guard_id: inquiry.assigned_guard_id,
      status: VISIT_STATUS.ASSIGNED,
      outcome: undefined,
      outcome_notes: undefined,
      started_at: undefined,
      completed_at: undefined,
      needs_reassignment: false,
      created_by_admin_id: admin._id,
      tenant_inquiry_id: args.id,
    });

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
      visit_id: visitId,
    });

    return await ctx.db.get(args.id);
  },
});

export const expire = mutation({
  args: {
    id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.EXPIRED)) {
      throw new Error(`Cannot expire inquiry with status: ${inquiry.status}`);
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.EXPIRED,
    });

    return await ctx.db.get(args.id);
  },
});

export const close = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE);
    const opsNotes = args.ops_notes?.trim() || undefined;
    validateNotesLength(opsNotes);

    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.CLOSED)) {
      throw new Error(`Cannot close inquiry with status: ${inquiry.status}`);
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.CLOSED,
      ops_notes: opsNotes || inquiry.ops_notes,
    });

    return await ctx.db.get(args.id);
  },
});

export const initiateNegotiation = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE);
    const opsNotes = args.ops_notes?.trim() || undefined;
    validateNotesLength(opsNotes);

    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (
      !validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED)
    ) {
      throw new Error(`Cannot initiate negotiation for inquiry with status: ${inquiry.status}`);
    }

    if (!inquiry.visit_id) {
      throw new Error("Cannot initiate negotiation before a visit is linked");
    }

    const visit = await ctx.db.get(inquiry.visit_id);
    if (!visit) {
      throw new Error("Linked visit not found");
    }

    if (visit.outcome !== VISIT_OUTCOME.INTERESTED) {
      throw new Error("Negotiation can only be initiated when visit outcome is INTERESTED");
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
      ops_notes: opsNotes || inquiry.ops_notes,
      updated_at: Date.now(),
    });

    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(tenantInquiryStatusValidator),
    listing_id: v.optional(v.id("listings")),
    tenant_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_VIEW);

    const paginatedResults = await (async () => {
      if (args.tenant_id && args.status && !args.listing_id) {
        return await ctx.db
          .query("tenant_inquiries")
          .withIndex("by_tenant_and_status", (q) =>
            q.eq("tenant_id", args.tenant_id!).eq("status", args.status!),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }

      if (args.listing_id && !args.tenant_id && !args.status) {
        return await ctx.db
          .query("tenant_inquiries")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id!))
          .order("desc")
          .paginate(args.paginationOpts);
      }

      if (args.tenant_id && !args.status && !args.listing_id) {
        return await ctx.db
          .query("tenant_inquiries")
          .withIndex("by_tenant_id", (q) => q.eq("tenant_id", args.tenant_id!))
          .order("desc")
          .paginate(args.paginationOpts);
      }

      if (args.status && !args.listing_id && !args.tenant_id) {
        return await ctx.db
          .query("tenant_inquiries")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .paginate(args.paginationOpts);
      }

      let queryBuilder = ctx.db.query("tenant_inquiries");

      if (args.listing_id) {
        queryBuilder = queryBuilder.filter((q) => q.eq(q.field("listing_id"), args.listing_id));
      }

      if (args.tenant_id) {
        queryBuilder = queryBuilder.filter((q) => q.eq(q.field("tenant_id"), args.tenant_id));
      }

      if (args.status) {
        queryBuilder = queryBuilder.filter((q) => q.eq(q.field("status"), args.status));
      }

      return await queryBuilder.order("desc").paginate(args.paginationOpts);
    })();

    const enriched = await Promise.all(
      paginatedResults.page.map(async (inquiry) => await enrichInquiry(ctx, inquiry)),
    );

    return {
      ...paginatedResults,
      page: enriched,
    } as PaginationResult<(typeof enriched)[number]>;
  },
});

export const getById = query({
  args: {
    id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_VIEW);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    return await enrichInquiry(ctx, inquiry);
  },
});

export const getMyInquiries = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(tenantInquiryStatusValidator),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    const paginatedResults = args.status
      ? await ctx.db
          .query("tenant_inquiries")
          .withIndex("by_tenant_and_status", (q) =>
            q.eq("tenant_id", tenant._id).eq("status", args.status!),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("tenant_inquiries")
          .withIndex("by_tenant_id", (q) => q.eq("tenant_id", tenant._id))
          .order("desc")
          .paginate(args.paginationOpts);

    const enriched = await Promise.all(
      paginatedResults.page.map(async (inquiry) => await enrichInquiryForTenant(ctx, inquiry)),
    );

    return {
      ...paginatedResults,
      page: enriched,
    } as PaginationResult<(typeof enriched)[number]>;
  },
});

export const getMyInquiryById = query({
  args: {
    id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);
    const inquiry = await ctx.db.get(args.id);

    if (!inquiry) {
      throw new Error("Inquiry not found");
    }

    if (inquiry.tenant_id !== tenant._id) {
      throw new Error("You do not have access to this inquiry");
    }

    return await enrichInquiryForTenant(ctx, inquiry);
  },
});

export const getStatusCounts = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_VIEW);

    const allInquiries = await ctx.db.query("tenant_inquiries").collect();

    const counts: Record<TenantInquiryStatus, number> = {
      [TENANT_INQUIRY_STATUS.SUBMITTED]: 0,
      [TENANT_INQUIRY_STATUS.REVIEWED]: 0,
      [TENANT_INQUIRY_STATUS.BOUNTY_POSTED]: 0,
      [TENANT_INQUIRY_STATUS.GUARD_ACCEPTED]: 0,
      [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED]: 0,
      [TENANT_INQUIRY_STATUS.VISIT_COMPLETED]: 0,
      [TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED]: 0,
      [TENANT_INQUIRY_STATUS.CLOSED]: 0,
      [TENANT_INQUIRY_STATUS.REJECTED]: 0,
      [TENANT_INQUIRY_STATUS.EXPIRED]: 0,
    };

    for (const inquiry of allInquiries) {
      counts[inquiry.status] = (counts[inquiry.status] ?? 0) + 1;
    }

    return counts;
  },
});

// What a field worker may see of an inquiry: scheduling and bounty data only,
// never the tenant's identity/contact details or internal ops fields.
function toFieldWorkerInquiryView(inquiry: Doc<"tenant_inquiries">) {
  return {
    _id: inquiry._id,
    _creationTime: inquiry._creationTime,
    listing_id: inquiry.listing_id,
    bounty_amount: inquiry.bounty_amount,
    status: inquiry.status,
    created_at: inquiry._creationTime,
    preferred_visit_date: inquiry.preferred_visit_date,
    preferred_visit_slot: inquiry.preferred_visit_slot,
    bounty_posted_at: inquiry.bounty_posted_at,
    bounty_expires_at: inquiry.bounty_expires_at,
  };
}

export const listBounties = query({
  args: {
    tab: v.union(v.literal("available"), v.literal("accepted")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user: guard, guardProfile } = await requireFieldWorker(ctx);

    if (args.tab === "available") {
      const paginatedBounties = await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_status", (q) => q.eq("status", TENANT_INQUIRY_STATUS.BOUNTY_POSTED))
        .order("desc")
        .paginate(args.paginationOpts);

      const now = Date.now();
      const filtered = [];
      for (const bounty of paginatedBounties.page) {
        if (bounty.bounty_expires_at && bounty.bounty_expires_at < now) continue;

        const listing = await ctx.db.get(bounty.listing_id);
        if (!listing) continue;

        const lead = await ctx.db.get(listing.lead_id);
        if (!lead) continue;

        if (lead.society_id !== guardProfile.society_id) continue;

        const building = await ctx.db.get(lead.building_id);
        const society = await ctx.db.get(lead.society_id);

        filtered.push({
          _id: bounty._id,
          _creationTime: bounty._creationTime,
          listing_id: bounty.listing_id,
          bounty_amount: bounty.bounty_amount,
          status: bounty.status,
          created_at: bounty._creationTime,
          preferred_visit_date: bounty.preferred_visit_date,
          preferred_visit_slot: bounty.preferred_visit_slot,
          bounty_posted_at: bounty.bounty_posted_at,
          bounty_expires_at: bounty.bounty_expires_at,
          listing_bhk: listing.bhk_config,
          listing_rent: listing.rent_monthly,
          listing_slug: listing.slug,
          flat_number: lead.flat_number,
          floor_number: listing.floor_number,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
        });
      }

      return {
        ...paginatedBounties,
        page: filtered,
      } as PaginationResult<(typeof filtered)[number]>;
    }

    const paginatedMyBounties = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", guard._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const enrichedMyBounties = await Promise.all(
      paginatedMyBounties.page.map(async (inquiry) => {
        const listing = await ctx.db.get(inquiry.listing_id);
        const lead = listing ? await ctx.db.get(listing.lead_id) : null;
        const building = lead ? await ctx.db.get(lead.building_id) : null;
        const society = lead ? await ctx.db.get(lead.society_id) : null;

        return {
          ...toFieldWorkerInquiryView(inquiry),
          listing_bhk: listing?.bhk_config ?? null,
          listing_rent: listing?.rent_monthly ?? null,
          listing_slug: listing?.slug ?? null,
          flat_number: lead?.flat_number ?? null,
          floor_number: listing?.floor_number ?? null,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
        };
      }),
    );

    return {
      ...paginatedMyBounties,
      page: enrichedMyBounties,
    } as PaginationResult<(typeof enrichedMyBounties)[number]>;
  },
});

export const listByGuard = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user: guard } = await requireFieldWorker(ctx);

    const paginatedInquiries = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", guard._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const trackedInquiries = paginatedInquiries.page.filter((inquiry) =>
      TRACKABLE_GUARD_INQUIRY_STATUSES.includes(inquiry.status),
    );

    const enrichedTrackedInquiries = await Promise.all(
      trackedInquiries.map(async (inquiry) => {
        const context = await getInquiryContext(ctx, inquiry);

        return {
          ...toFieldWorkerInquiryView(inquiry),
          visit: context.visit
            ? {
                scheduled_start: context.visit.scheduled_start,
                scheduled_end: context.visit.scheduled_end,
                outcome: context.visit.outcome,
              }
            : null,
          listing_bhk: context.listing?.bhk_config ?? null,
          listing_rent: context.listing?.rent_monthly ?? null,
          listing_slug: context.listing?.slug ?? null,
          flat_number: context.lead?.flat_number ?? null,
          floor_number: context.listing?.floor_number ?? null,
          building_name: context.building?.name ?? null,
          society_name: context.society?.name ?? null,
        };
      }),
    );

    return {
      ...paginatedInquiries,
      page: enrichedTrackedInquiries,
    } as PaginationResult<(typeof enrichedTrackedInquiries)[number]>;
  },
});

export const getSubmittedCount = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_VIEW);

    const submitted = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_status", (q) => q.eq("status", TENANT_INQUIRY_STATUS.SUBMITTED))
      .collect();

    return submitted.length;
  },
});

export const expireBounties = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let expired = 0;

    const result = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_status", (q) => q.eq("status", TENANT_INQUIRY_STATUS.BOUNTY_POSTED))
      .paginate({ numItems: 100, cursor: args.cursor ?? null });

    for (const inquiry of result.page) {
      if (inquiry.bounty_expires_at && inquiry.bounty_expires_at < now) {
        if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.EXPIRED)) {
          continue;
        }
        await ctx.db.patch(inquiry._id, {
          status: TENANT_INQUIRY_STATUS.EXPIRED,
          updated_at: now,
        });
        expired++;
      }
    }

    // Schedule next batch if more items exist
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.tenantInquiries.expireBounties, {
        cursor: result.continueCursor,
      });
    }

    if (expired > 0) {
      console.log(`Expired ${expired} tenant inquiry bounties`);
    }
  },
});
