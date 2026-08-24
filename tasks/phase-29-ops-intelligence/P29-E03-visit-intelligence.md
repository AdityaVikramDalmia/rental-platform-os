---
id: P29-E03
title: Visit Scheduling Intelligence
phase: 29
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P29-E03: Visit Scheduling Intelligence

## Overview

Make visit scheduling smarter. When an admin assigns a guard to a visit, the system checks for scheduling conflicts and shows a soft warning. A new "Today's Visits" timeline card on the dashboard gives the ops manager an at-a-glance view of the day's visit schedule.

### Indexes Required

- **New index required**: `visits.by_assigned_guard_id_and_scheduled_start` for efficient conflict checks in a ±2 hour window for one guard.
  - Suggested fields: `["assigned_guard_id", "scheduled_start"]`
- Uses existing index: `visits.by_scheduled_start` for `getVisitsByDate` day-range timeline query.
- Uses existing index: `visits.by_guard_and_status` for active-visit filtering by guard/status.

## Task Queue

- [x] P29-E03-T01: Guard Conflict Detection Backend
- [x] P29-E03-T02: Conflict Warning in Visit Scheduling UI
- [x] P29-E03-T03: Today's Visits Timeline Card (Frontend)
- [x] P29-E03-T04: getVisitsByDate Backend Query

---

## T01: Guard Conflict Detection Backend

### Objective

Add a `checkGuardConflicts` query to `convex/visits.ts` that returns existing visits for a guard on a given date within ±2 hours of a proposed time. This is a read-only query used by the scheduling UI to warn about double-booking.

### Required Reading

- `convex/visits.ts` — full file (understand existing query patterns, index names on the `visits` table, how `scheduled_start` and `scheduled_end` are stored)
- `notes/10-convex-schema.md` — `visits` table schema (fields: `assigned_guard_id`, `scheduled_start`, `scheduled_end`, `status`, `society_id`, `lead_id`; understand how date/time are stored — Unix ms)
- `notes/04-state-machines.md` — visit status section (understand which statuses mean the visit is still active: ASSIGNED, CONFIRMED, IN_PROGRESS)
- `convex/functions.ts` — top of file (import `query` from here)
- `convex/auth.helpers.ts` — `requirePermission` (use `"visits.view"` permission)

### Key Rules

1. Import `query` from `"./functions"`, NOT from `"./_generated/server"`.
2. Import `requirePermission` from `"./auth.helpers"`. Use permission `"visits.view"`.
3. Function signature:
   ```typescript
   export const checkGuardConflicts = query({
     args: {
        assigned_guard_id: v.id("users"),
        proposed_start_ms: v.number(), // Unix ms — exact proposed start time
      },
      handler: async (ctx, args) => { ... }
    });
   ```
4. Return type: `{ conflicts: Array<{ visit_id: string; scheduled_start_ms: number; scheduled_end_ms: number; society_name: string; flat_number: string; status: string; }> }`.
5. Query logic: fetch active visits (`ASSIGNED`, `CONFIRMED`, `IN_PROGRESS`) for this guard where `scheduled_start` is within ±2 hours of the proposed start. Conflict filter: `Math.abs(visit.scheduled_start - args.proposed_start_ms) <= 2 * 60 * 60 * 1000`.
6. Use `by_assigned_guard_id_and_scheduled_start` when available. Until that index lands, use `by_assigned_guard_id`/`by_guard_and_status` then range-filter by `scheduled_start` in handler.
7. For each conflicting visit, join with the `leads` table to get `flat_number` and with the `societies` table to get `society_name`. Use `ctx.db.get()` for these joins.
8. Return an empty `conflicts` array (not null) when no conflicts exist.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/visits.ts` — `checkGuardConflicts` query added

### Acceptance Criteria

1. Query accepts `assigned_guard_id` and `proposed_start_ms`
2. Returns conflicts only for ASSIGNED, CONFIRMED, or IN_PROGRESS visits
3. Conflict window is exactly ±2 hours (7200000 ms)
4. Each conflict includes `visit_id`, `scheduled_start_ms`, `scheduled_end_ms`, `society_name`, `flat_number`, `status`
5. Returns empty array when no conflicts exist
6. Requires `visits.view` permission
7. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/visits.ts`.

### Out of Scope

- Hard-blocking visit creation when conflicts exist (soft warning only)
- Conflict detection for CANCELLED or NO_SHOW visits (these are inactive)
- Travel time estimation between visits (V2)
- Guard availability calendar (V2)

---

## T02: Conflict Warning in Visit Scheduling UI

### Objective

Add a conflict warning banner to the visit scheduling form. When an admin selects a guard and a date/time, the form fires the `checkGuardConflicts` query and shows an amber warning banner if conflicts are found. The admin can still proceed — this is a soft warning, not a hard block.

### Required Reading

