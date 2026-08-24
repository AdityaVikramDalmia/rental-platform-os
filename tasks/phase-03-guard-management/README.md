# Phase 3: Guard Management (P03)

## Overview

Build the full guard lifecycle: admin creates guard accounts (WorkOS synthetic email + temp password), manages profiles and status, schedules shifts. Guards log in, see their ID-card-style profile, view upcoming shifts, and complete onboarding. This phase creates the `convex/actions/workos.ts` file (first Convex Action in the project) and populates the Guards tab on the society detail page from Phase 2.

## Dependencies

**P01 (Auth + Accounts + RBAC)** — All 8 epics must be `done`. Phase 3 needs:

- Auth helpers (`requireGuard`, `requireAdmin`, `requirePermission`) from P01-E06
- Guard login flow (phone + synthetic email + password) from P01-E04
- Password change flow (forced + voluntary) from P01-E04
- Guard portal layout + bottom nav from P01-E06
- Admin layout + sidebar from P01-E06
- RBAC system (roles + permissions) from P01-E07
- Schema with `users`, `guard_profiles`, `guard_shifts` tables from P01-E02
- WorkOS auth config + webhook handler from P01-E03

**P02 (Society Registry)** — Both epics must be `done`. Phase 3 needs:

- Society CRUD (guards are assigned to societies) from P02-E01
- Building CRUD (shift locations reference buildings) from P02-E02
- Society detail page with tabs skeleton (Guards tab placeholder) from P02-E01

## Key Documentation

| Doc                                                                            | Sections to Read                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [features/02-guard-management.md](../../notes/features/02-guard-management.md) | Full file — user stories, guard types, Convex functions, admin UI, guard portal, business rules |
| [02-data-models.md](../../notes/02-data-models.md)                             | Sections C (User), D (Guard Profile), E (Guard Shift) — field definitions, indexes              |
| [10-convex-schema.md](../../notes/10-convex-schema.md)                         | `users`, `guard_profiles`, `guard_shifts` table definitions — copy-paste schema                 |
| [04-state-machines.md](../../notes/04-state-machines.md)                       | Guard Status section — ACTIVE / INACTIVE / BANNED transitions + capabilities matrix             |
| [06-admin-panel-ux.md](../../notes/06-admin-panel-ux.md)                       | Guard list page, guard detail page, shift calendar, ban dialog wireframes                       |
| [05-guard-portal-ux.md](../../notes/05-guard-portal-ux.md)                     | Guard profile page (ID card), shift schedule, onboarding walkthrough                            |
| [11-convex-architecture.md](../../notes/11-convex-architecture.md)             | Actions layer (external API calls), auth helpers, function wrapper, file upload pattern         |
| [13-constants-reference.md](../../notes/13-constants-reference.md)             | `GUARD_TYPE`, `SHIFT_TYPE`, `LOCATION_TYPE`, `guards.*` permissions, audit actions              |

## Epics

| ID      | Title                                                       | Tasks | Status | Depends On       |
| ------- | ----------------------------------------------------------- | ----- | ------ | ---------------- |
| P03-E01 | [Guard Account Backend](P03-E01-guard-account-backend.md)   | 5     | done   | P01-E08, P02-E01 |
| P03-E02 | [Guard Admin UI](P03-E02-guard-admin-ui.md)                 | 6     | done   | P03-E01, P02-E01 |
| P03-E03 | [Guard Shift Management](P03-E03-guard-shift-management.md) | 5     | done   | P03-E01, P02-E02 |
| P03-E04 | [Guard Portal Pages](P03-E04-guard-portal-pages.md)         | 3     | done   | P03-E01, P03-E03 |

**Total: 4 epics, 19 tasks**

## Dependency Graph

```
P01-E08 (Seed + Config) ─┐
                          ├─► P03-E01 (Guard Account Backend)
P02-E01 (Society CRUD) ──┘        │
                                   ├─► P03-E02 (Guard Admin UI)
                                   │
P02-E02 (Building CRUD) ──► P03-E03 (Guard Shift Management)
                                   │
                              P03-E01 + P03-E03 ──► P03-E04 (Guard Portal Pages)
```

**Parallelism**: E02 and E03 can run in parallel after E01 is done (E02 needs guard backend + society detail page; E03 needs guard backend + buildings for shift locations). E04 runs last (needs both guard queries from E01 and shift queries from E03).

## Execution Order

1. **E01** → WorkOS Actions (create account, reset password, suspend/unsuspend) + guard mutations (create, update profile, update status with state machine) + guard queries (list, getById, search, myProfile) + tests
2. **E02** _(parallel with E03)_ → Admin sidebar update + guard list page + add/edit guard dialog + guard detail page + management dialogs + society guards tab
3. **E03** _(parallel with E02)_ → Shift mutations + shift queries + shifts tab calendar UI + add/edit shift dialog + tests
4. **E04** → Guard profile page (ID card) + onboarding walkthrough + shift schedule page

## Completion Criteria

