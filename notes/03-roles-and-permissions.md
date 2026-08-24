# Roles & Permissions (RBAC)

## Overview

Action-level RBAC. Each permission is a specific action a user can perform. Roles are named collections of permissions. Users are assigned roles. A user's effective permissions = union of all assigned role permissions.

## Permission Definitions

### Society & Building Management

| Permission         | Description                           |
| ------------------ | ------------------------------------- |
| `societies.view`   | View society list and details         |
| `societies.create` | Create new societies                  |
| `societies.edit`   | Edit society details, change status   |
| `societies.delete` | Delete a society (hard delete — rare) |
| `buildings.view`   | View buildings within societies       |
| `buildings.create` | Add buildings to a society            |
| `buildings.edit`   | Edit building details                 |
| `buildings.delete` | Delete a building                     |

### Guard Management

| Permission              | Description                                  |
| ----------------------- | -------------------------------------------- |
| `guards.view`           | View guard list, profiles, shifts            |
| `guards.create`         | Create new guard accounts                    |
| `guards.edit`           | Edit guard profile, type, society assignment |
| `guards.manage_status`  | Set guard ACTIVE / INACTIVE / BANNED         |
| `guards.manage_shifts`  | Create/edit/delete guard shift schedules     |
| `guards.reset_password` | Reset a guard's password                     |

### Lead Management

| Permission             | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `leads.view`           | View lead queue and details                         |
| `leads.request_info`   | Mark lead as NEED_INFO + add notes                  |
| `leads.verify`         | Open owner verification form, complete verification |
| `leads.reject`         | Reject a lead (with reason)                         |
| `leads.mark_duplicate` | Finalize a lead as DUPLICATE                        |
| `leads.set_bounty`     | Set/edit prospective bounty on a lead               |

### Listing Management

| Permission                | Description                                 |
| ------------------------- | ------------------------------------------- |
| `listings.view`           | View listings                               |
| `listings.create`         | Create listing from verified lead           |
| `listings.edit`           | Edit listing details, photos                |
| `listings.publish`        | Toggle listing DRAFT / PUBLISHED / ARCHIVED |
| `listings.view_inquiries` | View contact form submissions               |

### Visit Management

| Permission      | Description                        |
| --------------- | ---------------------------------- |
| `visits.view`   | View visit board                   |
| `visits.create` | Schedule a new visit               |
| `visits.edit`   | Edit visit details, reassign guard |
| `visits.cancel` | Cancel a visit                     |

### Closure & Payout

| Permission         | Description                             |
| ------------------ | --------------------------------------- |
| `closures.view`    | View closures                           |
| `closures.create`  | Create a closure record                 |
| `closures.edit`    | Edit closure details, upload documents  |
| `closures.confirm` | Confirm a closure (PENDING → CONFIRMED) |
| `payouts.view`     | View payout records                     |
| `payouts.create`   | Initiate a payout                       |
| `payouts.approve`  | Approve a payout (pending → approved)   |
| `payouts.disburse` | Mark payout as disbursed                |
| `payouts.void`     | Void a payout (pending → voided)        |

### Incentive Management

| Permission             | Description                    |
| ---------------------- | ------------------------------ |
| `incentives.view`      | View incentive cards           |
| `incentives.award`     | Manually award cards to guards |
| `incentives.revoke`    | Revoke a card                  |
| `incentives.configure` | Edit auto-award thresholds     |

### Referral Management

| Permission                 | Description                                   |
| -------------------------- | --------------------------------------------- |
| `referrals.view`           | View referral codes, referrals, milestones    |
| `referrals.manage`         | Create/void referrals, override attribution   |
| `referrals.configure`      | Edit referral config (amounts, splits, scope) |
| `referrals.approve_payout` | Approve referral milestone payouts            |

### Chat & Deal Room

| Permission                | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| `chat.view`               | View chat channels and messages                                  |
| `chat.send`               | Send regular participant chat messages                           |
| `chat.moderate`           | Moderate failed/flagged chat content                             |
| `chat.admin`              | Admin-only controls (archive/reopen, system send, impersonation) |
| `deal_checklists.view`    | View deal checklists and checklist progress                      |
| `deal_checklists.manage`  | Create/edit/share/regenerate deal checklists                     |
| `deal_checklists.approve` | (Reserved — sign-off currently uses party identity, not RBAC)    |
| `owner_invites.manage`    | Generate/regenerate/read owner invites                           |

