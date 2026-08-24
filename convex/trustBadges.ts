import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  CLOSURE_STATUS,
  FRESHNESS_STATE,
  LISTING_STATUS,
  PERMISSIONS,
  SYSTEM_CONFIG_KEYS,
  SYSTEM_CONFIG_DEFAULTS,
  TRUST_BADGE_CONFIG,
  TRUST_BADGE_TYPE,
  VISIT_STATUS,
} from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, query } from "./functions";
import { getSystemConfigNumber } from "./systemConfig.helpers";

const freshnessStateValidator = v.union(
  v.literal(FRESHNESS_STATE.FRESH),
  v.literal(FRESHNESS_STATE.AGING),
  v.literal(FRESHNESS_STATE.STALE),
);

const badgeTypeByPriority = Object.entries(TRUST_BADGE_CONFIG)
  .sort(([, left], [, right]) => left.priority - right.priority)
  .map(([type]) => type as keyof typeof TRUST_BADGE_CONFIG);

function toUnixMs(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

function maxOrUndefined(values: Array<number | undefined>): number | undefined {
  const presentValues = values.filter((value): value is number => value !== undefined);
  if (presentValues.length === 0) {
    return undefined;
  }

  return Math.max(...presentValues);
}

function calculateFreshnessScore(
  listingCreatedAt: number,
  lastActivityAt: number,
  freshnessThresholdDays: number,
): number {
  const reference = Math.max(listingCreatedAt, lastActivityAt);
  const daysSince = (Date.now() - reference) / (1000 * 60 * 60 * 24);

  if (daysSince <= freshnessThresholdDays) {
    return 75 + Math.round((1 - daysSince / freshnessThresholdDays) * 25);
  }

  if (daysSince <= 2 * freshnessThresholdDays) {
    return (
      25 + Math.round((1 - (daysSince - freshnessThresholdDays) / freshnessThresholdDays) * 49)
    );
  }

  return Math.max(
    0,
    24 - Math.round(((daysSince - 2 * freshnessThresholdDays) / freshnessThresholdDays) * 24),
  );
}

function getFreshnessState(score: number): Doc<"listing_trust_badges">["freshness_state"] {
  if (score >= 75) {
    return FRESHNESS_STATE.FRESH;
  }

  if (score >= 25) {
    return FRESHNESS_STATE.AGING;
  }

  return FRESHNESS_STATE.STALE;
}

async function getConfirmedClosureStatsForBuilding(
  ctx: MutationCtx,
  buildingId: Id<"buildings">,
): Promise<{ count: number; latestAt: number | undefined }> {
  const leadsInBuilding = await ctx.db
    .query("leads")
    .withIndex("by_building_id", (q) => q.eq("building_id", buildingId))
    .collect();

  if (leadsInBuilding.length === 0) {
    return { count: 0, latestAt: undefined };
  }

  const closuresByLead = await Promise.all(
    leadsInBuilding.map(async (lead) => {
      return await ctx.db
        .query("closures")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .filter((q) => q.eq(q.field("status"), CLOSURE_STATUS.CONFIRMED))
        .collect();
    }),
  );

  const confirmedClosures = closuresByLead.flat();
  const latestAt = maxOrUndefined(
    confirmedClosures.map((closure) => toUnixMs(closure.confirmed_at, closure._creationTime)),
  );

  return {
    count: confirmedClosures.length,
    latestAt,
  };
}

async function getConfirmedClosureStatsByBuilding(
  ctx: MutationCtx,
  buildingIds: Id<"buildings">[],
): Promise<Map<Id<"buildings">, { count: number; latestAt: number | undefined }>> {
  const uniqueBuildingIds = Array.from(new Set(buildingIds));
  const entries = await Promise.all(
    uniqueBuildingIds.map(async (buildingId) => {
      const stats = await getConfirmedClosureStatsForBuilding(ctx, buildingId);
      return [buildingId, stats] as const;
    }),
  );

  return new Map(entries);
}

async function computeTrustForListing(
  ctx: MutationCtx,
  listing: Doc<"listings">,
  freshnessThresholdDays: number,
  minPhotos: number,
  options?: {
    lead?: Doc<"leads"> | null;
    closureStatsByBuilding?: Map<Id<"buildings">, { count: number; latestAt: number | undefined }>;
  },
): Promise<{
  badges: Doc<"listing_trust_badges">["badges"];
  freshness_score: number;
  freshness_state: Doc<"listing_trust_badges">["freshness_state"];
  last_activity_at: number | undefined;
  evidence: Doc<"listing_trust_badges">["evidence"];
}> {
  const [resolvedLead, verificationAttempts, completedVisits, activePhotos] = await Promise.all([
    options?.lead !== undefined ? Promise.resolve(options.lead) : ctx.db.get(listing.lead_id),
    ctx.db
      .query("owner_verifications")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", listing.lead_id))
      .order("desc")
      .collect(),
    ctx.db
      .query("visits")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", listing.lead_id))
      .filter((q) => q.eq(q.field("status"), VISIT_STATUS.COMPLETED))
      .collect(),
    ctx.db
      .query("listing_photos")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect(),
  ]);

  const ownerVerifiedRecord = verificationAttempts.find(
    (attempt) => attempt.call_outcome === "VERIFIED",
  );
  const ownerVerifiedAt = ownerVerifiedRecord?.verified_at;

  const completedVisitCount = completedVisits.length;
  const completedVisitLatestAt = maxOrUndefined(
    completedVisits.map((visit) => toUnixMs(visit.completed_at, visit._creationTime)),
  );
  const inspectedVisits = completedVisits.filter(
    (visit) => visit.checklist_instance_id !== undefined,
  );
  const inspectedVisitCount = inspectedVisits.length;
  const inspectedVisitLatestAt = maxOrUndefined(
    inspectedVisits.map((visit) => toUnixMs(visit.completed_at, visit._creationTime)),
  );

  const photoCount = activePhotos.length;
  const latestPhotoAt = maxOrUndefined(activePhotos.map((photo) => photo._creationTime));

  const closureStats =
    resolvedLead === null
      ? { count: 0, latestAt: undefined }
      : (options?.closureStatsByBuilding?.get(resolvedLead.building_id) ??
        (await getConfirmedClosureStatsForBuilding(ctx, resolvedLead.building_id)));

  const lastActivityAt = maxOrUndefined([
    ownerVerifiedAt,
    completedVisitLatestAt,
    latestPhotoAt,
    closureStats.latestAt,
  ]);

  const effectiveLastActivity = Math.max(
    listing._creationTime,
    lastActivityAt ?? listing._creationTime,
  );
  const freshnessScore = calculateFreshnessScore(
    listing._creationTime,
    effectiveLastActivity,
    freshnessThresholdDays,
  );
  const freshnessState = getFreshnessState(freshnessScore);

  const badgeByType: Record<
    keyof typeof TRUST_BADGE_CONFIG,
    Doc<"listing_trust_badges">["badges"][number]
  > = {
    OWNER_VERIFIED: {
      type: TRUST_BADGE_TYPE.OWNER_VERIFIED,
      earned: ownerVerifiedRecord !== undefined,
      timestamp: ownerVerifiedAt,
    },
    PHYSICALLY_INSPECTED: {
      type: TRUST_BADGE_TYPE.PHYSICALLY_INSPECTED,
      earned: inspectedVisitCount > 0,
      timestamp: inspectedVisitLatestAt,
      count: inspectedVisitCount,
    },
    FRESH_LISTING: {
      type: TRUST_BADGE_TYPE.FRESH_LISTING,
      earned: freshnessScore >= 75,
      timestamp: effectiveLastActivity,
      count: freshnessScore,
    },
    REAL_PHOTOS: {
      type: TRUST_BADGE_TYPE.REAL_PHOTOS,
      earned: photoCount >= minPhotos,
      timestamp: latestPhotoAt,
      count: photoCount,
    },
    VISITS_COMPLETED: {
      type: TRUST_BADGE_TYPE.VISITS_COMPLETED,
      earned: completedVisitCount > 0,
      timestamp: completedVisitLatestAt,
      count: completedVisitCount,
    },
    CLOSURE_HISTORY: {
      type: TRUST_BADGE_TYPE.CLOSURE_HISTORY,
      earned: closureStats.count > 0,
      timestamp: closureStats.latestAt,
      count: closureStats.count,
    },
  };

  const badges = badgeTypeByPriority.map((type) => badgeByType[type]);

  return {
    badges,
    freshness_score: freshnessScore,
    freshness_state: freshnessState,
    last_activity_at: lastActivityAt,
    evidence: {
      photo_count: photoCount,
      visit_count: completedVisitCount,
      has_closure: closureStats.count > 0,
    },
  };
}

async function upsertTrustRow(
  ctx: MutationCtx,
  listingId: Id<"listings">,
  payload: Omit<Doc<"listing_trust_badges">, "_id" | "_creationTime" | "listing_id">,
): Promise<Id<"listing_trust_badges">> {
  const existing = await ctx.db
    .query("listing_trust_badges")
    .withIndex("by_listing_id", (q) => q.eq("listing_id", listingId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }

  return await ctx.db.insert("listing_trust_badges", {
    listing_id: listingId,
    ...payload,
  });
}

export const computeForListing = internalMutation({
  args: {
    listing_id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const listing = await ctx.db.get(args.listing_id);

    if (!listing || listing.status !== LISTING_STATUS.PUBLISHED) {
      const existing = await ctx.db
        .query("listing_trust_badges")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          is_deleted: true,
          last_computed_at: now,
        });
      }

      return null;
    }

    const [freshnessThresholdDays, minPhotos] = await Promise.all([
      getSystemConfigNumber(
        ctx,
        SYSTEM_CONFIG_KEYS.TRUST_BADGE_FRESHNESS_THRESHOLD_DAYS,
        Number.parseInt(
          SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.TRUST_BADGE_FRESHNESS_THRESHOLD_DAYS],
          10,
        ),
      ),
      getSystemConfigNumber(
        ctx,
        SYSTEM_CONFIG_KEYS.TRUST_BADGE_MIN_PHOTOS,
        Number.parseInt(SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.TRUST_BADGE_MIN_PHOTOS], 10),
      ),
    ]);

    const computed = await computeTrustForListing(ctx, listing, freshnessThresholdDays, minPhotos);

    return await upsertTrustRow(ctx, listing._id, {
      badges: computed.badges,
      freshness_score: computed.freshness_score,
      freshness_state: computed.freshness_state,
      last_activity_at: computed.last_activity_at,
      last_computed_at: now,
      evidence: computed.evidence,
      is_deleted: false,
    });
  },
});

