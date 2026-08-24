# Multi-Persona Identity Model (P45)

> Architectural change to allow a single user account to hold multiple personas simultaneously — e.g., a tenant who becomes an owner, or an admin who is also a tenant.

## 1. Problem Statement

### The Single `user_type` Constraint

Every user in the system has exactly one `user_type` string field set at account creation and never changed (with one exception). The five valid values are `GUARD`, `ADMIN`, `OPS`, `TENANT`, and `OWNER`.

This creates four broken real-world scenarios:

| Scenario                                         | What Happens Today                                                                                                | What Should Happen                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Tenant accepts owner invite                      | `user_type` is **overwritten** from `TENANT` → `OWNER` (ownerInvites.ts:305-307). Tenant loses all tenant access. | User holds both TENANT + OWNER personas simultaneously.     |
| Admin wants to browse listings as a tenant       | Must create a second account with a different email.                                                              | Admin can switch to TENANT persona within the same account. |
| OPS field worker rents a flat                    | Must create a separate tenant account.                                                                            | OPS user can hold TENANT persona alongside OPS.             |
| Guard refers a friend and later becomes a tenant | Guard account cannot be upgraded to TENANT without losing GUARD access.                                           | Guard can hold TENANT persona alongside GUARD.              |

### The Destructive Overwrite (Critical Bug)

In `convex/ownerInvites.ts` lines 305-307:

```typescript
if (user.user_type === "TENANT") {
  await ctx.db.patch(user._id, { user_type: "OWNER" });
}
```

This is the **only place** in the codebase where `user_type` changes after creation. It silently destroys the TENANT persona — the user can no longer access tenant inquiries, their tenant profile, or the tenant portal. This is a data integrity bug that P45 fixes permanently.

### Auth Helper Brittleness

All 8 auth helpers use strict equality checks:

```typescript
requireGuard():      user.user_type !== "GUARD"
requireAdmin():      user.user_type !== "ADMIN"
requireOps():        user.user_type !== "OPS"
requireTenant():     user.user_type !== "TENANT"
requireOwner():      user.user_type !== "OWNER"
requireBackoffice(): user.user_type !== "ADMIN" && user.user_type !== "OPS"
requirePermission(): user.user_type !== "ADMIN" && user.user_type !== "OPS"
```

These cannot express "user has TENANT persona" when `user_type` is `"OWNER"`.

---

## 2. Proposed Model

### Schema Change

Replace the single `user_type` string with an array of persona strings plus an `active_persona` field:

**Before:**

```typescript
users: defineTable({
  user_type: userTypeValidator, // v.union(v.literal("GUARD"), ...)
  // ...
});
```

**After:**

```typescript
users: defineTable({
  user_types: v.array(userTypeValidator), // ["TENANT", "OWNER"] — additive
  active_persona: userTypeValidator, // which portal to show on login
  // ...
});
```

### Invariants

1. `user_types` is never empty — every user has at least one persona.
2. `active_persona` must be a member of `user_types`.
3. Personas are **additive only** — removing a persona requires an explicit admin action (not automatic).
4. `GUARD` and `OPS` personas are mutually exclusive with `ADMIN` (field workers cannot be admins).
5. `GUARD` and `OPS` personas are mutually exclusive with each other (per P30 field worker model).

### Backward Compatibility Shim

During migration and for any code that reads `user_type` (singular), a computed property is derived:

```typescript
// Computed from active_persona — used only for backward compat during migration
get user_type(): UserType {
  return this.active_persona;
}
```

This shim is removed once all call sites are migrated to `user_types.includes(...)`.

---

## 3. Auth Helper Migration

### Pattern Change

All auth helpers change from strict equality to array membership:

