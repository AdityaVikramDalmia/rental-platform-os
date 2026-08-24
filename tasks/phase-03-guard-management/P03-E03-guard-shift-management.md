---
id: P03-E03
title: Guard Shift Management
phase: 3
status: done
depends_on: ["P03-E01", "P02-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P03-E03: Guard Shift Management

## Overview

Implement the full shift management system: Convex mutations for CRUD with soft delete, queries including the computed schedule logic (overrides replace recurring for specific dates), admin UI (weekly calendar view on guard detail page, add/edit shift dialog), and tests. Shifts are informational — used for visit assignment soft warnings and ops coordination, never enforced by the system.

## Prerequisites

- **Read first**: [P03-E01 Completion Summary](P03-E01-guard-account-backend.md#completion-summary) — know the guard backend structure and function patterns.
- **Read first**: [P02-E02 Completion Summary](../phase-02-society-registry/P02-E02-building-crud.md#completion-summary) — know building data structure (shifts reference buildings for BUILDING location type).
- Guard backend (E01) working: guard records exist for shift assignment.
- Building CRUD (P02-E02) working: buildings exist for shift location dropdowns.

## Task Queue

- [x] P03-E03-T01: Shift Mutations (Create + Update + Soft Delete)
- [x] P03-E03-T02: Shift Queries (List + Computed Schedule)
- [x] P03-E03-T03: Shifts Tab UI (Admin Calendar)
- [x] P03-E03-T04: Add/Edit Shift Dialog
- [x] P03-E03-T05: Shift Backend Tests

---

## T01: Shift Mutations (Create + Update + Soft Delete)

### Objective

Create `convex/guardShifts.ts` with `create`, `update`, and `softDelete` mutations. Validate conditional fields (RECURRING needs `day_of_week`, OVERRIDE needs `specific_date`), validate BUILDING location requires `building_id`, and enforce soft delete pattern.

### Required Reading

- `notes/features/02-guard-management.md` — "User Stories: Admin Manage Guard Shifts" section
- `notes/02-data-models.md` — Section E (Guard Shift) — field definitions, indexes, conditional fields
- `notes/10-convex-schema.md` — `guard_shifts` table validators and indexes
- `notes/13-constants-reference.md` — `SHIFT_TYPE`, `LOCATION_TYPE` enums, `guards.manage_shifts` permission

### Key Rules

1. File: `convex/guardShifts.ts`. Import `mutation` from `./functions` for audit logging.
2. RBAC: All mutations require `requirePermission(ctx, "guards.manage_shifts")`.
3. **`create` mutation**:
   - Args: `{ guard_user_id: v.id("users"), shift_type: v.string(), day_of_week?: v.optional(v.number()), specific_date?: v.optional(v.number()), start_time: v.string(), end_time: v.string(), location_type: v.string(), building_id?: v.optional(v.id("buildings")), location_label?: v.optional(v.string()), notes?: v.optional(v.string()) }`
   - Validate `guard_user_id` exists and is a GUARD user. Throw otherwise.
   - Validate `shift_type` is `RECURRING` or `OVERRIDE`.
   - If `RECURRING`: `day_of_week` is required (0-6, Sun-Sat). `specific_date` must NOT be provided.
   - If `OVERRIDE`: `specific_date` is required (Unix ms, midnight of date). `day_of_week` must NOT be provided.
   - Validate `start_time` and `end_time` format: `HH:MM` (24h). Use regex: `/^([01]\d|2[0-3]):[0-5]\d$/`.
   - Validate `end_time > start_time` (simple string comparison works for HH:MM). **Exception**: overnight shifts (e.g., 22:00 → 06:00) are allowed — skip this validation if `end_time < start_time`.
   - Validate `location_type` is one of: `BUILDING`, `MAIN_GATE`, `PARK`, `PARKING`, `OTHER`.
   - If `location_type === "BUILDING"`: `building_id` is required. Validate building exists and is not deleted.
   - If `location_type !== "BUILDING"`: `building_id` must NOT be provided.
   - Set `created_by_admin_id` from authenticated user.
   - Set `is_deleted: false`.
   - **Overlapping shifts are allowed** — guard might cover multiple areas in split shifts. No overlap validation.
4. **`update` mutation**:
   - Args: `{ shift_id: v.id("guard_shifts"), ...same optional fields as create }`
   - Validate shift exists and is not deleted.
   - Same conditional validations as create for any changed fields.
   - Cannot change `guard_user_id` (shifts don't transfer between guards).
   - Cannot change `shift_type` (delete and recreate instead).
5. **`softDelete` mutation**:
   - Args: `{ shift_id: v.id("guard_shifts") }`
   - Set `is_deleted: true`. No cascading effects (shifts are informational).
6. All times are IST (Indian Standard Time). Single timezone for V1. No timezone field needed.

### Deliverables

- [ ] `convex/guardShifts.ts` — `create`, `update`, `softDelete` mutations

### Acceptance Criteria

1. `create` with `RECURRING` + `day_of_week` succeeds
2. `create` with `RECURRING` without `day_of_week` throws
3. `create` with `OVERRIDE` + `specific_date` succeeds
4. `create` with `OVERRIDE` without `specific_date` throws
5. `create` with `BUILDING` location + `building_id` succeeds
6. `create` with `BUILDING` location without `building_id` throws
7. `create` with `MAIN_GATE` location + `building_id` throws (building_id not allowed)
8. Invalid `start_time` format (e.g., "6:00") throws
9. `update` can change start_time, end_time, location without changing shift_type
10. `softDelete` sets `is_deleted: true`
11. Operating on deleted shift throws
12. All mutations require `guards.manage_shifts` permission
13. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Computed schedule logic (T02)
- UI components (T03-T04)
- Shift overlap validation (intentionally not enforced)
- Multi-timezone support (V2)

---

## T02: Shift Queries (List + Computed Schedule)

### Objective

Add queries to `convex/guardShifts.ts`: list all shifts for a guard (admin view), compute the schedule for a specific date range (resolving overrides vs recurring), and a guard-facing query for own shifts.

### Required Reading

- `notes/features/02-guard-management.md` — "Computed Shift Logic" section (override priority over recurring)
- `notes/02-data-models.md` — Section E indexes: `by_guard_user_id`, `by_guard_and_day`, `by_guard_and_date`

### Key Rules

1. **`listByGuard` query** (admin view):
   - Args: `{ guard_user_id: v.id("users"), shift_type?: v.optional(v.string()) }`
   - RBAC: `requirePermission(ctx, "guards.view")`
   - Use `by_guard_user_id` index. Filter `is_deleted !== true`.
   - Optionally filter by `shift_type` (RECURRING or OVERRIDE).
   - Return all non-deleted shifts for this guard, ordered by day_of_week (for recurring) or specific_date (for overrides).
   - Enrich with `building_name` if `building_id` is set.

2. **`getSchedule` query** (computed schedule for date range):
   - Args: `{ guard_user_id: v.id("users"), from_date: v.number(), to_date: v.number() }`
   - RBAC: `requirePermission(ctx, "guards.view")`
   - For each date in the range:
     1. Check for `OVERRIDE` entries on that `specific_date` (use `by_guard_and_date` index).
     2. If overrides exist → use them for that date.
     3. If no overrides → look up `RECURRING` entries for that `day_of_week` (use `by_guard_and_day` index).
   - Return: `{ date: number, shifts: Shift[], source: "OVERRIDE" | "RECURRING" }[]`
   - Filter out `is_deleted` shifts in all lookups.
   - **Max range**: 30 days. Throw if range exceeds 30 days.
   - Enrich each shift with `building_name` and `location_display` (human-readable location string).

3. **`getMySchedule` query** (guard-facing):
   - Args: `{ from_date: v.number(), to_date: v.number() }`
   - Auth: Use `requireAuth(ctx)` + verify `user_type === "GUARD"`. Do NOT use `requireGuard(ctx)` — that blocks INACTIVE guards. Per spec, INACTIVE guards can still login and view their history/schedule. BANNED guards are blocked by `requireAuth`.
   - Same computed logic as `getSchedule` but uses the authenticated guard's `user_id`.
   - Max range: 7 days (guard UI only shows next 7 days).

4. Helper function `getDayOfWeek(dateMs: number): number` — convert Unix ms to day of week (0-6, Sun-Sat). Use `new Date(dateMs).getDay()`.

5. Helper function `getDateRange(from: number, to: number): number[]` — return array of midnight timestamps for each day in range.

### Deliverables

- [ ] `convex/guardShifts.ts` — `listByGuard`, `getSchedule`, `getMySchedule` queries + helper functions

### Acceptance Criteria

1. `listByGuard` returns all non-deleted shifts for a guard
2. `listByGuard` with shift_type filter returns only that type
3. Soft-deleted shifts do NOT appear in results
4. `getSchedule` for a date with an override returns the override (not recurring)
5. `getSchedule` for a date without override falls back to recurring
6. `getSchedule` for a date with no shifts (override or recurring) returns empty for that date
7. `getSchedule` range >30 days throws
8. `getMySchedule` uses authenticated guard's ID (not passed as arg)
9. `getMySchedule` range >7 days throws
10. All shifts enriched with `building_name` when applicable
11. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Shift availability heatmap (Phase 12 analytics)
- Shift conflict detection (intentionally not enforced)
- Push notifications for shift changes (V2)

---

## T03: Shifts Tab UI (Admin Calendar)

### Objective

Replace the Shifts tab placeholder on the guard detail page (E02-T04) with a visual weekly calendar view showing recurring shifts and overrides. Admin can see at a glance which shifts are recurring (base schedule) vs overrides (one-time). Includes "Add Shift" button and click-to-edit on existing shifts.

### Required Reading

- `notes/features/02-guard-management.md` — "Shift Management Tab" section (weekly grid, color coding)
- `notes/06-admin-panel-ux.md` — Shift calendar patterns

### Key Rules

1. Component: `src/components/admin/ShiftCalendar.tsx`. Accept `guard_user_id` prop.
2. Render inside the Shifts tab of the guard detail page.
3. **Weekly view layout**:
   - 7 columns (Mon → Sun) — start week on Monday for Indian convention.
   - Rows represent time slots (or use a free-form block layout).
   - Recurring shifts: colored blocks (e.g., blue/indigo).
   - Override shifts: different color (e.g., amber/orange) with a small "Override" badge.
4. **Date navigation**: Show current week by default. "← Previous" / "Next →" buttons to navigate weeks. Display "Week of {date}".
5. Use `guardShifts.getSchedule` query with the selected week's date range.
6. Each shift block shows: time range + location (building name or location type).
7. Click a shift block → opens ShiftCreateDialog (T04) in edit mode.
8. "Add Shift" button at top → opens ShiftCreateDialog in create mode.
9. **Recurring vs Override toggle/view**: Option to view "Recurring Schedule" (weekly base) vs "This Week's Actual Schedule" (with overrides applied). Default: actual schedule.
10. Empty state: "No shifts scheduled. Add shifts to track this guard's schedule."
11. Real-time updates via Convex subscription.
12. Use shadcn/ui components for layout. The calendar can be a custom grid — no need for a third-party calendar library.

### Deliverables

- [ ] `src/components/admin/ShiftCalendar.tsx` — Weekly calendar view
- [ ] `src/app/(admin)/admin/guards/[id]/page.tsx` — Updated: Shifts tab renders ShiftCalendar

### Acceptance Criteria

1. Shifts tab shows weekly calendar instead of placeholder
2. Recurring shifts shown as colored blocks (blue/indigo)
3. Override shifts shown in different color (amber) with badge
4. Week navigation (previous/next) works
5. Each shift block shows time + location
6. Clicking shift opens edit dialog
7. "Add Shift" button visible and functional
8. Empty state displays when no shifts exist
9. Real-time: adding a shift updates the calendar immediately
10. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Drag-and-drop shift creation/editing (V2)
- Month view (V2 — V1 is weekly only)
- Print schedule (V2)
- Shift templates (V2 — "apply same schedule as Guard X")

---

## T04: Add/Edit Shift Dialog

### Objective

Create a dialog for creating and editing shifts. Handles the conditional fields (RECURRING vs OVERRIDE), location type with building dropdown, and time validation. Uses `react-hook-form` + `zod`.

### Required Reading

- `notes/features/02-guard-management.md` — "Shift Management Tab" section (shift form fields)
- `notes/02-data-models.md` — Section E: all shift fields and their conditions

### Key Rules

1. Component: `src/components/admin/ShiftCreateDialog.tsx`. Accept props: `open`, `onOpenChange`, `guardUserId`, `guardSocietyId` (for building dropdown), `shift?` (edit mode if present).
2. Use shadcn/ui: `Dialog`, `Form`, `Select`, `Input`, `Button`, `RadioGroup` (for shift type), `Calendar` (for date picker, override only).
3. Zod schema:
   - `shift_type`: `z.enum(["RECURRING", "OVERRIDE"])`
   - `day_of_week`: `z.number().min(0).max(6)` — required if RECURRING (use `z.refine`)
   - `specific_date`: `z.number()` — required if OVERRIDE
   - `start_time`: `z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time format")`
   - `end_time`: `z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time format")`
   - `location_type`: `z.enum(["BUILDING", "MAIN_GATE", "PARK", "PARKING", "OTHER"])`
   - `building_id`: `z.string()` — required if location_type is BUILDING
   - `location_label`: `z.string().optional()`
   - `notes`: `z.string().optional()`
4. **Shift type selection**:
   - Radio group: "Recurring (weekly)" / "One-time Override"
   - If RECURRING: show day-of-week dropdown (Mon, Tue, Wed, ..., Sun)
   - If OVERRIDE: show date picker
5. **Location type**:
   - Dropdown: "Building", "Main Gate", "Park", "Parking", "Other"
   - If "Building": show building dropdown, populated from `buildings.listBySociety({ society_id: guardSocietyId })`. Only non-deleted, ACTIVE buildings.
   - If not "Building": optionally show `location_label` text input for custom description.
6. **Time inputs**: Two inputs for start and end time. Use `type="time"` HTML input or a custom time picker. Validate HH:MM format.
7. On submit:
   - Create: call `guardShifts.create` → toast "Shift created" → close.
   - Edit: call `guardShifts.update` → toast "Shift updated" → close.
8. In edit mode: `shift_type` is read-only (cannot change RECURRING ↔ OVERRIDE — delete and recreate).
9. Delete button in edit mode: calls `guardShifts.softDelete` with confirmation → toast "Shift deleted" → close.
10. Day-of-week labels: Mon (1), Tue (2), Wed (3), Thu (4), Fri (5), Sat (6), Sun (0). **Note**: JavaScript `getDay()` returns 0=Sun, but display should start with Monday for Indian convention. Map accordingly.

### Deliverables

- [ ] `src/components/admin/ShiftCreateDialog.tsx` — Add/edit shift dialog with conditional fields

### Acceptance Criteria

1. Dialog opens in create mode with empty fields
2. Dialog opens in edit mode with pre-filled fields (shift_type read-only)
3. Selecting RECURRING shows day-of-week dropdown
4. Selecting OVERRIDE shows date picker
5. Selecting BUILDING location shows building dropdown (filtered by guard's society)
6. Selecting non-BUILDING location hides building dropdown, shows optional label
7. Invalid time format shows validation error
8. Successful create/edit shows toast and closes
9. Delete button in edit mode shows confirmation, then soft-deletes
10. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
npm run build
```

### Out of Scope

- Bulk shift creation (V2 — "add same shift for Mon-Fri")
- Shift templates (V2)
- Overnight shift special handling in UI (the backend allows it; UI just shows the times)

---

## T05: Shift Backend Tests

### Objective

Write comprehensive tests for shift mutations, queries, and computed schedule logic. Cover CRUD operations, conditional field validation, soft delete, override-over-recurring priority, and edge cases.

### Required Reading

- `notes/11-convex-architecture.md` — "Testing Patterns" section
- `notes/04-state-machines.md` — No shift state machine, but review guard status effects on shifts
- Existing test files from P02 and P03-E01 for format reference

### Key Rules

1. Test file: `convex/guardShifts.test.ts`.
2. Use `convex-test` + `vitest`.
3. **Create mutation tests**:
   - Happy path: RECURRING with day_of_week
   - Happy path: OVERRIDE with specific_date
   - RECURRING without day_of_week → throws
   - OVERRIDE without specific_date → throws
   - BUILDING location without building_id → throws
   - BUILDING location with building_id → success
   - Non-BUILDING location with building_id → throws
   - Invalid time format → throws
   - Invalid guard_user_id → throws
   - Permission denied
4. **Update mutation tests**:
   - Update time/location → success
   - Update deleted shift → throws
5. **Soft delete tests**:
   - Delete existing shift → is_deleted true
   - Delete already-deleted shift → throws (or idempotent — check convention)
6. **Query tests**:
   - `listByGuard`: returns non-deleted only, filter by shift_type
   - `getSchedule`: date with override → override returned
   - `getSchedule`: date without override → recurring returned
   - `getSchedule`: date with no shifts → empty
   - `getSchedule`: range >30 days → throws
   - `getMySchedule`: guard context → success
   - `getMySchedule`: admin context → throws
   - `getMySchedule`: range >7 days → throws
7. **Computed schedule edge cases**:
   - Multiple recurring shifts for same day (split shifts) → all returned
   - Multiple overrides for same date → all returned
   - Override exists but is soft-deleted → falls back to recurring

### Deliverables

- [ ] `convex/guardShifts.test.ts` — Comprehensive shift test suite (≥20 test cases)

### Acceptance Criteria

1. All tests pass: `npm run test -- convex/guardShifts.test.ts`
2. Create mutation: ≥6 test cases (happy paths + validations)
3. Update mutation: ≥2 test cases
4. Soft delete: ≥2 test cases
5. List query: ≥2 test cases
6. Computed schedule: ≥5 test cases (override priority, fallback, empty, range limit)
7. Guard-facing query: ≥2 test cases (guard context, non-guard context)
8. Permission: ≥2 test cases
9. `npx tsc --noEmit` passes

### Verification

```bash
npm run test -- convex/guardShifts.test.ts
npx tsc --noEmit
```

### Out of Scope

- UI component tests (manual verification for V1)
- Performance testing (V1 scale: ~50 shifts per guard)
- Integration tests with real calendar dates (use fixed test dates)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- **`convex/guardShifts.ts`** (514 lines) — Full shift CRUD + computed schedule:
  - `create` mutation: validates RECURRING (needs day_of_week 0-6) vs OVERRIDE (needs specific_date), BUILDING location requires building_id, HH:MM time format validation, overnight shifts allowed
  - `update` mutation: conditional patching, shift_type immutable, location/building consistency validation
  - `softDelete` mutation: sets is_deleted true
  - `listByGuard` query: all non-deleted shifts for a guard, enriched with building_name + location_display, sorted by type then day/date
  - `getSchedule` query (admin): computed schedule for date range (max 30 days), overrides replace recurring for specific dates, returns per-day entries with source indicator
  - `getMySchedule` query (guard-facing): same logic but max 7 days, uses requireAuth (allows INACTIVE guards)
  - Helper functions: getStartOfDayIST, getDayOfWeek, getDateRange, enrichShiftWithBuilding, computeSchedule

- **`convex/functions.ts`** — Renamed PHASE1_AUDITED_TABLES → AUDITED_TABLES, added "guard_shifts" for audit trigger auto-logging

- **`src/components/admin/ShiftCalendar.tsx`** — Weekly calendar grid (Mon-Sun), week navigation, IST-aware date bounds, recurring shifts (indigo), override shifts (amber with badge), click-to-edit, "Add Shift" button, skeleton loading state

- **`src/components/admin/ShiftCreateDialog.tsx`** — Create/edit shift dialog with react-hook-form + zod validation, conditional fields (RECURRING shows day-of-week select, OVERRIDE shows date picker), location type with building dropdown, delete button in edit mode, shift_type read-only in edit mode

- **`src/app/(admin)/admin/guards/[id]/page.tsx`** — Shifts tab placeholder replaced with ShiftCalendar component

- **`convex/guardShifts.test.ts`** — 24 test cases: create (10), update (3), softDelete (2), listByGuard (2), getSchedule (5), getMySchedule (2)

### Key File Locations

| File                                         | Purpose                                       |
| -------------------------------------------- | --------------------------------------------- |
| `convex/guardShifts.ts`                      | Shift mutations + queries + computed schedule |
| `convex/guardShifts.test.ts`                 | 24 test cases                                 |
| `convex/functions.ts`                        | Audit trigger now includes guard_shifts       |
| `src/components/admin/ShiftCalendar.tsx`     | Weekly calendar component                     |
| `src/components/admin/ShiftCreateDialog.tsx` | Add/edit shift dialog                         |

### Deviations from Spec

1. **Audit table rename**: Renamed `PHASE1_AUDITED_TABLES` → `AUDITED_TABLES` and `Phase1AuditedTable` → `AuditedTable` in functions.ts since we're now in Phase 3 and the naming was misleading.
2. **No "All Shifts" toggle view**: The calendar shows the computed schedule (overrides applied) only. The spec mentioned an optional "Recurring Schedule" vs "This Week's Actual Schedule" toggle — kept the computed schedule as the single view for simplicity. Can add toggle later if needed.

### Gotchas for Next Epic

1. **IST timezone handling**: `getStartOfDayIST()` uses a fixed +5:30 offset (19800000 ms). All date comparisons in schedule queries use IST midnight timestamps. E04's guard shift schedule page (`getMySchedule`) should pass IST midnight timestamps for `from_date`/`to_date`.
2. **`getMySchedule` uses `requireAuth` not `requireGuard`**: INACTIVE guards can view their schedule. The guard layout already allows INACTIVE guards through (client-side check in guard-layout-client.tsx).
3. **Shift type immutability**: `update` mutation does NOT accept `shift_type` or `guard_user_id` as args. To change these, delete and recreate the shift.
4. **Test count**: Total suite is now 160 passing (136 prior + 24 new shift tests). 4 pre-existing seed failures remain (environment-related).
