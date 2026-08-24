---
epic_id: P01-E04
title: "Guard Login Flow Verification"
type: browser
status: pending
depends_on_epic: P01-E04
verified_at: null
failures: 0
---

# P01-E04 Verification: Guard Login Flow

## Readiness Gates

- [ ] Epic frontmatter shows `status: done` in `tasks/phase-01-auth/P01-E04-guard-login.md`
- [ ] Completion Summary exists and any deviations are reviewed
- [ ] Dev server running: `npm run dev:force` (http://localhost:3000)
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Login helper page reachable: http://localhost:3000/dev/login
- [ ] Test guard account available: `9999999999@guards.local` / `DevGuard123!`
- [ ] Test admin account available for route-boundary checks: `admin@example.com` / `DevAdmin123!`
- [ ] A guard test user with `must_change_password: true` is prepared for password-gate scenarios

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests (guard auth validation + helpers)
npm run test -- lib/__tests__/validators.test.ts src/app/(auth)/guard/login/__tests__/validation.test.ts src/app/(auth)/guard/change-password/__tests__/validation.test.ts
```

**Expected**: All commands exit 0. If a listed test file does not exist yet, note it in Results.

---

## Scenarios

### V01: Guard Login Page Validates 10-Digit Phone + Required Password — AC Ref: T01-AC1, T01-AC4, T01-AC6

**Precondition**: Logged out browser session.

**Actions**:

1. Navigate to `/guard/login`.
2. Enter invalid phone inputs (letters, 9 digits, 11 digits).
3. Leave password empty and submit.
4. Enter valid 10-digit phone and non-empty password.

**Assert**:

- [ ] Non-numeric and wrong-length phone input is rejected.
- [ ] Validation errors render inline below the relevant fields.
- [ ] Page layout remains mobile-first with centered card.

**Evidence**: screenshot + console

---

### V02: Guard Login Submission State + Server Error Handling — AC Ref: T01-AC2, T01-AC3, T01-AC5

**Precondition**: Logged out browser session on `/guard/login`.

**Actions**:

1. Enter valid-shaped phone and an incorrect password.
2. Submit the form.
3. Observe button state during request.
4. Observe UI feedback after failed auth.

**Assert**:

- [ ] Form submission is wired to server action from T02.
- [ ] Submit button is disabled and shows loading state while request is in flight.
- [ ] Server-side auth failure is surfaced via `sonner` toast.

**Evidence**: screenshot + network + console

---

### V03: Guard Login Server Action Success Path Persists Session + Redirects — AC Ref: T02-AC1, T02-AC2, T02-AC3, T02-AC4

**Precondition**: Valid guard account exists (`9999999999@guards.local`).

**Actions**:

1. Submit login form using guard phone `9999999999` and password `DevGuard123!`.
2. Inspect request handling path for phone normalization.
3. Confirm WorkOS password auth call executes with synthetic email.
4. Confirm session cookie is set.
5. Verify redirect destination.

**Assert**:

- [ ] Phone is normalized before synthetic email construction.
- [ ] `authenticateWithPassword` is called with expected parameters.
- [ ] `saveSession()` persists the auth session.
- [ ] Redirect lands on `/guard/dashboard` for standard active guard logins.

**Evidence**: network + cookie inspection + screenshot

---

### V04: Guard Login Server Action Failure Maps Friendly Errors — AC Ref: T02-AC5, T02-AC6

**Precondition**: Logged out browser session; one invalid credential and one suspended/banned guard case available.

**Actions**:

1. Attempt login with invalid credentials.
2. Attempt login with suspended/banned guard account.
3. Inspect returned error payload and UI toast text.

**Assert**:

- [ ] Failure response returns `{ error: string }` with user-friendly message.
- [ ] Raw WorkOS error text is not exposed in UI.
- [ ] Invalid credentials and suspended account cases map to correct friendly messages.

**Evidence**: screenshot + network payload

---

### V05: Change Password Page Validation + UX Contract — AC Ref: T03-AC1, T03-AC2, T03-AC3, T03-AC4, T03-AC5, T03-AC6

**Precondition**: Guard with `must_change_password: true` can access `/guard/change-password`.

**Actions**:

1. Navigate to `/guard/change-password`.
2. Verify presence of current/new/confirm password fields.
3. Submit with invalid values (new < 8 chars, mismatched confirm).
4. Submit valid values.
5. Observe helper text and submission behavior.

**Assert**:

- [ ] Form shows three password fields with proper labels and `type="password"`.
- [ ] Zod validation enforces required current password, min 8-char new password, matching confirm.
- [ ] Form submits to T04 server action.
- [ ] Loading and error patterns match login flow conventions.
- [ ] Instructional text prompts temporary-password change.
- [ ] Build for this page path is stable.

**Evidence**: screenshot + console

---

### V06: Change Password Server Action Completes End-to-End Flow — AC Ref: T04-AC1, T04-AC2, T04-AC3, T04-AC4, T04-AC5, T04-AC6, T04-AC7

**Precondition**: Logged-in guard with `must_change_password: true` and known current password.

**Actions**:

1. Submit valid current password + new password.
2. Verify current password is checked before update.
3. Verify WorkOS user password update call.
4. Verify Convex user flag update (`must_change_password -> false`).
5. Verify session refresh and redirect behavior.
6. Repeat with incorrect current password and invalid new password cases.

**Assert**:

- [ ] Current password is verified before change attempt.
- [ ] WorkOS `updateUser` is invoked for password update.
- [ ] Convex user flag flips to `false`.
- [ ] Session refresh occurs via `saveSession()`.
- [ ] Successful flow redirects to `/guard/dashboard`.
- [ ] Failure paths return friendly error strings.
- [ ] TypeScript contract is intact for server action.

**Evidence**: network + screenshot + database check

---

### V07: Guard Dashboard Placeholder Confirms Auth + Sign-Out — AC Ref: T05-AC1, T05-AC2, T05-AC3, T05-AC4, T05-AC5

**Precondition**: Authenticated guard session available.

**Actions**:

1. Navigate to `/guard/dashboard` after successful login.
2. Verify welcome message includes guard name.
3. Verify logged-in guard confirmation text.
4. Trigger sign-out.
5. Revisit guarded route.

**Assert**:

- [ ] Dashboard renders successfully for authenticated guard.
- [ ] Guard name from user record is displayed.
- [ ] Sign-out clears session and returns user to login flow.
- [ ] Loading state is shown while user query resolves.
- [ ] Build remains successful after this flow.

**Evidence**: screenshot series + cookie inspection

---

### V08: Guard Login Unit Tests Cover Validators + Schemas — AC Ref: T06-AC1, T06-AC2, T06-AC3, T06-AC4, T06-AC5, T06-AC6, T06-AC7, T06-AC8

**Precondition**: Test files from T06 are present.

**Actions**:

1. Run targeted tests for validator and schema files.
2. Inspect assertions for phone normalization and synthetic email generation.
3. Inspect assertions for login and change-password zod schemas.

**Assert**:

- [ ] `normalizePhone` test matrix passes valid and invalid cases.
- [ ] `toSyntheticEmail` mapping test passes.
- [ ] Login schema rejects empty/wrong-length phone and empty password.
- [ ] Change-password schema rejects short passwords and mismatched confirm.
- [ ] All tests pass.

**Evidence**: test output

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
| V07 | pending | —        | —     |
| V08 | pending | —        | —     |

---

## Failure Reports
