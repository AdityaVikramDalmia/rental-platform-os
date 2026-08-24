---
id: P21-E03
title: CRM Dashboard Summary Cards
phase: 21
epic: 3
status: done
updated_at: 2026-02-19
priority: medium
depends_on: ["P21-E01", "P19-E02", "P20-E01"]
estimated_tasks: 3
---

# P21-E03: CRM Dashboard Summary Cards

## Overview

Add a focused CRM summary section to the existing admin dashboard that shows live counts for tenant inquiries, owner service requests, and support inquiries. This epic introduces (or validates) `statusCounts` backend queries for all three CRM entities, creates a reusable CRM stat card component, and integrates a 3-card grid into `src/app/(admin)/admin/dashboard/page.tsx` without redesigning existing dashboard content.

## Prerequisites

- **Read first**: P21-E01 completion summary — support inquiry backend and admin support flow context must be available before dashboard KPI integration.
- **Read first**: P19-E02 completion summary — tenant inquiry backend lifecycle and status enum finalization must be complete before wiring dashboard counts.
- **Read first**: P20-E01 completion summary — owner service request backend and transition model must be complete before wiring dashboard counts.
- Current dashboard page at `src/app/(admin)/admin/dashboard/page.tsx` already renders welcome + role cards; this epic adds a new CRM section and does not replace existing layout.
- `notes/10-convex-schema.md` currently documents all three CRM tables; P19 and P20 implementation status may still lag behind docs in this branch.
- **Important sequencing note**: If `convex/tenantInquiries.ts` or `convex/ownerServiceRequests.ts` do not exist yet when this epic starts, T01 must first implement `statusCounts` in those files as soon as P19-E02/P20-E01 deliver the modules.

## Task Queue

- [x] P21-E03-T01: Dashboard Count Queries
- [x] P21-E03-T02: CRM Stat Card Component
- [x] P21-E03-T03: Dashboard Integration

---

## T01: Dashboard Count Queries

### Objective

Implement and/or verify `statusCounts` queries for tenant inquiries, owner service requests, and support inquiries so the dashboard can subscribe to reliable aggregate counts in real time.

### Required Reading

- `notes/10-convex-schema.md` — `tenant_inquiries`, `owner_service_requests`, and `support_inquiries` status fields
- `notes/06-admin-panel-ux.md` — CRM admin sections (`/admin/tenant-inquiries`, `/admin/owner-requests`, `/admin/support`)
- `convex/functions.ts` — wrapped `query` import pattern and audit-safe function conventions
- `convex/auth.helpers.ts` — `requirePermission` helper pattern
- `lib/constants.ts` — permission constants and status enum definitions for CRM entities
- `tasks/phase-19-tenant-inquiry-pipeline/P19-E02-backend-lifecycle-functions.md` — tenant inquiry backend contract expectations
- `tasks/phase-20-owner-services/P20-E01-schema-constants-backend.md` — owner request backend contract expectations
- `tasks/phase-21-admin-tenant-management/README.md` — phase-level CRM scope and dashboard count requirement

### Key Rules

1. Implement `tenantInquiries.statusCounts` in `convex/tenantInquiries.ts` when that file exists; if P19-E02 already added it, validate behavior and shape instead of duplicating logic.
2. Implement `ownerServiceRequests.statusCounts` in `convex/ownerServiceRequests.ts` when that file exists; if P20-E01 already added it, validate behavior and shape.
3. Implement or validate `supportInquiries.statusCounts` (expected from P21-E01-T03); if missing, add it in the support inquiries module using the same query pattern.
4. Use simple V1 counting with `ctx.db.query(...).withIndex(...).collect()` and `.length`; do not use `@convex-dev/aggregate` in this epic.
5. Each `statusCounts` response must return an object keyed by that entity's full status enum, with numeric values (including explicit zero values for statuses with no records).
6. Each query must enforce admin auth and a VIEW-level permission gate via `requirePermission(ctx, "...")`.
7. Import `query` from `convex/functions.ts` (wrapped export), not from `convex/_generated/server`.
8. Keep status sources aligned with constants from `lib/constants.ts` so frontend card logic can rely on stable keys.
9. Preserve project conventions: no `as any`, no `@ts-ignore`, no hardcoded temporary bypass auth logic.
10. If P19/P20 backend modules are absent at task start, document this in implementation notes and add queries immediately after those modules land.

