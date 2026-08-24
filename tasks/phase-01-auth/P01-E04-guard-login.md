---
id: P01-E04
title: Guard Login Flow
phase: 1
status: done
depends_on: ["P01-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-16
---

# P01-E04: Guard Login Flow

## Overview

Implement the complete guard authentication flow: custom phone+password login page, server action that authenticates via WorkOS using synthetic email, password change gate for first-time logins, and a placeholder dashboard to verify the end-to-end flow works.

## Task Queue

- [ ] P01-E04-T01: Create Guard Login Page UI
- [ ] P01-E04-T02: Create Guard Login Server Action
- [ ] P01-E04-T03: Create Guard Change Password Page UI
- [ ] P01-E04-T04: Create Guard Change Password Server Action
- [ ] P01-E04-T05: Create Guard Dashboard Placeholder
- [ ] P01-E04-T06: Write Tests for Guard Login Flow

---

## T01: Create Guard Login Page UI

### Objective

Build a mobile-first guard login page with phone number and password inputs, using react-hook-form + zod for validation, matching the premium Rental Platform OS design language.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Login Screen" section (layout, field specs, error handling)
- `notes/01-tech-stack.md` — "Client-Side Libraries" table (react-hook-form, zod, sonner)
- `notes/01-tech-stack.md` — "Tailwind v4 + shadcn/ui" subsection (new-york variant, Geist fonts, 0.5rem radius)
- `notes/13-constants-reference.md` — Phone number format rules (10 digits only)

### Key Rules

1. Phone input: accepts exactly 10 digits. Strip spaces, dashes, and +91 prefix on input. Numeric-only keyboard hint (`inputMode="numeric"`)
2. Password input: non-empty validation only (WorkOS enforces policy server-side)
3. Use `react-hook-form` with `zodResolver` for form state and validation
4. Use shadcn/ui `Input`, `Button`, `Card` components (new-york variant)
5. Show loading spinner on submit button while authenticating (disable button)
6. Error display: use `sonner` toast for server errors (invalid credentials, account suspended). Inline red text for validation errors (empty phone, wrong length)
7. No +91 prefix in the phone input — guards enter 10 digits only. The server action handles the synthetic email conversion
8. Mobile-first: centered card layout, min touch targets 44×44px, body font 16px minimum
9. No "forgot password" link — admin resets guard passwords manually

### Deliverables

- [ ] `src/app/(auth)/guard/login/page.tsx` — Guard login page with phone+password form

### Acceptance Criteria

1. Phone field rejects non-numeric input and validates exactly 10 digits
2. Form submits to the server action created in T02 (import the action)
3. Loading state shown during submission (button disabled + spinner)
4. Validation errors shown inline below fields
5. Server errors shown via sonner toast
6. Page is mobile-responsive with centered card layout
7. `npm run build` succeeds

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on `src/app/(auth)/guard/login/page.tsx` — expect zero errors.

### Out of Scope

- Server action implementation (T02)
- Admin login page (separate epic)
- Language selector / i18n (Phase 14)
- Browser fingerprint tracking (Phase 11)

---

## T02: Create Guard Login Server Action

### Objective

Implement the server action that authenticates a guard by converting their phone number to a synthetic email, calling WorkOS authenticateWithPassword, storing the session, and redirecting to the appropriate page.

### Required Reading

- `notes/01-tech-stack.md` — "Guard Login Flow" subsection (full flow description, lines 26-33)
- `notes/01-tech-stack.md` — "Auth Callback" subsection (saveSession pattern)
- `notes/11-convex-architecture.md` — "Shared Utility Layer" section (normalizePhone, toSyntheticEmail from lib/validators.ts)

### Key Rules

1. File MUST use `"use server"` directive at the top
2. Convert phone to synthetic email: `${normalizePhone(phone)}@guards.local` using `toSyntheticEmail()` from `lib/validators.ts`
3. Call `getWorkOS().userManagement.authenticateWithPassword({ clientId, email: syntheticEmail, password })`
4. On success: call `saveSession()` from `@workos-inc/authkit-nextjs` with the access token, refresh token, and user data
5. On success: redirect to `/guard/dashboard` (or `/guard/change-password` if `must_change_password` is true in user metadata)
6. On failure: return a user-friendly error message — NEVER expose raw WorkOS error strings to the user
7. Map common WorkOS errors: invalid credentials → "Invalid phone number or password", suspended account → "Your account has been suspended. Contact your supervisor."
8. Use `WORKOS_CLIENT_ID` from `process.env` — never hardcode
9. **Why Server Action, not Convex Action**: Convex Actions cannot set browser cookies. The auth session cookie must be set by the Next.js server via `saveSession()`

### Deliverables

- [ ] `src/app/(auth)/guard/login/actions.ts` — Server action `guardLogin(phone: string, password: string)`

### Acceptance Criteria

1. Phone is normalized via `normalizePhone()` before constructing synthetic email
2. WorkOS `authenticateWithPassword` is called with correct parameters
3. On success, `saveSession()` stores the session cookie
4. On success, redirects to `/guard/dashboard` (or `/guard/change-password`)
5. On failure, returns `{ error: string }` with user-friendly message (no raw WorkOS errors)
6. TypeScript compiles clean

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(auth)/guard/login/actions.ts` — expect zero errors.

### Out of Scope

- Password change logic (T04)
- Session refresh / token expiry handling (handled by AuthKit middleware)
- Middleware route protection (separate task)
- Browser fingerprint logging (Phase 11)

---

## T03: Create Guard Change Password Page UI

### Objective

Build the password change form that guards see on first login (when `must_change_password` is true). The form collects current password, new password, and confirmation.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Change Password" section (if exists, otherwise follow login page patterns)
- `notes/01-tech-stack.md` — "Password change gate" description (line 111)
- `notes/01-tech-stack.md` — "Client-Side Libraries" table (react-hook-form, zod, sonner)

### Key Rules

1. Three fields: current password, new password, confirm new password
2. Zod validation: new password minimum 8 characters (WorkOS default policy), confirm must match new password
3. Current password field is required — we verify the guard knows their temp password before allowing change
4. Use same premium styling as login page: centered card, mobile-first, Rental Platform OS branding
5. Show loading state on submit, error via sonner toast, validation errors inline
6. Page is accessible even when `must_change_password` is true — all other guard routes redirect here
7. Display a friendly message: "Please change your temporary password to continue"
8. Use shadcn/ui components (Input, Button, Card) matching login page design

### Deliverables

- [ ] `src/app/(auth)/guard/change-password/page.tsx` — Password change form

### Acceptance Criteria

1. Three password fields with proper labels and types (`type="password"`)
2. Zod schema enforces: current password non-empty, new password ≥ 8 chars, confirm matches new
3. Form submits to server action created in T04
4. Loading state and error handling match login page patterns
5. Friendly instructional text displayed above the form
6. `npm run build` succeeds

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on `src/app/(auth)/guard/change-password/page.tsx` — expect zero errors.

### Out of Scope

- Server action for password change (T04)
- Password strength meter (V2)
- "Show password" toggle (nice-to-have, not required for V1)

---

## T04: Create Guard Change Password Server Action

### Objective

Implement the server action that verifies the guard's current password, changes it via WorkOS, flips the `must_change_password` flag in Convex, refreshes the session, and redirects to the dashboard.

### Required Reading

- `notes/01-tech-stack.md` — "Password change gate" description (line 111)
- `notes/01-tech-stack.md` — "Guard password change" in Convex Actions section (line 284)
- `notes/11-convex-architecture.md` — "Password Management" section in Actions layer (changePassword action, lines 326-342)

### Key Rules

1. File MUST use `"use server"` directive at the top
2. Step 1: Get the current session to retrieve the user's email (synthetic email)
3. Step 2: Verify current password by calling `getWorkOS().userManagement.authenticateWithPassword()` with existing email + current password — if this fails, the current password is wrong
4. Step 3: Call `getWorkOS().userManagement.updateUser(workosUserId, { password: newPassword })` to set the new password
5. Step 4: Call a Convex mutation to set `must_change_password = false` on the user record (use `fetchMutation` from `convex/nextjs` or call the Convex Action `changePassword`)
6. Step 5: Call `saveSession()` to refresh the session with new tokens (re-authenticate with new password)
7. Step 6: Redirect to `/guard/dashboard`
8. **Why Server Action**: Same as login — must set browser cookies via `saveSession()`. Convex Actions cannot do this.
9. On failure: return user-friendly error. "Current password is incorrect" or "New password does not meet requirements"

### Deliverables

- [ ] `src/app/(auth)/guard/change-password/actions.ts` — Server action `changeGuardPassword(currentPassword: string, newPassword: string)`

### Acceptance Criteria

1. Current password is verified before attempting change
2. WorkOS `updateUser` is called with the new password
3. Convex `must_change_password` flag is flipped to `false`
4. Session is refreshed via `saveSession()` after password change
5. Redirects to `/guard/dashboard` on success
6. Returns user-friendly error messages on failure
7. TypeScript compiles clean

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(auth)/guard/change-password/actions.ts` — expect zero errors.

### Out of Scope

- Admin-initiated password reset (Phase 3 — Guard Management)
- Password history / reuse prevention (not in V1)
- Account lockout after failed attempts (WorkOS handles this)

---

## T05: Create Guard Dashboard Placeholder

### Objective

Create a minimal guard dashboard page that proves the full login flow works end-to-end. Shows the guard's name and confirms they are authenticated.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Home Screen" section (for context on what this page becomes later)
- `notes/01-tech-stack.md` — "Route Protection & Middleware" section (guard layout checks)

### Key Rules

1. File path: `src/app/(guard)/dashboard/page.tsx`
2. This is a placeholder — minimal UI, not the final dashboard
3. Display guard's name from Convex user record (use `useQuery` with a simple user query)
4. Show "Welcome, {name}" message and a "You are logged in as a guard" confirmation
5. Include a sign-out button/link (calls WorkOS signOut)
6. Mobile-first layout (this page lives inside the guard portal route group)
7. If user data is loading, show a centered spinner

### Deliverables

- [ ] `src/app/(guard)/dashboard/page.tsx` — Placeholder dashboard showing authenticated guard info

### Acceptance Criteria

1. Page renders without errors when a guard is authenticated
2. Shows the guard's name from the user record
3. Sign-out functionality works (clears session, redirects to login)
4. Loading state while user data is being fetched
5. `npm run build` succeeds

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on `src/app/(guard)/dashboard/page.tsx` — expect zero errors.

### Out of Scope

- Bottom navigation bar (future guard layout epic)
- Rule banner (Phase 11)
- Lead count, visit count, earnings summary (built in their respective phases)
- Guard layout with `must_change_password` redirect (separate layout task)

---

## T06: Write Tests for Guard Login Flow

### Objective

Write unit tests for the validation logic and utility functions used in the guard login flow: phone normalization, synthetic email construction, and zod validation schemas.

### Required Reading

- `notes/11-convex-architecture.md` — "Shared Utility Layer" section (normalizePhone, toSyntheticEmail implementations)
- `notes/11-convex-architecture.md` — "Testing Approach" section (convex-test pattern)

### Key Rules

1. Test `normalizePhone()` from `lib/validators.ts`: strips spaces, dashes, +91 prefix; rejects non-10-digit inputs
2. Test `toSyntheticEmail()` from `lib/validators.ts`: `"9876543210"` → `"9876543210@guards.local"`
3. Test zod login schema: valid 10-digit phone passes, empty phone fails, 9-digit phone fails, 11-digit phone fails, empty password fails
4. Test zod change-password schema: matching passwords pass, mismatched passwords fail, password < 8 chars fails
5. Use `vitest` (or project's configured test runner)
6. Test files: place alongside the code they test or in a `__tests__` directory

### Deliverables

- [ ] `lib/__tests__/validators.test.ts` — Tests for normalizePhone, toSyntheticEmail
- [ ] `src/app/(auth)/guard/login/__tests__/validation.test.ts` — Tests for login form zod schema
- [ ] `src/app/(auth)/guard/change-password/__tests__/validation.test.ts` — Tests for change-password form zod schema

### Acceptance Criteria

1. `normalizePhone("9876543210")` returns `"9876543210"`
2. `normalizePhone("+91 98765 43210")` returns `"9876543210"`
3. `normalizePhone("98765-43210")` returns `"9876543210"`
4. `normalizePhone("12345")` throws an error
5. `toSyntheticEmail("9876543210")` returns `"9876543210@guards.local"`
6. Login schema rejects empty phone, non-10-digit phone, empty password
7. Change-password schema rejects passwords < 8 chars and mismatched confirm
8. All tests pass

### Verification

```bash
npm run test
```

If vitest: `npx vitest run lib/__tests__/validators.test.ts src/app/(auth)/guard/login/__tests__/validation.test.ts src/app/(auth)/guard/change-password/__tests__/validation.test.ts`

### Out of Scope

- Integration tests against real WorkOS (mock-based unit tests only)
- Convex mutation/query tests (tested via `convex-test` in backend test files)
- E2E browser tests (not in V1 task scope)
