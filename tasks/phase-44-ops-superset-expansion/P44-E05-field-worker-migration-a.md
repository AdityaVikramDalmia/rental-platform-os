---
id: P44-E05
title: Field-Worker Endpoint Migration A
phase: 44
status: done
depends_on: ["P44-E03", "P44-E04"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-20
---

# P44-E05: Field-Worker Endpoint Migration A

## Overview

Migrate core field-worker endpoints from guard-only helpers to `requireFieldWorker` / `requireFieldWorkerAuth` while preserving guard behavior and enforcing feature-flag/canary gates for OPS.

## Task Queue

- [x] P44-E05-T01: Migrate lead self-service endpoints to field-worker auth
- [x] P44-E05-T02: Migrate tenant bounty endpoints to field-worker auth
- [x] P44-E05-T03: Migrate visit execution endpoints and assignment validation
- [x] P44-E05-T04: Migrate profile/metrics/picker endpoints and enforce defer decisions

---

## T01: Migrate Lead Self-Service Endpoints to Field-Worker Auth

### Objective

Enable OPS users to create and manage their own lead lifecycle through existing guard lead endpoints with feature-flag protection.

### Required Reading

- `convex/leads.ts`
- `convex/auth.helpers.ts`
- `notes/features/35-ops-superset-expansion.md` (Sections 4, 5, 7)
- `notes/features/03-lead-pipeline.md`

### Key Rules

1. Migrate only endpoints marked `migrate` in matrix (`create`, `updateByGuard`, `getMyLeads`, `getMyLeadById`, `getSubmissionCount`).
2. Keep owner consent, dedupe, and state-transition validation unchanged.
3. Preserve existing guard rate-limit behavior; OPS initially shares same limits.
4. Update user-facing error strings from guard-specific wording to field-worker-neutral wording where applicable.

### Deliverables

- [ ] `convex/leads.ts` - migrated endpoint auth and neutralized copy
- [ ] `convex/leads.test.ts` - GUARD regression tests + OPS canary/enabled tests
- [ ] `verification/p44-ops-superset-expansion.md` - lead flow smoke test entries

### Acceptance Criteria

1. GUARD users can still execute all lead self-service flows with unchanged behavior.
2. OPS users in disabled mode and outside canary are blocked with `Feature not enabled`.
3. OPS users in canary/enabled mode can create and update their own leads.
4. Ownership checks still prevent cross-user lead edits/reads.
5. Rate-limit and dedupe behavior remains enforced for both GUARD and OPS.
6. Type-check and build pass.
7. Ledger rows `leads.create`, `leads.updateByGuard`, `leads.getMyLeads`, `leads.getMyLeadById`, and `leads.getSubmissionCount` in `migration-ledger.json` stay `migrate` and map to passing tests.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/leads.ts` and `convex/leads.test.ts`.

### Out of Scope

- Incentive/quality engine changes
- Frontend route work
- Admin list filters

---

## T02: Migrate Tenant Bounty Endpoints to Field-Worker Auth

### Objective

Allow OPS users to discover, accept, and track bounty-linked tenant inquiries in their society scope using existing bounty APIs.

### Required Reading

- `convex/tenantInquiries.ts`
- `convex/auth.helpers.ts`
- `notes/features/13-tenant-inquiry.md`
- `notes/features/35-ops-superset-expansion.md` (Sections 7 and 12)

### Key Rules

1. Migrate matrix-marked endpoints: `acceptBounty`, `listBounties`, `listByGuard`.
2. Keep society guardrail checks enforced through `guard_profiles.society_id`.
3. Preserve inquiry status transition legality.
4. Maintain compatibility with existing API names/response shape.

### Deliverables

- [ ] `convex/tenantInquiries.ts` - migrated bounty endpoint auth and wording
- [ ] `convex/tenantInquiries.test.ts` - guard regression and OPS parity tests
- [ ] `verification/p44-ops-superset-expansion.md` - bounty acceptance smoke coverage

### Acceptance Criteria

1. GUARD flows remain unchanged for bounty listing/acceptance.
2. Eligible OPS users can list and accept bounties in allowed rollout states.
3. Society mismatch still blocks bounty acceptance for all personas.
4. Non-eligible OPS users receive deterministic feature-disabled errors.
5. `listByGuard` remains backward compatible while supporting OPS actor ids.
6. `npx tsc --noEmit` and build pass.
7. Ledger rows `tenantInquiries.acceptBounty`, `tenantInquiries.listBounties`, and `tenantInquiries.listByGuard` in `migration-ledger.json` map to passing tests.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed tenant inquiry module/tests.

### Out of Scope

- Admin inquiry board changes
- Negotiation workflow changes
- Referral scope changes

---

## T03: Migrate Visit Execution Endpoints and Assignment Validation

### Objective

Allow OPS users to start/complete assigned visits and update assignment validation helper to accept GUARD or OPS field workers.

### Required Reading

- `convex/visits.ts`
- `convex/incentives.ts`
- `notes/features/06-visit-management.md`
- `notes/features/35-ops-superset-expansion.md` (Sections 7 and 9)

### Key Rules

1. Migrate matrix-marked endpoints: `start`, `complete`, `getMyVisits`, `getMyTodayVisits`.
2. Replace `ensureActiveGuardInSociety` predicate with field-worker-capable validation.
3. Keep visit state transitions and checklist gating unchanged.
4. Ensure downstream incentive hooks continue using actor user id semantics.

### Deliverables

- [ ] `convex/visits.ts` - migrated auth checks and assignment validator update
- [ ] `convex/visits.test.ts` - guard regression + OPS execution tests
- [ ] `verification/p44-ops-superset-expansion.md` - visit start/complete smoke checks

### Acceptance Criteria

1. Assigned OPS users can start and complete visits under enabled rollout states.
2. Assigned GUARD users keep existing behavior with no regressions.
3. Assignment validator enforces same-society and active-status checks for GUARD and OPS.
4. Checklist assignment checks still prevent cross-user completion.
5. Non-assigned users cannot start/complete visits regardless of persona.
6. Build and type-check pass.
7. Ledger rows `visits.start`, `visits.complete`, `visits.getMyVisits`, `visits.getMyTodayVisits`, `visits.ensureActiveGuardInSociety`, and `visits.getGuardAvailability` are validated against expected `migrate`/`keep_guard_only` actions.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/visits.ts` and tests.

### Out of Scope

- Leaderboard filters
- Frontend nav/UI changes
- Backfill reruns

---

## T04: Migrate Profile/Metrics/Picker Endpoints and Enforce Defer Decisions

### Objective

Finish migration coverage for profile/metrics/building-picker endpoints and explicitly keep deferred endpoints unchanged.

### Required Reading

- `convex/guards.ts`
- `convex/buildings.ts`
- `convex/users.ts`
- `notes/features/35-ops-superset-expansion.md` (Section 7)

### Key Rules

1. Migrate matrix rows marked `migrate` (`guards.getMyMetrics`, `guards.getRemainingLeads`, `guards.getMyProfile`, `buildings.listBySocietyForGuard`).
2. Preserve matrix rows marked `defer` (`users.updateProfile`, `guards.recordFingerprint`) with explicit tests.
3. Keep output payload contracts backward compatible for existing clients.
4. Use field-worker-neutral error copy where newly exposed to OPS.

### Deliverables

- [ ] `convex/guards.ts` - migrated read endpoints, deferred endpoint guards retained
- [ ] `convex/buildings.ts` - field-worker auth for society building picker
- [ ] `convex/users.ts` - defer path documented/tested for OPS profile update behavior
- [ ] `convex/guards.test.ts` and `convex/buildings.test.ts` - migration + defer coverage tests

### Acceptance Criteria

1. OPS users can read profile/metrics/remaining-leads where matrix says `migrate`.
2. OPS users can use building picker in their allowed society scope.
3. Deferred endpoints still block OPS (or remain hidden by route/UI policy) with explicit test coverage.
4. GUARD behavior remains unchanged for all migrated endpoints.
5. No response schema regressions for existing frontend callers.
6. Type-check and build pass.
7. Ledger rows `guards.getMyMetrics`, `guards.getRemainingLeads`, `guards.getMyProfile`, `buildings.listBySocietyForGuard`, `users.updateProfile`, and `guards.recordFingerprint` are covered with expected `migrate`/`defer` behavior.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed module/test files.

### Out of Scope

- Incentive internal engine changes
- Leaderboard persona filters
- Admin UX and frontend nav parity
