---
id: P38-E04
title: Owner Properties, Leads & Earnings
phase: 38
status: pending
depends_on: ["P38-E03"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P38-E04: Owner Properties, Leads & Earnings

## Overview

Implement the owner portfolio management surfaces: property inventory, lead pipeline visibility, and earnings/payout tracking. This epic converts owner operational visibility from a single mixed page into dedicated pages aligned to primary + More navigation.

## Prerequisites

- P38-E03 dashboard routes and shell are complete.
- Existing owner ownership joins from `owners.getMyProperties` are available as baseline data.
- Payout semantics in `convex/payouts.ts` and closure owner-link fields in `convex/closures.ts` are understood before implementing owner earnings query.

## Task Queue

- [ ] P38-E04-T01: Implement `owners.getMyEarnings` owner-facing aggregation query
- [ ] P38-E04-T02: Build `/owner/properties` portfolio list page
- [ ] P38-E04-T03: Build `/owner/leads` owner lead pipeline page
- [ ] P38-E04-T04: Build `/owner/earnings` payout and brokerage timeline page

---

## T01: Implement `owners.getMyEarnings` Owner-Facing Aggregation Query

### Objective

Create a dedicated owner earnings query that returns payout status breakdown, closure-linked deal rows, and summarized totals in paise for owner financial visibility.

### Required Reading

- `convex/owners.ts` - owner-facing query patterns and owner identity resolution
- `convex/payouts.ts` - payout status model and amount semantics
- `convex/closures.ts` - closure owner linkage and confirmed/cancelled lifecycle
- `lib/constants.ts` - `PAYOUT_STATUS`, `CLOSURE_STATUS` enums
- `notes/features/30-owner-portal-dashboard.md` - financial visibility requirements

### Key Rules

1. Add `getMyEarnings` query in `convex/owners.ts` with signature:
   - `args: {}`
   - auth: `requireOwner(ctx)`
2. Query must resolve owner by authenticated `users._id` and reject missing/inactive owner linkage.
3. Query response contract must include:
   - `summary`: `{ pending_paise, approved_paise, disbursed_paise, failed_paise, voided_paise, total_disbursed_paise }`
   - `rows`: array with `payout_id`, `closure_id`, `lead_id`, `status`, `amount_paise`, `building_name`, `flat_number`, `confirmed_at`, `disbursed_at`, `payment_reference`
4. Owner scope must be enforced through owner-linked closures/leads; never expose payouts from unrelated closures.
5. Keep money in paise and timestamps in Unix ms in backend response.
6. Sort rows descending by latest lifecycle timestamp (`disbursed_at` or `_creationTime`).

### Deliverables

- [ ] `convex/owners.ts` - `getMyEarnings` query implementation

### Acceptance Criteria

1. Query returns owner-scoped earnings totals and payout rows.
2. Status-wise paise totals are correct and stable for UI rendering.
3. Query includes property context (`building_name`, `flat_number`) for each payout row.
4. Unauthorized owner-link access is blocked.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/owners.ts`.

### Out of Scope

- Dashboard KPI query updates
- Admin payout board changes
- Referral earnings logic

---

## T02: Build `/owner/properties` Portfolio List Page

### Objective

Deliver a dedicated properties page showing owner-linked properties with lead/listing/closure status context and drill-in links to related owner workflows.

### Required Reading

- `convex/owners.ts` - `getMyOwnerProfile` and `getMyProperties` response shape
- `src/app/(owner)/owner/status/page.tsx` - existing owner property card rendering logic
- `src/components/shared/lead-status-badge.tsx` - shared status badge patterns
- `src/components/shared/listing-status-badge.tsx` - shared status badge patterns
- `src/components/shared/closure-status-badge.tsx` - shared status badge patterns

### Key Rules

1. Implement page at `src/app/(owner)/owner/properties/page.tsx`.
2. Page data flow:
   - fetch property bundle (`api.owners.getMyProperties`)
   - derive owner-safe UI context from query response only (no client-provided owner id)
3. Render each property row/card with:
   - building/society label
   - flat number
   - lead status
   - listing status (if present)
   - closure status (if present)
4. Use shared status badge components instead of ad-hoc label chips.
5. Provide quick action links per row to `/owner/leads` and `/owner/earnings` filtered context (query-string filters acceptable).
6. Include explicit empty state with CTA to owner services flow (`/owner/service-requests`).
7. Keep mobile-first card stack with desktop-friendly widening under existing shell constraints.

### Deliverables

- [ ] `src/app/(owner)/owner/properties/page.tsx` - owner properties portfolio page
- [ ] `src/components/owner/properties/OwnerPropertyCard.tsx` - reusable property card

### Acceptance Criteria

1. `/owner/properties` renders owner-linked property cards with status metadata.
2. Shared status badges are used for lead/listing/closure statuses.
3. Empty state is actionable and routes correctly.
4. Loading state renders at least 3 skeleton cards; empty state renders CTA button to `/owner/service-requests` when all owner property arrays are empty.
5. `npx tsc --noEmit` passes.
6. `lsp_diagnostics` reports no errors on `src/app/(owner)/owner/properties/page.tsx` and `src/components/owner/properties/OwnerPropertyCard.tsx`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(owner)/owner/properties/page.tsx` and `src/components/owner/properties/OwnerPropertyCard.tsx`.

### Out of Scope

- Property detail drill-down route (`/owner/properties/[id]`)
- Messaging panel embedding
- Earnings calculations

---

## T03: Build `/owner/leads` Owner Lead Pipeline Page

### Objective

Create a dedicated owner lead view under the More sheet that surfaces lead lifecycle progress for all owner-linked properties.

### Required Reading

- `convex/owners.ts` - `getMyLeads` payload fields
- `lib/constants.ts` - lead statuses and color maps
- `src/components/shared/lead-status-badge.tsx` - consistent badge rendering API
- `notes/04-state-machines.md` - lead transition meaning/context

### Key Rules

1. Add route `src/app/(owner)/owner/leads/page.tsx`.
2. Query source must be `api.owners.getMyLeads`; no client-side owner ID spoofing.
3. Render lead list sorted newest-first with required columns/cards:
   - submitted date
   - property identifier (society/building/flat)
   - lead status
   - shortlist context (listing created, closure reached)
4. Use `LeadStatusBadge` with optional labels where needed; avoid custom hardcoded status strings.
5. Add lead-stage helper copy for owner comprehension (for example: "Need Info", "Under Review", "Verified").
6. Provide CTA links to related pages: messages (if inquiry exists later), earnings (if closure/payout exists).

### Deliverables

- [ ] `src/app/(owner)/owner/leads/page.tsx` - owner leads page
- [ ] `src/components/owner/leads/OwnerLeadTimeline.tsx` - reusable lead timeline/list component

### Acceptance Criteria

1. `/owner/leads` displays owner-only leads with clear stage visibility.
2. Every lead status chip is rendered via `LeadStatusBadge` (no hardcoded status text badges in owner lead rows).
3. Lead rows are sorted by `_creationTime` descending on initial render and after refresh; status filter changes do not reorder same-status rows non-deterministically.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` reports no errors on `src/app/(owner)/owner/leads/page.tsx` and `src/components/owner/leads/OwnerLeadTimeline.tsx`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(owner)/owner/leads/page.tsx` and `src/components/owner/leads/OwnerLeadTimeline.tsx`.

### Out of Scope

- Lead mutation actions from owner portal
- Admin lead queue changes
- Chat channel generation logic

---

## T04: Build `/owner/earnings` Payout and Brokerage Timeline Page

### Objective

Deliver the owner earnings page with summary cards and payout timeline using `owners.getMyEarnings`, including status grouping for pending/paid/failed records.

### Required Reading

- `convex/owners.ts` - `getMyEarnings` query from T01
- `convex/payouts.ts` - payout status lifecycle and field semantics
- `src/components/shared/payout-status-badge.tsx` - status badge rendering pattern
- `lib/money.ts` - paise-to-INR formatting helpers

### Key Rules

1. Implement page `src/app/(owner)/owner/earnings/page.tsx` consuming `api.owners.getMyEarnings`.
2. Render top summary cards for:
   - pending total
   - approved total
   - disbursed total
   - failed/voided totals
3. Render payout rows grouped by status buckets (`pending/approved`, `disbursed`, `failed/voided`) with timestamp and payment reference where available.
4. Use `PayoutStatusBadge` for all row statuses.
5. All amounts shown in INR; raw paise should never be displayed.
6. Include explanatory empty-state copy for owners with no closure-linked payouts.
7. Keep page aligned with owner mobile-first shell spacing and card patterns.

### Deliverables

- [ ] `src/app/(owner)/owner/earnings/page.tsx` - owner earnings page
- [ ] `src/components/owner/earnings/OwnerEarningsSummary.tsx` - summary cards
- [ ] `src/components/owner/earnings/OwnerEarningsTimeline.tsx` - grouped payout timeline

### Acceptance Criteria

1. `/owner/earnings` renders summary + timeline from `getMyEarnings`.
2. Group totals exactly equal the sum of backend `rows` grouped by payout status buckets (`pending/approved`, `disbursed`, `failed/voided`).
3. All monetary values are formatted INR in UI.
4. No rows from other owners appear.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed owner earnings files.

### Out of Scope

- Tax export and annual statement generation
- Referral earnings breakdown
- Monetization fee-rule changes
