# Admin Societies — Verification Log

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Status**      | TESTED                                     |
| **Last Tested** | 2026-02-17                                 |
| **Test Method** | Playwright + browser_snapshot + Convex CLI |
| **Tested By**   | Coding agent (automated browser run) |

## Workflows Tested

| ID  | Workflow                                      | Result | Notes                             |
| --- | --------------------------------------------- | ------ | --------------------------------- |
| W1  | Society list loads                            | PASS   |                                   |
| W2  | Create society                                | PASS   | Created "Cypress Gardens Phase 1" |
| W3  | View society detail                           | PASS   |                                   |
| W4  | Edit society (name, city)                     | PASS   |                                   |
| W5  | Create building                               | PASS   | Created "Tower Alpha"             |
| W6  | Edit building                                 | PASS   |                                   |
| W7  | Toggle building status                        | PASS   |                                   |
| W8  | Building appears in society detail            | PASS   |                                   |
| W9  | Society status ONBOARDING → ACTIVE            | PASS   |                                   |
| W10 | Society status ACTIVE → INACTIVE              | PASS   |                                   |
| W11 | Society status INACTIVE → ACTIVE (reactivate) | PASS   |                                   |
| W12 | Delete building (soft delete)                 | PASS   |                                   |
| W13 | Status filter (ACTIVE, INACTIVE, ONBOARDING)  | PASS   |                                   |
| W14 | Search societies                              | PASS   |                                   |
| W15 | Guards tab on society detail                  | PASS   | Shows placeholder                 |

## DB Verifications

| Check                         | Table     | Result | Evidence                                                |
| ----------------------------- | --------- | ------ | ------------------------------------------------------- |
| INACTIVE transition persisted | societies | PASS   | `npx convex data societies` showed `status: "INACTIVE"` |
| Building soft delete          | buildings | PASS   | `is_deleted: true` confirmed                            |

## Test Data Created

| Entity   | Identifier                | State        | Notes                                       |
| -------- | ------------------------- | ------------ | ------------------------------------------- |
| Society  | "Cypress Gardens Phase 1" | INACTIVE     | Created W2, went through status transitions |
| Society  | "Abcd"                    | ONBOARDING   | Pre-existing from earlier manual testing    |
| Building | "Tower Alpha"             | soft-deleted | Created W5, deleted W12                     |
