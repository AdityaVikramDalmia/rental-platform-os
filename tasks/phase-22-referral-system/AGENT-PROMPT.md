# Phase 22: Referral System — Full Implementation Prompt

> **Give this entire prompt to a fresh orchestrator agent.**
> It contains all research, patterns, and execution instructions needed to implement Phase 22 from scratch.

---

## YOUR ROLE

You are an orchestrator agent implementing Phase 22 (Referral System) for the Rental Platform OS platform. You do NOT write code yourself. You delegate to specialized sub-agents and validate their output.

**Your tools:**

- **Librarian agents** (`subagent_type="librarian"`) — Research external docs, Convex API patterns, GitHub examples. Fire in background, collect later.
- **Deep agents** (`category="deep"`) — Do the actual code editing. One epic at a time. Pass them exhaustive context.
- **Oracle** (`subagent_type="oracle"`) — Validate completed work. Read-only consultation. Ask it to review code for correctness, pattern compliance, and edge cases.
- **Sleep command** (`bash: sleep N`) — Wait for background agents to complete. System notifies you when they finish.
- **Direct tools** — `bash` for builds/tests, `grep`/`glob` for quick checks, `read` for spot-checking agent output.

**Your workflow for EACH epic:**

```
1. Fire librarian(s) for any external research needed (background)
2. Sleep / wait for librarians to complete
3. Fire deep agent with exhaustive prompt (all context + patterns + task spec)
4. Sleep / wait for deep agent to complete
5. Verify: run `npx convex dev` + `npm run build` + `lsp_diagnostics` on changed files
6. Fire oracle to review the implementation (background)
7. Sleep / wait for oracle
8. If oracle finds issues → fire deep agent again with session_id + fix instructions
9. Repeat 5-8 until clean
10. Move to next epic
```

---

## FIRST STEP (NON-NEGOTIABLE)

Read `AGENTS.md` in the project root. It contains the full project context — tech stack, personas, conventions, dev environment, routing rules, test accounts, and file structure.

This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`.

---

## PHASE 22 OVERVIEW

**What**: Dual referral system — (1) Guard-to-guard referrals tracked by phone, ₹500 bounty on first verified lead, and (2) DemoRentals tenant/owner referral codes with stacking bonuses (₹200 signup + finding bonus split 30/70 across listing publish and deal closure).

**Status**: 5 epics, 19 tasks, ALL pending. Zero referral code exists in codebase — clean slate.

**Dependencies satisfied**:

- P01-E01 (Auth + Convex patterns) ✅
- P19-E01 (TENANT/OWNER user types in constants.ts) ✅

**Epic dependency graph:**

```
E01 (Foundation) ─┬─→ E02 (Guard Referral) ──┐
                  │                           ├─→ E04 (Milestone Engine) ─→ E05 (Admin + UI)
                  └─→ E03 (DemoRentals Codes)  ───┘
