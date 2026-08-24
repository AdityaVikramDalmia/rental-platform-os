# Feature: Post-Move-In Lifecycle (Resident Hub)

> **Priority**: #37 in implementation order
> **Personas**: Tenant, Owner, Admin
> **Dependencies**: P08 (Closures - closure confirmation triggers resident profile activation), P34 (Transaction Rails - preferred activation trigger), P35 (Notifications)
> **Route Groups**: `(tenant)/`, `(admin)/`

## Purpose

Post-Move-In Lifecycle extends Rental Platform OS beyond transaction closure into resident retention. It introduces a Resident Hub where tenants and owners track rent records, maintenance workflows, lease renewals, move-out operations, and referral opportunities after occupancy starts.

This phase does **not** process rent payments. It tracks lifecycle state, reminders, and compliance artifacts. Rent receipts are generated from existing rent records via query contract (no separate receipt table).

## Entities Involved

- `resident_profiles` table (active occupancy identity for tenant-property relationship)
- `rent_records` table (monthly rent lifecycle and payment evidence)
- `maintenance_tickets` table (issue lifecycle and SLA tracking)
- `lease_renewals` table (pre-expiry renewal workflow)
- Query-only receipt contract: `rentRecords.generateReceipt({ rent_record_id })`
- Existing integrations: `listings`, `owners`, `users`, `closures`, `checklist_templates`, `checklist_instances`, `referrals`

## Flows

### Flow 1: Move-In Activation -> Resident Hub Enrollment

```text
1. Closure is confirmed and move-in contract is eligible for activation
2. System creates resident_profiles row with status PENDING_ACTIVATION
3. Activation hook transitions resident profile to ACTIVE and stamps activated_at
4. Tenant gains access to /tenant/home Resident Hub widgets
5. Initial rent cycle and lease timeline are initialized
6. Notification sent: MOVE_IN_REMINDER / welcome sequence
```

### Flow 2: Monthly Rent Tracking Lifecycle

```text
1. Three days before due date, reminder is sent to tenant
2. Tenant pays rent externally (UPI/bank/cash outside platform)
3. Backoffice records payment updates in rent_records (amount_paid_paise, mode, reference)
4. rent_records status follows canonical lifecycle:
   UPCOMING -> DUE -> PAID
   DUE -> PARTIALLY_PAID -> PAID
   DUE -> OVERDUE -> PAID
   DUE/OVERDUE -> WAIVED
```

### Flow 3: Rent Receipt Generation (Query-Only)

```text
1. Payment information exists in rent_records for a period
2. Client requests receipt data from rentRecords.generateReceipt({ rent_record_id })
3. System computes immutable receipt payload from canonical records (tenant, owner, property, period, amount)
4. Optional PDF rendering happens client-side or via a separate action
5. Receipt payload is available for HRA/tax records without creating a separate receipt table row
```

### Flow 4: Maintenance Ticket Lifecycle

```text
1. Tenant raises issue in Resident Hub (category, severity, photos)
2. Ticket routes to linked owner visibility stream and backoffice action queue
3. Ticket lifecycle follows canonical statuses:
   OPEN -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED
   OPEN -> CANCELLED
   ASSIGNED -> CANCELLED
4. SLA breach marks ticket escalated while preserving lifecycle status
```

Escalation is tracked via the `escalated` boolean flag on maintenance_tickets, not as a separate status. Tickets follow the normal OPEN->ASSIGNED->IN_PROGRESS->RESOLVED->CLOSED lifecycle regardless of escalation.

### Flow 5: Lease Renewal and Move-Out

```text
1. At 60 days before lease_end, system auto-creates lease_renewals row in INITIATED
2. Owner/tenant responses progress through:
   INITIATED -> OWNER_RESPONDED -> TENANT_RESPONDED -> NEGOTIATING -> AGREED -> RENEWED
3. Move-out branch can be taken from INITIATED, OWNER_RESPONDED, TENANT_RESPONDED, or NEGOTIATING:
    INITIATED/OWNER_RESPONDED/TENANT_RESPONDED/NEGOTIATING -> MOVE_OUT_REQUESTED -> MOVE_OUT_CONFIRMED
4. If no response in renewal window:
   INITIATED -> EXPIRED
5. Move-out captures condition evidence + deposit settlement tracking
6. Owner can trigger auto re-list flow on vacancy
```

### Flow 6: Tenant-to-Tenant Referral After Move-In

