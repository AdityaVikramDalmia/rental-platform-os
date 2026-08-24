---
id: P38-E01
title: Shared Portal Foundation
phase: 38
status: pending
depends_on: []
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P38-E01: Shared Portal Foundation

## Overview

Build a reusable mobile-first portal layout system for owner and future tenant experiences without touching existing admin/guard/ops layouts. This epic introduces config-driven navigation, shared shell primitives, and owner layout delegation to a new `PortalShell` architecture.

## Prerequisites

- Keep `src/app/(guard)/guard-layout-client.tsx` and `src/app/(ops)/ops-layout-client.tsx` unchanged; use them as reference implementations only.
- Keep `src/components/admin/admin-nav-items.ts` unchanged; its config pattern is reference input for owner/tenant nav definitions.
- Current owner auth/redirect checks in `src/app/(owner)/layout.tsx` must be preserved when migrating to shared shell composition.

## Task Queue

- [ ] P38-E01-T01: Create config-driven owner/tenant navigation contracts
- [ ] P38-E01-T02: Build shared `PortalHeader` component
- [ ] P38-E01-T03: Build shared `MobileNav` with More-sheet secondary navigation
- [ ] P38-E01-T04: Build `PortalShell` and migrate owner layout to delegate into it

---

## T01: Create Config-Driven Owner/Tenant Navigation Contracts

### Objective

Define typed, centralized portal navigation configuration so owner and tenant portals can render the same shell primitives with portal-specific nav items, labels, and icon metadata.

### Required Reading

- `src/components/admin/admin-nav-items.ts` - config-driven nav structure and permission-oriented item metadata
- `src/app/(guard)/guard-layout-client.tsx` - bottom nav active-state + badge implementation pattern
- `src/app/(ops)/ops-layout-client.tsx` - 5-item mobile nav and More-item precedent
- `src/app/(owner)/layout.tsx` - existing owner route/auth wrapper constraints
- `lib/constants.ts` - `USER_TYPE` and status constants used for portal-safe routing

### Key Rules

1. Create `src/config/navigation.ts` with explicit type contracts:
   - `PortalId = "owner" | "tenant"`
   - `PortalNavItem` with fields: `id`, `label`, `href`, `icon`, `isPrimary`, and `matchPaths`
   - `PortalNavigationConfig` with fields: `portalId`, `primaryItems`, `moreItems`, and `title`
2. Add owner primary nav config exactly as:
   - Dashboard -> `/owner/dashboard`
   - Properties -> `/owner/properties`
   - Earnings -> `/owner/earnings`
   - Messages -> `/owner/messages`
   - More -> `/owner/more` (sheet trigger route key, not a full page requirement)
3. Add owner More-sheet items exactly as:
   - Leads -> `/owner/leads`
   - Referrals -> `/owner/referrals`
   - Requests -> `/owner/service-requests`
   - Documents -> `/owner/documents`
   - Profile -> `/owner/profile`
4. Include tenant config object in the same file (future-facing), but do not create tenant routes in this epic.
5. Export helper utilities used by shared shell components:
   - `getPortalConfig(portalId)`
   - `isPortalNavActive(pathname, navItem)` using `matchPaths`
6. Do not add permission logic in this file; this config is presentation/routing metadata only.

### Deliverables

- [ ] `src/config/navigation.ts` - typed portal navigation contracts and owner/tenant nav definitions

### Acceptance Criteria

1. Navigation metadata for owner portal exists in one config file and includes 9 concrete routes (4 primary + 5 More-menu) plus a `More` trigger nav entry.
2. Config exports helper utilities for active-state computation and portal config retrieval.
3. No existing guard/ops/admin nav files are modified.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` reports no errors on `src/config/navigation.ts`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/config/navigation.ts`.

### Out of Scope

- Rendering any new portal UI components
- Owner layout migration
- Tenant route creation

---

## T02: Build Shared `PortalHeader` Component

### Objective

Implement a reusable sticky header component for mobile-first portals that supports portal branding, user identity text, and optional right-side actions (notification bell placeholder).

### Required Reading

- `src/app/(guard)/guard-layout-client.tsx` - sticky header structure and max-width container behavior
- `src/app/(ops)/ops-layout-client.tsx` - compact header spacing and live badge placement pattern
- `src/components/ui/button.tsx` - action button style conventions
- `src/app/(owner)/layout.tsx` - owner portal title/branding baseline to preserve

### Key Rules

1. Create `src/components/layout/PortalHeader.tsx` with explicit props interface:
   - `portalLabel: string`
   - `brandLabel: string`
   - `accentClassName?: string`
   - `userName?: string`
   - `rightSlot?: React.ReactNode`
2. Header must be sticky (`top-0`) with frosted background (`bg-white/95 backdrop-blur`) and border-bottom.
3. Header content width must align with mobile shell container (`max-w-md mx-auto`).
4. Component must support owner branding style (indigo/violet accent) via `accentClassName` without hardcoding owner-only classes.
5. Keep right slot optional and action-agnostic (notification icon wiring is a later epic concern).

### Deliverables

- [ ] `src/components/layout/PortalHeader.tsx` - shared sticky header component for owner/tenant shells

