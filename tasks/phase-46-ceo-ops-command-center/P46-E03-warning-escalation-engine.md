---
id: P46-E03
title: Warning and Escalation Engine
phase: 46
status: done
depends_on: ["P46-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-21
---

# P46-E03: Warning and Escalation Engine

## Overview

Add structured OPS performance warning workflows that support manual and automated warning issuance, acknowledgment/resolution/escalation lifecycle tracking, and policy-driven expiry/escalation automation. This is an operational warning system (not formal HR PIP) focused on field accountability.

## Prerequisites

- **Read first**: [P46-E02 Completion Summary](P46-E02-kpi-targets-tracking.md#completion-summary) - target status transitions and missed-target signal contracts used in warning auto-detection.
- P35 notification infrastructure must be available for warning and escalation alerts.
- Quality score and activity signals from P30/P32 must be queryable and stable.

## Task Queue

- [x] P46-E03-T01: Schema for `ops_warnings` + Warning Config Keys
- [x] P46-E03-T02: Warning Lifecycle Backend APIs
- [x] P46-E03-T03: Auto-Detection, Expiry, and Escalation Crons
- [x] P46-E03-T04: Warning UI Components and Command Center Integration

---

## T01: Schema for `ops_warnings` + Warning Config Keys

### Objective

Define warning storage model, indexes, warning policy config keys, and warning-issue permission constants.

### Estimated Effort

M

### Required Reading

- `notes/10-convex-schema.md` - table/index design and soft-delete conventions
- `notes/13-constants-reference.md` - config/permission naming patterns
- `notes/03-roles-and-permissions.md` - permission gate conventions
- `convex/schema.ts`, `lib/constants.ts`, `convex/seed.ts` - existing extension patterns

### Key Rules

1. Add `ops_warnings` to `convex/schema.ts` with all required fields and indexes, including:
   - `issued_by_user_id: v.optional(v.id("users"))`
   - `issued_by_type: v.union(v.literal("USER"), v.literal("SYSTEM"))`
   - `escalated_from_id: v.optional(v.id("ops_warnings"))`
   - `updated_at: v.number()`
   - `trigger_type: v.union(v.literal("AUTO"), v.literal("MANUAL"))`
   - `trigger_reason: v.union(v.literal("LOW_QUALITY_SCORE"), v.literal("MISSED_TARGETS"), v.literal("SLA_BREACHES"), v.literal("INACTIVITY"), v.literal("CUSTOM"))`
   - `status: v.union(v.literal("ACTIVE"), v.literal("ACKNOWLEDGED"), v.literal("RESOLVED"), v.literal("EXPIRED"), v.literal("ESCALATED"))`
2. Add `is_deleted: v.boolean()` and use soft-delete-safe query patterns.
3. Add `ops_management.issue_warnings` permission to `lib/constants.ts`.
4. Add warning config keys with defaults:
   - `warning_quality_threshold` (`40`)
   - `warning_target_miss_streak` (`3`)
   - `warning_sla_breach_count_30d` (`5`)
   - `warning_inactivity_days` (`7`)
   - `warning_level1_expiry_days` (`30`)
   - `warning_level2_expiry_days` (`60`)
   - `warning_escalation_auto` (`true`)
5. Add indexes for expiry/dedupe flows: `.index("by_status_expires_at", ["status", "expires_at"])` and `.index("by_agent_level_reason_status", ["agent_user_id", "warning_level", "trigger_reason", "status"])`.
6. Add `ops_warnings` to `AUDITED_TABLES` in `convex/functions.ts`.

### Deliverables

- [ ] `convex/schema.ts` - add `ops_warnings` table + indexes (`by_agent_status`, `by_level_status`, `by_status_created`, `by_status_expires_at`, `by_agent_level_reason_status`)
- [ ] `lib/constants.ts` - add warning permission/status/trigger constants
- [ ] `convex/seed.ts` - seed warning config defaults idempotently
- [ ] `convex/functions.ts` - include `ops_warnings` in audited tables

### Acceptance Criteria

1. Schema and indexes compile with required warning fields.
2. Warning permission and config keys are exported and seeded.
3. Warning table writes are audit-triggered.
4. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, `convex/seed.ts`, and `convex/functions.ts`.

### Out of Scope

- Warning lifecycle mutation logic
- Auto-detection cron implementation
- Warning UI interactions

---

## T02: Warning Lifecycle Backend APIs

### Objective

Implement warning lifecycle mutations and queries with level constraints and strict status transitions.

### Estimated Effort

L

### Required Reading

- `notes/04-state-machines.md` - transition validation pattern
- `notes/11-convex-architecture.md` - mutation/query organization and permission checks
- `convex/auth.helpers.ts` - permission and actor resolution patterns
- `convex/notifications.ts` - event enqueueing conventions for later notification triggers

### Key Rules

1. Implement in `convex/opsManagement.ts`:
   - `issueWarning`
   - `acknowledgeWarning`
   - `resolveWarning`
   - `escalateWarning`
   - `listWarningsForAgent`
   - `getActiveWarnings`
   - `getWarningSummary`
2. Warning state machine must be enforced exactly:
   - `ACTIVE -> ACKNOWLEDGED | RESOLVED | EXPIRED | ESCALATED`
   - `ACKNOWLEDGED -> RESOLVED | EXPIRED | ESCALATED`
   - `RESOLVED` (terminal)
   - `EXPIRED` (terminal)
   - `ESCALATED` (terminal; escalation creates a new warning at next level)
3. `issueWarning` must reject duplicate active warning at same level for same agent and enforce non-decreasing level policy.
4. `escalateWarning` must create a new warning row at `level + 1`, set `escalated_from_id` on the new row to the old warning ID, and transition old warning to `ESCALATED`.
5. Expiry windows are derived from config keys by warning level.
6. Mutations require `ops_management.issue_warnings` except self-acknowledge path (agent can acknowledge own warning).
7. Add audit action literals `ops_warning.issue`, `ops_warning.acknowledge`, `ops_warning.resolve`, `ops_warning.escalate` to `AUDIT_ACTIONS` and the audit_logs action validator.

### Deliverables

- [ ] `convex/opsManagement.ts` - warning lifecycle mutations and summary/list queries
- [ ] `lib/constants.ts` - warning lifecycle enums/types if expanded during implementation
- [ ] `lib/constants.ts` and audit action validator - add `ops_warning.issue`, `ops_warning.acknowledge`, `ops_warning.resolve`, `ops_warning.escalate`
- [ ] `convex/notifications.ts` - optional event helper wiring for warning events (if needed by implementation)

### Acceptance Criteria

1. Manual warning issue, acknowledge, resolve, and escalate flows work end-to-end.
2. Invalid level transitions or duplicate active warnings are rejected.
3. Agent warning history query returns chronologically sorted lifecycle data.
4. Warning summary query returns counts by level and status for dashboard cards.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/opsManagement.ts`, `lib/constants.ts`, and `convex/notifications.ts` if modified.

### Out of Scope

- Scheduled auto-detection and expiry/escalation jobs
- Warning timeline UI rendering

---

## T03: Auto-Detection, Expiry, and Escalation Crons

### Objective

Automate warning creation from operational risk signals and automate expiry/escalation behavior based on policy config.

### Estimated Effort

L

### Required Reading

- `notes/features/20-ops-portal.md` - OPS activity signals and quality expectations
- `notes/features/10-analytics.md` - SLA and risk signal interpretation patterns
- `convex/crons.ts` - cron registration conventions
- `convex/opsManagement.ts` - warning and target APIs from T02/E02

### Key Rules

1. Register `auto-detect-warnings` at `21:00 UTC` daily.
2. Register `auto-expire-warnings` at `21:30 UTC` daily.
3. Auto-detection must evaluate per active OPS agent:
   - quality below threshold
   - missed target streak threshold
   - SLA breach count threshold (30d)
   - inactivity days threshold
4. Auto-issued warnings use `issued_by_type = "SYSTEM"` and optional `issued_by_user_id` (unset unless a concrete user actor is intentionally mapped).
5. Expiry cron targets ONLY unresolved warnings in `ACTIVE` or `ACKNOWLEDGED` where `expires_at` has passed; it must never modify `RESOLVED` warnings.
6. If `warning_escalation_auto = true`, expired unresolved warnings must auto-escalate by creating a new warning at `level + 1` and setting old warning status to `ESCALATED`.
7. If `warning_escalation_auto = false`, expired unresolved warnings transition to `EXPIRED`.
8. Trigger P35 notification events for new warning and escalation outcomes.
9. Ensure cron jobs are idempotent and avoid duplicate warning issuance for the same trigger condition.

### Deliverables

- [ ] `convex/opsManagement.ts` - internal auto-detection/auto-expiry/escalation handlers
- [ ] `convex/crons.ts` - register warning automation crons
- [ ] `convex/notifications.ts` - warning/escalation event enqueue integration

### Acceptance Criteria

1. Auto-detection creates level-1 warnings when thresholds are breached.
2. Duplicate active warnings are not created for the same trigger condition.
3. Expiry and auto-escalation logic follows config flags and timing windows.
4. Warning/escalation notification events are emitted for downstream delivery.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/opsManagement.ts`, `convex/crons.ts`, and `convex/notifications.ts`.

### Out of Scope

- Manual warning issue UI
- Check-in compliance warnings
- HR/PIP workflow integration

---

## T04: Warning UI Components and Command Center Integration

### Objective

Provide admin-facing warning issuance and lifecycle controls through reusable command-center components and per-agent warning timeline visualization.

### Estimated Effort

M

### Required Reading

- `notes/06-admin-panel-ux.md` - dialog/timeline/table interaction conventions
- `src/components/admin/VerificationDialog.tsx` - mutation form pattern
- `src/components/admin/guards/guard-audit-tab.tsx` - timeline/history rendering pattern
- `tasks/phase-46-ceo-ops-command-center/P46-E01-command-center-dashboard.md` - heatmap/agent profile integration points

### Key Rules

1. Create `WarningDialog.tsx` for manual warning issuance with agent selection, suggested level, trigger reason, description, and evidence notes.
2. Create `WarningTimeline.tsx` to display historical warning lifecycle with action controls.
3. Create `WarningBadge.tsx` for compact warning level display in heatmap/table contexts.
4. Integrate warning tab into `AgentProfileSheet.tsx` and warning indicators into `TeamHealthHeatmap.tsx`.
5. Lifecycle actions (acknowledge/resolve/escalate) must invoke backend APIs with optimistic but safe UI refresh.

### Deliverables

- [ ] `src/components/admin/ops-command-center/WarningDialog.tsx` - manual warning form dialog
- [ ] `src/components/admin/ops-command-center/WarningTimeline.tsx` - per-agent warning history + lifecycle actions
- [ ] `src/components/admin/ops-command-center/WarningBadge.tsx` - reusable warning indicator component
- [ ] `src/components/admin/ops-command-center/AgentProfileSheet.tsx` - add warnings tab integration
- [ ] `src/components/admin/ops-command-center/TeamHealthHeatmap.tsx` - add warning badge/level display
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - command-center level warning interactions

### Acceptance Criteria

1. Manual warning issuance works and updates warning summary views.
2. Timeline displays warning history with statuses, dates, and resolution notes.
3. Acknowledge/resolve/escalate actions update warning lifecycle correctly.
4. Warning badges are visible in heatmap cards and profile contexts.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all modified files under `src/components/admin/ops-command-center/` and `src/app/(admin)/admin/ops-command-center/page.tsx`.

### Out of Scope

- Auto-detection threshold tuning UI
- External communications tooling
- Deactivation execution workflow beyond recommendation state

---

## Out of Scope (All Tasks)

- Formal HR PIP workflow implementation
- WhatsApp integrations for warning delivery
- Compensation/payroll deductions

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-21

### What Was Built

- Added `ops_warnings` table and warning-related config keys/permission constants.
- Implemented warning lifecycle backend in `convex/opsManagement.ts` (`issueWarning`, `acknowledgeWarning`, `resolveWarning`, `escalateWarning`, `listWarningsForAgent`, `getActiveWarnings`, `getWarningSummary`, `getMyWarnings`).
- Implemented automation handlers (`autoDetectWarnings`, `autoExpireWarnings`) and wired daily cron jobs in `convex/crons.ts`.
- Integrated P35 event enqueueing for warning issue/escalate/resolve and system-detected warning flows.
- Delivered warning UI modules (`WarningDialog`, `WarningTimeline`, `WarningBadge`) and wired warning interactions into command-center/agent-profile surfaces.

### Key File Locations

| File                                                            | What                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `convex/schema.ts`                                              | `ops_warnings` schema + lifecycle indexes                                     |
| `convex/opsManagement.ts`                                       | Warning lifecycle mutations/queries + auto-detect/expiry/escalation internals |
| `convex/crons.ts`                                               | `auto-detect-warnings` and `auto-expire-warnings` cron registration           |
| `lib/constants.ts`                                              | Warning permission/config keys and warning audit action literals              |
| `src/components/admin/ops-command-center/WarningDialog.tsx`     | Manual warning issuance dialog                                                |
| `src/components/admin/ops-command-center/WarningTimeline.tsx`   | Lifecycle timeline + manager actions                                          |
| `src/components/admin/ops-command-center/WarningBadge.tsx`      | Compact warning-level indicator                                               |
| `src/components/admin/ops-command-center/AgentProfileSheet.tsx` | Warning tab integration                                                       |

### Deviations from Spec

- Self-acknowledge is supported for the warning recipient via `acknowledgeWarning` even without manager warning permission; manager flows still require `ops_management.issue_warnings`.
- Auto-detection creates one warning per cycle based on severity-priority reason selection (SLA > target misses > low quality > inactivity), instead of creating multiple simultaneous warnings.
- Warning notifications are queued via P35 event pipeline and treated as non-blocking side effects.

### Gotchas for Next Epic

- Escalation is capped at level 3; attempts to escalate beyond level 3 are rejected.
- Duplicate active warning protection (`agent + level + reason`) is enforced in both manual and automated flows.
- Expiry automation only processes unresolved statuses (`ACTIVE`, `ACKNOWLEDGED`); resolved warnings remain terminal.
