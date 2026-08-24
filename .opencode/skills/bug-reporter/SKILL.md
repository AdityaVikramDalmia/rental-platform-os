---
name: bug-reporter
description: Two-way bug workflow — report bugs via branch+PR from any checkout state, and import/validate/merge incoming bug PRs into the master bug list
license: MIT
metadata:
  version: "1.0"
  author: "Rental Platform OS Team"
  audience: "External contributors and project maintainers"
---

# Bug Reporter

Two-mode skill for the Rental Platform OS bug lifecycle:

| Mode       | Who Uses It             | What It Does                                                     |
| ---------- | ----------------------- | ---------------------------------------------------------------- |
| **Report** | Co-developer (reporter) | File a bug as a formatted `bugs/` entry on a new branch → PR     |
| **Import** | Maintainer (on main)    | Parse an incoming bug PR, validate, fix conflicts, merge to main |

**This skill is self-contained.** You do NOT need `bug-tracker` or any other skill loaded. Everything you need is in this file.

---

# MODE 1: REPORT A BUG

> Use this when you found a bug and need to report it to the project maintainer.

## Prerequisites

```bash
gh auth status       # Must be authenticated
git remote -v        # Must have 'origin'
```

If `gh auth status` fails → `gh auth login` first. Do NOT proceed without it.

## Report Workflow (Follow Every Step)

### Step 1: Save Current State

```bash
# Only if you have uncommitted work
git stash --include-untracked
```

Skip if `git status` shows a clean tree.

### Step 2: Fetch Latest Remote

Your local `main` may be weeks old. Always fetch:

```bash
git fetch origin main
```

### Step 3: Determine Next Bug ID

Read the `bugs/` directory from **remote main** (not your stale local files):

```bash
git show origin/main:bugs/ | grep '^BUG-' | sort -t'-' -k2 -n | tail -1
```

Extract the number, add 1, zero-pad to 3 digits. Example: `BUG-019-...` → your ID is `020`.

If the command fails (no `bugs/` on remote) → start at `001`.

### Step 4: Create Branch From Remote Main

```bash
git checkout -b bug/BUG-NNN-short-slug origin/main
```

**Branch naming**: `bug/BUG-{NNN}-{2-4-word-kebab-slug}`

Examples: `bug/BUG-020-guard-login-500`, `bug/BUG-021-shift-overlap-crash`

### Step 5: Write the Bug Report File

Create `bugs/BUG-NNN-short-slug.md` using this **exact template**:

```markdown
# BUG-NNN: Brief descriptive title

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| **Severity** | Critical / High / Medium / Low         |
| **Status**   | OPEN                                   |
| **Area**     | Feature area (e.g. Auth, Admin Guards) |
| **Found**    | YYYY-MM-DD                             |

## Description

What's wrong in 1-2 sentences. Be specific — name the page, component, or API endpoint.

## Repro Steps

1. Navigate to [exact URL]
2. Do [exact action]
3. Observe [exact result]

## Expected

What should happen instead.

## Actual

What happens instead. Include exact error messages, status codes, or console output.

## Analysis

Your best guess at the root cause. List 2-3 hypotheses with specific files to investigate.

**Files to investigate:**

- `path/to/file.ts` — why this file is suspicious
- `path/to/other.ts` — why this file is suspicious
```

**Do NOT include** `Fixed`, `Fix Commit`, `Root Cause`, or `Fix` sections. Those are for the maintainer after they fix it.

#### Required Fields Checklist

| Field       | Required | Notes                                                         |
| ----------- | -------- | ------------------------------------------------------------- |
| Title       | YES      | Brief, specific. "Guard login returns 500" not "Login broken" |
| Severity    | YES      | See Severity Guide at bottom of this skill. Pick ONE.         |
| Status      | YES      | **Always `OPEN`**. You are reporting, not fixing.             |
| Area        | YES      | Match existing areas (see Known Areas at bottom)              |
| Found       | YES      | Today's date in YYYY-MM-DD                                    |
| Description | YES      | 1-2 sentences max                                             |
| Repro Steps | YES      | Numbered, specific. Another dev must be able to follow.       |
| Expected    | YES      | What correct behavior looks like                              |
| Actual      | YES      | What happens — include error messages verbatim                |
| Analysis    | YES      | Even a rough guess saves the fixer time                       |

