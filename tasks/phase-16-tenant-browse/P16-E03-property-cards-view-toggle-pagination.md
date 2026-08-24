---
id: P16-E03
title: Property Cards, View Toggle & Pagination
phase: 16
status: pending
depends_on: ["P16-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P16-E03: Property Cards, View Toggle & Pagination

## Overview

Build the output/display components for the listings directory: property card components in both grid and list variants, a grid/list view toggle with localStorage persistence, pagination controls with page numbers, a localStorage-based favorite button, WhatsApp deep links on cards, and all empty/loading/no-results states. These components are rendered inside the page shell from E02 and consume the `listPublished` query result from E01. Also create a `listing-results.tsx` orchestrator component that wires cards, view toggle, and pagination together.

## Prerequisites

- **Read first**: [P16-E01 Completion Summary](P16-E01-tenant-browse-backend.md#completion-summary) — `listPublished` returns `{ listings, total, page, page_size, has_more }` with each listing enriched: `building_name`, `society_name`, `locality`, `flat_number`, `cover_photo_url`, plus all listing fields (`rent_monthly`, `bhk_config`, `furnishing`, `carpet_area_sqft`, `available_from`, `amenities`, `slug`).
- **Codebase facts to verify before starting**:
  - If `src/components/public/featured-listings.tsx` exists from P15 — use as reference for property card rendering pattern (photo, rent formatting, BHK display, WhatsApp CTA). If not yet created, reference `convex/listings.ts` `list` query enrichment pattern for data shape.
  - `lib/money.ts` exists with `formatINR(paiseAmount)` for ₹ display.
  - `lib/dates.ts` exists for date formatting.
  - `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `src/components/ui/skeleton.tsx` exist.
  - `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` env var is set.

## Task Queue

- [ ] P16-E03-T01: Property Card Components (Grid + List)
- [ ] P16-E03-T02: View Toggle & Pagination Controls
- [ ] P16-E03-T03: Favorite Button, WhatsApp Deep Link & States

---

## T01: Property Card Components (Grid + List)

### Objective

Create `src/components/tenant/property-card-grid.tsx` and `src/components/tenant/property-card-list.tsx` — two card variants that display the same listing data in different layouts. Grid cards are compact (for 2-3 column layouts), list cards are expanded (single-column with horizontal layout).

### Required Reading

- `notes/features/11-tenant-browse.md` — "Property Card (Grid View)" wireframe (lines 98-112), "Property List Item (List View)" wireframe (lines 117-125)
- `src/components/public/featured-listings.tsx` (if exists from P15) — reference pattern for property card: photo rendering with fallback gradient, rent formatting via `formatINR`, BHK display. If not yet created, reference `convex/listings.ts` enrichment pattern and `lib/money.ts` `formatINR()` directly.
- `lib/money.ts` — `formatINR()` for paise → ₹ display
- `notes/13-constants-reference.md` — Amenities display labels, Furnishing display labels

### Key Rules

1. Create `src/components/tenant/property-card-grid.tsx` — a `"use client"` component:
   - Props: `{ listing: EnrichedListing, isFavorite: boolean, onToggleFavorite: (id: string) => void }`.
   - Define the `EnrichedListing` type inline or import from a shared types file. Fields: `_id`, `slug`, `building_name: string | null`, `society_name: string | null`, `locality: string | null`, `flat_number: string | null`, `rent_monthly: number`, `bhk_config: string`, `furnishing: string`, `carpet_area_sqft: number | undefined` (optional in schema), `available_from: number`, `amenities: string[] | undefined` (optional in schema), `description: string | undefined` (optional in schema), `cover_photo_url: string | null`. **Note**: `amenities`, `carpet_area_sqft`, and `description` are optional in the schema — handle `undefined` in display logic.
   - **Layout**:
     ```
     ┌─────────────────────────┐
     │ [Cover Photo]           │
     │                    ♡    │  ← Favorite toggle (top-right overlay)
     ├─────────────────────────┤
     │ {building_name}, {flat} │
     │ {locality}              │
     │                         │
     │ ₹{rent}/mo  •  {BHK}   │
     │ {Furnishing}            │
     │                         │
     │ 🏊 Pool  🏋 Gym  🅿 Park│  ← Top 3 amenities
     │                         │
     │ [View Details] [WhatsApp]│
     └─────────────────────────┘
     ```
   - Uses shadcn `Card` (`CardContent`, `CardFooter`). Photo area uses `<div>` with `aspect-[4/3]` for consistent aspect ratio. If `cover_photo_url` is null, show a gradient placeholder (`bg-gradient-to-br from-amber-100 to-orange-200`).
   - "View Details" is a `<Link href={/listing/${listing.slug}}>` styled as a shadcn Button `variant="outline"`.
2. Create `src/components/tenant/property-card-list.tsx` — a `"use client"` component:
   - Same props as grid card.
   - **Layout**: horizontal card with photo on left (~200px wide) and details on right.
     ```
     ┌──────────┬──────────────────────────────────────────┐
     │ [Photo]  │ {building}, {flat} — {locality}          │
     │          │ ₹{rent}/mo • {BHK} • {Furnishing}       │
     │          │ {area} sqft • Available {now/date}        │
     │          │ 🏊 Pool  🏋 Gym  🅿 Parking  🔒 Security│
     │          │                                          │
     │          │ [View Details]  [WhatsApp]  ♡             │
     └──────────┴──────────────────────────────────────────┘
     ```
   - Show `carpet_area_sqft` (formatted with comma separator) and availability badge ("Available Now" if `available_from <= Date.now()`, else "Available from {date}").
   - Show more amenity icons than grid (up to 6 instead of 3).
3. **Amenity icons**: Map amenity string to a lucide-react icon. A few key mappings:
   - `gym` → `Dumbbell`, `pool` → `Waves`, `garden` → `TreePine`, `security` → `Shield`, `lift` → `ArrowUpDown`, `power_backup` → `Zap`, `parking` → `ParkingSquare`, `play_area` → `Gamepad2`, `clubhouse` → `Building2`.
   - For others, use a generic `Check` icon. Display the amenity name as a tooltip via shadcn `Tooltip`.
4. **Rent display**: `formatINR(listing.rent_monthly)` appends "/mo". Example: "₹25,000/mo".
5. **BHK display**: Add space before "BHK": `listing.bhk_config.replace("BHK", " BHK")`. Handle "STUDIO" → "Studio", "OTHER" → "Other".
6. **Furnishing display**: Map enum → "Unfurnished" / "Semi-Furnished" / "Fully Furnished".
7. Card entire clickable area (except buttons) navigates to `/listing/${listing.slug}` via `<Link>` wrapper or `onClick` with `router.push`.
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/property-card-grid.tsx` — grid-view property card (photo, title, locality, rent, BHK, furnishing, 3 amenities, view details, WhatsApp, favorite)
- [ ] `src/components/tenant/property-card-list.tsx` — list-view property card (horizontal layout, same data plus carpet area + availability badge, 6 amenities)

### Acceptance Criteria

1. Grid card renders all fields: photo (or gradient placeholder), building + flat, locality, rent (₹ formatted), BHK, furnishing, top 3 amenity icons.
2. List card renders all grid card fields PLUS carpet area and availability badge.
3. Rent displays as "₹25,000/mo" (not raw paise).
4. BHK displays as "2 BHK" (not "2BHK").
5. Furnishing displays human-readable labels.
6. Amenity icons render with tooltip labels.
7. "View Details" links to `/listing/{slug}`.
8. Photo placeholder gradient shows when `cover_photo_url` is null.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on both card files. Inspect a card in the browser — verify photo renders (or gradient placeholder). Verify rent formatting. Verify "View Details" link URL.

### Out of Scope

- Favorite button logic (T03).
- WhatsApp deep link (T03).
- View toggle / pagination (T02).
- Card hover animations (nice-to-have, not required).

---

## T02: View Toggle & Pagination Controls

### Objective

Create `src/components/tenant/view-toggle.tsx` (grid/list toggle buttons with localStorage persistence) and `src/components/tenant/pagination.tsx` (page number buttons + prev/next + result count display). Also create `src/components/tenant/listing-results.tsx` — the orchestrator component that combines cards, view toggle, and pagination into the results area.

### Required Reading

- `notes/features/11-tenant-browse.md` — "Tenant: Toggle View Mode" user story (lines 72-80): grid/list toggle, localStorage preference
- `notes/features/11-tenant-browse.md` — "Tenant: Browse Listings Directory" (lines 22-31): pagination 20 per page, "Load More" or page numbers
- `src/lib/url-state.ts` — `updateSearchParams()` for page URL updates

### Key Rules

1. Create `src/components/tenant/view-toggle.tsx` — a `"use client"` component:
   - Props: `{ view: "grid" | "list", onViewChange: (view: "grid" | "list") => void }`.
   - Two buttons side-by-side: `LayoutGrid` icon for grid, `List` icon for list (lucide-react).
   - Active button has `variant="default"`, inactive has `variant="outline"`.
   - The parent reads/writes `localStorage` under key `demorentals-view-mode` and passes the current value as props.
   - Compact design: `className="flex gap-1"` with small icon buttons.
2. Create `src/components/tenant/pagination.tsx` — a `"use client"` component:
   - Props: `{ page: number, pageSize: number, total: number, hasMore: boolean, onPageChange: (page: number) => void }`.
   - **Display**: "Showing {start}-{end} of {total} listings" text above the controls.
   - **Controls**: Previous button (disabled on page 0), page number buttons (show up to 5 pages with ellipsis for gaps), Next button (disabled when `!hasMore`).
   - Page numbers are 1-indexed for display but 0-indexed internally. `Page 1` = `page: 0`.
   - Use shadcn `Button` with `variant="outline"` for page numbers, `variant="default"` for active page.
   - `onPageChange` is called with the 0-indexed page number; parent updates URL.
3. Create `src/components/tenant/listing-results.tsx` — a `"use client"` component:
   - Props: `{ result: ListPublishedResult | undefined, filters: ListingFilters, onPageChange: (page: number) => void, onClearFilters: () => void }`.
   - Manages `viewMode` state from localStorage:
     ```typescript
     const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
     useEffect(() => {
       const saved = localStorage.getItem("demorentals-view-mode");
       if (saved === "grid" || saved === "list") setViewMode(saved);
     }, []);
     const handleViewChange = (view: "grid" | "list") => {
       setViewMode(view);
       localStorage.setItem("demorentals-view-mode", view);
     };
     ```
   - Manages `favorites` state from localStorage (for passing `isFavorite` to cards):
     ```typescript
     const [favorites, setFavorites] = useState<string[]>([]);
     useEffect(() => {
       const saved = localStorage.getItem("demorentals-favorites");
       if (saved) setFavorites(JSON.parse(saved));
     }, []);
     ```
   - Renders: `<ViewToggle>` + result count in a toolbar row, then `<PropertyCardGrid>` or `<PropertyCardList>` for each listing (based on `viewMode`), then `<Pagination>`.
   - Grid layout: `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">` for grid view. Single column for list view.
4. **Loading state** (when `result === undefined`): show skeleton cards. Grid: 6 skeletons in 3-column grid. List: 3 skeletons in single column. Use `<Skeleton className="h-[300px] rounded-lg" />` for grid, `<Skeleton className="h-[150px] rounded-lg" />` for list.
5. **Empty state** — see T03 for empty state components.
6. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/view-toggle.tsx` — grid/list toggle buttons (controlled via props, parent handles localStorage)
- [ ] `src/components/tenant/pagination.tsx` — page numbers + prev/next + result count (0-indexed internally, 1-indexed display)
- [ ] `src/components/tenant/listing-results.tsx` — orchestrator: manages viewMode + favorites from localStorage, renders toolbar + cards + pagination

### Acceptance Criteria

1. View toggle shows grid and list buttons. Clicking switches view. Preference persists in localStorage across page refreshes.
2. Grid view renders cards in 2-3 column responsive grid. List view renders cards in single column.
3. Pagination shows page numbers, prev/next buttons. Clicking a page updates URL `?page=N`.
4. "Showing X-Y of Z listings" text is correct.
5. Previous is disabled on page 0. Next is disabled when `!hasMore`.
6. Skeleton cards show during loading.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on all three files. Navigate to `/listings`. Toggle between grid and list views — verify layout changes. Refresh page — verify view preference persists. Click the "2" page button (display page 2) — verify URL updates to `?page=1` (0-indexed: display page 2 = `page=1`). Verify skeleton shows on initial load.

### Out of Scope

- "Load More" infinite scroll alternative (V2 — using page numbers for V1).
- Cursor-based pagination (V2).
- Favorite button logic (T03).
- Empty state illustrations (T03).

---

## T03: Favorite Button, WhatsApp Deep Link & States

### Objective

Create `src/components/tenant/favorite-button.tsx` (heart toggle backed by localStorage), add WhatsApp deep links to both card components, and implement all empty/loading/no-results states referenced in the listing results orchestrator.

### Required Reading

- `notes/features/11-tenant-browse.md` — "Tenant: Save Favorite Listings" user story (lines 84-92): heart icon, localStorage in V1
- `notes/features/11-tenant-browse.md` — "Edge Cases" section (lines 159-164): no results, no search results, no published listings
- Verify `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` env var exists in `.env.local` — used for WhatsApp deep links. The system config has `demorentals_whatsapp_phone` but frontend uses the `NEXT_PUBLIC_` env var directly (see `src/components/public/featured-listings.tsx` for existing pattern).
- `src/components/public/featured-listings.tsx` (if exists) — WhatsApp button pattern from P15 homepage. Otherwise, use the `wa.me` deep link pattern directly: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`.

### Key Rules

1. Create `src/components/tenant/favorite-button.tsx` — a `"use client"` component:
   - Props: `{ listingId: string, isFavorite: boolean, onToggle: (listingId: string) => void }`.
   - Renders a `<button>` with a `Heart` icon (lucide-react). Filled (`fill="currentColor"`) when `isFavorite`, outline when not.
   - Active color: `text-red-500`. Inactive color: `text-muted-foreground hover:text-red-400`.
   - Clicking calls `onToggle(listingId)`. The parent (`listing-results.tsx`) manages localStorage:
     ```typescript
     const handleToggleFavorite = (id: string) => {
       setFavorites((prev) => {
         const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
         localStorage.setItem("demorentals-favorites", JSON.stringify(next));
         return next;
       });
     };
     ```
   - Small scale animation on toggle: `transition-transform active:scale-125 duration-150`.
   - Position: absolute top-right corner of the card photo area (grid card) or inline in the card footer (list card).
2. **WhatsApp deep link**: Add to both `property-card-grid.tsx` and `property-card-list.tsx` (modify the card files created in T01):
   - Link: `https://wa.me/${process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`.
   - Message template: `Hi, I'm interested in ${listing.building_name ?? "a property"} ${listing.flat_number ?? ""} at ${listing.locality ?? "your listing"}.`.
   - Render as a shadcn `Button` with `variant="outline"` and `size="sm"`. Icon: `MessageCircle` from lucide-react. Text: "WhatsApp".
   - Opens in new tab: `target="_blank" rel="noopener noreferrer"`.
3. **Empty states** — add to `listing-results.tsx`:
   - **No filters match**: When `result.total === 0` AND at least one filter is active: Show centered illustration area with `SearchX` icon (lucide-react), heading "No listings match your filters", body "Try adjusting your criteria or clearing some filters.", and a "Clear Filters" button that calls `onClearFilters()`.
   - **No search results**: When `result.total === 0` AND `filters.search` is set: Show `Search` icon, heading "No listings found for '{filters.search}'", body "Try a different search term.".
   - **No published listings**: When `result.total === 0` AND no filters active AND no search: Show `Home` icon, heading "New listings coming soon!", body "Check back later for available properties."
   - All empty states use `<div className="flex flex-col items-center justify-center py-16 text-center">` with muted icon colors.
4. **Loading skeleton enhancement**: Ensure skeleton cards in `listing-results.tsx` (from T02) match the approximate dimensions of real cards. Grid skeleton: `h-[340px]` (photo area + content). List skeleton: `h-[160px]`.
5. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/favorite-button.tsx` — heart toggle component (filled/outline, localStorage-backed via parent)
- [ ] `src/components/tenant/property-card-grid.tsx` — **modified**: add WhatsApp deep link button + favorite button positioning
- [ ] `src/components/tenant/property-card-list.tsx` — **modified**: add WhatsApp deep link button + favorite button positioning
- [ ] `src/components/tenant/listing-results.tsx` — **modified**: add empty state rendering (no filters match, no search results, no listings), add `handleToggleFavorite` logic, pass `isFavorite` and `onToggleFavorite` to each card

### Acceptance Criteria

1. Heart icon is filled red when listing is favorited, outline when not. Clicking toggles state.
2. Favorites persist in localStorage under `demorentals-favorites`. Refreshing page preserves favorite state.
3. WhatsApp button opens `wa.me` link in new tab with pre-filled message including building name, flat number, and locality.
4. "No listings match your filters" state shows when filters produce 0 results. "Clear Filters" button works.
5. "No listings found for '{query}'" state shows when search produces 0 results.
6. "New listings coming soon!" state shows when no published listings exist at all.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Navigate to `/listings`. Click the heart on a card — verify it fills red. Refresh — verify it stays red. Click again — verify it unfills. Click WhatsApp button — verify wa.me link opens in new tab with correct message. Apply impossible filters (e.g., rent max ₹100) — verify "No listings match" empty state. Search for gibberish — verify "No listings found" state. Check DevTools localStorage for `demorentals-favorites` key.

### Out of Scope

- Server-side favorites with auth (V2 — localStorage only in V1).
- Favorite counter badge (V2).
- Favorites page at `/favorites` (V2).
- Card hover/click animations (nice-to-have, not required).
- WhatsApp click tracking to `listing_inquiries` table (not in P16 scope — existing `trackWhatsAppClick` mutation is for the listing detail page).

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
