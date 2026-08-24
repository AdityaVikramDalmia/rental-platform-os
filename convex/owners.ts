import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  CLOSURE_STATUS,
  LEAD_STATUS,
  LISTING_STATUS,
  OWNER_LIFECYCLE_STAGE,
  OWNER_LIFECYCLE_TRANSITIONS,
  OWNER_SOURCE,
  OWNER_SERVICE_REQUEST_STATUS,
  PERMISSIONS,
  PAYOUT_STATUS,
  RM_ASSIGNMENT_STATUS,
  type OwnerLifecycleStage,
} from "../lib/constants";
import { normalizePhone } from "../lib/validators";
import { requireOwner, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";

type OwnerDoc = Doc<"owners">;
type RmAssignmentDoc = Doc<"owner_rm_assignments">;
type OwnerSource = Doc<"owners">["source"];

type OwnerEarningsRow = {
  payout_id: Id<"payouts">;
  closure_id: Id<"closures">;
  lead_id: Id<"leads">;
  status: Doc<"payouts">["status"];
  amount_paise: number;
  building_name: string | null;
  flat_number: string;
  confirmed_at: number | undefined;
  disbursed_at: number | undefined;
  payment_reference: string | undefined;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_BATCH_SIZE = 50;

type BackfillStage = "LEADS" | "LISTINGS" | "CLOSURES" | "COUNTS";
type BackfillStats = {
  totalLeadsProcessed: number;
  ownersCreated: number;
  leadsLinked: number;
  listingsLinked: number;
  closuresLinked: number;
  phonesSkipped: number;
};

type OwnerListFilterArgs = {
  search: string | undefined;
  lifecycle_stage: OwnerLifecycleStage | undefined;
  current_rm_guard_id: Id<"guard_profiles"> | undefined;
  paginationOpts: { numItems: number; cursor: string | null };
};

const ownerSourceValidator = v.union(
  v.literal(OWNER_SOURCE.GUARD_LEAD),
  v.literal(OWNER_SOURCE.OWNER_SERVICE_REQUEST),
  v.literal(OWNER_SOURCE.OPS_CREATED),
);

const ownerLifecycleStageValidator = v.union(
  v.literal(OWNER_LIFECYCLE_STAGE.PROSPECT),
  v.literal(OWNER_LIFECYCLE_STAGE.VERIFIED),
  v.literal(OWNER_LIFECYCLE_STAGE.ACTIVE),
  v.literal(OWNER_LIFECYCLE_STAGE.MANAGED),
  v.literal(OWNER_LIFECYCLE_STAGE.DORMANT),
  v.literal(OWNER_LIFECYCLE_STAGE.CHURNED),
);

const backfillStageValidator = v.union(
  v.literal("LEADS"),
  v.literal("LISTINGS"),
  v.literal("CLOSURES"),
  v.literal("COUNTS"),
);

const backfillStatsValidator = v.object({
  totalLeadsProcessed: v.number(),
  ownersCreated: v.number(),
  leadsLinked: v.number(),
  listingsLinked: v.number(),
  closuresLinked: v.number(),
  phonesSkipped: v.number(),
});

function createInitialBackfillStats(): BackfillStats {
  return {
    totalLeadsProcessed: 0,
    ownersCreated: 0,
    leadsLinked: 0,
    listingsLinked: 0,
    closuresLinked: 0,
    phonesSkipped: 0,
  };
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalEmail(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

function matchesOwnerSearch(owner: OwnerDoc, lowerSearch: string): boolean {
  return (
    owner.phone.includes(lowerSearch) ||
    owner.name?.toLowerCase().includes(lowerSearch) === true ||
    owner.email?.toLowerCase().includes(lowerSearch) === true
  );
}

function parseOffsetCursor(cursor: string | null): number {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

async function collectFilteredOwners(
  ctx: QueryCtx | MutationCtx,
  args: {
    lifecycle_stage: OwnerLifecycleStage | undefined;
    current_rm_guard_id: Id<"guard_profiles"> | undefined;
  },
): Promise<OwnerDoc[]> {
  if (args.lifecycle_stage && args.current_rm_guard_id) {
    return await ctx.db
      .query("owners")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycle_stage", args.lifecycle_stage!))
      .filter((q) =>
        q.and(
          q.eq(q.field("current_rm_guard_id"), args.current_rm_guard_id),
          q.neq(q.field("is_deleted"), true),
        ),
      )
      .collect();
  }

  if (args.lifecycle_stage) {
    return await ctx.db
      .query("owners")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycle_stage", args.lifecycle_stage!))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();
  }

  if (args.current_rm_guard_id) {
    return await ctx.db
      .query("owners")
      .withIndex("by_current_rm", (q) => q.eq("current_rm_guard_id", args.current_rm_guard_id!))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();
  }

  return await ctx.db
    .query("owners")
    .withIndex("by_is_deleted", (q) => q.eq("is_deleted", false))
    .collect();
}

export async function incrementLeadCount(ctx: MutationCtx, ownerId: Id<"owners">): Promise<void> {
  const owner = await ctx.db.get(ownerId);
  if (!owner || owner.is_deleted) {
    throw new Error("Owner not found");
  }

  const now = Date.now();
  await ctx.db.patch(ownerId, {
    total_leads_count: owner.total_leads_count + 1,
    updated_at: now,
    last_activity_at: now,
  });
}

export async function updateLastActivity(ctx: MutationCtx, ownerId: Id<"owners">): Promise<void> {
  const owner = await ctx.db.get(ownerId);
  if (!owner || owner.is_deleted) {
    throw new Error("Owner not found");
  }

  const now = Date.now();
  await ctx.db.patch(ownerId, {
    last_activity_at: now,
    updated_at: now,
  });
}

export async function progressLifecycleStage(
  ctx: MutationCtx,
  ownerId: Id<"owners">,
  newStage: OwnerLifecycleStage,
): Promise<OwnerDoc> {
  const owner = await ctx.db.get(ownerId);
  if (!owner || owner.is_deleted) {
    throw new Error("Owner not found");
  }

  if (owner.lifecycle_stage === newStage) {
    return owner;
  }

  const allowedTransitions = OWNER_LIFECYCLE_TRANSITIONS[owner.lifecycle_stage] ?? [];
  if (!allowedTransitions.includes(newStage)) {
    throw new Error(`Invalid owner lifecycle transition: ${owner.lifecycle_stage} -> ${newStage}`);
  }

  const now = Date.now();
  if (newStage === OWNER_LIFECYCLE_STAGE.CHURNED) {
    const assignments = await ctx.db
      .query("owner_rm_assignments")
      .withIndex("by_owner", (q) => q.eq("owner_id", ownerId))
      .collect();

    for (const assignment of assignments) {
      if (!isNonTerminalRmAssignmentStatus(assignment.status)) {
        continue;
      }

      await ctx.db.patch(assignment._id, {
        status: RM_ASSIGNMENT_STATUS.ENDED,
        reassignment_reason: "owner_churned",
        updated_at: now,
      });
    }
  }

  const ownerPatch: Partial<
    Pick<
      OwnerDoc,
      | "lifecycle_stage"
      | "lifecycle_updated_at"
      | "current_rm_id"
      | "current_rm_guard_id"
      | "updated_at"
    >
  > = {
    lifecycle_stage: newStage,
    lifecycle_updated_at: now,
    updated_at: now,
  };

  if (newStage === OWNER_LIFECYCLE_STAGE.CHURNED) {
    ownerPatch.current_rm_id = undefined;
    ownerPatch.current_rm_guard_id = undefined;
  }

  await ctx.db.patch(ownerId, ownerPatch);

  const updatedOwner = await ctx.db.get(ownerId);
  if (!updatedOwner || updatedOwner.is_deleted) {
    throw new Error("Owner not found");
  }

  return updatedOwner;
}

export async function setCurrentRmAssignment(
  ctx: MutationCtx,
  ownerId: Id<"owners">,
  rmUserId: Id<"users"> | undefined,
  rmGuardId: Id<"guard_profiles"> | undefined,
): Promise<void> {
  const owner = await ctx.db.get(ownerId);
  if (!owner || owner.is_deleted) {
    throw new Error("Owner not found");
  }

  const now = Date.now();
  await ctx.db.patch(ownerId, {
    current_rm_id: rmUserId,
    current_rm_guard_id: rmGuardId,
    last_activity_at: now,
    updated_at: now,
  });
}

function isNonTerminalRmAssignmentStatus(status: string): boolean {
  return (
    status === RM_ASSIGNMENT_STATUS.ACTIVE ||
    status === RM_ASSIGNMENT_STATUS.WARNING ||
    status === RM_ASSIGNMENT_STATUS.ESCALATED
  );
}

async function resolveMergeTargetOwner(
  ctx: MutationCtx,
  owner: OwnerDoc,
): Promise<OwnerDoc | null> {
  let current: OwnerDoc | null = owner;
  const visited = new Set<string>();

  while (current && current.merged_into_id) {
    const currentId = current._id as string;
    if (visited.has(currentId)) {
      return null;
    }
    visited.add(currentId);

    const nextOwner: OwnerDoc | null = await ctx.db.get(current.merged_into_id);
    if (!nextOwner) {
      return null;
    }
    current = nextOwner;
  }

  if (!current || current.is_deleted) {
    return null;
  }

  return current;
}

export async function getActiveUnmergedOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"owners">,
): Promise<OwnerDoc | null> {
  const owner = await ctx.db.get(ownerId);
  if (!owner || owner.is_deleted || owner.merged_into_id) {
    return null;
  }

  return owner;
}

function pickMostRecentOwner(owners: OwnerDoc[]): OwnerDoc {
  return owners.reduce((latest, candidate) => {
    if (candidate._creationTime > latest._creationTime) {
      return candidate;
    }

    if (candidate._creationTime === latest._creationTime) {
      return String(candidate._id) > String(latest._id) ? candidate : latest;
    }

    return latest;
  });
}

async function getLatestOwnerForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<OwnerDoc | null> {
  const owners = await ctx.db
    .query("owners")
    .withIndex("by_user_id", (q) => q.eq("user_id", userId))
    .filter((q) =>
      q.and(q.neq(q.field("is_deleted"), true), q.eq(q.field("merged_into_id"), undefined)),
    )
    .collect();

  if (owners.length === 0) {
    return null;
  }

  return pickMostRecentOwner(owners);
}

export async function getOrCreateByPhoneInternal(
  ctx: MutationCtx,
  phone: string,
  name: string | undefined,
  source: OwnerSource,
): Promise<{ ownerId: Id<"owners">; wasCreated: boolean }> {
  const normalizedPhone = normalizePhone(phone);
  const normalizedName = normalizeOptionalString(name);
  const existingOwnerCandidate = await ctx.db
    .query("owners")
    .withIndex("by_phone", (q) => q.eq("phone", normalizedPhone))
    .filter((q) => q.eq(q.field("is_deleted"), false))
    .first();

  const existingOwner = existingOwnerCandidate
    ? await resolveMergeTargetOwner(ctx, existingOwnerCandidate)
    : null;

  if (existingOwner) {
    const shouldFillName =
      normalizedName !== undefined &&
      (existingOwner.name === undefined || existingOwner.name.trim().length === 0);

    if (shouldFillName) {
      await ctx.db.patch(existingOwner._id, {
        name: normalizedName,
        updated_at: Date.now(),
      });
    }

    return { ownerId: existingOwner._id, wasCreated: false };
  }

  const now = Date.now();
  const ownerId = await ctx.db.insert("owners", {
    phone: normalizedPhone,
    name: normalizedName,
    email: undefined,
    user_id: undefined,
    source,
    first_lead_id: undefined,
    active_properties_count: 0,
    total_leads_count: 0,
    total_closures_count: 0,
    current_rm_id: undefined,
    current_rm_guard_id: undefined,
    lifecycle_stage: OWNER_LIFECYCLE_STAGE.PROSPECT,
    lifecycle_updated_at: now,
    merged_into_id: undefined,
    first_seen_at: now,
    last_activity_at: now,
    is_deleted: false,
    created_at: now,
    updated_at: now,
  });

  return { ownerId, wasCreated: true };
}

export const getOrCreateByPhone = internalMutation({
  args: {
    phone: v.string(),
    name: v.optional(v.string()),
    source: ownerSourceValidator,
  },
  handler: async (ctx, args) => {
    const { ownerId } = await getOrCreateByPhoneInternal(ctx, args.phone, args.name, args.source);
    return ownerId;
  },
});

export const backfillOwnersFromLeads = internalMutation({
  args: {
    stage: v.optional(backfillStageValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
    stats: v.optional(backfillStatsValidator),
  },
  handler: async (ctx, args) => {
    const stage: BackfillStage = args.stage ?? "LEADS";
    const cursor = args.cursor ?? null;
    const stats: BackfillStats = {
      ...createInitialBackfillStats(),
      ...(args.stats ?? {}),
    };

    if (stage === "LEADS") {
      const batch = await ctx.db.query("leads").paginate({
        numItems: BACKFILL_BATCH_SIZE,
        cursor,
      });

      for (const lead of batch.page) {
        if (lead.owner_id !== undefined || lead.owner_phone.trim().length === 0) {
          continue;
        }

        stats.totalLeadsProcessed += 1;

        let normalizedPhone: string;
        try {
          normalizedPhone = normalizePhone(lead.owner_phone);
        } catch {
          stats.phonesSkipped += 1;
          console.warn(`Skipping lead ${lead._id}: invalid owner phone \"${lead.owner_phone}\"`);
          continue;
        }

        const { ownerId, wasCreated } = await getOrCreateByPhoneInternal(
          ctx,
          normalizedPhone,
          lead.owner_name,
          OWNER_SOURCE.GUARD_LEAD,
        );

        if (wasCreated) {
          stats.ownersCreated += 1;
        }

        await ctx.db.patch(lead._id, { owner_id: ownerId });
        stats.leadsLinked += 1;
      }

      if (!batch.isDone) {
        await ctx.scheduler.runAfter(100, internal.owners.backfillOwnersFromLeads, {
          stage: "LEADS",
          cursor: batch.continueCursor,
          stats,
        });
        return { ...stats, stage, continueCursor: batch.continueCursor, done: false };
      }

      await ctx.scheduler.runAfter(100, internal.owners.backfillOwnersFromLeads, {
        stage: "LISTINGS",
        cursor: null,
        stats,
      });
      return { ...stats, stage, continueCursor: null, done: false };
    }

    if (stage === "LISTINGS") {
      const batch = await ctx.db.query("listings").paginate({
        numItems: BACKFILL_BATCH_SIZE,
        cursor,
      });

      const needsLink = batch.page.filter((l) => l.owner_id === undefined);
      const uniqueLeadIds = [...new Set(needsLink.map((l) => l.lead_id))];
      const leads = await Promise.all(uniqueLeadIds.map((id) => ctx.db.get(id)));
      const leadMap = new Map(uniqueLeadIds.map((id, i) => [id, leads[i]]));

      for (const listing of needsLink) {
        const lead = leadMap.get(listing.lead_id);
        if (!lead?.owner_id) {
          continue;
        }

        await ctx.db.patch(listing._id, { owner_id: lead.owner_id });
        stats.listingsLinked += 1;
      }

      if (!batch.isDone) {
        await ctx.scheduler.runAfter(100, internal.owners.backfillOwnersFromLeads, {
          stage: "LISTINGS",
          cursor: batch.continueCursor,
          stats,
        });
        return { ...stats, stage, continueCursor: batch.continueCursor, done: false };
      }

      await ctx.scheduler.runAfter(100, internal.owners.backfillOwnersFromLeads, {
        stage: "CLOSURES",
        cursor: null,
        stats,
      });
      return { ...stats, stage, continueCursor: null, done: false };
    }

    if (stage === "CLOSURES") {
      const batch = await ctx.db.query("closures").paginate({
        numItems: BACKFILL_BATCH_SIZE,
        cursor,
      });

      const needsLink = batch.page.filter((c) => c.owner_id === undefined);
      const uniqueLeadIds = [...new Set(needsLink.map((c) => c.lead_id))];
      const leads = await Promise.all(uniqueLeadIds.map((id) => ctx.db.get(id)));
      const leadMap = new Map(uniqueLeadIds.map((id, i) => [id, leads[i]]));

      for (const closure of needsLink) {
        const lead = leadMap.get(closure.lead_id);
        if (!lead?.owner_id) {
          continue;
        }

        await ctx.db.patch(closure._id, { owner_id: lead.owner_id });
        stats.closuresLinked += 1;
      }

      if (!batch.isDone) {
        await ctx.scheduler.runAfter(100, internal.owners.backfillOwnersFromLeads, {
          stage: "CLOSURES",
          cursor: batch.continueCursor,
          stats,
        });
        return { ...stats, stage, continueCursor: batch.continueCursor, done: false };
      }

      await ctx.scheduler.runAfter(100, internal.owners.backfillOwnersFromLeads, {
        stage: "COUNTS",
        cursor: null,
        stats,
      });
      return { ...stats, stage, continueCursor: null, done: false };
    }

    const ownerBatch = await ctx.db
      .query("owners")
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .paginate({
        numItems: BACKFILL_BATCH_SIZE,
        cursor,
      });

    const now = Date.now();
    for (const owner of ownerBatch.page) {
      const [leadsForOwner, listingsForOwner, closuresForOwner, assignmentsForOwner] =
        await Promise.all([
          ctx.db
            .query("leads")
            .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
            .collect(),
          ctx.db
            .query("listings")
            .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
            .collect(),
          ctx.db
            .query("closures")
            .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
            .collect(),
          ctx.db
            .query("owner_rm_assignments")
            .withIndex("by_owner", (q) => q.eq("owner_id", owner._id))
            .collect(),
        ]);

      const publishedListings = listingsForOwner.filter(
        (listing) => listing.status === LISTING_STATUS.PUBLISHED,
      );
      const confirmedClosures = closuresForOwner.filter(
        (closure) => closure.status === CLOSURE_STATUS.CONFIRMED,
      );
      const hasVerifiedLead = leadsForOwner.some((lead) => lead.status === LEAD_STATUS.VERIFIED);
      const hasManagedAssignment = assignmentsForOwner.some((assignment) =>
        isNonTerminalRmAssignmentStatus(assignment.status),
      );

      let nextLifecycleStage: OwnerLifecycleStage = OWNER_LIFECYCLE_STAGE.PROSPECT;
      if (hasManagedAssignment) {
        nextLifecycleStage = OWNER_LIFECYCLE_STAGE.MANAGED;
      } else if (confirmedClosures.length > 0 || publishedListings.length > 0) {
        nextLifecycleStage = OWNER_LIFECYCLE_STAGE.ACTIVE;
      } else if (hasVerifiedLead) {
        nextLifecycleStage = OWNER_LIFECYCLE_STAGE.VERIFIED;
      }

      const latestLeadActivity = Math.max(0, ...leadsForOwner.map((lead) => lead._creationTime));
      const latestListingActivity = Math.max(
        0,
        ...listingsForOwner.map((listing) => listing._creationTime),
      );
      const latestClosureActivity = Math.max(
        0,
        ...closuresForOwner.map((closure) =>
          Math.max(closure._creationTime, closure.confirmed_at ?? 0),
        ),
      );
      const latestAssignmentActivity = Math.max(
        0,
        ...assignmentsForOwner.map((assignment) => assignment.updated_at),
      );

      await ctx.db.patch(owner._id, {
        total_leads_count: leadsForOwner.length,
        active_properties_count: publishedListings.length,
        total_closures_count: confirmedClosures.length,
        lifecycle_stage: nextLifecycleStage,
        lifecycle_updated_at:
          owner.lifecycle_stage === nextLifecycleStage ? owner.lifecycle_updated_at : now,
        last_activity_at: Math.max(
          owner.last_activity_at,
          latestLeadActivity,
          latestListingActivity,
          latestClosureActivity,
          latestAssignmentActivity,
        ),
        updated_at: now,
      });
    }

    if (!ownerBatch.isDone) {
      await ctx.scheduler.runAfter(100, internal.owners.backfillOwnersFromLeads, {
        stage: "COUNTS",
        cursor: ownerBatch.continueCursor,
        stats,
      });
      return { ...stats, stage, continueCursor: ownerBatch.continueCursor, done: false };
    }

    return { ...stats, stage, continueCursor: null, done: true };
  },
});

export const getById = query({
  args: {
    id: v.id("owners"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_VIEW);
    return await getActiveUnmergedOwner(ctx, args.id);
  },
});

export const getOwnerBasicInfo = query({
  args: {
    id: v.id("owners"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.RM_VIEW);
    const owner = await getActiveUnmergedOwner(ctx, args.id);

    if (!owner) {
      return null;
    }

    return {
      _id: owner._id,
      name: owner.name,
      phone: owner.phone,
      lifecycle_stage: owner.lifecycle_stage,
    };
  },
});

async function listOwnersWithFilters(
  ctx: QueryCtx,
  args: OwnerListFilterArgs,
): Promise<PaginationResult<OwnerDoc>> {
  const normalizedSearch = normalizeOptionalString(args.search);

  if (!normalizedSearch) {
    if (args.lifecycle_stage && args.current_rm_guard_id) {
      return await ctx.db
        .query("owners")
        .withIndex("by_lifecycle", (q) => q.eq("lifecycle_stage", args.lifecycle_stage!))
        .filter((q) =>
          q.and(
            q.eq(q.field("current_rm_guard_id"), args.current_rm_guard_id),
            q.neq(q.field("is_deleted"), true),
          ),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (args.lifecycle_stage) {
      return await ctx.db
        .query("owners")
        .withIndex("by_lifecycle", (q) => q.eq("lifecycle_stage", args.lifecycle_stage!))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (args.current_rm_guard_id) {
      return await ctx.db
        .query("owners")
        .withIndex("by_current_rm", (q) => q.eq("current_rm_guard_id", args.current_rm_guard_id!))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("owners")
      .withIndex("by_is_deleted", (q) => q.eq("is_deleted", false))
      .order("desc")
      .paginate(args.paginationOpts);
  }

  let candidateOwners: OwnerDoc[] = [];

  try {
    const normalizedPhoneSearch = normalizePhone(normalizedSearch);
    const byPhone = await ctx.db
      .query("owners")
      .withIndex("by_phone", (q) => q.eq("phone", normalizedPhoneSearch))
      .unique();

    if (byPhone && !byPhone.is_deleted) {
      candidateOwners = [byPhone];
    }
  } catch {
    candidateOwners = await collectFilteredOwners(ctx, {
      lifecycle_stage: args.lifecycle_stage,
      current_rm_guard_id: args.current_rm_guard_id,
    });
  }

  const lowerSearch = normalizedSearch.toLowerCase();
  const filteredOwners = candidateOwners
    .filter((owner) => {
      if (args.lifecycle_stage && owner.lifecycle_stage !== args.lifecycle_stage) {
        return false;
      }

      if (args.current_rm_guard_id && owner.current_rm_guard_id !== args.current_rm_guard_id) {
        return false;
      }

      return matchesOwnerSearch(owner, lowerSearch);
    })
    .sort((a, b) => b._creationTime - a._creationTime);

  const offset = parseOffsetCursor(args.paginationOpts.cursor);
  const page = filteredOwners.slice(offset, offset + args.paginationOpts.numItems);
  const nextOffset = offset + page.length;

  return {
    page,
    isDone: nextOffset >= filteredOwners.length,
    continueCursor: nextOffset >= filteredOwners.length ? "" : String(nextOffset),
  } as PaginationResult<OwnerDoc>;
}

function toOwnerListFilterArgs(args: {
  search?: string;
  lifecycle_stage?: OwnerLifecycleStage;
  current_rm_guard_id?: Id<"guard_profiles">;
  paginationOpts: { numItems: number; cursor: string | null };
}): OwnerListFilterArgs {
  return {
    search: args.search ?? undefined,
    lifecycle_stage: args.lifecycle_stage ?? undefined,
    current_rm_guard_id: args.current_rm_guard_id ?? undefined,
    paginationOpts: args.paginationOpts,
  };
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    lifecycle_stage: v.optional(ownerLifecycleStageValidator),
    current_rm_guard_id: v.optional(v.id("guard_profiles")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_VIEW);

    return await listOwnersWithFilters(ctx, toOwnerListFilterArgs(args));
  },
});

export const search = query({
  args: {
    search: v.string(),
    lifecycle_stage: v.optional(ownerLifecycleStageValidator),
    current_rm_guard_id: v.optional(v.id("guard_profiles")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_VIEW);

    const trimmedSearch = normalizeOptionalString(args.search);
    if (!trimmedSearch) {
      throw new Error("search is required");
    }

    return await listOwnersWithFilters(
      ctx,
      toOwnerListFilterArgs({
        search: trimmedSearch,
        lifecycle_stage: args.lifecycle_stage,
        current_rm_guard_id: args.current_rm_guard_id,
        paginationOpts: args.paginationOpts,
      }),
    );
  },
});

export const updateLifecycle = mutation({
  args: {
    id: v.id("owners"),
    new_stage: ownerLifecycleStageValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_MANAGE_LIFECYCLE);

    return await progressLifecycleStage(ctx, args.id, args.new_stage);
  },
});

export const transitionDormantOwners = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dormancyThreshold = now - 90 * DAY_MS;
    const allowedTransitions = OWNER_LIFECYCLE_TRANSITIONS[OWNER_LIFECYCLE_STAGE.MANAGED] ?? [];

    if (!allowedTransitions.includes(OWNER_LIFECYCLE_STAGE.DORMANT)) {
      throw new Error("MANAGED -> DORMANT lifecycle transition is not configured");
    }

    const managedOwners = await ctx.db
      .query("owners")
      .withIndex("by_lifecycle", (q) => q.eq("lifecycle_stage", OWNER_LIFECYCLE_STAGE.MANAGED))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    let transitioned = 0;

    for (const owner of managedOwners) {
      if (owner.last_activity_at >= dormancyThreshold) {
        continue;
      }

      const [publishedListing, assignments] = await Promise.all([
        ctx.db
          .query("listings")
          .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
          .filter((q) => q.eq(q.field("status"), LISTING_STATUS.PUBLISHED))
          .first(),
        ctx.db
          .query("owner_rm_assignments")
          .withIndex("by_owner", (q) => q.eq("owner_id", owner._id))
          .collect(),
      ]);

      const hasNonTerminalAssignment = assignments.some((assignment) =>
        isNonTerminalRmAssignmentStatus(assignment.status),
      );

      if (publishedListing || hasNonTerminalAssignment) {
        await ctx.db.patch(owner._id, {
          last_activity_at: now,
          updated_at: now,
        });
        continue;
      }

      await ctx.db.patch(owner._id, {
        lifecycle_stage: OWNER_LIFECYCLE_STAGE.DORMANT,
        lifecycle_updated_at: now,
        updated_at: now,
      });
      transitioned += 1;
    }

    return { transitioned, processedAt: now };
  },
});

export const updateProfile = mutation({
  args: {
    id: v.id("owners"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_EDIT);

    const owner = await ctx.db.get(args.id);
    if (!owner || owner.is_deleted) {
      throw new Error("Owner not found");
    }

    const patch: Partial<Pick<OwnerDoc, "name" | "email" | "updated_at">> = {};

    if (Object.prototype.hasOwnProperty.call(args, "name")) {
      patch.name = normalizeOptionalString(args.name);
    }

    if (Object.prototype.hasOwnProperty.call(args, "email")) {
      patch.email = normalizeOptionalEmail(args.email);
    }

    if (Object.keys(patch).length === 0) {
      return owner;
    }

    patch.updated_at = Date.now();
    await ctx.db.patch(args.id, patch);
    return await ctx.db.get(args.id);
  },
});

export const getOwnerLeads = query({
  args: { owner_id: v.id("owners") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_VIEW);
    const owner = await getActiveUnmergedOwner(ctx, args.owner_id);
    if (!owner) {
      return [];
    }

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
      .collect();

    const enriched = await Promise.all(
      leads.map(async (lead) => {
        const society = await ctx.db.get(lead.society_id);
        const building = lead.building_id ? await ctx.db.get(lead.building_id) : null;
        return {
          ...lead,
          society_name: society?.name ?? null,
          building_name: building?.name ?? null,
        };
      }),
    );

    return enriched;
  },
});

export const getOwnerListings = query({
  args: { owner_id: v.id("owners") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_VIEW);
    const owner = await getActiveUnmergedOwner(ctx, args.owner_id);
    if (!owner) {
      return [];
    }

    return await ctx.db
      .query("listings")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
      .collect();
  },
});

export const getOwnerClosures = query({
  args: { owner_id: v.id("owners") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_VIEW);
    const owner = await getActiveUnmergedOwner(ctx, args.owner_id);
    if (!owner) {
      return [];
    }

    return await ctx.db
      .query("closures")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
      .collect();
  },
});

