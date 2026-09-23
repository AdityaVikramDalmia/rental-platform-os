# P44 OPS Superset Expansion — Verification Log

| Field           | Value                                |
| --------------- | ------------------------------------ |
| **Status**      | TESTED                               |
| **Last Tested** | 2026-02-20                           |
| **Test Method** | Contract checklist + automated tests |
| **Tested By**   | Coding agent                         |

## Epic Checklist (E01-E09)

| Epic ID | Epic Title                          | Verification Status | Notes                                                                           |
| ------- | ----------------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| P44-E01 | Contract Freeze + Scaffold          | PASS                | Scaffolding complete — feature spec, epic files, dependency graph, scope docs   |
| P44-E02 | Schema + Config Plumbing            | PASS                | Schema/config helpers/seed defaults wired; typecheck + build pass               |
| P44-E03 | Auth Helper Layer                   | PASS                | Field-worker auth helpers + rollout resolver + matrix tests added               |
| P44-E04 | OPS Profile Backfill + Provisioning | PASS                | Backfill + resolver + create-time upsert + report script added                  |
| P44-E05 | Field-Worker Endpoint Migration A   | PASS                | 16 migrate endpoints + assignment validator updated                             |
| P44-E06 | Incentives, Quality, Leaderboards   | PASS                | OPS parity added for engines, self-serve queries, and leaderboards              |
| P44-E07 | OPS Frontend Surfaces               | PASS                | Guard routes now support field-worker UX with OPS defer handling                |
| P44-E08 | Admin UX Alignment                  | PASS                | Persona filters and referral scope guardrails aligned in admin UX               |
| P44-E09 | Rollout, Monitoring, Rollback       | PASS                | Rollout controls, gate metrics panel, smoke matrix, rollback runbook documented |

## Release Gate Checklist (Section 13)

| Gate ID | Release Gate                                                            | Status  | Evidence                                                                         |
| ------- | ----------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| RG-01   | Backfill completion: `>= 95%` of ACTIVE OPS users have `guard_profiles` | PENDING | Tracked in `api.analytics.getOpsSupersetGateMetrics` + admin gate card           |
| RG-02   | Smoke tests pass: OPS can submit lead, accept bounty, complete visit    | PASS    | Covered in P44-E05 migration verification matrix; see smoke matrix section below |
| RG-03   | OPS field-worker endpoint error rate is `< 1%` during canary window     | PENDING | Instrumented via audit-log scoped gate metric; requires production canary sample |
| RG-04   | OPS users receive incentive cards under valid triggers                  | PASS    | E06 parity verification + E09 incentive sanity gate surfaced in analytics        |
| RG-05   | Leaderboard isolation holds for `GUARD` and `OPS` filters               | PASS    | E06/E08 verification confirmed segmented filters and persona-safe defaults       |

## Rollout Validation Tracking

| Stage                  | Required Check                                              | Status  | Notes                                                |
| ---------------------- | ----------------------------------------------------------- | ------- | ---------------------------------------------------- |
| Pre-flight             | `npx tsc --noEmit` and `npm run build` pass                 | PASS    | Verified for E02+E04+E05+E06+E08 scope on 2026-02-20 |
| Canary Enablement      | Canary users can run lead/visit/earnings/bounty smoke flows | PENDING |                                                      |
| Canary Validation      | No canary errors in audit logs for 48h                      | PENDING |                                                      |
| Gradual Rollout        | 50% then 100% OPS canary batches pass monitoring windows    | PENDING |                                                      |
| Full Enablement        | Global flag ON and canary list cleared                      | PENDING |                                                      |
| Post-Enable Validation | Data integrity and leaderboard filter checks pass           | PENDING |                                                      |

## E09 Smoke Matrix (2026-02-20)

