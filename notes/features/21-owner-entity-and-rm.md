# Feature: Owner Entity & RM Foundation

> **Priority**: Foundational phase before Owner Services (P20)
> **Personas**: Property Owner, Guard (as RM), Ops Agent, Super Admin
> **Dependencies**: Lead Pipeline (P04), Owner Verification (P05), Listings (P06), Closure & Payouts (P08-P09)
> **Route Groups**: `(admin)/`, `(public)/`, `(owner)/` (future)

## Purpose

Rental Platform OS currently treats owner identity as inline fields on lead records (`owner_phone`, `owner_name`). That works for initial lead intake, but it breaks down once owner interactions spread across multiple products (owner services, referrals, deal room, negotiation, post-deal retention).

This feature introduces a unified `owners` entity and relationship-manager (RM) foundation so every owner touchpoint maps to one canonical profile and one management lifecycle.

---

## Section 1: Owner Entity

### Problem Statement

Today, owner data is fragmented:

1. **Lead path**: owner exists as phone/name on `leads`.
2. **Owner services path**: owner exists as a separate request lifecycle.
3. **No unified identity**: no canonical owner record spanning leads, listings, closures, and support.
4. **No lifecycle**: no owner-level stage progression after first deal.
5. **No RM linkage**: no persistent owner-to-guard relationship after closure.

This blocks 6+ downstream phases that assume owner identity and ownership history are first-class.

### Solution

Create a unified `owners` table keyed by normalized 10-digit phone, with progressive profile enrichment and explicit lifecycle tracking.

### Proposed Schema: `owners`

```typescript
owners: defineTable({
  // Primary identifier
  phone: v.string(), // 10 digits, normalized, UNIQUE across system

  // Progressive profiling (added over time)
  name: v.optional(v.string()), // From guard lead, or self-provided
  email: v.optional(v.string()), // From owner service request, deal room invite

  // Auth linking (null until owner authenticates)
  user_id: v.optional(v.id("users")), // Linked when WorkOS account created

  // Tracking
  source: v.union(
    v.literal("GUARD_LEAD"), // First seen via guard lead submission
    v.literal("OWNER_SERVICE_REQUEST"), // First seen via contact form
    v.literal("OPS_CREATED"), // Manually created by ops
  ),
  first_lead_id: v.optional(v.id("leads")), // First lead this owner appeared on

  // Properties (denormalized count for quick access)
  active_properties_count: v.number(), // How many active listings this owner has
  total_leads_count: v.number(), // Total leads across all properties
  total_closures_count: v.number(), // Total closed deals

  // RM assignment (denormalized from owner_rm_assignments for quick access)
  current_rm_id: v.optional(v.id("users")), // Current relationship manager (guard's user_id)
  current_rm_guard_id: v.optional(v.id("guard_profiles")), // Current RM's guard profile

  // Lifecycle
  lifecycle_stage: v.union(
    v.literal("PROSPECT"), // Phone captured from lead, not yet verified
    v.literal("VERIFIED"), // At least one lead verified
    v.literal("ACTIVE"), // Has active listing(s) / deal(s)
    v.literal("MANAGED"), // Under RM management (post-closure)
    v.literal("DORMANT"), // No activity for 90+ days
    v.literal("CHURNED"), // Explicitly left / no re-listing
  ),
  lifecycle_updated_at: v.number(),

  // Merge tracking
  merged_into_id: v.optional(v.id("owners")), // If merged into another owner record

  // Standard fields
  first_seen_at: v.number(),
  last_activity_at: v.number(),
  is_deleted: v.boolean(),
  created_at: v.number(),
  updated_at: v.number(),
})
  .index("by_phone", ["phone"])
  .index("by_email", ["email"])
  .index("by_user_id", ["user_id"])
  .index("by_lifecycle", ["lifecycle_stage"])
  .index("by_current_rm", ["current_rm_guard_id"])
  .index("by_source", ["source"]);
```

### Identity Resolution Rules

