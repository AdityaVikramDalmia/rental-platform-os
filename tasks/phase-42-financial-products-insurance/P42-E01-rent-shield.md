---
id: P42-E01
title: Rent Shield Policy, Claims, and Financial Control Plane
phase: 42
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "task-planner"]
updated_at: 2026-02-20
---

# P42-E01: Rent Shield Policy, Claims, and Financial Control Plane

## Overview

Implement Rent Shield as a regulator-gated product with deterministic pricing, separated claims table, and financial control-plane primitives reused by other P42 epics (consents, ledger rules, callback reliability, and exception operations).

## Prerequisites

- P34 Transaction Completion Rails must be `done` (transaction anchors and status gates)
- P39 Tenant Trust Score & Reviews must be `done` (trust band snapshots)
- Read `notes/features/34-financial-products-insurance.md` fully before starting

## Task Queue

- [ ] P42-E01-T01: Add P42 constants, permissions, config keys, and audit action vocabulary
- [ ] P42-E01-T02: Add Rent Shield policy, claims, consent, ledger, and callback schemas
- [ ] P42-E01-T03: Implement quote and issuance pipeline with trust snapshots and IRDAI gate
- [ ] P42-E01-T04: Implement claim lifecycle with SLA enforcement, adjudication, appeal, and payout handoff
- [ ] P42-E01-T05: Implement partner adapter, callback idempotency, retry/dead-letter, and financial exception queue

---

## T01: Add P42 Constants, Permissions, Config Keys, and Audit Action Vocabulary

### Objective

Define all required financial constants before mutation/query work starts so downstream tasks can reuse one canonical vocabulary.

### Required Reading

- `notes/features/34-financial-products-insurance.md`
- `notes/03-roles-and-permissions.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `lib/constants.ts`

### Key Rules

1. Add all `financial.*` permissions exactly as specified; do not rename keys.
2. Add all authoritative P42 config keys with exact defaults/types, including `irdai_license_verified`, `claim_auto_approve_threshold`, and `dpdp_retention_years`.
3. Add all P42 status enums and transition maps for both `rent_shield_policies` and `rent_shield_claims`.
4. Keep policy claim-states and claim-table states separate (dual-model contract).
5. Register audit action literals using canonical `financial.*` action names.
6. Keep monetary constants in paise or bps only.

### Deliverables

- [ ] `lib/constants.ts` - P42 enums, status maps, permissions, config keys, and financial constants
- [ ] `notes/13-constants-reference.md` - P42 constants documented to match implementation
- [ ] `convex/schema.ts` - validator unions updated for new audit action literals

### Acceptance Criteria

1. Every key under "Authoritative System Config Keys" in the P42 feature doc exists with matching default and type.
2. `irdai_license_verified` defaults to `false` and hard-gates policy activation.
3. Transition maps exist for policy lifecycle (`DRAFT`..`LAPSED`) and claim lifecycle (`FILED`..`APPEALED`) with illegal-transition guards.
4. Bureau and credit status enums match canonical values (`EXPERIAN_INDIA`, `CORRECTION_PENDING`).
5. Audit action literals include all required financial actions (`financial.policy_created` through `financial.exception_resolved`).
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `lib/constants.ts` and `convex/schema.ts`.

### Out of Scope

- Query/mutation implementation
- Partner integrations

---

## T02: Add Rent Shield Policy, Claims, Consent, Ledger, and Callback Schemas

### Objective

Create canonical schema rows required for Rent Shield and the P42 shared control plane, including separate claim records and double-entry ledger storage.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (schema + ledger sections)
- `notes/features/26-transaction-completion-rails.md`
- `notes/features/31-tenant-trust-score-reviews.md`
- `notes/10-convex-schema.md`

### Key Rules

1. Claims must be modeled in `rent_shield_claims`, not embedded in policy rows.
2. Policy and claim rows must anchor to `transaction_id`/`closure_id`/`listing_id`; no custom `tenancy_id`.
3. Canonical shared table names must match feature spec (`financial_consent`, `financial_partner_configs`, `financial_partner_callbacks`, `financial_exception_cases`).
4. All timestamps are Unix milliseconds.
5. `financial_ledger` must support strict debit-credit pairing with `transaction_ref` idempotency.
6. Add callback/dead-letter/exception tables in this task so partner workflows have durable queues.

### Deliverables

- [ ] `convex/schema.ts` - add `rent_shield_policies`, `rent_shield_claims`, `financial_consent`, `financial_ledger`, `financial_partner_configs`, `financial_partner_callbacks`, `financial_exception_cases`
- [ ] `notes/10-convex-schema.md` - document P42 table fields and indexes

### Acceptance Criteria

1. `rent_shield_claims` has 1:N relationship to `rent_shield_policies` and includes `INFO_REQUESTED`/`APPEALED` status support.
2. `financial_consent` includes version/hash/channel/ip/revocation/retention fields with retention tied to `dpdp_retention_years`.
3. `deposit_finance_loans` naming is preserved as canonical (no `deposit_loans` alias in schema additions).
4. `financial_ledger` includes required account + entry types and supports pairing invariants.
5. `financial_partner_callbacks` supports idempotency + retry/dead-letter lifecycle.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`.

### Out of Scope

- Pricing and issuance math
- Partner API calls

---

## T03: Implement Quote and Issuance Pipeline With Trust Snapshots and IRDAI Gate

### Objective

Implement quote generation and issuance flow with strict formula and pricing snapshot persistence.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (pricing + regulatory sections)
- `notes/features/31-tenant-trust-score-reviews.md`
- `notes/features/26-transaction-completion-rails.md`
- `notes/11-convex-architecture.md`

### Key Rules

