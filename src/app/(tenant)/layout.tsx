import type { Metadata, Viewport } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { USER_TYPE } from "../../../lib/constants";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { TenantLayoutInner } from "./tenant-layout-client";

export const viewport: Viewport = {
  themeColor: "#0EA5E9",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Tenant Portal",
    template: "%s | Rental Platform OS Tenant",
  },
};

export const dynamic = "force-dynamic";

export default async function TenantLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await withAuth();
  const { accessToken, ...initialAuth } = auth;

  if (!accessToken) {
    redirect("/post-auth");
  }

  const currentUser = await fetchQuery(api.users.getCurrentUser, {}, { token: accessToken });

  if (!currentUser) {
    redirect("/post-auth");
  }

  const hasTenantPersona =
    currentUser.user_types?.includes(USER_TYPE.TENANT) ??
    currentUser.user_type === USER_TYPE.TENANT;

  if (!hasTenantPersona) {
    redirect("/post-auth");
  }

  return (
    <ConvexClientProvider initialAuth={initialAuth}>
      <TenantLayoutInner>{children}</TenantLayoutInner>
    </ConvexClientProvider>
  );
}
