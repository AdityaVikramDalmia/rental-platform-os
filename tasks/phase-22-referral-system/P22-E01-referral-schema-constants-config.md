---
id: P22-E01
title: Referral Schema, Constants & Configuration Backend
phase: 22
status: pending
depends_on: ["P01-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-18
---

# P22-E01: Referral Schema, Constants & Configuration Backend

## Overview

Resolve referral schema drift by adding all four referral tables, add referral enums/permissions/audit actions/rate-limiter/config defaults, and implement referral configuration backend + shared referral utilities. This epic establishes the platform-level backend primitives used by guard referrals (Rental Platform OS) and code-based tenant/owner referrals (DemoRentals).

## Prerequisites

- **Read first**: [P01-E01 Completion Summary](../phase-01-auth/P01-E01-project-scaffolding.md#completion-summary) - baseline Convex auth, wrapped mutation imports, constants structure, and seed conventions.
- P01-E01 must be complete before this epic because referral config mutations and listing queries are admin-permission-protected and depend on Phase 1 auth foundations.
- **Codebase facts to verify before starting**:
  - `convex/schema.ts` currently has no `referral_codes`, `referrals`, `referral_milestones`, or `referral_config` tables (schema drift against docs).
  - `convex/schema.ts` `auditActionValidator` currently has no referral audit actions.
  - `lib/constants.ts` currently has no referral enums, no referral color maps, no referral permissions, and no referral config scope enum.
  - `lib/constants.ts` `AUDIT_ACTIONS` currently has no referral action constants.
  - `convex/rateLimiter.ts` currently has no `public:referral_signup` limiter key.
  - `convex/functions.ts` `AUDITED_TABLES` currently has no referral tables.
  - `convex/seed.ts` currently seeds `system_config` defaults but does not seed global `referral_config` rows.

## Task Queue

- [ ] P22-E01-T01: Schema Drift Fix - Add 4 Referral Tables
- [ ] P22-E01-T02: Constants, Permissions, Rate Limiter, Audit Wiring, and Seed Defaults
- [ ] P22-E01-T03: Referral Configuration CRUD (`convex/referralConfig.ts`)
- [ ] P22-E01-T04: Shared Referral Utilities (`lib/referral.ts`)

---

## T01: Schema Drift Fix - Add 4 Referral Tables

### Objective

Add the four documented referral tables to `convex/schema.ts` exactly as specified so all referral entities have type-safe storage before lifecycle logic is implemented in later epics.

### Required Reading

- `notes/10-convex-schema.md` - referral table definitions and indexes (lines 479-561)
- `notes/features/17-referral-system.md` - schema section + business rules (lines 228-315)
- `convex/schema.ts` - current validators, table ordering, and index style (lines 1-555)
- `notes/04-state-machines.md` - referral and milestone states for validator alignment (lines 429-483)

### Key Rules

1. Add `referral_codes`, `referrals`, `referral_milestones`, and `referral_config` to `convex/schema.ts` with field names and validators matching `notes/10-convex-schema.md` lines 479-561 exactly.
2. `referral_codes` must include exactly: `user_id`, `code`, `is_active`; indexes must be `by_user_id` and `by_code`.
3. `referrals` must include exactly: `referrer_user_id`, `referred_user_id`, `referral_code_id`, `referral_type`, `status`, `lead_id`, `listing_id`, `closure_id`, `voided_reason`, `voided_by_admin_id`; indexes must be `by_referrer_user_id`, `by_referred_user_id`, `by_referral_type`, `by_status`, `by_closure_id`.
4. `referral_code_id` MUST be `v.optional(v.id("referral_codes"))` because guard referrals do not use referral codes.
5. `referral_milestones` must include exactly: `referral_id`, `milestone_type`, `amount`, `status`, `triggered_at`, `approved_by_admin_id`, `paid_at`, `payout_method`, `voided_reason`; indexes must be `by_referral_id`, `by_status`, `by_milestone_type`.
6. `referral_config` must include exactly: `referral_type`, `scope_type`, `scope_id`, `sign_up_bonus`, `finding_bonus_total`, `publish_split_pct`, `closure_split_pct`, `is_active`, `updated_by_admin_id`; indexes must be `by_referral_type` and `by_scope`.
7. Follow project data rules strictly: money fields are paise integers (`v.number()`), dates are Unix ms (`v.number()`), nullable/optional fields use `v.optional(...)` (not `v.union(..., v.null())`).
8. Do not alter unrelated tables or validators in this task.

### Deliverables

- [ ] `convex/schema.ts` - four referral tables added with exact fields and indexes from docs lines 479-561

### Acceptance Criteria

1. `convex/schema.ts` includes `referral_codes`, `referrals`, `referral_milestones`, and `referral_config`.
2. Every field name and validator for the four tables matches docs lines 479-561 exactly.
3. Every documented index for the four tables exists with exact names and index field ordering.
4. `referrals.referral_code_id` is optional and compatible with guard referrals.
5. `referral_milestones.amount`, `referral_config.sign_up_bonus`, and `referral_config.finding_bonus_total` are paise-number fields.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`.

### Out of Scope

- Referral lifecycle mutations/queries (P22-E02/P22-E03/P22-E04)
- Any admin or guard referral UI work (P22-E05)
- Referral analytics and predictor implementation details beyond schema storage

---

## T02: Constants, Permissions, Rate Limiter, Audit Wiring, and Seed Defaults

### Objective

Add all referral enums/types/permissions/config keys and operational wiring so referral backend behavior is fully aligned across constants, validators, rate limiting, audit logs, and seed defaults.

### Required Reading

- `notes/13-constants-reference.md` - referral enums and scope types (lines 636-684)
- `notes/04-state-machines.md` - referral + milestone transition definitions (lines 429-483)
- `notes/features/17-referral-system.md` - schema prerequisites and defaults (lines 353-360, 295-317)
- `lib/constants.ts` - enum/type/color/permission/audit/constants patterns (lines 1-459)
- `convex/schema.ts` - `auditActionValidator` and `systemConfigKeyValidator` pattern (lines 151-209)
- `convex/rateLimiter.ts` - fixed-window key definition style (lines 4-20)
- `convex/functions.ts` - `AUDITED_TABLES` and trigger registration pattern (lines 54-181)
- `convex/seed.ts` - idempotent seed flow and system config insertion pattern (lines 31-263)

### Key Rules

1. In `lib/constants.ts`, add referral enums + exported types:
   - `REFERRAL_TYPE`: `TENANT_FINDING`, `OWNER_FINDING`, `GUARD`
   - `REFERRAL_STATUS`: `PENDING`, `QUALIFIED`, `PARTIALLY_PAID`, `FULLY_PAID`, `VOIDED`
   - `REFERRAL_MILESTONE_TYPE`: `SIGN_UP`, `LISTING_PUBLISHED`, `DEAL_CLOSED`, `FIRST_VERIFIED_LEAD`
   - `REFERRAL_MILESTONE_STATUS`: `PENDING`, `TRIGGERED`, `APPROVED`, `PAID`, `VOIDED`
   - `REFERRAL_CONFIG_SCOPE_TYPE`: `GLOBAL`, `SOCIETY`, `BUILDING`
2. Add `REFERRAL_STATUS_COLORS` and `REFERRAL_MILESTONE_STATUS_COLORS` maps in `lib/constants.ts` using existing status color map conventions and the referral enum sets from `notes/13-constants-reference.md` lines 648-684.
3. Add referral permissions to `PERMISSIONS` in `lib/constants.ts`:
   - `REFERRALS_VIEW`
   - `REFERRALS_MANAGE`
   - `REFERRALS_CONFIGURE`
   - `REFERRALS_APPROVE_PAYOUT`
4. Add referral audit action constants to both `convex/schema.ts` `auditActionValidator` and `lib/constants.ts` `AUDIT_ACTIONS`:
   - `REFERRAL_CODES_INSERT`
   - `REFERRALS_INSERT`, `REFERRALS_UPDATE`
   - `REFERRAL_MILESTONES_INSERT`, `REFERRAL_MILESTONES_UPDATE`
   - `REFERRAL_CONFIG_INSERT`, `REFERRAL_CONFIG_UPDATE`
5. Add the four referral tables to `AUDITED_TABLES` in `convex/functions.ts`: `referral_codes`, `referrals`, `referral_milestones`, `referral_config`.
6. Add `public:referral_signup` in `convex/rateLimiter.ts` using fixed-window semantics and a conservative anti-abuse baseline suitable for referral link sign-up capture.
7. In `convex/seed.ts`, seed global `referral_config` defaults for all referral types with `scope_type: "GLOBAL"` and no scope id:
   - Guard referral: `finding_bonus_total = 50000` (Rs500)
   - Tenant-finding: `sign_up_bonus = 20000`, `finding_bonus_total = 100000` (Rs1000)
   - Owner-finding: `sign_up_bonus = 20000`, `finding_bonus_total = 200000` (Rs2000)
   - Split defaults: `publish_split_pct = 30`, `closure_split_pct = 70`
8. Seed logic must be idempotent: do not duplicate global `referral_config` rows if they already exist.
9. Preserve existing constants typing patterns (`as const satisfies Record<string, string>`) and avoid breaking `ALL_PERMISSIONS` derivation.
10. Do not implement referral business functions in this task; only shared wiring and defaults.

### Deliverables

- [ ] `lib/constants.ts` - referral enums/types/colors, referral permissions, and referral audit action constants
- [ ] `convex/schema.ts` - referral audit actions added to `auditActionValidator`
- [ ] `convex/rateLimiter.ts` - `public:referral_signup` limiter key added
- [ ] `convex/functions.ts` - referral tables added to `AUDITED_TABLES`
- [ ] `convex/seed.ts` - idempotent GLOBAL `referral_config` default seeding for 3 referral types

### Acceptance Criteria

1. All referral enums in `lib/constants.ts` match docs lines 636-684 exactly.
2. Referral status and milestone status color maps exist and cover every enum value.
3. `PERMISSIONS` includes the four referral permission keys.
4. `auditActionValidator` and `AUDIT_ACTIONS` include all seven referral audit actions.
5. `AUDITED_TABLES` includes all four referral tables so referral mutations auto-log.
6. `public:referral_signup` limiter key exists in `convex/rateLimiter.ts` with fixed-window configuration.
7. Seed initializes GLOBAL defaults for `GUARD`, `TENANT_FINDING`, and `OWNER_FINDING` without duplicating existing rows.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/constants.ts`, `convex/schema.ts`, `convex/rateLimiter.ts`, `convex/functions.ts`, and `convex/seed.ts`.

### Out of Scope

- `convex/referralConfig.ts` CRUD implementation (T03)
- Referral event triggers/milestone payout flows (later P22 epics)
- Referral dashboard, sharing UI, and admin referral pages (P22-E05)

---

## T03: Referral Configuration CRUD (`convex/referralConfig.ts`)

### Objective

Create referral configuration backend functions with admin-safe upsert and deterministic scope resolution (building -> society -> global fallback) to power all bonus lookups.

### Required Reading

- `notes/features/17-referral-system.md` - config precedence and admin configuration requirements (lines 146-151, 289-306)
- `notes/10-convex-schema.md` - `referral_config` schema fields/indexes (lines 543-561)
- `convex/functions.ts` - wrapped `mutation` + `query` import requirement (lines 183-186)
- `convex/auth.helpers.ts` - `requirePermission` usage pattern for admin-only functions (lines 71-97)
- `notes/13-constants-reference.md` - `REFERRAL_CONFIG_SCOPE_TYPE` enum values (lines 677-684)

### Key Rules

1. Create `convex/referralConfig.ts` using wrapped exports from `./functions` (never direct `mutation` import from `./_generated/server`).
2. Implement `upsert` mutation (admin-only) keyed by `(referral_type, scope_type, scope_id)` and guarded with referral configuration permission.
3. Enforce scope coherence in `upsert`:
   - `GLOBAL`: `scope_id` absent
   - `SOCIETY`: `scope_id` required and must reference an existing, non-deleted society
   - `BUILDING`: `scope_id` required and must reference an existing, non-deleted building
4. `upsert` must either update the existing row for the exact tuple or create a new row if none exists; never create duplicates for the same tuple.
5. Implement `getForScope` query with cascading lookup precedence exactly as product spec requires: BUILDING -> SOCIETY -> GLOBAL.
6. `getForScope` response must include resolved config plus metadata indicating which scope level matched.
7. Implement `list` query (admin-only) returning all referral configs for management UI.
8. Validate numeric config fields before write: paise values are non-negative integers; split percentages are valid and coherent.
9. Follow soft-delete and audit conventions: societies/buildings validation must ignore deleted records, and all writes must pass through wrapped mutation for audit logs.
10. Do not implement referral code generation or milestone triggers in this task.

### Deliverables

- [ ] `convex/referralConfig.ts` - `upsert`, `getForScope`, and `list` functions with scope validation and precedence resolution

### Acceptance Criteria

1. `upsert` exists, is admin-only, and enforces `scope_type`/`scope_id` coherence.
2. `upsert` rejects invalid/soft-deleted societies or buildings for scoped overrides.
3. `getForScope` resolves precedence exactly: building first, then society, then global.
4. `getForScope` returns which scope level matched the final config.
5. `list` exists, is admin-only, and returns all config rows for settings page management.
6. Writes route through wrapped `mutation` so `referral_config` audit triggers fire.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referralConfig.ts`.

### Out of Scope

- Referral code table operations (`convex/referralCodes.ts`)
- Referral attribution/override flows (`convex/referrals.ts`)
- Milestone approval/payment functions (`convex/referralMilestones.ts`)

---

## T04: Shared Referral Utilities (`lib/referral.ts`)

### Objective

Add a shared referral utility module for code generation, transition validation, and deterministic split calculations so referral domain modules reuse one canonical rule source.

### Required Reading

- `notes/features/17-referral-system.md` - referral code format and split behavior (lines 303-305, 295-299)
- `notes/04-state-machines.md` - referral + milestone transitions (lines 456-483)
- `lib/constants.ts` - enum export naming conventions and type patterns (lines 81-87, 290-323)
- `lib/money.ts` - integer money handling style (paise, no float drift) (lines 1-17)

### Key Rules

1. Create `lib/referral.ts` with only pure utility functions (no database access, no side effects beyond random code string generation).
2. Implement `generateReferralCode()` returning `FLAT-XXXXX` where `XXXXX` is 5 uppercase alphanumeric characters (`A-Z0-9`).
3. `generateReferralCode()` should not perform DB uniqueness checks; collision retry is handled by call-site mutation logic.
4. Implement `validateReferralTransition(from, to)` enforcing state-machine transitions:
   - `PENDING -> QUALIFIED | VOIDED`
   - `QUALIFIED -> PARTIALLY_PAID | FULLY_PAID | VOIDED`
   - `PARTIALLY_PAID -> FULLY_PAID | VOIDED`
   - `FULLY_PAID`, `VOIDED` terminal
5. Implement `validateMilestoneTransition(from, to)` enforcing state-machine transitions:
   - `PENDING -> TRIGGERED | VOIDED`
   - `TRIGGERED -> APPROVED | VOIDED`
   - `APPROVED -> PAID | VOIDED`
   - `PAID`, `VOIDED` terminal
6. Implement `calculateSplitAmount(totalPaise, splitPct)` with integer-safe math (no floating-point rounding drift) and explicit handling for invalid percentages.
7. Utility function signatures must be strongly typed using shared referral status/milestone types from `lib/constants.ts`.
8. Do not add business logic that mutates referral records in this task.

### Deliverables

- [ ] `lib/referral.ts` - `generateReferralCode`, `validateReferralTransition`, `validateMilestoneTransition`, `calculateSplitAmount`

### Acceptance Criteria

1. `generateReferralCode()` always returns strings matching `/^FLAT-[A-Z0-9]{5}$/`.
2. Transition validators return `true` only for legal transitions from the state machine docs.
3. Terminal-state transitions are rejected for both referral and milestone validators.
4. `calculateSplitAmount` uses integer math and returns stable paise results.
5. Utility functions are reusable by backend modules without importing Convex runtime APIs.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/referral.ts`.

### Out of Scope

- Referral code persistence and uniqueness enforcement in DB tables
- Referral/milestone mutation implementations that consume these helpers
- UI formatting helpers for referral dashboards

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
