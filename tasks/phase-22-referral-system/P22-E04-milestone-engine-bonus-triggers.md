---
id: P22-E04
title: Milestone Engine & Bonus Triggers
phase: 22
status: pending
depends_on: ["P22-E02", "P22-E03"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-18
---

# P22-E04: Milestone Engine & Bonus Triggers

## Overview

Implement the referral milestone engine for DemoRentals referral payouts: trigger milestone events on listing publish and closure confirmation, add admin payout lifecycle mutations for milestones, keep parent referral status synchronized from milestone states, and add the algorithmic "AI predictor" query for estimated bonus values.

This epic intentionally excludes SIGN_UP and FIRST_VERIFIED_LEAD milestone triggering because those are already handled in upstream epics (`P22-E03-T02` and `P22-E02-T02`).

## Prerequisites

- **Read first**: [P22-E02 Completion Summary](P22-E02-guard-referral-flow.md#completion-summary) - guard referral lifecycle and `referrals.void` baseline behavior.
- **Read first**: [P22-E03 Completion Summary](P22-E03-demorentals-referral-codes-attribution.md#completion-summary) - referral codes, DemoRentals referral creation, and `referralConfig.getForScope` behavior.
- `P22-E02` and `P22-E03` must both be complete before starting this epic.
- **Codebase facts to verify before starting**:
  - `convex/referralMilestones.ts` exists with base table wiring from earlier epics but does not yet include all trigger/approval/payment/void lifecycle functions specified below.
  - `convex/referrals.ts` exists and includes baseline referral CRUD, including `void`, but does not yet include milestone-driven parent status sync and `getEstimatedBonus`.
  - `convex/listings.ts` `publish` mutation exists and is the required hook point for `LISTING_PUBLISHED` milestone trigger.
  - `convex/closures.ts` `confirm` mutation exists and is the required hook point for `DEAL_CLOSED` milestone trigger.
  - `lib/referral.ts` exposes transition validators (`validateMilestoneTransition`, `validateReferralTransition`) used by this epic.

## Task Queue

- [ ] P22-E04-T01: Milestone Trigger System in `convex/referralMilestones.ts`
- [ ] P22-E04-T02: Milestone Approval, Payment, and Void Mutations
- [ ] P22-E04-T03: Parent Referral Status Lifecycle Synchronization
- [ ] P22-E04-T04: Predicted Bonus Query (Algorithmic "AI Predictor")

---

## T01: Milestone Trigger System in `convex/referralMilestones.ts`

### Objective

Create the core milestone trigger pipeline so referral milestone status transitions occur automatically when qualifying system events happen, with strict idempotency using `source_event` keys.

### Required Reading

- `notes/features/17-referral-system.md` - Flows 2 and 3 (listing publish and deal closure finding-bonus milestones), "Concurrency & Idempotency Rules", and "Business Rules" sections.
- `notes/04-state-machines.md` - Referral milestone transition table (`PENDING -> TRIGGERED -> APPROVED -> PAID` and void paths).
- `notes/10-convex-schema.md` - `referral_milestones` and `referral_config` table definitions.
- `convex/listings.ts` - `publish` mutation structure and post-patch hook location.
- `convex/closures.ts` - `confirm` mutation structure and post-patch hook location.

### Key Rules

1. Implement `trigger` as an **internal mutation** in `convex/referralMilestones.ts`.
2. `trigger` args must include `referral_id`, `milestone_type`, and `source_event` (string idempotency key such as `listing_published:{listing_id}` or `closure_confirmed:{closure_id}`).
3. Enforce idempotency by checking whether the same referral milestone has already progressed beyond `PENDING`; if true, return silently with no duplicate trigger behavior.
4. The trigger lifecycle for this task is `PENDING -> TRIGGERED` only; set `triggered_at = Date.now()` when transition happens.
5. Resolve amounts through referral configuration scope precedence by calling `referralConfig.getForScope` (building > society > global), not hardcoded constants.
6. For `LISTING_PUBLISHED`, calculate milestone amount from `finding_bonus_total * publish_split_pct / 100` (paise integer, rounded safely).
7. For `DEAL_CLOSED`, calculate milestone amount from `finding_bonus_total * closure_split_pct / 100` (paise integer, rounded safely).
8. Do not add or re-implement `SIGN_UP` or `FIRST_VERIFIED_LEAD` trigger logic in this task.
9. Add listing publish hook in `convex/listings.ts` at the end of `publish` mutation after status patch succeeds:
   - Resolve the linked referral via listing context (listing -> associated lead -> guard/referred user mapping from prior epics).
   - Call `referralMilestones.trigger` with `milestone_type = LISTING_PUBLISHED` and deterministic `source_event`.
10. Add closure confirm hook in `convex/closures.ts` at the end of `confirm` mutation after status patch succeeds:
    - Resolve referral via closure linkage (`referrals.by_closure_id`).
    - Call `referralMilestones.trigger` with `milestone_type = DEAL_CLOSED` and deterministic `source_event`.
11. Keep trigger calls best-effort idempotent and safe under repeated invocation (event replay, retried mutation, concurrent admin actions).
12. Preserve existing behavior for non-referral deals (no referral found -> no-op, no throw).

### Deliverables

- [ ] `convex/referralMilestones.ts` - internal `trigger` mutation with idempotency guard, amount calculation via `getForScope`, and `PENDING -> TRIGGERED` transition.
- [ ] `convex/listings.ts` - publish mutation hook that invokes milestone trigger for `LISTING_PUBLISHED`.
- [ ] `convex/closures.ts` - confirm mutation hook that invokes milestone trigger for `DEAL_CLOSED`.

### Acceptance Criteria

1. Calling `trigger` twice with the same referral + milestone + source event cannot create duplicate triggered milestones.
2. Triggered milestones always set `triggered_at` and move status to `TRIGGERED` from `PENDING` only.
3. Milestone amounts for listing/closure events are derived from resolved config split percentages, not fixed constants.
4. `listings.publish` and `closures.confirm` include referral milestone hook calls in successful paths.
5. No SIGN_UP or FIRST_VERIFIED_LEAD trigger logic is duplicated in this epic.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referralMilestones.ts`, `convex/listings.ts`, and `convex/closures.ts`.

### Out of Scope

- Milestone admin approval/payment/void lifecycle mutations (T02)
- Parent referral aggregate status updates (T03)
- Predictor query and analytics confidence model (T04)

---

## T02: Milestone Approval, Payment, and Void Mutations

### Objective

Add admin-controlled lifecycle mutations to move milestones through approval and disbursement states while enforcing the referral milestone state machine.

### Required Reading

- `notes/04-state-machines.md` - referral milestone status transition table and terminal states.
- `notes/features/17-referral-system.md` - "Milestone approval" and "Voiding" business rules.
- `lib/referral.ts` - transition validator contracts (`validateMilestoneTransition`).
- `convex/auth.helpers.ts` - admin permission helper patterns.

### Key Rules

1. Implement `approve` mutation in `convex/referralMilestones.ts` gated by `requirePermission(ctx, PERMISSIONS.REFERRALS_APPROVE_PAYOUT)`.
2. `approve` must enforce `TRIGGERED -> APPROVED` only and persist `approved_by_admin_id` as the acting admin.
3. Implement `markPaid` mutation in `convex/referralMilestones.ts` for admin payout completion.
4. `markPaid` must enforce `APPROVED -> PAID` only and persist both `paid_at` and `payout_method` (`CASH`, `UPI`, `BANK_TRANSFER`).
5. Implement `void` mutation in `convex/referralMilestones.ts` for admin/system invalidation before payment.
6. `void` must allow only non-terminal states (`PENDING`, `TRIGGERED`, `APPROVED`) to transition to `VOIDED`.
7. `void` requires non-empty `voided_reason` and must reject attempts to void `PAID` milestones.
8. All lifecycle mutations must validate transitions through `validateMilestoneTransition()` from `lib/referral.ts`, not local ad-hoc logic.
9. Keep mutation error messages explicit and status-aware for stale-state admin actions.
10. Do not wire external payment systems; this task only records admin payout state transitions.

### Deliverables

- [ ] `convex/referralMilestones.ts` - `approve` mutation (`TRIGGERED -> APPROVED` + `approved_by_admin_id`).
- [ ] `convex/referralMilestones.ts` - `markPaid` mutation (`APPROVED -> PAID` + `paid_at` + `payout_method`).
- [ ] `convex/referralMilestones.ts` - `void` mutation (non-terminal -> `VOIDED`, reason required, `PAID` blocked).

### Acceptance Criteria

1. `approve` rejects milestones not currently in `TRIGGERED`.
2. `markPaid` rejects milestones not currently in `APPROVED`.
3. `void` rejects `PAID` milestones and requires a non-empty reason.
4. All transitions are enforced via `validateMilestoneTransition()`.
5. Permission checks use referral payout admin permission, not generic admin-only auth.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referralMilestones.ts`.

### Out of Scope

- Parent referral status recalculation after milestone changes (T03)
- Referral attribution override UI/workflow (P22-E05)
- Any guard `payouts` table integration (referral payouts remain separate)

---

## T03: Parent Referral Status Lifecycle Synchronization

### Objective

Keep parent referral status consistent with aggregate milestone states and enforce cascading milestone void behavior when a referral is voided.

### Required Reading

- `notes/04-state-machines.md` - referral status transitions (`PENDING`, `QUALIFIED`, `PARTIALLY_PAID`, `FULLY_PAID`, `VOIDED`).
- `notes/features/17-referral-system.md` - parent referral semantics, voiding behavior, and edge cases.
- `lib/referral.ts` - `validateReferralTransition()` validator.
- `convex/referrals.ts` - existing `void` mutation from `P22-E02` to extend with cascade behavior.

### Key Rules

1. Add `updateReferralStatusFromMilestones` as an **internal mutation** callable after every milestone status mutation (`trigger`, `approve`, `markPaid`, `void`).
2. The helper must query all milestones for the referral and derive the parent status deterministically.
3. Derivation logic:
   - If any milestone is `TRIGGERED` or `APPROVED` and referral is `PENDING`, transition referral to `QUALIFIED`.
   - If at least one milestone is `PAID` and not all milestones are `PAID`, transition referral to `PARTIALLY_PAID`.
   - If all milestones are `PAID`, transition referral to `FULLY_PAID`.
4. Validate all referral status transitions through `validateReferralTransition()` from `lib/referral.ts`.
5. Extend `referrals.void` (from E02) so voiding a referral cascades milestone updates:
   - `PENDING`, `TRIGGERED`, and `APPROVED` milestones become `VOIDED`.
   - `PAID` milestones remain `PAID` (terminal; already disbursed).
6. Referral void cascade must be transactional and leave no mixed active + voided pre-payment milestone state.
7. Cascaded milestone voids should include a clear system reason (e.g., referral void reason propagation) for auditability.
8. Ensure parent referral state is not downgraded from terminal states except through valid transitions.
9. Keep this synchronization backend-only; no UI scope in this task.

### Deliverables

- [ ] `convex/referralMilestones.ts` - `updateReferralStatusFromMilestones` internal mutation invoked after each milestone lifecycle mutation.
- [ ] `convex/referrals.ts` - enhanced `void` mutation that cascades non-terminal milestone statuses to `VOIDED` and preserves `PAID` milestones.
- [ ] `lib/referral.ts` integration - transition validator usage wired for all parent referral status changes.

### Acceptance Criteria

1. Milestone updates automatically recompute referral status with no manual admin step.
2. Referral transitions match state machine rules and reject invalid transitions.
3. Voiding a referral voids all non-terminal milestones and leaves paid milestones unchanged.
4. A referral with all milestones paid reaches `FULLY_PAID`.
5. A referral with mixed paid/unpaid milestones reaches `PARTIALLY_PAID`.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referralMilestones.ts`, `convex/referrals.ts`, and `lib/referral.ts`.

### Out of Scope

- Admin referral analytics dashboard UI (P22-E05)
- Attribution override creation of replacement referrals (already defined in E03/E05 boundaries)
- Automated cron reconciliation jobs (not required for milestone lifecycle)

---

## T04: Predicted Bonus Query (Algorithmic "AI Predictor")

### Objective

Implement the referral estimated bonus query used by the listing/deal "AI predictor" widget using historical paid milestone averages with configuration fallback.

### Required Reading

- `notes/features/17-referral-system.md` - "AI Predictor Widget" section and confidence semantics.
- `notes/10-convex-schema.md` - referral milestone and config table fields relevant to amount calculation.
- `convex/referrals.ts` - existing query style and referral data access patterns.
- `convex/referralConfig.ts` - scope precedence resolution via `getForScope` fallback data.

### Key Rules

1. Implement `getEstimatedBonus` query in `convex/referrals.ts` with args `{ building_id, society_id }`.
2. Primary strategy is historical data first, not config first:
   - Calculate average of `PAID` milestone amounts at building level.
   - If insufficient data, fall back to society level average.
   - If still insufficient, fall back to global average.
3. "Insufficient data" means fewer than `3` data points for the active level.
4. If total historical data remains insufficient (`0-2`), fallback to resolved `referral_config` values.
5. Return shape must be exactly:
   - `{ estimated_amount: number, confidence: "HIGH" | "MEDIUM" | "LOW", data_points: number }`
6. Confidence rules:
   - `HIGH`: `10+` data points at building level.
   - `MEDIUM`: `3-9` data points at whichever historical level produced the estimate.
   - `LOW`: config fallback path (`0-2` data points).
7. The predictor is algorithmic average-based; do not introduce ML models, embeddings, or external AI calls.
8. Amount outputs are paise integers and must be consistently rounded.
9. Keep query deterministic and read-only.

### Deliverables

- [ ] `convex/referrals.ts` - `getEstimatedBonus` query using building -> society -> global historical average cascade.
- [ ] `convex/referrals.ts` - config fallback branch when historical sample size is insufficient.
- [ ] Query response contract documented and stable for frontend predictor widget integration.

### Acceptance Criteria

1. Query checks historical paid milestone data before consulting config fallback.
2. Query falls back in exact order: building -> society -> global -> config.
3. Response includes exact keys: `estimated_amount`, `confidence`, `data_points`.
4. Confidence values follow required thresholds and never return values outside `HIGH | MEDIUM | LOW`.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referrals.ts`.

### Out of Scope

- Frontend predictor widget UI implementation (P22-E05)
- Referral analytics dashboards/charts (P22-E05)
- ML model training or probabilistic forecasting systems

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
