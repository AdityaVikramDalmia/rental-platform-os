---
id: P09-E03
title: Guard Earnings Page
phase: 9
status: done
depends_on: ["P09-E01", "P07-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P09-E03: Guard Earnings Page

## Overview

Build the guard-facing earnings page: mobile-first layout with Pending Payouts section (top), Disbursed History section (middle), and Failed Payouts section (bottom), Total Earned summary, strict data privacy enforcement (guard cannot see commission, brokerage, rent agreement, or admin notes), and guard bottom-nav "Earn" integration. The shared `payout-status-badge.tsx` is created in P09-E01-T01 and consumed here.

## Prerequisites

- **Read first**: [P09-E01 Completion Summary](P09-E01-payout-backend.md#completion-summary) — `payouts.getGuardEarnings` query must already exist, returning `{ pending, disbursed, failed, total_earned }` with data privacy enforcement (`pending` payouts hide `amount_paise`).
- **Read first**: [P07-E02 Completion Summary](../phase-07-visit-management/P07-E02-visit-execution.md#completion-summary) — guard portal layout with bottom navigation already exists. **Current nav tabs**: Dashboard (`Home`), Submit Lead (`Plus`), My Leads (`FileText`), Visits (`Calendar`), Profile (`User`). **⚠️ No "Earn" tab exists** — this epic must replace "Profile" as the 5th tab with "Earn" to maintain `grid-cols-5`. If Profile must be preserved, switch nav layout to `grid-cols-6` (outside the recommended path). Do NOT assume a placeholder exists.
- Guard portal UX conventions (min 16px body text, min 44x44 touch targets) are already established and must be followed. **Note**: The 48px sticky amber rule banner does NOT exist yet — it is created later in P11-E03-T01. Do not reference or depend on it in this epic.

## Task Queue

- [x] P09-E03-T01: Guard Earnings Page Shell + Nav Activation
- [x] P09-E03-T02: Pending Payouts Section
- [x] P09-E03-T03: Disbursed History + Failed Payouts + Total Earned
- [x] P09-E03-T04: Guard Earnings Data Privacy Enforcement

---

## T01: Guard Earnings Page Shell + Nav Activation

### Objective

Create the guard earnings page at `/guard/earnings` with mobile-first layout, three-section structure, real-time data from `payouts.getGuardEarnings`, and activate the "Earn" tab in guard bottom navigation.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Global Layout", "Rule Banner", Flow 6: Earnings page wireframe, "Loading & Error States", "Bottom Navigation"
- `notes/features/07-closure-and-payouts.md` — "Guard Flow: Earnings" (lines 125-172)
- `notes/13-constants-reference.md` — payout statuses for section filtering
- `tasks/phase-07-visit-management/P07-E02-visit-execution.md` — T01 guard page shell pattern (mobile-first, useQuery, section structure)

### Key Rules

1. Create `src/app/(guard)/guard/earnings/page.tsx` as a client page using `useQuery(api.payouts.getGuardEarnings)` for live updates.
2. Page layout has exactly three sections stacked vertically:
   - **Pending Payouts** (top) — payouts not yet disbursed (`pending`, `approved`)
   - **Disbursed History** (middle) — completed payouts (`disbursed`)
   - **Failed Payouts** (bottom) — failed disbursements (`failed`) with clear non-alarming treatment
3. ADD "Earn" tab to guard bottom navigation (`src/app/(guard)/guard-layout-client.tsx`). **⚠️ No placeholder exists** — current tabs are Dashboard, Submit Lead, My Leads, Visits, Profile. Replace "Profile" (5th tab) with "Earn" to maintain `grid-cols-5`; if Profile must be preserved, change nav layout to `grid-cols-6`:
   - Use banknote/wallet icon (`Banknote` or `Wallet` from `lucide-react`)
   - `href: "/guard/earnings"`
   - Target nav order: Dashboard, Submit Lead, My Leads, Visits, Earn
4. Loading state: centered spinner — do not render broken section skeletons.
5. Preserve guard page conventions: min 16px body text, min 44x44 touch targets. **Note**: The 48px sticky amber rule banner does NOT exist yet (created in P11-E03-T01) — do not add or reference it in this task.
6. All data comes from `getGuardEarnings` response — this query is already guard-scoped server-side (filtered by `guard_user_id` via `requireGuard`).
7. Display page title "My Earnings" at the top.

### Deliverables

- [ ] `src/app/(guard)/guard/earnings/page.tsx` — Guard earnings page with three-section layout, loading/empty states, and real-time data from `getGuardEarnings`
- [ ] `src/app/(guard)/guard-layout-client.tsx` — Activate "Earn" tab in guard bottom navigation with correct icon, href, and ordering

### Acceptance Criteria

1. `/guard/earnings` renders three sections (Pending Payouts, Disbursed History, Failed Payouts) stacked vertically.
2. Query is reactive (`useQuery`) and updates UI when payout status changes server-side.
3. "Earn" tab is present and active in guard bottom navigation with correct icon and `href: "/guard/earnings"`. **This is a NEW tab** — verify it was added (not just activated from a placeholder).
4. Nav order is: Dashboard, Submit Lead, My Leads, Visits, Earn, with `grid-cols-5` preserved by replacing the Profile tab.
5. Guard page conventions preserved: min 16px body text, 44x44 touch targets. (No rule banner exists yet — added in P11-E03-T01.)
6. Loading state shows centered spinner.
7. Empty datasets render appropriate empty state messages (wired in T02/T03).
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: load `/guard/earnings`, verify section layout, nav tab activation, and reactive data.

### Out of Scope

- Pending payout card internals (T02)
- Paid history card internals and total earned (T03)
- Data privacy verification (T04)

---

## T02: Pending Payouts Section

### Objective

Build the Pending Payouts section with mobile-first cards showing building + flat reference, closure confirmed date, prospective bounty, and payout status — enforcing Business Rule #6 (guard cannot see payout `amount_paise` for `pending` payouts).

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Guard Flow: Earnings → Section 1: Pending" wireframe (lines 129-145), "What guard sees vs doesn't see" table (lines 163-172)
- `notes/05-guard-portal-ux.md` — Flow 6: Earnings pending section wireframe
- `notes/13-constants-reference.md` — payout status display labels for guard

### Key Rules

1. Create `src/app/(guard)/guard/earnings/components/pending-payout-card.tsx` for a single pending payout card.
2. Card content for `pending` payouts:
   - Building name + Flat number (from enriched payout data)
   - "Closure confirmed: [date in IST]"

- "Prospective bounty: ₹[amount]" (from lead's prospective bounty — reference, not guarantee, per Business Rule #7)
- Status: "Processing" (display label for `pending`)
- **Do NOT show payout `amount_paise`** — Business Rule #6: guard cannot see amount until `approved`

3. Card content for `approved` payouts:
   - Building name + Flat number
   - "Closure confirmed: [date in IST]"

- "Amount: ₹[payout amount in rupees from amount_paise]" — amount IS visible for `approved`
- Status: "Approved (payment soon)" (display label for `approved`)

4. Use mobile-first card styling: rounded corners, subtle shadow, 16px body baseline, readable layout.
5. Empty state text: "No pending payouts" — supportive, not negative.
6. Cards should NOT be tappable/navigable — guard has no payout detail page. Read-only display.
7. All money displayed via `formatINR(paise)` from `lib/money.ts` (converts paise→rupees internally). Use `paiseToRupees()` only when a raw numeric rupee value is needed.
8. All dates formatted in IST.

### Deliverables

- [ ] `src/app/(guard)/guard/earnings/components/pending-payout-card.tsx` — Mobile-first pending payout card with status-conditional amount display
- [ ] `src/app/(guard)/guard/earnings/page.tsx` — Wire pending section with cards from `getGuardEarnings` response `pending` array, with empty state

### Acceptance Criteria

1. `pending` payout cards show building + flat, closure confirmed date, prospective bounty, and "Processing" status — but NOT payout `amount_paise` (Business Rule #6).
2. `approved` payout cards show building + flat, closure confirmed date, payout amount (₹ from `amount_paise`), and "Approved (payment soon)" status.
3. Prospective bounty is labeled to indicate it's a reference, not a guarantee.
4. Empty pending section shows "No pending payouts".
5. Money amounts use `formatINR(paise)` (converts paise→rupees internally).
6. Dates are formatted in IST.
7. Cards are read-only (not tappable).
8. Touch targets meet 44x44 minimum (no tiny interactive elements).
9. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: view pending section with `pending` payout (verify amount hidden), view with `approved` payout (verify amount shown), verify empty state.

### Out of Scope

- Paid history section (T03)
- Total earned counter (T03)
- Data privacy edge case audit (T04)

---

## T03: Disbursed History + Failed Payouts + Total Earned

### Objective

Build the Disbursed History section with mobile-first cards showing payout amount, disbursed date, payment reference, plus a Failed Payouts section, and a Total Earned counter at the bottom summing all `disbursed` payout amounts.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Guard Flow: Earnings → history section" wireframe
- `notes/05-guard-portal-ux.md` — Flow 6: Earnings history + total earned wireframe, empty state
- `notes/13-constants-reference.md` — payout statuses and display labels

### Key Rules

1. Create `src/app/(guard)/guard/earnings/components/paid-payout-card.tsx` for a single disbursed payout card (file name can remain for compatibility).
2. Card content for `disbursed` payouts:
   - Building name + Flat number (from enriched payout data)

- Payout amount: "₹[amount in rupees from amount_paise]" (prominently displayed)
- "Disbursed on: [disbursed_at date in IST]"
- Payment reference: `payment_reference` (or fallback text if empty)

3. Disbursed cards sorted by `disbursed_at` descending (newest first) — the backend `getGuardEarnings` returns them in this order.
4. Failed section cards show building + flat, payout amount (₹ from `amount_paise`), and `failure_reason` with neutral warning styling.
5. Create `src/app/(guard)/guard/earnings/components/earnings-summary.tsx` — Total Earned counter.
6. Total Earned displays the sum of all `disbursed` payout amounts in rupees: "Total Earned: ₹[total]". The backend provides `total_earned` in paise; display with `formatINR(total_earned)` — `formatINR` converts paise→rupees internally. Do NOT chain `paiseToRupees()` then `formatINR()`.
7. Position Total Earned at the bottom of the Disbursed History section (after all disbursed cards).
8. Empty state text for disbursed history: "No disbursed history yet" — supportive copy.
9. Empty state text for failed section: "No failed payouts".
10. Empty state for earnings summary: show "Total Earned: ₹0".
11. All money displayed via `formatINR(paise)` from `lib/money.ts` (converts paise→rupees internally).
12. All dates formatted in IST.

### Deliverables

- [ ] `src/app/(guard)/guard/earnings/components/paid-payout-card.tsx` — Mobile-first disbursed payout card with amount, disbursed date, payment reference
- [ ] `src/app/(guard)/guard/earnings/components/earnings-summary.tsx` — Total Earned counter component
- [ ] `src/app/(guard)/guard/earnings/page.tsx` — Wire disbursed history + failed sections with cards from `getGuardEarnings` response `disbursed` and `failed` arrays, earnings summary, and empty states

### Acceptance Criteria

1. `disbursed` payout cards show building + flat, payout amount (₹, prominent), disbursed date (IST), and payment reference.
2. Disbursed cards are ordered by `disbursed_at` descending (newest first).
3. Failed payout cards are rendered from `failed` array and display `failure_reason`.
4. Total Earned counter shows sum of all `disbursed` amounts via `formatINR(total_earned)` (paise→rupees conversion is internal).
5. Empty disbursed section shows "No disbursed history yet".
6. Empty failed section shows "No failed payouts".
7. Empty earnings summary shows "Total Earned: ₹0".
8. Total Earned is positioned at the bottom of the Disbursed History section.
9. Cards are read-only (not tappable).
10. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: view disbursed section with multiple `disbursed` payouts (verify ordering), verify failed section rendering with `failure_reason`, verify total earned sum matches, verify empty states.

### Out of Scope

- Pending payout section (T02)
- Data privacy edge case audit (T04)
- Export/download earnings history (V2)

---

## T04: Guard Earnings Data Privacy Enforcement

### Objective

Verify and harden guard earnings data privacy: confirm that the guard CANNOT see admin-only financial data, that `pending` payouts hide amount, that `failed` payouts are shown safely, and that `voided` payouts are excluded. This task is verification + edge case hardening, not new UI.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "What guard sees vs doesn't see" table (lines 163-172), Business Rules #6, #7
- `notes/03-roles-and-permissions.md` — "Guard Permissions (Hardcoded — not RBAC)" — guards have fixed capabilities
- `notes/05-guard-portal-ux.md` — Flow 6: Earnings page (payout status display labels)

### Key Rules

1. **Verify backend enforcement**: `payouts.getGuardEarnings` (P09-E01-T05) must strip admin-only fields from response. Verify by calling the query and inspecting the response shape.
2. **Guard CANNOT see** (verify these fields are NEVER in the guard-facing response or UI):
   - Commission amounts (`commission_amount`)
   - Brokerage breakdown (`brokerage_tenant_side`, `brokerage_owner_side`)
   - Rent agreement (`rent_agreement_storage_id`)
   - Additional documents (`additional_documents`)
   - Deal financials (closure notes, DemoRentals deal ID)

- Internal admin notes (closure `notes`)
- Admin IDs: Do NOT expose `approved_by`, `voided_by` admin user IDs to guard-facing queries. Strip these fields in the guard earnings query response.

3. **Guard CAN see** (verify these are present and correct):
   - Flat reference (building name + flat number)
   - Prospective bounty (from lead, if set)

- Payout amount (ONLY when status is `approved`, `disbursed`, or `failed` — NOT for `pending`)
- Payment reference — for `disbursed` payouts
- Payout date (`disbursed_at`) — for `disbursed` payouts
- `failure_reason` — for `failed` payouts
- Total earned (sum of `disbursed` amounts)

4. **`pending` amount hidden**: Verify that pending payout cards for `pending` status do NOT display payout amount. They show prospective bounty instead (as reference).
5. **`failed` shown safely**: Verify `failed` payouts appear in failed section with `failure_reason` and without admin IDs.
6. **`voided` excluded**: Verify that `voided` payouts do NOT appear in Pending, Disbursed, or Failed sections. Guard sees the payout "disappear" — no explicit "Voided" display.
7. **Edge case — guard with BANNED or INACTIVE status**: `requireGuard` enforces `status === "ACTIVE"` — both BANNED and INACTIVE guards are blocked at the auth level and cannot access the earnings page. No special handling needed in this epic. Admin can view a guard's earnings via `payouts.list` with `guard_user_id` filter. **⚠️ P11 migration note**: P11-E01-T01 will later migrate `payouts.getGuardEarnings` from `requireGuard` to `requireGuardAuth` so INACTIVE guards can view their earnings history. Do not write hard assertions that INACTIVE guards must be blocked from this query.
8. **Edge case — payout for banned/inactive guard**: Admin CAN create payouts for banned/inactive guards (the lead was valid). Guard can see their earnings once reactivated. No special handling in earnings query — `requireGuard` blocks non-ACTIVE guards at auth level.
9. If any data privacy leak is found, fix it in the backend query (P09-E01-T05) or frontend component, not by adding ad-hoc filters.

### Deliverables

- [ ] Verification: `payouts.getGuardEarnings` response shape confirmed to exclude admin-only fields
- [ ] Verification: `pending` payout cards confirmed to hide `amount_paise`
- [ ] Verification: `failed` payouts confirmed shown in failed section with `failure_reason`
- [ ] Verification: `voided` payouts confirmed excluded from all sections
- [ ] Verification: BANNED/INACTIVE guards are blocked by `requireGuard` (cannot access earnings page)
- [ ] Fix any data privacy leaks found during verification (in backend or frontend)

### Acceptance Criteria

1. `payouts.getGuardEarnings` response does NOT contain any of these admin-only fields (same denylist as E01-T05 acceptance criterion): `commission_amount`, `brokerage_tenant_side`, `brokerage_owner_side`, `rent_agreement_storage_id`, `additional_documents`, closure `notes`, `demorentals_deal_id`, `approved_by`, `voided_by`, `closed_by_admin_id`.
2. Guard earnings UI for `pending` payouts does NOT display payout amount anywhere.
3. Guard earnings UI for `approved` payouts DOES display payout amount.
4. Guard earnings UI renders `failed` payouts in a dedicated failed section with `failure_reason`.
5. Guard earnings UI does NOT render any `voided` payouts in any section.
6. BANNED and INACTIVE guards are blocked by `requireGuard` — they cannot access `/guard/earnings`. Verify the query throws for non-ACTIVE guards.
7. No admin-only data is exposed in any component prop, network response, or rendered DOM element.
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual privacy audit:

1. Call `getGuardEarnings` via dev tools / Convex dashboard as guard user — inspect response shape for any admin-only field leaks.
2. Render `/guard/earnings` with `pending` payout — inspect DOM for hidden amount.
3. Create a `failed` payout — confirm it appears in failed section with `failure_reason` and no admin IDs.
4. Create a `voided` payout — confirm it does not appear on earnings page.
5. Verify `requireGuard` blocks INACTIVE/BANNED guards from accessing `getGuardEarnings`.

### Out of Scope

- Admin-facing guard earnings view (admin uses `payouts.list` with guard filter)
- Guard profile page earnings summary (P10 may add this)
- i18n for earnings page (P14)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- Added new guard earnings route at `/guard/earnings` with mobile-first section layout (Pending, Disbursed, Failed), centered loading spinner, and empty-state copy.
- Replaced the 5th guard bottom-nav tab from Profile to Earn in `grid-cols-5` layout using `Banknote` icon and `/guard/earnings` route.
- Implemented pending payout card logic with privacy-aware rendering: `pending` shows prospective bounty only, `approved` shows payout amount and "Approved (payment soon)" label.
- Implemented disbursed payout history cards, neutral-styled failed payout cards with `failure_reason`, and Total Earned summary at bottom of Disbursed section via `formatINR(total_earned)`.
- Verified guard privacy behavior with Convex runtime checks: guard response shape contains no admin-only financial fields, and `requireGuard` blocks both INACTIVE and BANNED guards.

### Key File Locations

| File                                                                | What                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/app/(guard)/guard/earnings/page.tsx`                           | Main guard earnings page with all three sections, failed payout rendering, and total earned placement |
| `src/app/(guard)/guard/earnings/components/pending-payout-card.tsx` | Pending/approved payout card with status-specific amount visibility                                   |
| `src/app/(guard)/guard/earnings/components/paid-payout-card.tsx`    | Disbursed payout card with amount, disbursed date, and payment reference                              |
| `src/app/(guard)/guard/earnings/components/earnings-summary.tsx`    | Total earned summary component using paise-safe formatting                                            |
| `src/app/(guard)/guard-layout-client.tsx`                           | Guard bottom navigation update (Profile → Earn)                                                       |

### Deviations from Spec

None — implemented to spec; verification includes runtime auth/privacy checks via `convex run` in addition to compile/build checks.

### Gotchas for Next Epic

- `formatINR` expects paise directly; do not convert with `paiseToRupees()` before calling it.
- `api.payouts.*` client references depend on fresh Convex generated types; regenerate when payout module signatures change.
- For auth-behavior verification, `guards:updateStatusInternal` and `guards:banGuardInternal` are useful for temporary non-ACTIVE guard states, then restore with `guards:updateStatusInternal`.
