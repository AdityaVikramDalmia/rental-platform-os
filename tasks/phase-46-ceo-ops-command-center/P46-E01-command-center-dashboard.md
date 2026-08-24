---
id: P46-E01
title: Command Center Dashboard
phase: 46
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-21
---

# P46-E01: Command Center Dashboard

## Overview

Build the core `/admin/ops-command-center` surface as a CEO/Ops Head operational cockpit with two-tier views, team health heatmap, active fires, celebration feed, and summary cards. This epic establishes the route shell, section-level component boundaries, and backend query contracts that later epics extend with targets, warnings, and check-ins.

## Prerequisites

- P30 OPS persona and quality-score foundations must be complete.
- P12 analytics dashboard patterns should be reused for cards/charts/loading/error states.
- Existing admin navigation conventions must remain intact (`ADMIN_NAV_ITEMS` + permission-gated sidebar rendering).
- New backend functions for this epic live in `convex/opsManagement.ts` and must import `query`/`mutation` wrappers from `convex/functions.ts`.

## Task Queue

- [x] P46-E01-T01: Command Center Route and Page Shell
- [x] P46-E01-T02: Team Health Heatmap
- [x] P46-E01-T03: Fires to Fight Panel
- [x] P46-E01-T04: Wins and Celebrations Panel
- [x] P46-E01-T05: Pipeline Overview and Summary Cards
- [x] P46-E01-T06: Pipeline Aging View

---

## T01: Command Center Route and Page Shell

### Objective

Create the command center route, permission gate, tier toggle state, and section skeleton framework so the page is navigable and ready for incremental data section wiring.

### Estimated Effort

M

### Required Reading

- `notes/06-admin-panel-ux.md` - dashboard/table layout conventions and admin navigation behavior
- `notes/03-roles-and-permissions.md` - permission gate patterns and backoffice access model
- `src/app/(admin)/admin/dashboard/page.tsx` - baseline admin page composition patterns
- `src/components/admin/admin-nav-items.ts` - sidebar nav item registration format
- `src/app/(admin)/admin-layout-client.tsx` - admin layout permission behavior and active-link handling

### Key Rules

1. FIRST: add the 5 new OPS-management permissions to both `PERMISSIONS` and `ALL_PERMISSIONS` in `lib/constants.ts`: `ops_management.view`, `ops_management.set_targets`, `ops_management.issue_warnings`, `ops_management.write_checkins`, `ops_management.configure`.
2. Add `src/app/(admin)/admin/ops-command-center/page.tsx` as the canonical route.
3. Gate page access using `requirePermission(ctx, "ops_management.view")` in server-side data access flow.
4. Implement two-tier switch (`CEO` / `OPS_HEAD`) using URL search params (no local-only state).
5. Add section-level skeleton/loading placeholders for heatmap, fires, celebrations, and summary cards.
6. Add sidebar nav entry under admin navigation with permission-gated visibility.
7. Preserve existing desktop-first admin layout patterns and shadcn/ui conventions.
8. Add OPS self-service read-query contracts in `convex/opsManagement.ts`: `getMyTargets`, `getMyWarnings`, `getMyCheckIns`, each using `requireFieldWorker(ctx)` and requiring no management permission.

### Deliverables

- [ ] `lib/constants.ts` - add 5 OPS-management permissions to `PERMISSIONS` and `ALL_PERMISSIONS` before route/backend wiring
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - route shell, tier toggle handling, section placeholders
- [ ] `src/components/admin/admin-nav-items.ts` - new "Ops Command Center" nav item with permission gate
- [ ] `src/app/(admin)/admin-layout-client.tsx` - optional shortcut routing hooks/update if required by nav behavior
- [ ] `convex/opsManagement.ts` - `getMyTargets`, `getMyWarnings`, `getMyCheckIns` self-service read queries using `requireFieldWorker(ctx)`

### Acceptance Criteria

