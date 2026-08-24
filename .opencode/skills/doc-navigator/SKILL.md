---
name: doc-navigator
description: Finds, writes, and maintains Rental Platform OS documentation — maps all 24 docs by topic, enforces cross-linking conventions, and provides the grep-based maintenance workflow for keeping references intact.
license: MIT
---

# Rental Platform OS Doc Navigator & Writer

Three capabilities: **Find** the right doc, **Write** new or updated docs, **Maintain** cross-links when things change.

## Find: Documentation Map

All product and technical documentation lives in `notes/`. Use this map to find the right doc FAST.

### How to Use

1. Identify what topic you need (auth, schema, UX, a specific feature)
2. Find the matching doc below
3. Read ONLY the doc(s) you need — don't read everything
4. Check the Section Guide for large docs to jump to the right part

### Core Docs (Read First for Any Work)

| File                              | One-Liner                                                                                                                                                         | When to Read                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `notes/00-product-overview.md`    | What Rental Platform OS is, personas (Guard/Admin), V1 scope, design principles, implementation priority order                                                            | Starting the project or need business context                               |
| `notes/01-tech-stack.md`          | Next.js + Convex + WorkOS + shadcn/ui, auth flows (guard phone+password, admin Google SSO), env vars, project structure, Convex Actions, HTTP Router, seed script | Setting up the project, implementing auth, understanding how pieces connect |
| `notes/13-constants-reference.md` | **Master enum reference** — every status, type, permission string, audit action, config key, badge color, amenity list, floor conventions                         | Implementing ANY feature (always keep this open)                            |

### Data & Architecture

| File                                | One-Liner                                                                                                                 | When to Read                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `notes/02-data-models.md`           | Every entity, all fields, types, indexes, relationships diagram                                                           | Designing queries, writing mutations, understanding entity relationships |
| `notes/10-convex-schema.md`         | Copy-paste-ready schema.ts with validators, indexes, search indexes, components, rate limiter, crons                      | Writing the actual schema.ts file or checking exact field validators     |
| `notes/11-convex-architecture.md`   | Mutation wrappers (functions.ts), auth helpers, Actions layer, HTTP Router, de-dup logic, real-time patterns, file upload | Implementing ANY Convex function — the architecture bible                |
| `notes/03-roles-and-permissions.md` | RBAC system: every permission string, default roles, guard permissions, permission check pattern, seed                    | Implementing RBAC, creating admin functions                              |
| `notes/04-state-machines.md`        | Every status transition with ASCII diagrams, transition tables, validation code pattern                                   | Implementing ANY status change                                           |

### UX & Flows

| File                          | One-Liner                                                                                                | When to Read                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------- |
| `notes/05-guard-portal-ux.md` | Mobile-first wireframes: login, dashboard, lead submission, my leads, visits, earnings, profile          | Building guard portal pages |
| `notes/06-admin-panel-ux.md`  | Desktop wireframes: admin login, sidebar, lead triage, verification, listing, visits, closures, settings | Building admin panel pages  |
| `notes/07-audit-trail.md`     | Trigger-based auto-logging, what gets logged, audit viewer UI, filters                                   | Implementing audit system   |
| `notes/08-i18n.md`            | English/Hindi/Hinglish, next-intl setup, translation keys, language selection                            | Adding i18n support         |

### Feature Specs

| File                                        | One-Liner                                                             | When to Read                           |
| ------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| `notes/features/01-society-registry.md`     | Society + building CRUD, floor labels, flat number templates          | Building society/building management   |
| `notes/features/02-guard-management.md`     | Guard CRUD, WorkOS Actions, shifts, ban/inactive flow, password reset | Building guard management              |
| `notes/features/03-lead-pipeline.md`        | Lead submission, rate limiting, de-dup, NEED_INFO flow, lead queue    | Building lead submission + admin queue |
| `notes/features/04-owner-verification.md`   | Verification form, call outcome, consent, two-step duplicate flow     | Building owner verification            |
| `notes/features/05-listings.md`             | Listing creation, photo upload, slug, public page (SSR), contact form | Building listings module               |
| `notes/features/06-visit-management.md`     | Visit scheduling, guard assignment, execution, visit board            | Building visit management              |
| `notes/features/07-closure-and-payouts.md`  | Closure, documents, payout lifecycle, guard earnings, brokerage       | Building closure + payouts             |
| `notes/features/08-incentive-system.md`     | Card types, levels, auto-award, manual award, thresholds              | Building incentive system              |
| `notes/features/09-quality-and-controls.md` | Quality metrics, rate limiting, ban process, rule banner              | Building quality controls              |
| `notes/features/10-analytics.md`            | Dashboards, @convex-dev/aggregate, cron snapshots, charts             | Building analytics                     |

### Reference

| File                        | One-Liner                                                                   | When to Read                                           |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `notes/09-v2-backlog.md`    | Everything NOT in V1: native app, push notifs, GPS, tenant portal, WhatsApp | Checking V1 vs V2 scope                                |
| `notes/12-decisions-log.md` | 32 key decisions with rationale                                             | Understanding WHY something was designed a certain way |

### External References

