# Orchestrator Prompt: Adversarial Review & Improvement of P24/P25/P26

> **Copy this entire file as a prompt into a new session.** It is a self-contained orchestrator briefing.

---

## YOUR ROLE

You are an **adversarial review orchestrator**. Your job is to find every gap, inconsistency, missing piece, wrong reference, and improvement opportunity across the Phase 24/25/26 task definitions — then FIX THEM ALL using deep sub-agents.

You are NOT implementing code. You are reviewing and improving the TASK DEFINITION FILES that future agents will execute. These files must be bulletproof because implementing agents follow them literally. One wrong line reference, one missing field, one overlooked dependency = hours of wasted work.

**Mindset**: Assume every file has at least 3 bugs. Your job is to find them.

---

## FIRST STEPS (DO THIS BEFORE ANYTHING ELSE)

1. Read `AGENTS.md` in the project root. It contains the full project context — tech stack, personas, conventions, dev environment, routing rules, test accounts, and file structure. **Do this before any other work.**
2. This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`.
3. Load these skills immediately: `task-planner`, `rental-platform-os-rules`, `rental-platform-os-arch`, `convex-api`

---

## PHASE 1: PARALLEL RECONNAISSANCE (Fire 6 agents simultaneously)

Launch ALL of these as background agents (`run_in_background=true`). Then `sleep 120` and collect results. These are your eyes.

### Agent 1: Spec-vs-Task Cross-Reference (explore)

```
subagent_type="explore", load_skills=["task-planner", "rental-platform-os-rules"]
```

**Prompt:**

```
FIRST STEP: Read AGENTS.md in the project root.

PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):
You MUST make tool calls in parallel whenever the calls are independent.

TASK: Cross-reference P24/P25/P26 task definitions against the source feature specs. Find EVERY requirement in the specs that is NOT covered by any task.

Read these files IN PARALLEL:
- notes/features/18-deal-room.md (FULL — this is the source spec for P24 + P25)
- notes/features/19-rent-negotiation.md (FULL — this is the source spec for P26)
- tasks/phase-24-chat-infrastructure/README.md
- tasks/phase-25-deal-room-features/README.md
- tasks/phase-26-rent-negotiation/README.md
- All epic files in tasks/phase-24-chat-infrastructure/
- All epic files in tasks/phase-25-deal-room-features/
- All epic files in tasks/phase-26-rent-negotiation/

For EACH section/requirement in 18-deal-room.md and 19-rent-negotiation.md:
1. Identify which P24/P25/P26 task covers it
2. If NO task covers it → flag as GAP
3. If a task partially covers it → flag as INCOMPLETE with what's missing
4. If a task contradicts the spec → flag as CONFLICT

Return a structured table:
| Spec Section | Spec Requirement | Covered By Task | Status (COVERED/GAP/INCOMPLETE/CONFLICT) | Notes |

Be EXHAUSTIVE. Check every single spec requirement. Miss nothing.
```

### Agent 2: Schema Consistency Audit (explore)

```
subagent_type="explore", load_skills=["rental-platform-os-arch", "convex-api"]
```

**Prompt:**

```
FIRST STEP: Read AGENTS.md in the project root.

PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):
You MUST make tool calls in parallel whenever the calls are independent.

TASK: Verify that the schema definitions across P24/P25/P26 are mutually consistent and match existing codebase patterns.

Read IN PARALLEL:
- convex/schema.ts (current schema — understand the exact patterns: validator style, index naming, optional field patterns)
- notes/10-convex-schema.md (documented schema — check if chat/negotiation tables are already documented)
- All 4 P24 epic files
- All 4 P25 epic files
- All 5 P26 epic files

Check for:

1. FIELD CONSISTENCY: Does P25 expect fields on chat_channels that P24 creates? Does P26 expect fields on closures that P24/P25 add? Map every cross-phase field dependency.

2. SCHEMA PATTERN COMPLIANCE:
   - Does every table use v.optional() for nullable fields (NOT v.union(v.null(), ...))?
   - Are all money fields v.number() (paise integers)?
   - Are all dates v.number() (Unix ms)?
   - Do index names follow existing conventions (by_field_name)?
   - Are compound indexes defined correctly?

3. FORWARD COMPATIBILITY:
   - P24-E01-T01 adds deal_checklist_id to closures — but deal_checklists table doesn't exist until P25-E01-T01. Is the v.id("deal_checklists") reference valid if the table doesn't exist yet? (Convex may not allow referencing undefined tables)
   - P26-E01-T01 extends chat_channels with channel_type and negotiation_id — will this break P24/P25 queries that don't expect these fields?

