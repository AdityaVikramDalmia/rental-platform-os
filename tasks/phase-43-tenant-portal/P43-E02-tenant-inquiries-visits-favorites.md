---
id: P43-E02
title: Tenant Inquiries, Visits & Favorites
phase: 43
status: pending
depends_on: ["P38-E01", "P38-E02", "P43-E01", "P34", "P35"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P43-E02: Tenant Inquiries, Visits & Favorites

## Overview

Build tenant-facing inquiry and visit workflows plus backend-synced favorites. This epic closes the current backend gap where inquiry read APIs are admin-gated and introduces hybrid favorite persistence (localStorage + backend for logged-in tenants) without breaking anonymous listings browsing. All APIs in this epic are tenant-identity scoped with `requireTenant(ctx)` (no backoffice RBAC checks).

## Documentation Alignment (Mandatory)

- Follow P43 feature-spec "Offline & Error States" and "Loading Skeleton Specs" for My Inquiries, My Visits, and Favorites pages.
- My Inquiries, My Visits, and Favorites UIs must use page-specific skeleton dimensions from feature spec to prevent layout shift.
- Emit analytics events for this epic surfaces: `tenant.inquiry_viewed`, `tenant.visit_viewed`, `tenant.favorite_added`, and `tenant.favorite_removed` with required IDs.

## Prerequisites

- **Read first**: `P43-E01` for shell, nav, and dashboard primitives.
- Existing inquiry submission UI exists in `src/components/tenant/inquiry-form.tsx`.
- Existing inquiry status badge exists in `src/components/shared/inquiry-status-badge.tsx`.
- Existing favorites behavior is localStorage-only in `src/lib/hooks/use-favorites.ts` and `src/components/public/listings/listings-directory.tsx`.
- Current admin inquiry reads in `convex/tenantInquiries.ts` are permission-gated and must not be reused directly for tenant self-service.
- `tenant_profiles.saved_listings` is deprecated; `tenant_favorites` is canonical for logged-in tenants.

## Task Queue

- [x] P43-E02-T01: Add tenant-facing inquiry read APIs (`getMyInquiries`, `getMyInquiryById`)
- [x] P43-E02-T02: Add tenant-facing visits API and resolve `visits.getMyVisits` naming collision safely
- [x] P43-E02-T03: Add backend-synced favorites model and CRUD module (`tenantFavorites`)
- [x] P43-E02-T04: Build `/tenant/inquiries` and `/tenant/inquiries/[id]` pages
- [x] P43-E02-T05: Build `/tenant/visits` and `/tenant/favorites` pages with one-time localStorage import flow

---

## Epic Verification (Mandatory)

- Verify cross-tenant isolation by attempting direct query manipulation: tenant A cannot read tenant B inquiries, visits, or favorites.
- Verify mobile visual checks for new pages at 375px, 390px, and 768px.

---

## T01: Add Tenant-Facing Inquiry Read APIs (`getMyInquiries`, `getMyInquiryById`)

### Objective

Add tenant-scoped query APIs so tenants can read only their own inquiries and inquiry details, including enriched listing/visit context.

### Required Reading

- `convex/tenantInquiries.ts`
- `convex/auth.helpers.ts`
- `convex/schema.ts` (`tenant_inquiries` table + indexes)
- `notes/features/13-tenant-inquiry.md`
- `notes/04-state-machines.md`

### Key Rules

1. Add `tenantInquiries.getMyInquiries` in `convex/tenantInquiries.ts`:
   ```ts
   export const getMyInquiries = query({
     args: {
       paginationOpts: paginationOptsValidator,
       status: v.optional(tenantInquiryStatusValidator),
     },
   });
   ```
2. `getMyInquiries` must use `requireTenant(ctx)` and force `tenant_id === tenant._id` in query criteria; no caller-provided `tenant_id` argument is allowed.
3. Add `tenantInquiries.getMyInquiryById` in `convex/tenantInquiries.ts`:
   ```ts
   export const getMyInquiryById = query({ args: { id: v.id("tenant_inquiries") } });
   ```
4. `getMyInquiryById` must throw if inquiry is missing or belongs to another tenant.
5. Both queries must return enriched context (listing/lead/building/society/guard/visit) matching existing admin-facing response structure so UI components can share display logic.
6. Keep existing admin functions (`list`, `getById`) intact and permission-gated.
7. Maintain status transition semantics; timeline-capable payloads must include `NEGOTIATION_INITIATED` when present.

### Deliverables

- [ ] `convex/tenantInquiries.ts` - add `getMyInquiries` and `getMyInquiryById` tenant-safe queries

### Acceptance Criteria

1. Tenant can paginate only their own inquiries through `api.tenantInquiries.getMyInquiries`.
2. Tenant can fetch one owned inquiry with `api.tenantInquiries.getMyInquiryById`.
3. Attempting to read another tenant's inquiry fails closed with a clear error.
4. Existing admin inquiry pages continue using admin APIs unaffected.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/tenantInquiries.ts`.

### Out of Scope

- Tenant inquiry page UI
- Chat page integration
- Favorites model and sync flow

---

## T02: Add Tenant-Facing Visits API and Resolve `visits.getMyVisits` Naming Collision Safely

### Objective

Deliver tenant visit retrieval under `visits.getMyVisits` while preserving guard portal functionality that currently depends on the same function name.

### Required Reading

- `convex/visits.ts`
- `src/app/(guard)/guard/visits/page.tsx`
- `src/app/(guard)/guard/visits/[id]/page.tsx`
- `convex/auth.helpers.ts`
- `notes/features/13-tenant-inquiry.md`

### Key Rules

1. Introduce tenant-facing `visits.getMyVisits` (required by Phase-43 architecture) guarded by `requireTenant(ctx)`.
2. Tenant `getMyVisits` must return visits linked to tenant-owned inquiries (`visit.tenant_inquiry_id -> tenant_inquiries.tenant_id === tenant._id`).
3. Keep visit payload enriched with listing/building/society/inquiry metadata needed by tenant pages.
4. Preserve guard compatibility by moving current guard implementation to `visits.getMyGuardVisits` and updating guard UI callers:
   - `src/app/(guard)/guard/visits/page.tsx`
   - `src/app/(guard)/guard/visits/[id]/page.tsx`
5. Provide optional filter args for tenant flow:
   ```ts
   {
     status?: VisitStatus;
     date_from?: number;
     date_to?: number;
   }
   ```
6. Do not relax permissions on admin/OPS visit list endpoints.
7. Ensure no route/component in guard portal calls tenant-scoped visit API after migration.

### Deliverables

- [ ] `convex/visits.ts` - add tenant-facing `getMyVisits` and guard-facing `getMyGuardVisits`
- [ ] `src/app/(guard)/guard/visits/page.tsx` - switch to `api.visits.getMyGuardVisits`
- [ ] `src/app/(guard)/guard/visits/[id]/page.tsx` - switch to `api.visits.getMyGuardVisits`

### Acceptance Criteria

1. Tenant-facing `api.visits.getMyVisits` returns only tenant-owned visits.
2. Guard visits pages still render correctly using migrated guard query name.
3. API naming conflict is resolved without runtime breakage.
4. Mandatory migration verification completed with both grep and LSP references to ensure no stale `api.visits.getMyVisits` usages remain in guard portal.
5. `npx tsc --noEmit` and `npm run build` pass after migration.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/visits.ts`, `src/app/(guard)/guard/visits/page.tsx`, and `src/app/(guard)/guard/visits/[id]/page.tsx`.

Also run grep verification for stale usages:

```bash
grep -rn "api\.visits\.getMyVisits" "src/app/(guard)/guard" "src/components/guard"
```

### Out of Scope

- Tenant visits page UI
- Inquiry page timeline composition
- Favorites persistence work

---

## T03: Add Backend-Synced Favorites Model and CRUD Module (`tenantFavorites`)

### Objective

Implement backend favorites persistence for logged-in tenants while keeping existing anonymous localStorage behavior unchanged.

### Required Reading

- `convex/schema.ts` (`tenant_profiles`, `listings`)
- `convex/functions.ts` (audited tables list)
- `src/lib/hooks/use-favorites.ts`
- `src/components/public/listings/listings-directory.tsx`
- `notes/features/11-tenant-browse.md`
- `notes/10-convex-schema.md`

### Key Rules

1. Add `tenant_favorites` table in `convex/schema.ts` with fields:
   ```ts
   {
     tenant_user_id: v.id("users"),
     listing_id: v.id("listings"),
     created_at: v.number(),
   }
   ```
   and indexes:
   - `by_tenant` -> `["tenant_user_id"]`
   - `by_tenant_and_listing` -> `["tenant_user_id", "listing_id"]` (uniqueness check)
2. Add `tenant_favorites` to `AUDITED_TABLES` in `convex/functions.ts`.
3. Create `convex/tenantFavorites.ts` with tenant-scoped APIs:
   - `list` query (no args)
   - `add` mutation (`{ listing_id: Id<"listings"> }`)
   - `remove` mutation (`{ listing_id: Id<"listings"> }`)
   - `importFromLocalStorage` mutation (`{ listing_ids: Id<"listings">[] }`)
4. All APIs must use `requireTenant(ctx)` and be idempotent (duplicate add/import must not error).
5. `importFromLocalStorage` must only insert valid listing IDs and return deterministic counts:
   ```ts
   {
     imported_count: number;
     skipped_count: number;
   }
   ```
6. Do not delete or repurpose anonymous `demorentals-favorites` localStorage key in this task.
7. Canonical source rule: `tenant_favorites` is source of truth for logged-in tenants; `tenant_profiles.saved_listings` is migration-only and remains read-only.
8. Migration policy: when tenant favorites are empty and `saved_listings` exists, import `saved_listings` first, then localStorage IDs, dedupe by listing id, and report deterministic imported/skipped counts.
9. Favorites mutations must emit audit actions `TENANT_FAVORITE_ADD` and `TENANT_FAVORITE_REMOVE`.

### Deliverables

- [ ] `convex/schema.ts` - add `tenant_favorites` table + indexes
- [ ] `convex/functions.ts` - include `tenant_favorites` in `AUDITED_TABLES`
- [ ] `convex/tenantFavorites.ts` - list/add/remove/import APIs for tenant favorites

### Acceptance Criteria

1. Backend favorites CRUD exists and is tenant-auth guarded.
2. Duplicate favorite operations are idempotent.
3. LocalStorage import mutation reports imported/skipped counts correctly.
4. Canonical-source + migration policy is implemented without dual-source drift.
5. Anonymous localStorage path remains available for public listings experience.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `convex/functions.ts`, and `convex/tenantFavorites.ts`.

### Out of Scope

- Tenant favorites page UI
- Listings-page dual-write integration
- Dashboard favorites card UI

---

## T04: Build `/tenant/inquiries` and `/tenant/inquiries/[id]` Pages

### Objective

Create tenant inquiry list/detail surfaces that show lifecycle progress, visit linkage, and embedded chat panel entry point.

### Required Reading

- `src/components/tenant/inquiry-form.tsx`
- `src/components/shared/inquiry-status-badge.tsx`
- `convex/tenantInquiries.ts` (new tenant queries from T01)
- `src/app/listing/[slug]/components/contact-sidebar.tsx`
- `notes/features/13-tenant-inquiry.md`
- `notes/04-state-machines.md`

### Key Rules

1. Create list page at `src/app/(tenant)/tenant/inquiries/page.tsx` using `usePaginatedQuery(api.tenantInquiries.getMyInquiries, ...)`.
2. Add status filter tabs aligned with `TENANT_INQUIRY_STATUS` constants and labels from `lib/constants.ts`.
3. Create detail page at `src/app/(tenant)/tenant/inquiries/[id]/page.tsx` using `useQuery(api.tenantInquiries.getMyInquiryById, { id })`.
4. Detail page must render:
   - listing snapshot (building/society/rent/BHK)
   - inquiry status timeline
   - preferred visit date/slot
   - assigned guard + linked visit summary
   - quick links to `/listing/[slug]` and channel-specific `/tenant/messages/[channelId]` when channel exists (fallback `/tenant/messages`)
5. Reuse `InquiryStatusBadge`; do not create a duplicate tenant-only status badge.
6. Layout must remain mobile-first with card stacking and touch-friendly action buttons.
7. Include loading, empty, and unauthorized-safe fallback states.
8. Timeline rendering must include `NEGOTIATION_INITIATED` between `VISIT_COMPLETED` and `CLOSED`.

### Deliverables

- [ ] `src/app/(tenant)/tenant/inquiries/page.tsx` - tenant inquiry list page with filters and pagination
- [ ] `src/app/(tenant)/tenant/inquiries/[id]/page.tsx` - tenant inquiry detail page with lifecycle timeline
- [ ] `src/components/tenant/inquiries/inquiry-list-item.tsx` - reusable inquiry list card
- [ ] `src/components/tenant/inquiries/inquiry-timeline.tsx` - status timeline component

### Acceptance Criteria

1. `/tenant/inquiries` lists only current tenant inquiries.
2. `/tenant/inquiries/[id]` opens only tenant-owned inquiry details.
3. Status badge/timeline semantics match `TENANT_INQUIRY_STATUS` order including `NEGOTIATION_INITIATED`.
4. Linked visit and listing details display when available.
5. Page passes visual checks at 375px, 390px, and 768px.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all new files under `src/app/(tenant)/tenant/inquiries/` and `src/components/tenant/inquiries/`.

### Out of Scope

- Standalone messages inbox/detail routes
- Tenant visits page
- Favorites page and import sync

---

## T05: Build `/tenant/visits` and `/tenant/favorites` Pages With One-Time localStorage Import Flow

### Objective

Deliver tenant visits/favorites screens and wire hybrid favorites sync so localStorage favorites import once on tenant login and backend stays authoritative for tenant portal screens.

### Required Reading

- `src/app/(guard)/guard/visits/page.tsx`
- `src/components/public/listings/listings-directory.tsx`
- `src/components/public/listings/property-card.tsx`
- `src/components/public/listings/property-list-item.tsx`
- `src/lib/hooks/use-favorites.ts`
- `convex/tenantFavorites.ts` (from T03)
- `convex/visits.ts` (tenant API from T02)

### Key Rules

1. Create `src/app/(tenant)/tenant/visits/page.tsx` backed by `api.visits.getMyVisits` (tenant-scoped) with tabs for upcoming/past and inquiry linkage.
2. Create `src/app/(tenant)/tenant/favorites/page.tsx` backed by `api.tenantFavorites.list` and render listing cards with remove actions.
3. Create sync hook `src/lib/hooks/use-tenant-favorites-sync.ts` that:
   - reads localStorage key `demorentals-favorites`
   - calls `api.tenantFavorites.importFromLocalStorage` once per tenant using marker key `demorentals-favorites-imported:{tenantUserId}`
   - keeps anonymous behavior unchanged when user is unauthenticated or non-tenant
4. Sync hook must also import deprecated `tenant_profiles.saved_listings` on first load when backend favorites are empty, then merge localStorage entries with deterministic dedupe.
5. Update `src/components/public/listings/listings-directory.tsx` to dual-write for tenant users:
   - keep localStorage updates for UI parity
   - also call `tenantFavorites.add/remove` when authenticated tenant exists
6. Do not remove or rename the anonymous `useFavorites()` hook API; existing public listings flow must continue to work for non-auth users.
7. Keep tenant favorites page portal-first (do not redirect to `/listings`).

### Deliverables

- [ ] `src/app/(tenant)/tenant/visits/page.tsx` - tenant visits page
- [ ] `src/app/(tenant)/tenant/favorites/page.tsx` - tenant favorites page
- [ ] `src/lib/hooks/use-tenant-favorites-sync.ts` - one-time localStorage import + dual-sync helper
- [ ] `src/components/public/listings/listings-directory.tsx` - integrate tenant dual-write favorites behavior

### Acceptance Criteria

1. Tenant visits page displays only tenant-owned visits and supports upcoming/past segmentation.
2. Tenant favorites page displays backend-synced favorites and supports remove action.
3. First tenant load imports deprecated `saved_listings` (if present) and localStorage favorites into backend exactly once per tenant with deterministic dedupe.
4. Anonymous `/listings` favorites experience continues working without authentication.
5. Page passes visual checks at 375px, 390px, and 768px.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/tenant/visits/page.tsx`, `src/app/(tenant)/tenant/favorites/page.tsx`, `src/lib/hooks/use-tenant-favorites-sync.ts`, and `src/components/public/listings/listings-directory.tsx`.

### Out of Scope

- Messages inbox/channel routes
- Referral/tools/profile pages
- Push notifications for favorite/visit changes
