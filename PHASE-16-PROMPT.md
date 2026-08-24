# Phase 16 Implementation Prompt: Tenant Browse — Listings Directory

> **FIRST STEP**: Read `AGENTS.md` in the project root. It contains the full project context — tech stack, personas, conventions, dev environment, routing rules, test accounts, and file structure. Do this before any other work.
>
> This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`. Load skills via `load_skills=["skill-name"]`.

---

## Scope

**Deliver**: A fully functional listings directory at `/listings` where tenants can browse, search, filter, sort, and paginate all published rental listings. Favorites persist in localStorage. View mode (grid/list) persists in localStorage. All filter state is URL-driven for shareable links.

**Replace**: The existing placeholder page at `src/app/(public)/listings/page.tsx` (currently shows "coming soon").

**Does NOT include** (out of scope — do NOT implement):

- Property detail page (Phase 17)
- Tenant inquiry form / visit request (Phase 19)
- Saved searches or notifications (V2)
- `tenant_profiles` database table (not needed for V1 localStorage favorites)
- Server-side full-text search index (V1 uses client-side search)
- Authentication requirement for favorites (V1 uses localStorage, no auth)

---

## V1 Simplifications (IMPORTANT — Read Before Implementing)

The feature spec (`notes/features/11-tenant-browse.md`) describes the full vision. For V1, we simplify:

| Feature            | Spec Says                                         | V1 Implementation                                                                                     |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Favorites**      | Requires Google Sign-In + `tenant_profiles` table | **localStorage only** — no auth, no DB table                                                          |
| **Search**         | Convex search index on listings                   | **Client-side filter** — `.includes()` on society_name, building_name, city, description              |
| **Pagination**     | Server-side cursor pagination                     | **Client-side virtual pagination** — fetch ALL published listings, show 20 at a time with "Load More" |
| **Filter options** | Separate `getFilterOptions()` query               | **Derived from fetched data** — no separate query needed                                              |
| **Localities**     | Multi-select from listing data                    | **Society name as locality** — use `society_name` field                                               |
| **Favorites page** | Dedicated `/favorites` route                      | **Not in V1** — just the heart toggle on cards. Page deferred.                                        |

**Why client-side filtering works for V1**: With <500 published listings (realistic for V1 launch), fetching all and filtering client-side is faster, simpler, and gives us real-time updates via Convex subscription. When we scale past 500, we add server-side filtering as a performance optimization.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ Convex Backend                                       │
│                                                      │
│  listings.listPublished() → PublishedListing[]       │
│  (no auth, PUBLISHED only, enriched with building/   │
│   society/city/flat_number/first_photo_url)           │
│  Safety cap: .take(500)                              │
└─────────────────────┬───────────────────────────────┘
                      │ useQuery (real-time subscription)
┌─────────────────────▼───────────────────────────────┐
│ Client: ListingsDirectory                            │
│                                                      │
│  URL State ←→ useListingFilters() hook               │
│  localStorage ←→ useFavorites() hook                 │
│  localStorage ←→ useViewMode() hook                  │
│                                                      │
│  Raw listings → filter → sort → paginate → render    │
│                                                      │
│  ┌─────────┐ ┌──────────┐ ┌──────┐ ┌─────────────┐ │
│  │ Search  │ │  Sort    │ │ View │ │ Result Count│ │
│  │ Bar     │ │ Dropdown │ │Toggle│ │             │ │
│  └─────────┘ └──────────┘ └──────┘ └─────────────┘ │
│  ┌──────────────┐ ┌──────────────────────────────┐  │
│  │ Active       │ │ [Clear All]                  │  │
│  │ Filter Chips │ │                              │  │
│  └──────────────┘ └──────────────────────────────┘  │
│  ┌────────────┐ ┌────────────────────────────────┐  │
│  │ Filter     │ │ PropertyCard grid / list       │  │
│  │ Sidebar    │ │ + Load More button             │  │
│  │ (desktop)  │ │ + Empty state                  │  │
│  │ Sheet      │ │ + Skeleton loading             │  │
│  │ (mobile)   │ │                                │  │
│  └────────────┘ └────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Existing Patterns to Follow (File References)

Read these files to understand existing conventions before implementing:

| Pattern                         | Reference File                                          | What to Copy                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Convex public query**         | `convex/listings.ts` line 823 (`listFeatured`)          | No auth check, `.withIndex("by_status")`, enrichment with building/society/photo                                                                                                                        |
| **Listing card component**      | `src/components/public/featured-listings.tsx`           | Card structure, photo placeholder, BHK badge, rent formatting, MapPin icon                                                                                                                              |
| **URL-driven filters**          | `src/app/(admin)/admin/leads/page.tsx`                  | `useSearchParams()` + `router.replace()` + parse/validate params                                                                                                                                        |
| **Paginated query + Load More** | `src/app/(admin)/admin/leads/components/lead-table.tsx` | `usePaginatedQuery`, status check, Load More button                                                                                                                                                     |
| **Debounced search**            | `src/app/(admin)/admin/leads/page.tsx`                  | 300ms debounce with `setTimeout` + cleanup                                                                                                                                                              |
| **Select dropdowns (shadcn)**   | `src/app/(admin)/admin/leads/page.tsx`                  | `<Select>` with `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>`                                                                                                                                  |
| **Sheet (mobile panel)**        | `src/components/public/header.tsx`                      | `<Sheet>` + `<SheetTrigger>` + `<SheetContent>` for mobile navigation                                                                                                                                   |
| **WhatsApp deep link**          | `src/app/listing/[slug]/components/whatsapp-button.tsx` | `wa.me/{phone}?text={message}` pattern with `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE`                                                                                                                        |
| **Money formatting**            | `lib/money.ts` (`formatINR`)                            | Always convert from paise: `formatINR(rent_monthly)`                                                                                                                                                    |
| **localStorage pattern**        | `src/app/(guard)/guard-layout-client.tsx`               | Direct `localStorage.setItem/getItem`, `typeof window` guard                                                                                                                                            |
| **Public layout**               | `src/app/(public)/layout.tsx`                           | Header + Footer wrapper, `max-w-7xl`, metadata template                                                                                                                                                 |
| **Constants**                   | `lib/constants.ts`                                      | `BHK_CONFIG`, `FURNISHING`, `PARKING`, `LISTING_STATUS`                                                                                                                                                 |
| **Amenity values**              | `convex/schema.ts` line 80-97                           | 17 amenity literals: gym, pool, garden, security, lift, power_backup, clubhouse, parking, play_area, jogging_track, intercom, cctv, fire_safety, water_supply_24x7, gas_pipeline, rain_water_harvesting |

---

## Implementation Order

Execute in this exact order. Each step builds on the previous.

---

### Step 1: Install Dependencies

```bash
npx shadcn@latest add slider toggle-group
```

**Components needed that are NOT yet installed:**

- `Slider` — for price range filter (min/max)
- `ToggleGroup` — for grid/list view toggle

**Already installed (do NOT reinstall):**

- Accordion, Badge, Button, Card, Checkbox, Input, Select, Sheet, Skeleton, Separator — all exist in `src/components/ui/`

**Verify:** Check `src/components/ui/slider.tsx` and `src/components/ui/toggle-group.tsx` exist after install.

---

### Step 2: Backend — New Convex Query `listPublished`

**File:** `convex/listings.ts` — Add a new exported query at the end of the file (before the closing, after `listFeatured`).

**Query: `listPublished`**

```typescript
export const listPublished = query({
  args: {},
  handler: async (ctx, args) => {
    // NO auth check — this is a public query

    const listings = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", LISTING_STATUS.PUBLISHED))
      .order("desc")
      .take(500); // Safety cap for V1

    const enriched = await Promise.all(
      listings.map(async (listing) => {
        const lead = await ctx.db.get(listing.lead_id);
        const building = lead?.building_id ? await ctx.db.get(lead.building_id) : null;
        const society = building?.society_id ? await ctx.db.get(building.society_id) : null;

        // Get cover photo (lowest display_order)
        const photos = await ctx.db
          .query("listing_photos")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .collect();

        const sortedPhotos = photos.sort((a, b) => a.display_order - b.display_order);
        const firstPhotoUrl = sortedPhotos[0]?.storage_id
          ? await ctx.storage.getUrl(sortedPhotos[0].storage_id)
          : null;

        return {
          _id: listing._id,
          slug: listing.slug,
          bhk_config: listing.bhk_config,
          rent_monthly: listing.rent_monthly,
          deposit: listing.deposit,
          maintenance: listing.maintenance,
          furnishing: listing.furnishing,
          floor_number: listing.floor_number,
          carpet_area_sqft: listing.carpet_area_sqft,
          available_from: listing.available_from,
          description: listing.description,
          parking: listing.parking,
          pet_friendly: listing.pet_friendly,
          amenities: listing.amenities,
          // Enriched from related tables
          flat_number: lead?.flat_number ?? null,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
          city: society?.city ?? null,
          first_photo_url: firstPhotoUrl,
          _creationTime: listing._creationTime,
        };
      }),
    );

    return enriched;
  },
});
```

**Key points:**

- NO `requirePermission` — this is public
- Follow the exact enrichment pattern from `listFeatured` (line 823)
- Include ALL listing fields needed for cards + filtering (bhk_config, furnishing, amenities, carpet_area_sqft, available_from, parking, etc.)
- Include `flat_number` from the lead (needed for card title: "Tower A, Fl 12, #1201")
- `.take(500)` safety cap — prevents unbounded reads
- `.order("desc")` — newest first by default (matches spec)

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 3: Custom Hooks

Create three custom hooks. Place them in `src/lib/hooks/`.

#### 3a: `src/lib/hooks/use-listing-filters.ts`

URL-driven filter state. Reads from `useSearchParams()`, writes via `router.replace()`.

**URL param schema:**

```
?search=hiranandani          # text search
&bhk=2BHK,3BHK              # comma-separated BHK values
&furnishing=SEMI_FURNISHED   # comma-separated furnishing values
&price_min=1500000           # min rent in paise
&price_max=3000000           # max rent in paise
&amenities=gym,pool          # comma-separated amenities
&available_now=true          # boolean toggle
&locality=Maplewood,Powai  # comma-separated society names
&sort=price_asc              # sort key
&page=1                      # virtual page number (for "Load More" state)
```

**Hook interface:**

```typescript
type SortOption = "newest" | "price_asc" | "price_desc" | "area_desc";

