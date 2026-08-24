# P32 Adversarial Validation — Orchestrator Prompt

> Copy-paste this entire prompt into a fresh Claude Code session.
> Estimated runtime: 30-60 minutes (multiple Oracle + Deep agent rounds).

---

## YOUR ROLE

You are a **validation orchestrator** for Phase 32 (Incentive v3) — the largest implementation in this codebase. Your job is **adversarial**: find everything wrong, misaligned, under-tested, or subtly broken. You do NOT build features. You tear them apart, then dispatch fix agents.

**FIRST STEP**: Read `AGENTS.md` in the project root. It contains the full project context. Do this before any other work.

This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`.

---

## PHASE 32 SCOPE (What You're Validating)

Incentive v3 is a multi-persona commission and gamification engine with 5 epics:

| Epic | What                                              | Key Files                                                                                   | Lines  |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| E01  | Core engine + config versioning                   | `convex/incentiveConfig.ts`, `convex/incentiveActors.ts`, `convex/seed.ts`                  | ~600   |
| E02  | Commission engine + modifiers                     | `convex/commissionEngine.ts`, `convex/commissionModifierTemplates.ts`                       | ~1,600 |
| E03  | Multi-contributor attribution                     | `convex/attribution.ts`, `convex/dealContributions.ts`, `convex/incentiveDisbursements.ts`  | ~1,730 |
| E04  | Gamification (XP, levels, tiers, quests, streaks) | `convex/gamification.ts`, `convex/crons.ts`                                                 | ~786   |
| E05  | Shadow mode rollout + migration                   | `convex/shadowMode.ts`, `convex/shadowRollout.ts`, `convex/actions/backfillShadowDeltas.ts` | ~1,133 |

**Cross-cutting**: `convex/closures.ts` (1,281 lines — has shadow trigger + attribution hooks + XP hooks), `convex/visits.ts` (1,119 lines — has support contribution + XP hooks), `convex/verifications.ts` (XP hook), `convex/functions.ts` (audit wiring for 12 tables).

**Frontend**: 8 admin tabs in `src/components/admin/incentive-settings/`, 3 shared widgets, 1 OPS card. ~6,300 lines total.

**Tests**: `convex/incentiveV3.test.ts` — 68 property tests, 2,507 lines.

**Specs**: 4 feature docs (~1,613 lines) + 5 task files.

---

## EXECUTION PROTOCOL

### Step 0: Context Gathering (YOU do this — read files directly)

Read these files IN PARALLEL to build your mental model before launching Oracles:

**Batch 1 — Schema + Constants (the source of truth):**

```
convex/schema.ts              — Find all 12 V3 tables (search for "incentive_", "commission_", "deal_", "gamification_", "shadow_", "attribution_")
lib/constants.ts              — Find all V3 enums (search for INCENTIVE_PERSONA, MODIFIER_RULE_TYPE, COMMISSION_, CONTRIBUTION_, ATTRIBUTION_, DISBURSEMENT_, WEEKLY_TIER, QUEST_, XP_AWARDS, STREAK_, BADGE_CODE_V3, SHADOW_MODE)
```

**Batch 2 — Feature specs (the intent):**

```
notes/features/24-incentive-v3-overview.md    — Master architecture, canonical schema, config versioning
notes/features/25-commission-engine.md        — Commission formula, modifier framework
notes/features/26-multi-contributor-attribution.md  — Stage weights, empty-stage handling, split rounding
notes/features/27-ops-gamification.md         — XP/levels, tiers, quests, streaks, badges
```

**Batch 3 — Core backend (the implementation):**

```
convex/commissionEngine.ts      — evaluateCommissionForClosure, buildEvaluation, applyModifierComposition, computeMetric
convex/attribution.ts           — computeAttribution (largest-remainder rounding), finalizeAttribution, disputeAttribution
convex/gamification.ts          — awardXp, getLevelFromTotalXp, recalculateWeeklyTiers, checkDailyStreaks
convex/shadowMode.ts            — getAggregateVariance, listDeltas, queryByEntityType
convex/shadowRollout.ts         — parseRolloutPolicy, migrateGuardToV3, checkDecommissionReadiness, decommissionV2Shadow
convex/incentiveDisbursements.ts — createFromSplit (anti-double-pay), persona gate
convex/dealContributions.ts     — logContribution (idempotent via event_key)
```

**Batch 4 — Integration hooks (where V3 wires into existing system):**

```
convex/closures.ts              — Search for "shadow_mode", "evaluateCommission", "logContribution", "computeAttribution", "finalizeAttribution", "awardXp"
convex/visits.ts                — Search for "logContribution", "awardXp", "SUPPORT"
convex/verifications.ts         — Search for "awardXp"
convex/crons.ts                 — Search for "gamification", "recalculateWeeklyTiers", "resetDailyQuests", "checkDailyStreaks", "refillMonthlyFreezes"
convex/functions.ts             — Search for "incentive_actor_profiles", "incentive_config_versions", "deal_commission_evaluations", "commission_modifier_templates", "deal_contributions", "attribution_records", "attribution_splits", "incentive_disbursements", "gamification_profiles", "gamification_quests", "user_quest_progress", "shadow_mode_deltas"
```

**Batch 5 — Tests + decisions:**

```
convex/incentiveV3.test.ts      — All 68 tests, look for coverage gaps
notes/04-state-machines.md      — Search for "V3" and "incentive" lifecycle transitions
notes/12-decisions-log.md       — Search for "incentive", "commission", "attribution", "gamification" for rationale
```

**DO NOT READ FRONTEND FILES YET.** Oracles review backend first. Frontend Oracle reads its own files.

### Step 1: Launch 6 Adversarial Oracles (ALL IN PARALLEL)

Fire ALL 6 as `run_in_background=true`. Each Oracle gets a specific adversarial domain. Use `subagent_type="oracle"`.

**CRITICAL**: Every Oracle prompt MUST start with:

```
FIRST STEP: Read `AGENTS.md` in the project root. It contains the full project context.
This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`.
```

