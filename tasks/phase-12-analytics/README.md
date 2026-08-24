# Phase 12: Analytics & Reporting (P12)

## Overview

The analytics dashboard gives admins real-time visibility into platform health across five dimensions: overview KPIs, society comparison, guard leaderboard, financial overview, and operational metrics. Three `@convex-dev/aggregate` component instances (`leadCounts`, `visitCounts`, `payoutTotals`) — already registered in `convex/convex.config.ts` — are wired into existing domain mutations for real-time counter maintenance. Seven analytics queries in a new `convex/analytics.ts` module cover overview KPIs (7 metrics with 4 time windows), lead funnel pipeline (6 stages with drop-off percentages), daily lead trend (with snapshot-backed historical fallback), society comparison (per-society metrics sorted by lead volume), guard leaderboard (with financial data — DISTINCT from P11's `guards.getLeaderboard` which lacks `earned`/`closures`), financial overview (brokerage, payouts, net revenue, monthly trend), and operational metrics (pipeline timing averages and rate metrics with trend indicators). A daily cron job at 19:00 UTC (00:30 IST) pre-computes expensive metrics and stores them in `analytics_snapshots` for historical queries beyond 30 days. The admin dashboard at `/admin/analytics` (a dedicated analytics page, separate from the existing `/admin/dashboard` overview page) uses a 5-tab layout (Overview, Societies, Guards, Financial, Operational) with Recharts for all charts, URL-synced tab state, and a shared time window selector. All queries are gated by `analytics.view` permission; financial data additionally requires `payouts.view` — returning `null` (not throwing) when the caller lacks it. Non-super-admin users only see data for societies they have access to via their role assignments. Analytics is admin-only; no guard-facing component exists.

**Note**: The feature spec (`notes/features/10-analytics.md`) defines KPI-specific default timeframes (e.g., Verified Rate = last 30 days, Total Paid Out = all-time). P12 simplifies this with a single shared time window selector that applies to all KPIs uniformly. This is an intentional UX simplification — the shared selector lets admins compare all metrics for the same period. KPI-specific defaults from the feature spec apply only when the selector is at its default value (30 Days).

## Dependencies

| Dependency                               | What It Provides for P12                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P01-E02 (Schema & Infra)**             | `convex/functions.ts` audit trigger wrapper. `analytics_snapshots` table in schema with `by_date` and `by_type_and_date` indexes. Aggregate components (`leadCounts`, `visitCounts`, `payoutTotals`) registered in `convex/convex.config.ts` but NOT yet wired to mutations. **⚠️ Drift risk**: executing agent must verify all 3 aggregate registrations exist in `convex/convex.config.ts` before wiring hooks. |
| **P04-E01 (Lead Submission Backend)**    | Leads exist with indexes: `leads.by_guard_and_status` (`["submitted_by_guard_id", "status"]`), `leads.by_society_and_status` (`["society_id", "status"]`), `leads.by_submitted_by_guard_id` (`["submitted_by_guard_id"]`). Lead creation mutation is in `convex/leads.ts`.                                                                                                                                        |
| **P05-E01 (Owner Verification Backend)** | Lead status transitions (SUBMITTED → VERIFIED/REJECTED) happen in `convex/verifications.ts`. These are hook points for `leadCounts` aggregate updates.                                                                                                                                                                                                                                                            |
| **P07-E01 (Visit Scheduling Backend)**   | Visits exist with `visits.by_guard_and_status` index (`["assigned_guard_id", "status"]`). Visit status transitions happen in `convex/visits.ts`.                                                                                                                                                                                                                                                                  |
| **P08-E01 (Closure Backend)**            | Closures exist. Closure confirmation transitions (PENDING → CONFIRMED) in `convex/closures.ts`. Closure brokerage fields (`brokerage_tenant_side`, `brokerage_owner_side`) used for financial overview.                                                                                                                                                                                                           |
| **P09-E01 (Payout Backend)**             | Payouts exist with status transitions (INITIATED → APPROVED → PAID) in `convex/payouts.ts`. Payout amounts stored in paise. Used for `payoutTotals` aggregate and financial overview.                                                                                                                                                                                                                             |
| **P11-E01 (Quality Metrics Backend)**    | `computeMetrics(ctx, guard_user_id, cutoffTimestamp?)` helper exists. P12's `analytics.getGuardLeaderboard` MAY reuse this for lead/visit metric computation but adds `earned` (payout totals) and `closures` count that P11 does not expose.                                                                                                                                                                     |
| **P01-E08 (Seed & Config)**              | `system_config` table exists. Settings page at `/admin/settings` exists. No new config keys needed for P12.                                                                                                                                                                                                                                                                                                       |
| **P04-E03 (Admin Lead Queue UI)**        | Admin table + filter + detail panel patterns reused for society comparison table and guard leaderboard table. URL-synced filters, paginated data table, status actions.                                                                                                                                                                                                                                           |

## Key Documentation

| Doc                                 | Section                                                                     | Why You Need It                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/features/10-analytics.md`    | Full feature spec                                                           | THE feature spec — dashboard sections (overview, society, guard, financial, operational), KPIs, funnel, trend chart, aggregate usage, cron job, snapshot format, RBAC, edge cases                                             |
| `notes/10-convex-schema.md`         | `analytics_snapshots` table, Component Registration (aggregates), Cron Jobs | Exact validators for `analytics_snapshots` (`snapshot_date`, `snapshot_type`, `data`), indexes (`by_date`, `by_type_and_date`), 3 aggregate registrations, cron schedule                                                      |
| `notes/11-convex-architecture.md`   | Component Registration, Cron Jobs                                           | Function layer patterns (`mutation`/`query` from `./functions`), cron registration (`crons.daily`), `internal` import for cron targets. Aggregate component names are registered here; for usage API, see `convex-api` skill. |
| `notes/13-constants-reference.md`   | `analytics.view` permission, `payouts.view` permission, Ops Agent role      | RBAC: `analytics.view` required for all queries, `payouts.view` additionally required for financial data. Ops Agent has both `analytics.view` and `payouts.view`.                                                             |
| `notes/06-admin-panel-ux.md`        | Dashboard wireframe, sidebar nav                                            | Admin sidebar navigation placement and existing page layout patterns. The 5-tab analytics wireframe is in `notes/features/10-analytics.md`.                                                                                   |
| `notes/03-roles-and-permissions.md` | Analytics permissions, Ops Agent role                                       | RBAC matrix: Super Admin has all permissions. Ops Agent has both `analytics.view` and `payouts.view`.                                                                                                                         |
| `notes/02-data-models.md`           | Analytics Snapshot entity                                                   | Entity fields, relationships, snapshot types                                                                                                                                                                                  |
| `notes/04-state-machines.md`        | Lead, Visit, Closure, Payout status sections                                | Status values used in aggregate namespace keys and funnel stage counts                                                                                                                                                        |
| Previous phase pattern references   | P10/P11 epic files                                                          | Backend epic and admin UI epic structural patterns                                                                                                                                                                            |

## Epics

| ID      | Title                                                             | Tasks | Status | Depends On                                                               |
| ------- | ----------------------------------------------------------------- | ----- | ------ | ------------------------------------------------------------------------ |
| P12-E01 | [Analytics Backend](P12-E01-analytics-backend.md)                 | 5     | done   | [P01-E02, P04-E01, P05-E01, P07-E01, P08-E01, P09-E01, P11-E01, P01-E08] |
| P12-E02 | [Admin Analytics Dashboard](P12-E02-admin-analytics-dashboard.md) | 5     | done   | [P12-E01, P04-E03]                                                       |

## Dependency Graph

```
P01-E02 ──┐
P04-E01 ──┤
P05-E01 ──┤
P07-E01 ──┼──► P12-E01 ──► P12-E02
P08-E01 ──┤                    ▲
P09-E01 ──┤                P04-E03 ─┘
P11-E01 ──┤
P01-E08 ──┘
```

**Sequential note**: E02 (Admin Analytics Dashboard) depends on E01 completing all 7 backend queries first. E02 also depends on P04-E03 for existing admin table/filter UI patterns. No guard-facing epic exists — analytics is admin-only.

## Execution Order

1. **P12-E01**: Analytics Backend — aggregate wiring + backfill, 7 analytics queries (overview KPIs, lead funnel, lead trend, society comparison, guard leaderboard, financial overview, operational metrics), daily snapshot cron job
2. **P12-E02**: Admin Analytics Dashboard — Recharts install, 5-tab page shell with URL-synced tabs, overview tab (KPI cards + funnel + trend), society tab (comparison table + drill-down), guard leaderboard tab (sortable + filters), financial tab (metric cards + payout breakdown + monthly chart), operational tab (timing cards + trend indicators)

## Completion Criteria

### Backend

- [x] `convex/analytics.ts` exists with all queries, `internalMutation` for backfill, and `internalMutation` for daily snapshot
- [x] 3 aggregate instances wired: `leadCounts` (namespace `{ society_id, status }`, count), `visitCounts` (namespace `{ assigned_guard_id, status }`, count), `payoutTotals` (namespace `{ status }`, sum = amount in paise)
- [x] Aggregate hooks added AFTER existing `ctx.db.insert`/`ctx.db.patch` calls in `convex/leads.ts`, `convex/verifications.ts`, `convex/visits.ts`, `convex/payouts.ts` — existing logic not disrupted
- [x] `analytics.backfillAggregates` — `internalMutation`, idempotent, populates all 3 aggregates from historical data
- [x] `analytics.getOverviewKPIs({ time_window })` — 7 KPIs (Total Leads, Verified Rate, Active Guards, Active Societies, Pending Payouts, Total Paid Out, Conversion Rate). Rates return `null` (not `NaN`) when denominators are zero. Financial fields return `null` when caller lacks `payouts.view`.
- [x] `analytics.getLeadFunnel({ society_id?, time_window })` — 6 pipeline stages (SUBMITTED → VERIFIED → LISTING → VISIT → CLOSURE → PAID) with absolute counts and drop-off percentages
- [x] `analytics.getLeadTrend({ society_id?, days })` — daily counts for submitted, verified, closures. Reads from `analytics_snapshots` for dates older than 30 days.
- [x] `analytics.getSocietyComparison({ time_window })` — per-society metrics sorted by `leads_count` descending. `verified_rate` and `avg_days_to_closure` return `null` when no data.
- [x] `analytics.getGuardLeaderboard({ society_id?, metric, time_window, limit })` — DISTINCT from P11's `guards.getLeaderboard`: includes `earned` (payout totals) and `closures` count. `earned` returns `null` when caller lacks `payouts.view`. Guards with `total_submitted < 5` have `verified_rate: null`.
- [x] `analytics.getFinancialOverview({ time_window })` — Total Brokerage, Total Payouts, Net Revenue, Avg Payout per Closure, Avg Days Verified to Closure, Payout Status Breakdown (4 statuses: INITIATED, APPROVED, PAID, VOIDED), Monthly Trend (12 months). All money in paise.
- [x] `analytics.getOperationalMetrics({ society_id?, time_window })` — 7 metrics (4 pipeline timing averages + 3 rates) with trend indicators (`"up"`, `"down"`, `"flat"`, `null`).
- [x] `analytics.computeDailySnapshot` — `internalMutation`, computes `"daily_summary"` + per-society `"society_stats"` snapshots for the previous IST calendar day. Idempotent (upsert via `by_type_and_date` index).
- [x] Cron registered in `convex/crons.ts`: `"daily-analytics-snapshot"` at `{ hourUTC: 19, minuteUTC: 0 }` → `internal.analytics.computeDailySnapshot`
- [x] All queries gated by `requirePermission(ctx, "analytics.view")`. Financial fields additionally check `payouts.view` — return `null` (not throw) if missing.
- [x] All queries respect society-scoping RBAC: non-super-admin users only see data for societies they have access to. Super admins see all data.
- [x] All queries use `query` from `./functions` (audit-enabled path). `backfillAggregates` and `computeDailySnapshot` use `internalMutation` from `./functions`.
- [x] Time window to cutoff: `last_7_days` = now - 7d, `last_30_days` = now - 30d, `last_90_days` = now - 90d, `all_time` = no filter.

### Admin UI

- [x] Recharts installed as a dependency
- [x] "Analytics" nav item in admin sidebar with `BarChart3` icon, gated by `analytics.view`, positioned after Incentives
- [x] `/admin/analytics` page with 5-tab layout: Overview (default), Societies, Guards, Financial, Operational. Tab selection synced to URL query param `?tab=...`.
- [x] Shared time window selector (7 Days / 30 Days / 90 Days / All Time, default: 30 Days) at page level, passed to all tabs.
- [x] Overview tab: 7 KPI cards (responsive grid: 4/row desktop, 2/tablet, 1/mobile), lead funnel horizontal bar chart (6 stages with drop-off %), trend line chart (3 lines: submitted, verified, closures)
- [x] Societies tab: sortable comparison table (7 columns), society drill-down panel (trend chart, building breakdown, top 5 guards)
- [x] Guards tab: sortable leaderboard table (9 columns), society filter dropdown, metric sort by column click, limit selector (10/20/50). "Earned" shows "—" when user lacks `payouts.view`. Rate shows "—" for guards with < 5 submissions.
- [x] Financial tab: 6 metric cards, payout status breakdown (4 color-coded cards: INITIATED amber, APPROVED blue, PAID green, VOIDED grey), monthly trend bar chart (revenue green, payouts red). Tab content replaced with permission message when user lacks `payouts.view` (tab itself visible).
- [x] Operational tab: 7 metric cards in 2-column grid, trend indicator icons (TrendingDown green, Minus grey, TrendingUp red), optional society filter. `null` metrics show "No data".
- [x] All money values formatted with `formatINR()` from `lib/money.ts` (paise → rupees → Indian numbering).
- [x] `react-hook-form` + `zod` for filter forms where applicable, `sonner` for toasts.

### Cross-Cutting

- [x] `npx tsc --noEmit` passes
- [x] `npm run build` passes
- [x] All status changes create `audit_logs` entries automatically via triggers
- [x] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
convex/
  analytics.ts                                    # New: All analytics queries + backfillAggregates + computeDailySnapshot
  leads.ts                                        # Modified: Add leadCounts aggregate hook on lead creation
  verification.ts                                 # Modified: Add leadCounts aggregate hook on lead status transitions
  visits.ts                                       # Modified: Add visitCounts aggregate hook on visit status transitions
  payouts.ts                                      # Modified: Add payoutTotals aggregate hook on payout creation/transitions
  crons.ts                                        # Modified: Register daily-analytics-snapshot cron

src/app/
  (admin)/admin/analytics/
    page.tsx                                      # Analytics dashboard page (5 tabs, URL-synced)
    components/
      overview-tab.tsx                            # Overview tab: KPI grid + funnel + trend
      kpi-card.tsx                                # Reusable KPI card (icon, label, value, trend arrow)
      lead-funnel-chart.tsx                       # Horizontal bar funnel chart (Recharts)
      trend-line-chart.tsx                        # Multi-line trend chart (Recharts)
      society-tab.tsx                             # Society comparison table + drill-down panel
      guard-leaderboard-tab.tsx                   # Guard leaderboard table with filters
      financial-tab.tsx                           # Financial metric cards + payout breakdown + monthly chart
      operational-tab.tsx                         # Operational metrics grid with trend indicators

  (admin)/admin-layout-client.tsx                 # Modified: Add Analytics nav item
```

## Scope Boundaries

### IN This Phase

- 3 aggregate component instances wired to existing mutations (leadCounts, visitCounts, payoutTotals)
- One-time backfill internalMutation for historical aggregate data
- 7 analytics queries covering all 5 dashboard sections
- Daily snapshot cron job (19:00 UTC = 00:30 IST) with idempotent upsert
- Admin analytics dashboard at `/admin/analytics` with 5 tabs
- Recharts integration for all charts (funnel, trend, monthly)
- Time window support (7d / 30d / 90d / all-time) across all queries and UI
- Society drill-down panel with trend chart and top guards
- Guard leaderboard with financial data (DISTINCT from P11's leaderboard)
- Financial overview with payout breakdown and monthly trend
- Operational metrics with pipeline timing and trend indicators
- Permission gating: `analytics.view` for all data, `payouts.view` for financial fields

### NOT In This Phase

- Export to CSV/Excel → **V2**
- Guard-facing analytics → **Not in V1** (analytics is admin-only)
- Vacancy heatmap by building → **V2** (mentioned in feature spec as future enhancement)
- Guard Performance Detail drill-down (pie charts, response time) → **V2** (P11's Quality tab covers per-guard metrics)
- Real-time WebSocket push for dashboard updates → **Not needed** (Convex reactive queries handle this natively)
- i18n for analytics dashboard → **English only** (admin panel is hardcoded English per convention)