type ListingFilters = {
  search: string;
  bhk: string[]; // e.g. ["2BHK", "3BHK"]
  furnishing: string[]; // e.g. ["SEMI_FURNISHED"]
  priceMin: number | null; // paise
  priceMax: number | null; // paise
  amenities: string[]; // e.g. ["gym", "pool"]
  availableNow: boolean;
  locality: string[]; // society names
  sort: SortOption;
};

type UseListingFiltersReturn = {
  filters: ListingFilters;
  setFilter: (key: keyof ListingFilters, value: unknown) => void;
  toggleArrayFilter: (key: "bhk" | "furnishing" | "amenities" | "locality", value: string) => void;
  clearAll: () => void;
  activeFilterCount: number;
};
```

**Implementation rules:**

- Parse all values from `useSearchParams()` on mount and on URL change
- Validate parsed values against known constants (e.g., BHK values against `BHK_CONFIG` keys)
- When updating, use `router.replace()` with `{ scroll: false }` — NOT `router.push()`
- Remove params with empty/default values (don't pollute URL with `&bhk=&furnishing=`)
- `activeFilterCount` excludes `sort` and `search` — only counts filter params that narrow results
- Debounce search updates by 300ms (only search, not other filters)
- Default sort: `"newest"`

**Pattern reference:** See `src/app/(admin)/admin/leads/page.tsx` for `useSearchParams` + `router.replace()` pattern.

#### 3b: `src/lib/hooks/use-favorites.ts`

localStorage-based favorites with cross-tab sync.

**Hook interface:**

```typescript
type UseFavoritesReturn = {
  favorites: Set<string>; // Set of listing _id strings
  toggleFavorite: (listingId: string) => void;
  isFavorite: (listingId: string) => boolean;
  favoritesCount: number;
};
```

**Implementation rules:**

- localStorage key: `"demorentals-favorites"` — stores JSON array of listing ID strings
- Guard with `typeof window !== "undefined"` before any localStorage access
- Initialize from localStorage on mount (inside `useEffect`)
- Use `useState<Set<string>>` for reactive state
- On toggle: update Set → serialize to JSON → write to localStorage
- Listen to `window.addEventListener("storage", ...)` for cross-tab sync
- Clean up listener on unmount
- Do NOT add any auth checks — V1 favorites are anonymous

#### 3c: `src/lib/hooks/use-view-mode.ts`

localStorage-based view preference (grid vs list).

**Hook interface:**

```typescript
type ViewMode = "grid" | "list";

