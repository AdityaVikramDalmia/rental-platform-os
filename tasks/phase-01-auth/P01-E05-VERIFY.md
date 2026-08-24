---
epic_id: P01-E05
title: "Admin Login Flow Verification"
type: browser
status: pending
depends_on_epic: P01-E05
verified_at: null
failures: 0
---

# P01-E05 Verification: Admin Login Flow

## Readiness Gates

- [ ] Epic frontmatter shows `status: done` in `tasks/phase-01-auth/P01-E05-admin-login.md`
- [ ] Completion Summary exists and deviations are reviewed
- [ ] Dev server running: `npm run dev:force` (http://localhost:3000)
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Login helper page reachable: http://localhost:3000/dev/login
- [ ] Test admin account available: `admin@example.com` / `DevAdmin123!`
- [ ] Test guard account available for callback branch checks: `9999999999@guards.local` / `DevGuard123!`
- [ ] WorkOS Google SSO is configured with callback URL `http://localhost:3000/callback`

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests
npm run test -- convex/auth.test.ts src/app/(auth)/admin/login/__tests__/page.test.tsx src/app/callback/__tests__/route.test.ts
```

**Expected**: All commands exit 0. If a listed test file does not exist yet, note it in Results.

---

## Scenarios

### V01: Admin Login Page UI Is SSO-Only and Desktop-First — AC Ref: T01-AC1, T01-AC3, T01-AC4

**Precondition**: Logged out browser session.

**Actions**:

1. Navigate to `/admin/login`.
2. Inspect page layout and branding card.
3. Search page for email/password inputs.
4. Resize viewport to desktop and tablet widths.

**Assert**:

- [ ] Page shows centered branded admin login card.
- [ ] Desktop-first styling and spacing are intact.
- [ ] No email/password fields are rendered.

**Evidence**: screenshot + DOM snapshot

---

### V02: Sign-In Button Uses WorkOS Hosted Auth URL — AC Ref: T01-AC2, T01-AC5

**Precondition**: `/admin/login` loaded in logged-out state.

**Actions**:

1. Click "Sign in with Google".
2. Track redirect request generation and destination.
3. Verify server-side URL generation path uses `getSignInUrl()`.

**Assert**:

- [ ] Button triggers redirect to WorkOS hosted AuthKit UI.
- [ ] Redirect URL is generated via `getSignInUrl()`.
- [ ] TypeScript/build integrity remains clean for the login page.

**Evidence**: network + screenshot

---

### V03: Callback Route Exchanges Session and Branches by User Type — AC Ref: T02-AC1, T02-AC2, T02-AC3, T02-AC4, T02-AC5

**Precondition**: Callback endpoint is deployed locally at `/callback`; test cases for admin and guard emails are available.

**Actions**:

1. Trigger callback with non-`@guards.local` account flow.
2. Trigger callback with `@guards.local` account flow.
3. Inspect route handler for `handleAuth()` invocation.
4. Confirm session cookie is set and redirect target is applied.

**Assert**:

- [ ] Route handles GET requests at `/callback`.
- [ ] `handleAuth()` is used to exchange auth code and create session.
- [ ] Non-synthetic email redirects to `/admin/dashboard`.
- [ ] Synthetic email redirects to `/guard/dashboard`.
- [ ] TypeScript compiles cleanly for callback route.

**Evidence**: network + cookie + screenshot

---

### V04: Admin Dashboard Placeholder Shows Authenticated Context — AC Ref: T03-AC1, T03-AC2, T03-AC3, T03-AC4, T03-AC5

**Precondition**: Authenticated admin session.

**Actions**:

1. Navigate to `/admin/dashboard`.
2. Verify heading and admin identity block.
3. Confirm role section renders assigned roles or empty-state fallback.
4. Check desktop layout responsiveness.
5. Run `npm run build` for page stability.

**Assert**:

- [ ] "Admin Dashboard" heading is visible.
- [ ] Authenticated admin name/email are shown.
- [ ] Assigned role names render when present, with graceful empty state.
- [ ] Desktop-first responsive layout is intact.
- [ ] Build succeeds.

**Evidence**: screenshot + terminal output

---

### V05: Automated Admin Auth Tests Cover SSO + User Sync — AC Ref: T04-AC1, T04-AC2, T04-AC3, T04-AC4, T04-AC5

**Precondition**: Test files from T04 are present.

**Actions**:

1. Run targeted tests for `convex/auth.test.ts` and callback/login tests.
2. Confirm `user.created` coverage for admin and guard email patterns.
3. Confirm `getSignInUrl()` invocation is asserted in login page test.
4. Confirm callback test asserts `handleAuth()` call and redirect decisions.

**Assert**:

- [ ] Non-`@guards.local` `user.created` test creates `ADMIN` user.
- [ ] `@guards.local` `user.created` test creates `GUARD` user with `must_change_password: true`.
- [ ] Admin login page test verifies `getSignInUrl()` call path.
- [ ] Callback test verifies `handleAuth()` + redirect branch behavior.
- [ ] All tests pass.

**Evidence**: test output

---

## Results

| ID  | Status  | Evidence | Notes |
| --- | ------- | -------- | ----- |
| V01 | pending | —        | —     |
| V02 | pending | —        | —     |
| V03 | pending | —        | —     |
| V04 | pending | —        | —     |
| V05 | pending | —        | —     |

---

## Failure Reports
