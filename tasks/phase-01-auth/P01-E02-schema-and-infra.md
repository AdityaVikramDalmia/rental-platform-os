---
id: P01-E02
title: Convex Schema + Core Infrastructure
phase: 1
status: done
depends_on: ["P01-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P01-E02: Convex Schema + Core Infrastructure

## Prerequisites
- **Read first**: [P01-E01 Completion Summary](P01-E01-project-scaffolding.md#completion-summary) — key file locations, deviations, gotchas from scaffolding.
- Convex dev server must be running (`npx convex dev`) for schema pushes.
- Shared enums in `lib/constants.ts` are the source of truth for all status/type values used in schema validators.

## Overview
Define the Phase 1 database schema (users, guard_profiles, roles, user_role_assignments, system_config, audit_logs), register Convex components, create the `functions.ts` trigger wrapper pattern, and implement automatic audit logging on all business tables.

## Task Queue
- [x] P01-E02-T01: Create convex/schema.ts (Phase 1 tables only)
- [x] P01-E02-T02: Create convex/convex.config.ts (Component Registration)
- [x] P01-E02-T03: Create convex/functions.ts (Trigger Wrappers)
- [x] P01-E02-T04: Create Audit Logging Trigger
- [x] P01-E02-T05: Write Tests for Schema + Triggers

---

## Completion Summary

**Completed**: 2026-02-17

### What Was Built

| File | Purpose |
|------|---------|
| `convex/schema.ts` (531 lines) | Full schema with ALL 19 tables, typed union validators, all indexes, search indexes |
| `convex/convex.config.ts` (13 lines) | Component registration: workOSAuthKit, rateLimiter, 3 aggregate instances |
| `convex/functions.ts` (141 lines) | Central import point with trigger wrappers + audit triggers on 5 Phase 1 tables |
| `vitest.config.mts` (13 lines) | Vitest configuration with edge-runtime environment |
| `convex/schema.test.ts` (218 lines) | 5 tests covering INSERT/UPDATE audit logs, change diffs, actor resolution |

### Key Decisions & Deviations

1. **Full schema defined upfront** (deviation from epic spec "Phase 1 tables only"): Defined all 19 tables instead of 6 to avoid `v.id()` cross-reference issues (`guard_profiles.society_id` references `societies`). Tables without functions are inert.
2. **`audit_logs.by_creation_time` index removed**: `_creationTime` is a reserved Convex system field that cannot be explicitly indexed. All other indexes from the spec are included.
3. **Action string type casting**: `buildAuditAction()` uses `as AuditAction` cast because template literal `${TABLE}_${OP}` produces `string`, not the typed union. Type is derived from `Doc<"audit_logs">["action"]`.
4. **Actor resolution fallback**: When no auth identity exists (system operations, seed scripts), defaults to `actor_type: "SYSTEM"` with `actor_user_id: undefined`.
5. **Tests use wrapped mutations**: Test helpers define local mutations using the wrapped `mutation` from `functions.ts` (not raw `ctx.db`), so triggers fire end-to-end.

### Gotchas for Next Epic (P01-E03)

- **Import rule**: ALL domain files MUST import `{ mutation, query }` from `"./functions"`, never from `"_generated/server"`. ESLint enforces this.
- **Schema is deployed**: `npx convex dev --once --typecheck=enable` has been run. `_generated/` types include all 19 tables.
- **Audit triggers active on**: `users`, `guard_profiles`, `roles`, `user_role_assignments`, `system_config`. Any insert/update on these tables auto-creates `audit_logs` entries.
- **No triggers on `audit_logs`**: Prevents infinite recursion. Audit records are immutable.
- **`convex-test` pattern**: Use `import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"])` to load modules. Tests need the `getMutationHandler` pattern to invoke wrapped mutations (see `schema.test.ts`).
- **Pre-existing `tsc --noEmit` errors**: Root-level `npx tsc --noEmit` fails due to files in `reference/` directory (missing types). Use `npx tsc --noEmit --project convex/tsconfig.json` for Convex-only type checking.

### Verification

```
npx convex dev --once --typecheck=enable  → ✅ success
npx tsc --noEmit --project convex/tsconfig.json → ✅ success
npm run test → ✅ 5 tests passed (388ms)
```

---

## T01: Create convex/schema.ts (Phase 1 tables only)

### Objective
Define the Convex schema with Phase 1 tables (`users`, `guard_profiles`, `roles`, `user_role_assignments`, `system_config`, `audit_logs`) using typed union validators for all status and enum fields, and include all indexes.

### Required Reading
- `notes/10-convex-schema.md` — Full file (exact table definitions, validators, indexes)
- `notes/13-constants-reference.md` — "Status Enums" and "Type Enums" sections (all valid values for union validators)
- `notes/02-data-models.md` — Sections A (users) and B (RBAC) for field descriptions

### Key Rules
1. Use `v.union(v.literal("A"), v.literal("B"))` for ALL status and type fields — never `v.string()`.
2. Use `v.optional()` for fields that may be absent. Use `v.union(v.string(), v.null())` for explicitly nullable fields.
3. Include `is_deleted: v.boolean()` on `roles` and `user_role_assignments` — these use soft delete.
4. Do NOT include `is_deleted` on `users` — users use status (`ACTIVE`/`INACTIVE`/`BANNED`) instead.
5. Include ALL indexes as documented in `notes/10-convex-schema.md`.
6. The `audit_logs.action` field must use a typed union of ALL audit action strings from `notes/13-constants-reference.md`.
7. `audit_logs.changes` is an optional array of `{ field, old_value, new_value }` objects.
8. Only define Phase 1 tables in this task. Other tables (societies, buildings, leads, etc.) are added in later phases.

### Deliverables
- [ ] `convex/schema.ts` — Schema with tables: `users`, `guard_profiles`, `roles`, `user_role_assignments`, `system_config`, `audit_logs`

### Acceptance Criteria
1. File exports a `defineSchema()` with exactly 6 tables
2. `users.user_type` uses `v.union(v.literal("GUARD"), v.literal("ADMIN"))` — not `v.string()`
3. `users.status` uses `v.union(v.literal("ACTIVE"), v.literal("INACTIVE"), v.literal("BANNED"))`
4. `guard_profiles.guard_type` uses typed union of all 4 guard types
5. `roles` and `user_role_assignments` have `is_deleted: v.boolean()`
6. `audit_logs.action` uses typed union of ALL audit action strings (SOCIETIES_INSERT through SYSTEM_CONFIG_UPDATE)
7. All indexes from `notes/10-convex-schema.md` for these 6 tables are defined
8. `npx convex dev --once --typecheck=enable` succeeds

### Verification
```bash
npx convex dev --once --typecheck=enable
npx tsc --noEmit
```

### Out of Scope
- Tables for societies, buildings, leads, listings, visits, closures, payouts, incentive_cards, listing_inquiries, listing_photos, owner_verifications, guard_shifts, analytics_snapshots (added in later phases)
- Seed data (separate epic)

---

## T02: Create convex/convex.config.ts (Component Registration)

### Objective
Register all third-party Convex components: `@convex-dev/workos-authkit`, `@convex-dev/rate-limiter`, and `@convex-dev/aggregate` (with three named instances).

### Required Reading
- `notes/11-convex-architecture.md` — "Component Registration" section (exact config code)
- `notes/10-convex-schema.md` — "Component Registration" section (package imports)

### Key Rules
1. Use `defineApp()` from `convex/server` — not `defineSchema`.
2. Register `@convex-dev/workos-authkit` with default name.
3. Register `@convex-dev/rate-limiter` with default name.
4. Register `@convex-dev/aggregate` three times with named instances: `leadCounts`, `visitCounts`, `payoutTotals`.
5. Named instances use `{ name: "instanceName" }` as the second argument to `app.use()`.

### Deliverables
- [ ] `convex/convex.config.ts` — Component registration with workOSAuthKit, rateLimiter, and 3 aggregate instances

### Acceptance Criteria
1. File imports from `convex/server`, `@convex-dev/workos-authkit/convex.config`, `@convex-dev/rate-limiter/convex.config`, `@convex-dev/aggregate/convex.config`
2. `app.use(workOSAuthKit)` is called
3. `app.use(rateLimiter)` is called
4. Three `app.use(aggregate, { name: "..." })` calls exist for `leadCounts`, `visitCounts`, `payoutTotals`
5. `npx tsc --noEmit` passes

### Verification
```bash
npx tsc --noEmit
```

### Out of Scope
- Rate limiter configuration (separate file `convex/rateLimiter.ts`, later task)
- Aggregate trigger registration (later phase when analytics is implemented)

---

## T03: Create convex/functions.ts (Trigger Wrappers)

### Objective
Create the central import point (`convex/functions.ts`) that wraps raw mutations with trigger middleware, enabling automatic audit logging. All domain files MUST import `mutation` and `internalMutation` from this file, never from `_generated/server`.

### Required Reading
- `notes/11-convex-architecture.md` — "Wrapped Mutations (Audit + Auth)" section (full code pattern)
- `notes/07-audit-trail.md` — "Trigger Setup" section (AUDITED_TABLES list)

### Key Rules
1. Import `rawMutation`, `rawInternalMutation`, `rawQuery`, `rawInternalQuery` from `./_generated/server` (rename on import).
2. Import `Triggers` from `convex-helpers/server/triggers`.
3. Import `customCtx`, `customMutation`, `customQuery` from `convex-helpers/server/customFunctions`.
4. Create a `Triggers<DataModel>()` instance.
5. Export `mutation = customMutation(rawMutation, customCtx(triggers.wrapDB))`.
6. Export `internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB))`.
7. Export `query = rawQuery` — queries don't need trigger wrapping.
8. Export `internalQuery = rawInternalQuery` — same reason.
9. Do NOT register triggers in this task — T04 handles that. This task creates the infrastructure.

### Deliverables
- [ ] `convex/functions.ts` — Exports `mutation`, `internalMutation`, `query`, `internalQuery` with trigger wrapping

### Acceptance Criteria
1. `mutation` export wraps `rawMutation` with `triggers.wrapDB`
2. `internalMutation` export wraps `rawInternalMutation` with `triggers.wrapDB`
3. `query` re-exports the raw query directly
4. `internalQuery` re-exports the raw internalQuery directly
5. `triggers` instance is exported (or accessible) for T04 to register triggers on
6. `npx tsc --noEmit` passes

### Verification
```bash
npx tsc --noEmit
```

### Out of Scope
- Registering actual audit triggers (T04)
- Domain mutation files (later epics)
- `computeChanges` diff function (T04)

---

## T04: Create Audit Logging Trigger

### Objective
Register triggers on all Phase 1 business tables (users, guard_profiles, roles, user_role_assignments, system_config) that automatically create `audit_logs` entries with actor, action, entity, and field-level change diffs.

### Required Reading
- `notes/07-audit-trail.md` — Full file (what gets logged, change diff format, business rules)
- `notes/11-convex-architecture.md` — "Wrapped Mutations (Audit + Auth)" section (trigger registration, computeChanges function)
- `notes/13-constants-reference.md` — "Audit Action Strings" section (naming convention)

### Key Rules
1. Action naming convention: `{TABLE_NAME}_{OPERATION}` where OPERATION is `INSERT`, `UPDATE`, or `DELETE`. Example: `USERS_INSERT`, `GUARD_PROFILES_UPDATE`.
2. `TABLE_NAME` is the Convex table name in UPPERCASE (e.g., `users` → `USERS`, `guard_profiles` → `GUARD_PROFILES`).
3. The `computeChanges()` function computes field-level diffs between `oldDoc` and `newDoc`:
   - On INSERT: no changes array (oldDoc is null)
   - On UPDATE: array of `{ field, old_value, new_value }` for each changed field
   - On DELETE: no changes array (newDoc is null)
   - Skip internal fields (`_id`, `_creationTime`)
4. Actor is resolved from `ctx.auth.getUserIdentity()` — the `subject` field maps to `workos_user_id`, which maps to a `users` record. If no identity, use `actor_type: "SYSTEM"`.
5. `actor_type` is determined by looking up the user's `user_type` field. If no authenticated user, default to `"SYSTEM"`.
6. Register triggers for Phase 1 tables only: `users`, `guard_profiles`, `roles`, `user_role_assignments`, `system_config`.
7. Audit logs are **immutable** — never edit or delete audit records.

### Deliverables
- [ ] `convex/functions.ts` — Updated with audit trigger registrations for 5 Phase 1 tables and `computeChanges()` function

### Acceptance Criteria
1. Triggers are registered for: `users`, `guard_profiles`, `roles`, `user_role_assignments`, `system_config`
2. Each trigger creates an `audit_logs` entry with correct `action` string (e.g., `USERS_INSERT`)
3. `computeChanges()` returns `undefined` for INSERT operations
4. `computeChanges()` returns an array of field diffs for UPDATE operations, skipping `_id` and `_creationTime`
5. `actor_type` is correctly determined from authenticated user's `user_type`, or `"SYSTEM"` if no auth
6. `entity_type` is the table name (e.g., `"users"`, `"guard_profiles"`)
7. `entity_id` is the document `_id` as a string
8. `npx tsc --noEmit` passes

### Verification
```bash
npx tsc --noEmit
```

### Out of Scope
- Triggers for non-Phase-1 tables (societies, buildings, leads, etc.) — added when those tables are created
- Audit log viewer UI (Phase 13)
- Audit data export (V2)

---

## T05: Write Tests for Schema + Triggers

### Objective
Write automated tests using `convex-test` and `vitest` that verify the schema is valid and audit triggers fire correctly on insert and update operations.

### Required Reading
- `notes/11-convex-architecture.md` — "Testing Approach" section (convexTest pattern)
- `notes/07-audit-trail.md` — "Change Diff Format" section (expected diff structure)

### Key Rules
1. Create a test setup with `const modules = import.meta.glob("./**/*.*s")` to load all Convex modules.
2. Use `convexTest(schema, modules)` to create the test environment.
3. Use `t.withIdentity()` to mock authenticated users.
4. Seed test data using `t.run(async (ctx) => { await ctx.db.insert(...) })`.
5. After mutations, query `audit_logs` to verify trigger fired.
6. Audit action strings must match `{TABLE_NAME}_{OPERATION}` convention exactly.
7. Add a `test` script to `package.json`: `"test": "vitest run"`.
8. Add a vitest config file that works with Convex.

### Deliverables
- [ ] `convex/schema.test.ts` — Tests for schema validity and audit trigger behavior
- [ ] `vitest.config.mts` — Vitest configuration for Convex testing
- [ ] `package.json` — Updated with `"test": "vitest run"` script

### Acceptance Criteria
1. Test: inserting a `users` record creates an `audit_logs` entry with `action: "USERS_INSERT"` and correct `entity_type: "users"`
2. Test: updating a `users` record creates an `audit_logs` entry with `action: "USERS_UPDATE"` and a `changes` array containing the modified field(s)
3. Test: the `changes` array has `{ field, old_value, new_value }` entries only for fields that actually changed
4. Test: `_id` and `_creationTime` fields are excluded from the `changes` array
5. Test: inserting a `roles` record creates an audit log with `action: "ROLES_INSERT"`
6. `npm run test` passes all tests

### Verification
```bash
npm run test
```

### Out of Scope
- Integration tests with WorkOS (requires live API)
- End-to-end tests (later phase)
- Tests for non-Phase-1 tables
