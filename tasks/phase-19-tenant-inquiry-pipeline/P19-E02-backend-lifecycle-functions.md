---
id: P19-E02
title: Backend Lifecycle Functions
phase: 19
status: done
depends_on: ["P19-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-19
---

# P19-E02: Backend Lifecycle Functions

## Overview

Create `convex/tenantInquiries.ts` with the full tenant inquiry lifecycle: submit (tenant), review/reject/postBounty (admin), acceptBounty (guard), visit scheduling via existing visits integration, close/initiateNegotiation (admin), paginated list/detail queries, bounty-specific guard queries, and hourly bounty expiry cron.

## Prerequisites

- **Read first**: P19-E01 Completion Summary — schema, auth, constants, and rate limiter plumbing are already in place. This epic assumes `tenant_inquiries` statuses/constants/permissions and `requireTenant()` are implemented.
- **Codebase facts to verify before starting**:
  - `convex/functions.ts` exports wrapped `mutation` / `internalMutation` and `query` (lines 183-186). `tenantInquiries.ts` must import from `./functions` for audit trigger coverage.
  - `convex/visits.ts` has canonical visit creation fields in `create` (lines 196-247) and guard completion flow in `complete` (lines 546-582).
  - `convex/leads.ts` contains status-transition and paginated list patterns (`validateLeadTransition` lines 81-90, `list` lines 658-800, `getById` lines 802-868).
  - `notes/04-state-machines.md` Tenant Inquiry transition source of truth is lines 356-369.
  - `notes/10-convex-schema.md` `tenant_inquiries` indexes are lines 691-695 (`by_tenant_id`, `by_listing_id`, `by_status`, `by_assigned_guard_id`, `by_tenant_and_status`).

## Task Queue

- [x] P19-E02-T01: Core Inquiry Mutations + Queries
- [x] P19-E02-T02: Guard + Visit Integration
- [x] P19-E02-T03: Bounty Expiry Cron

---

## T01: Core Inquiry Mutations + Queries

### Objective

Create the base `convex/tenantInquiries.ts` module with tenant submission, admin lifecycle actions (review/reject/postBounty), and admin-facing list/detail queries with pagination and data enrichment.

### Required Reading

- `notes/features/13-tenant-inquiry.md` — Flow + Convex function contracts + business rules (lines 26-53, 117-143, 147-158)
- `notes/04-state-machines.md` — Tenant Inquiry transition table and rules (lines 303-383, especially 356-369)
- `notes/10-convex-schema.md` — `tenant_inquiries` fields and indexes (lines 667-695)
- `convex/functions.ts` — wrapped exports (`mutation`, `internalMutation`, `query`) (lines 183-186)
- `convex/leads.ts` — transition helper and paginated query patterns (lines 81-90, 658-800, 802-868)
- `notes/13-constants-reference.md` — `TENANT_INQUIRY_STATUS`, `PERMISSIONS.TENANT_INQUIRIES_VIEW`, `PERMISSIONS.TENANT_INQUIRIES_MANAGE`, `SYSTEM_CONFIG_KEYS`

### Key Rules

1. **Create `convex/tenantInquiries.ts` and import server wrappers from `./functions`**. Do not import `mutation`/`internalMutation` from `./_generated/server`.
2. **Auth and permissions are strict by action**:
   - `submit` uses `requireTenant(ctx)`
   - Admin mutations (`review`, `reject`, `postBounty`) use `requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE)`
   - Admin queries (`list`, `getById`) require admin visibility permission (`PERMISSIONS.TENANT_INQUIRIES_VIEW`)
3. **Use exact transition source from `notes/04-state-machines.md` lines 356-369**. Implement `VALID_TRANSITIONS: Record<TenantInquiryStatus, TenantInquiryStatus[]>` and `validateTransition(current, next)` that throws on invalid transitions.
4. **Transition table to encode in `VALID_TRANSITIONS` (exact)**:

   | From                    | To                      | Trigger                                                       | Who    |
   | ----------------------- | ----------------------- | ------------------------------------------------------------- | ------ |
   | (new)                   | `SUBMITTED`             | Tenant submits visit request                                  | Tenant |
   | `SUBMITTED`             | `REVIEWED`              | Ops reviews the inquiry                                       | Admin  |
   | `SUBMITTED`             | `REJECTED`              | Ops rejects (spam, invalid, etc.)                             | Admin  |
   | `REVIEWED`              | `BOUNTY_POSTED`         | Ops posts as bounty for guards                                | Admin  |
   | `REVIEWED`              | `REJECTED`              | Ops rejects after review                                      | Admin  |
   | `BOUNTY_POSTED`         | `GUARD_ACCEPTED`        | Guard claims the bounty                                       | Guard  |
   | `BOUNTY_POSTED`         | `EXPIRED`               | No guard accepts within expiry window                         | System |
   | `GUARD_ACCEPTED`        | `VISIT_SCHEDULED`       | Ops confirms visit schedule                                   | Admin  |
   | `VISIT_SCHEDULED`       | `VISIT_COMPLETED`       | Guard completes the showing                                   | Guard  |
   | `VISIT_COMPLETED`       | `NEGOTIATION_INITIATED` | Ops opens negotiation (`INTERESTED`)                          | Admin  |
   | `VISIT_COMPLETED`       | `CLOSED`                | Ops closes without negotiation (`NOT_INTERESTED`/`FOLLOWUP`)  | Admin  |
   | `NEGOTIATION_INITIATED` | `CLOSED`                | Negotiation reaches `READY_FOR_CLOSURE` and closure confirmed | Admin  |

5. **`submit({ listing_id, preferred_visit_date?, preferred_visit_slot?, message? })` requirements**:
   - Rate-limit by tenant identity using `tenant:inquiry_submission` keying on current tenant user id.
   - Verify listing exists and has `status === PUBLISHED`; reject otherwise.
   - Insert `tenant_inquiries` row with `status: SUBMITTED`, optional fields normalized, and no admin/guard assignment fields set.
   - All money/date conventions remain project-wide: paise integers, Unix ms.
6. **`review({ id, ops_notes? })` requirements**:
   - Transition only `SUBMITTED -> REVIEWED`.
   - Set `reviewed_by_admin_id` and normalized `ops_notes`.
7. **`reject({ id, ops_notes })` requirements**:
   - `ops_notes` is required and non-empty.
   - Allow only `SUBMITTED -> REJECTED` and `REVIEWED -> REJECTED`.
8. **`postBounty({ id, bounty_amount, expiry_days })` requirements**:
   - Allow only `REVIEWED -> BOUNTY_POSTED`.
   - `bounty_amount` must be positive integer paise.
   - Compute `bounty_expires_at` from `expiry_days` argument or fallback to `system_config` key `tenant_bounty_expiry_days`.
   - Set `bounty_posted_at` and `bounty_expires_at` at mutation time.
9. **`list({ status?, listing_id?, tenant_id?, paginationOpts })` requirements**:
   - Use `paginationOptsValidator` from `convex/server`.
   - Use index-first query selection (`by_status`, `by_listing_id`, `by_tenant_id`, or `by_tenant_and_status` when both provided).
   - Return paginated, enriched rows with listing summary and tenant user summary joins.
10. **`getById({ id })` requirements**:
    - Return inquiry + listing details + tenant user info.
    - Include linked visit if one exists for this inquiry and include guard info if assigned.
11. No implementation of guard acceptance, scheduling, visit completion sync, or expiry cron in this task (handled in T02/T03).
12. No `as any`, no `@ts-ignore`, no schema/auth/constants changes (already handled in P19-E01).

### Deliverables

- [ ] `convex/tenantInquiries.ts` — initial module with `VALID_TRANSITIONS`, `validateTransition`, `submit`, `review`, `reject`, `postBounty`, `list`, `getById`

### Acceptance Criteria

1. `tenantInquiries.submit` enforces tenant auth, listing must be `PUBLISHED`, and tenant inquiry rate limit.
2. `review`/`reject`/`postBounty` enforce `PERMISSIONS.TENANT_INQUIRIES_MANAGE` and valid status transitions.
3. `list` is paginated with `paginationOptsValidator` and supports optional filters by status/listing/tenant.
4. `getById` returns enriched inquiry context (listing, tenant, optional visit and guard).
5. Transition helper rejects invalid state jumps with explicit errors.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/tenantInquiries.ts`.

### Out of Scope

- Guard-side bounty acceptance and guard query surfaces (T02)
- Visit completion sync hook (T02)
- Bounty expiry cron (T03)
- Frontend/admin UI work (P19-E03/P19-E04 scope)

---

## T02: Guard + Visit Integration

### Objective

Add guard acceptance and visit-link lifecycle actions in `convex/tenantInquiries.ts`, and integrate inquiry status sync into the existing `visits.complete` flow.

### Required Reading

- `notes/features/13-tenant-inquiry.md` — guard acceptance and visit creation business rules (lines 35-43, 149-157)
- `notes/04-state-machines.md` — guard/admin transitions (`BOUNTY_POSTED -> GUARD_ACCEPTED -> VISIT_SCHEDULED -> VISIT_COMPLETED`) (lines 363-368)
- `convex/visits.ts` — `create` field structure (lines 196-247), `validateVisitTransition` (177-194), and `complete` mutation (546-582)
- `convex/leads.ts` — status validation + permissioned mutation patterns (lines 81-90, 485-545)
- `notes/10-convex-schema.md` — `tenant_inquiries` shape/indexes (lines 667-695), plus visit linkage field introduced in P19-E01

### Key Rules

1. **Add the following mutations to `convex/tenantInquiries.ts`**: `acceptBounty`, `scheduleVisit`, `close`, `initiateNegotiation`.
2. **`acceptBounty({ id })` requirements**:
   - Must use `requireGuard(ctx)`.
   - Status must be `BOUNTY_POSTED`.
   - Hard expiry guardrail: require `bounty_expires_at > Date.now()` even if cron has not run yet.
   - Guard society authorization: load current guard profile by `user_id`, compare `guard_profile.society_id` to inquiry listing society, reject cross-society claims.
   - Transition `BOUNTY_POSTED -> GUARD_ACCEPTED`, set `assigned_guard_id`.
   - Do not add custom locks; rely on Convex serializable transaction semantics for first-claim-wins under concurrent accepts.
3. **`scheduleVisit({ id, scheduled_start, scheduled_end })` requirements**:
   - Must use `requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_MANAGE)`.
   - Transition only `GUARD_ACCEPTED -> VISIT_SCHEDULED`.
   - Create one `visits` row in the existing `visits` table with `tenant_inquiry_id` populated.
   - Follow existing `visits.create` field structure from `convex/visits.ts` lines 231-245 (status, timestamps, reassignment flag, admin creator id); do not invent a parallel visit schema.
4. **`close({ id })` requirements**:
   - Must use admin manage permission.
   - Transition only `VISIT_COMPLETED -> CLOSED`.
5. **`initiateNegotiation({ id })` requirements**:
   - Must use admin manage permission.
   - Transition only `VISIT_COMPLETED -> NEGOTIATION_INITIATED`.
   - Validate linked visit exists and `visit.outcome === INTERESTED`; throw for `NOT_INTERESTED` / `FOLLOWUP`.
   - Keep this as P19 stub only (no full negotiation orchestration; P23 owns full implementation).
6. **Visit completion sync integration is mandatory in `convex/visits.ts`**:
   - Do not add `tenantInquiries.completeVisit` mutation.
   - Extend existing `visits.complete` (lines 546-582) so after a visit is marked `COMPLETED`, if `visit.tenant_inquiry_id` exists, patch linked inquiry from `VISIT_SCHEDULED -> VISIT_COMPLETED` using internal mutation/hook.
   - Document this explicit integration point in code comments near the hook call.
7. **Add guard queries in `convex/tenantInquiries.ts`**:
   - `listBounties({ paginationOpts })`: require guard auth, filter to `status = BOUNTY_POSTED`, `bounty_expires_at > now`, and guard's society only; enrich with listing details.
   - `listByGuard({ paginationOpts })`: require guard auth, filter `assigned_guard_id = current guard`, enrich with listing + linked visit details.
8. All new admin mutations use `PERMISSIONS.TENANT_INQUIRIES_MANAGE`. All guard entry points use `requireGuard(ctx)`.
9. No duplicate visit engine, no schema changes, no negotiation workflow expansion beyond status stub.

### Deliverables

- [ ] `convex/tenantInquiries.ts` — `acceptBounty`, `scheduleVisit`, `close`, `initiateNegotiation`, `listBounties`, `listByGuard`
- [ ] `convex/visits.ts` — completion hook/sync to move linked tenant inquiry `VISIT_SCHEDULED -> VISIT_COMPLETED`

### Acceptance Criteria

1. Guard can claim only non-expired bounties in their own society.
2. Scheduling creates a real `visits` record linked back via `tenant_inquiry_id` and updates inquiry to `VISIT_SCHEDULED`.
3. Completing a linked visit automatically updates inquiry to `VISIT_COMPLETED` through `visits.complete` integration.
4. `initiateNegotiation` rejects non-`INTERESTED` outcomes and only transitions from `VISIT_COMPLETED`.
5. `listBounties` and `listByGuard` are paginated, guard-scoped, and enriched.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/tenantInquiries.ts` and `convex/visits.ts`.

