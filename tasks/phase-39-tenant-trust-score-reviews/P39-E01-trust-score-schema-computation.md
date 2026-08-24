---
id: P39-E01
title: Trust Score Schema & Computation
phase: 39
status: pending
depends_on: []
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-20
---

# P39-E01: Trust Score Schema & Computation

## Overview

Implement the canonical tenant trust data model and score engine defined in `notes/features/31-tenant-trust-score-reviews.md`: four-component formula, history snapshots, eligibility snapshots for P42, backfill behavior, and scheduled recompute/decay ownership.

Refer to feature spec sections: Admin Analytics, Bulk Moderation, Notification Triggers, Data Retention, Accessibility, Mobile UI, Error Handling, Cron Schedule for implementation guidance.

## Prerequisites

- P34 contracts are required for transaction/KYC signal sources.
- P37 behavior signals enhance scoring when available; P39 must still function with default/stub values when P37 data is absent.
- P22 referral milestones are available for one-time trust boost signal.

## Epic Verification (Task-Specific)

Verify trust score computation: create test tenant, set component values, confirm `overall_score` = weighted sum. Verify decay: advance clock 91 days, confirm score decreases by 2. Verify floor: score cannot go below 15.

## Task Queue

- [ ] P39-E01-T01: Add trust enums, permissions, and config keys to constants and seed defaults
- [ ] P39-E01-T02: Add trust schema tables and required indexes (`tenant_trust_scores`, `trust_score_components`, `trust_score_history`, `trust_eligibility_snapshots`)
- [ ] P39-E01-T03: Implement canonical score computation with signal normalization, referral boost, decay ordering, and band derivation
- [ ] P39-E01-T04: Implement trust queries/mutations including history pagination and immutable eligibility snapshot export
- [ ] P39-E01-T05: Implement cron ownership, backfill baseline policy, and verification coverage

## Test Strategy

Unit tests: component weight calculation, normalization, decay formula, floor enforcement. Property tests: random inputs always produce score in `[0,100]`.

---

## T01: Add Trust Enums, Permissions, and Config Keys

### Objective

Introduce all P39 constants and RBAC/config primitives so backend and UI can share one canonical set of trust enums, permission keys, and config names.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Canonical Enums, Permissions and RBAC, Config Keys sections
- `notes/13-constants-reference.md` — enum and permission registration conventions
- `notes/03-roles-and-permissions.md` — role assignment patterns
- `lib/constants.ts`
- `convex/seed.ts`
- Refer to feature spec sections: Admin Analytics, Bulk Moderation, Notification Triggers, Data Retention, Accessibility, Mobile UI, Error Handling, Cron Schedule for implementation guidance.

### Key Rules

1. Use exact literal values for trust bands, component keys, review dimensions, moderation actions, and reason codes.
2. Add permission keys exactly as defined: `tenant_trust.view`, `tenant_trust.view_any`, `tenant_trust.recalculate`, `tenant_trust.export_eligibility_snapshot`, `reviews.submit`, `reviews.view`, `reviews.view_any`, `reviews.moderate`, `reviews.respond`, `reviews.respond_owner`.
3. Add config keys with exact names/defaults: baseline 20, decay rate 2, decay start 90, floor 15, cooling 48, anomaly z-threshold 2.0, anomaly min sample 5, submission window 30, referral boost 5.
4. Keep all date values in Unix milliseconds and all money fields (if any are introduced) in paise.
5. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `lib/constants.ts` - P39 enums, permissions, config key constants, and threshold mappings
- [ ] `convex/seed.ts` - default `system_config` values for all new P39 keys
- [ ] `notes/13-constants-reference.md` - P39 enum/permission/config documentation updates

### Acceptance Criteria

1. All P39 enum literals in code match the feature spec exactly.
2. Permission keys compile and are consumable through existing RBAC helpers.
3. All P39 config keys are seeded with correct defaults.
4. No legacy or duplicate config key names remain.
5. `npx tsc --noEmit` passes after constants and seed updates.
6. LSP diagnostics are clean on changed files.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `lib/constants.ts`, `convex/seed.ts`, and `notes/13-constants-reference.md`.

