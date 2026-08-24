# Feature: Premium Tenant Portal

> **Priority**: #43 in implementation order
> **Personas**: Prospective Tenant, Tenant
> **Dependencies**: P38-E01 (Shared Portal Foundation), P38-E02 (Auth Redirect Fix), P19 (Tenant Inquiry Pipeline), P16 (Tenant Browse), P22 (Referral System), P24 (Chat Infrastructure), P25 (Deal Room Features), P34 (Transaction Completion Rails), P35 (Notification Infrastructure), P18 (Tenant Tools)
> **Route Groups**: `(tenant)/` (NEW route group)

## Purpose

Phase 43 delivers a comprehensive premium mobile-first tenant portal at `/tenant/*` that mirrors the guard and OPS portal experience. Instead of scattered public pages and admin-only views, tenants get a first-class product experience with dashboard, inquiry lifecycle tracking, visit management, backend-synced favorites, deal-room messaging, referral sharing, tools access, and profile settings.

This phase explicitly reuses shared portal infrastructure from P38 (PortalShell, MobileNav, PortalHeader) and extends tenant-facing backend APIs where current functions are admin-only. The tenant portal is the primary destination for authenticated tenants after login, replacing the need to navigate public pages for core workflows.

## Entities Involved

- Existing read entities:
  - `tenant_inquiries` (tenant-owned inquiry records)
  - `visits` (visits linked to tenant inquiries)
  - `listings` (published properties)
  - `chat_channels` (deal-room channels per inquiry)
  - `chat_messages` (conversation history)
  - `notifications` (in-app events used by consolidated inbox feed)
  - `referral_codes` (tenant referral codes)
  - `referrals` (tenant referral earnings)
- New write entity:
  - `tenant_favorites` table (backend-synced favorites for logged-in tenants)
- Existing read/write entity:
  - `tenant_profiles` (tenant identity and preferences)

Note: `tenant_favorites` table is defined in P43 (this phase). P43 is the authoritative source for `tenant_favorites` schema and implementation.

## Flows

### Flow 1: Tenant Auth and Portal Bootstrap

```text
1. Tenant signs in using Google SSO (existing WorkOS path)
2. Auth redirect resolver routes TENANT user_type to /tenant/dashboard
3. Tenant layout verifies user_type=TENANT and active status
4. Bottom nav loads: Dashboard, Inquiries, Favorites, Messages, More
5. More sheet provides secondary routes: Visits, Referrals, Tools, Profile
```

### Flow 2: Dashboard Summary

```text
1. /tenant/dashboard aggregates tenant's inquiry/visit/favorite/message counts
2. KPI cards show:
   - open inquiries count
   - upcoming visits count
   - saved favorites count
   - unread messages count
3. Upcoming visits card also shows `upcoming_visits` rows (max 5): listing title, scheduled date, and status
4. Recent activity feed shows latest inquiry submissions, visits, favorites, messages
5. Each card deep-links to corresponding portal section
```

### Flow 3: Inquiry Lifecycle Tracking

```text
1. /tenant/inquiries lists tenant-owned inquiries with status filters
2. Tenant opens /tenant/inquiries/[id]
3. Detail page shows:
   - listing snapshot (building/society/rent/BHK)
   - inquiry status timeline (SUBMITTED → REVIEWED → BOUNTY_POSTED → GUARD_ACCEPTED → VISIT_SCHEDULED → VISIT_COMPLETED → NEGOTIATION_INITIATED → CLOSED)
   - preferred visit date/slot
   - assigned guard + linked visit summary
   - embedded deal-room chat panel for communication
4. Tenant can view visit outcome and negotiation progress
```

### Flow 4: Visit Tracking

```text
1. /tenant/visits lists tenant-owned visits with upcoming/past segmentation
2. Tenant opens visit detail to see:
   - scheduled date/time
   - assigned guard contact
   - visit outcome (if completed)
   - linked inquiry context
3. Visits are linked to inquiries; tenant sees full context
```

### Flow 5: Favorites Management (Hybrid Sync)

