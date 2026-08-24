---
id: P27-E04
title: Verification Page + Sidebar Fix
phase: 27
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P27-E04: Verification Page + Sidebar Fix

## Overview

Create the standalone verification page at `/admin/verification` and unlock it in the sidebar. The backend is fully implemented (`convex/verifications.ts` has `listByLead` and `create`). This epic builds the missing frontend: a verification queue table with priority indicators, status filter tabs, an inline verification dialog, and bulk actions for duplicate rejection.

## Task Queue

- [x] P27-E04-T01: Enable Verification in sidebar
- [x] P27-E04-T02: Verification Queue table
- [x] P27-E04-T03: Status filter tabs + priority indicators
- [x] P27-E04-T04: Inline Verification dialog
- [x] P27-E04-T05: Bulk actions

---

## T01: Enable Verification in sidebar

### Objective

Remove the "Soon" badge from the Verification sidebar item and enable navigation to `/admin/verification`. One targeted edit to `admin-layout-client.tsx`.

### Required Reading

- `src/app/(admin)/admin-layout-client.tsx` — Current file. Verification nav item is at line 67 with `available: false`. Read the full nav item structure before editing.
- `notes/06-admin-panel-ux.md` — "Sidebar Navigation" section (item order, RBAC visibility, badge counts)
- `notes/03-roles-and-permissions.md` — `leads.verify` permission string

### Key Rules

1. Read `src/app/(admin)/admin-layout-client.tsx` before editing. The nav item at line 67 has `available: false` — this is what shows the "Soon" badge.
2. Change `available: false` to `available: true` on the Verification nav item.
3. Add `requiredPermission: "leads.verify"` to the Verification nav item so it's hidden for admins without that permission. Use the same `requiredPermission` pattern as other nav items in the file.
4. The `href` should already be `/admin/verification` — confirm it is and do not change it.
5. Do NOT change any other nav items. This is a surgical single-item edit.
6. After the edit, the sidebar should show "Verify" (or whatever label is already there) as a normal clickable link with no "Soon" badge.

### Deliverables

- [ ] `src/app/(admin)/admin-layout-client.tsx` — Verification nav item updated: `available: true`, `requiredPermission: "leads.verify"` added

### Acceptance Criteria

1. Verification nav item no longer shows a "Soon" badge
2. Clicking the nav item navigates to `/admin/verification`
3. Nav item is hidden for admins without `leads.verify` permission
4. No other nav items are changed
5. `npx tsc --noEmit` passes with no errors on this file

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin-layout-client.tsx` and confirm zero errors.

### Out of Scope

- Adding badge counts to the Verification nav item (badge counts are a P27-E06 concern)
- Changing any other sidebar items
- Creating the verification page itself (T02)

---

## T02: Verification Queue table

### Objective

Create the verification page at `/admin/verification` with a paginated table of leads awaiting verification. Each row shows the key details ops needs to prioritize a call, plus an action button to open the inline verification dialog (built in T04).

### Required Reading

- `notes/features/04-owner-verification.md` — Full file. Business rules, call outcome values, consent requirements, two-step duplicate flow.
- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" (table column patterns, side panel conventions), "Table Patterns" section
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum values, `leads.verify` permission, `leads.view` permission
- `notes/10-convex-schema.md` — `leads` table fields: `society_id`, `building_id`, `flat_number`, `owner_name`, `owner_phone`, `submitted_by_guard_id`, `status`, `quality_flags`, `prospective_bounty`, `_creationTime`

### Key Rules

1. Route: `src/app/(admin)/admin/verification/page.tsx`. The `(admin)` route group provides the admin layout; the real `admin/` directory adds `/admin/` to the URL.
2. Query: `api.leads.list` filtered to `status: "SUBMITTED"` for the default view. This query already exists — do NOT create a new backend function.
3. Table columns:
   - Society name
   - Building / Floor / Flat (combined: "Tower A / Floor 12 / 1201")
   - Owner Name
   - Phone (masked: show first 5 digits + "XXXXX", e.g., "98765XXXXX" — ops can unmask by clicking)
   - Guard name
   - Days Waiting (computed client-side: `Math.floor((Date.now() - lead._creationTime) / 86400000)`)
   - Quality Flags (badge icons — see Key Rule 6)
   - Status badge
   - Actions column ("Verify" button)
4. Days Waiting color coding: < 1 day = green text, 1-3 days = amber text, > 3 days = red text with a warning icon.
5. Phone masking: Default shows masked value. A small eye icon button toggles full visibility for that row. No backend call needed — just client-side state.
6. Quality flags: Render small badge icons for each flag present on the lead. `POTENTIAL_DUPLICATE` = orange "Dup?" badge. `GUARD_HIGH_REJECTION` = red "⚠" badge. If no flags, render nothing.
7. Pagination: 20 items per page using `usePaginatedQuery`. Show "Load More" button.
8. Default sort: oldest first (longest waiting at top). `api.leads.list` should support ordering — use `order: "asc"` if available, otherwise sort client-side on `_creationTime`.
9. Loading state: `Skeleton` rows. Empty state: "No leads awaiting verification." with a checkmark icon.
10. Page requires `leads.verify` permission. If the current admin lacks it, show an "Access Denied" message.
11. The "Verify" button per row opens the inline dialog from T04. Pass the lead data as a prop. The dialog component is built in T04 — for now, render a placeholder button that logs to console.

### Deliverables

- [ ] `src/app/(admin)/admin/verification/page.tsx` — Verification queue page with table, pagination, loading/empty states
- [ ] `src/components/admin/VerificationTable.tsx` — Table component with all columns, days-waiting color coding, phone masking, quality flag badges

### Acceptance Criteria

1. Page renders at `/admin/verification` within the admin layout
2. Table shows SUBMITTED leads with all 8 columns
3. Days Waiting column shows correct value with correct color (green/amber/red)
4. Phone column shows masked value by default; eye icon toggles full phone number
5. Quality flag badges render for leads with `POTENTIAL_DUPLICATE` or `GUARD_HIGH_REJECTION` flags
6. Oldest leads appear at the top of the table
7. "Load More" button appears when more than 20 leads exist
8. Empty state renders when no SUBMITTED leads exist
9. Skeleton rows render during initial load
10. `npx tsc --noEmit` passes with no errors on these files

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/verification/page.tsx` and `src/components/admin/VerificationTable.tsx`. Confirm zero errors on both files.