1. **On guard lead submission**:
   - Normalize phone to 10 digits.
   - Query `owners.by_phone`.
   - If owner exists, link lead to existing owner.
   - If not, create owner with `source = GUARD_LEAD` and `lifecycle_stage = PROSPECT`.

2. **On owner service request submission**:
   - Normalize phone and check `owners.by_phone` first.
   - If owner exists, enrich profile (email/name if missing) and link request.
   - If not, create owner with `source = OWNER_SERVICE_REQUEST`.

3. **On owner WorkOS authentication (Google SSO)**:
   - Attempt match by email first.
   - Fallback to phone match if email not found but phone available.
   - Link `users._id` to `owners.user_id`.

4. **On admin merge action**:
   - Select source owner and target owner.
   - Re-link all downstream records (leads, verifications, listings, closures, RM assignments, check-ins) to target.
   - Mark source owner with `merged_into_id` and `is_deleted = true`.

### Owner Lifecycle Stage Transitions

```
PROSPECT -> VERIFIED -> ACTIVE -> MANAGED -> DORMANT
                    ^                       |
                    |-----------------------|

Any stage -> CHURNED (admin explicit)
```

| From       | To         | Trigger                                                   | Who          |
| ---------- | ---------- | --------------------------------------------------------- | ------------ |
| `PROSPECT` | `VERIFIED` | First linked lead reaches `VERIFIED`                      | System/Admin |
| `VERIFIED` | `ACTIVE`   | First listing published OR first closure created          | System       |
| `ACTIVE`   | `MANAGED`  | Closure confirmed and RM assignment created               | System       |
| `MANAGED`  | `DORMANT`  | No owner activity for 90 days                             | Cron/System  |
| `DORMANT`  | `ACTIVE`   | New lead/listing/closure activity                         | System       |
| Any        | `CHURNED`  | Admin marks owner as churned (explicit business decision) | Admin        |

**Terminal guidance**: `CHURNED` is operationally terminal until explicit admin reactivation policy is introduced.

### Migration Plan

One-time migration is required before this phase can be considered complete:

1. Scan all existing `leads` records with `owner_phone`.
2. Normalize each phone and upsert corresponding `owners` record.
3. Backfill `leads.owner_id` to point at canonical owner.
4. Initialize owner counters (`total_leads_count`, `total_closures_count`, `active_properties_count`) from current data.
5. Log migration summary (records processed, owners created, links backfilled, conflicts).

---

## Section 2: Relationship Manager (RM) System

### Overview

After a deal is confirmed, owner retention becomes a recurring operations workflow. The RM system assigns ownership continuity to a guard and tracks check-ins, SLA health, escalation, and reassignment.

### Proposed Schema: `owner_rm_assignments`

```typescript
owner_rm_assignments: defineTable({
  owner_id: v.id("owners"),
  rm_guard_id: v.id("guard_profiles"), // The guard acting as RM
  rm_user_id: v.id("users"), // The guard's user record

  // Assignment context
  source_closure_id: v.optional(v.id("closures")), // Deal that triggered assignment
  assigned_by: v.union(
    v.literal("SYSTEM"), // Auto-assigned on closure
    v.literal("ADMIN"), // Manually assigned by admin
  ),
  assigned_by_admin_id: v.optional(v.id("users")),

  // Status machine
  status: v.union(
    v.literal("ACTIVE"),
    v.literal("WARNING"),
    v.literal("ESCALATED"),
    v.literal("REASSIGNED"), // Terminal - new assignment created
    v.literal("ENDED"), // Terminal - owner churned or guard left
  ),

  // Check-in tracking
  last_check_in_at: v.optional(v.number()),
  next_check_in_due: v.optional(v.number()),
  check_in_frequency_days: v.number(), // Default 30
  missed_check_ins_count: v.number(),

  // Performance (updated periodically)
  performance_score: v.optional(v.number()), // 0-100

  // SLA tracking
  sla_breach_count: v.number(),
  last_sla_breach_at: v.optional(v.number()),
  escalation_level: v.number(), // 0=none, 1=warning, 2=escalated

  // Reassignment tracking (filled when status -> REASSIGNED)
  reassigned_at: v.optional(v.number()),
  reassigned_to_guard_id: v.optional(v.id("guard_profiles")),
  reassignment_reason: v.optional(v.string()),

  // Standard
  created_at: v.number(),
  updated_at: v.number(),
})
  .index("by_owner", ["owner_id", "status"])
  .index("by_rm", ["rm_guard_id", "status"])
  .index("by_status", ["status"])
  .index("by_next_check_in", ["next_check_in_due"]);
```

