# Feature: CEO Ops Command Center

> **Priority**: Phase 46 (CEO Ops Command Center)
> **Personas**: CEO (aggregate command), Ops Head (team management), OPS Agent (review + warning recipient), System (auto-detection + nudges)
> **Dependencies**: OPS Portal (F30), Field Checklists (F31), Incentive V2 (F32), Analytics (F10), Rent Negotiation (F19), Notification Infrastructure (F37)
> **Status**: **IMPLEMENTED** (Phase 46 complete)

## Implementation Snapshot (As Built)

- **Backend**: `convex/opsManagement.ts` now owns command-center overview, team health heatmap, fires, celebrations, pipeline aging, KPI target lifecycle, warning lifecycle + automation, check-in lifecycle, pre-check-in brief, and open action items.
- **Schema tables**: `ops_kpi_targets`, `ops_warnings`, and `ops_check_in_notes` are implemented in `convex/schema.ts` with production indexes and soft-delete semantics.
- **Permissions**: `ops_management.view`, `ops_management.set_targets`, `ops_management.issue_warnings`, `ops_management.write_checkins`, `ops_management.configure` are live in `lib/constants.ts`.
- **Config keys**: `warning_quality_threshold`, `warning_target_miss_streak`, `warning_sla_breach_count_30d`, `warning_inactivity_days`, `warning_level1_expiry_days`, `warning_level2_expiry_days`, `warning_escalation_auto`, `checkin_overdue_days`, `caseload_threshold` are seeded in `SYSTEM_CONFIG_DEFAULTS`.
- **Audit actions**: 12 P46 actions are live (`ops_kpi_target.*`, `ops_warning.*`, `ops_check_in.*`) and available in `AUDIT_ACTIONS`.
- **Crons**: `compute-target-actuals` (20:00 UTC), `auto-detect-warnings` (21:00 UTC), `auto-expire-warnings` (21:30 UTC), and `checkin-overdue-nudge` (08:00 UTC) are registered in `convex/crons.ts`.
- **Frontend**: route `/admin/ops-command-center` is implemented with 19 files under `src/components/admin/ops-command-center/` plus integrated admin nav entry.

## Purpose

Phase 46 introduces a management workbench for active field-team operations. This is not a passive reporting dashboard. It is where leadership sets per-agent targets, tracks execution quality, issues structured warnings, records weekly check-ins, and drives accountability loops.

The command center is designed with two access tiers on one shared surface:

- CEO tier prioritizes aggregate visibility and "fires to fight"
- Ops Head tier includes all CEO visibility plus agent-level management actions

The feature is deliberately scoped to existing platform capabilities:

- No new external integrations
- No WhatsApp workflow in this phase
- Notifications use existing P35 channels (in-app + push)
- Targets are assigned per individual OPS agent (not per area/society)

---

## Problem Statement

Current OPS management workflows are distributed across multiple pages (leads, visits, closures, negotiations, checklists), making it hard to:

1. Hold individual OPS agents accountable over time
2. Standardize warning issuance and escalation decisions
3. Ensure regular manager-to-agent review rhythm
4. Detect operational risk patterns early (miss streaks, SLA slippage, inactivity)

P46 centralizes these into one command plane while reusing existing analytics and operational data systems.

---

## Product Principles

1. Management-first, not dashboard-only: every insight should link to an action.
2. Two-tier clarity: CEO sees aggregate and exceptions first; Ops Head can drill and intervene.
3. Structured accountability: warnings are explicit, level-based, and state-driven.
4. Review discipline: weekly check-ins are expected and tracked for compliance.
5. Reuse over duplication: computations pull from existing Convex modules and P35 notifications.

---

## Two-Tier View Architecture

The route is shared (`/admin/ops-command-center`) with permission-based capabilities.

### CEO View (Aggregate + Critical Attention)

CEO view includes:

- Aggregate KPIs (total leads, visits, closures, revenue) via `analytics.getOverviewKPIs`
- Pipeline funnel via `analytics.getLeadFunnel`
- Team health heatmap with red/yellow/green status per OPS agent
- Fires to fight (auto-detected high-priority issues)
- Wins to celebrate (top performers, milestones, streaks)
- Target progress summary (team hit-rate for current period)
- Warning summary (active warning count by level)
- Review compliance (review coverage this week + overdue list)

CEO view is read-focused with drill-through links but no mandatory day-to-day intervention.

### Ops Head View (Aggregate + Agent Management)

Ops Head view includes everything in CEO view, plus:

- Agent profile drill-down (full performance context)
- Target setting for any OPS agent
- Manual warning issuance with evidence capture
- Weekly check-in note entry and updates
- Sortable agent comparison table
- Detailed historical performance by agent

### Shared Page Model

One page serves both personas. Feature modules render based on permissions:

- `ops_management.view` gates page access and read modules
- Action modules are individually gated (`ops_management.set_targets`, `ops_management.issue_warnings`, `ops_management.write_checkins`, `ops_management.configure`)

---

## Core Data Model

P46 adds three new tables for target management, warning lifecycle, and review history.

## Table: `ops_kpi_targets`

Tracks per-agent KPI goals for weekly/monthly/quarterly periods.

