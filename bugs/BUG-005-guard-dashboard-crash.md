# BUG-005: Guard dashboard crashes with "Guard profile not found"

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| **Severity**   | Critical                                                          |
| **Status**     | **FIXED**                                                         |
| **Area**       | Guard Portal — Dashboard                                          |
| **Found**      | 2026-02-17                                                        |
| **Fixed**      | 2026-02-17                                                        |
| **Fix Commit** | `convex/seed.ts` — same fix as BUG-004 (added guard_profiles row) |

## Description

Guard dashboard crashes with a runtime error when a guard user logs in. The `guards:getMyProfile` query throws "Guard profile not found".

## Repro Steps

1. Login as Test Guard via `/dev/login` (click "Test Guard" preset)
2. Land on `/guard/dashboard`
3. Page shows runtime error instead of welcome message

## Expected

Dashboard shows "Welcome, Test Guard" with sign out button.

## Actual

Runtime error: `[CONVEX Q(guards:getMyProfile)] ... Uncaught Error: Guard profile not found ... convex/guards.ts:610`

## Analysis

The `getMyProfile` query in `convex/guards.ts` (around line 610) expects the authenticated user to have a guard profile record in the database. The Test Guard user exists in the `users` table but may be missing required guard-specific fields or a related record.

**Possible causes:**

1. The seed script creates the user but doesn't set all guard-specific fields (guard_type, society_id, etc.)
2. The `getMyProfile` query requires fields that aren't set on seeded guards
3. The guard portal layout calls `getMyProfile` which throws if guard profile data is incomplete

**Files to investigate:**

- `convex/guards.ts` — `getMyProfile` query (line ~610)
- `convex/seed.ts` — How Test Guard is seeded
- `src/app/(guard)/guard/dashboard/page.tsx` — What queries it makes
- `src/app/(guard)/layout.tsx` — Guard layout auth check

## Root Cause

Same as BUG-004. Guard layout calls `api.guards.getMyProfile` which queries `guard_profiles`. Seeded Test Guard had no `guard_profiles` row → query throws "Guard profile not found".

## Fix

Same as BUG-004 — `convex/seed.ts` now creates a `guard_profiles` row for Test Guard.

## Verification

Guards created via admin portal (which always creates guard_profiles) load the dashboard correctly. Tested with guards 7777777777 and 6666666666 — both show "Welcome, [name]" with full nav. ✅
