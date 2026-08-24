---
id: P05-E01
title: Verification Backend
phase: 5
status: done
depends_on: ["P04-E01", "P04-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P05-E01: Verification Backend

## Overview

Implement the owner verification backend domain and wire it into lead lifecycle transitions. This epic adds verification attempt recording, verification history retrieval, verification-driven lead status side effects, VERIFIED->REJECTED transition support, and state-machine documentation reconciliation.

## Prerequisites

- **Read first**: [P04-E02 Completion Summary](../phase-04-lead-pipeline/P04-E02-lead-admin-backend.md#completion-summary) — understand existing lead admin mutations (`leads.getById`, `leads.reject`, duplicate handling).
- **Read first**: [P04-E01 Completion Summary](../phase-04-lead-pipeline/P04-E01-lead-submission-backend.md#completion-summary) — understand `validateLeadTransition` conventions and helper patterns.
- P04 lead backend is complete and already exposes `leads.getById` with `verifications` join.

## Task Queue

- [x] P05-E01-T01: Verification Domain Scaffold + History Query
- [x] P05-E01-T02: `verifications.create` Mutation with Lead Status Side Effects
- [x] P05-E01-T03: Extend Lead State Machine Helpers for VERIFIED Rejection
- [x] P05-E01-T04: Extend `leads.reject` for VERIFIED Leads + Forward Coupling TODOs
- [x] P05-E01-T05: Backend Tests + State Machine Doc Reconciliation

---

## T01: Verification Domain Scaffold + History Query

### Objective

Create the dedicated verification backend module and implement the lead-scoped verification history query used by admin verification UI and lead detail rendering.

### Required Reading

- `notes/features/04-owner-verification.md` — "Convex Functions" section (expected verification function names and purpose)
- `notes/10-convex-schema.md` — `owner_verifications` table (exact validators and `by_lead_id` index)
- `notes/02-data-models.md` — Section G (Owner Verification field meanings)
- `notes/13-constants-reference.md` — Owner verification call outcomes and audit action strings
- `notes/11-convex-architecture.md` — Import conventions (`mutation` from `./functions`, query patterns)

### Key Rules

1. Create a dedicated file at `convex/verifications.ts`; do NOT place verification domain functions in `convex/leads.ts`.
2. Use exact field names from schema: `lead_id`, `called_by_admin_id`, `call_outcome`, `consent_contact_demorentals`, `consent_visit_coordination`, `preferred_visit_slots`, `rent_confirmed`, `notes`, `verified_at`.
3. Define `verifications.listByLead` with args `{ lead_id: v.id("leads") }`; enforce admin read permission via `requirePermission(ctx, "leads.view")`.
4. Query `owner_verifications` by `by_lead_id` index and return attempts with deterministic order (documented explicitly as newest-first or oldest-first).
5. Import `query` from `./_generated/server` (queries do not use the audit wrapper). Match P04 query import convention exactly.
6. For each verification attempt returned, join the admin user's name via `ctx.db.get(attempt.called_by_admin_id)` so E02 can display operator identity without a separate lookup.
7. Do not manually create `audit_logs` entries in this query.

### Deliverables

- [ ] `convex/verifications.ts` — New module with verification domain exports
- [ ] `convex/verifications.ts` — `verifications.listByLead` query using `by_lead_id` index

### Acceptance Criteria

1. `verifications.listByLead({ lead_id })` compiles with strict `v.id("leads")` arg validation.
2. Query uses `owner_verifications` index `by_lead_id` (no table scan).
3. Query requires admin auth + `leads.view` permission.
4. Return payload includes every schema field required by verification history UI, plus joined admin name (from `users` table via `called_by_admin_id`).
5. Query ordering is deterministic and documented in function comments/spec notes.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Check that query path is index-backed and permission-gated, and no manual audit writes were added.

### Out of Scope

- Verification creation mutation side effects
- Lead transition map changes
- Admin UI side panel components

---

## T02: `verifications.create` Mutation with Lead Status Side Effects

### Objective

Implement the verification create mutation that records every call attempt and applies lead status transitions for decisive outcomes.

### Required Reading

- `notes/features/04-owner-verification.md` — Workflow Step 3 + Step 4 outcome matrix
- `notes/10-convex-schema.md` — `owner_verifications` and `leads` validators
- `notes/04-state-machines.md` — Lead transition table (`SUBMITTED -> VERIFIED`, `SUBMITTED -> REJECTED`)
- `notes/03-roles-and-permissions.md` — `leads.verify` permission ownership
- `notes/13-constants-reference.md` — Call outcome enum literals + audit action names
- `tasks/phase-04-lead-pipeline/P04-E02-lead-admin-backend.md` — Existing mutation style and notes thread patterns

### Key Rules

1. Import `mutation` from `./functions` (NOT from `./_generated/server`) to ensure audit triggers fire automatically via the wrapper. This is mandatory for `OWNER_VERIFICATIONS_INSERT` and `LEADS_UPDATE` audit events.
2. Implement `verifications.create` in `convex/verifications.ts` with args:
   - `lead_id: v.id("leads")`
   - `call_outcome: v.union(v.literal("VERIFIED"), v.literal("UNREACHABLE"), v.literal("DECLINED"), v.literal("FALSE"))`
   - `consent_contact_demorentals: v.boolean()`
   - optional `consent_visit_coordination`, `preferred_visit_slots`, `rent_confirmed`, `notes`
3. Require `leads.verify` permission (`requirePermission(ctx, "leads.verify")`) at mutation entry.
4. Only allow verification attempts when lead status is `SUBMITTED`; reject attempts for other statuses with explicit error messages. The feature spec's "latest decisive outcome wins" (`04-owner-verification.md:151`) does NOT mean re-verifying non-SUBMITTED leads — correction happens via `leads.reject` (VERIFIED→REJECTED), not bypassing the `SUBMITTED` gate. State machine is authoritative.
5. Always insert an `owner_verifications` record, including `called_by_admin_id` and `verified_at: Date.now()`.
6. Outcome side effects:
   - `VERIFIED` + `consent_contact_demorentals === true` -> patch lead status to `VERIFIED`
   - `VERIFIED` + `consent_contact_demorentals === false` -> no status change
   - `UNREACHABLE` -> no status change
   - `DECLINED` or `FALSE` -> patch lead status to `REJECTED`
7. For verification-induced rejection (`DECLINED`/`FALSE`), do not require `leads.reject`; this mutation is fully authorized by `leads.verify`.
8. Use existing lead transition validation helper before patching status; do not bypass state machine checks.
9. Do not manually write audit logs; rely on wrapper-triggered `OWNER_VERIFICATIONS_INSERT` and `LEADS_UPDATE`.

### Deliverables

- [ ] `convex/verifications.ts` — `verifications.create` mutation with schema-accurate args
- [ ] `convex/verifications.ts` — outcome-to-status side effects implemented per feature spec

### Acceptance Criteria

1. Mutation inserts an `owner_verifications` row for every call attempt.
2. `VERIFIED` + consent true transitions lead `SUBMITTED -> VERIFIED`.
3. `VERIFIED` + consent false preserves lead status as `SUBMITTED`.
4. `UNREACHABLE` preserves lead status as `SUBMITTED`.
5. `DECLINED` and `FALSE` transition lead to `REJECTED`.
6. Mutation rejects non-`SUBMITTED` lead verification attempts.
7. Mutation requires `leads.verify` permission and fails without it.
8. No explicit `audit_logs` inserts exist in function body.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual mutation smoke checks (dashboard/tests): run all four outcomes and verify both inserted verification row and lead status side effect.

### Out of Scope

- Manual lead rejection endpoint behavior
- Admin UI integration
- Listing or visit cascades

---

## T03: Extend Lead State Machine Helpers for VERIFIED Rejection

### Objective

Align backend transition validation with P05 decision that VERIFIED leads can later be rejected when new owner information emerges.

### Required Reading

- `notes/04-state-machines.md` — Lead status transitions + validation code example
- `notes/features/04-owner-verification.md` — Edge case: owner changes mind after verification
- `tasks/phase-04-lead-pipeline/P04-E01-lead-submission-backend.md` — existing `validateLeadTransition` behavior in P04

### Key Rules

1. In `convex/leads.ts`, add `VERIFIED: ["REJECTED"]` to the `validateLeadTransition` map.
2. Preserve all existing transitions from P04 exactly; only add the new allowed edge.
3. Keep duplicate flow intact: no direct `POTENTIAL_DUPLICATE -> VERIFIED` transition.
4. Update any stale inline comments in code to reflect VERIFIED non-terminal behavior.
5. Ensure helper remains single source of transition truth for lead mutations.

### Deliverables

- [ ] `convex/leads.ts` — Updated `validateLeadTransition` map with `VERIFIED: ["REJECTED"]`
- [ ] `convex/leads.ts` — Transition comments corrected for VERIFIED non-terminal state

### Acceptance Criteria

1. `validateLeadTransition("VERIFIED", "REJECTED")` returns `true`.
2. `validateLeadTransition("VERIFIED", "SUBMITTED")` returns `false`.
3. Existing valid transitions from P04 remain unchanged.
4. Existing invalid duplicate shortcut (`POTENTIAL_DUPLICATE -> VERIFIED`) remains invalid.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run unit/behavior checks proving only VERIFIED->REJECTED was added.

### Out of Scope

- Mutation-level reject logic
- UI behavior changes

---

## T04: Extend `leads.reject` for VERIFIED Leads + Forward Coupling TODOs

### Objective

Extend the existing manual reject mutation (do not create a parallel one) so admins can reject VERIFIED leads when necessary.

### Required Reading

- `tasks/phase-04-lead-pipeline/P04-E02-lead-admin-backend.md` — existing `leads.reject` contract and notes-thread format
- `notes/04-state-machines.md` — lead rejection behavior and cascade notes
- `notes/03-roles-and-permissions.md` — `leads.reject` permission semantics
- `notes/13-constants-reference.md` — lead statuses and audit action naming

### Key Rules

1. Extend existing `leads.reject` in `convex/leads.ts`; do not introduce a new reject mutation name.
2. Permit `VERIFIED -> REJECTED` path in this mutation in addition to P04-supported statuses.
3. Keep permission requirement as `leads.reject` for manual rejection endpoint.
4. Preserve notes-thread append behavior with admin attribution and rejection reason.
5. Add forward-coupling comments exactly:
   - `// TODO P06: Archive linked listing when verified lead is rejected`
   - `// TODO P07: Cancel in-progress visits when verified lead is rejected`
6. Do not implement listing/visit cascade in P05 backend logic; only document hook points.

### Deliverables

- [ ] `convex/leads.ts` — `leads.reject` updated to accept VERIFIED status
- [ ] `convex/leads.ts` — P06/P07 TODO comments added at rejection side-effect boundary

### Acceptance Criteria

1. Manual `leads.reject` succeeds for `SUBMITTED`, `NEED_INFO`, and `VERIFIED` leads.
2. Manual `leads.reject` still fails for terminal statuses (`REJECTED`, `DUPLICATE`).
3. Rejection reason is appended to `notes_thread` with `author_type: "ADMIN"`.
4. Mutation still requires `leads.reject` permission.
5. Forward-coupling TODOs for P06/P07 are present with exact wording.
6. No listing/visit cascade implementation is introduced in P05.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual behavior checks: reject one VERIFIED lead and verify status + thread update + TODO comment presence.

### Out of Scope

- Actual listing archival behavior (P06)
- Actual visit cancellation behavior (P07)
- Verification form UI

---

## T05: Backend Tests + State Machine Doc Reconciliation

### Objective

Cover P05 backend behavior with tests and reconcile state-machine documentation snippet so docs and implementation stay aligned.

### Required Reading

- `notes/04-state-machines.md` — Validation Pattern section (code example currently requiring correction)
- `notes/features/04-owner-verification.md` — Business Rules + Edge Cases
- `notes/10-convex-schema.md` — `owner_verifications` schema validators for test fixtures
- `notes/13-constants-reference.md` — canonical action/outcome/status literal strings

### Key Rules

1. Extend/create backend tests to cover:
   - all verification outcomes
   - consent gate behavior
   - verification-induced rejection permission model (`leads.verify` only)
   - manual `leads.reject` on VERIFIED
2. Confirm audit side effects indirectly through trigger-backed mutation usage (no custom audit insertion assertions that depend on brittle internals).
3. Update `notes/04-state-machines.md` lead status documentation comprehensively:
   - transition table includes `VERIFIED -> REJECTED`
   - lead-status prose/terminal-state note keeps VERIFIED non-terminal
   - lead diagram reflects VERIFIED rejection path if diagram is maintained
4. Update `notes/04-state-machines.md` validation snippet:
   - add `VERIFIED: ["REJECTED"]`
   - replace misleading comment `// VERIFIED, REJECTED, DUPLICATE: terminal` with `// REJECTED, DUPLICATE: terminal`
5. Keep table/prose/diagram and validation code example aligned in the same document.
6. Add clarification note to `notes/features/04-owner-verification.md` near line 151 ("latest decisive outcome wins"): clarify that re-verification requires the lead to be in SUBMITTED status; a VERIFIED lead must first be rejected (VERIFIED→REJECTED) before it can be re-verified. This prevents doc drift between the feature spec and the state machine.

### Deliverables

- [ ] `convex/leads.test.ts` (or existing lead test suite) — P05 verification and reject extension cases
- [ ] `convex/verifications.test.ts` (or merged suite) — verification domain tests
- [ ] `notes/04-state-machines.md` — corrected lead transition table/prose + validation code example/comment

### Acceptance Criteria

1. Tests assert all four call outcomes and expected lead status side effects.
2. Tests assert VERIFIED + consent false does not transition lead status.
3. Tests assert verification-induced rejection succeeds with `leads.verify` permission.
4. Tests assert manual VERIFIED rejection still requires `leads.reject` permission.
5. `notes/04-state-machines.md` transition table includes `VERIFIED -> REJECTED`.
6. `notes/04-state-machines.md` example includes `VERIFIED: ["REJECTED"]`.
7. Misleading terminal comment/prose is corrected to exclude VERIFIED from terminal states.
8. `npm run test -- convex/leads.test.ts` (or equivalent target) passes.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npm run test -- convex/leads.test.ts
npx tsc --noEmit
```

Check that doc snippet and implementation transition map are consistent.

### Out of Scope

- Admin UI visual verification
- Guard UI feature changes

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- `convex/verifications.ts` — New verification domain module with `listByLead` query (index-backed, newest-first, admin name join) and `create` mutation (outcome-to-status side effects, `leads.verify` permission gate, `SUBMITTED`-only status gate)
- `convex/leads.ts` — Exported `validateLeadTransition`, added `VERIFIED: ["REJECTED"]` transition, added P06/P07 forward-coupling TODOs to `leads.reject`
- `convex/functions.ts` — Added `"owner_verifications"` to `AUDITED_TABLES` for automatic audit trigger coverage
- `convex/leads.test.ts` — 10 new verification tests covering all 4 outcomes, consent gate, permission gate, status gate, VERIFIED→REJECTED manual reject, listByLead ordering
- `notes/04-state-machines.md` — Added VERIFIED→REJECTED transition row, corrected terminal states note, updated validation snippet and ASCII diagram
- `notes/features/04-owner-verification.md` — Added clarification that re-verification requires SUBMITTED status

### Key File Locations

- `convex/verifications.ts` — Verification domain (query + mutation)
- `convex/leads.ts:78-87` — Updated `validateLeadTransition` with export + VERIFIED transition
- `convex/leads.ts:492-493` — P06/P07 forward-coupling TODOs in `leads.reject`
- `convex/functions.ts:18` — `"owner_verifications"` in AUDITED_TABLES
- `convex/leads.test.ts` — New tests in `describe("verifications")` block at end of file

### Deviations from Spec

- `validateLeadTransition` was exported from `leads.ts` (was module-private) so `verifications.ts` can import it as single source of truth. No functional change to existing code.

### Gotchas for Next Epic

- `verifications.listByLead` returns enriched records with `admin_name` field — E02 UI can use this directly without additional lookups
- `leads.getById` already includes a `verifications` join from P04 — E02 can use either source for display
- The `create` mutation returns the verification ID (not the full record) — UI should rely on reactive query updates for state changes
- `consent_contact_demorentals` is always required (boolean) even for non-VERIFIED outcomes — UI should default to `false` for UNREACHABLE/DECLINED/FALSE