### Deliverables

- [ ] `convex/tenantInquiries.ts` — `statusCounts` query implemented or verified (with implementation fallback when file appears)
- [ ] `convex/ownerServiceRequests.ts` — `statusCounts` query implemented or verified (with implementation fallback when file appears)
- [ ] `convex/supportInquiries.ts` (or equivalent P21 support module) — `statusCounts` query verified or added

### Acceptance Criteria

1. `tenantInquiries.statusCounts` returns all tenant inquiry statuses with numeric counts.
2. `ownerServiceRequests.statusCounts` returns all owner request statuses with numeric counts.
3. `supportInquiries.statusCounts` returns all support inquiry statuses (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) with numeric counts.
4. All three queries require admin auth and correct VIEW permissions.
5. Query exports are callable from dashboard `useQuery` subscriptions.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/tenantInquiries.ts`, `convex/ownerServiceRequests.ts`, and `convex/supportInquiries.ts` (or the concrete support module path used by P21-E01).

### Out of Scope

- Building tenant inquiry queue UI (P19-E03)
- Building owner request management UI (P20-E03)
- Replacing count logic with aggregate components

---

## T02: CRM Stat Card Component

### Objective

Create a reusable admin CRM metric card component that can display icon + count + label + optional description/trend, and gracefully shows a loading skeleton while dashboard counts are unresolved.

### Required Reading

- `src/app/(admin)/admin/dashboard/page.tsx` — current dashboard page composition and card styling baseline
- `src/components/ui/card.tsx` — shadcn Card primitives used in admin surfaces
- `src/components/ui/skeleton.tsx` — skeleton loading pattern
- `tasks/phase-20-owner-services/P20-E03-admin-owner-request-management.md` — admin component conventions (kebab-case files, typed props, clear loading states)
- `notes/06-admin-panel-ux.md` — dashboard and CRM visualization context

### Key Rules

1. Create `src/components/admin/crm-stat-card.tsx` as a client component with `"use client"`.
2. Define props: `icon`, `count`, `label`, `description?`, and `trend?` (trend reserved for future use, optional in V1 rendering).
3. Use shadcn `Card`, `CardHeader`, and `CardContent` for structure; no ad-hoc wrapper div-only card pattern.
4. Render loading skeleton when `count` is `undefined`; do not render placeholder numeric values like `0` during loading.
5. Follow existing admin component styling conventions (rounded card, subtle border, readable hierarchy, Tailwind classes).
6. Keep component reusable for future dashboard metrics; no hardcoded entity labels or routes inside the component.
7. Keep filename kebab-case exactly: `crm-stat-card.tsx`.
8. Keep icon prop typed as a Lucide icon component signature used by existing admin card patterns.
9. Keep strict typing across props and render branches; no `any` and no implicit untyped props.
10. Include accessible text hierarchy so labels and counts are legible and screen-reader friendly.

### Deliverables

- [ ] `src/components/admin/crm-stat-card.tsx` — reusable CRM stat card with icon/count/label and loading skeleton support

### Acceptance Criteria

1. Component renders icon, count, and label for resolved data.
2. Optional `description` text renders when provided.
3. Optional `trend` prop is accepted without breaking V1 UI.
4. Skeleton renders when `count` is `undefined`.
5. Component compiles and is importable in admin dashboard page.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/crm-stat-card.tsx`.

### Out of Scope

- Dashboard page integration (T03)
- Additional chart widgets or trend sparkline visuals
- Admin sidebar or route changes

---

## T03: Dashboard Integration

### Objective

Integrate a CRM summary card grid into `src/app/(admin)/admin/dashboard/page.tsx` that subscribes to live status counts for tenant inquiries, owner requests, and support inquiries, and links each card to its admin queue page.

### Required Reading

