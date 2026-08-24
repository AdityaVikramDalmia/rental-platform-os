---
id: P28-E05
title: Inline Table Actions + CSV Export
phase: 28
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P28-E05: Inline Table Actions + CSV Export

## Overview

Add hover-revealed action buttons to lead and payout table rows so admins can act on individual records without opening a detail panel. Create a reusable CSV export utility and add an "Export CSV" button to all 7 list pages. All CSV generation is client-side — no server route needed.

## Task Queue

- [x] P28-E05-T01: Add hover action buttons to lead table rows
- [x] P28-E05-T02: Add hover action buttons to payout table rows
- [x] P28-E05-T03: Create reusable CSV export utility
- [x] P28-E05-T04: Add "Export CSV" button to all 7 list pages

---

## T01: Add Hover Action Buttons to Lead Table Rows

### Objective

Add an action column to the lead table that is invisible by default and reveals action buttons (Verify, Reject, Need Info, More dropdown) when the user hovers over a row. Actions call existing mutations and show a toast on success.

### Required Reading

- `src/app/(admin)/admin/leads/page.tsx` — Read the full file before editing. Understand the current table structure, column definitions, and how the detail panel is opened.
- `convex/leads.ts` — Confirm the exact mutation names and argument shapes for `verify`, `reject`, and `requestInfo` (or equivalent)
- `src/components/ui/dropdown-menu.tsx` — Existing shadcn/ui DropdownMenu component (used for the "More" dropdown)
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum, permission strings for lead mutations
- `notes/04-state-machines.md` — Lead status transitions (only show actions valid for the current row's status)

### Key Rules

1. Read `src/app/(admin)/admin/leads/page.tsx` fully before making any changes.
2. Add a new column as the LAST column in the table. The column header is empty. The cell contains the action buttons.
3. Use Tailwind's `group` class on the table row (`<tr>`) and `group-hover:opacity-100 opacity-0` on the action cell to hide/show buttons on row hover:
   ```tsx
   <tr className="group ...">
     {/* other cells */}
     <td className="opacity-0 group-hover:opacity-100 transition-opacity">
       {/* action buttons */}
     </td>
   </tr>
   ```
4. Action buttons in the cell (left to right):
   - **Verify** (✓): `Button` with `variant="ghost"` `size="icon"`, `CheckCircle` icon from lucide-react. Calls `verifications.create` mutation. Only show if lead status is `SUBMITTED` or `NEED_INFO`.
   - **Reject** (✗): `Button` with `variant="ghost"` `size="icon"`, `XCircle` icon. Calls `reject` mutation. Only show if lead status is NOT a terminal state (not `REJECTED`, `DUPLICATE`).
   - **Need Info** (?): `Button` with `variant="ghost"` `size="icon"`, `HelpCircle` icon. Calls `requestInfo` mutation. Only show if lead status is `SUBMITTED`.
   - **More** (⋯): `DropdownMenu` trigger with `MoreHorizontal` icon. Dropdown items: "View Detail" (opens the existing detail panel), "Copy Lead ID" (copies `lead._id` to clipboard).
5. Show action buttons conditionally based on the row's current `status` field. Do NOT show a "Verify" button on an already-verified lead.
6. Each action button has a `Tooltip` (shadcn/ui) showing the action name on hover. Tooltip delay: 500ms.
7. On mutation success: `toast.success("Lead verified")` / `toast.success("Lead rejected")` / `toast.success("Info requested")`. On error: `toast.error(error.message)`.
8. The action column must NOT interfere with the row click handler that opens the detail panel. The action buttons must call `e.stopPropagation()` to prevent the row click from firing when an action button is clicked.
9. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/page.tsx` — Updated with hover action column: Verify, Reject, Need Info buttons + More dropdown, conditional visibility by status, stopPropagation, success/error toasts

### Acceptance Criteria

1. Action buttons are invisible by default and appear on row hover
2. "Verify" button only appears for SUBMITTED and NEED_INFO leads
3. "Reject" button does not appear for terminal-state leads (REJECTED, DUPLICATE)
4. "Need Info" button only appears for SUBMITTED leads
5. Clicking an action button calls the correct mutation and shows a success toast
6. Clicking an action button does NOT open the detail panel (stopPropagation works)
7. "More" dropdown shows "View Detail" and "Copy Lead ID" items
8. Each button has a tooltip with the action name
9. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/leads/page.tsx`.

### Out of Scope

- Hover actions on other tables (T02 covers payouts; other tables are V2)
- Inline editing of lead fields (V2)
- Undo after inline action (V2)
- Keyboard navigation within the action buttons (V2)

---

## T02: Add Hover Action Buttons to Payout Table Rows

### Objective

Add hover-revealed action buttons to payout table rows: Approve (✓), Void (✗), and a Details dropdown (View Guard, View Lead, View Closure). Same `group` + `group-hover:opacity-100` pattern as T01.

### Required Reading

- `src/app/(admin)/admin/payouts/page.tsx` — Read the full file before editing. Understand the current table structure and how the detail panel is opened.
- `convex/payouts.ts` — Confirm the exact mutation names and argument shapes for `approve` and `voidPayout`
- `src/components/ui/dropdown-menu.tsx` — Existing shadcn/ui DropdownMenu component
- `notes/13-constants-reference.md` — `PAYOUT_STATUS` enum, permission strings for payout mutations
- `notes/04-state-machines.md` — Payout status transitions (`pending` → `approved` → `disbursed`)

### Key Rules

1. Read `src/app/(admin)/admin/payouts/page.tsx` fully before making any changes.
2. Same `group` + `group-hover:opacity-100` pattern as T01. Add the action column as the LAST column.
3. Action buttons in the cell:
   - **Approve** (✓): `Button` with `variant="ghost"` `size="icon"`, `CheckCircle` icon. Calls `approve` mutation. Only show if payout status is `pending`.
   - **Void** (✗): `Button` with `variant="ghost"` `size="icon"`, `XCircle` icon. Calls `voidPayout` mutation. Only show if payout status is `pending` or `approved`.
   - **Details** (→): `DropdownMenu` trigger with `ExternalLink` icon. Dropdown items:
     - "View Guard" → navigates to `/admin/guards/{guard_user_id}` (use `router.push`)
     - "View Lead" → navigates to `/admin/leads?id={lead_id}` (if the payout has a linked lead via closure)
     - "View Closure" → navigates to `/admin/closures?id={closure_id}` (if the payout has a linked closure)
       Only show "View Lead" and "View Closure" items if the payout has those linked IDs. If a linked ID is missing, omit that item from the dropdown.
4. Show action buttons conditionally based on the row's `status` field. Terminal-state payouts (`disbursed`, `failed`, `voided`) show only the "Details" dropdown — no approve/void buttons.
5. Each action button has a `Tooltip` showing the action name. Tooltip delay: 500ms.
6. On mutation success: `toast.success("Payout approved")` / `toast.success("Payout voided")`. On error: `toast.error(error.message)`.
7. Action buttons call `e.stopPropagation()` to prevent the row click (detail panel open) from firing.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/app/(admin)/admin/payouts/page.tsx` — Updated with hover action column: Approve, Void buttons + Details dropdown, conditional visibility by status, stopPropagation, success/error toasts

### Acceptance Criteria

1. Action buttons are invisible by default and appear on row hover
2. "Approve" only appears for `pending` payouts
3. "Void" only appears for `pending` and `approved` payouts
4. Terminal-state payouts (`disbursed`, `failed`, `voided`) show only the Details dropdown
5. "View Guard" navigates to the guard's detail page
6. "View Lead" and "View Closure" only appear if the payout has those linked IDs
7. Clicking an action button does NOT open the detail panel (stopPropagation works)
8. Each button has a tooltip
9. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/payouts/page.tsx`.

### Out of Scope

- Hover actions on other tables (leads covered in T01; others are V2)
- Bulk approve/void (covered in E04)
- Payout amount editing inline (V2)

---

## T03: Create Reusable CSV Export Utility

### Objective

Create `src/lib/export-csv.ts` — a pure TypeScript utility that accepts an array of objects and a column configuration, generates a CSV string, and triggers a browser download. No server-side route. No third-party library.

### Required Reading

- `lib/money.ts` — `paiseToRupees()` and `formatINR()` helpers (used in column formatters for money fields)
- `lib/dates.ts` — Date formatting helpers (used in column formatters for timestamp fields)
- `lib/constants.ts` — Status enum values (used in column formatters for status fields)
- `notes/13-constants-reference.md` — `LEAD_STATUS`, `GUARD_STATUS`, `PAYOUT_STATUS` labels (for human-readable status in CSV)

### Key Rules

1. The utility is a plain TypeScript module — no React, no hooks. It exports one main function and supporting types.
2. Types:

   ```typescript
   export type CsvColumn<T> = {
     label: string; // Column header in the CSV
     accessor: keyof T | ((row: T) => unknown); // Field name or getter function
     formatter?: (value: unknown, row: T) => string; // Optional value formatter
   };

   export function exportToCsv<T extends object>(
     data: T[],
     columns: CsvColumn<T>[],
     filename: string,
   ): void;
   ```

3. CSV generation rules:
   - First row: column headers from `column.label`, comma-separated.
   - Subsequent rows: one row per item in `data`.
   - For each cell: call `accessor` (if function) or `row[accessor]` (if key), then call `formatter` if provided, then convert to string.
   - Escape values that contain commas, double quotes, or newlines by wrapping in double quotes and escaping internal double quotes as `""`.
   - Use `\r\n` as the line separator (RFC 4180 compliant).
4. Browser download trigger:
   ```typescript
   const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
   const url = URL.createObjectURL(blob);
   const link = document.createElement("a");
   link.href = url;
   link.download = filename;
   link.click();
   URL.revokeObjectURL(url);
   ```
5. The `filename` parameter should include the `.csv` extension. Callers pass it as `"leads-2026-02-19.csv"`.
6. Money formatters: callers pass a formatter that calls `paiseToRupees()` and formats as a plain number (e.g., `"25000"` not `"₹25,000"` — CSV is for spreadsheets, not display). The utility does not know about paise — formatters handle it.
7. Date formatters: callers pass a formatter that converts Unix ms to a readable date string (e.g., `"2026-02-19"`).
8. The function must be safe to call in a browser environment only. It uses `document` and `URL` — do NOT call it during SSR. Callers are responsible for ensuring it's called from a click handler (client-side only).
9. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/lib/export-csv.ts` — `CsvColumn<T>` type, `exportToCsv<T>()` function with RFC 4180 CSV generation and browser download trigger

### Acceptance Criteria

1. `exportToCsv` generates a valid CSV string with correct headers and rows
2. Values containing commas are wrapped in double quotes
3. Values containing double quotes have internal quotes escaped as `""`
4. The function triggers a browser file download with the correct filename
5. The function accepts a generic type parameter so TypeScript enforces column accessor types
6. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/lib/export-csv.ts`.

### Out of Scope

- Excel (`.xlsx`) export (V2 — requires a library like `xlsx`)
- Server-side CSV generation (V2)
- Streaming large datasets (V2 — current approach loads all data into memory)
- Custom CSV delimiters (V2)

---

## T04: Add "Export CSV" Button to All 7 List Pages

### Objective

Add an "Export CSV" button to the page header of all 7 admin list pages (leads, guards, societies, visits, closures, payouts, listings). The button exports the currently visible/filtered data using the utility from T03. File name format: `{entity}-{YYYY-MM-DD}.csv`.

### Required Reading

- `src/lib/export-csv.ts` — The utility from T03 (read before using)
- `lib/money.ts` — `paiseToRupees()` for money column formatters
- `lib/dates.ts` — Date formatting helpers for date column formatters
- `lib/constants.ts` — Status label maps for status column formatters
- `notes/13-constants-reference.md` — All status enum values and their human-readable labels
- The 7 list page files (read each before editing):
  - `src/app/(admin)/admin/leads/page.tsx`
  - `src/app/(admin)/admin/guards/page.tsx`
  - `src/app/(admin)/admin/societies/page.tsx`
  - `src/app/(admin)/admin/visits/page.tsx`
  - `src/app/(admin)/admin/closures/page.tsx`
  - `src/app/(admin)/admin/payouts/page.tsx`
  - `src/app/(admin)/admin/listings/page.tsx`

### Key Rules

1. Read each list page file before editing it. Understand how data is fetched (which `useQuery` or `usePaginatedQuery` call) and what fields are available on each entity.
2. The "Export CSV" button is placed in the page header area, to the right of the existing filter controls. Use `Button` with `variant="outline"` `size="sm"` and a `Download` icon from lucide-react. Label: `"Export CSV"`.
3. The button exports the **currently visible data** — whatever is in the current query result (respecting active filters). It does NOT fetch all records from the database. If the page uses `usePaginatedQuery`, export only the currently loaded `results` array.
4. The `onClick` handler calls `exportToCsv(data, columns, filename)` from `src/lib/export-csv.ts`. This is a synchronous call — no loading state needed.
5. Column definitions per entity (define these inline in each page file):

   **Leads**: Flat Number, Building, Society, Owner Name, Owner Phone (10 digits, no +91 in CSV), Status, Submitted By (guard name), Submitted At (YYYY-MM-DD)

   **Guards**: Name, Phone (10 digits), Guard Type, Society, Status, Created At (YYYY-MM-DD)

   **Societies**: Name, City, Status, Buildings Count, Created At (YYYY-MM-DD)

   **Visits**: Property (flat + building), Society, Guard Name, Status, Scheduled At (YYYY-MM-DD HH:MM), Outcome

   **Closures**: Flat Number, Building, Society, Status, Brokerage Tenant (`brokerage_tenant_side`, rupees plain number), Brokerage Owner (`brokerage_owner_side`, rupees plain number), Confirmed At (YYYY-MM-DD)

   **Payouts**: Guard Name, Amount (rupees, plain number), Status, Method, Created At (YYYY-MM-DD)

   **Listings**: Title (or flat + building), Society, BHK, Rent (rupees, plain number), Status, Published At (YYYY-MM-DD)

6. Money values in CSV: use `paiseToRupees()` from `lib/money.ts` and format as a plain integer (e.g., `25000` not `₹25,000`). The column label should indicate the unit: `"Rent (₹)"`, `"Amount (₹)"`.
7. Phone numbers in CSV: 10 digits only (no `+91` prefix). The raw value from the database is already 10 digits — use it directly.
8. Date values in CSV: format as `YYYY-MM-DD` using `new Date(timestampMs).toISOString().split("T")[0]`.
9. Filename format: `leads-2026-02-19.csv`, `guards-2026-02-19.csv`, etc. Use `new Date().toISOString().split("T")[0]` for the date portion.
10. If the current data array is empty, the button is still clickable — it will generate a CSV with only the header row. Do NOT disable the button when data is empty.
11. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/page.tsx` — "Export CSV" button with leads column config
- [ ] `src/app/(admin)/admin/guards/page.tsx` — "Export CSV" button with guards column config
- [ ] `src/app/(admin)/admin/societies/page.tsx` — "Export CSV" button with societies column config
- [ ] `src/app/(admin)/admin/visits/page.tsx` — "Export CSV" button with visits column config
- [ ] `src/app/(admin)/admin/closures/page.tsx` — "Export CSV" button with closures column config
- [ ] `src/app/(admin)/admin/payouts/page.tsx` — "Export CSV" button with payouts column config
- [ ] `src/app/(admin)/admin/listings/page.tsx` — "Export CSV" button with listings column config

### Acceptance Criteria

1. All 7 list pages have an "Export CSV" button in the page header
2. Clicking the button triggers a browser file download
3. The downloaded file is named `{entity}-{YYYY-MM-DD}.csv`
4. The CSV contains the correct columns for each entity type
5. Money values are plain integers (rupees, not paise, no currency symbol)
6. Phone numbers are 10 digits (no +91)
7. Dates are in `YYYY-MM-DD` format
8. The CSV respects active filters (exports only currently visible data)
9. `npx tsc --noEmit` passes on all 7 modified files

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on all 7 modified list page files and `src/lib/export-csv.ts`.

### Out of Scope

- Exporting all records (not just currently visible) — that requires a separate Convex query with no pagination limit (V2)
- Excel export (V2)
- Scheduled/automated exports (V2)
- Export from detail panels (V2)
- Custom column selection by the user (V2)
