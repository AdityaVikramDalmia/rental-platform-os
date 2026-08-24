---
id: P04-E03
title: Admin Lead Queue UI
phase: 4
status: done
depends_on: ["P04-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P04-E03: Admin Lead Queue UI

## Overview

Build the admin-facing lead queue — the primary ops workspace. Includes the sidebar navigation update, lead queue page with data table (status tabs, filters, search, pagination, real-time), lead detail side panel (all sections), and triage action dialogs (Request Info, Reject, Mark Duplicate, Clear Flag, Set Bounty). Desktop-first layout following admin panel conventions.

## Prerequisites

- **Read first**: [P04-E02 Completion Summary](P04-E02-lead-admin-backend.md#completion-summary) — know what admin backend functions exist (all mutations and queries are ready).
- **Read first**: [P04-E01 Completion Summary](P04-E01-lead-submission-backend.md#completion-summary) — know the lead infrastructure (helpers, schema, guard mutations).
- P04-E02 is complete: `leads.list`, `leads.getById`, `leads.requestInfo`, `leads.reject`, `leads.markDuplicate`, `leads.clearDuplicateFlag`, `leads.setBounty` all available.
- Admin layout, sidebar, and RBAC-based nav hiding exist from P01/P02.

## Task Queue

- [x] P04-E03-T01: Sidebar Update + Lead Queue Page Shell
- [x] P04-E03-T02: Lead Queue Data Table
- [x] P04-E03-T03: Lead Detail Side Panel
- [x] P04-E03-T04: Admin Action Dialogs

---

## T01: Sidebar Update + Lead Queue Page Shell

### Objective

Add "Leads" navigation item to the admin sidebar (RBAC-gated by `leads.view` permission) and create the lead queue page at `/admin/leads` with status filter tabs and basic layout structure.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Sidebar Navigation" section (nav structure, RBAC gating), "Lead Queue" section (page layout overview)
- `notes/13-constants-reference.md` — Lead statuses (for tab labels), permissions (`leads.view`)
- Existing admin sidebar component (from P02-E01-T03) — replicate the pattern for adding nav items

### Key Rules

1. **Sidebar nav item**: Add "Leads" under the existing nav structure. Icon: use an appropriate Lucide icon (e.g., `FileText` or `ClipboardList`). Route: `/admin/leads`. RBAC: only visible if user has `leads.view` permission.
2. **Follow existing sidebar pattern**: The admin sidebar from P02 already has "Societies" nav item. Replicate the exact same pattern for "Leads" — same component structure, same permission-checking logic, same active state styling.
3. **Page route**: `src/app/(admin)/admin/leads/page.tsx`. This is a client component (`"use client"`) that uses Convex `useQuery` for real-time data.
4. **Status tabs**: Horizontal tab bar at top of page. Tabs with counts:
   - `All` — shows all leads (no status filter)
   - `SUBMITTED (23)` — default active tab
   - `NEED_INFO (5)`
   - `POTENTIAL_DUPLICATE (3)` — display as "Duplicates?"
   - `VERIFIED`
   - `REJECTED`
     Tab counts come from the `leads.getStatusCounts` query (E02-T03). Clicking a tab filters the table.
5. **Tab counts**: Use `leads.getStatusCounts` query from E02-T03. It returns `Record<string, number>` with counts per status. "All" tab shows total sum.
6. **Page layout**: Standard admin page layout — page title "Lead Queue" at top, tabs below, table below tabs. Match the Society list page pattern from P02.
7. **State management**: Use URL search params for tab state (`?status=SUBMITTED`) so tabs are bookmarkable and shareable. Default to `SUBMITTED` if no param.

### Deliverables

- [ ] Admin sidebar component — Updated: "Leads" nav item added with RBAC gate
- [ ] `src/app/(admin)/admin/leads/page.tsx` — Lead queue page with status tabs and layout shell
- [ ] `src/app/(admin)/admin/leads/components/lead-status-tabs.tsx` — Status tab bar component with counts

### Acceptance Criteria

1. "Leads" appears in admin sidebar when user has `leads.view` permission
2. "Leads" is hidden in sidebar when user lacks `leads.view` permission
3. Clicking "Leads" navigates to `/admin/leads`
4. Lead queue page renders with title "Lead Queue"
5. Status tabs show "All" plus all 5 statuses with correct labels and counts from `getStatusCounts`
6. SUBMITTED tab is active by default (not "All")
7. Clicking a tab updates URL param and filters display
8. Tab counts reflect actual lead counts per status
9. Page uses the same layout wrapper, page title component, and content container as the Society list page (`/admin/societies`)
10. "Leads" nav item and page are only accessible to users with `leads.view` permission — unauthorized users see no nav item and get redirected if accessing URL directly
11. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Navigate to `/admin/leads` as admin. Verify sidebar highlight, page title, tabs with counts.

### Out of Scope

- Data table (T02)
- Detail side panel (T03)
- Action dialogs (T04)

---

## T02: Lead Queue Data Table

### Objective

Implement the lead queue data table with columns (ID, Society, Building/Flat, Phone, Guard, Time), sorting, pagination (20/page), full-text search bar, and real-time updates via Convex subscriptions. Clicking a row opens the detail side panel (T03).

### Required Reading

- `notes/06-admin-panel-ux.md` — "Lead Queue" section (table columns, search, pagination)
- `notes/10-convex-schema.md` — `leads` table (field types for table columns — e.g., `owner_phone` is string, `rent_expected` is optional number in paise)
- `notes/13-constants-reference.md` — Lead statuses (badge colors), quality flags (warning icon display)
- `notes/11-convex-architecture.md` — Real-time subscription pattern (useQuery auto-updates)
- Existing admin table component (from P02 — Society list table) — replicate the data table pattern

### Key Rules

1. **Data source**: For non-search queries, use `usePaginatedQuery(api.leads.list, { status: selectedTab, society_id: selectedSociety }, { initialNumItems: 20 })`. This auto-updates in real-time via Convex subscriptions and supports `loadMore()` for pagination. For search queries, use `useQuery(api.leads.list, { search: searchQuery, status: selectedTab })` — search returns a flat array (no cursor pagination), so "Load More" is hidden when searching.
2. **Table columns** (in order):
   | Column | Field | Display | Width |
   |--------|-------|---------|-------|
   | # | Sequential or `_id` short hash | `"47"` or first 6 chars of ID | narrow |
   | Society | `society_name` (from join) | `"Maplewood"` | medium |
   | Building/Flat | `building_name` + `floor_number` + `flat_number` | `"TwrA / Fl12 / 1201"` | wide |
   | Phone | `owner_phone` | `"98765..."` (masked last 4) with `tel:` link | medium |
   | Guard | `guard_name` (from join) | `"Rajesh"` | medium |
   | Time | `_creationTime` | Relative: `"2h"`, `"3d"` | narrow |
   | Status | `status` | Color-coded badge | narrow |
   | Flags | `quality_flags` | Warning icons if present | narrow |
3. **Search bar**: Text input above table. Debounced (300ms). On change: update `search` param in query. Placeholder: `"Search by flat, phone, guard name..."`.
4. **Pagination**: 20 items per page. "Load More" button at bottom (or page numbers). Use Convex cursor-based pagination via `usePaginatedQuery`.
5. **Real-time**: New leads appear automatically (Convex subscription). No manual refresh needed. New rows should subtly highlight (brief background flash) to draw attention.
6. **Row click**: Clicking a table row sets `selectedLeadId` state, which opens the detail side panel (T03). Active row gets a highlighted background.
7. **Empty state**: When a tab has 0 leads, show: "No [status] leads" with appropriate messaging.
8. **Loading state**: Skeleton rows while query loads. Use existing skeleton/loading patterns from P02.
9. **Phone masking**: Display first 5 digits + `"..."` in table. Full phone visible in detail panel only. The masked phone is still a clickable `tel:+91{fullPhone}` link.
10. **Status badge**: Use the shared `lead-status-badge.tsx` component (create it here). Colors from `13-constants-reference.md`:
    - SUBMITTED: blue
    - NEED_INFO: amber
    - POTENTIAL_DUPLICATE: yellow
    - VERIFIED: green
    - REJECTED: red
    - DUPLICATE: gray
11. **Follow existing table patterns**: Match the Society list table from P02 — same component library (shadcn/ui `Table` or `DataTable`), same styling, same responsive behavior.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/lead-table.tsx` — Data table with columns, sorting, pagination, real-time
- [ ] `src/app/(admin)/admin/leads/components/lead-search-bar.tsx` — Debounced search input
- [ ] `src/components/shared/lead-status-badge.tsx` — Shared status badge component (used in admin + guard UI)

### Acceptance Criteria

1. Table renders with all 8 columns in correct order
2. Data comes from `leads.list` query with selected tab status filter
3. Search input filters results in real-time (debounced 300ms)
4. Pagination shows 20 items per page with Load More / page controls
5. New leads appear in table without page refresh (Convex real-time)
6. Clicking a row highlights it and sets `selectedLeadId` for side panel
7. Empty state shown when no leads match current filters
8. Phone is masked in table (first 5 digits + `...`)
9. Status badge uses correct colors for each status
10. Lead status badge component is shared (reusable in guard UI)
11. Table uses the same shadcn/ui `Table` (or `DataTable`) component, column header styles, and row hover behavior as the Society list table from P02
12. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Navigate to `/admin/leads`. Verify table renders with correct columns. Try search. Click different tabs. Click a row (highlight). Check real-time by submitting a lead from guard UI (or Convex dashboard).

### Out of Scope

- Detail side panel content (T03)
- Action dialogs (T04)
- Society filter dropdown (can be added later; tabs + search sufficient for V1)

---

## T03: Lead Detail Side Panel

### Objective

Build the lead detail side panel that opens when clicking a table row. Displays all lead information organized in sections: Lead Info, Owner, Vacancy Details, Guard Profile Card, Duplicate Info (conditional), Notes Thread, and Status History Timeline. Desktop side panel (40% width).

### Required Reading

- `notes/06-admin-panel-ux.md` — "Lead Detail Panel" section (sections, layout, action buttons)
- `notes/features/03-lead-pipeline.md` — "Lead Detail Panel" section (duplicate info, status history, admin actions)
- `notes/10-convex-schema.md` — `leads` table (field types and names for rendering — e.g., `total_floors` on buildings, `availability_type`, `furnishing`)
- `notes/13-constants-reference.md` — Lead statuses for badge, quality flags for display, guard type enums
- Existing admin detail panel (from P02 — Society detail page) — replicate the side panel pattern

### Key Rules

1. **Data source**: `useQuery(api.leads.getById, { lead_id: selectedLeadId })`. Returns lead with joined `guard`, `building`, `society`, `duplicate_lead`, `verifications` data.
2. **Layout**: Slide-in side panel from right, 40% viewport width on desktop. Close button (X) in top-right. Panel header shows flat info and status badge.
3. **Section order**:
   - **Lead Info**: Building/floor/flat, submitted timestamp (formatted), lead ID
   - **Owner Section**: Phone (full, clickable `tel:` link with +91 prefix), owner name (if provided)
   - **Vacancy Details**: Availability type + date, rent expected (formatted as ₹XX,XXX), furnishing
   - **Guard Profile Card**: Guard name, phone, guard type (`BUILDING_SPECIFIC` / `MAIN_GATE` / `PARK` / `ROVING` — canonical enums from `13-constants-reference.md`), society name. Compact card format. Clickable to navigate to guard detail page (from P03).
   - **Duplicate Info** _(conditional — only if status is POTENTIAL_DUPLICATE or quality_flags has DUPLICATE_\* flags)\_: "Potential duplicate of Lead #XYZ" with link to original lead. Match reason (which flag triggered: same flat or same phone). Action buttons: "Mark as Duplicate" / "Not a Duplicate — Continue" (these trigger T04 dialogs).
   - **Notes Thread**: Chronological thread of all admin notes and guard replies from `notes_thread` array. Each entry shows: author name, author type badge (ADMIN/GUARD), timestamp, note text. Use the shared `notes-thread.tsx` component.
   - **Status History Timeline**: Derived from `audit_logs` for this lead (or from notes_thread timestamps if audit viewer not yet available). Show status transitions with timestamps and who made the change. Use the shared `status-timeline.tsx` component.
   - **Prospective Bounty** _(conditional — only if set)_: Display formatted amount (₹XX,XXX).
4. **Action buttons**: Row of buttons at bottom of panel (or in panel header). Buttons shown based on current lead status:
   - SUBMITTED: `[Request Info]` `[Reject]` `[Set Bounty]`
   - NEED_INFO: `[Reject]` `[Set Bounty]`
   - POTENTIAL_DUPLICATE: `[Mark Duplicate]` `[Not a Duplicate]` `[Set Bounty]`
   - VERIFIED: `[Set Bounty]`
   - REJECTED: _(no actions — terminal)_
   - DUPLICATE: _(no actions — terminal)_
     NOTE: NO "Call & Verify" button. Verification is P05.
5. **Money formatting**: Use `formatINR()` from `lib/money.ts` — converts paise to display format (₹25,000).
6. **Phone formatting**: Use `formatPhoneDisplay()` from `lib/validators.ts` — adds +91 prefix for display.
7. **Relative timestamps**: Use a relative time formatter (e.g., `formatDistanceToNow` from `date-fns` or similar) for "2 hours ago" display. Full timestamp on hover.
8. **Loading state**: Skeleton content while `getById` query loads.
9. **Follow existing side panel patterns**: Match P02/P03 detail page patterns. If no side panel exists yet, create a reusable `SidePanel` component wrapper.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — Side panel with all sections
- [ ] `src/app/(admin)/admin/leads/components/lead-duplicate-info.tsx` — Conditional duplicate match display
- [ ] `src/app/(admin)/admin/leads/components/lead-guard-card.tsx` — Compact guard profile card
- [ ] `src/components/shared/notes-thread.tsx` — Shared notes thread display (admin + guard reuse). **If E04 ran first, this may already exist — verify and import.**
- [ ] `src/components/shared/status-timeline.tsx` — Shared status history timeline component. **If E04 ran first, this may already exist — verify and import.**

### Acceptance Criteria

1. Side panel opens on table row click (CSS transition, 200-300ms duration)
2. Side panel closes on X button or clicking outside panel
3. All 7+ sections render with correct data from `leads.getById`
4. Owner phone displayed with +91 prefix as clickable `tel:` link
5. Money values formatted as ₹XX,XXX (from paise)
6. Duplicate Info section only appears for POTENTIAL*DUPLICATE leads (or leads with DUPLICATE*\* flags)
7. Duplicate Info shows match reason (same flat / same phone) and link to original lead
8. Notes thread shows chronological entries with author type badges (ADMIN blue, GUARD green)
9. Action buttons shown match the current lead status (per rules above)
10. Action buttons are RBAC-gated: "Request Info" hidden without `leads.request_info`, "Reject" hidden without `leads.reject`, "Mark Duplicate" / "Not a Duplicate" hidden without `leads.mark_duplicate`, "Set Bounty" hidden without `leads.set_bounty`
11. NO "Call & Verify" button visible for any status
12. Guard profile card links to guard detail page
13. Loading skeleton shown while data fetches
14. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Click a lead row → panel opens with all sections. Check SUBMITTED lead (3 action buttons). Check POTENTIAL_DUPLICATE lead (duplicate info + mark/clear buttons). Check REJECTED lead (no actions). Verify phone link, money format, relative timestamps.

### Out of Scope

- Action dialog implementations (T04)
- Owner verification section (P05 adds it)
- Audit trail viewer (P13)

---

## T04: Admin Action Dialogs

### Objective

Implement all admin triage action dialogs: Request Info (with note field), Reject (with reason field), Mark Duplicate (with original lead reference), Clear Duplicate Flag (confirmation), and Set Bounty (with amount input). Each dialog calls the corresponding backend mutation and handles success/error feedback.

### Required Reading

- `notes/06-admin-panel-ux.md` — Admin action button descriptions
- `notes/features/03-lead-pipeline.md` — "Admin Actions" section (each action's fields and behavior)
- `notes/10-convex-schema.md` — `leads` table (field validators for dialog inputs — e.g., `prospective_bounty` is number in paise)
- `notes/13-constants-reference.md` — Lead-related permissions (for display/gating), lead statuses (for dialog state checks)

### Key Rules

1. **Dialog component**: Use shadcn/ui `Dialog` (or `AlertDialog` for destructive actions like Reject, Mark Duplicate). Follow existing dialog patterns from P02 (Add Society dialog).
2. **Form handling**: Use `react-hook-form` + `zod` for validation in dialogs that have input fields. Follow existing form patterns.
3. **Toast feedback**: Use `sonner` for success/error toasts. Success: "Lead updated" / "Lead rejected". Error: display mutation error message.
4. **Mutation calls**: Use `useMutation` from Convex React. Handle loading state (button spinner + disabled).
5. **Request Info Dialog**:
   - Trigger: "Request Info" button in detail panel
   - Content: Textarea for admin note (required, min 10 characters). Label: "What information do you need from the guard?"
   - Submit: Calls `leads.requestInfo({ lead_id, note })`.
   - On success: Toast "Info requested — guard will be notified", close dialog, panel refreshes.
6. **Reject Dialog**:
   - Trigger: "Reject" button in detail panel
   - Content: Textarea for rejection reason (required, min 10 characters). Label: "Reason for rejection". Warning text: "This action cannot be undone."
   - Submit: Calls `leads.reject({ lead_id, reason })`.
   - On success: Toast "Lead rejected", close dialog, panel refreshes.
7. **Mark Duplicate Dialog**:
   - Trigger: "Mark as Duplicate" button in duplicate info section
   - Content: Display original lead reference (from `duplicate_of_lead_id`): "This lead appears to be a duplicate of Lead #[original flat info]". Optional reason textarea.
   - Submit: Calls `leads.markDuplicate({ lead_id, original_lead_id, reason })`.
   - On success: Toast "Lead marked as duplicate", close dialog, panel refreshes.
8. **Clear Duplicate Flag Dialog**:
   - Trigger: "Not a Duplicate — Continue" button in duplicate info section
   - Content: Confirmation: "Clear the duplicate flag? This lead will move back to the SUBMITTED queue for review."
   - Submit: Calls `leads.clearDuplicateFlag({ lead_id })`.
   - On success: Toast "Duplicate flag cleared — lead is back in queue", close dialog, panel refreshes.
9. **Set Bounty Dialog**:
   - Trigger: "Set Bounty" button in detail panel
   - Content: Number input for amount in rupees (NOT paise — frontend converts). Label: "Prospective bounty amount (₹)". Pre-fill with existing bounty if set.
   - Validation: Amount must be positive number.
   - Submit: Convert rupees to paise using `rupeesToPaise()` from `lib/money.ts`. Calls `leads.setBounty({ lead_id, amount: paiseAmount })`.
   - On success: Toast "Bounty set — ₹[formatted amount]", close dialog, panel refreshes.
10. **Error handling**: If mutation throws (e.g., permission error, wrong status), show error toast with the error message. Do NOT close the dialog on error — let user retry or cancel.
11. **Panel refresh**: After successful mutation, the detail panel auto-refreshes because `useQuery(api.leads.getById)` re-runs when the lead document changes (Convex reactivity). No manual refresh needed.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/request-info-dialog.tsx` — Request Info dialog with note textarea
- [ ] `src/app/(admin)/admin/leads/components/reject-dialog.tsx` — Reject dialog with reason textarea
- [ ] `src/app/(admin)/admin/leads/components/mark-duplicate-dialog.tsx` — Mark Duplicate confirmation with original ref
- [ ] `src/app/(admin)/admin/leads/components/set-bounty-dialog.tsx` — Set Bounty dialog with amount input

### Acceptance Criteria

1. Request Info dialog opens, requires note (min 10 chars), calls `requestInfo` mutation, shows success toast
2. Reject dialog opens, requires reason (min 10 chars), shows "cannot be undone" warning, calls `reject` mutation
3. Mark Duplicate dialog shows original lead reference, calls `markDuplicate` mutation
4. Clear Duplicate Flag triggers confirmation, calls `clearDuplicateFlag` mutation
5. Set Bounty dialog has number input in rupees, converts to paise before mutation, pre-fills existing bounty
6. All dialogs show loading spinner on submit button while mutation runs
7. All dialogs show error toast on mutation failure WITHOUT closing the dialog
8. All dialogs close on successful mutation with success toast
9. Detail panel auto-refreshes after successful mutation (Convex reactivity)
10. All forms use `react-hook-form` + `zod` validation
11. All dialogs use shadcn/ui `Dialog` (or `AlertDialog` for destructive actions) with the same header/body/footer structure as P02 dialogs (e.g., Add Society dialog)
12. Dialogs are RBAC-gated: if the user lacks the permission for an action, the trigger button is not rendered (backend still enforces via `requirePermission`, but UI hides proactively)
13. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Open lead detail panel → click each action button → verify dialog opens → submit with valid data → verify toast + panel update → test with invalid data → verify validation errors → test error case (e.g., wrong status) → verify error toast.

### Out of Scope

- "Call & Verify" dialog (P05)
- Lead rejection → listing cascade confirmation (P06)
- Batch actions (select multiple leads) — not in V1

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- Admin sidebar: "Leads" nav item enabled with RBAC gate (`PERMISSIONS.LEADS_VIEW`)
- `/admin/leads` page: Status tabs with live counts, data table, search, pagination, detail side panel
- Lead queue data table: 8 columns, usePaginatedQuery, skeleton loading, row selection, phone masking
- Lead detail side panel: Sheet-based, all sections (lead info, owner, vacancy, guard card, duplicate info, notes thread, timeline, bounty), RBAC-gated action buttons
- 5 action dialogs: Request Info, Reject, Mark Duplicate, Clear Duplicate Flag, Set Bounty
- Reuses shared components: `lead-status-badge`, `notes-thread`, `status-timeline`

### Key File Locations

- Page: `src/app/(admin)/admin/leads/page.tsx`
- Components: `src/app/(admin)/admin/leads/components/` (11 files)
- Sidebar: `src/app/(admin)/admin-layout-client.tsx` (modified)

### Deviations from Spec

- Used shadcn Sheet (slide-in) instead of custom side panel for better accessibility
- Mark Duplicate and Clear Duplicate Flag share one component with dual-mode behavior

### Gotchas for Next Epic

- Detail panel uses Sheet from right side — doesn't push table layout, overlays it
- Action buttons are RBAC-gated in UI but backend also enforces via requirePermission
- Search results from `leads.list` use `.take(50)` — Load More is hidden during search
