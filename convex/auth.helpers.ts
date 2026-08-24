import { ConvexError } from "convex/values";
import type { UserType } from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { FIELD_WORKER_USER_TYPES } from "./fieldWorkerContracts";
import { assertOpsFieldWorkerEnabledForUser } from "./fieldWorkerRollout";

type AuthContext = QueryCtx | MutationCtx;
type UserDoc = Doc<"users">;
type GuardProfileDoc = Doc<"guard_profiles">;
type FieldWorkerAuthResult = { user: UserDoc };
type FieldWorkerResult = { user: UserDoc; guardProfile: GuardProfileDoc };

const fieldWorkerUserTypes: readonly UserType[] = FIELD_WORKER_USER_TYPES;

function hasPersona(user: UserDoc, type: UserType): boolean {
  if (user.user_types) {
    return user.user_types.includes(type);
  }

  return user.user_type === type;
}

function isFieldWorkerUser(user: UserDoc): boolean {
  if (user.user_types) {
    return user.user_types.some((userType) => fieldWorkerUserTypes.includes(userType));
  }

  return fieldWorkerUserTypes.includes(user.user_type);
}

async function requireFieldWorkerBase(ctx: AuthContext): Promise<FieldWorkerAuthResult> {
  let user: UserDoc;

  try {
    user = await requireAuth(ctx);
  } catch (error) {
    if (error instanceof Error && error.message === "Account banned") {
      throw new Error("Not authorized as field worker");
    }

    throw error;
  }

  if (!isFieldWorkerUser(user) || user.status !== "ACTIVE") {
    throw new Error("Not authorized as field worker");
  }

  if (hasPersona(user, "OPS")) {
    await assertOpsFieldWorkerEnabledForUser(ctx, user._id);
  }

  return { user };
}

export async function getAuthenticatedUser(ctx: AuthContext): Promise<UserDoc | null> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  // identity.subject is the WorkOS user ID (e.g. "user_01KHKWN7...")
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", identity.subject))
    .unique();

  return user;
}

export async function requireAuth(ctx: AuthContext): Promise<UserDoc> {
  const user = await getAuthenticatedUser(ctx);

  if (!user) {
    throw new Error("Not authenticated");
  }

  if (user.status === "BANNED") {
    throw new Error("Account banned");
  }

  return user;
}

export async function requireGuard(ctx: AuthContext): Promise<UserDoc> {
  const user = await requireAuth(ctx);

  if (!hasPersona(user, "GUARD")) {
    throw new Error("Guard access required");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("Guard account not active");
  }

  return user;
}

export async function requireGuardAuth(ctx: AuthContext): Promise<UserDoc> {
  const user = await requireAuth(ctx);

  if (!hasPersona(user, "GUARD")) {
    throw new Error("Guard access required");
  }

  return user;
}

export async function requireFieldWorkerAuth(ctx: AuthContext): Promise<FieldWorkerAuthResult> {
  return await requireFieldWorkerBase(ctx);
}

export async function requireFieldWorker(ctx: AuthContext): Promise<FieldWorkerResult> {
  const { user } = await requireFieldWorkerBase(ctx);
  const guardProfile = await ctx.db
    .query("guard_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
    .unique();

  if (!guardProfile) {
    throw new Error("Not authorized as field worker");
  }

  return { user, guardProfile };
}

export async function requireAdmin(ctx: AuthContext): Promise<UserDoc> {
  const user = await requireAuth(ctx);

  if (!hasPersona(user, "ADMIN")) {
    throw new Error("Admin access required");
  }

  return user;
}

export async function requireBackoffice(ctx: AuthContext): Promise<UserDoc> {
  const user = await requireAuth(ctx);

  if (!hasPersona(user, "ADMIN") && !hasPersona(user, "OPS")) {
    throw new Error("Admin or OPS access required");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("Account not active");
  }

  return user;
}

export async function requireTenant(ctx: AuthContext): Promise<UserDoc> {
  const user = await requireAuth(ctx);

  if (!hasPersona(user, "TENANT")) {
    throw new Error("Tenant access required");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("Tenant account not active");
  }

  return user;
}

export async function requireOwner(ctx: AuthContext): Promise<UserDoc> {
  const user = await requireAuth(ctx);

  if (!hasPersona(user, "OWNER")) {
    throw new Error("Owner access required");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("Owner account not active");
  }

  return user;
}

export async function requirePermission(ctx: AuthContext, permission: string): Promise<UserDoc> {
  const user = await requireAuth(ctx);

  if (!hasPersona(user, "ADMIN") && !hasPersona(user, "OPS")) {
    throw new Error("Admin or OPS access required");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("Account not active");
  }

  const assignments = await ctx.db
    .query("user_role_assignments")
    .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  const roles = await Promise.all(assignments.map((assignment) => ctx.db.get(assignment.role_id)));
  const permissions = new Set<string>();

  for (const role of roles) {
    if (!role || role.is_deleted) {
      continue;
    }

    for (const rolePermission of role.permissions) {
      permissions.add(rolePermission);
    }
  }

  if (!permissions.has(permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }

  return user;
}

export async function requireAnyPermission(
  ctx: AuthContext,
  requiredPermissions: string[],
): Promise<UserDoc> {
  const user = await requireAuth(ctx);

  if (!hasPersona(user, "ADMIN") && !hasPersona(user, "OPS")) {
    throw new Error("Admin or OPS access required");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("Account not active");
  }

  const assignments = await ctx.db
    .query("user_role_assignments")
    .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  const roles = await Promise.all(assignments.map((assignment) => ctx.db.get(assignment.role_id)));
  const permissions = new Set<string>();

  for (const role of roles) {
    if (!role || role.is_deleted) {
      continue;
    }

    for (const rolePermission of role.permissions) {
      permissions.add(rolePermission);
    }
  }

  const hasAny = requiredPermissions.some((p) => permissions.has(p));

  if (!hasAny) {
    throw new Error(`Missing one of permissions: ${requiredPermissions.join(", ")}`);
  }

  return user;
}

export async function addPersonaToUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  persona: UserType,
): Promise<void> {
  const user = await ctx.db.get(userId);

  if (!user) {
    throw new ConvexError("User not found");
  }

  const existingPersonas = user.user_types ?? [user.user_type];

  if (existingPersonas.includes(persona)) {
    return;
  }

  const hasAdmin = existingPersonas.includes("ADMIN");
  const hasGuard = existingPersonas.includes("GUARD");
  const hasOps = existingPersonas.includes("OPS");

  if (
    (persona === "ADMIN" && (hasGuard || hasOps)) ||
    ((persona === "GUARD" || persona === "OPS") && hasAdmin) ||
    (persona === "GUARD" && hasOps) ||
    (persona === "OPS" && hasGuard)
  ) {
    throw new ConvexError(`Cannot add persona ${persona} because of mutually exclusive personas`);
  }

  if (user.user_types == null) {
    await ctx.db.patch(user._id, {
      user_types: [user.user_type, persona],
      active_persona: user.user_type,
    });
    return;
  }

  await ctx.db.patch(user._id, {
    user_types: [...user.user_types, persona],
  });
}
