---
id: P24-E03
title: AI Pipeline
phase: 24
status: pending
depends_on: ["P24-E02"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-18
---

# P24-E03: AI Pipeline

## Overview

Implement the chat masking intelligence layer: OpenAI rewrite action, layered pre-scan/AI/post-check safety flow, and monitoring/review controls for failed or flagged messages. This epic finalizes delivery semantics for P24 by enforcing fail-closed masking and operational observability.

## Prerequisites

- **Read first**: [P24-E02 Completion Summary](P24-E02-chat-backend-batching.md#completion-summary) - message/batch send and processing hooks must already exist.
- `convex/chatBatching.ts` and `convex/chatMessages.ts` must expose integration points for AI rewrite outcomes.
- Chat system config keys from P24-E01 must exist (`chat_ai_model`, `chat_batch_window_ms`, `chat_max_message_length`, `chat_pii_fail_action`).
- `lib/chat.ts` PII scanner helpers must be available.

## Task Queue

- [x] P24-E03-T01: OpenAI Integration Action
- [x] P24-E03-T02: Layered PII Pipeline
- [x] P24-E03-T03: AI Configuration and Monitoring

---

## T01: OpenAI Integration Action

### Objective

Create the Convex action wrapper that calls OpenAI GPT-4o-mini for professional rewrite + contextual masking and returns structured JSON consumed by batch processing.

### Required Reading

- `notes/features/18-deal-room.md` - AI rewrite rules, preservation rules, and failure handling expectations
- `notes/11-convex-architecture.md` - Convex Action boundaries and `ctx.runMutation` patterns
- `lib/chat.ts` - PII pattern expectations used before/after model call
- `convex/actions/workos.ts` - existing pattern for external API key usage in Convex Actions (uses `process.env.WORKOS_API_KEY`)
- OpenAI package usage in current codebase (if any) and project environment conventions

### Key Rules

1. First, install the openai SDK: `npm install openai`.
2. Create `convex/actions/chatAI.ts` as a Convex Action (external API allowed only here).
3. Use the `openai` npm package with model default `gpt-4o-mini`.
4. Store the OpenAI API key as a Convex environment variable: `npx convex env set OPENAI_API_KEY <key>`. Access in Action via `process.env.OPENAI_API_KEY`. Never import from `.env.local` - Convex Actions run server-side in the Convex deployment.
5. Build system prompt enforcing:
   - professional rewrite
   - PII masking (phone, email, social handles)
   - preservation of property-specific details (flat number, building name, rent/deposit amounts, dates)
6. Require structured JSON output with fields:
   - `rewritten_text`
   - `pii_detected` (array of `{ type, original, replacement }`)
   - `has_pii` (boolean)
7. Set `temperature = 0.1` for consistency.
8. Implement retry with exponential backoff (max 3 attempts).
9. Enforce 30-second timeout per API attempt.
10. On terminal failure, return a machine-readable error payload consumed by batch failure handling.
11. Do not write to DB directly from this action; perform writes via internal mutations.

### Deliverables

- [ ] `convex/actions/chatAI.ts` - OpenAI action adapter with prompting, structured parse, retry, and timeout handling
- [ ] `package.json` updated with `openai` dependency
- [ ] lockfile (`package-lock.json`) updated for `openai` dependency

### Acceptance Criteria

1. Action returns validated structured JSON payload on successful rewrite.
2. Prompt preserves property facts while masking contact PII.
3. OpenAI Action reads API key from Convex environment variable (`process.env.OPENAI_API_KEY`), NOT from `.env.local`.
4. Retry/backoff and timeout behavior are implemented and testable.
5. Failure payload supports downstream batch `FAILED` handling and admin review queueing.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/actions/chatAI.ts`.

### Out of Scope

- Batch orchestration wiring beyond action contract integration
- Admin UI for failure review
- Deal checklist extraction logic

---

## T02: Layered PII Pipeline

### Objective

Implement fail-closed layered masking in batch processing: deterministic pre-scan, AI rewrite, deterministic post-check, and strict review-gating when leakage is detected.

### Required Reading

- `notes/features/18-deal-room.md` - masking policy and sender/receiver visibility expectations
- `lib/chat.ts` - `preScanForPII` / `postCheckForPII`
- `convex/chatBatching.ts` - batch lifecycle and delivery/failure hooks
- `convex/chatMessages.ts` - message status updates and review flags
- `convex/functions.ts` + `audit_logs` patterns - metadata logging conventions

### Key Rules

1. Integrate this exact pipeline order in batch processing:
   1. pre-scan original text
   2. pre-mask obvious PII placeholders
   3. AI rewrite/context masking
   4. post-check AI output
   5. fail-closed if post-check still detects PII
   6. deliver only clean masked output
2. Pre-scan uses `preScanForPII()` from `lib/chat.ts` on original text before model call.
3. Pre-mask obvious patterns before sending to AI (`[PHONE]`, `[EMAIL]`, etc.) while preserving non-PII property terms.
4. Post-check uses `postCheckForPII()` on `rewritten_text` output.
5. If post-check finds PII, set `admin_review_required = true`, set message status to `FAILED`, and persist `failure_reason`.
6. If output is clean, set `masked_content`, mark message/batch `DELIVERED`, and `is_ai_processed = true`.
7. Log all PII detections (pre/AI/post) to audit trail metadata with detection stage, type, and original pattern snippet.
8. Respect `chat_pii_fail_action` config (`admin_review` default) and keep fail-closed as default path.
9. Ensure transition validation uses `validateMessageTransition` and `validateBatchTransition`.
10. Keep pipeline idempotent on retried batch processing.

### Deliverables

- [ ] `convex/chatBatching.ts` - layered masking pipeline integration
- [ ] `convex/chatMessages.ts` - fail-closed message review/failure updates
- [ ] any required internal mutation helpers for PII/audit metadata persistence

### Acceptance Criteria

1. Pre-scan and post-check both run for every AI-processed batch.
2. Obvious phone/email patterns are pre-masked before model invocation.
3. Post-check leakage always triggers fail-closed review path (`FAILED` + `admin_review_required = true`).
4. Clean outputs are delivered with `masked_content` persisted.
5. PII detection telemetry is persisted in audit trail metadata with stage labels.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/chatBatching.ts` and `convex/chatMessages.ts`.

### Out of Scope

- Admin approve/reject moderation mutations
- Admin monitor UI rendering
- Negotiation-room PII policies

---

## T03: AI Configuration and Monitoring

### Objective

Add AI runtime configuration reads plus monitoring/review backend functions so admins can triage failed/flagged chat output safely.

### Required Reading

- `notes/features/18-deal-room.md` - failure handling and admin visibility principles
- `lib/constants.ts` - system config keys and permission constants
- `convex/systemConfig.ts` (if present) - config read patterns
- `convex/chatMessages.ts` / `convex/chatBatching.ts` - status/failure fields used for monitoring

### Key Rules

1. Read model name from system config key `chat_ai_model` with fallback `gpt-4o-mini`.
2. Read batch window from `chat_batch_window_ms` with fallback `5000`.
3. Create `convex/chatAIMonitor.ts` with admin-only queries:
   - `getRecentFailures` (messages/batches failed AI processing or requiring admin review)
   - `getPIIStats` (aggregate detection stats for monitoring)
4. Add admin moderation mutations:
   - `approveMessage` (manual approve flagged message and set deliverable state)
   - `rejectMessage` (manual reject; message remains non-delivered)
5. Moderation mutations must validate current status (`FAILED`/review-required only) and maintain legal transitions.
6. `approveMessage` should persist reviewer id and review timestamp in auditable fields/metadata.
7. `rejectMessage` must capture reason text for operational traceability.
8. Monitoring queries should be pagination-friendly and avoid full-table scans where indexes exist.
9. Enforce admin permission checks with chat moderation/admin permissions.
10. Do not add UI in this task; backend APIs only.

### Deliverables

- [ ] `convex/chatAIMonitor.ts` - `getRecentFailures`, `getPIIStats`, `approveMessage`, `rejectMessage`
- [ ] integration updates in `convex/chatBatching.ts` and/or `convex/actions/chatAI.ts` for config reads if needed

### Acceptance Criteria

1. AI model and batch-window settings are read from system config with safe fallbacks.
2. Admin can query recent failed/flagged messages via `getRecentFailures`.
3. `getPIIStats` returns useful aggregates grouped by detection stage/type.
4. Admin can manually approve or reject flagged messages with auditable metadata.
5. Transition legality and permission checks are enforced for moderation mutations.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/chatAIMonitor.ts`, `convex/chatBatching.ts`, and `convex/actions/chatAI.ts`.

### Out of Scope

- Admin monitor page UX
- Owner invite lifecycle
- Deal checklist generation/sign-off

---

## Out of Scope (All Tasks)

- Chat visual components and embedded chat page integration (P24-E04)
- Owner invite tokens, checklist extraction/signatures, impersonation controls (P25)
- 3-room negotiation architecture and proposal/token workflows (P26)

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
