---
id: P44-E01
title: Contract Freeze + Scaffold
phase: 44
status: done
depends_on: []
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "doc-navigator"]
updated_at: 2026-02-20
---

# P44-E01: Contract Freeze + Scaffold

## Overview

Freeze the P44 implementation contract before touching runtime behavior. This epic creates scaffolding artifacts for feature flags, migration tracking, and test harness entry points so downstream epics can execute without ambiguity.

## Prerequisites

- P30 OPS portal and backoffice permissions are stable.
- P11 quality controls and P32 incentive rails are in production shape.
- `notes/features/35-ops-superset-expansion.md` is treated as source-of-truth for P44 contracts.

## Task Queue

- [x] P44-E01-T01: Create field-worker contract module and shared type definitions
- [x] P44-E01-T02: Add migration action registry and endpoint coverage ledger
- [x] P44-E01-T03: Create baseline test scaffolding for canary/guard parity checks

---

## T01: Create Field-Worker Contract Module and Shared Type Definitions

### Objective

Create one shared contract module for P44 feature-flag and persona-filter types so all epics consume the same canonical definitions.

### Required Reading

- `notes/features/35-ops-superset-expansion.md`
- `convex/auth.helpers.ts`
- `lib/constants.ts`
- `notes/13-constants-reference.md`

### Key Rules

1. Centralize P44-specific type contracts in one module; avoid ad-hoc string unions in multiple files.
2. Keep backward-compatible naming for legacy identifiers (`guard` field names remain unchanged).
3. Export strict literal unions for rollout states and leaderboard filter values.
4. Do not alter existing behavior in this task; scaffolding only.

### Deliverables

- [ ] `convex/fieldWorkerContracts.ts` - shared contracts (`FieldWorkerLeaderboardFilter`, rollout state types, migration action types)
- [ ] `lib/constants.ts` - exported P44 constants for rollout state values and default canary behavior
- [ ] `notes/features/35-ops-superset-expansion.md` - contract references updated to point at concrete module exports

### Acceptance Criteria

1. A single `convex/fieldWorkerContracts.ts` module exists and is imported by downstream implementation files.
2. Rollout state and leaderboard filter values are typed as literal unions, not loose strings.
3. No existing runtime behavior changes in `auth.helpers.ts`, `leads.ts`, `visits.ts`, or `tenantInquiries.ts`.
4. `npx tsc --noEmit` passes after adding the new module.
5. `lsp_diagnostics` is clean for all changed files.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/fieldWorkerContracts.ts`, `lib/constants.ts`, and `notes/features/35-ops-superset-expansion.md`.

### Out of Scope

- Auth helper implementation
- Endpoint-level migration
- Backfill logic

---

## T02: Add Migration Action Registry and Endpoint Coverage Ledger

### Objective

Create a machine-readable migration ledger that maps each P44 endpoint to `migrate`, `keep_guard_only`, or `defer` and ties each row to a test id.

### Required Reading

- `notes/features/35-ops-superset-expansion.md` (Section 7 matrix)
- `convex/leads.ts`
- `convex/visits.ts`
- `convex/tenantInquiries.ts`
- `convex/incentives.ts`
- `convex/guards.ts`

### Key Rules

1. Registry entries must include module name, function name, action, owner epic, and verification test id.
2. Include every callsite listed in the P44 migration matrix.
3. Keep this registry source-controlled and human-readable.
4. Treat missing registry rows as a build-time failure in later epics.

### Deliverables

- [ ] `tasks/phase-44-ops-superset-expansion/migration-ledger.json` - authoritative migration registry for all P44 surfaces
- [ ] `tasks/phase-44-ops-superset-expansion/P44-E05-field-worker-migration-a.md` - references ledger ids in task acceptance criteria
- [ ] `tasks/phase-44-ops-superset-expansion/P44-E06-incentives-quality-leaderboards.md` - references incentive-related ledger ids

### Acceptance Criteria

1. Ledger file includes all `requireGuard`, `requireGuardAuth`, and explicit guard-predicate rows from P44 spec.
2. Each ledger entry has a unique test id that maps to a planned test case.
3. No endpoint listed in the P44 matrix is missing from the ledger.
4. The ledger format supports automated validation (valid JSON, stable keys).
5. `lsp_diagnostics` and JSON validation are clean.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed markdown/json files.

### Out of Scope

- Executing migration changes
- Feature-flag runtime checks
- Integration test implementation

---

## T03: Create Baseline Test Scaffolding for Canary and Guard Parity

### Objective

Create base test fixtures and helper utilities that downstream epics reuse for OPS canary gating and guard non-regression checks.

### Required Reading

- `convex/auth.helpers.test.ts`
- `convex/leads.test.ts`
- `convex/tenantInquiries.test.ts`
- `convex/visits.test.ts`
- `notes/features/35-ops-superset-expansion.md` (Sections 5 and 13)

### Key Rules

1. Add reusable fixture creators for GUARD user, OPS user (canary enabled), and OPS user (canary disabled).
2. Keep tests deterministic and independent of production seed data.
3. Include explicit assertions for `Feature not enabled` and `Not authorized as field worker` errors.
4. Preserve existing guard tests; only extend with shared fixtures.

### Deliverables

- [ ] `convex/testUtils/fieldWorkerFixtures.ts` - reusable fixture helpers for GUARD/OPS personas
- [ ] `convex/testUtils/fieldWorkerAsserts.ts` - shared assertion helpers for rollout gate behavior
- [ ] `verification/p44-ops-superset-expansion.md` - baseline verification checklist linked to P44 release gates

### Acceptance Criteria

1. Fixture helpers can generate guard and ops users with explicit rollout state setup.
2. Canary-enabled OPS fixture can pass field-worker gate checks in tests.
3. Canary-disabled OPS fixture reliably fails with the expected feature-disabled error.
4. Existing guard tests still pass without behavior changes.
5. `npx tsc --noEmit` and `npm run build` pass after test scaffolding changes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/testUtils/fieldWorkerFixtures.ts`, `convex/testUtils/fieldWorkerAsserts.ts`, and `verification/p44-ops-superset-expansion.md`.

