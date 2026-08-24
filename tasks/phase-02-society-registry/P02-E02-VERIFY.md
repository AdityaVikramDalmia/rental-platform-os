---
epic_id: P02-E02
title: "Building CRUD Verification"
type: hybrid
status: pending
depends_on_epic: P02-E02
verified_at: null
failures: 0
---

# P02-E02 Verification: Building CRUD

## Readiness Gates

- [ ] Epic `status: done` in frontmatter of `P02-E02-building-crud.md`
- [ ] Completion Summary exists at bottom of epic file
- [ ] Deviations reviewed (if any listed in Completion Summary)
- [ ] Upstream epic `P02-E01` is `done`
- [ ] Phase 1 dependency complete: `P01-E08` is `done`
- [ ] Dev server running: `npm run dev` -> http://localhost:3000
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Admin login works at http://localhost:3000/dev/login with `admin@example.com` / `DevAdmin123!`
- [ ] Admin session has `buildings.create`, `buildings.edit`, `buildings.delete`, and `buildings.view` permissions

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests (list specific test files from epic deliverables)
npm run test -- convex/buildings.test.ts
npm run test -- lib/__tests__/validators.test.ts
```

**Expected**: All commands exit 0. If test file doesn't exist yet, note it in Results.

---

## Scenarios

### V01: Building create uniqueness, RBAC, and audit logging — AC Ref: T01-AC1 to T01-AC3, T01-AC8 to T01-AC9

**Precondition**: Two societies exist; admin is logged in and on `/admin/societies/[id]` Buildings tab.

**Actions**:

1. Create building `Tower A` in Society A with valid floor labels.
2. Attempt to create another `Tower A` in the same society.
3. Create `Tower A` in Society B.
4. Repeat create action as user without `buildings.create` permission.
5. Inspect `audit_logs` for successful mutations.

**Assert**:

- [ ] First create succeeds.
- [ ] Duplicate name in same society is rejected.
- [ ] Same name in different society is accepted.
- [ ] Unauthorized create attempt fails with auth/permission error.
- [ ] Audit logs exist for successful create mutations.

**Evidence**: screenshot + mutation responses + database snapshot

---

### V02: Building update and soft-delete lifecycle constraints — AC Ref: T01-AC4 to T01-AC7, T01-AC10

**Precondition**: One building without active leads and one building with active leads exist.

**Actions**:

1. Update building status to `INACTIVE`.
2. Verify update payload cannot include `society_id` reassignment.
3. Soft-delete building with no active leads.
4. Verify `is_deleted` flips to `true` in database.
5. Attempt soft-delete on building that has active leads.

**Assert**:

- [ ] `ACTIVE <-> INACTIVE` update works for valid building.
- [ ] `society_id` cannot be changed through update API.
- [ ] Soft-delete succeeds only when there are no active leads.
- [ ] Soft-delete fails with active leads and returns clear error.
- [ ] Typecheck passes.

**Evidence**: screenshot + network + database record snapshot

---

### V03: Building queries with soft-delete filtering and auth checks — AC Ref: T02-AC1 to T02-AC8

**Precondition**: Society has a mix of active, inactive, and soft-deleted buildings.

**Actions**:

1. Trigger `buildings.listBySociety({ society_id })` via Buildings tab load.
2. Confirm soft-deleted buildings are absent.
3. Validate alphabetical ordering by name.
4. Apply status filter and verify narrowed results.
5. Open building detail path/query use that resolves `getById` and includes `society_name`.
6. Query `getById` for a soft-deleted building.
7. Repeat query actions as unauthorized user.

**Assert**:

- [ ] List returns only non-deleted buildings.
- [ ] Ordering is alphabetical by name.
- [ ] Status filter returns only requested status values.
- [ ] `getById` response includes `society_name` for active building.
- [ ] `getById` returns null for soft-deleted building.
- [ ] Unauthorized calls fail with auth/permission error.
- [ ] Typecheck passes.

**Evidence**: screenshot + query output + console

---

### V04: Floor-label and flat-template utility correctness — AC Ref: T03-AC1 to T03-AC13

**Precondition**: Validator test runner is available; no app UI required.

**Actions**:

1. Execute unit tests for `validateFloorLabels` valid/trim/uppercase/duplicate/empty cases.
2. Execute unit tests for `validateFlatNumberTemplate` valid and invalid digit/prefix cases.
3. Execute unit tests for `generateFlatNumberPreview` with and without prefix.
4. Execute unit tests for `validateFlatNumberAgainstTemplate` including alphanumeric floor tokens (`G`, `B1`) and wrong-prefix negative case.

**Assert**:

- [ ] Floor label normalization and validation rules match AC expectations.
- [ ] Template validation enforces allowed digit ranges and prefix length.
- [ ] Preview output matches expected sample strings.
- [ ] Template matcher returns correct booleans for valid/invalid numbers, including alphanumeric floor tokens.
- [ ] Typecheck passes.

**Evidence**: terminal output

---

### V05: Buildings tab data table and row actions — AC Ref: T04-AC1 to T04-AC11

**Precondition**: Admin opens society detail page with Buildings tab populated.

**Actions**:

1. Open `/admin/societies/[id]` and verify Buildings tab contents.
2. Validate table column rendering for floors, flats, labels preview, status, actions.
3. Trigger `Add Building` dialog from tab header.
4. Trigger Edit action and verify prefilled dialog.
5. Toggle status and confirm toast feedback.
6. Attempt delete for building without active leads.
7. Attempt delete for building with active leads.
8. Open society with no buildings to verify empty state.

**Assert**:

- [ ] Buildings tab lists all non-deleted buildings for society.
- [ ] Long floor label lists show truncated preview with `+N more`.
- [ ] Status badge colors are correct.
- [ ] Add and Edit actions open appropriate dialog modes.
- [ ] Status toggle persists and shows success toast.
- [ ] Delete confirmation appears and successful soft-delete removes row.
- [ ] Delete is blocked with active leads and surfaces error toast.
- [ ] Empty-state message displays when no buildings exist.
- [ ] Build passes.

**Evidence**: screenshot series + console/network

---

### V06: Building dialog floor-label UX and template preview flow — AC Ref: T05-AC1 to T05-AC14

**Precondition**: `BuildingCreateDialog` is reachable from Buildings tab in create and edit modes.

**Actions**:

1. Open dialog in create mode and confirm blank defaults.
2. Open in edit mode and confirm prefilled values and floor-label tags.
3. Add floor label `G` with Enter.
4. Attempt duplicate label and verify validation feedback.
5. Remove a floor label using `x` on badge.
6. Use `Add floors 1-N` helper.
7. Enable flat number template section and edit prefix/digits.
8. Verify live preview updates.
9. Change floors/flats-per-floor values and verify auto-calculated total flats.
10. Submit with no floor labels to trigger validation.
11. Submit valid create/edit and observe success behavior.
12. Trigger duplicate building-name path and inspect error toast.

**Assert**:

- [ ] Create/edit mode initialization is correct.
- [ ] Floor-label tag input supports add, dedupe, remove, uppercase, and bulk add.
- [ ] Template section toggles visibility correctly.
- [ ] Preview string updates in real time.
- [ ] Total flats auto-calculates from floor and flats-per-floor changes.
- [ ] Missing floor labels blocks submit with validation message.
- [ ] Successful submit closes dialog and shows toast.
- [ ] Name uniqueness conflict shows descriptive error toast.
- [ ] Typecheck passes.

**Evidence**: screenshot + console

---

### V07: Building backend and validator test suite pass state — AC Ref: T06-AC1 to T06-AC10

**Precondition**: Test dependencies installed and local test environment healthy.

**Actions**:

1. Run `npm run test -- convex/buildings.test.ts`.
2. Run `npm run test -- lib/__tests__/validators.test.ts`.
3. Inspect output for required minimum case counts by category.
4. Run `npx tsc --noEmit`.

**Assert**:

- [ ] Both test targets pass with zero failures.
- [ ] Coverage includes required case counts for create/update/delete/list/getById/permissions.
- [ ] Validator tests cover all four utility functions and alphanumeric floor token edge cases.
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

---

## Failure Reports

<!-- Verify Agent appends failure reports here. One section per failed scenario. -->
<!-- See references/failure-report-template.md for the format. -->
