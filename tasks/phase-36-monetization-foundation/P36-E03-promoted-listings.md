---
id: P36-E03
title: Promoted Listings
phase: 36
status: pending
depends_on: ["P36-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P36-E03: Promoted Listings

## Epic Guardrails

- Shared file boundaries follow `tasks/phase-36-monetization-foundation/README.md` -> "File Ownership (Epic Boundaries)".

## Task Queue

- [ ] P36-E03-T01: Add promoted listing schema and slot-cap rules
- [ ] P36-E03-T02: Implement promotion activation and duration lifecycle
- [ ] P36-E03-T03: Integrate promoted ranking in listing browse queries

---

## T01: Add Promoted Listing Schema and Slot-Cap Rules

### Objective

Define campaign schema and hard placement constraints so promoted inventory is deterministic and bounded.

### Required Reading

- `notes/features/28-monetization-foundation.md`
- `notes/features/11-tenant-browse.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`

### Key Rules

1. Campaign durations are restricted to 7/14/30 days.
2. Max promoted cards per page is 3.
3. Campaign only valid for `PUBLISHED` listing.
4. Table must support owner and status/expiry lookups.
5. All campaign writes are audited.

### Deliverables

- [ ] `convex/schema.ts` — add `promoted_listings`
- [ ] `lib/constants.ts` — promoted status enums + plan durations
- [ ] `convex/functions.ts` — audit registration
- [ ] `convex/seed.ts` — seed promotion plan price config keys

### Acceptance Criteria

1. Schema enforces duration enum and status enum.
2. Index supports status + ends_at expiry scans.
3. Listing-owner linkage stored and queryable.
4. Config keys exist for 7/14/30-day plan prices and page cap.
5. Types compile without suppression.

### Verification

```bash
npx tsc --noEmit
npm run build
```

---

## T02: Implement Promotion Activation and Duration Lifecycle

### Objective

Implement create/pause/cancel/expire lifecycle, including payment capture and stale campaign protection.

### Required Reading

- `notes/features/28-monetization-foundation.md` — placement and stale rules
- `notes/04-state-machines.md` — promoted status transitions
- `notes/11-convex-architecture.md` — cron + action patterns

### Key Rules

1. Campaign activation requires successful payment capture.
2. Failed/unpaid payments create no `promoted_listings` row (fail-fast).
3. Status transitions must be validated.
4. Expiry is automatic by `ends_at`.
5. Stale/ineligible listing auto-pauses campaign.
6. Lifecycle mutations must be rate-limited.

### Deliverables

- [ ] `convex/promotedListings.ts` — `createCampaign`, `expireCampaign`, `pauseCampaign`, status checks
- [ ] `convex/actions/payments.ts` — `capturePromotionPayment`
- [ ] `convex/monetization.ts` — promotion revenue ledger writes
- [ ] `convex/crons.ts` — `expirePromotionCampaigns`, `expireStalePromotions`
- [ ] `convex/rateLimiter.ts` — `owner:promotion_create`
- [ ] `convex/promotedListings.test.ts` — lifecycle + stale handling tests

### Acceptance Criteria

1. Failed/unpaid promotion attempts do not create campaign rows.
2. Campaign with archived/rented listing is paused (resumable). Campaign expiry (now >= ends_at) is handled separately by expiry cron and transitions to EXPIRED (terminal).
3. Expiry cron marks elapsed campaigns `EXPIRED`.
4. Duplicate payment webhook does not duplicate campaign or revenue rows.
5. Unauthorized create/manage operations are blocked by permissions.

### Verification

```bash
npx tsc --noEmit
npm run build
npm test -- promotedListings
```

---

## T03: Integrate Promoted Ranking in Listing Browse Queries

### Objective

Merge promoted and organic inventory with deterministic slots and no filter regressions.

### Required Reading

- `notes/features/11-tenant-browse.md`
- `notes/features/28-monetization-foundation.md` — slot algorithm
- `notes/11-convex-architecture.md` — query patterns

### Key Rules

1. Keep organic filtering semantics unchanged.
2. Insert promoted cards at fixed slot positions `[1,5,9]`.
3. Maximum 3 promoted cards per page.
4. Prevent duplicate listing card in same page.
5. Mark promoted cards with explicit `is_promoted` + label payload.

### Deliverables

- [ ] `convex/promotedListings.ts` — `listActiveForSearch`
- [ ] `convex/listings.ts` — browse query integration
- [ ] `src/components/public/listings/*` — render promoted badge + metadata
- [ ] `src/app/(public)/listings/page.tsx` — consume merged payload
- [ ] `convex/promotedListings.test.ts` — slot placement and dedupe tests

### Acceptance Criteria

1. Page never returns more than 3 promoted items.
2. Slot placement is stable for same input query and page.
3. Organic ordering is preserved for non-promoted items.
4. Promoted cards are always labeled in UI payload.
5. Filter/sort/query behavior remains backward-compatible for organic results.

### Verification

```bash
npx tsc --noEmit
npm run build
npm test -- promotedListings
```
