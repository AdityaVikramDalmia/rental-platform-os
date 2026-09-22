import { describe, expect, it } from "vitest";
import { AUTH_PORTAL_CONFIG, encodeAuthPortalState, isAuthPortalIntent } from "./authPortal";

describe("auth portal intent", () => {
  it("maps every public login lane to one role and portal", () => {
    expect(AUTH_PORTAL_CONFIG.admin).toMatchObject({
      loginPathname: "/admin/login",
      portalPathname: "/admin/dashboard",
      userType: "ADMIN",
    });
    expect(AUTH_PORTAL_CONFIG.tenant).toMatchObject({
      loginPathname: "/tenant/login",
      portalPathname: "/tenant/dashboard",
      userType: "TENANT",
    });
    expect(AUTH_PORTAL_CONFIG.owner).toMatchObject({
      loginPathname: "/owner/login",
      portalPathname: "/owner/dashboard",
      userType: "OWNER",
    });
  });

  it("encodes only recognized portal values", () => {
    expect(encodeAuthPortalState("ops")).toBe('{"portal":"ops"}');
    expect(isAuthPortalIntent("guard")).toBe(true);
    expect(isAuthPortalIntent("super-admin")).toBe(false);
  });
});
