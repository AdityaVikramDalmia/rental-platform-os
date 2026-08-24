# Phase 22: Referral System (P22)

## Overview

Phase 22 implements two separate referral programs: (1) Rental Platform OS guard-to-guard referrals tracked by phone number with a flat ₹500 bounty on the referred guard's first verified lead, and (2) DemoRentals tenant/owner referrals with unique shareable codes, stacking bonuses (₹200 sign-up + finding bonus split 30/70 across listing publish and deal closure — ₹1,000 tenant-finding, ₹2,000 owner-finding), configurable per-scope amounts, admin attribution overrides, and a user-visible referral earnings dashboard. This phase is the platform's primary viral growth mechanism.

**Key Decisions (Oracle-validated)**:

- Reduced from 23 to 19 tasks by merging i18n work into UI epics, combining approval/void mutation surfaces, and streamlining shared code paths.
- First-lead trigger hooks into `convex/verifications.ts` because lead status reaches `VERIFIED` through owner verification workflows (P05), not directly from `convex/leads.ts`.
- Guard referral UX lives inside the existing earnings page; no sixth bottom-nav item is introduced for guard routes.
- `P22-E03` explicitly depends on `P19-E01` because DemoRentals referral attribution requires `TENANT` and `OWNER` user types.
- Attribution follows first-touch semantics from spec: first captured referral code is retained and subsequent referral URL visits do not overwrite it.
- Predicted bonus uses historical payout averages with confidence scoring and falls back to referral config defaults when data points are insufficient.
- Cascading void logic includes `PENDING`, `TRIGGERED`, and `APPROVED` milestones; only `PAID` milestones are terminal and never auto-voided.
- Seed includes global `referral_config` defaults: guard ₹500, tenant-finding ₹1,000 + ₹200 signup, owner-finding ₹2,000 + ₹200 signup, default split 30/70.

## Dependencies

- P01-E01 (auth and user foundations required for referral identity mapping)
- P19-E01 (`TENANT`/`OWNER` user types required for DemoRentals referral attribution)

**Note**: The earlier phase skeleton listed broad phase-level dependencies (P03/P04/P06/P08/P20). Oracle review narrowed executable dependencies to P01-E01 + P19-E01 at phase entry, with the remaining dependencies enforced at epic level through milestone trigger integrations.

## Key Documentation

| Doc                                                                          | Sections to Read                                                                             |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [features/17-referral-system.md](../../notes/features/17-referral-system.md) | Full file — primary referral system spec, business rules, override semantics, edge cases     |
| [04-state-machines.md](../../notes/04-state-machines.md)                     | Referral status transitions + referral milestone status transitions                          |
| [10-convex-schema.md](../../notes/10-convex-schema.md)                       | `referral_codes`, `referrals`, `referral_milestones`, `referral_config` table definitions    |
| [13-constants-reference.md](../../notes/13-constants-reference.md)           | Referral enums, milestone types, config scope enums, permission constants, status-color maps |

## ⚠️ Schema Alerts

- Four referral tables are missing from `convex/schema.ts`: `referral_codes`, `referrals`, `referral_milestones`, and `referral_config`.
- Referral constants are missing from `lib/constants.ts`; P22-E01-T02 adds 5 enums plus referral permissions and status colors.
- No referral limiter key exists in `convex/rateLimiter.ts`; P22-E01-T02 adds `public:referral_signup`.
- Global `referral_config` defaults are not seeded; P22-E01-T02 seeds all baseline values for guard, tenant, and owner referral programs.

## ⚠️ Oracle Clarifications

- `FIRST_VERIFIED_LEAD` must be triggered from verification flows in `convex/verifications.ts`; do not attach this trigger to lead creation or generic lead updates.
- Guard referral details belong in the existing guard earnings experience (`/guard/earnings`); do not add `/guard/referrals` and do not expand bottom navigation.
- DemoRentals attribution must stay first-touch: once a valid referral code is captured for a user, later referral URL opens are informational only.
- Predicted bonus is computed from historical paid/approved referral outcomes and includes confidence labeling; config values are fallback, not primary data.
- Voiding a parent referral cascades to `PENDING`, `TRIGGERED`, and `APPROVED` milestones. `PAID` remains immutable and requires separate financial reconciliation.
- Referral config seeding must include all default programs on first bootstrap so milestone triggers work without manual admin setup.

## Epics