```

E02 and E03 can run in parallel after E01. E04 requires both. E05 requires E04.

---

## EXECUTION ORDER

### Epic 1: Schema + Constants + Config Backend (P22-E01)

### Epic 2: Guard Referral Flow (P22-E02)

### Epic 3: DemoRentals Referral Codes + Attribution (P22-E03)

### Epic 4: Milestone Engine + Bonus Triggers (P22-E04)

### Epic 5: Admin Referral Management + User Dashboard (P22-E05)

**Execute E02 and E03 sequentially** (not parallel) to avoid merge conflicts on shared files like `convex/referrals.ts` and `lib/constants.ts`. Order: E01 → E02 → E03 → E04 → E05.

---

## WHAT EACH EPIC DELIVERS

Read the detailed task spec files before starting each epic:

- `tasks/phase-22-referral-system/P22-E01-referral-schema-constants-config.md`
- `tasks/phase-22-referral-system/P22-E02-guard-referral-flow.md`
- `tasks/phase-22-referral-system/P22-E03-demorentals-referral-codes-attribution.md`
- `tasks/phase-22-referral-system/P22-E04-milestone-engine-bonus-triggers.md`
- `tasks/phase-22-referral-system/P22-E05-admin-referral-management-user-dashboard.md`

---

## SCHEMA (4 New Tables)

These go in `convex/schema.ts`. Fields and indexes MUST match `notes/10-convex-schema.md` exactly.

### `referral_codes`

| Field       | Type            | Required | Notes                                           |
| ----------- | --------------- | -------- | ----------------------------------------------- |
| `user_id`   | `v.id("users")` | yes      | Code owner (tenant or owner)                    |
| `code`      | `v.string()`    | yes      | Format: `FLAT-XXXXX` (5 uppercase alphanumeric) |
| `is_active` | `v.boolean()`   | yes      | Admin can deactivate                            |

Indexes: `by_user_id` → `["user_id"]`, `by_code` → `["code"]`

### `referrals`

| Field                | Type                                 | Required                      |
| -------------------- | ------------------------------------ | ----------------------------- |
| `referrer_user_id`   | `v.id("users")`                      | yes                           |
| `referred_user_id`   | `v.id("users")`                      | yes                           |
| `referral_code_id`   | `v.optional(v.id("referral_codes"))` | no (null for guard referrals) |
| `referral_type`      | referralTypeValidator                | yes                           |
| `status`             | referralStatusValidator              | yes                           |
| `lead_id`            | `v.optional(v.id("leads"))`          | no                            |
| `listing_id`         | `v.optional(v.id("listings"))`       | no                            |
| `closure_id`         | `v.optional(v.id("closures"))`       | no                            |
| `voided_reason`      | `v.optional(v.string())`             | no                            |
| `voided_by_admin_id` | `v.optional(v.id("users"))`          | no                            |

Indexes: `by_referrer_user_id`, `by_referred_user_id`, `by_referral_type`, `by_status`, `by_closure_id`

### `referral_milestones`

| Field                  | Type                             | Required             |
| ---------------------- | -------------------------------- | -------------------- |
| `referral_id`          | `v.id("referrals")`              | yes                  |
| `milestone_type`       | referralMilestoneTypeValidator   | yes                  |
| `amount`               | `v.number()`                     | yes (paise)          |
| `status`               | referralMilestoneStatusValidator | yes                  |
| `source_event`         | `v.optional(v.string())`         | no (idempotency key) |
| `triggered_at`         | `v.optional(v.number())`         | no                   |
| `approved_by_admin_id` | `v.optional(v.id("users"))`      | no                   |
| `paid_at`              | `v.optional(v.number())`         | no                   |
| `payout_method`        | `v.optional(v.string())`         | no                   |
| `voided_reason`        | `v.optional(v.string())`         | no                   |

Indexes: `by_referral_id`, `by_status`, `by_milestone_type`

### `referral_config`

| Field                 | Type                         | Required    |
| --------------------- | ---------------------------- | ----------- |
| `referral_type`       | referralTypeValidator        | yes         |
| `scope_type`          | referralConfigScopeValidator | yes         |
| `scope_id`            | `v.optional(v.string())`     | no          |
| `sign_up_bonus`       | `v.number()`                 | yes (paise) |
| `finding_bonus_total` | `v.number()`                 | yes (paise) |
| `publish_split_pct`   | `v.number()`                 | yes         |
| `closure_split_pct`   | `v.number()`                 | yes         |
| `is_active`           | `v.boolean()`                | yes         |
| `updated_by_admin_id` | `v.id("users")`              | yes         |

Indexes: `by_referral_type`, `by_scope` → `["referral_type", "scope_type", "scope_id"]`

---

## STATE MACHINES

### Referral Status

```
PENDING → QUALIFIED → PARTIALLY_PAID → FULLY_PAID (terminal)
  ↓         ↓            ↓
  └─────────┴────────────┴─→ VOIDED (terminal)
