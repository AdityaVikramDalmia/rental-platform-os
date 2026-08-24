---
id: P44-E03
title: Auth Helper Layer
phase: 44
status: done
depends_on: ["P44-E02"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-20
---

# P44-E03: Auth Helper Layer

## Overview

Implement `requireFieldWorker` and `requireFieldWorkerAuth` with exact P44 contracts, including OPS feature gating and canary support. This epic does not migrate business endpoints yet.

## Task Queue

- [x] P44-E03-T01: Implement `requireFieldWorker` and `requireFieldWorkerAuth`
- [x] P44-E03-T02: Add rollout gate resolver and reusable helper composition
- [x] P44-E03-T03: Add helper test coverage for GUARD/OPS/flag/canary states

---

## T01: Implement `requireFieldWorker` and `requireFieldWorkerAuth`

### Objective

Add the two new auth helpers with exact return types and error messages defined in P44 feature spec.

### Required Reading

- `convex/auth.helpers.ts`
- `notes/features/35-ops-superset-expansion.md` (Section 4)
- `convex/systemConfig.helpers.ts`

### Key Rules

1. `requireFieldWorker` returns `{ user, guardProfile }`.
2. `requireFieldWorkerAuth` returns `{ user }`.
3. Both helpers must enforce `user_type in {GUARD, OPS}` and `status === ACTIVE`.
4. Eligibility failures must use the exact message: `"Not authorized as field worker"`.
5. For OPS users, helper must enforce feature-flag/canary checks before allowing access.

### Deliverables

- [x] `convex/auth.helpers.ts` - implement new helper pair with exact contracts and error strings
- [x] `notes/features/35-ops-superset-expansion.md` - keep helper signature docs synchronized
- [x] `convex/auth.helpers.test.ts` - add contract tests for new helpers

### Acceptance Criteria

1. `requireFieldWorker` resolves a valid `guard_profiles` row for eligible GUARD and OPS users.
2. `requireFieldWorkerAuth` does not query profile and still enforces eligibility checks.
3. Non-GUARD/OPS users fail with `Not authorized as field worker`.
4. Inactive or banned users fail with `Not authorized as field worker`.
5. OPS users with feature disabled and not in canary fail with `Feature not enabled`.
6. TypeScript type inference for return values is precise and used by callers.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/auth.helpers.ts` and `convex/auth.helpers.test.ts`.

### Out of Scope

- Business endpoint migration
- Backfill logic
- Frontend route behavior

---

## T02: Add Rollout Gate Resolver and Reusable Helper Composition

### Objective

Factor rollout state checks into reusable utilities so downstream endpoint migrations remain small and consistent.

### Required Reading

- `convex/systemConfig.helpers.ts`
- `convex/auth.helpers.ts`
- `convex/fieldWorkerContracts.ts`
- `notes/features/35-ops-superset-expansion.md` (Section 5)

### Key Rules

1. Single source for OPS feature enabled/canary check logic.
2. Guard users must bypass OPS rollout flags entirely.
3. Resolver must support strict and soft-check modes (throw vs boolean) for caller flexibility.
4. Keep helper names explicit (`isOpsFieldWorkerEnabledForUser` style).

### Deliverables

- [x] `convex/fieldWorkerRollout.ts` - reusable rollout resolver utilities
- [x] `convex/auth.helpers.ts` - helper composition updated to consume rollout resolver
- [x] `convex/fieldWorkerRollout.test.ts` - resolver tests for disabled/canary/enabled states

### Acceptance Criteria

1. Rollout resolver evaluates all three states correctly: disabled, canary, enabled.
2. Resolver behavior is deterministic for missing/invalid config values.
3. GUARD users remain unaffected by OPS rollout config toggles.
4. `requireFieldWorker` delegates OPS eligibility checks to resolver utilities.
5. Tests cover positive and negative paths for canary id matching.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on rollout utilities and tests.

### Out of Scope

- Endpoint-level rollout instrumentation
- Monitoring dashboards
- Admin filters

---

## T03: Add Helper Test Coverage for GUARD/OPS/Flag/Canary States

### Objective

Create comprehensive helper-level tests so endpoint migration epics can rely on trusted auth behavior.

### Required Reading

- `convex/auth.helpers.test.ts`
- `convex/testUtils/fieldWorkerFixtures.ts`
- `notes/features/35-ops-superset-expansion.md` (Sections 4 and 5)

### Key Rules

1. Cover all matrix states from feature spec (disabled, canary, enabled).
2. Verify return payload shape for both helper methods.
3. Assert exact error strings and codes for blocked access.
4. Keep tests isolated and deterministic (no dependency on external seed state).

### Deliverables

- [x] `convex/auth.helpers.test.ts` - add P44 helper matrix coverage
- [x] `convex/testUtils/fieldWorkerFixtures.ts` - finalize fixture support for helper tests
- [x] `verification/p44-ops-superset-expansion.md` - document helper test matrix outcomes

### Acceptance Criteria

1. Tests validate GUARD access remains allowed regardless of OPS flag state.
2. Tests validate OPS blocked when feature disabled and user not canary.
3. Tests validate OPS allowed in canary mode only when id present in allowlist.
4. Tests validate OPS allowed globally when main flag enabled.
5. Test assertions verify exact helper return object keys and error messages.
6. `npx tsc --noEmit` and build pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed helper tests and fixture files.

### Out of Scope

- Endpoint behavior migration
- Backfill/provisioning migration
- Frontend route parity
