# Phase 29: Ops Intelligence (P29)

## Overview

Make the platform smart. Give the ops manager superpowers by surfacing the right information at the right time — SLA timers that warn before breaches happen, a priority-scored lead queue that tells the ops manager what to work on next, conflict-aware visit scheduling, and a morning briefing that summarizes the day in seconds.

All intelligence is computed from existing data. No new database tables. Pure aggregation, scoring, and presentation.

## Context

After Phase 27 (Admin Polish), the admin panel has complete data coverage but no intelligence layer. An ops manager still has to manually scan tables to find the oldest unverified lead, check if a guard is double-booked, or count how many SLA breaches exist. This phase adds that intelligence layer on top of the existing data.

## Dependencies

- P27 must be done (done — admin panel is complete, all backend queries exist)
- P09 must be done (done — payouts exist for SLA tracking)
- P07 must be done (done — visits exist for conflict detection)
- P04 must be done (done — leads exist for priority scoring)
- No new database tables needed — all data comes from existing tables

## Architecture Guardrails

- **SLA list rendering avoids N+1**: SLA status/countdown on lead/payout/verification list rows is computed client-side from timestamps already present in each list query response. `SLABadge` must not issue per-row query hooks.
- **Payout statuses are lowercase**: `pending`, `approved`, `disbursed`, `failed`, `voided`.

## Index Strategy Summary

- P29-E01: Uses existing indexes (`leads.by_status`, `payouts.by_status`, `audit_logs.by_entity`). No new index.
- P29-E02: Uses existing indexes (`leads.by_status` / `leads.by_society_and_status`, `owner_verifications.by_lead_id`). No new index.
- P29-E03: Adds one new composite index for conflict checks: `visits.by_assigned_guard_id_and_scheduled_start`.
- P29-E04: Uses existing indexes (`leads.by_status`, `payouts.by_status`, `visits.by_scheduled_start`). No new index.

## Epics

| ID      | Title                                  | Tasks | Status  | Depends On | Priority |
| ------- | -------------------------------------- | ----- | ------- | ---------- | -------- |
| P29-E01 | SLA Timers + Aging Alerts              | 4     | pending | []         | Critical |
| P29-E02 | Lead Priority Scoring + Smart Queue    | 3     | pending | [P29-E01]  | High     |
| P29-E03 | Visit Scheduling Intelligence          | 4     | pending | []         | High     |
| P29-E04 | Morning Briefing + Notification Center | 4     | pending | [P29-E01]  | Medium   |

## Completion Criteria

- [ ] SLA policies defined in `lib/constants.ts` with `SLAPolicy` and `SLAStatus` types
- [ ] `convex/sla.ts` query computes ON_TRACK / WARNING / BREACHED status for leads, visits, and payouts
- [ ] `SLABadge` component renders countdown with color coding and pulse animation on BREACHED
- [ ] SLA column appears in lead table, payout table, and verification table
- [ ] SLA list rows use timestamps returned by existing list queries; no per-row SLA query hooks
- [ ] Dashboard alerts card shows SLA breach count with clickable link to filtered list
- [ ] Lead priority score (0-100) computed and returned alongside lead list results
- [ ] `PriorityBadge` component renders HIGH / MEDIUM / LOW with correct colors
- [ ] Lead table has "Sort by Priority" option; default sort is priority DESC then age DESC
- [ ] Smart Queue widget on verification page shows top 10 priority leads with inline actions
- [ ] Guard conflict detection query returns existing visits within ±2 hours of proposed time
- [ ] Visit scheduling UI shows amber warning banner when conflicts exist (soft warning, not hard block)
- [ ] "Today's Visits" timeline card renders on dashboard with color-coded status
- [ ] `getMorningBriefing` query aggregates all urgent counts in one call
- [ ] `MorningBriefingCard` renders above KPI cards, shows only 6 AM - 12 PM, falls back to "Current Status"
- [ ] `NotificationBell` in admin header shows unread count and popover with recent items
- [ ] `npx tsc --noEmit` passes with zero errors after each epic

## Key Files Reference

| What                     | File                                                           | Notes                                                |
| ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------- |
| SLA constants            | `lib/constants.ts`                                             | Add `SLAPolicy`, `SLAStatus`, `SLA_POLICIES` here    |
| SLA backend              | `convex/sla.ts`                                                | New file — pure computation, no DB writes            |
| Lead scoring             | `convex/leads.ts` or `convex/leadScoring.ts`                   | Add `computeLeadPriority` helper + extend list query |
| Visit conflict detection | `convex/visits.ts`                                             | Add `checkGuardConflicts` query                      |
| Visit by date query      | `convex/visits.ts`                                             | Add `getVisitsByDate` query                          |
| Morning briefing         | `convex/briefing.ts`                                           | New file — pure aggregation query                    |
| SLA badge component      | `src/components/admin/SLABadge.tsx`                            | New shared admin component                           |
| Priority badge component | `src/components/admin/PriorityBadge.tsx`                       | New shared admin component                           |
| Smart queue widget       | `src/components/admin/SmartQueue.tsx`                          | New component for verification page                  |
| Today's visits card      | `src/components/admin/dashboard/TodaysVisitsCard.tsx`          | New dashboard component                              |
| Morning briefing card    | `src/components/admin/dashboard/MorningBriefingCard.tsx`       | New dashboard component, renders above KPI cards     |
| Notification bell        | `src/components/admin/NotificationBell.tsx`                    | New header component                                 |
| Dashboard page           | `src/app/(admin)/admin/dashboard/page.tsx`                     | Wire MorningBriefingCard above KPI cards             |
| Admin layout client      | `src/app/(admin)/admin-layout-client.tsx`                      | Wire NotificationBell into header                    |
| Verification page        | `src/app/(admin)/admin/verification/page.tsx`                  | Wire SmartQueue widget above verification table      |
| Lead list page           | `src/app/(admin)/admin/leads/page.tsx`                         | Add SLA column + priority badge + sort by priority   |
| Payout list page         | `src/app/(admin)/admin/payouts/page.tsx`                       | Add SLA column                                       |
| Verification table       | `src/components/admin/VerificationTable.tsx`                   | Add SLA column                                       |
| Alerts component         | `src/components/admin/dashboard/DashboardAlertsAndActions.tsx` | Add SLA breach summary card                          |

## Backend Queries Available (existing — no changes needed)

| Query                           | File                  | What It Returns                                                    |
| ------------------------------- | --------------------- | ------------------------------------------------------------------ |
| `api.leads.list`                | `convex/leads.ts`     | Paginated leads with filters (extend to include priority score)    |
| `api.visits.list`               | `convex/visits.ts`    | Paginated visits with filters                                      |
| `api.payouts.list`              | `convex/payouts.ts`   | Paginated payouts with filters                                     |
| `api.auditLogs.list`            | `convex/auditLogs.ts` | Audit events — used to find status-change timestamps for SLA start |
| `api.analytics.getOverviewKPIs` | `convex/analytics.ts` | Overview counts — used by morning briefing                         |
