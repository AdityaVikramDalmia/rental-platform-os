---
id: P31-E03
title: RM Operations
phase: 31
status: done
depends_on: ["P31-E02"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
completed_at: 2026-02-19
---

# P31-E03: RM Operations

## Overview

Add the operational automation layer on top of RM core: check-in reminders, SLA breach detection, owner dormancy lifecycle automation, RM performance scoring, escalation progression, and a minimal authenticated owner status view.

This epic is intentionally deferrable once P31-E02 is complete, but its schema/contracts are part of Phase 31 scope.

## Prerequisites

- **Read first**: [P31-E02 Completion Summary](P31-E02-rm-assignment-core.md#completion-summary)
- RM assignment and check-in core flows must be implemented and stable.

## Task Queue

- [x] P31-E03-T01: Add cron for check-in reminders and SLA breach detection
- [x] P31-E03-T02: Add cron for owner lifecycle transitions (`MANAGED -> DORMANT`)
- [x] P31-E03-T03: Implement RM performance score calculation
- [x] P31-E03-T04: Implement escalation automation (`WARNING -> ESCALATED`)
- [x] P31-E03-T05: Build minimal authenticated owner status page

---

## T01: Add Cron for Check-In Reminders and SLA Breach Detection

### Objective

Automate daily checks for overdue RM assignments, mark SLA breaches, and generate reminder/escalation-ready data.

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - RM SLA tracking fields and warning conditions
- `convex/crons.ts` - existing cron registration patterns
- `convex/rmAssignments.ts` - assignment query/update APIs

### Key Rules

1. Add scheduled job to process assignments by `next_check_in_due`.
2. Increment `missed_check_ins_count` and `sla_breach_count` when due dates are missed.
3. Update `last_sla_breach_at` and escalation level fields consistently.
4. Ensure idempotent daily processing (avoid duplicate increments for same day window).
5. Keep mutation scope bounded to overdue records only.

### Deliverables

- [x] `convex/crons.ts` - new RM SLA cron entries
- [x] internal mutation/query functions in `convex/rmAssignments.ts` (or dedicated RM ops module)

### Acceptance Criteria

1. Overdue assignments are detected based on Unix-ms due timestamps.
2. Breach counters update once per processing window.
3. Cron does not modify non-overdue assignments.
4. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Run cron function locally in dev and verify assignment counters update correctly.

### Out of Scope

- Notification delivery channel implementation.
- Owner lifecycle stage changes.

---

## T02: Add Cron for Owner Lifecycle Transitions (`MANAGED -> DORMANT`)

### Objective

Automate owner dormancy transitions when no qualifying activity occurs for 90+ days.

### Depends On

P31-E01, P31-E02

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - owner lifecycle transition rules
- `convex/owners.ts` - owner update/query behavior

### Key Rules

1. Process owners in `MANAGED` lifecycle stage only.
2. Transition to `DORMANT` when `last_activity_at` exceeds 90-day threshold.
3. Write `lifecycle_updated_at` on each lifecycle change.
4. Keep transition validation centralized via lifecycle transition map.
5. Re-activation to `ACTIVE` remains event-driven (lead/listing/closure activity), not cron-driven.

### Deliverables

- [x] lifecycle cron registration in `convex/crons.ts`
- [x] owner lifecycle batch update function in `convex/owners.ts`

### Acceptance Criteria

1. Eligible owners transition from `MANAGED` to `DORMANT` automatically.
2. Non-eligible owners remain unchanged.
3. Transition audit logging occurs via wrapped mutation path.
4. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Run lifecycle cron in dev with seeded owners and validate stage updates.

### Out of Scope

- CHURNED lifecycle automation.
- RM reassignment behavior.

---

## T03: Implement RM Performance Score Calculation

### Objective

Introduce a periodic RM performance score (0-100) used by warning/escalation transitions.

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - performance-score thresholds (`<60`, `<40`)
- `convex/system_config` usage patterns for configurable thresholds/weights

### Key Rules

1. Compute score using transparent inputs (missed check-ins, SLA breaches, owner satisfaction, response timeliness).
2. Store score on active assignment as `performance_score`.
3. Keep formula versioned/configurable via `system_config` where practical.
4. Clamp score to integer range `0..100`.
5. Document scoring inputs in constants/docs so operations can interpret outcomes.

### Deliverables

- [x] scoring function in RM domain module
- [x] cron/manual trigger to recalculate performance scores
- [x] config keys/constants for score thresholds (if introduced)

### Acceptance Criteria

1. Every active assignment can produce a deterministic score.
2. Score is persisted and available to dashboard/escalation logic.
3. Threshold checks for warning/escalation can read this score directly.
4. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Validate sample assignments against expected score outputs.

### Out of Scope

- Bonus/payout linkage from RM score.
- ML-based scoring.

---

## T04: Implement Escalation Automation (`WARNING -> ESCALATED`)

### Objective

Automatically move deteriorating assignments into `ESCALATED` when warning-level issues persist.

### Depends On

P31-E03-T01, P31-E03-T03

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - escalation transition conditions
- `lib/constants.ts` - RM transition map

### Key Rules

1. Escalate when warning conditions worsen (`missed_check_ins_count >= 3` OR `performance_score < 40`).
2. Maintain transition validation through centralized transition map.
3. Preserve manual admin override paths.
4. Update `escalation_level` and timestamp fields consistently.
5. Do not escalate terminal assignments.

### Deliverables

- [x] escalation processing function in RM ops module
- [x] dashboard/status query updates to surface escalations in real time

### Acceptance Criteria

1. Eligible warning assignments transition to `ESCALATED` automatically.
2. Non-eligible warnings remain in `WARNING`.
3. Transition metadata (`escalation_level`, `updated_at`) is correct.
4. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Run escalation function in dev with seeded warning assignments and verify transitions.

### Out of Scope

- Notification dispatch implementation.
- Reassignment UX changes.

---

## T05: Build Minimal Authenticated Owner Status Page

### Objective

Provide a minimal owner-facing page showing current RM contact and current management status.

### Depends On

P31-E02

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - minimal owner status requirement
- owner auth flow docs in `notes/features/14-owner-services.md`

### Key Rules

1. Owner must be authenticated and linked (`owners.user_id`) to view page.
2. Page should include owner lifecycle stage, RM name, RM contact method, and latest check-in summary.
3. Keep page intentionally minimal (no full owner dashboard scope).
4. Handle "no active RM" state with clear fallback message.
5. Use established mobile-friendly patterns and existing UI components.

### Deliverables

- [x] `src/app/(owner)/owner/status/page.tsx` (or route aligned with owner portal conventions)
- [x] owner status query endpoint in owner/owners RM module

### Acceptance Criteria

1. Authenticated owner can open status page and view RM details when assigned.
2. Unlinked/unauthorized users are blocked.
3. Empty-state messaging appears when no RM assignment exists.
4. Build succeeds.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on owner status page and related query modules.

### Out of Scope

- Full owner portal.
- Owner self-service reassignment or dispute workflows.

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-19

### What Was Built

- Added RM operations automation across cron-invoked mutation paths: SLA breach processing, performance score recalculation, warning/escalation transitions, and owner dormancy lifecycle progression.
- Integrated operational data into admin surfaces so escalations/upcoming check-ins are visible with actionable reassignment/check-in controls.
- Shipped minimal authenticated owner status capability via owner-scoped profile/properties/RM/check-in queries for lightweight owner visibility without a full owner dashboard.

### Key File Locations

- `convex/crons.ts`
- `convex/rmAssignments.ts`
- `convex/owners.ts`
- `src/app/(owner)/owner/status/page.tsx`
- `src/app/(admin)/admin/rm-dashboard/page.tsx`

### Deviations from Spec

- Performance scoring uses deterministic rule-based weighting (missed check-ins, SLA breaches, resolved recent check-ins) rather than configurable formula weights.
- Escalation/reminder automation updates data state only; outbound notification channels remain out of scope.

### Gotchas for Next Epic

- Lifecycle dormancy cron only targets `MANAGED` owners and skips owners with active published listings or non-terminal RM assignments.
- `processSlaBreach` uses a 24-hour idempotency window keyed by `last_sla_breach_at`; reruns within the same window do not double-count.
- Owner status page depends on `owners.user_id` linkage; unlinked owner records correctly return empty/blocked states.
