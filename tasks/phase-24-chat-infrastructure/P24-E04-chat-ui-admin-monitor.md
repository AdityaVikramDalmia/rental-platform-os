---
id: P24-E04
title: Chat UI & Admin Monitor
phase: 24
status: done
depends_on: ["P24-E02", "P24-E03"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "frontend-ui-ux", "convex-api"]
updated_at: 2026-02-19
---

# P24-E04: Chat UI & Admin Monitor

## Overview

Build the first chat-facing UI layer and admin oversight surface using the backend APIs from E02-E03. This epic delivers reusable chat components, embedded chat composition for inquiry pages, and an admin monitor page with flagged-message moderation controls.

## Prerequisites

- **Read first**: [P24-E02 Completion Summary](P24-E02-chat-backend-batching.md#completion-summary) - channel/message/batching/read-receipt APIs must exist.
- **Read first**: [P24-E03 Completion Summary](P24-E03-ai-pipeline.md#completion-summary) - fail-closed review flows and moderation mutations must be available.
- Existing admin/tenant inquiry detail surfaces must provide channel context for chat embedding.
- Chat constants/status color maps from E01 must exist for badges and state labels.

## Task Queue

- [x] P24-E04-T01: Message Components
- [x] P24-E04-T02: Chat Input + Send Flow
- [x] P24-E04-T03: Chat Page Integration
- [x] P24-E04-T04: Admin Chat Monitor

---

## T01: Message Components

### Objective

Create reusable chat rendering components for message display, loading states, sender previews, and system events using existing shadcn/ui patterns.

### Required Reading

- `notes/features/18-deal-room.md` - sender/receiver visibility and sender-preview expectations
- `notes/06-admin-panel-ux.md` - desktop admin table/detail patterns
- `src/components/ui/` inventory from `AGENTS.md` - approved UI primitives
- Existing shared status-badge component patterns in `src/components/shared/`

### Key Rules

1. Create `src/components/chat/MessageBubble.tsx` with sender/receiver variants, timestamp display, and status indicators (`sending`, `delivered`, `failed`).
2. Create `src/components/chat/MessageList.tsx` using `usePaginatedQuery` with reverse-chronological fetch and top "Load older" UX.
3. `MessageList` must auto-scroll to latest messages on initial load/new message while preserving scroll position when loading older pages.
4. Create `src/components/chat/SenderPreview.tsx` to show original vs masked text for sender-owned messages.
5. Create `src/components/chat/SystemMessage.tsx` for channel events (opened, archived, review-required notices).
6. Use shadcn/ui components (`Card`, `Badge`, `Skeleton`) for all structure/loading visuals; avoid raw HTML styling-only implementations.
7. Keep component props strongly typed with chat enums from `lib/constants.ts`.
8. Design for both mobile and desktop rendering widths.
9. Avoid introducing route-level logic in these components.
10. Do not duplicate status color literals; read from constants maps.

### Deliverables

- [x] `src/components/chat/MessageBubble.tsx`
- [x] `src/components/chat/MessageList.tsx`
- [x] `src/components/chat/SenderPreview.tsx`
- [x] `src/components/chat/SystemMessage.tsx`

### Acceptance Criteria

1. Components render chat messages with clear sender/receiver differentiation.
2. Message list supports pagination with "Load older" behavior and stable scrolling.
3. Sender preview shows original + masked message comparison for sender-owned entries.
4. System events render distinctly from participant messages.
5. Loading states use `Skeleton` and status badges use constants-driven labels/colors.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all files under `src/components/chat/`.

### Out of Scope

- Input composer behavior
- Admin monitor table page
- Owner invite UX
- i18n: Tenant chat strings are English-only in V1. Translation deferred to future i18n expansion phase per AGENTS.md i18n architecture (guard portal only in V1).

---

## T02: Chat Input + Send Flow

### Objective

Build `ChatInput` with validation, optimistic send UX, rate-limit feedback, and archived-channel disable behavior aligned with backend constraints.

### Required Reading

- `notes/features/18-deal-room.md` - send flow and sender feedback expectations
- `lib/constants.ts` - chat status/config key constants
- `convex/chatMessages.ts` - send mutation contract and error handling
- Existing form patterns in `src/components/` (`react-hook-form` + zod + sonner)

### Key Rules

1. Create `src/components/chat/ChatInput.tsx` with textarea, send button, and character counter.
2. Enforce max length from config (`chat_max_message_length`, default 2000) and block over-limit sends.
3. Show optimistic "Sending..." state immediately after submit while mutation is in flight.
4. Display rate-limit feedback, including remaining sends where backend/API exposes count.
5. Disable input and send action when channel status is `ARCHIVED`.
6. Surface validation and mutation errors via `sonner` toast + inline feedback.
7. Keep touch targets usable on mobile and keyboard-friendly on desktop.
8. Do not hardcode status strings; consume enums from constants.
9. Preserve message draft text on transient send failures.
10. Do not embed message list rendering in this component.

### Deliverables

- [x] `src/components/chat/ChatInput.tsx` - composer with optimistic send state and archive lock behavior

### Acceptance Criteria

1. Input enforces max length and prevents empty/invalid send attempts.
2. Send action shows optimistic state and resets draft on success.
3. Rate-limit failures are clearly surfaced to the user.
4. Composer is disabled for archived channels.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/chat/ChatInput.tsx`.

### Out of Scope

- Message list pagination implementation
- Admin monitor page
- Dedicated chat route creation

---

## T03: Chat Page Integration

### Objective

Compose reusable chat view building blocks into an embeddable `ChatView` component that can be mounted inside tenant inquiry detail experiences.

### Required Reading

- `notes/features/18-deal-room.md` - chat experience expectations and real-time behavior
- `notes/features/13-tenant-inquiry.md` - inquiry detail context where chat is embedded
- Existing inquiry detail components in `src/app/(admin)/admin/` and `src/components/admin/`
- `convex` query/mutation contracts from E02/E03

### Key Rules

1. Create `src/components/chat/ChatView.tsx` that composes header + `MessageList` + `ChatInput`.
2. `ChatView` props must include `channelId` and `currentUserRole`.
3. Keep integration component embeddable; do not create new route in this task.
4. Use Convex reactive queries/subscriptions so incoming messages update in real time.
5. Show channel metadata (status, participant summary, last activity) in header.
6. Respect sender visibility model: sender preview for own messages, masked-only for received messages.
7. Surface review-required or failed states in component-level UX.
8. Keep UI responsive for desktop admin detail panes and mobile tenant contexts.
9. Avoid direct dependency on P25 checklist components.
10. Ensure component works when channel data is loading, empty, archived, or failed.

### Deliverables

- [x] `src/components/chat/ChatView.tsx` - embeddable chat composition component
- [x] Integration updates in existing tenant inquiry detail component(s) to mount `ChatView` (no new routes)

### Acceptance Criteria

1. `ChatView` renders channel header, message list, and input in one composable unit.
2. Real-time updates appear without manual refresh.
3. Component is mountable from inquiry detail surfaces without route changes.
4. Archived channels render read-only view with disabled input.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/chat/ChatView.tsx` and touched inquiry-detail integration files.

### Out of Scope

- Standalone tenant/owner chat routes
- Owner invite onboarding screens
- Checklist approval UX

---

## T04: Admin Chat Monitor

### Objective

Create admin chat monitor page for channel oversight, message inspection, and flagged-message moderation actions.

### Required Reading

- `notes/features/18-deal-room.md` - admin transparency and monitoring requirements
- `notes/06-admin-panel-ux.md` - admin table/detail and filter patterns
- `convex/chatChannels.ts` - list/get contracts
- `convex/chatAIMonitor.ts` - failures/stats and approve/reject moderation contracts
- Existing admin page patterns under `src/app/(admin)/admin/`

### Key Rules

1. Create page: `src/app/(admin)/admin/chat-monitor/page.tsx`.
2. Render recent channels table with columns: inquiry link, participants, message count, last activity, status badge.
3. Add expandable row/detail section showing recent messages with both original + masked content for admins.
4. Add filters:
   - channel status (`ACTIVE`/`ARCHIVED`)
   - has flagged messages (`admin_review_required = true`)
5. Add flagged queue panel listing messages requiring review with `Approve` and `Reject` actions.
6. Wire actions to `approveMessage` and `rejectMessage` mutations from E03.
7. Use shadcn/ui components for table, badge, buttons, cards, and loading skeletons.
8. Keep page desktop-first (admin surface) while remaining functional on small screens.
9. Guard access with admin permissions; no tenant/owner access path.
10. Do not add checklist generation or impersonation controls in this phase.

### Deliverables

- [x] `src/app/(admin)/admin/chat-monitor/page.tsx` - channel table, expanded message preview, filters, flagged queue

### Acceptance Criteria

1. Admin monitor page renders at `/admin/chat-monitor` with channel list and filters.
2. Expanded channel view shows original + masked message content for admin users.
3. Flagged queue surfaces review-required messages and executes approve/reject actions.
4. Status badges and filter values align with `CHAT_CHANNEL_STATUS` constants.
5. `npm run build` and `npx tsc --noEmit` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/chat-monitor/page.tsx` and any touched chat UI files.

### Out of Scope

- Owner invite link management UI
- Deal checklist UI and signatures
- Negotiation dashboard/rooms

---

## Out of Scope (All Tasks)

- Owner invite flow, deal checklist flows, and admin impersonation controls (P25)
- 3-room negotiation architecture and structured proposal/token workflows (P26)
- Push notifications, voice/video, file attachments, and WhatsApp API integration (V2)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-19

### What Was Built

- 4 reusable chat components: `MessageBubble` (sender/receiver variants, status indicators, review badges), `MessageList` (paginated with reverse-chronological display, auto-scroll, load-older), `SenderPreview` (original vs masked side-by-side), `SystemMessage` (centered event divider)
- `ChatInput` composer with character counter, optimistic send state, archived channel lock, Enter-to-send keyboard support, and rate-limit error toasts
- `ChatView` embeddable composite (header + MessageList + ChatInput) with channel status badge, unread count, admin archive action
- Chat integrated into tenant inquiry detail panel (`inquiry-detail-panel.tsx`) — appears when a chat channel exists for the inquiry
- Admin chat monitor page at `/admin/chat-monitor` with channel table (status tabs, expandable row detail showing original+masked content), flagged message queue (approve/reject dialogs), and permission gating
- "Chat Monitor" nav item added to admin sidebar after Support Inbox

### Key File Locations

- `src/components/chat/MessageBubble.tsx` — message rendering with sender/receiver differentiation
- `src/components/chat/MessageList.tsx` — paginated message list with auto-scroll
- `src/components/chat/SenderPreview.tsx` — original vs masked comparison
- `src/components/chat/SystemMessage.tsx` — channel event display
- `src/components/chat/ChatInput.tsx` — message composer with send flow
- `src/components/chat/ChatView.tsx` — embeddable composite chat component
- `src/app/(admin)/admin/chat-monitor/page.tsx` — admin monitor page
- `src/components/admin/admin-nav-items.ts` — updated with Chat Monitor entry
- `src/app/(admin)/admin/tenant-inquiries/components/inquiry-detail-panel.tsx` — ChatView integration

### Deviations from Spec

- Read receipt `markRead` not auto-called in ChatView — requires latest message ID which is available in MessageList but not easily passed up without prop drilling. Deferred to P25 when the full deal room may have a better place for this.
- No dedicated chat status badge components created as separate files — status colors are consumed directly from `CHAT_MESSAGE_STATUS_COLORS` and `CHAT_CHANNEL_STATUS_LABELS` constants inline, matching the pattern used elsewhere in the admin monitor.

### Gotchas for Next Epic

- `ChatView` is designed to be embeddable — it takes `channelId`, `currentUserId`, and `currentUserRole` as props. P25 can mount it anywhere.
- The admin monitor's `RejectDialog` component name conflicts with the inquiry reject dialog in the same project — they're in different files/scopes so no issue, but be aware when importing.
- `markRead` integration is incomplete — P25 should wire this up properly when the full deal room UX is built.
