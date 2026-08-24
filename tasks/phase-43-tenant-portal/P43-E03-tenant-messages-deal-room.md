---
id: P43-E03
title: Tenant Messages & Deal-Room Integration
phase: 43
status: done
depends_on: ["P38-E01", "P38-E02", "P43-E01", "P43-E02", "P34", "P35"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P43-E03: Tenant Messages & Deal-Room Integration

## Overview

Deliver tenant messaging routes (`/tenant/messages` and `/tenant/messages/[channelId]`) and inquiry-embedded chat using shared chat infrastructure. This epic reuses `ChatView` and a canonical tenant chat wrapper at `src/components/tenant/messages/tenant-chat-panel.tsx` so inquiry detail and messages detail render the same conversation surface, and adds a read-only consolidated inbox API that merges notifications and chat activity for tenant feed use cases.

## Documentation Alignment (Mandatory)

- Follow P43 feature-spec "Offline & Error States" and "Loading Skeleton Specs" for Messages inbox/detail surfaces.
- Messages UX must include reconnect banner behavior and auto-retry semantics when websocket reconnects.
- Emit analytics events for this epic surfaces: `tenant.chat_opened` and `tenant.message_sent` with `{tenantId, channelId}`.

## Prerequisites

- **Read first**: `P43-E02` tenant inquiry detail page and ownership-safe inquiry APIs.
- Chat core exists (`convex/chatChannels.ts`, `convex/chatMessages.ts`, `convex/chatReadReceipts.ts`, `src/components/chat/ChatView.tsx`).
- Tenant shell/nav from `P43-E01` exists.
- Oracle design requires one wrapper panel around `ChatView`; both inquiry detail and messages routes must consume the same panel component.

## Task Queue

- [x] P43-E03-T01: Add participant-filtered channel APIs (`chatChannels.listMyChannels`, `chatChannels.getByInquiryForTenant`) + consolidated inbox APIs (`tenantInbox.getConsolidated`, `tenantInbox.getUnreadCount`)
- [x] P43-E03-T02: Build `/tenant/messages` channel inbox page
- [x] P43-E03-T03: Build `/tenant/messages/[channelId]` detail page using shared tenant chat panel
- [x] P43-E03-T04: Embed shared tenant chat panel in `/tenant/inquiries/[id]` and wire nav/dashboard unread badges

---

## Epic Verification (Mandatory)

- Verify channel isolation by direct query manipulation: tenant A cannot list/read tenant B channels.
- Verify message/inbox screens at 375px, 390px, and 768px.

---

## T01: Add Participant-Filtered Channel APIs (`chatChannels.listMyChannels`, `chatChannels.getByInquiryForTenant`) + Consolidated Inbox APIs

### Objective

Add participant-filtered chat channel listing, inquiry-to-channel resolution, consolidated inbox feed, and unread aggregation APIs needed by messages inbox, inquiry deep-linking, and nav badges.

### Required Reading

- `convex/chatChannels.ts`
- `convex/chatMessages.ts`
- `convex/chatReadReceipts.ts`
- `convex/notifications.ts`
- `convex/tenantInquiries.ts`
- `convex/auth.helpers.ts`
- `notes/features/18-deal-room.md`

### Key Rules

1. Add/standardize shared `chatChannels.listMyChannels` query in `convex/chatChannels.ts` (tenant + owner compatible):
   ```ts
   export const listMyChannels = query({
     args: {
       paginationOpts: paginationOptsValidator,
       status: v.optional(v.union(v.literal("ACTIVE"), v.literal("ARCHIVED"))),
     },
   });
   ```
2. `listMyChannels` must use participant filtering so caller only receives channels they belong to; tenant access still enforces inquiry ownership (`tenant_inquiries.tenant_id === tenant._id`).
3. Enrich each row with:
   - inquiry id/status
   - listing slug + building/society summary
   - latest message preview + timestamp
   - per-channel unread count for the current tenant
4. Add tenant inquiry resolver query:
   ```ts
   export const getByInquiryForTenant = query({
     args: { inquiry_id: v.id("tenant_inquiries") },
   });
   ```
   returning the tenant-accessible channel for inquiry deep-linking.
5. Add unread helper query in `convex/chatReadReceipts.ts`:
   ```ts
   export const getMyTotalUnread = query({ args: {} });
   ```
   summing unread messages across tenant-accessible channels.
6. Preserve admin/OPS behavior in existing chat APIs; do not change permission model for monitor workflows.
7. Replace/alias legacy tenant-specific naming (`listMine`, owner-only variants) to the shared `listMyChannels` contract to avoid duplicate inbox APIs.
8. Create `convex/tenantInbox.ts` with:
   - `tenantInbox.getConsolidated({ tenantUserId, cursor?, limit? })`
   - `tenantInbox.getUnreadCount({ tenantUserId })`
9. `tenantInbox.getConsolidated` must merge:
   - IN_APP notifications from P35 `notifications` where `recipient_user_id = tenantUserId`
   - chat messages from `chat_messages` via tenant-participant `chat_channels`
10. Consolidated inbox feed must sort reverse chronological by `timestamp` and return `nextCursor` for pagination.
11. V1 scope is read-only merged feed only; unified actions (mark read/archive across both types) are explicitly deferred to V2.
12. `tenantInbox` functions live in new file `convex/tenantInbox.ts` to avoid polluting existing notification/chat modules.

### Deliverables

- [ ] `convex/chatChannels.ts` - add/update shared participant-filtered `listMyChannels` and tenant inquiry resolver query
- [ ] `convex/chatReadReceipts.ts` - add `getMyTotalUnread` aggregate query
- [ ] `convex/tenantInbox.ts` - consolidated inbox merged feed and unread split counters

### Acceptance Criteria

1. Tenant can list only their own channels via `api.chatChannels.listMyChannels`.
2. Each channel row includes inquiry/listing context and unread count.
3. `api.chatChannels.getByInquiryForTenant({ inquiry_id })` resolves channel only for inquiry owner.
4. `api.chatReadReceipts.getMyTotalUnread` returns a stable integer for badge use.
5. `api.tenantInbox.getConsolidated` returns a reverse-chronological merged stream of notification/message items with cursor pagination.
6. `api.tenantInbox.getUnreadCount` returns `{ notifications, messages, total }` for the current tenant.
7. Existing admin chat monitor behavior remains unchanged.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/chatChannels.ts`, `convex/chatReadReceipts.ts`, and `convex/tenantInbox.ts`.

### Out of Scope

- Messages page UI
- Inquiry detail embedding
- Chat AI pipeline changes

---

## T02: Build `/tenant/messages` Channel Inbox Page

### Objective

Create the tenant messages inbox route with channel cards, unread badges, inquiry/listing context, and pagination.

### Required Reading

- `src/components/chat/ChatView.tsx`
- `src/components/chat/MessageList.tsx`
- `src/app/(admin)/admin/chat-monitor/page.tsx`
- `src/app/(ops)/ops/visits/page.tsx`
- `convex/chatChannels.ts` (`listMyChannels` from T01)
- `convex/chatReadReceipts.ts`

### Key Rules

1. Create `src/app/(tenant)/tenant/messages/page.tsx` as a client page.
2. Use `usePaginatedQuery(api.chatChannels.listMyChannels, ...)` with status filter tabs (`ALL`, `ACTIVE`, `ARCHIVED`).
3. Render channel list cards showing:
   - listing/inquiry label
   - latest message preview
   - relative time
   - unread badge
   - channel status badge
4. Channel card click navigates to `/tenant/messages/[channelId]`.
5. Include empty states for no channels and filtered-no-results states.
6. Keep mobile density optimized for one-hand use (single-column cards, concise metadata, clear hit areas).
7. Inbox ordering must follow backend contract: `latest_message_at desc`, tie-break `channel._creationTime desc`.

### Deliverables

- [ ] `src/app/(tenant)/tenant/messages/page.tsx` - tenant messages inbox route
- [ ] `src/components/tenant/messages/channel-list-item.tsx` - reusable inbox row component

### Acceptance Criteria

1. `/tenant/messages` renders tenant-only channels and filter tabs.
2. Unread counts and latest message previews are visible on each channel row.
3. Route transitions to `/tenant/messages/[channelId]` when selecting a channel.
4. Empty states render correctly when there are no channels.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/tenant/messages/page.tsx` and `src/components/tenant/messages/channel-list-item.tsx`.

### Out of Scope

- Channel conversation rendering details
- Inquiry page integration
- Nav badge wiring

---

## T03: Build `/tenant/messages/[channelId]` Detail Page Using Shared Tenant Chat Panel

### Objective

Implement tenant channel detail route that renders the canonical shared inquiry chat panel wrapper around `ChatView` (single implementation used across portal surfaces).

### Required Reading

- `src/components/chat/ChatView.tsx`
- `src/components/chat/ChatInput.tsx`
- `src/components/chat/MessageList.tsx`
- `convex/chatChannels.ts` (`getById`)
- `convex/users.ts` (`getCurrentUser`)

### Key Rules

1. Create `src/app/(tenant)/tenant/messages/[channelId]/page.tsx` and read channel details via `api.chatChannels.getById`.
2. Use `src/components/tenant/messages/tenant-chat-panel.tsx` as the only wrapper panel implementation for inquiry and messages surfaces.
3. Wrapper panel contract must support both inquiry-id and explicit channel-id entry:
   ```ts
   {
     inquiryId?: Id<"tenant_inquiries">;
     channelId?: Id<"chat_channels">;
     currentUserId: Id<"users">;
     currentUserRole: "TENANT" | "OWNER" | "OPS" | "ADMIN";
     className?: string;
   }
   ```
4. `ChatView` must be rendered in tenant mode (`showOriginal={false}`) and archive state must remain read-only.
5. Page must include breadcrumb/back navigation to `/tenant/messages` and inquiry deep link when available.
6. Unauthorized/missing channel must fail closed with a clear safe error state.

### Deliverables

- [ ] `src/app/(tenant)/tenant/messages/[channelId]/page.tsx` - tenant channel detail route
- [ ] `src/components/tenant/messages/tenant-chat-panel.tsx` - canonical shared wrapper panel around `ChatView` with unified props contract

### Acceptance Criteria

1. `/tenant/messages/[channelId]` renders conversation with `ChatView` through `src/components/tenant/messages/tenant-chat-panel.tsx`.
2. Tenant cannot access channels outside their ownership scope.
3. Archived channels render read-only without send input.
4. Back navigation to inbox works reliably.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/tenant/messages/[channelId]/page.tsx` and `src/components/tenant/messages/tenant-chat-panel.tsx`.

### Out of Scope

- Inquiry detail embedding
- Dashboard/nav unread badges
- Message moderation/admin tooling

---

## T04: Embed Shared Tenant Chat Panel in `/tenant/inquiries/[id]` and Wire Nav/Dashboard Unread Badges

### Objective

Integrate the same shared chat panel into inquiry detail and surface unread counts in tenant shell/dashboard entry points.

### Required Reading

- `src/app/(tenant)/tenant/inquiries/[id]/page.tsx`
- `src/app/(tenant)/tenant-layout-client.tsx`
- `src/app/(tenant)/tenant/dashboard/page.tsx`
- `convex/tenantInbox.ts` (`getUnreadCount` from T01)
- `convex/tenantInquiries.ts` (`getMyInquiryById`)

### Key Rules

1. Update `src/app/(tenant)/tenant/inquiries/[id]/page.tsx` to embed `TenantChatPanel` with `api.chatChannels.getByInquiryForTenant({ inquiry_id })` resolution.
2. Add unread badge to tenant nav `Messages` item in `tenant-layout-client.tsx` using `api.tenantInbox.getUnreadCount` (`total`).
3. Display unread messages KPI in dashboard by wiring `tenantDashboard.getSummary.unread_messages_count` to dashboard card.
4. Ensure both inbox route and inquiry-detail route use identical wrapper component; no duplicate ChatView composition.
5. Keep fallback states explicit:
   - no channel yet -> informative empty panel
   - channel archived -> read-only view
   - load failure -> retry action

### Deliverables

- [ ] `src/app/(tenant)/tenant/inquiries/[id]/page.tsx` - embed shared inquiry chat panel
- [ ] `src/app/(tenant)/tenant-layout-client.tsx` - messages nav badge wiring
- [ ] `src/app/(tenant)/tenant/dashboard/page.tsx` - unread KPI hookup

### Acceptance Criteria

1. Inquiry detail page renders the same chat panel used by messages detail route.
2. Tenant nav shows unread badge count on `Messages` when unread > 0.
3. Dashboard unread KPI matches nav aggregate source.
4. Inquiry detail deep-link navigates to `/tenant/messages/[channelId]` when a channel exists.
5. No duplicated chat UI implementations remain in tenant routes.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/tenant/inquiries/[id]/page.tsx`, `src/app/(tenant)/tenant-layout-client.tsx`, and `src/app/(tenant)/tenant/dashboard/page.tsx`.

### Out of Scope

- Referral/tools/profile routes
- Any chat backend AI rewrite logic
- Owner/ops/admin chat UX changes
