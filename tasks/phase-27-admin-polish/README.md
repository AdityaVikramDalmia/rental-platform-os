# Phase 27: Admin Panel Polish & Completeness (P27)

## Overview

Fill all placeholder gaps, enhance detail pages with real data, overhaul the dashboard into a full ops command center, create the standalone verification page, fix cross-entity navigation, and polish list pages. **All frontend-only work** — every backend query already exists.

## Context

Phases 1-9, 13, and 14 implemented core features but left behind stale placeholder tabs, an empty dashboard, a disabled verification sidebar item, and disconnected entity navigation. A comprehensive audit (Feb 2026) found 24 specific gaps across the admin panel. This phase closes all of them.

## Dependencies

- P01-P09 must be done (all are done)
- P13 must be done (done — audit trail)
- P14 must be done (done — i18n, guard portal only)
- No backend changes needed — all Convex queries exist

## Epics

| ID      | Title                                                            | Tasks | Status | Depends On | Priority |
| ------- | ---------------------------------------------------------------- | ----- | ------ | ---------- | -------- | ----------------------- |
| P27-E01 | Dashboard Overhaul — Full Ops Command Center                     | 7     | done   | []         | Critical | ✅ Completed — Feb 2026 |
| P27-E02 | Guard Detail — Real Tab Content (Leads, Visits, Earnings, Audit) | 5     | done   | []         | Critical | ✅ Completed — Feb 2026 |
| P27-E03 | Society Detail — Leads Tab + Enhancements                        | 5     | done   | []         | Critical | ✅ Completed — Feb 2026 |
| P27-E04 | Verification Page + Sidebar Fix                                  | 5     | done   | []         | Critical | ✅ Completed — Feb 2026 |
| P27-E05 | Cross-Entity Navigation & Linking                                | 4     | done   | []         | Medium   | ✅ Completed — Feb 2026 |
| P27-E06 | List Page Polish (Sorting, Badges, Pagination Info)              | 4     | done   | []         | Low      | ✅ Completed — Feb 2026 |

## Completion Criteria

- [ ] Dashboard shows KPI cards, lead funnel, trend chart, recent activity, status breakdowns, alerts, and quick actions with time window selector
- [ ] Guard detail page has 8 working tabs (no placeholders)
- [ ] Society detail page has working Leads tab with real data + activity feed + guard perf + listing stats + quick actions
- [ ] Verification page exists at `/admin/verification` and is accessible from sidebar (no "Soon" badge)
- [ ] All entity names in detail panels are clickable links to their detail pages
- [ ] All list pages have column sorting and "Showing X of Y" pagination info
- [ ] Sidebar shows badge counts for leads (SUBMITTED), visits (today), payouts (PENDING)
- [ ] `npm run build` passes with zero errors
- [ ] `lsp_diagnostics` clean on all changed files

## Key Files Reference (from audit)

| What                 | File                                                                 | Notes                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard page       | `src/app/(admin)/admin/dashboard/page.tsx`                           | Currently 124 lines, only welcome card                                                                                                                |
| Analytics queries    | `convex/analytics.ts`                                                | 7 queries ready: getOverviewKPIs, getLeadFunnel, getLeadTrend, getSocietyComparison, getGuardLeaderboard, getFinancialOverview, getOperationalMetrics |
| Guard detail         | `src/app/(admin)/admin/guards/[id]/page.tsx`                         | 749 lines, 4 placeholder tabs at lines 560, 564, 568, 665                                                                                             |
| Society detail       | `src/app/(admin)/admin/societies/[id]/page.tsx`                      | Placeholder at line 231 (Leads), 232 (Analytics)                                                                                                      |
| Sidebar nav          | `src/app/(admin)/admin-layout-client.tsx`                            | Verification at line 67 with `available: false`                                                                                                       |
| Lead detail panel    | `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx`       | Society/building not clickable                                                                                                                        |
| Visit detail panel   | `src/app/(admin)/admin/visits/components/visit-detail-panel.tsx`     | Guard/lead not clickable                                                                                                                              |
| Closure detail panel | `src/app/(admin)/admin/closures/components/closure-detail-panel.tsx` | Guard/lead not clickable                                                                                                                              |
| Payout detail panel  | `src/app/(admin)/admin/payouts/components/payout-detail-panel.tsx`   | Guard not clickable, lead link is generic                                                                                                             |
| Verification backend | `convex/verifications.ts`                                            | listByLead + create — fully implemented                                                                                                               |
| Audit backend        | `convex/auditLogs.ts`                                                | list + getByEntity — fully implemented                                                                                                                |

## Backend Queries Available (NO new backend work needed)

| Query                                 | File                      | What It Returns                                                                                               |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `api.analytics.getOverviewKPIs`       | `convex/analytics.ts`     | total_leads, verified_rate, active_guards, active_societies, pending_payouts, total_paid_out, conversion_rate |
| `api.analytics.getLeadFunnel`         | `convex/analytics.ts`     | SUBMITTED → VERIFIED → LISTING → VISIT → CLOSURE → DISBURSED counts + drop-off %                              |
| `api.analytics.getLeadTrend`          | `convex/analytics.ts`     | Daily lead counts for chart (last N days)                                                                     |
| `api.analytics.getSocietyComparison`  | `convex/analytics.ts`     | Per-society metrics                                                                                           |
| `api.analytics.getGuardLeaderboard`   | `convex/analytics.ts`     | Top guards by leads/visits/earnings                                                                           |
| `api.analytics.getFinancialOverview`  | `convex/analytics.ts`     | Bounties, payouts, brokerage                                                                                  |
| `api.analytics.getOperationalMetrics` | `convex/analytics.ts`     | Avg times (verify, visit, close)                                                                              |
| `api.leads.list`                      | `convex/leads.ts`         | Paginated leads with filters                                                                                  |
| `api.visits.list`                     | `convex/visits.ts`        | Paginated visits with filters                                                                                 |
| `api.payouts.list`                    | `convex/payouts.ts`       | Paginated payouts with filters                                                                                |
| `api.verifications.listByLead`        | `convex/verifications.ts` | Verification attempts for a lead                                                                              |
| `api.auditLogs.list`                  | `convex/auditLogs.ts`     | Audit events with filters                                                                                     |
