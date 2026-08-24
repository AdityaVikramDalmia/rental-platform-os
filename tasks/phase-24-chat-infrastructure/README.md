# Phase 24: Chat Infrastructure (P24)

## Overview

Phase 24 is the first implementation phase split from the original Phase 23 Deal Communication scope. It delivers the core chat transport layer: per-inquiry channels, real-time message flow, batching, layered AI masking, and admin monitoring primitives. This phase intentionally stops at infrastructure so P25 (deal room features) and P26 (rent negotiation) can build on stable chat rails.

**Key Decisions (Oracle-validated)**:

- Use `convex-batch-processor` component for 5-second message batching and enforce an insert-only batching pattern to avoid OCC conflicts.
- Use layered PII masking: regex pre-scan -> GPT-4o-mini rewrite -> regex post-check -> fail-closed to admin review; do not use Presidio (Python-only, cannot run in Convex Actions).
- GPT-4o-mini operating cost is approximately $0.09 per 1,000 messages, which is negligible for V1 chat volume.
- Keep schema extensible: `sender_role` supports future guard<->admin chat without table redesign.
- Model channels per inquiry (not per listing) to match the P19 tenant inquiry lifecycle.

## Dependencies

- P01-E01 (auth and role foundations required for sender identity and permissions)
- P19-E01 (tenant inquiry schema plus `TENANT`/`OWNER` user types required for participant modeling)

**Note**: Original P23 bundled chat + checklist + negotiation. Phase split enforces execution order: P24 (infrastructure) -> P25 (deal room features) -> P26 (rent negotiation).

## Key Documentation

| Doc                                                                | Sections to Read                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [features/18-deal-room.md](../../notes/features/18-deal-room.md)   | AI pipeline, batching flow, channel model, masking rules, schema prerequisites                  |
| [04-state-machines.md](../../notes/04-state-machines.md)           | Chat channel, chat message, and chat batch transition rules                                     |
| [10-convex-schema.md](../../notes/10-convex-schema.md)             | Existing schema patterns; add/update chat-related table definitions and index strategy          |
| [13-constants-reference.md](../../notes/13-constants-reference.md) | Enum patterns, permission naming, audit action naming, system config key conventions            |
| [11-convex-architecture.md](../../notes/11-convex-architecture.md) | Wrapped mutation imports, auth helper usage, Convex action boundaries, real-time query patterns |

## Schema Alerts

- `convex/schema.ts` currently has no `chat_channels`, `chat_messages`, `chat_message_batches`, or `chat_read_receipts` tables.
- `lib/constants.ts` currently has no chat status enums, chat sender role enum, chat permissions, or chat status color maps.
- `lib/constants.ts` and `convex/schema.ts` currently have no chat audit action constants/validators.
- `convex/functions.ts` `AUDITED_TABLES` currently has no chat tables.
- `convex/rateLimiter.ts` currently has no `chat:send_message` limiter key.
- `SYSTEM_CONFIG_DEFAULTS` currently has no chat AI/batch/message-length/fail-action defaults.

## Oracle Clarifications

- Batching must be channel+sender scoped and insert-only to prevent optimistic concurrency conflicts under rapid-fire sends.
- Fail-closed masking is non-negotiable: post-check PII leakage must force `admin_review_required = true` and block delivery.
- Sender/receiver visibility rules are mandatory: sender sees original + masked, receiver sees masked only, admin sees both.
- PII stack must stay platform-native (TypeScript + Convex Action compatible). Presidio is not viable in this runtime.
- P24 does not include owner invite workflows, checklist extraction/sign-off, admin impersonation controls, or negotiation rooms.

## Epics

