# Feature: Referral System

> **Priority**: #22 in implementation order
> **Personas**: Guard, Prospective Tenant, Property Owner, Ops Agent, Super Admin
> **Dependencies**: Auth (P01), Guard Management (P03), Lead Pipeline (P04), Tenant Inquiry (P19), Owner Services (P20)
> **Route Groups**: `(guard)/`, `(tenant)/`, `(admin)/`, `(public)/`

## Purpose

The referral system is DemoRentals's primary viral growth mechanism. Users refer other users and earn bounties when those referrals lead to successful outcomes. The system has **two separate programs** operating on different platforms:

1. **Rental Platform OS Referrals (Guard-only)**: Guards refer other guards. The referred guard calls DemoRentals (inbound), ops records the referrer's phone number, and the referrer earns ₹500 when the new guard's first lead gets verified.

2. **DemoRentals Referrals (Tenant & Owner)**: Tenants and owners share a referral code. They earn stacking bonuses: ₹200 on sign-up + ₹1,000 for tenant-finding + ₹2,000 for owner-finding. Finding bonuses are two-tiered (30% on listing publish, 70% on deal closure).

**Key principle**: Guards are invisible to tenants/owners. The Rental Platform OS and DemoRentals referral programs never cross. Tenants and owners never know guards exist.

---

## Two Programs: Rental Platform OS vs DemoRentals

| Aspect                | Rental Platform OS (Guards)                               | DemoRentals (Tenants & Owners)                               |
| --------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| **Who refers**        | Existing guards                                   | Any tenant or owner                                      |
| **Who gets referred** | New guards                                        | New tenants or owners                                    |
| **Tracking method**   | Phone number (ops records during onboarding call) | Referral code in sign-up URL (auto-tracked)              |
| **Referral code**     | None — tracked via phone number                   | Per-user unique code + shareable URL                     |
| **Bonuses**           | ₹500 flat                                         | ₹200 sign-up + ₹1,000/₹2,000 finding (two-tiered)        |
| **Payment trigger**   | Referred guard's first lead verified              | Milestone-based (sign-up, listing publish, deal closure) |
| **Stacking**          | N/A (single bonus)                                | Yes — sign-up bonus stacks with finding bonus            |
| **Visibility**        | Guard portal                                      | Tenant/owner portal                                      |
| **Admin override**    | Simple yes/no                                     | Full override per deal (amount, attribution, split)      |

---

## Entities Involved

- `referral_codes` table (DemoRentals referral codes per user)
- `referrals` table (tracks each referral relationship)
- `referral_milestones` table (tracks bonus milestone payouts)
- `referral_config` table (configurable bonus amounts per scope)
- `users` table (read — referrer and referred users)
- `leads` table (read — for guard referral trigger: first verified lead)
- `listings` table (read — for DemoRentals referral trigger: listing published)
- `closures` table (read — for DemoRentals referral trigger: deal closed)

## Permissions

| Permission                 | Used By                                                                                                                                                            | Description                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `referrals.manage`         | `recordGuardReferral`, `overrideAttribution`, `voidReferral` mutations; `deactivate` mutation in `referralCodes`; `voidMilestone` mutation in `referralMilestones` | Gates admin/ops control-plane actions that create/override/void referral attribution and lifecycle state. |
| `referrals.view`           | `getByDeal`, `getEstimatedBonus`, `listAll`, `getById` queries in `referrals`; `list` query in `referralConfig`                                                    | Gates backoffice visibility into referral records, bonus estimates, and config views.                     |
| `referrals.configure`      | `upsert` mutation in `referralConfig`                                                                                                                              | Gates referral amount/split configuration changes.                                                        |
| `referrals.approve_payout` | `approve`, `markPaid` mutations in `referralMilestones`                                                                                                            | Gates milestone payout approvals and paid-state transitions.                                              |
| `analytics.view`           | `getAnalytics` query in `referrals`                                                                                                                                | Gates referral analytics dashboards/aggregates.                                                           |
| `N/A (requireTenant())`    | `trackTenantReferralShare` mutation in `referrals`                                                                                                                 | Tenant-only auth helper gate for tenant share-event tracking without RBAC permission strings.             |