export const getGuardProfileName = query({
  args: { guard_profile_id: v.id("guard_profiles") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_VIEW);
    const profile = await ctx.db.get(args.guard_profile_id);
    if (!profile) return null;
    const user = await ctx.db.get(profile.user_id);
    return user?.name ?? null;
  },
});

// ============ OWNER-FACING QUERIES ============

function isNonTerminalOwnerServiceRequestStatus(status: string): boolean {
  return (
    status === OWNER_SERVICE_REQUEST_STATUS.SUBMITTED ||
    status === OWNER_SERVICE_REQUEST_STATUS.CONTACTED ||
    status === OWNER_SERVICE_REQUEST_STATUS.ONBOARDED
  );
}

function hasPublishedToNonPublishedTransition(logs: Doc<"audit_logs">[]): boolean {
  return logs.some((log) => {
    const changes = log.changes ?? [];
    return changes.some((change) => {
      return (
        change.field === "status" &&
        change.old_value === LISTING_STATUS.PUBLISHED &&
        change.new_value !== LISTING_STATUS.PUBLISHED
      );
    });
  });
}

export const getMyDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireOwner(ctx);
    const owner = await getLatestOwnerForUser(ctx, user._id);

    if (!owner) {
      throw new Error("Owner profile not found");
    }

    const [listings, leads, closures, serviceRequests, rmAssignments, checkIns] = await Promise.all(
      [
        ctx.db
          .query("listings")
          .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
          .collect(),
        ctx.db
          .query("leads")
          .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
          .collect(),
        ctx.db
          .query("closures")
          .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
          .collect(),
        ctx.db
          .query("owner_service_requests")
          .withIndex("by_phone", (q) => q.eq("phone", owner.phone))
          .collect(),
        ctx.db
          .query("owner_rm_assignments")
          .withIndex("by_owner", (q) => q.eq("owner_id", owner._id))
          .collect(),
        ctx.db
          .query("rm_check_ins")
          .withIndex("by_owner", (q) => q.eq("owner_id", owner._id))
          .collect(),
      ],
    );

    const publishedListings = listings.filter(
      (listing) => listing.status === LISTING_STATUS.PUBLISHED,
    );

    const [inquiryBatches, payoutsByClosure, listingIssueChecks] = await Promise.all([
      Promise.all(
        publishedListings.map((listing) =>
          ctx.db
            .query("tenant_inquiries")
            .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
            .collect(),
        ),
      ),
      Promise.all(
        closures.map((closure) =>
          ctx.db
            .query("payouts")
            .withIndex("by_closure_id", (q) => q.eq("closure_id", closure._id))
            .collect(),
        ),
      ),
      Promise.all(
        listings
          .filter((listing) => listing.status !== LISTING_STATUS.PUBLISHED)
          .map(async (listing) => {
            if (listing.status === LISTING_STATUS.ARCHIVED) {
              return listing;
            }

            const listingAuditLogs = await ctx.db
              .query("audit_logs")
              .withIndex("by_entity", (q) =>
                q.eq("entity_type", "listings").eq("entity_id", String(listing._id)),
              )
              .collect();

            return hasPublishedToNonPublishedTransition(listingAuditLogs) ? listing : null;
          }),
      ),
    ]);

    const activeTenantStatuses = new Set([
      "GUARD_ACCEPTED",
      "VISIT_SCHEDULED",
      "VISIT_COMPLETED",
      "NEGOTIATION_INITIATED",
      "CLOSED",
    ]);

    const activeTenants = inquiryBatches.reduce((count, inquiries) => {
      const hasActiveTenant = inquiries.some((inquiry) => activeTenantStatuses.has(inquiry.status));
      return count + (hasActiveTenant ? 1 : 0);
    }, 0);

    const expectedMonthlyRent = publishedListings.reduce(
      (sum, listing) => sum + listing.rent_monthly,
      0,
    );

    const pendingRequests = serviceRequests.filter((request) =>
      isNonTerminalOwnerServiceRequestStatus(request.status),
    );

    const pendingRequestAlerts = pendingRequests.map((request) => ({
      type: "pending_request",
      message: `Service request is ${request.status.toLowerCase()}.`,
      entity_id: String(request._id),
    }));

    const listingIssueAlerts = listingIssueChecks
      .filter((listing): listing is Doc<"listings"> => listing !== null)
      .map((listing) => ({
        type: "listing_issue",
        message: "Listing needs attention because it is no longer published.",
        entity_id: String(listing._id),
      }));

    const alerts = [...pendingRequestAlerts, ...listingIssueAlerts].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      return a.entity_id.localeCompare(b.entity_id);
    });

    const nonTerminalAssignments = rmAssignments
      .filter((assignment) => isNonTerminalRmAssignmentStatus(assignment.status))
      .sort((a, b) => b.updated_at - a.updated_at);
    const activeAssignment = nonTerminalAssignments[0] ?? null;

    const rmContact = activeAssignment
      ? {
          rm_name: (await ctx.db.get(activeAssignment.rm_user_id))?.name ?? "Relationship Manager",
          rm_phone: (await ctx.db.get(activeAssignment.rm_user_id))?.phone ?? "",
          status: activeAssignment.status,
          last_check_in_at: activeAssignment.last_check_in_at ?? null,
          next_check_in_due: activeAssignment.next_check_in_due ?? null,
        }
      : null;

    const payouts = payoutsByClosure.flat();

    const recentActivity = [
      ...closures.map((closure) => ({
        type: "closure" as const,
        timestamp: closure.confirmed_at ?? closure._creationTime,
        title:
          closure.status === CLOSURE_STATUS.CONFIRMED
            ? "Closure confirmed"
            : closure.status === CLOSURE_STATUS.CANCELLED
              ? "Closure cancelled"
              : "Closure created",
        entity_id: String(closure._id),
      })),
      ...payouts.map((payout) => ({
        type: "payout" as const,
        timestamp: payout.disbursed_at ?? payout.approved_at ?? payout._creationTime,
        title:
          payout.status === PAYOUT_STATUS.DISBURSED
            ? "Payout disbursed"
            : payout.status === PAYOUT_STATUS.APPROVED
              ? "Payout approved"
              : "Payout update",
        entity_id: String(payout._id),
      })),
      ...checkIns.map((checkIn) => ({
        type: "check_in" as const,
        timestamp: checkIn.created_at,
        title: "RM check-in completed",
        entity_id: String(checkIn._id),
      })),
      ...leads.map((lead) => ({
        type: "lead" as const,
        timestamp: lead._creationTime,
        title:
          lead.status === LEAD_STATUS.VERIFIED
            ? `Lead verified for flat ${lead.flat_number}`
            : `Lead submitted for flat ${lead.flat_number}`,
        entity_id: String(lead._id),
      })),
      ...listings.map((listing) => ({
        type: "listing" as const,
        timestamp: listing._creationTime,
        title:
          listing.status === LISTING_STATUS.PUBLISHED
            ? "Listing published"
            : listing.status === LISTING_STATUS.ARCHIVED
              ? "Listing archived"
              : "Listing drafted",
        entity_id: String(listing._id),
      })),
    ]
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return b.timestamp - a.timestamp;
        }

        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }

        return a.entity_id.localeCompare(b.entity_id);
      })
      .slice(0, 10);

    return {
      owner: {
        _id: owner._id,
        name: owner.name,
        lifecycle_stage: owner.lifecycle_stage,
      },
      kpis: {
        total_properties: listings.length,
        active_tenants: activeTenants,
        expected_monthly_rent: expectedMonthlyRent,
        pending_requests: pendingRequests.length,
      },
      alerts,
      rm_contact: rmContact,
      recent_activity: recentActivity,
    };
  },
});

