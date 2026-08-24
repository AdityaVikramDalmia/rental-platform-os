# Feature: OPS Portal

> **Priority**: Phase 30 (Field Ops Platform)
> **Personas**: OPS (primary), Admin (configuration + oversight)
> **Dependencies**: Guard Management, Lead Pipeline, Visit Management, Closure & Payouts, Field Checklists (F21)

> **Implementation Note (Feb 2026):** V1 implements list views only. Detail pages (`/ops/leads/[id]`, `/ops/visits/[id]`, `/ops/closures/[id]`) are planned for Phase 44.

## Purpose

The OPS persona is a field operations agent who handles the day-to-day deal pipeline: verifying leads, scheduling visits, managing closures, tracking documents, and coordinating handovers. OPS users get a mobile-first portal under `(ops)/` that mirrors the admin panel's capabilities but is scoped to their assigned work. They use a two-tier auth model: phone + password with synthetic email `{phone}@ops.local`, or Google SSO when the OPS account is created with a Google email.

In addition to the dedicated OPS portal, OPS can access `/admin/*` with a permission-filtered sidebar. See [OPS admin access & Google SSO](23-ops-admin-access.md) for details.

OPS is NOT a separate backend. Every mutation OPS users call is the same mutation admins call, protected by `requirePermission()`. There is zero mutation duplication between admin and OPS.

## Entities Involved

| Table                   | Role in Feature                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `users`                 | Stores OPS identities, account status, and assignment metadata used across OPS workflows. |
| `guard_profiles`        | Provides guard assignment context for OPS queueing, targeting, and workload views.        |
| `leads`                 | Feeds OPS lead triage queues and follow-up operations.                                    |
| `visits`                | Feeds OPS scheduling, execution tracking, and visit operations.                           |
| `closures`              | Feeds OPS closure tracking and downstream payout/document coordination context.           |
| `listings`              | Provides listing context used by OPS document and pipeline workflows.                     |
| `checklist_templates`   | Stores reusable checklist templates configured for field operations.                      |
| `checklist_instances`   | Stores per-visit/field checklist executions and review state.                             |
| `document_requirements` | Stores document collection tasks, item-level progress, and assignment ownership.          |
| `regulatory_items`      | Stores society/regulatory follow-up tasks used in handover/compliance workflows.          |
| `owners`                | Resolves owner context for OPS-facing document/compliance requirements.                   |
| `negotiations`          | Provides negotiation-state context surfaced in OPS operations/monitoring views.           |
| `system_config`         | Stores configurable OPS behavior thresholds and operational policy values.                |
| `ops_kpi_targets`       | Stores per-agent KPI targets used in ops-management tracking views.                       |
| `ops_warnings`          | Stores structured warning records for OPS risk/escalation visibility.                     |
| `ops_check_in_notes`    | Stores weekly check-in notes and action tracking for OPS management workflows.            |

---

## Persona Definition

| Attribute         | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `user_type`       | `"OPS"` (from `USER_TYPE.OPS` in `lib/constants.ts`)                                           |
| Auth method       | Phone + password (`{phone}@ops.local`) or Google SSO (when created with Google email) |
| Synthetic email   | `{phone}@ops.local` (constant `OPS_EMAIL_DOMAIN = "@ops.local"`)             |
| Portal URL prefix | `/ops/`                                                                                        |
| Layout            | Mobile-first, similar to guard portal                                                          |
| Audit actor type  | `"OPS"` (from `AUDIT_ACTOR_TYPE.OPS`)                                                          |

---

## Authentication Flow

OPS auth supports two paths: phone + password for `/ops/*`, and Google SSO for `/admin/*` when the account has a Google email.

### Login

1. OPS agent enters their 10-digit phone number and password on `/ops/login`
2. Frontend constructs synthetic email: `{phone}@ops.local`
3. WorkOS email+password auth validates credentials
4. On success, WorkOS issues a JWT; Convex validates it via `auth.config.ts`
5. `requireAuth()` resolves the `workos_user_id` to a `users` record with `user_type === "OPS"`
6. If `must_change_password === true`, redirect to `/ops/change-password` before portal access

### Auth Helper

```typescript
// convex/auth.helpers.ts
export async function requireOps(ctx: AuthContext): Promise<UserDoc> {
  const user = await requireAuth(ctx);
  if (user.user_type !== "OPS") throw new Error("OPS access required");
  if (user.status !== "ACTIVE") throw new Error("OPS account not active");
  return user;
}
```

