---
id: P12-E02
title: Admin Analytics Dashboard
phase: 12
status: done
depends_on: ["P12-E01", "P04-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P12-E02: Admin Analytics Dashboard

## Overview

Build the admin analytics dashboard end-to-end: install Recharts as the chart library, create the `/admin/analytics` page with a 5-tab layout (Overview, Societies, Guards, Financial, Operational) synced to URL query params, implement the Overview tab with 7 KPI cards, a lead funnel horizontal bar chart, and a daily trend line chart, build the Society Analytics tab with a sortable comparison table and society drill-down panel, build the Guard Leaderboard tab with a sortable table and society/time-period/limit filters, implement the Financial Overview tab with financial metric cards, payout status breakdown, and a monthly trend bar chart, and build the Operational Metrics tab with pipeline timing cards and trend indicators comparing current vs. previous period.

## Prerequisites

- **Read first**: [P12-E01 Completion Summary](P12-E01-analytics-backend.md#completion-summary) — all 7 analytics backend queries are expected to exist: `analytics.getOverviewKPIs`, `analytics.getLeadFunnel`, `analytics.getLeadTrend`, `analytics.getSocietyComparison`, `analytics.getGuardLeaderboard`, `analytics.getFinancialOverview`, `analytics.getOperationalMetrics`.
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — admin table, filter bar, pagination, and detail panel patterns established. Reuse for the society comparison table and guard leaderboard table.

## Task Queue

- [x] P12-E02-T01: Dashboard Page Shell + Overview Tab
- [x] P12-E02-T02: Society Analytics Tab
- [x] P12-E02-T03: Guard Leaderboard Tab
- [x] P12-E02-T04: Financial Overview Tab
- [x] P12-E02-T05: Operational Metrics Tab

---

## T01: Dashboard Page Shell + Overview Tab

### Objective

Install Recharts, create the analytics dashboard page at `/admin/analytics` with a 5-tab layout synced to URL query params, and implement the Overview tab with 7 KPI cards, a lead funnel horizontal bar chart, and a daily trend line chart.

### Required Reading

- `notes/features/10-analytics.md` — "Overview Dashboard" section (KPIs, funnel wireframe, trend chart)
- `notes/06-admin-panel-ux.md` — Admin sidebar navigation placement and existing page layout patterns. The 5-tab analytics wireframe is in `notes/features/10-analytics.md`.
- `notes/13-constants-reference.md` — `analytics.view` permission

### Key Rules

1. Install Recharts: `npm install recharts`. This is the chart library for all analytics charts in this epic. No other chart library is used.
2. Route: `src/app/(admin)/admin/analytics/page.tsx`. This is a NEW page, not the existing `/admin/dashboard`. Update `src/app/(admin)/admin-layout-client.tsx` to add an "Analytics" nav item with a chart icon (use `BarChart3` from lucide-react), gated by `requiredPermission: "analytics.view"`, positioned in the Management section after Incentives.
3. Page has 5 tabs using the shadcn `Tabs` component: "Overview" (default), "Societies", "Guards", "Financial", "Operational".
4. Tab selection is synced to the URL query param `?tab=overview|societies|guards|financial|operational`. Default tab when no param is present: "overview".
5. A shared time window selector (radio group or segmented control: "7 Days", "30 Days", "90 Days", "All Time", default "30 Days") lives at the page level and is passed down to all tab components as a prop. Changing it re-fetches all tab data.
6. Create `src/app/(admin)/admin/analytics/components/overview-tab.tsx` for the Overview tab content.
7. Create `src/app/(admin)/admin/analytics/components/kpi-card.tsx` — reusable card component: icon slot, label, value (formatted string), optional trend arrow (up/down/neutral with color). Used across Overview and Financial tabs.
8. Overview tab top row: 7 KPI cards in a responsive grid (4 per row on desktop, 2 on tablet, 1 on mobile). Data from `useQuery(api.analytics.getOverviewKPIs, { time_window })`. Each card shows: label, value (number, percentage, or ₹ amount), and the active time window as a sub-label.
9. Lead Funnel chart: horizontal bar chart showing pipeline stages with counts and drop-off percentages. Create `src/app/(admin)/admin/analytics/components/lead-funnel-chart.tsx`. Data from `useQuery(api.analytics.getLeadFunnel, { time_window })`. Stages in order: SUBMITTED, VERIFIED, LISTING, VISIT, CLOSURE, PAID. Each bar shows the absolute count; label shows drop-off % from the previous stage. Use Recharts `BarChart` with `layout="vertical"`.
10. Trend Line Chart: line chart showing daily leads submitted, verified, and closures over the selected period. Create `src/app/(admin)/admin/analytics/components/trend-line-chart.tsx`. Data from `useQuery(api.analytics.getLeadTrend, { days })` where `days` maps from the time window (7d/30d/90d/all). Three lines: submitted (blue), verified (green), closures (orange). X-axis: dates, Y-axis: counts. Responsive container, tooltips on hover. Use Recharts `LineChart`. Time window to days mapping: 7 Days → `7`, 30 Days → `30`, 90 Days → `90`, All Time → `365` (capped at 1 year).
11. Money display: convert paise to rupees using `lib/money.ts` helpers. Format with Indian numbering (e.g., ₹1,23,456) via `formatINR()`.

### Deliverables

- [ ] `package.json` — Recharts added as a dependency
- [ ] `src/app/(admin)/admin-layout-client.tsx` — Analytics nav item added, gated by `analytics.view`, positioned after Incentives
- [ ] `src/app/(admin)/admin/analytics/page.tsx` — Dashboard page with 5-tab layout and URL-synced tab state
- [ ] `src/app/(admin)/admin/analytics/components/overview-tab.tsx` — Overview tab with KPI grid, funnel chart, and trend chart
- [ ] `src/app/(admin)/admin/analytics/components/kpi-card.tsx` — Reusable KPI card component
- [ ] `src/app/(admin)/admin/analytics/components/lead-funnel-chart.tsx` — Horizontal bar funnel chart
- [ ] `src/app/(admin)/admin/analytics/components/trend-line-chart.tsx` — Multi-line trend chart

### Acceptance Criteria

1. `npm install recharts` completes and `recharts` appears in `package.json` dependencies.
2. Analytics nav item appears in admin sidebar with `href: "/admin/analytics"`, `BarChart3` icon, gated by `analytics.view`, positioned after Incentives.
3. `/admin/analytics` renders a 5-tab layout with correct tab names.
4. Tab selection persists in the URL query param `?tab=...`. Default tab is "overview".
5. Time window selector renders at page level and changing it updates all tab data.
6. Overview tab renders 7 KPI cards in a responsive grid.
7. Lead funnel chart renders with 6 stages and drop-off percentages.
8. Trend line chart renders with 3 lines and correct axis labels.
9. All money values formatted with `formatINR()` from `lib/money.ts`.
10. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on `/admin/analytics`: sidebar visibility by permission, tab names, default tab, URL param sync, time window selector, KPI card grid layout, funnel chart stages, trend chart lines and tooltips.

### Out of Scope

- Society tab content (T02)
- Guard leaderboard tab content (T03)
- Financial tab content (T04)
- Operational tab content (T05)

---

## T02: Society Analytics Tab

### Objective

Implement the Society Analytics tab with a sortable comparison table and a society drill-down panel showing lead volume trend, building-level breakdown, and top guards.

### Required Reading

- `notes/features/10-analytics.md` — "Society Analytics" section (comparison table columns, drill-down panel wireframe)
- `notes/06-admin-panel-ux.md` — Admin table and detail panel patterns

### Key Rules

1. Create `src/app/(admin)/admin/analytics/components/society-tab.tsx`.
2. Society comparison table columns: Society (name), City, Guards (active count), Leads (count for the selected period), Verified Rate (%), Closures (count), Avg Days to Closure.
3. Data from `useQuery(api.analytics.getSocietyComparison, { time_window })`. Time window comes from the page-level selector (T01).
4. Table is sortable by any column header click. Clicking a header once sorts ascending; clicking again sorts descending. Default sort: Leads descending.
5. Clicking a society row opens a drill-down panel (inline expansion or side panel — match the existing admin detail panel pattern from P04-E03). The drill-down shows:
   - Lead volume trend for this society: reuse `trend-line-chart.tsx` from T01, passing `society_id` as a filter.
   - Building-level breakdown table: compute client-side by grouping the society's leads by `building_id` (requires a supplementary query or the society drill-down backend endpoint returning building-grouped data). If the backend does not provide building-level granularity, show a placeholder: "Building breakdown coming soon." with a TODO comment for the executing agent to either add a supplementary query or mark as V2.
   - Top 5 performing guards in this society: mini leaderboard with rank, guard name, leads, verified rate.
6. Societies with 0 leads for the selected period show "No data yet" in the Leads, Verified Rate, Closures, and Avg Days to Closure cells (not "0" or "0%").
7. Empty state for the full table (no societies): "No society data available for this period."

### Deliverables

- [ ] `src/app/(admin)/admin/analytics/components/society-tab.tsx` — Society comparison table with column sorting and drill-down panel

### Acceptance Criteria

1. Society comparison table renders with all 7 columns.
2. Column header click sorts the table ascending/descending.
3. Default sort is Leads descending.
4. Clicking a society row opens the drill-down panel with trend chart, building breakdown, and top 5 guards.
5. Societies with 0 leads show "No data yet" in metric cells.
6. Time window selector from page level controls the data.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on the Societies tab: verify all 7 columns, click column headers to sort, click a society row to open drill-down, verify "No data yet" for zero-lead societies, verify time window changes refresh data.

### Out of Scope

- Guard leaderboard tab (T03)
- Financial tab (T04)
- Operational tab (T05)

---

## T03: Guard Leaderboard Tab

### Objective

Implement the Guard Leaderboard tab with a sortable table, society filter, time period filter, and limit selector.

### Required Reading

- `notes/features/10-analytics.md` — "Guard Leaderboard" section (table columns, filter options)
- `notes/13-constants-reference.md` — `analytics.view` and `payouts.view` permissions

### Key Rules

1. Create `src/app/(admin)/admin/analytics/components/guard-leaderboard-tab.tsx`.
2. Table columns: Rank (#), Guard (name), Society, Leads (submitted), Verified (count), Rate (verified %), Visits (completed), Closures, Earned (₹ payout total).
3. Data from `useQuery(api.analytics.getGuardLeaderboard, { society_id?, metric, time_window, limit })`. Time window comes from the page-level selector (T01).
4. Filters:
   - Society: searchable dropdown (optional). When selected, filters to guards in that society. Passes `society_id` to the query.
   - Metric sort: clicking a column header sets the `metric` arg and re-fetches. Default metric: `verified` (verified lead count).
   - Limit: dropdown with options 10 / 20 / 50. Default: 20.
5. "Earned" column: if the current user lacks `payouts.view` permission, show "—" in every row (the backend returns `null` for this field when the caller lacks the permission — do not attempt to display it).
6. Rate column: show "—" for guards with fewer than 5 submitted leads (insufficient data). Do not show "0%" or misleading percentages.
7. Clicking a guard name navigates to `/admin/guards/[id]` (the existing guard detail page from P03-E02).
8. Empty state: "No guard data available for this period."
9. Use `react-hook-form` + `zod` for the filter form if filters are submitted as a form. If filters are controlled state, no form library is needed — use controlled inputs.

### Deliverables

- [ ] `src/app/(admin)/admin/analytics/components/guard-leaderboard-tab.tsx` — Guard leaderboard table with column sorting, society filter, and limit selector

### Acceptance Criteria

1. Guard leaderboard table renders with all 9 columns.
2. Column header click changes the sort metric and re-fetches.
3. Society filter dropdown filters the leaderboard to guards in the selected society.
4. Limit dropdown changes the number of rows returned.
5. "Earned" column shows "—" when user lacks `payouts.view`.
6. Rate column shows "—" for guards with fewer than 5 submissions.
7. Guard name is a link to `/admin/guards/[id]`.
8. Time window selector from page level controls the data.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on the Guards tab: verify all 9 columns, click column headers to change sort metric, apply society filter, change limit, verify "—" for Earned when lacking payouts.view, verify guard name links navigate correctly.

### Out of Scope

- Financial tab (T04)
- Operational tab (T05)
- Guard detail page modifications (P03-E02)

---

## T04: Financial Overview Tab

### Objective

Implement the Financial Overview tab with financial metric cards, a payout status breakdown, and a monthly trend bar chart.

### Required Reading

- `notes/features/10-analytics.md` — "Financial Overview" section (metric cards, payout breakdown, monthly trend chart)
- `notes/13-constants-reference.md` — `payouts.view` permission, payout status values (INITIATED, APPROVED, PAID, VOIDED)

### Key Rules

1. Create `src/app/(admin)/admin/analytics/components/financial-tab.tsx`.
2. Financial metric cards (reuse `kpi-card.tsx` from T01): Total Brokerage Collected, Total Commission (same value as Total Brokerage — display with both labels for business clarity), Total Guard Payouts, Net Revenue, Avg Payout per Closure, Avg Days Verified to Closure. All money values formatted with `formatINR()` from `lib/money.ts`.
3. Data from `useQuery(api.analytics.getFinancialOverview, { time_window })`. Time window comes from the page-level selector (T01).
4. Payout Status Breakdown: 4 cards — INITIATED (₹ total, N payouts), APPROVED (₹ total, N payouts), PAID (₹ total, N payouts), VOIDED (₹ total, N payouts). Color-coded: INITIATED amber, APPROVED blue, PAID green, VOIDED grey.
5. Monthly Trend chart: bar chart showing revenue and payout totals over the last 12 months. Use Recharts `BarChart` with two bar series: revenue (green bars) and payouts (red bars). X-axis: month labels (e.g., "Jan", "Feb"), Y-axis: ₹ amounts. Responsive container, tooltips showing formatted ₹ values.
6. Permission gating: if the current user lacks `payouts.view`, the entire Financial tab content is replaced with a "You don't have permission to view financial data" message. The tab itself remains visible in the tab bar (structural, always shown). This follows the same pattern as P10-E02-T04 (config tab content gated, tab always visible).
7. Money formatting: all paise values converted to rupees via `paiseToRupees()` and displayed via `formatINR()` from `lib/money.ts`. Never display raw paise values in the UI.

### Deliverables

- [ ] `src/app/(admin)/admin/analytics/components/financial-tab.tsx` — Financial metric cards, payout status breakdown, and monthly trend bar chart

### Acceptance Criteria

1. Financial tab shows 6 metric cards with correct labels and formatted ₹ values.
2. Payout status breakdown shows 4 color-coded cards (INITIATED amber, APPROVED blue, PAID green, VOIDED grey).
3. Monthly trend bar chart renders with 2 bar series (revenue green, payouts red) and correct axis labels.
4. All money values formatted with `formatINR()`.
5. Tab content replaced with permission message when user lacks `payouts.view`. Tab itself remains visible.
6. Time window selector from page level controls the data.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on the Financial tab: verify 6 metric cards, verify payout breakdown colors, verify monthly chart dual bars and tooltips, verify permission gate shows message for users lacking payouts.view (tab still visible in tab bar).

### Out of Scope

- Operational tab (T05)
- Payout management mutations (P09)
- CSV/Excel export (V2)

---

## T05: Operational Metrics Tab

### Objective

Implement the Operational Metrics tab with pipeline timing metric cards and trend indicators comparing the current period to the previous period of the same length.

### Required Reading

- `notes/features/10-analytics.md` — "Operational Metrics" section (timing metrics, trend indicator logic)
- `notes/13-constants-reference.md` — `analytics.view` permission

### Key Rules

1. Create `src/app/(admin)/admin/analytics/components/operational-tab.tsx`.
2. Metrics displayed as cards in a grid (2 columns on desktop, 1 on mobile):
   - Avg time: Submitted to Verified (days)
   - Avg time: Verified to Listing (days)
   - Avg time: Listing to First Visit (days)
   - Avg time: Verified to Closure (days)
   - NEED_INFO rate (%)
   - Duplicate rate (%)
   - Visit No-Show rate (%)
3. Data from `useQuery(api.analytics.getOperationalMetrics, { society_id?, time_window })`. Time window comes from the page-level selector (T01).
4. Each metric card shows: label, value (days or %), and a trend indicator icon with color:
   - Trend is computed by comparing the current period value to the previous period of the same length (the backend returns both `current` and `previous` values for each metric).
   - For timing metrics (days): lower is better. Trend: current < previous = improving (green ↓), current > previous = worsening (red ↑), within 5% = stable (grey →).
   - For rate metrics (NEED_INFO rate, duplicate rate, no-show rate): lower is better. Same color logic.
   - Use lucide-react icons: `TrendingDown` (green, improving), `Minus` (grey, stable), `TrendingUp` (red, worsening).
5. Optional society filter: searchable dropdown at the top of the tab (optional, passes `society_id` to the query). Matches the page-level time window.
6. Metrics with no activity in the selected period: show "No data" (not "0" or "0 days"). The backend returns `null` for these — render "No data" in muted text.
7. Empty state (all metrics null): "No operational data available for this period."

### Deliverables

- [ ] `src/app/(admin)/admin/analytics/components/operational-tab.tsx` — Operational metrics grid with trend indicators and optional society filter

### Acceptance Criteria

1. Operational tab renders 7 metric cards in a 2-column grid.
2. Each card shows label, value, and trend indicator icon with correct color.
3. Trend direction and color correct for each metric type (lower-is-better logic applied consistently).
4. Society filter dropdown filters metrics to the selected society.
5. Metrics with null backend values show "No data" in muted text.
6. Time window selector from page level controls the data.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on the Operational tab: verify 7 metric cards, verify trend indicator colors (green/grey/red), verify society filter changes data, verify "No data" for null metrics, verify time window changes refresh all cards.

### Out of Scope

- Backend metric computation (P12-E01)
- Guard-facing analytics (analytics is admin-only)
- Per-society scoped dashboards (V2)
- CSV/Excel export (V2)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-18

### What Was Built

1. **Admin Analytics Dashboard** at `/admin/analytics` with 5-tab layout:
   - **Overview tab**: 7 KPI cards (responsive grid 4/2/1 columns), lead funnel horizontal bar chart (6 stages with drop-off %), trend line chart (3 lines: submitted, verified, closures)
   - **Societies tab**: Sortable comparison table (7 columns), society drill-down with trend chart + top 5 guards mini-table, building breakdown placeholder
   - **Guards tab**: Sortable leaderboard table (9 columns), society filter dropdown, metric sort by column, limit selector (10/20/50)
   - **Financial tab**: 6 metric cards, 4 color-coded payout breakdown cards (INITIATED amber, APPROVED blue, PAID green, VOIDED grey), monthly trend dual bar chart (revenue green, payouts red). Permission-gated (payouts.view)
   - **Operational tab**: 7 metric cards in 2-column grid, trend indicators (TrendingDown green, Minus grey, TrendingUp red), society filter dropdown

2. **Analytics nav item** in admin sidebar with `BarChart3` icon, gated by `analytics.view`, positioned after Incentives

3. **Shared components**:
   - `KpiCard` — reusable across Overview and Financial tabs (icon, label, value, trend indicator)
   - `LeadFunnelChart` — horizontal bar chart with drop-off labels
   - `TrendLineChart` — multi-line chart reused in Overview and Society drill-down

### Key File Locations

- `src/app/(admin)/admin/analytics/page.tsx` — Main dashboard page (5 tabs, URL sync, time window selector)
- `src/app/(admin)/admin/analytics/components/kpi-card.tsx` — Reusable KPI card
- `src/app/(admin)/admin/analytics/components/overview-tab.tsx` — Overview tab
- `src/app/(admin)/admin/analytics/components/lead-funnel-chart.tsx` — Funnel chart
- `src/app/(admin)/admin/analytics/components/trend-line-chart.tsx` — Trend line chart
- `src/app/(admin)/admin/analytics/components/society-tab.tsx` — Society comparison + drill-down
- `src/app/(admin)/admin/analytics/components/guard-leaderboard-tab.tsx` — Guard leaderboard
- `src/app/(admin)/admin/analytics/components/financial-tab.tsx` — Financial overview
- `src/app/(admin)/admin/analytics/components/operational-tab.tsx` — Operational metrics
- `src/app/(admin)/admin-layout-client.tsx` — Modified: Analytics nav item added (line 104-110)

### Deviations from Spec

1. **Society drill-down building breakdown**: Shows "Building breakdown coming soon." placeholder — backend does not currently provide building-level granularity. TODO for future enhancement.
2. **Financial tab uses `"skip"` pattern**: When user lacks `payouts.view`, the query is skipped entirely (passed `"skip"` to `useQuery`) and content is replaced with permission message — cleaner than querying and getting nulls.
3. **Operational tab society filter**: Uses `getSocietyComparison` with `all_time` to populate the society dropdown, since no dedicated `getAllSocieties` query exists in the analytics module.

### Gotchas for Next Epic

1. **TimeWindow type is exported from page.tsx**: All tab components import `type { TimeWindow } from "../page"`. If the page file is moved, imports in all 8 component files must be updated.
2. **Recharts is now a dependency**: Added to `package.json`. Any future chart work should use Recharts for consistency.
3. **Financial tab payout breakdown keys are lowercase**: `pending`, `approved`, `disbursed`, `voided` — matching the backend's `PAYOUT_STATUS` constants.
