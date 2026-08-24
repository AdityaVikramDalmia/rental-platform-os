# Phase 16: Tenant Browse (P16)

## Overview

The listings directory is the primary tenant discovery surface — where prospective tenants find available rental properties. This phase builds a single page (`/listings`) with full search, filtering, sorting, grid/list view toggle, pagination, and a localStorage-based favorites system. All browsing is public (no auth required). The page lives under the existing `(public)` route group created in P15, reusing its shared header, footer, and `ConvexClientProvider`.

The backend adds two new queries to the existing `convex/listings.ts` module: `listPublished` (collect all PUBLISHED listings, enrich with building/society/photo joins, apply filters + sort + offset pagination) and `getFilterOptions` (derive dynamic filter values from published listing data). At V1 scale (~100s of listings), the collect-and-filter approach is performant and avoids the ~256-result ceiling of Convex search indexes. A shared URL state utility enables shareable filter links (`/listings?bhk=2BHK&sort=price_asc&page=1` — page is 0-indexed, so `page=1` = display page 2).

**V1 Simplifications**:

- Favorites persist in **localStorage** only — no `tenant_profiles` table, no server-side favorites, no auth required for favorites.
- Text search is in-memory after join enrichment — no search index added to the `listings` table.
- Offset-based pagination (not cursor-based) — simpler URL state, supports all sort orders.

## Dependencies

| Dependency                          | What It Provides for P16                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P06-E01 (Listing Creation)**      | Published listings in the `listings` table with status `PUBLISHED`. The `by_status` index on listings. The `listing_photos` table with `by_listing_id` index. The `getListingContext()` helper in `convex/listings.ts` (lines ~140-159) that performs the lead→building→society join. Photo retrieval pattern via `ctx.storage.getUrl`. |
| **P15-E02 (Public Pages Frontend)** | The `(public)` route group with `layout.tsx` (ConvexClientProvider, public header, global footer). The listings page goes inside `src/app/(public)/listings/` and inherits this layout. Also provides the `<PublicHeader>` "Browse Listings" nav link pointing to `/listings`.                                                          |
| **P01-E02 (Schema & Infra)**        | `convex/functions.ts` query wrappers. The `query` import from `./_generated/server` pattern for public (no-auth) queries.                                                                                                                                                                                                               |

## Key Documentation

