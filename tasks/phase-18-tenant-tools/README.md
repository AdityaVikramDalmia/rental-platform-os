# Phase 18: Tenant Tools (P18)

## Overview

Build four tenant-facing interactive tools on a dedicated Tools Hub page at `/tools` (under the `(public)` route group): Rent Calculator (4 sliders, real-time cost breakdown), generic Commute Estimator (Version A — area-to-area static lookup), Roommate Compatibility Quiz (5-question personality quiz with animated transitions), and Rental Checklist Tracker (20 items across 5 categories, localStorage persistence, CSV export). All tools are client-side only — no Convex backend queries or mutations. UI built with shadcn/ui components.

**Key Decision (Oracle-validated)**: This is a "Rent Calculator" (cost breakdown from inputs), NOT an "Affordability Calculator" (income → max rent). The tool takes rent, deposit months, maintenance, and brokerage as slider inputs and computes total move-in cost and monthly recurring cost.

## Dependencies

- P15-E02 (creates the `(public)` route group with layout — Tools Hub page lives under this layout)
- P17 is a sibling phase, NOT a blocker — P18 tools are standalone client-side utilities on their own `/tools` page

## Key Documentation

| Doc                                                                    | Sections to Read                          |
| ---------------------------------------------------------------------- | ----------------------------------------- |
| [features/16-tenant-tools.md](../../notes/features/16-tenant-tools.md) | Full file — all 4 tool specs              |
| [01-tech-stack.md](../../notes/01-tech-stack.md)                       | shadcn/ui component conventions           |
| [13-constants-reference.md](../../notes/13-constants-reference.md)     | Money format (paise), display conventions |

## Epics

| ID      | Title                                                                               | Tasks | Status | Depends On |
| ------- | ----------------------------------------------------------------------------------- | ----- | ------ | ---------- |
| P18-E01 | [Rent Calculator & Commute Estimator](P18-E01-rent-calculator-commute-estimator.md) | 3     | done   | P15-E02    |
| P18-E02 | [Roommate Quiz & Rental Checklist](P18-E02-roommate-quiz-rental-checklist.md)       | 3     | done   | P18-E01    |

**Total: 2 epics, 6 tasks**

## Dependency Graph

```
P15-E02 ──► P18-E01 ──► P18-E02
```

**Sequential**: E02 depends on E01 because it replaces placeholder content in the Tools Hub page created by E01-T03. E01 depends on P15-E02 for the `(public)` route group layout.

## Completion Criteria

- [x] shadcn Slider component added (`src/components/ui/slider.tsx`)
- [x] Rent Calculator renders 4 sliders with real-time computed outputs (move-in cost, monthly recurring)
- [x] Generic Commute Estimator shows area-to-area distance/time for 8-10 Bangalore areas with 5 transport modes
- [x] Tools Hub page at `/tools` with 3 tabs (Rent Calculator, Commute Estimator, Roommate Quiz) + Checklist section
- [x] Roommate Quiz: 5 questions one-per-screen, CSS transitions, 4 personality types, result card
- [x] Rental Checklist: 20 items in 5 categories, checkbox state persists in localStorage
- [x] Checklist CSV export works, Share API shown on mobile only
- [x] `useLocalStorage` hook is SSR-safe with `isReady` guard and try/catch
- [x] All tools are responsive (mobile + desktop)
- [x] Build succeeds (`npm run build`)

## Files Created by This Phase

```
rental-platform-os/
├── src/app/(public)/tools/
│   ├── page.tsx                        # Server component with metadata
│   └── tools-page-client.tsx           # Client component: Tabs + Checklist section
├── src/components/ui/
│   └── slider.tsx                      # shadcn Slider (Radix UI)
├── src/components/tenant/
│   ├── rent-calculator.tsx             # 4 sliders + computed outputs
│   ├── commute-estimator.tsx           # Area selectors + transport mode + result
│   ├── roommate-quiz.tsx               # Step-by-step quiz with result card
│   └── rental-checklist.tsx            # Categorized checklist with progress + export
├── src/hooks/
│   └── use-local-storage.ts            # SSR-safe localStorage hook
└── src/lib/
    ├── rent-calculator.ts              # Pure calculation functions
    ├── commute-data.ts                 # Area list, distance matrix, transport multipliers
    ├── quiz-data.ts                    # Questions, types, scoring function
    └── checklist-data.ts               # 5 categories, 20 items
```

## Scope Boundaries

### IN This Phase

- shadcn Slider component installation
- Rent Calculator (cost breakdown from 4 slider inputs, `useMemo` derived values)
- Generic Commute Estimator Version A (area-to-area, static data, 5 transport modes)
- Roommate Compatibility Quiz (5 questions, CSS transitions, 4 personality types)
- Rental Checklist Tracker (20 items, localStorage, CSV export, Share API)
- Tools Hub page with tabbed interface
- `useLocalStorage` custom hook (SSR-safe, try/catch, `isReady` boolean)

### NOT In This Phase

- Listing-specific commute calculator (Version B) → **P17-E03** (uses `listing_commute_landmarks`)
- Server-side persistence of any tool state → **V2**
- AI-powered recommendations → **V2**
- Live directions API / geocoding → **V2**
- How-It-Works page link to `/tools` → **P15** owns that page
- Tenant inquiry form → **P19**

## Known Deviations from Feature Spec

These deviations from `notes/features/16-tenant-tools.md` were **Oracle-validated during planning** and are intentional:

| Feature Spec Says                                         | Epic Does Instead                                    | Rationale                                                                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools hub lives on How-It-Works page                      | Dedicated `/tools` page under `(public)` route group | Cleaner separation of concerns; How-It-Works is informational, tools are interactive. P15 can link to `/tools`.                                                       |
| Commute Estimator: single "Where do you work?" text input | Two Select dropdowns (From area + To area)           | Version A is a generic standalone tool with static data for 8-10 areas. A text input implies geocoding/API which is V2. Two dropdowns match the static lookup matrix. |
| Tools embedded in property detail page                    | Tools on separate `/tools` page only                 | P17 builds the listing-specific Version B commute calculator. P18 tools are standalone utilities, not listing-dependent.                                              |
