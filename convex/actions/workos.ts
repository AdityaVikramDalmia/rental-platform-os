"use node";

import { WorkOS } from "@workos-inc/node";
import { v } from "convex/values";
import { OPS_EMAIL_DOMAIN, PERMISSIONS } from "../../lib/constants";
import { isLocalConvexAuthEnabled } from "../../lib/localAuthConfig";
import { normalizePhone } from "../../lib/validators";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";

const localAuthEnabled = isLocalConvexAuthEnabled();
const workos = new WorkOS(
  localAuthEnabled ? "local-auth-api-key-not-used" : process.env.WORKOS_API_KEY!,
  localAuthEnabled
    ? {
        apiHostname: "127.0.0.1",
        https: false,
        port: 3000,
      }
    : undefined,
);

const activeInactiveStatusValidator = v.union(v.literal("ACTIVE"), v.literal("INACTIVE"));

export const createGuardAccount = action({
  args: {
    name: v.string(),
    phone: v.string(),
    society_id: v.id("societies"),
    guard_type: v.string(),
    temp_password: v.string(),
    referrer_phone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ user_id: Id<"users">; workos_user_id: string }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const permissionResult = await ctx.runQuery(internal.guards.checkPermission, {
      permission: PERMISSIONS.GUARDS_CREATE,
    });

    if (!permissionResult.authorized) {
      throw new Error(`Missing permission: ${PERMISSIONS.GUARDS_CREATE}`);
    }

    const phone = normalizePhone(args.phone);

    // Pre-check: fail fast with friendly message if phone already taken
    const phoneCheck = await ctx.runQuery(internal.guards.checkPhoneExists, {
      phone,
    });

    if (phoneCheck.exists) {
      throw new Error("A guard with this phone number already exists");
    }

    const syntheticEmail = `${phone}@guards.local`;
    let workosUser: Awaited<ReturnType<typeof workos.userManagement.createUser>>;
    try {
      workosUser = await workos.userManagement.createUser({
        email: syntheticEmail,
        password: args.temp_password,
        firstName: args.name,
        emailVerified: true,
      });
    } catch (error: unknown) {
      // WorkOS returns a 409/duplicate error when the email already exists
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("already exists") ||
        message.includes("duplicate") ||
        message.includes("conflict")
      ) {
        throw new Error("A guard with this phone number already exists");
      }
      throw new Error(`Failed to create guard account: ${message}`);
    }

    let user_id: Id<"users">;

    try {
      user_id = await ctx.runMutation(internal.guards.createInternal, {
        workos_user_id: workosUser.id,
        name: args.name,
        phone,
        society_id: args.society_id,
        guard_type: args.guard_type,
      });
    } catch (error) {
      try {
        await workos.userManagement.deleteUser(workosUser.id);
      } catch (rollbackError) {
        console.error("Failed to rollback WorkOS user:", workosUser.id, rollbackError);
      }

      throw error;
    }

    if (args.referrer_phone) {
      try {
        await ctx.runMutation(internal.referrals.recordGuardReferralInternal, {
          referred_guard_user_id: user_id,
          referrer_phone: args.referrer_phone,
        });
      } catch {
        // Don't fail guard creation if referral recording fails
        console.warn("Failed to record guard referral, continuing guard creation");
      }
    }

    return {
      user_id,
      workos_user_id: workosUser.id,
    };
  },
});

export const createOpsAccount = action({
  args: {
    name: v.string(),
    phone: v.string(),
    temp_password: v.string(),
    google_email: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ user_id: Id<"users">; workos_user_id: string }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const permissionResult = await ctx.runQuery(internal.guards.checkPermission, {
      permission: PERMISSIONS.GUARDS_CREATE,
    });

    if (!permissionResult.authorized) {
      throw new Error(`Missing permission: ${PERMISSIONS.GUARDS_CREATE}`);
    }

    const phone = normalizePhone(args.phone);
    const phoneCheck = await ctx.runQuery(internal.guards.checkOpsPhoneExists, {
      phone,
    });

    if (phoneCheck.exists) {
      throw new Error("An OPS user with this phone number already exists");
    }

    const normalizedGoogleEmail = args.google_email?.trim().toLowerCase();
    const useGoogleEmail = !!normalizedGoogleEmail;
    const workosEmail = useGoogleEmail ? normalizedGoogleEmail : `${phone}${OPS_EMAIL_DOMAIN}`;

    let workosUser: Awaited<ReturnType<typeof workos.userManagement.createUser>>;
    try {
      workosUser = await workos.userManagement.createUser({
        email: workosEmail,
        password: args.temp_password,
        firstName: args.name,
        emailVerified: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("already exists") ||
        message.includes("duplicate") ||
        message.includes("conflict")
      ) {
        throw new Error(
          useGoogleEmail
            ? "A user with this Google email already exists in the system"
            : "An OPS user with this phone number already exists",
        );
      }

      throw new Error(`Failed to create OPS account: ${message}`);
    }

    let user_id: Id<"users">;

    try {
      user_id = await ctx.runMutation(internal.guards.createOpsInternal, {
        workos_user_id: workosUser.id,
        name: args.name,
        phone,
        assigned_by_workos_user_id: identity.subject,
        email: useGoogleEmail ? workosEmail : undefined,
      });
    } catch (error) {
      try {
        await workos.userManagement.deleteUser(workosUser.id);
      } catch (rollbackError) {
        console.error("Failed to rollback WorkOS user:", workosUser.id, rollbackError);
      }

      throw error;
    }

    return {
      user_id,
      workos_user_id: workosUser.id,
    };
  },
});