1. `/admin/ops-command-center` renders successfully for authorized backoffice users.
2. Unauthorized users are blocked via permission gate.
3. `view=ceo|ops_head` URL state controls tier selection deterministically.
4. Sidebar link is visible only with the required permission and routes correctly.
5. OPS users can call `getMyTargets`, `getMyWarnings`, and `getMyCheckIns` without management permissions.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/ops-command-center/page.tsx`, `src/components/admin/admin-nav-items.ts`, and `src/app/(admin)/admin-layout-client.tsx` if modified.

### Out of Scope

- KPI target CRUD logic
- Warning lifecycle operations
- Weekly check-in forms/history

---

## T02: Team Health Heatmap

### Objective

Implement a visual team-health grid that summarizes each OPS agent's quality, target performance, warning load, and recency of review, with click-through profile context.

### Estimated Effort

L

### Required Reading

- `notes/features/20-ops-portal.md` - OPS persona data model and role boundaries
- `notes/features/22-incentive-v2.md` - quality score signal definitions
- `notes/10-convex-schema.md` - users/incentive/check-in/warning table conventions
- `src/components/admin/dashboard/FreshnessSummaryCard.tsx` - card rendering and color semantics in admin dashboard

### Key Rules

1. Create `TeamHealthHeatmap.tsx` in a new `src/components/admin/ops-command-center/` directory.
2. Add `opsManagement.getTeamHealthHeatmap` query in `convex/opsManagement.ts` to aggregate OPS agents and health metrics.
3. OPS agents are sourced from `users` with `user_type = OPS` and active/non-deleted eligibility.
4. Quality score source must come from `incentives.getLeaderboard` output (quality_score per agent) or `guard_profiles.quality_score` directly; do not introduce/use `incentives.getQualitySnapshot`.
5. If `quality_score` is null/undefined, display `N/A`, exclude that agent from quality-based coloring/threshold checks, and treat the overall card status as YELLOW (missing data is not underperformance).
6. Color mapping must follow exact business rules: RED (active warning OR >50% targets missed), YELLOW (any target <80% OR quality <60 OR quality missing), GREEN (otherwise healthy).
7. Agents with missing quality score must be excluded from quality-based auto-warning triggers.
8. Each agent card must be clickable and open an agent profile sheet/detail panel.
9. Return `lastCheckInAt` and summary warning counts to support follow-up actions.
10. `getTeamHealthHeatmap` must return `previous_period_values` for each tracked metric and frontend cards must render period-over-period delta in `72 ▲+8` style, with direction-aware colors (green improving, red declining, gray unchanged).
11. Query response must include `active_caseload` per agent (active leads assigned to agent + scheduled/in-progress visits + open negotiations where `ops_user_id = agent`). Compare against `caseload_threshold` config (default `15`) and show `⚠️ Overloaded` badge when exceeded.

### Deliverables

- [ ] `src/components/admin/ops-command-center/TeamHealthHeatmap.tsx` - health grid and card click handling
- [ ] `src/components/admin/ops-command-center/AgentProfileSheet.tsx` - per-agent detail sheet used by heatmap and other panels
- [ ] `convex/opsManagement.ts` - `getTeamHealthHeatmap` query and aggregation helpers including `previous_period_values` and `active_caseload`
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate heatmap section

### Acceptance Criteria

1. Heatmap renders all OPS agents with quality, target progress, warning summary, and last check-in metadata.
2. Color-coding matches RED/YELLOW/GREEN rules exactly.
3. Clicking any card opens the agent profile sheet with agent-level details.
4. Data refreshes reactively when underlying records change.
5. Agents without quality scores display `N/A`, render as YELLOW, and are excluded from quality-based auto-warning triggers.
6. Heatmap cards render direction-aware delta indicators from `previous_period_values` in `value + arrow + delta` format.
7. Agents above `caseload_threshold` show `⚠️ Overloaded` and cards surface `active_caseload` consistently.
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all new/changed files under `src/components/admin/ops-command-center/`, `src/app/(admin)/admin/ops-command-center/page.tsx`, and `convex/opsManagement.ts`.

### Out of Scope

- Target-edit dialogs
- Warning issue/resolve actions
- Weekly check-in note creation UI

---

## T03: Fires to Fight Panel

### Objective

Build an actionable priority queue of operational risks requiring immediate intervention, with severity ranking and quick actions.

### Estimated Effort

L

### Required Reading

- `notes/features/19-rent-negotiation.md` - stale negotiation contexts and escalation semantics
- `notes/features/10-analytics.md` - alert-card ranking and aggregation patterns
- `notes/04-state-machines.md` - visit and negotiation status rules used in fire detection
- `convex/negotiations.ts` - negotiation status/query source contracts
- `convex/visits.ts` - visit scheduling/completion data needed for missed-visit signals

### Key Rules

1. Implement `FiresPanel.tsx` with severity badge + quick action controls.
2. Add `opsManagement.getFiresAlert` query that aggregates at least: active level-2+ warnings, stale negotiations (threshold from `system_config.negotiation_stale_days`), missed visits today, SLA breaches, overdue check-ins, and quality score <40.
3. Normalize fires into one typed response model: `id`, `severity`, `category`, `description`, `entityRef`, `actionLabel`, `actionHref`.
4. Sort by severity first and recency second.
5. Quick actions must route to concrete admin pages (e.g., warning timeline, negotiation detail, visit queue).
6. Use read-only query aggregation only; no mutation side-effects from this panel.
7. Each fire item returned by `getFiresAlert` must include `entity_details: Array<{ entity_type, entity_id, display_label, days_stuck, current_blocker, action_href }>` with top 3-5 concrete contributing records.
8. Fires panel must render `entity_details` as expandable rows with one-click navigation per record.

### Deliverables

- [ ] `src/components/admin/ops-command-center/FiresPanel.tsx` - prioritized risk panel with quick actions and expandable entity drill-down rows
- [ ] `convex/opsManagement.ts` - `getFiresAlert` query and source-specific fire mappers, including `entity_details`
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate fires section

### Acceptance Criteria

1. Panel shows mixed-source fire items sorted by severity.
2. Required categories appear when backing data exists.
3. Quick-action buttons navigate correctly to relevant workflows.
4. Empty-state behavior is explicit when no active fires exist.
5. Each fire item shows specific entity-level detail, not just counts.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/admin/ops-command-center/FiresPanel.tsx`, `src/app/(admin)/admin/ops-command-center/page.tsx`, and `convex/opsManagement.ts`.

