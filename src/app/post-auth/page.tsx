import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import type { FunctionReturnType } from "convex/server";
import { redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import {
  AUTH_PORTAL_CONFIG,
  isAuthPortalIntent,
  type AuthPortalIntent,
} from "../../../lib/authPortal";

export const dynamic = "force-dynamic";

function shouldRetryDestinationResolution(result: { resolved_user_type: string }): boolean {
  return result.resolved_user_type === "UNKNOWN";
}

type PostAuthPageProps = {
  searchParams: Promise<{ portal?: string | string[] }>;
};

function getPortalIntent(value: string | string[] | undefined): AuthPortalIntent | undefined {
  const portal = Array.isArray(value) ? value[0] : value;
  return isAuthPortalIntent(portal) ? portal : undefined;
}

type PostAuthResolution = FunctionReturnType<typeof api.users.resolvePostAuthDestination>;

async function redirectExplicitPortalIntent(
  resolution: PostAuthResolution,
  portalConfig: (typeof AUTH_PORTAL_CONFIG)[AuthPortalIntent] | undefined,
  accessToken: string,
): Promise<void> {
  if (!portalConfig || !("intent_allowed" in resolution)) {
    return;
  }

  if (resolution.intent_allowed === false) {
    redirect(resolution.pathname);
  }

  if (resolution.intent_allowed === true) {
    if (
      "should_activate_intent" in resolution &&
      resolution.should_activate_intent &&
      "persona_to_activate" in resolution &&
      typeof resolution.persona_to_activate === "string"
    ) {
      await fetchMutation(
        api.users.setActivePersona,
        { persona: resolution.persona_to_activate },
        { token: accessToken },
      );
    }

    redirect(resolution.pathname);
  }
}

export default async function PostAuthPage({ searchParams }: PostAuthPageProps) {
  const { portal: portalParam } = await searchParams;
  const portal = getPortalIntent(portalParam);
  const portalConfig = portal ? AUTH_PORTAL_CONFIG[portal] : undefined;
  const { accessToken } = await withAuth();

  if (!accessToken) {
    redirect(portalConfig?.loginPathname ?? "/admin/login");
  }

  const firstResolution = await fetchQuery(
    api.users.resolvePostAuthDestination,
    { intended_persona: portalConfig?.userType },
    { token: accessToken },
  );

  await redirectExplicitPortalIntent(firstResolution, portalConfig, accessToken);

  if (!shouldRetryDestinationResolution(firstResolution)) {
    redirect(firstResolution.pathname);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const secondResolution = await fetchQuery(
    api.users.resolvePostAuthDestination,
    { intended_persona: portalConfig?.userType },
    { token: accessToken },
  );

  await redirectExplicitPortalIntent(secondResolution, portalConfig, accessToken);

  redirect(
    shouldRetryDestinationResolution(secondResolution)
      ? (portalConfig?.loginPathname ?? "/admin/login")
      : secondResolution.pathname,
  );
}
