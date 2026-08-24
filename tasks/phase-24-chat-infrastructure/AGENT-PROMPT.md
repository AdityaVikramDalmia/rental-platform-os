# Phase 24: Chat Infrastructure — Full Implementation Prompt

> **Give this entire prompt to a fresh orchestrator agent.**
> It contains all research, patterns, and execution instructions needed to implement Phase 24 from scratch.

---

## YOUR ROLE

You are an orchestrator agent implementing Phase 24 (Chat Infrastructure) for the Rental Platform OS platform. You do NOT write code yourself. You delegate to specialized sub-agents and validate their output.

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

## PHASE 24 OVERVIEW

**What**: Core real-time AI-masked chat system. Per-inquiry channels (admin-opened), 5-second message batching via `convex-batch-processor`, layered PII masking pipeline (regex pre-scan → GPT-4o-mini rewrite → regex post-check → fail-closed admin review), real-time paginated message subscriptions, read receipts, and an admin chat monitor.

**Status**: 4 epics, 15 tasks. ALL pending. Zero chat code exists in the codebase — clean slate.

**Dependencies satisfied**:

- P01-E01 (Auth + Convex patterns) ✅
- P19-E01 (tenant inquiries + TENANT/OWNER user types) ✅

**Epic dependency graph:**

```
P01-E01 ----\
             +--> P24-E01 --> P24-E02 --> P24-E03 --> P24-E04
P19-E01 ----/                         \--------------->/
```

Execute ALL epics SEQUENTIALLY: E01 → E02 → E03 → E04. E04 UI shell can begin after E02, but flagged-message workflows require E03 to be complete first.

---

## EXECUTION ORDER

### Epic 1: Schema + Constants + Permissions (P24-E01)

### Epic 2: Chat Backend + Batching (P24-E02)

### Epic 3: AI Pipeline (P24-E03)

### Epic 4: Chat UI + Admin Monitor (P24-E04)

**Execute all epics sequentially** to avoid merge conflicts on shared files like `convex/schema.ts`, `lib/constants.ts`, and `convex/functions.ts`.

---

## WHAT EACH EPIC DELIVERS

Read the detailed task spec files before starting each epic:

- `tasks/phase-24-chat-infrastructure/P24-E01-chat-schema-constants-permissions.md`
- `tasks/phase-24-chat-infrastructure/P24-E02-chat-backend-batching.md`
- `tasks/phase-24-chat-infrastructure/P24-E03-ai-pipeline.md`
- `tasks/phase-24-chat-infrastructure/P24-E04-chat-ui-admin-monitor.md`

---

## SCHEMA (4 New Tables)

> **CRITICAL NOTE — NAMING DISCREPANCY**: The schema documentation files (`notes/10-convex-schema.md`) may use different field names and status values than the task files. **The task files are authoritative.** Specifically:
>
> - Use `inquiry_id` (NOT `tenant_inquiry_id`)
> - Use `ACTIVE`/`ARCHIVED` for channel status (NOT `OPEN`/`CLOSED`)
> - Use `TENANT`/`OWNER`/`OPS`/`SYSTEM` for sender roles (NOT any other values)
>
> If you see a conflict between the schema doc and this prompt, follow this prompt.

These go in `convex/schema.ts`. Fields and indexes MUST match the definitions below exactly.

### `chat_channels`

| Field                 | Type                         | Required      |
| --------------------- | ---------------------------- | ------------- |
| `inquiry_id`          | `v.id("tenant_inquiries")`   | yes           |
| `status`              | `chatChannelStatusValidator` | yes           |
| `created_by_admin_id` | `v.id("users")`              | yes           |
| `created_at`          | `v.number()`                 | yes (Unix ms) |

Indexes: `by_inquiry_id` → `["inquiry_id"]`, `by_status` → `["status"]`

### `chat_messages`

