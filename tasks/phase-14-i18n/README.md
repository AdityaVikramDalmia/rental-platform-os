# Phase 14: i18n (P14)

## Overview

Phase 14 adds full internationalization to the guard portal in three locales: English (`en`), Hindi/Devanagari (`hi`), and Roman-script Hindi (`hinglish`). The admin panel stays hardcoded English. Public listing pages stay English. Only the guard portal gets translated.

The backend is already done. `guard_profiles.language_preference` exists in the schema, and `updateMyLanguage` in `convex/guards.ts` already persists the preference. Phase 14 is entirely a frontend concern: install `next-intl`, wire it in non-routing mode (locale from cookie, no URL segments like `/en/guard/...`), create three translation files with ~225 keys each, and replace every hardcoded English string in the guard portal with `useTranslations()` calls.

**Non-routing mode** means locale is determined server-side from a `locale` cookie read in `src/i18n/request.ts`. No middleware changes needed. The project uses `authkitMiddleware` in `src/proxy.ts` (Next.js 16+ pattern) and that file must not be touched. `next-intl`'s non-routing setup does not require middleware at all.

**Note**: The `language_preference` field on `guard_profiles`, the `updateMyLanguage` mutation, and the `LANGUAGE_PREFERENCE` constants in `lib/constants.ts` were all delivered in P03-E01. This phase does not modify the schema or add backend functions. It only adds the frontend i18n layer on top of existing infrastructure.

## Dependencies

| Dependency                        | What It Provides for P14                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P01-E01 (Project Scaffolding)** | `next.config.ts` and `package.json` — P14 modifies `next.config.ts` to wrap the config with `createNextIntlPlugin`, and adds `next-intl` to `package.json` via `npm install`.                                                                                                                                                                                                                                                   |
| **P03-E01 (Guard Management)**    | `guard_profiles.language_preference` field (`v.optional(v.union(v.literal("en"), v.literal("hi"), v.literal("hinglish")))`), `updateMyLanguage` mutation in `convex/guards.ts` (lines 747-766), `LANGUAGE_PREFERENCE` constants and `LanguagePreference` type in `lib/constants.ts` (lines 207-213). All guard portal pages and components exist and render English strings — P14 replaces those strings with translation keys. |

## Key Documentation

| Doc                               | Section                                 | Why You Need It                                                                                                                                                   |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/08-i18n.md`                | Full file                               | THE feature spec — supported languages, translation key namespaces, language selection flow, cookie persistence, number/date formatting rules, what stays English |
| `notes/05-guard-portal-ux.md`     | Full file                               | All guard screens and their user-facing strings — the source of truth for what needs translating                                                                  |
| `notes/10-convex-schema.md`       | `guard_profiles` table (lines ~134-168) | `language_preference` field definition and validator — confirms the field already exists                                                                          |
| `notes/02-data-models.md`         | Guard Profile (lines ~95-118)           | `language_preference` field description and allowed values                                                                                                        |
| `notes/13-constants-reference.md` | `LANGUAGE_PREFERENCE` section           | Locale values (`en`, `hi`, `hinglish`) and the `LanguagePreference` type — use these, don't redefine                                                              |

## Epics

| ID      | Title                                                                      | Tasks | Status  | Depends On         |
| ------- | -------------------------------------------------------------------------- | ----- | ------- | ------------------ |
| P14-E01 | [i18n Infrastructure & Language Selection](P14-E01-i18n-infrastructure.md) | 4     | pending | [P01-E01, P03-E01] |
| P14-E02 | [Guard Portal String Replacement](P14-E02-guard-portal-translation.md)     | 4     | pending | [P14-E01]          |

## Dependency Graph

```
P01-E01 ──► P14-E01 ──► P14-E02
                ▲
