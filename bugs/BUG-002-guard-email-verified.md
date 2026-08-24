# BUG-002: Guard creation missing emailVerified flag

| Field        | Value                      |
| ------------ | -------------------------- |
| **Severity** | Critical                   |
| **Status**   | FIXED                      |
| **Area**     | Auth — Guard Creation      |
| **Found**    | 2026-02-16                 |
| **Fixed**    | 2026-02-16                 |
| **Fix File** | `convex/actions/workos.ts` |

## Description

Guards created via admin portal couldn't log in because their WorkOS account had unverified synthetic email.

## Repro Steps

1. Admin creates a guard via "Add Guard" dialog
2. Guard tries to log in at `/guard/login` with their phone + password
3. Authentication fails

## Expected

Guard can log in with phone + temporary password after admin creation.

## Actual

WorkOS `authenticateWithPassword` fails because the synthetic email (`{phone}@guards.local`) is not verified, and WorkOS may require verified email for password auth.

## Root Cause

The `createGuardAccount` Convex Action creates WorkOS users with synthetic emails (`{phone}@guards.local`) but did **not** set `emailVerified: true`. These synthetic emails can never be verified through normal email verification flow since they're not real email addresses.

```typescript
// BEFORE (broken)
const user = await workos.userManagement.createUser({
  email: syntheticEmail,
  password: password,
  firstName: name,
  // emailVerified not set — defaults to false
});
```

## Fix

Added `emailVerified: true` to the `createUser` call since synthetic emails are system-generated and can never be verified through normal means.

```typescript
// AFTER (fixed)
const user = await workos.userManagement.createUser({
  email: syntheticEmail,
  password: password,
  firstName: name,
  emailVerified: true, // <-- synthetic emails must be pre-verified
});
```

## Verification

Playwright test: created guard via admin → logged in as guard at `/guard/login` → landed on `/guard/dashboard`.
