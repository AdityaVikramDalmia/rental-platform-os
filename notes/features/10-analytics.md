# Feature: Analytics & Reporting

> **Priority**: #12 in implementation order
> **Personas**: Admin/OPS (with `analytics.view` permission)
> **Dependencies**: All other features (analytics consumes data from everywhere)

## Purpose

Detailed analytics dashboards give DemoRentals leadership visibility into platform health: lead flow, guard performance, society productivity, conversion funnels, and financial tracking. This drives decisions on where to expand, which guards to reward, and which societies to invest in.

Current implementation split: `/admin/dashboard` is the live command-center view (P27), while `/admin/analytics` is the deeper multi-tab analytics workspace.

## Data Sources

Analytics are computed in real-time from existing tables. No separate analytics store needed — Convex's reactive queries handle it. For high-throughput counters, use `@convex-dev/aggregate`.

## Entities Involved

| Table                 | Role in Feature                                                                       |
| --------------------- | ------------------------------------------------------------------------------------- |
| `analytics_snapshots` | Stores cron-generated daily snapshot rows for historical trend and time-series views. |
| `societies`           | Powers society-level KPI breakdowns, comparisons, and coverage metrics.               |
| `leads`               | Feeds funnel, conversion, volume, and guard-quality input metrics.                    |
| `visits`              | Feeds operational throughput and visit outcome analytics.                             |
| `closures`            | Feeds conversion, closure-rate, and cycle-time analytics.                             |
| `payouts`             | Feeds financial totals, status buckets, and payout trend analytics.                   |
| `listings`            | Feeds listing-volume and publish-performance analytics.                               |
| `owner_verifications` | Feeds owner-verification throughput and quality trend metrics.                        |
| `guard_profiles`      | Feeds guard leaderboard and guard-performance rollups.                                |
| `users`               | Resolves actor/persona metadata for leaderboard and activity analytics.               |
| `incentive_cards`     | Feeds incentive adoption and award-distribution analytics.                            |
| `audit_logs`          | Feeds operational timing metrics derived from status-transition events.               |
| `shadow_mode_deltas`  | Feeds shadow-mode rollout/delta monitoring analytics.                                 |

---

## Dashboard Sections

### 1. Overview Dashboard Command Center (`/admin/dashboard`)

This is the live ops command center delivered in P27. The same core KPI/trend/funnel data is also available in the Overview tab at `/admin/analytics`.

**Top-Level KPIs** (cards at top):

| KPI              | Calculation                           | Timeframe               |
| ---------------- | ------------------------------------- | ----------------------- |
| Total Leads      | COUNT leads                           | All time + last 30 days |
| Verified Rate    | verified / submitted × 100            | Last 30 days            |
| Active Guards    | COUNT guards WHERE status = ACTIVE    | Current                 |
| Active Societies | COUNT societies WHERE status = ACTIVE | Current                 |
| Pending Payouts  | SUM payouts WHERE status != disbursed | Current                 |
| Total Paid Out   | SUM payouts WHERE status = disbursed  | All time                |
| Conversion Rate  | closures / verified_leads × 100       | Last 30 days            |

**Lead Funnel** (horizontal funnel chart):

```
SUBMITTED (100) → VERIFIED (45) → LISTING (30) → VISIT (25) → CLOSURE (8) → DISBURSED (6)
```

Shows absolute numbers and drop-off percentages at each stage.

**Trend Chart** (line chart, last 30 days):

- Leads submitted per day
- Leads verified per day
- Closures per day

### 2. Society Analytics

**Society Comparison Table**:

| Society      | City   | Guards | Leads (30d) | Verified Rate | Closures | Avg Days to Closure |
| ------------ | ------ | ------ | ----------- | ------------- | -------- | ------------------- |
| Maplewood  | Mumbai | 12     | 45          | 62%           | 3        | 18                  |
| Riverstone Palava | Mumbai | 8      | 28          | 55%           | 1        | 24                  |

**Society Detail** (drill-down):

- Lead volume trend (last 90 days)
- Building-level breakdown
- Top performing guards in this society
- Vacancy heatmap by building

### 3. Guard Leaderboard

**Leaderboard Table** (sortable by any metric):

| Rank | Guard     | Society     | Leads | Verified | Rate | Visits | Closures | Earned |
| ---- | --------- | ----------- | ----- | -------- | ---- | ------ | -------- | ------ |
| 1    | Rajesh K. | Maplewood | 45    | 38       | 84%  | 22     | 5        | ₹6,200 |
| 2    | Suresh Y. | Riverstone       | 32    | 25       | 78%  | 18     | 3        | ₹3,800 |

**Filters**: Society, Time period (7d / 30d / 90d / all time)

**Guard Performance Detail**:

- Lead submission trend
- Verified vs rejected breakdown (pie chart)
- Visit completion rate
- Average response time (lead submission to verification)

### 4. Financial Overview

| Metric                                     | Value                |
| ------------------------------------------ | -------------------- |
| Total Brokerage Collected (Tenant + Owner) | ₹X                   |
| Total Commission Earned                    | ₹Y                   |
| Total Guard Payouts                        | ₹Z                   |
| Net Revenue                                | Commission - Payouts |
| Average Payout per Closure                 | ₹A                   |
| Average Days: Verified → Closure           | N days               |

**Payout Status Breakdown**:

- pending: ₹X (N payouts)
- approved: ₹Y (N payouts)
- disbursed: ₹Z (N payouts)
- failed: ₹W (N payouts)

**Monthly Trend**: Revenue and payouts over time

### 5. Operational Metrics

