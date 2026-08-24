---
id: P01-E08
title: Seed Script + System Config
phase: 1
status: done
depends_on: ["P01-E07"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-16
---

# P01-E08: Seed Script + System Config

## Overview
Create the bootstrap seed script that initializes the platform on first deployment (system roles, first super admin, default system config), the system config CRUD module, and the admin settings page. Includes integration tests for seed idempotency and config operations.

## Task Queue
- [x] P01-E08-T01: Create convex/seed.ts (Bootstrap Script)
- [x] P01-E08-T02: Create convex/systemConfig.ts (Config CRUD)
- [x] P01-E08-T03: Create Admin Settings Page
- [x] P01-E08-T04: Write Integration Tests for Seed + Config

---

## T01: Create convex/seed.ts (Bootstrap Script)

### Objective
Create an idempotent seed function that bootstraps the platform with system roles, the first super admin user, and default system config entries. Run via `npx convex run seed:init` on first deployment.

### Required Reading
- `notes/01-tech-stack.md` — "Bootstrap / Seed" section (seed script steps and pattern)
- `notes/03-roles-and-permissions.md` — "Bootstrap Process" section (what seed creates, idempotency, admin creation flow)
- `notes/03-roles-and-permissions.md` — "Default Roles" section (Super Admin = all permissions, Ops Agent = operational subset)
- `notes/13-constants-reference.md` — "Permissions (RBAC)" section (all 39 permission strings for Super Admin)
- `notes/13-constants-reference.md` — "Default Roles" section (exact Ops Agent permission list)
- `notes/13-constants-reference.md` — "System Config Keys" section (all default config entries with values)

### Key Rules
1. Export as an `internalMutation` from `./functions.ts` — NOT a public mutation. Run via `npx convex run seed:init`.
2. **Idempotent**: First check if the `roles` table has any documents. If yes, log "Already seeded" and return early. Safe to run multiple times.
3. **Super Admin role**: Create with `name: "Super Admin"`, `is_system_role: true`, `is_deleted: false`, and ALL 39 permission strings from `notes/13-constants-reference.md` (societies.view through system.configure).
4. **Ops Agent role**: Create with `name: "Ops Agent"`, `is_system_role: true`, `is_deleted: false`, and the exact permission list from `notes/13-constants-reference.md` "Default Roles" section (25 permissions: societies.view, buildings.view, guards.view, guards.manage_shifts, leads.*, listings.*, visits.*, closures.view/create/edit, payouts.view, incentives.view, analytics.view).
5. **First super admin**: Read `SUPER_ADMIN_EMAIL` from `process.env`. Create a Convex `users` record with `user_type: "ADMIN"`, `status: "ACTIVE"`, `email: SUPER_ADMIN_EMAIL`, `name: "Super Admin"`, `must_change_password: false`, `workos_user_id: ""` (empty string — updated to real value on first Google SSO login when the `user.created` event handler in `convex/auth.ts` does an email-based upsert, per P01-E07-T04). Does NOT create a WorkOS user — the admin's WorkOS account is auto-created on first SSO login.
6. **Role assignment**: Assign the Super Admin role to the new user with `assigned_by_admin_id` set to the user's own `_id`.
7. **Default system_config entries**: Create all entries from `notes/13-constants-reference.md` "System Config Keys" section. Values stored as JSON-encoded strings. Use the newly created super admin user's `_id` as `updated_by_admin_id`. Entries: `max_leads_per_guard_per_day` ("5"), `dedup_flat_window_days` ("90"), `dedup_phone_window_days` ("30"), all 13 incentive thresholds, `demorentals_contact_phone` ("\"\""), `demorentals_whatsapp_phone` ("\"\"").
8. Throw if `SUPER_ADMIN_EMAIL` environment variable is not set.

### Deliverables
- [ ] `convex/seed.ts` — Idempotent bootstrap seed function

### Acceptance Criteria
1. Running `npx convex run seed:init` creates 2 system roles with correct permissions.
2. Running it again does nothing (idempotent).
3. Super Admin role has all 39 permissions.
4. Ops Agent role has exactly the 25 operational permissions from the docs.
5. A `users` record is created for the super admin email with `user_type: "ADMIN"`.
6. The super admin user is assigned the Super Admin role.
7. All 17 default `system_config` entries are created with correct default values.
8. Throws if `SUPER_ADMIN_EMAIL` is not set.
9. TypeScript compiles clean.

### Verification
```bash
npx tsc --noEmit
```
Run `lsp_diagnostics` on `convex/seed.ts`.

### Out of Scope
- Creating the WorkOS user for the super admin (auto-created on first Google SSO login)
- Guard account creation (Phase 3 — Guard Management)
- Updating the placeholder `workos_user_id` on first SSO login (handled by the `user.created` event handler in `convex/auth.ts`)

---

## T02: Create convex/systemConfig.ts (Config CRUD)

### Objective
Implement Convex queries and mutations for reading and updating system configuration values. Config entries are key-value pairs with JSON-encoded string values, used to control rate limits, de-dup windows, incentive thresholds, and contact info.

### Required Reading
- `notes/10-convex-schema.md` — `system_config` table schema (fields: `key`, `value` as JSON-encoded string, `updated_by_admin_id`; index: `by_key`)
- `notes/13-constants-reference.md` — "System Config Keys" section (all keys, default values, types, descriptions)

### Key Rules
1. Import `mutation` and `query` from `./functions.ts`.
2. `systemConfig.get({ key })`: Requires `requireAdmin(ctx)`. Uses the `by_key` index to look up a single config entry. Returns `{ key, value, updated_by_admin_id }` or `null` if not found.
3. `systemConfig.getAll()`: Requires `requireAdmin(ctx)`. Returns all config entries using `ctx.db.query("system_config").collect()`.
4. `systemConfig.set({ key, value, description? })`: Requires `requirePermission(ctx, "system.configure")`. Upsert pattern — look up by `by_key` index: if exists, `ctx.db.patch()` with new `value` and `updated_by_admin_id`; if not, `ctx.db.insert()` with all fields. The `updated_by_admin_id` is set to the current admin's `_id`.
5. Config values are stored as `v.string()` — JSON-encoded. Callers must `JSON.parse()` on read and `JSON.stringify()` on write. The mutation accepts the raw string value (already JSON-encoded by the caller).
6. No deletion of config entries. Config can only be created or updated.
7. Audit logging is automatic via the trigger system on `system_config` table.

### Deliverables
- [ ] `convex/systemConfig.ts` — System config queries and upsert mutation

### Acceptance Criteria
1. `systemConfig.get({ key: "max_leads_per_guard_per_day" })` returns the config entry.
2. `systemConfig.get({ key: "nonexistent" })` returns `null`.
3. `systemConfig.getAll()` returns all config entries.
4. `systemConfig.set()` updates an existing config entry (upsert — update path).
5. `systemConfig.set()` creates a new config entry (upsert — insert path).
6. `systemConfig.set()` requires `system.configure` permission.
7. `systemConfig.get()` and `systemConfig.getAll()` require admin auth.
8. TypeScript compiles clean.

### Verification
```bash
npx tsc --noEmit
```
Run `lsp_diagnostics` on `convex/systemConfig.ts`.

### Out of Scope
- Config value type validation (e.g., ensuring numeric keys have numeric values)
- Config key enumeration in the backend (frontend handles grouping)
- Config change notifications or webhooks
- Config versioning or history (covered by audit logs)

---

## T03: Create Admin Settings Page

### Objective
Build the admin settings page that displays all system config entries in an organized, editable interface. Config entries are grouped by category with type-appropriate input controls.

### Required Reading
- `notes/13-constants-reference.md` — "System Config Keys" section (all keys with types, defaults, descriptions)
- `notes/06-admin-panel-ux.md` — "Settings" section (admin panel settings page layout)

### Key Rules
1. Create `src/app/(admin)/settings/page.tsx` as a `"use client"` component.
2. Use `useQuery(api.systemConfig.getAll)` for real-time config data.
3. Group config entries by category:
   - **Rate Limits**: `max_leads_per_guard_per_day`
   - **De-duplication**: `dedup_flat_window_days`, `dedup_phone_window_days`
   - **Incentive Thresholds — Lead Submitter**: `incentive_lead_submitter_bronze` through `_platinum`
   - **Incentive Thresholds — Visit Handler**: `incentive_visit_handler_bronze` through `_platinum`
   - **Incentive Thresholds — Quality Champion**: `incentive_quality_champion_bronze` through `_platinum`, `incentive_quality_champion_min_leads`
   - **Contact Info**: `demorentals_contact_phone`, `demorentals_whatsapp_phone`
4. Each config entry displays: key (formatted as label), current value, description text.
5. Edit: clicking an edit button opens an inline editor or dialog. Number configs show number input, string configs show text input.
6. Save calls `systemConfig.set({ key, value: JSON.stringify(newValue) })`.
7. Use `sonner` for toast notifications on save success/error.
8. Only users with `system.configure` permission can access this page. Show an unauthorized message if the user lacks the permission.

### Deliverables
- [ ] `src/app/(admin)/settings/page.tsx` — Admin settings page with grouped config editor

### Acceptance Criteria
1. Page loads all system config entries from Convex.
2. Entries are visually grouped into 6 categories.
3. Each entry shows its key (as a human-readable label), current value, and description.
4. Clicking edit opens an input appropriate to the value type (number input for numeric values, text input for strings).
5. Saving updates the config via `systemConfig.set` mutation.
6. Toast notification on save success and on error.
7. Page shows unauthorized message if user lacks `system.configure` permission.
8. `npm run build` succeeds.

### Verification
```bash
npm run build
```
Run `lsp_diagnostics` on `src/app/(admin)/settings/page.tsx`.

### Out of Scope
- Config value constraints (e.g., min/max for numbers)
- Config reset to defaults button
- Config import/export
- Real-time preview of config effects

---

## T04: Write Integration Tests for Seed + Config

### Objective
Tests for the seed script idempotency, system role correctness, default config creation, and system config CRUD operations. Ensures the bootstrap process is reliable and the config module works correctly.

### Required Reading
- `notes/13-constants-reference.md` — "System Config Keys" section (all 17 default config entries)
- `notes/13-constants-reference.md` — "Default Roles" section (permission lists for Super Admin and Ops Agent)
- `notes/03-roles-and-permissions.md` — "Bootstrap Process" section (idempotency behavior)

### Key Rules
1. Use `convexTest` from `convex-test` with appropriate test setup.
2. For seed tests: call the seed internal mutation, then query the database directly to verify results.
3. For idempotency: call seed twice, verify no duplicate roles or config entries are created.
4. For config tests: seed first to create default entries, then test CRUD operations.
5. Mock or skip WorkOS API calls in tests — focus on Convex-side behavior.
6. Verify exact permission counts: Super Admin = 39 permissions, Ops Agent = 25 permissions.
7. Verify all 17 system config entries exist with correct default values after seeding.

### Deliverables
- [ ] `convex/seed.test.ts` — Seed script tests
- [ ] `convex/systemConfig.test.ts` — System config CRUD tests

### Acceptance Criteria
1. Test: seed creates exactly 2 roles (Super Admin, Ops Agent).
2. Test: Super Admin role has exactly 39 permissions and `is_system_role: true`.
3. Test: Ops Agent role has exactly 25 permissions and `is_system_role: true`.
4. Test: seed creates a user with `user_type: "ADMIN"` and `status: "ACTIVE"`.
5. Test: seed creates the Super Admin role assignment.
6. Test: seed creates all 17 default system config entries.
7. Test: running seed twice creates no duplicates (idempotent).
8. Test: `systemConfig.set` updates an existing config value.
9. Test: `systemConfig.set` creates a new config entry (upsert).
10. Test: `systemConfig.get` returns `null` for nonexistent keys.
11. All tests pass.

### Verification
```bash
npm run test
```

### Out of Scope
- Testing WorkOS API integration (requires live WorkOS credentials)
- Testing the `user.created` webhook handler (covered in P01-E03 tests)
- Performance testing of seed with large permission sets
