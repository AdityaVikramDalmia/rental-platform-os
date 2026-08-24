# BUG-018: Sign-out redirects to WorkOS error page

| Field          | Value      |
| -------------- | ---------- |
| **Severity**   | Medium     |
| **Status**     | **FIXED**  |
| **Area**       | Auth       |
| **Found**      | 2026-02-17 |
| **Fixed**      | —          |
| **Fix Commit** | —          |

## Description

Clicking the "Sign Out" button redirects to `https://error.workos.com/user_management/app-homepage-url-not-found` instead of logging the user out and returning them to the app's login or landing page.

## Repro Steps

1. Login as admin via `/dev/login` → click "Test Admin"
2. Navigate to any admin page (e.g. `/admin/leads`)
3. Click the "Sign Out" button in the top banner

## Expected

User is logged out and redirected to the app's login page or landing page (e.g. `/` or `/admin/login`).

## Actual

Browser navigates to `https://error.workos.com/user_management/app-homepage-url-not-found` — a WorkOS error page indicating the app homepage URL is not configured.

## Root Cause

The WorkOS AuthKit sign-out flow redirects to the "App Homepage URL" configured in the WorkOS dashboard. This URL is either not set or set incorrectly in the WorkOS project settings. The sign-out call likely uses `signOut()` from AuthKit which triggers a WorkOS-side redirect.

## Fix

Configure the "App Homepage URL" in the WorkOS dashboard (Environment → Redirects) to `http://localhost:3000` (dev) or the production URL. Alternatively, check if the sign-out handler in the app can specify a custom redirect URL.