### Out of Scope

- Status filter tabs (T03)
- Inline verification dialog implementation (T04)
- Bulk actions (T05)
- Creating new backend queries

---

## T03: Status filter tabs + priority indicators

### Objective

Add status filter tabs above the verification table so ops can switch between leads at different stages. Enhance the priority indicators with high-value lead flagging and POTENTIAL_DUPLICATE warnings.

### Required Reading

- `notes/features/04-owner-verification.md` — "Step 1: Admin Opens Verification Form" (two-step duplicate flow — POTENTIAL_DUPLICATE must be cleared before verification)
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum values: SUBMITTED, VERIFIED, REJECTED, POTENTIAL_DUPLICATE, NEED_INFO, DUPLICATE
- `notes/10-convex-schema.md` — `leads` table `prospective_bounty` field (paise integer, nullable)

### Key Rules

1. Tab bar above the table: "Pending Verification" (SUBMITTED leads) | "Verified" (VERIFIED leads) | "Rejected" (REJECTED leads) | "All" (all statuses). Default active tab: "Pending Verification".
2. Each tab shows a count badge with the number of leads in that status. Use `useQuery(api.leads.list, { status: tabStatus })` to get counts — or derive from the paginated results if the query returns total count. Do NOT create new backend queries.
3. Switching tabs updates the `api.leads.list` filter passed to `VerificationTable`. Pass the active status as a prop.
4. Priority indicators (enhancements to the existing Days Waiting column from T02):
   - High-value lead flag: If `prospective_bounty` is set and > 0, show a small gold "₹" badge next to the Days Waiting value. Tooltip: "High-value lead — bounty set".
   - POTENTIAL_DUPLICATE warning: If lead status is `POTENTIAL_DUPLICATE`, show an orange "Dup?" badge in the Status column. Add a tooltip: "Must clear duplicate flag before verifying — two-step flow required."
5. The POTENTIAL_DUPLICATE tab is NOT included in the tab bar (those leads need the duplicate flag cleared first, not verified directly). They appear in the "All" tab only.
6. Sort order: Within each tab, oldest first (longest waiting at top). This is the same default from T02.
7. Tab counts update in real-time via Convex subscriptions (no manual refresh needed).
8. Use shadcn/ui `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` for the tab bar.

### Deliverables

- [ ] `src/app/(admin)/admin/verification/page.tsx` — Updated with status filter tabs, tab count badges, active tab state management
- [ ] `src/components/admin/VerificationTable.tsx` — Updated with high-value lead flag and POTENTIAL_DUPLICATE tooltip

### Acceptance Criteria

