import { describe, it } from "vitest";

// Admin login page is a Server Component that calls getSignInUrl() from
// @workos-inc/authkit-nextjs. This module depends on next/cache internals
// that aren't available in the vitest environment. The page is verified
// via `npm run build` instead.
describe.skip("AdminLoginPage", () => {
  it("is verified by build — cannot unit test Server Component with WorkOS SDK", () => {
    // Build verification covers: TypeScript compilation, route resolution,
    // and correct export of async server component.
  });
});
