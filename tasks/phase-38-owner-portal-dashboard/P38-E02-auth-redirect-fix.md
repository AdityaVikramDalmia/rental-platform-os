---
id: P38-E02
title: Auth Redirect Fix
phase: 38
status: pending
depends_on: []
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-19
---

# P38-E02: Auth Redirect Fix

## Overview

Replace the current callback redirect heuristic (email-domain based) with a server-side post-auth resolver that routes users from real Convex role state. This closes the production bug where non-synthetic Google SSO users are forced to `/admin/dashboard` and introduces fallback handling for first-time tenant/owner SSO misclassification.

## Prerequisites

- Current callback flow is implemented in `src/app/callback/route.ts` + `src/app/callback/redirect.ts`.
- User identity creation behavior in `convex/auth.ts` currently defaults non-synthetic users to `ADMIN` (`userType = ... : "ADMIN"`), which must be treated as a known edge case by resolver logic.
- Portal destination matrix is now strict: GUARD -> `/guard/dashboard`, OPS -> `/admin/dashboard`, ADMIN -> `/admin/dashboard`, TENANT -> `/tenant/dashboard`, OWNER -> `/owner/dashboard`.

## Task Queue

- [ ] P38-E02-T01: Add backend post-auth destination resolver query with fallback heuristics
- [ ] P38-E02-T02: Create server-side `/post-auth` route resolver page
- [ ] P38-E02-T03: Rewire callback flow to `/post-auth` and update redirect tests/docs

---

## T01: Add Backend Post-Auth Destination Resolver Query with Fallback Heuristics

### Objective

Introduce a single query API that determines final post-login destination from authenticated Convex user state and resilient fallbacks, replacing fragile email-suffix routing.

### Required Reading

- `src/app/callback/redirect.ts` - existing domain-based mapping to replace
- `src/app/callback/route.ts` - callback response-location rewrite path
- `convex/users.ts` - current `getCurrentUser` auth lookup behavior
- `convex/auth.ts` - `handleUserCreated` default admin assignment for non-synthetic emails
- `convex/schema.ts` - `owners.by_user_id`, `owners.by_email`, and `tenant_profiles.by_user_id` indexes
- `notes/features/23-ops-admin-access.md` - known callback heuristic limitations

### Key Rules

> **Dev Mode**: In development, owners can authenticate via `/dev/login` (bypasses WorkOS SSO). The redirect logic must still work correctly when auth originates from `/dev/login`.

1. Add `resolvePostAuthDestination` query in `convex/users.ts` with signature:
   - `args: {}`
   - return shape:
     - `pathname: string`
     - `resolved_user_type: "GUARD" | "OPS" | "ADMIN" | "TENANT" | "OWNER"`
     - `reason: string`
2. Query must authenticate through existing helper flow and return deterministic mapping:
   - GUARD -> `/guard/dashboard`
   - OPS -> `/admin/dashboard`
   - ADMIN -> `/admin/dashboard`
   - TENANT -> `/tenant/dashboard`
   - OWNER -> `/owner/dashboard`
3. Implement Oracle fallback for default-admin misclassification:
   - If `user_type === "ADMIN"`, check owner/tenant linkage before finalizing admin destination.
   - Owner fallback signal: owner row linked by `owners.by_user_id` OR owner row found by `owners.by_email` matching user email.
   - Tenant fallback signal: `tenant_profiles.by_user_id` exists for the same user.
   - If owner signal is true -> route owner dashboard.
   - Else if tenant signal is true -> route tenant dashboard.
   - Else route admin dashboard.
4. Fallback must not mutate records. This query is read-only routing logic.
5. If authenticated user is missing/inactive, return safe login destination (`/admin/login`) with explicit reason rather than throwing raw errors.

### Deliverables

- [ ] `convex/users.ts` - `resolvePostAuthDestination` query with owner/tenant fallback heuristics

### Acceptance Criteria