### Out of Scope

- Auto-warning generation (handled in P46-E03)
- Target progress recomputation (handled in P46-E02)
- Notification dispatch side effects

---

## T04: Wins and Celebrations Panel

### Objective

Surface positive momentum signals (closures, target overachievement, streak milestones, and quality improvements) to reinforce OPS accountability and team morale.

### Estimated Effort

M

### Required Reading

- `notes/features/22-incentive-v2.md` - streak and quality movement semantics
- `notes/features/24-incentive-v3-overview.md` - gamification milestone patterns
- `convex/closures.ts` - confirmed closure event fields
- `convex/incentives.ts` - quality/streak source data contracts

### Key Rules

1. Create `CelebrationsPanel.tsx` with a last-7-days feed model.
2. Add `opsManagement.getCelebrations` query that pulls closures confirmed, exceeded targets, streak milestones/tier upgrades, and quality score step-ups.
3. Each feed row must include actor name, achievement text, timestamp, and deep-link target.
4. Keep event taxonomy typed so future badges/achievements can be appended without schema break.
5. Show a deterministic ordering (latest first) and cap list length for dashboard performance.

### Deliverables

- [ ] `src/components/admin/ops-command-center/CelebrationsPanel.tsx` - recent wins feed UI
- [ ] `convex/opsManagement.ts` - `getCelebrations` query and event normalization
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate celebrations section

### Acceptance Criteria