```text
1. Resident sees "Know someone looking in your society?"
2. Tenant shares referral link/code
3. Referral events reuse P22 referral rails and milestone logic
4. Rewards post to referral ledger based on configured milestones
```

## User Stories

### Tenant: Single Home Dashboard for Ongoing Living

**As a tenant**, I want one dashboard for rent, maintenance, and lease timeline, so I can manage my stay without switching channels.

**Acceptance Criteria**:

- `/tenant/home` shows property details, current rent cycle, and lease milestones
- Rent reminders appear at configured windows
- Maintenance ticket status is visible end-to-end

### Tenant: Generate Rent Receipts for Tax/HRA

**As a tenant**, I want downloadable rent receipts with owner and property details, so I can submit tax/HRA documents.

**Acceptance Criteria**:

- Receipt generation is query-based (`rentRecords.generateReceipt`) and uses canonical rent record fields
- Receipt payload includes tenant name, owner name, property address, rent month, amount, and timestamp
- Receipt contract is deterministic and side-effect free

### Owner: Track Maintenance and Participate in Renewal

**As an owner**, I want clear visibility into maintenance issues and lease renewals, so I can respond quickly and keep trust high.

**Acceptance Criteria**:

- Owner can participate in renewal responses and negotiation flow
- Owner can monitor maintenance progress while backoffice applies lifecycle transitions
- SLA breach indicators are visible to owner and admin

### Admin: Escalate Exceptions and Maintain Lifecycle Health

**As an admin**, I want visibility into overdue maintenance and renewal drop-offs, so unresolved resident issues do not stall.

**Acceptance Criteria**:

- Escalation queue highlights `maintenance_tickets.escalated = true`
- Renewal funnel metrics and pending actions are visible
- Audit trail for lifecycle mutations is preserved

---

## Convex Functions

### Queries

```ts
residentProfiles.getTenantHome({ tenant_user_id })
  => {
    resident_profile,
    current_rent_record,
    lease_timeline,
    open_maintenance_tickets,
    owner_contacts,
  }

residentProfiles.getByTenant({ tenant_user_id })
  => ResidentProfile[]

residentProfiles.getByOwner({ owner_id, paginationOpts })
  => { page, isDone, continueCursor }

rentRecords.listByResident({ resident_id, year? })
  => RentRecord[]

rentRecords.generateReceipt({ rent_record_id })
  => ReceiptContract

maintenanceTickets.listByResident({ resident_id, status?, paginationOpts })
  => { page, isDone, continueCursor }

maintenanceTickets.adminList({ status?, severity?, escalated?, assignee?, paginationOpts })
  => { page, isDone, continueCursor }

leaseRenewals.getCurrent({ resident_id })
  => LeaseRenewal | null
```

### Mutations

```ts
residentProfiles.activate({ closure_id })
  => ResidentProfile

rentRecords.recordPayment({ rent_record_id, amount_paid_paise, paid_at, payment_mode?, payment_reference? })
  => RentRecord

maintenanceTickets.create({ resident_id, category, severity, title, description, photo_ids? })
  => MaintenanceTicket

maintenanceTickets.assign({ ticket_id, assigned_to })
  => MaintenanceTicket

maintenanceTickets.updateStatus({ ticket_id, status, resolution_notes? })
  => MaintenanceTicket

leaseRenewals.initiate({ resident_id, initiated_by })
  => LeaseRenewal

leaseRenewals.respondToRenewal({ lease_renewal_id, owner_response?, tenant_response?, proposed_rent_paise?, notes? })
  => LeaseRenewal

leaseRenewals.requestMoveOut({ lease_renewal_id, requested_move_out_at })
  => LeaseRenewal

leaseRenewals.approveSettlement({ resident_id, settlement_status, notes? })
  => ResidentProfile
```

### Internal Functions

```ts
internal.residentProfiles.sendRentReminders({ now })
  => { sent_count: number }

internal.residentProfiles.checkSLAs({ now })
  => { overdue_count: number; escalated_count: number }

internal.leaseRenewals.checkExpiringLeases({ now })
  => { created_count: number; notice_count: number }

internal.maintenanceTickets.escalateSLA({ now })
  => { escalated_count: number }
```

### Rent Receipt Contract

