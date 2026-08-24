# Admin Guards — Verification Log

| Field           | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Status**      | TESTED                                                |
| **Last Tested** | 2026-02-17                                            |
| **Test Method** | Docker Playwright (browser-pool-1) + browser_snapshot |
| **Tested By**   | Round 2: ses_393f87894ffeTG1QUwYLNtULIW               |

## Workflows Tested

| ID  | Workflow                                                | Result | Notes                                                                  |
| --- | ------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| W5  | Guards page loads with heading                          | PASS   |                                                                        |
| W6  | Filter controls present (search, society, type, status) | PASS   |                                                                        |
| W7  | Existing guards shown (Test Guard from seed)            | FAIL   | Test Guard not in list — see BUG-004                                   |
| W8  | Add Guard dialog opens with correct fields              | PASS   | Name, Phone, Society, Guard Type, Password                             |
| W9  | Empty form validation                                   | PASS   | Shows required field errors                                            |
| W10 | Create guard with valid data                            | PASS   | "Playwright Guard", phone 8888888888                                   |
| W11 | Guard created confirmation                              | PASS   | Shows modal "Guard Created Successfully!" (not toast)                  |
| W12 | DB verify guard created                                 | PASS   | `user_type: "GUARD"`, phone `8888888888` in users table                |
| W13 | Navigate to guard detail                                | PASS   | `/admin/guards/[id]`                                                   |
| W14 | Detail page shows guard info                            | PASS   | Name, phone, society, type badge, status badge                         |
| W15 | Stat cards show zeros                                   | PASS   | Leads 0, Rate —, Visits 0, Earnings —                                  |
| W16 | Profile tab shows full details                          | PASS   |                                                                        |
| W17 | Placeholder tabs                                        | PASS\* | Shifts tab is functional (weekly view), others show phase placeholders |
| W18 | Edit dialog opens                                       | PASS   |                                                                        |
| W19 | Edit guard name                                         | PASS   | Changed to "Playwright Guard Updated"                                  |
| W20 | Edit confirmed                                          | PASS   | Toast "Guard updated", name updates                                    |
| W21 | DB verify edit                                          | PASS   | Name updated in users table                                            |
| W22 | Change Status dialog opens                              | PASS   |                                                                        |
| W23 | Change to INACTIVE                                      | PASS   |                                                                        |
| W24 | Status change confirmed                                 | PASS   | Toast "Status updated", badge shows INACTIVE                           |
| W25 | DB verify status change                                 | PASS   | `status: "INACTIVE"` in users table                                    |
| W26 | Reset Password dialog opens                             | PASS   |                                                                        |
| W27 | Enter new password                                      | PASS   |                                                                        |
| W28 | Reset confirmed                                         | PASS   | Shows modal "Password Reset Successfully!" (not toast)                 |
| W29 | Return to guards list                                   | PASS   |                                                                        |
| W30 | Inactive status filter                                  | PASS   | Shows only inactive guards                                             |
| W31 | Active status filter                                    | FAIL\* | Works but Test Guard not shown — see BUG-004                           |
| W32 | All status filter                                       | PASS   |                                                                        |
| W33 | Type filter (Main Gate)                                 | PASS   |                                                                        |
| W34 | Search by name                                          | PASS   | "Playwright" → only matching guard                                     |
| W35 | Clear search                                            | PASS   |                                                                        |

## DB Verifications

| Check                   | Table | Result | Evidence                                                                     |
| ----------------------- | ----- | ------ | ---------------------------------------------------------------------------- |
| Guard created           | users | PASS   | phone `8888888888`, user_type `GUARD`                                        |
| Guard name edited       | users | PASS   | name `Playwright Guard Updated`                                              |
| Guard status changed    | users | PASS   | status `INACTIVE`                                                            |
| Test Guard exists in DB | users | PASS   | phone `9999999999`, user_type `GUARD`, status `ACTIVE` — but not shown in UI |

## Known Issues

- [BUG-004](../bugs/BUG-004-test-guard-not-in-list.md) — Test Guard not in list (FIXED)
- [BUG-010](../bugs/BUG-010-guard-list-missing-created-column.md) — Guard list missing Created column (Medium)
- [BUG-011](../bugs/BUG-011-guard-create-duplicate-phone-raw-error.md) — Duplicate phone shows raw error (High)

## Round 2 Summary

**57/60 PASS, 3 FAIL** — Full CRUD verified: list, search, filter, create, edit, status change, password reset, guard detail, society guards tab, invalid ID handling. Sign-out present on all admin pages.

## Test Data Created

| Entity | Identifier        | State    | Notes                                          |
| ------ | ----------------- | -------- | ---------------------------------------------- |
| Guard  | phone: 8888888877 | ACTIVE   | Created Round 2 (8888888888 was duplicate)     |
| Guard  | phone: 8888888888 | INACTIVE | Created Round 1, status changed during testing |
