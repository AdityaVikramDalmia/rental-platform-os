import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { ADMIN_DASHBOARD_PATHNAME, getPostAuthRedirectUrl } from "./redirect";

type InviteStatePayload = {
  invite_token?: unknown;
};

function extractInviteToken(payload: unknown): {
  inviteToken: string | null;
  hasInviteTokenField: boolean;
} {
  if (!payload || typeof payload !== "object") {
    return { inviteToken: null, hasInviteTokenField: false };
  }

  const parsed = payload as InviteStatePayload;
  if (parsed.invite_token === undefined) {
    return { inviteToken: null, hasInviteTokenField: false };
  }

  if (typeof parsed.invite_token === "string" && parsed.invite_token.length > 0) {
    return { inviteToken: parsed.invite_token, hasInviteTokenField: true };
  }

  return { inviteToken: null, hasInviteTokenField: true };
}

function tryParseJson(payload: string): unknown | null {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function decodeInviteTokenFromState(state: string | undefined): {
  inviteToken: string | null;
  hasInvalidInviteState: boolean;
} {
  if (!state) {
    return { inviteToken: null, hasInvalidInviteState: false };
  }

  let hasInviteTokenField = false;

  {
    const parsedRaw = tryParseJson(state);
    if (parsedRaw !== null) {
      const rawResult = extractInviteToken(parsedRaw);

      if (rawResult.inviteToken) {
        return { inviteToken: rawResult.inviteToken, hasInvalidInviteState: false };
      }

      hasInviteTokenField = hasInviteTokenField || rawResult.hasInviteTokenField;
    }
  }

  {
    const decoded = Buffer.from(state, "base64").toString("utf-8");
    const parsedBase64 = tryParseJson(decoded);
    if (parsedBase64 !== null) {
      const base64Result = extractInviteToken(parsedBase64);

      if (base64Result.inviteToken) {
        return { inviteToken: base64Result.inviteToken, hasInvalidInviteState: false };
      }

      hasInviteTokenField = hasInviteTokenField || base64Result.hasInviteTokenField;
    }
  }

  return { inviteToken: null, hasInvalidInviteState: hasInviteTokenField };
}

export async function GET(request: NextRequest): Promise<Response> {
  let postAuthPathname = ADMIN_DASHBOARD_PATHNAME;
  let didAuthSucceed = false;

  const authHandler = handleAuth({
    returnPathname: ADMIN_DASHBOARD_PATHNAME,
    onSuccess: async ({ state }) => {
      didAuthSucceed = true;

      const { inviteToken, hasInvalidInviteState } = decodeInviteTokenFromState(state);

      if (hasInvalidInviteState) {
        postAuthPathname = "/?error=invite_state_invalid";
        return;
      }

      if (inviteToken) {
        postAuthPathname = `/invite/${encodeURIComponent(inviteToken)}/join`;
        return;
      }

      postAuthPathname = getPostAuthRedirectUrl();
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
