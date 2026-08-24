---
id: P36-E04
title: Revenue Dashboard & Public Pricing
phase: 36
status: pending
depends_on: ["P36-E01", "P36-E02", "P36-E03"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P36-E04: Revenue Dashboard & Public Pricing

## Epic Guardrails

- Shared file boundaries follow `tasks/phase-36-monetization-foundation/README.md` -> "File Ownership (Epic Boundaries)".

## Task Queue

- [ ] P36-E04-T01: Build admin revenue dashboard data queries
- [ ] P36-E04-T02: Build fee collection tracking UI in admin panel
- [ ] P36-E04-T03: Publish public pricing page with plan and fee disclosures

---

## T01: Build Admin Revenue Dashboard Data Queries

### Objective

Implement monetization reporting queries over `revenue_line_items` with drill-down-ready aggregates.

### Required Reading

- `notes/features/28-monetization-foundation.md` — revenue analytics flow
- `notes/features/10-analytics.md` — dashboard query patterns
- `notes/11-convex-architecture.md` — query organization and pagination patterns

### Key Rules

1. Aggregates must be time-window scoped.
2. Queries must return deterministic ordering and pagination metadata.
3. Dashboard must expose gross/net/cost splits by stream.
4. Fee collection states (`DUE/PARTIAL/PAID/WAIVED`) must be queryable.
5. No query should require full-table `.collect()` without index filter.

### Deliverables

- [ ] `convex/monetization.ts` — `getRevenueDashboard`, `listRevenueLineItems`, `getFeeCollectionSummary`
- [ ] `convex/monetization.test.ts` — aggregation correctness tests

### Acceptance Criteria

1. Dashboard query supports optional `date_from`, `date_to`, `stream`.
2. Stream-level totals equal sum of matching line items.
3. Fee collection breakdown matches ledger state counts and amounts.
4. Query returns top entities (listing/closure/source) for drill-down.
5. Query contract is stable and typed for frontend consumption.

### Verification

```bash
npx tsc --noEmit
npm run build
npm test -- monetization
```

---

## T02: Build Fee Collection Tracking UI in Admin Panel

### Objective

Add admin monetization dashboard page with KPI cards, stream chart, and fee exception table.

### Required Reading

- `notes/features/28-monetization-foundation.md`
- `notes/06-admin-panel-ux.md`
- `notes/features/10-analytics.md`

### Key Rules

1. UI must expose overdue/unpaid fee slices first.
2. Drill-down links should open closure/listing contexts.
3. Filters must map 1:1 with query contract.
4. Keep component patterns aligned with existing admin dashboard architecture.
5. All monetary display values in INR; data stored in paise.

### Deliverables

- [ ] `src/app/(admin)/admin/monetization/page.tsx`
- [ ] `src/components/admin/monetization/RevenueKPICards.tsx`
- [ ] `src/components/admin/monetization/FeeCollectionTable.tsx`
- [ ] `src/components/admin/monetization/RevenueByStreamChart.tsx`

### Acceptance Criteria

1. Page renders KPI cards for gross/net/collection due.
2. Table supports filters by status/source/date window.
3. Drill-down links are clickable and route-correct.
4. Empty/error states match existing admin UI conventions.
5. Page is permission-gated by `revenue.view`.

### Verification

```bash
npx tsc --noEmit
npm run build
```

---

## T03: Publish Public Pricing Page with Plan and Fee Disclosures

### Objective

Ship `/pricing` public page backed by active configuration and fee schedule data.

### Required Reading

- `notes/features/28-monetization-foundation.md` — public transparency requirements
- `notes/features/15-public-pages.md` — public route and layout conventions
- `notes/13-constants-reference.md` — monetization config keys

### Key Rules

1. Render pricing from active config/query, not hardcoded literals.
2. Show custom quote policy for rents above ₹80,000.
3. Include clear disclosure for pass credit and promotion labeling.
4. Mobile and desktop layouts must both be readable.
5. Keep content plain-language and non-legalese.

### Deliverables

- [ ] `src/app/(public)/pricing/page.tsx`
- [ ] `src/components/public/pricing/FeeSlabTable.tsx`
- [ ] `src/components/public/pricing/DiscoveryPassCard.tsx`
- [ ] `src/components/public/pricing/PromotionPlans.tsx`
- [ ] `src/components/public/pricing/PricingDisclosures.tsx`
- [ ] `convex/transactionFees.ts` or `convex/monetization.ts` query for public pricing payload

### Acceptance Criteria

1. Page route is `/pricing` and accessible without auth.
2. Fee slab table reflects active backend schedule.
3. Pass and promotion prices reflect config values.
4. Page includes explicit "Promoted listings are paid placements" disclosure.
5. Page includes "all backend amounts are paise; displayed in INR" disclosure.

### Verification

```bash
npx tsc --noEmit
npm run build
```
