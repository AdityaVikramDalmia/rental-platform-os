import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILDING_STATUS, LEAD_STATUS, PERMISSIONS, SOCIETY_STATUS } from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_buildings";
process.env.WORKOS_API_KEY ??= "sk_test_buildings";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_buildings";

const { authKit } = await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;

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

async function createAdminWithPermissions(
  t: ReturnType<typeof convexTest>,
  options: { workosUserId: string; permissions: string[] },
) {
  return await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      workos_user_id: options.workosUserId,
      user_type: "ADMIN",
      name: `Admin ${options.workosUserId}`,
      email: `${options.workosUserId}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });

    if (options.permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Role ${options.workosUserId}`,
        permissions: options.permissions,
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

async function createSociety(
  t: ReturnType<typeof convexTest>,
  options: { adminId: Id<"users">; name: string; city: string },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("societies", {
      name: options.name,
      city: options.city,
      status: SOCIETY_STATUS.ONBOARDING,
      created_by_admin_id: options.adminId,
    });
  });
}

async function createBuildingRecord(
  t: ReturnType<typeof convexTest>,
  options: {
    societyId: Id<"societies">;
    name: string;
    status?: "ACTIVE" | "INACTIVE";
    isDeleted?: boolean;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("buildings", {
      society_id: options.societyId,
      name: options.name,
      total_floors: 12,
      flats_per_floor: 4,
      total_flats: 48,
      floor_labels: ["G", "1", "2"],
      flat_number_template: {
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      },
      status: options.status ?? BUILDING_STATUS.ACTIVE,
      notes: "Seed building",
      is_deleted: options.isDeleted ?? false,
    });
  });
}

async function createGuard(t: ReturnType<typeof convexTest>, workosUserId: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: "GUARD",
      name: `Guard ${workosUserId}`,
      phone: "9999999999",
      status: "ACTIVE",
      must_change_password: false,
    });
  });
}

async function createLead(
  t: ReturnType<typeof convexTest>,
  options: {
    societyId: Id<"societies">;
    buildingId: Id<"buildings">;
    guardId: Id<"users">;
    status: "SUBMITTED" | "NEED_INFO" | "VERIFIED" | "REJECTED" | "DUPLICATE";
    flatNumber: string;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("leads", {
      society_id: options.societyId,
      building_id: options.buildingId,
      floor_number: "1",
      flat_number: options.flatNumber,
      owner_phone: "8888888888",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: options.guardId,
      status: options.status,
    });
  });
}