---

## Flows

### Flow 1: Guard-to-Guard Referral (Rental Platform OS)

```
1. Existing Guard tells new person about DemoRentals guard program (word of mouth)
2. New person calls DemoRentals ops team
3. Ops asks: "Did someone refer you?"
4. New person gives referrer's phone number
5. Ops creates guard account (P03 flow) with referrer phone recorded
   → referrals record created (type: GUARD, status: PENDING)
6. New guard submits leads over time
7. When first lead reaches VERIFIED status
   → System triggers referral milestone (FIRST_VERIFIED_LEAD)
   → referral_milestones record created (status: TRIGGERED)
8. Admin approves referral bonus
   → Admin approves and marks milestone paid via referral milestone system (NOT the guard payouts table)
   → referral_milestones status → PAID
```

### Flow 2: DemoRentals Referral — Tenant Finding (₹1,000)

```
1. Existing tenant/owner shares referral link (e.g., demorentals.com/ref/FLAT-A7X3)
2. Landing page validates code owner and persists attribution in localStorage + cookie
   → Last click wins (latest /ref/{code} overwrites any previous pending attribution)
3. After tenant sign-up, `ReferralAttributionCapture` calls capture mutation
   → 48h account-age gate enforced (old accounts are ignored)
4. `recordDemoRentalsReferral` / `captureReferralFromCode` creates referral + milestones
   → `SIGN_UP` milestone immediately `TRIGGERED` (₹200)
   → referral status promoted to `QUALIFIED`
5. Tenant milestone trigger paths:
   → `tenantInquiries.submit` backfills `LISTING_PUBLISHED` when tenant has referral + listing is already published
   → `closures.confirm` triggers `DEAL_CLOSED` using closure `visit_id` chain to resolve the tenant user
6. Admin reviews and approves each milestone payout

Total earned by referrer: ₹200 (sign-up) + ₹300 (publish) + ₹700 (closure) = ₹1,200
```

### Flow 3: DemoRentals Referral — Owner Finding (₹2,000)

```
1. Existing tenant/owner shares referral link
2. New owner clicks link and signs up
   → referral captured (48h account-age check enforced)
   → Sign-up milestone: ₹200 to referrer
3. Owner's property gets listed (listing `PUBLISHED`)
   → `listings.publish` triggers `LISTING_PUBLISHED` for OWNER referrals only
   → Publish milestone: ₹600 to referrer (30% of ₹2,000 default)
4. Deal closes on that property (closure `CONFIRMED`)
   → `closures.confirm` triggers `DEAL_CLOSED`
   → Closure milestone: ₹1,400 to referrer (70% of ₹2,000 default)

Total earned by referrer: ₹200 + ₹600 + ₹1,400 = ₹2,200
```

### Flow 4: Admin Attribution Override

```
1. Admin opens Override Attribution from referral detail panel
2. Override target modes:
   → By closure: `closure_id` + required `target_user_type` (`TENANT` or `OWNER`)
   → By user: `referred_user_id`
3. If no referral exists for target, system creates one (create-if-missing override)
4. If an active referral already exists for the same referred user, system re-attributes in place
   → prevents duplicate active referrals
5. For closure overrides, UI includes explicit tenant/owner selector (`target_user_type`)
6. Audit metadata captured on referral (`attributed_by_admin_id`, `attributed_at`, `attribution_source`)
```

### Frontend Capture Behavior (Rounds 9-13)

- `src/app/(public)/ref/[code]/page.tsx` always overwrites stored attribution payload and cookie for valid links (last-click-wins capture).
- `src/components/shared/ReferralAttributionCapture.tsx` dedups concurrent requests with `inFlightCodeRef`.
- Dedup persistence (`attemptedCodeRef` + clearing local storage/cookie) happens only on success or permanent failure reasons.
- Transient failures (e.g., rate limiting, thrown errors) keep attribution data so automatic retry remains possible.

---

## User Stories

### Guard: Refer Another Guard

**As a guard**, I want to tell other guards about DemoRentals so I can earn a ₹500 bonus when they join.

**Acceptance Criteria**:

- Guard sees "Refer a Guard" section in their profile/earnings page
- Shows: their phone number (the referral identifier), total referral earnings, referral count
- No formal referral code — guard simply tells the new person to mention their phone number when calling DemoRentals
- Guard sees status of their referrals: PENDING (new guard created but no verified lead yet), PAID

### Tenant/Owner: Share Referral Code

**As a tenant or owner**, I want to share my referral code so I can earn bonuses when my friends sign up and use DemoRentals.

**Acceptance Criteria**:

- "My Referrals" section in tenant/owner portal
- Shows: unique referral code (e.g., `FLAT-A7X3`), shareable link, share buttons (WhatsApp, copy link)
- Referral dashboard: people referred (count), earnings breakdown (pending/paid per milestone), total earned
- Each referral shows: referred person identifier (anonymized as `User #1`, `User #2`), status, milestones earned

### Admin: Manage Referral Configuration

**As an admin**, I want to configure referral bonus amounts and manage referral attribution.

**Acceptance Criteria**:

- Referral configuration page at `(admin)/settings/referrals/`
- Global defaults: sign-up bonus (₹200), tenant-finding total (₹1,000), owner-finding total (₹2,000), guard referral (₹500)
- Publish/closure split: default 30/70, configurable
- Per-scope overrides: can set different amounts per society or per building
- Override precedence: Building > Society > Global

### Admin: Override Referral Attribution on Deal

**As an admin**, I want to change which referral code is credited for a deal, in case the auto-tracked code is wrong.

**Acceptance Criteria**:

- On closure detail page: "Referral Attribution" section
- Shows auto-tracked referral code (if any) with "Override" button
- Override: dropdown of all active referral codes + manual code entry
- On override: old referral milestones voided, new ones created
- Audit trail records the override (who, when, old code → new code)

### Admin: Referral Analytics

**As an admin**, I want to see referral program performance across both programs.

**Acceptance Criteria**:

- Referral analytics section in admin dashboard
- Metrics: total referrals (by type), conversion rate (referral → deal), total bonuses paid, top referrers
- Separate views for Rental Platform OS (guard) and DemoRentals (tenant/owner) programs

---

## "AI Predictor" Widget

When an admin finalizes a listing, a widget shows the estimated referral bonus for that property:

- **Data source**: Historical referral payouts for the same building (or society if no building data)
- **Display**: "Estimated referral bonus: ₹X" with a confidence indicator
- **Logic**: Average of past referral payouts for that building. If no history, use society average. If no society data, show global average.
- **Presentation**: Styled as an "AI insight" but the logic is purely algorithmic (simple average). No actual ML model.
- **Purpose**: Motivate referrers by showing potential earnings on the listing page

---

## Convex Functions

### Queries

```
referralCodes.getByUser() → ReferralCode (authenticated user's own code)
referralCodes.getByCode({ code }) → ReferralCode + User (for sign-up page to validate code)

referrals.listByReferrer() → Referral[] (authenticated user's referrals with milestones)
referrals.listAll({ referral_type?, status?, cursor? }) → { referrals: Referral[], nextCursor? } (admin)
referrals.getById({ id }) → Referral + milestones + referrer + referred user details (admin)
referrals.getByDeal({ closure_id }) → Referral (for admin deal view — which referral is attributed)

referralConfig.getForScope({ scope_type, scope_id? }) → ReferralConfig (resolved config with override precedence)
referralConfig.list() → ReferralConfig[] (admin — all configs including overrides)

referrals.getEstimatedBonus({ building_id, society_id }) → { estimated_amount, confidence, data_points } (AI predictor)
referrals.getAnalytics({ date_from?, date_to? }) → ReferralAnalytics (admin dashboard)
```

### Mutations