`requireOps()` is used for OPS-only queries (e.g., "my assigned work"). For mutations that both admin and OPS can call, `requirePermission()` handles both — it accepts `user_type === "ADMIN" || user_type === "OPS"`.

### Permission Check (Shared with Admin)

```typescript
// requirePermission accepts BOTH admin and OPS
export async function requirePermission(ctx, permission: string): Promise<UserDoc> {
  const user = await requireAuth(ctx);
  if (user.user_type !== "ADMIN" && user.user_type !== "OPS") {
    throw new Error("Admin or OPS access required");
  }
  // ... RBAC check via user_role_assignments
}
```

OPS users are assigned the "Ops Agent" role at creation. This role grants a fixed set of permissions (see `OPS_AGENT_PERMISSIONS` in `lib/constants.ts`).

---

## OPS Permissions

The `OPS_AGENT_PERMISSIONS` array in `lib/constants.ts` defines exactly what OPS can do. These are assigned via the "Ops Agent" system role.

| Permission                | What It Allows                        |
| ------------------------- | ------------------------------------- |
| `societies.view`          | Read society and building data        |
| `buildings.view`          | Read building data                    |
| `guards.view`             | View guard profiles                   |
| `guards.manage_shifts`    | Update guard shift schedules          |
| `leads.view`              | View all leads                        |
| `leads.request_info`      | Send NEED_INFO requests               |
| `leads.verify`            | Verify leads (SUBMITTED → VERIFIED)   |
| `leads.reject`            | Reject leads                          |
| `leads.mark_duplicate`    | Mark leads as DUPLICATE               |
| `leads.set_bounty`        | Set bounty amounts on leads           |
| `listings.view`           | View listings                         |
| `listings.create`         | Create new listings                   |
| `listings.edit`           | Edit listing details                  |
| `listings.publish`        | Publish/archive listings              |
| `listings.view_inquiries` | View listing inquiries                |
| `visits.view`             | View all visits                       |
| `visits.create`           | Schedule new visits                   |
| `visits.edit`             | Edit visit details, reassign guards   |
| `visits.cancel`           | Cancel visits                         |
| `closures.view`           | View closures                         |
| `closures.create`         | Create closure records                |
| `closures.edit`           | Edit closure details                  |
| `payouts.view`            | View payout records                   |
| `incentives.view`         | View incentive cards and leaderboards |
| `quality.view`            | View quality scores                   |
| `analytics.view`          | View analytics dashboards             |
| `tenant_inquiries.view`   | View tenant inquiries                 |
| `tenant_inquiries.manage` | Review and process tenant inquiries   |

OPS does NOT have: `guards.create`, `guards.manage_status`, `guards.reset_password`, `payouts.approve`, `payouts.disburse`, `payouts.void`, `closures.confirm`, `incentives.award`, `roles.manage`, `admins.create`, `system.configure`, `audit.view`.

---

## Route Group: `(ops)/`

The `(ops)/` route group provides a shared layout without adding a URL segment. All OPS pages live under the `/ops/` URL prefix via a nested real directory.

```
src/app/
  (auth)/
    ops/
      login/page.tsx          → /ops/login
      change-password/page.tsx → /ops/change-password
  (ops)/
    layout.tsx                 # OPS layout (nav, auth check, requireOps)
    ops/
      dashboard/page.tsx       → /ops/dashboard
      leads/page.tsx           → /ops/leads
      leads/[id]/page.tsx      → /ops/leads/[id]
      visits/page.tsx          → /ops/visits
      visits/[id]/page.tsx     → /ops/visits/[id]
      closures/page.tsx        → /ops/closures
      closures/[id]/page.tsx   → /ops/closures/[id]
      documents/page.tsx       → /ops/documents
      handover/page.tsx        → /ops/handover
```

### Layout

The `(ops)/layout.tsx` wraps all OPS pages with:

- Auth check: redirect to `/ops/login` if not authenticated
- User type check: redirect if `user_type !== "OPS"`
- `must_change_password` check: redirect to `/ops/change-password` if true
- Bottom navigation (mobile-first, 5 tabs)
- `ConvexClientProvider` (already in root layout)

---

## Pages

### Dashboard (`/ops/dashboard`)

