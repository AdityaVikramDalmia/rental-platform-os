"use server";

import { redirect } from "next/navigation";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { normalizePhone, toOpsSyntheticEmail } from "../../../../../lib/validators";

const INVALID_CREDENTIALS_MESSAGE = "Invalid phone number or password";
const SUSPENDED_ACCOUNT_MESSAGE = "Your account has been suspended. Contact your supervisor.";
const GENERIC_LOGIN_ERROR_MESSAGE = "Unable to log in right now. Please try again.";

type OpsLoginResult = {
  error: string;
};

type WorkOSErrorLike = {
  code?: string;
  error?: string;
  errorDescription?: string;
  message?: string;
};

type AuthResponse = Awaited<
  ReturnType<ReturnType<typeof getWorkOS>["userManagement"]["authenticateWithPassword"]>
>;

function hasMustChangePasswordFlag(metadata: Record<string, string>): boolean {
  const value = metadata.must_change_password?.toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function mapOpsLoginError(error: unknown): string {
  const errorDetails =
    typeof error === "object" && error !== null ? (error as WorkOSErrorLike) : undefined;

  const lowerCasedCombinedMessage = [
    errorDetails?.code,
    errorDetails?.error,
    errorDetails?.errorDescription,
    errorDetails?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (lowerCasedCombinedMessage.includes("suspend")) {
    return SUSPENDED_ACCOUNT_MESSAGE;
  }

  if (
    lowerCasedCombinedMessage.includes("invalid") ||
    lowerCasedCombinedMessage.includes("credential") ||
    lowerCasedCombinedMessage.includes("password")
  ) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  return GENERIC_LOGIN_ERROR_MESSAGE;
}

export async function opsLogin(phone: string, password: string): Promise<OpsLoginResult | void> {
  const clientId = process.env.WORKOS_CLIENT_ID;

  if (!clientId) {
    return {
      error: GENERIC_LOGIN_ERROR_MESSAGE,
    };
  }

  let syntheticEmail: string;

  try {
    const normalizedPhone = normalizePhone(phone);
    syntheticEmail = toOpsSyntheticEmail(normalizedPhone);
  } catch {
    return {
      error: INVALID_CREDENTIALS_MESSAGE,
    };
  }

  let authResponse: AuthResponse;

  try {
    authResponse = await getWorkOS().userManagement.authenticateWithPassword({
      clientId,
      email: syntheticEmail,
      password,
    });

    await saveSession(
      authResponse,
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "http://localhost:3000/callback",
    );
  } catch (error) {
    return {
      error: mapOpsLoginError(error),
    };
  }

  if (hasMustChangePasswordFlag(authResponse.user.metadata)) {
    redirect("/ops/change-password");
  }

  redirect("/ops/dashboard");
}