```

Transitions:

- `(new)` → `PENDING` — referral recorded
- `PENDING` → `QUALIFIED` — first milestone triggered
- `PENDING` → `VOIDED` — admin voids
- `QUALIFIED` → `PARTIALLY_PAID` — at least one milestone paid, others pending
- `QUALIFIED` → `FULLY_PAID` — all milestones paid at once
- `QUALIFIED` → `VOIDED` — admin voids
- `PARTIALLY_PAID` → `FULLY_PAID` — final milestone paid
- `PARTIALLY_PAID` → `VOIDED` — admin voids remaining

### Referral Milestone Status

```
PENDING → TRIGGERED → APPROVED → PAID (terminal)
  ↓         ↓          ↓
  └─────────┴──────────┴─→ VOIDED (terminal)
```

Transitions:

- `PENDING` → `TRIGGERED` — milestone event occurs
- `PENDING` → `VOIDED` — parent referral voided
- `TRIGGERED` → `APPROVED` — admin approves
- `TRIGGERED` → `VOIDED` — admin voids
- `APPROVED` → `PAID` — admin marks paid
- `APPROVED` → `VOIDED` — admin voids before payment

---

## CONSTANTS TO ADD (lib/constants.ts)

```typescript
// Enums
REFERRAL_TYPE: { TENANT_FINDING, OWNER_FINDING, GUARD }
REFERRAL_STATUS: { PENDING, QUALIFIED, PARTIALLY_PAID, FULLY_PAID, VOIDED }
REFERRAL_MILESTONE_TYPE: { SIGN_UP, LISTING_PUBLISHED, DEAL_CLOSED, FIRST_VERIFIED_LEAD }
REFERRAL_MILESTONE_STATUS: { PENDING, TRIGGERED, APPROVED, PAID, VOIDED }
REFERRAL_CONFIG_SCOPE_TYPE: { GLOBAL, SOCIETY, BUILDING }

// Permissions (add to PERMISSIONS object)
REFERRALS_VIEW: "referrals.view"
REFERRALS_MANAGE: "referrals.manage"
REFERRALS_CONFIGURE: "referrals.configure"
REFERRALS_APPROVE_PAYOUT: "referrals.approve_payout"

// Audit actions (add to AUDIT_ACTIONS)
REFERRAL_CODES_INSERT, REFERRAL_CODES_UPDATE
REFERRALS_INSERT, REFERRALS_UPDATE
REFERRAL_MILESTONES_INSERT, REFERRAL_MILESTONES_UPDATE
REFERRAL_CONFIG_INSERT, REFERRAL_CONFIG_UPDATE

// Status colors (follow existing pattern)
REFERRAL_STATUS_COLORS: Record<ReferralStatus, string>
REFERRAL_MILESTONE_STATUS_COLORS: Record<ReferralMilestoneStatus, string>

// Labels
REFERRAL_STATUS_LABELS: Record<ReferralStatus, string>
REFERRAL_TYPE_LABELS: Record<ReferralType, string>
REFERRAL_MILESTONE_TYPE_LABELS: Record<ReferralMilestoneType, string>
REFERRAL_MILESTONE_STATUS_LABELS: Record<ReferralMilestoneStatus, string>

