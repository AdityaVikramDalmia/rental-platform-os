---
id: P45-E01
title: Schema Migration + Backfill
phase: 45
status: pending
depends_on: ["P44-E09"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P45-E01: Schema Migration + Backfill

## Overview

Add `user_types` (array) and `active_persona` fields to the `users` table alongside the existing `user_type` field. Both new fields are optional during migration so no existing data breaks. Add new indexes `by_active_persona` and `by_persona_and_status`. Create the idempotent `backfillUserPersonas` mutation that populates the new fields for all existing users. Create the `addPersonaToUser` internal helper that enforces mutual exclusivity invariants and is used by all persona-adding flows.

## Prerequisites

- P44-E09 must be complete — `requireFieldWorker()` is battle-tested and the `fieldWorkerContracts.ts` config-key pattern is the reference for P45's `multi_persona_enabled` flag.
- Read `convex/fieldWorkerContracts.ts` to understand the P44 config-key and rollout-flag patterns P45 inherits.

## Task Queue

- [x] P45-E01-T01: Add `user_types` and `active_persona` fields + new indexes to `convex/schema.ts`
- [x] P45-E01-T02: Create `convex/migrations.ts` with `backfillUserPersonas` mutation
- [x] P45-E01-T03: Create `addPersonaToUser` internal helper in `convex/auth.helpers.ts`
- [ ] P45-E01-T04: Verification — run backfill on dev data and confirm all invariants hold

---

## T01: Add `user_types` and `active_persona` Fields + New Indexes to Schema

### Objective

Extend the `users` table in `convex/schema.ts` with two new optional fields and two new indexes, keeping the existing `user_type` field intact so no existing code breaks.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 2 (Proposed Model) and Section 8 Phase 1 (Schema Migration)
- `notes/10-convex-schema.md` — current `users` table definition with `user_type`, `by_user_type`, and `by_type_and_status` indexes
- `convex/fieldWorkerContracts.ts` — P44 contract module pattern (P45 follows same structure)

### Key Rules

1. Both new fields MUST be `v.optional(...)` during migration — `user_types: v.optional(v.array(userTypeValidator))` and `active_persona: v.optional(userTypeValidator)`. Making them required would break all existing users who haven't been backfilled yet.
2. Keep the existing `user_type` field and its indexes (`by_user_type`, `by_type_and_status`) — do NOT remove them in this task. Removal is Phase 5 cleanup.
3. Convex does NOT support array field indexes. The new indexes use `active_persona` (scalar), not `user_types` (array). This is Decision D-P45-01 from the feature doc.
4. New index names: `by_active_persona` on `["active_persona"]` and `by_persona_and_status` on `["active_persona", "status"]`. These replace `by_user_type` and `by_type_and_status` in Phase 3 queries.
5. `userTypeValidator` is the existing `v.union(v.literal("GUARD"), v.literal("ADMIN"), v.literal("OPS"), v.literal("TENANT"), v.literal("OWNER"))` — reuse it, do not redefine.

### Deliverables

- [ ] `convex/schema.ts` — `users` table extended with `user_types: v.optional(v.array(userTypeValidator))`, `active_persona: v.optional(userTypeValidator)`, `.index("by_active_persona", ["active_persona"])`, `.index("by_persona_and_status", ["active_persona", "status"])`

### Acceptance Criteria

1. `convex/schema.ts` compiles clean — `npx tsc --noEmit` passes.
2. `users` table has both new optional fields and both new indexes.
3. Existing `user_type` field and its indexes (`by_user_type`, `by_type_and_status`) are still present.
4. No existing Convex function is broken — all existing queries/mutations that reference `user_type` still compile.
5. `lsp_diagnostics` is clean on `convex/schema.ts`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`. Confirm no errors on any file that imports from `_generated/`.

### Out of Scope

- Backfill logic (T02)
- Auth helper changes (E02)
- Removing `user_type` or old indexes (E05 cleanup)

---

## T02: Create `convex/migrations.ts` with `backfillUserPersonas` Mutation

### Objective

Create a new `convex/migrations.ts` file with a `backfillUserPersonas` mutation that populates `user_types` and `active_persona` for every user where `user_types` is currently null. The mutation must be idempotent, cursor-paginated for large datasets, and return deterministic counts.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 8 Phase 2 (Backfill) for the exact contract
- `notes/11-convex-architecture.md` — mutation wrapper conventions (`functions.ts` import rule)
- `convex/fieldWorkerContracts.ts` — P44 backfill pattern reference (OPS profile backfill in P44-E04 follows same cursor-pagination approach)

### Key Rules

1. Import `mutation` from `./functions` (NOT from `_generated/server`) — this is the audit-trigger wrapper. Backfill mutations are admin-only and must be audit-logged.
2. The mutation is idempotent: for each user, check `if (user.user_types != null) { skipped++; continue; }` before writing. Safe to run multiple times.
3. Cursor-paginate using Convex's `.paginate()` API with a reasonable batch size (100 users per call). Accept an optional `cursor` argument and return `{ nextCursor, isDone }` alongside counts.
4. Return shape: `{ scanned: number, created: number, skipped: number, errors: number }`. Log errors per-user without aborting the whole batch.
5. For each un-migrated user: set `user_types = [user.user_type]` and `active_persona = user.user_type`. This is the exact contract from Section 8 Phase 2.
6. Require admin auth — use `requireAdmin(ctx)` at the top of the mutation.

### Deliverables

- [ ] `convex/migrations.ts` — new file with `backfillUserPersonas` mutation (cursor-paginated, idempotent, returns counts)

### Acceptance Criteria

1. `convex/migrations.ts` compiles clean — `npx tsc --noEmit` passes.
2. Running the mutation twice on the same dataset produces identical `skipped` count on the second run (idempotency).
3. After running on dev data, every user has non-null `user_types` and `active_persona`.
4. `user_types` for each migrated user is `[user.user_type]` (single-element array).
5. `active_persona` for each migrated user equals `user.user_type`.
6. `lsp_diagnostics` is clean on `convex/migrations.ts`.

### Verification

```bash
npx tsc --noEmit
# Then in Convex dashboard or via CLI:
npx convex run migrations:backfillUserPersonas
# Verify returned counts: scanned > 0, created == scanned, skipped == 0 on first run
# Run again: scanned > 0, created == 0, skipped == scanned on second run
```

### Out of Scope

- Migrating any other table
- Removing `user_type` field
- Running in production (that's E05 rollout)

---

## T03: Create `addPersonaToUser` Internal Helper in `convex/auth.helpers.ts`

### Objective

Add an `addPersonaToUser` internal helper function to `convex/auth.helpers.ts` that appends a persona to a user's `user_types` array if not already present, enforcing the mutual exclusivity invariants from the feature spec. This helper is used by `ownerInvites.consumeInvite`, `ownerServiceRequests.onboard`, and `handleUserCreated`.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 2 (Invariants), Section 4 (How Personas Are Added), Section 9 Impact Matrix row for `convex/ownerInvites.ts`
- `convex/auth.helpers.ts` — existing helper patterns and imports

### Key Rules

1. The helper is an **internal** function (not exported as a Convex mutation) — it takes `ctx: MutationCtx` and `userId: Id<"users">` and `persona: UserType` as arguments.
2. Mutual exclusivity rules to enforce (throw `ConvexError` if violated):
   - `GUARD` and `OPS` are mutually exclusive with `ADMIN` — if adding GUARD/OPS and user already has ADMIN (or vice versa), throw.
   - `GUARD` and `OPS` are mutually exclusive with each other — if adding GUARD and user already has OPS (or vice versa), throw.
3. If the persona is already in `user_types`, return early without patching (idempotent).
4. If `user_types` is null (un-migrated user), initialize it as `[user.user_type, persona]` (preserving the original type).
5. After adding the persona, do NOT change `active_persona` — the user's current active persona is unchanged by adding a new one.
6. This helper follows the same pattern as P44's `fieldWorkerContracts.ts` — centralize the invariant logic in one place.

### Deliverables

- [ ] `convex/auth.helpers.ts` — new `addPersonaToUser(ctx, userId, persona)` internal helper function with mutual exclusivity enforcement

### Acceptance Criteria

1. `addPersonaToUser` throws `ConvexError` when adding GUARD to a user who already has ADMIN.
2. `addPersonaToUser` throws `ConvexError` when adding OPS to a user who already has GUARD.
3. `addPersonaToUser` is idempotent — calling it twice with the same persona does not duplicate the entry.
4. `addPersonaToUser` handles un-migrated users (null `user_types`) by initializing the array.
5. `npx tsc --noEmit` passes.
6. `lsp_diagnostics` is clean on `convex/auth.helpers.ts`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/auth.helpers.ts`. Confirm no type errors on the new helper or any existing helpers.

### Out of Scope

- Calling `addPersonaToUser` from `ownerInvites.ts` (that's E02-T03)
- Updating `handleUserCreated` (that's E02-T04)
- The `removePersona` mutation (that's E03-T01)

---

## T04: Verification — Run Backfill on Dev Data

### Objective

Execute the backfill mutation against the dev Convex instance, verify all users have `user_types` populated, verify `active_persona` matches original `user_type`, and confirm the new indexes return correct results.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 8 Phase 2 (Backfill) for expected post-migration state
- `AGENTS.md` — Dev Environment section for Convex CLI commands

### Key Rules

1. Run the backfill via `npx convex run migrations:backfillUserPersonas` — not via the Convex dashboard (CLI is reproducible).
2. Verify idempotency by running the mutation twice and confirming the second run returns `created: 0, skipped: N`.
3. Spot-check at least 3 users (one GUARD, one ADMIN, one TENANT) to confirm `user_types` and `active_persona` are correct.
4. Test the new `by_active_persona` index by running a query that uses `.withIndex("by_active_persona", q => q.eq("active_persona", "ADMIN"))` and confirming it returns the expected admin users.

### Deliverables

- [ ] Verification run completed — backfill counts logged and confirmed correct
- [ ] Idempotency confirmed — second run returns `created: 0`
- [ ] Index query confirmed — `by_active_persona` returns correct results

### Acceptance Criteria

1. First backfill run: `scanned > 0`, `created == scanned`, `skipped == 0`, `errors == 0`.
2. Second backfill run: `scanned > 0`, `created == 0`, `skipped == scanned`, `errors == 0`.
3. Every user in the dev DB has non-null `user_types` and `active_persona` after backfill.
4. `by_active_persona` index query returns correct users.
5. `npx tsc --noEmit` still passes after all E01 changes.

### Verification

```bash
npx tsc --noEmit
npm run build
npx convex run migrations:backfillUserPersonas
# Run again to confirm idempotency
npx convex run migrations:backfillUserPersonas
```

### Out of Scope

- Auth helper migration (E02)
- UI changes (E03, E04)
- Production rollout (E05)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**