| Helper                | Before                                                    | After                                                            |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `requireGuard()`      | `user.user_type !== "GUARD"`                              | `!user.user_types.includes("GUARD")`                             |
| `requireAdmin()`      | `user.user_type !== "ADMIN"`                              | `!user.user_types.includes("ADMIN")`                             |
| `requireOps()`        | `user.user_type !== "OPS"`                                | `!user.user_types.includes("OPS")`                               |
| `requireTenant()`     | `user.user_type !== "TENANT"`                             | `!user.user_types.includes("TENANT")`                            |
| `requireOwner()`      | `user.user_type !== "OWNER"`                              | `!user.user_types.includes("OWNER")`                             |
| `requireBackoffice()` | `user.user_type !== "ADMIN" && user.user_type !== "OPS"`  | `!user.user_types.some(t => ["ADMIN","OPS"].includes(t))`        |
| `requirePermission()` | same as backoffice                                        | same as backoffice                                               |
| `isFieldWorkerUser()` | `FIELD_WORKER_USER_TYPES.some(t => t === user.user_type)` | `user.user_types.some(t => FIELD_WORKER_USER_TYPES.includes(t))` |

### Routing vs. Access

Two distinct concepts after migration:

- **Access check** (`requireX()`): uses `user_types.includes(X)` — "does this user have the X persona?"
- **Routing** (`resolvePostAuthDestination()`): uses `active_persona` — "which portal should this user land on?"

The `active_persona` field drives all redirect logic. The `user_types` array drives all permission checks.

---

## 4. Persona Lifecycle

### How Personas Are Added

| Trigger                                            | Persona Added | Mechanism                                                  |
| -------------------------------------------------- | ------------- | ---------------------------------------------------------- |
| Account creation via `@guards.local` email       | GUARD         | `handleUserCreated` in `convex/auth.ts`                    |
| Account creation via `@ops.local` email   | OPS           | `handleUserCreated` in `convex/auth.ts`                    |
| Account creation via Google SSO (all other emails) | TENANT        | `handleUserCreated` in `convex/auth.ts`                    |
| Admin manually assigns ADMIN role                  | ADMIN         | New `users.addPersona` mutation (admin-only)               |
| Owner invite consumed                              | OWNER         | `ownerInvites.consumeInvite` — **additive, not overwrite** |
| Admin onboards owner via owner services            | OWNER         | `ownerServiceRequests.onboard` — additive                  |

### How Personas Are Removed

Persona removal is an explicit admin action only. No automatic removal. Admin uses a new `users.removePersona` mutation with a required reason field (audit-logged).

**Constraints on removal:**

- Cannot remove the last persona (user must always have at least one).
- Cannot remove `active_persona` without simultaneously setting a new `active_persona`.
- Removing GUARD persona triggers WorkOS suspension if no other field-worker persona remains.

### Active Persona Precedence

When a user logs in for the first time (no stored preference), `active_persona` is set by this precedence:

```
ADMIN > OPS > GUARD > OWNER > TENANT
```

Rationale: higher-privilege personas take precedence so admins don't accidentally land in the tenant portal.

After first login, `active_persona` is whatever the user last selected in the persona switcher.

---

## 5. Post-Auth Persona Picker

### Single Persona (No Change)

If `user_types.length === 1`, the user is redirected directly to their portal. No picker shown.

### Multiple Personas

If `user_types.length >= 2`, the user is redirected to `/post-auth/select-persona` before reaching their portal.

**Picker UI:**

- Full-screen modal (not a page — prevents direct URL access)
- One card per persona with icon, label, and description
- "Remember my choice" checkbox (stores in `localStorage` key `"preferred_persona"`)
- If remembered preference exists and is still valid, auto-redirect without showing picker

**Picker route:** `src/app/post-auth/select-persona/page.tsx`

**Backend:** `users.setActivePersona` mutation — validates that the requested persona is in `user_types`, then patches `active_persona`.

### Remembered Preference Invalidation

The remembered preference is cleared when:

- A persona is removed from the user's `user_types`
- The user explicitly clicks "Switch Persona" in the in-app switcher

---

## 6. In-App Persona Switcher

### Placement

A persona switcher appears in the header/nav of every portal layout when `user_types.length >= 2`. It is hidden for single-persona users.

