---
id: P42-E04
title: Rent Credit Reporting and Bureau Operations
phase: 42
status: pending
depends_on: ["P42-E01", "P42-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "task-planner"]
updated_at: 2026-02-20
---

# P42-E04: Rent Credit Reporting and Bureau Operations

## Overview

Implement DPDP-compliant consent-led rent credit reporting with monthly DPD payload generation, bureau submission/correction rails, and reporting lifecycle controls (`CONSENT_OBTAINED` -> `REPORTING` -> `CORRECTION_PENDING` -> `CORRECTED` -> `PAUSED` -> `CLOSED`).

## Prerequisites

- **Read first**: [P42-E01 Completion Summary](P42-E01-rent-shield.md#completion-summary)
- **Read first**: [P42-E03 Completion Summary](P42-E03-deposit-financing.md#completion-summary)
- Financing DPD signal outputs from E03 must be available for report assembly

## Task Queue

- [ ] P42-E04-T01: Add credit reporting account/report schema and consent linkage
- [ ] P42-E04-T02: Implement consent capture/revoke flow with DPDP retention and data minimization checks
- [ ] P42-E04-T03: Implement monthly report generation with DPD payload contract and idempotent dedupe
- [ ] P42-E04-T04: Implement bureau adapter submissions, corrections, and callback reconciliation
- [ ] P42-E04-T05: Implement pause/terminate operations, exception queue, notifications, and observability hooks

---

## T01: Add Credit Reporting Account/Report Schema and Consent Linkage

### Objective

Create persistent contracts for reporting state and monthly bureau payload records.

### Required Reading

- `notes/features/34-financial-products-insurance.md`
- `notes/features/26-transaction-completion-rails.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`

### Key Rules

1. Reporting account lifecycle statuses must match canonical state machine (`CONSENT_OBTAINED`, `REPORTING`, `CORRECTION_PENDING`, `CORRECTED`, `PAUSED`, `CLOSED`).
2. Monthly report records must be stored in canonical `rent_credit_reports` and include DPD fields and bureau status fields.
3. Reports must be keyed idempotently by tenant + month + bureau.
4. Reporting account must reference `financial_consent` artifact.
5. Bureau enum values must be `EXPERIAN_INDIA | CIBIL | CRIF`.
6. Schema must include correction tracking fields.

### Deliverables

- [ ] `convex/schema.ts` - `rent_credit_reporting_accounts` and `rent_credit_reports` tables
- [ ] `lib/constants.ts` - reporting status enums/transition maps and bureau enums
- [ ] `notes/10-convex-schema.md` - reporting schema docs

### Acceptance Criteria

1. Both tables compile with correct validator unions and indexes.
2. Reporting account cannot exist without consent linkage field.
3. Reporting status transition map supports correction and pause workflows.
4. Bureau status map uses `CORRECTION_PENDING` (not `CORRECTION_NEEDED`).
5. Bureau enum in schema is restricted to `EXPERIAN_INDIA`, `CIBIL`, `CRIF`.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts` and `lib/constants.ts`.

### Out of Scope

- Consent mutation logic
- Bureau API calls

---

## T02: Implement Consent Capture/Revoke Flow With DPDP Retention and Data Minimization Checks

### Objective

Implement explicit, versioned consent handling as a hard prerequisite for any credit submission.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (DPDP section)
- `notes/03-roles-and-permissions.md`
- `convex/financialConsents.ts` (from E01 if extracted)

### Key Rules

1. Capture consent artifact fields exactly (`consent_version`, `consent_text_hash`, `consent_channel`, `consent_ip`, `retention_until`).
2. `retention_until` must equal `granted_at + dpdp_retention_years`.
3. Revocation must transition reporting account to `CLOSED` and block future submissions.
4. Data minimization checks must reject payloads containing non-whitelisted fields.
5. Consent version mismatch with config must block submission.
6. Pause tracking must enforce max 2 pauses per year.

### Deliverables

- [ ] `convex/rentCreditReporting.ts` - consent grant/revoke mutations and account state updates
- [ ] `convex/financialConsents.ts` (or shared module) - consent lookup/validation helpers

### Acceptance Criteria

1. No report can be submitted without valid unrevoked consent.
2. Revocation timestamps are persisted and respected by reporting jobs.
3. Revoked consent immediately transitions account to `CLOSED`.
4. Retention policy is deterministic and queryable.
5. Invalid/minimization-failing payloads are rejected with stable error code.
6. Pause requests beyond yearly limit are blocked.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on reporting + consent modules changed.

### Out of Scope

- Monthly cron submission
- Bureau partner callbacks

---

## T03: Implement Monthly Report Generation With DPD Payload Contract and Idempotent Dedupe

### Objective

Generate monthly report rows from canonical rent records and repayment signals.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (DPD payload contract)
- `notes/features/29-post-move-in-lifecycle.md` (rent record semantics)
- `notes/features/26-transaction-completion-rails.md`

### Key Rules

1. Reporting is allowed only for `REPORTING` accounts.
2. DPD fields must be deterministic from due date and payment received date.
3. Dedupe by `(tenant_user_id, report_month_key, bureau_name)` idempotency key.
4. Only minimal fields required by bureaus may be included.
5. Report generation should create exception rows for incomplete anchors.
6. Reporting cadence must follow `credit_report_frequency_days`.

### Deliverables

- [ ] `convex/rentCreditReporting.ts` - month generation function(s)
- [ ] `convex/crons.ts` - monthly generation/scheduling registration
- [ ] `convex/financialExceptions.ts` - report-generation error reasons

### Acceptance Criteria

1. Monthly generation creates one report per tenant-month-bureau key.
2. Duplicate reruns do not create duplicate rows.
3. DPD fields match contract in feature doc.
4. Missing anchors produce triageable exception rows.
5. Reports are skipped for `PAUSED` and `CLOSED` accounts.
6. Reporting-gap grace (`cr_reporting_grace_days`) is honored before exception creation.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on reporting + cron files.

### Out of Scope

- Bureau API transport details
- UI pages

---

## T04: Implement Bureau Adapter Submissions, Corrections, and Callback Reconciliation

### Objective

Wire partner transport for submit/correct flows with signed callback processing.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (partner adapter contract)
- `convex/actions/financialPartners.ts`
- `convex/financialPartnerCallbacks.ts`

### Key Rules

1. Bureau submissions and corrections must run only in Convex Actions.
2. Every outbound request must include idempotency key.
3. Callback signature verification is mandatory before status updates.
4. Retry policy: 3 attempts with exponential backoff, then dead-letter.
5. Status reconciliation must reject illegal transitions (`ACCEPTED` -> `SUBMITTED`, etc.).

### Deliverables

- [ ] `convex/actions/financialPartners.ts` - bureau submit/correct operations
- [ ] `convex/rentCreditReporting.ts` - submission/correction mutations and status mapping
- [ ] `convex/financialPartnerCallbacks.ts` - bureau callback handlers

### Acceptance Criteria

1. Submission and correction APIs are idempotent.
2. Callback replay does not duplicate side effects.
3. Dead-letter captures exhausted callback failures.
4. Rejections route to exception queue with normalized reason codes.
5. Status mapping supports `CORRECTION_PENDING -> CORRECTED` transitions only.
6. Adapter timeout/retry behavior follows 30s + exponential retry policy.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed adapter/callback/reporting files.

### Out of Scope

- Credit score UI display features
- Bureau-side dispute SLA outside platform controls

---

## T05: Implement Pause/Terminate Operations, Exception Queue, Notifications, and Observability Hooks

### Objective

Finalize operational controls for reporting lifecycle management and monitoring.

### Required Reading

- `notes/features/34-financial-products-insurance.md` (notifications + observability + error taxonomy)
- `notes/features/27-notification-infrastructure.md`
- `notes/06-admin-panel-ux.md`

### Key Rules

1. Pause and close transitions must follow reporting lifecycle map.
2. `CLOSED` must block future report generation immediately.
3. Pause requests are limited by `credit_max_pauses_per_year`.
4. Emit notification events for report submitted/rejected and consent revocation.
5. Add operational queries for exception triage and reporting health metrics.
6. Align error codes with P42 taxonomy for all reporting mutations.

### Deliverables

- [ ] `convex/rentCreditReporting.ts` - pause/resume/terminate and monitoring queries
- [ ] `convex/financialExceptions.ts` - reporting exception triage helpers
- [ ] `convex/notifications.ts` or internal emits - credit reporting event hooks

### Acceptance Criteria

1. Reporting account state transitions enforce pause/resume/close rules.
2. `CLOSED` accounts are excluded from scheduled report submission.
3. Pause count guard blocks a third pause in the same year.
4. Exception queue clearly surfaces bureau rejection and data errors.
5. Notification events are emitted exactly once per event key.
6. Consent revocation triggers auditable `financial.credit_consent_revoked` action.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all files changed in this task.

### Out of Scope

- New customer-facing credit score widgets
- Non-rent tradeline reporting products

---

## Epic Verification Scenario

```bash
# E04 scenario validation
# 1) Obtain credit consent and verify DPDP consent row
# 2) Submit test report and verify bureau submission row
# 3) Pause reporting and verify max 2 pauses per year
# 4) Revoke consent and verify CLOSED status + retention handling
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
