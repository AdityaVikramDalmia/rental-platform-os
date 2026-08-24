import { AuthKit, type AuthFunctions } from "@convex-dev/workos-authkit";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { LOCAL_AUTH_CLIENT_ID, isLocalConvexAuthEnabled } from "../lib/localAuthConfig";

const authFunctions: AuthFunctions = (
  internal as typeof internal & {
    auth: AuthFunctions;
  }
).auth;

const authKitOptions = isLocalConvexAuthEnabled()
  ? {
      authFunctions,
      clientId: LOCAL_AUTH_CLIENT_ID,
      apiKey: "local-auth-api-key-not-used",
      webhookSecret: "local-auth-webhook-secret-not-used",
    }
  : { authFunctions };

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, authKitOptions);

type UserLifecycleEvent = {
  data: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
};

function getDisplayName(event: UserLifecycleEvent): string {
  return `${event.data.firstName ?? ""} ${event.data.lastName ?? ""}`.trim() || "Unknown";
}

export async function handleUserCreated(
  ctx: MutationCtx,
  event: UserLifecycleEvent,
): Promise<void> {
  const email = event.data.email.trim().toLowerCase();
  const name = getDisplayName(event);

  const existingByWorkos = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", event.data.id))
    .first();

  if (existingByWorkos) {
    await ctx.db.patch(existingByWorkos._id, { name });
    return;
  }

  const existingByEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  if (existingByEmail) {
    if (!existingByEmail.workos_user_id || existingByEmail.workos_user_id === "pending") {
      await ctx.db.patch(existingByEmail._id, {
        workos_user_id: event.data.id,
        name,
      });
    } else {
      await ctx.db.patch(existingByEmail._id, { name });
    }

    return;
  }

  const isOps = email.endsWith("@ops.local");
  const isGuard = !isOps && email.endsWith("@guards.local");
  const userType = isGuard ? "GUARD" : isOps ? "OPS" : "TENANT";

  await ctx.db.insert("users", {
    workos_user_id: event.data.id,
    user_type: userType,
    user_types: [userType],
    active_persona: userType,
    name,
    phone: isGuard || isOps ? email.replace(isOps ? "@ops.local" : "@guards.local", "") : undefined,
    email: !isGuard && !isOps ? email : undefined,
    status: "ACTIVE",
    must_change_password: isGuard || isOps,
  });
}

export async function handleUserUpdated(
  ctx: MutationCtx,
  event: UserLifecycleEvent,
): Promise<void> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", event.data.id))
    .unique();

  if (!user) {
    return;
  }

  const name = getDisplayName(event);
  const patch: { name?: string; email?: string } = {
    ...(name ? { name } : {}),
  };

  const shouldSyncEmail = user.user_type === "ADMIN" || (user.user_type === "OPS" && !!user.email);

  if (shouldSyncEmail) {
    const newEmail = event.data.email.trim().toLowerCase();

    if (newEmail !== user.email) {
      const emailConflict = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", newEmail))
        .first();

      if (emailConflict && emailConflict._id !== user._id) {
        console.warn(
          "Email collision during sync:",
          newEmail,
          "already owned by",
          emailConflict._id,
        );
      } else {
        patch.email = newEmail;
      }
    }
  }

  await ctx.db.patch(user._id, patch);
}

export const { authKitEvent } = authKit.events({
  "user.created": async (ctx, event) => await handleUserCreated(ctx, event),
  "user.updated": async (ctx, event) => await handleUserUpdated(ctx, event),
});