1. Four tabs render: "Pending Verification", "Verified", "Rejected", "All"
2. Each tab shows a count badge with the correct number of leads
3. Clicking a tab updates the table to show only leads with that status
4. "Pending Verification" tab is active by default
5. High-value leads (prospective_bounty > 0) show a gold "₹" badge next to Days Waiting
6. POTENTIAL_DUPLICATE leads show an orange "Dup?" badge with tooltip in the Status column
7. Tab counts update in real-time when lead statuses change
8. `npx tsc --noEmit` passes with no errors on modified files

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/verification/page.tsx` and `src/components/admin/VerificationTable.tsx`. Confirm zero errors on both files.

### Out of Scope

- POTENTIAL_DUPLICATE tab (those leads need duplicate flag cleared first)
- Sorting by columns other than date (V2)
- Creating new backend queries

---

## T04: Inline Verification dialog

### Objective

Build the verification dialog that opens when ops clicks "Verify" on a lead row. The dialog contains the full verification form — call outcome, consent checkboxes, visit slots, rent confirmation, notes — and submits to `api.verifications.create`. On success, the table refreshes automatically via Convex's real-time subscriptions.

### Required Reading

- `notes/features/04-owner-verification.md` — Full file. Call outcome values (`VERIFIED`, `UNREACHABLE`, `DECLINED`, `FALSE`), consent rules (contact consent required for VERIFIED transition), field requirements, business rules, edge cases.
- `notes/13-constants-reference.md` — `VERIFICATION_CALL_OUTCOME` enum values, `leads.verify` permission
- `notes/10-convex-schema.md` — `owner_verifications` table fields: `lead_id`, `call_outcome`, `consent_contact_demorentals`, `consent_visit_coordination`, `preferred_visit_slots`, `rent_confirmed`, `notes`, `called_by_admin_id`

### Key Rules

1. Component: `src/components/admin/VerificationDialog.tsx`. Props: `open: boolean`, `onOpenChange: (open: boolean) => void`, `lead: Lead` (the lead being verified).
2. Use shadcn/ui `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `RadioGroup`, `RadioGroupItem`, `Checkbox`, `Input`, `Textarea`, `Button`, `Label`.
3. Form fields (match `notes/features/04-owner-verification.md` exactly):
   - Call Outcome (RadioGroup, required): VERIFIED | UNREACHABLE | DECLINED | FALSE. Display labels: "Verified", "Unreachable", "Declined", "False / Wrong Info".
   - Owner Consents to DemoRentals Contact (Checkbox): Only shown when Call Outcome = VERIFIED. Required to submit when VERIFIED.
   - Owner Consents to Visit Coordination (Checkbox): Only shown when Call Outcome = VERIFIED AND contact consent is checked.
   - Preferred Visit Slots (Input, optional): Only shown when Call Outcome = VERIFIED.
   - Rent Confirmed (Input, optional): Number input in rupees (display). Store as paise: multiply by 100 before submitting. Only shown when Call Outcome = VERIFIED.
   - Notes (Textarea, optional): Always shown.
4. Validation rules (enforce in form, not just backend):
   - Call Outcome is required — cannot submit without selecting one.
   - If Call Outcome = VERIFIED and `consent_contact_demorentals` is false: disable the submit button and show inline message "Owner consent is required to verify this lead."
5. On submit: call `useMutation(api.verifications.create)` with the form data. Convert rent from rupees to paise (`Math.round(rupees * 100)`).
6. On success: show `toast.success("Verification recorded")` via `sonner`, close the dialog, reset the form.
7. On error: show `toast.error(error.message)` via `sonner`. Do NOT close the dialog on error.
8. Submit button shows a spinner and is disabled while the mutation is in-flight.
9. Dialog header shows: "Verify Lead — [Building] [Flat]" and the owner phone number with a click-to-call `tel:` link.
10. Use `react-hook-form` + `zod` for form state and validation. No uncontrolled inputs.
11. The dialog does NOT show previous verification attempts — that's visible on the lead detail panel. Keep this dialog focused on recording a new attempt.

### Deliverables

- [ ] `src/components/admin/VerificationDialog.tsx` — Verification form dialog with all fields, conditional rendering, validation, mutation call, toast feedback
- [ ] `src/app/(admin)/admin/verification/page.tsx` — Updated to import and render `VerificationDialog`, passing the selected lead and open state

### Acceptance Criteria

