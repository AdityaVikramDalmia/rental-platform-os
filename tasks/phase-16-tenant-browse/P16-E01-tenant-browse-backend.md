---
id: P16-E01
title: Tenant Browse Backend
phase: 16
status: pending
depends_on: ["P06-E01", "P15-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-18
---

# P16-E01: Tenant Browse Backend

## Overview

Add two new public queries to the existing `convex/listings.ts` module — `listPublished` (collect all PUBLISHED listings, enrich with building/society/photo join data, apply multi-field filtering + sorting + offset pagination) and `getFilterOptions` (derive dynamic filter choices from current published listings). Also create a shared URL state utility (`src/lib/url-state.ts`) that both frontend epics will use to parse/serialize filter state from URL search params. All queries are fully public — no authentication required.

## Prerequisites

- **Read first**: [P06-E01 Completion Summary](../phase-06-listings/P06-E01-listing-backend.md#completion-summary) — `convex/listings.ts` exists with `getListingContext()` helper (lead→building→society join, lines ~140-159), `list` query (admin listing query with enrichment, lines ~429+), `by_status` index on listings table, photo retrieval via `listing_photos` table with `by_listing_id` index + `ctx.storage.getUrl()`.
- **Read first**: [P15-E02 Completion Summary](../phase-15-public-pages/P15-E02-public-pages-frontend.md#completion-summary) — `src/app/(public)/layout.tsx` exists with ConvexClientProvider. The listings page will live at `src/app/(public)/listings/page.tsx`.
- **Codebase facts to verify before starting**:
  - `convex/listings.ts` exists with exported `list` query (line ~429) — use this as the pattern reference for `listPublished`. Note: `list` requires auth (`requirePermission`); `listPublished` will be a public variant without auth.
  - The `getListingContext()` helper is defined in `convex/listings.ts` (line ~140) — reuse it for enrichment.
  - The `by_status` index exists on the `listings` table: `.index("by_status", ["status"])`.
  - `listing_photos` has `by_listing_id` index and `is_deleted` soft-delete field.
  - `lib/money.ts` exists with `formatINR()` — frontend will use this for display.
  - `lib/constants.ts` exists with BHK_CONFIG, FURNISHING, AMENITIES enum objects.

## Task Queue

- [ ] P16-E01-T01: Add `listPublished` Query
- [ ] P16-E01-T02: Add `getFilterOptions` Query
- [ ] P16-E01-T03: URL State Utility

---

## T01: Add `listPublished` Query

### Objective

Add a `listPublished` query to `convex/listings.ts` that returns filtered, sorted, enriched, and offset-paginated PUBLISHED listings. This is the main data source for the tenant browse page.

### Required Reading

- `notes/features/11-tenant-browse.md` — "Convex Functions" section (lines 130-138): `listings.listPublished({ search?, filters?, sort?, cursor? })` signature
- `notes/10-convex-schema.md` — `listings` table (lines ~287-335): all field validators and 3 indexes
- `notes/10-convex-schema.md` — `listing_photos` table (lines ~345-350): `by_listing_id` index, `is_deleted` filter, `display_order` for cover photo
- `notes/11-convex-architecture.md` — query import pattern for public queries
- `convex/listings.ts` — `list` query (line ~429): reference pattern for `by_status` index usage and join enrichment via `getListingContext()`. Note: `list` requires auth and does NOT resolve photos — `listPublished` must add photo resolution as a new step. Also review `getListingContext()` helper (line ~140) for lead→building→society join.
- Load `convex-api` skill — query API, `.withIndex()`, `.collect()`, `ctx.storage.getUrl()`

### Key Rules

1. **Modify `convex/listings.ts` — do NOT create a new file.** Add `listPublished` as a new export. Place it after the existing `list` query for logical grouping.
2. Import `query` from `./_generated/server` (NOT from `./functions`). This is a public query with no auth check. The existing file already imports `query` — use that same import.
3. **Args** (all optional except pagination defaults):
   ```typescript
   search: v.optional(v.string()),
   bhk_config: v.optional(bhkConfigValidator),
   furnishing: v.optional(furnishingValidator),
   rent_min: v.optional(v.number()),    // paise
   rent_max: v.optional(v.number()),    // paise
   locality: v.optional(v.string()),    // society.city value
   available_now: v.optional(v.boolean()),
   sort: v.optional(v.union(
     v.literal("newest"),
     v.literal("price_asc"),
     v.literal("price_desc"),
     v.literal("area_desc"),
   )),
   page: v.optional(v.number()),        // 0-indexed, default 0
   page_size: v.optional(v.number()),   // default 20
   ```
4. **Step 1 — Collect PUBLISHED**: `await ctx.db.query("listings").withIndex("by_status", (q) => q.eq("status", "PUBLISHED")).collect()`. This uses the existing `by_status` index.
5. **Step 2 — Pre-filter on direct fields** (BEFORE enrichment to reduce join count):
   - `bhk_config`: exact match `listing.bhk_config === args.bhk_config`
   - `furnishing`: exact match `listing.furnishing === args.furnishing`
   - `rent_min`: `listing.rent_monthly >= args.rent_min`
   - `rent_max`: `listing.rent_monthly <= args.rent_max`
   - `available_now`: `listing.available_from <= Date.now()` — **Note**: `Date.now()` in Convex queries is valid but the query won't auto-re-run when a listing becomes available (not a DB dependency). At V1 scale this is acceptable; the query re-runs on any filter change or page navigation anyway.
6. **Step 3 — Enrich** remaining listings with join data. For each listing:
   - Reuse `getListingContext(ctx, listing)` to get `{ lead, building, society }`.
   - Query cover photo: `ctx.db.query("listing_photos").withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id)).filter((q) => q.neq(q.field("is_deleted"), true)).collect()`, sort by `display_order` ascending, take first. If found: `await ctx.storage.getUrl(photo.storage_id)`.
   - Build enriched object: `{ ...listing, building_name: building?.name ?? null, society_name: society?.name ?? null, locality: society?.city ?? null, flat_number: lead?.flat_number ?? null, cover_photo_url: string | null }`.
7. **Step 4 — Post-filter on joined fields**:
   - `locality`: exact match `enriched.locality === args.locality`
   - `search`: case-insensitive substring match across `building_name`, `society_name`, `locality`, `description`. Use `(field ?? "").toLowerCase().includes(searchLower)` — **null/undefined guards are required** since `building_name`, `society_name`, and `locality` are nullable (from joins) and `description` is optional in schema.
8. **Step 5 — Sort** in-memory:
   - `newest` (default): descending by `_creationTime`
   - `price_asc`: ascending by `rent_monthly`
   - `price_desc`: descending by `rent_monthly`
   - `area_desc`: descending by `carpet_area_sqft ?? 0`
9. **Step 6 — Offset paginate**: `const pageSize = args.page_size ?? 20; const page = args.page ?? 0; const start = page * pageSize; const paged = sorted.slice(start, start + pageSize);`
10. **Return shape**: `{ listings: EnrichedListing[], total: number, page: number, page_size: number, has_more: boolean }` where `has_more = start + pageSize < total`.
11. No `as any`, no `@ts-ignore`. No auth check. Fully public.

### Deliverables

- [ ] `convex/listings.ts` — `listPublished` query added (PUBLISHED, collect-filter-enrich-sort-paginate, no auth)

### Acceptance Criteria

1. Query returns only PUBLISHED listings (never DRAFT or ARCHIVED).
2. Each result includes `building_name`, `society_name`, `locality`, `flat_number`, `cover_photo_url` (all nullable).
3. Filters correctly reduce results: BHK, furnishing, rent range, availability, locality, text search all work independently and combined.
4. Sort orders work: newest (default), price asc, price desc, area desc.
5. Pagination returns correct slices: `page=0` returns first 20, `page=1` returns next 20. `total` reflects post-filter count. `has_more` is correct.
6. No authentication required — callable from unauthenticated client components.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/listings.ts`. Confirm `query` is imported from `./_generated/server`. Confirm no implicit `any` on the return type. Confirm `getListingContext` is reused for enrichment. Confirm `by_status` index is used for the initial collect.

### Out of Scope

- Search index on listings table (V2 optimization).
- Cursor-based pagination (V2 — offset is sufficient for V1 scale).
- Amenity filtering (V2 — amenities displayed on cards but not filterable).
- Server-side favorites / tenant_profiles table (V2 — localStorage in V1).
- `getFilterOptions` query (T02).
- URL state utility (T03).

---

## T02: Add `getFilterOptions` Query

### Objective

Add a `getFilterOptions` query to `convex/listings.ts` that returns the set of distinct filter values from currently PUBLISHED listings. The frontend uses this to populate filter controls (locality single-select, BHK chips, price range bounds, furnishing chips).

### Required Reading

- `notes/features/11-tenant-browse.md` — "Convex Functions" section (lines 136-137): `listings.getFilterOptions() → { localities, propertyTypes, priceRange, amenities }`
- `convex/listings.ts` — `listPublished` query (T01): reuses the same `by_status` index and `getListingContext()` pattern for locality derivation. For locality, only the lead→society join is needed (not building).
- Load `convex-api` skill — query API, `.withIndex()`, `.collect()`

### Key Rules

1. **Modify `convex/listings.ts` — add `getFilterOptions` as a new export.** Place it after `listPublished`.
2. Import `query` from `./_generated/server`. No auth check. Fully public.
3. **No args** — this query takes no parameters.
4. **Implementation**:
   ```
   1. Collect all PUBLISHED listings via by_status index
   2. For each listing, get the lead → society for locality (city)
   3. Compute distinct sets:
      - localities: unique non-null society.city values, sorted alphabetically
      - bhk_configs: unique bhk_config values from listings, sorted
      - furnishing_types: unique furnishing values from listings, sorted
      - price_range: { min: lowest rent_monthly, max: highest rent_monthly } (in paise)
      - amenities: unique values from flattened amenities arrays, sorted
   ```
5. **Optimization**: This query iterates all PUBLISHED listings — same as `listPublished`. At V1 scale (~100-200 listings) this is fast. For each listing, only fetch the lead + society (for locality) — do NOT fetch photos or buildings (not needed for filter options).
6. **Return shape**:
   ```typescript
   {
     localities: string[],       // Sorted alphabetically, no duplicates
     bhk_configs: string[],      // Sorted, no duplicates (e.g., ["1BHK", "2BHK", "3BHK"])
     furnishing_types: string[], // Sorted, no duplicates
     price_range: { min: number, max: number }, // In paise. If no listings: { min: 0, max: 0 }
     amenities: string[],        // Sorted, no duplicates
   }
   ```
7. Use `Array.from(new Set(...))` for deduplication. Filter out `null`/`undefined` values before deduplication.
8. No `as any`, no `@ts-ignore`. No auth check.

### Deliverables

- [ ] `convex/listings.ts` — `getFilterOptions` query added (PUBLISHED listings only, derives distinct filter values, no auth)

### Acceptance Criteria

1. Returns non-empty arrays when PUBLISHED listings exist.
2. Localities are derived from `society.city` (not from listing fields directly).
3. BHK configs and furnishing types are taken directly from listing fields.
4. Price range reflects actual min/max `rent_monthly` values (in paise).
5. Amenities are flattened from all listings' `amenities` arrays with duplicates removed.
6. All arrays are sorted alphabetically.
7. Returns `{ localities: [], bhk_configs: [], furnishing_types: [], price_range: { min: 0, max: 0 }, amenities: [] }` when no PUBLISHED listings exist.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/listings.ts`. Confirm the query has no args validator (just `args: {}`). Confirm no auth check. Confirm return type includes all 5 fields.

### Out of Scope

- Caching/memoization (Convex queries are automatically reactive — no manual caching needed).
- Floor count, pet-friendly, or parking filter options (not in V1 filter spec).
- `listPublished` query (T01).
- URL state utility (T03).

---

## T03: URL State Utility

### Objective

Create `src/lib/url-state.ts` — a set of typed utility functions for parsing listing filter/sort/page state from URL search params and serializing it back. This enables shareable filter links and is consumed by both E02 (filter components) and E03 (pagination).

### Required Reading

- `src/app/(admin)/admin/payouts/page.tsx` — reference pattern for URL search params: `searchParams.get()`, `router.replace()` with `URLSearchParams`, `useCallback` for `updateFilters` (lines ~40-60)
- `notes/features/11-tenant-browse.md` — filter sections (lines 48-60): defines which filters exist
- `lib/constants.ts` — BHK_CONFIG, FURNISHING enum values for type validation

### Key Rules

1. Create `src/lib/url-state.ts` as a **new file**. This is shared infrastructure, not a component.
2. **Define the `ListingFilters` type**:
   ```typescript
   export type ListingFilters = {
     search: string | undefined;
     bhk_config: string | undefined; // BHK literal or undefined
     furnishing: string | undefined; // Furnishing literal or undefined
     rent_min: number | undefined; // paise
     rent_max: number | undefined; // paise
     locality: string | undefined;
     available_now: boolean;
     sort: "newest" | "price_asc" | "price_desc" | "area_desc";
     page: number; // 0-indexed
   };
   ```
3. **`parseListingFilters(searchParams: URLSearchParams): ListingFilters`** — parse each param with safe defaults. **URL param key → ListingFilters field mapping** (URL keys are short for clean URLs):
   - `search` → `search`: `searchParams.get("search")?.trim() || undefined`
   - `bhk` → `bhk_config`: `searchParams.get("bhk")`, validate against known BHK values, undefined if invalid
   - `furnishing` → `furnishing`: `searchParams.get("furnishing")`, validate against known values, undefined if invalid
   - `rent_min` / `rent_max` → `rent_min` / `rent_max`: `parseInt`, convert from ₹ display value to paise (`* 100`), undefined if NaN. **Important**: URL params store **₹ values** (user-friendly for shareable links like `?rent_min=10000`), but the Convex query expects **paise**. Parser multiplies by 100; serializer divides by 100.
   - `locality` → `locality`: string or undefined
   - `available_now` → `available_now`: `searchParams.get("available_now") === "true"`, default `false`
   - `sort` → `sort`: validate against 4 sort literals, default `"newest"`
   - `page` → `page`: `parseInt`, default `0`, clamp to `>= 0`. URL is **0-indexed** (display adds +1).
4. **`serializeListingFilters(filters: Partial<ListingFilters>): URLSearchParams`** — only include non-default, non-undefined values:
   - Omit `search` if undefined/empty, `page` if 0, `sort` if "newest", `available_now` if false.
   - Convert `rent_min`/`rent_max` from paise back to ₹ (`/ 100`) for URL display.
5. **`updateSearchParams(router: ReturnType<typeof useRouter>, currentParams: URLSearchParams, updates: Record<string, string | undefined>): void`** — merge updates into current params, delete keys with `undefined` value, call `router.replace(\`/listings?\${params.toString()}\`, { scroll: false })`. **Always reset page to 0** when any filter (not page) changes — pass this as a convention in the JSDoc. The router parameter type is ReturnType of the useRouter hook from next/navigation. Do NOT use AppRouterInstance as a direct import — it is not a public named export in current Next.js typings.
6. Export all three functions + the `ListingFilters` type.
7. No `as any`, no `@ts-ignore`. All imports typed.

### Deliverables

- [ ] `src/lib/url-state.ts` — `ListingFilters` type, `parseListingFilters()`, `serializeListingFilters()`, `updateSearchParams()` functions

### Acceptance Criteria

1. `parseListingFilters(new URLSearchParams("bhk=2BHK&sort=price_asc&page=1"))` returns `{ bhk_config: "2BHK", sort: "price_asc", page: 1, ... }` with correct defaults for missing params.
2. `serializeListingFilters({ bhk_config: "2BHK", sort: "price_asc" })` returns `URLSearchParams` with `bhk=2BHK&sort=price_asc` (no `page=0`, no `sort=newest`).
3. Price params use ₹ in URLs, paise in the parsed object.
4. Invalid enum values fall back to defaults (not crash).
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/lib/url-state.ts`. Confirm all exports are typed. Confirm no implicit `any`.

### Out of Scope

- Multi-select locality filter state (V1 uses single locality select — the type is `string | undefined`, not `string[]`). If multi-select is needed, update the type to `string[]` and serialize as comma-separated.
- Saved search persistence (V2).
- Frontend components that use these utilities (E02, E03).

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
