import { v } from "convex/values";
import {
  LOCATION_TYPE,
  PERMISSIONS,
  SHIFT_TYPE,
  USER_TYPE,
  type LocationType,
  type ShiftType,
} from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireAuth, requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const TIME_FORMAT_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function validateTimeFormat(time: string): void {
  if (!TIME_FORMAT_REGEX.test(time)) {
    throw new Error("Invalid time format. Use HH:MM (24-hour)");
  }
}

function ensureShiftType(value: string): ShiftType {
  if (!Object.values(SHIFT_TYPE).includes(value as ShiftType)) {
    throw new Error("Invalid shift type");
  }

  return value as ShiftType;
}

function ensureLocationType(value: string): LocationType {
  if (!Object.values(LOCATION_TYPE).includes(value as LocationType)) {
    throw new Error("Invalid location type");
  }

  return value as LocationType;
}

function validateDayOfWeek(dayOfWeek: number): void {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error("day_of_week must be an integer between 0 and 6");
  }
}

function validateSpecificDate(timestamp: number): void {
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new Error("specific_date must be a Unix millisecond timestamp");
  }
}

function getStartOfDayIST(ms: number): number {
  const istMs = ms + IST_OFFSET_MS;
  const dayStart = Math.floor(istMs / DAY_MS) * DAY_MS;
  return dayStart - IST_OFFSET_MS;
}

function getDayOfWeek(dateMs: number): number {
  return new Date(dateMs).getDay();
}

function getDateRange(fromMs: number, toMs: number): number[] {
  const start = getStartOfDayIST(fromMs);
  const end = getStartOfDayIST(toMs);
  const dates: number[] = [];

  for (let current = start; current <= end; current += DAY_MS) {
    dates.push(current);
  }

  return dates;
}

type EnrichedShift = Doc<"guard_shifts"> & {
  building_name: string | null;
  location_display: string;
};

type ScheduleSource = "OVERRIDE" | "RECURRING" | "NONE";

type ScheduleDay = {
  date: number;
  day_of_week: number;
  shifts: EnrichedShift[];
  source: ScheduleSource;
};

async function enrichShiftWithBuilding(
  ctx: QueryCtx,
  shift: Doc<"guard_shifts">,
): Promise<EnrichedShift> {
  const building = shift.building_id ? await ctx.db.get(shift.building_id) : null;
  const buildingName = building?.name ?? null;
  let locationDisplay = "Other";

  if (shift.location_type === LOCATION_TYPE.BUILDING) {
    locationDisplay = buildingName ?? "Building";
  }

  if (shift.location_type === LOCATION_TYPE.MAIN_GATE) {
    locationDisplay = "Main Gate";
  }

  if (shift.location_type === LOCATION_TYPE.PARK) {
    locationDisplay = shift.location_label ?? "Park Area";
  }

  if (shift.location_type === LOCATION_TYPE.PARKING) {
    locationDisplay = shift.location_label ?? "Parking";
  }

  if (shift.location_type === LOCATION_TYPE.OTHER) {
    locationDisplay = shift.location_label ?? "Other";
  }

  return {
    ...shift,
    building_name: buildingName,
    location_display: locationDisplay,
  };
}

async function computeSchedule(
  ctx: QueryCtx,
  guardUserId: Id<"users">,
  fromDate: number,
  toDate: number,
): Promise<ScheduleDay[]> {
  const dates = getDateRange(fromDate, toDate);
  const schedule: ScheduleDay[] = [];

  for (const date of dates) {
    const dayOfWeek = getDayOfWeek(date);
    const overrideShifts = await ctx.db
      .query("guard_shifts")
      .withIndex("by_guard_and_date", (q) =>
        q.eq("guard_user_id", guardUserId).eq("specific_date", date),
      )
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    if (overrideShifts.length > 0) {
      const enrichedOverrideShifts = await Promise.all(
        overrideShifts.map((shift) => enrichShiftWithBuilding(ctx, shift)),
      );

      schedule.push({
        date,
        day_of_week: dayOfWeek,
        shifts: enrichedOverrideShifts,
        source: "OVERRIDE",
      });

      continue;
    }

    const recurringShifts = await ctx.db
      .query("guard_shifts")
      .withIndex("by_guard_and_day", (q) =>
        q.eq("guard_user_id", guardUserId).eq("day_of_week", dayOfWeek),
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("is_deleted"), true),
          q.eq(q.field("shift_type"), SHIFT_TYPE.RECURRING),
        ),
      )
      .collect();

    if (recurringShifts.length > 0) {
      const enrichedRecurringShifts = await Promise.all(
        recurringShifts.map((shift) => enrichShiftWithBuilding(ctx, shift)),
      );

      schedule.push({
        date,
        day_of_week: dayOfWeek,
        shifts: enrichedRecurringShifts,
        source: "RECURRING",
      });

      continue;
    }

    schedule.push({
      date,
      day_of_week: dayOfWeek,
      shifts: [],
      source: "NONE",
    });
  }

  return schedule;
}

