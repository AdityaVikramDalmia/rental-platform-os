# BUG-001: Guard login redirect caught by try/catch

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| **Severity** | Critical                                |
| **Status**   | FIXED                                   |
| **Area**     | Auth — Guard Login                      |
| **Found**    | 2026-02-16                              |
| **Fixed**    | 2026-02-16                              |
| **Fix File** | `src/app/(auth)/guard/login/actions.ts` |

## Description

Guard login always showed "Unable to log in right now" even when authentication succeeded.

## Repro Steps

1. Create a guard via admin portal (or use seeded Test Guard)
2. Navigate to `/guard/login`
3. Enter valid phone + password
4. Click Sign In

## Expected

Redirect to `/guard/dashboard` with welcome message.

## Actual

Error message: "Unable to log in right now. Please try again." — even though authentication succeeded.

## Root Cause

Next.js `redirect()` throws a special `NEXT_REDIRECT` error internally. The `redirect("/guard/dashboard")` call was **inside** a `try/catch` block in the server action. The catch block caught the redirect error and returned the generic error message.

```typescript
// BEFORE (broken)
try {
  await authenticateWithPassword(email, password);
  await saveSession(session);
  redirect("/guard/dashboard"); // <-- throws NEXT_REDIRECT, caught below
} catch (error) {
  return "Unable to log in right now. Please try again."; // <-- catches redirect!
}
```

## Fix

Moved `redirect()` calls outside the try/catch block. Only `authenticateWithPassword` and `saveSession` remain inside try/catch.

```typescript
// AFTER (fixed)
try {
  await authenticateWithPassword(email, password);
  await saveSession(session);
} catch (error) {
  return "Unable to log in right now. Please try again.";
}
redirect("/guard/dashboard"); // <-- now outside try/catch
```

## Verification

Playwright test confirmed: login → redirect to `/guard/dashboard` → "Welcome, Test Guard" shown.
