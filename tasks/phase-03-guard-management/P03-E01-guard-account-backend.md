---
id: P03-E01
title: Guard Account Backend
phase: 3
status: done
depends_on: ["P01-E08", "P02-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P03-E01: Guard Account Backend

## Overview

Implement the complete guard backend: WorkOS Actions for external API calls (create account, reset password, suspend/unsuspend), guard mutations (create profile, update profile, manage status with state machine validation), and guard queries (list with filters, getById with stats, search, guard-facing profile). This is the first Convex Action file in the project — `convex/actions/workos.ts`.

## Prerequisites

- **Read first**: [P02-E01 Completion Summary](../phase-02-society-registry/P02-E01-society-crud.md#completion-summary) — know what society infrastructure exists (guards are assigned to societies).
- Phase 1 is fully complete: auth helpers, guard login, RBAC, seed script all working.
- Phase 2 E01 (Society CRUD) is complete: societies exist for guard assignment. (E02 Building CRUD is NOT a dependency for guard accounts — buildings are only needed in E03 for shift locations.)

## Task Queue

- [x] P03-E01-T01: WorkOS Actions for Guard Lifecycle
- [x] P03-E01-T02: Guard Mutations (Create + Update Profile)
- [x] P03-E01-T03: Guard Status Management (Transitions + Ban Cascade)
- [x] P03-E01-T04: Guard Queries (List + GetById + Search + MyProfile)
- [x] P03-E01-T05: Guard Backend Tests

---

## T01: WorkOS Actions for Guard Lifecycle

### Objective

Create `convex/actions/workos.ts` — the first Convex Action file in the project. Implements four Actions that call the WorkOS User Management API: create guard account, reset guard password, suspend guard (ban), and unsuspend guard (reinstate). Each Action calls WorkOS first, then runs an internal Convex mutation to sync state.

### Required Reading

- `notes/11-convex-architecture.md` — "Actions Layer" section (Action pattern for external API calls, error handling)
- `notes/features/02-guard-management.md` — "User Stories: Admin Create Guard Account", "Admin Reset Guard Password" sections
- `notes/01-tech-stack.md` — "Authentication Architecture" (WorkOS User Management API, synthetic email pattern)

### Key Rules

1. File: `convex/actions/workos.ts`. This is the FIRST Action file — create the `convex/actions/` directory.
2. Import `action` and `internalAction` from `../_generated/server`. Actions do NOT use the `./functions` wrapper (Actions cannot be wrapped for audit — audit happens in the internal mutations they call).
3. Import `internal` from `../_generated/api` for calling internal mutations.
4. Import `v` from `convex/values` for argument validators.
5. Initialize WorkOS client: `const workos = new WorkOS(process.env.WORKOS_API_KEY!)`. The API key is set as a Convex environment variable.
6. **`createGuardAccount` Action**:
   - Args: `{ name: v.string(), phone: v.string(), society_id: v.id("societies"), guard_type: v.string(), temp_password: v.string() }`
   - Compute synthetic email: `${phone}@guards.local`
   - Call `workos.userManagement.createUser({ email: syntheticEmail, password: temp_password, firstName: name })`
   - Then call `ctx.runMutation(internal.guards.createInternal, { workos_user_id: workosUser.id, name, phone, society_id, guard_type })` to create Convex records
   - Return `{ user_id, workos_user_id: workosUser.id }`
   - **Error handling**: If WorkOS call fails, throw immediately (no partial state). If the internal mutation fails after WorkOS succeeds, the WorkOS user exists but has no Convex records — this is recoverable by admin retry.
7. **`resetGuardPassword` Action**:
   - Args: `{ workos_user_id: v.string(), user_id: v.id("users"), new_temp_password: v.string() }`
   - Call `workos.userManagement.updateUser(workos_user_id, { password: new_temp_password })`
   - Then call `ctx.runMutation(internal.guards.setMustChangePassword, { user_id })` to set `must_change_password: true`
   - Return `{ success: true }`
8. **`suspendGuard` Action**:
   - Args: `{ workos_user_id: v.string(), user_id: v.id("users"), reason: v.string() }`
   - Call WorkOS to suspend the user (check WorkOS docs for exact API — may be `updateUser` with a suspended flag or a separate endpoint)
   - Then call `ctx.runMutation(internal.guards.banGuardInternal, { user_id, reason })` to set status `BANNED` + flag pending visits
   - Return `{ success: true }`
9. **`unsuspendGuard` Action**:
   - Args: `{ workos_user_id: v.string(), user_id: v.id("users"), new_status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")) }`
   - Call WorkOS to unsuspend the user
   - Then call `ctx.runMutation(internal.guards.updateStatusInternal, { user_id, status: new_status })` to update Convex status
   - Return `{ success: true }`
10. **RBAC inside Actions (MANDATORY)**: Each Action MUST verify the caller has the required permission server-side. Actions can access auth via `ctx.auth.getUserIdentity()`. Pattern:
    ```typescript
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    // Look up Convex user + check permission via internal query
    const authCheck = await ctx.runQuery(internal.guards.checkPermission, {
      permission: "guards.create",
    });
    if (!authCheck.authorized) throw new Error("Missing permission: guards.create");
    ```
    Create a reusable `internal.guards.checkPermission` internal query that mirrors `requirePermission` logic but is callable from Actions. NEVER rely on frontend-only permission gating.
11. Permission mapping: `createGuardAccount` requires `guards.create`, `resetGuardPassword` requires `guards.reset_password`, `suspendGuard` / `unsuspendGuard` require `guards.manage_status`.

### Deliverables

- [ ] `convex/actions/workos.ts` — Four Actions: `createGuardAccount`, `resetGuardPassword`, `suspendGuard`, `unsuspendGuard`

### Acceptance Criteria

1. `convex/actions/` directory exists with `workos.ts` file
2. `createGuardAccount` creates a WorkOS user with synthetic email and returns user IDs
3. `resetGuardPassword` updates password in WorkOS and sets `must_change_password: true`
4. `suspendGuard` suspends in WorkOS and updates Convex status to BANNED
5. `unsuspendGuard` unsuspends in WorkOS and updates Convex status to ACTIVE or INACTIVE
6. All Actions use proper Convex validators (`v.string()`, `v.id()`, etc.)
7. Error from WorkOS API propagates as an action error (no silent failures)
8. Each Action rejects unauthenticated or unauthorized callers (server-side RBAC)
9. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Guard login/password change Server Actions (already in P01-E04 — those run on Next.js server for cookie handling)
- Voluntary password change from guard profile (reuses P01-E04 Server Action)
- Rate limiting on Actions (V1 trusts admin access)
- Retry logic for failed WorkOS calls (V1 relies on admin retry)

---

## T02: Guard Mutations (Create + Update Profile)

### Objective

Create `convex/guards.ts` with the `createInternal` internal mutation (called by WorkOS Action), a `create` mutation (admin-facing entry point that validates + calls the Action), and an `updateProfile` mutation for editing guard details. Phone uniqueness enforced. Society reassignment handled with a comment about old leads.

### Required Reading

- `notes/features/02-guard-management.md` — "User Stories: Admin Create Guard Account", "Admin Edit Guard Profile" sections
- `notes/02-data-models.md` — Sections C (User) and D (Guard Profile) — all field definitions and indexes
- `notes/10-convex-schema.md` — `users` and `guard_profiles` table validators
- `notes/13-constants-reference.md` — `GUARD_TYPE` enum, `guards.*` permissions, audit actions

### Key Rules

1. File: `convex/guards.ts`. Import `mutation` and `query` from `./functions` (audit-wrapped, used for all client-facing functions). Import `internalMutation` and `internalQuery` from `_generated/server` (used for functions called only by other server functions — Actions, schedulers). **Never mix**: client-facing = `./functions`, internal = `_generated/server`.
2. **`createInternal` internal mutation**:
   - Called by `actions/workos.ts` `createGuardAccount` Action (not directly by frontend).
   - Args: `{ workos_user_id, name, phone, society_id, guard_type }`
   - Creates `users` record: `{ workos_user_id, user_type: "GUARD", name, phone, status: "ACTIVE", must_change_password: true }`
   - Creates `guard_profiles` record: `{ user_id, society_id, guard_type, has_seen_onboarding: false }`
   - Returns the `user_id`
3. **`create` mutation** (admin-facing):
   - Args: `{ name: v.string(), phone: v.string(), society_id: v.id("societies"), guard_type: v.string(), temp_password: v.string() }`
   - RBAC: `requirePermission(ctx, "guards.create")`
   - Validate phone: 10 digits exactly (use `normalizePhone` from `lib/validators.ts`). Strip all non-digits.
   - Phone uniqueness: Query `users` table with `by_phone` index. Throw if another user with this phone exists.
   - Validate society exists: `ctx.db.get(society_id)`. Throw if not found.
   - Validate guard_type: Must be one of `BUILDING_SPECIFIC`, `MAIN_GATE`, `PARK`, `ROVING`.
   - **Recommended pattern**: The `create` mutation is NOT needed as a separate entry point. The frontend calls `api.actions.workos.createGuardAccount` Action directly. The Action does its own RBAC check (rule 10 in T01), validates args, calls WorkOS, then calls `createInternal`. This avoids the problem of mutations being unable to call Actions synchronously.
   - The `create` mutation still exists as a **validation-only helper** if needed by tests — but the primary flow is frontend → Action → internal mutation.
4. **`updateProfile` mutation**:
   - Args: `{ user_id: v.id("users"), name?: v.optional(v.string()), guard_type?: v.optional(v.string()), society_id?: v.optional(v.id("societies")), metadata?: v.optional(v.object({...})) }`
   - RBAC: `requirePermission(ctx, "guards.edit")`
   - Validate user exists and is a GUARD. Throw otherwise.
   - If `name` is provided: update `users.name` (trim, non-empty).
   - If `guard_type` is provided: validate against enum. Update `guard_profiles.guard_type`.
   - If `society_id` is provided AND different from current: validate society exists. Update `guard_profiles.society_id`. This is a reassignment — old leads remain linked to the old society. **Additionally, soft-delete all existing shifts for this guard** (new society = new buildings, old shift locations are invalid). Query `guard_shifts` by `by_guard_user_id` index, set `is_deleted: true` on each non-deleted shift.
   - If `metadata` is provided: merge with existing metadata (don't overwrite entire object).
   - Audit log auto-generated via function wrapper.
5. **`setMustChangePassword` internal mutation**: Set `must_change_password: true` on user record.
6. **`clearMustChangePassword` internal mutation**: Set `must_change_password: false` on user record.
7. Use `GUARD_TYPE` enum values from `lib/constants.ts` — never hardcode strings.

### Deliverables

- [ ] `convex/guards.ts` — `createInternal` (internal mutation — called by Action), `checkPermission` (internal query — used by Actions to verify RBAC), `updateProfile` (mutation), `setMustChangePassword` (internal), `clearMustChangePassword` (internal)

**Note**: No client-facing `create` mutation is needed. The primary flow is frontend → `api.actions.workos.createGuardAccount` Action → `internal.guards.createInternal`. The Action does RBAC via `checkPermission`.

### Acceptance Criteria

1. Guard creation produces both `users` record (type GUARD, status ACTIVE, must_change_password true) and `guard_profiles` record (linked user, society, type, onboarding false)
2. Phone uniqueness: creating two guards with same phone throws error
3. Phone validation: non-10-digit phone throws error
4. Invalid guard type throws error
5. Invalid society_id throws error
6. `updateProfile` can change name, guard_type, society_id independently
7. Society reassignment updates `guard_profiles.society_id` and soft-deletes all existing shifts (new society invalidates old building-based shift locations)
8. Mutations without correct permissions throw auth error
9. Audit logs auto-generated for all mutations
10. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Phone number change (rare admin operation, defer to V1.1 if needed — requires updating WorkOS synthetic email)
- Guard status changes (T03)
- Guard queries (T04)
- Shift management (E03)

---

## T03: Guard Status Management (Transitions + Ban Cascade)

### Objective

Add `updateStatus` and `banGuardInternal` mutations to `convex/guards.ts`. Enforce the guard status state machine (7 valid transitions, all others rejected). The ban flow sets status to BANNED, flags pending visits for reassignment (`needs_reassignment: true`), and stores the ban reason.

### Required Reading

- `notes/04-state-machines.md` — "Guard Status" section (complete transition table + capabilities matrix)
- `notes/features/02-guard-management.md` — "User Stories: Admin Change Guard Status" section (ban dialog, in-flight items)
- `notes/13-constants-reference.md` — Audit actions: `USERS_UPDATE`, `GUARD_PROFILES_UPDATE`

### Key Rules

1. **`updateStatus` mutation** (admin-facing):
   - Args: `{ user_id: v.id("users"), status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE"), v.literal("BANNED")), reason?: v.optional(v.string()) }`
   - RBAC: `requirePermission(ctx, "guards.manage_status")`
   - Fetch current user status. Validate transition against state machine:
     - `ACTIVE` → `INACTIVE`: Allowed. Guard can still login, cannot submit leads or handle visits.
     - `ACTIVE` → `BANNED`: Allowed. **Requires `reason` (throw if missing)**. Triggers ban cascade.
     - `INACTIVE` → `ACTIVE`: Allowed. Restores full capabilities.
     - `INACTIVE` → `BANNED`: Allowed. **Requires `reason`**. Triggers ban cascade.
     - `BANNED` → `ACTIVE`: Allowed. Full reinstatement. Calls unsuspend Action.
     - `BANNED` → `INACTIVE`: Allowed. Partial reinstatement (can login, cannot submit). Calls unsuspend Action.
     - All other transitions: Throw `"Invalid status transition from {current} to {new}"`.
   - For transitions TO `BANNED`: Call `ctx.scheduler.runAfter(0, internal.actions.workos.suspendGuard, { workos_user_id, user_id, reason })`.
   - For transitions FROM `BANNED`: Call `ctx.scheduler.runAfter(0, internal.actions.workos.unsuspendGuard, { workos_user_id, user_id, new_status })`.
   - For `ACTIVE` ↔ `INACTIVE` (no WorkOS change needed): Just update `users.status` directly.
   - Update `users.status` in Convex.
2. **`banGuardInternal` internal mutation** (called by `suspendGuard` Action):
   - Args: `{ user_id: v.id("users"), reason: v.string() }`
   - Set `users.status` to `"BANNED"`.
   - Query `visits` table for this guard where status NOT in terminal states (`COMPLETED`, `CANCELLED`, `NO_SHOW`). Set `needs_reassignment: true` on each.
   - **Note**: The `visits` table already exists in schema (P01-E02). If no visit records exist yet (Phase 7 not implemented), this query returns empty — that's fine.
3. **`updateStatusInternal` internal mutation** (called by `unsuspendGuard` Action):
   - Args: `{ user_id: v.id("users"), status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")) }`
   - Set `users.status` to the provided value.
4. **`getInFlightItems` query** (for ban dialog):
   - Args: `{ user_id: v.id("users") }`
   - RBAC: `requirePermission(ctx, "guards.view")`
   - Returns `{ pending_visits: number, active_leads: number }` — counts of non-terminal items.
   - Used by the ban confirmation dialog to show "2 pending visits, 3 active leads".
   - If visits/leads tables have no data yet (early phases), returns zeros.

### Deliverables

- [ ] `convex/guards.ts` — `updateStatus` (mutation), `banGuardInternal` (internal), `updateStatusInternal` (internal), `getInFlightItems` (query)

### Acceptance Criteria

1. `ACTIVE` → `INACTIVE` succeeds without reason
2. `ACTIVE` → `BANNED` succeeds with reason
3. `ACTIVE` → `BANNED` without reason throws error
4. `INACTIVE` → `ACTIVE` succeeds (reinstatement)
5. `INACTIVE` → `BANNED` succeeds with reason
6. `BANNED` → `ACTIVE` succeeds (full reinstatement, triggers unsuspend)
7. `BANNED` → `INACTIVE` succeeds (partial reinstatement)
8. Any same-status transition throws (e.g., `ACTIVE` → `ACTIVE`)
9. Ban cascade: pending visits get `needs_reassignment: true`
10. `getInFlightItems` returns correct counts (or zeros when no data)
11. Mutations without correct permissions throw auth error
12. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Quality scoring that triggers auto-ban suggestions (Phase 11)
- Browser fingerprint tracking on login (Phase 11)
- Visit reassignment logic after flagging (Phase 7 — Phase 3 only FLAGS, doesn't reassign)

---

## T04: Guard Queries (List + GetById + Search + MyProfile)

### Objective

Add query functions to `convex/guards.ts`: admin-facing list with filters/counts, getById with aggregated stats, search by name/phone, and guard-facing own profile query. All admin queries require RBAC. Guard-facing query uses `requireAuth` + GUARD type check (NOT `requireGuard`, which blocks INACTIVE guards — see Key Rule 4).

### Required Reading

- `notes/features/02-guard-management.md` — "Convex Functions: Queries" section (all function signatures)
- `notes/02-data-models.md` — Sections C (User) and D (Guard Profile) — indexes to use
- `notes/10-convex-schema.md` — `users` and `guard_profiles` indexes
- `notes/06-admin-panel-ux.md` — Guard list page columns (Name, Phone, Society, Type, Status, Leads, Verified Rate)

### Key Rules

1. **`list` query**:
   - Args: `{ society_id?: v.optional(v.id("societies")), guard_type?: v.optional(v.string()), status?: v.optional(v.string()), search?: v.optional(v.string()) }`
   - RBAC: `requirePermission(ctx, "guards.view")`
   - Base query: `guard_profiles` table. Join with `users` table for name, phone, status.
   - If `society_id` filter: use `by_society_id` index on `guard_profiles`.
   - If `guard_type` filter: use `by_guard_type` index (or `by_society_and_type` if combined with society).
   - If `status` filter: filter by `users.status` after join.
   - If `search`: filter by name or phone containing the search string (case-insensitive).
   - Enrich each result with: `lead_count` (total leads by this guard), `verified_rate` (% of leads that were VERIFIED). Query `leads` table with `by_submitted_by_guard_id` index (field is `submitted_by_guard_id`, NOT `guard_user_id`).
   - V1 scale: ~50 guards max. N+1 enrichment queries acceptable. Add comment: `// V1: ~50 guards, pagination and count optimization deferred`.
   - Return: `(GuardProfile & User & { lead_count, verified_rate, society_name })[]`
2. **`getById` query**:
   - Args: `{ user_id: v.id("users") }`
   - RBAC: `requirePermission(ctx, "guards.view")`
   - Fetch `users` record + `guard_profiles` record (via `by_user_id` index).
   - Enrich with:
     - `society_name`: from linked society
     - `lead_count`: total leads submitted
     - `verified_lead_count`: leads with status VERIFIED
     - `visit_count`: total visits assigned (query visits table)
     - `completed_visit_count`: visits with status COMPLETED
     - `payout_total_paise`: sum of PAID payouts (query payouts table)
   - If user doesn't exist or isn't a GUARD, return null.
   - Return: `(GuardProfile & User & stats) | null`
3. **`search` query**:
   - Args: `{ search: v.string(), society_id?: v.optional(v.id("societies")), status?: v.optional(v.string()) }`
   - RBAC: `requirePermission(ctx, "guards.view")`
   - Search by name (substring match, case-insensitive) or phone (prefix match).
   - No search index on users — use manual filter. V1 scale makes this acceptable.
   - Limit results to 50.
4. **`getMyProfile` query** (guard-facing):
   - Args: none (uses auth context)
   - Auth: Use `requireAuth(ctx)` + verify `user_type === "GUARD"`. Do NOT use `requireGuard(ctx)` here — `requireGuard` enforces `status === "ACTIVE"`, which would block INACTIVE guards from seeing their own profile. Per spec, INACTIVE guards can still login and view their history/profile.
   - Returns own `guard_profiles` record + `users` record + `society_name` + badge info (empty array if no incentive data yet).
   - This powers the guard profile page (ID card).
   - **BANNED guards are already blocked by `requireAuth`** (it throws for BANNED status), so they cannot reach this query.
5. All queries must handle missing/null data gracefully (leads/visits/payouts tables may have no data in early phases).
6. Join pattern: Query `guard_profiles`, then `ctx.db.get(profile.user_id)` for user record. Filter out profiles where user is null (should never happen, but defensive).

### Deliverables

- [ ] `convex/guards.ts` — `list` query, `getById` query, `search` query, `getMyProfile` query

### Acceptance Criteria

1. `guards.list({})` returns all guards with lead_count, verified_rate, society_name
2. `guards.list({ society_id })` returns only guards in that society
3. `guards.list({ status: "ACTIVE" })` returns only active guards
4. `guards.list({ guard_type: "MAIN_GATE" })` returns only main gate guards
5. `guards.getById({ user_id })` returns guard with full stats (lead_count, visit_count, payout_total)
6. `guards.getById` for non-existent or non-GUARD user returns null
7. `guards.search({ search: "Raj" })` returns guards matching "Raj" in name
8. `guards.search({ search: "98765" })` returns guards matching phone prefix
9. `guards.getMyProfile()` returns own profile when called by ACTIVE guard
10. `guards.getMyProfile()` returns own profile when called by INACTIVE guard (can view, just can't submit)
11. `guards.getMyProfile()` throws for BANNED guards (blocked by `requireAuth`)
12. `guards.getMyProfile()` throws for non-guard callers (ADMIN user_type)
13. All admin queries reject unauthenticated or unauthorized callers
14. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
npm run build
```

### Out of Scope

- Guard shift queries (E03)
- Guard earnings detail query (Phase 9 — `getById` includes total payout only)
- Guard incentive badge query (Phase 10 — `getMyProfile` includes empty badges array)

---

## T05: Guard Backend Tests

### Objective

Write comprehensive tests for guard mutations, queries, and WorkOS Actions using `convex-test` and `vitest`. Cover guard creation, profile updates, status transitions (all 7 valid + invalid ones), phone uniqueness, RBAC, and query enrichment.

### Required Reading

- `notes/11-convex-architecture.md` — "Testing Patterns" section (convex-test setup)
- `notes/04-state-machines.md` — "Guard Status" transition table (all valid/invalid transitions)
- Existing test files from P01 and P02 (e.g., `convex/societies.test.ts`) for format reference

### Key Rules

1. Test file: `convex/guards.test.ts`.
2. Use `convex-test` + `vitest`.
3. **Guard creation tests**:
   - Happy path: create guard with valid data → both `users` and `guard_profiles` records created
   - Phone uniqueness: creating two guards with same phone throws
   - Invalid phone (not 10 digits) throws
   - Invalid guard type throws
   - Invalid society_id throws
   - Permission denied for non-admin
4. **Profile update tests**:
   - Update name, guard_type, society_id independently
   - Update non-GUARD user throws
   - Permission denied
5. **Status transition tests** (cover ALL from state machine):
   - `ACTIVE` → `INACTIVE`: success
   - `ACTIVE` → `BANNED` with reason: success
   - `ACTIVE` → `BANNED` without reason: throws
   - `INACTIVE` → `ACTIVE`: success
   - `INACTIVE` → `BANNED` with reason: success
   - `BANNED` → `ACTIVE`: success
   - `BANNED` → `INACTIVE`: success
   - `ACTIVE` → `ACTIVE`: throws (same status)
   - Any other invalid transition: throws
6. **Ban cascade test**: When guard is banned, any pending visits get `needs_reassignment: true`. (Create test visit records if visits table is available in schema.)
7. **Query tests**:
   - `list`: no filters, society filter, type filter, status filter, combined filters
   - `getById`: found with stats, not found
   - `search`: name match, phone match, no match
   - `getMyProfile`: ACTIVE guard → success, INACTIVE guard → success (can view), BANNED guard → throws, admin context → throws
8. **Society reassignment test**: When guard's society changes, all existing shifts are soft-deleted.
9. **WorkOS Action tests**: Mock the WorkOS SDK. Verify the internal mutations are called with correct args. Verify RBAC check inside Actions rejects unauthorized callers. Use `vi.mock()` for the WorkOS client.
10. Mock auth context for permission tests (authorized + unauthorized).

### Deliverables

- [ ] `convex/guards.test.ts` — Comprehensive test suite (≥25 test cases)

### Acceptance Criteria

1. All tests pass: `npm run test -- convex/guards.test.ts`
2. Guard creation: ≥4 test cases (happy path, phone uniqueness, invalid phone, invalid type, permission denied)
3. Profile update: ≥3 test cases
4. Status transitions: ≥9 test cases (7 valid + 2 invalid)
5. Ban cascade: ≥1 test case (visits flagged)
6. List query: ≥4 test cases (no filter, society, type, status)
7. GetById: ≥2 test cases (found, not found)
8. Search: ≥2 test cases (match, no match)
9. MyProfile: ≥4 test cases (ACTIVE guard, INACTIVE guard, BANNED guard, non-guard)
10. Society reassignment: ≥1 test case (shifts wiped on society change)
11. Action RBAC: ≥2 test cases (authorized + unauthorized caller)
12. `npx tsc --noEmit` passes

### Verification

```bash
npm run test -- convex/guards.test.ts
npx tsc --noEmit
```

### Out of Scope

- UI/component tests (manual verification for V1)
- Shift tests (E03-T05)
- Integration tests with real WorkOS (mocked in tests)
- Performance testing

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- `convex/actions/workos.ts` — 4 functions: `createGuardAccount` (action), `resetGuardPassword` (action), `suspendGuard` (internalAction), `unsuspendGuard` (internalAction). WorkOS suspend/unsuspend uses raw POST (SDK lacks first-class methods).
- `convex/guards.ts` — 12 functions: `createInternal`, `checkPermission`, `updateProfile`, `setMustChangePassword`, `clearMustChangePassword`, `updateStatus` (full state machine), `banGuardInternal` (visit cascade), `updateStatusInternal`, `getInFlightItems`, `list`, `getById`, `search`, `getMyProfile`.
- `convex/guards.test.ts` — 33 test cases covering creation, profile updates, status transitions (all 7 valid + invalid), ban cascade, queries with filters/enrichment, getMyProfile (ACTIVE/INACTIVE/non-guard), RBAC.

### Key File Locations

- `convex/actions/workos.ts` — WorkOS Actions (first Action file in project)
- `convex/guards.ts` — All guard mutations + queries
- `convex/guards.test.ts` — Guard test suite (33 tests)

### Deviations from Spec

- WorkOS SDK does not expose `suspendUser`/`unsuspendUser` methods — used `workos.post()` with raw User Management API endpoints instead.
- `LEAD_STATUS.ARCHIVED` does not exist in constants — `getInFlightItems` and `list` enrichment filter out `REJECTED` and `DUPLICATE` leads as terminal states.
- No client-facing `create` mutation — primary flow is frontend → Action → internalMutation as spec recommended.

### Gotchas for Next Epic

- `checkPermission` internalQuery mirrors `requirePermission` logic but is callable from Actions. E02/E03 can reuse it if needed.
- `banGuardInternal` flags visits with `needs_reassignment: true` — Phase 7 (visits) needs to handle this field.
- `getMyProfile` uses `requireAuth` (not `requireGuard`) — INACTIVE guards can view their profile. E04 guard portal pages should follow this pattern.
- Society reassignment in `updateProfile` soft-deletes all shifts — E03 shift management should be aware.
