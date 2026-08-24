---
id: P27-E03
title: Society Detail — Leads Tab + Enhancements
phase: 27
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P27-E03: Society Detail — Leads Tab + Enhancements

## Overview

Replace the stale placeholder tabs on the society detail page with real data. The Leads tab gets a full filterable table. A new activity feed, guard performance summary, and listing stats section round out the page. Quick action buttons give ops a fast path to common tasks without navigating away.

## Task Queue

- [x] P27-E03-T01: SocietyLeadsTab component
- [x] P27-E03-T02: Recent Activity Feed component
- [x] P27-E03-T03: Guard Performance Summary component
- [x] P27-E03-T04: Listing Stats card + Quick Action buttons
- [x] P27-E03-T05: Wire all components into Society Detail page

---

## T01: SocietyLeadsTab component

### Objective

Build a full leads table scoped to a single society. Ops can filter by status, see summary stats above the table, and take quick actions per row — all without leaving the society detail page.

### Required Reading

- `notes/features/03-lead-pipeline.md` — Lead data model, status values, admin queue patterns
- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" section (table columns, side panel pattern)
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum values, badge colors, `leads.view` permission
- `notes/10-convex-schema.md` — `leads` table fields and indexes (especially `by_society_id`)

### Key Rules

1. Query: `api.leads.list` with `society_id` filter. This query already exists — do NOT create a new backend function.
2. Status filter tabs: All | Submitted | Verified | Rejected | Duplicate | Need Info. Each tab shows a count badge. Default to "All".
3. Table columns: Flat (building + floor + flat number), Building name, Guard name, Owner Name, Status (badge), Date submitted (formatted as "17 Feb 2026").
4. Summary stats row above the table: total leads count, conversion rate (verified / total as a percentage), avg time to verify (from `api.analytics.getOperationalMetrics` if available, else omit), leads this week (filter by `_creationTime` >= 7 days ago client-side).
5. Quick actions per row: "View" button navigates to `/admin/leads` with the lead pre-selected (use query param `?lead=<id>`). Do NOT open a full side panel inside the society detail — keep it simple.
6. Rows are clickable (same as "View" button).
7. Status badges must use the same color coding as the main leads page: SUBMITTED = amber, VERIFIED = green, REJECTED = red, DUPLICATE = gray, NEED_INFO = blue, POTENTIAL_DUPLICATE = orange.
8. Pagination: 20 items per page using `usePaginatedQuery`. Show "Load More" button at bottom.
9. Loading state: `Skeleton` rows while query loads. Empty state: "No leads found for this society."
10. Component is a client component (`"use client"`). Receives `societyId: Id<"societies">` as a prop.

### Deliverables

- [ ] `src/components/admin/SocietyLeadsTab.tsx` — Leads table with status filter tabs, summary stats, quick actions, pagination

### Acceptance Criteria

1. Component renders with correct leads for the given `societyId`
2. Status filter tabs update the table and show correct counts per status
3. Summary stats row shows total leads, conversion rate (as "X%"), and leads this week
4. Clicking a row navigates to `/admin/leads?lead=<id>`
5. "View" button per row navigates to the same URL
6. Status badges display with correct colors matching the main leads page
7. "Load More" button appears when more than 20 leads exist
8. Empty state renders when no leads match the current filter
9. Skeleton rows render during initial load
10. `npx tsc --noEmit` passes with no errors on this file

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/SocietyLeadsTab.tsx` and confirm zero errors.

### Out of Scope

- Inline verification dialog (that's P27-E04)
- Creating new backend queries
- Editing leads from this component
- Sorting by column headers (V2)

---

## T02: Recent Activity Feed component

### Objective

Build a compact timeline showing the last 7 days of activity for a society: new leads submitted, verifications recorded, visits scheduled or completed, and closures created. Gives ops a quick pulse on what's happening in a society without digging through individual queues.

### Required Reading

- `notes/06-admin-panel-ux.md` — Table patterns, real-time subscription conventions
- `notes/13-constants-reference.md` — `LEAD_STATUS`, `VISIT_STATUS`, `CLOSURE_STATUS` enum values and their display labels
- `notes/10-convex-schema.md` — `leads`, `visits`, `closures` table fields and `by_society_id` indexes

### Key Rules

1. Queries to combine: `api.leads.list` (filtered by `society_id`, ordered by `_creationTime` desc, limit 20), `api.visits.list` (filtered by `society_id`, ordered by `_creationTime` desc, limit 20). Closures do not have a `by_society_id` index — skip closures or derive from visits if trivial; do NOT create new backend queries.
2. Merge and sort all results by `_creationTime` descending. Show the most recent 20 events total.
3. Filter to events within the last 7 days (client-side: `Date.now() - 7 * 24 * 60 * 60 * 1000`).
4. Each event item: icon + description text + relative time (e.g., "2 hours ago"). Use `date-fns` `formatDistanceToNow` or equivalent.
5. Event descriptions:
   - Lead created: "New lead submitted — [Building] [Flat] by [Guard name]"
   - Lead status changed to VERIFIED: "Lead verified — [Building] [Flat]"
   - Lead status changed to REJECTED: "Lead rejected — [Building] [Flat]"
   - Visit created: "Visit scheduled — [Building] [Flat] on [date]"
   - Visit COMPLETED: "Visit completed — [Building] [Flat]"
6. Icons: use `lucide-react` icons. Lead = `FileText`, Visit = `Calendar`, Verified = `CheckCircle`, Rejected = `XCircle`.
7. Compact design: each item is a single line (icon + text + time). No card borders per item — use a simple vertical timeline with a left border line.
8. If no events in the last 7 days: "No activity in the last 7 days."
9. Component is a client component. Receives `societyId: Id<"societies">` as a prop.
10. Max height with `overflow-y-auto` so it doesn't push page content down on societies with lots of activity.

### Deliverables

- [ ] `src/components/admin/SocietyActivityFeed.tsx` — Timeline component showing last 7 days of lead and visit events

### Acceptance Criteria

1. Component renders events from both leads and visits for the given `societyId`
2. Events are sorted newest first
3. Only events from the last 7 days are shown
4. Each event shows the correct icon, description, and relative time
5. Maximum 20 events displayed
6. Empty state renders when no events exist in the last 7 days
7. Component scrolls internally if content exceeds max height
8. `npx tsc --noEmit` passes with no errors on this file

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/SocietyActivityFeed.tsx` and confirm zero errors.

