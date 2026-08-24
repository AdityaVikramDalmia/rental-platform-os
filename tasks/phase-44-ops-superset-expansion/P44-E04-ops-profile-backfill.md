---
id: P44-E04
title: OPS Profile Backfill + Provisioning
phase: 44
status: done
depends_on: ["P44-E03"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-20
---

# P44-E04: OPS Profile Backfill + Provisioning

## Overview

Guarantee every eligible OPS user has a `guard_profiles` row with deterministic defaults and migrate provisioning so new OPS accounts are created with profile parity by default.

## Task Queue

- [x] P44-E04-T01: Build idempotent backfill mutation with deterministic defaults
- [x] P44-E04-T02: Implement society resolution via `ops_assignments` and `DEFAULT_UNASSIGNED`
- [x] P44-E04-T03: Add `createOpsInternal` profile upsert forward-fix
- [x] P44-E04-T04: Add migration reporting, dry-run mode, and verification checks

---

## T01: Build Idempotent Backfill Mutation With Deterministic Defaults

### Objective

Implement a batched backfill mutation that creates missing OPS `guard_profiles` rows with P44-required defaults.

### Required Reading

- `convex/guards.ts` (`createOpsInternal`)
- `convex/owners.ts` (batched backfill pattern)
- `convex/schema.ts` (`guard_profiles`, `users`)
- `notes/features/35-ops-superset-expansion.md` (Production Rollout Runbook and Rollback Playbook sections)

### Key Rules

1. Backfill must be idempotent and safe to rerun.
2. Skip users with existing profiles; count skips explicitly.
3. Create profiles only for `ACTIVE` OPS users.
4. Default values must match feature contract (`guard_type=SOCIETY_GUARD`, no shifts).

### Deliverables

- [ ] `convex/guards.ts` - internal batched backfill mutation(s) for OPS profile creation
- [ ] `convex/guards.test.ts` - tests for idempotency and skip behavior
- [ ] `verification/p44-ops-superset-expansion.md` - add migration metrics checklist

### Acceptance Criteria

1. Backfill creates profiles for OPS users without existing rows.
2. Backfill does not duplicate profile rows on repeated runs.
3. Existing profile rows are skipped and counted under `skipped_existing_profile_count`.
4. Inactive OPS users are skipped deterministically.
5. Mutation returns contract metrics (`scanned_count`, `created_count`, `skipped_*`, `error_count`, `next_cursor`).
6. `npx tsc --noEmit` and build pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/guards.ts` and test files.

### Out of Scope

- Endpoint auth migration
- Incentive and leaderboard changes
- Frontend UI updates

---

## T02: Implement Society Resolution Via `ops_assignments` and `DEFAULT_UNASSIGNED`

### Objective

Enforce deterministic society assignment during backfill by resolving from `ops_assignments` first, then falling back to configured default unassigned society id.

### Required Reading

- `convex/schema.ts` (`ops_assignments`, `guard_profiles`, `system_config`)
- `convex/systemConfig.helpers.ts`
- `notes/features/20-ops-portal.md`
- `notes/features/35-ops-superset-expansion.md` (Section 8)

### Key Rules

1. Prefer explicit OPS assignment records over fallback defaults.
2. If no assignment exists, require valid `default_unassigned_society_id`.
3. Missing fallback society must produce tracked skip/error output, never silent null insert.
4. Keep society resolution helper reusable by both backfill and provisioning paths.

### Deliverables

- [ ] `convex/opsAssignments.helpers.ts` - reusable society resolution helper for OPS field-worker profile creation
- [ ] `convex/guards.ts` - backfill path updated to use helper
- [ ] `convex/opsAssignments.helpers.test.ts` - tests for assigned/fallback/error scenarios

### Acceptance Criteria

1. Assigned society path is selected when `ops_assignments` data exists.
2. Fallback `default_unassigned_society_id` is used when no assignment exists.
3. Invalid/missing fallback configuration is surfaced with deterministic error reporting.
4. Helper API is reused by backfill and create-time provisioning code.
5. Tests cover all three branches (assigned, fallback, unresolved).

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on helper and guard backfill files.

### Out of Scope

- Endpoint behavior changes
- Admin filtering changes
- Rollout canary enablement

---

## T03: Add `createOpsInternal` Profile Upsert Forward-Fix

### Objective

Update OPS account provisioning so every newly created OPS user gets an upserted `guard_profiles` row at creation time.

### Required Reading

- `convex/guards.ts` (`createOpsInternal`, ops create flows)
- `convex/actions/workos.ts`
- `notes/features/23-ops-admin-access.md`
- `notes/features/35-ops-superset-expansion.md` (Section 8.3)

### Key Rules

1. Provisioning must upsert by `user_id`; never create duplicate profiles.
2. Apply same deterministic defaults as backfill.
3. Preserve existing OPS creation idempotency guarantees.
4. Do not break OPS Google-email account creation path.

### Deliverables

- [ ] `convex/guards.ts` - `createOpsInternal` updated with guard_profile upsert
- [ ] `convex/guards.test.ts` - provisioning tests for first-create and re-run paths
- [ ] `notes/features/35-ops-superset-expansion.md` - reconcile provisioning/backfill contract and rollout status statements with implemented behavior.

### Acceptance Criteria

1. New OPS account creation writes/updates a `guard_profiles` row in same workflow.
2. Re-running provisioning path does not create duplicate profiles.
3. Profile defaults match P44 contract values.
4. Existing OPS auth and role-assignment behavior remains unchanged.
5. Type-check and build pass with updated tests.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed provisioning paths and tests.

### Out of Scope

- Endpoint migration
- Incentive and leaderboard changes
- Frontend parity surfaces

---

## T04: Add Migration Reporting, Dry-Run Mode, and Verification Checks

### Objective

Provide operational safety controls for running backfill in production-like environments, including dry-run and report exports.

### Required Reading

- `convex/guards.ts` backfill implementation from T01/T02
- `notes/features/35-ops-superset-expansion.md` (Production Rollout Runbook and Rollback Playbook sections)
- `verification/p44-ops-superset-expansion.md`

### Key Rules

1. Dry-run mode must perform full scan/decision logic without inserts/patches.
2. Backfill reports must include all required metric counters.
3. Add clear operator logs for created/skipped/unresolved/error counts.
4. Keep backfill resumable with cursor semantics.

### Deliverables

- [ ] `convex/guards.ts` - dry-run support and structured migration result payload
- [ ] `scripts/p44-backfill-report.mjs` - helper script to aggregate and print migration metrics
- [ ] `verification/p44-ops-superset-expansion.md` - backfill runbook and acceptance thresholds

### Acceptance Criteria

1. Dry-run executes without data mutation and returns accurate projected counts.
2. Live mode returns deterministic progress metrics and cursor values.
3. Report script prints created/skip/error percentages and highlights threshold breaches.
4. Backfill can be paused/resumed without duplicate profile creation.
5. Release-gate metric (`>=95% OPS profile coverage`) is computable from generated report.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/guards.ts`, report script, and verification docs.

### Out of Scope

- Enabling OPS field-worker traffic
- Endpoint migration and UI parity
- Admin analytics filters
