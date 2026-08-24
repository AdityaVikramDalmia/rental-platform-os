---
id: P03-E02
title: Guard Admin UI
phase: 3
status: done
depends_on: ["P03-E01", "P02-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P03-E02: Guard Admin UI

## Overview

Build the admin-facing guard management interface: sidebar navigation entry, guard list page with filters/search, add guard dialog (with temp password reveal), guard detail page with tabbed layout, management dialogs (edit profile, change status with ban confirmation, reset password), and populate the Guards tab on the society detail page from Phase 2.

## Prerequisites

- **Read first**: [P03-E01 Completion Summary](P03-E01-guard-account-backend.md#completion-summary) — know what backend functions exist and their exact signatures.
- **Read first**: [P02-E01 Completion Summary](../phase-02-society-registry/P02-E01-society-crud.md#completion-summary) — know the society detail page structure and tab skeleton.
- Guard backend (E01) fully working: mutations, queries, WorkOS Actions.
- Phase 2 society detail page has Guards tab placeholder ready to populate.

## Task Queue

- [x] P03-E02-T01: Admin Sidebar Navigation Update
- [x] P03-E02-T02: Guard List Page
- [x] P03-E02-T03: Add Guard Dialog
- [x] P03-E02-T04: Guard Detail Page
- [x] P03-E02-T05: Guard Management Dialogs
- [x] P03-E02-T06: Society Guards Tab

---

## T01: Admin Sidebar Navigation Update

### Objective

Add the "Guards" entry to the admin sidebar navigation, positioned after "Societies" in the Operations group. Same pattern as P02-E01-T03 which added "Societies".

### Required Reading

- `notes/06-admin-panel-ux.md` — "Sidebar Navigation" section (item order: Dashboard, Societies, Guards, Leads, ...)
- Existing admin sidebar component (created in P01-E06, updated in P02-E01-T03)

### Key Rules

1. Find the admin sidebar component (updated in P02-E01-T03 to include Societies).
2. Add "Guards" link with icon (Shield or UserCheck from lucide-react).
3. Position: After "Societies", before any future items.
4. Link target: `/admin/guards`.
5. Active state: highlighted when URL matches `/admin/guards` or `/admin/guards/*`.
6. RBAC visibility: Only show if user has `guards.view` permission.
7. Follow the exact same pattern used for the "Societies" sidebar entry.
8. Do NOT add links for items from future phases (Leads, Verification, etc.).

### Deliverables

- [ ] Admin sidebar component — Updated with "Guards" navigation link

### Acceptance Criteria

1. "Guards" link appears after "Societies" in the admin sidebar
2. Clicking navigates to `/admin/guards`
3. Link highlighted when on `/admin/guards` or `/admin/guards/[id]`
4. Link hidden for users without `guards.view` permission
5. Icon visible in both expanded and collapsed sidebar modes
6. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Adding sidebar links for future phases
- Badge counts on sidebar items

---

## T02: Guard List Page

### Objective

Create the admin guard list page at `/admin/guards`. Shows a table of all guards with name, phone, society, type, status, leads count, and verified rate. Supports filtering by society, type, and status. Includes search by name/phone and an "Add Guard" button.

### Required Reading

- `notes/features/02-guard-management.md` — "Admin Panel UI: Guard List Page" section (columns, filters, actions)
- `notes/06-admin-panel-ux.md` — Guard list page layout, table patterns
- `notes/01-tech-stack.md` — "Client-Side Libraries" (shadcn/ui, sonner, react-hook-form)

### Key Rules

1. Route: `src/app/(admin)/admin/guards/page.tsx`. The `(admin)` route group provides admin layout; the real `admin/` directory adds `/admin/` to the URL.
2. Use shadcn/ui: `Table`, `Badge`, `Input`, `Button`, `Select`, `Avatar`.
3. Table columns:
   - **Name** (clickable → `/admin/guards/[id]`): Guard name with small avatar
   - **Phone**: Formatted as +91 XXXXX XXXXX (display only, stored as 10 digits)
   - **Society**: Society name (from enriched query)
   - **Type**: Badge — `BUILDING_SPECIFIC` → "Building", `MAIN_GATE` → "Main Gate", `PARK` → "Park", `ROVING` → "Roving"
   - **Status**: Badge — `ACTIVE` green, `INACTIVE` gray, `BANNED` red
   - **Leads**: Total lead count
   - **Verified Rate**: Percentage (e.g., "85%") — display "—" if 0 leads
   - **Created**: Formatted date
4. Filters at top:
   - Society dropdown (populated from `societies.list` query)
   - Type dropdown (All, Building, Main Gate, Park, Roving)
   - Status tabs or dropdown (All, Active, Inactive, Banned)
5. Search bar: Debounced 300ms. When non-empty, uses `guards.search`. When empty, uses `guards.list`.
6. "Add Guard" button in header → opens GuardCreateDialog (T03).
7. Use `useQuery` from `convex/react` for real-time subscriptions.
8. Empty state: "No guards found. Add your first guard to get started."
9. Loading: Skeleton rows while query loads.
10. V1: ~50 guards max. Pagination deferred. Add comment: `// V1: ~50 guards, pagination deferred`.

### Deliverables

- [ ] `src/app/(admin)/admin/guards/page.tsx` — Guard list page
- [ ] `src/components/admin/GuardTable.tsx` — Reusable guard table component

### Acceptance Criteria

1. Page renders at `/admin/guards` within admin layout
2. Table shows all guards with correct columns
3. Type badges display human-readable labels (not raw enum values)
4. Status badges use correct colors (green/gray/red)
5. Clicking guard name navigates to `/admin/guards/[id]`
6. Society filter works (shows guards from selected society only)
7. Type filter works
8. Status filter works
9. Search by name/phone works with debounce
10. "Add Guard" button visible
11. Empty state and loading skeletons work
12. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Add Guard dialog implementation (T03)
- Guard detail page (T04)
- Sorting by column headers (V2)
- CSV export (V2)

---

## T03: Add Guard Dialog

### Objective

Create a dialog for adding new guard accounts. Admin enters name, phone, society, type, and a temporary password. On submit, calls the WorkOS Action to create the account. On success, shows the temp password in a one-time-view modal so admin can share it with the guard verbally.

### Required Reading

- `notes/features/02-guard-management.md` — "User Stories: Admin Create Guard Account" (flow + acceptance criteria), "Add Guard Dialog" section
- `notes/01-tech-stack.md` — "Forms" (react-hook-form + zod), "Toasts" (sonner)

### Key Rules

1. Component: `src/components/admin/GuardCreateDialog.tsx`. Accept props: `open`, `onOpenChange`.
2. Use shadcn/ui: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Form`, `FormField`, `Input`, `Select`, `Button`.
3. Zod schema:
   - `name`: `z.string().min(1, "Name is required").trim()`
   - `phone`: `z.string().regex(/^\d{10}$/, "Must be 10 digits")` — strip non-digits before validation
   - `society_id`: `z.string().min(1, "Society is required")` (Convex ID as string)
   - `guard_type`: `z.enum(["BUILDING_SPECIFIC", "MAIN_GATE", "PARK", "ROVING"])`
   - `temp_password`: `z.string().min(8, "Minimum 8 characters")` — admin sets this
4. Society dropdown: Populated from `societies.list` query (real-time). Show society name + city.
5. Guard type dropdown labels: "Building Guard", "Main Gate Guard", "Park Guard", "Roving Guard".
6. On submit:
   - Call `actions.workos.createGuardAccount` Action directly from frontend.
   - While in-flight: disable submit button, show spinner.
   - On success: close the form dialog → open a **separate "Credentials" dialog** showing:

     ```
     Guard Created Successfully!

     Username: 9876543210
     Temporary Password: ••••••••  [Show] [Copy]

     Share these credentials with the guard.
     The guard will be required to change their password on first login.

     [Done]
     ```

   - On error: show error toast (e.g., "Phone number already in use").

7. **Credentials dialog** is a separate component or a second step within the same dialog. The temp password must be copiable. Show/hide toggle. This is the ONLY time the password is visible — it's not stored in Convex.
8. Phone input: numeric keyboard hint (`inputMode="numeric"`), auto-strip +91 prefix and spaces.
9. Disable submit while action is in flight.

### Deliverables

- [ ] `src/components/admin/GuardCreateDialog.tsx` — Add guard dialog with form + credentials reveal

### Acceptance Criteria

1. Dialog opens with empty form fields
2. Society dropdown populated with available societies
3. Guard type dropdown shows human-readable labels
4. Submitting with empty fields shows validation errors
5. Phone with non-10-digits shows validation error
6. Successful creation closes form and shows credentials dialog
7. Credentials dialog shows username (phone) and temp password
8. Temp password has show/hide toggle and copy button
9. Phone uniqueness error shows appropriate toast
10. Submit button disabled during action execution
11. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
npm run build
```

### Out of Scope

- Edit guard dialog (T05)
- Bulk guard creation (V2)
- Auto-generate password (V2 — V1 admin sets it manually)

---

## T04: Guard Detail Page

### Objective

Create the guard detail page at `/admin/guards/[id]`. Shows guard header with name, photo, status badge, type badge, and quick action buttons. Below that, a tabbed layout with 7 tabs. Only Profile tab is populated in this epic — others show placeholders. Shifts tab is populated in E03, guard portal tabs in later phases.

### Required Reading

- `notes/features/02-guard-management.md` — "Admin Panel UI: Guard Detail Page" section (tabs, header, actions)
- `notes/06-admin-panel-ux.md` — Guard detail page layout, tab patterns

### Key Rules

1. Route: `src/app/(admin)/admin/guards/[id]/page.tsx`. Extract `id` from params. This is the `user_id` (from `users` table).
2. Use `guards.getById` query (E01-T04) to fetch guard with stats.
3. Header section:
   - Guard photo (or default avatar if no photo)
   - Guard name (large heading)
   - Status badge: `ACTIVE` green, `INACTIVE` gray, `BANNED` red
   - Type badge: human-readable label
   - Phone: formatted +91 XXXXX XXXXX
   - Society name + link to society detail page
   - Quick action buttons: "Edit" (T05), "Reset Password" (T05), "Change Status" (T05)
4. Stat cards row:
   - Total Leads (number)
   - Verified Rate (percentage)
   - Total Visits (number)
   - Total Earnings (formatted ₹ amount — paise → rupees via `lib/money.ts`)
5. Tab layout using shadcn `Tabs`:
   - **Profile** (default active): Show guard details — name, phone, society, type, metadata, created date. Inline display (read-only). Edit via dialog.
   - **Shifts**: Placeholder "Shift management coming soon" — E03-T03 replaces this.
   - **Leads**: Placeholder "Lead history will be available after Phase 4"
   - **Visits**: Placeholder "Visit history will be available after Phase 7"
   - **Earnings**: Placeholder "Earnings will be available after Phase 9"
   - **Incentives**: Placeholder "Incentive badges will be available after Phase 10"
   - **Audit**: Placeholder "Audit log will be available after Phase 13"
6. Loading state: Skeleton for header and tabs.
7. Not found: "Guard not found" with back link to `/admin/guards`.
8. Breadcrumb: "Guards" → "{Guard Name}".

### Deliverables

- [ ] `src/app/(admin)/admin/guards/[id]/page.tsx` — Guard detail page with header, stats, and 7-tab layout

### Acceptance Criteria

1. Page renders at `/admin/guards/[id]` with correct guard data
2. Header shows photo/avatar, name, status badge, type badge, phone, society
3. Quick action buttons visible: Edit, Reset Password, Change Status
4. Stat cards show correct lead count, verified rate, visit count, earnings
5. 7 tabs visible with correct labels
6. Profile tab shows guard details (read-only)
7. Non-profile tabs show placeholder messages
8. Invalid user_id shows "Guard not found"
9. Loading shows skeletons
10. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Shifts tab content (E03-T03)
- All other tab content (Phases 4, 7, 9, 10, 13)
- Inline editing on Profile tab (use Edit dialog from T05)

---

## T05: Guard Management Dialogs

### Objective

Create three admin dialogs for managing existing guards: Edit Profile (name, type, society reassignment), Change Status (with ban confirmation showing in-flight items), and Reset Password (with temp password reveal). Each dialog calls the appropriate mutation/action from E01.

### Required Reading

- `notes/features/02-guard-management.md` — "User Stories: Admin Edit Guard Profile", "Admin Change Guard Status" (ban dialog wireframe), "Admin Reset Guard Password"
- `notes/06-admin-panel-ux.md` — Ban dialog wireframe, confirmation patterns

### Key Rules

1. **Edit Profile Dialog** (`src/components/admin/GuardEditDialog.tsx`):
   - Props: `open`, `onOpenChange`, `guard` (current guard data)
   - Fields: Name (text), Guard Type (dropdown), Society (dropdown with current highlighted)
   - If society changes: show confirmation: "This guard will be moved from [Society A] to [Society B]. Their existing leads stay linked to Society A."
   - On submit: call `guards.updateProfile` mutation → toast → close.
   - Zod validation same as create (minus phone and password).

2. **Change Status Dialog** (`src/components/admin/GuardStatusDialog.tsx`):
   - Props: `open`, `onOpenChange`, `guard` (current data)
   - Show current status prominently.
   - If transitioning TO `BANNED`:
     - First, call `guards.getInFlightItems` query to fetch counts.
     - Show ban confirmation dialog per wireframe:

       ```
       ⚠ This guard has active items:
       • {N} pending visits (need reassignment)
       • {N} leads in SUBMITTED status

       Banning will:
       • Prevent login immediately
       • Flag {N} visits for reassignment
       • Leads will remain in current status

       Reason for ban (required):
       [textarea]

       [Cancel]  [Confirm Ban]
       ```

     - Reason field required (Zod: `z.string().min(1, "Reason is required")`).
     - On confirm: call `guards.updateStatus({ status: "BANNED", reason })` → toast → close.

   - If transitioning FROM `BANNED` to ACTIVE/INACTIVE: simple confirmation dialog → call `guards.updateStatus`.
   - If transitioning ACTIVE ↔ INACTIVE: simple select + confirm → call mutation.
   - Show error toast if transition fails.

3. **Reset Password Dialog** (`src/components/admin/GuardResetPasswordDialog.tsx`):
   - Props: `open`, `onOpenChange`, `guard` (current data)
   - Admin enters new temp password (min 8 chars, Zod validated).
   - On submit: call `api.actions.workos.resetGuardPassword` Action directly. The Action enforces `guards.reset_password` permission server-side (per E01-T01 rule 10-11).
   - Show: "Username: {phone}" and "New Temporary Password: •••••••• [Show] [Copy]"
   - Guard will be required to change password on next login.

4. Wire all three dialogs into the Guard Detail Page (T04) quick action buttons.

### Deliverables

- [ ] `src/components/admin/GuardEditDialog.tsx` — Edit profile dialog with society reassignment confirmation
- [ ] `src/components/admin/GuardStatusDialog.tsx` — Change status dialog with ban confirmation + in-flight summary
- [ ] `src/components/admin/GuardResetPasswordDialog.tsx` — Reset password dialog with temp password reveal

### Acceptance Criteria

1. Edit dialog shows current values pre-filled
2. Society change shows reassignment confirmation
3. Successful edit shows toast and closes
4. Ban dialog shows in-flight item counts
5. Ban dialog requires reason (empty reason shows validation error)
6. Ban confirmation shows all consequences (login blocked, visits flagged)
7. Successful ban shows toast and updates status badge
8. Reinstatement (BANNED → ACTIVE) works with confirmation
9. ACTIVE ↔ INACTIVE toggle works
10. Reset password dialog validates min 8 chars
11. Successful reset shows credentials dialog with show/copy
12. All dialogs disable submit during mutation/action
13. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
npm run build
```

### Out of Scope

- Phone number change (V1.1 — requires WorkOS email update)
- Bulk status changes (V2)
- Auto-ban from quality scoring (Phase 11)

---

## T06: Society Guards Tab

### Objective

Replace the Guards tab placeholder on the society detail page (created in P02-E01-T06) with a functional guard table filtered to that society. Shows guards assigned to this society with key columns, "Add Guard" shortcut, and link to full guard detail.

### Required Reading

- `notes/features/01-society-registry.md` — "Society Detail Page" section (Guards tab description)
- `notes/features/02-guard-management.md` — "Admin Panel UI: Guard List Page" columns

### Key Rules

1. Component: `src/components/admin/SocietyGuardsTab.tsx`. Accept `society_id` prop.
2. Uses `guards.list({ society_id })` query — already filtered to this society.
3. Table columns (subset of full guard list): Name, Phone, Type (badge), Status (badge), Leads (count).
4. "Add Guard" button at top → opens GuardCreateDialog (T03) with society pre-selected.
5. Clicking guard name → navigates to `/admin/guards/[id]` (full detail page).
6. Empty state: "No guards assigned to this society yet. Add your first guard."
7. Real-time via `useQuery` — updates when guards are added/removed.
8. Replace the placeholder in `src/app/(admin)/admin/societies/[id]/page.tsx` (Guards tab) with `<SocietyGuardsTab society_id={...} />`.

### Deliverables

- [ ] `src/components/admin/SocietyGuardsTab.tsx` — Guard table filtered by society
- [ ] `src/app/(admin)/admin/societies/[id]/page.tsx` — Updated: Guards tab renders SocietyGuardsTab

### Acceptance Criteria

1. Guards tab shows guards assigned to this society
2. Table columns correct (Name, Phone, Type, Status, Leads)
3. "Add Guard" button opens dialog with society pre-selected
4. Clicking guard name navigates to guard detail page
5. Empty state shows when society has no guards
6. Adding a guard to this society auto-updates the table (real-time)
7. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Guard type distribution chart within society (V2)
- Bulk guard assignment (V2)
- Guard shift overview within society (Phase 3 E03 adds individual guard shifts, not society-wide view)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- Admin sidebar "Guards" link (after Societies, permission-gated)
- Guard list page (`/admin/guards`) with table, society/type/status filters, debounced search, "Add Guard" button
- GuardTable reusable component (avatar, phone formatting, type/status badges, lead count, verified rate)
- GuardCreateDialog with two-step flow (form → credentials reveal with show/copy)
- Guard detail page (`/admin/guards/[id]`) with header, stat cards, 7-tab layout (Profile populated, others placeholder)
- GuardEditDialog (name, type, society reassignment with warning)
- GuardStatusDialog (ban confirmation with in-flight items count, reinstate flow, ACTIVE↔INACTIVE toggle)
- GuardResetPasswordDialog (two-step: password form → credentials reveal)
- SocietyGuardsTab (filtered guard table on society detail page, replaces placeholder)
- Invalid ID handling on guard detail page (graceful "not found" instead of crash)

### Key File Locations

- `src/app/(admin)/admin/guards/page.tsx` — Guard list page
- `src/app/(admin)/admin/guards/[id]/page.tsx` — Guard detail page
- `src/components/admin/GuardTable.tsx` — Reusable guard table
- `src/components/admin/GuardCreateDialog.tsx` — Add guard dialog
- `src/components/admin/GuardEditDialog.tsx` — Edit profile dialog
- `src/components/admin/GuardStatusDialog.tsx` — Change status dialog
- `src/components/admin/GuardResetPasswordDialog.tsx` — Reset password dialog
- `src/components/admin/SocietyGuardsTab.tsx` — Society Guards tab content

### Deviations from Spec

- Used native `<select>` instead of shadcn Select for dropdowns (shadcn Select not installed — matches existing SocietyCreateDialog pattern)
- Added `workos_user_id` to `guards.getById` return in `convex/guards.ts` (was missing, needed by reset password dialog)
- Added `isValidConvexId()` to `lib/validators.ts` for graceful invalid-ID handling on detail page

### Gotchas for Next Epic

- Guard detail page action buttons are now live (Edit, Status, Reset Password). E03 adds Shifts tab content.
- SocietyGuardsTab uses `guards.list({ society_id })` — same enrichment as main list.
- GuardCreateDialog accepts `defaultSocietyId` prop for pre-selecting society from SocietyGuardsTab.
- Phone formatting uses `formatPhoneDisplay` from `lib/validators.ts` — reuse in E04 guard portal.
