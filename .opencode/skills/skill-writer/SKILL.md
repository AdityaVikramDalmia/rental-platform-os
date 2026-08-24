---
name: skill-writer
description: Meta-skill for creating new OpenCode skills — covers SKILL.md format, YAML frontmatter, supporting files, naming conventions, discovery, and best practices learned from building the Rental Platform OS skill set.
license: MIT
---

# OpenCode Skill Writer

Create well-formed OpenCode skills that agents can load on demand. This skill teaches the exact format, validation rules, and patterns learned from building skills in this project.

## When to Use

- Creating a new skill for the Rental Platform OS project
- Updating an existing skill's structure or content
- Need to understand how skills are discovered, loaded, and invoked

## Skill File Structure

```
.opencode/skills/{skill-name}/
  SKILL.md              # REQUIRED — the skill definition
  scripts/              # Optional — executable scripts
  references/           # Optional — reference docs, checklists
  assets/               # Optional — images, templates, other files
```

The agent receives the base directory path as context, so the skill body can reference supporting files by relative path (e.g., `scripts/validate.sh`, `references/checklist.md`).

## SKILL.md Format

Every skill has two parts: YAML frontmatter + Markdown body.

### YAML Frontmatter (between `---` fences)

| Field           | Required | Type     | Notes                                                                                                                          |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `name`          | YES      | string   | **Must exactly match the directory name.** `skill-writer` dir = `name: skill-writer`. Validation fails on mismatch.            |
| `description`   | YES      | string   | **Minimum 20 characters.** One sentence explaining what the skill does. This is shown to agents in the skill list.             |
| `license`       | No       | string   | Use `MIT` for project skills.                                                                                                  |
| `allowed-tools` | No       | string[] | Restrict which tools the agent can use when this skill is loaded (e.g., `["read", "write", "bash"]`). Omit to allow all tools. |
| `metadata`      | No       | object   | Arbitrary key-value pairs (e.g., `version`, `author`, `audience`). Informational only.                                         |
| `mcp`           | No       | object   | Attach MCP servers to the skill. Agent gets access to these tools when the skill is loaded.                                    |

### Markdown Body (after second `---`)

Everything after the frontmatter is the skill's content. It is **injected directly into the agent's system prompt** when the skill is loaded. Write it as instructions TO the agent.

## Frontmatter Examples

### Minimal (project-internal skill)

```yaml
---
name: my-skill
description: A custom skill that helps with specific tasks in my project
license: MIT
---
```

### With tool restrictions

```yaml
---
name: deployment-helper
description: Automates deployment workflows with validation checks and rollback procedures for production systems
license: MIT
allowed-tools:
  - read
  - write
  - bash
metadata:
  version: "1.0"
  author: "DevOps Team"
---
```

### With MCP server

```yaml
---
name: my-api
description: Custom API integration skill with dedicated MCP server
mcp:
  my-api-server:
    command: npx
    args: ["-y", "@my-org/api-mcp-server"]
---
```

## Naming & Discovery

### Naming Rules

- Directory name = skill name. Must match `name` field in frontmatter exactly.
- Use kebab-case: `my-skill`, `doc-navigator`, `rental-platform-os-rules`.
- Tool is registered as `skills_{name}` with hyphens converted to underscores: `skill-writer` becomes `skills_skill_writer`.

### Discovery Locations (checked in order)

1. **Project-local**: OpenCode walks up from the current working directory to the git worktree root, loading:
   - `.opencode/skills/*/SKILL.md`
   - `.claude/skills/*/SKILL.md`
   - `.agents/skills/*/SKILL.md`
2. **Global** (user home):
   - `~/.config/opencode/skills/*/SKILL.md`
   - `~/.claude/skills/*/SKILL.md`
   - `~/.agents/skills/*/SKILL.md`

Project-local skills are preferred. For Rental Platform OS, all skills live in `.opencode/skills/`.

### How Skills Are Loaded

- Skills are **not loaded upfront**. Agents see the skill list (name + description) and load on demand.
- When loaded, the full Markdown body is injected into the system prompt.
- In Oh My OpenCode task delegation: `load_skills=["skill-name"]` passes the skill to the subagent.

```typescript
// Subagent receives the skill content in its system prompt
task(
  (category = "quick"),
  (load_skills = ["rental-platform-os-rules", "doc-navigator"]),
  (prompt = "..."),
  (run_in_background = false),
);
```

## Validation Rules (Will Fail If Violated)

1. **Name mismatch**: `name` field MUST equal directory name. `skill-writer/SKILL.md` must have `name: skill-writer`.
2. **Description too short**: Minimum 20 characters.
3. **Missing required fields**: `name` and `description` are mandatory.
4. **No SKILL.md**: Directory without SKILL.md is silently ignored.

## Writing Effective Skill Content

### Principles (Learned from Building 5 Rental Platform OS Skills)

