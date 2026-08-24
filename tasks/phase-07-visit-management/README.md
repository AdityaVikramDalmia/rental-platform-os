# Phase 7: Visit Management (P07)

## Overview

Visits are the physical step in the lead-to-closure pipeline: admin schedules a visit for a VERIFIED lead, assigns an ACTIVE guard from the lead's society with shift-aware availability suggestions, and the guard executes the visit on-site — recording start time, completion, and outcome (INTERESTED / NOT_INTERESTED / FOLLOWUP). This phase delivers the full visit lifecycle (ASSIGNED→CONFIRMED→IN_PROGRESS→COMPLETED, plus CANCELLED/NO_SHOW terminals), admin visit board with scheduling modal, guard visit list with mobile-first execution flow, society_id denormalization for efficient filtering, and wiring of the `needs_reassignment` flag hook into the existing guard ban/deactivation flow.

## Dependencies

| Phase / Epic                                              | What It Provides for P07                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P03-E01 (Guard Accounts) + P03-E03 (Shift Management)** | `guard_shifts` table with RECURRING + OVERRIDE shift model, ACTIVE guard queries, guard status management (ACTIVE/INACTIVE/BANNED), `suspendGuard` Action with WorkOS suspension. **Ban path** (`banGuardInternal` at `guards.ts:770-810`) correctly flags non-terminal visits with `needs_reassignment = true`. **Deactivation path** (`ACTIVE→INACTIVE` at `guards.ts:279-285`) does NOT flag visits — P07-E01-T05 must add this. P07 CONSUMES the flag (filter + clear on reassign). |
| **P05-E01 (Verification Backend)**                        | VERIFIED leads exist (`status === "VERIFIED"`) for visit scheduling. Only VERIFIED leads can have visits created.                                                                                                                                                                                                                                                                                                                                                                       |
| **P06-E01 (Listing Backend)**                             | `listings.by_lead_id` index exists — P07 uses it to auto-link `listing_id` on visit creation if a listing exists for the lead                                                                                                                                                                                                                                                                                                                                                           |
| **P01-E02 (Schema & Infra)**                              | `convex/functions.ts` audit trigger wrapper — **`visits` is NOT yet in `AUDITED_TABLES`** (unlike what was originally assumed). P07-E01-T01 MUST add `"visits"` to the array (same pattern as P06 adding `"listings"`).                                                                                                                                                                                                                                                                 |
| **P04-E03 (Admin Lead Queue UI)**                         | Admin table + sidebar + filter patterns — P07 reuses for visit board UI layout                                                                                                                                                                                                                                                                                                                                                                                                          |

## Key Documentation

