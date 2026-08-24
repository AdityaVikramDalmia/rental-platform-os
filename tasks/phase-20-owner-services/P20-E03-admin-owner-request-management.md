---
id: P20-E03
title: Admin Owner Request Management
phase: 20
status: done
depends_on: ["P20-E01"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P20-E03: Admin Owner Request Management

## Overview

Build the admin owner request management page at `(admin)/admin/owner-requests/` with status tabs (with counts), paginated table, detail panel with full request context, and action dialogs for Contact/Reject/Drop/Onboard/Activate status transitions. Update admin sidebar navigation so authorized admins can discover the queue directly from the main nav.

## Prerequisites

- **Read first**: [P20-E01 Completion Summary](P20-E01-schema-constants-backend.md#completion-summary) — backend mutations/queries, WorkOS owner onboarding action, and `ownerServiceRequests.statusCounts` query must be functional before this UI epic starts.
- Admin page composition pattern from `src/app/(admin)/admin/leads/page.tsx` is established and should be reused (permission gate -> tabs/filters -> table -> detail panel).
- Owner request statuses and colors already exist in `lib/constants.ts` from P20-E01 (`OWNER_SERVICE_REQUEST_STATUS`, `OWNER_SERVICE_REQUEST_STATUS_COLORS`, owner request permissions).
- Owner request transitions are fixed and must be enforced in UI action visibility: `SUBMITTED -> CONTACTED/REJECTED`, `CONTACTED -> ONBOARDED/DROPPED`, `ONBOARDED -> ACTIVE`.
- Admin roles used for verification must include both `OWNER_SERVICE_REQUESTS_VIEW` and `OWNER_SERVICE_REQUESTS_MANAGE` so all dialog paths can be tested end-to-end.
- Route path must follow admin URL-prefix convention: `src/app/(admin)/admin/owner-requests/page.tsx` maps to `/admin/owner-requests`.

## Task Queue

- [x] P20-E03-T01: Admin Queue Route + Table + Sidebar Update
- [x] P20-E03-T02: Detail Panel + Contact/Reject/Drop Dialogs
- [x] P20-E03-T03: Onboard + Activate Dialogs

---

## T01: Admin Queue Route + Table + Sidebar Update

### Objective

Create the admin owner request queue page with permission gate, status tabs with counts, paginated table, and sidebar navigation entry so admins with owner-request access can discover and operate the queue quickly.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Owner Service Request Management (`/admin/owner-requests`)" wireframe section (lines 413-437)
- `src/app/(admin)/admin/leads/page.tsx` — page composition and permission-gate pattern
- `src/app/(admin)/admin-layout-client.tsx` — admin sidebar item configuration pattern
- `lib/constants.ts` — `OWNER_SERVICE_REQUEST_STATUS`, `OWNER_SERVICE_REQUEST_STATUS_COLORS`, `PERMISSIONS`
- `lib/money.ts` — `formatINR()` display pattern for paise amounts
- `notes/04-state-machines.md` — owner request transition legality for tab/action consistency

### Key Rules

1. Create `src/app/(admin)/admin/owner-requests/page.tsx` following the same top-level structure as `src/app/(admin)/admin/leads/page.tsx` (`useQuery` user/roles -> permission gate -> tabs -> table -> detail panel state handoff).
2. Permission gate is mandatory: require `PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW` and render a clear no-access state when missing.
3. Status tabs must include `ALL`, `SUBMITTED`, `CONTACTED`, `ONBOARDED`, `ACTIVE`, `REJECTED`, `DROPPED` and show badge counts sourced from `ownerServiceRequests.statusCounts`.
4. Create `src/components/admin/owner-request-table.tsx` using `usePaginatedQuery(api.ownerServiceRequests.list, ...)` with optional `status` filter and cursor-based `Load More` behavior.
5. Table column order is fixed and must match: `#`, `Name`, `Phone`, `Property Type`, `Location`, `Status`, `Created`.
6. `Status` column must render inline with shadcn `Badge` using `OWNER_SERVICE_REQUEST_STATUS_COLORS`; do not hardcode ad-hoc status classes in page-level JSX.
7. Table rows must be clickable and update selected request ID state at page level for detail-panel rendering.
8. `Created` column should use relative-time display so queue recency is scannable at a glance.
9. Include property value display with `formatINR()` anywhere owner-request value is shown in this table surface (for example inline secondary row detail); never show raw paise.
10. Add sidebar item in `src/app/(admin)/admin-layout-client.tsx`:
    - `label: "Owner Requests"`
    - `href: "/admin/owner-requests"`
    - `icon: Building2`
    - `requiredPermission: PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW`
11. Keep URL state and local state aligned: status tab changes must reset selected row so stale panel content never lingers after filter changes.
12. Table loading and empty states must be explicit and user-readable; avoid blank containers while queries resolve.
13. Tab count badges must update reactively from query results with no manual refresh button.
14. Preserve exact table header labels and order to match UX docs and avoid column drift.
15. Keep filenames kebab-case and preserve strict type safety (no `as any`, no `@ts-ignore`).

### Deliverables

- [ ] `src/app/(admin)/admin/owner-requests/page.tsx` — admin queue route with permission gate, status tabs, selected-row state, and table/panel composition
- [ ] `src/components/admin/owner-request-table.tsx` — paginated owner request table with inline status badge and row selection callbacks
- [ ] `src/app/(admin)/admin-layout-client.tsx` — owner request sidebar navigation item

### Acceptance Criteria

1. `/admin/owner-requests` renders and blocks unauthorized admins with a clear permission message.
2. Status tabs render all required statuses plus `ALL` and show counts from `ownerServiceRequests.statusCounts`.
3. Table data comes from `ownerServiceRequests.list` through `usePaginatedQuery` and supports `Load More`.
4. Status badge styling comes from `OWNER_SERVICE_REQUEST_STATUS_COLORS` and uses shadcn `Badge`.
5. Clicking a row updates selected request state for detail panel handoff.
6. Admin sidebar shows `Owner Requests` item with `Building2` icon and `OWNER_SERVICE_REQUESTS_VIEW` permission guard.
7. Status-tab changes clear stale row selection and keep panel state consistent.
8. Loading and empty states are visible for table and status-count fetches.
9. Table header order matches spec exactly (`#`, `Name`, `Phone`, `Property Type`, `Location`, `Status`, `Created`).
10. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/owner-requests/page.tsx`, `src/components/admin/owner-request-table.tsx`, and `src/app/(admin)/admin-layout-client.tsx`.

### Out of Scope

- Owner-request detail panel internals and action dialogs (T02/T03)
- Public owner-services page/form work (P20-E02)
- Backend lifecycle/action implementation (P20-E01)

---

## T02: Detail Panel + Contact/Reject/Drop Dialogs

### Objective

Build the owner request detail panel with full request context and action dialogs for CONTACTED/REJECTED/DROPPED transitions so admins can operate day-to-day queue actions without leaving the panel.

### Required Reading

- `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — shadcn `Sheet` detail-panel composition and status-gated action pattern
- `src/components/admin/GuardCreateDialog.tsx` — canonical `react-hook-form` + `zod` + `zodResolver` dialog form pattern
- `notes/features/14-owner-services.md` — "Admin: Manage Owner Requests" acceptance criteria (lines 60-72)
- `notes/04-state-machines.md` — owner service request transitions (lines 815-820)
- `lib/money.ts` — `formatINR()`/`rupeesToPaise()` conventions for money display and conversion
- `notes/06-admin-panel-ux.md` — owner request detail panel expectations and action sequencing

### Key Rules

1. Create `src/components/admin/owner-request-detail-panel.tsx` using shadcn `Sheet` for slide-over detail view.
2. Panel must display complete request context:
   - Owner info: name, phone, email
   - Property info: property type, location, property value (`formatINR()` when present)
   - Owner notes/message (`notes`)
   - Ops notes (`ops_notes`)
   - Assigned admin summary (if `assigned_admin_id` is populated)
   - Status badge
   - Timestamps: created time and `contacted_at` (when available)
3. Phone display must include click-to-call affordance (`tel:` link) while preserving stored 10-digit format semantics.
4. Action button visibility is strictly status-gated:
   - `SUBMITTED`: show `Contact` and `Reject`
   - `CONTACTED`: show `Onboard` and `Drop` (`Onboard` implementation in T03)
   - `ONBOARDED`: show `Activate` (`Activate` implementation in T03)
   - `ACTIVE`, `REJECTED`, `DROPPED`: no action buttons
5. Contact dialog requirements:
   - shadcn `Dialog`
   - optional `ops_notes` textarea
   - submit mutation: `ownerServiceRequests.updateStatus({ id, status: "CONTACTED", ops_notes })`
6. Reject dialog requirements:
   - shadcn `Dialog`
   - required non-empty `ops_notes` textarea validated by zod
   - submit mutation: `ownerServiceRequests.updateStatus({ id, status: "REJECTED", ops_notes })`
7. Drop dialog requirements:
   - shadcn `Dialog`
   - required non-empty `ops_notes` textarea validated by zod
   - submit mutation: `ownerServiceRequests.updateStatus({ id, status: "DROPPED", ops_notes })`
8. All dialogs must use `react-hook-form` + `zod` + `zodResolver`, show loading/disabled confirm state, and surface `toast.success` / `toast.error` messages.
9. After successful mutation, panel and table state must refresh via Convex reactivity and selected entity should remain consistent (no stale dialog state).
10. Dialog submit buttons must prevent duplicate requests while pending and close only on successful mutation completion.
11. Keep dialog default values synchronized when selected request changes while the panel is open.
12. For REJECTED and DROPPED submissions, show inline validation message when `ops_notes` is empty before mutation call.
13. Keep implementation type-safe with kebab-case filenames and no forbidden escapes (`as any`, `@ts-ignore`).

### Deliverables

- [ ] `src/components/admin/owner-request-detail-panel.tsx` — detail panel with request context plus Contact/Reject/Drop dialogs

### Acceptance Criteria

1. Selecting a row opens detail panel with owner info, property info, notes, ops notes, admin assignment, status badge, and timestamps.
2. Action buttons render only for allowed statuses per owner-request state machine.
3. Contact dialog allows optional notes and transitions `SUBMITTED -> CONTACTED`.
4. Reject dialog enforces required notes and transitions `SUBMITTED -> REJECTED`.
5. Drop dialog enforces required notes and transitions `CONTACTED -> DROPPED`.
6. Dialog actions show success and failure toasts and close/reset correctly after mutation completion.
7. Pending dialogs block duplicate submits and keep controls disabled until completion.
8. Form validation errors for required notes are visible before network mutation attempts.
9. Phone field in the detail panel renders as a clickable `tel:` link.
10. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/owner-request-detail-panel.tsx`.

### Out of Scope

- Onboard and Activate dialog implementation details (T03)
- WorkOS owner account action implementation (P20-E01)
- Public owner-services page/form UI (P20-E02)

---

## T03: Onboard + Activate Dialogs

### Objective

Add the onboarding and activation dialogs in the owner request detail panel to complete the `CONTACTED -> ONBOARDED -> ACTIVE` lifecycle, including WorkOS owner-account creation and existing-user edge-case handling.

### Required Reading

- `convex/actions/workos.ts` — `createOwnerAccount` action contract and error behavior from P20-E01-T03
- `notes/features/14-owner-services.md` — onboarding flow requirements (lines 70-71)
- `notes/04-state-machines.md` — owner request status transitions for ONBOARDED/ACTIVE
- `src/components/admin/owner-request-detail-panel.tsx` — panel/dialog structure from T02

### Key Rules

1. Extend `src/components/admin/owner-request-detail-panel.tsx` with an Onboard dialog visible only when status is `CONTACTED`.
2. Onboard dialog form requirements:
   - required `owner_email` field
   - email format validation via zod
   - owner name shown as read-only context
   - submit through `useAction(api.actions.workos.createOwnerAccount)`
3. Onboard action payload must pass request ID, owner email, and owner name using the backend action contract defined in P20-E01.
4. Existing-user edge-case handling is mandatory:
   - If action reports existing user with different user type, show a clear error toast (do not silently fail).
   - If action succeeds by linking an existing owner account, show success toast with clarifying note.
5. Add Activate confirmation dialog visible only when status is `ONBOARDED`.
6. Activate dialog has no extra form fields; confirm action calls `ownerServiceRequests.updateStatus({ id, status: "ACTIVE" })`.
7. Both dialogs must show in-button loading states while pending and prevent duplicate submits.
8. Required success toast copy:
   - Onboard success: `Owner account created successfully. They can now sign in with Google.`
   - Activate success: `Owner activated successfully.`
9. Both dialogs must refresh visible panel data after mutation/action completion so status and actions update immediately.
10. Onboard dialog must preserve entered email while pending, then reset form only after success or manual close.
11. Error handling must map known backend/action errors to readable admin-facing copy without exposing raw stack traces.
12. Activate confirmation dialog must include current owner name and status context text before confirming transition.
13. Keep implementation compliant with project constraints: no `as any`, no `@ts-ignore`, no untyped catch handling.

### Deliverables

- [ ] `src/components/admin/owner-request-detail-panel.tsx` — Onboard and Activate dialogs integrated with status-gated action controls

### Acceptance Criteria

1. Onboard dialog captures valid owner email, calls `createOwnerAccount`, and results in `CONTACTED -> ONBOARDED`.
2. Existing-user conflict paths show explicit, user-readable error toasts.
3. Existing-owner link success path shows explicit success feedback.
4. Activate dialog confirms and transitions `ONBOARDED -> ACTIVE`.
5. Onboard and Activate actions are visible only for their allowed statuses.
6. Confirm buttons show loading/disabled state and prevent duplicate submit behavior.
7. Known action errors are surfaced with clear, actionable toast messaging.
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/admin/owner-request-detail-panel.tsx`.

### Out of Scope

- Owner-facing authenticated owner dashboard/portal pages (deferred)
- Backend WorkOS action implementation details (`createOwnerAccount`) from P20-E01
- Public owner-services marketing/form work from P20-E02

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
