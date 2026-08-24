---
id: P27-E02
title: Guard Detail — Real Tab Content (Leads, Visits, Earnings, Audit)
phase: 27
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P27-E02: Guard Detail — Real Tab Content (Leads, Visits, Earnings, Audit)

## Overview

Replace the 4 placeholder tabs in the guard detail page (`src/app/(admin)/admin/guards/[id]/page.tsx`) with real, data-driven components. The guard detail page already has 8 tabs — 4 are live (Profile, Shifts, Incentives, and one more) and 4 show stale placeholder messages referencing old phase numbers. All backend queries needed already exist. This epic is frontend-only.

## Task Queue

- [x] P27-E02-T01: GuardLeadsTab Component
- [x] P27-E02-T02: GuardVisitsTab Component
- [x] P27-E02-T03: GuardEarningsTab Component
- [x] P27-E02-T04: GuardAuditTab Component
- [x] P27-E02-T05: Wire All 4 Tabs into Guard Detail Page

---

## T01: GuardLeadsTab Component

### Objective

Build a `GuardLeadsTab` component that shows all leads submitted by a specific guard. Includes a header stats row, status filter tabs, a paginated table with clickable rows, and an empty state.

### Required Reading

- `notes/features/03-lead-pipeline.md` — "Admin Panel UI: Lead Queue" section (table columns, status tabs, filter patterns)
- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" section (lead table columns, side panel pattern)
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum values and badge colors, `leads.view` permission
- `notes/10-convex-schema.md` — `leads` table fields (flat_number, building_id, society_id, status, prospective_bounty_paise, \_creationTime)

### Key Rules

1. Query: `useQuery(api.leads.list, { guard_id: guardId, status: activeStatusFilter, paginationOpts })` — filter by `guard_id` to show only this guard's leads. Accept `guardId` as a prop.
2. Status filter tabs: All | Submitted | Verified | Rejected | Duplicate | Need Info. Tabs map to `LEAD_STATUS` enum values from `lib/constants.ts`. "All" passes no status filter.
3. Table columns: Flat (building name + flat number), Society name, Status (badge), Bounty (₹, from `prospective_bounty_paise` — divide by 100), Date Submitted (formatted "Feb 17, 2026").
4. Header stats row (above the table): Total Submitted (all time), Verified Rate (%), Rejected Rate (%), Avg Leads/Week. Compute from the full unfiltered lead list or from the guard profile's existing `total_leads` and `verified_rate` fields already fetched by the parent page.
5. Money values are in paise — divide by 100 before display. Format as INR.
6. Dates are Unix milliseconds — format with `lib/dates.ts` or `Intl.DateTimeFormat`.
7. Clicking a row navigates to `/admin/leads` with the lead highlighted, or links to `/admin/leads?id={leadId}` if the list page supports query params. Use `next/link`.
8. Reuse existing shared badge components from `src/components/shared/` for status badges. Do NOT duplicate badge logic.
9. Loading state: `Skeleton` rows (5 rows) while query loads.
10. Empty state: "No leads submitted by this guard yet."
11. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/guards/guard-leads-tab.tsx` — GuardLeadsTab component accepting `guardId: Id<"guard_profiles">` prop

### Acceptance Criteria

1. Component renders a table of leads filtered to the specified guard
2. Status filter tabs work — selecting "Verified" shows only VERIFIED leads
3. Table shows correct columns: Flat, Society, Status badge, Bounty (₹), Date
4. Bounty values display as formatted INR (not raw paise)
5. Header stats row shows total submitted, verified rate, rejected rate
6. Clicking a row navigates to the lead detail area
7. Loading state shows skeleton rows
8. Empty state shows friendly message when guard has no leads
9. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/guards/guard-leads-tab.tsx`.

### Out of Scope

- Wiring into the guard detail page (T05)
- Inline lead detail panel within the tab (V2 — clicking navigates to leads page)
- Lead creation from this tab (admin creates leads from the leads page)

---

## T02: GuardVisitsTab Component

### Objective

Build a `GuardVisitsTab` component that shows all visits assigned to a specific guard, split into two sections: Upcoming (ASSIGNED or CONFIRMED) and Past (COMPLETED, CANCELLED, or NO_SHOW). Includes header stats and clickable rows.