| Doc                                                     | Section                                                          | Why You Need It                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/features/11-tenant-browse.md`                    | Full file                                                        | THE feature spec — user stories, filter sections, sort options, card wireframes (grid + list), favorites, Convex function signatures, business rules, edge cases                                                                                                                              |
| `notes/10-convex-schema.md`                             | `listings` table (lines ~287-335)                                | Exact field validators: `rent_monthly` (number/paise), `bhk_config` (6 literals), `furnishing` (3 literals), `carpet_area_sqft` (optional number), `available_from` (number/Unix ms), `amenities` array                                                                                       |
| `notes/10-convex-schema.md`                             | `listing_photos` table (lines ~345-350)                          | Photo join: `listing_id`, `storage_id`, `display_order`, `is_deleted`. Cover photo = lowest `display_order` where `is_deleted !== true`.                                                                                                                                                      |
| `notes/13-constants-reference.md`                       | BHK Config (lines ~151-161), Furnishing (lines ~143-149)         | BHK options: 1BHK, 2BHK, 3BHK, 4BHK, STUDIO, OTHER. Furnishing: UNFURNISHED, SEMI_FURNISHED, FULLY_FURNISHED. Listing status: DRAFT, PUBLISHED, ARCHIVED.                                                                                                                                     |
| `notes/13-constants-reference.md`                       | Amenities list (inside `lib/constants.ts` lines ~396-413)        | 16 amenity literals: gym, pool, garden, security, lift, power_backup, clubhouse, parking, play_area, jogging_track, intercom, cctv, fire_safety, water_supply_24x7, gas_pipeline, rain_water_harvesting                                                                                       |
| `notes/02-data-models.md`                               | Section H (Listing, lines ~220+)                                 | Listing entity: joins via `lead_id` to get building/society. Money in paise. Locality = `society.city`.                                                                                                                                                                                       |
| `notes/11-convex-architecture.md`                       | Function Layer Architecture (query pattern)                      | Import `query` from `./_generated/server` for public queries (no auth). `getListingContext()` helper for lead→building→society join.                                                                                                                                                          |
| `convex/listings.ts`                                    | `list` query (lines ~429+) and `getListingContext()` (line ~140) | Reference pattern for listing query: `by_status` index usage, join enrichment via `getListingContext()`. Note: `list` requires auth and does NOT resolve photo URLs — `listPublished` must add photo resolution via `listing_photos` table + `ctx.storage.getUrl()` as a new enrichment step. |
| `src/app/(admin)/admin/payouts/page.tsx`                | URL-synced filter state pattern                                  | Reference for `useSearchParams()` hook + `router.replace()` + `URLSearchParams`. All admin pages use this client-side pattern (NOT server component `searchParams` prop). The listings page should follow the same approach.                                                                  |
| `src/app/(admin)/admin/leads/components/lead-table.tsx` | `usePaginatedQuery` + debounced search pattern                   | Reference for debounced search: `useState` + `useEffect` with 300ms timeout. Shows how to pass filter args to Convex queries.                                                                                                                                                                 |

## ⚠️ Backend Design Decision: Collect-and-Filter (V1)

At V1 scale (~100-200 published listings), the backend uses a **collect-and-filter** approach:

1. **Collect** all PUBLISHED listings via `by_status` index (`.withIndex("by_status", q => q.eq("status", "PUBLISHED")).collect()`)
2. **Pre-filter** on direct listing fields (bhk_config, furnishing, rent range, available_from) — reduces the set before expensive enrichment
3. **Enrich** remaining listings with join data (lead→building→society name/city, cover photo URL)
4. **Post-filter** on joined fields (locality, text search across building_name + society_name + description)
5. **Sort** in-memory (newest, price asc/desc, area desc)
6. **Offset-paginate** (slice by page number + page size)

**Why not cursor-based pagination?** Cursor pagination via `.paginate()` only works with index ordering (`_creationTime` or indexed field). Sorting by price or area requires in-memory sort, which breaks cursor pagination. Offset pagination supports all sort orders and produces clean URLs (`?page=1` for the second page — 0-indexed).

**Why not search index?** Convex search indexes return max ~256 results before pagination, and locality/building name are joined fields (not on the listings table directly). At V1 scale, in-memory text search is simpler and covers all fields.

**Scale ceiling**: This approach handles ~500 listings comfortably. Beyond that, consider adding a denormalized `searchable_text` field to listings (like leads have) and a search index. This is a V2 optimization.

## Epics

| ID      | Title                                                                                        | Tasks | Status | Depends On         |
| ------- | -------------------------------------------------------------------------------------------- | ----- | ------ | ------------------ |
| P16-E01 | [Tenant Browse Backend](P16-E01-tenant-browse-backend.md)                                    | 3     | done   | [P06-E01, P15-E02] |
| P16-E02 | [Listings Page, Search & Filters](P16-E02-listings-page-search-filters.md)                   | 4     | done   | [P16-E01]          |
| P16-E03 | [Property Cards, View Toggle & Pagination](P16-E03-property-cards-view-toggle-pagination.md) | 3     | done   | [P16-E01]          |

**Total: 3 epics, 10 tasks**

## Dependency Graph

```
P06-E01 ──┐
P15-E02 ──┼──► P16-E01 ──┬──► P16-E02
                          │
                          └──► P16-E03
```

**Parallel note**: E02 (Page, Search & Filters) and E03 (Property Cards, View Toggle & Pagination) can run in parallel once E01 (Backend) is complete. E02 builds the page shell with filter/sort controls; E03 builds the card components and pagination. Both consume the same backend queries. The page in E02-T01 imports card components from E03 — if running in parallel, E02-T01 should create stub imports with `// TODO: replace with real component` comments, then E03 replaces them.

## Execution Order

1. **P16-E01**: Tenant Browse Backend — add `listPublished` query (collect-filter-sort-paginate) and `getFilterOptions` query to `convex/listings.ts`, create URL state utility in `src/lib/url-state.ts`.
2. **P16-E02 + P16-E03** _(parallel)_: Listings Page, Search & Filters (page route, search bar, filter sidebar, sort dropdown, active filter chips, URL sync) + Property Cards, View Toggle & Pagination (grid/list card components, view toggle, pagination controls, favorite button, WhatsApp deep link, empty/loading states).

