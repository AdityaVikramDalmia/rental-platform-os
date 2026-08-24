# Convex + WorkOS Authentication Chain

**Date**: 2026-02-17
**Stack**: Convex (local dev), WorkOS AuthKit, `@convex-dev/workos-authkit` component
**Time to diagnose**: ~1 hour (after proxy fix)

## Problem: Convex queries return null for authenticated users

### Symptom

After fixing the proxy (see [workos-authkit-nextjs16](../workos-authkit-nextjs16/)):

- WorkOS session is valid (cookie set, proxy lets requests through)
- `withAuth()` in server components succeeds
- But Convex `getCurrentUser` query returns `null`
- Client-side code redirects to login page

### The Auth Chain (6 steps)

```
Browser → WorkOS Proxy → Next.js Layout → AuthKitProvider → Convex Client → Convex Backend
   1           2              3                4                 5               6
```

1. **Browser**: Has `wos-session` cookie
2. **Proxy** (`src/proxy.ts`): Decrypts cookie, sets `x-workos-middleware` + `x-workos-session` headers
3. **Layout** (server component): `withAuth()` reads headers, returns `{ user, accessToken, ... }`
4. **AuthKitProvider**: Receives `initialAuth` (user without accessToken). `useAuth()` returns user, `getAccessToken()` fetches JWT via server action.
5. **Convex Client**: `useAuthFromAuthKit` hook sends JWT to Convex backend
6. **Convex Backend**: Verifies JWT against WorkOS JWKS, establishes identity, runs queries

### Root Cause

The failure was at step 6. The `@convex-dev/workos-authkit` component (`authKit.getAuthUser(ctx)`) resolves users from its own internal table (`workOSAuthKit/users`). In local dev without webhook delivery, this table is **empty**.

```ts
// BROKEN — depends on component's internal user store being populated via webhooks
const authUser = await authKit.getAuthUser(ctx);
// authUser is null because workOSAuthKit/users table is empty in local dev
```

### The Fix

Use Convex's built-in `ctx.auth.getUserIdentity()` which reads directly from the JWT — no component table needed:

```ts
// convex/auth.helpers.ts — WORKING
export async function getAuthenticatedUser(ctx: AuthContext): Promise<UserDoc | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // identity.subject is the WorkOS user ID (e.g. "user_01KHKWN7...")
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", identity.subject))
    .unique();

  return user;
}
```

### Why `ctx.auth.getUserIdentity()` Works

The JWT from WorkOS has a `sub` (subject) claim containing the WorkOS user ID. Convex verifies the JWT against WorkOS JWKS (configured in `convex/auth.config.ts`) and exposes the claims via `getUserIdentity()`. No component table lookup needed.

```ts
// convex/auth.config.ts — JWT verification config
export default {
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
  ],
};
```

Two providers because WorkOS uses different issuers for SSO vs password auth.

### When `authKit.getAuthUser()` Would Work

It requires the `@convex-dev/workos-authkit` component's user table to be populated. This happens via:

- WorkOS webhook events (`user.created`, `user.updated`) delivered to your HTTP endpoint
- The component syncing user data from these webhooks

In production with webhooks configured, `authKit.getAuthUser()` would work. But in local dev (no webhook delivery), the table stays empty.

### Impact on Tests

Test files use `authKit.getAuthUser` only for type extraction:

```ts
type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;
```

These are compile-time only and tests mock auth anyway, so no test changes needed.

### Debugging Checklist

When Convex auth fails after login:

1. **Is Convex backend running?** `curl http://127.0.0.1:3210` should return 200.
2. **Is the JWT reaching Convex?** Add `console.log(await ctx.auth.getUserIdentity())` in a query to check.
3. **Is the identity resolving?** `identity.subject` should be a WorkOS user ID like `user_01KHKWN7...`.
4. **Does the user exist in the DB?** Check `users` table for matching `workos_user_id`.
5. **Is the auth config correct?** `convex/auth.config.ts` must have the right JWKS URL and issuer.

### Key Insight

```
authKit.getAuthUser(ctx)  → Needs webhook-synced component table (empty in local dev)
ctx.auth.getUserIdentity() → Reads directly from JWT claims (always works if JWT is valid)
```

Use `ctx.auth.getUserIdentity()` as the primary auth mechanism. Treat the AuthKit component as optional enrichment.