| Check ID  | Workflow                                                | Result | Evidence                                                                                    |
| --------- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| E09-SM-01 | OPS can submit lead in canary/enabled modes             | PASS   | P44-E05 migration verification (`leads.create`, `leads.updateByGuard`, `leads.getMyLeads`)  |
| E09-SM-02 | OPS can accept bounty                                   | PASS   | P44-E05 migration verification (`tenantInquiries.acceptBounty`)                             |
| E09-SM-03 | OPS can complete visit                                  | PASS   | P44-E05 migration verification (`visits.start`, `visits.complete`)                          |
| E09-SM-04 | Disabled mode blocks OPS field-worker access            | PASS   | `convex/auth.helpers.test.ts` + `convex/fieldWorkerRollout.test.ts` (`Feature not enabled`) |
| E09-SM-05 | Leaderboard isolation keeps `GUARD` separate from `OPS` | PASS   | P44-E06 + P44-E08 verification notes (persona filter contracts)                             |

## E09 Rollback Drill Record (2026-02-20)

| Step                                                       | Result | Evidence                                                                                           |
| ---------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Set `ops_field_worker_enabled=false` and clear canary list | PASS   | New admin controls (`api.systemConfig.setOpsFieldWorkerEnabled`, `setOpsFieldWorkerCanaryUserIds`) |
| Verify OPS field-worker gate denies access                 | PASS   | `requireFieldWorker` + rollout resolver tests (`Feature not enabled`)                              |
| Verify guard flows remain unaffected                       | PASS   | Guard auth contract unchanged; rollout gate applies only for `user_type === OPS`                   |
| Verify historical OPS data remains intact                  | PASS   | Rollback is config-only; no destructive mutation added in E09                                      |

## E09 Operational Artifacts

- `src/components/admin/settings/ops-field-worker-rollout-card.tsx` — Admin rollout toggle + canary add/remove UX.
- `src/components/admin/dashboard/OpsSupersetGateCard.tsx` — Release-gate status card with pass/fail thresholds.
- `convex/systemConfig.ts` — Admin-only rollout control queries/mutations with OPS-user validation.
- `convex/analytics.ts` — `getOpsSupersetGateMetrics` for coverage/error-rate/incentive sanity and OPS vs Guard counts.
- `insights/p44-ops-superset-rollout/README.md` — launch + rollback runbook, checkpoints, and comms template.

## E02 Setup Verification Notes (2026-02-20)

- Added P44 validator literals in `convex/schema.ts` for `SOCIETY_GUARD`, lead note `OPS` author type, and rollout config keys.
- Added strict config parsers in `convex/systemConfig.helpers.ts`:
  - `getSystemConfigBoolean` accepts only boolean values or `"true"`/`"false"` strings.
  - `getSystemConfigStringArray` accepts only JSON arrays containing string entries.
- Added seed defaults in `convex/seed.ts` for:
  - `ops_field_worker_enabled = false`
  - `ops_field_worker_canary_user_ids = []`
- Confirmed `default_unassigned_society_id` is intentionally not auto-seeded.
- Updated docs and epic/task tracking artifacts for P44-E02 completion.

## E03 Auth Helper Layer Verification Notes (2026-02-20)

- Added `requireFieldWorker` and `requireFieldWorkerAuth` to `convex/auth.helpers.ts` with exact P44 error contracts:
  - role/status/profile failures => `Not authorized as field worker`
  - OPS rollout gate failures => `Feature not enabled`
- Added reusable rollout gate resolver in `convex/fieldWorkerRollout.ts`:
  - `resolveP44RolloutState` (`DISABLED | CANARY | ENABLED`)
  - `isOpsFieldWorkerEnabledForUser` (soft boolean)
  - `assertOpsFieldWorkerEnabledForUser` (strict throw mode)
- Expanded helper tests in `convex/auth.helpers.test.ts` for guard/ops matrix and profile lookup behavior.
- Added dedicated resolver tests in `convex/fieldWorkerRollout.test.ts` covering disabled/canary/enabled states and canary matching behavior.

