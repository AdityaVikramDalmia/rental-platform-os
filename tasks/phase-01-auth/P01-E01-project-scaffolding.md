---
id: P01-E01
title: Project Scaffolding
phase: 1
status: done
depends_on: []
skills: ["rental-platform-os-rules"]
updated_at: 2026-02-17
---

# P01-E01: Project Scaffolding

## Overview
Initialize the Next.js + Convex + shadcn/ui project from scratch, install all dependencies, set up shared utility libraries, and configure linting rules. This creates the foundation every subsequent epic builds on.

## Task Queue
- [x] P01-E01-T01: Initialize Next.js Project
- [x] P01-E01-T02: Install All Dependencies
- [x] P01-E01-T03: Initialize Convex
- [x] P01-E01-T04: Initialize shadcn/ui
- [x] P01-E01-T05: Create Shared Utility Libraries
- [x] P01-E01-T06: Configure ESLint + Prettier

---

## T01: Initialize Next.js Project

### Objective
Create the Next.js project in the existing `rental-platform-os/` directory with TypeScript, Tailwind CSS, ESLint, App Router, and `src/` directory enabled.

### Required Reading
- `notes/01-tech-stack.md` — "Project Structure" section (directory layout)

### Key Rules
1. Use App Router (`--app`), NOT Pages Router.
2. Use `src/` directory (`--src-dir`) — frontend code lives under `src/`.
3. Use `@/*` import alias — all project imports use this prefix.
4. Use Turbopack for dev server (`--turbopack`).

### Deliverables
- [ ] `package.json` — Created by create-next-app
- [ ] `tsconfig.json` — Created with `@/*` path alias
- [ ] `next.config.ts` — Created by create-next-app
- [ ] `src/app/layout.tsx` — Root layout
- [ ] `src/app/page.tsx` — Default home page
- [ ] `src/app/globals.css` — Tailwind directives

### Acceptance Criteria
1. `npm run build` succeeds with zero errors
2. `src/` directory exists with `app/` inside it
3. `tsconfig.json` contains `"@/*"` path alias
4. Tailwind CSS is configured and working

