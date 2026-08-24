# Phase 43: Tenant Portal (P43)

## Overview

Build a premium mobile-first tenant portal at `/tenant/*` with a shared shell, dashboard, inquiry lifecycle tracking, visit tracking, backend-synced favorites, deal-room messaging, referrals, tools, and profile settings. This phase explicitly reuses shared portal primitives from P38 (shell/header/nav/auth redirect) and extends tenant-facing backend APIs where current functions are admin-only.

## Dependencies

- P38-E01 Shared Portal Foundation must be done (shared `PortalShell`, `MobileNav`, `PortalHeader` primitives)
- P38-E02 Auth Redirect Fix must be done (`/post-auth` must route `TENANT` users to `/tenant/dashboard`)
- P19 Tenant Inquiry Pipeline must be done (tenant inquiry lifecycle and status model)
- P16 Tenant Browse must be done (public listings and existing localStorage favorites behavior)
- P22 Referral System must be done (tenant referral code + milestone backend)
- P24 Chat Infrastructure must be done (`chat_channels`, `chat_messages`, `ChatView`)
- P25 Deal Room Features must be done (inquiry chat wrapper and deal-room integration for shared tenant chat panel)
- P34 Transaction Completion Rails must be done (transaction timeline context shown in tenant journey)
- P35 Notification Infrastructure must be done (IN_APP notifications for consolidated inbox)
- P18 Tenant Tools must be done (`RentCalculator`, `CommuteEstimator`, `RoommateQuiz`, `RentalChecklist`)

Depends on: P19 (tenant inquiries), P24 (chat infrastructure), P25 (deal room chat wrapper integration), P34 (transactions - for timeline), P35 (notifications - for inbox), P38 (shared portal shell).

## Key Documentation

| Doc / Code Reference                                    | Why It Is Required                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `notes/features/11-tenant-browse.md`                    | Existing listings browse/favorites behavior that must remain anonymous-safe |
| `notes/features/13-tenant-inquiry.md`                   | Inquiry lifecycle, tenant/admin responsibilities, status semantics          |
| `notes/features/16-tenant-tools.md`                     | Tool-surface requirements reused in portal route                            |
| `notes/features/17-referral-system.md`                  | Tenant referral earning and sharing model                                   |
| `notes/features/18-deal-room.md`                        | Chat behavior constraints and masking rules                                 |
| `notes/04-state-machines.md`                            | Inquiry/visit/chat transition legality                                      |
| `notes/10-convex-schema.md`                             | Schema and index conventions for new tenant tables                          |
| `notes/11-convex-architecture.md`                       | Auth helper usage and Convex file organization patterns                     |
| `notes/13-constants-reference.md`                       | Status enums, labels, permission keys, and display rules                    |
| `src/app/(guard)/guard-layout-client.tsx`               | Mobile-first layout shell and bottom-nav interaction reference              |
| `src/app/(ops)/ops-layout-client.tsx`                   | Mobile bottom-nav + More-style information architecture reference           |
| `src/components/tenant/inquiry-form.tsx`                | Existing tenant inquiry input/validation patterns                           |
| `src/components/chat/ChatView.tsx`                      | Shared chat surface that must be wrapped/reused                             |
| `convex/auth.helpers.ts`                                | `requireTenant()` contract and role-gating rules                            |
| `convex/tenantInquiries.ts`                             | Current admin-gated inquiry queries that must get tenant-safe counterparts  |
| `src/components/shared/referral-dashboard.tsx`          | Shared referral UI to extend for tenant portal                              |
| `src/app/(public)/tools/tools-page-client.tsx`          | Existing tools composition to reuse inside tenant portal                    |
| `src/components/public/listings/listings-directory.tsx` | Existing favorites and listings UX that must preserve anonymous mode        |
| `src/lib/hooks/use-favorites.ts`                        | Current localStorage-only favorites hook to evolve to hybrid sync           |
| `src/config/navigation.ts`                              | Centralized portal nav config; tenant must use `getPortalConfig("tenant")`  |

## Epics

| ID      | Title                                   | Tasks | Status  | Depends On                           | Priority |
| ------- | --------------------------------------- | ----- | ------- | ------------------------------------ | -------- |
| P43-E01 | Tenant Portal Shell & Dashboard         | 4     | pending | [P38-E01, P38-E02]                   | Critical |
| P43-E02 | Tenant Inquiries, Visits & Favorites    | 5     | pending | [P38-E01, P38-E02, P43-E01]          | Critical |
| P43-E03 | Tenant Messages & Deal-Room Integration | 4     | pending | [P38-E01, P38-E02, P43-E01, P43-E02] | High     |
| P43-E04 | Tenant Referrals, Tools & Profile       | 4     | pending | [P38-E01, P38-E02, P43-E01]          | High     |

## Dependency Graph