| ID      | Title                                                                                | Tasks | Status  | Depends On       |
| ------- | ------------------------------------------------------------------------------------ | ----- | ------- | ---------------- |
| P24-E01 | [Chat Schema, Constants & Permissions](P24-E01-chat-schema-constants-permissions.md) | 4     | pending | P01-E01, P19-E01 |
| P24-E02 | [Chat Backend & Batching](P24-E02-chat-backend-batching.md)                          | 4     | pending | P24-E01          |
| P24-E03 | [AI Pipeline](P24-E03-ai-pipeline.md)                                                | 3     | pending | P24-E02          |
| P24-E04 | [Chat UI & Admin Monitor](P24-E04-chat-ui-admin-monitor.md)                          | 4     | pending | P24-E02, P24-E03 |

**Total: 4 epics, 15 tasks**

## Dependency Graph

```
P01-E01 ----\
             +--> P24-E01 --> P24-E02 --> P24-E03 --> P24-E04
P19-E01 ----/                         \--------------->/
```

**Parallel note**: UI shell work in P24-E04 can begin after P24-E02, but flagged-message workflows in the monitor require P24-E03 completion.

## Completion Criteria

- [ ] 4 chat infrastructure tables exist in `convex/schema.ts` with all required fields and indexes
- [ ] Chat tables are added to `AUDITED_TABLES` in `convex/functions.ts`
- [ ] Chat enums, sender roles, status colors, permissions, and audit actions exist in `lib/constants.ts`
- [ ] `chat:send_message` limiter exists in `convex/rateLimiter.ts` (20/minute per user)
- [ ] Chat system config defaults exist in `SYSTEM_CONFIG_DEFAULTS`
- [ ] `lib/chat.ts` exposes transition validators and deterministic PII scanners
- [ ] `convex/chatChannels.ts` supports create/archive/reopen plus admin queries
- [ ] `convex/chatMessages.ts` supports send/list plus internal delivery/failure updates
- [ ] `convex-batch-processor` is integrated with 5-second batching and grouped AI processing
- [ ] Layered masking pipeline (pre-scan -> AI -> post-check -> fail-closed) is implemented
- [ ] `convex/chatReadReceipts.ts` supports mark-read and unread-count queries
- [ ] Admin monitoring queries and approve/reject review mutations exist
- [ ] Chat components and `/admin/chat-monitor` page render with real-time subscriptions
- [ ] `AGENTS.md` updated with new file paths (`convex/chatChannels.ts`, `convex/chatMessages.ts`, `convex/chatBatching.ts`, `convex/chatReadReceipts.ts`, `convex/actions/chatAI.ts`, `src/components/chat/`), new components, and updated Project Structure section
- [ ] `npx convex dev` starts without errors
- [ ] `npm run build` succeeds

## File Tree

```
tasks/phase-24-chat-infrastructure/
|-- README.md
|-- P24-E01-chat-schema-constants-permissions.md
|-- P24-E02-chat-backend-batching.md
|-- P24-E03-ai-pipeline.md
`-- P24-E04-chat-ui-admin-monitor.md
```

## Scope Boundaries

### IN This Phase

- Per-inquiry chat channel foundations and admin-controlled channel lifecycle
- Message ingestion, batching, AI rewrite integration, and delivery/failure statusing
- Layered PII masking with deterministic pre/post checks and admin-review fail-closed flow
- Read receipts, unread count primitives, and real-time paginated message queries
- Chat-focused system config, rate limiting, audit action wiring, and backend monitoring queries
- Foundational chat UI components and embedded chat view composition
- Admin chat monitor page with flagged-message review actions

### NOT In This Phase

- Owner invite token generation, invite acceptance, and invite expiry/regeneration flows -> **P25**
- Deal checklist extraction, item approvals, signatures, and versioning -> **P25**
- Admin impersonation/send-mode god controls and per-message AI toggle -> **P25**
- Three-room negotiation architecture (`OPS_TENANT`, `OPS_OWNER`, `COMBINED`) -> **P26**
- Structured proposal engine, token collection, brokerage negotiation, and closure gate checklist -> **P26**
- Voice/video/file attachments, push notifications, and WhatsApp Business API automation -> **V2**

See [V2 Backlog](../../notes/09-v2-backlog.md) for deferred communication surfaces.