### Out of Scope

- Trust computation implementation
- Review lifecycle implementation
- UI rendering

---

## T02: Add Trust Schema Tables and Required Indexes

### Objective

Create all P39 trust persistence tables and indexes needed for current score, component traceability, score history, and immutable eligibility snapshots.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Schema (P39 Tables) section
- `notes/10-convex-schema.md` — table/index style and validator patterns
- `notes/11-convex-architecture.md` — Convex module boundaries and wrapper patterns
- `convex/schema.ts`

### Key Rules

1. Add all required tables: `tenant_trust_scores`, `trust_score_components`, `trust_score_history`, `trust_eligibility_snapshots`.
2. Add required indexes including `trust_score_history.by_tenant_user_id`, `trust_score_history.by_tenant_and_computed_at`, and `trust_score_history.by_computed_at`.
3. Store timestamps as Unix ms (`v.number()`), not strings.
4. Keep scores and points as bounded integer numbers.
5. Do not delete or rename existing pre-P39 tables.

### Deliverables

- [ ] `convex/schema.ts` - all P39 trust tables with validators and indexes
- [ ] `notes/10-convex-schema.md` - P39 schema snippets aligned with implementation

### Acceptance Criteria

1. Schema contains all four trust tables with exact field names and validator intent from the feature spec.
2. All required indexes exist with names matching task contract.
3. `convex` codegen/types compile with no schema errors.
4. Existing schema tables remain backward compatible.
5. `npx tsc --noEmit` passes.
6. LSP diagnostics are clean on changed files.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts` and `notes/10-convex-schema.md`.

### Out of Scope

- Score math implementation
- Event/cron recompute logic
- Reviews schema (handled in P39-E02)

---

## T03: Implement Canonical Score Computation Engine

### Objective

Build deterministic trust scoring utilities that compute component points, apply one-time referral boost, apply decay in the required order, and derive final score band.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Trust Score Model, Signal-to-Component Mapping, Decay Rule sections
- `notes/features/29-post-move-in-lifecycle.md` — rent/maintenance/renewal source signal semantics
- `notes/features/17-referral-system.md` — referral milestone semantics
- `convex/tenantInquiries.ts`
- `convex/visits.ts`
- `convex/rentalTransactions.ts`

### Key Rules

1. Canonical formula is fixed: identity 30, employment 25, rental_history 25, platform_behavior 20.
2. Recompute order is fixed: raw recompute -> apply decay -> clamp to floor -> clamp to `0..100` -> derive band.
3. Baseline score is `20` for no-history tenants and pre-existing backfill rows.
4. Referral boost applies once only (`trust_referral_boost`) and must be tracked.
5. Keep deterministic behavior and avoid non-repeatable random effects in score math.

### Deliverables

- [ ] `convex/tenantTrust.ts` - computation helpers for components, decay, band derivation, and recompute orchestration
- [ ] `convex/tenantTrust.ts` - source signal readers from P34/P37/P22 linked entities
- [ ] `lib/constants.ts` - trust threshold constants consumed by computation module

### Acceptance Criteria

1. Component maxima are enforced exactly (30/25/25/20).
2. Final score is always integer and bounded in `0..100`.
3. Decay starts only after configured inactivity days and never drops below configured floor.
4. Referral boost cannot be applied more than once per tenant.
5. Band derivation matches canonical ranges (`NEW`, `BUILDING`, `TRUSTED`, `PREMIUM`).
6. `npx tsc --noEmit` passes and LSP diagnostics are clean.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/tenantTrust.ts` and any touched helper files.

### Out of Scope

- Review submission logic
- Moderation queue logic
- UI component rendering

---

## T04: Implement Trust Query/Mutation Contracts

### Objective