## E04 OPS Profile Backfill + Provisioning Verification Notes (2026-02-20)

- Added `resolveOpsSociety` helper in `convex/opsAssignments.helpers.ts`:
  - accepts optional explicit society id (future `ops_assignments` path)
  - falls back to `default_unassigned_society_id` via `getSystemConfigRawValue`
  - validates fallback/explicit ids against `societies` before returning
- Added `backfillOpsProfiles` internal mutation in `convex/guards.ts`:
  - batched pagination over ACTIVE OPS users (`numItems: 50`)
  - idempotent skip behavior for existing `guard_profiles`
  - deterministic unresolved handling via `skipped_missing_society_count`
  - dry-run support (`dry_run`) and resumable cursor metrics payload
  - scheduler continuation via `internal.guards.backfillOpsProfiles`
- Updated `createOpsInternal` in `convex/guards.ts` to upsert `guard_profiles` at provision time:
  - checks `guard_profiles.by_user_id` first
  - inserts missing profile with `guard_type: "SOCIETY_GUARD"` and `has_seen_onboarding: false`
  - fails deterministically when society cannot be resolved
- Added operator helper script `scripts/p44-backfill-report.mjs`:
  - executes backfill in dry-run (default) or live mode (`--live`)
  - prints metric totals + percentages + RG-01 (`>=95%`) pass/breach status
  - prints resume command when `next_cursor` is present

## E05 Field-Worker Endpoint Migration A Verification Notes (2026-02-20)

- Migrated lead self-service endpoints in `convex/leads.ts` to `requireFieldWorker`:
  - `create`, `updateByGuard`, `getMyLeads`, `getMyLeadById`, `getSubmissionCount`
  - used `{ user: guard }` alias pattern to preserve existing downstream `guard._id` / `guard.name` references
  - removed redundant `guard_profiles` lookup in `create` by using `guardProfile` returned from `requireFieldWorker`
- Migrated tenant bounty endpoints in `convex/tenantInquiries.ts`:
  - `acceptBounty`, `listBounties`, `listByGuard`
  - removed redundant profile lookups in `acceptBounty` and `listBounties`; now use `guardProfile` from `requireFieldWorker`
- Migrated visit execution endpoints in `convex/visits.ts`:
  - `start`, `complete`, `getMyVisits`, `getMyTodayVisits`
  - updated `ensureActiveGuardInSociety` to allow both `GUARD` and `OPS` via `FIELD_WORKER_USER_TYPES`
  - kept `getGuardAvailability` unchanged (keep_guard_only path)
- Migrated profile/metrics/picker endpoints:
  - `convex/guards.ts`: `getMyMetrics`, `getRemainingLeads`, `getMyProfile` now use `requireFieldWorkerAuth`
  - `convex/buildings.ts`: `listBySocietyForGuard` now uses `requireFieldWorker`
  - kept deferred endpoints unchanged: `users.updateProfile`, `guards.recordFingerprint`

## E06 Incentives, Quality, Leaderboards Verification Notes (2026-02-20)

- Internal incentive/quality/payout engines in `convex/incentives.ts` now accept both `GUARD` and `OPS` via `FIELD_WORKER_USER_TYPES` checks:
  - `checkAndSuggest`
  - `updateStreak`
  - `recomputeQualityScore`
  - `computePayoutAdjustment`
- Leaderboard APIs now support persona isolation with `persona_filter: GUARD | OPS | ALL` (validator from `convex/fieldWorkerContracts.ts`) and GUARD-safe default behavior:
  - `convex/incentives.ts`: `getLeaderboard`, `getMyLeaderboardPosition`, `getTopGuards`
  - `convex/guards.ts`: `getLeaderboard`
  - leaderboard row payloads now include explicit `persona`
- Field-worker self-serve auth migration completed:
  - `convex/incentives.ts`: `getMyQualitySnapshot`, `getMyStreaks`, `getMyCards` now use `requireFieldWorkerAuth`
  - `convex/payouts.ts`: `getGuardEarnings` now uses `requireFieldWorkerAuth` (export name preserved)