| File                       | One-Liner                                                                                     | When to Read                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `reference/README.md`      | How external reference codebases work, **Completed Merges table** (check FIRST), rules        | Adding a new reference codebase. **`demorentalsrentals/` is DONE — do not re-parse.** |
| `reference/INVENTORY.md`   | Agent-generated: all screens, models, flows found in external code (✅ demorentalsrentals merged) | Understanding what was built externally                                           |
| `reference/CORRELATION.md` | Agent-generated: how external features map to Rental Platform OS docs (✅ demorentalsrentals merged)      | Checking what's new vs existing vs extended                                       |

### Section Guides for Large Docs

#### `01-tech-stack.md` (~344 lines)

- Top: Stack overview table
- Auth architecture section: WorkOS, guard login, admin login, sessions, middleware, env vars
- Convex database section: patterns, Actions, HTTP Router
- Frontend architecture section: App Router, shadcn, client libraries, i18n, project structure
- Bottom: Bootstrap/seed

#### `02-data-models.md` (~507 lines)

- Top: Global conventions (phones, money, dates, soft delete)
- Entities A-Q in order: Society, Building, User, Guard Profile, Guard Shift, Lead, Owner Verification, Listing, Listing Photo, Listing Inquiry, Visit, Closure, Payout, Incentive Card, Audit Log, Role, User Role Assignment, System Config
- Bottom: Entity relationship diagram

#### `11-convex-architecture.md` (~803 lines)

- Top: Wrapped mutations with audit triggers (functions.ts)
- Shared utilities section: phone, money, soft delete
- Auth helper layer: requireGuard, requireAdmin, requirePermission
- Actions layer: WorkOS (guard creation, password, ban/unban)
- HTTP Router: public listing endpoint
- Function organization: leads.ts example with full de-dup logic
- Real-time patterns + file upload pattern
- Bottom: Error handling + testing approach

---

## Write: Creating & Updating Docs

### When to Write

| Trigger                    | Action                                                         |
| -------------------------- | -------------------------------------------------------------- |
| New feature implemented    | Update the feature spec in `notes/features/`                   |
| New entity added           | Update `notes/02-data-models.md` + `notes/10-convex-schema.md` |
| New status/enum added      | Update `notes/13-constants-reference.md`                       |
| Architecture decision made | Add to `notes/12-decisions-log.md`                             |
| New doc needed             | Create in `notes/` following the conventions below             |

### Style Conventions

1. **Scannable over readable.** Tables > paragraphs. Lists > prose. Code blocks > descriptions.
2. **One doc, one topic.** Feature specs cover one feature. Reference docs cover one domain.
3. **Show the code.** Include TypeScript code patterns agents can copy.
4. **Include the types.** Every field: name, type, required/optional, description. Use tables.
5. **State the rules.** Explicit > implicit. "MUST be true" not "should be checked."
6. **Keep headers stable.** Renaming a header requires grep-updating all references.

### New Doc Template

```markdown
# [Topic Name]

> **Priority**: #N in implementation order (if applicable)
> **Personas**: [Who uses this]

## Overview

[2-3 sentences: what this covers and why it exists]

## [Main Content Sections]

## Business Rules

1. [Rule 1]
2. [Rule 2]

## Related Documents

- [Doc Name](filename.md) — [how it relates]
- [Doc Name](filename.md#section) — [specific section that connects]
```

### Cross-Linking Convention

#### Link Format

```markdown
<!-- Within notes/ directory — relative paths, no prefix -->

See [Auth Architecture](01-tech-stack.md#authentication-architecture) for the full auth setup.

<!-- From tasks/ — relative path up one level -->

See [Auth Architecture](../notes/01-tech-stack.md#authentication-architecture).

<!-- From root level files like AGENTS.md -->

See [Auth Architecture](notes/01-tech-stack.md#authentication-architecture).
```

#### Section Anchors

Auto-generated from headers: lowercase, spaces to hyphens, strip special characters.

| Header                                   | Anchor                                |
| ---------------------------------------- | ------------------------------------- |
| `## Authentication Architecture`         | `#authentication-architecture`        |
| `## F. Lead (Vacancy Lead)`              | `#f-lead-vacancy-lead`                |
| `## Pattern 1: The Central Import Point` | `#pattern-1-the-central-import-point` |

#### Where to Place Links

1. **Inline** — where concepts naturally appear in text
2. **Related Documents section** — at bottom of every doc, 2-5 most relevant neighbors

---

## Maintain: Keeping Links Alive

### When a File is Renamed

```bash
grep -rn "old-filename.md" notes/ tasks/ AGENTS.md .opencode/skills/
# Update every hit to the new filename
```

### When a Section Header Changes

```bash
grep -rn "#old-anchor" notes/ tasks/ AGENTS.md .opencode/skills/
# Update every hit to the new anchor
```

### When a Doc is Restructured

1. Find all inbound links: `grep -rn "filename.md" notes/ tasks/ AGENTS.md .opencode/skills/`
2. Check each link still resolves to the right section
3. Update broken links
4. Update Related Documents sections of affected docs

### Maintenance Rule

**Every doc edit that changes a filename or section header MUST include a grep check and link update.** Non-negotiable. Broken links cause agents to read wrong content.

### Bulk Operations

```bash
# All docs referencing a specific doc
grep -rn "02-data-models.md" notes/ tasks/ .opencode/skills/

# All references to a specific section
grep -rn "#f-lead" notes/ tasks/

# All cross-links in a specific doc
grep -n ']\(.*\.md' notes/02-data-models.md

# Docs missing a Related Documents section
grep -rL "## Related Documents" notes/*.md notes/features/*.md
```
