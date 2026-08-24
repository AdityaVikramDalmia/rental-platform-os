import { ConvexError, v } from "convex/values";
import { PERMISSIONS, SYSTEM_CONFIG_KEYS, USER_TYPE, type UserType } from "../lib/constants";
import {
  addPersonaToUser,
  getAuthenticatedUser,
  requireAuth,
  requireBackoffice,
  requireGuard,
  requirePermission,
} from "./auth.helpers";
import { mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";
import { getSystemConfigBoolean } from "./systemConfig.helpers";

function isUserType(value: string): value is UserType {
  return Object.values(USER_TYPE).includes(value as UserType);
}

const PERSONA_PORTAL_PATHNAME: Record<UserType, string> = {
  [USER_TYPE.GUARD]: "/guard/dashboard",
  [USER_TYPE.ADMIN]: "/admin/dashboard",
  [USER_TYPE.OPS]: "/ops/dashboard",
  [USER_TYPE.TENANT]: "/tenant/dashboard",
  [USER_TYPE.OWNER]: "/owner/dashboard",
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    if (!user) {
      return null;
    }

    if (user.user_type === "GUARD") {
      const guardProfile = await ctx.db
        .query("guard_profiles")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
        .unique();

      return {
        ...user,
        guard_profile: guardProfile ?? null,
      };
    }

    // Enrich admin users with role names for dashboard display
    const assignments = await ctx.db
      .query("user_role_assignments")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const roleNames: string[] = [];

    for (const assignment of assignments) {
      const role = await ctx.db.get(assignment.role_id);

      if (role && !role.is_deleted) {
        roleNames.push(role.name);
      }
    }

    return {
      ...user,
      role_names: roleNames,
    };
  },
});

export const isMultiPersonaEnabled = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await getSystemConfigBoolean(ctx, SYSTEM_CONFIG_KEYS.MULTI_PERSONA_ENABLED, false);
  },
});

export const resolvePostAuthDestination = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);

    if (!user || user.status !== "ACTIVE") {
      return {
        pathname: "/admin/login",
        resolved_user_type: "UNKNOWN",
        reason: "User not found or inactive",
      };
    }

    const multiPersonaEnabled = await getSystemConfigBoolean(
      ctx,
      SYSTEM_CONFIG_KEYS.MULTI_PERSONA_ENABLED,
      false,
    );

    // When flag is OFF, route purely by user_type (pre-P45 behavior)
    const resolvedPersonaValue = multiPersonaEnabled
      ? (user.active_persona ?? user.user_type)
      : user.user_type;

    if (!isUserType(resolvedPersonaValue)) {
      return {
        pathname: "/admin/login",
        resolved_user_type: "UNKNOWN",
        reason: "User has invalid active persona",
      };
    }

    const resolvedPersona: UserType = resolvedPersonaValue;

    if (multiPersonaEnabled && user.user_types && user.user_types.length >= 2) {
      return {
        pathname: "/post-auth/select-persona",
        resolved_user_type: resolvedPersona,
        reason: "Multi-persona user - showing picker",
      };
    }

    if (resolvedPersona === USER_TYPE.ADMIN && user.user_types == null) {
      const ownerByUserId = await ctx.db
        .query("owners")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .first();

      if (ownerByUserId) {
        return {
          pathname: "/owner/dashboard",
          resolved_user_type: "OWNER",
          reason: "Admin linked to owner profile via user_id",
        };
      }

      const normalizedEmail = user.email?.trim().toLowerCase();

      if (normalizedEmail) {
        const ownerByEmail = await ctx.db
          .query("owners")
          .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .first();

        if (ownerByEmail) {
          return {
            pathname: "/owner/dashboard",
            resolved_user_type: "OWNER",
            reason: "Admin linked to owner profile via email",
          };
        }
      }

      const tenantProfile = await ctx.db
        .query("tenant_profiles")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
        .first();

      if (tenantProfile) {
        return {
          pathname: "/tenant/dashboard",
          resolved_user_type: "TENANT",
          reason: "Admin linked to tenant profile via user_id",
        };
      }

      return {
        pathname: PERSONA_PORTAL_PATHNAME[USER_TYPE.ADMIN],
        resolved_user_type: USER_TYPE.ADMIN,
        reason: "Resolved by active persona fallback",
      };
    }

    return {
      pathname: PERSONA_PORTAL_PATHNAME[resolvedPersona],
      resolved_user_type: resolvedPersona,
      reason: "Resolved by active persona",
    };
  },
});