- `src/app/(admin)/admin/visits/page.tsx` — full file (understand the visit scheduling form or dialog — where guard selection and date/time inputs live)
- `src/app/(admin)/admin/visits/components/` — list all files in this directory and read the scheduling form/dialog component (likely `schedule-visit-dialog.tsx` or similar)
- `convex/visits.ts` — `checkGuardConflicts` query (from T01, understand args and return shape)
- `notes/06-admin-panel-ux.md` — "Flow 4: Schedule Visit" section (understand the scheduling workflow)

### Key Rules

1. Find the visit scheduling form/dialog component. It is likely in `src/app/(admin)/admin/visits/` or `src/app/(admin)/admin/visits/components/`. Read it fully before making changes.
2. Add a `useQuery(api.visits.checkGuardConflicts, ...)` call inside the scheduling form. The query args come from the form's current guard selection and date/time values.
3. Use `skipToken` from `"convex/react"` to skip the query when guard or start time is not yet selected: `useQuery(api.visits.checkGuardConflicts, guardId && proposedStart ? { assigned_guard_id: guardId, proposed_start_ms: proposedStart } : skipToken)`.
4. When `conflicts.length > 0`, render an amber warning banner directly below the guard selector (or below the time picker — wherever it fits best in the existing form layout). Banner content:
   - Icon: `AlertTriangle` from lucide-react, amber color
   - Heading: "⚠️ {guardName} has {conflicts.length} other visit{conflicts.length > 1 ? 's' : ''} within 2 hours"
   - Body: a compact list of conflicts — each line: "{time formatted as HH:MM} · {society_name} · {flat_number} · {status badge}"
5. Banner styling: `border border-amber-300 bg-amber-50 rounded-md p-3 text-amber-800 text-sm`.
6. Do NOT add a "Proceed anyway" checkbox or any confirmation gate. The admin simply sees the warning and can submit the form as normal.
7. When `conflicts.length === 0` or the query hasn't run yet, render nothing for the banner.
8. Format `scheduled_start_ms` as "HH:MM" using `new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })`.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] Visit scheduling form/dialog component (whichever file contains the guard + date/time selection) — conflict warning banner added

### Acceptance Criteria

1. Warning banner appears when a guard has conflicts within ±2 hours of the proposed time
2. Banner shows guard name, conflict count, and a list of conflicting visits with time, society, flat, and status
3. Banner uses amber styling (not red — this is a warning, not an error)
4. Banner does not appear when there are no conflicts
5. Query is skipped (not fired) when guard or time is not yet selected
6. Admin can still submit the form when conflicts exist (no hard block)
7. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on the modified scheduling form/dialog file.

### Out of Scope

