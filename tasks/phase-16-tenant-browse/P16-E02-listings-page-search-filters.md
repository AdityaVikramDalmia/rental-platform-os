---
id: P16-E02
title: Listings Page, Search & Filters
phase: 16
status: pending
depends_on: ["P16-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P16-E02: Listings Page, Search & Filters

## Overview

Build the listings directory page route at `src/app/(public)/listings/page.tsx` and all input mechanism components: a debounced search bar, a responsive filter sidebar (desktop-persistent / mobile-Sheet), a sort dropdown, and active filter chips with "Clear All". All filter/sort/page state is read from and written to URL search params via the `url-state.ts` utility from E01. The page calls `useQuery(api.listings.listPublished, filters)` with the parsed URL state and renders the listing results area (card rendering itself is E03).

## Prerequisites

- **Read first**: [P16-E01 Completion Summary](P16-E01-tenant-browse-backend.md#completion-summary) — `listPublished` and `getFilterOptions` queries are live. `src/lib/url-state.ts` exists with `parseListingFilters()`, `serializeListingFilters()`, `updateSearchParams()`. Verify all three functions are exported before wiring up components.
- **Codebase facts to verify before starting**:
  - `src/app/(public)/layout.tsx` exists with `ConvexClientProvider`, `<PublicHeader>`, `<Footer>`. The listings page inherits this layout.
  - `src/components/ui/sheet.tsx` exists — used for mobile filter sidebar.
  - `src/components/ui/select.tsx` exists — used for sort dropdown.
  - `src/components/ui/input.tsx` exists — used for search bar and price range inputs.
  - `src/components/ui/radio-group.tsx` exists — used for locality single-select filter (or use Button variant="ghost" for toggle behavior).
  - `src/components/ui/badge.tsx` exists — used for active filter chips and BHK/furnishing chips.
  - `src/components/ui/button.tsx` exists — used throughout.
  - `src/components/ui/separator.tsx` exists — used between filter sections.
  - `src/components/ui/switch.tsx` exists — used for "Available Now" toggle.
  - `src/components/ui/skeleton.tsx` exists — used for loading states.
  - The public header already has a "Browse Listings" link pointing to `/listings`.

## Task Queue

- [ ] P16-E02-T01: Listings Directory Page Route
- [ ] P16-E02-T02: Search Bar Component
- [ ] P16-E02-T03: Filter Sidebar Component
- [ ] P16-E02-T04: Sort Dropdown & Active Filter Chips

---

## T01: Listings Directory Page Route

### Objective

Create the listings directory page at `src/app/(public)/listings/page.tsx`. This is the page shell that reads URL search params, calls `listPublished` + `getFilterOptions` queries, and assembles the search bar, filter sidebar, sort controls, and results area into the page layout.

### Required Reading

- `notes/features/11-tenant-browse.md` — full file: page layout, filter placement, card area
- `src/app/(public)/homepage/page.tsx` — reference for server component page shell under `(public)` route group
- `src/app/(admin)/admin/payouts/page.tsx` — reference for URL-synced filter state pattern with `searchParams`
- `src/lib/url-state.ts` — `parseListingFilters()` for parsing URL state

### Key Rules

1. Create `src/app/(public)/listings/page.tsx`. The URL will be `/listings` (the `(public)` route group adds no URL segment).
2. **Server component page shell** that exports metadata only:
   ```typescript
   export const metadata: Metadata = {
     title: "Browse Rental Listings — DemoRentals",
     description: "Search and filter verified rental properties. Find your perfect home.",
     openGraph: {
       title: "Browse Rental Listings — DemoRentals",
       description: "Search and filter verified rental properties.",
       type: "website",
     },
   };
   ```
   The server component renders `<ListingsPageClient />` — a separate `"use client"` component.
3. **Create a separate client component file** at `src/app/(public)/listings/listings-page-client.tsx` with `"use client"` directive. This file is required because it uses hooks (`useQuery`, `useSearchParams`, `useRouter`) which cannot exist in the server component `page.tsx`. Follow the existing codebase pattern where admin pages use `useSearchParams()` from `"next/navigation"` (see `src/app/(admin)/admin/payouts/page.tsx` line ~28). The server component `page.tsx` simply imports and renders `<ListingsPageClient />`.
4. `<ListingsPageClient>` reads URL state via `useSearchParams()` hook (NOT server component `searchParams` prop — matching the existing admin page pattern):
   - Parses URL state: `const searchParams = useSearchParams(); const filters = parseListingFilters(searchParams);`.
   - Calls two queries:
     - `const result = useQuery(api.listings.listPublished, { search: filters.search, bhk_config: filters.bhk_config, furnishing: filters.furnishing, rent_min: filters.rent_min, rent_max: filters.rent_max, locality: filters.locality, available_now: filters.available_now || undefined, sort: filters.sort, page: filters.page, page_size: 20 })`.
     - `const filterOptions = useQuery(api.listings.getFilterOptions)`.
   - Renders the page layout with responsive grid.
5. **Page layout structure**:
   ```
   ┌──────────────────────────────────────────────┐
   │ [SearchBar]                                   │
   ├─────────┬────────────────────────────────────┤
   │ Filter  │ [Sort] [ViewToggle] [FilterChips]  │
   │ Sidebar │ ─────────────────────────────────── │
   │ (280px) │ [PropertyCards grid/list]           │
   │         │ ─────────────────────────────────── │
   │         │ [Pagination]                        │
   └─────────┴────────────────────────────────────┘
   ```
   Desktop: 2-column layout (sidebar + content). Mobile: single column (filter sidebar hidden behind Sheet trigger).
6. Desktop layout: `<div className="flex gap-6">` with sidebar `<aside className="hidden lg:block w-[280px] shrink-0">` and main content `<main className="flex-1 min-w-0">`.
7. Mobile: show a "Filters" button (with `SlidersHorizontal` icon from lucide-react) in the toolbar that opens the filter sidebar as a Sheet.
8. Pass `filters`, `filterOptions`, `result`, and `updateSearchParams` callback to child components as props. Child components are imported from `@/components/tenant/`.
9. **While queries are loading** (`result === undefined` or `filterOptions === undefined`): show skeleton loaders. Use `<Skeleton>` from `@/components/ui/skeleton`.
10. Result count display: "Showing X of Y listings" above the cards area (or "No listings found" for empty results).

### Deliverables

- [ ] `src/app/(public)/listings/page.tsx` — server component shell with metadata, imports and renders `<ListingsPageClient />`
- [ ] `src/app/(public)/listings/listings-page-client.tsx` — `"use client"` component with `useSearchParams()`, `useQuery` calls for `listPublished` + `getFilterOptions`, responsive layout, and child component assembly

### Acceptance Criteria

1. `/listings` renders without errors.
2. Page shows inside the `(public)` layout (header + footer visible).
3. URL search params are parsed into filter state on load.
4. Both `listPublished` and `getFilterOptions` queries fire on page load.
5. Loading state shows skeleton placeholders.
6. Desktop shows 2-column layout with sidebar. Mobile shows single column with "Filters" button.
7. SEO metadata title is "Browse Rental Listings — DemoRentals".
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Navigate to `http://localhost:3000/listings`. Verify the page renders. Check DevTools Network for `listPublished` and `getFilterOptions` query calls. Verify responsive layout (resize browser). Check `<title>` tag.

### Out of Scope

- Search bar component (T02), filter sidebar component (T03), sort dropdown (T04).
- Property card components (E03).
- Pagination component (E03).

---

## T02: Search Bar Component

### Objective

Create `src/components/tenant/search-bar.tsx` — a debounced text search input that updates the URL `search` param after 300ms of inactivity. Placed at the top of the listings page.

### Required Reading

- `notes/features/11-tenant-browse.md` — "Tenant: Search Listings" user story (lines 36-43): debounced 300ms, searches across society name, building name, locality, description
- `src/app/(admin)/admin/leads/components/lead-table.tsx` — reference pattern for debounced search: `useState` for local input value + `useEffect` with `setTimeout` for debounce
- `src/lib/url-state.ts` — `updateSearchParams()` for URL updates

### Key Rules

1. Create `src/components/tenant/search-bar.tsx` — a `"use client"` component.
2. **Props**: `{ searchValue: string | undefined, onSearchChange: (value: string | undefined) => void }`. The parent page manages URL state; this component is a controlled input with debounce.
3. **Local state**: `const [localValue, setLocalValue] = useState(searchValue ?? "")`. Sync `localValue` back to URL via `onSearchChange` after 300ms debounce.
4. **Debounce pattern** (matching leads table):
   ```typescript
   useEffect(() => {
     const timer = setTimeout(() => {
       onSearchChange(localValue.trim() || undefined);
     }, 300);
     return () => clearTimeout(timer);
   }, [localValue, onSearchChange]);
   ```
5. **UI**: Full-width `<Input>` with a `Search` icon (lucide-react) on the left and a clear button (`X` icon) on the right when non-empty. Placeholder text: "Search by society, building, locality, or description...". Use `className="h-11"` for comfortable mobile touch target.
6. **Clear button**: clicking X sets `localValue` to `""` and immediately calls `onSearchChange(undefined)` (no debounce wait on explicit clear).
7. Import `Input` from `"@/components/ui/input"`. Import `Search`, `X` from `"lucide-react"`.
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/search-bar.tsx` — debounced search input with 300ms delay, clear button, search icon

### Acceptance Criteria

1. Typing in the search bar updates the URL `?search=...` param after 300ms of inactivity.
2. Clearing the search bar removes the `search` param from the URL immediately.
3. The search bar value initializes from the URL `search` param on page load.
4. No flickering or double-updates on fast typing.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/search-bar.tsx`. Navigate to `/listings`, type "thane" in the search bar, wait 300ms, verify URL updates to `?search=thane`. Click X, verify URL `search` param is removed.

### Out of Scope

- Autocomplete / suggestion dropdown (V2).
- Search results highlighting (V2).
- Filter sidebar (T03), sort dropdown (T04).

---

## T03: Filter Sidebar Component

### Objective

Create `src/components/tenant/filter-sidebar.tsx` and `src/components/tenant/filter-section.tsx` — the filter panel with collapsible sections for locality, BHK, price range, furnishing, and availability. Desktop: persistent left sidebar. Mobile: rendered inside a Sheet.

### Required Reading

- `notes/features/11-tenant-browse.md` — "Tenant: Filter Listings" user story (lines 46-60): all filter sections with types
- `notes/13-constants-reference.md` — BHK Config (lines ~151-161), Furnishing (lines ~143-149): display labels
- `lib/constants.ts` — enum objects for BHK_CONFIG and FURNISHING display labels
- `src/components/ui/sheet.tsx` — Sheet for mobile filter panel
- `src/components/ui/radio-group.tsx` — for locality single-select (or Button variant="ghost" for toggle behavior)
- `src/components/ui/switch.tsx` — for "Available Now" toggle

### Key Rules

1. Create `src/components/tenant/filter-section.tsx` — a reusable collapsible section component:
   - Props: `{ title: string, defaultOpen?: boolean, children: ReactNode }`
   - Uses a `<button>` with `ChevronDown` icon (lucide-react) to toggle `useState<boolean>` for open/closed.
   - Animate content with `overflow-hidden` + `max-height` transition (CSS only, no animation library).
   - Used inside the filter sidebar for each filter category.
2. Create `src/components/tenant/filter-sidebar.tsx` — a `"use client"` component:
   - Props: `{ filters: ListingFilters, filterOptions: GetFilterOptionsResult, onFilterChange: (key: string, value: unknown) => void }`.
   - `onFilterChange` is called with the filter key and new value; the parent page handles URL updates.
3. **Locality section** (collapsible, default open): List of radio-style options from `filterOptions.localities`. **Single-select in V1** (clicking one locality selects it, clicking again deselects — behaves like a toggleable radio group, not multi-select checkboxes). Active locality = `filters.locality`. Use shadcn `Button` with `variant="ghost"` or `RadioGroup` — NOT `Checkbox` (which implies multi-select). Multi-select deferred to V2.
4. **Property Type (BHK) section** (collapsible, default open): Horizontal row of chip-style buttons (one per BHK from `filterOptions.bhk_configs`). Active = `filters.bhk_config`. Clicking an active chip deselects it (sets to undefined). Use shadcn `Badge` with `variant="default"` for active and `variant="outline"` for inactive, wrapped in a `<button>`.
5. **Price Range section** (collapsible, default open): Two `<Input>` fields (Min ₹, Max ₹) side-by-side. Values displayed in ₹ (user-friendly), converted to paise when passed to `onFilterChange`. Use `type="number"` with `placeholder="Min"` / `placeholder="Max"`. Input values are `rent_min / 100` and `rent_max / 100` (display ₹ from paise).
6. **Furnishing section** (collapsible, default open): Same chip pattern as BHK. Options from `filterOptions.furnishing_types`. Display labels: "Unfurnished", "Semi-Furnished", "Fully Furnished" (map from enum values).
7. **Available Now section**: A single `<Switch>` toggle from `@/components/ui/switch`. Label: "Available Now". Checked = `filters.available_now`. When toggled, calls `onFilterChange("available_now", !filters.available_now)`.
8. **Mobile rendering**: The parent page wraps `<FilterSidebar>` inside a `<Sheet>` for mobile. The sidebar component itself does NOT contain Sheet — it's a pure content component rendered in either an `<aside>` (desktop) or `<SheetContent>` (mobile).
9. Import `Separator` from `"@/components/ui/separator"` to divide filter sections.
10. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/filter-section.tsx` — reusable collapsible section (title, chevron toggle, animated content)
- [ ] `src/components/tenant/filter-sidebar.tsx` — filter panel with 5 sections (locality single-select, BHK chips, price range inputs, furnishing chips, availability toggle)

### Acceptance Criteria

1. Each filter section collapses/expands on click with smooth animation.
2. Locality: clicking a locality option selects it (updates URL `?locality=...`). Clicking the active locality again deselects it. Single-select only in V1.
3. BHK: clicking a chip selects it (active style). Clicking active chip deselects.
4. Price Range: entering min/max values triggers filter. Values displayed in ₹, stored as paise.
5. Furnishing: same chip behavior as BHK.
6. Available Now: switch toggles between true/false.
7. Sidebar renders in `<aside>` on desktop and inside `<SheetContent>` on mobile.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on both new files. Navigate to `/listings`. Click each filter section header — verify collapse/expand. Select a BHK chip — verify URL updates. Enter a price min — verify URL updates after blur/change. Toggle Available Now — verify URL updates. Resize to mobile — verify Sheet trigger appears and sidebar opens as a Sheet.

### Out of Scope

- Multi-select locality (V1 is single-select).
- Amenity filter section (V2).
- Floor count, pet-friendly, parking filters (V2).
- Search bar (T02), sort dropdown (T04).

---

## T04: Sort Dropdown & Active Filter Chips

### Objective

Create `src/components/tenant/sort-dropdown.tsx` and `src/components/tenant/active-filter-chips.tsx` — the sort control and a bar showing active filters as removable chips with a "Clear All" button.

### Required Reading

- `notes/features/11-tenant-browse.md` — "Tenant: Sort Listings" user story (lines 63-69): sort options list
- `notes/features/11-tenant-browse.md` — "Tenant: Filter Listings" (line 59): active filters as removable chips, "Clear All" button
- `src/components/ui/select.tsx` — shadcn Select for sort dropdown
- `src/components/ui/badge.tsx` — for active filter chips

### Key Rules

1. Create `src/components/tenant/sort-dropdown.tsx` — a `"use client"` component:
   - Props: `{ sort: string, onSortChange: (sort: string) => void }`.
   - Uses shadcn `Select` with options:
     - "Newest First" → `"newest"` (default)
     - "Price: Low to High" → `"price_asc"`
     - "Price: High to Low" → `"price_desc"`
     - "Area: Large to Small" → `"area_desc"`
   - Calls `onSortChange` on value change. Parent handles URL update.
   - Compact width: `className="w-[200px]"`.
2. Create `src/components/tenant/active-filter-chips.tsx` — a `"use client"` component:
   - Props: `{ filters: ListingFilters, onRemoveFilter: (key: string) => void, onClearAll: () => void }`.
   - Renders a horizontal scrollable row of chips for each active (non-default) filter.
   - Each chip shows the filter label (e.g., "2 BHK", "₹10,000 - ₹25,000", "Thane", "Semi-Furnished", "Available Now") with an `X` button to remove.
   - "Clear All" button at the end — only visible when ≥1 filter is active.
   - Uses shadcn `Badge variant="secondary"` for each chip with an `X` icon from lucide-react.
3. **Filter label formatting**:
   - `bhk_config`: Display as "2 BHK" (add space before "BHK"). Handle "STUDIO" and "OTHER" as-is.
   - `furnishing`: Map to display label — "UNFURNISHED" → "Unfurnished", "SEMI_FURNISHED" → "Semi-Furnished", "FULLY_FURNISHED" → "Fully Furnished".
   - `rent_min` / `rent_max`: Format as "₹10,000 - ₹25,000" or "Min ₹10,000" / "Max ₹25,000" if only one is set. Use `formatINR` from `lib/money.ts`.
   - `locality`: Display the city name as-is.
   - `available_now`: Display "Available Now".
   - `search`: Display "Search: '{query}'" (truncated to 20 chars if long).
4. **Removing a filter**: calls `onRemoveFilter(key)` — parent sets that filter to its default value and updates URL.
5. **Clear All**: calls `onClearAll()` — parent resets ALL filter, search, sort, and page state to defaults and navigates to `/listings` (clean URL). This means sort resets to "newest", page resets to 0, all filters cleared.
6. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/sort-dropdown.tsx` — shadcn Select with 4 sort options, controlled by props
- [ ] `src/components/tenant/active-filter-chips.tsx` — horizontal chip bar with removable filter badges + "Clear All"

### Acceptance Criteria

1. Sort dropdown shows 4 options. Changing sort updates URL `?sort=...` param.
2. Default sort "Newest First" does not add `sort` to URL (clean default URL).
3. Active filter chips appear for each non-default filter. Clicking X on a chip removes that filter from URL.
4. "Clear All" removes all filter/search params from URL, resetting to `/listings`.
5. Filter chips show human-readable labels (not raw enum values or paise amounts).
6. Price chip displays in ₹ (not paise).
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on both new files. Navigate to `/listings?bhk=2BHK&furnishing=SEMI_FURNISHED&rent_min=10000&sort=price_asc`. Verify: sort dropdown shows "Price: Low to High", filter chips show "2 BHK", "Semi-Furnished", "Min ₹10,000" (URL stores ₹, parser converts to paise for query). Click X on "2 BHK" chip — verify `bhk` param removed from URL. Click "Clear All" — verify URL resets to `/listings`.

### Out of Scope

- "Relevance" sort option (requires search index scoring — V2). Feature spec mentions it; intentionally deferred.
- "Verified" badge on cards (feature spec mentions it — all published listings are admin-verified by definition, so badge adds no V1 value; deferred to V2).
- Sort persistence in localStorage (sort always resets to "newest" on page revisit without URL params).
- Property cards (E03), pagination (E03), favorite button (E03).

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
