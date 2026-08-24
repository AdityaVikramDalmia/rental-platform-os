---
id: P17-E02
title: Pricing, Amenities & Rules
phase: 17
status: pending
depends_on: ["P17-E01"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P17-E02: Pricing, Amenities & Rules

## Overview

Build the pricing breakdown block, amenities grid, and property description + house rules components for the property detail page. These are display-only client components that receive data from the `getBySlugPublic` query (E01). All components go in `src/components/tenant/` and are composed in the existing `/listing/[slug]` page.

## Prerequisites

- **Read first**: [P17-E01 Completion Summary](P17-E01-property-detail-backend-route.md#completion-summary) — `getBySlugPublic` returns the full listing with `rent_monthly`, `deposit`, `maintenance`, `bhk_config`, `furnishing`, `carpet_area_sqft`, `available_from`, `amenities`, `description`, `house_rules`, plus `building_name`, `society_name`, `locality`, `flat_number`.
- Money values are in paise. Use `formatINR()` from `lib/money.ts` for every displayed money value.
- Reference `notes/13-constants-reference.md` amenity set (16 total): `gym`, `pool`, `garden`, `security`, `lift`, `power_backup`, `clubhouse`, `parking`, `play_area`, `jogging_track`, `intercom`, `cctv`, `fire_safety`, `water_supply_24x7`, `gas_pipeline`, `rain_water_harvesting`.

## Task Queue

- [ ] P17-E02-T01: Pricing Block Component
- [ ] P17-E02-T02: Amenities Section Component
- [ ] P17-E02-T03: Property Description & House Rules Component

---

## T01: Pricing Block Component

### Objective

Create `src/components/tenant/pricing-block.tsx` — displays property title (building, flat, society), location, property type/BHK/furnishing, pricing breakdown (monthly rent, security deposit, maintenance, computed move-in cost), available from date, and carpet area.

### Required Reading

- `notes/features/12-property-detail.md` — "2. Property Overview & Pricing" section
- `notes/10-convex-schema.md` — `listings` table fields: `rent_monthly`, `deposit`, `maintenance`, `bhk_config`, `furnishing`, `carpet_area_sqft`, `available_from`, `parking`
- `lib/money.ts` — `formatINR()`
- `lib/dates.ts` — `formatDate()`
- `src/components/ui/card.tsx` and `src/components/ui/badge.tsx` — shadcn patterns to match

### Key Rules

1. Create `src/components/tenant/pricing-block.tsx` as a `"use client"` component with props:
   ```typescript
   {
     listing: {
       building_name: string | null;
       flat_number: string | null;
       society_name: string | null;
       locality: string | null;
       bhk_config: string;
       furnishing: string;
       rent_monthly: number;
       deposit: number;
       maintenance: number | undefined;
       carpet_area_sqft: number | undefined;
       available_from: number;
       parking_type: string | undefined;
     }
   }
   ```
2. Layout requirements:
   - Title in `<h1>`: `{building_name} {flat_number}, {society_name}` with null-safe concatenation.
   - Location below title: `{locality}` in muted styling.
   - Meta row with BHK badge, Furnishing badge, and carpet area (`{area} sqft`) when available.
   - Pricing breakdown in shadcn Card:
     - Monthly Rent: `formatINR(rent_monthly)` in bold/large text.
     - Security Deposit: `formatINR(deposit)`.
     - Maintenance: `formatINR(maintenance)/mo` only when defined and `> 0`.
     - Separator line.
     - Move-in Cost total in accent color: `rent_monthly + deposit + (maintenance ?? 0)`.
   - Availability: show green "Available Now" badge when `available_from <= Date.now()`, otherwise "Available from {formatted date}".
   - Parking row shown only when `parking_type` is defined.
3. Use `formatINR()` from `lib/money.ts` for every money value (all values are in paise).
4. Use `formatDate()` from `lib/dates.ts` when available; fallback allowed: `new Date(ms).toLocaleDateString("en-IN")`.
5. Use shadcn `Card` and `Badge` components (no custom replacements).
6. Handle nullable/optional values gracefully (skip missing title parts, hide carpet area when undefined).
7. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/pricing-block.tsx` — pricing breakdown with title, location, meta, pricing card, and availability

### Acceptance Criteria

1. Title renders building + flat + society with correct null handling.
2. All currency values use `formatINR()` output.
3. Move-in cost is computed correctly: `rent_monthly + deposit + (maintenance ?? 0)`.
4. "Available Now" badge appears when `available_from <= Date.now()`.
5. Maintenance row is hidden when `maintenance` is undefined or 0.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/pricing-block.tsx`.

### Out of Scope

- Photo gallery (E01-T04)
- Contact sidebar (E01-T04)
- Commute calculator (E03)
- Location map (E03)
- Roommate profiles (E03)
- Tenant testimonials (E03)
- Tenant inquiry form (P19)
- Markdown rendering for description (V2)

---

## T02: Amenities Section Component

### Objective

Create `src/components/tenant/amenities-section.tsx` — displays a two-column grid of all 16 standard amenities, split into "Available" (green check) and "Not Available" (grey X) based on the listing's `amenities` array.

### Required Reading

- `notes/features/12-property-detail.md` — "3. Amenities Grid" section
- `notes/13-constants-reference.md` — "Amenities List (Listings)" section (all 16 keys)
- `notes/10-convex-schema.md` — `listings.amenities` field validator
- `src/components/ui/card.tsx` and `src/components/ui/badge.tsx` — style consistency references

### Key Rules

1. Create `src/components/tenant/amenities-section.tsx` as a `"use client"` component with props: `{ amenities: string[] | undefined }`.
2. Define the full 16-key amenity list in-component: `gym`, `pool`, `garden`, `security`, `lift`, `power_backup`, `clubhouse`, `parking`, `play_area`, `jogging_track`, `intercom`, `cctv`, `fire_safety`, `water_supply_24x7`, `gas_pipeline`, `rain_water_harvesting`.
3. Render all 16 amenities every time. If `amenities` is undefined or empty, all 16 must appear under "Not Available".
4. Layout requirements:
   - Section heading: `<h2>Amenities</h2>`.
   - Two groups: "Available" (green check visual) and "Not Available" (grey X visual).
   - Responsive grid: `grid grid-cols-2 gap-2` on mobile, `grid-cols-3` or `grid-cols-4` on larger screens.
   - Each amenity item shows icon + human-readable label.
5. Convert amenity keys to readable labels (examples: `power_backup` → "Power Backup", `water_supply_24x7` → "24/7 Water Supply").
6. Use Lucide React icons already in project for amenity mapping (e.g., Dumbbell, Waves, TreePine, Shield, ArrowUpFromLine, Zap).
7. No extra dependencies.
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/amenities-section.tsx` — amenity grid with available/unavailable split

### Acceptance Criteria

1. All 16 amenities are always rendered (available or not available).
2. Available amenities show green check styling.
3. Unavailable amenities show grey/muted styling.
4. All amenity keys display as human-readable labels.
5. Grid is responsive: 2 columns mobile, 3-4 columns desktop.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/amenities-section.tsx`.

### Out of Scope

- Photo gallery (E01-T04)
- Contact sidebar (E01-T04)
- Commute calculator (E03)
- Location map (E03)
- Roommate profiles (E03)
- Tenant testimonials (E03)
- Tenant inquiry form (P19)
- Markdown rendering for description (V2)

---

## T03: Property Description & House Rules Component

### Objective

Create `src/components/tenant/description-rules.tsx` — displays the listing description as rendered text and house rules as a numbered list. Two sections in one component.

### Required Reading

- `notes/features/12-property-detail.md` — "4. Property Description & House Rules" section
- `notes/10-convex-schema.md` — `listings.description` field
- `tasks/phase-17-property-detail/P17-E01-property-detail-backend-route.md` — E01 notes for `house_rules` shape in `getBySlugPublic`

### Key Rules

1. Create `src/components/tenant/description-rules.tsx` as a `"use client"` component with props: `{ description: string | undefined, houseRules: string[] | undefined }`.
2. Description section:
   - Heading: `<h2>About this Property</h2>`.
   - Render description as plain text in a `<p>` using `whitespace-pre-wrap`.
   - If description is undefined/empty, hide this entire section.
3. House rules section:
   - Heading: `<h2>House Rules</h2>`.
   - Render rules as numbered `<ol>` with `<li>` items.
   - If `houseRules` is undefined or empty, hide this entire section.
4. If both description and houseRules are empty/undefined, return `null`.
5. No markdown renderer and no extra dependencies.
6. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/description-rules.tsx` — description text + house rules list

### Acceptance Criteria

1. Description renders with preserved line breaks.
2. House rules render as a numbered ordered list.
3. Each section is hidden when its corresponding data is empty/undefined.
4. Component returns `null` when both are empty.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/description-rules.tsx`.

### Out of Scope

- Photo gallery (E01-T04)
- Contact sidebar (E01-T04)
- Commute calculator (E03)
- Location map (E03)
- Roommate profiles (E03)
- Tenant testimonials (E03)
- Tenant inquiry form (P19)
- Markdown rendering for description (V2)

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
