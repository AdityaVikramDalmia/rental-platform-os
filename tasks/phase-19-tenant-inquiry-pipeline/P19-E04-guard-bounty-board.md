---
id: P19-E04
title: Guard Bounty Board & Acceptance
phase: 19
status: done
depends_on: ["P19-E02"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P19-E04: Guard Bounty Board & Acceptance

## Overview

Build the guard-facing bounty board at `(guard)/guard/bounties/` — a real-time page where guards see available visit bounties filtered by their assigned society, accept bounties with confirmation, and track their accepted bounties through the visit lifecycle.

## Prerequisites

- **Read first**: [P19-E02 Completion Summary](P19-E02-backend-lifecycle-functions.md#completion-summary) — `tenantInquiries.acceptBounty`, `tenantInquiries.listBounties`, and `tenantInquiries.listByGuard` must be functional before this UI work begins.
- [P19-E01](P19-E01-schema-auth-constants.md) is complete — tenant inquiry statuses/constants, guard auth primitives, and schema/config keys are already in place.
- Guard portal route structure exists at `src/app/(guard)/guard/` and guard auth patterns are active.
- `TENANT_INQUIRY_STATUS_COLORS` and `VISIT_BOUNTY_STATUS_COLORS` constants are available from E01-T03 for status display. E04 builds its own guard-specific status rendering inline — it does NOT depend on E03's `inquiry-status-badge.tsx` component.

## Task Queue

- [x] P19-E04-T01: Bounty Board Page + Card Component
- [x] P19-E04-T02: Accept Bounty Flow + Confirmation Dialog
- [x] P19-E04-T03: My Accepted Tab + Status Tracking

---

## T01: Bounty Board Page + Card Component

### Objective

Create the `/guard/bounties` page shell and reusable bounty card UI so guards can browse available bounties in a mobile-first, real-time card layout.

### Required Reading

- `notes/features/13-tenant-inquiry.md` — Guard user story and acceptance criteria (lines 84-98)
- `notes/05-guard-portal-ux.md` — Flow 8 (`/guard/bounties`) wireframe and card content requirements
- `src/app/(guard)/guard/visits/page.tsx` — guard page composition, empty/loading patterns, and mobile-first section layout
- `src/components/guard/GuardProfileCard.tsx` — guard card styling conventions (Card + CardContent + compact metadata rows)
- `notes/13-constants-reference.md` — Visit Bounty Status reference (lines 614-621)

### Key Rules

1. Create `src/app/(guard)/guard/bounties/page.tsx` with guard auth gating; unauthenticated or non-guard users are redirected to `/guard/login`.
2. Page uses two tabs with default selection on `Available`: `Available` and `My Accepted`.
3. `Available` tab uses `usePaginatedQuery(api.tenantInquiries.listBounties, ...)`; do not pass manual society filters from client — backend guard scoping is authoritative.
4. Keep Convex reactivity intact: when any guard claims a bounty, claimed cards disappear from `Available` automatically (no manual refresh and no polling).
5. Create `src/components/guard/bounty-card.tsx` (kebab-case naming required).
6. Bounty card displays listing details: building name, flat number, BHK, and rent formatted with `formatINR()` from `lib/money.ts`.
7. Bounty card displays tenant preference fields: preferred visit date/time slot (or clear fallback text when not provided).
8. Bounty amount is visually prominent and uses accent treatment, with all currency values formatted via `formatINR()`.
9. Expiry countdown is derived from `bounty_expires_at - Date.now()` and rendered in human-readable form (for example `Expires in 2d 5h`); expired cards show `Expired`.
10. Card uses shadcn `Card` + `CardContent`, mobile-first spacing, and minimum 44x44 tap target for primary actions.
11. Empty state for `Available` tab must match copy: `No bounties available in your society right now`.
12. Guard portal UI stays card-based (no table layouts), matching Flow 8 and existing guard pages.

### Deliverables

- [ ] `src/app/(guard)/guard/bounties/page.tsx` — guard bounty board route with tabs, available query wiring, and empty/loading states
- [ ] `src/components/guard/bounty-card.tsx` — reusable available-bounty card component with countdown + action slot

### Acceptance Criteria

1. `/guard/bounties` renders under guard portal layout and shows `Available` tab by default.
2. Available list is sourced from `tenantInquiries.listBounties` and updates reactively when claims occur.
3. Each available card shows listing summary, tenant visit preference, bounty amount, and expiry countdown.
4. Currency values use `formatINR()` and countdown degrades to `Expired` after expiry time.
5. Empty-state copy matches spec exactly.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(guard)/guard/bounties/page.tsx` and `src/components/guard/bounty-card.tsx`.

### Out of Scope

- Accept mutation side effects, confirmation dialog logic, and race-condition toasts (T02)
- My Accepted tab query/status rendering (T03)
- Any admin queue, tenant form, or backend lifecycle implementation (P19-E01/P19-E02/P19-E03 scope)

---

## T02: Accept Bounty Flow + Confirmation Dialog

### Objective

Implement a guard confirmation flow for claiming bounties, including loading/error handling for first-claim-wins race conditions.

### Required Reading

- `notes/features/13-tenant-inquiry.md` — guard acceptance flow and success behavior (lines 84-98)
- `notes/05-guard-portal-ux.md` — Flow 8 accept dialog copy and expected guard UX
- `src/components/ui/dialog.tsx` — shadcn dialog composition pattern
- `src/components/ui/button.tsx` — loading/disabled button states in this codebase

### Key Rules

1. Add acceptance confirmation UI using shadcn `Dialog`; trigger is the `Accept Bounty` action from `bounty-card`.
2. Confirmation copy must be: `Are you sure you want to accept this bounty? This commits you to conducting the property showing.`
3. Dialog summary includes listing snapshot, bounty amount, and tenant preference details so the guard confirms with context.
4. Confirm action calls `tenantInquiries.acceptBounty` mutation for the selected inquiry id.
5. Confirm button shows loading state (`disabled` + spinner) while mutation is pending; prevent double submits.
6. Success toast uses sonner with exact copy: `Bounty accepted! You'll be notified when the visit is scheduled.`
7. Race condition handling is mandatory: if the bounty is already claimed, show error toast with exact copy `This bounty was already claimed by another guard.`
8. After success or claim-race error, rely on reactive query refresh to remove/update cards; do not manually mutate cached lists.
9. Keep component filename in kebab-case and guard-facing UX mobile-first.
10. Do not add backend logic in this task; this is frontend integration only with existing E02 mutation.

### Deliverables

- [ ] `src/components/guard/bounty-accept-dialog.tsx` — confirmation dialog + mutation/toast/loading flow
- [ ] `src/components/guard/bounty-card.tsx` — wired dialog trigger and accept action handoff
- [ ] `src/app/(guard)/guard/bounties/page.tsx` — dialog state wiring for selected bounty

### Acceptance Criteria

1. Tapping `Accept Bounty` opens a confirmation dialog with required copy and bounty context.
2. Confirm calls `tenantInquiries.acceptBounty` exactly once per click while loading state is active.
3. Success path shows required success toast and removes bounty from available list via reactive query updates.
4. Already-claimed race path shows required error toast and keeps UI consistent.
5. No manual refresh action is required to observe list changes.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/guard/bounty-accept-dialog.tsx`, `src/components/guard/bounty-card.tsx`, and `src/app/(guard)/guard/bounties/page.tsx`.

### Out of Scope

- My Accepted tab list and status timeline rendering (T03)
- Visit scheduling/completion mutations and status transitions (P19-E02 backend scope)
- Admin inquiry queue actions and tenant inquiry submission UX (P19-E03 scope)

---

## T03: My Accepted Tab + Status Tracking

### Objective

Build the `My Accepted` tab so guards can track their claimed bounties through inquiry and visit lifecycle states.

### Required Reading

- `notes/features/13-tenant-inquiry.md` — guard accepted-bounty status tracking requirement (lines 96-98)
- `notes/05-guard-portal-ux.md` — Flow 8 `My Accepted` tab expectations and status labels
- `src/app/(guard)/guard/visits/page.tsx` — sectioned guard list rendering and empty state treatment
- `notes/13-constants-reference.md` — status naming/color references for visit bounty states
- `lib/constants.ts` — `TENANT_INQUIRY_STATUS_COLORS` for inline status rendering (from E01-T03, no dependency on E03)

### Key Rules

1. `My Accepted` tab uses `usePaginatedQuery(api.tenantInquiries.listByGuard, ...)` to fetch only current guard claims.
2. Keep tab reactive; status changes from admin/visit flows update in-place without manual refresh.
3. Empty state copy for this tab must be: `You haven't accepted any bounties yet`.
4. Render inquiry lifecycle states using `TENANT_INQUIRY_STATUS_COLORS` from `lib/constants.ts` with shadcn `Badge` component directly (no dependency on E03's `inquiry-status-badge.tsx`).
5. Required visible progression in UI: `GUARD_ACCEPTED` -> `VISIT_SCHEDULED` -> `VISIT_COMPLETED`.
6. When status is `VISIT_SCHEDULED`, show visit date/time details from linked visit data.
7. When status is `VISIT_COMPLETED`, show visit outcome badge and earned bounty amount display.
8. Accepted-card variant reuses listing summary (building/flat/BHK/rent + bounty amount) but replaces accept CTA with status/timeline metadata.
9. Add `Load More` pagination behavior for both tabs where applicable.
10. Preserve mobile-first guard layout and card-based composition; no admin-style tables.
11. Keep file naming kebab-case for any new guard component extracted in this task.

### Deliverables

- [ ] `src/app/(guard)/guard/bounties/page.tsx` — `My Accepted` tab query wiring, status rendering, and pagination controls
- [ ] `src/components/guard/bounty-card.tsx` — accepted-card variant with status/visit/outcome display

### Acceptance Criteria

1. `My Accepted` tab lists only bounties claimed by current guard via `tenantInquiries.listByGuard`.
2. Status badge and timeline information render correctly for accepted/scheduled/completed states.
3. Scheduled items show visit date/time; completed items show outcome + earned bounty.
4. Empty-state copy and `Load More` behavior are implemented.
5. `npm run build` and `npx tsc --noEmit` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(guard)/guard/bounties/page.tsx` and `src/components/guard/bounty-card.tsx`.

### Out of Scope

- Posting/editing/reassigning bounties (admin scope)
- Tenant inquiry submission form or tenant-side tracking UI
- New backend transitions, cron logic, or payout lifecycle changes

---

## Out of Scope (All Tasks)

- Schema/auth/constants/rate limiter setup from P19-E01
- Backend lifecycle mutations/queries/cron from P19-E02
- Admin inquiry queue and tenant submission form scope from P19-E03
- Any feature outside guard bounty board UX at `/guard/bounties`

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
