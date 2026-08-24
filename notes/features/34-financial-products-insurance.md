# Feature: Financial Products & Insurance

> **Priority**: #42 in implementation order
> **Personas**: Tenant, Owner, Admin, OPS
> **Hard Dependencies**: P34 Transaction Completion Rails, P39 Tenant Trust Score & Reviews
> **Soft Dependencies**: P31 Owner Entity & RM Foundation, P35 Notification Infrastructure, P36 Monetization Foundation
> **Route Groups**: `(tenant)/`, `(admin)/`, `(public)/`

## Overview

Phase 42 adds regulated financial rails on top of the transaction stack:

1. Rent Shield (owner protection insurance)
2. Deposit Lite (guarantee-backed reduced deposit)
3. Deposit Financing (NBFC loan for deposit)
4. Rent Credit Reporting (credit bureau submission of rent behavior)

This phase is strictly transaction-linked, consent-gated, ledger-backed, and regulator-aware.

---

## Canonical Anchors and Cross-Phase Contracts

### Canonical Tenancy Proof (No `tenancy_id`)

P42 does not introduce a free-form `tenancy_id`. Every financial row must resolve tenancy proof from:

- `transaction_id` (P34 canonical lifecycle)
- `closure_id` (P8 closure proof, where applicable)
- `listing_id`
- `tenant_user_id`
- `owner_id` (from P31 canonical owner model)

### Canonical Table Names

These table names are authoritative for P42 implementation:

- `rent_shield_policies` - policy lifecycle
- `rent_shield_claims` - claim lifecycle (separate from policy)
- `deposit_lite_plans` - deposit alternative enrollment
- `deposit_finance_loans` - deposit financing loans (NOT `deposit_loans`)
- `rent_credit_reporting_accounts` - credit reporting consent + status (NOT `credit_reports`)
- `rent_credit_reports` - individual monthly bureau report submissions
- `financial_ledger` - double-entry bookkeeping
- `financial_partner_configs` - partner adapter configuration
- `financial_consent` - DPDP consent records
- `financial_partner_callbacks` - async partner webhook payloads
- `financial_exception_cases` - edge cases requiring manual resolution

### Credit Reporting Schema Contract

Credit reporting uses separate account and report tables:

```ts
rent_credit_reporting_accounts: {
  // Consent and lifecycle anchor table
}

rent_credit_reports: {
  account_id,
  reporting_period,
  payment_on_time: boolean,
  rent_amount_paise,
  bureau: "EXPERIAN_INDIA" | "CIBIL" | "CRIF",
  submitted_at,
  external_report_id,
  status: "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED",
}
```

### Canonical Enum Values

- Bureau enum is `EXPERIAN_INDIA | CIBIL | CRIF`.
- Credit reporting correction state is `CORRECTION_PENDING` (not `CORRECTION_NEEDED`).
- Cross-cutting docs will be updated to match these canonical enum values.

### Cross-Phase Contracts

1. **P34 -> P42 (state gating)**: Product actions are allowed only in explicit `rental_transactions.status` windows.
2. **P39 -> P42 (risk pricing)**: Rent Shield pricing uses immutable trust snapshot at issuance (`trust_score_at_issue`, `trust_band_at_issue`).
3. **P8/P34 -> P42 (tenancy proof)**: Claims, activation, and reporting require linked closure + transaction trail.
4. **P31 -> P42 (identity source)**: `owner_id` and owner/tenant identity are sourced from canonical entities, not duplicated blobs.
5. **P35 -> P42 (events)**: Financial events emit notification events only through P35 APIs.
6. **P36 -> P42 (monetization join)**: Premiums/fees/commissions post to P42 ledger and can mirror P36 read models where needed.

---

## Lifecycle State Machines

### Rent Shield Policy Lifecycle

```text
DRAFT -> QUOTED -> ACTIVE
ACTIVE -> CLAIM_FILED -> CLAIM_APPROVED -> CLAIM_PAID
ACTIVE -> EXPIRED | CANCELLED | LAPSED
CLAIM_PAID -> ACTIVE
```