---

#### Oracle 1: Schema & Data Integrity

```
ADVERSARIAL REVIEW: Schema & Data Integrity for Incentive v3 (Phase 32)

You are reviewing 12 new database tables added to `convex/schema.ts` for a multi-persona commission + gamification engine.

READ these files IN PARALLEL:
- convex/schema.ts — find ALL tables: incentive_actor_profiles, incentive_config_versions, deal_commission_evaluations, commission_modifier_templates, deal_contributions, attribution_records, attribution_splits, incentive_disbursements, gamification_profiles, gamification_quests, user_quest_progress, shadow_mode_deltas
- notes/features/24-incentive-v3-overview.md — canonical schema section (source of truth for table design)
- lib/constants.ts — all V3 validators and enums
- convex/functions.ts — audit trigger wiring for all 12 tables

ATTACK VECTORS (check every one):
1. INDEX GAPS: For every query that filters or sorts, verify a supporting index exists. Cross-reference actual queries in commissionEngine.ts, attribution.ts, gamification.ts, shadowMode.ts, shadowRollout.ts, incentiveDisbursements.ts, dealContributions.ts against schema indexes.
2. MISSING FIELDS: Compare schema tables field-by-field against the canonical schema in 24-incentive-v3-overview.md. Flag any drift.
3. VALIDATOR MISMATCHES: Verify every enum used in schema validators matches the constant definitions in lib/constants.ts. Look for typos, missing values, extra values.
4. SOFT DELETE: All 12 tables should have `is_deleted: v.optional(v.boolean())` or follow project soft-delete convention. Check each.
5. FOREIGN KEY INTEGRITY: Trace every `v.id("table_name")` reference — does the target table exist? Are there orphan risk scenarios?
6. AUDIT COVERAGE: Every table in functions.ts audit config? Any missing?
7. INDEX KEY ORDER: Convex indexes are ordered. Verify index key order matches query patterns (most selective first).
8. MONEY FIELDS: Every money field must be integer paise. Search for any float-typed money fields.
9. TIMESTAMP FIELDS: All should be `v.number()` for Unix ms. No string dates.
10. OPTIONAL vs REQUIRED: Flag any field that's required in schema but optional in the spec (or vice versa).

OUTPUT FORMAT:
For each finding:
- SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
- FILE: exact file path
- LOCATION: table name + field name or index name
- ISSUE: what's wrong
- FIX: exactly what to change
```

---

#### Oracle 2: Commission Engine Correctness

