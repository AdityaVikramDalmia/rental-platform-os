# Feature: Visit Management

> **Priority**: #7 in implementation order
> **Personas**: Admin/OPS (scheduling + monitoring with permission), Guard (execution)
> **Dependencies**: Lead Pipeline + Owner Verification + Guard Management (shifts)

## Purpose

Visits are the physical step: a potential tenant goes to see the flat, accompanied/coordinated by a guard. Admin schedules visits, assigns a guard, and the guard handles on-site logistics — opening the flat, being present during the visit, and recording the outcome. The guard never discusses rent, pricing, or deals.

## Entities Involved

- `visits` table
- `leads` table (must be VERIFIED)
- `guard_shifts` table (for assignment suggestions)
- `listings` table (optional reference)

---

## Admin Flow: Schedule a Visit

### Create Visit Form

Admin navigates to Visits Board → "Schedule Visit"

**Fields**:

| Field             | Type        | Required | Description                                                   |
| ----------------- | ----------- | -------- | ------------------------------------------------------------- |
| Lead              | Select      | Yes      | Dropdown of VERIFIED leads. Shows: Building + Flat + Society. |
| Date & Time Start | DateTime    | Yes      | Visit start time                                              |
| Date & Time End   | DateTime    | Yes      | Visit end time                                                |
| Assign Guard      | Select      | Yes      | Dropdown of ACTIVE guards in the lead's society               |
| Listing           | Auto-linked | No       | If listing exists for this lead, auto-linked                  |

### Guard Assignment: Shift-Aware Suggestions

When admin selects a date/time and lead (which determines the society and building):

1. System queries all ACTIVE guards in the society
2. For each guard, compute their shift for the selected date (recurring + override logic)
3. Display guard list with availability indicators:

```
Guard Selection:
┌──────────────────────────────────────────────┐
│ ● Rajesh Kumar - Tower A, 06:00-14:00       │  ← On shift, same building ✅
│ ● Suresh Yadav - Main Gate, 06:00-18:00     │  ← On shift, different location ⚠️
│ ● Mohan Singh - OFF DUTY                     │  ← Not scheduled ⚠️
│ ○ Ravi Patel - INACTIVE                      │  ← Cannot assign ❌
└──────────────────────────────────────────────┘
```

**Indicators**:

- ✅ Green: On shift at the same building during visit time
- ⚠️ Yellow: On shift but at different location, or off duty
- ❌ Grey: INACTIVE/BANNED — not selectable

**This is a SOFT WARNING only.** Admin can assign any ACTIVE guard regardless of shift. Real world is messy — guard might swap shifts, or admin knows something the system doesn't.

### Save Visit

- Status: `ASSIGNED`
- Guard sees it in their "My Visits" list
- Audit log: `VISIT_CREATED`

---

## Admin Flow: Monitor Visits

### Visits Board (`/admin/visits`)

| Column    | Description                                                          |
| --------- | -------------------------------------------------------------------- |
| Lead      | Building + Flat                                                      |
| Society   | Society name                                                         |
| Date/Time | Scheduled window                                                     |
| Guard     | Assigned guard name                                                  |
| Status    | ASSIGNED / CONFIRMED / IN_PROGRESS / COMPLETED / CANCELLED / NO_SHOW |
| Outcome   | (if completed) INTERESTED / NOT_INTERESTED / FOLLOWUP                |
| Notes     | Guard's outcome notes                                                |

**Filters**: Status, Date range, Society, Guard
**Sort**: By date (upcoming first)

### Admin Actions on a Visit

| Action       | Transitions                    | When                                                |
| ------------ | ------------------------------ | --------------------------------------------------- |
| Confirm      | ASSIGNED → CONFIRMED           | After owner confirms availability for the time slot |
| Cancel       | ASSIGNED/CONFIRMED → CANCELLED | Owner reschedules, tenant cancels, etc.             |
| Mark No-Show | ASSIGNED/CONFIRMED → NO_SHOW   | Neither tenant nor guard showed up                  |
| Edit         | Any non-terminal               | Change time, reassign guard                         |

**Rescheduling**: Admin edits the visit in place (changes `scheduled_start`/`end`). Audit trail captures the old and new values. No need to cancel and recreate — single record is cleaner.

---

## Guard Flow: My Visits

### Visit List (`/guard/visits`)

Mobile-first list. Shows today's and upcoming visits.

**Sections**:

- **Today**: Visits scheduled for today (highlighted)
- **Upcoming**: Next 7 days
- **Past**: Last 30 days (completed, cancelled, no-show)

**Each visit card**:

```
┌─────────────────────────────────┐
│  Tower A, Floor 12, Flat 1201   │
│  Maplewood Gardens            │
│                                 │
│  📅 Today, 2:00 PM - 3:00 PM   │
│  Status: CONFIRMED              │
│                                 │
│  [Start Visit]                  │
└─────────────────────────────────┘
```

### Visit Execution Flow

**Step 1: Start Visit**

- Guard taps "Start Visit" when they're at the flat and ready
- Status: `CONFIRMED` → `IN_PROGRESS`
- `started_at` timestamp recorded
- Audit: `VISIT_STARTED`

**Step 2: Complete Visit**

- Guard taps "Complete Visit" after the showing is done
- Outcome selection (required):
  - 😊 **Interested** — Tenant wants to proceed
  - 😐 **Not Interested** — Tenant passed
  - 🔄 **Follow-up Needed** — Tenant wants to think / come back
- Notes field (optional): Guard can add any observations
- Status: `IN_PROGRESS` → `COMPLETED`
- `completed_at` timestamp recorded
- Audit: `VISIT_COMPLETED`

**Important**: Guard does NOT enter any pricing info, tenant details, or deal terms. The outcome selection + notes is ALL they record.

### Visit Detail View (Guard)

```
┌─────────────────────────────────┐
│  Tower A, Floor 12, Flat 1201   │
│  Maplewood Gardens            │
│                                 │
│  📅 Feb 17, 2:00 PM - 3:00 PM  │
│                                 │
│  Status: IN_PROGRESS            │
│  Started: 2:05 PM              │
│                                 │
│  ── Complete Visit ──           │
│                                 │
│  How did it go?                 │
│  [😊 Interested]               │
│  [😐 Not Interested]           │
│  [🔄 Follow-up]               │
│                                 │
│  Notes: [_______________]       │
│                                 │
│  [Submit & Complete]            │
└─────────────────────────────────┘
```

---

## Convex Functions

### Queries

```
visits.list({ society_id?, guard_user_id?, status?, date_from?, date_to?, pagination }) → Visit[]
visits.getById({ id }) → Visit + lead info + guard info + listing info
visits.getMyVisits({ date_from?, date_to? }) → guard's visits (guard-facing)
visits.getMyTodayVisits() → guard's visits for today (guard-facing)
visits.getGuardAvailability({ society_id, date, time_start, time_end }) → GuardAvailability[]
```

### Mutations

```
visits.create({ lead_id, scheduled_start, scheduled_end, assigned_guard_id })
// Auto-links listing_id if listing exists for this lead
// Status: ASSIGNED
// Audit: VISITS_INSERT

visits.confirm({ id })
// Status: ASSIGNED → CONFIRMED
// Audit: VISITS_UPDATE

visits.cancel({ id, reason? })
// Status: ASSIGNED/CONFIRMED → CANCELLED
// Audit: VISITS_UPDATE

visits.markNoShow({ id, notes? })
// Status: ASSIGNED/CONFIRMED → NO_SHOW
// Audit: VISITS_UPDATE

visits.start({ id })
// Status: CONFIRMED → IN_PROGRESS (also allowed from ASSIGNED for flexibility)
// Sets started_at
// Audit: VISITS_UPDATE

visits.complete({ id, outcome, outcome_notes? })
// Status: IN_PROGRESS → COMPLETED
// Sets completed_at
// Audit: VISITS_UPDATE

visits.edit({ id, scheduled_start?, scheduled_end?, assigned_guard_id? })
// Only non-terminal visits
// Audit: VISITS_UPDATE
```

---

## Business Rules

1. Only `VERIFIED` leads can have visits scheduled.
2. Only `ACTIVE` guards can be assigned visits.
3. A lead can have multiple visits (e.g., different tenants, re-visits).
4. Guard can only `start` and `complete` their own assigned visits. A guard CAN be assigned visits for leads submitted by other guards in the same society — this is expected behavior. The visit card shows flat location only, not who submitted the lead.
5. Admin can perform all status transitions.
6. Shift check is soft — warning only, no blocking.
7. `CANCELLED` and `NO_SHOW` are terminal for that visit record. Admin creates a new visit if rescheduling.
8. `COMPLETED` is terminal. Cannot be un-completed.
9. No visit can be created for leads with status `REJECTED` or `DUPLICATE`.
10. `society_id` is denormalized onto visits from the lead's society_id at creation time, for efficient filtering.
11. `needs_reassignment` flag is set to `true` when the assigned guard is banned or deactivated. Admin filters by this to find visits needing new guard assignment.