| From             | To               | Actor        | Guard                                                                          |
| ---------------- | ---------------- | ------------ | ------------------------------------------------------------------------------ |
| (new)            | `DRAFT`          | System       | Transaction and listing anchors exist                                          |
| `DRAFT`          | `QUOTED`         | Admin/OPS    | Active rental transaction + trust snapshot present                             |
| `QUOTED`         | `ACTIVE`         | Admin/OPS    | `irdai_license_verified=true`, premium collected, partner policy number issued |
| `ACTIVE`         | `CLAIM_FILED`    | Owner/Admin  | Claim row created in `rent_shield_claims`                                      |
| `CLAIM_FILED`    | `CLAIM_APPROVED` | Admin/System | Linked claim reaches `APPROVED`                                                |
| `CLAIM_APPROVED` | `CLAIM_PAID`     | Admin/System | Linked claim reaches `DISBURSED` and payout posted                             |
| `CLAIM_PAID`     | `ACTIVE`         | System       | Coverage end date not reached                                                  |
| `ACTIVE`         | `EXPIRED`        | System       | Coverage end date reached                                                      |
| `ACTIVE`         | `CANCELLED`      | Owner/Admin  | IRDAI cooling-off logic: full refund <= 15 days, pro-rata after                |
| `ACTIVE`         | `LAPSED`         | System       | Premium unpaid past `rs_premium_grace_days`                                    |
| `DRAFT`          | `CANCELLED`      | Admin/OPS    | Quote abandoned before activation                                              |
| `QUOTED`         | `CANCELLED`      | Owner/Admin  | Quote declined before activation                                               |

Policy status and claim status are intentionally separate. Policy status reflects the policy's current state including active claims. Claim status tracks individual claim resolution.

### Deposit Lite Plan Lifecycle

```text
ENROLLED -> ACTIVE -> CLAIM_ELIGIBLE -> CLAIM_FILED -> SETTLED
ACTIVE -> EXPIRED
ENROLLED | ACTIVE | CLAIM_ELIGIBLE -> CANCELLED
```

| From             | To               | Actor        | Guard                                                                 |
| ---------------- | ---------------- | ------------ | --------------------------------------------------------------------- |
| (new)            | `ENROLLED`       | Tenant/Admin | Active rental transaction exists (`P34`), consent captured            |
| `ENROLLED`       | `ACTIVE`         | System/Admin | Partner enrollment ack + fee ledger posted                            |
| `ACTIVE`         | `CLAIM_ELIGIBLE` | System       | Claim window opened by default trigger or end-of-lease event          |
| `CLAIM_ELIGIBLE` | `CLAIM_FILED`    | Owner/Admin  | Evidence package attached                                             |
| `CLAIM_FILED`    | `SETTLED`        | Admin/System | Settlement completed with partner reference + ledger posting          |
| `ACTIVE`         | `EXPIRED`        | System       | Coverage term completed                                               |
| `ENROLLED`       | `CANCELLED`      | Tenant/Admin | Cancellation accepted; full refund if within `irdai_cooling_off_days` |
| `ACTIVE`         | `CANCELLED`      | Tenant/Admin | Cancellation accepted; pro-rata refund after cooling-off              |
| `CLAIM_ELIGIBLE` | `CANCELLED`      | Admin        | No open claim and cancellation approved                               |

### Deposit Financing Loan Lifecycle

```text
APPLIED -> APPROVED -> DISBURSED -> REPAYING -> COMPLETED
REPAYING -> DEFAULTED -> WRITTEN_OFF
APPLIED | APPROVED -> CANCELLED
```

| From        | To            | Actor          | Guard                                                                |
| ----------- | ------------- | -------------- | -------------------------------------------------------------------- |
| (new)       | `APPLIED`     | Tenant         | Loan amount within configured min/max bounds                         |
| `APPLIED`   | `APPROVED`    | Partner/Admin  | KYC complete (V1 self-declared docs) and underwriting pass           |
| `APPROVED`  | `DISBURSED`   | Partner/System | Rental agreement signed + callback verified                          |
| `DISBURSED` | `REPAYING`    | System         | EMI schedule persisted                                               |
| `REPAYING`  | `COMPLETED`   | System         | Outstanding principal reaches zero                                   |
| `REPAYING`  | `DEFAULTED`   | System         | `loan_default_threshold_missed_emis` reached (default 3 missed EMIs) |
| `DEFAULTED` | `WRITTEN_OFF` | Admin/System   | Default age >= `loan_writeoff_days` (default 180)                    |
| `APPLIED`   | `CANCELLED`   | Tenant         | Application withdrawn before approval                                |
| `APPROVED`  | `CANCELLED`   | Tenant/Admin   | Cancelled before disbursement                                        |

