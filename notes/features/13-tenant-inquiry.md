# Feature: Tenant Inquiry & Visit Bounty Pipeline

> **Priority**: #19 in implementation order
> **Personas**: Prospective Tenant, Guard, Ops Agent, Super Admin
> **Dependencies**: Auth (P01), Guards (P03), Listings (P06)
> **Route Groups**: `(tenant)/`, `(guard)/`, `(admin)/`

## Purpose

The tenant inquiry pipeline handles the demand side — tenants requesting visits on published listings. Unlike the guard lead pipeline (supply side), this pipeline connects existing listings to prospective tenants through an ops-mediated bounty system for guards.

**Two separate pipelines, clearly distinguished**:

- **Guard Lead Pipeline** (existing): Guard submits vacancy → ops verifies → listing → visit → closure → payout
- **Tenant Inquiry Pipeline** (new): Tenant browses listing → submits visit request → ops reviews → ops posts bounty → guard accepts → visit happens

## Entities Involved

- `tenant_inquiries` table (core entity)
- `listings` table (read — inquiry is about a listing)
- `tenant_profiles` table (read — tenant info)
- `visits` table (created when visit is scheduled)

## Flow

```
1. Tenant browses published listing
2. Tenant submits visit request (name, phone, email, preferred date/time, message)
   → tenant_inquiries record created (status: SUBMITTED)
3. Ops reviews the inquiry in admin panel
   → status: SUBMITTED → REVIEWED
4. Ops sets bounty amount + expiry window
   → status: REVIEWED → BOUNTY_POSTED
   → Bounty appears on guard bounty board
5. Guard sees bounty in their bounty board (filtered to their society)
   → Guard taps "Accept Bounty"
   → status: BOUNTY_POSTED → GUARD_ACCEPTED
6. Ops confirms the visit schedule
   → status: GUARD_ACCEPTED → VISIT_SCHEDULED
   → A visits record is created (linked to the inquiry)
7. Guard executes the showing (same visit flow as existing)
   → status: VISIT_SCHEDULED → VISIT_COMPLETED
8a. If visit outcome is INTERESTED:
    → Ops initiates rent negotiation
    → status: VISIT_COMPLETED → NEGOTIATION_INITIATED
    → negotiations record created, Ops-Tenant room opens automatically
    → Negotiation proceeds through its own state machine (see below)
    → When negotiation reaches READY_FOR_CLOSURE:
    → status: NEGOTIATION_INITIATED → CLOSED (after closure confirmed)
8b. If visit outcome is NOT_INTERESTED or FOLLOWUP:
    → Ops closes the inquiry directly
    → status: VISIT_COMPLETED → CLOSED
```

**Rejection/Expiry**:

- Ops can reject at SUBMITTED or REVIEWED stage → status: REJECTED (terminal)
- If no guard accepts within the expiry window → status: EXPIRED (terminal)

**Negotiation step**:

- `NEGOTIATION_INITIATED` is a new status between `VISIT_COMPLETED` and `CLOSED`.
- It is only valid when the linked visit outcome was `INTERESTED`.
- A tenant can have multiple active negotiations across different listings simultaneously — each inquiry has its own independent negotiation.
- The negotiation has its own state machine: `INITIATED → ACTIVE → TERMS_PROPOSED → TERMS_AGREED → TOKEN_COLLECTED → DOCUMENTATION_IN_PROGRESS → READY_FOR_CLOSURE`.
- See [Rent Negotiation](19-rent-negotiation.md) for the full negotiation workflow.

See [State Machines](../04-state-machines.md) for the full transition table.

## User Stories

### Tenant: Submit Visit Request

**As a tenant**, I want to request a visit to a listing I'm interested in, so that I can see the property in person.

**Acceptance Criteria**:

- Visit request form on property detail page contact sidebar
- Fields: preferred visit date, preferred time slot, message (all optional — tenant_id and listing_id are automatic)
- **Requires tenant authentication** (Google Sign-In — prompt if not authenticated)
- On submit: toast "Visit request submitted! Our team will review and get back to you."
- Tenant can see their submitted inquiries (V2 — no status tracking portal in V1)
- Permission required: `tenant_inquiries.manage` (or implicit for authenticated tenant submitting own inquiry)

### Guard: View & Accept Bounties

**As a guard**, I want to see available visit bounties in my society so I can earn extra money by doing showings.

**Acceptance Criteria**:

- Bounty board at `(guard)/bounties/`
- Shows bounties for published listings in the guard's assigned society
- Only `BOUNTY_POSTED` status, not expired
- Each bounty card shows: listing details (building, flat, BHK, rent), tenant's preferred date/time, bounty amount (₹), expiry countdown
- "Accept Bounty" button with confirmation dialog
- On accept: status → GUARD_ACCEPTED, toast "Bounty accepted!"
- "My Accepted" tab shows guard's claimed bounties with status tracking

