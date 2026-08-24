---
id: P29-E01
title: SLA Timers + Aging Alerts
phase: 29
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P29-E01: SLA Timers + Aging Alerts

## Overview

Add SLA (Service Level Agreement) tracking to the three most time-sensitive workflows: lead verification, visit scheduling, and payout processing. SLA status is computed on-the-fly from existing timestamps — no new tables. The ops manager sees a countdown timer on every relevant entity and gets a breach summary on the dashboard.

### Indexes Required

- Uses existing index: `audit_logs.by_entity` for entity-level SLA start lookup when needed.
- Uses existing index: `leads.by_status` for SUBMITTED/NEED_INFO lead SLA breach counts.
- Uses existing index: `payouts.by_status` for `pending` payout SLA breach counts.
- No new indexes required in this epic.

## Task Queue

- [x] P29-E01-T01: SLA Policy Constants
- [x] P29-E01-T02: Backend SLA Computation Query
- [x] P29-E01-T03: SLABadge Frontend Component
- [x] P29-E01-T04: Dashboard SLA Breach Summary

---

## T01: SLA Policy Constants

### Objective

Define SLA policies, types, and thresholds in `lib/constants.ts` so every part of the codebase references a single source of truth. No computation here — just type definitions and policy objects.

### Required Reading

- `lib/constants.ts` — full file (understand existing enum patterns, how constants are exported, naming conventions)
- `notes/13-constants-reference.md` — full file (understand what's already defined, avoid naming collisions)
- `notes/04-state-machines.md` — lead, visit, and payout status sections (understand which statuses trigger SLA clocks)

### Key Rules

1. Add all new exports at the bottom of `lib/constants.ts` after existing exports. Do NOT reorganize the file.
2. `SLAStatus` is a TypeScript `const` object (same pattern as existing enums in the file): `export const SLA_STATUS = { ON_TRACK: "ON_TRACK", WARNING: "WARNING", BREACHED: "BREACHED" } as const;` then `export type SLAStatus = (typeof SLA_STATUS)[keyof typeof SLA_STATUS];`
3. `SLAPolicy` type: `{ entity: "lead" | "visit" | "payout"; label: string; windowMs: number; warningThreshold: number; }` where `warningThreshold` is a fraction (0.75 = 75% elapsed triggers WARNING).
4. SLA windows in milliseconds (use named constants for readability):
   - Lead verification: 24 hours from SUBMITTED status (`24 * 60 * 60 * 1000`)
   - Visit scheduling: 48 hours from VERIFIED lead status (`48 * 60 * 60 * 1000`)
   - Payout processing: 5 business days from closure CONFIRMED — approximate as 5 _ 24 hours (`5 _ 24 _ 60 _ 60 \* 1000`). Note: business day calculation is out of scope; use calendar days.
5. Export a `SLA_POLICIES` record keyed by entity type: `export const SLA_POLICIES: Record<"lead" | "visit" | "payout", SLAPolicy>`.
6. Warning threshold is 0.75 for all three policies (75% of window elapsed = WARNING).
7. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `lib/constants.ts` — `SLA_STATUS` const object, `SLAStatus` type, `SLAPolicy` type, `SLA_POLICIES` record (appended at bottom of file)

### Acceptance Criteria

1. `SLA_STATUS` has exactly 3 values: `ON_TRACK`, `WARNING`, `BREACHED`
2. `SLAPolicy` type has all 4 fields: `entity`, `label`, `windowMs`, `warningThreshold`
3. `SLA_POLICIES` has entries for `"lead"`, `"visit"`, and `"payout"`
4. Lead window = 86400000 ms (24h), visit window = 172800000 ms (48h), payout window = 432000000 ms (5 \* 24h)
5. All three policies have `warningThreshold: 0.75`
6. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/constants.ts`.

### Out of Scope

- Business day calculation for payout SLA (use calendar days)
- Configurable SLA windows via `system_config` (V2)
- SLA policies for other entity types (support inquiries, tenant inquiries — V2)

---

## T02: Backend SLA Computation Query

### Objective

Create `convex/sla.ts` with a `getSLAStatus` query that accepts a list of entity IDs and their type, then returns computed SLA status for each. Pure computation from existing data — reads `audit_logs` to find when each entity entered its SLA-triggering status, then computes elapsed time and status.

### Required Reading

- `convex/auditLogs.ts` — full file (understand the `list` and `getByEntity` query signatures, what fields are available: `entity_type`, `entity_id`, `action`, `_creationTime`)
- `convex/analytics.ts` — full file (understand the query pattern: `requirePermission`, `ctx.db.query`, index usage)
- `convex/functions.ts` — top of file (understand the `query` import — use `query` from `./functions`, NOT from `_generated/server`)
- `lib/constants.ts` — `SLA_POLICIES`, `SLA_STATUS`, `SLAStatus` (from T01)
- `notes/10-convex-schema.md` — `audit_logs` table schema (fields: `entity_type`, `entity_id`, `action`, `actor_user_id`, `_creationTime`)

### Key Rules

1. Import `query` from `"./functions"`, NOT from `"./_generated/server"`.
2. Import `requirePermission` from `"./auth.helpers"`. Use permission `"analytics.view"` — this is a read-only intelligence query.
3. Function signature:
   ```typescript
   export const getSLAStatus = query({
     args: {
       entity_type: v.union(v.literal("lead"), v.literal("visit"), v.literal("payout")),
       entity_ids: v.array(v.string()),
     },
     handler: async (ctx, args) => { ... }
   });
   ```
4. Return type per entity: `{ entity_id: string; sla_status: SLAStatus; time_elapsed_ms: number; time_remaining_ms: number; breach_time: number; }[]`
5. SLA start time logic per entity type:
   - **lead**: find the audit log entry where `action === "LEADS_INSERT"` (the creation event) for this entity. Use `_creationTime` of that log entry as the SLA start. If no audit log found, fall back to the lead's own `_creationTime` via `ctx.db.get(id)`.
   - **visit**: find the audit log entry where `action === "VISITS_INSERT"` for this entity. Use `_creationTime` as SLA start.
   - **payout**: find the audit log entry where `action === "PAYOUTS_INSERT"` for this entity. Use `_creationTime` as SLA start.
6. Computation: `time_elapsed_ms = Date.now() - sla_start_time`. `time_remaining_ms = policy.windowMs - time_elapsed_ms`. `breach_time = sla_start_time + policy.windowMs`.
7. Status derivation: if `time_elapsed_ms >= policy.windowMs` → `BREACHED`. Else if `time_elapsed_ms / policy.windowMs >= policy.warningThreshold` → `WARNING`. Else → `ON_TRACK`.
8. Query audit logs using the `by_entity` index: `.withIndex("by_entity", q => q.eq("entity_type", args.entity_type).eq("entity_id", entityId))`. Take the first result (oldest = creation event).
9. Process all entity IDs in a loop within the handler. Convex queries are fast — no need for batching.
10. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/sla.ts` — `getSLAStatus` query with full SLA computation logic

### Acceptance Criteria

1. Query accepts `entity_type` (union of 3 literals) and `entity_ids` (string array)
2. Returns an array with one entry per entity ID
3. Each entry has `entity_id`, `sla_status`, `time_elapsed_ms`, `time_remaining_ms`, `breach_time`
4. `sla_status` is `ON_TRACK` when < 75% elapsed, `WARNING` when 75-100% elapsed, `BREACHED` when > 100% elapsed
5. Uses `by_entity` index on `audit_logs` — no full table scans
6. Requires `analytics.view` permission
7. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/sla.ts`.

### Out of Scope

- Mutation to mark SLA as acknowledged (V2)
- SLA breach notifications via email/push (V2)
- Cron job to snapshot SLA breach counts (V2)
- SLA for tenant inquiries or support inquiries (V2)

---

## T03: SLABadge Frontend Component

### Objective

Create a reusable `SLABadge` component that displays a countdown timer with color-coded status. Add an SLA column to the lead table, payout table, and verification table using this component.

**Architecture**: SLA data is computed client-side from timestamps already present in the list query response. No additional per-row queries.

### Required Reading

- `src/components/admin/VerificationTable.tsx` — full file (understand existing table column pattern, how to add a column)
- `src/app/(admin)/admin/leads/page.tsx` — full file (understand lead table column structure, filter bar, how columns are defined)
- `src/app/(admin)/admin/payouts/page.tsx` — full file (understand payout table column structure)
- `notes/06-admin-panel-ux.md` — "Table Patterns" section (column conventions, badge usage)
- `notes/13-constants-reference.md` — `SLA_STATUS` values (from T01)

### Key Rules

1. `SLABadge` lives at `src/components/admin/SLABadge.tsx`. It is a client component (`"use client"`).
2. Props: `{ entity_type: "lead" | "visit" | "payout"; sla_started_at_ms: number; now_ms?: number; }`. `SLABadge` computes SLA status/time remaining locally from `SLA_POLICIES` + `SLA_STATUS` (no query hook in this component).
3. Color coding:
   - `ON_TRACK`: green text + green dot (`text-green-600`, `bg-green-500`)
   - `WARNING`: amber text + amber dot (`text-amber-600`, `bg-amber-500`)
   - `BREACHED`: red text + red dot + pulse animation (`text-red-600`, `bg-red-500`, `animate-pulse`)
4. Display format: show `time_remaining_ms` as a human-readable countdown. Use this helper inline:
   ```typescript
   function formatRemaining(ms: number): string {
     if (ms <= 0) return "Breached";
     const hours = Math.floor(ms / (1000 * 60 * 60));
     const days = Math.floor(hours / 24);
     if (days > 0) return `${days}d ${hours % 24}h left`;
     const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
     return `${hours}h ${minutes}m left`;
   }
   ```
5. The parent list query should return SLA-relevant timestamps per row (at minimum `sla_started_at_ms`, often mapped from `_creationTime` for lead/payout lists).
6. Loading state: list pages show `Skeleton` cells while the list query is loading (`className="h-5 w-20"`). `SLABadge` itself stays pure/presentational.
7. Add the SLA column to the lead table in `src/app/(admin)/admin/leads/page.tsx` — column header "SLA", renders `<SLABadge entity_type="lead" sla_started_at_ms={lead.sla_started_at_ms ?? lead._creationTime} />`.
8. Add the SLA column to the payout table in `src/app/(admin)/admin/payouts/page.tsx` — column header "SLA", renders `<SLABadge entity_type="payout" sla_started_at_ms={payout.sla_started_at_ms ?? payout._creationTime} />`.
9. Add the SLA column to `src/components/admin/VerificationTable.tsx` — column header "SLA", renders `<SLABadge entity_type="lead" sla_started_at_ms={lead.sla_started_at_ms ?? lead._creationTime} />` (verification is SLA'd on the lead).
10. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/SLABadge.tsx` — SLA countdown badge component with color coding and pulse animation
- [ ] `src/app/(admin)/admin/leads/page.tsx` — SLA column added to lead table
- [ ] `src/app/(admin)/admin/payouts/page.tsx` — SLA column added to payout table
- [ ] `src/components/admin/VerificationTable.tsx` — SLA column added to verification table

### Acceptance Criteria

1. `SLABadge` renders a colored dot + countdown text for each status
2. BREACHED status shows `animate-pulse` on the red dot
3. Loading state shows a skeleton, not a blank cell
4. SLA column appears in lead table, payout table, and verification table
5. SLA is computed client-side from row timestamps returned by list queries (no per-row `useQuery`)
6. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on:

- `src/components/admin/SLABadge.tsx`
- `src/app/(admin)/admin/leads/page.tsx`
- `src/app/(admin)/admin/payouts/page.tsx`
- `src/components/admin/VerificationTable.tsx`

### Out of Scope

- SLA badge in guard portal (guards don't see SLA timers)
- SLA badge in visit table (visits have their own scheduling SLA tracked on the lead)
- Tooltip showing breach time on hover (V2)
- Click-to-filter by SLA status (V2)

---

## T04: Dashboard SLA Breach Summary

### Objective

Extend the existing `DashboardAlertsAndActions` component to show a count of SLA breaches by entity type. Each breach count is a clickable link to the filtered list. The breach card only appears when breaches exist.

### Required Reading

- `src/components/admin/dashboard/DashboardAlertsAndActions.tsx` — full file (understand existing alert structure, how counts are displayed, how links are constructed)
- `convex/sla.ts` — the `getSLAStatus` query (from T02, understand return shape)
- `convex/analytics.ts` — `getOverviewKPIs` (understand what counts are already available to avoid duplicate queries)
- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" section (alert styling conventions)

### Key Rules

1. Do NOT create a new component. Extend `src/components/admin/dashboard/DashboardAlertsAndActions.tsx` in-place.
2. To get breach counts, call `useQuery(api.sla.getSLAStatus, ...)` for leads and payouts. However, calling `getSLAStatus` with all lead IDs is impractical from the dashboard. Instead, add a new internal query `getSLABreachCounts` to `convex/sla.ts`:
   ```typescript
   export const getSLABreachCounts = query({
     args: {},
     handler: async (ctx) => {
       await requirePermission(ctx, "analytics.view");
       // Count SUBMITTED leads older than 24h
       // Count pending payouts older than 5 days
       // Return: { lead_breaches: number; payout_breaches: number; }
     },
   });
   ```
   This query scans `leads` (status SUBMITTED, `_creationTime` older than 24h) and `payouts` (status pending, `_creationTime` older than 5 days) directly — no audit log lookup needed for the count query.
3. Use `useQuery(api.sla.getSLABreachCounts)` in `DashboardAlertsAndActions`.
4. Render a new alert card (below the existing urgent items banner) only when `lead_breaches > 0 || payout_breaches > 0`. Card styling: red border + red background (`border-red-200 bg-red-50`), icon: `AlertTriangle` from lucide-react.
5. Card content: "⚠️ {total} SLA breach{total > 1 ? 'es' : ''}" as the heading. Below: two lines — "{lead_breaches} lead{lead_breaches !== 1 ? 's' : ''} overdue for verification" (link to `/admin/leads?status=SUBMITTED`) and "{payout_breaches} payout{payout_breaches !== 1 ? 's' : ''} overdue for processing" (link to `/admin/payouts?status=pending`). Hide a line if its count is 0.
6. If both counts are 0, render nothing for this card (not even an empty container).
7. Loading state for the new card: `Skeleton` with `className="h-16 w-full"`.
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/sla.ts` — `getSLABreachCounts` query added (extends T02's file)
- [ ] `src/components/admin/dashboard/DashboardAlertsAndActions.tsx` — SLA breach summary card added

### Acceptance Criteria

1. `getSLABreachCounts` returns `{ lead_breaches: number; payout_breaches: number }` with correct counts
2. Breach card appears only when at least one breach exists
3. Breach card uses red styling (distinct from the amber urgent-items banner)
4. Each breach count is a clickable link to the correct filtered list page
5. Zero-count lines are hidden within the card
6. Loading state shows a skeleton
7. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on:

- `convex/sla.ts`
- `src/components/admin/dashboard/DashboardAlertsAndActions.tsx`

### Out of Scope

- Visit SLA breach count on dashboard (visits are tracked via lead SLA)
- Dismissable breach alerts (V2)
- SLA breach history chart (V2)
- Email/push notification on breach (V2)
