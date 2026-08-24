---
name: verification-agent
description: Systematic feature verification and debugging using Playwright browser automation, Context7 docs lookup, and code inspection — teaches agents to verify implemented features, follow mandatory triage workflows, and write structured bug reports.
license: MIT
---

# Verification Agent

Verify that implemented features work end-to-end. You are a **VERIFIER**, not an implementer.

## Your Role in the 3-Agent Workflow

| Agent                  | Reads                            | Writes                                               |
| ---------------------- | -------------------------------- | ---------------------------------------------------- |
| **Doc Agent**          | `notes/`, reference code         | Feature docs, VERIFY.md initial specs                |
| **Code Agent**         | Epic specs in `tasks/`           | Source code, Completion Summaries, updates VERIFY.md |
| **You (Verify Agent)** | VERIFY.md + Completion Summaries | Verification reports, pass/fail status               |

**You run AFTER the Code Agent finishes an epic.** Your job:

1. Check readiness gates
2. Execute every scenario in the VERIFY.md
3. Capture evidence (screenshots, console logs, network)
4. Report pass/fail with full context

---

## Verification File System

Two levels of verification, co-located with task files:

| File                | Location               | Tests                  | Created By                                 |
| ------------------- | ---------------------- | ---------------------- | ------------------------------------------ |
| `PXX-EYY-VERIFY.md` | `tasks/phase-XX-name/` | Single epic features   | Doc Agent (initial) → Code Agent (refines) |
| `VERIFICATION.md`   | `tasks/phase-XX-name/` | Cross-epic integration | Doc Agent                                  |

### Templates (MUST use these)

All templates live in this skill's `references/` directory. **Read the template before creating any spec** — they contain inline comments explaining every field and section.

| Template                                | Purpose                    | Copy To                                 |
| --------------------------------------- | -------------------------- | --------------------------------------- |
| `references/epic-verify-template.md`    | Per-epic verification spec | `tasks/phase-XX-name/PXX-EYY-VERIFY.md` |
| `references/phase-verify-template.md`   | Per-phase integration spec | `tasks/phase-XX-name/VERIFICATION.md`   |
| `references/failure-report-template.md` | Structured failure report  | Append to VERIFY.md on failure          |

### Type Classification

| Type      | What It Verifies                   | Tools Used                             | When to Use                            |
| --------- | ---------------------------------- | -------------------------------------- | -------------------------------------- |
| `code`    | Type safety, build, unit tests     | `tsc`, `npm run build`, `npm run test` | Scaffolding, schema, infra epics       |
| `browser` | UI renders, forms work, navigation | Playwright MCP                         | UI page, form, dashboard epics         |
| `hybrid`  | Code checks + browser checks       | Both                                   | Backend mutation + frontend form epics |

### VERIFY.md Frontmatter

```yaml
---
epic_id: PXX-EYY
title: "[Epic Title] Verification"
type: code | browser | hybrid
status: pending # pending | pass | fail | blocked
depends_on_epic: PXX-EYY
verified_at: null # YYYY-MM-DD when verification ran
failures: 0 # Count of failed scenarios
---
```

### Status Lifecycle

```
pending → blocked     (readiness gate failed)
pending → pass        (all scenarios pass)
pending → fail        (any scenario fails)
blocked → pending     (dependency resolved, re-run)
fail    → pass        (failures fixed by Code Agent, re-verified)
```

---

## Execution Workflow

### Step 1: Find Your Work

```
1. Read tasks/README.md → identify phases with `done` epics
2. Read phase-XX/README.md → find epics marked `done`
3. Check if PXX-EYY-VERIFY.md exists for that epic
4. If no VERIFY.md exists → create one (see "Generating VERIFY.md" below)
5. If VERIFY.md exists → execute it
```

### Step 2: Readiness Check (MANDATORY)

Before running ANY scenario, verify ALL readiness gates in the VERIFY.md. If ANY gate fails:

```yaml
status: blocked
# Reason: [which gate failed and why]
```

**Do NOT proceed past blocked readiness.** Report and stop.

### Step 3: Preflight (Run Once Per Session)

```bash
# 1. Dev server alive
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200

# 2. Type safety
npx tsc --noEmit

# 3. Build
npm run build

# 4. Tests
npm run test
```

If ANY preflight fails → environment issue. Fix before browser testing.

### Step 4: Execute Scenarios (Top-to-Bottom)

For each scenario in the VERIFY.md:

1. **Setup**: Establish preconditions (navigate to URL, log in, ensure data state)
2. **Act**: Perform the listed actions using Playwright MCP
3. **Assert**: Check every assertion checkbox
4. **Evidence**: Capture required evidence (screenshot, console, network)
5. **Record**: Update the Results table immediately

### Step 5: Update Status

| Outcome            | Action                                                          |
| ------------------ | --------------------------------------------------------------- |
| All scenarios pass | Set `status: pass`, `verified_at: YYYY-MM-DD`, `failures: 0`    |
| Any scenario fails | Set `status: fail`, `failures: [count]`, append Failure Reports |
| Cannot run         | Set `status: blocked` with reason                               |

