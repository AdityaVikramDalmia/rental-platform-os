# Data Models

All entities are stored in Convex DB. Convex auto-generates `_id` and `_creationTime` for every record. Below, `_id` is the Convex document ID.

Relationships use Convex ID references (e.g., `society_id: v.id("societies")`).

## Global Conventions

| Convention          | Rule                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Phone numbers**   | Stored as **10 digits only** (e.g., `9876543210`). Strip all formatting on input. Add `+91` for display/calling only.            |
| **Money amounts**   | Stored in **paise (integer × 100)**. ₹25,000 = `2500000`. Display divides by 100. No floating point.                             |
| **All dates/times** | Stored as **number (Unix ms)** via `Date.now()`. No string dates anywhere. Convert to display format in frontend.                |
| **Soft delete**     | Deletable entities have `is_deleted: boolean` (default `false`). Never hard-delete. Filter `is_deleted !== true` in all queries. |
| **Guard auth**      | Guards authenticate via WorkOS email+password using a synthetic email: `{phone}@guards.local`. Phone is the actual identifier. |

---

## A. Society

The top-level organizational unit. A residential housing complex.

| Field               | Type            | Required | Description                                 |
| ------------------- | --------------- | -------- | ------------------------------------------- |
| \_id                | Id<"societies"> | auto     | Convex document ID                          |
| name                | string          | yes      | Society name (e.g., "Maplewood Gardens")  |
| city                | string          | yes      | City name                                   |
| address             | string          | no       | Full address (added later during iteration) |
| status              | string          | yes      | `ACTIVE` / `INACTIVE` / `ONBOARDING`        |
| notes               | string          | no       | Internal ops notes                          |
| created_by_admin_id | Id<"users">     | yes      | Admin who created this society              |
| \_creationTime      | number          | auto     | Convex auto-generated                       |

**Indexes**: `by_city`, `by_status`, `by_name`, `search_name` (search index on `name`)

**Notes**:

- Minimal creation: just name + city. Everything else can be added later.
- Status starts as `ONBOARDING`, moves to `ACTIVE` when at least one building exists.
- A society can be set `INACTIVE` to pause all operations (guards can't submit leads).

---

## B. Building

A physical building/tower within a society.

| Field                | Type            | Required | Description                                                                                                                                                                                                                                         |
| -------------------- | --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \_id                 | Id<"buildings"> | auto     | Convex document ID                                                                                                                                                                                                                                  |
| society_id           | Id<"societies"> | yes      | Parent society                                                                                                                                                                                                                                      |
| name                 | string          | yes      | Building name (e.g., "Tower A", "Wing B")                                                                                                                                                                                                           |
| total_floors         | number          | yes      | Number of floors (excluding named floors like G, B1)                                                                                                                                                                                                |
| flats_per_floor      | number          | no       | Approximate flats per floor (metadata)                                                                                                                                                                                                              |
| total_flats          | number          | no       | Total flat count (metadata)                                                                                                                                                                                                                         |
| floor_labels         | array           | yes      | Ordered list of all floor labels. Admin enters manually. E.g., `["B2", "B1", "G", "1", "2", ... "20"]`. Supports named floors (G=Ground, B1=Basement 1, LG=Lower Ground, M=Mezzanine).                                                              |
| flat_number_template | object          | no       | Structured template for valid flat numbers. `{ prefix?: string, floor_digits: number, unit_digits: number }`. E.g., `{ prefix: "A-", floor_digits: 2, unit_digits: 2 }` generates valid patterns like `A-0101`. Guard input validated against this. |
| status               | string          | yes      | `ACTIVE` / `INACTIVE`                                                                                                                                                                                                                               |
| notes                | string          | no       | Internal notes                                                                                                                                                                                                                                      |
| is_deleted           | boolean         | yes      | Soft delete flag. Default `false`.                                                                                                                                                                                                                  |
| \_creationTime       | number          | auto     |                                                                                                                                                                                                                                                     |

**Indexes**: `by_society_id`, `by_society_and_name`

**Notes**:

- Building metadata (floors, flat count) is informational — used for analytics and form dropdowns.
- `floor_labels` is the authoritative list of floors. Admin enters every label manually (e.g., B2, B1, G, 1, 2, ..., 20). Used in lead submission form dropdowns and flat number validation.
- `flat_number_template` defines the expected flat number format. When a guard submits a lead, the flat number is validated against this template. If invalid, an error is shown: "Flat number should be like A-0101".
- `flats_per_floor` combined with `floor_labels` determines total expected flats.

---

## C. User (Guards + Admins)

Single user table. Role determines persona. Guards and admins are both "users" differentiated by `user_type`.

| Field                | Type        | Required | Description                                                                                                        |
| -------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| \_id                 | Id<"users"> | auto     | Convex document ID                                                                                                 |
| workos_user_id       | string      | yes      | WorkOS user management ID                                                                                          |
| user_type            | string      | yes      | `GUARD` / `ADMIN` / `OPS` / `TENANT` / `OWNER`                                                                     |
| name                 | string      | yes      | Full name                                                                                                          |
| phone                | string      | no       | Required for guards (10-digit), absent for admins                                                                  |
| email                | string      | no       | Required for admins. Optional for OPS (present when created with Google email for SSO). Absent for guards.         |
| status               | string      | yes      | `ACTIVE` / `INACTIVE` / `BANNED`                                                                                   |
| must_change_password | boolean     | yes      | Always `false` for admins. Set to `true` for guards and OPS (set during account creation with temporary password). |
| \_creationTime       | number      | auto     |                                                                                                                    |

**Indexes**: `by_workos_user_id`, `by_user_type`, `by_phone`, `by_email`, `by_status`, `by_type_and_status` (user_type + status)

---

## D. Guard Profile

Extended profile data for guards. Separated from User for clean separation of concerns.

| Field                | Type                 | Required | Description                                                                                                                                        |
| -------------------- | -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| \_id                 | Id<"guard_profiles"> | auto     |                                                                                                                                                    |
| user_id              | Id<"users">          | yes      | Link to user record                                                                                                                                |
| society_id           | Id<"societies">      | yes      | Currently assigned society (one at a time)                                                                                                         |
| guard_type           | string               | yes      | `BUILDING_SPECIFIC` / `MAIN_GATE` / `PARK` / `ROVING`                                                                                              |
| photo_storage_id     | Id<"\_storage">      | no       | Profile photo (Convex file storage). Max 5MB, JPEG/PNG/WebP. Client-side resize to ~500KB before upload.                                           |
| language_preference  | string               | no       | Guard's chosen UI language: `en` / `hi` / `hinglish`. Set on first login, changeable from profile. Also stored in localStorage for offline access. |
| has_seen_onboarding  | boolean              | yes      | `false` on creation. Set `true` after guard dismisses the 3-step onboarding walkthrough. Never shown again.                                        |
| metadata             | object               | no       | Flexible JSON: `{ languages: string[], experience_years?: number }`                                                                                |
| quality_score        | number               | no       | Aggregate guard quality score used for ranking and filtering.                                                                                      |
| browser_fingerprints | array                | no       | Array of `{ fingerprint: string, first_seen: number, last_seen: number, flagged: boolean, ip?: string, device_label?: string }`                    |
| \_creationTime       | number               | auto     |                                                                                                                                                    |

**Indexes**: `by_user_id`, `by_society_id`, `by_guard_type`, `by_society_and_type` (society_id + guard_type), `by_quality_score`

**Notes**:

- Guard belongs to exactly ONE society at a time. If they change jobs, admin updates `society_id`.
- `guard_type` affects analytics and visit assignment suggestions but does NOT restrict lead submission.
- Browser fingerprints logged on each login for light fraud detection.

---

## E. Guard Shift

Represents a guard's recurring or one-off schedule entry.

| Field               | Type               | Required    | Description                                                       |
| ------------------- | ------------------ | ----------- | ----------------------------------------------------------------- |
| \_id                | Id<"guard_shifts"> | auto        |                                                                   |
| guard_user_id       | Id<"users">        | yes         |                                                                   |
| shift_type          | string             | yes         | `RECURRING` / `OVERRIDE`                                          |
| day_of_week         | number             | conditional | 0-6 (Sun-Sat). Required if `RECURRING`.                           |
| specific_date       | number             | conditional | Unix ms timestamp (midnight of the date). Required if `OVERRIDE`. |
| start_time          | string             | yes         | HH:MM (24h format, e.g., "06:00")                                 |
| end_time            | string             | yes         | HH:MM (24h format, e.g., "18:00")                                 |
| location_type       | string             | yes         | `BUILDING` / `MAIN_GATE` / `PARK` / `PARKING` / `OTHER`           |
| building_id         | Id<"buildings">    | conditional | Required if `location_type` is `BUILDING`                         |
| location_label      | string             | no          | Free text label (e.g., "East Gate", "Garden Area")                |
| notes               | string             | no          |                                                                   |
| created_by_admin_id | Id<"users">        | yes         | Admin who set this shift                                          |
| is_deleted          | boolean            | yes         | Soft delete flag. Default `false`.                                |
| \_creationTime      | number             | auto        |                                                                   |

**Indexes**: `by_guard_user_id`, `by_guard_and_day`, `by_guard_and_date`, `by_guard_and_type` (guard_user_id + shift_type)

**Notes**:

- `RECURRING` entries define the weekly base schedule (e.g., "every Monday 6am-2pm at Tower A").
- `OVERRIDE` entries override the recurring pattern for a specific date (e.g., "2026-02-20, swap to Tower B").
- To compute a guard's schedule for a given date: check for `OVERRIDE` on that date first, fall back to `RECURRING` for that `day_of_week`.
- Shifts are **informational** — used for visit assignment soft warnings. They do NOT restrict guard actions.

---

## F. Lead (Vacancy Lead)

The core entity. A guard's report of a vacant flat.

| Field                 | Type            | Required    | Description                                                                                                                                                                                                                   |
| --------------------- | --------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \_id                  | Id<"leads">     | auto        |                                                                                                                                                                                                                               |
| society_id            | Id<"societies"> | yes         |                                                                                                                                                                                                                               |
| building_id           | Id<"buildings"> | yes         |                                                                                                                                                                                                                               |
| floor_number          | string          | yes         | Floor (e.g., "12", "G", "B1")                                                                                                                                                                                                 |
| flat_number           | string          | yes         | Flat number (e.g., "1201", "A-403")                                                                                                                                                                                           |
| owner_name            | string          | no          | Optional but useful for verification                                                                                                                                                                                          |
| owner_phone           | string          | yes         | Owner's phone number. **Canonical format: 10 digits only** (e.g., `9876543210`). Stripped on input.                                                                                                                           |
| availability_type     | string          | yes         | `VACANT_NOW` / `VACANT_FROM`                                                                                                                                                                                                  |
| availability_date     | number          | conditional | Unix ms timestamp. Required if `VACANT_FROM`.                                                                                                                                                                                 |
| rent_expected         | number          | no          | Approximate rent in **paise** (guard's estimate). ₹25,000 = `2500000`.                                                                                                                                                        |
| furnishing            | string          | no          | `UNFURNISHED` / `SEMI_FURNISHED` / `FULLY_FURNISHED`                                                                                                                                                                          |
| notes                 | string          | no          | Free-text notes from guard                                                                                                                                                                                                    |
| owner_consent_to_call | boolean         | yes         | Guard confirms: "Owner agrees to receive call from our team"                                                                                                                                                                  |
| submitted_by_guard_id | Id<"users">     | yes         |                                                                                                                                                                                                                               |
| status                | string          | yes         | See state machine in `04-state-machines.md`                                                                                                                                                                                   |
| notes_thread          | array           | no          | Array of `{ note: string, author_id: Id<"users">, author_name: string, author_type: "ADMIN" \| "GUARD" \| "OPS", timestamp: number }`. Unified conversation thread — admin, guard, and OPS replies in one append-only thread. |
| quality_flags         | array           | no          | Array of flag strings: `DUPLICATE_FLAT_MATCH`, `DUPLICATE_PHONE_MATCH`, `GUARD_HIGH_REJECTION`, `OFF_SHIFT_SUBMISSION`. See [Constants Reference](13-constants-reference.md) for full list.                                   |
| duplicate_of_lead_id  | Id<"leads">     | no          | Set when lead is marked as `DUPLICATE`. References the original lead.                                                                                                                                                         |
| prospective_bounty    | number          | no          | Bounty amount in **paise** shown to guard (set by admin post-verification)                                                                                                                                                    |
| searchable_text       | string          | no          | Denormalized text for full-text search index. Auto-populated from society name, building name, flat number, owner name.                                                                                                       |
| \_creationTime        | number          | auto        | Submission timestamp                                                                                                                                                                                                          |

**Indexes**: `by_society_id`, `by_building_id`, `by_status`, `by_submitted_by_guard_id`, `by_owner_phone`, `by_society_and_status` (society_id + status), `by_society_building_flat` (compound), `by_guard_and_status` (submitted_by_guard_id + status), `search_leads` (search index on `searchable_text`)

**Status values**: `SUBMITTED`, `NEED_INFO`, `POTENTIAL_DUPLICATE`, `VERIFIED`, `REJECTED`, `DUPLICATE`

**De-duplication rules** (auto-flagged on submission):

1. Same `society_id` + `building_id` + `flat_number` exists with status NOT `REJECTED`/`DUPLICATE` within last 90 days → flag `POTENTIAL_DUPLICATE`
2. Same `owner_phone` in same `society_id` within last 30 days → flag `POTENTIAL_DUPLICATE`

Admin finalizes as `DUPLICATE` (terminal) or proceeds to verify.

---

## G. Owner Verification

Records the outcome of an admin's verification call with the flat owner.

| Field                      | Type                      | Required | Description                                                      |
| -------------------------- | ------------------------- | -------- | ---------------------------------------------------------------- |
| \_id                       | Id<"owner_verifications"> | auto     |                                                                  |
| lead_id                    | Id<"leads">               | yes      |                                                                  |
| called_by_admin_id         | Id<"users">               | yes      | Admin who made the call                                          |
| call_outcome               | string                    | yes      | `VERIFIED` / `UNREACHABLE` / `DECLINED` / `FALSE`                |
| consent_contact_demorentals    | boolean                   | yes      | Owner consents to DemoRentals contact. MUST be true to proceed.      |
| consent_visit_coordination | boolean                   | no       | Owner consents to visit coordination                             |
| preferred_visit_slots      | string                    | no       | Free text (e.g., "Weekdays 10am-4pm")                            |
| rent_confirmed             | number                    | no       | Rent amount confirmed by owner, in **paise** (₹25,000 = 2500000) |
| notes                      | string                    | no       |                                                                  |
| verified_at                | number                    | yes      | Timestamp of verification                                        |

**Indexes**: `by_lead_id`

**Notes**:

- Multiple verification records can exist per lead (e.g., first call UNREACHABLE, second call VERIFIED).
- Lead status changes to `VERIFIED` only if `call_outcome === "VERIFIED"` AND `consent_contact_demorentals === true`.
- If `DECLINED` or `FALSE`, lead is `REJECTED`.

---

## H. Listing

A verified flat packaged as a shareable property listing.

| Field               | Type           | Required | Description                                                  |
| ------------------- | -------------- | -------- | ------------------------------------------------------------ |
| \_id                | Id<"listings"> | auto     |                                                              |
| lead_id             | Id<"leads">    | yes      | Source lead                                                  |
| owner_id            | Id<"owners">   | no       | Canonical owner entity link (when owner is resolved)         |
| slug                | string         | yes      | URL-friendly unique slug for public link                     |
| status              | string         | yes      | `DRAFT` / `PUBLISHED` / `ARCHIVED`                           |
| rent_monthly        | number         | yes      | Monthly rent in **paise**                                    |
| deposit             | number         | no       | Security deposit in **paise**                                |
| maintenance         | number         | no       | Monthly maintenance in **paise**                             |
| bhk_config          | string         | yes      | `1BHK`, `2BHK`, `3BHK`, `4BHK`, `STUDIO`, `OTHER`            |
| furnishing          | string         | yes      | `UNFURNISHED` / `SEMI_FURNISHED` / `FULLY_FURNISHED`         |
| floor_number        | string         | yes      | (Copied from lead, can be edited)                            |
| carpet_area_sqft    | number         | no       | Carpet area in square feet                                   |
| available_from      | number         | yes      | Unix ms timestamp                                            |
| description         | string         | no       | Rich text description                                        |
| house_rules         | array          | no       | Ordered list of rules shown on the detail page               |
| parking             | string         | no       | `NONE` / `COVERED` / `OPEN` / `BOTH`                         |
| pet_friendly        | boolean        | no       |                                                              |
| amenities           | array          | no       | Array of strings (e.g., "gym", "pool", "garden", "security") |
| created_by_admin_id | Id<"users">    | yes      |                                                              |
| \_creationTime      | number         | auto     |                                                              |

**Indexes**: `by_lead_id`, `by_owner_id`, `by_slug`, `by_status`

**Notes**:

- Public page shows ALL listing fields EXCEPT owner info (name, phone — never exposed).
- `slug` enables shareable URLs: `https://app.rental-platform-os.com/listing/{slug}`
- Public page includes: WhatsApp button (number from `system_config`), DemoRentals phone number, and contact form.
- Photos managed via `listing_photos` table (see below). Max 10 photos per listing. 10MB max per photo, JPEG/PNG/WebP, client-side resize to ~1MB before upload.

---

## H2. Listing Photo

Photos for a listing, with explicit ordering. Separate table for easy reordering.

| Field          | Type                 | Required | Description                        |
| -------------- | -------------------- | -------- | ---------------------------------- |
| \_id           | Id<"listing_photos"> | auto     |                                    |
| listing_id     | Id<"listings">       | yes      | Parent listing                     |
| storage_id     | Id<"\_storage">      | yes      | Convex file storage ID             |
| display_order  | number               | yes      | Sort order. Lowest = cover photo.  |
| is_deleted     | boolean              | yes      | Soft delete flag. Default `false`. |
| \_creationTime | number               | auto     |                                    |

**Indexes**: `by_listing_id`

**Notes**:

- First photo by `display_order` is the cover image used in social sharing previews.
- Reorder by updating `display_order` values.
- Max 10 active (non-deleted) photos per listing.

---

## I. Listing Inquiry

When someone views a public listing and submits the contact form.

| Field          | Type                    | Required | Description                       |
| -------------- | ----------------------- | -------- | --------------------------------- |
| \_id           | Id<"listing_inquiries"> | auto     |                                   |
| listing_id     | Id<"listings">          | yes      |                                   |
| name           | string                  | yes      | Inquirer's name                   |
| phone          | string                  | yes      | Inquirer's phone                  |
| message        | string                  | no       | Optional message                  |
| source         | string                  | yes      | `CONTACT_FORM` / `WHATSAPP_CLICK` |
| \_creationTime | number                  | auto     |                                   |

**Indexes**: `by_listing_id`

---

## J. Visit

A scheduled flat visit, assigned to a guard for on-site coordination.

| Field               | Type            | Required | Description                                                                                                             |
| ------------------- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| \_id                | Id<"visits">    | auto     |                                                                                                                         |
| lead_id             | Id<"leads">     | yes      |                                                                                                                         |
| society_id          | Id<"societies"> | yes      | Denormalized from lead for efficient filtering. Set on visit creation.                                                  |
| listing_id          | Id<"listings">  | no       | Optional link to listing                                                                                                |
| scheduled_start     | number          | yes      | Timestamp                                                                                                               |
| scheduled_end       | number          | yes      | Timestamp                                                                                                               |
| assigned_guard_id   | Id<"users">     | yes      | Guard handling the visit                                                                                                |
| status              | string          | yes      | See state machine                                                                                                       |
| outcome             | string          | no       | `INTERESTED` / `NOT_INTERESTED` / `FOLLOWUP` (set on completion)                                                        |
| outcome_notes       | string          | no       | Guard's notes on the visit                                                                                              |
| started_at          | number          | no       | Timestamp when guard started visit                                                                                      |
| completed_at        | number          | no       | Timestamp when guard completed visit                                                                                    |
| needs_reassignment  | boolean         | no       | Set to `true` when assigned guard is banned/deactivated. Admin uses this to filter visits needing new guard assignment. |
| created_by_admin_id | Id<"users">     | yes      |                                                                                                                         |
| \_creationTime      | number          | auto     |                                                                                                                         |

**Indexes**: `by_lead_id`, `by_assigned_guard_id`, `by_status`, `by_scheduled_start`, `by_guard_and_status` (assigned_guard_id + status), `by_society_id`, `by_needs_reassignment`

**Status values**: `ASSIGNED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`

---

## K. Closure

Records a successful deal — tenant moved in.

| Field                     | Type                  | Required | Description                                                                                 |
| ------------------------- | --------------------- | -------- | ------------------------------------------------------------------------------------------- |
| \_id                      | Id<"closures">        | auto     |                                                                                             |
| lead_id                   | Id<"leads">           | yes      |                                                                                             |
| listing_id                | Id<"listings">        | no       |                                                                                             |
| owner_id                  | Id<"owners">          | no       | Canonical owner entity link for owner lifecycle + RM flows                                  |
| visit_id                  | Id<"visits">          | no       | Visit that produced this closure (tenant referral attribution chain anchor)                 |
| demorentals_deal_id           | string                | no       | Reference to DemoRentals's internal deal tracking                                               |
| move_in_date              | number                | yes      | Unix ms timestamp                                                                           |
| status                    | string                | yes      | `PENDING` / `CONFIRMED` / `CANCELLED`                                                       |
| rent_agreement_storage_id | Id<"\_storage">       | no       | Uploaded rent agreement document                                                            |
| commission_amount         | number                | no       | Commission charged in **paise**                                                             |
| brokerage_tenant_side     | number                | no       | Brokerage collected from tenant in **paise**                                                |
| brokerage_owner_side      | number                | no       | Brokerage collected from owner in **paise**                                                 |
| notes                     | string                | no       | Free text notes                                                                             |
| additional_documents      | array                 | no       | Array of `{ name: string, storage_id: Id<"_storage"> }`                                     |
| deal_checklist_id         | Id<"deal_checklists"> | no       | Linked signed checklist from deal room — set when checklist is APPROVED and closure created |
| closed_by_admin_id        | Id<"users">           | yes      |                                                                                             |
| confirmed_at              | number                | no       | Timestamp when status moved to CONFIRMED                                                    |
| \_creationTime            | number                | auto     |                                                                                             |

**Indexes**: `by_lead_id`, `by_owner_id`, `by_visit_id`, `by_status`

**Notes**:

- Closure is created when a deal is finalized.
- Documents uploaded: rent agreement, commission details, brokerage breakdown.
- Both tenant-side and owner-side brokerage tracked separately (standard in India).
- Additional documents field for any extra proof/paperwork.
- Status starts `PENDING`, moves to `CONFIRMED` when admin has all documentation.
- Status can move to `CANCELLED` if deal falls through (tenant backs out, etc.). Any linked payout in `pending` state is voided.
- `visit_id` is optional but required for tenant referral closure attribution. When present, it must belong to the same `lead_id` and be linked to a `tenant_inquiries` record.
- `deal_checklist_id` links the signed deal room checklist (Phase 25). Optional — not all closures will have a deal room checklist. When set, the linked checklist must have status `APPROVED` and both party signatures. See [Deal Room](features/18-deal-room.md).

---

## L. Payout

Tracks payment to a guard for a successful closure.

| Field                 | Type           | Required | Description                                                |
| --------------------- | -------------- | -------- | ---------------------------------------------------------- |
| \_id                  | Id<"payouts">  | auto     |                                                            |
| guard_user_id         | Id<"users">    | yes      |                                                            |
| lead_id               | Id<"leads">    | yes      |                                                            |
| closure_id            | Id<"closures"> | yes      |                                                            |
| amount_paise          | number         | yes      | Payout amount in **paise** — manually set by admin         |
| method                | string         | no       | `CASH` / `UPI` / `BANK_TRANSFER` (optional)                |
| status                | string         | yes      | `pending` / `approved` / `disbursed` / `failed` / `voided` |
| initiated_by_admin_id | Id<"users">    | yes      |                                                            |
| approved_by_admin_id  | Id<"users">    | no       | (Set when approved)                                        |
| approved_at           | number         | no       | Timestamp when approved                                    |
| disbursed_at          | number         | no       | Timestamp when money was disbursed                         |
| payment_reference     | string         | no       | Admin's note (e.g., "Paid cash at society office")         |
| failure_reason        | string         | no       | Reason disbursement failed (set when status is `failed`)   |
| voided_reason         | string         | no       | Reason for voiding (set when status is `voided`)           |
| voided_by             | Id<"users">    | no       | Admin who voided the payout                                |
| voided_at             | number         | no       | Timestamp when voided                                      |
| \_creationTime        | number         | auto     |                                                            |

**Indexes**: `by_guard_user_id`, `by_status`, `by_lead_id`, `by_closure_id`

**Notes**:

- Amount is MANUALLY set by admin per deal. No auto-calculation.
- Prospective bounty on the lead is just a motivational indicator — actual payout may differ.
- Guard does NOT acknowledge payout in app. Admin marks as disbursed.
- Guard sees payout in their earnings history.
- Payout can be voided (`pending` → `voided`) when a linked closure is cancelled. Only `pending` payouts can be auto-voided.

---

## M. Incentive Card

Badge/card awarded to guards for performance.

| Field               | Type                  | Required | Description                                                        |
| ------------------- | --------------------- | -------- | ------------------------------------------------------------------ |
| \_id                | Id<"incentive_cards"> | auto     |                                                                    |
| guard_user_id       | Id<"users">           | yes      |                                                                    |
| card_type           | string                | yes      | `LEAD_SUBMITTER` / `VISIT_HANDLER` / `QUALITY_CHAMPION` / `CUSTOM` |
| level               | string                | yes      | `BRONZE` / `SILVER` / `GOLD` / `PLATINUM`                          |
| awarded_method      | string                | yes      | `AUTO` / `MANUAL`                                                  |
| awarded_reason      | string                | no       | Why this card was awarded                                          |
| awarded_by_admin_id | Id<"users">           | no       | Set if `MANUAL`                                                    |
| is_active           | boolean               | yes      | Can be revoked                                                     |
| \_creationTime      | number                | auto     |                                                                    |

**Indexes**: `by_guard_user_id`, `by_card_type`, `by_guard_and_type` (guard_user_id + card_type)

**Notes**:

- Auto-award thresholds configured in system settings (e.g., 10 verified leads = Bronze Lead Submitter).
- System suggests, admin confirms/overrides.
- Cards are visible on guard's profile and can affect future bounty considerations.

---

## N. Audit Log

Tracks all significant actions on the platform.

| Field          | Type             | Required | Description                                                                                |
| -------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------ |
| \_id           | Id<"audit_logs"> | auto     |                                                                                            |
| actor_user_id  | Id<"users">      | no       | Null when `actor_type` is `SYSTEM`.                                                        |
| actor_type     | string           | yes      | `GUARD` / `ADMIN` / `SYSTEM`                                                               |
| action         | string           | yes      | e.g., `LEADS_INSERT`, `LEADS_UPDATE`, `SOCIETIES_INSERT`, `USERS_UPDATE`, `PAYOUTS_UPDATE` |
| entity_type    | string           | yes      | e.g., `lead`, `visit`, `payout`, `guard_profile`                                           |
| entity_id      | string           | yes      | ID of the affected record                                                                  |
| changes        | object           | no       | `{ field: string, old_value: any, new_value: any }[]`                                      |
| metadata       | object           | no       | Additional context (e.g., IP address, browser)                                             |
| \_creationTime | number           | auto     |                                                                                            |

**Indexes**: `by_actor_user_id`, `by_entity` (entity_type + entity_id compound), `by_action`, `by_entity_type`

Naming convention: `{TABLE_NAME}_{OPERATION}` — see [Constants Reference](13-constants-reference.md).

---

## O. Role (RBAC)

Defines a named set of permissions.

| Field          | Type        | Required | Description                                       |
| -------------- | ----------- | -------- | ------------------------------------------------- |
| \_id           | Id<"roles"> | auto     |                                                   |
| name           | string      | yes      | e.g., "Super Admin", "Ops Agent", "Lead Reviewer" |
| description    | string      | no       |                                                   |
| permissions    | array       | yes      | Array of permission strings (see RBAC doc)        |
| is_system_role | boolean     | yes      | True for built-in roles (can't delete)            |
| is_deleted     | boolean     | yes      | Soft delete flag. Default `false`.                |
| \_creationTime | number      | auto     |                                                   |

**Indexes**: `by_name`

---

## P. User Role Assignment

Links users to roles. A user can have multiple roles.

| Field                | Type                        | Required | Description                        |
| -------------------- | --------------------------- | -------- | ---------------------------------- |
| \_id                 | Id<"user_role_assignments"> | auto     |                                    |
| user_id              | Id<"users">                 | yes      |                                    |
| role_id              | Id<"roles">                 | yes      |                                    |
| assigned_by_admin_id | Id<"users">                 | yes      |                                    |
| is_deleted           | boolean                     | yes      | Soft delete flag. Default `false`. |
| \_creationTime       | number                      | auto     |                                    |

**Indexes**: `by_user_id`, `by_role_id`

---

## Q. System Config

Key-value store for system-wide configuration.

| Field               | Type                | Required | Description                                                                                                                                                                                    |
| ------------------- | ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \_id                | Id<"system_config"> | auto     |                                                                                                                                                                                                |
| key                 | string              | yes      | Includes chat/deal-room keys `chat_batch_window_ms`, `chat_ai_model`, `chat_max_message_length`, `chat_owner_invite_expiry_days`, `chat_pii_fail_action` (plus all other platform config keys) |
| value               | string              | yes      | JSON-encoded value                                                                                                                                                                             |
| updated_by_admin_id | Id<"users">         | yes      |                                                                                                                                                                                                |
| \_creationTime      | number              | auto     |                                                                                                                                                                                                |

**Indexes**: `by_key`

**Default configs**:

- `max_leads_per_guard_per_day`: `5`
- `guard_lead_daily_max`: `10` (P41 GUARD-channel daily cap; legacy `max_leads_per_guard_per_day` remains for P4/P11)
- `dedup_flat_window_days`: `90`
- `dedup_phone_window_days`: `30`
- `incentive_lead_submitter_bronze`: `10`
- `incentive_lead_submitter_silver`: `25`
- `incentive_lead_submitter_gold`: `50`
- `incentive_lead_submitter_platinum`: `100`
- `incentive_visit_handler_bronze`: `10`
- `incentive_visit_handler_silver`: `25`
- `incentive_visit_handler_gold`: `50`
- `incentive_visit_handler_platinum`: `100`
- `incentive_quality_champion_bronze`: `70`
- `incentive_quality_champion_silver`: `80`
- `incentive_quality_champion_gold`: `90`
- `incentive_quality_champion_platinum`: `95`
- `incentive_quality_champion_min_leads`: `10`
- `demorentals_contact_phone`: `""` (10-digit phone number for public listing pages)
- `demorentals_whatsapp_phone`: `""` (10-digit phone for WhatsApp button on listings)
- `referral_guard_bonus_amount`: `50000` (₹500 — fixed bonus for guard-to-guard referral)
- `referral_signup_bonus_default`: `20000` (₹200 — sign-up bonus for DemoRentals referrals)
- `referral_tenant_finding_default`: `100000` (₹1,000 — total tenant-finding bonus)
- `referral_owner_finding_default`: `200000` (₹2,000 — total owner-finding bonus)
- `chat_batch_window_ms`: `5000` (milliseconds to wait before closing a message batch)
- `chat_ai_model`: `"gpt-4o-mini"` (OpenAI model used for message rewriting)
- `chat_max_message_length`: `2000` (hard max chat message length)
- `chat_owner_invite_expiry_days`: `7` (days before owner invite link expires)
- `chat_pii_fail_action`: `"admin_review"` (fallback when PII masking validation fails)

---

## R. Analytics Snapshot

Precomputed analytics metrics captured periodically for dashboard performance.

| Field          | Type                      | Required | Description                   |
| -------------- | ------------------------- | -------- | ----------------------------- |
| \_id           | Id<"analytics_snapshots"> | auto     | Convex document ID            |
| snapshot_date  | string                    | yes      | Format: YYYY-MM-DD            |
| snapshot_type  | string                    | yes      | e.g., "daily_summary"         |
| data           | any                       | yes      | JSON blob of computed metrics |
| \_creationTime | number                    | auto     |                               |

**Indexes**: `by_date` (snapshot_date), `by_type_and_date` (snapshot_type, snapshot_date)

---

## S. Tenant Inquiry

A tenant's visit request or inquiry on an existing published listing. Part of the **tenant inquiry pipeline** — separate from guard-submitted vacancy leads.

| Field                | Type                   | Required | Description                                                                |
| -------------------- | ---------------------- | -------- | -------------------------------------------------------------------------- |
| \_id                 | Id<"tenant_inquiries"> | auto     | Convex document ID                                                         |
| listing_id           | Id<"listings">         | yes      | The published listing this inquiry is about                                |
| tenant_id            | Id<"users">            | no       | Tenant who submitted (user_type: TENANT). Optional for public submissions. |
| tenant_name          | string                 | yes      | Tenant's name (captured at submission)                                     |
| tenant_phone         | string                 | yes      | Tenant's phone (10-digit, captured at submission)                          |
| tenant_email         | string                 | no       | Tenant's email (optional, captured at submission)                          |
| preferred_visit_date | number                 | no       | Unix ms timestamp. Tenant's preferred date.                                |
| preferred_visit_slot | string                 | no       | Free text (e.g., "Morning", "2-4 PM", "Weekday evening")                   |
| message              | string                 | no       | Optional message from tenant                                               |
| status               | string                 | yes      | See [State Machines](04-state-machines.md) — Tenant Inquiry section        |
| bounty_amount        | number                 | no       | Bounty in **paise** offered for this showing                               |
| bounty_posted_at     | number                 | no       | Unix ms when bounty was posted                                             |
| bounty_expires_at    | number                 | no       | Unix ms when bounty expires if unclaimed                                   |
| assigned_guard_id    | Id<"users">            | no       | Guard who accepted the bounty for this visit                               |
| visit_id             | Id<"visits">           | no       | Visit record created when status → VISIT_SCHEDULED                         |
| ops_notes            | string                 | no       | Internal ops notes                                                         |
| rejection_reason     | string                 | no       | Reason if inquiry was rejected                                             |
| reviewed_by_admin_id | Id<"users">            | no       | Admin who reviewed the inquiry                                             |
| updated_at           | number                 | no       | Unix ms of last update                                                     |
| \_creationTime       | number                 | auto     | Submission timestamp                                                       |

**Indexes**: `by_status`, `by_listing_id`, `by_tenant_id`, `by_tenant_and_status` (tenant_id + status), `by_assigned_guard_id`, `by_tenant_phone`

**Status values**: `SUBMITTED`, `REVIEWED`, `BOUNTY_POSTED`, `GUARD_ACCEPTED`, `VISIT_SCHEDULED`, `VISIT_COMPLETED`, `CLOSED`, `REJECTED`, `EXPIRED`

**Key rules**:

- A tenant inquiry attaches to an existing PUBLISHED listing — it does NOT create a new lead.
- Tenant visit requests do NOT auto-schedule. Flow: tenant submits → ops reviews → ops posts bounty → guard accepts → visit happens.
- This is a separate pipeline from guard vacancy leads.
- `tenant_id` is optional to support public submissions; it's set when a tenant authenticates.
- `visit_id` links to the standard `visits` table record created when the inquiry reaches VISIT_SCHEDULED status.

---

## T. Tenant Profile

Extended profile data for authenticated tenants. Separated from User for clean separation of concerns.

| Field          | Type                  | Required | Description                                                                                                          |
| -------------- | --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| \_id           | Id<"tenant_profiles"> | auto     |                                                                                                                      |
| user_id        | Id<"users">           | yes      | Link to user record (user_type: TENANT)                                                                              |
| name           | string                | yes      | Display name                                                                                                         |
| email          | string                | yes      | Google SSO email                                                                                                     |
| phone          | string                | no       | Optional phone (10 digits, added by tenant)                                                                          |
| preferences    | object                | no       | `{ localities: string[], budget_min?: number, budget_max?: number, property_types: string[] }`. Budget in **paise**. |
| saved_listings | array                 | no       | Array of `Id<"listings">`. Tenant's favorites.                                                                       |
| \_creationTime | number                | auto     |                                                                                                                      |

**Indexes**: `by_user_id`

**Notes**:

- Created automatically when a tenant first signs in via Google SSO.
- Preferences are used for future saved-search/notification features (V2). Captured early for data collection.
- `saved_listings` provides the favorites/bookmark feature.

---

## U. Owner Service Request

A property owner's expression of interest in DemoRentals's management services. Submitted via the public contact form — no authentication required.

| Field             | Type                         | Required | Description                                                                |
| ----------------- | ---------------------------- | -------- | -------------------------------------------------------------------------- |
| \_id              | Id<"owner_service_requests"> | auto     |                                                                            |
| name              | string                       | yes      | Owner's name                                                               |
| phone             | string                       | yes      | Owner's phone (10 digits)                                                  |
| email             | string                       | no       | Owner's email                                                              |
| property_type     | string                       | no       | e.g., "1BHK", "2BHK", "3BHK", "Villa"                                      |
| location          | string                       | no       | Property location / society name                                           |
| property_value    | number                       | no       | Approximate property value in **paise**                                    |
| notes             | string                       | no       | Owner's message / additional details                                       |
| status            | string                       | yes      | See [State Machines](04-state-machines.md) — Owner Service Request section |
| ops_notes         | string                       | no       | Internal ops notes from follow-up calls                                    |
| assigned_admin_id | Id<"users">                  | no       | Admin assigned to follow up                                                |
| contacted_at      | number                       | no       | Unix ms when ops first contacted owner                                     |
| \_creationTime    | number                       | auto     | Submission timestamp                                                       |

**Indexes**: `by_status`, `by_phone`, `by_assigned_admin_id`

**Status values**: `SUBMITTED`, `CONTACTED`, `ONBOARDED`, `ACTIVE`, `REJECTED`, `DROPPED`

**Notes**:

- This is a public lead capture form — no auth required to submit.
- After onboarding, ops creates a WorkOS account for the owner (user_type: OWNER).
- V1: contact form + basic status tracking. V2: service plans, ROI calculator, owner dashboard.

---

## V. Support Inquiry

General support inquiries from any persona, submitted via the contact hub.

| Field                    | Type                    | Required | Description                                    |
| ------------------------ | ----------------------- | -------- | ---------------------------------------------- |
| \_id                     | Id<"support_inquiries"> | auto     |                                                |
| name                     | string                  | yes      | Inquirer's name                                |
| phone                    | string                  | no       | Phone (10 digits)                              |
| email                    | string                  | yes      | Email                                          |
| subject                  | string                  | yes      | Subject line                                   |
| message                  | string                  | yes      | Inquiry message                                |
| preferred_contact_method | string                  | no       | `WHATSAPP` / `PHONE` / `EMAIL` / `IN_APP`      |
| persona_type             | string                  | no       | `GUARD` / `TENANT` / `OWNER` / `OTHER`         |
| source_channel           | string                  | no       | Which page/channel the inquiry came from       |
| status                   | string                  | yes      | `OPEN` / `IN_PROGRESS` / `RESOLVED` / `CLOSED` |
| assigned_admin_id        | Id<"users">             | no       | Admin handling this inquiry                    |
| \_creationTime           | number                  | auto     |                                                |

**Indexes**: `by_status`, `by_persona_type`, `by_assigned_admin_id`

**Notes**:

- Public form — no auth required to submit.
- Ops team manages the queue from the admin panel.

---

## W. Newsletter Subscription

Email capture from newsletter signup forms across public pages.

| Field         | Type                           | Required | Description                                                                       |
| ------------- | ------------------------------ | -------- | --------------------------------------------------------------------------------- |
| \_id          | Id<"newsletter_subscriptions"> | auto     |                                                                                   |
| email         | string                         | yes      | Subscriber email                                                                  |
| subscribed_at | number                         | yes      | Unix ms timestamp                                                                 |
| source_page   | string                         | no       | Which page the signup came from (e.g., "homepage", "contact_hub", "how_it_works") |

**Indexes**: `by_email`

**Notes**:

- Simple email capture. No auth required.
- De-duplicate by email on insert (upsert behavior).

---

## X. Listing Roommate Profile

Roommate profiles associated with a listing. Displayed on the property detail page for shared accommodations.

| Field          | Type                            | Required | Description                                                          |
| -------------- | ------------------------------- | -------- | -------------------------------------------------------------------- |
| \_id           | Id<"listing_roommate_profiles"> | auto     |                                                                      |
| listing_id     | Id<"listings">                  | yes      | Parent listing                                                       |
| name_alias     | string                          | yes      | Display name or alias (e.g., "Priya S.")                             |
| age_range      | string                          | no       | e.g., "25-30"                                                        |
| gender         | string                          | no       | Free-text gender marker used in profile cards                        |
| profession     | string                          | no       | e.g., "Software Engineer"                                            |
| lifestyle_tags | array                           | no       | Array of strings (e.g., ["early_riser", "vegetarian", "non_smoker"]) |
| bio            | string                          | no       | Short free-text profile bio                                          |
| move_in_date   | number                          | no       | Unix ms move-in date                                                 |
| is_deleted     | boolean                         | yes      | Soft delete flag. Default `false`.                                   |
| \_creationTime | number                          | auto     |                                                                      |

**Indexes**: `by_listing_id` (compound: `listing_id` + `is_deleted`)

**Notes**:

- Created by admin when setting up shared-accommodation listings.
- Only relevant for listings where roommates are already present.

---

## Y. Listing Commute Landmark

Pre-configured commute distance/time data for a listing. Displayed on the property detail page's commute calculator section.

| Field          | Type                            | Required | Description                                                           |
| -------------- | ------------------------------- | -------- | --------------------------------------------------------------------- |
| \_id           | Id<"listing_commute_landmarks"> | auto     |                                                                       |
| listing_id     | Id<"listings">                  | yes      | Parent listing                                                        |
| name           | string                          | yes      | Landmark name (e.g., "Manyata Tech Park", "Indiranagar Metro")        |
| category       | string                          | yes      | Category key rendered by commute cards (`workplace`, `transit`, etc.) |
| distance_km    | number                          | yes      | Numeric distance in kilometers                                        |
| time_minutes   | number                          | no       | Optional travel time estimate in minutes                              |
| transport_mode | string                          | no       | Optional mode label from source data                                  |
| is_deleted     | boolean                         | yes      | Soft delete flag. Default `false`.                                    |
| \_creationTime | number                          | auto     |                                                                       |

**Indexes**: `by_listing_id` (compound: `listing_id` + `is_deleted`)

**Notes**:

- Pre-populated by admin (or batch-computed). Not user-generated.
- Displayed in the commute calculator section of property detail pages.

---

## Z. Referral Code

One code per DemoRentals user (tenant or owner). Auto-generated on first sign-up. Used for shareable referral URLs.

| Field          | Type                 | Required | Description                        |
| -------------- | -------------------- | -------- | ---------------------------------- |
| \_id           | Id<"referral_codes"> | auto     | Convex document ID                 |
| user_id        | Id<"users">          | yes      | Code owner                         |
| code           | string               | yes      | Unique code (format: `FLAT-XXXXX`) |
| is_active      | boolean              | yes      | Admin can deactivate               |
| \_creationTime | number               | auto     | Convex auto-generated              |

**Indexes**: `by_user_id`, `by_code`

**Notes**:

- One code per user. Format: `FLAT-XXXXX` (5 uppercase alphanumeric). Globally unique.
- Deactivated codes can't be used for new sign-ups but existing referrals remain valid.
- Auto-generated on first DemoRentals sign-up (tenant or owner). Guards do not have referral codes.

---

## AA. Referral

Tracks a referral relationship between two users. One referrer per referred user.

| Field                  | Type                 | Required | Description                                                             |
| ---------------------- | -------------------- | -------- | ----------------------------------------------------------------------- |
| \_id                   | Id<"referrals">      | auto     | Convex document ID                                                      |
| referrer_user_id       | Id<"users">          | yes      | Who referred                                                            |
| referred_user_id       | Id<"users">          | yes      | Who was referred                                                        |
| referral_code_id       | Id<"referral_codes"> | no       | DemoRentals referral code used (null for guard referrals)                   |
| referral_type          | string               | yes      | `TENANT_FINDING` / `OWNER_FINDING` / `GUARD`                            |
| status                 | string               | yes      | `PENDING` / `QUALIFIED` / `PARTIALLY_PAID` / `FULLY_PAID` / `VOIDED`    |
| lead_id                | Id<"leads">          | no       | For guard referrals: the first verified lead                            |
| listing_id             | Id<"listings">       | no       | Associated listing                                                      |
| closure_id             | Id<"closures">       | no       | Associated closure                                                      |
| building_id            | Id<"buildings">      | no       | Building context used for scoped config resolution and payout amounting |
| society_id             | Id<"societies">      | no       | Society context used for scoped config resolution and payout amounting  |
| attributed_by_admin_id | Id<"users">          | no       | Admin who applied an attribution override                               |
| attributed_at          | number               | no       | Unix ms when admin attribution was applied                              |
| attribution_source     | string               | no       | Attribution origin metadata (e.g., `admin_override`)                    |
| voided_reason          | string               | no       | Why voided (if applicable)                                              |
| voided_by_admin_id     | Id<"users">          | no       | Admin who voided                                                        |
| \_creationTime         | number               | auto     | Convex auto-generated                                                   |

**Indexes**: `by_referrer_user_id`, `by_referred_user_id`, `by_referral_type`, `by_status`, `by_closure_id`

**Notes**:

- One active referral per referred user. Landing-page capture follows last-click-wins before persistence; after attribution is created, admin override is the only way to change it.
- Guard referrals tracked by phone number only (no referral code). Tenants and owners never see the guard referral program.
- `VOIDED` is terminal — voided referrals cannot be reinstated. Admin must provide reason.
- See [State Machines](04-state-machines.md) for status transitions.
- See [Referral System](features/17-referral-system.md) for full business rules.

---

## AB. Referral Milestone

Tracks payout milestones within a referral. Separate from the guard payouts table.

| Field                | Type                      | Required | Description                                                                |
| -------------------- | ------------------------- | -------- | -------------------------------------------------------------------------- |
| \_id                 | Id<"referral_milestones"> | auto     | Convex document ID                                                         |
| referral_id          | Id<"referrals">           | yes      | Parent referral                                                            |
| milestone_type       | string                    | yes      | `SIGN_UP` / `LISTING_PUBLISHED` / `DEAL_CLOSED` / `FIRST_VERIFIED_LEAD`    |
| amount               | number                    | yes      | Payout amount in **paise**                                                 |
| status               | string                    | yes      | `PENDING` / `TRIGGERED` / `APPROVED` / `PAID` / `VOIDED`                   |
| source_event         | string                    | no       | Idempotency key for trigger dedup (e.g., `listing_published:{listing_id}`) |
| triggered_at         | number                    | no       | Unix ms — when milestone event occurred                                    |
| approved_by_admin_id | Id<"users">               | no       | Admin who approved payout                                                  |
| paid_at              | number                    | no       | Unix ms — when money was disbursed                                         |
| payout_method        | string                    | no       | `CASH` / `UPI` / `BANK_TRANSFER`                                           |
| voided_reason        | string                    | no       | Why voided                                                                 |
| \_creationTime       | number                    | auto     | Convex auto-generated                                                      |

**Indexes**: `by_referral_id`, `by_referral_and_source_event`, `by_status`, `by_milestone_type`

**Notes**:

- Milestones have their own payout lifecycle (`TRIGGERED` → `APPROVED` → `PAID`), separate from the guard `payouts` table.
- Idempotency via `source_event` key (e.g., `lead_verified:{lead_id}`) prevents double-triggering from event replays or cron retries.
- Amount in paise (integer × 100). Admin approval required before payment.
- System triggers milestones automatically; admin confirms before payment.

---

## AC. Referral Config

Configurable bonus amounts per referral type and scope. Supports per-society and per-building overrides.

| Field               | Type                  | Required | Description                                                                                                                                                                                                                                           |
| ------------------- | --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \_id                | Id<"referral_config"> | auto     | Convex document ID                                                                                                                                                                                                                                    |
| referral_type       | string                | yes      | `TENANT_FINDING` / `OWNER_FINDING` / `GUARD`                                                                                                                                                                                                          |
| scope_type          | string                | yes      | `GLOBAL` / `SOCIETY` / `BUILDING`                                                                                                                                                                                                                     |
| scope_id            | string                | no       | `Id<"societies">` or `Id<"buildings">` depending on scope_type. Stored as string in Convex. Validation: when scope_type is SOCIETY, must be a valid society ID; when BUILDING, must be a valid building ID. Mutations validate referential integrity. |
| sign_up_bonus       | number                | yes      | Sign-up bonus amount in **paise**                                                                                                                                                                                                                     |
| finding_bonus_total | number                | yes      | Total finding bonus in **paise**                                                                                                                                                                                                                      |
| publish_split_pct   | number                | yes      | % paid on listing publish (default: 30)                                                                                                                                                                                                               |
| closure_split_pct   | number                | yes      | % paid on deal closure (default: 70)                                                                                                                                                                                                                  |
| is_active           | boolean               | yes      | Whether this config is active                                                                                                                                                                                                                         |
| updated_by_admin_id | Id<"users">           | yes      | Last admin to update                                                                                                                                                                                                                                  |
| \_creationTime      | number                | auto     | Convex auto-generated                                                                                                                                                                                                                                 |

**Indexes**: `by_referral_type`, `by_scope` (scope_type + scope_id compound)

**Notes**:

- Override precedence: Building config > Society config > Global config. System resolves the most specific active config.
- `scope_id` validation: when `SOCIETY`, must reference a valid non-deleted society; when `BUILDING`, must reference a valid non-deleted building.
- Default amounts: ₹200 sign-up, ₹1,000 tenant-finding, ₹2,000 owner-finding, ₹500 guard referral.
- See [Referral System](features/17-referral-system.md) for full configuration rules.

---

## AD. Chat Channel

A communication channel for a tenant inquiry. Admin/OPS opened.

| Field               | Type                   | Required | Description                         |
| ------------------- | ---------------------- | -------- | ----------------------------------- |
| \_id                | Id<"chat_channels">    | auto     | Convex document ID                  |
| inquiry_id          | Id<"tenant_inquiries"> | yes      | Scoped to one inquiry               |
| status              | string                 | yes      | `ACTIVE` / `ARCHIVED`               |
| created_by_admin_id | Id<"users">            | yes      | Backoffice user who created channel |
| created_at          | number                 | yes      | Unix ms                             |
| \_creationTime      | number                 | auto     | Convex auto-generated               |

**Indexes**: `by_inquiry_id`, `by_status`

**Notes**:

- One active channel per inquiry at a time is enforced by channel create/reopen logic.
- Archive/reopen is permission-gated via `chat.admin`.
- Participant access is derived from inquiry/listing/owner relationships, not stored on channel.

---

## AD2. Owner Invite

Invite token lifecycle for onboarding owner access into the deal room channel.

| Field                | Type                   | Required | Description                                        |
| -------------------- | ---------------------- | -------- | -------------------------------------------------- |
| \_id                 | Id<"owner_invites">    | auto     | Convex document ID                                 |
| inquiry_id           | Id<"tenant_inquiries"> | yes      | Inquiry scope                                      |
| channel_id           | Id<"chat_channels">    | yes      | Channel scope                                      |
| invite_token         | string                 | yes      | Opaque token used in invite URLs                   |
| owner_expected_email | string                 | no       | Optional email lock for invite consumption         |
| identity_verified    | boolean                | no       | Set on consume when email-bound identity matches   |
| status               | string                 | yes      | `PENDING` / `CONSUMED` / `EXPIRED` / `REGENERATED` |
| expires_at           | number                 | yes      | Unix ms                                            |
| consumed_at          | number                 | no       | Unix ms                                            |
| consumed_by_user_id  | Id<"users">            | no       | Consuming user                                     |
| created_by_admin_id  | Id<"users">            | yes      | Invite creator                                     |
| created_at           | number                 | yes      | Unix ms                                            |

**Indexes**: `by_token`, `by_inquiry_id`, `by_inquiry_and_status`, `by_status`, `by_status_expires`

---

## AE. Chat Message

Individual message in a chat channel.

| Field                    | Type                       | Required | Description                                                     |
| ------------------------ | -------------------------- | -------- | --------------------------------------------------------------- |
| \_id                     | Id<"chat_messages">        | auto     | Convex document ID                                              |
| channel_id               | Id<"chat_channels">        | yes      | Parent channel                                                  |
| sender_user_id           | Id<"users">                | yes      | Sender                                                          |
| sender_role              | string                     | yes      | `TENANT` / `OWNER` / `OPS` / `SYSTEM`                           |
| original_content         | string                     | yes      | Raw message payload                                             |
| masked_content           | string                     | no       | AI-processed or direct delivered content                        |
| batch_id                 | Id<"chat_message_batches"> | no       | Batch linkage when applicable                                   |
| status                   | string                     | yes      | `SUBMITTED` / `BATCHED` / `PROCESSING` / `DELIVERED` / `FAILED` |
| failure_reason           | string                     | no       | Failure detail when status is `FAILED`                          |
| admin_review_required    | boolean                    | yes      | Marks manual moderation requirement                             |
| is_ai_processed          | boolean                    | yes      | AI pipeline processed flag                                      |
| is_impersonated          | boolean                    | no       | True for admin impersonation sends                              |
| impersonated_by_admin_id | Id<"users">                | no       | Admin actor for impersonated sends                              |
| is_deleted               | boolean                    | no       | Soft-delete style display suppression                           |
| created_at               | number                     | yes      | Unix ms                                                         |
| delivered_at             | number                     | no       | Unix ms for delivered messages                                  |

**Indexes**: `by_channel_id`, `by_batch_id`, `by_status`, `by_channel_and_created`, `by_channel_delivered`

---

## AF. Chat Message Batch

Groups rapid-fire messages for one sender into one AI processing unit.

| Field                 | Type                       | Required | Description                                          |
| --------------------- | -------------------------- | -------- | ---------------------------------------------------- |
| \_id                  | Id<"chat_message_batches"> | auto     | Convex document ID                                   |
| channel_id            | Id<"chat_channels">        | yes      | Parent channel                                       |
| sender_user_id        | Id<"users">                | yes      | Sender                                               |
| messages              | array                      | yes      | Array of `Id<"chat_messages">`                       |
| combined_original     | string                     | yes      | Combined text fed to AI                              |
| masked_content        | string                     | no       | AI output                                            |
| pii_detected          | array                      | no       | Detected PII category labels                         |
| status                | string                     | yes      | `COLLECTING` / `PROCESSING` / `DELIVERED` / `FAILED` |
| failure_reason        | string                     | no       | Failure detail                                       |
| created_at            | number                     | yes      | Unix ms                                              |
| processing_started_at | number                     | no       | Unix ms                                              |
| processed_at          | number                     | no       | Unix ms                                              |

**Indexes**: `by_channel_id`, `by_status`, `by_channel_sender_status`, `by_channel_and_created`

---

## AG. Deal Checklist

Deal terms checklist scoped to inquiry + channel with item-level bilateral approvals.

| Field               | Type                   | Required | Description                                                               |
| ------------------- | ---------------------- | -------- | ------------------------------------------------------------------------- |
| \_id                | Id<"deal_checklists">  | auto     | Convex document ID                                                        |
| inquiry_id          | Id<"tenant_inquiries"> | yes      | Parent inquiry                                                            |
| channel_id          | Id<"chat_channels">    | yes      | Parent chat channel                                                       |
| version             | number                 | yes      | Version number                                                            |
| previous_version_id | Id<"deal_checklists">  | no       | Back-reference when regenerated                                           |
| items               | array                  | yes      | Structured items with source, values, approvals, status                   |
| status              | string                 | yes      | `DRAFT` / `SHARED` / `IN_REVIEW` / `APPROVED` / `DISPUTED` / `SUPERSEDED` |
| created_by_admin_id | Id<"users">            | yes      | Creator                                                                   |
| created_at          | number                 | yes      | Unix ms                                                                   |
| shared_at           | number                 | no       | Unix ms                                                                   |
| approved_at         | number                 | no       | Unix ms                                                                   |

**Indexes**: `by_inquiry_id`, `by_channel_id`, `by_status`, `by_inquiry_and_version`

---

## AH. Deal Checklist Signature

Records formal sign-off entries per checklist.

| Field          | Type                            | Required | Description                                          |
| -------------- | ------------------------------- | -------- | ---------------------------------------------------- |
| \_id           | Id<"deal_checklist_signatures"> | auto     | Convex document ID                                   |
| checklist_id   | Id<"deal_checklists">           | yes      | Checklist reference                                  |
| signer_user_id | Id<"users">                     | yes      | Signer                                               |
| signer_role    | string                          | yes      | `TENANT` / `OWNER`                                   |
| signature_hash | string                          | yes      | SHA-256 canonical hash of resolved checklist payload |
| signed_at      | number                          | yes      | Unix ms                                              |
| ip_address     | string                          | no       | Optional signer IP capture                           |

**Indexes**: `by_checklist_id`, `by_signer` (`signer_user_id`, `checklist_id`)

---

## AI. Chat Read Receipt

Tracks last-read timestamp per user per channel for unread count calculation.

| Field          | Type                     | Required | Description                                      |
| -------------- | ------------------------ | -------- | ------------------------------------------------ |
| \_id           | Id<"chat_read_receipts"> | auto     | Convex document ID                               |
| channel_id     | Id<"chat_channels">      | yes      | Which channel                                    |
| user_id        | Id<"users">              | yes      | Who read                                         |
| last_read_at   | number                   | yes      | Unix ms — timestamp of last message they've seen |
| \_creationTime | number                   | auto     | Convex auto-generated                            |

**Indexes**: `by_channel_and_user` (compound: channel_id + user_id — unique per user per channel)

**Notes**:

- Updated on every chat view/focus event via `chatReadReceipts.markRead()`.
- Unread count = `DELIVERED` batches with `delivered_at > last_read_at` where sender ≠ current user.
- One record per user per channel (upsert behavior on update).

---

## AJ. Negotiation

A rent negotiation between a prospective tenant and property owner, mediated by DemoRentals ops. Created after a visit completes with outcome `INTERESTED`. Gates closure — no closure can be confirmed until the negotiation reaches `READY_FOR_CLOSURE`. See [Rent Negotiation](features/19-rent-negotiation.md) for the full workflow.

| Field                      | Type                              | Required | Description                                                                                                                               |
| -------------------------- | --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| \_id                       | Id<"negotiations">                | auto     | Convex document ID                                                                                                                        |
| tenant_inquiry_id          | Id<"tenant_inquiries">            | yes      | Source inquiry (links to listing, tenant, visit)                                                                                          |
| listing_id                 | Id<"listings">                    | yes      | Denormalized from inquiry                                                                                                                 |
| tenant_user_id             | Id<"users">                       | yes      | Tenant participant                                                                                                                        |
| owner_user_id              | Id<"users">                       | no       | Owner participant (null until owner accepts invite)                                                                                       |
| initiated_by_admin_id      | Id<"users">                       | yes      | Ops agent who started the negotiation                                                                                                     |
| status                     | string                            | yes      | See [State Machines](04-state-machines.md) — Negotiation Status section                                                                   |
| failure_reason             | string                            | no       | Required when status is `FAILED`. See `NEGOTIATION_FAILURE_REASON` enum.                                                                  |
| failure_notes              | string                            | no       | Additional context for failure                                                                                                            |
| ops_tenant_channel_id      | Id<"chat_channels">               | no       | OPS_TENANT room (created on initiation)                                                                                                   |
| ops_owner_channel_id       | Id<"chat_channels">               | no       | OPS_OWNER room (created when ops opens it)                                                                                                |
| combined_channel_id        | Id<"chat_channels">               | no       | COMBINED room (created when ops opens it)                                                                                                 |
| active_proposal_id         | Id<"negotiation_terms_proposals"> | no       | Current active proposal (latest version)                                                                                                  |
| police_verification_status | string                            | no       | `NOT_STARTED` / `INITIATED` / `PENDING` / `COMPLETE` (default `NOT_STARTED`). Part of mandatory checklist.                                |
| society_noc_status         | string                            | no       | `NOT_STARTED` / `APPLIED` / `PENDING` / `APPROVED` / `REJECTED` (default `NOT_STARTED`). Part of mandatory checklist.                     |
| owner_kyc_status           | string                            | no       | `NOT_STARTED` / `DOCUMENTS_REQUESTED` / `DOCUMENTS_RECEIVED` / `VERIFIED` (default `NOT_STARTED`). Owner property/KYC checklist tracking. |
| agreement_drafting_status  | string                            | no       | `NOT_STARTED` / `DRAFT_SENT` / `REVIEW` / `SIGNED` / `UPLOADED` (default `NOT_STARTED`). Rent agreement drafting lifecycle tracking.      |
| stamp_registration_status  | string                            | no       | `NOT_STARTED` / `STAMP_PURCHASED` / `NOTARIZED` / `REGISTERED` (default `NOT_STARTED`). Stamp duty and registration tracking.             |
| rent_agreement_storage_id  | Id<"\_storage">                   | no       | Uploaded rent agreement PDF. Mandatory before closure.                                                                                    |
| initiated_at               | number                            | yes      | Unix ms — when negotiation was created                                                                                                    |
| terms_agreed_at            | number                            | no       | Unix ms — when both parties signed                                                                                                        |
| ready_for_closure_at       | number                            | no       | Unix ms — when all checklist items completed                                                                                              |
| failed_at                  | number                            | no       | Unix ms — when marked failed                                                                                                              |
| last_activity_at           | number                            | yes      | Unix ms — updated on any action (for stale detection)                                                                                     |
| stale_flagged              | boolean                           | yes      | `true` if system auto-flagged for inactivity                                                                                              |
| rounds_flagged             | boolean                           | yes      | `true` if system auto-flagged for too many proposal rounds                                                                                |

**Indexes**: `by_tenant_inquiry_id`, `by_listing_id`, `by_tenant_user_id`, `by_owner_user_id`, `by_status`, `by_initiated_by_admin_id`, `by_last_activity_at`, `by_stale_flagged`

**Key rules**:

- One negotiation per `tenant_inquiries` record. Multiple tenants can have simultaneous active negotiations on the same listing.
- Only visits with `outcome: INTERESTED` can trigger a negotiation.
- Closure creation is blocked unless the linked negotiation is `READY_FOR_CLOSURE`.
- See [State Machines](04-state-machines.md) for the full status transition table.

---

## AK. Negotiation Terms Proposal

A versioned structured terms proposal within a negotiation. Ops creates proposals; only ops can create or update them. Full history is preserved — nothing is overwritten. See [Rent Negotiation](features/19-rent-negotiation.md) for proposal lifecycle rules.

| Field                   | Type                              | Required | Description                                                                                                                                                                                  |
| ----------------------- | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \_id                    | Id<"negotiation_terms_proposals"> | auto     | Convex document ID                                                                                                                                                                           |
| negotiation_id          | Id<"negotiations">                | yes      | Parent negotiation                                                                                                                                                                           |
| version                 | number                            | yes      | Incrementing version number (1, 2, 3, ...)                                                                                                                                                   |
| status                  | string                            | yes      | Lifecycle status of this proposal version. See `PROPOSAL_STATUS` enum (`DRAFT` / `SENT` / `COUNTERED` / `ACCEPTED_TENANT` / `ACCEPTED_OWNER` / `ACCEPTED_BOTH` / `REJECTED` / `SUPERSEDED`). |
| monthly_rent            | number                            | yes      | Monthly rent in **paise**                                                                                                                                                                    |
| security_deposit        | number                            | yes      | Security deposit in **paise**                                                                                                                                                                |
| security_deposit_months | number                            | yes      | Deposit expressed as months of rent (informational)                                                                                                                                          |
| lock_in_period_months   | number                            | yes      | Lock-in period in months                                                                                                                                                                     |
| notice_period_months    | number                            | yes      | Notice period in months                                                                                                                                                                      |
| move_in_date            | number                            | yes      | Target move-in date (Unix ms)                                                                                                                                                                |
| maintenance_charges     | number                            | yes      | Monthly maintenance in **paise**                                                                                                                                                             |
| maintenance_paid_by     | string                            | yes      | `TENANT` / `OWNER` / `SPLIT`                                                                                                                                                                 |
| rent_escalation_type    | string                            | yes      | `PERCENTAGE` / `FIXED_AMOUNT` / `NONE`                                                                                                                                                       |
| rent_escalation_value   | number                            | yes      | Annual escalation value (percentage or paise). Zero if `NONE`.                                                                                                                               |
| furnishing_terms        | string                            | yes      | Free text: inclusions, painting, owner provisions                                                                                                                                            |
| brokerage_tenant_side   | number                            | yes      | Brokerage from tenant in **paise**                                                                                                                                                           |
| brokerage_owner_side    | number                            | yes      | Brokerage from owner in **paise**                                                                                                                                                            |
| token_advance_amount    | number                            | yes      | Token advance in **paise**                                                                                                                                                                   |
| special_conditions      | string                            | no       | Free text: no pets, parking, visitor policy, etc.                                                                                                                                            |
| created_by_admin_id     | Id<"users">                       | yes      | Ops agent who created this version                                                                                                                                                           |
| created_at              | number                            | yes      | Unix ms                                                                                                                                                                                      |
| shared_to_rooms         | array                             | no       | Room types this proposal was shared into (e.g., `["OPS_TENANT", "COMBINED"]`)                                                                                                                |
| shared_at               | number                            | no       | Unix ms — when first shared                                                                                                                                                                  |
| is_locked               | boolean                           | yes      | `true` after both parties sign. No edits permitted.                                                                                                                                          |
| locked_at               | number                            | no       | Unix ms — when locked                                                                                                                                                                        |

**Indexes**: `by_negotiation_id`, `by_negotiation_and_version` (compound: negotiation_id + version)

**Key rules**:

- All money fields in paise (integer × 100). Frontend displays in rupees.
- Once `is_locked: true`, no fields can be modified. A new version must be created.
- `shared_to_rooms` records which rooms the proposal was shared into — ops may share different versions to different rooms in private rooms (normal brokering). Combined room proposals must reflect actual agreed terms.

---

## AL. Negotiation Terms Signature

Records formal sign-off on a terms proposal by tenant or owner. Permanent — never deleted.

| Field            | Type                               | Required | Description                                                       |
| ---------------- | ---------------------------------- | -------- | ----------------------------------------------------------------- |
| \_id             | Id<"negotiation_terms_signatures"> | auto     | Convex document ID                                                |
| proposal_id      | Id<"negotiation_terms_proposals">  | yes      | Which proposal was signed                                         |
| negotiation_id   | Id<"negotiations">                 | yes      | Denormalized for query convenience                                |
| user_id          | Id<"users">                        | yes      | Who signed                                                        |
| user_role        | string                             | yes      | `TENANT` / `OWNER`                                                |
| signed_at        | number                             | yes      | Unix ms                                                           |
| agreement_text   | string                             | yes      | Static text: "I agree to all terms as recorded in this proposal." |
| proposal_version | number                             | yes      | Snapshot of version number at signing time                        |

**Indexes**: `by_proposal_id`, `by_negotiation_id`, `by_user_id`, `by_proposal_and_user` (compound: proposal_id + user_id — unique per user per proposal)

**Key rules**:

- Signatures are permanent — never deleted, never modified.
- Both parties (TENANT + OWNER) must sign before negotiation can advance to `TERMS_AGREED`.
- `proposal_version` tracked to prevent signing stale proposals.
- When both signatures exist for a proposal: `is_locked: true` is set on the proposal, and negotiation status advances to `TERMS_AGREED`.

---

## AM. Negotiation Token Record

Records the token advance (earnest money) collected by DemoRentals as part of a negotiation. One record per negotiation.

| Field                 | Type                            | Required | Description                                                                     |
| --------------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------- |
| \_id                  | Id<"negotiation_token_records"> | auto     | Convex document ID                                                              |
| negotiation_id        | Id<"negotiations">              | yes      | Parent negotiation                                                              |
| amount                | number                          | yes      | Token amount in **paise**                                                       |
| collected_at          | number                          | yes      | Unix ms — when collected                                                        |
| collection_method     | string                          | yes      | `UPI` / `CASH` / `BANK_TRANSFER`                                                |
| refund_policy         | string                          | yes      | `NON_REFUNDABLE` / `REFUNDABLE_WITHIN_DAYS` / `PARTIAL_REFUND` / `CASE_BY_CASE` |
| refund_days           | number                          | no       | Days window (only for `REFUNDABLE_WITHIN_DAYS`)                                 |
| refund_percentage     | number                          | no       | Percentage (only for `PARTIAL_REFUND`)                                          |
| tenant_agreed_at      | number                          | yes      | Unix ms — when tenant agreed to refund policy                                   |
| status                | string                          | yes      | `PENDING` / `COLLECTED` / `REFUNDED` / `FORFEITED` / `DISPUTED`                 |
| collected_by_admin_id | Id<"users">                     | yes      | Ops agent who recorded the collection                                           |
| notes                 | string                          | no       | Optional notes                                                                  |

**Indexes**: `by_negotiation_id`, `by_status`

**Key rules**:

- One token record per negotiation. Token must be recorded before the post-agreement checklist can advance to `DOCUMENTATION_IN_PROGRESS`.
- Tenant must explicitly agree to the refund policy before token is recorded (`tenant_agreed_at` is mandatory).
- `refund_days` only required when `refund_policy` is `REFUNDABLE_WITHIN_DAYS`. `refund_percentage` only required when `refund_policy` is `PARTIAL_REFUND`.
- Amount in paise (integer × 100). Frontend displays in rupees.

---

## Phase 35: Notification Entities

> **Convex type mapping**: Fields described as `object` in this document map to `v.any()` in `convex/schema.ts` validators. This is the standard Convex pattern for arbitrary JSON payloads.

### AT. Notification Preference

| Field               | Type                           | Required | Description                                 |
| ------------------- | ------------------------------ | -------- | ------------------------------------------- |
| `_id`               | Id<"notification_preferences"> | auto     | Convex document ID                          |
| `user_id`           | Id<"users">                    | yes      | Target user                                 |
| `channel_push`      | boolean                        | yes      | Push notifications enabled                  |
| `channel_whatsapp`  | boolean                        | yes      | WhatsApp notifications enabled              |
| `channel_sms`       | boolean                        | yes      | SMS notifications enabled                   |
| `channel_email`     | boolean                        | yes      | Email notifications enabled                 |
| `categories`        | object                         | yes      | Per-category enable/disable flags           |
| `quiet_hours_start` | string                         | no       | `"HH:MM"` format quiet hours start          |
| `quiet_hours_end`   | string                         | no       | `"HH:MM"` format quiet hours end            |
| `timezone`          | string                         | no       | IANA timezone, defaults to `"Asia/Kolkata"` |
| `locale`            | string                         | no       | Preferred notification locale               |

**Indexes**: `by_user_id`

---

### AU. Notification Event

| Field          | Type                      | Required | Description                                    |
| -------------- | ------------------------- | -------- | ---------------------------------------------- |
| `_id`          | Id<"notification_events"> | auto     | Convex document ID                             |
| `user_id`      | Id<"users">               | yes      | Target user                                    |
| `event_type`   | string                    | yes      | Event type identifier                          |
| `category`     | string                    | yes      | Notification category                          |
| `severity`     | string                    | yes      | `NORMAL` / `IMPORTANT` / `URGENT`              |
| `payload`      | object                    | yes      | Event-specific data for template interpolation |
| `dedup_key`    | string                    | no       | Dedup key for 5-minute dedup window            |
| `processed`    | boolean                   | yes      | Whether event has been processed               |
| `processed_at` | number                    | no       | Unix ms                                        |

**Indexes**: `by_user_id`, `by_processed`, `by_dedup_key`

---

### AV. Notification Template

| Field            | Type                         | Required | Description                           |
| ---------------- | ---------------------------- | -------- | ------------------------------------- |
| `_id`            | Id<"notification_templates"> | auto     | Convex document ID                    |
| `event_type`     | string                       | yes      | Event type this template handles      |
| `channel`        | string                       | yes      | `PUSH` / `WHATSAPP` / `SMS` / `EMAIL` |
| `locale`         | string                       | yes      | Locale code (`en`, `hi`, `hinglish`)  |
| `title_template` | string                       | yes      | ICU MessageFormat title template      |
| `body_template`  | string                       | yes      | ICU MessageFormat body template       |
| `is_active`      | boolean                      | yes      | Whether template is in use            |
| `updated_by`     | Id<"users">                  | no       | Last editor                           |

**Indexes**: `by_event_type_channel_locale`

---

### AW. Notification

| Field          | Type                      | Required | Description                                          |
| -------------- | ------------------------- | -------- | ---------------------------------------------------- |
| `_id`          | Id<"notifications">       | auto     | Convex document ID                                   |
| `user_id`      | Id<"users">               | yes      | Recipient                                            |
| `event_id`     | Id<"notification_events"> | no       | Source event link                                    |
| `channel`      | string                    | yes      | `PUSH` / `WHATSAPP` / `SMS` / `EMAIL` / `IN_APP`     |
| `title`        | string                    | yes      | Rendered title                                       |
| `body`         | string                    | yes      | Rendered body                                        |
| `status`       | string                    | yes      | `PENDING` / `SENT` / `DELIVERED` / `FAILED` / `READ` |
| `retry_count`  | number                    | yes      | Current retry attempt count                          |
| `max_retries`  | number                    | yes      | Maximum retry attempts                               |
| `last_error`   | string                    | no       | Last delivery error message                          |
| `delivered_at` | number                    | no       | Unix ms                                              |
| `read_at`      | number                    | no       | Unix ms                                              |
| `action_url`   | string                    | no       | Deep link URL for notification tap                   |
| `metadata`     | object                    | no       | Additional data payload                              |

**Indexes**: `by_user_id_status`, `by_channel_status`, `by_user_id_read`

---

### AX_push. Push Subscription

> **Note**: Entity letter AX is reserved for P37 Resident Profile. This entity is numbered AW-bis to avoid re-lettering.

| Field         | Type                     | Required | Description                     |
| ------------- | ------------------------ | -------- | ------------------------------- |
| `_id`         | Id<"push_subscriptions"> | auto     | Convex document ID              |
| `user_id`     | Id<"users">              | yes      | Subscription owner              |
| `endpoint`    | string                   | yes      | Push service endpoint URL       |
| `keys_p256dh` | string                   | yes      | P-256 Diffie-Hellman public key |
| `keys_auth`   | string                   | yes      | Auth secret                     |
| `user_agent`  | string                   | no       | Browser user agent string       |
| `is_active`   | boolean                  | yes      | Whether subscription is active  |
| `created_at`  | number                   | yes      | Unix ms                         |

**Indexes**: `by_user_id`, `by_endpoint`

---

## Phase 36: Monetization Entities

### AN. Transaction Fee

| Field                 | Type                   | Required | Description                                              |
| --------------------- | ---------------------- | -------- | -------------------------------------------------------- |
| `_id`                 | Id<"transaction_fees"> | auto     | Convex document ID                                       |
| `slab_key`            | string                 | yes      | `LT_20K` / `BT_20K_40K` / `BT_40K_80K` / `GT_80K_CUSTOM` |
| `min_rent_paise`      | number                 | yes      | Inclusive lower bound                                    |
| `max_rent_paise`      | number                 | no       | Exclusive upper bound where applicable                   |
| `fee_paise`           | number                 | no       | Fixed fee in paise (required for non-custom slabs)       |
| `is_custom_quote`     | boolean                | yes      | Whether this entry is closure-specific custom quote      |
| `custom_quote_reason` | string                 | no       | Required when custom quote is set                        |
| `closure_id`          | Id<"closures">         | no       | Closure link for custom quote rows                       |
| `effective_from`      | number                 | yes      | Unix ms                                                  |
| `effective_to`        | number                 | no       | Unix ms                                                  |
| `is_active`           | boolean                | yes      | Active fee schedule flag                                 |
| `updated_by_admin_id` | Id<"users">            | yes      | Last editor                                              |

**Indexes**: `by_active_effective_from`, `by_slab_key`, `by_closure_id`

---

### AO. Tenant Pass

| Field                    | Type                | Required | Description                                                           |
| ------------------------ | ------------------- | -------- | --------------------------------------------------------------------- |
| `_id`                    | Id<"tenant_passes"> | auto     | Convex document ID                                                    |
| `tenant_user_id`         | Id<"users">         | yes      | Pass owner (`user_type: TENANT`)                                      |
| `plan_code`              | string              | yes      | Plan id (e.g. `DISCOVERY_STANDARD`)                                   |
| `amount_paise`           | number              | yes      | Amount paid                                                           |
| `credited_paise`         | number              | yes      | Amount already consumed                                               |
| `remaining_credit_paise` | number              | yes      | Available credit                                                      |
| `status`                 | string              | yes      | `ACTIVE` / `PARTIALLY_CONSUMED` / `CONSUMED` / `EXPIRED` / `REFUNDED` |
| `purchased_at`           | number              | yes      | Unix ms                                                               |
| `expires_at`             | number              | yes      | Unix ms                                                               |
| `consumed_at`            | number              | no       | Unix ms                                                               |
| `payment_ref`            | string              | yes      | Gateway reference                                                     |
| `closure_id`             | Id<"closures">      | no       | Linked closure when applied                                           |

**Indexes**: `by_tenant_user_id`, `by_status`, `by_expires_at`

---

### AP. Partner Service

| Field                    | Type                   | Required | Description                                                                      |
| ------------------------ | ---------------------- | -------- | -------------------------------------------------------------------------------- |
| `_id`                    | Id<"partner_services"> | auto     | Convex document ID                                                               |
| `name`                   | string                 | yes      | Partner display name                                                             |
| `service_type`           | string                 | yes      | `MOVERS` / `PAINTERS` / `LAWYERS` / `FURNITURE_RENTAL` / `INTERNET` / `CLEANING` |
| `contact_phone`          | string                 | yes      | 10-digit normalized phone                                                        |
| `service_areas`          | array                  | yes      | Array of supported areas/societies                                               |
| `commission_type`        | string                 | yes      | `PERCENT` / `FLAT`                                                               |
| `commission_value_bps`   | number                 | no       | Used when `commission_type = PERCENT`                                            |
| `commission_value_paise` | number                 | no       | Used when `commission_type = FLAT`                                               |
| `rating`                 | number                 | no       | Internal quality score                                                           |
| `is_active`              | boolean                | yes      | Availability flag                                                                |

**Indexes**: `by_service_type`, `by_is_active`, `by_contact_phone`

---

### AQ. Service Bundle

| Field                 | Type                   | Required | Description                                                           |
| --------------------- | ---------------------- | -------- | --------------------------------------------------------------------- |
| `_id`                 | Id<"service_bundles">  | auto     | Convex document ID                                                    |
| `closure_id`          | Id<"closures">         | no       | Post-closure linkage                                                  |
| `listing_id`          | Id<"listings">         | no       | Listing linkage                                                       |
| `requester_user_id`   | Id<"users">            | yes      | Tenant/owner requester                                                |
| `partner_service_id`  | Id<"partner_services"> | yes      | Chosen partner capability                                             |
| `bundle_type`         | string                 | yes      | `AGREEMENT` / `MOVERS` / `CLEANING` / `INTERNET` / `CUSTOM`           |
| `quoted_amount_paise` | number                 | yes      | Customer quote                                                        |
| `partner_cost_paise`  | number                 | no       | Partner payable amount                                                |
| `commission_paise`    | number                 | no       | Platform margin                                                       |
| `status`              | string                 | yes      | `REQUESTED` / `CONFIRMED` / `IN_PROGRESS` / `COMPLETED` / `CANCELLED` |
| `scheduled_for`       | number                 | no       | Unix ms                                                               |
| `completed_at`        | number                 | no       | Unix ms                                                               |

**Indexes**: `by_closure_id`, `by_listing_id`, `by_status`, `by_partner_service_id`

---

### AR. Promoted Listing Campaign

| Field           | Type                    | Required | Description                                   |
| --------------- | ----------------------- | -------- | --------------------------------------------- |
| `_id`           | Id<"promoted_listings"> | auto     | Convex document ID                            |
| `listing_id`    | Id<"listings">          | yes      | Promoted listing                              |
| `owner_user_id` | Id<"users">             | yes      | Campaign payer                                |
| `duration_days` | number                  | yes      | `7` / `14` / `30`                             |
| `amount_paise`  | number                  | yes      | Campaign charge                               |
| `starts_at`     | number                  | yes      | Unix ms                                       |
| `ends_at`       | number                  | yes      | Unix ms                                       |
| `status`        | string                  | yes      | `ACTIVE` / `PAUSED` / `EXPIRED` / `CANCELLED` |
| `stale_reason`  | string                  | no       | Auto-pause/expire reason                      |
| `payment_ref`   | string                  | yes      | Payment reference                             |

**Indexes**: `by_listing_id`, `by_status_ends_at`, `by_owner_user_id`

---

### AS. Revenue Line Item

| Field                   | Type                     | Required | Description                                                                                                                                                              |
| ----------------------- | ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_id`                   | Id<"revenue_line_items"> | auto     | Convex document ID                                                                                                                                                       |
| `closure_id`            | Id<"closures">           | no       | Related closure                                                                                                                                                          |
| `source_type`           | string                   | yes      | `TRANSACTION_FEE` / `TENANT_PASS` / `PROMOTION` / `SERVICE_BUNDLE` / `REFERRAL_BONUS` / `PAYOUT_ADJUSTMENT`                                                              |
| `source_id`             | string                   | yes      | Source record id                                                                                                                                                         |
| `line_type`             | string                   | yes      | `FEE_GROSS` / `PASS_CREDIT` / `FEE_NET` / `PROMOTION_REVENUE` / `SERVICE_GROSS` / `PARTNER_COST` / `SERVICE_COMMISSION` / `REFERRAL_COST` / `PAYOUT_COST` / `ADJUSTMENT` |
| `amount_paise`          | number                   | yes      | Signed paise amount                                                                                                                                                      |
| `fee_collection_status` | string                   | no       | `DUE` / `PARTIAL` / `PAID` / `WAIVED`                                                                                                                                    |
| `recognized_at`         | number                   | yes      | Unix ms                                                                                                                                                                  |
| `metadata`              | object                   | no       | Optional dimensions payload                                                                                                                                              |

**Indexes**: `by_closure_id`, `by_source_type`, `by_recognized_at`

---

## Phase 37: Post-Move-In Entities

### AX. Resident Profile

| Field                         | Type                    | Required | Description                                                                                           |
| ----------------------------- | ----------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `_id`                         | Id<"resident_profiles"> | auto     | Convex document ID                                                                                    |
| `tenant_user_id`              | Id<"users">             | yes      | Resident user                                                                                         |
| `owner_id`                    | Id<"owners">            | no       | P31 canonical owner identity                                                                          |
| `owner_user_id`               | Id<"users">             | no       | Denormalized owner user ID                                                                            |
| `listing_id`                  | Id<"listings">          | yes      | Property listing                                                                                      |
| `closure_id`                  | Id<"closures">          | yes      | Source closure                                                                                        |
| `status`                      | string                  | yes      | `PENDING_ACTIVATION` / `ACTIVE` / `RENEWAL_PENDING` / `MOVE_OUT_REQUESTED` / `MOVED_OUT` / `ARCHIVED` |
| `lease_start`                 | number                  | yes      | Unix ms                                                                                               |
| `lease_end`                   | number                  | yes      | Unix ms                                                                                               |
| `monthly_rent_paise`          | number                  | yes      | Current monthly rent                                                                                  |
| `security_deposit_paise`      | number                  | yes      | Deposit amount held                                                                                   |
| `activated_at`                | number                  | no       | Unix ms                                                                                               |
| `moved_out_at`                | number                  | no       | Unix ms                                                                                               |
| `assigned_backoffice_user_id` | Id<"users">             | no       | Assigned admin/OPS                                                                                    |
| `move_out_settlement`         | object                  | no       | Settlement breakdown (deposit, deductions, refund)                                                    |
| `negotiation_log`             | array                   | no       | Renewal negotiation history entries                                                                   |

**Indexes**: `by_tenant_user_id`, `by_listing_id`, `by_owner_id`, `by_status`, `by_closure_id`

---

### AY. Rent Record

| Field               | Type                    | Required | Description                                                           |
| ------------------- | ----------------------- | -------- | --------------------------------------------------------------------- |
| `_id`               | Id<"rent_records">      | auto     | Convex document ID                                                    |
| `resident_id`       | Id<"resident_profiles"> | yes      | Parent resident                                                       |
| `period_start`      | number                  | yes      | Unix ms                                                               |
| `period_end`        | number                  | yes      | Unix ms                                                               |
| `amount_due_paise`  | number                  | yes      | Expected rent                                                         |
| `amount_paid_paise` | number                  | yes      | Actually paid                                                         |
| `status`            | string                  | yes      | `UPCOMING` / `DUE` / `PAID` / `OVERDUE` / `PARTIALLY_PAID` / `WAIVED` |
| `payment_mode`      | string                  | no       | `UPI` / `BANK_TRANSFER` / `CASH` / `CHEQUE` / `AUTO_DEBIT`            |
| `payment_reference` | string                  | no       | Payment gateway reference                                             |
| `paid_at`           | number                  | no       | Unix ms                                                               |
| `due_date`          | number                  | yes      | Unix ms                                                               |
| `receipt_number`    | string                  | no       | Format: `RR-{YYYYMM}-{sequence}`                                      |

**Indexes**: `by_resident_id`, `by_status`, `by_due_date`

---

### AZ. Maintenance Ticket

| Field              | Type                      | Required | Description                                                                                                   |
| ------------------ | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `_id`              | Id<"maintenance_tickets"> | auto     | Convex document ID                                                                                            |
| `resident_id`      | Id<"resident_profiles">   | yes      | Reporting resident                                                                                            |
| `listing_id`       | Id<"listings">            | yes      | Property                                                                                                      |
| `reporter_user_id` | Id<"users">               | yes      | Ticket creator                                                                                                |
| `category`         | string                    | yes      | `PLUMBING` / `ELECTRICAL` / `CARPENTRY` / `PAINTING` / `APPLIANCE` / `PEST_CONTROL` / `COMMON_AREA` / `OTHER` |
| `severity`         | string                    | yes      | `LOW` / `MEDIUM` / `HIGH` / `URGENT`                                                                          |
| `title`            | string                    | yes      | Short description                                                                                             |
| `description`      | string                    | yes      | Detailed description                                                                                          |
| `photo_ids`        | array                     | no       | Attached photo storage IDs                                                                                    |
| `status`           | string                    | yes      | `OPEN` / `ASSIGNED` / `IN_PROGRESS` / `RESOLVED` / `CLOSED` / `CANCELLED`                                     |
| `assigned_to`      | Id<"users">               | no       | Assigned handler                                                                                              |
| `resolution_notes` | string                    | no       | Resolution description                                                                                        |
| `resolved_at`      | number                    | no       | Unix ms                                                                                                       |
| `sla_deadline`     | number                    | no       | Unix ms - computed from severity                                                                              |
| `escalated`        | boolean                   | no       | Whether SLA breach triggered escalation                                                                       |

**Indexes**: `by_resident_id`, `by_listing_id`, `by_status`, `by_assigned_to`, `by_sla_deadline`

---

### BA. Lease Renewal

| Field                 | Type                    | Required | Description                                                                                                                                           |
| --------------------- | ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_id`                 | Id<"lease_renewals">    | auto     | Convex document ID                                                                                                                                    |
| `resident_id`         | Id<"resident_profiles"> | yes      | Resident                                                                                                                                              |
| `current_lease_end`   | number                  | yes      | Unix ms                                                                                                                                               |
| `proposed_new_end`    | number                  | no       | Unix ms                                                                                                                                               |
| `proposed_rent_paise` | number                  | no       | Proposed new rent                                                                                                                                     |
| `status`              | string                  | yes      | `INITIATED` / `OWNER_RESPONDED` / `TENANT_RESPONDED` / `NEGOTIATING` / `AGREED` / `RENEWED` / `MOVE_OUT_REQUESTED` / `MOVE_OUT_CONFIRMED` / `EXPIRED` |
| `initiated_by`        | string                  | yes      | `SYSTEM` / `OWNER` / `TENANT`                                                                                                                         |
| `owner_response`      | string                  | no       | `RENEW_SAME_TERMS` / `RENEW_NEW_TERMS` / `TERMINATE`                                                                                                  |
| `tenant_response`     | string                  | no       | `ACCEPT` / `COUNTER` / `MOVE_OUT`                                                                                                                     |
| `negotiation_log`     | array                   | no       | Negotiation history entries                                                                                                                           |

**Indexes**: `by_resident_id`, `by_status`, `by_current_lease_end`

---

## Phase 38: Owner Portal Data Scope

P38 introduces **no new database entities**. It creates owner-scoped read-model queries over existing tables:

- `owners` (P31) - owner identity and lifecycle
- `leads` (P04) - leads linked to owner properties
- `listings` (P06) - owner property listings
- `closures` (P08) - closure records for owner properties
- `payouts` (P09) - owner earnings from closures
- `resident_profiles` (P37) - tenants in owner properties
- `maintenance_tickets` (P37) - maintenance requests for owner properties
- `chat_channels` / `chat_messages` (P24) - deal room communication
- `referral_codes` / `referrals` (P22) - owner referral tracking
- `owner_service_requests` (P20) - owner service requests
- `document_requirements` (P30) - document collection for owner properties

---

## Entity Relationship Summary

```
Society (1) ──── (N) Building
Society (1) ──── (N) Guard Profile ──── (1) User
User    (1) ──── (N) Guard Shift
User    (1) ──── (N) User Role Assignment ──── (N) Role

Lead    (N) ──── (1) Society
Lead    (N) ──── (1) Building
Lead    (N) ──── (1) User (submitted_by_guard)
Lead    (1) ──── (N) Owner Verification
Lead    (1) ──── (0..1) Listing
Lead    (1) ──── (N) Visit
Lead    (1) ──── (0..1) Closure ──── (0..1) Payout

Listing (1) ──── (N) Listing Photo
Listing (1) ──── (N) Listing Inquiry
Listing (1) ──── (N) Tenant Inquiry
Listing (1) ──── (N) Listing Roommate Profile
Listing (1) ──── (N) Listing Commute Landmark

User (TENANT) ──── (1) Tenant Profile
User (TENANT) ──── (N) Tenant Inquiry
Tenant Inquiry (0..1) ──── (1) User (assigned_guard)

User    (1) ──── (N) Incentive Card
User    (1) ──── (N) Audit Log (as actor)

User (TENANT/OWNER) ──── (0..1) Referral Code
User    (1) ──── (N) Referral (as referrer)
User    (1) ──── (0..1) Referral (as referred)
Referral (1) ──── (N) Referral Milestone

Tenant Inquiry (1) ──── (0..1) Chat Channel
Chat Channel (1) ──── (N) Chat Message
Chat Channel (1) ──── (N) Chat Message Batch
Chat Channel (1) ──── (N) Deal Checklist
Deal Checklist (1) ──── (N) Deal Checklist Signature
Chat Channel (1) ──── (N) Chat Read Receipt (per user)
Closure (0..1) ──── (0..1) Deal Checklist (signed)

Tenant Inquiry (1) ──── (0..1) Negotiation
Negotiation (1) ──── (0..3) Chat Channel (OPS_TENANT, OPS_OWNER, COMBINED)
Negotiation (1) ──── (N) Negotiation Terms Proposal
Negotiation Terms Proposal (1) ──── (N) Negotiation Terms Signature
Negotiation (1) ──── (0..1) Negotiation Token Record
Closure (0..1) ──── (0..1) Negotiation (gates confirmation)

Visit (1) ──── (0..1) Checklist Instance
Checklist Template (1) ──── (N) Checklist Instance
User (Guard) (1) ──── (N) Checklist Instance (as assigned_to)
Lead/Listing/Closure (0..1) ──── (N) Document Requirement
Closure (1) ──── (N) Regulatory Item
User (Guard) (1) ──── (N) Quality Score History
User (Guard) (1) ──── (N) Guard Streak
Payout (1) ──── (0..1) Payout Adjustment
```

### Phase 35-38 Relationship Additions

User (1) ──── (1) Notification Preference
User (1) ──── (N) Notification Event
User (1) ──── (N) Notification
Notification Event (1) ──── (N) Notification (channel deliveries)
Notification Template (1) ──── (N) Notification (template source)

Tenant (User) (1) ──── (N) Tenant Pass
Partner Service (1) ──── (N) Service Bundle
Listing (1) ──── (N) Promoted Listing
Closure (1) ──── (N) Revenue Line Item
Service Bundle (1) ──── (N) Revenue Line Item
Promoted Listing (1) ──── (N) Revenue Line Item
Referral Milestone (1) ──── (N) Revenue Line Item (cost mirror)
Payout (1) ──── (N) Revenue Line Item (cost mirror)

Tenant (User) (1) ──── (N) Resident Profile
Owner (P31) (1) ──── (N) Resident Profile
Listing (1) ──── (N) Resident Profile
Closure (1) ──── (1) Resident Profile
Resident Profile (1) ──── (N) Rent Record
Resident Profile (1) ──── (N) Maintenance Ticket
Resident Profile (1) ──── (N) Lease Renewal

---

## Phase 30: Field Operations Entities

### Checklist Template

Reusable inspection template with sections and items. Assigned to visits as instances.

| Field       | Type                      | Required | Description                                          |
| ----------- | ------------------------- | -------- | ---------------------------------------------------- |
| \_id        | Id<"checklist_templates"> | auto     | Convex document ID                                   |
| name        | string                    | yes      | Template name (e.g., "Standard Property Inspection") |
| description | string                    | no       | Template description                                 |
| depth       | string                    | yes      | `LIGHT` / `MEDIUM` / `FULL`                          |
| is_active   | boolean                   | yes      | Whether template is available for assignment         |
| is_deleted  | boolean                   | yes      | Soft delete flag                                     |
| sections    | array                     | yes      | Array of section objects (see below)                 |

**Section object**:

| Field       | Type   | Required | Description                         |
| ----------- | ------ | -------- | ----------------------------------- |
| section_id  | string | yes      | Unique section identifier           |
| title       | string | yes      | Section title (e.g., "Living Room") |
| description | string | no       | Section description                 |
| items       | array  | yes      | Array of item objects (see below)   |

**Item object**:

| Field          | Type    | Required | Description                                                                |
| -------------- | ------- | -------- | -------------------------------------------------------------------------- |
| item_id        | string  | yes      | Unique item identifier                                                     |
| label          | string  | yes      | Item label (e.g., "Walls and ceiling condition")                           |
| item_type      | string  | yes      | `CONDITION` / `CHECKBOX` / `TEXT` / `NUMBER` / `PHOTO` / `PHOTO_CONDITION` |
| is_required    | boolean | yes      | Whether response is mandatory                                              |
| requires_photo | boolean | yes      | Whether photo evidence is required                                         |
| min_depth      | string  | yes      | Minimum depth level to show this item (`LIGHT` / `MEDIUM` / `FULL`)        |

**Indexes**: `by_depth_and_active` (depth, is_active), `by_name_and_depth` (name, depth), `by_is_active` (is_active)

See [Field Checklists](features/21-field-checklists.md) for the full template specification.

---

### Checklist Instance

A snapshot of a template assigned to a specific visit, with guard responses and review state.

| Field              | Type                      | Required | Description                                                                                                |
| ------------------ | ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| \_id               | Id<"checklist_instances"> | auto     | Convex document ID                                                                                         |
| template_id        | Id<"checklist_templates"> | yes      | Source template                                                                                            |
| visit_id           | Id<"visits">              | yes      | Associated visit                                                                                           |
| assigned_to        | Id<"users">               | yes      | Guard assigned to complete                                                                                 |
| assigned_by        | Id<"users">               | yes      | Admin/OPS who assigned                                                                                     |
| depth              | string                    | yes      | `LIGHT` / `MEDIUM` / `FULL`                                                                                |
| status             | string                    | yes      | `ASSIGNED` / `IN_PROGRESS` / `SUBMITTED` / `UNDER_REVIEW` / `APPROVED` / `REJECTED` / `REVISION_REQUESTED` |
| completeness_score | number                    | yes      | 0-100 computed score                                                                                       |
| responses          | array                     | yes      | Guard responses per item (see below)                                                                       |
| review_notes       | string                    | no       | Admin review feedback                                                                                      |
| reviewed_by        | Id<"users">               | no       | Admin who reviewed                                                                                         |
| reviewed_at        | number                    | no       | Review timestamp (Unix ms)                                                                                 |
| submitted_at       | number                    | no       | Submission timestamp (Unix ms)                                                                             |
| started_at         | number                    | no       | When guard started filling (Unix ms)                                                                       |
| is_deleted         | boolean                   | yes      | Soft delete flag                                                                                           |

**Response object**:

| Field            | Type                     | Required | Description                                           |
| ---------------- | ------------------------ | -------- | ----------------------------------------------------- |
| item_id          | string                   | yes      | References item in template                           |
| section_id       | string                   | yes      | References section in template                        |
| value            | string                   | no       | Text/number value                                     |
| condition_rating | string                   | no       | `EXCELLENT` / `GOOD` / `FAIR` / `POOR` / `NA`         |
| photo_ids        | array of Id<"\_storage"> | yes      | Uploaded photo references                             |
| photo_metadata   | array                    | yes      | Per-photo: storage_id, taken_at (Unix ms), lat?, lng? |
| notes            | string                   | no       | Additional observations                               |
| completed_at     | number                   | no       | When item was completed (Unix ms)                     |

**Indexes**: `by_status`, `by_assigned_to`, `by_visit_id`, `by_template_id`

**Notes**:

- `visits` table has a `checklist_instance_id` field linking back to this record.
- Status transitions: see [State Machines](04-state-machines.md#checklist-instance-status).

---

### Document Requirement

Bundles document collection requirements for a lead, listing, or closure.

| Field            | Type                        | Required | Description                                            |
| ---------------- | --------------------------- | -------- | ------------------------------------------------------ |
| \_id             | Id<"document_requirements"> | auto     | Convex document ID                                     |
| lead_id          | Id<"leads">                 | no       | Linked lead                                            |
| listing_id       | Id<"listings">              | no       | Linked listing                                         |
| closure_id       | Id<"closures">              | no       | Linked closure                                         |
| requirement_type | string                      | yes      | `OWNER_DOCS` / `TENANT_DOCS` / `SOCIETY_DOCS`          |
| assigned_to      | Id<"users">                 | no       | OPS/guard assigned                                     |
| assigned_by      | Id<"users">                 | no       | Admin who assigned                                     |
| overall_status   | string                      | yes      | `NOT_STARTED` / `IN_PROGRESS` / `COMPLETE` / `BLOCKED` |
| items            | array                       | yes      | Individual document items (see below)                  |
| notes            | string                      | no       | General notes                                          |
| is_deleted       | boolean                     | yes      | Soft delete flag                                       |

**Document item object**:

| Field           | Type            | Required | Description                                              |
| --------------- | --------------- | -------- | -------------------------------------------------------- |
| item_id         | string          | yes      | Unique item identifier                                   |
| label           | string          | yes      | Document name (e.g., "Rent Agreement")                   |
| description     | string          | no       | What this document is                                    |
| is_required     | boolean         | yes      | Whether this item is mandatory                           |
| status          | string          | yes      | `PENDING` / `COLLECTED` / `VERIFIED` / `REJECTED` / `NA` |
| storage_id      | Id<"\_storage"> | no       | Uploaded file reference                                  |
| file_type       | string          | no       | MIME type                                                |
| file_size       | number          | no       | File size in bytes                                       |
| collected_at    | number          | no       | Upload timestamp (Unix ms)                               |
| collected_by    | Id<"users">     | no       | Who uploaded                                             |
| verified_at     | number          | no       | Verification timestamp (Unix ms)                         |
| verified_by     | Id<"users">     | no       | Admin who verified                                       |
| rejection_notes | string          | no       | Reason for rejection                                     |
| notes           | string          | no       | Additional notes                                         |

**Indexes**: `by_lead_id`, `by_listing_id`, `by_closure_id`, `by_assigned_to`, `by_overall_status`

See [State Machines](04-state-machines.md#document-requirement-overall-status) for status transitions.

---

### Regulatory Item

Tracks compliance items in the society liaison workflow for a closure.

| Field               | Type                     | Required | Description                                                                                  |
| ------------------- | ------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| \_id                | Id<"regulatory_items">   | auto     | Convex document ID                                                                           |
| closure_id          | Id<"closures">           | yes      | Associated closure                                                                           |
| item_type           | string                   | yes      | `POLICE_VERIFICATION` / `RENT_REGISTRATION` / `SOCIETY_NOC` / `STAMP_DUTY`                   |
| status              | string                   | yes      | `NOT_STARTED` / `IN_PROGRESS` / `SUBMITTED` / `APPROVED` / `REJECTED` / `OVERDUE` / `WAIVED` |
| reference_number    | string                   | no       | External reference (e.g., police verification number)                                        |
| sla_deadline        | number                   | no       | Deadline (Unix ms)                                                                           |
| submitted_at        | number                   | no       | Submission timestamp (Unix ms)                                                               |
| completed_at        | number                   | no       | Completion timestamp (Unix ms)                                                               |
| assigned_to         | Id<"users">              | no       | OPS assigned                                                                                 |
| assigned_by         | Id<"users">              | no       | Admin who assigned                                                                           |
| linked_document_ids | array of Id<"\_storage"> | yes      | Supporting document files                                                                    |
| notes               | string                   | no       | General notes                                                                                |
| escalation_notes    | string                   | no       | Admin escalation context                                                                     |
| is_deleted          | boolean                  | yes      | Soft delete flag                                                                             |

**Indexes**: `by_closure_id`, `by_status`, `by_assigned_to`, `by_sla_deadline`, `by_item_type`

See [State Machines](04-state-machines.md#regulatory-item-status) for status transitions.

---

### Quality Score History

Tracks historical quality scores for each guard. A new record is inserted on each recomputation.

| Field         | Type        | Required | Description                                                               |
| ------------- | ----------- | -------- | ------------------------------------------------------------------------- |
| \_id          | auto        | auto     | Convex document ID                                                        |
| guard_user_id | Id<"users"> | yes      | Guard being scored                                                        |
| score         | number      | yes      | Overall quality score (0-100)                                             |
| components    | object      | yes      | Sub-scores: checklist, photo, speed, verification, document (each 0-100)  |
| trigger       | string      | yes      | What caused recomputation (e.g., `CHECKLIST_APPROVED`, `VISIT_COMPLETED`) |
| tier          | string      | yes      | `BRONZE` / `SILVER` / `GOLD` / `PLATINUM`                                 |
| computed_at   | number      | yes      | Computation timestamp (Unix ms)                                           |
| is_deleted    | boolean     | yes      | Soft delete flag                                                          |

**Indexes**: `by_guard` (guard_user_id), `by_guard_and_date` (guard_user_id, computed_at)

See [Incentive V2](features/22-incentive-v2.md) for the quality scoring specification.

---

### Guard Streak

Tracks consecutive positive behaviors per guard per streak type.

| Field              | Type        | Required | Description                                                        |
| ------------------ | ----------- | -------- | ------------------------------------------------------------------ |
| \_id               | auto        | auto     | Convex document ID                                                 |
| guard_user_id      | Id<"users"> | yes      | Guard                                                              |
| streak_type        | string      | yes      | `DAILY_ACTIVE` / `WEEKLY_WARRIOR` / `QUALITY_CHAIN` / `PERFECT_10` |
| current_count      | number      | yes      | Current consecutive count                                          |
| longest_count      | number      | yes      | All-time record for this streak type                               |
| is_active          | boolean     | yes      | Whether streak is still running                                    |
| last_activity_date | string      | yes      | Last qualifying date (YYYY-MM-DD)                                  |
| started_at         | number      | yes      | When streak started (Unix ms)                                      |
| updated_at         | number      | yes      | Last update timestamp (Unix ms)                                    |
| is_deleted         | boolean     | yes      | Soft delete flag                                                   |

**Indexes**: `by_guard` (guard_user_id), `by_guard_and_type` (guard_user_id, streak_type), `by_active` (is_active)

See [Incentive V2](features/22-incentive-v2.md) for streak rules and break conditions.

---

### Payout Adjustment

Stores the computed breakdown for a payout: quality multiplier, bonuses, penalties, and final amount.

| Field                    | Type          | Required | Description                                                         |
| ------------------------ | ------------- | -------- | ------------------------------------------------------------------- |
| \_id                     | auto          | auto     | Convex document ID                                                  |
| payout_id                | Id<"payouts"> | yes      | Associated payout                                                   |
| guard_user_id            | Id<"users">   | yes      | Guard                                                               |
| base_amount_paise        | number        | yes      | Original base bounty (paise)                                        |
| quality_score            | number        | yes      | Guard's quality score at computation time (0-100)                   |
| quality_tier             | string        | yes      | `BRONZE` / `SILVER` / `GOLD` / `PLATINUM`                           |
| quality_multiplier       | number        | yes      | Tier-based multiplier (1.0 / 1.25 / 1.5 / 2.0)                      |
| streak_bonus_paise       | number        | yes      | Total streak bonus (paise)                                          |
| task_bonuses             | array         | yes      | Per-bonus: bonus_type, label, amount_paise, percentage?             |
| task_bonuses_total_paise | number        | yes      | Sum of all task bonuses (paise)                                     |
| penalties                | array         | yes      | Per-penalty: penalty_type, label, amount_paise                      |
| penalty_total_paise      | number        | yes      | Sum of all penalties (paise)                                        |
| suggested_total_paise    | number        | yes      | System suggestion = base × multiplier + bonuses - penalties (paise) |
| admin_override_paise     | number        | no       | Admin manual override (paise). If set, this is the final amount.    |
| final_amount_paise       | number        | yes      | Final decided amount (paise)                                        |
| computed_at              | number        | yes      | Computation timestamp (Unix ms)                                     |
| is_deleted               | boolean       | yes      | Soft delete flag                                                    |

**Indexes**: `by_payout` (payout_id), `by_guard` (guard_user_id)

**Notes**:

- Formula: `suggested = (base × quality_multiplier) + streak_bonus + task_bonuses - penalties`
- Admin can override the final amount freely — the breakdown is informational.
- One payout adjustment per payout (1:1 relationship).

See [Incentive V2](features/22-incentive-v2.md) for the full payout adjustment algorithm.

---

## Phase 39: Tenant Trust and Reviews Entities

Reference: [Tenant Trust Score & Reviews](features/31-tenant-trust-score-reviews.md)

### Tenant Trust Score (`tenant_trust_scores`)

Canonical trust-score snapshot for each tenant. One active row per tenant.

| Field                     | Type        | Required | Description                                 |
| ------------------------- | ----------- | -------- | ------------------------------------------- |
| tenant_user_id            | Id<"users"> | yes      | Tenant user reference                       |
| overall_score             | number      | yes      | Trust score `0..100`                        |
| band                      | string      | yes      | `NEW` / `BUILDING` / `TRUSTED` / `PREMIUM`  |
| identity_points           | number      | yes      | Component points `0..30`                    |
| employment_points         | number      | yes      | Component points `0..25`                    |
| rental_history_points     | number      | yes      | Component points `0..25`                    |
| platform_behavior_points  | number      | yes      | Component points `0..20`                    |
| referral_boost_points     | number      | yes      | One-time referral boost                     |
| trusted_signal_count      | number      | yes      | Count of trusted source signals             |
| insufficient_data         | boolean     | yes      | True until minimum trusted-signal threshold |
| last_signal_at            | number      | yes      | Last trusted signal timestamp (Unix ms)     |
| computed_at               | number      | yes      | Computation timestamp (Unix ms)             |
| model_version             | string      | yes      | Scoring model version                       |
| referral_boost_applied_at | number      | no       | Boost applied timestamp (Unix ms)           |
| \_creationTime            | number      | auto     | Convex auto-generated                       |

**Indexes**: `by_tenant_user_id`, `by_overall_score`, `by_computed_at`

### Trust Score Component (`trust_score_components`)

Component-level attribution rows used to explain score computation.

| Field             | Type        | Required | Description                                                        |
| ----------------- | ----------- | -------- | ------------------------------------------------------------------ |
| tenant_user_id    | Id<"users"> | yes      | Tenant reference                                                   |
| component_key     | string      | yes      | `IDENTITY` / `EMPLOYMENT` / `RENTAL_HISTORY` / `PLATFORM_BEHAVIOR` |
| raw_metric_value  | number      | yes      | Raw source metric                                                  |
| normalized_points | number      | yes      | Normalized points added to score                                   |
| max_points        | number      | yes      | Component maximum points                                           |
| signal_count      | number      | yes      | Count of source signals                                            |
| source_refs       | string[]    | yes      | Source references                                                  |
| computed_at       | number      | yes      | Computation timestamp (Unix ms)                                    |
| model_version     | string      | yes      | Scoring model version                                              |

**Indexes**: `by_tenant_and_component`, `by_tenant_user_id`, `by_computed_at`

### Trust Score History (`trust_score_history`)

Historical timeline of score recomputations.

| Field                    | Type        | Required | Description                          |
| ------------------------ | ----------- | -------- | ------------------------------------ |
| tenant_user_id           | Id<"users"> | yes      | Tenant reference                     |
| overall_score            | number      | yes      | Snapshot score `0..100`              |
| band                     | string      | yes      | Snapshot band                        |
| identity_points          | number      | yes      | Snapshot component points (`0..30`)  |
| employment_points        | number      | yes      | Snapshot component points (`0..25`)  |
| rental_history_points    | number      | yes      | Snapshot component points (`0..25`)  |
| platform_behavior_points | number      | yes      | Snapshot component points (`0..20`)  |
| referral_boost_points    | number      | yes      | Snapshot referral boost points       |
| decay_points_applied     | number      | yes      | Decay delta applied during recompute |
| trigger                  | string      | yes      | `SCHEDULED` / `MANUAL` / `EVENT`     |
| computed_at              | number      | yes      | Computation timestamp (Unix ms)      |
| model_version            | string      | yes      | Snapshot model version               |
| \_creationTime           | number      | auto     | Convex auto-generated                |

**Indexes**: `by_tenant_user_id`, `by_tenant_and_computed_at`, `by_computed_at`

### Trust Eligibility Snapshot (`trust_eligibility_snapshots`)

Immutable score snapshots exported for financial product issuance.

| Field               | Type        | Required | Description                        |
| ------------------- | ----------- | -------- | ---------------------------------- |
| tenant_user_id      | Id<"users"> | yes      | Tenant subject                     |
| tenancy_anchor_id   | string      | yes      | Transaction/tenancy reference      |
| product_key         | string      | yes      | Financial product key              |
| score_at_issue      | number      | yes      | Frozen score at issuance           |
| band_at_issue       | string      | yes      | Frozen trust band at issuance      |
| computed_at         | number      | yes      | Source score computation timestamp |
| snapshot_created_at | number      | yes      | Snapshot creation timestamp        |
| model_version       | string      | yes      | Scoring model version              |
| policy_context      | object      | no       | Optional underwriting context      |

**Indexes**: `by_tenant_user_id`, `by_product_key`, `by_tenant_and_snapshot_created_at`

### Review (`reviews`)

Interaction-gated review records across listing, guard, tenant, and platform targets.

| Field                  | Type           | Required | Description                                                                                                        |
| ---------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| interaction_type       | string         | yes      | `VISIT` / `TENANCY` / `TRANSACTION`                                                                                |
| interaction_ref_id     | string         | yes      | Interaction anchor ID                                                                                              |
| review_type            | string         | yes      | `TENANT_LISTING_ACCURACY` / `TENANT_GUARD_PROFESSIONALISM` / `OWNER_TENANT_RELIABILITY` / `OWNER_PLATFORM_SERVICE` |
| reviewer_user_id       | Id<"users">    | yes      | Review author                                                                                                      |
| target_type            | string         | yes      | `LISTING` / `GUARD` / `TENANT` / `PLATFORM`                                                                        |
| target_listing_id      | Id<"listings"> | no       | Required for listing target                                                                                        |
| target_guard_user_id   | Id<"users">    | no       | Required for guard target                                                                                          |
| target_tenant_user_id  | Id<"users">    | no       | Required for tenant target                                                                                         |
| rating                 | number         | yes      | Integer `1..5`                                                                                                     |
| review_text            | string         | no       | Optional review text                                                                                               |
| review_text_hash       | string         | no       | Normalized text hash for anti-gaming dedupe                                                                        |
| idempotency_key        | string         | yes      | Request idempotency key                                                                                            |
| status                 | string         | yes      | `PENDING_COOLING` / `PUBLISHED` / `FLAGGED` / `HIDDEN` / `REMOVED`                                                 |
| cooling_until          | number         | yes      | Cooling period end (Unix ms)                                                                                       |
| cooling_edit_count     | number         | yes      | Allowed values `0` or `1`                                                                                          |
| submitted_at           | number         | yes      | Submission timestamp (Unix ms)                                                                                     |
| published_at           | number         | no       | Publish timestamp (Unix ms)                                                                                        |
| flagged_at             | number         | no       | Flag timestamp (Unix ms)                                                                                           |
| hidden_at              | number         | no       | Hidden timestamp (Unix ms)                                                                                         |
| removed_at             | number         | no       | Removed timestamp (Unix ms)                                                                                        |
| moderated_by           | Id<"users">    | no       | Moderator                                                                                                          |
| moderated_at           | number         | no       | Moderation timestamp (Unix ms)                                                                                     |
| moderation_reason_code | string         | no       | Moderation reason code                                                                                             |
| anomaly_score          | number         | no       | Review anomaly z-score                                                                                             |
| is_anomalous           | boolean        | yes      | Anomaly marker                                                                                                     |
| is_deleted             | boolean        | no       | Soft delete flag                                                                                                   |
| \_creationTime         | number         | auto     | Convex auto-generated                                                                                              |

**Indexes**: `by_interaction_reviewer_type`, `by_reviewer_and_idempotency_key`, `by_target_type_and_listing`, `by_target_type_and_guard`, `by_target_type_and_tenant`, `by_status`, `by_cooling_until`, `by_submitted_at`

### Review Response (`review_responses`)

Owner/admin response to a review (one active response row per review contract).

| Field             | Type          | Required | Description                 |
| ----------------- | ------------- | -------- | --------------------------- |
| review_id         | Id<"reviews"> | yes      | Parent review               |
| responder_user_id | Id<"users">   | yes      | Responder user              |
| responder_role    | string        | yes      | `OWNER` / `ADMIN`           |
| response_text     | string        | yes      | Response body               |
| created_at        | number        | yes      | Created timestamp (Unix ms) |
| edited_at         | number        | no       | Edited timestamp (Unix ms)  |
| edit_count        | number        | yes      | Max one edit (`0` or `1`)   |
| \_creationTime    | number        | auto     | Convex auto-generated       |

**Indexes**: `by_review_id`, `by_responder_user_id`

### Review Aggregate (`review_aggregates`)

Materialized aggregate cache for published review visibility.

| Field                | Type           | Required | Description                     |
| -------------------- | -------------- | -------- | ------------------------------- |
| target_type          | string         | yes      | `LISTING` / `GUARD`             |
| target_listing_id    | Id<"listings"> | no       | Required for listing aggregate  |
| target_guard_user_id | Id<"users">    | no       | Required for guard aggregate    |
| review_type          | string         | yes      | Aggregate review dimension      |
| average_rating_x10   | number         | yes      | Average rating multiplied by 10 |
| review_count         | number         | yes      | Published review count          |
| last_review_at       | number         | no       | Last review timestamp (Unix ms) |
| last_refreshed_at    | number         | yes      | Last refresh timestamp          |

**Indexes**: `by_target_listing_and_type`, `by_target_guard_and_type`, `by_last_refreshed_at`

### Tenant Favorite (`tenant_favorites`) — Introduced in Phase 43

Backend-synced favorites for authenticated tenants (also consumed by P43 tenant portal).

| Field          | Type           | Required | Description                  |
| -------------- | -------------- | -------- | ---------------------------- |
| tenant_user_id | Id<"users">    | yes      | Tenant user                  |
| listing_id     | Id<"listings"> | yes      | Favorited listing            |
| created_at     | number         | yes      | Favorite timestamp (Unix ms) |
| \_creationTime | number         | auto     | Convex auto-generated        |

**Indexes**: `by_tenant`, `by_tenant_and_listing`

### P39 Relationships

- User (Tenant) (1) -> (1) Tenant Trust Score
- User (Tenant) (1) -> (N) Trust Score History
- User (Reviewer) (1) -> (N) Reviews
- User (Target) (1) -> (N) Reviews
- Review (1) -> (0..1) Review Response

P43 adds:

- User (Tenant) (1) -> (N) Tenant Favorites
- Listing (1) -> (N) Tenant Favorites

### Phase 40-44 Entity Carry-Forward Notes

- P40 adds AI artifact entities (`ai_rent_estimates`, `ai_lead_scores`, `ai_fraud_signals`, `fraud_appeals`, `ai_photo_analyses`, `vacancy_heartbeats`, `ai_usage_tracking`, `ai_model_configs`).
- P41 adds multi-channel supply entities: `supply_sources` (partner/source registry), `source_collisions` (cross-channel dedup conflicts), `owner_direct_leads` (owner self-list intake), `broker_partnerships` (broker lifecycle + SLA), `corporate_partnerships` (corporate intake), `secretary_intake` (secretary-originated vacancies), `resident_referrals` (resident referral flow), `channel_analytics` (channel KPIs), `channel_configs` (channel controls), plus `leads.source_channel` extension and GUARD-channel rate key `guard_lead_daily_max`.
- P42 adds financial entities (`rent_shield_policies`, `rent_shield_claims`, `deposit_lite_plans`, `deposit_finance_loans`, `rent_credit_reporting_accounts`, `rent_credit_reports`, `financial_ledger`, `financial_partner_configs`, `financial_consent`, `financial_partner_callbacks`, `financial_exception_cases`).
- P43 introduces `tenant_favorites` as canonical favorites storage in `/tenant/*` flows.
- P44 introduces no new tables; it extends actor semantics (`leads.notes_thread.author_type` includes `OPS`) and adds OPS field-worker feature flags via `system_config` keys.

---

## Phase 46 Entity Carry-Forward Notes

- P46 adds 3 OPS management entities (`ops_kpi_targets`, `ops_warnings`, `ops_check_in_notes`). See [CEO Ops Command Center](features/37-ceo-ops-command-center.md).
