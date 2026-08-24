---
id: P30-E04
title: Incentive Model v2
phase: 30
status: done
depends_on: ["P30-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P30-E04: Incentive Model v2

## Overview

Overhaul incentives from badge-only motivation into a hybrid payout intelligence model: quality score computation (0-100), streak tracking, penalty/bonus suggestion logic, and payout adjustment recommendations that admins can override. The existing `incentive_cards` system remains active and is not removed; v2 layers quality-linked payout guidance on top of the current card lifecycle.

## Prerequisites

- P30-E02 must be complete so checklist-completeness and photo-evidence data is available as score inputs.
- P09 payout lifecycle (`INITIATED -> APPROVED -> PAID`) must remain unchanged; v2 only adds suggested amount computation + admin override support.
- P10 incentive baseline remains in place; do not break `incentive_cards` card issuance/query flows.
- **Codebase facts to verify before starting**:
  - `guard_profiles.quality_score` already exists as optional and must become the current-score source of truth.
  - `convex/incentives.ts` exists and currently handles card logic; v2 extends this module rather than replacing it.
  - `lib/constants.ts` already includes incentive enums/config keys from P10 and must be expanded without breaking existing exports.

## Task Queue

- [x] P30-E04-T01: Quality Score Schema & Constants
- [x] P30-E04-T02: Quality Score Computation Engine
- [x] P30-E04-T03: Streak Tracking System
- [x] P30-E04-T04: Payout Adjustment Engine
- [x] P30-E04-T05: Leaderboard Queries
- [x] P30-E04-T06: Guard Dashboard Enhancements

---

## T01: Quality Score Schema & Constants

### Objective

Add all Incentive v2 persistence primitives and enum/config scaffolding: score history, streak tracking, payout adjustment records, and typed constants for quality tiers, streaks, penalties, and bonuses.

### Required Reading

- `tasks/phase-10-incentive-system/P10-E01-incentive-backend.md` - existing incentive architecture and migration constraints
- `notes/features/08-incentive-system.md` - existing incentive behavior that must coexist with v2
- `notes/features/09-quality-and-controls.md` - quality signal context and guard quality expectations
- `notes/10-convex-schema.md` - schema validator/index conventions
- `notes/13-constants-reference.md` - enum + config key naming conventions
- `notes/11-convex-architecture.md` - audit trigger wrapping and mutation import rules
- `convex/schema.ts` - current schema organization and table ordering patterns
- `lib/constants.ts` - existing incentive constants and system config keys

### Key Rules

1. Add `quality_score_history`, `guard_streaks`, and `payout_adjustments` tables in `convex/schema.ts` with the exact required fields and indexes from the Phase 30 spec.
2. Keep `score` and all component scores as numbers in range `0-100` (stored numerically, never as percentage strings).
3. Add constants/enums in `lib/constants.ts` for `STREAK_TYPE`, `QUALITY_TIER`, `PENALTY_TYPE`, and `BONUS_TYPE` with full exported type inference.
4. Repurpose existing tier threshold system config keys for quality-tier cutoffs (Bronze/Silver/Gold/Platinum) without deleting legacy keys.
5. Add explicit quality-score config keys for component weights and default values: checklist `30`, photo `25`, speed `20`, verification `15`, document `10` (sum must be `100`).
6. Add system config defaults for streak bonus amounts and flat penalties in paise (`20000`, `50000`, `100000`, `200000`, `20000` respectively).
7. Add new tables to `AUDITED_TABLES` in `convex/functions.ts` so all inserts/updates/soft changes are audited.
8. Keep money in paise integers only; do not introduce float storage for any bonus/penalty/multiplier-derived output fields.
9. Do not remove or rename existing `incentive_cards` schema/enum fields in this task.

### Deliverables

- [ ] `convex/schema.ts` - add `quality_score_history`, `guard_streaks`, `payout_adjustments` table validators/indexes
- [ ] `lib/constants.ts` - add `STREAK_TYPE`, `QUALITY_TIER`, `PENALTY_TYPE`, `BONUS_TYPE`, and quality v2 config keys/defaults
- [ ] `convex/seed.ts` - seed/ensure new quality v2 config defaults idempotently
- [ ] `convex/functions.ts` - add new v2 tables to `AUDITED_TABLES`

### Acceptance Criteria

1. All three new tables exist with exact fields and indexes (`by_guard`, `by_guard_and_date`, `by_guard_and_type`, `by_payout` where specified).
2. `lib/constants.ts` exports the four new enum groups with complete value coverage.
3. Quality component weights are configurable and default to `30/25/20/15/10` totaling `100`.
4. Bonus and penalty defaults are stored in paise and seeded idempotently.
5. `AUDITED_TABLES` includes `quality_score_history`, `guard_streaks`, and `payout_adjustments`.
6. Existing `incentive_cards` schema/constants are unchanged and compile.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, `convex/seed.ts`, and `convex/functions.ts`.

### Out of Scope

- Score computation logic
- Trigger wiring from checklist/visit workflows
- Payout amount suggestion or admin override UI

---

## T02: Quality Score Computation Engine

### Objective

Implement the deterministic quality score engine that computes weighted component scores per guard, writes history snapshots, and updates `guard_profiles.quality_score` after qualifying operational events.

### Required Reading

- `tasks/phase-30-field-ops-platform/README.md` - P30 quality scoring scope and component sources
- `notes/features/06-visit-management.md` - assignment/start/complete timeline fields used for turnaround score
- `notes/features/09-quality-and-controls.md` - guard quality interpretation expectations
- `notes/11-convex-architecture.md` - internal mutation orchestration patterns
- `notes/04-state-machines.md` - visit state transition constraints for completion events
- `convex/incentives.ts` - existing incentive module to extend
- `convex/visits.ts` - completion hooks for score recomputation

### Key Rules

1. Add an internal score function in `convex/incentives.ts` that computes all five component scores and weighted final score (`0-100`).
2. Use checklist completeness from `checklist_instances.completeness_score` as the checklist component source.
3. Compute photo-quality component using required-photo presence + GPS/timestamp verification coverage from checklist responses.
4. Compute speed component from assignment/start/completion timing versus SLA threshold from config.
5. Compute verification-accuracy component as approved-checklist ratio over relevant rolling window (approved/total).
6. Compute document-collection component from required document completion rate before due windows.
7. Trigger recompute on checklist approval and visit completion events using `ctx.runMutation(internal.incentives....)` from source domain modules.
8. Persist every recompute to `quality_score_history` with `trigger` reason (`CHECKLIST_APPROVED`, `VISIT_COMPLETED`, `DOCUMENTS_UPDATED`, etc.) and component breakdown.
9. Patch `guard_profiles.quality_score` to latest computed value on every recompute.
10. Clamp final and component scores to `0-100`; do not allow negative scores or >100.
11. Keep implementation type-safe with no `as any`/ignore directives.

### Deliverables

- [ ] `convex/incentives.ts` - add internal quality-score computation/recompute mutations + history writes
- [ ] `lib/quality-score.ts` (if extracted) - pure score math helpers and component normalization functions
- [ ] `convex/visits.ts` - invoke quality recompute hook on visit completion transition
- [ ] `convex/checklists.ts` (or checklist domain module from P30-E02) - invoke recompute hook on checklist approval

### Acceptance Criteria

1. Score engine computes all five components and weighted final score deterministically.
2. Every recompute writes a `quality_score_history` row with component breakdown and trigger.
3. `guard_profiles.quality_score` is updated to the latest computed score.
4. Recompute hooks execute after checklist approval and visit completion events.
5. Score values are clamped to `0-100` and never stored as strings.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/incentives.ts`, `lib/quality-score.ts` (if created), `convex/visits.ts`, and checklist-domain files touched in this task.

### Out of Scope

- Streak lifecycle tracking
- Payout multiplier/bonus/penalty application
- Leaderboard query surfaces

---

## T03: Streak Tracking System

### Objective

Implement active streak lifecycle management (start/extend/break), midnight IST reset handling, and streak bonus issuance hooks tied to qualifying activity.

### Required Reading

- `tasks/phase-30-field-ops-platform/README.md` - streak objectives and phase completion criteria
- `notes/features/08-incentive-system.md` - existing incentive lifecycle and coexistence constraints
- `notes/10-convex-schema.md` - cron and schema conventions
- `notes/13-constants-reference.md` - config/enum naming style
- `convex/crons.ts` - cron registration patterns
- `lib/dates.ts` - date utility conventions (Unix ms storage, formatting helpers)

### Key Rules

1. Track streaks in `guard_streaks` per `guard_user_id + streak_type`, using `last_activity_date` as IST date key (`YYYY-MM-DD`, Asia/Kolkata).
2. Implement streak update logic for all four streak types: `DAILY_ACTIVE`, `WEEKLY_WARRIOR`, `QUALITY_CHAIN`, `PERFECT_10`.
3. `DAILY_ACTIVE` and `WEEKLY_WARRIOR` operate on consecutive IST calendar days with at least one qualifying task (score >= 60).
4. `QUALITY_CHAIN` counts consecutive qualifying tasks with score `>= 85`; `PERFECT_10` counts consecutive tasks with score `== 100`.
5. Add daily cron to validate continuity and deactivate/reset broken streaks after IST midnight rollover.
6. Add helper(s) to compute IST date keys from Unix ms without storing string timestamps outside designated date-key fields.
7. On milestone hit, generate streak bonus suggestion records (in paise) usable by payout-adjustment flow.
8. Prevent duplicate bonus crediting for the same streak milestone window.
9. Keep streak updates idempotent for repeated event delivery/retries.

### Deliverables

- [ ] `convex/incentives.ts` - streak update/break logic and bonus milestone issuance helpers
- [ ] `convex/crons.ts` - daily IST streak-validation cron wiring
- [ ] `lib/dates.ts` - IST date-key helper utilities used by streak logic

### Acceptance Criteria

1. Streak rows are created/updated per guard and streak type with accurate `current_count`, `longest_count`, and `is_active` values.
2. IST day-boundary behavior works correctly for consecutive-day streaks.
3. Task-chain streaks (`QUALITY_CHAIN`, `PERFECT_10`) increment and reset based on score thresholds exactly.
4. Milestone streak bonuses are emitted once per earned milestone.
5. Daily cron can break stale streaks and keep active streaks valid.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/incentives.ts`, `convex/crons.ts`, and `lib/dates.ts`.

### Out of Scope

- Admin payout override UI
- Leaderboard rank computation
- Guard dashboard rendering

---

## T04: Payout Adjustment Engine

### Objective

Integrate quality multiplier + per-task bonuses + penalties + streak bonuses into payout suggestion calculation, persist the full breakdown, and allow admin final override before payout finalization.

### Required Reading

- `tasks/phase-09-payouts/P09-E01-payout-backend.md` - payout lifecycle and backend mutation flow
- `tasks/phase-09-payouts/P09-E02-admin-payout-ui.md` - admin payout UI patterns for actions/detail
- `notes/features/07-closure-and-payouts.md` - payout rules and manual controls
- `notes/features/08-incentive-system.md` - existing incentive cards that must remain separate from amount math
- `notes/04-state-machines.md` - payout transition legality
- `convex/payouts.ts` - current create/approve/disburse logic

### Key Rules

1. Compute suggested payout amount as `base_amount_paise * quality_multiplier + streak_bonus_paise + task_bonuses_paise - penalty_amount_paise`.
2. Map quality score to suggested tier multipliers: Bronze `1.0`, Silver `1.25`, Gold `1.5`, Platinum `2.0`.
3. Apply per-task bonuses as stackable suggested adjustments (100% checklist `+10%`, all GPS photos `+5%`, within SLA `+10%`, all required docs `+15%`).
4. Apply penalties exactly as configured: low completeness, missing photos, false/inaccurate lead forfeiture, no-show flat penalty, consecutive-poor-score review flag.
5. Persist one `payout_adjustments` record per payout computation cycle with full breakdown arrays and computed totals.
6. Admin override is optional and must never bypass lifecycle permissions; final payout amount is `admin_override_paise ?? suggested_total_paise`.
7. Integrate suggestion creation with payout initiation flow without mutating historical finalized payouts retroactively.
8. Keep all math in paise integers with deterministic rounding strategy (`Math.round`) at each percentage-derived step.
9. Preserve existing payout status transitions; adjustment logic enriches amount recommendation only.

### Deliverables

- [ ] `convex/incentives.ts` - payout-adjustment computation helpers and tier/bonus/penalty breakdown generation
- [ ] `convex/payouts.ts` - payout create/update integration for suggested amount + admin override + final amount persistence
- [ ] `src/app/(admin)/admin/payouts/components/payout-detail-panel.tsx` - suggested breakdown UI + override input/action
- [ ] `src/app/(admin)/admin/payouts/components/payout-adjustment-breakdown.tsx` (if extracted) - reusable breakdown renderer

### Acceptance Criteria

1. New payouts receive a deterministic suggested amount and persisted `payout_adjustments` breakdown.
2. Suggested multiplier tier follows current quality score range mapping.
3. Stackable bonuses and penalties are reflected in both numeric totals and human-readable breakdown arrays.
4. Admin can override suggested amount, and final payout amount uses override when provided.
5. Existing payout transitions and permission gates remain intact.
6. `npx tsc --noEmit` passes.
7. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/incentives.ts`, `convex/payouts.ts`, and payout admin UI files touched in this task.

### Out of Scope

- Leaderboard APIs
- Guard dashboard visualizations
- Documentation reconciliation (handled in P30-E05)

---

## T05: Leaderboard Queries

### Objective

Add efficient computed leaderboard queries for daily, weekly, monthly, society, and all-time ranking based on `quality_score * tasks_completed`, with pagination and deterministic sorting.

### Required Reading

- `notes/features/10-analytics.md` - ranking query and dashboard aggregation patterns
- `notes/features/09-quality-and-controls.md` - quality semantics for operator-facing ranking
- `notes/11-convex-architecture.md` - query design and index-first filtering patterns
- `notes/10-convex-schema.md` - index strategy conventions
- `convex/incentives.ts` - quality score/streak data access patterns from earlier tasks

### Key Rules

1. Implement leaderboard queries in `convex/incentives.ts` (or `convex/analytics.ts` only if shared analytics concerns require extraction).
2. Support leaderboard scopes: `DAILY`, `WEEKLY`, `MONTHLY`, `SOCIETY`, `ALL_TIME` with IST windowing for calendar-bounded scopes.
3. Rank by computed score `quality_score * completed_tasks` with deterministic tie-breakers (`quality_score`, then recent activity timestamp).
4. Do not create a dedicated leaderboard table; use computed queries over existing score/task data.
5. Provide paginated query interfaces for admin/ops list views and compact top-N query for guard dashboard positioning.
6. Ensure society-scoped ranking only compares guards mapped to the same society.
7. Return enough metadata for UI (`rank`, `guard_user_id`, `guard_name`, `quality_score`, `tasks_completed`, `composite_score`).
8. Keep query cost bounded: avoid full-table `.collect()` patterns where index/range filters are available.

### Deliverables

- [ ] `convex/incentives.ts` - leaderboard queries for all five scopes with pagination
- [ ] `convex/analytics.ts` (if shared) - optional helper extraction for leaderboard window calculations

### Acceptance Criteria

1. All five leaderboard scopes are queryable and return correctly sorted ranks.
2. Daily/weekly/monthly windows align to IST boundaries.
3. Society leaderboard is restricted to same-society guards.
4. Query responses include rank + score breakdown metadata needed by UI.
5. Pagination works for large guard sets without loading all records.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on leaderboard-related backend files modified in this task.

### Out of Scope

- Dashboard chart UI implementation
- Payout override interactions
- Card-based incentive lifecycle changes

---

## T06: Guard Dashboard Enhancements

### Objective

Enhance guard dashboard with quality v2 visibility: quality score gauge, tier badge, active streaks, leaderboard position, and recent score history while keeping mobile-first interaction patterns.

### Required Reading

- `notes/05-guard-portal-ux.md` - mobile-first layout and card interaction conventions
- `notes/features/08-incentive-system.md` - existing guard incentive visibility and badge patterns
- `notes/features/09-quality-and-controls.md` - quality messaging/guard behavior intent
- `src/app/(guard)/guard/dashboard/page.tsx` - existing dashboard composition
- `src/components/guard/` - current guard component patterns

### Key Rules

1. Keep dashboard route at `/guard/dashboard`; enhance existing page instead of creating a new portal.
2. Add quality summary visuals suitable for mobile: circular gauge/ring, tier label, and trend snapshot.
3. Show active streak cards with current counts and next milestone hints.
4. Show leaderboard position block (daily/weekly/monthly summary) from new leaderboard queries.
5. Show recent score history mini-list/chart sourced from `quality_score_history` (latest N entries).
6. Keep touch targets >= 44x44 and maintain guard portal spacing/typography conventions.
7. Reuse shadcn/ui components and existing status badge styles where possible.
8. Do not expose admin-only payout-adjustment internals on guard dashboard.
9. Keep data fetching reactive via Convex queries; no manual polling loops.

### Deliverables

- [ ] `src/app/(guard)/guard/dashboard/page.tsx` - integrate quality score, tier, streak, leaderboard, and history sections
- [ ] `src/components/guard/quality-score-gauge.tsx` - mobile-friendly score gauge component
- [ ] `src/components/guard/guard-streaks-card.tsx` - active streak summary card/list component
- [ ] `src/components/guard/guard-leaderboard-position.tsx` - compact leaderboard position component
- [ ] `convex/incentives.ts` - guard-facing dashboard query helpers for quality snapshot data

### Acceptance Criteria

1. Guard dashboard displays current quality score, tier, streaks, leaderboard position, and recent history.
2. New dashboard blocks render correctly on mobile widths without layout breakage.
3. Data updates reflect live backend state via Convex subscriptions/queries.
4. Guard view excludes admin-only override and payout-breakdown controls.
5. Existing dashboard stats/actions remain functional.
6. `npx tsc --noEmit` passes.
7. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(guard)/guard/dashboard/page.tsx`, all new `src/components/guard/*` files, and related query files.

### Out of Scope

- Admin payout management UI changes beyond breakdown/override in T04
- OPS portal dashboard requirements
- Phase-wide documentation updates (handled in P30-E05)

---

## Out of Scope (All Tasks)

- Removing or rewriting the existing `incentive_cards` badge lifecycle from P10
- Replacing payout state transitions or introducing new payout terminal states
- Introducing non-IST timezone variants for streak windows in v2
- V2 push notifications, SMS reminders, or gamification social feeds

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
