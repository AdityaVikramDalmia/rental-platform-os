---
id: P04-E01
title: Lead Submission Backend
phase: 4
status: done
depends_on: ["P01-E08", "P02-E01", "P02-E02", "P03-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P04-E01: Lead Submission Backend

## Overview

Set up the rate limiter infrastructure, implement de-duplication and lead helper functions, build the guard-facing lead create mutation (with full validation pipeline), guard lead update mutation (NEED_INFO response), and guard-facing queries (My Leads + submission count). This is the foundation — all other P04 epics depend on these functions.

## Prerequisites

- **Read first**: [P03-E01 Completion Summary](../phase-03-guard-management/P03-E01-guard-account-backend.md#completion-summary) — know what guard infrastructure exists (guard profiles, `requireGuard`, guard status management).
- **Read first**: [P02-E01 Completion Summary](../phase-02-society-registry/P02-E01-society-crud.md#completion-summary) — know what society infrastructure exists (society queries, status checks).
- **Read first**: [P02-E02 Completion Summary](../phase-02-society-registry/P02-E02-building-crud.md#completion-summary) — know what building infrastructure exists (building queries, `listBySociety`, floor labels).
- Phase 1 is fully complete: auth helpers (`requireGuard`, `requirePermission`), guard login, RBAC, audit triggers in `functions.ts`.
- Phase 2 E01 (Society CRUD) + E02 (Building CRUD) are complete: societies and buildings exist for lead form dropdowns and validation.
- Phase 3 E01 (Guard Account Backend) is complete: guard profiles exist with `society_id` assignment.

## Task Queue

- [x] P04-E01-T01: Rate Limiter Infrastructure + Lead Helpers
- [x] P04-E01-T02: Lead Create Mutation
- [x] P04-E01-T03: Guard Lead Update Mutation (NEED_INFO Response)
- [x] P04-E01-T04: Guard-Facing Lead Queries
- [x] P04-E01-T05: Lead Submission Backend Tests

---

## T01: Rate Limiter Infrastructure + Lead Helpers

### Objective

Set up the `@convex-dev/rate-limiter` component, create the rate limiter instance with the `guard:lead_submission` rule, and implement three lead helper functions: `validateLeadTransition`, `checkDuplicates`, and `buildSearchableText`. These helpers are used by all lead mutations across E01 and E02.

### Required Reading

- `notes/11-convex-architecture.md` — "De-duplication Logic" section (full `checkDuplicates` code pattern with both rules)
- `notes/11-convex-architecture.md` — "Rate Limiter" section (component setup, rule definition, check pattern)
- `notes/04-state-machines.md` — "Lead Status Machine" section (transition table, validation function pattern)
- `notes/10-convex-schema.md` — `leads` table (indexes used by de-dup: `by_society_building_flat`, `by_owner_phone`)
- `notes/13-constants-reference.md` — Lead statuses, quality flags, system config keys (window defaults)

### Key Rules

1. **Rate limiter component**: Install `@convex-dev/rate-limiter` if not already in dependencies. In `convex/convex.config.ts`:
   ```typescript
   import rateLimiter from "@convex-dev/rate-limiter/convex.config";
   const app = defineApp();
   app.use(rateLimiter);
   ```
   The rate limiter instance is created in `convex/rateLimiter.ts`.
2. **Rate limiter instance** (`convex/rateLimiter.ts`):
   ```typescript
   import { RateLimiter } from "@convex-dev/rate-limiter";
   import { components } from "./_generated/api";
   export const rateLimiter = new RateLimiter(components.rateLimiter, {
     "guard:lead_submission": { kind: "fixed window", period: 24 * 60 * 60 * 1000, rate: 5 },
   });
   ```
   Note `kind: "fixed window"` (with space). Hardcode rate `5` for now (system_config configurability deferred to P11).
3. **Rate limiter enforcement pattern**: `await rateLimiter.limit(ctx, "guard:lead_submission", { key: guardUserId, throws: true })`. The `limit` method consumes a token and, with `throws: true`, throws a `ConvexError` when the rate limit is exceeded. Do NOT use `rateLimiter.check()` — that only reads without consuming. **Midnight IST note**: The rate limiter's 24h fixed window may not align perfectly with midnight IST (feature spec says daily reset at midnight IST). For V1, the 24h window is acceptable. The `getSubmissionCount` query (T04) uses midnight IST for the display count. If exact midnight IST enforcement is needed later, add a secondary count-based check in the mutation.
4. **`validateLeadTransition(currentStatus, newStatus)`**: Returns `boolean`. Checks against the full transition table from `04-state-machines.md`. Valid transitions:
   - `SUBMITTED` → `NEED_INFO`, `VERIFIED`, `REJECTED`
   - `NEED_INFO` → `SUBMITTED`, `REJECTED`
   - `POTENTIAL_DUPLICATE` → `DUPLICATE`, `SUBMITTED`
   - All others invalid (VERIFIED, REJECTED, DUPLICATE are terminal or admin-only-forward).
5. **`checkDuplicates(ctx, societyId, buildingId, flatNumber, ownerPhone)`**: Returns `{ isDuplicate: boolean, duplicateFlags: string[], duplicateOfId?: Id<"leads"> }`. Two rules:
   - **Rule 1 (Same flat)**: Query `by_society_building_flat` index with `society_id + building_id + flat_number.toUpperCase()`. Filter: `status NOT IN (REJECTED, DUPLICATE)` AND `_creationTime > (now - 90 days)`. If match → add `"DUPLICATE_FLAT_MATCH"` flag.
   - **Rule 2 (Same phone)**: Query `by_owner_phone` index with `ownerPhone`. Filter: `society_id === societyId` AND `status NOT IN (REJECTED, DUPLICATE)` AND `_creationTime > (now - 30 days)`. If match → add `"DUPLICATE_PHONE_MATCH"` flag.
   - If both rules match, `duplicateOfId` uses the flat match result (more specific).
6. **`buildSearchableText(ctx, societyId, buildingId, flatNumber, ownerName?, ownerPhone, guardName?)`**: Looks up society name and building name via `ctx.db.get()`, concatenates all fields (including guard name) space-separated. Returns lowercase string for search index. Example: `"lakeview gardens tower a 1201 sharma ji 9876543210 rajesh kumar"`. **Spec extension note**: The feature spec's searchable_text composition (`03-lead-pipeline.md`) lists society + building + flat + owner name + owner phone. We add guard name because the admin UX spec says the search bar should cover guard name. This is a deliberate extension of the feature spec, not a deviation.
7. **De-dup window values**: Hardcode `90 * 24 * 60 * 60 * 1000` (90 days) for flat match and `30 * 24 * 60 * 60 * 1000` (30 days) for phone match. Add `// TODO: Read from system_config when P11 is implemented` comment.
8. **File location**: All helpers go in `convex/leads.ts` as module-level functions (not exported as Convex functions — they're internal helpers called by mutations).
9. **Import `v` from `convex/values`** for any validator usage. Import `Id` from `./_generated/dataModel` for type annotations.

### Deliverables

- [ ] `convex/convex.config.ts` — Updated: rate-limiter component registered
- [ ] `convex/rateLimiter.ts` — Rate limiter instance with `guard:lead_submission` rule
- [ ] `convex/leads.ts` — Created with: `validateLeadTransition()`, `checkDuplicates()`, `buildSearchableText()` helper functions

### Acceptance Criteria

1. `@convex-dev/rate-limiter` is in `package.json` dependencies
2. `convex/convex.config.ts` registers the rate-limiter component
3. `convex/rateLimiter.ts` exports a configured rate limiter with `guard:lead_submission` rule (fixed window, 24h, rate 5)
4. `validateLeadTransition("SUBMITTED", "NEED_INFO")` returns `true`
5. `validateLeadTransition("SUBMITTED", "DUPLICATE")` returns `false`
6. `validateLeadTransition("POTENTIAL_DUPLICATE", "VERIFIED")` returns `false` (two-step: must clear flag first)
7. `validateLeadTransition("REJECTED", "SUBMITTED")` returns `false` (terminal state)
8. `checkDuplicates` uses `by_society_building_flat` index for flat match
9. `checkDuplicates` uses `by_owner_phone` index for phone match
10. `buildSearchableText` fetches society + building names via `ctx.db.get()` and returns lowercase concatenation
11. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Check: `convex/convex.config.ts` imports and registers the rate-limiter. `convex/rateLimiter.ts` defines the rule. `convex/leads.ts` has all three helper functions with correct types.

### Out of Scope

- The `leads.create` mutation (T02)
- Admin mutations (E02)
- `system_config` table for configurable windows (P11)
- `OFF_SHIFT_SUBMISSION` quality flag logic (V2)

---

## T02: Lead Create Mutation

### Objective

Implement the `leads.create` mutation — the full guard lead submission pipeline. This is the most complex mutation in the lead module: it validates consent, checks guard/society/building, rate-limits, runs de-dup, checks for high rejection rate, computes searchable text, and inserts the lead with the correct status and quality flags.

### Required Reading

- `notes/features/03-lead-pipeline.md` — "Guard Flow: Submit a Lead" section (form fields, submit flow, rate limiting, de-dup)
- `notes/11-convex-architecture.md` — "Lead Submission Mutation Pattern" section (full mutation signature + handler outline)
- `notes/10-convex-schema.md` — `leads` table (exact validators for all fields)
- `notes/13-constants-reference.md` — Lead statuses, quality flags, availability types, furnishing enum
- `notes/02-data-models.md` — Section F (Lead) for field constraints and relationships

### Key Rules

1. **Import `mutation` from `./functions`** — NEVER from `_generated/server`. This enables automatic audit logging via triggers.
2. **Auth**: `const guard = await requireGuard(ctx)` — only ACTIVE guards can submit. This checks auth, user_type === "GUARD", status === "ACTIVE".
3. **Consent validation**: `if (!args.owner_consent_to_call) throw new Error("Owner consent is required to submit this lead.")` — non-negotiable, first check after auth.
4. **Society validation**: Get guard's society via `ctx.db.get(guard.society_id)`. Throw if society `status !== "ACTIVE"`: `"Cannot submit leads for an inactive society."`.
5. **Building validation**: Get building via `ctx.db.get(args.building_id)`. Throw if building `society_id !== guard.society_id`: `"Building does not belong to your society."`. Also check `building.is_deleted !== true`.
6. **Rate limit**: `await rateLimiter.limit(ctx, "guard:lead_submission", { key: guard._id, throws: true })`. Import the rate limiter from `./rateLimiter`. With `throws: true`, this throws a `ConvexError` when rate-limited — catch in frontend and show rate limit screen.
7. **De-dup**: `const { isDuplicate, duplicateFlags, duplicateOfId } = await checkDuplicates(ctx, guard.society_id, args.building_id, args.flat_number, normalizedPhone)`.
8. **GUARD_HIGH_REJECTION flag**: Query guard's leads using `by_submitted_by_guard_id` index. Count total leads and count leads with status `REJECTED` or `DUPLICATE`. If total >= 5 AND rejected/duplicate count > 50% of total → add `"GUARD_HIGH_REJECTION"` to quality flags.
9. **Searchable text**: `const searchableText = await buildSearchableText(ctx, guard.society_id, args.building_id, args.flat_number, args.owner_name, normalizedPhone)`.
10. **Phone normalization**: Use `normalizePhone()` from `lib/validators.ts` on `args.owner_phone`. Store as 10 digits only.
11. **Flat number**: `args.flat_number.toUpperCase()` — always uppercase.
12. **Money**: `rent_expected` is in paise (integer). Validator is `v.optional(v.number())`. Frontend converts from rupees.
13. **Availability date**: Required only when `availability_type === "VACANT_FROM"`. Validate: if `VACANT_FROM` and no `availability_date`, throw error.
14. **Status on insert**: `isDuplicate ? "POTENTIAL_DUPLICATE" : "SUBMITTED"`.
15. **Quality flags**: Combine de-dup flags + GUARD_HIGH_REJECTION flag. If no flags, set to `undefined` (not empty array).
16. **Audit**: Automatic via trigger in `functions.ts` — creates `LEADS_INSERT` audit log entry. Do NOT manually insert audit_logs.
17. **Args validator**: Must match schema exactly. Required: `building_id: v.id("buildings")`, `floor_number: v.string()`, `flat_number: v.string()`, `owner_phone: v.string()`, `availability_type: v.union(v.literal("VACANT_NOW"), v.literal("VACANT_FROM"))`, `owner_consent_to_call: v.boolean()`. Optional: `availability_date: v.optional(v.number())`, `owner_name: v.optional(v.string())`, `rent_expected: v.optional(v.number())`, `furnishing: v.optional(v.union(v.literal("UNFURNISHED"), v.literal("SEMI_FURNISHED"), v.literal("FULLY_FURNISHED")))`, `notes: v.optional(v.string())`.

### Deliverables

- [ ] `convex/leads.ts` — Add `leads.create` mutation with full validation pipeline

### Acceptance Criteria

1. `leads.create` with valid args succeeds and returns a lead document ID
2. Created lead has `status: "SUBMITTED"` when no de-dup match
3. Created lead has `status: "POTENTIAL_DUPLICATE"` when flat or phone matches existing lead
4. Created lead has `submitted_by_guard_id` set from authenticated guard
5. Created lead has `society_id` set from guard's profile (not from args)
6. `flat_number` is stored uppercase
7. `owner_phone` is stored as 10 digits (stripped of +91 or formatting)
8. `searchable_text` is populated with society name + building name + flat + owner name + phone
9. Calling without auth throws error
10. Calling as INACTIVE or BANNED guard throws error
11. Calling with `owner_consent_to_call: false` throws error
12. Calling with building from different society throws error
13. Calling with INACTIVE society throws error
14. Calling after 5 submissions today throws rate limit error
15. Calling with `availability_type: "VACANT_FROM"` and no `availability_date` throws error: "Availability date is required when type is VACANT_FROM"
16. `GUARD_HIGH_REJECTION` flag is added when guard has >= 5 leads with >50% rejected
17. Audit log entry is automatically created (verify `LEADS_INSERT` in `audit_logs` table)
18. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Test manually: create a lead via Convex dashboard or test script. Verify status, quality_flags, searchable_text, audit_log creation.

### Out of Scope

- Guard lead update mutation (T03)
- Admin mutations for triage (E02)
- Photo upload on lead (V2)
- `OFF_SHIFT_SUBMISSION` flag (V2)

---

## T03: Guard Lead Update Mutation (NEED_INFO Response)

### Objective

Implement `leads.updateByGuard` — the mutation guards use to respond to admin's NEED_INFO request. This edits selected lead fields, appends a reply to the notes thread, and transitions the lead back to SUBMITTED status for admin re-triage.

### Required Reading

- `notes/features/03-lead-pipeline.md` — "Responding to NEED_INFO" section (editable fields, guard reply, transition flow)
- `notes/04-state-machines.md` — "Lead Status Machine" transition: `NEED_INFO → SUBMITTED`
- `notes/02-data-models.md` — Section F, `notes_thread` field structure

### Key Rules

1. **Import `mutation` from `./functions`** — for audit trigger.
2. **Auth**: `const guard = await requireGuard(ctx)` — only ACTIVE guards.
3. **Ownership check**: The lead's `submitted_by_guard_id` must equal `guard._id`. Throw: `"You can only update your own leads."`.
4. **Status check**: The lead's `status` must be `"NEED_INFO"`. Throw: `"Lead can only be updated when status is NEED_INFO."`. Use `validateLeadTransition("NEED_INFO", "SUBMITTED")` for consistency.
5. **Editable fields** (all optional in args): `owner_phone`, `owner_name`, `notes`, `furnishing`, `rent_expected`, `availability_type`, `availability_date`. Guard CANNOT edit `building_id`, `floor_number`, or `flat_number` (these are structural).
6. **Phone normalization**: If `owner_phone` is provided, normalize with `normalizePhone()` from `lib/validators.ts`.
7. **notes_thread append**: Append a new entry to the existing `notes_thread` array:
   ```typescript
   {
     note: args.reply_note || `Updated fields: ${changedFieldNames.join(", ")}`,
     author_id: guard._id,
     author_name: guard.name, // from guard profile
     author_type: "GUARD" as const,
     timestamp: Date.now(),
   }
   ```
   If `notes_thread` is `undefined`, initialize as a new array with this single entry.
8. **Status transition**: Set `status: "SUBMITTED"` — lead goes back into admin queue for re-triage.
9. **De-dup does NOT re-run** on update. Only runs on initial `leads.create`.
10. **searchable_text does NOT update** on guard edit. It was set at creation time and is advisory.
11. **Args validator**: `lead_id: v.id("leads")`, all editable fields as optional, plus `reply_note: v.optional(v.string())` for guard's text reply.

### Deliverables

- [ ] `convex/leads.ts` — Add `leads.updateByGuard` mutation

### Acceptance Criteria

1. `leads.updateByGuard` with valid args on a NEED_INFO lead succeeds
2. Lead status transitions from `NEED_INFO` to `SUBMITTED`
3. Updated fields are persisted (e.g., new `owner_phone` is stored)
4. `notes_thread` has a new entry with `author_type: "GUARD"` and timestamp
5. Guard reply note text appears in the new `notes_thread` entry
6. Calling on a lead with status other than `NEED_INFO` throws error
7. Calling by a guard who didn't submit the lead throws error
8. Calling without auth throws error
9. `building_id`, `floor_number`, `flat_number` are NOT updatable via this mutation
10. Audit log entry is automatically created (`LEADS_UPDATE`)
11. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Test: Create a lead → admin sets NEED_INFO (E02 mutation, can test via direct DB update) → call `updateByGuard` → verify status change + notes_thread append.

### Out of Scope

- Admin mutations (requestInfo, reject, etc.) — E02
- Re-running de-dup on update (by design)
- Updating searchable_text on edit (by design)

---

## T04: Guard-Facing Lead Queries

### Objective

Implement three guard-facing queries: `leads.getMyLeads` (paginated list of the guard's own leads with optional status filter), `leads.getMyLeadById` (single lead detail with ownership check and joins), and `leads.getSubmissionCount` (today's submission count for rate limit display).

### Required Reading

- `notes/features/03-lead-pipeline.md` — "My Leads List" section (filter tabs, display fields)
- `notes/10-convex-schema.md` — `leads` table indexes: `by_submitted_by_guard_id`, `by_guard_and_status`
- `notes/11-convex-architecture.md` — Pagination pattern (Convex cursor-based pagination)
- `notes/05-guard-portal-ux.md` — "My Leads" screen wireframe (filter tabs: All, In Review, Verified, Rejected)

### Key Rules

1. **Import `query` from `./_generated/server`** — queries don't need the `functions.ts` wrapper (no audit needed for reads).
2. **Auth**: `const guard = await requireGuard(ctx)` — only ACTIVE guards. Note: INACTIVE guards cannot view leads either (they fail `requireGuard`). If a future requirement allows INACTIVE guards to view leads, this would change. For now, follow the strict `requireGuard` pattern.
3. **`leads.getMyLeads` args**: `paginationOpts: paginationOptsValidator`, `status_filter: v.optional(v.union(v.literal("ALL"), v.literal("IN_REVIEW"), v.literal("VERIFIED"), v.literal("REJECTED")))`. Use literal unions — never accept arbitrary strings. The `status_filter` maps to UI tabs:
   - `undefined` or `"ALL"` → no status filter (all guard's leads)
   - `"IN_REVIEW"` → filter where status IN (`SUBMITTED`, `NEED_INFO`, `POTENTIAL_DUPLICATE`)
   - `"VERIFIED"` → filter where status = `VERIFIED`
   - `"REJECTED"` → filter where status IN (`REJECTED`, `DUPLICATE`)
4. **Index usage for getMyLeads**: Use `by_submitted_by_guard_id` index filtered to `guard._id`. Apply status filter in `.filter()` after index. Order by `_creationTime` descending (newest first). Use `.paginate(args.paginationOpts)`.
5. **Join data in getMyLeads**: For each lead, fetch building name and society name via `ctx.db.get()`. Return enriched lead objects with `building_name` and `society_name` fields for display.
6. **`leads.getSubmissionCount` args**: None (uses authenticated guard's ID from `requireGuard`). **Note**: Feature spec defines `getSubmissionCount({ guard_user_id, date })` with explicit args, but since this query is always called by the authenticated guard for "today", we derive both from auth context + `Date.now()` instead of taking them as args. This is simpler and prevents guards from querying other guards' counts. Returns `{ count: number, limit: number }`.
7. **Submission count logic**: Query `by_submitted_by_guard_id` index for `guard._id`. Filter `_creationTime >= todayMidnightIST`. Count matching leads (any status — even rejected leads count toward daily limit). `todayMidnightIST` = midnight IST of current day in Unix ms.
8. **Midnight IST calculation**: IST is UTC+5:30. Calculate today's midnight IST: `new Date().setUTCHours(-5, -30, 0, 0)` — or more precisely, get current time, compute IST date, find midnight of that date in UTC. Return `{ count: matchingLeads.length, limit: 5 }` (hardcode limit; read from system_config in P11).
9. **Pagination**: Use Convex's built-in `paginationOptsValidator` from `convex/server`. Return type is `PaginationResult<EnrichedLead>`.
10. **`leads.getMyLeadById` args**: `lead_id: v.id("leads")`. Auth: `requireGuard`. Ownership: verify `lead.submitted_by_guard_id === guard._id`. Throw `"Lead not found"` if lead doesn't exist or doesn't belong to guard. Return lead with building name, society name, and full `notes_thread`. This is the guard-facing equivalent of admin's `getById` — used by E04-T04 (Lead Detail View).

### Deliverables

- [ ] `convex/leads.ts` — Add `leads.getMyLeads` query with pagination + status filter + joins
- [ ] `convex/leads.ts` — Add `leads.getMyLeadById` query with ownership check + building/society joins + notes_thread
- [ ] `convex/leads.ts` — Add `leads.getSubmissionCount` query

### Acceptance Criteria

1. `leads.getMyLeads` returns only leads where `submitted_by_guard_id` matches authenticated guard
2. `leads.getMyLeads` with no filter returns all guard's leads
3. `leads.getMyLeads` with `"IN_REVIEW"` filter returns only SUBMITTED + NEED_INFO + POTENTIAL_DUPLICATE leads
4. `leads.getMyLeads` with `"VERIFIED"` filter returns only VERIFIED leads
5. `leads.getMyLeads` with `"REJECTED"` filter returns only REJECTED + DUPLICATE leads
6. Results include `building_name` and `society_name` from joined data
7. Results are ordered newest first
8. Pagination works correctly (returns `page`, `isDone`, `continueCursor`)
9. `leads.getSubmissionCount` returns count of today's submissions (IST timezone) and the daily limit
10. `leads.getMyLeadById` returns lead with building + society join data and full notes_thread
11. `leads.getMyLeadById` throws for non-existent lead or lead owned by a different guard
12. Calling any query without auth throws error
13. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Test: Create multiple leads with different statuses → call `getMyLeads` with each filter → verify correct filtering. Call `getSubmissionCount` → verify count matches today's leads.

### Out of Scope

- Admin-facing queries (leads.list, leads.getById) — E02
- Full-text search (admin-only feature) — E02
- Notes thread display formatting (UI concern) — E04

---

## T05: Lead Submission Backend Tests

### Objective

Write comprehensive tests for all T01–T04 deliverables: rate limiter setup, de-dup logic, lead create mutation (happy path + all error paths), guard update mutation, and guard queries.

### Required Reading

- `notes/11-convex-architecture.md` — "Testing Approach" section (Convex test patterns)
- `notes/features/03-lead-pipeline.md` — "Business Rules" and "Edge Cases" sections (test scenarios)
- `notes/04-state-machines.md` — Lead transition table (for transition tests)

### Key Rules

1. **Test file**: `convex/leads.test.ts` (or `__tests__/leads.test.ts` depending on project convention).
2. **Test framework**: Use whatever testing framework Phase 1 established (likely `vitest` with Convex test helpers).
3. **Test categories**:
   - **Rate limiter**: Verify 5th submission succeeds, 6th fails with rate limit error.
   - **De-dup (flat match)**: Create lead for Tower A / Floor 12 / Flat 1201 → create another with same flat → second gets `POTENTIAL_DUPLICATE` status + `DUPLICATE_FLAT_MATCH` flag.
   - **De-dup (phone match)**: Create lead with phone X in society Y → create another with phone X in society Y → second gets `POTENTIAL_DUPLICATE` + `DUPLICATE_PHONE_MATCH` flag.
   - **De-dup (different society)**: Create lead with phone X in society Y → create another with phone X in society Z → second gets `SUBMITTED` (not flagged — different societies are independent).
   - **De-dup (expired window)**: Lead older than 90 days should not trigger flat match. Lead older than 30 days should not trigger phone match.
   - **De-dup (excluded statuses)**: Lead with status REJECTED should not trigger de-dup for new submissions.
   - **GUARD_HIGH_REJECTION**: Guard with 5+ leads and >50% rejection rate → new lead gets `GUARD_HIGH_REJECTION` flag.
   - **GUARD_HIGH_REJECTION (below threshold)**: Guard with 3 leads (< 5 minimum) → no flag even if 100% rejected.
   - **Consent required**: `owner_consent_to_call: false` → throws.
   - **Inactive society**: Guard's society is INACTIVE → throws.
   - **Wrong building**: Building from different society → throws.
   - **NEED_INFO update**: Lead in NEED_INFO → `updateByGuard` succeeds, status becomes SUBMITTED, notes_thread has guard entry.
   - **NEED_INFO update wrong guard**: Different guard tries to update → throws.
   - **NEED_INFO update wrong status**: Lead in SUBMITTED → `updateByGuard` throws.
   - **getMyLeads filtering**: Create leads with different statuses → verify each filter tab returns correct subset.
   - **getSubmissionCount**: Create N leads today → count returns N.
4. **Seed data**: Tests should create their own societies, buildings, and guard profiles as needed. Use the mutations from P01–P03.
5. **Assertions**: Check exact status values, quality_flags arrays, notes_thread structure, error messages.

### Deliverables

- [ ] `convex/leads.test.ts` — Comprehensive test suite covering all T01–T04 functionality

### Acceptance Criteria

1. All test categories listed in Key Rules have at least one test case
2. Rate limiter boundary test passes (5 allowed, 6th rejected)
3. Both de-dup rules are tested (flat match + phone match)
4. De-dup exclusions are tested (different society, expired window, excluded statuses)
5. GUARD_HIGH_REJECTION with minimum threshold (5 leads) is tested
6. All error paths tested: no auth, wrong guard, wrong status, no consent, wrong building, inactive society
7. `getMyLeads` filter tabs tested for each category (All, In Review, Verified, Rejected)
8. Tests run cleanly: `npm run test -- convex/leads.test.ts`
9. `npx tsc --noEmit` passes

### Verification

```bash
npm run test -- convex/leads.test.ts
npx tsc --noEmit
```

### Out of Scope

- Admin mutation tests (E02-T04)
- UI component tests (E03, E04)
- Integration/E2E tests (separate effort)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- `convex/rateLimiter.ts` — RateLimiter instance with `guard:lead_submission` rule (fixed window, 24h, rate 5)
- `convex/leads.ts` — Full lead module with:
  - Helpers: `validateLeadTransition`, `checkDuplicates`, `buildSearchableText`, `getTodayMidnightIST`
  - Mutations: `create` (full pipeline), `updateByGuard` (NEED_INFO response)
  - Queries: `getMyLeads` (paginated + status filter), `getMyLeadById` (joins), `getSubmissionCount` (IST-aware)
- `convex/functions.ts` updated — added `"leads"` to AUDITED_TABLES
- `convex/leads.test.ts` — 24 test cases all passing

### Key File Locations

- Rate limiter: `convex/rateLimiter.ts`
- All lead functions: `convex/leads.ts` (~490 lines)
- Tests: `convex/leads.test.ts` (~960 lines)
- Rate limiter component: already registered in `convex/convex.config.ts`

### Deviations from Spec

- `guard:lead_submission` rate limiter key uses `guard._id` (guard profile ID) not `guard.userId` — matches how requireGuard returns data
- `buildSearchableText` adds guard name to searchable text (deliberate extension of feature spec for admin search by guard name)
- De-dup window tests use +1 year mock time trick because convex-test's \_creationTime doesn't follow Date.now() mocks

### Gotchas for Next Epic

- `requireGuard(ctx)` returns full user doc with guard profile. Access `guard._id` for user ID, `guard.society_id` from profile
- Rate limiter `throws: true` throws ConvexError with `kind: "RateLimited"`. Use `isRateLimitError()` from `@convex-dev/rate-limiter` to detect
- `validateLeadTransition` is a module-level function (not exported as Convex function) — import within leads.ts only
- Queries import from `_generated/server`, mutations import from `./functions`
- Quality flags: array or `undefined` (never empty array)
