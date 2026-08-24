import { convexTest } from "convex-test";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "../lib/constants";
import { api } from "./_generated/api";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_assignments";
process.env.WORKOS_API_KEY ??= "sk_test_assignments";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_assignments";

const { authKit } = await import("./auth");
const { requirePermission } = await import("./auth.helpers");
const { mutation } = await import("./functions");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;
type MutationHandler<Args, Result> = {
  _handler: (ctx: unknown, args: Args) => Promise<Result>;
};

function getMutationHandler<Args, Result>(wrappedMutation: unknown) {
  return (wrappedMutation as MutationHandler<Args, Result>)._handler;
}

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

const requirePermissionForTest = mutation({
  args: {
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    return await requirePermission(ctx, args.permission);
  },
});

const runRequirePermission = getMutationHandler<{ permission: string }, unknown>(
  requirePermissionForTest,
);

describe("userRoleAssignments", () => {
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

  it("assign creates role assignment with assigned_by_admin_id", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_assignment_creator";

    const [adminId, targetAdminId, roleId] = await t.run(async (ctx) => {
      const actorId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Manager",
        email: "manager@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const targetId = await ctx.db.insert("users", {
        workos_user_id: "workos_target_admin",
        user_type: "ADMIN",
        name: "Target Admin",
        email: "target@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const managerRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        permissions: [PERMISSIONS.ROLES_MANAGE],
        is_system_role: false,
        is_deleted: false,
      });

      const targetRoleId = await ctx.db.insert("roles", {
        name: "Lead Reviewer",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: actorId,
        role_id: managerRoleId,
        assigned_by_admin_id: actorId,
        is_deleted: false,
      });

      return [actorId, targetId, targetRoleId] as const;
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const assignmentId = await authed.mutation(api.userRoleAssignments.assign, {
      user_id: targetAdminId,
      role_id: roleId,
    });

    const assignment = await t.run(async (ctx) => {
      return await ctx.db.get(assignmentId);
    });

    expect(assignment?.user_id).toBe(targetAdminId);
    expect(assignment?.role_id).toBe(roleId);
    expect(assignment?.assigned_by_admin_id).toBe(adminId);
    expect(assignment?.is_deleted).toBe(false);
  });

  it("blocks duplicate active role assignment", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_assignment_duplicate";

    const [targetAdminId, roleId] = await t.run(async (ctx) => {
      const actorId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Manager",
        email: "manager-dup@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const targetId = await ctx.db.insert("users", {
        workos_user_id: "workos_target_admin_dup",
        user_type: "ADMIN",
        name: "Target Admin",
        email: "target-dup@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const managerRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        permissions: [PERMISSIONS.ROLES_MANAGE],
        is_system_role: false,
        is_deleted: false,
      });

      const targetRoleId = await ctx.db.insert("roles", {
        name: "Leads View",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: actorId,
        role_id: managerRoleId,
        assigned_by_admin_id: actorId,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: targetId,
        role_id: targetRoleId,
        assigned_by_admin_id: actorId,
        is_deleted: false,
      });

      return [targetId, targetRoleId] as const;
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.userRoleAssignments.assign, {
        user_id: targetAdminId,
        role_id: roleId,
      }),
    ).rejects.toThrow("Role already assigned");
  });

  it("revoke soft-deletes the assignment", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_assignment_revoke";

    const assignmentId = await t.run(async (ctx) => {
      const actorId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Manager",
        email: "manager-revoke@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const targetId = await ctx.db.insert("users", {
        workos_user_id: "workos_target_admin_revoke",
        user_type: "ADMIN",
        name: "Target Admin",
        email: "target-revoke@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const managerRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        permissions: [PERMISSIONS.ROLES_MANAGE],
        is_system_role: false,
        is_deleted: false,
      });

      const targetRoleId = await ctx.db.insert("roles", {
        name: "Lead Reviewer",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: actorId,
        role_id: managerRoleId,
        assigned_by_admin_id: actorId,
        is_deleted: false,
      });

      return await ctx.db.insert("user_role_assignments", {
        user_id: targetId,
        role_id: targetRoleId,
        assigned_by_admin_id: actorId,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await authed.mutation(api.userRoleAssignments.revoke, {
      assignment_id: assignmentId,
    });

    const updatedAssignment = await t.run(async (ctx) => {
      return await ctx.db.get(assignmentId);
    });

    expect(updatedAssignment?.is_deleted).toBe(true);
  });

  it("prevents revoking the last Super Admin assignment", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_assignment_last_super_admin";

    const assignmentId = await t.run(async (ctx) => {
      const actorId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Role Manager",
        email: "manager-last-sa@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const superAdminUserId = await ctx.db.insert("users", {
        workos_user_id: "workos_super_admin_only",
        user_type: "ADMIN",
        name: "Only Super Admin",
        email: "only-super-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const managerRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        permissions: [PERMISSIONS.ROLES_MANAGE],
        is_system_role: false,
        is_deleted: false,
      });

      const superAdminRoleId = await ctx.db.insert("roles", {
        name: "Super Admin",
        permissions: [PERMISSIONS.ROLES_MANAGE, PERMISSIONS.ROLES_VIEW],
        is_system_role: true,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: actorId,
        role_id: managerRoleId,
        assigned_by_admin_id: actorId,
        is_deleted: false,
      });

      return await ctx.db.insert("user_role_assignments", {
        user_id: superAdminUserId,
        role_id: superAdminRoleId,
        assigned_by_admin_id: actorId,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.userRoleAssignments.revoke, {
        assignment_id: assignmentId,
      }),
    ).rejects.toThrow("Cannot revoke the last Super Admin assignment");
  });

  it("requirePermission succeeds when permission is assigned", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_permission_success";

    await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Permission Admin",
        email: "permission-success@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const roleId = await ctx.db.insert("roles", {
        name: "Leads Viewer",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const user = await authed.run(async (ctx) => {
      return await runRequirePermission(ctx, {
        permission: PERMISSIONS.LEADS_VIEW,
      });
    });

    expect(user).toBeDefined();
  });

  it("requirePermission fails when permission is missing", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_permission_missing";

    await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Permission Admin",
        email: "permission-missing@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const roleId = await ctx.db.insert("roles", {
        name: "Leads Viewer",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequirePermission(ctx, {
          permission: PERMISSIONS.PAYOUTS_APPROVE,
        });
      }),
    ).rejects.toThrow(`Missing permission: ${PERMISSIONS.PAYOUTS_APPROVE}`);
  });

  it("requirePermission unions permissions across multiple roles", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_permission_union";

    await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Permission Admin",
        email: "permission-union@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const roleAId = await ctx.db.insert("roles", {
        name: "Leads Viewer",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: false,
        is_deleted: false,
      });

      const roleBId = await ctx.db.insert("roles", {
        name: "Payout Approver",
        permissions: [PERMISSIONS.PAYOUTS_APPROVE],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleAId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleBId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const user = await authed.run(async (ctx) => {
      return await runRequirePermission(ctx, {
        permission: PERMISSIONS.PAYOUTS_APPROVE,
      });
    });

    expect(user).toBeDefined();
  });
});