```typescript
rentRecords.generateReceipt({ rent_record_id: Id<"rent_records"> })
  => {
    receipt_number: string;        // Format: "RR-{YYYYMM}-{sequence}"
    tenant_name: string;
    owner_name: string;
    property_address: string;
    period_label: string;          // "February 2026"
    amount_paise: number;
    payment_mode: RentPaymentMode;
    payment_reference: string | null;
    paid_at: number;               // Unix ms
    generated_at: number;          // Unix ms
  }
```

Receipt generation is a query (read-only) that computes receipt data from existing records. PDF rendering (if needed) happens client-side or via a dedicated action.

### Move-Out Settlement Contract

```typescript
type MoveOutSettlement = {
  resident_id: Id<"resident_profiles">;
  deposit_paid_paise: number;
  deductions: Array<{
    reason: string;           // "Unpaid rent", "Damage repair", "Cleaning fee"
    amount_paise: number;
    evidence_note: string | null;
  }>;
  total_deductions_paise: number;
  refund_amount_paise: number;    // deposit_paid_paise - total_deductions_paise
  settlement_status: "PENDING" | "APPROVED" | "DISPUTED" | "SETTLED";
  approved_by: Id<"users"> | null;
  settled_at: number | null;
};

leaseRenewals.computeSettlement({ resident_id: Id<"resident_profiles"> })
  => MoveOutSettlement
```

Settlement computation is deterministic: `refund_amount_paise = deposit_paid_paise - total_deductions_paise`. Refund can be zero but never negative (cap at 0).

---

## Schema (Proposed)

### `resident_profiles` Table

| Field                         | Type           | Required | Description                                                                                      |
| ----------------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `tenant_user_id`              | Id<"users">    | yes      | Resident tenant                                                                                  |
| `owner_id`                    | Id<"owners">   | no       | Linked canonical owner identity (P31)                                                            |
| `owner_user_id`               | Id<"users">    | no       | Optional denormalized owner user id                                                              |
| `listing_id`                  | Id<"listings"> | yes      | Occupied property                                                                                |
| `closure_id`                  | Id<"closures"> | yes      | Source closure                                                                                   |
| `status`                      | string         | yes      | `PENDING_ACTIVATION`, `ACTIVE`, `RENEWAL_PENDING`, `MOVE_OUT_REQUESTED`, `MOVED_OUT`, `ARCHIVED` |
| `lease_start`                 | number         | yes      | Unix ms                                                                                          |
| `lease_end`                   | number         | yes      | Unix ms                                                                                          |
| `monthly_rent_paise`          | number         | yes      | Monthly rent in paise                                                                            |
| `security_deposit_paise`      | number         | yes      | Deposit amount in paise                                                                          |
| `activated_at`                | number         | no       | Unix ms                                                                                          |
| `moved_out_at`                | number         | no       | Unix ms                                                                                          |
| `assigned_backoffice_user_id` | Id<"users">    | no       | Assigned admin/OPS owner                                                                         |
| `move_out_settlement`         | object         | no       | Settlement breakdown object (deductions, refund)                                                 |
| `negotiation_log`             | array          | no       | Lease renewal negotiation history timeline                                                       |

**Indexes**: `by_tenant_user_id`, `by_listing_id`, `by_owner_id`, `by_status`, `by_closure_id`

### `rent_records` Table

| Field               | Type                    | Required | Description                                                      |
| ------------------- | ----------------------- | -------- | ---------------------------------------------------------------- |
| `resident_id`       | Id<"resident_profiles"> | yes      | Parent occupancy                                                 |
| `period_start`      | number                  | yes      | Unix ms                                                          |
| `period_end`        | number                  | yes      | Unix ms                                                          |
| `amount_due_paise`  | number                  | yes      | Due amount in paise                                              |
| `amount_paid_paise` | number                  | yes      | Paid amount in paise                                             |
| `status`            | string                  | yes      | `UPCOMING`, `DUE`, `PAID`, `OVERDUE`, `PARTIALLY_PAID`, `WAIVED` |
| `payment_mode`      | string                  | no       | `UPI`, `BANK_TRANSFER`, `CASH`, `CHEQUE`, `AUTO_DEBIT`           |
| `payment_reference` | string                  | no       | Payment reference                                                |
| `paid_at`           | number                  | no       | Unix ms                                                          |
| `due_date`          | number                  | yes      | Unix ms                                                          |
| `receipt_number`    | string                  | no       | Format: `RR-{YYYYMM}-{sequence}`                                 |

