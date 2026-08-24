---
epic_id: P01-E07
title: "RBAC System Verification"
type: hybrid
status: pending
depends_on_epic: P01-E07
verified_at: null
failures: 0
---

# P01-E07 Verification: RBAC System

## Readiness Gates

- [ ] Epic frontmatter shows `status: done` in `tasks/phase-01-auth/P01-E07-rbac-system.md`
- [ ] Completion Summary exists and deviations are reviewed
- [ ] Dev server running: `npm run dev:force` (http://localhost:3000)
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Login helper page reachable: http://localhost:3000/dev/login
- [ ] Test admin account available: `admin@example.com` / `DevAdmin123!`
- [ ] Test guard account available for guard/admin separation checks: `9999999999@guards.local` / `DevGuard123!`
- [ ] At least one system role (`Super Admin`) and one non-system role are present in test data

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests
npm run test -- convex/roles.test.ts convex/userRoleAssignments.test.ts convex/admins.test.ts
```

**Expected**: All commands exit 0. If a listed test file does not exist yet, note it in Results.

---

## Scenarios

### V01: Role CRUD Enforces System-Role and Permission Rules — AC Ref: T01-AC1, T01-AC2, T01-AC3, T01-AC4, T01-AC5, T01-AC6, T01-AC7, T01-AC8

**Precondition**: Authenticated admin with `roles.manage` and `roles.view` permissions.

**Actions**:

1. Create a non-system role via `roles.create`.
2. Update role name/permissions/description via `roles.update`.
3. Attempt to rename system role and verify rejection.
4. Attempt to soft-delete system role and verify rejection.
5. Soft-delete non-system role and verify `roles.list` filtering.
6. Run TypeScript check.

**Assert**:

- [ ] Role creation stores `is_deleted: false` and requested fields.
- [ ] Update works for non-system roles and blocks system-role rename.
- [ ] Soft-delete blocks for system roles and works for non-system roles.
- [ ] `roles.list()` excludes soft-deleted roles.
- [ ] `roles.getById()` returns role or `null`.
- [ ] Mutations require `roles.manage` and queries require `roles.view`.
- [ ] TypeScript compiles cleanly.

**Evidence**: terminal output + database snapshot

---

### V02: User Queries Respect Auth Boundaries and Ownership Rules — AC Ref: T02-AC1, T02-AC2, T02-AC3, T02-AC4, T02-AC5, T02-AC6, T02-AC7

**Precondition**: Admin and guard users exist with at least one guard profile.

**Actions**:

1. Call `users.getCurrentUser()` in unauthenticated and authenticated contexts.
2. Call `users.getCurrentUser()` as guard and verify `guard_profile` inclusion.
3. Call `users.listAdmins()` with/without required permission.
4. Call `users.getById()` as admin and as guard.
5. Call `users.updateProfile()` as guard for self and for another user.

**Assert**:

- [ ] `getCurrentUser` returns `null` when unauthenticated and user record when authenticated.
- [ ] Guard response includes `guard_profile`.
- [ ] `listAdmins` returns only ADMIN users and enforces permission.
- [ ] `getById` is admin-only.
- [ ] `updateProfile` allows self-update and rejects cross-user updates.
- [ ] TypeScript compiles cleanly.

**Evidence**: test output + query responses

---

### V03: Roles Management UI Handles List/Create/Edit/Delete UX — AC Ref: T03-AC1, T03-AC2, T03-AC3, T03-AC4, T03-AC5, T03-AC6, T03-AC7, T03-AC8, T03-AC9

**Precondition**: Authenticated admin with roles permissions; `/admin/roles` routes accessible.

**Actions**:

1. Open `/admin/roles` and inspect table rows.
2. Verify system role badge and disabled delete action.
3. Open `/admin/roles/new`, submit invalid form (missing name/permissions), then valid form.
4. Open `/admin/roles/[id]` for existing role and verify pre-filled values.
5. Open system role edit view and verify permission controls disabled.
6. Trigger delete on non-system role and confirm dialog + mutation call.

**Assert**:

- [ ] List page renders all non-deleted roles.
- [ ] System roles show badge and disabled delete action.
- [ ] Create form validates required name and at least one permission.
- [ ] Permission groups are rendered into 9 domain groups.
- [ ] Edit form pre-fills role data.
- [ ] System-role permission editing is disabled in UI.
- [ ] Delete flow confirms and calls `roles.softDelete`.
- [ ] Toasts appear for success and error states.
- [ ] Build succeeds.

**Evidence**: screenshot series + network + console

---

### V04: Admin Pre-Creation + Auth Upsert Prevent Duplicate Users — AC Ref: T04-AC1, T04-AC2, T04-AC3, T04-AC4

**Precondition**: Authenticated super admin with `admins.create`; test email not yet used.

**Actions**:

1. Call `admins.create` with valid non-`@guards.local` email.
2. Attempt create with `@guards.local` email.
3. Attempt duplicate email create.
4. Trigger/simulate `user.created` event for the pre-created email.
5. Inspect resulting user record count and `workos_user_id` updates.

**Assert**:

- [ ] `admins.create` inserts ADMIN user with empty `workos_user_id`.
- [ ] `admins.create` rejects `@guards.local` and duplicate emails.
- [ ] `admins.create` enforces `admins.create` permission.
- [ ] `user.created` handler patches pre-created email record instead of inserting duplicate.

**Evidence**: test output + database snapshot

---

### V05: Role Assignment/Revoke Logic + Admin Management UI Contract — AC Ref: T04-AC5, T04-AC6, T04-AC7, T04-AC8, T04-AC9, T04-AC10, T04-AC11

**Precondition**: Admin management route `/admin/roles/admins` accessible with required permissions.

**Actions**:

1. Assign valid role to admin and inspect `assigned_by_admin_id`.
2. Attempt invalid assignments (guard target, deleted role, duplicate active assignment).
3. Revoke assignment and verify soft-delete behavior.
4. Attempt revoking last Super Admin assignment.
5. Use admin management page dialog and role manager controls for create/assign/revoke.

**Assert**:

- [ ] Assignment creates expected record with correct actor linkage.
- [ ] Invalid assignments are rejected with expected constraints.
- [ ] Revoke marks assignment `is_deleted: true`.
- [ ] Last Super Admin assignment cannot be revoked.
- [ ] Admin management page renders admins, role badges, and controls.
- [ ] Admin creation dialog validates input and supports initial role assignment.
- [ ] Build succeeds.

**Evidence**: screenshot + network + database snapshot

---

### V06: RBAC Tests Cover Role/Assignment Edge Cases — AC Ref: T05-AC1, T05-AC2, T05-AC3, T05-AC4, T05-AC5, T05-AC6, T05-AC7, T05-AC8, T05-AC9

**Precondition**: `convex/roles.test.ts` and `convex/userRoleAssignments.test.ts` are present.

**Actions**:

1. Run targeted RBAC tests for role CRUD and assignment/revoke behavior.
2. Review assertions for system role protections, duplicate assignment, and last super-admin guardrail.

**Assert**:

- [ ] Role create test validates persisted fields.
- [ ] System-role delete/rename protections are tested.
- [ ] System-role permission update allowance is tested.
- [ ] Soft-deleted role filtering is tested.
- [ ] Assignment, duplicate prevention, revoke, and last-super-admin protections are tested.

**Evidence**: test output

---

### V07: RBAC Tests Cover Permission Resolution + Admin Upsert — AC Ref: T05-AC10, T05-AC11, T05-AC12, T05-AC13, T05-AC14, T05-AC15, T05-AC16

**Precondition**: `convex/admins.test.ts` and permission-resolution tests are present.

**Actions**:

1. Run targeted admin and permission union tests.
2. Verify pass/fail permission resolution across single and multiple roles.
3. Verify `admins.create` tests for valid + rejected email shapes.
4. Verify auth upsert test for pre-created admin email on first SSO event.

**Assert**:

- [ ] `requirePermission` succeeds for granted permissions.
- [ ] `requirePermission` fails for missing permissions.
- [ ] Multi-role permission union is validated.
- [ ] `admins.create` success/rejection paths are validated.
- [ ] `user.created` upsert behavior is validated.
- [ ] All RBAC tests pass.

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
| V07 | pending | —        | —     |

---

## Failure Reports