// System config keys
REFERRAL_SIGNUP_BONUS: "referral_signup_bonus" (default: "20000" = ₹200)
REFERRAL_TENANT_FINDING_TOTAL: "referral_tenant_finding_total" (default: "100000" = ₹1,000)
REFERRAL_OWNER_FINDING_TOTAL: "referral_owner_finding_total" (default: "200000" = ₹2,000)
REFERRAL_GUARD_BONUS: "referral_guard_bonus" (default: "50000" = ₹500)
REFERRAL_PUBLISH_SPLIT_PCT: "referral_publish_split_pct" (default: "30")
REFERRAL_CLOSURE_SPLIT_PCT: "referral_closure_split_pct" (default: "70")
```

---

## CODEBASE PATTERNS (MUST FOLLOW)

### 1. Import Pattern

```typescript
// ALWAYS import from functions.ts, NOT _generated/server
import { mutation, query, internalMutation, internalQuery } from "./functions";
import { requirePermission, requireGuardAuth, requireAuth } from "./auth.helpers";
import { internal } from "./_generated/api";
import { v } from "convex/values";
```

### 2. Mutation Structure (auth → validate → fetch → check → insert → trigger)

```typescript
export const create = mutation({
  args: {
    /* validators */
  },
  handler: async (ctx, args) => {
    // 1. Auth: requirePermission(ctx, PERMISSIONS.REFERRALS_MANAGE)
    // 2. Validate: assertPositiveIntegerPaise(), normalize strings
    // 3. Fetch related: ctx.db.get(args.some_id) + null check
    // 4. Check constraints: duplicate check, state validation
    // 5. Insert: ctx.db.insert("referrals", { ... })
    // 6. Trigger side effects: ctx.runMutation(internal.referralMilestones.trigger, {...})
    // 7. Return: await ctx.db.get(insertedId)
  },
});
```

### 3. Query Structure (auth → filter → paginate → enrich)

```typescript
export const list = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(...) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_VIEW);
    let q = ctx.db.query("referrals").withIndex("by_status", ...).order("desc");
    const result = await q.paginate(args.paginationOpts);
    const enriched = await Promise.all(result.page.map(r => enrichReferral(ctx, r)));
    return { ...result, page: enriched };
  },
});
```

### 4. Status Transition Validation

```typescript
// lib/referral.ts
export function validateReferralTransition(current: ReferralStatus, next: ReferralStatus): boolean {
  const valid: Record<ReferralStatus, readonly ReferralStatus[]> = {
    PENDING: ["QUALIFIED", "VOIDED"],
    QUALIFIED: ["PARTIALLY_PAID", "FULLY_PAID", "VOIDED"],
    PARTIALLY_PAID: ["FULLY_PAID", "VOIDED"],
    FULLY_PAID: [],
    VOIDED: [],
  };
  return (valid[current] ?? []).includes(next);
}
```

### 5. Amount Handling

- ALL monetary values in paise (integer × 100). ₹500 = 50000.
- Validate with `assertPositiveIntegerPaise(value, fieldName)`
- Split calculation: `Math.floor(total * pct / 100)` — use floor, not round, to avoid overpayment

### 6. Enum/Constant Pattern

```typescript
export const REFERRAL_STATUS = {
  PENDING: "PENDING",
  QUALIFIED: "QUALIFIED",
  // ...
} as const satisfies Record<string, string>;
export type ReferralStatus = (typeof REFERRAL_STATUS)[keyof typeof REFERRAL_STATUS];
```

### 7. Validator Pattern

```typescript
const referralStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("QUALIFIED"),
  v.literal("PARTIALLY_PAID"),
  v.literal("FULLY_PAID"),
  v.literal("VOIDED"),
);
```

### 8. Audit Integration

Add all 4 tables to `AUDITED_TABLES` in `convex/functions.ts`. Add 8 audit actions to `auditActionValidator` in `convex/schema.ts`. Audit triggers fire automatically — no manual logging needed.

### 9. Idempotency for Milestone Triggers

Each milestone trigger carries a `source_event` string (e.g., `"lead_verified:{lead_id}"`). Before inserting, query by `source_event` — if exists, silently return existing milestone. This prevents double-triggers from Convex OCC retries.

### 10. Scope Cascading Config Lookup

```
building → society → global → hardcoded default
```

Three sequential queries with the compound index `by_scope` → `["referral_type", "scope_type", "scope_id"]`.

---

## BUSINESS RULES (NON-NEGOTIABLE)

1. **Guard referrals**: No referral codes. Tracked by phone number during guard account creation. ₹500 flat bonus when referred guard's first lead reaches VERIFIED.
2. **DemoRentals referrals**: One `FLAT-XXXXX` code per user, auto-generated. First-touch attribution — once captured, later URLs are informational only. Admin override is the only way to change.
3. **Stacking bonuses**: Signup bonus (₹200) is SEPARATE from finding bonus. Referrer earns BOTH if deal completes.
4. **Two-tiered finding bonus**: 30% on listing publish, 70% on deal closure. Configurable split. Default: tenant ₹1,000 (₹300+₹700), owner ₹2,000 (₹600+₹1,400).
5. **No self-referral**: Users cannot use their own code.
6. **One referrer per user**: Enforced by querying `by_referred_user_id` excluding VOIDED before insert.
7. **Cascading void**: When referral is voided, all PENDING/TRIGGERED/APPROVED milestones are voided. PAID milestones are preserved (terminal).
8. **Override atomicity**: `overrideAttribution` must void old referral + milestones AND create new referral in SINGLE mutation.
9. **Config changes**: Apply to NEW referrals only. Existing milestones keep their original amounts.
10. **Code generation**: 5 uppercase alphanumeric chars (A-Z, 0-9 excluding confusables), prefixed `FLAT-`. 10 collision retries. Use `Math.random()` in Convex mutation.
11. **Separate from guard payouts**: Referral milestones do NOT go through the `payouts` table. They have their own lifecycle.
12. **Deactivated codes**: Can't be used for new signups but existing referrals remain valid.

---

## HOOK INTEGRATION POINTS

These hooks go inside EXISTING mutations. Add them at the END of the handler, AFTER the existing logic. Do NOT modify existing logic.

### Hook 1: First Verified Lead (in `convex/verifications.ts`)

When a lead's verification status becomes VERIFIED:

```
→ Query referrals table for the guard who submitted the lead (by_referred_user_id)
→ If found and referral.type === "GUARD" and no FIRST_VERIFIED_LEAD milestone exists
→ Call internal.referralMilestones.trigger({ referral_id, milestone_type: "FIRST_VERIFIED_LEAD", source_event: "lead_verified:{lead_id}" })
```

### Hook 2: Listing Published (in `convex/listings.ts`)

When a listing status becomes PUBLISHED:

```
→ Query referrals table for the listing's associated referred user
→ If found and referral.type is TENANT_FINDING or OWNER_FINDING
→ Call internal.referralMilestones.trigger({ referral_id, milestone_type: "LISTING_PUBLISHED", source_event: "listing_published:{listing_id}" })
```

### Hook 3: Closure Confirmed (in `convex/closures.ts`)

When a closure status becomes CONFIRMED:

```
→ Query referrals table by closure_id or via the deal chain
→ If found referral
→ Call internal.referralMilestones.trigger({ referral_id, milestone_type: "DEAL_CLOSED", source_event: "closure_confirmed:{closure_id}" })
```

---

## FILES TO CREATE

| File                           | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `convex/referralCodes.ts`      | Code generation, CRUD, deactivation                              |
| `convex/referrals.ts`          | Referral lifecycle — record, override, void, queries             |
| `convex/referralMilestones.ts` | Milestone trigger, approve, markPaid, void                       |
| `convex/referralConfig.ts`     | Config CRUD with scope cascading                                 |
| `lib/referral.ts`              | Code generation helper, transition validators, split calculation |

## FILES TO MODIFY

| File                      | Changes                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `convex/schema.ts`        | Add 4 tables + validators + audit actions                                          |
| `lib/constants.ts`        | Add 5 enums, types, validators, labels, colors, permissions, config keys, defaults |
| `convex/functions.ts`     | Add 4 tables to AUDITED_TABLES                                                     |
| `convex/rateLimiter.ts`   | Add `public:referral_signup` rate limit                                            |
| `convex/seed.ts`          | Seed GLOBAL referral_config defaults for all 3 types                               |
| `convex/verifications.ts` | Add first-lead milestone hook                                                      |
| `convex/listings.ts`      | Add listing-published milestone hook                                               |
| `convex/closures.ts`      | Add closure-confirmed milestone hook                                               |

### UI Files (E05 only)

| File                                                    | Purpose                                           |
| ------------------------------------------------------- | ------------------------------------------------- |
| `src/app/(admin)/admin/referrals/page.tsx`              | Admin referral management page                    |
| `src/app/(admin)/admin/settings/referrals/page.tsx`     | Admin referral config page                        |
| `src/components/admin/referrals/ReferralTable.tsx`      | Admin referral table                              |
| `src/components/admin/referrals/ReferralDetail.tsx`     | Detail sheet with milestone actions               |
| `src/components/admin/referrals/ReferralConfigForm.tsx` | Config edit form                                  |
| `src/components/shared/referral-dashboard.tsx`          | Shared referral dashboard (guard + future tenant) |
| `src/components/guard/guard-referral-section.tsx`       | Guard earnings page referral section              |
| `src/app/(public)/ref/[code]/page.tsx`                  | Public referral landing route                     |

---

## DEEP AGENT PROMPT TEMPLATE

When delegating to a deep agent, use this structure:

```
FIRST STEP: Read `AGENTS.md` in the project root. It contains the full project context. This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`.

**PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):**
You MUST make tool calls in parallel whenever the calls are independent.
- Reading multiple files? ALL reads in ONE message.
- Multiple greps? ALL in ONE message.
- Sequential ONLY when Call B depends on Call A's result.

TASK: [Epic ID] — [Epic Title]

Read the task spec: `tasks/phase-22-referral-system/[P22-EXX-file].md`

Also read these files for patterns to follow:
- `convex/payouts.ts` — mutation/query structure, status transitions, enrichment
- `convex/incentives.ts` — bonus calculation, config lookups
- `convex/functions.ts` — audit trigger pattern, AUDITED_TABLES
- `lib/constants.ts` — enum pattern, labels, colors, permissions

[PASTE THE RELEVANT SECTION FROM THIS PROMPT — schema, state machines, business rules, etc.]

MUST DO:
- Follow existing patterns EXACTLY (imports from ./functions, auth checks, amount validation)
- All amounts in paise (integer × 100), validated with assertPositiveIntegerPaise
- All status transitions validated against state machine
- Idempotency via source_event key for milestone triggers
- Add all new tables to AUDITED_TABLES in functions.ts
- Create validators in schema.ts for all new enums
- Run `npx convex dev` after changes to verify schema compiles

MUST NOT DO:
- Do NOT use `as any`, `@ts-ignore`, or `@ts-expect-error`
- Do NOT import from `_generated/server` — use `./functions`
- Do NOT modify existing mutation logic — only ADD hooks at the end
- Do NOT create separate payout records — referral milestones have their own lifecycle
- Do NOT use floats for money — paise only, integer math
- Do NOT skip status transition validation
- Do NOT hardcode bonus amounts — always read from referral_config via scope cascade
```

