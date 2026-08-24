---
id: P18-E02
title: Roommate Quiz & Rental Checklist
phase: 18
status: pending
depends_on: ["P18-E01"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P18-E02: Roommate Quiz & Rental Checklist

## Overview

Build the Roommate Compatibility Quiz (5 questions, one-per-screen with animated transitions, scoring to 4 personality types, result card with recommendations) and the Rental Checklist Tracker (5 categories of items, localStorage persistence via custom hook, progress bar, CSV export via Blob, Share API fallback on mobile). Integrate both into the Tools Hub page created in E01. All client-side only — no backend.

## Prerequisites

- **Read first**: [P18-E01 Completion Summary](P18-E01-rent-calculator-commute-estimator.md#completion-summary) — Tools Hub page exists at `src/app/(public)/tools/` with 3 tabs (Rent Calculator active, Commute Estimator active, Roommate Quiz placeholder) and a Rental Checklist section placeholder.
- `src/components/ui/tabs.tsx` exists (shadcn Tabs).
- `src/components/ui/checkbox.tsx` exists (for checklist items).
- `src/components/ui/card.tsx`, `badge.tsx`, `button.tsx` exist.
- `notes/features/16-tenant-tools.md` — sections 3 (Roommate Quiz) and 4 (Rental Checklist).

## Task Queue

- [ ] P18-E02-T01: Roommate Compatibility Quiz
- [ ] P18-E02-T02: Rental Checklist Tracker
- [ ] P18-E02-T03: Integrate Quiz & Checklist into Tools Hub

---

## T01: Roommate Compatibility Quiz

### Objective

Create the Roommate Quiz component — a 5-question personality quiz with one question per screen, animated transitions, a progress indicator, and a result card showing the user's roommate compatibility type.

### Required Reading

- `notes/features/16-tenant-tools.md` — section 3 (`Roommate Compatibility Quiz`)
- `src/components/ui/card.tsx` — shadcn Card usage patterns for result card composition
- `src/components/ui/button.tsx` — full-width option button patterns
- `tasks/phase-18-tenant-tools/P18-E01-rent-calculator-commute-estimator.md#completion-summary` — tools hub composition context

### Key Rules

1. Create `src/lib/quiz-data.ts` — quiz content and scoring:
   - Export `QUIZ_QUESTIONS` array with 5 questions. Each question has: `id`, `text`, `options: Array<{ text: string, category: RoommateType }>`.
   - Questions (from feature spec):
     1. "What time do you usually wake up?" → Before 7 AM / 7-9 AM / 9-11 AM / After 11 AM
     2. "How do you feel about guests at home?" → Love it / Occasionally fine / Prefer advance notice / Prefer no guests
     3. "Your ideal weekend at home?" → Cooking brunch / Netflix marathon / Working out / Out with friends
     4. "Kitchen cleanliness level?" → Spotless always / Clean after cooking / End of day cleanup / Relaxed approach
     5. "How often do you work from home?" → Every day / Few days a week / Rarely / Never
   - Define 4 `RoommateType` categories: `EARLY_BIRD`, `NIGHT_OWL`, `SOCIAL_BUTTERFLY`, `QUIET_PROFESSIONAL`. Each type has: `name`, `description`, `compatibilityTips: string[]`, `emoji`.
   - Map each option to a category. Example: "Before 7 AM" → `EARLY_BIRD`, "After 11 AM" → `NIGHT_OWL`.
   - Export `calculateQuizResult(answers: RoommateType[])` → `RoommateType` — simple count: most-selected category wins. Tie-break: first alphabetically.
2. Create `src/components/tenant/roommate-quiz.tsx` — `"use client"`:
   - Internal state: `currentStep` (0-4), `answers: RoommateType[]`, `showResult: boolean`.
   - **One question per screen**: show only the current question with large option cards (full-width buttons).
   - **Progress indicator**: simple text "Question {n} of 5" plus a progress bar (use `<div>` with dynamic width, styled with Tailwind — or shadcn Progress if available).
   - **Animated transitions**: use CSS transitions. When moving to next question:
     - Current question slides/fades out left
     - New question slides/fades in from right
     - Use `transition-all duration-300` with conditional `translate-x` and `opacity` classes, keyed by `currentStep`.
     - Do NOT add framer-motion or any animation library as a dependency.
   - **Option selection**: clicking an option records the answer, auto-advances to next question after a 300ms delay (visual feedback before advance).
   - **Result card** (shown after question 5): displays the winning RoommateType with name, emoji, description, compatibility tips, and a "Browse Compatible Listings" link to `/listings`. Also a "Retake Quiz" button that resets state.
   - **Back button**: allow going back to previous question (but don't clear the answer — let user change it).
3. No external animation libraries. CSS transitions only.
4. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/lib/quiz-data.ts` — questions, types, scoring function
- [ ] `src/components/tenant/roommate-quiz.tsx` — step-by-step quiz with result card

### Acceptance Criteria

1. All 5 questions render one at a time with correct options.
2. Progress indicator shows current step out of 5.
3. Animated transitions between questions (CSS-based, no extra deps).
4. Option click records answer and auto-advances after brief delay.
5. Result shows correct RoommateType based on most-selected category.
6. Tie-break uses alphabetical order.
7. "Retake Quiz" resets all state.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/lib/quiz-data.ts` and `src/components/tenant/roommate-quiz.tsx`.

### Out of Scope

- Rent Calculator (E01 scope)
- Commute Estimator (E01 scope)
- Rental Checklist implementation (T02)
- Tools Hub integration work (T03)

---

## T02: Rental Checklist Tracker

### Objective

Create the Rental Checklist component — a categorized checklist with checkbox items, localStorage persistence via a custom `useLocalStorage` hook, an overall progress bar, CSV export via Blob download, Share API fallback on mobile, and a Reset button.

### Required Reading

- `notes/features/16-tenant-tools.md` — section 4 (`Rental Checklist Tracker`)
- `src/components/ui/checkbox.tsx` — shadcn Checkbox API
- `src/components/ui/card.tsx` — checklist container and progress card patterns
- `src/components/ui/button.tsx` — actions (`Download`, `Share`, `Reset`) styling pattern

### Key Rules

1. Create `src/lib/checklist-data.ts` — checklist content:
   - Export `CHECKLIST_CATEGORIES` array with 5 categories, each having `id`, `title`, `items: Array<{ id: string, text: string }>`.
   - Categories and items (from feature spec):
     - **Before Search** (4 items): Set budget, List requirements, Research localities, Gather documents
     - **During Search** (4 items): Shortlist properties, Schedule visits, Compare options, Check commute
     - **Before Signing** (4 items): Verify owner identity, Read agreement carefully, Check maintenance charges, Inspect property
     - **Move-In** (4 items): Meter readings, Key handover, Furniture inventory, Utility connections
     - **After Move-In** (4 items): Update address, Meet neighbors, Explore neighborhood, Set up essentials
   - Total: 20 items across 5 categories.
2. Create `src/hooks/use-local-storage.ts` — custom `useLocalStorage<T>` hook:
   - Signature: `useLocalStorage<T>({ key, defaultValue }): [T, (value: T | ((prev: T) => T)) => void, boolean]`
   - Returns `[value, setValue, isReady]`.
   - Read from localStorage in `useEffect` (not during render — SSR safe).
   - Write to localStorage in a second `useEffect` that runs when value changes AND `isReady` is true.
   - Wrap all localStorage access in `try/catch` — if localStorage is unavailable, hook still works with in-memory state (feature spec edge case: "Tools still work, but checklist state resets on page refresh").
   - Use versioned key: `demorentals-checklist-v1` to handle future schema changes.
3. Create `src/components/tenant/rental-checklist.tsx` — `"use client"`:
   - State: `Record<string, boolean>` mapping item IDs to checked status, persisted via `useLocalStorage`.
   - **Category sections**: each category is a collapsible section (use `<details>/<summary>` or a simple toggle state — no Accordion dependency needed).
   - **Checkbox items**: shadcn `Checkbox` for each item. Checked state persists in localStorage.
   - **Progress bar**: overall completion percentage. `completedCount / totalCount * 100`. Display as `<div>` with dynamic width + percentage text (e.g., "12 of 20 complete (60%)").
   - **Download button**: "Download Checklist" → exports as CSV via Blob.
     - CSV format: `Category,Item,Status\nBefore Search,Set budget,Done\n...`
     - Use `new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })` → `URL.createObjectURL` → click `<a>` → `URL.revokeObjectURL` cleanup.
     - Filename: `demorentals-rental-checklist-{YYYY-MM-DD}.csv`.
   - **Share API fallback**: if `navigator.share` is available (mobile), show a "Share" button that shares the checklist text. If not available, hide the Share button — Download is always available.
   - **Reset button**: "Reset Checklist" with confirmation dialog (shadcn Dialog or `window.confirm`). Clears all checkbox state.
   - Show loading skeleton while `isReady` is false (hook hasn't hydrated from localStorage yet).
4. No external dependencies. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/lib/checklist-data.ts` — 5 categories, 20 items
- [ ] `src/hooks/use-local-storage.ts` — SSR-safe localStorage hook
- [ ] `src/components/tenant/rental-checklist.tsx` — checklist with persistence, progress, export

### Acceptance Criteria

1. All 20 items render in 5 collapsible categories.
2. Checkbox state persists across page refreshes via localStorage.
3. Progress bar shows correct percentage and count.
4. CSV download generates valid file with correct content.
5. Share button appears only when `navigator.share` is available.
6. Reset clears all state with confirmation.
7. Graceful degradation: works without localStorage (in-memory fallback).
8. Loading skeleton shown until `isReady` is true.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/lib/checklist-data.ts`, `src/hooks/use-local-storage.ts`, and `src/components/tenant/rental-checklist.tsx`.

### Out of Scope

- Rent Calculator (E01 scope)
- Commute Estimator (E01 scope)
- Roommate Quiz integration into Tools Hub (T03)
- Server-side checklist persistence (V2)

---

## T03: Integrate Quiz & Checklist into Tools Hub

### Objective

Replace the placeholder content in the Tools Hub page (E01-T03) with the real Roommate Quiz and Rental Checklist components.

### Required Reading

- `tasks/phase-18-tenant-tools/P18-E01-rent-calculator-commute-estimator.md#completion-summary` — page structure and placeholders added in E01
- `src/app/(public)/tools/tools-page-client.tsx` — placeholder tab + checklist section to replace
- `src/components/tenant/roommate-quiz.tsx` and `src/components/tenant/rental-checklist.tsx` — component APIs from T01/T02
- `src/components/ui/tabs.tsx` and `src/components/ui/separator.tsx` — tab and section separation patterns

### Key Rules

1. Modify `src/app/(public)/tools/tools-page-client.tsx`:
   - Replace the "Roommate Quiz" tab placeholder with `<RoommateQuiz />` from `src/components/tenant/roommate-quiz.tsx`.
   - Replace the "Rental Checklist" section placeholder with `<RentalChecklist />` from `src/components/tenant/rental-checklist.tsx`.
   - Import both components.
   - **Tab state preservation**: Use `forceMount` on all `TabsContent` elements so inactive tab content stays mounted (preserving quiz progress when switching tabs). Hide inactive tabs with CSS (`data-[state=inactive]:hidden` or conditional `className`). Alternatively, hoist quiz/checklist state to the parent and pass via props — but `forceMount` is simpler and matches Radix Tabs convention.
   - Ensure tab switching between all 3 tools works correctly.
   - Ensure the Checklist section below the tabs renders properly with a visual separator.
2. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/app/(public)/tools/tools-page-client.tsx` — modified: quiz tab active, checklist section active

### Acceptance Criteria

1. All 3 tabs render real components (Rent Calculator, Commute Estimator, Roommate Quiz).
2. Rental Checklist section renders below the tabs.
3. Tab switching works without state loss (quiz progress preserved when switching away and back) — verified via `forceMount` on `TabsContent`.
4. `npx tsc --noEmit` passes.
5. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(public)/tools/tools-page-client.tsx`.

### Out of Scope

- Rent Calculator implementation details (E01)
- Commute Estimator implementation details (E01)
- Listing-specific commute calculator (P17-E03)
- How-It-Works page integration changes (P15 owns link placement)

---

## Out of Scope for all tasks

- Rent Calculator (E01 scope)
- Commute Estimator (E01 scope)
- Listing-specific commute calculator (P17-E03 scope)
- Server-side quiz result persistence (V2)
- AI-powered roommate recommendations (V2)
- Server-side checklist persistence (V2)
- Integration with How-It-Works page (P15 links to /tools; P18 doesn't modify How-It-Works)

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
