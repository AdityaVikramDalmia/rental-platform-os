import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { OpsLoginClient } from "./ops-login-client";

export default async function OpsLoginPage() {
  const signInUrl = await getSignInUrl();

  return <OpsLoginClient signInUrl={signInUrl} />;
}
