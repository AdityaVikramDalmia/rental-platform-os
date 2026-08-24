---
id: P44-E09
title: Rollout, Monitoring, Rollback
phase: 44
status: done
depends_on: ["P44-E04", "P44-E05", "P44-E06", "P44-E07", "P44-E08"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "verification-agent"]
updated_at: 2026-02-20
---

# P44-E09: Rollout, Monitoring, Rollback

## Overview

Operationalize P44 with canary rollout controls, release gates, field-worker error-rate monitoring, and a reversible rollback procedure that does not mutate historical data.

## Task Queue

- [x] P44-E09-T01: Implement rollout controls for global flag and canary user list management
- [x] P44-E09-T02: Build OPS field-worker monitoring and release-gate metrics
- [x] P44-E09-T03: Execute smoke/regression verification matrix before enablement
- [x] P44-E09-T04: Validate rollback drill and finalize launch runbook

---

## T01: Implement Rollout Controls for Global Flag and Canary User List Management

### Objective

Provide safe admin-managed controls for `ops_field_worker_enabled` and `ops_field_worker_canary_user_ids` with validation and audit trails.

### Required Reading

- `convex/systemConfig.ts`
- `convex/systemConfig.helpers.ts`
- `src/app/(admin)/admin/settings/page.tsx`
- `notes/features/35-ops-superset-expansion.md` (Section 5 and "Production Rollout Runbook" under Section 13)

### Key Rules

1. Rollout controls must be admin-only and auditable.
2. Canary user list writes must validate user ids exist and are OPS users.
3. Keep config updates idempotent and reversible.
4. Never require code deployment for flag/canary changes.

### Deliverables

- [ ] `convex/systemConfig.ts` - secure mutations for P44 flag + canary key updates
- [ ] `src/app/(admin)/admin/settings/page.tsx` - P44 rollout control UI section
- [ ] `src/components/admin/settings/ops-field-worker-rollout-card.tsx` - dedicated rollout controls component

### Acceptance Criteria

1. Admin can toggle global field-worker flag on/off.
2. Admin can add/remove OPS user ids in canary list with validation.
3. Invalid canary entries are rejected with clear inline errors.
4. Config changes are reflected immediately in backend behavior.
5. Audit logs capture rollout-control changes.
6. Type-check/build and diagnostics pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed system-config backend and admin settings files.

### Out of Scope

- Endpoint implementation changes
- Incentive logic changes
- Guard portal UI parity work

---

## T02: Build OPS Field-Worker Monitoring and Release-Gate Metrics

### Objective

Instrument and expose metrics required by release gate: OPS endpoint error rate, profile coverage, and incentive generation correctness.

### Required Reading

- `convex/analytics.ts`
- `convex/auditLogs.ts`
- `src/app/(admin)/admin/analytics/page.tsx`
- `notes/features/35-ops-superset-expansion.md` (Section 13)

### Key Rules

1. Error-rate metric must be scoped to OPS field-worker endpoints only.
2. Profile coverage metric must compute active OPS users with profile presence.
3. Keep metric queries efficient and index-backed where possible.
4. Present threshold status (`pass`/`fail`) directly in admin monitor UI.

### Deliverables

- [ ] `convex/analytics.ts` - release-gate metrics queries (`ops_profile_coverage`, `ops_field_worker_error_rate`, incentive sanity counts)
- [ ] `src/app/(admin)/admin/analytics/page.tsx` - P44 rollout metrics panel
- [ ] `src/components/admin/dashboard/OpsSupersetGateCard.tsx` - threshold status card component

### Acceptance Criteria

1. OPS profile coverage metric is available and accurate against backfill outputs.
2. OPS endpoint error rate metric is measurable over selected time windows.
3. Incentive generation sanity metric highlights mismatches/zero-cases.
4. Gate card clearly shows pass/fail for all release criteria.
5. Metrics refresh with live data and do not block existing dashboards.
6. Type-check/build and diagnostics pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on new analytics query/component files.

### Out of Scope

- Modifying old analytics snapshots schema beyond required fields
- Notification channel expansion
- Frontend route policy changes

---

## T03: Execute Smoke/Regression Verification Matrix Before Enablement

### Objective

Run pre-launch verification matrix covering guard regressions and OPS parity smoke journeys across lead, bounty, and visit flows.

### Required Reading