Mobile-first summary of today's work queue.

**Sections**:

- **Today's Visits**: Count of visits scheduled for today, with status breakdown
- **Pending Leads**: Leads in SUBMITTED or NEED_INFO status awaiting action
- **Open Closures**: Closures in PENDING status
- **Documents Due**: Document requirements with `overall_status === "IN_PROGRESS"` or `"BLOCKED"`
- **Quick Actions**: Buttons to navigate to leads, visits, closures

**Data sources**: `visits.list`, `leads.list`, `closures.list`, `document_requirements` queries — all using `requirePermission()` which accepts OPS.

### Leads (`/ops/leads`)

Full lead queue with triage actions.

**Features**:

- Filter by status (SUBMITTED, NEED_INFO, POTENTIAL_DUPLICATE, VERIFIED, REJECTED)
- Filter by society
- Sort by submission date (newest first)
- Tap lead → detail view with full triage actions

**Actions available** (same mutations as admin):

- Request info: `leads.requestInfo({ id, message })` — requires `leads.request_info`
- Verify: `leads.verify({ id, bounty_amount_paise })` — requires `leads.verify`
- Reject: `leads.reject({ id, reason })` — requires `leads.reject`
- Mark duplicate: `leads.markDuplicate({ id })` — requires `leads.mark_duplicate`

### Visits (`/ops/visits`)

Visit board with scheduling and monitoring.

**Features**:

- Filter by status, date range, society
- Today's visits highlighted
- Tap visit → detail with guard info, lead info, checklist status

**Actions available**:

- Schedule visit: `visits.create({ lead_id, scheduled_start, scheduled_end, assigned_guard_id })` — requires `visits.create`
- Edit visit: `visits.edit({ id, ... })` — requires `visits.edit`
- Cancel visit: `visits.cancel({ id, reason? })` — requires `visits.cancel`
- Confirm visit: `visits.confirm({ id })` — requires `visits.edit`
- Mark no-show: `visits.markNoShow({ id, notes? })` — requires `visits.edit`

### Closures (`/ops/closures`)

Closure tracking and document coordination.

**Features**:

- Filter by status (PENDING, CONFIRMED, CANCELLED)
- Tap closure → detail with linked lead, listing, payout info

**Actions available**:

- Create closure: `closures.create({ ... })` — requires `closures.create`
- Edit closure: `closures.edit({ id, ... })` — requires `closures.edit`
- Note: OPS cannot CONFIRM closures (`closures.confirm` permission not granted)

### Documents (`/ops/documents`)

Document requirement tracking across all active deals.

**Features**:

- List all `document_requirements` assigned to the OPS user or unassigned
- Filter by `overall_status` (NOT_STARTED, IN_PROGRESS, COMPLETE, BLOCKED)
- Filter by `requirement_type` (OWNER_DOCS, TENANT_DOCS, SOCIETY_DOCS)
- Tap requirement → detail with item-level status, upload capability

**Actions available**:

- Update document item status: `documentRequirements.updateItem({ requirement_id, item_id, status, storage_id? })`
- Upload document file: `documentRequirements.generateUploadUrl()` + `documentRequirements.attachFile()`

### Handover (`/ops/handover`)

Move-in handover coordination. Shows visits with `MOVE_IN_HANDOVER` checklist type.

**Features**:

- List visits that have a `MOVE_IN_HANDOVER` checklist instance
- Filter by checklist status (ASSIGNED, IN_PROGRESS, SUBMITTED, UNDER_REVIEW, APPROVED)
- Tap → checklist detail with photo evidence viewer
- Review checklist: `checklists.reviewChecklist({ checklist_id, outcome, review_notes })` — requires `visits.edit`

---

## Navigation

Bottom navigation bar (mobile-first, 5 tabs):

| Tab      | Icon | URL              | Label     |
| -------- | ---- | ---------------- | --------- |
| Home     | 🏠   | `/ops/dashboard` | Dashboard |
| Leads    | 📋   | `/ops/leads`     | Leads     |
| Visits   | 📅   | `/ops/visits`    | Visits    |
| Closures | 🤝   | `/ops/closures`  | Closures  |
| Docs     | 📁   | `/ops/documents` | Documents |

---

## Zero Mutation Duplication

This is the core architectural principle for OPS. The backend has NO OPS-specific mutations. Every action OPS takes calls the same Convex function that admin calls.