### Required Reading

- `notes/features/06-visit-management.md` — "Visit Board" and "Visit Detail" sections (table columns, status groups, outcome values)
- `notes/06-admin-panel-ux.md` — "Flow 4: Schedule Visit" section (visit context)
- `notes/13-constants-reference.md` — `VISIT_STATUS` enum values and badge colors, `VISIT_OUTCOME` enum (INTERESTED, NOT_INTERESTED, FOLLOWUP), `visits.view` permission
- `notes/10-convex-schema.md` — `visits` table fields (listing_id, lead_id, scheduled_date_ms, status, outcome, tenant_name)

### Key Rules

1. Query: `useQuery(api.visits.list, { guard_id: guardId })` — filter by `guard_id`. Accept `guardId` as a prop.
2. Split results into two sections client-side:
   - **Upcoming**: visits with status `ASSIGNED` or `CONFIRMED` — ordered by `scheduled_date_ms` ascending (soonest first).
   - **Past**: visits with status `COMPLETED`, `CANCELLED`, or `NO_SHOW` — ordered by `scheduled_date_ms` descending (most recent first).
3. Table columns for both sections: Property/Flat (building + flat number from the linked lead or listing), Date/Time (formatted), Status badge, Outcome (for Past section — INTERESTED / NOT_INTERESTED / FOLLOWUP, or blank if not completed), Tenant name (if available).
4. Header stats row: Total Visits (all time), Completion Rate (COMPLETED / total × 100), No-Show Count.
5. Dates are Unix milliseconds — format with `lib/dates.ts` or `Intl.DateTimeFormat`. Show date + time (e.g., "Feb 20, 3:00 PM").
6. Clicking a row navigates to `/admin/visits` (with the visit highlighted if the page supports it).
7. Reuse existing shared badge components from `src/components/shared/` for status badges.
8. Loading state: `Skeleton` rows.
9. Empty state per section: "No upcoming visits" / "No past visits".
10. If both sections are empty: "No visits assigned to this guard yet."
11. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/guards/guard-visits-tab.tsx` — GuardVisitsTab component accepting `guardId: Id<"guard_profiles">` prop

### Acceptance Criteria

1. Component renders two sections: Upcoming and Past
2. Upcoming section shows ASSIGNED and CONFIRMED visits, sorted soonest first
3. Past section shows COMPLETED, CANCELLED, NO_SHOW visits, sorted most recent first
4. Table shows correct columns including outcome for past visits
5. Header stats show total visits, completion rate, no-show count
6. Clicking a row navigates to the visits page
7. Loading state shows skeleton rows
8. Empty states show friendly messages per section
9. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/guards/guard-visits-tab.tsx`.

### Out of Scope

- Wiring into the guard detail page (T05)
- Scheduling a new visit from this tab (admin schedules from the visits page)
- IN_PROGRESS visits — treat as Upcoming (they are active)

---

## T03: GuardEarningsTab Component

### Objective

Build a `GuardEarningsTab` component that shows a guard's full payout history with summary cards, a status filter, a payout history table, and a monthly breakdown chart.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Payout Lifecycle" and "Guard Earnings View" sections (payout fields, status flow, display conventions)
- `notes/13-constants-reference.md` — `PAYOUT_STATUS` enum values and badge colors (INITIATED, APPROVED, PAID, FAILED, VOIDED), `payouts.view` permission
- `notes/10-convex-schema.md` — `payouts` table fields (amount_paise, status, payout_method, reference_notes, \_creationTime, closure_id)
- `notes/04-state-machines.md` — "Payout Status" section (INITIATED → APPROVED → PAID, terminal states FAILED/VOIDED)

### Key Rules

