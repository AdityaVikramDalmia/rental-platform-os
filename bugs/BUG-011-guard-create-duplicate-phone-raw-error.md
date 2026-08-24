# BUG-011: Duplicate phone guard creation shows raw backend error

| Field          | Value                                      |
| -------------- | ------------------------------------------ |
| **Severity**   | High                                       |
| **Status**     | FIXED                                      |
| **Area**       | Admin Guards (P03-E02-T03)                 |
| **Found**      | 2026-02-17                                 |
| **Fixed**      | 2026-02-17                                 |
| **Fix Commit** | convex/actions/workos.ts, convex/guards.ts |

## Description

When creating a guard with a phone number that already exists (duplicate), the system surfaces a raw Convex/WorkOS stack error instead of a user-friendly validation message like "Phone number already in use".

## Repro Steps

1. Login as admin → Navigate to `/admin/guards`
2. Click "Add Guard"
3. Fill form with a phone number that already exists (e.g., 8888888888 if a guard with that phone exists)
4. Submit the form

## Expected

User-friendly error toast: "Phone number already in use" or similar validation message.

## Actual

Raw backend/WorkOS error surfaced to the user — Convex stack-style server error message shown.

## Root Cause

The `createGuardAccount` action likely doesn't catch the WorkOS duplicate user error and translate it into a friendly message. The error propagates raw to the frontend.

## Fix

1. Added `checkPhoneExists` internalQuery in `convex/guards.ts` — pre-checks Convex DB for existing phone before hitting WorkOS API
2. In `convex/actions/workos.ts` `createGuardAccount`:
   - Added pre-check call to `checkPhoneExists` — fails fast with "A guard with this phone number already exists"
   - Wrapped `workos.userManagement.createUser` in try/catch — catches WorkOS 409/duplicate errors and surfaces the same friendly message
   - Non-duplicate WorkOS errors get re-thrown with a clean prefix: "Failed to create guard account: ..."
3. Frontend (`GuardCreateDialog.tsx`) already catches errors and shows `toast.error(message)` — no frontend changes needed
