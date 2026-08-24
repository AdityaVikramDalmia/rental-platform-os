---
id: P01-E06
title: Auth Helpers + Route Protection
phase: 1
status: done
depends_on: ["P01-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-16
---

# P01-E06: Auth Helpers + Route Protection

## Overview

Implement the Convex auth helper functions (`requireGuard`, `requireAdmin`, `requirePermission`), the Next.js middleware for session-based route protection, and the guard/admin layout components that enforce role-based access with real-time user checks.

## Task Queue

- [ ] P01-E06-T01: Create convex/auth.helpers.ts
- [ ] P01-E06-T02: Create middleware.ts (Route Protection)
- [ ] P01-E06-T03: Create Guard Layout with Auth Check
- [ ] P01-E06-T04: Create Admin Layout with Auth Check
- [ ] P01-E06-T05: Write Tests for Auth Helpers

---

## T01: Create convex/auth.helpers.ts

### Objective

Implement all auth helper functions that every Convex mutation and query uses to enforce authentication and authorization. These helpers are the single enforcement point for auth across the entire backend.

### Required Reading

- `notes/11-convex-architecture.md` — "Auth Helper Layer" section (exact code pattern)
- `notes/03-roles-and-permissions.md` — "Permission Check Pattern" section (RBAC flow)
- `notes/01-tech-stack.md` — "Auth Helpers" section (function descriptions)

### Key Rules

1. `getAuthenticatedUser(ctx)`: Uses `authKit.getAuthUser(ctx)` from `convex/auth.ts` to get the WorkOS user, then looks up the `users` table by `workos_user_id` using the `by_workos_user_id` index. Returns the Convex user record or `null`.
2. `requireAuth(ctx)`: Calls `getAuthenticatedUser()`, throws `"Not authenticated"` if null, throws `"Account banned"` if `status === "BANNED"`. Returns the user record.
3. `requireGuard(ctx)`: Calls `requireAuth()`, throws `"Guard access required"` if `user_type !== "GUARD"`, throws `"Guard account not active"` if `status !== "ACTIVE"`. Returns the user record.
4. `requireAdmin(ctx)`: Calls `requireAuth()`, throws `"Admin access required"` if `user_type !== "ADMIN"`. No additional status check — admins are removed, not banned.
5. `requirePermission(ctx, permission)`: Calls `requireAdmin()`, fetches `user_role_assignments` by `by_user_id` index, filters `is_deleted !== true`, loads all linked `roles` via `ctx.db.get()`, unions all `permissions` arrays, throws `"Missing permission: {permission}"` if not found. Returns the user record.
6. Accept `QueryCtx | MutationCtx` as the context type for all helpers — they work in both queries and mutations.
7. Import `authKit` from `./auth` — NOT from `@convex-dev/workos-authkit` directly.

### Deliverables

- [ ] `convex/auth.helpers.ts` — All five auth helper functions exported

### Acceptance Criteria

1. `getAuthenticatedUser` returns `null` when no auth identity is present.
2. `getAuthenticatedUser` returns the `users` table record when authenticated.
3. `requireAuth` throws for unauthenticated users.
4. `requireAuth` throws for `BANNED` users.
5. `requireGuard` throws for non-`GUARD` users and for `INACTIVE` guards.
6. `requireAdmin` throws for non-`ADMIN` users but does NOT throw for any admin status.
7. `requirePermission` correctly unions permissions from all assigned roles (filtering soft-deleted assignments).
8. `requirePermission` throws with the exact missing permission string in the error message.
9. TypeScript compiles clean with proper `QueryCtx | MutationCtx` typing.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/auth.helpers.ts`.

### Out of Scope

- The `authKit` instance itself (created in `convex/auth.ts`, part of P01-E03)
- Convex Actions auth (Actions use `ctx.auth` directly, not these helpers)
- Rate limiting checks (separate from auth)

---

## T02: Create middleware.ts (Route Protection)

### Objective

Set up Next.js middleware using WorkOS AuthKit to protect all routes except public paths. The middleware handles session management and token refresh — role-based checks happen in layouts, not here.

### Required Reading

- `notes/01-tech-stack.md` — "Route Protection & Middleware" section (exact middleware config)
- `notes/01-tech-stack.md` — "Session Management" section (30-day sessions, token refresh)

### Key Rules

1. Use `authkitMiddleware()` from `@workos-inc/authkit-nextjs` as the default export.
2. Set `middlewareAuth.enabled: true` — enforces auth on all routes not in `unauthenticatedPaths`.
3. Configure `unauthenticatedPaths` to include: `'/'`, `'/guard/login'`, `'/admin/login'`, `'/callback'`, `'/listing/(.*)'`.
4. Set the `matcher` config to exclude static files: `'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'`.
5. Middleware ONLY ensures a valid session exists for protected paths. Role-level checks (guard vs admin) happen in LAYOUTS, not middleware.
6. The middleware file must be at the project root: `middleware.ts` (not inside `src/`).

### Deliverables

- [ ] `middleware.ts` — WorkOS AuthKit middleware at project root

### Acceptance Criteria

1. File exports `authkitMiddleware()` as default export.
2. `middlewareAuth.enabled` is `true`.
3. All five unauthenticated paths are configured correctly.
4. `config.matcher` excludes static files with the correct regex.
5. Unauthenticated users accessing `/guard/dashboard` or `/admin/dashboard` are redirected to login.
6. Public paths (`/`, `/listing/any-slug`) are accessible without authentication.
7. Build succeeds without errors.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on `middleware.ts`.

### Out of Scope

- Role-based route checks (done in layouts, T03 and T04)
- `must_change_password` redirect (done in guard layout, T03)
- Custom error pages for auth failures

---

## T03: Create Guard Layout with Auth Check

### Objective

Create the guard portal layout that wraps all `(guard)` routes. Enforces guard-only access, checks ban status and `must_change_password` flag in real-time via Convex subscription, and provides mobile-first navigation.

### Required Reading

- `notes/01-tech-stack.md` — "Route Protection & Middleware" section ("Post-auth route checking" subsection)
- `notes/05-guard-portal-ux.md` — "Navigation" section (bottom nav structure)
- `notes/01-tech-stack.md` — "Guard Login" section (`must_change_password` gate)

### Key Rules

1. Use a Convex `useQuery` to fetch the current user record — this is REAL-TIME, so ban takes effect immediately without page refresh.
2. If not authenticated or `user_type !== "GUARD"` → redirect to `/guard/login`.
3. If `status === "BANNED"` → redirect to `/guard/login` with an error message (e.g., `?error=banned`).
4. If `must_change_password === true` AND current route is NOT `/guard/change-password` → redirect to `/guard/change-password`. This check must run on EVERY render, not just first load.
5. Mobile-first layout: minimal header with Rental Platform OS logo at top.
6. Bottom navigation bar with 5 items: Dashboard, Submit Lead, My Leads, Visits, Profile. Most items are placeholders in Phase 1 — only Dashboard and Profile active.
7. Touch targets: minimum 44x44px. Font: minimum 16px body.
8. Use `"use client"` directive — this component needs hooks for auth and navigation.

### Deliverables

- [ ] `src/app/(guard)/layout.tsx` — Guard portal layout with auth check and bottom nav

### Acceptance Criteria

1. Unauthenticated users are redirected to `/guard/login`.
2. Non-guard users (admins) are redirected to `/guard/login`.
3. Banned guards are redirected to `/guard/login` with error indicator.
4. Guards with `must_change_password === true` are redirected to `/guard/change-password` (except when already on that route).
5. Bottom nav renders with 5 items: Dashboard, Submit Lead, My Leads, Visits, Profile.
6. Layout is mobile-first with proper touch targets (44x44px minimum).
7. Build succeeds without errors.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on `src/app/(guard)/layout.tsx`.

### Out of Scope

- Sticky rule banner (Phase 11 — quality controls)
- i18n / language selector (Phase 14)
- Guard change-password page (separate epic P01-E04)
- Full navigation routing to lead/visit pages (those pages don't exist yet)

---

## T04: Create Admin Layout with Auth Check

### Objective

Create the admin panel layout that wraps all `(admin)` routes. Enforces admin-only access via real-time Convex subscription and provides a desktop-first sidebar navigation with collapsible sections.

### Required Reading

- `notes/01-tech-stack.md` — "Route Protection & Middleware" section ("Post-auth route checking" subsection)
- `notes/06-admin-panel-ux.md` — "Navigation" section (sidebar structure)

### Key Rules

1. Use a Convex `useQuery` to fetch the current user record — REAL-TIME so deactivation takes effect immediately.
2. If not authenticated or `user_type !== "ADMIN"` → redirect to `/admin/login`.
3. Admin layout does NOT check `must_change_password` — admins use Google SSO, no password to change.
4. Desktop-first layout with a left sidebar that is collapsible.
5. Sidebar navigation sections: Dashboard, Societies, Guards, Leads, Verification, Listings, Visits, Closures, Payouts, Incentives, Roles, Audit, Settings.
6. In Phase 1, only Dashboard, Roles, and Settings nav items link to real pages. All others are visible but link to placeholder routes or are disabled.
7. Premium styling: clean sidebar with hover states, active route indicator, smooth collapse animation.
8. Use `"use client"` directive — needs hooks for auth, navigation, and sidebar state.

### Deliverables

- [ ] `src/app/(admin)/layout.tsx` — Admin panel layout with auth check and sidebar nav

### Acceptance Criteria

1. Unauthenticated users are redirected to `/admin/login`.
2. Non-admin users (guards) are redirected to `/admin/login`.
3. Sidebar renders all 13 navigation items.
4. Active route is visually highlighted in the sidebar.
5. Sidebar is collapsible with smooth animation.
6. Layout is desktop-first with responsive breakpoints.
7. Build succeeds without errors.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on `src/app/(admin)/layout.tsx`.

### Out of Scope

- RBAC-based nav item visibility (nav items hidden by permission — future enhancement)
- Admin profile page
- System settings page content (just the route placeholder)
- Mobile responsive admin layout (admin panel is desktop-first; mobile is secondary)

---

## T05: Write Tests for Auth Helpers

### Objective

Comprehensive unit tests for all five auth helper functions in `convex/auth.helpers.ts`. Tests must cover the happy paths and all error/rejection scenarios using `convex-test` with mocked auth identities.

### Required Reading

- `notes/11-convex-architecture.md` — "Testing Approach" section (convexTest pattern)
- `notes/11-convex-architecture.md` — "Auth Helper Layer" section (exact helper behavior)
- `notes/03-roles-and-permissions.md` — "Permission Definitions" section (permission strings for test data)

### Key Rules

1. Use `convexTest` from `convex-test` with `withIdentity` to mock WorkOS auth identities (set `subject` to `workos_user_id` and `issuer` to match auth.config.ts providers).
2. Seed test data: create `users` records with varying `user_type` and `status`, create `roles` with specific `permissions` arrays, create `user_role_assignments` linking users to roles.
3. Test `getAuthenticatedUser` returns `null` when no identity is present (no `withIdentity` call).
4. Test `getAuthenticatedUser` returns the correct user record when identity is present and user exists.
5. Test `requireAuth` throws `"Not authenticated"` for unauthenticated requests.
6. Test `requireAuth` throws `"Account banned"` for `BANNED` users.
7. Test `requireGuard` throws `"Guard access required"` for `ADMIN` users.
8. Test `requireGuard` throws `"Guard account not active"` for `INACTIVE` guards.
9. Test `requireAdmin` throws `"Admin access required"` for `GUARD` users.
10. Test `requirePermission` throws `"Missing permission: X"` when permission not in any assigned role.
11. Test `requirePermission` succeeds when permission exists in at least one assigned role.
12. Test `requirePermission` correctly handles multiple roles — permission in second role should still pass.
13. Test `requirePermission` filters out soft-deleted `user_role_assignments` (assignments with `is_deleted: true` should be ignored).

### Deliverables

- [ ] `convex/auth.helpers.test.ts` — Comprehensive auth helper tests

### Acceptance Criteria

1. Test: `getAuthenticatedUser` returns `null` when not authenticated.
2. Test: `getAuthenticatedUser` returns user record when authenticated.
3. Test: `requireAuth` throws for unauthenticated users.
4. Test: `requireAuth` throws for `BANNED` users.
5. Test: `requireGuard` throws for non-`GUARD` users.
6. Test: `requireGuard` throws for `INACTIVE` guards.
7. Test: `requireAdmin` throws for non-`ADMIN` users.
8. Test: `requirePermission` throws when permission not in any assigned role.
9. Test: `requirePermission` succeeds when permission exists in an assigned role.
10. Test: `requirePermission` ignores soft-deleted role assignments.
11. All tests pass.

### Verification

```bash
npm run test
```

### Out of Scope

- Integration tests with actual WorkOS API
- Frontend layout component tests (tested separately or via E2E)
- Middleware tests (middleware is a thin wrapper around `authkitMiddleware`)
- Performance/load testing of permission lookups
