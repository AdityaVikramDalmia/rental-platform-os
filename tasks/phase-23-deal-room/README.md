# Phase 23: Deal Communication Room (P23)

## Overview

Build an AI-mediated chat system between tenants and property owners. Every message is fully rewritten by OpenAI (GPT-4o-mini) for professionalism and PII masking before delivery — phone numbers, emails, and social handles are stripped so parties cannot take deals off-platform. Senders see their original message alongside the masked version; receivers see only the masked version; admins see everything. Message batching (configurable window, default 5 seconds) groups rapid-fire messages into a single coherent AI rewrite. Admin god-mode lets ops send as "DemoRentals Support", impersonate either party, and toggle AI per message. AI-generated deal term checklists extract commitments from chat history, allow per-item approval (agree/disagree/comment) by both parties, and record formal sign-off as closure documentation. Owner invite flow: admin generates a one-time token link, sends it manually via WhatsApp, owner clicks and authenticates via Google SSO. Schema is designed to extend to guard-admin chat in a future phase without breaking changes. UI built with shadcn/ui components.

## Dependencies

- P01 (auth — Google SSO for owner account creation via invite link)
- P06 (listings — chat channel is scoped to a listing; listing context used in AI prompt)
- P19 (tenant inquiries — one channel per tenant inquiry; channel opened by admin on inquiry)
- P20 (owner services — owner accounts; owners may already have Google SSO accounts)

## Key Documentation

| Doc                                                                | Sections to Read                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [features/18-deal-room.md](../../notes/features/18-deal-room.md)   | Full file — channel model, AI pipeline, batching, checklist flow, admin capabilities, business rules, edge cases                                                                                                   |
| [04-state-machines.md](../../notes/04-state-machines.md)           | Chat channel status (`OPEN`/`CLOSED`), message status (`SUBMITTED`/`BATCHED`), batch status (`COLLECTING`/`PROCESSING`/`DELIVERED`/`FAILED`), checklist status transitions                                         |
| [13-constants-reference.md](../../notes/13-constants-reference.md) | `chat_channel_status`, `chat_message_status`, `chat_message_batch_status`, `chat_sender_role`, `chat_admin_send_mode`, `deal_checklist_status`, `deal_checklist_item_approval`, `deal_checklist_item_source` enums |
| [10-convex-schema.md](../../notes/10-convex-schema.md)             | `chat_channels`, `chat_messages`, `chat_message_batches`, `deal_checklists`, `deal_checklist_signatures`, `chat_read_receipts` table definitions; `closures` table `deal_checklist_id` field                       |
| [11-convex-architecture.md](../../notes/11-convex-architecture.md) | Convex Actions pattern (for OpenAI calls), scheduled functions, auth helpers, audit trigger pattern                                                                                                                |

## Epics

| ID      | Title                               | Tasks | Status  | Depends On       |
| ------- | ----------------------------------- | ----- | ------- | ---------------- |
| P23-E01 | Chat Schema, Constants & AI Adapter | 5     | pending | —                |
| P23-E02 | Chat Channels & Owner Invite Flow   | 5     | pending | P23-E01          |
| P23-E03 | Message Submission & AI Pipeline    | 5     | pending | P23-E01          |
| P23-E04 | Chat UI (Tenant, Owner, Admin)      | 6     | pending | P23-E02, P23-E03 |
| P23-E05 | Deal Checklists & Signatures        | 5     | pending | P23-E04          |
| P23-E06 | Read Receipts & Notifications       | 3     | pending | P23-E04          |

**Total: 6 epics, ~29 tasks**

## Completion Criteria

