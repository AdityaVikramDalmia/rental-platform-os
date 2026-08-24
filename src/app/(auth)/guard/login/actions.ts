"use server";

import { redirect } from "next/navigation";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { normalizePhone, toSyntheticEmail } from "../../../../../lib/validators";

const INVALID_CREDENTIALS_MESSAGE = "Invalid phone number or password";
const SUSPENDED_ACCOUNT_MESSAGE = "Your account has been suspended. Contact your supervisor.";
const GENERIC_LOGIN_ERROR_MESSAGE = "Unable to log in right now. Please try again.";

type GuardLoginResult = {
  error: string;
};

type WorkOSErrorLike = {
  code?: string;
  error?: string;
  errorDescription?: string;
  message?: string;
};

function hasMustChangePasswordFlag(metadata: Record<string, string>): boolean {
  const value = metadata.must_change_password?.toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function mapGuardLoginError(error: unknown): string {
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

export async function guardLogin(
  phone: string,
  password: string,
): Promise<GuardLoginResult | void> {
  const clientId = process.env.WORKOS_CLIENT_ID;

  if (!clientId) {
    return {
      error: GENERIC_LOGIN_ERROR_MESSAGE,
    };
  }

  let syntheticEmail: string;

  try {
    const normalizedPhone = normalizePhone(phone);
    syntheticEmail = toSyntheticEmail(normalizedPhone);
  } catch {
    return {
      error: INVALID_CREDENTIALS_MESSAGE,
    };
  }

  let authResponse;

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
      error: mapGuardLoginError(error),
    };
  }

  // redirect() must be called outside try/catch — it works by throwing
  // a special Next.js error that must not be caught.
  if (hasMustChangePasswordFlag(authResponse.user.metadata)) {
    redirect("/guard/change-password");
  }

  redirect("/guard/dashboard");
}
