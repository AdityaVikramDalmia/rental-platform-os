import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, SYSTEM_CONFIG_KEYS } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_system_config";
process.env.WORKOS_API_KEY ??= "sk_test_system_config";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_system_config";

const { authKit } = await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;
type InternalMutationRef<Args extends Record<string, unknown>, Result> = FunctionReference<
  "mutation",
  "internal",
  Args,
  Result
>;
type PublicQueryRef<Args extends Record<string, unknown>, Result> = FunctionReference<
  "query",
  "public",
  Args,
  Result
>;
type PublicMutationRef<Args extends Record<string, unknown>, Result> = FunctionReference<
  "mutation",
  "public",
  Args,
  Result
>;

const apiWithSystemConfig = api as typeof api & {
  systemConfig: {
    get: PublicQueryRef<{ key: string }, Doc<"system_config"> | null>;
    getAll: PublicQueryRef<Record<string, never>, Doc<"system_config">[]>;
    set: PublicMutationRef<{ key: string; value: string }, Id<"system_config">>;
  };
};

const internalApi = internal as typeof internal & {
  seed: {
    init: InternalMutationRef<Record<string, never>, void>;
  };
};

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

async function createAdminUser(
  t: ReturnType<typeof convexTest>,
  options?: {
    workosUserId?: string;
    permissions?: string[];
  },
) {
  const workosUserId = options?.workosUserId ?? "workos_system_config_admin";

  const adminId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: "ADMIN",
      name: "System Config Admin",
      email: `${workosUserId}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });

    if ((options?.permissions?.length ?? 0) > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Role ${workosUserId}`,
        permissions: options!.permissions!,
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: userId,
        role_id: roleId,
        assigned_by_admin_id: userId,
        is_deleted: false,
      });
    }

    return userId;
  });

  return { adminId, workosUserId };
}

describe("systemConfig", () => {
  beforeEach(() => {
    process.env.SUPER_ADMIN_EMAIL = "seed-system-config@example.com";

    vi.spyOn(authKit, "getAuthUser").mockImplementation(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity) {
        return null;
      }

      return buildAuthKitUser(identity.subject);
    });
  });

  afterEach(() => {
    delete process.env.SUPER_ADMIN_EMAIL;
    vi.restoreAllMocks();
  });

  it("get returns config entry by key", async () => {
    const t = convexTest(schema, modules);
    const { adminId, workosUserId } = await createAdminUser(t, {
      workosUserId: "workos_system_config_get",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("system_config", {
        key: SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
        value: "5",
        updated_by_admin_id: adminId,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const entry = await authed.query(apiWithSystemConfig.systemConfig.get, {
      key: SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
    });

    expect(entry).not.toBeNull();
    expect(entry?.value).toBe("5");
  });

  it("get returns null for nonexistent key", async () => {
    const t = convexTest(schema, modules);
    const { workosUserId } = await createAdminUser(t, {
      workosUserId: "workos_system_config_get_none",
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const entry = await authed.query(apiWithSystemConfig.systemConfig.get, {
      key: SYSTEM_CONFIG_KEYS.DEDUP_FLAT_WINDOW_DAYS,
    });

    expect(entry).toBeNull();
  });

  it("getAll returns all config entries", async () => {
    const t = convexTest(schema, modules);
    const { adminId, workosUserId } = await createAdminUser(t, {
      workosUserId: "workos_system_config_get_all",
      permissions: [PERMISSIONS.SYSTEM_CONFIGURE],
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("system_config", {
        key: SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
        value: "5",
        updated_by_admin_id: adminId,
      });

      await ctx.db.insert("system_config", {
        key: SYSTEM_CONFIG_KEYS.DEDUP_PHONE_WINDOW_DAYS,
        value: "30",
        updated_by_admin_id: adminId,
      });
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    const entries = await authed.query(apiWithSystemConfig.systemConfig.getAll, {});

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.key).sort()).toEqual([
      SYSTEM_CONFIG_KEYS.DEDUP_PHONE_WINDOW_DAYS,
      SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
    ]);
  });

  it("set updates existing config value", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internalApi.seed.init, {});

    const { adminId, workosUserId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workos_user_id: "workos_system_config_set_update",
        user_type: "ADMIN",
        name: "Config Updater",
        email: "config-updater@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const superAdminRole = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", "Super Admin"))
        .unique();

      if (!superAdminRole) {
        throw new Error("Super Admin role not found");
      }

      await ctx.db.insert("user_role_assignments", {
        user_id: userId,
        role_id: superAdminRole._id,
        assigned_by_admin_id: userId,
        is_deleted: false,
      });

      return { adminId: userId, workosUserId: "workos_system_config_set_update" };
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await authed.mutation(apiWithSystemConfig.systemConfig.set, {
      key: SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
      value: "12",
    });

    const updated = await t.run(async (ctx) => {
      return await ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY))
        .unique();
    });

    expect(updated?.value).toBe("12");
    expect(updated?.updated_by_admin_id).toBe(adminId);
  });

  it("set creates new config entry (upsert)", async () => {
    const t = convexTest(schema, modules);
    const { adminId, workosUserId } = await createAdminUser(t, {
      workosUserId: "workos_system_config_set_create",
      permissions: [PERMISSIONS.SYSTEM_CONFIGURE],
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await authed.mutation(apiWithSystemConfig.systemConfig.set, {
      key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_MIN_LEADS,
      value: "15",
    });

    const created = await t.run(async (ctx) => {
      return await ctx.db
        .query("system_config")
        .withIndex("by_key", (q) =>
          q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_MIN_LEADS),
        )
        .unique();
    });

    expect(created).not.toBeNull();
    expect(created?.value).toBe("15");
    expect(created?.updated_by_admin_id).toBe(adminId);
  });

  it("set requires system.configure permission", async () => {
    const t = convexTest(schema, modules);
    const { workosUserId } = await createAdminUser(t, {
      workosUserId: "workos_system_config_missing_permission",
      permissions: [PERMISSIONS.LEADS_VIEW],
    });

    const authed = t.withIdentity({
      subject: workosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(apiWithSystemConfig.systemConfig.set, {
        key: SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
        value: "7",
      }),
    ).rejects.toThrow("Missing permission: system.configure");
  });
});