```text
1. Tenant browses /listings and toggles favorites (localStorage)
2. On first tenant login, /tenant/favorites triggers one-time import
3. Canonical store for logged-in tenants is `tenant_favorites`; `tenant_profiles.saved_listings` is deprecated and read-only migration input
4. First `/tenant/favorites` load runs migration import when `saved_listings` has entries and `tenant_favorites` is empty
5. localStorage favorites are synced to backend `tenant_favorites` table
6. /tenant/favorites page shows backend-synced favorites
7. Tenant can remove favorites from portal
8. Dual-write: listings page updates both localStorage and backend for logged-in tenants
9. Anonymous /listings behavior unchanged (localStorage-only)
```

### Flow 6: Deal-Room Messaging

```text
1. /tenant/messages shows inbox of all inquiry-linked chat channels
2. Each channel row shows:
   - listing/inquiry label
   - latest message preview
   - unread badge
   - channel status (ACTIVE/ARCHIVED)
3. Inbox query uses shared `chatChannels.listMyChannels` participant-filter contract (tenant + owner compatible)
4. Tenant opens /tenant/messages/[channelId]
5. Conversation renders with AI-masked messages (tenant sees masked only)
6. Tenant can send messages; ops/owner see masked version
7. Same chat panel is embedded in /tenant/inquiries/[id] for inline messaging
8. Inquiry detail resolves channel using `chatChannels.getByInquiryForTenant({ inquiry_id })` for deterministic deep link
9. Inbox sort order is `latest_message_at desc`, tie-break by `channel._creationTime desc`
10. Unread count appears in nav Messages badge and dashboard KPI
```

### Flow 7: Referral Sharing

```text
1. /tenant/referrals shows tenant's referral code and earnings
2. Tenant can share code via WhatsApp/SMS/copy-to-clipboard
3. Referral dashboard shows:
   - referral code (FLAT-XXXXX format)
   - share URL (/ref/[code])
   - outgoing referrals (people who signed up with code)
   - milestone earnings (sign-up bonus + finding bonuses)
   - total earned in paise
4. Tenant can generate new code if missing
5. Earnings are updated in real-time as milestones are reached
```

### Flow 8: Tools Access

```text
1. /tenant/tools provides portal-native access to tenant tools
2. Tools include:
   - Rent calculator (move-in cost breakdown)
   - Commute estimator (area-to-area lookup)
   - Roommate quiz (personality compatibility)
   - Rental checklist (20-item tracker with localStorage persistence)
3. No redirect to public /tools; tools are embedded in portal shell
4. Checklist state persists in localStorage
```

### Flow 9: Profile Management

```text
1. /tenant/profile shows tenant account details and preferences
2. Editable fields:
   - name
   - phone
   - preferred localities (multi-entry)
   - budget range (min/max in paise)
   - property type preferences
3. Save updates persist to tenant_profiles
4. Non-editable identity context (email, user type)
5. Quick actions: "Manage referrals" → /tenant/referrals, "Browse listings" → /listings
```

## UX Reliability

### Offline & Error States

| Page         | Offline Behavior                                   | Error State                                       |
| ------------ | -------------------------------------------------- | ------------------------------------------------- |
| Dashboard    | Show cached data with "Last updated X ago" banner  | Retry button + cached stats if available          |
| My Inquiries | Show cached list, disable new inquiry button       | "Unable to load inquiries" + retry                |
| My Visits    | Show cached list                                   | "Unable to load visits" + retry                   |
| Favorites    | Show cached favorites from localStorage            | Full offline support (localStorage-backed)        |
| Messages     | Show cached messages, queue new messages for retry | "Reconnecting..." banner, auto-retry on reconnect |
| Referrals    | Show cached referral code                          | "Unable to load earnings" + retry                 |
| Tools        | Fully offline (all client-side calculations)       | N/A - no server dependency                        |
| Profile      | Show cached profile                                | "Unable to save" toast on failed update           |

General: all pages show `<Skeleton>` during initial load. Convex handles reconnection automatically; offline banner shows when WebSocket disconnects.

### Loading Skeleton Specs

