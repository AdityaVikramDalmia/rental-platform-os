---
id: P26-E04
title: Mandatory Checklist & Closure Gate
phase: 26
status: done
depends_on: ["P26-E01", "P26-E02", "P26-E03", "P24-E02", "P25-E02", "P08-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "doc-reconciler"]
updated_at: 2026-02-20
---

# P26-E04: Mandatory Checklist & Closure Gate

## Overview

Implement the mandatory 10-item negotiation checklist as the hard gate between negotiated terms and closure creation, then integrate this gate into closure mutations and final negotiation state transitions.

## Prerequisites

- **Read first**: [P26-E02 Completion Summary](P26-E02-terms-proposal-engine.md#completion-summary) - signed proposal states and versioning assumptions.
- **Read first**: [P26-E03 Completion Summary](P26-E03-token-brokerage.md#completion-summary) - token policy and brokerage readiness dependencies.
- **Read first**: [P08-E01 Closure Backend](../phase-08-closure/P08-E01-closure-backend.md) - closure create/confirm flows being gated.
- **Read first**: P25-E02 sign-off completion context - cross-check for deal checklist integration.
- P26-E02 and P26-E03 must be complete before this epic.

## Task Queue

- [x] P26-E04-T01: Mandatory Checklist Backend
- [x] P26-E04-T02: Closure Gate Integration
- [x] P26-E04-T03: Checklist UI
- [x] P26-E04-T04: Negotiation Status Transitions

---

## T01: Mandatory Checklist Backend

### Objective

Implement checklist data and mutation/query APIs on `negotiations` so all 10 required post-agreement items are tracked and computable for closure readiness.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Mandatory Post-Agreement Checklist section
- `notes/04-state-machines.md` - negotiation transition targets (`DOCUMENTATION_IN_PROGRESS`, `READY_FOR_CLOSURE`)
- `notes/10-convex-schema.md` - negotiation table extension conventions
- `convex/negotiations.ts` - negotiation domain mutation patterns

### Key Rules

1. Model all 10 checklist items on `negotiations.negotiation_checklist` (single-document model, no new checklist table).
2. Checklist must track:
   - `terms_agreed` (auto)
   - `both_parties_signed` (auto from deal checklist approval)
   - `token_collected` (auto)
   - `brokerage_recorded` (auto)
   - `police_verification_status` (`PENDING`/`IN_PROGRESS`/`COMPLETED`/`WAIVED`)
   - `society_noc_status` (`PENDING`/`OBTAINED`/`WAIVED`)
   - `owner_kyc_status` (`PENDING`/`VERIFIED`/`WAIVED`)
   - `rent_agreement_status` (`PENDING`/`DRAFT_READY`/`STAMP_REGISTERED`/`WAIVED`) + optional `rent_agreement_file_id`
   - `key_handover_status` (`PENDING`/`COMPLETED`)
   - `move_in_inspection_status` (`PENDING`/`COMPLETED`) + optional `inspection_notes`
3. Implement `updateChecklistItem` mutation (admin-only) for manual item status changes.
4. Implement `uploadRentAgreement` mutation (admin-only) that stores file via Convex storage and updates checklist state.
5. Implement `waiveItem` mutation (admin-only) capturing waive reason metadata.
6. Implement `getChecklistStatus` query returning all checklist fields and computed readiness boolean.
7. `READY_FOR_CLOSURE` readiness calculation must require every item to be terminal-complete (`COMPLETED`/`OBTAINED`/`VERIFIED`/`STAMP_REGISTERED`) or `WAIVED`.

### Deliverables

- [ ] `convex/negotiations.ts` - checklist mutation/query APIs and readiness calculator
- [ ] `convex/negotiationsChecklist.ts` (if split module) - checklist-specific helper logic

### Acceptance Criteria

1. All 10 checklist items are persisted and queriable from negotiation record.
2. Auto items update from source-of-truth records without manual toggles.
3. Manual items support status updates and waive-with-reason workflow.
4. Rent agreement upload field is persisted on negotiation checklist state.
5. Readiness query returns deterministic `READY_FOR_CLOSURE` eligibility.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on checklist-related negotiation backend files.

### Out of Scope

- Closure mutation gating
- Queue/detail UI rendering
- Escalation analytics

---

## T02: Closure Gate Integration

### Objective

Gate closure creation/confirmation on negotiation readiness and synchronize terminal negotiation state when closure progresses.

### Required Reading

- `convex/closures.ts` - existing create/confirm/cancel mutation logic
- `notes/features/19-rent-negotiation.md` - closure gating requirements
- `notes/04-state-machines.md` - closure and negotiation terminal transition definitions
- `convex/negotiations.ts` - checklist/readiness queries from T01

### Key Rules

1. Extend `closures.create()` args with optional `negotiation_id`.
2. If `negotiation_id` is provided, validate linked negotiation status is `READY_FOR_CLOSURE` before inserting closure.
3. Persist `negotiation_id` on closure record.
4. On closure confirm flow, transition linked negotiation status to `CLOSED`.
5. Keep legacy non-negotiation closure path functional when `negotiation_id` is omitted.
6. Preserve existing lead/listing validation and payout-void cascade behavior.

### Deliverables

- [ ] `convex/closures.ts` - `create()` negotiation gate, persisted `negotiation_id`, and close-sync transition
- [ ] `convex/negotiations.ts` - helper mutation/query used by closure confirm transition

### Acceptance Criteria

1. Closure creation with `negotiation_id` is blocked unless negotiation is `READY_FOR_CLOSURE`.
2. Closure record stores negotiation linkage.
3. Confirming linked closure transitions negotiation to `CLOSED`.
4. Existing closure behavior remains unchanged for non-negotiation path.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/closures.ts` and any changed negotiation backend files.

### Out of Scope

- Checklist UI composition
- Escalation jobs and analytics
- Proposal/token backend work

---

## T03: Checklist UI

### Objective

Build the 10-item checklist panel UX with grouped status controls, progress tracking, file upload, and closure CTA gating on readiness.

### Required Reading

- `notes/features/19-rent-negotiation.md` - checklist user story + acceptance criteria
- `notes/06-admin-panel-ux.md` - admin sidebar/panel interaction style
- `src/components/ui/*` - select/badge/progress/form/upload component patterns

### Key Rules

1. Build `MandatoryChecklist` with 10 items grouped by category (Documentation, Verification, Payment, Property).
2. Auto-validated items (1-4) render as system-computed read-only check states.
3. Manual items (5-10) render status dropdowns with explicit waive controls.
4. Show progress indicator (`N/10 complete`) and readiness banner when all items complete.
5. Include rent agreement file upload widget (picker + preview).
6. Render a primary `Create Closure` action button disabled until readiness is true.

### Deliverables

- [ ] `src/components/negotiation/MandatoryChecklist.tsx` - full checklist panel
- [ ] `src/components/negotiation/RentAgreementUpload.tsx` (if separated) - upload widget
- [ ] `src/app/(admin)/admin/negotiations/[id]/page.tsx` (or sidebar composition module) - checklist integration

### Acceptance Criteria

1. Checklist panel renders all 10 items with correct auto/manual controls.
2. Progress and readiness banner update from live checklist status data.
3. Closure CTA remains disabled until readiness true.
4. Rent agreement upload flow is available from checklist panel.
5. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on checklist UI files and negotiation detail integration file.

### Out of Scope

- Admin queue page implementation
- Escalation cron/jobs
- Proposal editor behavior

---

## T04: Negotiation Status Transitions

### Objective

Wire checklist and closure events into centralized negotiation transitions, including automatic `READY_FOR_CLOSURE`, post-closure `CLOSED`, and manual `FAILED`/`STALLED` reasoned transitions.

### Required Reading

- `lib/negotiation.ts` - transition map helpers from P26-E01
- `notes/04-state-machines.md` - negotiation transitions
- `convex/negotiations.ts` - checklist mutation/query implementation from T01
- `convex/closures.ts` - close-sync hook from T02

### Key Rules

1. Auto-transition to `READY_FOR_CLOSURE` when checklist readiness returns true.
2. Auto-transition to `CLOSED` when linked closure is created/confirmed per agreed flow.
3. Implement admin mutation path to mark `FAILED` or `STALLED` with mandatory reason.
4. Route all transition writes through `VALID_NEGOTIATION_TRANSITIONS` validator.
5. Reject illegal transitions and log reason context for auditability.
6. Add `markExpired` mutation for admin to transition stale negotiations to `EXPIRED`; requires `failure_reason`; valid from any non-terminal status.
7. Treat `READY_FOR_CLOSURE`, `CLOSED`, `FAILED`, and `EXPIRED` as terminal states in transition guards and helper checks.

### Deliverables

- [ ] `convex/negotiations.ts` - transition orchestration for auto/manual state changes and `markExpired` mutation
- [ ] `lib/negotiation.ts` - transition map updates (if needed) for failed/stalled controls

### Acceptance Criteria

1. Readiness completion automatically updates status to `READY_FOR_CLOSURE`.
2. Closure-linked completion updates status to `CLOSED`.
3. Manual `FAILED`/`STALLED` transitions require reason and pass transition validation.
4. Admin can mark stale negotiations `EXPIRED` only from non-terminal states with required reason.
5. Illegal transitions are blocked consistently.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/negotiations.ts` and `lib/negotiation.ts`.

### Out of Scope

- Escalation queue UI and analytics
- Token policy UI
- Proposal message rendering

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-20

### What Was Built

- **T01**: `convex/negotiationChecklist.ts` — 3 functions (updateChecklistItem, waiveItem, getChecklistStatus). 10-item checklist with 4 auto-computed items (terms_agreed, both_parties_signed, token_collected, brokerage_recorded) and 6 manual items with status dropdowns + waive-with-reason. Auto-transition to DOCUMENTATION_IN_PROGRESS on first manual update, auto-transition to READY_FOR_CLOSURE when all items complete. Extended `convex/schema.ts` with 6 manual checklist fields + waive metadata on negotiations table.
- **T02**: Closure gate in `convex/closures.ts` — create mutation validates READY_FOR_CLOSURE when negotiation_id provided. Confirm mutation transitions linked negotiation to CLOSED. Non-negotiation closure path preserved.
- **T03**: 2 UI components — MandatoryChecklist (auto section, manual section with status dropdowns + waive dialogs, progress counter, readiness banner, Create Closure CTA) and RentAgreementUpload (Convex file storage upload + existing file link).
- **T04**: 3 admin mutations in `convex/negotiations.ts` — markFailed, markStalled, markExpired with mandatory failure_reason. Added `failure_reason` field to schema. Upload URL generation for rent agreement files. Updated `lib/negotiation.ts` transition map with broader FAILED/EXPIRED transitions from all non-terminal states + READY_FOR_CLOSURE → CLOSED.

### Key File Locations

- `convex/negotiationChecklist.ts` — Checklist backend (~450 lines)
- `convex/negotiations.ts` — Extended with markFailed/markStalled/markExpired + upload helpers
- `convex/closures.ts` — Closure gate + confirm→CLOSED transition
- `convex/schema.ts` — 6 checklist fields + failure_reason on negotiations table
- `lib/negotiation.ts` — Updated transition map
- `src/components/negotiation/MandatoryChecklist.tsx` — Checklist UI panel
- `src/components/negotiation/RentAgreementUpload.tsx` — File upload widget

### Deviations from Spec

- Added `markStalled` mutation (not in original spec) alongside markFailed/markExpired for completeness — STALLED was referenced in the state machine doc but not explicitly tasked.
- Upload URL generation added to negotiations.ts rather than a separate upload module.

### Gotchas for Next Epic

- `getChecklistStatus` computes auto items live from proposals/signatures/token records — it's a query-time computation, not stored state.
- Readiness auto-transition happens inside updateChecklistItem and waiveItem — the mutation checks readiness after every update.
- The closure gate check is in closures.create — if negotiation_id is provided, status MUST be READY_FOR_CLOSURE.
- `failure_reason` field is on the negotiations table schema — set by markFailed/markStalled/markExpired.
- MandatoryChecklist component is self-contained — it fetches its own data via useQuery. Parent just passes negotiationId.
