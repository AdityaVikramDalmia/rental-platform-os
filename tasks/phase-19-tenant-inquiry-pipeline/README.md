# Phase 19: Tenant Inquiry Pipeline (P19)

## Overview

Build the full tenant inquiry lifecycle: schema + auth plumbing (`tenant_inquiries` + `tenant_profiles` tables, `TENANT`/`OWNER` user types, `requireTenant()` helper), backend lifecycle functions (submit, review, reject, post bounty, guard acceptance, visit integration, bounty expiry cron), tenant-facing visit request form on the listing detail page, admin inquiry queue with paginated table and action dialogs, and guard-facing bounty board with acceptance flow and status tracking. UI built with shadcn/ui components.

**Key Decisions (Oracle-validated)**:

- `tenant_profiles` table included (needed for admin to see tenant info on inquiries).
- `NEGOTIATION_INITIATED` added to status union (10 statuses total, not 9 — from state machine docs).
- No `completeVisit` mutation — extend existing `visits.complete` to sync inquiry status when `tenant_inquiry_id` is present.
- Only 2 tenant inquiry permissions (`VIEW` + `MANAGE`), not 3 (`POST_BOUNTY` dropped — admin manage covers it).
- Hourly bounty expiry cron via `crons.interval()`, not daily.
- `acceptBounty` hard-checks `bounty_expires_at > Date.now()` even if cron hasn't run yet.
- Convex serializable transactions handle first-come-first-served for guard claims (no explicit locks).
- `TENANT` + `OWNER` added to `userTypeValidator` (forward-compat for P20).
- New rate limiter key `tenant:inquiry_submission` (not reusing `public:listing_inquiry`).

## Dependencies

- P01-E01 (auth, user schema, constants patterns — foundational dependency for schema/auth plumbing)

**Note**: The skeleton README listed P01 + P03 + P06 as dependencies. After Oracle review, the actual epic-level dependency is only P01-E01 — guard and listing existence are runtime data dependencies, not build-order dependencies. E02 consumes visits patterns from P07, but the functions already exist in the codebase.

## Key Documentation

| Doc                                                                        | Sections to Read                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [features/13-tenant-inquiry.md](../../notes/features/13-tenant-inquiry.md) | Full file — inquiry form, state machine, bounty board, guard acceptance |
| [04-state-machines.md](../../notes/04-state-machines.md)                   | Tenant Inquiry transitions (lines 303-383), especially 356-369          |
| [10-convex-schema.md](../../notes/10-convex-schema.md)                     | `tenant_inquiries` (lines 667-695), `tenant_profiles` (lines 697-711)   |
| [13-constants-reference.md](../../notes/13-constants-reference.md)         | Tenant Inquiry Status colors (551-563), Visit Bounty Status (614-621)   |
| [02-data-models.md](../../notes/02-data-models.md)                         | `tenant_inquiries` + `tenant_profiles` table definitions                |

## ⚠️ Schema Drift Alert

`tenant_inquiries` and `tenant_profiles` are documented in `notes/10-convex-schema.md` (lines 667-711) but are **missing from `convex/schema.ts`**. Additionally, the `visits` table lacks `tenant_inquiry_id` linkage. E01-T01 adds these tables and the visit linkage field to reconcile the drift. Do not assume they exist until E01-T01 is complete.

## Epics

| ID      | Title                                                                             | Tasks | Status | Depends On |
| ------- | --------------------------------------------------------------------------------- | ----- | ------ | ---------- |
| P19-E01 | [Schema, Auth & Constants](P19-E01-schema-auth-constants.md)                      | 3     | done   | P01-E01    |
| P19-E02 | [Backend Lifecycle Functions](P19-E02-backend-lifecycle-functions.md)             | 3     | done   | P19-E01    |
| P19-E03 | [Tenant Form & Admin Inquiry Management](P19-E03-tenant-form-admin-management.md) | 4     | done   | P19-E02    |
| P19-E04 | [Guard Bounty Board & Acceptance](P19-E04-guard-bounty-board.md)                  | 3     | done   | P19-E02    |

**Total: 4 epics, 13 tasks**

## Dependency Graph

```
P01-E01 ──► P19-E01 ──► P19-E02 ──┬──► P19-E03
                                   │
                                   └──► P19-E04
```

**Parallel note**: E03 (Tenant Form & Admin Management) and E04 (Guard Bounty Board) can run in parallel once E02 (Backend Lifecycle Functions) is complete. E03 builds tenant + admin UI; E04 builds guard UI. No cross-dependencies — E04 renders status inline using constants from E01-T03, independent of E03's badge component.

## Completion Criteria