```
ADVERSARIAL REVIEW: Commission Engine Correctness for Incentive v3

You are reviewing the core commission calculation engine — the most financially sensitive code in the system. Any bug here means wrong payouts.

READ these files IN PARALLEL:
- convex/commissionEngine.ts (1,595 lines) — THE critical file. Read ALL of it.
- notes/features/25-commission-engine.md — the spec
- convex/schema.ts — deal_commission_evaluations and commission_modifier_templates tables
- lib/constants.ts — MODIFIER_RULE_TYPE, COMMISSION_METRIC_SOURCE, COMMISSION_EVAL_STATUS, COMMISSION_BOUNDS
- convex/closures.ts — search for "evaluateCommission" to see how the engine is invoked

ATTACK VECTORS:
1. FORMULA CORRECTNESS: The commission formula is `pool = max(0, floor(profit * effective_rate_bps / 10000) + flat_bonus_paise)`. Trace through buildEvaluation() and verify this EXACTLY. Any deviation is CRITICAL.
2. ROUNDING: All paise calculations MUST use Math.floor, never Math.round or Math.ceil. Verify every arithmetic operation. Floating point drift in BPS calculations?
3. MODIFIER COMPOSITION: AND_GROUP (all must pass), OR_GROUP (any passes), INDIVIDUAL (standalone). Trace applyModifierComposition() — does it handle all 3 modes correctly? What happens with empty groups? Mixed modes?
4. RATE CLAMPING: effective_rate_bps must be clamped to [min_rate_bps, max_rate_bps] from config. Verify the clamp function and where it's applied. Is it applied AFTER modifier adjustments?
5. ZERO/NEGATIVE PROFIT: What happens when closure has zero or negative profit? Does deriveProfitPaise handle this? Does the formula produce 0 (not negative)?
6. CONFIG SNAPSHOT: When evaluate() is called, it should read config from the specific config_version_id, NOT from the "active" config. Verify this isolation — if active config changes mid-evaluation, old evaluations must not change.
7. METRIC COMPUTATION: computeMetric() computes guard quality metrics. Are the DB queries efficient? Any N+1 patterns? Any query that could timeout on large datasets?
8. MODIFIER TEMPLATE CRUD: Can a modifier template be deleted/archived while referenced by active evaluations? Is there a cascade risk?
9. CONCURRENT EVALUATION: Two closures confirmed simultaneously — any race conditions in evaluation creation?
10. EDGE CASE: Single modifier template with BPS=0 and FLAT=0. Does it correctly produce no adjustment?

OUTPUT FORMAT: Same as Oracle 1 — SEVERITY, FILE, LOCATION, ISSUE, FIX.
```

---

#### Oracle 3: Attribution Algorithm & Disbursement Safety

```
ADVERSARIAL REVIEW: Attribution Algorithm & Disbursement Safety for Incentive v3

You are reviewing the multi-contributor attribution system — which splits commission pools among multiple actors — and the disbursement pipeline that actually creates payout records. Double-pay bugs here are catastrophic.

READ these files IN PARALLEL:
- convex/attribution.ts (1,188 lines) — computeAttribution, finalizeAttribution, largest-remainder rounding
- convex/dealContributions.ts (207 lines) — logContribution (idempotent)
- convex/incentiveDisbursements.ts (335 lines) — createFromSplit (anti-double-pay)
- notes/features/26-multi-contributor-attribution.md — the spec
- convex/closures.ts — search for "logContribution", "computeAttribution", "finalizeAttribution" to see integration
- convex/visits.ts — search for "logContribution" (SUPPORT stage contributions)

ATTACK VECTORS:
1. LARGEST-REMAINDER ROUNDING: The algorithm must ensure sum(split_amounts) == pool_amount_paise EXACTLY. No paise lost, no paise created. Trace the rounding logic step by step. Is the remainder distributed by highest fractional part?
2. STAGE WEIGHTS: DISCOVERY 25%, VERIFICATION 35%, CLOSURE 25%, SUPPORT 15%. These are in BPS (2500, 3500, 2500, 1500). Verify they sum to 10000. Verify the config read pattern.
3. EMPTY STAGE HANDLING: If no contributions in a stage, its weight must redistribute proportionally to non-empty stages. Trace this in computeAttribution(). What if ALL stages are empty? What if only 1 stage has contributions?
4. CONTRIBUTION IDEMPOTENCY: logContribution uses event_key for dedup. Verify the index and the check. Can two different events have the same key? Is the key construction unique enough?
5. ANTI-DOUBLE-PAY (CRITICAL): Two layers:
   a. source_key dedup in createFromSplit — verify the check and index
   b. closure_id + recipient_user_id dedup — verify the check and index
   c. Re-finalization guard in finalizeAttribution — verify it blocks re-running
   For each: What happens under concurrent execution? Is there a TOCTOU race?
6. ATTRIBUTION LIFECYCLE: PROVISIONAL → FINAL → DISPUTED → RESOLVED. Can you go backwards? Can you finalize a DISPUTED record? Trace every status transition.
7. QUALITY SCORE WEIGHTING: contribution_weight = baseWeight * (0.5 + qualityScore/200). Verify formula. What if qualityScore is 0? 100? 200? Negative?
8. OVERRIDE FLOW: Admin can override attribution. Does this create a NEW record or modify the existing? Does the override respect the same rounding invariant?
9. VOID CONTRIBUTION: Can you void a contribution after attribution is FINAL? What cascades?
10. PERSONA DETERMINATION: How is a contributor's persona determined? From incentive_actor_profiles? What if no profile exists?

OUTPUT FORMAT: Same as Oracle 1.
```

