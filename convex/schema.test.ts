import { convexTest } from "convex-test";
import { v } from "convex/values";
import { describe, expect, it } from "vitest";
import { mutation } from "./functions";
import schema from "./schema";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type MutationHandler<Args, Result> = {
  _handler: (ctx: unknown, args: Args) => Promise<Result>;
};

function getMutationHandler<Args, Result>(wrappedMutation: unknown) {
  return (wrappedMutation as MutationHandler<Args, Result>)._handler;
}

const insertUserForTest = mutation({
  args: {
    workos_user_id: v.string(),
    name: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      workos_user_id: args.workos_user_id,
      user_type: "GUARD",
      name: args.name,
      phone: args.phone,
      status: "ACTIVE",
      must_change_password: true,
    });
  },
});

const updateUserNameForTest = mutation({
  args: {
    user_id: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.user_id, { name: args.name });
  },
});

const insertRoleForTest = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("roles", {
      name: args.name,
      description: "Operational role",
      permissions: ["leads.view"],
      is_system_role: false,
      is_deleted: false,
    });
  },
});

const runInsertUser = getMutationHandler<
  { workos_user_id: string; name: string; phone: string },
  string
>(insertUserForTest);
const runUpdateUserName = getMutationHandler<{ user_id: string; name: string }, void>(
  updateUserNameForTest,
);
const runInsertRole = getMutationHandler<{ name: string }, string>(insertRoleForTest);

describe("Schema + Audit Triggers", () => {
  it("creates a USERS_INSERT audit log for user inserts", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await runInsertUser(ctx, {
        workos_user_id: "workos_user_insert_1",
        name: "Insert Guard",
        phone: "9876543210",
      });
    });

    const auditLogs = await t.run(async (ctx) => {
      return await ctx.db.query("audit_logs").collect();
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe("USERS_INSERT");
    expect(auditLogs[0].entity_type).toBe("users");
    expect(auditLogs[0].entity_id).toBe(userId);
    // Inserts record the initial field values (old_value: null) rather than omitting `changes`.
    expect(auditLogs[0].changes).toEqual(
      expect.arrayContaining([
        { field: "name", old_value: null, new_value: "Insert Guard" },
        { field: "phone", old_value: null, new_value: "9876543210" },
      ]),
    );
    expect(auditLogs[0].changes?.map((change) => change.field)).not.toContain("_id");
    expect(auditLogs[0].changes?.map((change) => change.field)).not.toContain("_creationTime");
  });

  it("creates a USERS_UPDATE audit log with field-level changes", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await runInsertUser(ctx, {
        workos_user_id: "workos_user_update_1",
        name: "Old Name",
        phone: "9876543211",
      });
    });

    await t.run(async (ctx) => {
      await runUpdateUserName(ctx, {
        user_id: userId,
        name: "New Name",
      });
    });

    const updateLog = await t.run(async (ctx) => {
      const logs = await ctx.db
        .query("audit_logs")
        .withIndex("by_entity", (q) => q.eq("entity_type", "users").eq("entity_id", userId))
        .collect();
      return logs.find((log) => log.action === "USERS_UPDATE");
    });

    if (!updateLog) {
      throw new Error("Expected USERS_UPDATE audit log");
    }

    expect(updateLog.action).toBe("USERS_UPDATE");
    expect(updateLog.changes).toEqual(
      expect.arrayContaining([
        {
          field: "name",
          old_value: "Old Name",
          new_value: "New Name",
        },
      ]),
    );
    expect(updateLog.changes?.map((change) => change.field)).not.toContain("_id");
    expect(updateLog.changes?.map((change) => change.field)).not.toContain("_creationTime");
  });

  it("never includes _id or _creationTime in update change entries", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await runInsertUser(ctx, {
        workos_user_id: "workos_user_update_2",
        name: "Before",
        phone: "9876543212",
      });
    });

    await t.run(async (ctx) => {
      await runUpdateUserName(ctx, {
        user_id: userId,
        name: "After",
      });
    });

    const updateLog = await t.run(async (ctx) => {
      const logs = await ctx.db
        .query("audit_logs")
        .withIndex("by_entity", (q) => q.eq("entity_type", "users").eq("entity_id", userId))
        .collect();
      return logs.find((log) => log.action === "USERS_UPDATE");
    });

    if (!updateLog?.changes) {
      throw new Error("Expected USERS_UPDATE audit log with changes");
    }

    expect(
      updateLog.changes.every(
        (change) => change.field !== "_id" && change.field !== "_creationTime",
      ),
    ).toBe(true);
  });

  it("creates a ROLES_INSERT audit log for role inserts", async () => {
    const t = convexTest(schema, modules);

    const roleId = await t.run(async (ctx) => {
      return await runInsertRole(ctx, {
        name: "Ops Agent",
      });
    });

    const roleInsertLog = await t.run(async (ctx) => {
      const logs = await ctx.db
        .query("audit_logs")
        .withIndex("by_entity", (q) => q.eq("entity_type", "roles").eq("entity_id", roleId))
        .collect();
      return logs.find((log) => log.action === "ROLES_INSERT");
    });

    expect(roleInsertLog).toBeDefined();
    expect(roleInsertLog?.action).toBe("ROLES_INSERT");
    expect(roleInsertLog?.entity_type).toBe("roles");
  });

  it("defaults actor metadata to SYSTEM without identity", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await runInsertUser(ctx, {
        workos_user_id: "workos_user_system_actor",
        name: "System Actor",
        phone: "9876543213",
      });
    });

    const [auditLog] = await t.run(async (ctx) => {
      return await ctx.db.query("audit_logs").collect();
    });

    expect(auditLog.actor_type).toBe("SYSTEM");
    expect(auditLog.actor_user_id).toBeUndefined();
  });
});
