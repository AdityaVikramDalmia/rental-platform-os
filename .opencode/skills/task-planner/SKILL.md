---
name: task-planner
description: Creates and executes Rental Platform OS implementation tasks — covers the Phase/Epic/Task hierarchy, epic file format, status tracking, dependency ordering, and the execution workflow for agents building the platform.
license: MIT
---

# Rental Platform OS Task Planner & Executor

Two modes: **Plan Mode** (create tasks) and **Execute Mode** (run tasks). Both use the same hierarchy and file format.

## Task System Overview

All tasks live in `tasks/`. See `tasks/README.md` for the full phase roadmap.

### Hierarchy

| Level | ID Format | What | File |
|-------|-----------|------|------|
| Phase | `P01` | Implementation priority group | `tasks/phase-XX-name/README.md` |
| Epic | `P01-E01` | Feature group, 3-8 tasks | `tasks/phase-XX-name/P01-E01-name.md` |
| Task | `P01-E01-T01` | Atomic executable unit | H2 section within epic file |

**IDs are stable and NEVER change.** Filenames can change. `depends_on` always uses IDs.

### Status

| Status | Meaning |
|--------|---------|
| `pending` | Not started |
| `in_progress` | Being worked on |
| `done` | All tasks completed and verified |
| `blocked` | Waiting on a dependency |

**Epic status rule**: All unchecked → `pending`. Any checked → `in_progress`. All checked + verified → `done`.

---

## Plan Mode: Creating Tasks

Use this when breaking down a phase into epics and tasks.

### Step 1: Create Phase Directory

```
tasks/phase-XX-name/
  README.md          # Phase overview
```

Phase README template:

```markdown
# Phase X: [Name] (PXX)

## Overview
[2-3 sentences: what this phase delivers]

## Dependencies
- PYY must be done before starting this phase

## Epics

| ID | Title | Status | Depends On |
|----|-------|--------|------------|
| PXX-E01 | [Name] | pending | [] |
| PXX-E02 | [Name] | pending | [PXX-E01] |

## Completion Criteria
[What "phase done" looks like — e.g., "Admin can create societies and buildings"]
```

### Step 2: Create Epic Files

One file per epic. Tasks are H2 sections within.

#### Epic File Template

````markdown
---
id: PXX-EYY
title: [Epic Title]
phase: X
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules"]
updated_at: YYYY-MM-DD
---

# PXX-EYY: [Epic Title]

## Overview
[1-2 sentences: what this epic delivers end-to-end]

