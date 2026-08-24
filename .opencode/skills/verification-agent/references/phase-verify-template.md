<!--
  TEMPLATE: Per-Phase Integration Verification

  Location: tasks/phase-XX-name/VERIFICATION.md
  Created by: Doc Agent (when all epics in phase are planned)
  Executed by: Verify Agent (only when ALL epic VERIFY.md files pass)

  Purpose: Tests user journeys that SPAN multiple epics in the phase.
  Per-epic VERIFY.md tests isolated features. This tests they work TOGETHER.

  Usage: Copy this template, replace all [PLACEHOLDERS], remove this comment block.
-->

---

phase: X
title: "Phase X: [Phase Name] — Integration Verification"
status: pending
depends_on:

- PXX-E01
- PXX-E02
- PXX-E03
  verified_at: null
  failures: 0

---

# Phase X Integration Verification: [Phase Name]

## Readiness Gates

- [ ] ALL epic VERIFY.md files in this phase have `status: pass`
- [ ] Dev server running: `npm run dev` → http://localhost:3000
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Full build passes: `npm run build`
- [ ] All tests pass: `npm run test`

**STOP if any epic VERIFY.md is not `pass`.** Fix epic-level failures first.

---

## Integration Scenarios

<!--
  INTEGRATION SCENARIO RULES:
  - Each scenario MUST span at least 2 epics
  - Test the user journey, not individual features
  - Focus on data flowing between epics (e.g., guard logs in → submits lead → admin sees it)
  - Scenario IDs use "I" prefix: I01, I02, I03...
  - Keep to 4-8 scenarios per phase (too many = phase is too big)
-->

### I01: [User Journey Name]

**Epics Involved**: PXX-E01, PXX-E03, PXX-E05
**Persona**: [Guard | Admin | Tenant | Owner]

**Flow**:

1. [Step from Epic A — e.g., "Guard logs in via /guard/login"]
2. [Step from Epic B — e.g., "Guard navigates to lead submission form"]
3. [Step from Epic C — e.g., "Guard submits lead with valid data"]
4. [Assertion spanning epics — e.g., "Admin sees lead in queue at /admin/leads"]

**Assert**:

- [ ] [Cross-epic outcome — e.g., "Lead created by guard appears in admin queue"]
- [ ] [Data integrity — e.g., "Lead shows correct society/building from guard's assignment"]
- [ ] [Auth boundary — e.g., "Guard cannot access /admin/leads directly"]

**Evidence**: screenshot series (one per major step)

---

### I02: [User Journey Name]

**Epics Involved**: [...]
**Persona**: [...]

**Flow**:

1. [...]

**Assert**:

- [ ] [...]

**Evidence**: [...]

---

## Results

| ID  | Status  | Evidence | Notes |
| --- | ------- | -------- | ----- |
| I01 | pending | —        | —     |
| I02 | pending | —        | —     |

---

## Failure Reports

<!-- Verify Agent appends failure reports here. Same format as epic-level failures. -->
<!-- See references/failure-report-template.md for the format. -->