1. Query: `useQuery(api.payouts.list, { guard_id: guardId })` — filter by `guard_id`. Accept `guardId` as a prop.
2. Summary cards (4 cards in a row): Total Earned All Time (sum of PAID payouts), Pending Amount (sum of INITIATED + APPROVED payouts), This Month (sum of PAID payouts in current calendar month), Last Payout Date (date of most recent PAID payout, or "None yet").
3. All money values are in paise — divide by 100 before display. Format as INR.
4. Status filter: All | Pending (INITIATED) | Approved | Disbursed (PAID) | Failed | Voided. Filter applied client-side on the fetched list.
5. Payout history table columns: Amount (₹), Type/Method (CASH / UPI / BANK_TRANSFER — from `payout_method`), Status badge, Date, Reference Notes (truncated to 40 chars if long).
6. Monthly breakdown: A simple bar chart (Recharts `BarChart`) showing total PAID amount per month for the last 6 months. X-axis: month labels ("Feb 2026"). Y-axis: amount in ₹. Compute from the fetched payout list client-side — no separate query needed.
7. Dates are Unix milliseconds — format with `lib/dates.ts` or `Intl.DateTimeFormat`.
8. Reuse existing shared badge components from `src/components/shared/` for status badges.
9. Loading state: `Skeleton` for summary cards and table rows.
10. Empty state: "No payouts recorded for this guard yet."
11. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/guards/guard-earnings-tab.tsx` — GuardEarningsTab component accepting `guardId: Id<"guard_profiles">` prop

### Acceptance Criteria

1. Summary cards show correct totals: all-time earned, pending, this month, last payout date
2. All money values display as formatted INR
3. Status filter tabs work — selecting "Disbursed" shows only PAID payouts
4. Payout history table shows correct columns
5. Monthly breakdown bar chart renders for the last 6 months
6. Loading state shows skeletons for cards and table
7. Empty state shows friendly message when guard has no payouts
8. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/guards/guard-earnings-tab.tsx`.

### Out of Scope

- Wiring into the guard detail page (T05)
- Creating a new payout from this tab (admin creates payouts from the payouts page)
- Exporting payout history to CSV (V2)

---

## T04: GuardAuditTab Component

### Objective

Build a `GuardAuditTab` component that shows the 10 most recent audit events for a specific guard entity. Includes expandable rows showing before/after diffs, an action type filter, and a link to the full audit log pre-filtered to this guard.

### Required Reading

- `notes/07-audit-trail.md` — Full file (audit log structure, action types, diff format, what gets logged)
- `notes/13-constants-reference.md` — Audit action constants (GUARDS_CREATE, GUARDS_UPDATE, etc.), `audit.view` permission
- `notes/10-convex-schema.md` — `audit_logs` table fields (actor_user_id, actor_type, action, entity_type, entity_id, changes, \_creationTime)
- `src/app/(admin)/admin/audit/page.tsx` — Existing audit page (read to understand the AuditChangeDiff pattern already implemented there)

### Key Rules

1. Query: `useQuery(api.auditLogs.list, { entity_type: "guard_profiles", entity_id: guardId, limit: 10 })` — filter by entity. Accept `guardId` as a prop. Check the actual `api.auditLogs.list` signature in `convex/auditLogs.ts` before writing the query call — use the exact parameter names the query accepts.
2. Table columns: Timestamp (formatted "Feb 17, 2026 2:34 PM"), Action (e.g., "GUARDS_UPDATE"), Actor (admin name or "System"), Changes summary (brief text like "status: ACTIVE → BANNED").
3. Expandable rows: clicking a row expands it to show the full before/after diff. Reuse the `AuditChangeDiff` component (or equivalent) from the existing audit page at `src/app/(admin)/admin/audit/`. Do NOT duplicate the diff rendering logic.
4. Action type filter: a dropdown or tab set to filter by action type (e.g., show only GUARDS_UPDATE events). Populate options from the distinct action values in the fetched results.
5. "View all in Audit Log" link at the bottom: navigates to `/admin/audit?entity_type=guard_profiles&entity_id={guardId}`. Use `next/link`.
6. Dates are Unix milliseconds — format with `lib/dates.ts` or `Intl.DateTimeFormat`.
7. Loading state: `Skeleton` rows (5 rows).
8. Empty state: "No audit events found for this guard."
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/guards/guard-audit-tab.tsx` — GuardAuditTab component accepting `guardId: Id<"guard_profiles">` prop

### Acceptance Criteria

1. Component renders a table of the 10 most recent audit events for the guard
2. Table shows timestamp, action, actor, and changes summary columns
3. Clicking a row expands it to show the full before/after diff (reusing existing diff component)
4. Action type filter narrows the displayed events
5. "View all in Audit Log" link navigates to the audit page pre-filtered to this guard
6. Loading state shows skeleton rows
7. Empty state shows friendly message
8. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/guards/guard-audit-tab.tsx`.