---

## ORACLE VALIDATION PROMPT TEMPLATE

After each epic is implemented, fire oracle with:

```
FIRST STEP: Read `AGENTS.md` in the project root.

I just completed implementing [Epic ID] of Phase 22 (Referral System). Review the implementation for correctness.

Read these files:
[list all files created/modified in this epic]

Check for:
1. PATTERN COMPLIANCE: Do all mutations follow auth→validate→fetch→insert pattern from payouts.ts?
2. STATUS MACHINE: Are all transitions validated against the state machine in notes/04-state-machines.md?
3. AMOUNT SAFETY: Are all monetary calculations using integer paise with proper validation?
4. IDEMPOTENCY: Do milestone triggers check source_event before inserting?
5. AUDIT INTEGRATION: Are new tables in AUDITED_TABLES? Are audit actions in the validator?
6. HOOK SAFETY: Do hooks in existing files (verifications.ts, listings.ts, closures.ts) only ADD code without modifying existing logic?
7. EDGE CASES: Self-referral prevention? One-referrer-per-user enforcement? Cascading void correctness? Code collision handling?
8. TYPE SAFETY: No `as any`, no `@ts-ignore`, no untyped parameters?
9. SCHEMA MATCH: Do table definitions match notes/10-convex-schema.md exactly?
10. CONSTANTS COMPLETENESS: All enums, labels, colors, permissions, config keys added?

Return a list of issues found (if any) with specific file paths and line numbers.
```