- [ ] Admin can create a guard account → WorkOS user created with synthetic email, temp password shown once
- [ ] Admin can edit guard profile (name, type, society reassignment with confirmation)
- [ ] Admin can reset a guard's password → new temp password shown, `must_change_password` set
- [ ] Guard status transitions enforce state machine: ACTIVE ↔ INACTIVE, ACTIVE/INACTIVE → BANNED, BANNED → ACTIVE/INACTIVE
- [ ] Banning a guard: mandatory reason, WorkOS suspension, pending visits flagged `needs_reassignment`
- [ ] Ban dialog shows summary of in-flight items (pending visits, active leads)
- [ ] Guard list page shows table with name, phone, society, type, status, leads count, verified rate
- [ ] Guard list supports society filter, type filter, status filter, and name/phone search
- [ ] Guard detail page shows header + stat cards + 7 tabs (Profile, Shifts, Leads, Visits, Earnings, Incentives, Audit)
- [ ] Society detail page Guards tab shows filtered guard table (previously placeholder)
- [ ] Admin can create/edit/delete shifts (recurring weekly + date overrides)
- [ ] Shift calendar shows weekly grid with recurring shifts + override highlights
- [ ] Override for a date replaces recurring shift for that day (computed schedule logic)
- [ ] Guard profile page shows ID-card layout with photo, name, phone, society, type, status
- [ ] Guard can upload/update profile photo (client-side resize to ~500KB, Convex file storage)
- [ ] Guard onboarding walkthrough shows on first login (3-step: Find → Submit → Earn), dismissable
- [ ] Guard shift schedule page shows read-only next-7-days view
- [ ] Phone number uniqueness enforced across all guards
- [ ] All mutations require correct `guards.*` permissions
- [ ] Audit logs auto-generated for all guard/shift mutations
- [ ] All tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)

## Files Created by This Phase

```
rental-platform-os/
├── convex/
│   ├── actions/
│   │   └── workos.ts             # WorkOS Actions (create guard, reset password, suspend, unsuspend)
│   ├── guards.ts                 # Guard mutations + queries (CRUD, status, profile)
│   ├── guardShifts.ts            # Shift mutations + queries (CRUD, computed schedule)
│   ├── guards.test.ts            # Guard mutation/query tests
│   └── guardShifts.test.ts       # Shift mutation/query tests
├── src/app/(admin)/admin/guards/
│   ├── page.tsx                   # Guard list page → /admin/guards
│   └── [id]/
│       └── page.tsx               # Guard detail page → /admin/guards/[id]
├── src/app/(guard)/guard/
│   ├── profile/
│   │   └── page.tsx               # Guard profile page (ID card) → /guard/profile
│   └── shifts/
│       └── page.tsx               # Guard shift schedule (read-only) → /guard/shifts
├── src/components/admin/
│   ├── GuardTable.tsx             # Guard list table with filters
│   ├── GuardCreateDialog.tsx      # Add guard dialog with temp password reveal
│   ├── GuardEditDialog.tsx        # Edit guard profile dialog
│   ├── GuardStatusDialog.tsx      # Change status dialog (ban confirmation with in-flight summary)
│   ├── GuardResetPasswordDialog.tsx # Reset password dialog with temp password reveal
│   ├── ShiftCalendar.tsx          # Weekly shift calendar view
│   ├── ShiftCreateDialog.tsx      # Add/edit shift dialog
│   └── SocietyGuardsTab.tsx       # Guards tab content for society detail page
├── src/components/guard/
│   ├── GuardProfileCard.tsx       # ID card-style profile display
│   ├── GuardPhotoUpload.tsx       # Photo upload with client-side resize
│   ├── GuardOnboarding.tsx        # 3-step onboarding walkthrough
│   └── GuardShiftList.tsx         # Next-7-days shift schedule (read-only)
└── convex/
    (tests listed above)
```

## Scope Boundaries

**IN this phase:**

- Guard account creation (WorkOS Action + Convex records)
- Guard profile CRUD (name, type, society, metadata, photo)
- Guard status management (ACTIVE/INACTIVE/BANNED with WorkOS sync)
- Password reset (admin-initiated)
- Shift management (RECURRING + OVERRIDE, CRUD, computed schedule)
- Admin guard list page + detail page with tabs
- Guard profile page (ID card) + photo upload
- Guard onboarding walkthrough (3-step dismissable)
- Guard shift schedule (read-only, next 7 days)
- Society detail page Guards tab population

**NOT in this phase:**

- Lead submission (Phase 4)
- Visit assignment to guards (Phase 7)
- Guard quality scoring + ban controls logic (Phase 11 — Phase 3 builds the status transitions, Phase 11 adds quality metrics)
- Earnings/payout display on guard detail (Phase 9 fills the Earnings tab)
- Incentive badges/cards on guard detail (Phase 10 fills the Incentives tab)
- Guard audit history on guard detail (Phase 13 fills the Audit tab)
- Leads tab on guard detail (Phase 4 fills it)
- Visits tab on guard detail (Phase 7 fills it)
- Guard portal i18n translation (Phase 14 — Phase 3 only stores language preference; Phase 14 adds `next-intl`, translation files, and actual string translation)
- Browser fingerprint tracking on login (Phase 11 — `browser_fingerprints` field exists in `guard_profiles` schema but is not populated until Phase 11 adds the tracking logic)
- Guard phone number change (explicit product deferral — rare operation, requires updating WorkOS synthetic email; admin creates new account if needed)
- OFF_SHIFT_SUBMISSION flag (V2 — requires GPS)
