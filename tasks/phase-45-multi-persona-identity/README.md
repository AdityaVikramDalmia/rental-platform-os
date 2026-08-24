# Phase 45: Multi-Persona Identity Model (P45)

## Overview

Replace the single `user_type` string field with an additive `user_types` array plus an `active_persona` routing field, allowing one account to hold multiple personas simultaneously. This fixes the critical destructive overwrite in `convex/ownerInvites.ts` (lines 305-307) where a TENANT's persona is silently destroyed when they accept an owner invite, and generalizes the field-worker umbrella pattern introduced in P44 to all five personas.

The migration is non-breaking and fully feature-flagged. Schema changes land first alongside the existing `user_type` field. A backfill mutation populates the new fields for all existing users. Auth helpers gain backward-compat fallbacks. The persona picker and switcher UI activate only when `multi_persona_enabled` config key is `true`.

## Dependencies

- **Hard**: P44-E09 (Rollout, Monitoring, Rollback) must be complete — the field-worker rollout must be stable and verified in production before the broader multi-persona migration begins. P45 builds on the assumption that `requireFieldWorker()` is battle-tested.
- **Recommended**: P38 (Owner Portal) should be complete so owner layout files need the `user_types.includes()` pattern from day one rather than being re-touched later.
- **Recommended**: P43 (Tenant Portal) should be complete for the same reason — tenant layout files need the same pattern.

## Key Documentation

| Doc / Code Reference                          | Why It Is Required                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `notes/features/36-multi-persona-identity.md` | Authoritative P45 spec — schema, invariants, auth helpers, migration strategy     |
| `notes/10-convex-schema.md`                   | Existing `users` table schema and index definitions to extend                     |
| `notes/11-convex-architecture.md`             | Auth helper patterns, `functions.ts` import rules, mutation wrapper conventions   |
| `notes/13-constants-reference.md`             | `USER_TYPE` enum values, config key patterns, permission strings                  |
| `notes/04-state-machines.md`                  | User status transitions (ACTIVE/INACTIVE/BANNED) — unchanged by P45               |
| `convex/auth.helpers.ts`                      | All 8 auth helpers to migrate: `requireGuard`, `requireAdmin`, `requireOps`, etc. |
| `convex/auth.ts`                              | `handleUserCreated` — sets `user_type` on new users, must set `user_types` too    |
| `convex/ownerInvites.ts`                      | Lines 305-307: the destructive overwrite bug P45 fixes permanently                |
| `convex/users.ts`                             | `getCurrentUser`, `resolvePostAuthDestination`, `listAdmins` — all need updates   |
| `convex/fieldWorkerContracts.ts`              | P44 contract module — P45 follows same config-key and rollout-flag patterns       |
| `src/app/callback/redirect.ts`                | Email-domain heuristic routing to replace with `active_persona`-based routing     |

## Epics

| ID      | Title                         | Tasks | Status  | Depends On | Priority |
| ------- | ----------------------------- | ----- | ------- | ---------- | -------- |
| P45-E01 | Schema Migration + Backfill   | 4     | pending | [P44-E09]  | Critical |
| P45-E02 | Auth Helper Migration         | 4     | pending | [P45-E01]  | Critical |
| P45-E03 | Persona Picker + Switcher UI  | 4     | pending | [P45-E02]  | High     |
| P45-E04 | Layout + Callback Integration | 3     | pending | [P45-E03]  | High     |
| P45-E05 | Feature Flag + Schema Cleanup | 3     | pending | [P45-E04]  | Medium   |

## Dependency Graph

```text
P44-E09 (prerequisite)
    |
    v
P45-E01 (Schema Migration + Backfill)
    |
    v
P45-E02 (Auth Helper Migration)
    |
    v
P45-E03 (Persona Picker + Switcher UI)
    |
    v
P45-E04 (Layout + Callback Integration)
    |
    v
P45-E05 (Feature Flag + Schema Cleanup)
```

## Completion Criteria

- [ ] `users` table schema has `user_types: v.optional(v.array(userTypeValidator))` and `active_persona: v.optional(userTypeValidator)` alongside existing `user_type`
- [ ] New indexes `by_active_persona` and `by_persona_and_status` exist on the `users` table
- [ ] `migrations.backfillUserPersonas` mutation exists, is idempotent, and reports `{ scanned, created, skipped, errors }` counts
- [ ] `addPersonaToUser` internal helper exists in `convex/auth.helpers.ts` and enforces mutual exclusivity rules (GUARD/OPS mutually exclusive with ADMIN)
- [ ] All 8 auth helpers use `hasPersona()` with backward-compat fallback for un-migrated users
- [ ] `convex/ownerInvites.ts` lines 305-307 no longer overwrite `user_type` — uses `addPersonaToUser` instead
- [ ] `convex/auth.ts` `handleUserCreated` sets `user_types: [derivedType]` and `active_persona: derivedType` on new user creation
- [ ] `users.setActivePersona`, `users.addPersona`, and `users.removePersona` mutations exist with correct constraints
- [ ] Persona picker page exists at `src/app/post-auth/select-persona/page.tsx`
- [ ] `PersonaSwitcher` component exists at `src/components/shared/PersonaSwitcher.tsx` and renders only when `user_types.length >= 2`
- [ ] `PORTAL_ROOT` map and `getPortalRoot()` utility exist
- [ ] All 5 portal layout client files use `user_types.includes()` instead of `user_type !==`
- [ ] Callback redirect uses `active_persona`-based routing via `PORTAL_ROOT` map
- [ ] `multi_persona_enabled` config key exists with default `false`, gates picker/switcher rendering
- [ ] `npx tsc --noEmit` and `npm run build` pass after all epics

## File Tree

```text
phase-45-multi-persona-identity/
  README.md
  P45-E01-schema-migration-backfill.md
  P45-E02-auth-helper-migration.md
  P45-E03-persona-picker-switcher.md
  P45-E04-layout-callback-integration.md
  P45-E05-feature-flag-cleanup.md
```

## Scope Boundaries

### In Scope

- Schema migration (additive fields alongside existing `user_type`)
- One-time backfill mutation for existing users
- Auth helper migration with backward-compat fallback
- Fix for the destructive overwrite bug in `ownerInvites.ts`
- Persona picker page and in-app switcher component
- Portal layout client file updates (5 files)
- Callback redirect logic update
- Feature flag for phased rollout
- Schema cleanup plan (documented, not executed until flag is stable)

### Out of Scope

- Removing `user_type` field from schema (Phase 5 cleanup — deferred until `multi_persona_enabled=true` is stable in production)
- Removing backward-compat fallback from auth helpers (same cleanup phase)
- Guard ↔ OPS persona combination (explicitly excluded by invariant: field worker personas are mutually exclusive)
- ADMIN ↔ GUARD/OPS persona combination (explicitly excluded by invariant)
- Push notifications for persona changes (V2)
- Persona-specific notification preferences (V2)
- Referral program redesign (guard referral remains GUARD-only)
