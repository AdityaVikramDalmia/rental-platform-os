import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_PERMISSIONS,
  OPS_AGENT_PERMISSIONS,
  P44_CONFIG_KEYS,
  SYSTEM_CONFIG_DEFAULTS,
} from "../lib/constants";
import { LOCAL_AUTH_IDENTITIES } from "../lib/localAuthConfig";
import { internal } from "./_generated/api";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_seed";
process.env.WORKOS_API_KEY ??= "sk_test_seed";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_seed";

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

describe("seed", () => {
  beforeEach(() => {
    process.env.SUPER_ADMIN_EMAIL = "super-admin@example.com";

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
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("seed creates 2 roles (Super Admin, Ops Agent)", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internalApi.seed.init, {});

    const roles = await t.run(async (ctx) => {
      return await ctx.db.query("roles").collect();
    });

    expect(roles).toHaveLength(2);
    expect(roles.map((role) => role.name).sort()).toEqual(["Ops Agent", "Super Admin"]);
  });

  it("Super Admin has ALL_PERMISSIONS", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internalApi.seed.init, {});

    const superAdminRole = await t.run(async (ctx) => {
      return await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", "Super Admin"))
        .unique();
    });

    expect(superAdminRole).not.toBeNull();
    expect(superAdminRole?.permissions).toHaveLength(ALL_PERMISSIONS.length);
  });

  it("Ops Agent has OPS_AGENT_PERMISSIONS", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internalApi.seed.init, {});

    const opsAgentRole = await t.run(async (ctx) => {
      return await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", "Ops Agent"))
        .unique();
    });

    expect(opsAgentRole).not.toBeNull();
    expect(opsAgentRole?.permissions).toHaveLength(OPS_AGENT_PERMISSIONS.length);
  });

  it("seed creates admin user", async () => {
    const t = convexTest(schema, modules);
    const superAdminEmail = "seed-admin@example.com";
    process.env.SUPER_ADMIN_EMAIL = superAdminEmail;

    await t.mutation(internalApi.seed.init, {});

    const user = await t.run(async (ctx) => {
      return await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", superAdminEmail))
        .first();
    });

    expect(user).not.toBeNull();
    expect(user?.user_type).toBe("ADMIN");
    expect(user?.status).toBe("ACTIVE");
  });

  it("seed creates role assignment", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internalApi.seed.init, {});

    const [superAdminRole, adminUser] = await t.run(async (ctx) => {
      const role = await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", "Super Admin"))
        .unique();
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "super-admin@example.com"))
        .unique();

      return [role, user] as const;
    });

    expect(superAdminRole).not.toBeNull();
    expect(adminUser).not.toBeNull();

    const assignments = await t.run(async (ctx) => {
      return await ctx.db
        .query("user_role_assignments")
        .withIndex("by_user_id", (q) => q.eq("user_id", adminUser!._id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect();
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0].role_id).toBe(superAdminRole!._id);
    expect(assignments[0].assigned_by_admin_id).toBe(adminUser!._id);
  });

  it("seed creates all config entries", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internalApi.seed.init, {});

    const configEntries = await t.run(async (ctx) => {
      return await ctx.db.query("system_config").collect();
    });

    expect(configEntries).toHaveLength(Object.keys(SYSTEM_CONFIG_DEFAULTS).length);
  });

  it("seed backfills P44 rollout config defaults", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internalApi.seed.init, {});

    const [opsFieldWorkerEnabled, opsFieldWorkerCanary, defaultUnassignedSociety, testSociety] =
      await t.run(async (ctx) => {
        const enabled = await ctx.db
          .query("system_config")
          .withIndex("by_key", (q) => q.eq("key", P44_CONFIG_KEYS.OPS_FIELD_WORKER_ENABLED))
          .first();
        const canary = await ctx.db
          .query("system_config")
          .withIndex("by_key", (q) => q.eq("key", P44_CONFIG_KEYS.OPS_FIELD_WORKER_CANARY_USER_IDS))
          .first();
        const fallbackSociety = await ctx.db
          .query("system_config")
          .withIndex("by_key", (q) => q.eq("key", P44_CONFIG_KEYS.DEFAULT_UNASSIGNED_SOCIETY_ID))
          .first();
        const seededTestSociety = await ctx.db
          .query("societies")
          .withIndex("by_name", (q) => q.eq("name", "Test Society"))
          .first();

        return [enabled, canary, fallbackSociety, seededTestSociety] as const;
      });

    expect(opsFieldWorkerEnabled?.value).toBe("false");
    expect(opsFieldWorkerCanary?.value).toBe("[]");
    expect(defaultUnassignedSociety?.value).toBe(testSociety?._id ?? "");
  });

  it("seed is idempotent", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internalApi.seed.init, {});
    await t.mutation(internalApi.seed.init, {});

    const counts = await t.run(async (ctx) => {
      const [roles, users, assignments, configs] = await Promise.all([
        ctx.db.query("roles").collect(),
        ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", "super-admin@example.com"))
          .collect(),
        ctx.db.query("user_role_assignments").collect(),
        ctx.db.query("system_config").collect(),
      ]);

      return {
        roles: roles.length,
        users: users.length,
        assignments: assignments.length,
        configs: configs.length,
      };
    });

    expect(counts.roles).toBe(2);
    expect(counts.users).toBe(1);
    expect(counts.assignments).toBe(1);
    expect(counts.configs).toBe(Object.keys(SYSTEM_CONFIG_DEFAULTS).length);
  });

  it("seed throws without SUPER_ADMIN_EMAIL", async () => {
    const t = convexTest(schema, modules);

    delete process.env.SUPER_ADMIN_EMAIL;

    await expect(t.mutation(internalApi.seed.init, {})).rejects.toThrow(
      "SUPER_ADMIN_EMAIL environment variable is required",
    );
  });

  it("seeds tenant and owner identities for local auth", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    delete process.env.SUPER_ADMIN_EMAIL;

    await t.mutation(internalApi.seed.init, {});

    const [users, ownerProfile] = await t.run(async (ctx) => {
      const seededUsers = await Promise.all(
        [LOCAL_AUTH_IDENTITIES.tenant.workosUserId, LOCAL_AUTH_IDENTITIES.owner.workosUserId].map(
          async (workosUserId) =>
            await ctx.db
              .query("users")
              .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", workosUserId))
              .unique(),
        ),
      );

      const owner = await ctx.db
        .query("owners")
        .withIndex("by_user_id", (q) => q.eq("user_id", seededUsers[1]!._id))
        .unique();

      return [seededUsers, owner] as const;
    });

    expect(users.map((user) => user?.user_type)).toEqual(["TENANT", "OWNER"]);
    expect(ownerProfile).toMatchObject({
      lifecycle_stage: "ACTIVE",
      user_id: users[1]?._id,
    });
  });
});