---

## VERIFICATION COMMANDS

Run these after EACH epic:

```bash
# 1. Check Convex compiles (schema + functions)
npx convex dev --once 2>&1 | tail -20

# 2. Check Next.js builds
npm run build 2>&1 | tail -30

# 3. Check TypeScript
npx tsc --noEmit 2>&1 | tail -30
```

If any fail, fix before moving to the next epic.

---

## i18n KEYS (E02-T03 Only)

When adding guard referral section to earnings page, add keys to ALL 3 locale files:

- `messages/en.json`
- `messages/hi.json`
- `messages/hinglish.json`

Namespace: `guard.referrals` (nested under existing `guard` object).

Required keys (at minimum):

```
referralTitle, referralSubtitle, referredBy, referredGuards,
bonusAmount, bonusStatus, noReferrals, milestoneTriggered,
milestoneApproved, milestonePaid, milestoneVoided, pendingBonus
```

Validate key parity after adding:

```bash
node -e "
const en = JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));
const hi = JSON.parse(require('fs').readFileSync('messages/hi.json','utf8'));
const hl = JSON.parse(require('fs').readFileSync('messages/hinglish.json','utf8'));
const keys = (o, p='') => Object.entries(o).flatMap(([k,v]) => typeof v==='object' ? keys(v,p+k+'.') : [p+k]);
console.log('en keys:', keys(en).length);
console.log('en===hi:', keys(en).sort().join() === keys(hi).sort().join());
console.log('en===hl:', keys(en).sort().join() === keys(hl).sort().join());
"
```

