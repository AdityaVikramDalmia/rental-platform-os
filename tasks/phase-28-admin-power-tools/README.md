# Phase 28: Admin Power Tools (P28)

## Overview

Make the admin panel feel like Linear, Vercel, or Stripe. Phase 27 filled all the data gaps and made every page functional. Phase 28 adds the efficiency layer: a command palette for instant navigation, keyboard shortcuts for power users, clickable drill-downs on the dashboard, bulk actions for high-volume ops work, and inline row actions with CSV export. **Mostly frontend-only** — minimal new backend work.

## Context

After Phase 27, the admin panel has complete data on every page. But navigating between pages still requires clicking through the sidebar, bulk operations require opening each record individually, and the dashboard is read-only. This phase closes the gap between "functional" and "fast." The target is an admin who can triage 50 leads, approve 10 payouts, and navigate to any page without touching the mouse.

## Dependencies

- P27 must be done (done — all admin pages have real data, all backend queries exist)
- P01-P09 must be done (done — all mutations exist for bulk actions)
- No new Convex schema changes needed
- One new shadcn/ui component install: `command` (E01-T01 only)

## Epics

| ID      | Title                                       | Tasks | Status  | Depends On | Priority |
| ------- | ------------------------------------------- | ----- | ------- | ---------- | -------- |
| P28-E01 | Command Palette + Global Search (⌘K)        | 4     | pending | []         | Critical |
| P28-E02 | Keyboard Shortcuts + Help System            | 3     | pending | []         | High     |
| P28-E03 | Dashboard Drill-Down + Clickable Everything | 4     | pending | []         | High     |
| P28-E04 | Bulk Actions Framework                      | 4     | pending | []         | High     |
| P28-E05 | Inline Table Actions + CSV Export           | 4     | pending | []         | Medium   |

## Completion Criteria

- [ ] ⌘K / Ctrl+K opens a command palette from anywhere in the admin panel
- [ ] Command palette supports navigation to all 11 admin pages with icons and keyboard hints
- [ ] Command palette searches guards by name/phone, leads by flat number, societies by name
- [ ] Command palette shows recently used items (localStorage, max 5)
- [ ] `G→L`, `G→D`, `G→G`, `G→V`, `G→P`, `G→S` chord shortcuts navigate to respective pages
- [ ] `?` key opens a keyboard shortcuts help dialog
- [ ] All 7 KPI cards on the dashboard are clickable links to filtered list pages
- [ ] Funnel chart stages are clickable links to filtered lead list
- [ ] Status breakdown rows are clickable links to filtered list pages
- [ ] Lead table has row checkboxes + bulk Verify / Reject / Request Info actions
- [ ] Payout table has row checkboxes + bulk Approve / Void actions
- [ ] `BulkActionBar` component is reusable and animates in/out
- [ ] Lead table rows show hover action buttons (Verify, Reject, Need Info, More)
- [ ] Payout table rows show hover action buttons (Approve, Void, Details)
- [ ] All 7 list pages have an "Export CSV" button that downloads currently visible data
- [ ] `npm run build` passes with zero errors
- [ ] `lsp_diagnostics` clean on all changed files

## Key Files Reference

| What                        | File                                                           | Notes                                                                            |
| --------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Admin layout client         | `src/app/(admin)/admin-layout-client.tsx`                      | Add ⌘K trigger button to header; mount CommandPalette + shortcut hooks           |
| Dashboard page              | `src/app/(admin)/admin/dashboard/page.tsx`                     | KPI cards, funnel chart, status breakdowns — all need click handlers             |
| Dashboard KPI cards         | `src/components/admin/dashboard/DashboardKPICards.tsx`         | Wrap each card in Next.js Link                                                   |
| Dashboard funnel chart      | `src/components/admin/dashboard/DashboardFunnelChart.tsx`      | Add onClick to chart bars                                                        |
| Dashboard status breakdowns | `src/components/admin/dashboard/DashboardStatusBreakdowns.tsx` | Add Link to each status row                                                      |
| Dashboard recent activity   | `src/components/admin/dashboard/DashboardRecentActivity.tsx`   | Add "View All" links                                                             |
| Lead list page              | `src/app/(admin)/admin/leads/page.tsx`                         | Add checkboxes, BulkActionBar, hover actions, Export CSV                         |
| Payout list page            | `src/app/(admin)/admin/payouts/page.tsx`                       | Add checkboxes, BulkActionBar, hover actions, Export CSV                         |
| Verification table          | `src/components/admin/VerificationTable.tsx`                   | Enhance with BulkActionBar pattern (P27-E04 added some bulk ops already)         |
| Leads mutations             | `convex/leads.ts` + `convex/verifications.ts`                  | `verifications.create`, `reject`, `requestInfo` mutations — used by bulk actions |
| Payouts mutations           | `convex/payouts.ts`                                            | `approve`, `voidPayout` mutations — used by bulk actions                         |
| Constants                   | `lib/constants.ts`                                             | `LEAD_STATUS`, `PAYOUT_STATUS`, permission strings                               |

## Backend Queries Available (minimal new backend work)

| Query / Mutation                | File                      | Used By                                                            |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| `api.leads.list`                | `convex/leads.ts`         | E01-T03 entity search (guards/leads/societies), E05-T04 CSV export |
| `api.guards.list`               | `convex/guards.ts`        | E01-T03 entity search (guards by name/phone)                       |
| `api.societies.list`            | `convex/societies.ts`     | E01-T03 entity search (societies by name)                          |
| `api.verifications.create`      | `convex/verifications.ts` | E04-T02 bulk verify                                                |
| `api.leads.reject`              | `convex/leads.ts`         | E04-T02 bulk reject                                                |
| `api.leads.requestInfo`         | `convex/leads.ts`         | E04-T02 bulk request info                                          |
| `api.payouts.approve`           | `convex/payouts.ts`       | E04-T03 bulk approve                                               |
| `api.payouts.voidPayout`        | `convex/payouts.ts`       | E04-T03 bulk void                                                  |
| `api.analytics.getOverviewKPIs` | `convex/analytics.ts`     | E03-T01 KPI card link targets (status filter values)               |

**Note on E01-T03 (entity search)**: Check whether `api.guards.list`, `api.leads.list`, and `api.societies.list` already accept a `search` or `query` argument. If they do, use them directly. If not, a lightweight `searchGuards`, `searchLeads`, `searchSocieties` query may need to be added to the respective Convex files — this is the only potential backend work in this phase.
