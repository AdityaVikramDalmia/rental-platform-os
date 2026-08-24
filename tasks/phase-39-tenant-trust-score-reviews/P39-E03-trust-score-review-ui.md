---
id: P39-E03
title: Trust Score & Review UI
phase: 39
status: pending
depends_on: ["P39-E01", "P39-E02"]
skills: ["rental-platform-os-rules", "frontend-ui-ux", "rental-platform-os-arch"]
updated_at: 2026-02-20
---

# P39-E03: Trust Score & Review UI

## Overview

Implement tenant, listing, and admin UI surfaces for the P39 trust/review system with strict route ownership, explicit eligibility messaging, moderation controls, and response workflows aligned to backend contracts.

Refer to feature spec sections: Admin Analytics, Bulk Moderation, Notification Triggers, Data Retention, Accessibility, Mobile UI, Error Handling, Cron Schedule for implementation guidance.

## Prerequisites

- **Read first**: [P39-E02 Completion Summary](P39-E02-review-system-backend.md#completion-summary) — review lifecycle and queue contract details.
- `api.tenantTrust.*` and `api.reviews.*` from prior epics are available and stable.

## Epic Verification (Task-Specific)

Verify trust badge renders correct band label. Verify moderation: admin flags review, confirm state changes to `FLAGGED`. Verify owner response renders below review.

## Task Queue

- [ ] P39-E03-T01: Build shared trust/review view-model adapters and reusable presentation components
- [ ] P39-E03-T02: Implement tenant trust route ownership at `/tenant/profile`
- [ ] P39-E03-T03: Implement listing review section and submission flow at `/listing/[slug]`
- [ ] P39-E03-T04: Implement moderation operations page at `/admin/reviews`
- [ ] P39-E03-T05: Implement owner/platform response UI with once-only + one-edit policy handling

## Test Strategy

Component tests: trust badge renders correct band, review card displays all fields, moderation actions trigger correct mutations. Responsive: verify at 375px and 1440px.

---

## T01: Build Shared Trust/Review View-Model Adapters and Reusable Components

### Objective

Create reusable components and data adapters for trust badge rendering, component breakdown display, review cards, and status chips so tenant/listing/admin routes share one consistent presentation layer.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — TrustBadgeViewModel, Materialized Aggregates, Response policies
- `notes/features/25-trust-verification-display.md` — trust badge display conventions
- `src/components/shared/trust-badge-chip.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- Refer to feature spec sections: Admin Analytics, Bulk Moderation, Notification Triggers, Data Retention, Accessibility, Mobile UI, Error Handling, Cron Schedule for implementation guidance.

### Key Rules

1. Keep the trust badge contract stable: `score`, `band`, `confidence`, `computed_at`.
2. Display trust band thresholds exactly (`NEW`, `BUILDING`, `TRUSTED`, `PREMIUM`).
3. Use 1-decimal display for aggregate ratings from cached x10 values.
4. Do not expose non-published review records in shared public components.
5. Reuse shadcn/ui primitives; avoid native form controls for structured input fields.

### Deliverables

- [ ] `src/components/shared/trust-badge-chip.tsx` - P39 trust band + confidence rendering updates
- [ ] `src/components/shared/trust-score-breakdown.tsx` - component points visualization
- [ ] `src/components/shared/review-card.tsx` - common review card (rating, text, response, status badge)
- [ ] `src/components/shared/review-status-badge.tsx` - review status pill component

### Acceptance Criteria

1. Trust badge displays score/band/confidence consistently across consuming routes.
2. Breakdown component correctly shows 4 component caps (30/25/25/20).
3. Review card supports optional response block and moderation-state label rendering.
4. Aggregate ratings render with exactly one decimal place.
5. Components are responsive on mobile and desktop.
6. `npx tsc --noEmit` passes and LSP diagnostics are clean.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed shared trust/review components.

### Out of Scope

- Route-level data fetching
- Moderation mutation wiring
- Backend eligibility logic

---

## T02: Implement Tenant Trust Route Ownership at `/tenant/profile`

### Objective

Render tenant trust score, component breakdown, confidence state, and score history in the tenant profile route with clear insufficient-data and loading/error handling.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Baseline/Backfill/Confidence, Convex Contracts
- `src/app/(tenant)/tenant/profile/page.tsx`
- `src/components/tenant/` existing profile components
- `convex/tenantTrust.ts` API contracts from P39-E01

### Key Rules

1. Route ownership must be explicit at `/tenant/profile`.
2. Use `tenantTrust.getMyTrustScore` and paginated `tenantTrust.getScoreHistory` contracts.
3. Show "Insufficient Data" badge when `insufficient_data = true`.
4. Show score timestamp (`computed_at`) and model version in details section.
5. Never expose other tenants' trust data on this route.

### Deliverables

- [ ] `src/app/(tenant)/tenant/profile/page.tsx` - trust summary and score history integration
- [ ] `src/components/tenant/trust/tenant-trust-panel.tsx` - tenant trust card + breakdown
- [ ] `src/components/tenant/trust/tenant-trust-history.tsx` - paginated history timeline

### Acceptance Criteria

1. `/tenant/profile` displays current score, band, confidence, and component breakdown.
2. Insufficient-data tenants see non-breaking fallback UI with clear messaging.
3. History section paginates and handles empty state gracefully.
4. Timestamp and model version are shown in detail metadata.
5. Unauthorized tenant data access is not possible from this UI route.
6. `npx tsc --noEmit` and `npm run build` pass with clean diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `/tenant/profile` page and new tenant trust components.

### Out of Scope

- Listing review submission flow
- Admin moderation controls
- Owner response authoring

---

## T03: Implement Listing Review Section and Submission Flow at `/listing/[slug]`

### Objective

Add published review display, rating aggregates, eligibility checks, and review submission/edit-in-cooling UX to listing detail pages.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Review model, cooling edit semantics, aggregate strategy
- `src/app/listing/[slug]/page.tsx`
- `src/app/listing/[slug]/components/` existing detail sections
- `src/components/ui/form.tsx`
- `convex/reviews.ts` contracts from P39-E02

### Key Rules

1. Route ownership is `/listing/[slug]`; do not create alternate listing review routes.
2. Listing review list must use published-only query contract.
3. Submission form must show eligibility reason when ineligible.
4. Cooling state must clearly indicate hidden-before-publish and one-edit allowance.
5. Enforce low-rating text requirement in form validation.

### Deliverables

- [ ] `src/app/listing/[slug]/page.tsx` - wire review section data and actions
- [ ] `src/app/listing/[slug]/components/listing-review-section.tsx` - aggregate + review list block
- [ ] `src/app/listing/[slug]/components/listing-review-form.tsx` - submit/edit-during-cooling form
- [ ] `src/app/listing/[slug]/components/listing-review-eligibility.tsx` - ineligible-state messaging component

### Acceptance Criteria

1. Listing page shows aggregate rating + count from cache-backed API.
2. Review list displays only published reviews with responses.
3. Eligible users can submit reviews and see pending-cooling state immediately.
4. Users can edit once before cooling expiry and are blocked after.
5. Ineligible users see explicit reason messaging from eligibility API.
6. `npx tsc --noEmit` and `npm run build` pass with clean diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on listing route files changed by this task.

### Out of Scope

- Admin moderation controls
- Tenant profile trust history
- Owner portal route implementation

---

## T04: Implement Moderation Operations Page at `/admin/reviews`

### Objective

Ship admin moderation UI with queue filters, sort, pagination, detail panel, and moderation actions mapped exactly to backend transitions.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — moderation action mapping, queue query contract, pagination defaults
- `src/app/(admin)/admin/notifications/page.tsx` (list/detail pattern reference)
- `src/components/admin/` existing table and detail panel patterns
- `convex/reviews.ts` moderation queue and mutation contracts

### Key Rules

1. Route ownership must be `/admin/reviews`.
2. Queue filters must include: status, review type, target type, anomaly flag, date range.
3. Sort options must include: newest first, rating ascending, rating descending.
4. Pagination defaults to 20 and supports load-more/next-page behavior with continuation cursor.
5. Moderation actions must map exactly: `HIDE`, `UNHIDE`, `MARK_ABUSIVE`, `RESOLVE_FLAG`.

### Deliverables

- [ ] `src/app/(admin)/admin/reviews/page.tsx` - moderation page shell and data hooks
- [ ] `src/components/admin/reviews/reviews-moderation-table.tsx` - filterable/sortable paginated queue table
- [ ] `src/components/admin/reviews/reviews-moderation-detail.tsx` - selected review detail panel
- [ ] `src/components/admin/reviews/reviews-moderation-actions.tsx` - moderation action controls/dialogs

### Acceptance Criteria

1. `/admin/reviews` renders moderation queue with required filters and sort options.
2. Pagination works with backend cursor contract and default page size.
3. Action controls call correct moderation mutations and update row state in real time.
4. Detail panel shows interaction metadata, anomaly markers, and moderation history.
5. Error states from backend contracts are surfaced as actionable admin messaging.
6. `npx tsc --noEmit` and `npm run build` pass with clean diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on the new admin reviews page and components.

### Out of Scope

- Tenant trust score computation
- Review submission backend changes
- Formal dispute/arbitration UI

---

## T05: Implement Owner/Platform Response UI With Once-Only and Edit Limits

### Objective

Implement reusable response authoring UI that enforces owner/platform permissions, one response per review, and max one response edit.

### Required Reading

- `notes/features/31-tenant-trust-score-reviews.md` — Response Permissions and Policies
- `notes/features/30-owner-portal-dashboard.md` — owner-side consumer contracts
- `src/components/shared/review-card.tsx` (from T01)
- `convex/reviews.ts` response mutation contracts

### Key Rules

1. Owner response is allowed only for `TENANT_LISTING_ACCURACY` on owner-linked listings.
2. Platform response is allowed for `OWNER_PLATFORM_SERVICE` via admin users only.
3. Response creation is once-only per review.
4. Response edit is max one edit and must reflect backend rejection when exceeded.
5. UI must clearly distinguish responder role (`OWNER`, `ADMIN`).

### Deliverables

- [ ] `src/components/shared/review-response-form.tsx` - response create/edit form with limit-aware UX
- [ ] `src/components/shared/review-response-thread.tsx` - response display component with role/timestamp metadata
- [ ] `src/components/admin/reviews/review-response-panel.tsx` - admin response action panel integration
- [ ] `src/app/listing/[slug]/components/listing-review-section.tsx` - owner response rendering hook-up for listing reviews

### Acceptance Criteria

1. Eligible responders can create exactly one response per review.
2. Second response creation attempt is blocked with clear backend-aligned error messaging.
3. Response edit can be performed once and then blocks additional edits.
4. Response role and timestamps render correctly in review thread UI.
5. Non-eligible users do not see response authoring controls.
6. `npx tsc --noEmit` and `npm run build` pass with clean diagnostics.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on response components and any route integrations touched.

### Out of Scope

- Owner portal route creation beyond existing phase ownership
- Review moderation backend changes
- Dispute/appeal workflows

---

## Completion Summary

Completion details are recorded when this epic is marked `done`.