```typescript
{
  agent_user_id: v.id("users"),
  set_by_user_id: v.id("users"),
  metric: v.union(
    v.literal("visits_completed"),
    v.literal("closures_confirmed"),
    v.literal("leads_verified"),
    v.literal("quality_score_min"),
    v.literal("checklist_approval_rate"),
    v.literal("document_collection_rate"),
    v.literal("negotiation_closures"),
    v.literal("visit_no_show_rate_max"),
    v.literal("tenant_inquiry_resolutions")
  ),
  target_value: v.number(),
  period_type: v.union(
    v.literal("WEEKLY"),
    v.literal("MONTHLY"),
    v.literal("QUARTERLY")
  ),
  period_start: v.number(),
  period_end: v.number(),
  actual_value: v.optional(v.number()),
  progress_pct: v.optional(v.number()),
  status: v.union(
    v.literal("ACTIVE"),
    v.literal("COMPLETED"),
    v.literal("MISSED"),
    v.literal("EXCEEDED"),
    v.literal("CANCELLED")
  ),
  notes: v.optional(v.string()),
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
}
```

### Field Notes

| Field          | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| `metric`       | One of approved metric keys in the KPI catalog section               |
| `target_value` | Expected value for the period                                        |
| `actual_value` | Latest computed actual from cron/on-demand computation               |
| `progress_pct` | Direction-aware progress percentage (formula defined in KPI section) |
| `status`       | `ACTIVE` \| `COMPLETED` \| `MISSED` \| `EXCEEDED` \| `CANCELLED`     |
| `is_deleted`   | Soft delete guardrail; canceled historical targets remain auditable  |

### Indexes

- `by_agent` (`agent_user_id`, `period_type`, `status`)
- `by_period` (`period_start`, `period_end`)
- `by_status` (`status`)
- `by_agent_metric_period` (`agent_user_id`, `metric`, `period_start`) for overlap detection in `createTarget`

---

## Table: `ops_warnings`

Stores structured warning events and lifecycle transitions.

```typescript
{
  agent_user_id: v.id("users"),
  issued_by_user_id: v.optional(v.id("users")),
  issued_by_type: v.union(v.literal("USER"), v.literal("SYSTEM")),
  warning_level: v.number(),
  trigger_type: v.union(v.literal("AUTO"), v.literal("MANUAL")),
  trigger_reason: v.union(
    v.literal("LOW_QUALITY_SCORE"),
    v.literal("MISSED_TARGETS"),
    v.literal("SLA_BREACHES"),
    v.literal("INACTIVITY"),
    v.literal("CUSTOM")
  ),
  description: v.string(),
  evidence: v.optional(v.string()),
  status: v.union(
    v.literal("ACTIVE"),
    v.literal("ACKNOWLEDGED"),
    v.literal("RESOLVED"),
    v.literal("EXPIRED"),
    v.literal("ESCALATED")
  ),
  acknowledged_at: v.optional(v.number()),
  resolved_at: v.optional(v.number()),
  resolution_notes: v.optional(v.string()),
  escalated_from_id: v.optional(v.id("ops_warnings")),
  expires_at: v.optional(v.number()),
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
}
```

### Field Notes

| Field               | Description                                                                           |
| ------------------- | ------------------------------------------------------------------------------------- |
| `warning_level`     | `1`, `2`, `3` where level 3 means deactivation recommendation                         |
| `trigger_type`      | `AUTO` or `MANUAL`                                                                    |
| `trigger_reason`    | `LOW_QUALITY_SCORE` \| `MISSED_TARGETS` \| `SLA_BREACHES` \| `INACTIVITY` \| `CUSTOM` |
| `issued_by_type`    | `SYSTEM` for auto-detected warnings, `USER` for manual warnings                       |
| `issued_by_user_id` | Required only when `issued_by_type=USER`; omitted for `SYSTEM`                        |
| `evidence`          | JSON snapshot at issuance time (metrics, target misses, SLA counts)                   |
| `status`            | `ACTIVE` \| `ACKNOWLEDGED` \| `RESOLVED` \| `EXPIRED` \| `ESCALATED`                  |
| `escalated_from_id` | Links to previous warning when this record is escalation-created                      |
| `expires_at`        | Expiry timestamp used by auto-expiry and escalation routines                          |

### Indexes

- `by_agent` (`agent_user_id`, `status`)
- `by_level` (`warning_level`, `status`)
- `by_status` (`status`, `created_at`)
- `by_status_expires_at` (`status`, `expires_at`) for expiry cron scanning
- `by_agent_level_reason_status` (`agent_user_id`, `warning_level`, `trigger_reason`, `status`) for dedupe checks

---

## Table: `ops_check_in_notes`

Captures weekly (or ad hoc) manager review notes and action items.

```typescript
{
  agent_user_id: v.id("users"),
  reviewer_user_id: v.id("users"),
  notes: v.string(),
  action_items: v.array(v.object({
    description: v.string(),
    due_date: v.optional(v.number()),
    completed: v.boolean(),
    completed_at: v.optional(v.number()),
  })),
  sentiment: v.optional(
    v.union(
      v.literal("POSITIVE"),
      v.literal("NEUTRAL"),
      v.literal("NEEDS_IMPROVEMENT")
    )
  ),
  next_review_date: v.optional(v.number()),
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
}
```

### Field Notes

| Field              | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `sentiment`        | `POSITIVE` \| `NEUTRAL` \| `NEEDS_IMPROVEMENT`                |
| `action_items`     | Structured commitments with due dates and completion tracking |
| `next_review_date` | Optional reminder anchor for next manager check-in            |

`updated_at` must be patched on every status transition and edit mutation for both `ops_warnings` and `ops_check_in_notes`.

### Indexes

- `by_agent` (`agent_user_id`, `created_at`)
- `by_reviewer` (`reviewer_user_id`, `created_at`)

---

## Warning Lifecycle and Escalation

Warnings are lifecycle-managed records, not one-off labels.

### Warning State Machine

