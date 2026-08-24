import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  AMENITIES,
  BHK_CONFIG,
  CLOSURE_STATUS,
  FURNISHING,
  INQUIRY_SOURCE,
  LEAD_STATUS,
  LISTING_STATUS,
  OWNER_LIFECYCLE_STAGE,
  PARKING,
  PERMISSIONS,
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  REFERRAL_STATUS,
  REFERRAL_TYPE,
  TRANSACTION_STATUS,
  type ListingStatus,
} from "../lib/constants";
import { calculateSplitAmount } from "../lib/referral";
import { normalizePhone } from "../lib/validators";
import { requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import { progressLifecycleStage } from "./owners";
import { rateLimiter } from "./rateLimiter";
import { advanceTransactionStatusInternal } from "./rentalTransactions";

const bhkConfigValidator = v.union(
  v.literal(BHK_CONFIG["1BHK"]),
  v.literal(BHK_CONFIG["2BHK"]),
  v.literal(BHK_CONFIG["3BHK"]),
  v.literal(BHK_CONFIG["4BHK"]),
  v.literal(BHK_CONFIG.STUDIO),
  v.literal(BHK_CONFIG.OTHER),
);

const furnishingValidator = v.union(
  v.literal(FURNISHING.UNFURNISHED),
  v.literal(FURNISHING.SEMI_FURNISHED),
  v.literal(FURNISHING.FULLY_FURNISHED),
);

const parkingValidator = v.union(
  v.literal(PARKING.NONE),
  v.literal(PARKING.COVERED),
  v.literal(PARKING.OPEN),
  v.literal(PARKING.BOTH),
);

const amenityValidator = v.union(
  v.literal(AMENITIES[0]),
  v.literal(AMENITIES[1]),
  v.literal(AMENITIES[2]),
  v.literal(AMENITIES[3]),
  v.literal(AMENITIES[4]),
  v.literal(AMENITIES[5]),
  v.literal(AMENITIES[6]),
  v.literal(AMENITIES[7]),
  v.literal(AMENITIES[8]),
  v.literal(AMENITIES[9]),
  v.literal(AMENITIES[10]),
  v.literal(AMENITIES[11]),
  v.literal(AMENITIES[12]),
  v.literal(AMENITIES[13]),
  v.literal(AMENITIES[14]),
  v.literal(AMENITIES[15]),
);

const listingStatusValidator = v.union(
  v.literal(LISTING_STATUS.DRAFT),
  v.literal(LISTING_STATUS.PUBLISHED),
  v.literal(LISTING_STATUS.ARCHIVED),
);

const listPublishedSortValidator = v.union(v.literal("newest"), v.literal("freshness_first"));

const VALID_LISTING_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  [LISTING_STATUS.DRAFT]: [LISTING_STATUS.PUBLISHED],
  [LISTING_STATUS.PUBLISHED]: [LISTING_STATUS.DRAFT, LISTING_STATUS.ARCHIVED],
  [LISTING_STATUS.ARCHIVED]: [LISTING_STATUS.DRAFT],
};