See [Guard Portal UX](../05-guard-portal-ux.md) Flow 8 for wireframes.

### Admin/OPS: Review & Post Bounty

**As an admin or OPS agent (with permission)**, I want to review tenant inquiries and post bounties for guards, so that visit requests are handled efficiently.

**Acceptance Criteria**:

- Tenant inquiry queue at `(admin)/tenant-inquiries/`
- Status tabs: SUBMITTED, REVIEWED, BOUNTY_POSTED, GUARD_ACCEPTED, SCHEDULED, COMPLETED
- Side panel shows inquiry details + listing info + tenant info
- "Review & Post Bounty" action: set bounty amount, expiry window
- "Reject" action: reject with reason
- Track bounty lifecycle: who accepted, when, visit outcome
- Permission required: `tenant_inquiries.manage` (review, post bounty, assign guard, close)

See [Admin Panel UX](../06-admin-panel-ux.md) Tenant Inquiry Management section for wireframes.

---

## Convex Functions

### Queries

```
tenantInquiries.list({ status?, listing_id?, tenant_id?, cursor? }) → { inquiries: TenantInquiry[], nextCursor? }
tenantInquiries.getById({ id }) → TenantInquiry + listing + tenant details
tenantInquiries.listBounties({ society_id, status: "BOUNTY_POSTED" }) → TenantInquiry[] (for guard bounty board)
tenantInquiries.listByGuard({ guard_id }) → TenantInquiry[] (accepted bounties)
```

### Mutations

```
tenantInquiries.submit({ listing_id, preferred_visit_date?, preferred_visit_slot?, message? }) → TenantInquiry
tenantInquiries.review({ id, ops_notes? }) → TenantInquiry (SUBMITTED → REVIEWED)
tenantInquiries.reject({ id, ops_notes }) → TenantInquiry (→ REJECTED)
tenantInquiries.postBounty({ id, bounty_amount, expiry_days }) → TenantInquiry (REVIEWED → BOUNTY_POSTED)
tenantInquiries.acceptBounty({ id }) → TenantInquiry (BOUNTY_POSTED → GUARD_ACCEPTED, sets assigned_guard_id)
tenantInquiries.scheduleVisit({ id, visit_details }) → TenantInquiry + Visit (GUARD_ACCEPTED → VISIT_SCHEDULED)
tenantInquiries.completeVisit({ id }) → TenantInquiry (VISIT_SCHEDULED → VISIT_COMPLETED)
tenantInquiries.close({ id }) → TenantInquiry (VISIT_COMPLETED → CLOSED)
tenantInquiries.initiateNegotiation({ id }) → TenantInquiry (VISIT_COMPLETED → NEGOTIATION_INITIATED)
// Validates: linked visit exists with outcome INTERESTED
// Creates negotiations record and OPS_TENANT chat_channel
// See features/19-rent-negotiation.md for full negotiation mutations
```

---

## Business Rules

1. **Separate pipelines**: Tenant inquiries are NOT guard-submitted leads. They attach to existing published listings. They do NOT create new leads.
2. **No auto-assignment**: Ops posts bounty → guards self-select. No round-robin or auto-assign.
3. **Ops control**: Every transition is ops-mediated except tenant submission and guard acceptance.
4. **Bounty expiry**: Configurable via `system_config` key `tenant_bounty_expiry_days` (default: 3 days). Cron job checks and expires unclaimed bounties.
5. **Society filter**: Guards only see bounties for listings in their assigned society.
6. **One guard per bounty**: First guard to accept claims it. No competing claims.
7. **Visit record creation**: When status → VISIT_SCHEDULED, a standard `visits` record is created (same table as guard-sourced visits), linked back to the tenant inquiry via a new `tenant_inquiry_id` field.
8. **Negotiation trigger**: `NEGOTIATION_INITIATED` is only valid when the linked visit outcome was `INTERESTED`. Ops cannot initiate a negotiation for a `NOT_INTERESTED` or `FOLLOWUP` visit outcome.
9. **Multiple negotiations per listing**: Multiple tenants can have simultaneous active negotiations on the same listing. Each inquiry has its own independent `negotiations` record and set of three rooms.
10. **Closure gate**: When a negotiation is linked to a closure, the closure cannot be confirmed until the negotiation reaches `READY_FOR_CLOSURE`. See [Closure & Payouts](07-closure-and-payouts.md) for the full gate specification.

---

## Edge Cases

- **Tenant submits multiple requests for same listing**: Allow it (they may want different dates). Ops can reject duplicates.
- **Guard accepts but becomes unavailable**: Ops manually reassigns or re-posts bounty.
- **Listing archived after inquiry submitted**: Inquiry can still be completed (property exists even if listing is unpublished). Show warning to ops.
- **Bounty expires with no guard**: Ops can re-post with higher bounty or manually assign.
