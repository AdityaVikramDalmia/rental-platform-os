# Admin Management — Verification Log

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Status**      | TESTED                                     |
| **Last Tested** | 2026-02-17                                 |
| **Test Method** | Playwright + browser_snapshot + Convex CLI |
| **Tested By**   | Coding agent (automated browser run) |

## Workflows Tested

| ID  | Workflow                                   | Result | Notes                                                                      |
| --- | ------------------------------------------ | ------ | -------------------------------------------------------------------------- |
| W27 | Admin management page loads                | PASS   | "Admin Role Assignment" heading                                            |
| W28 | Admin list with names, emails, role badges | PASS   |                                                                            |
| W29 | Test Admin listed                              | PASS   |                                                                            |
| W30 | Create Admin button visible                | PASS   |                                                                            |
| W31 | Role assignment UI present                 | PASS   | Dropdown/select for role assignment                                        |
| W32 | Assign Super Admin to Test Admin               | PASS   | Test Admin had no role initially                                               |
| W33 | Role badge appears                         | PASS   | "Super Admin" badge shown                                                  |
| W34 | DB verify assignment                       | PASS\* | `user_role_assignments` table (not `userRoleAssignments`) shows assignment |
| W35 | Unassign role                              | PASS   | Removed Super Admin from Test Admin                                            |
| W36 | Badge disappears                           | PASS   |                                                                            |
| W37 | DB verify unassignment                     | PASS\* | Assignment row has `is_deleted: true`                                      |

## DB Verifications

| Check           | Table                 | Result | Evidence                                              |
| --------------- | --------------------- | ------ | ----------------------------------------------------- |
| Role assigned   | user_role_assignments | PASS   | Row with `is_deleted: false` for Test Admin + Super Admin |
| Role unassigned | user_role_assignments | PASS   | Same row updated to `is_deleted: true`                |

## Important Behavior Noted

**Self-revocation causes permission error:** When Test Admin (the only admin) revoked their own Super Admin role, the roles admin page showed `Missing permission: roles.view` error. This is expected behavior — you lose access when you remove your own permissions. The agent re-assigned Super Admin to restore access.

## Post-Test State

- Test Admin has Super Admin role assigned (restored after self-revocation test)

## Notes

- Convex table name is `user_role_assignments` (snake_case), not `userRoleAssignments` (camelCase)
- The `npx convex data user_role_assignments` command works for DB verification