1. Panel shows last-7-day celebration items across all required categories.
2. Agent names and related entities are clickable where applicable.
3. Feed ordering and date formatting are consistent with admin dashboard conventions.
4. Empty state renders when no celebration items exist.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/admin/ops-command-center/CelebrationsPanel.tsx`, `src/app/(admin)/admin/ops-command-center/page.tsx`, and `convex/opsManagement.ts`.

### Out of Scope

- Reward payout logic
- Gamification rule changes
- New badge configuration UIs

---

## T05: Pipeline Overview and Summary Cards

### Objective

Build top-level command-center cards that summarize team target performance, warning burden, and review compliance with drill-down interactions.

### Estimated Effort

M

### Required Reading

- `notes/features/10-analytics.md` - KPI card and chart interaction patterns
- `src/components/admin/dashboard/DashboardKPICards.tsx` - existing summary card architecture
- `src/components/admin/dashboard/TimeWindowSelector.tsx` - time-window state patterns

### Key Rules

1. Add `TargetProgressSummary.tsx`, `WarningSummaryCard.tsx`, and `ReviewComplianceCard.tsx` under `src/components/admin/ops-command-center/`.
2. Reuse existing chart stack (Recharts) for donut/progress visualizations.
3. Add `opsManagement.getCommandCenterOverview` query with totals: OPS count, targets active/hit/missed, warnings by level, review compliance percentage.
4. Compose summary cards with `analytics.getOverviewKPIs` where existing KPIs are reused.
5. Card clicks must apply local filters/drill-down state for the corresponding section.
6. `getCommandCenterOverview` must return `cron_freshness` with last-run timestamps from system config keys `cron_compute_target_actuals_last_run`, `cron_auto_detect_warnings_last_run`, `cron_auto_expire_warnings_last_run`, and `cron_checkin_overdue_nudge_last_run`.
7. Frontend must render section-level `Last updated: Xm ago` freshness badges using `cron_freshness`, and show a page-top amber `⚠️ Data may be stale` banner when any required cron is stale beyond 26 hours.
8. `getCommandCenterOverview` must include `previous_period` comparison payload so summary cards display period-over-period delta values alongside current totals.

### Deliverables

- [ ] `src/components/admin/ops-command-center/TargetProgressSummary.tsx` - team target hit donut card
- [ ] `src/components/admin/ops-command-center/WarningSummaryCard.tsx` - warning-level summary card
- [ ] `src/components/admin/ops-command-center/ReviewComplianceCard.tsx` - check-in review compliance card shell
- [ ] `convex/opsManagement.ts` - `getCommandCenterOverview` query with `cron_freshness` and `previous_period` comparison data
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate top summary row, freshness badges, stale-data banner, and drill-down wiring

### Acceptance Criteria

1. All three summary cards render with live values.
2. Donut/progress charts use the existing admin visual language and are responsive.
3. Warning level and review compliance drill-down interactions update visible sections.
4. Overview query returns complete totals without duplicated counting.
5. Freshness indicators display per-section `Last updated` state and stale-warning banner appears when any tracked cron exceeds 26-hour freshness threshold.
6. Summary cards display current values with `previous_period` delta context.
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on new summary card files, `src/app/(admin)/admin/ops-command-center/page.tsx`, and `convex/opsManagement.ts`.

### Out of Scope

- Target creation/edit dialogs (P46-E02)
- Warning lifecycle actions (P46-E03)
- Weekly check-in form/history implementation (P46-E04)

---

## T06: Pipeline Aging View

### Objective

Add a Pipeline Aging view that exposes negotiation and visit stage aging so Ops Head users can quickly identify bottlenecks by stage and age distribution.

### Estimated Effort

L

### Required Reading

- `notes/features/19-rent-negotiation.md` - negotiation lifecycle statuses and stage semantics
- `notes/features/06-visit-management.md` - visit status flow and scheduling lifecycle context
- `notes/04-state-machines.md` - valid status sets for negotiations and visits
- `src/components/admin/guards/guard-visits-tab.tsx` - existing visit list/table rendering conventions

### Key Rules

1. Create `PipelineAgingView.tsx` under `src/components/admin/ops-command-center/` and render it in Ops Head mode on command center plus inside the agent profile pipeline tab.
2. Add `opsManagement.getAgentPipelineAging` query in `convex/opsManagement.ts` to group active negotiations by status and compute `days_in_stage` from `last_activity_at`.
3. Query must also group visits by status with aging buckets, using active visit states relevant for operational handling.
4. Age traffic-light rules are fixed: `<3d` GREEN, `3-7d` YELLOW, `7d+` RED.
5. Any pipeline item aged `>7d` must contribute to fires-panel signal generation so stale stages appear in `getFiresAlert` output.
6. Keep output typed for stage column rendering: stage name, item count, age bucket counts, and representative oldest age.
7. Include this wireframe-level structure in implementation:

```text
Pipeline Aging
Negotiations: [INITIATED 4 | <3d:1 3-7d:2 7d+:1] [TERMS_PROPOSED 6 | <3d:2 3-7d:3 7d+:1] ...
Visits:       [ASSIGNED 5 | <3d:3 3-7d:1 7d+:1] [CONFIRMED 3 | <3d:2 3-7d:1 7d+:0] ...
Legend: GREEN <3d, YELLOW 3-7d, RED 7d+
```

### Deliverables

- [ ] `src/components/admin/ops-command-center/PipelineAgingView.tsx` - stage distribution with age traffic-light visualization
- [ ] `convex/opsManagement.ts` - `getAgentPipelineAging` query with negotiation + visit aging aggregation
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate Pipeline Aging section for Ops Head mode
- [ ] `src/components/admin/ops-command-center/AgentProfileSheet.tsx` - integrate Pipeline Aging block/tab in agent profile context

### Acceptance Criteria

1. Pipeline Aging view shows negotiation and visit stage distribution with age-based traffic lights.
2. Stage groupings and age buckets are computed from live backend data and update reactively.
3. Pipeline Aging renders in both command center (Ops Head mode) and agent profile pipeline context.
4. Items aged `>7d` are included in fires-panel signals.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/admin/ops-command-center/PipelineAgingView.tsx`, `src/components/admin/ops-command-center/AgentProfileSheet.tsx`, `src/app/(admin)/admin/ops-command-center/page.tsx`, and `convex/opsManagement.ts`.