### Verification
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --turbopack --import-alias "@/*" --yes
npm run build
```

### Out of Scope
- Installing additional dependencies (T02)
- Convex initialization (T03)
- shadcn/ui setup (T04)

---

## T02: Install All Dependencies

### Objective
Install all production and development dependencies required by the Rental Platform OS platform so that subsequent tasks can import them without additional installs.

### Required Reading
- `notes/01-tech-stack.md` — "Client-Side Libraries" section (full list)
- `notes/10-convex-schema.md` — "Key Convex Packages" section (convex, convex-helpers, rate-limiter, aggregate)

### Key Rules
1. Install exact packages listed — do not substitute alternatives.
2. `convex-test`, `vitest`, and `@edge-runtime/vm` are dev-only dependencies.
3. `@convex-dev/workos-authkit` is the Convex component for WorkOS auth sync.
4. `@workos-inc/authkit-nextjs` is the Next.js SDK for WorkOS session management.

### Deliverables
- [ ] `package.json` — Updated with all production and dev dependencies

### Acceptance Criteria
1. `npm install` succeeds without errors
2. All packages listed below are in `package.json`:
   - **Production**: `convex`, `convex-helpers`, `@convex-dev/workos-authkit`, `@workos-inc/authkit-nextjs`, `@convex-dev/rate-limiter`, `@convex-dev/aggregate`, `react-hook-form`, `@hookform/resolvers`, `zod`, `sonner`, `framer-motion`, `next-themes`, `date-fns`, `browser-image-compression`, `next-intl`
   - **Dev**: `convex-test`, `vitest`, `@edge-runtime/vm`
3. No unresolved peer dependency warnings

### Verification
```bash
npm install convex convex-helpers @convex-dev/workos-authkit @workos-inc/authkit-nextjs @convex-dev/rate-limiter @convex-dev/aggregate react-hook-form @hookform/resolvers zod sonner framer-motion next-themes date-fns browser-image-compression next-intl
npm install --save-dev convex-test vitest @edge-runtime/vm
npm ls --depth=0
```

### Out of Scope
- Configuring any of these packages (later tasks)
- WorkOS environment variables (separate epic)

---

## T03: Initialize Convex

### Objective
Initialize the Convex backend so that `convex/` directory exists with auto-generated types, and `convex.json` is created at the project root.

### Required Reading
- `notes/01-tech-stack.md` — "Convex Database" section (why Convex, patterns used)

### Key Rules
1. Run `npx convex dev --once` to create the directory structure without starting the dev server.
2. The `convex/_generated/` directory contains auto-generated types — never edit these files.
3. `convex.json` at root stores the Convex project URL.
4. If `npx convex dev --once` requires login or project creation, follow the interactive prompts.

### Deliverables
- [ ] `convex/` directory — Created with `_generated/` subdirectory
- [ ] `convex.json` — Project configuration at root

### Acceptance Criteria
1. `convex/` directory exists
2. `convex/_generated/` directory exists with `api.d.ts` and `server.d.ts`
3. `convex.json` exists at root with project URL

### Verification
```bash
npx convex dev --once
ls convex/_generated/
cat convex.json
```

### Out of Scope
- Schema definition (P01-E02-T01)
- Component registration (P01-E02-T02)
- Setting environment variables (separate epic)

---

## T04: Initialize shadcn/ui

### Objective
Set up shadcn/ui with the "new-york" style variant and install essential UI components. Update `globals.css` with premium design tokens using oklch color space.

### Required Reading
- `notes/01-tech-stack.md` — "Tailwind v4 + shadcn/ui" section (style variant, font, radius, oklch)
- `notes/01-tech-stack.md` — "shadcn/ui + Tailwind" section (component categories)

### Key Rules
1. Use **"new-york"** style variant — smaller, refined components for premium feel.
2. Use **neutral** base color for initial setup.
3. Enable **CSS variables** for theming.
4. Use **Geist Sans** font (already default in Next.js 15+).
5. Set border radius to `0.5rem` (8px base).
6. Use **oklch** color space for all theme colors in `globals.css`.

### Deliverables
- [ ] `components.json` — shadcn/ui configuration
- [ ] `src/components/ui/` — All installed component files
- [ ] `src/app/globals.css` — Updated with oklch design tokens, Zinc base with blue accent, 0.5rem radius

### Acceptance Criteria
1. `components.json` exists with `style: "new-york"`
2. The following shadcn/ui components are installed: `button`, `card`, `input`, `label`, `form`, `dialog`, `sheet`, `dropdown-menu`, `sonner`, `badge`, `separator`, `skeleton`, `avatar`, `tooltip`
3. `globals.css` uses oklch color values for theme variables
4. `npm run build` succeeds

### Verification
```bash
npx shadcn@latest init -d --style new-york --base-color neutral --css-variables
npx shadcn@latest add button card input label form dialog sheet dropdown-menu sonner badge separator skeleton avatar tooltip
npm run build
```

### Out of Scope
- Custom component creation (later epics)
- Dark mode toggle component (later epic)
- Guard portal or admin panel layouts (later epics)

---

## T05: Create Shared Utility Libraries

### Objective
Create the four shared utility libraries (`lib/constants.ts`, `lib/validators.ts`, `lib/money.ts`, `lib/dates.ts`) that are imported by both Convex functions and frontend components.

### Required Reading
- `notes/13-constants-reference.md` — Full file (all enums, permissions, config keys, audit actions)
- `notes/11-convex-architecture.md` — "Shared Utility Layer" section (phone normalization, money utilities)
- `notes/01-tech-stack.md` — "Project Structure" section (`lib/` is shared between convex/ and src/)

### Key Rules
1. Phone numbers are always **10 digits** — strip +91, spaces, dashes. Throw on invalid.
2. Money is always **integer paise** (× 100). Use `Math.round()` when converting from rupees.
3. Dates are always **Unix milliseconds** (`Date.now()`). No string dates.
4. Flat numbers are always **UPPERCASE**.
5. Use `as const` satisfies pattern for enum objects to get both type safety and runtime access.
6. All permission strings from `notes/13-constants-reference.md` must be exported.
7. All system config keys from `notes/13-constants-reference.md` must be exported.
8. All audit action strings from `notes/13-constants-reference.md` must be exported.

### Deliverables
- [ ] `lib/constants.ts` — All status enums (SOCIETY_STATUS, USER_STATUS, LEAD_STATUS, VISIT_STATUS, LISTING_STATUS, CLOSURE_STATUS, PAYOUT_STATUS), type enums (USER_TYPE, GUARD_TYPE, SHIFT_TYPE, LOCATION_TYPE, AVAILABILITY_TYPE, FURNISHING, BHK_CONFIG, PARKING, PAYOUT_METHOD, INCENTIVE_CARD_TYPE, INCENTIVE_LEVEL, INCENTIVE_AWARD_METHOD, INQUIRY_SOURCE, AUDIT_ACTOR_TYPE, QUALITY_FLAGS, LANGUAGE_PREFERENCE, VISIT_OUTCOME, CALL_OUTCOME), all permission strings, all audit action strings, all system config keys with defaults, amenities list
- [ ] `lib/validators.ts` — `normalizePhone(raw: string): string`, `formatPhoneDisplay(phone: string): string`, `toSyntheticEmail(phone: string): string`, `validateFlatNumber(flatNumber: string): string` (returns uppercased)
- [ ] `lib/money.ts` — `rupeesToPaise(rupees: number): number`, `paiseToRupees(paise: number): number`, `formatINR(paise: number): string`
- [ ] `lib/dates.ts` — `formatDate(ms: number): string`, `formatDateTime(ms: number): string`, `toUnixMs(date: Date): number`, `fromUnixMs(ms: number): Date`

### Acceptance Criteria
1. `npx tsc --noEmit` passes with zero errors
2. `lib/constants.ts` exports every enum value from `notes/13-constants-reference.md`
3. `normalizePhone("9876543210")` returns `"9876543210"`
4. `normalizePhone("+91 98765 43210")` returns `"9876543210"`
5. `normalizePhone("12345")` throws an error
6. `rupeesToPaise(25000)` returns `2500000`
7. `paiseToRupees(2500000)` returns `25000`
8. `formatINR(2500000)` returns a string containing `"25,000"` (INR formatted)
9. `toSyntheticEmail("9876543210")` returns `"9876543210@guards.local"`
10. `validateFlatNumber("a-1201")` returns `"A-1201"` (uppercased)

### Verification
```bash
npx tsc --noEmit
```

### Out of Scope
- Convex validators (those use `v.union(v.literal(...))` in schema)
- React components or hooks
- i18n translation files

---

## T06: Configure ESLint + Prettier

### Objective
Configure ESLint with a `no-restricted-imports` rule that blocks direct imports of `mutation` and `internalMutation` from `convex/_generated/server`, enforcing that all domain files import from `convex/functions.ts` instead. Set up Prettier for consistent formatting.

### Required Reading
- `notes/11-convex-architecture.md` — "Wrapped Mutations" section (ESLint rule pattern)

### Key Rules
1. The ESLint rule must block `mutation` and `internalMutation` imports from any path matching `*/_generated/server`.
2. The error message must explain WHY: `"Import mutation from './functions' to enable audit triggers"`.
3. `query` and `internalQuery` imports from `_generated/server` are ALLOWED (queries don't need triggers).
4. Do NOT block imports from `_generated/api` — that's where `api` and `internal` references come from.
5. Prettier config should use consistent settings: single quotes, trailing commas, 2-space indent, 100 print width.

### Deliverables
- [ ] `eslint.config.mjs` (or `.eslintrc.json`) — Updated with `no-restricted-imports` rule for `convex/_generated/server`
- [ ] `.prettierrc` — Prettier configuration file
- [ ] `package.json` — Updated with `format` script (`prettier --write .`)

### Acceptance Criteria
1. `npm run lint` passes on the current codebase
2. A test file importing `mutation` from `convex/_generated/server` would fail lint
3. A test file importing `query` from `convex/_generated/server` would pass lint
4. A test file importing `mutation` from `convex/functions` would pass lint
5. Prettier config file exists with consistent settings

### Verification
```bash
npm run lint
```

### Out of Scope
- Husky / lint-staged pre-commit hooks (optional, not required for V1)
- Additional custom lint rules beyond the import restriction

---

## Completion Summary

**Completed**: 2026-02-17

### What Was Built
- Next.js 16.1.6 (App Router, Turbopack, `src/` dir, `@/*` alias)
- Convex running locally at `http://127.0.0.1:3210` (anonymous deployment `anonymous-rental-platform-os-1`)
- shadcn/ui (new-york style, neutral base, oklch colors, 0.5rem radius) — 14 components installed
- 4 shared utility libraries in `lib/` (constants, validators, money, dates)
- ESLint with `no-restricted-imports` blocking direct `mutation`/`internalMutation` from `_generated/server`
- Prettier configured (2-space, double quotes, trailing commas, 100 width)

### Key File Locations
| File | What |
|------|------|
| `lib/constants.ts` | ALL enums, 48 permissions, 30 audit actions, 18 config keys+defaults, status color maps, amenities |
| `lib/validators.ts` | `normalizePhone()`, `formatPhoneDisplay()`, `toSyntheticEmail()`, `validateFlatNumber()` |
| `lib/money.ts` | `rupeesToPaise()`, `paiseToRupees()`, `formatINR()` |
| `lib/dates.ts` | `toUnixMs()`, `fromUnixMs()`, `formatDate()`, `formatDateTime()` |
| `src/lib/utils.ts` | shadcn's `cn()` utility (Tailwind class merge) — separate from shared `lib/` |
| `eslint.config.mjs` | ESLint with audit trigger import enforcement |
| `.env.local` | Convex local deployment + WorkOS credentials (cookie password needs manual replacement) |
| `convex/_generated/` | Auto-generated Convex types — never edit |

### Deviations from Spec
- **Permission count**: Doc references "39 permissions" in some places but actual count from `13-constants-reference.md` is **48**. `lib/constants.ts` has all 48.
- **Convex local**: Running locally (not cloud) by design. URL is `http://127.0.0.1:3210`.
- **shadcn init**: Used `-d` (defaults) flag — style auto-detected as `new-york`. Manually set radius to `0.5rem`.

### Gotchas for Next Epic
- `convex/` directory exists but only has `_generated/` and `tsconfig.json` — no schema yet.
- `lib/` is at project ROOT (shared). `src/lib/` is Next.js only (shadcn utils). Don't confuse them.
- The Convex dev server must be running (`npx convex dev`) for schema pushes to work.
- `.env.local` has `WORKOS_COOKIE_PASSWORD=<generate-a-random-string-of-at-least-32-characters> — needs manual replacement before auth works.