export const clearMustChangePassword = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    if (user.user_type !== "GUARD" && user.user_type !== "OPS") {
      throw new Error("Guard or OPS access required");
    }

    if (!user.must_change_password) {
      return { updated: false };
    }

    await ctx.db.patch(user._id, {
      must_change_password: false,
    });

    return { updated: true };
  },
});

export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.ADMINS_CREATE);

    // NOTE: Using by_type_and_status on user_type (not active_persona) because:
    // 1. Admins who switch persona should still appear in admin list
    // 2. Unmigrated users have null active_persona
    // TODO: P45 cleanup - migrate to user_types array scan when array indexing is available
    const admins = await ctx.db
      .query("users")
      .withIndex("by_type_and_status", (q) => q.eq("user_type", "ADMIN"))
      .collect();

    return admins.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getById = query({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await requireBackoffice(ctx);

    if (user.user_type === "OPS" && args.id !== user._id) {
      throw new Error("OPS users can only view their own user record");
    }

    return await ctx.db.get(args.id);
  },
});

export const updateProfile = mutation({
  args: {
    id: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const guard = await requireGuard(ctx);
    const targetUser = await ctx.db.get(args.id);

    if (!targetUser || targetUser._id !== guard._id) {
      throw new Error("Guards can only update their own profile");
    }

    const nextName = args.name.trim();

    if (!nextName) {
      throw new Error("Name is required");
    }

    await ctx.db.patch(guard._id, {
      name: nextName,
    });

    return await ctx.db.get(guard._id);
  },
});

export const setActivePersona = mutation({
  args: {
    persona: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    await rateLimiter.limit(ctx, "persona:switch", {
      key: user._id,
      throws: true,
    });

    if (!isUserType(args.persona)) {
      throw new ConvexError("Persona not available");
    }

    if (user.user_types == null) {
      if (args.persona !== user.user_type) {
        throw new ConvexError("Persona not available");
      }
    } else if (!user.user_types.includes(args.persona)) {
      throw new ConvexError("Persona not available");
    }

    await ctx.db.patch(user._id, {
      active_persona: args.persona,
    });

    return { success: true };
  },
});

export const addPersona = mutation({
  args: {
    userId: v.id("users"),
    persona: v.string(),
  },
  handler: async (ctx, args) => {
    const actingUser = await requirePermission(ctx, PERMISSIONS.USERS_MANAGE);

    await rateLimiter.limit(ctx, "persona:modify", {
      key: actingUser._id,
      throws: true,
    });

    if (!isUserType(args.persona)) {
      throw new ConvexError("Persona not available");
    }

    await addPersonaToUser(ctx, args.userId, args.persona);

    return { success: true };
  },
});

export const removePersona = mutation({
  args: {
    userId: v.id("users"),
    persona: v.string(),
    newActivePersona: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actingUser = await requirePermission(ctx, PERMISSIONS.USERS_MANAGE);

    await rateLimiter.limit(ctx, "persona:modify", {
      key: actingUser._id,
      throws: true,
    });

    if (!isUserType(args.persona)) {
      throw new ConvexError("Persona not available");
    }

    const personaToRemove: UserType = args.persona;

    let newActivePersona: UserType | undefined;

    if (args.newActivePersona !== undefined) {
      if (!isUserType(args.newActivePersona)) {
        throw new ConvexError("Persona not available");
      }

      newActivePersona = args.newActivePersona;
    }

    const reason = args.reason.trim();

    if (!reason) {
      throw new ConvexError("Reason is required");
    }

    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new ConvexError("User not found");
    }

    const personas = user.user_types ?? [user.user_type];

    if (!personas.includes(personaToRemove)) {
      throw new ConvexError("Persona not available");
    }

    if (personas.length === 1) {
      throw new ConvexError("Cannot remove last persona");
    }

    const activePersonaValue = user.active_persona ?? user.user_type;

    if (!isUserType(activePersonaValue)) {
      throw new ConvexError("User has invalid active persona");
    }

    const activePersona: UserType = activePersonaValue;

    if (personaToRemove === activePersona && !newActivePersona) {
      throw new ConvexError("newActivePersona is required when removing active persona");
    }

    const nextPersonas = personas.filter((persona) => persona !== personaToRemove);

    if (newActivePersona && !nextPersonas.includes(newActivePersona)) {
      throw new ConvexError("newActivePersona must remain available after removal");
    }

    await ctx.db.patch(user._id, {
      user_types: nextPersonas,
      active_persona: newActivePersona ?? activePersona,
    });

    return { success: true };
  },
});
