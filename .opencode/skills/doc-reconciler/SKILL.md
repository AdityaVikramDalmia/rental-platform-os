---
name: doc-reconciler
description: Detects and fixes documentation drift against source code and other docs — maps code-to-doc truth sources, provides systematic audit workflows, compliance rules, and reconciliation patterns for keeping all 24 docs accurate.
license: MIT
---

# Documentation Reconciler

Detect drift between documentation and code. Fix it. Create new docs that are compliant from the start.

**Different from `doc-navigator`**: doc-navigator teaches how to FIND and WRITE docs. This skill teaches how to VERIFY docs are accurate and FIX them when they're not.

## When to Use

- After implementing a feature — verify affected docs still match code
- Periodic audit — systematic sweep of all docs against codebase
- Creating new documentation — ensure compliance from day one
- Before a new phase — verify all docs from previous phase are reconciled
- After refactoring — catch docs that now describe old patterns

---

## Truth Map: Code → Documentation

Every doc is downstream of a code source of truth. When code changes, these docs MUST be checked.

### Schema & Data Layer

| Code Source of Truth | Docs That Must Match | What Drifts |
|---------------------|---------------------|-------------|
| `convex/schema.ts` | `notes/10-convex-schema.md` | Field names, types, new/removed fields, index definitions |
| `convex/schema.ts` | `notes/02-data-models.md` | Entity descriptions, field lists, relationship diagram |
| `lib/constants.ts` | `notes/13-constants-reference.md` | Enum values, permission strings, config keys, badge colors |
| `convex/schema.ts` indexes | `notes/10-convex-schema.md` "Index Design Rationale" | New indexes, changed compound indexes, access patterns |

### Architecture Layer

| Code Source of Truth | Docs That Must Match | What Drifts |
|---------------------|---------------------|-------------|
| `convex/functions.ts` | `notes/11-convex-architecture.md` "Function Layer" | Audit trigger setup, wrapped exports, table list |
| `convex/auth.helpers.ts` | `notes/11-convex-architecture.md` "Auth Helper Layer" | Permission check logic, role resolution, helper signatures |
| `convex/actions/workos.ts` | `notes/11-convex-architecture.md` "Actions Layer" | Action names, parameters, error handling patterns |
| `convex/http.ts` | `notes/11-convex-architecture.md` "HTTP Router" | Route paths, response formats, caching headers |
| `convex/rateLimiter.ts` | `notes/10-convex-schema.md` "Rate Limiter" | Rate limits, period, key names |
| `convex/crons.ts` | `notes/10-convex-schema.md` "Cron Jobs" | Cron schedules, function references |
| `convex/convex.config.ts` | `notes/10-convex-schema.md` "Component Registration" | Component registrations, named instances |

### Status & Permissions

| Code Source of Truth | Docs That Must Match | What Drifts |
|---------------------|---------------------|-------------|
| Status validators in `schema.ts` | `notes/04-state-machines.md` | New/removed status values |
| Transition logic in mutations | `notes/04-state-machines.md` | New/changed transitions, guard conditions |
| `requirePermission()` calls | `notes/03-roles-and-permissions.md` | New permissions used in code but not documented |
| `requirePermission()` calls | `notes/13-constants-reference.md` "Permissions" | Permission strings out of sync |
| Seed script role definitions | `notes/03-roles-and-permissions.md` "Default Roles" | Role permission sets changed |

### Feature Layer