type UseViewModeReturn = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
};
```

**Implementation rules:**

- localStorage key: `"demorentals-view-mode"` — stores `"grid"` or `"list"`
- Default: `"grid"`
- Guard with `typeof window !== "undefined"`
- Initialize from localStorage in `useEffect` (avoid hydration mismatch — default to "grid" in SSR)

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 4: Listings Page + Main Component

#### 4a: Replace `src/app/(public)/listings/page.tsx`

This stays as a **server component** for SEO metadata. It renders the client component.

```typescript
import type { Metadata } from "next";
import { ListingsDirectory } from "@/components/public/listings/listings-directory";

export const metadata: Metadata = {
  title: "Browse Listings",
  description:
    "Browse verified rental listings in Bengaluru. Filter by locality, budget, and property type.",
  openGraph: {
    title: "Browse Listings - DemoRentals",
    description:
      "Browse verified rental listings in Bengaluru. Filter by locality, budget, and property type.",
    type: "website",
  },
};

export default function ListingsPage() {
  return <ListingsDirectory />;
}
```

**Important:** The `(public)` layout already provides `<PublicHeader />` and `<PublicFooter />`. The listings page inherits them. Do NOT re-add header/footer.

#### 4b: Create `src/components/public/listings/listings-directory.tsx`

This is the **main client component** that orchestrates everything.

```typescript
"use client";
```

**Responsibilities:**

1. Fetch all published listings via `useQuery(api.listings.listPublished, {})`
2. Apply filters from `useListingFilters()` hook
3. Apply sort
4. Virtual pagination (show `page * ITEMS_PER_PAGE` items)
5. Render: search bar, sort dropdown, view toggle, result count, active filter chips, filter sidebar, property cards grid/list, Load More button, empty state, loading skeletons

**Constants:**

```typescript
const ITEMS_PER_PAGE = 20;
```

**Filter logic (client-side):**

```typescript
function applyFilters(listings: PublishedListing[], filters: ListingFilters): PublishedListing[] {
  return listings.filter((listing) => {
    // Search: case-insensitive includes across multiple fields
    if (filters.search) {
      const query = filters.search.toLowerCase();
      const searchableText = [
        listing.society_name,
        listing.building_name,
        listing.city,
        listing.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchableText.includes(query)) return false;
    }

    // BHK: OR within group
    if (filters.bhk.length > 0 && !filters.bhk.includes(listing.bhk_config)) return false;

    // Furnishing: OR within group
    if (filters.furnishing.length > 0 && !filters.furnishing.includes(listing.furnishing))
      return false;

    // Price range (paise)
    if (filters.priceMin !== null && listing.rent_monthly < filters.priceMin) return false;
    if (filters.priceMax !== null && listing.rent_monthly > filters.priceMax) return false;

    // Amenities: AND — must have ALL selected
    if (filters.amenities.length > 0) {
      const listingAmenities = new Set(listing.amenities ?? []);
      if (!filters.amenities.every((a) => listingAmenities.has(a))) return false;
    }

    // Available now
    if (filters.availableNow && listing.available_from > Date.now()) return false;

    // Locality: OR within group
    if (filters.locality.length > 0 && !filters.locality.includes(listing.society_name ?? ""))
      return false;

    return true;
  });
}
```

**Sort logic:**

```typescript
function applySortOrder(listings: PublishedListing[], sort: SortOption): PublishedListing[] {
  const sorted = [...listings];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => b._creationTime - a._creationTime);
    case "price_asc":
      return sorted.sort((a, b) => a.rent_monthly - b.rent_monthly);
    case "price_desc":
      return sorted.sort((a, b) => b.rent_monthly - a.rent_monthly);
    case "area_desc":
      return sorted.sort((a, b) => (b.carpet_area_sqft ?? 0) - (a.carpet_area_sqft ?? 0));
    default:
      return sorted;
  }
}
```

**Virtual pagination:**

```typescript
const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