| Doc                                                           | Section                                                      | Why You Need It                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `notes/features/06-visit-management.md`                       | Full file                                                    | THE feature spec — visit scheduling, guard assignment, execution flow, business rules, edge cases                          |
| `notes/04-state-machines.md`                                  | Visit Status section                                         | All valid transitions, terminal states, ASSIGNED→IN_PROGRESS shortcut, outcome requirement on COMPLETED                    |
| `notes/02-data-models.md`                                     | Section J (Visit)                                            | Visit entity fields, types, indexes, relationships to leads/guards/listings/societies                                      |
| `notes/10-convex-schema.md`                                   | `visits` table (lines ~356-386), `audit_logs.action` union   | Exact validators, 7 indexes, confirms VISITS_INSERT/VISITS_UPDATE already in action literal union                          |
| `notes/13-constants-reference.md`                             | Visit statuses, outcomes, permissions, audit actions         | Badge colors, outcome emojis, permission strings (`visits.view/create/edit/cancel`), audit action strings                  |
| `notes/03-roles-and-permissions.md`                           | Visit Management permissions + Guard Permissions (Hardcoded) | RBAC matrix for admin mutations + guard hardcoded capabilities (ACTIVE guards can execute visits)                          |
| `notes/11-convex-architecture.md`                             | Function Layer Architecture, AUDITED_TABLES, Auth Helpers    | `mutation` from `./functions`, `requireGuard` / `requirePermission` patterns — P07-E01-T01 adds `visits` to AUDITED_TABLES |
| `notes/06-admin-panel-ux.md`                                  | Flow 4 (Schedule Visit), Ban Guard Dialog                    | Schedule visit modal layout, guard availability grid, ban impact on visits (needs_reassignment)                            |
| `notes/05-guard-portal-ux.md`                                 | Flow 5 (My Visits)                                           | Mobile-first visit list (Today/Upcoming/Past), visit card layout, execution flow, outcome emoji cards                      |
| `notes/features/02-guard-management.md`                       | Guard types, shift model, ban flow                           | RECURRING + OVERRIDE shifts, guard availability computation, ban/deactivation impact on assigned visits                    |
| `notes/features/09-quality-and-controls.md`                   | Guard ban impact on visits, needs_reassignment               | When guard banned/deactivated: flag non-terminal visits with `needs_reassignment = true`                                   |
| `tasks/phase-06-listings/P06-E01-listing-backend.md`          | Pattern reference for backend epic structure                 | Epic template, task sections, YAML frontmatter format, acceptance criteria style                                           |
| `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` | Pattern reference for admin UI epic structure                | Admin table, filter bar, sidebar panel, real-time subscription patterns                                                    |

## Epics

| ID      | Title                                                        | Tasks | Status | Depends On                                    |
| ------- | ------------------------------------------------------------ | ----- | ------ | --------------------------------------------- |
| P07-E01 | [Visit Backend](P07-E01-visit-backend.md)                    | 5     | done   | [P05-E01, P06-E01, P01-E02, P03-E01, P03-E03] |
| P07-E02 | [Visit Execution (Guard-Facing)](P07-E02-visit-execution.md) | 4     | done   | [P07-E01]                                     |
| P07-E03 | [Admin Visit Board UI](P07-E03-admin-visit-board-ui.md)      | 5     | done   | [P07-E01, P04-E03]                            |

## Dependency Graph

```
P05-E01  ──┐
P06-E01  ──┼──► P07-E01 ──┬──► P07-E02  (guard execution backend + UI)
P01-E02  ──┤              │
P03-E01  ──┤              └──► P07-E03  (admin visit board UI)
P03-E03  ──┘                   ▲
P04-E03  ─────────────────────┘
```

**Parallel note**: E02 (Guard Execution) and E03 (Admin Visit Board UI) can run in parallel once E01 is complete. E03 also depends on P04-E03 for existing admin table/filter UI patterns.

## Execution Order

1. **P07-E01**: Visit Backend — domain module creation, CRUD mutations, status transitions, guard availability query, needs_reassignment hook wiring, auto-link listing_id
2. **P07-E02 + P07-E03** _(parallel)_: Visit Execution (Guard Backend + Mobile UI) + Admin Visit Board UI

## Completion Criteria

### Backend

