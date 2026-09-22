import { USER_TYPE, type UserType } from "./constants";

export const AUTH_PORTAL_INTENTS = ["admin", "ops", "guard", "tenant", "owner"] as const;

export type AuthPortalIntent = (typeof AUTH_PORTAL_INTENTS)[number];

type AuthPortalConfig = {
  label: string;
  loginPathname: string;
  portalPathname: string;
  userType: UserType;
};

export const AUTH_PORTAL_CONFIG: Record<AuthPortalIntent, AuthPortalConfig> = {
  admin: {
    label: "Admin",
    loginPathname: "/admin/login",
    portalPathname: "/admin/dashboard",
    userType: USER_TYPE.ADMIN,
  },
  ops: {
    label: "OPS",
    loginPathname: "/ops/login",
    portalPathname: "/ops/dashboard",
    userType: USER_TYPE.OPS,
  },
  guard: {
    label: "Guard",
    loginPathname: "/guard/login",
    portalPathname: "/guard/dashboard",
    userType: USER_TYPE.GUARD,
  },
  tenant: {
    label: "Tenant",
    loginPathname: "/tenant/login",
    portalPathname: "/tenant/dashboard",
    userType: USER_TYPE.TENANT,
  },
  owner: {
    label: "Owner",
    loginPathname: "/owner/login",
    portalPathname: "/owner/dashboard",
    userType: USER_TYPE.OWNER,
  },
};

export function isAuthPortalIntent(value: unknown): value is AuthPortalIntent {
  return typeof value === "string" && AUTH_PORTAL_INTENTS.includes(value as AuthPortalIntent);
}

export function encodeAuthPortalState(portal: AuthPortalIntent): string {
  return JSON.stringify({ portal });
}