### Out of Scope

- Wiring into the guard detail page (T05)
- Audit events for entities other than the guard profile itself (e.g., leads submitted by this guard — those are in the leads tab)
- Pagination beyond 10 events (the "View all" link handles that)

---

## T05: Wire All 4 Tabs into Guard Detail Page

### Objective

Replace the 4 `PlaceholderTab` usages in `src/app/(admin)/admin/guards/[id]/page.tsx` (at lines 560, 564, 568, 665) with the real components built in T01-T04. Verify all 8 tabs render correctly and remove `PlaceholderTab` if it is no longer used anywhere.

### Required Reading

- `src/app/(admin)/admin/guards/[id]/page.tsx` — Full file (749 lines). Read it before making any changes. Understand the existing tab structure, how `guardId` is available, and what data is already fetched.
- `notes/06-admin-panel-ux.md` — "Flow 6: Guard Management" section (8-tab list: Profile, Shifts, Leads, Visits, Earnings, Incentives, Audit — verify the tab order matches)
- `notes/13-constants-reference.md` — Permissions required for each tab's data (`leads.view`, `visits.view`, `payouts.view`, `audit.view`)

### Key Rules

1. Read `src/app/(admin)/admin/guards/[id]/page.tsx` in full before editing. Understand the existing tab structure and the `PlaceholderTab` component definition.
2. Replace the 4 placeholder tab contents:
   - Line ~560: Lead history placeholder → `<GuardLeadsTab guardId={guard._id} />`
   - Line ~564: Visit history placeholder → `<GuardVisitsTab guardId={guard._id} />`
   - Line ~568: Earnings placeholder → `<GuardEarningsTab guardId={guard._id} />`
   - Line ~665: Audit log placeholder → `<GuardAuditTab guardId={guard._id} />`
3. Import all 4 new components at the top of the file.
4. Pass `guard._id` (the Convex `Id<"guard_profiles">`) as the `guardId` prop to each component. Verify the correct field name by reading the existing file.
5. After replacing all 4 placeholders, check if `PlaceholderTab` is still used anywhere in the file. If it is no longer used, remove its definition. If it is still used by other tabs, leave it.
6. Do NOT change the tab order, tab labels, or any other part of the page. Only replace the 4 placeholder tab contents.
7. Run `lsp_diagnostics` on the modified page file after changes.
8. Run `npx tsc --noEmit` to confirm no TypeScript errors.
9. `npm run build` must pass.
10. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/app/(admin)/admin/guards/[id]/page.tsx` — Modified to use 4 real tab components instead of placeholders
- [ ] `PlaceholderTab` component removed from the file if no longer used (or left if still needed by other tabs)

### Acceptance Criteria

1. Guard detail page renders all 8 tabs without errors
2. Leads tab shows real lead data for the guard (not a placeholder message)
3. Visits tab shows real visit data for the guard (not a placeholder message)
4. Earnings tab shows real payout data for the guard (not a placeholder message)
5. Audit tab shows real audit events for the guard (not a placeholder message)
6. The 4 previously-placeholder tabs no longer contain any text referencing "Phase 4", "Phase 7", "Phase 9", or "Phase 13"
7. `PlaceholderTab` is removed if it has no remaining usages
8. `npx tsc --noEmit` passes with no errors
9. `npm run build` passes with no errors
10. `lsp_diagnostics` clean on `src/app/(admin)/admin/guards/[id]/page.tsx` and all 4 new component files

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on:

- `src/app/(admin)/admin/guards/[id]/page.tsx`
- `src/components/admin/guards/guard-leads-tab.tsx`
- `src/components/admin/guards/guard-visits-tab.tsx`
- `src/components/admin/guards/guard-earnings-tab.tsx`
- `src/components/admin/guards/guard-audit-tab.tsx`

### Out of Scope

- Changes to the Profile tab, Shifts tab, or Incentives tab (those are already working)
- Changes to the guard detail page header or stats section
- Adding new tabs beyond the existing 8
- Fixing the pre-existing `incentives` property TypeScript errors visible in the file (those are tracked separately)