export const getMyOwnerProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireOwner(ctx);

    const owner = await getLatestOwnerForUser(ctx, user._id);
    if (!owner) {
      return null;
    }

    return owner;
  },
});

export const getMyProperties = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireOwner(ctx);

    const owner = await getLatestOwnerForUser(ctx, user._id);
    if (!owner) {
      throw new Error("Owner profile not found");
    }

    const [leads, listings, closures] = await Promise.all([
      ctx.db
        .query("leads")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
      ctx.db
        .query("listings")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
      ctx.db
        .query("closures")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
    ]);

    const enrichedLeads = await Promise.all(
      leads.map(async (lead) => {
        const [society, building] = await Promise.all([
          ctx.db.get(lead.society_id),
          ctx.db.get(lead.building_id),
        ]);

        return {
          _id: lead._id,
          flat_number: lead.flat_number,
          status: lead.status,
          society_name: society?.name ?? null,
          building_name: building?.name ?? null,
          _creationTime: lead._creationTime,
        };
      }),
    );

    const enrichedListings = listings
      .map((listing) => ({
        _id: listing._id,
        lead_id: listing.lead_id,
        status: listing.status,
        slug: listing.slug,
        _creationTime: listing._creationTime,
      }))
      .sort((a, b) => b._creationTime - a._creationTime);

    const enrichedClosures = closures
      .map((closure) => ({
        _id: closure._id,
        lead_id: closure.lead_id,
        status: closure.status,
        _creationTime: closure._creationTime,
      }))
      .sort((a, b) => b._creationTime - a._creationTime);

    return {
      leads: enrichedLeads.sort((a, b) => b._creationTime - a._creationTime),
      listings: enrichedListings,
      closures: enrichedClosures,
    };
  },
});

