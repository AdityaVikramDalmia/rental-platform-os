---
id: P30-E01
title: Ops Persona Foundation
phase: 30
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P30-E01: Ops Persona Foundation

## Overview

Establish OPS as a first-class persona beside GUARD and ADMIN. This epic adds the `OPS` user type, phone+password auth identity mapping, `requireOps()` guardrail helper, Ops Agent role assignment wiring, and a dedicated mobile-first `/ops/*` portal shell with core pages. OPS reuses existing admin-grade backend capabilities through `requirePermission()` checks, so no duplicate Convex domain modules are created.

## Task Queue

- [x] P30-E01-T01: Schema & Constants for OPS Persona
- [x] P30-E01-T02: Auth Flow + Route Routing + Dev Login
- [x] P30-E01-T03: WorkOS Action + Seed Wiring for OPS Accounts
- [x] P30-E01-T04: OPS Portal Route Group + Mobile Layout
- [x] P30-E01-T05: OPS Core Pages (Dashboard, Leads, Visits, Closures)

---

## T01: Schema & Constants for OPS Persona

### Objective

Add `OPS` as a legal user type in schema and shared constants so backend auth, routing, and UI can treat OPS as a first-class persona without hacks or overloads on GUARD.

### Required Reading

- `notes/10-convex-schema.md` — `users.user_type` validator conventions and enum expansion pattern
- `notes/13-constants-reference.md` — User type constants and permission naming conventions
- `notes/03-roles-and-permissions.md` — Ops Agent role capability model
- `lib/constants.ts` — Existing `USER_TYPE` and `OPS_AGENT_PERMISSIONS` definitions

### Key Rules

1. In `convex/schema.ts`, extend `userTypeValidator` with `v.literal("OPS")`; do not remove or rename existing literals (`GUARD`, `ADMIN`, `TENANT`, `OWNER`).
2. In `lib/constants.ts`, add `OPS: "OPS"` to `USER_TYPE` and keep existing object export/type inference patterns intact.
3. Keep `OPS_AGENT_PERMISSIONS` as the source of truth; do not create duplicate permission sets for OPS in new files.
4. OPS phone identity still follows project phone rules: store exactly 10 digits, strip formatting before persistence.
5. OPS synthetic email namespace is `@ops.local`; this domain is dedicated to OPS and must not be mixed with guard synthetic emails.
6. Maintain global data conventions even in constants work: money is paise integers and dates are Unix ms (no float money, no string dates).
7. Do not introduce schema-breaking renames for existing enum fields or constants consumed by prior phases.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/schema.ts` — `userTypeValidator` includes `v.literal("OPS")`
- [ ] `lib/constants.ts` — `USER_TYPE.OPS` added; OPS persona constants remain centralized and type-safe

### Acceptance Criteria

1. `users.user_type` validator accepts `"OPS"`.
2. `USER_TYPE.OPS` exists and compiles where `USER_TYPE` is consumed.
3. Existing user types and existing permission constants remain unchanged.
4. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts` and `lib/constants.ts`.

### Out of Scope

- Auth callbacks and runtime user-type detection.
- OPS portal routes or UI.
- WorkOS account creation actions.

---

## T02: Auth Flow + Route Routing + Dev Login

### Objective

Wire auth identity and routing for OPS users: detect OPS synthetic emails in auth callbacks, enforce persona access through `requireOps()`, and route OPS users to `/ops/dashboard` in production and dev login flows.

### Required Reading

- `notes/01-tech-stack.md` — Authentication Architecture section (WorkOS + callback behavior)
- `notes/11-convex-architecture.md` — Auth helper patterns (`requireAdmin`, `requirePermission`, user lookup flow)
- `notes/03-roles-and-permissions.md` — Role assignment and permission checking expectations
- `src/app/callback/redirect.ts` — Existing post-login routing by persona
- `src/app/dev/login/actions.ts` — Existing dev-login role routing behavior

### Key Rules

