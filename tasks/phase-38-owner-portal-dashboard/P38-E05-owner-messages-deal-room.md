---
id: P38-E05
title: Owner Messages & Deal Room
phase: 38
status: pending
depends_on: ["P38-E03"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P38-E05: Owner Messages & Deal Room

## Overview

Deliver owner-facing messaging by reusing existing deal-room chat infrastructure. This epic adds an owner/tenant-safe channel listing query, owner message list/detail routes, and a reusable `InquiryChatPanel` wrapper around `ChatView` for route and embedded usage.

## Prerequisites

- P24 chat infrastructure is complete (`chat_channels`, `chat_messages`, read receipts, `ChatView`).
- P38-E03 owner shell routes exist, including `/owner/messages`.
- Owner role guard semantics in `convex/auth.helpers.ts` and participant validation in `convex/chatChannels.ts` are understood.

## Task Queue

- [ ] P38-E05-T01: Add owner/tenant channel listing query `chatChannels.listForOwner`
- [ ] P38-E05-T02: Build `/owner/messages` channel inbox page
- [ ] P38-E05-T03: Build `/owner/messages/[channelId]` with reusable `InquiryChatPanel`
- [ ] P38-E05-T04: Reuse `InquiryChatPanel` in owner property/lead detail surfaces

---

## T01: Add Owner/Tenant Channel Listing Query `chatChannels.listForOwner`

### Objective

Implement a participant-scoped channel list query to power owner and tenant inbox pages without exposing admin-level channel listing APIs.

### Required Reading

- `convex/chatChannels.ts` - current participant checks (`requireChatParticipant`) and admin list query patterns
- `convex/chatMessages.ts` - message listing and latest-message derivation patterns
- `convex/chatReadReceipts.ts` - unread count query semantics
- `convex/auth.helpers.ts` - `requireAuth` and role checks
- `notes/features/18-deal-room.md` - owner inbox expectations and transparency rules

### Key Rules

1. Add new query in `convex/chatChannels.ts`:
   - `listForOwner({ paginationOpts, status?: "ACTIVE" | "ARCHIVED" })`
2. Query auth contract:
   - `requireAuth(ctx)`
   - allowed user types: `OWNER`, `TENANT`, `ADMIN`, `OPS` (admin/ops optional for reuse)
   - owner/tenant results must be restricted to channels where they are participants
3. For owner users, include channel only when inquiry listing owner resolves to authenticated owner user.
4. Response row shape must include inbox-ready metadata:
   - `channel_id`
   - `inquiry_id`
   - `status`
   - `listing_summary` (society/building/flat/slug where available)
   - `last_message_preview`
   - `last_message_at`
   - `unread_count`
5. Unread count must be computed from existing read-receipt model and remain per-user scoped.
6. Query must be paginated and sorted by latest message timestamp descending.
7. Do not expose original message content from other participants in preview if masking rules would be violated.

### Deliverables

- [ ] `convex/chatChannels.ts` - `listForOwner` participant-scoped paginated query

### Acceptance Criteria

1. Owner users receive only channels linked to their own listings/inquiries.
2. Query rows include latest preview, timestamp, and unread count metadata.
3. Results are paginated and ordered by most recent activity.
4. Query is safe for reuse in tenant inbox surfaces.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/chatChannels.ts`.

### Out of Scope

- Owner messages page UI
- Channel detail route UI
- Chat moderation/admin actions

---

## T02: Build `/owner/messages` Channel Inbox Page

### Objective

Create owner inbox page that lists active/archived channels with unread indicators and routes into channel detail.

### Required Reading

- `src/app/(admin)/admin/tenant-inquiries/components/inquiry-detail-panel.tsx` - current chat integration touchpoint
- `src/components/chat/ChatView.tsx` - channel display assumptions and required props
- `src/config/navigation.ts` - owner messages nav entry and active-path behavior
- `convex/chatChannels.ts` - `listForOwner` output contract from T01

### Key Rules

1. Implement route `src/app/(owner)/owner/messages/page.tsx` as the owner chat inbox.
2. Use `usePaginatedQuery(api.chatChannels.listForOwner, { status?, paginationOpts })` for list data.
3. Include status filter tabs for `ACTIVE` and `ARCHIVED` channels.
4. Render each row with:
   - listing/inquiry title
   - last message preview
   - relative last-activity time
   - unread badge
   - link to `/owner/messages/[channelId]`
5. Add empty states for no channels and archived-only views.
6. Keep layout mobile-first card list with touch-friendly navigation rows.

### Deliverables

- [ ] `src/app/(owner)/owner/messages/page.tsx` - owner inbox route
- [ ] `src/components/owner/messages/OwnerChannelList.tsx` - reusable channel list renderer
- [ ] `src/components/owner/messages/OwnerChannelListItem.tsx` - per-channel card row component

### Acceptance Criteria

1. `/owner/messages` lists owner channels from `chatChannels.listForOwner`.
2. Active/archived filters work and update list correctly.
3. Unread indicators and timestamps render correctly.
4. Clicking a row navigates to the channel detail route.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on owner messages inbox files.

### Out of Scope

- Channel detail chat rendering
- Embedded chat inside property/lead detail cards
- New chat backend schema changes

---

## T03: Build `/owner/messages/[channelId]` with Reusable `InquiryChatPanel`

### Objective

Create owner channel detail experience by wrapping existing `ChatView` in a reusable panel component that can be used both in route pages and embedded contexts.

### Required Reading

- `src/components/chat/ChatView.tsx` - required props contract (`channelId`, `currentUserId`, `currentUserRole`, `showOriginal`)
- `src/app/(admin)/admin/tenant-inquiries/components/inquiry-detail-panel.tsx` - existing `ChatView` embedding style
- `convex/users.ts` - `getCurrentUser` data shape for passing current user ID/type
- `convex/chatChannels.ts` - participant authorization behavior for `getById`

### Key Rules

1. Create reusable wrapper component `src/components/owner/messages/InquiryChatPanel.tsx` with this canonical props contract:

   ```typescript
   interface InquiryChatPanelProps {
     channelId: Id<"chat_channels">;
     ownerMode: boolean;
     showBackLink?: boolean;
   }
   ```

2. Export `InquiryChatPanelProps` from `InquiryChatPanel.tsx` and reuse this type in both route-detail and embedded usage to prevent prop drift.
3. Wrapper must internally fetch `api.users.getCurrentUser` and pass to `ChatView`:
   - `currentUserId`
   - `currentUserRole`
   - `showOriginal={ownerMode}` for owner sender transparency.
4. Add route `src/app/(owner)/owner/messages/[channelId]/page.tsx` that renders `InquiryChatPanel` full-height within owner shell content area, passing `ownerMode={true}` and `showBackLink={true}`.
5. Validate participant access before rendering main panel by querying channel metadata and handling unauthorized/not-found states cleanly.
6. Include back-navigation affordance to `/owner/messages`.

### Deliverables

- [ ] `src/components/owner/messages/InquiryChatPanel.tsx` - reusable chat wrapper
- [ ] `src/app/(owner)/owner/messages/[channelId]/page.tsx` - owner channel detail route

### Acceptance Criteria

1. `/owner/messages/[channelId]` renders live chat for authorized owner channels.
2. Wrapper component encapsulates current-user wiring and `ChatView` props.
3. Unauthorized or missing channel states show explicit fallback UI.
4. Back-navigation to inbox is available.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/owner/messages/InquiryChatPanel.tsx` and `src/app/(owner)/owner/messages/[channelId]/page.tsx`.

### Out of Scope

- Admin moderation tools
- Owner invite regeneration flows
- Deal checklist editing controls

---

## T04: Reuse `InquiryChatPanel` in Owner Property/Lead Detail Surfaces

### Objective

Apply the same chat wrapper in contextual owner workflows (property and lead detail surfaces) so chat UX stays consistent and component reuse is enforced.

### Required Reading

- `src/components/owner/messages/InquiryChatPanel.tsx` - reusable wrapper from T03
- `src/app/(owner)/owner/properties/page.tsx` - owner property list interaction model
- `src/app/(owner)/owner/leads/page.tsx` - owner leads list interaction model
- `convex/chatChannels.ts` - channel lookup by inquiry and by channel id

### Key Rules

1. Add contextual detail surfaces that can host chat panel reuse:
   - `src/components/owner/properties/OwnerPropertyDetailSheet.tsx`
   - `src/components/owner/leads/OwnerLeadDetailSheet.tsx`
2. Each detail surface should resolve relevant channel (if any) and render `InquiryChatPanel` inline/within a tab section.
3. Do not fork chat UI; all embedded owner chat views must use the same `InquiryChatPanel` component.
4. If no chat channel exists for selected inquiry/property context, show a non-error informational empty state.
5. Embedded usage must preserve owner shell scroll behavior (no nested viewport breakage).

### Deliverables

- [ ] `src/components/owner/properties/OwnerPropertyDetailSheet.tsx` - property detail sheet with chat section
- [ ] `src/components/owner/leads/OwnerLeadDetailSheet.tsx` - lead detail sheet with chat section
- [ ] `src/app/(owner)/owner/properties/page.tsx` - updated to open detail surfaces and reuse `InquiryChatPanel`
- [ ] `src/app/(owner)/owner/leads/page.tsx` - updated to open detail surfaces and reuse `InquiryChatPanel`

### Acceptance Criteria

1. Property and lead detail surfaces both reuse `InquiryChatPanel` rather than custom chat implementations.
2. If a channel exists, embedded panel renders message list + composer; if no channel exists, render a non-error empty-state card with no failed query toast.
3. No duplicated chat-role wiring exists outside `InquiryChatPanel`.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` reports no errors on new detail sheet files and touched owner properties/leads files.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on new owner detail sheet files and updated owner properties/leads pages.

### Out of Scope

- New backend channel-creation flows from owner side
- Negotiation-specific 3-room architecture (P26 scope)
- Notification delivery for new owner messages
