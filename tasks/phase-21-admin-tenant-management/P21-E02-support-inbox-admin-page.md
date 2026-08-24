---
id: P21-E02
title: Support Inbox Admin Page
phase: 21
epic: 2
status: done
updated_at: 2026-02-19
priority: high
depends_on: ["P21-E01"]
estimated_tasks: 3
---

# P21-E02: Support Inbox Admin Page

## Overview

Build the admin support inbox at `/admin/support` with status-tabbed queue, paginated table, and sidebar discoverability. Add a Sheet-based detail panel with strictly forward-only status actions, plus assignment and internal ops notes workflows for day-to-day support triage.

## Prerequisites

- **Read first**: P21-E01 Completion Summary — support inquiry list/get/statusCounts/assign/updateStatus/updateOpsNotes APIs must already be available.
- Follow the established admin page composition from `src/app/(admin)/admin/leads/page.tsx` (permission gate -> status tabs/filters -> table -> detail panel).
- Support inquiry status transitions are fixed and must be reflected exactly in action visibility: `OPEN -> IN_PROGRESS/RESOLVED/CLOSED`, `IN_PROGRESS -> RESOLVED/CLOSED`, `RESOLVED -> CLOSED`.
- Status badge colors must use centralized constants from `notes/13-constants-reference.md` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
- Route path must follow admin URL-prefix routing convention: `src/app/(admin)/admin/support/page.tsx` maps to `/admin/support`.
- Admin verification role should include both `SUPPORT_INQUIRIES_VIEW` and support-manage permissions so all actions can be exercised end-to-end during implementation.

## Task Queue

- [x] P21-E02-T01: Admin Queue Route + Table + Sidebar Nav
- [x] P21-E02-T02: Detail Panel + Status Action Dialogs
- [x] P21-E02-T03: Assignment Flow + Internal Notes

---

## T01: Admin Queue Route + Table + Sidebar Nav

### Objective

Create the `/admin/support` route with status-tabbed support queue, paginated table, and sidebar navigation entry so admins can quickly find and triage support inquiries.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Support Inquiry Queue (`/admin/support`)" wireframe section (lines 440-463)
- `notes/04-state-machines.md` — support inquiry transition map (lines 821-826)
- `notes/13-constants-reference.md` — support inquiry status colors (lines 576-583)
- `notes/10-convex-schema.md` — `support_inquiries` table + indexes (`by_status`, `by_persona_type`, `by_assigned_admin_id`)
- `src/app/(admin)/admin/leads/page.tsx` — admin queue page composition and permission-gate pattern
- `src/app/(admin)/admin-layout-client.tsx` — sidebar navigation item model and permission-gated visibility
- `tasks/phase-20-owner-services/P20-E03-admin-owner-request-management.md` — queue/table/task-writing depth reference for admin pages

### Key Rules

1. Create `src/app/(admin)/admin/support/page.tsx` following the same top-level structure as `src/app/(admin)/admin/leads/page.tsx` (`useQuery` current user/roles -> permission gate -> tabs + filters -> table -> detail panel state handoff).
2. Permission gate is mandatory: require `SUPPORT_INQUIRIES_VIEW` for queue visibility; render a clear no-access state for unauthorized admins.
3. Add status tabs in this exact order with count badges from `statusCounts`: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.
4. Include query-driven filters for `status`, `persona_type`, `preferred_contact_method`, and `assigned_admin_id`.
5. Table must be paginated and reactive using Convex query hooks (`usePaginatedQuery` for rows and `useQuery` for counts).
6. Table column order is fixed and must match exactly: `#`, `Name`, `Subject`, `Persona`, `Status`, `Assigned`, `Created`.
7. `Status` column must render with shadcn `Badge` styling that maps to constants from `notes/13-constants-reference.md` lines 576-583; do not hardcode one-off color classes per row.
8. `Assigned` column should display assignee name when `assigned_admin_id` is set, else fallback label (`Unassigned`).
9. Route-level state must clear selected row when tab/filter changes so stale detail context never remains visible.
10. Update `src/app/(admin)/admin-layout-client.tsx` to add sidebar item:
    - `label: "Support"`
    - `href: "/admin/support"`
    - icon from `lucide-react` (`MessageSquare` preferred; `HelpCircle` acceptable)
    - permission gate tied to `SUPPORT_INQUIRIES_VIEW`
11. Keep admin page desktop-first but responsive for smaller screens (filters wrap, table container scrolls horizontally when needed).
12. Include explicit loading and empty states for counts and table rows.
13. Follow shadcn/ui component conventions (`Tabs`, `Badge`, `Select`, `Button`, table primitives); no ad-hoc native input controls where shadcn components exist.
14. Maintain strict type safety and file naming conventions (kebab-case, no `as any`, no `@ts-ignore`).

### Deliverables

