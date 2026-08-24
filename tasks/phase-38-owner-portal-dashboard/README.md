# Phase 38: Premium Portal Infrastructure + Owner Portal (P38)

## Overview

Replace the narrow owner-status implementation with a full premium owner portal built on shared mobile-first portal infrastructure. Phase 38 delivers three foundations first: (1) a reusable shell/header/bottom-nav system for owner and future tenant portals, (2) a server-side post-auth role resolver to fix current callback misrouting, and (3) a complete owner product surface spanning dashboard, properties, earnings, messages, referrals, requests, documents, and profile.

This phase intentionally keeps admin/guard/ops layouts unchanged and introduces new owner/tenant-focused infrastructure in parallel to avoid risky cross-portal regressions.

The IA consists of 4 primary routes + 5 More-menu routes = total 9 routes.
`More` is a navigation trigger entry, not a standalone route page.

## Dependencies

- P20 Owner Services must be done (owner account onboarding + lifecycle records)
- P31 Owner Entity & RM Foundation must be done (canonical owner identity and owner-linked data)
- P24 Chat Infrastructure must be done (channel/message transport for owner messages)
- P25 Deal Room Features should be in progress or done (owner messaging and checklist context)
- P22 Referral System must be done (owner referral dashboard and code sharing)

## Key Documentation

| Doc/File                                      | Why it is required in this phase                                       |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `notes/features/30-owner-portal-dashboard.md` | Original owner portal product intent and module boundaries             |
| `notes/features/21-owner-entity-and-rm.md`    | Canonical owner identity and RM linkage rules                          |
| `notes/features/18-deal-room.md`              | Owner chat + checklist expectations                                    |
| `notes/features/17-referral-system.md`        | Owner referral UX and payout model                                     |
| `notes/03-roles-and-permissions.md`           | Permission gating and role-safe access constraints                     |
| `notes/10-convex-schema.md`                   | Existing owner/chat/document/request table fields and indexes          |
| `notes/13-constants-reference.md`             | Status enums, permissions, and nav-safe constants                      |
| `src/app/(guard)/guard-layout-client.tsx`     | Mobile-first bottom-nav + sticky header reference                      |
| `src/app/(ops)/ops-layout-client.tsx`         | "More" nav pattern and safe-area mobile composition reference          |
| `src/components/admin/admin-nav-items.ts`     | Config-driven nav item architecture reference                          |
| `src/app/(owner)/layout.tsx`                  | Current owner layout to replace with PortalShell pattern               |
| `src/components/chat/ChatView.tsx`            | Shared chat renderer to embed in owner messages surfaces               |
| `src/app/callback/redirect.ts`                | Existing broken email-domain redirect logic to deprecate               |
| `convex/auth.helpers.ts`                      | Existing `requireOwner()` and role guard helpers                       |
| `convex/owners.ts`                            | Existing owner-facing queries (`getMyOwnerProfile`, `getMyProperties`) |

## Epics

| ID      | Title                                                                                              | Tasks | Status  | Depends On         | Priority |
| ------- | -------------------------------------------------------------------------------------------------- | ----- | ------- | ------------------ | -------- |
| P38-E01 | [Shared Portal Foundation](P38-E01-shared-portal-foundation.md)                                    | 4     | pending | []                 | Critical |
| P38-E02 | [Auth Redirect Fix](P38-E02-auth-redirect-fix.md)                                                  | 3     | pending | []                 | Critical |
| P38-E03 | [Owner Portal Shell & Dashboard](P38-E03-owner-portal-shell-dashboard.md)                          | 4     | pending | [P38-E01, P38-E02] | Critical |
| P38-E04 | [Owner Properties, Leads & Earnings](P38-E04-owner-properties-leads-earnings.md)                   | 4     | pending | [P38-E03]          | High     |
| P38-E05 | [Owner Messages & Deal Room](P38-E05-owner-messages-deal-room.md)                                  | 4     | pending | [P38-E03]          | High     |
| P38-E06 | [Owner Referrals, Requests, Documents & Profile](P38-E06-owner-referrals-requests-docs-profile.md) | 5     | pending | [P38-E03]          | High     |