P03-E01 ────────┘
```

**Sequential note**: E01 (Infrastructure) must complete before E02 (String Replacement) begins — the `useTranslations()` hook and `NextIntlClientProvider` must be wired before any component can use them. E02 also depends on the translation files (`messages/en.json`, `messages/hi.json`, `messages/hinglish.json`) being created in E01, since TypeScript will error on missing keys at build time.

## Execution Order

1. **P14-E01**: i18n Infrastructure & Language Selection — install `next-intl`, create `src/i18n/request.ts` with `getRequestConfig` reading the `locale` cookie, modify `next.config.ts` with `createNextIntlPlugin`, wrap guard layout in `NextIntlClientProvider`, create all three `messages/*.json` files with the full ~225-key structure, build the language picker UI on the profile page and first-login flow, wire cookie set/clear on language change and on login.
2. **P14-E02**: Guard Portal String Replacement — replace hardcoded English strings in all 9 guard pages, 2 auth pages, 4 guard components, and the guard layout (bottom nav + rule banner) with `useTranslations()` calls. Wire `useFormatter()` for money and date display. Update shared status badge components to accept translated labels via props.

## Completion Criteria

### Backend

- [ ] No new backend functions needed — `updateMyLanguage` mutation already exists in `convex/guards.ts`
- [ ] Existing `updateMyLanguage` mutation called from the language picker UI to persist preference to `guard_profiles.language_preference`

### Frontend (Infrastructure)

- [ ] `next-intl` installed in `package.json`
- [ ] `src/i18n/request.ts` created — `getRequestConfig` reads `locale` cookie, defaults to `en` if absent or invalid, loads messages from `messages/{locale}.json`
- [ ] `next.config.ts` modified — `createNextIntlPlugin` wraps the existing config (including the existing Serwist plugin wrapper)
- [ ] Guard layout (`src/app/(guard)/layout.tsx`) wraps children in `NextIntlClientProvider` with messages and locale from server
- [ ] Guard auth layout (`src/app/(auth)/guard/layout.tsx`) created — wraps guard auth pages in `NextIntlClientProvider` so login and change-password pages can use `useTranslations()`
- [ ] `locale` cookie set on language change (client-side, via `document.cookie`) and on guard login (server-side, from `guard_profiles.language_preference`)
- [ ] Language picker UI on guard profile page — dropdown with three options (English, हिंदी, Hinglish), calls `updateMyLanguage` mutation and sets cookie on change
- [ ] Language picker also shown on first-login flow (after password change at `/guard/change-password`) so guards set their language before reaching the dashboard

### Frontend (Translation)

- [ ] `messages/en.json` created with all guard portal translation keys (~225 keys across 14 namespaces)
- [ ] `messages/hi.json` created with Hindi translations (~225 keys — placeholder quality, native speaker review deferred)
- [ ] `messages/hinglish.json` created with Hinglish translations (~225 keys — placeholder quality, native speaker review deferred)
- [ ] All 9 guard pages use `useTranslations()` — no hardcoded English strings remain: `dashboard`, `submit-lead`, `leads`, `leads/[id]`, `visits`, `visits/[id]`, `earnings`, `profile`, `shifts`
- [ ] Both auth pages use `useTranslations()`: `guard/login`, `guard/change-password`
- [ ] All 4 guard components use `useTranslations()`: `GuardProfileCard`, `GuardShiftList`, `GuardOnboarding`, `GuardPhotoUpload`
- [ ] Guard layout uses `useTranslations()` for bottom nav labels and the sticky rule banner text
- [ ] Shared status badge components (`lead-status-badge`, `visit-status-badge`, `payout-status-badge`, `closure-status-badge`, `listing-status-badge`) accept translated labels via props rather than using `useTranslations()` directly — these components are shared with the admin portal which stays English-only
- [ ] Money display uses `useFormatter().number(value, { style: 'currency', currency: 'INR' })` — replaces all manual `formatINR()` calls in guard-facing components
- [ ] Date display uses `useFormatter().relativeTime(date)` for relative timestamps and `useFormatter().dateTime(date, 'short')` for absolute dates — replaces manual date formatting in guard-facing components

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] Admin portal unaffected — no `NextIntlClientProvider` in admin layout, no `useTranslations()` calls in admin components
- [ ] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
src/i18n/
  request.ts                                      # getRequestConfig — reads locale cookie, loads messages

messages/
  en.json                                         # English translations (~225 keys, 14 namespaces)
  hi.json                                         # Hindi translations (~225 keys, placeholder quality)
  hinglish.json                                   # Hinglish translations (~225 keys, placeholder quality)

src/app/(guard)/
  layout.tsx                                      # Modified: wrap children in NextIntlClientProvider
  guard-layout-client.tsx                         # Modified: useTranslations for bottom nav + rule banner

src/app/(guard)/guard/
  dashboard/page.tsx                              # Modified: useTranslations('guard.dashboard')
  submit-lead/page.tsx                            # Modified: useTranslations('guard.submitLead')
  leads/page.tsx                                  # Modified: useTranslations('guard.leads')
  leads/[id]/page.tsx                             # Modified: useTranslations('guard.leads')
  visits/page.tsx                                 # Modified: useTranslations('guard.visits')
  visits/[id]/page.tsx                            # Modified: useTranslations('guard.visits')
  earnings/page.tsx                               # Modified: useTranslations('guard.earnings')
  profile/page.tsx                                # Modified: useTranslations('guard.profile') + language picker UI
  shifts/page.tsx                                 # Modified: useTranslations('guard.shifts')

src/app/(auth)/guard/
  layout.tsx                                        # Created: NextIntlClientProvider for guard auth pages
  login/page.tsx                                  # Modified: useTranslations('guard.login')
  change-password/page.tsx                        # Modified: useTranslations('guard.changePassword') + language picker

src/components/guard/
  GuardProfileCard.tsx                            # Modified: useTranslations
  GuardShiftList.tsx                              # Modified: useTranslations
  GuardOnboarding.tsx                             # Modified: useTranslations('guard.onboarding')
  GuardPhotoUpload.tsx                            # Modified: useTranslations

next.config.ts                                    # Modified: createNextIntlPlugin wrapper
```

## Scope Boundaries

### IN This Phase

- `next-intl` installation and non-routing mode setup (locale from cookie, no URL segments)
- `src/i18n/request.ts` with `getRequestConfig` reading the `locale` cookie
- `createNextIntlPlugin` wrapper in `next.config.ts`
- `NextIntlClientProvider` in guard layout (`src/app/(guard)/layout.tsx`) and guard auth layout (`src/app/(auth)/guard/layout.tsx`) — NOT in root, admin, public, or tenant layouts
- Translation files for 3 locales (`en.json`, `hi.json`, `hinglish.json`) with ~225 keys across 14 namespaces
- Language picker on guard profile page and first-login flow (after password change)
- Cookie-based locale persistence (`locale` cookie set on login and on language change)
- Server-side persistence via existing `updateMyLanguage` mutation
- All 9 guard pages wired to `useTranslations()`
- Both guard auth pages wired to `useTranslations()`
- All 4 guard components wired to `useTranslations()`
- Guard layout (bottom nav + rule banner) wired to `useTranslations()`
- Money formatting via `useFormatter().number()` with `{ style: 'currency', currency: 'INR' }`
- Date formatting via `useFormatter().relativeTime()` and `useFormatter().dateTime()`
- Shared status badge components updated to accept translated labels via props

### NOT In This Phase

- Admin panel translation — English only per spec, no `NextIntlClientProvider` in admin layout
- Public listing page translation — English only per spec
- Tenant portal translation — not in V1
- URL-based locale routing (no `/en/guard/...` vs `/hi/guard/...`) — non-routing mode used throughout
- Professional Hindi/Hinglish translation review — outside engineering scope; translation files are placeholder quality
- Locale-specific fonts — standard system fonts handle Devanagari adequately
- RTL support — Hindi is LTR, not needed
- Dynamic content translation (admin notes, system messages, owner names) — English only per spec
- Modifying `src/proxy.ts` — must not be touched; `next-intl` non-routing mode needs no middleware changes
