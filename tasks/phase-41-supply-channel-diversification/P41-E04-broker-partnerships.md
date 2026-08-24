---
id: P41-E04
title: Broker Partnerships
phase: 41
status: pending
depends_on: ["P41-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P41-E04: Broker Partnerships

## Overview

Implement broker partner onboarding, intake gating, quality-based suspension, reinstatement appeals, and commission attribution that respects collision outcomes and canonical lead ownership.

## Prerequisites

- Read first: `P41-E01` completion summary for source/collision contracts.
- Use `broker_partnerships` naming consistently across schema, constants, modules, UI, and docs.
- Ensure required supply permissions/config keys exist from E01 before coding this epic.

## Task Queue

- [ ] P41-E04-T01: Implement `broker_partnerships` schema and onboarding lifecycle
- [ ] P41-E04-T02: Implement broker intake with quality-gate calculations and collision-safe attribution
- [ ] P41-E04-T03: Implement suspension/reinstatement automation (`checkBrokerPerformance`) and appeals
- [ ] P41-E04-T04: Build broker admin workspace for onboarding, performance, and commission visibility

---

## T01: Implement `broker_partnerships` Schema and Onboarding Lifecycle

### Objective

Create broker partnership data model and legal status transitions (`APPLIED -> UNDER_REVIEW -> APPROVED -> ACTIVE -> SUSPENDED -> TERMINATED`) with auditability and clear naming consistency.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/10-convex-schema.md`
- `notes/04-state-machines.md`
- `lib/constants.ts`
- `convex/schema.ts`

### Key Rules

1. Do not use `broker_registrations`; only `broker_partnerships` is valid.
2. Store suspension metadata (`suspended_at`, `suspension_reason`, `appeal_eligible_at`).
3. Lifecycle transitions must validate actor permission and current status.
4. Track rolling performance fields needed by cron-based checks.
5. Store commission settings with default `broker_commission_pct=5000` (50.00%).

### Deliverables

- [ ] `convex/schema.ts` - `broker_partnerships` table and indexes
- [ ] `convex/brokerPartnerships.ts` - onboarding lifecycle mutations/queries
- [ ] `lib/constants.ts` - broker lifecycle enums and labels (if not already present)

### Acceptance Criteria

1. Schema and module use only `broker_partnerships` naming.
2. Broker lifecycle rejects illegal transitions.
3. Broker onboarding enforces review prerequisites before `UNDER_REVIEW -> APPROVED`.
4. Required onboarding status events are auditable.
5. Commission configuration defaults to 50% and is readable in queries.
6. Partnership records include fields required for suspension/reinstatement calculations.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `convex/brokerPartnerships.ts`, and changed constants.

### Out of Scope

- Broker performance cron

---

## T02: Implement Broker Intake With Quality-Gate Calculations and Collision-Safe Attribution

### Objective

Allow broker-submitted leads only when broker status and quality gates pass, and ensure canonical source/collision rules control payout eligibility.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/03-lead-pipeline.md`
- `convex/leads.ts`
- `convex/sourceCollisions.ts`
- `convex/brokerPartnerships.ts`

### Key Rules

1. Broker lead intake requires broker status `ACTIVE`.
2. Conversion metric formula is fixed: `verified_leads / total_leads`.
3. Under-threshold definition is `< 1000 bps` with minimum sample size 5 leads per 30-day window.
4. Intake must set `source_channel=BROKER` with typed source metadata.
5. Collision loser outcomes must void broker commission eligibility.

### Deliverables

- [ ] `convex/brokerPartnerships.ts` - broker intake mutations and validation guards
- [ ] `convex/leads.ts` - broker source ingestion hooks
- [ ] `convex/sourceCollisions.ts` - commission-void payout impact mapping for broker loser paths

### Acceptance Criteria

1. Non-active or suspended brokers cannot submit new leads.
2. Broker leads create canonical source linkage with `source_channel=BROKER` and remain backward compatible with existing lead pipeline.
3. Intake path enforces per-broker submission limits from config before lead creation.
4. Collision loser status for broker source sets commission to voided state.
5. Broker commission amount computes at 50% of platform brokerage fee by default (`broker_commission_pct=5000`).
6. Commission entries are marked for clawback when closure is cancelled/reversed within the configured window.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed broker, lead, and collision modules.

### Out of Scope

- Broker admin UI

---

## T03: Implement Suspension/Reinstatement Automation (`checkBrokerPerformance`) and Appeals

### Objective

Automate broker performance evaluation and suspension policy, then implement reinstatement appeal rules (manual appeal after 90 days).

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `convex/crons.ts`
- `convex/brokerPartnerships.ts`
- `convex/notifications.ts`

### Key Rules

1. Cron `checkBrokerPerformance` runs weekly Monday 06:00 IST.
2. Evaluate rolling windows using config keys: minimum sample, window days, consecutive windows.
3. Auto-suspend after 2 consecutive under-threshold windows.
4. Reinstatement requires manual appeal and 90-day cooldown from suspension.
5. Suspension/reinstatement must emit notification and audit events.
6. Suspension trigger threshold test must include 8% conversion scenario.

### Deliverables

- [ ] `convex/brokerPartnerships.ts` - performance aggregation, suspension, reinstatement logic
- [ ] `convex/crons.ts` - broker performance cron registration
- [ ] `convex/notifications.ts` - suspension and appeal outcome notifications

### Acceptance Criteria

1. Performance cron updates broker metrics and suspension counters.
2. Brokers with conversion below 10% for 2 consecutive 30-day windows auto-transition to `SUSPENDED`.
3. A test scenario with 8% conversion for two windows deterministically triggers suspension.
4. Reinstatement path enforces manual review plus 90-day wait.
5. After conversion improves above threshold and admin approves, broker transitions back to `ACTIVE`.
6. Suspension/reinstatement notifications and audit actions are emitted exactly once per transition.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/brokerPartnerships.ts`, `convex/crons.ts`, and changed notification files.

### Out of Scope

- Corporate SLA logic

---

## T04: Build Broker Admin Workspace for Onboarding, Performance, and Commission Visibility

### Objective

Deliver admin tools to manage broker applications, monitor conversion windows, suspend/reinstate partners, and inspect commission eligibility including collision-voided outcomes.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `src/app/(admin)/admin/guards/page.tsx`
- `src/components/admin/dashboard/DashboardKPICards.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/tabs.tsx`

### Key Rules

1. Mutations require `supply.brokers.manage` or `supply.brokers.suspend`.
2. Performance view must display numerator/denominator and conversion bps.
3. Commission view must clearly separate `eligible`, `pending`, `voided_collision`, `paid` states.
4. Admin actions must preserve audit trail context with explicit reasons.

### Deliverables

- [ ] `src/app/(admin)/admin/supply/brokers/page.tsx` - broker operations page
- [ ] `src/components/admin/supply/broker-partnership-table.tsx` - onboarding + lifecycle actions
- [ ] `src/components/admin/supply/broker-performance-card.tsx` - rolling window metrics and threshold signal
- [ ] `src/components/admin/supply/broker-commission-panel.tsx` - commission status breakdown

### Acceptance Criteria

1. Admin can process broker lifecycle transitions and view appeal eligibility windows.
2. Under-threshold brokers are visibly flagged before suspension events.
3. Commission panel reflects default 50% commission and collision-based void outcomes correctly.
4. Commission panel shows `eligible`, `pending`, `voided_collision`, `paid`, and `clawback_pending` states.
5. Admin can inspect per-window conversion inputs (numerator/denominator, bps, threshold) used for suspension decisions.
6. Page works without layout regressions on supported desktop viewport.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed broker admin pages/components.

### Out of Scope

- Secretary/resident/corporate admin pages

---

## Epic Verification (Task-Specific)

Run these checks before marking the epic done:

1. Register a broker and approve after review.
2. Submit broker-origin lead and verify commission is calculated at 50% of brokerage fee.
3. Set broker conversion to 8% for 2 consecutive windows and verify broker transitions to `SUSPENDED`.
4. Improve conversion above threshold, complete admin review, and verify broker reinstates to `ACTIVE`.

## Completion Summary

> Write this section when epic status changes to `done`.

**Completed**: YYYY-MM-DD

### What Was Built

- [To be filled during completion]

### Key File Locations

| File  | What  |
| ----- | ----- |
| `TBD` | `TBD` |

### Deviations from Spec

- [To be filled during completion]

### Gotchas for Next Epic

- [To be filled during completion]