---

## SKILLS TO LOAD PER AGENT

| Agent Type                   | Skills                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Deep (backend epics E01-E04) | `["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "task-planner"]`                   |
| Deep (frontend epic E05)     | `["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "task-planner", "frontend-ui-ux"]` |
| Deep (i18n work in E02-T03)  | `["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "task-planner"]`                   |
| Oracle (validation)          | `["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]`                                   |
| Librarian (research)         | `[]` (no project skills needed)                                                           |

---

## ESTIMATED SCOPE

| Epic | Tasks | Complexity | New Files                                        | Modified Files                                                               |
| ---- | ----- | ---------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| E01  | 4     | Medium     | 2 (`referralConfig.ts`, `lib/referral.ts`)       | 5 (`schema.ts`, `constants.ts`, `functions.ts`, `rateLimiter.ts`, `seed.ts`) |
| E02  | 3     | Medium     | 2 (`referrals.ts`, `guard-referral-section.tsx`) | 2 (`verifications.ts`, guard earnings page) + 3 i18n files                   |
| E03  | 4     | High       | 2 (`referralCodes.ts`, `ref/[code]/page.tsx`)    | 1 (`referrals.ts` — add DemoRentals functions)                                   |
| E04  | 4     | Highest    | 1 (`referralMilestones.ts`)                      | 3 (`listings.ts`, `closures.ts`, `referrals.ts`)                             |
| E05  | 4     | Medium     | 6 (admin pages + components + shared dashboard)  | 2 (admin sidebar nav, admin analytics page)                                  |

---

## GO

Start with E01. Read the task spec file first. Fire a librarian to check the latest Convex schema definition docs if unsure about any validator syntax. Then fire a deep agent with the full context above. Validate with oracle. Repeat for each epic.

Good luck.
