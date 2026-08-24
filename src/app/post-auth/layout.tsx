import { withAuth } from "@workos-inc/authkit-nextjs";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";

export const dynamic = "force-dynamic";

export default async function PostAuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { accessToken: _accessToken, ...initialAuth } = await withAuth();

  return <ConvexClientProvider initialAuth={initialAuth}>{children}</ConvexClientProvider>;
}
