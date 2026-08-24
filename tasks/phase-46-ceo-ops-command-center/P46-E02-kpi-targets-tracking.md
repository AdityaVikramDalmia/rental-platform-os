---
id: P46-E02
title: KPI Targets and Tracking
phase: 46
status: done
depends_on: ["P46-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-21
---

# P46-E02: KPI Targets and Tracking

## Overview

Enable CEO/Ops Head users to define per-agent KPI targets, track progress against live actuals, and automatically resolve end-of-period outcomes (`EXCEEDED`, `COMPLETED`, `MISSED`). This epic adds target schema/config/permissions, CRUD backend, daily computation cron, target-setting UI, and a team-wide tracking view.

## Prerequisites

- **Read first**: [P46-E01 Completion Summary](P46-E01-command-center-dashboard.md#completion-summary) - command-center page contracts, section composition, and `opsManagement.ts` query boundaries.
- P30 and P32 data contracts must be stable for metric actual computation.
- Existing cron patterns in `convex/crons.ts` should be reused for scheduled recomputation.

## Task Queue

- [x] P46-E02-T01: Schema for `ops_kpi_targets` + Permission and Config Keys
- [x] P46-E02-T02: KPI Target CRUD Backend
- [x] P46-E02-T03: Target Actuals Computation Cron
- [x] P46-E02-T04: Target Setting Dialog UI
- [x] P46-E02-T05: Agent Targets Tracking View
- [x] P46-E02-T06: Bulk Target Operations

---

## T01: Schema for `ops_kpi_targets` + Permission and Config Keys

### Objective

Define the KPI target persistence model, required indexes, OPS-management permission constants, and metric-definition config keys used by target setup and progress computation.

### Estimated Effort

M

### Required Reading

- `notes/10-convex-schema.md` - schema/index conventions and validator patterns
- `notes/13-constants-reference.md` - enum/permission/config naming patterns
- `notes/03-roles-and-permissions.md` - permission strings and role assignment behavior
- `convex/schema.ts` - current table ordering and index style
- `lib/constants.ts` - permission/constants export patterns
- `convex/seed.ts` - idempotent system config seeding conventions

### Key Rules

1. Add `ops_kpi_targets` to `convex/schema.ts` with explicit literal-union validators (no `v.string()`) for target enums:
   - `metric`: `v.union(v.literal("visits_completed"), v.literal("closures_confirmed"), v.literal("leads_verified"), v.literal("quality_score_min"), v.literal("checklist_approval_rate"), v.literal("document_collection_rate"), v.literal("negotiation_closures"), v.literal("visit_no_show_rate_max"), v.literal("tenant_inquiry_resolutions"))`
   - `period_type`: `v.union(v.literal("WEEKLY"), v.literal("MONTHLY"), v.literal("QUARTERLY"))`
   - `status`: `v.union(v.literal("ACTIVE"), v.literal("COMPLETED"), v.literal("MISSED"), v.literal("EXCEEDED"), v.literal("CANCELLED"))`
2. Metric set is exactly 9 metrics (remove `avg_response_time_hours`); add note that response-time tracking is deferred because it requires `assigned_at` on leads/visits, which is not currently in schema.
3. Add required indexes including overlap-detection support: `by_agent_period_status`, `by_agent_metric_period`, `by_period`, `by_status`.
4. Include `is_deleted: v.boolean()` and default all writes to soft-delete semantics.
5. Add new permissions in `lib/constants.ts`: `ops_management.view` and `ops_management.set_targets`.
6. Add KPI metric-definition system config keys (available metric list + metadata descriptors) and seed defaults idempotently.
7. Add direction metadata for each metric and centralize it in constants/config:
   - `visits_completed`: `HIGHER_BETTER`
   - `closures_confirmed`: `HIGHER_BETTER`
   - `leads_verified`: `HIGHER_BETTER`
   - `quality_score_min`: `HIGHER_BETTER`
   - `checklist_approval_rate`: `HIGHER_BETTER`
   - `document_collection_rate`: `HIGHER_BETTER`
   - `negotiation_closures`: `HIGHER_BETTER`
   - `visit_no_show_rate_max`: `LOWER_BETTER`
   - `tenant_inquiry_resolutions`: `HIGHER_BETTER`
8. Ensure metric/status/period enums are centralized in constants and reused by schema/mutations/UI.
9. Add `ops_kpi_targets` to `AUDITED_TABLES` in `convex/functions.ts`.

### Deliverables

- [ ] `convex/schema.ts` - add `ops_kpi_targets` table with literal-union validators + indexes (`by_agent_period_status`, `by_agent_metric_period`, `by_period`, `by_status`)
- [ ] `lib/constants.ts` - add permissions, target period/status/metric constants, metric direction metadata, and type exports
- [ ] `convex/seed.ts` - seed target metric definitions/config defaults idempotently
- [ ] `convex/functions.ts` - include `ops_kpi_targets` in `AUDITED_TABLES`

### Acceptance Criteria

1. Schema compiles with all required fields and indexes.
2. New permission constants are exported and available for UI/backend gates.
3. KPI metric config keys are seeded and retrievable from `system_config`.
4. Table is covered by audit trigger wrappers.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, `convex/seed.ts`, and `convex/functions.ts`.

### Out of Scope

- Target CRUD business logic
- Period actual computation logic
- Target-setting UI

---

## T02: KPI Target CRUD Backend

### Objective

Implement target lifecycle mutations and queries with overlap validation, permission enforcement, and paginated list APIs for per-agent and global target views.

### Estimated Effort

L

### Required Reading

- `notes/11-convex-architecture.md` - auth helper usage and domain-module conventions
- `notes/04-state-machines.md` - transition validation style patterns
- `convex/auth.helpers.ts` - `requirePermission` contracts
- `convex/analytics.ts` - pagination/query organization patterns

### Key Rules

1. Implement in `convex/opsManagement.ts`: `createTarget`, `updateTarget`, `cancelTarget`, `listTargetsForAgent`, `listAllTargets`, `getTargetDetail`.
2. Mutations must enforce `requirePermission(ctx, "ops_management.set_targets")`.
3. Validate metric existence against configured metric definitions before create/update.
4. Reject overlapping active targets for same `agent_user_id + metric + overlapping period window`.
5. Restrict edits to `ACTIVE` targets only; cancellation transitions to `CANCELLED`.
6. Add audit action literals `ops_kpi_target.create`, `ops_kpi_target.update`, `ops_kpi_target.cancel` to `AUDIT_ACTIONS` in `lib/constants.ts` and include them in the audit_logs action validator.
7. All list APIs must support pagination and filters for status/period/agent.

### Deliverables

- [ ] `convex/opsManagement.ts` - target CRUD mutations and list/detail queries
- [ ] `lib/constants.ts` - any additional target status constants used by backend validations
- [ ] `lib/constants.ts` and audit action validator - add `ops_kpi_target.create`, `ops_kpi_target.update`, `ops_kpi_target.cancel`
- [ ] `convex/crons.ts` - register internal function reference placeholders if needed for T03 integration

### Acceptance Criteria

1. Target CRUD APIs are callable through generated API types.
2. Permission checks block unauthorized target writes.
3. Overlap validation reliably rejects invalid target creation/update.
4. List/detail queries return agent metadata + target details in deterministic ordering.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/opsManagement.ts`, `lib/constants.ts`, and `convex/crons.ts` if modified.

### Out of Scope

- Actual computation and status auto-resolution (T03)
- Target creation dialog and table UI (T04/T05)

---

## T03: Target Actuals Computation Cron

### Objective

Compute daily actuals for active targets, update progress percentages, and resolve end-of-period status outcomes based on defined thresholds.

### Estimated Effort

L

### Required Reading

- `notes/features/20-ops-portal.md` - OPS operational metrics data sources
- `notes/features/22-incentive-v2.md` - quality score source references
- `notes/features/19-rent-negotiation.md` - negotiation closure metrics source
- `convex/crons.ts` - cron scheduling conventions
- `convex/visits.ts`, `convex/closures.ts`, `convex/leads.ts`, `convex/tenantInquiries.ts`, `convex/negotiations.ts` - source metric contracts

### Key Rules

1. Add `compute-target-actuals` cron in `convex/crons.ts` at `20:00 UTC` daily.
2. Implement internal mutation `computeTargetActuals` in `convex/opsManagement.ts` to iterate active targets.
3. Compute metric-specific actuals for all 9 required metrics. Required source rules include:
   - `leads_verified`: count via `audit_logs` where `action = "lead.verify"` and `actor_user_id = agent` within period.
   - `negotiation_closures`: count negotiations where `status = "CLOSED"`, `last_activity_at` in period, and `ops_user_id = agent`.
4. All period boundaries use IST (`Asia/Kolkata`) and half-open intervals `[start, end)` stored as UTC milliseconds; weekly is Monday 00:00 IST to next Monday 00:00 IST, monthly is 1st 00:00 IST to next 1st 00:00 IST.
5. Update `actual_value`, `progress_pct`, and `updated_at` each run.
6. Progress math must be direction-aware:
   - `HIGHER_BETTER`: `progress = (actual / target) * 100`
   - `LOWER_BETTER`: `progress = actual == 0 ? 200 : (target / actual) * 100`
7. If `period_end` has passed, set status using direction-aware rules:
   - `HIGHER_BETTER`: `EXCEEDED` (`actual >= target`), `COMPLETED` (`actual >= 80% target`), `MISSED` (`actual < 80% target`)
   - `LOWER_BETTER`: `EXCEEDED` (`actual <= target`), `MISSED` (`actual > target * 1.2`), otherwise `COMPLETED`
8. Keep math deterministic and guard against divide-by-zero for malformed targets.
9. Log computation failures per target without aborting the full batch.

### Deliverables

- [ ] `convex/opsManagement.ts` - `computeTargetActuals` internal mutation + metric calculators
- [ ] `convex/crons.ts` - register `compute-target-actuals` cron
- [ ] `lib/constants.ts` - metric/status constants reused by cron logic

### Acceptance Criteria

1. Cron runs daily and updates active targets with fresh actual/progress values.
2. End-of-period targets resolve into `EXCEEDED`, `COMPLETED`, or `MISSED` correctly.
3. Metric calculations pull from correct source tables and period windows.
4. Partial failures do not halt all target updates.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/opsManagement.ts`, `convex/crons.ts`, and any touched metric-source files.

### Out of Scope

- Manual adjustment of computed actuals
- Alerts/notifications for missed targets (handled in warning epic)

---

## T04: Target Setting Dialog UI

### Objective

Build the target-creation form workflow for CEO/Ops Head users with metric context, period derivation, and validation feedback.

### Estimated Effort

M

### Required Reading

- `notes/06-admin-panel-ux.md` - dialog/form UX patterns
- `notes/features/10-analytics.md` - trend context display patterns
- `src/components/admin/OpsCreateDialog.tsx` - react-hook-form + zod dialog conventions
- `src/components/ui/date-picker.tsx` - date input patterns

### Key Rules

1. Create `TargetSettingDialog.tsx` using `react-hook-form` + `zod`.
2. Include fields: agent selector, metric selector, target value, period type, period start, notes.
3. Auto-calculate `period_end` from period type and start date.
4. Display last-3-period historical performance for selected agent/metric before submit.
5. Enforce validation: positive target value, future period start, no overlapping active target.
6. Use mutation from T02 and show success/error via `sonner` toasts.

### Deliverables

- [ ] `src/components/admin/ops-command-center/TargetSettingDialog.tsx` - target creation form dialog
- [ ] `src/components/admin/ops-command-center/metric-options.ts` - metric labels/descriptions used by dialog and table filters
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate create-target trigger button and dialog state

### Acceptance Criteria

1. Dialog opens from command center and validates all required fields.
2. Submitting valid form creates target and refreshes visible target data.
3. Historical metric context appears for selected agent/metric.
4. Overlap and validation errors are shown inline and via toast messaging.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/admin/ops-command-center/TargetSettingDialog.tsx`, `src/components/admin/ops-command-center/metric-options.ts`, and `src/app/(admin)/admin/ops-command-center/page.tsx`.

### Out of Scope

- Bulk target import
- Target template presets
- Advanced forecasting suggestions

---

## T05: Agent Targets Tracking View

### Objective

Deliver an Ops Head-friendly tracking table for all targets with filtering, sorting, progress color cues, and team-level metric summaries.

### Estimated Effort

M

### Required Reading

- `notes/06-admin-panel-ux.md` - table, filter, and badge conventions
- `src/components/admin/SortableHeader.tsx` - sortable column pattern
- `src/components/ui/tabs.tsx` and `src/components/ui/select.tsx` - filter controls

### Key Rules

1. Create `AgentTargetsView.tsx` as the primary targets table section.
2. Columns must include agent, metric, target, actual, progress %, status, and period.
3. Support filters for agent/metric/period type/status and sort by progress/agent/period.
4. Progress visualization colors: green (`>=80%`), yellow (`50-79%`), red (`<50%`).
5. Provide bulk view across all agents plus team hit-rate summary by metric.
6. Integrate with E01 summary card drill-down states.

### Deliverables

- [ ] `src/components/admin/ops-command-center/AgentTargetsView.tsx` - target table with filters, sorting, summary row
- [ ] `src/components/admin/ops-command-center/TargetProgressBar.tsx` - reusable progress-cell component
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate targets section and card-to-filter wiring

### Acceptance Criteria

1. Table renders all target rows with correct progress and status badges.
2. Filter and sort controls work together without resetting unexpectedly.
3. Team summary row shows metric-level hit rates based on visible rows.
4. Progress color bands match the required thresholds.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/admin/ops-command-center/AgentTargetsView.tsx`, `src/components/admin/ops-command-center/TargetProgressBar.tsx`, and `src/app/(admin)/admin/ops-command-center/page.tsx`.

### Out of Scope

- Cross-phase warning issuance from table actions
- Export/report download workflows
- Mobile-first redesign of command center

---

## T06: Bulk Target Operations

### Objective

Add scalable bulk target workflows for Ops Head users to quickly apply templates to all active OPS agents and roll forward prior-period targets with optional percentage adjustments.

### Estimated Effort

M

### Required Reading

- `notes/11-convex-architecture.md` - mutation auth + audit patterns
- `notes/03-roles-and-permissions.md` - permission enforcement conventions
- `src/components/admin/OpsCreateDialog.tsx` - dialog + preview/confirm flow patterns
- `src/components/admin/ops-command-center/TargetSettingDialog.tsx` - existing target UX and validation conventions

### Key Rules

1. Implement `applyTargetTemplate` mutation in `convex/opsManagement.ts` with input `template: Record<MetricKey, number>`, `period_type`, `period_start`, `period_end`.
2. `applyTargetTemplate` must create one target per metric per active OPS agent, skip overlaps for `agent + metric + overlapping period`, and return `{ created, skipped, errors }` summary.
3. Implement `rollForwardTargets` mutation in `convex/opsManagement.ts` with `source_period_start`, `source_period_end`, `new_period_start`, `new_period_end`, and optional `adjustment_pct`.
4. `rollForwardTargets` must copy source-period targets into the new period, apply optional percentage adjustment to target values, skip overlap duplicates, and return `{ created, skipped, errors }`.
5. Both mutations must enforce `requirePermission(ctx, "ops_management.set_targets")`.
6. Add audit action literals to constants and audit action validator: `ops_kpi_target.bulk_create` and `ops_kpi_target.roll_forward`.
7. Build `BulkTargetDialog.tsx` with template entry fields, period selector, dry-run preview of records to create/skip, and explicit confirm action.
8. Dialog UX must keep overlap handling visible in preview and post-submit result summary (created/skipped/errors).

### Deliverables

- [ ] `convex/opsManagement.ts` - `applyTargetTemplate` and `rollForwardTargets` mutations with overlap-safe bulk logic
- [ ] `src/components/admin/ops-command-center/BulkTargetDialog.tsx` - template + roll-forward dialog with preview and confirm
- [ ] `lib/constants.ts` and audit action validator - add `ops_kpi_target.bulk_create`, `ops_kpi_target.roll_forward`
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate bulk target entry points and dialog wiring

### Acceptance Criteria

1. Template apply creates targets for all active OPS agents across provided metric template entries.
2. Roll-forward copies prior-period targets into the new period with optional percentage adjustment.
3. Overlap detection prevents duplicate target creation and reports skipped records.
4. Preview clearly shows what will be created vs skipped before confirm.
5. Both mutations emit audit actions `ops_kpi_target.bulk_create` and `ops_kpi_target.roll_forward`.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/opsManagement.ts`, `src/components/admin/ops-command-center/BulkTargetDialog.tsx`, `src/app/(admin)/admin/ops-command-center/page.tsx`, and `lib/constants.ts`.

### Out of Scope

- CSV-based target imports
- ML-based target recommendations
- Cross-phase warning auto-issuance from bulk operations

---

## Out of Scope (All Tasks)

- Warning lifecycle and escalation state machine
- Check-in notes CRUD and review compliance nudges
- Messaging integrations (WhatsApp/SMS/email beyond existing notification engine hooks)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-21

### What Was Built

- Added `ops_kpi_targets` table + indexes and wired it into audit-trigger coverage.
- Implemented target lifecycle backend in `convex/opsManagement.ts` (`createTarget`, `updateTarget`, `cancelTarget`, `listTargetsForAgent`, `listAllTargets`, `getTargetDetail`).
- Implemented bulk target workflows (`applyTargetTemplate`, `rollForwardTargets`) with overlap checks and summary response payloads.
- Implemented `computeTargetActuals` internal mutation and scheduled `compute-target-actuals` daily cron.
- Added full target UI surface (`TargetSettingDialog`, `AgentTargetsView`, `TargetProgressBar`, `BulkTargetDialog`, `metric-options`) and integrated it into command-center page.

### Key File Locations

| File                                                              | What                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `convex/schema.ts`                                                | `ops_kpi_targets` schema fields + indexes                             |
| `convex/opsManagement.ts`                                         | Target CRUD, bulk operations, actual computation, list/detail queries |
| `convex/crons.ts`                                                 | `compute-target-actuals` cron registration                            |
| `lib/constants.ts`                                                | KPI permissions, metric enums, audit actions, config keys/defaults    |
| `src/components/admin/ops-command-center/TargetSettingDialog.tsx` | Single-target create form                                             |
| `src/components/admin/ops-command-center/AgentTargetsView.tsx`    | Team target tracking table and filters                                |
| `src/components/admin/ops-command-center/TargetProgressBar.tsx`   | Reusable progress visualization                                       |
| `src/components/admin/ops-command-center/BulkTargetDialog.tsx`    | Template apply + roll-forward flows                                   |
| `src/components/admin/ops-command-center/metric-options.ts`       | Shared metric labels/descriptions/options                             |

### Deviations from Spec

- Schema index naming finalized as `by_agent` (not `by_agent_period_status`) to match existing query style.
- Target-management UX is intentionally available in Ops Head mode only (`view=ops_head`) on the shared command-center page.
- Original spec included a response-time metric candidate; implementation keeps the 9-metric set and does not add response-time fields.

### Gotchas for Next Epic

- Overlap validation is strict for active targets across intersecting time windows on `agent + metric`; the most common setup failure is period overlap, not permission.
- Period windows are enforced with future-start policy on creation and half-open boundaries for computation.
- `computeTargetActuals` is fault-tolerant per target and logs partial failures instead of aborting the whole batch.
