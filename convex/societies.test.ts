import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_STATUS, PERMISSIONS, SOCIETY_STATUS } from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_societies";
process.env.WORKOS_API_KEY ??= "sk_test_societies";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_societies";

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
  options: {
    adminId: Id<"users">;
    name: string;
    city: string;
    status?: "ONBOARDING" | "ACTIVE" | "INACTIVE";
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("societies", {
      name: options.name,
      city: options.city,
      status: options.status ?? SOCIETY_STATUS.ONBOARDING,
      created_by_admin_id: options.adminId,
    });
  });
}

async function createBuilding(
  t: ReturnType<typeof convexTest>,
  societyId: Id<"societies">,
  name = "Tower A",
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("buildings", {
      society_id: societyId,
      name,
      total_floors: 10,
      floor_labels: ["G", "1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
  });
}

async function createGuardProfile(
  t: ReturnType<typeof convexTest>,
  options: { workosUserId: string; societyId: Id<"societies"> },
) {
  return await t.run(async (ctx) => {
    const guardId = await ctx.db.insert("users", {
      workos_user_id: options.workosUserId,
      user_type: "GUARD",
      name: `Guard ${options.workosUserId}`,
      phone: "9999999999",
      status: "ACTIVE",
      must_change_password: false,
    });

    await ctx.db.insert("guard_profiles", {
      user_id: guardId,
      society_id: options.societyId,
      guard_type: "MAIN_GATE",
      has_seen_onboarding: true,
    });

    return guardId;
  });
}

async function createLead(
  t: ReturnType<typeof convexTest>,
  options: {
    societyId: Id<"societies">;
    buildingId: Id<"buildings">;
    guardId: Id<"users">;
    status: "SUBMITTED" | "VERIFIED" | "REJECTED" | "DUPLICATE";
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

describe("societies", () => {
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

  it("create succeeds with required fields and defaults", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_create_happy";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_CREATE],
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const societyId = await authed.mutation(api.societies.create, {
      name: "  Palm Heights  ",
      city: "  Mumbai  ",
    });

    const createdSociety = await t.run(async (ctx) => {
      return await ctx.db.get(societyId);
    });

    expect(createdSociety?.name).toBe("Palm Heights");
    expect(createdSociety?.city).toBe("Mumbai");
    expect(createdSociety?.status).toBe(SOCIETY_STATUS.ONBOARDING);
    expect(createdSociety?.created_by_admin_id).toBe(adminId);
  });

  it("create rejects missing required fields", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_create_missing";
    await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_CREATE],
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.societies.create, {
        name: "   ",
        city: "Mumbai",
      }),
    ).rejects.toThrow("Name is required");

    await expect(
      authed.mutation(api.societies.create, {
        name: "Palm Heights",
        city: "   ",
      }),
    ).rejects.toThrow("City is required");
  });

  it("create rejects unauthorized caller", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_create_unauthorized";
    await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_VIEW],
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.societies.create, {
        name: "Palm Heights",
        city: "Mumbai",
      }),
    ).rejects.toThrow("Missing permission: societies.create");
  });

  it("update applies basic field edits", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_update_fields";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_EDIT],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Old Name",
      city: "Mumbai",
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await authed.mutation(api.societies.update, {
      id: societyId,
      name: "  New Name  ",
      city: "  Pune  ",
      address: "  Block C  ",
      notes: "  Updated notes  ",
    });

    const updatedSociety = await t.run(async (ctx) => {
      return await ctx.db.get(societyId);
    });

    expect(updatedSociety?.name).toBe("New Name");
    expect(updatedSociety?.city).toBe("Pune");
    expect(updatedSociety?.address).toBe("Block C");
    expect(updatedSociety?.notes).toBe("Updated notes");
  });

  it("update enforces all status transition rules", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_status_transitions";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_EDIT],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Transition Society",
      city: "Mumbai",
      status: SOCIETY_STATUS.ONBOARDING,
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.societies.update, {
        id: societyId,
        status: SOCIETY_STATUS.ACTIVE,
      }),
    ).rejects.toThrow("At least one building is required before activating a society");

    await createBuilding(t, societyId);

    await authed.mutation(api.societies.update, {
      id: societyId,
      status: SOCIETY_STATUS.ACTIVE,
    });

    await authed.mutation(api.societies.update, {
      id: societyId,
      status: SOCIETY_STATUS.INACTIVE,
    });

    await authed.mutation(api.societies.update, {
      id: societyId,
      status: SOCIETY_STATUS.ACTIVE,
    });

    await expect(
      authed.mutation(api.societies.update, {
        id: societyId,
        status: SOCIETY_STATUS.ONBOARDING,
      }),
    ).rejects.toThrow("Cannot move society back to ONBOARDING");
  });

  it("update blocks onboarding to inactive and inactive to onboarding transitions", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_invalid_transitions";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_EDIT],
    });
    const onboardingSocietyId = await createSociety(t, {
      adminId,
      name: "Onboarding Society",
      city: "Mumbai",
      status: SOCIETY_STATUS.ONBOARDING,
    });
    const inactiveSocietyId = await createSociety(t, {
      adminId,
      name: "Inactive Society",
      city: "Pune",
      status: SOCIETY_STATUS.INACTIVE,
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.societies.update, {
        id: onboardingSocietyId,
        status: SOCIETY_STATUS.INACTIVE,
      }),
    ).rejects.toThrow("ONBOARDING society must be ACTIVE before becoming INACTIVE");

    await expect(
      authed.mutation(api.societies.update, {
        id: inactiveSocietyId,
        status: SOCIETY_STATUS.ONBOARDING,
      }),
    ).rejects.toThrow("Cannot move society back to ONBOARDING");
  });

  it("update rejects unauthorized caller", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_update_unauthorized";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_VIEW],
    });
    const societyId = await createSociety(t, {
      adminId,
      name: "Unauthorized Society",
      city: "Mumbai",
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.societies.update, {
        id: societyId,
        city: "Pune",
      }),
    ).rejects.toThrow("Missing permission: societies.edit");
  });

  it("list returns societies with counts and supports filters", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_list";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_VIEW],
    });

    const activeSocietyId = await createSociety(t, {
      adminId,
      name: "Alpha Society",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
    });
    const onboardingSocietyId = await createSociety(t, {
      adminId,
      name: "Beta Society",
      city: "Pune",
      status: SOCIETY_STATUS.ONBOARDING,
    });

    const buildingId = await createBuilding(t, activeSocietyId);
    const guardId = await createGuardProfile(t, {
      workosUserId: "guard_society_list",
      societyId: activeSocietyId,
    });

    await createLead(t, {
      societyId: activeSocietyId,
      buildingId,
      guardId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "A-101",
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const allSocieties = await authed.query(api.societies.list, {});
    expect(allSocieties.map((society) => society.name)).toEqual(["Alpha Society", "Beta Society"]);
    expect(allSocieties[0].building_count).toBe(1);
    expect(allSocieties[0].guard_count).toBe(1);
    expect(allSocieties[0].lead_count).toBe(1);

    const activeSocieties = await authed.query(api.societies.list, {
      status: SOCIETY_STATUS.ACTIVE,
    });
    expect(activeSocieties).toHaveLength(1);
    expect(activeSocieties[0]._id).toBe(activeSocietyId);

    const puneSocieties = await authed.query(api.societies.list, { city: "Pune" });
    expect(puneSocieties).toHaveLength(1);
    expect(puneSocieties[0]._id).toBe(onboardingSocietyId);
  });

  it("getById returns aggregated counts and null when missing", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_get_by_id";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_VIEW],
    });

    const societyId = await createSociety(t, {
      adminId,
      name: "Detail Society",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
    });
    const buildingId = await createBuilding(t, societyId);
    const guardId = await createGuardProfile(t, {
      workosUserId: "guard_society_detail",
      societyId,
    });

    await createLead(t, {
      societyId,
      buildingId,
      guardId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "A-101",
    });
    await createLead(t, {
      societyId,
      buildingId,
      guardId,
      status: LEAD_STATUS.VERIFIED,
      flatNumber: "A-102",
    });
    await createLead(t, {
      societyId,
      buildingId,
      guardId,
      status: LEAD_STATUS.REJECTED,
      flatNumber: "A-103",
    });
    await createLead(t, {
      societyId,
      buildingId,
      guardId,
      status: LEAD_STATUS.DUPLICATE,
      flatNumber: "A-104",
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const detail = await authed.query(api.societies.getById, { id: societyId });
    expect(detail).not.toBeNull();
    expect(detail?.building_count).toBe(1);
    expect(detail?.guard_count).toBe(1);
    expect(detail?.lead_stats).toEqual({
      total: 4,
      submitted: 1,
      verified: 1,
      rejected: 1,
      duplicate: 1,
    });
    expect(detail?.recent_leads.length).toBe(4);
    expect(detail?.recent_leads[0].flat_number).toBe("A-104");

    await t.run(async (ctx) => {
      await ctx.db.delete(societyId);
    });

    const deletedDetail = await authed.query(api.societies.getById, { id: societyId });
    expect(deletedDetail).toBeNull();
  });

  it("search returns matching societies and supports filters", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_societies_search";
    const adminId = await createAdminWithPermissions(t, {
      workosUserId,
      permissions: [PERMISSIONS.SOCIETIES_VIEW],
    });

    await createSociety(t, {
      adminId,
      name: "Maplewood Gardens",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
    });
    await createSociety(t, {
      adminId,
      name: "Maplewood Estate",
      city: "Thane",
      status: SOCIETY_STATUS.INACTIVE,
    });
    await createSociety(t, {
      adminId,
      name: "Palm Residency",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const matched = await authed.query(api.societies.search, {
      search: "Maple",
    });
    expect(matched).toHaveLength(2);

    const filtered = await authed.query(api.societies.search, {
      search: "Maple",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Maplewood Gardens");

    const noMatch = await authed.query(api.societies.search, {
      search: "Nope",
    });
    expect(noMatch).toHaveLength(0);
  });
});
