---
id: P29-E02
title: Lead Priority Scoring + Smart Queue
phase: 29
status: done
depends_on: ["P29-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P29-E02: Lead Priority Scoring + Smart Queue

## Overview

Give the ops manager a ranked work queue. Instead of scanning a flat list of leads, they see a priority score (0-100) on every lead and a "Smart Queue" widget that surfaces the top 10 highest-priority leads with one-click actions. Priority is computed from age, rent, duplicate flags, guard quality, and verification attempt history.

### Indexes Required

- Uses existing index: `leads.by_status` (and optionally `leads.by_society_and_status`) for actionable lead subsets.
- Uses existing index: `owner_verifications.by_lead_id` for per-lead verification attempt counts.
- No new indexes required in this epic.

## Prerequisites

- **Read first**: [P29-E01 Completion Summary](P29-E01-sla-timers.md#completion-summary) — `SLAStatus` type and `SLA_POLICIES` constants are used in the smart queue widget.

## Task Queue

- [x] P29-E02-T01: Lead Priority Scoring Backend
- [x] P29-E02-T02: PriorityBadge Component + Lead Table Integration
- [x] P29-E02-T03: Smart Queue Widget

---

## T01: Lead Priority Scoring Backend

### Objective

Add a `computeLeadPriority` helper function and extend the lead list query to include a `priority_score` (0-100) and `priority_tier` (HIGH/MEDIUM/LOW) on every returned lead. The scoring is a weighted sum of five factors.

### Required Reading

- `convex/leads.ts` — full file (understand the `list` query signature, return shape, existing filters, how guard data is joined)
- `convex/guards.ts` — full file (understand `guard_profiles` table fields — specifically `verified_leads_count` and `total_leads_count` if they exist, or how to compute verified rate)
- `notes/10-convex-schema.md` — `leads` table (fields: `status`, `_creationTime`, `submitted_by_guard_id`, `quality_flags`, `rent_expected`), `guard_profiles` table (fields: `verified_leads_count`, `total_leads_count`), `owner_verifications` table (understand how verification attempts are counted)
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum values, `QUALITY_FLAGS` enum values (specifically `POTENTIAL_DUPLICATE` flag)
- `lib/constants.ts` — `SLA_POLICIES` (from P29-E01-T01, used for age factor calculation)

### Key Rules

1. Add a `computeLeadPriority` function in `convex/leads.ts` (or a new `convex/leadScoring.ts` if the leads file is already large). If creating a new file, import it into `convex/leads.ts` and use it there. The function is NOT exported as a Convex query — it is a plain TypeScript helper called within the list query handler.
2. Function signature: `function computeLeadPriority(lead: Doc<"leads">, guardVerifiedRate: number, verificationAttemptCount: number): { score: number; tier: "HIGH" | "MEDIUM" | "LOW" }`.
3. Scoring formula (total max = 75 points, normalized to 0-100):
   - **Age factor** (max 40 points): `Math.min(40, (Date.now() - lead._creationTime) / SLA_POLICIES.lead.windowMs * 40)`. Older leads score higher. A lead at exactly its SLA window gets 40 points.
   - **Rent factor** (max 20 points): `Math.min(20, (lead.rent_expected ?? 0) / 10000000 * 20)`. `rent_expected` is in paise. ₹1,00,000/month (10000000 paise) = 20 points. Scale linearly below that.
   - **Duplicate flag** (-10 points): if `lead.quality_flags` includes `"POTENTIAL_DUPLICATE"`, subtract 10. Score cannot go below 0.
   - **Guard quality factor** (max 15 points): `Math.round(guardVerifiedRate * 15)`. `guardVerifiedRate` is a fraction 0-1 (verified leads / total leads for that guard). High-quality guards get higher priority because their leads are more likely to convert.
   - **Verification attempt penalty** (-5 per attempt, max -15): `Math.max(-15, verificationAttemptCount * -5)`. More failed attempts = lower priority.
4. Normalize final score to 0-100: `Math.max(0, Math.min(100, rawScore))`.
5. Tier thresholds: score >= 70 → `HIGH`, score >= 40 → `MEDIUM`, score < 40 → `LOW`.
6. In the `list` query handler, after fetching leads, fetch guard profiles and verification attempt counts for each lead in the result set. Use `ctx.db.get(lead.submitted_by_guard_id)` for guard profile. Use `ctx.db.query("owner_verifications").withIndex("by_lead_id", q => q.eq("lead_id", lead._id)).collect()` for attempt count.
7. Return shape extension: add `priority_score: number` and `priority_tier: "HIGH" | "MEDIUM" | "LOW"` to each lead object in the list query result.
8. Only compute priority for leads with status `SUBMITTED` or `NEED_INFO` — these are the actionable ones. For other statuses, return `priority_score: 0` and `priority_tier: "LOW"`.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/leads.ts` (or `convex/leadScoring.ts`) — `computeLeadPriority` helper function
- [ ] `convex/leads.ts` — `list` query extended to include `priority_score` and `priority_tier` on each result

### Acceptance Criteria

1. `computeLeadPriority` returns a score between 0 and 100 inclusive
2. A lead with status SUBMITTED, age at SLA window, high rent, high-quality guard, and no duplicate flag scores near 75 (before normalization)
3. A POTENTIAL_DUPLICATE lead scores 10 points lower than an equivalent non-duplicate lead
4. `list` query results include `priority_score` and `priority_tier` on every lead
5. Leads with status other than SUBMITTED/NEED_INFO have `priority_score: 0` and `priority_tier: "LOW"`
6. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/leads.ts` (and `convex/leadScoring.ts` if created).

### Out of Scope

- Storing priority score in the database (recomputed on every query)
- Priority scoring for visits, payouts, or other entities (V2)
- Machine learning-based scoring (V2)
- Configurable scoring weights via `system_config` (V2)

---

## T02: PriorityBadge Component + Lead Table Integration

### Objective

Create a `PriorityBadge` component and integrate it into the lead table. Add a "Sort by Priority" option to the lead table sort dropdown. Set priority DESC as the default sort for the lead list page.

### Required Reading

- `src/app/(admin)/admin/leads/page.tsx` — full file (understand existing sort dropdown, column definitions, how sort state is managed, current default sort)
- `src/components/admin/SLABadge.tsx` — full file (from P29-E01-T03, understand the badge pattern to follow for consistency)
- `notes/06-admin-panel-ux.md` — "Table Patterns" section (badge conventions, sort dropdown pattern)
- `notes/13-constants-reference.md` — understand existing badge color conventions

### Key Rules

1. `PriorityBadge` lives at `src/components/admin/PriorityBadge.tsx`. It is a client component (`"use client"`).
2. Props: `{ tier: "HIGH" | "MEDIUM" | "LOW"; score?: number; }`. The `score` prop is optional — show it in parentheses if provided (e.g., "High (82)").
3. Visual design:
   - `HIGH`: red filled dot + bold red text (`text-red-700 font-semibold`) + `bg-red-50 border border-red-200` pill
   - `MEDIUM`: amber filled dot + amber text (`text-amber-700`) + `bg-amber-50 border border-amber-200` pill
   - `LOW`: gray filled dot + gray text (`text-gray-500`) + `bg-gray-50 border border-gray-200` pill
4. Dot size: `h-2 w-2 rounded-full inline-block mr-1.5`.
5. Add a "Priority" column to the lead table in `src/app/(admin)/admin/leads/page.tsx`. Column header: "Priority". Cell: `<PriorityBadge tier={lead.priority_tier} score={lead.priority_score} />`.
6. Add "Sort by Priority" to the sort dropdown. The sort option value: `"priority_desc"`. When selected, sort the displayed results by `priority_score` descending (client-side sort on the already-fetched page, since Convex doesn't support computed field sorting natively). If two leads have the same score, sort by `_creationTime` ascending (older first).
7. Change the default sort for the lead list page from whatever it currently is to `"priority_desc"`. Update the initial sort state accordingly.
8. Client-side sort: after `useQuery` returns results, apply `[...results].sort(...)` before rendering. This is acceptable because the lead list is paginated (20 items per page) — sorting 20 items client-side is instant.
9. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/PriorityBadge.tsx` — Priority tier badge component
- [ ] `src/app/(admin)/admin/leads/page.tsx` — Priority column added, sort by priority option added, default sort changed to priority DESC

### Acceptance Criteria

1. `PriorityBadge` renders with correct colors for HIGH (red), MEDIUM (amber), LOW (gray)
2. Score is shown in parentheses when `score` prop is provided
3. Priority column appears in the lead table
4. "Sort by Priority" option exists in the sort dropdown
5. Default sort on page load is priority DESC
6. Ties in priority score are broken by age (older leads first)
7. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on:

- `src/components/admin/PriorityBadge.tsx`
- `src/app/(admin)/admin/leads/page.tsx`

### Out of Scope

- Server-side priority sorting (Convex doesn't support computed field indexes — client-side is correct here)
- Priority badge in guard portal (guards don't see priority scores)
- Priority badge on lead detail panel (V2)

---

## T03: Smart Queue Widget

### Objective

Create a `SmartQueue` component that shows the top 10 highest-priority SUBMITTED/NEED_INFO leads with inline verify/reject buttons. Wire it into the verification page above the existing verification table. This is the "what should I work on next?" widget for the ops manager.

**Architecture**: SLA data is computed client-side from timestamps already present in the list query response. No additional per-row queries.

### Required Reading

- `src/app/(admin)/admin/verification/page.tsx` — full file (understand existing page structure, how to add a section above the table)
- `src/components/admin/VerificationTable.tsx` — full file (understand the verification dialog pattern — `VerificationDialog` — to reuse for inline actions)
- `src/components/admin/VerificationDialog.tsx` — full file (understand props and how to trigger it from outside the table)
- `convex/leads.ts` — `list` query (understand how to filter for SUBMITTED/NEED_INFO leads with priority score)
- `src/components/admin/SLABadge.tsx` — full file (from P29-E01-T03, reuse in smart queue rows)
- `src/components/admin/PriorityBadge.tsx` — full file (from T02, reuse in smart queue rows)

### Key Rules

1. `SmartQueue` lives at `src/components/admin/SmartQueue.tsx`. It is a client component (`"use client"`).
2. Data: call `useQuery(api.leads.list, { status: ["SUBMITTED", "NEED_INFO"], limit: 10 })` — or whatever filter args the `list` query accepts for status. Sort client-side by `priority_score` descending (same pattern as T02).
3. Layout: a `Card` with header "Smart Queue — Top 10 Leads to Verify" and a subtitle "Sorted by priority score". Below the header, a vertical list of lead rows.
4. Each row shows (left to right):
   - `PriorityBadge` (tier + score)
   - Society name + building name + flat number (e.g., "Lakeview Residency · Tower B · 304")
   - Guard name (submitting guard)
   - `SLABadge` (entity_type="lead", sla_started_at_ms={lead.sla_started_at_ms ?? lead.\_creationTime})
   - Two action buttons: "Verify" (green outline button) and "Reject" (red ghost button)
5. Clicking "Verify" opens the `VerificationDialog` pre-populated with the lead. Reuse the existing `VerificationDialog` component — do not duplicate its logic. The submit path must use the existing verification mutation `api.verifications.create`.
6. Clicking "Reject" opens a confirmation `AlertDialog` (shadcn/ui) with a reason textarea. On confirm, call the existing lead rejection mutation.
7. Loading state: 3 skeleton rows, each matching the row height.
8. Empty state (no SUBMITTED/NEED_INFO leads): show a green card with "All clear — no leads awaiting verification" and a checkmark icon.
9. The widget is collapsible: add a chevron toggle button in the card header. Default state: expanded. Collapsed state: shows only the header with the count badge ("10 leads").
10. Wire `SmartQueue` into `src/app/(admin)/admin/verification/page.tsx` above the existing `VerificationTable`. Add a `<SmartQueue />` component before the table section.
11. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/SmartQueue.tsx` — Smart queue widget with priority-sorted leads, inline verify/reject actions, collapsible, loading/empty states
- [ ] `src/app/(admin)/admin/verification/page.tsx` — `SmartQueue` wired above the verification table

### Acceptance Criteria

1. Widget shows up to 10 leads sorted by priority score descending
2. Each row shows priority badge, location info, guard name, SLA badge, and two action buttons
3. "Verify" button opens the existing `VerificationDialog` for that lead
4. "Reject" button opens an `AlertDialog` with a reason textarea
5. Loading state shows 3 skeleton rows
6. Empty state shows a green "All clear" card
7. Widget is collapsible via a chevron toggle in the card header
8. Widget appears above the verification table on the verification page
9. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on:

- `src/components/admin/SmartQueue.tsx`
- `src/app/(admin)/admin/verification/page.tsx`

### Out of Scope

- Drag-to-reorder leads in the smart queue (V2)
- Bulk verify/reject from the smart queue (V2)
- Smart queue for visits or payouts (V2)
- Keyboard shortcuts for verify/reject (V2)
