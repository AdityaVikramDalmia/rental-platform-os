import { convexTest } from "convex-test";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "../lib/constants";
import { api } from "./_generated/api";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_admins";
process.env.WORKOS_API_KEY ??= "sk_test_admins";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_admins";

const { authKit, handleUserCreated } = await import("./auth");
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

const runUserCreatedForTest = mutation({
  args: {
    id: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await handleUserCreated(ctx, {
      data: {
        id: args.id,
        email: args.email,
        firstName: args.firstName ?? null,
        lastName: args.lastName ?? null,
      },
    });
  },
});

const runUserCreated = getMutationHandler<
  {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  },
  void
>(runUserCreatedForTest);

describe("admins", () => {
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

  it("creates admin with empty workos_user_id", async () => {
    const t = convexTest(schema, modules);
    const actorWorkosUserId = "workos_admin_creator";

    await t.run(async (ctx) => {
      const creatorId = await ctx.db.insert("users", {
        workos_user_id: actorWorkosUserId,
        user_type: "ADMIN",
        name: "Creator Admin",
        email: "creator@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const creatorRoleId = await ctx.db.insert("roles", {
        name: "Admin Creator",
        permissions: [PERMISSIONS.ADMINS_CREATE],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: creatorId,
        role_id: creatorRoleId,
        assigned_by_admin_id: creatorId,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: actorWorkosUserId,
      issuer: "https://api.workos.com/",
    });

    const createdAdminId = await authed.mutation(api.admins.create, {
      name: "Ops Admin",
      email: "ops-admin@example.com",
    });

    const createdAdmin = await t.run(async (ctx) => {
      return await ctx.db.get(createdAdminId);
    });

    expect(createdAdmin).toBeDefined();
    expect(createdAdmin?.user_type).toBe("ADMIN");
    expect(createdAdmin?.status).toBe("ACTIVE");
    expect(createdAdmin?.must_change_password).toBe(false);
    expect(createdAdmin?.workos_user_id).toBe("");
    expect(createdAdmin?.email).toBe("ops-admin@example.com");
  });

  it("rejects rental-platform-os.app email addresses", async () => {
    const t = convexTest(schema, modules);
    const actorWorkosUserId = "workos_admin_creator_reject";

    await t.run(async (ctx) => {
      const creatorId = await ctx.db.insert("users", {
        workos_user_id: actorWorkosUserId,
        user_type: "ADMIN",
        name: "Creator Admin",
        email: "creator-reject@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const creatorRoleId = await ctx.db.insert("roles", {
        name: "Admin Creator",
        permissions: [PERMISSIONS.ADMINS_CREATE],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: creatorId,
        role_id: creatorRoleId,
        assigned_by_admin_id: creatorId,
        is_deleted: false,
      });
    });

    const authed = t.withIdentity({
      subject: actorWorkosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.admins.create, {
        name: "Invalid Admin",
        email: "invalid@guards.local",
      }),
    ).rejects.toThrow("rental-platform-os.app emails are reserved for guards");
  });

  it("rejects duplicate admin emails", async () => {
    const t = convexTest(schema, modules);
    const actorWorkosUserId = "workos_admin_creator_duplicate";

    await t.run(async (ctx) => {
      const creatorId = await ctx.db.insert("users", {
        workos_user_id: actorWorkosUserId,
        user_type: "ADMIN",
        name: "Creator Admin",
        email: "creator-duplicate@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });

      const creatorRoleId = await ctx.db.insert("roles", {
        name: "Admin Creator",
        permissions: [PERMISSIONS.ADMINS_CREATE],
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: creatorId,
        role_id: creatorRoleId,
        assigned_by_admin_id: creatorId,
        is_deleted: false,
      });

      await ctx.db.insert("users", {
        workos_user_id: "",
        user_type: "ADMIN",
        name: "Existing Admin",
        email: "existing-admin@example.com",
        status: "ACTIVE",
        must_change_password: false,
      });
    });

    const authed = t.withIdentity({
      subject: actorWorkosUserId,
      issuer: "https://api.workos.com/",
    });

    await expect(
      authed.mutation(api.admins.create, {
        name: "Duplicate Admin",
        email: "existing-admin@example.com",
      }),
    ).rejects.toThrow("User with this email already exists");
  });

  it("patches pre-created admin on user.created email upsert", async () => {
    const t = convexTest(schema, modules);
    const precreatedEmail = "future-admin@example.com";

    const precreatedAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        workos_user_id: "",
        user_type: "ADMIN",
        name: "Precreated Admin",
        email: precreatedEmail,
        status: "ACTIVE",
        must_change_password: false,
      });
    });

    await t.run(async (ctx) => {
      await runUserCreated(ctx, {
        id: "workos_user_future_admin",
        email: "FUTURE-ADMIN@EXAMPLE.COM",
        firstName: "Future",
        lastName: "Owner",
      });
    });

    const usersWithEmail = await t.run(async (ctx) => {
      return await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", precreatedEmail))
        .collect();
    });

    expect(usersWithEmail).toHaveLength(1);
    expect(usersWithEmail[0]._id).toBe(precreatedAdminId);
    expect(usersWithEmail[0].workos_user_id).toBe("workos_user_future_admin");
    expect(usersWithEmail[0].name).toBe("Future Owner");
  });
});
