# BUG-003: Dashboard "Assigned Roles" always shows empty

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| **Severity**   | Medium                                               |
| **Status**     | **FIXED**                                            |
| **Area**       | Admin Dashboard                                      |
| **Found**      | 2026-02-17                                           |
| **Fixed**      | 2026-02-17                                           |
| **Fix Commit** | `convex/users.ts` — `getCurrentUser` role enrichment |

## Description

The admin dashboard "Assigned Roles" card always shows "No roles assigned yet" even when the admin has the Super Admin role assigned.

## Repro Steps

1. Login as Test Admin via `/dev/login`
2. Land on `/admin/dashboard`
3. Look at "Assigned Roles" card

## Expected

Should show "Super Admin" badge (after role assignment via `/admin/roles/admins`).

## Actual

Shows: "No roles assigned yet. Role assignments will appear here once configured."

## Analysis (Not Yet Investigated)

The dashboard uses `api.users.getCurrentUser` which returns the user document. The `getRoleNames()` function on the dashboard page tries to extract role names from `role_names` or `roles` fields on the user object.

Possible causes:

1. The `getCurrentUser` query doesn't join/include role assignments
2. The user document doesn't have `role_names` or `roles` fields
3. Role assignments exist in `user_role_assignments` table but aren't surfaced on the user document

**Files to investigate:**

- `src/app/(admin)/admin/dashboard/page.tsx` — `getRoleNames()` function
- `convex/users.ts` — `getCurrentUser` query (check what fields it returns)
- `convex/schema.ts` — `users` table schema (check if `role_names` exists)

## Root Cause

`convex/users.ts` `getCurrentUser` returned the raw user doc for admin users without joining `user_role_assignments` + `roles` tables. The dashboard's `getRoleNames()` looked for `role_names` field that didn't exist on the returned object.

## Fix

Added role enrichment for admin users in `getCurrentUser` — queries `user_role_assignments` + `roles` tables, returns `role_names: string[]` on the user object.

## Verification

Logged in as Test Admin → dashboard "Assigned Roles" card now shows "Super Admin" badge. ✅