| Code Source of Truth | Docs That Must Match | What Drifts |
|---------------------|---------------------|-------------|
| `convex/societies.ts` | `notes/features/01-society-registry.md` | CRUD functions, validation rules, business logic |
| `convex/guards.ts` | `notes/features/02-guard-management.md` | Guard lifecycle, shift management |
| `convex/leads.ts` | `notes/features/03-lead-pipeline.md` | Submission flow, de-dup rules, triage logic |
| `convex/verification.ts` | `notes/features/04-owner-verification.md` | Verification form fields, call outcomes |
| `convex/listings.ts` | `notes/features/05-listings.md` | Listing fields, photo handling, slug generation |
| `convex/visits.ts` | `notes/features/06-visit-management.md` | Visit lifecycle, assignment, execution |
| `convex/closures.ts` + `payouts.ts` | `notes/features/07-closure-and-payouts.md` | Closure flow, payout lifecycle |
| `convex/incentives.ts` | `notes/features/08-incentive-system.md` | Card types, auto-award logic, thresholds |
| Quality logic in guards/leads | `notes/features/09-quality-and-controls.md` | Metrics, rate limits, ban process |
| `convex/analytics.ts` | `notes/features/10-analytics.md` | Aggregate queries, dashboard computations |

### Cross-Doc Dependencies

These docs reference each other. Changes in one can drift the other.

| If You Change... | Also Check... |
|-----------------|---------------|
| `02-data-models.md` (entity fields) | `10-convex-schema.md` (validators must match) |
| `04-state-machines.md` (transitions) | `13-constants-reference.md` (status enum list) |
| `13-constants-reference.md` (permissions) | `03-roles-and-permissions.md` (role definitions) |
| `11-convex-architecture.md` (patterns) | `rental-platform-os-arch` skill (code examples) |
| `01-tech-stack.md` (auth flow) | `11-convex-architecture.md` (auth helpers) |
| Any `notes/features/*.md` | `02-data-models.md` (if entity shape changed) |
| `12-decisions-log.md` (new decision) | Relevant feature/architecture doc |

---

## Drift Detection: The 6 Drift Types

### 1. Schema Drift

Code added/removed/renamed a field but docs still show the old schema.

**Detect**:
```bash
# Compare schema.ts field names against 10-convex-schema.md code block
# Look for fields in code not in docs, or fields in docs not in code
```
**Symptoms**: Agent writes a mutation using a field from docs that doesn't exist in schema, or misses a field that does exist.

### 2. Enum Drift

New status value, type, or permission added in code but not in constants reference.

**Detect**:
```bash
# Extract v.union(v.literal(...)) values from schema.ts
# Compare against notes/13-constants-reference.md tables
# Check lib/constants.ts exports against docs
```
**Symptoms**: Agent uses a status value from docs that's been renamed, or misses a new one.

### 3. Pattern Drift

Architecture pattern changed in code but docs still describe the old way.

**Detect**: Compare code in `functions.ts`, `auth.helpers.ts`, domain files against patterns in `11-convex-architecture.md` and `rental-platform-os-arch` skill.

**Symptoms**: Agent follows the documented pattern but gets type errors because the actual pattern evolved.

### 4. Permission Drift

New `requirePermission(ctx, "x.y")` call in code uses a permission not listed in docs.

**Detect**:
```bash
# Find all permission strings used in code
grep -rn 'requirePermission.*"' convex/
# Compare against notes/13-constants-reference.md "Permissions" section
# Compare against notes/03-roles-and-permissions.md
```
**Symptoms**: Agent assigns a permission to a role but it's the wrong string, or misses a permission a function needs.

### 5. Cross-Link Rot

File renamed or section header changed but links in other docs still point to old target.

**Detect**:
```bash
# Find all markdown links
grep -rn '](.*\.md' notes/ tasks/ AGENTS.md .opencode/skills/
# Check each link target exists
```
**Symptoms**: Agent follows a link and lands on the wrong section or gets a 404.

### 6. Feature Drift

Implementation differs from feature spec (different field names, different flow, extra/missing steps).

**Detect**: Compare function signatures and logic in domain files against the corresponding feature spec in `notes/features/`.

**Symptoms**: Agent implements from the feature spec but the code doesn't match existing implementations.

---

## Audit Workflow

### Quick Audit (After Feature Implementation)

