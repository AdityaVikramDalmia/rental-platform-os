---
id: P29-E04
title: Morning Briefing + Notification Center
phase: 29
status: done
depends_on: ["P29-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P29-E04: Morning Briefing + Notification Center

## Overview

Give the ops manager a daily briefing card at the top of the dashboard and a notification bell in the header. The briefing summarizes the day's workload in one glance. The notification bell surfaces recent actionable items without requiring a page refresh. Both are computed from existing data — no new tables.

### Indexes Required

- Uses existing index: `leads.by_status` for lead pending-verification and lead SLA breach counts.
- Uses existing index: `payouts.by_status` for `pending` payout counts and payout SLA breach counts.
- Uses existing index: `visits.by_scheduled_start` for today's visit count window.
- No new indexes required in this epic.

## Prerequisites

- **Read first**: [P29-E01 Completion Summary](P29-E01-sla-timers.md#completion-summary) — `getSLABreachCounts` query is used by the morning briefing backend.

## Task Queue

- [x] P29-E04-T01: getMorningBriefing Backend Query
- [x] P29-E04-T02: MorningBriefingCard Frontend Component
- [x] P29-E04-T03: NotificationBell Component
- [x] P29-E04-T04: Wire MorningBriefingCard and NotificationBell into Layout

---

## T01: getMorningBriefing Backend Query

### Objective

Create `convex/briefing.ts` with a `getMorningBriefing` query that aggregates all urgent operational counts in a single call. Pure aggregation from existing tables — no new tables, no writes.

### Required Reading

- `convex/analytics.ts` — full file (understand the aggregation query pattern: how to count entities by status, how `requirePermission` is used, how multiple `ctx.db.query` calls are composed in one handler)
- `convex/sla.ts` — `getSLABreachCounts` query (from P29-E01-T04, understand return shape: `{ lead_breaches: number; payout_breaches: number }`)
- `notes/10-convex-schema.md` — `leads` table (status field), `visits` table (`scheduled_start` field), `payouts` table (status field), `guard_profiles` table (shift data if available)
- `convex/functions.ts` — top of file (import `query` from here)
- `convex/auth.helpers.ts` — `requirePermission`

### Key Rules

1. Create a new file `convex/briefing.ts`. Import `query` from `"./functions"` and `requirePermission` from `"./auth.helpers"`.
2. Use permission `"analytics.view"` — this is a read-only aggregation.
3. Function signature:
   ```typescript
   export const getMorningBriefing = query({
     args: {},
     handler: async (ctx) => { ... }
   });
   ```
4. Return type (all fields required, no optionals):
   ```typescript
   {
     leads_awaiting_verification: { count: number; oldest_age_ms: number };
     visits_scheduled_today: { count: number };
     payouts_pending_approval: { count: number; total_amount_paise: number };
     sla_breaches: { lead_breaches: number; payout_breaches: number };
     top_alert: { type: "sla_breach" | "old_lead" | "none"; message: string; entity_id?: string };
   }
   ```
5. Computation for each field:
   - `leads_awaiting_verification`: count all leads with status `SUBMITTED` or `NEED_INFO`. For `oldest_age_ms`, find the lead with the smallest `_creationTime` among those and compute `Date.now() - lead._creationTime`.
   - `visits_scheduled_today`: count all visits where `scheduled_start` falls within today's calendar day (`[startOfDay, startOfDay + 86400000)`). Use the same date range logic as `getVisitsByDate` in `convex/visits.ts`.
   - `payouts_pending_approval`: count all payouts with status `pending`. Sum their `amount_paise` fields for `total_amount_paise`.
   - `sla_breaches`: call the SLA breach logic directly (do NOT use `ctx.runQuery` — duplicate the count logic inline to avoid cross-query calls in Convex). Count SUBMITTED leads older than 86400000 ms and pending payouts older than 432000000 ms.
   - `top_alert`: determine the single most urgent item. Priority order: (1) if `sla_breaches.lead_breaches > 0`, type = `"sla_breach"`, message = `"{N} lead(s) have breached their 24-hour verification SLA"`. (2) Else if `leads_awaiting_verification.oldest_age_ms > 12 * 60 * 60 * 1000` (older than 12 hours), type = `"old_lead"`, message = `"Oldest unverified lead is {hours}h old"`. (3) Else type = `"none"`, message = `""`.
6. Use `ctx.db.query("leads").withIndex("by_status", ...)` for status-based counts. Check the actual index name in `convex/schema.ts` before writing — use whatever index exists.
7. `startOfDay` computation: `const now = Date.now(); const startOfDay = now - (now % 86400000);` — this gives UTC midnight. Acceptable for V1.
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/briefing.ts` — `getMorningBriefing` query with full aggregation logic

### Acceptance Criteria

1. Query returns all 5 top-level fields with correct types
2. `leads_awaiting_verification.count` matches the count of SUBMITTED + NEED_INFO leads
3. `visits_scheduled_today.count` matches visits on today's calendar day
4. `payouts_pending_approval.total_amount_paise` is the sum of all pending payout amounts
5. `sla_breaches` counts match the same logic as `getSLABreachCounts` in `convex/sla.ts`
6. `top_alert` returns `type: "none"` when no urgent items exist
7. Requires `analytics.view` permission
8. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/briefing.ts`.

### Out of Scope

- Cron job to snapshot briefing data (V2)
- Per-admin personalized briefing (V2)
- Briefing for guard portal (guards don't see ops briefings)
- Email delivery of morning briefing (V2)

---

## T02: MorningBriefingCard Frontend Component

### Objective

Create a `MorningBriefingCard` component that renders above the KPI cards on the dashboard. Shows a concise summary of the day's workload. Visible only from 6 AM to 12 PM (client time) — outside those hours, shows a simpler "Current Status" variant.

### Required Reading

- `src/app/(admin)/admin/dashboard/page.tsx` — full file (understand current layout, where to insert above KPI cards)
- `src/components/admin/dashboard/DashboardKPICards.tsx` — full file (understand the card pattern and how it sits in the layout)
- `convex/briefing.ts` — `getMorningBriefing` query (from T01, understand return shape)
- `notes/06-admin-panel-ux.md` — "Global Layout" section (desktop-first conventions, card styling)

### Key Rules

1. `MorningBriefingCard` lives at `src/components/admin/dashboard/MorningBriefingCard.tsx`. It is a client component (`"use client"`).
2. Data: call `useQuery(api.briefing.getMorningBriefing)`.
3. Time-of-day logic (client-side):
   ```typescript
   const hour = new Date().getHours(); // 0-23
   const isMorning = hour >= 6 && hour < 12;
   ```
4. **Morning variant** (6 AM - 12 PM): render a card with a subtle gradient background (`bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100`). Content:
   - Greeting: "Good morning! Here's your briefing." (h2, `text-lg font-semibold text-blue-900`)
   - Summary line: "You have **{leads_awaiting_verification.count} leads** to verify, **{visits_scheduled_today.count} visits** today, and **{payouts_pending_approval.count} payouts** to approve."
   - Each bolded count is a `next/link` to the relevant page: leads → `/admin/leads?status=SUBMITTED`, visits → `/admin/visits`, payouts → `/admin/payouts?status=pending`.
   - If `top_alert.type !== "none"`: render an amber alert row below the summary: "⚠️ {top_alert.message}" with a link to the relevant entity if `entity_id` is present.
   - If `sla_breaches.lead_breaches > 0 || sla_breaches.payout_breaches > 0`: render a red alert row: "🚨 {total} SLA breach{total > 1 ? 'es' : ''} require immediate attention" with a link to `/admin/leads?status=SUBMITTED`.
5. **Current Status variant** (outside 6 AM - 12 PM): render a simpler card (`bg-gray-50 border border-gray-200`). Content:
   - Title: "Current Status" (h2, `text-base font-medium text-gray-700`)
   - Three stat pills in a row: "{count} leads pending", "{count} visits today", "{count} payouts pending"
   - Each pill is a link to the relevant page.
   - No greeting, no gradient, no alert rows.
6. Loading state: a `Skeleton` with `className="h-24 w-full rounded-lg"`.
7. Money display: `payouts_pending_approval.total_amount_paise` — divide by 100, format as INR. Show in the morning variant only, as a secondary line: "Total payout value: ₹{amount}".
8. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/dashboard/MorningBriefingCard.tsx` — Morning briefing card with morning/current-status variants, loading state, alert rows

### Acceptance Criteria

1. Morning variant renders between 6 AM and 12 PM with gradient background and greeting
2. Current Status variant renders outside those hours with simpler styling
3. All counts are clickable links to the correct filtered pages
4. Top alert row appears only when `top_alert.type !== "none"`
5. SLA breach row appears only when breaches exist
6. Total payout value is formatted as INR (not raw paise)
7. Loading state shows a skeleton
8. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/dashboard/MorningBriefingCard.tsx`.

### Out of Scope

- Wiring into the dashboard page (T04)
- Dismissable briefing card (V2)
- Customizable greeting with admin name (V2)
- Afternoon/evening variants (V2)

---

## T03: NotificationBell Component

### Objective

Create a `NotificationBell` component for the admin header. Shows an unread count badge and a popover with recent actionable items. Notifications are derived client-side from existing queries — no new backend table.

### Required Reading

- `src/app/(admin)/admin-layout-client.tsx` — full file (understand the admin header structure, where the ⌘K hint button lives, how to add a new header element)
- `src/components/ui/popover.tsx` — understand the `Popover`, `PopoverTrigger`, `PopoverContent` API
- `convex/briefing.ts` — `getMorningBriefing` query (from T01, reuse for notification counts)
- `notes/06-admin-panel-ux.md` — "Global Layout" section (header conventions)

### Key Rules

1. `NotificationBell` lives at `src/components/admin/NotificationBell.tsx`. It is a client component (`"use client"`).
2. Data: call `useQuery(api.briefing.getMorningBriefing)` — reuse the briefing query for counts. Do NOT create a new backend query.
3. Notification items are derived from the briefing data:
   - If `leads_awaiting_verification.count > 0`: one notification — "📋 {count} lead{count > 1 ? 's' : ''} awaiting verification" — link to `/admin/leads?status=SUBMITTED`
   - If `sla_breaches.lead_breaches > 0`: one notification — "🚨 {count} lead SLA breach{count > 1 ? 'es' : ''}" — link to `/admin/leads?status=SUBMITTED`
   - If `sla_breaches.payout_breaches > 0`: one notification — "🚨 {count} payout SLA breach{count > 1 ? 'es' : ''}" — link to `/admin/payouts?status=pending`
   - If `payouts_pending_approval.count > 0`: one notification — "💰 {count} payout{count > 1 ? 's' : ''} pending approval" — link to `/admin/payouts?status=pending`
   - If `visits_scheduled_today.count > 0`: one notification — "📅 {count} visit{count > 1 ? 's' : ''} scheduled today" — link to `/admin/visits`
4. Total unread count = number of notification items generated above (max 5 items, one per category).
5. Bell icon: use `Bell` from lucide-react. Size: `h-5 w-5`.
6. Unread badge: a red dot with count, positioned top-right of the bell icon. Use `relative` on the wrapper div and `absolute -top-1 -right-1` on the badge. Badge: `bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center`. If count > 9, show "9+".
7. Clicking the bell opens a `Popover` (shadcn/ui). `PopoverContent` width: `w-80`. Header: "Notifications" (`text-sm font-semibold`). Body: a list of notification items.
8. Each notification item in the popover: a `next/link` row with the notification text. Hover: `hover:bg-gray-50`. Padding: `px-4 py-3`. Separator between items.
9. If no notifications (all counts are 0): show "No new notifications" in the popover body with a gray checkmark icon.
10. Loading state: show the bell icon without a badge (don't show a skeleton for the bell itself — it's too small).
11. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/NotificationBell.tsx` — Notification bell with unread count badge and popover

### Acceptance Criteria

1. Bell icon renders in the header with a red badge showing unread count
2. Badge shows "9+" when count exceeds 9
3. Clicking the bell opens a popover with notification items
4. Each notification item is a clickable link to the relevant page
5. Empty state shows "No new notifications" in the popover
6. Loading state shows the bell without a badge (no flash of wrong count)
7. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/NotificationBell.tsx`.

### Out of Scope

- Wiring into the admin layout (T04)
- Persistent read/unread state per notification (V2 — requires new table)
- Push notifications via browser Notification API (V2)
- Notification preferences per admin (V2)
- Notification history page (V2)

---

## T04: Wire MorningBriefingCard and NotificationBell into Layout

### Objective

Wire `MorningBriefingCard` into the dashboard page above the KPI cards, and wire `NotificationBell` into the admin layout header next to the existing ⌘K hint button. Ensure both components handle loading and empty states gracefully. Run a final build check.

### Required Reading

- `src/app/(admin)/admin/dashboard/page.tsx` — full file (understand current layout structure, where KPI cards are rendered, how to insert above them)
- `src/app/(admin)/admin-layout-client.tsx` — full file (understand the header structure, where the ⌘K hint button is, how to add `NotificationBell` next to it)
- `src/components/admin/dashboard/MorningBriefingCard.tsx` — full file (from T02, understand props — none required)
- `src/components/admin/NotificationBell.tsx` — full file (from T03, understand props — none required)
- `src/components/admin/dashboard/DashboardKPICards.tsx` — full file (understand how it's currently rendered in the dashboard page)

### Key Rules

1. In `src/app/(admin)/admin/dashboard/page.tsx`: add `<MorningBriefingCard />` as the first element inside the page's main content area, before `<TimeWindowSelector />` and before the KPI cards section. It should span the full width of the content area.
2. In `src/app/(admin)/admin-layout-client.tsx`: find the header section where the ⌘K hint button lives. Add `<NotificationBell />` immediately to the left of the ⌘K button (or to the right — use your judgment based on the existing layout). Both should be in a flex row with `gap-2`.
3. Both components are self-contained — they call their own queries internally. No props need to be passed from the parent.
4. Wrap `<MorningBriefingCard />` in a React error boundary (or a simple try/catch wrapper) so that if the briefing query fails, the rest of the dashboard still renders. Show a `DashboardErrorCard` (from P27-E01-T07) as the fallback.
5. Do NOT wrap `<NotificationBell />` in an error boundary — if it fails, it should fail silently (the bell simply doesn't render). Use a try/catch inside the component itself if needed.
6. After wiring both components, run `npm run build` to verify the full production build passes. Fix any TypeScript or import errors before marking this task done.
7. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/app/(admin)/admin/dashboard/page.tsx` — `MorningBriefingCard` wired above KPI cards with error boundary
- [ ] `src/app/(admin)/admin-layout-client.tsx` — `NotificationBell` wired into header next to ⌘K button

### Acceptance Criteria

1. `MorningBriefingCard` renders above the KPI cards on the dashboard page
2. `NotificationBell` renders in the admin header next to the ⌘K button
3. If `MorningBriefingCard` query fails, a `DashboardErrorCard` renders in its place — the rest of the dashboard is unaffected
4. Both components show their loading states correctly on first render
5. `npm run build` passes with zero TypeScript errors
6. `lsp_diagnostics` clean on all files changed in this epic

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on:

- `src/app/(admin)/admin/dashboard/page.tsx`
- `src/app/(admin)/admin-layout-client.tsx`
- `src/components/admin/dashboard/MorningBriefingCard.tsx`
- `src/components/admin/NotificationBell.tsx`

### Out of Scope

- Wiring `TodaysVisitsCard` into the dashboard (that was done in P29-E03-T03)
- Wiring `SmartQueue` into the verification page (that was done in P29-E02-T03)
- Dark mode support for the briefing card gradient (V2)
- Mobile-responsive adjustments to the notification bell popover (V2)