- `verification/p44-ops-superset-expansion.md`
- `notes/features/35-ops-superset-expansion.md` (Sections 7, 10, 13)
- `verification/README.md`

### Key Rules

1. Smoke matrix must include both GUARD and OPS personas.
2. Verify disabled-mode and canary-enabled behavior explicitly.
3. Log failures with actionable root-cause details.
4. Do not mark rollout-ready without evidence for every release gate item.

### Deliverables

- [ ] `verification/p44-ops-superset-expansion.md` - executed matrix results with timestamps and outcomes
- [ ] `verification/README.md` - P44 coverage entry update
- [ ] Bug reports follow `bugs/BUG-{sequential-number}-{kebab-case-description}.md` per `bugs/README.md` convention for any blockers found during verification

### Acceptance Criteria

1. OPS can submit lead, accept bounty, and complete visit in enabled/canary states.
2. Guard parity regression suite remains green.
3. Disabled-mode OPS requests fail with expected feature-disabled behavior.
4. Leaderboard filter isolation is validated (`GUARD` excludes OPS).
5. Incentive cards are generated for OPS trigger events in test data.
6. Verification artifacts are complete and linked from coverage index.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on any touched test/verification code files.

### Out of Scope

- New feature implementation
- Cross-phase documentation reconciliation
- Production rollout execution itself

---

## T04: Validate Rollback Drill and Finalize Launch Runbook

### Objective

Perform a rollback drill using config controls and document the exact launch/rollback runbook for ops teams.

### Required Reading

- `notes/features/35-ops-superset-expansion.md` (Section 15)
- `verification/p44-ops-superset-expansion.md`
- `insights/README.md`

### Key Rules

1. Rollback must be config-only (no destructive DB operations).
2. Verify guard flow continuity immediately after rollback.
3. Retain all historical OPS attribution data.
4. Runbook must include owner, timing, and validation checkpoints.

### Deliverables

- [ ] `verification/p44-ops-superset-expansion.md` - rollback drill record and observed outcomes
- [ ] `insights/p44-ops-superset-rollout/README.md` - launch + rollback operational runbook
- [ ] `tasks/phase-44-ops-superset-expansion/P44-E09-rollout-monitoring-rollback.md` - completion notes and final gate summary

### Acceptance Criteria

1. Rollback drill successfully disables OPS field-worker access via config flip.
2. Guard flows remain healthy during and after rollback.
3. Existing OPS-created records remain intact and readable after rollback.
4. Runbook includes explicit pre-check, execute, verify, and recover steps.
5. Incident communication template and success criteria are documented.
6. Type-check/build and diagnostics remain clean after runbook-supporting code changes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed verification/insights/task files.

### Out of Scope

- Redesigning long-term observability stack
- New analytics product features
- Referral model changes

---

## Completion Notes and Final Gate Summary

### What was implemented

- Added admin-only rollout controls in `convex/systemConfig.ts` for:
  - global toggle: `setOpsFieldWorkerEnabled`
  - canary list set/add/remove with strict OPS + ACTIVE validation
  - rollout state + canary inventory query: `getOpsFieldWorkerRollout`
- Added settings UX surface `src/components/admin/settings/ops-field-worker-rollout-card.tsx` and mounted it in `src/app/(admin)/admin/settings/page.tsx`.
- Added release-gate monitoring query `getOpsSupersetGateMetrics` in `convex/analytics.ts`.
- Added release-gate UI card `src/components/admin/dashboard/OpsSupersetGateCard.tsx` and mounted it in `src/app/(admin)/admin/analytics/page.tsx`.
- Updated verification artifacts in `verification/p44-ops-superset-expansion.md` and `verification/README.md`.
- Added operational runbook at `insights/p44-ops-superset-rollout/README.md` and indexed it in `insights/README.md`.

### Final gate summary (implementation state)

| Gate                                          | Status  | Notes                                                                      |
| --------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| Rollout controls shipped                      | PASS    | Runtime config-only toggle/canary management with admin-only gates         |
| Monitoring panel shipped                      | PASS    | Coverage, error-rate, incentive sanity, and persona count splits exposed   |
| Smoke matrix documented                       | PASS    | Matrix and evidence links added to verification log                        |
| Rollback runbook documented                   | PASS    | Config-only rollback steps + validation checkpoints + comms template added |
| Production canary observation window complete | PENDING | Requires live canary window and runtime sample collection                  |
