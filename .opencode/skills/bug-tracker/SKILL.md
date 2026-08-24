---
name: bug-tracker
description: Track, file, look up, and manage bugs in the bugs/ directory — teaches agents the bug report format, severity/status definitions, lookup workflow, and update protocol so no bug is lost or re-investigated.
license: MIT
---

# Bug Tracker

Manage the `bugs/` directory. File new bugs, look up known bugs before debugging, update bug status after fixes.

**Different from `verification-agent`**: verification-agent runs tests and captures failures. This skill manages the **bug lifecycle** — filing, lookup, investigation, resolution.

## When to Use

- Found a bug during testing → file it
- About to debug something → check if it's already known
- Fixed a bug → update status to FIXED with fix details
- Triaging issues → check open bugs by severity
- Starting a new session → skim open bugs for context

---

## Bug Directory Structure

```
bugs/
├── README.md               # Bug index table + severity/status definitions
├── BUG-001-short-slug.md   # Individual bug reports
├── BUG-002-short-slug.md
└── ...
```

### File Naming Convention

`BUG-{NNN}-{short-slug}.md`

- `NNN`: Zero-padded sequential number (001, 002, ...)
- `short-slug`: 2-4 word kebab-case description
- Examples: `BUG-003-dashboard-roles-empty.md`, `BUG-005-guard-dashboard-crash.md`

### Getting the Next Bug ID

```bash
# Find the highest existing bug number
ls bugs/BUG-*.md | sort -t'-' -k2 -n | tail -1
# Increment by 1
```

---

## Lookup Workflow (MANDATORY Before Debugging)

**ALWAYS check bugs/ before spending time debugging.** A previous agent may have already investigated.

### Step 1: Check Index

Read `bugs/README.md` → scan the Bug Index table for matching area/title.

### Step 2: Search by Keyword

```bash
# Search bug files for relevant terms
grep -rn "guard login" bugs/
grep -rn "getMyProfile" bugs/
grep -rn "redirect" bugs/
```

### Step 3: Check Status

| Status            | What to Do                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| **OPEN**          | Bug is known. Read the full report for analysis and investigation hints. Don't re-investigate from scratch. |
| **INVESTIGATING** | Another agent is working on it. Coordinate or wait.                                                         |
| **FIXED**         | Bug was fixed. If you're seeing it again, it may be a regression — file a NEW bug referencing the old one.  |
| **WONTFIX**       | Intentional behavior. Don't try to fix it.                                                                  |

### Step 4: If Bug is Unknown

File a new bug report following the template below.

---

## Filing a New Bug

### Bug Report Template

```markdown
# BUG-NNN: Brief title

| Field        | Value                                                |
| ------------ | ---------------------------------------------------- |
| **Severity** | Critical / High / Medium / Low                       |
| **Status**   | OPEN                                                 |
| **Area**     | Feature area (e.g. Auth, Admin Guards, Guard Portal) |
| **Found**    | YYYY-MM-DD                                           |

## Description

What's wrong in 1-2 sentences. Be specific.

## Repro Steps

1. Navigate to [URL]
2. Click [element]
3. ...

## Expected

What should happen.

## Actual

What happens instead. Include exact error messages.

## Analysis

Possible causes (list 2-3 hypotheses with files to investigate).

**Files to investigate:**

- `path/to/file.ts` — reason to check
- `path/to/other.ts` — reason to check

## Root Cause

TBD — fill in after investigation.

## Fix

TBD — fill in after fix is implemented.
```

### Required Fields

| Field           | Required            | Notes                                                   |
| --------------- | ------------------- | ------------------------------------------------------- |
| Title           | YES                 | Brief, specific. "Guard login fails" not "Login broken" |
| Severity        | YES                 | See severity table below                                |
| Status          | YES                 | Always starts as OPEN                                   |
| Area            | YES                 | Feature area for grouping                               |
| Found date      | YES                 | When the bug was discovered                             |
| Description     | YES                 | 1-2 sentences                                           |
| Repro Steps     | YES                 | Numbered, specific steps any agent can follow           |
| Expected/Actual | YES                 | Clear contrast                                          |
| Analysis        | RECOMMENDED         | Saves the next agent investigation time                 |
| Root Cause      | After investigation | Fill in once understood                                 |
| Fix             | After fix           | File paths and description of changes                   |

### After Filing

1. Update `bugs/README.md` — add row to Bug Index table
2. If found during testing — add reference in the verification file: `[BUG-NNN](../bugs/BUG-NNN-slug.md)`

---

## Severity Definitions

| Level        | Meaning                                         | Examples                                                                           |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Critical** | Feature completely broken, blocks user workflow | Login always fails, page crashes on load, data loss                                |
| **High**     | Feature partially broken, workaround exists     | Feature works but password reset doesn't, wrong redirect but can navigate manually |
| **Medium**   | Incorrect behavior, doesn't block core workflow | Wrong badge color, missing data in non-critical field, filter shows extra results  |
| **Low**      | Cosmetic, UX polish, minor inconsistency        | Modal instead of toast, slight layout shift, placeholder text wrong                |

### Severity Selection Rules

- If user **cannot complete** the workflow → **Critical**
- If user **can complete with workaround** → **High**
- If behavior is **wrong but not blocking** → **Medium**
- If it's **cosmetic only** → **Low**

---

## Updating Bug Status

### When You Fix a Bug

1. Edit the bug file:
   - Set `**Status**` to `FIXED`
   - Add `**Fixed**` date
   - Add `**Fix File**` with file paths changed
   - Fill in `## Root Cause` section
   - Fill in `## Fix` section with what was changed

2. Update `bugs/README.md`:
   - Change status in Bug Index table to `**FIXED**`
   - Update Open Bug Summary counts

### When You Start Investigating

1. Set status to `INVESTIGATING`
2. Add notes to the `## Analysis` section as you learn things

### When You Determine It's Intentional

1. Set status to `WONTFIX`
2. Add explanation in `## Root Cause` — why this is expected behavior

---

## Cross-References

### From Verification Files

When a bug is found during testing, the verification file should reference it:

```markdown
## Known Issues

- [BUG-005](../bugs/BUG-005-guard-dashboard-crash.md) — Guard dashboard crashes on load
```

### From Bug Files to Verification

When a bug is found, note which test discovered it:

```markdown
## Found During

Verification of Guard Portal — see [guard-portal.md](../verification/guard-portal.md) W11-W14
```

### Relationship to verification-agent Skill

| `verification-agent`                 | `bug-tracker`                        |
| ------------------------------------ | ------------------------------------ |
| Runs tests, captures failures        | Records bugs from failures           |
| Writes VERIFY.md in tasks/           | Writes BUG-NNN.md in bugs/           |
| Focuses on pass/fail per scenario    | Focuses on root cause + fix tracking |
| Evidence capture (screenshots, logs) | Repro steps + analysis               |

---

## Quick Reference Commands

```bash
# List all open bugs
grep -l "OPEN" bugs/BUG-*.md

# List all critical bugs
grep -l "Critical" bugs/BUG-*.md

# Search bugs by area
grep -rn "Guard Portal" bugs/

# Count bugs by status
grep -c "FIXED\|OPEN\|INVESTIGATING" bugs/README.md
```
