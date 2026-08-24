# Feature: Tenant Listing Browse

> **Priority**: #16 in implementation order
> **Personas**: Prospective Tenant (public + authenticated)
> **Dependencies**: Auth (P01) for optional sign-in, Listings (P06) for published listings to browse
> **Route Group**: `(public)/`

## Purpose

The listing directory is the primary tenant discovery surface — where prospective tenants find available rental properties. It provides search, filtering, sorting, view modes (grid/list), and a favorites system. All browsing is public (no auth required). In V1, favorites are stored locally in `localStorage`.

## Entities Involved

- `listings` table (read — published listings only)
- `listing_photos` table (read — cover images for cards)
- Browser `localStorage` (write — favorites and view mode)

## User Stories

### Tenant: Browse Listings Directory

**As a tenant**, I want to browse all available listings so I can find a flat that fits my needs.

**Acceptance Criteria**:

- Listing directory page at `/listings`
- Only `PUBLISHED` listings are shown
- Default sort: newest first (by `_creationTime`)
- Grid view (default) and list view toggle
- Pagination (20 items per page, "Load More" or page numbers)
- Each listing card shows: cover photo, title (building/flat), locality, rent, BHK, key amenities, verified badge
- Card actions: view detail (click), save/unsave favorite (heart icon, localStorage), WhatsApp deep link

### Tenant: Search Listings

**As a tenant**, I want to search listings by keyword so I can quickly find what I'm looking for.

**Acceptance Criteria**:

- Search bar at top of listing directory
- Searches across: society name, building name, locality, description
- Results update as user types (debounced, 300ms)
- Uses Convex search index on listings (or client-side filter for V1 scale)

### Tenant: Filter Listings

**As a tenant**, I want to filter listings by locality, property type, price range, bedrooms, amenities, and availability.

**Acceptance Criteria**:

- Filter sidebar (desktop: persistent, mobile: slide-out panel triggered by filter button)
- Filter sections (each collapsible):
  - **Society**: Multi-select checkboxes (derived from listing data)
  - **Property Type**: BHK config chips (1BHK, 2BHK, 3BHK, etc.)
  - **Price Range**: Min/max slider or inputs (in ₹, stored as paise)
  - **Furnishing**: Chips (Unfurnished, Semi, Fully)
  - **Amenities**: Multi-select checkboxes (gym, pool, parking, etc.)
  - **Availability**: "Available Now" toggle
- Active filters shown as removable chips above results
- "Clear All" button to reset filters
- Result count updates in real-time

### Tenant: Sort Listings

**As a tenant**, I want to sort listings by relevance, price, newest, or area.

**Acceptance Criteria**:

- Sort dropdown with options: Newest First (default), Price: Low to High, Price: High to Low, Area: Large to Small
- Sort persists across filter changes

### Tenant: Toggle View Mode

**As a tenant**, I want to switch between grid and list views.

**Acceptance Criteria**:

- Grid view: 2-3 column card layout (responsive)
- List view: single-column expanded rows with more details
- View preference persisted in localStorage

### Tenant: Save Favorite Listings

**As a tenant**, I want to save listings I like so I can compare them later.

**Acceptance Criteria**:

- Heart icon on each listing card
- Tap heart toggles favorite in browser `localStorage` (`demorentals-favorites`)
- Favorites persist across page refreshes and browser sessions on the same device
- No backend persistence in V1

---

## Property Card (Grid View)

```
┌─────────────────────────┐
│ [Cover Photo]           │
│                    ♡    │  ← Favorite toggle (top-right)
├─────────────────────────┤
│ Tower A, Fl 12, #1201   │
│ Maplewood, Thane       │
│                         │
│ ₹25,000/mo  •  2BHK    │
│ Semi-Furnished           │
│                         │
│ 🏊 Pool  🏋 Gym  🅿️ Park│  ← Top 3 amenities
│                         │
│ [View Details] [WhatsApp]│
└─────────────────────────┘
```

## Property List Item (List View)

```
┌──────────┬──────────────────────────────────────────┐
│ [Photo]  │ Tower A, Fl 12, #1201 — Maplewood      │
│          │ ₹25,000/mo • 2BHK • Semi-Furnished        │
│          │ 1,050 sqft • Available Now                 │
│          │ 🏊 Pool  🏋 Gym  🅿️ Parking  🔒 Security │
│          │                                           │
│          │ [View Details]  [WhatsApp]  ♡              │
└──────────┴──────────────────────────────────────────┘
```

---

## Convex Functions

### Queries

```
listings.listPublished() → Listing[] (PUBLISHED only; enriched with lead/building/society/photo)
```

### Mutations

None for V1 browse/favorites (client-side localStorage).

---

## Business Rules

1. Only `PUBLISHED` listings appear in the directory. `DRAFT` and `ARCHIVED` are hidden.
2. Favorites and view mode persist in browser localStorage (`demorentals-favorites`, `demorentals-view-mode`).
3. Search is debounced at 300ms and updates URL query params for shareable filtered links.
4. WhatsApp deep links use `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE`.
5. Cover photo is the `listing_photos` entry with lowest `display_order`.
6. All money displayed in ₹ (converted from paise). See [Data Models](../02-data-models.md) conventions.
7. Listing cards never expose owner information (name, phone).

---

## Edge Cases

- **No listings match filters**: Show friendly empty state: "No listings match your filters. Try adjusting your criteria."
- **Search with no results**: "No listings found for '[query]'"
- **Listing archived while tenant is browsing**: Convex real-time subscription removes it from the list automatically.
- **Saved favorite becomes unpublished**: It naturally disappears from directory results because only published listings are queried.
