# Phase 46: CEO Ops Command Center (P46)

## Overview

This phase introduces an operational management workbench for CEO and Ops Head users to actively run OPS performance, not just monitor reports.

**Status**: Done (completed 2026-02-21).

1. Add a two-tier command center view (CEO aggregate view + Ops Head individual management view).
2. Introduce per-agent KPI target setting, progress tracking, and daily actual computation.
3. Add a structured warning and escalation engine (Level 1 -> Level 2 -> Level 3 deactivation recommendation).
4. Add weekly check-in notes with action-item tracking and overdue nudges.
5. Reuse existing Phase 30/32/35 foundations and enforce accountability workflows from one admin surface.

## Dependencies

- **P30 (Field Ops Platform)**: OPS persona, quality scoring foundations, and field operations data sources.
- **P32 (Incentive v3)**: Commission/gamification signals used for target and celebration insights.
- **P35 (Notification Infrastructure)**: Alert and nudge delivery for warnings, escalations, and review reminders.
- **P12 (Analytics)**: Existing KPI query patterns and dashboard visualization conventions reused by the command center.

## Epics

| ID      | Title                         | Tasks | Status | Depends On |
| ------- | ----------------------------- | ----- | ------ | ---------- |
| P46-E01 | Command Center Dashboard      | 6     | done   | []         |
| P46-E02 | KPI Targets and Tracking      | 6     | done   | [P46-E01]  |
| P46-E03 | Warning and Escalation Engine | 4     | done   | [P46-E02]  |
| P46-E04 | Weekly Check-In Notes         | 5     | done   | [P46-E01]  |

Total tasks across epics: **21**.

## Completion Criteria

- [x] `/admin/ops-command-center` exists and supports CEO/Ops Head tier views via URL state.
- [x] Team health heatmap, fires panel, celebrations panel, and command-center summary cards render from live Convex queries.
- [x] `ops_kpi_targets`, `ops_warnings`, and `ops_check_in_notes` tables exist with correct indexes, permissions, and config keys.
- [x] KPI target lifecycle supports create/update/cancel/list/detail and daily actual computation with period-end status transitions.
- [x] Warning lifecycle supports manual + auto-detected warnings with acknowledge/resolve/escalate/expire flows.
- [x] Weekly check-ins support notes, action items, compliance tracking, and overdue nudges through notification events.
- [x] Pipeline aging view shows stage distribution with age-based traffic lights.
- [x] Bulk target template and roll-forward operations work for all active OPS agents.
- [x] Command center sections run on live operational queries; cron freshness writeback indicators are explicitly deferred.
- [x] Pre-check-in brief auto-assembles agent context for 1:1 preparation.
- [x] Open action items dashboard aggregates uncompleted commitments across team.