| Page         | Skeleton Pattern                                                                  |
| ------------ | --------------------------------------------------------------------------------- |
| Dashboard    | 4 KPI card skeletons (rectangular pulse) + 3 list item skeletons                  |
| My Inquiries | 5 inquiry card skeletons (image placeholder + 3 text lines)                       |
| My Visits    | 4 visit card skeletons (date block + 2 text lines)                                |
| Favorites    | 6 property card skeletons (grid, matching PropertyCard dimensions)                |
| Messages     | Channel list: 5 row skeletons. Chat: header skeleton + 8 message bubble skeletons |
| Referrals    | Referral code card skeleton + 3 stat skeletons + 5 list item skeletons            |
| Tools        | No skeleton needed (instant client-side render)                                   |
| Profile      | Avatar circle skeleton + 6 form field skeletons                                   |

All skeletons use shadcn/ui `<Skeleton>` component with `animate-pulse`. Match exact dimensions of loaded content to prevent layout shift.

## User Stories

### Tenant: See All My Inquiries at a Glance

**As a tenant**, I want one dashboard for all my property inquiries, so I can quickly understand which properties I'm interested in and their status.

**Acceptance Criteria**:

- `/tenant/dashboard` shows inquiry count, upcoming visits, saved favorites, unread messages
- Each KPI card deep-links to the corresponding section
- Empty states include onboarding CTA when no inquiries exist

### Tenant: Track Inquiry Progress

**As a tenant**, I want to see the full lifecycle of each inquiry from submission to visit to closure, so I understand where my application stands.

**Acceptance Criteria**:

- `/tenant/inquiries` lists all tenant inquiries with status filters
- `/tenant/inquiries/[id]` shows timeline, assigned guard, visit details, and embedded chat
- Status badges match inquiry state machine (SUBMITTED, REVIEWED, BOUNTY_POSTED, GUARD_ACCEPTED, VISIT_SCHEDULED, VISIT_COMPLETED, NEGOTIATION_INITIATED, CLOSED)

### Tenant: Manage Saved Properties

**As a tenant**, I want my saved favorites to persist across devices and sessions, so I can build a curated list of properties I'm interested in.

**Acceptance Criteria**:

- Favorites from public `/listings` are imported to backend on first login
- `/tenant/favorites` shows all saved properties with remove action
- Dual-write keeps localStorage and backend in sync for logged-in tenants
- Anonymous browsing continues to work with localStorage-only

### Tenant: Communicate About Deals

**As a tenant**, I want to message the property owner and ops team about a specific inquiry, so I can negotiate terms and ask questions.

**Acceptance Criteria**:

- `/tenant/messages` shows all inquiry-linked chat channels
- `/tenant/messages/[channelId]` renders conversation with AI-masked messages
- Same chat panel is embedded in inquiry detail for inline messaging
- Unread count appears in nav and dashboard

### Tenant: Share Referral Code

**As a tenant**, I want to share my referral code with friends and earn bonuses when they sign up, so I can get rewarded for helping others find housing.

**Acceptance Criteria**:

- `/tenant/referrals` shows referral code, share URL, and earnings
- Tenant can generate code if missing
- Earnings update in real-time as milestones are reached
- Share actions support WhatsApp, SMS, and copy-to-clipboard

### Tenant: Access Tools Without Leaving Portal

**As a tenant**, I want to use rent calculator, commute estimator, and other tools from within the tenant portal, so I don't have to navigate away.

**Acceptance Criteria**:

- `/tenant/tools` provides full tools experience inside portal shell
- No redirect to public `/tools`
- All tool functionality works identically to public version

### Tenant: Manage Profile and Preferences

**As a tenant**, I want to update my name, phone, preferred localities, and budget, so my profile stays current and search results are relevant.

**Acceptance Criteria**:

- `/tenant/profile` shows editable profile fields
- Save updates persist and survive page reload
- Validation prevents invalid submissions
- Quick actions link to referrals and listings

---

## Convex Functions

### Queries

