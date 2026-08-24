---
id: P39-E02
title: Review System Backend
phase: 39
status: pending
depends_on: ["P39-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-20
---

# P39-E02: Review System Backend

## Overview

Implement the full P39 review backend: review schema, eligibility gating, cooling/edit lifecycle, moderation state machine, anti-gaming + anomaly controls, response contracts, and materialized aggregate refresh for listing/guard surfaces.

Refer to feature spec sections: Admin Analytics, Bulk Moderation, Notification Triggers, Data Retention, Accessibility, Mobile UI, Error Handling, Cron Schedule for implementation guidance.

## Prerequisites

- **Read first**: [P39-E01 Completion Summary](P39-E01-trust-score-schema-computation.md#completion-summary) — trust constants/config/auth groundwork.
- `tenant_trust` permissions and config keys from P39-E01 are available.

## Epic Verification (Task-Specific)

Verify review submission: create review, confirm initial state is `PENDING_COOLING` (48h cooling period). After cooling period expires (or via test time-advance), confirm state transitions to `PUBLISHED`. Submit duplicate (same `interaction_id` + `review_type` + reviewer), confirm rejection.

## Task Queue

- [ ] P39-E02-T01: Add review schema tables, enums, and anti-gaming indexes
- [ ] P39-E02-T02: Implement canonical eligibility engine with interaction type validation
- [ ] P39-E02-T03: Implement submission, cooling edit semantics, and one-time response mutations
- [ ] P39-E02-T04: Implement moderation action mapping, anomaly detection, and aggregate refresh strategy
- [ ] P39-E02-T05: Implement review queries including moderation queue filters/sort/pagination and error contracts

## Test Strategy

Unit tests: review creation, duplicate rejection, cooling period enforcement, rate limiting. Integration: full review lifecycle `PENDING_COOLING` -> `PUBLISHED` -> `FLAGGED` -> `HIDDEN` -> `REMOVED`.

---

## T01: Add Review Schema Tables, Enums, and Anti-Gaming Indexes

### Objective

Create `reviews`, `review_responses`, and `review_aggregates` schema definitions aligned with canonical review types/targets/statuses and enforce anti-gaming requirements through indexes and contract-level uniqueness checks.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Review Dimensions, Review Lifecycle, Anti-Gaming, Schema sections
- `notes/10-convex-schema.md` — validator/index conventions
- `notes/13-constants-reference.md` — enum and permission registration
- `convex/schema.ts`
- `lib/constants.ts`
- Refer to feature spec sections: Admin Analytics, Bulk Moderation, Notification Triggers, Data Retention, Accessibility, Mobile UI, Error Handling, Cron Schedule for implementation guidance.

### Key Rules

1. Review model supports exactly four `review_type` values and explicit `target_type` mapping.
2. Add `interaction_type` enum (`VISIT`, `TENANCY`, `TRANSACTION`) and validate against source tables.
3. Include anti-gaming fields on `reviews`: `review_text_hash` and `idempotency_key`.
4. Include cooling lifecycle fields: `status`, `cooling_until`, `cooling_edit_count`.
5. Add index contracts for duplicate prevention and moderation queue querying.

### Deliverables

- [ ] `convex/schema.ts` - `reviews`, `review_responses`, `review_aggregates` definitions with required indexes
- [ ] `lib/constants.ts` - review enums, moderation enums, reason code enums
- [ ] `notes/10-convex-schema.md` - P39 review schema documentation

### Acceptance Criteria

1. Schema supports all 4 review types and all required target mappings.
2. `reviews` includes `review_text_hash` and `idempotency_key` fields.
3. Required index contracts exist for interaction uniqueness, idempotency, status, and cooling expiry.
4. `review_responses` supports once-only response contract (`by_review_id` uniqueness by contract).
5. `review_aggregates` supports listing/guard materialized cache needs.
6. `npx tsc --noEmit` passes with clean LSP diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, and `notes/10-convex-schema.md`.

### Out of Scope

- Review query/mutation business logic
- Trust score recompute logic
- UI implementation

---

## T02: Implement Canonical Eligibility Engine With Interaction Validation

### Objective

Implement deterministic eligibility checks that validate interaction type/source-table ownership, submission window, duplicate constraints, and role safety before review submission.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Review Type -> Target Mapping Matrix, Eligibility Gates
- `notes/features/13-tenant-inquiry.md` — visit linkage context
- `notes/features/29-post-move-in-lifecycle.md` — tenancy anchors
- `notes/features/34-financial-products-insurance.md` — transaction completion context
- `convex/visits.ts`
- `convex/rentalTransactions.ts`

### Key Rules

1. Validate `interaction_type` against the correct source table:
   - `VISIT` -> `visits`
   - `TENANCY` -> `resident_profiles`
   - `TRANSACTION` -> `rental_transactions`
2. Enforce reviewer participation and role correctness for each review type.
3. Enforce one review per `(interaction_ref_id, review_type, reviewer_user_id)`.
4. Enforce `review_submission_window_days` from interaction completion timestamp.
5. Return stable reason codes for ineligibility (`ERR_REVIEW_NOT_ELIGIBLE` contract).

### Deliverables

- [ ] `convex/reviews.ts` - eligibility helpers and `reviews.getEligibility` query
- [ ] `convex/reviews.ts` - validation utilities for target_type/required-target-field matrix
- [ ] `lib/constants.ts` - eligibility reason code constants

### Acceptance Criteria

1. Ineligible requests are rejected with deterministic reason codes.
2. Interaction type/source mismatch fails safely.
3. Duplicate review attempts are blocked before insert.
4. Submission window violations are correctly rejected.
5. Eligibility logic is reusable by both query and submit mutation paths.
6. `npx tsc --noEmit` passes with clean LSP diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/reviews.ts` and any changed helper modules.

### Out of Scope

- Moderation transitions
- Aggregate refresh logic
- Frontend form behavior

---

## T03: Implement Submission, Cooling Edit Semantics, and One-Time Responses

### Objective

Build write-path mutations for review submission, one-time in-cooling edit, one-time response creation, and single edit for responses.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Cooling Edit Semantics, Response Permissions and Policies, Error Contract
- `notes/11-convex-architecture.md` — mutation wrappers and auth patterns
- `convex/auth.helpers.ts`
- `convex/functions.ts`

### Key Rules

1. All new reviews start in `PENDING_COOLING` with `cooling_until = submitted_at + review_cooling_period_ms`.
2. Exactly one review edit is allowed before/at `cooling_until`; post-cooling edits are rejected.
3. Idempotency key is mandatory and must be enforced per reviewer.
4. Response creation is once-only per review; response edit is max one edit.
5. Owner/admin response permissions must follow role and review-type constraints.

### Deliverables

- [ ] `convex/reviews.ts` - `reviews.submit`, `reviews.editDuringCooling`, `reviews.addResponse`, `reviews.editResponse`
- [ ] `convex/functions.ts` - wrapped mutation exports for review write operations
- [ ] `lib/constants.ts` - error code literals used by write paths

### Acceptance Criteria

1. Submit mutation enforces eligibility + idempotency + duplicate constraints.
2. Cooling edit mutation allows one edit only and rejects all invalid edit windows.
3. Response creation is blocked if a response already exists.
4. Response edit allows one edit only and records `edited_at`.
5. Unauthorized responders receive explicit error contract codes.
6. Rate limit enforced: 6th review submission by same user within 24h returns rate limit error. Enforcement uses `reviews:submit` key in `rateLimiter.ts` with limit from `review_submission_rate_limit` config.
7. `npx tsc --noEmit` passes with clean LSP diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/reviews.ts`, `convex/functions.ts`, and `lib/constants.ts`.

### Out of Scope

- Moderation queue read APIs
- Aggregate cache refresh logic
- UI rendering for responses

---

## T04: Implement Moderation Action Mapping, Anomaly Detection, and Aggregate Refresh

### Objective

Implement moderation actions (`HIDE`, `UNHIDE`, `MARK_ABUSIVE`, `RESOLVE_FLAG`), status transition enforcement, anomaly detection thresholds, and materialized aggregate cache refresh strategy.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Review Lifecycle State Machine, Anti-Gaming and Anomaly Detection, Materialized Aggregates
- `notes/04-state-machines.md` — transition validation patterns
- `convex/crons.ts`
- `convex/trustBadges.ts` (for cache update patterns)

### Key Rules

1. Moderation action->status mapping must match canonical transitions exactly.
2. `MARK_ABUSIVE` transitions to terminal `REMOVED` from any non-removed state.
3. Anomaly rule: 5+ reviews in 24 hours and `abs(z_score) > review_anomaly_z_threshold` with sample >= `review_anomaly_min_sample`.
4. Refresh `review_aggregates` on publish/unhide/hide/abusive/resolve transitions.
5. Aggregate averages must use 1-decimal precision (store as x10 integer).

### Deliverables

- [ ] `convex/reviews.ts` - moderation mutation and transition validator
- [ ] `convex/reviews.ts` - anomaly detection helpers and flags
- [ ] `convex/reviews.ts` - aggregate refresh helpers
- [ ] `convex/crons.ts` - cooling expiry processor schedule and internal call wiring

### Acceptance Criteria

1. Invalid moderation transitions are rejected.
2. All moderation actions persist moderator metadata and reason code.
3. Cooling expiry transitions to `PUBLISHED` or `FLAGGED` deterministically.
4. Aggregate cache updates correctly after status-affecting moderation actions.
5. Aggregate rating is rounded to one decimal for listing/guard views.
6. `npx tsc --noEmit` passes with clean LSP diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/reviews.ts` and `convex/crons.ts`.

### Out of Scope

- Trust score recompute and decay
- UI moderation page implementation
- Long-form dispute handling

---

## T05: Implement Review Queries, Moderation Queue Filters, and Error Contracts

### Objective

Expose review read APIs for listing/guard/tenant contexts and admin moderation queue with required filtering, sorting, pagination defaults, and stable error contracts.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Convex Contracts, Pagination defaults, Error Contract
- `notes/11-convex-architecture.md` — query organization and permission checks
- `convex/reviews.ts`
- `lib/constants.ts`

### Key Rules

1. Public listing/guard queries return only `PUBLISHED` reviews + response payloads.
2. Moderation queue query supports filters: status, review_type, target_type, anomaly flag, date range.
3. Moderation queue supports sort options: `submitted_desc`, `rating_asc`, `rating_desc`.
4. Use paginated contract with defaults (20) and cap (100).
5. Return stable error codes for permission and validation failures.

### Deliverables

- [ ] `convex/reviews.ts` - `listForListing`, `listForGuard`, `listForTenant`, `listModerationQueue`
- [ ] `convex/reviews.ts` - list response mappers with response joins and aggregate metadata
- [ ] `lib/constants.ts` - queue sort/filter literals and error code constants
- [ ] `convex/reviews.test.ts` (or existing test file) - eligibility/moderation/query coverage

### Acceptance Criteria

1. Public listing and guard review queries exclude non-published statuses.
2. Tenant reliability review query is permission-gated for owner/admin use cases.
3. Moderation queue supports required filters and sort options with deterministic ordering.
4. Pagination works with `page/isDone/continueCursor` and default/cap constraints.
5. Error contracts are stable and referenced by tests.
6. `npx tsc --noEmit` and tests pass with clean diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
npm run test
```

Run `lsp_diagnostics` on changed review files and related constants/test files.

### Out of Scope

- UI consumption components
- Trust score math changes
- Review dispute arbitration features

---

## Completion Summary

Completion details are recorded when this epic is marked `done`.
