# Phase 39: Tenant Trust Score & Reviews (P39)

## Overview

Build the canonical tenant trust system and interaction-verified review pipeline used across tenant profile, listing detail, owner workflows, moderation operations, and downstream financial eligibility. Phase 39 ships score computation, review lifecycle + moderation, and all UI surfaces needed to operate the system safely.

## Dependencies

Depends on: Hard: P34 (transaction data for rental_history). Soft: P37 (resident behavior signals for platform_behavior), P22 (referral data), P33 (trust badge display patterns).

### Hard Dependencies (must be complete before implementation)

- P34 Transaction Completion Rails (transaction anchors + KYC rails)

### Soft Dependencies / Consumers

- P37 Post-Move-In Lifecycle (behavior signals for `platform_behavior`)
- P22 Referral System (one-time trust referral boost signal)
- P33 Trust & Verification Display (consumes trust badge view model)
- P38 Premium Portal Infrastructure + Owner Portal (consumes owner review/response contracts)
- P42 Financial Products & Insurance (consumes immutable trust eligibility snapshots)

## Key Documentation

| Doc                                                 | Why It Is Required                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `notes/features/31-tenant-trust-score-reviews.md`   | Canonical formula, enums, schema, lifecycle, permissions, config keys             |
| `notes/features/25-trust-verification-display.md`   | Trust badge consumption and display contract alignment                            |
| `notes/features/29-post-move-in-lifecycle.md`       | Behavior signal sources (`rent_records`, `maintenance_tickets`, `lease_renewals`) |
| `notes/features/30-owner-portal-dashboard.md`       | Owner-facing moderation/response consumption contracts                            |
| `notes/features/34-financial-products-insurance.md` | P39 -> P42 eligibility snapshot contract requirements                             |
| `notes/features/17-referral-system.md`              | Referral boost signal source and milestone semantics                              |
| `notes/04-state-machines.md`                        | State machine design conventions and transition validation rules                  |
| `notes/10-convex-schema.md`                         | Table/index validator conventions                                                 |
| `notes/13-constants-reference.md`                   | Permission and enum registration conventions                                      |

## Epics

| ID      | Title                            | Tasks | Status  | Depends On         | Priority |
| ------- | -------------------------------- | ----- | ------- | ------------------ | -------- |
| P39-E01 | Trust Score Schema & Computation | 5     | pending | []                 | Critical |
| P39-E02 | Review System Backend            | 5     | pending | [P39-E01]          | Critical |
| P39-E03 | Trust Score & Review UI          | 5     | pending | [P39-E01, P39-E02] | High     |

## Dependency Graph

```text
P39-E01 -> P39-E02 -> P39-E03
      \______________________^
```

## Completion Criteria

- [ ] Trust model uses canonical four-component formula: identity 30, employment 25, rental_history 25, platform_behavior 20, score max 100
- [ ] `tenant_trust_scores`, `trust_score_components`, `trust_score_history`, and `trust_eligibility_snapshots` contracts are implemented with required indexes
- [ ] Review backend enforces canonical review mapping (4 types), interaction typing (`VISIT`, `TENANCY`, `TRANSACTION`), cooling/edit policy, moderation transitions, anti-gaming, and anomaly rules
- [ ] Permission keys and config keys are implemented exactly as defined in the feature spec
- [ ] Materialized listing/guard aggregates refresh on publish/moderation transitions with 1-decimal rounding
- [ ] Routes are owned and implemented: `/tenant/profile`, `/listing/[slug]`, `/admin/reviews`
- [ ] Moderation queue supports required filters, sort options, and paginated results
- [ ] Backfill policy applies baseline score `20` for pre-existing tenants with insufficient-data handling until 3+ signals
- [ ] P39 -> P42 immutable eligibility snapshot export contract is implemented with score, band, computed_at, and model_version

## File Tree

```text
phase-39-tenant-trust-score-reviews/
  README.md
  P39-E01-trust-score-schema-computation.md
  P39-E02-review-system-backend.md
  P39-E03-trust-score-review-ui.md
```

## Scope Boundaries

### In Scope

- Canonical trust score computation + history + eligibility snapshot export
- Multi-type review submission with eligibility gates and cooling lifecycle
- Moderation workflow with explicit action-to-status transitions
- Materialized review aggregates for listing and guard surfaces
- Tenant/owner/admin UI surfaces for trust and reviews

### Out of Scope

- Formal review dispute/arbitration workflows
- AI sentiment auto-moderation decisions
- External credit bureau pulls for trust scoring
- Public anonymous reviews
