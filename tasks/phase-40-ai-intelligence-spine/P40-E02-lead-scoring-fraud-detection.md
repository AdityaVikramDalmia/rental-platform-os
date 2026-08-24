---
id: P40-E02
title: Lead Scoring & Fraud Detection
phase: 40
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P40-E02: Lead Scoring & Fraud Detection

## Overview

Implement deterministic lead conversion scoring and fraud risk scoring with exact formulas, explicit explainability payloads, fraud appeals lifecycle, admin alerting contracts, and daily recompute jobs. This epic closes all math and data-model ambiguity for risk decisions.

## Prerequisites

- `notes/features/32-ai-intelligence-spine.md` formulas are final source of truth.
- P11 fingerprint data exists for `fingerprint_dup` fraud signal.
- P35 notification event pipeline available for alert events (soft dependency).
- Image dedup enrichment from P40-E03 is optional; core E02 scoring can run without it and attach dHash evidence after E03 completion.

## Task Queue

- [ ] P40-E02-T01: Add lead/fraud schema models, enums, and audit actions
- [ ] P40-E02-T02: Implement lead conversion formula (FIT/ENGAGEMENT/ANTI) with normalization and bands
- [ ] P40-E02-T03: Implement fraud scoring signals, duplicate-photo evidence, and appeals lifecycle
- [ ] P40-E02-T04: Wire admin queries, cron recomputes, notifications, and analytics snapshot contract

---

## T01: Add Lead/Fraud Schema Models, Enums, and Audit Actions

### Objective

Create persistence contracts and constant coverage for lead conversion, fraud risk, and fraud appeals so downstream code has stable validators and state machines.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `convex/schema.ts`
- `lib/constants.ts`

### Key Rules

1. `ai_lead_scores` and `ai_fraud_signals` must include `confidence_score`, `model_version`, and `computed_at`.
2. `fraud_appeals` state machine is strictly `SUBMITTED -> UNDER_REVIEW -> UPHELD/OVERTURNED`.
3. Alert thresholds are config-driven (`ai_fraud_alert_threshold`, `ai_fraud_block_threshold`).
4. Audit action strings for all AI score/appeal operations are mandatory.
5. Use union literals for all enums; no free-form status strings.
6. Model runtime parameters (`temperature`, `max_tokens`, `timeout`, `retry`) are defined in the feature spec Model Configuration section. Use these exact values when configuring OpenAI Action calls.

### Deliverables

- [ ] `convex/schema.ts` - add/update `ai_lead_scores`, `ai_fraud_signals`, and `fraud_appeals`
- [ ] `lib/constants.ts` - add score bands, fraud alert states, fraud appeal statuses, and audit action constants
- [ ] `notes/features/32-ai-intelligence-spine.md` - keep table/enum names synchronized if implementation naming adjusts

### Acceptance Criteria

1. `ai_lead_scores` contains fit/engagement/anti components and normalized score band.
2. `ai_fraud_signals` stores per-signal weighted contributions and alert state.
3. `fraud_appeals` supports lifecycle transitions and reviewer resolution metadata.
4. Audit actions include score compute/recompute, alert, auto-flag, appeal submitted/resolved.
5. Type checks pass without unsafe type assertions.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts` and `lib/constants.ts`.

### Out of Scope

- scoring execution logic
- admin UI wiring

---

## T02: Implement Lead Conversion Formula (FIT/ENGAGEMENT/ANTI) With Normalization and Bands

### Objective

Implement exact lead conversion scoring math and recompute contracts so queue prioritization is deterministic and inspectable.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Scoring Formulas)
- `notes/features/13-tenant-inquiry.md`
- `convex/leads.ts`
- `convex/tenantInquiries.ts`
- `convex/functions.ts`

### Key Rules

1. FIT max = 90, ENGAGEMENT max = 15, ANTI min = -30 exactly.
2. Normalize using `round(clamp(((raw + 30) / 135) * 100, 0, 100))`.
3. Bands exactly: HOT >=80, WARM 50-79, COOL 20-49, COLD <20.
4. Persist explainability payload with top positive/negative factors.
5. Expose stable query contracts for `getForLead` and `listTopPriority`.

### Deliverables

- [ ] `convex/aiLeadScores.ts` - lead scoring calculators + `recomputeForLead` mutation
- [ ] `convex/aiLeadScores.ts` - `getForLead` and `listTopPriority` queries with exact validator contracts
- [ ] `convex/aiLeadScores.ts` - helper to map score to band via config keys

### Acceptance Criteria

1. Any computed score is always within `0..100`.
2. Raw inputs in range `-30..105` normalize as specified.
3. Band mapping is exact at boundary values (`20`, `50`, `80`).
4. Query payload includes `score`, `band`, `confidence_score`, and explainability data.
5. Recompute mutation updates latest score atomically and logs audit action.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/aiLeadScores.ts`.

