# Feature: OPS Admin Access + Google SSO

> **Priority**: Phase 30 extension (OPS backoffice access)
> **Personas**: OPS (primary), Admin (provisioning + RBAC)
> **Dependencies**: [Auth](../01-tech-stack.md#authentication-architecture), [Roles & Permissions](../03-roles-and-permissions.md), [OPS Portal](20-ops-portal.md), [Admin Panel UX](../06-admin-panel-ux.md)
> **Route Groups**: `(auth)/`, `(ops)/`, `(admin)/`

## Purpose

This feature extends the OPS persona beyond the mobile field portal by allowing OPS users to operate inside `/admin/*` based on RBAC permissions, while also adding optional Google SSO onboarding for OPS accounts.

The goal is one OPS identity that can work in two contexts:

- **Field mode**: mobile-first `/ops/*` screens
- **Backoffice mode**: desktop `/admin/*` workflows, permission-filtered

---

## What Was Implemented

| Area    | Change                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase A | OPS users are now allowed in admin route checks (`ADMIN` or `OPS`), not `ADMIN` only                                               |
| Phase A | New backend helper `requireBackoffice()` in `convex/auth.helpers.ts` for shared admin/ops access checks                            |
| Phase A | `convex/userRoleAssignments.ts:getByUserId` now uses `requireBackoffice()` so OPS can fetch role assignments for sidebar filtering |
| Phase A | Six listing editing mutations in `convex/listings.ts` now gate on `requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT)`              |
| Phase A | New constants helpers in `lib/constants.ts`: `BACKOFFICE_USER_TYPES`, `isBackofficeUser()`                                         |
| Phase B | OPS account creation supports optional `google_email` in `createOpsAccount`                                                        |
| Phase B | `createOpsInternal` accepts optional `email` and persists it on OPS user records                                                   |
| Phase B | OPS login page split into server (`getSignInUrl`) + client component with Google SSO button and phone/password form                |
| Phase B | New admin `OpsCreateDialog` wired into guards page with optional Google Email field                                                |
| Phase B | Auth lifecycle handlers (`handleUserCreated`/`handleUserUpdated`) hardened for pre-linked users and OPS email sync                 |

---

## Two-Tier OPS Account Model

| OPS account type         | WorkOS login email used at creation               | `users.email` | Primary sign-in surface                  | Default post-auth destination |
| ------------------------ | ------------------------------------------------- | ------------- | ---------------------------------------- | ----------------------------- |
| OPS with Google email    | Real Google email (for example `admin@example.com`) | Stored        | Google SSO only (no phone+password form) | `/admin/dashboard`            |
| OPS without Google email | Synthetic email (`{phone}@ops.local`)    | Not stored    | Phone + password form on `/ops/login`    | `/ops/dashboard`              |

Notes:

- Both types are still `user_type: "OPS"` in Convex.
- OPS role assignment remains `Ops Agent` at creation time.
- OAuth callback now always redirects to `/post-auth`, where a Convex resolver maps by `user_type`.
- For OPS users, resolver destination is `/admin/dashboard`; phone/password sign-in still redirects to `/ops/dashboard`.

---

## Authentication Flows

### Flow A: Google SSO path (OPS with Google email)

```mermaid
flowchart TD
  A[Admin creates OPS with google_email] --> B[WorkOS user created with real email]
  B --> C[OPS opens /ops/login and clicks Sign in with Google]
  C --> D[getSignInUrl from server page.tsx]
  D --> E[WorkOS AuthKit Google sign-in]
  E --> F[/callback route]
  F --> G[/post-auth]
  G --> H[resolvePostAuthDestination query]
  H --> I[/admin/dashboard]
```

### Flow B: Phone + password path (synthetic OPS email)

```mermaid
flowchart TD
  A[/ops/login form submit] --> B[opsLogin server action]
  B --> C[normalizePhone + toOpsSyntheticEmail]
  C --> D[WorkOS authenticateWithPassword]
  D --> E[saveSession]
  E --> F{must_change_password metadata?}
  F -->|yes| G[/ops/change-password]
  F -->|no| H[/ops/dashboard]
```

---

## Permission Model for `/admin/*`

### Gatekeeping layers

1. **Route/component user-type gate**: admin pages now allow `ADMIN` or `OPS`.
2. **Sidebar visibility gate**: `admin-layout-client` filters nav items by each item's `requiredPermission`.
3. **Backend mutation/query gate**: Convex `requirePermission()` checks role permissions for both ADMIN and OPS.

### Admin sidebar behavior for Ops Agent role

The sidebar uses `ADMIN_NAV_ITEMS.requiredPermission` + role assignments fetched from `api.userRoleAssignments.getByUserId`.

| Sidebar section | Required permission           | Ops Agent visibility |
| --------------- | ----------------------------- | -------------------- |
| Dashboard       | none                          | visible              |
| Societies       | `societies.view`              | visible              |
| Guards          | `guards.view`                 | visible              |
| Verification    | `leads.verify`                | visible              |
| Leads           | `leads.view`                  | visible              |
| Listings        | `listings.view`               | visible              |
| Visits          | `visits.view`                 | visible              |
| Checklists      | `visits.view`                 | visible              |
| Closures        | `closures.view`               | visible              |
| Payouts         | `payouts.view`                | visible              |
| Incentives      | `incentives.view`             | visible              |
| Analytics       | `analytics.view`              | visible              |
| Inquiries       | `tenant_inquiries.view`       | visible              |
| Owner Requests  | `owner_service_requests.view` | visible              |
| Owners          | `owners.view`                 | hidden               |
| RM Dashboard    | `rm.view`                     | hidden               |
| Referrals       | `referrals.view`              | hidden               |
| Audit           | `audit.view`                  | hidden               |
| Support Inbox   | `support_inquiries.view`      | hidden               |
| Chat Monitor    | `chat.moderate`               | hidden               |

---

## OPS_AGENT_PERMISSIONS (Complete List)

Source: `lib/constants.ts` (`OPS_AGENT_PERMISSIONS`).

| Permission                      | Enables                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `societies.view`                | Read societies and building context in admin and ops workflows |
| `buildings.view`                | Read building records                                          |
| `guards.view`                   | Read guard data                                                |
| `guards.manage_shifts`          | Update guard shifts                                            |
| `leads.view`                    | View lead queues                                               |
| `leads.request_info`            | Send lead NEED_INFO requests                                   |
| `leads.verify`                  | Verify leads                                                   |
| `leads.reject`                  | Reject leads                                                   |
| `leads.mark_duplicate`          | Mark duplicate leads                                           |
| `leads.set_bounty`              | Set lead bounty amounts                                        |
| `listings.view`                 | View listings                                                  |
| `listings.create`               | Create listings                                                |
| `listings.edit`                 | Edit listings and related entities                             |
| `listings.publish`              | Change listing publication status                              |
| `listings.view_inquiries`       | View listing inquiries                                         |
| `visits.view`                   | View visit queues                                              |
| `visits.create`                 | Schedule visits                                                |
| `visits.edit`                   | Edit visit details                                             |
| `visits.cancel`                 | Cancel visits                                                  |
| `closures.view`                 | View closures                                                  |
| `closures.create`               | Create closures                                                |
| `closures.edit`                 | Edit closures                                                  |
| `payouts.view`                  | View payout records                                            |
| `incentives.view`               | View incentives pages                                          |
| `quality.view`                  | View quality dashboards                                        |
| `analytics.view`                | View analytics dashboards                                      |
| `tenant_inquiries.view`         | View tenant inquiries                                          |
| `tenant_inquiries.manage`       | Review/manage tenant inquiries                                 |
| `owner_service_requests.view`   | View owner service requests                                    |
| `owner_service_requests.manage` | Manage owner service request lifecycle                         |

---

## Backend Auth Helpers: When to Use Which

| Helper                               | Allows                                                   | Typical usage                                                                                                          |
| ------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `requireAdmin(ctx)`                  | `ADMIN` only                                             | Admin-only management surfaces (for example roles administration endpoints)                                            |
| `requireBackoffice(ctx)`             | `ADMIN` or `OPS` + `ACTIVE` status                       | Shared backoffice reads that should work for both personas (for example role-assignment fetch for sidebar permissions) |
| `requirePermission(ctx, permission)` | `ADMIN` or `OPS` + `ACTIVE` + RBAC permission membership | Any mutation/query that should be capability-based instead of role-type-based                                          |

### Current feature usage highlights

- `convex/userRoleAssignments.ts:getByUserId` -> `requireBackoffice(ctx)`
- `convex/listings.ts` editing helpers -> `requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT)`
- `convex/ownerServiceRequests.ts:checkPermission` -> authorizes both `ADMIN` and `OPS` for `owner_service_requests.manage`, so OPS can complete owner onboarding through `actions/workos.createOwnerAccount`

---

## `handleUserCreated` Hardening (Webhook Flow)

Source: `convex/auth.ts`.

```typescript
// Decision order in handleUserCreated
// 1) by_workos_user_id
// 2) by_email
// 3) create new user
```

Detailed flow:

1. Normalize incoming email (`trim().toLowerCase()`).
2. Lookup by `by_workos_user_id` first:
   - If found, patch display name and exit.
3. Lookup by `by_email` next:
   - If found and `workos_user_id` is empty or `"pending"`, bind `workos_user_id` and patch name.
   - If found with a real `workos_user_id`, patch name only.
4. If no matches, create a new user:
   - `@ops.local` -> `user_type: "OPS"`
   - `@guards.local` -> `user_type: "GUARD"`
   - otherwise -> `user_type: "ADMIN"`

### `workos_user_id` immutability rule

Once a non-pending `workos_user_id` is set, webhook updates do not overwrite it via email match. This prevents accidental identity reassignment when two users share or re-use email-like identifiers over time.

### `handleUserUpdated` OPS behavior

`handleUserUpdated` now syncs email for:

- all `ADMIN` users
- `OPS` users that already have `users.email` set

This preserves synthetic-email OPS records (no stored email) while keeping Google-email OPS records in sync.

---

## OPS User Creation Flows

### A) Create OPS user with Google email (new option)

1. Admin opens `Guards` page (`/admin/guards`) and clicks **Add OPS**.
2. In `OpsCreateDialog`, provide name, phone, temp password, and `google_email`.
3. `createOpsAccount` action creates WorkOS user with the real email.
4. `createOpsInternal` writes Convex `users` row with `user_type: "OPS"`, `phone`, and `email`.
5. `createOpsInternal` auto-assigns the `Ops Agent` role via `user_role_assignments`.

### B) Create OPS user without Google email (existing flow)

1. Same dialog, leave Google Email blank.
2. `createOpsAccount` builds synthetic WorkOS email: `{phone}@ops.local`.
3. `createOpsInternal` stores OPS user without `users.email`.
4. Account continues in phone + password auth model for `/ops/*`.

---

## Post-Auth Redirect Behavior

| Entry point                       | Redirect logic                                                                               | Destination                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google SSO callback (`/callback`) | Always rewrites to `/post-auth`; server resolver uses `api.users.resolvePostAuthDestination` | Resolver-based (`GUARD` -> `/guard/dashboard`, `OPS` -> `/admin/dashboard`, `TENANT` -> `/tenant/dashboard`, `OWNER` -> `/owner/dashboard`, `ADMIN` fallback heuristic) |
| OPS phone/password (`opsLogin`)   | Explicit `redirect()` in `src/app/(auth)/ops/login/actions.ts`                               | `/ops/change-password` or `/ops/dashboard`                                                                                                                              |

---

## File Map (All Changed Files)

### Core auth and backend authorization

| File                             | What changed                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `convex/auth.helpers.ts`         | Added `requireBackoffice()` (`ADMIN` or `OPS`, active-only)                                                      |
| `convex/userRoleAssignments.ts`  | `getByUserId` now uses `requireBackoffice()` to support OPS sidebar permission loading                           |
| `convex/systemConfig.ts`         | `get` / `getAll` switched to `requireBackoffice()` for non-public config access                                  |
| `convex/admins.ts`               | `listAdmins` switched to `requireBackoffice()`                                                                   |
| `convex/users.ts`                | `getById` switched to `requireBackoffice()`                                                                      |
| `convex/ownerServiceRequests.ts` | `checkPermission` now accepts both `ADMIN` and `OPS` user types                                                  |
| `convex/listings.ts`             | Six listing-edit mutations switched to `requirePermission(ctx, PERMISSIONS.LISTINGS_EDIT)`                       |
| `convex/auth.ts`                 | `handleUserCreated` hardened with `by_workos_user_id -> by_email -> create` order and immutable binding behavior |
| `convex/auth.ts`                 | `handleUserUpdated` now syncs email for OPS users when `users.email` exists                                      |
| `convex/actions/workos.ts`       | `createOpsAccount` accepts optional `google_email`; chooses real email vs synthetic ops email                    |
| `convex/guards.ts`               | `createOpsInternal` accepts optional `email` and persists it                                                     |
| `lib/constants.ts`               | Added `BACKOFFICE_USER_TYPES`, `isBackofficeUser()`, and expanded/used OPS permission set                        |

### OPS auth UI + provisioning UI

| File                                            | What changed                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `src/app/(auth)/ops/login/page.tsx`             | Converted to server component that fetches `getSignInUrl()`         |
| `src/app/(auth)/ops/login/ops-login-client.tsx` | Added Google SSO button and retained phone/password form            |
| `src/components/admin/OpsCreateDialog.tsx`      | New dialog with optional Google Email field + credential handoff UI |
| `src/app/(admin)/admin/guards/page.tsx`         | Wired in `OpsCreateDialog` and `Add OPS` action                     |

### Admin backoffice access gates updated (`ADMIN` -> `ADMIN or OPS`)

| File                                                                         | What changed                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------ |
| `src/app/(admin)/admin-layout-client.tsx`                                    | Layout-level user-type gate now allows OPS       |
| `src/app/(admin)/admin/analytics/page.tsx`                                   | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/audit/page.tsx`                                       | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/chat-monitor/page.tsx`                                | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/checklists/page.tsx`                                  | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/closures/page.tsx`                                    | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/dashboard/page.tsx`                                   | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/guards/page.tsx`                                      | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/incentives/page.tsx`                                  | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/leads/page.tsx`                                       | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/listings/page.tsx`                                    | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/owner-requests/page.tsx`                              | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/owners/page.tsx`                                      | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/payouts/page.tsx`                                     | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/referrals/page.tsx`                                   | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/rm-dashboard/page.tsx`                                | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/settings/referrals/page.tsx`                          | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/societies/page.tsx`                                   | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/support/page.tsx`                                     | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/tenant-inquiries/page.tsx`                            | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/verification/page.tsx`                                | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/visits/page.tsx`                                      | User-type guard now allows OPS                   |
| `src/app/(admin)/admin/tenant-inquiries/components/inquiry-detail-panel.tsx` | Action gating now recognizes OPS alongside ADMIN |

---

## Security Considerations

1. **No backdoor via user type**: allowing OPS into `/admin/*` does not bypass RBAC; backend actions still enforce explicit permissions.
2. **Active-status enforcement**: `requireBackoffice()` and `requirePermission()` both reject non-active users.
3. **Stable identity binding**: webhook resolution prioritizes `workos_user_id`; email matching only binds when ID is missing/pending.
4. **Least-privilege by default**: `Ops Agent` role intentionally excludes sensitive permissions (`audit.view`, `roles.manage`, `payouts.approve`, `chat.moderate`, etc.).
5. **Admin-controlled OPS creation**: `createOpsInternal` validates assigning actor as `ADMIN` and auto-binds the system role.

---

## Known Limitations and Future Improvements

1. **Nav items without `requiredPermission` are always visible**: items like `Roles`/`Settings` are not currently hidden by sidebar permission filtering; backend still protects sensitive operations.
2. **Resolver heuristic still inferential for ADMIN users**: `/post-auth` checks owner linkage (`owners.by_user_id` or `owners.by_email`) first, then tenant linkage (`tenant_profiles.by_user_id`), before defaulting to admin; a first-class preferred-portal setting would be more explicit.
3. **Backoffice helper not fully adopted yet**: `isBackofficeUser()` and `BACKOFFICE_USER_TYPES` exist but many page-level checks still inline the user-type condition.
4. **SSO-first expectation for Google-email OPS**: callback behavior correctly routes Google-email OPS to `/admin/dashboard`; if product expects phone+password parity for those users in all surfaces, add explicit email-based password login UX for OPS.

---

## Business Rules

1. OPS can access `/admin/*` only when authenticated, active, and authorized by RBAC.
2. OPS mobile path remains `/ops/*` with phone-first experience.
3. OPS account creation always assigns the `Ops Agent` role.
4. `workos_user_id` can be initially bound from pending/empty state, but should not be replaced afterward.
5. Listing edit sub-resources (roommates/commute entries) are capability-gated by `listings.edit`, not role type.

---

## Related Documents

- [OPS Portal](20-ops-portal.md) - baseline OPS mobile workflows and permissions
- [Roles & Permissions](../03-roles-and-permissions.md) - RBAC model and permission semantics
- [Tech Stack: Authentication Architecture](../01-tech-stack.md#authentication-architecture) - WorkOS + callback architecture
- [Admin Panel UX](../06-admin-panel-ux.md) - admin IA and page responsibilities
- [Constants Reference](../13-constants-reference.md) - canonical permission constants and user types