```
referralCodes.generate() → ReferralCode (auto-generated on first DemoRentals user sign-up)

referrals.recordGuardReferral({ referred_guard_user_id, referrer_phone }) → Referral (ops records during guard creation)
referrals.recordDemoRentalsReferral({ referral_code, referral_type }) → Referral (authenticated user capture path, 48h account-age check)
referrals.captureReferralFromCode({ referral_code }) → { captured, reason, referral_id? } (auto-capture with classified failure reasons)
referrals.overrideAttribution({ closure_id?, referred_user_id?, target_user_type?, new_referral_code, reason }) → Referral (admin override, supports create-if-missing)
referrals.voidReferral({ id, reason }) → Referral (admin voids a referral)

referralMilestones.trigger({ referral_id, milestone_type, source_event }) → ReferralMilestone (system trigger with idempotency key)
referralMilestones.approve({ id }) → ReferralMilestone (admin approves payout)
referralMilestones.markPaid({ id }) → ReferralMilestone (admin marks paid)
referralMilestones.void({ id, reason }) → ReferralMilestone (admin or system voids)

referralConfig.upsert({ referral_type, scope_type, scope_id?, amounts, split_pct }) → ReferralConfig (admin)
```

---

## Schema (Proposed)

### `referral_codes` Table

| Field     | Type        | Required | Description                     |
| --------- | ----------- | -------- | ------------------------------- |
| user_id   | Id<"users"> | yes      | Code owner                      |
| code      | string      | yes      | Unique code (e.g., `FLAT-A7X3`) |
| is_active | boolean     | yes      | Can be deactivated by admin     |

**Indexes**: `by_user_id`, `by_code`

### `referrals` Table

| Field                  | Type                 | Required | Description                                                      |
| ---------------------- | -------------------- | -------- | ---------------------------------------------------------------- |
| referrer_user_id       | Id<"users">          | yes      | Who referred                                                     |
| referred_user_id       | Id<"users">          | yes      | Who was referred                                                 |
| referral_code_id       | Id<"referral_codes"> | no       | DemoRentals referral code used (null for guard referrals)            |
| referral_type          | string               | yes      | `TENANT_FINDING`, `OWNER_FINDING`, `GUARD`                       |
| status                 | string               | yes      | `PENDING`, `QUALIFIED`, `PARTIALLY_PAID`, `FULLY_PAID`, `VOIDED` |
| lead_id                | Id<"leads">          | no       | Deal context lead (guard first-verified lead or DemoRentals linkage) |
| listing_id             | Id<"listings">       | no       | Associated listing                                               |
| closure_id             | Id<"closures">       | no       | Associated closure                                               |
| building_id            | Id<"buildings">      | no       | Deal context for scoped config resolution                        |
| society_id             | Id<"societies">      | no       | Deal context for scoped config resolution                        |
| attributed_by_admin_id | Id<"users">          | no       | Admin who applied manual attribution override                    |
| attributed_at          | number               | no       | Unix ms override timestamp                                       |
| attribution_source     | string               | no       | Attribution source metadata (e.g., `admin_override`)             |
| voided_reason          | string               | no       | Why voided (if applicable)                                       |
| voided_by_admin_id     | Id<"users">          | no       | Who voided                                                       |

**Indexes**: `by_referrer_user_id`, `by_referred_user_id`, `by_referral_type`, `by_status`, `by_closure_id`

### `referral_milestones` Table

| Field                | Type            | Required | Description                                                          |
| -------------------- | --------------- | -------- | -------------------------------------------------------------------- |
| referral_id          | Id<"referrals"> | yes      | Parent referral                                                      |
| milestone_type       | string          | yes      | `SIGN_UP`, `LISTING_PUBLISHED`, `DEAL_CLOSED`, `FIRST_VERIFIED_LEAD` |
| amount               | number          | yes      | Paise (integer × 100)                                                |
| status               | string          | yes      | `PENDING`, `TRIGGERED`, `APPROVED`, `PAID`, `VOIDED`                 |
| source_event         | string          | no       | Trigger dedup key (`{event}:{entityId}`)                             |
| triggered_at         | number          | no       | Unix ms — when milestone event occurred                              |
| approved_by_admin_id | Id<"users">     | no       | Admin who approved payout                                            |
| paid_at              | number          | no       | Unix ms — when money was disbursed                                   |
| payout_method        | string          | no       | `CASH`, `UPI`, `BANK_TRANSFER` (reuses payout methods)               |
| voided_reason        | string          | no       | Why voided                                                           |