- Hard-blocking visit creation when conflicts exist
- Conflict warnings in the guard portal (guards don't schedule visits)
- Conflict warnings for CANCELLED or NO_SHOW visits
- Suggested alternative time slots (V2)

---

## T03: Today's Visits Timeline Card (Frontend)

### Objective

Create a `TodaysVisitsCard` component that renders all visits scheduled for today in a vertical timeline from 8 AM to 8 PM. Wire it into the admin dashboard. Uses the `getVisitsByDate` query from T04.

### Required Reading

- `src/app/(admin)/admin/dashboard/page.tsx` — full file (understand current layout, where to insert the new card — below the 2-column section, above or alongside recent activity)
- `src/components/admin/dashboard/DashboardRecentActivity.tsx` — full file (understand the card pattern to follow for consistency)
- `convex/visits.ts` — `getVisitsByDate` query (from T04 — read T04 spec first to understand the return shape)
- `notes/13-constants-reference.md` — `VISIT_STATUS` enum values and badge colors

### Key Rules

1. `TodaysVisitsCard` lives at `src/components/admin/dashboard/TodaysVisitsCard.tsx`. It is a client component (`"use client"`).
2. Data: call `useQuery(api.visits.getVisitsByDate, { date_ms: startOfTodayMs })` where `startOfTodayMs` is computed as:
   ```typescript
   const startOfTodayMs = new Date().setHours(0, 0, 0, 0);
   ```
3. Layout: a `Card` with header "Today's Visits" + today's date (e.g., "Today's Visits — Feb 19"). Body: a vertical timeline list.
4. Timeline rendering: sort visits by `scheduled_start_ms` ascending. For each visit, render a row with:
   - Time label on the left (e.g., "10:30") — `text-sm text-gray-500 w-12 shrink-0`
   - A vertical line connector between rows (use `border-l-2 border-gray-200 ml-6 pl-3` on the content div)
   - A colored dot matching the visit status (see color map below)
   - Guard name + society name + flat number (e.g., "Ravi Kumar · Lakeview Residency · 304")
   - Status badge (reuse existing shared status badge component from `src/components/shared/`)
5. Status color map for the timeline dot:
   - `ASSIGNED`: blue (`bg-blue-500`)
   - `CONFIRMED`: green (`bg-green-500`)
   - `IN_PROGRESS`: amber (`bg-amber-500`)
   - `COMPLETED`: gray (`bg-gray-400`)
   - `NO_SHOW`: red (`bg-red-500`)
   - `CANCELLED`: gray (`bg-gray-300`)
6. Each visit row is clickable — clicking navigates to `/admin/visits` (the visits list page). Use `next/link` or `useRouter`.
7. Loading state: 3 skeleton rows.
8. Empty state: "No visits scheduled for today" with a calendar icon.
9. Show a count badge in the card header: "Today's Visits (5)" where 5 is the total count.
10. Wire `TodaysVisitsCard` into `src/app/(admin)/admin/dashboard/page.tsx`. Place it in the right column of the 2-column layout (alongside `DashboardAlertsAndActions` and `DashboardStatusBreakdowns`), or below the 2-column section if the right column is already full. Use your judgment based on the existing layout.
11. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/dashboard/TodaysVisitsCard.tsx` — Today's visits timeline card component
- [ ] `src/app/(admin)/admin/dashboard/page.tsx` — `TodaysVisitsCard` wired into dashboard layout

### Acceptance Criteria

1. Card renders visits sorted by scheduled time ascending
2. Each row shows time, guard name, society, flat, and status badge
3. Timeline dots are color-coded by visit status
4. Clicking a row navigates to `/admin/visits`
5. Count badge in header shows total visit count for today
6. Loading state shows 3 skeleton rows
7. Empty state shows a friendly message with calendar icon
8. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on:

- `src/components/admin/dashboard/TodaysVisitsCard.tsx`
- `src/app/(admin)/admin/dashboard/page.tsx`

### Out of Scope

- Full calendar view with week/month navigation (V2)
- Drag-to-reschedule on the timeline (V2)
- Visits outside 8 AM - 8 PM window (show them but don't clip — just render in order)
- Guard-specific timeline view (V2)

---

## T04: getVisitsByDate Backend Query

### Objective

Add a `getVisitsByDate` query to `convex/visits.ts` that returns all visits for a given date, with guard name, society name, and flat number joined in. This is the data source for the Today's Visits card (T03) and future calendar views.

### Required Reading

- `convex/visits.ts` — full file (understand existing query patterns, index names, how guard and society data is joined in other queries)
- `notes/10-convex-schema.md` — `visits` table (fields: `assigned_guard_id`, `scheduled_start`, `scheduled_end`, `lead_id`, `society_id`, `status`), `users` table (for guard name), `societies` table (for society name), `leads` table (for flat number)
- `convex/functions.ts` — top of file (import `query` from here)
- `convex/auth.helpers.ts` — `requirePermission` (use `"visits.view"`)

### Key Rules

1. Import `query` from `"./functions"`, NOT from `"./_generated/server"`.
2. Import `requirePermission` from `"./auth.helpers"`. Use permission `"visits.view"`.
3. Function signature:
   ```typescript
   export const getVisitsByDate = query({
     args: {
        date_ms: v.number(), // Unix ms — start of the day (midnight). Query visits where scheduled_start falls on this calendar day.
      },
      handler: async (ctx, args) => { ... }
    });
   ```
4. Return type: `Array<{ visit_id: string; scheduled_start_ms: number; scheduled_end_ms: number; guard_name: string; society_name: string; flat_number: string; status: string; }>`.
5. Date matching: a visit is "on this date" if its `scheduled_start` falls within `[date_ms, date_ms + 24 * 60 * 60 * 1000)`. Use existing index `by_scheduled_start` for this range query.
6. For each visit, join:
   - Guard name: `ctx.db.get(visit.assigned_guard_id)` → `user.name`
   - Society name: `ctx.db.get(visit.society_id)` → `society.name`
   - Flat number: `ctx.db.get(visit.lead_id)` → `lead.flat_number`
7. Return all statuses (including COMPLETED, CANCELLED, NO_SHOW) — the frontend decides what to show.
8. Sort results by `scheduled_start_ms` ascending in the handler before returning.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/visits.ts` — `getVisitsByDate` query added

### Acceptance Criteria

1. Query accepts `date_ms` (Unix ms for start of day)
2. Returns all visits on that calendar day regardless of status
3. Each result includes `visit_id`, `scheduled_start_ms`, `scheduled_end_ms`, `guard_name`, `society_name`, `flat_number`, `status`
4. Results are sorted by `scheduled_start_ms` ascending
5. Requires `visits.view` permission
6. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/visits.ts`.

### Out of Scope

- Grouping by time slot (the frontend handles grouping if needed)
- Pagination (today's visits are bounded — a society won't have hundreds of visits in one day)
- Date range queries (single day only — range queries are V2)
