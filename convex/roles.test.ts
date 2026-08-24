import { convexTest } from "convex-test";
import rateLimiterComponent from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "../lib/constants";
import { api } from "./_generated/api";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_roles";
process.env.WORKOS_API_KEY ??= "sk_test_roles";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_roles";

const { authKit } = await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

// `roles.ts` calls into the `rateLimiter` component (see convex/convex.config.ts).
// convex-test does not auto-register third-party components, so register it here
// before exercising any code path that touches the rate limiter.
function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterComponent.register(t);
  return t;
}

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

describe("roles", () => {
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

  it("creates a role with expected fields", async () => {
    const t = createTest();
    const workosUserId = "workos_roles_creator";

    await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Creator",
        email: "role-creator@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const managerRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        permissions: [PERMISSIONS.ROLES_MANAGE],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: managerRoleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const createdRoleId = await authed.mutation(api.roles.create, {
      name: "Lead Reviewer",
      description: "Reviews submitted leads",
      permissions: [PERMISSIONS.LEADS_VIEW, PERMISSIONS.LEADS_VERIFY],
    });

    const createdRole = await t.run(async (ctx) => {
      return await ctx.db.get(createdRoleId);
    });

    expect(createdRole).toBeDefined();
    expect(createdRole?.name).toBe("Lead Reviewer");
    expect(createdRole?.description).toBe("Reviews submitted leads");
    expect(createdRole?.permissions).toEqual([
      PERMISSIONS.LEADS_VIEW,
      PERMISSIONS.LEADS_VERIFY,
    ]);
    expect(createdRole?.is_deleted).toBe(false);
  });

  it("blocks soft deletion of system roles", async () => {
    const t = createTest();
    const workosUserId = "workos_roles_delete_block";

    const systemRoleId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Admin",
        email: "role-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const managerRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        permissions: [PERMISSIONS.ROLES_MANAGE],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: managerRoleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });

      return await ctx.db.insert("roles", {
        name: "Super Admin",
        permissions: [PERMISSIONS.ROLES_MANAGE, PERMISSIONS.ROLES_VIEW],
        is_system_role: true,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.roles.softDelete, {
        id: systemRoleId,
      }),
    ).rejects.toThrow("Cannot delete a system role");
  });

  it("blocks renaming a system role", async () => {
    const t = createTest();
    const workosUserId = "workos_roles_rename_block";

    const systemRoleId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Admin",
        email: "role-admin-2@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const managerRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        permissions: [PERMISSIONS.ROLES_MANAGE],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: managerRoleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });

      return await ctx.db.insert("roles", {
        name: "Ops Agent",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: true,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.roles.update, {
        id: systemRoleId,
        name: "Ops Agent Updated",
      }),
    ).rejects.toThrow("Cannot rename a system role");
  });

  it("allows updating permissions on a system role", async () => {
    const t = createTest();
    const workosUserId = "workos_roles_system_permissions";

    const systemRoleId = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Admin",
        email: "role-admin-3@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const managerRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        permissions: [PERMISSIONS.ROLES_MANAGE],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: managerRoleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });

      return await ctx.db.insert("roles", {
        name: "Super Admin",
        permissions: [PERMISSIONS.ROLES_VIEW],
        is_system_role: true,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await authed.mutation(api.roles.update, {
      id: systemRoleId,
      permissions: [PERMISSIONS.ROLES_VIEW, PERMISSIONS.ADMINS_CREATE],
    });

    const updatedRole = await t.run(async (ctx) => {
      return await ctx.db.get(systemRoleId);
    });

    expect(updatedRole?.permissions).toEqual([
      PERMISSIONS.ROLES_VIEW,
      PERMISSIONS.ADMINS_CREATE,
    ]);
  });

  it("excludes soft-deleted roles from list", async () => {
    const t = createTest();
    const workosUserId = "workos_roles_list_filter";

    await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Viewer",
        email: "role-viewer@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const viewerRoleId = await ctx.db.insert("roles", {
        name: "Roles Viewer",
        permissions: [PERMISSIONS.ROLES_VIEW],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: viewerRoleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });

      await ctx.db.insert("roles", {
        name: "Active Role",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("roles", {
        name: "Deleted Role",
        permissions: [PERMISSIONS.PAYOUTS_VIEW],
        is_system_role: false,
        is_deleted: true,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const listedRoles = await authed.query(api.roles.list, {});

    expect(listedRoles.map((role) => role.name)).toContain("Active Role");
    expect(listedRoles.map((role) => role.name)).not.toContain("Deleted Role");
  });
});