### Out of Scope

- Migrating any production endpoint
- Backfill execution
- Admin UI changes

---

## Completion Summary

**Completed**: 2026-02-20

### What Was Built

- Added canonical P44 contract module at `convex/fieldWorkerContracts.ts` with strict literal unions, field-worker user type constants, default leaderboard filter, and Convex validator.
- Added P44 config constants/defaults in `lib/constants.ts` and updated P44 spec references in `notes/features/35-ops-superset-expansion.md` to point to concrete contract exports.
- Created machine-readable migration ledger at `tasks/phase-44-ops-superset-expansion/migration-ledger.json` covering all matrix rows from Sections 7.1 through 7.4.
- Updated `tasks/phase-44-ops-superset-expansion/P44-E05-field-worker-migration-a.md` and `tasks/phase-44-ops-superset-expansion/P44-E06-incentives-quality-leaderboards.md` acceptance criteria to reference ledger row ids (`module.function`).
- Added reusable field-worker test scaffolding: `convex/testUtils/fieldWorkerFixtures.ts`, `convex/testUtils/fieldWorkerAsserts.ts`, and baseline release-gate tracker `verification/p44-ops-superset-expansion.md`.

### Key File Locations

| File                                                          | What                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `convex/fieldWorkerContracts.ts`                              | P44 contract types/constants/validator shared by downstream epics   |
| `lib/constants.ts`                                            | P44 config key names and rollout defaults                           |
| `tasks/phase-44-ops-superset-expansion/migration-ledger.json` | Authoritative endpoint migration ledger with actions and test ids   |
| `convex/testUtils/fieldWorkerFixtures.ts`                     | Guard/OPS fixture creators and rollout state config helper          |
| `convex/testUtils/fieldWorkerAsserts.ts`                      | Shared allow/blocked assertion helpers for field-worker gate tests  |
| `verification/p44-ops-superset-expansion.md`                  | E01-E09 and Section 13 release-gate verification checklist scaffold |

### Deviations from Spec

- Epic frontmatter remains `in_progress` per explicit execution instruction, even though all E01 task checkboxes are completed.

### Gotchas for Next Epic

- P44 config keys currently live in `P44_CONFIG_KEYS` (not `SYSTEM_CONFIG_KEYS`) to avoid widening existing system-config key contracts before P44-E02 schema/config plumbing.
- `setRolloutState` in `convex/testUtils/fieldWorkerFixtures.ts` writes the new P44 config keys directly to `system_config`; it is designed for use once P44-E02 introduces schema/config support for those keys.