| Metric                          | Value    | Trend            |
| ------------------------------- | -------- | ---------------- |
| Avg time: Submitted → Verified  | 2.3 days | ↓ improving      |
| Avg time: Verified → Listing    | 1.1 days | → stable         |
| Avg time: Listing → First Visit | 3.5 days | ↑ getting slower |
| Avg time: Verified → Closure    | 18 days  | → stable         |
| NEED_INFO rate                  | 15%      | → stable         |
| Duplicate rate                  | 8%       | ↓ improving      |
| Visit No-Show rate              | 12%      | ↑ worsening      |

**Computation**: Operational metrics like average verification time are computed by querying the `audit_logs` table for status transition timestamps. For example:

- **Time-to-verify** = timestamp of `LEADS_UPDATE` action (status → VERIFIED) minus `_creationTime` of the lead
- **Time-to-closure** = timestamp of `CLOSURES_CREATE` action minus `_creationTime` of the lead
- The `audit_logs.by_entity` index enables efficient lookups by entity type and ID

For metrics requiring periodic snapshots (e.g., 90-day trend data), the `daily-analytics-snapshot` cron job pre-computes and stores results in the `analytics_snapshots` table, avoiding expensive queries on large datasets.

---

## Convex Implementation

### Using @convex-dev/aggregate for Real-Time Counters

The platform registers 3 aggregate instances for high-throughput real-time counters:

```
// Registered aggregates in convex/convex.config.ts:
- leadCounts: COUNT leads grouped by (society_id, status) — powers lead funnel, KPIs
- visitCounts: COUNT visits grouped by (assigned_guard_id, status) — powers visit metrics
- payoutTotals: SUM payouts.amount grouped by (status) — powers financial overview
```

**Granular breakdowns** (e.g., leads by guard, visits by society, closures by society) are computed at query time using standard Convex queries with index-backed filters. This is a deliberate trade-off:

- **Fewer aggregate instances** = simpler component config, lower operational overhead
- **Index-backed queries** = fast enough for admin dashboard loads (e.g., `by_guard_and_status`, `by_society_and_status` indexes)
- **Scalability**: As data grows, aggregates handle the primary counters; queries scale with indexes

**Rate calculations** (e.g., verified_rate): Computed from aggregate counts or query results.

```
verified_rate = aggregate.count(leadCounts, guard_id, "VERIFIED") / aggregate.count(leadCounts, guard_id, "*") * 100
// OR for guard-specific: query leads by (submitted_by_guard_id, status) using index
```

**Why this pattern**: Aggregate is the Convex-recommended pattern for counters. The 3 registered aggregates handle the primary real-time metrics; more granular breakdowns use indexes for efficiency without the complexity of managing many aggregate instances.

### Real-Time Dashboard Queries

All dashboard queries use Convex's reactive subscriptions — the dashboard auto-updates when data changes. No polling needed.

```
analytics.getOverviewKPIs({ time_window }) → KPIs
analytics.getLeadFunnel({ society_id?, time_window }) → FunnelData
analytics.getLeadTrend({ society_id?, days }) → DailyData[]
analytics.getSocietyComparison({ time_window }) → SocietyStats[]
analytics.getGuardLeaderboard({ society_id?, metric, time_window, limit }) → GuardStats[]
analytics.getFinancialOverview({ time_window }) → FinancialData
analytics.getOperationalMetrics({ society_id?, time_window }) → OperationalData
```

### Cron Jobs for Pre-Computed Analytics

For expensive computations (e.g., 90-day trends), use cron jobs to pre-compute and store snapshots:

```typescript
// convex/crons.ts
crons.daily(
  "daily-analytics-snapshot",
  { hourUTC: 0, minuteUTC: 30 },
  internal.analytics.computeDailySnapshot,
);
```

Store snapshots in an `analytics_snapshots` table for historical trend queries.

---

## Admin Panel UI

### Analytics Workspace Layout (`/admin/analytics`)

```
┌─────────────────────────────────────────────────────────┐
│  [Overview] [Societies] [Guards] [Financial] [Ops]      │  ← Tab navigation
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐              │
│  │ 245   │ │ 62%   │ │ 48    │ │ ₹42K  │              │  ← KPI cards
│  │ Leads │ │ Rate  │ │ Guards│ │ Paid  │              │
│  │ (30d) │ │       │ │       │ │       │              │
│  └───────┘ └───────┘ └───────┘ └───────┘              │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │  Lead Funnel                                 │       │  ← Funnel chart
│  │  SUBMITTED → VERIFIED → LISTING → CLOSURE   │       │
│  └─────────────────────────────────────────────┘       │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │  Lead Trend (30 days)                        │       │  ← Line chart
│  │  📈                                          │       │
│  └─────────────────────────────────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Chart Library

Use a lightweight chart library compatible with React:

- **Recharts** (recommended) — React-native charts, composable, good for dashboards
- Or **Tremor** — built on top of Recharts with pre-built dashboard components + Tailwind

---

## Business Rules

1. All analytics respect RBAC — admin can only see data for societies they have access to (unless super admin).
2. Financial data requires `analytics.view` + relevant payout permissions to see dollar amounts.
3. Guard names in leaderboards are visible to all admins. Earnings are visible only with payout permissions.
4. Historical snapshots are kept indefinitely (storage is cheap).
5. Real-time counters may have slight delay due to Convex's eventual consistency on aggregates.

---

## Edge Cases

- **New society with no data**: Show "No data yet" instead of 0% rates.
- **Guard with 1 lead**: Rates are misleading. Show "Insufficient data" for <5 leads.
- **Date range with no activity**: Show flat line, not empty chart.
- **Large datasets (1000+ leads)**: Use aggregate component, not .collect().length for counts.
