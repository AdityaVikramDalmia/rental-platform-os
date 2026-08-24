# Admin Roles — Verification Log

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Status**      | TESTED                                     |
| **Last Tested** | 2026-02-17                                 |
| **Test Method** | Playwright + browser_snapshot + Convex CLI |
| **Tested By**   | ses_3951a68cdffeDb1jcw6HRjnlzp             |

## Workflows Tested

| ID  | Workflow                                            | Result | Notes                                                                                  |
| --- | --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| W1  | Roles page loads with heading                       | PASS   |                                                                                        |
| W2  | Table with Name, Permissions, Type, Actions columns | PASS   |                                                                                        |
| W3  | System roles show "System" badge                    | PASS   |                                                                                        |
| W4  | System role Delete button disabled                  | PASS   |                                                                                        |
| W5  | "New Role" and "Manage Admins" buttons visible      | PASS   |                                                                                        |
| W6  | Navigate to create role page                        | PASS   | `/admin/roles/new`                                                                     |
| W7  | Create role form with fields                        | PASS   | Name, Description, Permissions editor                                                  |
| W8  | Empty form validation                               | PASS   | Role name required, at least one permission                                            |
| W9  | Select permissions                                  | PASS\* | Used `leads.view` and `leads.verify` (not `LEADS_MANAGE` — test prompt had wrong name) |
| W10 | Create role → toast + redirect                      | PASS   | "Role created", redirects to `/admin/roles`                                            |
| W11 | New role in table with "Custom" badge               | PASS   |                                                                                        |
| W12 | DB verify role created                              | PASS   | `name: "Test Reviewer"`, `is_deleted: false`                                           |
| W13 | Edit role page loads                                | PASS   | `/admin/roles/[id]`                                                                    |
| W14 | Form pre-filled with role data                      | PASS   |                                                                                        |
| W15 | Edit name + add permission                          | PASS   | Added `guards.view`                                                                    |
| W16 | Edit confirmed → toast + redirect                   | PASS   | "Role updated"                                                                         |
| W17 | DB verify edit                                      | PASS   | Name "Test Reviewer Updated", permissions include `guards.view`                        |
| W18 | Edit system role page                               | PASS   |                                                                                        |
| W19 | System role name field disabled                     | PASS   |                                                                                        |
| W20 | System role permissions disabled                    | PASS   |                                                                                        |
| W21 | System role protection text shown                   | PASS   |                                                                                        |
| W22 | Delete custom role → dialog                         | PASS   |                                                                                        |
| W23 | Confirmation dialog text                            | PASS   |                                                                                        |
| W24 | Delete confirmed → toast + role gone                | PASS   | "Role deleted"                                                                         |
| W25 | DB verify soft delete                               | PASS   | `is_deleted: true`                                                                     |
| W26 | System role delete button disabled                  | PASS   |                                                                                        |

## DB Verifications

| Check             | Table | Result | Evidence                                                               |
| ----------------- | ----- | ------ | ---------------------------------------------------------------------- |
| Role created      | roles | PASS   | `name: "Test Reviewer"`, permissions: `["leads.view", "leads.verify"]` |
| Role edited       | roles | PASS   | `name: "Test Reviewer Updated"`, permissions include `"guards.view"`   |
| Role soft-deleted | roles | PASS   | `is_deleted: true`                                                     |

## Test Data Created

| Entity | Identifier                                | State        | Notes                                |
| ------ | ----------------------------------------- | ------------ | ------------------------------------ |
| Role   | "Test Reviewer" → "Test Reviewer Updated" | soft-deleted | Created W10, edited W15, deleted W22 |

## Notes

- Permission names in UI use dot notation (`leads.view`, `guards.manage`) not screaming snake case