type ListingDoc = Doc<"listings">;

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

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function assertIntegerMoney(value: number, fieldLabel: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldLabel} must be a whole number in paise.`);
  }

  if (value < 0) {
    throw new Error(`${fieldLabel} must be non-negative.`);
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function generateUniqueSlug(
  ctx: MutationCtx,
  buildingName: string,
  flatNumber: string,
  societyName: string,
  bhkConfig: ListingDoc["bhk_config"],
): Promise<string> {
  const baseSlug = slugify(`${buildingName}-${flatNumber}-${societyName}-${bhkConfig}`);

  if (!baseSlug) {
    throw new Error("Unable to generate listing slug");
  }

  let candidateSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("listings")
      .withIndex("by_slug", (q) => q.eq("slug", candidateSlug))
      .first();

    if (!existing) {
      return candidateSlug;
    }

    candidateSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function getListingContext(ctx: QueryCtx | MutationCtx, listing: ListingDoc) {
  const lead = await ctx.db.get(listing.lead_id);

  if (!lead) {
    return {
      lead: null,
      building: null,
      society: null,
    };
  }

  const building = await ctx.db.get(lead.building_id);
  const society = await ctx.db.get(lead.society_id);

  return {
    lead,
    building,
    society,
  };
}

async function progressOwnerLifecycleOnPublishedListing(
  ctx: MutationCtx,
  ownerId: Id<"owners">,
): Promise<void> {
  const owner = await ctx.db.get(ownerId);
  if (!owner || owner.is_deleted) {
    return;
  }

  if (owner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.PROSPECT) {
    await progressLifecycleStage(ctx, ownerId, OWNER_LIFECYCLE_STAGE.VERIFIED);
    await progressLifecycleStage(ctx, ownerId, OWNER_LIFECYCLE_STAGE.ACTIVE);
    return;
  }

  if (
    owner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.VERIFIED ||
    owner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.DORMANT
  ) {
    await progressLifecycleStage(ctx, ownerId, OWNER_LIFECYCLE_STAGE.ACTIVE);
  }
}

async function listBasePage(
  ctx: QueryCtx,
  status: ListingStatus | undefined,
  paginationOpts: { numItems: number; cursor: string | null },
) {
  if (status) {
    return await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .paginate(paginationOpts);
  }

  return await ctx.db.query("listings").order("desc").paginate(paginationOpts);
}

export const create = mutation({
  args: {
    lead_id: v.id("leads"),
    rent_monthly: v.number(),
    bhk_config: bhkConfigValidator,
    furnishing: furnishingValidator,
    floor_number: v.string(),
    available_from: v.number(),
    deposit: v.optional(v.number()),
    maintenance: v.optional(v.number()),
    carpet_area_sqft: v.optional(v.number()),
    description: v.optional(v.string()),
    house_rules: v.optional(v.array(v.string())),
    parking: v.optional(parkingValidator),
    pet_friendly: v.optional(v.boolean()),
    amenities: v.optional(v.array(amenityValidator)),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.LISTINGS_CREATE);

    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (lead.status !== LEAD_STATUS.VERIFIED) {
      throw new Error("Only VERIFIED leads can be converted to listings");
    }

    const ownerId = lead.owner_id;

    const existingListing = await ctx.db
      .query("listings")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .first();

    if (existingListing) {
      throw new Error("A listing already exists for this lead");
    }

    const [building, society] = await Promise.all([
      ctx.db.get(lead.building_id),
      ctx.db.get(lead.society_id),
    ]);

    if (!building) {
      throw new Error("Building not found");
    }

    if (!society) {
      throw new Error("Society not found");
    }

    assertIntegerMoney(args.rent_monthly, "Rent");

    if (args.deposit !== undefined) {
      assertIntegerMoney(args.deposit, "Deposit");
    }

    if (args.maintenance !== undefined) {
      assertIntegerMoney(args.maintenance, "Maintenance");
    }

    const listingId = await ctx.db.insert("listings", {
      lead_id: args.lead_id,
      owner_id: ownerId,
      slug: await generateUniqueSlug(
        ctx,
        building.name,
        lead.flat_number,
        society.name,
        args.bhk_config,
      ),
      status: LISTING_STATUS.DRAFT,
      rent_monthly: args.rent_monthly,
      deposit: args.deposit,
      maintenance: args.maintenance,
      bhk_config: args.bhk_config,
      furnishing: args.furnishing,
      floor_number: normalizeRequiredString(args.floor_number, "Floor number"),
      carpet_area_sqft: args.carpet_area_sqft,
      available_from: args.available_from,
      description: normalizeOptionalString(args.description),
      house_rules: args.house_rules,
      parking: args.parking,
      pet_friendly: args.pet_friendly,
      amenities: args.amenities,
      created_by_admin_id: admin._id,
    });

    return listingId;
  },
});

export const update = mutation({
  args: {
    listing_id: v.id("listings"),
    rent_monthly: v.optional(v.number()),
    deposit: v.optional(v.number()),
    maintenance: v.optional(v.number()),
    bhk_config: v.optional(bhkConfigValidator),
    furnishing: v.optional(furnishingValidator),
    floor_number: v.optional(v.string()),
    carpet_area_sqft: v.optional(v.number()),
    available_from: v.optional(v.number()),
    description: v.optional(v.string()),
    house_rules: v.optional(v.array(v.string())),
    parking: v.optional(parkingValidator),
    pet_friendly: v.optional(v.boolean()),
    amenities: v.optional(v.array(amenityValidator)),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const listing = await ctx.db.get(args.listing_id);

    if (!listing) {
      throw new Error("Listing not found");
    }

    const patch: Partial<
      Pick<
        ListingDoc,
        | "rent_monthly"
        | "deposit"
        | "maintenance"
        | "bhk_config"
        | "furnishing"
        | "floor_number"
        | "carpet_area_sqft"
        | "available_from"
        | "description"
        | "house_rules"
        | "parking"
        | "pet_friendly"
        | "amenities"
      >
    > = {};

    if (args.rent_monthly !== undefined) {
      assertIntegerMoney(args.rent_monthly, "Rent");
      patch.rent_monthly = args.rent_monthly;
    }

    if (args.deposit !== undefined) {
      assertIntegerMoney(args.deposit, "Deposit");
      patch.deposit = args.deposit;
    }

    if (args.maintenance !== undefined) {
      assertIntegerMoney(args.maintenance, "Maintenance");
      patch.maintenance = args.maintenance;
    }

    if (args.bhk_config !== undefined) {
      patch.bhk_config = args.bhk_config;
    }

    if (args.furnishing !== undefined) {
      patch.furnishing = args.furnishing;
    }

    if (args.floor_number !== undefined) {
      patch.floor_number = normalizeRequiredString(args.floor_number, "Floor number");
    }

    if (args.carpet_area_sqft !== undefined) {
      patch.carpet_area_sqft = args.carpet_area_sqft;
    }

    if (args.available_from !== undefined) {
      patch.available_from = args.available_from;
    }

    if (args.description !== undefined) {
      patch.description = normalizeOptionalString(args.description);
    }

    if (args.house_rules !== undefined) {
      patch.house_rules = args.house_rules;
    }

    if (args.parking !== undefined) {
      patch.parking = args.parking;
    }

    if (args.pet_friendly !== undefined) {
      patch.pet_friendly = args.pet_friendly;
    }

    if (args.amenities !== undefined) {
      patch.amenities = args.amenities;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(listing._id, patch);
    }

    return await ctx.db.get(listing._id);
  },
});

export const getById = query({
  args: {
    listing_id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_VIEW);

    const listing = await ctx.db.get(args.listing_id);

    if (!listing) {
      throw new Error("Listing not found");
    }

    const { lead, building, society } = await getListingContext(ctx, listing);

    const [photoCount, inquiryCount] = await Promise.all([
      ctx.db
        .query("listing_photos")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect()
        .then((photos) => photos.length),
      ctx.db
        .query("listing_inquiries")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
        .collect()
        .then((inquiries) => inquiries.length),
    ]);

    return {
      ...listing,
      lead: lead
        ? {
            lead_id: lead._id,
            status: lead.status,
            flat_number: lead.flat_number,
            floor_number: lead.floor_number,
            owner_name: lead.owner_name,
            owner_phone: lead.owner_phone,
          }
        : null,
      building: building
        ? {
            building_id: building._id,
            name: building.name,
          }
        : null,
      society: society
        ? {
            society_id: society._id,
            name: society.name,
            city: society.city,
          }
        : null,
      photo_count: photoCount,
      inquiry_count: inquiryCount,
    };
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(listingStatusValidator),
    society_id: v.optional(v.id("societies")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_VIEW);

    let paginatedResults: PaginationResult<ListingDoc>;

    if (!args.society_id) {
      paginatedResults = await listBasePage(ctx, args.status, args.paginationOpts);
    } else {
      const filteredListings: ListingDoc[] = [];
      let cursor = args.paginationOpts.cursor;
      let isDone = false;

      while (filteredListings.length < args.paginationOpts.numItems && !isDone) {
        const batch = await listBasePage(ctx, args.status, { numItems: 1, cursor });

        cursor = batch.continueCursor;
        isDone = batch.isDone;

        const listing = batch.page[0];

        if (!listing) {
          break;
        }

        const { society } = await getListingContext(ctx, listing);

        if (society?._id === args.society_id) {
          filteredListings.push(listing);
        }
      }

      paginatedResults = {
        page: filteredListings,
        isDone,
        continueCursor: cursor ?? "",
      };
    }

    const enrichedListings = await Promise.all(
      paginatedResults.page.map(async (listing) => {
        const { building, society } = await getListingContext(ctx, listing);

        return {
          ...listing,
          building_name: building?.name,
          society_name: society?.name,
        };
      }),
    );

    return {
      ...paginatedResults,
      page: enrichedListings,
    } as PaginationResult<(typeof enrichedListings)[number]>;
  },
});

export const publish = mutation({
  args: {
    listing_id: v.id("listings"),
    new_status: listingStatusValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_PUBLISH);

    const listing = await ctx.db.get(args.listing_id);

    if (!listing) {
      throw new Error("Listing not found");
    }

    const validNextStatuses = VALID_LISTING_TRANSITIONS[listing.status];

    if (!validNextStatuses.includes(args.new_status)) {
      throw new Error(`Cannot change listing status from ${listing.status} to ${args.new_status}`);
    }

    if (args.new_status === LISTING_STATUS.ARCHIVED && listing.status !== LISTING_STATUS.ARCHIVED) {
      const pendingClosure = await ctx.db
        .query("closures")
        .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.PENDING))
        .filter((q) => q.eq(q.field("listing_id"), listing._id))
        .first();

      if (pendingClosure) {
        throw new Error(
          "Cannot archive listing with pending closures. Cancel or confirm closures first.",
        );
      }
    }

    if (listing.status === LISTING_STATUS.DRAFT && args.new_status === LISTING_STATUS.PUBLISHED) {
      const hasActivePhoto = await ctx.db
        .query("listing_photos")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .first();

      if (!hasActivePhoto) {
        throw new Error("At least one photo is required to publish");
      }
    }

    await ctx.db.patch(args.listing_id, {
      status: args.new_status,
    });

    if (args.new_status === LISTING_STATUS.ARCHIVED && listing.status !== LISTING_STATUS.ARCHIVED) {
      const activeTransactions = await ctx.db
        .query("rental_transactions")
        .withIndex("by_listing", (q) => q.eq("listing_id", listing._id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect();

      for (const transaction of activeTransactions) {
        if (
          transaction.status === TRANSACTION_STATUS.CANCELLED ||
          transaction.status === TRANSACTION_STATUS.COMPLETED
        ) {
          continue;
        }

        await advanceTransactionStatusInternal(ctx, transaction._id, TRANSACTION_STATUS.CANCELLED, {
          cancellationReason: "LISTING_ARCHIVED",
        });
      }
    }

    if (listing.owner_id && listing.status !== args.new_status) {
      const shouldIncrement =
        listing.status !== LISTING_STATUS.PUBLISHED && args.new_status === LISTING_STATUS.PUBLISHED;
      const shouldDecrement =
        listing.status === LISTING_STATUS.PUBLISHED && args.new_status !== LISTING_STATUS.PUBLISHED;

      if (shouldIncrement || shouldDecrement) {
        const owner = await ctx.db.get(listing.owner_id);
        if (owner && !owner.is_deleted) {
          const now = Date.now();
          await ctx.db.patch(listing.owner_id, {
            active_properties_count: shouldIncrement
              ? owner.active_properties_count + 1
              : Math.max(0, owner.active_properties_count - 1),
            last_activity_at: now,
            updated_at: now,
          });

          if (shouldIncrement) {
            await progressOwnerLifecycleOnPublishedListing(ctx, listing.owner_id);
          }
        }
      }
    }

    if (
      listing.status !== LISTING_STATUS.PUBLISHED &&
      args.new_status === LISTING_STATUS.PUBLISHED
    ) {
      try {
        const lead = await ctx.db.get(listing.lead_id);
        const owner = lead?.owner_id ? await ctx.db.get(lead.owner_id) : null;
        const ownerUserId = owner?.user_id;

        if (lead) {
          if (ownerUserId) {
            const ownerReferral = await getLatestActiveReferralByType(
              ctx,
              ownerUserId,
              REFERRAL_TYPE.OWNER_FINDING,
            );

            if (ownerReferral) {
              const listingPublishedMilestone = await getReferralMilestoneByType(
                ctx,
                ownerReferral._id,
                REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
              );

              const canOverwriteListingLinkage =
                ownerReferral.listing_id === undefined ||
                !listingPublishedMilestone ||
                listingPublishedMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING;

              const patch: Partial<
                Pick<Doc<"referrals">, "lead_id" | "listing_id" | "building_id" | "society_id">
              > = {};

              if (
                ownerReferral.lead_id === undefined ||
                (canOverwriteListingLinkage && ownerReferral.lead_id !== lead._id)
              ) {
                patch.lead_id = lead._id;
              }

              if (canOverwriteListingLinkage && ownerReferral.listing_id !== listing._id) {
                patch.listing_id = listing._id;
              }

              if (
                ownerReferral.building_id === undefined ||
                (canOverwriteListingLinkage && ownerReferral.building_id !== lead.building_id)
              ) {
                patch.building_id = lead.building_id;
              }

              if (
                ownerReferral.society_id === undefined ||
                (canOverwriteListingLinkage && ownerReferral.society_id !== lead.society_id)
              ) {
                patch.society_id = lead.society_id;
              }

              if (Object.keys(patch).length > 0) {
                await ctx.db.patch(ownerReferral._id, patch);
              }

              if (
                listingPublishedMilestone &&
                listingPublishedMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING
              ) {
                const scopedConfig = await ctx.runQuery(internal.referralConfig.getForScope, {
                  referral_type: ownerReferral.referral_type,
                  building_id: lead.building_id,
                  society_id: lead.society_id,
                });

                const scopedAmount = calculateSplitAmount(
                  scopedConfig.finding_bonus_total,
                  scopedConfig.publish_split_pct,
                );

                if (listingPublishedMilestone.amount !== scopedAmount) {
                  await ctx.db.patch(listingPublishedMilestone._id, {
                    amount: scopedAmount,
                  });
                }
              }

              await ctx.runMutation(internal.referralMilestones.trigger, {
                referral_id: ownerReferral._id,
                milestone_type: REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
                source_event: `listing_published:${args.listing_id}`,
              });
            }
          }
        }
      } catch (error) {
        console.error("Referral milestone trigger error:", error);
      }
    }

    await ctx.scheduler.runAfter(0, internal.trustBadges.computeForListing, {
      listing_id: args.listing_id,
    });

    return await ctx.db.get(args.listing_id);
  },
});

export const submitInquiry = mutation({
  args: {
    listing_id: v.id("listings"),
    name: v.string(),
    phone: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.phone);

    await rateLimiter.limit(ctx, "public:listing_inquiry", {
      key: normalizedPhone,
      throws: true,
    });

    const listing = await ctx.db.get(args.listing_id);

    if (!listing || listing.status !== LISTING_STATUS.PUBLISHED) {
      throw new Error("Listing is not available for inquiries");
    }

    return await ctx.db.insert("listing_inquiries", {
      listing_id: args.listing_id,
      name: normalizeRequiredString(args.name, "Name"),
      phone: normalizedPhone,
      message: normalizeOptionalString(args.message),
      source: INQUIRY_SOURCE.CONTACT_FORM,
    });
  },
});

export const trackWhatsAppClick = mutation({
  args: {
    listing_id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "public:whatsapp_click", {
      key: `${args.listing_id}`,
      throws: true,
    });

    const listing = await ctx.db.get(args.listing_id);

    if (!listing) {
      throw new Error("Listing not found");
    }

    return await ctx.db.insert("listing_inquiries", {
      listing_id: args.listing_id,
      name: "WhatsApp Click",
      phone: "0000000000",
      source: INQUIRY_SOURCE.WHATSAPP_CLICK,
    });
  },
});

export const getBySlugInternal = internalQuery({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedSlug = slugify(args.slug);

    if (!normalizedSlug) {
      return null;
    }

    const listing = await ctx.db
      .query("listings")
      .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
      .first();

    if (!listing || listing.status === LISTING_STATUS.DRAFT) {
      return null;
    }

    const { lead, building, society } = await getListingContext(ctx, listing);

    if (!lead || !building || !society) {
      return null;
    }

    const photos = await ctx.db
      .query("listing_photos")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const orderedPhotoStorageIds = photos
      .sort((a, b) => a.display_order - b.display_order)
      .map((photo) => photo.storage_id);

    return {
      _id: listing._id,
      slug: listing.slug,
      status: listing.status,
      rent_monthly: listing.rent_monthly,
      deposit: listing.deposit,
      maintenance: listing.maintenance,
      bhk_config: listing.bhk_config,
      furnishing: listing.furnishing,
      floor_number: listing.floor_number,
      carpet_area_sqft: listing.carpet_area_sqft,
      available_from: listing.available_from,
      description: listing.description,
      parking: listing.parking,
      pet_friendly: listing.pet_friendly,
      amenities: listing.amenities,
      photos: orderedPhotoStorageIds,
      building_name: building.name,
      society_name: society.name,
      flat_number: lead.flat_number,
    };
  },
});

export const getBySlugPublic = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedSlug = slugify(args.slug);

    if (!normalizedSlug) {
      return null;
    }

    const listing = await ctx.db
      .query("listings")
      .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
      .first();

    if (!listing || listing.status !== LISTING_STATUS.PUBLISHED) {
      return null;
    }

    const { lead, building, society } = await getListingContext(ctx, listing);

    if (!lead || !building || !society) {
      return null;
    }

    const [photos, roommateProfiles, commuteLandmarks, inquiryCount, trustRow] = await Promise.all([
      ctx.db
        .query("listing_photos")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db
        .query("listing_roommate_profiles")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id).eq("is_deleted", false))
        .collect(),
      ctx.db
        .query("listing_commute_landmarks")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id).eq("is_deleted", false))
        .collect(),
      ctx.db
        .query("listing_inquiries")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
        .collect()
        .then((inquiries) => inquiries.length),
      ctx.db
        .query("listing_trust_badges")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
        .unique(),
    ]);

    const photosWithUrls = await Promise.all(
      photos
        .sort((a, b) => a.display_order - b.display_order)
        .map(async (photo) => ({
          ...photo,
          url: await ctx.storage.getUrl(photo.storage_id),
        })),
    );

    return {
      listing: {
        _id: listing._id,
        slug: listing.slug,
        status: listing.status,
        rent_monthly: listing.rent_monthly,
        deposit: listing.deposit,
        maintenance: listing.maintenance,
        bhk_config: listing.bhk_config,
        furnishing: listing.furnishing,
        floor_number: listing.floor_number,
        carpet_area_sqft: listing.carpet_area_sqft,
        available_from: listing.available_from,
        description: listing.description,
        house_rules: listing.house_rules,
        parking: listing.parking,
        pet_friendly: listing.pet_friendly,
        amenities: listing.amenities,
        building_name: building.name,
        society_name: society.name,
        city: society.city,
        locality: society.city,
        flat_number: lead.flat_number,
      },
      photos: photosWithUrls,
      roommate_profiles: roommateProfiles,
      commute_landmarks: commuteLandmarks,
      inquiry_count: inquiryCount,
      trust:
        trustRow && !trustRow.is_deleted
          ? {
              badges: trustRow.badges,
              freshness_score: trustRow.freshness_score,
              freshness_state: trustRow.freshness_state,
              last_activity_at: trustRow.last_activity_at,
              last_computed_at: trustRow.last_computed_at,
              evidence: trustRow.evidence,
            }
          : null,
    };
  },
});

export const addRoommateProfile = mutation({
  args: {
    listing_id: v.id("listings"),
    name_alias: v.string(),
    age_range: v.optional(v.string()),
    gender: v.optional(v.string()),
    profession: v.optional(v.string()),
    lifestyle_tags: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    move_in_date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const listing = await ctx.db.get(args.listing_id);

    if (!listing) {
      throw new Error("Listing not found");
    }

    return await ctx.db.insert("listing_roommate_profiles", {
      listing_id: args.listing_id,
      name_alias: normalizeRequiredString(args.name_alias, "Name alias"),
      age_range: normalizeOptionalString(args.age_range),
      gender: normalizeOptionalString(args.gender),
      profession: normalizeOptionalString(args.profession),
      lifestyle_tags: args.lifestyle_tags?.map((tag) =>
        normalizeRequiredString(tag, "Lifestyle tag"),
      ),
      bio: normalizeOptionalString(args.bio),
      move_in_date: args.move_in_date,
      is_deleted: false,
    });
  },
});

export const updateRoommateProfile = mutation({
  args: {
    id: v.id("listing_roommate_profiles"),
    name_alias: v.optional(v.string()),
    age_range: v.optional(v.string()),
    gender: v.optional(v.string()),
    profession: v.optional(v.string()),
    lifestyle_tags: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    move_in_date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const roommateProfile = await ctx.db.get(args.id);

    if (!roommateProfile) {
      throw new Error("Roommate profile not found");
    }

    if (roommateProfile.is_deleted) {
      throw new Error("Roommate profile not found");
    }

    const patch: Partial<
      Pick<
        Doc<"listing_roommate_profiles">,
        | "name_alias"
        | "age_range"
        | "gender"
        | "profession"
        | "lifestyle_tags"
        | "bio"
        | "move_in_date"
      >
    > = {};

    if (args.name_alias !== undefined) {
      patch.name_alias = normalizeRequiredString(args.name_alias, "Name alias");
    }

    if (args.age_range !== undefined) {
      patch.age_range = normalizeOptionalString(args.age_range);
    }

    if (args.gender !== undefined) {
      patch.gender = normalizeOptionalString(args.gender);
    }

    if (args.profession !== undefined) {
      patch.profession = normalizeOptionalString(args.profession);
    }

    if (args.lifestyle_tags !== undefined) {
      patch.lifestyle_tags = args.lifestyle_tags.map((tag) =>
        normalizeRequiredString(tag, "Lifestyle tag"),
      );
    }

    if (args.bio !== undefined) {
      patch.bio = normalizeOptionalString(args.bio);
    }

    if (args.move_in_date !== undefined) {
      patch.move_in_date = args.move_in_date;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(roommateProfile._id, patch);
    }

    return await ctx.db.get(roommateProfile._id);
  },
});

export const removeRoommateProfile = mutation({
  args: {
    id: v.id("listing_roommate_profiles"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const roommateProfile = await ctx.db.get(args.id);

    if (!roommateProfile) {
      throw new Error("Roommate profile not found");
    }

    await ctx.db.patch(roommateProfile._id, { is_deleted: true });
  },
});

export const addCommuteLandmark = mutation({
  args: {
    listing_id: v.id("listings"),
    name: v.string(),
    category: v.string(),
    distance_km: v.number(),
    time_minutes: v.optional(v.number()),
    transport_mode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const listing = await ctx.db.get(args.listing_id);

    if (!listing) {
      throw new Error("Listing not found");
    }

    return await ctx.db.insert("listing_commute_landmarks", {
      listing_id: args.listing_id,
      name: normalizeRequiredString(args.name, "Name"),
      category: normalizeRequiredString(args.category, "Category"),
      distance_km: args.distance_km,
      time_minutes: args.time_minutes,
      transport_mode: normalizeOptionalString(args.transport_mode),
      is_deleted: false,
    });
  },
});

export const updateCommuteLandmark = mutation({
  args: {
    id: v.id("listing_commute_landmarks"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    distance_km: v.optional(v.number()),
    time_minutes: v.optional(v.number()),
    transport_mode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const commuteLandmark = await ctx.db.get(args.id);

    if (!commuteLandmark) {
      throw new Error("Commute landmark not found");
    }

    if (commuteLandmark.is_deleted) {
      throw new Error("Commute landmark not found");
    }

    const patch: Partial<
      Pick<
        Doc<"listing_commute_landmarks">,
        "name" | "category" | "distance_km" | "time_minutes" | "transport_mode"
      >
    > = {};

    if (args.name !== undefined) {
      patch.name = normalizeRequiredString(args.name, "Name");
    }

    if (args.category !== undefined) {
      patch.category = normalizeRequiredString(args.category, "Category");
    }

    if (args.distance_km !== undefined) {
      patch.distance_km = args.distance_km;
    }

    if (args.time_minutes !== undefined) {
      patch.time_minutes = args.time_minutes;
    }

    if (args.transport_mode !== undefined) {
      patch.transport_mode = normalizeOptionalString(args.transport_mode);
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(commuteLandmark._id, patch);
    }

    return await ctx.db.get(commuteLandmark._id);
  },
});

export const removeCommuteLandmark = mutation({
  args: {
    id: v.id("listing_commute_landmarks"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const commuteLandmark = await ctx.db.get(args.id);

    if (!commuteLandmark) {
      throw new Error("Commute landmark not found");
    }

    await ctx.db.patch(commuteLandmark._id, { is_deleted: true });
  },
});

export const getInquiries = query({
  args: {
    listing_id: v.id("listings"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_VIEW_INQUIRIES);

    const paginatedInquiries = await ctx.db
      .query("listing_inquiries")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...paginatedInquiries,
      page: paginatedInquiries.page.map((inquiry) => ({
        name: inquiry.name,
        phone: inquiry.phone,
        message: inquiry.message,
        source: inquiry.source,
        _creationTime: inquiry._creationTime,
      })),
    };
  },
});

const MAX_LISTING_PHOTOS = 10;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addPhoto = mutation({
  args: {
    listing_id: v.id("listings"),
    storage_id: v.id("_storage"),
    display_order: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const listing = await ctx.db.get(args.listing_id);

    if (!listing) {
      throw new Error("Listing not found");
    }

    const activePhotoCount = await ctx.db
      .query("listing_photos")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect()
      .then((photos) => photos.length);

    if (activePhotoCount >= MAX_LISTING_PHOTOS) {
      throw new Error("Maximum 10 photos per listing");
    }

    const metadata = await ctx.db.system.get("_storage", args.storage_id);

    if (!metadata) {
      throw new Error("File not found in storage");
    }

    const contentType = metadata.contentType ?? "";

    if (!contentType.startsWith("image/")) {
      throw new Error("Only image files are allowed");
    }

    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new Error("Only JPEG, PNG, and WebP images are allowed");
    }

    if (metadata.size > MAX_PHOTO_SIZE_BYTES) {
      throw new Error("File too large. Maximum size is 10MB");
    }

    const photoId = await ctx.db.insert("listing_photos", {
      listing_id: args.listing_id,
      storage_id: args.storage_id,
      display_order: args.display_order,
      is_deleted: false,
    });

    await ctx.scheduler.runAfter(0, internal.trustBadges.computeForListing, {
      listing_id: args.listing_id,
    });

    return photoId;
  },
});

export const removePhoto = mutation({
  args: {
    photo_id: v.id("listing_photos"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const photo = await ctx.db.get(args.photo_id);

    if (!photo) {
      throw new Error("Photo not found");
    }

    await ctx.db.patch(photo._id, { is_deleted: true });

    await ctx.scheduler.runAfter(0, internal.trustBadges.computeForListing, {
      listing_id: photo.listing_id,
    });
  },
});

export const reorderPhotos = mutation({
  args: {
    listing_id: v.id("listings"),
    photo_ids: v.array(v.id("listing_photos")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT);

    const photos = await Promise.all(
      args.photo_ids.map(async (photoId) => {
        const photo = await ctx.db.get(photoId);

        if (!photo) {
          throw new Error(`Photo not found: ${photoId}`);
        }

        if (photo.listing_id !== args.listing_id) {
          throw new Error("Photo does not belong to the provided listing");
        }

        if (photo.is_deleted === true) {
          throw new Error("Cannot reorder deleted photo");
        }

        return photo;
      }),
    );

    await Promise.all(
      photos.map((photo, index) =>
        ctx.db.patch(photo._id, {
          display_order: index,
        }),
      ),
    );
  },
});

export const getPhotosForListing = query({
  args: {
    listing_id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LISTINGS_VIEW);

    const photos = await ctx.db
      .query("listing_photos")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const orderedPhotos = photos.sort((a, b) => a.display_order - b.display_order);

    return await Promise.all(
      orderedPhotos.map(async (photo) => ({
        _id: photo._id,
        storage_id: photo.storage_id,
        display_order: photo.display_order,
        url: await ctx.storage.getUrl(photo.storage_id),
      })),
    );
  },
});

export const listFeatured = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // SECURITY: Public query — consider adding rate limiting for scraping protection in production.
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 9), 20));

    const listings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", LISTING_STATUS.PUBLISHED))
      .order("desc")
      .take(limit);

    const enriched = await Promise.all(
      listings.map(async (listing) => {
        const lead = await ctx.db.get(listing.lead_id);
        const building = lead?.building_id ? await ctx.db.get(lead.building_id) : null;
        const society = building?.society_id ? await ctx.db.get(building.society_id) : null;

        const photos = await ctx.db
          .query("listing_photos")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .collect();

        const sortedPhotos = photos.sort((a, b) => a.display_order - b.display_order);
        const firstPhotoUrl = sortedPhotos[0]?.storage_id
          ? await ctx.storage.getUrl(sortedPhotos[0].storage_id)
          : null;

        return {
          _id: listing._id,
          slug: listing.slug,
          bhk_config: listing.bhk_config,
          rent_monthly: listing.rent_monthly,
          deposit: listing.deposit,
          furnished_status: listing.furnishing,
          available_from: listing.available_from,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
          city: society?.city ?? null,
          first_photo_url: firstPhotoUrl,
          _creationTime: listing._creationTime,
        };
      }),
    );

    return enriched;
  },
});

export const listPublished = query({
  args: {
    sort_by: v.optional(listPublishedSortValidator),
  },
  handler: async (ctx, args) => {
    // NO auth check — public query
    // SECURITY: Public query — consider adding rate limiting for scraping protection in production.
    const sortBy = args.sort_by ?? "newest";

    const listings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", LISTING_STATUS.PUBLISHED))
      .order("desc")
      .take(500); // Safety cap for V1

    const enriched = await Promise.all(
      listings.map(async (listing) => {
        const [lead, photos, trustRow] = await Promise.all([
          ctx.db.get(listing.lead_id),
          ctx.db
            .query("listing_photos")
            .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
            .filter((q) => q.neq(q.field("is_deleted"), true))
            .collect(),
          ctx.db
            .query("listing_trust_badges")
            .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
            .unique(),
        ]);

        const [building, society] = await Promise.all([
          lead?.building_id ? ctx.db.get(lead.building_id) : Promise.resolve(null),
          lead?.society_id ? ctx.db.get(lead.society_id) : Promise.resolve(null),
        ]);

        const sortedPhotos = photos.sort((a, b) => a.display_order - b.display_order);
        const firstPhotoUrl = sortedPhotos[0]?.storage_id
          ? await ctx.storage.getUrl(sortedPhotos[0].storage_id)
          : null;

        return {
          _id: listing._id,
          slug: listing.slug,
          bhk_config: listing.bhk_config,
          rent_monthly: listing.rent_monthly,
          deposit: listing.deposit,
          maintenance: listing.maintenance,
          furnishing: listing.furnishing,
          floor_number: listing.floor_number,
          carpet_area_sqft: listing.carpet_area_sqft,
          available_from: listing.available_from,
          description: listing.description,
          parking: listing.parking,
          pet_friendly: listing.pet_friendly,
          amenities: listing.amenities,
          // Enriched from related tables
          flat_number: lead?.flat_number ?? null,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
          city: society?.city ?? null,
          first_photo_url: firstPhotoUrl,
          trust:
            trustRow && !trustRow.is_deleted
              ? {
                  badges: trustRow.badges,
                  freshness_score: trustRow.freshness_score,
                  freshness_state: trustRow.freshness_state,
                  last_activity_at: trustRow.last_activity_at,
                  evidence: trustRow.evidence,
                }
              : null,
          _creationTime: listing._creationTime,
        };
      }),
    );

    if (sortBy === "freshness_first") {
      return enriched.sort((left, right) => {
        const leftScore = left.trust?.freshness_score ?? 0;
        const rightScore = right.trust?.freshness_score ?? 0;

        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return right._creationTime - left._creationTime;
      });
    }

    return enriched;
  },
});

export const getInquiryCountPublic = query({
  args: { listing_id: v.id("listings") },
  handler: async (ctx, args) => {
    // SECURITY: Public query — consider adding rate limiting for scraping protection in production.
    const inquiries = await ctx.db
      .query("listing_inquiries")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
      .filter((q) => q.eq(q.field("source"), INQUIRY_SOURCE.CONTACT_FORM))
      .collect();
    return inquiries.length;
  },
});

export const getSimilarListings = query({
  args: {
    listing_id: v.id("listings"),
    bhk_config: v.string(),
    society_name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const published = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", LISTING_STATUS.PUBLISHED))
      .order("desc")
      .take(24);

    const candidates = published.filter((l) => l._id !== args.listing_id);

    const enriched = await Promise.all(
      candidates.map(async (listing) => {
        const lead = await ctx.db.get(listing.lead_id);
        const building = lead?.building_id ? await ctx.db.get(lead.building_id) : null;
        const society = building?.society_id ? await ctx.db.get(building.society_id) : null;

        const photos = await ctx.db
          .query("listing_photos")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .collect();
        const sortedPhotos = photos.sort((a, b) => a.display_order - b.display_order);
        const firstPhotoUrl = sortedPhotos[0]?.storage_id
          ? await ctx.storage.getUrl(sortedPhotos[0].storage_id)
          : null;

        return {
          _id: listing._id,
          slug: listing.slug,
          bhk_config: listing.bhk_config,
          rent_monthly: listing.rent_monthly,
          furnishing: listing.furnishing,
          floor_number: listing.floor_number,
          flat_number: lead?.flat_number ?? null,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
          city: society?.city ?? null,
          first_photo_url: firstPhotoUrl,
          _isSameSociety: (society?.name ?? "") === (args.society_name ?? ""),
          _isSameBhk: listing.bhk_config === args.bhk_config,
        };
      }),
    );

    return enriched
      .sort((a, b) => {
        if (a._isSameSociety && !b._isSameSociety) return -1;
        if (!a._isSameSociety && b._isSameSociety) return 1;
        if (a._isSameBhk && !b._isSameBhk) return -1;
        if (!a._isSameBhk && b._isSameBhk) return 1;
        return 0;
      })
      .slice(0, 6);
  },
});
