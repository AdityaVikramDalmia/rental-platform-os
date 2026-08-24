# Phase 20: Owner Services (P20)

## Overview

Build the owner services contact pipeline: schema plumbing (`owner_service_requests` table, constants, permissions, rate limiter, audit coverage), full backend lifecycle (`convex/ownerServiceRequests.ts` with submit, updateStatus, list, getById, statusCounts + centralized state machine validation), owner onboarding WorkOS Action (`createOwnerAccount`), public landing page at `(public)/owner-services/` with hero, benefits grid, contact form, and trust signals, and admin owner request management at `(admin)/admin/owner-requests/` with status tabs, paginated table, detail panel, and action dialogs for Contact/Reject/Drop/Onboard/Activate. UI built with shadcn/ui components.

**Key Decisions (Oracle-validated)**:

- Rate limiter keyed by phone number (not IP) — avoids server action complexity for V1.
- Centralized `VALID_TRANSITIONS` + `validateTransition()` in `ownerServiceRequests.ts` — all status changes go through the same validator, including onboard (via internal mutation).
- `contacted_at` field set on first SUBMITTED → CONTACTED transition (Unix ms via `Date.now()`).
- Reject/Drop require `ops_notes` (non-empty). Contact `ops_notes` is optional.
- ONBOARDED transition only via `createOwnerAccount` WorkOS Action (not `updateStatus`).
- Duplicate phone allowed — owner may have multiple properties.
- "User already exists" edge case: if WorkOS user exists, link to existing; if existing user has different `user_type`, throw clear error.
- `owner_service_requests` added to `AUDITED_TABLES` in `convex/functions.ts`.
- Minimal authenticated owner experience (property status check) is **deferred** — V1 focuses on contact form + admin pipeline. Owner status view can be added as a follow-up task.

## Dependencies