### Out of Scope

- Closure events (no `by_society_id` index on closures — skip)
- Audit log events (separate concern, P13 already has its own viewer)
- Pagination or "load more" for the feed
- Creating new backend queries

---

## T03: Guard Performance Summary component

### Objective

Build a mini leaderboard showing the top 5 guards in a society ranked by verified leads. Gives ops a quick view of which guards are performing and which may need coaching.

### Required Reading

- `notes/features/02-guard-management.md` — Guard data model, guard types, lead count fields
- `notes/13-constants-reference.md` — `GUARD_TYPE` enum values and display labels, `guards.view` permission
- `notes/10-convex-schema.md` — `guard_profiles` table fields, `by_society_id` index

### Key Rules

1. Query: `api.guards.list` filtered by `society_id`. This query already returns lead counts per guard — do NOT create a new backend query.
2. Sort guards by verified lead count descending. Show top 5 only.
3. Table columns: Guard name (plain text — not a link in this component, linking is P27-E05 scope), Guard type (display label from `GUARD_TYPE` enum), Leads submitted (total), Verified count, Visit count, Verified rate (verified / submitted as "X%", show "—" if submitted = 0).
4. Verified rate color coding: >= 70% = green text, 40-69% = amber text, < 40% = red text.
5. If fewer than 5 guards exist in the society, show all of them.
6. If no guards exist: "No guards assigned to this society."
7. Component is a client component. Receives `societyId: Id<"societies">` as a prop.
8. Use a compact `Table` from shadcn/ui. No pagination — max 5 rows.
9. Loading state: 3 `Skeleton` rows while query loads.

### Deliverables

- [ ] `src/components/admin/SocietyGuardPerf.tsx` — Top-5 guard leaderboard table with verified rate color coding

### Acceptance Criteria

1. Component renders the top 5 guards for the given `societyId` sorted by verified leads descending
2. All 5 columns render with correct data
3. Verified rate shows as a percentage with correct color coding (green/amber/red)
4. Shows "—" for verified rate when a guard has 0 submitted leads
5. Shows fewer than 5 rows when fewer than 5 guards exist
6. Empty state renders when no guards are assigned
7. Skeleton rows render during initial load
8. `npx tsc --noEmit` passes with no errors on this file

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/SocietyGuardPerf.tsx` and confirm zero errors.

### Out of Scope

- Clickable guard name links (that's P27-E05 cross-entity navigation)
- More than 5 guards (full guard list is on the Guards tab)
- Creating new backend queries

---

## T04: Listing Stats card + Quick Action buttons

### Objective

Add a listing stats summary card and a quick action button bar to the society detail page. The stats card shows active and total listings for the society. The quick action buttons give ops a one-click path to common tasks.

### Required Reading

- `notes/features/05-listings.md` — Listing data model, status values
- `notes/06-admin-panel-ux.md` — "Flow 7: Society Onboarding" (quick action context), page header conventions
- `notes/13-constants-reference.md` — `LISTING_STATUS` enum values, `listings.view` permission
- `notes/10-convex-schema.md` — `listings` table fields and indexes

### Key Rules

1. Listing stats: Use `api.leads.list` filtered by `society_id` to derive listing counts — leads with status VERIFIED that have a linked listing. Alternatively, if `api.societies.getById` already returns listing counts, use that. Do NOT create a new backend query.
2. Stats card shows: Active listings count (PUBLISHED status), Total listings count (all statuses), and a "View All Listings" link to `/admin/listings?society=<id>`.
3. Quick action buttons bar: Three buttons rendered in the page header area (above the tabs):
   - "Add Building" — opens the existing `BuildingCreateDialog` component (already exists from P02-E02) with `societyId` pre-filled
   - "Add Guard" — navigates to `/admin/guards/new?society=<id>` (or opens the guard create dialog if one exists)
   - "View All Leads" — navigates to `/admin/leads?society=<id>`
4. Buttons use `variant="outline"` from shadcn/ui `Button`. Use `lucide-react` icons: Building2 for Add Building, UserPlus for Add Guard, FileText for View All Leads.
5. Permission-gate each button: "Add Building" requires `buildings.create`, "Add Guard" requires `guards.create`, "View All Leads" requires `leads.view`. Hide buttons the current admin lacks permission for.
6. The listing stats card is a compact `Card` component (not a full-width section). Place it alongside the existing stat cards in the header area.
7. These are inline additions to the society detail page — no separate component file needed unless the listing stats card exceeds ~30 lines, in which case extract to `src/components/admin/SocietyListingStats.tsx`.

### Deliverables

- [ ] Listing stats card — inline in `src/app/(admin)/admin/societies/[id]/page.tsx` (or `src/components/admin/SocietyListingStats.tsx` if extracted)
- [ ] Quick action buttons bar — inline in `src/app/(admin)/admin/societies/[id]/page.tsx`, rendered above the tabs in the header area

### Acceptance Criteria

1. Listing stats card shows correct active listings count and total listings count for the society
2. "View All Listings" link navigates to `/admin/listings?society=<id>`
3. Three quick action buttons render above the tabs
4. "Add Building" button opens the building create dialog with the society pre-selected
5. "Add Guard" button navigates to the guard creation flow with society pre-filled
6. "View All Leads" button navigates to `/admin/leads?society=<id>`
7. Buttons the current admin lacks permission for are hidden (not just disabled)
8. `npx tsc --noEmit` passes with no errors on the modified files

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/societies/[id]/page.tsx` and confirm zero errors.

