# Feature: OPS Superset Expansion (P44)

> **Priority**: Phase 44
> **Personas**: OPS, Guard, Admin
> **Dependencies**: P04, P06, P11, P19, P22, P30, P32, P35
> **Status**: Spec complete; implementation planned via P44-E01..P44-E09

## 1. Overview

Phase 44 expands OPS from backoffice + field-ops orchestration into full field-worker parity with Guard self-service flows, while preserving guard behavior and all existing backoffice contracts.

P44 is a contract-hardening phase, not a rewrite:

- Keep existing guard routes and APIs stable for Guard users.
- Allow OPS into field-worker flows behind explicit feature flags and canary controls.
- Preserve data continuity by reusing `guard_profiles` and existing payout/incentive rails.

## 2. Critical + High Gap Closure Index

This spec explicitly closes all requested gaps:

| Gap ID                                         | Status | Where Closed                                          |
| ---------------------------------------------- | ------ | ----------------------------------------------------- |
| CR-01 Backend migration inventory incomplete   | Closed | Section 7 (authoritative migration matrix)            |
| CR-02 `requireFieldWorker` contract incomplete | Closed | Section 4                                             |
| CR-03 Feature flag state matrix underspecified | Closed | Section 5                                             |
| CR-04 Backfill not deterministic               | Closed | Section 8                                             |
| CR-05 Incentive/quality for OPS not executable | Closed | Section 9                                             |
| CR-06 Frontend parity not locked               | Closed | Section 10                                            |
| CR-07 No verification gate                     | Closed | Section 13                                            |
| CR-08 No task plan                             | Closed | Section 16 + `tasks/phase-44-ops-superset-expansion/` |
| H-01 Decision ID mapping conflict              | Closed | Section 3                                             |
| H-02 Cross-cutting docs missing P44            | Closed | Section 17                                            |
| H-03 P30 vs P44 dual-mode ambiguity            | Closed | Section 11                                            |
| H-04 Guard-centric ID semantics unclear        | Closed | Section 12                                            |
| H-05 Admin filter behavior unclear             | Closed | Sections 9 and 11                                     |
| H-06 Rollback playbook shallow                 | Closed | Section 15                                            |
| H-07 Referral scope unclear                    | Closed | Section 11                                            |
| H-08 Shift/profile OPS parity unclear          | Closed | Sections 8 and 10                                     |

## 3. Decisions (D72-D74, D78-D80) and Registration Status

P44 introduces decisions D78-D80 (see Decisions section below).
Decisions D72-D74 are in the decisions log. D78-D80 are new P44-specific decisions defined here.

| Decision ID | Decision                | Contract                                                                                                           |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| D72         | Profile model reuse     | Reuse `guard_profiles` for both GUARD and OPS; no `ops_profiles` table                                             |
| D73         | Auth helper layer       | Introduce `requireFieldWorker()` and `requireFieldWorkerAuth()`; keep `requireGuard()` for strict guard-only paths |
| D74         | Rollout gating strategy | Gate OPS field-worker access with global flag + canary user allowlist                                              |
| D78         | No double-dipping       | One operational event maps to one earning source; enforce idempotency keys                                         |
| D79         | Rollout control         | Feature-gated OPS field-worker access with kill switch + canary user allowlist                                     |
| D80         | OPS backfill defaults   | Backfilled OPS profile defaults to `guard_type: SOCIETY_GUARD`, no shift rows                                      |

Design note: Leaderboard segmentation remains required API/UI behavior (`GUARD`, `OPS`, `ALL` filters with GUARD default on legacy screens) but is tracked as implementation contract in Section 9, not a standalone decision ID.

## 4. Auth Helper Contracts (Exact)

### `requireFieldWorker(ctx)`

Contract:

1. Resolve auth identity (same baseline as `requireAuth`).
2. Load user from `users`.
3. Permit `user_type` only in `{GUARD, OPS}`.
4. Reject suspended/banned/inactive users (`status !== ACTIVE`) with field-worker specific error.
5. If `user_type === OPS`, enforce flag gate:
   - `ops_field_worker_enabled` is `true`, OR
   - user id exists in `ops_field_worker_canary_user_ids`.
6. Load `guard_profiles` row by `user_id`.
7. If profile missing, fail deterministicly.