- [x] `tenant_inquiries` and `tenant_profiles` tables added to `convex/schema.ts` (schema drift resolved)
- [x] `visits` table has `tenant_inquiry_id` field and `by_tenant_inquiry_id` index
- [x] `userTypeValidator` includes `TENANT` and `OWNER`; `requireTenant()` helper exists
- [x] `TENANT_INQUIRY_STATUS` (10 values), `VISIT_BOUNTY_STATUS`, status colors, and permissions added to `lib/constants.ts`
- [x] `tenant_bounty_expiry_days` system config key seeded with default `3`
- [x] `tenant:inquiry_submission` rate limiter key active (5/hour)
- [x] Full `convex/tenantInquiries.ts` with submit/review/reject/postBounty/acceptBounty/scheduleVisit/close/initiateNegotiation mutations + list/getById/listBounties/listByGuard queries
- [x] `visits.complete` syncs linked tenant inquiry to `VISIT_COMPLETED` when `tenant_inquiry_id` present
- [x] Hourly bounty expiry cron registered in `convex/crons.ts`
- [x] Tenant inquiry form renders on listing detail page with auth gate (sign-in CTA for unauthenticated, form for tenants, existing contact form for other roles)
- [x] `InquiryStatusBadge` component maps all 10 statuses to colors
- [x] Admin inquiry queue at `/admin/tenant-inquiries` with status tabs, paginated table, detail panel, and action dialogs (review/reject/postBounty/scheduleVisit)
- [x] Guard bounty board at `/guard/bounties` with Available tab (reactive), accept confirmation dialog, and My Accepted tab with status tracking
- [x] Build succeeds (`npm run build`)

## Files Created / Modified by This Phase

```
rental-platform-os/
├── convex/
│   ├── schema.ts                              # Modified: +tenant_inquiries, +tenant_profiles, visits.tenant_inquiry_id, TENANT/OWNER user types, tenant_bounty_expiry_days config key
│   ├── auth.helpers.ts                        # Modified: +requireTenant()
│   ├── tenantInquiries.ts                     # New: full tenant inquiry lifecycle (mutations + queries)
│   ├── visits.ts                              # Modified: completion sync hook for tenant inquiry linkage
│   ├── rateLimiter.ts                         # Modified: +tenant:inquiry_submission key
│   ├── crons.ts                               # Modified: +hourly expire-tenant-bounties cron
│   └── seed.ts                                # Modified: tenant_bounty_expiry_days default seeded
├── lib/
│   └── constants.ts                           # Modified: +TENANT_INQUIRY_STATUS, +VISIT_BOUNTY_STATUS, +status colors, +permissions, +USER_TYPE.TENANT/OWNER, +config key
├── src/app/
│   ├── listing/[slug]/
│   │   └── page.tsx                           # Modified: auth-aware inquiry form integration
│   ├── (admin)/admin/tenant-inquiries/
│   │   └── page.tsx                           # New: admin inquiry queue route
│   └── (guard)/guard/bounties/
│       └── page.tsx                           # New: guard bounty board route
├── src/components/
│   ├── tenant/
│   │   └── inquiry-form.tsx                   # New: tenant visit request form
│   ├── shared/
│   │   └── inquiry-status-badge.tsx           # New: inquiry status-to-color badge
│   ├── admin/
│   │   ├── inquiry-table.tsx                  # New: paginated inquiry table
│   │   └── inquiry-detail-panel.tsx           # New: detail panel + action dialogs
│   └── guard/
│       ├── bounty-card.tsx                    # New: bounty card (available + accepted variants)
│       └── bounty-accept-dialog.tsx           # New: accept confirmation dialog
```

## Scope Boundaries

### IN This Phase

- Schema reconciliation (add `tenant_inquiries` + `tenant_profiles` + visit linkage)
- `TENANT`/`OWNER` user types + `requireTenant()` auth helper
- Tenant inquiry constants, permissions, status colors, visit bounty status
- System config key `tenant_bounty_expiry_days` with seed default
- Rate limiter `tenant:inquiry_submission` (5/hour)
- Full backend lifecycle: submit, review, reject, postBounty, acceptBounty, scheduleVisit, close, initiateNegotiation
- Paginated list/detail queries with enrichment (listing + tenant + guard + visit joins)
- Guard-scoped bounty queries (listBounties, listByGuard)
- Visit completion sync (extend `visits.complete` for inquiry linkage)
- Hourly bounty expiry cron
- Tenant visit request form (DatePicker + time slot Select + optional message)
- Auth-gated listing detail integration (sign-in CTA / inquiry form / existing contact form)
- Inquiry status badge component
- Admin inquiry queue with status tabs + paginated table + detail panel + action dialogs
- Guard bounty board with available/accepted tabs, accept confirmation, status tracking

### NOT In This Phase

- Full rent negotiation workflow → **P23** (P19 only stubs `NEGOTIATION_INITIATED` status transition)
- Tenant login UI or tenant onboarding → **V2** (tenants use existing Google SSO)
- Auto-assignment of guards to bounties → **V2**
- Tenant self-serve reschedule/cancel → **V2**
- Push notifications for bounty/visit events → **V2**
- Payout creation from completed inquiry visits → **P09** (existing payout system handles this)
- Owner service request pipeline → **P20**
