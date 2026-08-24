---
epic_id: P01-E08
title: "Seed Script + System Config Verification"
type: hybrid
status: pending
depends_on_epic: P01-E08
verified_at: null
failures: 0
---

# P01-E08 Verification: Seed Script + System Config

## Readiness Gates

- [ ] Epic frontmatter shows `status: done` in `tasks/phase-01-auth/P01-E08-seed-and-config.md`
- [ ] Completion Summary exists and deviations are reviewed
- [ ] Dev server running: `npm run dev:force` (http://localhost:3000)
- [ ] Convex dev running: `npx convex dev`
- [ ] Environment variable `SUPER_ADMIN_EMAIL` is set for seed runs
- [ ] Seed can be executed locally: `npx convex run seed:init`
- [ ] Login helper page reachable: http://localhost:3000/dev/login
- [ ] Test admin account available: `admin@example.com` / `DevAdmin123!`
- [ ] Test guard account available for non-admin access checks: `9999999999@guards.local` / `DevGuard123!`

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests
npm run test -- convex/seed.test.ts convex/systemConfig.test.ts

# Seed execution smoke check
npx convex run seed:init
```

**Expected**: All commands exit 0. If a listed test file does not exist yet, note it in Results.

---

## Scenarios

### V01: Seed Bootstrap Creates Roles, Super Admin, and Default Config — AC Ref: T01-AC1, T01-AC3, T01-AC4, T01-AC5, T01-AC6, T01-AC7, T01-AC9

**Precondition**: Empty or reset seed target environment with `SUPER_ADMIN_EMAIL` configured.

**Actions**:

1. Run `npx convex run seed:init` once.
2. Query `roles`, `users`, `user_role_assignments`, and `system_config`.
3. Validate role permission counts and flags.
4. Validate seeded super admin user and role assignment link.
5. Validate system config key/value population.
6. Run TypeScript check for seed module.

**Assert**:

- [ ] Seed creates exactly Super Admin and Ops Agent system roles.
- [ ] Super Admin role contains full permissions set expected by spec.
- [ ] Ops Agent role contains exact operational permission subset.
- [ ] Super admin user record is created as `ADMIN` and active.
- [ ] Super admin role assignment is created.
- [ ] All 17 default `system_config` entries are created.
- [ ] TypeScript compiles cleanly.

**Evidence**: terminal output + database snapshot

---

### V02: Seed Is Idempotent and Fails Fast Without Required Env — AC Ref: T01-AC2, T01-AC8

**Precondition**: Seed has already been run once successfully.

**Actions**:

1. Run `npx convex run seed:init` a second time.
2. Compare role/user/config counts before and after second run.
3. Execute seed in environment without `SUPER_ADMIN_EMAIL`.

**Assert**:

- [ ] Second seed execution performs no duplicate inserts.
- [ ] Seed behavior is idempotent and reports already-seeded state.
- [ ] Missing `SUPER_ADMIN_EMAIL` causes explicit failure.

**Evidence**: terminal output + count snapshots

---

### V03: System Config API Supports Admin Read + Permissioned Upsert — AC Ref: T02-AC1, T02-AC2, T02-AC3, T02-AC4, T02-AC5, T02-AC6, T02-AC7, T02-AC8

**Precondition**: Seeded config entries and admin user contexts with/without `system.configure` permission.

**Actions**:

1. Query `systemConfig.get` with existing and non-existing keys.
2. Query `systemConfig.getAll` as admin.
3. Call `systemConfig.set` for existing key (update path).
4. Call `systemConfig.set` for new key (insert path).
5. Retry set as admin lacking `system.configure` permission.

**Assert**:

- [ ] `get` returns entry for existing key and `null` for missing key.
- [ ] `getAll` returns all config entries.
- [ ] `set` updates existing values via upsert update path.
- [ ] `set` inserts missing entries via upsert insert path.
- [ ] `set` enforces `system.configure` permission.
- [ ] `get` and `getAll` enforce admin auth.
- [ ] TypeScript compiles cleanly.

**Evidence**: query/mutation output + logs

---

### V04: Admin Settings UI Loads, Groups, Edits, and Protects Access — AC Ref: T03-AC1, T03-AC2, T03-AC3, T03-AC4, T03-AC5, T03-AC6, T03-AC7, T03-AC8

**Precondition**: Authenticated admin session; seeded system config data present.

**Actions**:

1. Navigate to `/admin/settings` as admin with `system.configure`.
2. Verify category grouping and row rendering.
3. Edit numeric and string config values.
4. Save updates and observe toasts.
5. Re-open page to verify persisted updates.
6. Open as admin without `system.configure` permission.
7. Run build.

**Assert**:

- [ ] Page loads config entries from `api.systemConfig.getAll`.
- [ ] Entries are grouped into all 6 categories.
- [ ] Each entry shows human-readable label, current value, and description.
- [ ] Editor uses number input for numeric values and text input for string values.
- [ ] Save calls `systemConfig.set` and persists updated values.
- [ ] Success and error toasts are displayed.
- [ ] Unauthorized message appears for users lacking `system.configure`.
- [ ] Build succeeds.

**Evidence**: screenshot series + network + terminal output

---

### V05: Integration Tests Cover Seed and Config Reliability — AC Ref: T04-AC1, T04-AC2, T04-AC3, T04-AC4, T04-AC5, T04-AC6, T04-AC7, T04-AC8, T04-AC9, T04-AC10, T04-AC11

**Precondition**: `convex/seed.test.ts` and `convex/systemConfig.test.ts` are present.

**Actions**:

1. Run targeted test suite for seed/config integration.
2. Inspect tests for role counts/permission counts and idempotency.
3. Inspect tests for config set/get/upsert behavior and missing key handling.

**Assert**:

- [ ] Tests assert creation of exactly 2 roles.
- [ ] Tests assert Super Admin (39) and Ops Agent (25) permission counts.
- [ ] Tests assert seeded admin user + role assignment creation.
- [ ] Tests assert all 17 default config entries are present.
- [ ] Tests assert idempotent second seed run.
- [ ] Tests assert `systemConfig.set` update and create paths.
- [ ] Tests assert `systemConfig.get` returns `null` for missing keys.
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