Return type:

```ts
Promise<{
  user: Doc<"users">;
  guardProfile: Doc<"guard_profiles">;
}>;
```

Failure message for role/eligibility mismatch:

- `"Not authorized as field worker"`

### `requireFieldWorkerAuth(ctx)`

Same checks as above except no profile lookup.

Return type:

```ts
Promise<{ user: Doc<"users"> }>;
```

Failure message for role/eligibility mismatch:

- `"Not authorized as field worker"`

## 5. Feature Flag + Canary State Matrix

Two config keys are mandatory:

- `ops_field_worker_enabled`: boolean (`"true" | "false"`)
- `ops_field_worker_canary_user_ids`: JSON array of OPS user IDs

Rollout modes are locked to `P44RolloutState` from `convex/fieldWorkerContracts.ts` (`DISABLED | CANARY | ENABLED`).

| Mode     | `ops_field_worker_enabled` | `ops_field_worker_canary_user_ids` | OPS request to field-worker endpoints              | Guard request to field-worker endpoints |
| -------- | -------------------------- | ---------------------------------- | -------------------------------------------------- | --------------------------------------- |
| DISABLED | `false`                    | empty                              | 403 `"Feature not enabled"`                        | unaffected                              |
| CANARY   | `false`                    | non-empty                          | Allowed only if OPS user id in allowlist, else 403 | unaffected                              |
| ENABLED  | `true`                     | ignored/optional                   | Allowed for all eligible OPS users                 | unaffected                              |

Behavior guarantee:

- Existing OPS-created historical records remain readable in all modes.
- Flag changes are runtime gates only; no destructive data mutation.

## 6. Schema + Config Changes

| Area                             | Current                    | P44 Contract                                                                                        |
| -------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `leads.notes_thread.author_type` | `ADMIN` / `GUARD`          | Add `OPS`                                                                                           |
| `guard_profiles.guard_type`      | no `SOCIETY_GUARD` literal | Add `SOCIETY_GUARD` enum literal and labels                                                         |
| Config key registry              | no field-worker OPS keys   | Add `ops_field_worker_enabled`, `ops_field_worker_canary_user_ids`, `default_unassigned_society_id` |
| Config parsing helpers           | number/string focused      | Add boolean helper and JSON-array helper with validation                                            |
| Seed defaults                    | no P44 flags               | Seed safe defaults: disabled feature, empty canary list, valid default unassigned society id        |

Additional contract requirements:

- OPS users created without society assignment use `default_unassigned_society_id`. This key must be set before P44 rollout.
- `SOCIETY_GUARD` applies to society-assigned OPS users who perform guard-equivalent duties.

## 7. Authoritative Backend Migration Matrix (CR-01)

### Action Legend

Action values are locked to `P44MigrationAction` from `convex/fieldWorkerContracts.ts`.

- `migrate`: change to field-worker-compatible behavior in P44.
- `keep_guard_only`: explicitly remains GUARD-only in P44.
- `defer`: keep current behavior for launch and revisit post-launch.
- `no_migration`: confirmed non-guard-gated path; no P44 auth migration required.

### 7.1 All `requireGuard` / `requireGuardAuth` callsites