- [ ] `convex/visits.ts` exists with all mutations and queries
- [ ] `visits.create` creates visit from VERIFIED lead, denormalizes `society_id` from lead, auto-links `listing_id` via `listings.by_lead_id` index if listing exists, requires `assigned_guard_id` references an ACTIVE guard in the same society as the lead, sets `status: "ASSIGNED"`, sets `created_by_admin_id` from auth context (RBAC: `visits.create`)
- [ ] `visits.confirm` transitions ASSIGNED→CONFIRMED (RBAC: `visits.edit`)
- [ ] `visits.cancel` transitions ASSIGNED/CONFIRMED→CANCELLED with optional `reason` field stored in `outcome_notes` (RBAC: `visits.cancel`)
- [ ] `visits.markNoShow` transitions ASSIGNED/CONFIRMED→NO_SHOW with optional `notes` (RBAC: `visits.edit`)
- [ ] `visits.edit` updates `scheduled_start`, `scheduled_end`, `assigned_guard_id` on non-terminal visits; validates new guard is ACTIVE and in same society; clears `needs_reassignment` when guard is reassigned (RBAC: `visits.edit`)
- [ ] `visits.start` transitions ASSIGNED→IN_PROGRESS or CONFIRMED→IN_PROGRESS, sets `started_at = Date.now()`, requires caller is `assigned_guard_id` (auth: `requireGuard`)
- [ ] `visits.complete` transitions IN_PROGRESS→COMPLETED, requires `outcome` (INTERESTED/NOT_INTERESTED/FOLLOWUP), optional `outcome_notes`, sets `completed_at = Date.now()`, requires caller is `assigned_guard_id` (auth: `requireGuard`)
- [ ] `visits.getById` returns visit + lead info + guard info + listing info joins (RBAC: `visits.view`)
- [ ] `visits.list` paginated with filters: status, society_id, assigned_guard_id, date range (scheduled_start), needs_reassignment; default sort ascending by `scheduled_start` (upcoming first) (RBAC: `visits.view`)
- [ ] `visits.getMyVisits` returns guard's own visits with optional date range filter, ordered by `scheduled_start` (auth: `requireGuard`)
- [ ] `visits.getMyTodayVisits` returns guard's visits for today only (auth: `requireGuard`)
- [ ] `visits.getGuardAvailability` returns ALL guards for a society (including INACTIVE/BANNED with disabled indicators) with shift availability indicators for a given date/time range; requires `building_id` for same-building indicator computation (RBAC: `visits.create`)
- [ ] `visits.getTodayCount` returns count of today's non-terminal visits (IST day boundary), used by admin sidebar badge (RBAC: `visits.view`)
- [ ] `convex/leads.ts` reject mutation updated: cancels all non-terminal visits for rejected lead (resolves TODO P07 at line ~504)
- [ ] Status transition validation helper rejects invalid transitions (e.g., COMPLETED→anything, CANCELLED→anything)
- [ ] Guard ban/deactivation hook: **Ban path** (`banGuardInternal` at `guards.ts:770-810`) already sets `needs_reassignment = true` on non-terminal visits ✅. **Deactivation path** (`ACTIVE→INACTIVE` at `guards.ts:279-285`) is MISSING this logic — P07-E01-T05 adds the same `needs_reassignment` flagging to the deactivation handler. P07 CONSUMES the flag (filter in visit board, clear `needs_reassignment` on reassign via `visits.edit`).
- [ ] No schema changes needed — `visits` table already defined in `convex/schema.ts`, `VISITS_INSERT`/`VISITS_UPDATE` already in `audit_logs.action` union
- [ ] `"visits"` added to `AUDITED_TABLES` array in `convex/functions.ts` (was missing — same pattern as P06 adding `"listings"`)
- [ ] All mutations use `mutation` from `./functions` (not `_generated/server`) for audit triggers
- [ ] All admin mutations check exact permission strings via `requirePermission`
- [ ] Guard-facing mutations (`start`, `complete`) use `requireGuard` (NOT `requirePermission`) — guards have hardcoded capabilities, not RBAC

### Admin UI

- [ ] "Visits" nav item in admin sidebar
- [ ] Visit board page at `/admin/visits` with data table: columns (Lead, Society, Date/Time, Guard, Status, Outcome, Notes), filterable by Status/Date/Society/Guard/needs_reassignment, sortable, paginated (20/page)
- [ ] "Schedule Visit" button → modal/dialog with: VERIFIED lead selector, datetime picker (start + end), guard availability grid with shift indicators (✅ on shift same building, ⚠️ on shift different location or off duty, ❌ INACTIVE/BANNED not selectable), Save
- [ ] Visit detail/edit page at `/admin/visits/[id]` — edit schedule, reassign guard (clears `needs_reassignment`), admin status action buttons (Confirm, Cancel, Mark No-Show)
- [ ] `needs_reassignment` badge on visits needing guard reassignment + dedicated filter option
- [ ] Real-time updates via Convex subscriptions