---

#### Oracle 4: Gamification Engine & Cron Safety

```
ADVERSARIAL REVIEW: Gamification Engine & Cron Safety for Incentive v3

You are reviewing the XP/level/tier/quest/streak/badge system and its 4 daily cron jobs.

READ these files IN PARALLEL:
- convex/gamification.ts (~684 lines) — full engine
- convex/crons.ts — search for gamification cron registrations
- notes/features/27-ops-gamification.md — the spec
- lib/constants.ts — XP_AWARDS, WEEKLY_TIER_THRESHOLDS, STREAK_MILESTONES, BADGE_CODE_V3, QUEST_REWARD_TYPE, QUEST_SCOPE
- lib/notificationContracts.ts — event interfaces
- convex/closures.ts — search for "awardXp" (200 XP on closure)
- convex/visits.ts — search for "awardXp" (75 XP on visit)
- convex/verifications.ts — search for "awardXp" (50 XP on lead verified)

ATTACK VECTORS:
1. LEVEL CURVE CORRECTNESS: `level<=10: 100*level`, `11-30: 1000+(level-10)*75`, `31+: 2500+floor((level-30)^1.5)*50`. Verify getLevelFromTotalXp() implements this EXACTLY. Test edge cases: 0 XP, exactly 1000 XP (level 10 boundary), exactly 2500 XP (level 30 boundary).
2. XP IDEMPOTENCY: If a closure confirm is retried (Convex can retry mutations), does the guard get double XP? What's the dedup mechanism?
3. CRON TIMING: All 4 crons run at 18:30 UTC = 00:00 IST. Verify:
   a. recalculateWeeklyTiers — should only run on Sundays. Does it check day-of-week? What if it fires on Monday?
   b. resetDailyQuests — marks expired quests. Does it handle timezone correctly?
   c. checkDailyStreaks — decrements/breaks streaks. Freeze deduction logic correct?
   d. refillMonthlyFreezes — should only run on last day of month. Does it check?
4. WEEKLY TIER THRESHOLDS: IRON(0), BRONZE(200), SILVER(500), GOLD(1000), DIAMOND(2000). XP earned THIS WEEK only. Verify the weekly window calculation — does it use Monday-Sunday or Sunday-Saturday? Timezone issues?
5. STREAK FREEZE: 1 free/month, buy more with 500 XP, max 2 additional = 3 total. Verify: Can you buy more than 2? Does the XP deduction work? What if you don't have 500 XP?
6. BADGE DEDUP: Can the same badge be awarded twice? What's the uniqueness constraint?
7. QUEST LIFECYCLE: Created → Active → Completed/Expired. Can a quest be completed after expiry? Can progress be added after completion?
8. CONCURRENT XP AWARDS: Two closures confirmed at the same millisecond for the same guard. Do both XP awards land? Any race on gamification_profiles.total_xp?
9. LEVEL-UP CASCADE: If enough XP is awarded to jump multiple levels (e.g., from level 1 to level 5), does checkAndAwardLevelBadges handle all intermediate badges?
10. NOTIFICATION CONTRACTS: Are the typed event interfaces in notificationContracts.ts consistent with the actual data shapes emitted by gamification.ts?

OUTPUT FORMAT: Same as Oracle 1.
```