const filtered = applyFilters(allListings, filters);
const sorted = applySortOrder(filtered, filters.sort);
const visible = sorted.slice(0, visibleCount);
const hasMore = visibleCount < sorted.length;

// Reset visible count when filters change
useEffect(() => {
  setVisibleCount(ITEMS_PER_PAGE);
}, [filters]);
```

**Derive filter options from data (no separate query):**

```typescript
const filterOptions = useMemo(() => {
  if (!allListings) return null;

  const localities = [...new Set(allListings.map((l) => l.society_name).filter(Boolean))].sort();
  const bhkConfigs = [...new Set(allListings.map((l) => l.bhk_config))].sort();
  const furnishingTypes = [...new Set(allListings.map((l) => l.furnishing))];
  const allAmenities = [...new Set(allListings.flatMap((l) => l.amenities ?? []))].sort();
  const prices = allListings.map((l) => l.rent_monthly);
  const priceMin = prices.length > 0 ? Math.min(...prices) : 0;
  const priceMax = prices.length > 0 ? Math.max(...prices) : 10000000; // 1 lakh default

  return { localities, bhkConfigs, furnishingTypes, allAmenities, priceMin, priceMax };
}, [allListings]);
```

**Layout structure:**

```
<div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
  {/* Page header */}
  <h1>Browse Listings</h1>
  <p>subtitle</p>

  {/* Controls bar: Search + Sort + View Toggle + Result Count */}
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <SearchBar />
    <div className="flex items-center gap-2">
      <SortDropdown />
      <ViewToggle />
    </div>
  </div>

  {/* Active filter chips */}
  <ActiveFilterChips />

  {/* Main content: Sidebar + Listings */}
  <div className="flex gap-6">
    {/* Desktop sidebar — hidden on mobile */}
    <aside className="hidden w-64 shrink-0 lg:block">
      <FilterSidebar />
    </aside>

    {/* Mobile filter button — visible on mobile only */}
    <Sheet> ... FilterSidebar inside SheetContent ... </Sheet>

    {/* Listings grid/list */}
    <div className="flex-1">
      {/* Result count */}
      <p>{filtered.length} listings found</p>

      {/* Grid or List */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((listing) => <PropertyCard key={listing._id} />)}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((listing) => <PropertyListItem key={listing._id} />)}
        </div>
      )}

      {/* Load More */}
      {hasMore && <Button onClick={() => setVisibleCount((c) => c + ITEMS_PER_PAGE)}>Load More</Button>}

      {/* Empty state */}
      {filtered.length === 0 && <EmptyState />}
    </div>
  </div>
