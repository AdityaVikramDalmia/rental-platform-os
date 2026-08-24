---
id: P01-E05
title: Admin Login Flow
phase: 1
status: done
depends_on: ["P01-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-16
---

# P01-E05: Admin Login Flow

## Overview

Implement the admin login experience end-to-end: a Google SSO login page, the OAuth callback route that exchanges codes for sessions, and a placeholder admin dashboard. Includes tests for the full admin auth flow.

## Task Queue

- [ ] P01-E05-T01: Create Admin Login Page
- [ ] P01-E05-T02: Create Auth Callback Route
- [ ] P01-E05-T03: Create Admin Dashboard Placeholder
- [ ] P01-E05-T04: Write Tests for Admin Login Flow

---

## T01: Create Admin Login Page

### Objective

A desktop-first admin login page with a single "Sign in with Google" button that redirects to WorkOS AuthKit hosted UI. No email/password form — admins only use Google SSO.

### Required Reading

- `notes/01-tech-stack.md` — "Login Pages" section (admin login flow)
- `notes/01-tech-stack.md` — "Authentication Architecture" section (AuthKit integration)

### Key Rules

1. Use `getSignInUrl()` from `@workos-inc/authkit-nextjs` to generate the redirect URL — this is a Server Component or Server Action call, NOT a client-side call.
2. No email/password form on this page. Admins ONLY use Google SSO via WorkOS AuthKit hosted UI.
3. No shared login page — guards never see Google SSO, admins never see phone+password (per `notes/01-tech-stack.md`).
4. The redirect URI must point to `/callback` (configured via `NEXT_PUBLIC_WORKOS_REDIRECT_URI` env var).
5. Desktop-first styling: centered card layout with Rental Platform OS admin branding, premium feel using shadcn/ui + Tailwind.

### Deliverables

- [ ] `src/app/(auth)/admin/login/page.tsx` — Admin login page with Google SSO button

### Acceptance Criteria

1. Page renders a centered card with Rental Platform OS branding and a "Sign in with Google" button.
2. Clicking the button redirects to WorkOS AuthKit hosted UI (via `getSignInUrl()`).
3. Page is desktop-first with clean, premium styling.
4. No email/password fields exist on the page.
5. TypeScript compiles clean.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on `src/app/(auth)/admin/login/page.tsx`.

### Out of Scope

- Guard login page (separate epic P01-E04)
- Auth callback handling (T02 in this epic)
- Admin auto-creation on first SSO login (handled by `user.created` webhook event in `convex/auth.ts`, part of P01-E03)
- Dark mode toggle

---

## T02: Create Auth Callback Route

### Objective

Handle the OAuth callback from WorkOS AuthKit. Exchange the authorization code for tokens, set the session cookie, and redirect the user to the appropriate dashboard based on user type.

### Required Reading

- `notes/01-tech-stack.md` — "Auth Callback" section
- `notes/01-tech-stack.md` — "Route Protection & Middleware" section

### Key Rules

1. Use `handleAuth()` from `@workos-inc/authkit-nextjs` to exchange the authorization code for tokens and create the session cookie.
2. The callback route handles GET requests at `/callback`.
3. This callback primarily serves the admin SSO flow. Guard login uses `saveSession()` directly in a Server Action (no redirect through `/callback`).
4. After `handleAuth()`, redirect to the appropriate dashboard:
   - If email ends with `@guards.local` → `/guard/dashboard` (guard synthetic email)
   - Otherwise → `/admin/dashboard`
5. On first admin SSO login, the `@convex-dev/workos-authkit` component auto-creates the WorkOS user record via webhook, and the `user.created` event handler in `convex/auth.ts` auto-creates the Convex `users` record.

### Deliverables

- [ ] `src/app/callback/route.ts` — OAuth callback route handler

### Acceptance Criteria

1. Route handles GET requests at `/callback`.
2. Uses `handleAuth()` to exchange code for tokens and set session.
3. Redirects to `/admin/dashboard` for non-`@guards.local` emails.
4. Redirects to `/guard/dashboard` for `@guards.local` emails (synthetic guard emails).
5. TypeScript compiles clean.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/callback/route.ts`.

### Out of Scope

- Guard login Server Action (separate epic P01-E04)
- Session refresh logic (handled by `@workos-inc/authkit-nextjs` middleware)
- Error page for failed auth attempts

---

## T03: Create Admin Dashboard Placeholder

### Objective

A placeholder admin dashboard page that displays the admin's basic information (name, email) and confirms successful authentication. Serves as the landing page after admin login.

### Required Reading

- `notes/01-tech-stack.md` — "Project Structure" section (admin routes under `(admin)/`)
- `notes/06-admin-panel-ux.md` — "Dashboard" section (for future reference on layout)

### Key Rules

1. Page lives under the `(admin)` route group: `src/app/(admin)/dashboard/page.tsx`.
2. Desktop-first layout — this is an admin panel page.
3. Display the admin's name and email from the authenticated user context.
4. Use `useQuery` with a Convex query to fetch the current user record (real-time).
5. Show role assignments if available (query `user_role_assignments` → `roles`).
6. Use shadcn/ui components for clean, premium styling.

### Deliverables

- [ ] `src/app/(admin)/dashboard/page.tsx` — Admin dashboard placeholder page

### Acceptance Criteria

1. Page displays "Admin Dashboard" heading.
2. Shows the authenticated admin's name and email.
3. Shows assigned role names (if role data is available; gracefully handles empty state).
4. Desktop-first responsive layout with premium styling.
5. Build succeeds without errors.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on `src/app/(admin)/dashboard/page.tsx`.

### Out of Scope

- Full analytics dashboard (Phase 12)
- Sidebar navigation (P01-E06 admin layout)
- Real KPI data or charts
- Role management UI

---

## T04: Write Tests for Admin Login Flow

### Objective

Test the critical paths of the admin login flow: the sign-in URL generation, the callback route handler, and the admin auto-creation via the `user.created` webhook event handler in `convex/auth.ts`.

### Required Reading

- `notes/11-convex-architecture.md` — "Testing Approach" section
- `notes/11-convex-architecture.md` — "AuthKit Component" section (`user.created` event handler)
- `notes/01-tech-stack.md` — "Admin Login Flow" section

### Key Rules

1. Use `convexTest` from `convex-test` with `withIdentity` for mocking admin auth identity.
2. Test the `user.created` event handler logic: when a non-`@guards.local` email is created, the handler should create a `users` record with `user_type: "ADMIN"`, `status: "ACTIVE"`, `must_change_password: false`.
3. Test that `getSignInUrl()` is called with correct parameters (mock `@workos-inc/authkit-nextjs`).
4. Test the callback route handler processes the auth response correctly (mock `handleAuth()`).
5. Seed test data for users and roles as needed.

### Deliverables

- [ ] `convex/auth.test.ts` — Tests for admin auto-creation via `user.created` event
- [ ] `src/app/(auth)/admin/login/__tests__/page.test.tsx` — Tests for admin login page
- [ ] `src/app/callback/__tests__/route.test.ts` — Tests for callback route handler

### Acceptance Criteria

1. Test: `user.created` event with non-`@guards.local` email creates `ADMIN` user record.
2. Test: `user.created` event with `@guards.local` email creates `GUARD` user record with `must_change_password: true`.
3. Test: `getSignInUrl()` is called when rendering the admin login page.
4. Test: callback route handler calls `handleAuth()` and redirects appropriately.
5. All tests pass.

### Verification

```bash
npm run test
```

### Out of Scope

- End-to-end browser tests (Playwright)
- Guard login flow tests (separate epic)
- WorkOS API integration tests (external service)