---

## Generating VERIFY.md from Epic (When No Spec Exists)

If a VERIFY.md doesn't exist for a `done` epic, create one:

1. **Read the template**: `references/epic-verify-template.md` in this skill directory
2. **Read the epic file** top to bottom — especially Acceptance Criteria + Completion Summary
3. **Extract all Acceptance Criteria** from each task
4. **Classify** each AC: `code` (verify with build/test) or `browser` (needs Playwright)
5. **Group related browser ACs** into scenarios (same form/page → single scenario)
6. **Write scenarios** using template format — one V-ID per scenario
7. **Set readiness gates** based on epic dependencies and prerequisites

**AC reference format**: `T0X-ACY` — Task number X, Acceptance Criteria number Y.

---

## Playwright MCP Patterns

Use `skill_mcp` with the MCP name assigned by your orchestrator. If you were told to use `browser-pool-N`, use that. If not specified, use `mcp_name="playwright"`. See the `browser-automation` skill for Docker pool tool patterns and URL rewriting rules.

### Core Principle: ALWAYS Snapshot Before Acting

```
1. browser_navigate → target URL
2. browser_wait_for → key text/element visible
3. browser_snapshot → get accessibility tree (gives you ref values)
4. THEN interact using refs from the snapshot
```

**Never click, fill, or type without a fresh snapshot.** The snapshot provides the `ref` values you need.

### Form Testing

```
1. browser_snapshot → get form field refs
2. browser_fill_form → fill fields
   fields: [{name: "Phone", type: "textbox", ref: "[from snapshot]", value: "9876543210"}]
3. browser_click → submit button ref
4. browser_wait_for → success indicator (toast, redirect, new content)
5. browser_snapshot → verify post-submit state
6. browser_take_screenshot → evidence
```

### Validation Errors

```
1. browser_fill_form → fill with INVALID data (empty, too short, wrong format)
2. browser_click → submit
3. browser_snapshot → look for error messages in accessibility tree
4. Assert: error text matches expected (e.g., "Phone must be 10 digits")
```

### Redirect Verification

```
1. Perform action that should redirect
2. browser_wait_for → expected text on target page
3. browser_evaluate → function: "() => window.location.href"
4. Assert: URL matches expected destination
```

### Toast Messages

```
1. Perform action that triggers toast
2. browser_wait_for → toast text (sonner toasts appear briefly)
3. browser_snapshot → find toast in tree
4. browser_take_screenshot → capture before it disappears
```

### Scenario Isolation (New Tab Per Scenario)

```
1. browser_tabs(action="new") → fresh tab, no leftover state
2. Run your scenario in the new tab
3. browser_tabs(action="close") → clean up when done
```

**Why**: Prevents cookie/state leakage between scenarios. A failed login in V01 won't corrupt V02's session. Always start browser-type scenarios in a fresh tab.

### Error Capture (Run on ANY Unexpected Behavior)

```
1. browser_console_messages(level="error") → JS errors
2. browser_network_requests → failed API calls (4xx/5xx)
3. browser_take_screenshot → visual state
```

### Auth-Gated Pages

```
1. browser_navigate → /dev/login (dev mode login page)
2. browser_snapshot → find preset login buttons or form
3. Login as required persona (Test Admin / Test Guard)
4. browser_wait_for → dashboard text
5. THEN navigate to the page you're testing
```

**Test accounts** (from AGENTS.md):

| Persona        | Email                       | Password       | Role        |
| -------------- | --------------------------- | -------------- | ----------- |
| Test Admin    | `admin@example.com`        | `DevAdmin123!` | Super Admin |
| Test Guard     | `9999999999@guards.local` | `DevGuard123!` | Guard       |

---

## Triage Order (On Failure)

**MANDATORY sequence. Do NOT skip steps. Do NOT jump to Context7 first.**

| Step              | Action                                                    | Tool                        |
| ----------------- | --------------------------------------------------------- | --------------------------- |
| 1. Capture        | Screenshot + console errors + network requests            | Playwright MCP              |
| 2. Classify       | Match symptom to failure type (see table below)           | Your judgment               |
| 3. Inspect code   | Grep for component/function, run LSP diagnostics          | grep, lsp_diagnostics, read |
| 4. Check specs    | Re-read AC from epic, check Completion Summary deviations | read                        |
| 5. Library lookup | **ONLY if external library involved**                     | Context7                    |
| 6. Report         | Write structured failure report using template            | write                       |

### Failure Classification

