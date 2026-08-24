# Phase 17: Property Detail (P17)

## Overview

Enhance the existing property detail page at `/listing/[slug]` (created in P06) with full-richness content: photo gallery, pricing breakdown, amenities, house rules, commute calculator, location map, roommate profiles, tenant testimonials, and sticky contact sidebar. Add `getBySlugPublic` query for enriched public data, SEO metadata, and schema.org JSON-LD. UI built with shadcn/ui components.

**Key Decision (Oracle-validated)**: Enhance the existing `/listing/[slug]` route — do NOT create a second route at `/listings/[slug]` or `/property/[slug]`. The P06 page at `src/app/listing/[slug]/page.tsx` is the canonical detail route.

## Dependencies

- P06 (existing listing detail page at `/listing/[slug]` and `getBySlugInternal` query)
- P16 (browse page links to detail via property cards at `/listing/{slug}`)

## Key Documentation

| Doc                                                                          | Sections to Read                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [features/12-property-detail.md](../../notes/features/12-property-detail.md) | Full file — all detail page sections                                          |
| [02-data-models.md](../../notes/02-data-models.md)                           | Listing, listing_photos, listing_commute_landmarks, listing_roommate_profiles |
| [10-convex-schema.md](../../notes/10-convex-schema.md)                       | Related listing tables                                                        |
| [13-constants-reference.md](../../notes/13-constants-reference.md)           | Amenity lists, landmark categories                                            |

## Epics

| ID      | Title                                                                       | Tasks | Status | Depends On |
| ------- | --------------------------------------------------------------------------- | ----- | ------ | ---------- |
| P17-E01 | [Property Detail Backend & Route](P17-E01-property-detail-backend-route.md) | 4     | done   | [P06-E04]  |
| P17-E02 | [Pricing, Amenities & Rules](P17-E02-pricing-amenities-rules.md)            | 3     | done   | [P17-E01]  |
| P17-E03 | [Commute, Map & Roommates](P17-E03-commute-map-roommates.md)                | 4     | done   | [P17-E01]  |

**Total: 3 epics, 11 tasks**

## Dependency Graph

```
P06-E04 ──► P17-E01 ──┬──► P17-E02
                       │
                       └──► P17-E03
```

**Parallel note**: E02 (Pricing, Amenities & Rules) and E03 (Commute, Map & Roommates) can run in parallel once E01 (Backend & Route) is complete. Both consume the same `getBySlugPublic` query. No cross-dependencies between E02 and E03.

## Completion Criteria

- [x] `/listing/[slug]` route enhanced with SSR (server-side data fetch via `getBySlugPublic`)
- [x] Schema drift resolved: `listing_roommate_profiles` and `listing_commute_landmarks` tables added to `convex/schema.ts`
- [x] `house_rules` field added to `listings` table schema
- [x] `getBySlugPublic` query returns full listing + photos + roommates + landmarks + inquiry count
- [x] Photo gallery displays with thumbnail navigation and fullscreen mode
- [x] Overview block shows rent, deposit, and move-in cost summary
- [x] Amenities section splits available/unavailable with icons (all 16 amenities)
- [x] House rules display as numbered list
- [x] Commute calculator shows distance/time grouped by landmark category
- [x] Location map embeds (Google Maps address-based iframe, no API key)
- [x] Roommate profiles section renders (conditional — only when profiles exist)
- [x] Tenant testimonials block displays (hardcoded static V1)
- [x] Sticky contact sidebar with WhatsApp deep link works (desktop sticky, mobile bottom bar)
- [x] SEO meta tags (title, description, og:image) and JSON-LD present
- [x] Build succeeds (`npm run build`)

## Files Created / Modified by This Phase

```
rental-platform-os/
├── convex/
│   ├── schema.ts                        # Modified: house_rules field, +2 tables
│   ├── listings.ts                      # Modified: getBySlugPublic query added
│   └── http.ts                          # Modified: endpoint updated to use getBySlugPublic
├── src/app/listing/[slug]/
│   ├── page.tsx                         # Modified: metadata + JSON-LD + enriched payload wiring
│   ├── actions.ts                       # New: contact form + WhatsApp tracking server actions
│   └── components/
│       ├── photo-gallery.tsx            # New: enhanced gallery with thumbnails + fullscreen
│       ├── pricing-breakdown.tsx        # New: pricing + move-in summary
│       ├── amenities-grid.tsx           # New: 16-amenity available/unavailable grid
│       ├── property-description.tsx     # New: expandable description block
│       ├── house-rules.tsx              # New: numbered house rules list
│       ├── commute-calculator.tsx       # New: landmarks grouped by category
│       ├── location-map.tsx             # New: Google Maps embed + "Open in Maps" CTA
│       ├── roommate-profiles.tsx        # New: roommate cards with lifestyle tags
│       ├── static-testimonials.tsx      # New: static testimonials block
│       ├── contact-sidebar.tsx          # New: sticky sidebar (desktop) + bottom bar (mobile)
│       ├── similar-listings.tsx         # New: related property strip
│       ├── share-button.tsx             # New: native share/copy affordance
│       ├── breadcrumb-nav.tsx           # New: listing breadcrumb trail
│       └── archived-notice.tsx          # New: unavailable listing fallback card
```

## Scope Boundaries

### IN This Phase

- Schema reconciliation (add missing tables + house_rules field)
- `getBySlugPublic` public query with full enrichment
- SEO metadata (`generateMetadata`) and schema.org JSON-LD (`@type: Apartment`)
- Enhanced photo gallery (thumbnails, fullscreen, swipe)
- Pricing breakdown (rent, deposit, maintenance, move-in cost)
- Amenities grid (16 amenities, available/unavailable split)
- Description + house rules display
- Commute calculator (landmarks grouped by category, static data)
- Location map (Google Maps address-based iframe, no API key)
- Roommate profiles (conditional, from `listing_roommate_profiles`)
- Tenant testimonials (hardcoded static V1)
- Sticky contact sidebar (WhatsApp + phone + inquiry count)

### NOT In This Phase

- Tenant inquiry form on detail page → **P19**
- Tenant tools (rent calculator, commute estimator, roommate quiz) → **P18**
- Live directions API / geocoding → **V2**
- Admin-managed testimonials → **V2**
- Per-listing user-generated reviews → **V2**
- Nearby places from external API → **V2**
- Markdown rendering for description → **V2**
