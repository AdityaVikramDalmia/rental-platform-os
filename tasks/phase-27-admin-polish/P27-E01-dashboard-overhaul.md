---
id: P27-E01
title: Dashboard Overhaul — Full Ops Command Center
phase: 27
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P27-E01: Dashboard Overhaul — Full Ops Command Center

## Overview

Replace the near-empty admin dashboard (currently 124 lines, only a welcome card) with a full ops command center: KPI cards, lead funnel chart, trend line chart, recent activity tables, status breakdowns, alerts, and quick actions. All 7 analytics backend queries already exist in `convex/analytics.ts` — this epic is frontend-only.

## Task Queue

- [x] P27-E01-T01: KPI Cards Section
- [x] P27-E01-T02: Lead Funnel Chart
- [x] P27-E01-T03: Trend Line Chart
- [x] P27-E01-T04: Recent Activity Tables
- [x] P27-E01-T05: Status Breakdowns
- [x] P27-E01-T06: Alerts and Quick Actions
- [x] P27-E01-T07: Dashboard Layout, Error States, and Polish

---

## T01: KPI Cards Section

### Objective

Build a `DashboardKPICards` component that renders 7 KPI cards from `api.analytics.getOverviewKPIs`. Cards display in a responsive grid (3 columns desktop, 2 tablet, 1 mobile) with a time window selector (7d / 30d / 90d / all) that re-fetches data.

### Required Reading

- `notes/features/10-analytics.md` — "Overview Dashboard" section, KPI table (7 metrics, calculations, timeframes)
- `notes/06-admin-panel-ux.md` — "Global Layout" and "Table Patterns" sections (desktop-first, shadcn/ui conventions)
- `notes/13-constants-reference.md` — Permission `analytics.view`

### Key Rules

1. Use `useQuery(api.analytics.getOverviewKPIs, { time_window })` — reactive, no polling needed.
2. The `time_window` state lives in the parent dashboard page and is passed down as a prop. The time window selector component also lives in the parent (T07 wires it). This task only accepts `time_window` as a prop.
3. KPI cards to render (7 total): Total Leads, Verified Rate (%), Active Guards, Active Societies, Pending Payouts (count), Total Paid Out (₹), Conversion Rate (%).
4. Money values are in paise — divide by 100 before display. Format with `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })`.
5. Each card: icon (lucide-react), label, primary value, and a trend indicator (up/down arrow + delta text). If trend data is unavailable, omit the indicator rather than showing a placeholder.
6. Use shadcn/ui `Card`, `CardContent`, `CardHeader` for card structure.
7. Loading state: render `Skeleton` components matching the card shape — not a spinner.
8. Guard against `undefined` query result — show skeletons until data arrives.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardKPICards.tsx` — KPI cards grid component accepting `time_window` prop
- [ ] `src/components/admin/dashboard/TimeWindowSelector.tsx` — 4-button toggle (7d / 30d / 90d / All) using shadcn/ui `Button` with variant switching

### Acceptance Criteria

1. Component renders 7 cards with correct labels and values from `getOverviewKPIs`
2. Money values display as formatted INR (e.g., "₹42,000"), not raw paise
3. Percentage values display with "%" suffix (e.g., "62%")
4. Grid is 3 columns on desktop (`grid-cols-3`), 2 on tablet (`md:grid-cols-2`), 1 on mobile (`grid-cols-1`)
5. Selecting a different time window triggers a re-fetch and updates all card values
6. Loading state shows skeletons, not a blank area or spinner
7. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardKPICards.tsx` and `src/components/admin/dashboard/TimeWindowSelector.tsx`.

### Out of Scope

- Wiring into the dashboard page (T07)
- Chart components (T02, T03)
- Trend delta calculation logic — use whatever the backend returns in `getOverviewKPIs`

---

## T02: Lead Funnel Chart

### Objective

Build a `DashboardFunnelChart` component that renders a horizontal funnel/bar chart from `api.analytics.getLeadFunnel`. Shows pipeline stages (SUBMITTED → VERIFIED → LISTING → VISIT → CLOSURE → DISBURSED) with absolute counts and drop-off percentages between stages. Uses Recharts (already a project dependency).

### Required Reading

- `notes/features/10-analytics.md` — "Lead Funnel" section (horizontal funnel chart, stage names, drop-off %)
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum values (SUBMITTED, VERIFIED, etc.)
- `notes/10-convex-schema.md` — `leads` table (for understanding what stages map to)

### Key Rules

