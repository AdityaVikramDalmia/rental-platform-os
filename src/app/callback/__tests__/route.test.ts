import { handleAuth, type HandleAuthSuccessData } from "@workos-inc/authkit-nextjs";
import type { User } from "@workos-inc/node";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";
import { getPostAuthRedirectUrl, POST_AUTH_PATHNAME } from "../redirect";

vi.mock("@workos-inc/authkit-nextjs", () => ({
  handleAuth: vi.fn(),
}));

function createMockUser(email: string): User {
  return {
    object: "user",
    id: "user_test",
    email,
    emailVerified: true,
    profilePictureUrl: null,
    firstName: "Test",
    lastName: "User",
    lastSignInAt: null,
    locale: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    externalId: null,
    metadata: {},
  };
}

function createMockAuthSuccessData(email: string): HandleAuthSuccessData {
  return {
    accessToken: "access_token",
    refreshToken: "refresh_token",
    user: createMockUser(email),
    state: undefined,
  };
}

function mockCallbackSuccess(email: string) {
  vi.mocked(handleAuth).mockImplementation((options) => {
    return async () => {
      await options?.onSuccess?.(createMockAuthSuccessData(email));
      return new Response(null, {
        status: 307,
        headers: {
          location: "http://localhost:3000/admin/dashboard",
        },
      });
    };
  });
}

describe("callback redirect mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects synthetic guard email callbacks to /post-auth", async () => {
    mockCallbackSuccess("9876543210@guards.local");

    const response = await GET(new NextRequest("http://localhost:3000/callback"));

    expect(response.headers.get("location")).toBe(POST_AUTH_PATHNAME);
  });

  it("redirects Google SSO callbacks to /post-auth", async () => {
    mockCallbackSuccess("owner1@test.demorentals.com");

    const response = await GET(new NextRequest("http://localhost:3000/callback"));

    expect(response.headers.get("location")).toBe(POST_AUTH_PATHNAME);
  });

  it("never leaks the server bind host into the redirect location", async () => {
    mockCallbackSuccess("owner1@test.demorentals.com");

    const response = await GET(new NextRequest("http://0.0.0.0:3000/callback?code=abc"));

    expect(response.headers.get("location")).toBe(POST_AUTH_PATHNAME);
  });

  it("uses the canonical post-auth resolver pathname", () => {
    expect(getPostAuthRedirectUrl()).toBe(POST_AUTH_PATHNAME);
  });
});
