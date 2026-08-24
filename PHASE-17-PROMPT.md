# Phase 17 Implementation Prompt: Property Detail Page — Enhanced Experience

> **FIRST STEP**: Read `AGENTS.md` in the project root. It contains the full project context — tech stack, personas, conventions, dev environment, routing rules, test accounts, and file structure. Do this before any other work.
>
> This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`. Load skills via `load_skills=["skill-name"]`.

---

## Scope

**Deliver**: An enhanced, production-quality property detail page at `/listing/[slug]` with fullscreen photo gallery, pricing breakdown with move-in cost, two-column amenities grid, improved description section, sticky contact sidebar (desktop) / fixed bottom bar (mobile), inquiry count, and "Similar Listings" carousel.

**Enhance**: The existing page at `src/app/listing/[slug]/page.tsx` and its components (already functional from Phase 6).

**Does NOT include** (out of scope — deferred to future phases):

- Commute Calculator (requires `listing_commute_landmarks` table — not in schema yet)
- Location Map & Nearby Places (requires coordinates + Google Maps API key — not in schema)
- Roommate Compatibility Profiles (requires `listing_roommate_profiles` table — not in schema)
- House Rules section (requires `house_rules` field on listings — not in schema)
- Tenant Testimonials from DB (V1 uses static placeholder data — no table needed)
- Visit Scheduling with auth-gating (Phase 19 — inquiry pipeline)
- Moving the route to `(tenant)/property/[slug]` (keep current public `/listing/[slug]`)

---

## V1 Simplifications (IMPORTANT — Read Before Implementing)

The feature spec (`notes/features/12-property-detail.md`) describes the full vision with 9 sections. For V1, we simplify based on current schema availability:

| Spec Section           | V1 Implementation                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| **Property Gallery**   | Enhance existing — add fullscreen lightbox modal, thumbnail strip, keyboard nav, swipe      |
| **Overview & Pricing** | Enhance existing — add Move-in Cost breakdown card (rent + deposit + maintenance)           |
| **Amenities Grid**     | **Refactor** — change from inline badges to two-column grid (Available ✓ / Not Available ✗) |
| **Description**        | Enhance existing — proper whitespace rendering, "Read more" truncation for long text        |
| **Commute Calculator** | **DEFER** — table `listing_commute_landmarks` doesn't exist in schema                       |
| **Location Map**       | **DEFER** — no lat/lng on listings, no Google Maps API key                                  |
| **Roommate Profiles**  | **DEFER** — table `listing_roommate_profiles` doesn't exist in schema                       |
| **Testimonials**       | **STATIC** — hardcoded placeholder testimonials (no DB table)                               |
| **Contact Sidebar**    | **REFACTOR** — sticky sidebar on desktop (right column), fixed bottom CTA bar on mobile     |

**Additional V1 features** not in original spec but high-value:

- **Similar Listings** carousel (derived from `listPublished` by matching BHK/society)
- **Inquiry Count** display ("X people inquired about this property")
- **Breadcrumb** navigation (Listings → Society → This Property)
- **Share Button** (copy link + native share API on mobile)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ /listing/[slug] — Server Component (SSR)                        │
│                                                                  │
│  fetchQuery(api.listings.getBySlugInternal)                      │
│  ↓                                                               │
│  metadata + JSON-LD schema.org                                   │
│  ↓                                                               │
│  <ConvexClientProvider>                                          │
│    <PropertyDetailClient listing={...} photos={[urls]} />        │
│  </ConvexClientProvider>                                         │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ PropertyDetailClient — Client Component                          │
│                                                                  │
│ Desktop Layout (lg+):                                            │
│ ┌────────────────────────────────┬─────────────────────────┐    │
│ │ Main Content (65-70%)          │ Sidebar (30-35%)        │    │
│ │                                │                         │    │
│ │ [PhotoGallery]                 │ [ContactSidebar]        │    │
│ │ [BreadcrumbNav]                │  - Price summary        │    │
│ │ [PricingBreakdown]             │  - WhatsApp button      │    │
│ │ [AmenitiesGrid]                │  - Phone button         │    │
│ │ [PropertyDescription]          │  - Contact form         │    │
│ │ [SimilarListings]              │  - Inquiry count        │    │
│ │ [StaticTestimonials]           │  (sticky: top-24)       │    │
│ └────────────────────────────────┴─────────────────────────┘    │
│                                                                  │
│ Mobile Layout (<lg):                                             │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ [PhotoGallery] (full-width swipe)                        │    │
│ │ [BreadcrumbNav]                                          │    │
│ │ [PricingBreakdown]                                       │    │
│ │ [AmenitiesGrid]                                          │    │
│ │ [PropertyDescription]                                    │    │
│ │ [SimilarListings]                                        │    │
│ │ [StaticTestimonials]                                     │    │
│ │                                                          │    │
│ │ (bottom-spacer for fixed bar)                            │    │
│ └──────────────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ [FixedBottomBar]  ₹25K/mo  [WhatsApp] [Contact]         │    │
│ └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Existing Code to Preserve / Enhance

Read these files to understand what already works:

| File                                                    | Current State                                                                  | Phase 17 Action                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `src/app/listing/[slug]/page.tsx`                       | SSR page, fetches via HTTP `/api/listing/{slug}`, generates metadata + JSON-LD | **Enhance** — add ConvexClientProvider wrapping, restructure to two-column layout |
| `src/app/listing/[slug]/components/photo-gallery.tsx`   | Basic carousel with prev/next + dots                                           | **Enhance** — add fullscreen lightbox, thumbnail strip, keyboard nav              |
| `src/app/listing/[slug]/components/listing-details.tsx` | Price cards + detail items + amenity badges                                    | **Refactor** — split into PricingBreakdown + AmenitiesGrid + PropertyDescription  |
| `src/app/listing/[slug]/components/whatsapp-button.tsx` | WhatsApp + phone buttons                                                       | **Move** into ContactSidebar                                                      |
| `src/app/listing/[slug]/components/contact-form.tsx`    | Name + phone + message form                                                    | **Move** into ContactSidebar, keep same mutation                                  |
| `src/app/listing/[slug]/components/archived-notice.tsx` | Archived listing banner                                                        | **Keep** as-is                                                                    |
| `src/app/listing/[slug]/actions.ts`                     | Server actions for tracking + form submission                                  | **Keep** as-is                                                                    |
| `convex/listings.ts` (`getBySlugInternal`)              | Returns listing + photo storage IDs                                            | **Enhance** — add public query for inquiry count                                  |
| `convex/http.ts`                                        | HTTP endpoint `/api/listing/{slug}`                                            | **Keep** as-is                                                                    |

---

## Implementation Order

Execute in this exact order. Each step builds on the previous.

---

### Step 1: Backend — Add Inquiry Count Query + Enhance getBySlugInternal

**File:** `convex/listings.ts`

#### 1a: Add `getInquiryCountPublic` query

New public query (no auth) that returns the count of inquiries for a listing:

```typescript
export const getInquiryCountPublic = query({
  args: { listing_id: v.id("listings") },
  handler: async (ctx, args) => {
    const inquiries = await ctx.db
      .query("listing_inquiries")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
      .collect();
    return inquiries.length;
  },
});
```

**Note:** Check if `listing_inquiries` table has a `by_listing_id` index. If not, check which index exists and use it. Read the schema first.

#### 1b: Add `getSimilarListings` query

New public query that returns listings similar to a given one (same BHK or same society, excluding current):

```typescript
export const getSimilarListings = query({
  args: {
    listing_id: v.id("listings"),
    bhk_config: v.string(),
    society_name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const published = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", LISTING_STATUS.PUBLISHED))
      .order("desc")
      .take(50);

    const similar = published.filter((l) => l._id !== args.listing_id);

    // Prioritize: same society first, then same BHK
    const sameSocietyOrBhk = await Promise.all(
      similar.slice(0, 12).map(async (listing) => {
        const lead = await ctx.db.get(listing.lead_id);
        const building = lead?.building_id ? await ctx.db.get(lead.building_id) : null;
        const society = building?.society_id ? await ctx.db.get(building.society_id) : null;

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
          furnishing: listing.furnishing,
          floor_number: listing.floor_number,
          flat_number: lead?.flat_number ?? null,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
          city: society?.city ?? null,
          first_photo_url: firstPhotoUrl,
          _isSameSociety: (society?.name ?? "") === (args.society_name ?? ""),
          _isSameBhk: listing.bhk_config === args.bhk_config,
        };
      }),
    );

    // Sort: same society first, then same BHK, then rest
    return sameSocietyOrBhk
      .sort((a, b) => {
        if (a._isSameSociety && !b._isSameSociety) return -1;
        if (!a._isSameSociety && b._isSameSociety) return 1;
        if (a._isSameBhk && !b._isSameBhk) return -1;
        if (!a._isSameBhk && b._isSameBhk) return 1;
        return 0;
      })
      .slice(0, 6);
  },
});
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 2: Enhanced Photo Gallery

