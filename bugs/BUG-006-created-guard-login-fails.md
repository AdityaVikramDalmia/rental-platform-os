# BUG-006: Guard login and change-password broken by redirect in try/catch

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| **Severity**   | High                                                          |
| **Status**     | **FIXED**                                                     |
| **Area**       | Auth — Guard Login / Change Password                          |
| **Found**      | 2026-02-17                                                    |
| **Fixed**      | 2026-02-17                                                    |
| **Fix Commit** | `src/app/(auth)/guard/change-password/actions.ts` (line ~140) |

## Description

Two distinct issues prevented guards from completing the login → change-password → dashboard flow:

1. Guards created before BUG-002 fix had unverified WorkOS emails, blocking authentication entirely.
2. The change-password page's `redirect()` was inside a `try/catch`, causing it to show a generic error even though the password was actually updated in WorkOS.

## Repro Steps

1. Admin creates guard via portal
2. Guard logs in at `/guard/login` with temp password
3. Redirected to `/guard/change-password`
4. Enter current password, new password, confirm
5. Click CHANGE PASSWORD

## Expected

Redirect to `/guard/dashboard` after successful password change.

## Actual

Toast shows "Unable to change password right now. Please try again." — but the password was actually changed in WorkOS (proven by subsequent login with new password).

## Root Cause

**BUG-001 variant**: In `src/app/(auth)/guard/change-password/actions.ts`, `redirect("/guard/dashboard")` on line 140 was inside a `try/catch` block (lines 113-145). Next.js `redirect()` works by throwing a special error internally — the catch block intercepts it and maps it to a generic error message.

Additionally, guards created before the BUG-002 `emailVerified: true` fix could not authenticate at all — WorkOS returns "Email ownership must be verified before authentication."

## Fix

Moved `redirect("/guard/dashboard")` outside the `try/catch` block, matching the pattern used in the BUG-001 fix for `guard/login/actions.ts`.

## Verification

Full end-to-end cycle with freshly created guard:

1. Admin creates guard (phone 6666666666, temp password TempPass123!) — ✅
2. Guard login with temp password → redirected to `/guard/change-password` — ✅
3. Change password (TempPass123! → MyNewPass456!) → redirected to `/guard/dashboard` — ✅
4. Dashboard shows "Welcome, Password Test Guard" with full nav — ✅