```text
ACTIVE
  |-- ACKNOWLEDGED
  |     |-- RESOLVED
  |     |-- EXPIRED
  |     \-- ESCALATED
  |-- RESOLVED
  |-- EXPIRED
  \-- ESCALATED

RESOLVED (terminal)
EXPIRED (terminal)
ESCALATED (terminal; creates new warning at next level)
```

### Transition Rules

| From           | To             | Trigger                                              |
| -------------- | -------------- | ---------------------------------------------------- |
| `ACTIVE`       | `ACKNOWLEDGED` | Agent/manager acknowledges warning visibility        |
| `ACTIVE`       | `RESOLVED`     | Manager marks issue fixed with resolution notes      |
| `ACTIVE`       | `EXPIRED`      | Time-based expiry routine closes stale warning       |
| `ACTIVE`       | `ESCALATED`    | System or manager escalates to next warning level    |
| `ACKNOWLEDGED` | `RESOLVED`     | Issue fixed and resolution captured                  |
| `ACKNOWLEDGED` | `EXPIRED`      | Expiry reached without explicit resolution           |
| `ACKNOWLEDGED` | `ESCALATED`    | Escalation due to unresolved expiry/continued breach |

Terminal states in this model: `RESOLVED`, `EXPIRED`, `ESCALATED`.

### Expiry + Resolution Semantics (Canonical)

- `RESOLVED` is terminal and immutable; expiry cron never modifies resolved warnings.
- Expiry cron targets only unresolved records in `ACTIVE` or `ACKNOWLEDGED` where `expires_at` has passed.
- If `warning_escalation_auto=true`, unresolved expired warnings are escalated to next level.
- If `warning_escalation_auto=false`, unresolved expired warnings transition to `EXPIRED`.
- Any prior language implying "expiring resolved warnings" is invalid.

### Escalation Flow

1. System detects threshold breach and creates Level 1 auto-warning.
2. If unresolved by expiry and `warning_escalation_auto=true`, old warning status becomes `ESCALATED` and a new warning is created at next level with `escalated_from_id=<old_warning_id>`.
3. If Level 2 remains unresolved by expiry and auto-escalation is enabled, the same linkage pattern creates Level 3 deactivation recommendation warning.
4. Level 3 does not auto-deactivate user. It creates a recommendation requiring manual leadership decision.

---

## KPI Target Metric Catalog

P46 supports nine target metrics, each computed from existing systems.

| Metric Key                   | Description                      | Source                             | Metric Direction | Computation                                                                           |
| ---------------------------- | -------------------------------- | ---------------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `visits_completed`           | Visits completed this period     | `visits.ts`                        | `HIGHER_BETTER`  | Count where `status=COMPLETED` and `completed_at` in period                           |
| `closures_confirmed`         | Confirmed closures               | `closures.ts`                      | `HIGHER_BETTER`  | Count where `status=CONFIRMED` and `confirmed_at` in period                           |
| `leads_verified`             | Leads verified                   | `auditLogs.ts` + `leads.ts`        | `HIGHER_BETTER`  | Count audit events where `action='lead.verify'` and `actor_user_id=agent` in period   |
| `quality_score_min`          | Maintain quality above threshold | `incentives.ts` + `guard_profiles` | `HIGHER_BETTER`  | Current `quality_score >= target_value` (binary pass)                                 |
| `checklist_approval_rate`    | Checklist approval ratio         | `checklists.ts`                    | `HIGHER_BETTER`  | `APPROVED / (APPROVED + REJECTED)` in period                                          |
| `document_collection_rate`   | Required documents collected     | `documents.ts`                     | `HIGHER_BETTER`  | `VERIFIED / total_required` in period                                                 |
| `negotiation_closures`       | Negotiations closed              | `negotiations.ts`                  | `HIGHER_BETTER`  | Count where `status=CLOSED`, `last_activity_at` in period, and `ops_user_id=agent`    |
| `visit_no_show_rate_max`     | Keep no-show below threshold     | `visits.ts`                        | `LOWER_BETTER`   | `NO_SHOW / total_visits` as percentage, compared against max threshold `target_value` |
| `tenant_inquiry_resolutions` | Inquiries resolved               | `tenantInquiries.ts`               | `HIGHER_BETTER`  | Count where inquiry reaches resolution in period                                      |

Response-time tracking is deferred. It requires schema addition of `assigned_at` to leads/visits before a reliable `avg_response_time_hours` metric can be reintroduced.

### Metric Interpretation Rules

- Rate metrics store percentage points in `actual_value` (e.g., `78.5`)
- Threshold metrics (`quality_score_min`, `visit_no_show_rate_max`) evaluate pass/fail against `target_value`
- `progress_pct` is still computed for all metrics to unify UI rendering

### Direction-Aware Progress Computation

- `HIGHER_BETTER`: `progress_pct = (actual / target) * 100`, capped at `200`
- `LOWER_BETTER`: when `actual > 0`, `progress_pct = (target / actual) * 100`; when `actual = 0`, `progress_pct = 200` (perfect); always capped at `200`

### End-of-Period Status Rules for `LOWER_BETTER` Metrics

- `EXCEEDED` if `actual <= target`
- `COMPLETED` if `actual <= target * 1.2`
- `MISSED` if `actual > target * 1.2`

These directional rules must be used by `computeTargetActuals` when finalizing period status.

## Period Boundary Conventions

All KPI period boundaries use IST (`Asia/Kolkata`) and are stored as UTC Unix milliseconds.

- Weekly: Monday `00:00:00.000` IST to next Monday `00:00:00.000` IST, half-open interval `[start, end)`
- Monthly: 1st day `00:00:00.000` IST to next 1st day `00:00:00.000` IST, half-open `[start, end)`
- Quarterly: Jan 1, Apr 1, Jul 1, Oct 1 boundary starts in IST with half-open `[start, end)` windows