| Field                   | Type                                       | Required      |
| ----------------------- | ------------------------------------------ | ------------- |
| `channel_id`            | `v.id("chat_channels")`                    | yes           |
| `sender_user_id`        | `v.id("users")`                            | yes           |
| `sender_role`           | `chatSenderRoleValidator`                  | yes           |
| `original_content`      | `v.string()`                               | yes           |
| `masked_content`        | `v.optional(v.string())`                   | no            |
| `batch_id`              | `v.optional(v.id("chat_message_batches"))` | no            |
| `status`                | `chatMessageStatusValidator`               | yes           |
| `failure_reason`        | `v.optional(v.string())`                   | no            |
| `admin_review_required` | `v.boolean()`                              | yes           |
| `is_ai_processed`       | `v.boolean()`                              | yes           |
| `created_at`            | `v.number()`                               | yes (Unix ms) |

Indexes: `by_channel_id` → `["channel_id"]`, `by_batch_id` → `["batch_id"]`, `by_status` → `["status"]`, `by_channel_and_created` → `["channel_id", "created_at"]`

### `chat_message_batches`

| Field               | Type                              | Required      |
| ------------------- | --------------------------------- | ------------- |
| `channel_id`        | `v.id("chat_channels")`           | yes           |
| `sender_user_id`    | `v.id("users")`                   | yes           |
| `messages`          | `v.array(v.id("chat_messages"))`  | yes           |
| `combined_original` | `v.string()`                      | yes           |
| `masked_content`    | `v.optional(v.string())`          | no            |
| `pii_detected`      | `v.optional(v.array(v.string()))` | no            |
| `status`            | `chatBatchStatusValidator`        | yes           |
| `failure_reason`    | `v.optional(v.string())`          | no            |
| `created_at`        | `v.number()`                      | yes (Unix ms) |
| `processed_at`      | `v.optional(v.number())`          | no            |

Indexes: `by_channel_id` → `["channel_id"]`, `by_status` → `["status"]`, `by_channel_and_created` → `["channel_id", "created_at"]`

### `chat_read_receipts`

| Field                  | Type                    | Required      |
| ---------------------- | ----------------------- | ------------- |
| `channel_id`           | `v.id("chat_channels")` | yes           |
| `user_id`              | `v.id("users")`         | yes           |
| `last_read_message_id` | `v.id("chat_messages")` | yes           |
| `last_read_at`         | `v.number()`            | yes (Unix ms) |

Index: `by_channel_and_user` → `["channel_id", "user_id"]`

---

## STATE MACHINES

### Chat Channel Status

```
ACTIVE → ARCHIVED (terminal for P24)
```

Transitions:

- `(new)` → `ACTIVE` — channel created by admin
- `ACTIVE` → `ARCHIVED` — admin archives channel

Note: Reopen (ARCHIVED → ACTIVE) is deferred to P25. Do NOT implement it in P24.

### Chat Message Status

```
SUBMITTED → BATCHED → PROCESSING → DELIVERED (terminal)
                                  → FAILED (admin review)
```

Transitions:

- `(new)` → `SUBMITTED` — message created
- `SUBMITTED` → `BATCHED` — added to batch window
- `BATCHED` → `PROCESSING` — batch sent to AI
- `PROCESSING` → `DELIVERED` — clean AI output, no PII
- `PROCESSING` → `FAILED` — PII leakage detected or AI error

### Chat Batch Status

```
COLLECTING → PROCESSING → DELIVERED (terminal)
                        → FAILED
```

Transitions:

- `(new)` → `COLLECTING` — batch window open
- `COLLECTING` → `PROCESSING` — window closed, sent to AI
- `PROCESSING` → `DELIVERED` — all messages delivered
- `PROCESSING` → `FAILED` — AI or PII failure

---

## CONSTANTS TO ADD (lib/constants.ts)