## Completion Criteria

### Backend

- [ ] `listings.listPublished({ search?, bhk_config?, furnishing?, rent_min?, rent_max?, locality?, available_now?, sort?, page?, page_size? })` query exists in `convex/listings.ts` — returns `{ listings: EnrichedListing[], total: number, page: number, page_size: number, has_more: boolean }`. No auth required. Uses `by_status` index for PUBLISHED, enriches with building_name, society_name, locality (city), flat_number, cover_photo_url via lead→building→society→photos joins. Filters on all args. Sorts by `newest` (default), `price_asc`, `price_desc`, `area_desc`. Offset-paginated (default page_size 20).
- [ ] `listings.getFilterOptions()` query exists in `convex/listings.ts` — returns `{ localities: string[], bhk_configs: string[], furnishing_types: string[], price_range: { min: number, max: number }, amenities: string[] }` derived from current PUBLISHED listings. No auth required.
- [ ] `src/lib/url-state.ts` exists — `parseListingFilters(searchParams)` parses URL search params into typed filter object, `serializeListingFilters(filters)` converts filter object to URL search params string, `updateSearchParams(router, currentParams, updates)` merges updates into current URL params without scroll.

### Frontend (Infrastructure)

- [ ] `src/app/(public)/listings/page.tsx` route created — renders inside `(public)` layout (header, footer, ConvexClientProvider inherited). URL is `/listings`.
- [ ] Page layout: search bar top, filter sidebar left (desktop) / Sheet trigger (mobile), sort dropdown + view toggle + active filter chips in toolbar, card grid/list below, pagination at bottom.

### Frontend (Search & Filters)

- [ ] Search bar at top with debounced text input (300ms). Updates URL `?search=...` param. Searches across building name, society name, locality, and description.
- [ ] Filter sidebar: desktop — persistent left panel (~280px wide). Mobile — slide-out Sheet triggered by "Filters" button.
- [ ] Filter sections (each collapsible): Locality (single-select toggle from `getFilterOptions().localities` — V1 simplification, multi-select deferred to V2), Property Type (BHK chips from `getFilterOptions().bhk_configs`), Price Range (min/max inputs in ₹, stored as paise), Furnishing (chips), Available Now (toggle).
- [ ] Sort dropdown: Newest First (default), Price: Low to High, Price: High to Low, Area: Large to Small.
- [ ] Active filters shown as removable chips above results. "Clear All" button resets all filters.
- [ ] All filter/sort/page state stored in URL query params. Changing any filter resets to page 0.

### Frontend (Property Cards & View)

- [ ] Property card grid variant: 2-3 column responsive layout. Each card shows cover photo (placeholder gradient if none), building + flat number, locality, rent (₹ formatted from paise), BHK, furnishing, top 3 amenity icons, favorite heart toggle, WhatsApp deep link.
- [ ] Property card list variant: single-column expanded rows with photo left, details right. Same data as grid plus carpet area and "Available Now" / "Available from {date}" badge.
- [ ] Grid/list view toggle. Preference persisted in `localStorage` under `demorentals-view-mode`.
- [ ] Pagination: page numbers + prev/next buttons. Shows "X of Y listings" count. URL updates to `?page=N`.
- [ ] Favorite button (heart icon): toggles `localStorage` under `demorentals-favorites` (array of listing IDs). Filled heart for saved, outline for unsaved. No auth required in V1.
- [ ] WhatsApp deep link: `https://wa.me/{NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}?text=Hi, I'm interested in {building} {flat} at {locality}`.
- [ ] Card click navigates to `/listing/{slug}` (existing P06 detail page).

### Edge Cases & Empty States

- [ ] No listings match filters: "No listings match your filters. Try adjusting your criteria." with illustration.
- [ ] No search results: "No listings found for '{query}'"
- [ ] No published listings at all: "New listings coming soon! Check back later." (same as P15 homepage).
- [ ] Loading state: skeleton cards (3-6 skeletons in grid layout) while `listPublished` query loads.

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] `/listings` page accessible without authentication (no auth checks)
- [ ] Changed files have clean `lsp_diagnostics`
- [ ] WhatsApp deep links use `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` env var
- [ ] All money displayed in ₹ (converted from paise via `formatINR` from `lib/money.ts`)
- [ ] URL filter state is shareable (copy-paste URL reproduces exact filter/sort/page state)

