---
id: P24-E02
title: Chat Backend & Batching
phase: 24
status: pending
depends_on: ["P24-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-18
---

# P24-E02: Chat Backend & Batching

## Overview

Implement core backend behavior for chat channels, message send/list flows, batching orchestration hooks, and read receipts on top of P24-E01 schema/constants foundations. This epic defines transport behavior and reliability semantics, but does not yet implement the full AI pipeline logic.

## Prerequisites

- **Read first**: [P24-E01 Completion Summary](P24-E01-chat-schema-constants-permissions.md#completion-summary) - chat schema/constants/audit/rate-limit primitives must be in place.
- Chat tables, chat enums, and chat permissions from E01 must compile and be available in generated types.
- `lib/chat.ts` transition validators and PII scanner utilities from E01-T03 must exist.
- `chat:send_message` limiter key must already exist in `convex/rateLimiter.ts`.

## Task Queue

- [x] P24-E02-T01: Chat Channel Mutations + Queries
- [x] P24-E02-T02: Chat Message Send + List
- [x] P24-E02-T03: Batch Processing Integration
- [x] P24-E02-T04: Read Receipts

---

## T01: Chat Channel Mutations + Queries

### Objective

Create channel lifecycle and retrieval functions in `convex/chatChannels.ts` so admins can open/archive/reopen channels and query them safely by inquiry or id.

### Required Reading

- `notes/features/18-deal-room.md` - channel model and per-inquiry scoping rules
- `notes/04-state-machines.md` - chat channel transitions
- `notes/11-convex-architecture.md` - wrapped mutation imports and auth helper patterns
- `convex/auth.helpers.ts` - `requirePermission` usage
- `convex/tenantInquiries.ts` (if present from P19) - inquiry lookup patterns

### Key Rules

1. Create `convex/chatChannels.ts` and import `mutation`/`query` from `./functions` only.
2. Implement admin-only mutations:
   - `create` (links channel to tenant inquiry)
   - `archive`
   - `reopen`
3. `create` must verify target inquiry exists and reject if an active channel already exists for the same inquiry.
4. Enforce channel transition legality using `validateChatTransition` from `lib/chat.ts`.
5. Set timestamps with `Date.now()` Unix milliseconds (`created_at`, archive/reopen transition timestamps if tracked).
6. Implement queries:
   - `getByInquiryId`
   - `getById`
   - `listForAdmin` (paginated)
7. `listForAdmin` must support admin filtering by status and order newest first.
8. Ensure admin permission checks use chat-specific permission constants from `lib/constants.ts`.
9. Keep channel uniqueness per inquiry enforced at mutation level (one active channel per inquiry).
10. Do not add owner invite token flow in this task.

### Deliverables

- [ ] `convex/chatChannels.ts` - `create`, `archive`, `reopen`, `getByInquiryId`, `getById`, `listForAdmin`

### Acceptance Criteria

1. Admin can create one active channel per inquiry; duplicate active create attempts are rejected.
2. Archive/reopen mutations reject illegal transitions and enforce admin permissions.
3. `getByInquiryId` and `getById` return channel data correctly for authorized access.
4. `listForAdmin` paginates and filters channels by status.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/chatChannels.ts`.

### Out of Scope

- Message send/list behavior
- AI masking and batch processing internals
- Admin monitor UI

---

## T02: Chat Message Send + List

### Objective

Implement message send/list primitives in `convex/chatMessages.ts` including sender validation, status initialization, and internal delivery/failure mutation hooks.

### Required Reading

- `notes/features/18-deal-room.md` - sender/receiver behavior and message flow
- `notes/04-state-machines.md` - message lifecycle transitions
- `notes/11-convex-architecture.md` - rate-limiter and wrapped mutation conventions
- `convex/rateLimiter.ts` - key usage pattern (`rateLimiter.limit`/`rateLimiter.check`)
- `lib/chat.ts` - `validateMessageTransition`

### Key Rules

1. Create `convex/chatMessages.ts` with wrapped exports from `./functions`.
2. Implement `send` mutation:
   - rate-limited by `chat:send_message` (20/minute per user)
   - validates channel is `ACTIVE`
   - validates sender is an allowed participant for that channel
   - derives `sender_role` from authenticated user context (`TENANT`/`OWNER`/`OPS`)
   - inserts message with `status = SUBMITTED`, `admin_review_required = false`, `is_ai_processed = false`
3. `send` should enqueue/schedule batching work after insert (hand-off to E02-T03 queue function).
4. Implement internal mutations:
   - `markDelivered`
   - `markFailed`
     Both must validate legal status transitions through `validateMessageTransition`.
5. Implement queries:
   - `listByChannel` (paginated, ordered by `created_at` desc)
   - `getById`
6. Enforce max message length from system config (`chat_max_message_length`) with default fallback.
7. Preserve original user text in `original_content`; masked text is written later by pipeline.
8. Do not allow guards to send chat messages in P24.
9. Keep all timestamps in Unix ms and no float math for counters/limits.
10. Do not implement AI call logic in this task.

### Deliverables

- [ ] `convex/chatMessages.ts` - `send`, `markDelivered`, `markFailed`, `listByChannel`, `getById`

### Acceptance Criteria

1. `send` writes `SUBMITTED` messages for valid participants and rejects archived channels.
2. Sender role is derived from identity and persisted as one of `TENANT`/`OWNER`/`OPS`.
3. `send` enforces `chat:send_message` limits and message-length guardrails.
4. `listByChannel` paginates in reverse chronological order using the compound index.
5. Internal status update mutations enforce legal transitions.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/chatMessages.ts`.

### Out of Scope

- Batch grouping implementation details
- OpenAI integration and masking pipeline
- Read receipt mutations/queries

---

## T03: Batch Processing Integration

### Objective

Wire message batching infrastructure using `convex-batch-processor` so submitted messages are grouped by channel+sender in a 5-second window and processed through internal delivery pathways.

### Required Reading

- `notes/features/18-deal-room.md` - batching rationale and processing sequence
- `notes/11-convex-architecture.md` - actions vs mutations boundaries and scheduler usage
- `convex/convex.config.ts` - current component registration pattern (see how `rateLimiter` and `aggregate` are registered)
- `lib/chat.ts` - batch transition helper usage
- `convex/chatMessages.ts` - send hooks from T02

### Key Rules

1. First, install the convex-batch-processor component: `npm install convex-batch-processor`.
2. Register the batch processor component in `convex/convex.config.ts` following the existing component registration pattern (see how `rateLimiter` is registered).
3. Register batch-processor component in `convex/convex.config.ts`: `app.use(batchProcessor)` following the existing pattern.
4. Configure flush window to 5 seconds (`flushIntervalMs = 5000`) with system-config override support in later AI task.
5. Create `convex/chatBatching.ts` with:
   - `queueMessage` mutation
   - `processBatch` internal action
   - `deliverBatch` internal mutation
6. Group batching by `(channel_id, sender_user_id)` and keep ingestion insert-only to reduce OCC contention.
7. `queueMessage` attaches submitted messages to open batches or creates a new collecting batch.
8. `processBatch` moves batch `COLLECTING -> PROCESSING`, builds `combined_original`, and calls AI pipeline hook (stubbed for E03 integration).
9. `deliverBatch` writes masked output to batch + messages and marks statuses `DELIVERED`.
10. Failures must set both batch/message states to `FAILED` with `failure_reason` and `admin_review_required` where appropriate.
11. Ensure idempotency safeguards so repeated scheduler/action invocations do not double-deliver.
12. Do not embed OpenAI API calls directly in this file; call dedicated action surface from E03.

### Deliverables

- [ ] `package.json` - `convex-batch-processor` dependency added
- [ ] lockfile (`package-lock.json`) updated for new dependency
- [ ] `convex/convex.config.ts` updated with batch-processor component registration
- [ ] `convex/chatBatching.ts` - queue/process/deliver functions with status transitions and failure handling
- [ ] `convex/chatMessages.ts` - send flow integrated with batch queue mutation

### Acceptance Criteria

1. Dependency is installed and Convex compiles with batch processor configuration.
2. Batch processor component registered in `convex/convex.config.ts` alongside existing components.
3. Messages are batched within a 5-second window by channel+sender key.
4. Batch lifecycle transitions follow `COLLECTING -> PROCESSING -> DELIVERED/FAILED`.
5. Delivery mutation updates message rows with masked content/status.
6. Failure path records `failure_reason` and marks records for review.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/chatBatching.ts`, `convex/chatMessages.ts`, and `convex/convex.config.ts`.

### Out of Scope

- Prompt engineering and OpenAI retry policy details
- Monitoring queries/review mutations
- Frontend rendering of batching state

---

## T04: Read Receipts

### Objective

Implement read-receipt persistence and unread counting in `convex/chatReadReceipts.ts` using a separate table to avoid OCC contention with message writes.

### Required Reading

- `notes/features/18-deal-room.md` - read receipt behavior and unread count expectations
- `notes/10-convex-schema.md` - `chat_read_receipts` index conventions
- `notes/11-convex-architecture.md` - query/mutation patterns and auth helper usage
- `convex/chatMessages.ts` - message ordering and status semantics

### Key Rules

1. Create `convex/chatReadReceipts.ts` with wrapped imports from `./functions`.
2. Implement `markRead` mutation that upserts by `(channel_id, user_id)` using `by_channel_and_user` index.
3. `markRead` should persist `last_read_message_id` and `last_read_at = Date.now()`.
4. Implement `getForChannel` query returning all receipts for a channel (admin/authorized participants only).
5. Implement `getUnreadCount` query returning message count newer than caller's receipt position.
6. `getUnreadCount` must exclude messages sent by the current user and count only deliverable statuses.
7. Enforce participant authorization for read/write receipt operations.
8. Keep unread count deterministic and index-backed; avoid full-table scans.
9. Maintain OCC isolation by writing receipts only in `chat_read_receipts`, never patching many message rows for read state.
10. Do not introduce notification side effects in this task.

### Deliverables

- [ ] `convex/chatReadReceipts.ts` - `markRead`, `getForChannel`, `getUnreadCount`

### Acceptance Criteria

1. `markRead` creates or updates one receipt record per `(channel_id, user_id)`.
2. `getForChannel` returns participant receipt snapshots for authorized viewers.
3. `getUnreadCount` correctly computes unread message totals after the caller's last read marker.
4. Read receipt writes do not patch message documents.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/chatReadReceipts.ts`.

### Out of Scope

- Browser push/read notifications
- UI badge rendering
- Admin flagged-message review operations

---

## Out of Scope (All Tasks)

- OpenAI rewrite action implementation and layered PII policy enforcement (P24-E03)
- Chat components and admin monitor page implementation (P24-E04)
- Owner invite flow, checklist extraction/signing, or negotiation-room logic (P25/P26)

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
