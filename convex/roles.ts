import { v } from "convex/values";
import { ALL_PERMISSIONS, PERMISSIONS } from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const VALID_PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

function normalizeRoleName(name: string): string {
  return name.trim();
}

function validatePermissions(permissions: string[]): string[] {
  const normalizedPermissions = [...new Set(permissions)];
  const invalidPermissions = normalizedPermissions.filter(
    (permission) => !VALID_PERMISSION_SET.has(permission),
  );

  if (invalidPermissions.length > 0) {
    throw new Error(`Invalid permissions: ${invalidPermissions.join(", ")}`);
  }

  return normalizedPermissions;
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.ROLES_MANAGE);

    await rateLimiter.limit(ctx, "role:modify", {
      key: user._id,
      throws: true,
    });

    const name = normalizeRoleName(args.name);

    if (!name) {
      throw new Error("Role name is required");
    }

    const existingRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", name))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    if (existingRole) {
      throw new Error("Role name already exists");
    }

    const permissions = validatePermissions(args.permissions);

    return await ctx.db.insert("roles", {
      name,
      description: args.description?.trim() || undefined,
      permissions,
      // System roles are created only by the seed; they cannot be deleted or renamed.
      is_system_role: false,
      is_deleted: false,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("roles"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.ROLES_MANAGE);

    await rateLimiter.limit(ctx, "role:modify", {
      key: user._id,
      throws: true,
    });

    const role = await ctx.db.get(args.id);

    if (!role || role.is_deleted) {
      throw new Error("Role not found");
    }

    const patch: {
      name?: string;
      description?: string;
      permissions?: string[];
    } = {};

    if (args.name !== undefined) {
      const nextName = normalizeRoleName(args.name);

      if (!nextName) {
        throw new Error("Role name is required");
      }

      if (role.is_system_role && nextName !== role.name) {
        throw new Error("Cannot rename a system role");
      }

      if (nextName !== role.name) {
        const conflictingRole = await ctx.db
          .query("roles")
          .withIndex("by_name", (q) => q.eq("name", nextName))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .first();

        if (conflictingRole && conflictingRole._id !== role._id) {
          throw new Error("Role name already exists");
        }
      }

      patch.name = nextName;
    }

    if (args.description !== undefined) {
      patch.description = args.description?.trim() || undefined;
    }

    if (args.permissions !== undefined) {
      patch.permissions = validatePermissions(args.permissions);
    }

    await ctx.db.patch(role._id, patch);

    return await ctx.db.get(role._id);
  },
});

export const softDelete = mutation({
  args: {
    id: v.id("roles"),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.ROLES_MANAGE);

    await rateLimiter.limit(ctx, "role:modify", {
      key: user._id,
      throws: true,
    });

    const role = await ctx.db.get(args.id);

    if (!role || role.is_deleted) {
      throw new Error("Role not found");
    }

    if (role.is_system_role) {
      throw new Error("Cannot delete a system role");
    }

    await ctx.db.patch(role._id, {
      is_deleted: true,
    });

    return { deleted: true };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.ROLES_VIEW);

    const roles = await ctx.db
      .query("roles")
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return roles.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getById = query({
  args: {
    id: v.id("roles"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ROLES_VIEW);

    const role = await ctx.db.get(args.id);

    if (!role || role.is_deleted) {
      return null;
    }

    return role;
  },
});