### Negotiation

| Permission                      | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `negotiations.view`             | View negotiation list and details                |
| `negotiations.initiate`         | Start a new negotiation from an INTERESTED visit |
| `negotiations.manage_rooms`     | Open/close Ops-Owner and Combined rooms          |
| `negotiations.create_proposal`  | Create and share structured terms proposals      |
| `negotiations.record_token`     | Record token advance collection                  |
| `negotiations.manage_checklist` | Update post-agreement checklist items            |
| `negotiations.fail`             | Mark a negotiation as FAILED                     |
| `negotiations.expire`           | Mark a negotiation as EXPIRED                    |
| `negotiations.escalate`         | Escalate to team lead or founder                 |

### Checklist & Document Management (Phase 30)

| Permission                    | Description                                                  |
| ----------------------------- | ------------------------------------------------------------ |
| `checklists.view`             | View checklist templates and instances                       |
| `checklists.manage_templates` | Create and edit checklist templates                          |
| `checklists.assign`           | Assign checklist instances to guards/visits                  |
| `checklists.review`           | Review submitted checklist instances (approve/reject/revise) |
| `documents.view`              | View document requirement bundles and item statuses          |
| `documents.manage`            | Create document requirement bundles, update item statuses    |
| `documents.verify`            | Mark document items as VERIFIED or REJECTED                  |
| `quality.view`                | View guard quality scores, tiers, and streaks                |
| `quality.override`            | Manually override quality scores or payout adjustments       |

### Notification Infrastructure (Phase 35)

| Permission                  | Description                                           | Default Roles    |
| --------------------------- | ----------------------------------------------------- | ---------------- |
| `notifications.manage`      | Manage notification templates and system settings     | Super Admin      |
| `notifications.view_admin`  | View admin notification monitor and dead-letter queue | Super Admin, OPS |
| `notifications.send_system` | Send system-wide notification alerts                  | Super Admin      |

### Monetization Management (Phase 36)

| Permission                | Description                                    | Default Roles        |
| ------------------------- | ---------------------------------------------- | -------------------- |
| `transaction_fees.manage` | Manage slab schedule and custom fee quotes     | Super Admin          |
| `passes.purchase`         | Tenant capability to purchase Discovery Pass   | Tenant (auth-scoped) |
| `passes.apply_credit`     | Apply Discovery Pass credit to closure fee     | System (internal)    |
| `promotions.create`       | Create promoted listing campaigns              | Owner (auth-scoped)  |
| `promotions.manage`       | Pause/expire/cancel promotion campaigns        | Super Admin, OPS     |
| `service_bundles.create`  | Create service bundle orders                   | Super Admin, OPS     |
| `service_bundles.manage`  | Update service bundle lifecycle and completion | Super Admin, OPS     |
| `revenue.view`            | View monetization dashboard and revenue ledger | Super Admin          |

**Role allocation notes**:

- Tenant-scoped permissions (`passes.purchase`) are enforced via tenant auth flow; not assignable as backoffice capabilities.
- Owner-scoped permissions (`promotions.create`) are enforced via owner auth flow.

### Resident Lifecycle (Phase 37)

| Permission                | Description                                         | Default Roles        |
| ------------------------- | --------------------------------------------------- | -------------------- |
| `residents.view`          | View resident profiles and rent records             | Super Admin, OPS     |
| `residents.manage`        | Activate/deactivate residents, manage assignments   | Super Admin          |
| `rent_records.manage`     | Record rent payments, generate receipts, waive rent | Super Admin, OPS     |
| `maintenance.create`      | Create maintenance tickets                          | Tenant (auth-scoped) |
| `maintenance.manage`      | Assign, update, resolve maintenance tickets         | Super Admin, OPS     |
| `maintenance.view_all`    | View all maintenance tickets across properties      | Super Admin, OPS     |
| `lease_renewals.initiate` | Start renewal process                               | Super Admin, System  |
| `lease_renewals.manage`   | Manage renewal negotiations, approve settlements    | Super Admin          |
| `move_out.manage`         | Process move-out requests and deposit settlements   | Super Admin          |

### Owner Portal Operations (Phase 38)

P38 introduces no new permissions. Owner portal access is gated by:

- `user_type = "OWNER"` auth check (same as existing owner auth flow)
- Owner-scoped queries filter data by `owner_id` - no cross-owner data leakage
- Existing permissions from P20 (owner service requests), P22 (referrals), P24 (chat), P30 (documents) are reused

### Analytics & Audit

| Permission       | Description               |
| ---------------- | ------------------------- |
| `analytics.view` | View analytics dashboards |
| `audit.view`     | View audit log            |

### System Administration

| Permission         | Description                                  |
| ------------------ | -------------------------------------------- |
| `roles.view`       | View roles and assignments                   |
| `roles.manage`     | Create/edit/delete roles, assign to users    |
| `admins.create`    | Create new admin accounts                    |
| `admins.edit`      | Edit admin accounts                          |
| `system.configure` | Edit system config (rate limits, thresholds) |

---

## Default Roles

### Super Admin (System Role — cannot be deleted)

**All permissions**. Full platform control. Includes all referral, chat, negotiation, notification, monetization, and resident lifecycle permissions.

Created via seed script on deployment. Intended for DemoRentals founders / senior leadership.

### Ops Agent (System Role — cannot be deleted)

Day-to-day operations. Can handle the full lead-to-visit pipeline but CANNOT manage payouts, system config, or other admins.

**Permissions**:

```
societies.view
buildings.view
guards.view, guards.manage_shifts
leads.view, leads.request_info, leads.verify, leads.reject, leads.mark_duplicate, leads.set_bounty
listings.view, listings.create, listings.edit, listings.publish, listings.view_inquiries
visits.view, visits.create, visits.edit, visits.cancel
closures.view, closures.create, closures.edit
payouts.view
incentives.view
quality.view
analytics.view
tenant_inquiries.view, tenant_inquiries.manage
owner_service_requests.view, owner_service_requests.manage
notifications.view_admin
promotions.manage
service_bundles.create, service_bundles.manage
residents.view
rent_records.manage
maintenance.manage, maintenance.view_all
```

**Excluded from Ops Agent role** (Super Admin only or auth-scoped):

- `notifications.manage`, `notifications.send_system`
- `transaction_fees.manage`, `revenue.view`
- `residents.manage`, `lease_renewals.manage`, `move_out.manage`
- `passes.purchase`, `maintenance.create`, `promotions.create` (persona-auth-scoped)

### Custom Roles

Super Admin can create additional roles with any combination of permissions. Examples:

- **Lead Reviewer**: `leads.view`, `leads.request_info`, `leads.verify`, `leads.reject`, `leads.mark_duplicate` — can only review leads.
- **Finance**: `closures.view`, `closures.confirm`, `payouts.view`, `payouts.create`, `payouts.approve`, `payouts.disburse`, `payouts.void`, `analytics.view` — handles money only.
- **Society Manager**: `societies.*`, `buildings.*`, `guards.*` — manages onboarding.
- **Referral Manager**: `referrals.view`, `referrals.manage`, `referrals.configure`, `referrals.approve_payout` — manages entire referral program.
- **Chat Operator**: `chat.view`, `chat.send`, `chat.moderate`, `chat.admin`, `deal_checklists.view`, `deal_checklists.manage`, `owner_invites.manage` — full deal room operations including impersonation and invite lifecycle.

---

## OPS Agent Permissions (RBAC — same system as Admin)

OPS agents go through the same RBAC system as admins. Their permissions are determined by assigned roles, not hardcoded. The `requirePermission()` function accepts both `user_type === "ADMIN"` and `user_type === "OPS"`.

**OPS Agent role** (system role, cannot be deleted) — created by seed script. Permissions:

```
societies.view, buildings.view,
guards.view, guards.manage_shifts,
leads.view, leads.request_info, leads.verify, leads.reject, leads.mark_duplicate, leads.set_bounty,
listings.view, listings.create, listings.edit, listings.publish, listings.view_inquiries,
visits.view, visits.create, visits.edit, visits.cancel,
closures.view, closures.create, closures.edit,
payouts.view,
incentives.view,
quality.view,
analytics.view,
tenant_inquiries.view, tenant_inquiries.manage,
owner_service_requests.view, owner_service_requests.manage,
notifications.view_admin,
promotions.manage,
service_bundles.create, service_bundles.manage,
residents.view,
rent_records.manage,
maintenance.manage, maintenance.view_all
```