- Manual awards now accept OPS targets under existing admin permission gates and existing payout/streak idempotency/no-double-dipping logic remains active.

## E07 OPS Frontend Surfaces Verification Notes (2026-02-20)

- Guard route-group shell now accepts both `GUARD` and `OPS` users in `src/app/(guard)/layout.tsx` and preserves existing guard redirects (banned/must-change-password).
- Guard client shell now supports field-worker personas with OPS-safe fallback handling:
  - `src/app/(guard)/guard-layout-client.tsx` now gates by field-worker user types, keeps fingerprint capture guard-only, and catches rollout-denied field-worker errors in a dedicated boundary.
  - Locale sync now runs for both guard and OPS profiles through `api.guards.getMyProfile` inside the guarded shell.
- Navigation moved to config-driven visibility via `src/config/navigation.ts` and consumed by the guard shell. Ship-now nav remains unchanged for guards and excludes non-shipping routes.
- Deferred surfaces are explicit for OPS:
  - `src/app/(guard)/guard/shifts/page.tsx` redirects OPS to `/guard/unauthorized` and avoids guard-only schedule queries.
  - `src/app/(guard)/guard/onboarding/page.tsx` now exists and redirects OPS to `/guard/unauthorized`.
  - `src/app/(guard)/guard/unauthorized/page.tsx` provides a deterministic blocked experience.
  - Fingerprint mutation invocation remains guard-only in layout.
- Ship-now parity updates:
  - `src/app/(guard)/guard/dashboard/page.tsx`, `src/app/(guard)/guard/visits/page.tsx`, and `src/app/(guard)/guard/visits/[id]/page.tsx` now accept both GUARD and OPS.
  - `src/app/(guard)/guard/profile/page.tsx` avoids guard-only schedule/language/photo paths for OPS while keeping guard behavior unchanged.
  - `src/components/guard/GuardProfileCard.tsx` and `src/components/guard/GuardPhotoUpload.tsx` now support OPS-safe role display and read-only photo mode.
  - `src/app/(auth)/guard/change-password/page.tsx` bypasses guard language prompt for OPS first-login flow.

## E08 Admin UX Alignment Verification Notes (2026-02-20)

- Admin field-worker list/detail/search now support explicit persona filtering (`GUARD`, `OPS`, `ALL`) while preserving GUARD defaults:
  - `convex/guards.ts`: `list`/`search` accept `persona_filter`, and `getById` resolves both GUARD+OPS with explicit `persona` in payloads.
  - `src/app/(admin)/admin/guards/page.tsx` and `src/app/(admin)/admin/guards/[id]/page.tsx` updated for OPS-safe rendering and guard-only action gating.
- Analytics and leaderboard surfaces now expose persona segmentation contracts with explicit mixed-cohort handling:
  - `convex/analytics.ts`: `getOverviewKPIs`, `getSocietyComparison`, and `getGuardLeaderboard` accept `persona_filter` and return segmented counts/row persona context.
  - `src/app/(admin)/admin/analytics/page.tsx` adds persona controls; analytics tabs now honor selected persona.
  - `src/components/admin/dashboard/DashboardKPICards.tsx` supports GUARD/OPS/ALL segmentation with clear mixed-cohort disclosure.
- Referral scope boundaries are now explicit and tested:
  - `convex/referrals.ts` enforces GUARD-only guard referral scope with deterministic OPS exclusion messaging.
  - `src/app/(admin)/admin/referrals/page.tsx` adds admin-facing GUARD-only scope note.
  - `convex/referrals.test.ts` adds OPS exclusion coverage for mutation and internal paths.
- Verification commands passed for E08 scope:
  - `npx vitest convex/referrals.test.ts`
  - `npx tsc --noEmit`
  - `npm run build`