export const getMyLeads = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireOwner(ctx);

    const owner = await getLatestOwnerForUser(ctx, user._id);
    if (!owner) {
      throw new Error("Owner profile not found");
    }

    const [leads, listings, closures] = await Promise.all([
      ctx.db
        .query("leads")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
      ctx.db
        .query("listings")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
      ctx.db
        .query("closures")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
    ]);

    const listingsByLead = new Map<string, Doc<"listings">>();
    for (const listing of listings) {
      const key = String(listing.lead_id);
      const existingListing = listingsByLead.get(key);
      if (!existingListing || listing._creationTime > existingListing._creationTime) {
        listingsByLead.set(key, listing);
      }
    }

    const closuresByLead = new Map<string, Doc<"closures">>();
    for (const closure of closures) {
      const key = String(closure.lead_id);
      const existingClosure = closuresByLead.get(key);
      if (!existingClosure || closure._creationTime > existingClosure._creationTime) {
        closuresByLead.set(key, closure);
      }
    }

    const rows = await Promise.all(
      leads.map(async (lead) => {
        const [society, building] = await Promise.all([
          ctx.db.get(lead.society_id),
          ctx.db.get(lead.building_id),
        ]);
        const listing = listingsByLead.get(String(lead._id));
        const closure = closuresByLead.get(String(lead._id));

        return {
          lead_id: lead._id,
          submitted_at: lead._creationTime,
          status: lead.status,
          society_name: society?.name ?? null,
          building_name: building?.name ?? null,
          flat_number: lead.flat_number,
          listing_id: listing?._id,
          listing_status: listing?.status,
          closure_id: closure?._id,
          closure_status: closure?.status,
        };
      }),
    );

    return rows.sort((a, b) => {
      if (a.submitted_at !== b.submitted_at) {
        return b.submitted_at - a.submitted_at;
      }

      return String(a.lead_id).localeCompare(String(b.lead_id));
    });
  },
});