```typescript
// Enums (follow existing as const satisfies Record<string, string> pattern)
CHAT_CHANNEL_STATUS: { ACTIVE: "ACTIVE", ARCHIVED: "ARCHIVED" }
CHAT_MESSAGE_STATUS: { SUBMITTED: "SUBMITTED", BATCHED: "BATCHED", PROCESSING: "PROCESSING", DELIVERED: "DELIVERED", FAILED: "FAILED" }
CHAT_BATCH_STATUS: { COLLECTING: "COLLECTING", PROCESSING: "PROCESSING", DELIVERED: "DELIVERED", FAILED: "FAILED" }
CHAT_SENDER_ROLE: { TENANT: "TENANT", OWNER: "OWNER", OPS: "OPS", SYSTEM: "SYSTEM" }

// Permissions (add to PERMISSIONS object)
CHAT_VIEW: "chat.view"
CHAT_SEND: "chat.send"
CHAT_MODERATE: "chat.moderate"
CHAT_ADMIN: "chat.admin"

// Audit actions (add to AUDIT_ACTIONS and auditActionValidator in schema.ts)
CHAT_CHANNELS_INSERT, CHAT_CHANNELS_UPDATE
CHAT_MESSAGES_INSERT, CHAT_MESSAGES_UPDATE
CHAT_MESSAGE_BATCHES_INSERT, CHAT_MESSAGE_BATCHES_UPDATE

// Status colors (follow existing Record<Status, string> pattern)
CHAT_MESSAGE_STATUS_COLORS: Record<ChatMessageStatus, string>
CHAT_BATCH_STATUS_COLORS: Record<ChatBatchStatus, string>

// System config keys + defaults (seed picks these up via SYSTEM_CONFIG_DEFAULTS)
chat_ai_model          (default: "gpt-4o-mini")
chat_batch_window_ms   (default: "5000")
chat_max_message_length (default: "2000")
chat_pii_fail_action   (default: "admin_review")
```

---

## CODEBASE PATTERNS (MUST FOLLOW)

### 1. Import Pattern

```typescript
// ALWAYS import from functions.ts, NOT _generated/server
import { mutation, query, internalMutation, internalQuery } from "./functions";
import { requirePermission, requireAdmin, requireAuth } from "./auth.helpers";
import { internal } from "./_generated/api";
import { v } from "convex/values";
```

### 2. Schema Validator + Table Pattern

```typescript
// Define validators at top of schema.ts, before defineSchema
const chatChannelStatusValidator = v.union(
  v.literal("ACTIVE"),
  v.literal("ARCHIVED"),
);

// Then in defineSchema:
chat_channels: defineTable({
  inquiry_id: v.id("tenant_inquiries"),
  status: chatChannelStatusValidator,
  // ...
})
  .index("by_inquiry_id", ["inquiry_id"])
  .index("by_status", ["status"]),
```

### 3. AUDITED_TABLES Registration

```typescript
// In convex/functions.ts — add all 4 chat tables
const AUDITED_TABLES = [
  "users",
  "roles" /* ... existing ... */,
  ,
  "chat_channels",
  "chat_messages",
  "chat_message_batches",
  "chat_read_receipts",
];
```

### 4. Enum Declaration Pattern

```typescript
export const CHAT_CHANNEL_STATUS = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const satisfies Record<string, string>;
export type ChatChannelStatus = (typeof CHAT_CHANNEL_STATUS)[keyof typeof CHAT_CHANNEL_STATUS];
```

### 5. Convex Action (External API) Pattern

```typescript
// convex/actions/chatAI.ts — follow convex/actions/workos.ts pattern
"use node";
import { action } from "../_generated/server";
// Access OpenAI key via process.env.OPENAI_API_KEY (Convex env var, NOT .env.local)
// Write results back via ctx.runMutation(internal.chatBatching.deliverBatch, {...})
// Actions have NO direct ctx.db access — use ctx.runMutation / ctx.runQuery
```

### 6. Rate Limiter Pattern

```typescript
// convex/rateLimiter.ts — add alongside existing limiters
"chat:send_message": { kind: "fixed window", rate: 20, period: 60000 },
```

### 7. System Config Defaults

```typescript
// System config defaults flow through SYSTEM_CONFIG_DEFAULTS in convex/seed.ts
// Add new chat keys there — seed picks them up automatically on next run
```

### 8. Admin Page Permission Gating

```typescript
// Follow existing admin page pattern
const { user } = useAuthCheck({ requiredPermission: PERMISSIONS.CHAT_ADMIN });
```

### 9. Admin Nav Items

```typescript
// src/components/admin/admin-nav-items.ts — add alongside existing entries
{ title: "Chat Monitor", href: "/admin/chat-monitor", icon: MessageSquare, permission: "chat.admin" },
```

### 10. Status Transition Validation

