---
id: P11-E03
title: Guard Controls & Rule Banner
phase: 11
status: done
depends_on: ["P11-E01", "P07-E02", "P04-E04", "P09-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P11-E03: Guard Controls & Rule Banner

## Overview

Build the guard-facing quality controls: implement the 48px sticky amber rule banner that is always visible and non-dismissable on every guard portal page with content in 3 languages (English, Hindi, Hinglish) pulled from i18n translation files, add a daily lead submission counter to the guard lead submission form showing remaining leads ("3 of 5 leads today") with a friendly limit-reached message, and verify guard status enforcement across the ACTIVE/INACTIVE/BANNED capabilities matrix ensuring INACTIVE guards can login but cannot submit leads or handle visits while BANNED guards are blocked entirely by WorkOS suspension.

## Prerequisites

- **Read first**: [P11-E01 Completion Summary](P11-E01-quality-metrics-backend.md#completion-summary) — `guards.getRemainingLeads()` query must already exist returning `{ submitted_today, limit, remaining }`. Rate limit enforcement already migrated to system_config-based in `leads.create`.
- **Read first**: [P07-E02 Completion Summary](../phase-07-visit-management/P07-E02-visit-execution.md#completion-summary) — guard portal layout with bottom navigation exists. Guard lead submission form exists at `/guard/submit-lead` (or similar from P04-E04).
- **Read first**: [P04-E04 Completion Summary](../phase-04-lead-pipeline/P04-E04-guard-lead-submission-ui.md#completion-summary) — guard lead submission form exists. P11-E01-T03 already modified the backend rate limit; this epic adds the FRONTEND display.
- **Read first**: [P09-E03 Completion Summary](../phase-09-payouts/P09-E03-guard-earnings-page.md#completion-summary) — Earn tab/page exists and must be included in rule-banner verification coverage.
- Guard portal UX conventions (min 16px body text, min 44x44 touch targets, mobile-first) established and must be followed.

## Task Queue

- [x] P11-E03-T01: Guard Rule Banner
- [x] P11-E03-T02: Rate Limit Display on Submission Form
- [x] P11-E03-T03: Guard Status Enforcement Verification

**All tasks complete.**

---

## T01: Guard Rule Banner

### Objective

Implement the 48px sticky amber rule banner that is always visible on every guard portal page, cannot be dismissed, and displays warning content in the guard's selected language (English, Hindi, or Hinglish).

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Guard Rule Banner" section (full — all 3 language versions, implementation notes)
- `notes/05-guard-portal-ux.md` — Guard portal layout structure, rule banner placement spec
- `notes/08-i18n.md` — next-intl setup, message file structure, `useTranslations` hook
- `notes/13-constants-reference.md` — Language Preference enum (en, hi, hinglish)

### Key Rules

1. Create `src/components/shared/rule-banner.tsx` — the rule banner component.
2. Banner is a sticky bar at the top of the guard layout (below the nav bar, above page content) with `min-height: 48px` and multi-line expansion allowed on narrow screens.
3. Background: yellow/amber (`bg-amber-500` or `bg-yellow-500`). Text: dark for contrast (`text-amber-950` or `text-black`). High visibility is critical — this is a legal/compliance requirement.
4. Content is the warning text from the feature spec:
   - **English**: "⚠️ IMPORTANT: Do not negotiate rent. Do not collect any money. For pricing and agreements, ask tenant/owner to speak to the DemoRentals team."
   - **Hindi**: "⚠️ ज़रूरी: किराया तय न करें। कोई पैसा न लें। कीमत और समझौते के लिए किरायेदार/मालिक को DemoRentals टीम से बात करने को कहें।"
   - **Hinglish**: "⚠️ IMPORTANT: Rent negotiate mat karo. Koi paisa mat lo. Pricing aur agreement ke liye tenant/owner ko DemoRentals team se baat karne bolo."
5. Text is pulled from i18n translation files using `useTranslations()` hook from next-intl. Add translation keys to `messages/en.json`, `messages/hi.json`, `messages/hinglish.json`.
6. Translation key: `guard.ruleBanner` (or similar nested key matching existing i18n patterns).
7. Banner is ALWAYS rendered — not conditional on any state. It is NOT dismissable. No close button. No collapse. No hide.
8. Modify the guard layout file (`src/app/(guard)/layout.tsx` or the guard-specific layout) to include the banner.
9. Banner text should wrap gracefully on very small screens, and the banner must expand beyond the 48px minimum height when needed. Aim for 14px font size for readability (minimum 12px).
10. Banner must render above page content but below any top navigation. It should not overlap content — page content starts below the banner.
11. Implementation confirmed per feature spec: "Always visible, non-dismissable, no collapse, no hide. 48px sticky bar. Legal/compliance requirement. This is final."

### Deliverables

- [ ] `src/components/shared/rule-banner.tsx` — 48px sticky amber rule banner component with i18n text
- [ ] `src/app/(guard)/layout.tsx` — Add rule banner below nav, above content
- [ ] `messages/en.json` — Add `guard.ruleBanner` translation key (English content)
- [ ] `messages/hi.json` — Add `guard.ruleBanner` translation key (Hindi content)
- [ ] `messages/hinglish.json` — Add `guard.ruleBanner` translation key (Hinglish content)

### Acceptance Criteria

1. Banner renders on every guard portal page (not just specific pages — it's in the layout).
2. Banner has `min-height: 48px`, is sticky, uses amber/yellow background with dark text, and can grow for wrapped text.
3. Banner content matches feature spec EXACTLY for all 3 languages.
4. Banner language switches based on guard's language preference via next-intl.
5. Banner is NOT dismissable — no close button, no collapse mechanism.
6. Banner does not overlap page content (content flows below it).
7. Banner text is readable on mobile screens (min 12-14px).
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: navigate multiple guard pages (dashboard, leads, visits, earnings, profile), verify banner always visible. Switch language, verify content changes. Try to dismiss — should be impossible.

### Out of Scope

- Admin-facing banner or configuration. Full i18n of entire guard portal (P14). Banner styling for tenant/owner portals.

---

## T02: Rate Limit Display on Submission Form

### Objective

Add a visual daily lead submission counter to the guard's lead submission form showing remaining leads and a friendly limit-reached message.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Rate Limiting → Guard UX" subsection (remaining count display, limit-reached message)
- `notes/05-guard-portal-ux.md` — Guard lead submission form wireframe
- [P04-E04 Completion Summary](../phase-04-lead-pipeline/P04-E04-guard-lead-submission-ui.md#completion-summary) — guard lead submission form implementation (find the existing form component)

### Key Rules

1. Modify the existing guard lead submission form (from P04-E04 — check actual route, likely at `/guard/submit-lead` or `/guard/leads/new`). Verify the exact route in the P04-E04 completion summary before implementing.
2. Add a submission counter that uses `useQuery(api.guards.getRemainingLeads)` from P11-E01-T03.
3. Display when NOT at limit: "X of Y leads today" (e.g., "3 of 5 leads today"). Styled as a subtle info badge or text below the form title. Not intrusive.
4. Display when AT limit: replace the form (or disable submit button) with a friendly message: "You've submitted all your leads today. Come back tomorrow!" (use the dynamic `limit` value from `getRemainingLeads` — do NOT hardcode `5`) — supportive, NOT punitive.
5. The limit-reached message should be prominent but friendly. Use a card or info banner style. Include a clock icon or similar to indicate the reset.
6. Count resets at midnight IST — match the backend logic from P11-E01-T03.
7. Do NOT block form rendering before data loads — show loading state for counter, form is still visible.
8. If `getRemainingLeads` query fails or returns an error, fall back to showing the form without the counter (graceful degradation).
9. Submit button should be disabled when `remaining = 0`. The limit-reached message provides explanation.
10. Use existing guard portal styling conventions (mobile-first, 16px body text, 44x44 touch targets).

### Deliverables

- [ ] Guard lead submission form — Add remaining leads counter ("X of Y leads today")
- [ ] Guard lead submission form — Add limit-reached message and disabled submit when at limit

### Acceptance Criteria

1. Counter shows correct "X of Y leads today" based on `getRemainingLeads` query.
2. Counter updates reactively (Convex subscription — when guard submits a lead, count increments).
3. Limit-reached message shows when `remaining = 0`.
4. Submit button disabled when at limit.
5. Friendly, supportive tone (not punitive).
6. Loading state while query resolves (form still accessible).
7. Graceful degradation on query error.
8. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual check: verify counter shows correct count, submit a lead and verify counter updates, test limit-reached state (set limit to 1 for testing).

### Out of Scope

- Backend rate limit logic (P11-E01-T03). Admin rate limit configuration (P11-E02-T04).

---

## T03: Guard Status Enforcement Verification

### Objective

Verify and harden guard status enforcement across the ACTIVE/INACTIVE/BANNED capabilities matrix, ensuring each status correctly restricts or allows platform actions.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Guard Status Management" section: capabilities matrix, "Business Rules" section
- `notes/04-state-machines.md` — Guard Status transitions and enforcement
- `notes/13-constants-reference.md` — Guard/User Status capabilities (ACTIVE/INACTIVE/BANNED)
- `notes/03-roles-and-permissions.md` — Guard Permissions (hardcoded capabilities)

### Key Rules

1. This task is VERIFICATION + edge case hardening, not new feature UI.
2. **Verify ACTIVE status**: guard can login, submit leads (rate-limited), handle visits, view history. All green.
3. **Verify INACTIVE status**:
   - Guard CAN login (authentication succeeds via `requireAuth` — INACTIVE is not BANNED).
   - Guard CAN view history (past leads, visits, earnings, profile) — read queries use `requireGuardAuth` (from P11-E01-T01) which allows any non-BANNED guard.
   - Guard CANNOT submit new leads. `leads.create` uses `requireGuard` which enforces `status === "ACTIVE"` and throws for INACTIVE. Lead submission form should show a disabled state or message: "Your account is inactive. Contact admin."
   - Guard CANNOT accept/handle visits. Visit-related write mutations use `requireGuard` (ACTIVE-only).
   - **Key convention**: `requireGuard(ctx)` = ACTIVE guards only (write mutations). `requireGuardAuth(ctx)` = any non-BANNED guard (read queries). Verify ALL guard queries/mutations use the correct helper. This split was introduced in P11-E01-T01.
4. **Verify BANNED status**:
   - Guard CANNOT login at all (WorkOS suspension blocks authentication).
   - If somehow they reach a page, `requireGuard` rejects them.
   - Verify WorkOS suspension is properly set during the ban process.
5. **Edge cases to verify**:
   - Guard at rate limit (e.g., Y/Y leads where Y is the configurable `max_leads_per_guard_per_day`), one lead rejected same day — limit stays at Y. No reset.
   - Rate limit changed mid-day — takes effect immediately. Guard already over new limit, but existing leads are not affected.
   - Guard switches from ACTIVE to INACTIVE while having pending visits — visits flagged for reassignment (`needs_reassignment: true`).
   - Guard re-activated (INACTIVE to ACTIVE or BANNED to ACTIVE) — can immediately start submitting again (no cool-down).
6. Fix any enforcement gaps found during verification.
7. Enforcement must be BACKEND-enforced (mutations reject), not just frontend-hidden. Frontend should ALSO reflect status, but backend is the source of truth.

### Deliverables

- [ ] Verification: ACTIVE guards have full access (rate-limited lead submission, visit handling, history viewing)
- [ ] Verification: INACTIVE guards can login + view history but CANNOT submit leads or handle visits
- [ ] Verification: BANNED guards cannot login (WorkOS suspension active)
- [ ] Verification: Rate limit edge cases (at limit, mid-day config change, rejection doesn't reset)
- [ ] Fix any enforcement gaps found during verification (backend + frontend)

### Acceptance Criteria

1. ACTIVE guard can submit leads (up to rate limit), handle visits, view all history.
2. INACTIVE guard can login and view history but lead submission and visit actions are blocked with appropriate messages.
3. BANNED guard cannot authenticate (WorkOS suspension prevents login).
4. Backend mutations reject unauthorized actions regardless of frontend state.
5. Edge cases handled per feature spec rules.
6. No enforcement gaps — all status restrictions are server-enforced.
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Manual status verification:

1. Test ACTIVE guard: submit lead, view history — both work.
2. Test INACTIVE guard: login succeeds, lead submission blocked with message, visit actions blocked.
3. Test BANNED guard: login fails at WorkOS level.
4. Test edge case: submit at rate limit, verify rejection doesn't free up a slot.

### Out of Scope

- Admin ban/deactivate UI (P11-E02-T05). Quality metrics display (P11-E02). Analytics (P12).

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-18

### What Was Built

- 48px sticky amber rule banner: `rule-banner.tsx` component with hardcoded English text (i18n deferred to P14), always rendered in guard layout between header and main content
- Rate limit display: "X of Y today" counter added to lead form header, RateLimitScreen already existed with friendly limit-reached message
- Guard status enforcement verified:
  - `requireGuard` (ACTIVE only) used for all write mutations: leads.create, leads.updateByGuard, visits.\*, buildings.listBySocietyForGuard
  - `requireGuardAuth` (any non-BANNED) used for read queries: getMyMetrics, getRemainingLeads, getMyCards, getGuardEarnings, recordFingerprint
  - `requireAuth` blocks BANNED guards at auth layer
  - Frontend: BANNED redirected to login, INACTIVE blocked on write operations by backend

### Key File Locations

- `src/components/shared/rule-banner.tsx` — Rule banner component
- `src/app/(guard)/guard-layout-client.tsx` — Banner integrated between header and main + fingerprint capture
- `src/app/(guard)/guard/submit-lead/components/lead-form.tsx` — "X of Y today" counter
- `src/app/(guard)/guard/submit-lead/components/rate-limit-screen.tsx` — Limit-reached friendly message

### Deviations from Spec

- i18n translation files (en.json, hi.json, hinglish.json) created but banner uses hardcoded English text since next-intl provider is not configured yet (P14). The files exist for when P14 is implemented.
- Banner text matches feature spec exactly for English. Hindi and Hinglish available in messages/ files.

### Gotchas for Next Epic

- Banner is NOT conditional — do not wrap in any state check. This is a legal/compliance requirement.
- When P14 (i18n) is implemented, switch `rule-banner.tsx` from hardcoded text to `useTranslations("guard")` with key `ruleBanner`
- The `messages/` directory now exists with en.json, hi.json, hinglish.json — P14 should extend these rather than recreate