export const getMyEarnings = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireOwner(ctx);

    const owner = await getLatestOwnerForUser(ctx, user._id);
    if (!owner) {
      throw new Error("Owner profile not found");
    }

    const closures = await ctx.db
      .query("closures")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
      .collect();

    if (closures.length === 0) {
      return {
        summary: {
          pending_paise: 0,
          approved_paise: 0,
          disbursed_paise: 0,
          failed_paise: 0,
          voided_paise: 0,
          total_disbursed_paise: 0,
        },
        rows: [] as OwnerEarningsRow[],
      };
    }

    const payoutsByClosure = await Promise.all(
      closures.map((closure) =>
        ctx.db
          .query("payouts")
          .withIndex("by_closure_id", (q) => q.eq("closure_id", closure._id))
          .collect(),
      ),
    );
    const payouts = payoutsByClosure.flat();

    const closureById = new Map(closures.map((closure) => [String(closure._id), closure] as const));

    const leadIds = Array.from(new Set(closures.map((closure) => closure.lead_id)));
    const leads = await Promise.all(leadIds.map((leadId) => ctx.db.get(leadId)));
    const leadById = new Map(
      leadIds.map((leadId, index) => [String(leadId), leads[index]] as const),
    );

    const buildingIds = Array.from(
      new Set(leads.flatMap((lead) => (lead ? [lead.building_id] : []))),
    );
    const buildings = await Promise.all(buildingIds.map((buildingId) => ctx.db.get(buildingId)));
    const buildingById = new Map(
      buildingIds.map((buildingId, index) => [String(buildingId), buildings[index]] as const),
    );

    const summary = {
      pending_paise: 0,
      approved_paise: 0,
      disbursed_paise: 0,
      failed_paise: 0,
      voided_paise: 0,
      total_disbursed_paise: 0,
    };

    const rowsWithSort = payouts.map((payout) => {
      const closure = closureById.get(String(payout.closure_id));
      const lead = leadById.get(String(payout.lead_id));
      const building = lead ? buildingById.get(String(lead.building_id)) : null;

      if (payout.status === PAYOUT_STATUS.PENDING) {
        summary.pending_paise += payout.amount_paise;
      } else if (payout.status === PAYOUT_STATUS.APPROVED) {
        summary.approved_paise += payout.amount_paise;
      } else if (payout.status === PAYOUT_STATUS.DISBURSED) {
        summary.disbursed_paise += payout.amount_paise;
        summary.total_disbursed_paise += payout.amount_paise;
      } else if (payout.status === PAYOUT_STATUS.FAILED) {
        summary.failed_paise += payout.amount_paise;
      } else if (payout.status === PAYOUT_STATUS.VOIDED) {
        summary.voided_paise += payout.amount_paise;
      }

      return {
        row: {
          payout_id: payout._id,
          closure_id: payout.closure_id,
          lead_id: payout.lead_id,
          status: payout.status,
          amount_paise: payout.amount_paise,
          building_name: building?.name ?? null,
          flat_number: lead?.flat_number ?? "",
          confirmed_at: closure?.confirmed_at,
          disbursed_at: payout.disbursed_at,
          payment_reference: payout.payment_reference,
        } satisfies OwnerEarningsRow,
        sortTs: payout.disbursed_at ?? payout._creationTime,
      };
    });

    const rows = rowsWithSort
      .sort((a, b) => {
        if (a.sortTs !== b.sortTs) {
          return b.sortTs - a.sortTs;
        }

        return String(a.row.payout_id).localeCompare(String(b.row.payout_id));
      })
      .map((entry) => entry.row);

    return {
      summary,
      rows,
    };
  },
});