| Surface                           | Current gate       | Action  | Owner epic | Verification test                                     |
| --------------------------------- | ------------------ | ------- | ---------- | ----------------------------------------------------- |
| `leads.create`                    | `requireGuard`     | migrate | P44-E05    | `P44-E05-T01-ops-can-create-lead`                     |
| `leads.updateByGuard`             | `requireGuard`     | migrate | P44-E05    | `P44-E05-T01-ops-can-update-own-need-info-lead`       |
| `leads.getMyLeads`                | `requireGuard`     | migrate | P44-E05    | `P44-E05-T01-ops-can-list-own-leads`                  |
| `leads.getMyLeadById`             | `requireGuard`     | migrate | P44-E05    | `P44-E05-T01-ops-can-read-own-lead-by-id`             |
| `leads.getSubmissionCount`        | `requireGuard`     | migrate | P44-E05    | `P44-E05-T01-ops-submission-count-respects-limit`     |
| `tenantInquiries.acceptBounty`    | `requireGuard`     | migrate | P44-E05    | `P44-E05-T02-ops-can-accept-bounty`                   |
| `tenantInquiries.listBounties`    | `requireGuard`     | migrate | P44-E05    | `P44-E05-T02-ops-can-list-available-bounties`         |
| `tenantInquiries.listByGuard`     | `requireGuard`     | migrate | P44-E05    | `P44-E05-T02-ops-can-list-assigned-bounties`          |
| `visits.start`                    | `requireGuard`     | migrate | P44-E05    | `P44-E05-T03-ops-can-start-assigned-visit`            |
| `visits.complete`                 | `requireGuard`     | migrate | P44-E05    | `P44-E05-T03-ops-can-complete-assigned-visit`         |
| `visits.getMyVisits`              | `requireGuard`     | migrate | P44-E05    | `P44-E05-T03-ops-can-list-own-visits`                 |
| `visits.getMyTodayVisits`         | `requireGuard`     | migrate | P44-E05    | `P44-E05-T03-ops-can-list-today-visits`               |
| `buildings.listBySocietyForGuard` | `requireGuard`     | migrate | P44-E05    | `P44-E05-T04-ops-building-picker-society-guardrail`   |
| `users.updateProfile`             | `requireGuard`     | defer   | P44-E07    | `P44-E07-T03-ops-profile-read-only-when-deferred`     |
| `guards.getMyMetrics`             | `requireGuardAuth` | migrate | P44-E05    | `P44-E05-T04-ops-metrics-query`                       |
| `guards.getRemainingLeads`        | `requireGuardAuth` | migrate | P44-E05    | `P44-E05-T04-ops-remaining-leads-query`               |
| `guards.getMyProfile`             | `requireGuardAuth` | migrate | P44-E05    | `P44-E05-T04-ops-profile-query-returns-guard-profile` |
| `guards.recordFingerprint`        | `requireGuardAuth` | defer   | P44-E07    | `P44-E07-T04-fingerprint-hidden-for-ops`              |
| `incentives.getMyQualitySnapshot` | `requireGuardAuth` | migrate | P44-E06    | `P44-E06-T03-ops-quality-snapshot`                    |
| `incentives.getMyStreaks`         | `requireGuardAuth` | migrate | P44-E06    | `P44-E06-T03-ops-streak-query`                        |
| `incentives.getMyCards`           | `requireGuardAuth` | migrate | P44-E06    | `P44-E06-T03-ops-incentive-cards-query`               |
| `payouts.getGuardEarnings`        | `requireGuardAuth` | migrate | P44-E06    | `P44-E06-T04-ops-earnings-query`                      |

### 7.2 Explicit guard-only predicates outside helper calls

| Surface                               | Current predicate                     | Action          | Owner epic | Verification test                                  |
| ------------------------------------- | ------------------------------------- | --------------- | ---------- | -------------------------------------------------- |
| `guardShifts.getMySchedule`           | `user.user_type === GUARD`            | keep_guard_only | P44-E07    | `P44-E07-T02-ops-does-not-see-shifts-surface`      |
| `incentives.getMyLeaderboardPosition` | `requireAuth` + `user_type === GUARD` | migrate         | P44-E06    | `P44-E06-T02-ops-leaderboard-position`             |
| `incentives.checkAndSuggest`          | internal guard check                  | migrate         | P44-E06    | `P44-E06-T01-ops-suggestion-engine-eligible`       |
| `incentives.updateStreak`             | internal guard check                  | migrate         | P44-E06    | `P44-E06-T01-ops-streak-update`                    |
| `incentives.recomputeQualityScore`    | internal guard check                  | migrate         | P44-E06    | `P44-E06-T01-ops-quality-recompute`                |
| `incentives.computePayoutAdjustment`  | internal guard check                  | migrate         | P44-E06    | `P44-E06-T04-ops-payout-adjustment`                |
| `visits.ensureActiveGuardInSociety`   | assigned user must be GUARD           | migrate         | P44-E05    | `P44-E05-T03-assigned-ops-field-worker-validation` |

### 7.3 Guard-scoped admin query predicates requiring persona filters