export const recomputeFreshness = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [freshnessThresholdDays, minPhotos] = await Promise.all([
      getSystemConfigNumber(
        ctx,
        SYSTEM_CONFIG_KEYS.TRUST_BADGE_FRESHNESS_THRESHOLD_DAYS,
        Number.parseInt(
          SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.TRUST_BADGE_FRESHNESS_THRESHOLD_DAYS],
          10,
        ),
      ),
      getSystemConfigNumber(
        ctx,
        SYSTEM_CONFIG_KEYS.TRUST_BADGE_MIN_PHOTOS,
        Number.parseInt(SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.TRUST_BADGE_MIN_PHOTOS], 10),
      ),
    ]);

    const now = Date.now();
    const result = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", LISTING_STATUS.PUBLISHED))
      .paginate({ numItems: 50, cursor: args.cursor ?? null });

    const listingAndLeads = await Promise.all(
      result.page.map(async (listing) => ({
        listing,
        lead: await ctx.db.get(listing.lead_id),
      })),
    );

    const buildingIds = listingAndLeads
      .map((entry) => entry.lead?.building_id)
      .filter((buildingId): buildingId is Id<"buildings"> => buildingId !== undefined);
    const closureStatsByBuilding = await getConfirmedClosureStatsByBuilding(ctx, buildingIds);

    await Promise.all(
      listingAndLeads.map(async ({ listing, lead }) => {
        const computed = await computeTrustForListing(
          ctx,
          listing,
          freshnessThresholdDays,
          minPhotos,
          {
            lead,
            closureStatsByBuilding,
          },
        );

        await upsertTrustRow(ctx, listing._id, {
          badges: computed.badges,
          freshness_score: computed.freshness_score,
          freshness_state: computed.freshness_state,
          last_activity_at: computed.last_activity_at,
          last_computed_at: now,
          evidence: computed.evidence,
          is_deleted: false,
        });
      }),
    );

    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.trustBadges.recomputeFreshness, {
        cursor: result.continueCursor,
      });
    }

    return {
      processed: result.page.length,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const listStaleForAdmin = query({
  args: {
    paginationOpts: paginationOptsValidator,
    freshness_state: v.optional(freshnessStateValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TRUST_BADGES_VIEW);

    const paginatedRows = args.freshness_state
      ? await ctx.db
          .query("listing_trust_badges")
          .withIndex("by_freshness_state", (q) => q.eq("freshness_state", args.freshness_state!))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("listing_trust_badges")
          .withIndex("by_is_deleted", (q) => q.eq("is_deleted", false))
          .order("desc")
          .paginate(args.paginationOpts);

    const page = await Promise.all(
      paginatedRows.page.map(async (trustRow) => {
        const listing = await ctx.db.get(trustRow.listing_id);
        if (!listing) {
          return null;
        }

        const lead = await ctx.db.get(listing.lead_id);
        const [building, society] = await Promise.all([
          lead ? ctx.db.get(lead.building_id) : Promise.resolve(null),
          lead ? ctx.db.get(lead.society_id) : Promise.resolve(null),
        ]);

        return {
          trust_row_id: trustRow._id,
          listing_id: listing._id,
          slug: listing.slug,
          title: `${listing.bhk_config} ${building?.name ?? "Building"} / Fl ${listing.floor_number}`,
          status: listing.status,
          society_name: society?.name ?? null,
          building_name: building?.name ?? null,
          freshness_score: trustRow.freshness_score,
          freshness_state: trustRow.freshness_state,
          badges: trustRow.badges,
          badges_earned: trustRow.badges.filter((badge) => badge.earned).map((badge) => badge.type),
          evidence: trustRow.evidence,
          last_activity_at: trustRow.last_activity_at,
          last_computed_at: trustRow.last_computed_at,
          _creationTime: trustRow._creationTime,
        };
      }),
    );

    return {
      ...paginatedRows,
      page: page.filter((value): value is NonNullable<typeof value> => value !== null),
    };
  },
});

export const getFreshnessCounts = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.TRUST_BADGES_VIEW);

    const allRows = await ctx.db
      .query("listing_trust_badges")
      .withIndex("by_is_deleted", (q) => q.eq("is_deleted", false))
      .collect();

    const counts: Record<Doc<"listing_trust_badges">["freshness_state"], number> = {
      [FRESHNESS_STATE.FRESH]: 0,
      [FRESHNESS_STATE.AGING]: 0,
      [FRESHNESS_STATE.STALE]: 0,
    };

    for (const row of allRows) {
      counts[row.freshness_state] += 1;
    }

    return {
      ...counts,
      total: allRows.length,
    };
  },
});

export const getForListing = query({
  args: {
    listing_id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listing_id);

    if (!listing || listing.status !== LISTING_STATUS.PUBLISHED) {
      return null;
    }

    const trustRow = await ctx.db
      .query("listing_trust_badges")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
      .unique();

    if (!trustRow || trustRow.is_deleted) {
      return null;
    }

    return trustRow;
  },
});
