# Phase 1: Auth + Accounts + RBAC (P01)

## Overview

Set up the complete authentication and authorization foundation. After this phase: guards can log in with phone+password, admins can log in via Google SSO, auth helpers enforce role-based access on every Convex function, the RBAC system manages permissions, and the seed script bootstraps the platform for first use.

## Dependencies

None — this is the first phase.

## Key Documentation

| Doc | Sections to Read |
|-----|-----------------|
| [01-tech-stack.md](../../notes/01-tech-stack.md) | Auth Architecture, Login Flows, Middleware, Key Integration Code Patterns |
| [03-roles-and-permissions.md](../../notes/03-roles-and-permissions.md) | Permission Definitions, Default Roles, Guard Permissions, Bootstrap Process |
| [10-convex-schema.md](../../notes/10-convex-schema.md) | Phase 1 tables: `users`, `guard_profiles`, `roles`, `user_role_assignments`, `system_config`, `audit_logs` |
| [11-convex-architecture.md](../../notes/11-convex-architecture.md) | Wrapped Mutations, Auth Helper Layer, AuthKit Component, Actions Layer |
| [13-constants-reference.md](../../notes/13-constants-reference.md) | All enums, permissions, audit actions, config keys |

## Epics

| ID | Title | Tasks | Status | Depends On |
|----|-------|-------|--------|------------|
| P01-E01 | [Project Scaffolding](P01-E01-project-scaffolding.md) | 6 | done | — |
| P01-E02 | [Convex Schema + Core Infrastructure](P01-E02-schema-and-infra.md) | 5 | done | E01 |
| P01-E03 | [WorkOS Auth Configuration](P01-E03-workos-auth-config.md) | 5 | done | E02 |
| P01-E04 | [Guard Login Flow](P01-E04-guard-login.md) | 6 | done | E03 |
| P01-E05 | [Admin Login Flow](P01-E05-admin-login.md) | 4 | done | E03 |
| P01-E06 | [Auth Helpers + Route Protection](P01-E06-auth-helpers-route-protection.md) | 5 | done | E03 |
| P01-E07 | [RBAC System](P01-E07-rbac-system.md) | 5 | done | E06 |
| P01-E08 | [Seed Script + System Config](P01-E08-seed-and-config.md) | 4 | done | E07 |

**Total: 8 epics, 40 tasks**

## Dependency Graph

```
E01 (Scaffolding)
 └─► E02 (Schema + Infra)
      └─► E03 (WorkOS Auth Config)
           ├─► E04 (Guard Login)      ← parallel with E05, E06
           ├─► E05 (Admin Login)      ← parallel with E04, E06
           └─► E06 (Auth Helpers + Route Protection)
                └─► E07 (RBAC System)
                     └─► E08 (Seed + Config)
```

**Parallelism opportunity**: E04, E05, and E06 all depend only on E03 — they can be executed in parallel by different agent sessions.

## Execution Order (Recommended)

1. **E01** → Project scaffolding, dependencies, shared utils
2. **E02** → Schema, convex.config.ts, functions.ts, audit triggers
3. **E03** → auth.config.ts, auth.ts, http.ts, ConvexClientProvider, root layout
4. **E04** → Guard login page + server action, password change, dashboard placeholder
5. **E05** → Admin login page, callback route, admin dashboard placeholder
6. **E06** → auth.helpers.ts, middleware.ts, guard layout, admin layout
7. **E07** → Role CRUD, user queries, admin creation, role assignment, role management UI
8. **E08** → Seed script, system_config CRUD, admin settings page, integration tests

## Completion Criteria

- [ ] Guard can log in with phone + password → sees dashboard
- [ ] Guard with `must_change_password: true` is forced to change password
- [ ] Admin can log in with Google SSO → sees dashboard
- [ ] Unauthenticated users are redirected to login pages
- [ ] Guards cannot access admin routes; admins cannot access guard routes
- [ ] `requireGuard(ctx)`, `requireAdmin(ctx)`, `requirePermission(ctx, "X")` work correctly
- [ ] Banned guards cannot log in
- [ ] RBAC: roles can be created/edited/deleted (soft), assigned to admin users
- [ ] System roles (Super Admin, Ops Agent) cannot be deleted or renamed
- [ ] Admin accounts can be pre-created before first SSO login
- [ ] `npx convex run seed:init` bootstraps roles + super admin + system config
- [ ] Seed is idempotent (running twice has no effect)
- [ ] Admin settings page can view and edit config values
- [ ] All tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)

## Files Created by This Phase

```
rental-platform-os/
├── convex/
│   ├── schema.ts, convex.config.ts, functions.ts
│   ├── auth.config.ts, auth.ts, auth.helpers.ts, http.ts
│   ├── roles.ts, users.ts, admins.ts, userRoleAssignments.ts
│   ├── systemConfig.ts, seed.ts
│   └── *.test.ts (8 test files)
├── lib/
│   ├── constants.ts, validators.ts, money.ts, dates.ts
│   └── __tests__/validators.test.ts
├── src/app/
│   ├── layout.tsx, callback/route.ts
│   ├── (auth)/guard/login/, (auth)/guard/change-password/, (auth)/admin/login/
│   ├── (guard)/layout.tsx, (guard)/dashboard/page.tsx
│   └── (admin)/layout.tsx, dashboard/, roles/, roles/admins/, settings/
├── src/components/shared/ConvexClientProvider.tsx
├── src/components/admin/PermissionEditor.tsx, AdminCreateDialog.tsx, UserRoleManager.tsx
├── middleware.ts, vitest.config.mts, .prettierrc, eslint.config.mjs
└── .env.example
```
