<!--
  TEMPLATE: Structured Failure Report

  Appended to VERIFY.md when a scenario fails.
  One report per failed scenario. Do NOT combine failures.

  Usage: Copy and fill in all fields. Remove this comment block.
-->

## Failure Report: V0X

**Scenario**: [Scenario title from the Scenarios section]
**AC Ref**: [T0X-ACY — the acceptance criteria being tested]
**Attempt**: [1 | 2 — max 2 retries, then report and move on]

### Expected vs Actual

|              | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| **Expected** | [What should have happened per the acceptance criteria]      |
| **Actual**   | [What actually happened — be specific, not "it didn't work"] |

### Classification

<!-- Pick ONE -->

| Type                                | Matches? |
| ----------------------------------- | -------- |
| Server crash (500 / blank page)     | [ ]      |
| Render failure (element missing)    | [ ]      |
| Logic bug (wrong data/text)         | [ ]      |
| Mutation failure (action no effect) | [ ]      |
| API error (4xx/5xx network)         | [ ]      |
| Dependency issue (library error)    | [ ]      |
| Routing bug (wrong redirect)        | [ ]      |
| Validation bug (wrong error msg)    | [ ]      |
| Environment issue (service down)    | [ ]      |

### Evidence

```
Screenshot: [filename or "attached below"]
Console errors: [paste errors or "none"]
Network failures: [paste failed requests or "none"]
```

### Root Cause Analysis

<!-- Follow Triage Order from SKILL.md. Document what you found at each step. -->

**Code inspection**:

- File: `[path/to/file.ts]` — line ~[N]
- Finding: [what the code does vs what it should do]

**Spec check**:

- Epic: `[PXX-EYY-name.md]` — Task [T0X]
- AC says: [quote the acceptance criteria]
- Completion Summary deviation: [quote if relevant, or "none documented"]

**Library lookup** (if applicable):

- Library: [name]
- Context7 finding: [what the docs say the correct usage is]
- Mismatch: [how the code differs from correct usage]

### Suggested Fix

<!-- You do NOT implement the fix. You describe what should change. -->

- **File**: `[path/to/file.ts]`
- **What to change**: [specific description — "Map error code X to user message Y in the catch block"]
- **Why**: [brief reasoning tied to AC]

### Severity

<!-- Pick ONE -->

| Level        | Criteria                                                              |
| ------------ | --------------------------------------------------------------------- |
| **Critical** | Feature completely broken, blocks other features                      |
| **High**     | Feature partially broken, core flow affected                          |
| **Medium**   | Feature works but UX is degraded (wrong message, missing state, etc.) |
| **Low**      | Cosmetic issue, edge case, non-blocking                               |
