---
id: P44-E06
title: Incentives, Quality, Leaderboards
phase: 44
status: done
depends_on: ["P44-E05"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-20
---

# P44-E06: Incentives, Quality, Leaderboards

## Overview

Expand incentive/quality/earnings internals to include OPS users as field workers while maintaining strict leaderboard persona isolation and backward compatibility for guard-first screens.

## Task Queue

- [x] P44-E06-T01: Enable OPS in internal suggestion/quality/streak/payout adjustment engines
- [x] P44-E06-T02: Add persona-filtered leaderboard contracts and OPS rank queries
- [x] P44-E06-T03: Migrate field-worker self-serve incentive and quality queries
- [x] P44-E06-T04: Validate payout/manual-award parity and no-double-dipping behavior

---

## T01: Enable OPS in Internal Suggestion/Quality/Streak/Payout Adjustment Engines

### Objective

Remove hard GUARD-only internal checks for incentive and quality computations where P44 requires OPS parity.

### Required Reading

- `convex/incentives.ts`
- `convex/payouts.ts`
- `notes/features/22-incentive-v2.md`
- `notes/features/35-ops-superset-expansion.md` (Sections 7 and 9)

### Key Rules

1. Migrate matrix rows: `checkAndSuggest`, `updateStreak`, `recomputeQualityScore`, `computePayoutAdjustment`.
2. Preserve idempotency and event-key uniqueness (D78 no double-dipping).
3. Keep existing guard output behavior unchanged.
4. Ensure OPS without profile/history receives safe defaults, not crashes.

### Deliverables

- [x] `convex/incentives.ts` - internal engine eligibility updates for OPS
- [x] `convex/incentives.test.ts` - tests for OPS inclusion across internal mutation paths
- [x] `verification/p44-ops-superset-expansion.md` - incentive/quality engine smoke entries

### Acceptance Criteria

1. Internal incentive suggestion pipeline accepts OPS user ids.
2. Quality recompute and streak updates execute for OPS without guard-only errors.
3. Payout adjustment computes for OPS field-worker payouts.
4. Existing guard computations remain unchanged for identical inputs.
5. Event-key idempotency and no-double-dipping checks still hold.
6. Type-check and build pass.
7. Ledger rows `incentives.checkAndSuggest`, `incentives.updateStreak`, `incentives.recomputeQualityScore`, and `incentives.computePayoutAdjustment` in `migration-ledger.json` map to passing tests.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/incentives.ts` and tests.

### Out of Scope

- Frontend leaderboard UI updates
- Admin filter controls
- Rollout dashboards

---

## T02: Add Persona-Filtered Leaderboard Contracts and OPS Rank Queries

### Objective

Introduce `GUARD|OPS|ALL` leaderboard filter support and migrate rank-position queries to support OPS users.

### Required Reading

- `convex/incentives.ts` (`getLeaderboard`, `getMyLeaderboardPosition`)
- `convex/guards.ts` (`getLeaderboard`)
- `notes/features/35-ops-superset-expansion.md` (Section 9)
- `notes/features/10-analytics.md`

### Key Rules

1. Preserve existing default behavior for guard screens (`GUARD` filter default).
2. Never mix OPS rows into guard-only filtered responses.
3. Include persona identity in leaderboard rows when filter is `ALL`.
4. Keep pagination and rank semantics stable.

### Deliverables

- [x] `convex/incentives.ts` - filter-aware leaderboard query contract and rank position updates
- [x] `convex/guards.ts` - guard leaderboard compatibility updates with persona filtering
- [x] `convex/incentives.test.ts` - isolation tests for `GUARD`, `OPS`, `ALL` filter modes

### Acceptance Criteria

1. `filter=GUARD` returns only guard users.
2. `filter=OPS` returns only ops users.
3. `filter=ALL` returns both with explicit persona metadata.
4. `getMyLeaderboardPosition` works for OPS users and GUARD users.
5. Default calls without filter maintain guard-only compatibility.
6. Build and type-check pass.
7. Ledger row `incentives.getMyLeaderboardPosition` in `migration-ledger.json` is validated with persona-filter expectations.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed leaderboard functions and tests.

### Out of Scope

- Frontend nav and visual parity updates
- Backfill logic
- Admin list/detail filters

---

## T03: Migrate Field-Worker Self-Serve Incentive and Quality Queries

### Objective

Migrate self-serve incentive endpoints currently guarded by `requireGuardAuth` to field-worker auth for OPS parity.

### Required Reading

- `convex/incentives.ts` (`getMyQualitySnapshot`, `getMyStreaks`, `getMyCards`)
- `convex/payouts.ts` (`getGuardEarnings`)
- `notes/features/35-ops-superset-expansion.md` (Sections 7 and 10)

### Key Rules

1. Preserve existing response shape for guard clients.
2. Keep endpoint names for compatibility; avoid breaking generated API references.
3. Ensure OPS users return meaningful empty states if no historical data exists.
4. Maintain permission model: self-serve queries do not require backoffice permissions.

### Deliverables

- [x] `convex/incentives.ts` - migrate self-serve query auth helpers
- [x] `convex/payouts.ts` - migrate `getGuardEarnings` auth to field-worker helper
- [x] `convex/incentives.test.ts` and `convex/payouts.test.ts` - OPS parity + guard regression tests

### Acceptance Criteria

1. OPS users can fetch quality snapshot, streaks, cards, and earnings in enabled/canary modes.
2. Guard users keep identical response contracts and behavior.
3. Disabled non-canary OPS users are blocked with expected error semantics.
4. Empty-history OPS users receive valid zero/empty payloads (no throws).
5. Type-check/build pass and diagnostics are clean.
6. Ledger rows `incentives.getMyQualitySnapshot`, `incentives.getMyStreaks`, `incentives.getMyCards`, and `payouts.getGuardEarnings` in `migration-ledger.json` map to passing tests.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed incentive/payout files and tests.

### Out of Scope

- Admin UI filter controls
- Frontend route/nav changes
- Rollout SLO monitoring

---

## T04: Validate Payout/Manual-Award Parity and No-Double-Dipping Behavior

### Objective

Ensure OPS is eligible for manual awards and payout-adjustment flows without violating D78 single-source earning rules.

### Required Reading

- `convex/incentives.ts` (manual award + adjustment paths)
- `convex/payouts.ts`
- `notes/features/08-incentive-system.md`
- `notes/features/35-ops-superset-expansion.md` (Section 9)

### Key Rules

1. Manual award workflows must accept OPS user ids where guard ids were assumed.
2. Keep all existing admin permission gates unchanged.
3. Enforce event-level idempotency and source exclusivity checks.
4. Ensure adjustment records include enough metadata to audit persona/source decisions.

### Deliverables

- [x] `convex/incentives.ts` - manual award and adjustment persona handling updates
- [x] `convex/payouts.ts` - payout adjustment integration validation for OPS rows
- [x] `convex/incentives.test.ts` - no-double-dipping and OPS manual-award coverage
- [x] `verification/p44-ops-superset-expansion.md` - incentive generation and payout adjustment release checks

### Acceptance Criteria

1. Admin can manually award eligible OPS users using existing flows.
2. Payout adjustments can be computed and persisted for OPS payouts.
3. Duplicate event-credit attempts are blocked by existing idempotency logic.
4. Audit metadata identifies selected earning source for each award/adjustment.
5. Guard behavior remains unchanged and existing tests continue to pass.
6. `npx tsc --noEmit` and build pass.
7. Ledger rows `incentives.computePayoutAdjustment` and `payouts.getGuardEarnings` maintain expected migration action semantics under payout/manual-award flows.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on updated incentive/payout modules and tests.

### Out of Scope

- Frontend leaderboard rendering
- Backoffice list/search filter UI
- Feature-flag rollout operations
