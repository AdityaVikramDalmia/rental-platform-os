# Feature: Society & Building Registry

> **Priority**: #2 in implementation order (after Auth)
> **Personas**: Super Admin, Ops Agent (with permissions)
> **Dependencies**: Auth + RBAC must exist first

## Purpose

The society registry is the **foundation** of the entire platform. Everything flows from it — guards are assigned to societies, leads reference buildings, visits happen at specific locations. Without societies and buildings, nothing else works.

## Entities Involved

- `societies` table
- `buildings` table

## User Stories

### Admin: Create a Society
**As an admin** with `societies.create` permission, I want to register a new society so that guards can be assigned and leads can be submitted for that society.

**Acceptance Criteria**:
- Form fields: name (required), city (required), address (optional), notes (optional)
- Status defaults to `ONBOARDING`
- Society appears in the society list immediately
- Audit log entry created: `SOCIETY_CREATED`

### Admin: Add Buildings to a Society
**As an admin** with `buildings.create` permission, I want to add buildings to a society so that guards and leads can reference specific buildings.

**Acceptance Criteria**:
- Form fields: name (required), total_floors (required), flats_per_floor (optional), total_flats (optional), notes (optional)
- Building is linked to the parent society
- Building status defaults to `ACTIVE`
- After first building is added, society status can transition from `ONBOARDING` → `ACTIVE`
- Audit log entry: `BUILDING_CREATED`

### Admin: Edit Society / Building
**As an admin** with `societies.edit` / `buildings.edit` permission, I want to update society/building details.

**Acceptance Criteria**:
- All fields editable except `_id`
- Status changes are tracked in audit log
- Setting society to `INACTIVE` shows a confirmation: "Guards in this society will be unable to submit new leads"
- Audit log entry: `SOCIETY_UPDATED` / `BUILDING_UPDATED` with field-level diff

### Admin: View Society Detail
**As an admin**, I want to see a society's full picture: its buildings, assigned guards, lead count, and status.

**Acceptance Criteria**:
- Society detail page shows:
  - Basic info (name, city, address, status)
  - Buildings list with metadata (name, floors, flats, status)
  - Assigned guards count (link to filtered guard list)
  - Lead stats: total submitted, verified, rejected, duplicate
  - Recent leads (last 5-10)
- Quick actions: Add Building, Add Guard, Edit Society

---

## Building Configuration: Floors & Flat Number Template

When adding a building, admin configures:

### Floor Labels
Admin manually enters every floor label in order. Supports named floors.

Example: `B2, B1, G, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20`

Named floor conventions:
- `G` = Ground
- `B1`, `B2` = Basement 1, 2
- `LG` = Lower Ground
- `M` = Mezzanine
- `P` = Podium

### Flat Number Template (Structured)

Admin defines a template per building:
- **Prefix** (optional): e.g., `A-`, `B/`, or empty
- **Floor digits**: how many digits for the floor part (e.g., 2)
- **Unit digits**: how many digits for the unit part (e.g., 2)

Example: prefix=`A-`, floor_digits=2, unit_digits=2
Generated pattern: `A-{FF}{UU}` → `A-0101`, `A-0102`, `A-G01`, `A-B101`

When a guard submits a lead, the flat number is validated against this template.
Error message: "Invalid flat number. Expected format: A-0101"

## Admin Panel UI

### Society List Page (`/admin/societies`)

| Column | Description |
|--------|------------|
| Name | Society name (clickable → detail page) |
| City | City |
| Status | Badge: ONBOARDING / ACTIVE / INACTIVE |
| Buildings | Count |
| Guards | Count |
| Leads | Total lead count |
| Created | Date |

**Filters**: Status, City
**Search**: By society name
**Actions**: + Add Society button

### Society Detail Page (`/admin/societies/[id]`)

- Header: Society name, status badge, edit button
- Tabs:
  - **Buildings**: Table of buildings + "Add Building" button
  - **Guards**: Filtered guard list for this society
  - **Leads**: Filtered lead list for this society
  - **Analytics**: Society-level stats (if analytics permission)

### Add/Edit Society Dialog

Simple form dialog (shadcn Dialog + Form):
- Name (text input, required)
- City (text input, required)
- Address (textarea, optional)
- Notes (textarea, optional)
- Status dropdown (only for edit)

### Add/Edit Building Dialog

- Name (text input, required, e.g., "Tower A")
- Total Floors (number input, required)
- Flats Per Floor (number input, optional)
- Total Flats (number input, optional — auto-calc if floors × flats_per_floor provided)
- Notes (textarea, optional)
- Floor Labels (tag input, required — admin types each floor label: B1, G, 1, 2, ...)
- Flat Number Prefix (text input, optional, e.g., "A-")
- Floor Digits (number input, required, e.g., 2)
- Unit Digits (number input, required, e.g., 2)

---

## Convex Functions

### Queries

```
societies.list({ status?, city?, search? }) → Society[]
societies.getById({ id }) → Society + building count + guard count + lead stats
buildings.listBySociety({ society_id }) → Building[]
buildings.getById({ id }) → Building
```

### Mutations

```
societies.create({ name, city, address?, notes? }) → Society
societies.update({ id, ...fields }) → Society
buildings.create({ society_id, name, total_floors, flats_per_floor?, total_flats?, notes? }) → Building
buildings.update({ id, ...fields }) → Building
```

### Audit Events

| Action | Entity | Trigger |
|--------|--------|---------|
| `SOCIETY_CREATED` | society | societies.create |
| `SOCIETY_UPDATED` | society | societies.update |
| `BUILDING_CREATED` | building | buildings.create |
| `BUILDING_UPDATED` | building | buildings.update |

---

## Business Rules

1. Society starts as `ONBOARDING`. Can be moved to `ACTIVE` once at least one building exists.
2. `INACTIVE` society: guards in that society cannot submit new leads. Existing leads/visits continue.
3. Building names must be unique within a society (e.g., no two "Tower A" in same society).
4. Deleting a building with active leads is blocked. Set to `INACTIVE` instead.
5. Deleting a society with active guards/leads is blocked. Set to `INACTIVE` instead.
6. Buildings use soft delete (`is_deleted` flag). Hard delete is never performed.

---

## Edge Cases

- **Society with no buildings**: Valid during `ONBOARDING`. Guard assignment is possible but lead submission requires at least one building.
- **Building floor count changes**: If `total_floors` is updated, existing leads referencing higher floors remain valid (data isn't retroactively validated).
- **City name normalization**: For V1, city is free text. Future: dropdown/autocomplete from a city master list.