| Surface                                       | Current behavior              | Action          | Owner epic | Verification test                                    |
| --------------------------------------------- | ----------------------------- | --------------- | ---------- | ---------------------------------------------------- |
| `guards.list`                                 | skips non-GUARD users         | migrate         | P44-E08    | `P44-E08-T01-admin-filter-ops-only`                  |
| `guards.getById`                              | null for non-GUARD            | migrate         | P44-E08    | `P44-E08-T01-admin-can-open-ops-field-worker-detail` |
| `guards.search`                               | filters `user_type === GUARD` | migrate         | P44-E08    | `P44-E08-T01-admin-search-all-personas`              |
| `guards.getLeaderboard`                       | guard-only rows               | migrate         | P44-E08    | `P44-E08-T02-admin-leaderboard-filter`               |
| `analytics.computeSocietyComparison`          | guard count only              | migrate         | P44-E08    | `P44-E08-T03-analytics-guard-vs-ops-counts`          |
| `referrals.recordGuardReferral` and internals | GUARD referral semantics      | keep_guard_only | P44-E08    | `P44-E08-T04-ops-referral-attempt-rejected`          |

### 7.4 Confirmed non-missing matrix rows (Oracle follow-up)

| Surface                       | Current behavior                        | Action          | Owner epic | Verification test                                   |
| ----------------------------- | --------------------------------------- | --------------- | ---------- | --------------------------------------------------- |
| `visits.getGuardAvailability` | `requireGuard`; guard scheduling helper | keep_guard_only | P44-E05    | `P44-E05-T03-guard-availability-remains-guard-only` |
| `analytics.getOverviewKPIs`   | admin query with `requireBackoffice`    | no_migration    | P44-E08    | `P44-E08-T03-overview-kpis-no-guard-gate-confirmed` |

Notes:

- `visits.getGuardAvailability` remains guard-only in P44. OPS scheduling is handled by existing P30 OPS portal surfaces.
- `analytics.getOverviewKPIs` already uses `requireBackoffice`; no P44 change required because it is not a guard-gated function.

## 8. OPS Profile Backfill + Provisioning Contract (CR-04)

Backfill is deterministic and idempotent.

### 8.1 Backfill defaults

- **Society resolution**:
  1. Read OPS user's assigned societies from `ops_assignments`.
  2. If none found, use `default_unassigned_society_id` (`DEFAULT_UNASSIGNED`).
- **Guard type**: `SOCIETY_GUARD`.
- **Shift rows**: none created (OPS does not receive fixed guard shift schedule by default).
- **User status requirement**: only backfill rows for `ACTIVE` OPS users.
- **Skip policy**: if `guard_profiles` row already exists for `user_id`, skip and increment `skipped_existing_profile_count`.

### 8.2 Batch/backfill output contract

Backfill mutation must return:

```ts
{
  scanned_count: number;
  created_count: number;
  skipped_existing_profile_count: number;
  skipped_missing_society_count: number;
  error_count: number;
  next_cursor: string | null;
}
```

### 8.3 Forward-fix requirement

`createOpsInternal` must upsert a `guard_profiles` row at OPS provisioning time. This is mandatory and cannot be delayed until rollout.

## 9. Incentives, Quality, Leaderboards, and Earnings Contract (CR-05)

### 9.1 Inclusion rules

- Suggestion engine: include OPS.
- Quality recompute: include OPS.
- Streak update: include OPS.
- Payout adjustment: include OPS.
- Manual incentive awards: OPS eligible under same rules as GUARD.

### 9.2 Leaderboard API contract

Introduce persona filter on leaderboard APIs:

```ts
import type { FieldWorkerLeaderboardFilter } from "../../convex/fieldWorkerContracts";
```

- Default filter on existing guard-first surfaces: `GUARD`.
- OPS self-service surfaces: `OPS`.
- Admin analytics and audits may use `ALL`.

### 9.3 Data-isolation guarantee

- `filter=GUARD` must never include OPS rows.
- `filter=OPS` must never include GUARD rows.
- `filter=ALL` must include both with explicit `persona` in each row.

## 10. Frontend Parity Contract (CR-06)

OPS launch behavior for existing guard surfaces:

| Route                | P44 decision                                             |
| -------------------- | -------------------------------------------------------- |
| `/guard/dashboard`   | Ship now (OPS allowed)                                   |
| `/guard/submit-lead` | Ship now                                                 |
| `/guard/leads`       | Ship now                                                 |
| `/guard/visits`      | Ship now                                                 |
| `/guard/bounties`    | Ship now                                                 |
| `/guard/earnings`    | Ship now                                                 |
| `/guard/profile`     | Ship now (OPS shows OPS user data + shared profile data) |
| `/guard/shifts`      | Not applicable for OPS (hide nav item, deny route)       |
| `/guard/onboarding`  | Ship later (OPS onboarding differs)                      |
| Guard fingerprint UX | Defer (post-launch evaluation)                           |

UI parity rules:

- Copy should prefer "field worker" in shared surfaces where feasible.
- Guard i18n behavior remains unchanged.
- OPS initial launch can remain English-first.

## 11. Cross-Phase Contracts and Scope Boundaries

### 11.1 P30 ↔ P44 dual-mode reconciliation (H-03)

OPS has two modes simultaneously:

1. **Backoffice mode** (`/admin/*`, `/ops/*`): `requirePermission` / `requireBackoffice`.
2. **Field-worker self-service mode** (`/guard/*`): `requireFieldWorker`.

### 11.2 Cross-phase contracts

1. P30 ↔ P44: dual OPS mode contract above is mandatory.
2. P11/P32 ↔ P44: OPS uses same quality formulas and tier logic; leaderboard segmentation handles fairness.
3. P04/P06/P19 ↔ P44: `submitted_by_guard_id` and `assigned_guard_id` store field-worker user ids (GUARD or OPS).
4. P22 ↔ P44: guard referral program remains GUARD-only in P44 (H-07).
5. P35 ↔ P44: notification routing for OPS-created field-worker events follows same channels as guard events.

### 11.3 Referral scope (H-07)

- `recordGuardReferral` stays GUARD-only.
- OPS may still use non-guard referral products where user_type permits (tenant/owner programs are separate).

## 12. Guard-Centric ID Semantics (H-04)

No schema renames in P44 for compatibility.

Interpretation rules:

- `submitted_by_guard_id`: actor id of submitting field worker (GUARD or OPS).
- `assigned_guard_id`: actor id of assigned field worker (GUARD or OPS).
- Response payloads requiring persona context must include explicit actor `user_type`.

Admin and analytics surfaces must never infer persona from field names alone.

## 13. Verification Gate (CR-07)

Release cannot proceed unless all checks pass:

1. Backfill completion: `>= 95%` of ACTIVE OPS users have `guard_profiles`.
2. Smoke tests pass:
   - OPS can submit lead.
   - OPS can accept bounty.
   - OPS can complete visit.
3. OPS field-worker endpoint error rate `< 1%` during canary window.
4. OPS users receive incentive cards from suggestion engine under valid triggers.
5. Leaderboard isolation:
   - GUARD filter excludes OPS.
   - OPS filter excludes GUARD.

### Production Rollout Runbook

**Pre-flight (Day -7):**

1. All P44 epics E01-E09 merged to main
2. `npx tsc --noEmit` passes
3. `npm run build` passes
4. All E01 contract-freeze tests green
5. Staging environment verified with full smoke test

**Canary Enablement (Day 0):**

1. Set `ops_field_worker_enabled` = false (global OFF)
2. Deploy all P44 code to production
3. Verify zero runtime errors for 2 hours (existing guard/ops flows unaffected)
4. Add 2-3 OPS users to `ops_field_worker_canary_user_ids` list
5. Validate auth-helper precedence: canary list is checked first, then global flag, so canary users can operate with global OFF
6. Canary OPS users test: lead submission, visit execution, earnings view, bounty board
7. Monitor for 48 hours: error rates, latency, audit logs

**Canary Validation (Day 2):**

1. Check: zero errors from canary users in audit logs
2. Check: canary OPS lead submissions appear correctly in admin queue
3. Check: canary OPS visits schedule and execute correctly
4. Check: incentive/quality scores compute for canary OPS users
5. Check: leaderboard shows canary OPS in OPS-only view
6. If ANY check fails -> execute Rollback Playbook

**Gradual Rollout (Day 3-7):**

1. Add 50% of OPS users to canary list
2. Monitor 24 hours
3. Add remaining OPS users
4. Monitor 24 hours
5. Remove canary list (all OPS users now use field-worker path)

**Full Enablement (Day 7+):**

