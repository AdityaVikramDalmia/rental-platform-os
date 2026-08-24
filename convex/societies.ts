import { v } from "convex/values";
import { LEAD_STATUS, type SocietyStatus, PERMISSIONS, SOCIETY_STATUS } from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const societyStatusValidator = v.union(
  v.literal(SOCIETY_STATUS.ONBOARDING),
  v.literal(SOCIETY_STATUS.ACTIVE),
  v.literal(SOCIETY_STATUS.INACTIVE),
);

function normalizeRequiredField(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required`);
  }

  return normalizedValue;
}

function normalizeOptionalField(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

async function ensureValidStatusTransition(
  ctx: MutationCtx,
  societyId: Id<"societies">,
  currentStatus: SocietyStatus,
  nextStatus: SocietyStatus,
): Promise<void> {
  if (currentStatus === nextStatus) {
    return;
  }

  if (nextStatus === SOCIETY_STATUS.ONBOARDING) {
    throw new Error("Cannot move society back to ONBOARDING");
  }

  if (currentStatus === SOCIETY_STATUS.ONBOARDING && nextStatus === SOCIETY_STATUS.INACTIVE) {
    throw new Error("ONBOARDING society must be ACTIVE before becoming INACTIVE");
  }

  if (currentStatus === SOCIETY_STATUS.ONBOARDING && nextStatus === SOCIETY_STATUS.ACTIVE) {
    const existingBuilding = await ctx.db
      .query("buildings")
      .withIndex("by_society_id", (q) => q.eq("society_id", societyId))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    if (!existingBuilding) {
      throw new Error("At least one building is required before activating a society");
    }

    return;
  }

  if (currentStatus === SOCIETY_STATUS.ACTIVE && nextStatus === SOCIETY_STATUS.INACTIVE) {
    return;
  }

  if (currentStatus === SOCIETY_STATUS.INACTIVE && nextStatus === SOCIETY_STATUS.ACTIVE) {
    return;
  }

  throw new Error(`Invalid society status transition: ${currentStatus} -> ${nextStatus}`);
}

type SocietyWithCounts = Doc<"societies"> & {
  building_count: number;
  guard_count: number;
  lead_count: number;
};

type SocietyLeadStats = {
  total: number;
  submitted: number;
  verified: number;
  rejected: number;
  duplicate: number;
};

async function getBuildingCount(ctx: QueryCtx, societyId: Id<"societies">): Promise<number> {
  const buildings = await ctx.db
    .query("buildings")
    .withIndex("by_society_id", (q) => q.eq("society_id", societyId))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  return buildings.length;
}

async function getGuardCount(ctx: QueryCtx, societyId: Id<"societies">): Promise<number> {
  const guards = await ctx.db
    .query("guard_profiles")
    .withIndex("by_society_id", (q) => q.eq("society_id", societyId))
    .collect();

  return guards.length;
}

async function getLeads(ctx: QueryCtx, societyId: Id<"societies">): Promise<Doc<"leads">[]> {
  return await ctx.db
    .query("leads")
    .withIndex("by_society_id", (q) => q.eq("society_id", societyId))
    .collect();
}

function buildLeadStats(leads: Doc<"leads">[]): SocietyLeadStats {
  const stats: SocietyLeadStats = {
    total: leads.length,
    submitted: 0,
    verified: 0,
    rejected: 0,
    duplicate: 0,
  };

  for (const lead of leads) {
    if (lead.status === LEAD_STATUS.SUBMITTED) {
      stats.submitted += 1;
      continue;
    }

    if (lead.status === LEAD_STATUS.VERIFIED) {
      stats.verified += 1;
      continue;
    }

    if (lead.status === LEAD_STATUS.REJECTED) {
      stats.rejected += 1;
      continue;
    }

    if (lead.status === LEAD_STATUS.DUPLICATE) {
      stats.duplicate += 1;
    }
  }

  return stats;
}

async function enrichSocietyWithCounts(
  ctx: QueryCtx,
  society: Doc<"societies">,
): Promise<SocietyWithCounts> {
  const [buildingCount, guardCount, leads] = await Promise.all([
    getBuildingCount(ctx, society._id),
    getGuardCount(ctx, society._id),
    getLeads(ctx, society._id),
  ]);

  return {
    ...society,
    building_count: buildingCount,
    guard_count: guardCount,
    lead_count: leads.length,
  };
}

export const create = mutation({
  args: {
    name: v.string(),
    city: v.string(),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.SOCIETIES_CREATE);
    const name = normalizeRequiredField(args.name, "Name");
    const city = normalizeRequiredField(args.city, "City");

    return await ctx.db.insert("societies", {
      name,
      city,
      address: normalizeOptionalField(args.address),
      notes: normalizeOptionalField(args.notes),
      status: SOCIETY_STATUS.ONBOARDING,
      created_by_admin_id: admin._id,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("societies"),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(societyStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SOCIETIES_EDIT);

    const society = await ctx.db.get(args.id);

    if (!society) {
      throw new Error("Society not found");
    }

    const patch: {
      name?: string;
      city?: string;
      address?: string;
      notes?: string;
      status?: SocietyStatus;
    } = {};

    if (args.name !== undefined) {
      patch.name = normalizeRequiredField(args.name, "Name");
    }

    if (args.city !== undefined) {
      patch.city = normalizeRequiredField(args.city, "City");
    }

    if (args.address !== undefined) {
      patch.address = normalizeOptionalField(args.address);
    }

    if (args.notes !== undefined) {
      patch.notes = normalizeOptionalField(args.notes);
    }

    if (args.status !== undefined) {
      await ensureValidStatusTransition(ctx, society._id, society.status, args.status);
      patch.status = args.status;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(society._id, patch);
    }

    return null;
  },
});

export const list = query({
  args: {
    status: v.optional(societyStatusValidator),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SOCIETIES_VIEW);

    const city = normalizeOptionalField(args.city);
    let societies: Doc<"societies">[] = [];

    if (args.status !== undefined) {
      societies = await ctx.db
        .query("societies")
        .withIndex("by_status", (q) => q.eq("status", args.status as SocietyStatus))
        .filter((q) =>
          city === undefined ? q.eq(q.field("status"), args.status) : q.eq(q.field("city"), city),
        )
        .collect();
    } else if (city !== undefined) {
      societies = await ctx.db
        .query("societies")
        .withIndex("by_city", (q) => q.eq("city", city))
        .collect();
    } else {
      societies = await ctx.db.query("societies").withIndex("by_name").collect();
    }

    const sortedSocieties = societies.sort((a, b) => a.name.localeCompare(b.name));

    // V1: ~3 societies, pagination and count optimization deferred.
    return await Promise.all(
      sortedSocieties.map((society) => enrichSocietyWithCounts(ctx, society)),
    );
  },
});

export const getById = query({
  args: {
    id: v.id("societies"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SOCIETIES_VIEW);

    const society = await ctx.db.get(args.id);

    if (!society) {
      return null;
    }

    const [buildingCount, guardCount, leads, recentLeads] = await Promise.all([
      getBuildingCount(ctx, society._id),
      getGuardCount(ctx, society._id),
      getLeads(ctx, society._id),
      ctx.db
        .query("leads")
        .withIndex("by_society_id", (q) => q.eq("society_id", society._id))
        .order("desc")
        .take(10),
    ]);

    return {
      ...society,
      building_count: buildingCount,
      guard_count: guardCount,
      lead_stats: buildLeadStats(leads),
      recent_leads: recentLeads,
    };
  },
});

export const search = query({
  args: {
    search: v.string(),
    city: v.optional(v.string()),
    status: v.optional(societyStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SOCIETIES_VIEW);

    const searchText = args.search.trim();
    const city = normalizeOptionalField(args.city);

    if (!searchText) {
      return [];
    }

    return await ctx.db
      .query("societies")
      .withSearchIndex("search_name", (q) => {
        let searchQuery = q.search("name", searchText);

        if (city !== undefined) {
          searchQuery = searchQuery.eq("city", city);
        }

        if (args.status !== undefined) {
          searchQuery = searchQuery.eq("status", args.status as SocietyStatus);
        }

        return searchQuery;
      })
      .take(50);
  },
});