1. In `convex/auth.ts`, detect `@ops.local` in user creation handling and set `user_type: "OPS"`.
2. Add `requireOps()` in `convex/auth.helpers.ts` following the same defensive checks pattern as `requireAdmin()`/`requireGuard()` (auth required, user exists, not banned, correct user type).
3. `requireOps()` should enforce OPS persona boundaries and return the resolved app user record for downstream use.
4. In `src/app/callback/redirect.ts`, add OPS branch routing to `/ops/dashboard`.
5. In dev login flow (`src/app/dev/login/actions.ts` and related dev login UI wiring if required), OPS accounts must route to `/ops/dashboard`.
6. Preserve existing guard and admin routing behavior; no regressions in `/guard/*` or `/admin/*` redirect logic.
7. Reuse existing role/permission model; do not create OPS-specific duplicate permission check helpers when `requirePermission()` already fits.
8. Keep the implementation fully type-safe and aligned with existing auth helper signatures.
9. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/auth.ts` — OPS synthetic email detection and `user_type` assignment
- [ ] `convex/auth.helpers.ts` — `requireOps()` helper mirroring existing helper style
- [ ] `src/app/callback/redirect.ts` — OPS redirect branch to `/ops/dashboard`
- [ ] `src/app/dev/login/actions.ts` — OPS persona routing support in dev login flow
- [ ] `src/app/dev/login/page.tsx` — OPS test-login button/preset wiring (if button rendering is defined here)

### Acceptance Criteria

1. New OPS user identities from WorkOS are persisted with `user_type: "OPS"`.
2. `requireOps()` rejects non-OPS users and banned users.
3. Callback routing sends OPS users to `/ops/dashboard`.
4. Dev login supports OPS users and routes them to `/ops/dashboard`.
5. Guard/admin login and callback behavior remains unchanged.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/auth.ts`, `convex/auth.helpers.ts`, `src/app/callback/redirect.ts`, `src/app/dev/login/actions.ts`, and `src/app/dev/login/page.tsx` (if touched).

### Out of Scope

- Creating WorkOS OPS accounts (handled in T03).
- Building OPS portal layouts/pages.

---

## T03: WorkOS Action + Seed Wiring for OPS Accounts

### Objective

Enable admin-managed OPS account provisioning and local/dev bootstrap by implementing `createOpsAccount()` in the WorkOS actions layer and seeding an OPS test user assigned to the existing Ops Agent role.

### Required Reading

- `notes/11-convex-architecture.md` — Actions layer pattern (`action` + `ctx.runMutation`)
- `notes/01-tech-stack.md` — WorkOS auth model and synthetic email usage
- `notes/03-roles-and-permissions.md` — Ops Agent role expectations
- `convex/actions/workos.ts` — Existing `createGuardAccount` pattern to mirror
- `convex/seed.ts` — Current idempotent role/user/config seed flow
- `lib/validators.ts` — Phone normalization rules

### Key Rules

1. Add `createOpsAccount()` in `convex/actions/workos.ts` mirroring `createGuardAccount()` structure.
2. OPS synthetic email must be `{phone}@ops.local` (not the guard domain).
3. Normalize/validate phone input to 10 digits before synthetic email construction.
4. Keep all external WorkOS API calls inside Convex Actions only; no external calls in mutations/queries.
5. Use action -> internal mutation pattern to persist Convex records after WorkOS account creation.
6. Assign OPS users to the existing `Ops Agent` role and existing `OPS_AGENT_PERMISSIONS`; do not mint a new role for this epic.
7. Update `convex/seed.ts` with an idempotent OPS test-user path so repeated seeds do not duplicate accounts/assignments.
8. Preserve existing seed behavior for admin/guard/bootstrap config.
9. Store timestamps as Unix ms and keep all monetary values in paise where applicable.
10. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/actions/workos.ts` — `createOpsAccount()` action (WorkOS create user + Convex persistence wiring)
- [ ] `convex/seed.ts` — OPS test-user seed path with Ops Agent role assignment
- [ ] `convex/guards.ts` or `convex/ops.ts` (if required) — Internal mutation support for OPS user/profile creation used by the new action

### Acceptance Criteria

1. Admin-triggered OPS account provisioning is available via `createOpsAccount()`.
2. OPS accounts are created with `@ops.local` synthetic emails.
3. OPS records are linked to the Ops Agent role without creating a duplicate role.
4. Seed remains idempotent and can be run repeatedly without duplicating OPS users/role assignments.
5. Existing guard/account creation paths continue to work unchanged.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/actions/workos.ts`, `convex/seed.ts`, and any additional Convex file modified for OPS account persistence.

### Out of Scope

- OPS portal UI or navigation.
- Checklist/document/incentive-v2 business logic.

---

## T04: OPS Portal Route Group + Mobile Layout

### Objective

Create the OPS route group and shared layout shell so OPS users have a dedicated mobile-first portal surface with persona-specific auth checks and bottom navigation.

### Required Reading

- `notes/05-guard-portal-ux.md` — Mobile-first navigation and interaction patterns to mirror
- `notes/01-tech-stack.md` — App Router and auth architecture conventions
- `src/app/(guard)/layout.tsx` — Guard portal server layout reference
- `src/app/(guard)/guard-layout-client.tsx` — Guard mobile nav shell reference
- `AGENTS.md` — Next.js route-group collision rules (`(group)` vs real URL segments)

### Key Rules

