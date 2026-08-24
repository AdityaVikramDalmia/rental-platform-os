---
id: P27-E06
title: List Page Polish (Sorting, Badges, Pagination Info)
phase: 27
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P27-E06: List Page Polish (Sorting, Badges, Pagination Info)

## Overview

Polish all 13 admin list pages with four targeted improvements: client-side column sorting on key tables, "Showing X of Y" pagination info, sidebar badge counts for leads and payouts, and a fix for the listings inquiries column that currently shows "—". All changes are frontend-only.

## Task Queue

- [x] P27-E06-T01: Column Sorting on Key Tables
- [x] P27-E06-T02: Pagination Info ("Showing X of Y")
- [x] P27-E06-T03: Sidebar Badge Counts
- [x] P27-E06-T04: Fix Listings Inquiries Column

---

## T01: Column Sorting on Key Tables

### Objective

Add sortable column headers to seven admin tables. Clicking a header sorts by that column (ascending); clicking again toggles to descending. A visual arrow indicator shows the active sort column and direction. Sorting is client-side — sort the already-fetched page of data.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Table Patterns" section ("Sorting: Click column header to sort")
- `notes/13-constants-reference.md` — Status enums for leads, visits, closures, payouts (to understand sortable status values)

### Key Rules

1. Client-side sorting only. Sort the data already returned by `useQuery` / `usePaginatedQuery`. Do not add `orderBy` arguments to Convex queries — that would require backend changes and is out of scope.
2. Create a single reusable `SortableHeader` component at `src/components/admin/SortableHeader.tsx`. Props: `column: string`, `label: string`, `currentSort: { column: string; direction: "asc" | "desc" }`, `onSort: (column: string) => void`. Renders a `<th>` with the label and an up/down arrow icon from `lucide-react`.
3. Sort state lives in each table component via `useState`. It does not persist across page navigations — that is fine for V1.
4. Use `lucide-react` icons `ArrowUp`, `ArrowDown`, and `ArrowUpDown` (unsorted state). These are already installed.
5. Numeric sorts (rent, amount, brokerage) must sort numerically, not lexicographically. String sorts (name, status) are case-insensitive.
6. Sortable columns per table:
   - **SocietyTable**: Name (string), City (string), Buildings count (number), Guards count (number), Created (date/number)
   - **GuardTable**: Name (string), Lead count (number), Verified rate (number), Created (date/number)
   - **lead-table**: Date submitted (number), Status (string)
   - **listing-table**: Rent (number), Status (string), Created (number)
   - **visit-table**: Scheduled date (number), Status (string)
   - **closure-table**: Brokerage total (number), Date (number)
   - **payout-table**: Amount (number), Status (string), Date (number)

### Deliverables

- [ ] `src/components/admin/SortableHeader.tsx` — Reusable sortable column header component
- [ ] `src/app/(admin)/admin/societies/components/SocietyTable.tsx` (or equivalent) — Sortable columns: Name, City, Buildings count, Guards count, Created
- [ ] `src/app/(admin)/admin/guards/components/GuardTable.tsx` (or equivalent) — Sortable columns: Name, Lead count, Verified rate, Created
- [ ] `src/app/(admin)/admin/leads/components/lead-table.tsx` (or equivalent) — Sortable columns: Date, Status
- [ ] `src/app/(admin)/admin/listings/components/listing-table.tsx` (or equivalent) — Sortable columns: Rent, Status, Created
- [ ] `src/app/(admin)/admin/visits/components/visit-table.tsx` (or equivalent) — Sortable columns: Date, Status
- [ ] `src/app/(admin)/admin/closures/components/closure-table.tsx` (or equivalent) — Sortable columns: Brokerage, Date
- [ ] `src/app/(admin)/admin/payouts/components/payout-table.tsx` (or equivalent) — Sortable columns: Amount, Status, Date

### Acceptance Criteria

1. `SortableHeader` renders a column header with an arrow icon indicating sort state.
2. Clicking an unsorted column header sorts ascending; clicking again sorts descending.
3. Only one column is sorted at a time — clicking a new column resets the previous sort.
4. Numeric columns sort numerically (not as strings).
5. The sorted column header shows `ArrowUp` (asc) or `ArrowDown` (desc); unsorted columns show `ArrowUpDown`.
6. TypeScript compiles clean — `SortableHeader` is fully typed with no implicit `any`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/SortableHeader.tsx` and all modified table files.

### Out of Scope

- Server-side sorting (would require Convex query changes)
- Persisting sort state in URL params or localStorage
- Sorting on columns not listed above
- Multi-column sorting

---

## T02: Pagination Info ("Showing X of Y")

### Objective

Add a "Showing 1-20 of 156 results" line below each paginated table. If the total count is not available from the existing query, show "Showing {count} results" instead. This gives ops a quick sense of queue size without counting rows.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" wireframe (shows "Showing 1-20" at bottom of table)
- `notes/11-convex-architecture.md` — "Pattern 7: Real-Time Subscriptions" section (`usePaginatedQuery` return shape — `results`, `status`, `loadMore`)

### Key Rules

1. `usePaginatedQuery` returns `{ results, status, loadMore }` — it does NOT return a total count. Do not assume a `total` field exists.
2. For tables using `usePaginatedQuery`: show "Showing {results.length} results" when `status === "Exhausted"` (all loaded), or "Showing {results.length} results (more available)" when `status === "CanLoadMore"`. Do not fabricate a total.
3. For tables using `useQuery` with a plain array (not paginated): if the query returns a `total` field alongside the page, use "Showing {start}-{end} of {total}". If no `total` field, show "Showing {count} results".
4. Check each table's actual query return shape before writing the display logic. Do not guess.
5. Place the info line below the table, left-aligned, in `text-sm text-muted-foreground`. Keep it subtle.
6. Add to: leads table, listings table, visits table, closures table, payouts table.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/lead-table.tsx` (or page) — Pagination info line below table
- [ ] `src/app/(admin)/admin/listings/components/listing-table.tsx` (or page) — Pagination info line below table
- [ ] `src/app/(admin)/admin/visits/components/visit-table.tsx` (or page) — Pagination info line below table
- [ ] `src/app/(admin)/admin/closures/components/closure-table.tsx` (or page) — Pagination info line below table
- [ ] `src/app/(admin)/admin/payouts/components/payout-table.tsx` (or page) — Pagination info line below table