**Explicitly excluded for OPS Agent role**:

- `notifications.manage`, `notifications.send_system`
- `transaction_fees.manage`, `revenue.view`
- `residents.manage`, `lease_renewals.manage`, `move_out.manage`

**OPS-specific auth helper**: `requireOps(ctx)` — used in OPS portal layouts and OPS-only routes. Requires `user_type === "OPS"` and `status === "ACTIVE"`.

**Auth helper hierarchy**: `requireAuth` (any authenticated user) → `requireGuard` / `requireAdmin` / `requireOps` (type-specific checks) → `requireBackoffice` (ADMIN or OPS, active-only) → `requirePermission` (capability-gated RBAC).

**OPS account creation**: Admin creates OPS accounts via the admin panel (same flow as guard creation but using `{phone}@ops.local` synthetic email). OPS agents must change their temporary password on first login.

---

## Guard Permissions (Hardcoded — not RBAC)

Guards don't go through the RBAC system. Their permissions are fixed based on `user_type === "GUARD"` and `status`:

| Guard Status | Can Submit Leads   | Can View Leads                           | Can Execute Visits  | Can View Earnings |
| ------------ | ------------------ | ---------------------------------------- | ------------------- | ----------------- |
| ACTIVE       | Yes (rate-limited) | Yes (own only)                           | Yes (assigned only) | Yes               |
| INACTIVE     | No                 | No (`requireGuard` enforces ACTIVE-only) | No                  | No                |
| BANNED       | Cannot login       | —                                        | —                   | —                 |

