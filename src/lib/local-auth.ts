import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@workos-inc/node";
import {
  LOCAL_AUTH_CLIENT_ID,
  LOCAL_AUTH_IDENTITIES,
  LOCAL_AUTH_ISSUER,
  isLocalAuthEnabled,
} from "../../lib/localAuthConfig";

const LOCAL_AUTH_TOKEN_TTL_SECONDS = 60 * 60;
const LOCAL_AUTH_REFRESH_TOKEN = "local-auth-refresh-not-used";

const LOCAL_AUTH_DEMO_ACCOUNTS = [
  {
    ...LOCAL_AUTH_IDENTITIES.admin,
    password: "DevAdmin123!",
  },
  {
    ...LOCAL_AUTH_IDENTITIES.guard,
    password: "DevGuard123!",
  },
  {
    ...LOCAL_AUTH_IDENTITIES.ops,
    password: "DevOps123!",
  },
  {
    ...LOCAL_AUTH_IDENTITIES.tenant,
    password: "DevTenant123!",
  },
  {
    ...LOCAL_AUTH_IDENTITIES.owner,
    password: "DevOwner123!",
  },
] as const;

type LocalAuthDemoAccount = (typeof LOCAL_AUTH_DEMO_ACCOUNTS)[number];

type LocalAuthKeyMaterial = {
  kid: string;
  privateKeyPem: string;
  publicJwk: JsonWebKey;
};

type LocalAuthClaims = {
  aud: string;
  email: string;
  exp: number;
  iat: number;
  iss: string;
  name: string;
  sid: string;
  sub: string;
};

type LocalAuthJwk = JsonWebKey & {
  alg: "RS256";
  kid: string;
  use: "sig";
};

const keyMaterialByDirectory = new Map<string, LocalAuthKeyMaterial>();

function assertLocalAuthEnabled(): void {
  if (!isLocalAuthEnabled()) {
    throw new Error(
      "Local auth is only available when NODE_ENV is development and LOCAL_AUTH is true",
    );
  }
}

function localAuthKeyDirectory(): string {
  return process.env.LOCAL_AUTH_KEY_DIR ?? join(process.cwd(), ".local-auth");
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function getKeyMaterial(): LocalAuthKeyMaterial {
  assertLocalAuthEnabled();

  const directory = localAuthKeyDirectory();
  const cached = keyMaterialByDirectory.get(directory);
  if (cached) {
    return cached;
  }

  const privateKeyPath = join(directory, "local-auth-rs256-private.pem");
  let privateKeyPem: string;

  try {
    privateKeyPem = readFileSync(privateKeyPath, "utf8");
  } catch (error: unknown) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") {
      throw error;
    }

    const keyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    privateKeyPem = keyPair.privateKey;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(privateKeyPath, privateKeyPem, { encoding: "utf8", mode: 0o600 });
  }

  const publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" });
  const kid = createHash("sha256").update(JSON.stringify(publicJwk)).digest("base64url");
  const material = { kid, privateKeyPem, publicJwk };
  keyMaterialByDirectory.set(directory, material);
  return material;
}

function getDemoAccount(email: string, password: string): LocalAuthDemoAccount {
  const account = LOCAL_AUTH_DEMO_ACCOUNTS.find(
    (candidate) =>
      candidate.email === email.trim().toLowerCase() && candidate.password === password,
  );

  if (!account) {
    throw new Error("Invalid local demo account credentials");
  }

  return account;
}

function getDemoAccountByWorkosUserId(workosUserId: string): LocalAuthDemoAccount {
  const account = LOCAL_AUTH_DEMO_ACCOUNTS.find(
    (candidate) => candidate.workosUserId === workosUserId,
  );

  if (!account) {
    throw new Error("Local auth session does not belong to a seeded demo account");
  }

  return account;
}

