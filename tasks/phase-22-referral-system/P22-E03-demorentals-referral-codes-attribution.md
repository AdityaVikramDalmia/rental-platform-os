---
id: P22-E03
title: DemoRentals Referral Codes, Attribution & Landing
phase: 22
status: pending
depends_on: ["P22-E01", "P19-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P22-E03: DemoRentals Referral Codes, Attribution & Landing

## Overview

Implement DemoRentals referral code generation, sign-up attribution, admin attribution override, and the public referral landing capture route. This epic establishes first-touch attribution for tenant/owner referrals, prevents self-referrals and duplicate attribution, and ensures admins can safely correct attribution with atomic override behavior.

## Prerequisites

- **Read first**: [P22-E01 Completion Summary](P22-E01-referral-schema-constants-config.md#completion-summary) - confirm referral enums, schema tables, and constants are implemented before writing referral code logic.
- **Read first**: [P19-E01 Completion Summary](../phase-19-tenant-inquiry-pipeline/P19-E01-schema-auth-constants.md#completion-summary) - this dependency is required because `TENANT` and `OWNER` user types must exist for `referral_type` determination during sign-up attribution.
- Ensure DemoRentals referral code generation utilities exist in `lib/referral.ts` (or add them in this epic scope if not present).
- If `P19-E01` is not `done`, this epic is **blocked**.

## Task Queue

- [ ] P22-E03-T01: Code Generation + CRUD in `convex/referralCodes.ts`
- [ ] P22-E03-T02: Sign-up Attribution in `convex/referrals.ts` (`recordDemoRentalsReferral`)
- [ ] P22-E03-T03: Admin Attribution Override + Deal Lookup in `convex/referrals.ts`
- [ ] P22-E03-T04: Public Referral Landing Route `src/app/(public)/ref/[code]/page.tsx`

---

## T01: Code Generation + CRUD in `convex/referralCodes.ts`

### Objective

Create the DemoRentals referral-code backend module with one-code-per-user generation, active-code validation lookup, and admin deactivation so referral attribution can rely on a canonical source of truth.

### Required Reading

- `notes/features/17-referral-system.md` - Flow 2/3 sign-up code usage, code format, and deactivation rules (lines 69-101, 303-320)
- `notes/10-convex-schema.md` - `referral_codes` table fields and indexes (lines 479-485)
- `notes/10-convex-schema.md` - `referrals` linkage fields for code usage (lines 487-513)
- `convex/auth.helpers.ts` - `requireAuth`, `requireAdmin`, `requirePermission` patterns
- `lib/referral.ts` - `generateReferralCode()` helper and related utilities

### Key Rules

1. Create `convex/referralCodes.ts` with exactly four functions in this task scope: `generate`, `getByUser`, `getByCode`, and `deactivate`.
2. `generate` mutation must enforce one-code-per-user by checking `referral_codes.by_user_id` first and returning the existing code when present.
3. New codes must follow `FLAT-XXXXX` uppercase format using `generateReferralCode()` from `lib/referral.ts`.
4. Collision handling is mandatory: retry code generation up to 10 attempts against `referral_codes.by_code`; throw a descriptive error if exhausted.
5. All newly generated codes must insert with `is_active: true`.
6. `getByUser` query must return the authenticated caller's code record or `null` when absent.
7. `getByCode` query must validate both existence and `is_active === true`, and return the code record plus referrer user identity fields needed for sign-up confirmation UX.
8. `deactivate` mutation must be admin-only and set `is_active` to `false` without mutating existing `referrals` rows.
9. Deactivated codes must be rejected for new attribution, but historical referrals tied to the code remain valid per spec.
10. Keep all code-paths type-safe; no `as any`, no `@ts-ignore`, no bypass of auth helpers.

### Deliverables

- [ ] `convex/referralCodes.ts` - `generate`, `getByUser`, `getByCode`, `deactivate` with collision retry and active-code validation

### Acceptance Criteria

1. Calling `generate` twice for the same user returns the same existing code (no duplicates).
2. Generated codes follow `FLAT-XXXXX` and are globally unique.
3. `getByCode` rejects missing/deactivated codes and returns active code + referrer info.
4. `deactivate` can only be executed by an admin and does not delete or void existing referrals.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referralCodes.ts`.

### Out of Scope

- Sign-up attribution record creation in `referrals` table (T02)
- Admin override/void logic for existing attribution (T03)
- Public landing page storage and redirect behavior (T04)

---

## T02: Sign-up Attribution in `convex/referrals.ts` (`recordDemoRentalsReferral`)

### Objective

Implement first-touch DemoRentals attribution at sign-up so a referred tenant/owner gets linked to exactly one referrer, and the `SIGN_UP` milestone is triggered immediately in the same flow.

### Required Reading

- `notes/features/17-referral-system.md` - `recordDemoRentalsReferral` contract and first-touch rule (lines 210-215, 295-315)
- `notes/features/17-referral-system.md` - self-referral and deactivated-code restrictions (lines 317-320)
- `notes/10-convex-schema.md` - `referrals` table fields + indexes (lines 487-513)
- `notes/04-state-machines.md` - referral and milestone transitions (lines 429-483)
- `convex/referralCodes.ts` - active-code validation contract from T01

### Key Rules

1. Add `recordDemoRentalsReferral` mutation in `convex/referrals.ts`.
2. Mutation args must be exactly: `referred_user_id`, `referral_code` (string), `referral_type` (`TENANT_FINDING` or `OWNER_FINDING`).
3. Validate referral code existence and active status using the same canonical lookup behavior as `referralCodes.getByCode` (shared helper or equivalent non-duplicative logic).
4. Enforce no self-referral: code owner cannot equal `referred_user_id`.
5. Enforce one-referrer-per-user using `referrals.by_referred_user_id`; if any non-voided referral already exists, reject.
6. Enforce first-touch model: the first captured referral code wins; never overwrite attribution in this mutation.
7. Insert `referrals` row with `status: "PENDING"`, `referral_code_id`, `referrer_user_id`, `referred_user_id`, and provided `referral_type`.
8. Immediately create `referral_milestones` row for `SIGN_UP` with `status: "TRIGGERED"`, `triggered_at: Date.now()`, and amount resolved from `referral_config`.
9. After first milestone trigger, transition referral `status` from `PENDING` to `QUALIFIED` in the same mutation.
10. Keep money in paise and timestamps in Unix ms; no floats, no string dates.

### Deliverables

- [ ] `convex/referrals.ts` - `recordDemoRentalsReferral` mutation with code validation, first-touch enforcement, milestone trigger, and `PENDING -> QUALIFIED` transition

### Acceptance Criteria

1. Valid referral code on sign-up creates one `referrals` row and one triggered `SIGN_UP` milestone.
2. Self-referral attempts fail with a descriptive error.
3. A referred user cannot be attributed twice via normal sign-up flow.
4. Referral status is `QUALIFIED` immediately after `SIGN_UP` milestone creation.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referrals.ts` and any helper file touched for code lookup/config resolution.

### Out of Scope

- Admin override of existing attribution (T03)
- Listing/closure milestone triggers (`LISTING_PUBLISHED`, `DEAL_CLOSED`) handled in later epics
- Public referral URL capture and storage behavior (T04)

---

## T03: Admin Attribution Override + Deal Lookup in `convex/referrals.ts`

### Objective

Allow admins to correct or replace referral attribution atomically so old attribution is voided safely, new attribution is created consistently, and deal views can always show the active referral link.

### Required Reading

- `notes/features/17-referral-system.md` - Admin override flow and acceptance criteria (lines 103-113, 152-163)
- `notes/features/17-referral-system.md` - override atomicity and one-active-referral constraints (lines 329-335)
- `notes/04-state-machines.md` - referral + milestone state transitions and terminal states (lines 429-483)
- `notes/10-convex-schema.md` - `referrals` table (`voided_reason`, `voided_by_admin_id`, `closure_id`) and indexes (lines 487-513)

### Key Rules

1. Add `overrideAttribution` mutation in `convex/referrals.ts` as admin-only.
2. Args must support target lookup by either `closure_id` or `referred_user_id`, plus `new_referral_code` and `reason`.
3. Validate exactly one target identity path is provided (`closure_id` xor `referred_user_id`) and reject ambiguous payloads.
4. Resolve the existing referral for the target user/deal; fail with descriptive error when none exists.
5. Perform the full override as one atomic mutation transaction.
6. Void all old referral milestones that are `PENDING`, `TRIGGERED`, or `APPROVED` by setting `status: "VOIDED"` and writing reason metadata.
7. Void the old referral (`status: "VOIDED"`) and set `voided_reason` plus `voided_by_admin_id`.
8. Create a new referral derived from `new_referral_code` with updated `referrer_user_id`, keeping referred user/deal linkage.
9. Re-create milestones based on already-happened events; at minimum, if sign-up already occurred, create `SIGN_UP` milestone as `TRIGGERED`.
10. Add `getByDeal` query in `convex/referrals.ts` returning referral data for a given `closure_id` for admin deal detail screens.
11. Preserve first-touch semantics for normal sign-up flow; only this admin override path may change attribution.

### Deliverables

- [ ] `convex/referrals.ts` - `overrideAttribution` mutation implementing atomic void-and-recreate flow
- [ ] `convex/referrals.ts` - `getByDeal` query for closure-level attribution lookup

### Acceptance Criteria

1. Override call voids old eligible milestones and old referral, then creates a new referral in one mutation.
2. System never leaves both old and new referrals active for the same target.
3. `getByDeal({ closure_id })` returns the referral currently attributed to that deal.
4. Audit trigger coverage captures referral updates/inserts (via wrapped `mutation` imports).
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referrals.ts`.

### Out of Scope

- Admin referral analytics dashboards and reporting UI (later epic)
- Milestone payout approval/paid workflows (later epic)
- Guard referral override logic (outside DemoRentals code-path scope)

---

## T04: Public Referral Landing Route `src/app/(public)/ref/[code]/page.tsx`

### Objective

Build the public referral landing route that captures a referral code from URL, persists attribution client-side/server-readable for sign-up, and redirects users into the main browsing funnel without requiring authentication.

### Required Reading

- `notes/features/17-referral-system.md` - DemoRentals referral link entry flow and first-touch behavior (lines 72-76, 301-314)
- `tasks/phase-15-public-pages/P15-E02-public-pages-frontend.md` - `(public)` route-group/page composition patterns
- `src/app/(public)/` - existing public route conventions and redirect patterns

### Key Rules

1. Create `src/app/(public)/ref/[code]/page.tsx` as a public route requiring no auth.
2. On load, capture `code` from route params.
3. Store referral attribution in localStorage under key `referral_attribution` with an object containing `code`, `timestamp`, and `landing_page`.
4. Set cookie `ref_code={code}` with 30-day expiry so the sign-up flow can read referral context server-side.
5. Redirect the user to the homepage or listings route immediately after capture.
6. Enforce first-touch behavior: if `referral_attribution` already exists in localStorage, do not overwrite it.
7. Do not switch to last-touch logic even if a different code appears later.
8. Keep implementation resilient to client-only APIs (`localStorage`, `document.cookie`) by placing them in client-executed logic.
9. Add minimal defensive handling for malformed/empty codes (skip persistence and redirect).

### Deliverables

- [ ] `src/app/(public)/ref/[code]/page.tsx` - landing capture route with localStorage persistence, 30-day cookie, first-touch guard, and redirect

### Acceptance Criteria

1. Visiting `/ref/{code}` stores attribution payload and sets `ref_code` cookie when no prior first-touch value exists.
2. Existing `referral_attribution` value is preserved on subsequent referral-link visits.
3. Route works without authentication and redirects to the chosen public destination.
4. No runtime error occurs in server-rendered contexts.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(public)/ref/[code]/page.tsx`.

### Out of Scope

- Sign-up UI changes to display referral code inline
- Referral-code validation UI at landing time
- Tenant/owner referral dashboard screens

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