- [ ] `src/app/(admin)/admin/support/page.tsx` — support inbox route with permission gate, status tabs, filters, table composition, and selected inquiry state
- [ ] `src/app/(admin)/admin-layout-client.tsx` — sidebar "Support" nav item with icon and permission requirement

### Acceptance Criteria

1. `/admin/support` renders for authorized admins and blocks unauthorized admins with a clear permission message.
2. Status tabs show `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED` with reactive counts from support `statusCounts` query.
3. Filters for `status`, `persona_type`, `preferred_contact_method`, and `assigned_admin_id` are functional and applied to query args.
4. Table renders columns in exact specified order and supports cursor pagination (`Load More` or equivalent).
5. Status badges use centralized support inquiry status colors from constants reference.
6. Row selection state is wired for detail panel handoff and resets when tab/filter context changes.
7. Admin sidebar includes `Support` link and only shows it to users with `SUPPORT_INQUIRIES_VIEW`.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/support/page.tsx` and `src/app/(admin)/admin-layout-client.tsx`.

### Out of Scope

- Detail panel internals and status-action dialogs (T02)
- Assignment and `ops_notes` edit flow (T03)
- Backend support inquiry query/mutation implementation (P21-E01)

---

## T02: Detail Panel + Status Action Dialogs

### Objective

Implement a Sheet-based inquiry detail panel with status-transition action buttons and confirmation dialogs that only expose legal forward transitions.

### Required Reading

- `notes/04-state-machines.md` — support inquiry transitions (lines 821-826)
- `notes/06-admin-panel-ux.md` — support queue interaction expectations (lines 440-463)
- `notes/13-constants-reference.md` — support inquiry status values/colors (lines 576-583)
- `tasks/phase-19-tenant-inquiry-pipeline/P19-E03-tenant-form-admin-management.md` — T04 detail panel + dialog structure
- `tasks/phase-20-owner-services/P20-E03-admin-owner-request-management.md` — T02/T03 status-gated dialog approach
- `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — canonical Sheet interaction model for admin detail workflows
- `src/components/ui/sheet.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/button.tsx`, `src/components/ui/badge.tsx` — required UI primitives

### Key Rules

1. Build a slide-out support inquiry detail panel using shadcn `Sheet`; open on row selection and close via explicit dismiss action.
2. Panel must display full inquiry context: name, phone, email, subject, message, persona type, preferred contact method, source channel, assigned admin, status badge, and timestamps.
3. Status action visibility is strictly current-state based:
   - From `OPEN`: show `Start Progress` (`-> IN_PROGRESS`), `Resolve` (`-> RESOLVED`), `Close` (`-> CLOSED`)
   - From `IN_PROGRESS`: show `Resolve` (`-> RESOLVED`), `Close` (`-> CLOSED`)
   - From `RESOLVED`: show `Close` (`-> CLOSED`)
   - From `CLOSED`: show no status actions
4. **No Reopen action** may be added anywhere in UI or dialog flows.
5. Do not render invalid transitions as disabled or muted controls; only legal actions should be visible.
6. Use `useMutation` hooks for status updates and keep mutation payload aligned with backend transition API.
7. `Close` must use a confirmation dialog before mutating status; `Start Progress` and `Resolve` may use direct confirmation or lightweight dialog pattern consistent with existing admin pages.
8. All actions must show success/error toasts (`sonner`) with concise admin-facing copy.
9. Pending action buttons must disable duplicate submissions and show in-button loading state.
10. On successful action, table and panel data should refresh reactively, and action set should immediately reflect the new status.
11. Keep dialog/panel state synchronized when selected inquiry changes while panel is open.
12. If contact fields are missing (optional phone/contact method), render explicit fallback text instead of blank values.
13. Preserve strict type safety (typed status unions, no `as any`, no `@ts-ignore`).

### Deliverables

- [ ] `src/components/admin/support-inquiry-detail-panel.tsx` — Sheet detail panel with status-gated actions and confirmation dialogs
- [ ] `src/app/(admin)/admin/support/page.tsx` — integration of row selection with detail panel open/close lifecycle

### Acceptance Criteria