```text
P38-E01 + P38-E02
        |
        v
      P43-E01
      /     \
     v       v
  P43-E02  P43-E04
     |
     v
  P43-E03
```

## Completion Criteria

- [ ] `(tenant)/tenant/*` route namespace exists with mobile shell and `/tenant/dashboard` default entry
- [ ] Tenant shell/navigation composes only P38 contracts (`PortalShell`, `PortalHeader`, `MobileNav`, `getPortalConfig("tenant")` from `src/config/navigation.ts`) with no tenant-local nav config duplication
- [ ] Tenant bottom navigation has exactly 5 primary items (`Dashboard`, `Inquiries`, `Favorites`, `Messages`, `More`) and More-sheet secondary links (`Visits`, `Referrals`, `Tools`, `Profile`)
- [ ] Tenant-facing inquiry APIs exist (`tenantInquiries.getMyInquiries`, `tenantInquiries.getMyInquiryById`) and are guarded by `requireTenant()`
- [ ] Tenant-facing visit API exists and powers `/tenant/visits`
- [ ] `tenant_favorites` table and backend module exist with add/remove/list and one-time localStorage import support
- [ ] `tenant_favorites` is canonical for logged-in tenants; `tenant_profiles.saved_listings` is read-only migration input imported when favorites are empty
- [ ] Existing public `/listings` anonymous favorites behavior stays intact for non-auth and non-tenant users
- [ ] `/tenant/inquiries` and `/tenant/inquiries/[id]` render inquiry lifecycle (including `NEGOTIATION_INITIATED`) and embed shared tenant chat panel (`src/components/tenant/messages/tenant-chat-panel.tsx`)
- [ ] `/tenant/messages` and `/tenant/messages/[channelId]` render channel inbox/detail using shared chat infrastructure via `chatChannels.listMyChannels` and inquiry-to-channel resolution query
- [ ] Consolidated tenant inbox APIs exist in `convex/tenantInbox.ts`: `tenantInbox.getConsolidated({ tenantUserId, cursor?, limit? })` and `tenantInbox.getUnreadCount({ tenantUserId })` for merged notification/message feed and unread split counters
- [ ] `/tenant/referrals`, `/tenant/tools`, and `/tenant/profile` are fully functional within tenant shell (no redirects to public routes)
- [ ] Referral totals are sourced from milestone summary API (`referralMilestones.getEarningsSummary`)
- [ ] Tenant portal APIs use `requireTenant(ctx)` identity scoping only (no backoffice RBAC permission checks)
- [ ] Mobile visual checks pass at 375px (iPhone SE), 390px (iPhone 14), and 768px (tablet)
- [ ] Cross-tenant isolation checks pass (tenant A cannot access tenant B inquiries/visits/channels/favorites)
- [ ] `npx tsc --noEmit` and `npm run build` pass after implementation

### Test Strategy

- **Unit tests**: Portal config (`getPortalConfig` returns correct tenant nav items), inquiry form validation (zod schema), favorite toggle logic.
- **Integration tests**: Tenant submits inquiry -> appears in list -> opens detail. Tenant adds favorite -> persists across page reload (localStorage). Tenant opens chat -> sends message -> appears in thread.
- **E2E tests**: Full tenant journey: login -> browse listings -> submit inquiry -> view in dashboard -> open chat -> send message -> check referral code -> use rent calculator.
- **Cross-tenant isolation**: Login as Tenant A, verify cannot see Tenant B's inquiries/visits/messages. All queries must filter by `tenantUserId` from auth context.
- **Responsive**: Verify all pages render correctly at 375px (mobile) and 1440px (desktop) widths.
- **No mocks needed**: Convex dev server provides real-time data; use seeded test data from `seedDemo:seedMega`.

## File Tree

```text
phase-43-tenant-portal/
  README.md
  P43-E01-tenant-portal-shell-dashboard.md
  P43-E02-tenant-inquiries-visits-favorites.md
  P43-E03-tenant-messages-deal-room.md
  P43-E04-tenant-referrals-tools-profile.md
```

## Scope Boundaries

### In Scope

- New tenant portal route group and shell composition under `/tenant/*`
- Tenant dashboard summary experience with inquiry/visit/favorites/message aggregates
- Tenant self-serve inquiry list/detail and visit list/detail surfaces
- Backend-synced favorites for logged-in tenants with one-time import from localStorage
- Chat inbox + channel detail pages and inquiry-embedded chat panel reuse
- Tenant referrals page, tenant tools route, tenant profile management page

### Out of Scope

- Redesign/rebuild of shared shell primitives from P38 (`PortalShell`, `MobileNav`, `PortalHeader`)
- Anonymous/public `/listings` architecture rewrite
- Chat AI pipeline changes, masking model changes, or moderation workflow redesign
- Push notifications, native mobile app behavior, offline queue sync, or background sync
- Negotiation proposal workflow changes from P26
