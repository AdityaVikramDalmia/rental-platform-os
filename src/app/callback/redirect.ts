import type { AuthPortalIntent } from "../../../lib/authPortal";

export const ADMIN_DASHBOARD_PATHNAME = "/admin/dashboard";
export const POST_AUTH_PATHNAME = "/post-auth";

export function getPostAuthRedirectUrl(portal?: AuthPortalIntent): string {
  return portal ? `${POST_AUTH_PATHNAME}?portal=${encodeURIComponent(portal)}` : POST_AUTH_PATHNAME;
}
