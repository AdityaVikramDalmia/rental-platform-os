import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { isAuthPortalIntent, type AuthPortalIntent } from "../../../lib/authPortal";
import { ADMIN_DASHBOARD_PATHNAME, getPostAuthRedirectUrl } from "./redirect";

type AuthStatePayload = {
  invite_token?: unknown;
  portal?: unknown;
};

function extractAuthState(payload: unknown): {
  inviteToken: string | null;
  hasInviteTokenField: boolean;
  portal: AuthPortalIntent | null;
  hasPortalField: boolean;
} {
  if (!payload || typeof payload !== "object") {
    return {
      inviteToken: null,
      hasInviteTokenField: false,
      portal: null,
      hasPortalField: false,
    };
  }

  const parsed = payload as AuthStatePayload;
  const hasInviteTokenField = parsed.invite_token !== undefined;
  const hasPortalField = parsed.portal !== undefined;
  const inviteToken =
    typeof parsed.invite_token === "string" && parsed.invite_token.length > 0
      ? parsed.invite_token
      : null;
  const portal = isAuthPortalIntent(parsed.portal) ? parsed.portal : null;

  return { inviteToken, hasInviteTokenField, portal, hasPortalField };
}

function tryParseJson(payload: string): unknown | null {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function decodeAuthState(state: string | undefined): {
  inviteToken: string | null;
  hasInvalidInviteState: boolean;
  portal: AuthPortalIntent | null;
  hasInvalidPortalState: boolean;
} {
  if (!state) {
    return {
      inviteToken: null,
      hasInvalidInviteState: false,
      portal: null,
      hasInvalidPortalState: false,
    };
  }

  let hasInviteTokenField = false;
  let hasPortalField = false;

  const candidates = [
    tryParseJson(state),
    tryParseJson(Buffer.from(state, "base64").toString("utf-8")),
  ];

  for (const candidate of candidates) {
    if (candidate !== null) {
      const result = extractAuthState(candidate);

      if (result.inviteToken || result.portal) {
        return {
          inviteToken: result.inviteToken,
          hasInvalidInviteState: result.hasInviteTokenField && !result.inviteToken,
          portal: result.portal,
          hasInvalidPortalState: result.hasPortalField && !result.portal,
        };
      }

      hasInviteTokenField = hasInviteTokenField || result.hasInviteTokenField;
      hasPortalField = hasPortalField || result.hasPortalField;
    }
  }

  return {
    inviteToken: null,
    hasInvalidInviteState: hasInviteTokenField,
    portal: null,
    hasInvalidPortalState: hasPortalField,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  let postAuthPathname = ADMIN_DASHBOARD_PATHNAME;
  let didAuthSucceed = false;

  const authHandler = handleAuth({
    returnPathname: ADMIN_DASHBOARD_PATHNAME,
    onSuccess: async ({ state }) => {
      didAuthSucceed = true;

      const { inviteToken, hasInvalidInviteState, portal, hasInvalidPortalState } =
        decodeAuthState(state);

      if (hasInvalidInviteState) {
        postAuthPathname = "/?error=invite_state_invalid";
        return;
      }

      if (hasInvalidPortalState) {
        postAuthPathname = "/?error=portal_state_invalid";
        return;
      }

      if (inviteToken) {
        postAuthPathname = `/invite/${encodeURIComponent(inviteToken)}/join`;
        return;
      }

      postAuthPathname = getPostAuthRedirectUrl(portal ?? undefined);
    },
  });

  const response = await authHandler(request);
  const redirectLocation = response.headers.get("location");

  if (!redirectLocation) {
    return response;
  }

  if (didAuthSucceed) {
    // Root-relative Location (RFC 7231 §7.1.2). Behind the reverse proxy `request.url`
    // resolves to the server's bind host (0.0.0.0:3000), never the public origin.
    const target = new URL(postAuthPathname, request.url);
    response.headers.set("location", `${target.pathname}${target.search}${target.hash}`);
  }

  return response;
}