---

#### Oracle 5: Shadow Mode & Migration Safety

```
ADVERSARIAL REVIEW: Shadow Mode Rollout & Migration Safety for Incentive v3

You are reviewing the v2→v3 migration system. A bug here could cause payouts to use the wrong source (v2 vs v3), leading to overpay/underpay during transition.

READ these files IN PARALLEL:
- convex/shadowMode.ts (387 lines) — delta queries, aggregation
- convex/shadowRollout.ts (579 lines) — rollout policy, migration toggle, decommission
- convex/actions/backfillShadowDeltas.ts (167 lines) — historical backfill
- convex/closures.ts — search for "shadow_mode" and "INCENTIVE_V3_SHADOW_MODE_ENABLED"
- convex/incentiveDisbursements.ts — search for "rolloutPolicy" and "isPersonaEnabled"
- convex/schema.ts — shadow_mode_deltas table
- convex/incentiveV3.test.ts — search for "Shadow Rollout" describe block

ATTACK VECTORS:
1. SHADOW ISOLATION (CRITICAL): Shadow mode must NEVER affect actual v2 payouts. Trace the entire shadow path in closures.ts confirm handler — is every shadow operation in its own try/catch? Can a shadow failure cascade to break the closure confirm?
2. ROLLOUT STATE MACHINE: OFF → SHADOW → PARTIAL → FULL. Can you skip states? Can you go backwards (FULL → SHADOW)? Is rollbackGuardToV2 safe from any state?
3. PERSONA GATE IN DISBURSEMENTS: createFromSplit checks rollout policy before creating disbursements. What if the policy changes DURING a batch of disbursement creations? Can half the splits get created and half get skipped?
4. GUARD COMPATIBILITY: When mode is PARTIAL and GUARD is NOT in enabled_personas, guard payouts must come from v2. Verify getGuardPayoutSourceFromPolicy() and where it's consumed. Is there a UI or backend path that accidentally uses v3 amounts for guards?
5. DECOMMISSION GATES: checkDecommissionReadiness requires 2 cycles + low variance. How are "cycles" counted? Calendar weeks? What if deltas have gaps? Can variance calculation be gamed by backfilling favorable deltas?
6. DELTA ACCURACY: The shadow delta compares v3 computed amounts vs v2 payout amounts. Is the v2 amount fetched correctly? What if v2 payouts haven't been created yet when the shadow runs (timing issue on closure confirm)?
7. BACKFILL IDEMPOTENCY: backfillShadowDeltas.ts processes historical closures. If run twice, does it create duplicate deltas? Verify the dedup check.
8. CONFIG READ RACE: The rollout policy is stored as a JSON string in system_config. Multiple mutations read-modify-write. Is there a lost-update race if two admins change policy simultaneously?
9. DECOMMISSION IRREVERSIBILITY: After decommissionV2Shadow() runs, can you re-enable shadow mode? Should you be able to? What happens to the feature_flags?
10. AGGREGATE VARIANCE: getAggregateVariance parses JSON from delta_summary and computes stats in-memory. What if delta_summary JSON is malformed? Does it handle parse errors gracefully? What about division by zero in percentage calculations?

OUTPUT FORMAT: Same as Oracle 1.
```

---

#### Oracle 6: Permission Model, Audit Trail, and Frontend Alignment

