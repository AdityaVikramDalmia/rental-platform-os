---
name: reference-parser
description: Parses external reference codebases, extracts features/screens/flows, correlates them to Rental Platform OS docs, and updates documentation + task plans for implementation.
license: MIT
---

# Reference Parser

Parse external codebases (from no-code/prompting platforms) that teammates built in parallel. Extract what they built, map it to Rental Platform OS's architecture, update our docs, and extend the task plan.

**Reference code lives in**: `reference/` at repo root. See `reference/README.md` for structure.

## ⚠️ CHECK BEFORE RUNNING

**Read `reference/README.md` → "Completed Merges" table FIRST.** If the codebase is already marked **DONE**, the full 5-phase workflow has already been executed and verified. Do NOT re-run it. All features have been extracted, correlated, merged into docs, and added to the task plan.

Currently completed:

- `demorentalsrentals/` — **DONE** (2026-02-16). Produced: INVENTORY.md (79 items), CORRELATION.md (79 mappings), 6 new feature specs (notes/features/11-16), 10 existing docs updated, phases P15-P21 created.

## When to Use

- User says "parse the reference codebase" — **but check Completed Merges first**
- User drops NEW code into `reference/` and wants it analyzed
- User asks to correlate external features with Rental Platform OS docs
- User asks to create tasks/phases from reference material

## The Workflow (5 Phases)

Execute these phases IN ORDER. Each phase produces a concrete artifact.

---

### Phase 1: Inventory — What's in the external code?

**Goal**: Scan the reference codebase and produce a structured inventory.

**Steps**:

1. Read `reference/{app-name}/` directory tree
2. Identify the tech stack (React, Vue, Svelte, HTML, etc.)
3. For EACH screen/page/route found, document:
   - **Screen name** (from filename, component name, or route)
   - **Persona** it serves (tenant, owner, guard, admin, public)
   - **What it does** (1-2 sentences)
   - **Data it reads/writes** (entities, fields — inferred from code)
   - **Key interactions** (forms, buttons, navigation, state changes)
4. For EACH data model/API found, document:
   - **Entity name**
   - **Fields** (name, type, purpose)
   - **Relationships** to other entities

**Output**: Write `reference/INVENTORY.md` using this format:

```markdown
# Reference Inventory: {app-name}

**Source**: {platform name}
**Tech stack**: {detected stack}
**Parsed on**: {date}
**Parsed by**: Agent

## Screens

| #   | Screen           | Persona | Purpose                | Data             | File(s)                  |
| --- | ---------------- | ------- | ---------------------- | ---------------- | ------------------------ |
| 1   | Property listing | Tenant  | Browse available flats | listings, photos | src/pages/listings.tsx   |
| 2   | Visit booking    | Tenant  | Book a visit slot      | visits, listings | src/pages/book-visit.tsx |
| ... |                  |         |                        |                  |                          |

## Data Models

| Entity | Fields             | Relationships   | Notes                        |
| ------ | ------------------ | --------------- | ---------------------------- |
| Tenant | name, phone, email | has_many visits | New entity not in Rental Platform OS |
| ...    |                    |                 |                              |

## Flows / State Machines

| Flow                 | States                          | Trigger             | Notes                    |
| -------------------- | ------------------------------- | ------------------- | ------------------------ |
| Tenant visit booking | request → confirmed → completed | Tenant submits form | Maps to visit management |
| ...                  |                                 |                     |                          |

## API / Backend Logic

| Endpoint / Function  | Purpose              | Auth        | Notes                 |
| -------------------- | -------------------- | ----------- | --------------------- |
| POST /api/book-visit | Create visit request | Tenant auth | Needs Convex mutation |
| ...                  |                      |             |                       |
```

**Inventory rules**:

- Be exhaustive. List EVERY screen and model, even trivial ones.
- Note the file path so anyone can cross-check.
- Use "Notes" column to flag things that are NEW (not in Rental Platform OS yet).

---

### Phase 2: Correlation — How does it map to Rental Platform OS?

**Goal**: Map every inventory item to Rental Platform OS's existing docs, or flag as NEW.

**Steps**:

1. Read these Rental Platform OS docs (load `doc-navigator` skill for the full map):
   - `notes/00-product-overview.md` — personas, V1 scope
   - `notes/02-data-models.md` — all entities
   - `notes/04-state-machines.md` — all status flows
   - `notes/09-v2-backlog.md` — what was deferred
   - `notes/features/*.md` — all feature specs
   - `notes/13-constants-reference.md` — all enums
