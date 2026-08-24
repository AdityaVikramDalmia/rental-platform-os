---
id: P08-E02
title: Admin Closure UI
phase: 8
status: done
depends_on: ["P08-E01", "P04-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P08-E02: Admin Closure UI

## Overview

Build the admin closure workspace end-to-end: activate the Closures sidebar entry, ship `/admin/closures` with real-time table + URL-synced filters, implement the record-closure dialog with document uploads, add reusable status action controls, and deliver `/admin/closures/[id]` detail/edit behavior with strict status gating (editable only in `PENDING`, read-only in terminal states).

## Prerequisites

- **Read first**: [P08-E01 Completion Summary](P08-E01-closure-backend.md#completion-summary) — all closure APIs used here (`list`, `getById`, `getByLeadId`, `create`, `update`, `confirm`, `cancel`, `generateUploadUrl`) are expected to exist.
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — reuse established admin sidebar/table/filter/detail patterns.
- Admin layout/sidebar conventions from earlier phases are already in place and should be reused, not redesigned.

## Task Queue

- [ ] P08-E02-T01: Admin Sidebar + Closure Board Page Shell
- [ ] P08-E02-T02: Record Closure Dialog
- [ ] P08-E02-T03: Document Upload Component
- [ ] P08-E02-T04: Closure Filters + Status Actions
- [ ] P08-E02-T05: Closure Detail/Edit Page

---

## T01: Admin Sidebar + Closure Board Page Shell

### Objective

Enable closure navigation in the admin sidebar and create the `/admin/closures` board shell with real-time paginated data, required columns, record-action entry point, and row-level navigation to detail.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Admin Panel UI" section (`/admin/closures` columns, filters, actions)
- `notes/06-admin-panel-ux.md` — "Flow 5: Process Closure & Payout"
- `tasks/phase-07-visit-management/P07-E03-admin-visit-board-ui.md` — T01 structure for latest admin board shell pattern
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — T01/T02 admin sidebar + table shell conventions
- `notes/13-constants-reference.md` — `closures.view` permission and closure status display semantics

### Key Rules

1. Update `src/app/(admin)/admin-layout-client.tsx` to make the existing `Closures` nav item active, use a file-style icon (`FileText` from `lucide-react`), and RBAC-gate it by `closures.view` (do not hardcode access).
2. Keep nav ordering as: Visits -> Closures -> Payouts placeholder.
3. Route file is `src/app/(admin)/admin/closures/page.tsx` and follows existing desktop-first admin page shell conventions.
4. Board data uses `usePaginatedQuery(api.closures.list, args, { initialNumItems: 20 })` with Convex reactivity.
5. Table columns are exactly: Lead (Building + Flat), Society (lead join), Move-In Date (IST formatted), Commission (INR from paise), Brokerage T/O (INR from paise), Status, Guard, Payout Status (`Not Created` when no payout exists). Default sort is newest first (`_creationTime` descending).
6. Status cell must consume `ClosureStatusBadge` from `src/components/shared/closure-status-badge.tsx` (already created in P08-E01-T01).
7. Commission and brokerage values are displayed in rupees using `formatINR()` from `lib/money.ts`; backend values remain paise.
8. Add top-right primary button label exactly `Record Closure` and wire it to open T02 dialog.
9. Row click navigates to `/admin/closures/[id]` and page includes T04 filter bar mount point.

### Deliverables

- [ ] `src/app/(admin)/admin-layout-client.tsx` — Closures nav item enabled and gated by `PERMISSIONS.CLOSURES_VIEW`, ordered after Visits and before Payouts.
- [ ] `src/app/(admin)/admin/closures/page.tsx` — closures board page shell with title, `Record Closure` trigger, filters mount, paginated data wiring.
- [ ] `src/app/(admin)/admin/closures/components/closure-table.tsx` — table rendering with required columns, row click routing, load-more behavior.

### Acceptance Criteria

1. `src/app/(admin)/admin-layout-client.tsx` contains an available `Closures` nav item with `href: "/admin/closures"`, `requiredPermission: PERMISSIONS.CLOSURES_VIEW`, and `FileText` icon.
2. In `src/app/(admin)/admin-layout-client.tsx`, `Closures` appears after `Visits` and before `Payouts`.
3. `/admin/closures` renders desktop-first shell with title, `Record Closure` button, filters area, and closures table.
4. `src/app/(admin)/admin/closures/page.tsx` uses `usePaginatedQuery(api.closures.list, ..., { initialNumItems: 20 })`.
5. `src/app/(admin)/admin/closures/components/closure-table.tsx` renders all 8 required columns and uses `ClosureStatusBadge` from `src/components/shared/closure-status-badge.tsx`.
6. Move-In Date in `src/app/(admin)/admin/closures/components/closure-table.tsx` is displayed in IST and Payout Status shows literal `Not Created` when no linked payout exists.
7. Money columns in `src/app/(admin)/admin/closures/components/closure-table.tsx` render via `formatINR(paise)` directly (example: `formatINR(2500000)` displays `₹25,000`). Do NOT double-convert with `paiseToRupees()` — `formatINR()` handles conversion internally.
8. Clicking any data row in `src/app/(admin)/admin/closures/components/closure-table.tsx` navigates to `/admin/closures/[id]`.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on `/admin/closures`: sidebar visibility by permission, column order, row navigation, and `Record Closure` button visibility.

### Out of Scope

- Record-closure form internals and submission (T02)
- Document upload implementation (T03)
- Filter/action logic implementation (T04)
- Detail/edit rendering and status-gated editing (T05)

---

## T02: Record Closure Dialog

### Objective

Implement the closure creation dialog with validated form fields, VERIFIED-lead-only selection, one-closure-per-lead guardrail, and mutation wiring for `api.closures.create`.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Admin Flow: Create Closure", "Closure Form", and Business Rules #1, #2, #11
- `notes/06-admin-panel-ux.md` — Flow 5 closure step UX
- `notes/10-convex-schema.md` — `closures` table fields and optionality
- `notes/11-convex-architecture.md` — file upload 3-step pattern (`generateUploadUrl` -> `POST` -> `storageId`)
- `notes/13-constants-reference.md` — `closures.create` permission and closure status semantics

### Key Rules

1. Create `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` using shadcn `Dialog`, `react-hook-form`, and `zod`.
2. Lead selector must be searchable and limited to VERIFIED leads; each option displays Building + Flat + Society. Note: lead queries require `leads.view` permission — all roles with `closures.create` should also have `leads.view` (Super Admin, Ops Agent do). If data fails to load, show an error state in the selector, don't crash.
3. On lead selection, call/check `api.closures.getByLeadId`; if a closure exists, block creation UX and show a `View Closure` link to `/admin/closures/[id]`.
4. Fields must match spec exactly: DemoRentals Deal ID (optional), Move-In Date (required), Commission Amount (optional), Brokerage Tenant Side (optional), Brokerage Owner Side (optional), Notes (optional).
5. Money inputs are entered as rupees in UI and converted with `rupeesToPaise()` before mutation payload.
6. Rent agreement uses single-file document input and additional documents use multi-file + per-file name labels via T03 `document-uploader`.
7. Upload flow follows pattern: call `api.closures.generateUploadUrl` -> upload file via `fetch` POST -> collect `storageId` -> include storage IDs in `api.closures.create` payload.
8. Save action calls `api.closures.create`; success toast text must be exactly `Closure recorded!`, dialog closes, and board reflects new data reactively.
9. Errors show `sonner` error toast and keep the dialog open for corrections.
10. Zod validations: `move_in_date` required; money fields must be non-negative if present.

### Deliverables

- [ ] `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` — full dialog form, lead selector, one-closure guardrail, create mutation wiring.
- [ ] `src/app/(admin)/admin/closures/page.tsx` — `Record Closure` button open/close integration and dialog mount.

### Acceptance Criteria

1. `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` renders all required fields with exact labels from the closure form spec.
2. Lead selector in `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` only shows VERIFIED leads.
3. If `api.closures.getByLeadId` returns an existing closure, dialog shows `View Closure` link and disables create submission for that lead.
4. Submitting rupee value `25000` in Commission from `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` sends paise value `2500000` to `api.closures.create`.
5. Successful save from `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` shows `Closure recorded!` toast and closes the dialog.
6. Mutation failure in `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` shows error toast and preserves form state.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual dialog flow: choose VERIFIED lead, upload docs, submit success path, then test duplicate-lead guardrail and invalid money/date inputs.

### Out of Scope

- Reusable uploader implementation details (T03)
- Status confirm/cancel actions (T04)
- Detail-page editing and read-only terminal UI (T05)
- Payout creation action (Phase 9)

---

## T03: Document Upload Component

### Objective

Build a reusable controlled document uploader for closure forms that supports single-file rent agreement uploads and multi-file additional documents with labels.

### Required Reading

- `notes/11-convex-architecture.md` — file upload pattern section
- `notes/features/07-closure-and-payouts.md` — closure form document requirements
- `notes/10-convex-schema.md` — `rent_agreement_storage_id` and `additional_documents` schema shape
- `tasks/phase-06-listings/P06-E03-admin-listing-ui.md` — upload UX behavior patterns (loading, error, retry)

### Key Rules

1. Create reusable `src/app/(admin)/admin/closures/components/document-uploader.tsx` with controlled `value`/`onChange` API.
2. Support both modes:
   - single mode for rent agreement (`Id<"_storage"> | null`)
   - multi mode for additional docs (`Array<{ name: string; storage_id: Id<"_storage"> }>`)
3. Upload flow is strict: select file -> call `api.closures.generateUploadUrl` -> `fetch` POST -> parse `storageId` -> propagate via `onChange`.
4. Show upload state per item (`uploading`, `done`, `error`) with visible progress indicator and retry action.
5. Show file preview: PDF icon for `.pdf`, image thumbnail for `.jpg`/`.jpeg`/`.png`.
6. Accept only `.pdf`, `.jpg`, `.jpeg`, `.png`; reject `.webp` and unsupported formats with toast feedback. (WebP excluded intentionally — closure documents are legal/contractual artifacts where PDF/JPEG/PNG are standard; unlike listing photos, WebP adds no value here.)
7. Provide remove control for uploaded items in both single and multi modes.
8. Multi mode requires editable `name` label per uploaded document before submission.
9. Surface upload failures through `sonner` with actionable retry.

### Deliverables

- [ ] `src/app/(admin)/admin/closures/components/document-uploader.tsx` — reusable single/multi controlled uploader with validation, upload, preview, remove, retry states.
- [ ] `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` — integrate uploader for rent agreement and additional documents.

### Acceptance Criteria

1. In single mode, `src/app/(admin)/admin/closures/components/document-uploader.tsx` emits `storageId` on success and `null` on remove.
2. In multi mode, `src/app/(admin)/admin/closures/components/document-uploader.tsx` emits `Array<{ name, storage_id }>` and allows label edits.
3. `src/app/(admin)/admin/closures/components/document-uploader.tsx` accepts `.pdf`, `.jpg`, `.jpeg`, `.png` and rejects `.webp` with a visible error toast.
4. Upload failure in `src/app/(admin)/admin/closures/components/document-uploader.tsx` shows error state and a retry button that re-attempts upload.
5. `src/app/(admin)/admin/closures/components/document-uploader.tsx` shows PDF icon for `.pdf` and image thumbnail preview for image files.
6. `src/app/(admin)/admin/closures/components/record-closure-dialog.tsx` stores returned `storageId` values in form payload fields (`rent_agreement_storage_id`, `additional_documents`).
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual upload checks: single rent agreement upload/remove, multi additional docs upload with labels, invalid file type rejection, retry after simulated failure.

### Out of Scope

- Document display/download in detail page (T05)
- Closure status mutation controls (T04)
- Payout receipt or payout document upload flows (Phase 9)

---

## T04: Closure Filters + Status Actions

### Objective

Create reusable URL-synced board filters and status action controls (confirm/cancel) before detail-page work so T05 can consume these components without forward dependency.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — closure statuses, admin actions, business rules
- `notes/13-constants-reference.md` — closure status literals/colors and permissions (`closures.view`, `closures.confirm`, `closures.edit`)
- `tasks/phase-07-visit-management/P07-E03-admin-visit-board-ui.md` — T04 ordering pattern (actions component before detail page)
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — URL-synced filter + pagination reset conventions

### Key Rules

1. Create `src/app/(admin)/admin/closures/components/closure-filters.tsx` with URL-synced controls: status (`ALL`, `PENDING`, `CONFIRMED`, `CANCELLED`), move-in date from/to, and society dropdown from `api.societies.list`. Note: society filter requires `societies.view` permission — render society dropdown only when data loads successfully; degrade gracefully if the role lacks `societies.view` (hide the dropdown, don't crash).
2. Changing any filter resets paginated cursor so board results restart from first page.
3. Wire filters into `api.closures.list` args in `src/app/(admin)/admin/closures/page.tsx`.
4. Create `src/app/(admin)/admin/closures/components/closure-status-actions.tsx` with status-conditional AND permission-gated controls:
   - `PENDING` + user has `closures.confirm`: show `Confirm` button
   - `PENDING` + user has `closures.edit`: show `Cancel` button
   - `CONFIRMED`/`CANCELLED`: no action buttons (terminal)
   - Buttons are HIDDEN (not just disabled) when the user lacks the required permission. This prevents Ops Agent users from seeing a Confirm button they cannot use (Ops Agent has `closures.edit` but NOT `closures.confirm`).
5. `Confirm` calls `api.closures.confirm` and shows success toast exactly `Closure confirmed!`.
6. `Cancel` requires a confirmation dialog and calls `api.closures.cancel`; success toast exactly `Closure cancelled`.
7. Action buttons show loading spinner and disabled state while mutation is in-flight.
8. All mutation success/failure feedback uses `sonner`.
9. T04 must define and integrate action components before T05 detail page implementation.

### Deliverables

- [ ] `src/app/(admin)/admin/closures/components/closure-filters.tsx` — URL-synced status/date/society filters with pagination reset behavior.
- [ ] `src/app/(admin)/admin/closures/components/closure-status-actions.tsx` — confirm/cancel action group with terminal-state suppression.
- [ ] `src/app/(admin)/admin/closures/page.tsx` — filter args wiring into `api.closures.list` and action component usage in board context.

### Acceptance Criteria

1. `src/app/(admin)/admin/closures/components/closure-filters.tsx` renders status options exactly `ALL`, `PENDING`, `CONFIRMED`, `CANCELLED`.
2. `src/app/(admin)/admin/closures/components/closure-filters.tsx` syncs filter state to URL query params and restores state on reload/share.
3. Changing any filter from `src/app/(admin)/admin/closures/components/closure-filters.tsx` resets board pagination to first page in `src/app/(admin)/admin/closures/page.tsx`.
4. `src/app/(admin)/admin/closures/components/closure-status-actions.tsx` shows `Confirm` only for `PENDING` closures when user has `closures.confirm` permission.
5. `src/app/(admin)/admin/closures/components/closure-status-actions.tsx` shows `Cancel` only for `PENDING` closures when user has `closures.edit` permission.
6. Confirm from `src/app/(admin)/admin/closures/components/closure-status-actions.tsx` calls `api.closures.confirm` and shows `Closure confirmed!`.
7. Cancel from `src/app/(admin)/admin/closures/components/closure-status-actions.tsx` requires confirmation, calls `api.closures.cancel`, and shows `Closure cancelled`.
8. Terminal statuses render no action buttons in `src/app/(admin)/admin/closures/components/closure-status-actions.tsx`.
9. Ops Agent users see Cancel but NOT Confirm (they have `closures.edit` but not `closures.confirm`); Finance/Super Admin users see both.
10. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual board checks: apply each filter, refresh URL, test confirm/cancel on `PENDING`, and verify terminal rows remain read-only.

### Out of Scope

- Detail-page section rendering and edit forms (T05)
- Payout creation action or payout status transitions (Phase 9)
- Any backend API contract change for closures list/actions

---

## T05: Closure Detail/Edit Page

### Objective

Implement `/admin/closures/[id]` as the closure detail workspace with status-aware edit/read-only behavior, document preview/download, financial display, linked entities, and integrated status actions from T04.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — closure detail expectations, business rules, admin two-step flow
- `notes/06-admin-panel-ux.md` — Flow 5 desktop detail workflow
- `notes/10-convex-schema.md` — closure field mapping (`demorentals_deal_id`, `move_in_date`, money fields, docs, notes)
- `notes/13-constants-reference.md` — closure status colors and payout status labels
- `tasks/phase-07-visit-management/P07-E03-admin-visit-board-ui.md` — detail-page composition + status-gated action pattern

### Key Rules

1. Create route `src/app/(admin)/admin/closures/[id]/page.tsx` and fetch live data with `useQuery(api.closures.getById, { id })`.
2. Render required sections:
   - header (Building + Flat + Closure ID)
   - deal info (DemoRentals Deal ID, Move-In Date)
   - financial info (Commission, Brokerage Tenant/Owner)
   - documents (rent agreement + additional docs)
   - closure status badge
   - guard info (name + phone)
   - linked listing (if available)
   - payout info (`Not Created` + disabled `Create Payout` placeholder text: `Available in Phase 9`)
3. Use `ClosureStatusBadge` from `src/components/shared/closure-status-badge.tsx`; do not duplicate status color logic.
4. Money display uses `formatINR(paise)` from `lib/money.ts` directly — it handles paise-to-rupees conversion internally. Do NOT call `paiseToRupees()` then `formatINR()` (double conversion). Use `paiseToRupees()` only when a raw numeric rupee value is needed (e.g., pre-filling an edit form input).
5. All displayed dates are formatted in IST.
6. `PENDING` closures support edit mode for DemoRentals Deal ID, Move-In Date, commission, brokerage tenant/owner, notes, and document replace/upload (via T03 component), plus T04 status actions.
7. `CONFIRMED` and `CANCELLED` closures are fully read-only with no edit controls.
8. Document URLs come from server response: `api.closures.getById` resolves storage IDs to URLs via `ctx.storage.getUrl` and returns URL fields for UI rendering.
9. Use `sonner` for mutation feedback and loading/disabled states for update/status actions.
10. Do not implement payout creation here; only show disabled placeholder.

### Deliverables

- [ ] `src/app/(admin)/admin/closures/[id]/page.tsx` — closure detail/edit page route with status-gated rendering and mutation wiring.
- [ ] `src/app/(admin)/admin/closures/components/closure-detail-panel.tsx` — reusable sectioned detail component with edit mode and document display blocks.
- _Consumes_ `src/app/(admin)/admin/closures/components/closure-status-actions.tsx` (from T04) for PENDING confirm/cancel controls.
- _Consumes_ `src/app/(admin)/admin/closures/components/document-uploader.tsx` (from T03) for document replace/upload in edit mode.

### Acceptance Criteria

1. `/admin/closures/[id]` in `src/app/(admin)/admin/closures/[id]/page.tsx` renders all required sections and updates reactively.
2. `src/app/(admin)/admin/closures/[id]/page.tsx` displays status using `src/components/shared/closure-status-badge.tsx`.
3. Financial values in `src/app/(admin)/admin/closures/[id]/page.tsx` render via `formatINR(paise)` directly (example: `formatINR(2500000)` -> `₹25,000`). Use `paiseToRupees()` only for pre-filling edit form inputs with raw rupee numbers.
4. `PENDING` detail view exposes editable controls and uses `api.closures.update` for saves.
5. `CONFIRMED` and `CANCELLED` detail views are read-only and do not render edit controls.
6. `src/app/(admin)/admin/closures/[id]/page.tsx` renders linked listing navigation only when listing exists (`/admin/listings/[id]`).
7. `src/app/(admin)/admin/closures/[id]/page.tsx` renders payout section with disabled `Create Payout` control and text `Available in Phase 9` when payout is absent.
8. Document links render from URL fields returned by `api.closures.getById` (storage URLs resolved server-side).
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual detail checks: open one `PENDING`, one `CONFIRMED`, and one `CANCELLED` closure; verify edit gating, status actions, document rendering, linked listing visibility, and payout placeholder behavior.

### Out of Scope

- Payout creation/edit/approval/mark-paid workflows (Phase 9)
- Guard earnings UI and payout history (Phase 9)
- New status badge creation or status color hardcoding
- Backend schema or state-machine changes beyond existing closure APIs

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
