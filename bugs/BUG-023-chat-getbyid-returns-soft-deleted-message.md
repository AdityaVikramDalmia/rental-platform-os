# BUG-023: Chat getById returns soft-deleted messages to tenants and owners

| Field          | Value          |
| -------------- | -------------- |
| **Severity**   | Medium         |
| **Status**     | **OPEN**       |
| **Area**       | Deal Room Chat |
| **Found**      | 2026-09-24     |
| **Fixed**      | —              |
| **Fix Commit** | —              |

## Description

Moderators soft-delete chat messages with `chatMessages.softDeleteMessage`. The spec says the message "is hidden from tenant/owner views but remains visible in admin `getFullTranscript`" (`tasks/phase-25-deal-room-features/P25-E04-admin-god-mode-chat-management.md:108`). `listByChannel` follows this: party viewers get `is_deleted` rows filtered out (`convex/chatMessages.ts:329`). The public `getById` query (`convex/chatMessages.ts:352-372`) never checks `is_deleted`. A tenant or owner who has the message id (every message they were shown before deletion) can still read the removed message.

## Repro Steps

Test in `convex/chatPipeline.test.ts`, under `chat pipeline > chatMessages > getById`. It is marked `it.fails`; change `it.fails` to `it` to see it fail.

- `hides a soft-deleted message from a party, as listByChannel does (BUG-023)`

```bash
npx vitest run convex/chatPipeline.test.ts -t "BUG-023"
```

## Expected

A party viewer calling `getById` on a soft-deleted message gets `null`, or an error.

## Actual

The owner receives the message document with its masked content.

## Fix

In `getById`, return `null` for `is_deleted` messages unless the caller reached the channel through backoffice access, matching `listByChannel`.