</div>
```

---

### Step 5: Property Cards (Grid + List Variants)

#### 5a: `src/components/public/listings/property-card.tsx` (Grid View)

Follow the wireframe from the spec:

```
┌─────────────────────────┐
│ [Cover Photo]           │
│                    ♡    │  ← Favorite toggle (top-right overlay)
├─────────────────────────┤
│ Tower A, Fl 12, #1201   │  ← building_name, floor_number, flat_number
│ Maplewood, Thane       │  ← society_name, city
│                         │
│ ₹25,000/mo  •  2BHK    │  ← formatINR(rent_monthly), bhk_config
│ Semi-Furnished           │  ← furnishing (human-readable label)
│                         │
│ 🏊 Pool  🏋 Gym  🅿 Park│  ← Top 3 amenities (icons)
│                         │
│ [View Details] [WhatsApp]│
└─────────────────────────┘
```

**Props:**

```typescript
type PropertyCardProps = {
  listing: PublishedListing;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
};
```

**Rules:**

- Use `<Card>` from shadcn/ui (same as `featured-listings.tsx`)
- Cover photo: `<img>` with `loading="lazy"`, same photo placeholder pattern as `featured-listings.tsx` (`ImageOff` icon)
- Favorite button: positioned absolute top-right over photo, `<Heart>` icon from lucide-react, filled when favorited (`fill="currentColor"` + `text-red-500` when active, `text-white` when inactive with drop shadow for visibility)
- Title: `{building_name ?? "Building"}, Fl {floor_number}{flat_number ? `, #${flat_number}` : ""}`
- Locality: `<MapPin>` icon + `{society_name}, {city}`
- Rent: `formatINR(rent_monthly)/mo` from `lib/money.ts` — **always paise input**
- BHK badge: `<Badge variant="secondary" className="bg-blue-50 text-blue-700">{bhk_config}</Badge>`
- Furnishing: human-readable label (map `SEMI_FURNISHED` → `"Semi-Furnished"`, `FULLY_FURNISHED` → `"Fully Furnished"`, `UNFURNISHED` → `"Unfurnished"`)
- Amenities: show top 3 with icons. Map amenity keys to icons from lucide-react. If >3, show "+N more"
- "View Details" link: `<Link href={/listing/${listing.slug}}>` — styled as text link (blue)
- WhatsApp button: Use existing pattern from `src/app/listing/[slug]/components/whatsapp-button.tsx`. Phone from `process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE`. Message includes listing details.
- **NEVER expose owner information** (name, phone) on cards

**Amenity icon mapping** (create a utility, e.g., `src/lib/amenity-icons.ts`):

```typescript
import {
  Dumbbell,
  Waves,
  TreePine,
  ShieldCheck,
  Building2,
  Zap,
  Users,
  Car,
  Baby,
  Footprints,
  Phone,
  Camera,
  Flame,
  Droplets,
  FlameKindling,
  CloudRain,
} from "lucide-react";

const AMENITY_ICONS: Record<string, LucideIcon> = {
  gym: Dumbbell,
  pool: Waves,
  garden: TreePine,
  security: ShieldCheck,
  lift: Building2,
  power_backup: Zap,
  clubhouse: Users,
  parking: Car,
  play_area: Baby,
  jogging_track: Footprints,
  intercom: Phone,
  cctv: Camera,
  fire_safety: Flame,
  water_supply_24x7: Droplets,
  gas_pipeline: FlameKindling,
  rain_water_harvesting: CloudRain,
};