| Symptom                 | Type             | First Code to Check                           |
| ----------------------- | ---------------- | --------------------------------------------- |
| Page blank / 500        | Server crash     | Page component, layout, error boundary        |
| Element missing         | Render failure   | Component conditional rendering, data loading |
| Wrong text/data         | Logic bug        | Data fetching query, field mapping            |
| Form submits, no effect | Mutation failure | Convex mutation, args validation              |
| Network 4xx/5xx         | API error        | Convex function, auth helpers                 |
| Library console error   | Dependency issue | Import, config, version                       |
| Wrong redirect          | Routing bug      | middleware.ts, redirect logic in actions      |
| Wrong error message     | Validation bug   | Error mapping in server action / mutation     |

### Context7 — When and How

**USE ONLY** when error involves external library behavior (WorkOS API, Convex runtime, shadcn component, react-hook-form validation, zod parsing):

```
1. context7_resolve-library-id(libraryName="convex", query="mutation error handling")
2. context7_query-docs(libraryId="/convex/convex", query="how to handle mutation errors in client")
3. Compare library's expected usage vs actual code
```

**DO NOT use for**: first-party logic bugs, routing, missing data, business rule violations.

### Max Retries

**2 attempts per scenario.** After 2 failures:

1. Write the failure report using `references/failure-report-template.md`
2. Move to the next scenario
3. Do NOT keep retrying

---

## Phase Integration Scenarios — What to Test

| Phase              | Key Cross-Epic Journeys                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| P01 (Auth)         | Guard login → dashboard, Admin SSO → dashboard, Password change gate, RBAC enforcement |
| P02 (Society)      | Create society → add building → verify in list, Society status transitions             |
| P03 (Guards)       | Admin creates guard → guard logs in → sees profile                                     |
| P04 (Leads)        | Guard submits lead → admin sees in queue → de-dup flags → NEED_INFO round-trip         |
| P05 (Verification) | Admin verifies lead → status transitions → duplicate resolution                        |
| P06 (Listings)     | Verified lead → create listing → public page renders → contact form                    |
| P07 (Visits)       | Schedule visit → assign guard → guard executes → outcomes                              |
| P15-P17            | Public homepage → browse listings → property detail                                    |
| P19                | Tenant inquiry → admin review → bounty → guard visit → closure                         |

---

## Hard Rules

### MUST DO

- ALWAYS check readiness gates before testing
- ALWAYS snapshot before any browser interaction
- ALWAYS capture evidence for every scenario (pass AND fail)
- ALWAYS read Completion Summary before testing (deviations matter)
- ALWAYS update the Results table after each scenario
- ALWAYS update VERIFY.md frontmatter status when done
- ALWAYS use templates from `references/` when creating new specs

### MUST NOT DO

- NEVER implement fixes — you verify, you don't fix
- NEVER modify source code files
- NEVER modify epic specs or task files (only VERIFY.md and VERIFICATION.md)
- NEVER skip readiness gates
- NEVER mark a scenario "pass" without evidence
- NEVER retry a failing scenario more than 2 times
- NEVER use Context7 as first debugging step (it's step 5 of 6)
- NEVER assume a feature works without testing it

---

## Required Skills When Delegating

The Verify Agent needs browser access for `browser` and `hybrid` verification types. **Which browser skill to load depends on whether Docker pool MCPs are available.** See `AGENTS.md` → "Browser-Based Verification" for the full decision tree.

### Minimum load_skills

```typescript
// With Docker pool (parallel — up to 3 agents):
task(
  (category = "deep"),
  (load_skills = ["verification-agent", "browser-automation", "rental-platform-os-rules"]),
  (prompt =
    "You are assigned browser-pool-1. Use mcp_name='browser-pool-1' for ALL browser tool calls. URLs must use host.docker.internal:3000. Verify epic P01-E04."),
);

// Without Docker pool (sequential — shared browser):
task(
  (category = "deep"),
  (load_skills = ["verification-agent", "playwright", "rental-platform-os-rules"]),
  (prompt =
    "Use mcp_name='playwright' for all browser tool calls. Use localhost:3000. Verify epic P01-E04."),
);

// For code-only verification (no browser needed):
task(
  (category = "unspecified-low"),
  (load_skills = ["verification-agent", "rental-platform-os-rules"]),
  (prompt =
    "Verify epic P01-E01. Read tasks/phase-01-auth/P01-E01-VERIFY.md and execute code checks."),
);
```

### Co-Skill Reference

| Skill                | Required?                                     | Why                                                                                      |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `browser-automation` | **YES** for `browser`/`hybrid` WITH Docker    | Docker pool browser access + tool patterns. **Replaces `playwright` — never load both.** |
| `playwright`         | **YES** for `browser`/`hybrid` WITHOUT Docker | Shared single browser fallback. Only when Docker pool MCPs are NOT available.            |
| `rental-platform-os-rules`   | **YES** always                                | Know what "correct" looks like (data formats, status transitions)                        |
| `convex-api`         | Optional                                      | Debug Convex mutation/query failures                                                     |
| `task-planner`       | Optional                                      | Navigate the task system, find epic files                                                |
| `doc-reconciler`     | **NO — not your job**                         | Doc accuracy is a separate concern                                                       |