```typescript
// lib/chat.ts — follow lib/referral.ts pattern
export function validateChannelTransition(
  current: ChatChannelStatus,
  next: ChatChannelStatus,
): boolean {
  const valid: Record<ChatChannelStatus, readonly ChatChannelStatus[]> = {
    ACTIVE: ["ARCHIVED"],
    ARCHIVED: [],
  };
  return (valid[current] ?? []).includes(next);
}
```

---

## BUSINESS RULES (NON-NEGOTIABLE)

1. **One active channel per inquiry** — `create` mutation must check for an existing ACTIVE channel on the same `inquiry_id` and reject duplicates.
2. **Channel is admin-opened only** — tenants and owners cannot create channels. Only admins.
3. **Sender role derived from auth** — never trust a client-provided role. Derive TENANT/OWNER/OPS from the authenticated user record.
4. **Guards cannot send messages in P24** — only TENANT, OWNER, OPS, and SYSTEM sender roles are valid.
5. **Fail-closed PII masking** — if the post-check regex finds PII in AI output, the message MUST transition to FAILED with `admin_review_required=true`. No exceptions.
6. **Sender sees original + masked** — receiver sees masked only — admin sees both.
7. **Batching is channel + sender scoped** — messages from different senders in the same channel go into separate batches.
8. **Insert-only batching** — to avoid OCC conflicts, never update batch documents during the collection window. Only update on flush.
9. **5-second batch window** — configurable via `chat_batch_window_ms` system config key.
10. **Max message length** — enforce `chat_max_message_length` (default 2000 chars) at send time, before any batching.
11. **Rate limiting** — 20 messages/minute per user via `chat:send_message` rate limiter.
12. **Read receipts are per-user per-channel** — use upsert pattern. Never patch message documents for read state.
13. **No owner invite in P24** — owner joins chat only after the P25 invite flow. Do not implement invite links here.
14. **No deal checklist in P24** — this phase is purely chat transport. Checklist is P25.
15. **OpenAI API key** — stored as a Convex environment variable (`OPENAI_API_KEY`), accessed via `process.env.OPENAI_API_KEY` in the Action. NOT from `.env.local`.
16. **All timestamps Unix ms** — `Date.now()`. No string dates anywhere.
17. **Structured JSON output from AI** — rewrite response must include `rewritten_text`, `pii_detected`, and `has_pii` fields.
18. **Temperature 0.1** — use for all AI rewrite calls to maximize consistency.
19. **Retry with exponential backoff** — max 3 attempts, 30-second timeout per attempt.
20. **Pre-mask before AI** — replace obvious PII with `[PHONE]`, `[EMAIL]` placeholders before sending text to the model.

---

## PII MASKING PIPELINE (E03)

The full pipeline runs inside the AI action for each batch:

```
1. preScanForPII(originalText)
   — regex patterns: Indian phone numbers, email addresses, social handles, WhatsApp variants

2. preMask(originalText, matches)
   — replace detected PII with [PHONE], [EMAIL], [HANDLE] placeholders

3. AI rewrite (GPT-4o-mini)
   — professional tone rewrite + contextual masking
   — structured JSON output: { rewritten_text, pii_detected, has_pii }
   — temperature: 0.1

4. postCheckForPII(aiOutput.rewritten_text)
   — same regex patterns as step 1

5a. IF post-check finds PII:
    → message status → FAILED
    → admin_review_required = true
    → batch status → FAILED
    → failure_reason = "pii_detected_in_output"

5b. IF post-check is clean:
    → message status → DELIVERED
    → masked_content = aiOutput.rewritten_text
    → batch status → DELIVERED
```

All regex patterns live in `lib/chat.ts`. The action in `convex/actions/chatAI.ts` imports them.

---

## HOOK INTEGRATION POINTS

No hooks into existing mutations are required for P24. Chat channels are created independently by admin. The only integration point is:

- **Admin inquiry detail page** (E04): Add a "Open Chat" button that calls `chatChannels.create` with the `inquiry_id`. This is a UI addition, not a mutation hook.

---

## FILES TO CREATE