1. A single query returns role-resolved destination path for all 5 user types.
2. Misclassified owner/tenant users currently marked as ADMIN are redirected using fallback linkage rules.
3. Query has no side effects and does not patch user data.
4. Query is callable from server components via `fetchQuery`.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/users.ts`.

### Out of Scope

- Changing `convex/auth.ts` user creation defaults
- Owner/tenant onboarding mutation flows
- Portal page implementations

---

## T02: Create Server-Side `/post-auth` Route Resolver Page

### Objective

Create a dedicated server route that executes immediately after WorkOS callback and redirects users using the new Convex destination resolver query.

### Required Reading

- `src/app/(owner)/layout.tsx` - current server auth + fetchQuery pattern with `withAuth`
- `src/app/(admin)/layout.tsx` - server layout auth wrapper conventions
- `src/proxy.ts` - middleware route handling and unauthenticated path list
- `convex/_generated/api.ts` - query import path for `api.users.resolvePostAuthDestination`

### Key Rules

1. Create new route file `src/app/post-auth/page.tsx` as a server component.
2. Use `withAuth()` to obtain session/access token and call `fetchQuery(api.users.resolvePostAuthDestination, {}, { token })`.
3. Immediately redirect using Next.js `redirect()` to `pathname` returned by resolver query.
4. Do not duplicate role logic in page code; page is a thin adapter over backend query.
5. If no token/session exists, redirect to `/admin/login`.
6. Keep `/post-auth` URL path stable and role-agnostic so callback can always target one route.

### Deliverables

- [ ] `src/app/post-auth/page.tsx` - server resolver page for post-login role-based redirects

### Acceptance Criteria

1. Visiting `/post-auth` with an authenticated session always redirects to role-correct dashboard path.
2. `/post-auth` has no static UI surface and acts only as resolver/redirect route.
3. Unauthenticated access to `/post-auth` redirects to login.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` reports no errors on `src/app/post-auth/page.tsx`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/post-auth/page.tsx`.

### Out of Scope

- Callback route rewrite
- Legacy redirect utility cleanup
- Owner portal shell/navigation work

---

## T03: Rewire Callback Flow to `/post-auth` and Update Redirect Tests/Docs

### Objective

Complete migration from email-based callback routing to resolver-based routing by updating callback handler behavior, replacing obsolete redirect helpers, and aligning tests/documentation.

### Required Reading

- `src/app/callback/route.ts` - callback response interception currently using `getPostAuthDashboardPathname(user.email)`
- `src/app/callback/redirect.ts` - legacy domain constants and helper function
- `src/app/callback/__tests__/route.test.ts` - outdated email-domain unit tests
- `notes/features/23-ops-admin-access.md` - callback redirect behavior table requiring update

### Key Rules

1. Update `src/app/callback/route.ts` so callback response `location` always rewrites to `/post-auth` after successful AuthKit session creation.
2. Replace deprecated email-domain helper in `src/app/callback/redirect.ts` with a minimal constant-based helper for the resolver route (for example `POST_AUTH_PATHNAME = "/post-auth"`).
3. Remove old assumptions that non-synthetic emails imply admin destination.
4. Update callback tests in `src/app/callback/__tests__/route.test.ts` to validate resolver-route rewrite behavior instead of domain-matching outcomes.
5. Update docs that describe callback redirect logic to reflect resolver-based routing and fallback heuristics.
6. Maintain callback stability: do not change WorkOS SDK invocation sequence or session establishment.

### Deliverables

- [ ] `src/app/callback/route.ts` - callback redirect target changed to `/post-auth`
- [ ] `src/app/callback/redirect.ts` - legacy domain helper replaced with post-auth route constant/helper
- [ ] `src/app/callback/__tests__/route.test.ts` - tests updated for resolver-route behavior
- [ ] `notes/features/23-ops-admin-access.md` - callback redirect section updated to resolver model

### Acceptance Criteria

1. Callback no longer decides destination from email domain.
2. Callback always lands on `/post-auth`, which then resolves final destination.
3. Unit tests no longer assert old domain-based redirect outcomes.
4. Documentation reflects role-query-based routing and known fallback behavior.
5. `npx tsc --noEmit`, `npm run build`, and callback tests pass.

### Verification

```bash
npx tsc --noEmit
npm run build
npm run test -- src/app/callback/__tests__/route.test.ts
```

Run `lsp_diagnostics` on `src/app/callback/route.ts`, `src/app/callback/redirect.ts`, and `src/app/callback/__tests__/route.test.ts`.

### Out of Scope

- Introducing tenant or owner login pages
- Reworking WorkOS webhook user typing logic in `convex/auth.ts`
- Shared portal shell implementation
