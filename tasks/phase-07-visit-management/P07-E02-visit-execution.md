---
id: P07-E02
title: Visit Execution (Guard-Facing)
phase: 7
status: done
depends_on: ["P07-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P07-E02: Visit Execution (Guard-Facing)

## Overview

Build the guard-facing visit execution flow: mobile-first visit list page (`/guard/visits`) with Today/Upcoming/Past grouping, visit detail/execution page with Start + Complete actions, outcome emoji selector, and guard bottom-nav "Visits" integration with live count badge. Note: the shared `visit-status-badge.tsx` is created in P07-E01-T01 and consumed here.

## Prerequisites

- **Read first**: [P07-E01 Completion Summary](P07-E01-visit-backend.md#completion-summary) — visit domain module and guard visit APIs (`getMyVisits`, `getMyTodayVisits`, `start`, `complete`) must already exist.
- P07-E01 is complete before starting E02.

## Task Queue

- [x] P07-E02-T01: Guard Visit List Page (`/guard/visits`)
- [x] P07-E02-T02: Visit Card + Section Components
- [x] P07-E02-T03: Visit Detail + Execution Page
- [x] P07-E02-T04: Outcome Selector + Guard Nav Update

---

## T01: Guard Visit List Page (`/guard/visits`)

### Objective

Implement the guard visits landing page with real-time data and three time-based sections (Today/Upcoming/Past) using mobile-first interaction and guard portal UX conventions.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Global Layout", "Rule Banner", "Flow 5: My Visits", "Loading & Error States"
- `notes/features/06-visit-management.md` — "Guard Flow: My Visits" -> "Visit List (`/guard/visits`)"
- `notes/10-convex-schema.md` — `visits` table shape + schedule fields used by list UI
- `notes/13-constants-reference.md` — visit statuses/outcomes for sectioning and card labels

### Key Rules

1. Create `src/app/(guard)/guard/visits/page.tsx` as a client page using `useQuery(api.visits.getMyVisits)` for live updates.
2. Group visits into exactly three sections:
   - **Today**: `scheduled_start` falls on current IST date
   - **Upcoming**: next 7 days from now (IST)
   - **Past**: last 30 days and terminal statuses (`COMPLETED`, `CANCELLED`, `NO_SHOW`)
3. Use `VisitSection` component for section headers and `VisitCard` component for each visit item (created in T02).
4. Empty state text: "No visits scheduled" with supportive copy per guard UX tone.
5. Loading state: centered spinner; do not render broken section skeletons that violate touch layout.
6. Preserve guard page conventions: 48px sticky amber rule banner, min 16px body text, and min 44x44 touch targets.
7. Keep guard data scope strict: render only `getMyVisits` response (already server-filtered by `assigned_guard_id` in backend).
8. All date grouping/display logic must use IST (`Asia/Kolkata`) for consistency with ops workflow.

### Deliverables

- [x] `src/app/(guard)/guard/visits/page.tsx` — Guard visit list page with Today/Upcoming/Past grouping, loading/empty states, and reusable section/card composition

### Acceptance Criteria

1. `/guard/visits` renders three sections with correct visit assignment by IST date logic.
2. `Today` section is visually highlighted per guard UX flow.
3. `VisitSection` + `VisitCard` are used instead of inline repeated markup.
4. Empty dataset renders "No visits scheduled" state.
5. Query is reactive (`useQuery`) and updates UI when visits change server-side.
6. Sticky amber rule banner remains visible on the page.
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: load `/guard/visits` with sample data and verify Today/Upcoming/Past bucketing uses IST boundaries.

### Out of Scope

- Start/complete mutation execution logic
- Outcome selector UI
- Guard bottom-nav badge count logic

---

## T02: Visit Card + Section Components

### Objective

Create reusable, mobile-first visit list components for card rendering and section framing, including status badge usage, outcome emoji display, and collapsible past visits behavior.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Flow 5: My Visits" (visit card + list wireframe)
- `notes/features/06-visit-management.md` — "Guard Flow: My Visits" and "Visit Detail View (Guard)"
- `notes/13-constants-reference.md` — "Visit Status" and "Visit Outcome (set on COMPLETED)"

### Key Rules

1. Create `src/app/(guard)/guard/visits/components/visit-card.tsx` for a single visit preview card.
2. Card content must include: building name + floor + flat, society name, formatted schedule text, and `VisitStatusBadge`.
3. Date text format examples:
   - "Today, 2:00 PM - 3:00 PM"
   - "Feb 20, 10:00 AM"
     Use IST-aware formatting helpers.
4. For `COMPLETED` visits, show outcome emoji + label mapping from constants (`INTERESTED` 😊, `NOT_INTERESTED` 😐, `FOLLOWUP` 🔄).
5. Card action CTA rules:
   - `ASSIGNED`/`CONFIRMED`: show "Start Visit"
   - `IN_PROGRESS`: show "Complete Visit"
6. Entire card should be tappable and navigate to `/guard/visits/[id]`; CTA interactions must remain touch-accessible (>=44x44).
7. Create `src/app/(guard)/guard/visits/components/visit-section.tsx` with header title and count badge; Past section is collapsible.
8. Keep component styles mobile-first (rounded card, subtle shadow, readable 16px body baseline).

### Deliverables

- [x] `src/app/(guard)/guard/visits/components/visit-card.tsx` — Mobile-first visit card with status badge, outcome display, and contextual CTA
- [x] `src/app/(guard)/guard/visits/components/visit-section.tsx` — Section wrapper with title/count and collapsible Past behavior

### Acceptance Criteria

1. Visit card renders location, society, schedule, and status consistently across all statuses.
2. Completed cards display emoji + outcome text using canonical constants mapping.
3. CTA label changes by status (`Start Visit` / `Complete Visit`) exactly as specified.
4. Card tap navigates to detail route `/guard/visits/[id]`.
5. Past section supports collapse/expand while Today/Upcoming remain always visible.
6. `VisitStatusBadge` is reused (no duplicate status color logic).
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: verify CTA labels, navigation behavior, and past-section collapse on mobile viewport.

### Out of Scope

- Mutation execution handlers
- Detail page completion form
- Bottom navigation update

---

## T03: Visit Detail + Execution Page

### Objective

Build the guard visit detail page with status-aware execution controls: start visit for ASSIGNED/CONFIRMED, complete visit for IN_PROGRESS with validated outcome form, and read-only rendering for terminal states.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Flow 5: My Visits" (Visit Execution Flow + Visit Detail wireframe), "Loading & Error States"
- `notes/features/06-visit-management.md` — "Visit Execution Flow" and "Visit Detail View (Guard)"
- `notes/04-state-machines.md` — "Visit Status" transition rules
- `notes/10-convex-schema.md` — `visits` outcome fields (`outcome`, `outcome_notes`, `started_at`, `completed_at`)
- `notes/13-constants-reference.md` — visit outcomes + emoji descriptions

### Key Rules

1. Create `src/app/(guard)/guard/visits/[id]/page.tsx` and fetch visit data from guard-safe query source (`api.visits.getMyVisits` filtered client-side or dedicated guard detail query if added).
2. Display sections in this order: Location, Schedule, Status, Started Time (conditional), Completed Info (conditional).
3. For `ASSIGNED`/`CONFIRMED`, show `Start Visit` button that calls `api.visits.start`; success toast: "Visit started!".
4. For `IN_PROGRESS`, show completion form with `OutcomeSelector` (from T04), optional notes, and `Submit & Complete` button calling `api.visits.complete`.
5. Completion form must use `react-hook-form` + `zod` with required `outcome` and optional `outcome_notes`.
6. On completion success, toast "Visit completed! Thank you." then redirect to `/guard/visits`.
7. For terminal statuses (`COMPLETED`, `CANCELLED`, `NO_SHOW`), render read-only details and hide mutation buttons.
8. All mutation failures show `sonner` error toast with surfaced backend message; no silent failures.
9. Loading state uses centered spinner; while mutation runs, button shows spinner and is disabled.
10. Guard must never input pricing/tenant terms; only outcome + notes are editable on this page.

### Deliverables

- [x] `src/app/(guard)/guard/visits/[id]/page.tsx` — Guard visit detail + execution page with start/complete flows, read-only terminal state handling, and validated completion form
- [x] `src/app/(guard)/guard/visits/components/visit-execution.tsx` — Start + Complete flow component with outcome selection, extracted for reuse and testability

### Acceptance Criteria

1. Detail page displays location/schedule/status metadata for any visit returned by guard query.
2. Start action is available only for `ASSIGNED`/`CONFIRMED` and transitions to `IN_PROGRESS` on success.
3. Complete action is available only for `IN_PROGRESS` and requires outcome selection.
4. Completion success shows toast and redirects back to `/guard/visits`.
5. Terminal states are read-only with no start/complete buttons.
6. Form stack uses `react-hook-form` + `zod`; toasts use `sonner`.
7. Mutation loading and error handling follows guard UX conventions.
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual smoke test: start an ASSIGNED visit, complete an IN_PROGRESS visit with each outcome option, verify redirect + updated status.

### Out of Scope

- Admin-side visit edits/cancel/no-show actions
- Visit scheduling and guard assignment
- Closure/payout workflows after completion

---

## T04: Outcome Selector + Guard Nav Update

### Objective

Implement reusable emoji-card outcome selector UI and wire guard bottom navigation updates, including the Visits tab placement and live badge count for today's active visits.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Flow 5: My Visits" (outcome card wireframe), "Bottom Navigation"
- `notes/features/06-visit-management.md` — "Visit Execution Flow" (outcome semantics)
- `notes/13-constants-reference.md` — "Visit Outcome (set on COMPLETED)" (emoji + labels)
- `notes/10-convex-schema.md` — `visits` status/outcome fields used for today badge filtering

### Key Rules

1. Create `src/app/(guard)/guard/visits/components/outcome-selector.tsx` with three mutually exclusive emoji cards:
   - 😊 **Interested** — "Tenant wants to proceed"
   - 😐 **Not Interested** — "Tenant passed"
   - 🔄 **Follow-up Needed** — "Tenant wants to think / come back"
2. Component API: controlled `value` + `onChange`; no local hidden state that conflicts with form control.
3. Selected option visual treatment: highlighted border/background (e.g., `ring-2 ring-primary`); unselected options use muted border.
4. Ensure accessibility: keyboard focus support, clear `aria-label`s, and semantic radio-group behavior.
5. Update guard bottom navigation in `src/app/(guard)/guard-layout-client.tsx`:
   - Add/enable "Visits" tab with calendar icon between Leads and Profile (note: "Earn" tab does NOT exist yet — that's P09/P10)
   - Final order for P07: Home, Add, Leads, Visits, Profile
6. Add Visits tab badge count using `api.visits.getMyTodayVisits` — count of today's non-terminal visits (`ASSIGNED`, `CONFIRMED`, `IN_PROGRESS`).
7. Preserve guard UX standards: minimum 44x44 touch targets and minimum 16px readable body labels.

### Deliverables

- [x] `src/app/(guard)/guard/visits/components/outcome-selector.tsx` — Accessible emoji-card selector (controlled input)
- [x] `src/app/(guard)/guard-layout-client.tsx` — Guard bottom navigation updated with Visits tab order and today-active badge count

### Acceptance Criteria

1. Outcome selector renders all 3 options with exact emoji, label, and description text.
2. Only one outcome is selectable at a time; controlled value updates correctly.
3. Selector supports keyboard interaction and has accessible labeling.
4. Guard nav order is exactly Home, Add, Leads, Visits, Profile (Earn tab is P09/P10 scope — does not exist yet).
5. Visits tab shows dynamic badge count for today's non-terminal guard visits.
6. Nav remains mobile-friendly with touch target and spacing compliance.
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: verify bottom-nav order, badge count changes with visit status updates, and outcome selector keyboard accessibility.

### Out of Scope

- Earnings tab/business logic
- Admin sidebar/nav updates
- i18n translation pass for outcome labels (handled in P14)

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
