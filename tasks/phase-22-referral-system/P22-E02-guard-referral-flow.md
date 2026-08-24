---
id: P22-E02
title: Guard Referral Flow
phase: 22
status: pending
depends_on: ["P22-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P22-E02: Guard Referral Flow

## Overview

Implement the guard-only referral lifecycle end-to-end: record guard-to-guard referrals during onboarding, auto-trigger the FIRST_VERIFIED_LEAD milestone when the referred guard gets their first verified lead, and render referral status/bonus information inside the existing guard earnings page.

## Prerequisites

- **Read first**: P22-E01 Completion Summary (once E01 is completed) — referral schema, enums, permissions, and config resolution primitives must already exist.
- `referrals`, `referral_milestones`, and `referral_config` tables are available and match `notes/10-convex-schema.md`.
- Referral enums and permission keys are available in `lib/constants.ts` (`GUARD`, `PENDING`, `QUALIFIED`, `FIRST_VERIFIED_LEAD`, milestone statuses).
- Owner verification status transition flow is active in `convex/verifications.ts` (this is the lead `VERIFIED` hook point used in T02).

## Task Queue

- [ ] P22-E02-T01: Guard Referral Recording
- [ ] P22-E02-T02: First-Lead Milestone Trigger
- [ ] P22-E02-T03: Guard Referral Section in Earnings Page

---

## T01: Guard Referral Recording

### Objective

Create the admin-only mutation that records a guard-to-guard referral during onboarding, and add core referral read/admin-void functions needed by later guard/admin referral screens.

### Required Reading

- `notes/features/17-referral-system.md` — Flow 1 (Guard-to-Guard Referral), business rules 3/8/9/11/13, and concurrency notes
- `notes/04-state-machines.md` — Referral Status and Referral Milestone Status transition tables (lines 429-483)
- `notes/10-convex-schema.md` — `referrals`, `referral_milestones`, `referral_config` definitions (lines 487-561)
- `notes/13-constants-reference.md` — referral permissions and enum values (`GUARD`, `FIRST_VERIFIED_LEAD`, milestone statuses)
- `convex/guards.ts` — guard creation patterns and phone normalization usage context

### Key Rules

1. Create `convex/referrals.ts` with a `recordGuardReferral` mutation that is admin-only (`requirePermission` with referral management capability).
2. `recordGuardReferral` args: `referred_guard_user_id` and `referrer_phone` (10-digit input string from onboarding call flow).
3. Normalize `referrer_phone` with `normalizePhone()` from `lib/validators.ts` before any lookup.
4. Validate `referrer_phone` resolves to an existing guard profile/user; reject missing/invalid/non-guard refs with descriptive errors.
5. Insert `referrals` record with: `referral_type = GUARD`, `status = PENDING`, resolved `referrer_user_id`, provided `referred_guard_user_id`, and `referral_code_id` omitted/null.
6. Resolve guard referral amount from `referralConfig.getForScope` using guard/global fallback (`type = GUARD`, `scope = GLOBAL`) and create the initial milestone.
7. Insert `referral_milestones` record with: `milestone_type = FIRST_VERIFIED_LEAD`, `status = PENDING`, and `amount = referral_guard_bonus` (default ₹500 = `50000` paise).
8. Add `listByReferrer` query in `convex/referrals.ts` for authenticated current user referral list (`by_referrer_user_id`), enriched with milestone aggregates.
9. Add `listAll` query in `convex/referrals.ts` — admin-only, paginated, filterable by `referral_type` and `status`. Used by E05 admin referral management page.
10. Add `getById` query in `convex/referrals.ts` for admin detail view enriched with referrer/referred user details and full milestone list.
11. Add admin `void` mutation in `convex/referrals.ts` that marks referral `VOIDED` and cascades milestone voiding to all non-terminal milestones.
12. Non-terminal cascade set is mandatory: `PENDING`, `TRIGGERED`, and `APPROVED`; only `PAID` and `VOIDED` are terminal.
13. Follow mutation import convention (`mutation` from `./functions`) so audit triggers fire automatically.

### Deliverables

- [ ] `convex/referrals.ts` — `recordGuardReferral` mutation + `listByReferrer` query + `listAll` query (admin, paginated, filterable by referral_type + status) + `getById` query + admin `void` mutation with full non-terminal milestone cascade

### Acceptance Criteria

1. Admin can record a guard referral using referred guard id + referrer phone.
2. Referrer phone is normalized and must resolve to a valid guard.
3. Guard referral record is created with `GUARD` type, `PENDING` status, and no referral code id.
4. Initial `FIRST_VERIFIED_LEAD` milestone is created as `PENDING` with amount from scope-resolved guard config (default `50000` paise).
5. `void` cascades to milestone statuses `PENDING`, `TRIGGERED`, and `APPROVED` (not only `PENDING`/`TRIGGERED`).
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referrals.ts`.

### Out of Scope

- DemoRentals code-based referral recording (`TENANT_FINDING` / `OWNER_FINDING`)
- Milestone approval/payment mutations (`APPROVE` / `PAID` lifecycle)
- Guard earnings page UI integration (T03)

---

## T02: First-Lead Milestone Trigger

### Objective

Automatically trigger the guard referral bonus milestone when a referred guard's first lead transitions to `VERIFIED`, and keep the trigger idempotent for retries/replays.

### Required Reading

- `notes/features/17-referral-system.md` — Flow 1 trigger definition and idempotency rule
- `notes/04-state-machines.md` — referral and milestone transition legality (lines 429-483)
- `convex/verifications.ts` — owner verification flow where lead status becomes `VERIFIED`
- `convex/leads.ts` — transition helper usage pattern and lead status handling context
- `convex/referrals.ts` (from T01) — referral + milestone querying and updates

### Key Rules

1. Add `checkFirstLeadBonus` as an `internalMutation` in `convex/referrals.ts` with args `{ guard_user_id }`.
2. Resolve referral by `by_referred_user_id`; if no guard referral exists, exit safely without side effects.
3. Confirm first verified lead condition by counting referred guard leads where status is `VERIFIED`; trigger only when count is exactly `1`.
4. Ensure idempotency: if milestone is already beyond `PENDING` (`TRIGGERED`, `APPROVED`, `PAID`, `VOIDED`), do nothing.
5. On valid first trigger, update milestone `PENDING -> TRIGGERED` and set `triggered_at = Date.now()`.
6. Update parent referral status `PENDING -> QUALIFIED` when first milestone triggers.
7. Keep transition validation explicit and aligned with state-machine rules; reject illegal transitions.
8. Wire hook in owner verification module at the exact `VERIFIED` transition path: `convex/verifications.ts` (this is the verifications.ts hook point from the spec; do not place in `convex/leads.ts`).
9. Hook call runs after lead status patch to `VERIFIED`, in the same successful verification branch.
10. Preserve existing incentive side effects in verification flow; referral trigger is additive, not a replacement.

### Deliverables

- [ ] `convex/referrals.ts` — `checkFirstLeadBonus` internal mutation with first-verified-lead detection + idempotent state updates
- [ ] `convex/verifications.ts` — hook invocation after lead transitions to `LEAD_STATUS.VERIFIED`

### Acceptance Criteria

1. First verified lead for a referred guard triggers milestone `PENDING -> TRIGGERED` exactly once.
2. Second+ verified leads do not retrigger the first-lead milestone.
3. Parent referral status moves from `PENDING` to `QUALIFIED` when milestone is first triggered.
4. Hook exists in `convex/verifications.ts` verified branch, not in `convex/leads.ts`.
5. Existing verification behavior (including incentive trigger) remains intact.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/referrals.ts` and `convex/verifications.ts`.

### Out of Scope

- Triggering DemoRentals milestones (`SIGN_UP`, `LISTING_PUBLISHED`, `DEAL_CLOSED`)
- Referral attribution override logic
- Guard-facing referral UI rendering

---

## T03: Guard Referral Section in Earnings Page

### Objective

Add a referral section inside the existing guard earnings page to show referral relationship, bonus status, and referred-guards list without introducing a new route or nav item.

### Required Reading

- `notes/features/17-referral-system.md` — guard user story and acceptance criteria for guard referral visibility
- `notes/05-guard-portal-ux.md` — guard portal layout and mobile-first component conventions
- `src/app/(guard)/guard/earnings/page.tsx` — existing earnings page composition and section structure
- `messages/en.json` — current `guard.*` namespace structure and translation key conventions
- `AGENTS.md` — i18n architecture rules (guard-only translation scope; key parity across en/hi/hinglish)

### Key Rules

1. Create `src/components/guard/guard-referral-section.tsx` for referral-specific guard UI.
2. Section reads whether current guard was referred (`by_referred_user_id`) and displays referral bonus amount + milestone status.
3. Status display must support `PENDING`, `TRIGGERED`, `APPROVED`, and `PAID` states.
4. Section also lists guards referred by current guard (`by_referrer_user_id`) with concise status context.
5. Add explicit empty state when no referral relationship exists on either side.
6. Integrate section into `src/app/(guard)/guard/earnings/page.tsx` below existing earnings/payout sections.
7. Add `guard.referrals` namespace to all locale files: `messages/en.json`, `messages/hi.json`, and `messages/hinglish.json`.
8. Keep translation key parity across all three files; no English-only keys in guard portal UI.
9. Do NOT create `/guard/referrals` route.
10. Do NOT add a 6th bottom nav item; guard nav remains exactly 5 items (`home`, `addLead`, `myLeads`, `myVisits`, `earnings`).
11. Use existing guard mobile-first card styling patterns and shadcn components.

### Deliverables

- [ ] `src/components/guard/guard-referral-section.tsx` — guard referral summary + milestone status + referred-guards list + empty state
- [ ] `src/app/(guard)/guard/earnings/page.tsx` — referral section integration below payout content
- [ ] `messages/en.json` — new `guard.referrals` keys
- [ ] `messages/hi.json` — matching `guard.referrals` keys
- [ ] `messages/hinglish.json` — matching `guard.referrals` keys

### Acceptance Criteria

1. Guard earnings page shows referral section inline (same route) with no navigation changes.
2. Current guard sees referred-by state (if present), referral amount, and milestone status.
3. Current guard sees list of guards they referred (if any) with readable state labels.
4. Empty state renders when guard has no referral relationship.
5. `guard.referrals` keys exist in all 3 locale files with matching key structure.
6. `npm run build` and `npx tsc --noEmit` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/guard/guard-referral-section.tsx`, `src/app/(guard)/guard/earnings/page.tsx`, `messages/en.json`, `messages/hi.json`, and `messages/hinglish.json`.

### Out of Scope

- New guard referral standalone route or dedicated nav destination
- Tenant/owner referral dashboard UI
- Admin referral analytics/configuration interfaces

---

## Out of Scope (All Tasks)

- DemoRentals referral code generation and sign-up URL capture (P22-E03)
- Milestone approval/payment admin operations and payout workflows (P22-E04)
- Admin referral management table, override dialogs, and analytics dashboards (P22-E05)
- Referral predictor widget on listing finalization (later P22 epic)

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
