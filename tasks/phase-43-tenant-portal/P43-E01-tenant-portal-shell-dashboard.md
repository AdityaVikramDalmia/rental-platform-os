---
id: P43-E01
title: Tenant Portal Shell & Dashboard
phase: 43
status: pending
depends_on: ["P38-E01", "P38-E02", "P34", "P35"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P43-E01: Tenant Portal Shell & Dashboard

## Overview

Establish the tenant portal foundation under `/tenant/*` by wiring auth-safe route group layout, shared mobile shell integration, centralized tenant nav configuration (`Dashboard`, `Inquiries`, `Favorites`, `Messages`, `More`) from `src/config/navigation.ts`, and a summary dashboard experience. This epic does not rebuild shared primitives from P38; it composes them with shared configuration and tenant-specific data.

## Documentation Alignment (Mandatory)

- Follow P43 feature-spec "Offline & Error States" for Dashboard: cached fallback with "Last updated X ago" and retry handling.
- Follow P43 feature-spec "Loading Skeleton Specs" for Dashboard: 4 KPI skeletons + 3 list-item skeletons with shadcn `<Skeleton>` and `animate-pulse`.
- Emit analytics event `tenant.dashboard_viewed` on dashboard page load with `{tenantId}`.

## Prerequisites

- P38-E01 must already provide shared shell primitives (`PortalShell`, `MobileNav`, `PortalHeader`) and their stable prop contracts.
- P38-E02 must already provide `/post-auth` role resolver that routes `TENANT` to `/tenant/dashboard`.
- `requireTenant()` must exist in `convex/auth.helpers.ts`.
- Existing mobile layout references are `src/app/(guard)/guard-layout-client.tsx` and `src/app/(ops)/ops-layout-client.tsx`.

## Task Queue

- [x] P43-E01-T01: Create tenant route group layout and auth-gated layout client
- [x] P43-E01-T02: Wire tenant navigation using centralized `getPortalConfig("tenant")` and More-sheet actions
- [x] P43-E01-T03: Implement tenant dashboard backend summary query (`tenantDashboard.getSummary`)
- [x] P43-E01-T04: Build `/tenant/dashboard` UI with KPI cards, upcoming visits, and recent activity

---

## Epic Verification (Mandatory)

- Verify tenant-scoped dashboard/layout isolation: tenant A cannot retrieve tenant B dashboard summary via direct query manipulation.
- Verify mobile visual checks at 375px, 390px, and 768px.

---

## T01: Create Tenant Route Group Layout and Auth-Gated Layout Client

### Objective

Create `(tenant)` layout scaffolding so all `/tenant/*` pages share one mobile-first shell container, authenticated tenant checks, and safe redirects for non-tenant users.

### Required Reading

- `src/app/(guard)/layout.tsx`
- `src/app/(guard)/guard-layout-client.tsx`
- `src/app/(ops)/layout.tsx`
- `src/app/(ops)/ops-layout-client.tsx`
- `src/app/(owner)/layout.tsx`
- `src/proxy.ts`
- `convex/auth.helpers.ts`
- `convex/users.ts`
- `notes/11-convex-architecture.md` (Auth helper usage)

### Key Rules

1. Create `src/app/(tenant)/layout.tsx` as a server layout using `withAuth()` and `ConvexClientProvider`, matching the server/layout pattern used by `src/app/(guard)/layout.tsx` and `src/app/(ops)/layout.tsx`.
2. Create `src/app/(tenant)/tenant-layout-client.tsx` as a client layout wrapper component named `TenantLayoutInner`.
3. `TenantLayoutInner` must call `api.users.getCurrentUser` and enforce:
   - unauthenticated -> `router.replace("/post-auth")`
   - authenticated but non-tenant -> `router.replace("/post-auth")`
   - tenant with non-`ACTIVE` status -> show explicit blocked-state card with support text
4. Keep mobile container constraints consistent with other mobile portals: `max-w-md`, `pb-28`, safe-area bottom spacing.
5. Preserve role-based redirects through `/post-auth`; do not hardcode redirects to `/admin/login` from tenant shell.
6. Do not duplicate shared shell implementation details from P38; layout must compose shared primitives and tenant config only.

### Deliverables

- [ ] `src/app/(tenant)/layout.tsx` - tenant route-group server layout with WorkOS + Convex provider wiring
- [ ] `src/app/(tenant)/tenant-layout-client.tsx` - auth-gated tenant layout client component (`TenantLayoutInner`)

### Acceptance Criteria

1. Navigating to `/tenant/dashboard` as a tenant renders children in tenant layout.
2. Non-tenant users hitting `/tenant/*` are redirected to `/post-auth`.
3. Layout composes shared shell primitives and does not reimplement global shell internals.
4. Mobile layout spacing does not overlap bottom nav (content is visible above nav and safe-area padding).
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/layout.tsx` and `src/app/(tenant)/tenant-layout-client.tsx`.

### Out of Scope

- Dashboard content widgets
- Inquiry/visit/favorites/messages/referrals/tools/profile pages
- Backend data query implementation

---

## T02: Define Tenant Navigation Model With 5 Primary Items and More-Sheet Actions

### Objective

Implement tenant nav and More-sheet behavior exactly as specified by reusing centralized P38 navigation contracts: 5 bottom-nav primary actions and 4 secondary actions in the More sheet.

### Required Reading

- `src/app/(guard)/guard-layout-client.tsx`
- `src/app/(ops)/ops-layout-client.tsx`
- `src/config/navigation.ts`
- `src/components/ui/sheet.tsx`
- `src/components/ui/button.tsx`
- `notes/features/11-tenant-browse.md`
- `notes/06-admin-panel-ux.md` (for clean SaaS visual direction)

### Key Rules

1. Use centralized nav config from `src/config/navigation.ts` via `getPortalConfig("tenant")`; do not add tenant-local nav config files.
2. Ensure centralized config exposes required entries:
   - primary: `/tenant/dashboard`, `/tenant/inquiries`, `/tenant/favorites`, `/tenant/messages`, `more`
   - secondary (More sheet): `/tenant/visits`, `/tenant/referrals`, `/tenant/tools`, `/tenant/profile`
3. Implement More-sheet UI component at `src/components/tenant/tenant-more-sheet.tsx` and wire it to the `More` primary item.
4. Primary nav must remain exactly 5 slots in order: `Dashboard`, `Inquiries`, `Favorites`, `Messages`, `More`.
5. More-sheet items must remain exactly: `Visits`, `Referrals`, `Tools`, `Profile`; tapping an item closes sheet and navigates.
6. Use frosted-glass bottom nav styling (`bg-white/95` + `backdrop-blur`) and a tenant visual accent direction (teal/cyan family), while preserving existing utility-class conventions.
7. Keep touch targets minimum 44x44 and include active-route state for nested paths (`pathname.startsWith`).

### Deliverables

- [ ] `src/config/navigation.ts` - tenant portal nav config wired through `getPortalConfig("tenant")` (if missing or incomplete)
- [ ] `src/components/tenant/tenant-more-sheet.tsx` - tenant More-sheet component for secondary routes
- [ ] `src/app/(tenant)/tenant-layout-client.tsx` - updated to consume nav config and More-sheet interactions

### Acceptance Criteria

1. Bottom nav displays exactly 5 primary items in the required order.
2. Tapping `More` opens a sheet with exactly 4 secondary links.
3. Active styling works on both direct and nested routes.
4. Mobile hit targets are accessible and no nav item is clipped on small screens.
5. Tenant shell reads nav from `getPortalConfig("tenant")` and no duplicate tenant nav config file exists.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/config/navigation.ts`, `src/components/tenant/tenant-more-sheet.tsx`, and `src/app/(tenant)/tenant-layout-client.tsx`.

### Out of Scope

- Any dashboard data fetching
- Message unread badges
- Inquiry/visits/referrals/tools/profile screen content

---

## T03: Implement Tenant Dashboard Backend Summary Query (`tenantDashboard.getSummary`)

### Objective

Create a dedicated tenant dashboard query that aggregates counts and recent activity needed by `/tenant/dashboard` without forcing client-side fan-out queries.

### Required Reading

- `convex/tenantInquiries.ts`
- `convex/visits.ts`
- `convex/chatChannels.ts`
- `convex/chatReadReceipts.ts`
- `convex/auth.helpers.ts`
- `convex/functions.ts`
- `convex/schema.ts`
- `notes/10-convex-schema.md`
- `notes/11-convex-architecture.md`

### Key Rules

1. Create `convex/tenantDashboard.ts` with query `getSummary` guarded by `requireTenant(ctx)`.
2. `getSummary` response contract must be explicit and stable:
   ```ts
   {
     inquiry_counts: Record<string, number>;
     open_inquiries_count: number;
     upcoming_visits_count: number;
     upcoming_visits: Array<{
       visit_id: Id<"visits">;
       listing_title: string;
       scheduled_date: number;
       status: string;
     }>; // max 5 rows
     favorites_count: number;
     unread_messages_count: number;
     recent_activity: Array<{
       activity_type: "INQUIRY" | "VISIT" | "FAVORITE" | "CHAT";
       label: string;
       timestamp: number;
       href: string;
     }>;
   }
   ```
3. Query must compute inquiry counts from tenant-owned `tenant_inquiries` only; never expose another tenant's data.
4. Use `tenant_favorites` table for `favorites_count` (do not read `tenant_profiles.saved_listings` for this summary).
5. `upcoming_visits_count` must include only non-terminal visits linked to tenant-owned inquiries with `scheduled_start >= Date.now()`.
6. `upcoming_visits` must return at most 5 rows sorted by `scheduled_date` ascending.
7. `unread_messages_count` must aggregate unread counts across tenant-accessible channels.
8. Keep all timestamps in Unix ms and all money fields (if later added) in paise.

### Deliverables

- [ ] `convex/tenantDashboard.ts` - tenant dashboard aggregate query module

### Acceptance Criteria

1. `api.tenantDashboard.getSummary` exists and is tenant-auth guarded.
2. Returned summary object matches the specified contract and uses only tenant-owned records.
3. Recent activity entries include valid portal links (`/tenant/...`) and descending time order.
4. Query handles empty-state tenants (all zero counts, empty activity array, empty `upcoming_visits`) without throwing.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/tenantDashboard.ts`.

### Out of Scope

- Dashboard UI rendering
- Inquiry detail APIs
- Favorites CRUD APIs

---

## T04: Build `/tenant/dashboard` UI With KPI Cards, Upcoming Visits, and Recent Activity

### Objective

Implement the tenant dashboard page that consumes `tenantDashboard.getSummary` and provides fast navigation into core tenant workflows.

### Required Reading

- `src/app/(guard)/guard/dashboard/page.tsx`
- `src/app/(ops)/ops/dashboard/page.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/skeleton.tsx`
- `convex/tenantDashboard.ts` (from T03)
- `notes/features/13-tenant-inquiry.md`

### Key Rules

1. Create `src/app/(tenant)/tenant/dashboard/page.tsx` as a client page using `useQuery(api.tenantDashboard.getSummary)`.
2. Create reusable dashboard blocks under `src/components/tenant/dashboard/`:
   - `tenant-kpi-cards.tsx`
   - `tenant-upcoming-visits-card.tsx`
   - `tenant-activity-feed.tsx`
3. KPI cards must include at minimum: `Open Inquiries`, `Upcoming Visits`, `Saved Favorites`, `Unread Messages`.
4. Each card must deep-link to tenant routes (`/tenant/inquiries`, `/tenant/visits`, `/tenant/favorites`, `/tenant/messages`).
5. Upcoming visits widget must render `upcoming_visits` rows from `tenantDashboard.getSummary` (max 5).
6. Keep visual style mobile-first and business-grade (card clarity, concise labels, no consumer-style clutter).
7. Include loading skeletons and empty states for each section (not only a full-page spinner).
8. Main content must respect shell spacing: no overlap with sticky header or bottom nav.

### Deliverables

- [ ] `src/app/(tenant)/tenant/dashboard/page.tsx` - tenant dashboard page
- [ ] `src/components/tenant/dashboard/tenant-kpi-cards.tsx` - summary KPI card strip
- [ ] `src/components/tenant/dashboard/tenant-upcoming-visits-card.tsx` - upcoming visits widget
- [ ] `src/components/tenant/dashboard/tenant-activity-feed.tsx` - recent activity list widget

### Acceptance Criteria

1. Dashboard renders summary cards and activity widgets using `tenantDashboard.getSummary`.
2. Each KPI card route target is correct and clickable.
3. Loading and empty states render without layout shift or overflow issues.
4. Page passes visual checks at 375px, 390px, and 768px without clipped actions.
5. Keyboard focus states are visible and icon-only controls include accessible labels.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/tenant/dashboard/page.tsx` and all files under `src/components/tenant/dashboard/`.

### Out of Scope

- Inquiry list/detail pages
- Favorites sync/import flow
- Messages inbox/chat views
- Referrals/tools/profile pages