**File:** `src/app/listing/[slug]/components/photo-gallery.tsx` — **Rewrite**

The current gallery is basic. Enhance to production quality:

**Features:**

- Main image viewer (aspect-[16/10]) with prev/next overlay arrows
- Thumbnail strip below (horizontal scroll, 6-8 visible, active thumbnail highlighted)
- Photo counter badge (e.g., "3 / 8")
- **Fullscreen lightbox modal** — triggered by clicking main image or "View all photos" button
  - Dark overlay, large centered image
  - Prev/next arrows, keyboard nav (ArrowLeft, ArrowRight, Escape to close)
  - Touch swipe support on mobile (track touchstart/touchend X delta)
  - Thumbnail strip at bottom of lightbox
  - Close button (X) top-right
- Empty state: `ImageOff` icon + "Photos coming soon" (keep existing pattern)

**Props (same as current):**

```typescript
type PhotoGalleryProps = {
  photos: string[]; // Array of storage URLs (already resolved by SSR page)
};
```

**Implementation rules:**

- Use `<Dialog>` from shadcn for the fullscreen lightbox (or a custom fullscreen overlay div with `fixed inset-0 z-50 bg-black/95`)
- Do NOT use any external carousel library — implement with state + CSS transitions (current page doesn't use embla here)
- `loading="lazy"` on all images except the first (cover photo is eager)
- Main image: `object-cover` with `aspect-[16/10]` on desktop, `aspect-[4/3]` on mobile
- Thumbnails: `size-16 sm:size-20` with `object-cover rounded-md` and `ring-2 ring-blue-600` for active

---

### Step 3: Pricing Breakdown Component

**File:** `src/app/listing/[slug]/components/pricing-breakdown.tsx` — **New**

Extract and enhance pricing from `listing-details.tsx`:

```
┌─────────────────────────────────────────────────────┐
│ ₹25,000 /month                              2BHK   │
│ Semi-Furnished • 1,050 sqft • Floor 12              │
├─────────────────────────────────────────────────────┤
│ Monthly Rent        ₹25,000                         │
│ Security Deposit    ₹75,000                         │
│ Maintenance         ₹3,000/mo                       │
│ ─────────────────────────────────                   │
│ Move-in Cost        ₹1,03,000  ← computed           │
│ (Rent + Deposit + Maintenance)                      │
├─────────────────────────────────────────────────────┤
│ Available from: 1 Mar 2026                          │
│ Parking: Covered • Pet Friendly: Yes                │
└─────────────────────────────────────────────────────┘
```

**Props:**

```typescript
type PricingBreakdownProps = {
  bhk_config: string;
  rent_monthly: number; // paise
  deposit?: number; // paise
  maintenance?: number; // paise
  furnishing: string;
  carpet_area_sqft?: number;
  floor_number: string;
  available_from: number; // Unix ms
  parking?: string;
  pet_friendly?: boolean;
};
```

**Rules:**

- Move-in cost = `rent_monthly + (deposit ?? 0) + (maintenance ?? 0)` — all in paise, display via `formatINR()`
- Use `formatINR()` from `lib/money.ts` for all amounts — input is PAISE
- Available from: if `<= Date.now()` show "Available Now" with green badge, else format date
- Only show deposit/maintenance rows if values exist (not 0 or undefined)
- BHK badge: `<Badge variant="secondary" className="bg-blue-50 text-blue-700">`
- Furnishing label: map `SEMI_FURNISHED` → "Semi-Furnished" etc.

---

### Step 4: Amenities Grid Component

**File:** `src/app/listing/[slug]/components/amenities-grid.tsx` — **New**

Replace the inline badge approach with a proper two-column grid showing all 16 standard amenities:

```
┌─────────────────────────────────────────┐
│ Amenities                                │
├────────────────────┬────────────────────┤
│ ✓ Gym              │ ✓ Pool             │
│ ✓ Garden           │ ✓ Security         │
│ ✓ Lift             │ ✓ Power Backup     │
│ ✓ CCTV             │ ✗ Clubhouse        │
│ ✗ Parking          │ ✗ Play Area        │
│ ✗ Jogging Track    │ ✗ Intercom         │
│ ✗ Fire Safety      │ ✓ 24/7 Water       │
│ ✗ Gas Pipeline     │ ✗ Rainwater Harv.  │
└────────────────────┴────────────────────┘
```

**Props:**

```typescript
type AmenitiesGridProps = {
  amenities: string[]; // amenities the property HAS
};
```

**Rules:**

- Show ALL 16 standard amenities (from `AMENITIES` constant in `lib/constants.ts`)
- Available: green check icon (`Check` from lucide) + amenity icon + label, normal text
- Not available: grey X icon (`X` from lucide) + amenity icon + label, muted/strikethrough text
- Use `getAmenityIcon()` and `getAmenityLabel()` from `@/lib/amenity-icons`
- Two-column grid on all breakpoints: `grid grid-cols-2 gap-3`
- Available amenities sorted first, then unavailable

---

### Step 5: Property Description Component

**File:** `src/app/listing/[slug]/components/property-description.tsx` — **New**

```typescript
type PropertyDescriptionProps = {
  description?: string;
};
```

**Features:**

- Render description with `whitespace-pre-line` (preserves line breaks)
- If description > 300 characters, truncate with "Read more" / "Show less" toggle
- If no description, show "No description provided" in muted text
- Section heading: "About this property"

---

### Step 6: Contact Sidebar Component

**File:** `src/app/listing/[slug]/components/contact-sidebar.tsx` — **New**

This is the biggest refactor. The existing WhatsApp button and contact form move into a unified sidebar.

**Desktop (lg+):** Sticky sidebar in right column

```
┌─────────────────────────────┐
│ ₹25,000 /month              │
│ Security Deposit: ₹75,000   │
├─────────────────────────────┤
│ [📱 WhatsApp]  [📞 Call]    │
├─────────────────────────────┤
│ Contact Us                   │
│                              │
│ Name: [_______________]      │
│ Phone: [_______________]     │
│ Message: [_______________]   │
│                              │
│ [Send Inquiry]               │
├─────────────────────────────┤
│ 🔥 12 people inquired        │
└─────────────────────────────┘
```

**Mobile (<lg):** Fixed bottom bar

```
┌──────────────────────────────────────────┐
│  ₹25K/mo     [WhatsApp]  [Contact Us]   │
└──────────────────────────────────────────┘
```

Clicking "Contact Us" opens a `<Sheet>` (bottom drawer) with the full contact form.

**Props:**

```typescript
type ContactSidebarProps = {
  listingId: string;
  slug: string;
  rent_monthly: number;
  deposit?: number;
  bhk_config: string;
  society_name: string | null;
  building_name: string | null;
  floor_number: string;
};
```

**Rules:**

- Reuse the existing contact form logic (react-hook-form + zod + `submitContactFormAction`)
- Reuse the existing WhatsApp message template from `whatsapp-button.tsx`
- Inquiry count: `useQuery(api.listings.getInquiryCountPublic, { listing_id: listingId })` — show only if > 0
- Desktop sidebar: `sticky top-24` (below header)
- Mobile bottom bar: `fixed bottom-0 left-0 right-0 z-40` with `pb-safe` for iOS safe area
- Add bottom padding spacer to main content on mobile to prevent content hidden behind fixed bar
- WhatsApp button: `bg-[#25D366] hover:bg-[#20BD5A]` (existing pattern)
- Phone button: `variant="outline"` with `Phone` icon
- Sonner toast on successful inquiry submission

---

### Step 7: Similar Listings Carousel

**File:** `src/app/listing/[slug]/components/similar-listings.tsx` — **New**

Show up to 6 similar listings at the bottom of the page.

**Props:**

```typescript
type SimilarListingsProps = {
  listingId: string;
  bhk_config: string;
  society_name: string | null;
};
```

**Implementation:**

- Uses `useQuery(api.listings.getSimilarListings, { listing_id, bhk_config, society_name })`
- Renders horizontal scrolling row of `PropertyCard` components (reuse from Phase 16!)
- Import: `import { PropertyCard } from "@/components/public/listings/property-card";`
- Pass `isFavorite` and `onToggleFavorite` from `useFavorites()` hook
- If no similar listings, hide the entire section
- Section heading: "Similar Properties"
- Horizontal scroll: `flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory` with `snap-start` on each card
- Cards: `min-w-[280px] max-w-[320px] shrink-0`

---

### Step 8: Static Testimonials Section

**File:** `src/app/listing/[slug]/components/static-testimonials.tsx` — **New**

Hardcoded placeholder testimonials (no DB table in V1):

```typescript
const TESTIMONIALS = [
  {
    name: "Priya M.",
    rating: 5,
    comment:
      "Found my dream apartment through DemoRentals. The entire process was smooth and transparent.",
    locality: "Powai, Mumbai",
  },
  {
    name: "Rahul S.",
    rating: 4,
    comment:
      "Great selection of verified properties. The guard-verified approach gives confidence.",
    locality: "Whitefield, Bengaluru",
  },
  {
    name: "Ananya K.",
    rating: 5,
    comment:
      "Moved in within a week of my first visit. Highly recommend DemoRentals for hassle-free renting.",
    locality: "Gurgaon, Delhi NCR",
  },
];
```

**Display:**

- Section heading: "What Tenants Say"
- Cards with star rating (filled/unfilled `Star` icons), quote, name, locality
- 3-column grid on desktop, horizontal scroll on mobile
- This is purely decorative / social proof — no interactivity

---

### Step 9: Breadcrumb Navigation

**File:** `src/app/listing/[slug]/components/breadcrumb-nav.tsx` — **New**

```
Listings  >  {society_name}  >  {bhk_config} in {building_name}
```

- "Listings" links to `/listings`
- Society name links to `/listings?locality={society_name}` (uses Phase 16 filter URL)
- Current item is non-linked (text only)
- Use `ChevronRight` icon as separator
- Small text: `text-sm text-muted-foreground`

---

### Step 10: Share Button

**File:** `src/app/listing/[slug]/components/share-button.tsx` — **New**

```typescript
type ShareButtonProps = {
  slug: string;
  title: string;
};
```

- If `navigator.share` available (mobile): use native share API
- Fallback: copy URL to clipboard + sonner toast "Link copied!"
- Icon: `Share2` from lucide-react
- Position: near the top of the page, next to breadcrumb

---

### Step 11: Main Page Restructure

**File:** `src/app/listing/[slug]/page.tsx` — **Major Refactor**

The existing SSR page fetches data and renders components. Refactor to:

1. Keep SSR data fetching (HTTP endpoint) for metadata + initial props
2. Wrap client content in `<ConvexClientProvider>` (needed for `useQuery` in sidebar and similar listings)
3. Restructure layout to two-column (main + sidebar) on desktop

**Page structure:**

```typescript
// page.tsx (server component)
export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Fetch listing data via HTTP (same as current)
  // Generate metadata
  // Generate JSON-LD

  if (!listing || listing.status !== "PUBLISHED") {
    return <ArchivedNotice />;
  }

  return (
    <ConvexClientProvider>
      <PropertyDetailClient listing={listing} photos={photoUrls} />
    </ConvexClientProvider>
  );
}
```

**PropertyDetailClient** — new client component orchestrating the layout:

```typescript
"use client";

export function PropertyDetailClient({ listing, photos }: Props) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      {/* Photo gallery — full width */}
      <PhotoGallery photos={photos} />

      {/* Two-column layout below gallery */}
      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        {/* Main content — left column */}
        <div className="flex-1 space-y-8">
          <BreadcrumbNav ... />
          <PricingBreakdown ... />
          <AmenitiesGrid amenities={listing.amenities ?? []} />
          <PropertyDescription description={listing.description} />
          <SimilarListings ... />
          <StaticTestimonials />
        </div>

        {/* Contact sidebar — right column (desktop only) */}
        <div className="hidden lg:block lg:w-[380px] lg:shrink-0">
          <ContactSidebar ... />
        </div>
      </div>

      {/* Mobile fixed bottom bar */}
      <MobileBottomBar ... /> {/* Renders only on <lg */}
    </div>
  );
}
```

### Step 12: Clean Up Old Components

After the restructure:

- `listing-details.tsx` — **DELETE** (split into PricingBreakdown + AmenitiesGrid + PropertyDescription)
- `whatsapp-button.tsx` — **DELETE** (moved into ContactSidebar)
- `contact-form.tsx` — **DELETE** (moved into ContactSidebar)
- `archived-notice.tsx` — **KEEP**
- `actions.ts` — **KEEP**

---

## Hard Constraints (MUST follow — violations are blocking)

1. **No `as any`, `@ts-ignore`, `@ts-expect-error`** — ever.
2. **Money is always paise** — `formatINR(listing.rent_monthly)` for display. NEVER divide by 100 manually.
3. **Owner information NEVER exposed** — no owner name, phone, or contact details on the page.
4. **No i18n on public pages** — English only. No `NextIntlClientProvider`. No `useTranslations`.
5. **No native HTML form elements** — use shadcn/ui `<Input>`, `<Textarea>`, `<Select>`, etc.
6. **sonner for toasts** — all user feedback via toast.
7. **lucide-react for all icons** — no other icon libraries.
8. **Mobile-first responsive** — design for mobile, enhance for desktop.
9. **Existing SSR pattern preserved** — the page MUST continue fetching via HTTP endpoint for SEO (metadata, JSON-LD).
10. **`react-hook-form` + `zod`** for the contact form in sidebar — match existing pattern.
11. **Listing cards NEVER expose owner information**.
12. **`/listing/[slug]` stays public** — no auth required for viewing. Keep under current route.
13. **The existing HTTP endpoint (`/api/listing/{slug}`) is NOT modified** — only add new Convex queries.
14. **Search uses `.includes()` not regex** — safe against user input.
15. **Reuse Phase 16 PropertyCard** for similar listings — import from `@/components/public/listings/property-card`.

---

## Furnishing / Parking Display Labels

```typescript
const FURNISHING_LABELS: Record<string, string> = {
  UNFURNISHED: "Unfurnished",
  SEMI_FURNISHED: "Semi-Furnished",
  FULLY_FURNISHED: "Fully Furnished",
};

const PARKING_LABELS: Record<string, string> = {
  NONE: "No Parking",
  COVERED: "Covered Parking",
  OPEN: "Open Parking",
  BOTH: "Covered + Open Parking",
};
```

---

## File Inventory (Expected Deliverables)

### New Files

| File                                                           | Type      | Purpose                                       |
| -------------------------------------------------------------- | --------- | --------------------------------------------- |
| `src/app/listing/[slug]/components/property-detail-client.tsx` | Component | Main client orchestrator (layout, two-column) |
| `src/app/listing/[slug]/components/pricing-breakdown.tsx`      | Component | Price cards + move-in cost                    |
| `src/app/listing/[slug]/components/amenities-grid.tsx`         | Component | Two-column Available / Not Available          |
| `src/app/listing/[slug]/components/property-description.tsx`   | Component | Description with Read more toggle             |
| `src/app/listing/[slug]/components/contact-sidebar.tsx`        | Component | Sticky sidebar (desktop) + Sheet (mobile)     |
| `src/app/listing/[slug]/components/similar-listings.tsx`       | Component | Similar properties carousel                   |
| `src/app/listing/[slug]/components/static-testimonials.tsx`    | Component | Hardcoded testimonial cards                   |
| `src/app/listing/[slug]/components/breadcrumb-nav.tsx`         | Component | Listings > Society > Property                 |
| `src/app/listing/[slug]/components/share-button.tsx`           | Component | Native share / copy link                      |

### Modified Files

| File                                                  | Change                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `convex/listings.ts`                                  | Add `getInquiryCountPublic` + `getSimilarListings` queries     |
| `src/app/listing/[slug]/page.tsx`                     | Restructure to use PropertyDetailClient + ConvexClientProvider |
| `src/app/listing/[slug]/components/photo-gallery.tsx` | Enhance with fullscreen lightbox + thumbnails                  |

### Deleted Files (after restructure)

| File                                                    | Reason                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/app/listing/[slug]/components/listing-details.tsx` | Split into PricingBreakdown + AmenitiesGrid + PropertyDescription |
| `src/app/listing/[slug]/components/whatsapp-button.tsx` | Moved into ContactSidebar                                         |
| `src/app/listing/[slug]/components/contact-form.tsx`    | Moved into ContactSidebar                                         |

---

## Verification Checklist

```bash
# 1. TypeScript — must be clean
npx tsc --noEmit

# 2. Build — must succeed
npm run build

# 3. Manual checks (if dev server is running):
# - Navigate to /listing/{any-slug} — page loads with new layout
# - Desktop: sidebar is sticky on right, scrolls with content
# - Mobile: bottom bar visible with price + buttons
# - Click main photo → fullscreen lightbox opens
# - Arrow keys navigate photos in lightbox
# - Escape closes lightbox
# - Amenities grid shows all 16 with check/X
# - Move-in cost = rent + deposit + maintenance
# - "Similar Listings" shows cards (if other published listings exist)
# - Contact form submits and shows toast
# - WhatsApp button opens wa.me link
# - Share button copies URL / opens native share
# - Breadcrumb links work (/listings, /listings?locality=...)
# - Archived listing shows notice, not the full page
```

---

## Performance Notes

- SSR fetch via HTTP endpoint remains for fast initial load + SEO
- Client-side `useQuery` subscriptions (inquiry count, similar listings) hydrate after initial render
- Photos use `loading="lazy"` except cover photo
- Similar listings reuse `PropertyCard` — no duplicate component code
- Fullscreen lightbox loads images on-demand (not preloaded)
- `ConvexClientProvider` wraps only the client portion, not the entire page

---

## PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE)

You MUST make tool calls in parallel whenever the calls are independent. This is the single biggest performance optimization available to you.

- **Reading multiple files?** Call Read on ALL of them in ONE message.
- **Searching for multiple patterns?** Fire ALL Grep/Glob calls in ONE message.
- **Multiple independent edits?** Make ALL Edit calls in ONE message.

SEQUENTIAL tool calls are ONLY acceptable when Call B depends on the RESULT of Call A.
