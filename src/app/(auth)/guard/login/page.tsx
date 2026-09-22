import { GuardLoginClient } from "./guard-login-client";

type GuardLoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function GuardLoginPage({ searchParams }: GuardLoginPageProps) {
  const { error } = await searchParams;

  return <GuardLoginClient error={Array.isArray(error) ? error[0] : error} />;
}