### Credit Reporting Account Lifecycle

```text
CONSENT_OBTAINED -> REPORTING
REPORTING -> CORRECTION_PENDING -> CORRECTED -> REPORTING
REPORTING -> PAUSED -> REPORTING
REPORTING | PAUSED | CORRECTION_PENDING | CORRECTED -> CLOSED
```

| From                 | To                   | Actor         | Guard                                       |
| -------------------- | -------------------- | ------------- | ------------------------------------------- |
| (new)                | `CONSENT_OBTAINED`   | Tenant        | DPDP-compliant explicit opt-in captured     |
| `CONSENT_OBTAINED`   | `REPORTING`          | System/Admin  | Bureau subject successfully created         |
| `REPORTING`          | `CORRECTION_PENDING` | Tenant/Admin  | Dispute raised on a reported data point     |
| `CORRECTION_PENDING` | `CORRECTED`          | Admin/System  | Corrected payload accepted by bureau        |
| `CORRECTED`          | `REPORTING`          | System        | Next cycle resumes normal reporting         |
| `REPORTING`          | `PAUSED`             | Tenant/Admin  | Pause request accepted; max 2 pauses/year   |
| `PAUSED`             | `REPORTING`          | Tenant/Admin  | Resume requested and consent remains active |
| `REPORTING`          | `CLOSED`             | Tenant/System | Consent revoked or lease ended              |
| `PAUSED`             | `CLOSED`             | Tenant/System | Consent revoked or lease ended              |
| `CORRECTION_PENDING` | `CLOSED`             | Tenant/System | Consent revoked during dispute              |
| `CORRECTED`          | `CLOSED`             | Tenant/System | Consent revoked after correction            |

### Rent Shield Claim Lifecycle

```text
FILED -> INFO_REQUESTED -> UNDER_REVIEW -> APPROVED -> DISBURSED
FILED -> UNDER_REVIEW
UNDER_REVIEW -> DENIED -> APPEALED -> UNDER_REVIEW
```

| From             | To               | Actor        | Guard                                                                                                                        |
| ---------------- | ---------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| (new)            | `FILED`          | Owner/Admin  | Policy is `ACTIVE`, claim amount <= remaining coverage, evidence references initialized                                      |
| `FILED`          | `INFO_REQUESTED` | Admin/System | Required evidence missing                                                                                                    |
| `INFO_REQUESTED` | `UNDER_REVIEW`   | Admin        | Missing evidence submitted                                                                                                   |
| `FILED`          | `UNDER_REVIEW`   | System       | Manual-review trigger matched                                                                                                |
| `FILED`          | `APPROVED`       | System       | Auto-approve: amount <= `claim_auto_approve_threshold`, policy age > 90 days, no prior claims in 6 months, evidence attached |
| `UNDER_REVIEW`   | `APPROVED`       | Admin        | Adjudicator decision recorded                                                                                                |
| `APPROVED`       | `DISBURSED`      | System/Admin | Payout instruction completed and ledger posted                                                                               |
| `UNDER_REVIEW`   | `DENIED`         | Admin        | Denial reason enum recorded                                                                                                  |
| `DENIED`         | `APPEALED`       | Owner        | Appeal submitted within 30 days of denial                                                                                    |
| `APPEALED`       | `UNDER_REVIEW`   | Admin        | Appeal accepted for re-review                                                                                                |

---

## Claim Adjudication Rules

