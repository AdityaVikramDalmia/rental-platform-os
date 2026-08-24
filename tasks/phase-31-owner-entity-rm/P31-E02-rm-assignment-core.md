---
id: P31-E02
title: RM Assignment Core
phase: 31
status: done
depends_on: ["P31-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
completed_at: 2026-02-19
---

# P31-E02: RM Assignment Core

## Overview

Implement the relationship-manager assignment system linking owners to guards after closure confirmation, including assignment status transitions, reassignment, check-in logging, and admin RM operations UI.

## Prerequisites

- **Read first**: [P31-E01 Completion Summary](P31-E01-owner-entity-foundation.md#completion-summary)
- `owners` table and owner linkage on leads/listings/closures must already exist.

## Task Queue

- [x] P31-E02-T01: Add `owner_rm_assignments` + `rm_check_ins` schema and constants
- [x] P31-E02-T02: Create `convex/rmAssignments.ts` (CRUD, transitions, reassignment)
- [x] P31-E02-T03: Add closure confirmation auto-assignment hook
- [x] P31-E02-T04: Build admin RM dashboard (`/admin/rm-dashboard`)
- [x] P31-E02-T05: Build RM reassignment dialog flow
- [x] P31-E02-T06: Implement RM check-in recording flow

---

## T01: Add `owner_rm_assignments` + `rm_check_ins` Schema and Constants

### Objective

Create RM data tables and constants so assignment state, SLA metadata, and check-in activity become first-class entities.

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - Section 2 schema and transition definitions
- `notes/04-state-machines.md` - transition-table style reference
- `convex/schema.ts` - table/index conventions
- `lib/constants.ts` - enum/transition-map patterns

### Key Rules

1. Add `owner_rm_assignments` and `rm_check_ins` exactly per feature spec field list.
2. Add constants: `RM_ASSIGNMENT_STATUS`, `RM_CHECK_IN_TYPE`, `RM_STATUS_TRANSITIONS`.
3. Add `RM_CHECK_IN_METHOD` and check-in outcome enums if required by implementation for type safety.
4. Keep time fields in Unix ms; all counters are numeric integers.
5. Add indexes exactly as defined in feature spec.

### Deliverables

- [x] `convex/schema.ts` - both RM tables + indexes
- [x] `lib/constants.ts` - RM enums and transition maps
- [x] `notes/13-constants-reference.md` - RM enums documented

### Acceptance Criteria

1. Both RM tables exist with complete field coverage.
2. All specified indexes are present.
3. Transition constants include all allowed RM status moves.
4. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, and `notes/13-constants-reference.md`.

### Out of Scope

- RM mutation/query implementation.
- Auto-assignment trigger wiring.

---

## T02: Create `convex/rmAssignments.ts` (CRUD, Transitions, Reassignment)

### Objective

Implement RM backend operations with transition validation, assignment lifecycle updates, and reassignment orchestration.

### Depends On

P31-E02-T01

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - RM transition and reassignment workflow
- `notes/11-convex-architecture.md` - auth helper + domain module patterns
- `convex/auth.helpers.ts` - permission enforcement

### Key Rules

1. Centralize RM transition validation (`validateRmTransition`) using constant map.
2. Expose core operations: create assignment, update status, reassign, list by RM, list by owner, get detail.
3. Reassignment must transition old assignment to `REASSIGNED` and create new `ACTIVE` assignment atomically.
4. Update denormalized owner current-RM fields during assignment create/reassign.
5. Enforce admin permissions for RM management mutations.

### Deliverables

- [x] `convex/rmAssignments.ts` - core RM module
- [x] `convex/owners.ts` - helper methods used for owner denormalized RM field updates (if needed)

### Acceptance Criteria

1. Invalid status transitions are rejected with clear errors.
2. Reassignment operation writes old/new assignment records correctly.
3. Owner current RM fields stay consistent after assignment changes.
4. Query methods support dashboard data needs (status, due dates, owner/rm filters).
5. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/rmAssignments.ts` and touched helper files.

### Out of Scope

- Closure-triggered auto-assignment.
- UI pages.

---

## T03: Add Closure Confirmation Auto-Assignment Hook

### Objective

Automatically create an RM assignment when closure status transitions to `CONFIRMED`, using the original lead submitter as default RM.

### Depends On

P31-E02-T02

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - auto-assignment trigger rules
- `convex/closures.ts` - closure confirmation mutation
- `convex/leads.ts` - lead ownership/submitted-by fields

### Key Rules

1. Trigger assignment only on `PENDING -> CONFIRMED` closure transition.
2. Resolve RM from `leads.submitted_by_guard_id` and linked guard profile.
3. Set defaults: `status = ACTIVE`, `check_in_frequency_days = 30`, `next_check_in_due = confirmed_at + 30 days`.
4. Prevent duplicate active assignments for same owner (idempotency guard).
5. Preserve closure confirmation behavior; RM creation must fail safely with actionable error handling.

### Deliverables

- [x] `convex/closures.ts` - auto-assignment hook in confirm path
- [x] `convex/rmAssignments.ts` - internal helper for create-on-confirm

### Acceptance Criteria

1. Confirming closure creates one active RM assignment for owner.
2. Duplicate confirms do not create duplicate assignments.
3. Assignment links `source_closure_id` and expected RM references.
4. Owner lifecycle can move to `MANAGED` in same transactional flow (or explicit follow-up mutation).
5. TypeScript compiles.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/closures.ts` and `convex/rmAssignments.ts`.

### Out of Scope

- Reassignment UI.
- Cron SLA workflows.

---

## T04: Build Admin RM Dashboard (`/admin/rm-dashboard`)

### Objective

Build RM operations dashboard showing workload, escalations, and upcoming check-ins.

### Depends On

P31-E02-T02

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - RM dashboard requirements
- `notes/06-admin-panel-ux.md` - admin dashboard/list patterns

### Key Rules

1. Route path must be `src/app/(admin)/admin/rm-dashboard/page.tsx`.
2. Display sections: workload board, escalation queue, upcoming check-ins.
3. Filter by RM, status (`ACTIVE/WARNING/ESCALATED`), and due-date windows.
4. Include direct link-outs to owner detail and reassignment action.
5. Gate page by RM-view permission.

### Deliverables

- [x] `src/app/(admin)/admin/rm-dashboard/page.tsx`
- [x] `src/components/admin/rm/RmWorkloadBoard.tsx` (or equivalent)
- [x] RM dashboard queries in `convex/rmAssignments.ts`

### Acceptance Criteria

1. Dashboard renders all three required sections.
2. Filters correctly update shown assignment rows/cards.
3. Escalated assignments are visibly distinct and actionable.
4. Build succeeds.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on dashboard page/components and RM query files.

### Out of Scope

- Automated escalation cron behavior.
- Owner-authenticated views.

---

## T05: Build RM Reassignment Dialog Flow

### Objective

Implement admin reassignment interaction that transitions assignment status and creates replacement assignment.

### Depends On

P31-E02-T02, P31-E02-T04

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - reassignment workflow steps
- existing admin dialog patterns under `src/components/admin/`

### Key Rules

1. Dialog must collect target guard and mandatory reassignment reason.
2. Submission calls reassignment mutation from `convex/rmAssignments.ts`.
3. On success: old assignment `REASSIGNED`, new assignment `ACTIVE`, owner denormalized RM fields updated.
4. Show optimistic loading/disable states and toast outcomes.
5. Preserve auditability fields (`reassigned_at`, `reassigned_to_guard_id`, reason).

### Deliverables

- [x] `src/components/admin/rm/ReassignRmDialog.tsx`
- [x] wiring in RM dashboard and owner detail entry points

### Acceptance Criteria

1. Admin can reassign from dashboard and owner detail contexts.
2. Dialog blocks submit when reason or target guard is missing.
3. After submit, assignment states and owner current RM fields are consistent.
4. Build succeeds.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on dialog and parent components.

### Out of Scope

- Notification delivery to owner/guards.
- SLA cron automation.

---

## T06: Implement RM Check-In Recording Flow

### Objective

Enable RM check-ins to be recorded with type, method, summary, outcome, and optional satisfaction rating.

### Depends On

P31-E02-T01, P31-E02-T02

### Required Reading

- `notes/features/21-owner-entity-and-rm.md` - `rm_check_ins` schema and check-in intent
- `notes/05-guard-portal-ux.md` (if RM check-in entry is guard-facing)

### Key Rules

1. Add mutation for check-in creation with strict enum validation.
2. On check-in creation, update assignment tracking fields (`last_check_in_at`, `next_check_in_due`, reset/adjust missed counters as per policy).
3. Support both admin-entered and RM-entered check-ins if permissions allow.
4. Ensure check-ins are queryable by assignment, owner, and RM.

### Deliverables

- [x] `convex/rmAssignments.ts` (or `convex/rmCheckIns.ts`) - check-in create/list queries
- [x] UI entry point for logging check-ins (owner detail and/or RM dashboard)

### Acceptance Criteria

1. Check-ins persist with all required fields and valid enum values.
2. Assignment tracking fields update immediately after check-in.
3. Check-ins appear in owner detail "Check-ins" tab in reverse chronological order.
4. TypeScript compiles and build succeeds.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed backend and UI files.

### Out of Scope

- SLA cron processing.
- Performance score computation.

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-19

### What Was Built

- Implemented RM assignment domain logic with transition validation, reassignment orchestration, check-in recording, SLA/performance automation hooks, and closure-confirmation auto-assignment integration.
- Exposed admin-callable RM operations for manual assignment creation and status transitions (`createAssignment`, `updateStatus`) while preserving system-only internal creation for closure-driven auto-assignment.
- Upgraded RM dashboard query contract to support server-side status, RM, and due-window filtering so pagination no longer drops rows under client-side post-filtering.

### Key File Locations

- `convex/rmAssignments.ts`
- `convex/closures.ts`
- `src/app/(admin)/admin/rm-dashboard/page.tsx`
- `src/components/admin/rm/ReassignRmDialog.tsx`
- `src/components/admin/rm/CheckInDialog.tsx`

### Deviations from Spec

- Kept `createAssignmentInternal` for system-triggered closure hooks; admin UI and tooling should use public `createAssignment` instead.
- `listActive` now enforces active-status-only filters (`ACTIVE/WARNING/ESCALATED`) and accepts optional `rm_guard_id` and `due_window` for dashboard-safe pagination.

### Gotchas for Next Epic

- Reassignment must always go through `reassign` (not `updateStatus`) to keep old/new assignment pair creation and owner denormalized RM fields consistent.
- Due-window filtering intentionally excludes assignments missing `next_check_in_due`.
- Any future dashboard filters should be added to `rmAssignments.listActive` first, then mirrored in UI controls.
