---
id: P30-E02
title: Property Inspection Checklist Engine
phase: 30
status: done
depends_on: ["P30-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P30-E02: Property Inspection Checklist Engine

## Overview

Build a configurable checklist engine that upgrades visit execution from outcome-only capture to structured property inspection. Admins attach template + depth (LIGHT/MEDIUM/FULL) at schedule time, guards complete room-by-room checklists with photo evidence, and admins review checklist quality before approval. Architecture must remain online-first now while keeping state boundaries compatible with later offline sync.

## Prerequisites

- **Read first**: [P30-E01 Completion Summary](P30-E01-ops-persona-foundation.md#completion-summary) — OPS persona/auth foundations, route groups, and permission constants required by this epic.
- `notes/features/06-visit-management.md` — "Visit Execution Flow" + "Admin Flow: Schedule a Visit" sections (integration points with existing visit lifecycle).
- `notes/11-convex-architecture.md` — "Function Layer Architecture" + "File Upload Pattern" sections (mutation wrappers, storage upload flow, and action boundaries).

## Task Queue

- [x] P30-E02-T01: Checklist Schema & Constants
- [x] P30-E02-T02: Checklist Template Seeding
- [x] P30-E02-T03: Checklist Backend Mutations
- [x] P30-E02-T04: Checklist Mobile UI
- [x] P30-E02-T05: Admin Checklist Review
- [x] P30-E02-T06: Visit Execution Integration

---

## T01: Checklist Schema & Constants

### Objective

Define the checklist data model and enum surface so all backend and frontend checklist behavior is type-safe and state-machine constrained from day one.

### Required Reading

- `notes/10-convex-schema.md` — "Full Schema" + "Index Design Rationale" sections
- `notes/13-constants-reference.md` — "Status Enums" + "Type Enums" + "Audit Action Strings" sections
- `notes/04-state-machines.md` — "Validation Pattern" section
- `notes/11-convex-architecture.md` — "Function Layer Architecture" section

### Key Rules

1. Add both `checklist_templates` and `checklist_instances` to `convex/schema.ts`, and include `is_deleted: v.boolean()` on both tables for soft delete.
2. Use exact enum values for checklist depth (`LIGHT`, `MEDIUM`, `FULL`), checklist status (`ASSIGNED`, `IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `REVISION_REQUESTED`), condition rating (`EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `NA`), and item type (`CONDITION`, `CHECKBOX`, `TEXT`, `NUMBER`, `PHOTO`, `PHOTO_CONDITION`).
3. Store all timestamps in Unix milliseconds (`v.number()`), and all photos as Convex storage IDs (`v.id("_storage")`).
4. Add indexes for operational paths: at minimum `checklist_instances.by_status`, `checklist_instances.by_assigned_to`, `checklist_instances.by_visit_id`, and `checklist_templates.by_depth_and_active`.
5. Add new exported constants/types in `lib/constants.ts`; do not duplicate enum literals in feature modules.
6. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/schema.ts` — Add `checklist_templates` and `checklist_instances` tables, validators, and indexes with `is_deleted`.
- [ ] `lib/constants.ts` — Add `CHECKLIST_TYPE`, `CHECKLIST_DEPTH`, `CHECKLIST_STATUS`, `CONDITION_RATING`, and `CHECKLIST_ITEM_TYPE` exports.
- [ ] `notes/13-constants-reference.md` — Add Phase 30 checklist enums/constants so docs stay in sync with code.

### Acceptance Criteria

1. Both new tables exist in `convex/schema.ts` and compile with full validators.
2. `checklist_templates.sections[].items[]` supports all required item types and depth-level filtering fields.
3. `checklist_instances.responses[]` supports typed values + photo metadata (`taken_at`, optional GPS coordinates).
4. All required checklist enums are available from `lib/constants.ts` and consumed by schema validators.
5. `is_deleted` is present on both new checklist tables.
6. Required indexes exist for review queue and visit-linked lookups.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, and `notes/13-constants-reference.md`.

### Out of Scope

- Seeding default checklist templates
- Checklist mutation/query business logic
- Guard/admin UI integration

---

## T02: Checklist Template Seeding

### Objective

Seed reusable default property inspection templates for LIGHT, MEDIUM, and FULL depth profiles with complete section/item definitions matching the approved field-ops taxonomy.

### Required Reading

- `notes/features/06-visit-management.md` — "Visit Execution Flow" section
- `notes/10-convex-schema.md` — "Full Schema" section (template table shape)
- `notes/13-constants-reference.md` — checklist enum values added in T01
- `convex/seed.ts` — full file (idempotent seed pattern)

### Key Rules

1. Seed exactly 3 property inspection templates (`LIGHT`, `MEDIUM`, `FULL`) as active templates.
2. Keep template payload definitions in a dedicated shared file so seeding and tests consume one source of truth.
3. Ensure item counts are depth-appropriate: LIGHT (~20), MEDIUM (~40), FULL (~75) with room-by-room organization.
4. All item IDs and section IDs must be deterministic strings (no runtime random IDs) to keep instance-response mapping stable.
5. Seed logic must be idempotent (re-running `seed:init` updates or skips safely without duplicates).
6. Include photo-required flags per item exactly as required (mandatory for condition evidence, optional for amenity captures).

### Deliverables

- [ ] `lib/checklists/property-inspection-templates.ts` — Canonical LIGHT/MEDIUM/FULL template payloads with section/item definitions.
- [ ] `convex/checklistTemplates.ts` — Internal helper/query layer to upsert template payloads and expose template lookup APIs.
- [ ] `convex/seed.ts` — Integrate checklist template seeding into existing idempotent bootstrap flow.

### Acceptance Criteria

1. Running seed creates/updates all three default property inspection templates.
2. Templates are queryable by depth and `is_active`.
3. Section ordering and item ordering are deterministic and preserved.
4. FULL template extends MEDIUM coverage; MEDIUM extends LIGHT coverage (no regression in lower-depth essentials).
5. No duplicate templates are created on repeated seed runs.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npx convex run seed:init
```

Run `lsp_diagnostics` on `lib/checklists/property-inspection-templates.ts`, `convex/checklistTemplates.ts`, and `convex/seed.ts`.

### Out of Scope

- Checklist instance lifecycle mutations
- Visit-schedule UI attachment of templates
- Guard checklist execution UI

---

## T03: Checklist Backend Mutations

### Objective

Implement checklist lifecycle and response mutations for guard execution and admin review, including completeness scoring and strict status transition validation.

### Required Reading

- `notes/11-convex-architecture.md` — "Function Layer Architecture" + "Auth Helper Layer" + "File Upload Pattern"
- `notes/04-state-machines.md` — "Validation Pattern"
- `notes/03-roles-and-permissions.md` — "Visit Management" + "Guard Permissions (Hardcoded — not RBAC)"
- `notes/10-convex-schema.md` — checklist tables from T01

### Key Rules

1. Implement mutations in `convex/checklists.ts` and import `mutation`/`internalMutation` from `./functions` so audit triggers apply.
2. Enforce checklist state machine exactly: `ASSIGNED -> IN_PROGRESS -> SUBMITTED -> UNDER_REVIEW -> (APPROVED|REJECTED|REVISION_REQUESTED)` and `REVISION_REQUESTED -> IN_PROGRESS`.
3. Implement these core mutations: `createInstance`, `startChecklist`, `updateResponse`, `submitChecklist`, `reviewChecklist`, and a shared completeness calculator.
4. `updateResponse` must validate per-item-type payloads (e.g., condition required for `CONDITION`, photo required for `PHOTO` and `PHOTO_CONDITION` when configured).
5. Enforce media constraints in mutation validation: max 10MB per file, allowed MIME types JPEG/PNG.
6. Completeness score is deterministic `0-100` based on required items completion and required-photo compliance.
7. Add checklist tables to `AUDITED_TABLES` in `convex/functions.ts`.

### Deliverables

- [ ] `convex/checklists.ts` — Checklist lifecycle mutations, review flows, helper validators, and completeness score logic.
- [ ] `convex/functions.ts` — Add `checklist_templates` and `checklist_instances` to `AUDITED_TABLES`.
- [ ] `convex/schema.ts` — Any mutation-driven schema refinements required after implementation (indexes/optional fields only; no drift from approved model).

### Acceptance Criteria

1. All required mutations exist and are callable through the generated API.
2. Invalid status transitions are rejected with clear errors.
3. Required items and required photos block submission until satisfied.
4. Review mutation supports `APPROVED`, `REJECTED`, and `REVISION_REQUESTED` outcomes with review notes.
5. Completeness score updates on response mutation and on submission.
6. Checklist tables generate audit log entries through trigger wrapping.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/checklists.ts`, `convex/functions.ts`, and `convex/schema.ts`.

### Out of Scope

- Guard checklist UI rendering
- Admin checklist review pages
- Visit schedule dialog integration

---

## T04: Checklist Mobile UI

### Objective

Create a mobile-first, room-by-room checklist execution interface for guards with progress tracking, typed response controls, photo evidence capture, and GPS/timestamp metadata capture hooks.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Flow 5: My Visits (`/guard/visits`)" + "Responsive Behavior"
- `notes/features/06-visit-management.md` — "Visit Execution Flow" + "Visit Detail View (Guard)"
- `notes/11-convex-architecture.md` — "File Upload Pattern"
- `src/app/(guard)/guard/visits/components/visit-execution.tsx` — full file (existing execution surface)

### Key Rules

1. Build UI with shadcn/ui inputs only (no native date/time/checkbox/radio/select controls).
2. Keep UX mobile-first: swipeable/step-based sections, large touch targets, and sticky progress/footer actions.
3. Capture photo metadata at client submit time (`taken_at`, optional GPS lat/lng) and pass through mutation payload.
4. Keep outcome selection separate from checklist response data model.
5. Structure component state so local draft state is isolated and serializable (future offline sync compatibility), even though network submission is online-only in this epic.
6. Use `sonner` toasts for failure/success and disable submit while mutation is pending.

### Deliverables

- [ ] `src/app/(guard)/guard/visits/components/checklist-execution.tsx` — Primary room-by-room checklist execution component with progress.
- [ ] `src/app/(guard)/guard/visits/components/checklist-item-field.tsx` — Typed input renderer for checklist item variants.
- [ ] `src/app/(guard)/guard/visits/components/checklist-photo-input.tsx` — Camera/file capture UI with metadata capture and upload wiring.
- [ ] `src/app/(guard)/guard/visits/[id]/page.tsx` — Integrate checklist execution component into visit detail route.

### Acceptance Criteria

1. Guard can navigate section-by-section and see completion progress.
2. All item types render with the correct control and validation behavior.
3. Photo-required items cannot be marked complete without at least one uploaded photo.
4. GPS/timestamp metadata fields are included when available.
5. Submission CTA remains disabled until required checklist conditions are met.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all new/changed guard visit checklist components.

### Out of Scope

- Admin review workflow
- Offline queue/sync engine
- Document collection checklist types

---

## T05: Admin Checklist Review

### Objective

Implement admin review surfaces for submitted checklists: queue/listing, full response detail (including photos), and explicit approve/reject/revision actions.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Table Patterns" + "Flow 4: Schedule Visit"
- `notes/03-roles-and-permissions.md` — "Visit Management" permissions
- `notes/features/06-visit-management.md` — "Admin Flow: Monitor Visits"
- `src/app/(admin)/admin/visits/page.tsx` — existing table/filter conventions

### Key Rules

1. Admin review queue must be filterable by checklist status (`SUBMITTED`, `UNDER_REVIEW`, `REVISION_REQUESTED`) and assignee.
2. Detail view must render section/item response data in template order and include image previews for uploaded evidence.
3. Review actions must call backend `reviewChecklist` mutation with required review notes for reject/revision flows.
4. Review actions are permission-gated (visit/admin workflow permission checks only; no guard-access bleed-through).
5. Use paginated query patterns already established in admin tables.
6. Keep review UX read-only for template structure (admin can review responses, not edit template in this epic).

### Deliverables

- [ ] `src/app/(admin)/admin/checklists/page.tsx` — Admin checklist review queue page.
- [ ] `src/app/(admin)/admin/checklists/components/checklist-review-table.tsx` — Queue table with filters, pagination, and status badges.
- [ ] `src/app/(admin)/admin/checklists/components/checklist-review-detail.tsx` — Full checklist response detail renderer with photo evidence.
- [ ] `src/app/(admin)/admin/checklists/components/checklist-review-actions.tsx` — Approve/reject/revision action controls.
- [ ] `convex/checklists.ts` — Admin review/read queries required by the new review UI.

### Acceptance Criteria

1. Submitted checklists appear in an admin queue and open into detailed response views.
2. Admin can approve, reject, or request revision with correct state transitions.
3. Review notes persist and are visible on subsequent reads.
4. Queue and detail views are consistent with shadcn-based admin table/panel patterns.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on the new admin checklist pages/components and updated `convex/checklists.ts`.

### Out of Scope

- Checklist template authoring UI
- Analytics dashboards for checklist quality trends
- Incentive score coupling

---

## T06: Visit Execution Integration

### Objective

Wire checklists directly into visit scheduling and visit execution so checklist assignment, completion, and submission are first-class parts of the visit lifecycle.

### Required Reading

- `notes/features/06-visit-management.md` — "Admin Flow: Schedule a Visit" + "Visit Execution Flow" + "Business Rules"
- `notes/04-state-machines.md` — "Visit Status" section
- `src/app/(admin)/admin/visits/components/schedule-visit-dialog.tsx` — full file
- `convex/visits.ts` — full file

### Key Rules

1. Add optional checklist attachment controls to visit scheduling (template + depth).
2. On visit start, if checklist is attached, ensure checklist instance exists and transitions to `IN_PROGRESS` with visit execution.
3. On visit completion, outcome (`INTERESTED`/`NOT_INTERESTED`/`FOLLOWUP`) remains independent from checklist result; both must persist.
4. Block visit completion while required checklist is incomplete, unless no checklist was attached.
5. Ensure checklist submission and visit completion are transactionally safe (no partial success where visit completes but checklist submission fails).
6. Keep existing visit state machine behavior intact for no-checklist visits.

### Deliverables

- [ ] `convex/visits.ts` — Add checklist attachment fields/logic in schedule + execute + complete flows.
- [ ] `src/app/(admin)/admin/visits/components/schedule-visit-dialog.tsx` — Add template/depth selectors when scheduling a visit.
- [ ] `src/app/(guard)/guard/visits/components/visit-execution.tsx` — Embed checklist execution gating into completion flow.
- [ ] `src/app/(guard)/guard/visits/components/outcome-selector.tsx` — Ensure outcome capture remains separate from checklist state.

### Acceptance Criteria

1. Admin can schedule a visit with or without a checklist attachment.
2. Guard sees checklist execution UI during visit execution only when checklist is attached.
3. Guard cannot complete checklist-required visits with missing required checklist data.
4. Visit outcome and checklist submission both persist on successful completion.
5. Non-checklist visits keep existing behavior unchanged.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/visits.ts` and all modified visit scheduling/execution components.

### Out of Scope

- Offline-first sync implementation
- Document collection workflows
- Incentive scoring logic updates
