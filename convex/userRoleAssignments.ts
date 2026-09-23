import { v } from "convex/values";
import { PERMISSIONS } from "../lib/constants";
import type { Doc } from "./_generated/dataModel";
import { requireAnyPermission, requireBackoffice, requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const ROLE_READ_PERMISSIONS = [PERMISSIONS.ROLES_VIEW, PERMISSIONS.ROLES_MANAGE];

// Read shape for assignments: omits which admin granted the role.
function toAssignmentView(assignment: Doc<"user_role_assignments">) {
  return {
    _id: assignment._id,
    _creationTime: assignment._creationTime,
    user_id: assignment.user_id,
    role_id: assignment.role_id,
    is_deleted: assignment.is_deleted,
  };
}

export const assign = mutation({
  args: {
    user_id: v.id("users"),
    role_id: v.id("roles"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.ROLES_MANAGE);

    const targetUser = await ctx.db.get(args.user_id);

    if (!targetUser) {
      throw new Error("User not found");
    }

    if (!(targetUser.user_types?.includes("ADMIN") ?? targetUser.user_type === "ADMIN")) {
      throw new Error("Cannot assign roles to guards");
    }

    const role = await ctx.db.get(args.role_id);

    if (!role || role.is_deleted) {
      throw new Error("Role not found");
    }

    const existingAssignment = await ctx.db
      .query("user_role_assignments")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.user_id))
      .filter((q) =>
        q.and(q.eq(q.field("role_id"), args.role_id), q.neq(q.field("is_deleted"), true)),
      )
      .first();

    if (existingAssignment) {
      throw new Error("Role already assigned");
    }

    return await ctx.db.insert("user_role_assignments", {
      user_id: args.user_id,
      role_id: args.role_id,
      assigned_by_admin_id: admin._id,
      is_deleted: false,
    });
  },
});

export const revoke = mutation({
  args: {
    assignment_id: v.id("user_role_assignments"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ROLES_MANAGE);

    const assignment = await ctx.db.get(args.assignment_id);

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    if (assignment.is_deleted) {
      return { revoked: false };
    }

    const role = await ctx.db.get(assignment.role_id);

    if (role && role.name === "Super Admin") {
      const activeSuperAdminAssignments = await ctx.db
        .query("user_role_assignments")
        .withIndex("by_role_id", (q) => q.eq("role_id", role._id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect();

      if (activeSuperAdminAssignments.length <= 1) {
        throw new Error("Cannot revoke the last Super Admin assignment");
      }
    }

    await ctx.db.patch(assignment._id, {
      is_deleted: true,
    });

    return { revoked: true };
  },
});

export const getByUserId = query({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await requireBackoffice(ctx);

    if (args.user_id !== user._id) {
      if (user.user_types?.includes("OPS") ?? user.user_type === "OPS") {
        throw new Error("OPS users can only view their own role assignments");
      }

      await requireAnyPermission(ctx, ROLE_READ_PERMISSIONS);
    }

    const assignments = await ctx.db
      .query("user_role_assignments")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.user_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const withRoles = await Promise.all(
      assignments.map(async (assignment) => {
        const role = await ctx.db.get(assignment.role_id);

        if (!role || role.is_deleted) {
          return null;
        }

        return {
          ...toAssignmentView(assignment),
          role,
        };
      }),
    );

    return withRoles.filter((assignment) => assignment !== null);
  },
});

export const listByRole = query({
  args: {
    role_id: v.id("roles"),
  },
  handler: async (ctx, args) => {
    await requireAnyPermission(ctx, ROLE_READ_PERMISSIONS);

    const assignments = await ctx.db
      .query("user_role_assignments")
      .withIndex("by_role_id", (q) => q.eq("role_id", args.role_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const withUsers = await Promise.all(
      assignments.map(async (assignment) => {
        const user = await ctx.db.get(assignment.user_id);

        if (!user) {
          return null;
        }

        return {
          ...toAssignmentView(assignment),
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            user_type: user.user_type,
            status: user.status,
          },
        };
      }),
    );

    return withUsers.filter((assignment) => assignment !== null);
  },
});
