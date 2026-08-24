import { convexTest } from "convex-test";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./functions";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_auth_helpers";
process.env.WORKOS_API_KEY ??= "sk_test_auth_helpers";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_auth_helpers";

const { authKit } = await import("./auth");
const {
  getAuthenticatedUser,
  requireAdmin,
  requireAuth,
  requireFieldWorker,
  requireFieldWorkerAuth,
  requireGuard,
  requirePermission,
} = await import("./auth.helpers");
import {
  createGuardFixture,
  createOpsFixture,
  createOpsWithProfileFixture,
  setRolloutState,
} from "./testUtils/fieldWorkerFixtures";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type UserDoc = Doc<"users">;
type GuardProfileDoc = Doc<"guard_profiles">;
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
    email: `${id}@guards.local`,
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

const getAuthenticatedUserForTest = mutation({
  args: {},
  handler: async (ctx) => {
    return await getAuthenticatedUser(ctx);
  },
});

const requireAuthForTest = mutation({
  args: {},
  handler: async (ctx) => {
    return await requireAuth(ctx);
  },
});

const requireGuardForTest = mutation({
  args: {},
  handler: async (ctx) => {
    return await requireGuard(ctx);
  },
});

const requireAdminForTest = mutation({
  args: {},
  handler: async (ctx) => {
    return await requireAdmin(ctx);
  },
});

const requirePermissionForTest = mutation({
  args: {
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    return await requirePermission(ctx, args.permission);
  },
});

const requireFieldWorkerForTest = mutation({
  args: {},
  handler: async (ctx) => {
    return await requireFieldWorker(ctx);
  },
});

const requireFieldWorkerAuthForTest = mutation({
  args: {},
  handler: async (ctx) => {
    return await requireFieldWorkerAuth(ctx);
  },
});

const runGetAuthenticatedUser = getMutationHandler<Record<string, never>, UserDoc | null>(
  getAuthenticatedUserForTest,
);
const runRequireAuth = getMutationHandler<Record<string, never>, UserDoc>(requireAuthForTest);
const runRequireGuard = getMutationHandler<Record<string, never>, UserDoc>(requireGuardForTest);
const runRequireAdmin = getMutationHandler<Record<string, never>, UserDoc>(requireAdminForTest);
const runRequirePermission = getMutationHandler<{ permission: string }, UserDoc>(
  requirePermissionForTest,
);
const runRequireFieldWorker = getMutationHandler<
  Record<string, never>,
  { user: UserDoc; guardProfile: GuardProfileDoc }
>(requireFieldWorkerForTest);
const runRequireFieldWorkerAuth = getMutationHandler<Record<string, never>, { user: UserDoc }>(
  requireFieldWorkerAuthForTest,
);

