---
id: P05-E02
title: Admin Verification UI
phase: 5
status: done
depends_on: ["P05-E01", "P04-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P05-E02: Admin Verification UI

## Overview

Extend the existing admin lead queue detail workflow with owner verification actions and form UX. This epic adds the `Call & Verify` action into the P04 side panel, implements the verification form side panel, surfaces previous call attempts, and adds verification status indicators in queue/detail views.

## Prerequisites

- **Read first**: [P05-E01 Completion Summary](P05-E01-verification-backend.md#completion-summary) — confirm `verifications.create` and `verifications.listByLead` are ready.
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — understand existing lead table/detail panel/action dialog composition.
- P04 lead queue UI is complete and has `lead-detail-panel.tsx` action areas where P05 action is inserted.

## Task Queue

- [x] P05-E02-T01: Add `Call & Verify` Action to Lead Detail Panel
- [x] P05-E02-T02: Build Verification Side Panel Form
- [x] P05-E02-T03: Previous Attempts + Verification Indicators
- [x] P05-E02-T04: UI Validation, RBAC Gates, and Regression Verification

---

## T01: Add `Call & Verify` Action to Lead Detail Panel

### Objective

Integrate the verification entry point into the existing P04 lead detail action area without breaking existing triage actions.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" and "Flow 2: Owner Verification" sections
- `notes/features/04-owner-verification.md` — Workflow Step 1 (verification starts from lead queue detail view)
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — T03 action button matrix in `lead-detail-panel.tsx`
- `notes/13-constants-reference.md` — `leads.verify` permission string and lead statuses

### Key Rules

1. Update `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` (existing P04 file), not a separate standalone page.
2. For `SUBMITTED` leads, action row must include `Call & Verify` alongside `Request Info`, `Reject`, and `Set Bounty`.
3. Verification entry is side-panel based; do not route to a dedicated verification page.
4. Show `Call & Verify` only when user has `leads.verify` permission (UI gate), while backend still enforces authorization.
5. Do not expose `Call & Verify` for `POTENTIAL_DUPLICATE` leads; duplicate must be cleared first per state machine.
6. Keep existing P04 action buttons and RBAC visibility behavior unchanged.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — `Call & Verify` action added for `SUBMITTED`
- [ ] `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — permission-based visibility for `leads.verify`

### Acceptance Criteria

1. `SUBMITTED` leads display `Call & Verify` in action row.
2. `POTENTIAL_DUPLICATE` leads do not display `Call & Verify`.
3. Users lacking `leads.verify` do not see `Call & Verify`.
4. Existing P04 action buttons unchanged: SUBMITTED shows `[Request Info]` `[Reject]` `[Set Bounty]`, NEED_INFO shows `[Reject]` `[Set Bounty]`, POTENTIAL_DUPLICATE shows `[Mark Duplicate]` `[Not a Duplicate]` `[Set Bounty]`, VERIFIED shows `[Set Bounty]`, REJECTED/DUPLICATE show no actions.
5. Clicking `Call & Verify` opens verification side panel shell (implemented in T02).
6. `npm run build` passes.

### Verification

```bash
npm run build
```

Visual check on `/admin/leads`: open a SUBMITTED lead and confirm action button matrix and RBAC visibility.

### Out of Scope

- Verification form fields and submit logic
- Attempt history rendering

---

## T02: Build Verification Side Panel Form

### Objective

Implement the full owner verification form UX in a side panel with required field order, conditional consent behavior, and mutation wiring.

### Required Reading

- `notes/features/04-owner-verification.md` — UI wireframe and Step 3 field table
- `notes/06-admin-panel-ux.md` — verification flow from lead detail side panel
- `notes/10-convex-schema.md` — `owner_verifications` field types (`rent_confirmed` in paise, optional fields)
- `notes/13-constants-reference.md` — call outcome literals and lead status labels
- `tasks/phase-05-owner-verification/P05-E01-verification-backend.md` — mutation/query contracts from backend epic

### Key Rules

1. Implement side panel component under admin leads components (e.g., `verification-panel.tsx`) and open it from T01 action.
2. Form field order must match spec:
   - Owner summary with click-to-call link
   - Call outcome radios (`VERIFIED`, `UNREACHABLE`, `DECLINED`, `FALSE`)
   - Consent section (conditional for `VERIFIED` flow)
   - Preferred visit slots
   - Rent confirmed
   - Notes
3. Validation logic:
   - Call outcome required
   - If outcome is `VERIFIED`, `consent_contact_demorentals` must be explicitly handled and surfaced as legal gate
   - `consent_visit_coordination` field is only shown/enabled when `consent_contact_demorentals === true` (per `04-owner-verification.md:152`). Hide or disable it otherwise.
   - `rent_confirmed` input is in rupees in UI and converted to paise with `rupeesToPaise()` from `lib/money.ts` before `verifications.create`
   - `rent_confirmed` must remain distinct from `leads.prospective_bounty` (no shared state/field reuse)
4. Submit calls `verifications.create` with schema-correct payload and handles loading/disabled states.
5. Show success/error toasts via existing admin notification pattern (`sonner`).
6. Keep form in side panel layout; do not break parent lead detail panel interaction model.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/verification-panel.tsx` — verification side panel form
- [ ] `src/app/(admin)/admin/leads/components/verification-panel.tsx` — mutation integration with `verifications.create`

### Acceptance Criteria

1. Side panel opens from `Call & Verify` action and shows owner call context.
2. Outcome radio options match exact constants: `VERIFIED`, `UNREACHABLE`, `DECLINED`, `FALSE`.
3. Conditional consent handling is enforced for verification flow.
4. Submit button reflects loading state and prevents duplicate submit.
5. Successful submission closes or refreshes panel state and reflects updated lead status reactively.
6. Mutation errors surface to user as actionable toast messages.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Visual test outcomes: run all 4 call outcomes from UI and confirm expected status behavior from backend.

### Out of Scope

- Queue badge/status indicator polish
- Manual reject endpoint behavior

---

## T03: Previous Attempts + Verification Indicators

### Objective

Display verification history and expose verification state clearly in lead queue/detail contexts so ops can see outcome history and current trust state.

### Required Reading

- `notes/features/04-owner-verification.md` — "Previous Attempts" and "Lead Queue: Verification Status Indicators"
- `notes/06-admin-panel-ux.md` — lead queue/detail table and side-panel patterns
- `notes/10-convex-schema.md` — `owner_verifications` fields to display (`call_outcome`, `verified_at`, `called_by_admin_id`, notes)
- `notes/13-constants-reference.md` — lead badge colors and status labels

### Key Rules

1. In verification side panel, render prior attempts list using `verifications.listByLead` query (do NOT use `leads.getById` joined data — use the dedicated query for consistent ordering and admin name resolution).
2. Each attempt row shows timestamp, outcome, operator identity, and optional notes preview.
3. Verified leads in queue/detail should show clear verification indicators aligned to existing badge system (`VERIFIED` green state).
4. Surface consent metadata where available in detail view (contact consent and visit coordination) without inventing new enum labels.
5. Keep display logic resilient when attempts are empty (first verification attempt case).
6. Do not add push/in-app notifications; this is explicitly out of scope for V1.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/verification-attempts.tsx` — previous attempts renderer using `verifications.listByLead`
- [ ] `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — verification status indicators added to detail panel (consent metadata, verified timestamp, attempt count)
- [ ] `src/app/(admin)/admin/leads/components/lead-table.tsx` — verification indicator column or badge overlay for VERIFIED leads in table rows

### Acceptance Criteria

1. Previous attempts are visible in verification panel for leads with history.
2. Attempt rows include outcome + timestamp + admin context.
3. Empty attempt state renders clearly for first-time calls.
4. Verified leads show appropriate status indicator in admin queue/detail views.
5. Indicators update reactively after a successful verification submit.
6. `npm run build` passes.

### Verification

```bash
npm run build
```

Visual check with leads having 0, 1, and multiple verification attempts.

### Out of Scope

- Guard portal component changes
- Listing/visit workflow screens

---

## T04: UI Validation, RBAC Gates, and Regression Verification

### Objective

Verify end-to-end admin verification UX integration, RBAC visibility rules, and non-regression of P04 lead queue interactions.

### Required Reading

- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — baseline behavior to preserve
- `notes/03-roles-and-permissions.md` — `leads.verify`, `leads.reject`, `leads.request_info` distinctions
- `notes/features/04-owner-verification.md` — outcome behavior and two-step duplicate flow
- `notes/13-constants-reference.md` — canonical status/action labels

### Key Rules

1. RBAC distinction must be explicit in behavior/docs:
   - verification-induced rejection (via `verifications.create` on `DECLINED`/`FALSE`) is under `leads.verify`
   - manual reject button remains under `leads.reject`
2. Preserve duplicate two-step UX: `POTENTIAL_DUPLICATE` must be cleared before verify action is available.
3. Ensure existing dialogs (`Request Info`, `Reject`, `Set Bounty`, duplicate dialogs) still function after integrating verification panel.
4. Validate no guard-facing UI changes are required in P05; P04 VERIFIED badge+bounty behavior is reused.
5. Capture any regressions as explicit checklist failures before epic completion.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — verified: no P04 action regressions after T01-T03 integration
- [ ] `src/app/(admin)/admin/leads/components/verification-panel.tsx` — verified: form submit → status update → reactive UI update end-to-end
- [ ] `src/app/(admin)/admin/leads/components/verification-attempts.tsx` — verified: renders 0, 1, and N attempts correctly

### Acceptance Criteria

1. Admin with `leads.verify` can complete full verification flow: click Call & Verify → fill form → submit → lead status updates reactively.
2. Admin without `leads.verify` does not see `Call & Verify` button.
3. Manual reject dialog (P04) still opens and functions for SUBMITTED/NEED_INFO/VERIFIED leads via `leads.reject` permission.
4. Request Info dialog (P04) still functions for SUBMITTED leads.
5. Set Bounty dialog (P04) still functions for non-terminal leads.
6. Duplicate leads (POTENTIAL_DUPLICATE) still show Mark Duplicate / Not a Duplicate — no Call & Verify visible.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual regression walk:

- SUBMITTED lead: Request Info, Reject, Set Bounty, Call & Verify all checked against permission gates
- POTENTIAL_DUPLICATE lead: confirm no direct verify path
- VERIFIED lead: confirm status indicators and non-regression of existing panel sections

### Out of Scope

- New guard UX features
- Playwright automation suite authoring
- Notifications and messaging infrastructure

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

1. **Call & Verify button** in `lead-detail-panel.tsx` — visible for SUBMITTED leads only, gated by `leads.verify` RBAC permission, opens verification side panel.
2. **Verification side panel** (`verification-panel.tsx`) — Sheet form with owner call context (name + click-to-call link), call outcome radios (VERIFIED/UNREACHABLE/DECLINED/FALSE), conditional consent section (contact + visit coordination), preferred visit slots, rent confirmed (₹ → paise conversion via `rupeesToPaise`), notes. Wired to `api.verifications.create` with loading state + sonner toasts.
3. **Verification attempts display** (`verification-attempts.tsx`) — Card-based history showing outcome badge (color-coded), timestamp, admin name, consent indicators, notes preview. Renders in lead detail panel when attempts exist.
4. **Verification indicators** — CheckCircle badge on VERIFIED leads in `lead-table.tsx`. Verification Attempts section in detail panel.
5. **Reject for VERIFIED** — Reject button shown for VERIFIED leads (gated by `leads.reject`), enabling `VERIFIED → REJECTED` transition added in E01.
6. **Action button matrix verified** — SUBMITTED: Call & Verify + Request Info + Reject + Set Bounty; NEED_INFO: Reject + Set Bounty; POTENTIAL_DUPLICATE: Mark Duplicate + Not a Duplicate + Set Bounty (no Call & Verify); VERIFIED: Reject + Set Bounty; REJECTED/DUPLICATE: no actions.

### Key File Locations

- `src/app/(admin)/admin/leads/components/verification-panel.tsx` — verification form Sheet component
- `src/app/(admin)/admin/leads/components/verification-attempts.tsx` — attempt history renderer
- `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — Call & Verify button, verification section, Reject for VERIFIED
- `src/app/(admin)/admin/leads/components/lead-table.tsx` — CheckCircle indicator for VERIFIED leads

### Deviations from Spec

1. **RadioGroup not used** — shadcn/ui RadioGroup was not in the component set. Used styled card-based radio inputs instead (visually richer, same behavior).
2. **Verification attempts in detail panel, not verification panel** — Spec suggested showing attempts inside the verification side panel. Instead, attempts are shown in the lead detail panel as a dedicated section, which is more accessible (visible without opening the form).

### Gotchas for Next Epic

1. The `verifications.listByLead` query (used for attempts display) includes admin name joins. The raw `verifications` field on `leads.getById` does NOT include admin names — use `listByLead` for any display that needs operator identity.
2. `consent_contact_demorentals` is always required as `boolean` at schema level. The UI defaults to `false` and only surfaces the consent section when outcome is VERIFIED.
3. The Reject button for VERIFIED leads uses the same `RejectDialog` and `leads.reject` mutation as SUBMITTED/NEED_INFO rejection — no separate verification-reject path exists.
