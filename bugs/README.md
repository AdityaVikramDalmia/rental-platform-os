# Bugs

Discovered bugs tracked with status, repro steps, and root cause analysis.

## Bug Index

| ID      | Title                                                       | Severity | Status    | Area                  | File                                                         |
| ------- | ----------------------------------------------------------- | -------- | --------- | --------------------- | ------------------------------------------------------------ |
| BUG-001 | Guard login redirect caught by try/catch                    | Critical | **FIXED** | Auth                  | [BUG-001](BUG-001-guard-login-redirect.md)                   |
| BUG-002 | Guard creation missing emailVerified flag                   | Critical | **FIXED** | Auth                  | [BUG-002](BUG-002-guard-email-verified.md)                   |
| BUG-003 | Dashboard "Assigned Roles" always empty                     | Medium   | **FIXED** | Admin Dashboard       | [BUG-003](BUG-003-dashboard-roles-empty.md)                  |
| BUG-004 | Test Guard not visible in guards list                       | Medium   | **FIXED** | Admin Guards          | [BUG-004](BUG-004-test-guard-not-in-list.md)                 |
| BUG-005 | Guard dashboard crashes — "Guard profile not found"         | Critical | **FIXED** | Guard Portal          | [BUG-005](BUG-005-guard-dashboard-crash.md)                  |
| BUG-006 | Guard login/change-password broken by redirect in try/catch | High     | **FIXED** | Auth                  | [BUG-006](BUG-006-created-guard-login-fails.md)              |
| BUG-007 | Recurring shift day selection fails with type mismatch      | High     | **FIXED** | Shift Mgmt            | [BUG-007](BUG-007-shift-day-type-mismatch.md)                |
| BUG-008 | One-time override shift date field not required             | Medium   | **FIXED** | Shift Mgmt            | [BUG-008](BUG-008-shift-override-date-not-required.md)       |
| BUG-009 | Week navigation buttons lack text labels                    | Low      | **FIXED** | Shift Mgmt            | [BUG-009](BUG-009-shift-nav-buttons-no-labels.md)            |
| BUG-010 | Guard list table missing Created column                     | Medium   | **FIXED** | Admin Guards          | [BUG-010](BUG-010-guard-list-missing-created-column.md)      |
| BUG-011 | Duplicate phone guard creation shows raw backend error      | High     | **FIXED** | Admin Guards          | [BUG-011](BUG-011-guard-create-duplicate-phone-raw-error.md) |
| BUG-012 | Lead form floor input is free-text instead of dropdown      | Medium   | **FIXED** | Lead Submission       | [BUG-012](BUG-012-lead-form-floor-not-dropdown.md)           |
| BUG-013 | Admin lead queue table missing Owner column                 | Medium   | **FIXED** | Admin Lead Queue      | [BUG-013](BUG-013-lead-queue-missing-owner-column.md)        |
| BUG-014 | Admin lead queue missing society filter                     | Medium   | **FIXED** | Admin Lead Queue      | [BUG-014](BUG-014-lead-queue-missing-society-filter.md)      |
| BUG-015 | Admin lead queue counts and rows go out of sync             | High     | **FIXED** | Admin Lead Queue      | [BUG-015](BUG-015-lead-queue-count-row-mismatch.md)          |
| BUG-016 | Guard shifts page shows 8-day window instead of 7           | Medium   | **FIXED** | Guard Portal          | [BUG-016](BUG-016-guard-shifts-8-day-window.md)              |
| BUG-017 | No sign-out control on guard shifts page                    | Low      | **FIXED** | Guard Portal          | [BUG-017](BUG-017-guard-shifts-no-signout.md)                |
| BUG-018 | Sign-out redirects to WorkOS error page                     | Medium   | **FIXED** | Auth                  | [BUG-018](BUG-018-signout-redirect-workos-error.md)          |
| BUG-019 | Lead queue "All" tab shows empty state                      | Medium   | **FIXED** | Admin Lead Queue      | [BUG-019](BUG-019-lead-queue-all-tab-empty.md)               |

## Open Bug Summary

**0 open bugs.** All 23 tracked bugs have been fixed.

## Severity Levels

| Level        | Meaning                                         |
| ------------ | ----------------------------------------------- |
| **Critical** | Feature completely broken, blocks user workflow |
| **High**     | Feature partially broken, workaround exists     |
| **Medium**   | Incorrect behavior, doesn't block core workflow |
| **Low**      | Cosmetic, UX polish, minor inconsistency        |

## Status Values

| Status            | Meaning                          |
| ----------------- | -------------------------------- |
| **OPEN**          | Bug confirmed, not yet fixed     |
| **INVESTIGATING** | Root cause analysis in progress  |
| **FIXED**         | Fix implemented and verified     |
| **WONTFIX**       | Intentional behavior or deferred |

## For Agents

Before debugging a bug:

1. Check this index first — it may already be tracked
2. If you find a new bug, create `BUG-NNN-short-slug.md` following the template
3. Update this README index
4. If you fix a bug, update status to FIXED with fix reference

### Bug File Template

```markdown
# BUG-NNN: Title

| Field          | Value                                  |
| -------------- | -------------------------------------- |
| **Severity**   | Critical / High / Medium / Low         |
| **Status**     | OPEN / INVESTIGATING / FIXED / WONTFIX |
| **Area**       | Feature area (e.g. Auth, Admin Guards) |
| **Found**      | Date                                   |
| **Fixed**      | Date (if fixed)                        |
| **Fix Commit** | Commit hash or file references         |

## Description

What's wrong in 1-2 sentences.

## Repro Steps

1. Step one
2. Step two
3. ...

## Expected

What should happen.

## Actual

What happens instead.

## Root Cause

Why it happens (if known).

## Fix

What was changed (if fixed).
```
