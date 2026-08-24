import type { Metadata, Viewport } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { isFieldWorkerUserType, USER_TYPE } from "../../../lib/constants";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { GuardLayoutInner } from "./guard-layout-client";

export const viewport: Viewport = {
  themeColor: "#F59E0B",
};

export const metadata: Metadata = {
  title: {
    default: "Guard Portal",
    template: "%s | Rental Platform OS Guard",
  },
  manifest: "/manifest-guard.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rental Platform OS Guard",
  },
  icons: {
    apple: "/icons/guard-180x180.png",
  },
};

export const dynamic = "force-dynamic";

export default async function GuardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await withAuth();
  const { accessToken, ...initialAuth } = auth;

  if (!accessToken) {
    redirect("/guard/login");
  }

  const currentUser = await fetchQuery(api.users.getCurrentUser, {}, { token: accessToken });

  if (!currentUser) {
    redirect("/guard/login");
  }

  if (!isFieldWorkerUserType(currentUser.user_type)) {
    if (currentUser.user_type === USER_TYPE.ADMIN) {
      redirect("/admin/dashboard");
    }

    if (currentUser.user_type === USER_TYPE.TENANT) {
      redirect("/listings");
    }

    if (currentUser.user_type === USER_TYPE.OWNER) {
      redirect("/owner/dashboard");
    }

    redirect("/homepage");
  }

  if (currentUser.status === "BANNED") {
    redirect("/guard/login?error=banned");
  }

  if (currentUser.must_change_password) {
    redirect("/guard/change-password");
  }

  const messages = await getMessages();

  return (
    <ConvexClientProvider initialAuth={initialAuth}>
      <NextIntlClientProvider messages={messages}>
        <GuardLayoutInner>{children}</GuardLayoutInner>
      </NextIntlClientProvider>
    </ConvexClientProvider>
  );
}
