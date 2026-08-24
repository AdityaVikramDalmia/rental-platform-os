import { v } from "convex/values";
import { BUILDING_STATUS, LEAD_STATUS, PERMISSIONS, type BuildingStatus } from "../lib/constants";
import {
  validateFlatNumberTemplate,
  validateFloorLabels,
  type FlatNumberTemplate,
} from "../lib/validators";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireFieldWorker, requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const buildingStatusValidator = v.union(
  v.literal(BUILDING_STATUS.ACTIVE),
  v.literal(BUILDING_STATUS.INACTIVE),
);

const flatNumberTemplateValidator = v.object({
  prefix: v.optional(v.string()),
  floor_digits: v.number(),
  unit_digits: v.number(),
});

function normalizeRequiredName(value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error("Building name is required");
  }

  return normalizedValue;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeFlatNumberTemplateForStorage(
  template: FlatNumberTemplate | null,
): FlatNumberTemplate | undefined {
  if (template === null) {
    return undefined;
  }

  validateFlatNumberTemplate(template);

  const prefix = normalizeOptionalText(template.prefix);

  return {
    prefix,
    floor_digits: template.floor_digits,
    unit_digits: template.unit_digits,
  };
}

function validatePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return value;
}

async function ensureUniqueBuildingName(
  ctx: MutationCtx,
  args: {
    societyId: Id<"societies">;
    name: string;
    excludeBuildingId?: Id<"buildings">;
  },
): Promise<void> {
  const existingBuilding = await ctx.db
    .query("buildings")
    .withIndex("by_society_and_name", (q) =>
      q.eq("society_id", args.societyId).eq("name", args.name),
    )
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .first();

  if (!existingBuilding) {
    return;
  }

  if (args.excludeBuildingId && existingBuilding._id === args.excludeBuildingId) {
    return;
  }

  throw new Error("A building with this name already exists in this society");
}

function ensureValidStatusTransition(
  currentStatus: BuildingStatus,
  nextStatus: BuildingStatus,
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (currentStatus === BUILDING_STATUS.ACTIVE && nextStatus === BUILDING_STATUS.INACTIVE) {
    return;
  }

  if (currentStatus === BUILDING_STATUS.INACTIVE && nextStatus === BUILDING_STATUS.ACTIVE) {
    return;
  }

  throw new Error(`Invalid building status transition: ${currentStatus} -> ${nextStatus}`);
}

