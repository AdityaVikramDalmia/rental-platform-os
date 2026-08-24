---
id: P30-E03
title: Document Collection & Society Liaison
phase: 30
status: done
depends_on: ["P30-E01", "P30-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P30-E03: Document Collection & Society Liaison

## Overview

Add end-to-end document operations for owner docs, tenant docs, society submissions, and regulatory compliance tracking by extending the checklist model introduced in P30-E02. This epic adds backend lifecycle controls, SLA-aware regulatory tracking, and mobile-first OPS collection surfaces so field teams can collect, verify, and resolve documentation gaps before move-in.

## Prerequisites

- **Read first**: [P30-E01 Completion Summary](P30-E01-ops-persona-foundation.md#completion-summary) — OPS permissions, routing, and persona-specific auth constraints.
- **Read first**: [P30-E02 Completion Summary](P30-E02-checklist-engine.md#completion-summary) — checklist template/instance schema and visit integration patterns reused in this epic.
- `notes/features/07-closure-and-payouts.md` — "Negotiation Gate" + "10 Mandatory Gate Conditions" sections (document gating expectations before closure).
- `notes/11-convex-architecture.md` — "File Upload Pattern" + "Function Layer Architecture" sections.

## Task Queue

- [x] P30-E03-T01: Document Schema & Constants
- [x] P30-E03-T02: Document Collection Backend
- [x] P30-E03-T03: Society Submission & Regulatory Backend
- [x] P30-E03-T04: Ops Document Collection UI
- [x] P30-E03-T05: Move-in Handover Checklist

---

## T01: Document Schema & Constants

### Objective

Add schema and enum foundations for document requirement tracking and regulatory lifecycle management, including checklist-type extensions required for document and society workflows.

### Required Reading

- `notes/10-convex-schema.md` — "Full Schema" + "Index Design Rationale" sections
- `notes/13-constants-reference.md` — "Type Enums" + "Status Enums" sections
- `notes/04-state-machines.md` — "Validation Pattern" section
- `tasks/phase-30-field-ops-platform/P30-E02-checklist-engine.md` — T01 data model decisions to reuse

### Key Rules

1. Add `document_requirements` and `regulatory_items` tables to `convex/schema.ts` with `is_deleted: v.boolean()` soft-delete fields.
2. Extend checklist type enum set from E02 to include `DOCUMENT_COLLECTION` and `SOCIETY_SUBMISSION` while preserving existing values.
3. Add exact enums for `requirement_type`, `document item status`, `overall_status`, and `regulatory item status` in `lib/constants.ts`.
4. Add indexes for required retrieval paths: by `lead_id`, `listing_id`, `closure_id`, `assigned_to`, `overall_status`, and `sla_deadline` where applicable.
5. Keep all deadlines/timestamps as Unix ms; all uploaded files as `v.id("_storage")`.
6. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/schema.ts` — Add `document_requirements` and `regulatory_items` tables, checklist_type extension, validators, and indexes.
- [ ] `lib/constants.ts` — Add document and regulatory enums/constants used by backend and UI.
- [ ] `notes/13-constants-reference.md` — Document new Phase 30 document/regulatory constants.

### Acceptance Criteria

1. New document/regulatory tables compile with strict validators and required optional linkage fields.
2. `checklist_type` union supports `DOCUMENT_COLLECTION` and `SOCIETY_SUBMISSION` in addition to E02 types.
3. Document item model supports per-item upload, collection metadata, verification metadata, and rejection notes.
4. Regulatory table supports legal SLA fields (`sla_deadline`, `reference_number`, attached documents, status updates).
5. All new tables include `is_deleted` and are query-indexed for ops/admin workflows.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, and `notes/13-constants-reference.md`.

### Out of Scope

- CRUD mutations/queries for document operations
- OPS or admin document interfaces
- Move-in handover template seeding

---

## T02: Document Collection Backend

### Objective

Implement backend CRUD and status transitions for owner/tenant/society document requirement items, including upload linking, verification actions, and lead/listing/closure scoped queries.

### Required Reading

- `notes/11-convex-architecture.md` — "Function Layer Architecture" + "Auth Helper Layer" + "File Upload Pattern"
- `notes/03-roles-and-permissions.md` — "Visit Management" + "Closure & Payout" sections
- `notes/features/07-closure-and-payouts.md` — "Admin Flow: Create Closure" section
- `notes/04-state-machines.md` — "Validation Pattern" section

### Key Rules

1. Implement document requirement functions in `convex/documents.ts` and import `mutation`/`query` from `./functions`.
2. Enforce document item status transitions; specifically block `PENDING -> VERIFIED` unless item is first `COLLECTED`.
3. Implement upload URL generation and update mutations with file constraints: max 10MB, allowed types JPEG/PNG/PDF.
4. Include mutations for create requirement bundle, collect item, verify item, reject item, mark NA, and update notes.
5. Expose queries by `lead_id`, `listing_id`, and `closure_id`, plus assigned-worklist queries for ops users.
6. Update `overall_status` deterministically from item statuses (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETE`, `BLOCKED`).
7. Add `document_requirements` to `AUDITED_TABLES` in `convex/functions.ts`.

### Deliverables

- [ ] `convex/documents.ts` — Document requirement mutations/queries, transition validation, and upload URL mutation.
- [ ] `convex/functions.ts` — Add `document_requirements` to audit-trigger table list.
- [ ] `convex/schema.ts` — Any backend-driven schema/index refinements required for implemented query paths.

### Acceptance Criteria

1. Requirement bundles can be created and linked to lead/listing/closure entities.
2. Item-level collect/verify/reject/NA flows enforce transition guards.
3. Upload flow stores `storage_id` and collection metadata on the correct requirement item.
4. Requirement-level query surfaces support all three context lookups (lead/listing/closure) and assignee views.
5. `overall_status` auto-updates correctly as item states change.
6. Audit logs are generated for document requirement updates.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/documents.ts`, `convex/functions.ts`, and updated schema files.

### Out of Scope

- Regulatory SLA logic and cron escalation
- Society submission specialization
- OPS mobile UI

---

## T03: Society Submission & Regulatory Backend

### Objective

Add backend flows for society submission tracking and regulatory compliance items (police verification, rent registration, society NOC, stamp duty) including legal SLA deadlines and enforcement utilities.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Negotiation Gate" + "10 Mandatory Gate Conditions"
- `notes/04-state-machines.md` — "Validation Pattern"
- `notes/11-convex-architecture.md` — "Cron Jobs" + "Function Layer Architecture"
- `notes/13-constants-reference.md` — document/regulatory enums added in T01

### Key Rules

1. Implement regulatory flows in a dedicated module (`convex/societyLiaison.ts`) with strict transition validation.
2. Set legal SLA defaults automatically: police verification = 7 days, rent registration = 60 days (both in Unix ms).
3. Implement CRUD/status mutations for `regulatory_items`, including references, notes, linked docs, and manual unblock flow.
4. Implement query helpers for overdue/at-risk regulatory items based on current time vs `sla_deadline`.
5. Add `regulatory_items` to `AUDITED_TABLES` and enforce permission checks for admin/ops flows.
6. Add scheduled enforcement/escalation hooks in `convex/crons.ts` for deadline audits (notification behavior can remain no-op/stub for now, but query/mutation hooks must exist).
7. Ensure society NOC can be tracked independently and linked to move-in readiness checks.

### Deliverables

- [ ] `convex/societyLiaison.ts` — Regulatory and society-submission mutations/queries with SLA logic.
- [ ] `convex/functions.ts` — Add `regulatory_items` to audit-trigger table list.
- [ ] `convex/crons.ts` — Add regulatory SLA audit cron wiring.
- [ ] `convex/documents.ts` — Integrate regulatory linkage where document requirement and regulatory records intersect.

### Acceptance Criteria

1. Regulatory items can be created, updated, and progressed through valid states only.
2. SLA deadlines default correctly for police verification (7d) and rent registration (60d).
3. Overdue/at-risk queries return items based on `sla_deadline` and status.
4. Society NOC and stamp duty items are represented in the same regulatory lifecycle model.
5. Regulatory updates are audited via trigger-enabled mutations.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/societyLiaison.ts`, `convex/crons.ts`, `convex/functions.ts`, and `convex/documents.ts`.

### Out of Scope

- Push/email SLA reminders
- Admin dashboard analytics for regulatory SLA trends
- PDF parsing/auto-verification intelligence

---

## T04: Ops Document Collection UI

### Objective

Create a mobile-first OPS document collection interface to collect files, view requirement status, mark verification outcomes, and track regulatory blockers from field workflows.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Responsive Behavior" + "Loading & Error States" (mobile UX conventions reused for OPS)
- `notes/06-admin-panel-ux.md` — "Table Patterns" (status badge and list conventions)
- `notes/features/07-closure-and-payouts.md` — "Admin Flow: Create Closure" + "Negotiation Gate"
- `tasks/phase-30-field-ops-platform/P30-E01-ops-persona-foundation.md` — OPS route/layout decisions

### Key Rules

1. Build under OPS route group using mobile-first card/list layout; keep touch targets >= 44px.
2. Use shadcn/ui components for forms, selects, status toggles, and dialogs.
3. Provide context switching between owner docs, tenant docs, society submissions, and regulatory items.
4. Support document upload, status update, and verification/rejection notes inline in the workflow.
5. Show SLA urgency indicators for regulatory items with clear due-date messaging.
6. Use toast feedback for mutation outcomes and disable actions while pending.

### Deliverables

- [ ] `src/app/(ops)/ops/documents/page.tsx` — OPS document collection page with requirement-type segmentation.
- [ ] `src/app/(ops)/ops/documents/components/document-requirements-list.tsx` — Itemized checklist UI with status markers.
- [ ] `src/app/(ops)/ops/documents/components/document-upload-sheet.tsx` — Upload interaction (JPEG/PNG/PDF) with notes.
- [ ] `src/app/(ops)/ops/documents/components/regulatory-sla-card.tsx` — Regulatory item SLA summary and update actions.
- [ ] `src/app/(ops)/ops/documents/components/document-item-actions.tsx` — Collect/verify/reject/NA action controls.

### Acceptance Criteria

1. OPS users can load document requirements linked to lead/listing/closure contexts.
2. OPS users can upload files and transition item statuses through valid states.
3. Rejection and verification notes are captured and rendered back in the list.
4. Regulatory items display due dates and overdue indicators.
5. UI is functional on mobile viewport without desktop-only dependencies.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all new OPS document UI files.

### Out of Scope

- Admin review pages for OPS document performance
- OCR/document extraction
- Offline sync queue for uploads

---

## T05: Move-in Handover Checklist

### Objective

Seed and implement the move-in handover checklist workflow (meter readings, key inventory, appliance condition, furniture inventory) using the checklist engine from E02, then expose it in OPS mobile execution flow.

### Required Reading

- `tasks/phase-30-field-ops-platform/P30-E02-checklist-engine.md` — template and checklist execution architecture
- `notes/features/07-closure-and-payouts.md` — "Negotiation Gate" section
- `notes/10-convex-schema.md` — checklist table definitions
- `convex/seed.ts` — idempotent seed pattern

### Key Rules

1. Add a default `MOVE_IN_HANDOVER` template with 4 sections exactly: Meter Readings, Key Inventory, Appliance Condition, Furniture Inventory.
2. Meter and condition items must support photo evidence and typed values (numbers/conditions/counts) as needed.
3. Reuse checklist instance lifecycle from E02; do not create a parallel handover execution engine.
4. OPS handover UI must support per-item completion and final submission tied to checklist instance status.
5. Keep handover checklist linkage compatible with closure readiness checks and regulatory completion state.
6. Seed logic must remain idempotent and version-safe.

### Deliverables

- [ ] `lib/checklists/move-in-handover-template.ts` — Canonical move-in handover template payload.
- [ ] `convex/seed.ts` — Add idempotent seeding for `MOVE_IN_HANDOVER` template.
- [ ] `convex/checklists.ts` — Ensure checklist APIs support `MOVE_IN_HANDOVER` execution in OPS context.
- [ ] `src/app/(ops)/ops/handover/[id]/page.tsx` — OPS handover execution page.
- [ ] `src/app/(ops)/ops/handover/components/handover-checklist-form.tsx` — Handover-specific checklist execution UI.

### Acceptance Criteria

1. `MOVE_IN_HANDOVER` template is seeded and queryable as active template.
2. OPS can execute and submit handover checklist instances end-to-end.
3. Meter, key, appliance, and furniture sections all render and persist responses correctly.
4. Required photo/typed fields are validated before submission.
5. Submission transitions instance to review-ready state using checklist lifecycle rules.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npx convex run seed:init
npm run build
```

Run `lsp_diagnostics` on handover template, seed integration, checklist backend updates, and OPS handover UI files.

### Out of Scope

- Automated reconciliation against inventory history
- Legal agreement generation from handover data
- Analytics/scorecards for handover quality