- Auto-approve when all are true: claim amount <= `claim_auto_approve_threshold`, policy active > 90 days, no prior claims in 6 months, and evidence documents attached.
- Manual review trigger when any are true: amount > threshold, policy age < 90 days, prior claim in 6 months, missing evidence, tenant fraud flag.
- Admin review SLA: 48h for standard claims, 24h for urgent claims (tenant already vacated).
- Denial reason enum: `INSUFFICIENT_EVIDENCE | POLICY_LAPSED | FRAUD_SUSPECTED | COVERAGE_EXCEEDED | EXCLUSION_APPLIES`.

## KYC Matrix

| Product           | KYC Level    | Requirements                                                                       |
| ----------------- | ------------ | ---------------------------------------------------------------------------------- |
| Rent Shield       | Basic        | Aadhaar/PAN + active rental transaction                                            |
| Deposit Lite      | Basic        | Aadhaar/PAN + active rental transaction                                            |
| Deposit Financing | Enhanced     | Aadhaar/PAN + income proof + bank statement (3 months) + active rental transaction |
| Credit Reporting  | Consent-only | DPDP consent + PAN (for bureau matching)                                           |

V1 uses self-declared KYC (document upload + manual admin verification). V2 upgrades to automated KYC via partner API.

## Grace Periods

| Product           | Grace Type          | Duration      | Config Key                            |
| ----------------- | ------------------- | ------------- | ------------------------------------- |
| Rent Shield       | Premium payment     | 15 days       | `rs_premium_grace_days` (default 15)  |
| Deposit Financing | EMI payment         | 7 days        | `df_emi_grace_days` (default 7)       |
| Deposit Financing | Default declaration | 3 missed EMIs | `loan_default_threshold_missed_emis`  |
| Credit Reporting  | Reporting gap       | 5 days        | `cr_reporting_grace_days` (default 5) |

Late fee after grace: `df_late_fee_pct_bps` (default `200` = 2.00%) applied to overdue EMI amount.

## Partner SLA Matrix

| Operation                | Max Response Time | Retry          | Escalation                |
| ------------------------ | ----------------- | -------------- | ------------------------- |
| Policy creation          | 30s sync          | 3x             | Manual if 3x fail         |
| Claim filing             | 30s sync          | 3x             | Manual queue              |
| Claim adjudication       | 48h async         | N/A            | Admin notification at 24h |
| Loan disbursement        | 24h async         | N/A            | Admin notification at 12h |
| Credit report submission | 72h async         | 2x             | Skip period, log error    |
| Callback delivery        | 5s per attempt    | 5x exponential | Dead letter after 5x      |

## Financial Reconciliation

- Cron: `financial_reconciliation` runs daily at 03:00 UTC.
- Process:
  1. Sum all `DEBIT` entries per account for the day.
  2. Sum all `CREDIT` entries per account for the day.
  3. Verify `DEBIT = CREDIT` (double-entry invariant).
  4. Compare platform ledger totals vs partner reported totals.
- Mismatch handling: if delta > ₹100 (`10000` paise), create `financial_exception_cases` with `status=OPEN` and notify admin.
- Admin resolution lifecycle: `OPEN -> INVESTIGATED -> RESOLVED` (with `resolution_note`) or `WRITTEN_OFF`.
- Ownership permission: `financial.reconcile`.

---

## Financial Formulas (All Amounts in Paise)

### Rent Shield Premium

```ts
const trustBandRateBps = {
  PREMIUM: 200,
  TRUSTED: 350,
  BUILDING: 500,
  NEW: 800,
} as const;

const premiumBasePaise = Math.round(
  (coverageAmountPaise * trustBandRateBps[trustBandAtIssue]) / 10000,
);
const premiumPaise = Math.max(premiumBasePaise, rentShieldMinPremiumPaise);
```

For TRUSTED band, premium is `3.5% * coverage_amount_paise`.

### Deposit Lite Annual Fee

```ts
const annualFeePaise =
  deposit_lite_annual_fee_paise +
  Math.round((securityDepositPaise * deposit_lite_coverage_pct_bps) / 10000);
```

Default values: `deposit_lite_annual_fee_paise=99900` (₹999), `deposit_lite_coverage_pct_bps=100` (1.00%).

### Deposit Financing EMI

```ts
const P = principalPaise;
const r = annualRateBps / 120000;
const n = termMonths;

const emiPaise =
  r === 0 ? Math.round(P / n) : Math.round((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
```