## Files Created by This Phase

```
convex/
  listings.ts                                       # Modified: add listPublished query, getFilterOptions query

src/lib/
  url-state.ts                                      # New: URL search param parsing/serializing for listing filters

src/app/(public)/listings/
  page.tsx                                          # New: server component shell (metadata + renders ListingsPageClient)
  listings-page-client.tsx                          # New: "use client" component (useSearchParams, useQuery, responsive layout, child assembly)

src/components/tenant/
  search-bar.tsx                                    # New: debounced text search input
  filter-sidebar.tsx                                # New: filter panel (desktop persistent, mobile Sheet)
  filter-section.tsx                                # New: collapsible filter section (reusable)
  sort-dropdown.tsx                                 # New: sort select dropdown
  active-filter-chips.tsx                           # New: removable filter chip bar + "Clear All"
  property-card-grid.tsx                            # New: grid-view property card
  property-card-list.tsx                            # New: list-view property card
  view-toggle.tsx                                   # New: grid/list toggle buttons
  pagination.tsx                                    # New: page number + prev/next pagination
  favorite-button.tsx                               # New: heart toggle (localStorage)
  listing-results.tsx                               # New: orchestrator component (manages query, passes to cards + pagination)
```

## V1 Accepted Deviations

These deviations from the original task spec were accepted during implementation:

| Spec Requirement                            | Actual Implementation                             | Rationale                                                  |
| ------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Components in `src/components/tenant/`      | Components in `src/components/public/listings/`   | Organized by route group, matches `(public)` layout        |
| Separate `url-state.ts` utility             | Logic in `use-listing-filters` hook               | Same behavior, less file overhead                          |
| Separate `getFilterOptions` backend query   | Filter options computed client-side from listings | Sufficient for V1 scale (~500 listings)                    |
| Page number pagination                      | "Load More" button                                | Simpler UX, same functionality                             |
| `listings-page-client.tsx` as separate file | Logic in `listings-directory.tsx` component       | Single orchestrator component instead of page+client split |

## Scope Boundaries

### IN This Phase

- Listings directory page at `/listings` under `(public)` route group
- `listPublished` query (collect-filter-sort-paginate, no auth, enriched with building/society/photo joins)
- `getFilterOptions` query (dynamic filter values from published listings)
- URL state utility for shareable filter links
- Search bar with debounced text search (building name, locality, description)
- Filter sidebar (locality single-select, BHK chips, price range inputs, furnishing chips, availability toggle)
- Sort dropdown (newest, price asc/desc, area desc)
- Active filter chips with "Clear All"
- Property cards (grid + list variants with cover photo, rent, BHK, locality, amenities)
- Grid/list view toggle with localStorage preference
- Offset-based pagination with page numbers
- Favorite button (localStorage only in V1)
- WhatsApp deep link on each card
- Empty/loading/no-results states
- Card click → `/listing/{slug}` (existing detail page)

### NOT In This Phase

- Property detail page → **P17** (cards link to existing P06 detail page via `/listing/{slug}`)
- Tenant inquiry form → **P19**
- Server-side favorites (tenant_profiles table) → **V2** (localStorage in V1)
- Google Sign-In for favorites → **V2** (no auth needed for localStorage favorites)
- Saved searches / search notifications → **V2**
- Search index on listings table → **V2** (in-memory text search at V1 scale)
- Cursor-based pagination → **V2** (offset-based sufficient for V1 scale)
- Amenity filter section → **V2** (amenities shown on cards but not filterable in V1 — filter sidebar covers locality, BHK, price, furnishing, availability only)
- Multi-select locality filter → **V2** (single-select in V1 for simplicity)
- "Relevance" sort option → **V2** (requires search index scoring — only newest/price/area in V1)
- "Verified" badge on cards → **V2** (all published listings are already admin-verified; badge adds no V1 value)
- Map view → **V2**
- Favorites page at `/favorites` → **V2** (favorites are just heart toggles on cards in V1, no separate page)
