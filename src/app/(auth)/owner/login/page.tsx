import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { encodeAuthPortalState } from "../../../../../lib/authPortal";
import { HostedLoginPage } from "@/components/auth/hosted-login-page";

type OwnerLoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function OwnerLoginPage({ searchParams }: OwnerLoginPageProps) {
  const [{ error }, signInUrl] = await Promise.all([
    searchParams,
    getSignInUrl({ state: encodeAuthPortalState("owner") }),
  ]);

  return (
    <HostedLoginPage
      title="Owner Portal Login"
      description="Use an account with the Owner persona to manage properties and service requests."
      error={Array.isArray(error) ? error[0] : error}
      signInUrl={signInUrl}
    />
  );
}