## Prerequisites
- **Read first**: [PXX-EYY-1 Completion Summary](PXX-EYY-1-name.md#completion-summary) — key context from prior epic.
- [Any other setup the agent needs before starting]

## Task Queue
- [ ] PXX-EYY-T01: [Short task title]
- [ ] PXX-EYY-T02: [Short task title]
- [ ] PXX-EYY-T03: [Short task title]

---

## T01: [Task Title]

### Objective
[1-2 sentences. What "done" looks like.]

### Required Reading
- `notes/[file]` — [Section Name] (location hint)
- `notes/features/[file]` — Full file

### Key Rules
1. [Rule extracted from docs — not just "follow conventions"]
2. [Rule extracted from docs]

### Deliverables
- [ ] `path/to/file.ts` — [what it contains]
- [ ] `path/to/file.tsx` — [what it does]

### Acceptance Criteria
1. [Testable condition]
2. [Testable condition]

### Verification
```bash
npx tsc --noEmit
```
[What to check: lsp_diagnostics clean, build passes, specific behavior works]

### Out of Scope
- [What this task does NOT include]

---

## T02: [Next Task Title]
...

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: YYYY-MM-DD

### What Was Built
- [Bullet list of what was actually delivered — files, features, configurations]

### Key File Locations
| File | What |
|------|------|
| `path/to/file.ts` | [Brief description of its purpose] |

### Deviations from Spec
- [Anything that differs from the original task spec or docs — count mismatches, pattern changes, etc.]
- If none: "None — implemented exactly as specified."

### Gotchas for Next Epic
- [Hard-won knowledge that prevents the next agent from repeating mistakes]
- [Environment requirements, file location confusion, things that aren't obvious]
````

### Writing Rules

1. **3-8 tasks per epic.** More than 8? Split into two epics.
2. **Tasks are ordered.** Later tasks may depend on earlier ones within the same epic. Always top-to-bottom.
3. **Extract rules, don't just point.** Copy the 3-8 specific rules from docs into each task's Key Rules. Agents skip files that aren't in front of them.
4. **Reference docs by section header**, not line number. Headers are stable; line numbers break.
5. **Always include `notes/13-constants-reference.md`** for enum values — agents need it for every feature.
6. **Always include `notes/10-convex-schema.md`** for exact field validators.
7. **Verification is mandatory.** Every task must have a Verification section with concrete commands or checks.
8. **Set `skills` in frontmatter** — list ALL skills an executing agent should load.
9. **Set `depends_on` with stable IDs** — e.g., `["P01-E01", "P02-E01"]`. Never use filenames.
10. **Add Prerequisites section** to epics that have dependencies. Reference the prior epic's Completion Summary so the executing agent reads institutional knowledge from the previous agent.
11. **Completion Summary is mandatory.** Every completed epic MUST have a Completion Summary. This is how knowledge flows between agent sessions.

### Sizing Guidelines

| Size | Tasks | Example |
|------|-------|---------|
| Small epic | 3-4 | Single CRUD module (society create/read/update) |
| Medium epic | 5-6 | Feature with backend + frontend (lead submission mutation + form) |
| Large epic | 7-8 | Complex feature (visit lifecycle: schedule + assign + execute + board UI) |

**If a task has more than 4 deliverable files, consider splitting it.**

---

## Execute Mode: Running Tasks

Use this when an agent is implementing a task.

### Step 1: Find Your Task

```
1. Read tasks/README.md → identify current phase
2. Read phase-XX/README.md → find next pending/in_progress epic
3. Open the epic file
4. Find the first unchecked task in the Task Queue
```

### Step 2: Verify Dependencies

Check the epic's `depends_on` in frontmatter. Every listed ID must be `done`. If not → the epic is `blocked`.

### Step 3: Load Skills

Load every skill listed in the epic's `skills` frontmatter:

```typescript
task(
  category="...",
  load_skills=["rental-platform-os-arch", "rental-platform-os-rules"],  // from epic frontmatter
  prompt="Execute task P01-E01-T01: Create auth.config.ts. Read the epic file at tasks/phase-01-auth/P01-E01-workos-config.md for full spec.",
  run_in_background=false
)
```

### Step 4: Execute the Task

For each unchecked task (top-to-bottom):

1. **Read** the Required Reading listed in the task
2. **Follow** the Key Rules (these are non-negotiable)
3. **Implement** every Deliverable (check off as you go)
4. **Verify**:
   - Run the Verification commands
   - Run `lsp_diagnostics` on all changed files
   - Check all Acceptance Criteria are met
5. **Check the checkbox** in the Task Queue:
   ```
   - [x] PXX-EYY-T01: Create auth.config.ts
   ```

### Step 5: Complete the Epic

When ALL task checkboxes are checked:

1. Update the epic frontmatter:
   ```yaml
   status: done
   updated_at: YYYY-MM-DD
   ```
2. **Write the Completion Summary** at the bottom of the epic file (after the last task). Include:
   - **What Was Built**: Actual deliverables (files, features, configs)
   - **Key File Locations**: Table of important files created/modified with brief descriptions
   - **Deviations from Spec**: Anything that differs from the task spec or docs (count mismatches, pattern changes, workarounds). Write "None" if exact match.
   - **Gotchas for Next Epic**: Hard-won knowledge — env requirements, non-obvious file locations, things that tripped you up
3. Update the phase README epic table status
4. **Update the next epic's Prerequisites** section to reference this completion summary:
   ```markdown
   ## Prerequisites
   - **Read first**: [PXX-EYY Completion Summary](PXX-EYY-name.md#completion-summary)
   ```
5. Check if this unblocks any downstream epics

### Completion Evidence (task NOT done without these)

| Action | Required Evidence |
|--------|-------------------|
| File created/edited | `lsp_diagnostics` clean |
| Convex function | `npx tsc --noEmit` passes |
| UI component | Renders without errors |
| Full epic | All checkboxes checked + frontmatter updated + **Completion Summary written** + next epic Prerequisites updated |

**No evidence = not done. Do NOT check a box without running verification. Do NOT close an epic without writing the Completion Summary.**

---

## Example: Auth Config Epic

````markdown
---
id: P01-E01
title: WorkOS Configuration
phase: 1
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules"]
updated_at: 2026-02-16
---

# P01-E01: WorkOS Configuration

## Overview
Set up WorkOS JWT validation in Convex so both guard (email+password) and admin (Google SSO) authentication tokens are accepted.

## Task Queue
- [ ] P01-E01-T01: Create auth.config.ts
- [ ] P01-E01-T02: Create ConvexClientProvider with AuthKit
- [ ] P01-E01-T03: Set up environment variables

---

## T01: Create auth.config.ts

### Objective
Configure Convex to validate WorkOS JWTs from both SSO (admin) and User Management (guard) providers.

### Required Reading
- `notes/01-tech-stack.md` — "Authentication Architecture" section (auth config code pattern)
- `notes/11-convex-architecture.md` — top of file (functions.ts setup context)

### Key Rules
1. Two JWT providers: SSO issuer and User Management issuer
2. Both use RS256 algorithm and same JWKS endpoint
3. WORKOS_CLIENT_ID from env var — never hardcode

### Deliverables
- [ ] `convex/auth.config.ts` — Two customJwt providers configured

### Acceptance Criteria
1. File exports a default config object with exactly 2 providers
2. Both providers reference WORKOS_CLIENT_ID from env
3. TypeScript compiles clean

### Verification
```bash
npx tsc --noEmit
```

### Out of Scope
- Auth helpers (separate epic)
- Login UI (separate epic)
````

---

## Tips

1. **Don't create all phases upfront.** Create detailed tasks for 3-4 phases at a time. Implement, then plan the next batch.
2. **Phase roadmap in `tasks/README.md` is the boundary reference.** If you're unsure what's in scope for a phase, check there first.
3. **Cross-reference docs, don't duplicate them.** Tasks point to docs. Docs are the source of truth.
4. **When in doubt about a convention, load `rental-platform-os-rules` skill.** It has every hard rule.
5. **When in doubt about a pattern, load `rental-platform-os-arch` skill.** It has every code pattern.