1. Use `useQuery(api.analytics.getLeadFunnel, { time_window })` — accept `time_window` as a prop.
2. Import from `recharts`: use `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, or `ComposedChart` — whichever produces the clearest horizontal funnel. Do NOT install a new chart library.
3. Stages in order: SUBMITTED, VERIFIED, LISTING, VISIT, CLOSURE, DISBURSED. Render left-to-right or top-to-bottom depending on what fits the layout.
4. Show drop-off percentage between each adjacent stage (e.g., "55% passed" or "45% dropped"). Compute from the counts returned by `getLeadFunnel`.
5. Chart must be responsive — wrap in `<ResponsiveContainer width="100%" height={300}>`.
6. Loading state: `Skeleton` matching the chart height.
7. Empty state (all counts are 0): show "No lead data for this period" text, not a broken chart.
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardFunnelChart.tsx` — Horizontal funnel/bar chart component accepting `time_window` prop

### Acceptance Criteria

1. Chart renders all 6 pipeline stages with correct labels
2. Bar lengths are proportional to stage counts
3. Drop-off percentages are shown between stages
4. Chart is responsive (fills container width)
5. Loading state shows a skeleton
6. Empty state shows a friendly message instead of a broken chart
7. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardFunnelChart.tsx`.

### Out of Scope

- Wiring into the dashboard page (T07)
- Drill-down on funnel stages (V2)
- Society-level funnel filtering (V2)

---

## T03: Trend Line Chart

### Objective

Build a `DashboardTrendChart` component that renders a line chart from `api.analytics.getLeadTrend`. Shows leads submitted and leads verified per day for the selected time window. Uses Recharts.

### Required Reading

- `notes/features/10-analytics.md` — "Trend Chart" section (line chart, last 30 days, two series: submitted + verified)
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum (SUBMITTED, VERIFIED)

### Key Rules

1. Use `useQuery(api.analytics.getLeadTrend, { time_window })` — accept `time_window` as a prop.
2. Import from `recharts`: `LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`.
3. Two lines: "Submitted" (blue) and "Verified" (green). Use distinct colors that work on both light and dark backgrounds.
4. X-axis: dates formatted as "Feb 17" (short month + day). Use `lib/dates.ts` helpers or `Intl.DateTimeFormat` for formatting.
5. Chart must be responsive — wrap in `<ResponsiveContainer width="100%" height={300}>`.
6. Loading state: `Skeleton` matching the chart height.
7. Empty state (no data points): show "No trend data for this period" text.
8. Flat line (all zeros) is valid — render it, don't treat it as empty.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardTrendChart.tsx` — Line chart component accepting `time_window` prop

### Acceptance Criteria

1. Chart renders two lines: Submitted (blue) and Verified (green)
2. X-axis shows dates in "Feb 17" format
3. Legend identifies both lines
4. Chart is responsive (fills container width)
5. Loading state shows a skeleton
6. Empty state shows a friendly message
7. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardTrendChart.tsx`.

### Out of Scope

- Wiring into the dashboard page (T07)
- Closures-per-day third line (can be added in V2)
- Zoom/pan interactions (V2)

---

## T04: Recent Activity Tables

### Objective

Build a `DashboardRecentActivity` component that renders 3 compact tables side-by-side (or stacked on mobile): Latest 5 Leads, Latest 5 Visits, Latest 5 Payouts. Each row is clickable and links to the entity's detail page. Uses existing list queries with `limit: 5`.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" and "Table Patterns" sections (table conventions, status badges, pagination)
- `notes/13-constants-reference.md` — `LEAD_STATUS`, `VISIT_STATUS`, `PAYOUT_STATUS` enums and their badge colors
- `notes/10-convex-schema.md` — `leads`, `visits`, `payouts` table fields (to know which columns to show)

### Key Rules

1. Use `useQuery(api.leads.list, { limit: 5 })`, `useQuery(api.visits.list, { limit: 5 })`, `useQuery(api.payouts.list, { limit: 5 })` — all 3 queries fire in parallel (React renders them simultaneously).
2. Leads table columns: Flat (building + flat number), Society, Status badge, Date (formatted "Feb 17").
3. Visits table columns: Property/Flat, Guard name, Status badge, Date.
4. Payouts table columns: Guard name, Amount (₹, from paise), Status badge, Date.
5. Money values are in paise — divide by 100 before display.
6. Dates are Unix milliseconds — format with `lib/dates.ts` or `Intl.DateTimeFormat`.
7. Clicking a lead row navigates to `/admin/leads` (with the lead selected, if the list page supports it) or `/admin/leads?id={id}`. Use `next/link` or `useRouter`.
8. Clicking a visit row navigates to `/admin/visits`.
9. Clicking a payout row navigates to `/admin/payouts`.
10. Status badges: reuse existing shared badge components from `src/components/shared/` if they exist. Do NOT create duplicate badge logic.
11. Loading state: `Skeleton` rows (3 rows per table) while queries load.
12. Empty state per table: "No recent [leads/visits/payouts]" text.
13. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardRecentActivity.tsx` — 3-table recent activity component

