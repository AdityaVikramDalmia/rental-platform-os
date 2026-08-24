---
id: P17-E03
title: Commute, Map & Roommates
phase: 17
status: pending
depends_on: ["P17-E01"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P17-E03: Commute, Map & Roommates

## Overview

Build the commute calculator, location map with nearby places, roommate profiles, and tenant testimonials components for the property detail page. These are display-only client components receiving data from the `getBySlugPublic` query (E01). All components go in `src/components/tenant/` and are composed in the existing `/listing/[slug]` page.

## Prerequisites

- **Read first**: [P17-E01 Completion Summary](P17-E01-property-detail-backend-route.md#completion-summary) — `getBySlugPublic` returns `commute_landmarks: Array<{ landmark_name, distance_text, time_text, landmark_category }>` and `roommate_profiles: Array<{ name_alias, age_range, profession, interests, lifestyle_tags }>`.
- `getBySlugPublic` also returns `listing.society_name` and `listing.locality` for map address composition.
- `notes/features/12-property-detail.md` — sections 5-8 (`Commute Calculator`, `Location Map & Nearby Places`, `Roommate Compatibility Profiles`, `Tenant Testimonials`).
- `notes/13-constants-reference.md` — landmark category literals: `TECH_HUB`, `METRO_STATION`, `HOSPITAL`, `SCHOOL`, `MALL`, `OTHER`.
- `notes/10-convex-schema.md` — `listing_roommate_profiles` (line ~768), `listing_commute_landmarks` (line ~777).
- `src/components/ui/card.tsx`, `src/components/ui/badge.tsx` — shadcn component patterns used in this epic.

## Task Queue

- [ ] P17-E03-T01: Commute Calculator Component
- [ ] P17-E03-T02: Location Map & Nearby Places Component
- [ ] P17-E03-T03: Roommate Profiles Component
- [ ] P17-E03-T04: Tenant Testimonials Component

---

## T01: Commute Calculator Component

### Objective

Create `src/components/tenant/commute-calculator.tsx` — displays pre-configured commute landmarks grouped by category, each showing name, distance, and time.

### Required Reading

- `notes/features/12-property-detail.md` — section 5 (`Commute Calculator`)
- `notes/13-constants-reference.md` — landmark category enum values (`TECH_HUB`, `METRO_STATION`, `HOSPITAL`, `SCHOOL`, `MALL`, `OTHER`)
- `notes/10-convex-schema.md` — `listing_commute_landmarks` table definition (line ~777)
- `src/components/ui/card.tsx` — shadcn Card API

### Key Rules

1. Create `src/components/tenant/commute-calculator.tsx` with `"use client"` and props `{ landmarks: Array<{ landmark_name: string, distance_text: string, time_text: string, landmark_category?: string }> }`.
2. If `landmarks` is empty, return `null` (hide section entirely). Section heading must be `<h2>Commute &amp; Nearby</h2>`.
3. Group landmarks by `landmark_category` with fallback to `OTHER` when category is missing.
4. Category display order must be: `TECH_HUB`, `METRO_STATION`, `HOSPITAL`, `SCHOOL`, `MALL`, `OTHER`.
5. Category label + icon mapping must be: `TECH_HUB` -> `Building2` / `Tech Hubs`, `METRO_STATION` -> `Train` / `Metro Stations`, `HOSPITAL` -> `Cross` / `Hospitals`, `SCHOOL` -> `GraduationCap` / `Schools`, `MALL` -> `ShoppingCart` / `Shopping`, `OTHER` -> `MapPin` / `Other Places`.
6. Render each category in a shadcn Card and each landmark as `{landmark_name} — {distance_text}, {time_text}` row.
7. Use Lucide React icons already present in project; add no dependencies.
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/commute-calculator.tsx` — landmarks grouped by category

### Acceptance Criteria

1. Landmarks are grouped by category in the required display order.
2. Each landmark row shows name, distance, and time.
3. Empty landmarks array returns `null`.
4. Category headers use Lucide React icons with required mappings.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/commute-calculator.tsx`.

### Out of Scope

- Geocoding, lat/lng coordinates, or live directions API integration
- Nearby places fetched from external APIs
- Pricing, amenities, gallery, sidebar, or inquiry form work

---

## T02: Location Map & Nearby Places Component

### Objective

Create `src/components/tenant/location-map.tsx` — embeds a Google Maps iframe using the property's address text (no lat/lng needed), plus an "Open in Google Maps" CTA link.

### Required Reading

- `notes/features/12-property-detail.md` — section 6 (`Location Map & Nearby Places`)
- `notes/10-convex-schema.md` — listing context fields consumed from `getBySlugPublic`
- `src/components/ui/card.tsx` — card/container styling patterns

### Key Rules

1. Create `src/components/tenant/location-map.tsx` with `"use client"` and props `{ society_name: string | null, locality: string | null }`.
2. If both `society_name` and `locality` are `null`, return `null` (hide section).
3. Build address string with `${society_name ?? ''}, ${locality ?? ''}` then `.trim()`. If trimmed address is empty, return `null`.
4. Section heading must be `<h2>Location</h2>`.
5. Embed iframe URL must be `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`.
6. Iframe attributes: `width="100%"`, `height={400}`, `style={{ border: 0 }}`, `loading="lazy"`, `referrerPolicy="no-referrer-when-downgrade"`, `allowFullScreen`.
7. Add "Open in Google Maps" link below map: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` with new-tab behavior.
8. Map container styling must include `rounded-lg overflow-hidden shadow-sm`.
9. No API key, no geocoding infra, no extra dependencies, no `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/location-map.tsx` — Google Maps embed + "Open in Maps" CTA

### Acceptance Criteria

1. Map iframe renders with encoded address query from `society_name` + `locality`.
2. "Open in Google Maps" link opens a valid search URL in a new tab.
3. `null` society + `null` locality returns `null`.
4. Empty address string after trim returns `null`.
5. No API key is required for V1 map behavior.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/location-map.tsx`.

### Out of Scope

- Adding lat/lng to schema or introducing geocoding pipelines
- External nearby-places API integration
- Admin-managed map configuration UI

---

## T03: Roommate Profiles Component

### Objective

Create `src/components/tenant/roommate-profiles.tsx` — displays roommate profile cards for shared accommodations, only rendered when profiles exist.

### Required Reading

- `notes/features/12-property-detail.md` — section 7 (`Roommate Compatibility Profiles`)
- `notes/10-convex-schema.md` — `listing_roommate_profiles` table definition (line ~768)
- `src/components/ui/card.tsx` — shadcn Card usage
- `src/components/ui/badge.tsx` — shadcn Badge usage

### Key Rules

1. Create `src/components/tenant/roommate-profiles.tsx` with `"use client"` and props `{ profiles: Array<{ name_alias: string, age_range?: string, profession?: string, interests?: string[], lifestyle_tags?: string[] }> }`.
2. If `profiles` is empty, return `null` (hide section entirely).
3. Section heading must be `<h2>Current Roommates</h2>` and include disclaimer text below heading: `This info is provided by current tenants` with muted + italic styling.
4. Render profiles as shadcn Cards in responsive layout: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`.
5. Each card must show required `name_alias` (title), optional `age_range` + `profession` row, optional interests display, and optional lifestyle tags rendered as shadcn Badge components.
6. Handle all optional fields defensively; render rows only when data exists.
7. No extra dependencies. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/roommate-profiles.tsx` — roommate cards with lifestyle tags

### Acceptance Criteria

1. Empty profiles array returns `null`.
2. Every profile card shows `name_alias`; optional fields appear only when present.
3. Lifestyle tags render as shadcn Badges.
4. Disclaimer text is visible under section heading.
5. Layout is responsive with 1/2/3 column behavior across breakpoints.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/roommate-profiles.tsx`.

### Out of Scope

- Compatibility scoring algorithms or quiz logic
- Persisting roommate data edits from tenant UI
- Testimonial content or map embed implementation

---

## T04: Tenant Testimonials Component

### Objective

Create `src/components/tenant/tenant-testimonials.tsx` — displays static/hardcoded V1 testimonials as a horizontal carousel on mobile and grid on desktop.

### Required Reading

- `notes/features/12-property-detail.md` — section 8 (`Tenant Testimonials`)
- `src/components/ui/card.tsx` — testimonial card container patterns
- `src/components/ui/badge.tsx` — locality badge patterns

### Key Rules

1. Create `src/components/tenant/tenant-testimonials.tsx` with `"use client"` and no props.
2. Define a typed `TESTIMONIALS` constant array inside the component file with 3-5 hardcoded testimonials, each having `name`, `rating` (1-5), `comment`, `locality`.
3. Include realistic Bangalore-area testimonials, including:
   - `Riya S.` / `5` / `Found my dream apartment through DemoRentals. The process was seamless!` / `Demo District`
   - `Amit K.` / `4` / `Great selection of verified properties. Saved me weeks of searching.` / `HSR Layout`
   - `Priya M.` / `5` / `The virtual tour feature helped me decide without visiting 10 places.` / `Indiranagar`
4. Section heading must be `<h2>What Tenants Say</h2>`.
5. Render each testimonial card with name, star rating (Lucide `Star` icon filled for earned stars and outline for remaining), comment text, and locality badge.
6. Mobile layout must be horizontal snap carousel: `overflow-x-auto flex gap-4 snap-x snap-mandatory` with each card `snap-center min-w-[280px]`.
7. Desktop layout must switch to 3-column grid: `md:grid md:grid-cols-3 gap-4`.
8. This is V1 static content only: no DB table, no admin management, no extra dependencies.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/tenant-testimonials.tsx` — static testimonials with carousel/grid

### Acceptance Criteria

1. 3-5 hardcoded testimonials render from local typed constant data.
2. Star rating renders correctly (example: rating 4 shows 4 filled + 1 outline).
3. Mobile uses horizontal scroll + snap behavior.
4. Desktop uses 3-column grid.
5. No database read/write path is introduced for testimonials.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/tenant-testimonials.tsx`.

### Out of Scope

- Admin-managed testimonials CMS flow
- Per-listing testimonials persisted in Convex
- Backend schema/mutation work for testimonials

---

## Out of Scope (All Tasks)

- Photo gallery (E01-T04)
- Contact sidebar (E01-T04)
- Pricing block (E02)
- Amenities section (E02)
- Property description / house rules (E02)
- Tenant inquiry form (P19)
- Live directions API for commute (V2)
- Geocoding / lat/lng coordinates (V2)
- Admin-managed testimonials (V2)
- Per-listing testimonials from DB (V2)
- Nearby places from external API (V2 — only map embed in V1)

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