export const resetGuardPassword = action({
  args: {
    workos_user_id: v.string(),
    user_id: v.id("users"),
    new_temp_password: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const permissionResult = await ctx.runQuery(internal.guards.checkPermission, {
      permission: PERMISSIONS.GUARDS_RESET_PASSWORD,
    });

    if (!permissionResult.authorized) {
      throw new Error(`Missing permission: ${PERMISSIONS.GUARDS_RESET_PASSWORD}`);
    }

    await workos.userManagement.updateUser({
      userId: args.workos_user_id,
      password: args.new_temp_password,
    });

    await ctx.runMutation(internal.guards.setMustChangePassword, {
      user_id: args.user_id,
    });

    return { success: true };
  },
});

export const suspendGuard = internalAction({
  args: {
    workos_user_id: v.string(),
    user_id: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    await workos.post(`/user_management/users/${args.workos_user_id}/suspend`, {});

    await ctx.runMutation(internal.guards.banGuardInternal, {
      user_id: args.user_id,
      reason: args.reason,
    });

    return { success: true };
  },
});

export const unsuspendGuard = internalAction({
  args: {
    workos_user_id: v.string(),
    user_id: v.id("users"),
    new_status: activeInactiveStatusValidator,
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    await workos.post(`/user_management/users/${args.workos_user_id}/unsuspend`, {});

    await ctx.runMutation(internal.guards.updateStatusInternal, {
      user_id: args.user_id,
      status: args.new_status,
    });

    return { success: true };
  },
});