1. Dialog opens when "Verify" button is clicked on a table row
2. Dialog header shows the lead's building, flat, and owner phone with a `tel:` link
3. Call Outcome radio group renders all 4 options
4. Consent checkboxes only appear when Call Outcome = VERIFIED
5. Visit Coordination consent only appears when Contact consent is checked
6. Preferred Visit Slots and Rent Confirmed inputs only appear when Call Outcome = VERIFIED
7. Submitting without selecting a Call Outcome shows a validation error
8. Submitting VERIFIED without contact consent shows "Owner consent is required" and disables submit
9. Successful submission shows "Verification recorded" toast and closes the dialog
10. Failed submission shows the error message in a toast and keeps the dialog open
11. Submit button is disabled and shows a spinner during mutation
12. Rent input accepts rupees and the mutation receives paise (rupees × 100)
13. `npx tsc --noEmit` passes with no errors on these files

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/VerificationDialog.tsx` and `src/app/(admin)/admin/verification/page.tsx`. Confirm zero errors on both files.

### Out of Scope

- Showing previous verification attempts in the dialog (visible on lead detail panel)
- Two-step duplicate flow UI (POTENTIAL_DUPLICATE leads need a separate "Clear Duplicate" action, not this dialog)
- Creating new backend mutations

---

## T05: Bulk actions

### Objective

Add multi-select checkboxes to the verification table and a bulk action bar that appears when rows are selected. Ops can bulk-reject duplicate leads or bulk-assign leads for verification without opening each one individually.

### Required Reading

- `notes/features/04-owner-verification.md` — Business rules: only SUBMITTED leads can be verified; POTENTIAL_DUPLICATE leads must have flag cleared first.
- `notes/13-constants-reference.md` — `leads.reject` permission (for bulk reject), `leads.verify` permission (for bulk assign), `LEAD_STATUS` enum
- `notes/06-admin-panel-ux.md` — "Table Patterns" section (bulk actions, checkbox column)

### Key Rules

1. Add a checkbox column as the first column in `VerificationTable`. Selecting a row adds the lead ID to a `selectedIds: Set<string>` state in the parent page component.
2. A "select all on this page" checkbox in the column header selects/deselects all visible rows.
3. Bulk action bar: Renders above the table (below the filter tabs) when `selectedIds.size > 0`. Hidden when nothing is selected.
4. Bulk action bar contents:
   - Count badge: "N selected" (e.g., "3 selected")
   - "Reject as Duplicate" button (requires `leads.reject` permission — hide if lacking)
   - "Assign for Verification" button (requires `leads.verify` permission — hide if lacking)
   - "Clear Selection" button (always visible when bar is shown)
5. "Reject as Duplicate" flow:
   - Opens a confirmation `AlertDialog`: "Reject N leads as duplicates? This cannot be undone."
   - On confirm: call `api.leads.update` (or the appropriate reject mutation) for each selected lead with `status: "DUPLICATE"`. Run calls sequentially with `Promise.all` — do NOT create a new bulk backend mutation.
   - On complete: show `toast.success("N leads rejected as duplicates")`, clear selection.
   - On any error: show `toast.error("Some leads could not be rejected: [error]")`, clear selection.
6. "Assign for Verification" flow:
   - No confirmation dialog needed.
   - This is a no-op in V1 — verification is done by any admin who opens the dialog. "Assign" in this context means marking the lead as "being worked on" which is not a status transition. Show a `toast.info("Leads marked for verification — open each to record the call outcome.")` and clear selection.
   - Do NOT create a new backend mutation for this.
7. Selection is cleared when: the user clicks "Clear Selection", after a bulk action completes, or when the active tab changes.
8. Only leads on the current page can be selected (no cross-page selection in V1).
9. Permission checks: Use the same permission-gating pattern as other admin components. If the current admin has neither `leads.reject` nor `leads.verify`, the bulk action bar shows only the "Clear Selection" button.

### Deliverables

- [ ] `src/components/admin/VerificationTable.tsx` — Updated with checkbox column, select-all header checkbox, `selectedIds` prop and `onSelectionChange` callback
- [ ] `src/app/(admin)/admin/verification/page.tsx` — Updated with `selectedIds` state, bulk action bar component, confirmation dialog for bulk reject

### Acceptance Criteria

1. Checkbox column renders as the first column in the table
2. Selecting a row adds it to the selected set; deselecting removes it
3. Select-all checkbox in the header selects/deselects all visible rows
4. Bulk action bar appears above the table when at least one row is selected
5. "N selected" count badge shows the correct count
6. "Reject as Duplicate" button is hidden for admins without `leads.reject` permission
7. "Assign for Verification" button is hidden for admins without `leads.verify` permission
8. Clicking "Reject as Duplicate" opens a confirmation dialog with the correct count
9. Confirming bulk reject calls the reject mutation for each selected lead and shows success toast
10. "Assign for Verification" shows the info toast and clears selection
11. "Clear Selection" clears all selected rows and hides the bulk action bar
12. Selection clears when switching tabs
13. `npx tsc --noEmit` passes with no errors on modified files

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/VerificationTable.tsx` and `src/app/(admin)/admin/verification/page.tsx`. Confirm zero errors on both files.

### Out of Scope

- Cross-page selection (V2)
- Bulk assign to a specific admin (V2 — requires a new backend mutation)
- Creating new backend mutations for bulk operations
- Bulk NEED_INFO action (V2)
