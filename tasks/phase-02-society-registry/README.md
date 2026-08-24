# Phase 2: Society Registry (P02)

## Overview

Build the society and building management system — the foundational data layer everything else depends on. After this phase: admins can create societies, add buildings with floor configurations and flat number templates, manage status lifecycles, and search/filter the registry. The society detail page provides a hub for all society-related data (buildings, guards, leads) used by later phases.

## Dependencies

**P01 (Auth + Accounts + RBAC)** — All 8 epics must be `done`. Phase 2 needs:

- Auth helpers (`requirePermission`) from P01-E06
- RBAC system (roles + permissions) from P01-E07
- Seed script (initial roles + super admin) from P01-E08
- Admin layout + route protection from P01-E06
- Schema with `societies` and `buildings` tables from P01-E02

## Key Documentation

| Doc                                                                            | Sections to Read                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [features/01-society-registry.md](../../notes/features/01-society-registry.md) | Full file — user stories, business rules, admin UI specs, Convex functions, edge cases |
| [02-data-models.md](../../notes/02-data-models.md)                             | Sections A (Society) and B (Building) — field definitions, indexes, notes              |
| [10-convex-schema.md](../../notes/10-convex-schema.md)                         | `societies` and `buildings` table definitions — copy-paste schema                      |
| [04-state-machines.md](../../notes/04-state-machines.md)                       | Society Status section — ONBOARDING → ACTIVE → INACTIVE transitions                    |
| [06-admin-panel-ux.md](../../notes/06-admin-panel-ux.md)                       | Society management sidebar entry, page layouts                                         |
| [11-convex-architecture.md](../../notes/11-convex-architecture.md)             | Function wrapper pattern, auth helpers, soft delete, search indexes                    |
| [13-constants-reference.md](../../notes/13-constants-reference.md)             | `SOCIETY_STATUS`, permissions (`societies.*`, `buildings.*`), audit actions            |

## Epics

| ID      | Title                                     | Tasks | Status | Depends On |
| ------- | ----------------------------------------- | ----- | ------ | ---------- |
| P02-E01 | [Society CRUD](P02-E01-society-crud.md)   | 7     | done   | P01-E08    |
| P02-E02 | [Building CRUD](P02-E02-building-crud.md) | 6     | done   | P02-E01    |

**Total: 2 epics, 13 tasks**

## Dependency Graph

```
P01-E08 (Seed + Config)   ← Phase 1 complete
 └─► P02-E01 (Society CRUD)
      └─► P02-E02 (Building CRUD)
```

**No parallelism** — E02 depends on E01 (buildings belong to societies, UI extends society detail page).

## Execution Order

1. **E01** → Society backend (mutations, queries, search) + admin UI (list page, create/edit dialog, detail page with tab skeleton)
2. **E02** → Building backend (mutations, queries, validation, soft delete) + admin UI (buildings tab, create/edit dialog with floor labels + template)

## Completion Criteria

- [ ] Admin can create a society with name + city → status defaults to `ONBOARDING`
- [ ] Admin can edit society details (name, city, address, notes)
- [ ] Society status transitions enforce rules: `ONBOARDING` → `ACTIVE` only with ≥1 building
- [ ] `ACTIVE` ↔ `INACTIVE` transitions work; `INACTIVE` shows confirmation warning
- [ ] Society list page shows table with Name, City, Status, Buildings count, Guards count, Leads count
- [ ] Society list supports status filter, city filter, and full-text name search
- [ ] Society detail page shows header (name, status, city, address) + stat cards (buildings, guards, lead breakdown by status)
- [ ] Society detail page shows tabs (Buildings, Guards, Leads, Analytics)
- [ ] Admin can add a building to a society with name, floors, floor labels, flat number template
- [ ] Building names are unique within a society (duplicate rejected)
- [ ] Floor labels tag input works (admin enters labels one by one)
- [ ] Flat number template preview shows generated pattern (e.g., "A-0101")
- [ ] Building soft delete works (sets `is_deleted: true`, filtered from queries)
- [ ] Building with active leads cannot be deleted (shows error)
- [ ] All mutations require correct permissions (`societies.create`, `buildings.edit`, etc.)
- [ ] Audit logs auto-generated for all society/building mutations (via trigger system)
- [ ] All tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)

## Files Created by This Phase

```
rental-platform-os/
├── convex/
│   ├── societies.ts          # Society mutations + queries
│   └── buildings.ts          # Building mutations + queries
├── lib/
│   └── validators.ts         # Extended: validateFlatNumber against template, validateFloorLabels
├── src/app/(admin)/admin/societies/
│   ├── page.tsx               # Society list page → /admin/societies
│   └── [id]/
│       └── page.tsx           # Society detail page → /admin/societies/[id]
├── src/components/admin/
│   ├── SocietyCreateDialog.tsx   # Add/Edit society form dialog
│   ├── SocietyTable.tsx          # Society list table with filters
│   ├── BuildingCreateDialog.tsx  # Add/Edit building form dialog (floor labels, template)
│   ├── BuildingTable.tsx         # Building list table within society detail
│   └── FloorLabelsInput.tsx      # Tag-style input for floor labels
└── convex/
    ├── societies.test.ts     # Society mutation/query tests
    └── buildings.test.ts     # Building mutation/query/validation tests
```

## Scope Boundaries

**IN this phase:**

- Society CRUD (create, read, update) with status lifecycle
- Building CRUD (create, read, update, soft delete) with floor config
- Admin UI for society list, detail, and building management
- Full-text search on society names
- Flat number template definition and preview

**NOT in this phase:**

- Guard assignment to societies (Phase 3)
- Lead submission referencing buildings (Phase 4)
- Guards tab content on society detail (Phase 3 fills it)
- Leads tab content on society detail (Phase 4 fills it)
- Analytics tab content on society detail (Phase 12 fills it)
- Bulk CSV import for societies (V2)
- City autocomplete from master list (V2)
