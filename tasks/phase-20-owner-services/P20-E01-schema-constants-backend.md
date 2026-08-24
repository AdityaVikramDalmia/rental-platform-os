---
id: P20-E01
title: Schema, Constants & Backend Functions
phase: 20
status: done
depends_on: ["P19-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-19
---

# P20-E01: Schema, Constants & Backend Functions

## Overview

Add `owner_service_requests` to `convex/schema.ts` to resolve schema drift, add owner service request statuses/colors/permissions, add `public:owner_service_request` rate limiting, include owner service request writes in audit triggers, implement `convex/ownerServiceRequests.ts` with public submission + admin lifecycle/state machine queries, and add a `createOwnerAccount` WorkOS action for CONTACTED -> ONBOARDED onboarding.

## Prerequisites

- **Read first**: [P19-E01 Completion Summary](../phase-19-tenant-inquiry-pipeline/P19-E01-schema-auth-constants.md#completion-summary) - this epic assumes tenant/owner auth foundation and constants plumbing from P19.
- P19-E01 must be complete before starting this epic because P20 onboarding depends on `OWNER` support in shared type validators/constants.
- Verify `OWNER` exists in `convex/schema.ts` `userTypeValidator` before starting T03.
- **Codebase facts to verify before starting**:
  - `convex/schema.ts` currently has no `owner_service_requests` table (schema drift vs docs).
  - `convex/rateLimiter.ts` currently has no `public:owner_service_request` limiter key.
  - `convex/functions.ts` `AUDITED_TABLES` currently does not include `owner_service_requests`.
  - `lib/constants.ts` currently has no owner service request status enum/color map and no owner request permissions.
  - `convex/actions/workos.ts` currently has `createGuardAccount` patterns but no owner onboarding action.

## Task Queue

- [x] P20-E01-T01: Schema Drift Fix + Constants + Permissions + Rate Limiter + Audit
- [x] P20-E01-T02: Core Mutations + Queries
- [x] P20-E01-T03: Owner Onboarding WorkOS Action

---

## T01: Schema Drift Fix + Constants + Permissions + Rate Limiter + Audit

### Objective

Add the missing `owner_service_requests` table and supporting backend primitives so owner requests have schema coverage, enum/constants coverage, permission keys, anti-spam rate limiting, and audit trigger coverage before lifecycle functions are implemented.

### Required Reading

- `notes/10-convex-schema.md` - `owner_service_requests` table definition (lines 713-735)
- `notes/13-constants-reference.md` - Owner Service Request status colors (lines 565-574)
- `convex/rateLimiter.ts` - existing limiter key naming and fixed-window config pattern
- `convex/functions.ts` - `AUDITED_TABLES` array and wrapped mutation exports (lines 54-68, 183-186)
- `lib/constants.ts` - enum, permission, and status color map patterns

### Key Rules

1. Add `owner_service_requests` to `convex/schema.ts` with all fields from schema docs and no omissions:
   - `name: v.string()`
   - `phone: v.string()` (store normalized 10-digit format)
   - `email: v.optional(v.string())`
   - `property_type: v.optional(v.string())`
   - `location: v.optional(v.string())`
   - `property_value: v.optional(v.number())` (paise integer)
   - `notes: v.optional(v.string())`
   - `status: v.union(v.literal("SUBMITTED"), v.literal("CONTACTED"), v.literal("ONBOARDED"), v.literal("ACTIVE"), v.literal("REJECTED"), v.literal("DROPPED"))`
   - `ops_notes: v.optional(v.string())`
   - `assigned_admin_id: v.optional(v.id("users"))`
   - `contacted_at: v.optional(v.number())` (Unix ms, first set on SUBMITTED -> CONTACTED)
2. Add indexes exactly as documented: `by_status`, `by_phone`, `by_assigned_admin_id`.
3. Add `OWNER_SERVICE_REQUEST_STATUS` enum (6 values), `OwnerServiceRequestStatus` type, and `OWNER_SERVICE_REQUEST_STATUS_COLORS` in `lib/constants.ts`.
4. `OWNER_SERVICE_REQUEST_STATUS_COLORS` must match constants reference colors exactly:
   - `SUBMITTED`: `bg-blue-100 text-blue-700`
   - `CONTACTED`: `bg-indigo-100 text-indigo-700`
   - `ONBOARDED`: `bg-green-100 text-green-700`
   - `ACTIVE`: `bg-emerald-100 text-emerald-700`
   - `REJECTED`: `bg-red-100 text-red-700`
   - `DROPPED`: `bg-gray-100 text-gray-500`
5. Add permission keys in `PERMISSIONS` in `lib/constants.ts`:
   - `OWNER_SERVICE_REQUESTS_VIEW`
   - `OWNER_SERVICE_REQUESTS_MANAGE`
6. Add `public:owner_service_request` in `convex/rateLimiter.ts` using fixed-window semantics of `3` requests per `60 * 60 * 1000` and key by normalized phone at call sites.
7. Add `"owner_service_requests"` to `AUDITED_TABLES` in `convex/functions.ts` so wrapped mutations emit audit logs.
8. Do not change unrelated schema enums/tables or unrelated permissions in this task.

### Deliverables

- [ ] `convex/schema.ts` - `owner_service_requests` table with full field/index coverage
- [ ] `lib/constants.ts` - owner service request status enum/type/colors and new permission keys
- [ ] `convex/rateLimiter.ts` - `public:owner_service_request` fixed-window limiter key
- [ ] `convex/functions.ts` - `owner_service_requests` added to `AUDITED_TABLES`

### Acceptance Criteria

1. `owner_service_requests` exists in `convex/schema.ts` with all documented fields, all 6 statuses, and `contacted_at`.
2. Table indexes include exactly `by_status`, `by_phone`, and `by_assigned_admin_id`.
3. `OWNER_SERVICE_REQUEST_STATUS` and `OWNER_SERVICE_REQUEST_STATUS_COLORS` exist and match documented colors exactly.
4. `PERMISSIONS` includes both `OWNER_SERVICE_REQUESTS_VIEW` and `OWNER_SERVICE_REQUESTS_MANAGE`.
5. `public:owner_service_request` limiter exists with fixed-window 3/hour semantics.
6. `owner_service_requests` is included in `AUDITED_TABLES`.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, `convex/rateLimiter.ts`, and `convex/functions.ts`.

### Out of Scope

- `convex/ownerServiceRequests.ts` lifecycle mutations/queries (T02)
- WorkOS owner onboarding action and internal onboarding mutation (T03)
- Public/admin frontend owner request pages (P20-E02/P20-E03)

---

## T02: Core Mutations + Queries

### Objective

Create `convex/ownerServiceRequests.ts` with public owner request submission, admin status transitions validated by the owner service state machine, admin list/detail queries, and status count aggregation for admin tabs.

### Required Reading

- `notes/features/14-owner-services.md` - owner service function contracts and business rules (lines 113-128, 132-147)
- `notes/04-state-machines.md` - exact owner request transitions (lines 815-820)
- `convex/functions.ts` - wrapped `mutation`, `internalMutation`, and `query` exports (lines 183-186)
- `convex/leads.ts` - `validateLeadTransition` helper pattern (lines 81-90)
- `convex/leads.ts` - index-first paginated list pattern (lines 658-800)
- `lib/validators.ts` - phone normalization helper usage

### Key Rules

1. Create `convex/ownerServiceRequests.ts` and import `mutation`/`query` from `./functions` (never from `./_generated/server` for wrapped mutations).
2. Implement `VALID_TRANSITIONS` using the owner service state machine exactly:

   ```ts
   SUBMITTED -> [CONTACTED, REJECTED]
   CONTACTED -> [ONBOARDED, DROPPED]
   ONBOARDED -> [ACTIVE]
   // ACTIVE, REJECTED, DROPPED: terminal
   ```

3. Implement `validateTransition(current, next)` in the same style as `validateLeadTransition`; throw explicit errors for invalid transitions.
4. Implement `submit({ name, phone, email?, property_type?, location?, property_value?, notes? })` as public (no auth), with phone-keyed rate limiting using `public:owner_service_request`.
5. In `submit`, normalize phone via `normalizePhone` and reject invalid non-10-digit values after normalization.
6. In `submit`, validate `property_value` when provided as positive integer paise (`Number.isInteger` + `> 0`).
7. In `submit`, insert with `status: "SUBMITTED"` and do not set admin-only fields (`assigned_admin_id`, `ops_notes`, `contacted_at`) at creation.
8. Implement `updateStatus({ id, status, ops_notes? })` requiring `requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE)` and transition validation.
9. In `updateStatus`, when transitioning to `CONTACTED`, set both `contacted_at: Date.now()` (only if not already set) and `assigned_admin_id` to the acting admin user.
10. In `updateStatus`, when target status is `REJECTED` or `DROPPED`, require non-empty `ops_notes`.
11. `updateStatus` must not perform ONBOARDED account creation logic; ONBOARDED transition side effects are handled by T03 action/internal mutation.
12. Implement `list({ status?, paginationOpts })` requiring `PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW`, using `paginationOptsValidator`, and index-first querying (`by_status` when status filter is provided).
13. Implement `getById({ id })` requiring `PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW` and return request enriched with assigned-admin user summary when available.
14. Implement `statusCounts()` requiring `PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW` and return counts for all owner request statuses for admin tab badges.
15. Duplicate phone numbers are allowed; do not add uniqueness checks on phone.
16. Keep project invariants strict: money in paise integers, dates in Unix ms, no `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/ownerServiceRequests.ts` - `VALID_TRANSITIONS`, `validateTransition`, `submit`, `updateStatus`, `list`, `getById`, `statusCounts`

### Acceptance Criteria

1. `submit` is public, normalizes phone, enforces phone-keyed rate limit, and validates `property_value` paise integer semantics.
2. `updateStatus` enforces manage permission and owner-service transition rules; invalid transitions throw.
3. `updateStatus` sets `contacted_at` + `assigned_admin_id` on CONTACTED.
4. `updateStatus` requires non-empty `ops_notes` for REJECTED and DROPPED transitions.
5. `list` is paginated and supports optional status filtering via index-first query selection.
6. `getById` returns owner request details enriched with assigned admin info.
7. `statusCounts` returns count entries for all defined owner service statuses.
8. ONBOARDED-specific WorkOS account creation is not handled in this task.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/ownerServiceRequests.ts`.

### Out of Scope

- `createOwnerAccount` WorkOS action and internal onboarding mutation wiring (T03)
- Public owner services page and form UI (P20-E02)
- Admin owner request queue UI/actions (P20-E03)

---

## T03: Owner Onboarding WorkOS Action

### Objective

Add `createOwnerAccount` in `convex/actions/workos.ts` to perform CONTACTED -> ONBOARDED onboarding by creating (or linking) a WorkOS Google-email user and corresponding Convex `users` record with `user_type: OWNER`.

### Required Reading

- `convex/actions/workos.ts` - `createGuardAccount` action pattern and permission check flow
- `notes/features/14-owner-services.md` - onboarding requirements and edge cases (lines 70-71, 137-138, 146-147)
- `convex/schema.ts` - `users` table and `owner_service_requests` schema
- `convex/auth.helpers.ts` - admin auth/permission enforcement patterns
- `convex/ownerServiceRequests.ts` (from T02) - status transitions and internal mutation structure

### Key Rules

1. Add `createOwnerAccount` action to `convex/actions/workos.ts` following `createGuardAccount` structure.
2. Use args exactly: `{ owner_request_id: v.id("owner_service_requests"), owner_email: v.string(), name: v.string() }`.
3. Enforce authorization inside the action before any WorkOS call by using `ctx.runQuery(...)` permission checks for `PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE`.
4. Validate the target request exists and is currently `CONTACTED` before onboarding proceeds.
5. Create WorkOS user with Google email semantics (no password):
   - `workos.userManagement.createUser({ email, firstName, emailVerified: true })`
   - Do not send synthetic email or password fields.
6. Handle "user already exists" edge case:
   - If WorkOS indicates the email already exists, resolve/link that existing WorkOS user.
   - If a Convex user already exists for that WorkOS user id and `user_type !== "OWNER"`, throw: `Email is registered as a different user type`.
7. Create Convex user record with `{ workos_user_id, name, email, user_type: "OWNER", status: "ACTIVE" }` when an owner user does not already exist.
8. Add `onboardInternal` internal mutation in `convex/ownerServiceRequests.ts` and route DB writes through `ctx.runMutation(internal.ownerServiceRequests.onboardInternal, ...)`.
9. `onboardInternal` must transition the request to `ONBOARDED`, set/retain `assigned_admin_id` as acting admin, and persist any linkage fields needed for traceability.
10. Keep transition enforcement aligned with owner request state machine (`CONTACTED -> ONBOARDED` only in this flow).
11. Maintain strict type safety and project rules: no `as any`, no `@ts-ignore`, no direct DB writes from action.

### Deliverables

- [ ] `convex/actions/workos.ts` - `createOwnerAccount` action
- [ ] `convex/ownerServiceRequests.ts` - `onboardInternal` internal mutation and related onboarding validation helpers

### Acceptance Criteria

1. `createOwnerAccount` checks `OWNER_SERVICE_REQUESTS_MANAGE` permission before any external WorkOS call.
2. Action rejects onboarding when request is missing or not in `CONTACTED` status.
3. WorkOS user creation uses owner Google email with no password.
4. Existing-user edge case is handled (link existing owner user or throw cross-user-type conflict error).
5. Convex `users` record exists after action with `user_type: "OWNER"` and `status: "ACTIVE"`.
6. Owner request transitions to `ONBOARDED` through `onboardInternal` mutation.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/actions/workos.ts` and `convex/ownerServiceRequests.ts`.

### Out of Scope

- Frontend onboarding dialog UI and action wiring (P20-E03)
- Owner-facing authenticated portal/dashboard pages (deferred)
- `ACTIVE` transition UI flow (P20-E03 should call `updateStatus`)

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