### Proposed Schema: `rm_check_ins`

```typescript
rm_check_ins: defineTable({
  assignment_id: v.id("owner_rm_assignments"),
  owner_id: v.id("owners"),
  rm_guard_id: v.id("guard_profiles"),

  check_in_type: v.union(
    v.literal("SCHEDULED"), // Regular periodic
    v.literal("ISSUE"), // Owner reported issue
    v.literal("RE_LISTING"), // Tenant vacated, re-engage
    v.literal("OWNER_INITIATED"), // Owner contacted RM
    v.literal("AD_HOC"), // Proactive outreach
  ),

  method: v.union(
    v.literal("CALL"),
    v.literal("WHATSAPP"),
    v.literal("IN_PERSON"),
    v.literal("OTHER"),
  ),

  summary: v.string(),
  outcome: v.union(v.literal("RESOLVED"), v.literal("PENDING"), v.literal("ESCALATED")),

  owner_satisfaction: v.optional(v.number()), // 1-5 rating (optional)

  created_at: v.number(),
})
  .index("by_assignment", ["assignment_id"])
  .index("by_owner", ["owner_id"])
  .index("by_rm", ["rm_guard_id"]);
```

### RM Assignment Status Machine

```
ACTIVE -> WARNING -> ESCALATED
   |         |           |
   |         |           -> REASSIGNED (terminal)
   |         |           -> ENDED (terminal)
   |         -> REASSIGNED (terminal)
   |         -> ACTIVE
   -> ESCALATED
   -> REASSIGNED (terminal)
   -> ENDED (terminal)

ESCALATED -> ACTIVE
```

#### Transition Table

| From        | To           | Trigger                                                                       | Who          |
| ----------- | ------------ | ----------------------------------------------------------------------------- | ------------ |
| `ACTIVE`    | `WARNING`    | `missed_check_ins_count >= 2` OR `performance_score < 60`                     | System/Cron  |
| `ACTIVE`    | `ESCALATED`  | Owner complaint captured by admin                                             | Admin/System |
| `ACTIVE`    | `REASSIGNED` | Admin manually reassigns to another guard                                     | Admin        |
| `ACTIVE`    | `ENDED`      | Owner churned OR RM guard deactivated/banned                                  | Admin/System |
| `WARNING`   | `ACTIVE`     | Check-in completed and performance recovered                                  | System/Admin |
| `WARNING`   | `ESCALATED`  | Continued decline (`missed_check_ins_count >= 3` OR `performance_score < 40`) | System/Cron  |
| `WARNING`   | `REASSIGNED` | Admin reassigns                                                               | Admin        |
| `ESCALATED` | `ACTIVE`     | Admin resolves escalation and RM performance recovers                         | Admin        |
| `ESCALATED` | `REASSIGNED` | Admin reassigns (default remediation)                                         | Admin        |
| `ESCALATED` | `ENDED`      | Owner churned                                                                 | Admin        |

**Terminal states**: `REASSIGNED`, `ENDED`.

### Auto-Assignment Trigger

When a closure transitions to `CONFIRMED`, the system auto-creates an RM assignment:

1. Resolve owner from closure/lead linkage.
2. Resolve original lead submitter from `leads.submitted_by_guard_id`.
3. Create `owner_rm_assignments` record with:
   - `rm_guard_id` = submitter's guard profile
   - `rm_user_id` = submitter's user record
   - `source_closure_id` = confirmed closure
   - `status` = `ACTIVE`
   - `check_in_frequency_days` = `30` (from system config default)
   - `next_check_in_due` = `confirmed_at + 30 days` (Unix ms)