| Portal | Switcher Location                                      |
| ------ | ------------------------------------------------------ |
| Guard  | Top-right of sticky header (next to language selector) |
| Admin  | Top-right of sidebar header                            |
| OPS    | Top-right of sticky header                             |
| Owner  | Top-right of portal header                             |
| Tenant | Top-right of portal header                             |

### Switcher Behavior

1. User clicks switcher → dropdown shows all available personas (current one highlighted)
2. User selects a different persona → `users.setActivePersona` mutation called
3. On success → `router.push(getPortalRoot(newPersona))` — hard navigation to new portal root
4. `localStorage["preferred_persona"]` updated to new selection

### Portal Root Map

```typescript
const PORTAL_ROOT: Record<UserType, string> = {
  GUARD: "/guard/dashboard",
  ADMIN: "/admin/dashboard",
  OPS: "/ops/dashboard",
  OWNER: "/owner/dashboard",
  TENANT: "/tenant/dashboard",
};
```

---

## 7. Data Scoping

### Persona-Scoped Queries

Each persona's queries remain scoped to that persona's data. A user with TENANT + OWNER personas sees:

- In TENANT portal: their tenant inquiries, visits as tenant, transaction timeline
- In OWNER portal: their properties, leads, earnings as owner

There is no cross-persona data bleed in queries. Each `requireX()` call gates the query to the correct persona.

### Cross-Persona Data (Shared)

Some data is shared across personas and always visible regardless of active persona:

- User profile (name, phone, email)
- Notification preferences
- Referral codes (DemoRentals codes are per-user, not per-persona)
- Chat channels where the user is a participant (regardless of which persona they used to join)

### Dashboard Content

Dashboard content changes based on `active_persona`. The same user visiting `/owner/dashboard` vs `/tenant/dashboard` sees completely different data — owner property pipeline vs tenant inquiry history.

---

## 8. Migration Strategy

### Phase 1: Schema Migration (Non-Breaking)

Add `user_types` (array) and `active_persona` fields alongside the existing `user_type` field. Both exist simultaneously.

```typescript
users: defineTable({
  user_type: userTypeValidator, // KEEP — backward compat
  user_types: v.optional(v.array(userTypeValidator)), // NEW — nullable during migration
  active_persona: v.optional(userTypeValidator), // NEW — nullable during migration
  // ...
});
```

### Phase 2: Backfill

Run a one-time Convex mutation `migrations.backfillUserPersonas` that:

1. For each user where `user_types` is null:
   - Sets `user_types = [user.user_type]`
   - Sets `active_persona = user.user_type`
2. Logs count of migrated users

This mutation is idempotent — safe to run multiple times.

### Phase 3: Auth Helper Migration

Update all auth helpers to use `user_types.includes(X)` with a fallback to `user_type === X` for users not yet backfilled:

```typescript
function hasPersona(user: User, type: UserType): boolean {
  if (user.user_types) return user.user_types.includes(type);
  return user.user_type === type; // fallback for un-migrated users
}
```

### Phase 4: Feature Flag Rollout

Config key `multi_persona_enabled` (boolean, default `false`):

- `false`: persona picker hidden, switcher hidden, `consumeInvite` still overwrites `user_type`
- `true`: full multi-persona UX active, `consumeInvite` uses additive model

### Phase 5: Schema Cleanup

Once all users are backfilled and `multi_persona_enabled` is `true` in production:

1. Make `user_types` and `active_persona` non-optional in schema
2. Remove `user_type` field from schema
3. Remove backward-compat fallback from auth helpers
4. Remove feature flag

### Index Migration

Current indexes that use `user_type`:

```typescript
.index("by_user_type", ["user_type"])
.index("by_type_and_status", ["user_type", "status"])
```

These cannot be directly migrated to array fields (Convex does not support array field indexes). Replace with:

```typescript
.index("by_active_persona", ["active_persona"])
.index("by_persona_and_status", ["active_persona", "status"])
```

