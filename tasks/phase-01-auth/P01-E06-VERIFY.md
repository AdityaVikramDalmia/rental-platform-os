---
epic_id: P01-E06
title: "Auth Helpers + Route Protection Verification"
type: hybrid
status: pending
depends_on_epic: P01-E06
verified_at: null
failures: 0
---

# P01-E06 Verification: Auth Helpers + Route Protection

## Readiness Gates

- [ ] Epic frontmatter shows `status: done` in `tasks/phase-01-auth/P01-E06-auth-helpers-route-protection.md`
- [ ] Completion Summary exists and deviations are reviewed
- [ ] Dev server running: `npm run dev:force` (http://localhost:3000)
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Login helper page reachable: http://localhost:3000/dev/login
- [ ] Test admin account available: `admin@example.com` / `DevAdmin123!`
- [ ] Test guard account available: `9999999999@guards.local` / `DevGuard123!`
- [ ] Test data includes one banned guard and one inactive guard for helper/layout rejection checks

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests
npm run test -- convex/auth.helpers.test.ts
```

**Expected**: All commands exit 0. If the listed test file does not exist yet, note it in Results.

---

## Scenarios

### V01: Core Auth Helpers Enforce Auth, Role, and Status — AC Ref: T01-AC1, T01-AC2, T01-AC3, T01-AC4, T01-AC5, T01-AC6, T01-AC9

**Precondition**: Seeded users include admin, active guard, inactive guard, and banned guard variants.

**Actions**:

1. Invoke helper-backed test functions under unauthenticated context.
2. Invoke under banned user context.
3. Invoke `requireGuard` under admin and inactive guard contexts.
4. Invoke `requireAdmin` under guard context.
5. Run TypeScript check for helper typings.

**Assert**:

- [ ] `getAuthenticatedUser` returns `null` when no identity exists.
- [ ] `getAuthenticatedUser` returns user record when identity exists.
- [ ] `requireAuth` throws for unauthenticated and banned users.
- [ ] `requireGuard` throws for non-guard and inactive guard users.
- [ ] `requireAdmin` throws for non-admin users without extra admin-status rejection logic.
- [ ] Helper typing works for `QueryCtx | MutationCtx`.

**Evidence**: test output + terminal output

---

### V02: Permission Helper Unions Active Assignments and Raises Exact Error — AC Ref: T01-AC7, T01-AC8

**Precondition**: Admin user has multiple role assignments, including one soft-deleted assignment.

**Actions**:

1. Assign two roles to admin where required permission appears only in second role.
2. Mark one assignment soft-deleted and retry permission checks.
3. Invoke `requirePermission` for a missing permission.

**Assert**:

- [ ] Permissions are unioned across active assignments.
- [ ] Soft-deleted assignments are ignored.
- [ ] Missing permission throws exact message format `Missing permission: X`.

**Evidence**: test output

---

### V03: Middleware Protects Routes and Leaves Public Paths Open — AC Ref: T02-AC1, T02-AC2, T02-AC3, T02-AC4, T02-AC5, T02-AC6, T02-AC7

**Precondition**: `middleware.ts` is active in Next runtime.

**Actions**:

1. Visit protected paths while logged out: `/guard/dashboard`, `/admin/dashboard`.
2. Visit public paths while logged out: `/`, `/listing/sample-slug`.
3. Inspect middleware config (`authkitMiddleware`, `unauthenticatedPaths`, matcher regex).
4. Run `npm run build`.

**Assert**:

- [ ] Middleware default export is `authkitMiddleware()`.
- [ ] `middlewareAuth.enabled` is true.
- [ ] All required unauthenticated paths are configured.
- [ ] Static file exclusions are configured in matcher regex.
- [ ] Protected routes redirect unauthenticated users to login.
- [ ] Public routes remain accessible without auth.
- [ ] Build succeeds.

**Evidence**: screenshot + network + file snapshot

---

### V04: Guard Layout Enforces Guard-Only Access + Password Gate — AC Ref: T03-AC1, T03-AC2, T03-AC3, T03-AC4, T03-AC5, T03-AC6, T03-AC7

**Precondition**: Test accounts include active guard, admin, banned guard, and guard with `must_change_password: true`.

**Actions**:

1. Access guarded pages as logged-out user.
2. Access guarded pages as admin.
3. Access guarded pages as banned guard.
4. Access guarded pages as guard flagged for password change (non-change-password route).
5. Inspect bottom navigation rendering and touch-target layout.
6. Run build.

**Assert**:

- [ ] Unauthenticated users are redirected to `/guard/login`.
- [ ] Admin users are redirected to `/guard/login`.
- [ ] Banned guard users are redirected with banned indicator.
- [ ] Guards with `must_change_password` are redirected to `/guard/change-password` except on that route.
- [ ] Bottom nav renders 5 required items.
- [ ] Mobile-first touch-target requirements are satisfied.
- [ ] Build succeeds.

**Evidence**: screenshot series + network

---

### V05: Admin Layout Enforces Admin-Only Access + Sidebar Contract — AC Ref: T04-AC1, T04-AC2, T04-AC3, T04-AC4, T04-AC5, T04-AC6, T04-AC7

**Precondition**: Active admin and guard sessions available.

**Actions**:

1. Access `/admin/dashboard` as logged-out user.
2. Access `/admin/dashboard` as guard.
3. Access `/admin/dashboard` as admin.
4. Inspect sidebar item list and active-route styling.
5. Toggle sidebar collapse/expand and observe animation.
6. Run build.

**Assert**:

- [ ] Unauthenticated users are redirected to `/admin/login`.
- [ ] Guard users are redirected to `/admin/login`.
- [ ] Sidebar renders all 13 required navigation items.
- [ ] Active route highlight is visible.
- [ ] Sidebar collapse animation works.
- [ ] Desktop-first responsive behavior is intact.
- [ ] Build succeeds.

**Evidence**: screenshot + video/gif capture

---

### V06: Auth Helper Automated Tests Cover Happy + Error Paths — AC Ref: T05-AC1, T05-AC2, T05-AC3, T05-AC4, T05-AC5, T05-AC6, T05-AC7, T05-AC8, T05-AC9, T05-AC10, T05-AC11

**Precondition**: `convex/auth.helpers.test.ts` exists.

**Actions**:

1. Run targeted helper test suite.
2. Inspect tests for unauthenticated, banned, role mismatch, inactive guard, and missing permission errors.
3. Inspect tests for permission success and soft-delete filtering.

**Assert**:

- [ ] Test coverage includes all helper functions and required failure messages.
- [ ] `requirePermission` pass/fail scenarios are covered.
- [ ] Soft-deleted assignment behavior is asserted.
- [ ] Entire helper suite passes.

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
| V06 | pending | —        | —     |

---

## Failure Reports