### Out of Scope

- Pipeline reassignment mutations
- Stage transition mutation changes
- New status definitions for visits or negotiations

---

## Out of Scope (All Tasks)

- KPI target CRUD and period actual computation
- Warning lifecycle mutations and escalation crons
- Weekly check-in note creation and overdue nudge execution
- WhatsApp or external messaging integrations

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-21

### What Was Built

- Added `/admin/ops-command-center` page shell with URL-driven CEO/Ops Head mode, permission-gated action buttons, and agent profile drill-down flow.
- Shipped dashboard modules for team health, fires, celebrations, summary cards, and pipeline aging in `src/components/admin/ops-command-center/`.
- Implemented core read-side backend queries in `convex/opsManagement.ts` (`getCommandCenterOverview`, `getTeamHealthHeatmap`, `getFiresAlert`, `getCelebrations`, `getStagnantPipeline`, `getAgentPipelineAging`).
- Added command-center navigation entry with `ops_management.view` gate in admin nav config.

### Key File Locations

| File                                                             | What                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/app/(admin)/admin/ops-command-center/page.tsx`              | Command-center shell, view-mode state, section composition, dialogs, and agent-sheet wiring |
| `src/components/admin/ops-command-center/TeamHealthHeatmap.tsx`  | Health cards with warning/caseload context and profile drill-down                           |
| `src/components/admin/ops-command-center/FiresPanel.tsx`         | Prioritized fire list with entity-level drill-down rows                                     |
| `src/components/admin/ops-command-center/CelebrationsPanel.tsx`  | Wins feed and recognition panel                                                             |
| `src/components/admin/ops-command-center/SummaryCards.tsx`       | Aggregate command-center summary cards                                                      |
| `src/components/admin/ops-command-center/PipelineAgingPanel.tsx` | Negotiation/visit aging visualization with traffic-light buckets                            |
| `src/components/admin/admin-nav-items.ts`                        | Permission-gated Ops Command Center nav item                                                |
| `convex/opsManagement.ts`                                        | Read-query backend for overview, heatmap, fires, celebrations, and aging                    |

### Deviations from Spec

- `SummaryCards.tsx` is used instead of separate `TargetProgressSummary.tsx` and `WarningSummaryCard.tsx` files described in the original task text.
- Pipeline aging shipped as `PipelineAgingPanel.tsx` (same scope, different filename than `PipelineAgingView.tsx`).
- Cron-freshness badge/banner contract from the early spec was deferred; overview currently returns live aggregate metrics only.

### Gotchas for Next Epic

- Route visibility depends on `ops_management.view`; missing role permissions show access-restricted card even for authenticated backoffice users.
- View mode is persisted in query params (`?view=ceo|ops_head`) and is the source of truth for conditional rendering.
- Heatmap/fires fan-in queries use read caps for safety; if OPS volume grows significantly, these caps should be revisited with pagination/aggregation.