1. Use route-group-safe structure: files must live under `src/app/(ops)/ops/...` so URLs resolve to `/ops/*`.
2. Create `src/app/(ops)/layout.tsx` as the server layout boundary for OPS routes.
3. Layout auth gate must ensure only `user_type === "OPS"` reaches OPS pages; unauthorized personas must be redirected.
4. Create `src/app/(ops)/ops-layout-client.tsx` as the mobile shell with bottom nav.
5. Bottom nav must contain exactly: Dashboard, Leads, Visits, Closures, More.
6. Mobile-first is mandatory: touch targets >= 44x44, compact card/list patterns, no admin desktop sidebar.
7. Use shadcn/ui components for all structural UI elements; avoid raw native form controls when interactive fields are needed.
8. Keep OPS portal English-only unless a future phase scopes OPS i18n.
9. Do not duplicate backend logic in layout components; use existing auth helpers and existing APIs.
10. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/app/(ops)/layout.tsx` — Server layout with OPS auth/persona checks
- [ ] `src/app/(ops)/ops-layout-client.tsx` — Mobile client shell with bottom navigation and "More" entry

### Acceptance Criteria

1. `/ops/*` routes are mounted via `(ops)/ops/*` file structure (no route-group collisions).
2. Non-OPS users cannot access OPS pages.
3. OPS users see mobile bottom nav with all five required entries.
4. Layout composes cleanly with existing root providers and app shell.
5. `npx tsc --noEmit` passes.
6. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(ops)/layout.tsx` and `src/app/(ops)/ops-layout-client.tsx`.

### Out of Scope

- Feature content for dashboard/leads/visits/closures pages.
- Checklist/documents/earnings/profile "More" sub-pages.

---

## T05: OPS Core Pages (Dashboard, Leads, Visits, Closures)

### Objective

Build the initial OPS portal pages (`/ops/dashboard`, `/ops/leads`, `/ops/visits`, `/ops/closures`) as mobile-first operational surfaces that reuse existing backend functions and permissions.

### Required Reading

- `notes/05-guard-portal-ux.md` — Mobile-first page composition and interaction conventions
- `notes/06-admin-panel-ux.md` — Existing lead/visit/closure operational UX patterns to adapt for mobile
- `notes/03-roles-and-permissions.md` — OPS permissions and RBAC expectations
- `notes/13-constants-reference.md` — Status enums, labels, and permission constants
- `src/app/(admin)/admin/leads/page.tsx` — Admin leads data/query patterns to reuse
- `src/app/(admin)/admin/visits/page.tsx` — Admin visits data/query patterns to reuse
- `src/app/(admin)/admin/closures/page.tsx` — Admin closures data/query patterns to reuse

### Key Rules

1. Create pages at `src/app/(ops)/ops/dashboard/page.tsx`, `src/app/(ops)/ops/leads/page.tsx`, `src/app/(ops)/ops/visits/page.tsx`, and `src/app/(ops)/ops/closures/page.tsx`.
2. OPS pages must reuse existing backend mutations/queries guarded by `requirePermission()`; do not create duplicate `ops*.ts` domain modules for equivalent operations.
3. Keep UI mobile-first: stacked cards/lists, narrow controls, thumb-friendly actions, minimal desktop-only table assumptions.
4. Use existing status constants and badge components where possible; do not create parallel status enums.
5. Any forms/actions added in OPS pages must use `react-hook-form` + `zod`.
6. Any mutation feedback must use `sonner` toasts.
7. Use shadcn/ui components for all input/select/dialog/sheet controls.
8. Keep money displayed from paise values and never introduce floating-point persistence.
9. Keep timestamps in Unix ms and format in UI only.
10. Preserve existing legal status transition rules (lead/visit/closure) from `notes/04-state-machines.md`; OPS UI cannot bypass transition constraints.
11. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/app/(ops)/ops/dashboard/page.tsx` — OPS dashboard with mobile operational summary and quick actions
- [ ] `src/app/(ops)/ops/leads/page.tsx` — Mobile lead queue view for OPS triage/actions
- [ ] `src/app/(ops)/ops/visits/page.tsx` — Mobile visit management view for OPS execution flow
- [ ] `src/app/(ops)/ops/closures/page.tsx` — Mobile closure management view for OPS handoff tracking
- [ ] `src/components/ops/*` (if needed) — Extracted OPS-specific mobile UI components used by these pages

### Acceptance Criteria

1. All four OPS routes render without runtime/type errors.
2. Leads/visits/closures pages consume existing backend APIs (no duplicated Convex business logic).
3. Mobile navigation correctly links to all four pages.
4. OPS pages obey RBAC and expose only actions permitted by Ops Agent permissions.
5. Forms and interactions follow `react-hook-form` + `zod` and `sonner` conventions.
6. `npx tsc --noEmit` passes.
7. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all new/changed OPS page files and any extracted OPS component files.

### Out of Scope

- Inspection checklist engine (P30-E02).
- Document collection and society liaison workflows (P30-E03).
- Incentive Model v2 (P30-E04).
- Cross-doc reconciliation updates (P30-E05).