2. For EACH inventory item, classify:

| Classification | Meaning                                                       | Action                   |
| -------------- | ------------------------------------------------------------- | ------------------------ |
| **EXISTING**   | Maps directly to an existing Rental Platform OS feature/entity        | Note the doc + section   |
| **EXTENDS**    | Adds to an existing feature (new field, new flow, new screen) | Note what it adds        |
| **NEW**        | Entirely new — no equivalent in Rental Platform OS docs               | Flag for new doc         |
| **V2→V1**      | Was in V2 backlog, now being pulled into V1                   | Note the V2 backlog item |
| **CONFLICTS**  | Contradicts an existing spec or decision                      | Flag for resolution      |
| **SKIP**       | Platform-specific boilerplate, not relevant                   | Note why skipping        |

**Output**: Write `reference/CORRELATION.md` using this format:

```markdown
# Correlation Map: {app-name} → Rental Platform OS

**Inventory source**: `reference/INVENTORY.md`
**Correlated on**: {date}

## Summary

- **X** screens/features mapped
- **Y** map to existing docs (EXISTING/EXTENDS)
- **Z** are entirely new (NEW)
- **W** pulled from V2 backlog (V2→V1)
- **C** conflicts found (CONFLICTS)

## Correlation Table

| #   | External Feature      | Classification | Rental Platform OS Doc            | Section/Entity       | Gap / Notes                              |
| --- | --------------------- | -------------- | ------------------------- | -------------------- | ---------------------------------------- |
| 1   | Property listing page | EXTENDS        | `features/05-listings.md` | Public listing page  | Adds tenant-side filters, saved searches |
| 2   | Tenant registration   | NEW            | —                         | —                    | New persona + auth flow needed           |
| 3   | Visit slot booking    | V2→V1          | `09-v2-backlog.md`        | Tenant-Facing Portal | Was V2, now V1                           |
| 4   | Owner dashboard       | NEW            | —                         | —                    | Owner self-service not in any doc        |
| ... |                       |                |                           |                      |                                          |

## New Entities Needed

| Entity      | Source Screen(s)  | Proposed Rental Platform OS Table | Key Fields                              |
| ----------- | ----------------- | ------------------------- | --------------------------------------- |
| Tenant Lead | Registration form | `tenant_leads`            | name, phone, email, interested_listings |
| ...         |                   |                           |                                         |

## New Personas Identified

| Persona            | Auth Method                   | Portal     | Reference Screens                              |
| ------------------ | ----------------------------- | ---------- | ---------------------------------------------- |
| Prospective Tenant | Phone OTP / self-registration | Mobile web | listing browse, visit booking, status tracking |
| Owner              | Phone + verification          | Mobile web | owner dashboard, consent, property status      |

## Conflicts to Resolve

| #   | External Approach               | Rental Platform OS Spec                  | Conflict                    | Recommendation    |
| --- | ------------------------------- | -------------------------------- | --------------------------- | ----------------- |
| 1   | Tenant can cancel visit anytime | Visit cancellation only by admin | Who controls cancellations? | Ask product owner |
| ... |                                 |                                  |                             |                   |

## V2 Items Pulled to V1

| V2 Backlog Item      | What's Being Pulled                              | What Stays V2                                    |
| -------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Tenant-Facing Portal | Listing browse, visit booking, lead registration | Phone OTP auth (still V2 — use password for now) |
| ...                  |                                                  |                                                  |
```

---

### Phase 3: Documentation Update — Update Rental Platform OS docs

**Goal**: Enrich Rental Platform OS's documentation with features extracted from the reference.

**Steps** (use `doc-navigator` skill conventions for all writes):

1. **New feature specs** — for each NEW classification:
   - Create `notes/features/XX-feature-name.md` following existing feature spec format
   - Use the same structure as `notes/features/01-society-registry.md` (Overview, entities, screens, business rules, state machines, related docs)
   - Number sequentially after the last existing feature spec

2. **Update existing docs** — for each EXTENDS classification:
   - Add new sections/fields to the relevant existing doc
   - Mark additions clearly: add a note like `<!-- Added from reference/{app-name} -->`

3. **Update product overview** — `notes/00-product-overview.md`:
   - Add new personas to the Personas section
   - Update V1 scope if features moved from V2
   - Update implementation priority with new phases

4. **Update data models** — `notes/02-data-models.md`:
   - Add new entities with full field specs
   - Add new relationships to the entity diagram