### Out of Scope

- fraud signal computation
- notification delivery

---

## T03: Implement Fraud Scoring Signals, Duplicate-Photo Evidence, and Appeals Lifecycle

### Objective

Implement fraud score aggregation with weighted signals, duplicate-photo linkage (`dHash` hamming <= 5), and complete appeal workflow.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Fraud Risk Score, Duplicate Photo Detection Contract)
- `notes/features/09-quality-and-controls.md`
- `convex/listings.ts`
- `convex/guards.ts`
- `convex/auth.helpers.ts`

### Key Rules

1. Signal weights are fixed: 30/20/15/15/10/10 and total clamped to 100.
2. Alert at score >=60 and auto-flag at >=80.
3. Duplicate-photo signal must use `image_hash` (dHash) and Hamming threshold <=5.
4. Appeals require permission checks and legal status transitions only.
5. Auto-flagged leads remain overrideable via `ai.override` permission.

### Deliverables

- [ ] `convex/aiFraud.ts` - fraud score calculators, `recomputeForLead`, `getForLead`, `listAlerts`
- [ ] `convex/aiFraud.ts` - `submitAppeal` and `updateAppealStatus` mutations with validators
- [ ] `convex/aiFraud.ts` - evidence capture contract linking duplicate photo ids/fingerprint references

### Acceptance Criteria

1. Fraud score output always falls in `0..100`.
2. `duplicate_photo` signal only triggers when min Hamming distance <=5.
3. Alert state transitions to `ALERTED` at >=60 and `AUTO_FLAGGED` at >=80.
4. Appeal transitions outside allowed lifecycle are rejected with typed errors.
5. Returned fraud payload includes explainability signal breakdown and evidence ids.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/aiFraud.ts`.

### Out of Scope

- photo upload UI behavior
- vacancy freshness logic

---

## T04: Wire Admin Queries, Cron Recomputation, Notifications, and Analytics Snapshot Contract

### Objective

Connect computed lead/fraud outputs to admin workflows and background jobs, including daily cron runs and analytics/event contracts.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Cron Cadence + Cross-Phase Contracts)
- `convex/crons.ts`
- `convex/analytics.ts`
- `convex/notifications.ts`
- `src/app/(admin)/admin/dashboard/page.tsx`

### Key Rules

1. Cron names/schedules are exact: `recomputeLeadScores` at 02:00 UTC, `recomputeFraudRisk` at 03:00 UTC.
2. Notification events must follow the P40 -> P35 payload schema.
3. Analytics snapshot extension must include cost/call/fail metrics required by P12 contract.
4. Admin APIs require `ai.view` or stricter permissions for mutate/review flows.
5. No duplicate alerts for unchanged score state.

### Deliverables

- [ ] `convex/crons.ts` - schedule both daily recompute jobs
- [ ] `convex/actions/aiBatch.ts` - recompute orchestration actions
- [ ] `convex/notifications.ts` - event emitters for fraud alerts/auto-flags
- [ ] `convex/analytics.ts` - AI daily snapshot fields for P12 consumption

### Acceptance Criteria

1. Daily recompute jobs run at exact required UTC times.
2. Alert events emit once when threshold boundary is crossed.
3. Analytics snapshot includes `total_cost_cents`, `total_calls`, `total_failures`, and `fail_rate`.
4. Admin dashboard query can consume score/band data without contract mismatch.
5. Build succeeds with generated API types intact.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/crons.ts`, `convex/actions/aiBatch.ts`, `convex/notifications.ts`, and `convex/analytics.ts`.

### Out of Scope

- UI redesign of admin dashboard cards
- long-term anomaly model experimentation

---

## Epic Verification Scenario (Task-Specific)

Create a test lead with known fraud signals (duplicate phone plus suspicious timing). Verify fraud score is `>= 60`. Verify `WATCH` risk status is set. Override risk level to `WATCH` (downgrade from `ALERT`/`BLOCK`), verify `risk_override='WATCH'` is persisted while original model `risk_level` remains intact. Note: `CLEAR` is not a valid fraud risk level - override targets are `WATCH`, `ALERT`, or `BLOCK` only. Run batch cron and verify only unscored leads are processed.

---

## Completion Summary

> Fill this section when epic status becomes `done`.

**Completed**: YYYY-MM-DD

### What Was Built

- TODO

### Key File Locations

| File                     | What |
| ------------------------ | ---- |
| `convex/aiLeadScores.ts` | TODO |
| `convex/aiFraud.ts`      | TODO |

### Deviations from Spec

- TODO

### Gotchas for Next Epic

- TODO
