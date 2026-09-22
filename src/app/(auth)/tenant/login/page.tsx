import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { encodeAuthPortalState } from "../../../../../lib/authPortal";
import { HostedLoginPage } from "@/components/auth/hosted-login-page";

type TenantLoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function TenantLoginPage({ searchParams }: TenantLoginPageProps) {
  const [{ error }, signInUrl] = await Promise.all([
    searchParams,
    getSignInUrl({ state: encodeAuthPortalState("tenant") }),
  ]);

  return (
    <HostedLoginPage
      title="Tenant Portal Login"
      description="Use an account with the Tenant persona to manage inquiries, visits, and rentals."
      error={Array.isArray(error) ? error[0] : error}
      signInUrl={signInUrl}
    />
  );
}