This boundary model should remain consistent with existing analytics snapshot conventions.

---

## Auto-Detection Rules (System Config Driven)

Warning triggers are configurable in `system_config`.

| Config Key                     | Default | Trigger                                                     |
| ------------------------------ | ------- | ----------------------------------------------------------- |
| `warning_quality_threshold`    | `40`    | Quality score below threshold triggers auto-warning         |
| `warning_target_miss_streak`   | `3`     | Consecutive missed target periods triggers auto-warning     |
| `warning_sla_breach_count_30d` | `5`     | SLA breaches in trailing 30 days triggers auto-warning      |
| `warning_inactivity_days`      | `7`     | No measurable OPS activity for N days triggers auto-warning |
| `warning_level1_expiry_days`   | `30`    | Level 1 expiry window                                       |
| `warning_level2_expiry_days`   | `60`    | Level 2 expiry window                                       |
| `checkin_overdue_days`         | `7`     | Days since last check-in before overdue nudge               |
| `warning_escalation_auto`      | `true`  | Enables automatic escalation on unresolved expiry           |

### Detection Priority

When multiple triggers fire in one cycle:

1. Reuse existing active warning at same level/reason when possible
2. Otherwise issue one warning with highest-severity reason ordering:
   - `SLA_BREACHES`
   - `MISSED_TARGETS`
   - `LOW_QUALITY_SCORE`
   - `INACTIVITY`

If an OPS agent has `quality_score` as `null`/`undefined`, they are excluded from `LOW_QUALITY_SCORE` auto-warning detection (absence of data is not treated as underperformance).

### Evidence Snapshot Contract

`evidence` stores a JSON snapshot string with:

- timestamp
- breached rule key
- relevant metric values
- target context (if applicable)
- trailing period window used for computation

This allows reproducible post-hoc review even if underlying data changes later.

---

## Permission Model

P46 adds five permissions in `lib/constants.ts`:

| Permission                      | Capability                                                     |
| ------------------------------- | -------------------------------------------------------------- |
| `ops_management.view`           | Access command center dashboard, summaries, and agent profiles |
| `ops_management.set_targets`    | Create, edit, cancel KPI targets                               |
| `ops_management.issue_warnings` | Issue warnings and run warning lifecycle actions               |
| `ops_management.write_checkins` | Write and update check-in notes                                |
| `ops_management.configure`      | Update thresholds/rules in system config (CEO-only path)       |

### Role Assignment Strategy

- Super Admin retains all permissions and can perform all command-center actions
- Add a dedicated management role (for example `OPS_MANAGER`) for Ops Head workflows
- `ops_management.configure` should be restricted to CEO-authorized role holders

Implementation note: these five permissions must be added to both `PERMISSIONS` object and `ALL_PERMISSIONS` array in `lib/constants.ts`, and to `notes/13-constants-reference.md`, as the first task of P46-E01.

## OPS Agent Self-Service

OPS agents get read-only visibility into their own management records without management permissions.

- `getMyTargets` query: returns own active + historical targets; auth uses `requireFieldWorker(ctx)`.
- `getMyWarnings` query: returns own warnings across all statuses; auth uses `requireFieldWorker(ctx)`.
- `getMyCheckIns` query: returns own check-in history; auth uses `requireFieldWorker(ctx)`.
- These queries are read-only. OPS agents cannot create/update/cancel targets, issue/acknowledge/resolve warnings, or write check-in notes.

---

## Backend Architecture (`convex/opsManagement.ts`)

P46 introduces a dedicated domain module for leadership operations.

### Read Queries

| Function                   | Purpose                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `getCommandCenterOverview` | Aggregate KPI, funnel, heatmap summary, fires, wins, warnings, review compliance      |
| `getTeamHealthHeatmap`     | Per-agent health status (red/yellow/green) + reasons                                  |
| `getAgentProfile`          | Full agent profile: quality, targets, warnings, check-ins, pipeline stats, percentile |
| `getAgentPipelineAging`    | Stage-wise negotiation + visit aging for agent/team with age buckets                  |
| `getPreCheckInBrief`       | Read-only prep bundle for manager check-ins (metrics, warnings, targets, pipeline)    |
| `getFiresAlert`            | Prioritized issue list requiring intervention                                         |
| `getCelebrations`          | Weekly wins and recognition list                                                      |
| `getReviewCompliance`      | Team reviewed percentage + overdue review roster                                      |
| `getOpenActionItems`       | Aggregated uncompleted check-in action items across agents (last 90 days)             |
| `getTargetsSummary`        | Team-level target hit/miss/exceeded rollup                                            |

### Write Mutations

| Function             | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `createTarget`       | Create target record for OPS agent and period                |
| `updateTarget`       | Edit target value/notes/period parameters (if policy allows) |
| `cancelTarget`       | Mark target `CANCELLED` with soft-delete semantics preserved |
| `issueWarning`       | Manual warning issue with level/reason/evidence              |
| `acknowledgeWarning` | Mark warning acknowledged                                    |
| `resolveWarning`     | Mark warning resolved with resolution notes                  |
| `createCheckIn`      | Create check-in note with structured action items            |
| `updateCheckIn`      | Amend notes/action-item completion/scheduling                |

### Audit Action Requirements

The following action literals must be emitted by P46 write paths:

- `ops_kpi_target.create`
- `ops_kpi_target.update`
- `ops_kpi_target.cancel`
- `ops_kpi_target.bulk_create`
- `ops_kpi_target.roll_forward`
- `ops_warning.issue`
- `ops_warning.acknowledge`
- `ops_warning.resolve`
- `ops_warning.escalate`
- `ops_check_in.create`
- `ops_check_in.update`
- `ops_check_in.toggle_action_item`

