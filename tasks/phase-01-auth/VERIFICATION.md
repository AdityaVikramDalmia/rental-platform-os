---
phase: 1
title: "Phase 1: Auth + Accounts + RBAC - Integration Verification"
status: pending
depends_on:
  - P01-E01
  - P01-E02
  - P01-E03
  - P01-E04
  - P01-E05
  - P01-E06
  - P01-E07
  - P01-E08
verified_at: null
failures: 0
---

# Phase 1 Integration Verification: Auth + Accounts + RBAC

## Readiness Gates

- [ ] ALL epic VERIFY files (`P01-E01-VERIFY.md` through `P01-E08-VERIFY.md`) have `status: pass`
- [ ] Dev server running: `npm run dev:force` -> http://localhost:3000
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Full build passes: `npm run build`
- [ ] All tests pass: `npm run test`
- [ ] Login helper page reachable: http://localhost:3000/dev/login
- [ ] Test admin account available: `admin@example.com` / `DevAdmin123!`
- [ ] Test guard account available: `9999999999@guards.local` / `DevGuard123!`

**STOP if any epic VERIFY file is not `pass`.** Fix epic-level failures first.

---

## Integration Scenarios

### I01: Guard Login to Guard Dashboard Happy Path

**Epics Involved**: P01-E03, P01-E04, P01-E06, P01-E08
**Persona**: Guard

**Flow**:

1. Open `/guard/login` and submit valid guard credentials (`9999999999` / `DevGuard123!`).
2. Verify server action maps phone -> synthetic email and creates AuthKit session.
3. Pass middleware and guard layout checks.
4. Land on `/guard/dashboard` and load current guard data.

**Assert**:

- [ ] Guard can log in with phone + password and reach dashboard.
- [ ] Session cookie is present and protected route is accessible.
- [ ] Dashboard shows authenticated guard identity.
- [ ] Admin route remains blocked from same guard session.

**Evidence**: screenshot series + network + cookie

---

### I02: Guard Temporary Password Gate to Successful Password Reset

**Epics Involved**: P01-E04, P01-E06, P01-E03
**Persona**: Guard

**Flow**:

1. Log in as guard user with `must_change_password: true`.
2. Attempt to navigate to `/guard/dashboard` and observe layout redirect.
3. Complete `/guard/change-password` flow with valid current/new password.
4. Re-authenticate or continue to `/guard/dashboard` after successful update.

**Assert**:

- [ ] Guard with `must_change_password` is forced to `/guard/change-password`.
- [ ] Password change updates WorkOS password and flips Convex flag to false.
- [ ] Session refresh occurs and guard can continue to dashboard.
- [ ] Guard is no longer forced through password gate after success.

**Evidence**: screenshot series + network + database check

---

### I03: Admin SSO Journey with Dashboard Landing and Role Data

**Epics Involved**: P01-E03, P01-E05, P01-E07, P01-E08
**Persona**: Admin

**Flow**:

1. Open `/admin/login` and start Google SSO via WorkOS.
2. Complete callback on `/callback` and create session.
3. Land on `/admin/dashboard`.
4. Verify admin user exists/updates correctly and role assignments resolve.

**Assert**:

- [ ] Admin can log in via Google SSO and reach dashboard.
- [ ] Callback route correctly redirects non-`@guards.local` users to `/admin/dashboard`.
- [ ] Admin identity and role data are visible on dashboard.
- [ ] Pre-created admin record is linked/upserted without duplicate user rows.

**Evidence**: screenshot series + network + database snapshot

---

### I04: Route Protection and Cross-Role Isolation

**Epics Involved**: P01-E04, P01-E05, P01-E06
**Persona**: Guard + Admin

**Flow**:

1. As logged-out user, request `/guard/dashboard` and `/admin/dashboard`.
2. As guard, attempt to open `/admin/dashboard` and `/admin/roles`.
3. As admin, attempt to open `/guard/dashboard`.
4. Confirm public paths (`/`, `/listing/...`) remain accessible logged-out.

**Assert**:

- [ ] Unauthenticated users are redirected to role-specific login routes.
- [ ] Guards cannot access admin routes.
- [ ] Admins cannot access guard routes.
- [ ] Public routes remain accessible without auth.

**Evidence**: screenshot + redirect logs

---

### I05: RBAC Role Management + Permission Enforcement Across Admin UI

**Epics Involved**: P01-E06, P01-E07, P01-E08
**Persona**: Admin (Super Admin + Ops Agent)

**Flow**:

1. As super admin, create a custom role and assign it to another admin.
2. Verify protected operations requiring `roles.manage` succeed for privileged admin.
3. Attempt to rename/delete system roles and observe guardrails.
4. As limited admin without `system.configure`, attempt to edit `/admin/settings`.

**Assert**:

- [ ] Roles can be created/edited/soft-deleted and assigned to admin users.
- [ ] System roles cannot be renamed or deleted.
- [ ] Permission checks block actions when required permission is missing.
- [ ] Settings page edit access is restricted to `system.configure` holders.

**Evidence**: screenshot series + mutation logs

---

### I06: Banned Guard Enforcement from Auth to Protected Routes

**Epics Involved**: P01-E04, P01-E06, P01-E07
**Persona**: Guard

**Flow**:

1. Prepare guard user with `status: BANNED`.
2. Attempt guard login and access guard routes.
3. Attempt backend calls protected by `requireAuth`/`requireGuard`.

**Assert**:

- [ ] Banned guard cannot successfully use guard auth flow.
- [ ] Banned guard is redirected away from protected guard pages.
- [ ] Backend auth helpers reject banned identity consistently.
- [ ] User receives friendly rejection message without sensitive internals.

**Evidence**: screenshot + network + helper test output

---

### I07: Seed Bootstrap + Idempotency Supports Full Auth Stack

**Epics Involved**: P01-E02, P01-E07, P01-E08
**Persona**: Platform bootstrap (System/Admin)

**Flow**:

1. Run `npx convex run seed:init` on clean state.
2. Verify default roles, super admin user, role assignment, and system config entries.
3. Run seed again and compare counts for duplicate protection.
4. Execute representative auth/RBAC queries after seed.

**Assert**:

- [ ] Seed bootstraps default roles + super admin + system config.
- [ ] Seed is idempotent on repeated runs.
- [ ] Seeded role graph enables `requirePermission(ctx, "X")` behavior.
- [ ] Core Phase 1 auth + RBAC flows remain operational after seed rerun.

**Evidence**: terminal output + database snapshot

---

## Results

| ID  | Status  | Evidence | Notes |
| --- | ------- | -------- | ----- |
| I01 | pending | —        | —     |
| I02 | pending | —        | —     |
| I03 | pending | —        | —     |
| I04 | pending | —        | —     |
| I05 | pending | —        | —     |
| I06 | pending | —        | —     |
| I07 | pending | —        | —     |

---

## Failure Reports