export const create = mutation({
  args: {
    society_id: v.id("societies"),
    name: v.string(),
    total_floors: v.number(),
    flats_per_floor: v.optional(v.number()),
    total_flats: v.optional(v.number()),
    floor_labels: v.array(v.string()),
    flat_number_template: v.optional(flatNumberTemplateValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.BUILDINGS_CREATE);

    const society = await ctx.db.get(args.society_id);

    if (!society) {
      throw new Error("Society not found");
    }

    const name = normalizeRequiredName(args.name);
    const totalFloors = validatePositiveInteger(args.total_floors, "Total floors");
    const floorLabels = validateFloorLabels(args.floor_labels);

    await ensureUniqueBuildingName(ctx, {
      societyId: args.society_id,
      name,
    });

    const flatsPerFloor =
      args.flats_per_floor === undefined
        ? undefined
        : validatePositiveInteger(args.flats_per_floor, "Flats per floor");

    const totalFlats =
      args.total_flats === undefined
        ? undefined
        : validatePositiveInteger(args.total_flats, "Total flats");

    const flatNumberTemplate =
      args.flat_number_template === undefined
        ? undefined
        : normalizeFlatNumberTemplateForStorage(args.flat_number_template);

    return await ctx.db.insert("buildings", {
      society_id: args.society_id,
      name,
      total_floors: totalFloors,
      flats_per_floor: flatsPerFloor,
      total_flats: totalFlats,
      floor_labels: floorLabels,
      flat_number_template: flatNumberTemplate,
      status: BUILDING_STATUS.ACTIVE,
      notes: normalizeOptionalText(args.notes),
      is_deleted: false,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("buildings"),
    name: v.optional(v.string()),
    total_floors: v.optional(v.number()),
    flats_per_floor: v.optional(v.number()),
    total_flats: v.optional(v.number()),
    floor_labels: v.optional(v.array(v.string())),
    flat_number_template: v.optional(v.union(flatNumberTemplateValidator, v.null())),
    status: v.optional(buildingStatusValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.BUILDINGS_EDIT);

    const building = await ctx.db.get(args.id);

    if (!building || building.is_deleted) {
      throw new Error("Building not found");
    }

    const patch: {
      name?: string;
      total_floors?: number;
      flats_per_floor?: number;
      total_flats?: number;
      floor_labels?: string[];
      flat_number_template?: {
        prefix?: string;
        floor_digits: number;
        unit_digits: number;
      };
      status?: BuildingStatus;
      notes?: string;
    } = {};

    if (args.name !== undefined) {
      const name = normalizeRequiredName(args.name);

      if (name !== building.name) {
        await ensureUniqueBuildingName(ctx, {
          societyId: building.society_id,
          name,
          excludeBuildingId: building._id,
        });
      }

      patch.name = name;
    }

    if (args.total_floors !== undefined) {
      patch.total_floors = validatePositiveInteger(args.total_floors, "Total floors");
    }

    if (args.flats_per_floor !== undefined) {
      patch.flats_per_floor = validatePositiveInteger(args.flats_per_floor, "Flats per floor");
    }

    if (args.total_flats !== undefined) {
      patch.total_flats = validatePositiveInteger(args.total_flats, "Total flats");
    }

    if (args.floor_labels !== undefined) {
      patch.floor_labels = validateFloorLabels(args.floor_labels);
    }

    if (args.flat_number_template !== undefined) {
      patch.flat_number_template = normalizeFlatNumberTemplateForStorage(args.flat_number_template);
    }

    if (args.status !== undefined) {
      ensureValidStatusTransition(building.status, args.status);
      patch.status = args.status;
    }

    if (args.notes !== undefined) {
      patch.notes = normalizeOptionalText(args.notes);
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(building._id, patch);
    }

    return null;
  },
});

export const softDelete = mutation({
  args: {
    id: v.id("buildings"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.BUILDINGS_DELETE);

    const building = await ctx.db.get(args.id);

    if (!building || building.is_deleted) {
      throw new Error("Building not found");
    }

    const activeLeads = await ctx.db
      .query("leads")
      .withIndex("by_building_id", (q) => q.eq("building_id", building._id))
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), LEAD_STATUS.REJECTED),
          q.neq(q.field("status"), LEAD_STATUS.DUPLICATE),
        ),
      )
      .collect();

    if (activeLeads.length > 0) {
      throw new Error("Cannot delete building with active leads. Set it to INACTIVE instead.");
    }

    await ctx.db.patch(building._id, {
      is_deleted: true,
    });

    return null;
  },
});

export const listBySociety = query({
  args: {
    society_id: v.id("societies"),
    status: v.optional(buildingStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.BUILDINGS_VIEW);

    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_society_id", (q) => q.eq("society_id", args.society_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const filteredBuildings =
      args.status === undefined
        ? buildings
        : buildings.filter((building) => building.status === args.status);

    return filteredBuildings.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listBySocietyForGuard = query({
  args: {
    society_id: v.id("societies"),
  },
  handler: async (ctx, args) => {
    const { guardProfile } = await requireFieldWorker(ctx);

    if (!guardProfile || guardProfile.society_id !== args.society_id) {
      throw new Error("Access denied: not your society");
    }

    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_society_id", (q) => q.eq("society_id", args.society_id))
      .filter((q) =>
        q.and(q.neq(q.field("is_deleted"), true), q.eq(q.field("status"), BUILDING_STATUS.ACTIVE)),
      )
      .collect();

    return buildings
      .map((b) => ({
        _id: b._id,
        name: b.name,
        flat_number_template: b.flat_number_template,
        total_floors: b.total_floors,
        floor_labels: b.floor_labels,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getById = query({
  args: {
    id: v.id("buildings"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.BUILDINGS_VIEW);

    const building = await ctx.db.get(args.id);

    if (!building || building.is_deleted) {
      return null;
    }

    const society = await ctx.db.get(building.society_id);

    return {
      ...building,
      society_name: society?.name ?? "Unknown society",
    };
  },
});