### Acceptance Criteria

1. `PortalHeader` is reusable and does not reference owner-specific constants directly.
2. Header supports optional right-side action slot and optional user name rendering.
3. Header renders as sticky with `top-0`, `max-w-md mx-auto`, and no horizontal overflow at 375px viewport width.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` reports no errors on `src/components/layout/PortalHeader.tsx`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/layout/PortalHeader.tsx`.

### Out of Scope

- Bottom navigation implementation
- Owner auth logic changes
- Owner dashboard content

---

## T03: Build Shared `MobileNav` with More-Sheet Secondary Navigation

### Objective

Implement a reusable frosted bottom nav that renders exactly 5 primary items and supports a shadcn `Sheet` for secondary (More) routes.

### Required Reading

- `src/app/(guard)/guard-layout-client.tsx` - bottom nav safe-area, active styles, and item composition
- `src/app/(ops)/ops-layout-client.tsx` - 5-column nav and More item behavior
- `src/components/ui/sheet.tsx` - required sheet primitives for More drawer
- `src/config/navigation.ts` - nav config created in T01

### Key Rules

1. Create `src/components/layout/MobileNav.tsx` with typed props:
   - `primaryItems: PortalNavItem[]`
   - `moreItems: PortalNavItem[]`
   - `pathname: string`
   - `onNavigate?: () => void`
2. Primary nav render contract is strict: exactly 5 visual slots, with the 5th slot as More trigger when `moreItems.length > 0`.
3. More-sheet must use `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from shadcn and list secondary links with icon + label.
4. Nav must include `pb-safe`, frosted background, and mobile touch target minimum matching existing guard/ops patterns.
5. Active-state logic must support nested routes via `matchPaths` from nav config helpers.
6. Do not hardcode owner labels in this component; all labels/routes come from props.

### Deliverables

- [ ] `src/components/layout/MobileNav.tsx` - shared bottom nav with More sheet for secondary routes

### Acceptance Criteria

1. Bottom nav renders 5 primary items and opens sheet for secondary items.
2. Active state correctly highlights primary item for nested owner routes.
3. More-sheet displays all secondary links from config and supports navigation.
4. Nav root uses a frosted container (`backdrop-blur` + translucent background), includes safe-area bottom padding, and each nav item has >=44px touch target.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/layout/MobileNav.tsx`.

### Out of Scope

- Owner dashboard page implementation
- Callback/auth redirect logic
- Chat-specific badge counters

---

## T04: Build `PortalShell` and Migrate Owner Layout to Delegate Into It

### Objective

Create the shared shell orchestrator and migrate owner route-group layout to use it while preserving existing auth enforcement and role redirection behavior.

### Required Reading

- `src/app/(owner)/layout.tsx` - existing owner auth checks and redirect matrix
- `src/app/(guard)/layout.tsx` - server layout wrapping + client inner-shell delegation pattern
- `src/app/(ops)/layout.tsx` - server layout with dedicated client inner shell
- `src/components/shared/ConvexClientProvider.tsx` - owner layout provider composition baseline
- `src/config/navigation.ts` - owner navigation config from T01

### Key Rules

1. Create `src/components/layout/PortalShell.tsx` that composes `PortalHeader` + `<main>` + `MobileNav`.
2. `PortalShell` props interface must include:
   - `portalId: "owner" | "tenant"`
   - `portalLabel: string`
   - `brandLabel?: string`
   - `userName?: string`
   - `pathname: string`
   - `children: React.ReactNode`
3. Create `src/app/(owner)/owner-layout-client.tsx` (client component) that:
   - fetches `api.users.getCurrentUser`
   - enforces owner-type and active-status checks in client guard
   - delegates rendering to `PortalShell` with owner nav config
4. Update `src/app/(owner)/layout.tsx` to keep server auth checks (`withAuth` + `fetchQuery`) but render the new owner client shell component instead of inline header/main markup.
5. Preserve existing role redirects from owner layout (GUARD -> `/guard/dashboard`, OPS -> `/admin/dashboard`, ADMIN -> `/admin/dashboard`).
6. Keep owner portal container mobile-first (`max-w-md`, `pb-28`) and owner accent palette direction (indigo/violet) through shell props/classes.

### Deliverables

- [ ] `src/components/layout/PortalShell.tsx` - shared portal shell orchestrator
- [ ] `src/app/(owner)/owner-layout-client.tsx` - owner client auth shell that uses `PortalShell`
- [ ] `src/app/(owner)/layout.tsx` - server layout refactored to delegate UI to `owner-layout-client`

### Acceptance Criteria

1. Owner layout renders through `PortalShell` and keeps existing auth/redirect semantics.
2. Owner shell uses config-driven nav data from `src/config/navigation.ts`.
3. Existing owner route (`/owner/status`) continues to render inside the new shell without path breakage.
4. Existing admin/guard/ops layouts remain untouched.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/layout/PortalShell.tsx`, `src/app/(owner)/owner-layout-client.tsx`, and `src/app/(owner)/layout.tsx`.

### Out of Scope

- Owner dashboard data widgets
- Owner messages/chat pages
- Tenant route-group rollout
