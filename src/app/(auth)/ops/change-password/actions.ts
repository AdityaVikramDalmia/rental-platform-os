"use server";

import { fetchMutation } from "convex/nextjs";
import { getWorkOS, saveSession, withAuth } from "@workos-inc/authkit-nextjs";
import { api } from "../../../../../convex/_generated/api";

const CURRENT_PASSWORD_INCORRECT_MESSAGE = "Current password is incorrect";
const NEW_PASSWORD_POLICY_MESSAGE = "New password does not meet requirements";
const SUSPENDED_ACCOUNT_MESSAGE = "Your account has been suspended. Contact your supervisor.";
const GENERIC_ERROR_MESSAGE = "Unable to change password right now. Please try again.";

type ChangePasswordResult =
  | {
      success: true;
    }
  | {
      error: string;
    };

type WorkOSErrorLike = {
  code?: string;
  error?: string;
  errorDescription?: string;
  message?: string;
};

function getCombinedErrorMessage(error: unknown): string {
  const errorDetails =
    typeof error === "object" && error !== null ? (error as WorkOSErrorLike) : undefined;

  return [
    errorDetails?.code,
    errorDetails?.error,
    errorDetails?.errorDescription,
    errorDetails?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function mapCurrentPasswordError(error: unknown): string {
  const combinedErrorMessage = getCombinedErrorMessage(error);

  if (combinedErrorMessage.includes("suspend")) {
    return SUSPENDED_ACCOUNT_MESSAGE;
  }

  if (
    combinedErrorMessage.includes("invalid") ||
    combinedErrorMessage.includes("password") ||
    combinedErrorMessage.includes("credential")
  ) {
    return CURRENT_PASSWORD_INCORRECT_MESSAGE;
  }

  return GENERIC_ERROR_MESSAGE;
}

function mapPasswordUpdateError(error: unknown): string {
  const combinedErrorMessage = getCombinedErrorMessage(error);

  if (combinedErrorMessage.includes("suspend")) {
    return SUSPENDED_ACCOUNT_MESSAGE;
  }

  if (
    combinedErrorMessage.includes("password") ||
    combinedErrorMessage.includes("policy") ||
    combinedErrorMessage.includes("require")
  ) {
    return NEW_PASSWORD_POLICY_MESSAGE;
  }

  return GENERIC_ERROR_MESSAGE;
}

export async function changeOpsPassword(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const clientId = process.env.WORKOS_CLIENT_ID;

  if (!clientId) {
    return {
      error: GENERIC_ERROR_MESSAGE,
    };
  }

  const session = await withAuth({ ensureSignedIn: true });
  const workosUser = session.user;

  if (!workosUser.email) {
    return {
      error: GENERIC_ERROR_MESSAGE,
    };
  }

  try {
    await getWorkOS().userManagement.authenticateWithPassword({
      clientId,
      email: workosUser.email,
      password: currentPassword,
    });
  } catch (error) {
    return {
      error: mapCurrentPasswordError(error),
    };
  }

  try {
    await getWorkOS().userManagement.updateUser({
      userId: workosUser.id,
      password: newPassword,
    });

    await fetchMutation(
      api.users.clearMustChangePassword,
      {},
      {
        token: session.accessToken,
      },
    );

    const refreshedSession = await getWorkOS().userManagement.authenticateWithPassword({
      clientId,
      email: workosUser.email,
      password: newPassword,
    });

    await saveSession(
      refreshedSession,
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "http://localhost:3000/callback",
    );
  } catch (error) {
    return {
      error: mapPasswordUpdateError(error),
    };
  }

  return { success: true };
}
