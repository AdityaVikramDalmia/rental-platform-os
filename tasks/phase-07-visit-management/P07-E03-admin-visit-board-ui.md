---
id: P07-E03
title: Admin Visit Board UI
phase: 7
status: done
depends_on: ["P07-E01", "P04-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P07-E03: Admin Visit Board UI

## Overview

Build the admin-facing visit management interface end-to-end: add the Visits sidebar entry, ship the `/admin/visits` board with table + filters + real-time pagination, implement schedule/edit/status action flows, surface `needs_reassignment` clearly in both filters and row/detail UI, and align everything to established admin patterns from P04-E03/P06-E03.

## Prerequisites

- **Read first**: [P07-E01 Completion Summary](P07-E01-visit-backend.md#completion-summary) — all visit backend APIs used by this UI are expected to exist (`create`, `confirm`, `cancel`, `markNoShow`, `edit`, `list`, `getById`, `getGuardAvailability`).
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — reuse admin sidebar/table/filter/detail interaction patterns.
- **Read first**: [P06-E03 Completion Summary](../phase-06-listings/P06-E03-admin-listing-ui.md#completion-summary) — reuse the latest admin UI component organization and status-action UX conventions.
- P07-E01 backend is complete and reachable from generated API types.

## Task Queue

- [x] P07-E03-T01: Admin Sidebar + Visit Board Page Shell
- [x] P07-E03-T02: Schedule Visit Dialog
- [x] P07-E03-T03: Guard Availability Grid Component
- [x] P07-E03-T04: Visit Filters + Status Actions + needs_reassignment Badge
- [x] P07-E03-T05: Visit Detail/Edit Page

---

## T01: Admin Sidebar + Visit Board Page Shell

### Objective

Add the Visits entry to the admin navigation and build the `/admin/visits` board shell with real-time paginated data, sortable date/time column, filters, and row navigation into visit detail.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Visits Board" and "Sidebar Navigation" sections
- `notes/features/06-visit-management.md` — "Admin Flow: Monitor Visits"
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — table shell, status/filter bar, sidebar item conventions
- `notes/10-convex-schema.md` — `visits` table fields used for table columns/filters
- `notes/13-constants-reference.md` — visit statuses, `visits.view` permission, status display conventions

### Key Rules

1. Add "Visits" nav item to admin sidebar using the exact existing RBAC-gated nav pattern (visible only with `visits.view`), with a calendar icon and a badge showing today's visit count.
2. Position nav item after Listings and before Closures, preserving existing collapsible sidebar behavior.
3. Route file is `src/app/(admin)/admin/visits/page.tsx` and follows desktop-first admin page shell patterns from P04-E03/P06-E03.
4. Board query uses `usePaginatedQuery(api.visits.list, args, { initialNumItems: 20 })` with real-time updates; no manual refresh button.
5. Filter bar is present on page shell and includes: status (`ALL`, `ASSIGNED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), date range (from/to), society, guard, and `needs_reassignment` toggle.
6. Table columns are exactly: Lead (Building + Flat), Society, Date/Time, Guard, Status (`VisitStatusBadge`), Outcome, Notes.
7. Date/Time column supports sorting (default upcoming first / ascending by `scheduled_start`), and all displayed dates/times use IST timezone formatting.
8. Include a top-right primary "Schedule Visit" button that opens T02 dialog and keep list pagination at 20 items with a "Load More" action.
9. Clicking a row navigates to `/admin/visits/[id]`; rows with `needs_reassignment === true` render a visible warning badge (`⚠️`) at row level.

### Deliverables

- [x] `src/app/(admin)/admin-layout-client.tsx` — add/verify "Visits" nav item with RBAC gate + today's count badge
- [x] `src/app/(admin)/admin/visits/page.tsx` — visit board shell with title, actions, table mount, pagination wiring
- [x] `src/app/(admin)/admin/visits/components/visit-table.tsx` — table rendering with sortable Date/Time column, row click navigation, warning badge row state

### Acceptance Criteria

1. "Visits" appears in admin sidebar only when user has `visits.view` permission.
2. Sidebar order places Visits after Listings and before Closures.
3. `/admin/visits` renders filter bar with all required controls, primary "Schedule Visit" button, and data table in desktop-first layout.
4. Table uses 20-item pagination with `usePaginatedQuery` and real-time Convex updates.
5. Date/Time column sorting works (default ascending / upcoming first) and uses IST display.
6. `needs_reassignment` visits show a warning badge on table rows.
7. Clicking a row opens `/admin/visits/[id]`.
8. `npm run build` passes.

### Verification

```bash
npm run build
```

Visual check on `/admin/visits`: sidebar item + badge, table columns, Date/Time sorting, row navigation, load-more behavior, and reactive updates.

### Out of Scope

- Schedule dialog field internals and submission flow (T02)
- Guard availability rendering logic (T03)
- Detail-page status action implementation (T04/T05)

---

## T02: Schedule Visit Dialog

### Objective

Create the schedule-visit workflow dialog with validated fields, VERIFIED-lead selection, shift-aware guard suggestion loading, and mutation-driven creation feedback.

### Required Reading

- `notes/features/06-visit-management.md` — "Admin Flow: Create Visit Form"
- `notes/06-admin-panel-ux.md` — "Schedule Visit Dialog" wireframe/interaction notes
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — dialog + `react-hook-form` + `zod` + `sonner` mutation pattern
- `notes/10-convex-schema.md` — `visits` required fields and lead/listing relationships
- `notes/13-constants-reference.md` — visit permissions/status literals and guard status semantics

### Key Rules

1. Create `src/app/(admin)/admin/visits/components/schedule-visit-dialog.tsx` using shadcn/ui `Dialog` with `react-hook-form` + `zod` validation.
2. Lead selector is searchable and includes only VERIFIED leads (via lead query filter); each option displays Building + Flat + Society.
3. Start and end fields use date + time inputs and validate `scheduled_start` is in the future and `< scheduled_end`.
4. Guard selector delegates to T03 `GuardAvailabilityGrid` and only activates after lead + start + end are selected.
5. Guard availability query call uses `api.visits.getGuardAvailability` and must pass `society_id` AND `building_id` from selected lead plus selected date/time range. `building_id` is required for same-building indicator computation.
6. If a listing exists for selected lead, show listing info as read-only context in the dialog.
7. Save action calls `api.visits.create`; success toast is exactly "Visit scheduled!", dialog closes, and board updates via Convex reactivity.
8. Errors from mutation surface via `sonner` error toast and keep dialog open for correction.

### Deliverables

- [x] `src/app/(admin)/admin/visits/components/schedule-visit-dialog.tsx` — schedule dialog UI, schema, lead/date-time/guard fields, create mutation wiring
- [x] `src/app/(admin)/admin/visits/page.tsx` — dialog trigger and open/close state integration from "Schedule Visit" button

### Acceptance Criteria

1. Dialog opens from "Schedule Visit" and shows all required fields.
2. Lead dropdown is searchable and only includes VERIFIED leads.
3. Guard grid loads only after lead + start + end are selected and uses selected lead society.
4. Validation prevents empty submission, non-future start time, and invalid range ordering.
5. Save calls `api.visits.create` and closes on success with "Visit scheduled!" toast.
6. Errors show toast message and keep dialog open.
7. Board data reflects new visit automatically (no manual refresh).
8. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual dialog flow: select VERIFIED lead, set valid times, choose guard, create visit, then retry with invalid times to confirm validation/toasts.

### Out of Scope

- Guard availability indicator computation logic internals (backend done in P07-E01)
- Visit detail page edit/status action UX
- Guard-facing visit execution screens

---

## T03: Guard Availability Grid Component

### Objective

Build a reusable guard availability selector that visualizes shift overlap and guard status while preserving soft-warning assignment behavior.

### Required Reading

- `notes/features/06-visit-management.md` — "Guard Assignment: Shift-Aware Suggestions" wireframe/behavior
- `notes/features/02-guard-management.md` — guard types and shift model semantics
- `notes/06-admin-panel-ux.md` — availability indicator presentation guidance
- `notes/10-convex-schema.md` — guard/shift fields in UI payload context
- `notes/13-constants-reference.md` — guard statuses and visit permission conventions

### Key Rules

1. Create `src/app/(admin)/admin/visits/components/guard-availability-grid.tsx` with props: `society_id`, `building_id`, `date`, `time_start`, `time_end`, `value`, and `onChange`. `building_id` is required to pass to the backend for ON_SHIFT_SAME_BUILDING vs ON_SHIFT_DIFFERENT_LOCATION computation.
2. Component fetches via `api.visits.getGuardAvailability` and renders one row per guard with name, guard type, shift info, and availability indicator.
3. Indicators map exactly to UI semantics and text: green (`✅ On shift (Tower A)`), yellow (`⚠️ On shift (Main Gate)` or `⚠️ Off duty`), and gray (`❌ INACTIVE`/`❌ BANNED`) disabled.
4. Selection control is radio-style; ACTIVE guards are selectable even when shift indicator is warning/off-duty (soft warning only).
5. INACTIVE/BANNED rows are visibly disabled and cannot be selected.
6. Show skeleton rows while loading and explicit empty state text: "No guards found in this society".
7. Keep component reusable and state-lifted (selection controlled by parent).

### Deliverables

- [x] `src/app/(admin)/admin/visits/components/guard-availability-grid.tsx` — query-backed availability grid with indicator badges and controlled selection

### Acceptance Criteria

1. Grid queries `api.visits.getGuardAvailability` using passed props.
2. Each row shows guard name, type, shift context, and indicator.
3. ACTIVE guards can be selected regardless of shift warning/off-duty indicator.
4. INACTIVE/BANNED guards are disabled and not selectable.
5. Loading and empty states render with required messaging.
6. Parent receives selected `guard_id` via `onChange`.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Visual check in dialog: confirm indicator colors/states, disabled rows, and soft-warning selection behavior.

### Out of Scope

- Backend availability algorithm changes
- Auto-assignment recommendations beyond returned indicator data
- Visit detail-page reassignment controls

---

## T04: Visit Filters + Status Actions + needs_reassignment Badge

### Objective

Implement reusable visit filter and status-action components, including URL-synced filter state, reassignment-focused filtering/badging, and mutation dialogs for cancel/no-show actions. These components are created before the detail page (T05) so it can wire them in.

### Required Reading

- `notes/features/06-visit-management.md` — Business Rule #11 (`needs_reassignment`) and admin action behavior
- `notes/13-constants-reference.md` — visit permissions and status enums used in filters/actions
- `notes/06-admin-panel-ux.md` — filter bar and action-button conventions
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — URL filter state, dialog-driven actions, loading/disabled standards
- `notes/10-convex-schema.md` — `visits` filterable fields (`status`, `society_id`, `assigned_guard_id`, `scheduled_start`, `needs_reassignment`)

### Key Rules

1. Create `src/app/(admin)/admin/visits/components/visit-filters.tsx` with status dropdown, from/to date pickers, society dropdown, guard dropdown, and `needs_reassignment` toggle.
2. Filters sync to URL query params for shareable board links and reset pagination cursor when any filter changes.
3. Status options map exactly to: `ALL`, `ASSIGNED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
4. Guard and society dropdowns fetch options from existing queries and should support all guards (or at minimum ACTIVE + assigned guards) for filtering correctness.
5. Create `src/app/(admin)/admin/visits/components/visit-status-actions.tsx` with status-conditional button group for Confirm/Cancel/Mark No-Show.
6. `Confirm` calls `api.visits.confirm`; `Cancel` and `Mark No-Show` open dialogs with optional text inputs and call `api.visits.cancel` / `api.visits.markNoShow`.
7. Action buttons show loading spinner, are disabled while processing, and surface success/error through `sonner`.
8. Render a row-level `needs_reassignment` badge (`⚠️ Needs Reassignment`) anywhere visit rows are listed when flag is true.

### Deliverables

- [x] `src/app/(admin)/admin/visits/components/visit-filters.tsx` — URL-synced board filters with pagination reset behavior
- [x] `src/app/(admin)/admin/visits/components/visit-status-actions.tsx` — status-conditional action buttons and cancel/no-show dialogs
- [x] `src/app/(admin)/admin/visits/components/visit-table.tsx` — integrate `needs_reassignment` row badge presentation
- [x] `src/app/(admin)/admin/visits/page.tsx` — wire filter component state into `api.visits.list` args

### Acceptance Criteria

1. Filter bar supports status/date/society/guard/needs_reassignment and syncs with URL params.
2. Changing any filter resets pagination cursor and refreshes paginated results correctly.
3. `needs_reassignment` toggle filters board to only flagged visits when enabled.
4. Table rows with `needs_reassignment === true` show `⚠️ Needs Reassignment` badge.
5. Status action buttons render only for non-terminal statuses and map correctly by current status.
6. Confirm/Cancel/No-Show mutations execute with loading/disabled/error/success behavior.
7. Cancel and No-Show dialogs accept optional text and pass it through to mutation payloads.
8. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual board/detail checks: share URL with filters, reload and confirm persisted state, toggle `needs_reassignment`, run status actions and validate UI reactivity.

### Out of Scope

- Guard-side visit execution actions
- Backend mutation/query contract changes
- Closure lifecycle actions from completed visits

---

## T05: Visit Detail/Edit Page

### Objective

Implement `/admin/visits/[id]` as the full visit detail/edit workspace with schedule/guard editing, status action entry points, `needs_reassignment` alerting, and outcome/audit context.

### Required Reading

- `notes/features/06-visit-management.md` — "Admin Actions on Visit" and "Rescheduling" sections
- `notes/06-admin-panel-ux.md` — visit detail panel/page wireframe and desktop layout conventions
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — detail view composition and action-dialog patterns
- `notes/10-convex-schema.md` — `visits` and related joined entities for detail payload rendering
- `notes/13-constants-reference.md` — visit status/outcome literals and permissions for conditional action rendering

### Key Rules

1. Create route file `src/app/(admin)/admin/visits/[id]/page.tsx` and fetch data via `useQuery(api.visits.getById)` with real-time updates.
2. Render sections: header (lead + society + visit ID), schedule window, guard assignment details, large status badge, outcome block, listing link (if present), needs-reassignment alert. (Audit/status history timeline is P13 scope — NOT in this phase.)
3. Dates/times in schedule and history are displayed in IST timezone consistently.
4. Non-terminal visits (including `IN_PROGRESS`) support edit flow (`scheduled_start`, `scheduled_end`, guard reassignment) and call `api.visits.edit`.
5. Terminal visits (`COMPLETED`, `CANCELLED`, `NO_SHOW`) are read-only.
6. Status actions follow exact matrix: `ASSIGNED` -> Confirm, Cancel, Mark No-Show, Edit; `CONFIRMED` -> Cancel, Mark No-Show, Edit; `IN_PROGRESS` -> Edit (schedule/guard reassignment only, completion is guard-owned); `COMPLETED/CANCELLED/NO_SHOW` -> read-only terminal.
7. Wire `visit-status-actions` component (from T04) for Confirm/Cancel/Mark No-Show controls, including cancel/no-show dialogs with optional text.
8. Edit flow updates schedule + guard via `api.visits.edit`; when guard changes, `needs_reassignment` clearing is backend-driven and reflected through subscription.
9. Use `sonner` for mutation feedback, button loading states with disabled controls, and explicit error handling.

### Deliverables

- [x] `src/app/(admin)/admin/visits/[id]/page.tsx` — visit detail/edit page with sectioned layout and mutation wiring
- [x] `src/app/(admin)/admin/visits/components/visit-detail-panel.tsx` — reusable detail panel for visit info display + edit block for schedule/guard updates

### Acceptance Criteria

1. `/admin/visits/[id]` renders all required sections with live data from `api.visits.getById`.
2. `needs_reassignment === true` renders prominent warning banner.
3. Non-terminal visits (including IN_PROGRESS) expose editable schedule/guard controls and call `api.visits.edit` successfully.
4. ASSIGNED status shows Confirm/Cancel/Mark No-Show/Edit actions.
5. CONFIRMED status shows Cancel/Mark No-Show/Edit actions.
6. IN_PROGRESS visits allow schedule/guard edits (via `visits.edit`) but completion remains guard-owned (no admin complete button).
7. Terminal statuses render read-only.
8. Listing link appears only when `listing_id` exists.
9. All timestamps display in IST.
10. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual detail checks: open ASSIGNED/CONFIRMED/IN_PROGRESS/COMPLETED visits, validate section visibility and edit/action gating by status.

### Out of Scope

- Guard-side start/complete visit UI
- Closure/payout workflows after completed visits
- Admin analytics aggregation views

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