const AMENITY_LABELS: Record<string, string> = {
  gym: "Gym",
  pool: "Pool",
  garden: "Garden",
  security: "Security",
  lift: "Lift",
  power_backup: "Power Backup",
  clubhouse: "Clubhouse",
  parking: "Parking",
  play_area: "Play Area",
  jogging_track: "Jogging Track",
  intercom: "Intercom",
  cctv: "CCTV",
  fire_safety: "Fire Safety",
  water_supply_24x7: "24/7 Water",
  gas_pipeline: "Gas Pipeline",
  rain_water_harvesting: "Rainwater Harvesting",
};
```

#### 5b: `src/components/public/listings/property-list-item.tsx` (List View)

Follow the wireframe from the spec:

```
┌──────────┬──────────────────────────────────────────┐
│ [Photo]  │ Tower A, Fl 12, #1201 — Maplewood      │
│          │ ₹25,000/mo • 2BHK • Semi-Furnished        │
│          │ 1,050 sqft • Available Now                 │
│          │ 🏊 Pool  🏋 Gym  🅿 Parking  🔒 Security │
│          │                                           │
│          │ [View Details]  [WhatsApp]  ♡              │
└──────────┴──────────────────────────────────────────┘
```

**Same props as PropertyCard.** Additional data shown:

- `carpet_area_sqft` formatted with comma separator + "sqft" suffix (show only if defined)
- Availability: "Available Now" if `available_from <= Date.now()`, else format date
- More amenities visible (show up to 6, "+N more" if >6)
- Photo is smaller (fixed width, e.g., `w-48 h-36`)
- On mobile (`<sm`), collapse to card-like layout (stack vertically)

---

### Step 6: Filter Sidebar

**File:** `src/components/public/listings/filter-sidebar.tsx`

**Desktop:** Rendered in `<aside>` as a persistent column (always visible on `lg:` breakpoint).
**Mobile:** Rendered inside `<Sheet>` triggered by a filter button (visible on `<lg` breakpoint).

**Filter sections (each collapsible with `<Accordion>`)**:

1. **Locality** — Multi-select checkboxes
   - Derived from `filterOptions.localities`
   - Each: `<Checkbox>` + label
   - Shows count of listings per locality in parentheses (optional)

2. **Property Type (BHK)** — Chip selection
   - Values: `1BHK`, `2BHK`, `3BHK`, `4BHK`, `STUDIO`, `OTHER` (from `BHK_CONFIG`)
   - Use `<Badge>` or small `<Button variant="outline">` as toggleable chips
   - Active: `bg-blue-700 text-white`, Inactive: `border-slate-200 bg-white text-slate-700`

3. **Price Range** — Dual slider
   - `<Slider>` from shadcn with two thumbs (min/max)
   - Show current values as `formatINR(value)` labels above slider
   - Range: derived from `filterOptions.priceMin` to `filterOptions.priceMax`
   - Step: ₹1,000 (100000 paise)
   - Below slider, show two `<Input type="number">` for manual entry (optional, nice-to-have)

4. **Furnishing** — Chip selection
   - Values: `Unfurnished`, `Semi-Furnished`, `Fully Furnished` (from `FURNISHING`)
   - Same chip pattern as BHK

5. **Amenities** — Multi-select checkboxes
   - Derived from `filterOptions.allAmenities`
   - Show icon + label for each
   - If >8 amenities, show first 8 with "Show more" toggle

6. **Availability** — Toggle
   - Single `<Checkbox>` or `<Switch>`: "Available Now"
   - Filters to listings where `available_from <= Date.now()`

**Bottom of sidebar:**

- "Clear All Filters" button — resets all filters, calls `clearAll()` from hook

**Mobile trigger button:**

```typescript
<Button variant="outline" className="lg:hidden" onClick={() => setSheetOpen(true)}>
  <SlidersHorizontal className="mr-2 size-4" />
  Filters
  {activeFilterCount > 0 && (
    <Badge className="ml-2 bg-blue-700 text-white">{activeFilterCount}</Badge>
  )}