### Reassignment Workflow

1. Admin initiates reassignment and selects target guard.
2. Current assignment transitions to `REASSIGNED` with reason and reassignment metadata.
3. New assignment is created in `ACTIVE` state for the target guard.
4. Owner profile denormalized fields (`current_rm_id`, `current_rm_guard_id`) are updated.
5. Notification fan-out to old RM, new RM, and owner is reserved for a later phase.

---

## Section 3: Schema Modifications to Existing Tables

### Required Additions

1. **`leads` table**:
   - Add `owner_id: v.optional(v.id("owners"))`
   - Add index `by_owner_id`
   - Keep `owner_phone` and `owner_name` as denormalized compatibility fields during migration.

2. **`listings` table**:
   - Add `owner_id: v.optional(v.id("owners"))`
   - Add index `by_owner_id`

3. **`closures` table**:
   - Add `owner_id: v.optional(v.id("owners"))`
   - Add index `by_owner_id`

4. **`users` table / user type enums**:
   - Ensure `OWNER` exists in `USER_TYPE` and schema validators (if not already present from P19-E01).
   - If missing, include in this phase's Tier 1 implementation.

5. **`lib/constants.ts` additions**:
   - `OWNER_LIFECYCLE_STAGE`
   - `RM_ASSIGNMENT_STATUS`
   - `RM_CHECK_IN_TYPE`
   - `OWNER_LIFECYCLE_TRANSITIONS`
   - `RM_STATUS_TRANSITIONS`

### Data Rules (must remain unchanged)

- Phone numbers remain normalized 10-digit strings.
- Money remains paise integer values.
- Dates remain Unix milliseconds.
- Soft delete policy remains enforced (`is_deleted` where applicable).

---

## Section 4: Admin UI

### 1) Owner List Page

- **Route**: `/admin/owners/`
- **Primary view**: paginated table
- **Columns**:
  - Phone
  - Name
  - Lifecycle stage
  - Current RM
  - Active properties count
  - Last activity timestamp
- **Core interactions**:
  - Search by phone/name/email
  - Filter by lifecycle stage and RM
  - Open owner detail page

### 2) Owner Detail Page

- **Route**: `/admin/owners/[id]/`
- **Tabs**:
  - `Properties` (leads/listings/closures linked to owner)
  - `RM History` (assignment timeline, transitions, reassignment reasons)
  - `Check-ins` (chronological RM check-in log)
  - `Activity` (owner lifecycle events, status changes, critical actions)

### 3) RM Dashboard

- **Route**: `/admin/rm-dashboard/`
- **Views**:
  - RM workload board (active owners per RM)
  - Escalation queue (`WARNING`, `ESCALATED`)
  - Upcoming check-ins (`next_check_in_due` sorted)

### 4) RM Reassignment Dialog

- Launch from owner detail and RM dashboard.
- Required inputs: target guard + reassignment reason.
- Effect: closes current assignment as `REASSIGNED`, creates new `ACTIVE` assignment.

---

## Section 5: What This Unblocks

This foundation unblocks cross-phase owner continuity:

1. **P20 Owner Services**: Owner requests can resolve directly to canonical owner identity.
2. **P22 Referral System**: Owner attribution can reference `owner_id` instead of phone-only records.
3. **P25 Deal Room Features**: Owner invite and deal artifacts can bind to canonical owner identity.
4. **P26 Rent Negotiation**: Owner-side participation and signatures can map to unified owner records.
5. **P30+ Deal Economics / Ops Intelligence**: owner-level economics, retention, and RM outcomes become measurable.
6. **Future retention work**: proactive re-listing, churn detection, and lifecycle-driven automation.

---

## Cross-References

- [Owner Services](14-owner-services.md)
- [State Machines](../04-state-machines.md)
- [Convex Schema](../10-convex-schema.md)
- [Constants Reference](../13-constants-reference.md)
- [Closure & Payouts](07-closure-and-payouts.md)
