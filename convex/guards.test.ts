import { convexTest } from "convex-test";
import rateLimiterComponent from "@convex-dev/rate-limiter/test";
import aggregateComponent from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUARD_TYPE,
  LEAD_STATUS,
  PAYOUT_STATUS,
  PAYOUT_METHOD,
  PERMISSIONS,
  SOCIETY_STATUS,
  SYSTEM_CONFIG_KEYS,
  USER_STATUS,
  USER_TYPE,
  VISIT_STATUS,
} from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_guards";
process.env.WORKOS_API_KEY ??= "sk_test_guards";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_guards";

const { authKit } = await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

// `guards.ts` calls into the `rateLimiter` component, and mutations on the
// leads/visits/payouts tables run triggers that write through the aggregate
// components (see convex/convex.config.ts and convex/functions.ts).
// convex-test does not auto-register third-party components, so register the
// component instances here before exercising any code path that touches them.
function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterComponent.register(t);
  aggregateComponent.register(t, "leadCounts");
  aggregateComponent.register(t, "visitCounts");
  aggregateComponent.register(t, "payoutTotals");
  return t;
}

type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;

const WORKOS_ISSUER = "https://api.workos.com/";

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

async function createTestOpsFieldWorker(
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
      user_type: USER_TYPE.OPS,
      name: options.name ?? `OPS ${options.workosUserId}`,
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

async function createTestLead(
  t: ReturnType<typeof convexTest>,
  options: {
    societyId: Id<"societies">;
    buildingId: Id<"buildings">;
    guardUserId: Id<"users">;
    status:
      | "SUBMITTED"
      | "NEED_INFO"
      | "POTENTIAL_DUPLICATE"
      | "VERIFIED"
      | "REJECTED"
      | "DUPLICATE";
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
      submitted_by_guard_id: options.guardUserId,
      status: options.status,
    });
  });
}

async function createTestVisit(
  t: ReturnType<typeof convexTest>,
  options: {
    leadId: Id<"leads">;
    societyId: Id<"societies">;
    guardUserId: Id<"users">;
    adminId: Id<"users">;
    status: "ASSIGNED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("visits", {
      lead_id: options.leadId,
      society_id: options.societyId,
      scheduled_start: Date.now() + 60_000,
      scheduled_end: Date.now() + 120_000,
      assigned_guard_id: options.guardUserId,
      status: options.status,
      created_by_admin_id: options.adminId,
    });
  });
}

async function createTestClosure(
  t: ReturnType<typeof convexTest>,
  options: {
    leadId: Id<"leads">;
    adminId: Id<"users">;
    status?: "PENDING" | "CONFIRMED" | "CANCELLED";
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("closures", {
      lead_id: options.leadId,
      move_in_date: Date.now() + 86_400_000,
      status: options.status ?? "CONFIRMED",
      closed_by_admin_id: options.adminId,
    });
  });
}

async function createTestPayout(
  t: ReturnType<typeof convexTest>,
  options: {
    guardUserId: Id<"users">;
    leadId: Id<"leads">;
    closureId: Id<"closures">;
    adminId: Id<"users">;
    amountPaise: number;
    status: "pending" | "approved" | "disbursed" | "failed" | "voided";
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("payouts", {
      guard_user_id: options.guardUserId,
      lead_id: options.leadId,
      closure_id: options.closureId,
      amount_paise: options.amountPaise,
      method: PAYOUT_METHOD.UPI,
      status: options.status,
      initiated_by_admin_id: options.adminId,
    });
  });
}