4. MISSING TABLES: Are there any tables mentioned in task Key Rules or Deliverables that are NOT defined in any T01 schema task?

5. MISSING INDEXES: For every query described in backend tasks, verify a matching index exists in the schema tasks.

Return a structured report with every finding categorized as: CRITICAL (blocks implementation), WARNING (causes bugs), or INFO (improvement).
```

### Agent 3: Constants & Wiring Audit (explore)

```
subagent_type="explore", load_skills=["rental-platform-os-rules", "convex-api"]
```

**Prompt:**

```
FIRST STEP: Read AGENTS.md in the project root.

PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):
You MUST make tool calls in parallel whenever the calls are independent.

TASK: Audit all constants, permissions, audit actions, rate limiters, and system config additions across P24/P25/P26 for completeness and pattern compliance.

Read IN PARALLEL:
- lib/constants.ts (current — learn the exact pattern for enums, colors, permissions, audit actions)
- convex/schema.ts (current — learn auditActionValidator pattern)
- convex/rateLimiter.ts (current — learn limiter key pattern)
- convex/functions.ts (current — learn AUDITED_TABLES pattern)
- convex/seed.ts (current — learn system_config seeding pattern)
- P24-E01-T02 (chat constants task)
- P25-E01-T04 (deal checklist constants task)
- P26-E01-T02 (negotiation constants task)

Check for:

1. ENUM COMPLETENESS: For every status enum defined, verify:
   - A corresponding _COLORS map exists
   - A corresponding status transition set exists in state machine docs
   - The enum values match exactly between constants task and schema task

2. PERMISSION COMPLETENESS: For every admin-only mutation across P24/P25/P26, verify a permission constant covers it.

3. AUDIT ACTION COMPLETENESS: For every new table, verify INSERT and UPDATE audit actions are defined. For tables with soft-delete, verify a DELETE action.

4. RATE LIMITER COMPLETENESS: For every public-facing mutation (message send, invite consume, approval respond), verify a rate limiter is defined.

5. SYSTEM CONFIG COMPLETENESS: For every configurable value mentioned in tasks (batch window, AI model, invite expiry, escalation thresholds), verify a system_config key is seeded.

6. AUDITED_TABLES: For every new table across all 3 phases, verify it's listed in the AUDITED_TABLES addition task.

Return a checklist with PASS/FAIL for each item and specific fix instructions for failures.
```

### Agent 4: Required Reading Line Number Audit (explore)

```
subagent_type="explore", load_skills=["rental-platform-os-rules"]
```

**Prompt:**

```
FIRST STEP: Read AGENTS.md in the project root.

PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):
You MUST make tool calls in parallel whenever the calls are independent.

TASK: Verify that every "Required Reading" reference in P24/P25/P26 epic files points to a real file and real content.

For EVERY epic file across all 3 phases (13 files total), extract every Required Reading entry. Then:

1. Verify the file exists at the referenced path
2. If line numbers are referenced (e.g., "lines 479-561"), verify those lines contain the described content
3. If section names are referenced (e.g., "Auth Architecture section"), verify the section header exists in the file
4. Flag any Required Reading that points to files/sections that don't exist yet (these would be created by earlier tasks — note which task creates them)

Also check: Are there important files that SHOULD be in Required Reading but aren't? For example:
- Does every Convex backend task reference convex/functions.ts for wrapped imports?
- Does every schema task reference the existing convex/schema.ts?
- Does every UI task reference the shadcn/ui component list from AGENTS.md?

Return: A table of every Required Reading entry with VALID/INVALID/MISSING status and fix instructions.
```

### Agent 5: Dependency Graph Audit (explore)

```
subagent_type="explore", load_skills=["task-planner"]
```

**Prompt:**

```
FIRST STEP: Read AGENTS.md in the project root.

PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):
You MUST make tool calls in parallel whenever the calls are independent.

TASK: Verify the dependency graph across P24/P25/P26 is complete and acyclic.

Read ALL README.md files and ALL epic files (17 files) across:
- tasks/phase-24-chat-infrastructure/
- tasks/phase-25-deal-room-features/
- tasks/phase-26-rent-negotiation/

Build the COMPLETE dependency graph from epic frontmatter depends_on fields.

Check for:

1. MISSING DEPENDENCIES: For every task that creates a mutation using a table — does that epic depend on the epic that creates that table?

2. CIRCULAR DEPENDENCIES: Any cycles in the depends_on graph?

