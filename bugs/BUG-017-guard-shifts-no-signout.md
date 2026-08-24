# BUG-017: No sign-out control on guard shifts page

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | Low                        |
| **Status**     | **FIXED**                  |
| **Area**       | Guard Portal (P03-E04-T03) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

The guard shifts page (`/guard/shifts`) does not have a Sign Out button, while the guard dashboard and profile pages do. All guard portal pages should provide a way to sign out.

## Repro Steps

1. Login as guard → Navigate to `/guard/shifts`
2. Look for a Sign Out button or link

## Expected

Sign Out control present (either in header or on the page), consistent with dashboard and profile pages.

## Actual

No Sign Out control visible on the shifts page.

## Root Cause

The shifts page likely doesn't include the same header/action area that the dashboard and profile pages have. Sign out may only be on pages that use a specific layout component.

## Fix

Not yet fixed. Add Sign Out button to the shifts page, or ensure the guard layout provides a consistent sign-out control on all pages.