describe("auth.helpers", () => {
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

  it("getAuthenticatedUser returns null when no identity", async () => {
    const t = convexTest(schema, modules);

    const user = await t.run(async (ctx) => {
      return await runGetAuthenticatedUser(ctx, {});
    });

    expect(user).toBeNull();
  });

  it("getAuthenticatedUser returns user record when identity exists", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_guard_authenticated";

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "GUARD",
        name: "Guard User",
        phone: "9876543210",
        status: "ACTIVE",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const user = await authed.run(async (ctx) => {
      return await runGetAuthenticatedUser(ctx, {});
    });

    expect(user?._id).toBe(userId);
    expect(user?.workos_user_id).toBe(workosUserId);
  });

  it("requireAuth throws Not authenticated for unauthenticated requests", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.run(async (ctx) => {
        return await runRequireAuth(ctx, {});
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("requireAuth throws Account banned for banned users", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_banned_guard";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "GUARD",
        name: "Banned Guard",
        phone: "9876543211",
        status: "BANNED",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireAuth(ctx, {});
      }),
    ).rejects.toThrow("Account banned");
  });

  it("requireGuard throws Guard access required for admin users", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_admin_for_guard_check";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Admin User",
        email: "admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireGuard(ctx, {});
      }),
    ).rejects.toThrow("Guard access required");
  });

  it("requireGuard throws Guard account not active for inactive guards", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_inactive_guard";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "GUARD",
        name: "Inactive Guard",
        phone: "9876543212",
        status: "INACTIVE",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireGuard(ctx, {});
      }),
    ).rejects.toThrow("Guard account not active");
  });

  it("requireAdmin throws Admin access required for guard users", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_guard_for_admin_check";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "GUARD",
        name: "Guard User",
        phone: "9876543213",
        status: "ACTIVE",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireAdmin(ctx, {});
      }),
    ).rejects.toThrow("Admin access required");
  });

  it("requirePermission throws Missing permission when role lacks permission", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_admin_missing_permission";

    const [adminId, assignedById] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Ops Admin",
        email: "ops-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const superAdminId = await ctx.db.insert("users", {
        workos_user_id: "workos_super_admin",
        user_type: "ADMIN",
        name: "Super Admin",
        email: "super-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      return [userId, superAdminId] as const;
    });

    await t.run(async (ctx) => {
      const roleId = await ctx.db.insert("roles", {
        name: "Leads Viewer",
        description: "Can view leads",
        permissions: ["leads.view"],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleId,
        assigned_by_admin_id: assignedById,
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
          permission: "payouts.approve",
        });
      }),
    ).rejects.toThrow("Missing permission: payouts.approve");
  });

  it("requirePermission succeeds when permission exists in assigned role", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_admin_with_permission";

    const [adminId, assignedById] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Permission Admin",
        email: "permission-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const superAdminId = await ctx.db.insert("users", {
        workos_user_id: "workos_super_admin_2",
        user_type: "ADMIN",
        name: "Super Admin 2",
        email: "super-admin-2@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      return [userId, superAdminId] as const;
    });

    await t.run(async (ctx) => {
      const roleId = await ctx.db.insert("roles", {
        name: "Payout Approver",
        description: "Can approve payouts",
        permissions: ["payouts.approve"],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleId,
        assigned_by_admin_id: assignedById,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const user = await authed.run(async (ctx) => {
      return await runRequirePermission(ctx, {
        permission: "payouts.approve",
      });
    });

    expect(user._id).toBe(adminId);
  });

  it("requirePermission unions permissions across multiple roles", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_admin_multi_role";

    const [adminId, assignedById] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Multi Role Admin",
        email: "multi-role-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const superAdminId = await ctx.db.insert("users", {
        workos_user_id: "workos_super_admin_3",
        user_type: "ADMIN",
        name: "Super Admin 3",
        email: "super-admin-3@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      return [userId, superAdminId] as const;
    });

    await t.run(async (ctx) => {
      const leadsRoleId = await ctx.db.insert("roles", {
        name: "Leads Viewer",
        description: "Can view leads",
        permissions: ["leads.view"],
        is_system_role: false,
        is_deleted: false,
      });

      const rolesRoleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        description: "Can manage roles",
        permissions: ["roles.manage"],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: leadsRoleId,
        assigned_by_admin_id: assignedById,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: rolesRoleId,
        assigned_by_admin_id: assignedById,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const user = await authed.run(async (ctx) => {
      return await runRequirePermission(ctx, {
        permission: "roles.manage",
      });
    });

    expect(user._id).toBe(adminId);
  });

  it("requirePermission ignores soft-deleted role assignments", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_admin_deleted_assignment";

    const [adminId, assignedById] = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "ADMIN",
        name: "Deleted Assignment Admin",
        email: "deleted-assignment-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const superAdminId = await ctx.db.insert("users", {
        workos_user_id: "workos_super_admin_4",
        user_type: "ADMIN",
        name: "Super Admin 4",
        email: "super-admin-4@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      return [userId, superAdminId] as const;
    });

    await t.run(async (ctx) => {
      const roleId = await ctx.db.insert("roles", {
        name: "Roles Manager",
        description: "Can manage roles",
        permissions: ["roles.manage"],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleId,
        assigned_by_admin_id: assignedById,
        is_deleted: true,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequirePermission(ctx, {
          permission: "roles.manage",
        });
      }),
    ).rejects.toThrow("Missing permission: roles.manage");
  });

  it("requireFieldWorker allows guards regardless of OPS rollout state", async () => {
    const t = convexTest(schema, modules);

    const guard = await t.run(async (ctx) => {
      await setRolloutState(ctx, "DISABLED");
      return await createGuardFixture(ctx);
    });

    const authed = t.withIdentity({
      subject: guard.workosUserId,
      issuer: "https://api.workos.com/",
    });

    const result = await authed.run(async (ctx) => {
      return await runRequireFieldWorker(ctx, {});
    });

    expect(result.user._id).toBe(guard.userId);
    expect(result.guardProfile._id).toBe(guard.guardProfileId);
  });

  it("requireFieldWorkerAuth returns only user and skips profile lookup", async () => {
    const t = convexTest(schema, modules);

    const ops = await t.run(async (ctx) => {
      await setRolloutState(ctx, "ENABLED");
      return await createOpsFixture(ctx);
    });

    const authed = t.withIdentity({
      subject: ops.workosUserId,
      issuer: "https://api.workos.com/",
    });

    const result = await authed.run(async (ctx) => {
      return await runRequireFieldWorkerAuth(ctx, {});
    });

    expect(result.user._id).toBe(ops.userId);
    expect(Object.keys(result)).toEqual(["user"]);
  });

  it("requireFieldWorker rejects non-GUARD and non-OPS users", async () => {
    const t = convexTest(schema, modules);
    const workosUserId = "workos_tenant_for_field_worker";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: "TENANT",
        name: "Tenant User",
        email: "tenant-for-field-worker@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireFieldWorkerAuth(ctx, {});
      }),
    ).rejects.toThrow("Not authorized as field worker");
  });

  it("requireFieldWorker rejects inactive users", async () => {
    const t = convexTest(schema, modules);

    const guard = await t.run(async (ctx) => {
      return await createGuardFixture(ctx, {
        status: "INACTIVE",
      });
    });

    const authed = t.withIdentity({
      subject: guard.workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireFieldWorkerAuth(ctx, {});
      }),
    ).rejects.toThrow("Not authorized as field worker");
  });

  it("requireFieldWorker maps banned users to field-worker authorization error", async () => {
    const t = convexTest(schema, modules);

    const guard = await t.run(async (ctx) => {
      return await createGuardFixture(ctx, {
        status: "BANNED",
      });
    });

    const authed = t.withIdentity({
      subject: guard.workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireFieldWorkerAuth(ctx, {});
      }),
    ).rejects.toThrow("Not authorized as field worker");
  });

  it("requireFieldWorker blocks OPS users when rollout is disabled", async () => {
    const t = convexTest(schema, modules);

    const ops = await t.run(async (ctx) => {
      const fixture = await createOpsWithProfileFixture(ctx);
      await setRolloutState(ctx, "DISABLED");
      return fixture;
    });

    const authed = t.withIdentity({
      subject: ops.workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireFieldWorker(ctx, {});
      }),
    ).rejects.toThrow("Feature not enabled");
  });

  it("requireFieldWorker enforces OPS canary allowlist", async () => {
    const t = convexTest(schema, modules);

    const [allowedOps, blockedOps] = await t.run(async (ctx) => {
      const allowed = await createOpsWithProfileFixture(ctx);
      const blocked = await createOpsWithProfileFixture(ctx);
      await setRolloutState(ctx, "CANARY", [allowed.userId]);
      return [allowed, blocked] as const;
    });

    const allowedAuthed = t.withIdentity({
      subject: allowedOps.workosUserId,
      issuer: "https://api.workos.com/",
    });
    const blockedAuthed = t.withIdentity({
      subject: blockedOps.workosUserId,
      issuer: "https://api.workos.com/",
    });

    const allowedResult = await allowedAuthed.run(async (ctx) => {
      return await runRequireFieldWorker(ctx, {});
    });
    expect(allowedResult.user._id).toBe(allowedOps.userId);

    await expect(
      blockedAuthed.run(async (ctx) => {
        return await runRequireFieldWorker(ctx, {});
      }),
    ).rejects.toThrow("Feature not enabled");
  });

  it("requireFieldWorker allows OPS users when rollout is globally enabled", async () => {
    const t = convexTest(schema, modules);

    const ops = await t.run(async (ctx) => {
      const fixture = await createOpsWithProfileFixture(ctx);
      await setRolloutState(ctx, "ENABLED");
      return fixture;
    });

    const authed = t.withIdentity({
      subject: ops.workosUserId,
      issuer: "https://api.workos.com/",
    });

    const result = await authed.run(async (ctx) => {
      return await runRequireFieldWorker(ctx, {});
    });

    expect(result.user._id).toBe(ops.userId);
    expect(result.guardProfile._id).toBe(ops.guardProfileId);
  });

  it("requireFieldWorker rejects eligible OPS users with missing guard profile", async () => {
    const t = convexTest(schema, modules);

    const ops = await t.run(async (ctx) => {
      await setRolloutState(ctx, "ENABLED");
      return await createOpsFixture(ctx);
    });

    const authed = t.withIdentity({
      subject: ops.workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.run(async (ctx) => {
        return await runRequireFieldWorker(ctx, {});
      }),
    ).rejects.toThrow("Not authorized as field worker");
  });
});
