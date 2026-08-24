# Phase 44: OPS Superset Expansion (P44)

## Overview

Expand OPS into a full field-worker persona that can execute guard self-service flows (lead submission, bounty acceptance, visit execution, earnings and quality visibility) while preserving existing guard behavior, preserving backoffice OPS behavior, and keeping rollout fully feature-flagged with canary + rollback safety.

## Dependencies

- P30 Field Ops Platform must be complete (OPS persona + guard profile rails exist)
- P11 Quality & Controls must be complete (quality metrics and rate-limit contracts)
- P32 Incentive v3 must be complete (commission, contribution, and leaderboard rails)
- P04, P06, and P19 must be complete (lead/listing/inquiry visit lifecycles)
- P35 Notification Infrastructure must be complete (event routing parity)

## Key Documentation

| Doc / Code Reference                               | Why It Is Required                                          |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `notes/features/35-ops-superset-expansion.md`      | Authoritative P44 contract, migration matrix, rollout gates |
| `notes/features/20-ops-portal.md`                  | Existing OPS backoffice behavior and permissions            |
| `notes/features/22-incentive-v2.md`                | Baseline quality/streak behavior extended to OPS            |
| `notes/features/27-notification-infrastructure.md` | Event routing parity for OPS-created events                 |
| `notes/04-state-machines.md`                       | Status transition legality for leads/visits/inquiries       |
| `notes/10-convex-schema.md`                        | Schema and validator updates for config + enum changes      |
| `notes/11-convex-architecture.md`                  | Auth helper patterns and Convex module boundaries           |
| `notes/13-constants-reference.md`                  | Config keys, permission strings, enum labels                |
| `convex/auth.helpers.ts`                           | Existing auth helper contracts to extend                    |
| `convex/leads.ts`                                  | Primary field-worker lead submission/edit surfaces          |
| `convex/visits.ts`                                 | Visit execution and assignment guardrails                   |
| `convex/tenantInquiries.ts`                        | Bounty acceptance and field-worker inquiry tracking         |
| `convex/incentives.ts`                             | Suggestion engine, quality, streaks, leaderboard contracts  |
| `convex/guards.ts`                                 | Profile, metrics, and guard-scoped admin query behavior     |
| `src/app/(guard)/`                                 | Existing guard surfaces OPS will use in parity mode         |

## Epics

| ID      | Title                               | Tasks | Status  | Depends On                                    | Priority |
| ------- | ----------------------------------- | ----- | ------- | --------------------------------------------- | -------- |
| P44-E01 | Contract Freeze + Scaffold          | 3     | pending | []                                            | Critical |
| P44-E02 | Schema + Config Plumbing            | 3     | pending | [P44-E01]                                     | Critical |
| P44-E03 | Auth Helper Layer                   | 3     | pending | [P44-E02]                                     | Critical |
| P44-E04 | OPS Profile Backfill + Provisioning | 4     | pending | [P44-E03]                                     | Critical |
| P44-E05 | Field-Worker Endpoint Migration A   | 4     | pending | [P44-E03, P44-E04]                            | Critical |
| P44-E06 | Incentives, Quality, Leaderboards   | 4     | pending | [P44-E05]                                     | High     |
| P44-E07 | OPS Frontend Surfaces               | 4     | pending | [P44-E05]                                     | High     |
| P44-E08 | Admin UX Alignment                  | 3     | pending | [P44-E06, P44-E07]                            | High     |
| P44-E09 | Rollout, Monitoring, Rollback       | 4     | pending | [P44-E04, P44-E05, P44-E06, P44-E07, P44-E08] | Critical |

## Dependency Graph

```text
P44-E01
   |
   v
P44-E02
   |
   v
P44-E03
   |
   v
P44-E04
   |
   v
P44-E05
  /    \
 v      v
E06    E07
  \    /
   v  v
   E08
    |
    v
   E09
```

## Completion Criteria

- [ ] `requireFieldWorker` and `requireFieldWorkerAuth` exist with exact feature-flag + canary semantics
- [ ] Config keys `ops_field_worker_enabled`, `ops_field_worker_canary_user_ids`, and `default_unassigned_society_id` are wired across schema/constants/seed/helpers
- [ ] OPS profile backfill exists, is idempotent, and reports deterministic migration metrics
- [ ] `createOpsInternal` upserts `guard_profiles` for new OPS users
- [ ] All field-worker endpoints in the P44 migration matrix are implemented with `migrate/keep_guard_only/defer` actions as specified
- [ ] Incentive suggestion, quality recompute, streak update, leaderboard position, and payout adjustment include OPS eligibility
- [ ] Leaderboards support persona filter (`GUARD`, `OPS`, `ALL`) with GUARD-safe default behavior on existing guard screens
- [ ] OPS can access ship-now guard routes (`/guard/dashboard`, `/guard/submit-lead`, `/guard/leads`, `/guard/visits`, `/guard/bounties`, `/guard/earnings`, `/guard/profile`)
- [ ] `/guard/shifts` is hidden/denied for OPS and onboarding remains deferred for OPS
- [ ] Admin list/search/detail/leaderboard surfaces support persona filtering and preserve guard-default views
- [ ] Release gate passes (>=95% OPS profile coverage, smoke tests pass, OPS endpoint error rate <1%, leaderboard isolation verified)
- [ ] Rollback playbook is executable via config flip without destructive data operations
- [ ] `npx tsc --noEmit` and `npm run build` pass after implementation

## File Tree

```text
phase-44-ops-superset-expansion/
  README.md
  P44-E01-contract-freeze-scaffold.md
  P44-E02-schema-config-plumbing.md
  P44-E03-auth-helper-layer.md
  P44-E04-ops-profile-backfill.md
  P44-E05-field-worker-migration-a.md
  P44-E06-incentives-quality-leaderboards.md
  P44-E07-ops-frontend-surfaces.md
  P44-E08-admin-ux-alignment.md
  P44-E09-rollout-monitoring-rollback.md
```

## Scope Boundaries

### In Scope

- Field-worker auth helper introduction and migration of selected guard-scoped endpoints
- OPS `guard_profiles` backfill and provisioning forward-fix
- Incentive/quality/leaderboard/payout eligibility expansion to OPS
- Guard-route OPS parity for ship-now pages with explicit exclusions
- Admin filtering and reporting alignment for mixed GUARD/OPS populations
- Canary rollout controls, monitoring, release gates, and rollback runbook

### Out of Scope

- Referral program redesign (guard referral remains GUARD-only)
- Full OPS-specific onboarding redesign
- Fingerprint UX parity for OPS (explicitly deferred)
- Renaming legacy DB fields (`submitted_by_guard_id`, `assigned_guard_id`) in P44
- Any destructive rollback or historical attribution rewrites