### Out of Scope

- Full rent negotiation implementation (P23)
- Admin tenant inquiry UI tables/detail panels (P19-E03/P19-E04)
- Bounty expiry cron (T03)

---

## T03: Bounty Expiry Cron

### Objective

Implement automated expiry for unclaimed bounties and register an hourly cron job.

### Required Reading

- `notes/features/13-tenant-inquiry.md` — bounty expiry business rule and config key (lines 152-153)
- `notes/04-state-machines.md` — `BOUNTY_POSTED -> EXPIRED` transition (line 364)
- `convex/crons.ts` — cron registration pattern (`crons.daily(...)`) (lines 1-12)
- `convex/functions.ts` — `internalMutation` wrapper export (line 184)
- `notes/10-convex-schema.md` — `tenant_inquiries` indexes for status filtering (lines 691-695)

### Key Rules

1. Add `expireBounties` in `convex/tenantInquiries.ts` as an `internalMutation`.
2. Expiry logic must target only inquiries where:
   - `status === BOUNTY_POSTED`
   - `bounty_expires_at` exists and is `< Date.now()`
3. Batch processing must be cursor-based/paginated to avoid loading unbounded result sets:
   - Iterate in chunks (for example 100 records per page) until exhausted.
   - Patch each qualifying inquiry to `status: EXPIRED`.