> **Note:** `requireGuard` (in `convex/auth.helpers.ts`) enforces `status === "ACTIVE"`. INACTIVE guards can still log in (they're not banned), but all guard-facing queries/mutations reject them. Admin can view an inactive guard's data via admin-gated queries.

### Visit Execution (ACTIVE Guards Only)

ACTIVE guards can manage visits assigned to them:

- **Confirm attendance**: Transition `ASSIGNED` → `CONFIRMED`
- **Start visit**: Transition `ASSIGNED` or `CONFIRMED` → `IN_PROGRESS`
- **Complete visit**: Transition `IN_PROGRESS` → `COMPLETED` (with outcome: `INTERESTED`, `NOT_INTERESTED`, `FOLLOWUP`)
- **View visits**: Can view only visits assigned to them (filtered by `assigned_guard_id`)

See [State Machines](04-state-machines.md) for valid visit status transitions.

### Lead Resubmission (ACTIVE Guards Only)

ACTIVE guards can edit and resubmit leads in `NEED_INFO` status:

- **Transition**: `NEED_INFO` → `SUBMITTED` (resubmit after providing missing info)
- **Editable fields**: `owner_name`, `owner_phone`, `availability_type`, `availability_date`, `rent_expected`, `furnishing`, `notes`
- **Ownership**: Can only edit their own leads (filtered by `submitted_by_guard_id`)

See [State Machines](04-state-machines.md) for valid `NEED_INFO` → `SUBMITTED` transition.

---

## Permission Check Pattern

```typescript
// In Convex mutation/query (convex/auth.helpers.ts):
export async function requirePermission(ctx: QueryCtx | MutationCtx, permission: string) {
  const user = await requireAuth(ctx);

  // Both ADMIN and OPS users go through RBAC — zero mutation duplication
  if (user.user_type !== "ADMIN" && user.user_type !== "OPS") {
    throw new Error("Admin or OPS access required");
  }

  const assignments = await ctx.db
    .query("user_role_assignments")
    .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  const roles = await Promise.all(assignments.map((a) => ctx.db.get(a.role_id)));
  const allPermissions = new Set(roles.flatMap((r) => r?.permissions ?? []));

  if (!allPermissions.has(permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }

  return user;
}
```

**Key design**: OPS agents share the same `requirePermission()` gate as ADMIN users. This means every existing admin mutation automatically works for OPS agents with the right role — no code duplication. OPS-specific portal routes use `requireOps()` for layout-level auth, then `requirePermission()` for individual action gates.

---

## Bootstrap Process

### Seed Function (`convex/seed.ts`)

Run once on first deployment:

```bash
npx convex run seed:init
```

**What it creates**:

1. **Super Admin role** (system role, cannot be deleted):
   - All permissions (every permission string listed above)
   - `is_system_role: true`

2. **Ops Agent role** (system role, cannot be deleted):
   - Permissions listed in the Ops Agent section above
   - `is_system_role: true`

3. **First super-admin user**:
   - Reads `SUPER_ADMIN_EMAIL` from Convex environment variables
   - Creates Convex user record: `{ user_type: "ADMIN", status: "ACTIVE", email: SUPER_ADMIN_EMAIL }`
   - Does NOT create a WorkOS user — admin's WorkOS account is auto-created on first Google SSO login
   - Assigns Super Admin role to this user

4. **Default system_config entries**:
   - `max_leads_per_guard_per_day`: `5`
   - `dedup_flat_window_days`: `90`
   - `dedup_phone_window_days`: `30`
   - All incentive thresholds (see `13-constants-reference.md`)
   - `demorentals_contact_phone`: `""`
   - `demorentals_whatsapp_phone`: `""`

**Idempotent**: Checks if roles table is empty before creating. Safe to run multiple times.

### Admin Account Creation (Post-Bootstrap)

1. Super admin logs in via Google SSO at `/admin/login`
2. On first SSO login: system auto-creates Convex user record for this `workos_user_id` (if not exists)
3. Super admin navigates to Roles management → creates additional admin accounts:
   - Enters new admin's Google email
   - Selects role(s) to assign
   - System creates Convex user record with `user_type: ADMIN`
   - New admin can now SSO via Google immediately (WorkOS handles SSO user creation automatically)
4. Super admin creates guard accounts via Guard Management (triggers Convex Action → WorkOS API)

---

## Phase 39: Tenant Trust and Reviews Permission Block

Reference: [Tenant Trust Score & Reviews](features/31-tenant-trust-score-reviews.md)

### Permission Keys

| Permission                                 | Description                              |
| ------------------------------------------ | ---------------------------------------- |
| `tenant_trust.view`                        | Tenant sees own trust score              |
| `tenant_trust.view_any`                    | Backoffice views any tenant trust score  |
| `tenant_trust.recalculate`                 | Trigger manual trust recomputation       |
| `tenant_trust.export_eligibility_snapshot` | Export immutable eligibility snapshots   |
| `reviews.submit`                           | Submit eligible review                   |
| `reviews.view`                             | View in-scope reviews                    |
| `reviews.view_any`                         | View any review for moderation/analytics |
| `reviews.moderate`                         | Moderate review status/visibility        |
| `reviews.respond`                          | Add/edit review response (admin only)    |
| `reviews.respond_owner`                    | Owner-scoped response capability         |

### Role Allocation

| Role        | Allocation                                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Super Admin | All P39 permissions                                                                                                                                                                          |
| Ops Agent   | No default P39 grants (OPS moderation is out of default role in P39)                                                                                                                         |
| Tenant      | `tenant_trust.view`, `reviews.submit`, `reviews.view`                                                                                                                                        |
| Owner       | `reviews.submit`, `reviews.view`, `reviews.respond_owner`                                                                                                                                    |
| Admin       | `tenant_trust.view_any`, `tenant_trust.recalculate`, `tenant_trust.export_eligibility_snapshot`, `reviews.submit`, `reviews.view`, `reviews.view_any`, `reviews.moderate`, `reviews.respond` |

---

## Phase 40: AI Intelligence Permission Block

Reference: [AI Intelligence Spine](features/32-ai-intelligence-spine.md)

### Permission Keys

| Permission          | Description                                |
| ------------------- | ------------------------------------------ |
| `ai.view`           | View AI scores and explainability payloads |
| `ai.recompute`      | Trigger manual recompute jobs              |
| `ai.override`       | Override AI outcomes with manual decisions |
| `ai.review_pending` | Review pending photo/fraud queue items     |
| `ai.configure`      | Modify `ai_*` system config keys           |

### Role Allocation

| Role        | Allocation                                     |
| ----------- | ---------------------------------------------- |
| Super Admin | All P40 permissions                            |
| Admin       | `ai.view`, `ai.recompute`, `ai.review_pending` |
| Ops Agent   | `ai.view`, `ai.recompute`, `ai.review_pending` |
| Guard       | No default P40 grants                          |
| Tenant      | No default P40 grants                          |

---

## Phase 41: Supply Channels Permission Block

Reference: [Supply Channel Diversification](features/33-supply-channel-diversification.md)

### Permission Keys

| Permission                  | Description                               |
| --------------------------- | ----------------------------------------- |
| `supply.sources.view`       | View source-channel intake and mapping    |
| `supply.sources.manage`     | Create/manage source intake               |
| `supply.collisions.view`    | View source collision cases               |
| `supply.collisions.resolve` | Resolve source collision outcomes         |
| `supply.brokers.manage`     | Manage broker registrations and lifecycle |
| `supply.brokers.suspend`    | Suspend broker entries                    |
| `supply.corporate.manage`   | Manage corporate accounts and relocations |
| `supply.secretary.manage`   | Manage secretary intake                   |
| `supply.resident.manage`    | Manage resident referral intake           |

### Role Allocation

| Role        | Allocation                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Super Admin | All P41 permissions                                                                                                                                                                                                                      |
| Ops Agent   | `supply.sources.view`, `supply.sources.manage`, `supply.collisions.view`, `supply.collisions.resolve`, `supply.brokers.manage`, `supply.brokers.suspend`, `supply.corporate.manage`, `supply.secretary.manage`, `supply.resident.manage` |
| Broker      | Submit leads only (persona-scoped channel intake, no backoffice RBAC grants)                                                                                                                                                             |

---

## Phase 42: Financial Products Permission Block

Reference: [Financial Products & Insurance](features/34-financial-products-insurance.md)

### Permission Keys

| Permission                    | Description                          |
| ----------------------------- | ------------------------------------ |
| `financial.policies.view`     | View financial policy rows           |
| `financial.policies.issue`    | Issue policy/quote                   |
| `financial.policies.cancel`   | Cancel policy                        |
| `financial.claims.view`       | View claim queue                     |
| `financial.claims.adjudicate` | Adjudicate claims                    |
| `financial.loans.view`        | View loan lifecycle                  |
| `financial.loans.sync`        | Sync partner callback and status     |
| `financial.credit.view`       | View credit reporting rows           |
| `financial.credit.submit`     | Submit/correct credit reports        |
| `financial.ledger.view`       | View financial ledger                |
| `financial.reconcile`         | Reconcile ledger/partner mismatches  |
| `financial.audit_export`      | Export regulatory audit bundles      |
| `financial.configure`         | Configure financial product controls |

### Role Allocation

| Role        | Allocation                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Super Admin | All P42 permissions (including `financial.reconcile` and `financial.audit_export`)                                                                                                         |
| Finance     | `financial.policies.view`, `financial.policies.issue`, `financial.policies.cancel`, `financial.claims.view`, `financial.claims.adjudicate`, `financial.ledger.view`, `financial.reconcile` |
| Ops Agent   | View-only (`financial.policies.view`, `financial.claims.view`, `financial.loans.view`, `financial.credit.view`, `financial.ledger.view`)                                                   |

---

## Phase 43: Tenant Portal Auth Model Note

Tenant portal endpoints and route guards are scoped by `requireTenant(ctx)` identity checks and tenant-owned data filters. They do not use backoffice RBAC (`requirePermission`, `requireBackoffice`) because tenant actions are persona-scoped, not role-assigned admin capabilities.

---

## Phase 44: Field-Worker Treatment Update

Reference: [OPS Superset Expansion](features/35-ops-superset-expansion.md)

- Guard permissions remain hardcoded for `user_type === "GUARD"`.
- OPS users in field-worker mode use `requireFieldWorker()` / `requireFieldWorkerAuth()` and feature-gate checks (`ops_field_worker_enabled`, `ops_field_worker_canary_user_ids`).
- Backoffice OPS permissions continue through RBAC (`requirePermission`) for `/admin/*` and `/ops/*` surfaces.

---

## Phase 46: CEO Ops Command Center

Reference: [CEO Ops Command Center](features/37-ceo-ops-command-center.md)

| Permission                      | Description                           |
| ------------------------------- | ------------------------------------- |
| `ops_management.view`           | View ops command center and team data |
| `ops_management.set_targets`    | Set and modify KPI targets for agents |
| `ops_management.issue_warnings` | Issue and manage warnings             |
| `ops_management.write_checkins` | Write check-in notes and action items |
| `ops_management.configure`      | Configure command center settings     |
