---
id: P31-E01
title: Owner Entity Foundation
phase: 31
status: done
depends_on: []
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P31-E01: Owner Entity Foundation

## Overview

Create the canonical owner model and wire it into the existing lead-listing-closure chain. This epic establishes owner identity resolution, owner linkage fields, migration/backfill flow, and baseline admin owner management UI.

## Task Queue

- [x] P31-E01-T01: Add `owners` schema + constants + transition maps
- [x] P31-E01-T02: Create `convex/owners.ts` core functions
- [x] P31-E01-T03: Update lead submission to resolve/link owners
- [x] P31-E01-T04: Add `owner_id` to listings and closures + linkage backfill hooks
- [x] P31-E01-T05: Build one-time owners migration script for existing leads
- [x] P31-E01-T06: Build admin owner list page (`/admin/owners`)
- [x] P31-E01-T07: Build admin owner detail page (`/admin/owners/[id]`)

---

## T01: Add `owners` Schema + Constants + Transition Maps

### Objective

Define the canonical `owners` table, supporting enums, and owner lifecycle transition constants so all downstream owner logic uses one source of truth.

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - Section 1 schema and lifecycle rules
- `notes/10-convex-schema.md` - table/index style and validator patterns
- `notes/13-constants-reference.md` - enum and transition documentation conventions
- `convex/schema.ts` - existing validator + table/index style
- `lib/constants.ts` - enum/transition map export patterns

### Key Rules

1. Add `owners` table exactly as specified in feature doc section 1, including all indexes.
2. `phone` must be normalized 10-digit format (no `+91`, spaces, or punctuation in persistence).
3. Include `OWNER_LIFECYCLE_STAGE` and `OWNER_LIFECYCLE_TRANSITIONS` in `lib/constants.ts`.
4. Preserve project invariants: money in paise, dates in Unix ms, soft-delete via `is_deleted`.
5. Do not remove existing owner-related compatibility fields (`owner_phone`, `owner_name`) in this task.

### Deliverables

- [x] `convex/schema.ts` - new `owners` table + indexes
- [x] `lib/constants.ts` - owner lifecycle enums and transition map
- [x] `notes/13-constants-reference.md` - owner lifecycle enum documentation updates

### Acceptance Criteria

1. `owners` table exists with all fields from the feature spec.
2. Indexes include `by_phone`, `by_email`, `by_user_id`, `by_lifecycle`, `by_current_rm`, `by_source`.
3. Lifecycle transition map supports: `PROSPECT -> VERIFIED -> ACTIVE -> MANAGED -> DORMANT` and `Any -> CHURNED`.
4. TypeScript compiles with no schema/type errors.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, and `notes/13-constants-reference.md`.

### Out of Scope

- Owner query/mutation implementations.
- Lead/listing/closure linkage.
- UI pages.

---

## T02: Create `convex/owners.ts` Core Functions

### Objective

Create owner domain functions for identity resolution and admin management: `getOrCreateByPhone`, `getById`, `search`, and `merge`.

### Depends On

P31-E01-T01

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - identity resolution and merge rules
- `notes/11-convex-architecture.md` - domain module patterns and auth helpers
- `convex/auth.helpers.ts` - `requirePermission` usage
- `convex/functions.ts` - wrapped `mutation`/`query` import rules

### Key Rules

1. Use `mutation`/`query` from `./functions` (never `_generated/server` mutations).
2. Implement phone normalization before owner lookup/create.
3. `getOrCreateByPhone` must be idempotent for same normalized phone.
4. `merge` must re-link dependent records and soft-delete source owner (`merged_into_id`, `is_deleted: true`).
5. `search` must support phone, name, and email with pagination-safe behavior.
6. Guard all admin functions with explicit permissions (`owners.view`, `owners.manage` or equivalent newly-added strings).

### Deliverables

- [x] `convex/owners.ts` - core query/mutation module
- [x] `lib/constants.ts` - owner permission strings added

### Acceptance Criteria

