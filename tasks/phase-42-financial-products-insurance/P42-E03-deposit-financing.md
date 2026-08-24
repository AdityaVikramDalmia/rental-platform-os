---
id: P42-E03
title: Deposit Financing (NBFC + EMI) Rails
phase: 42
status: pending
depends_on: ["P42-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "task-planner"]
updated_at: 2026-02-20
---

# P42-E03: Deposit Financing (NBFC + EMI) Rails

## Overview

Implement RBI-compliant deposit lending flow with NBFC-only routing, deterministic EMI math, callback reliability, and credit-signal outputs for downstream reporting.

## Prerequisites

- **Read first**: [P42-E01 Completion Summary](P42-E01-rent-shield.md#completion-summary)
- Shared control-plane tables and helper modules from E01 must exist
- P34 transaction status model must be fully available in constants

## Task Queue

- [ ] P42-E03-T01: Add loan, installment, and repayment schema with full financing lifecycle enums
- [ ] P42-E03-T02: Implement application and underwriting flow with NBFC-only partner gate
- [ ] P42-E03-T03: Implement agreement acceptance controls before disbursement
- [ ] P42-E03-T04: Implement EMI schedule, repayment posting, and late fee logic
- [ ] P42-E03-T05: Implement callback sync, default detection, DPD outputs, and operational exception handling

---

## T01: Add Loan, Installment, and Repayment Schema With Full Financing Lifecycle Enums

### Objective

Establish persistent structures for loans and installment tracking before API integrations.

### Required Reading

- `notes/features/34-financial-products-insurance.md`
- `notes/features/26-transaction-completion-rails.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`

### Key Rules

1. Financing lifecycle must include canonical statuses: `APPLIED`, `APPROVED`, `DISBURSED`, `REPAYING`, `COMPLETED`, `DEFAULTED`, `WRITTEN_OFF`, `CANCELLED`.
2. Approval requires enhanced KYC fields (Aadhaar/PAN, income proof, 3-month bank statement) with V1 manual verification.
3. All principal, EMI, interest, fees, penalties, and outstanding values are paise integers.
4. Tenure is capped by config (`loan_max_term_months`).
5. Loan rows must include idempotency keys and partner references.
6. Default/write-off thresholds are config-driven (`loan_default_threshold_missed_emis`, `loan_writeoff_days`).

### Deliverables

- [ ] `convex/schema.ts` - add `deposit_finance_loans` and installment/repayment support table(s)
- [ ] `lib/constants.ts` - financing status enums and transition maps
- [ ] `notes/10-convex-schema.md` - P42 financing table docs

### Acceptance Criteria

1. Schema supports schedule generation and repayment state tracking.
2. Transition map rejects illegal financing lifecycle transitions.
3. Loan records include KYC metadata, agreement-signature references, and disbursement callback references.
4. Default transition guard uses `loan_default_threshold_missed_emis` and write-off uses `loan_writeoff_days`.
5. Loan amount validation enforces `loan_min_amount_paise` and `loan_max_amount_paise`.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts` and `lib/constants.ts`.

### Out of Scope

- Partner API calls
- Credit reporting submissions

---

## T02: Implement Application and Underwriting Flow With NBFC-Only Partner Gate

### Objective

Enable tenants to apply for financing while enforcing hard regulatory partner constraints.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (RBI gate section)
- `notes/11-convex-architecture.md`
- `convex/actions/financialPartners.ts` (from E01)

### Key Rules

1. Hard block non-NBFC partners for any lending operation.
2. Validate transaction status gate before accepting applications.
3. Ensure active consent (`LENDING` + `DATA_SHARING`) before partner submission.
4. Persist partner request IDs and idempotency key per application attempt.
5. Do not move to `APPROVED` until partner underwriting callback is verified.
6. Require KYC artifacts before transition `APPLIED -> APPROVED`.

### Deliverables

- [ ] `convex/depositFinancing.ts` - application lifecycle mutations and queries
- [ ] `convex/actions/financialPartners.ts` - NBFC lending adapter operations

### Acceptance Criteria

1. Non-NBFC submissions are rejected with deterministic error code.
2. Application row and partner call are idempotent.
3. Underwriting responses map to valid internal status transitions.
4. Required consent checks are enforced.
5. KYC-missing applications cannot be approved.
6. Application cancellation is allowed only before disbursement.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/depositFinancing.ts` and action files changed.

### Out of Scope

- EMI repayment logic
- Bureau reporting of DPD

---

## T03: Implement Agreement Acceptance Controls Before Disbursement

### Objective

Enforce mandatory borrower disclosure and acceptance rules before disbursement.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (RBI requirements)
- `notes/features/26-transaction-completion-rails.md`
- `notes/04-state-machines.md`

### Key Rules

1. Agreement signature artifact must be persisted before disbursement transition.
2. Borrower acceptance artifact must be persisted before disbursement request.
3. Disbursement before agreement-signature verification is blocked.
4. Borrower cancellation before disbursement incurs zero penalty.
5. All status transitions must map to canonical lifecycle names.
6. Disbursement must be callback-confirmed from partner.

### Deliverables

- [ ] `convex/depositFinancing.ts` - approve/cancel/disburse transitions with agreement + consent checks
- [ ] `convex/actions/financialPartners.ts` - disbursement call support

### Acceptance Criteria

1. Agreement signature artifact is mandatory and queryable before disbursement.
2. Disbursement transition rejects execution without signed agreement.
3. Cancellation path is valid only in `APPLIED` or `APPROVED`.
4. Disbursement transition is callback-driven and idempotent.
5. Failed disbursement callback creates an exception case.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed financing files.

### Out of Scope

- Installment posting
- Default detection

---

## T04: Implement EMI Schedule, Repayment Posting, and Late Fee Logic

### Objective

Implement paise-safe amortization and repayment accounting.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (EMI math + fee formulas)
- `lib/money.ts`
- `convex/financialLedger.ts`

### Key Rules

1. EMI formula must use the exact canonical equation and rounding behavior.
2. Late fee applies only after `df_emi_grace_days` and uses `df_late_fee_pct_bps`.
3. Repayment posting must update outstanding principal deterministically.
4. Every repayment and penalty posting must create valid debit/credit ledger pairs.
5. Missed-EMI counter must be updated each cycle for default detection.

### Deliverables

- [ ] `convex/depositFinancing.ts` - schedule generation and repayment mutations
- [ ] `convex/financialLedger.ts` - financing ledger posting helpers

### Acceptance Criteria

1. EMI output matches formula for configured principal/rate/tenure.
2. Late fees apply only after grace period and match configured bps.
3. EMI schedule and accrued charges match documented formulas.
4. Outstanding principal cannot go negative.
5. Repayment posting is idempotent by payment reference key.
6. Three successful payments reduce outstanding principal monotonically.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed financing and ledger files.

### Out of Scope

- Bureau submission
- Tenant dashboard UI

---

## T05: Implement Callback Sync, Default Detection, DPD Outputs, and Operational Exception Handling

### Objective

Close the loop from partner callbacks to operational/default handling and downstream credit-signal exports.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (partner callbacks + DPD payload + exception queue)
- `notes/features/27-notification-infrastructure.md`
- `convex/financialPartnerCallbacks.ts`

### Key Rules

1. Callback processing must be signature-verified and idempotent.
2. Failed callbacks retry 3 times with exponential backoff, then dead-letter.
3. Default detection must be deterministic from `loan_default_threshold_missed_emis`.
4. `WRITTEN_OFF` transition is allowed only after `loan_writeoff_days` in default.
5. DPD outputs must be persisted for E04 bureau submission consumption.
6. Generate exception cases for mismatches, stale callbacks, and invalid transitions.

### Deliverables

- [ ] `convex/depositFinancing.ts` - callback-driven status sync and default transitions
- [ ] `convex/financialPartnerCallbacks.ts` - financing callback handlers
- [ ] `convex/financialExceptions.ts` - financing reason code paths
- [ ] `convex/crons.ts` - callback retry and overdue/default detection schedules

### Acceptance Criteria

1. Duplicate callback payloads cannot double-apply state.
2. Dead-letter rows are created after exhausted retries.
3. Loan transitions to `DEFAULTED` exactly after 3 missed EMIs.
4. Loan transitions to `WRITTEN_OFF` only after 180 days in default.
5. DPD outputs are queryable by E04 reporting functions.
6. Default and write-off actions generate financial audit events.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all files changed in this task.

### Out of Scope

- Credit bureau API integration implementation details (E04)
- Loan analytics dashboards beyond required operational lists

---

## Epic Verification Scenario

```bash
# E03 scenario validation
# 1) Apply for deposit financing loan
# 2) Verify EMI = (P * r * (1+r)^n) / ((1+r)^n - 1) in paise
# 3) Make 3 payments and verify balance decreases
# 4) Miss 3 EMIs and verify DEFAULTED status
# 5) Verify late fee calculation after grace period
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
