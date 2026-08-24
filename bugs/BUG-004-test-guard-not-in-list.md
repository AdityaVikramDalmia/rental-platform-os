# BUG-004: Test Guard not visible in admin guards list

| Field          | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| **Severity**   | Medium                                                     |
| **Status**     | **FIXED**                                                  |
| **Area**       | Admin Guards                                               |
| **Found**      | 2026-02-17                                                 |
| **Fixed**      | 2026-02-17                                                 |
| **Fix Commit** | `convex/seed.ts` — added Test Society + guard_profiles row |

## Description

The seeded Test Guard (phone: 9999999999) doesn't appear in the admin guards list even though it exists in the `users` table with `user_type: "GUARD"`.

## Repro Steps

1. Login as admin via `/dev/login`
2. Navigate to `/admin/guards`
3. Set filter to "All" status, "All Types", "All Societies"
4. Look for Test Guard in the list

## Expected

Test Guard should appear in the guards list with name "Test Guard", phone "+91 99999 99999", status ACTIVE.

## Actual

Test Guard is not shown. Only other guards (like admin user "Test Admin" or newly created guards) appear.

DB confirms Test Guard exists:

```
_id: "m97fhrte6df8hbsqwt4rmwr4z1819s2n"
name: "Test Guard"
phone: "9999999999"
status: "ACTIVE"
user_type: "GUARD"
```

## Analysis (Not Yet Investigated)

The guards list page uses `api.guards.list` query. Possible causes:

1. The `guards.list` query might be filtering on additional criteria (society_id, guard_type, etc.)
2. Test Guard might be missing a `guard_type` field that's required for listing
3. Test Guard might not be associated with any society, and the query might require it
4. The query might use an index that excludes records missing certain fields

**Files to investigate:**

- `convex/guards.ts` — `list` query implementation
- `convex/schema.ts` — `users` table schema, indexes on guard fields
- `convex/seed.ts` — How Test Guard is seeded (what fields are set)

## Root Cause

`convex/guards.ts` `list` query iterates the `guard_profiles` table (not `users`). The seed script created a Test Guard user record but never created a `guard_profiles` row. No profile → query never finds it.

## Fix

Updated `convex/seed.ts` to create a "Test Society" (ACTIVE, Mumbai) and a `guard_profiles` row for Test Guard (MAIN_GATE type, linked to Test Society).

Note: Fix only applies to fresh seed runs (seed is idempotent — existing DBs need manual profile creation). New guards created via admin portal always get profiles correctly.