| File                                          | Purpose                                                      |
| --------------------------------------------- | ------------------------------------------------------------ |
| `convex/chatChannels.ts`                      | Channel lifecycle: create, archive, queries                  |
| `convex/chatMessages.ts`                      | Message send, list, internal status mutations                |
| `convex/chatBatching.ts`                      | Batch queue, process, deliver with convex-batch-processor    |
| `convex/chatReadReceipts.ts`                  | Read receipt upsert and unread count query                   |
| `convex/chatAIMonitor.ts`                     | Admin monitoring queries + approve/reject flagged messages   |
| `convex/actions/chatAI.ts`                    | OpenAI action wrapper with retry and timeout                 |
| `lib/chat.ts`                                 | Transition validators, PII regex patterns, scanner utilities |
| `src/components/chat/MessageBubble.tsx`       | Message display with sender/receiver variants                |
| `src/components/chat/MessageList.tsx`         | Paginated message list with auto-scroll                      |
| `src/components/chat/SenderPreview.tsx`       | Original vs masked comparison for sender                     |
| `src/components/chat/SystemMessage.tsx`       | Channel event displays (channel opened, archived)            |
| `src/components/chat/ChatInput.tsx`           | Textarea + send button + character counter                   |
| `src/components/chat/ChatView.tsx`            | Composed chat experience (header + list + input)             |
| `src/app/(admin)/admin/chat-monitor/page.tsx` | Admin chat monitor page                                      |

---

## FILES TO MODIFY

| File                                      | Changes                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `convex/schema.ts`                        | Add 4 chat tables + validators + audit actions to `auditActionValidator`     |
| `convex/functions.ts`                     | Add 4 tables to `AUDITED_TABLES`                                             |
| `lib/constants.ts`                        | Add 4 enums, types, colors, permissions, audit actions, config keys/defaults |
| `convex/rateLimiter.ts`                   | Add `chat:send_message` rate limiter                                         |
| `convex/seed.ts`                          | Add chat config defaults to `SYSTEM_CONFIG_DEFAULTS`                         |
| `convex/convex.config.ts`                 | Register `convex-batch-processor` component                                  |
| `src/components/admin/admin-nav-items.ts` | Add Chat Monitor nav entry                                                   |
| `notes/04-state-machines.md`              | Add chat channel, message, and batch status transitions                      |
| `notes/10-convex-schema.md`               | Add 4 chat table definitions                                                 |
| `notes/13-constants-reference.md`         | Add chat enums reference                                                     |

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

Read the task spec: `tasks/phase-24-chat-infrastructure/[P24-EXX-file].md`

Also read these files for patterns to follow:
- `convex/tenantInquiries.ts` — mutation/query structure, auth patterns, status transitions
- `convex/functions.ts` — audit trigger pattern, AUDITED_TABLES
- `convex/actions/workos.ts` — Action pattern for external API calls
- `lib/constants.ts` — enum pattern, labels, colors, permissions
- `convex/rateLimiter.ts` — rate limiter config pattern

[PASTE THE RELEVANT SECTION FROM THIS PROMPT — schema, state machines, business rules, PII pipeline, etc.]

MUST DO:
- Follow existing patterns EXACTLY (imports from ./functions, auth checks, status validation)
- All timestamps as Unix ms (Date.now()), no string dates
- All status transitions validated against state machine in lib/chat.ts
- Add all 4 new tables to AUDITED_TABLES in functions.ts
- Create validators in schema.ts for all new enums
- Use ACTIVE/ARCHIVED for channel status (NOT OPEN/CLOSED)
- Use inquiry_id (NOT tenant_inquiry_id) for the channel → inquiry link
- Derive sender_role from auth — never trust client-provided role
- Run `npx convex dev` after schema changes to verify compilation

MUST NOT DO:
- Do NOT use `as any`, `@ts-ignore`, or `@ts-expect-error`
- Do NOT import from `_generated/server` — use `./functions`
- Do NOT allow tenants/owners to create channels — admin only
- Do NOT allow guards to send messages in P24
- Do NOT implement owner invite flow — that is P25
- Do NOT implement deal checklist — that is P25
- Do NOT implement ARCHIVED → ACTIVE reopen — that is P25
- Do NOT read OPENAI_API_KEY from .env.local — use process.env in the Action
- Do NOT update batch documents during collection window — insert-only until flush
```

---

## ORACLE VALIDATION PROMPT TEMPLATE

After each epic is implemented, fire oracle with:

```
FIRST STEP: Read `AGENTS.md` in the project root.