### Acceptance Criteria

1. Three tables render with correct columns for leads, visits, and payouts
2. Each table shows at most 5 rows
3. Money values display as formatted INR
4. Status badges display with correct colors per status
5. Clicking a row navigates to the correct admin list page
6. Loading state shows skeleton rows
7. Empty state shows friendly text per table
8. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardRecentActivity.tsx`.

### Out of Scope

- Wiring into the dashboard page (T07)
- Inline detail panel on row click (V2)
- "View all" links per table (can be added in T07 as quick actions)

---

## T05: Status Breakdowns

### Objective

Build a `DashboardStatusBreakdowns` component that renders 3 mini-card groups showing entity counts by status: Leads by status, Visits by status, Payouts by status. Each status gets a color-coded badge and count.

### Required Reading

- `notes/13-constants-reference.md` — `LEAD_STATUS`, `VISIT_STATUS`, `PAYOUT_STATUS` enums, badge color conventions
- `notes/features/10-analytics.md` — "Overview Dashboard" section (KPI context for status counts)
- `notes/10-convex-schema.md` — `leads`, `visits`, `payouts` tables (status field values)

### Key Rules

1. Use `useQuery(api.analytics.getOverviewKPIs, { time_window })` — the overview KPIs query already returns status breakdown data. Do NOT fire separate queries if the data is already available from T01's query. Accept the KPI data as a prop if T07 passes it down, or call the query directly if not.
2. Leads status groups to show: SUBMITTED, NEED_INFO, POTENTIAL_DUPLICATE, VERIFIED, REJECTED, DUPLICATE. Show count for each.
3. Visits status groups to show: ASSIGNED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW.
4. Payouts status groups to show: INITIATED, APPROVED, PAID, FAILED, VOIDED.
5. Each status item: colored badge (matching the badge color from `notes/13-constants-reference.md`) + status label + count.
6. Layout: 3 sections side-by-side on desktop, stacked on mobile. Each section has a heading ("Leads", "Visits", "Payouts") and a list of status rows.
7. Zero-count statuses: still show them (count = 0) so the admin can see the full picture.
8. Loading state: `Skeleton` rows.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardStatusBreakdowns.tsx` — Status breakdown mini-cards component accepting `time_window` prop

### Acceptance Criteria

1. Three sections render: Leads, Visits, Payouts
2. Each section shows all statuses for that entity type with counts
3. Status badges use correct colors per `notes/13-constants-reference.md`
4. Zero-count statuses are shown (not hidden)
5. Layout is 3-column on desktop, stacked on mobile
6. Loading state shows skeletons
7. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardStatusBreakdowns.tsx`.

### Out of Scope

- Wiring into the dashboard page (T07)
- Clickable status rows that filter the list pages (V2)

---

## T06: Alerts and Quick Actions

### Objective

Build a `DashboardAlertsAndActions` component that shows an alert banner for urgent items requiring attention, plus quick action buttons for common ops tasks.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" and "Flow 4: Schedule Visit" sections (what ops do most)
- `notes/13-constants-reference.md` — `LEAD_STATUS` (SUBMITTED = needs verification), `VISIT_STATUS` (ASSIGNED = needs confirmation), `PAYOUT_STATUS` (INITIATED = pending approval), permissions
- `notes/features/10-analytics.md` — "Overview Dashboard" KPI section (pending_payouts, total_leads context)

### Key Rules

1. Use `useQuery(api.analytics.getOverviewKPIs, { time_window })` for alert counts — accept as prop or call directly.
2. Alert banner shows 3 urgent counts (if > 0):
   - Leads awaiting verification: count of SUBMITTED leads
   - Visits needing assignment: count of ASSIGNED visits (needs_reassignment = true, or just ASSIGNED count)
   - Payouts pending approval: count of INITIATED payouts
3. If all 3 counts are 0, show a green "All clear — no urgent items" state instead of the alert banner.
4. Alert banner uses amber/yellow styling (not red — these are action items, not errors). Use shadcn/ui `Alert` or a custom div with Tailwind amber classes.
5. Quick action buttons (4 total):
   - "View Lead Queue" → links to `/admin/leads?status=SUBMITTED`
   - "View Visit Board" → links to `/admin/visits`
   - "View Payouts" → links to `/admin/payouts?status=INITIATED`
   - "Create Guard" → links to `/admin/guards` (or opens create dialog if that pattern exists)
6. Quick action buttons use shadcn/ui `Button` with `variant="outline"` and a lucide-react icon each.
7. Loading state: `Skeleton` for the alert banner area.
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardAlertsAndActions.tsx` — Alert banner + quick action buttons component