**Indexes**: `by_referral_id`, `by_referral_and_source_event`, `by_status`, `by_milestone_type`

### `referral_config` Table

| Field               | Type        | Required | Description                                                                                                                                                                                                                                           |
| ------------------- | ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| referral_type       | string      | yes      | `TENANT_FINDING`, `OWNER_FINDING`, `GUARD` (sign-up bonus amount is a flat bonus configured separately and applies to ALL DemoRentals referral types)                                                                                                     |
| scope_type          | string      | yes      | `GLOBAL`, `SOCIETY`, `BUILDING`                                                                                                                                                                                                                       |
| scope_id            | string      | no       | `Id<"societies">` or `Id<"buildings">` depending on scope_type. Stored as string in Convex. Validation: when scope_type is SOCIETY, must be a valid society ID; when BUILDING, must be a valid building ID. Mutations validate referential integrity. |
| sign_up_bonus       | number      | yes      | Paise — sign-up bonus amount                                                                                                                                                                                                                          |
| finding_bonus_total | number      | yes      | Paise — total finding bonus                                                                                                                                                                                                                           |
| publish_split_pct   | number      | yes      | % paid on listing publish (default: 30)                                                                                                                                                                                                               |
| closure_split_pct   | number      | yes      | % paid on deal closure (default: 70)                                                                                                                                                                                                                  |
| is_active           | boolean     | yes      | Whether this config is active                                                                                                                                                                                                                         |
| updated_by_admin_id | Id<"users"> | yes      | Last admin to update                                                                                                                                                                                                                                  |

**Indexes**: `by_referral_type`, `by_scope`

**Override precedence**: Building config > Society config > Global config. System resolves the most specific active config.

---

## Business Rules

1. **Bonus stacking**: Sign-up bonus (₹200) is separate from finding bonus. A referrer earns BOTH if the referred person signs up AND closes a deal. Example: ₹200 (sign-up) + ₹1,000 (tenant-finding) = ₹1,200 total. The referral is created as `TENANT_FINDING` or `OWNER_FINDING` based on sign-up context (which page the referred user came from). The `SIGN_UP` milestone triggers immediately on account creation regardless of referral type — it is a milestone, not a referral type.

2. **Two-tiered finding bonus**: Default 30/70 split. 30% paid on listing publish, 70% on deal closure. Amounts are stored in paise.

3. **Guard referral isolation**: Guard referrals are tracked by phone number only. No referral codes. Tenants and owners never see the guard referral program. Separate UI, separate admin views.

4. **Auto-tracking + manual override**: DemoRentals referral codes are captured from landing-page local storage/cookie via `ReferralAttributionCapture`. Admin can override attribution at any point during the deal lifecycle. Override writes attribution audit metadata on the referral.

5. **Referral code generation**: One code per user. Auto-generated on first DemoRentals sign-up (tenant or owner). Format: `FLAT-XXXXX` (5 alphanumeric characters, uppercase). Globally unique.

6. **Config precedence**: Building-level config > Society-level config > Global config. If no building config exists, fall back to society, then global. Config mutations validate that scope_id references an existing, non-deleted society or building. Invalid scope_ids are rejected.

7. **Milestone approval**: All milestone payouts require admin approval before payment. System triggers milestones automatically, but admin confirms.

8. **Separate from guard payouts**: Referral milestone payouts use the `referral_milestones` table with its own TRIGGERED → APPROVED → PAID flow. They do NOT go through the guard `payouts` table (which requires lead_id + closure_id). This keeps the two payout systems independent.

9. **Voiding**: Admin can void any referral or milestone. Voided referrals cannot be reinstated. Admin must provide reason. Audit trail recorded.

10. **One active referral per referred user**: Override logic re-attributes existing active referrals instead of creating duplicates.

11. **Guard referral amount**: Fixed ₹500 per successful referral. "Successful" = referred guard's first lead reaches VERIFIED status. Amount configurable via system_config.

12. **No self-referral**: Users cannot use their own referral code. System validates on sign-up.

13. **Deactivated codes**: Admin can deactivate a referral code. Deactivated codes cannot be used for new sign-ups but existing referrals remain valid.