```ts
tenantDashboard.getSummary()
  => {
    inquiry_counts: Record<string, number>;
    open_inquiries_count: number;
    upcoming_visits_count: number;
    upcoming_visits: Array<{
      visit_id: Id<"visits">;
      listing_title: string;
      scheduled_date: number;
      status: string;
    }>; // max 5 rows
    favorites_count: number;
    unread_messages_count: number;
    recent_activity: Array<{
      activity_type: "INQUIRY" | "VISIT" | "FAVORITE" | "CHAT";
      label: string;
      timestamp: number;
      href: string;
    }>;
  }

tenantInquiries.getMyInquiries({ paginationOpts, status? })
  => { inquiries: TenantInquiry[], nextCursor? }

tenantInquiries.getMyInquiryById({ id })
  => TenantInquiry + listing + visit + guard details

visits.getMyVisits({ status?, date_from?, date_to? })
  => { visits: Visit[], nextCursor? }

tenantFavorites.list()
  => { favorites: Listing[] }

chatChannels.listMyChannels({ paginationOpts, status? })
  => { channels: ChatChannel[], nextCursor? }

chatChannels.getByInquiryForTenant({ inquiry_id: Id<"tenant_inquiries"> })
  => ChatChannel | null

chatReadReceipts.getMyTotalUnread()
  => number

tenantProfile.getMine()
  => {
    user_id: Id<"users">;
    name: string;
    email: string;
    phone: string | null;
    preferences: {
      localities: string[];
      budget_min: number | null;
      budget_max: number | null;
      property_types: string[];
    };
  }

referralCodes.getByUser()
  => ReferralCode | null

referrals.listByReferrer({ referral_type })
  => Referral[]

referralMilestones.getEarningsSummary({ user_id: Id<"users"> })
  => {
    total_earned_paise: number;
    signup_bonus_paise: number;
    finding_bonus_paise: number;
    milestone_count: number;
  }
```

### Consolidated Inbox API

```ts
tenantInbox.getConsolidated({ tenantUserId, cursor?, limit? })
  => {
    items: Array<{
      type: "notification" | "message";
      id: string;
      timestamp: number;
      title: string;
      body: string;
      read: boolean;
      sourceId: string;
    }>;
    nextCursor: string | null;
  }

tenantInbox.getUnreadCount({ tenantUserId })
  => {
    notifications: number;
    messages: number;
    total: number;
  }
```

- `tenantInbox.getConsolidated` merges IN_APP notifications (from P35 `notifications` where `recipient_user_id = tenantUserId`) and chat messages (from `chat_messages` via `chat_channels` where tenant is participant).
- Sort order is reverse chronological by `timestamp`.
- V1 scope is a read-only merged feed; V2 adds unified actions (mark read, archive) across notification and message items.
- This query lives in `convex/tenantInbox.ts` (new file) to avoid polluting existing notification/chat modules.

### Mutations

```ts
tenantFavorites.add({ listing_id })
  => TenantFavorite

tenantFavorites.remove({ listing_id })
  => void

tenantFavorites.importFromLocalStorage({ listing_ids })
  => { imported_count: number; skipped_count: number }

tenantProfile.updateMine({
  name?,
  phone?,
  preferences?
})
  => TenantProfile

referralCodes.generate()
  => ReferralCode
```

---

## Schema (Proposed)

### New Table: `tenant_favorites`

| Field          | Type           | Required | Description               |
| -------------- | -------------- | -------- | ------------------------- |
| tenant_user_id | Id<"users">    | yes      | Tenant user who favorited |
| listing_id     | Id<"listings"> | yes      | Favorited listing         |
| created_at     | number         | yes      | Unix ms when favorited    |

**Indexes**:

- `by_tenant` -> `tenant_user_id`
- `by_tenant_and_listing` -> `tenant_user_id, listing_id` (used for uniqueness check)

### Existing Tables Extended

- `tenant_profiles`: Already exists; T04 adds read/update APIs
- `tenant_inquiries`: Already exists; T01 adds tenant-scoped read APIs
- `visits`: Already exists; T02 adds tenant-scoped read API
- `chat_channels`: Already exists; T01 adds participant-filtered `listMyChannels` and tenant inquiry resolver query
- `chat_read_receipts`: Already exists; T01 adds unread aggregate query

---

## Business Rules