### Out of Scope

- Creating new backend queries for listing counts
- Occupancy rate calculation (requires tenant inquiry data not yet in scope)
- "Add Lead" quick action (guards submit leads, not admins)

---

## T05: Wire all components into Society Detail page

### Objective

Replace the stale placeholder content in the society detail page with the real components built in T01-T04. The Leads tab gets `SocietyLeadsTab`. The activity feed and guard performance summary appear as new sections. Quick action buttons and listing stats are added to the header. The Analytics placeholder tab is removed (analytics live on the dashboard, not per-society in V1).

### Required Reading

- `src/app/(admin)/admin/societies/[id]/page.tsx` — Current file (read before editing). Placeholders at lines 231 (Leads tab) and 232 (Analytics tab).
- `notes/06-admin-panel-ux.md` — "Flow 7: Society Onboarding" and page layout conventions

### Key Rules

1. Read the current `src/app/(admin)/admin/societies/[id]/page.tsx` before making any edits. The file has 4 tabs: Buildings (works), Guards (works), Leads (placeholder at line 231), Analytics (placeholder at line 232).
2. Replace the Leads tab placeholder content with `<SocietyLeadsTab societyId={society._id} />`.
3. Remove the Analytics tab entirely — analytics are on the admin dashboard, not per-society in V1. If removing the tab would break the tab layout, replace it with a brief note: "See the Analytics dashboard for society-level metrics." Do not leave a "coming soon" placeholder.
4. Add `<SocietyActivityFeed societyId={society._id} />` and `<SocietyGuardPerf societyId={society._id} />` as new sections below the tabs (not inside a tab). Use a two-column grid on desktop (`grid-cols-2 gap-6`) with activity feed on the left and guard perf on the right. On mobile, stack vertically.
5. Add the listing stats card and quick action buttons from T04 to the header area above the tabs.
6. Remove all stale placeholder text strings (e.g., "Lead tracking will be available after Phase 4", "Analytics will be available after Phase 12").
7. Verify all 3 remaining tabs (Buildings, Guards, Leads) render without errors.
8. Run `lsp_diagnostics` on the page file and all imported components. Fix any type errors before marking done.
9. Do NOT change the Buildings or Guards tab content — those work correctly.

### Deliverables

- [ ] `src/app/(admin)/admin/societies/[id]/page.tsx` — Updated with real components, placeholder text removed, new sections added

### Acceptance Criteria

1. Leads tab renders `SocietyLeadsTab` with real data (no placeholder text)
2. Analytics tab is removed or replaced with a non-placeholder note
3. Activity feed section renders below the tabs on the left side of a two-column grid
4. Guard performance summary renders below the tabs on the right side of the same grid
5. Quick action buttons (Add Building, Add Guard, View All Leads) render above the tabs
6. Listing stats card renders in the header stat cards area
7. Buildings tab still works correctly (no regression)
8. Guards tab still works correctly (no regression)
9. No stale placeholder strings remain in the file
10. `npx tsc --noEmit` passes with zero errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/societies/[id]/page.tsx` and all component files imported by it. Confirm zero errors across all files.

### Out of Scope

- Changing the Buildings or Guards tab content
- Adding new backend queries
- Responsive design beyond the two-column grid described above
- Breadcrumb changes