function toAuthKitUser(account: LocalAuthDemoAccount): User {
  const [firstName, ...lastNameParts] = account.name.split(" ");
  const now = new Date().toISOString();

  return {
    object: "user",
    id: account.workosUserId,
    email: account.email,
    emailVerified: true,
    profilePictureUrl: null,
    firstName: firstName ?? null,
    lastName: lastNameParts.join(" ") || null,
    lastSignInAt: now,
    locale: "en",
    createdAt: now,
    updatedAt: now,
    externalId: null,
    metadata: {},
  };
}

function mintAccessToken(account: LocalAuthDemoAccount): string {
  assertLocalAuthEnabled();

  const { kid, privateKeyPem } = getKeyMaterial();
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", kid, typ: "JWT" });
  const payload = base64UrlJson({
    aud: LOCAL_AUTH_CLIENT_ID,
    email: account.email,
    exp: issuedAt + LOCAL_AUTH_TOKEN_TTL_SECONDS,
    iat: issuedAt,
    iss: LOCAL_AUTH_ISSUER,
    name: account.name,
    sid: `local_${randomUUID()}`,
    sub: account.workosUserId,
  } satisfies LocalAuthClaims);
  const signedPayload = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signedPayload), privateKeyPem).toString(
    "base64url",
  );

  return `${signedPayload}.${signature}`;
}

export function authenticateLocalDemoAccount(
  email: string,
  password: string,
): {
  accessToken: string;
  refreshToken: string;
  user: User;
} {
  assertLocalAuthEnabled();
  const account = getDemoAccount(email, password);

  return {
    accessToken: mintAccessToken(account),
    refreshToken: LOCAL_AUTH_REFRESH_TOKEN,
    user: toAuthKitUser(account),
  };
}

export function refreshLocalDemoSession(workosUserId: string): {
  accessToken: string;
  refreshToken: string;
  user: User;
} {
  assertLocalAuthEnabled();
  const account = getDemoAccountByWorkosUserId(workosUserId);

  return {
    accessToken: mintAccessToken(account),
    refreshToken: LOCAL_AUTH_REFRESH_TOKEN,
    user: toAuthKitUser(account),
  };
}

export function getLocalAuthJwks(): { keys: LocalAuthJwk[] } {
  const { kid, publicJwk } = getKeyMaterial();
  const jwk = {
    ...publicJwk,
    alg: "RS256" as const,
    kid,
    use: "sig" as const,
  };

  return {
    keys: [jwk],
  };
}

function stringClaim(claims: object, key: string): string | null {
  const value = Reflect.get(claims, key);
  return typeof value === "string" ? value : null;
}

function numberClaim(claims: object, key: string): number | null {
  const value = Reflect.get(claims, key);
  return typeof value === "number" ? value : null;
}

export function verifyLocalAccessToken(token: string): LocalAuthClaims {
  assertLocalAuthEnabled();
  const [header, payload, signature, extra] = token.split(".");

  if (!header || !payload || !signature || extra) {
    throw new Error("Malformed local auth token");
  }

  const { privateKeyPem } = getKeyMaterial();
  const isValidSignature = verify(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    createPublicKey(createPrivateKey(privateKeyPem)),
    Buffer.from(signature, "base64url"),
  );
  if (!isValidSignature) {
    throw new Error("Invalid local auth token signature");
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid local auth token payload");
  }

  if (!claims || typeof claims !== "object") {
    throw new Error("Invalid local auth token claims");
  }

  const aud = stringClaim(claims, "aud");
  const email = stringClaim(claims, "email");
  const exp = numberClaim(claims, "exp");
  const iat = numberClaim(claims, "iat");
  const iss = stringClaim(claims, "iss");
  const name = stringClaim(claims, "name");
  const sid = stringClaim(claims, "sid");
  const sub = stringClaim(claims, "sub");

  if (
    aud !== LOCAL_AUTH_CLIENT_ID ||
    !email ||
    exp === null ||
    exp <= Math.floor(Date.now() / 1000) ||
    iat === null ||
    iss !== LOCAL_AUTH_ISSUER ||
    !name ||
    !sid ||
    !sub
  ) {
    throw new Error("Invalid local auth token claims");
  }

  return { aud, email, exp, iat, iss, name, sid, sub };
}
