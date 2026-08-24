---
epic_id: P02-E01
title: "Society CRUD Verification"
type: hybrid
status: pending
depends_on_epic: P02-E01
verified_at: null
failures: 0
---

# P02-E01 Verification: Society CRUD

## Readiness Gates

- [ ] Epic `status: done` in frontmatter of `P02-E01-society-crud.md`
- [ ] Completion Summary exists at bottom of epic file
- [ ] Deviations reviewed (if any listed in Completion Summary)
- [ ] Phase 1 dependency complete: `P01-E08` is `done`
- [ ] Dev server running: `npm run dev` -> http://localhost:3000
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Admin login works at http://localhost:3000/dev/login with `admin@example.com` / `DevAdmin123!`
- [ ] Admin session has `societies.create`, `societies.edit`, and `societies.view` permissions

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests (list specific test files from epic deliverables)
npm run test -- convex/societies.test.ts
```

**Expected**: All commands exit 0. If test file doesn't exist yet, note it in Results.

---

## Scenarios

### V01: Society create mutation defaults and RBAC/audit behavior — AC Ref: T01-AC1 to T01-AC2, T01-AC6 to T01-AC7

**Precondition**: Admin is logged in via `/dev/login` using `admin@example.com` / `DevAdmin123!`; open `/admin/societies`.

**Actions**:

1. Click `Add Society` and submit `name="Verify Society A"`, `city="Mumbai"` with optional fields blank.
2. Capture created record ID from network response or Convex dashboard query result.
3. Open Convex dashboard and inspect the created `societies` record.
4. Validate an `audit_logs` entry exists for the create mutation.
5. Repeat the create attempt as a user without `societies.create` permission.

**Assert**:

- [ ] Create succeeds and returns a valid society ID.
- [ ] Created record has `status="ONBOARDING"` and non-null `created_by_admin_id`.
- [ ] Unauthorized create attempt fails with auth/permission error.
- [ ] Audit log entry is present for the successful mutation.

**Evidence**: screenshot + network + database record snapshot

---

### V02: Society status transition guardrails — AC Ref: T01-AC3 to T01-AC5

**Precondition**: Existing society in `ONBOARDING` state with 0 buildings.

**Actions**:

1. Open society detail page `/admin/societies/[id]` and use edit dialog to set status to `ACTIVE`.
2. Confirm mutation error when no buildings exist.
3. Insert or create one non-deleted building for the same society.
4. Retry status update to `ACTIVE`.
5. Attempt setting status back to `ONBOARDING`.

**Assert**:

- [ ] `ONBOARDING -> ACTIVE` fails when building count is 0.
- [ ] `ONBOARDING -> ACTIVE` succeeds after at least one building exists.
- [ ] Transition to `ONBOARDING` from any non-initial state is rejected.

**Evidence**: screenshot + mutation responses

---

### V03: Society queries list/filter/search and auth boundaries — AC Ref: T02-AC1 to T02-AC3, T02-AC7 to T02-AC9

**Precondition**: At least three societies exist across mixed `status` and `city` values.

**Actions**:

1. Open `/admin/societies` with empty search and no filters.
2. Verify rows appear alphabetically and include Buildings/Guards/Leads counts.
3. Apply status filter `ACTIVE`.
4. Apply city filter `Mumbai`.
5. Enter search text `Hiran` and wait for debounce.
6. Repeat query-triggering actions as unauthorized user.

**Assert**:

- [ ] Unfiltered list shows all societies with `building_count`, `guard_count`, and `lead_count`.
- [ ] Status filter returns only active societies.
- [ ] City filter returns only Mumbai societies.
- [ ] Name search returns matching societies and city filter still applies.
- [ ] Unauthorized query execution fails with auth/permission error.

**Evidence**: screenshot series + console/network

---

### V04: Society detail aggregates and not-found handling — AC Ref: T02-AC4 to T02-AC6, T06-AC8 to T06-AC9

**Precondition**: One society has known building/guard/lead distribution and at least 5 leads.

**Actions**:

1. Open `/admin/societies/[valid-id]`.
2. Validate header/stat cards values against database counts.
3. Verify recent leads ordering is newest first.
4. Navigate to `/admin/societies/[invalid-id]` with nonexistent ID.

**Assert**:

- [ ] Detail response includes correct `building_count`, `guard_count`, and `lead_stats` breakdown.
- [ ] `recent_leads` shows 5-10 most recent records in descending time order.
- [ ] Invalid ID is handled gracefully (null/not found path), not crash.
- [ ] Loading state skeleton appears while detail data loads.

**Evidence**: screenshot + database cross-check

---

### V05: Admin sidebar societies navigation behavior — AC Ref: T03-AC1 to T03-AC6

**Precondition**: Admin layout is loaded; test both expanded and collapsed sidebar states.

**Actions**:

1. Inspect sidebar ordering around Dashboard and Societies entries.
2. Click `Societies` and verify navigation target.
3. Open `/admin/societies` and `/admin/societies/[id]` to check active state.
4. Switch sidebar between expanded and collapsed.
5. Check visibility for user lacking `societies.view` permission.

**Assert**:

- [ ] `Societies` link appears in correct position.
- [ ] Link navigates to `/admin/societies`.
- [ ] Link is highlighted for list and detail routes.
- [ ] Link is hidden for users without `societies.view`.
- [ ] Icon remains visible in expanded and collapsed modes.
- [ ] Build succeeds for this navigation change.

**Evidence**: screenshot series

---

### V06: Society list page rendering and interactions — AC Ref: T04-AC1 to T04-AC10

**Precondition**: Admin is on `/admin/societies`; dataset includes multiple statuses and cities.

**Actions**:

1. Verify page renders within admin layout and table columns match spec.
2. Click a society name link.
3. Toggle status filter to `Active`.
4. Type search text and wait for 300ms debounce.
5. Confirm `Add Society` button visibility.
6. Re-run with empty dataset to check empty state.

**Assert**:

- [ ] Page renders at `/admin/societies` in admin layout.
- [ ] Table columns/data are correct (Name, City, Status, counts, Created).
- [ ] Status badge colors map correctly (amber/green/gray).
- [ ] Name click navigates to `/admin/societies/[id]`.
- [ ] Status filter and debounced search behave correctly.
- [ ] `Add Society` button is visible.
- [ ] Empty-state and loading skeleton states render correctly.
- [ ] Build passes.

**Evidence**: screenshot + console

---

### V07: Society create/edit dialog validation and submission flow — AC Ref: T05-AC1 to T05-AC11

**Precondition**: `SocietyCreateDialog` is reachable from list (create mode) and detail/list edit triggers (edit mode).

**Actions**:

1. Open create mode and verify fields are empty with no status field.
2. Submit empty form to trigger required-field validation.
3. Open edit mode and verify fields prefilled plus status dropdown.
4. Select `INACTIVE`, submit, and inspect confirmation dialog text.
5. Cancel confirmation, then confirm on second attempt.
6. Execute successful create and successful edit submissions.
7. Trigger invalid status transition to force backend error.
8. Observe submit button while mutation is in-flight.

**Assert**:

- [ ] Create mode has empty fields and no status dropdown.
- [ ] Edit mode has prefilled fields and status dropdown.
- [ ] Empty `name` and empty `city` show required validation errors.
- [ ] `INACTIVE` selection shows confirmation warning before mutation.
- [ ] Confirm proceeds, cancel returns to form without mutation.
- [ ] Successful create/edit show correct toast and close dialog.
- [ ] Failed transition shows error toast.
- [ ] Submit button is disabled during pending mutation.
- [ ] Typecheck passes.

**Evidence**: screenshot + console/network

---

### V08: Society detail page tabs and summary UX — AC Ref: T06-AC1 to T06-AC7, T06-AC10

**Precondition**: Valid society exists with address optional and aggregate stats populated.

**Actions**:

1. Open `/admin/societies/[id]`.
2. Inspect header block and stat cards.
3. Verify all four tabs and default active tab.
4. Switch to Guards, Leads, and Analytics tabs.
5. Click `Edit` and confirm edit dialog opens for same society.

**Assert**:

- [ ] Header shows name, status badge, city, address (if available), and edit button.
- [ ] Stat cards show correct buildings/guards/lead totals and breakdown.
- [ ] Tabs visible: Buildings, Guards, Leads, Analytics.
- [ ] Buildings tab is default active.
- [ ] Non-building tabs show phase-specific placeholder messages.
- [ ] Edit button opens dialog in edit mode.
- [ ] Build passes.

**Evidence**: screenshot series

---

### V09: Society backend test suite coverage and pass state — AC Ref: T01-AC8, T02-AC10, T05-AC11, T07-AC1 to T07-AC7

**Precondition**: Local test environment is healthy and dependencies installed.

**Actions**:

1. Run `npm run test -- convex/societies.test.ts`.
2. Inspect output for create/update/list/getById/search test group coverage.
3. Run `npx tsc --noEmit`.

**Assert**:

- [ ] Society test file passes with zero failures.
- [ ] Coverage includes minimum cases required for each mutation/query group.
- [ ] Permission and transition validations are explicitly tested.
- [ ] Typecheck passes.

**Evidence**: terminal output

---

## Results

| ID  | Status  | Evidence | Notes |
| --- | ------- | -------- | ----- |
| V01 | pending | -        | -     |
| V02 | pending | -        | -     |
| V03 | pending | -        | -     |
| V04 | pending | -        | -     |
| V05 | pending | -        | -     |
| V06 | pending | -        | -     |
| V07 | pending | -        | -     |
| V08 | pending | -        | -     |
| V09 | pending | -        | -     |

---

## Failure Reports

<!-- Verify Agent appends failure reports here. One section per failed scenario. -->
<!-- See references/failure-report-template.md for the format. -->
