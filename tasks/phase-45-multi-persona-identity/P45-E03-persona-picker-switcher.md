---
id: P45-E03
title: Persona Picker + Switcher UI
phase: 45
status: pending
depends_on: ["P45-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P45-E03: Persona Picker + Switcher UI

## Overview

Build the two user-facing multi-persona surfaces: (1) the post-auth persona picker page at `src/app/post-auth/select-persona/page.tsx` that appears when a user has `user_types.length >= 2`, and (2) the `PersonaSwitcher` component at `src/components/shared/PersonaSwitcher.tsx` that lives in every portal header. Also create the backend mutations (`setActivePersona`, `addPersona`, `removePersona`) and the shared `PORTAL_ROOT` / `PERSONA_DISPLAY_CONFIG` constants that both surfaces depend on.

## Prerequisites

- **Read first**: [P45-E02 Completion Summary](P45-E02-auth-helper-migration.md#completion-summary) — confirms all auth helpers use `user_types.includes()` and `addPersonaToUser` is wired into invite flows.
- `user_types` and `active_persona` fields exist and are populated for all users (E01 done).
- Auth helpers use array membership checks (E02 done).

## Task Queue

- [x] P45-E03-T01: Create `users.setActivePersona`, `users.addPersona`, and `users.removePersona` mutations
- [x] P45-E03-T02: Create post-auth persona picker page at `src/app/post-auth/select-persona/page.tsx`
- [x] P45-E03-T03: Create `src/components/shared/PersonaSwitcher.tsx` component
- [x] P45-E03-T04: Create `PORTAL_ROOT` map, `getPortalRoot()` utility, and `PERSONA_DISPLAY_CONFIG`

---

## T01: Create `users.setActivePersona`, `users.addPersona`, and `users.removePersona` Mutations

### Objective

Add three new mutations to `convex/users.ts` that manage the persona lifecycle: `setActivePersona` (user-callable, switches active portal), `addPersona` (admin-only, adds a persona to a user), and `removePersona` (admin-only, removes a persona with constraints).

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 4 (Persona Lifecycle), Section 5 (Post-Auth Persona Picker — "Backend" subsection), Section 6 (In-App Persona Switcher — "Switcher Behavior" step 2)
- `convex/users.ts` — existing mutations for context and import patterns
- `notes/11-convex-architecture.md` — mutation wrapper conventions (`functions.ts` import rule)
- `notes/03-roles-and-permissions.md` — permission strings for admin-only mutations

### Key Rules

1. `setActivePersona(args: { persona: UserType })`:
   - Callable by any authenticated user (not admin-only).
   - Validates that `args.persona` is in the user's `user_types` array — throw `ConvexError("Persona not available")` if not.
   - Patches `active_persona` to `args.persona`.
   - Does NOT change `user_types`.
2. `addPersona(args: { userId: Id<"users">, persona: UserType })`:
   - Admin-only — use `requirePermission(ctx, "users.manage")`.
   - Calls `addPersonaToUser(ctx, args.userId, args.persona)` — reuses the helper from E01-T03.
   - Audit-logged via the `mutation` wrapper from `./functions`.
3. `removePersona(args: { userId: Id<"users">, persona: UserType, newActivePersona?: UserType, reason: string })`:
   - Admin-only — use `requirePermission(ctx, "users.manage")`.
   - Constraints from Section 4 (How Personas Are Removed):
     - Cannot remove the last persona — throw if `user_types.length === 1`.
     - Cannot remove `active_persona` without simultaneously providing `newActivePersona` — throw if `persona === user.active_persona && !args.newActivePersona`.
     - If removing GUARD and no other field-worker persona remains, trigger WorkOS suspension (call the existing WorkOS suspend action).
   - `reason` field is required and audit-logged.
   - Patches `user_types` to the filtered array and optionally updates `active_persona`.

### Deliverables

- [x] `convex/users.ts` — `setActivePersona` mutation (user-callable, validates persona membership)
- [x] `convex/users.ts` — `addPersona` mutation (admin-only, delegates to `addPersonaToUser`)
- [x] `convex/users.ts` — `removePersona` mutation (admin-only, enforces all removal constraints, audit-logged)

### Acceptance Criteria

1. `setActivePersona` succeeds when the requested persona is in `user_types`.
2. `setActivePersona` throws when the requested persona is NOT in `user_types`.
3. `addPersona` throws when called by a non-admin user.
4. `removePersona` throws when trying to remove the last persona.
5. `removePersona` throws when trying to remove `active_persona` without providing `newActivePersona`.
6. `npx tsc --noEmit` passes.
7. `lsp_diagnostics` is clean on `convex/users.ts`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/users.ts`.

### Out of Scope

- Persona picker UI (T02)
- PersonaSwitcher component (T03)
- Feature flag gating (E05)

---

## T02: Create Post-Auth Persona Picker Page

### Objective

Create the persona picker page at `src/app/post-auth/select-persona/page.tsx`. This page appears after login when a user has `user_types.length >= 2`. It shows one card per persona, supports a "Remember my choice" checkbox backed by `localStorage`, and auto-redirects if a valid remembered preference exists.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 5 (Post-Auth Persona Picker) in full — picker UI spec, remembered preference invalidation, backend mutation
- `notes/features/36-multi-persona-identity.md` — Section 6 (Portal Root Map) for the `PORTAL_ROOT` constant
- `src/app/(guard)/guard-layout-client.tsx` — mobile-first layout reference
- `src/components/ui/card.tsx`, `src/components/ui/button.tsx` — shadcn/ui components to use

### Key Rules

1. Route: `src/app/post-auth/select-persona/page.tsx` — this is a new route group `(post-auth)` or a standalone route outside any portal group. It must NOT be inside `(guard)/`, `(admin)/`, etc. since it's pre-portal.
2. The page is a full-screen modal experience (not a sidebar or partial overlay). On mobile it fills the viewport.
3. Single-persona users are NEVER shown this page — the callback redirect logic (E04-T02) handles routing them directly. The picker page itself should also check and redirect if `user_types.length === 1`.
4. "Remember my choice" checkbox stores the selected persona in `localStorage` key `"preferred_persona"`.
5. On page load: check `localStorage["preferred_persona"]`. If it exists AND is still in the user's current `user_types`, call `setActivePersona` and redirect to `PORTAL_ROOT[preference]` without showing the picker.
6. On persona card click: call `users.setActivePersona` mutation, then `router.push(PORTAL_ROOT[selectedPersona])`.
7. Each persona card shows: icon (from `PERSONA_DISPLAY_CONFIG`), label, description. Current `active_persona` is highlighted.
8. The page requires auth — redirect to login if unauthenticated.

### Deliverables

- [x] `src/app/post-auth/select-persona/page.tsx` — full-screen persona picker with card-per-persona layout, "Remember my choice" checkbox, localStorage preference check, and `setActivePersona` + redirect on selection

### Acceptance Criteria

1. Page renders one card per persona in the user's `user_types` array.
2. Clicking a card calls `setActivePersona` and navigates to the correct portal root.
3. "Remember my choice" checkbox stores selection in `localStorage["preferred_persona"]`.
4. On page load with a valid remembered preference, auto-redirects without showing the picker.
5. Unauthenticated users are redirected to login.
6. `npx tsc --noEmit` passes.
7. `lsp_diagnostics` is clean on the new page file.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/post-auth/select-persona/page.tsx`.

### Out of Scope

- PersonaSwitcher component (T03)
- Wiring the picker into the callback redirect (E04-T02)
- Feature flag gating (E05)

---

## T03: Create `PersonaSwitcher` Component

### Objective

Create `src/components/shared/PersonaSwitcher.tsx` — a dropdown component that appears in every portal header when `user_types.length >= 2`. Clicking a persona calls `setActivePersona` and navigates to the new portal root.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 6 (In-App Persona Switcher) in full — placement table, switcher behavior steps 1-4, portal root map
- `src/components/ui/dropdown-menu.tsx` — shadcn/ui DropdownMenu component to use for the switcher
- `src/components/guard/LanguageSelector.tsx` — reference for a header-mounted selector component pattern

### Key Rules

1. The component renders `null` when `user_types.length < 2` — hidden for single-persona users. This is the primary guard.
2. Switcher behavior from Section 6:
   - Step 1: User clicks switcher → dropdown shows all available personas (current one highlighted with a checkmark or different style).
   - Step 2: User selects a different persona → `users.setActivePersona` mutation called.
   - Step 3: On success → `router.push(getPortalRoot(newPersona))` — hard navigation to new portal root.
   - Step 4: `localStorage["preferred_persona"]` updated to new selection.
3. Use `useMutation(api.users.setActivePersona)` from Convex React for the mutation call.
4. Show a loading state on the switcher button while the mutation is in flight.
5. Use `PERSONA_DISPLAY_CONFIG` (from T04) for icon and label per persona.
6. The component is a client component (`"use client"`).

### Deliverables

- [x] `src/components/shared/PersonaSwitcher.tsx` — dropdown switcher component, renders null for single-persona users, calls `setActivePersona` + navigates on selection, updates localStorage

### Acceptance Criteria

1. Component renders null when `user_types.length < 2`.
2. Component renders a dropdown with all personas when `user_types.length >= 2`.
3. Current `active_persona` is visually highlighted in the dropdown.
4. Selecting a persona calls `setActivePersona` and navigates to `PORTAL_ROOT[newPersona]`.
5. `localStorage["preferred_persona"]` is updated on selection.
6. `npx tsc --noEmit` passes.
7. `lsp_diagnostics` is clean on `src/components/shared/PersonaSwitcher.tsx`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/shared/PersonaSwitcher.tsx`.

### Out of Scope

- Wiring PersonaSwitcher into portal layouts (E04-T01)
- Feature flag gating (E05)

---

## T04: Create `PORTAL_ROOT` Map, `getPortalRoot()` Utility, and `PERSONA_DISPLAY_CONFIG`

### Objective

Create the shared constants and utilities that both the persona picker and the persona switcher depend on: the `PORTAL_ROOT` record mapping each `UserType` to its portal root URL, the `getPortalRoot()` helper function, and the `PERSONA_DISPLAY_CONFIG` object with icon, label, and description for each persona.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 6 (Portal Root Map) for the exact `PORTAL_ROOT` values
- `lib/constants.ts` — existing `USER_TYPE` enum and `FIELD_WORKER_USER_TYPES` — add new constants here
- `notes/13-constants-reference.md` — conventions for adding new constants

### Key Rules

1. The exact `PORTAL_ROOT` map from Section 6:
   ```typescript
   const PORTAL_ROOT: Record<UserType, string> = {
     GUARD: "/guard/dashboard",
     ADMIN: "/admin/dashboard",
     OPS: "/ops/dashboard",
     OWNER: "/owner/dashboard",
     TENANT: "/tenant/dashboard",
   };
   ```
2. `getPortalRoot(persona: UserType): string` — simple lookup with a fallback to `"/"` for unknown types.
3. `PERSONA_DISPLAY_CONFIG` should include `icon` (a Lucide icon component or icon name string), `label` (display name), and `description` (one-line description of what this persona does). Example:
   ```typescript
   const PERSONA_DISPLAY_CONFIG: Record<
     UserType,
     { label: string; description: string; iconName: string }
   > = {
     GUARD: {
       label: "Security Guard",
       description: "Submit leads and earn bounties",
       iconName: "Shield",
     },
     ADMIN: { label: "Admin", description: "Manage the platform", iconName: "Settings" },
     OPS: { label: "Field Ops", description: "Manage visits and closures", iconName: "Briefcase" },
     OWNER: { label: "Property Owner", description: "Manage your properties", iconName: "Home" },
     TENANT: {
       label: "Tenant",
       description: "Browse and inquire about listings",
       iconName: "Search",
     },
   };
   ```
4. Place these constants in `lib/constants.ts` alongside the existing `USER_TYPE` enum — they are shared between frontend and backend.
5. Export both `PORTAL_ROOT` and `PERSONA_DISPLAY_CONFIG` as named exports.

### Deliverables

- [x] `lib/constants.ts` — `PORTAL_ROOT` record, `getPortalRoot()` function, and `PERSONA_DISPLAY_CONFIG` record added

### Acceptance Criteria

1. `getPortalRoot("GUARD")` returns `"/guard/dashboard"`.
2. `getPortalRoot("ADMIN")` returns `"/admin/dashboard"`.
3. `PERSONA_DISPLAY_CONFIG` has entries for all 5 persona types.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` is clean on `lib/constants.ts`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/constants.ts`.

### Out of Scope

- Wiring these constants into layout files (E04-T01)
- Feature flag (E05)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**