// DEV ONLY — `npx convex run actions/workos:ensureDevWorkosUsers`
export const ensureDevWorkosUsers = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, string>> => {
    const devAccounts = [
      {
        email: "admin@example.com",
        password: "DevAdmin123!",
        firstName: "Test Admin",
        userType: "ADMIN",
        identifier: "admin@example.com",
        identifierType: "email" as const,
      },
      {
        email: "agent@example.com",
        password: "DevAgent123!",
        firstName: "Agent Bot",
        userType: "ADMIN",
        identifier: "agent@example.com",
        identifierType: "email" as const,
      },
      {
        email: "9999999999@guards.local",
        password: "DevGuard123!",
        firstName: "Test Guard",
        userType: "GUARD",
        identifier: "9999999999",
        identifierType: "phone" as const,
      },
      {
        email: `8888888888${OPS_EMAIL_DOMAIN}`,
        password: "DevOps123!",
        firstName: "Test OPS Agent",
        userType: "OPS",
        identifier: "8888888888",
        identifierType: "phone" as const,
      },
      {
        email: "9876543210@guards.local",
        password: "DevGuard123!",
        firstName: "Rajesh Kumar",
        userType: "GUARD",
        identifier: "9876543210",
        identifierType: "phone" as const,
      },
      {
        email: "9765432109@guards.local",
        password: "DevGuard123!",
        firstName: "Suresh Patel",
        userType: "GUARD",
        identifier: "9765432109",
        identifierType: "phone" as const,
      },
      {
        email: `7777777777${OPS_EMAIL_DOMAIN}`,
        password: "DevOps123!",
        firstName: "Priya Sharma",
        userType: "OPS",
        identifier: "7777777777",
        identifierType: "phone" as const,
      },
      {
        email: "tenant1@test.demorentals.com",
        password: "DevTenant123!",
        firstName: "Ankit Mehta",
        userType: "TENANT",
        identifier: "tenant1@test.demorentals.com",
        identifierType: "email" as const,
      },
      {
        email: "tenant2@test.demorentals.com",
        password: "DevTenant123!",
        firstName: "Sneha Reddy",
        userType: "TENANT",
        identifier: "tenant2@test.demorentals.com",
        identifierType: "email" as const,
      },
      {
        email: "owner1@test.demorentals.com",
        password: "DevOwner123!",
        firstName: "Ramesh Gupta",
        userType: "OWNER",
        identifier: "owner1@test.demorentals.com",
        identifierType: "email" as const,
      },
      {
        email: "owner2@test.demorentals.com",
        password: "DevOwner123!",
        firstName: "Kavita Joshi",
        userType: "OWNER",
        identifier: "owner2@test.demorentals.com",
        identifierType: "email" as const,
      },
    ];

    const syncPayload: Array<{
      identifier: string;
      identifier_type: "email" | "phone";
      user_type: string;
      workos_user_id: string;
    }> = [];
    const emailToWorkosId: Record<string, string> = {};

    for (const account of devAccounts) {
      let workosUserId: string;

      const existing = await workos.userManagement.listUsers({ email: account.email });

      if (existing.data.length > 0) {
        workosUserId = existing.data[0].id;

        try {
          await workos.userManagement.updateUser({
            userId: workosUserId,
            password: account.password,
          });
        } catch {
          console.warn(`Could not sync password for ${account.email} — manual reset may be needed`);
        }

        console.log(`Found existing WorkOS user: ${account.email} → ${workosUserId}`);
      } else {
        const user = await workos.userManagement.createUser({
          email: account.email,
          password: account.password,
          firstName: account.firstName,
          emailVerified: true,
        });
        workosUserId = user.id;
        console.log(`Created WorkOS user: ${account.email} → ${workosUserId}`);
      }

      syncPayload.push({
        identifier: account.identifier,
        identifier_type: account.identifierType,
        user_type: account.userType,
        workos_user_id: workosUserId,
      });
      emailToWorkosId[account.email] = workosUserId;
    }

    await ctx.runMutation(internal.seed.init);
    await ctx.runMutation(internal.seed.syncWorkosIds, { users: syncPayload });

    console.log("Dev environment fully seeded — all WorkOS users ensured");
    return emailToWorkosId;
  },
});

export const createOwnerAccount = action({
  args: {
    owner_request_id: v.id("owner_service_requests"),
    owner_email: v.string(),
    name: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ user_id: Id<"users">; workos_user_id: string; isNewOwner: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const permissionResult = await ctx.runQuery(internal.ownerServiceRequests.checkPermission, {
      permission: PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE,
    });

    if (!permissionResult.authorized) {
      throw new Error(`Missing permission: ${PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE}`);
    }

    const email = args.owner_email.trim().toLowerCase();
    if (!email.includes("@")) {
      throw new Error("Invalid email address");
    }

    const name = args.name.trim();
    if (name.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }

    const currentRequest = await ctx.runQuery(internal.ownerServiceRequests.getRequestState, {
      id: args.owner_request_id,
    });

    if (!currentRequest || currentRequest.status !== "CONTACTED") {
      throw new Error(
        "Request must be in CONTACTED state to onboard. Current: " +
          (currentRequest?.status ?? "not found"),
      );
    }

    let workosUserId: string;
    let isNewOwner = true;

    try {
      const workosUser = await workos.userManagement.createUser({
        email,
        firstName: name,
        emailVerified: true,
      });
      workosUserId = workosUser.id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes("already exists") ||
        normalizedMessage.includes("duplicate") ||
        normalizedMessage.includes("conflict")
      ) {
        const users = await workos.userManagement.listUsers({ email });
        if (users.data.length === 0) {
          throw new Error("Owner account already exists but could not be retrieved");
        }
        workosUserId = users.data[0].id;
        isNewOwner = false;
      } else {
        throw new Error(`Failed to create owner account: ${message}`);
      }
    }

    let user_id: Id<"users">;

    try {
      user_id = await ctx.runMutation(internal.ownerServiceRequests.createOwnerUserInternal, {
        workos_user_id: workosUserId,
        name,
        email,
        request_id: args.owner_request_id,
      });

      await ctx.runMutation(internal.ownerServiceRequests.onboardInternal, {
        request_id: args.owner_request_id,
        owner_user_id: user_id,
      });
    } catch (error) {
      if (isNewOwner) {
        try {
          await workos.userManagement.deleteUser(workosUserId);
        } catch (rollbackError) {
          console.error("Failed to rollback WorkOS user:", workosUserId, rollbackError);
        }
      }

      throw error;
    }

    return {
      user_id,
      workos_user_id: workosUserId,
      isNewOwner,
    };
  },
});