1. **Tenant scope enforcement**: Tenants can read/write only data linked to their own `users._id`; cross-tenant visibility is forbidden.
2. **Route isolation**: `(tenant)/` uses dedicated layout/auth guard and must not inherit admin-only controls.
3. **Auth model reuse**: Tenant login uses existing Google SSO via WorkOS, no separate credential stack.
4. **Tenant auth model**: Tenant portal APIs use `requireTenant(ctx)` identity scoping; do not add backoffice RBAC permission checks.
5. **Inquiry ownership**: Tenants see only inquiries they submitted; admin/ops see all inquiries.
6. **Visit linkage**: Visits are linked to inquiries; tenant sees visits only for their own inquiries.
7. **Favorites canonical source**: `tenant_favorites` is canonical for logged-in tenant favorites; `tenant_profiles.saved_listings` is deprecated read-only migration input.
8. **Favorites migration/import**: On first `/tenant/favorites` load, if `saved_listings` has values and `tenant_favorites` is empty, import deduped IDs into `tenant_favorites`.
9. **Favorites hybrid sync**: Anonymous users use localStorage-only. Logged-in tenants sync to backend on first login and dual-write thereafter.
10. **Chat masking**: All tenant messages are AI-masked before reaching owner/ops; tenant sees masked version only.
11. **Inbox ordering**: Channel inbox sorts by latest message timestamp descending; tie-break with channel creation time descending.
12. **Inquiry-channel deep link**: Inquiry detail resolves channel via `chatChannels.getByInquiryForTenant({ inquiry_id })`.
13. **Referral attribution**: Tenant referral codes use first-touch attribution; milestones are auto-awarded on sign-up and deal closure.
14. **Profile preferences**: Tenant preferences (localities, budget, property types) are optional and used for future search personalization.
15. **Property type validation**: `property_types` values must validate against centralized enum constants; reject unknown values.
16. **Phone normalization**: Profile phone updates must use shared phone normalization/validation utilities before persistence.
17. **Unread aggregation**: Unread count is computed across all tenant-accessible chat channels and displayed in nav badge and dashboard KPI.
18. **Tools portal-native**: `/tenant/tools` does not redirect to public `/tools`; tools are embedded in portal shell.
19. **Auditability**: Tenant actions generate audit events for admin oversight with literals:
    - `TENANT_FAVORITE_ADD`
    - `TENANT_FAVORITE_REMOVE`
    - `TENANT_PROFILE_UPDATE`
    - `TENANT_REFERRAL_SHARE`

### Analytics Event Tracking

| Event                      | Trigger                     | Properties                 |
| -------------------------- | --------------------------- | -------------------------- |
| `tenant.dashboard_viewed`  | Dashboard page load         | `{tenantId}`               |
| `tenant.inquiry_submitted` | New inquiry form submitted  | `{tenantId, listingId}`    |
| `tenant.inquiry_viewed`    | Inquiry detail opened       | `{tenantId, inquiryId}`    |
| `tenant.visit_viewed`      | Visit detail opened         | `{tenantId, visitId}`      |
| `tenant.favorite_added`    | Heart icon clicked          | `{tenantId, listingId}`    |
| `tenant.favorite_removed`  | Heart icon unclicked        | `{tenantId, listingId}`    |
| `tenant.message_sent`      | Chat message submitted      | `{tenantId, channelId}`    |
| `tenant.chat_opened`       | Chat channel opened         | `{tenantId, channelId}`    |
| `tenant.referral_shared`   | Referral code copied/shared | `{tenantId, referralCode}` |
| `tenant.tool_used`         | Tool calculation completed  | `{tenantId, toolName}`     |
| `tenant.profile_updated`   | Profile form saved          | `{tenantId}`               |

V1: events are logged to `auditLogs` table via existing audit infrastructure. V2: external analytics provider integration.

### Decisions

- D-P43-1: Tenant portal reuses P38 `PortalShell` pattern (not a custom layout) for consistency with owner portal.
- D-P43-2: `tenant_favorites` replaces `saved_listings` as canonical table and single source of truth for tenant bookmarks.
- D-P43-3: Consolidated inbox is a read-only merged feed in V1; unified actions are deferred to V2.
- D-P43-4: Analytics events write to `auditLogs` in V1; external provider integration is deferred to V2.

## Cross-Phase Contracts

1. **P38 -> P43 shell/nav contract**: `PortalShell`, `PortalHeader`, `MobileNav`, and `src/config/navigation.ts` are the only shell/navigation contracts. P43 composes via `getPortalConfig("tenant")`; do not add tenant-local nav config files.
2. **P38 -> P43 chat wrapper contract**: one canonical tenant chat wrapper implementation at `src/components/tenant/messages/tenant-chat-panel.tsx` with one shared props interface consumed by both inquiry detail and messages detail:
   ```ts
   type TenantChatPanelProps = {
     inquiryId?: Id<"tenant_inquiries">;
     channelId?: Id<"chat_channels">;
     currentUserId: Id<"users">;
     currentUserRole: "TENANT" | "OWNER" | "OPS" | "ADMIN";
     className?: string;
   };
   ```