```
ADVERSARIAL REVIEW: Permissions, Audit, and Frontend Alignment for Incentive v3

You are reviewing the security model, audit coverage, and frontend<->backend contract alignment.

READ these files IN PARALLEL:
- lib/constants.ts — search for all V3 permissions (incentive_config., commission., attribution., gamification., shadow_mode., disbursement.)
- convex/functions.ts — audit trigger config for all 12 V3 tables
- src/app/(admin)/admin/incentive-settings/page.tsx — the admin settings page (8 tabs)
- src/components/admin/incentive-settings/commission-tab.tsx (1,194 lines)
- src/components/admin/incentive-settings/attribution-tab.tsx (361 lines)
- src/components/admin/incentive-settings/attribution-viewer-tab.tsx (489 lines)
- src/components/admin/incentive-settings/gamification-tab.tsx (647 lines)
- src/components/admin/incentive-settings/shadow-delta-tab.tsx (411 lines)
- src/components/admin/incentive-settings/simulation-tab.tsx (688 lines)
- src/components/shared/GamificationProfileCard.tsx (145 lines)
- src/components/shared/AttributionEarningsCard.tsx (143 lines)
- src/components/ops/CommissionTransparencyCard.tsx (180 lines)
- src/app/(ops)/ops/dashboard/page.tsx — where OPS widgets are embedded
- src/app/(guard)/guard/earnings/page.tsx — where guard widgets are embedded
- notes/03-roles-and-permissions.md — master permissions list

ATTACK VECTORS:
1. PERMISSION GAPS: Every mutation must be gated. List ALL V3 mutations and their permission gates. Flag any ungated mutation.
2. PERMISSION CONSISTENCY: Does notes/03-roles-and-permissions.md list all V3 permissions? Any missing from the master list?
3. AUDIT COMPLETENESS: Every create/update/delete on V3 tables should generate audit_logs entries. Verify functions.ts covers all 12 tables. Verify the audit action names in constants.ts.
4. FRONTEND-BACKEND CONTRACT: For each useQuery/useMutation in the frontend tabs, verify the backend function exists and its args/return type matches what the frontend expects. Flag any TypeScript errors or type mismatches.
5. ROLE-BASED VISIBILITY: Can a guard access the incentive settings page? Can an OPS user? Verify route protection.
6. OPS WIDGET DATA LEAKAGE: CommissionTransparencyCard, AttributionEarningsCard, GamificationProfileCard — do they show only the current user's data? Can they be tricked into showing another user's data?
7. ADMIN-ONLY OPERATIONS: Dispute, override, decommission, migration toggle — all require admin. Verify frontend sends auth and backend checks permissions.
8. STALE UI STATE: If rollout policy changes while admin has the shadow-delta tab open, does the UI reflect the change? (Convex queries are reactive, so likely yes — but verify the queries used are reactive, not one-time fetches.)
9. ERROR HANDLING IN UI: What happens in each tab when backend queries fail? Is there loading/error state? Or does it crash?
10. MONEY DISPLAY: All paise values must be divided by 100 for display and show ₹ symbol. Check every fmtINR/formatCurrency call in all frontend files. Any raw paise displayed to user?

OUTPUT FORMAT: Same as Oracle 1.
```

---

### Step 2: Collect All Oracle Results

After launching all 6, continue working on other things OR sleep-wait. Then collect:

```
background_output(task_id="oracle_1_id")
background_output(task_id="oracle_2_id")
background_output(task_id="oracle_3_id")
background_output(task_id="oracle_4_id")
background_output(task_id="oracle_5_id")
background_output(task_id="oracle_6_id")
```

**NEVER cancel Oracles. ALWAYS collect every result.**

### Step 3: Triage & Classify Findings

After collecting all Oracle results, create a MASTER FINDINGS LIST:

1. **Deduplicate**: Multiple Oracles may flag the same issue. Merge them.
2. **Classify by severity**:
   - CRITICAL (must fix before any release): Double-pay risks, formula errors, permission bypass
   - HIGH (must fix soon): Index gaps, rounding errors, race conditions
   - MEDIUM (should fix): Missing error handling, documentation drift, coverage gaps
   - LOW (nice to have): Style issues, naming, optimization opportunities
3. **Classify by fix type**:
   - BACKEND: Convex function changes
   - SCHEMA: Schema modifications (dangerous — may need migration)
   - FRONTEND: UI changes
   - TESTS: Missing test coverage
   - DOCS: Documentation alignment
4. **Create a numbered todo list of ALL findings**

### Step 4: Dispatch Fix Agents (Parallel Deep Agents)

Group findings by file/domain and dispatch fix agents. Max 3-4 parallel agents:

**Agent grouping strategy:**

