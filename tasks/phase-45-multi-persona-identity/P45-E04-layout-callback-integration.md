---
id: P45-E04
title: Layout + Callback Integration
phase: 45
status: done
depends_on: ["P45-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules"]
updated_at: 2026-02-20
---

# P45-E04: Layout + Callback Integration

## Overview

Wire the `PersonaSwitcher` component into all 5 portal layout client files, update the auth callback redirect logic to use `active_persona`-based routing instead of the email-domain heuristic, and update `convex/users.ts` queries that use the old `by_user_type` index to use `by_active_persona` instead.

## Prerequisites

- **Read first**: [P45-E03 Completion Summary](P45-E03-persona-picker-switcher.md#completion-summary) — confirms `PersonaSwitcher`, `PORTAL_ROOT`, `getPortalRoot()`, and `setActivePersona` mutation all exist.
- `PersonaSwitcher` component exists at `src/components/shared/PersonaSwitcher.tsx` (E03-T03 done).
- `PORTAL_ROOT` and `getPortalRoot()` exist in `lib/constants.ts` (E03-T04 done).
- Persona picker page exists at `src/app/post-auth/select-persona/page.tsx` (E03-T02 done).

## Task Queue

- [x] P45-E04-T01: Update all 5 portal layout client files to use `user_types.includes()` and add conditional `<PersonaSwitcher>`
- [x] P45-E04-T02: Update callback redirect logic to use `active_persona`-based routing
- [x] P45-E04-T03: Update `convex/users.ts` queries to use `by_active_persona` index

---

## T01: Update All 5 Portal Layout Client Files

### Objective

Update the 5 portal layout client files to replace `user_type !==` checks with `user_types.includes()` and add a conditional `<PersonaSwitcher>` in each portal's header/nav area. The switcher renders only when `user_types.length >= 2` (the component itself handles this guard, but the layout must import and render it).

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 6 (Switcher Placement table), Section 9 Impact Matrix rows for all 5 layout files
- `src/app/(guard)/guard-layout-client.tsx` — current `user_type !== USER_TYPE.GUARD` check pattern
- `src/app/(admin)/admin-layout-client.tsx` — current `user_type !== USER_TYPE.ADMIN` check pattern
- `src/app/(ops)/ops-layout-client.tsx` — current `user_type !== USER_TYPE.OPS` check pattern
- `src/app/(owner)/owner-layout-client.tsx` — current `user_type !== USER_TYPE.OWNER` check pattern
- `src/app/(tenant)/tenant-layout-client.tsx` — current `user_type !== USER_TYPE.TENANT` check pattern

### Key Rules

1. The exact pattern change from Section 9 Impact Matrix (applies to all 5 files):
   - Before: `user.user_type !== USER_TYPE.GUARD` (or ADMIN, OPS, OWNER, TENANT)
   - After: `!user.user_types?.includes(USER_TYPE.GUARD)` (with optional chaining for backward compat during migration)
2. Switcher placement from Section 6:
   - Guard: top-right of sticky header (next to language selector)
   - Admin: top-right of sidebar header
   - OPS: top-right of sticky header
   - Owner: top-right of portal header
   - Tenant: top-right of portal header
3. The `<PersonaSwitcher>` component is gated by the `multi_persona_enabled` config key (E05-T01 adds this gate). In E04, render it unconditionally — the component itself returns null for single-persona users. The feature flag gate is added in E05.
4. Import `PersonaSwitcher` from `@/components/shared/PersonaSwitcher`.
5. Pass the user's `user_types` and `active_persona` as props to `PersonaSwitcher` — the component needs them to determine whether to render and which persona is active.

### Deliverables

- [ ] `src/app/(guard)/guard-layout-client.tsx` — `user_type !==` → `!user.user_types?.includes()`, `<PersonaSwitcher>` added to sticky header
- [ ] `src/app/(admin)/admin-layout-client.tsx` — same pattern, `<PersonaSwitcher>` added to sidebar header
- [ ] `src/app/(ops)/ops-layout-client.tsx` — same pattern, `<PersonaSwitcher>` added to sticky header
- [ ] `src/app/(owner)/owner-layout-client.tsx` — same pattern, `<PersonaSwitcher>` added to portal header
- [ ] `src/app/(tenant)/tenant-layout-client.tsx` — same pattern, `<PersonaSwitcher>` added to portal header

### Acceptance Criteria

1. All 5 layout files use `user_types.includes()` instead of `user_type !==` for persona checks.
2. All 5 layout files import and render `<PersonaSwitcher>` in the correct position per the placement table.
3. `npx tsc --noEmit` passes.
4. `lsp_diagnostics` is clean on all 5 changed files.
5. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all 5 layout client files.

### Out of Scope

- Feature flag gating of the switcher (E05-T01)
- Callback redirect logic (T02)
- Index migration (T03)

---

## T02: Update Callback Redirect Logic to Use `active_persona`-Based Routing

### Objective

Replace the email-domain heuristic routing in `src/app/callback/redirect.ts` with `active_persona`-based routing using the `PORTAL_ROOT` map. Update `convex/users.ts` `resolvePostAuthDestination` to use `user.active_persona` instead of `user.user_type`. Add the redirect to `/post-auth/select-persona` for multi-persona users.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 3 (Routing vs. Access distinction), Section 5 (Post-Auth Persona Picker — redirect flow), Section 9 Impact Matrix rows for `src/app/callback/redirect.ts` and `convex/users.ts` `resolvePostAuthDestination`
- `src/app/callback/redirect.ts` — current email-domain heuristic routing logic
- `convex/users.ts` — `resolvePostAuthDestination` function with current `user.user_type === "X"` branches
- `tasks/phase-38-owner-portal-dashboard/README.md` — P38-E02 (Auth Redirect Fix) context — P38 may have already partially fixed this

### Key Rules

1. The routing distinction from Section 3:
   - **Access check** (`requireX()`): uses `user_types.includes(X)` — "does this user have the X persona?"
   - **Routing** (`resolvePostAuthDestination()`): uses `active_persona` — "which portal should this user land on?"
2. `resolvePostAuthDestination` change from Section 9:
   - Before: `user.user_type === "X"` branches
   - After: `user.active_persona === "X"` branches
3. Multi-persona redirect: if `user.user_types.length >= 2` AND `multi_persona_enabled` config is `true`, redirect to `/post-auth/select-persona` instead of the portal root. If `multi_persona_enabled` is `false`, use `active_persona` to route directly (no picker shown).
4. Check `localStorage["preferred_persona"]` in the callback client-side — if a valid remembered preference exists, use it to call `setActivePersona` and route directly without showing the picker.
5. The email-domain heuristic (`@guards.local` → guard portal, etc.) is removed — `active_persona` is the single source of truth for routing.

### Deliverables

- [ ] `src/app/callback/redirect.ts` — email-domain heuristic removed, `active_persona`-based routing via `PORTAL_ROOT` map, multi-persona users redirected to `/post-auth/select-persona` when `multi_persona_enabled` is true
- [ ] `convex/users.ts` — `resolvePostAuthDestination` updated to use `user.active_persona` instead of `user.user_type`

### Acceptance Criteria

1. A GUARD user (single persona) is routed to `/guard/dashboard` after login.
2. An ADMIN user (single persona) is routed to `/admin/dashboard` after login.
3. A TENANT+OWNER user (multi-persona) is routed to `/post-auth/select-persona` when `multi_persona_enabled` is true.
4. A TENANT+OWNER user with a valid `localStorage["preferred_persona"]` is routed directly to the preferred portal without seeing the picker.
5. `npx tsc --noEmit` passes.
6. `lsp_diagnostics` is clean on `src/app/callback/redirect.ts` and `convex/users.ts`.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/callback/redirect.ts` and `convex/users.ts`.

### Out of Scope

- Feature flag config key creation (E05-T01)
- Index migration (T03)

---

## T03: Update `convex/users.ts` Queries to Use `by_active_persona` Index

### Objective

Update `listAdmins()` and any other queries in `convex/users.ts` that use the `by_user_type` index to use the new `by_active_persona` index instead. Verify all guard-scoped queries still work correctly.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 8 (Index Migration), Section 9 Impact Matrix row for `convex/users.ts` `listAdmins`
- `convex/users.ts` — `listAdmins()` and any other queries using `.withIndex("by_user_type", ...)` or `.withIndex("by_type_and_status", ...)`

### Key Rules

1. The exact change from Section 9 Impact Matrix:
   - Before: `.withIndex("by_user_type", q => q.eq("user_type", "ADMIN"))`
   - After: `.withIndex("by_active_persona", q => q.eq("active_persona", "ADMIN"))`
2. This is correct because `active_persona` reflects the user's primary role — admins have `active_persona = "ADMIN"`. Full correctness is maintained per the feature doc.
3. Also update any query using `by_type_and_status` to use `by_persona_and_status`.
4. Guard-scoped queries that use `requireGuard()` and then filter by `guard_id` are NOT affected — they don't use the `by_user_type` index.
5. After updating, run a spot-check: query `listAdmins()` and confirm it returns the same admin users as before.

### Deliverables

- [ ] `convex/users.ts` — `listAdmins()` and any other `by_user_type` / `by_type_and_status` index usages updated to `by_active_persona` / `by_persona_and_status`

### Acceptance Criteria

1. `listAdmins()` returns the same admin users as before the change.
2. No query in `convex/users.ts` references `by_user_type` or `by_type_and_status` after this task.
3. `npx tsc --noEmit` passes.
4. `lsp_diagnostics` is clean on `convex/users.ts`.
5. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/users.ts`. Grep for `by_user_type` and `by_type_and_status` in `convex/users.ts` to confirm no remaining usages.

### Out of Scope

- Removing `by_user_type` and `by_type_and_status` indexes from schema (E05 cleanup)
- Other files that may use these indexes (audit those in E05)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**