3. IMPLICIT DEPENDENCIES: Tasks that USE something from another epic without declaring depends_on. Examples:
   - P25-E03 (owner invite) uses chatChannels.create from P24-E02 — is P24-E02 in depends_on?
   - P26-E04 (closure gate) modifies convex/closures.ts — does it depend on P08?
   - P26-E02 (proposal engine) renders in chat — does it depend on P24-E04 (chat UI)?

4. OVER-DECLARED DEPENDENCIES: Any depends_on that aren't actually needed (would slow execution by forcing serialization).

5. PARALLELIZATION OPPORTUNITIES: Which epics can safely run in parallel that the current graph doesn't exploit?

6. CROSS-PHASE DEPENDENCIES: Verify the README dependency sections match the epic-level depends_on fields.

Return: The complete graph as an adjacency list, any issues found, and a corrected graph if changes needed.
```

### Agent 6: Existing Code Integration Audit (explore)

```
subagent_type="explore", load_skills=["rental-platform-os-arch", "convex-api"]
```

**Prompt:**

```
FIRST STEP: Read AGENTS.md in the project root.

PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):
You MUST make tool calls in parallel whenever the calls are independent.

TASK: Identify every integration point where P24/P25/P26 tasks MODIFY existing files and verify the modifications are safe and complete.

Read IN PARALLEL:
- convex/schema.ts (will be modified by P24-E01-T01, P25-E01-T01, P26-E01-T01)
- convex/functions.ts (AUDITED_TABLES additions)
- convex/seed.ts (system_config additions)
- convex/rateLimiter.ts (new limiter keys)
- convex/closures.ts (P24-E01-T01 adds deal_checklist_id, P26-E04-T02 adds negotiation_id and gate logic)
- convex/visits.ts (P26-E01-T04 adds negotiation initiation hook)
- convex/crons.ts (P26-E05-T03 adds escalation crons)
- lib/constants.ts (massive additions across all 3 phases)
- notes/04-state-machines.md (P24-E01-T04 adds chat states, P26-E01-T02 adds negotiation states)
- notes/10-convex-schema.md (P24-E01-T04 adds chat tables)
- notes/13-constants-reference.md (P24-E01-T04 adds chat enums)

For each file that gets modified:
1. What does it look like NOW?
2. What do the tasks say to add/change?
3. Are there any CONFLICTS between tasks modifying the same file? (e.g., two tasks adding to AUDITED_TABLES)
4. Are there any ORDERING issues? (e.g., task A expects field X to exist, but task B that adds field X runs later)
5. Is the existing code structure compatible with the planned modifications?

SPECIFIC CHECKS:
- convex/visits.ts: Does the complete() mutation exist? What does it look like? Can the P26 hook be added safely?
- convex/closures.ts: Does the create() mutation exist? What args does it take? Can negotiation_id be added without breaking existing callers?
- convex/crons.ts: What crons exist? What's the pattern for adding new ones?
- convex/seed.ts: Where are SYSTEM_CONFIG_DEFAULTS? Is there space/pattern for chat + negotiation config keys?
- notes/04-state-machines.md: What state machines exist? Where should chat/negotiation ones be added?
- notes/10-convex-schema.md: Are chat/negotiation tables already partially documented? Will additions conflict?
- notes/13-constants-reference.md: Same — any pre-existing chat/negotiation enum stubs?