These must be added to `AUDIT_ACTIONS` in `lib/constants.ts` and to the `audit_logs` action validator before backend implementation starts.

### System/Internal Operations

| Function               | Trigger                                  |
| ---------------------- | ---------------------------------------- |
| `computeTargetActuals` | Daily cron and optional on-demand recalc |
| `autoDetectWarnings`   | Daily warning detection sweep            |

### Health Color Logic (`getTeamHealthHeatmap`)

| Color    | Rule                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| `RED`    | At least one active warning OR target miss rate > 50%                                |
| `YELLOW` | Any target progress < 80% OR quality score < 60 OR quality score unavailable (`N/A`) |
| `GREEN`  | All targets >= 80% AND quality >= 60 AND no active warnings                          |

Quality score fallback behavior:

- If OPS agent has no `quality_score` (`null`/`undefined`), UI shows `N/A`.
- Missing quality score is treated as `YELLOW`, not `RED`.
- Missing quality score excludes the agent from quality-based warning triggers.

## Period-over-Period Delta Indicators

Every metric displayed in Team Health Heatmap cards, Agent Comparison Table rows, and command-center summary cards should include a period-over-period delta indicator.

### Delta Display Contract

- Format examples: `72 ▲+8`, `45 ▼-12`, `58 -0`
- Computation: `delta = current_value - previous_period_value`
- `getTeamHealthHeatmap` and `getCommandCenterOverview` must return `previous_period_values` in the response payload alongside current values.

### Delta Source by Metric Family

| Metric Family                                     | Current Value Source             | Previous Period Source                                |
| ------------------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| Target-tracked metrics (`visits_completed`, etc.) | `ops_kpi_targets` current window | `ops_kpi_targets` previous comparable period window   |
| Quality score                                     | latest quality score surface     | most recent previous entry in `quality_score_history` |
| Pipeline counts and volume signals                | live pipeline aggregation        | `analytics_snapshots` previous period snapshot        |

### Direction-Aware Color Rules

- `HIGHER_BETTER` metrics: positive delta is improving (`green`), negative delta is declining (`red`).
- `LOWER_BETTER` metrics: negative delta is improving (`green`), positive delta is declining (`red`).
- Unchanged values render a neutral gray marker.
- If prior-period value is unavailable, render `N/A` delta and exclude from directional coloring.

### Profile Payload Shape (Conceptual)

```typescript
{
  agent: { user_id, name, phone, status },
  health: { color, reasons: string[] },
  performance: {
    quality_score,
    target_hit_rate,
    target_miss_rate,
    percentile,
    period_metrics: Record<string, number>,
  },
  warnings: {
    active_count,
    level_breakdown: { level1, level2, level3 },
    recent: Warning[],
  },
  checkins: {
    last_review_at,
    days_since_last_review,
    overdue,
    recent_notes: CheckInNote[],
  },
  pipeline: {
    leads_verified,
    visits_completed,
    closures_confirmed,
    negotiation_closures,
  },
}
```

## Pipeline Aging View

Pipeline Aging adds per-agent and team-level stage aging visibility so leadership can see where work is accumulating before it becomes a fire.

### Query: `getAgentPipelineAging`

`getAgentPipelineAging` groups active negotiations and visits by status and computes `days_in_stage` from the latest known stage anchor:

- Preferred anchor: stage/status transition timestamp (if tracked)
- Fallback anchor: `last_activity_at`

Computation uses whole days: `days_in_stage = floor((now - stage_anchor_at) / 86_400_000)`.

### Traffic-Light Aging Buckets

- `GREEN`: `< 3` days in stage
- `YELLOW`: `3-7` days in stage
- `RED`: `7+` days in stage

This applies to both negotiation stage groups and visit stage groups. Aged items in red/yellow buckets feed `getFiresAlert` and should surface as candidate fires. The same dataset powers the Agent Profile `Pipeline` tab.

### Pipeline Aging Wireframe

```text
Pipeline Aging (Agent / Team)

Negotiations
INITIATED      Count: 6   <3d:2  3-7d:3  7+d:1 [RED]
TERMS_SHARED   Count: 4   <3d:1  3-7d:2  7+d:1 [YELLOW]
TOKEN_PENDING  Count: 3   <3d:2  3-7d:1  7+d:0 [GREEN]

Visits
ASSIGNED       Count: 8   <3d:4  3-7d:3  7+d:1 [YELLOW]
CONFIRMED      Count: 5   <3d:3  3-7d:1  7+d:1 [YELLOW]
IN_PROGRESS    Count: 2   <3d:2  3-7d:0  7+d:0 [GREEN]
```

---

## Cron Jobs (`convex/crons.ts`)

P46 adds four daily routines:

| Cron ID                  | Schedule (UTC) | Purpose                                                                                        |
| ------------------------ | -------------- | ---------------------------------------------------------------------------------------------- |
| `compute-target-actuals` | 20:00          | Update `actual_value`, `progress_pct`, and target status                                       |
| `auto-detect-warnings`   | 21:00          | Run threshold checks and issue/escalate warnings                                               |
| `auto-expire-warnings`   | 21:30          | Process unresolved expired warnings (`ACTIVE`/`ACKNOWLEDGED`) with expire-or-escalate policy   |
| `checkin-overdue-nudge`  | 08:00          | Identify agents not reviewed in `checkin_overdue_days` and enqueue check-in nudges (13:30 IST) |

### Cron Ordering Rationale