## Dependency Graph

- `P38-E01 + P38-E02 -> P38-E03`
- `P38-E03 -> P38-E04`
- `P38-E03 -> P38-E05`
- `P38-E03 -> P38-E06`

## Route Ownership Map

- E01: `(owner)/` route group + `layout.tsx` + shared portal foundation
- E02: Auth callback redirect fix + login flow
- E03: `/owner/dashboard` page (KPI cards, activity)
- E04: `/owner/properties` + `/owner/leads` (`/owner/leads/[leadId]`) + `/owner/earnings` pages
- E05: `/owner/messages` (`/owner/messages/[channelId]`) pages
- E06: `/owner/referrals` + `/owner/service-requests` + `/owner/documents` + `/owner/profile` pages

## Completion Criteria

- [ ] Shared portal infrastructure exists at `src/components/layout/PortalShell.tsx`, `src/components/layout/PortalHeader.tsx`, and `src/components/layout/MobileNav.tsx` with config-driven nav definitions in `src/config/navigation.ts`
- [ ] Owner primary bottom nav is implemented as: Dashboard, Properties, Earnings, Messages, More
- [ ] Owner "More" sheet routes are implemented as: Leads, Referrals, Requests, Documents, Profile
- [ ] New server-side `/post-auth` resolver flow routes users by actual Convex `user_type` (GUARD/OPS/ADMIN/TENANT/OWNER) instead of email domain heuristics, with `OPS` routing to `/admin/dashboard`
- [ ] Callback flow no longer hard-routes all Google SSO users to `/admin/dashboard`
- [ ] Auth edge case fallback is implemented for misclassified first-time non-synthetic users (current default-admin behavior in `convex/auth.ts`)
- [ ] Owner portal includes all 9 required routes: `/owner/dashboard`, `/owner/properties`, `/owner/earnings`, `/owner/messages`, `/owner/leads`, `/owner/referrals`, `/owner/service-requests`, `/owner/documents`, `/owner/profile`
- [ ] Owner deal-room experience uses `ChatView` via an `InquiryChatPanel` wrapper and supports both list + channel detail UX
- [ ] New owner backend queries are implemented and wired: `owners.getMyDashboardSummary`, `owners.getMyEarnings`, `ownerServiceRequests.getMyRequests`, `documents.getMyDocuments`, `chatChannels.listForOwner`
- [ ] At 375px viewport width, each owner route renders with no horizontal scroll, visible sticky header, and bottom nav touch targets >=44px

## File Tree

```text
phase-38-owner-portal-dashboard/
  README.md
  P38-E01-shared-portal-foundation.md
  P38-E02-auth-redirect-fix.md
  P38-E03-owner-portal-shell-dashboard.md
  P38-E04-owner-properties-leads-earnings.md
  P38-E05-owner-messages-deal-room.md
  P38-E06-owner-referrals-requests-docs-profile.md
```

## Scope Boundaries

### In Scope

- New shared portal shell primitives specifically for owner + future tenant portals
- Callback/post-auth redirect correction based on Convex user record instead of email suffix
- Owner mobile-first portal UX and full 9-route IA (4 primary routes + 5 More-menu routes; `More` is a trigger)
- Owner dashboard, property pipelines, earnings, messages, referrals, service requests, documents, and profile pages
- Owner-facing query additions plus only two minimal self-service writes: `owners.updateMyProfile` and owner document upload

### Out of Scope

- Refactoring existing admin, guard, or ops layout systems into shared infrastructure
- Full tenant portal implementation (only shared primitives and config compatibility are required)
- New notification center, push delivery, or messaging transport redesign (uses existing chat rails)
- New monetization products, accounting exports, or billing-rule overhauls
- Native app or offline-first owner portal support