| ID      | Title                                                                                             | Tasks | Status  | Depends On       |
| ------- | ------------------------------------------------------------------------------------------------- | ----- | ------- | ---------------- |
| P22-E01 | [Referral Schema, Constants & Configuration Backend](P22-E01-referral-schema-constants-config.md) | 4     | pending | P01-E01          |
| P22-E02 | [Guard Referral Flow](P22-E02-guard-referral-flow.md)                                             | 3     | pending | P22-E01          |
| P22-E03 | [DemoRentals Referral Codes, Attribution & Landing](P22-E03-demorentals-referral-codes-attribution.md)    | 4     | pending | P22-E01, P19-E01 |
| P22-E04 | [Milestone Engine & Bonus Triggers](P22-E04-milestone-engine-bonus-triggers.md)                   | 4     | pending | P22-E02, P22-E03 |
| P22-E05 | [Admin Referral Management & User Dashboard](P22-E05-admin-referral-management-user-dashboard.md) | 4     | pending | P22-E04          |

**Total: 5 epics, 19 tasks**

## Dependency Graph

```
P01-E01 ──► P22-E01 ──┬──► P22-E02 ──┐
                       │              ├──► P22-E04 ──► P22-E05
P19-E01 ──► P22-E03 ──┘              │
            (also P22-E01)────────────┘
```

**Parallel note**: P22-E02 (Guard Referral Flow) and P22-E03 (DemoRentals Attribution) can run in parallel once P22-E01 is complete and P19-E01 is available for E03.

## Completion Criteria

- [ ] 4 referral tables exist in `convex/schema.ts` with all fields and indexes
- [ ] All 5 referral enums exist in `lib/constants.ts` with colors
- [ ] Global referral_config defaults seeded for all 3 types
- [ ] Guard referral recording works via admin onboarding flow
- [ ] First-verified-lead milestone triggers automatically
- [ ] DemoRentals referral code generation (`FLAT-XXXXX`) works
- [ ] Sign-up attribution captures and records referral codes
- [ ] All 4 milestone types trigger correctly (`SIGN_UP`, `FIRST_VERIFIED_LEAD`, `LISTING_PUBLISHED`, `DEAL_CLOSED`)
- [ ] Admin can approve, mark paid, and void milestones
- [ ] Admin referral management page at `/admin/referrals` renders
- [ ] Admin referral config page at `/admin/settings/referrals` renders
- [ ] User referral dashboard shows code, earnings, and referral list
- [ ] Predicted bonus query returns historical average with confidence
- [ ] `npx convex dev` starts without errors
- [ ] `npm run build` succeeds

## File Tree

```
tasks/phase-22-referral-system/
├── README.md
├── P22-E01-referral-schema-constants-config.md
├── P22-E02-guard-referral-flow.md
├── P22-E03-demorentals-referral-codes-attribution.md
├── P22-E04-milestone-engine-bonus-triggers.md
└── P22-E05-admin-referral-management-user-dashboard.md
```

## Scope Boundaries

### IN This Phase

- Guard-to-guard referral recording and first-verified-lead trigger integration
- DemoRentals referral code generation, first-touch sign-up attribution, and admin attribution override flow
- Referral milestone engine with four trigger types and idempotent trigger behavior
- Admin milestone operations (approve, paid, void) with cascading void behavior for non-terminal milestones
- Guard referral capture in admin onboarding workflows using referrer phone normalization and duplicate-safe checks
- Public referral landing flow for shared codes with safe validation before sign-up attribution persistence
- Config precedence resolution (`building > society > global`) for milestone amount calculation
- Admin attribution override mutations with reason capture and auditability
- Admin referral management page (`/admin/referrals`) with filtering and status management
- Admin referral config page (`/admin/settings/referrals`) for global/society/building scoped bonus settings
- User referral dashboard showing code, share link, earnings summary, and referral list
- Predicted bonus query using historical averages with config fallback
- Referral analytics queries for admin reporting and operational insight

### NOT In This Phase

- Referral leaderboards -> **V2**
- Tiered referral commissions -> **V2**
- Auto-generated referral marketing materials -> **V2**
- Push notifications for referral milestones -> **V2**
- Referral-based incentive cards/badges -> **V2**
- Any changes to payout accounting ledgers beyond referral milestone status tracking -> **V2/Finance Follow-up**

See [V2 Backlog](../../notes/09-v2-backlog.md) for deferred growth surfaces.