### Step 6: Update bugs/README.md

Add a row to the **Bug Index** table at the end (before the blank line after the table):

```
| BUG-NNN | Title from your report | Severity | **OPEN** | Area | [BUG-NNN](BUG-NNN-short-slug.md) |
```

Update the **Open Bug Summary** line. Example: if it says "All 19 bugs fixed", change to:

```
**1 open bug.** 19 previously fixed.
```

### Step 7: Commit

```bash
git add bugs/BUG-NNN-short-slug.md bugs/README.md
git commit -m "bug: BUG-NNN — Brief title"
```

Only `bugs/` files. Nothing else.

### Step 8: Push + Create PR

```bash
git push -u origin bug/BUG-NNN-short-slug
```

```bash
gh pr create \
  --title "BUG-NNN: Brief title" \
  --body "$(cat <<'EOF'
## Bug Report

| Field | Value |
|-------|-------|
| **Severity** | THE_SEVERITY |
| **Area** | THE_AREA |

### Description
1-2 sentence summary.

### Repro Steps
1. ...
2. ...

### Expected vs Actual
- **Expected**: ...
- **Actual**: ...

---
*Auto-filed via bug-reporter skill. Full report in `bugs/BUG-NNN-short-slug.md`.*
EOF
)" \
  --base main
```

Fill in the real values. The PR body is a summary — full details are in the bug file.

### Step 9: Restore Previous State

```bash
git checkout -
git stash pop    # Only if you stashed in Step 1
```

### Step 10: Report the PR URL

Print the PR URL. You're done.

### Multiple Bugs?

One bug = one PR = one branch. Never batch. For each additional bug:

1. `git fetch origin main` again (in case something merged)
2. Repeat from Step 3 with a fresh branch off `origin/main`

---

# MODE 2: IMPORT A BUG FROM PR

> Use this when you're the maintainer on `main` and a co-developer has submitted a bug report PR.

You will be given a PR number or URL. Your job: parse it, validate it, fix any issues, and merge it cleanly into the master bug list.

## Import Workflow

### Step 1: Fetch PR Metadata

```bash
# Get PR details
gh pr view PR_NUMBER --json number,title,body,headRefName,files,state

# Get the actual diff to see what was changed
gh pr diff PR_NUMBER
```

Read both outputs carefully. You need:

- The PR title (should match `BUG-NNN: ...`)
- The branch name (should match `bug/BUG-NNN-...`)
- The files changed (should ONLY be `bugs/BUG-NNN-slug.md` and `bugs/README.md`)
- The actual bug report content from the diff

### Step 2: Validate — Scope Check

**The PR must ONLY touch files inside `bugs/`.** Run this check:

```bash
gh pr diff PR_NUMBER --name-only
```

**REJECT if** any file outside `bugs/` is modified. Comment and close:

```bash
gh pr comment PR_NUMBER --body "Rejecting: PR modifies files outside \`bugs/\`. Bug report PRs must only touch \`bugs/BUG-NNN-slug.md\` and \`bugs/README.md\`. Please re-submit with only bug report files."
gh pr close PR_NUMBER
```

### Step 3: Validate — Bug File Format

Extract the bug file content from the diff. Verify ALL of these:

| Check                      | Valid Values                                | Action if Invalid       |
| -------------------------- | ------------------------------------------- | ----------------------- |
| File name matches pattern  | `BUG-NNN-kebab-slug.md`                     | Comment with fix needed |
| Title line exists          | `# BUG-NNN: ...` (non-empty title)          | Comment with fix needed |
| Severity field present     | One of: `Critical`, `High`, `Medium`, `Low` | Comment with fix needed |
| Status field present       | Must be `OPEN`                              | Comment with fix needed |
| Area field present         | Non-empty string                            | Comment with fix needed |
| Found date present         | `YYYY-MM-DD` format                         | Comment with fix needed |
| Description section exists | Non-empty                                   | Comment with fix needed |
| Repro Steps section exists | Has at least 1 numbered step                | Comment with fix needed |
| Expected section exists    | Non-empty                                   | Comment with fix needed |
| Actual section exists      | Non-empty                                   | Comment with fix needed |
| Analysis section exists    | Non-empty (at minimum a rough hypothesis)   | Comment with fix needed |

If ANY check fails, comment on the PR with **specific** feedback:

```bash
gh pr comment PR_NUMBER --body "$(cat <<'EOF'
## Bug Report Validation

The following issues need to be fixed before this can be merged:

- [ ] Issue 1: description
- [ ] Issue 2: description

Please push fixes to your branch and I'll re-review.
EOF
)"
```

**Do NOT close** the PR for format issues — let them fix and re-push.

### Step 4: Validate — Duplicate Check

Check if this bug is already known. Search existing bugs on your current `main`:

```bash
# Search by keywords from the title and description
grep -rli "KEYWORD_FROM_TITLE" bugs/BUG-*.md
grep -rli "KEYWORD_FROM_DESCRIPTION" bugs/BUG-*.md
```

If you find a likely duplicate:

```bash
gh pr comment PR_NUMBER --body "This appears to be a duplicate of [BUG-XXX](bugs/BUG-XXX-slug.md). If this is a different issue, please clarify in a comment and I'll re-review. Closing for now."
gh pr close PR_NUMBER
```

Use judgment — same area + similar description = likely duplicate. Different symptoms of the same root cause = still a duplicate.

### Step 5: Check for Bug ID Conflicts

The reporter computed their bug ID from `origin/main` at PR creation time. But other bugs may have been merged to main since then.

Check if their bug ID already exists on main:

```bash
ls bugs/ | grep "^BUG-NNN"
```

**If NO conflict** → proceed to Step 6.

**If ID ALREADY EXISTS on main** → the reporter's ID is stale. You need to renumber:

```bash
# 1. Find the correct next ID
ls bugs/BUG-*.md | sort -t'-' -k2 -n | tail -1
# Extract number, add 1 → NEW_NNN

# 2. Check out the reporter's branch locally
gh pr checkout PR_NUMBER

# 3. Rename the bug file
mv bugs/BUG-OLD_NNN-slug.md bugs/BUG-NEW_NNN-slug.md

# 4. Update the bug ID inside the file
#    - Title line: # BUG-OLD_NNN → # BUG-NEW_NNN
#    (use your Edit tool for this)

# 5. Update the README.md table row
#    - Change BUG-OLD_NNN to BUG-NEW_NNN in both the ID column and the File link
#    (use your Edit tool for this)

# 6. Commit and push back to the PR branch
git add bugs/
git commit -m "bug: renumber BUG-OLD_NNN → BUG-NEW_NNN (ID conflict)"
git push
```

After renumbering, the PR now has the correct ID. Continue to Step 6.

### Step 6: Merge the PR

If all validations pass (or you fixed the ID conflict):

```bash
gh pr merge PR_NUMBER --squash --delete-branch --subject "bug: BUG-NNN — Title"
```

Use `--squash` to keep the main history clean — one commit per bug report.

### Step 7: Verify the Merge

```bash
# Pull the merge
git pull origin main

# Confirm the file exists
ls bugs/BUG-NNN-*

# Confirm README was updated
grep "BUG-NNN" bugs/README.md
```

### Step 8: Report Result

Tell the user:

- Bug ID that was imported
- PR number that was merged
- Whether any renumbering was needed
- Link to the bug file

---

## Import Decision Tree (Quick Reference)

```
PR received
  │
  ├─ Files outside bugs/? ──── YES → REJECT (comment + close)
  │
  ├─ Format valid? ─────────── NO  → COMMENT with checklist (keep PR open)
  │
  ├─ Duplicate? ────────────── YES → COMMENT + CLOSE (cite existing bug)
  │
  ├─ Bug ID conflicts? ─────── YES → RENUMBER on their branch, push back
  │
  └─ All clear ─────────────── MERGE (squash + delete branch)
```

---

# SHARED REFERENCE

## Severity Guide

| Level        | When to Use                               | Examples                                                             |
| ------------ | ----------------------------------------- | -------------------------------------------------------------------- |
| **Critical** | User CANNOT complete the workflow at all  | Login always fails, page crashes on load, data loss                  |
| **High**     | User CAN complete but with a workaround   | Feature works but reset doesn't, wrong redirect but can nav manually |
| **Medium**   | Wrong behavior but doesn't block anything | Wrong data in non-critical field, filter shows extra results         |
| **Low**      | Cosmetic or minor UX issue                | Wrong spacing, placeholder text wrong, modal instead of toast        |

**Quick decision:**

- "Can the user do their job?" → No = **Critical**
- "Can they work around it?" → Yes = **High**, No = **Critical**
- "Wrong but ignorable?" → **Medium**
- "Only a designer would notice?" → **Low**

## Known Feature Areas

Match existing areas when possible. Add a new one only if none fit.

| Area             | Covers                                             |
| ---------------- | -------------------------------------------------- |
| Auth             | Login, logout, signup, password, WorkOS, redirects |
| Admin Dashboard  | Admin home page, stats, widgets                    |
| Admin Guards     | Guard CRUD, guard list, guard detail               |
| Admin Lead Queue | Lead table, filters, tabs, status actions          |
| Guard Portal     | Guard dashboard, guard-facing pages                |
| Shift Mgmt       | Shift scheduling, recurring shifts, overrides      |
| Lead Submission  | Guard lead form, society/building selectors        |
| Tenant Portal    | Tenant-facing pages, inquiries                     |
| Public Pages     | Homepage, listings, contact, how-it-works          |
| Society Registry | Society and building CRUD                          |

## Bug Report Template (Copy-Paste Ready)

```markdown
# BUG-NNN: Title

| Field        | Value    |
| ------------ | -------- |
| **Severity** | SEVERITY |
| **Status**   | OPEN     |
| **Area**     | AREA     |
| **Found**    | DATE     |

## Description

DESCRIPTION

## Repro Steps

1. STEP

## Expected

EXPECTED

## Actual

ACTUAL

## Analysis

ANALYSIS

**Files to investigate:**

- `file` — reason
```

## Report Mode — Cheat Sheet

```bash
git stash --include-untracked
git fetch origin main
git show origin/main:bugs/ | grep '^BUG-' | sort -t'-' -k2 -n | tail -1
git checkout -b bug/BUG-NNN-slug origin/main
# ... write bugs/BUG-NNN-slug.md ...
# ... update bugs/README.md ...
git add bugs/BUG-NNN-slug.md bugs/README.md
git commit -m "bug: BUG-NNN — Title"
git push -u origin bug/BUG-NNN-slug
gh pr create --title "BUG-NNN: Title" --body "..." --base main
git checkout -
git stash pop
```

## Import Mode — Cheat Sheet

```bash
gh pr view NNN --json number,title,headRefName,files,state
gh pr diff NNN
gh pr diff NNN --name-only          # scope check
grep -rli "keyword" bugs/BUG-*.md   # duplicate check
ls bugs/ | grep "^BUG-NNN"          # ID conflict check
gh pr merge NNN --squash --delete-branch --subject "bug: BUG-NNN — Title"
git pull origin main
```
