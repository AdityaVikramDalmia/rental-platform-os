"use server";

import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { isLocalAuthEnabled } from "../../../../lib/localAuthConfig";
import { resolveDevAccount } from "./accounts";
import { authenticateLocalDemoAccount } from "@/lib/local-auth";

type DevLoginResult = {
  error?: string;
  redirectTo?:
    | "/guard/dashboard"
    | "/ops/dashboard"
    | "/admin/dashboard"
    | "/listings"
    | "/owner-services";
};

// DEV ONLY — must never be exposed in production
export async function devLogin(email: string, password: string): Promise<DevLoginResult> {
  if (isLocalAuthEnabled()) {
    try {
      const localSession = authenticateLocalDemoAccount(email, password);
      await saveSession(localSession, "http://127.0.0.1:3000/callback");

      return { redirectTo: getRedirectForEmail(email) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      return { error: message };
    }
  }

  if (
    process.env.NODE_ENV !== "development" &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true"
  ) {
    return { error: "Dev login is only available in development mode" };
  }

  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) {
    return { error: "WORKOS_CLIENT_ID not set" };
  }

  try {
    const authResponse = await getWorkOS().userManagement.authenticateWithPassword({
      clientId,
      email,
      password,
    });

    await saveSession(
      authResponse,
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "http://localhost:3000/callback",
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return { error: message };
  }

  return { redirectTo: getRedirectForEmail(email) };
}

// DEV ONLY — resolves a demo account id to its credentials server-side so the
// client bundle never carries a password. See ./accounts.ts.
export async function devLoginWithPreset(accountId: string): Promise<DevLoginResult> {
  const account = resolveDevAccount(accountId);

  if (!account) {
    return { error: "Unknown demo account" };
  }

  return devLogin(account.email, account.password);
}

function getRedirectForEmail(email: string): NonNullable<DevLoginResult["redirectTo"]> {
  const isOps = email.endsWith("@ops.local");
  const isGuard = !isOps && email.endsWith("@guards.local");
  const isTenant = email.startsWith("tenant") && email.includes("@test.demorentals.com");
  const isOwner = email.startsWith("owner") && email.includes("@test.demorentals.com");

  let redirectTo: NonNullable<DevLoginResult["redirectTo"]> = "/admin/dashboard";
  if (isOps) {
    redirectTo = "/ops/dashboard";
  } else if (isGuard) {
    redirectTo = "/guard/dashboard";
  } else if (isTenant) {
    redirectTo = "/listings";
  } else if (isOwner) {
    redirectTo = "/owner-services";
  }

  return redirectTo;
}

// DEV ONLY — creates a test user in WorkOS User Management
export async function devCreateTestUser(
  email: string,
  password: string,
  firstName: string,
): Promise<{ userId?: string; error?: string }> {
  if (isLocalAuthEnabled()) {
    return { error: "Local auth only supports the seeded demo accounts" };
  }

  if (
    process.env.NODE_ENV !== "development" &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true"
  ) {
    return { error: "Dev only" };
  }

  try {
    const existing = await getWorkOS().userManagement.listUsers({ email });
    if (existing.data.length > 0) {
      return { userId: existing.data[0].id };
    }

    const user = await getWorkOS().userManagement.createUser({
      email,
      password,
      firstName,
      emailVerified: true,
    });

    return { userId: user.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    return { error: message };
  }
}
