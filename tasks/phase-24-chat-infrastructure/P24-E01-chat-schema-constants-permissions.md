---
id: P24-E01
title: Chat Schema, Constants & Permissions
phase: 24
status: done
depends_on: ["P01-E01", "P19-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "doc-reconciler"]
updated_at: 2026-02-19
---

# P24-E01: Chat Schema, Constants & Permissions

## Overview

Establish all chat infrastructure primitives before behavioral logic is implemented: schema tables, enums, permissions, audit/rate-limit/config wiring, and shared chat utility helpers. This epic also updates canonical docs so state machines, schema docs, and constants reference stay in sync with implementation.

## Prerequisites

- **Read first**: [P01-E01 Completion Summary](../phase-01-auth/P01-E01-project-scaffolding.md#completion-summary) - wrapped mutations, permission model, and system config seeding patterns.
- **Read first**: [P19-E01 Completion Summary](../phase-19-tenant-inquiry-pipeline/P19-E01-schema-auth-constants.md#completion-summary) - tenant inquiry table and `TENANT`/`OWNER` user-type assumptions used by chat participant roles.
- P01-E01 and P19-E01 must be complete before this epic.
- **Codebase facts to verify before starting**:
  - `convex/schema.ts` currently has no chat tables and no chat-specific audit validators.
  - `lib/constants.ts` currently has no chat enums, chat permissions, chat status colors, or chat config keys.
  - `convex/functions.ts` currently has no chat tables in `AUDITED_TABLES`.
  - `convex/rateLimiter.ts` currently has no `chat:send_message` key.

## Task Queue

- [x] P24-E01-T01: Schema - Add 4 Chat Tables
- [x] P24-E01-T02: Constants, Permissions, Rate Limiter, Audit Actions
- [x] P24-E01-T03: Chat Validators and Shared Utilities
- [x] P24-E01-T04: State Machine Documentation

---

## T01: Schema - Add 4 Chat Tables

### Objective

Add all required chat infrastructure tables and indexes to `convex/schema.ts` plus audit trigger coverage, so later epics can build behavior without schema drift.

### Required Reading

- `notes/features/18-deal-room.md` - message flow, channel scope, and schema prerequisite sections
- `notes/10-convex-schema.md` - table/validator/index conventions used in this codebase
- `notes/11-convex-architecture.md` - wrapped mutation + audit trigger expectations
- `convex/schema.ts` - current validator declarations and table ordering patterns
- `convex/functions.ts` - `AUDITED_TABLES` trigger wiring

### Key Rules

1. Add `chat_channels` to `convex/schema.ts` with fields: `inquiry_id: v.id("tenant_inquiries")`, `status` (`ACTIVE`/`ARCHIVED`), `created_by_admin_id`, `created_at`; indexes: `by_inquiry_id`, `by_status`.
2. Add `chat_messages` with fields: `channel_id`, `sender_user_id`, `sender_role` (`TENANT`/`OWNER`/`OPS`/`SYSTEM`), `original_content`, optional `masked_content`, optional `batch_id`, `status` (`SUBMITTED`/`BATCHED`/`PROCESSING`/`DELIVERED`/`FAILED`), optional `failure_reason`, `admin_review_required`, `is_ai_processed`, `created_at`; indexes: `by_channel_id`, `by_batch_id`, `by_status`, `by_channel_and_created` (`channel_id`, `created_at`).
3. Add `chat_message_batches` with fields: `channel_id`, `sender_user_id`, `messages: v.array(v.id("chat_messages"))`, `combined_original`, optional `masked_content`, optional `pii_detected: v.array(v.string())`, `status` (`COLLECTING`/`PROCESSING`/`DELIVERED`/`FAILED`), optional `failure_reason`, `created_at`, optional `processed_at`; indexes: `by_channel_id`, `by_status`, `by_channel_and_created` (`channel_id`, `created_at`).
4. Add `chat_read_receipts` with fields: `channel_id`, `user_id`, `last_read_message_id`, `last_read_at`; index: `by_channel_and_user` (`channel_id`, `user_id`).
5. Add `chat_channels`, `chat_messages`, `chat_message_batches`, and `chat_read_receipts` to `AUDITED_TABLES` in `convex/functions.ts`.
6. Keep all date/timestamp fields as Unix milliseconds (`v.number()`), and do not introduce string date storage.
7. Keep message content fields as plain strings; masking and PII metadata are behavioral concerns handled in later epics.
8. Use existing validator declaration style (`const ...Validator = v.union(...)`) where consistent with file conventions.
9. Do not implement mutations/queries/actions in this task.

### Deliverables

- [ ] `convex/schema.ts` - new chat table validators + table definitions + indexes
- [ ] `convex/functions.ts` - chat tables added to `AUDITED_TABLES`

### Acceptance Criteria

1. All four chat tables exist with exact required fields and index names.
2. `chat_messages.status` includes all five statuses (`SUBMITTED`, `BATCHED`, `PROCESSING`, `DELIVERED`, `FAILED`).
3. `chat_message_batches.status` includes all four statuses (`COLLECTING`, `PROCESSING`, `DELIVERED`, `FAILED`).
4. `chat_read_receipts` has compound index `by_channel_and_user`.
5. `AUDITED_TABLES` includes all four new chat tables.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts` and `convex/functions.ts`.

### Out of Scope

- Chat channel/message mutation/query implementation
- AI masking implementation
- UI components and admin monitor page
- `closures.deal_checklist_id` deferred to P25-E01-T01 (requires deal_checklists table to exist first)

---

## T02: Constants, Permissions, Rate Limiter, Audit Actions

### Objective

Add all chat domain constants and operational wiring so permission checks, audit trails, status rendering, rate limiting, and chat config defaults are consistent across backend and frontend.

### Required Reading

- `notes/13-constants-reference.md` - enum, permission, audit action, and config-key naming conventions
- `notes/04-state-machines.md` - expected transition states for channel/message/batch lifecycles
- `lib/constants.ts` - enum/type/color map/permission/system-config patterns
- `convex/schema.ts` - `auditActionValidator` and `systemConfigKeyValidator` patterns
- `convex/rateLimiter.ts` - key naming and fixed-window setup style
- `convex/seed.ts` - idempotent config seeding via `SYSTEM_CONFIG_DEFAULTS`

### Key Rules

1. Add enums + exported types in `lib/constants.ts`:
   - `CHAT_CHANNEL_STATUS`: `ACTIVE`, `ARCHIVED`
   - `CHAT_MESSAGE_STATUS`: `SUBMITTED`, `BATCHED`, `PROCESSING`, `DELIVERED`, `FAILED`
   - `CHAT_BATCH_STATUS`: `COLLECTING`, `PROCESSING`, `DELIVERED`, `FAILED`
   - `CHAT_SENDER_ROLE`: `TENANT`, `OWNER`, `OPS`, `SYSTEM`
2. Add `CHAT_MESSAGE_STATUS_COLORS` and `CHAT_BATCH_STATUS_COLORS` maps with full enum coverage.
3. Add chat permissions to `PERMISSIONS`: `CHAT_VIEW`, `CHAT_SEND`, `CHAT_MODERATE`, `CHAT_ADMIN`.
4. Add chat audit action constants to both `lib/constants.ts` and `convex/schema.ts` validator:
   - `CHAT_CHANNELS_INSERT`, `CHAT_CHANNELS_UPDATE`
   - `CHAT_MESSAGES_INSERT`, `CHAT_MESSAGES_UPDATE`
   - `CHAT_MESSAGE_BATCHES_INSERT`, `CHAT_MESSAGE_BATCHES_UPDATE`
5. Add `chat:send_message` fixed-window limiter in `convex/rateLimiter.ts` at 20 requests/minute per user key.
6. Add system config keys in `SYSTEM_CONFIG_KEYS`:
   - `chat_ai_model` (default: `"gpt-4o-mini"`)
   - `chat_batch_window_ms` (default: `"5000"`)
   - `chat_max_message_length` (default: `"2000"`)
   - `chat_pii_fail_action` (default: `"admin_review"`)
7. Add the same four defaults to `SYSTEM_CONFIG_DEFAULTS` and ensure seed logic stays idempotent.
8. Keep system-config values JSON-encoded strings in defaults; parse at runtime where used.
9. Preserve typing patterns (`as const satisfies Record<...>`) and do not break `ALL_PERMISSIONS` derivation.
10. Do not introduce legacy `OPEN`/`CLOSED` chat constants in this task; use `ACTIVE`/`ARCHIVED` only.

### Deliverables

- [ ] `lib/constants.ts` - chat enums, types, colors, permissions, audit actions, config keys/defaults
- [ ] `convex/schema.ts` - chat audit actions added to `auditActionValidator` and config keys validator updates
- [ ] `convex/rateLimiter.ts` - `chat:send_message` limiter key
- [ ] `convex/seed.ts` - config defaults flow picks up new chat settings via `SYSTEM_CONFIG_DEFAULTS`

### Acceptance Criteria

1. Chat enum sets in `lib/constants.ts` exactly match required values.
2. Chat status color maps exist and cover all statuses with no missing keys.
3. `PERMISSIONS` includes the four chat permission keys and exports them via `ALL_PERMISSIONS`.
4. Audit constants/validators include all six chat action strings.
5. `chat:send_message` limiter exists with 20/minute fixed-window configuration.
6. `SYSTEM_CONFIG_DEFAULTS` includes all four chat config defaults.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/constants.ts`, `convex/schema.ts`, `convex/rateLimiter.ts`, and `convex/seed.ts`.

### Out of Scope

- Chat behavior mutations/actions
- UI rendering of status colors
- Monitoring dashboards and review queues

---

## T03: Chat Validators and Shared Utilities

### Objective

Create reusable chat-domain utilities for status transition validation and deterministic PII scanning so all backend chat modules share one canonical rules layer.

### Required Reading

- `notes/04-state-machines.md` - transition legality for chat channel/message/batch states
- `notes/features/18-deal-room.md` - AI masking rules and sensitive-data categories
- `lib/constants.ts` - enum typing conventions for helper signatures
- `lib/validators.ts` - utility style and deterministic validation patterns

### Key Rules

1. Create `lib/chat.ts` containing only pure utility logic (no DB access, no Convex runtime imports).
2. Implement `validateChatTransition(from, to)` for `CHAT_CHANNEL_STATUS` transitions.
3. Implement `validateMessageTransition(from, to)` for `CHAT_MESSAGE_STATUS` transitions.
4. Implement `validateBatchTransition(from, to)` for `CHAT_BATCH_STATUS` transitions.
5. Add `INDIAN_PII_PATTERNS` covering at minimum:
   - Indian mobile numbers (`/[6-9]\d{9}/` with boundary-safe matching)
   - Email addresses
   - Social handles (`@handle` style)
   - WhatsApp-oriented contact variants (e.g., `whatsapp`, `wa.me`, prefixed numbers)
6. Implement `preScanForPII(text: string): PIIMatch[]` using deterministic regex scanning.
7. Implement `postCheckForPII(text: string): PIIMatch[]` using the same scanner logic as pre-scan.
8. Define and export a typed `PIIMatch` shape including at least detection type and matched value; include optional index metadata if used.
9. Keep regex and utility behavior deterministic and side-effect free for backend testability.
10. Do not add AI provider calls in this task.

### Deliverables

- [ ] `lib/chat.ts` - transition validators, PII patterns, `preScanForPII`, `postCheckForPII`, and `PIIMatch` type

### Acceptance Criteria

1. `lib/chat.ts` exports all three transition validators and both PII scanner functions.
2. Transition validators reject illegal transitions and allow only documented legal transitions.
3. PII scanner detects Indian phone/email/handle/WhatsApp patterns deterministically.
4. `postCheckForPII` behavior is equivalent to `preScanForPII` scanner logic.
5. Module has no Convex-specific imports and is reusable across backend/frontend code.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/chat.ts`.

### Out of Scope

- OpenAI rewrite integration
- Message mutation wiring to scanner utilities
- Admin review workflow actions

---

## T04: State Machine Documentation

### Objective

Update canonical docs to include new chat transitions and schema/constants references so implementation work in E02-E04 has accurate source-of-truth documentation.

### Required Reading

- `notes/04-state-machines.md` - current transition section formatting and validation snippet conventions
- `notes/10-convex-schema.md` - schema table documentation style and index rationale sections
- `notes/13-constants-reference.md` - enum/permission/audit/config documentation structure
- `tasks/phase-24-chat-infrastructure/README.md` - phase-level scope and naming consistency

### Key Rules

1. Add/refresh chat channel transition documentation in `notes/04-state-machines.md` with `ACTIVE`/`ARCHIVED` terminology.
2. Add/refresh chat message transition documentation in `notes/04-state-machines.md` for `SUBMITTED`/`BATCHED`/`PROCESSING`/`DELIVERED`/`FAILED`.
3. Add/refresh chat batch transition documentation in `notes/04-state-machines.md` for `COLLECTING`/`PROCESSING`/`DELIVERED`/`FAILED`.
4. Add chat table definitions and indexes to `notes/10-convex-schema.md` for `chat_channels`, `chat_messages`, `chat_message_batches`, and `chat_read_receipts`.
5. Add chat enums to `notes/13-constants-reference.md` including channel/message/batch statuses and sender roles.
6. Keep terminology consistent across all docs (use `OPS`, not `ADMIN`, for `CHAT_SENDER_ROLE` in P24).
7. Update any impacted cross-references in the touched docs to avoid anchor drift.
8. Do not document P25/P26 features in this task beyond forward-compat references.

### Deliverables

- [ ] `notes/04-state-machines.md` - chat channel/message/batch transitions updated
- [ ] `notes/10-convex-schema.md` - chat tables documented
- [ ] `notes/13-constants-reference.md` - chat enums and related references updated

### Acceptance Criteria

1. State machine doc contains explicit transition tables for chat channel, message, and batch statuses using P24 enum names.
2. Schema doc includes all four chat tables with required fields and indexes.
3. Constants doc includes all new chat enums and terminology aligned with implementation.
4. Cross-links in touched docs remain valid.
5. `npx tsc --noEmit` passes (no type regressions from adjacent code edits).

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `notes/04-state-machines.md`, `notes/10-convex-schema.md`, and `notes/13-constants-reference.md`.

### Out of Scope

- Backend chat function implementation
- UI implementation and screenshots
- Verification runbook artifacts

---

## Out of Scope (All Tasks)

- `convex/chatChannels.ts`, `convex/chatMessages.ts`, and `convex/chatBatching.ts` behavior implementation (P24-E02)
- OpenAI action and layered masking orchestration (P24-E03)
- Chat UI components and admin monitor page implementation (P24-E04)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
