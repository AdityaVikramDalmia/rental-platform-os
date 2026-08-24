---
phase: 2
title: "Phase 2: Society Registry - Integration Verification"
status: pending
depends_on:
  - P02-E01
  - P02-E02
verified_at: null
failures: 0
---

# Phase 2 Integration Verification: Society Registry

## Readiness Gates

- [ ] ALL epic VERIFY.md files in this phase have `status: pass`
- [ ] `P01` auth/RBAC epics are done (especially `P01-E06`, `P01-E07`, `P01-E08`)
- [ ] Dev server running: `npm run dev` -> http://localhost:3000
- [ ] Convex dev running: `npx convex dev`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Full build passes: `npm run build`
- [ ] All tests pass: `npm run test`
- [ ] Admin login works at http://localhost:3000/dev/login with `admin@example.com` / `DevAdmin123!`

**STOP if any epic VERIFY.md is not `pass`.** Fix epic-level failures first.

---

## Integration Scenarios

### I01: Create society, add building, and verify society-level building visibility

**Epics Involved**: P02-E01, P02-E02
**Persona**: Admin
**Criteria Ref**: Phase-CC1, Phase-CC5, Phase-CC7, Phase-CC9

**Flow**:

1. Log in at `/dev/login` as `admin@example.com`.
2. Navigate to `/admin/societies` and create a society with `name` and `city`.
3. Open the created society detail route `/admin/societies/[id]`.
4. In Buildings tab, create a building with floor labels and optional flat number template.
5. Return to society list and confirm building count increments.
6. Re-open society detail and confirm the building appears in Buildings tab table.

**Assert**:

- [ ] Society created in E01 is immediately usable as parent for building creation in E02.
- [ ] Newly added building appears under the correct society only.
- [ ] Society list `Buildings` count reflects the newly created building.
- [ ] Building row persists after reload due to backend query subscription.

**Evidence**: screenshot series (create form, building dialog submit, updated list/detail states)

---

### I02: Society status transition dependency on buildings

**Epics Involved**: P02-E01, P02-E02
**Persona**: Admin
**Criteria Ref**: Phase-CC3, Phase-CC4

**Flow**:

1. Create a new society (default `ONBOARDING`) with no buildings.
2. Attempt to edit status to `ACTIVE` from society dialog.
3. Observe rejection/error due to zero buildings.
4. Add one building in that society via Buildings tab.
5. Retry status update to `ACTIVE`.
6. Toggle `ACTIVE -> INACTIVE -> ACTIVE` and verify both transitions work.

**Assert**:

- [ ] `ONBOARDING -> ACTIVE` is blocked until at least one building exists.
- [ ] After one building is added, `ONBOARDING -> ACTIVE` succeeds.
- [ ] `ACTIVE <-> INACTIVE` transitions succeed once society is activated.
- [ ] Integration of E01 status rules and E02 building CRUD is enforced end-to-end in UI + backend.

**Evidence**: screenshot series + mutation response snippets

---

### I03: RBAC enforcement across society and building management

**Epics Involved**: P02-E01, P02-E02
**Persona**: Admin
**Criteria Ref**: Phase-CC15

**Flow**:

1. Prepare two admin users/roles: one with full `societies.*` + `buildings.*`, one missing these permissions.
2. Log in as restricted admin and navigate to `/admin/societies` and `/admin/societies/[id]`.
3. Attempt create/edit society actions and create/edit/delete building actions.
4. Log in as fully-permitted admin and perform the same actions.

**Assert**:

- [ ] Restricted admin cannot execute society or building mutations.
- [ ] Restricted admin does not see gated nav/actions tied to missing permissions.
- [ ] Fully-permitted admin can complete society and building CRUD operations.
- [ ] Permission boundaries hold consistently across list, detail, dialogs, and mutation endpoints.

**Evidence**: screenshot + network (failed/successful mutation responses)

---

### I04: Cross-epic audit trail integrity for society and building mutations

**Epics Involved**: P02-E01, P02-E02
**Persona**: Admin
**Criteria Ref**: Phase-CC16

**Flow**:

1. Perform one society create and one society update.
2. Perform one building create, one status update, and one soft-delete.
3. Query `audit_logs` in Convex dashboard for these operations.
4. Match each operation to expected actor/entity/action metadata.

**Assert**:

- [ ] Society mutations generate audit log records.
- [ ] Building mutations generate audit log records.
- [ ] Audit entries include correct actor and entity references.
- [ ] No Phase 2 mutation path bypasses the wrapped `functions.ts` trigger pipeline.

**Evidence**: screenshot + database snapshots of `audit_logs`

---

## Results

| ID  | Status  | Evidence | Notes |
| --- | ------- | -------- | ----- |
| I01 | pending | -        | -     |
| I02 | pending | -        | -     |
| I03 | pending | -        | -     |
| I04 | pending | -        | -     |

---

## Failure Reports

<!-- Verify Agent appends failure reports here. Same format as epic-level failures. -->
<!-- See references/failure-report-template.md for the format. -->
