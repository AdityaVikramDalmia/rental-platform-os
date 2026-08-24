<!--
  TEMPLATE: Per-Epic Verification Spec

  Location: tasks/phase-XX-name/PXX-EYY-VERIFY.md
  Created by: Doc Agent (initial) or Code Agent (after implementation)
  Updated by: Code Agent (refines scenarios, adds deviations)
  Executed by: Verify Agent

  Usage: Copy this template, replace all [PLACEHOLDERS], remove this comment block.
-->

---

epic_id: PXX-EYY
title: "[Epic Title] Verification"
type: browser | code | hybrid
status: pending
depends_on_epic: PXX-EYY
verified_at: null
failures: 0

---

# PXX-EYY Verification: [Epic Title]

## Readiness Gates

- [ ] Epic `status: done` in frontmatter of `PXX-EYY-[name].md`
- [ ] Completion Summary exists at bottom of epic file
- [ ] Deviations reviewed (if any listed in Completion Summary)
- [ ] Dev server running: `npm run dev` → http://localhost:3000
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] [Epic-specific prerequisite, e.g., "Test guard account exists"]

<!--
  TYPE GUIDE:
  - code:    Scaffolding, schema, infra epics. No Playwright needed.
             Scenarios = type checks + build + test assertions only.
  - browser: UI pages, forms, navigation. Full Playwright scenarios.
  - hybrid:  Backend mutations + frontend UI that calls them.
-->

---

## Code Verification

<!-- Always include this section. Even browser epics need type/build/test checks. -->

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests (list specific test files from epic deliverables)
npm run test -- [path/to/test/file.test.ts]
```

**Expected**: All commands exit 0. If test file doesn't exist yet, note it in Results.

---

## Scenarios

<!--
  SCENARIO RULES:
  - One scenario per distinct user action or assertion group
  - AC Ref = Task + Acceptance Criteria number from epic (e.g., T01-AC1)
  - Group related ACs into one scenario when they test the same flow
  - Scenario IDs are sequential: V01, V02, V03...
  - Mark scenarios that need specific test accounts or data
-->

### V01: [Descriptive Scenario Name] — AC Ref: T0X-AC1

**Precondition**: [URL to navigate to, user state, data requirements]

**Actions**:

1. [Action step — e.g., "Navigate to /guard/login"]
2. [Action step — e.g., "Enter '9876543210' in phone field"]
3. [Action step — e.g., "Enter 'password123' in password field"]
4. [Action step — e.g., "Click 'Sign In' button"]

**Assert**:

- [ ] [Expected outcome — e.g., "Redirects to /guard/dashboard"]
- [ ] [Additional assertion — e.g., "Shows 'Welcome, Test Guard'"]
- [ ] [Additional assertion — e.g., "No console errors"]

**Evidence**: [screenshot | screenshot + console | screenshot + network]

---

### V02: [Descriptive Scenario Name] — AC Ref: T0X-AC2

**Precondition**: [...]

**Actions**:

1. [...]

**Assert**:

- [ ] [...]

**Evidence**: [...]

---

<!-- Add more scenarios as needed. Typical count: 3-8 per epic. -->

## Results

<!-- Verify Agent fills this table during execution. Do NOT pre-fill. -->

| ID  | Status  | Evidence | Notes |
| --- | ------- | -------- | ----- |
| V01 | pending | —        | —     |
| V02 | pending | —        | —     |

---

## Failure Reports

<!-- Verify Agent appends failure reports here. One section per failed scenario. -->
<!-- See references/failure-report-template.md for the format. -->