### Late Fee and Pro-Rata Refund

```ts
const lateFeePaise = Math.round((overdueEmiPaise * df_late_fee_pct_bps) / 10000);

const prorataRefundPaise = Math.round(
  (totalPremiumPaise * unusedCoverageDays) / Math.max(totalCoverageDays, 1),
);
```

### Double-Entry Ledger Invariant

For every financial transaction, create exactly one `DEBIT` and one `CREDIT` row in `financial_ledger` with the same `transaction_ref`, and enforce `sum(DEBIT) - sum(CREDIT) = 0`.

---

## Partner Adapter Contract

All external calls run only in Convex Actions.

### Partner Adapter Interface

```typescript
interface FinancialPartnerAdapter {
  // Rent Shield
  createPolicy(params: {
    tenantId;
    propertyId;
    coverageAmountPaise;
    termMonths;
  }): Promise<{ partnerId: string; policyNumber: string; premiumPaise: number }>;
  fileClaim(params: {
    policyNumber;
    claimAmountPaise;
    reason;
    evidenceDocs;
  }): Promise<{ claimId: string; status: "ACCEPTED" | "REJECTED"; reason?: string }>;
  collectPremium(params: {
    policyNumber: string;
    amountPaise: number;
    periodStart: number;
    periodEnd: number;
  }): Promise<{
    transactionId: string;
    status: "SUCCESS" | "FAILED" | "PENDING";
    failureReason?: string;
  }>;

  // Deposit Lite
  enrollPlan(params: { tenantId; propertyId; annualFeePaise }): Promise<{ planId: string }>;

  // Deposit Financing
  applyLoan(params: {
    tenantId;
    amountPaise;
    termMonths;
    interestRateBps;
  }): Promise<{ applicationId: string; emiPaise: number; schedule: EMIRow[] }>;
  recordPayment(params: {
    loanId;
    amountPaise;
    paymentRef;
  }): Promise<{ status: "SUCCESS" | "FAILED" }>;

  // Credit Reporting
  submitReport(params: {
    tenantId;
    reportingPeriod;
    paymentHistory;
  }): Promise<{ reportId: string; bureau: string }>;

  // Common
  getStatus(params: {
    productType;
    externalId;
  }): Promise<{ status: string; metadata: Record<string, unknown> }>;
  handleCallback(payload: PartnerCallbackPayload): Promise<void>;
}
```

Method requirements: timeout 30s, retry 3x with exponential backoff, throw `PartnerError` with `code` + `message`, and keep all amounts in paise.

---

## Access Control, Rate Limits, and Configuration

### Permissions

| Permission                    | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `financial.policies.view`     | View policy rows and pricing snapshots            |
| `financial.policies.issue`    | Generate quote and issue policy                   |
| `financial.policies.cancel`   | Cancel policy and compute pro-rata                |
| `financial.claims.view`       | View claim queue and claim details                |
| `financial.claims.adjudicate` | Approve, deny, appeal decisions                   |
| `financial.loans.view`        | View loan applications and schedules              |
| `financial.loans.sync`        | Sync partner lending callbacks and statuses       |
| `financial.credit.view`       | View credit reporting accounts                    |
| `financial.credit.submit`     | Submit and correct bureau reports                 |
| `financial.ledger.view`       | View financial ledger                             |
| `financial.reconcile`         | Run and resolve reconciliation workflows          |
| `financial.audit_export`      | Export regulatory audit bundle (super admin only) |
| `financial.configure`         | Manage financial config keys                      |

### Financial Operation Rate Limits

| Operation        | Rate Limit Key          | Default      | Window  |
| ---------------- | ----------------------- | ------------ | ------- |
| Policy creation  | `rs_create_rate_limit`  | 3 per tenant | 24h     |
| Claim filing     | `rs_claim_rate_limit`   | 1 per policy | 30 days |
| Loan application | `df_apply_rate_limit`   | 2 per tenant | 30 days |
| Credit consent   | `cr_consent_rate_limit` | 3 per tenant | 24h     |

### Authoritative System Config Keys