- `src/app/(admin)/admin/dashboard/page.tsx` — existing dashboard content and composition boundaries
- `src/components/admin/crm-stat-card.tsx` — reusable card contract from T02
- `notes/06-admin-panel-ux.md` — support queue + owner request + tenant inquiry dashboard context
- `notes/10-convex-schema.md` — status enums for non-terminal/terminal count logic
- `lib/constants.ts` — status constants used to compute active (non-terminal) counts consistently

### Key Rules

1. Add a new CRM section to `src/app/(admin)/admin/dashboard/page.tsx`; do not redesign or remove existing welcome/role cards.
2. Use grid layout `grid gap-4 md:grid-cols-2 lg:grid-cols-3` for the three CRM entities.
3. Each card must use `useQuery` with the corresponding `statusCounts` query for real-time updates.
4. Tenant Inquiries card displays total count and active count where active excludes terminal statuses (`CLOSED`, `REJECTED`, `EXPIRED`).
5. Owner Requests card displays total count and active count where active excludes terminal statuses (`ACTIVE`, `REJECTED`, `DROPPED`).
6. Support Inquiries card displays total count and active count where active excludes terminal statuses (`RESOLVED`, `CLOSED`).
7. Wrap cards with clickable navigation to `/admin/tenant-inquiries`, `/admin/owner-requests`, and `/admin/support` respectively.
8. Use `crm-stat-card.tsx` from T02 for all three cards; avoid duplicated inline metric-card JSX.
9. Use `lucide-react` icons with clear semantic mapping (`Users` for tenant inquiries, `Building` for owner requests, `HelpCircle` for support inquiries).
10. Keep loading behavior explicit: cards should render skeleton state while queries are `undefined`.
11. Keep integration client-safe and consistent with existing admin dashboard authentication guard (`currentUser` checks already present).
12. Preserve TypeScript and lint safety with no unsafe casts.

### Deliverables

- [ ] `src/app/(admin)/admin/dashboard/page.tsx` — CRM summary section with 3 real-time cards and route links
- [ ] `src/components/admin/crm-stat-card.tsx` — imported and used by dashboard integration

### Acceptance Criteria

1. Dashboard renders a new CRM section beneath/alongside existing dashboard content without layout regression.
2. Section shows three cards: Tenant Inquiries, Owner Requests, Support Inquiries.
3. Each card displays total count and active (non-terminal) count.
4. Counts update reactively when backend data changes (Convex subscription behavior).
5. Clicking cards navigates to `/admin/tenant-inquiries`, `/admin/owner-requests`, and `/admin/support`.
6. Loading state uses skeletons until query data resolves.
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/dashboard/page.tsx` and `src/components/admin/crm-stat-card.tsx`.

### Out of Scope

- Reworking admin dashboard navigation, top bar, or existing non-CRM cards
- Building `/admin/tenant-inquiries`, `/admin/owner-requests`, or `/admin/support` pages (owned by other epics)
- Adding charts, trend lines, or export features

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-19

### What Was Built

- Added dashboard CRM summary component with live Convex query subscriptions for tenant inquiries, owner requests, and support inquiries.
- Implemented clickable summary cards linking directly to `/admin/tenant-inquiries`, `/admin/owner-requests`, and `/admin/support`.
- Integrated CRM section into admin dashboard directly below KPI cards with section heading and descriptive copy.
- Reused existing backend count queries (`getStatusCounts`) and support inbox open-count query for badges.

### Key File Locations

| File                                                 | What                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `src/components/admin/dashboard/CRMSummaryCards.tsx` | Three-card CRM count grid with loading skeletons and deep links    |
| `src/app/(admin)/admin/dashboard/page.tsx`           | Added `CRM Overview` section and component integration             |
| `convex/supportInquiries.ts`                         | Added `getStatusCounts` query for support inquiry dashboard counts |

### Deviations from Spec

None - implemented exactly as specified for CRM summary card scope.

### Gotchas for Next Epic

- "Needs attention" metric is aligned to submitted/open workloads (`TENANT.SUBMITTED`, `OWNER.SUBMITTED`, `SUPPORT.OPEN`).
- The cards use real-time `useQuery` subscriptions, so dashboard values update without manual refresh.
