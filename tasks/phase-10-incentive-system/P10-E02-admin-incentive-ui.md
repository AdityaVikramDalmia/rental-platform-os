---
id: P10-E02
title: Admin Incentive UI
phase: 10
status: done
depends_on: ["P10-E01", "P04-E03", "P01-E08"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P10-E02: Admin Incentive UI

## Overview

Build the admin incentive workspace end-to-end: activate the Incentives sidebar entry, ship `/admin/incentives` with three tabs (Pending Suggestions, Active Cards, Configuration), implement the confirm/reject workflow for auto-suggestions, deliver the active cards table with manual award dialog and expiry controls, build the configuration panel for auto-award thresholds reading/writing system_config, and integrate an "Incentives" tab into the existing guard detail page.

## Prerequisites

- **Read first**: [P10-E01 Completion Summary](P10-E01-incentive-backend.md#completion-summary) — all incentive APIs used here (`listPending`, `listActive`, `getByGuard`, `confirm`, `reject`, `manualAward`, `expire`) are expected to exist. Shared `incentive-card-badge.tsx` created in E01-T01.
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — reuse established admin sidebar/table/filter/detail patterns.
- **Read first**: [P01-E08 Completion Summary](../phase-01-auth/P01-E08-seed-and-config.md#completion-summary) — system config CRUD and settings page exist. All 13 incentive threshold keys already seeded. Settings page at `/admin/settings` already has "Incentive Thresholds" section — this epic builds a SEPARATE config panel within `/admin/incentives` that uses the same config read/write APIs.

## Task Queue

- [x] P10-E02-T01: Admin Sidebar + Incentive Management Page Shell
- [x] P10-E02-T02: Pending Suggestions Tab
- [x] P10-E02-T03: Active Cards Tab + Manual Award Dialog
- [x] P10-E02-T04: Configuration Panel
- [x] P10-E02-T05: Guard Profile → Incentives Tab Integration

---

## T01: Admin Sidebar + Incentive Management Page Shell

### Objective

Enable incentive navigation in the admin sidebar and create the `/admin/incentives` page shell with 3-tab layout (Pending Suggestions, Active Cards, Configuration).

### Required Reading

- `notes/features/08-incentive-system.md` — "Admin Panel UI" section (tabs, tables, configuration)
- `notes/06-admin-panel-ux.md` — Sidebar nav (🏆 Incen. positioned after Pay), Flow 6: Guard Management
- `notes/13-constants-reference.md` — `incentives.view` permission
- `tasks/phase-09-payouts/P09-E02-admin-payout-ui.md` — T01 pattern for admin page shell

### Key Rules

1. Update `src/app/(admin)/admin-layout-client.tsx` to activate the existing `Incentives` nav item (already present as a placeholder with `BadgeIndianRupee` icon from a prior phase). **⚠️ It currently has NO `requiredPermission`** — add `requiredPermission: "incentives.view"` to RBAC-gate it. Keep existing `BadgeIndianRupee` icon (matches current admin nav).
2. Keep nav ordering as: Payouts → Incentives → (management section).
3. Route file is `src/app/(admin)/admin/incentives/page.tsx`, follows existing desktop-first admin page conventions.
4. Page shell has 3 tabs using shadcn `Tabs` component: "Pending Suggestions", "Active Cards", "Configuration".
5. Default active tab is "Pending Suggestions" (this is where admin action is most needed).
6. Tab selection synced to URL query param `?tab=pending|active|config` so tabs are linkable.
7. Page title: "Incentive Management".

### Deliverables

- [ ] `src/app/(admin)/admin-layout-client.tsx` — Incentives nav item enabled, gated by `incentives.view`, after Payouts
- [ ] `src/app/(admin)/admin/incentives/page.tsx` — Page shell with 3-tab layout, URL-synced tab state

### Acceptance Criteria

1. Incentives nav item active in sidebar with `href: "/admin/incentives"`, icon `BadgeIndianRupee`, gated by `incentives.view` via `requiredPermission`.
2. Positioned after Payouts in sidebar nav order.
3. `/admin/incentives` renders 3-tab layout with correct tab names.
4. Tab selection persisted in URL query param.
5. Default tab is "Pending Suggestions".
6. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on `/admin/incentives`: sidebar visibility by permission, tab names, default tab, URL param sync.

### Out of Scope

- Tab content (T02-T04)
- Guard profile integration (T05)

---

## T02: Pending Suggestions Tab

### Objective

Implement the Pending Suggestions tab showing auto-suggested cards awaiting admin confirmation, with Confirm/Reject action buttons.

### Required Reading

- `notes/features/08-incentive-system.md` — "Admin Panel UI → Pending Suggestions Table" wireframe
- `notes/13-constants-reference.md` — `incentives.award` permission for confirm/reject
- `notes/03-roles-and-permissions.md` — Ops Agent has `incentives.view` ONLY (no confirm/reject)

### Key Rules

1. Create `src/app/(admin)/admin/incentives/components/pending-suggestions-tab.tsx`.
2. Tab content uses `usePaginatedQuery(api.incentives.listPending, ..., { initialNumItems: 20 })`.
3. Table columns: Guard (name), Card Type (display name), Suggested Tier (from top-level `level` field), Metric Value (e.g., "27 verified leads"), Actions.
4. Actions column: [Confirm] and [Reject] buttons, both gated by `incentives.award` permission. HIDDEN (not disabled) when user lacks permission. Ops Agent sees no action buttons.
5. Confirm button calls `api.incentives.confirm({ card_id })`. Success toast: "Card confirmed!". On error (e.g., higher tier already exists), show error toast.
6. Reject button requires confirmation dialog: "Reject this suggestion? This suggestion will be rejected and removed from Pending Suggestions." Then calls `api.incentives.reject({ card_id })`. Success toast: "Suggestion rejected".
7. Use `IncentiveCardBadge` from `src/components/shared/incentive-card-badge.tsx` for card_type + status/tier display.
8. Empty state: "No pending suggestions" with supportive text.
9. Load more pagination at bottom.

### Deliverables

- [ ] `src/app/(admin)/admin/incentives/components/pending-suggestions-tab.tsx` — Pending suggestions table with confirm/reject actions
- [ ] `src/app/(admin)/admin/incentives/page.tsx` — Wire pending tab content

### Acceptance Criteria

1. Table shows pending suggestions using status + metadata filters (`status: "active"`, `metadata.award_source: "auto"`, `metadata.review_state: "pending"`).
2. All 4 required columns render correctly.
3. Confirm/Reject buttons HIDDEN when user lacks `incentives.award`.
4. Confirm calls correct API and shows success/error toast.
5. Reject shows confirmation dialog then calls correct API.
6. Empty state renders when no suggestions.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual tab checks: verify Ops Agent sees no action buttons, confirm happy path, reject with dialog, empty state.

### Out of Scope

- Active cards tab (T03)
- Configuration panel (T04)
- Guard profile integration (T05)

---

## T03: Active Cards Tab + Manual Award Dialog

### Objective

Implement the Active Cards tab showing all currently active cards across guards, with filters, expiry control, and a Manual Award dialog for admin to award cards to any guard.

### Required Reading

- `notes/features/08-incentive-system.md` — "Manual Award Flow", expiry/soft-reject section
- `notes/13-constants-reference.md` — `incentives.award`, `incentives.expire` permissions, card type values
- `notes/03-roles-and-permissions.md` — permission distribution

### Key Rules

1. Create `src/app/(admin)/admin/incentives/components/active-cards-tab.tsx`.
2. Create `src/app/(admin)/admin/incentives/components/manual-award-dialog.tsx`.
3. Active cards table uses `usePaginatedQuery(api.incentives.listActive, { guard_user_id?, card_type? }, { initialNumItems: 20 })`.
4. Table columns: Guard (name), Card Type (display name with badge), Tier (from top-level `level` field — BRONZE/SILVER/GOLD/PLATINUM), Award Source (from `awarded_method` field — AUTO/MANUAL), Earned Date, Actions.
5. Filters: Guard (searchable dropdown -> guard_user_id), Card Type (single-select dropdown: `lead_milestone`, `visit_milestone`, `quality_streak`, `speed_bonus`, `monthly_top` with display-label mapping). **Note**: Backend `listActive` accepts a single optional `card_type`; use single-select to match the API contract. For "All" view, omit the filter parameter.
6. Actions column: [Expire] button, gated by `incentives.expire` permission. HIDDEN when user lacks permission.
7. Expire requires confirmation dialog with REQUIRED reason input: "Reason for expiry (required):". Then calls `api.incentives.expire({ card_id, reason })`. Success toast: "Card expired".
8. Top-right: "Award Card" button, gated by `incentives.award` permission. HIDDEN when user lacks permission.
9. Manual Award Dialog (shadcn Dialog + react-hook-form + zod):
   - Guard selector (searchable dropdown of ACTIVE guards)
   - Card Type selector (5 options, schema values)
   - Title input, description textarea, badge_icon input, reward amount input (paise)
   - Level selector (BRONZE/SILVER/GOLD/PLATINUM — REQUIRED, maps to top-level `level` field)
   - Optional reason field (stored in `metadata.reason`)
   - Submit calls `api.incentives.manualAward`. Success toast: "Card awarded!". Error toast on failure.
10. Use `IncentiveCardBadge` from shared component.

### Deliverables

- [ ] `src/app/(admin)/admin/incentives/components/active-cards-tab.tsx` — Active cards table with filters and expire action
- [ ] `src/app/(admin)/admin/incentives/components/manual-award-dialog.tsx` — Manual award dialog with guard/type/title/description/icon/reward + metadata
- [ ] `src/app/(admin)/admin/incentives/page.tsx` — Wire active tab and award dialog

### Acceptance Criteria

1. Active cards table shows `status: "active"` cards.
2. Filters work for guard and card type.
3. Expire button HIDDEN when lacking `incentives.expire`. Shows confirmation dialog with required reason.
4. "Award Card" button HIDDEN when lacking `incentives.award`.
5. Manual award dialog validates required schema fields (`card_type`, `level`, `title`, `description`, `badge_icon`, `reward_amount_paise`) and supports optional metadata reason.
6. Manual award calls correct API, shows success/error toast, closes dialog.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual tab checks: apply guard/type filters, test expire with required reason, test award dialog with schema card types and required fields, verify optional metadata reason handling; tier/level validated via required top-level `level`, verify permission-gated buttons hidden for Ops Agent.

### Out of Scope

- Configuration panel (T04)
- Guard profile integration (T05)

---

## T04: Configuration Panel

### Objective

Implement the Configuration tab that reads and writes incentive auto-award thresholds from `system_config`.

### Required Reading

- `notes/features/08-incentive-system.md` — "Configuration Panel" with all config keys and defaults
- `notes/13-constants-reference.md` — System Config Keys: all 13 incentive threshold keys with defaults
- `notes/06-admin-panel-ux.md` — Settings page "Incentive Thresholds" section reference

### Key Rules

1. Create `src/app/(admin)/admin/incentives/components/incentive-config-panel.tsx`.
2. Configuration is gated by `incentives.manage` permission. The tab itself is always visible (part of the 3-tab layout), but its content is replaced with a "You don't have permission to manage thresholds" message when the user lacks `incentives.manage`. This follows the pattern: tabs are structural (always shown), content is permission-gated.
3. Configuration form reads current values from `system_config` and presents them in grouped sections.
4. **`lead_milestone` section (UI label: "Lead Milestone")**: Bronze [10], Silver [25], Gold [50], Platinum [100] — all number inputs.
5. **`visit_milestone` section (UI label: "Visit Milestone")**: Bronze [10], Silver [25], Gold [50], Platinum [100] — all number inputs.
6. **`quality_streak` section (UI label: "Quality Streak")**: Bronze [70%], Silver [80%], Gold [90%], Platinum [95%] — all number inputs (percentage). Plus "Minimum leads before quality rate applies" [10].
7. Config keys follow existing seeded key pattern (for example, `incentive_lead_submitter_bronze`) and map those groups to schema card_type UI sections above. Quality min-leads key: `incentive_quality_champion_min_leads` (used by `quality_streak`).
8. Save button per section (not one global save). Calls existing system_config update mutation for each changed key.
9. Use `react-hook-form` + `zod` for validation. All values must be positive numbers. Percentage values 0-100. Threshold must increase per tier band (bronze < silver < gold < platinum) — validate on save.
10. Success toast: "Thresholds updated!". Error toast on failure.
11. Values are stored as JSON-encoded strings in `system_config.value`. Parse on read with `JSON.parse()`.

### Deliverables

- [ ] `src/app/(admin)/admin/incentives/components/incentive-config-panel.tsx` — Threshold configuration form with grouped sections and per-section save
- [ ] `src/app/(admin)/admin/incentives/page.tsx` — Wire config tab content

### Acceptance Criteria

1. Config tab is always visible in the tab bar, but content shows "You don't have permission to manage thresholds" when user lacks `incentives.manage`.
2. Form displays all 13 threshold values grouped by card type.
3. Current values loaded from system_config.
4. Validation: positive numbers, percentages 0-100, ascending thresholds per card type.
5. Save per section calls system_config update for each changed key.
6. Success/error toasts via sonner.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual config checks: verify Ops Agent sees "You don't have permission to manage thresholds" message on config tab (tab itself is VISIBLE per Key Rule 2, but content is permission-gated), load current values as Finance/Super Admin, edit a threshold, save section, verify toast, verify ascending threshold validation fires on invalid input.

### Out of Scope

- Guard profile integration (T05)
- Backend config mutations (already exist from P01-E08)

---

## T05: Guard Profile → Incentives Tab Integration

### Objective

Replace the existing "Incentives" tab placeholder content on the admin guard detail page with live incentives UI showing the guard's cards and providing an "Award Card" button.

### Required Reading

- `notes/06-admin-panel-ux.md` — Flow 6: Guard Management (Incentives tab listed)
- `notes/features/08-incentive-system.md` — "Admin Panel UI" and guard-specific card management

### Key Rules

1. Modify the guard detail page (or guard detail panel, depending on existing implementation — check `/admin/guards/[id]` or guard detail side panel pattern from P03).
2. Use the existing "Incentives" tab placeholder in `src/app/(admin)/admin/guards/[id]/page.tsx`; do NOT add a new tab. Replace placeholder content with live incentives UI.
3. Tab content uses `useQuery(api.incentives.getByGuard, { guard_user_id })` — shows ALL cards for this guard (active + expired/redeemed), not just active.
4. Cards displayed as a list/grid with `IncentiveCardBadge` component. Active cards prominent, non-active cards greyed out with status label (`expired`/`redeemed`) and metadata review label when applicable.
5. "Award Card" button at top of tab, gated by `incentives.award`. Opens the manual-award-dialog from T03, pre-filled with this guard.
6. "Expire" action available on active cards, gated by `incentives.expire`. Same expiry flow as T03.
7. If guard has no cards, show empty state: "No incentive cards for this guard".

### Deliverables

- [ ] Guard detail page/panel — Replace existing "Incentives" tab placeholder content with guard's cards, award button, expire action
- [ ] Reuse `manual-award-dialog.tsx` from T03 in guard-context mode (guard pre-selected)

### Acceptance Criteria

1. Existing Incentives tab placeholder now renders live incentives content on the guard detail page.
2. Tab shows ALL cards for the guard (active + expired/redeemed).
3. Active cards shown prominently, non-active shown greyed with status label.
4. "Award Card" button opens manual-award dialog pre-filled with guard.
5. "Expire" action available on active cards only, permission-gated.
6. Empty state renders when guard has no cards.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual guard detail checks: open a guard with cards, verify all cards show (active + expired/redeemed), verify "Award Card" opens dialog pre-filled, verify expire flow, verify empty state on guard with no cards.

### Out of Scope

- Guard-facing badge display (P10-E03)
- Analytics on incentive data (P12)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- Admin sidebar Incentives nav item activated with `requiredPermission: "incentives.view"`, positioned after Payouts
- `/admin/incentives` page with 3 URL-synced tabs (Pending Suggestions, Active Cards, Configuration)
- **Pending Suggestions tab**: Paginated table with confirm/reject actions, guard name joins, permission-gated action buttons (HIDDEN for Ops Agent)
- **Active Cards tab**: Paginated table with guard/card-type filters, expire action (RHF+zod dialog with required reason), "Award Card" button (permission-gated)
- **Manual Award Dialog**: RHF+zod form with guard selector, card type, level, title, description, badge_icon, reward_amount_paise, optional reason. Reusable — accepts `defaultGuardUserId` + `lockGuardSelection` props
- **Configuration panel**: 3 grouped sections (Lead Milestone, Visit Milestone, Quality Streak) with per-section save, ascending threshold validation, RHF+zod forms
- **Guard detail Incentives tab**: Replaced placeholder with live cards via `getByGuard`, sorted (active first), Award Card button (pre-filled guard), Expire action on active cards

### Key File Locations

- Page shell: `src/app/(admin)/admin/incentives/page.tsx`
- Pending tab: `src/app/(admin)/admin/incentives/components/pending-suggestions-tab.tsx`
- Active tab: `src/app/(admin)/admin/incentives/components/active-cards-tab.tsx`
- Manual award: `src/app/(admin)/admin/incentives/components/manual-award-dialog.tsx`
- Config panel: `src/app/(admin)/admin/incentives/components/incentive-config-panel.tsx`
- Guard detail: `src/app/(admin)/admin/guards/[id]/page.tsx` (Incentives tab)
- Nav: `src/app/(admin)/admin-layout-client.tsx` (~line 96)

### Deviations from Spec

- Config panel UI now gates on `system.configure` permission (matching the backend `systemConfig.set` mutation requirement) instead of `incentives.manage`. The spec said `incentives.manage` but the backend enforces `system.configure` — UI was corrected to match backend for RBAC consistency.
- Expire dialogs were initially implemented with `useState` + inline validation but were upgraded to `react-hook-form` + `zod` during Oracle review to match the "all forms use RHF+zod" convention.

### Gotchas for Next Epic

- `ManualAwardDialog` is imported by the guard detail page at `../../incentives/components/manual-award-dialog` — be aware of this cross-directory import if restructuring.
- Config panel uses `system.configure` permission, not `incentives.manage`. If the permission model changes, update both the page.tsx (where `hasSystemConfigure` is computed) and the config panel's `canManage` prop.
