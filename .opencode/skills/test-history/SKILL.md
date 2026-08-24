---
name: test-history
description: Record and query functional test history in the verification/ directory — teaches agents the coverage map, verification file format, dedup protocol, and update workflow so no feature gets tested twice or left untested.
license: MIT
---

# Test History

Manage the `verification/` directory. Record test results, check what's been tested, avoid duplicate testing, update coverage.

**Different from `verification-agent`**: verification-agent teaches HOW to run tests (Playwright patterns, triage). This skill teaches HOW to record results and check what's already been tested.

**Different from `bug-tracker`**: bug-tracker manages individual bugs. This skill manages the testing COVERAGE — which features have been tested, what passed/failed, and what's still untested.

## When to Use

- About to test a feature → check if it's already tested
- Finished testing a feature → record results
- Starting a new session → check coverage map for untested areas
- Code changed since last test → mark affected features as NEEDS RETEST
- Planning test effort → see what's covered vs gaps

---

## Directory Structure

```
verification/
├── README.md               # Coverage map (index of all features + status)
├── admin-dashboard.md      # Per-feature verification logs
├── admin-societies.md
├── admin-guards.md
├── admin-roles.md
├── admin-management.md
├── admin-settings.md
├── guard-login.md
├── guard-portal.md
└── ...
```

### File Naming Convention

`{feature-area}.md` in kebab-case matching the feature being tested.

Examples: `admin-guards.md`, `guard-login.md`, `admin-settings.md`, `tenant-browse.md`

---

## Pre-Test Dedup Protocol (MANDATORY)

**ALWAYS check verification/ before testing a feature.** This prevents wasting time re-testing passing features.

### Step 1: Read Coverage Map

Read `verification/README.md` → find the feature in the Coverage Map table.

### Step 2: Check Status

| Status                                           | Decision                                            |
| ------------------------------------------------ | --------------------------------------------------- |
| **NOT TESTED**                                   | Proceed with testing                                |
| **TESTED** + no code changes since `Last Tested` | **SKIP** — already done                             |
| **TESTED** + code changed since `Last Tested`    | Mark as NEEDS RETEST, re-run only changed workflows |
| **NEEDS RETEST**                                 | Re-run workflows affected by code changes           |
| **PARTIAL**                                      | Test only the untested workflows                    |

### Step 3: Check for Code Changes (If Feature Was Previously Tested)

```bash
# Check if relevant files changed since last test date
git log --since="2026-02-17" --oneline -- convex/guards.ts src/app/\(admin\)/admin/guards/
# If output is empty → no changes → skip testing
# If output has commits → NEEDS RETEST
```

### Step 4: Read Existing Results

If feature was previously tested, read the verification file for:

- Which workflows already PASS (don't re-run these unless code changed)
- Which workflows FAILED (these might be fixed now)
- Known issues (bugs already filed)
- Test data that may still exist in DB

---

## Recording Test Results

### Verification File Template

```markdown
# Feature Area — Verification Log

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Status**      | TESTED / PARTIAL / NEEDS RETEST            |
| **Last Tested** | YYYY-MM-DD                                 |
| **Test Method** | Playwright + browser_snapshot + Convex CLI |
| **Tested By**   | Agent session ID                           |

## Workflows Tested

| ID  | Workflow                       | Result | Notes                        |
| --- | ------------------------------ | ------ | ---------------------------- |
| W1  | Description of what was tested | PASS   |                              |
| W2  | Description of what was tested | FAIL   | Error message or see BUG-NNN |

## DB Verifications

| Check            | Table      | Result    | Evidence          |
| ---------------- | ---------- | --------- | ----------------- |
| What was checked | table_name | PASS/FAIL | Actual data found |

## Known Issues

- [BUG-NNN](../bugs/BUG-NNN-slug.md) — Brief description

## Test Data Created

| Entity | Identifier        | State    | Notes              |
| ------ | ----------------- | -------- | ------------------ |
| Guard  | phone: 8888888888 | INACTIVE | Created during W10 |
```

### Required Sections

| Section           | Required      | Purpose                           |
| ----------------- | ------------- | --------------------------------- |
| Header metadata   | YES           | Status, date, method, session ID  |
| Workflows Tested  | YES           | Every workflow with PASS/FAIL     |
| DB Verifications  | If applicable | Evidence from `npx convex data`   |
| Known Issues      | If bugs found | Links to bug files                |
| Test Data Created | RECOMMENDED   | Helps future agents know DB state |

---

## Updating the Coverage Map

After testing, update `verification/README.md`:

```markdown
## Coverage Map

| Feature Area    | Status       | File                                     | Last Tested |
| --------------- | ------------ | ---------------------------------------- | ----------- |
| Admin Dashboard | TESTED       | [admin-dashboard.md](admin-dashboard.md) | 2026-02-17  |
| Admin — Guards  | NEEDS RETEST | [admin-guards.md](admin-guards.md)       | 2026-02-17  |
| Guard Login     | TESTED       | [guard-login.md](guard-login.md)         | 2026-02-17  |
| Tenant Browse   | NOT TESTED   | —                                        | —           |
```

### Status Transitions

```
NOT TESTED → TESTED      (all workflows run)
NOT TESTED → PARTIAL     (some workflows run)
TESTED     → NEEDS RETEST (code changed since last test)
PARTIAL    → TESTED      (remaining workflows run)
NEEDS RETEST → TESTED    (re-tested after code change)
```

### When to Update Status

| Event                          | Action                              |
| ------------------------------ | ----------------------------------- |
| Finished testing a feature     | Set TESTED, update Last Tested date |
| Only tested some workflows     | Set PARTIAL                         |
| Code changed in relevant files | Set NEEDS RETEST                    |
| Bug was fixed in feature area  | Set NEEDS RETEST                    |
| Re-tested after change         | Set TESTED with new date            |

---

## Workflow ID Conventions

Each workflow gets a unique ID within its verification file: `W1`, `W2`, ... `WN`.

### What Counts as One Workflow

| Scope                         | Example                                        |
| ----------------------------- | ---------------------------------------------- |
| One user action → one outcome | "Click Add Guard → dialog opens"               |
| One validation check          | "Submit empty form → validation errors"        |
| One DB verification           | "Confirm guard status INACTIVE in users table" |
| One state transition          | "Change status ACTIVE → INACTIVE"              |

### Workflow Description Best Practices

- Be specific: "Create guard with phone 8888888888" not "Create guard"
- Include expected outcome: "Edit name → toast 'Guard updated'" not "Edit guard"
- Reference DB checks: "**DB VERIFY**: users table shows status INACTIVE"

---

## Cross-References

### From Verification to Bugs

When a test fails and a bug is filed:

```markdown
## Known Issues

- [BUG-005](../bugs/BUG-005-guard-dashboard-crash.md) — Guard dashboard crashes on load
```

### From Bugs to Verification

Bug files should reference which test found them:

```markdown
Found during testing: [guard-portal.md](../verification/guard-portal.md) W11-W14
```

### Relationship to Other Skills

| Skill                | Relationship                                                   |
| -------------------- | -------------------------------------------------------------- |
| `verification-agent` | Runs tests → this skill records results                        |
| `bug-tracker`        | This skill finds failures → bug-tracker files them             |
| `doc-reconciler`     | After code fix → both verification/ and bugs/ may need updates |

---

## Quick Reference Commands

```bash
# Find untested features
grep "NOT TESTED" verification/README.md

# Find features needing retest
grep "NEEDS RETEST" verification/README.md

# Find all failures across all features
grep -rn "FAIL" verification/*.md

# Check if a specific feature was tested
grep "admin-guards" verification/README.md

# Find which session tested a feature
grep "Tested By" verification/admin-guards.md

# Count total workflows tested
grep -c "| W" verification/*.md
```

---

## Current Coverage Summary

As of skill creation, these features have been tested:

| Area                  | Status     | Open Bugs                                       |
| --------------------- | ---------- | ----------------------------------------------- |
| Admin Dashboard       | TESTED     | BUG-003 (roles empty)                           |
| Admin Societies       | TESTED     | None                                            |
| Admin Guards          | TESTED     | BUG-004 (seed guard not in list)                |
| Admin Roles           | TESTED     | None                                            |
| Admin Management      | TESTED     | None                                            |
| Admin Settings        | TESTED     | None                                            |
| Guard Login           | TESTED     | BUG-006 (created guard can't login after reset) |
| Guard Portal          | TESTED     | BUG-005 (dashboard crash — Critical)            |
| Guard Change Password | NOT TESTED | —                                               |

**Check `verification/README.md` for the live coverage map — this table may be stale.**