```typescript
// WRONG — never do this
export const opsVerifyLead = mutation({ ... }); // duplicate of leads.verify

// CORRECT — OPS calls the same mutation
// leads.verify({ id, bounty_amount_paise })
// requirePermission(ctx, "leads.verify") accepts both ADMIN and OPS
```

The `requirePermission()` helper in `auth.helpers.ts` explicitly checks `user_type !== "ADMIN" && user_type !== "OPS"` — both types pass through to the RBAC check. OPS users with the "Ops Agent" role get exactly the permissions listed in `OPS_AGENT_PERMISSIONS`.

---

## OPS User Lifecycle

### Creation

OPS accounts are created by admins (requires `guards.create` permission):

1. Admin enters OPS agent's name and phone number
2. System constructs synthetic email: `{phone}@ops.local`
3. WorkOS Action creates the user with a temporary password
4. Convex `users` record created with `user_type: "OPS"`, `must_change_password: true`
5. "Ops Agent" role assigned via `user_role_assignments`
6. OPS agent logs in, forced to change password on first login

### Status Transitions

Same as guards and admins: `ACTIVE ↔ INACTIVE`, `ACTIVE/INACTIVE → BANNED`. Admin manages OPS status via the admin panel.

### Password Reset

Admin can reset OPS password via the same WorkOS Action used for guards (`resetGuardPassword` action, adapted for OPS email domain).

---

## Audit Trail

All OPS actions are captured in `audit_logs` with `actor_type: "OPS"`. The audit trigger in `functions.ts` resolves the actor type from `user.user_type`. OPS actions are visible in the admin audit trail viewer at `/admin/audit` with the OPS actor type filter.

---

## Business Rules

1. OPS users MUST have `user_type === "OPS"` and `status === "ACTIVE"` to access the portal.
2. OPS uses `requirePermission()` for all mutations — NOT a separate `requireOps()` for mutations.
3. `requireOps()` is used only for OPS-specific read queries (e.g., "my assigned documents").
4. OPS cannot confirm closures, approve/disburse payouts, award incentives, manage roles, or configure the system.
5. OPS cannot create or manage guard accounts.
6. OPS cannot view the audit trail (no `audit.view` permission).
7. All OPS actions appear in the audit trail with `actor_type: "OPS"`.
8. The "Ops Agent" role is a system role (`is_system_role: true`) — it cannot be deleted.
9. OPS phone numbers follow the same 10-digit convention as guards. Strip all formatting on input.
10. The `OPS_EMAIL_DOMAIN` constant (`"@ops.local"`) is the canonical source for constructing OPS synthetic emails.

---

## Edge Cases

- **OPS user tries to confirm a closure**: `requirePermission(ctx, "closures.confirm")` throws "Missing permission: closures.confirm". Frontend should hide the confirm button for OPS users.
- **OPS user banned mid-session**: Next Convex call throws "Account banned". Frontend catches and redirects to `/ops/login`.
- **OPS user assigned to a visit's checklist review**: OPS has `visits.edit` permission, so `checklists.reviewChecklist()` succeeds.
- **Multiple OPS agents working same lead**: Last-write-wins. No locking. Audit trail shows all changes.
- **OPS user with no role assigned**: `requirePermission()` finds no permissions, throws "Missing permission: X". Admin must assign the "Ops Agent" role.

---

## Related Documents

- [Guard Management](02-guard-management.md) — OPS auth mirrors guard phone+password auth pattern
- [Roles & Permissions](../03-roles-and-permissions.md) — OPS_AGENT_PERMISSIONS, "Ops Agent" system role
- [Convex Architecture](../11-convex-architecture.md#auth-helper-layer) — requirePermission accepts both ADMIN and OPS
- [Visit Management](06-visit-management.md) — OPS schedules and monitors visits
- [Closure & Payouts](07-closure-and-payouts.md) — OPS creates closures but cannot confirm or disburse
- [Field Checklists](21-field-checklists.md) — OPS reviews submitted checklists
- [Constants Reference](../13-constants-reference.md) — OPS_EMAIL_DOMAIN, OPS_AGENT_PERMISSIONS, USER_TYPE.OPS
- [OPS admin access & Google SSO](23-ops-admin-access.md) — OPS access to `/admin/*`, permission-filtered sidebar, two-tier auth model