1. Compute latest target actuals first.
2. Run warning detection against fresh target outcomes.
3. Expire and escalate warnings after detection pass.
4. Run check-in compliance nudge separately in business-hours alignment.

Overdue nudge scope is check-in level only (agents not reviewed in X days). Action-item `due_date` fields are informational in UI and are not system-enforced by cron.

## Data Freshness Indicators (Deferred)

The original spec proposed cron freshness writebacks via `system_config` keys (for per-cron last-run badges + stale warning banner). That freshness layer is not shipped in the current implementation.

Current state:

- `getCommandCenterOverview` returns live aggregate operational metrics.
- Freshness badges and stale-data banner are deferred follow-up work.

---

## Frontend Architecture

### Route

- `src/app/(admin)/admin/ops-command-center/page.tsx`

### Components

- `src/components/admin/ops-command-center/TeamHealthHeatmap.tsx`
- `src/components/admin/ops-command-center/FiresPanel.tsx`
- `src/components/admin/ops-command-center/CelebrationsPanel.tsx`
- `src/components/admin/ops-command-center/SummaryCards.tsx`
- `src/components/admin/ops-command-center/PipelineAgingPanel.tsx`
- `src/components/admin/ops-command-center/ReviewComplianceCard.tsx`
- `src/components/admin/ops-command-center/AgentProfileSheet.tsx`
- `src/components/admin/ops-command-center/TargetSettingDialog.tsx`
- `src/components/admin/ops-command-center/AgentTargetsView.tsx`
- `src/components/admin/ops-command-center/TargetProgressBar.tsx`
- `src/components/admin/ops-command-center/BulkTargetDialog.tsx`
- `src/components/admin/ops-command-center/WarningBadge.tsx`
- `src/components/admin/ops-command-center/WarningDialog.tsx`
- `src/components/admin/ops-command-center/WarningTimeline.tsx`
- `src/components/admin/ops-command-center/CheckInForm.tsx`
- `src/components/admin/ops-command-center/CheckInHistory.tsx`
- `src/components/admin/ops-command-center/PreCheckInBrief.tsx`
- `src/components/admin/ops-command-center/OpenActionItemsPanel.tsx`
- `src/components/admin/ops-command-center/metric-options.ts`

### UX Model

The page uses a top-level view mode selector:

- `CEO`: aggregate-first layout, no management forms by default
- `OPS_HEAD`: aggregate + action modules + drill-down controls

Modules are always permission-checked regardless of selected mode.

---

## Wireframe-Style Section Specifications

### 1) Command Center Shell (`CommandCenterPage`)

```text
+--------------------------------------------------------------------------------+
| Ops Command Center                                    [Period] [View: CEO/HEAD]|
| KPI Cards: Leads | Visits | Closures | Revenue                               |
| Funnel Snapshot                                                           ... |
+--------------------------------------------------------------------------------+
| Team Health Heatmap                         | Fires to Fight                  |
| (agent cards with color + key reason)       | (ranked issues + action links)  |
+--------------------------------------------------------------------------------+
| Wins to Celebrate                           | Warning Summary                 |
| (top performers + milestones)               | (L1/L2/L3 active counts)        |
+--------------------------------------------------------------------------------+
| Target Progress Summary                     | Review Compliance               |
| (hit/miss/exceed)                           | (% reviewed + overdue list)     |
+--------------------------------------------------------------------------------+
| Open Action Items Dashboard (overdue first, grouped by agent)                 |
+--------------------------------------------------------------------------------+
| Agent Comparison Table (Ops Head mode)                                       |
+--------------------------------------------------------------------------------+
```

### 2) Team Health Heatmap (`TeamHealthHeatmap`)

```text
+-------------------+ +-------------------+ +-------------------+
| Agent A [RED]     | | Agent B [YELLOW]  | | Agent C [GREEN]   |
| Warnings: L2      | | Targets: 74%      | | Targets: 92%      |
| Miss rate: 61%    | | Quality: 58       | | Quality: 81       |
| [View Profile]    | | [View Profile]    | | [View Profile]    |
+-------------------+ +-------------------+ +-------------------+
```

### 3) Fires Panel (`FiresPanel`)

```text
1. [Critical] 7 SLA breaches in 30d - Agent X            [Issue Warning]
2. [High] Level 2 warning expiring unresolved - Agent Y  [Escalate]
3. [High] 3 missed target periods - Agent Z              [Open Profile]
4. [Medium] 4 stale negotiations > threshold             [Assign Follow-up]
   (threshold comes from `negotiation_stale_days` system config, default 14)
```

#### Fire Drill-Down Entity Detail

Each fire item returned by `getFiresAlert` must include an `entity_details` array with the top 3-5 concrete records causing that fire.

```typescript
type FireEntityDetail = {
  entity_type: "lead" | "visit" | "negotiation" | "closure";
  entity_id: string;
  display_label: string; // e.g. "Tower B, Flat 402 — Sunshine Heights"
  days_stuck: number;
  current_blocker: string;
  action_href: string;
};
```

UI behavior contract:

- Fires list rows are expandable.
- Expanded state renders `entity_details` in a compact table/list.
- Each entity row includes one-click navigation via `action_href` to deep-link into the exact record.
- If more than 5 matched entities exist, show only top 5 by severity/age and indicate remaining count.

### 4) Celebrations Panel (`CelebrationsPanel`)

```text
- Agent M: highest closures this week (6)
- Agent N: 14-day quality streak achieved
- Agent Q: best checklist approval-rate improvement (42% better)
```

### 5) Target Progress Summary (`TargetProgressSummary`)

```text
Team Target Outcomes (Current Period)
- Hit: 58%
- Exceeded: 17%
- Missed: 25%

Per-metric bars:
visits_completed           [########--] 81%
closures_confirmed         [######----] 64%
quality_score_min          [#########-] 93%
```