export const create = mutation({
  args: {
    guard_user_id: v.id("users"),
    shift_type: v.string(),
    day_of_week: v.optional(v.number()),
    specific_date: v.optional(v.number()),
    start_time: v.string(),
    end_time: v.string(),
    location_type: v.string(),
    building_id: v.optional(v.id("buildings")),
    location_label: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.GUARDS_MANAGE_SHIFTS);
    const guard = await ctx.db.get(args.guard_user_id);

    if (!guard || guard.user_type !== USER_TYPE.GUARD) {
      throw new Error("Guard not found");
    }

    const shiftType = ensureShiftType(args.shift_type);

    if (shiftType === SHIFT_TYPE.RECURRING) {
      if (args.day_of_week === undefined) {
        throw new Error("day_of_week is required for RECURRING shifts");
      }

      if (args.specific_date !== undefined) {
        throw new Error("specific_date is not allowed for RECURRING shifts");
      }

      validateDayOfWeek(args.day_of_week);
    }

    if (shiftType === SHIFT_TYPE.OVERRIDE) {
      if (args.specific_date === undefined) {
        throw new Error("specific_date is required for OVERRIDE shifts");
      }

      if (args.day_of_week !== undefined) {
        throw new Error("day_of_week is not allowed for OVERRIDE shifts");
      }

      validateSpecificDate(args.specific_date);
    }

    validateTimeFormat(args.start_time);
    validateTimeFormat(args.end_time);

    const locationType = ensureLocationType(args.location_type);

    if (locationType === LOCATION_TYPE.BUILDING) {
      if (args.building_id === undefined) {
        throw new Error("building_id is required for BUILDING locations");
      }

      const building = await ctx.db.get(args.building_id);

      if (!building || building.is_deleted) {
        throw new Error("Building not found");
      }
    }

    if (locationType !== LOCATION_TYPE.BUILDING && args.building_id !== undefined) {
      throw new Error("building_id not allowed for non-BUILDING locations");
    }

    return await ctx.db.insert("guard_shifts", {
      guard_user_id: args.guard_user_id,
      shift_type: shiftType,
      day_of_week: args.day_of_week,
      specific_date: args.specific_date,
      start_time: args.start_time,
      end_time: args.end_time,
      location_type: locationType,
      building_id: args.building_id,
      location_label: args.location_label,
      notes: args.notes,
      created_by_admin_id: admin._id,
      is_deleted: false,
    });
  },
});