1. **Write TO the agent, not about the agent.** The content becomes the system prompt. Use imperative instructions: "Always use...", "Never do...", "When X, do Y."

2. **Be a reference, not a tutorial.** Agents need quick lookup, not explanations. Use tables, lists, and code blocks. Minimize prose.

3. **Include the rules, not just pointers to rules.** Don't say "see doc X for rules." Copy the actual rules into the skill. Agents skip files that aren't directly in front of them.

4. **Reference docs by section header, not line number.** Line numbers break on edits. Section headers are stable: `notes/02-data-models.md — Section "F. Lead"`.

5. **Don't duplicate everything.** Skills complement docs, they don't replace them. Include: critical patterns, rules, code templates. Don't include: full entity descriptions, every field definition.

6. **Include code patterns agents can copy.** Real code is better than descriptions of code. Show the exact import, function signature, and pattern.

7. **Keep it scannable.** If an agent can't find what it needs in 5 seconds, the skill is too dense. Use clear headers, tables, and short sections.

### Sizing Guidelines

| Skill Type         | Lines   | Content                                    |
| ------------------ | ------- | ------------------------------------------ |
| Reference map      | 80-120  | Tables of pointers, section guides         |
| Rule set           | 150-200 | Organized rules with code examples         |
| Architecture guide | 200-300 | Patterns, code templates, decision context |
| Template/workflow  | 100-150 | Template + example + guidelines            |
| Meta-skill         | 150-200 | Format spec + examples + best practices    |

### Anti-Patterns

| Don't                                       | Why                                                    |
| ------------------------------------------- | ------------------------------------------------------ |
| Dump entire file contents into skill        | Bloats system prompt, agent can read files itself      |
| Use exact line numbers                      | Break on every edit                                    |
| Write paragraphs of explanation             | Agents scan, they don't read novels                    |
| Include information the agent already knows | Wastes tokens (e.g., don't explain what TypeScript is) |
| Omit code patterns                          | Agents will guess and get it wrong                     |

## Rental Platform OS Skill Set Architecture

This project has 12 skills. Each has a distinct purpose with zero overlap:

| Skill                | Purpose                                                                                                                                                           | Agents Use It When                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `doc-navigator`      | Find, write, and maintain docs — maps 24 docs, cross-linking convention, grep-based link maintenance                                                              | Finding docs, writing new docs, maintaining cross-links                             |
| `task-planner`       | Plan Mode (create Phase/Epic/Task hierarchy) + Execute Mode (run tasks with verification)                                                                         | Planning implementation work or executing a task spec                               |
| `rental-platform-os-rules`   | Hard project conventions (data formats, status transitions, auth, imports)                                                                                        | Writing ANY code — these are the non-negotiable rules                               |
| `rental-platform-os-arch`    | Architecture patterns (functions.ts, auth helpers, Actions, HTTP Router, file upload)                                                                             | Implementing Convex functions, understanding project structure                      |
| `convex-api`         | Convex platform API (validators, queries, indexes, pagination, storage, components, rate-limiter, aggregate)                                                      | Writing ANY Convex function — the API cheat sheet                                   |
| `doc-reconciler`     | Detect and fix doc drift against code — truth map, audit workflow, compliance checks                                                                              | After implementing features, periodic audits, creating new docs                     |
| `reference-parser`   | Parse external codebases, correlate to Rental Platform OS, update docs + tasks. **Check `reference/README.md` Completed Merges table first — `demorentalsrentals/` is DONE.** | When NEW reference code is added to `reference/`. NOT for already-merged codebases. |
| `verification-agent` | Systematic feature verification via Playwright browser automation, Context7 docs lookup, and code inspection. Templates in `references/` subdirectory.            | Verifying implemented features, debugging failures, writing bug reports             |
| `bug-tracker`        | Track, file, look up, and manage bugs in `bugs/` — report format, severity, status lifecycle, lookup-before-debug protocol                                        | Filing bugs, checking known bugs before debugging, updating bug status              |
| `bug-reporter`       | Two-way bug workflow — report bugs via branch+PR from any checkout, and import/validate/merge incoming bug PRs into master list                                   | Co-dev filing bugs via PR, or maintainer importing bug PRs into main                |
| `test-history`       | Record and query test history in `verification/` — coverage map, dedup protocol, result recording                                                                 | Recording test results, checking what's been tested, avoiding re-testing            |
| `skill-writer`       | This skill — how to create/update OpenCode skills                                                                                                                 | Adding a new skill or modifying existing ones                                       |

### When Adding a New Skill

1. Check it doesn't overlap with an existing skill's purpose
2. Create directory: `.opencode/skills/{name}/`
3. Write `SKILL.md` with proper frontmatter
4. Add supporting files to `scripts/`, `references/`, `assets/` if needed
5. Test by loading it: `load_skills=["name"]`
6. Update this table if adding to the Rental Platform OS set
