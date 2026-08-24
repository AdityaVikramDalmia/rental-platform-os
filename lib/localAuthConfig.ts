export const LOCAL_AUTH_CLIENT_ID = "local_auth_client";
export const LOCAL_AUTH_ISSUER = "http://127.0.0.1:3000";
export const LOCAL_AUTH_JWKS_PATH = `/sso/jwks/${LOCAL_AUTH_CLIENT_ID}`;
export const LOCAL_AUTH_JWKS_URL = `${LOCAL_AUTH_ISSUER}${LOCAL_AUTH_JWKS_PATH}`;

export const LOCAL_AUTH_IDENTITIES = {
  admin: {
    email: "admin@example.com",
    name: "Test Admin",
    workosUserId: "user_01ADMIN0000000000000000000",
  },
  guard: {
    email: "9999999999@guards.local",
    name: "Test Guard",
    workosUserId: "user_01GUARD0000000000000000000",
  },
  ops: {
    email: "8888888888@ops.local",
    name: "Test OPS Agent",
    workosUserId: "user_01OPSXX0000000000000000000",
  },
  tenant: {
    email: "tenant1@test.demorentals.com",
    name: "Ankit Mehta",
    workosUserId: "user_01TENANT000000000000000000",
  },
  owner: {
    email: "owner1@test.demorentals.com",
    name: "Ramesh Gupta",
    workosUserId: "user_01OWNER0000000000000000000",
  },
} as const;

type LocalAuthEnvironment = {
  CONVEX_CLOUD_URL?: string;
  LOCAL_AUTH?: string;
  NODE_ENV?: string;
  NEXT_PUBLIC_ENABLE_DEV_LOGIN?: string;
};

export function isDevLoginEnabled(environment?: LocalAuthEnvironment): boolean {
  const resolvedEnvironment = environment ?? { NODE_ENV: process.env.NODE_ENV };
  return resolvedEnvironment.NODE_ENV === "development";
}

/**
 * Local auth is intentionally impossible outside a development runtime.
 * A public client-side flag is only a UI hint; this server-side gate is the
 * authority for every local token, cookie, and JWKS operation.
 */
export function isLocalAuthEnabled(environment?: LocalAuthEnvironment): boolean {
  const resolvedEnvironment = environment ?? {
    LOCAL_AUTH: process.env.LOCAL_AUTH,
    NODE_ENV: process.env.NODE_ENV,
  };

  return (
    resolvedEnvironment.NODE_ENV === "development" &&
    resolvedEnvironment.LOCAL_AUTH === "true"
  );
}

/**
 * Convex's local function binary intentionally reports NODE_ENV=production.
 * This gate is only for its verifier/provider registration: token minting,
 * session cookies, and JWKS generation remain guarded by isLocalAuthEnabled.
 */
export function isLocalConvexAuthEnabled(environment?: LocalAuthEnvironment): boolean {
  const resolvedEnvironment = environment ?? {
    CONVEX_CLOUD_URL: process.env.CONVEX_CLOUD_URL,
    LOCAL_AUTH: process.env.LOCAL_AUTH,
  };
  const deploymentUrl = resolvedEnvironment.CONVEX_CLOUD_URL;

  if (resolvedEnvironment.LOCAL_AUTH !== "true" || !deploymentUrl) {
    return false;
  }

  try {
    const url = new URL(deploymentUrl);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1")
    );
  } catch {
    return false;
  }
}