---

## Guard Ban/Deactivation Impact on Visits

When a guard is banned or deactivated (`ACTIVE` → `BANNED` or `ACTIVE` → `INACTIVE`):

1. All their visits in non-terminal states (`ASSIGNED`, `CONFIRMED`, `IN_PROGRESS`) are flagged with `needs_reassignment = true`
2. Admin can filter visits by `needs_reassignment = true` to see all visits needing new guard assignment
3. Admin manually reassigns each visit to another active guard in the same society, or cancels the visit
4. The `needs_reassignment` flag is cleared when admin reassigns the visit to a new guard
5. Visits in terminal states (`COMPLETED`, `CANCELLED`, `NO_SHOW`) are not affected

This is NOT automatic — admin handles reassignment manually. The flag is just a filter to surface affected visits.

---

## Edge Cases

- **Guard starts visit before confirmed**: Allow it. `ASSIGNED` → `IN_PROGRESS` is valid (sometimes admin doesn't explicitly confirm).
- **Multiple visits same flat same day**: Allowed. Different tenants might visit at different times.
- **Guard goes INACTIVE after visit assigned**: Visit stays assigned. Admin should reassign or cancel.
- **Visit time passed, no status change**: No auto-transition. Admin manually marks NO_SHOW or checks with guard.
- **Lead gets rejected after visit scheduled**: Admin should cancel pending visits. System shows warning but doesn't auto-cancel (admin might have context).

---

## Checklist Execution Integration (Phase 30)

Phase 30 added a configurable inspection checklist engine. Visits can now be linked to a `checklist_instance_id` — a per-visit record that captures the guard's responses to a structured inspection template.

### How It Works

When a visit is created, admin can optionally attach a checklist template. The system creates a `checklist_instances` record linked to the visit. The guard fills out the checklist during or immediately after the visit execution.

```
Visit created (ASSIGNED)
  → checklist_instance created (if template attached)
  → guard starts visit → IN_PROGRESS
  → guard fills checklist items (photos, condition ratings, text responses)
  → guard completes visit → COMPLETED
  → checklist_instance marked SUBMITTED
  → admin reviews checklist responses
```

### Checklist Depth Levels

Templates have three depth levels that control how much detail is required:

| Level    | Description                                        | Typical Use                                   |
| -------- | -------------------------------------------------- | --------------------------------------------- |
| `LIGHT`  | Basic condition check, no photos required          | Routine visits, quick turnaround              |
| `MEDIUM` | Condition ratings + optional photos                | Standard property inspections                 |
| `FULL`   | Condition ratings + mandatory photos for each item | Pre-closure documentation, dispute prevention |

### Completeness Score

When the guard submits the checklist, the system computes a `completeness_score` (0-100) based on:

- Fraction of required items answered
- Fraction of mandatory photos uploaded (for FULL depth)
- Condition ratings provided vs skipped

This score feeds directly into the guard's **quality scoring** (see [Incentive V2](22-incentive-v2.md)). Checklist completeness is the single largest component of the quality score (30% weight), so guards are strongly incentivized to fill checklists thoroughly.

### Admin Review

After visit completion, admin can open the checklist instance from the visit detail page to review:

- Each item's response and condition rating
- Uploaded photos with timestamps
- Overall completeness score
- Any items flagged as concerning

### Convex Functions (Checklist)

```
checklists.getInstanceByVisit({ visit_id }) → ChecklistInstance + items + photos
checklists.submitInstance({ instance_id, responses[] })
// Guard submits all responses at once
// Computes completeness_score
// Status: SUBMITTED
// Audit: CHECKLIST_INSTANCES_UPDATE

checklistTemplates.list({ is_active? }) → Template[]
checklistTemplates.getById({ id }) → Template + sections + items
```

### Business Rules

1. Checklist attachment is optional — not all visits require a checklist.
2. Guard can only submit their own visit's checklist.
3. Once submitted, checklist responses are immutable. Admin can add review notes but cannot change guard's responses.
4. Completeness score is computed server-side on submission. Client cannot override it.
5. For FULL depth templates, missing mandatory photos reduce the completeness score proportionally.

See [Field Checklists](21-field-checklists.md) for the full template/instance model, section structure, and admin configuration.