describe("guards", () => {
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

  // WorkOS Action tests deferred — requires WorkOS SDK mocking

  describe("createInternal", () => {
    it("creates users and guard_profiles records for valid payload", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, { workosUserId: "workos_create_internal_admin" });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "CreateInternal Society",
      });

      const userId: Id<"users"> = await t.mutation(internal.guards.createInternal, {
        workos_user_id: "workos_guard_create_internal_happy",
        name: "  Guard Happy  ",
        phone: "+91 98765 43210",
        society_id: societyId,
        guard_type: GUARD_TYPE.MAIN_GATE,
      });

      const [user, profile] = await t.run(async (ctx) => {
        const createdUser = await ctx.db.get(userId);
        const createdProfile = await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", userId))
          .unique();

        return [createdUser, createdProfile] as const;
      });

      expect(user?.user_type).toBe(USER_TYPE.GUARD);
      expect(user?.name).toBe("Guard Happy");
      expect(user?.phone).toBe("9876543210");
      expect(user?.status).toBe(USER_STATUS.ACTIVE);
      expect(user?.must_change_password).toBe(true);

      expect(profile).not.toBeNull();
      expect(profile?.user_id).toBe(userId);
      expect(profile?.society_id).toBe(societyId);
      expect(profile?.guard_type).toBe(GUARD_TYPE.MAIN_GATE);
      expect(profile?.has_seen_onboarding).toBe(false);
    });

    it("rejects duplicate phone numbers", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, {
        workosUserId: "workos_create_internal_phone_admin",
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Phone Uniqueness Society",
      });

      await t.mutation(internal.guards.createInternal, {
        workos_user_id: "workos_guard_phone_first",
        name: "Guard One",
        phone: "99999 99999",
        society_id: societyId,
        guard_type: GUARD_TYPE.PARK,
      });

      await expect(
        t.mutation(internal.guards.createInternal, {
          workos_user_id: "workos_guard_phone_second",
          name: "Guard Two",
          phone: "9999999999",
          society_id: societyId,
          guard_type: GUARD_TYPE.PARK,
        }),
      ).rejects.toThrow("Guard with this phone number already exists");
    });

    it("rejects invalid phone numbers", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, {
        workosUserId: "workos_create_internal_invalid_phone_admin",
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Invalid Phone Society",
      });

      await expect(
        t.mutation(internal.guards.createInternal, {
          workos_user_id: "workos_guard_invalid_phone",
          name: "Guard Invalid Phone",
          phone: "12345",
          society_id: societyId,
          guard_type: GUARD_TYPE.ROVING,
        }),
      ).rejects.toThrow("Invalid phone number: expected 10 digits");
    });

    it("rejects invalid guard type values", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, {
        workosUserId: "workos_create_internal_invalid_type_admin",
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Invalid Guard Type Society",
      });

      await expect(
        t.mutation(internal.guards.createInternal, {
          workos_user_id: "workos_guard_invalid_type",
          name: "Guard Invalid Type",
          phone: "9876500001",
          society_id: societyId,
          guard_type: "SUPER_GUARD",
        }),
      ).rejects.toThrow("Invalid guard type");
    });

    it("rejects missing society references", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, {
        workosUserId: "workos_create_internal_missing_society_admin",
      });
      const missingSocietyId = await createTestSociety(t, {
        adminId,
        name: "Will Be Deleted Society",
      });

      await t.run(async (ctx) => {
        await ctx.db.delete(missingSocietyId);
      });

      await expect(
        t.mutation(internal.guards.createInternal, {
          workos_user_id: "workos_guard_missing_society",
          name: "Guard Missing Society",
          phone: "9876500002",
          society_id: missingSocietyId,
          guard_type: GUARD_TYPE.MAIN_GATE,
        }),
      ).rejects.toThrow("Society not found");
    });

    it("rejects duplicate WorkOS user ids", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, {
        workosUserId: "workos_create_internal_duplicate_workos_admin",
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Duplicate WorkOS Society",
      });

      await t.mutation(internal.guards.createInternal, {
        workos_user_id: "workos_guard_duplicate_workos",
        name: "Guard Duplicate WorkOS One",
        phone: "9876500003",
        society_id: societyId,
        guard_type: GUARD_TYPE.BUILDING_SPECIFIC,
      });

      await expect(
        t.mutation(internal.guards.createInternal, {
          workos_user_id: "workos_guard_duplicate_workos",
          name: "Guard Duplicate WorkOS Two",
          phone: "9876500004",
          society_id: societyId,
          guard_type: GUARD_TYPE.BUILDING_SPECIFIC,
        }),
      ).rejects.toThrow("User with this WorkOS ID already exists");
    });
  });

  describe("updateProfile", () => {
    it("updates guard name only", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_update_profile_name_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_EDIT],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Update Name Society",
      });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_update_name",
        societyId,
        phone: "9000000001",
        name: "Old Guard Name",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await authed.mutation(api.guards.updateProfile, {
        user_id: guard.userId,
        name: "  New Guard Name  ",
      });

      const updatedUser = await t.run(async (ctx) => await ctx.db.get(guard.userId));
      expect(updatedUser?.name).toBe("New Guard Name");
    });

    it("updates guard_type with validation", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_update_profile_type_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_EDIT],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Update Type Society",
      });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_update_type",
        societyId,
        phone: "9000000002",
        guardType: GUARD_TYPE.MAIN_GATE,
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await authed.mutation(api.guards.updateProfile, {
        user_id: guard.userId,
        guard_type: GUARD_TYPE.ROVING,
      });

      const profile = await t.run(async (ctx) => {
        return await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", guard.userId))
          .unique();
      });

      expect(profile?.guard_type).toBe(GUARD_TYPE.ROVING);
    });

    it("reassigns society and soft deletes existing shifts", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_update_profile_society_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_EDIT],
      });
      const oldSocietyId = await createTestSociety(t, {
        adminId,
        name: "Old Society",
      });
      const newSocietyId = await createTestSociety(t, {
        adminId,
        name: "New Society",
      });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_update_society",
        societyId: oldSocietyId,
        phone: "9000000003",
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("guard_shifts", {
          guard_user_id: guard.userId,
          shift_type: "RECURRING",
          day_of_week: 1,
          start_time: "09:00",
          end_time: "18:00",
          location_type: "MAIN_GATE",
          created_by_admin_id: adminId,
          is_deleted: false,
        });

        await ctx.db.insert("guard_shifts", {
          guard_user_id: guard.userId,
          shift_type: "OVERRIDE",
          specific_date: Date.now() + 86_400_000,
          start_time: "10:00",
          end_time: "16:00",
          location_type: "BUILDING",
          created_by_admin_id: adminId,
          is_deleted: false,
        });
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await authed.mutation(api.guards.updateProfile, {
        user_id: guard.userId,
        society_id: newSocietyId,
      });

      const [profile, shifts] = await t.run(async (ctx) => {
        const updatedProfile = await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", guard.userId))
          .unique();
        const guardShifts = await ctx.db
          .query("guard_shifts")
          .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", guard.userId))
          .collect();

        return [updatedProfile, guardShifts] as const;
      });

      expect(profile?.society_id).toBe(newSocietyId);
      expect(shifts).toHaveLength(2);
      expect(shifts.every((shift) => shift.is_deleted)).toBe(true);
    });

    it("rejects updates for non-guard users", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_update_profile_non_guard_actor";
      await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_EDIT],
      });
      const targetAdminId = await createTestAdmin(t, {
        workosUserId: "workos_guard_update_profile_target_admin",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guards.updateProfile, {
          user_id: targetAdminId,
          name: "Should Fail",
        }),
      ).rejects.toThrow("Guard not found");
    });

    it("rejects callers without guards.edit permission", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_update_profile_unauthorized_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Unauthorized Profile Update Society",
      });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_update_profile_unauthorized_target",
        societyId,
        phone: "9000000004",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guards.updateProfile, {
          user_id: guard.userId,
          name: "No Permission",
        }),
      ).rejects.toThrow(`Missing permission: ${PERMISSIONS.GUARDS_EDIT}`);
    });
  });

  describe("updateStatus", () => {
    it("transitions ACTIVE to INACTIVE", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_status_active_to_inactive_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
      });
      const societyId = await createTestSociety(t, { adminId, name: "Status Society 1" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_status_active_to_inactive",
        societyId,
        phone: "9100000001",
        status: USER_STATUS.ACTIVE,
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const result = await authed.mutation(api.guards.updateStatus, {
        user_id: guard.userId,
        status: USER_STATUS.INACTIVE,
      });

      const updated = await t.run(async (ctx) => await ctx.db.get(guard.userId));
      expect(result).toEqual({ success: true });
      expect(updated?.status).toBe(USER_STATUS.INACTIVE);
    });

    it("transitions ACTIVE to BANNED when reason is provided", async () => {
      vi.useFakeTimers();

      try {
        const t = createTest();
        const actorWorkosUserId = "workos_guard_status_active_to_banned_actor";
        const adminId = await createTestAdmin(t, {
          workosUserId: actorWorkosUserId,
          permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
        });
        const societyId = await createTestSociety(t, { adminId, name: "Status Society 2" });
        const guard = await createTestGuard(t, {
          workosUserId: "workos_guard_status_active_to_banned",
          societyId,
          phone: "9100000002",
          status: USER_STATUS.ACTIVE,
        });

        const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
        const result = await authed.mutation(api.guards.updateStatus, {
          user_id: guard.userId,
          status: USER_STATUS.BANNED,
          reason: "Repeated policy violations",
        });

        expect(result).toEqual({ success: true });
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects ACTIVE to BANNED without reason", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_status_banned_without_reason_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
      });
      const societyId = await createTestSociety(t, { adminId, name: "Status Society 3" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_status_banned_without_reason",
        societyId,
        phone: "9100000003",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guards.updateStatus, {
          user_id: guard.userId,
          status: USER_STATUS.BANNED,
        }),
      ).rejects.toThrow("Reason is required");
    });

    it("transitions INACTIVE to ACTIVE", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_status_inactive_to_active_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
      });
      const societyId = await createTestSociety(t, { adminId, name: "Status Society 4" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_status_inactive_to_active",
        societyId,
        phone: "9100000004",
        status: USER_STATUS.INACTIVE,
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const result = await authed.mutation(api.guards.updateStatus, {
        user_id: guard.userId,
        status: USER_STATUS.ACTIVE,
      });

      const updated = await t.run(async (ctx) => await ctx.db.get(guard.userId));
      expect(result).toEqual({ success: true });
      expect(updated?.status).toBe(USER_STATUS.ACTIVE);
    });

    it("transitions INACTIVE to BANNED with reason", async () => {
      vi.useFakeTimers();

      try {
        const t = createTest();
        const actorWorkosUserId = "workos_guard_status_inactive_to_banned_actor";
        const adminId = await createTestAdmin(t, {
          workosUserId: actorWorkosUserId,
          permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
        });
        const societyId = await createTestSociety(t, { adminId, name: "Status Society 5" });
        const guard = await createTestGuard(t, {
          workosUserId: "workos_guard_status_inactive_to_banned",
          societyId,
          phone: "9100000005",
          status: USER_STATUS.INACTIVE,
        });

        const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
        const result = await authed.mutation(api.guards.updateStatus, {
          user_id: guard.userId,
          status: USER_STATUS.BANNED,
          reason: "Escalated policy breach",
        });

        expect(result).toEqual({ success: true });
      } finally {
        vi.useRealTimers();
      }
    });

    it("transitions BANNED to ACTIVE", async () => {
      vi.useFakeTimers();

      try {
        const t = createTest();
        const actorWorkosUserId = "workos_guard_status_banned_to_active_actor";
        const adminId = await createTestAdmin(t, {
          workosUserId: actorWorkosUserId,
          permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
        });
        const societyId = await createTestSociety(t, { adminId, name: "Status Society 6" });
        const guard = await createTestGuard(t, {
          workosUserId: "workos_guard_status_banned_to_active",
          societyId,
          phone: "9100000006",
          status: USER_STATUS.BANNED,
        });

        const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
        const result = await authed.mutation(api.guards.updateStatus, {
          user_id: guard.userId,
          status: USER_STATUS.ACTIVE,
        });

        expect(result).toEqual({ success: true });
      } finally {
        vi.useRealTimers();
      }
    });

    it("transitions BANNED to INACTIVE", async () => {
      vi.useFakeTimers();

      try {
        const t = createTest();
        const actorWorkosUserId = "workos_guard_status_banned_to_inactive_actor";
        const adminId = await createTestAdmin(t, {
          workosUserId: actorWorkosUserId,
          permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
        });
        const societyId = await createTestSociety(t, { adminId, name: "Status Society 7" });
        const guard = await createTestGuard(t, {
          workosUserId: "workos_guard_status_banned_to_inactive",
          societyId,
          phone: "9100000007",
          status: USER_STATUS.BANNED,
        });

        const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
        const result = await authed.mutation(api.guards.updateStatus, {
          user_id: guard.userId,
          status: USER_STATUS.INACTIVE,
        });

        expect(result).toEqual({ success: true });
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects no-op transitions such as ACTIVE to ACTIVE", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_status_same_status_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
      });
      const societyId = await createTestSociety(t, { adminId, name: "Status Society 8" });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_status_same_status",
        societyId,
        phone: "9100000008",
        status: USER_STATUS.ACTIVE,
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guards.updateStatus, {
          user_id: guard.userId,
          status: USER_STATUS.ACTIVE,
        }),
      ).rejects.toThrow("Invalid status transition");
    });

    it("rejects status updates for non-guard users", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_status_invalid_transition_actor";
      await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_MANAGE_STATUS],
      });
      const targetAdminId = await createTestAdmin(t, {
        workosUserId: "workos_guard_status_invalid_transition_target_admin",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(api.guards.updateStatus, {
          user_id: targetAdminId,
          status: USER_STATUS.INACTIVE,
        }),
      ).rejects.toThrow("Guard not found");
    });
  });

  describe("banGuardInternal", () => {
    it("marks pending visits for reassignment when guard is banned", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, { workosUserId: "workos_guard_ban_cascade_admin" });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Ban Cascade Society",
      });
      const buildingId = await createTestBuilding(t, {
        societyId,
        name: "Cascade Tower",
      });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_ban_cascade",
        societyId,
        phone: "9200000001",
      });
      const leadId = await createTestLead(t, {
        societyId,
        buildingId,
        guardUserId: guard.userId,
        status: LEAD_STATUS.SUBMITTED,
        flatNumber: "A-101",
      });

      const assignedVisitId = await createTestVisit(t, {
        leadId,
        societyId,
        guardUserId: guard.userId,
        adminId,
        status: VISIT_STATUS.ASSIGNED,
      });
      const confirmedVisitId = await createTestVisit(t, {
        leadId,
        societyId,
        guardUserId: guard.userId,
        adminId,
        status: VISIT_STATUS.CONFIRMED,
      });
      const inProgressVisitId = await createTestVisit(t, {
        leadId,
        societyId,
        guardUserId: guard.userId,
        adminId,
        status: VISIT_STATUS.IN_PROGRESS,
      });
      const completedVisitId = await createTestVisit(t, {
        leadId,
        societyId,
        guardUserId: guard.userId,
        adminId,
        status: VISIT_STATUS.COMPLETED,
      });

      // The visits above were seeded via direct `ctx.db.insert` calls in `t.run`,
      // which bypasses the insert triggers that keep the `visitCounts` aggregate in
      // sync (see convex/functions.ts). Backfill it before calling a mutation that
      // triggers an aggregate *update*, since that requires the prior doc to already
      // be tracked in the aggregate.
      await t.mutation(internal.analytics.backfillAggregates, {});

      await t.mutation(internal.guards.banGuardInternal, {
        user_id: guard.userId,
        reason: "Serious policy violation",
      });

      const [updatedUser, assignedVisit, confirmedVisit, inProgressVisit, completedVisit] =
        await t.run(async (ctx) => {
          const user = await ctx.db.get(guard.userId);
          const assigned = await ctx.db.get(assignedVisitId);
          const confirmed = await ctx.db.get(confirmedVisitId);
          const inProgress = await ctx.db.get(inProgressVisitId);
          const completed = await ctx.db.get(completedVisitId);

          return [user, assigned, confirmed, inProgress, completed] as const;
        });

      expect(updatedUser?.status).toBe(USER_STATUS.BANNED);
      expect(assignedVisit?.needs_reassignment).toBe(true);
      expect(confirmedVisit?.needs_reassignment).toBe(true);
      expect(inProgressVisit?.needs_reassignment).toBe(true);
      expect(completedVisit?.needs_reassignment).toBeUndefined();
    });
  });

  describe("queries", () => {
    it("list returns all guards when no filters are provided", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_list_all_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });
      const societyOneId = await createTestSociety(t, {
        adminId,
        name: "List Society One",
      });
      const societyTwoId = await createTestSociety(t, {
        adminId,
        name: "List Society Two",
      });

      await createTestGuard(t, {
        workosUserId: "workos_guard_list_all_charlie",
        societyId: societyOneId,
        phone: "9300000001",
        name: "Charlie Guard",
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_list_all_alice",
        societyId: societyOneId,
        phone: "9300000002",
        name: "Alice Guard",
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_list_all_bob",
        societyId: societyTwoId,
        phone: "9300000003",
        name: "Bob Guard",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const results = await authed.query(api.guards.list, {});

      expect(results).toHaveLength(3);
      expect(results.map((guard) => guard.name)).toEqual([
        "Alice Guard",
        "Bob Guard",
        "Charlie Guard",
      ]);
    });

    it("list filters by society_id", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_list_society_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });
      const societyOneId = await createTestSociety(t, {
        adminId,
        name: "Filter Society One",
      });
      const societyTwoId = await createTestSociety(t, {
        adminId,
        name: "Filter Society Two",
      });

      await createTestGuard(t, {
        workosUserId: "workos_guard_list_society_one_a",
        societyId: societyOneId,
        phone: "9300000004",
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_list_society_two_a",
        societyId: societyTwoId,
        phone: "9300000005",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const results = await authed.query(api.guards.list, { society_id: societyOneId });

      expect(results).toHaveLength(1);
      expect(results[0].society_id).toBe(societyOneId);
    });

    it("list filters by status", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_list_status_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Status Filter Society",
      });

      await createTestGuard(t, {
        workosUserId: "workos_guard_list_status_active",
        societyId,
        phone: "9300000006",
        status: USER_STATUS.ACTIVE,
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_list_status_inactive",
        societyId,
        phone: "9300000007",
        status: USER_STATUS.INACTIVE,
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const results = await authed.query(api.guards.list, { status: USER_STATUS.INACTIVE });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(USER_STATUS.INACTIVE);
    });

    it("getById returns enriched guard details for valid guard", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_get_by_id_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Detail Society",
      });
      const buildingId = await createTestBuilding(t, {
        societyId,
        name: "Detail Tower",
      });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_get_by_id",
        societyId,
        phone: "9300000008",
        name: "Detail Guard",
      });

      const leadOneId = await createTestLead(t, {
        societyId,
        buildingId,
        guardUserId: guard.userId,
        status: LEAD_STATUS.SUBMITTED,
        flatNumber: "B-101",
      });
      await createTestLead(t, {
        societyId,
        buildingId,
        guardUserId: guard.userId,
        status: LEAD_STATUS.VERIFIED,
        flatNumber: "B-102",
      });

      await createTestVisit(t, {
        leadId: leadOneId,
        societyId,
        guardUserId: guard.userId,
        adminId,
        status: VISIT_STATUS.ASSIGNED,
      });
      await createTestVisit(t, {
        leadId: leadOneId,
        societyId,
        guardUserId: guard.userId,
        adminId,
        status: VISIT_STATUS.COMPLETED,
      });

      const closureId = await createTestClosure(t, {
        leadId: leadOneId,
        adminId,
      });

      await createTestPayout(t, {
        guardUserId: guard.userId,
        leadId: leadOneId,
        closureId,
        adminId,
        amountPaise: 150_000,
        status: PAYOUT_STATUS.DISBURSED,
      });
      await createTestPayout(t, {
        guardUserId: guard.userId,
        leadId: leadOneId,
        closureId,
        adminId,
        amountPaise: 90_000,
        status: PAYOUT_STATUS.APPROVED,
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const detail = await authed.query(api.guards.getById, { user_id: guard.userId });

      expect(detail).not.toBeNull();
      expect(detail?.name).toBe("Detail Guard");
      expect(detail?.society_name).toBe("Detail Society");
      expect(detail?.lead_count).toBe(2);
      expect(detail?.verified_lead_count).toBe(1);
      expect(detail?.visit_count).toBe(2);
      expect(detail?.completed_visit_count).toBe(1);
      expect(detail?.payout_total_paise).toBe(150_000);
    });

    it("getById returns null when guard does not exist", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_get_by_id_missing_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Missing Guard Society",
      });
      const guard = await createTestGuard(t, {
        workosUserId: "workos_guard_get_by_id_deleted",
        societyId,
        phone: "9300000009",
      });

      await t.run(async (ctx) => {
        await ctx.db.delete(guard.userId);
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const detail = await authed.query(api.guards.getById, { user_id: guard.userId });

      expect(detail).toBeNull();
    });

    it("search finds guards by name", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_search_name_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Search Name Society",
      });
      const targetGuard = await createTestGuard(t, {
        workosUserId: "workos_guard_search_name_target",
        societyId,
        phone: "9310000001",
        name: "Rohit Sharma",
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_search_name_other",
        societyId,
        phone: "9310000002",
        name: "Aman Mehta",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const results = await authed.query(api.guards.search, {
        search: "rohit",
      });

      expect(results).toHaveLength(1);
      expect(results[0].user_id).toBe(targetGuard.userId);
      expect(results[0].name).toBe("Rohit Sharma");
    });

    it("search finds guards by phone prefix", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_search_phone_actor";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "Search Phone Society",
      });
      const targetGuard = await createTestGuard(t, {
        workosUserId: "workos_guard_search_phone_target",
        societyId,
        phone: "9876543210",
        name: "Phone Match Guard",
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_search_phone_other",
        societyId,
        phone: "9123456780",
        name: "Phone Other Guard",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const results = await authed.query(api.guards.search, {
        search: "98765",
      });

      expect(results).toHaveLength(1);
      expect(results[0].user_id).toBe(targetGuard.userId);
      expect(results[0].phone).toBe("9876543210");
    });
  });

  describe("getMyProfile", () => {
    it("returns profile with society_name for ACTIVE guards", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, {
        workosUserId: "workos_guard_my_profile_active_admin",
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "My Profile Active Society",
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_my_profile_active",
        societyId,
        phone: "9400000001",
        name: "My Active Guard",
        status: USER_STATUS.ACTIVE,
      });

      const authed = t.withIdentity({
        subject: "workos_guard_my_profile_active",
        issuer: WORKOS_ISSUER,
      });

      const profile = await authed.query(api.guards.getMyProfile, {});

      expect(profile.name).toBe("My Active Guard");
      expect(profile.status).toBe(USER_STATUS.ACTIVE);
      expect(profile.society_name).toBe("My Profile Active Society");
    });

    it("returns profile with society_name for ACTIVE OPS field workers", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, {
        workosUserId: "workos_guard_my_profile_ops_admin",
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "My Profile OPS Society",
      });
      await createTestOpsFieldWorker(t, {
        workosUserId: "workos_guard_my_profile_ops",
        societyId,
        phone: "9400000099",
        name: "My Active Ops",
        status: USER_STATUS.ACTIVE,
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("system_config", {
          key: SYSTEM_CONFIG_KEYS.OPS_FIELD_WORKER_ENABLED,
          value: JSON.stringify(true),
          updated_by_admin_id: adminId,
        });
      });

      const authed = t.withIdentity({
        subject: "workos_guard_my_profile_ops",
        issuer: WORKOS_ISSUER,
      });

      const profile = await authed.query(api.guards.getMyProfile, {});

      expect(profile.name).toBe("My Active Ops");
      expect(profile.status).toBe(USER_STATUS.ACTIVE);
      expect(profile.society_name).toBe("My Profile OPS Society");
    });

    it("rejects INACTIVE field workers", async () => {
      const t = createTest();
      const adminId = await createTestAdmin(t, {
        workosUserId: "workos_guard_my_profile_inactive_admin",
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "My Profile Inactive Society",
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_my_profile_inactive",
        societyId,
        phone: "9400000002",
        name: "My Inactive Guard",
        status: USER_STATUS.INACTIVE,
      });

      const authed = t.withIdentity({
        subject: "workos_guard_my_profile_inactive",
        issuer: WORKOS_ISSUER,
      });

      await expect(authed.query(api.guards.getMyProfile, {})).rejects.toThrow(
        "Not authorized as field worker",
      );
    });

    it("rejects non-field-worker callers", async () => {
      const t = createTest();
      await createTestAdmin(t, {
        workosUserId: "workos_guard_my_profile_admin_caller",
      });

      const authed = t.withIdentity({
        subject: "workos_guard_my_profile_admin_caller",
        issuer: WORKOS_ISSUER,
      });

      await expect(authed.query(api.guards.getMyProfile, {})).rejects.toThrow(
        "Not authorized as field worker",
      );
    });
  });

  describe("RBAC", () => {
    it("authorizes admins who have the requested permission", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_rbac_authorized";
      await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_VIEW],
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });
      const result = await authed.query(internal.guards.checkPermission, {
        permission: PERMISSIONS.GUARDS_VIEW,
      });

      expect(result.authorized).toBe(true);
    });

    it("throws for callers without required permission", async () => {
      const t = createTest();
      const actorWorkosUserId = "workos_guard_rbac_missing_permission";
      const adminId = await createTestAdmin(t, {
        workosUserId: actorWorkosUserId,
        permissions: [PERMISSIONS.GUARDS_EDIT],
      });
      const societyId = await createTestSociety(t, {
        adminId,
        name: "RBAC Missing Permission Society",
      });
      await createTestGuard(t, {
        workosUserId: "workos_guard_rbac_missing_permission_target",
        societyId,
        phone: "9500000001",
      });

      const authed = t.withIdentity({ subject: actorWorkosUserId, issuer: WORKOS_ISSUER });

      await expect(authed.query(api.guards.list, {})).rejects.toThrow(
        `Missing permission: ${PERMISSIONS.GUARDS_VIEW}`,
      );
    });
  });
});
