---
id: P42-E02
title: Deposit Lite Guarantee Rails
phase: 42
status: pending
depends_on: ["P42-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "task-planner"]
updated_at: 2026-02-20
---

# P42-E02: Deposit Lite Guarantee Rails

## Overview

Implement Deposit Lite as a guarantee-backed lifecycle with deterministic fee computation, transaction-state gating, claim/settlement controls, and ledger-integrated accounting.

## Prerequisites

- **Read first**: [P42-E01 Completion Summary](P42-E01-rent-shield.md#completion-summary)
- P42 shared financial control-plane primitives from E01 must be available (`financial_ledger`, `financial_consent`, callback infra)

## Task Queue

- [ ] P42-E02-T01: Add Deposit Lite schema, enums, and transaction-state eligibility gates
- [ ] P42-E02-T02: Implement enrollment and activation with fee formula and immutable pricing snapshot
- [ ] P42-E02-T03: Implement claim, settlement, cancellation prorata, and fraud checks
- [ ] P42-E02-T04: Implement admin/tenant/owner visibility, notifications, and operational exception handling

---

## T01: Add Deposit Lite Schema, Enums, and Transaction-State Eligibility Gates

### Objective

Define all Deposit Lite data contracts and transition guards before business logic implementation.

### Required Reading

- `notes/features/34-financial-products-insurance.md`
- `notes/features/26-transaction-completion-rails.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`

### Key Rules

1. Deposit Lite rows must anchor to `transaction_id` + `listing_id`; no custom tenancy surrogate.
2. Canonical table name is `deposit_lite_plans`.
3. Lifecycle statuses must include `ENROLLED`, `ACTIVE`, `CLAIM_ELIGIBLE`, `CLAIM_FILED`, `SETTLED`, `EXPIRED`, `CANCELLED`.
4. Enrollment is blocked unless transaction status is in allowed gate list.
5. Include immutable fee snapshot columns for audit.
6. Add audit actions for all status-changing table writes.

### Deliverables

- [ ] `convex/schema.ts` - `deposit_lite_plans` and any supporting indexes
- [ ] `lib/constants.ts` - Deposit Lite status and transition map
- [ ] `notes/10-convex-schema.md` - table docs updated
- [ ] `notes/13-constants-reference.md` - enums and audit action docs updated

### Acceptance Criteria

1. Schema supports fee + coverage + status + partner refs + idempotency.
2. Transition validation map exists for `ENROLLED -> ACTIVE -> CLAIM_ELIGIBLE -> CLAIM_FILED -> SETTLED -> EXPIRED` plus cancellation branches.
3. Gating helper for transaction status validates active rental transaction from P34.
4. Cooling-off cancellation logic is represented in schema fields (`activated_at`, `cancelled_at`, refund metadata).
5. Audit action literals are emitted for enroll/activate/claim/settle/cancel paths.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts` and `lib/constants.ts`.

### Out of Scope

- Partner API integration
- UI surfaces

---

## T02: Implement Enrollment and Activation With Fee Formula and Immutable Pricing Snapshot

### Objective

Implement enrollment and activation mutations with deterministic fee math and ledger-safe accounting.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (Deposit Lite formulas)
- `notes/features/28-monetization-foundation.md` (tax and ledger patterns)
- `convex/financialLedger.ts` (from E01)

### Key Rules

1. Annual fee formula is fixed ₹999 (`99900` paise) + 1% of deposit (`deposit_lite_coverage_pct_bps=100`).
2. Persist deterministic total payable values with immutable pricing snapshots.
3. Enrollment writes immutable fee snapshot fields.
4. Activation requires partner acknowledgement and writes ledger debit/credit pair.
5. Enrollment and activation must be idempotent.
6. All amounts must remain paise integers.

### Deliverables

- [ ] `convex/depositLite.ts` - enroll/activate/get/list functions
- [ ] `convex/financialLedger.ts` - Deposit Lite posting helpers

### Acceptance Criteria

1. Enroll flow computes annual fee as `99900 + 1% x deposit_amount_paise`.
2. Coverage amount equals configured deposit amount and is persisted immutably.
3. Total amounts are deterministic and reproducible.
4. Activation fails for disallowed transaction states.
5. Ledger entries are posted as valid debit/credit pair.
6. Duplicate idempotency keys do not create duplicate plan rows.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/depositLite.ts`.

### Out of Scope

- Claim/settlement flow
- Notification templates

---

## T03: Implement Claim, Settlement, Cancellation Prorata, and Fraud Checks

### Objective

Deliver the risky lifecycle transitions and anti-abuse controls for guarantee payouts.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (fraud + cancellation + SLA sections)
- `notes/04-state-machines.md`
- `convex/financialExceptions.ts` (from E01)

### Key Rules

1. Claim transitions must follow Deposit Lite lifecycle map including `CLAIM_ELIGIBLE` precondition.
2. Cancellation prorata uses deterministic unused-days formula.
3. Cancellation within `irdai_cooling_off_days` returns full fee; post cooling-off uses pro-rata.
4. Duplicate active coverage per transaction must be blocked.
5. Suspicious claims create exception queue rows instead of silent failure.
6. Claim settlements must post ledger entries and include partner reference.

### Deliverables

- [ ] `convex/depositLite.ts` - claimFile/settle/cancel transitions
- [ ] `convex/financialExceptions.ts` - fraud reason-code helpers for Deposit Lite

### Acceptance Criteria

1. Claims can only be filed when plan status is `CLAIM_ELIGIBLE`.
2. Mid-cycle cancellation computes refund deterministically.
3. Cancellation within 15-day cooling-off returns full refund.
4. Duplicate coverage and synthetic claim patterns are blocked.
5. Settlement creates auditable final state and accounting trail.
6. Exception queue can list unresolved Deposit Lite anomalies.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed files.

### Out of Scope

- Loan financing workflows
- Credit bureau reporting

---

## T04: Implement Admin/Tenant/Owner Visibility, Notifications, and Operational Exception Handling

### Objective

Expose Deposit Lite status and exceptions across relevant operational surfaces.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (notification events + exception queue)
- `notes/features/27-notification-infrastructure.md`
- `notes/06-admin-panel-ux.md`

### Key Rules

1. Read APIs must be role-safe and only expose allowed fields by persona.
2. Emit P35 events for policy issued, claim pending, and settlement outcomes.
3. Exception queue filtering by entity type and severity is mandatory.
4. Avoid duplicate event sends by using idempotency keys.
5. All status updates must remain auditable.

### Deliverables

- [ ] `convex/depositLite.ts` - list/query APIs for admin and user-facing views
- [ ] `convex/financialExceptions.ts` - triage/update APIs
- [ ] `convex/notifications.ts` or internal event emit wiring - Deposit Lite event emits

### Acceptance Criteria

1. Admin can filter Deposit Lite rows by status and exception severity.
2. Tenant/owner views only expose own linked transactions.
3. Notification event emission is idempotent.
4. Operational exception rows can be assigned and resolved.
5. Cancellation and refund decisions are visible in admin and auditable by actor/timestamp.
6. Event dedupe keys prevent duplicate delivery retries from emitting duplicate notifications.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed files for this task.

### Out of Scope

- Frontend redesign of entire tenant portal
- Partner onboarding admin workflows

---

## Epic Verification Scenario

```bash
# E02 scenario validation
# 1) Enroll deposit lite plan
# 2) Verify annual fee = ₹999 + 1% of deposit
# 3) Verify coverage = deposit amount
# 4) Cancel and verify pro-rata refund calculation
```

## Completion Summary

> Fill this section when epic status is set to `done`.

**Completed**: YYYY-MM-DD

### What Was Built

-

### Key File Locations

| File | What |
| ---- | ---- |
|      |      |

### Deviations from Spec

-

### Gotchas for Next Epic

-