Expose trust APIs for tenant self-view, owner/admin scoped views, paginated history, recompute triggers, and immutable eligibility snapshot export for P42 issuance flows.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Convex Contracts, Error Contract, Cross-Phase Contracts sections
- `notes/features/34-financial-products-insurance.md` — trust eligibility usage at policy issuance
- `notes/11-convex-architecture.md` — auth helper usage and Convex file organization
- `convex/auth.helpers.ts`
- `convex/functions.ts`

### Key Rules

1. Guard tenant self endpoints with tenant-safe auth (`tenant_trust.view` / `requireTenant` pattern).
2. Guard cross-tenant access with explicit permissions (`tenant_trust.view_any`).
3. Export immutable eligibility snapshots with required fields: `score_at_issue`, `band_at_issue`, `computed_at`, `model_version`.
4. History query must be paginated and ordered for deterministic timeline reads.
5. Emit stable error codes from the P39 error contract.

### Deliverables

- [ ] `convex/tenantTrust.ts` - public/internal queries and mutations (`getMyTrustScore`, `getByTenant`, `getScoreHistory`, `recompute`, `exportEligibilitySnapshot`)
- [ ] `convex/functions.ts` - wrapped mutation/query exports for new trust mutations
- [ ] `lib/constants.ts` - any error code constants used by trust module

### Acceptance Criteria

1. Query and mutation names match feature contract names.
2. History response uses pagination contract (`page`, `isDone`, `continueCursor`).
3. Eligibility snapshot mutation is idempotent for same issuance event and immutable post-creation.
4. Unauthorized cross-tenant trust reads are rejected.
5. Error codes match documented contract strings.
6. `npx tsc --noEmit` passes with clean diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/tenantTrust.ts`, `convex/functions.ts`, and `lib/constants.ts`.

### Out of Scope

- Review backend and moderation
- Review aggregates
- Frontend rendering

---

## T05: Implement Cron Ownership, Backfill Policy, and Verification Coverage

### Objective

Wire scheduled trust recompute/decay jobs, implement one-time backfill baseline behavior for existing tenants, and add verification coverage for deterministic scoring.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Internal + Cron Ownership, Baseline/Backfill sections
- `notes/10-convex-schema.md` — cron patterns
- `convex/crons.ts`
- Existing cron modules (`convex/trustBadges.ts`, `convex/analytics.ts`) for scheduling style

### Key Rules

1. Cron scheduling lives in `convex/crons.ts`; implementation handlers live in `convex/tenantTrust.ts`.
2. Backfill must assign baseline score `20` for existing tenants missing trust rows.
3. Backfilled tenants must be marked `insufficient_data` until at least 3 trusted signals are available.
4. Use cursor-based batch processing for large datasets and self-scheduling continuation.
5. Recompute and decay paths must be idempotent.

### Deliverables

- [ ] `convex/crons.ts` - P39 trust cron entries
- [ ] `convex/tenantTrust.ts` - decay sweep + nightly recompute handlers with cursor continuation
- [ ] `convex/seed.ts` or migration helper - one-time backfill entry point for existing tenants
- [ ] `convex/tenantTrust.test.ts` (or existing test file) - deterministic score/decay/backfill tests

### Acceptance Criteria

1. Cron jobs exist for decay sweep and nightly recompute with clear naming.
2. Backfill creates missing trust rows with baseline score and required defaults.
3. Backfill and cron reruns are safe (no duplicate history corruption).
4. Insufficient-data flag logic is correct for tenants with <3 trusted signals.
5. Test coverage includes decay order, band thresholds, and one-time referral boost behavior.
6. `npx tsc --noEmit` and tests pass.

### Verification

```bash
npx tsc --noEmit
npm run build
npm run test
```

Run `lsp_diagnostics` on all changed trust files and `convex/crons.ts`.

### Out of Scope

- Review submission and moderation lifecycle
- Listing/guard review aggregates
- Trust/review UI routes

---

## Completion Summary

Completion details are recorded when this epic is marked `done`.
