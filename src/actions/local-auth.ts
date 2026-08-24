"use server";

import { saveSession, withAuth } from "@workos-inc/authkit-nextjs";
import { isLocalAuthEnabled } from "../../lib/localAuthConfig";
import { refreshLocalDemoSession } from "@/lib/local-auth";

export async function refreshLocalAuthSession(): Promise<string | null> {
  if (!isLocalAuthEnabled()) {
    return null;
  }

  const auth = await withAuth();
  if (!auth.user) {
    return null;
  }

  const refreshedSession = refreshLocalDemoSession(auth.user.id);
  await saveSession(refreshedSession, "http://127.0.0.1:3000/callback");
  return refreshedSession.accessToken;
}