export const update = mutation({
  args: {
    shift_id: v.id("guard_shifts"),
    day_of_week: v.optional(v.number()),
    specific_date: v.optional(v.number()),
    start_time: v.optional(v.string()),
    end_time: v.optional(v.string()),
    location_type: v.optional(v.string()),
    building_id: v.optional(v.id("buildings")),
    location_label: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_MANAGE_SHIFTS);

    const shift = await ctx.db.get(args.shift_id);

    if (!shift || shift.is_deleted) {
      throw new Error("Shift not found");
    }

    const patch: {
      day_of_week?: number;
      specific_date?: number;
      start_time?: string;
      end_time?: string;
      location_type?: LocationType;
      building_id?: typeof shift.building_id;
      location_label?: string;
      notes?: string;
    } = {};

    if (args.day_of_week !== undefined) {
      if (shift.shift_type !== SHIFT_TYPE.RECURRING) {
        throw new Error("day_of_week can only be updated for RECURRING shifts");
      }

      validateDayOfWeek(args.day_of_week);
      patch.day_of_week = args.day_of_week;
    }

    if (args.specific_date !== undefined) {
      if (shift.shift_type !== SHIFT_TYPE.OVERRIDE) {
        throw new Error("specific_date can only be updated for OVERRIDE shifts");
      }

      validateSpecificDate(args.specific_date);
      patch.specific_date = args.specific_date;
    }

    if (args.start_time !== undefined) {
      validateTimeFormat(args.start_time);
      patch.start_time = args.start_time;
    }

    if (args.end_time !== undefined) {
      validateTimeFormat(args.end_time);
      patch.end_time = args.end_time;
    }

    const locationType =
      args.location_type !== undefined
        ? ensureLocationType(args.location_type)
        : shift.location_type;

    if (args.location_type !== undefined) {
      patch.location_type = locationType;

      if (locationType !== LOCATION_TYPE.BUILDING) {
        if (args.building_id !== undefined) {
          throw new Error("building_id not allowed for non-BUILDING locations");
        }

        patch.building_id = undefined;
      }
    }

    if (args.building_id !== undefined) {
      if (locationType !== LOCATION_TYPE.BUILDING) {
        throw new Error("building_id not allowed for non-BUILDING locations");
      }

      const building = await ctx.db.get(args.building_id);

      if (!building || building.is_deleted) {
        throw new Error("Building not found");
      }

      patch.building_id = args.building_id;
    }

    if (args.location_label !== undefined) {
      patch.location_label = args.location_label;
    }

    if (args.notes !== undefined) {
      patch.notes = args.notes;
    }

    const finalLocationType = patch.location_type ?? shift.location_type;
    const finalBuildingId = Object.prototype.hasOwnProperty.call(patch, "building_id")
      ? patch.building_id
      : shift.building_id;

    if (finalLocationType === LOCATION_TYPE.BUILDING) {
      if (finalBuildingId === undefined) {
        throw new Error("building_id is required for BUILDING locations");
      }

      const building = await ctx.db.get(finalBuildingId);

      if (!building || building.is_deleted) {
        throw new Error("Building not found");
      }
    }

    if (finalLocationType !== LOCATION_TYPE.BUILDING && finalBuildingId !== undefined) {
      throw new Error("building_id not allowed for non-BUILDING locations");
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(shift._id, patch);
    }

    return null;
  },
});

export const softDelete = mutation({
  args: {
    shift_id: v.id("guard_shifts"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_MANAGE_SHIFTS);

    const shift = await ctx.db.get(args.shift_id);

    if (!shift || shift.is_deleted) {
      throw new Error("Shift not found");
    }

    await ctx.db.patch(shift._id, {
      is_deleted: true,
    });

    return null;
  },
});

export const listByGuard = query({
  args: {
    guard_user_id: v.id("users"),
    shift_type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_VIEW);

    const shiftType = args.shift_type === undefined ? undefined : ensureShiftType(args.shift_type);
    const shifts = await ctx.db
      .query("guard_shifts")
      .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", args.guard_user_id))
      .filter((q) =>
        shiftType === undefined
          ? q.neq(q.field("is_deleted"), true)
          : q.and(q.neq(q.field("is_deleted"), true), q.eq(q.field("shift_type"), shiftType)),
      )
      .collect();
    const enrichedShifts = await Promise.all(
      shifts.map((shift) => enrichShiftWithBuilding(ctx, shift)),
    );

    return enrichedShifts.sort((a, b) => {
      if (a.shift_type === b.shift_type) {
        if (a.shift_type === SHIFT_TYPE.RECURRING) {
          return (a.day_of_week ?? 7) - (b.day_of_week ?? 7);
        }

        return (
          (a.specific_date ?? Number.MAX_SAFE_INTEGER) -
          (b.specific_date ?? Number.MAX_SAFE_INTEGER)
        );
      }

      return a.shift_type === SHIFT_TYPE.RECURRING ? -1 : 1;
    });
  },
});

export const getSchedule = query({
  args: {
    guard_user_id: v.id("users"),
    from_date: v.number(),
    to_date: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_VIEW);

    if (args.from_date > args.to_date) {
      throw new Error("from_date must be less than or equal to to_date");
    }

    if (args.to_date - args.from_date > 30 * DAY_MS) {
      throw new Error("Date range cannot exceed 30 days");
    }

    return await computeSchedule(ctx, args.guard_user_id, args.from_date, args.to_date);
  },
});

export const getMySchedule = query({
  args: {
    from_date: v.number(),
    to_date: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (user.user_type !== USER_TYPE.GUARD) {
      throw new Error("Guard access required");
    }

    if (args.from_date > args.to_date) {
      throw new Error("from_date must be less than or equal to to_date");
    }

    if (args.to_date - args.from_date > 7 * DAY_MS) {
      throw new Error("Date range cannot exceed 7 days");
    }

    return await computeSchedule(ctx, user._id, args.from_date, args.to_date);
  },
});