### Acceptance Criteria

1. Alert banner shows correct counts for SUBMITTED leads, ASSIGNED visits, INITIATED payouts
2. Alert banner is hidden (replaced by "All clear" state) when all counts are 0
3. Alert banner uses amber/yellow styling
4. All 4 quick action buttons render with icons and correct link targets
5. Loading state shows a skeleton for the alert area
6. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardAlertsAndActions.tsx`.

### Out of Scope

- Wiring into the dashboard page (T07)
- Dismissable alerts (V2)
- Push notifications (V2)

---

## T07: Dashboard Layout, Error States, and Polish

### Objective

Wire all 6 dashboard components (T01-T06) into the dashboard page at `src/app/(admin)/admin/dashboard/page.tsx`. Add a shared `time_window` state, per-section error boundaries, per-section loading skeletons, and a responsive 2-column desktop / single-column mobile layout. Remove the old welcome card.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Global Layout" section (desktop-first, sidebar + content area)
- `notes/features/10-analytics.md` — "Dashboard Layout" ASCII wireframe (tab navigation, KPI cards, funnel, trend)
- `notes/13-constants-reference.md` — Permission `analytics.view` (dashboard requires this permission)
- `src/app/(admin)/admin/dashboard/page.tsx` — Current 124-line file (read before editing)

### Key Rules

1. Read the existing `src/app/(admin)/admin/dashboard/page.tsx` before making any changes.
2. Add `time_window` state at the page level: `const [timeWindow, setTimeWindow] = useState<"7d" | "30d" | "90d" | "all">("30d")`. Pass it as a prop to all child components.
3. Render `TimeWindowSelector` (from T01) prominently at the top of the page, below the page heading.
4. Page layout (desktop): 2-column grid for the main content area. Left column (wider): KPI cards, funnel chart, trend chart. Right column (narrower): alerts + quick actions, status breakdowns. Stack to single column on mobile.
5. Recent activity tables (T04) span full width below the 2-column section.
6. Per-section error boundaries: wrap each component in a React `ErrorBoundary` (or a simple try/catch wrapper component). If one section fails, the rest of the dashboard still renders. Show a "Failed to load [section name]" card for the broken section.
7. Remove the old welcome card and any placeholder content from the existing file.
8. Page heading: "Dashboard" (h1). Sub-heading or description is optional.
9. The page must require `analytics.view` permission — check how other admin pages enforce RBAC and follow the same pattern.
10. `npm run build` must pass after this task.
11. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/app/(admin)/admin/dashboard/page.tsx` — Overhauled dashboard page wiring all 6 components with shared time window state, error boundaries, and responsive layout
- [ ] `src/components/admin/dashboard/DashboardErrorCard.tsx` — Reusable error fallback card for per-section error boundaries

### Acceptance Criteria

1. Dashboard page renders all 7 sections: KPI cards, time window selector, funnel chart, trend chart, recent activity tables, status breakdowns, alerts + quick actions
2. Changing the time window selector updates all data-dependent sections simultaneously
3. Old welcome card is removed
4. 2-column layout on desktop (≥1024px), single column on mobile
5. Each section has an independent error boundary — one broken section does not crash the page
6. Page requires `analytics.view` permission (unauthorized users are redirected or see an error)
7. `npm run build` passes with zero TypeScript errors
8. `lsp_diagnostics` clean on all files changed in this epic

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on:

- `src/app/(admin)/admin/dashboard/page.tsx`
- `src/components/admin/dashboard/DashboardErrorCard.tsx`
- All 6 component files from T01-T06

### Out of Scope

- Society comparison table (uses `getSocietyComparison` — deferred to a future analytics tab)
- Guard leaderboard (uses `getGuardLeaderboard` — deferred to a future analytics tab)
- Financial overview section (uses `getFinancialOverview` — deferred to a future analytics tab)
- Operational metrics section (uses `getOperationalMetrics` — deferred to a future analytics tab)
- Export to CSV (V2)
- Keyboard shortcuts / command palette (V2)
