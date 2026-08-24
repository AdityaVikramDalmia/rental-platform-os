---
id: P37-E03
title: Lease Renewal & Move-Out
phase: 37
status: pending
depends_on: ["P37-E01", "P37-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P37-E03: Lease Renewal & Move-Out

## Overview

Implement lease expiry workflows, structured negotiation history, move-out initiation, deterministic settlement computation, and approval/disbursement linkage.

## Task Queue

- [ ] P37-E03-T01: Add lease renewal schema and workflow states
- [ ] P37-E03-T02: Implement renewal initiation and owner/tenant response workflow
- [ ] P37-E03-T03: Implement move-out request and deterministic settlement computation
- [ ] P37-E03-T04: Implement settlement approval and disbursement linkage

---

## T01: Add Lease Renewal Schema and Workflow States

### Objective

Model `lease_renewals` and resident move-out fields with explicit status transitions, negotiation timeline support, and settlement data shape.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Renewal and move-out statuses are transition-validated server-side.
2. Negotiation history is append-only (`negotiation_log`) for auditability.
3. Settlement fields remain in paise and capped at non-negative refund.
4. Expiry trigger uses deterministic time window relative to lease end.
5. Backoffice approval actions require explicit permissions.

### Deliverables

- [ ] `convex/schema.ts` - add/extend `lease_renewals` and resident move-out settlement/negotiation fields
- [ ] `lib/constants.ts` - add renewal, response, move-out, and settlement status enums
- [ ] `notes/13-constants-reference.md` - document renewal/move-out status contracts

### Acceptance Criteria

1. `lease_renewals` supports trigger metadata, proposals, responses, and finalization fields.
2. Resident profile schema includes settlement structure and negotiation log contract.
3. Renewal status enum supports canonical lifecycle (`INITIATED`, `OWNER_RESPONDED`, `TENANT_RESPONDED`, `NEGOTIATING`, `AGREED`, `RENEWED`, `MOVE_OUT_REQUESTED`, `MOVE_OUT_CONFIRMED`, `EXPIRED`).
4. Indexes support resident lookup, status queues, and trigger-time cron scanning.
5. Constants and docs align with schema values exactly.
6. All monetary/date fields comply with Rental Platform OS rules.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T02: Implement Renewal Initiation and Owner/Tenant Response Workflow

### Objective

Implement renewal flow APIs for initiating renewal windows, capturing owner/tenant responses, and progressing negotiation state.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Renewal initiation can be cron-driven (60-day trigger) and manual backoffice fallback.
2. Both owner and tenant responses are validated against allowed response enum.
3. Canonical response transitions must maintain legal state flow (`INITIATED -> OWNER_RESPONDED/TENANT_RESPONDED`, `... -> NEGOTIATING -> AGREED -> RENEWED`, move-out branch, expiry branch).
4. Response events emit through P35 notification API.
5. All changes write auditable timestamps and actor identifiers.

### Deliverables

- [ ] `convex/leaseRenewals.ts` - add `initiate` and `respondToRenewal` mutations
- [ ] `convex/crons.ts` - add 60-day lease-expiry renewal creation scheduler
- [ ] `convex/functions.ts` - export renewal functions through wrapped interfaces

### Acceptance Criteria

1. Renewal rows are auto-created for residents reaching 60 days before lease end.
2. Owner and tenant responses follow canonical enums (`owner_response`: `RENEW_SAME_TERMS`/`RENEW_NEW_TERMS`/`TERMINATE`; `tenant_response`: `ACCEPT`/`COUNTER`/`MOVE_OUT`) with notes and proposed terms.
3. Status transition logic rejects invalid response/state combinations.
4. Response updates append to negotiation history with actor and timestamp.
5. Lease expiry notices and renewal-response notifications are emitted with correct payload.
6. Querying current renewal returns latest canonical state for UI.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T03: Implement Move-Out Request and Deterministic Settlement Computation

### Objective

Implement move-out request flow and deterministic settlement calculator with deductions and non-negative refund capping.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Settlement formula is deterministic: `refund = max(0, deposit - deductions)`.
2. Deductions require reason and paise amount; evidence note optional.
3. Move-out request updates resident status to canonical move-out lifecycle state (`MOVE_OUT_REQUESTED`).
4. Settlement computation is query-safe and reproducible from stored inputs.
5. Move-out flow integrates with checklist completion gating.

### Deliverables

- [ ] `convex/leaseRenewals.ts` - add `requestMoveOut` mutation and `computeSettlement` query
- [ ] `convex/residentProfiles.ts` - update resident lifecycle state during move-out initiation
- [ ] `convex/checklists.ts` (integration touchpoint) - enforce required move-out checklist completion before final closure state

### Acceptance Criteria

1. Move-out request captures requested date and transitions resident into move-out workflow.
2. Settlement computation returns full contract: deposit, deductions, totals, refund, status, approvals metadata.
3. Refund amount never goes negative even when deductions exceed deposit.
4. Settlement result is deterministic across repeated calls with unchanged inputs.
5. Move-out cannot finalize while mandatory checklist items remain incomplete.
6. Settlement computation events can emit `DEPOSIT_SETTLEMENT` notification payloads.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T04: Implement Settlement Approval and Disbursement Linkage

### Objective

Add approval workflow for computed settlements and link approved outcomes to disbursement/closure bookkeeping.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Only authorized backoffice roles can approve/settle disputed settlements.
2. Approval captures approver id and settled timestamp.
3. Dispute path must preserve notes and keep resident in non-final state.
4. Disbursement linkage must not mutate historical settlement math.
5. Final resident close status requires settlement terminal state.

### Deliverables

- [ ] `convex/leaseRenewals.ts` - add `approveSettlement` mutation with dispute/approval guards
- [ ] `convex/closures.ts` - link settlement approval outcomes to closure bookkeeping records
- [ ] `convex/functions.ts` - export settlement approval APIs with wrapped mutation guards

### Acceptance Criteria

1. `approveSettlement` enforces authorization and valid status transition.
2. Approved settlements persist `approved_by` and `settled_at`.
3. Disputed settlements remain mutable only through authorized remediation flow.
4. Settlement approval can trigger downstream disbursement tracking linkage.
5. Resident status transitions to canonical terminal path (`MOVE_OUT_REQUESTED -> MOVED_OUT -> ARCHIVED`) only after settlement terminal state.
6. Build/type checks pass with no schema-function contract drift.

### Verification

```bash
npx tsc --noEmit
npm run build
```