Run after completing an epic. Takes 5-10 minutes.

```
1. IDENTIFY which code files changed (git diff)
2. LOOK UP affected docs in Truth Map above
3. For each affected doc:
   a. Read the relevant section
   b. Compare against actual code
   c. Fix discrepancies
4. Check cross-links: grep for the doc filename across all docs
5. Update notes/12-decisions-log.md if any design decisions changed
```

### Full Audit (Periodic / Phase Boundary)

Run between phases. Systematic sweep.

```
PASS 1: Schema Compliance
  1. Read convex/schema.ts
  2. Compare field-by-field against notes/10-convex-schema.md
  3. Compare field-by-field against notes/02-data-models.md
  4. Verify all indexes are documented with rationale
  5. Flag: fields in code not in docs, fields in docs not in code

PASS 2: Enum & Constants Compliance
  1. Extract all v.union(v.literal(...)) from schema.ts
  2. Extract all permission strings from requirePermission() calls
  3. Compare against notes/13-constants-reference.md
  4. Compare role definitions against notes/03-roles-and-permissions.md
  5. Flag: values in code not in docs, values in docs not in code

PASS 3: Architecture Compliance
  1. Read convex/functions.ts → compare against 11-convex-architecture.md Pattern 1
  2. Read convex/auth.helpers.ts → compare against 11-convex-architecture.md Auth Helpers
  3. Read convex/actions/workos.ts → compare against Actions section
  4. Read convex/http.ts → compare against HTTP Router section
  5. Compare rental-platform-os-arch skill code examples against actual code
  6. Flag: patterns that evolved but docs show old version

PASS 4: Status Transition Compliance
  1. For each entity with status: extract valid transitions from mutation code
  2. Compare against notes/04-state-machines.md
  3. Flag: new transitions, removed transitions, changed guard conditions

PASS 5: Feature Spec Compliance
  1. For each implemented feature:
     - Read the domain file (e.g., convex/leads.ts)
     - Compare function signatures, args, logic against feature spec
  2. Flag: functions in code not in spec, spec steps not implemented

PASS 6: Cross-Link Integrity
  1. Extract all markdown links from notes/, tasks/, AGENTS.md, .opencode/skills/
  2. Verify each target file exists
  3. Verify each section anchor exists in target file
  4. Flag: broken links, stale anchors
```

### Audit Output Format

For each discrepancy found:

```markdown
## [DRIFT] Schema Drift in leads table
- **Doc**: notes/10-convex-schema.md line ~202
- **Code**: convex/schema.ts
- **Issue**: Doc shows `availability_date: v.optional(v.string())` but code has `availability_date: v.optional(v.number())`
- **Fix**: Update doc to show `v.optional(v.number())` — dates are Unix ms per project convention
```

---

## Compliance Rules: What "Compliant" Means

### For Schema Docs (`10-convex-schema.md`, `02-data-models.md`)

- [ ] Every table in `schema.ts` has a corresponding section
- [ ] Every field name, type, and optional/required status matches exactly
- [ ] Every index is listed with its fields and rationale
- [ ] Every search index is documented
- [ ] System fields (`_id`, `_creationTime`) are NOT listed (Convex adds these)

### For Constants Reference (`13-constants-reference.md`)

- [ ] Every `v.union(v.literal(...))` in schema has a matching enum table
- [ ] Every permission string used in `requirePermission()` calls is listed
- [ ] Every system config key used in code is listed with default value
- [ ] Badge colors (Tailwind classes) match actual UI component code
- [ ] Audit action strings match the trigger pattern (`TABLE_OPERATION`)

### For Architecture Docs (`11-convex-architecture.md`)

- [ ] Code examples compile against current types (not outdated signatures)
- [ ] Import paths are correct
- [ ] Function names match actual exports
- [ ] Error messages in examples match actual error strings

### For State Machine Docs (`04-state-machines.md`)