1. Premium formula must be paise-safe and use trust-band bps mapping (`PREMIUM`, `TRUSTED`, `BUILDING`, `NEW`).
2. TRUSTED band must compute as 3.5% of coverage amount.
3. Snapshot fields (`premium_paise`, `risk_factor`, `trust_band_at_issue`, `trust_score_at_issue`, `pricing_version`) are immutable.
4. Enforce IRDAI gate (`irdai_license_verified`) before status can move to `ACTIVE`.
5. Enforce transaction gating matrix from P34.
6. Policy status flow must follow canonical states (`DRAFT -> QUOTED -> ACTIVE`).

### Deliverables

- [ ] `convex/rentShield.ts` - quote, issue, get, list functions with transition validation
- [ ] `lib/money.ts` or `lib/financial.ts` (new helper if needed) - paise-safe financial helpers
- [ ] `convex/functions.ts` - wrapped mutation exports for audit triggers

### Acceptance Criteria

1. Quote creation validates active rental transaction exists with allowed P34 status.
2. TRUSTED-band quote premium equals `3.5% x coverage_amount_paise` and is persisted in paise.
3. Quote and issuance writes include immutable pricing snapshots.
4. Issuance fails when trust snapshot is missing or IRDAI config gate is false.
5. Issuance cannot proceed for ineligible transaction statuses.
6. No float persistence in stored monetary fields.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/rentShield.ts`.

### Out of Scope

- Claim adjudication
- Partner callback processing

---

## T04: Implement Claim Lifecycle With SLA Enforcement, Adjudication, Appeal, and Payout Handoff

### Objective

Implement full claim state machine with explicit transitions, review SLA tracking, and payout preparation.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (claim lifecycle + SLA)
- `notes/04-state-machines.md`
- `notes/11-convex-architecture.md`

### Key Rules

1. Use dedicated `rent_shield_claims` transitions only (`FILED -> INFO_REQUESTED -> UNDER_REVIEW -> APPROVED -> DISBURSED` plus denial/appeal).
2. Auto-approve only when amount <= `claim_auto_approve_threshold`, policy age > 90 days, no prior claim in 6 months, and evidence is attached.
3. Manual review triggers: amount above threshold, policy age < 90 days, prior claim, missing evidence, or fraud flag.
4. `reviewer_user_id`, denial reason enum, and resolution notes are mandatory for adjudication transitions.
5. Claim filing must enforce one-open-claim-per-policy guard.
6. Claim outcomes must emit operational events and exception rows where SLA breaches occur.

### Deliverables

- [ ] `convex/rentShieldClaims.ts` - file/requestDocs/review/approve/deny/appeal/markPaid mutations + queue queries
- [ ] `convex/crons.ts` - SLA escalation job for pending claims

### Acceptance Criteria

1. Invalid claim transitions are rejected with deterministic error codes.
2. Auto-approve path fires only when all threshold + policy-age + prior-claims + evidence guards pass.
3. Manual review path sets `UNDER_REVIEW` when any trigger condition is present.
4. Denial reason is restricted to canonical enum values and persists in audit log context.
5. Appeal is accepted only within 30 days of denial and returns claim to `UNDER_REVIEW`.
6. SLA breach detection creates exception queue rows.
7. Claim payout handoff prepares required ledger references.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/rentShieldClaims.ts` and `convex/crons.ts`.

### Out of Scope

- Deposit Lite claim lifecycle
- Credit bureau workflows

---

## T05: Implement Partner Adapter, Callback Idempotency, Retry/Dead-Letter, and Financial Exception Queue

### Objective

Create robust integration rails for insurer APIs with signed callbacks and reliable retries.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (partner adapter, idempotency, error taxonomy)
- `notes/11-convex-architecture.md` (actions-only external calls)
- `notes/features/27-notification-infrastructure.md`

### Key Rules

1. All external calls must be in Convex Actions, never queries/mutations.
2. Adapter methods must follow the canonical `FinancialPartnerAdapter` interface contract.
3. Callback verification must use HMAC-SHA256 and replay-window timestamp checks.
4. Callback processing must be idempotent on `idempotency_key`.
5. Sync operations must enforce 30s timeout and 3x exponential retry before failure.
6. Every financial mutation must produce exactly one debit + one credit ledger row pair.

### Deliverables

- [ ] `convex/actions/financialPartners.ts` - insurer adapter contract and API calls
- [ ] `convex/financialPartnerCallbacks.ts` - callback intake, validation, processing, retry logic
- [ ] `convex/financialLedger.ts` - double-entry helpers with invariant checks
- [ ] `convex/financialExceptions.ts` - exception queue query/mutation helpers

### Acceptance Criteria

1. Adapter exposes required methods (`createPolicy`, `fileClaim`, `collectPremium`, `enrollPlan`, `applyLoan`, `recordPayment`, `submitReport`, `getStatus`, `handleCallback`), and `collectPremium(params: { policyNumber, amountPaise, periodStart, periodEnd })` matches the feature-spec contract.
2. Invalid callback signatures are rejected and auditable.
3. Duplicate callbacks with same idempotency key do not re-apply side effects.
4. Dead-letter rows are created after retry exhaustion.
5. Timeout/retry failures throw `PartnerError` with `code` and `message`.
6. Ledger posting utility rejects non-zero-sum pair attempts.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all files added in this task.

### Out of Scope

- Deposit financing partner adapter
- Credit bureau adapters

---

## Epic Verification Scenario

```bash
# E01 scenario validation
# 1) Create rent shield policy for test tenant with TRUSTED band
# 2) Verify premium = 3.5% x coverage
# 3) File claim under auto-approve threshold and verify instant approval
# 4) File claim above threshold and verify UNDER_REVIEW
# 5) Cancel within 15 days and verify full refund
# 6) Verify double-entry ledger entries created
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