export const getMyRmAssignment = query({
  args: { owner_id: v.id("owners") },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx);

    // Verify this owner belongs to the authenticated user
    const owner = await ctx.db.get(args.owner_id);
    if (!owner || owner.is_deleted || owner.user_id !== user._id) {
      return null;
    }

    // Get the active/warning/escalated RM assignment (non-terminal)
    const assignments = await ctx.db
      .query("owner_rm_assignments")
      .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id))
      .collect();

    const activeAssignment = assignments.find(
      (a) => a.status === "ACTIVE" || a.status === "WARNING" || a.status === "ESCALATED",
    );

    if (!activeAssignment) {
      return null;
    }

    const guardProfile = await ctx.db.get(activeAssignment.rm_guard_id);
    const guardUser = guardProfile ? await ctx.db.get(guardProfile.user_id) : null;

    return {
      ...activeAssignment,
      rm_name: guardUser?.name ?? null,
      rm_phone: guardUser?.phone ?? null,
    };
  },
});

export const getMyCheckIns = query({
  args: { owner_id: v.id("owners"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx);

    // Verify this owner belongs to the authenticated user
    const owner = await ctx.db.get(args.owner_id);
    if (!owner || owner.is_deleted || owner.user_id !== user._id) {
      return [];
    }

    const checkIns = await ctx.db
      .query("rm_check_ins")
      .withIndex("by_owner", (q) => q.eq("owner_id", args.owner_id))
      .collect();

    const sorted = checkIns.sort((a, b) => b.created_at - a.created_at);
    const limited = sorted.slice(0, args.limit ?? 5);

    return limited;
  },
});

