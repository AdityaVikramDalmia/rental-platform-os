---
id: P14-E02
title: Guard Portal String Replacement
phase: 14
status: pending
depends_on: ["P14-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P14-E02: Guard Portal String Replacement

## Overview

Replace ALL hardcoded English strings in the guard portal with `useTranslations()` calls. After this epic, every user-facing string in the guard portal comes from translation files — no hardcoded English remains. Number and date formatting is wired through `useFormatter()` for locale-aware display. Shared components (status badges) used by BOTH guard and admin portals pass translated labels as props rather than calling `useTranslations()` directly, since admin components don't have `NextIntlClientProvider` in their layout.

## Prerequisites

- **Read first**: [P14-E01 Completion Summary](P14-E01-i18n-infrastructure.md#completion-summary) — next-intl is installed, the config is created, translation files exist in `messages/`, `NextIntlClientProvider` wraps the guard layout, and the language picker component works. All translation keys referenced in this epic must already exist in `messages/en.json`, `messages/hi.json`, and `messages/hinglish.json`.

## Task Queue

- [ ] P14-E02-T01: Guard Layout & Auth Pages
- [ ] P14-E02-T02: Core Guard Pages (Dashboard, Submit Lead, Leads)
- [ ] P14-E02-T03: Remaining Guard Pages (Visits, Earnings, Profile, Shifts)
- [ ] P14-E02-T04: Guard Components & Shared Status Badges

---

## T01: Guard Layout & Auth Pages

### Objective

Replace all hardcoded strings in the guard layout (bottom nav, rule banner) and the two auth pages (guard login, change password) with `useTranslations()` calls. The guard auth pages live outside the guard route group and need their own `NextIntlClientProvider`.

### Required Reading

- `src/app/(guard)/guard-layout-client.tsx` — identify all hardcoded strings (nav labels, rule banner text)
- `src/app/(auth)/guard/login/page.tsx` — identify all hardcoded strings (page title, field labels, button text, links)
- `src/app/(auth)/guard/change-password/page.tsx` — identify all hardcoded strings (labels, button, validation messages, toast text)
- `notes/08-i18n.md` — sample translation keys for nav and login namespaces

### Key Rules

1. **Guard layout** (`src/app/(guard)/guard-layout-client.tsx`): import `useTranslations` from `next-intl`. Use `const t = useTranslations('guard')`. Bottom nav labels: `t('nav.home')`, `t('nav.addLead')`, `t('nav.myLeads')`, `t('nav.myVisits')`, `t('nav.earnings')`. Rule banner text: `t('ruleBanner')`. Keep all rule banner styles unchanged (amber, 48px, sticky, non-dismissable).
2. **Guard login** (`src/app/(auth)/guard/login/page.tsx`): use `const t = useTranslations('guard.login')`. Replace page title, phone label, password label, sign in button, forgot password text, and admin link text.
3. The login page is in `(auth)` — outside the `(guard)` route group — so it does NOT inherit `NextIntlClientProvider` from the guard layout. Fix this by creating `src/app/(auth)/guard/layout.tsx` that wraps its children in `NextIntlClientProvider`. This keeps the pattern clean and covers both guard auth pages.
4. **Change password** (`src/app/(auth)/guard/change-password/page.tsx`): use `const t = useTranslations('guard.changePassword')`. Replace page title, current/new/confirm password labels, submit button, and all validation error messages.
5. For toast messages (sonner), call `t('key')` inside `toast.success()` and `toast.error()`. The `t()` call must be inside the component function where the hook is available.
6. Zod schema `.message()` strings must also be translated. Define the zod schema inside the component (or via a factory function that receives `t`) so `t()` is in scope when the schema is constructed.
7. Do NOT translate any admin-facing text. Admin portal is hardcoded English per project convention.

### Deliverables

- [ ] `src/app/(guard)/guard-layout-client.tsx` — all nav labels and rule banner text use `useTranslations()`
- [ ] `src/app/(auth)/guard/layout.tsx` — created with `NextIntlClientProvider` wrapping guard auth pages
- [ ] `src/app/(auth)/guard/login/page.tsx` — all strings use `useTranslations('guard.login')`
- [ ] `src/app/(auth)/guard/change-password/page.tsx` — all strings use `useTranslations('guard.changePassword')`

### Acceptance Criteria

1. Bottom nav labels change when locale cookie is set to `hi` or `hinglish` and the page is refreshed.
2. Rule banner text changes per locale.
3. Guard login page renders all labels in the selected locale.
4. Change password page renders all labels in the selected locale.
5. Form validation error messages display in the selected locale.
6. Toast messages (success and error) display in the selected locale.
7. Admin login page is NOT affected by any of these changes.
8. `npm run build` passes.

### Verification

```bash
npm run build
npx tsc --noEmit
```

Manual check: set locale cookie to `hi`, navigate to `/guard/login` — all visible text should be in Hindi. Set to `hinglish` — text should switch to Hinglish. Verify admin login page is unchanged.

### Out of Scope

- Core guard pages (T02)
- Remaining guard pages (T03)
- Guard components and status badges (T04)

---

## T02: Core Guard Pages (Dashboard, Submit Lead, Leads)

### Objective

Replace all hardcoded strings in the three highest-traffic guard pages with `useTranslations()` calls, and wire number and date formatting through `useFormatter()`.

### Required Reading

- Read each page file in full to identify ALL hardcoded strings before making any changes
- `notes/05-guard-portal-ux.md` — Flow 2 (Home Screen), Flow 3 (Add Vacant Flat), Flow 4 (My Leads)
- `notes/08-i18n.md` — sample keys for `submitLead` and `leads` namespaces

### Key Rules

1. **Dashboard** (`src/app/(guard)/guard/dashboard/page.tsx`): use `const t = useTranslations('guard.dashboard')`. Replace: welcome greeting using ICU interpolation (`t('welcome', { name: guardName })`), society label, "Add Vacant Flat" CTA, leads counter, "Today's Schedule" header, "Quick Stats" header and stat labels (Leads, Visits, Earned), "Recent Activity" header, "My Profile / ID Card" link text, and all empty state text. Format earnings amounts with `useFormatter()`: `const format = useFormatter(); format.number(amountInRupees, { style: 'currency', currency: 'INR' })`.
2. **Submit Lead** (`src/app/(guard)/guard/submit-lead/page.tsx`): use `const t = useTranslations('guard.submitLead')`. Replace ALL form labels: building, floor, flat number, owner phone, availability options (vacant now / vacant from date), consent checkbox text, optional details section header, owner name, expected rent, furnishing options, notes, submit button, and remaining-submissions counter. Replace the success screen ("Lead Submitted!", detail text, "Submit Another", "View Leads", and "View My Leads" actions where present). Replace the rate limit screen ("Daily Limit Reached", detail text). Replace all zod validation error messages (define schema inside the component so `t()` is in scope).
3. **My Leads list** (`src/app/(guard)/guard/leads/page.tsx`): use `const t = useTranslations('guard.leads')`. Replace: page title, filter tab labels (`all`, `inReview`, `verified`, `rejected`), empty state text per tab, and "Load More" button. Keep `pending` and `needInfo` translation keys in the namespace for components that still reference those statuses.
4. **Lead detail** (`src/app/(guard)/guard/leads/[id]/page.tsx`): use `const t = useTranslations('guard.leads')`. Replace: admin note label, "Update & Resubmit" button, bounty display using ICU interpolation (`t('bounty', { amount: formattedAmount })`), and potential duplicate badge text.
5. Money values: always convert from paise to rupees (`amount / 100`) before passing to `useFormatter().number()`. The currency format (`{ style: 'currency', currency: 'INR' }`) is configured globally in `src/i18n/request.ts` — use the named format if defined there, otherwise pass the options inline.
6. Dates: use `useFormatter().relativeTime(new Date(timestampMs))` for relative display ("2 hours ago") and `useFormatter().dateTime(new Date(timestampMs), 'short')` for absolute display ("Feb 17, 2026").
7. For all ICU message interpolation, pass named parameters: `t('key', { name: value, count: value })`.
8. Translate ALL user-facing strings in sub-components under each page directory. Do not stop at `page.tsx`: include `src/app/(guard)/guard/submit-lead/components/lead-form.tsx`, `src/app/(guard)/guard/submit-lead/components/success-screen.tsx`, `src/app/(guard)/guard/submit-lead/components/rate-limit-screen.tsx`, `src/app/(guard)/guard/leads/components/lead-card.tsx`, `src/app/(guard)/guard/leads/components/lead-filter-tabs.tsx`, and `src/app/(guard)/guard/leads/components/need-info-form.tsx`.

### Deliverables

- [ ] `src/app/(guard)/guard/dashboard/page.tsx` — all strings translated, currency amounts formatted via `useFormatter()`
- [ ] `src/app/(guard)/guard/submit-lead/page.tsx` — all form labels, success screen, rate limit screen, and validation messages translated
- [ ] `src/app/(guard)/guard/submit-lead/components/*.tsx` — all user-facing strings translated (`lead-form`, `success-screen`, `rate-limit-screen`)
- [ ] `src/app/(guard)/guard/leads/page.tsx` — page title, tab labels, empty states, and Load More button translated
- [ ] `src/app/(guard)/guard/leads/[id]/page.tsx` — lead detail strings translated, bounty amount formatted
- [ ] `src/app/(guard)/guard/leads/components/*.tsx` — all user-facing strings translated (`lead-card`, `lead-filter-tabs`, `need-info-form`)

### Acceptance Criteria

1. Dashboard renders fully in Hindi when locale cookie is set to `hi`.
2. Submit Lead form labels all change with locale.
3. Success screen and rate limit screen display in the selected locale.
4. My Leads tab labels and empty states display in the selected locale.
5. Bounty amounts are formatted as ₹ currency (e.g., "₹800" not "800").
6. Relative time displays (e.g., "2 hours ago") adapt to locale.
7. `npm run build` passes.

### Verification

```bash
npm run build
npx tsc --noEmit
```

Manual check: set locale to `hi`, visit `/guard/dashboard`, `/guard/submit-lead`, `/guard/leads`, and `/guard/leads/[any-id]` — all visible text should be in Hindi. Verify currency formatting shows ₹ symbol. Verify relative timestamps display.

### Out of Scope

- Remaining guard pages (T03)
- Guard components and status badges (T04)

---

## T03: Remaining Guard Pages (Visits, Earnings, Profile, Shifts)

### Objective

Replace all hardcoded strings in the remaining four guard pages (Visits, Earnings, Profile, Shifts) with `useTranslations()` calls, and wire all date and currency formatting through `useFormatter()`.

### Required Reading

- Read each page file in full to identify ALL hardcoded strings before making any changes
- `notes/05-guard-portal-ux.md` — Flow 5 (Visits), Flow 6 (Earnings), Flow 7 (Profile)
- `notes/08-i18n.md` — sample keys for `visits`, `earnings`, and `profile` namespaces

### Key Rules

1. **My Visits list** (`src/app/(guard)/guard/visits/page.tsx`): use `const t = useTranslations('guard.visits')`. Replace: page title, section headers (Today, Upcoming, Past), empty state text, and visit card detail labels.
2. **Visit detail** (`src/app/(guard)/guard/visits/[id]/page.tsx`): use `const t = useTranslations('guard.visits')`. Replace: "Start Visit" and "Complete Visit" button labels, outcome option labels (Interested, Not Interested, Follow-up Needed), "How did it go?" prompt text, and all other visible strings. Format visit slot date/time with `useFormatter().dateTime()`.
3. **Earnings** (`src/app/(guard)/guard/earnings/page.tsx`): use `const t = useTranslations('guard.earnings')`. Replace: page title, "Total Earned" and "Pending" labels, section headers (Pending Payouts, Paid History), empty state text, and payout card labels. Format all amounts with `useFormatter().number(amount / 100, { style: 'currency', currency: 'INR' })`. Format "Paid on {date}" using `useFormatter().dateTime()`.
4. **Profile** (`src/app/(guard)/guard/profile/page.tsx`): use `const t = useTranslations('guard.profile')`. Replace: page title, section labels (My Badges, My Schedule), button labels (Upload Photo, Change Password, Sign Out), and guard type display names. Map the `guard_type` enum to translation keys: `BUILDING_SPECIFIC` → `t('guardType.buildingSpecific')`, `MAIN_GATE` → `t('guardType.mainGate')`, `PARK` → `t('guardType.park')`, `ROVING` → `t('guardType.roving')`. Verify the language selector from E01-T04 already uses translations — if not, fix it here.
5. **Shifts** (`src/app/(guard)/guard/shifts/page.tsx`): use `const t = useTranslations('guard.shifts')`. Replace: page title and empty state text. For day labels, prefer `useFormatter().dateTime(date, { weekday: 'long' })` over hardcoded day name strings — this gives locale-aware day names automatically.
6. For all date and time formatting across these pages, use `useFormatter()` from next-intl rather than raw `date-fns` calls. This ensures locale-aware output without manual locale threading.
7. Translate ALL user-facing strings in page-level sub-components under `components/`. Include `src/app/(guard)/guard/visits/components/visit-card.tsx`, `src/app/(guard)/guard/visits/components/visit-section.tsx`, `src/app/(guard)/guard/visits/components/visit-execution.tsx`, `src/app/(guard)/guard/visits/components/outcome-selector.tsx`, `src/app/(guard)/guard/earnings/components/earnings-summary.tsx`, `src/app/(guard)/guard/earnings/components/pending-payout-card.tsx`, and `src/app/(guard)/guard/earnings/components/paid-payout-card.tsx`.

### Deliverables

- [ ] `src/app/(guard)/guard/visits/page.tsx` — all strings translated
- [ ] `src/app/(guard)/guard/visits/[id]/page.tsx` — visit detail strings translated, date/time formatted via `useFormatter()`
- [ ] `src/app/(guard)/guard/earnings/page.tsx` — all strings translated, all amounts formatted as ₹ currency
- [ ] `src/app/(guard)/guard/visits/components/*.tsx` — all user-facing strings translated (`visit-card`, `visit-section`, `visit-execution`, `outcome-selector`)
- [ ] `src/app/(guard)/guard/earnings/components/*.tsx` — all user-facing strings translated (`earnings-summary`, `pending-payout-card`, `paid-payout-card`)
- [ ] `src/app/(guard)/guard/profile/page.tsx` — all strings translated, guard type enum mapped to translation keys
- [ ] `src/app/(guard)/guard/shifts/page.tsx` — all strings translated, day labels use `useFormatter()`

### Acceptance Criteria

1. Visit list and detail pages render fully in all 3 locales.
2. Earnings page shows amounts formatted as ₹ currency in all locales.
3. Profile page guard type labels change with locale.
4. Profile page language selector labels display correctly in all locales.
5. Shifts page renders in all 3 locales with locale-aware day names.
6. All date and time displays use `useFormatter()` — no raw `date-fns` locale-unaware calls remain.
7. `npm run build` passes.

### Verification

```bash
npm run build
npx tsc --noEmit
```

Manual check: cycle through all 3 locales and visit each page — all visible text should change. Verify ₹ currency formatting on earnings page. Verify guard type labels on profile page. Verify day names on shifts page adapt to locale.

### Out of Scope

- Guard components and status badges (T04)
- Admin portal pages (English only, not in scope for this phase)

---

## T04: Guard Components & Shared Status Badges

### Objective

Replace hardcoded strings in guard-specific components using `useTranslations()` directly, and update shared status badge components (used by both guard and admin portals) to accept an optional translated `label` prop — so guard pages can pass translated labels while admin pages continue using their existing hardcoded English fallback.

### Required Reading

- Read each component file in full to identify ALL hardcoded strings before making any changes
- `notes/08-i18n.md` — "What Gets Translated" table, status badge translation patterns
- `notes/13-constants-reference.md` — status enum values for leads, visits, payouts, closures, and listings

### Key Rules

1. **Guard-specific components** (rendered only inside the guard layout — safe to call `useTranslations()` directly):
   - `src/components/guard/GuardProfileCard.tsx`: translate labels "Society", "Type", "Status", guard type display names, and status display names.
   - `src/components/guard/GuardShiftList.tsx`: translate labels "Today", "Tomorrow", day names (or use `useFormatter()` for locale-aware day names), "Override" badge text, and empty state text.
   - `src/components/guard/GuardOnboarding.tsx`: use `const t = useTranslations('guard.onboarding')`. Translate all 3-step walkthrough titles, step descriptions, "Got it!" button, and any language selection prompt text.
   - `src/components/guard/GuardPhotoUpload.tsx`: translate "Upload Photo" button text and all error messages ("File too large", "Invalid format", etc.).
2. **Shared status badge components** (rendered in BOTH guard and admin portals — cannot call `useTranslations()` directly because admin pages lack `NextIntlClientProvider`). Add an optional `label?: string` prop to each badge component. When `label` is provided, render it instead of the hardcoded status string. When `label` is absent, fall back to the existing hardcoded English string — admin pages are unchanged. Guard pages pass the translated label using enum-aligned keys (no `.toLowerCase()` transform): `<LeadStatusBadge status={lead.status} label={t(`status.${lead.status}`)} />`.
3. Apply the optional `label` prop pattern to all five shared badge components:
   - `src/components/shared/lead-status-badge.tsx` — statuses: SUBMITTED, NEED_INFO, VERIFIED, REJECTED, DUPLICATE, POTENTIAL_DUPLICATE
   - `src/components/shared/visit-status-badge.tsx` — statuses: ASSIGNED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW
   - `src/components/shared/payout-status-badge.tsx` — statuses: pending, approved, disbursed, failed, voided
   - `src/components/shared/closure-status-badge.tsx` — statuses: PENDING, CONFIRMED, CANCELLED
   - `src/components/shared/listing-status-badge.tsx` — statuses: DRAFT, PUBLISHED, ARCHIVED
4. If `notes-thread.tsx` or `status-timeline.tsx` contain hardcoded strings and are rendered in the guard portal, apply the same optional-label-prop pattern if they're shared, or `useTranslations()` directly if they're guard-only.
5. After completing all changes, run a grep for hardcoded English strings across all guard portal files. The target is zero hardcoded user-facing strings in `src/app/(guard)/`, `src/app/(auth)/guard/`, and `src/components/guard/`. Exclude import statements, variable names, type definitions, and code comments from this check.

### Deliverables

- [ ] `src/components/guard/GuardProfileCard.tsx` — all labels translated via `useTranslations()`
- [ ] `src/components/guard/GuardShiftList.tsx` — all labels translated, day names use `useFormatter()` or translation keys
- [ ] `src/components/guard/GuardOnboarding.tsx` — all walkthrough text translated via `useTranslations('guard.onboarding')`
- [ ] `src/components/guard/GuardPhotoUpload.tsx` — button text and error messages translated
- [ ] `src/components/shared/lead-status-badge.tsx` — optional `label?: string` prop added, falls back to hardcoded English
- [ ] `src/components/shared/visit-status-badge.tsx` — optional `label?: string` prop added
- [ ] `src/components/shared/payout-status-badge.tsx` — optional `label?: string` prop added
- [ ] `src/components/shared/closure-status-badge.tsx` — optional `label?: string` prop added
- [ ] `src/components/shared/listing-status-badge.tsx` — optional `label?: string` prop added

### Acceptance Criteria

1. GuardOnboarding shows translated walkthrough steps in all 3 locales.
2. GuardProfileCard shows translated guard type and status labels.
3. Status badges in the guard portal show translated labels when locale is `hi` or `hinglish`.
4. Status badges in the admin portal still render correctly with hardcoded English labels — no regressions.
5. Grep for hardcoded English user-facing strings in guard portal files returns zero results (excluding imports, variable names, type definitions, and comments).
6. `npm run build` passes.
7. `npx tsc --noEmit` passes — no type errors from the added optional props.

### Verification

```bash
npm run build
npx tsc --noEmit
```

Grep check:

```bash
# Should return zero results for hardcoded user-facing strings in guard portal
# (review results manually — exclude imports, variable names, type defs, comments)
grep -rn '"[A-Z][a-z]' src/app/\(guard\)/ src/app/\(auth\)/guard/ src/components/guard/ \
  --include="*.tsx" --include="*.ts" | grep -v "import\|//\|type\|interface\|const.*=.*'"
```

Manual check: set locale to `hi`, visit guard portal pages that use status badges — badges should show Hindi labels. Switch to admin portal — same badges should show English labels unchanged.

### Out of Scope

- Admin portal translation (English only per project convention)
- Dynamic content translation (V2)
- Tenant portal translation (not in this phase)

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