**Indexes**: `by_resident_id`, `by_status`, `by_due_date`

### `maintenance_tickets` Table

| Field              | Type                    | Required | Description                                                                                            |
| ------------------ | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `resident_id`      | Id<"resident_profiles"> | yes      | Tenant-property relationship                                                                           |
| `listing_id`       | Id<"listings">          | yes      | Linked property                                                                                        |
| `reporter_user_id` | Id<"users">             | yes      | Ticket creator                                                                                         |
| `category`         | string                  | yes      | `PLUMBING`, `ELECTRICAL`, `CARPENTRY`, `PAINTING`, `APPLIANCE`, `PEST_CONTROL`, `COMMON_AREA`, `OTHER` |
| `severity`         | string                  | yes      | `LOW`, `MEDIUM`, `HIGH`, `URGENT`                                                                      |
| `title`            | string                  | yes      | Short issue title                                                                                      |
| `description`      | string                  | yes      | Issue details                                                                                          |
| `photo_ids`        | array                   | no       | Evidence photos                                                                                        |
| `status`           | string                  | yes      | `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `CANCELLED`                                   |
| `assigned_to`      | Id<"users">             | no       | Assignee                                                                                               |
| `resolution_notes` | string                  | no       | Resolution description                                                                                 |
| `resolved_at`      | number                  | no       | Unix ms                                                                                                |
| `sla_deadline`     | number                  | no       | Unix ms                                                                                                |
| `escalated`        | boolean                 | no       | Escalation flag (not a status)                                                                         |

**Indexes**: `by_resident_id`, `by_listing_id`, `by_status`, `by_assigned_to`, `by_sla_deadline`

### `lease_renewals` Table

| Field                 | Type                    | Required | Description                                                                                                                                   |
| --------------------- | ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `resident_id`         | Id<"resident_profiles"> | yes      | Parent occupancy                                                                                                                              |
| `current_lease_end`   | number                  | yes      | Unix ms                                                                                                                                       |
| `proposed_new_end`    | number                  | no       | Unix ms                                                                                                                                       |
| `proposed_rent_paise` | number                  | no       | Proposed rent                                                                                                                                 |
| `status`              | string                  | yes      | `INITIATED`, `OWNER_RESPONDED`, `TENANT_RESPONDED`, `NEGOTIATING`, `AGREED`, `RENEWED`, `MOVE_OUT_REQUESTED`, `MOVE_OUT_CONFIRMED`, `EXPIRED` |
| `initiated_by`        | string                  | yes      | `SYSTEM`, `OWNER`, `TENANT`                                                                                                                   |
| `owner_response`      | string                  | no       | `RENEW_SAME_TERMS`, `RENEW_NEW_TERMS`, `TERMINATE`                                                                                            |
| `tenant_response`     | string                  | no       | `ACCEPT`, `COUNTER`, `MOVE_OUT`                                                                                                               |
| `negotiation_log`     | array                   | no       | Negotiation history entries                                                                                                                   |

**Indexes**: `by_resident_id`, `by_status`, `by_current_lease_end`

---

## Cross-Phase Contract Decisions (Locked)

### P37 x P34 (Transaction Completion Rails)

- Resident activation is triggered by `rental_transactions.status` reaching `COMPLETED`.
- Legacy fallback: if no `rental_transactions` link exists (pre-P34 closures), activation falls back to `closures.status = "CONFIRMED"`.
- Activation path follows canonical resident lifecycle (`PENDING_ACTIVATION -> ACTIVE`).

### P37 x P31 (Owner Entity)

- `resident_profiles.owner_id` references `owners._id` (P31 canonical owner identity).
- `resident_profiles.owner_user_id` is an optional denormalized field for quick user lookup.
- Owner linkage is resolved from `closures.owner_id` -> `owners._id` at activation time.

### P37 x P38 (Owner Portal)

- P38 owner portal reads `resident_profiles` and `maintenance_tickets` via owner-scoped queries.
- P37 must expose owner-scoped read contracts that P38 consumes.
- P37 does not own owner portal UI.

### P37 x P22 (Referrals)

- Post-move-in referral milestone tracking remains in `referral_milestones` (P22).
- P37 resident activation can trigger a referral milestone check via `internal.referrals.checkPostMoveInMilestone`.

### P37 x P35 (Notifications)

- P37 emits notification events using P35's `internal.notifications.emitEvent` API.
- Events emitted: `MAINTENANCE_UPDATE`, `MOVE_IN_REMINDER`, `LEASE_RENEWAL_NOTICE`, `RENT_DUE_REMINDER`.
- P37 does not implement notification delivery.

### Notification Category Extensions (P37 → P35)

P37 extends the P35 `NotificationCategory` enum with:

- `LEASE_RENEWAL_NOTICE` — lease expiry approaching, renewal initiated
- `RENT_DUE_REMINDER` — upcoming/overdue rent payment

These categories must be added to `lib/constants.ts` alongside the P35 base categories.

## Access Control & Configuration (Phase 37)

### Permissions

| Permission                | Description                               |
| ------------------------- | ----------------------------------------- |
| `residents.view`          | View resident profiles                    |
| `residents.manage`        | Manage resident lifecycle                 |
| `rent_records.manage`     | Record and update rent payments           |
| `maintenance.create`      | Submit maintenance requests               |
| `maintenance.manage`      | Assign, update, resolve maintenance       |
| `maintenance.view_all`    | View all maintenance requests (admin/ops) |
| `lease_renewals.initiate` | Initiate lease renewal negotiation        |
| `lease_renewals.manage`   | Manage renewal terms and approval         |
| `move_out.manage`         | Manage move-out process and settlement    |

### System Config Keys

| Key                            | Type   | Description                              |
| ------------------------------ | ------ | ---------------------------------------- |
| `rent_reminder_days_before`    | number | Days before due date to send reminder    |
| `rent_overdue_grace_days`      | number | Grace period days before marking overdue |
| `maintenance_sla_low_hours`    | number | SLA hours for LOW priority               |
| `maintenance_sla_medium_hours` | number | SLA hours for MEDIUM priority            |
| `maintenance_sla_high_hours`   | number | SLA hours for HIGH priority              |
| `maintenance_sla_urgent_hours` | number | SLA hours for URGENT priority            |
| `lease_renewal_notice_days`    | number | Days before expiry to start renewal flow |

---

## Business Rules

1. **Resident activation trigger**: `resident_profiles` activation is driven by P34 completion with P08 closure fallback.
2. **No payment processing**: Rent records track lifecycle and evidence only; platform does not execute fund transfer.
3. **Reminder cadence**: Reminders and overdue checks are cron-driven and configurable via `rent_reminder_days_before`, `rent_overdue_grace_days`, `maintenance_sla_low_hours`, `maintenance_sla_medium_hours`, `maintenance_sla_high_hours`, `maintenance_sla_urgent_hours`, `lease_renewal_notice_days`.
4. **Receipt contract**: Use query-only `rentRecords.generateReceipt`; do not persist a separate receipt table.
5. **Maintenance escalation model**: Escalation is tracked through `maintenance_tickets.escalated`; never via an `ESCALATED` status.
6. **Renewal auto-trigger**: Renewal workflow starts at notice window and follows canonical P37 state machine transitions.
7. **Move-out lifecycle**: Resident status transitions are `ACTIVE/RENEWAL_PENDING -> MOVE_OUT_REQUESTED -> MOVED_OUT -> ARCHIVED`.
8. **Move-out settlement window**: Security deposit settlement target remains within 15 days after move-out completion.
9. **Checklist integration**: Move-out workflow uses existing P30 checklist engine for evidence and completion scoring.
10. **Referral reuse**: Tenant-to-tenant referral in Resident Hub reuses existing P22 referral rails.
11. **Money/date conventions**: Amount fields are paise integers; all timestamps are Unix milliseconds.

---

## Edge Cases

- **Move-out requested during renewal**: `lease_renewals` can transition from `INITIATED`, `OWNER_RESPONDED`, `TENANT_RESPONDED`, or `NEGOTIATING` to `MOVE_OUT_REQUESTED`.
- **Lease renewal inactivity**: `INITIATED -> EXPIRED` when notice window closes without required response.
- **SLA breach**: Ticket remains in lifecycle status while `escalated = true` flags admin action.
- **Cancellation before resolution**: Only canonical cancellation paths are allowed (`OPEN -> CANCELLED`, `ASSIGNED -> CANCELLED`).
- **Overdue partial payments**: `OVERDUE -> PARTIALLY_PAID -> PAID` is valid; waiver path remains `OVERDUE -> WAIVED`.
- **Multiple occupancies for same listing**: New move-in creates a new `resident_profiles` row; previous lifecycle history remains immutable.