4. Reuse transition validation path (do not bypass state machine semantics when expiring).
5. Read `tenant_bounty_expiry_days` from `system_config` if needed for logging/metrics context, but expiry decision is based on `bounty_expires_at` timestamps.
6. Register hourly cron in `convex/crons.ts`:
   - `crons.interval("expire-tenant-bounties", { hours: 1 }, internal.tenantInquiries.expireBounties)`
   - Must be hourly interval (not daily schedule).
7. Keep existing `daily-analytics-snapshot` cron untouched.
8. No frontend changes, no manual admin actions for expiry, no additional cron files.

### Deliverables

- [ ] `convex/tenantInquiries.ts` — `expireBounties` internal mutation
- [ ] `convex/crons.ts` — hourly `expire-tenant-bounties` cron registration

### Acceptance Criteria

1. Internal mutation expires only stale `BOUNTY_POSTED` inquiries and leaves other statuses untouched.
2. Batch loop safely handles large datasets without single-query full-table scans.
3. Cron runs hourly and points to `internal.tenantInquiries.expireBounties`.
4. Existing cron registrations continue to work.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/tenantInquiries.ts` and `convex/crons.ts`.

### Out of Scope

- Manual re-posting strategy for expired inquiries
- Notification dispatch on expiry
- Frontend expired-state UX

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