- Agent A: Schema + Constants + Audit fixes (if any)
- Agent B: Commission engine + Modifier fixes
- Agent C: Attribution + Disbursement + Anti-double-pay fixes
- Agent D: Gamification + Cron + Shadow mode fixes
- Agent E: Frontend + Permission fixes
- Agent F: Test coverage gaps

Each fix agent prompt MUST include:

1. The EXACT finding (severity, file, location, issue, fix)
2. "Read AGENTS.md first"
3. "Do NOT modify files outside your assigned scope"
4. "Run `npx tsc --noEmit` after changes"
5. "If a finding is actually a false positive (the code is correct), explain WHY and do not change it"

**IMPORTANT**: Pass `load_skills=["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]` to every fix agent.

### Step 5: Verify Fixes

After all fix agents complete:

1. Run `npx tsc --noEmit` — must have NO new errors
2. Run `npx vitest run convex/incentiveV3.test.ts` — must pass (68+ tests)
3. Run `npm run build` — must succeed
4. If any fix agent introduced new type errors or test failures → use `session_id` to continue that agent with the error context

### Step 6: Re-Validate (Loop)

If Step 4 produced significant changes (>50 lines modified), launch a **single summary Oracle**:

```
FOLLOW-UP REVIEW: Verify fixes for Incentive v3

The following N findings were identified and fixed. Review the FIXED files and verify:
1. Each fix correctly addresses the original finding
2. No fix introduced new issues
3. No regression in existing functionality

[paste the finding list and which files were modified]

Read the modified files and report: VERIFIED / REGRESSION_FOUND / INCOMPLETE_FIX for each.
```

If the summary Oracle finds regressions, dispatch another fix round. Repeat until clean.

### Step 7: Final Report

When all Oracles are satisfied and builds pass, produce a final report:

```
## P32 Adversarial Validation Report

### Findings Summary
- CRITICAL: N found, N fixed, N false-positive
- HIGH: N found, N fixed, N false-positive
- MEDIUM: N found, N fixed, N deferred
- LOW: N found, N fixed, N deferred

### Changes Made
- [file]: [what changed and why]

### Remaining Items (if any)
- [deferred items with justification]

### Verification
- tsc: ✅/❌
- tests: N/N passing
- build: ✅/❌
```

---

## KEY CONTEXT (Locked Decisions — Do NOT Question These)

These are intentional design decisions, NOT bugs:

1. **Commission formula**: `pool = max(0, Math.floor(profit * effective_rate_bps / 10000) + flat_bonus_paise)` — floor is intentional (conservative rounding)
2. **Attribution stages**: DISCOVERY 25%, VERIFICATION 35%, CLOSURE 25%, SUPPORT 15% — business decision
3. **Empty-stage handling**: Proportional redistribution — spec requirement
4. **Level curve**: `level<=10: 100*level`, `11-30: 1000+(level-10)*75`, `31+: 2500+floor((level-30)^1.5)*50` — deliberate difficulty ramp
5. **XP awards**: Lead 50, Visit 75, Closure 200 — business decision, don't question amounts
6. **Weekly tiers reset on Sunday 18:30 UTC** (= Monday 00:00 IST) — intentional timezone alignment
7. **Streak freeze: 1 free/month** — product decision
8. **Anti-double-pay has TWO layers** (source_key + closure_id+recipient_user_id) — intentional defense-in-depth
9. **Shadow mode try/catch never breaks closure** — intentional, shadow is optional
10. **Config snapshots are stored in evaluation records** — intentional for audit trail and reproducibility
11. **Pre-existing tsc errors in admins.test.ts, buildings.test.ts, leads.test.ts, notifications.ts, etc.** — not from P32, ignore them
12. **Pre-existing tsc errors on incentiveV3.test.ts line 204** (by_key index type) — known E01 issue, ignore

---

## CONSTRAINTS

- NEVER modify files outside the P32 scope unless an Oracle finding specifically identifies a bug in them
- NEVER suppress type errors with `as any` or `@ts-ignore`
- NEVER delete existing tests
- NEVER change the commission formula, attribution weights, or XP amounts (these are business decisions)
- NEVER change schema table structure without flagging it as SCHEMA change (requires migration consideration)
- ALL money in paise (integer × 100)
- ALL dates in Unix milliseconds
- Use `convex/functions.ts` wrapped exports for audit coverage
