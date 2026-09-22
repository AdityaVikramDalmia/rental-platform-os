"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function resolveSameSite(): "lax" | "strict" | "none" {
  const configured = process.env.WORKOS_COOKIE_SAMESITE?.toLowerCase();

  if (configured === "strict" || configured === "none") {
    return configured;
  }

  return "lax";
}

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = process.env.WORKOS_COOKIE_NAME || "wos-session";
  const cookieDomain = process.env.WORKOS_COOKIE_DOMAIN || undefined;
  const sameSite = resolveSameSite();
  const secure = process.env.NODE_ENV === "production" || sameSite === "none";

  cookieStore.delete(cookieName);
  cookieStore.delete("workos-access-token");
  cookieStore.delete({
    name: cookieName,
    domain: cookieDomain,
    path: "/",
    sameSite,
    secure,
  });

  // Avoid an extra redirect through `/`: Next's Server Action response can copy
  // its Location header and make the client follow ordinary HTML instead of RSC.
  redirect("/homepage");
}