1. `getOrCreateByPhone` returns existing owner when phone already exists.
2. `merge` re-links leads, listings, closures, and marks source owner merged/deleted.
3. `search` returns filtered owner rows with deterministic ordering.
4. Permission checks block unauthorized callers.
5. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/owners.ts` and modified constants/auth files.

### Out of Scope

- Lead submission integration.
- Admin page rendering.

---

## T03: Update Lead Submission to Resolve/Link Owners

### Objective

Integrate owner identity resolution into lead submission so each lead links to a canonical `owner_id`.

### Depends On

P31-E01-T01, P31-E01-T02

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - identity resolution rule set
- `convex/leads.ts` - lead submit path and de-dup logic
- `lib/validators.ts` - phone normalization helper

### Key Rules

1. On lead create: normalize phone, resolve owner by `owners.by_phone`, and set `lead.owner_id`.
2. If owner does not exist, create owner with `source = GUARD_LEAD`, initialize lifecycle metadata.
3. Keep `owner_phone` and `owner_name` fields populated for backward compatibility.
4. Preserve existing lead de-dup and rate-limit behavior.
5. Update owner counters and `last_activity_at` atomically with lead insertion.

### Deliverables

- [x] `convex/leads.ts` - owner resolution wiring in lead create/update paths
- [x] `convex/owners.ts` - helper exports used by leads module (if needed)

### Acceptance Criteria

1. New leads always persist `owner_id` when owner phone is valid.
2. Existing owners are reused by phone match; duplicates are not created.
3. Lead submission behavior remains unchanged for non-owner fields.
4. TypeScript compiles and existing lead tests remain green.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/leads.ts` and `convex/owners.ts`.

### Out of Scope

- Listing/closure owner linkage.
- Admin UI.

---

## T04: Add `owner_id` to Listings and Closures + Linkage Backfill Hooks

### Objective

Extend listing and closure records to include owner linkage for complete ownership traceability.

### Depends On

P31-E01-T01, P31-E01-T03

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - schema modification requirements
- `convex/listings.ts` - listing create flow
- `convex/closures.ts` - closure create/confirm flow
- `convex/schema.ts` - listings/closures table definitions

### Key Rules

1. Add `owner_id` optional field + index to `listings` and `closures` schema definitions.
2. Populate `owner_id` from linked lead owner whenever listing/closure records are created.
3. Add backfill-safe helper logic to patch missing `owner_id` on legacy rows.
4. Do not remove or repurpose existing lead/listing/closure relationships.

### Deliverables

- [x] `convex/schema.ts` - `owner_id` fields/indexes on `listings` and `closures`
- [x] `convex/listings.ts` - owner propagation during listing creation
- [x] `convex/closures.ts` - owner propagation during closure creation

### Acceptance Criteria