### Guard UI

- [ ] Guard visit list page at `/guard/visits` — mobile-first, three sections: Today (highlighted), Upcoming (next 7 days), Past (last 30 days)
- [ ] Visit card shows: building + floor + flat, society name, date/time, status; "Start Visit" button for ASSIGNED/CONFIRMED visits
- [ ] Visit detail/execution page — Start Visit button (ASSIGNED/CONFIRMED→IN_PROGRESS), Complete Visit section (outcome emoji cards: 😊 Interested, 😐 Not Interested, 🔄 Follow-up), optional notes field, "Submit & Complete" button
- [ ] Shared `visit-status-badge.tsx` component with colors from `13-constants-reference.md`
- [ ] Bottom nav includes "Visits" tab

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] All status changes create `audit_logs` entries automatically via triggers
- [ ] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
convex/
  visits.ts                                # New: All visit mutations + queries + helpers

src/app/
  (admin)/admin/visits/
    page.tsx                               # Visit board page
    [id]/
      page.tsx                             # Visit detail/edit page
    components/
      visit-table.tsx                      # Data table with columns, filters
      visit-filters.tsx                    # Status/Date/Society/Guard/needs_reassignment filters
      schedule-visit-dialog.tsx            # Schedule visit modal (lead selector, datetime, guard grid)
      guard-availability-grid.tsx          # Guard list with shift-aware indicators (✅⚠️❌)
      visit-detail-panel.tsx               # Visit detail with edit form + status actions
      visit-status-actions.tsx             # Confirm/Cancel/Mark No-Show buttons
  (guard)/guard/visits/
    page.tsx                               # Guard visit list (Today/Upcoming/Past)
    [id]/
      page.tsx                             # Guard visit detail + execution page
    components/
      visit-card.tsx                       # Mobile visit card (building, flat, time, status)
      visit-section.tsx                    # Section header (Today/Upcoming/Past)
      visit-execution.tsx                  # Start + Complete flow with outcome selection
      outcome-selector.tsx                 # Emoji card selector (😊😐🔄)

src/components/shared/
  visit-status-badge.tsx                   # Visit status badge (ASSIGNED/CONFIRMED/IN_PROGRESS/COMPLETED/CANCELLED/NO_SHOW)
```

## Scope Boundaries

### IN This Phase

- Visit creation from VERIFIED leads with society_id denormalization and listing_id auto-linking
- Visit status lifecycle: ASSIGNED→CONFIRMED→IN_PROGRESS→COMPLETED (plus CANCELLED/NO_SHOW terminals)
- Guard assignment with shift-aware availability suggestions (soft warnings, not hard blocks)
- Guard visit execution: start visit, complete with outcome capture (INTERESTED/NOT_INTERESTED/FOLLOWUP)
- Admin visit board with filters, scheduling modal, detail/edit page, status action buttons
- Guard visit list (Today/Upcoming/Past sections) with mobile-first execution UI
- `needs_reassignment` flag: verifying P03's ban/deactivation hooks work + consuming the flag (admin filter + clear on reassign via `visits.edit`)
- Status transition validation helper
- Shared visit-status-badge component

### NOT In This Phase

- Closure creation from visit outcomes → **P08 (Closure)**
- Guard quality metrics from visit data (completion rate, outcome distribution) → **P11 (Quality & Controls)**
- Tenant visit requests / visit bounties → **P19 (Tenant Inquiry Pipeline)**
- Auto-cancellation when visit time passes with no status change → **Not implemented (no auto-transitions per spec)**
- GPS tracking of guard at visit location → **V2**
- Push notifications for visit reminders → **V2**
- i18n for guard visit pages → **P14 (i18n)**
