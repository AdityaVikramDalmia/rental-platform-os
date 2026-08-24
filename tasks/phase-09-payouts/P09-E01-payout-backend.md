---
id: P09-E01
title: Payout Backend
phase: 9
status: done
depends_on: ["P08-E01", "P01-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P09-E01: Payout Backend

## Overview

Implement the payout backend foundation for Phase 9: create the `convex/payouts.ts` domain module, enforce payout lifecycle transitions (`pending → approved → disbursed`, `pending/approved → voided`, `approved → failed`), support one-payout-per-closure with auto-filled guard/lead from the closure→lead chain, provide admin list/detail queries with required joins, implement guard earnings query with data privacy enforcement, and create the shared `payout-status-badge.tsx` component so E02 and E03 can consume it without hidden dependencies.

## Prerequisites

- **Read first**: [P08-E01 Completion Summary](../phase-08-closure/P08-E01-closure-backend.md#completion-summary) — payout creation must enforce closure `status === "CONFIRMED"`. `closures.cancel` already handles system-triggered payout void cascade (P08-E01-T03) — P09 does NOT re-implement this.
- **Read first**: [P01-E02 Completion Summary](../phase-01-auth/P01-E02-schema-and-infra.md#completion-summary) — ⚠️ `payouts` is NOT in AUDITED_TABLES. Must be added to `convex/functions.ts` AUDITED_TABLES array before implementing audit-dependent features.

## Task Queue

- [x] P09-E01-T01: Payout Domain Module + Status Transition Helper + Shared Badge
- [x] P09-E01-T02: Payout Create + List + GetById
- [x] P09-E01-T03: Payout Approve + Disburse + Fail
- [x] P09-E01-T04: Payout Void (Manual Admin Void)
- [x] P09-E01-T05: Guard Earnings Query

---

## T01: Payout Domain Module + Status Transition Helper + Shared Badge

### Objective

Create the payout module scaffold, centralize payout transition validation in a reusable helper, and create a role-agnostic shared payout status badge in E01 so E02 admin UI and E03 guard earnings can consume it without hidden cross-epic dependency.

### Required Reading

- `notes/04-state-machines.md` — "Payout Status" section and terminal-state rules
- `notes/10-convex-schema.md` — `payouts` table definition (lines ~417-437) and `audit_logs.action` union literals (`PAYOUTS_INSERT`, `PAYOUTS_UPDATE`)
- `notes/11-convex-architecture.md` — "Function Layer Architecture" (`mutation` import conventions, AUDITED_TABLES list)
- `notes/13-constants-reference.md` — "Payout Status" colors, payout permissions, and "Audit Action Strings" for payouts
- `tasks/phase-08-closure/P08-E01-closure-backend.md` — T01 pattern for shared badge placement in backend epic

### Key Rules

1. Create `convex/payouts.ts` as the payout domain module and keep all payout backend functions in this file.
2. Import `mutation` from `./functions` (audit-enabled path) and import `query` from `./_generated/server` exactly — same pattern as `convex/closures.ts`.
3. Add `validatePayoutTransition(currentStatus, newStatus)` helper returning `boolean`.
4. Encode transitions exactly from schema-aligned flow: `pending -> approved`, `approved -> disbursed`, `approved -> failed`, `pending -> voided`, `approved -> voided`; terminal states `disbursed`, `failed`, and `voided` have no outgoing transitions.
5. Create `src/components/shared/payout-status-badge.tsx` in E01 (not E02 or E03) to avoid hidden dependency and unblock parallel-safe UI consumption.
6. Badge colors must match `notes/13-constants-reference.md` exactly for `pending`, `approved`, `disbursed`, `failed`, and `voided`.
7. ⚠️ `payouts` is NOT in AUDITED_TABLES. Must be added to `convex/functions.ts` AUDITED_TABLES array before implementing audit-dependent features. Do NOT add `PAYOUTS_INSERT`/`PAYOUTS_UPDATE` to `audit_logs.action` union — these are already present in the schema.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/schema.ts` — Perform schema migration (field renames, status migration, field additions) as specified in README "Schema Migration Required" section
- [ ] `lib/constants.ts` — Perform permission migration (PAYOUTS_MARK_PAID → PAYOUTS_DISBURSE, add PAYOUTS_VOID) as specified in README
- [ ] `convex/closures.ts` — Update `closures.cancel` void cascade to use post-migration status values (`pending` and `approved` instead of `INITIATED`) so both pre-disbursement statuses are voided on closure cancellation
- [ ] `convex/payouts.ts` — Create module skeleton with required imports and shared transition helper
- [ ] `convex/payouts.ts` — Add explicit `validatePayoutTransition(currentStatus, newStatus)` map matching the state machine exactly
- [ ] `convex/functions.ts` — Verify `payouts` in `AUDITED_TABLES`; add if missing (drift fix)
- [ ] `src/components/shared/payout-status-badge.tsx` — Shared role-agnostic badge with exact 5-status color mapping (pending/approved/disbursed/failed/voided)

### Acceptance Criteria

1. `convex/payouts.ts` exists and imports `mutation` from `./functions` plus `query` from `./_generated/server`.
2. `validatePayoutTransition("pending", "approved")` returns `true`.
3. `validatePayoutTransition("pending", "voided")` returns `true`.
4. `validatePayoutTransition("approved", "disbursed")` returns `true`.
5. `validatePayoutTransition("approved", "failed")` returns `true`.
6. `validatePayoutTransition("approved", "voided")` returns `true`.
7. `validatePayoutTransition("disbursed", "approved")` returns `false`.
8. `src/components/shared/payout-status-badge.tsx` renders `pending`, `approved`, `disbursed`, `failed`, `voided` with exact Tailwind classes from constants docs.
9. Badge component is shared/role-agnostic and does not import admin-only or guard-only modules.
10. `payouts` is present in `AUDITED_TABLES` in `convex/functions.ts` after this task.
11. `PAYOUTS_INSERT`/`PAYOUTS_UPDATE` are NOT re-added to `audit_logs.action` (already present).
12. `npx tsc --noEmit` passes.
13. `convex/schema.ts` has all field renames (`amount` → `amount_paise`, `paid_at` → `disbursed_at`, `receipt_note` → `payment_reference`) and field additions (`approved_at`, `failure_reason`, `voided_reason`, `voided_by`, `voided_at`) applied. `method` field is handled per the chosen migration path (optional or defaulted).
14. `payoutStatusValidator` uses lowercase values: `pending`, `approved`, `disbursed`, `failed`, `voided`.
15. `lib/constants.ts` has `PAYOUTS_DISBURSE: "payouts.disburse"` and `PAYOUTS_VOID: "payouts.void"`.
16. `convex/closures.ts` `cancel` cascade voids payouts in both `pending` and `approved` statuses (post-migration values).
17. Seed/role data updated for renamed permission strings.

### Verification

```bash
npx tsc --noEmit
```

Manual check: validate transition helper truth table, verify schema fields in Convex dashboard, verify closures.cancel cascade targets post-migration status values, and run `lsp_diagnostics` on `convex/payouts.ts`, `convex/functions.ts`, `convex/schema.ts`, `convex/closures.ts`, `lib/constants.ts`, and `src/components/shared/payout-status-badge.tsx`.

### Out of Scope

- Payout CRUD/query implementation
- Admin payout UI components
- Guard earnings query or UI

---

## T02: Payout Create + List + GetById

### Objective

Implement payout creation with CONFIRMED-only closure gating, one-payout-per-closure enforcement, auto-fill of guard/lead from closure→lead chain, and joined list/detail payloads required by admin payout workflows.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Part 2: Payouts", "Payout Form", "Convex Functions" (`payouts.create`, `payouts.list`, `payouts.getById`), Business Rules #3, #4, #5
- `notes/10-convex-schema.md` — `payouts` table args and indexes (`by_guard_user_id`, `by_status`, `by_lead_id`, `by_closure_id`)
- `notes/02-data-models.md` — Section L (Payout) field descriptions and notes
- `notes/11-convex-architecture.md` — Auth helper usage (`requirePermission`)
- `notes/13-constants-reference.md` — payout permissions (`payouts.view`, `payouts.approve`, `payouts.disburse`, `payouts.void`), payout status literals

### Key Rules

1. `payouts.create` must use `requirePermission(ctx, "payouts.create")`.
2. `payouts.create` args are: `closure_id` (required), `amount_paise` (required, paise integer), `payment_reference` (optional string).
3. `payouts.create` validates `closure.status === "CONFIRMED"` before insert (Business Rule #3).
4. Enforce one payout per closure by querying `payouts.by_closure_id`; throw if an existing payout is found (Business Rule #4).
5. Auto-fill `guard_user_id` from the closure→lead→`submitted_by_guard_id` chain — NOT from form input.
6. Auto-fill `lead_id` from the closure record — NOT from form input.
7. Insert with `status: "pending"`.
8. `payouts.create` MUST set `initiated_by_admin_id` (or `created_by_admin_id` after migration) from the authenticated admin's user ID via `requirePermission` context — NOT from client args. This field is currently required in schema.
9. `payouts.getById` must use `requirePermission(ctx, "payouts.view")` and return `{ payout, closure, lead, guard, building, society }` joins. Derive society via lead→building→society chain (no `society_id` on payouts schema). Do NOT resolve document URLs — payouts have no file uploads.
10. `payouts.list` must use `requirePermission(ctx, "payouts.view")`, support `paginationOptsValidator`, filter by optional `status` (single status string; use `by_status` index when provided), optional `guard_user_id` (via `by_guard_user_id` index — UI resolves guard name→ID), and optional `date_from`/`date_to` on `_creationTime` (post-index filter). Sort order is descending by `_creationTime` (newest first, index-compatible).
11. The `listPayouts` query accepts an optional `status` parameter. For multi-status filtering, the UI should call the query multiple times or implement client-side post-filtering. The backend API is single-status-at-a-time.
12. Payout amount is manually entered by admin — no auto-calculation from commission/brokerage (Business Rule #5). `amount_paise` must be positive integer paise.
13. Do not denormalize `society_id` onto `payouts`; derive society in query via `lead → building → society` joins at read time.

### Deliverables

- [ ] `convex/payouts.ts` — Add `payouts.create` mutation with CONFIRMED-only closure gating, one-per-closure enforcement, guard/lead auto-fill
- [ ] `convex/payouts.ts` — Add `payouts.getById` query with required joined payload (closure + lead + guard + building + society)
- [ ] `convex/payouts.ts` — Add `payouts.list` paginated query with status/guard/date filters, `_creationTime` desc sort

### Acceptance Criteria

1. `payouts.create` requires `requirePermission(ctx, "payouts.create")` and accepts args: `closure_id` (required), `amount_paise` (required), `payment_reference` (optional).
2. `payouts.create` rejects when closure status is not exactly `"CONFIRMED"`.
3. `payouts.create` rejects when a payout already exists for the same `closure_id` via `payouts.by_closure_id` lookup.
4. `payouts.create` auto-fills `guard_user_id` by loading closure → loading lead → reading `submitted_by_guard_id`. Does NOT accept `guard_user_id` as an arg.
5. `payouts.create` auto-fills `lead_id` by reading `closure.lead_id`. Does NOT accept `lead_id` as an arg.
6. `payouts.create` inserts with `status: "pending"`.
7. `payouts.create` sets `initiated_by_admin_id` (or `created_by_admin_id` after migration) from auth context — NOT from client args.
8. `payouts.create` rejects non-positive or non-integer `amount_paise` values.
9. `payouts.getById` is gated by `payouts.view` and returns `{ payout, closure, lead, guard, building, society }`.
10. `payouts.getById` derives society via lead→building→society joins (no `society_id` on payouts).
11. `payouts.list` is gated by `payouts.view`, supports `paginationOptsValidator`, accepts optional single `status` (uses `by_status` index), optional `guard_user_id` (uses `by_guard_user_id` index), optional `date_from`/`date_to` on `_creationTime` (post-index filter). Sort descending by `_creationTime`.
12. Multi-status UI filtering follows backend contract: fan-out query calls or client-side post-filtering.
13. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: create payout from CONFIRMED closure, retry create on same closure (expect rejection), create from PENDING closure (expect rejection), fetch via `getById`, run `list` with status/guard/date filters.

### Out of Scope

- Payout approve/disburse/fail/void mutations
- Guard earnings query
- Admin UI for payout creation

---

## T03: Payout Approve + Disburse + Fail

### Objective

Implement admin approval and disbursement mutations for the payout lifecycle (`pending → approved → disbursed`), include disbursement failure handling (`approved → failed`), enforce payout state machine validity via shared helper, and set `approved_by`, `disbursed_at`, and `failure_reason`.

### Required Reading

- `notes/04-state-machines.md` — "Payout Status" section (`pending → approved → disbursed`, `approved → failed`)
- `notes/features/07-closure-and-payouts.md` — "Payout Lifecycle" table and Business Rules #8, #9
- `notes/03-roles-and-permissions.md` — `payouts.approve` and `payouts.disburse` permission ownership
- `notes/13-constants-reference.md` — payout permission strings and audit action strings

### Key Rules

1. `payouts.approve` uses `requirePermission(ctx, "payouts.approve")` and only allows `pending → approved`.
2. `payouts.approve` sets `approved_by` from authenticated admin context AND `approved_at = Date.now()` on successful approval.
3. `payouts.disburse` uses `requirePermission(ctx, "payouts.disburse")` and only allows `approved → disbursed`.
4. `payouts.disburse` sets `disbursed_at = Date.now()` on successful disbursement (Business Rule #8: `disbursed` is terminal).
5. `payouts.disburse` accepts optional `payment_reference` to store transaction/reference details. If `method` was made optional in T01 migration, `payouts.disburse` should also accept optional `method` (CASH/UPI/BANK_TRANSFER) and set it at disburse time. If `method` was defaulted at creation, `payouts.disburse` may accept optional `method` to update it.
6. `payouts.fail` uses `requirePermission(ctx, "payouts.disburse")` and only allows `approved → failed`, requiring `failure_reason`.
7. `payouts.approve` permission is distinct from `payouts.disburse`; do not substitute one for the other.
8. Reuse `validatePayoutTransition` from T01 for both mutations — reject invalid transitions explicitly with descriptive error messages.
9. Separation of duties is recommended but NOT system-enforced in V1 (Business Rule #9).

### Deliverables

- [ ] `convex/payouts.ts` — Add `payouts.approve` mutation (`payouts.approve` RBAC, sets `approved_by` + `approved_at`)
- [ ] `convex/payouts.ts` — Add `payouts.disburse` mutation (`payouts.disburse` RBAC, sets `disbursed_at`, optional `payment_reference`)
- [ ] `convex/payouts.ts` — Add `payouts.fail` mutation (`payouts.disburse` RBAC, sets `failure_reason`)
- [ ] `convex/payouts.ts` — Wire approve/disburse/fail mutations through `validatePayoutTransition`

### Acceptance Criteria

1. `payouts.approve` is gated by `requirePermission(ctx, "payouts.approve")` and rejects callers with only `payouts.view`.
2. `payouts.approve` succeeds only when payout status is `"pending"`; all other source statuses are rejected.
3. `payouts.approve` sets `status: "approved"`, sets `approved_by` from auth context, AND sets `approved_at = Date.now()`.
4. `payouts.disburse` is gated by `requirePermission(ctx, "payouts.disburse")` and succeeds only from `"approved"`.
5. `payouts.disburse` sets `status: "disbursed"` and sets `disbursed_at` to a Unix ms timestamp (`Date.now()`).
6. `payouts.disburse` updates `payment_reference` if provided in args.
7. `payouts.fail` is gated by `requirePermission(ctx, "payouts.disburse")`, succeeds only from `"approved"`, and writes non-empty `failure_reason`.
8. Approve/disburse/fail transitions call `validatePayoutTransition` and fail invalid transitions explicitly.
9. Attempting to approve a `voided` payout fails.
10. Attempting to disburse a `pending` payout fails (must be `approved` first).
11. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: approve a `pending` payout, disburse an `approved` payout, fail an `approved` payout, attempt invalid transitions (approve `voided`, disburse `pending`, approve `disbursed`), verify `approved_by`, `disbursed_at`, and `failure_reason` are set correctly.

### Out of Scope

- Manual void mutation (T04)
- Guard earnings query
- System-triggered void cascade (already in P08-E01-T03's `closures.cancel`)

---

## T04: Payout Void (Manual Admin Void)

### Objective

Implement the standalone manual void mutation for admin-initiated payout voids, distinct from the system-triggered void cascade already in P08's `closures.cancel`. This allows admins to void `pending`/`approved` payouts independently of closure cancellation.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Payout Voiding" section (lines 97-108)
- `notes/04-state-machines.md` — "Payout Status" (`pending/approved → voided`, terminal states)
- `notes/13-constants-reference.md` — `voided` status color (`bg-gray-100 text-gray-500`)
- `tasks/phase-08-closure/P08-E01-closure-backend.md` — T03 (closures.cancel with payout void cascade) — understand what P08 already does to avoid duplication

### Key Rules

1. `payouts.void` uses `requirePermission(ctx, "payouts.void")`.
2. `payouts.void` allows `pending → voided` and `approved → voided`. Reject void attempts on `disbursed`, `failed`, or already `voided` payouts.
3. Accept optional `voided_reason` arg (string) and persist `voided_reason`, `voided_by`, and `voided_at`.
4. Reuse `validatePayoutTransition` from T01 for transition validation.
5. Do NOT re-implement the system-triggered void cascade from P08-E01-T03's `closures.cancel`. That mutation already queries `payouts.by_closure_id` and patches eligible payouts to `voided` when a closure is cancelled. P09's `payouts.void` is for manual admin-initiated voids ONLY.
6. Guard visibility: voided payouts disappear from guard's pending section — no explicit "voided" display to guard. The `getGuardEarnings` query (T05) filters out `voided` payouts.

### Deliverables

- [ ] `convex/payouts.ts` — Add `payouts.void` mutation (`payouts.void` RBAC, `pending/approved → voided`, optional `voided_reason`, sets `voided_by` + `voided_at`)

### Acceptance Criteria

1. `payouts.void` is gated by `requirePermission(ctx, "payouts.void")`.
2. `payouts.void` succeeds only when payout status is `"pending"` or `"approved"`.
3. `payouts.void` rejects void attempts on `"disbursed"` payouts with descriptive error.
4. `payouts.void` rejects void attempts on `"failed"` or already `"voided"` payouts with descriptive error.
5. `payouts.void` sets `status: "voided"` and writes `voided_reason` (if provided), `voided_by`, and `voided_at`.
6. `payouts.void` does NOT query or modify closures — it operates on a single payout record only.
7. `payouts.void` does NOT modify `closures.cancel`. The required `closures.cancel` cascade migration (updating it to void `pending`/`approved` payouts) is handled in E01-T01 and must NOT be duplicated here.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: void a `pending` payout, void an `approved` payout, attempt void on `disbursed` payout (expect rejection), attempt void on `failed` payout (expect rejection), verify `voided_reason`, `voided_by`, and `voided_at`.

### Out of Scope

- System-triggered void cascade (already in P08's `closures.cancel`)
- Reverse/refund of `disbursed` payouts (handle offline per Business Rule #8)
- Guard earnings query filtering out `voided` payouts (T05)

---

## T05: Guard Earnings Query

### Objective

Implement the guard-facing earnings query that returns pending, disbursed, and failed payouts for the authenticated guard, enforces data privacy (guard cannot see payout amount until `approved`/`disbursed`/`failed` — only `pending` hides amount), and computes total earned — the backend powering the guard earnings page (P09-E03).

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Guard Flow: Earnings" section (lines 125-172), "What guard sees vs doesn't see" table
- `notes/05-guard-portal-ux.md` — Flow 6: Earnings page wireframe
- `notes/03-roles-and-permissions.md` — "Guard Permissions (Hardcoded — not RBAC)" section
- `notes/11-convex-architecture.md` — `requireGuard` auth helper pattern
- `notes/10-convex-schema.md` — `payouts.by_guard_user_id` index

### Key Rules

1. `payouts.getGuardEarnings` uses `requireGuard(ctx)` — NOT `requirePermission`. Guards have hardcoded capabilities, not RBAC. **⚠️ P11 migration note**: P11-E01-T01 will later migrate this query from `requireGuard` to `requireGuardAuth` so INACTIVE guards can view earnings history. Do not write hard assertions that INACTIVE guards must be blocked from this query.
2. Query accepts NO args. It uses the authenticated guard's user ID from `requireGuard` return value exclusively. A guard can only view their own earnings — never another guard's. If admin needs to view a specific guard's earnings, they use `payouts.list` with `guard_user_id` filter (gated by `payouts.view`).
3. Return shape: `{ pending: EnrichedPayout[], disbursed: EnrichedPayout[], failed: EnrichedPayout[], total_earned: number }`.
4. **Pending section**: payouts with status `pending` or `approved` (not yet disbursed, not voided). Include building + flat reference (from lead→building join), closure confirmed date (from closure), prospective bounty (from lead's `prospective_bounty` field if it exists).
5. **Disbursed section**: payouts with status `disbursed`. Include building + flat reference, payout amount (₹), `disbursed_at` date, `payment_reference`. Sorted by `disbursed_at` descending (newest first).
6. **Failed section**: payouts with status `failed`. Include building + flat reference, last attempted disbursement metadata if present, and `failure_reason`.
7. **Total earned**: sum of all `disbursed` payout `amount_paise` values. Frontend converts to ₹.
8. **Data privacy enforcement (Business Rule #6)**: For `pending` payouts, do NOT include `amount_paise` in response. For `approved`, `disbursed`, and `failed` payouts, include `amount_paise`.
9. **`voided` payouts are excluded entirely** — guard sees the payout disappear from pending section. No "voided" display.
10. Enrich each payout with building name + flat number from the lead→building join chain. Do NOT expose: commission amounts, brokerage breakdown, rent agreement storage IDs, closure notes, or admin notes — these are admin-only fields.
11. Use `payouts.by_guard_user_id` index for efficient guard-scoped queries.

### Deliverables

- [ ] `convex/payouts.ts` — Add `payouts.getGuardEarnings` query (no args — uses auth guard ID only) with `requireGuard`, pending/disbursed/failed split, total_earned computation, data privacy filtering
- [ ] `convex/payouts.ts` — Ensure guard-facing response excludes admin-only fields (commission, brokerage, rent agreement, closure notes, demorentals_deal_id, `approved_by`, `voided_by`)

### Acceptance Criteria

1. `payouts.getGuardEarnings` uses `requireGuard(ctx)` — not `requirePermission`.
2. Return shape matches `{ pending: EnrichedPayout[], disbursed: EnrichedPayout[], failed: EnrichedPayout[], total_earned: number }`.
3. Pending array contains only `pending` and `approved` payouts for the guard. `voided` payouts are excluded.
4. Disbursed array contains only `disbursed` payouts for the guard.
5. Failed array contains only `failed` payouts for the guard and includes `failure_reason` when present.
6. `pending` payouts in pending array do NOT include `amount_paise` field (Business Rule #6). They DO include prospective bounty from lead (if available).
7. `approved` payouts in pending array DO include `amount_paise` field.
8. `disbursed` payouts include `amount_paise`, `disbursed_at`, and `payment_reference`.
9. `total_earned` is the sum of `amount_paise` from all `disbursed` payouts (in paise).
10. Each enriched payout includes `building_name` and `flat_number` from lead→building join chain.
11. Response NEVER includes: `commission_amount`, `brokerage_tenant_side`, `brokerage_owner_side`, `rent_agreement_storage_id`, `additional_documents`, `notes` (closure), `demorentals_deal_id`, `approved_by`, `voided_by`, `closed_by_admin_id`.
12. Query uses `payouts.by_guard_user_id` index for filtering.
13. Query accepts NO args — guard ID is derived from `requireGuard(ctx)` only. A guard cannot query another guard's earnings.
14. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: call `getGuardEarnings` as guard, verify `pending` payouts hide `amount_paise`, verify `approved` payouts show `amount_paise`, verify `failed` payouts are returned with `failure_reason`, verify `voided` payouts are excluded, verify `total_earned` sum, verify no admin-only fields leak.

### Out of Scope

- Guard earnings UI components (P09-E03)
- Admin-facing guard earnings view (admin uses `payouts.list` with `guard_user_id` filter)
- Incentive system integration (P10)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
