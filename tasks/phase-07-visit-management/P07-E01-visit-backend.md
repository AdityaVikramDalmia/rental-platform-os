---
id: P07-E01
title: Visit Backend
phase: 7
status: done
depends_on: ["P05-E01", "P06-E01", "P01-E02", "P03-E01", "P03-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P07-E01: Visit Backend

## Overview

Implement the visit backend foundation for Phase 7: create the `convex/visits.ts` domain module, add visit CRUD and execution mutations with correct RBAC/auth boundaries, enforce visit status transitions, build shift-aware guard availability computation, denormalize `society_id` and auto-link `listing_id` on creation, verify the existing `needs_reassignment` hook from P03, and create the shared `visit-status-badge.tsx` component (consumed by both E02 and E03 in parallel).

## Prerequisites

- **Read first**: [P05-E01 Completion Summary](../phase-05-owner-verification/P05-E01-verification-backend.md#completion-summary) — reuse VERIFIED-lead constraints for visit creation.
- **Read first**: [P06-E01 Completion Summary](../phase-06-listings/P06-E01-listing-backend.md#completion-summary) — consume `listings.by_lead_id` for visit `listing_id` auto-linking.
- **Read first**: [P03-E01 Completion Summary](../phase-03-guard-management/P03-E01-guard-account-backend.md#completion-summary) — align with guard status management and existing ban/deactivation side-effects.
- **Read first**: [P03-E03 Completion Summary](../phase-03-guard-management/P03-E03-guard-shift-management.md#completion-summary) — reuse shift CRUD model and computed schedule logic.
- **Read first**: [P01-E02 Completion Summary](../phase-01-auth/P01-E02-schema-and-infra.md#completion-summary) — `VISITS_INSERT`/`VISITS_UPDATE` already in `audit_logs.action` union, but **`visits` is NOT yet in `AUDITED_TABLES`** — T01 must add it (same pattern as P06 adding `"listings"`).

## Task Queue

- [x] P07-E01-T01: Visit Domain Module + Status Transition Helper + Shared Badge
- [x] P07-E01-T02: Visit Create + List + GetById Mutations/Queries
- [x] P07-E01-T03: Visit Status Transition Mutations (Admin)
- [x] P07-E01-T04: Guard Visit Execution Mutations
- [x] P07-E01-T05: Guard Availability Query + needs_reassignment Verification

---

## T01: Visit Domain Module + Status Transition Helper + Shared Badge

### Objective

Create the visit domain module scaffold, centralize visit status transition validation so all downstream mutations share one canonical transition guard, and create the shared visit status badge component so both E02 (guard UI) and E03 (admin UI) can consume it in parallel.

### Required Reading

- `notes/04-state-machines.md` — "Visit Status" section
- `notes/10-convex-schema.md` — `visits` table definition (lines ~356-386)
- `notes/11-convex-architecture.md` — "Function Layer Architecture" and import conventions
- `notes/13-constants-reference.md` — visit status literals, permission strings, and badge colors/variants

### Key Rules

1. Create `convex/visits.ts` and keep all visit domain mutations/queries in this file.
2. Import `mutation` from `./functions` and `query` from `./_generated/server` exactly.
3. Import `requireGuard` and `requirePermission` from `./auth.helpers`; do not use ad-hoc auth checks.
4. Add `"visits"` to the `AUDITED_TABLES` array in `convex/functions.ts` (line ~14-24) — it is NOT there yet. Same pattern as P06 adding `"listings"`.
5. Add `validateVisitTransition(currentStatus, newStatus)` helper returning `boolean`.
6. Encode transitions exactly: `ASSIGNED -> CONFIRMED | IN_PROGRESS | CANCELLED | NO_SHOW`, `CONFIRMED -> IN_PROGRESS | CANCELLED | NO_SHOW`, `IN_PROGRESS -> COMPLETED`, and terminal states (`COMPLETED`, `CANCELLED`, `NO_SHOW`) with no outgoing transitions.
7. Keep transition mapping explicit and reusable so later mutations (`confirm`, `cancel`, `markNoShow`, `start`, `complete`) call the same helper.
8. Create `src/components/shared/visit-status-badge.tsx` as a role-agnostic shared component supporting all 6 visit statuses with exact Tailwind color tokens from constants docs: ASSIGNED (`bg-blue-100 text-blue-700`), CONFIRMED (`bg-indigo-100 text-indigo-700`), IN_PROGRESS (`bg-amber-100 text-amber-700`), COMPLETED (`bg-green-100 text-green-700`), CANCELLED (`bg-gray-100 text-gray-500`), NO_SHOW (`bg-red-100 text-red-700`). Props: `status` (strongly typed) plus optional size variant (`sm`/`md`/`lg`).
9. Follow existing shared badge style conventions (check for `lead-status-badge.tsx` / `listing-status-badge.tsx`; if absent, mirror current shared UI token usage).

### Deliverables

- [x] `convex/functions.ts` — Add `"visits"` to `AUDITED_TABLES` array (line ~14-24)
- [x] `convex/visits.ts` — Create visit module skeleton with required imports
- [x] `convex/visits.ts` — Add `validateVisitTransition(currentStatus, newStatus)` helper and transition map
- [x] `src/components/shared/visit-status-badge.tsx` — Shared visit status badge with exact status-color mapping and optional size prop

### Acceptance Criteria

1. `"visits"` is present in the `AUDITED_TABLES` array in `convex/functions.ts`.
2. `convex/visits.ts` exists and imports `mutation` from `./functions` plus `query` from `./_generated/server`.
3. `validateVisitTransition("ASSIGNED", "IN_PROGRESS")` returns `true`.
4. `validateVisitTransition("COMPLETED", "IN_PROGRESS")` returns `false`.
5. `validateVisitTransition("CANCELLED", "CONFIRMED")` returns `false`.
6. Transition helper behavior matches the visit state machine in `notes/04-state-machines.md` with no extra transitions.
7. `visit-status-badge.tsx` renders every visit status with exact documented colors and strongly typed `status` prop.
8. Badge component is role-agnostic and reusable in both guard and admin surfaces.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual check: read transition helper map and validate each allowed/disallowed pair against docs. Run `lsp_diagnostics` on `src/components/shared/visit-status-badge.tsx`.

### Out of Scope

- Visit CRUD/query implementation
- Guard execution mutations
- Guard availability computation

---

## T02: Visit Create + List + GetById Mutations/Queries

### Objective

Implement the core admin-facing visit creation and retrieval APIs with strict validation, proper denormalization/linking, and filterable paginated list behavior.

### Required Reading

- `notes/features/06-visit-management.md` — "Convex Functions" and "Business Rules"
- `notes/10-convex-schema.md` — `visits` table and `listings.by_lead_id` index
- `notes/13-constants-reference.md` — visit permissions and status literals
- `notes/03-roles-and-permissions.md` — Visit Management permission ownership
- `notes/11-convex-architecture.md` — query pagination and RBAC patterns

### Key Rules

1. `visits.create` uses `requirePermission(ctx, "visits.create")`.
2. `visits.create` args are `lead_id`, `scheduled_start`, `scheduled_end`, `assigned_guard_id`; reject if `scheduled_start >= scheduled_end`.
3. Validate lead is eligible for visits: `lead.status === "VERIFIED"`; reject non-VERIFIED leads (including `REJECTED` and `DUPLICATE`).
4. Validate assigned guard exists and `status === "ACTIVE"`; reject `INACTIVE`/`BANNED`.
5. Validate assigned guard belongs to the same society as the lead (`guard_profile.society_id === lead.society_id`); reject cross-society assignment.
6. On create, denormalize `society_id` from lead and auto-link `listing_id` by querying `listings.by_lead_id` (store if present).
7. Insert with `status: "ASSIGNED"`, `created_by_admin_id` from authenticated admin, and `needs_reassignment: false` unless schema default handling is already defined.
8. `visits.getById` uses `requirePermission(ctx, "visits.view")` and returns visit plus joined lead/building/society/guard and optional listing context via `ctx.db.get()` joins.
9. `visits.list` uses `requirePermission(ctx, "visits.view")`, `paginationOptsValidator`, optional filters (`status`, `society_id`, `assigned_guard_id`, `needs_reassignment`, `date_from`, `date_to`), and returns ascending `scheduled_start` order (upcoming first, per feature spec).

### Deliverables

- [x] `convex/visits.ts` — Add `visits.create` mutation (`visits.create` RBAC)
- [x] `convex/visits.ts` — Add `visits.getById` query (`visits.view` RBAC) with joined payload
- [x] `convex/visits.ts` — Add `visits.list` paginated query with documented filters and date range support
- [x] `convex/visits.ts` — Add `visits.getTodayCount` query (RBAC: `visits.view`) — returns count of today's non-terminal visits (IST day boundary), used by admin sidebar badge and guard nav badge

### Acceptance Criteria

1. `visits.create` is permission-gated by `requirePermission(ctx, "visits.create")` and accepts `{ lead_id: Id<"leads">, scheduled_start: number, scheduled_end: number, assigned_guard_id: Id<"users"> }`.
2. `visits.create` rejects when lead status is not exactly `"VERIFIED"` and returns explicit errors for `REJECTED`/`DUPLICATE` leads.
3. `visits.create` rejects when assigned guard status is `"INACTIVE"` or `"BANNED"`.
4. `visits.create` rejects when assigned guard does not belong to the same society as the lead (`guard_profile.society_id !== lead.society_id`).
5. `visits.create` rejects when `scheduled_start >= scheduled_end`.
6. Successful `visits.create` stores `society_id` from lead, sets `status: "ASSIGNED"`, sets `created_by_admin_id`, and stores `listing_id` when `listings.by_lead_id` finds a listing.
7. `visits.getById` returns `{ visit, lead, building, society, guard, listing? }` (listing optional) and is gated by `visits.view`.
8. `visits.list` returns paginated results, supports all listed optional filters (including date range on `scheduled_start`), and orders by `scheduled_start` ascending (upcoming first).
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual mutation/query smoke checks: create visit from VERIFIED lead, verify denormalized/link fields, then query via `getById` and filtered `list`.

### Out of Scope

- Admin status transition mutations (`confirm`, `cancel`, `markNoShow`, `edit`)
- Guard execution mutations (`start`, `complete`)
- Guard availability computation

---

## T03: Visit Status Transition Mutations (Admin)

### Objective

Implement admin-only visit lifecycle control APIs for confirm/cancel/no-show/edit with strict transition validation and reassignment/schedule safeguards.

### Required Reading

- `notes/04-state-machines.md` — visit status transition table
- `notes/features/06-visit-management.md` — "Admin Actions" sections
- `notes/13-constants-reference.md` — visit permission strings and status literals
- `notes/03-roles-and-permissions.md` — who can execute `visits.edit` and `visits.cancel`

### Key Rules

1. `visits.confirm` requires `requirePermission(ctx, "visits.edit")` and only allows `ASSIGNED -> CONFIRMED`.
2. `visits.cancel` requires `requirePermission(ctx, "visits.cancel")`, allows `ASSIGNED | CONFIRMED -> CANCELLED`, and stores optional `reason` in `outcome_notes`.
3. `visits.markNoShow` requires `requirePermission(ctx, "visits.edit")`, allows `ASSIGNED | CONFIRMED -> NO_SHOW`, and stores optional notes in `outcome_notes`.
4. `visits.edit` requires `requirePermission(ctx, "visits.edit")`; args include `id` and optional `scheduled_start`, `scheduled_end`, `assigned_guard_id`.
5. `visits.edit` rejects terminal visits (`COMPLETED`, `CANCELLED`, `NO_SHOW`).
6. If schedule fields change, enforce `scheduled_start < scheduled_end`.
7. If `assigned_guard_id` changes, validate new guard is `ACTIVE`, belongs to the same society as the visit (`guard_profile.society_id === visit.society_id`), and clear `needs_reassignment` to `false`.
8. Reuse `validateVisitTransition` from T01 for all status changes; do not duplicate ad-hoc transition logic.

### Deliverables

- [x] `convex/visits.ts` — Add `visits.confirm` mutation (`visits.edit` RBAC)
- [x] `convex/visits.ts` — Add `visits.cancel` mutation (`visits.cancel` RBAC)
- [x] `convex/visits.ts` — Add `visits.markNoShow` mutation (`visits.edit` RBAC)
- [x] `convex/visits.ts` — Add `visits.edit` mutation (schedule/guard updates + reassignment flag clearing)
- [x] `convex/leads.ts` — Resolve TODO P07 at line ~504: when a VERIFIED lead is rejected, cancel all non-terminal visits for that lead (query `visits.by_lead_id`, filter out COMPLETED/CANCELLED/NO_SHOW, patch each to `status: "CANCELLED"` with `outcome_notes: "Lead rejected"`)

### Acceptance Criteria

1. `visits.confirm` succeeds only when current status is `"ASSIGNED"` and transitions to `"CONFIRMED"`.
2. `visits.cancel` succeeds only from `"ASSIGNED"` or `"CONFIRMED"`, transitions to `"CANCELLED"`, and persists optional `reason` in `outcome_notes`.
3. `visits.markNoShow` succeeds only from `"ASSIGNED"` or `"CONFIRMED"`, transitions to `"NO_SHOW"`, and persists optional notes in `outcome_notes`.
4. `visits.edit` rejects attempts to edit terminal visits (`COMPLETED`, `CANCELLED`, `NO_SHOW`).
5. `visits.edit` rejects schedule updates where `scheduled_start >= scheduled_end`.
6. `visits.edit` rejects reassignment to guard with status `INACTIVE` or `BANNED`.
7. `visits.edit` rejects reassignment to guard from a different society (`guard_profile.society_id !== visit.society_id`).
8. Reassigning to a new ACTIVE, same-society guard clears `needs_reassignment` to `false`.
9. Invalid transitions (for example `COMPLETED -> CONFIRMED`) fail explicitly via transition validation.
10. Lead rejection cascade: when a VERIFIED lead is rejected (`convex/leads.ts` reject mutation), all non-terminal visits for that lead are cancelled with `outcome_notes: "Lead rejected"`. The `TODO P07` comment at `leads.ts:~504` is replaced with working code.
11. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual mutation checks: run valid and invalid transition cases, plus schedule/reassign edge cases.

### Out of Scope

- Guard-facing `start`/`complete` execution mutations
- Guard visit list queries
- Admin UI action button implementation

---

## T04: Guard Visit Execution Mutations

### Objective

Implement guard-authenticated visit execution APIs and guard-scoped visit queries so guards can only operate on their own assignments.

### Required Reading

- `notes/features/06-visit-management.md` — "Guard Flow" sections
- `notes/03-roles-and-permissions.md` — guard hardcoded permissions model
- `notes/13-constants-reference.md` — visit outcome enum and status literals
- `notes/04-state-machines.md` — ASSIGNED shortcut and completion constraints

### Key Rules

1. `visits.start` and `visits.complete` use `requireGuard(ctx)` (NOT `requirePermission`).
2. For both mutations, enforce `guard._id === visit.assigned_guard_id`; reject cross-guard access.
3. `visits.start` allows only `ASSIGNED -> IN_PROGRESS` and `CONFIRMED -> IN_PROGRESS`; set `started_at = Date.now()`.
4. `visits.complete` allows only `IN_PROGRESS -> COMPLETED`; requires `outcome` in `INTERESTED | NOT_INTERESTED | FOLLOWUP`, accepts optional `outcome_notes`, and sets `completed_at = Date.now()`.
5. `visits.getMyVisits` uses `requireGuard`, filters by caller `assigned_guard_id`, supports optional `date_from`/`date_to`, orders by `scheduled_start` descending, and returns visit + lead/building/society context.
6. `visits.getMyTodayVisits` uses `requireGuard`, filters by caller `assigned_guard_id` and IST day window (`00:00` to next `00:00` IST), and returns visit + lead context.
7. Guard APIs must never return other guards' visits, even when IDs are guessed.

### Deliverables

- [x] `convex/visits.ts` — Add `visits.start` mutation (guard-auth, own-visit enforcement)
- [x] `convex/visits.ts` — Add `visits.complete` mutation (required outcome + completion fields)
- [x] `convex/visits.ts` — Add `visits.getMyVisits` query (guard-scoped list + optional date range)
- [x] `convex/visits.ts` — Add `visits.getMyTodayVisits` query (IST day filter)

### Acceptance Criteria

1. `visits.start` succeeds for assigned guard when visit status is `"ASSIGNED"` or `"CONFIRMED"` and sets `started_at`.
2. `visits.start` rejects when caller is not the assigned guard.
3. `visits.complete` succeeds only from `"IN_PROGRESS"`, requires `outcome`, and sets both `completed_at` and `status: "COMPLETED"`.
4. `visits.complete` rejects when `outcome` is missing or outside `INTERESTED | NOT_INTERESTED | FOLLOWUP`.
5. `visits.getMyVisits` returns only visits where `assigned_guard_id` equals authenticated guard `_id`, with optional date filtering and descending `scheduled_start` order.
6. `visits.getMyTodayVisits` returns only the authenticated guard's visits whose `scheduled_start` falls inside today's IST boundary.
7. Terminal invalid transitions (for example `COMPLETED -> IN_PROGRESS`) fail.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual guard-flow checks: assigned guard can start/complete; another guard cannot; today query respects IST boundaries.

### Out of Scope

- Admin RBAC visit mutations
- Visit board aggregation/filter UI
- Closure creation from visit completion

---

## T05: Guard Availability Query + needs_reassignment Verification

### Objective

Add the shift-aware guard availability query used during scheduling and verify that P03's ban/deactivation path correctly flags in-progress/non-terminal visits with `needs_reassignment`.

### Required Reading

- `notes/features/02-guard-management.md` — shift model (`RECURRING`, `OVERRIDE`) and guard types
- `notes/features/06-visit-management.md` — "Guard Assignment" and availability indicator behavior
- `notes/10-convex-schema.md` — `guard_shifts` table, `visits.by_needs_reassignment` index
- `notes/13-constants-reference.md` — guard status literals and visit permissions
- `tasks/phase-03-guard-management/P03-E01-guard-account-backend.md` — ban/deactivation implementation context
- `tasks/phase-03-guard-management/P03-E03-guard-shift-management.md` — shift computation and precedence rules

### Key Rules

1. Implement `visits.getGuardAvailability` as a query gated by `requirePermission(ctx, "visits.create")`.
2. Query args: `society_id`, `building_id`, `date`, `time_start`, `time_end` (`society_id` and `building_id` are IDs, rest are Unix milliseconds). `building_id` is required to compute `ON_SHIFT_SAME_BUILDING` vs `ON_SHIFT_DIFFERENT_LOCATION` — compare each guard's shift building against the target building.
3. Fetch society guards via `guard_profiles`, then map each guard's user status (`ACTIVE`, `INACTIVE`, `BANNED`).
4. For ACTIVE guards, compute shift for the target date with precedence: `OVERRIDE` on exact `specific_date` first, then `RECURRING` by day-of-week.
5. Compare shift `start_time`/`end_time` with requested visit range and produce one indicator per guard: `ON_SHIFT_SAME_BUILDING`, `ON_SHIFT_DIFFERENT_LOCATION`, `OFF_DUTY`, `INACTIVE`, `BANNED`.
6. Availability is advisory only: return indicator metadata but never hard-block assignment logic in create/edit mutations.
7. **Ban path** (`banGuardInternal` at `guards.ts:770-810`) already patches `needs_reassignment = true` on non-terminal visits ✅ — verify this still works. **Deactivation path** (`ACTIVE→INACTIVE` at `guards.ts:279-285`) is MISSING this logic ❌ — P07-E01-T05 MUST add the same `needs_reassignment` flagging to the deactivation handler (patch all non-terminal visits for the guard with `needs_reassignment: true`, same filter as `banGuardInternal`: exclude COMPLETED, CANCELLED, NO_SHOW).
8. Record verification result (both paths confirmed vs blocker raised) in this epic's Completion Summary when marking done.

### Deliverables

- [x] `convex/visits.ts` — Add `visits.getGuardAvailability` query with shift-aware indicator computation
- [x] `convex/guards.ts` — Verify `banGuardInternal` (ban path) still works ✅, then ADD `needs_reassignment` flagging to the deactivation path (`ACTIVE→INACTIVE` at lines 279-285): query all non-terminal visits for the guard and patch `needs_reassignment: true` (same pattern as `banGuardInternal` lines 788-806). Document in Completion Summary.
- [x] `tasks/phase-07-visit-management/P07-E01-visit-backend.md` — Completion Summary note documenting needs_reassignment verification finding

### Acceptance Criteria

1. `visits.getGuardAvailability` is permission-gated by `requirePermission(ctx, "visits.create")` and accepts `{ society_id: Id<"societies">, building_id: Id<"buildings">, date: number, time_start: number, time_end: number }`.
2. Query response rows include: `guard_id`, `guard_name`, `guard_type`, `availability_indicator`, `shift_location` (building name or null for context display in UI).
3. `availability_indicator` uses only `ON_SHIFT_SAME_BUILDING`, `ON_SHIFT_DIFFERENT_LOCATION`, `OFF_DUTY`, `INACTIVE`, `BANNED`.
4. `INACTIVE` and `BANNED` guards are returned with those indicators (not omitted), supporting disabled selection in UI.
5. Shift precedence is correct: matching `OVERRIDE` for specific date supersedes any `RECURRING` shift.
6. ACTIVE guard with no matching shift overlap is labeled `OFF_DUTY`.
7. needs_reassignment is complete: `ACTIVE→BANNED` (via `banGuardInternal`) confirmed working ✅. `ACTIVE→INACTIVE` (deactivation) now ALSO patches `needs_reassignment = true` on non-terminal visits (added by this task, same pattern as `banGuardInternal` lines 788-806).
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: compare availability output for guards with override vs recurring shifts; ban/deactivate a guard in dev and verify non-terminal assigned visits are flagged `needs_reassignment = true`.

### Out of Scope

- Auto-assignment algorithm or scoring beyond indicator labels
- Hard blocking assignment when guard is off shift
- Admin visit board UI rendering of indicator icons

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- Added full visit domain module in `convex/visits.ts` with status transition helper, admin scheduling/list APIs, admin status actions, guard execution APIs, guard-scoped queries, today-count query, and shift-aware guard availability indicators.
- Added audit trigger coverage for visits by including `"visits"` in `convex/functions.ts` `AUDITED_TABLES`.
- Implemented lead rejection cascade in `convex/leads.ts` to cancel non-terminal linked visits with `outcome_notes: "Lead rejected"`.
- Added deactivation reassignment hook in `convex/guards.ts` so `ACTIVE -> INACTIVE` now flags non-terminal assigned visits with `needs_reassignment: true` (matching existing ban behavior).
- Added shared `src/components/shared/visit-status-badge.tsx` with all six visit statuses and documented color mapping.

### Key File Locations

- `convex/functions.ts`
- `convex/visits.ts`
- `convex/leads.ts`
- `convex/guards.ts`
- `src/components/shared/visit-status-badge.tsx`

### Deviations from Spec

- None.

### Gotchas for Next Epic

- `visits.getTodayCount` returns a number (count only) for today's non-terminal visits in IST.
- `visits.getGuardAvailability` requires `building_id` and returns inactive/banned guards with disabled indicators instead of omitting them.
- needs_reassignment verification: ban path already worked before this epic (`banGuardInternal`), deactivation path is now aligned and sets the same flag for non-terminal visits.