### 6) Warning Summary (`WarningSummaryCard`)

```text
Active Warnings
- Level 1: 9
- Level 2: 3
- Level 3: 1

[View all warnings] [Open unresolved Level 2+]
```

### 7) Review Compliance (`ReviewComplianceCard`)

```text
Review Compliance (This Week)
- Reviewed: 68%
- Overdue (>7 days): 5 agents

Overdue list:
- Agent R (10 days)
- Agent T (9 days)
```

## Open Action Items Dashboard

Command center includes a dedicated Open Action Items widget/tab to aggregate uncompleted follow-ups across recent manager reviews.

### Query: `opsManagement.getOpenActionItems`

- Scans `ops_check_in_notes` for `action_items` where `completed=false`
- Scope: all OPS agents, check-ins created in the last 90 days
- Sorted order: overdue first, then nearest upcoming due date
- Grouping: by agent to keep manager follow-up context clear

### Row Contract

Each row includes:

- Agent name
- Action item description
- Due date with overdue badge when date is past
- Originating check-in date
- Link to originating check-in record

Frontend component: `OpenActionItemsPanel.tsx`.

### 8) Agent Profile Sheet (`AgentProfileSheet`)

```text
Agent: Name, status, tenure, quality score, percentile
Tabs:
- Performance: period metrics and trend
- Targets: current + historical target cards
- Warnings: timeline with status and evidence
- Check-ins: notes history and open action items
- Pipeline: leads/visits/closures/negotiations summary
```

### 9) Target Setting Dialog (`TargetSettingDialog`)

```text
Fields:
- Agent
- Metric key (9 supported metrics)
- Target value
- Period type (WEEKLY/MONTHLY/QUARTERLY)
- Period start/end
- Notes

Validation:
- Target value > 0
- period_end >= period_start
- One active target per (agent, metric, period window) policy
```

## Bulk Target Operations

Ops Head workflows require fast period setup beyond one-by-one target creation.

### 1) Apply Template to All Agents

Mutation: `applyTargetTemplate`

- Input:
  - `template: Record<MetricKey, number>`
  - `period_type`
  - `period_start`
  - `period_end`
- Behavior:
  - Creates one target per metric per active OPS agent
  - Skips creation when overlap exists for same `agent + metric + period`
- Output: `{ created: number, skipped: number, errors: string[] }`

### 2) Roll Forward from Previous Period

Mutation: `rollForwardTargets`

- Input:
  - `source_period_start`
  - `source_period_end`
  - `new_period_start`
  - `new_period_end`
  - `adjustment_pct` (optional multiplier, example `1.10` = +10%)
- Behavior:
  - Copies all source-period targets into new period
  - Applies optional adjustment to `target_value`
  - Uses same overlap skip logic
- Output: `{ created: number, skipped: number, errors: string[] }`

### Permission + Audit

- Both bulk mutations require `ops_management.set_targets`.
- Audit actions:
  - `ops_kpi_target.bulk_create`
  - `ops_kpi_target.roll_forward`

### Bulk Targets Dialog Wireframe

```text
Bulk Targets

Mode: [Apply Template] [Roll Forward]

Apply Template
- Period Type: WEEKLY / MONTHLY / QUARTERLY
- Period Start / End
- Template fields (9 metric keys)

Roll Forward
- Source Period Start / End
- New Period Start / End
- Adjustment % (optional)

[Preview Created/Skipped] [Run Bulk Operation]
```

### 10) Warning Dialog (`WarningDialog`)

```text
Fields:
- Agent
- Warning level (1/2/3)
- Trigger reason
- Description
- Evidence JSON/text snapshot
- Expiry date (optional override)
```

### 11) Check-In Form (`CheckInForm`)

```text
Fields:
- Notes (required)
- Sentiment (optional)
- Action items (repeatable rows): description, due date, completed
- Next review date (optional)
```

## Pre-Check-In Brief

Agent profile includes a `Prepare Check-In` action that opens a read-only pre-check-in briefing panel to reduce manager prep time.

### Query + Composition

- New query: `opsManagement.getPreCheckInBrief`
- Composition sources: `getAgentProfile` + `getAgentPipelineAging` + check-in history
- No AI generation: this is deterministic composition of already available data

### Brief Contents

- Last 7-day metrics vs previous 7 days (with deltas)
- Open action items from previous check-ins, with carried-forward items highlighted
- Current target progress for all active targets
- Active warnings with evidence summary
- Pipeline snapshot (active leads, scheduled visits, open negotiations with aging)
- Quick quality-score trend (last 4 points)

Frontend component: `PreCheckInBrief.tsx`.

Expected impact: prep time per agent review reduces from ~15 minutes to ~2 minutes.

### 12) Agent Comparison Table (`AgentComparisonTable`)

```text
Columns (sortable):
Agent | Quality | Target Hit % | Miss Rate % | Active Warnings | Last Review (days) |
Visits Completed | Closures Confirmed | Negotiation Closures | No-show %
```

## Agent Workload / Caseload

Leadership views must include workload visibility to avoid over-assigning high performers.

### Active Caseload Metric

`Active Caseload` per agent is the sum of:

- Active leads where agent is assigned and status is `SUBMITTED` / `VERIFIED` / `NEED_INFO`
- Visits where status is `ASSIGNED` / `CONFIRMED` / `IN_PROGRESS`
- Negotiations where `ops_user_id=agent` and status is not `CLOSED` / `FAILED` / `EXPIRED`

### Threshold + Alerting