Queries that currently use `by_user_type` (e.g., `listAdmins()`) are updated to use `by_active_persona` during Phase 3. Full correctness is maintained because `active_persona` reflects the user's primary role.

---

## 9. Impact Matrix

| File / Module                                    | Current Pattern                                               | New Pattern                                                             | Effort  |
| ------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| `convex/schema.ts`                               | `user_type: userTypeValidator`                                | `user_types: v.array(...)`, `active_persona: userTypeValidator`         | Medium  |
| `convex/auth.helpers.ts`                         | `user.user_type !== "X"` (8 helpers)                          | `!user.user_types.includes("X")`                                        | Small   |
| `convex/auth.ts` (`handleUserCreated`)           | `user_type: derivedType`                                      | `user_types: [derivedType], active_persona: derivedType`                | Small   |
| `convex/ownerInvites.ts` (lines 305-307)         | `ctx.db.patch({ user_type: "OWNER" })`                        | `addPersonaToUser(ctx, userId, "OWNER")`                                | Small   |
| `convex/users.ts` (`getCurrentUser`)             | `user.user_type === "GUARD"` branch                           | `user.user_types.includes("GUARD")`                                     | Small   |
| `convex/users.ts` (`resolvePostAuthDestination`) | `user.user_type === "X"` branches                             | `user.active_persona === "X"` branches                                  | Small   |
| `convex/users.ts` (`listAdmins`)                 | `.withIndex("by_user_type", q => q.eq("user_type", "ADMIN"))` | `.withIndex("by_active_persona", q => q.eq("active_persona", "ADMIN"))` | Small   |
| `lib/constants.ts`                               | `USER_TYPE` enum (unchanged)                                  | Add `PERSONA_CHANNEL_PRIORITY` update                                   | Trivial |
| `src/app/callback/redirect.ts`                   | Email-domain heuristic routing                                | `active_persona`-based routing                                          | Small   |
| `src/app/(owner)/owner-layout-client.tsx`        | `user.user_type !== USER_TYPE.OWNER`                          | `!user.user_types.includes(USER_TYPE.OWNER)`                            | Trivial |
| `src/app/(guard)/guard-layout-client.tsx`        | `user.user_type !== USER_TYPE.GUARD`                          | `!user.user_types.includes(USER_TYPE.GUARD)`                            | Trivial |
| `src/app/(admin)/admin-layout-client.tsx`        | `user.user_type !== USER_TYPE.ADMIN`                          | `!user.user_types.includes(USER_TYPE.ADMIN)`                            | Trivial |
| `src/app/(ops)/ops-layout-client.tsx`            | `user.user_type !== USER_TYPE.OPS`                            | `!user.user_types.includes(USER_TYPE.OPS)`                              | Trivial |
| `src/app/(tenant)/tenant-layout-client.tsx`      | `user.user_type !== USER_TYPE.TENANT`                         | `!user.user_types.includes(USER_TYPE.TENANT)`                           | Trivial |
| `src/app/post-auth/select-persona/`              | Does not exist                                                | New persona picker page                                                 | Medium  |
| `src/components/shared/PersonaSwitcher.tsx`      | Does not exist                                                | New switcher component                                                  | Medium  |
| `convex/migrations.ts`                           | Does not exist                                                | New backfill mutation                                                   | Small   |
| All portal layout files (5 portals)              | No switcher                                                   | Conditional `<PersonaSwitcher>`                                         | Small   |

**Total estimated effort**: 3-4 engineering days for a careful, tested migration.

---

## 10. Dependencies

| Phase   | Dependency         | Reason                                                                               |
| ------- | ------------------ | ------------------------------------------------------------------------------------ |
| P38     | Should be complete | Owner portal layout files need the `user_types.includes()` pattern from day one      |
| P43     | Should be complete | Tenant portal layout files need the same pattern                                     |
| P30     | Must be complete   | OPS persona model and `requireFieldWorker()` pattern is the reference implementation |
| P19-E01 | Must be complete   | TENANT/OWNER user types must exist in schema before P45 adds multi-persona support   |

