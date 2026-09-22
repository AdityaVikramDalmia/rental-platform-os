import type { Metadata, Viewport } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { USER_TYPE } from "../../../lib/constants";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { OwnerLayoutClient } from "./owner-layout-client";

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Owner Portal",
    template: "%s | Rental Platform OS Owner",
  },
};

export const dynamic = "force-dynamic";

export default async function OwnerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await withAuth();
  const { accessToken, ...initialAuth } = auth;

  if (!accessToken) {
    redirect("/owner/login");
  }

  const currentUser = await fetchQuery(api.users.getCurrentUser, {}, { token: accessToken });

  if (!currentUser) {
    redirect("/owner/login");
  }

  const hasPersona = (persona: string) =>
    currentUser.user_types?.some((t) => t === persona) ?? currentUser.user_type === persona;

  if (!hasPersona(USER_TYPE.OWNER)) {
    if (hasPersona(USER_TYPE.GUARD)) {
      redirect("/guard/dashboard");
    }

    if (hasPersona(USER_TYPE.ADMIN)) {
      redirect("/admin/dashboard");
    }

    if (hasPersona(USER_TYPE.OPS)) {
      redirect("/admin/dashboard");
    }

    redirect("/owner/login?error=role_mismatch");
  }

  return (
    <ConvexClientProvider initialAuth={initialAuth}>
      <OwnerLayoutClient>{children}</OwnerLayoutClient>
    </ConvexClientProvider>
  );
}
