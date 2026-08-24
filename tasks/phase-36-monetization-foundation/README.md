# Phase 36: Monetization Foundation (P36)

## Overview

Create core monetization rails for fee calculation, paid discovery products, promoted inventory, and revenue visibility across admin and public pricing surfaces.

## Dependencies

- P06 Listings should be done (promoted listing campaigns attach to published listings)
- P08 Closure should be done (transaction fee calculation is finalized on closure context)
- P09 Payouts should be done (revenue ledger mirrors payout cost without mutating payout lifecycle)
- P22 Referral System should be done (referral payout costs are mirrored into revenue ledger)

## Cross-Phase Contracts (Must Be Implemented in P36)

- **P36 x P09**: `payouts` remains the source of truth for guard payout lifecycle. `revenue_line_items` may mirror payout cost but must not replace payout workflow.
- **P36 x P22**: referral milestones remain in `referral_milestones`; paid milestones create negative cost entries in `revenue_line_items`.
- **P36 x P32**: commission engine (incentive payouts) is independent from customer-facing monetization fee computation.
- **P36 x P34**: optional integration only. P36 works without P34; when P34 exists, transaction completion/payment evidence reconciles `fee_collection_status` to `PAID`.

## Function Coverage Matrix (Feature Spec -> Epic)

| Function                                       | Epic      |
| ---------------------------------------------- | --------- |
| `transactionFees.getActiveSchedule`            | `P36-E01` |
| `transactionFees.upsertSchedule`               | `P36-E01` |
| `internal.monetization.computeClosureFee`      | `P36-E01` |
| `internal.monetization.recordRevenueLineItems` | `P36-E01` |
| `tenantPasses.getMyActivePass`                 | `P36-E02` |
| `tenantPasses.purchase`                        | `P36-E02` |
| `tenantPasses.applyCredit`                     | `P36-E02` |
| `serviceBundles.listByDeal`                    | `P36-E02` |
| `serviceBundles.createOrder`                   | `P36-E02` |
| `serviceBundles.markCompleted`                 | `P36-E02` |
| `promotedListings.createCampaign`              | `P36-E03` |
| `promotedListings.expireCampaign`              | `P36-E03` |
| `promotedListings.listActiveForSearch`         | `P36-E03` |
| `internal.monetization.expireStalePromotions`  | `P36-E03` |
| `monetization.getRevenueDashboard`             | `P36-E04` |
| `actions.payments.capturePassPayment`          | `P36-E02` |
| `actions.payments.capturePromotionPayment`     | `P36-E03` |
| `actions.partners.notifyServiceAssignment`     | `P36-E02` |

## File Ownership (Epic Boundaries)

| File                         | Primary Ownership | Allowed Secondary Edits         | Boundary Rule                                                                                                       |
| ---------------------------- | ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `convex/monetization.ts`     | `P36-E01`         | `P36-E02`, `P36-E03`, `P36-E04` | E01 creates file + fee core; later epics append scoped functions only (pass/service, promotion, dashboard queries). |
| `convex/actions/payments.ts` | `P36-E02`         | `P36-E03`                       | E02 owns Razorpay pass capture path and shared payment utilities; E03 adds promotion capture path in same module.   |
| `convex/transactionFees.ts`  | `P36-E01`         | `P36-E04`                       | E01 owns slab/custom-quote CRUD; E04 may add read-only pricing payload query.                                       |
| `convex/tenantPasses.ts`     | `P36-E02`         | `P36-E01`                       | E02 owns pass lifecycle + apply credit; E01 can only consume helper reads.                                          |
| `convex/serviceBundles.ts`   | `P36-E02`         | none                            | E02 owns bundle lifecycle and partner commission write path.                                                        |
| `convex/promotedListings.ts` | `P36-E03`         | `P36-E04`                       | E03 owns campaign lifecycle and browse merge; E04 may consume read models only.                                     |
| `convex/http.ts`             | `P36-E02`         | `P36-E03`                       | E02 creates webhook route; E03 extends handler branches (promotion events) without redefining route contract.       |

Ownership protocol:

- Primary epic creates file contract and baseline exports.
- Secondary epics add only their scoped functions; no contract-breaking rewrites.
- If a change requires contract rewrite, update the owner epic spec first.

## Mandatory Verification Standard for All P36 Epics

Each task in each epic must include:

1. `Required Reading`
2. `Key Rules`
3. `Deliverables` with exact file paths
4. `Acceptance Criteria` with at least 5 testable checks
5. `Verification` commands including `npx tsc --noEmit` and `npm run build`

## Key Documentation

- `notes/features/11-tenant-browse.md`
- `notes/features/14-owner-services.md`
- `notes/features/20-deal-economics.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`

## Epics

| ID      | Title                              | Tasks | Status  | Depends On                  | Priority |
| ------- | ---------------------------------- | ----- | ------- | --------------------------- | -------- |
| P36-E01 | Fee Schema & Calculation           | 3     | pending | []                          | Critical |
| P36-E02 | Discovery Pass & Service Bundles   | 4     | pending | [P36-E01]                   | High     |
| P36-E03 | Promoted Listings                  | 3     | pending | [P36-E01]                   | High     |
| P36-E04 | Revenue Dashboard & Public Pricing | 3     | pending | [P36-E01, P36-E02, P36-E03] | High     |

## Dependency Graph

- `P36-E01 -> P36-E02`
- `P36-E01 -> P36-E03`
- `P36-E01 + P36-E02 + P36-E03 -> P36-E04`

## Completion Criteria

- [ ] Fee schema and rent-band slab configuration are persisted and configurable
- [ ] Fee computation API returns deterministic fee breakdown for transaction context
- [ ] Discovery passes and service bundles support purchase and credit-at-closure logic
- [ ] Promoted listing slots are managed with duration and cap constraints
- [ ] Admin revenue dashboard shows collected vs expected fees and product-level breakdown
- [ ] Public pricing page reflects active monetization plans and terms

## File Tree

```text
phase-36-monetization-foundation/
  README.md
  P36-E01-fee-schema-calculation.md
  P36-E02-discovery-pass-service-bundles.md
  P36-E03-promoted-listings.md
  P36-E04-revenue-dashboard-public-pricing.md
```

## Scope Boundaries

- In scope: pricing rails, fee calculations, monetization products, admin/public pricing visibility
- Out of scope: payment gateway settlement automation, dynamic surge pricing, coupon engine
