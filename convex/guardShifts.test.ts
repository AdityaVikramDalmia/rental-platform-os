import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUARD_TYPE,
  LOCATION_TYPE,
  PERMISSIONS,
  SHIFT_TYPE,
  SOCIETY_STATUS,
  USER_STATUS,
  USER_TYPE,
} from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_shifts";
process.env.WORKOS_API_KEY ??= "sk_test_shifts";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_shifts";

const { authKit } = await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;

const WORKOS_ISSUER = "https://api.workos.com/";
const IST_MONDAY = new Date("2025-02-17T00:00:00+05:30").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function buildAuthKitUser(id: string): AuthKitUser {
  const timestamp = new Date(0).toISOString();

  return {
    id,
    email: `${id}@example.com`,
    createdAt: timestamp,
    updatedAt: timestamp,
    emailVerified: true,
    metadata: {},
    externalId: null,
    firstName: null,
    lastName: null,
    lastSignInAt: null,
    locale: null,
    profilePictureUrl: null,
  };
}

async function createTestAdmin(
  t: ReturnType<typeof convexTest>,
  options: {
    workosUserId: string;
    permissions?: string[];
    status?: "ACTIVE" | "INACTIVE" | "BANNED";
    name?: string;
  },
) {
  return await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      workos_user_id: options.workosUserId,
      user_type: USER_TYPE.ADMIN,
      name: options.name ?? `Admin ${options.workosUserId}`,
      email: `${options.workosUserId}@example.com`,
      status: options.status ?? USER_STATUS.ACTIVE,
      must_change_password: false,
    });

    const permissions = options.permissions ?? [];
    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Role ${options.workosUserId}`,
        permissions,
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });
    }

    return adminId;
  });
}

async function createTestSociety(
  t: ReturnType<typeof convexTest>,
  options: {
    adminId: Id<"users">;
    name: string;
    city?: string;
    status?: "ONBOARDING" | "ACTIVE" | "INACTIVE";
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("societies", {
      name: options.name,
      city: options.city ?? "Mumbai",
      status: options.status ?? SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: options.adminId,
    });
  });
}

async function createTestBuilding(
  t: ReturnType<typeof convexTest>,
  options: {
    societyId: Id<"societies">;
    name: string;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("buildings", {
      society_id: options.societyId,
      name: options.name,
      total_floors: 12,
      floor_labels: ["G", "1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
  });
}

async function createTestGuard(
  t: ReturnType<typeof convexTest>,
  options: {
    workosUserId: string;
    societyId: Id<"societies">;
    phone: string;
    name?: string;
    status?: "ACTIVE" | "INACTIVE" | "BANNED";
    guardType?: "BUILDING_SPECIFIC" | "MAIN_GATE" | "PARK" | "ROVING";
    mustChangePassword?: boolean;
  },
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      workos_user_id: options.workosUserId,
      user_type: USER_TYPE.GUARD,
      name: options.name ?? `Guard ${options.workosUserId}`,
      phone: options.phone,
      status: options.status ?? USER_STATUS.ACTIVE,
      must_change_password: options.mustChangePassword ?? false,
    });

    const guardProfileId = await ctx.db.insert("guard_profiles", {
      user_id: userId,
      society_id: options.societyId,
      guard_type: options.guardType ?? GUARD_TYPE.MAIN_GATE,
      has_seen_onboarding: false,
    });

    return { userId, guardProfileId };
  });
}

describe("guardShifts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-17T08:00:00+05:30"));

    vi.spyOn(authKit, "getAuthUser").mockImplementation(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity) {
        return null;
      }

      return buildAuthKitUser(identity.subject);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  void internal;

  describe("create", () => {
    let t: ReturnType<typeof convexTest>;
    let adminWorkosUserId: string;
    let adminId: Id<"users">;
    let societyId: Id<"societies">;
    let buildingId: Id<"buildings">;
    let guardUserId: Id<"users">;

    beforeEach(async () => {
      t = convexTest(schema, modules);
      adminWorkosUserId = "workos_guard_shifts_create_admin";
      adminId = await createTestAdmin(t, {
        workosUserId: adminWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_SHIFTS, PERMISSIONS.GUARDS_VIEW],
      });
      societyId = await createTestSociety(t, { adminId, name: "Create Shift Society" });
      buildingId = await createTestBuilding(t, { societyId, name: "Create Shift Tower" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_shifts_create_guard",
        societyId,
        phone: "9800000001",
      });
      guardUserId = guard.userId;
    });

    it("create RECURRING shift with day_of_week succeeds", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      const shiftId = await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: 1,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.MAIN_GATE,
      });

      const shift = await t.run(async (ctx) => await ctx.db.get(shiftId));
      expect(shiftId).toBeDefined();
      expect(shift?.shift_type).toBe(SHIFT_TYPE.RECURRING);
      expect(shift?.day_of_week).toBe(1);
    });

    it("create OVERRIDE shift with specific_date succeeds", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      const shiftId = await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.OVERRIDE,
        specific_date: IST_MONDAY,
        start_time: "10:00",
        end_time: "16:00",
        location_type: LOCATION_TYPE.OTHER,
        location_label: "Event Desk",
      });

      const shift = await t.run(async (ctx) => await ctx.db.get(shiftId));
      expect(shift?.shift_type).toBe(SHIFT_TYPE.OVERRIDE);
      expect(shift?.specific_date).toBe(IST_MONDAY);
    });

    it("create RECURRING without day_of_week throws", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guardShifts.create, {
          guard_user_id: guardUserId,
          shift_type: SHIFT_TYPE.RECURRING,
          start_time: "09:00",
          end_time: "18:00",
          location_type: LOCATION_TYPE.MAIN_GATE,
        }),
      ).rejects.toThrow("day_of_week is required");
    });

    it("create OVERRIDE without specific_date throws", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guardShifts.create, {
          guard_user_id: guardUserId,
          shift_type: SHIFT_TYPE.OVERRIDE,
          start_time: "09:00",
          end_time: "18:00",
          location_type: LOCATION_TYPE.MAIN_GATE,
        }),
      ).rejects.toThrow("specific_date is required");
    });

    it("create with BUILDING location and building_id succeeds", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      const shiftId = await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: 2,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.BUILDING,
        building_id: buildingId,
      });

      const shift = await t.run(async (ctx) => await ctx.db.get(shiftId));
      expect(shift?.location_type).toBe(LOCATION_TYPE.BUILDING);
      expect(shift?.building_id).toBe(buildingId);
    });

    it("create with BUILDING location without building_id throws", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guardShifts.create, {
          guard_user_id: guardUserId,
          shift_type: SHIFT_TYPE.RECURRING,
          day_of_week: 3,
          start_time: "09:00",
          end_time: "18:00",
          location_type: LOCATION_TYPE.BUILDING,
        }),
      ).rejects.toThrow("building_id is required");
    });

    it("create with non-BUILDING location and building_id throws", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guardShifts.create, {
          guard_user_id: guardUserId,
          shift_type: SHIFT_TYPE.RECURRING,
          day_of_week: 4,
          start_time: "09:00",
          end_time: "18:00",
          location_type: LOCATION_TYPE.MAIN_GATE,
          building_id: buildingId,
        }),
      ).rejects.toThrow("building_id not allowed");
    });

    it("create with invalid time format throws", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guardShifts.create, {
          guard_user_id: guardUserId,
          shift_type: SHIFT_TYPE.RECURRING,
          day_of_week: 5,
          start_time: "6:00",
          end_time: "18:00",
          location_type: LOCATION_TYPE.MAIN_GATE,
        }),
      ).rejects.toThrow("Invalid time format");
    });

    it("create with non-existent guard_user_id throws", async () => {
      const deletedGuard = await createTestGuard(t, {
        workosUserId: "workos_guard_shifts_deleted_guard",
        societyId,
        phone: "9800000002",
      });
      await t.run(async (ctx) => {
        await ctx.db.delete(deletedGuard.userId);
      });

      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      await expect(
        authed.mutation(api.guardShifts.create, {
          guard_user_id: deletedGuard.userId,
          shift_type: SHIFT_TYPE.RECURRING,
          day_of_week: 1,
          start_time: "09:00",
          end_time: "18:00",
          location_type: LOCATION_TYPE.MAIN_GATE,
        }),
      ).rejects.toThrow("Guard not found");
    });

    it("create without permission throws", async () => {
      const limitedAdminWorkosUserId = "workos_guard_shifts_create_limited_admin";
      await createTestAdmin(t, {
        workosUserId: limitedAdminWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });

      const authed = t.withIdentity({ subject: limitedAdminWorkosUserId, issuer: WORKOS_ISSUER });
      await expect(
        authed.mutation(api.guardShifts.create, {
          guard_user_id: guardUserId,
          shift_type: SHIFT_TYPE.RECURRING,
          day_of_week: 1,
          start_time: "09:00",
          end_time: "18:00",
          location_type: LOCATION_TYPE.MAIN_GATE,
        }),
      ).rejects.toThrow("Missing permission");
    });
  });

  describe("update", () => {
    let t: ReturnType<typeof convexTest>;
    let adminWorkosUserId: string;
    let adminId: Id<"users">;
    let societyId: Id<"societies">;
    let buildingId: Id<"buildings">;
    let guardUserId: Id<"users">;
    let recurringShiftId: Id<"guard_shifts">;
    let overrideShiftId: Id<"guard_shifts">;

    beforeEach(async () => {
      t = convexTest(schema, modules);
      adminWorkosUserId = "workos_guard_shifts_update_admin";
      adminId = await createTestAdmin(t, {
        workosUserId: adminWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_SHIFTS, PERMISSIONS.GUARDS_VIEW],
      });
      societyId = await createTestSociety(t, { adminId, name: "Update Shift Society" });
      buildingId = await createTestBuilding(t, { societyId, name: "Update Shift Tower" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_shifts_update_guard",
        societyId,
        phone: "9800000011",
      });
      guardUserId = guard.userId;

      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      recurringShiftId = await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: 1,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.BUILDING,
        building_id: buildingId,
      });
      overrideShiftId = await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.OVERRIDE,
        specific_date: IST_MONDAY,
        start_time: "10:00",
        end_time: "16:00",
        location_type: LOCATION_TYPE.OTHER,
        location_label: "Temporary Post",
      });
    });

    it("update start_time and end_time succeeds", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      await authed.mutation(api.guardShifts.update, {
        shift_id: recurringShiftId,
        start_time: "08:00",
        end_time: "17:00",
      });

      const updated = await t.run(async (ctx) => await ctx.db.get(recurringShiftId));
      expect(updated?.start_time).toBe("08:00");
      expect(updated?.end_time).toBe("17:00");
    });

    it("update deleted shift throws Shift not found", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      await authed.mutation(api.guardShifts.softDelete, { shift_id: recurringShiftId });

      await expect(
        authed.mutation(api.guardShifts.update, {
          shift_id: recurringShiftId,
          start_time: "07:00",
        }),
      ).rejects.toThrow("Shift not found");
    });

    it("update day_of_week on OVERRIDE shift throws", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guardShifts.update, {
          shift_id: overrideShiftId,
          day_of_week: 2,
        }),
      ).rejects.toThrow("day_of_week can only be updated for RECURRING");
    });
  });

  describe("softDelete", () => {
    let t: ReturnType<typeof convexTest>;
    let adminWorkosUserId: string;
    let adminId: Id<"users">;
    let societyId: Id<"societies">;
    let guardUserId: Id<"users">;
    let shiftId: Id<"guard_shifts">;

    beforeEach(async () => {
      t = convexTest(schema, modules);
      adminWorkosUserId = "workos_guard_shifts_soft_delete_admin";
      adminId = await createTestAdmin(t, {
        workosUserId: adminWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_SHIFTS, PERMISSIONS.GUARDS_VIEW],
      });
      societyId = await createTestSociety(t, { adminId, name: "Delete Shift Society" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_shifts_soft_delete_guard",
        societyId,
        phone: "9800000021",
      });
      guardUserId = guard.userId;

      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      shiftId = await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: 1,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.MAIN_GATE,
      });
    });

    it("softDelete existing shift sets is_deleted true", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      await authed.mutation(api.guardShifts.softDelete, { shift_id: shiftId });

      const deleted = await t.run(async (ctx) => await ctx.db.get(shiftId));
      expect(deleted?.is_deleted).toBe(true);
    });

    it("softDelete already-deleted shift throws", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      await authed.mutation(api.guardShifts.softDelete, { shift_id: shiftId });

      await expect(
        authed.mutation(api.guardShifts.softDelete, { shift_id: shiftId }),
      ).rejects.toThrow("Shift not found");
    });
  });

  describe("listByGuard", () => {
    let t: ReturnType<typeof convexTest>;
    let adminWorkosUserId: string;
    let adminId: Id<"users">;
    let societyId: Id<"societies">;
    let guardUserId: Id<"users">;

    beforeEach(async () => {
      t = convexTest(schema, modules);
      adminWorkosUserId = "workos_guard_shifts_list_admin";
      adminId = await createTestAdmin(t, {
        workosUserId: adminWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_SHIFTS, PERMISSIONS.GUARDS_VIEW],
      });
      societyId = await createTestSociety(t, { adminId, name: "List Shift Society" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_shifts_list_guard",
        societyId,
        phone: "9800000031",
      });
      guardUserId = guard.userId;
    });

    it("returns only non-deleted shifts", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      const recurringShiftId = await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: 1,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.MAIN_GATE,
      });
      await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.OVERRIDE,
        specific_date: IST_MONDAY,
        start_time: "10:00",
        end_time: "16:00",
        location_type: LOCATION_TYPE.OTHER,
      });

      await authed.mutation(api.guardShifts.softDelete, { shift_id: recurringShiftId });

      const shifts = await authed.query(api.guardShifts.listByGuard, {
        guard_user_id: guardUserId,
      });

      expect(shifts).toHaveLength(1);
      expect(shifts[0].shift_type).toBe(SHIFT_TYPE.OVERRIDE);
      expect(shifts[0].is_deleted).toBe(false);
    });

    it("filter by shift_type works", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: 1,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.MAIN_GATE,
      });
      await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.OVERRIDE,
        specific_date: IST_MONDAY,
        start_time: "10:00",
        end_time: "16:00",
        location_type: LOCATION_TYPE.OTHER,
      });

      const overrideOnly = await authed.query(api.guardShifts.listByGuard, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.OVERRIDE,
      });

      expect(overrideOnly).toHaveLength(1);
      expect(overrideOnly[0].shift_type).toBe(SHIFT_TYPE.OVERRIDE);
    });
  });

  describe("getSchedule", () => {
    let t: ReturnType<typeof convexTest>;
    let adminWorkosUserId: string;
    let adminId: Id<"users">;
    let societyId: Id<"societies">;
    let guardUserId: Id<"users">;

    beforeEach(async () => {
      t = convexTest(schema, modules);
      adminWorkosUserId = "workos_guard_shifts_schedule_admin";
      adminId = await createTestAdmin(t, {
        workosUserId: adminWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_SHIFTS, PERMISSIONS.GUARDS_VIEW],
      });
      societyId = await createTestSociety(t, { adminId, name: "Schedule Shift Society" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_shifts_schedule_guard",
        societyId,
        phone: "9800000041",
      });
      guardUserId = guard.userId;
    });

    it("date with override returns OVERRIDE source and not recurring", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      const mondayDay = new Date(IST_MONDAY).getDay();

      await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: mondayDay,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.MAIN_GATE,
      });
      await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.OVERRIDE,
        specific_date: IST_MONDAY,
        start_time: "12:00",
        end_time: "15:00",
        location_type: LOCATION_TYPE.OTHER,
      });

      const schedule = await authed.query(api.guardShifts.getSchedule, {
        guard_user_id: guardUserId,
        from_date: IST_MONDAY,
        to_date: IST_MONDAY,
      });

      expect(schedule).toHaveLength(1);
      expect(schedule[0].source).toBe("OVERRIDE");
      expect(schedule[0].shifts).toHaveLength(1);
      expect(schedule[0].shifts[0].shift_type).toBe(SHIFT_TYPE.OVERRIDE);
    });

    it("date without override falls back to recurring", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      const tuesday = IST_MONDAY + DAY_MS;
      const tuesdayDay = new Date(tuesday).getDay();

      await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: tuesdayDay,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.MAIN_GATE,
      });

      const schedule = await authed.query(api.guardShifts.getSchedule, {
        guard_user_id: guardUserId,
        from_date: tuesday,
        to_date: tuesday,
      });

      expect(schedule).toHaveLength(1);
      expect(schedule[0].source).toBe("RECURRING");
      expect(schedule[0].shifts).toHaveLength(1);
      expect(schedule[0].shifts[0].shift_type).toBe(SHIFT_TYPE.RECURRING);
    });

    it("date with no shifts returns source NONE", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      const schedule = await authed.query(api.guardShifts.getSchedule, {
        guard_user_id: guardUserId,
        from_date: IST_MONDAY,
        to_date: IST_MONDAY,
      });

      expect(schedule).toHaveLength(1);
      expect(schedule[0].source).toBe("NONE");
      expect(schedule[0].shifts).toHaveLength(0);
    });

    it("range greater than 30 days throws", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.query(api.guardShifts.getSchedule, {
          guard_user_id: guardUserId,
          from_date: IST_MONDAY,
          to_date: IST_MONDAY + 31 * DAY_MS,
        }),
      ).rejects.toThrow("Date range cannot exceed 30 days");
    });

    it("soft-deleted override falls back to recurring for that date", async () => {
      const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      const mondayDay = new Date(IST_MONDAY).getDay();

      await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.RECURRING,
        day_of_week: mondayDay,
        start_time: "09:00",
        end_time: "18:00",
        location_type: LOCATION_TYPE.MAIN_GATE,
      });
      const overrideShiftId = await authed.mutation(api.guardShifts.create, {
        guard_user_id: guardUserId,
        shift_type: SHIFT_TYPE.OVERRIDE,
        specific_date: IST_MONDAY,
        start_time: "12:00",
        end_time: "15:00",
        location_type: LOCATION_TYPE.OTHER,
      });
      await authed.mutation(api.guardShifts.softDelete, { shift_id: overrideShiftId });

      const schedule = await authed.query(api.guardShifts.getSchedule, {
        guard_user_id: guardUserId,
        from_date: IST_MONDAY,
        to_date: IST_MONDAY,
      });

      expect(schedule).toHaveLength(1);
      expect(schedule[0].source).toBe("RECURRING");
      expect(schedule[0].shifts).toHaveLength(1);
      expect(schedule[0].shifts[0].shift_type).toBe(SHIFT_TYPE.RECURRING);
    });
  });

  describe("getMySchedule", () => {
    let t: ReturnType<typeof convexTest>;
    let adminWorkosUserId: string;
    let guardWorkosUserId: string;
    let adminId: Id<"users">;
    let societyId: Id<"societies">;

    beforeEach(async () => {
      t = convexTest(schema, modules);
      adminWorkosUserId = "workos_guard_shifts_my_schedule_admin";
      guardWorkosUserId = "workos_guard_shifts_my_schedule_guard";
      adminId = await createTestAdmin(t, {
        workosUserId: adminWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_SHIFTS, PERMISSIONS.GUARDS_VIEW],
      });
      societyId = await createTestSociety(t, { adminId, name: "My Schedule Society" });
      const guard = await createTestGuard(t, {
        workosUserId: guardWorkosUserId,
        societyId,
        phone: "9800000051",
      });

      const authedAdmin = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });
      await authedAdmin.mutation(api.guardShifts.create, {
        guard_user_id: guard.userId,
        shift_type: SHIFT_TYPE.OVERRIDE,
        specific_date: IST_MONDAY,
        start_time: "10:00",
        end_time: "16:00",
        location_type: LOCATION_TYPE.OTHER,
      });
    });

    it("guard can view own schedule", async () => {
      const authedGuard = t.withIdentity({ subject: guardWorkosUserId, issuer: WORKOS_ISSUER });

      const schedule = await authedGuard.query(api.guardShifts.getMySchedule, {
        from_date: IST_MONDAY,
        to_date: IST_MONDAY,
      });

      expect(schedule).toHaveLength(1);
      expect(schedule[0].source).toBe("OVERRIDE");
      expect(schedule[0].shifts).toHaveLength(1);
    });

    it("range greater than 7 days throws", async () => {
      const authedGuard = t.withIdentity({ subject: guardWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authedGuard.query(api.guardShifts.getMySchedule, {
          from_date: IST_MONDAY,
          to_date: IST_MONDAY + 8 * DAY_MS,
        }),
      ).rejects.toThrow("Date range cannot exceed 7 days");
    });
  });
});
