---
id: P18-E01
title: Rent Calculator & Commute Estimator
phase: 18
status: pending
depends_on: ["P15-E02"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P18-E01: Rent Calculator & Commute Estimator

## Overview

Add the shadcn/ui Slider component, build a Rent Calculator with 4 sliders and real-time computed outputs, build a generic Commute Estimator (Version A — area-to-area static lookup with transport modes), and create a Tools Hub page at `src/app/(public)/tools/page.tsx` with a tabbed interface. All tools are client-side only — no Convex backend queries or mutations.

## Prerequisites

- **Read first**: [P15-E02 Completion Summary](../phase-15-public-pages/P15-E02-public-pages-frontend.md#completion-summary) — P15-E02 creates the `(public)` route group with `layout.tsx` (ConvexClientProvider, public header, footer). The tools page lives under this layout.
- `src/components/ui/tabs.tsx` exists (shadcn Tabs for the tabbed interface).
- `src/components/ui/slider.tsx` does NOT exist yet — T01 must add it.
- `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `src/components/ui/separator.tsx` exist.
- `lib/money.ts` exists with `formatINR()` for paise → ₹ display.
- `notes/features/16-tenant-tools.md` — full feature spec for all 4 tools.

## Task Queue

- [ ] P18-E01-T01: shadcn Slider & Rent Calculator
- [ ] P18-E01-T02: Generic Commute Estimator
- [ ] P18-E01-T03: Tools Hub Page

---

## T01: shadcn Slider & Rent Calculator

### Objective

Add the shadcn/ui Slider component to the project. Create the Rent Calculator component with 4 slider inputs and real-time computed outputs, plus the pure logic module.

### Required Reading

- `notes/features/16-tenant-tools.md` — sections 1 (Rent Calculator) and 2 (Commute Estimator)
- `lib/money.ts` — `formatINR()` for paise → ₹ display
- `src/components/ui/card.tsx` — result card composition pattern
- `src/components/ui/slider.tsx` (after creation) — shadcn slider usage pattern for value arrays

### Key Rules

1. Add `src/components/ui/slider.tsx` — the standard shadcn/ui Slider based on `@radix-ui/react-slider`. The implementing agent should run `npx shadcn@latest add slider` OR manually create the file following the shadcn pattern already used by other UI components in the project.
2. Create `src/lib/rent-calculator.ts` — pure TypeScript functions (no React):
   - `calculateMoveInCost({ rent, depositMonths, maintenance, brokerageMonths })` → `{ depositAmount, brokerageAmount, firstMonthTotal, totalMoveInCost, monthlyRecurringCost }`.
   - All money in paise internally. Inputs: rent (paise), depositMonths (number), maintenance (paise), brokerageMonths (number, supports 0.5 step).
   - Formulas from spec: `depositAmount = rent × depositMonths`, `brokerageAmount = rent × brokerageMonths`, `totalMoveInCost = depositAmount + rent + maintenance + brokerageAmount`, `monthlyRecurringCost = rent + maintenance`.
3. Create `src/components/tenant/rent-calculator.tsx` — `"use client"`:
   - 4 Slider inputs with live value labels (use `tabular-nums` CSS for stable digit widths):
     - Monthly Rent: ₹5,000 - ₹1,00,000, default ₹20,000, step ₹1,000
     - Security Deposit (months): 1 - 12, default 2, step 1
     - Monthly Maintenance: ₹0 - ₹10,000, default ₹2,000, step ₹500
     - Brokerage (months): 0 - 2, default 1, step 0.5
   - Important: Slider values for rent and maintenance are in RUPEES for user-friendliness (₹5,000 - ₹1,00,000). Convert to paise (× 100) before passing to `calculateMoveInCost`. Display outputs via `formatINR()` from `lib/money.ts`.
   - Real-time computed outputs using `useMemo`:
     - Security Deposit Amount: `formatINR(depositAmount)`
     - Brokerage Amount: `formatINR(brokerageAmount)`
     - Total Move-In Cost: `formatINR(totalMoveInCost)` — bold, accent color
     - Monthly Recurring Cost: `formatINR(monthlyRecurringCost)` — bold
   - Layout: Sliders on left/top (mobile), computed results on right/bottom in shadcn Card.
   - Responsive: stacked on mobile, side-by-side on `md:` breakpoint.
4. No `as any`, no `@ts-ignore`. No external dependencies beyond shadcn Slider (Radix).

### Deliverables

- [ ] `src/components/ui/slider.tsx` — shadcn Slider component added
- [ ] `src/lib/rent-calculator.ts` — pure calculation functions
- [ ] `src/components/tenant/rent-calculator.tsx` — slider-based rent calculator component

### Acceptance Criteria

1. Slider component renders and fires `onValueChange` on drag.
2. All 4 sliders have correct ranges, defaults, steps, and live value labels.
3. Computed outputs update in real-time as sliders move.
4. Formulas match feature spec exactly.
5. Edge cases: `maintenance=0` produces `monthlyRecurringCost = rent` only; `brokerage=0` produces `brokerageAmount = 0` and reduces `totalMoveInCost` accordingly.
6. Money displayed in ₹ via `formatINR()`.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/ui/slider.tsx`, `src/lib/rent-calculator.ts`, and `src/components/tenant/rent-calculator.tsx`.

### Out of Scope

- Roommate Quiz implementation (E02 scope)
- Rental Checklist implementation (E02 scope)
- Generic commute estimator UI/data (T02)
- Tools hub routing and tabbed page shell (T03)

---

## T02: Generic Commute Estimator

### Objective

Create the generic Commute Estimator (Version A) — a standalone tool where users select two Bangalore areas and a transport mode to see estimated distance and travel time from a static lookup table.

### Required Reading

- `notes/features/16-tenant-tools.md` — section 2 (Commute Estimator)
- `src/components/ui/select.tsx` — shadcn Select pattern for area dropdowns
- `src/components/ui/button.tsx` — mode chip/button variants
- `src/components/ui/card.tsx` — result container pattern
- `tasks/phase-17-property-detail/P17-E03-commute-map-roommates.md` — Version B scope separation context

### Key Rules

1. Create `src/lib/commute-data.ts` — static data module:
   - Define 8-10 Bangalore areas: Demo District, HSR Layout, Indiranagar, Whitefield, Electronic City, Marathahalli, JP Nagar, Bannerghatta Road, Yelahanka, MG Road.
   - Define a base distance/time matrix: `Record<string, Record<string, { distance_km: number, time_minutes: number }>>`. Only need one direction (symmetrical). Store base values for Car mode.
   - Define transport mode multipliers: `Car: 1.0×`, `Bike: 0.8×`, `Bus: 1.5×`, `Metro: varies (0.7× for metro-connected areas, 1.2× for others)`, `Walk: time = distance / 5 km/h`.
   - Export function `estimateCommute(from: string, to: string, mode: TransportMode)` → `{ distance_km: number, time_text: string }`.
   - Keep matrix compact: define 15-20 common pairs covering the 8-10 areas. For undefined pairs, return a "Route not available" fallback.
2. Create `src/components/tenant/commute-estimator.tsx` — `"use client"`:
   - Props: none (standalone tool, all data is local).
   - Two Select dropdowns: "From" area and "To" area (populated from area list).
   - Transport mode selector: 5 buttons/chips (Car, Bike, Bus, Metro, Walk) with icons.
   - Result display: distance in km + estimated time. Show below selectors.
   - If same area selected for both, show "Please select different areas".
   - If route not in matrix, show "Estimate not available for this route".
   - Use shadcn Select for dropdowns, shadcn Button for mode chips, shadcn Card for result.
3. NOTE: This is Version A (generic, standalone). P17-E03-T01 builds Version B (`commute-calculator.tsx`) using `listing_commute_landmarks`. They are separate components with NO shared code — keep them independent.
4. No `as any`, no `@ts-ignore`. No external APIs. All data is static/hardcoded.

### Deliverables

- [ ] `src/lib/commute-data.ts` — area list, distance matrix, transport multipliers, `estimateCommute()` function
- [ ] `src/components/tenant/commute-estimator.tsx` — area selectors + transport mode + result display

### Acceptance Criteria

1. Both Select dropdowns populate with all areas.
2. Transport mode buttons toggle correctly (one active at a time).
3. Result updates when any input changes (area or mode).
4. Same-area selection shows appropriate message.
5. Unknown route shows fallback message.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/lib/commute-data.ts` and `src/components/tenant/commute-estimator.tsx`.

### Out of Scope

- Listing-specific commute calculator (Version B in P17-E03)
- Roommate Quiz implementation (E02 scope)
- Rental Checklist implementation (E02 scope)
- Server-side persistence or external directions APIs

---

## T03: Tools Hub Page

### Objective

Create the Tools Hub page at `src/app/(public)/tools/page.tsx` with a tabbed interface (shadcn Tabs) hosting the Rent Calculator and Commute Estimator, plus placeholder tabs for Roommate Quiz and Rental Checklist (to be filled in E02).

### Required Reading

- `notes/features/16-tenant-tools.md` — tools hub page composition and section intent
- `src/components/ui/tabs.tsx` — shadcn Tabs implementation used in this project
- `src/components/ui/separator.tsx` — section separation pattern
- `tasks/phase-15-public-pages/P15-E02-public-pages-frontend.md#completion-summary` — `(public)` layout context

### Key Rules

1. Create `src/app/(public)/tools/page.tsx` — server component for metadata:
   - `export const metadata` with title `"Rental Tools | DemoRentals"`, description about interactive tools.
   - Renders `<ToolsPageClient />`.
2. Create `src/app/(public)/tools/tools-page-client.tsx` — `"use client"`:
   - Uses shadcn Tabs with 3 tabs in the "Interactive Tools" section:
     - "Rent Calculator" tab → renders `<RentCalculator />`
     - "Commute Estimator" tab → renders `<CommuteEstimator />`
     - "Roommate Quiz" tab → placeholder `<div>` with "Coming soon" text and comment `// P18-E02-T01: replace with RoommateQuiz component`
   - Below the tabbed section, a separate "Rental Checklist" section:
     - Section heading: `<h2>Rental Checklist</h2>`
     - Placeholder `<div>` with "Coming soon" text and comment `// P18-E02-T02: replace with RentalChecklist component`
   - The tabbed section and checklist section are visually distinct (separator between them).
   - Page layout: centered max-width container, heading "Interactive Rental Tools" with subtitle.
   - Responsive: tabs stack nicely on mobile.
3. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/app/(public)/tools/page.tsx` — server component with metadata
- [ ] `src/app/(public)/tools/tools-page-client.tsx` — client component with Tabs + placeholder sections

### Acceptance Criteria

1. Page accessible at `/tools` (under `(public)` route group).
2. Rent Calculator and Commute Estimator tabs work and render their components.
3. Quiz tab shows placeholder with TODO comment.
4. Checklist section shows placeholder with TODO comment.
5. Page metadata includes title and description.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(public)/tools/page.tsx` and `src/app/(public)/tools/tools-page-client.tsx`.

### Out of Scope

- Roommate Quiz implementation (E02 scope)
- Rental Checklist implementation (E02 scope)
- Convex backend queries/mutations for tool state
- How-It-Works page integration changes

---

## Out of Scope for all tasks

- Roommate Quiz (E02 scope)
- Rental Checklist (E02 scope)
- Listing-specific commute calculator — Version B (P17-E03 scope)
- Server-side persistence of any tool state (V2)
- Live directions API (V2)
- Integration with How-It-Works page (P15 builds the page; P18 tools are linked from there)

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