1. Clicking a table row opens support inquiry detail panel with full inquiry context.
2. Visible action buttons match legal transitions for `OPEN`, `IN_PROGRESS`, and `RESOLVED` exactly.
3. `CLOSED` inquiries show no status transition actions.
4. `Close` action always requires confirmation before status update.
5. No UI path exposes a reopen transition from `CLOSED`.
6. Success and failure toasts are shown for status actions.
7. Action controls prevent duplicate submits while pending.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/support-inquiry-detail-panel.tsx` and `src/app/(admin)/admin/support/page.tsx`.

### Out of Scope

- Assignment controls and "Assign to Me" shortcut (T03)
- `ops_notes` editing behavior (T03)
- CRM dashboard summary cards (separate epic)

---

## T03: Assignment Flow + Internal Notes

### Objective

Add assignment workflows (`Assign to` and `Assign to Me`) and internal `ops_notes` editing to complete practical support-operations handling in the detail panel and queue view.

### Required Reading

- `notes/06-admin-panel-ux.md` — support queue actions list (`Assign to admin`, `add internal notes`)
- `notes/02-data-models.md` — support inquiry fields (`assigned_admin_id`, status, metadata)
- `notes/10-convex-schema.md` — support inquiry schema shape and indexed fields
- `src/app/(admin)/admin/leads/page.tsx` — current-user + role assignment query pattern
- `src/components/admin/support-inquiry-detail-panel.tsx` — panel baseline from T02
- `src/components/ui/select.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/button.tsx` — assignment and notes input controls

### Key Rules

1. Add an `Assign to` dropdown in the detail panel that lists admin users and calls support inquiry `assign` mutation with selected `assigned_admin_id`.
2. Add `Assign to Me` quick action that assigns the currently logged-in admin without opening additional dialogs.
3. Admin options must come from existing admin-user query patterns (only active admin users; do not include guard/tenant/owner users).
4. Render assignment result in both queue table (`Assigned` column) and detail panel summary.
5. Add editable `ops_notes` field in detail panel using shadcn `Textarea`.
6. Persist notes via dedicated `updateOpsNotes` mutation.
7. Choose one save strategy and document it in implementation:
   - explicit `Save Notes` button (preferred for reliability), or
   - debounced autosave with clear pending/saved indicator.
8. `ops_notes` is internal-only; do not expose notes in any submitter-facing UI flow.
9. Notes save UX must include visible pending state and success/error feedback.
10. Assignment and notes operations must preserve current selection and avoid unintended panel close.
11. Keep mutation error handling user-readable; no raw stack traces in toasts.
12. Ensure assignment controls respect permission model (`SUPPORT_INQUIRIES_VIEW` to see queue; manage permission for mutate actions if backend enforces it).
13. Preserve typing across assignment options and current-user IDs; avoid unsafe casts.
14. Keep this task scoped to support inbox internals; do not add bulk assignment, SLA timers, or export actions.

### Deliverables

- [ ] `src/components/admin/support-inquiry-detail-panel.tsx` — assignment controls, assign-to-me action, and editable `ops_notes` section
- [ ] `src/app/(admin)/admin/support/page.tsx` — assigned-admin filter wiring and selected-row data refresh handling

### Acceptance Criteria

1. `Assign to` dropdown lists eligible admins and updates `assigned_admin_id` via mutation.
2. `Assign to Me` sets assignment to the current logged-in admin.
3. Assigned admin is visible in table row and detail panel after mutation.
4. `ops_notes` can be edited and saved successfully.
5. Saved notes persist on panel close/reopen and page refresh.
6. Notes and assignment flows show clear success/error feedback.
7. Internal notes never appear in any public/submitter surface.
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/admin/support-inquiry-detail-panel.tsx` and `src/app/(admin)/admin/support/page.tsx`.

### Out of Scope

- Reopen transition or backward status transitions
- Bulk assignment or bulk status update operations
- SLA automation, escalation rules, or analytics dashboards

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-19

### What Was Built

- Added `/admin/support` route with permission gating, status tabs (`ALL`, `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), and row-selection state.
- Implemented support inbox table with reactive pagination, centralized status badge colors, and assigned-admin display.
- Built a Sheet-based detail panel with legal transition actions (no reopen path), assignment dialog, assign-to-me action, and inline ops notes editing.
- Added sidebar navigation entry and badge support for open support inquiries.

### Key File Locations

| File                                                                | What                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/app/(admin)/admin/support/page.tsx`                            | Support inbox route, permission checks, tabs, table/panel wiring                |
| `src/app/(admin)/admin/support/components/inquiry-table.tsx`        | Paginated support inbox table with status badges and selection                  |
| `src/app/(admin)/admin/support/components/inquiry-detail-panel.tsx` | Sheet detail view, status confirmation dialogs, assignment, and notes workflows |
| `src/components/admin/admin-nav-items.ts`                           | Added `Support Inbox` sidebar item with permission gate                         |
| `src/app/(admin)/admin-layout-client.tsx`                           | Added open-support badge query and rendering for `/admin/support` nav item      |

### Deviations from Spec

None - implemented exactly as specified for support inbox UI and navigation scope.

### Gotchas for Next Epic

- Status action buttons are rendered only for valid forward transitions from the current status; invalid actions are not shown.
- Assignment options are sourced from `api.admins.listAdmins`, which already returns active admins only.
- Detail panel reads and writes ops notes through dedicated `updateOpsNotes` mutation for clean separation from status transitions.
