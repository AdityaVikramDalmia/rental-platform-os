---
id: P17-E01
title: Property Detail Backend & Route
phase: 17
status: pending
depends_on: ["P06-E04"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-18
---

# P17-E01: Property Detail Backend & Route

## Overview

Enhance the existing listing detail page at `/listing/[slug]` (NOT create a new route). Add a `getBySlugPublic` query to `convex/listings.ts` that returns the full listing with all photos, roommate profiles, and commute landmarks. Add `house_rules: v.optional(v.array(v.string()))` to the listings schema. Create SEO helpers in `src/lib/seo.ts`. Build an enhanced photo gallery component and a sticky contact sidebar.

## Prerequisites

- **Read first**: [P06-E04 Completion Summary](../phase-06-listings/P06-E04-public-listing-page.md#completion-summary) — baseline public listing route implementation and SSR patterns.
- **Codebase facts to verify before starting**:
  - Existing page at `src/app/listing/[slug]/page.tsx` (~167 lines) is the route to enhance. Do NOT create a second detail route.
  - Existing `getBySlugInternal` query lives in `convex/listings.ts` (around lines 582-640) and should be reused as the logic reference only.
  - Existing HTTP endpoint `/api/listing/{slug}` lives in `convex/http.ts` and currently calls internal listing fetch logic.
  - Existing page components live in `src/app/listing/[slug]/components/` (`photo-gallery`, `listing-details`, `whatsapp-button`, `contact-form`, `archived-notice`).
  - `notes/10-convex-schema.md` documents `listing_roommate_profiles` and `listing_commute_landmarks` (lines 768-789), but these tables are not yet present in `convex/schema.ts` and must be added in this epic.

## Task Queue

- [ ] P17-E01-T01: Add Schema Fields & Missing Tables
- [ ] P17-E01-T02: Add `getBySlugPublic` Query
- [ ] P17-E01-T03: SEO Utilities & Page Route Enhancement
- [ ] P17-E01-T04: Enhanced Photo Gallery & Contact Sidebar

---

## T01: Add Schema Fields & Missing Tables

### Objective

Add `house_rules: v.optional(v.array(v.string()))` field to the `listings` table in `convex/schema.ts`. Also add the `listing_roommate_profiles` and `listing_commute_landmarks` tables that are documented in `notes/10-convex-schema.md` (lines 768-789) but missing from the actual schema file. This reconciles the schema drift.

### Required Reading

- `notes/10-convex-schema.md` — `listings` table section and `listing_roommate_profiles` + `listing_commute_landmarks` definitions (lines ~768-789)
- `convex/schema.ts` — current listing and listing-related table ordering
- `notes/13-constants-reference.md` — "Landmark Category (Commute Calculator)" enum literals

### Key Rules

1. Modify `convex/schema.ts` — add `house_rules: v.optional(v.array(v.string()))` to the `listings` table definition.
2. Add `listing_roommate_profiles` table with fields: `listing_id: v.id("listings")`, `name_alias: v.string()`, `age_range: v.optional(v.string())`, `profession: v.optional(v.string())`, `interests: v.optional(v.array(v.string()))`, `lifestyle_tags: v.optional(v.array(v.string()))`. Index: `by_listing_id: ["listing_id"]`.
3. Add `listing_commute_landmarks` table with fields: `listing_id: v.id("listings")`, `landmark_name: v.string()`, `distance_text: v.string()`, `time_text: v.string()`, `landmark_category: v.optional(v.union(v.literal("TECH_HUB"), v.literal("METRO_STATION"), v.literal("HOSPITAL"), v.literal("SCHOOL"), v.literal("MALL"), v.literal("OTHER")))`. Index: `by_listing_id: ["listing_id"]`.
4. Place the new tables AFTER `listing_photos` in the schema for logical grouping.
5. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/schema.ts` — `house_rules` field added to `listings`, `listing_roommate_profiles` table added, `listing_commute_landmarks` table added

### Acceptance Criteria

1. `listings` table includes `house_rules` as `v.optional(v.array(v.string()))`.
2. Both missing listing-related tables are present in `convex/schema.ts` with exact fields and `by_listing_id` index.
3. New table placement is immediately after `listing_photos`.
4. TypeScript compiles with no new errors.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`.

### Out of Scope

- Tenant inquiry form (P19 scope)
- Roommate profiles display component (P17-E03)
- Commute calculator component (P17-E03)
- Location map component (P17-E03)
- Tenant testimonials component (P17-E03)
- Pricing block component (P17-E02)
- Amenities section component (P17-E02)

---

## T02: Add `getBySlugPublic` Query

### Objective

Add a public `getBySlugPublic` query to `convex/listings.ts` that returns a single PUBLISHED listing enriched with all photos (not just cover), roommate profiles, commute landmarks, and building/society context. Also return `inquiry_count` in the same payload. Also update the existing HTTP endpoint in `convex/http.ts` to call `getBySlugPublic` instead of `getBySlugInternal`.

### Required Reading

- `convex/listings.ts` — `getBySlugInternal` (line ~582) and `getListingContext` helper (line ~140)
- `convex/http.ts` — existing `/api/listing/{slug}` route implementation
- `notes/features/12-property-detail.md` — "Convex Functions" and "Business Rules" sections
- `notes/10-convex-schema.md` — listing photo, roommate profile, commute landmark, and tenant inquiry table definitions

### Key Rules

1. Modify `convex/listings.ts` — add `getBySlugPublic` as a new export. Place it after existing slug-related queries.
2. Import `query` from `./_generated/server` (public, no auth).
3. Args: `slug: v.string()`.
4. Implementation:
   - Find listing by slug (reuse existing pattern from `getBySlugInternal` line 582).
   - Validate status is PUBLISHED. If not PUBLISHED or not found → return `null`.
   - Enrich with `getListingContext(ctx, listing)` for building/society.
   - Fetch ALL photos (not just cover): `ctx.db.query("listing_photos").withIndex("by_listing_id", q => q.eq("listing_id", listing._id)).filter(q => q.neq(q.field("is_deleted"), true)).collect()`, sorted by `display_order`, with `ctx.storage.getUrl()` for each.
   - Fetch roommate profiles: `ctx.db.query("listing_roommate_profiles").withIndex("by_listing_id", q => q.eq("listing_id", listing._id)).collect()`.
   - Fetch commute landmarks: `ctx.db.query("listing_commute_landmarks").withIndex("by_listing_id", q => q.eq("listing_id", listing._id)).collect()`.
   - Count inquiries: query `tenant_inquiries` by `listing_id` if the table exists, or return 0 if not yet implemented (P19 scope). Use a try/catch or conditional check.
   - Return shape: `{ listing: { ...listing, building_name, society_name, locality, flat_number }, photos: Array<{ ...photo, url: string | null }>, roommate_profiles: RoommateProfile[], commute_landmarks: CommuteLandmark[], inquiry_count: number }`.
5. Keep `getBySlugInternal` unchanged.
6. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/listings.ts` — `getBySlugPublic` query added
- [ ] `convex/http.ts` — `/api/listing/{slug}` endpoint updated to use `getBySlugPublic`

### Acceptance Criteria

1. `getBySlugPublic` returns `null` for missing slug or non-PUBLISHED listing.
2. Response includes full `photos`, `roommate_profiles`, `commute_landmarks`, and `inquiry_count` fields.
3. Photos are sorted by `display_order` and each item includes `url: string | null`.
4. `/api/listing/{slug}` uses `getBySlugPublic` and keeps existing caching headers/response semantics.
5. `getBySlugInternal` behavior remains unchanged.
6. TypeScript compiles with no new errors.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/listings.ts` and `convex/http.ts`.

### Out of Scope

- Tenant inquiry form (P19 scope)
- Roommate profiles display component (P17-E03)
- Commute calculator component (P17-E03)
- Location map component (P17-E03)
- Tenant testimonials component (P17-E03)
- Pricing block component (P17-E02)
- Amenities section component (P17-E02)

---

## T03: SEO Utilities & Page Route Enhancement

### Objective

Create `src/lib/seo.ts` with helpers for generating listing page metadata (title, description, og:image) and schema.org JSON-LD for `@type: Apartment`. Enhance the existing `src/app/listing/[slug]/page.tsx` to use `getBySlugPublic` and add `generateMetadata` + JSON-LD.

### Required Reading

- `notes/features/12-property-detail.md` — "SEO" section
- `src/app/listing/[slug]/page.tsx` — existing route implementation to enhance in-place
- `convex/http.ts` — `/api/listing/{slug}` endpoint contract consumed by metadata fetch
- `lib/money.ts` — `formatINR()` utility for price display

### Key Rules

1. Create `src/lib/seo.ts` with:
   - `generateListingMetadata(listing)` → `{ title, description, openGraph: { images } }` for Next.js `generateMetadata`.
   - Title format: `{bhk} {furnishing} in {society}, {locality} — ₹{rent}/mo | DemoRentals`
   - Description: first 160 chars of listing description, or auto-generated fallback.
   - OG image: cover photo URL (first photo sorted by `display_order`).
   - `generateListingJsonLd(listing, photos)` → JSON-LD object with `@type: Apartment`, `name`, `description`, `image`, `offers.price` (rent in rupees), `offers.priceCurrency: "INR"`, `address`.
2. Enhance `src/app/listing/[slug]/page.tsx`:
   - Add `export async function generateMetadata({ params })` that fetches listing via the HTTP endpoint `/api/listing/{slug}` and returns metadata using `generateListingMetadata`.
   - Add JSON-LD `<script type="application/ld+json">` in the page component.
   - The page should still use the existing route `/listing/[slug]` — do NOT create a new route.
3. Use `lib/money.ts` `formatINR()` for price display in meta tags.
4. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/lib/seo.ts` — `generateListingMetadata()`, `generateListingJsonLd()` functions
- [ ] `src/app/listing/[slug]/page.tsx` — enhanced with `generateMetadata` + JSON-LD

### Acceptance Criteria

1. `generateMetadata` is exported from `src/app/listing/[slug]/page.tsx` and uses `/api/listing/{slug}`.
2. Metadata title/description/OG image are produced through `src/lib/seo.ts` helpers.
3. JSON-LD script renders in the page output with `@type: Apartment` payload.
4. Existing route remains `/listing/[slug]`; no duplicate property/listings route is created.
5. TypeScript compiles with no new errors.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/lib/seo.ts` and `src/app/listing/[slug]/page.tsx`.

### Out of Scope

- Tenant inquiry form (P19 scope)
- Roommate profiles display component (P17-E03)
- Commute calculator component (P17-E03)
- Location map component (P17-E03)
- Tenant testimonials component (P17-E03)
- Pricing block component (P17-E02)
- Amenities section component (P17-E02)

---

## T04: Enhanced Photo Gallery & Contact Sidebar

### Objective

Create `src/components/tenant/photo-gallery.tsx` (enhanced photo gallery with thumbnails, fullscreen modal, swipe on mobile) and `src/components/tenant/contact-sidebar.tsx` (sticky desktop sidebar, mobile bottom bar with expandable modal, WhatsApp deep link, phone button, inquiry count display). These replace/enhance the existing P06 photo-gallery and contact-form components.

### Required Reading

- `src/app/listing/[slug]/components/photo-gallery.tsx` — existing gallery baseline to supersede
- `src/app/listing/[slug]/components/contact-form.tsx` and `src/app/listing/[slug]/components/whatsapp-button.tsx` — current contact interactions
- `notes/features/12-property-detail.md` — "Property Gallery" and "Contact Sidebar" sections
- `notes/13-constants-reference.md` — "Contact Method" conventions and WhatsApp/phone usage

### Key Rules

1. Create `src/components/tenant/photo-gallery.tsx` — `"use client"`:
   - Props: `{ photos: Array<{ url: string | null, display_order: number }> }`.
   - Main image viewer with prev/next arrows.
   - Thumbnail strip below main image (scrollable on mobile).
   - Fullscreen modal on click/tap (uses shadcn Dialog).
   - Swipe gestures in fullscreen (use `onTouchStart`/`onTouchEnd` for basic swipe detection — no extra dependencies).
   - If no photos, show placeholder div with gradient background and "Photos coming soon" text.
   - Cover photo (lowest `display_order`) shown first.
2. Create `src/components/tenant/contact-sidebar.tsx` — `"use client"`:
   - Props: `{ listing: { building_name, flat_number, society_name, locality, slug }, inquiryCount: number }`.
   - Desktop (lg+): Sticky sidebar (`position: sticky, top: 1rem`) at ~320px width.
   - Mobile: Fixed bottom bar (`fixed bottom-0`) with "Contact" button → opens full-screen Sheet with contact options.
   - Contents: WhatsApp deep link button (uses `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` env var, pre-filled message with property info), Phone call button, Inquiry count display ("X people inquired").
   - WhatsApp link format: `https://wa.me/{phone}?text=Hi, I'm interested in {building} {flat} at {locality}`.
   - Visit scheduling form placeholder with comment `// P19: tenant inquiry form goes here`.
3. No extra npm dependencies for gallery. Use CSS transitions + shadcn Dialog.
4. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/photo-gallery.tsx` — enhanced gallery with thumbnails + fullscreen
- [ ] `src/components/tenant/contact-sidebar.tsx` — sticky sidebar (desktop) + bottom bar (mobile)

### Acceptance Criteria

1. Gallery renders cover photo first, supports previous/next navigation, and opens fullscreen modal.
2. Gallery fullscreen supports touch swipe without additional dependencies.
3. Empty photo set renders placeholder state with gradient + "Photos coming soon" copy.
4. Contact sidebar renders sticky desktop panel and mobile fixed bottom CTA with Sheet expansion.
5. WhatsApp and phone actions generate valid deep links; inquiry count text is displayed.
6. Placeholder comment for P19 inquiry form is present.
7. TypeScript compiles with no new errors.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/photo-gallery.tsx` and `src/components/tenant/contact-sidebar.tsx`.

### Out of Scope

- Tenant inquiry form (P19 scope)
- Roommate profiles display component (P17-E03)
- Commute calculator component (P17-E03)
- Location map component (P17-E03)
- Tenant testimonials component (P17-E03)
- Pricing block component (P17-E02)
- Amenities section component (P17-E02)

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