- [ ] Every status value exists in the schema
- [ ] Every documented transition has corresponding code that allows it
- [ ] No undocumented transitions exist in code
- [ ] Terminal states are correctly marked

### For Feature Specs (`notes/features/*.md`)

- [ ] Function signatures match actual Convex exports
- [ ] Business rules described are enforced in code
- [ ] Edge cases listed are handled in code
- [ ] "Out of Scope" items are NOT implemented

### For Skills (`.opencode/skills/*/SKILL.md`)

- [ ] Code patterns shown are copy-pasteable (correct imports, types, signatures)
- [ ] File paths referenced exist
- [ ] Section references use correct anchors
- [ ] Rules stated match `rental-platform-os-rules` (no contradictions between skills)

---

## Creating Compliant Docs From Scratch

When creating a NEW doc (feature spec, architecture addition, etc.):

### Step 1: Identify the Code Truth Source

Before writing anything, find the code file(s) that this doc will describe. Write FROM code, not from memory or assumptions.

### Step 2: Extract Structure

```
- Read the code
- List every public export (function name, args, return type)
- List every status/enum used
- List every permission required
- List every index queried
- List every related entity referenced
```

### Step 3: Write Using Doc Conventions

Follow the style rules from `doc-navigator`:
- Tables > paragraphs
- Show the code (TypeScript patterns agents can copy)
- Include types for every field
- State rules explicitly ("MUST", "NEVER")
- Include cross-links to related docs

### Step 4: Validate Compliance

Run through the relevant compliance checklist above. Every checkbox must pass before the doc is done.

### Step 5: Register Cross-Links

```bash
# Find docs that should link to your new doc
grep -rn "relevant-keyword" notes/ tasks/
# Add links from those docs to yours
# Add "Related Documents" section to your doc linking back
```

---

## Common Fix Patterns

### Adding a New Field

```
1. Add to convex/schema.ts
2. Update notes/10-convex-schema.md — add field to table's code block
3. Update notes/02-data-models.md — add field to entity description
4. If it's a new enum: update notes/13-constants-reference.md
5. If it affects a feature: update notes/features/XX-*.md
```

### Adding a New Status Value

```
1. Add v.literal("NEW_STATUS") to schema.ts union
2. Update notes/13-constants-reference.md — add to status enum table with color
3. Update notes/04-state-machines.md — add transitions, update ASCII diagram
4. If it creates new transitions: update the validateTransition function
5. Update rental-platform-os-rules skill if transition rules changed
```

### Adding a New Permission

```
1. Add requirePermission(ctx, "new.permission") in mutation code
2. Update notes/13-constants-reference.md — add to Permissions tables
3. Update notes/03-roles-and-permissions.md — add to appropriate role
4. If it's in a default role: update seed script to include it
```

### Changing an Architecture Pattern

```
1. Change the code
2. Update notes/11-convex-architecture.md — fix the pattern section
3. Update rental-platform-os-arch skill — fix the corresponding Pattern section
4. grep for old pattern across all docs/skills to find stale references
```

### Renaming a File or Section

```
1. Rename the file/section
2. IMMEDIATELY grep for all references:
   grep -rn "old-name" notes/ tasks/ AGENTS.md .opencode/skills/
3. Update every reference
4. This is the #1 cause of cross-link rot — never skip this step
```

---

## Automation Hooks

### Git Pre-Commit (Future)

When infrastructure supports it, these checks can be automated:
- Schema field count matches doc field count
- All permission strings in code exist in constants reference
- All markdown links resolve to existing files
- All section anchors resolve to existing headers

### Post-Task Verification

Every task in the task-planner system should include a reconciliation step:
```markdown
### Verification
1. Code compiles: `npx tsc --noEmit`
2. Docs reconciled: Check truth map for affected docs, verify accuracy
```

This is already implied by the task-planner's completion evidence rules, but agents should explicitly check docs, not just code.