5. **Update schema** — `notes/10-convex-schema.md`:
   - Add new table definitions (validators, indexes)

6. **Update constants** — `notes/13-constants-reference.md`:
   - Add new status enums, types, permission strings

7. **Update state machines** — `notes/04-state-machines.md`:
   - Add new status flows for new entities
   - Extend existing flows if reference adds transitions

8. **Update V2 backlog** — `notes/09-v2-backlog.md`:
   - Mark pulled items as "Pulled to V1 — see `notes/features/XX-feature-name.md`"
   - Keep the backlog item but add the cross-reference

9. **Update decisions log** — `notes/12-decisions-log.md`:
   - Log decision to pull V2 items to V1 with rationale
   - Log any conflict resolutions

10. **Cross-link everything** — follow `doc-navigator` linking rules:
    - Every new doc gets a Related Documents section
    - Every updated doc gets links to new docs
    - `grep -rn` to verify no broken links

**Documentation rules**:

- NEVER just point to the reference code. Write self-contained docs that don't require reading `reference/`.
- After doc updates, the reference is supplementary — all specs must be in `notes/`.
- Follow existing doc style: tables > prose, code blocks > descriptions, scannable > readable.

---

### Phase 4: Task Plan Extension — Create new phases

**Goal**: Add implementation phases for the new features.

**Steps** (use `task-planner` skill for format):

1. Read `tasks/README.md` — understand the existing 14-phase roadmap
2. Determine where new phases fit:
   - Do they depend on existing phases? (probably P01 auth + P02 societies minimum)
   - Do they extend existing phases? (e.g., visit booking might extend P07)
   - Are they entirely new phases? (e.g., tenant portal = new phase)
3. Create new phase entries in `tasks/README.md`:
   - Follow the exact format of existing phase blocks
   - Set dependencies correctly
   - Define scope boundaries clearly
4. Create phase directories: `tasks/phase-XX-name/README.md`
5. Do NOT create detailed epic files yet — those come when the phase is ready to execute

**Task planning rules**:

- New phases go AFTER existing phases they depend on
- Phase numbering continues from P14 (P15, P16, ...)
- Keep existing phase numbers stable — NEVER renumber
- Each new phase needs: Scope, Delivers, Depends on, Boundary, Key docs

---

### Phase 5: Verification — Validate the output

**Goal**: Ensure everything is consistent and complete.

**Checklist**:

- [ ] `reference/INVENTORY.md` exists and covers all screens/models
- [ ] `reference/CORRELATION.md` exists and every inventory item is classified
- [ ] Every NEW item has a corresponding doc in `notes/features/`
- [ ] Every EXTENDS item has updates in the relevant existing doc
- [ ] Every V2→V1 item is cross-referenced in `notes/09-v2-backlog.md`
- [ ] `notes/00-product-overview.md` has updated personas and V1 scope
- [ ] `notes/02-data-models.md` has new entities
- [ ] `notes/13-constants-reference.md` has new enums
- [ ] `notes/04-state-machines.md` has new status flows
- [ ] `tasks/README.md` has new phases
- [ ] All cross-links verified: `grep -rn "new-feature-file.md" notes/ tasks/`
- [ ] No orphan docs (every new doc linked from at least one other doc)
- [ ] CONFLICTS section empty or all resolved

---

## Companion Skills

Always load these alongside `reference-parser`:

| Skill              | Why                                                                   |
| ------------------ | --------------------------------------------------------------------- |
| `doc-navigator`    | Needed for Phase 3 — finding docs, writing conventions, cross-linking |
| `task-planner`     | Needed for Phase 4 — creating phases and epic format                  |
| `rental-platform-os-rules` | Needed for Phase 3 — ensuring new specs follow project conventions    |

```typescript
// Recommended invocation
task(
  (category = "deep"),
  (load_skills = ["reference-parser", "doc-navigator", "task-planner", "rental-platform-os-rules"]),
  (prompt =
    "Parse the reference codebase at reference/{app-name}/. Run the full 5-phase workflow."),
  (run_in_background = false),
);
```

## Quick Reference: File Locations

| What               | Where                      |
| ------------------ | -------------------------- |
| External codebases | `reference/{app-name}/`    |
| Inventory output   | `reference/INVENTORY.md`   |
| Correlation output | `reference/CORRELATION.md` |
| Rental Platform OS docs    | `notes/`                   |
| Feature specs      | `notes/features/`          |
| Task plan          | `tasks/README.md`          |
| Phase directories  | `tasks/phase-XX-name/`     |
