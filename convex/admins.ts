import { v } from "convex/values";
import { PERMISSIONS } from "../lib/constants";
import type { Id } from "./_generated/dataModel";
import { requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

type RoleSummary = {
  _id: Id<"roles">;
  name: string;
  is_system_role: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ADMINS_CREATE);

    const name = args.name.trim();
    const email = normalizeEmail(args.email);

    if (!name) {
      throw new Error("Name is required");
    }

    if (!email) {
      throw new Error("Email is required");
    }

    if (email.endsWith("@guards.local")) {
      throw new Error("rental-platform-os.app emails are reserved for guards");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    return await ctx.db.insert("users", {
      workos_user_id: "",
      user_type: "ADMIN",
      name,
      email,
      status: "ACTIVE",
      must_change_password: false,
    });
  },
});

export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.ROLES_VIEW);

    const admins = await ctx.db
      .query("users")
      .withIndex("by_type_and_status", (q) => q.eq("user_type", "ADMIN"))
      .collect();

    const adminsWithRoles = await Promise.all(
      admins.map(async (admin) => {
        const assignments = await ctx.db
          .query("user_role_assignments")
          .withIndex("by_user_id", (q) => q.eq("user_id", admin._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .collect();

        const roles = await Promise.all(
          assignments.map((assignment) => ctx.db.get(assignment.role_id)),
        );

        const activeRoles: RoleSummary[] = [];

        for (const role of roles) {
          if (!role || role.is_deleted) {
            continue;
          }

          activeRoles.push({
            _id: role._id,
            name: role.name,
            is_system_role: role.is_system_role,
          });
        }

        return {
          ...admin,
          roles: activeRoles,
        };
      }),
    );

    return adminsWithRoles.sort((a, b) => a.name.localeCompare(b.name));
  },
});
