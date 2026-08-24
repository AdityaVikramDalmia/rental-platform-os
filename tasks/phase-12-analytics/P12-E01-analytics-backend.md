---
id: P12-E01
title: Analytics Backend
phase: 12
status: done
depends_on: ["P01-E02", "P04-E01", "P05-E01", "P07-E01", "P08-E01", "P09-E01", "P11-E01", "P01-E08"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-18
---

# P12-E01: Analytics Backend

## Overview

Implement the analytics backend: register and wire 3 `@convex-dev/aggregate` component instances (`leadCounts`, `visitCounts`, `payoutTotals`) into existing domain mutations for real-time counter maintenance, implement 7 analytics queries in a new `convex/analytics.ts` module covering overview KPIs, lead funnel, lead trend, society comparison, guard leaderboard (with financial data), financial overview, and operational metrics with time window support (`7d`/`30d`/`90d`/`all-time`), implement the daily analytics snapshot cron job that pre-computes expensive metrics and stores them in the `analytics_snapshots` table, and create a one-time backfill `internalMutation` to populate aggregates with historical data. All analytics queries are gated by `requirePermission(ctx, "analytics.view")`. Financial data (payout amounts, guard earnings) additionally requires payout view permissions. Aggregate components are already registered in `convex/convex.config.ts` — P12 wires the data hooks and creates the query functions. The P12 guard leaderboard is DISTINCT from P11's `guards.getLeaderboard`: it includes financial data (`earned`, `closures`) that P11 does not expose.

## Prerequisites

- **Read first**: [P01-E02 Completion Summary](../phase-01-auth/P01-E02-schema-and-infra.md#completion-summary) — `convex/functions.ts` audit trigger wrapper exists. `analytics_snapshots` table is in schema with `by_date` and `by_type_and_date` indexes. Aggregate components (`leadCounts`, `visitCounts`, `payoutTotals`) are registered in `convex/convex.config.ts` but NOT yet wired to mutations. **⚠️ Drift risk**: executing agent must verify all 3 aggregate registrations exist in `convex/convex.config.ts` before wiring hooks.
- **Read first**: [P04-E01 Completion Summary](../phase-04-lead-pipeline/P04-E01-lead-submission-backend.md#completion-summary) — leads exist with indexes: `leads.by_guard_and_status` (`["submitted_by_guard_id", "status"]`), `leads.by_society_and_status` (`["society_id", "status"]`), `leads.by_submitted_by_guard_id` (`["submitted_by_guard_id"]`). Lead creation mutation is in `convex/leads.ts`.
- **Read first**: [P05-E01 Completion Summary](../phase-05-owner-verification/P05-E01-verification-backend.md#completion-summary) — lead status transitions (SUBMITTED → VERIFIED/REJECTED) happen in `convex/verifications.ts`. These are the hook points for `leadCounts` aggregate updates.
- **Read first**: [P07-E01 Completion Summary](../phase-07-visit-management/P07-E01-visit-backend.md#completion-summary) — visits exist with `visits.by_guard_and_status` index (`["assigned_guard_id", "status"]`). Visit status transitions happen in `convex/visits.ts`.
- **Read first**: [P08-E01 Completion Summary](../phase-08-closure/P08-E01-closure-backend.md#completion-summary) — closures exist. Closure confirmation transitions (PENDING → CONFIRMED) are in `convex/closures.ts`.
- **Read first**: [P09-E01 Completion Summary](../phase-09-payouts/P09-E01-payout-backend.md#completion-summary) — payouts exist with status transitions (INITIATED → APPROVED → PAID) in `convex/payouts.ts`. Payout amounts stored in paise.
- **Read first**: [P11-E01 Completion Summary](../phase-11-quality-controls/P11-E01-quality-metrics-backend.md#completion-summary) — `computeMetrics(ctx, guard_user_id, cutoffTimestamp?)` helper exists. `guards.getLeaderboard` exists but P12's analytics leaderboard is DIFFERENT — it includes `earned` (payout totals) and `closures` count that P11 does not have. P12 MAY reuse `computeMetrics` for lead/visit metric computation.
- **Read first**: [P01-E08 Completion Summary](../phase-01-auth/P01-E08-seed-and-config.md#completion-summary) — `system_config` exists. Settings page at `/admin/settings` exists.

## Task Queue

- [x] P12-E01-T01: Aggregate Component Wiring + Backfill
- [x] P12-E01-T02: Overview KPIs + Lead Funnel + Trend Queries
- [x] P12-E01-T03: Society Comparison + Guard Leaderboard Queries
- [x] P12-E01-T04: Financial Overview + Operational Metrics Queries
- [x] P12-E01-T05: Daily Snapshot Cron Job

---

## T01: Aggregate Component Wiring + Backfill

### Objective

Wire the 3 aggregate component instances into existing domain mutations so real-time counters are maintained automatically, and create a one-time `backfillAggregates` `internalMutation` to populate aggregates from historical data.

### Required Reading

- `notes/features/10-analytics.md` — "Using @convex-dev/aggregate for Real-Time Counters" section
- `notes/10-convex-schema.md` — Component Registration section showing 3 aggregate registrations (`leadCounts`, `visitCounts`, `payoutTotals`)
- `notes/11-convex-architecture.md` — "Component Registration" section, aggregate names and access pattern
- Load `convex-api` skill — aggregate API reference (TableAggregate, namespace, sortKey, sumValue, trigger pattern)

### Key Rules

1. Access aggregate instances via `components` from `_generated/api`: `components.leadCounts`, `components.visitCounts`, `components.payoutTotals`. Instantiate with the `TableAggregate` constructor from `@convex-dev/aggregate`.
2. Wire `leadCounts` aggregate with namespace key `{ society_id, status }`:
   - In `convex/leads.ts` → `leads.create`: after inserting the lead, call the aggregate insert with key `{ society_id: lead.society_id, status: lead.status }`, count 1. Note: leads may be created with status `"SUBMITTED"` or `"POTENTIAL_DUPLICATE"` depending on de-dup check outcome — always use the actual created status, not a hardcoded value.
   - In `convex/verifications.ts` and `convex/leads.ts` wherever lead status transitions occur: remove the old key `{ society_id, old_status }` and insert the new key `{ society_id, new_status }`.
3. Wire `visitCounts` aggregate with namespace key `{ assigned_guard_id, status }`:
   - In `convex/visits.ts` wherever visit status transitions occur: remove the old key `{ assigned_guard_id, old_status }` and insert the new key `{ assigned_guard_id, new_status }`.
4. Wire `payoutTotals` aggregate with namespace key `{ status }` and `sumValue = payout amount in paise`:
   - In `convex/payouts.ts` → payout creation: insert with key `{ status: "INITIATED" }`, sum = payout amount in paise.
   - On payout status transitions (INITIATED → APPROVED → PAID): remove old key `{ status: old_status }` and insert new key `{ status: new_status }`, preserving the same amount.
   - On INITIATED → VOIDED transition: remove old key `{ status: "INITIATED" }` and insert new key `{ status: "VOIDED" }`, preserving the amount.
5. Create `analytics.backfillAggregates` as `internalMutation` in `convex/analytics.ts`. It iterates all existing leads, visits, and payouts and populates all 3 aggregate instances. Safe to run multiple times (clear existing entries for each namespace key, then re-insert). Admin triggers via a one-time script or admin settings action.
6. Aggregate hooks MUST be added AFTER the existing `ctx.db.insert` or `ctx.db.patch` call — never before. Existing mutation logic must not be disrupted.
7. Import `internalMutation` from `./functions` for `backfillAggregates` (audit-enabled path). For aggregate hooks added to existing mutations, they inherit the existing mutation's import.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/leads.ts` — Add `leadCounts` aggregate hook on lead creation (insert with `{ society_id, status: "SUBMITTED" }`)
- [ ] `convex/verifications.ts` — Add `leadCounts` aggregate hook on lead status transitions to VERIFIED/REJECTED (remove old key, insert new key)
- [ ] `convex/leads.ts` — Add `leadCounts` aggregate hook on other lead status transitions (NEED_INFO, DUPLICATE, POTENTIAL_DUPLICATE → SUBMITTED, etc.)
- [ ] `convex/visits.ts` — Add `visitCounts` aggregate hook on all visit status transitions (remove old key, insert new key)
- [ ] `convex/payouts.ts` — Add `payoutTotals` aggregate hook on payout creation and all status transitions
- [ ] `convex/analytics.ts` — Create module with `analytics.backfillAggregates` `internalMutation`

### Acceptance Criteria

1. `leadCounts` tracks lead counts by `(society_id, status)` in real-time after every lead creation and status transition.
2. `visitCounts` tracks visit counts by `(assigned_guard_id, status)` in real-time after every visit status transition.
3. `payoutTotals` tracks payout amount sums by `(status)` in real-time after every payout creation and status transition.
4. `backfillAggregates` populates all 3 aggregates from existing data and is idempotent (safe to run multiple times).
5. Existing mutations still work correctly — aggregate hooks do not alter the return value or throw on success paths.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual check: run `lsp_diagnostics` on `convex/leads.ts`, `convex/verifications.ts`, `convex/visits.ts`, `convex/payouts.ts`, and `convex/analytics.ts`. Verify no existing mutation return types or logic are altered.

### Out of Scope

- Analytics query functions (T02–T04), cron job (T05), admin dashboard UI (P12-E02).

---

## T02: Overview KPIs + Lead Funnel + Trend Queries

### Objective

Implement the overview analytics queries: KPI computation, lead funnel pipeline stage counts, and daily lead trend data with snapshot-backed historical fallback.

### Required Reading

- `notes/features/10-analytics.md` — "Overview Dashboard" section (7 KPIs, funnel stages, trend chart)
- `notes/13-constants-reference.md` — Lead Status enum, Payout Status enum, Guard/User Status enum, analytics permissions (`analytics.view`, `payouts.view`)
- `notes/10-convex-schema.md` — `analytics_snapshots` table definition, `by_date` and `by_type_and_date` indexes

### Key Rules

1. Create all queries in `convex/analytics.ts`. Import `query` from `./functions`.
2. `analytics.getOverviewKPIs({ time_window: v.union(v.literal("last_7_days"), v.literal("last_30_days"), v.literal("last_90_days"), v.literal("all_time")) })`:
   - **Total Leads**: COUNT leads (use `leadCounts` aggregate for all-time; use index query with `_creationTime` filter for time-windowed).
   - **Verified Rate**: `verified_count / submitted_count × 100` for the selected window. Return `null` if no leads (not NaN).
   - **Active Guards**: COUNT `users` WHERE `user_type = "GUARD"` AND `status = "ACTIVE"`.
   - **Active Societies**: COUNT `societies` WHERE `status = "ACTIVE"`.
   - **Pending Payouts**: SUM payout amounts WHERE `status != "PAID"` (use `payoutTotals` aggregate for INITIATED + APPROVED buckets).
   - **Total Paid Out**: SUM payout amounts WHERE `status = "PAID"` (use `payoutTotals` aggregate for PAID bucket).
   - **Conversion Rate**: `closures_confirmed / verified_leads × 100`. Return `null` if no verified leads.
3. `analytics.getLeadFunnel({ society_id: v.optional(v.id("societies")), time_window: v.union(v.literal("last_7_days"), v.literal("last_30_days"), v.literal("last_90_days"), v.literal("all_time")) })`:
   - Pipeline stage counts: SUBMITTED → VERIFIED → (has listing) → (has visit) → CLOSURE (CONFIRMED) → PAID.
   - Each stage returns `{ count: number, drop_off_pct: number | null }` where `drop_off_pct` is the percentage lost from the previous stage. First stage has `drop_off_pct: null`.
   - `society_id` filter: when provided, restrict lead counts to that society using `leads.by_society_and_status` index.
4. `analytics.getLeadTrend({ society_id: v.optional(v.id("societies")), days: v.number() })`:
   - Returns array of `{ date: string, submitted: number, verified: number, closures: number }` for the last `days` calendar days (ISO date strings, e.g., `"2026-02-17"`).
   - For dates older than 30 days: read from `analytics_snapshots` table using `by_type_and_date` index (`snapshot_type: "daily_summary"`). Fall back to live computation if snapshot is missing.
   - For dates within the last 30 days: compute live from leads/closures tables using `_creationTime` filtering.
   - When reading from snapshots, map field names: `data.total_leads_submitted` → `submitted`, `data.verified_count` → `verified`, `data.closure_count` → `closures`.
   - `days` is always a positive number (validator is `v.number()`). For all-time, the frontend passes `365` (1 year cap to prevent unbounded queries). The backend does not accept `0` or `null`.
5. Time window to cutoff timestamp: `last_7_days` = `Date.now() - 7 * 24 * 60 * 60 * 1000`, `last_30_days` = `Date.now() - 30 * 24 * 60 * 60 * 1000`, `last_90_days` = `Date.now() - 90 * 24 * 60 * 60 * 1000`, `all_time` = no filter.
6. RBAC: `requirePermission(ctx, "analytics.view")` on all three queries. Financial amounts (Pending Payouts, Total Paid Out) additionally check for `payouts.view` permission using a non-throwing helper (e.g., `const hasPayoutView = await hasPermission(ctx, "payouts.view")` — create this helper if it doesn't exist, or use a try/catch around `requirePermission`). If caller lacks this permission, return `null` for those fields rather than throwing.
7. Handle "no data" edge cases: return `0` counts, `null` for rate fields (not `NaN`, not `undefined`).
8. For aggregate-backed counts, use the aggregate read API. For time-windowed counts that aggregates cannot handle (aggregates do not filter by `_creationTime`), use index-backed queries with `_creationTime` range filters.
9. For non-super-admin users, restrict results to societies the caller has access to. **⚠️ Prerequisite check**: the executing agent must verify that an admin-to-society mapping exists (e.g., `user_roles` or `role_assignments` table with society scope). If no such mapping exists yet, implement a `getAllowedSocietyIds(ctx)` helper that returns all society IDs for super admins or the scoped set for other admins. If the RBAC system does not yet support society-scoping, document this as a gap and default to showing all data (matching super admin behavior) with a TODO for when scoping is added. Super admins always see all data.

### Deliverables

- [ ] `convex/analytics.ts` — `analytics.getOverviewKPIs` query with 7 KPIs and time window support
- [ ] `convex/analytics.ts` — `analytics.getLeadFunnel` query with pipeline stage counts and drop-off percentages
- [ ] `convex/analytics.ts` — `analytics.getLeadTrend` query with snapshot-backed historical fallback

### Acceptance Criteria

1. `getOverviewKPIs` returns all 7 KPIs with correct formulas for all 4 time windows.
2. Verified Rate and Conversion Rate return `null` (not `NaN`) when denominators are zero.
3. Pending Payouts and Total Paid Out return `null` when caller lacks `payouts.view` permission (no throw).
4. `getLeadFunnel` returns 6 pipeline stages with correct counts and drop-off percentages.
5. `society_id` filter on `getLeadFunnel` correctly restricts to that society's leads.
6. `getLeadTrend` returns one entry per calendar day for the requested range.
7. `getLeadTrend` reads from `analytics_snapshots` for dates older than 30 days.
8. All three queries gated by `analytics.view` permission.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/analytics.ts`. Verify all return types are explicit (no implicit `any`).

### Out of Scope

- Society comparison (T03), guard leaderboard (T03), financial overview (T04), operational metrics (T04), cron job (T05).

---

## T03: Society Comparison + Guard Leaderboard Queries

### Objective

Implement society comparison and guard leaderboard analytics queries. The guard leaderboard is DISTINCT from P11's `guards.getLeaderboard` — it includes financial data (`earned`, `closures`) that P11 does not expose.

### Required Reading

- `notes/features/10-analytics.md` — "Society Analytics" section, "Guard Leaderboard" section
- `notes/10-convex-schema.md` — `societies` table, `guard_profiles` table, `leads` indexes, `visits` indexes, `closures` table, `payouts` table
- `notes/13-constants-reference.md` — analytics permissions (`analytics.view`, `payouts.view`), Guard Status enum
- P11-E01 Completion Summary — `computeMetrics(ctx, guard_user_id, cutoffTimestamp?)` helper location and signature

### Key Rules

1. `analytics.getSocietyComparison({ time_window: v.union(v.literal("last_7_days"), v.literal("last_30_days"), v.literal("last_90_days"), v.literal("all_time")) })`:
   - Returns array: `{ society_id, society_name, city, guard_count, leads_count, verified_rate: number | null, closures_count, avg_days_to_closure: number | null }`.
   - Sorted by `leads_count` descending.
   - `guard_count`: COUNT `guard_profiles` WHERE `society_id` matches, joined with `users` to filter `status = "ACTIVE"` (excludes INACTIVE and BANNED guards).
   - `leads_count`: COUNT leads for that society in the time window using `leads.by_society_and_status` index.
   - `verified_rate`: `verified_count / leads_count × 100`. Return `null` if `leads_count === 0`.
   - `avg_days_to_closure`: average of `(closure._creationTime - lead._creationTime) / (1000 * 60 * 60 * 24)` for CONFIRMED closures in the time window. Return `null` if no closures.
   - Societies with 0 leads return `null` for rate and average fields.
2. `analytics.getGuardLeaderboard({ society_id: v.optional(v.id("societies")), metric: v.union(v.literal("leads"), v.literal("verified"), v.literal("verified_rate"), v.literal("visits"), v.literal("closures"), v.literal("earned")), time_window: v.union(v.literal("last_7_days"), v.literal("last_30_days"), v.literal("last_90_days"), v.literal("all_time")), limit: v.number() })`:
   - Returns array: `{ rank: number, guard_user_id, guard_name, society_name, leads: number, verified: number, verified_rate: number | null, visits: number, closures: number, earned: number | null }`.
   - Sorted by the selected `metric` descending. `rank` is 1-indexed.
   - `earned`: SUM of PAID payout amounts for that guard. Requires `payouts.view` permission check. If caller lacks this permission, return `null` for `earned` on all rows (do not throw).
   - Guards with `total_submitted < 5`: return `null` for `verified_rate` (matches P11 "Insufficient data" convention). Include them in count-based metrics (`leads`, `verified`, `visits`, `closures`).
   - `society_id` filter: when provided, restrict to guards whose `guard_profiles.society_id` matches.
   - `limit` caps the result array length. Validate it is a positive integer.
   - Reuse `computeMetrics` from P11 for lead/visit metric computation where applicable. Compute `closures` and `earned` separately (P11 does not have these).
3. RBAC: `requirePermission(ctx, "analytics.view")` on both queries. `earned` field additionally checks for `payouts.view` permission using a non-throwing helper (e.g., `const hasPayoutView = await hasPermission(ctx, "payouts.view")` — create this helper if it doesn't exist, or use a try/catch around `requirePermission`). Return `null` for that field if missing, do not throw.
4. This leaderboard is SEPARATE from P11's `guards.getLeaderboard`. Do NOT modify P11's function. P12 creates a new `analytics.getGuardLeaderboard` in `convex/analytics.ts`.
5. For non-super-admin users, restrict results to societies the caller has access to (use `getAllowedSocietyIds(ctx)` helper from T02). Super admins see all data.

### Deliverables

- [ ] `convex/analytics.ts` — `analytics.getSocietyComparison` query with per-society metrics and time window support
- [ ] `convex/analytics.ts` — `analytics.getGuardLeaderboard` query with financial data, society filter, metric sort, and limit

### Acceptance Criteria

1. `getSocietyComparison` returns all active societies sorted by `leads_count` descending.
2. `verified_rate` and `avg_days_to_closure` return `null` (not `NaN`) when denominators are zero.
3. `getGuardLeaderboard` returns ranked guards sorted by the selected metric descending.
4. `society_id` filter correctly restricts to guards in that society.
5. Guards with `total_submitted < 5` have `verified_rate: null`.
6. `earned` returns `null` for all rows when caller lacks `payouts.view` permission (no throw).
7. `limit` caps the result array length.
8. Both queries gated by `analytics.view` permission.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/analytics.ts`. Confirm `analytics.getGuardLeaderboard` is a new function and P11's `guards.getLeaderboard` is unchanged.

### Out of Scope

- Financial overview (T04), operational metrics (T04), cron job (T05), admin dashboard UI (P12-E02).

---

## T04: Financial Overview + Operational Metrics Queries

### Objective

Implement financial overview and operational metrics analytics queries, using aggregate-backed totals for all-time data and index-backed queries for time-windowed data.

### Required Reading

- `notes/features/10-analytics.md` — "Financial Overview" section, "Operational Metrics" section
- `notes/10-convex-schema.md` — `payouts` table, `closures` table, `audit_logs` table (`by_entity` index), `analytics_snapshots` table
- `notes/13-constants-reference.md` — Payout Status enum (`INITIATED`, `APPROVED`, `PAID`), Closure Status enum (`PENDING`, `CONFIRMED`, `CANCELLED`), analytics permissions

### Key Rules

1. `analytics.getFinancialOverview({ time_window: v.union(v.literal("last_7_days"), v.literal("last_30_days"), v.literal("last_90_days"), v.literal("all_time")) })`:
   - **Total Brokerage Collected**: SUM of `(closure.brokerage_tenant_side + closure.brokerage_owner_side)` for CONFIRMED closures in the time window.
   - **Total Guard Payouts**: SUM payout amounts WHERE `status = "PAID"`. Use `payoutTotals` aggregate for all-time; use index query with `_creationTime` filter for time-windowed.
   - **Total Commission Earned**: This is equivalent to Total Brokerage Collected — the platform's commission IS the brokerage. Display both labels in the UI (Total Brokerage = Total Commission) but compute only once.
   - **Net Revenue**: Total Brokerage Collected minus Total Guard Payouts.
   - **Average Payout per Closure**: Total Guard Payouts / CONFIRMED closures count. Return `null` if no closures.
   - **Average Days Verified to Closure**: average of `(closure._creationTime - lead_verification_timestamp) / (1000 * 60 * 60 * 24)` where `lead_verification_timestamp` is obtained from `audit_logs` using `by_entity` index — find the `LEADS_UPDATE` entry where the status transitioned to `VERIFIED`. Return `null` if no closures.
   - **Payout Status Breakdown**: `{ INITIATED: { count: number, total_paise: number }, APPROVED: { count: number, total_paise: number }, PAID: { count: number, total_paise: number }, VOIDED: { count: number, total_paise: number } }`. Use `payoutTotals` aggregate for all-time totals; use index queries for time-windowed.
   - **Monthly Trend**: array of `{ month: string, brokerage_paise: number, payouts_paise: number }` for the last 12 calendar months (month as `"YYYY-MM"` string). Computed from closures and payouts tables grouped by month.
   - All money values are in paise (integer). Display conversion happens frontend-side.
2. `analytics.getOperationalMetrics({ society_id: v.optional(v.id("societies")), time_window: v.union(v.literal("last_7_days"), v.literal("last_30_days"), v.literal("last_90_days"), v.literal("all_time")) })`:
   - **Avg time Submitted → Verified**: average days from lead `_creationTime` to the `audit_logs` entry where `action = "LEADS_UPDATE"` and the new status is `"VERIFIED"`. Use `audit_logs.by_entity` index to find transition timestamps.
   - **Avg time Verified → Listing**: average days from lead verification timestamp to linked listing `_creationTime`.
   - **Avg time Listing → First Visit**: average days from listing `_creationTime` to the first visit `_creationTime` for that listing.
   - **Avg time Verified → Closure**: average days from lead verification timestamp to closure `_creationTime` for CONFIRMED closures.
   - **NEED_INFO rate**: `leads_entering_NEED_INFO / total_submitted × 100`. Return `null` if no leads.
   - **Duplicate rate**: `leads_flagged_DUPLICATE / total_submitted × 100`. Return `null` if no leads.
   - **Visit No-Show rate**: `NO_SHOW_visits / total_visits × 100`. Return `null` if no visits.
   - Each metric includes a `trend` field: `"up" | "down" | "flat" | null`. Computed by comparing the current period value to the previous period of the same length. Return `null` if insufficient data for comparison.
   - `society_id` filter: when provided, restrict lead and visit counts to that society.
3. Operational timing metrics are expensive. For historical data (beyond 30 days), prefer reading from `analytics_snapshots` if a matching snapshot exists. Fall back to live computation from `audit_logs` for recent data.
4. RBAC: `requirePermission(ctx, "analytics.view")` on both queries. Financial amounts additionally check for `payouts.view` permission using a non-throwing helper (e.g., `const hasPayoutView = await hasPermission(ctx, "payouts.view")` — create this helper if it doesn't exist, or use a try/catch around `requirePermission`). Return `null` for financial fields if missing, do not throw.
5. Money is always in paise (integer). Never divide paise values to produce floats — keep as integers throughout.
6. For non-super-admin users, restrict results to societies the caller has access to (use `getAllowedSocietyIds(ctx)` helper from T02). Super admins see all data.

### Deliverables

- [ ] `convex/analytics.ts` — `analytics.getFinancialOverview` query with payout breakdown, monthly trend, and time window support
- [ ] `convex/analytics.ts` — `analytics.getOperationalMetrics` query with pipeline timing, rate metrics, and trend indicators

### Acceptance Criteria

1. `getFinancialOverview` returns all financial fields with correct formulas for all 4 time windows.
2. `payoutTotals` aggregate is used for all-time payout sums; index queries used for time-windowed sums.
3. Monthly trend returns exactly 12 entries (one per calendar month), with `0` for months with no data.
4. `getOperationalMetrics` returns all 7 metrics with correct formulas.
5. Trend indicators (`"up"`, `"down"`, `"flat"`, `null`) are computed by comparing current vs. previous period.
6. `society_id` filter correctly restricts lead and visit counts.
7. Financial fields return `null` (not throw) when caller lacks `payouts.view` permission.
8. All money values are in paise (integer) throughout — no float division.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/analytics.ts`. Verify no implicit `any` on return types and all paise values remain integers.

### Out of Scope

- Cron job (T05), admin dashboard UI (P12-E02), CSV export (V2).

---

## T05: Daily Snapshot Cron Job

### Objective

Implement the `analytics.computeDailySnapshot` `internalMutation` that pre-computes expensive metrics for the previous day and stores them in `analytics_snapshots`, then register it in `convex/crons.ts`.

### Required Reading

- `notes/features/10-analytics.md` — "Cron Jobs for Pre-Computed Analytics" section
- `notes/10-convex-schema.md` — `analytics_snapshots` table definition (`snapshot_date`, `snapshot_type`, `data`), `by_date` and `by_type_and_date` indexes, cron configuration
- `notes/11-convex-architecture.md` — "Cron Jobs" section (cron registration pattern, `internal` import)

### Key Rules

1. Create `analytics.computeDailySnapshot` as `internalMutation` in `convex/analytics.ts`. Import `internalMutation` from `./functions` (audit-enabled path).
2. Computes a `"daily_summary"` snapshot for the previous calendar day in IST (UTC+5:30). "Yesterday IST" = the calendar day that ended at the most recent midnight IST.
3. `"daily_summary"` snapshot `data` object contains: `{ total_leads_submitted, verified_count, rejected_count, closure_count, total_payout_paise, active_guards, active_societies }`. All counts are for the previous IST calendar day only (not cumulative).
4. Also compute one `"society_stats"` snapshot per active society for the previous day: `{ society_id, leads_submitted, verified_count, closures_count }`. Store each as a separate `analytics_snapshots` row with `snapshot_type: "society_stats"` and `snapshot_date` matching the previous IST day.
5. Idempotent: For `"daily_summary"` snapshots: check `analytics_snapshots` using `by_type_and_date` index for existing row with same `snapshot_type` and `snapshot_date`. If found, overwrite via `ctx.db.patch`; if not found, insert a new row. For `"society_stats"` snapshots: query by `by_type_and_date` index with `snapshot_type: "society_stats"` and `snapshot_date`, then filter the results in-memory by `data.society_id` to find the matching row. The `society_id` is stored INSIDE the `data` object (not as a top-level field) — the existing schema does not need modification.
6. Register the cron in `convex/crons.ts`: `crons.daily("daily-analytics-snapshot", { hourUTC: 19, minuteUTC: 0 }, internal.analytics.computeDailySnapshot)`. Note: 19:00 UTC = 00:30 IST the following day — this fires shortly after IST midnight, ensuring the previous IST day is complete before snapshotting.
   **Note**: The feature spec (`notes/features/10-analytics.md`) uses `{ hourUTC: 0, minuteUTC: 30 }` in its example. The schema doc (`notes/10-convex-schema.md`) defines `{ hourUTC: 19, minuteUTC: 0 }`. Schema is the source of truth — use `{ hourUTC: 19, minuteUTC: 0 }`.
7. If `convex/crons.ts` already has a `"daily-analytics-snapshot"` entry (from schema scaffolding), verify and update it rather than adding a duplicate.
8. `analytics.getLeadTrend` from T02 reads from these `"daily_summary"` snapshots for dates older than 30 days. The `data` field MUST include at minimum: `{ total_leads_submitted: number, verified_count: number, closure_count: number, total_payout_paise: number, active_guards: number, active_societies: number }`. T02's `getLeadTrend` reads `total_leads_submitted` as `submitted`, `verified_count` as `verified`, and `closure_count` as `closures` — the mapping happens in T02's query code.
9. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/analytics.ts` — `analytics.computeDailySnapshot` `internalMutation` with `"daily_summary"` and per-society `"society_stats"` snapshots, idempotent upsert logic
- [ ] `convex/crons.ts` — Register (or verify) `"daily-analytics-snapshot"` cron firing at `{ hourUTC: 19, minuteUTC: 0 }` calling `internal.analytics.computeDailySnapshot`

### Acceptance Criteria

1. `computeDailySnapshot` computes the previous IST calendar day correctly (not UTC day).
2. `"daily_summary"` snapshot contains all required fields with correct counts for the previous day only.
3. One `"society_stats"` snapshot row is created per active society for the previous day.
4. Running `computeDailySnapshot` twice for the same day overwrites the existing snapshot (idempotent).
5. Cron is registered in `convex/crons.ts` at `{ hourUTC: 19, minuteUTC: 0 }` with no duplicate entries.
6. `analytics.getLeadTrend` (T02) can read the `data` field from `"daily_summary"` snapshots without type errors.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/analytics.ts` and `convex/crons.ts`. Verify the cron registration compiles and `internal.analytics.computeDailySnapshot` resolves correctly.

### Out of Scope

- Admin dashboard UI (P12-E02), chart library integration, CSV export (V2).

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-18

### What Was Built

1. **3 aggregate instances** wired via trigger-based approach in `convex/functions.ts`:
   - `leadCounts` — namespace `${society_id}|${status}`, sortKey `_creationTime`
   - `visitCounts` — namespace `${assigned_guard_id}|${status}`, sortKey `_creationTime`
   - `payoutTotals` — namespace `status`, sortKey `_creationTime`, sumValue `amount_paise`
   - All registered as `.trigger()` on the existing `Triggers` instance — fires automatically on all writes via `customMutation(rawMutation, customCtx(triggers.wrapDB))`. No individual mutation files modified.

2. **9 exported functions** in `convex/analytics.ts` (1847 lines):
   - `backfillAggregates` — internalMutation, clears + re-inserts all aggregates (idempotent)
   - `getOverviewKPIs` — 7 KPIs with time_window support (Total Leads, Verified Rate, Active Guards, Active Societies, Pending Payouts, Total Paid Out, Conversion Rate)
   - `getLeadFunnel` — 6 pipeline stages with drop-off percentages, optional society_id filter
   - `getLeadTrend` — daily counts with snapshot-backed historical fallback (>30 days)
   - `getSocietyComparison` — per-society metrics sorted by leads_count desc
   - `getGuardLeaderboard` — ranked guards with financial data (DISTINCT from P11), metric sort, society filter, limit
   - `getFinancialOverview` — brokerage, payouts, net revenue, payout status breakdown, 12-month trend
   - `getOperationalMetrics` — 7 metrics (4 timing + 3 rates) with trend indicators
   - `computeDailySnapshot` — internalMutation computing daily_summary + per-society society_stats snapshots for previous IST day

3. **Cron job** in `convex/crons.ts`: `daily-analytics-snapshot` at `{ hourUTC: 19, minuteUTC: 0 }` → `internal.analytics.computeDailySnapshot`

### Key File Locations

- `convex/functions.ts` — Aggregate instances (`leadCounts`, `visitCounts`, `payoutTotals`) and trigger registrations (lines 16-52)
- `convex/analytics.ts` — All 9 analytics functions (1847 lines)
- `convex/crons.ts` — Cron registration (13 lines)

### Deviations from Spec

1. **Trigger-based aggregate wiring instead of per-mutation hooks**: The spec called for manually adding aggregate hooks inside each mutation file (`leads.ts`, `verification.ts`, `visits.ts`, `payouts.ts`). Instead, we used the `Triggers` pattern from `convex-helpers/server/triggers` — registering `leadCounts.trigger()`, `visitCounts.trigger()`, and `payoutTotals.trigger()` on the existing `triggers` instance in `convex/functions.ts`. This is the officially recommended pattern from `@convex-dev/aggregate` docs and fires automatically on ALL writes through `customMutation`. No individual mutation files were modified.

2. **Aggregate namespace uses pipe-separated string** (`${society_id}|${status}`) instead of object keys. This matches how `TableAggregate` namespace parameter works — it requires a string or number, not an object.

3. **Society scoping**: `getAllowedSocietyIds(ctx)` returns `null` for all admins (super admin behavior) with a TODO comment for when RBAC society-scoping is added. The current RBAC system does not yet support per-society scoping.

### Gotchas for Next Epic

1. **API return shapes**: All query functions return typed objects. The frontend should use `useQuery(api.analytics.getOverviewKPIs, { time_window })` etc. Financial fields (`pending_payouts_paise`, `total_paid_out_paise`, `earned`) return `null` when caller lacks `payouts.view` — frontend must handle null display.
2. **Time window to days mapping** for `getLeadTrend`: 7 Days → `7`, 30 Days → `30`, 90 Days → `90`, All Time → `365`.
3. **Money values**: All amounts are in paise. Frontend must convert via `paiseToRupees()` and format via `formatINR()` from `lib/money.ts`.
4. **Trend indicators** from `getOperationalMetrics`: each metric has a `trend` field of type `"up" | "down" | "flat" | null`. Frontend maps: `"down"` = green (improving), `"up"` = red (worsening), `"flat"` = grey, `null` = no data.
5. **Guard leaderboard `verified_rate`**: Returns `null` for guards with < 5 submissions (insufficient data). Frontend shows "—".
6. **Payout status values are lowercase**: `"pending"`, `"approved"`, `"disbursed"`, `"failed"`, `"voided"` — but the financial overview returns breakdown keyed by these lowercase values.
