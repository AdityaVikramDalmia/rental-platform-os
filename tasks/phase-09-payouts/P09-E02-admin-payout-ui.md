---
id: P09-E02
title: Admin Payout UI
phase: 9
status: done
depends_on: ["P09-E01", "P04-E03", "P08-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P09-E02: Admin Payout UI

## Overview

Build the admin payout workspace end-to-end: activate the Payouts sidebar entry, ship `/admin/payouts` with real-time table + URL-synced filters, implement the create-payout dialog with auto-filled guard/lead/closure and manual `amount_paise` entry, add reusable status action controls (Approve/Disburse/Mark Failed/Void), deliver `/admin/payouts/[id]` detail view with linked entities, and integrate a "Payout" section into the existing closure detail page (`/admin/closures/[id]`).

## Prerequisites

- **Read first**: [P09-E01 Completion Summary](P09-E01-payout-backend.md#completion-summary) — all payout APIs used here (`list`, `getById`, `create`, `approve`, `disburse`, `fail`, `void`) are expected to exist. Shared `payout-status-badge.tsx` created in E01-T01.
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — reuse established admin sidebar/table/filter/detail patterns.
- **Read first**: [P08-E02 Completion Summary](../phase-08-closure/P08-E02-admin-closure-ui.md#completion-summary) — closure detail page exists at `/admin/closures/[id]`. T05 adds a payout integration section to this page.
- Admin layout/sidebar conventions from earlier phases are already in place and should be reused, not redesigned.

## Task Queue

- [x] P09-E02-T01: Admin Sidebar + Payout Board Page Shell
- [x] P09-E02-T02: Create Payout Dialog
- [x] P09-E02-T03: Payout Filters + Status Actions
- [x] P09-E02-T04: Payout Detail Page
- [x] P09-E02-T05: Closure Detail → Payout Integration

---

## T01: Admin Sidebar + Payout Board Page Shell

### Objective

Enable payout navigation in the admin sidebar and create the `/admin/payouts` board shell with real-time paginated data, required columns, create-action entry point, and row-level navigation to detail.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Admin Panel UI → Payouts Page" (columns, filters, actions)
- `notes/06-admin-panel-ux.md` — Flow 5: Process Closure & Payout (payout step)
- `tasks/phase-08-closure/P08-E02-admin-closure-ui.md` — T01 structure for latest admin board shell pattern
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — T01/T02 admin sidebar + table shell conventions
- `notes/13-constants-reference.md` — `payouts.view` permission and payout status display semantics

### Key Rules

1. Update `src/app/(admin)/admin-layout-client.tsx` to activate the existing `Payouts` nav item (already present as a placeholder with `HandCoins` icon from a prior phase). **⚠️ It currently has NO `requiredPermission`** — add `requiredPermission: "payouts.view"` to RBAC-gate it. Keep existing `HandCoins` icon (matches current admin nav).
2. Keep nav ordering as: Closures → Payouts → (next items).
3. Route file is `src/app/(admin)/admin/payouts/page.tsx` and follows existing desktop-first admin page shell conventions.
4. Board data uses `usePaginatedQuery(api.payouts.list, args, { initialNumItems: 20 })` with Convex reactivity.
5. Table columns are exactly: Guard (name), Lead (Building + Flat), Amount (₹ from `amount_paise`), Payment Reference, Status, Created (date), Approved By, Disbursed (date, blank if not disbursed). Default sort is newest first (`_creationTime` descending).
6. Status cell must consume `PayoutStatusBadge` from `src/components/shared/payout-status-badge.tsx` (already created in P09-E01-T01).
7. Amount column displays in rupees using `formatINR()` from `lib/money.ts`; backend values remain paise.
8. Add top-right primary button labeled exactly `Create Payout` and wire it to open T02 dialog. Button is visible only to users with `payouts.create` permission (HIDDEN, not disabled).
9. Row click navigates to `/admin/payouts/[id]` and page includes T03 filter bar mount point.

### Deliverables

- [ ] `src/app/(admin)/admin-layout-client.tsx` — Payouts nav item enabled and gated by `payouts.view`, ordered after Closures.
- [ ] `src/app/(admin)/admin/payouts/page.tsx` — payouts board page shell with title, `Create Payout` trigger, filters mount, paginated data wiring.
- [ ] `src/app/(admin)/admin/payouts/components/payout-table.tsx` — table rendering with required 8 columns, row click routing, load-more behavior.

### Acceptance Criteria

1. `src/app/(admin)/admin-layout-client.tsx` contains an active `Payouts` nav item with `href: "/admin/payouts"`, `requiredPermission: "payouts.view"` (or `PERMISSIONS.PAYOUTS_VIEW` constant), and existing `HandCoins` icon.
2. In `src/app/(admin)/admin-layout-client.tsx`, `Payouts` appears after `Closures`.
3. `/admin/payouts` renders desktop-first shell with title, `Create Payout` button, filters area, and payouts table.
4. `Create Payout` button is HIDDEN (not disabled) when user lacks `payouts.create` permission. Ops Agent users should NOT see this button.
5. `src/app/(admin)/admin/payouts/page.tsx` uses `usePaginatedQuery(api.payouts.list, ..., { initialNumItems: 20 })`.
6. `src/app/(admin)/admin/payouts/components/payout-table.tsx` renders all 8 required columns and uses `PayoutStatusBadge` from `src/components/shared/payout-status-badge.tsx`.
7. Amount in table is displayed via `formatINR(paise)` (example: paise `100000` displays `₹1,000`). `formatINR` converts paise→rupees internally — do NOT pre-convert with `paiseToRupees()`.
8. Disbursed date column shows blank/dash when the payout has not reached `disbursed`. Approved By shows blank/dash until approved.
9. Clicking any data row navigates to `/admin/payouts/[id]`.
10. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on `/admin/payouts`: sidebar visibility by permission, column order, row navigation, `Create Payout` button visibility (visible for Finance/Super Admin, hidden for Ops Agent).

### Out of Scope

- Create-payout form internals and submission (T02)
- Filter/action logic implementation (T03)
- Detail page rendering (T04)
- Closure detail integration (T05)

---

## T02: Create Payout Dialog

### Objective

Implement the payout creation dialog with auto-filled guard/lead/closure context, prospective bounty display for reference, manual `amount_paise` entry by admin, optional payment reference entry, and mutation wiring for `api.payouts.create`.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Admin Flow: Create Payout", "Payout Form", Business Rules #3, #4, #5
- `notes/06-admin-panel-ux.md` — Flow 5 payout step UX
- `notes/10-convex-schema.md` — `payouts` table fields and optionality
- `notes/13-constants-reference.md` — `payouts.create` permission (for create dialog gating), payout statuses, and payout schema alignment

### Key Rules

1. Create `src/app/(admin)/admin/payouts/components/create-payout-dialog.tsx` using shadcn `Dialog`, `react-hook-form`, and `zod`.
2. Dialog can be triggered from TWO places: (a) the payouts board "Create Payout" button (user selects closure), and (b) the closure detail page "Create Payout" button (closure pre-selected). Support both entry modes via props.
3. When triggered from board: show a closure selector limited to CONFIRMED closures that do NOT already have a payout. Each option displays Building + Flat + Society + Guard.
4. When triggered from closure detail: closure is pre-selected and selector is read-only.
5. On closure selection, display auto-filled read-only context: Guard name, Lead reference (Building + Flat), Closure reference, Prospective Bounty (from lead's `prospective_bounty` field — display-only, NOT the payout amount).
6. Admin-entered fields: Payout Amount (₹, required — converted with `rupeesToPaise()` to `amount_paise` before mutation), Payment Reference (optional text input mapped to `payment_reference`).
7. `amount_paise` is manually entered (via rupee input converted to paise) — system does NOT auto-calculate from commission or brokerage (Business Rule #5). Show prospective bounty as reference only with label "Prospective Bounty (reference only)".
8. Save action calls `api.payouts.create`; success toast text must be exactly `Payout created!`, dialog closes, and board reflects new data reactively.
9. Errors show `sonner` error toast and keep the dialog open for corrections.
10. Zod validations: rupee input required and positive (converted to `amount_paise` integer); `payment_reference` optional string.

### Deliverables

- [ ] `src/app/(admin)/admin/payouts/components/create-payout-dialog.tsx` — full dialog form, closure selector (board mode) or pre-selected (closure mode), auto-filled context, manual `amount_paise` entry + optional `payment_reference`, create mutation wiring.
- [ ] `src/app/(admin)/admin/payouts/page.tsx` — `Create Payout` button open/close integration and dialog mount.

### Acceptance Criteria

1. Dialog renders all required fields: closure selector (or pre-selected), auto-filled Guard/Lead/Closure context, Prospective Bounty (read-only reference), Payout Amount, optional Payment Reference.
2. Closure selector in board mode only shows CONFIRMED closures without existing payouts.
3. Prospective Bounty is labeled "Prospective Bounty (reference only)" and is NOT the payout amount.
4. Submitting rupee value `1000` in Payout Amount sends paise value `100000` to `api.payouts.create`.
5. Submitted payload uses `amount_paise` (integer paise) and optional `payment_reference`.
6. Successful save shows `Payout created!` toast and closes dialog.
7. Mutation failure shows error toast and preserves form state.
8. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual dialog flow: choose CONFIRMED closure (board mode), verify auto-fill, enter payout `amount_paise` (via rupee input) + optional payment reference, submit success path, then test from closure detail mode and test duplicate-closure guardrail.

### Out of Scope

- Status action buttons (T03)
- Detail page (T04)
- Closure detail integration wiring (T05)

---

## T03: Payout Filters + Status Actions

### Objective

Create reusable URL-synced board filters and status action controls (Approve/Disburse/Mark Failed/Void) before detail-page work so T04 can consume these components without forward dependency.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Admin Panel UI → Payouts Page" (filters: Status, Guard, Date range; actions: Approve, Disburse, Void)
- `notes/13-constants-reference.md` — payout status literals/colors and permissions (`payouts.view`, `payouts.approve`, `payouts.disburse`, `payouts.void`)
- `notes/03-roles-and-permissions.md` — Ops Agent has `payouts.view` ONLY, Finance has all 5 (`payouts.view`, `payouts.create`, `payouts.approve`, `payouts.disburse`, `payouts.void`), Super Admin has all
- `tasks/phase-08-closure/P08-E02-admin-closure-ui.md` — T04 ordering pattern (actions component before detail page)
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — URL-synced filter + pagination reset conventions

### Key Rules

1. Create `src/app/(admin)/admin/payouts/components/payout-filters.tsx` with URL-synced controls: status multi-select (`All`, `pending`, `approved`, `disbursed`, `failed`, `voided`), guard selector (searchable dropdown resolving guard name → `guard_user_id` for API — the backend API filters by `guard_user_id`, not by name text), created date from/to.
2. Changing any filter resets paginated cursor so board results restart from first page.
3. Wire filters into `api.payouts.list` args in `src/app/(admin)/admin/payouts/page.tsx`. Reference backend contract from E01: The `listPayouts` query accepts an optional `status` parameter. For multi-status filtering, the UI should call the query multiple times or implement client-side post-filtering. The backend API is single-status-at-a-time.
4. Create `src/app/(admin)/admin/payouts/components/payout-status-actions.tsx` with status-conditional AND permission-gated controls:
   - `pending` + user has `payouts.approve`: show `Approve` button
   - `pending`/`approved` + user has `payouts.void`: show `Void` button
   - `approved` + user has `payouts.disburse`: show `Disburse` button
   - `approved` + user has `payouts.disburse`: show `Mark Failed` button
   - `disbursed`/`failed`/`voided`: no action buttons (terminal)
   - Buttons are **HIDDEN** (not just disabled) when the user lacks the required permission. Ops Agent users see NO action buttons at all (they have `payouts.view` only).
5. `Approve` calls `api.payouts.approve`; success toast exactly `Payout approved!`.
6. `Disburse` calls `api.payouts.disburse`; success toast exactly `Payout disbursed!`. Show optional `payment_reference` input before confirming.
7. `Mark Failed` calls `api.payouts.fail`; requires `failure_reason`; success toast exactly `Payout marked failed`.
8. `Void` requires a confirmation dialog ("Are you sure? This cannot be undone.") with optional `voided_reason` input, then calls `api.payouts.void`; success toast exactly `Payout voided`.
9. Action buttons show loading spinner and disabled state while mutation is in-flight.
10. All mutation success/failure feedback uses `sonner`.
11. T03 must define and integrate action components before T04 detail page implementation.

### Deliverables

- [ ] `src/app/(admin)/admin/payouts/components/payout-filters.tsx` — URL-synced status/guard/date filters with pagination reset behavior.
- [ ] `src/app/(admin)/admin/payouts/components/payout-status-actions.tsx` — approve/disburse/mark-failed/void action group with terminal-state suppression and permission gating.
- [ ] `src/app/(admin)/admin/payouts/page.tsx` — filter args wiring into `api.payouts.list` and action component usage in board context.

### Acceptance Criteria

1. `payout-filters.tsx` renders status options: `All`, `pending`, `approved`, `disbursed`, `failed`, `voided`.
2. `payout-filters.tsx` syncs filter state to URL query params and restores state on reload/share.
3. Changing any filter resets board pagination to first page.
4. `payout-status-actions.tsx` shows `Approve` only for `pending` payouts when user has `payouts.approve`.
5. `payout-status-actions.tsx` shows `Disburse` and `Mark Failed` only for `approved` payouts when user has `payouts.disburse`.
6. `payout-status-actions.tsx` shows `Void` only for `pending`/`approved` payouts when user has `payouts.void`.
7. Terminal statuses (`disbursed`, `failed`, `voided`) render no action buttons.
8. Approve calls `api.payouts.approve` and shows `Payout approved!`.
9. Disburse calls `api.payouts.disburse` and shows `Payout disbursed!`.
10. Mark Failed calls `api.payouts.fail` and shows `Payout marked failed`.
11. Void requires confirmation, calls `api.payouts.void`, and shows `Payout voided`.
12. Ops Agent users see NO action buttons (they have `payouts.view` only, not `payouts.approve`, `payouts.disburse`, or `payouts.void`).
13. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual board checks: apply each filter, refresh URL, test approve/disburse/mark-failed/void on correct statuses, verify Ops Agent sees no action buttons, verify terminal rows have no actions.

### Out of Scope

- Detail page section rendering (T04)
- Closure detail payout integration (T05)
- Any backend API contract changes

---

## T04: Payout Detail Page

### Objective

Implement `/admin/payouts/[id]` as the payout detail workspace with read-only display of payout information, linked entities (closure, lead, guard, building, society), all relevant dates, and integrated status actions from T03.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — payout detail expectations and admin workflow
- `notes/06-admin-panel-ux.md` — Flow 5 desktop detail workflow
- `notes/10-convex-schema.md` — payout field mapping (`amount_paise`, `payment_reference`, status, dates, `failure_reason`, `voided_reason`)
- `notes/13-constants-reference.md` — payout status colors and status display labels
- `tasks/phase-08-closure/P08-E02-admin-closure-ui.md` — T05 detail-page composition + status-gated action pattern

### Key Rules

1. Create route `src/app/(admin)/admin/payouts/[id]/page.tsx` and fetch live data with `useQuery(api.payouts.getById, { id })`.
2. Render required sections:
   - Header: Guard name + Payout ID
   - Payout info: Amount (₹ from `amount_paise`), Payment Reference, Status badge, Failure Reason (if failed), Voided Reason (if voided)
   - Dates: Created date, Disbursed date (if applicable), Voided date (if voided)
   - Admin references: `approved_by` (if approved), `voided_by` (if voided)
   - Linked closure: Closure reference with link to `/admin/closures/[closure_id]`
   - Linked lead: Lead reference (Building + Flat + Society) with link to `/admin/leads` (⚠️ the leads page uses local state for side-panel selection; there is no URL-driven `?selected=` param. If URL-driven lead selection is needed, that is outside P09 scope.)
   - Guard info: Guard name + phone
3. Use `PayoutStatusBadge` from `src/components/shared/payout-status-badge.tsx`; do not duplicate status color logic.
4. Money display uses `formatINR(paise)` from `lib/money.ts` for all display (it converts paise→rupees internally). Use `paiseToRupees()` only when a raw numeric rupee value is needed (e.g., pre-filling an editable form input). Never chain `paiseToRupees()` then `formatINR()` — that would double-convert and show 100x smaller amounts.
5. All displayed dates are formatted in IST.
6. Payout detail is always read-only (no edit mode) — payouts are not editable after creation. Only status transitions are allowed via action buttons.
7. Status actions from T03 (`payout-status-actions.tsx`) are rendered at the top of the detail page, permission-gated.
8. Back navigation to `/admin/payouts` via breadcrumb or back button.
9. Use `sonner` for any mutation feedback from status actions.

### Deliverables

- [ ] `src/app/(admin)/admin/payouts/[id]/page.tsx` — payout detail page route with sections, status badge, linked entities, status actions.
- [ ] `src/app/(admin)/admin/payouts/components/payout-detail-panel.tsx` — reusable sectioned detail component with linked entity navigation.
- _Consumes_ `src/app/(admin)/admin/payouts/components/payout-status-actions.tsx` (from T03) for status action controls.

### Acceptance Criteria

1. `/admin/payouts/[id]` renders all required sections and updates reactively.
2. Status displayed using `PayoutStatusBadge` from `src/components/shared/payout-status-badge.tsx`.
3. Amount rendered via `formatINR(paise)` (example: `100000` paise → `₹1,000`). Do NOT chain `paiseToRupees()` then `formatINR()` — `formatINR` already converts paise internally.
4. All dates formatted in IST.
5. Linked closure is a clickable link to `/admin/closures/[closure_id]`. Linked lead is a clickable link to `/admin/leads` (lead page uses local state for side-panel selection; there is no URL-driven `?selected=` param).
6. Guard info shows name and formatted phone.
7. Status actions render at top, permission-gated (same behavior as board actions from T03).
8. `disbursed`/`failed`/`voided` payouts show no action buttons.
9. Failure/void metadata is displayed when present: `failure_reason`, `voided_reason`, `voided_by`, `voided_at`.
10. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual detail checks: open one `pending`, one `approved`, one `disbursed`, one `failed`, and one `voided` payout; verify sections render, linked entities navigate correctly, status actions appear/disappear correctly.

### Out of Scope

- Payout editing (payouts are not editable — only status transitions)
- Closure detail integration (T05)
- Guard-facing payout views (P09-E03)

---

## T05: Closure Detail → Payout Integration

### Objective

Add a "Payout" section to the existing closure detail page (`/admin/closures/[id]`) that shows payout status when a payout exists, or a "Create Payout" button when the closure is CONFIRMED and no payout exists.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — closure→payout relationship, Business Rules #3, #4
- `tasks/phase-08-closure/P08-E02-admin-closure-ui.md` — T05 detail page structure (shows "Available in Phase 9" placeholder that this task replaces)
- `notes/13-constants-reference.md` — `payouts.create` permission string (for Create Payout button gating)

### Key Rules

1. Modify `src/app/(admin)/admin/closures/[id]/page.tsx` to add a "Payout" section that replaces the Phase 9 placeholder.
2. Section rendering logic:
   - If closure `CONFIRMED` + payout exists → show `PayoutStatusBadge` + payout amount (₹ from `amount_paise`) + link to `/admin/payouts/[payout_id]`
   - If closure `CONFIRMED` + no payout → show `Create Payout` button (RBAC-gated by `payouts.create`, HIDDEN when user lacks permission). Button opens the create-payout dialog from T02 with closure pre-selected.
   - If closure `PENDING` → show text "Payout available after closure is confirmed"
   - If closure `CANCELLED` → if payout was voided, show "Payout voided"; otherwise show nothing
3. The payout data is already available from `api.closures.getById` response (which includes optional payout join via `payouts.by_closure_id` — implemented in P08-E01-T02).
4. Use `PayoutStatusBadge` from `src/components/shared/payout-status-badge.tsx`.
5. "Create Payout" button opens the create-payout dialog in "closure mode" (closure pre-selected, no selector needed).
6. Do not create new backend queries — all data needed is in the existing `closures.getById` response.

### Deliverables

- [ ] `src/app/(admin)/admin/closures/[id]/page.tsx` — Replace Phase 9 placeholder with live payout integration section.
- [ ] `src/app/(admin)/admin/closures/components/closure-detail-panel.tsx` — Add payout section to existing detail component (if payout rendering is in detail panel).
- _Consumes_ `src/app/(admin)/admin/payouts/components/create-payout-dialog.tsx` (from T02) in closure-mode.
- _Consumes_ `src/components/shared/payout-status-badge.tsx` (from P09-E01-T01).

### Acceptance Criteria

1. Closure detail page at `/admin/closures/[id]` shows a "Payout" section (replaces "Available in Phase 9" placeholder).
2. CONFIRMED closure with existing payout shows: `PayoutStatusBadge`, payout amount (₹ from `amount_paise`), and clickable link to `/admin/payouts/[id]`.
3. CONFIRMED closure without payout shows "Create Payout" button — HIDDEN when user lacks `payouts.create`.
4. PENDING closure shows "Payout available after closure is confirmed" text.
5. CANCELLED closure with voided payout shows "Payout voided" text.
6. "Create Payout" button opens create-payout dialog with closure pre-selected (no closure selector shown).
7. After creating a payout, the section updates reactively to show the new payout status.
8. No new backend queries added — uses data from existing `api.closures.getById`.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual closure checks: view PENDING closure (no payout section action), view CONFIRMED closure without payout (see create button), create payout and verify section updates, view CONFIRMED closure with payout (see badge + link), view CANCELLED closure.

### Out of Scope

- New backend queries for closure-payout relationship (already exists in P08's `closures.getById`)
- Guard-facing payout/closure views
- Payout editing or status actions within closure page (user navigates to payout detail for actions)

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
