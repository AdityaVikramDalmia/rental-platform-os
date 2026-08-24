---
id: P22-E05
title: Admin Referral Management & User Dashboard
phase: 22
status: pending
depends_on: ["P22-E04"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P22-E05: Admin Referral Management & User Dashboard

## Overview

Build the full referral operations and visibility surface after milestone backend completion: an admin referral management queue at `/admin/referrals`, a referral configuration page at `/admin/settings/referrals`, a reusable user-facing referral dashboard component, and referral analytics integration in admin reporting. This epic completes the operator and end-user UI loop for the referral system while preserving privacy constraints for referred users.

## Prerequisites

- **Read first**: [P22-E04 Completion Summary](P22-E04-milestone-engine-bonus-triggers.md#completion-summary) - referral/milestone lifecycle mutations and enrichment queries must be stable before these admin and dashboard surfaces are built.
- `convex/referrals.ts` and `convex/referralConfig.ts` contracts from earlier epics are the source of truth; this epic only consumes those APIs and adds one analytics query extension.
- Admin page composition pattern from `src/app/(admin)/admin/leads/page.tsx` must be reused: permission gate -> filters/tabs -> table -> detail panel state handoff.
- Admin settings visual pattern from `src/app/(admin)/admin/settings/page.tsx` must be preserved: card-grouped sections, edit dialogs/forms, explicit validation messages, and mutation toasts.
- Referral statuses and milestone statuses follow `notes/04-state-machines.md` and cannot introduce extra transitions.
- Money display must always format paise to INR in UI; no raw paise values in tables or panels.
- Guard and DemoRentals referral programs remain separate in behavior, but admin management page spans all referral types.
- User dashboard privacy rule is strict: no referred-user PII should appear in shared referral dashboard views.

## Task Queue

- [ ] P22-E05-T01: Admin Referral Management Page (`/admin/referrals`) + Sidebar Navigation
- [ ] P22-E05-T02: Admin Referral Config Page (`/admin/settings/referrals`)
- [ ] P22-E05-T03: Shared User Referral Dashboard Component
- [ ] P22-E05-T04: Referral Analytics Query + Admin Analytics Integration

---

## T01: Admin Referral Management Page (`/admin/referrals`) + Sidebar Navigation

### Objective

Create the admin referral queue page with permission-gated access, filterable/paginated table, referral detail sheet, milestone action controls, and attribution override flow so referral operations can be managed without leaving the admin console.

### Required Reading

- `notes/features/17-referral-system.md` - Flow 4, admin override, and admin analytics user stories
- `notes/06-admin-panel-ux.md` - global admin table patterns and side panel conventions
- `notes/04-state-machines.md` - referral and referral milestone transitions
- `src/app/(admin)/admin/leads/page.tsx` - canonical admin route composition and permission gating
- `src/app/(admin)/admin-layout-client.tsx` - sidebar item structure and permission-scoped visibility
- `lib/constants.ts` - referral status/type enums, permission keys, and status color maps from prior epics
- `convex/referrals.ts` - `listAll`, `getById`, `overrideAttribution`, `void` contracts
- `convex/referralMilestones.ts` - `approve`, `markPaid`, `void` contracts

### Key Rules

1. Create route `src/app/(admin)/admin/referrals/page.tsx` and preserve admin URL-prefix routing convention (`/admin/referrals`).
2. Permission gate is mandatory: page requires `PERMISSIONS.REFERRALS_VIEW` and must render explicit no-access UI for unauthorized admins.
3. Add new admin sidebar nav item in `src/app/(admin)/admin-layout-client.tsx` with `label: "Referrals"`, `href: "/admin/referrals"`, and `requiredPermission: PERMISSIONS.REFERRALS_VIEW`.
4. Table must source data from `usePaginatedQuery(api.referrals.listAll, ...)` with `referral_type` filters (`GUARD`, `TENANT_FINDING`, `OWNER_FINDING`) and `status` filters (`PENDING`, `QUALIFIED`, `PARTIALLY_PAID`, `FULLY_PAID`, `VOIDED`).
5. Table column order is fixed: `#`, `Referrer`, `Referred User`, `Type`, `Status`, `Total Bonus`, `Created`.
6. `Total Bonus` must be INR-formatted from paise (sum of referral milestones, or enriched total from query) and never shown as raw integer.
7. `Created` must use relative time style to align with existing admin queue scannability.
8. Clicking a row sets selected referral ID and opens a shadcn `Sheet` detail panel; filter changes must clear stale selected-row state.
9. Detail panel uses `useQuery(api.referrals.getById, { id })` and must render: referrer details, referred-user details, referral type/status, created/updated timing, associated lead/listing/closure links where present.
10. Milestones sub-table in panel must show: milestone type, amount, status, triggered_at, paid_at.
11. Milestone action visibility must obey transition legality:
    - show `Approve` only for `TRIGGERED`
    - show `Mark Paid` only for `APPROVED`
    - show `Void` only for non-terminal milestone states where mutation allows voiding
12. Referral-level action `Void Referral` is required and must include required reason input before calling referral void mutation.
13. Attribution override flow is required in the detail panel via dialog with:
    - referral code input (manual entry)
    - required override reason field
    - mutation call to `referrals.overrideAttribution`
14. Override success path must communicate cascade behavior: old referral/milestones voided, new attribution created atomically.
15. Action buttons must be pending-safe (disabled + loading state) and use sonner toasts for success/error outcomes.
16. Keep implementation page-level state and composition consistent with `src/app/(admin)/admin/leads/page.tsx` patterns.
17. Do not move referral payout logic into guard `payouts` table UI; referral milestone actions stay in referral management surfaces only.

### Deliverables

- [ ] `src/app/(admin)/admin/referrals/page.tsx` - referral queue route with permission gate, filters, table composition, and detail-panel state
- [ ] `src/components/admin/referral-table.tsx` - paginated referral table with required columns and row selection callback
- [ ] `src/components/admin/referral-detail-panel.tsx` - detail sheet with milestone table, transition-safe actions, and override attribution dialog
- [ ] `src/app/(admin)/admin-layout-client.tsx` - add `Referrals` sidebar navigation item with permission guard

### Acceptance Criteria

1. `/admin/referrals` is accessible to admins with `REFERRALS_VIEW` and blocked for admins without it.
2. Referral type and status filters are functional and wired to `referrals.listAll`.
3. Table column set and order match spec exactly.
4. Detail panel renders enriched referral context and milestones from `referrals.getById`.
5. Milestone actions only appear for legal transitions and call the expected backend mutation.
6. `Void Referral` requires a reason and updates UI reactively.
7. Override attribution dialog includes referral code + reason and calls override mutation successfully.
8. Sidebar includes `Referrals` item at `/admin/referrals` with permission-based visibility.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/referrals/page.tsx`, `src/components/admin/referral-table.tsx`, `src/components/admin/referral-detail-panel.tsx`, and `src/app/(admin)/admin-layout-client.tsx`.

### Out of Scope

- Referral schema/constants/backend lifecycle implementation from P22-E01 through P22-E04
- New payout ledger tables or integration with guard payout board
- Public referral landing-page UX (`(public)/ref/[code]`)

---

## T02: Admin Referral Config Page (`/admin/settings/referrals`)

### Objective

Build a dedicated referral settings page under admin settings to manage global/society/building referral configuration, including split validation and override precedence visibility.

### Required Reading

- `notes/features/17-referral-system.md` - admin referral configuration requirements and precedence rules
- `notes/13-constants-reference.md` - referral type/scope enums and default split semantics
- `src/app/(admin)/admin/settings/page.tsx` - settings card structure and form/edit patterns
- `notes/06-admin-panel-ux.md` - admin settings UX expectations
- `convex/referralConfig.ts` - `list` and `upsert` API contracts from P22-E01
- `convex/societies.ts` and `convex/buildings.ts` query shapes for scope pickers

### Key Rules

1. Create route `src/app/(admin)/admin/settings/referrals/page.tsx` nested under admin settings hierarchy.
2. Permission gate is mandatory: page requires `PERMISSIONS.REFERRALS_CONFIGURE`.
3. Primary data source is `useQuery(api.referralConfig.list)` showing all active/inactive config rows.
4. Config table must display, at minimum: `scope_type`, `scope_id`/scope label, `referral_type`, `sign_up_bonus`, `finding_bonus_total`, `publish_split_pct`, `closure_split_pct`, `is_active`, and updated metadata.
5. Add/Edit dialog must use `react-hook-form` + `zod` + `zodResolver` and follow existing settings form conventions.
6. Form fields required: referral type selector (`GUARD`, `TENANT_FINDING`, `OWNER_FINDING`), scope type selector (`GLOBAL`, `SOCIETY`, `BUILDING`), scope picker when scope is not `GLOBAL`, amount fields (`sign_up_bonus`, `finding_bonus_total`), split fields (`publish_split_pct`, `closure_split_pct`), and `is_active` toggle.
7. Money fields should be user-entered as rupees but stored/submitted as paise integers using shared money utilities.
8. Validation is strict: `publish_split_pct + closure_split_pct` must equal exactly `100`; block submit with inline error otherwise.
9. Scope validation behavior: `GLOBAL` requires no scope id, `SOCIETY` requires society scope id, and `BUILDING` requires building scope id.
10. Include explanatory helper text describing fallback precedence exactly: `Building > Society > Global`.
11. Mutations use `referralConfig.upsert`; show optimistic pending state and success/error toasts.
12. Existing row edit flow must prefill dialog fields and preserve typing precision for split percentages and amounts.
13. Keep page styling and section cards consistent with `src/app/(admin)/admin/settings/page.tsx`.

### Deliverables

- [ ] `src/app/(admin)/admin/settings/referrals/page.tsx` - referral config settings route with permission gate and list view
- [ ] `src/components/admin/referral-config-form-dialog.tsx` - add/edit referral config dialog with validation and scope picker logic

### Acceptance Criteria

1. `/admin/settings/referrals` renders for admins with `REFERRALS_CONFIGURE` and blocks unauthorized admins.
2. Config list displays all rows from `referralConfig.list` with required scope/type/amount/split fields.
3. Add/Edit dialog supports all required referral and scope options.
4. Split-percentage validation prevents submit when values do not sum to 100.
5. Amount inputs are converted correctly between rupees UI and paise mutation payloads.
6. Precedence explanation text is visible on page and states `Building > Society > Global`.
7. Config writes succeed through `referralConfig.upsert` and refresh list reactively.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/settings/referrals/page.tsx` and `src/components/admin/referral-config-form-dialog.tsx`.

### Out of Scope

- Referral program lifecycle actions (approve/mark-paid/void) from `/admin/referrals`
- User-facing referral dashboard rendering
- Schema-level referral config changes

---

## T03: Shared User Referral Dashboard Component

### Objective

Create a reusable shared referral dashboard component that can render referral code-sharing and earnings visibility for DemoRentals users while preserving privacy constraints for referred users.

### Required Reading

- `notes/features/17-referral-system.md` - tenant/owner "My Referrals" user story and acceptance criteria
- `notes/13-constants-reference.md` - referral status enum values
- `src/app/(guard)/guard/earnings/page.tsx` - guard earnings composition and insertion point patterns
- `src/components/shared/*-status-badge.tsx` - shared component API conventions
- `convex/referrals.ts` - `listByReferrer` response shape
- `convex/referralCodes.ts` - `getByUser` response shape

### Key Rules

1. Create `src/components/shared/referral-dashboard.tsx` as a shared component consumable by guard and tenant surfaces.
2. Component must query and render referral list via `referrals.listByReferrer` for the current authenticated user.
3. Component must query referral code via `referralCodes.getByUser` and show code + share URL only when code exists (DemoRentals users).
4. For guard users without referral codes, component still renders referral earnings/status section without code-share block.
5. Privacy is non-negotiable: referred users are anonymized in dashboard list (for example `User #1`, `User #2`); do not render name, phone, or email.
6. Earnings summary cards must show: sign-up bonuses earned, listing-publish bonuses earned, closure bonuses earned, and total earned.
7. Status indicators per referral must support and visibly distinguish:
   - `PENDING`
   - `QUALIFIED`
   - `PARTIALLY_PAID`
   - `FULLY_PAID`
   - `VOIDED`
8. Include copy-to-clipboard action for share URL with success/failure toast feedback.
9. Include Web Share API action when browser support exists; hide or disable gracefully when unsupported.
10. Share URL generation must reuse project URL helper logic (do not hardcode inconsistent URL patterns inside JSX).
11. Component API should support immediate use in guard earnings page integration from E02-T03 and future tenant dashboard routes.
12. Keep UI responsive and compact for guard mobile surfaces while still rendering cleanly in desktop tenant/admin contexts.
13. No referral-management actions (approve/void/override) are allowed in this component.

### Deliverables

- [ ] `src/components/shared/referral-dashboard.tsx` - reusable referral dashboard with privacy-safe referral list, earnings summary, and share actions
- [ ] `src/app/(guard)/guard/earnings/page.tsx` - integrate dashboard (or composed referral section wrapper) for guard referral visibility

### Acceptance Criteria

1. Shared component renders referral list and earnings totals from `referrals.listByReferrer`.
2. Referral code and share URL render only when `referralCodes.getByUser` returns a code.
3. Referred-user identities are anonymized; no PII appears in the dashboard list.
4. Copy link and Web Share interactions work with proper success/fallback behavior.
5. All five referral statuses render with clear visual distinction.
6. Guard earnings surface displays referral section using shared dashboard component.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/shared/referral-dashboard.tsx` and `src/app/(guard)/guard/earnings/page.tsx`.

### Out of Scope

- Tenant dashboard page route creation if tenant dashboard does not yet exist
- Referral attribution override or milestone payout actions
- Analytics charts and top-referrer ranking surfaces

---

## T04: Referral Analytics Query + Admin Analytics Integration

### Objective

Add a referral analytics query in `convex/referrals.ts` and surface referral KPI/funnel cards in admin analytics so operators can track referral program performance across referral types.

### Required Reading

- `notes/features/17-referral-system.md` - admin analytics requirements and funnel expectations
- `notes/06-admin-panel-ux.md` - admin dashboard/analytics presentation conventions
- `src/app/(admin)/admin/analytics/page.tsx` (or current analytics route components) - existing KPI card integration pattern
- `convex/referrals.ts` - existing referral query structure and admin auth helpers
- `convex/auth.helpers.ts` - permission guard patterns for admin-only queries

### Key Rules

1. Add `getAnalytics` query to `convex/referrals.ts` (admin-only) with optional args:
   - `date_from?: number`
   - `date_to?: number`
2. Query must validate admin access with referral analytics view permission (`REFERRALS_VIEW` or analytics permission per constants policy).
3. `getAnalytics` response must include totals by `referral_type` with both count and total bonus paid/approved in paise.
4. Response must include totals by referral status for operational monitoring.
5. Response must include conversion funnel metrics:
   - `codes_generated`
   - `signups_captured`
   - `deals_closed`
6. Date filtering (when provided) must be applied consistently across all returned aggregates.
7. Integrate analytics output into existing admin analytics surface (preferred `src/app/(admin)/admin/analytics/page.tsx`) via dedicated referral stats section.
8. Add funnel card/visual that clearly shows progression `codes_generated -> signups_captured -> deals_closed`.
9. Display all money values in formatted INR in UI while preserving paise in backend response.
10. Keep analytics integration read-only; no mutation actions from this section.
11. Preserve real-time update behavior by using Convex query subscriptions where applicable.

### Deliverables

- [ ] `convex/referrals.ts` - `getAnalytics` admin query with optional date window and funnel aggregates
- [ ] `src/app/(admin)/admin/analytics/page.tsx` - referral analytics section integration (or equivalent analytics route component used in current codebase)

### Acceptance Criteria

1. `api.referrals.getAnalytics` exists and returns type/status/funnel aggregates with optional date filtering.
2. Query enforces admin authorization and rejects unauthorized callers.
3. Analytics page shows referral totals and conversion funnel using query output.
4. Funnel card displays `codes_generated -> signups_captured -> deals_closed` in clear order.
5. Referral bonus totals are displayed in INR and sourced from paise values.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/referrals.ts` and `src/app/(admin)/admin/analytics/page.tsx` (or the exact analytics UI file updated).

### Out of Scope

- AI predictor widget on listing finalization surfaces
- Top-referrer leaderboard and advanced cohort analytics
- Export/download reporting features

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
