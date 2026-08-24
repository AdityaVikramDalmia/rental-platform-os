---
id: P01-E07
title: RBAC System
phase: 1
status: done
depends_on: ["P01-E06"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-16
---

# P01-E07: RBAC System

## Overview
Implement the full RBAC system: role CRUD (with soft delete and system role protection), user queries, admin roles management UI (data table + permission editor), and role assignment to admin users. Guards do NOT use RBAC — their permissions are hardcoded by `user_type` and `status`.

## Task Queue
- [x] P01-E07-T01: Create convex/roles.ts (Role CRUD)
- [x] P01-E07-T02: Create convex/users.ts (User Queries)
- [x] P01-E07-T03: Create Admin Roles Management Page
- [x] P01-E07-T04: Create Admin Creation + Role Assignment
- [x] P01-E07-T05: Write Tests for RBAC

---

## T01: Create convex/roles.ts (Role CRUD)

### Objective
Implement all Convex mutations and queries for managing roles (create, update, soft delete, list, get by ID). System roles are protected from deletion and permission modification.

### Required Reading
- `notes/03-roles-and-permissions.md` — "Permission Definitions" section (all permission strings), "Default Roles" section (Super Admin + Ops Agent)
- `notes/13-constants-reference.md` — "Permissions (RBAC)" section (complete permission list), "Default Roles" section
- `notes/10-convex-schema.md` — `roles` table schema (fields: `name`, `description`, `permissions[]`, `is_system_role`, `is_deleted`; index: `by_name`)

### Key Rules
1. Import `mutation` and `query` from `./functions.ts` — NEVER from `_generated/server`. Audit triggers fire automatically.
2. All write operations (create, update, softDelete) require `requirePermission(ctx, "roles.manage")` from `./auth.helpers`.
3. Read operations (list, getById) require `requirePermission(ctx, "roles.view")`.
4. System roles (`is_system_role: true`) CANNOT be soft-deleted — throw `"Cannot delete a system role"`.
5. System roles CANNOT be renamed — throw `"Cannot rename a system role"`. However, system role `permissions` CAN be updated (Super Admin may need to adjust Ops Agent permissions over time). `description` can also be updated.
6. Soft delete: set `is_deleted: true`. Never call `ctx.db.delete()`.
7. All queries MUST filter `.filter(q => q.neq(q.field("is_deleted"), true))` to exclude soft-deleted roles.
8. Validate that `permissions` array only contains known permission strings from `lib/constants.ts`.

### Deliverables
- [ ] `convex/roles.ts` — Role CRUD mutations and queries

### Acceptance Criteria
1. `roles.create({ name, permissions, description?, is_system_role? })` inserts a new role with `is_deleted: false`.
2. `roles.update({ id, name?, permissions?, description? })` patches the role. Throws if system role name is being changed. System role permissions CAN be updated.
3. `roles.softDelete({ id })` sets `is_deleted: true`. Throws if system role.
4. `roles.list()` returns all non-deleted roles.
5. `roles.getById({ id })` returns a single role or `null`.
6. All mutations require `roles.manage` permission.
7. All queries require `roles.view` permission.
8. TypeScript compiles clean.

### Verification
```bash
npx tsc --noEmit
```
Run `lsp_diagnostics` on `convex/roles.ts`.

### Out of Scope
- Role assignment to users (T04)
- Seed script creating default roles (P01-E08)
- Permission string validation against a master list (can be added later as enhancement)

---

## T02: Create convex/users.ts (User Queries)

### Objective
Implement Convex queries for fetching user data (current user, admin list, user by ID) and a mutation for guards to update their own profile name. These queries are used by both the guard portal and admin panel.

### Required Reading
- `notes/10-convex-schema.md` — `users` table schema (indexes: `by_workos_user_id`, `by_user_type`, `by_phone`, `by_email`, `by_status`, `by_type_and_status`)
- `notes/10-convex-schema.md` — `guard_profiles` table schema (index: `by_user_id`)
- `notes/03-roles-and-permissions.md` — "Guard Permissions" section (guards can only see own data)

### Key Rules
1. Import `query` from `./functions.ts` and `mutation` from `./functions.ts`.
2. `getCurrentUser`: Uses `getAuthenticatedUser(ctx)` from `./auth.helpers` — returns the user record. If the user is a guard, also fetch and include the `guard_profiles` record via the `by_user_id` index.
3. `listAdmins`: Requires `requirePermission(ctx, "admins.create")` or `requirePermission(ctx, "roles.manage")`. Uses the `by_user_type` index to filter `user_type === "ADMIN"`.
4. `getById`: Requires `requireAdmin(ctx)`. Returns the user record by `_id`. Guards CANNOT call this — they only see their own data via `getCurrentUser`.
5. `updateProfile`: Uses `requireGuard(ctx)`. Guards can ONLY update their own `name` field. Verify `ctx.db.get(args.id)` matches the authenticated guard's `_id`.
6. No hard deletes. Users are deactivated via status changes, not deleted.

### Deliverables
- [ ] `convex/users.ts` — User queries and profile update mutation

### Acceptance Criteria
1. `users.getCurrentUser()` returns the authenticated user record (or `null` if not authenticated).
2. `users.getCurrentUser()` includes `guard_profile` field when the user is a guard.
3. `users.listAdmins()` returns only `ADMIN` type users. Requires admin permission.
4. `users.getById({ id })` returns a single user. Admin-only.
5. `users.updateProfile({ name })` allows guards to update their own name only.
6. `users.updateProfile` throws if a guard tries to update another user's profile.
7. TypeScript compiles clean.

### Verification
```bash
npx tsc --noEmit
```
Run `lsp_diagnostics` on `convex/users.ts`.

### Out of Scope
- Guard profile photo upload (Phase 3 — Guard Management)
- Admin user creation (handled via WorkOS SSO auto-create + role assignment in T04)
- Guard creation (Phase 3 — uses Convex Action for WorkOS account)
- User status changes (Phase 3 — guard management)

---

## T03: Create Admin Roles Management Page

### Objective
Build the admin UI for viewing, creating, and editing roles. Includes a data table listing all roles and a form page with grouped permission checkboxes for creating/editing roles.

### Required Reading
- `notes/06-admin-panel-ux.md` — "Navigation" section (sidebar structure with Roles link)
- `notes/13-constants-reference.md` — "Permissions (RBAC)" section (all permission strings grouped by domain)
- `notes/03-roles-and-permissions.md` — "Default Roles" section (system role behavior)

### Key Rules
1. List page (`/admin/roles`): Use `useQuery(api.roles.list)` for real-time role data. Data table columns: Name, Permission Count, System Role badge, Actions (Edit / Delete).
2. System roles display a "System" badge (e.g., `bg-blue-100 text-blue-700`) and disable the Delete button. Edit button links to edit page but permission checkboxes are disabled for system roles.
3. Create page (`/admin/roles/new`): Form with name input, optional description, and grouped permission checkboxes. Groups match the doc sections: Society & Building, Guard Management, Lead Management, Listing Management, Visit Management, Closure & Payout, Incentive Management, Analytics & Audit, System Administration.
4. Edit page (`/admin/roles/[id]`): Same form pre-filled with existing role data. For system roles, permission checkboxes are disabled with a tooltip explaining "System role permissions cannot be modified".
5. Use `react-hook-form` + `zod` for form validation. Name is required, at least one permission must be selected.
6. Use `sonner` for toast notifications on success/error.
7. Delete action: confirmation dialog before calling `roles.softDelete`. System roles cannot be deleted (button disabled).
8. Desktop-first layout consistent with admin panel styling.

### Deliverables
- [ ] `src/app/(admin)/roles/page.tsx` — Roles list page with data table
- [ ] `src/app/(admin)/roles/new/page.tsx` — Create role form
- [ ] `src/app/(admin)/roles/[id]/page.tsx` — Edit role form
- [ ] `src/components/admin/PermissionEditor.tsx` — Grouped permission checkboxes component (reusable)

### Acceptance Criteria
1. Roles list page renders all non-deleted roles in a data table.
2. System roles show "System" badge and have delete button disabled.
3. Create role form validates name (required) and permissions (at least one).
4. Create form groups permissions by domain (9 groups matching doc sections).
5. Edit form pre-fills with existing role data.
6. Edit form disables permission checkboxes for system roles.
7. Delete triggers confirmation dialog and calls `roles.softDelete`.
8. Toast notifications appear on create/update/delete success and on errors.
9. `npm run build` succeeds.

### Verification
```bash
npm run build
```
Run `lsp_diagnostics` on all four deliverable files.

### Out of Scope
- RBAC-based visibility of the Roles nav item (show/hide based on permission — future enhancement)
- Bulk permission assignment
- Role comparison view
- Permission dependency validation (e.g., `listings.publish` requires `listings.view`)

---

## T04: Create Admin Creation + Role Assignment

### Objective
Implement admin account pre-creation (so Super Admin can set up admins before their first SSO login), role assignment/revocation mutations, the auth.ts email-based upsert (to link pre-created records on first login), and the UI for managing admin users and their roles.

### Required Reading
- `notes/03-roles-and-permissions.md` — "Admin Account Creation (Post-Bootstrap)" section (full flow: pre-create → SSO login → auto-link)
- `notes/03-roles-and-permissions.md` — "Permission Check Pattern" section (how requirePermission resolves roles)
- `notes/10-convex-schema.md` — `user_role_assignments` table schema (fields: `user_id`, `role_id`, `assigned_by_admin_id`, `is_deleted`; indexes: `by_user_id`, `by_role_id`)
- `notes/11-convex-architecture.md` — "AuthKit Component" section (`user.created` event handler)

### Key Rules
1. Import `mutation` and `query` from `./functions.ts`.
2. **Admin creation mutation** (`admins.create`): Requires `requirePermission(ctx, "admins.create")`. Creates a `users` record with: `user_type: "ADMIN"`, `status: "ACTIVE"`, `email` (Google email), `name`, `must_change_password: false`, `workos_user_id: ""` (empty — populated on first SSO login). Validate: email is non-empty, email does NOT end with `@guards.local` (reserved for guard synthetic emails), no existing user with same email (check `by_email` index).
3. **Critical auth.ts update**: Update the `user.created` event handler in `convex/auth.ts` to check for an existing user by email BEFORE inserting. If found (pre-created by admin), patch it with the `workos_user_id` instead of inserting a duplicate. This makes admin pre-creation work seamlessly with SSO auto-creation.
4. **Role assignment** (`userRoleAssignments.assign`): Requires `requirePermission(ctx, "roles.manage")`. Creates assignment with `assigned_by_admin_id` from current admin. Validates: target user exists and is ADMIN (throw `"Cannot assign roles to guards"`), role exists and is not soft-deleted, no duplicate active assignment (throw `"Role already assigned"`).
5. **Role revocation** (`userRoleAssignments.revoke`): Requires `requirePermission(ctx, "roles.manage")`. Soft-deletes the assignment. Before revoking: if revoking a Super Admin assignment, count remaining active assignments for that role — if this is the last one, throw `"Cannot revoke the last Super Admin assignment"`.
6. **Queries**: `getByUserId` returns active assignments with joined role data. `listByRole` returns active assignments with joined user data. Both require `requireAdmin(ctx)`. All queries MUST filter `is_deleted !== true`.
7. UI: Admin management page with admin list + role badges, admin creation dialog (name + email + initial role), role assignment dropdown, revocation buttons. Use `sonner` for toasts.

### Deliverables
- [ ] `convex/admins.ts` — Admin creation mutation + `listAdmins` query
- [ ] `convex/userRoleAssignments.ts` — `assign`, `revoke`, `getByUserId`, `listByRole` mutations/queries
- [ ] `convex/auth.ts` — **Updated**: `user.created` handler checks for existing user by email before inserting (upsert)
- [ ] `src/app/(admin)/roles/admins/page.tsx` — Admin management page (admin list + roles + creation)
- [ ] `src/components/admin/AdminCreateDialog.tsx` — Admin creation form dialog
- [ ] `src/components/admin/UserRoleManager.tsx` — Role assignment/revocation UI component

### Acceptance Criteria
1. `admins.create` creates an ADMIN user with empty `workos_user_id`.
2. `admins.create` rejects `@guards.local` emails and duplicate emails.
3. `admins.create` requires `admins.create` permission.
4. `user.created` event handler patches existing user by email match (upsert — no duplicates).
5. `assign` creates assignment with correct `assigned_by_admin_id`.
6. `assign` rejects: guards, deleted roles, duplicate active assignments.
7. `revoke` soft-deletes the assignment.
8. `revoke` prevents removing the last Super Admin.
9. Admin management page shows all admins with role badges and role management controls.
10. Admin creation dialog validates email and creates user + assigns initial role.
11. `npm run build` succeeds.

### Verification
```bash
npm run build
npx tsc --noEmit
```
Run `lsp_diagnostics` on `convex/admins.ts`, `convex/userRoleAssignments.ts`, `convex/auth.ts`, and all UI files.

### Out of Scope
- Guard account creation (Phase 3 — uses Convex Action + WorkOS API)
- Guard role assignment (guards don't use RBAC)
- Batch role assignment
- Admin deactivation or editing (V1 simplicity — can be done via role revocation)

---

## T05: Write Tests for RBAC

### Objective
Comprehensive tests for role CRUD operations, role assignment/revocation, and the interaction between RBAC and `requirePermission`. Tests must verify both happy paths and error scenarios using `convex-test`.

### Required Reading
- `notes/13-constants-reference.md` — "Permissions (RBAC)" section (permission strings for test data)
- `notes/03-roles-and-permissions.md` — "Default Roles" section (Super Admin and Ops Agent permissions)
- `notes/03-roles-and-permissions.md` — "Permission Check Pattern" section (how permission resolution works)

### Key Rules
1. Use `convexTest` from `convex-test` with `withIdentity` to mock WorkOS auth identities.
2. Seed test data: create admin users, create roles with specific permission arrays, create assignments.
3. Test role CRUD independently from assignment logic — separate describe blocks.
4. Test the full chain: create role → assign to user → verify `requirePermission` succeeds for granted permissions.
5. Test edge cases: system role deletion blocked, system role renaming blocked, duplicate assignment blocked, last Super Admin revocation blocked.
6. Test permission union: user with 2 roles gets permissions from both.
7. Test admin creation: rejects `@guards.local` emails, rejects duplicates, creates correct user record.
8. Test auth.ts upsert: when a pre-created admin first logs in via SSO, the `user.created` event handler patches the existing record (not inserts a duplicate).
9. Use descriptive test names that explain the expected behavior.

### Deliverables
- [ ] `convex/roles.test.ts` — Role CRUD tests
- [ ] `convex/userRoleAssignments.test.ts` — Assignment, revocation, and permission resolution tests
- [ ] `convex/admins.test.ts` — Admin creation + auth.ts email upsert tests

### Acceptance Criteria
1. Test: create role stores correct name, permissions, and `is_deleted: false`.
2. Test: system role (`is_system_role: true`) cannot be soft-deleted — mutation throws.
3. Test: system role cannot be renamed — mutation throws.
4. Test: system role permissions CAN be updated — mutation succeeds.
5. Test: soft-deleted roles are excluded from `roles.list()`.
6. Test: assign role to user creates correct record with `assigned_by_admin_id`.
7. Test: duplicate assignment (same user+role, non-deleted) throws.
8. Test: revoke role sets `is_deleted: true`.
9. Test: revoking the last Super Admin assignment throws.
10. Test: `requirePermission` succeeds for a permission in an assigned role.
11. Test: `requirePermission` fails for a permission NOT in any assigned role.
12. Test: user with multiple roles gets the union of all permissions.
13. Test: `admins.create` creates ADMIN user with empty `workos_user_id`.
14. Test: `admins.create` rejects `@guards.local` email.
15. Test: `user.created` event patches existing user when email matches (upsert, not duplicate).
16. All tests pass.

### Verification
```bash
npm run test
```

### Out of Scope
- Performance testing of permission lookups with many roles
- UI component tests (tested via E2E or manual testing)
- Integration tests with actual WorkOS auth
