import { v } from "convex/values";
import { LISTING_STATUS } from "../lib/constants";
import { requireTenant } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";

function isListingDeleted(listing: Doc<"listings">): boolean {
  return Reflect.get(listing, "is_deleted") === true;
}

async function getFavoriteListingDetails(ctx: QueryCtx | MutationCtx, listingId: Id<"listings">) {
  const listing = await ctx.db.get(listingId);
  if (!listing) {
    return null;
  }

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
    status: listing.status,
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
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireTenant(ctx);

    const favorites = await ctx.db
      .query("tenant_favorites")
      .withIndex("by_tenant", (q) => q.eq("tenant_user_id", tenant._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .collect();

    const enrichedFavorites = await Promise.all(
      favorites.map(async (favorite) => {
        const listing = await getFavoriteListingDetails(ctx, favorite.listing_id);
        if (!listing) {
          return null;
        }

        return {
          favorite_id: favorite._id,
          tenant_user_id: favorite.tenant_user_id,
          listing_id: favorite.listing_id,
          created_at: favorite.created_at,
          listing,
        };
      }),
    );

    return enrichedFavorites.filter(
      (favorite): favorite is NonNullable<(typeof enrichedFavorites)[number]> => favorite !== null,
    );
  },
});

export const add = mutation({
  args: {
    listing_id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    const listing = await ctx.db.get(args.listing_id);
    if (!listing) {
      throw new Error("Listing not found");
    }

    if (listing.status !== LISTING_STATUS.PUBLISHED || isListingDeleted(listing)) {
      throw new Error("Only published listings can be favorited");
    }

    const existing = await ctx.db
      .query("tenant_favorites")
      .withIndex("by_tenant_and_listing", (q) =>
        q.eq("tenant_user_id", tenant._id).eq("listing_id", args.listing_id),
      )
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    if (existing) {
      return {
        favorite_id: existing._id,
        listing_id: existing.listing_id,
        created_at: existing.created_at,
        already_favorited: true,
      };
    }

    const createdAt = Date.now();

    const favoriteId = await ctx.db.insert("tenant_favorites", {
      tenant_user_id: tenant._id,
      listing_id: args.listing_id,
      created_at: createdAt,
      is_deleted: false,
    });

    await ctx.db.insert("audit_logs", {
      actor_user_id: tenant._id,
      actor_type: "TENANT",
      action: "TENANT_FAVORITE_ADD",
      entity_type: "tenant_favorites",
      entity_id: String(favoriteId),
      changes: undefined,
      metadata: {
        tenantId: String(tenant._id),
        listingId: String(args.listing_id),
      },
    });

    return {
      favorite_id: favoriteId,
      listing_id: args.listing_id,
      created_at: createdAt,
      already_favorited: false,
    };
  },
});

export const remove = mutation({
  args: {
    listing_id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    const favorites = await ctx.db
      .query("tenant_favorites")
      .withIndex("by_tenant_and_listing", (q) =>
        q.eq("tenant_user_id", tenant._id).eq("listing_id", args.listing_id),
      )
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    if (favorites.length === 0) {
      return { removed_count: 0 };
    }

    for (const favorite of favorites) {
      await ctx.db.patch(favorite._id, {
        is_deleted: true,
      });
    }

    await ctx.db.insert("audit_logs", {
      actor_user_id: tenant._id,
      actor_type: "TENANT",
      action: "TENANT_FAVORITE_REMOVE",
      entity_type: "tenant_favorites",
      entity_id: String(args.listing_id),
      changes: undefined,
      metadata: {
        tenantId: String(tenant._id),
        listingId: String(args.listing_id),
        removedCount: favorites.length,
      },
    });

    return { removed_count: favorites.length };
  },
});

export const importFromLocalStorage = mutation({
  args: {
    listing_ids: v.array(v.id("listings")),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    const existingFavorites = await ctx.db
      .query("tenant_favorites")
      .withIndex("by_tenant", (q) => q.eq("tenant_user_id", tenant._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const existingListingIds = new Set(
      existingFavorites.map((favorite) => String(favorite.listing_id)),
    );

    const tenantProfile = await ctx.db
      .query("tenant_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", tenant._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .unique();

    const migrationListingIds =
      existingFavorites.length === 0 ? (tenantProfile?.saved_listings ?? []) : [];

    const candidateListingIds = [...migrationListingIds, ...args.listing_ids];
    const seenListingIds = new Set<string>();

    let importedCount = 0;
    let skippedCount = 0;

    for (const listingId of candidateListingIds) {
      const key = String(listingId);

      if (seenListingIds.has(key)) {
        skippedCount += 1;
        continue;
      }

      seenListingIds.add(key);

      if (existingListingIds.has(key)) {
        skippedCount += 1;
        continue;
      }

      const listing = await ctx.db.get(listingId);
      if (!listing || listing.status !== LISTING_STATUS.PUBLISHED || isListingDeleted(listing)) {
        skippedCount += 1;
        continue;
      }

      await ctx.db.insert("tenant_favorites", {
        tenant_user_id: tenant._id,
        listing_id: listingId,
        created_at: Date.now(),
        is_deleted: false,
      });

      existingListingIds.add(key);
      importedCount += 1;
    }

    return {
      imported_count: importedCount,
      skipped_count: skippedCount,
    };
  },
});