I just completed implementing [Epic ID] of Phase 24 (Chat Infrastructure). Review the implementation for correctness.

Read these files:
[list all files created/modified in this epic]

Check for:
1. PATTERN COMPLIANCE: Do all mutations follow auth→validate→fetch→insert pattern from tenantInquiries.ts?
2. STATUS MACHINES: Are all transitions validated against the state machines in lib/chat.ts?
3. SCHEMA NAMING: Does the schema use `inquiry_id` (not `tenant_inquiry_id`) and ACTIVE/ARCHIVED (not OPEN/CLOSED)?
4. SENDER ROLE DERIVATION: Is sender_role always derived from auth, never from client input?
5. AUDIT INTEGRATION: Are all 4 tables in AUDITED_TABLES? Are audit actions in the validator?
6. FAIL-CLOSED PII: Does the post-check failure path set FAILED + admin_review_required=true with no bypass?
7. BATCHING SAFETY: Is the batch collection window insert-only? No updates during collection?
8. RATE LIMITING: Is `chat:send_message` limiter applied before any message processing?
9. TYPE SAFETY: No `as any`, no `@ts-ignore`, no untyped parameters?
10. CONSTANTS COMPLETENESS: All 4 enums, types, colors, permissions, audit actions, config keys added?
11. P24 SCOPE: No owner invite, no deal checklist, no ARCHIVED→ACTIVE reopen implemented?
12. OPENAI KEY: Is the API key read from process.env (Convex env var), not .env.local?

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

## i18n KEYS

Chat UI is English-only in V1. No translation keys are needed for this phase.

Guard portal i18n does NOT extend to chat. Chat is a tenant/owner/ops surface. Do not add any keys to `messages/en.json`, `messages/hi.json`, or `messages/hinglish.json`.

---

## npm DEPENDENCIES TO ADD

| Package                  | Epic    | Purpose                                  |
| ------------------------ | ------- | ---------------------------------------- |
| `openai`                 | E03-T01 | OpenAI SDK for GPT-4o-mini rewrite calls |
| `convex-batch-processor` | E02-T03 | 5-second batch window management         |

Install both before starting E02:

```bash
npm install openai convex-batch-processor
```

Register `convex-batch-processor` as a component in `convex/convex.config.ts` following the existing `rateLimiter` and `aggregate` registration pattern.

---

## SKILLS TO LOAD PER AGENT

| Agent Type             | Skills                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Deep (backend E01-E03) | `["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "task-planner"]`                   |
| Deep (frontend E04)    | `["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "task-planner", "frontend-ui-ux"]` |
| Oracle (validation)    | `["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]`                                   |
| Librarian (research)   | `[]` (no project skills needed)                                                           |

---

## ESTIMATED SCOPE

| Epic | Tasks | Complexity | New Files                                                                          | Modified Files                                                                        |
| ---- | ----- | ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E01  | 4     | Medium     | 1 (`lib/chat.ts`)                                                                  | 5 (`schema.ts`, `constants.ts`, `functions.ts`, `rateLimiter.ts`, `seed.ts`) + 3 docs |
| E02  | 4     | High       | 4 (`chatChannels.ts`, `chatMessages.ts`, `chatBatching.ts`, `chatReadReceipts.ts`) | 2 (`convex.config.ts`, `package.json`)                                                |
| E03  | 3     | Highest    | 2 (`actions/chatAI.ts`, `chatAIMonitor.ts`)                                        | 2 (`chatBatching.ts`, `chatMessages.ts`)                                              |
| E04  | 4     | Medium     | 7 (6 chat components + admin monitor page)                                         | 2 (`admin-nav-items.ts`, inquiry detail integration)                                  |

---

## GO

Start with E01. Read the task spec file first. Fire a librarian to check the latest `convex-batch-processor` and `openai` SDK docs if unsure about any API signatures. Then fire a deep agent with the full context above. Validate with oracle. Repeat for each epic in order.

Good luck.