</Button>
```

---

### Step 7: Sort Dropdown + View Toggle + Search Bar

#### 7a: `src/components/public/listings/sort-dropdown.tsx`

shadcn `<Select>` with sort options:

| Label                | Value        | Logic                                |
| -------------------- | ------------ | ------------------------------------ |
| Newest First         | `newest`     | `_creationTime` DESC                 |
| Price: Low to High   | `price_asc`  | `rent_monthly` ASC                   |
| Price: High to Low   | `price_desc` | `rent_monthly` DESC                  |
| Area: Large to Small | `area_desc`  | `carpet_area_sqft` DESC (nulls last) |

Default: `newest`

#### 7b: `src/components/public/listings/view-toggle.tsx`

shadcn `<ToggleGroup type="single">` with two items:

- Grid icon (`<LayoutGrid>` from lucide-react) — value `"grid"`
- List icon (`<List>` from lucide-react) — value `"list"`

Reads/writes from `useViewMode()` hook.

#### 7c: `src/components/public/listings/search-bar.tsx`

- `<Input>` with `<Search>` icon prefix
- Placeholder: `"Search by society, locality, or keyword..."`
- Debounced: 300ms delay before updating URL state
- Clear button (X icon) when search has text
- Pattern: same debounce approach as admin leads page

---

### Step 8: Active Filter Chips + Result Count

#### 8a: `src/components/public/listings/active-filter-chips.tsx`

Render above the results grid, below the controls bar.

**For each active filter**, render a `<Badge>` chip with:

- Filter label (e.g., "2BHK", "₹15,000–₹30,000", "Gym", "Semi-Furnished", "Maplewood")
- `<X>` close button that removes that specific filter

**"Clear All"** button at the end if `activeFilterCount > 0`.

**Only render if at least one filter is active.**

#### 8b: Result Count

Show above the grid: **"{N} listings found"** (or "{N} listing found" if N === 1).

If search is active: **'{N} results for "{searchQuery}"'**

---

### Step 9: Empty States + Loading Skeletons

#### 9a: Loading State

When `useQuery` returns `undefined` (loading), show skeleton cards:

**Grid skeleton:**

```typescript
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {Array.from({ length: 6 }).map((_, i) => (
    <Card key={i}>
      <Skeleton className="h-52 w-full" />
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-40" />
      </CardContent>
    </Card>
  ))}