1. New listings and closures link to canonical owner through `owner_id`.
2. Existing records can be patched without destructive operations.
3. Query paths can filter by owner via new indexes.
4. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`, `convex/listings.ts`, and `convex/closures.ts`.

### Out of Scope

- One-time migration execution at scale (T05).
- RM assignment logic.

---

## T05: Build One-Time Owners Migration Script for Existing Leads

### Objective

Create a one-time migration path that generates owner records from historical leads and backfills owner links safely.

### Depends On

P31-E01-T01, P31-E01-T03, P31-E01-T04

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - migration plan
- `convex/seed.ts` - idempotent data-write patterns
- `notes/11-convex-architecture.md` - internal mutation patterns

### Key Rules

1. Migration must be idempotent (safe re-run with no duplicate owners).
2. Normalize lead owner phones before identity resolution.
3. Backfill `leads.owner_id`, then derive listing/closure `owner_id` from linked leads.
4. Record migration summary stats (processed, created, linked, skipped/errors).
5. No destructive deletes; use patch/update only.

### Deliverables

- [x] `convex/migrations/backfillOwnersFromLeads.ts` (or equivalent internal migration module)
- [x] `notes/features/21-owner-entity-and-rm.md` migration runbook note with execution command

### Acceptance Criteria

1. Historical leads with valid owner phone receive canonical `owner_id` linkage.
2. Duplicate owners are not created for same normalized phone.
3. Migration can be re-run without data corruption.
4. Summary output reports exact counts.

### Verification

```bash
npx tsc --noEmit
```

Run migration in dev environment and verify sample owner links in Convex dashboard.

### Out of Scope

- RM assignments.
- UI-level owner operations.

---

## T06: Build Admin Owner List Page (`/admin/owners`)

### Objective

Create the owner list page with owner lifecycle and RM visibility for admin operations.

### Depends On

P31-E01-T02

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - admin UI section
- `notes/06-admin-panel-ux.md` - admin list-page patterns
- existing admin list pages (`/admin/guards`, `/admin/societies`) for pagination/filter conventions

### Key Rules

1. Route path must be `src/app/(admin)/admin/owners/page.tsx` (`/admin/owners`).
2. Table columns: phone, name, lifecycle, RM name, active properties count, last activity.
3. Include search + lifecycle filter + RM filter with paginated results.
4. Use shared admin table patterns and status badges.
5. Gate access via owner-management view permission.

### Deliverables

- [x] `src/app/(admin)/admin/owners/page.tsx`
- [x] `src/components/admin/owners/OwnerTable.tsx` (or equivalent split component)
- [x] `convex/owners.ts` list/query endpoint used by table

### Acceptance Criteria

1. `/admin/owners` renders paginated owner list.
2. Filters/search return expected subset and update table reactively.
3. Row click navigates to owner detail page.
4. Unauthorized admins cannot access the page.
5. Build succeeds.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on page/component/query files touched.

### Out of Scope

- Owner detail tabs.
- RM dashboard.

---

## T07: Build Admin Owner Detail Page (`/admin/owners/[id]`)

### Objective

Create owner detail page with tabbed operational context: properties, RM history, check-ins, and activity.

### Depends On

P31-E01-T02, P31-E01-T06

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - owner detail tab requirements
- `notes/06-admin-panel-ux.md` - detail-page and tab patterns
- `src/components/ui/tabs.tsx` usage patterns in existing admin detail pages

### Key Rules

1. Route path must be `src/app/(admin)/admin/owners/[id]/page.tsx`.
2. Implement tabs exactly: `Properties`, `RM History`, `Check-ins`, `Activity`.
3. Properties tab must show linked leads/listings/closures with owner-centric grouping.
4. RM History tab must show assignment timeline and reassignment reasons where present.
5. Check-ins tab must show chronological RM check-ins.
6. Activity tab must include lifecycle stage transitions and critical admin actions.

### Deliverables

- [x] `src/app/(admin)/admin/owners/[id]/page.tsx`
- [x] `src/components/admin/owners/OwnerDetailTabs.tsx` (or equivalent)
- [x] `convex/owners.ts` detail query for owner + related entities

### Acceptance Criteria

1. `/admin/owners/[id]` renders all 4 tabs with owner-scoped data.
2. Cross-entity links (lead/listing/closure) are clickable and route correctly.
3. Tab switching preserves loaded data and handles empty states.
4. Build succeeds.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all new owner detail files.

### Out of Scope

- RM reassignment mutation UI actions (handled in P31-E02).
- Cron-based lifecycle transitions.

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-19

### What Was Built

- Added canonical owner entity plumbing across schema/constants and owner domain functions, including idempotent phone-based owner resolution, merge logic, lifecycle transitions, and migration/backfill utilities.
- Wired owner linkage end-to-end on lead/listing/closure records, including owner auto-resolution during lead create and verification flows so verified leads without `owner_id` are now patched before lifecycle progression.
- Delivered admin owner surfaces at `/admin/owners` and `/admin/owners/[id]` with owner-centric property graph, RM timeline/check-ins, and activity history.

### Key File Locations

- `convex/schema.ts`
- `lib/constants.ts`
- `convex/owners.ts`
- `convex/leads.ts`
- `convex/verifications.ts`
- `convex/listings.ts`
- `convex/closures.ts`
- `convex/migrations/backfillOwnersFromLeads.ts`
- `src/app/(admin)/admin/owners/page.tsx`
- `src/app/(admin)/admin/owners/[id]/page.tsx`

### Deviations from Spec

- Added a dedicated `owners.search` query export while retaining `owners.list(search=...)` for existing paginated list-screen wiring; both paths share the same filter/search implementation.
- Kept owner detail tabs as `Properties`, `RM History`, `Check-ins`, and `Activity` per this epic's accepted spec; no split into separate `Profile/Leads/Listings/Closures/RM` tabs.

### Gotchas for Next Epic

- Use `getOrCreateByPhoneInternal` for owner linkage inside existing mutations to keep owner resolution atomic and avoid duplicate owners.
- Legacy data can still have missing `owner_id` until migration or verification patch paths run; avoid assuming owner linkage is always present on historic rows.
- RM logic should treat owner merge outcomes carefully because assignments/check-ins are re-linked in owner merge flows.