describe("buildings", () => {
  beforeEach(() => {
    vi.spyOn(authKit, "getAuthUser").mockImplementation(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity) {
        return null;
      }

      return buildAuthKitUser(identity.subject);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("create succeeds with defaults and normalized values", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_create_happy";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_CREATE],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Palm Society",
      city: "Mumbai",
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    const buildingId = await authed.mutation(api.buildings.create, {
      society_id: societyId,
      name: "  Tower A  ",
      total_floors: 20,
      flats_per_floor: 2,
      floor_labels: [" g ", " 1 ", "2"],
      flat_number_template: {
        prefix: " A- ",
        floor_digits: 2,
        unit_digits: 2,
      },
      notes: "  Main tower  ",
    });

    const building = await t.run(async (ctx) => await ctx.db.get(buildingId));

    expect(building?.name).toBe("Tower A");
    expect(building?.status).toBe(BUILDING_STATUS.ACTIVE);
    expect(building?.is_deleted).toBe(false);
    expect(building?.floor_labels).toEqual(["G", "1", "2"]);
    expect(building?.flat_number_template).toEqual({
      prefix: "A-",
      floor_digits: 2,
      unit_digits: 2,
    });
    expect(building?.notes).toBe("Main tower");
  });

  it("create rejects invalid society id", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_create_invalid_society";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_CREATE],
    });
    const missingSocietyId = await createSociety(t, {
      adminId,
      name: "Missing Society",
      city: "Mumbai",
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(missingSocietyId);
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await expect(
      authed.mutation(api.buildings.create, {
        society_id: missingSocietyId,
        name: "Tower A",
        total_floors: 10,
        floor_labels: ["G", "1"],
      }),
    ).rejects.toThrow("Society not found");
  });

  it("create enforces uniqueness within a society and allows same name in another society", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_create_uniqueness";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_CREATE],
    });
    const societyOneId = await createSociety(t, {
      adminId,
      name: "Alpha Society",
      city: "Mumbai",
    });
    const societyTwoId = await createSociety(t, {
      adminId,
      name: "Beta Society",
      city: "Pune",
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await authed.mutation(api.buildings.create, {
      society_id: societyOneId,
      name: "Tower A",
      total_floors: 10,
      floor_labels: ["G", "1"],
    });

    await expect(
      authed.mutation(api.buildings.create, {
        society_id: societyOneId,
        name: "Tower A",
        total_floors: 10,
        floor_labels: ["G", "1"],
      }),
    ).rejects.toThrow("A building with this name already exists in this society");

    await expect(
      authed.mutation(api.buildings.create, {
        society_id: societyTwoId,
        name: "Tower A",
        total_floors: 10,
        floor_labels: ["G", "1"],
      }),
    ).resolves.toBeDefined();
  });

  it("create rejects unauthorized caller", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_create_unauthorized";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_VIEW],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Unauthorized Society",
      city: "Mumbai",
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await expect(
      authed.mutation(api.buildings.create, {
        society_id: societyId,
        name: "Tower A",
        total_floors: 10,
        floor_labels: ["G", "1"],
      }),
    ).rejects.toThrow("Missing permission: buildings.create");
  });

  it("update edits fields and toggles status", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_update_fields";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_EDIT],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Update Society",
      city: "Mumbai",
    });
    const buildingId = await createBuildingRecord(t, {
      societyId,
      name: "Old Name",
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await authed.mutation(api.buildings.update, {
      id: buildingId,
      name: "  New Name  ",
      total_floors: 16,
      flats_per_floor: 3,
      total_flats: 45,
      floor_labels: ["g", "1", "2", "3"],
      flat_number_template: {
        prefix: " B- ",
        floor_digits: 2,
        unit_digits: 3,
      },
      notes: "  Updated notes  ",
      status: BUILDING_STATUS.INACTIVE,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get(buildingId));

    expect(updated?.name).toBe("New Name");
    expect(updated?.total_floors).toBe(16);
    expect(updated?.status).toBe(BUILDING_STATUS.INACTIVE);
    expect(updated?.floor_labels).toEqual(["G", "1", "2", "3"]);
    expect(updated?.flat_number_template).toEqual({
      prefix: "B-",
      floor_digits: 2,
      unit_digits: 3,
    });
    expect(updated?.notes).toBe("Updated notes");
  });

  it("update enforces name uniqueness and rejects soft deleted buildings", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_update_uniqueness";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_EDIT],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Uniq Society",
      city: "Mumbai",
    });
    const towerAId = await createBuildingRecord(t, {
      societyId,
      name: "Tower A",
    });
    const towerBId = await createBuildingRecord(t, {
      societyId,
      name: "Tower B",
    });
    const deletedBuildingId = await createBuildingRecord(t, {
      societyId,
      name: "Deleted Tower",
      isDeleted: true,
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await expect(
      authed.mutation(api.buildings.update, {
        id: towerBId,
        name: "Tower A",
      }),
    ).rejects.toThrow("A building with this name already exists in this society");

    await expect(
      authed.mutation(api.buildings.update, {
        id: deletedBuildingId,
        name: "New Name",
      }),
    ).rejects.toThrow("Building not found");

    await expect(
      authed.mutation(api.buildings.update, {
        id: towerAId,
        status: BUILDING_STATUS.ACTIVE,
      }),
    ).resolves.toBeNull();
  });

  it("softDelete succeeds when no active leads", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_soft_delete_happy";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_DELETE],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Delete Society",
      city: "Mumbai",
    });
    const buildingId = await createBuildingRecord(t, {
      societyId,
      name: "Delete Tower",
    });
    const guardId = await createGuard(t, "guard_soft_delete_terminal");

    await createLead(t, {
      societyId,
      buildingId,
      guardId,
      status: LEAD_STATUS.REJECTED,
      flatNumber: "A-101",
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await authed.mutation(api.buildings.softDelete, { id: buildingId });

    const deleted = await t.run(async (ctx) => await ctx.db.get(buildingId));
    expect(deleted?.is_deleted).toBe(true);
  });

  it("softDelete blocks buildings with active leads", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_soft_delete_active";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_DELETE],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Active Lead Society",
      city: "Mumbai",
    });
    const buildingId = await createBuildingRecord(t, {
      societyId,
      name: "Tower Active",
    });
    const guardId = await createGuard(t, "guard_soft_delete_active");

    await createLead(t, {
      societyId,
      buildingId,
      guardId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "A-201",
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await expect(authed.mutation(api.buildings.softDelete, { id: buildingId })).rejects.toThrow(
      "Cannot delete building with active leads. Set it to INACTIVE instead.",
    );
  });

  it("softDelete rejects unauthorized caller and already deleted building", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_soft_delete_unauthorized";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_VIEW],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Unauthorized Delete Society",
      city: "Mumbai",
    });
    const buildingId = await createBuildingRecord(t, {
      societyId,
      name: "Tower X",
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await expect(authed.mutation(api.buildings.softDelete, { id: buildingId })).rejects.toThrow(
      "Missing permission: buildings.delete",
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(buildingId, { is_deleted: true });
    });

    const adminWithDeleteId = "workos_buildings_soft_delete_deleted";
    await createAdminWithPermissions(t, {
      workosUserId: adminWithDeleteId,
      permissions: [PERMISSIONS.BUILDINGS_DELETE],
    });
    const authedDelete = t.withIdentity({
      subject: adminWithDeleteId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authedDelete.mutation(api.buildings.softDelete, { id: buildingId }),
    ).rejects.toThrow("Building not found");
  });

  it("listBySociety filters soft-deleted records and supports status filter", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_list";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_VIEW],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "List Society",
      city: "Mumbai",
    });

    await createBuildingRecord(t, {
      societyId,
      name: "Zeta Tower",
      status: BUILDING_STATUS.ACTIVE,
    });
    await createBuildingRecord(t, {
      societyId,
      name: "Alpha Tower",
      status: BUILDING_STATUS.INACTIVE,
    });
    await createBuildingRecord(t, {
      societyId,
      name: "Deleted Tower",
      isDeleted: true,
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    const listed = await authed.query(api.buildings.listBySociety, { society_id: societyId });
    expect(listed.map((building) => building.name)).toEqual(["Alpha Tower", "Zeta Tower"]);

    const activeOnly = await authed.query(api.buildings.listBySociety, {
      society_id: societyId,
      status: BUILDING_STATUS.ACTIVE,
    });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0].name).toBe("Zeta Tower");
  });

  it("getById returns building with society name and null for deleted or missing", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_get_by_id";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_VIEW],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Detail Society",
      city: "Mumbai",
    });
    const activeBuildingId = await createBuildingRecord(t, {
      societyId,
      name: "Detail Tower",
    });
    const deletedBuildingId = await createBuildingRecord(t, {
      societyId,
      name: "Deleted Detail Tower",
      isDeleted: true,
    });
    const missingBuildingId = await createBuildingRecord(t, {
      societyId,
      name: "Missing Tower",
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(missingBuildingId);
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    const detail = await authed.query(api.buildings.getById, { id: activeBuildingId });
    expect(detail?.name).toBe("Detail Tower");
    expect(detail?.society_name).toBe("Detail Society");

    const deleted = await authed.query(api.buildings.getById, { id: deletedBuildingId });
    expect(deleted).toBeNull();

    const missing = await authed.query(api.buildings.getById, { id: missingBuildingId });
    expect(missing).toBeNull();
  });

  it("queries reject unauthorized callers", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_buildings_query_unauthorized";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.BUILDINGS_CREATE],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Unauthorized Query Society",
      city: "Mumbai",
    });
    const buildingId = await createBuildingRecord(t, {
      societyId,
      name: "Tower Query",
    });

    const authed = t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" });

    await expect(
      authed.query(api.buildings.listBySociety, { society_id: societyId }),
    ).rejects.toThrow("Missing permission: buildings.view");

    await expect(authed.query(api.buildings.getById, { id: buildingId })).rejects.toThrow(
      "Missing permission: buildings.view",
    );
  });
});
