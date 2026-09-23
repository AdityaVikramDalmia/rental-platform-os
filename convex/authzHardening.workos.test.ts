// Authorization regressions for the WorkOS account actions (WorkOS client mocked; no network).
// Sweep record: docs/security/authz-sweep-2026-09-23.md
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type UserType } from "../lib/constants";
import { api } from "./_generated/api";
import schema from "./schema";
import { setRolloutState } from "./testUtils/fieldWorkerFixtures";

const workosMocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  listUsers: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    userManagement = workosMocks;
  },
}));

process.env.WORKOS_CLIENT_ID ??= "client_test_authz_workos";
process.env.WORKOS_API_KEY ??= "sk_test_authz_workos";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_authz_workos";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTest>;

let sequence = 0;

async function createUser(t: TestBackend, userType: UserType, permissions: string[] = []) {
  sequence += 1;
  const workosUserId = `workos_authz_ws_${userType.toLowerCase()}_${sequence}`;

  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} ${sequence}`,
      email: `${workosUserId}@example.com`,
      phone: `97${String(sequence).padStart(8, "0")}`,
      status: "ACTIVE",
      must_change_password: false,
    });

    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Authz workos role ${sequence}`,
        permissions,
        is_system_role: false,
        is_deleted: false,
      });
      await ctx.db.insert("user_role_assignments", {
        user_id: id,
        role_id: roleId,
        assigned_by_admin_id: id,
        is_deleted: false,
      });
    }

    return id;
  });

  return {
    userId,
    workosUserId,
    as: t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" }),
  };
}

describe("WorkOS account actions authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workosMocks.updateUser.mockResolvedValue({});
  });

  describe("resetGuardPassword", () => {
    it("refuses a WorkOS id that does not belong to the guard being reset", async () => {
      const t = createTest();
      const resetter = await createUser(t, "ADMIN", [PERMISSIONS.GUARDS_RESET_PASSWORD]);
      const superAdmin = await createUser(t, "ADMIN", [PERMISSIONS.ROLES_MANAGE]);
      const guard = await createUser(t, "GUARD");

      await expect(
        resetter.as.action(api.actions.workos.resetGuardPassword, {
          workos_user_id: superAdmin.workosUserId,
          user_id: guard.userId,
          new_temp_password: "Temp-Password-123",
        }),
      ).rejects.toThrow("Guard not found");

      await expect(
        resetter.as.action(api.actions.workos.resetGuardPassword, {
          workos_user_id: superAdmin.workosUserId,
          user_id: superAdmin.userId,
          new_temp_password: "Temp-Password-123",
        }),
      ).rejects.toThrow("Guard not found");

      expect(workosMocks.updateUser).not.toHaveBeenCalled();
    });

    it("resets the password of the matching guard", async () => {
      const t = createTest();
      const resetter = await createUser(t, "ADMIN", [PERMISSIONS.GUARDS_RESET_PASSWORD]);
      const guard = await createUser(t, "GUARD");

      await resetter.as.action(api.actions.workos.resetGuardPassword, {
        workos_user_id: guard.workosUserId,
        user_id: guard.userId,
        new_temp_password: "Temp-Password-123",
      });

      expect(workosMocks.updateUser).toHaveBeenCalledWith({
        userId: guard.workosUserId,
        password: "Temp-Password-123",
      });
      const updated = await t.run(async (ctx) => await ctx.db.get(guard.userId));
      expect(updated?.must_change_password).toBe(true);
    });
  });

  describe("createOpsAccount", () => {
    const args = { name: "New Ops", phone: "9876501234", temp_password: "Temp-Password-123" };

    it("requires roles.manage in addition to guards.create", async () => {
      const t = createTest();
      const creator = await createUser(t, "ADMIN", [PERMISSIONS.GUARDS_CREATE]);

      await expect(creator.as.action(api.actions.workos.createOpsAccount, args)).rejects.toThrow(
        "Missing permission: roles.manage",
      );
      expect(workosMocks.createUser).not.toHaveBeenCalled();
    });

    it("creates the OPS account for a caller who may also grant roles", async () => {
      const t = createTest();
      const creator = await createUser(t, "ADMIN", [
        PERMISSIONS.GUARDS_CREATE,
        PERMISSIONS.ROLES_MANAGE,
      ]);
      await t.run(async (ctx) => {
        // Provides the default society an OPS account is assigned to.
        await setRolloutState(ctx, "DISABLED");
        await ctx.db.insert("roles", {
          name: "Ops Agent",
          permissions: [PERMISSIONS.LEADS_VIEW],
          is_system_role: true,
          is_deleted: false,
        });
      });
      workosMocks.createUser.mockResolvedValue({ id: "workos_created_ops" });

      const result = await creator.as.action(api.actions.workos.createOpsAccount, args);

      expect(result.workos_user_id).toBe("workos_created_ops");
      const created = await t.run(async (ctx) => await ctx.db.get(result.user_id));
      expect(created?.user_type).toBe("OPS");
    });
  });
});
