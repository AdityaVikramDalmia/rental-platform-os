---
id: P14-E01
title: i18n Infrastructure & Language Selection
phase: 14
status: pending
depends_on: ["P01-E01", "P03-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules"]
updated_at: 2026-02-17
---

# P14-E01: i18n Infrastructure & Language Selection

## Overview

Set up next-intl in non-routing mode for the guard portal: install the library, create the config, wire the provider into the guard layout, create all 3 translation files with the full key set from `notes/08-i18n.md`, and implement the language selection UI (profile page picker + first-login language prompt). The backend is already done — the `updateMyLanguage` mutation and `language_preference` schema field exist from P03. This epic delivers the complete i18n foundation so subsequent guard-facing epics can use `useTranslations()` from day one.

## Prerequisites

- **Read first**: [P03-E01 Completion Summary](../phase-03-guard-management/P03-E01-guard-account-backend.md#completion-summary) — `language_preference` field exists in the `guard_profiles` schema and locale constants/types are established. Verify these before starting T04.
- **Read first**: [P03-E04 Completion Summary](../phase-03-guard-management/P03-E04-guard-portal-pages.md#completion-summary) — `updateMyLanguage` mutation usage was wired during guard portal work; confirm current call pattern and existing profile flow before adding the new selector UX.
- **Read first**: [P01-E01 Completion Summary](../phase-01-auth/P01-E01-project-scaffolding.md#completion-summary) — confirms `next.config.ts` shape and existing plugin wrappers (Serwist). T01 must wrap the config correctly without breaking the existing Serwist plugin.

## Task Queue

- [ ] P14-E01-T01: Install next-intl & Create Config
- [ ] P14-E01-T02: Create Translation Files
- [ ] P14-E01-T03: Wire NextIntlClientProvider into Guard Layout
- [ ] P14-E01-T04: Language Selection UI

---

## T01: Install next-intl & Create Config

### Objective

Install `next-intl`, create `src/i18n/request.ts` with `getRequestConfig`, and modify `next.config.ts` to use `createNextIntlPlugin` — without breaking the existing Serwist PWA plugin wrapper.

### Required Reading

- `notes/08-i18n.md` — "Technical Approach" section (library choice, file structure, non-routing mode)
- `notes/01-tech-stack.md` — project's Next.js version and config structure
- Read existing `next.config.ts` before modifying — understand the current Serwist plugin wrapper shape so you nest `withNextIntl` correctly

### Key Rules

1. Run `npm install next-intl`. Verify the installed version is ^4.x (latest stable as of Feb 2026). Check `package.json` after install.
2. Create `src/i18n/request.ts`:

   ```typescript
   import { getRequestConfig } from "next-intl/server";
   import { cookies } from "next/headers";

   export default getRequestConfig(async () => {
     const store = await cookies();
     const SUPPORTED_LOCALES = ["en", "hi", "hinglish"] as const;
     const raw = store.get("locale")?.value;
     const locale = SUPPORTED_LOCALES.includes(raw as (typeof SUPPORTED_LOCALES)[number])
       ? raw
       : "en";

     return {
       locale,
       messages: (await import(`../../messages/${locale}.json`)).default,
       formats: {
         number: {
           currency: {
             style: "currency",
             currency: "INR",
           },
         },
         dateTime: {
           short: {
             day: "numeric",
             month: "short",
             year: "numeric",
           },
         },
       },
     };
   });
   ```

3. The locale cookie is named `locale`. Valid values: `en`, `hi`, `hinglish`. Default: `en` when cookie is absent or invalid.
4. Modify `next.config.ts` to wrap the existing config with `createNextIntlPlugin`. Import from `next-intl/plugin` (NOT from the main `next-intl` package). The existing Serwist wrapper must remain — nest the two plugins correctly:
   ```typescript
   import createNextIntlPlugin from "next-intl/plugin";
   const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
   // ... existing Serwist setup ...
   export default withNextIntl(withSerwist(nextConfig));
   // OR if Serwist wraps first:
   export default withSerwist(withNextIntl(nextConfig));
   ```
   Read the existing file to determine the correct nesting order. Either order is valid — just don't drop either plugin.
5. DO NOT touch `src/proxy.ts`. next-intl non-routing mode does not need middleware integration. The locale comes from the cookie, not the URL.
6. The `formats.number.currency` config uses INR — all money in the app is INR. Guard components use `useFormatter().number(amountInRupees, 'currency')` to format display values.
7. No URL-based locale routing. No `[locale]` segment anywhere. This is non-routing mode — locale is determined server-side from the cookie via `src/i18n/request.ts`.

### Deliverables

- [ ] `next-intl` added to `package.json` dependencies (^4.x)
- [ ] `src/i18n/request.ts` — `getRequestConfig` with cookie-based locale, dynamic message import, and INR currency format
- [ ] `next.config.ts` — modified to use `createNextIntlPlugin` wrapper alongside existing Serwist wrapper

### Acceptance Criteria

1. `npm install` completes without errors.
2. `src/i18n/request.ts` reads locale from the `locale` cookie, defaults to `en` when absent or invalid.
3. `next.config.ts` exports the config wrapped in both `withNextIntl()` and the existing Serwist wrapper — neither plugin is dropped.
4. `npx tsc --noEmit` passes.
5. `npm run build` passes (config alone should not break the build even before the provider is wired in T03).

### Verification

```bash
npm install next-intl
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/i18n/request.ts` and `next.config.ts`. Confirm no type errors. Confirm `createNextIntlPlugin` is imported from `next-intl/plugin`.

### Out of Scope

- Translation files (T02), provider wiring (T03), language selection UI (T04).
- Middleware locale detection — non-routing mode only.
- URL-based locale routing.

---

## T02: Create Translation Files

### Objective

Create `messages/en.json`, `messages/hi.json`, and `messages/hinglish.json` with all guard portal translation keys organized by namespace. English is the master file. All three files must have identical key structures.

### Required Reading

- `notes/08-i18n.md` — "Sample Translation Keys" section (lines 50-161): use these EXACT keys as the starting point for `en.json` and `hinglish.json`
- `notes/08-i18n.md` — "What Gets Translated" table and "Number & Date Formatting" table
- `notes/05-guard-portal-ux.md` — all guard screens with their user-facing strings (login, dashboard, lead submission, leads list, visits, earnings, profile, onboarding)
- `notes/13-constants-reference.md` — all status enum values (lead, visit, payout) for the `guard.status` namespace

### Key Rules

1. Create `messages/` directory at the project root (sibling of `src/`, `convex/`, `lib/`). This matches the path referenced in `src/i18n/request.ts`.
2. `en.json` is the master file. ALL keys go here first. `hi.json` and `hinglish.json` MUST have the exact same key structure — same nesting, same key names, different values only.
3. Use ICU message format for dynamic values: `{name}`, `{count}`, `{amount}`, `{date}`, `{max}`. No template literals, no concatenation.
4. **Namespace structure** — all keys live under the top-level `"guard"` object:
   - `guard.nav` — bottom nav labels: `home`, `addLead`, `myLeads`, `myVisits`, `earnings`
   - `guard.ruleBanner` — the critical rule banner string (single value, not nested)
   - `guard.login` — login page: `title`, `phoneLabel`, `phonePlaceholder`, `passwordLabel`, `signIn`, `forgotPassword`, `adminLink`
   - `guard.changePassword` — change password page: `title`, `currentPassword`, `newPassword`, `confirmPassword`, `submit`, `mismatch`, `tooShort`, `success`
   - `guard.dashboard` — home screen: `welcome`, `societyLabel`, `addLeadCta`, `leadsToday`, `scheduleHeader`, `quickStats`, `statsLeads`, `statsVisits`, `statsEarned`, `recentActivity`, `noActivity`, `profileLink`
   - `guard.submitLead` — lead form: `title`, `building`, `floor`, `flatNo`, `ownerPhone`, `availability`, `vacantNow`, `vacantFrom`, `consent`, `optional`, `ownerName`, `rentExpected`, `furnishing`, `unfurnished`, `semiFurnished`, `fullyFurnished`, `notes`, `submit`, `remaining`, `success`, `successDetail`, `submitAnother`, `viewLeads`, `viewMyLeads`, `limitReached`, `limitDetail`
   - `guard.leads` — my leads: `title`, `all`, `inReview`, `pending`, `verified`, `needInfo`, `rejected`, `adminNote`, `updateResubmit`, `bounty`, `potentialDuplicate`, `emptyState`
   - `guard.visits` — my visits: `title`, `today`, `upcoming`, `past`, `startVisit`, `completeVisit`, `howDidItGo`, `interested`, `notInterested`, `followUp`, `emptyState`, `noShow`
   - `guard.earnings` — earnings: `title`, `totalEarned`, `pending`, `pendingPayouts`, `paidHistory`, `processing`, `paidOn`, `emptyState`
   - `guard.profile` — profile: `title`, `uploadPhoto`, `badges`, `schedule`, `language`, `changePassword`, `signOut`, `guardType` (nested object with `buildingSpecific`, `mainGate`, `park`, `roving`)
   - `guard.shifts` — schedule: `title`, `emptyState`, `today`, `tomorrow`, `override`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`
   - `guard.onboarding` — first-time walkthrough: `step1Title`, `step1Body`, `step2Title`, `step2Body`, `step3Title`, `step3Body`, `next`, `skip`, `gotIt`, `dismiss`
   - `guard.status` — all status labels:
     - Lead: `SUBMITTED`, `NEED_INFO`, `VERIFIED`, `REJECTED`, `DUPLICATE`, `POTENTIAL_DUPLICATE`
     - Visit: `ASSIGNED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`
     - Payout: `pending`, `approved`, `disbursed`, `failed`, `voided`
     - Closure: `PENDING`, `CONFIRMED`, `CANCELLED`
     - Listing: `DRAFT`, `PUBLISHED`, `ARCHIVED`
     - Guard Account: `ACTIVE`, `INACTIVE`, `BANNED`
   - `guard.common` — shared strings: `loading`, `error`, `retry`, `cancel`, `save`, `confirm`, `back`, `noData`, `loadMore`
5. Use the EXACT sample values from `notes/08-i18n.md` for keys that appear there. Do not invent different English strings for keys the doc already defines.
6. **Hindi (`hi.json`)**: Use Devanagari script for all values. Use the Hinglish examples in `notes/08-i18n.md` as tone reference, then write equivalent formal Hindi. Mark uncertain translations with a `// TODO: native review` comment in a separate notes file — do NOT put comments inside JSON (JSON does not support comments).
7. **Hinglish (`hinglish.json`)**: Use Roman script. Sound like WhatsApp messages, not formal translations. Use the sample Hinglish values from `notes/08-i18n.md` exactly where provided. For keys not in the sample, write casual Hinglish (e.g., "Aaj ka schedule" not "Aaj ki samay-suchi").
8. Do NOT include admin panel strings. Admin is English-only and does not use next-intl.
9. All three files must be valid JSON. No trailing commas. No comments inside the files.

### Deliverables

- [ ] `messages/en.json` — English master file with all keys organized by namespace
- [ ] `messages/hi.json` — Hindi translations (all keys, Devanagari script)
- [ ] `messages/hinglish.json` — Hinglish translations (all keys, Roman script, WhatsApp-casual tone)

### Acceptance Criteria

1. All 3 files are valid JSON (no syntax errors — run `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'))"` to verify each).
2. All 3 files have identical key structures: same nesting depth, same key names at every level.
3. `en.json` contains all strings from the guard portal screens listed in Key Rule 4.
4. `hi.json` uses Devanagari script for all values (no Roman script values except proper nouns like "DemoRentals").
5. `hinglish.json` uses Roman script with natural Hinglish phrasing throughout.
6. ICU message format used for all dynamic values (`{name}`, `{count}`, `{amount}`, `{date}`, `{max}`).
7. `guard.ruleBanner` in `en.json` matches the exact text from `notes/08-i18n.md` line 61.
8. `guard.ruleBanner` in `hinglish.json` matches the exact text from `notes/08-i18n.md` line 142.
9. No admin panel strings present in any file.

### Verification

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('en.json valid')"
node -e "JSON.parse(require('fs').readFileSync('messages/hi.json','utf8')); console.log('hi.json valid')"
node -e "JSON.parse(require('fs').readFileSync('messages/hinglish.json','utf8')); console.log('hinglish.json valid')"
```

Also verify key structure parity: the key count in all 3 files should be identical. A quick check:

```bash
node -e "
const en = JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));
const hi = JSON.parse(require('fs').readFileSync('messages/hi.json','utf8'));
const hl = JSON.parse(require('fs').readFileSync('messages/hinglish.json','utf8'));
const keys = (obj, prefix='') => Object.entries(obj).flatMap(([k,v]) => typeof v === 'object' ? keys(v, prefix+k+'.') : [prefix+k]);
const enKeys = keys(en).sort().join('\n');
const hiKeys = keys(hi).sort().join('\n');
const hlKeys = keys(hl).sort().join('\n');
console.log('en===hi:', enKeys === hiKeys);
console.log('en===hl:', enKeys === hlKeys);
"
```

### Out of Scope

- Provider wiring (T03), language selection UI (T04).
- Admin panel strings.
- Dynamic content translation (admin notes, owner names — English only per spec).

---

## T03: Wire NextIntlClientProvider into Guard Layout

### Objective

Wrap the guard portal in `NextIntlClientProvider` so all guard pages and components can call `useTranslations()` and `useFormatter()`. Admin layout, public layout, and root layout are NOT touched.

### Required Reading

- Read existing `src/app/(guard)/layout.tsx` — understand the current provider nesting (withAuth, ConvexClientProvider, GuardLayoutInner) before adding NextIntlClientProvider
- `notes/11-convex-architecture.md` — "Pattern 5: Auth Architecture" section (provider nesting order)

### Key Rules

1. Modify `src/app/(guard)/layout.tsx` (the server component layout):
   - Import `NextIntlClientProvider` from `next-intl`
   - Import `getMessages` from `next-intl/server`
   - Call `const messages = await getMessages()` inside the async server component handler
   - Wrap the guard layout's inner content in `<NextIntlClientProvider messages={messages}>`
2. Provider nesting order: `ConvexClientProvider` wraps `NextIntlClientProvider` wraps `GuardLayoutInner` (or equivalent inner component). Convex must be outermost because guard components need both Convex data and translations — Convex doesn't depend on i18n, but i18n components may render Convex-fetched data.
3. Do NOT add `NextIntlClientProvider` to:
   - `src/app/layout.tsx` (root layout)
   - `src/app/(admin)/layout.tsx` (admin layout)
   - Any public or tenant layout
4. No locale in URLs. No `[locale]` segment. The locale is resolved server-side from the cookie by `src/i18n/request.ts` — `getMessages()` uses that resolved locale automatically.
5. After this task, `useTranslations('guard.nav')` must work in any component rendered inside the guard layout without any additional setup.

### Deliverables

- [ ] `src/app/(guard)/layout.tsx` — modified to call `getMessages()` and wrap inner content in `<NextIntlClientProvider messages={messages}>`

### Acceptance Criteria

1. Guard layout nests providers in the correct order: `ConvexClientProvider` > `NextIntlClientProvider` > guard inner content.
2. `useTranslations('guard.nav')` works in a guard component without errors (verify by adding one test call in a guard component, then removing it after confirming it works).
3. Admin layout is NOT modified — no `NextIntlClientProvider` in admin.
4. `npm run build` passes.
5. Guard pages still render correctly — no blank screens, no provider errors in the browser console.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(guard)/layout.tsx`. Confirm `getMessages` is imported from `next-intl/server` and `NextIntlClientProvider` from `next-intl`. Confirm no type errors on the `messages` prop.

### Out of Scope

- Language selection UI (T04).
- Wiring i18n into admin, public, or tenant layouts.
- Translating existing guard components (that's a separate epic — this task only wires the provider).

---

## T04: Language Selection UI

### Objective

Implement the language picker on the guard profile page and the first-login language prompt shown after password change, both wired to the existing `updateMyLanguage` mutation and cookie sync.

### Required Reading

- `notes/08-i18n.md` — "Language Selection" section (first login flow, persistent preference, localStorage sync)
- `notes/05-guard-portal-ux.md` — "Flow 1: First Login" (step 5: language selection after password change), "Flow 7: Profile" (language selector in profile page)
- Read existing `src/app/(guard)/guard/profile/page.tsx` — understand current profile page structure before adding the language section
- Read existing `convex/guards.ts` — find the `updateMyLanguage` mutation (search for `updateMyLanguage`) to confirm its args shape before calling it

### Key Rules

1. **Profile page language selector** (`src/app/(guard)/guard/profile/page.tsx`):
   - Add a "Language" section to the profile page (below badges, above sign out — matching the profile wireframe in `notes/05-guard-portal-ux.md`)
   - Use the reusable `LanguageSelector` component (created in this task)
   - On language change: call `updateMyLanguage` mutation AND set the `locale` cookie AND set `localStorage.setItem('locale', newLocale)`
   - After mutation succeeds, call `router.refresh()` to reload the page with the new locale applied
   - Use `LANGUAGE_PREFERENCE` constants from `lib/constants.ts` for all locale values — no hardcoded strings like `'en'`, `'hi'`, `'hinglish'`
2. **`LanguageSelector` component** (`src/components/guard/LanguageSelector.tsx`):
   - A 3-button toggle: `[English]` `[हिन्दी]` `[Hinglish]`
   - The currently active language is visually highlighted (filled/primary style vs outlined)
   - Props: `currentLocale: string`, `onSelect: (locale: string) => void`
   - Display labels: `en` → "English", `hi` → "हिन्दी", `hinglish` → "Hinglish"
   - Do NOT use `react-hook-form` — this is a simple controlled component, not a form
3. **First-login language prompt** (shown after password change on first login):
   - After the guard changes their password on first login, show a language selection screen before redirecting to `/guard/dashboard`
   - UI text: "Choose your language / अपनी भाषा चुनें" with the 3-button toggle below
   - On language selection: call `updateMyLanguage`, set cookie, set localStorage, then redirect to `/guard/dashboard`
   - If the guard dismisses without choosing (X button or skip link): default to `en`, set cookie, redirect to `/guard/dashboard`
   - Track whether the prompt has been shown using `localStorage.getItem('hasChosenLanguage')`. Set it to `'true'` after the guard makes a choice or dismisses. This is a one-time UX prompt, not a security feature — localStorage is sufficient.
   - The prompt can be implemented as a modal on the change-password page that appears after successful password change, OR as a separate `/guard/language-setup` route that the change-password page redirects to. Choose whichever is cleaner given the existing change-password page structure.
   - Skip/dismiss fallback behavior is an implementation detail for graceful degradation (not an explicit product-spec requirement).
4. **Cookie management**: Set the `locale` cookie using `document.cookie`:
   ```typescript
   document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
   ```
   This cookie is read by `src/i18n/request.ts` on the server for every request.
5. **On guard layout load** (sync from server preference): In the guard layout client component, after the guard profile query resolves, resolve the server locale with fallback: `const serverLocale = guard.language_preference ?? LANGUAGE_PREFERENCE.en` (the field is `v.optional(...)` in the schema, so it may be `undefined` for guards created before i18n). Validate `serverLocale` against `SUPPORTED_LOCALES` before using. Compare to `localStorage.getItem('locale')`. If they differ (e.g., guard logged in on a new device), update the cookie and localStorage to match the server preference, then call `router.refresh()`. Only refresh if the value actually changed — avoid infinite refresh loops.
6. The `updateMyLanguage` mutation already exists in `convex/guards.ts` from P03. Do NOT rewrite it. Just call it from the client.
7. The `updateMyLanguage` mutation takes `{ language: selectedLocale }` — the arg is named `language`, not `language_preference`. See `convex/guards.ts` lines 747-750.

### Deliverables

- [ ] `src/components/guard/LanguageSelector.tsx` — new reusable 3-button language toggle component
- [ ] `src/app/(guard)/guard/profile/page.tsx` — modified with language selector section wired to `updateMyLanguage` + cookie + localStorage
- [ ] `src/app/(auth)/guard/change-password/page.tsx` (or a new `/guard/language-setup` route) — modified or created to show the first-login language prompt after successful password change

### Acceptance Criteria

1. Guard can change language from the profile page. After selecting a new language and the page refreshes, the UI renders in the selected language.
2. First-login language prompt appears after password change, only on first login (controlled by `localStorage.hasChosenLanguage`).
3. Language preference is persisted in three places: server (`updateMyLanguage` mutation), cookie (`locale`), and localStorage (`locale`).
4. On login to a new device, the guard's server-stored `language_preference` syncs to the cookie and localStorage automatically.
5. `LANGUAGE_PREFERENCE` constants from `lib/constants.ts` used for all locale values — no hardcoded locale strings.
6. `LanguageSelector` component renders the active language as visually distinct from inactive options.
7. `npx tsc --noEmit` passes.
8. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all modified and created files. Confirm no implicit `any`. Confirm `LANGUAGE_PREFERENCE` constants are used (grep for hardcoded `'en'`, `'hi'`, `'hinglish'` strings in the new files — none should appear outside `lib/constants.ts`).

### Out of Scope

- Translating existing guard components (separate epic — this task only wires the selection mechanism).
- Admin language selection (admin is English-only).
- Push notifications for language change.

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
