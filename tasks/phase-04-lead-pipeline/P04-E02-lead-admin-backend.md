---
id: P04-E02
title: Lead Admin Backend
phase: 4
status: done
depends_on: ["P04-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P04-E02: Lead Admin Backend

## Overview

Implement all admin-facing lead mutations (triage actions, duplicate management, bounty setting) and admin-facing queries (paginated list with filters/search, detailed lead view with joins). These backend functions power the admin lead queue UI in E03.

## Prerequisites

- **Read first**: [P04-E01 Completion Summary](P04-E01-lead-submission-backend.md#completion-summary) — know what lead infrastructure exists (rate limiter, helpers, create mutation, guard queries). The `validateLeadTransition`, `checkDuplicates`, and `buildSearchableText` helpers are available in `convex/leads.ts`.
- P04-E01 is complete: `convex/leads.ts` file exists with helpers and guard mutations. All indexes defined in schema are available.

## Task Queue

- [x] P04-E02-T01: Lead Triage Mutations (Request Info + Reject)
- [x] P04-E02-T02: Lead Duplicate & Bounty Mutations
- [x] P04-E02-T03: Lead Admin Queries (List + GetById)
- [x] P04-E02-T04: Lead Admin Backend Tests

---

## T01: Lead Triage Mutations (Request Info + Reject)

### Objective

Implement the two primary admin triage actions: `leads.requestInfo` (ask guard for more info, transition to NEED_INFO) and `leads.reject` (reject lead with reason, transition to REJECTED). Both append to the `notes_thread` for triage history.

### Required Reading

- `notes/features/03-lead-pipeline.md` — "Admin Flow: Lead Queue" section (admin actions), "Convex Functions" section (mutation signatures for `requestInfo` and `reject`)
- `notes/04-state-machines.md` — "Lead Status Machine" transitions: `SUBMITTED → NEED_INFO`, `SUBMITTED → REJECTED`, `NEED_INFO → REJECTED`
- `notes/10-convex-schema.md` — `leads` table (field types for `notes_thread` structure, `status` field validators)
- `notes/03-roles-and-permissions.md` — Permissions: `leads.request_info`, `leads.reject`
- `notes/13-constants-reference.md` — Audit action: `LEADS_UPDATE`, lead statuses

### Key Rules

1. **Import `mutation` from `./functions`** — for audit trigger (`LEADS_UPDATE`).
2. **`leads.requestInfo` args**: `lead_id: v.id("leads")`, `note: v.string()`.
3. **`leads.requestInfo` RBAC**: `const admin = await requirePermission(ctx, "leads.request_info")`.
4. **`leads.requestInfo` status check**: Lead must be in `SUBMITTED` status. Use `validateLeadTransition(lead.status, "NEED_INFO")` — returns true only for `SUBMITTED → NEED_INFO`. Throw: `"Cannot request info on a lead with status: ${lead.status}"`.
5. **`leads.requestInfo` notes_thread**: Append to existing `notes_thread` array (or initialize if undefined):
   ```typescript
   {
     note: args.note,
     author_id: admin._id,
     author_name: admin.name, // from admin user record
     author_type: "ADMIN" as const,
     timestamp: Date.now(),
   }
   ```
6. **`leads.requestInfo` update**: Patch lead with `{ status: "NEED_INFO", notes_thread: updatedThread }`.
7. **`leads.reject` args**: `lead_id: v.id("leads")`, `reason: v.string()`.
8. **`leads.reject` RBAC**: `const admin = await requirePermission(ctx, "leads.reject")`.
9. **`leads.reject` status check**: Lead must be in `SUBMITTED` or `NEED_INFO` status. Use `validateLeadTransition(lead.status, "REJECTED")`. Valid: `SUBMITTED → REJECTED`, `NEED_INFO → REJECTED`. Throw: `"Cannot reject a lead with status: ${lead.status}"`. **Note**: `POTENTIAL_DUPLICATE` leads CANNOT be directly rejected per the state machine. Admin must first clear the duplicate flag (`POTENTIAL_DUPLICATE → SUBMITTED`) then reject (`SUBMITTED → REJECTED`). **Spec conflict**: The feature spec edge cases section (`03-lead-pipeline.md`) mentions POTENTIAL_DUPLICATE → REJECTED as possible, but the state machine (`04-state-machines.md`) does NOT list this transition. **The state machine is authoritative** — it defines the canonical transitions. The feature spec edge case is overridden.
10. **`leads.reject` notes_thread**: Append rejection reason as admin note:
    ```typescript
    {
      note: `Rejected: ${args.reason}`,
      author_id: admin._id,
      author_name: admin.name,
      author_type: "ADMIN" as const,
      timestamp: Date.now(),
    }
    ```
11. **`leads.reject` update**: Patch lead with `{ status: "REJECTED", notes_thread: updatedThread }`.
12. **No listing cascade in P04**: The reject mutation does NOT check for linked listings. This cascade is added in P06 when listings exist. Add comment: `// TODO (P06): If lead has linked listing, auto-archive it.`
13. **Admin name resolution**: `admin` from `requirePermission` is a user record. Use `admin.name` (or the name field from the users table) for `author_name`.

### Deliverables

- [ ] `convex/leads.ts` — Add `leads.requestInfo` mutation
- [ ] `convex/leads.ts` — Add `leads.reject` mutation

### Acceptance Criteria

1. `leads.requestInfo` with valid lead (SUBMITTED status) succeeds, status becomes `NEED_INFO`
2. `notes_thread` has a new entry with `author_type: "ADMIN"` and the admin's note text
3. `leads.requestInfo` on NEED_INFO lead throws (already in NEED_INFO)
4. `leads.requestInfo` on REJECTED lead throws (terminal state)
5. `leads.requestInfo` without `leads.request_info` permission throws auth error
6. `leads.reject` with valid lead (SUBMITTED status) succeeds, status becomes `REJECTED`
7. `leads.reject` with valid lead (NEED_INFO status) succeeds, status becomes `REJECTED`
8. `notes_thread` has rejection reason prefixed with "Rejected: "
9. `leads.reject` on VERIFIED lead throws (only admin-forward via verification)
10. `leads.reject` on REJECTED lead throws (already terminal)
11. `leads.reject` without `leads.reject` permission throws auth error
12. Audit log entries are automatically created for both mutations (`LEADS_UPDATE`)
13. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Test: Create a lead → call `requestInfo` → verify status + notes_thread → then call `reject` on a different lead → verify status + notes_thread.

### Out of Scope

- Duplicate management mutations (T02)
- setBounty mutation (T02)
- Admin queries (T03)
- Lead rejection → listing cascade (P06)

---

## T02: Lead Duplicate & Bounty Mutations

### Objective

Implement three admin mutations: `leads.markDuplicate` (finalize as duplicate), `leads.clearDuplicateFlag` (clear false positive, return to queue), and `leads.setBounty` (set prospective bounty amount on any non-terminal lead).

### Required Reading

- `notes/features/03-lead-pipeline.md` — "De-Duplication Rules" section (admin finalization), "Convex Functions" section (mutation signatures)
- `notes/04-state-machines.md` — Transitions: `POTENTIAL_DUPLICATE → DUPLICATE`, `POTENTIAL_DUPLICATE → SUBMITTED`
- `notes/10-convex-schema.md` — `leads` table (field types for `quality_flags`, `duplicate_of_lead_id`, `prospective_bounty`)
- `notes/03-roles-and-permissions.md` — Permissions: `leads.mark_duplicate`, `leads.set_bounty`
- `notes/13-constants-reference.md` — Quality flags: `DUPLICATE_FLAT_MATCH`, `DUPLICATE_PHONE_MATCH`

### Key Rules

1. **Import `mutation` from `./functions`** — for audit trigger (`LEADS_UPDATE`).
2. **`leads.markDuplicate` args**: `lead_id: v.id("leads")`, `original_lead_id: v.id("leads")`, `reason: v.optional(v.string())`.
3. **`leads.markDuplicate` RBAC**: `await requirePermission(ctx, "leads.mark_duplicate")`.
4. **`leads.markDuplicate` status check**: Lead must be in `POTENTIAL_DUPLICATE` status. Use `validateLeadTransition(lead.status, "DUPLICATE")`. Throw: `"Can only mark POTENTIAL_DUPLICATE leads as duplicate."`.
5. **`leads.markDuplicate` validation**: Verify `original_lead_id` exists via `ctx.db.get()`. Throw if not found: `"Original lead not found."`.
6. **`leads.markDuplicate` update**: Patch lead with `{ status: "DUPLICATE", duplicate_of_lead_id: args.original_lead_id }`. Optionally append reason to `notes_thread` if provided.
7. **`leads.clearDuplicateFlag` args**: `lead_id: v.id("leads")`.
8. **`leads.clearDuplicateFlag` RBAC**: `await requirePermission(ctx, "leads.mark_duplicate")` — same permission as markDuplicate (admin manages duplicates).
9. **`leads.clearDuplicateFlag` status check**: Lead must be in `POTENTIAL_DUPLICATE` status. Use `validateLeadTransition(lead.status, "SUBMITTED")`. Throw: `"Can only clear duplicate flag on POTENTIAL_DUPLICATE leads."`.
10. **`leads.clearDuplicateFlag` update**: Patch lead with `{ status: "SUBMITTED", quality_flags: clearedFlags, duplicate_of_lead_id: undefined }`. Remove only `DUPLICATE_FLAT_MATCH` and `DUPLICATE_PHONE_MATCH` from `quality_flags` array — preserve other flags like `GUARD_HIGH_REJECTION`. If no flags remain, set `quality_flags: undefined`.
11. **Two-step duplicate verification**: After clearing the flag (POTENTIAL_DUPLICATE → SUBMITTED), admin must then verify separately (SUBMITTED → VERIFIED). There is NO direct POTENTIAL_DUPLICATE → VERIFIED path. This is enforced by `validateLeadTransition`.
12. **`leads.setBounty` args**: `lead_id: v.id("leads")`, `amount: v.number()`.
13. **`leads.setBounty` RBAC**: `await requirePermission(ctx, "leads.set_bounty")`.
14. **`leads.setBounty` status check**: Lead must NOT be in terminal status (`REJECTED` or `DUPLICATE`). Check: `if (lead.status === "REJECTED" || lead.status === "DUPLICATE") throw new Error("Cannot set bounty on a terminated lead.")`.
15. **`leads.setBounty` amount**: Must be in paise (integer > 0). Validate: `if (args.amount <= 0) throw new Error("Bounty amount must be positive.")`. Store in `prospective_bounty` field.
16. **`leads.setBounty` has no status transition** — it only updates the bounty field.

### Deliverables

- [ ] `convex/leads.ts` — Add `leads.markDuplicate` mutation
- [ ] `convex/leads.ts` — Add `leads.clearDuplicateFlag` mutation
- [ ] `convex/leads.ts` — Add `leads.setBounty` mutation

### Acceptance Criteria

1. `leads.markDuplicate` on POTENTIAL_DUPLICATE lead succeeds, status becomes `DUPLICATE`
2. `duplicate_of_lead_id` is set to the provided original lead ID
3. `leads.markDuplicate` on SUBMITTED lead throws (wrong status)
4. `leads.markDuplicate` with non-existent `original_lead_id` throws
5. `leads.markDuplicate` without `leads.mark_duplicate` permission throws auth error
6. `leads.clearDuplicateFlag` on POTENTIAL_DUPLICATE lead succeeds, status becomes `SUBMITTED`
7. `DUPLICATE_FLAT_MATCH` and `DUPLICATE_PHONE_MATCH` flags are removed from `quality_flags`
8. `GUARD_HIGH_REJECTION` flag is preserved after clearing duplicate flags
9. `leads.clearDuplicateFlag` on SUBMITTED lead throws (wrong status)
10. `leads.setBounty` with positive paise amount succeeds on SUBMITTED lead
11. `leads.setBounty` with positive paise amount succeeds on VERIFIED lead
12. `leads.setBounty` on REJECTED lead throws (terminal status)
13. `leads.setBounty` with 0 or negative amount throws
14. `leads.setBounty` without `leads.set_bounty` permission throws auth error
15. Audit log entries created for all three mutations (`LEADS_UPDATE`)
16. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Test: Create lead with POTENTIAL_DUPLICATE status → markDuplicate → verify. Create another POTENTIAL_DUPLICATE → clearDuplicateFlag → verify SUBMITTED. setBounty on various statuses → verify.

### Out of Scope

- Admin queries (T03)
- Owner verification (SUBMITTED → VERIFIED transition) — P05
- UI for these actions — E03

---

## T03: Lead Admin Queries (List + GetById)

### Objective

Implement three admin-facing queries: `leads.list` (paginated lead queue with status/society/building/guard filters and full-text search), `leads.getById` (detailed lead view with guard profile, building info, society info, and duplicate lead reference joins), and `leads.getStatusCounts` (lead counts per status for tab badges).

### Required Reading

- `notes/features/03-lead-pipeline.md` — "Admin Flow: Lead Queue" section (table columns, filters, search, detail panel sections)
- `notes/10-convex-schema.md` — `leads` table indexes: `by_status`, `by_society_and_status`, `by_society_id`, `by_building_id`; search index: `search_leads`
- `notes/11-convex-architecture.md` — Pagination pattern, Full-text search pattern
- `notes/06-admin-panel-ux.md` — Lead Queue table columns and detail panel sections

### Key Rules

1. **Import `query` from `./_generated/server`** — queries don't need `functions.ts` wrapper.
2. **`leads.list` RBAC**: `await requirePermission(ctx, "leads.view")`.
3. **`leads.list` args**: `paginationOpts: paginationOptsValidator`, `status: v.optional(v.union(v.literal("SUBMITTED"), v.literal("NEED_INFO"), v.literal("POTENTIAL_DUPLICATE"), v.literal("VERIFIED"), v.literal("REJECTED"), v.literal("DUPLICATE")))`, `society_id: v.optional(v.id("societies"))`, `building_id: v.optional(v.id("buildings"))`, `guard_user_id: v.optional(v.id("users"))`, `search: v.optional(v.string())`. Use literal unions for `status` — never accept arbitrary strings. Feature spec includes all of these filters.
4. **`leads.list` search branch**: If `args.search` is provided, use the `search_leads` search index:
   ```typescript
   ctx.db.query("leads").withSearchIndex("search_leads", (q) => {
     let sq = q.search("searchable_text", args.search!);
     if (args.status) sq = sq.eq("status", args.status);
     if (args.society_id) sq = sq.eq("society_id", args.society_id);
     return sq;
   });
   ```
   Search queries return relevance-ordered results. Convex search queries do NOT support `.paginate()` — collect results with `.take(50)` (top 50 by relevance) and return them as a single page. The frontend should hide the "Load More" button when search is active. Apply additional client-side filtering for `building_id` and `guard_user_id` filters (search index only supports `eq` on indexed filter fields — `status` and `society_id` are indexed, others are not).
5. **`leads.list` filter branch**: If NO search, use regular index queries:
   - If `status` AND `society_id`: use `by_society_and_status` index.
   - If `status` only: use `by_status` index.
   - If `society_id` only: use `by_society_id` index.
   - If neither: query all leads (ordered by `_creationTime` desc).
     Apply `.paginate(args.paginationOpts)`.
6. **`leads.list` join data**: For each lead in the page, fetch:
   - Guard name from `users` table via `submitted_by_guard_id`
   - Building name from `buildings` table via `building_id`
   - Society name from `societies` table via `society_id`
     Return enriched lead objects.
7. **`leads.list` ordering**: Newest first (`_creationTime` descending) for non-search queries. Search queries use relevance ordering.
8. **`leads.getById` args**: `lead_id: v.id("leads")`. **Note**: Feature spec uses `{ id }` but we use `lead_id` for explicitness per Convex convention (avoids ambiguity with other ID args). Update the feature spec reference if needed.
9. **`leads.getById` RBAC**: `await requirePermission(ctx, "leads.view")`.
10. **`leads.getById` joins**: Fetch and return:
    - Lead document (all fields)
    - Guard user: `ctx.db.get(lead.submitted_by_guard_id)` → name, phone (from `users` table)
    - Guard profile: Query `guard_profiles` table by `user_id === lead.submitted_by_guard_id` → `guard_type`, `society_id` (guard_type and society assignment live in `guard_profiles`, NOT in `users`)
    - Building: `ctx.db.get(lead.building_id)` → name, `total_floors` (NOT `floor_count` — schema field is `total_floors`)
    - Society: `ctx.db.get(lead.society_id)` → name, city
    - Duplicate reference: if `lead.duplicate_of_lead_id` exists → `ctx.db.get(lead.duplicate_of_lead_id)` → return basic lead info (flat, status, creation time)
    - Owner verifications: `ctx.db.query("owner_verifications").withIndex("by_lead_id", q => q.eq("lead_id", args.lead_id)).collect()` — returns array (may be empty in P04, populated in P05). **Forward-coupling note**: This join references the `owner_verifications` table and its `by_lead_id` index, which must exist in the schema (defined in `10-convex-schema.md`). The table will be empty until P05 implements verification. If the table/index doesn't exist yet at P04 implementation time, wrap in a try-catch or check schema — but per our schema-first approach, all tables are defined in P01-E02, so this should work.
11. **`leads.getById` return shape**: Single object with nested `guard` (user + profile merged), `building`, `society`, `duplicate_lead`, `verifications` fields. NOT separate queries.
12. **`leads.getStatusCounts` args**: `society_id: v.optional(v.id("societies"))`. Returns `Record<string, number>` — count of leads per status (e.g., `{ SUBMITTED: 23, NEED_INFO: 5, ... }`). Used by E03-T01 for tab badge counts. Use `by_society_and_status` index if society filter, otherwise iterate. RBAC: `requirePermission(ctx, "leads.view")`.

### Deliverables

- [ ] `convex/leads.ts` — Add `leads.list` query with filters (status, society, building, guard), search, pagination, joins
- [ ] `convex/leads.ts` — Add `leads.getById` query with full joins (user + guard_profile + building + society + duplicate ref + verifications)
- [ ] `convex/leads.ts` — Add `leads.getStatusCounts` query for tab badge counts

### Acceptance Criteria

1. `leads.list` returns paginated results with `page`, `isDone`, `continueCursor`
2. `leads.list` with `status: "SUBMITTED"` returns only SUBMITTED leads
3. `leads.list` with `society_id` filter returns only leads for that society
4. `leads.list` with `search` query returns relevance-ordered results matching `searchable_text`
5. `leads.list` search with `status` filter narrows results correctly
6. Each lead in results includes `guard_name`, `building_name`, `society_name` from joins
7. Results are ordered newest first (non-search) or by relevance (search)
8. `leads.getById` returns lead with nested `guard` object containing both user fields (name, phone) and profile fields (guard_type, society_id)
9. `leads.getById` returns building with `total_floors` field (NOT `floor_count`)
10. `leads.getById` returns `duplicate_lead` info when `duplicate_of_lead_id` is set
11. `leads.getById` returns empty `verifications` array (populated in P05)
12. `leads.getById` with non-existent lead_id throws "Lead not found" error
13. `leads.getStatusCounts` returns counts per status (e.g., `{ SUBMITTED: 23, NEED_INFO: 5 }`)
14. `leads.list` without `leads.view` permission throws auth error
15. `leads.getById` without `leads.view` permission throws auth error
16. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Test: Create multiple leads across societies with different statuses → query with various filter combinations → verify correct results. Get a specific lead by ID → verify all join data is present.

### Out of Scope

- Guard-facing queries (getMyLeads, getSubmissionCount) — E01
- Owner verification records (empty array returned, populated in P05)
- Full-text search index updates on lead edit (searchable_text is set once at creation)

---

## T04: Lead Admin Backend Tests

### Objective

Write comprehensive tests for all T01–T03 deliverables: admin triage mutations (requestInfo, reject), duplicate management mutations (markDuplicate, clearDuplicateFlag), bounty mutation (setBounty), and admin queries (list with filters/search, getById with joins).

### Required Reading

- `notes/features/03-lead-pipeline.md` — "Business Rules" and "Edge Cases" sections
- `notes/04-state-machines.md` — Lead transition table (for all admin transitions)
- `notes/03-roles-and-permissions.md` — Lead permission strings for RBAC tests

### Key Rules

1. **Test file**: `convex/leads.test.ts` — extend the test file from E01-T05 (add new `describe` blocks for admin functionality).
2. **Test categories**:
   - **requestInfo**: Valid transition (SUBMITTED → NEED_INFO), notes_thread appended with ADMIN entry, RBAC rejection without `leads.request_info` permission.
   - **reject**: Valid transitions (SUBMITTED → REJECTED, NEED_INFO → REJECTED), notes_thread has rejection reason, RBAC rejection, terminal state re-rejection throws.
   - **markDuplicate**: Valid transition (POTENTIAL_DUPLICATE → DUPLICATE), `duplicate_of_lead_id` set, non-existent original throws, wrong status throws, RBAC rejection.
   - **clearDuplicateFlag**: Valid transition (POTENTIAL*DUPLICATE → SUBMITTED), DUPLICATE*\* flags removed, GUARD_HIGH_REJECTION preserved, wrong status throws.
   - **Two-step verification**: clearDuplicateFlag → SUBMITTED (cannot directly verify from POTENTIAL_DUPLICATE).
   - **setBounty**: Works on SUBMITTED, NEED_INFO, POTENTIAL_DUPLICATE, VERIFIED leads. Throws on REJECTED, DUPLICATE. Throws on amount <= 0. RBAC rejection.
   - **leads.list**: Pagination, status filter, society filter, search query, combined filters. Verify join data (guard_name, building_name, society_name).
   - **leads.getById**: All join data present (guard, building, society, duplicate_lead, verifications). Non-existent lead throws.
3. **Seed data**: Reuse seed data from E01 tests. Add admin user with specific permissions for RBAC tests.
4. **RBAC tests**: For each mutation, test with admin who has the correct permission (succeeds) and admin who lacks it (throws).

### Deliverables

- [ ] `convex/leads.test.ts` — Extended with admin mutation and query tests

### Acceptance Criteria

1. All test categories listed in Key Rules have at least one test case
2. All admin triage mutations tested: requestInfo (valid + invalid status + RBAC), reject (both valid transitions + terminal + RBAC)
3. Duplicate management tested: markDuplicate (valid + wrong status + missing original + RBAC), clearDuplicateFlag (valid + wrong status + flag preservation)
4. setBounty tested across all non-terminal statuses and both terminal statuses
5. leads.list tested with: no filters, status filter, society filter, search, combined filters
6. leads.getById tested with: valid lead (all joins), lead with duplicate reference, non-existent lead
7. RBAC tests verify specific permission strings (not just "any admin")
8. Tests run cleanly: `npm run test -- convex/leads.test.ts`
9. `npx tsc --noEmit` passes

### Verification

```bash
npm run test -- convex/leads.test.ts
npx tsc --noEmit
```

### Out of Scope

- Guard mutation tests (covered in E01-T05)
- UI tests (E03, E04)
- Owner verification query results (empty in P04)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- 5 admin mutations in `convex/leads.ts`: `requestInfo`, `reject`, `markDuplicate`, `clearDuplicateFlag`, `setBounty`
- 3 admin queries in `convex/leads.ts`: `list` (paginated + filters + search), `getById` (full joins), `getStatusCounts`
- 21 new test cases in `convex/leads.test.ts` (45 total — 24 E01 + 21 E02)

### Key File Locations

- All lead functions: `convex/leads.ts` (~800 lines total after E02)
- Tests: `convex/leads.test.ts` (~1650 lines total)

### Deviations from Spec

- None significant. All mutations and queries match the spec exactly.

### Gotchas for Next Epic

- `leads.list` search branch uses `.take(50)` not `.paginate()` — frontend should hide Load More when search is active
- `leads.getById` returns nested `guard` object (user + profile merged), `building`, `society`, `duplicate_lead`, `verifications` fields
- `getStatusCounts` returns `Record<string, number>` — "All" tab total = sum of all values
- Guards use synthetic email format `{phone}@guards.local` — watch for this in test assertions
