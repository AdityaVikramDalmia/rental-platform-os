---
id: P38-E03
title: Owner Portal Shell & Dashboard
phase: 38
status: pending
depends_on: ["P38-E01", "P38-E02"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P38-E03: Owner Portal Shell & Dashboard

## Overview

Stand up the owner portal primary routes and deliver a production dashboard experience on top of the new shared shell and auth resolver. This epic converts owner portal from a single status page into a first-class product entry point anchored at `/owner/dashboard`.

## Prerequisites

- P38-E01 must be complete so owner layout delegates into `PortalShell` and nav config already exists.
- P38-E02 must be complete so Google SSO callback can reliably land owner users on owner routes.
- Existing owner-facing base queries in `convex/owners.ts` (`getMyOwnerProfile`, `getMyProperties`, `getMyRmAssignment`, `getMyCheckIns`) remain valid and should be reused where possible.

## Task Queue

- [ ] P38-E03-T01: Scaffold owner primary route surfaces and shell entry points
- [ ] P38-E03-T02: Implement `owners.getMyDashboardSummary` backend query
- [ ] P38-E03-T03: Build `/owner/dashboard` premium mobile-first UI
- [ ] P38-E03-T04: Migrate legacy `/owner/status` entry and harden dashboard route behavior

---

## T01: Scaffold Owner Primary Route Surfaces and Shell Entry Points

### Objective

Create all primary owner route files required by bottom nav so navigation is immediately functional while feature-specific pages are implemented in downstream epics.

### Required Reading

- `src/config/navigation.ts` - owner primary nav definitions from P38-E01
- `src/app/(owner)/layout.tsx` and `src/app/(owner)/owner-layout-client.tsx` - shell integration contract
- `src/app/(owner)/owner/status/page.tsx` - existing owner feature surface to preserve/migrate
- `src/app/(guard)/guard-layout-client.tsx` - route-group pathing and mobile flow expectations

### Key Rules

1. Create route files under `src/app/(owner)/owner/` for all primary nav destinations:
   - `dashboard/page.tsx`
   - `properties/page.tsx`
   - `earnings/page.tsx`
   - `messages/page.tsx`
2. Each new route must render inside existing `PortalShell` owner container without duplicating shell/header/nav wrappers.
3. Route-level ownership checks should rely on layout guards, not duplicate role checks in every page.
4. `dashboard/page.tsx` must be the canonical owner home destination used by `/post-auth` resolver.
5. Keep route file naming and URL prefixes aligned with App Router conventions: `(owner)/owner/*` -> `/owner/*`.

### Deliverables

- [ ] `src/app/(owner)/owner/dashboard/page.tsx` - owner dashboard route shell
- [ ] `src/app/(owner)/owner/properties/page.tsx` - owner properties route shell
- [ ] `src/app/(owner)/owner/earnings/page.tsx` - owner earnings route shell
- [ ] `src/app/(owner)/owner/messages/page.tsx` - owner messages route shell

### Acceptance Criteria

1. All owner primary routes (`/owner/dashboard`, `/owner/properties`, `/owner/earnings`, `/owner/messages`) resolve without 404.
2. Owner shell nav active state works for each primary route.
3. No duplicate header/nav wrappers are introduced inside route pages.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` reports no errors across all newly created owner primary route files.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on all newly created owner route files.

### Out of Scope

- Dashboard KPI implementation
- Property list/detail implementation
- Messages chat list/detail implementation

---

## T02: Implement `owners.getMyDashboardSummary` Backend Query

### Objective

Create an owner-scoped aggregation query for dashboard cards, recent activity stream, and RM summary so dashboard rendering depends on one stable backend contract.

### Required Reading

- `convex/owners.ts` - existing owner-facing query style and `requireOwner()` usage
- `convex/closures.ts` - owner-linked closure context and status handling
- `convex/payouts.ts` - payout status and amount semantics in paise
- `lib/constants.ts` - status enums and labels for owner-facing metrics
- `notes/features/30-owner-portal-dashboard.md` - KPI and activity expectations

### Key Rules

1. Add new query in `convex/owners.ts`:
   - `getMyDashboardSummary({})`
   - Auth: `requireOwner(ctx)`
2. Query must derive owner from authenticated user and avoid accepting arbitrary `owner_id` in args.
3. Return contract must include:
   - `owner`: `{ _id, name, lifecycle_stage }`
   - `kpis`:
     ```ts
     {
       total_properties: number;
       active_tenants: number;
       expected_monthly_rent: number;
       pending_requests: number;
     }
     ```
   - `alerts`: `Array<{ type: string; message: string; entity_id: string }>` (TOP-LEVEL, sibling to kpis)
   - `rm_contact`: `{ rm_name, rm_phone, status, last_check_in_at, next_check_in_due } | null`
   - `recent_activity`: ordered array of latest owner-linked lead/listing/closure/payout events with event type + timestamp + entity ids
4. Monetary values must remain paise integers in backend response.
5. Activity list must be sorted descending by event timestamp and capped (for example 10 items).
6. Include only owner-linked records (`owners.user_id === current user`) and ignore soft-deleted merged owner records.

### Deliverables

- [ ] `convex/owners.ts` - `getMyDashboardSummary` query with owner-scoped KPI + activity rollup

### Acceptance Criteria

1. Query returns complete summary payload from one endpoint.
2. Query never leaks other owners' data.
3. KPI payload includes `total_properties`, `active_tenants`, `expected_monthly_rent`, `pending_requests` with `expected_monthly_rent` in paise integer format. `alerts` is a top-level sibling field (not nested in kpis). `rm_contact` field name is used (not `rm`). Deterministic event ordering for recent_activity.
4. Existing owner queries continue to compile and function.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/owners.ts`.

### Out of Scope

- Owner earnings deep breakdown query (handled in P38-E04)
- Messages/chat query changes (handled in P38-E05)
- Service request/documents queries (handled in P38-E06)

---

## T03: Build `/owner/dashboard` Premium Mobile-First UI

### Objective

Implement the owner dashboard screen with KPI cards, RM summary card, recent activity list, and quick-link actions using the new `getMyDashboardSummary` contract.

### Required Reading

- `src/app/(owner)/owner/status/page.tsx` - current RM card and owner-context UI building blocks
- `src/components/admin/dashboard/*` - KPI card and activity composition patterns (adapted to mobile-first owner UX)
- `src/app/(guard)/guard-layout-client.tsx` - spacing, touch targets, and mobile typography baseline
- `convex/owners.ts` - `getMyDashboardSummary` response contract from T02
- `lib/money.ts` and `lib/dates.ts` - INR/date formatting helpers

### Key Rules

1. Dashboard page must consume `api.owners.getMyDashboardSummary` as the primary data source.
2. Create owner dashboard components under `src/components/owner/dashboard/`:
   - `OwnerDashboardKpis.tsx`
   - `OwnerDashboardActivity.tsx`
   - `OwnerDashboardRmCard.tsx`
   - `OwnerDashboardQuickLinks.tsx`
3. KPI cards must display:
   - `total_properties`
   - `active_tenants`
   - `expected_monthly_rent` (formatted as INR)
   - `pending_requests`
   - Alerts from `alerts` (top-level field)
4. Recent activity rows must include event label, relative time, and deep-link target route where applicable.
5. Quick links must route to owner pages defined by IA (`/owner/properties`, `/owner/leads`, `/owner/messages`, `/owner/service-requests`).
6. Visual style must follow owner theme direction (indigo/violet accents, clean SaaS cards, frosted nav inherited from shell).
7. Support robust states: loading skeleton, empty state (no data), and error fallback with retry affordance.

### Deliverables

- [ ] `src/app/(owner)/owner/dashboard/page.tsx` - owner dashboard page implementation
- [ ] `src/components/owner/dashboard/OwnerDashboardKpis.tsx` - KPI card strip
- [ ] `src/components/owner/dashboard/OwnerDashboardActivity.tsx` - recent activity list
- [ ] `src/components/owner/dashboard/OwnerDashboardRmCard.tsx` - RM summary card
- [ ] `src/components/owner/dashboard/OwnerDashboardQuickLinks.tsx` - quick-link action tiles

### Acceptance Criteria

1. `/owner/dashboard` renders live owner metrics from `getMyDashboardSummary`.
2. KPI section renders `total_properties`, `active_tenants`, `expected_monthly_rent`, `pending_requests` from kpis object. `alerts` field is rendered as a top-level sibling (not nested in kpis). Monetary display formats `expected_monthly_rent` as INR while preserving paise backend contract.
3. Activity list is ordered and links to relevant owner routes.
4. Loading state, empty state, and error state each render on ≤390px viewport with no horizontal overflow and with a visible tap target for retry/next action.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed owner dashboard files.

### Out of Scope

- Owner property detail page
- Owner earnings timeline page
- Owner chat channel page

---

## T04: Migrate Legacy `/owner/status` Entry and Harden Dashboard Route Behavior

### Objective

Retire the old status-first owner entry flow and ensure canonical owner portal entry consistently lands on `/owner/dashboard`.

### Required Reading

- `src/app/(owner)/owner/status/page.tsx` - legacy owner page behavior to preserve where needed
- `src/app/post-auth/page.tsx` - new auth resolver destination flow from P38-E02
- `src/config/navigation.ts` - owner home route alignment (`/owner/dashboard`)

### Key Rules

1. Update legacy `src/app/(owner)/owner/status/page.tsx` behavior to avoid competing home surfaces:
   - Either convert to a redirect to `/owner/dashboard`, or keep as compatibility view with explicit link-forwarding pattern.
2. Owner home UX must have one canonical route for entry, bookmarks, and auth redirects: `/owner/dashboard`.
3. Ensure any references in owner-facing components pointing to `/owner/status` are updated to `/owner/dashboard`.
4. Maintain backward compatibility for existing users with stale `/owner/status` bookmarks.

### Deliverables

- [ ] `src/app/(owner)/owner/status/page.tsx` - migrated compatibility behavior aligned to `/owner/dashboard`
- [ ] `src/app/(owner)/owner/dashboard/page.tsx` - updated to canonical dashboard route (from T03)
- [ ] `src/config/navigation.ts` - owner route references updated to canonical dashboard route

### Acceptance Criteria

1. Owner users landing via post-auth always reach `/owner/dashboard`.
2. `/owner/status` no longer behaves as competing primary portal homepage.
3. No broken links remain to deprecated owner-home route in owner UI.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` reports no errors on `src/app/(owner)/owner/status/page.tsx` and touched owner route files.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(owner)/owner/status/page.tsx` and any owner route files updated.

### Out of Scope

- Earnings/properties/messages feature implementation
- Referral/request/documents/profile feature implementation
- Tenant portal entry mapping
