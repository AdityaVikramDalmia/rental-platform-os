---
id: P45-E02
title: Auth Helper Migration
phase: 45
status: pending
depends_on: ["P45-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P45-E02: Auth Helper Migration

## Overview

Migrate all 8 auth helpers in `convex/auth.helpers.ts` from strict `user_type ===` equality checks to `user_types.includes()` array membership checks, with a backward-compat fallback for users not yet backfilled. Fix the destructive overwrite bug in `convex/ownerInvites.ts` by replacing the `ctx.db.patch({ user_type: "OWNER" })` call with `addPersonaToUser`. Update `convex/auth.ts` `handleUserCreated` to set both `user_types` and `active_persona` on new user creation.

## Prerequisites

- **Read first**: [P45-E01 Completion Summary](P45-E01-schema-migration-backfill.md#completion-summary) — confirms `addPersonaToUser` helper exists and backfill mutation is verified.
- `user_types` and `active_persona` fields exist in schema (E01-T01 done).
- `addPersonaToUser` internal helper exists in `convex/auth.helpers.ts` (E01-T03 done).

## Task Queue

- [x] P45-E02-T01: Add `hasPersona()` helper and update `requireGuard`, `requireAdmin`, `requireOps`, `requireTenant`, `requireOwner`
- [x] P45-E02-T02: Update `requireBackoffice()`, `requirePermission()`, and `isFieldWorkerUser()`
- [x] P45-E02-T03: Fix destructive overwrite in `convex/ownerInvites.ts` and `convex/ownerServiceRequests.ts`
- [x] P45-E02-T04: Update `convex/auth.ts` `handleUserCreated` to set `user_types` and `active_persona`

---

## T01: Add `hasPersona()` Helper and Update Five `requireX()` Helpers

### Objective

Create the `hasPersona()` backward-compat utility function and update `requireGuard`, `requireAdmin`, `requireOps`, `requireTenant`, and `requireOwner` to use it. The fallback ensures un-migrated users (where `user_types` is null) still pass auth checks using the original `user_type` field.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 3 (Auth Helper Migration), Section 8 Phase 3 (Auth Helper Migration with fallback pattern)
- `convex/auth.helpers.ts` — all 8 existing helpers with current strict equality patterns
- `notes/11-convex-architecture.md` — "Auth Helper Layer" section for the `requireX()` pattern

### Key Rules

1. The `hasPersona()` function signature from the feature doc (Section 8 Phase 3):
   ```typescript
   function hasPersona(user: User, type: UserType): boolean {
     if (user.user_types) return user.user_types.includes(type);
     return user.user_type === type; // fallback for un-migrated users
   }
   ```
2. Every `requireX()` helper changes from `user.user_type !== "X"` to `!hasPersona(user, "X")`. The error message and throw behavior are unchanged.
3. The full migration table from Section 3:
   - `requireGuard()`: `user.user_type !== "GUARD"` → `!user.user_types.includes("GUARD")`
   - `requireAdmin()`: `user.user_type !== "ADMIN"` → `!user.user_types.includes("ADMIN")`
   - `requireOps()`: `user.user_type !== "OPS"` → `!user.user_types.includes("OPS")`
   - `requireTenant()`: `user.user_type !== "TENANT"` → `!user.user_types.includes("TENANT")`
   - `requireOwner()`: `user.user_type !== "OWNER"` → `!user.user_types.includes("OWNER")`
4. Do NOT remove the `user_type` field from the User type — it still exists in schema during migration.
5. `hasPersona()` is a module-private utility (not exported) — it is only used within `auth.helpers.ts`.

### Deliverables

- [ ] `convex/auth.helpers.ts` — `hasPersona()` utility added; `requireGuard`, `requireAdmin`, `requireOps`, `requireTenant`, `requireOwner` updated to use it

### Acceptance Criteria

1. `hasPersona(user, "GUARD")` returns `true` when `user.user_types = ["GUARD", "TENANT"]`.
2. `hasPersona(user, "GUARD")` returns `true` when `user.user_types` is null and `user.user_type === "GUARD"` (backward compat).
3. `hasPersona(user, "ADMIN")` returns `false` when `user.user_types = ["GUARD", "TENANT"]`.
4. All 5 updated `requireX()` helpers compile clean.
5. `npx tsc --noEmit` passes.
6. `lsp_diagnostics` is clean on `convex/auth.helpers.ts`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/auth.helpers.ts`. Confirm no type errors on any of the 5 updated helpers.

### Out of Scope

- `requireBackoffice()` and `requirePermission()` (T02)
- `isFieldWorkerUser()` (T02)
- `ownerInvites.ts` fix (T03)

---

## T02: Update `requireBackoffice()`, `requirePermission()`, and `isFieldWorkerUser()`

### Objective

Update the three remaining auth helpers that use multi-type checks to use `user_types.some()` instead of `user_type ===` comparisons.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 3 (Auth Helper Migration), the `requireBackoffice()` and `isFieldWorkerUser()` rows in the migration table
- `convex/auth.helpers.ts` — current `requireBackoffice()`, `requirePermission()`, and `isFieldWorkerUser()` implementations
- `convex/fieldWorkerContracts.ts` — `FIELD_WORKER_USER_TYPES` constant used by `isFieldWorkerUser()`

### Key Rules

1. `requireBackoffice()` migration from Section 3:
   - Before: `user.user_type !== "ADMIN" && user.user_type !== "OPS"`
   - After: `!user.user_types.some(t => ["ADMIN", "OPS"].includes(t))`
   - With backward-compat: use `hasPersona(user, "ADMIN") || hasPersona(user, "OPS")` — cleaner and reuses the fallback.
2. `requirePermission()` uses the same backoffice check — apply the same update.
3. `isFieldWorkerUser()` migration from Section 3:
   - Before: `FIELD_WORKER_USER_TYPES.some(t => t === user.user_type)`
   - After: `user.user_types.some(t => FIELD_WORKER_USER_TYPES.includes(t))`
   - With backward-compat: `user.user_types ? user.user_types.some(t => FIELD_WORKER_USER_TYPES.includes(t)) : FIELD_WORKER_USER_TYPES.includes(user.user_type)`
4. `FIELD_WORKER_USER_TYPES` is defined in `convex/fieldWorkerContracts.ts` as `[USER_TYPE.GUARD, USER_TYPE.OPS]` — import from there, do not redefine.

### Deliverables

- [ ] `convex/auth.helpers.ts` — `requireBackoffice()`, `requirePermission()`, and `isFieldWorkerUser()` updated to use array membership checks with backward-compat fallback

### Acceptance Criteria

1. `requireBackoffice()` passes for a user with `user_types = ["ADMIN"]`.
2. `requireBackoffice()` passes for a user with `user_types = ["OPS"]`.
3. `requireBackoffice()` throws for a user with `user_types = ["TENANT"]`.
4. `isFieldWorkerUser()` returns `true` for a user with `user_types = ["GUARD", "TENANT"]`.
5. `isFieldWorkerUser()` returns `false` for a user with `user_types = ["ADMIN"]`.
6. `npx tsc --noEmit` passes.
7. `lsp_diagnostics` is clean on `convex/auth.helpers.ts`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/auth.helpers.ts`. Confirm all 8 helpers are updated and clean.

### Out of Scope

- `ownerInvites.ts` fix (T03)
- `handleUserCreated` update (T04)

---

## T03: Fix Destructive Overwrite in `convex/ownerInvites.ts` and `convex/ownerServiceRequests.ts`

### Objective

Replace the destructive `ctx.db.patch({ user_type: "OWNER" })` call in `convex/ownerInvites.ts` lines 305-307 with `addPersonaToUser(ctx, userId, "OWNER")`. Apply the same additive model to `ownerServiceRequests.onboard`. This is the primary bug fix that P45 exists to deliver.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 1 (The Destructive Overwrite), Section 4 (How Personas Are Added — "Owner invite consumed" row), Section 9 Impact Matrix rows for `ownerInvites.ts` and `ownerServiceRequests.ts`
- `convex/ownerInvites.ts` — lines 305-307 specifically, plus surrounding context of `consumeInvite` mutation
- `convex/ownerServiceRequests.ts` — `onboard` mutation where owner account is created

### Key Rules

1. The exact bug from Section 1 of the feature doc:

   ```typescript
   // BEFORE (lines 305-307 in ownerInvites.ts) — DESTROYS TENANT PERSONA:
   if (user.user_type === "TENANT") {
     await ctx.db.patch(user._id, { user_type: "OWNER" });
   }

   // AFTER — ADDITIVE, PRESERVES TENANT PERSONA:
   await addPersonaToUser(ctx, user._id, "OWNER");
   ```

2. The `if (user.user_type === "TENANT")` guard is removed entirely — `addPersonaToUser` handles the idempotency check internally (won't add OWNER twice).
3. In `ownerServiceRequests.onboard`, find any `ctx.db.patch({ user_type: "OWNER" })` call and replace with `addPersonaToUser(ctx, userId, "OWNER")`.
4. Do NOT change the `active_persona` field in either of these flows — the user's current active persona is unchanged when a new persona is added. The user will see the persona picker on next login if `multi_persona_enabled` is true.
5. Import `addPersonaToUser` from `./auth.helpers` — it is an internal helper, not a Convex mutation.

### Deliverables

- [ ] `convex/ownerInvites.ts` — lines 305-307 replaced with `addPersonaToUser(ctx, user._id, "OWNER")`; `if (user.user_type === "TENANT")` guard removed
- [ ] `convex/ownerServiceRequests.ts` — `onboard` mutation updated to use `addPersonaToUser` instead of direct `user_type` patch

### Acceptance Criteria

1. A TENANT user who accepts an owner invite now has `user_types = ["TENANT", "OWNER"]` — TENANT persona is preserved.
2. An OWNER user who accepts an owner invite again has `user_types = ["OWNER"]` — no duplicate (idempotent).
3. `convex/ownerInvites.ts` compiles clean.
4. `convex/ownerServiceRequests.ts` compiles clean.
5. `npx tsc --noEmit` passes.
6. `lsp_diagnostics` is clean on both files.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/ownerInvites.ts` and `convex/ownerServiceRequests.ts`.

### Out of Scope

- `handleUserCreated` update (T04)
- UI changes for persona picker (E03)
- Feature flag gating (E05)

---

## T04: Update `convex/auth.ts` `handleUserCreated` to Set `user_types` and `active_persona`

### Objective

Update the `handleUserCreated` event handler in `convex/auth.ts` so that new users created after this change have both `user_types` and `active_persona` set from the start, eliminating the need for backfill on new accounts.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 4 (How Personas Are Added — "Account creation" rows), Section 9 Impact Matrix row for `convex/auth.ts`
- `convex/auth.ts` — `handleUserCreated` function, specifically where `user_type: derivedType` is set

### Key Rules

1. The exact change from Section 9 Impact Matrix:
   - Before: `user_type: derivedType`
   - After: `user_types: [derivedType], active_persona: derivedType`
2. Keep `user_type: derivedType` in the same `ctx.db.insert("users", {...})` call — do NOT remove it. The backward-compat shim requires `user_type` to remain populated.
3. `derivedType` is determined by email domain: `@guards.local` → GUARD, `@ops.local` → OPS, all other emails → TENANT (for Google SSO users). This logic is unchanged.
4. Active persona precedence (from Section 4): `ADMIN > OPS > GUARD > OWNER > TENANT`. For new users, `active_persona = derivedType` is always correct since they start with exactly one persona.
5. The `user_types` array for a new user is always `[derivedType]` — single element.

### Deliverables

- [ ] `convex/auth.ts` — `handleUserCreated` updated to set `user_types: [derivedType]` and `active_persona: derivedType` alongside existing `user_type: derivedType`

### Acceptance Criteria

1. New users created after this change have `user_types = [derivedType]` and `active_persona = derivedType`.
2. `user_type` is still set on new users (backward compat).
3. `convex/auth.ts` compiles clean.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` is clean on `convex/auth.ts`.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/auth.ts`. Confirm no type errors on `handleUserCreated` or any downstream callers.

### Out of Scope

- Persona picker UI (E03)
- Layout client file updates (E04)
- Feature flag (E05)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**