### Acceptance Criteria

1. Each of the five tables shows a pagination info line below the table content.
2. The info line accurately reflects the number of loaded results.
3. When all results are loaded (`status === "Exhausted"`), the line does not say "more available".
4. The info line uses `text-sm text-muted-foreground` styling.
5. TypeScript compiles clean.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on all five modified table/page files.

### Out of Scope

- Adding total count to Convex queries (backend change, out of scope)
- Pagination info on societies, guards, or roles tables (lower priority)
- Page number navigation (tables use "Load More" pattern per spec)

---

## T03: Sidebar Badge Counts

### Objective

Add live badge counts to two sidebar nav items: Leads (count of SUBMITTED status leads) and Payouts (count of INITIATED status payouts). Visits already has a badge — leave it unchanged. Badges appear only when count > 0.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Sidebar Navigation" section ("Badge counts on: Leads (SUBMITTED count), Visits (today count), Payouts (pending count)")
- `src/app/(admin)/admin-layout-client.tsx` — current sidebar implementation (Verification item at line 67 with `available: false`; visits badge already present — study how it's done)
- `notes/13-constants-reference.md` — Lead status enum (`SUBMITTED`), Payout status enum (`INITIATED`)

### Key Rules

1. Fetch counts in `admin-layout-client.tsx` using `useQuery`. The sidebar is a client component, so `useQuery` is available.
2. For leads: use `api.leads.list` with `{ status: "SUBMITTED" }` filter. Check if this query returns a count or just paginated results. If it returns paginated results, use `results.length` as a proxy count (acceptable for badge purposes — exact total not required).
3. For payouts: use `api.payouts.list` with `{ status: "INITIATED" }` filter. Same approach as leads.
4. Only render the badge when count > 0. A zero badge is visual noise.
5. Badge styling: small red circle with white number, positioned top-right of the nav label. Match the existing visits badge style exactly — do not invent a new badge design.
6. The badge count must update in real-time via Convex subscriptions (this is automatic with `useQuery`).

### Deliverables

- [ ] `src/app/(admin)/admin-layout-client.tsx` — Leads nav item shows SUBMITTED count badge, Payouts nav item shows INITIATED count badge

### Acceptance Criteria

1. Leads nav item shows a red badge with the count of SUBMITTED leads when count > 0.
2. Payouts nav item shows a red badge with the count of INITIATED payouts when count > 0.
3. Both badges disappear when their respective counts reach 0.
4. Badge styling matches the existing visits badge.
5. Visits badge is unchanged.
6. TypeScript compiles clean.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin-layout-client.tsx`.

### Out of Scope

- Badge counts on societies, guards, listings, closures, or other nav items
- Animated badge transitions
- Persisting badge counts across sessions

---

## T04: Fix Listings Inquiries Column

### Objective

The listings table has an "Inquiries" column that currently shows "—" for every row. Wire it to show the actual inquiry count per listing, or remove the column if no count data is available without a new backend query.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 3: Create Listing from Verified Lead" section (listings context)
- `src/app/(admin)/admin/listings/` — read the listings page and table component to understand what data the current query returns

### Key Rules

1. First, check what `api.listings.list` (or the equivalent query powering the listings table) actually returns. If it already returns an `inquiry_count` or similar field, wire it up.
2. If the existing query does NOT return inquiry count, do NOT add a new Convex query. Instead, remove the "Inquiries" column from the table entirely. A missing column is better than a column full of "—".
3. If removing the column: also remove the column header and any associated TypeScript types. Leave no dead code.
4. If wiring up a real count: display it as a plain number. No special formatting needed.
5. Document your finding in a code comment: either `// inquiry_count returned by api.listings.list` or `// Inquiries column removed — count not available in existing query`.

### Deliverables

- [ ] `src/app/(admin)/admin/listings/components/listing-table.tsx` (or equivalent) — Inquiries column either shows real count or is removed entirely

### Acceptance Criteria

1. The listings table no longer shows "—" in the Inquiries column.
2. Either: the column shows a real numeric count per listing, OR the column is fully removed (header + cells + any dead TypeScript).
3. No `as any` or type suppressions introduced.
4. TypeScript compiles clean.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on the modified listings table file.

### Out of Scope

- Adding a new Convex query to fetch inquiry counts (backend change, out of scope)
- Showing inquiry details inline in the table
- Inquiry count on the listing detail page (separate concern)
