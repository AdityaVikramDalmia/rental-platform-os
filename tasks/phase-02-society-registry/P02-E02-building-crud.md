---
id: P02-E02
title: Building CRUD
phase: 2
status: done
depends_on: ["P02-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P02-E02: Building CRUD

## Overview

Implement building management within societies: Convex backend (mutations with uniqueness validation, queries with soft-delete filtering), floor label and flat number template validation utilities, and admin UI (buildings tab on society detail, create/edit dialog with tag-style floor input and template preview). Buildings are the physical units where guards patrol and leads are submitted.

## Task Queue

- [x] P02-E02-T01: Building Mutations (Create + Update + Soft Delete)
- [x] P02-E02-T02: Building Queries (List by Society + GetById)
- [x] P02-E02-T03: Floor Labels & Flat Number Template Validation
- [x] P02-E02-T04: Buildings Tab in Society Detail
- [x] P02-E02-T05: Add/Edit Building Dialog
- [x] P02-E02-T06: Building Backend Tests

---

## T01: Building Mutations (Create + Update + Soft Delete)

### Objective

Create `convex/buildings.ts` with `create`, `update`, and `softDelete` mutations. Enforce building name uniqueness within a society, set `is_deleted: false` on create, and validate that the parent society exists. The `softDelete` mutation sets `is_deleted: true` rather than removing the document.

### Required Reading

- `notes/features/01-society-registry.md` — "Business Rules" section (uniqueness, delete protection)
- `notes/02-data-models.md` — Section B (Building) — field definitions
- `notes/10-convex-schema.md` — `buildings` table schema + indexes (`by_society_and_name`)
- `notes/11-convex-architecture.md` — Soft delete pattern, function wrapper

### Key Rules

1. Import `mutation` from `./functions` — NEVER from `_generated/server`. Enables automatic audit logging.
2. RBAC: `requirePermission(ctx, "buildings.create")`, `requirePermission(ctx, "buildings.edit")`, `requirePermission(ctx, "buildings.delete")`.
3. **Create mutation**:
   - Validate `society_id` exists in societies table. Throw if not found.
   - Validate `name` uniqueness within society: Query `by_society_and_name` index. Throw if a non-deleted building with the same name exists.
   - Default `status` to `"ACTIVE"`.
   - Default `is_deleted` to `false`.
   - `floor_labels` is required, must be non-empty array.
   - `flat_number_template` is optional.
4. **Update mutation**:
   - Validate building exists and is not deleted. Throw if `is_deleted === true`.
   - If `name` is being changed, re-validate uniqueness within society.
   - If `status` is being changed: `ACTIVE` ↔ `INACTIVE` are the only valid transitions.
   - Do NOT allow updating `society_id` (buildings don't move between societies).
   - Do NOT allow updating `is_deleted` through update (use softDelete for that).
5. **Soft delete mutation**:
   - Check if building has active leads (query `leads` table with `by_building_id` index, filter `status` NOT in terminal states). If active leads exist, throw: "Cannot delete building with active leads. Set it to INACTIVE instead."
   - Set `is_deleted: true`.
6. Building `status` values: `"ACTIVE"` and `"INACTIVE"` only. No `ONBOARDING`.
7. Trim `name` on create/update. Validate non-empty.

### Deliverables

- [ ] `convex/buildings.ts` — Exports `create` mutation: `(ctx, { society_id, name, total_floors, flats_per_floor?, total_flats?, floor_labels, flat_number_template?, notes? }) → Id<"buildings">`
- [ ] `convex/buildings.ts` — Exports `update` mutation: `(ctx, { id, name?, total_floors?, flats_per_floor?, total_flats?, floor_labels?, flat_number_template?, status?, notes? }) → null`
- [ ] `convex/buildings.ts` — Exports `softDelete` mutation: `(ctx, { id }) → null`

### Acceptance Criteria

1. `buildings.create({ society_id, name: "Tower A", total_floors: 20, floor_labels: [...] })` succeeds
2. Creating a second "Tower A" in the same society throws uniqueness error
3. Creating "Tower A" in a different society succeeds (uniqueness is per-society)
4. `buildings.update({ id, status: "INACTIVE" })` succeeds
5. `buildings.update({ id, society_id: otherSociety })` is not possible (arg not accepted)
6. `buildings.softDelete({ id })` sets `is_deleted: true` when no active leads
7. `buildings.softDelete({ id })` throws when building has active leads
8. Calling mutations without proper permission throws auth error
9. Audit logs auto-generated for all mutations
10. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Floor label validation logic (T03)
- Flat number template validation (T03)
- Admin UI (T04-T05)

**Note on leads table**: The `leads` table is already defined in `convex/schema.ts` (created in P01-E02). The softDelete mutation can directly query it — no conditional checks or try/catch needed.

---

## T02: Building Queries (List by Society + GetById)

### Objective

Add query functions to `convex/buildings.ts`: list buildings within a society (filtering out soft-deleted ones), and get a single building by ID with its parent society info.

### Required Reading

- `notes/features/01-society-registry.md` — "Convex Functions: Queries" section
- `notes/10-convex-schema.md` — `buildings` indexes: `by_society_id`, `by_society_and_name`
- `notes/11-convex-architecture.md` — Soft delete query pattern

### Key Rules

1. Use `requirePermission(ctx, "buildings.view")` on all queries.
2. **listBySociety query**:
   - Use `by_society_id` index.
   - **ALWAYS** filter `is_deleted !== true`. This is non-negotiable for soft-delete tables.
   - Return buildings ordered by name (sort in-memory after collect, since Convex doesn't support multi-field index ordering with filter).
   - Optionally filter by `status` if provided.
3. **getById query**:
   - Fetch building by ID.
   - If building is soft-deleted (`is_deleted === true`), return null or throw "Building not found".
   - Also fetch and include parent society name (for display in breadcrumbs/headers).
4. No pagination needed (V1 buildings per society is small — typically 1-5).
5. Return full building document including `floor_labels` and `flat_number_template` — frontend needs these for the building detail view.

### Deliverables

- [ ] `convex/buildings.ts` — Exports `listBySociety` query: `(ctx, { society_id, status? }) → Building[]`
- [ ] `convex/buildings.ts` — Exports `getById` query: `(ctx, { id }) → (Building & { society_name: string }) | null`

### Acceptance Criteria

1. `buildings.listBySociety({ society_id })` returns only non-deleted buildings
2. Soft-deleted buildings do NOT appear in list results
3. Results are ordered by building name alphabetically
4. Optional status filter works (only ACTIVE or only INACTIVE buildings)
5. `buildings.getById({ id })` returns building with `society_name` field
6. `buildings.getById` for a soft-deleted building returns null
7. Unauthorized calls throw auth error
8. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Building search (buildings don't have a search index — admin finds them via society detail)
- Aggregated counts on buildings (no guard/lead counts per building in V1)

---

## T03: Floor Labels & Flat Number Template Validation

### Objective

Extend `lib/validators.ts` with validation utilities for floor labels and flat number templates. These are used both in the building create/update mutations (server-side) and in the guard lead submission form (future Phase 4). Also add a flat number preview generator for the admin dialog.

### Required Reading

- `notes/features/01-society-registry.md` — "Building Configuration: Floors & Flat Number Template" section
- `notes/02-data-models.md` — Section B: `floor_labels` and `flat_number_template` field descriptions

### Key Rules

1. Add to existing `lib/validators.ts` — do NOT create a new file. This file is shared between Convex and frontend.
2. **`validateFloorLabels(labels: string[]): string[]`**:
   - Trim and uppercase each label.
   - Remove empty strings after trimming.
   - Validate no duplicates (throw if duplicate found).
   - Validate array is non-empty (throw if empty).
   - Return cleaned array.
   - Valid labels: any non-empty string. Common ones: `G`, `B1`, `B2`, `LG`, `M`, `P`, `1`, `2`, ..., `99`.
3. **`validateFlatNumberTemplate(template: { prefix?: string, floor_digits: number, unit_digits: number }): void`**:
   - `floor_digits` must be positive integer (1-4 range).
   - `unit_digits` must be positive integer (1-4 range).
   - `prefix` if provided must be ≤10 chars.
   - Throw descriptive error on invalid input.
4. **`generateFlatNumberPreview(template: { prefix?: string, floor_digits: number, unit_digits: number }): string`**:
   - Generate an example flat number from the template.
   - Example: `{ prefix: "A-", floor_digits: 2, unit_digits: 2 }` → `"A-0101"`
   - Use floor "01" and unit "01" as the sample values.
   - Used in the admin dialog to show "Preview: A-0101".
5. **`validateFlatNumberAgainstTemplate(flatNumber: string, template: { prefix?: string, floor_digits: number, unit_digits: number }): boolean`**:
   - Check if a flat number matches the template pattern.
   - Strip prefix if present.
   - **IMPORTANT**: The floor portion can be alphanumeric (e.g., `G`, `B1`, `B2`) not just digits. The spec shows examples like `A-G01`, `A-B101`. So the floor token is `floor_digits` characters that can be letters or digits. The unit portion is always digits.
   - Total remaining after prefix must be exactly `floor_digits + unit_digits` characters, where the last `unit_digits` chars are digits.
   - Return boolean (caller decides error message).
   - This will be called during lead submission (Phase 4) but is defined now for completeness.
6. All functions must be pure (no DB access, no side effects) — they're utility functions.

### Deliverables

- [ ] `lib/validators.ts` — Extended with `validateFloorLabels()`, `validateFlatNumberTemplate()`, `generateFlatNumberPreview()`, `validateFlatNumberAgainstTemplate()`

### Acceptance Criteria

1. `validateFloorLabels(["B1", "G", "1", "2"])` returns `["B1", "G", "1", "2"]`
2. `validateFloorLabels(["b1", " g ", "1"])` returns `["B1", "G", "1"]` (trimmed + uppercased)
3. `validateFloorLabels(["1", "1"])` throws duplicate error
4. `validateFloorLabels([])` throws empty error
5. `validateFlatNumberTemplate({ floor_digits: 2, unit_digits: 2 })` succeeds
6. `validateFlatNumberTemplate({ floor_digits: 0, unit_digits: 2 })` throws
7. `generateFlatNumberPreview({ prefix: "A-", floor_digits: 2, unit_digits: 2 })` returns `"A-0101"`
8. `generateFlatNumberPreview({ floor_digits: 1, unit_digits: 3 })` returns `"1001"` (no prefix)
9. `validateFlatNumberAgainstTemplate("A-0101", { prefix: "A-", floor_digits: 2, unit_digits: 2 })` returns `true`
10. `validateFlatNumberAgainstTemplate("A-G01", { prefix: "A-", floor_digits: 1, unit_digits: 2 })` returns `true` (alphanumeric floor "G")
11. `validateFlatNumberAgainstTemplate("A-B101", { prefix: "A-", floor_digits: 2, unit_digits: 2 })` returns `true` (alphanumeric floor "B1")
12. `validateFlatNumberAgainstTemplate("B-0101", { prefix: "A-", floor_digits: 2, unit_digits: 2 })` returns `false` (wrong prefix)
13. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Integration with Mutations (Mandatory)

Building `create` and `update` mutations (T01) MUST call these validators server-side:

- `validateFloorLabels()` on `floor_labels` in both create and update
- `validateFlatNumberTemplate()` on `flat_number_template` in both create and update (when provided)

This ensures invalid data never persists, regardless of frontend validation.

### Out of Scope

- UI components that use these validators (T04-T05)
- Flat number validation during lead submission (Phase 4 — but the `validateFlatNumberAgainstTemplate` utility is ready)

---

## T04: Buildings Tab in Society Detail

### Objective

Replace the Buildings tab placeholder (from E01-T06) with a functional buildings table. Shows all buildings in the society with their floor count, flat count, status, and action buttons. Includes an "Add Building" button and status toggle/delete actions per row.

### Required Reading

- `notes/features/01-society-registry.md` — "Building Management" section, "Building List" wireframe
- `notes/06-admin-panel-ux.md` — Table patterns, action buttons

### Key Rules

1. Component: `src/components/admin/BuildingTable.tsx`. Accept `society_id` prop. Uses `buildings.listBySociety` query.
2. Render inside the Buildings tab of the society detail page (`src/app/(admin)/admin/societies/[id]/page.tsx`).
3. Table columns:
   - **Name**: Building name
   - **Floors**: `total_floors` (or `floor_labels.length` as alternative display)
   - **Flats**: `total_flats` or "—" if not set
   - **Floor Labels**: Truncated preview (e.g., "B1, G, 1, 2, ... +16 more")
   - **Status**: Badge (`ACTIVE` green, `INACTIVE` gray)
   - **Actions**: Edit button, Status toggle button, Delete button
4. "Add Building" button at top of the tab → opens BuildingCreateDialog (T05) in create mode.
5. Edit button → opens BuildingCreateDialog in edit mode with pre-filled data.
6. Status toggle: Clicking toggles between ACTIVE ↔ INACTIVE. Call `buildings.update` mutation. Show toast on success.
7. Delete button: Show confirmation dialog "Are you sure? This will soft-delete the building." Call `buildings.softDelete` mutation. Handle error case (building has active leads → show error toast).
8. Empty state: "No buildings yet. Add your first building to this society."
9. Real-time: Table auto-updates via Convex subscriptions.

### Deliverables

- [ ] `src/components/admin/BuildingTable.tsx` — Building list table with status badges, action buttons, empty state
- [ ] `src/app/(admin)/admin/societies/[id]/page.tsx` — Updated: Buildings tab renders `BuildingTable` instead of placeholder

### Acceptance Criteria

1. Buildings tab shows all non-deleted buildings in the society
2. Table columns display correct data for each building
3. Floor labels show truncated preview with "+N more" for long lists
4. Status badges use correct colors
5. "Add Building" button is visible and functional (opens dialog)
6. Edit button opens dialog with pre-filled building data
7. Status toggle switches ACTIVE ↔ INACTIVE with toast feedback
8. Delete shows confirmation → calls softDelete → building disappears from list
9. Delete with active leads shows error toast (does not delete)
10. Empty state displays when society has no buildings
11. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Building detail page (V1 doesn't need a separate page — all info visible in table/dialog)
- Inline editing of floor labels or template (use the edit dialog)

---

## T05: Add/Edit Building Dialog

### Objective

Create a dialog component for creating and editing buildings. The complex parts: a tag-style input for floor labels (admin types each label one by one) and a flat number template configuration section with live preview. Uses `react-hook-form` + `zod` for validation.

### Required Reading

- `notes/features/01-society-registry.md` — "Add/Edit Building Dialog" wireframe, "Building Configuration: Floors & Flat Number Template" section
- `notes/02-data-models.md` — Section B: all building fields

### Key Rules

1. Component: `src/components/admin/BuildingCreateDialog.tsx`. Accept props: `open`, `onOpenChange`, `societyId`, `building?` (edit mode if present).
2. Also create: `src/components/admin/FloorLabelsInput.tsx` — a reusable tag-style input component for floor labels.
3. Use shadcn/ui: `Dialog`, `Form`, `Input`, `Button`, `Badge`, `Switch` (for template toggle), `Separator`.
4. Zod schema:
   - `name`: `z.string().min(1, "Name is required").trim()`
   - `total_floors`: `z.number().int().min(1, "Must have at least 1 floor")`
   - `flats_per_floor`: `z.number().int().min(1).optional()`
   - `total_flats`: `z.number().int().min(1).optional()`
   - `floor_labels`: `z.array(z.string()).min(1, "At least one floor label required")`
   - `flat_number_template`: Optional object with `prefix`, `floor_digits`, `unit_digits`
   - `notes`: `z.string().optional()`
5. **FloorLabelsInput component**:
   - Text input where admin types a label and presses Enter/comma to add it.
   - Each label appears as a `Badge` with an "×" remove button.
   - Labels are uppercased on add (use `validateFloorLabels` from T03).
   - Duplicate detection: show inline error "Duplicate label" if already exists.
   - Ordering matters: labels appear in the order entered (basement → ground → upper floors).
   - Quick-add helper: "Add floors 1-N" button that bulk-adds numbered floors.
6. **Flat number template section**:
   - Collapsible/toggle: "Use flat number template" switch.
   - When enabled, show: Prefix (text input), Floor Digits (number 1-4), Unit Digits (number 1-4).
   - Live preview: Show generated example using `generateFlatNumberPreview()` from T03.
   - Preview updates as admin types: "Preview: A-0101".
7. **Total flats auto-calculation**: If `flats_per_floor` is set and `total_floors` is set, auto-calculate `total_flats = total_floors × flats_per_floor`. Show as read-only computed value. Admin can override by typing.
8. On submit:
   - Create: Call `buildings.create` with `society_id` → toast "Building created" → close.
   - Edit: Call `buildings.update` → toast "Building updated" → close.
9. Handle errors: Uniqueness violation → show "A building with this name already exists in this society" toast.
10. Use validators from T03 for floor labels and template validation before submitting.

### Deliverables

- [ ] `src/components/admin/BuildingCreateDialog.tsx` — Full building form dialog with create/edit modes
- [ ] `src/components/admin/FloorLabelsInput.tsx` — Tag-style input for floor label management

### Acceptance Criteria

1. Dialog opens in create mode with empty fields
2. Dialog opens in edit mode with pre-filled fields (including floor labels as tags)
3. Floor labels input: typing "G" + Enter adds a "G" badge
4. Floor labels input: duplicate label shows error and is not added
5. Floor labels input: "×" on a badge removes that label
6. Floor labels are uppercased automatically
7. "Add floors 1-N" helper adds numbered floors
8. Flat number template toggle shows/hides template fields
9. Template preview updates live as prefix/digits change
10. Auto-calculated total_flats updates when floors × flats_per_floor changes
11. Submitting with no floor labels shows validation error
12. Successful create/edit shows toast and closes dialog
13. Name uniqueness error shows descriptive toast
14. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
npm run build
```

### Out of Scope

- Drag-and-drop reordering of floor labels (V2 — V1 uses sequential input)
- Floor label import from CSV (V2)
- Building photo upload (not in V1 spec)

---

## T06: Building Backend Tests

### Objective

Write comprehensive tests for building mutations, queries, and validation utilities using `convex-test` and `vitest`. Cover CRUD operations, soft delete, uniqueness constraints, permission checks, and validator functions.

### Required Reading

- `notes/11-convex-architecture.md` — "Testing Patterns" section
- Existing test files from P01 and P02-E01-T07 (`convex/societies.test.ts`) for format reference

### Key Rules

1. Test files:
   - `convex/buildings.test.ts` — Mutation and query tests
   - `lib/__tests__/validators.test.ts` — Extended with floor label and flat number template tests (if file exists, add to it; if not, create it)
2. Use `convex-test` + `vitest`.
3. **Mutation tests**:
   - Create: happy path, missing required fields, invalid society_id, duplicate name in same society, duplicate name in different society (should succeed)
   - Update: field update, status toggle, name change with uniqueness check, attempt to update deleted building
   - Soft delete: happy path, delete with active leads (should throw), delete already-deleted building
4. **Query tests**:
   - listBySociety: returns non-deleted only, status filter, empty results
   - getById: found, not found, soft-deleted (returns null)
5. **Validator tests** (pure functions — no Convex context needed):
   - `validateFloorLabels`: valid input, empty array, duplicates, trimming, uppercasing
   - `validateFlatNumberTemplate`: valid template, zero digits, negative digits, prefix too long
   - `generateFlatNumberPreview`: with prefix, without prefix, various digit counts
   - `validateFlatNumberAgainstTemplate`: matching format, wrong prefix, wrong length, edge cases
6. Permission tests: Verify each mutation rejects unauthorized calls.
7. The `leads` table already exists in schema (from P01-E02). For softDelete tests, insert test lead documents to verify the active-leads guard. No mocking needed.

### Deliverables

- [ ] `convex/buildings.test.ts` — Building mutation and query test suite
- [ ] `lib/__tests__/validators.test.ts` — Extended with floor labels and flat number template validation tests

### Acceptance Criteria

1. All tests pass: `npm run test -- convex/buildings.test.ts`
2. All tests pass: `npm run test -- lib/__tests__/validators.test.ts`
3. Create mutation: ≥4 test cases
4. Update mutation: ≥4 test cases
5. Soft delete: ≥3 test cases
6. List query: ≥3 test cases (incl. soft-delete filtering)
7. GetById query: ≥2 test cases
8. Validator functions: ≥15 test cases total across all 4 functions (including alphanumeric floor token tests)
9. Permission enforcement: ≥2 test cases (authorized + unauthorized)
10. `npx tsc --noEmit` passes

### Verification

```bash
npm run test -- convex/buildings.test.ts
npm run test -- lib/__tests__/validators.test.ts
npx tsc --noEmit
```

### Out of Scope

- UI component tests (manual verification for V1)
- Performance testing (V1 scale is ~5 buildings per society)
