---
id: P10-E03
title: Guard Badge Display
phase: 10
status: done
depends_on: ["P10-E01", "P07-E02", "P09-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P10-E03: Guard Badge Display

## Overview

Build the guard-facing badge display: integrate a "My Badges" section into the existing guard profile page at `/guard/profile`, create mobile-first badge card components showing card type, tier icon (from top-level `level` field — BRONZE/SILVER/GOLD/PLATINUM), and metric description, enforce data privacy (guard cannot see pending suggestions, admin notes, or threshold configurations), and handle empty states. The shared `incentive-card-badge.tsx` is created in P10-E01-T01 and consumed here.

## Prerequisites

- **Read first**: [P10-E01 Completion Summary](P10-E01-incentive-backend.md#completion-summary) — `incentives.getMyCards` query must already exist, returning active cards enriched with metric descriptions. Shared `incentive-card-badge.tsx` available.
- **Read first**: [P07-E02 Completion Summary](../phase-07-visit-management/P07-E02-visit-execution.md#completion-summary) — guard portal layout with profile page already exists at `/guard/profile`. Profile page has "My Badges" section placeholder (shown in wireframe at `notes/05-guard-portal-ux.md` Flow 7).
- **Read first**: [P09-E03 Completion Summary](../phase-09-payouts/P09-E03-guard-earnings-page.md#completion-summary) — established guard-facing card/list rendering conventions and mobile spacing patterns should be reused.
- Guard portal UX conventions (min 16px body text, min 44x44 touch targets) are established and must be followed. **Note**: The 48px sticky amber rule banner does NOT exist yet — it is created later in P11-E03-T01. Do not reference or depend on it.

## Task Queue

- [x] P10-E03-T01: Guard Profile Badges Section
- [x] P10-E03-T02: Badge Card Component
- [x] P10-E03-T03: Badge Data Privacy Enforcement

---

## T01: Guard Profile Badges Section

### Objective

Add the "My Badges" section to the existing guard profile page at `/guard/profile`, wire it to `incentives.getMyCards` query, and create the section layout with badge cards and empty state.

### Required Reading

- `notes/05-guard-portal-ux.md` — Flow 7: Profile wireframe showing "My Badges" section with badge examples
- `notes/features/08-incentive-system.md` — "Guard View" section, "Profile: Incentive Cards Section" wireframe
- `notes/13-constants-reference.md` — Incentive card type display names and tier icon guidance
- `tasks/phase-09-payouts/P09-E03-guard-earnings-page.md` — T01 pattern for guard page section wiring

### Key Rules

1. Modify `src/app/(guard)/guard/profile/page.tsx` to add "My Badges" section. Position it after the guard info card and before the schedule section (match wireframe order from `05-guard-portal-ux.md` Flow 7: info card → badges → schedule → language/password/signout).
2. Section uses `useQuery(api.incentives.getMyCards)` for reactive data.
3. Section header: "My Badges".
4. Render badge cards in a vertical stack (mobile-first). If guard has multiple badges, they stack vertically.
5. Empty state: "No badges earned yet. Keep submitting quality leads!" — supportive, motivational text.
6. Loading state: centered spinner within section (not full-page).
7. Section is always visible (not behind a tab or collapsed section). Badges are a point of pride — show them prominently.
8. Preserve existing profile page structure and conventions. Do NOT restructure other sections.

### Deliverables

- [ ] `src/app/(guard)/guard/profile/page.tsx` — Add "My Badges" section with query wiring, card rendering, and empty state

### Acceptance Criteria

1. "My Badges" section renders on `/guard/profile` in the correct position (after info card, before schedule).
2. Section uses `useQuery(api.incentives.getMyCards)` and updates reactively.
3. Badge cards render for each active card returned by query.
4. Empty state shows motivational text when guard has no badges.
5. Loading state shows spinner within section.
6. Existing profile sections remain intact and unchanged.
7. Mobile-first layout maintained (full-width cards, proper spacing).
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: load `/guard/profile`, verify "My Badges" section position, reactive data, and empty state.

### Out of Scope

- Badge card internals (T02)
- Data privacy audit (T03)

---

## T02: Badge Card Component

### Objective

Create the mobile-first badge card component that displays card type, tier icon, and metric description for each active incentive card.

### Required Reading

- `notes/features/08-incentive-system.md` — "Guard View → Profile: Incentive Cards Section" wireframe
- `notes/05-guard-portal-ux.md` — Flow 7: Profile wireframe, badges display format
- `notes/13-constants-reference.md` — Incentive card type values + permission reference

### Key Rules

1. Create `src/app/(guard)/guard/profile/components/badge-card.tsx`.
2. Card displays:
   - Tier icon from top-level `level` field (BRONZE/SILVER/GOLD/PLATINUM icon mapping) — prominent, left side or top.
   - Card type display name mapped from schema values: `lead_milestone` -> "Lead Milestone", `visit_milestone` -> "Visit Milestone", `quality_streak` -> "Quality Streak", `speed_bonus` -> "Speed Bonus", `monthly_top` -> "Monthly Top".
   - Metric description from query response (e.g., "25 verified leads", "10 visits completed", "98% verification rate"). Optional guard-facing explanation can come from sanitized `metadata.reason`.
3. Card styling: mobile-first, rounded corners, subtle shadow or border, minimum 16px body text, generous padding.
4. Cards are read-only (NOT tappable/navigable). Guard has no badge detail page.
5. Use consistent styling with other guard portal cards (earnings cards, visit cards from earlier phases).
6. Touch targets are not needed (card is not interactive), but maintain 44x44 minimum for any interactive elements if added later.
7. Consume `IncentiveCardBadge` from `src/components/shared/incentive-card-badge.tsx` for type + status/tier display, OR build a guard-specific card layout that's more prominent than the admin badge component. The shared badge is a compact inline badge; the guard profile card is a full display card.

### Deliverables

- [ ] `src/app/(guard)/guard/profile/components/badge-card.tsx` — Mobile-first badge card with icon, type, status/tier context, metric
- [ ] `src/app/(guard)/guard/profile/page.tsx` — Wire badge cards into "My Badges" section from T01

### Acceptance Criteria

1. Badge card displays tier icon (if present), card type name, and metric description.
2. Optional guard-facing explanation can be shown from sanitized `metadata.reason` when present.
3. Card styling is mobile-first with proper typography and spacing.
4. Cards are read-only (no click handlers).
5. Multiple cards stack vertically with consistent spacing.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: view profile with multiple badges (verify stacking), verify type-label mapping for all schema card_type values, verify optional reason rendering from metadata, verify cards are not tappable.

### Out of Scope

- Data privacy verification (T03)
- Admin-facing badge views

---

## T03: Badge Data Privacy Enforcement

### Objective

Verify and harden guard badge data privacy: confirm that the guard CANNOT see pending suggestions, expiry/rejection internals, admin internal data, or threshold configurations. This task is verification + edge case hardening, not new UI.

### Required Reading

- `notes/features/08-incentive-system.md` — "Guard View" section, "Edge Cases" section, Business Rules #1-#7
- `notes/03-roles-and-permissions.md` — Guard Permissions (hardcoded, not RBAC)
- `notes/05-guard-portal-ux.md` — Flow 7: Profile

### Key Rules

1. **Verify backend enforcement**: `incentives.getMyCards` (P10-E01-T05) must return ONLY `status: "active"` cards and strip admin-only fields.
2. **Guard CANNOT see** (verify these are NEVER in the guard-facing response or UI):
   - Pending auto-suggestions (non-confirmed metadata review state)
   - Expired cards (`status: "expired"`)
   - Redeemed cards (`status: "redeemed"`)
   - Admin-only metadata (internal reviewer IDs, internal moderation notes, internal workflow markers)
   - Threshold configurations (system_config values)
   - Other guards' badges
3. **Guard CAN see** (verify these are present and correct):
   - Card type (display name)
   - Tier icon derived from top-level `level` field (BRONZE/SILVER/GOLD/PLATINUM)
   - Metric description (computed by backend from current guard metrics)
   - Optional sanitized reason text from `metadata.reason` (if intentionally exposed)
4. **Edge case — guard drops below threshold**: Card stays. No auto-expiry. Card awarded at "25 verified leads" still shows even if some leads later rejected. Metric description shows CURRENT metric (may differ from award-time value) — this is acceptable per Business Rule: "Existing cards are not retroactively evaluated."
5. **Edge case — guard moves to new society**: Cards stay. Tied to guard, not society.
6. **Edge case — guard banned**: `requireGuard` blocks BANNED guards. Cards stay on record but guard can't access profile.
7. **Edge case — threshold config changed**: Existing cards unaffected. Only future suggestions use new thresholds.
8. If any data privacy leak is found, fix it in the backend query (P10-E01-T05) or frontend component.

### Deliverables

- [ ] Verification: `incentives.getMyCards` response shape confirmed to exclude admin-only fields
- [ ] Verification: Only `status: "active"` cards returned (no pending review, no expired, no redeemed)
- [ ] Verification: Guard cannot see other guards' badges
- [ ] Verification: BANNED/INACTIVE guards blocked by `requireGuard` (**⚠️ P11 migration note**: P11-E01-T01 will later migrate `incentives.getMyCards` from `requireGuard` to `requireGuardAuth` so INACTIVE guards can view their badges. Do not write hard assertions that INACTIVE guards must be blocked from this query.)
- [ ] Fix any data privacy leaks found during verification

### Acceptance Criteria

1. `incentives.getMyCards` response does NOT contain admin-only/internal metadata fields, any non-active cards, or threshold values. Optional reason text is only from sanitized `metadata.reason`.
2. Guard profile "My Badges" section shows ONLY active cards.
3. Expired cards do NOT appear anywhere in guard UI.
4. Pending suggestions do NOT appear in guard UI.
5. BANNED and INACTIVE guards are blocked by `requireGuard`.
6. No admin-only data exposed in component props, network response, or rendered DOM.
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual privacy audit:

1. Call `getMyCards` via dev tools as guard user — inspect response for admin-only field leaks.
2. Create a pending suggestion — confirm it does NOT appear on guard profile.
3. Expire a card — confirm it disappears from guard profile.
4. Verify `requireGuard` blocks INACTIVE/BANNED guards.

### Out of Scope

- Admin-facing guard badge views (P10-E02-T05)
- i18n for badge display (P14)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- **My Badges section** on guard profile page — wired to `useQuery(api.incentives.getMyCards)`, positioned after guard info card
- **Badge card component** (`badge-card.tsx`) — mobile-first with tier icon (medal emoji by level), card type display name, metric description. Read-only, not tappable.
- **States**: Loading (centered spinner), empty ("No badges earned yet"), populated (vertical card stack)
- **Privacy audit completed**: Found and fixed a data leak where `getMyCards` was returning pending auto-suggestions (cards with `status: "active"` but `metadata.review_state: "pending"`). Added `!isAutoSuggestionPending(card)` filter in backend.

### Key File Locations

- Profile page: `src/app/(guard)/guard/profile/page.tsx` (My Badges section)
- Badge card: `src/app/(guard)/guard/profile/components/badge-card.tsx`
- Backend query: `convex/incentives.ts` → `getMyCards` (~line 885)

### Deviations from Spec

- None. All 3 tasks implemented per spec.

### Gotchas for Next Epic

- `getMyCards` uses `requireGuard` which blocks INACTIVE/BANNED guards. P11-E01-T01 will migrate this to `requireGuardAuth` so INACTIVE guards can still view their badges.
- Badge card uses emoji medals for tier icons (🥉🥈🥇💎). If custom SVG icons are added later, update the `tierConfig` map in `badge-card.tsx`.
- The privacy fix (filtering out pending auto-suggestions) is in the backend `getMyCards` query, not the frontend — frontend trusts the backend to return only displayable cards.
