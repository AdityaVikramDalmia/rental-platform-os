import type { Metadata, Viewport } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { USER_STATUS, USER_TYPE } from "../../../lib/constants";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { OpsLayoutInner } from "./ops-layout-client";

export const viewport: Viewport = {
  themeColor: "#10B981",
};

export const metadata: Metadata = {
  title: {
    default: "OPS Portal",
    template: "%s | Rental Platform OS OPS",
  },
};

export const dynamic = "force-dynamic";

export default async function OpsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await withAuth();
  const { accessToken, ...initialAuth } = auth;

  if (!accessToken) {
    redirect("/ops/login");
  }

  const currentUser = await fetchQuery(api.users.getCurrentUser, {}, { token: accessToken });

  if (!currentUser) {
    redirect("/ops/login");
  }

  const hasOpsPersona =
    currentUser.user_types?.includes(USER_TYPE.OPS) ?? currentUser.user_type === USER_TYPE.OPS;

  if (!hasOpsPersona) {
    redirect("/ops/login?error=role_mismatch");
  }

  if (!currentUser.role_names?.length) {
    redirect("/ops/login?error=access_not_configured");
  }

  if (currentUser.status === USER_STATUS.BANNED) {
    redirect("/ops/login?error=banned");
  }

  if (currentUser.status !== USER_STATUS.ACTIVE) {
    redirect("/ops/login");
  }

  if (currentUser.must_change_password) {
    redirect("/ops/change-password");
  }

  return (
    <ConvexClientProvider initialAuth={initialAuth}>
      <OpsLayoutInner>{children}</OpsLayoutInner>
    </ConvexClientProvider>
  );
}
