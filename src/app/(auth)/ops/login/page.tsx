import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { encodeAuthPortalState } from "../../../../../lib/authPortal";
import { OpsLoginClient } from "./ops-login-client";

type OpsLoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function OpsLoginPage({ searchParams }: OpsLoginPageProps) {
  const { error } = await searchParams;
  const signInUrl = await getSignInUrl({ state: encodeAuthPortalState("ops") });

  return <OpsLoginClient signInUrl={signInUrl} error={Array.isArray(error) ? error[0] : error} />;
}
