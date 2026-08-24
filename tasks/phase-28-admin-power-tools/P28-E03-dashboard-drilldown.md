---
id: P28-E03
title: Dashboard Drill-Down + Clickable Everything
phase: 28
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P28-E03: Dashboard Drill-Down + Clickable Everything

## Overview

Make the admin dashboard interactive. Every KPI card, every funnel chart bar, every status breakdown row, and every recent activity table gets a "View All" link. Clicking any of these navigates to the relevant filtered list page. The dashboard goes from a read-only summary to a launchpad for ops work. All changes are frontend-only — no backend modifications.

## Task Queue

- [x] P28-E03-T01: Make KPI cards clickable with hover effects
- [x] P28-E03-T02: Make funnel chart stages clickable with hover highlight
- [x] P28-E03-T03: Make status breakdown rows clickable with chevron icons
- [x] P28-E03-T04: Add "View All" links to Recent Activity tables

---

## T01: Make KPI Cards Clickable with Hover Effects

### Objective

Wrap each of the 7 KPI cards in `DashboardKPICards.tsx` with a Next.js `Link` so clicking navigates to the relevant filtered list page. Add a hover effect (subtle scale + shadow) and `cursor-pointer` to signal interactivity.

### Required Reading

- `src/components/admin/dashboard/DashboardKPICards.tsx` — Read the full file before editing. Understand the current card structure (shadcn/ui `Card` components, props, data shape).
- `notes/13-constants-reference.md` — `LEAD_STATUS`, `GUARD_STATUS`, `PAYOUT_STATUS` enum values (needed for filter URL params)
- `notes/06-admin-panel-ux.md` — "Global Layout" section (admin URL structure)

### Key Rules

1. Read `src/components/admin/dashboard/DashboardKPICards.tsx` fully before making any changes.
2. Wrap each card's outer `Card` element with `import Link from "next/link"`. The `Link` wraps the entire card so the whole card is clickable, not just a button inside it.
3. Link targets for each KPI card:
   - "Total Leads" → `/admin/leads`
   - "Verified Rate" → `/admin/leads?status=VERIFIED`
   - "Active Guards" → `/admin/guards?status=ACTIVE`
   - "Active Societies" → `/admin/societies?status=ACTIVE`
   - "Pending Payouts" → `/admin/payouts?status=pending`
   - "Total Paid Out" → `/admin/payouts?status=disbursed`
   - "Conversion Rate" → `/admin/leads` (no specific filter — conversion is a summary metric)
4. Hover effect: add Tailwind classes to the `Card` element: `transition-all duration-150 hover:scale-[1.02] hover:shadow-md cursor-pointer`. Do NOT use inline styles.
5. The `Link` component must have `className="block"` so it fills the card's grid cell correctly (block-level, not inline).
6. Do NOT add a separate "View →" text inside the card — the entire card is the link. Keep the card content exactly as it is.
7. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardKPICards.tsx` — Updated so each card is wrapped in a `Link` with correct filter URL and hover effect classes

### Acceptance Criteria

1. All 7 KPI cards are clickable and navigate to the correct filtered list page
2. Hovering a card shows a subtle scale + shadow effect
3. Cursor changes to pointer on hover
4. Card content (icon, label, value, trend) is unchanged
5. Cards still render correctly in the loading (skeleton) state — skeletons are not wrapped in Links
6. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardKPICards.tsx`.

### Out of Scope

- Changing the card layout or content
- Adding tooltips to cards (V2)
- Animated count-up on card values (V2)
- Drill-down modal on card click (V2 — navigate to list page instead)

---

## T02: Make Funnel Chart Stages Clickable with Hover Highlight

### Objective

Update `DashboardFunnelChart.tsx` so each funnel stage bar is clickable and navigates to `/admin/leads?status={stage}`. Add a hover highlight on chart bars and a tooltip that says "Click to view X leads".

### Required Reading

- `src/components/admin/dashboard/DashboardFunnelChart.tsx` — Read the full file before editing. Understand the current Recharts implementation (which chart type, how bars are rendered, what data shape looks like).
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum values (SUBMITTED, VERIFIED, etc.) — the URL param values must match these exactly
- `notes/04-state-machines.md` — Lead status section (confirm which statuses map to which funnel stages)

### Key Rules

1. Read `src/components/admin/dashboard/DashboardFunnelChart.tsx` fully before making any changes.
2. The funnel stages and their URL filter values:
   - SUBMITTED → `/admin/leads?status=SUBMITTED`
   - VERIFIED → `/admin/leads?status=VERIFIED`
   - LISTING → `/admin/leads?status=VERIFIED` (listings are linked to verified leads — navigate to verified leads as the closest proxy)
   - VISIT → `/admin/visits`
   - CLOSURE → `/admin/closures`
   - DISBURSED → `/admin/payouts?status=disbursed`
3. Use Recharts' `onClick` prop on the `Bar` component (or `Cell` components if individual bars are rendered). The click handler receives the bar's data payload — extract the stage name and call `router.push(url)`. Use `useRouter` from `next/navigation`.
4. Hover highlight: use Recharts' `activeBar` prop on `Bar` to change the fill color on hover. Set `activeBar={{ fill: "#6366f1" }}` (indigo) or a color that contrasts with the default bar color. Alternatively, use `Cell` components with conditional fill based on `activeIndex` state.
5. Custom tooltip: use Recharts' `content` prop on `Tooltip` to render a custom tooltip component. The tooltip shows: stage name, count, and "Click to view" text. Example: `"SUBMITTED — 42 leads — Click to view"`.
6. Add `cursor="pointer"` to the `Bar` component so the cursor changes on hover.
7. Do NOT use `useRouter` at the top level of the component if the component is a Server Component — ensure `"use client"` is at the top of the file.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardFunnelChart.tsx` — Updated with click handlers on bars, hover highlight, custom tooltip with "Click to view" text

### Acceptance Criteria

1. Clicking a funnel bar navigates to the correct filtered page
2. Hovering a bar changes its fill color (hover highlight)
3. Hovering a bar shows a tooltip with stage name, count, and "Click to view" text
4. Cursor is `pointer` on bar hover
5. Chart still renders correctly in loading and empty states
6. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardFunnelChart.tsx`.