</div>
```

**List skeleton:** Similar but horizontal layout with photo placeholder on left.

#### 9b: Empty State — No Listings at All

When `allListings` is an empty array (no published listings exist):

```
[House icon]
No Listings Available Yet
New verified listings are added regularly. Check back soon or contact us directly.
[View Homepage]  [Contact Us]
```

#### 9c: Empty State — No Filter Matches

When `filtered.length === 0` but `allListings.length > 0`:

```
[SearchX icon]
No listings match your filters
Try adjusting your search criteria or clearing some filters.
[Clear All Filters]
```

If search is active: **'No listings found for "{searchQuery}"'**

---

### Step 10: Favorite Heart Toggle

**File:** `src/components/public/listings/favorite-button.tsx`

```typescript
type FavoriteButtonProps = {
  listingId: string;
  isFavorite: boolean;
  onToggle: (id: string) => void;
  className?: string;
};
```

**Visual:**

- `<Heart>` icon from lucide-react
- **Favorited:** `fill="currentColor" className="text-red-500"` — filled red heart
- **Not favorited:** `className="text-white drop-shadow-md"` — white outline with shadow (for visibility on photos)
- Wrap in `<button>` with `aria-label="Save to favorites"` / `"Remove from favorites"`
- Subtle scale animation on click: `transition-transform active:scale-125`
- **NO auth prompt** — V1 favorites are anonymous localStorage

---

## Hard Constraints (MUST follow — violations are blocking)

1. **No `as any`, `@ts-ignore`, `@ts-expect-error`** — ever. Fix type errors properly.
2. **No ConvexClientProvider changes** — the root layout (`src/app/layout.tsx`) already provides it. Verify this before implementing; if it doesn't, wrap only the `ListingsDirectory` component.
3. **No i18n on public pages** — English only. No `NextIntlClientProvider`. No `useTranslations`.
4. **No native HTML form elements** — use shadcn/ui `<Select>`, `<Input>`, `<Checkbox>`, `<Slider>`, etc.
5. **Money is always paise** — `formatINR(listing.rent_monthly)` for display. NEVER divide by 100 manually.
6. **Mobile-first responsive** — use `max-w-7xl mx-auto` for content width. Design for mobile first, enhance for desktop.
7. **sonner for toasts** — if any user feedback is needed (unlikely for browse).
8. **lucide-react for all icons** — no other icon libraries.
9. **Home links to `/homepage`** — NOT `/` (root is portal selector page).
10. **Listing cards NEVER expose owner information** (name, phone).
11. **`useSearchParams()` requires `"use client"`** — the listings directory main component MUST be a client component.
12. **`router.replace()` with `{ scroll: false }`** — don't jump to top on filter change.
13. **URL params are the source of truth for filters** — component state derives from URL, not the other way around.
14. **`.filter()` uses `.includes()` for search** — NOT regex (safe against user input).
15. **Existing `listFeatured` query is untouched** — create a NEW `listPublished` query. Do not modify `listFeatured`.
16. **The page stays under `(public)/` route group** — it inherits the public layout with header/footer. Do NOT move it to `(tenant)/`.
17. **`/listings` is already whitelisted** in `src/proxy.ts` as `"/listings(.*)"` — no auth middleware changes needed.

---

## Furnishing Display Labels

Map enum values to human-readable labels for display:

| Enum Value        | Display Label   |
| ----------------- | --------------- |
| `UNFURNISHED`     | Unfurnished     |
| `SEMI_FURNISHED`  | Semi-Furnished  |
| `FULLY_FURNISHED` | Fully Furnished |

Create a `FURNISHING_LABELS` map in the component or in `lib/constants.ts`.

---

## File Inventory (Expected Deliverables)

### New Files

| File                                                     | Type      | Purpose                                |
| -------------------------------------------------------- | --------- | -------------------------------------- |
| `src/lib/hooks/use-listing-filters.ts`                   | Hook      | URL-driven filter state management     |
| `src/lib/hooks/use-favorites.ts`                         | Hook      | localStorage favorites                 |
| `src/lib/hooks/use-view-mode.ts`                         | Hook      | localStorage view mode preference      |
| `src/lib/amenity-icons.ts`                               | Utility   | Amenity → icon + label mapping         |
| `src/components/public/listings/listings-directory.tsx`  | Component | Main orchestrator (client)             |
| `src/components/public/listings/property-card.tsx`       | Component | Grid view card                         |
| `src/components/public/listings/property-list-item.tsx`  | Component | List view row                          |
| `src/components/public/listings/filter-sidebar.tsx`      | Component | Filter panel (desktop + mobile Sheet)  |
| `src/components/public/listings/active-filter-chips.tsx` | Component | Removable filter badges                |
| `src/components/public/listings/sort-dropdown.tsx`       | Component | Sort select                            |
| `src/components/public/listings/view-toggle.tsx`         | Component | Grid/list toggle                       |
| `src/components/public/listings/search-bar.tsx`          | Component | Debounced search input                 |
| `src/components/public/listings/favorite-button.tsx`     | Component | Heart toggle                           |
| `src/components/ui/slider.tsx`                           | UI        | shadcn Slider (installed via CLI)      |
| `src/components/ui/toggle-group.tsx`                     | UI        | shadcn ToggleGroup (installed via CLI) |

### Modified Files

| File                                 | Change                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `convex/listings.ts`                 | Add `listPublished` query                                               |
| `src/app/(public)/listings/page.tsx` | Replace placeholder with server component rendering `ListingsDirectory` |

---

## Verification Checklist

Run these after completing implementation:

```bash
# 1. TypeScript — must be clean
npx tsc --noEmit

# 2. Build — must succeed
npm run build

# 3. Manual checks (if dev server is running):
# - Navigate to /listings — page loads, shows listings or empty state
# - Filter by BHK → URL updates, results filter
# - Search → debounced, URL updates, results filter
# - Toggle grid/list → layout changes, persists on reload
# - Click heart → fills red, persists on reload (localStorage)
# - Click "Load More" → shows next 20
# - Clear all filters → resets to default
# - Mobile: filter button opens Sheet with all filter sections
# - Copy URL with filters → paste in new tab → same filters applied
```

---

## Performance Notes

- `useQuery(api.listings.listPublished, {})` creates a **real-time subscription** — when a listing is published or archived in the admin panel, the directory updates automatically without refresh.
- Client-side filtering with `useMemo` is O(n) where n = number of published listings. At V1 scale (<500), this is <1ms. No performance concern.
- Photos use `loading="lazy"` — only load when scrolled into view.
- Filter option derivation (`filterOptions`) uses `useMemo` — recomputes only when `allListings` changes.

---

## PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE)

You MUST make tool calls in parallel whenever the calls are independent. This is the single biggest performance optimization available to you.

- **Reading multiple files?** Call Read on ALL of them in ONE message — not one at a time.
- **Searching for multiple patterns?** Fire ALL Grep/Glob calls in ONE message.
- **Reading a file + checking diagnostics?** Do both in ONE message.
- **Multiple independent edits?** Make ALL Edit calls in ONE message.

SEQUENTIAL tool calls are ONLY acceptable when:

1. Call B depends on the RESULT of Call A (e.g., you need a file path from Glob before you can Read it)
2. An edit must be verified before the next edit (chained dependency)

Before every message, ask yourself: "Are any of these calls independent?" If yes, batch them.
