# WorkOS AuthKit on Next.js 16 (Turbopack)

**Date**: 2026-02-17
**Stack**: Next.js 16.1.6, Turbopack, WorkOS AuthKit (`@workos-inc/authkit-nextjs`)
**Time to diagnose**: ~2 hours

## Problem 1: `middleware.ts` doesn't run on Next.js 16

### Symptom

```
Error: You are calling 'withAuth' on a route that isn't covered by the AuthKit middleware.
```

`withAuth()` in any server component throws this error. Enabling `debug: true` in `authkitMiddleware()` produces zero log output. The middleware simply never executes.

### Root Cause

Next.js 16 renamed "middleware" to "proxy". The AuthKit README states:

> **For Next.js 16+:** Create a `proxy.ts` file in the root of your project.
> **For Next.js <=15:** Create a `middleware.ts` file in the root of your project.

But there's a second catch: if your app uses the `src/` directory layout (i.e., `src/app/`), the proxy file must be at **`src/proxy.ts`**, not at the project root.

### What We Tried (and failed)

| Attempt                         | Result                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| `middleware.ts` at project root | Never executes. Zero debug output.                              |
| `proxy.ts` at project root      | Never executes. Zero debug output.                              |
| `src/proxy.ts`                  | Works immediately. Logs show `proxy.ts: Xms` for every request. |

### The Fix

```
# Move the file
mv middleware.ts src/proxy.ts
```

The code inside stays identical:

```ts
// src/proxy.ts
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/guard/login",
      "/admin/login",
      "/callback",
      "/listing/(.*)",
      "/dev/(.*)",
    ],
  },
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
```

### How to Verify

Check Next.js dev server logs. Every request should show `proxy.ts: Xms`:

```
GET /admin/dashboard 200 in 2.5s (compile: 1894ms, proxy.ts: 464ms, render: 170ms)
```

If you see requests WITHOUT `proxy.ts:` timing, the proxy isn't running.

### Misleading Signal

`npm run build` shows `f Proxy (Middleware)` in the route table even when the proxy doesn't work in dev mode. The build detects the file but Turbopack dev server doesn't load it from the wrong location. **Don't trust the build output — test in dev mode.**

---

## Problem 2: `withAuth` POST error (pre-proxy fix)

### Symptom

`AuthKitProvider` calls a server action (`getAuthAction()`) on mount. This POST request hits `withAuth()` which checks for the `x-workos-middleware` request header. If the proxy isn't running, this header is missing and throws.

### The Fix (initialAuth pattern)

The AuthKit README documents an "Optimizing with Server-Side Auth Data" pattern. Make the layout a server component that calls `withAuth()` and passes the result (minus `accessToken`) to `AuthKitProvider`:

```tsx
// src/app/(admin)/layout.tsx — SERVER component (no "use client")
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { AdminLayoutInner } from "./admin-layout-client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await withAuth();
  const { accessToken, ...initialAuth } = auth;

  return (
    <ConvexClientProvider initialAuth={initialAuth}>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </ConvexClientProvider>
  );
}
```

The client UI (sidebar, nav, auth checks) lives in a separate `"use client"` file (`admin-layout-client.tsx`).

`ConvexClientProvider` passes `initialAuth` to `AuthKitProvider`:

```tsx
<AuthKitProvider initialAuth={initialAuth}>
  <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
    {children}
  </ConvexProviderWithAuth>
</AuthKitProvider>
```

This prevents the POST on mount because `AuthKitProvider` already has the user data.

**Important**: This pattern still requires the proxy to be running. `withAuth()` in the server component layout checks for the `x-workos-middleware` header. Without the proxy, it throws.

---

## Debugging Checklist

When auth breaks, check in this order:

1. **Is the proxy running?** Look for `proxy.ts: Xms` in dev server logs.
2. **Is the file in the right place?** `src/proxy.ts` for `src/` directory apps, project root otherwise.
3. **Is the session cookie set?** Check browser cookies for `wos-session` on `localhost`.
4. **Is the proxy redirecting correctly?** Unauthenticated requests to protected routes should redirect to login.
5. **Is `withAuth()` succeeding?** Add temporary logging in the layout to check the return value.
6. **Is the Convex auth chain working?** See [convex-workos-auth](../convex-workos-auth/).

### Debug Mode

Enable in `src/proxy.ts`:

```ts
export default authkitMiddleware({ debug: true, ... });
```

This logs detailed proxy execution info to the Next.js server console. **Remove before committing.**

### Key Headers

| Header                 | Set By          | Read By      | Purpose                          |
| ---------------------- | --------------- | ------------ | -------------------------------- |
| `x-workos-middleware`  | Proxy           | `withAuth()` | Proves proxy ran on this request |
| `x-workos-session`     | Proxy           | `withAuth()` | Encrypted session data           |
| `wos-session` (cookie) | `saveSession()` | Proxy        | Session cookie (httpOnly, Lax)   |