- New `system_config` key: `caseload_threshold` (default `15`)
- If `active_caseload > caseload_threshold`, show `⚠️ Overloaded` badge on heatmap card
- Over-threshold agents are surfaced in fires as `capacity` category issues
- `getTeamHealthHeatmap` must return `active_caseload` for every agent card

### Caseload Column Wireframe

```text
Agent | Quality | Target Hit % | Active Warnings | Active Caseload |
Agent A | 74 | 82% | 1 | 12
Agent B | 68 | 77% | 0 | 18 ⚠️ Overloaded
Agent C | 81 | 93% | 0 | 9
```

### 13) Target Progress Bar (`TargetProgressBar`)

```text
Metric: visits_completed
Progress: 78 / 100 (78%)
[#######---] Status: ACTIVE
```

---

## Form and Validation Conventions

- All forms use `react-hook-form` + `zod`
- All mutations surface success/error via `sonner`
- Mutation actions disable controls while pending
- Optional evidence payload for warnings should be validated as parseable JSON string when provided

---

## Integration Points with Existing Infrastructure

| Existing System                       | How P46 Uses It                                                           |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `analytics.getOverviewKPIs`           | Pipeline health section in command center                                 |
| `analytics.getLeadFunnel`             | Funnel visualization                                                      |
| `analytics.getGuardLeaderboard`       | Base ranking data for agent comparison with OPS persona filter            |
| `analytics.getOperationalMetrics`     | Operational rate metrics (response-time tracking deferred in P46)         |
| `analytics.getOpsSupersetGateMetrics` | OPS-specific metrics and distribution signals                             |
| `incentives.getLeaderboard`           | Peer percentile + leaderboard quality score for target/warning evaluation |
| `guard_profiles.quality_score`        | Direct quality-score source (OPS profiles required via P44 backfill)      |
| `briefing.getMorningBriefing`         | Extended with fires and wins summaries                                    |
| `guards.getMetrics`                   | Per-agent raw metrics for target actual computation                       |
| P35 notification infrastructure       | Push + in-app alerts for warnings and check-in overdue nudges             |

### Notification Behaviors (P35 Reuse)

- Warning issued/escalated: enqueue high-priority event for manager and affected agent
- Warning resolved: enqueue informational closure event
- Check-in overdue: enqueue manager nudge event

WhatsApp channel is explicitly out-of-scope for P46 even though notification infrastructure supports it.

---

## Business Rules

1. Targets are always assigned to individual OPS agents (`agent_user_id`) and never to society or area aggregates.
2. Only users with `ops_management.view` can access the command center route and read data.
3. `ops_management.set_targets` is required for target create/update/cancel actions.
4. `ops_management.issue_warnings` is required for warning issuance and lifecycle updates.
5. `ops_management.write_checkins` is required for check-in note creation and updates.
6. `ops_management.configure` is required for updating warning/check-in threshold configs.
7. Warnings are soft-deletable and lifecycle-state driven; historical records remain queryable for audit.
8. Level 3 warning is a deactivation recommendation only; account deactivation still requires explicit management action.
9. `progress_pct` is capped at 200 to prevent outlier distortion in visual summaries.
10. Team health color uses deterministic rule precedence: red before yellow before green.
11. Check-in compliance is computed on rolling week windows; overdue is based on `checkin_overdue_days`.
12. All timestamps are Unix milliseconds.
13. All status transitions for warning lifecycle must be validated against P46 transition rules.

---

## Edge Cases

- Agent has no active target in period: appears in comparison table with "No target set" state and excluded from target hit denominator unless policy includes as miss.
- Target metric has insufficient data window: `actual_value` remains undefined and status stays `ACTIVE` until minimum data is available or period ends.
- Manual warning issued while auto-warning active: both can coexist if reason differs; UI should clearly separate warning records.
- Warning acknowledged but new breach occurs: system can issue a fresh warning record if breach context differs materially.
- Expiry routine runs after manual resolution same day: resolved status should be idempotent and not overwritten to expired.
- Agent transferred/deactivated mid-period: active targets should be canceled or excluded per policy, with immutable history retained.
- Manager skips check-ins for several weeks: overdue list and nudges continue daily until a new check-in is logged.

---

## Implementation Notes and Deviations

- `SummaryCards.tsx` consolidates summary-card concerns that were originally split across separate `TargetProgressSummary` and `WarningSummaryCard` components.
- Pipeline aging shipped as `PipelineAgingPanel.tsx` (same functional scope as the original `PipelineAgingView` naming in tasks/spec notes).
- The original agent-comparison-table concept is represented through `TeamHealthHeatmap`, `AgentProfileSheet`, and `AgentTargetsView` instead of a standalone `AgentComparisonTable.tsx` file.
- Pre-check-in brief is deterministic and production-ready, but currently returns a current quality snapshot (not a separate 4-point quality-history series payload) and warning summaries without an expanded evidence blob.

---

## Non-Goals (Phase 46)

- Full formal PIP workflow with legal workflow automation
- WhatsApp notification flows for command center events
- New third-party integrations
- Society/zone-level target assignment models

---

## Related Documents

- [OPS Portal](20-ops-portal.md) — OPS persona behavior, permissions, and route-group architecture
- [Incentive V2](22-incentive-v2.md) — quality scoring inputs used by target and warning rules
- [State Machines](../04-state-machines.md) — status-transition modeling conventions to follow for warning lifecycle
- [Constants Reference](../13-constants-reference.md) — canonical source for permissions, statuses, and config keys
- [Notification Infrastructure](27-notification-infrastructure.md) — event dispatch and channel routing used for warnings and nudges
- [Analytics](10-analytics.md) — aggregate data sources reused by command center overview