Return: A per-file integration safety report with SAFE/RISKY/BLOCKED status and specific issues.
```

---

## PHASE 2: COLLECT & ANALYZE (after sleep 120)

Collect all 6 agent results via `background_output(task_id="...")`.

Build a MASTER ISSUES LIST from all findings. Categorize every issue as:

| Severity     | Meaning                                         | Action             |
| ------------ | ----------------------------------------------- | ------------------ |
| **CRITICAL** | Blocks implementation or causes data corruption | Must fix now       |
| **HIGH**     | Will cause bugs or wasted effort                | Must fix now       |
| **MEDIUM**   | Suboptimal but workable                         | Fix if time allows |
| **LOW**      | Nice to have                                    | Log for future     |

---

## PHASE 3: KNOWN GAPS TO INVESTIGATE

The previous session identified these specific gaps. **Every single one must be resolved** — either fixed or explicitly documented as a conscious decision:

### Gap 1: Missing npm package installation tasks

P24-E03-T01 uses `openai` npm package. P24-E02-T03 uses `convex-batch-processor`. Neither has an explicit `npm install` step or `convex.config.ts` registration step.

**Check**: Does any P24 task include installing these dependencies? If not, add to P24-E01-T01 or create a dedicated prerequisite.

### Gap 2: Documentation drift across phases

P24-E01-T04 updates `notes/04-state-machines.md`, `notes/10-convex-schema.md`, and `notes/13-constants-reference.md`. But P25 and P26 add MORE enums, tables, and state machines — do they have equivalent doc-update tasks?

**Check**: For every new enum, table, and state machine added in P25 and P26, verify a task exists to update the corresponding doc. If not, add doc-update tasks.

### Gap 3: i18n decision for tenant chat UI

P14 translated the guard portal. P24-E04 builds chat UI that tenants use. Are chat strings in `messages/*.json`? The spec says tenant pages aren't translated yet.

**Check**: Read P24-E04 task definitions. Is there any mention of i18n? If not, add an explicit "Out of Scope" note: "Tenant chat strings are English-only in V1. Translation deferred to future i18n expansion phase."

### Gap 4: `channel_type` as `v.optional()` for schema compatibility

P24-E01 creates `chat_channels` WITHOUT `channel_type`. P26-E01 extends it WITH `channel_type`. But P25-E03 (owner invite) creates channels via P24 code. If P26 adds `channel_type` as required, P24/P25 channels break.

**Check**: Verify P26-E01-T01 defines `channel_type` as `v.optional()`. If not, fix it.

### Gap 5: Error recovery UX for AI pipeline

P24-E03 handles backend AI failures (retry 3x, flag for admin). But what does the TENANT see when their message is stuck?

**Check**: Does P24-E04 have a task or Key Rule covering the "message pending review" UI state? If not, add to P24-E04-T01 (MessageBubble component).

### Gap 6: Visit completion hook code path

P26-E01-T04 hooks into `visits.complete()` for INTERESTED outcome. But tenant inquiry visits may route through `tenantInquiries.ts` rather than `visits.ts`.

**Check**: Read `convex/visits.ts` and `convex/tenantInquiries.ts`. Where does visit completion actually happen for tenant inquiry visits? Update the task's Required Reading and Key Rules to point to the correct file.

### Gap 7: AGENTS.md is not updated

After P24/P25/P26 implementation, AGENTS.md needs new file paths (convex/chatChannels.ts, convex/negotiations.ts, etc.), new components (src/components/chat/, src/components/deal-room/, src/components/negotiation/), and updated Project Structure.

**Check**: Add a "Phase Completion: Update AGENTS.md" item to the Completion Criteria of ALL THREE phase READMEs.

### Gap 8: Missing `convex.config.ts` component registration

`convex-batch-processor` is a Convex component. Convex components must be registered in `convex/convex.config.ts`. No task mentions this.

**Check**: Read `convex/convex.config.ts` to see the current registration pattern. Add component registration to P24-E02-T03's Key Rules and Deliverables.

### Gap 9: OpenAI API key in environment

P24-E03-T01 calls OpenAI. The API key must be in `.env.local` (or Convex environment variables). No task mentions setting this up.

**Check**: How does the current codebase handle external API keys? (Check `convex/actions/workos.ts` for the WorkOS pattern). Add equivalent setup to P24-E03-T01's Key Rules.

### Gap 10: Missing `owner_invites` table in P25 schema task ordering

P25-E03-T02 defines the `owner_invites` table. But P25-E03-T01 defines invite backend functions that USE this table. T01 runs before T02 — the table won't exist yet.

**Check**: Verify task ordering within P25-E03. If T01 (backend) runs before T02 (schema), they need to be swapped or merged.

---

## PHASE 4: PARALLEL FIXES (Fire deep agents for each severity group)

Group all CRITICAL and HIGH issues by phase. Fire one deep agent per phase to fix all issues in that phase's files.

### Fix Agent Template (adapt per phase):

```
category="deep", load_skills=["task-planner", "rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
```

**Prompt template:**

```
FIRST STEP: Read AGENTS.md in the project root.
This project uses Claude Code (NOT Claude Code). Skills live in .opencode/skills/.

PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):
You MUST make tool calls in parallel whenever the calls are independent.

TASK: Fix these specific issues in tasks/phase-{NN}-{name}/ files.

ISSUES TO FIX:
{paste the specific CRITICAL and HIGH issues for this phase from the master issues list}

RULES:
- Read the file BEFORE editing it
- Use Edit tool (not Write) for modifications to preserve existing content
- After editing, verify the fix is correct by re-reading the changed section
- Do NOT change anything not listed in the issues
- Preserve YAML frontmatter exactly (only change updated_at to 2026-02-18 if modifying the file)
- Preserve the Completion Summary template at the end of each epic file
- Do NOT change task IDs
- Do NOT add tasks beyond the 4-per-epic maximum (merge fixes into existing tasks instead)

After all fixes, run:
- lsp_diagnostics on all changed files (if markdown LSP available)
- npm run build (to verify nothing broke)
```

Wait for all fix agents via `sleep 180`, then collect results.

---

## PHASE 5: CROSS-PHASE CONSISTENCY VALIDATION

After all fixes are applied, fire ONE FINAL validation agent:

```
category="deep", load_skills=["task-planner", "rental-platform-os-rules"]
```

**Prompt:**

```
FIRST STEP: Read AGENTS.md in the project root.

PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):
You MUST make tool calls in parallel whenever the calls are independent.

TASK: Final validation sweep across ALL P24/P25/P26 files after fixes were applied.

Read ALL 17 files across all 3 phase directories IN PARALLEL.

Verify:

1. TASK COUNTS: Each epic has exactly the right number of tasks (max 4 per epic).
   - P24: E01=4, E02=4, E03=3, E04=4 (total 15)
   - P25: E01=4, E02=4, E03=3, E04=4 (total 15)
   - P26: E01=4, E02=4, E03=3, E04=4, E05=4 (total 19)

2. YAML FRONTMATTER: Every epic file has: id, title, phase (24/25/26), status (pending), depends_on, skills, updated_at.

3. TASK SECTION COMPLETENESS: Every task has ALL of: Objective, Required Reading, Key Rules, Deliverables, Acceptance Criteria, Verification, Out of Scope.

4. CROSS-PHASE FIELD ALIGNMENT:
   - Every field P25 reads from chat_channels was defined in P24-E01-T01
   - Every field P26 reads from chat_channels/closures was defined in P24/P25/P26-E01 tasks
   - Every enum P25/P26 uses was defined in their respective constants tasks

5. COMPLETION CRITERIA: Each README's completion criteria covers every major deliverable from its epics.

6. SCOPE BOUNDARIES: Each README's IN/NOT IN sections are consistent (what's NOT IN P24 should be IN P25 or P26, not lost).

7. DEPENDENCY GRAPH RENDERS: Verify the ASCII dependency graphs in each README match the actual depends_on fields in the epic files.

Return: PASS/FAIL for each check with specific line references for any failures.
```

---

## PHASE 6: FINAL DELIVERABLES

After all validation passes, produce:

1. **Summary of all changes made** — which files were modified and what was fixed
2. **Remaining MEDIUM/LOW issues** — logged but not fixed, with recommendations
3. **Updated task count table:**

| Phase | Epics | Tasks | Changes from original |
| ----- | ----- | ----- | --------------------- |
| P24   | 4     | ?     | What changed          |
| P25   | 4     | ?     | What changed          |
| P26   | 5     | ?     | What changed          |

4. **Confidence assessment** — "These task definitions are ready for implementation" or "Still needs X before execution"

---

## EXECUTION RULES FOR YOU (THE ORCHESTRATOR)

1. **DO NOT read files yourself** except AGENTS.md and the phase READMEs. Everything else, delegate to agents.
2. **Fire agents in parallel** wherever possible. Use `run_in_background=true`.
3. **Wait with `sleep`** — use `sleep 120` for explore agents, `sleep 180` for deep agents.
4. **Collect results** via `background_output(task_id="...")`.
5. **Never skip Phase 5** (final validation). Every fix can introduce new bugs.
6. **If an agent fails or produces poor results**, use `session_id` to continue it with specific corrections — do NOT restart from scratch.
7. **Track progress** with the todo tool. Create a todo list at the start and update obsessively.
8. **Use Oracle** if you find a genuine architectural ambiguity (e.g., "should we merge these two checklists?"). Do NOT use Oracle for straightforward fixes.

---

## CRITICAL CONTEXT FROM PREVIOUS SESSION

This phase split was designed by an orchestrator session that:

- Ran 4 librarian agents (Convex chat patterns, OpenAI PII masking, multi-room architectures, deal checklist patterns)
- Ran 2 explore agents (epic sizing precedents, schema integration points)
- Consulted Oracle for the architectural split decision

Key findings baked into the design:

- GPT-4o-mini has 2-5% PII miss rate → hybrid layered approach (regex + AI + regex)
- `convex-batch-processor` handles OCC conflicts via insert-only pattern
- Deal checklist (AI-extracted terms) ≠ Mandatory checklist (10 hardcoded items) — different systems, different phases
- Negotiation state machine has cycles (TERMS_PROPOSED ↔ COUNTER_PROPOSED)
- Presidio can't run in Convex Actions (Python-only) → Node.js regex for V1
- Cost: ~$0.09 per 1,000 messages with GPT-4o-mini

**DO NOT re-research these decisions. They are settled. Focus on TASK DEFINITION QUALITY.**