All keys below are authoritative. Cross-cutting constants documentation will be updated to match.

| Key                                  | Default    | Type    | Description                        |
| ------------------------------------ | ---------- | ------- | ---------------------------------- |
| `irdai_license_verified`             | `false`    | boolean | Gate for Rent Shield availability  |
| `irdai_cooling_off_days`             | `15`       | number  | Mandatory cooling-off period       |
| `claim_auto_approve_threshold`       | `5000000`  | number  | ₹50,000 auto-approval threshold    |
| `deposit_lite_annual_fee_paise`      | `99900`    | number  | ₹999 fixed annual fee              |
| `deposit_lite_coverage_pct_bps`      | `100`      | number  | 1.00% variable annual component    |
| `loan_max_term_months`               | `12`       | number  | Maximum financing tenure           |
| `loan_min_amount_paise`              | `1000000`  | number  | ₹10,000 minimum loan amount        |
| `loan_max_amount_paise`              | `50000000` | number  | ₹5,00,000 maximum loan amount      |
| `loan_default_threshold_missed_emis` | `3`        | number  | Missed EMI count before default    |
| `loan_writeoff_days`                 | `180`      | number  | Days in default before write-off   |
| `credit_report_frequency_days`       | `30`       | number  | Reporting cadence                  |
| `credit_max_pauses_per_year`         | `2`        | number  | Maximum pause requests per year    |
| `financial_reconciliation_cron_hour` | `3`        | number  | Daily reconciliation UTC hour      |
| `premium_collection_batch_size`      | `100`      | number  | Monthly premium batching size      |
| `dpdp_retention_years`               | `8`        | number  | Consent and audit retention period |
| `rs_premium_grace_days`              | `15`       | number  | Rent Shield premium grace period   |
| `df_emi_grace_days`                  | `7`        | number  | EMI grace period                   |
| `cr_reporting_grace_days`            | `5`        | number  | Reporting grace period             |
| `df_late_fee_pct_bps`                | `200`      | number  | Late fee after EMI grace (2.00%)   |

---

## Scheduled Jobs and Batching

### Premium Collection Batching

- Cron: `premium_collection_batch` runs on 1st of each month at 06:00 UTC.
- Batch size: `premium_collection_batch_size` (default 100).
- Process:
  1. Query `ACTIVE` policies with `next_premium_date <= today`.
  2. For each batch, call partner adapter `collectPremium()`.
  3. On success: create ledger `DEBIT` entry and update `next_premium_date`.
  4. On failure: retry 3x over 3 days, then mark policy `LAPSED`.
- Grace period before lapse: 15 days.

### Other Required Jobs

- `financial_reconciliation` daily at 03:00 UTC.
- `financial.retryPartnerCallbacks` every 10 minutes.
- `financial.submitMonthlyCreditReports` every 30 days.
- `financial.retentionSweep` monthly for `dpdp_retention_years` retention.

---

## Financial Analytics Dashboard

Admin page: `/admin/financial-products`.

- Cards:
  1. Active policies count + total coverage
  2. Open claims + average resolution time
  3. Active loans + total outstanding
  4. Credit reporting accounts + coverage
- Charts: premium revenue trend (30d), claim ratio, loan default rate, EMI collection rate.
- Table: recent financial events.
- Query contract: `financialAnalytics.getDashboard(timeWindow)`.

---

## Migration Plan

V1 launches with all products in pilot mode (config-gated per society).

1. Export existing deposit records from spreadsheets.
2. Create `deposit_lite_plans` rows with `ACTIVE` status and correct dates.
3. Reconcile migrated records against partner records.

Backfill mutation: `financialProducts.backfillFromManual({records})` (admin-only, idempotent).

---

## Financial Calculation Test Strategy

Property-based tests are mandatory for financial formulas:

1. EMI formula with randomized inputs: verify sum of EMIs approximately equals principal + interest within ±1 paise rounding.
2. Premium pricing: verify each trust band maps to correct bps rate.
3. Pro-rata refund: verify `refund_amount + used_amount = total_premium` within ±1 paise.
4. Late fee: verify fee applies only after grace period.

Fixtures path: `tests/fixtures/financial/` with known input/output pairs.

