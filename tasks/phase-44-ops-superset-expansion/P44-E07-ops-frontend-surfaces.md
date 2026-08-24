---
id: P44-E07
title: OPS Frontend Surfaces
phase: 44
status: done
depends_on: ["P44-E05"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P44-E07: OPS Frontend Surfaces

## Overview

Expose ship-now guard route surfaces to eligible OPS users with minimal UI disruption, while explicitly hiding/defering non-parity surfaces (`/guard/shifts`, `/guard/onboarding`, fingerprint UX).

## Task Queue

- [x] P44-E07-T01: Enable OPS access to guard route-group shell with field-worker auth checks
- [x] P44-E07-T02: Update guard navigation for OPS parity and hide non-applicable entries
- [x] P44-E07-T03: Validate ship-now page parity for dashboard/leads/visits/bounties/earnings/profile
- [x] P44-E07-T04: Enforce deferred surfaces and fallback UX for onboarding/fingerprint paths

---

## T01: Enable OPS Access to Guard Route-Group Shell With Field-Worker Auth Checks

### Objective

Update guard layout auth checks so eligible OPS users can enter ship-now guard pages without breaking guard-only behavior.

### Required Reading

- `src/app/(guard)/layout.tsx`
- `src/app/(guard)/guard-layout-client.tsx`
- `convex/auth.helpers.ts`
- `convex/users.ts`
- `notes/features/35-ops-superset-expansion.md` (Sections 4, 5, 10)

### Key Rules

1. Preserve current guard UX and route behavior for GUARD users.
2. OPS access must follow backend rollout gating semantics (disabled/canary/enabled).
3. Keep route-group structure unchanged; avoid URL restructuring.
4. Redirect ineligible OPS users to safe fallback route with clear messaging.

### Deliverables

- [x] `src/app/(guard)/layout.tsx` - guard layout server gate adjusted for field-worker eligibility
- [x] `src/app/(guard)/guard-layout-client.tsx` - client shell updates for GUARD/OPS field-worker handling
- [x] `src/app/(guard)/guard/unauthorized/page.tsx` — OPS blocked-access page displaying permission denial message and redirect link

### Acceptance Criteria

1. GUARD users continue to access all existing guard pages normally.
2. Eligible OPS users can load ship-now guard routes under canary/enabled rollout states.
3. Ineligible OPS users receive deterministic blocked experience.
4. No regressions in guard i18n provider behavior.
5. Route transitions and auth redirects remain stable in mobile viewport.
6. Type-check/build pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed guard layout files.

### Out of Scope

- Admin UI changes
- Incentive logic changes
- Backfill operations

---

## T02: Update Guard Navigation for OPS Parity and Hide Non-Applicable Entries

### Objective

Adapt guard navigation so OPS sees parity surfaces only and does not see `/guard/shifts` access points.

### Required Reading

- `src/app/(guard)/guard-layout-client.tsx`
- `src/config/navigation.ts`
- `src/components/guard/LanguageSelector.tsx`
- `notes/features/35-ops-superset-expansion.md` (Section 10)

### Key Rules

1. Keep existing nav order and labels for guard users.
2. OPS nav must include only ship-now entries.
3. `/guard/shifts` must be hidden for OPS.
4. Avoid persona-specific hard forks in component trees; use config-driven toggles.

### Deliverables

- [x] `src/config/navigation.ts` - field-worker-aware nav visibility rules
- [x] `src/app/(guard)/guard-layout-client.tsx` - nav rendering updated for OPS exclusions
- [x] `src/app/(guard)/guard/shifts/page.tsx` - explicit access guard or redirect for OPS

### Acceptance Criteria

1. GUARD nav remains unchanged from current production behavior.
2. OPS nav shows dashboard/submit-lead/leads/visits/bounties/earnings/profile paths only.
3. OPS cannot navigate to shifts through nav or direct URL.
4. Mobile safe-area spacing and touch targets remain valid.
5. No TypeScript or lint regressions in navigation modules.
6. Build and diagnostics pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on navigation and guard layout files.

### Out of Scope

- OPS onboarding redesign
- Fingerprint UX parity
- Admin-side filtering

---

## T03: Validate Ship-Now Page Parity for Dashboard/Leads/Visits/Bounties/Earnings/Profile

### Objective

Confirm all ship-now pages work for OPS with existing components and field-worker backend contracts.

### Required Reading

- `src/app/(guard)/guard/dashboard/page.tsx`
- `src/app/(guard)/guard/submit-lead/page.tsx`
- `src/app/(guard)/guard/leads/page.tsx`
- `src/app/(guard)/guard/visits/page.tsx`
- `src/app/(guard)/guard/bounties/page.tsx`
- `src/app/(guard)/guard/earnings/page.tsx`
- `src/app/(guard)/guard/profile/page.tsx`

### Key Rules

1. Reuse existing page components; avoid full component forks.
2. Ensure profile copy/data display works for OPS identity.
3. Keep all API calls unchanged where response contracts are backward compatible.
4. Handle empty states for OPS users with no historical records.

### Deliverables

- [x] `src/app/(guard)/guard/profile/page.tsx` - profile rendering adjusted for OPS fields where required
- [x] `src/components/guard/GuardProfileCard.tsx` - role-agnostic presentation updates for OPS-compatible profile rendering
- [x] `verification/p44-ops-superset-expansion.md` - page-level parity smoke checklist and expected outcomes

### Acceptance Criteria

1. OPS can load all ship-now pages without runtime errors.
2. Existing guard page behavior remains unchanged.
3. OPS profile page shows valid user/profile data and avoids guard-only assumptions.
4. Empty-state UX on earnings/quality-related cards is stable for new OPS users.
5. Responsive checks pass at mobile breakpoints used by guard portal.
6. Type-check/build and diagnostics pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed page/component files.

### Out of Scope

- New OPS-specific route tree
- Guard fingerprint feature extension
- Translation expansion for OPS-specific copy

---

## T04: Enforce Deferred Surfaces and Fallback UX for Onboarding/Fingerprint Paths

### Objective

Implement explicit defer behavior so OPS users do not enter onboarding/fingerprint flows that are not part of P44 launch scope.

### Required Reading

- `src/app/(auth)/guard/change-password/page.tsx`
- `src/app/(guard)/guard/onboarding/page.tsx`
- `convex/guards.ts` (`recordFingerprint`)
- `notes/features/35-ops-superset-expansion.md` (Section 10)

### Key Rules

1. `/guard/onboarding` remains deferred for OPS.
2. Fingerprint flow remains guard-only.
3. Defer behavior must be explicit (redirect + message), not accidental failure.
4. Guard onboarding and fingerprint behavior must not regress.

### Deliverables

- [x] `src/app/(guard)/guard/onboarding/page.tsx` - OPS access guard and redirect behavior
- [x] `src/app/(auth)/guard/change-password/page.tsx` - OPS first-login path bypasses guard onboarding prompt
- [x] `verification/p44-ops-superset-expansion.md` - defer-path test cases

### Acceptance Criteria

1. OPS users are redirected away from guard onboarding surfaces.
2. OPS users do not invoke guard fingerprint mutations from UI.
3. Guard users keep current onboarding and fingerprint UX behavior.
4. Redirect/fallback copy is clear and non-blocking for OPS workflows.
5. No uncaught exceptions when OPS users hit deferred routes directly.
6. `npx tsc --noEmit` and build pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed auth/guard page files.

### Out of Scope

- Full OPS onboarding product
- Fingerprint feature redesign
- Admin analytics changes
