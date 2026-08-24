---
id: P19-E01
title: Schema, Auth & Constants
phase: 19
status: done
depends_on: ["P01-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-19
---

# P19-E01: Schema, Auth & Constants

## Overview

Add `tenant_inquiries` and `tenant_profiles` tables to `convex/schema.ts` (resolving schema drift), add `TENANT` user type to validators, add `requireTenant()` auth helper, add all tenant inquiry constants/permissions/status colors, add `tenant_bounty_expiry_days` system config key, and add rate limiter key for inquiry submission.

## Prerequisites

- **Read first**: [P01-E01 Completion Summary](../phase-01-auth/P01-E01-project-scaffolding.md#completion-summary) — baseline auth, user schema, and constants patterns established in Phase 1.
- **Codebase facts to verify before starting**:
  - `convex/schema.ts` currently has no `tenant_inquiries` table and no `tenant_profiles` table.
  - `convex/schema.ts` currently defines `userTypeValidator` as only `GUARD` and `ADMIN`.
  - `convex/schema.ts` `visits` table currently has no `tenant_inquiry_id` field and no `by_tenant_inquiry_id` index.
  - `convex/auth.helpers.ts` currently has `requireGuard`, `requireGuardAuth`, `requireAdmin`, `requirePermission`, and `requireAnyPermission`; `requireTenant` does not exist yet.
  - `convex/rateLimiter.ts` currently has only `guard:lead_submission`, `public:listing_inquiry`, and `public:whatsapp_click` keys.
  - `lib/constants.ts` currently has no `TENANT_INQUIRY_STATUS`, no `VISIT_BOUNTY_STATUS`, no tenant inquiry permissions, and no `TENANT`/`OWNER` in `USER_TYPE`.

## Task Queue

- [x] P19-E01-T01: Schema Drift Fix - Tenant Tables + Visits Linkage
- [x] P19-E01-T02: Tenant Auth Plumbing
- [x] P19-E01-T03: Constants, Config & Rate Limiter

---

## T01: Schema Drift Fix - Tenant Tables + Visits Linkage

### Objective

Reconcile schema drift by adding `tenant_inquiries` and `tenant_profiles` to `convex/schema.ts`, correcting the tenant inquiry status union to include `NEGOTIATION_INITIATED`, and linking tenant inquiries to the existing `visits` table via `tenant_inquiry_id`.

### Required Reading

- `notes/10-convex-schema.md` — `tenant_inquiries` and `tenant_profiles` definitions (lines 667-711)
- `notes/04-state-machines.md` — Tenant Inquiry transition table, especially `VISIT_COMPLETED -> NEGOTIATION_INITIATED` (line 367)
- `notes/features/13-tenant-inquiry.md` — business rules for inquiry->visit linkage (lines 149-157)
- `convex/schema.ts` — current table order and `visits` table definition (lines 454-475)

### Key Rules

1. Modify `convex/schema.ts` and add a new `tenant_inquiries` table matching `notes/10-convex-schema.md` lines 667-695, with one required correction from state machine docs.
2. `tenant_inquiries.status` must include **10** literals in this set: `SUBMITTED`, `REVIEWED`, `BOUNTY_POSTED`, `GUARD_ACCEPTED`, `VISIT_SCHEDULED`, `VISIT_COMPLETED`, `NEGOTIATION_INITIATED`, `CLOSED`, `REJECTED`, `EXPIRED`.
3. Keep all required `tenant_inquiries` indexes from schema docs: `by_tenant_id`, `by_listing_id`, `by_status`, `by_assigned_guard_id`, `by_tenant_and_status`.
4. Add `tenant_profiles` table matching `notes/10-convex-schema.md` lines 697-711, including nested optional `preferences` object and `saved_listings` array.
5. Add `tenant_inquiry_id: v.optional(v.id("tenant_inquiries"))` to the existing `visits` table.
6. Add `by_tenant_inquiry_id` index to `visits` for inquiry->visit lookups.
7. Keep existing schema conventions: money in paise (`v.number()`), dates in Unix ms (`v.number()`), no `as any`, no `@ts-ignore`.
8. Do not change non-P19 entities or introduce any E02/E03/E04 scope work.

### Deliverables

- [ ] `convex/schema.ts` — `tenant_inquiries` table added (10-status union), `tenant_profiles` table added, `visits.tenant_inquiry_id` field + `by_tenant_inquiry_id` index added

### Acceptance Criteria

1. `tenant_inquiries` exists in `convex/schema.ts` with all documented fields and indexes.
2. `tenant_inquiries.status` includes `NEGOTIATION_INITIATED` and has exactly 10 allowed values.
3. `tenant_profiles` exists with `by_user_id` index and schema-compatible optional preference fields.
4. `visits` table includes optional `tenant_inquiry_id` and `by_tenant_inquiry_id` index.
5. `npx tsc --noEmit` passes with no new TypeScript errors.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`.

### Out of Scope

- Implementing `tenantInquiries.*` mutations/queries (E02)
- Admin inquiry queue UI (E03)
- Guard bounty board UI and acceptance flows (E04)
- Negotiation engine implementation (P23)

---

## T02: Tenant Auth Plumbing

### Objective

Add tenant-compatible auth primitives by extending user type validators to include `TENANT` (and `OWNER` for Phase 20 forward-compat), and introduce `requireTenant()` in auth helpers following existing guard/admin helper patterns.

### Required Reading

- `convex/schema.ts` — `userTypeValidator` and `users` table wiring (lines 4-5 and 212-226)
- `convex/auth.helpers.ts` — `requireAuth`, `requireGuard`, and `requireAdmin` patterns (lines 23-69)
- `lib/constants.ts` — `USER_TYPE` and related type exports (lines 81-87)
- `notes/features/13-tenant-inquiry.md` — tenant submission requires tenant role context

### Key Rules

1. Update `convex/schema.ts` `userTypeValidator` to include `TENANT` and `OWNER` in addition to existing `GUARD` and `ADMIN`.
2. Ensure `users.user_type` remains wired to `userTypeValidator` (no divergent validator in-table).
3. Update `lib/constants.ts` `USER_TYPE` to include `TENANT` and `OWNER`, preserving existing `as const satisfies Record<string, string>` pattern and exported `UserType` behavior.
4. Add `requireTenant(ctx)` in `convex/auth.helpers.ts` using the same structure as `requireGuard(ctx)`.
5. `requireTenant(ctx)` must enforce both: `user.user_type === "TENANT"` and `user.status === "ACTIVE"`; error messages should mirror existing helper style.
6. Do not weaken existing guard/admin auth checks while adding tenant helper.
7. No `as any`, no `@ts-ignore`, no auth bypasses.

### Deliverables

- [ ] `convex/schema.ts` — `userTypeValidator` includes `TENANT` and `OWNER`
- [ ] `lib/constants.ts` — `USER_TYPE` includes `TENANT` and `OWNER`
- [ ] `convex/auth.helpers.ts` — `requireTenant()` helper added

### Acceptance Criteria

1. `users.user_type` validator accepts `GUARD | ADMIN | TENANT | OWNER`.
2. `USER_TYPE` constant and `UserType` type in `lib/constants.ts` expose `TENANT` and `OWNER`.
3. `requireTenant()` exists and throws for non-tenant or non-active users.
4. Existing `requireGuard()`, `requireAdmin()`, and permission helpers continue to compile unchanged.
5. `npx tsc --noEmit` passes with no new TypeScript errors.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`, `convex/auth.helpers.ts`, and `lib/constants.ts`.

### Out of Scope

- Tenant login UI or route protection updates
- Owner service request auth flows (P20)
- RBAC policy changes beyond new permission constants in T03

---

## T03: Constants, Config & Rate Limiter

### Objective

Add all missing tenant inquiry constants and permission keys, introduce `tenant_bounty_expiry_days` as a system config key with default `3`, and add a dedicated tenant inquiry submission rate limiter key.

### Required Reading

- `notes/13-constants-reference.md` — Tenant Inquiry Status colors (lines 551-563) and Visit Bounty Status (lines 614-621)
- `notes/features/13-tenant-inquiry.md` — bounty expiry config key requirement (line 152)
- `notes/04-state-machines.md` — `NEGOTIATION_INITIATED` transition requirement (line 367)
- `lib/constants.ts` — existing status maps, `PERMISSIONS`, `SYSTEM_CONFIG_KEYS`, `SYSTEM_CONFIG_DEFAULTS`
- `convex/schema.ts` — `systemConfigKeyValidator` literals (lines 188-209)
- `convex/rateLimiter.ts` — current fixed-window pattern
- `convex/seed.ts` — system config seed path via `SYSTEM_CONFIG_DEFAULTS` (lines 242-260)

### Key Rules

1. In `lib/constants.ts`, add `TENANT_INQUIRY_STATUS` enum with all 10 values, including `NEGOTIATION_INITIATED`.
2. Add `TenantInquiryStatus` type and `TENANT_INQUIRY_STATUS_COLORS` map; match colors from docs for existing statuses, and add `NEGOTIATION_INITIATED: "bg-orange-100 text-orange-700"`.
3. Add `VISIT_BOUNTY_STATUS` enum (`POSTED`, `CLAIMED`, `EXPIRED`, `COMPLETED`), `VisitBountyStatus` type, and `VISIT_BOUNTY_STATUS_COLORS` map per docs lines 614-621.
4. Add exactly two new permissions in `PERMISSIONS`: `TENANT_INQUIRIES_VIEW` and `TENANT_INQUIRIES_MANAGE` (do not add a separate `POST_BOUNTY` permission).
5. Add `tenant_bounty_expiry_days` to `systemConfigKeyValidator` in `convex/schema.ts`.
6. Add matching key/value in `lib/constants.ts`: `SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_EXPIRY_DAYS` and `SYSTEM_CONFIG_DEFAULTS[tenant_bounty_expiry_days] = "3"` so `convex/seed.ts` inserts it through existing config seeding logic.
7. Add `"tenant:inquiry_submission"` in `convex/rateLimiter.ts` as fixed window `5` per `60 * 60 * 1000` (1 hour), keyed by tenant user id at call sites.
8. Keep existing rate limiter keys untouched and do not alter unrelated defaults.
9. Preserve all project conventions: money in paise, dates in Unix ms, no `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `lib/constants.ts` — tenant inquiry statuses/colors, visit bounty statuses/colors, tenant inquiry permissions, new system config key/default
- [ ] `convex/schema.ts` — `tenant_bounty_expiry_days` added to `systemConfigKeyValidator`
- [ ] `convex/rateLimiter.ts` — `tenant:inquiry_submission` fixed-window limiter added
- [ ] `convex/seed.ts` — seeded config path validated/updated to include default `tenant_bounty_expiry_days = 3`

### Acceptance Criteria

1. `TENANT_INQUIRY_STATUS` has exactly 10 values and includes `NEGOTIATION_INITIATED`.
2. `TENANT_INQUIRY_STATUS_COLORS` matches documented colors plus required orange color for `NEGOTIATION_INITIATED`.
3. `VISIT_BOUNTY_STATUS` and `VISIT_BOUNTY_STATUS_COLORS` match constants docs.
4. `PERMISSIONS` includes only `TENANT_INQUIRIES_VIEW` and `TENANT_INQUIRIES_MANAGE` for this scope.
5. `tenant_bounty_expiry_days` is accepted by schema validator and seeded with default `"3"`.
6. `tenant:inquiry_submission` limiter exists with fixed-window 5/hour semantics.
7. `npx tsc --noEmit` passes with no new TypeScript errors.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/constants.ts`, `convex/schema.ts`, `convex/rateLimiter.ts`, and `convex/seed.ts`.

### Out of Scope

- Tenant inquiry mutation/query implementations (E02)
- Cron job to expire bounties (E02-T03)
- Admin inquiry queue and action dialogs (E03)
- Guard bounty board UI and acceptance flows (E04)
- Negotiation and closure gating implementation (P23)

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