1. Set `ops_field_worker_enabled` = true (global ON)
2. Clear `ops_field_worker_canary_user_ids` (set to empty list)
3. Verify admin dual-persona views show correct data
4. Announce to OPS team
5. Monitor for 7 days post-full-enablement

**Post-Enable Validation (Day 14):**

1. Run data integrity check: all OPS users have `guard_profiles` rows
2. Verify leaderboard GUARD|OPS|ALL filters return correct populations
3. Verify incentive cards awarded to OPS users correctly
4. Archive canary config keys
5. Update AGENTS.md Phase 44 status to COMPLETE

## 15. Rollback Playbook (H-06)

Primary rollback is config-driven; no destructive rollback.

### Step-by-step

1. Set `ops_field_worker_enabled=false`.
2. Clear `ops_field_worker_canary_user_ids` to `[]`.
3. Verify OPS calls to field-worker endpoints return 403 `"Feature not enabled"`.
4. Verify Guard flows stay healthy (`/guard/submit-lead`, `/guard/visits`, `/guard/bounties`).
5. Keep all backfilled `guard_profiles` rows and historical records intact.
6. Preserve attribution records and audit logs; do not rewrite actor ids.
7. Re-open canary only after root cause is fixed and regression tests pass.

## 16. P44 Epic Plan (CR-08)

| Epic    | Title                               | Depends On             | Complexity |
| ------- | ----------------------------------- | ---------------------- | ---------- |
| P44-E01 | Contract Freeze + Scaffold          | P30, P11, P32 complete | Short      |
| P44-E02 | Schema + Config Plumbing            | P44-E01                | Short      |
| P44-E03 | Auth Helper Layer                   | P44-E02                | Short      |
| P44-E04 | OPS Profile Backfill + Provisioning | P44-E03                | Medium     |
| P44-E05 | Field-Worker Endpoint Migration A   | P44-E03, P44-E04       | Medium     |
| P44-E06 | Incentives, Quality, Leaderboards   | P44-E05                | Large      |
| P44-E07 | OPS Frontend Surfaces               | P44-E05                | Large      |
| P44-E08 | Admin UX Alignment                  | P44-E06, P44-E07       | Medium     |
| P44-E09 | Rollout, Monitoring, Rollback       | P44-E04..P44-E08       | Medium     |

Detailed execution specs live in:

- `tasks/phase-44-ops-superset-expansion/README.md`
- `tasks/phase-44-ops-superset-expansion/P44-E01-contract-freeze-scaffold.md`
- `tasks/phase-44-ops-superset-expansion/P44-E02-schema-config-plumbing.md`
- `tasks/phase-44-ops-superset-expansion/P44-E03-auth-helper-layer.md`
- `tasks/phase-44-ops-superset-expansion/P44-E04-ops-profile-backfill.md`
- `tasks/phase-44-ops-superset-expansion/P44-E05-field-worker-migration-a.md`
- `tasks/phase-44-ops-superset-expansion/P44-E06-incentives-quality-leaderboards.md`
- `tasks/phase-44-ops-superset-expansion/P44-E07-ops-frontend-surfaces.md`
- `tasks/phase-44-ops-superset-expansion/P44-E08-admin-ux-alignment.md`
- `tasks/phase-44-ops-superset-expansion/P44-E09-rollout-monitoring-rollback.md`

## 17. Cross-Cutting Documentation Status (H-02)

Cross-cutting docs have been updated with P44 content (schema, constants, roles, architecture, decisions).

Updated cross-cutting references:

- `notes/12-decisions-log.md`
- `notes/04-state-machines.md`
- `notes/13-constants-reference.md`
- `notes/features/03-lead-pipeline.md`
- `notes/features/06-visit-management.md`
- `notes/features/17-referral-system.md`

## Related Documents

- `notes/features/20-ops-portal.md` — existing OPS persona and backoffice model.
- `convex/auth.helpers.ts` — current helper baseline for `requireGuard`, `requireOps`, `requireBackoffice`.
- `notes/features/22-incentive-v2.md` — quality/streak rails that P44 extends to OPS.
- `notes/features/27-notification-infrastructure.md` — notification routing constraints reused by P44.
- `notes/features/36-multi-persona-identity.md` — P45 generalizes P44's field-worker pattern to all personas. P44-E09 is a hard prerequisite for P45.