### Out of Scope

- Drill-down into a sub-funnel on click (V2)
- Animated bar transitions (V2)
- Society-level funnel filtering (V2)
- Changing the chart type or layout

---

## T03: Make Status Breakdown Rows Clickable with Chevron Icons

### Objective

Update `DashboardStatusBreakdowns.tsx` so each status row is a clickable link to the filtered list page for that entity + status combination. Add a `ChevronRight` icon that appears on hover to signal interactivity.

### Required Reading

- `src/components/admin/dashboard/DashboardStatusBreakdowns.tsx` — Read the full file before editing. Understand the current row structure (how statuses are rendered, what data shape looks like).
- `notes/13-constants-reference.md` — `LEAD_STATUS`, `VISIT_STATUS`, `PAYOUT_STATUS` enum values and their exact string values (needed for URL params)
- `notes/06-admin-panel-ux.md` — Admin URL structure for leads, visits, payouts list pages

### Key Rules

1. Read `src/components/admin/dashboard/DashboardStatusBreakdowns.tsx` fully before making any changes.
2. Wrap each status row with `import Link from "next/link"`. The link target is the filtered list page:
   - Lead statuses → `/admin/leads?status={STATUS_VALUE}`
   - Visit statuses → `/admin/visits?status={STATUS_VALUE}`
   - Payout statuses → `/admin/payouts?status={STATUS_VALUE}`
     The `STATUS_VALUE` in the URL must match the exact enum string from `lib/constants.ts` (e.g., `SUBMITTED`, `pending`, `ASSIGNED`).
3. Add a `ChevronRight` icon (from `lucide-react`) to the right side of each status row. The icon is hidden by default and visible on hover using Tailwind's `group` + `group-hover:opacity-100 opacity-0` pattern:
   ```tsx
   <Link href={url} className="group flex items-center justify-between ...">
     <div>{/* badge + label + count */}</div>
     <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
   </Link>
   ```
4. Add `hover:bg-muted/50 rounded-md transition-colors` to each row's `Link` for a subtle background highlight on hover.
5. The `Link` must have `className="block"` or `flex` so it fills the row width correctly.
6. Zero-count rows are still shown (per P27-E01-T05 rules) and are still clickable — navigating to a filtered view with 0 results is valid.
7. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardStatusBreakdowns.tsx` — Updated so each status row is a `Link` with correct filter URL, hover background, and `ChevronRight` icon

### Acceptance Criteria

1. Clicking any lead status row navigates to `/admin/leads?status={STATUS}`
2. Clicking any visit status row navigates to `/admin/visits?status={STATUS}`
3. Clicking any payout status row navigates to `/admin/payouts?status={STATUS}`
4. `ChevronRight` icon is hidden by default and visible on row hover
5. Row has a subtle background highlight on hover
6. Zero-count rows are still clickable
7. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardStatusBreakdowns.tsx`.

### Out of Scope

- Changing the status badge colors or layout
- Adding count trend indicators to rows (V2)
- Filtering by multiple statuses simultaneously (V2)

---

## T04: Add "View All" Links to Recent Activity Tables

### Objective

Update `DashboardRecentActivity.tsx` to add a "View All →" link in the header of each of the 3 activity tables (Leads, Visits, Payouts). Each link navigates to the respective list page sorted by newest first.

### Required Reading

- `src/components/admin/dashboard/DashboardRecentActivity.tsx` — Read the full file before editing. Understand the current table structure (how each of the 3 tables is rendered, what the section headers look like).
- `notes/06-admin-panel-ux.md` — Admin URL structure for leads, visits, payouts list pages

### Key Rules

1. Read `src/components/admin/dashboard/DashboardRecentActivity.tsx` fully before making any changes.
2. Each table section has a heading (e.g., "Recent Leads"). Add a "View All →" link to the right of that heading, on the same line. Use `flex justify-between items-center` on the heading row.
3. Link targets:
   - Leads "View All →" → `/admin/leads?sort=newest`
   - Visits "View All →" → `/admin/visits?sort=newest`
   - Payouts "View All →" → `/admin/payouts?sort=newest`
4. Style the "View All →" link: `text-sm text-primary hover:underline font-medium`. Use `import Link from "next/link"`.
5. The arrow `→` is a literal character in the link text, not a lucide icon. Keep it simple.
6. Do NOT change the table content, columns, row click behavior, or loading/empty states — only add the header link.
7. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/dashboard/DashboardRecentActivity.tsx` — Updated with "View All →" links in each table section header

### Acceptance Criteria

1. Each of the 3 table sections shows a "View All →" link in the header row
2. "Leads" View All links to `/admin/leads?sort=newest`
3. "Visits" View All links to `/admin/visits?sort=newest`
4. "Payouts" View All links to `/admin/payouts?sort=newest`
5. Link is styled with `text-primary` color and underlines on hover
6. Table content, row click behavior, and loading/empty states are unchanged
7. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/DashboardRecentActivity.tsx`.

### Out of Scope

- Changing the table columns or row content
- Adding "View All" links to other dashboard sections (KPI cards have their own links from T01)
- Implementing the `?sort=newest` filter on the list pages (that's handled by the existing sort infrastructure from P27-E06)
