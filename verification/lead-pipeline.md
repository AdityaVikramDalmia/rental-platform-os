# Lead Pipeline — Verification Log

| Field           | Value                                                 |
| --------------- | ----------------------------------------------------- |
| **Status**      | TESTED                                                |
| **Last Tested** | 2026-02-17                                            |
| **Test Method** | Docker Playwright (browser-pool-3) + browser_snapshot |
| **Tested By**   | Round 2 Agent 3: ses_393f787deffeJ0qEHIIvs4bSPk       |

## Part 1: Guard Lead Submission

| ID  | Workflow                    | Result | Notes                                        |
| --- | --------------------------- | ------ | -------------------------------------------- |
| W1  | Navigate to /dev/login      | PASS   |                                              |
| W2  | Click Test Guard preset     | PASS   | Redirected to /guard/dashboard               |
| W3  | Guard dashboard loads       | PASS   | "Welcome, Test Guard"                        |
| W4  | Navigate to Submit Lead     | PASS   | Via nav item                                 |
| W5  | Sign-out accessible         | PASS   | On guard dashboard                           |
| W6  | Submission form loads       | PASS   | /guard/submit-lead                           |
| W7  | Required fields present     | PASS   | Building, Floor, Flat, Phone, consent        |
| W8  | Building dropdown populates | PASS   | "Test Tower A"                               |
| W9  | Floor dropdown by building  | FAIL   | Floor is free-text, not dropdown — BUG-012   |
| W10 | Empty submit validation     | PASS   | Inline errors for required fields            |
| W11 | Fill valid lead data        | PASS   |                                              |
| W12 | Submit loading state        | PASS   |                                              |
| W13 | Success feedback            | PASS   | "Lead Submitted!" success state              |
| W14 | Post-submit options         | PASS   | "Submit Another" + "View My Leads"           |
| W15 | Guard leads list            | PASS   | /guard/leads with lead cards                 |
| W16 | Leads list displays         | PASS   |                                              |
| W17 | New lead shows SUBMITTED    | PASS   |                                              |
| W18 | Lead metadata shown         | PASS   | Flat details, status, relative time          |
| W19 | Lead detail on click        | PASS   |                                              |
| W20 | Submit same flat again      | PASS   |                                              |
| W21 | Duplicate lead submitted    | PASS   | Submission accepted (not blocked)            |
| W22 | Duplicate flagged           | PASS   | Shows as "Potential Duplicate" in guard list |
| W23 | Duplicate behavior          | PASS   | Not blocked — flagged for admin review       |

## Part 2: Admin Lead Queue

| ID  | Workflow                        | Result | Notes                                                      |
| --- | ------------------------------- | ------ | ---------------------------------------------------------- |
| W24 | Navigate to /dev/login          | PASS   |                                                            |
| W25 | Click Test Admin preset         | PASS   | Admin dashboard                                            |
| W26 | Sign-out present                | PASS   |                                                            |
| W27 | Leads in sidebar → /admin/leads | PASS   |                                                            |
| W28 | Lead queue loads                | PASS   | Table with filters                                         |
| W29 | Expected columns                | FAIL   | Owner column missing — BUG-013                             |
| W30 | Status badges                   | PASS   | Submitted, Need Info, Potential Duplicate, Rejected        |
| W31 | Test guard leads visible        | PASS   |                                                            |
| W32 | Sign-out on leads page          | PASS   |                                                            |
| W33 | Status filters                  | PASS   | All, Submitted, Need Info, Duplicates?, Verified, Rejected |
| W34 | Submitted filter                | PASS   |                                                            |
| W35 | Society filter                  | FAIL   | No society filter control — BUG-014                        |
| W36 | Search filter                   | PASS   | Phone search works                                         |
| W37 | Clear filters                   | FAIL   | Count/row mismatch under All — BUG-015                     |
| W38 | Click lead → detail             | PASS   |                                                            |
| W39 | Full lead detail                | PASS   | Lead, owner, guard, timeline, notes                        |
| W40 | Admin actions                   | PASS   | Call & Verify, Request Info, Reject, Set Bounty            |
| W41 | Request Info action             | PASS   |                                                            |
| W42 | Need Info dialog                | PASS   |                                                            |
| W43 | Enter admin note                | PASS   |                                                            |
| W44 | Need Info status update         | PASS   | Lead moved to Need Info                                    |
| W45 | Find duplicate lead             | PASS   | Via Duplicates? filter                                     |
| W46 | Duplicate indicator             | PASS   | Badge + flag + duplicate section in detail                 |
| W47 | Duplicate actions               | PASS   | Mark Duplicate / Not a Duplicate                           |
| W48 | Select lead for rejection       | PASS   |                                                            |
| W49 | Reject dialog                   | PASS   |                                                            |
| W50 | Enter rejection reason          | PASS   |                                                            |
| W51 | Rejection confirmed             | PASS   | Status → Rejected + toast                                  |
| W52 | Rejected lead in list           | PASS   | Under Rejected tab with badge                              |
| W53 | Pagination controls             | PASS   | N/A low volume                                             |
| W54 | Low-volume pagination note      | PASS   |                                                            |

**Summary: 50/54 PASS, 4 FAIL**

## Known Issues

- [BUG-012](../bugs/BUG-012-lead-form-floor-not-dropdown.md) — Floor is free-text, should be building-driven dropdown (Medium)
- [BUG-013](../bugs/BUG-013-lead-queue-missing-owner-column.md) — Admin lead queue missing Owner column (Medium)
- [BUG-014](../bugs/BUG-014-lead-queue-missing-society-filter.md) — Admin lead queue missing society filter (Medium)
- [BUG-015](../bugs/BUG-015-lead-queue-count-row-mismatch.md) — Lead queue counts/rows out of sync (High)

## Sign-Out Check

- Guard Dashboard: PRESENT
- Guard Submit Lead: MISSING (no direct sign-out on submission page)
- Admin Lead Queue: PRESENT

## Test Data Created

| Entity | Identifier     | State               | Notes                                    |
| ------ | -------------- | ------------------- | ---------------------------------------- |
| Lead   | Flat 101       | NEED_INFO→REJECTED  | Created W11, Need Info W44, Rejected W51 |
| Lead   | Flat 101 (dup) | POTENTIAL_DUPLICATE | Created W21, flagged as duplicate        |
