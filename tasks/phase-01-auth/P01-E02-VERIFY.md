---
epic_id: P01-E02
title: "Convex Schema + Core Infrastructure Verification"
type: code
status: pending
depends_on_epic: P01-E02
verified_at: null
failures: 0
---

# P01-E02 Verification: Convex Schema + Core Infrastructure

## Readiness Gates

- [ ] Epic frontmatter shows `status: done` in `tasks/phase-01-auth/P01-E02-schema-and-infra.md`
- [ ] Completion Summary exists and listed deviations are reviewed before execution
- [ ] Dev server running: `npm run dev:force` (http://localhost:3000)
- [ ] Convex dev running: `npx convex dev` (http://127.0.0.1:3210)
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Test login route reachable: http://localhost:3000/dev/login
- [ ] Test admin account available: `admin@example.com` / `DevAdmin123!`
- [ ] Test guard account available: `9999999999@guards.local` / `DevGuard123!`

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit --project convex/tsconfig.json

# Build
npm run build

# Tests
npm run test -- convex/schema.test.ts

# Convex schema/typecheck push
npx convex dev --once --typecheck=enable
```

**Expected**: All commands exit 0.

---

## Scenarios

### V01: Schema Validators + Indexes Cover Phase 1 Requirements — AC Ref: T01-AC1, T01-AC2, T01-AC3, T01-AC4, T01-AC5, T01-AC6, T01-AC7, T01-AC8

**Precondition**: `convex/schema.ts` exists and generated types are up to date.

**Actions**:

1. Inspect `convex/schema.ts` for required Phase 1 table definitions and typed unions.
2. Confirm `users.user_type`, `users.status`, and `guard_profiles.guard_type` use `v.union(v.literal(...))`.
3. Confirm `roles` and `user_role_assignments` include `is_deleted: v.boolean()`.
4. Confirm `audit_logs.action` is a typed union from audit action constants.
5. Verify indexes for required tables and run `npx convex dev --once --typecheck=enable`.

**Assert**:

- [ ] Phase 1 required tables exist with correct field validators.
- [ ] Required typed unions are used instead of loose strings.
- [ ] Required soft-delete fields exist on RBAC assignment tables.
- [ ] Audit action validator is strongly typed to known action strings.
- [ ] Required indexes are present for covered Phase 1 tables.
- [ ] Convex typecheck push succeeds.

**Evidence**: file snapshot + terminal output

---

### V02: Component Registration Is Complete — AC Ref: T02-AC1, T02-AC2, T02-AC3, T02-AC4, T02-AC5

**Precondition**: `convex/convex.config.ts` exists.

**Actions**:

1. Inspect imports for `defineApp`, WorkOS AuthKit config, rate limiter config, and aggregate config.
2. Verify `app.use(workOSAuthKit)` and `app.use(rateLimiter)` calls.
3. Verify exactly three named aggregate component registrations: `leadCounts`, `visitCounts`, `payoutTotals`.
4. Run `npx tsc --noEmit --project convex/tsconfig.json`.

**Assert**:

- [ ] Required imports are present.
- [ ] WorkOS component is registered.
- [ ] Rate limiter component is registered.
- [ ] All three named aggregate instances are registered.
- [ ] TypeScript compile passes.

**Evidence**: file snapshot + terminal output

---

### V03: Wrapped Function Exports Use Trigger Middleware — AC Ref: T03-AC1, T03-AC2, T03-AC3, T03-AC4, T03-AC5, T03-AC6

**Precondition**: `convex/functions.ts` is present.

**Actions**:

1. Inspect `mutation` and `internalMutation` exports for `customMutation(..., customCtx(triggers.wrapDB))`.
2. Verify `query` and `internalQuery` directly re-export raw query handlers.
3. Confirm trigger instance is exported or accessible for trigger registration.
4. Run TypeScript check for Convex project.

**Assert**:

- [ ] Mutation wrappers use trigger middleware.
- [ ] Internal mutation wrappers use trigger middleware.
- [ ] Query and internal query remain raw.
- [ ] Trigger instance is available for registrations.
- [ ] TypeScript compile passes.

**Evidence**: file snapshot + terminal output

---

### V04: Audit Trigger Behavior Matches Contract — AC Ref: T04-AC1, T04-AC2, T04-AC3, T04-AC4, T04-AC5, T04-AC6, T04-AC7, T04-AC8

**Precondition**: Audit trigger registrations are defined in `convex/functions.ts`.

**Actions**:

1. Inspect registered audited tables (`users`, `guard_profiles`, `roles`, `user_role_assignments`, `system_config`).
2. Inspect action construction and verify naming convention aligns with `{TABLE}_{OP}`.
3. Inspect `computeChanges()` logic for update diffs and internal field exclusions.
4. Inspect actor/entity resolution logic for auth and system fallback.
5. Run Convex tests covering insert/update audit paths.

**Assert**:

- [ ] Triggers are registered for all required Phase 1 audited tables.
- [ ] Action strings are generated correctly for inserts/updates.
- [ ] `computeChanges()` returns `undefined` for insert and diff array for updates.
- [ ] Diff array excludes `_id` and `_creationTime`.
- [ ] `actor_type` resolves from authenticated user or falls back to `SYSTEM`.
- [ ] `entity_type` and `entity_id` fields are correctly populated.
- [ ] TypeScript compile passes.

**Evidence**: test output + file snapshot

---

### V05: Automated Tests Cover Schema + Trigger Paths — AC Ref: T05-AC1, T05-AC2, T05-AC3, T05-AC4, T05-AC5, T05-AC6

**Precondition**: `convex/schema.test.ts` and vitest setup are present.

**Actions**:

1. Run `npm run test -- convex/schema.test.ts`.
2. Inspect tests for users insert/update audit behavior and roles insert behavior.
3. Confirm tests assert diff content and internal field exclusions.

**Assert**:

- [ ] Users insert test asserts `USERS_INSERT` + correct `entity_type`.
- [ ] Users update test asserts `USERS_UPDATE` + populated change diff.
- [ ] Changes contain only fields that actually changed.
- [ ] Internal fields are excluded from change array.
- [ ] Roles insert test asserts `ROLES_INSERT`.
- [ ] Test suite passes.

**Evidence**: terminal output + test file snapshot

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
