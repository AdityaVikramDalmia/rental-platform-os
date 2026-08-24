import {
  LOCAL_AUTH_CLIENT_ID,
  LOCAL_AUTH_ISSUER,
  LOCAL_AUTH_JWKS_URL,
  isLocalConvexAuthEnabled,
} from "../lib/localAuthConfig";

const clientId = process.env.WORKOS_CLIENT_ID;
const localAuthEnabled = isLocalConvexAuthEnabled();

const authConfig = {
  providers: [
    {
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      applicationID: clientId,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
    ...(localAuthEnabled
      ? [
          {
            type: "customJwt" as const,
            issuer: LOCAL_AUTH_ISSUER,
            algorithm: "RS256" as const,
            applicationID: LOCAL_AUTH_CLIENT_ID,
            jwks: LOCAL_AUTH_JWKS_URL,
          },
        ]
      : []),
  ],
};

export default authConfig;