Edge cases: zero-month term, max amount, minimum amount, and exact grace-period boundary.

---

## Accessibility

- All financial amounts must include `aria-label` with full rupee value (example: "Twenty-five thousand rupees").
- Status badges must use color + icon + text (not color-only).
- EMI schedule tables must use `<th scope='col'>` headers.
- Financial input fields must set `inputMode='numeric'` with visible format hints.
- Error messages must reference specific field names and required formats.

---

## Fraud Controls and Exception Handling

1. Duplicate coverage guard: only one active policy per `transaction_id` per product.
2. Synthetic claim detection: block repeated evidence hash, impossible timeline, or mismatched tenancy anchors.
3. Claim sanity checks: reject claim amounts above configured caps or remaining coverage.
4. Partner callback drift: mismatched partner status opens `financial_exception_cases`.
5. Credit report dedupe: unique `(tenant, month, bureau)` idempotency key.

---

## Audit and Regulatory Trail

### Financial Audit Action Literals

- `financial.policy_created`
- `financial.policy_cancelled`
- `financial.claim_filed`
- `financial.claim_approved`
- `financial.claim_denied`
- `financial.claim_disbursed`
- `financial.loan_applied`
- `financial.loan_approved`
- `financial.loan_disbursed`
- `financial.loan_payment_received`
- `financial.loan_defaulted`
- `financial.credit_consent_obtained`
- `financial.credit_consent_revoked`
- `financial.credit_report_submitted`
- `financial.reconciliation_mismatch`
- `financial.exception_resolved`

### Regulatory Audit Trail

- Every financial operation writes audit logs using the literals above.
- Regulatory export query: `financialAudit.exportBundle({productType, dateRange})`.
- Bundle includes: transactions, state transitions, consent records, partner communications, exception cases, and reconciliation results.
- Retention: `dpdp_retention_years` (default 8).
- Export format: JSON with ISO timestamps.
- Access: `financial.audit_export` (super admin only).

---

## Verification Scenarios (Epic-Level)

- **E01**: Create Rent Shield policy for test tenant with TRUSTED band. Verify premium = 3.5% x coverage. File claim under auto-approve threshold and verify instant approval. File claim above threshold and verify `UNDER_REVIEW`. Cancel within 15 days and verify full refund. Verify double-entry ledger rows exist.
- **E02**: Enroll Deposit Lite plan. Verify annual fee = ₹999 + 1% of deposit. Verify coverage equals deposit amount. Cancel and verify pro-rata refund calculation.
- **E03**: Apply Deposit Financing loan. Verify EMI formula `(P * r * (1+r)^n) / ((1+r)^n - 1)` in paise. Make 3 payments and verify outstanding balance decreases. Miss 3 EMIs and verify `DEFAULTED`. Verify late fee computation.
- **E04**: Obtain credit consent. Verify DPDP consent row created. Submit test report. Pause reporting and verify max 2 pauses. Revoke consent and verify `CLOSED` plus retention handling.

---

## Completion Criteria (Testable)

1. All five state machines are implemented with validated transitions.
2. Rent Shield policy states and claim states are modeled separately and consistently.
3. Canonical table names above are used without alias drift.
4. All formulas are paise-safe and deterministic.
5. Regulatory gates block invalid issuance/disbursement/reporting.
6. Double-entry ledger invariant holds for every financial mutation.
7. Partner adapters enforce timeout, retries, idempotency, signatures, and dead-letter handling.
8. All required config keys, rate limits, and audit actions are wired.

---

## Related Documents

- [Transaction Completion Rails](26-transaction-completion-rails.md) - P34 transaction status contracts and closure gating
- [Tenant Trust Score & Reviews](31-tenant-trust-score-reviews.md) - trust band and trust snapshot source
- [Monetization Foundation](28-monetization-foundation.md) - revenue split and fee accounting patterns
- [Notification Infrastructure](27-notification-infrastructure.md) - event dispatch, retries, and dead-letter conventions
- [Convex Schema](../10-convex-schema.md) - schema validator/index style
- [Constants Reference](../13-constants-reference.md) - enum, permission, and config key conventions
