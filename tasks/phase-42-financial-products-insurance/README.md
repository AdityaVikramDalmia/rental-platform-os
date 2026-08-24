# Phase 42: Financial Products & Insurance (P42)

## Overview

Build regulated, transaction-linked financial rails for Rent Shield, Deposit Lite, Deposit Financing, and Rent Credit Reporting. This phase must enforce deterministic math in paise, strict lifecycle state machines, code-level compliance gates, and double-entry ledger integrity.

Canonical table names for this phase: `rent_shield_policies`, `rent_shield_claims`, `deposit_lite_plans`, `deposit_finance_loans`, `rent_credit_reporting_accounts`, `rent_credit_reports`, `financial_ledger`, `financial_partner_configs`, `financial_consent`, `financial_partner_callbacks`, `financial_exception_cases`.

## Dependencies

### Hard Dependencies

- P34 Transaction Completion Rails must be done (canonical transaction anchors and lifecycle gates)
- P39 Tenant Trust Score & Reviews must be done (risk pricing trust band snapshots)

### Soft Dependencies

- P31 Owner Entity & RM Foundation (canonical owner identity joins)
- P35 Notification Infrastructure (financial event delivery)
- P36 Monetization Foundation (commission and revenue reporting joins)

## Key Documentation

| File                                                | Why It Is Required                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `notes/features/34-financial-products-insurance.md` | Source of truth for all formulas, states, schemas, and compliance gates |
| `notes/features/26-transaction-completion-rails.md` | P34 state gates and transaction anchors                                 |
| `notes/features/31-tenant-trust-score-reviews.md`   | Trust-band source used for Rent Shield pricing                          |
| `notes/features/28-monetization-foundation.md`      | Commission/tax/accounting alignment patterns                            |
| `notes/03-roles-and-permissions.md`                 | Permission model conventions                                            |
| `notes/04-state-machines.md`                        | State transition design pattern                                         |
| `notes/10-convex-schema.md`                         | Schema, index, and validator conventions                                |
| `notes/11-convex-architecture.md`                   | Action-only external API rule, auth helpers, and idempotent patterns    |
| `notes/13-constants-reference.md`                   | Constants, config keys, and audit action conventions                    |

## Epics

| ID      | Title                                                   | Tasks | Status  | Depends On         | Priority |
| ------- | ------------------------------------------------------- | ----- | ------- | ------------------ | -------- |
| P42-E01 | Rent Shield Policy, Claims, and Financial Control Plane | 5     | pending | []                 | Critical |
| P42-E02 | Deposit Lite Guarantee Rails                            | 4     | pending | [P42-E01]          | High     |
| P42-E03 | Deposit Financing (NBFC + EMI) Rails                    | 5     | pending | [P42-E01]          | Critical |
| P42-E04 | Rent Credit Reporting and Bureau Operations             | 5     | pending | [P42-E01, P42-E03] | High     |

## Dependency Graph

```text
P42-E01
  |- P42-E02
  |- P42-E03
        \- P42-E04
```

## Completion Criteria

- [ ] All 5 required P42 state machines are implemented and transition-validated (policy, claim, deposit lite, loan, credit reporting)
- [ ] Rent Shield claims are modeled in separate `rent_shield_claims` table (1:N with policies)
- [ ] Dual-model lifecycle is preserved: policy claim states live on `rent_shield_policies`, adjudication states live on `rent_shield_claims`
- [ ] Premium, EMI, late fee, prorata cancellation, and commission formulas are deterministic and paise-accurate
- [ ] `financial_ledger` double-entry invariant holds for all financial mutations (exact debit/credit pairs)
- [ ] Regulatory gates are enforceable in code (`irdai_license_verified`, NBFC-only lending, DPDP consent artifacts)
- [ ] `financial_consent` schema is live and required for lending/credit flows
- [ ] Reconciliation cron (`financial_reconciliation`) verifies debit/credit parity daily and opens exception cases when delta > ₹100
- [ ] New `financial.*` permissions and P42 config keys are wired and used by functions
- [ ] Partner adapter layer supports HMAC webhook verification, callback idempotency, retries, and dead-letter handling
- [ ] Canonical config keys from feature spec are implemented with exact defaults, including `claim_auto_approve_threshold`, `loan_writeoff_days`, `premium_collection_batch_size`, and `dpdp_retention_years`
- [ ] Exception queue, fraud checks, and error taxonomy are available for operational follow-up
- [ ] Phase verification passes: `npx tsc --noEmit`, `npm run build`, and clean `lsp_diagnostics` on changed files

## Epic Verification Scenarios

- **P42-E01**: Create Rent Shield policy for TRUSTED band and verify premium `3.5% x coverage`; test claim auto-approve threshold and manual-review path; cancel within 15 days and verify full refund; verify ledger entries.
- **P42-E02**: Enroll Deposit Lite and verify annual fee `₹999 + 1% of deposit`; verify coverage equals deposit; cancel and verify pro-rata refund.
- **P42-E03**: Apply financing loan and verify EMI formula in paise; make 3 payments and verify balance reduction; miss 3 EMIs and verify `DEFAULTED`; verify late fee.
- **P42-E04**: Capture credit consent and verify consent row; submit report; pause reporting with yearly pause cap; revoke consent and verify `CLOSED`.

## File Tree

```text
phase-42-financial-products-insurance/
  README.md
  P42-E01-rent-shield.md
  P42-E02-deposit-lite.md
  P42-E03-deposit-financing.md
  P42-E04-rent-credit-reporting.md
```

## Scope Boundaries

### In Scope

- Financial product schemas, formulas, lifecycle transitions, and compliance gates
- Convex actions for partner integrations with callback processing and retry policy
- Double-entry financial ledger and reconciliation guardrails
- Credit reporting submission/correction lifecycle and consent governance
- Fraud controls, exception queues, observability, and operational error taxonomy

### Out of Scope

- In-house insurance underwriting or lender balance-sheet risk
- New regulator-independent products outside the 4 defined offerings
- Multi-country compliance support
- Rewrites of P31/P34/P35/P36 feature scopes outside documented contracts
