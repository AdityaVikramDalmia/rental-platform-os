import type { Metadata, Viewport } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { PublicHeader } from "@/components/public/header";
import { PublicFooter } from "@/components/public/footer";
import { WhatsAppWidget } from "@/components/public/whatsapp-widget";

export const viewport: Viewport = {
  themeColor: "#1E293B",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "DemoRentals - Find Your Perfect Rental Home",
    template: "%s | DemoRentals",
  },
  description:
    "Find verified rental properties with transparent pricing. Browse listings, schedule visits, and move in hassle-free.",
};

export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const auth = await withAuth();
  const { accessToken, ...initialAuth } = auth;
  void accessToken;
  const signInUrl = auth.user ? null : "/tenant/login";

  return (
    <ConvexClientProvider initialAuth={initialAuth}>
      <div className="flex min-h-screen flex-col">
        <PublicHeader user={auth.user} signInUrl={signInUrl} />
        <main className="flex-1">{children}</main>
        <PublicFooter />
        <WhatsAppWidget />
      </div>
    </ConvexClientProvider>
  );
}