- P19-E01 (adds `OWNER` to `userTypeValidator` and `lib/constants.ts` USER_TYPE — needed for onboarding)
- P15 (creates `(public)` route group layout — needed for E02's landing page)

**Note**: The skeleton README listed only P01 as a dependency. After Oracle review, the actual dependencies are P19-E01 (for `OWNER` user type) and P15 (for `(public)` route group). P01 is an implicit transitive dependency via P19-E01.

## Key Documentation

| Doc                                                                        | Sections to Read                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [features/14-owner-services.md](../../notes/features/14-owner-services.md) | Full file — landing page, contact form, admin actions, edge cases |
| [04-state-machines.md](../../notes/04-state-machines.md)                   | Owner Service Request transitions (lines 815-820)                 |
| [10-convex-schema.md](../../notes/10-convex-schema.md)                     | `owner_service_requests` table (lines 713-735)                    |
| [13-constants-reference.md](../../notes/13-constants-reference.md)         | Owner Service Request Status colors (lines 565-574)               |
| [06-admin-panel-ux.md](../../notes/06-admin-panel-ux.md)                   | Admin wireframe (lines 413-437)                                   |
| [02-data-models.md](../../notes/02-data-models.md)                         | `owner_service_requests` table definition                         |

## ⚠️ Schema Drift Alert

`owner_service_requests` is documented in `notes/10-convex-schema.md` (lines 713-735) but is **missing from `convex/schema.ts`**. E01-T01 adds this table to reconcile the drift. Do not assume it exists until E01-T01 is complete.

## ⚠️ Deferred Scope: Minimal Owner Experience

The feature spec (`14-owner-services.md` line 25) includes "Minimal authenticated owner experience (property status check)" in V1 scope. This is **intentionally deferred** from P20 — V1 priority is the contact form funnel + admin pipeline. The owner status view is a small follow-up task (one page, one query) that can be added after the pipeline works end-to-end.

## Epics

| ID      | Title                                                                        | Tasks | Status | Depends On   |
| ------- | ---------------------------------------------------------------------------- | ----- | ------ | ------------ |
| P20-E01 | [Schema, Constants & Backend Functions](P20-E01-schema-constants-backend.md) | 3     | done   | P19-E01      |
| P20-E02 | [Public Owner Services Page](P20-E02-public-owner-services-page.md)          | 3     | done   | P20-E01, P15 |
| P20-E03 | [Admin Owner Request Management](P20-E03-admin-owner-request-management.md)  | 3     | done   | P20-E01      |

**Total: 3 epics, 9 tasks**

## Dependency Graph

```
P19-E01 ──► P20-E01 ──┬──► P20-E02 (also depends on P15)
                       │
                       └──► P20-E03
```

**Parallel note**: E02 (Public Page) and E03 (Admin Management) can run in parallel once E01 (Backend) is complete. E02 additionally requires P15's `(public)` route group layout. No cross-dependencies between E02 and E03.

## Completion Criteria

- [x] `owner_service_requests` table added to `convex/schema.ts` with all fields from schema docs (including `contacted_at`)
- [x] `OWNER_SERVICE_REQUEST_STATUS` (6 values), status colors, and permissions added to `lib/constants.ts`
- [x] `public:owner_service_request` rate limiter key active (3/hour, phone-keyed)
- [x] `owner_service_requests` included in AUDITED_TABLES for audit logging
- [x] Full `convex/ownerServiceRequests.ts` with centralized `VALID_TRANSITIONS` + `validateTransition`, `submit` (public, rate-limited), `updateStatus` (admin, state-machine validated), `list` (paginated), `getById` (enriched), `statusCounts`
- [x] `createOwnerAccount` WorkOS Action in `convex/actions/workos.ts` handles onboarding (CONTACTED → ONBOARDED)
- [x] Existing-user edge case handled (link or error for type conflict)
- [x] Owner services landing page at `/owner-services` with hero, 6-card benefits grid, contact form, trust signals
- [x] Contact form submits with phone normalization + paise conversion, shows exact success/error/rate-limit toasts
- [x] Admin owner request queue at `/admin/owner-requests` with status tabs (with counts), paginated table, detail panel
- [x] Admin action dialogs: Contact (SUBMITTED→CONTACTED), Reject (SUBMITTED→REJECTED), Drop (CONTACTED→DROPPED), Onboard (CONTACTED→ONBOARDED via WorkOS), Activate (ONBOARDED→ACTIVE)
- [x] Admin sidebar includes "Owner Requests" link
- [x] Build succeeds (`npm run build`)

## Files Created / Modified by This Phase

```
rental-platform-os/
├── convex/
│   ├── schema.ts                              # Modified: +owner_service_requests table
│   ├── ownerServiceRequests.ts                # New: full lifecycle (mutations + queries + statusCounts)
│   ├── actions/workos.ts                      # Modified: +createOwnerAccount action
│   ├── rateLimiter.ts                         # Modified: +public:owner_service_request key
│   └── functions.ts                           # Modified: +owner_service_requests in AUDITED_TABLES
├── lib/
│   └── constants.ts                           # Modified: +OWNER_SERVICE_REQUEST_STATUS, +colors, +permissions
├── src/app/
│   ├── (public)/owner-services/
│   │   ├── page.tsx                           # New: landing page (server component)
│   │   └── owner-services-client.tsx          # New: client wrapper with mutation wiring
│   └── (admin)/admin/owner-requests/
│       └── page.tsx                           # New: admin queue route
├── src/components/
│   ├── public/
│   │   └── owner-contact-form.tsx             # New: contact form (7 fields)
│   └── admin/
│       ├── owner-request-table.tsx            # New: paginated table with status badges
│       └── owner-request-detail-panel.tsx     # New: detail panel + all action dialogs
└── src/app/(admin)/
    └── admin-layout-client.tsx                # Modified: +Owner Requests sidebar link
```

## Scope Boundaries

### IN This Phase

- Schema reconciliation (add `owner_service_requests` table)
- Owner service request constants, permissions, status colors
- Rate limiter `public:owner_service_request` (3/hour, phone-keyed)
- Audit coverage for owner service requests
- Centralized state machine validation (`VALID_TRANSITIONS`)
- Public submit mutation (no auth, rate-limited, phone normalization, paise conversion)
- Admin lifecycle mutations (updateStatus with transition validation)
- Paginated list + enriched detail queries + status count query
- Owner onboarding WorkOS Action (creates Google SSO user, no password)
- Public landing page (hero, benefits grid, contact form, trust signals)
- Admin owner request queue with tabs, table, detail panel, all 5 action dialogs
- Admin sidebar navigation update

### NOT In This Phase

- Minimal authenticated owner experience (property status check) → **deferred** (follow-up task)
- Service plan comparison cards → **V2**
- ROI calculator → **V2**
- Before/after case studies → **V2**
- Owner onboarding timeline visualization → **V2**
- Owner FAQ module → **V2**
- Owner dashboard with property analytics → **V2**

See [V2 Backlog](../../notes/09-v2-backlog.md) — "V2: Owner Service Plans & ROI".
