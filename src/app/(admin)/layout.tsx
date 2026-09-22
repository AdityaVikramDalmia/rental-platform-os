import type { Metadata, Viewport } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { isBackofficeUser } from "../../../lib/constants";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { AdminLayoutInner } from "./admin-layout-client";

export const viewport: Viewport = {
  themeColor: "#3B82F6",
};

export const metadata: Metadata = {
  title: {
    default: "Admin Panel",
    template: "%s | Rental Platform OS Admin",
  },
  manifest: "/manifest-admin.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rental Platform OS Admin",
  },
  icons: {
    apple: "/icons/admin-180x180.png",
  },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await withAuth();
  const { accessToken, ...initialAuth } = auth;

  if (!accessToken) {
    redirect("/admin/login");
  }

  const currentUser = await fetchQuery(api.users.getCurrentUser, {}, { token: accessToken });

  if (!currentUser) {
    redirect("/admin/login");
  }

  const hasBackofficePersona =
    currentUser.user_types?.some((persona) => isBackofficeUser(persona)) ??
    isBackofficeUser(currentUser.user_type);

  if (!hasBackofficePersona) {
    redirect("/admin/login?error=role_mismatch");
  }

  if (!currentUser.role_names?.length) {
    redirect("/admin/login?error=access_not_configured");
  }

  return (
    <ConvexClientProvider initialAuth={initialAuth}>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </ConvexClientProvider>
  );
}
