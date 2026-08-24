// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateLocalDemoAccount,
  getLocalAuthJwks,
  verifyLocalAccessToken,
} from "./local-auth";
import {
  isDevLoginEnabled,
  isLocalAuthEnabled,
  isLocalConvexAuthEnabled,
} from "../../lib/localAuthConfig";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => await rm(directory, { recursive: true, force: true })),
  );
});

describe("local auth", () => {
  it("requires the explicit development flag and a loopback Convex deployment", () => {
    expect(isLocalAuthEnabled({ NODE_ENV: "production", LOCAL_AUTH: "true" })).toBe(false);
    expect(isLocalAuthEnabled({ NODE_ENV: "development", LOCAL_AUTH: "false" })).toBe(false);
    expect(
      isLocalConvexAuthEnabled({
        LOCAL_AUTH: "true",
        CONVEX_CLOUD_URL: "https://example.convex.cloud",
      }),
    ).toBe(false);
    expect(
      isLocalConvexAuthEnabled({
        LOCAL_AUTH: "true",
        CONVEX_CLOUD_URL: "http://127.0.0.1:3210",
      }),
    ).toBe(true);
  });

  it("never enables the development login route in production", () => {
    expect(
      isDevLoginEnabled({ NODE_ENV: "production", NEXT_PUBLIC_ENABLE_DEV_LOGIN: "true" }),
    ).toBe(false);
    expect(isDevLoginEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("refuses to mint outside development even when LOCAL_AUTH is true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_AUTH", "true");

    expect(() => authenticateLocalDemoAccount("admin@example.com", "DevAdmin123!")).toThrow(
      "Local auth is only available when NODE_ENV is development and LOCAL_AUTH is true",
    );
  });

  it("mints a verifiable RS256 token and exposes its public JWKS", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rental-platform-os-local-auth-"));
    temporaryDirectories.push(directory);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_AUTH", "true");
    vi.stubEnv("LOCAL_AUTH_KEY_DIR", directory);

    const session = authenticateLocalDemoAccount("admin@example.com", "DevAdmin123!");
    const claims = verifyLocalAccessToken(session.accessToken);
    const jwks = getLocalAuthJwks();

    expect(claims.sub).toBe("user_01ADMIN0000000000000000000");
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ alg: "RS256", kty: "RSA", use: "sig" });
  });
});