P45 can technically run before P38/P43 if those portals haven't been built yet — the migration just has fewer layout files to update. However, running P45 after P38+P43 is the recommended order to avoid re-touching layout files.

---

## 11. Decision Log

### D-P45-01: Array field instead of junction table

**Decision**: Store `user_types` as an array on the `users` document rather than a separate `user_personas` junction table.

**Rationale**: The number of personas per user is small (max 3-4). Array reads are a single document fetch. Junction table would require a separate query on every auth check — adding latency to every authenticated request. Convex's document model is optimized for this pattern.

**Trade-off**: Cannot index on array membership (Convex limitation). Mitigated by using `active_persona` (scalar) for index-based queries.

### D-P45-02: `active_persona` as the routing field

**Decision**: Introduce a separate `active_persona` field for routing/redirect logic, distinct from `user_types` for access checks.

**Rationale**: Routing needs a single deterministic value. Access checks need set membership. Conflating them (e.g., "route to the first persona in the array") creates ambiguity and makes persona switching require array reordering. Two fields with clear semantics is cleaner.

### D-P45-03: Additive-only persona model (no automatic removal)

**Decision**: Personas can only be added automatically (via invite, onboarding). Removal requires explicit admin action.

**Rationale**: Automatic removal (e.g., "remove TENANT when OWNER is added") is the root cause of the current destructive overwrite bug. Making removal explicit and admin-gated prevents accidental data loss and creates an audit trail.

### D-P45-04: Feature flag `multi_persona_enabled` for phased rollout

**Decision**: Gate the full multi-persona UX behind a config key, allowing schema migration and backfill to run in production before the UI is exposed.

**Rationale**: Schema migration and backfill are safe to run at any time. The UX change (persona picker, switcher) is a visible product change that should be deployed deliberately. The flag allows the engineering work to land in production incrementally without a big-bang cutover.

## 12. Phase 44 (OPS Superset) — Current State & Relationship

P44 is the closest architectural precedent for P45. It introduced the "field worker" umbrella that accepts both GUARD and OPS user types via `requireFieldWorker()`. P45 generalizes this pattern to ALL personas.

### P44 Implementation Status (as of 2026-02-20)

| Epic                                | Status                 | What It Built                                                                                                                                                                                                                        |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E01–E08                             | ✅ Done                | `fieldWorkerContracts.ts`, `fieldWorkerRollout.ts`, `requireFieldWorker`/`requireFieldWorkerAuth` in auth.helpers.ts, 26 endpoint migrations across 6 modules, OPS profile backfill, admin persona filters, frontend surface updates |
| E09 (Rollout, Monitoring, Rollback) | ⏳ Pending (0/4 tasks) | Rollout controls UI, monitoring metrics, smoke test execution, rollback drill                                                                                                                                                        |

**Key artifacts P45 inherits from P44:**

- `FIELD_WORKER_USER_TYPES = [USER_TYPE.GUARD, USER_TYPE.OPS]` pattern → P45 generalizes to `user.user_types.includes(X)`
- `isFieldWorkerUser()` helper → P45 replaces with native `user_types` array check
- `fieldWorkerRollout.ts` rollout state resolver → P45 follows same feature-flag pattern with `multi_persona_enabled`
- Config key plumbing pattern (`P44_CONFIG_KEYS`, seed defaults) → P45 reuses for `multi_persona_enabled`

**P44 E09 must be completed before P45 starts** — the field worker rollout must be stable and verified in production before the broader multi-persona migration begins. P45 builds on the assumption that `requireFieldWorker()` is battle-tested.

### What P44 Did NOT Do (and P45 Fixes)

- P44 did NOT change `user_type` to an array — it kept the single field and used helper-level workarounds
- P44 did NOT introduce persona switching — OPS users get dual-mode access but can't "switch" between guard and OPS views
- P44 did NOT fix the TENANT→OWNER destructive overwrite — that bug remains live
- P44 explicitly excluded GUARD+OPS persona combination (field workers are mutually exclusive) — P45 preserves this constraint
