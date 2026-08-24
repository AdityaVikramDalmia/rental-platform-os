---
epic_id: P01-E01
title: "Project Scaffolding Verification"
type: code
status: pending
depends_on_epic: P01-E01
verified_at: null
failures: 0
---

# P01-E01 Verification: Project Scaffolding

## Readiness Gates

- [ ] Epic frontmatter shows `status: done` in `tasks/phase-01-auth/P01-E01-project-scaffolding.md`
- [ ] Completion Summary exists and deviations/gotchas reviewed
- [ ] Dev server running: `npm run dev:force` (http://localhost:3000)
- [ ] Convex dev running: `npx convex dev` (http://127.0.0.1:3210)
- [ ] Dependencies installed: `npm install` has completed successfully
- [ ] Seed data loaded: `npx convex run seed:init` (required for shared auth references)
- [ ] Test login route reachable: http://localhost:3000/dev/login
- [ ] Test admin account available: `admin@example.com` / `DevAdmin123!`
- [ ] Test guard account available: `9999999999@guards.local` / `DevGuard123!`

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests
npm run test -- lib/__tests__/validators.test.ts

# Lint (import restriction + formatting rules)
npm run lint
```

**Expected**: All commands exit 0.

---

## Scenarios

### V01: Next.js Base Scaffold Is Correct — AC Ref: T01-AC1, T01-AC2, T01-AC3, T01-AC4

**Precondition**: Fresh install completed, repository root is `rental-platform-os/`.

**Actions**:

1. Verify `src/app/` structure exists and includes `layout.tsx` + base app files.
2. Open `tsconfig.json` and confirm path alias contains `"@/*"`.
3. Run `npm run build`.
4. Open `src/app/globals.css` and confirm Tailwind directives are present.

**Assert**:

- [ ] Build exits successfully with zero errors.
- [ ] `src/` directory exists with `app/` inside.
- [ ] `@/*` alias is configured in TypeScript paths.
- [ ] Tailwind is configured and applied in global stylesheet.

**Evidence**: terminal output + file snapshot

---

### V02: Dependency Installation Matches Spec — AC Ref: T02-AC1, T02-AC2, T02-AC3

**Precondition**: `package.json` is present and lockfile is up to date.

**Actions**:

1. Run `npm install`.
2. Inspect `package.json` dependency and devDependency sections.
3. Run `npm ls --depth=0`.

**Assert**:

- [ ] Install completes without errors.
- [ ] All required production packages from T02 are present.
- [ ] All required dev packages from T02 are present.
- [ ] No unresolved peer dependency warnings are reported.

**Evidence**: terminal output

---

### V03: Convex Initialization Artifacts Exist — AC Ref: T03-AC1, T03-AC2, T03-AC3

**Precondition**: Convex login/project setup completed for local development.

**Actions**:

1. Run `npx convex dev --once`.
2. Verify `convex/` and `convex/_generated/` directories.
3. Check `convex/_generated/api.d.ts` and `convex/_generated/server.d.ts` exist.
4. Verify `convex.json` exists at repository root.

**Assert**:

- [ ] `convex/` directory exists.
- [ ] `convex/_generated/` contains generated type files.
- [ ] `convex.json` exists and contains project configuration.

**Evidence**: terminal output + file snapshot

---

### V04: shadcn/ui Setup + Theme Tokens Are Correct — AC Ref: T04-AC1, T04-AC2, T04-AC3, T04-AC4

**Precondition**: shadcn initialization already executed in this repo.

**Actions**:

1. Open `components.json` and verify `style` is `new-york`.
2. Verify component files exist under `src/components/ui/` for all listed components.
3. Inspect `src/app/globals.css` for oklch theme variables.
4. Run `npm run build`.

**Assert**:

- [ ] `components.json` exists with `style: "new-york"`.
- [ ] All required shadcn/ui components from T04 are installed.
- [ ] Theme variables in globals use oklch color values.
- [ ] Build succeeds.

**Evidence**: file snapshot + terminal output

---

### V05: Shared Utility Libraries Match Behavioral Contracts — AC Ref: T05-AC1, T05-AC2, T05-AC3, T05-AC4, T05-AC5, T05-AC6, T05-AC7, T05-AC8, T05-AC9, T05-AC10

**Precondition**: Utility files exist under `lib/` and tests can run.

**Actions**:

1. Run `npx tsc --noEmit`.
2. Execute targeted utility tests (or run assertions in test file): `normalizePhone`, `toSyntheticEmail`, `rupeesToPaise`, `paiseToRupees`, `formatINR`, `validateFlatNumber`.
3. Inspect `lib/constants.ts` exports against `notes/13-constants-reference.md`.

**Assert**:

- [ ] TypeScript compiles cleanly.
- [ ] Phone normalization passes valid and invalid cases exactly as specified.
- [ ] Money conversion helpers return expected paise/rupee values.
- [ ] INR formatting contains expected currency formatting pattern.
- [ ] Synthetic email and flat uppercase validators return expected outputs.
- [ ] Constants file includes every required enum set from the constants reference.

**Evidence**: terminal output + test output + file snapshot

---

### V06: Lint + Formatting Guardrails Enforce Import Policy — AC Ref: T06-AC1, T06-AC2, T06-AC3, T06-AC4, T06-AC5

**Precondition**: ESLint and Prettier configs are present.

**Actions**:

1. Run `npm run lint`.
2. Confirm `.prettierrc` exists and contains expected formatting settings.
3. Verify `package.json` includes `format` script.
4. Create a temporary lint probe (or inspect rule config) for restricted `mutation` import from `_generated/server`.

**Assert**:

- [ ] Lint passes on current codebase.
- [ ] Restriction exists for `mutation` and `internalMutation` imports from `_generated/server`.
- [ ] `query` import from `_generated/server` is still allowed by rule design.
- [ ] Importing `mutation` from `convex/functions` is allowed.
- [ ] Prettier config exists with consistent formatting settings.

**Evidence**: lint output + config snapshot

---

## Results

| ID  | Status  | Evidence | Notes |
| --- | ------- | -------- | ----- |
| V01 | pending | —        | —     |
| V02 | pending | —        | —     |
| V03 | pending | —        | —     |
| V04 | pending | —        | —     |
| V05 | pending | —        | —     |
| V06 | pending | —        | —     |

---

## Failure Reports