3. **P38 -> P43 auth redirect contract**: `/post-auth` must route `TENANT` to `/tenant/dashboard`.
4. **P24/P25 -> P43 channel linkage contract**: `chat_channels.inquiry_id` is required for inquiry-channel linkage and participant-filtered unread/channel queries.

---

## Edge Cases

- **Tenant with no inquiries**: Dashboard shows onboarding CTA to browse listings and submit inquiry.
- **Tenant with no favorites**: Favorites page shows empty state with link to `/listings`.
- **Tenant with no chat channels**: Messages page shows empty state explaining channels are created when inquiry is accepted.
- **Tenant with no referral code**: Referrals page shows "Generate Code" action to create one.
- **Inquiry without linked visit**: Inquiry detail shows "Visit not yet scheduled" state.
- **Archived chat channel**: Channel detail renders read-only without send input.
- **Tenant account inactive/suspended**: Tenant portal access blocked while audit visibility remains available to admin.
- **Favorites import collision**: Import deduplicates IDs across localStorage, `saved_listings` migration input, and existing `tenant_favorites`; `tenant_favorites` wins, then `saved_listings`, then localStorage; skipped count is reported deterministically.
- **Profile update with invalid phone**: Validation error prevents submission; inline error message guides correction.
- **Referral code regeneration**: New code is generated; old code remains valid for existing referrals.
- **Inquiry without channel**: Inquiry detail renders a clear "No messages yet" panel with CTA to open inbox once channel exists.

---

## Design Principles

- **Mobile-first**: All pages optimized for single-hand use on small screens; desktop viewport supported but not primary.
- **Responsive verification baseline**: All tenant pages must pass visual checks at 375px (iPhone SE), 390px (iPhone 14), and 768px (tablet).
- **Business-grade SaaS feel**: Clean card-based layouts, clear typography, minimal decoration, teal/cyan accent color palette.
- **Frosted glass nav**: Bottom nav uses `bg-white/95` + `backdrop-blur` for modern aesthetic matching guard/ops portals.
- **Consistent with guard/ops portals**: Reuses shared shell primitives, nav patterns, and mobile spacing conventions.
- **Portal-native**: No redirects to public pages; all core workflows accessible from within `/tenant/*`.
- **Accessibility**: Touch targets minimum 44x44, color contrast WCAG AA, keyboard navigation supported, visible focus states required, and icon-only controls require accessible labels.

---

## Related Documents

- [Tenant Inquiry Pipeline](13-tenant-inquiry.md) — Inquiry lifecycle, status semantics, bounty system
- [Tenant Browse](11-tenant-browse.md) — Listings directory, search, filters, public favorites behavior
- [Tenant Tools](16-tenant-tools.md) — Rent calculator, commute estimator, roommate quiz, checklist
- [Referral System](17-referral-system.md) — Tenant referral codes, attribution, milestone payouts
- [Deal Room](18-deal-room.md) — AI-masked chat, deal checklists, admin controls
- [Premium Portal Infrastructure + Owner Portal](30-owner-portal-dashboard.md) — Shared shell primitives (PortalShell, MobileNav, PortalHeader)
- [State Machines](../04-state-machines.md) — Inquiry, visit, chat, and referral status transitions
- [Constants Reference](../13-constants-reference.md) — Status enums, labels, permission keys
- [Multi-Persona Identity](36-multi-persona-identity.md) — P45 enables users to hold TENANT persona alongside other personas. Tenant layout will be updated to use `user_types.includes()` pattern.

---

## Implementation Reference

See `tasks/phase-43-tenant-portal/` for detailed task specifications:

- **P43-E01**: Tenant Portal Shell & Dashboard (4 tasks)
- **P43-E02**: Tenant Inquiries, Visits & Favorites (5 tasks)
- **P43-E03**: Tenant Messages & Deal-Room Integration (4 tasks)
- **P43-E04**: Tenant Referrals, Tools & Profile (4 tasks)

Total: 4 epics, 17 tasks
