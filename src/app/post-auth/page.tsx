import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";

export const dynamic = "force-dynamic";

function shouldRetryDestinationResolution(result: { resolved_user_type: string }): boolean {
  return result.resolved_user_type === "UNKNOWN";
}

export default async function PostAuthPage() {
  const { accessToken } = await withAuth();

  if (!accessToken) {
    redirect("/admin/login");
  }

  const firstResolution = await fetchQuery(
    api.users.resolvePostAuthDestination,
    {},
    { token: accessToken },
  );

  if (!shouldRetryDestinationResolution(firstResolution)) {
    redirect(firstResolution.pathname);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const secondResolution = await fetchQuery(
    api.users.resolvePostAuthDestination,
    {},
    { token: accessToken },
  );

  redirect(
    shouldRetryDestinationResolution(secondResolution) ? "/admin/login" : secondResolution.pathname,
  );
}