- [ ] All 6 chat/deal room tables in schema (`chat_channels`, `chat_messages`, `chat_message_batches`, `deal_checklists`, `deal_checklist_signatures`, `chat_read_receipts`)
- [ ] `closures` table has `deal_checklist_id` optional field added
- [ ] All chat enums added to `lib/constants.ts` and `AUDITED_TABLES` updated in `convex/functions.ts`
- [ ] `OPENAI_API_KEY` environment variable configured in Convex (`npx convex env set OPENAI_API_KEY ...`)
- [ ] `openai` npm package added to `package.json`
- [ ] OpenAI adapter function works: message rewrite + PII masking with correct prompt
- [ ] AI failure handling: 3 retries, then status `FAILED`, admin notified
- [ ] Chat channels created per tenant inquiry (admin-initiated only)
- [ ] Owner invite flow: admin generates one-time token link, owner clicks, Google SSO, chat access granted
- [ ] Invite link expiry enforced (default 7 days, configurable via `system_config`)
- [ ] Invite token is one-time use: consumed on first successful authentication
- [ ] Optional email binding: if `owner_invite_expected_email` set, only that Google email can accept
- [ ] Admin can regenerate expired or compromised invite tokens
- [ ] Message batching: 5-second window collects rapid-fire messages into one AI rewrite call
- [ ] Batch idempotency: `source_event_id` prevents duplicate processing
- [ ] Sender sees original + masked side-by-side after delivery
- [ ] Receiver sees masked content only (never originals)
- [ ] Admin sees original + masked for both parties
- [ ] Admin can send as "DemoRentals Support" (no AI, instant delivery)
- [ ] Admin can impersonate tenant or owner (optional AI masking)
- [ ] Admin can toggle AI rewrite on/off per message
- [ ] AI-generated deal checklist extracts terms from full chat history
- [ ] Admin can edit checklist items (add/remove/reorder) before sharing
- [ ] Per-item approval: AGREE / DISAGREE / COMMENT by both parties independently
- [ ] Formal sign-off creates `deal_checklist_signatures` records for both parties
- [ ] Sign-off only possible when all items AGREED by both parties
- [ ] Checklist versioning: new version created on admin edit; old versions preserved
- [ ] Read receipts track `last_read_at` per user per channel
- [ ] Unread count query returns correct count for badge indicators
- [ ] Build succeeds (`npm run build`)

## Files Created by This Phase

```
rental-platform-os/
├── convex/
│   ├── chatChannels.ts           # Channel open/close/reopen, owner invite generation,
│   │                             #   invite token validation, list (admin), getByInquiry
│   ├── chatMessages.ts           # Message send, sendAsAdmin (god-mode), listByChannel,
│   │                             #   status tracking, unread count query
│   ├── chatBatches.ts            # Batch management, scheduled batch trigger,
│   │                             #   COLLECTING → PROCESSING → DELIVERED lifecycle
│   ├── dealChecklists.ts         # Checklist generate (calls AI action), updateItems,
│   │                             #   share, approveItem, signOff, getByChannel, getVersions
│   ├── chatReadReceipts.ts       # markRead mutation, last_read_at upsert
│   └── actions/
│       └── ai.ts                 # OpenAI adapter: rewriteMessages (PII masking + rewrite),
│                                 #   generateChecklist (term extraction from chat history)
├── src/app/
│   ├── (admin)/admin/
│   │   └── chat/page.tsx         # Admin chat management (channel list, open channel,
│   │                             #   generate invite, god-mode controls)
│   ├── (tenant)/tenant/
│   │   └── chat/
│   │       └── [channelId]/page.tsx  # Tenant chat view (masked messages, checklist, sign-off)
│   └── deal/
│       └── [token]/page.tsx      # Owner invite landing page (token validation → Google SSO
│                                 #   → redirect to chat)
├── src/components/
│   ├── chat/
│   │   ├── ChatWindow.tsx        # Main chat interface (message list + input + checklist panel)
│   │   ├── MessageBubble.tsx     # Message display: original + masked toggle for sender,
│   │   │                         #   masked-only for receiver, DemoRentals label for admin messages
│   │   ├── MessageInput.tsx      # Compose + send with "Sending..." / "Delivered" badge
│   │   ├── AdminChatControls.tsx # God-mode: send-as selector, AI toggle, impersonation mode
│   │   ├── ChannelList.tsx       # Channel sidebar with unread badges and status indicators
│   │   └── UnreadBadge.tsx       # Unread count indicator (uses chatMessages.getUnreadCount)
│   └── checklist/
│       ├── ChecklistView.tsx     # Checklist display with per-item approval buttons and
│       │                         #   comment fields; sign-off button when all AGREED
│       ├── ChecklistEditor.tsx   # Admin edit view: add/remove/reorder items before sharing
│       └── SignOffDialog.tsx     # Formal sign-off modal with agreement text and confirmation
└── lib/
    └── ai/
        └── rewriter.ts           # Thin OpenAI wrapper: prompt construction, API call,
                                  #   response parsing, retry logic (3 attempts)
```