// ============ ADMIN MUTATIONS ============

export const merge = mutation({
  args: {
    source_id: v.id("owners"),
    target_id: v.id("owners"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNERS_MERGE);

    if (args.source_id === args.target_id) {
      throw new Error("source_id and target_id must be different");
    }

    const sourceOwner = await ctx.db.get(args.source_id);
    if (!sourceOwner || sourceOwner.is_deleted) {
      throw new Error("Source owner not found");
    }

    const targetOwner = await ctx.db.get(args.target_id);
    if (!targetOwner || targetOwner.is_deleted) {
      throw new Error("Target owner not found");
    }

    const sourceLeads = await ctx.db
      .query("leads")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", args.source_id))
      .collect();
    for (const lead of sourceLeads) {
      await ctx.db.patch(lead._id, { owner_id: args.target_id });
    }

    const sourceListings = await ctx.db
      .query("listings")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", args.source_id))
      .collect();
    for (const listing of sourceListings) {
      await ctx.db.patch(listing._id, { owner_id: args.target_id });
    }

    const sourceClosures = await ctx.db
      .query("closures")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", args.source_id))
      .collect();
    for (const closure of sourceClosures) {
      await ctx.db.patch(closure._id, { owner_id: args.target_id });
    }

    const now = Date.now();
    const [sourceAssignments, targetAssignmentsBeforeMerge] = await Promise.all([
      ctx.db
        .query("owner_rm_assignments")
        .withIndex("by_owner", (q) => q.eq("owner_id", args.source_id))
        .collect(),
      ctx.db
        .query("owner_rm_assignments")
        .withIndex("by_owner", (q) => q.eq("owner_id", args.target_id))
        .collect(),
    ]);

    const targetHadNonTerminalAssignment = targetAssignmentsBeforeMerge.some((assignment) =>
      isNonTerminalRmAssignmentStatus(assignment.status),
    );

    let relinkedNonTerminalAssignment: RmAssignmentDoc | null = null;

    for (const assignment of sourceAssignments) {
      const isNonTerminal = isNonTerminalRmAssignmentStatus(assignment.status);

      if (isNonTerminal && (targetHadNonTerminalAssignment || relinkedNonTerminalAssignment)) {
        await ctx.db.patch(assignment._id, {
          status: RM_ASSIGNMENT_STATUS.ENDED,
          reassignment_reason: "merged",
          updated_at: now,
        });
        continue;
      }

      await ctx.db.patch(assignment._id, {
        owner_id: args.target_id,
        updated_at: now,
      });

      if (isNonTerminal) {
        relinkedNonTerminalAssignment = assignment;
      }
    }

    const sourceCheckIns = await ctx.db
      .query("rm_check_ins")
      .withIndex("by_owner", (q) => q.eq("owner_id", args.source_id))
      .collect();
    for (const checkIn of sourceCheckIns) {
      // Keep assignment_id unchanged intentionally: it is historical provenance for the original
      // RM assignment under which this check-in was created. owner_id is relinked for owner-scoped
      // reads after merge.
      await ctx.db.patch(checkIn._id, {
        owner_id: args.target_id,
      });
    }

    const [targetLeads, targetListings, targetClosures, targetAssignments] = await Promise.all([
      ctx.db
        .query("leads")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", args.target_id))
        .collect(),
      ctx.db
        .query("listings")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", args.target_id))
        .collect(),
      ctx.db
        .query("closures")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", args.target_id))
        .collect(),
      ctx.db
        .query("owner_rm_assignments")
        .withIndex("by_owner", (q) => q.eq("owner_id", args.target_id))
        .collect(),
    ]);

    const targetPublishedListings = targetListings.filter(
      (listing) => listing.status === LISTING_STATUS.PUBLISHED,
    );
    const targetConfirmedClosures = targetClosures.filter(
      (closure) => closure.status === CLOSURE_STATUS.CONFIRMED,
    );
    const targetHasVerifiedLead = targetLeads.some((lead) => lead.status === LEAD_STATUS.VERIFIED);
    const targetHasNonTerminalAssignment = targetAssignments.some((assignment) =>
      isNonTerminalRmAssignmentStatus(assignment.status),
    );

    let computedLifecycleStage: OwnerLifecycleStage = OWNER_LIFECYCLE_STAGE.PROSPECT;
    if (targetHasNonTerminalAssignment || targetConfirmedClosures.length > 0) {
      computedLifecycleStage = OWNER_LIFECYCLE_STAGE.MANAGED;
    } else if (targetPublishedListings.length > 0) {
      computedLifecycleStage = OWNER_LIFECYCLE_STAGE.ACTIVE;
    } else if (targetHasVerifiedLead) {
      computedLifecycleStage = OWNER_LIFECYCLE_STAGE.VERIFIED;
    }

    const lifecycleProgressionOrder: OwnerLifecycleStage[] = [
      OWNER_LIFECYCLE_STAGE.PROSPECT,
      OWNER_LIFECYCLE_STAGE.VERIFIED,
      OWNER_LIFECYCLE_STAGE.ACTIVE,
      OWNER_LIFECYCLE_STAGE.MANAGED,
    ];

    let nextLifecycleStage = targetOwner.lifecycle_stage;
    if (targetOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.CHURNED) {
      nextLifecycleStage = computedLifecycleStage;
    } else if (targetOwner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.DORMANT) {
      if (
        computedLifecycleStage === OWNER_LIFECYCLE_STAGE.ACTIVE ||
        computedLifecycleStage === OWNER_LIFECYCLE_STAGE.MANAGED
      ) {
        const dormantTransitions = OWNER_LIFECYCLE_TRANSITIONS[OWNER_LIFECYCLE_STAGE.DORMANT] ?? [];
        const canReachActive = dormantTransitions.includes(OWNER_LIFECYCLE_STAGE.ACTIVE);

        if (computedLifecycleStage === OWNER_LIFECYCLE_STAGE.ACTIVE) {
          nextLifecycleStage = canReachActive
            ? OWNER_LIFECYCLE_STAGE.ACTIVE
            : computedLifecycleStage;
        } else {
          const activeTransitions = OWNER_LIFECYCLE_TRANSITIONS[OWNER_LIFECYCLE_STAGE.ACTIVE] ?? [];
          const canReachManaged =
            dormantTransitions.includes(OWNER_LIFECYCLE_STAGE.MANAGED) ||
            (canReachActive && activeTransitions.includes(OWNER_LIFECYCLE_STAGE.MANAGED));

          nextLifecycleStage = canReachManaged
            ? OWNER_LIFECYCLE_STAGE.MANAGED
            : computedLifecycleStage;
        }
      }
    } else {
      const currentLifecycleOrder = lifecycleProgressionOrder.indexOf(targetOwner.lifecycle_stage);
      const computedLifecycleOrder = lifecycleProgressionOrder.indexOf(computedLifecycleStage);

      if (
        currentLifecycleOrder !== -1 &&
        computedLifecycleOrder !== -1 &&
        computedLifecycleOrder > currentLifecycleOrder
      ) {
        let candidateStage = lifecycleProgressionOrder[currentLifecycleOrder];
        for (let index = currentLifecycleOrder + 1; index <= computedLifecycleOrder; index += 1) {
          const stageCandidate = lifecycleProgressionOrder[index];
          const allowedTransitions: string[] = OWNER_LIFECYCLE_TRANSITIONS[candidateStage] ?? [];
          if (!allowedTransitions.includes(stageCandidate)) {
            break;
          }
          candidateStage = stageCandidate;
        }

        nextLifecycleStage = candidateStage;
      }
    }

    const targetHasCurrentRm =
      targetOwner.current_rm_id !== undefined || targetOwner.current_rm_guard_id !== undefined;

    const targetPatch: Partial<
      Pick<
        OwnerDoc,
        | "name"
        | "email"
        | "user_id"
        | "lifecycle_stage"
        | "lifecycle_updated_at"
        | "active_properties_count"
        | "total_leads_count"
        | "total_closures_count"
        | "current_rm_id"
        | "current_rm_guard_id"
        | "last_activity_at"
        | "updated_at"
      >
    > = {
      active_properties_count: targetPublishedListings.length,
      total_leads_count: targetLeads.length,
      total_closures_count: targetConfirmedClosures.length,
      last_activity_at: Math.max(targetOwner.last_activity_at, sourceOwner.last_activity_at),
      updated_at: now,
    };

    if (nextLifecycleStage !== targetOwner.lifecycle_stage) {
      targetPatch.lifecycle_stage = nextLifecycleStage;
      targetPatch.lifecycle_updated_at = now;
    }

    if (!targetHasCurrentRm && relinkedNonTerminalAssignment) {
      targetPatch.current_rm_id = relinkedNonTerminalAssignment.rm_user_id;
      targetPatch.current_rm_guard_id = relinkedNonTerminalAssignment.rm_guard_id;
    }

    if (
      (targetOwner.name === undefined || targetOwner.name.trim().length === 0) &&
      sourceOwner.name
    ) {
      targetPatch.name = sourceOwner.name;
    }

    if (
      (targetOwner.email === undefined || targetOwner.email.trim().length === 0) &&
      sourceOwner.email
    ) {
      targetPatch.email = sourceOwner.email;
    }

    if (sourceOwner.user_id && !targetOwner.user_id) {
      targetPatch.user_id = sourceOwner.user_id;
    } else if (
      sourceOwner.user_id &&
      targetOwner.user_id &&
      sourceOwner.user_id !== targetOwner.user_id
    ) {
      const [sourceUser, targetUser] = await Promise.all([
        ctx.db.get(sourceOwner.user_id),
        ctx.db.get(targetOwner.user_id),
      ]);
      console.warn("Owner merge kept target user_id while source also had linked account", {
        source_owner_id: args.source_id,
        target_owner_id: args.target_id,
        source_user_id: sourceOwner.user_id,
        source_workos_user_id: sourceUser?.workos_user_id,
        target_user_id: targetOwner.user_id,
        target_workos_user_id: targetUser?.workos_user_id,
      });
    }

    await ctx.db.patch(args.target_id, targetPatch);
    await ctx.db.patch(args.source_id, {
      user_id: undefined,
      email: undefined,
      merged_into_id: args.target_id,
      is_deleted: true,
      updated_at: now,
      last_activity_at: now,
    });

    return await ctx.db.get(args.target_id);
  },
});