14. **Scoped config + frozen amounts**: Referral creation computes milestone amounts from resolved config (building > society > global) and stores them on milestones. Trigger paths use stored amounts.

15. **Pending-only amount refresh**: When deal context becomes available later (linkage patch), pending milestones can be re-priced with scoped config. Triggered/approved/paid milestones are never re-priced.

16. **Linkage immutability**: `listing_id` and `closure_id` are auto-updated only while matching milestones are `PENDING`. After trigger, linkage is frozen.

17. **48h capture window**: DemoRentals referral attribution is accepted only for accounts created in the last 48 hours.

---

## Concurrency & Idempotency Rules

1. **Status preconditions**: Every status-changing mutation MUST validate current status before transitioning. If status has changed since the admin loaded the page (stale data), the mutation fails with a descriptive error. Convex's document-level OCC (optimistic concurrency control) handles this automatically — concurrent writes to the same document serialize naturally.

2. **Milestone trigger idempotency**: Each milestone trigger carries a `source_event` key (e.g., `lead_verified:{lead_id}`, `listing_published:{listing_id}`, `closure_confirmed:{closure_id}`). If a milestone with that source_event already exists for this referral, the trigger is silently ignored. Prevents double-triggering from event replays or cron retries.

3. **Override handling**: `overrideAttribution` supports both replacement and create-if-missing. When an active referral already exists for the target user, it is re-attributed in place to avoid duplicate active referrals.

4. **One active referral per referred user**: Enforced at mutation level (no DB unique index for non-voided subset).

5. **Capture retry semantics**: Client-side dedup persistence is saved only after success or permanent failure reasons. Transient failures keep pending attribution data so retries can succeed.

---

## Edge Cases

- **Referred user already exists**: If someone clicks a referral link but already has an account, ignore the referral code. No double-attribution.
- **Multiple referral links**: Last click wins before capture persistence (`/ref/{code}` overwrites local storage/cookie each time).
- **Deal has no referral**: Most deals won't have referrals. Referral attribution section shows "No referral" with option to manually add one.
- **Referrer account deleted/banned**: Referral milestones still pay out. The referral relationship is independent of account status.
- **Listing published then unpublished**: If listing goes back to DRAFT after publish milestone triggered, the publish milestone is NOT voided (milestone was legitimately triggered).
- **Closure cancelled after publish paid**: Only the closure milestone is voided. Publish milestone stays paid. Admin can manually void if needed.
- **Guard referral with wrong phone**: If ops records wrong referrer phone, admin can void the bad referral and create a corrected guard referral record.
- **Config change mid-deal**: Triggered/approved/paid milestones keep frozen stored amounts. Pending milestones may be refreshed with scoped config when linkage context is patched.

---

## Schema Prerequisites

Before implementing P22, the following schema/code changes are required in earlier phases:

1. **`convex/schema.ts`**: Add `user_type` validators for `TENANT` and `OWNER` if not already present (P01/P19/P20 dependency)
2. **`convex/schema.ts`**: Add all new table definitions (`referral_codes`, `referrals`, `referral_milestones`, `referral_config`)
3. **`lib/constants.ts`**: Add `REFERRAL_TYPE`, `REFERRAL_STATUS`, `REFERRAL_MILESTONE_TYPE`, `REFERRAL_MILESTONE_STATUS`, `REFERRAL_CONFIG_SCOPE_TYPE` enums
4. **`convex/functions.ts`**: Add new tables to `AUDITED_TABLES` for automatic audit triggers: `referral_codes`, `referrals`, `referral_milestones`, `referral_config`
5. **`convex/schema.ts` audit validators**: Extend `auditActionValidator` with: `REFERRAL_CODES_INSERT`, `REFERRALS_INSERT`, `REFERRALS_UPDATE`, `REFERRAL_MILESTONES_INSERT`, `REFERRAL_MILESTONES_UPDATE`, `REFERRAL_CONFIG_INSERT`, `REFERRAL_CONFIG_UPDATE`
6. **`convex/seed.ts`**: Add default `referral_config` records (GLOBAL scope) with default amounts
