# Feature: Closure & Payouts

> **Priority**: #8 (Closure) and #9 (Payouts) in implementation order
> **Personas**: Admin/Ops (full management), Guard (earnings view only)
> **Dependencies**: Lead Pipeline + Visits

## Purpose

Closure records a successful deal — a tenant moved into a verified flat. Payout is the guard's bounty for sourcing that lead. These are the financial backbone of the platform and must be meticulously documented for accountability and dispute resolution.

India-specific context: Brokerage is collected from BOTH tenant and owner side. Commission structures vary per deal. Scams and disputes are common. The platform must document everything transparently so DemoRentals is never liable.

## Entities Involved

- `closures` table
- `payouts` table
- `leads` table (source)
- `listings` table (reference)
- Convex file storage (documents)

## Permissions

| Permission         | Used By                                                                           | Description                                                                   |
| ------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `closures.create`  | `create` mutation (and `generateUploadUrl` via `requireAnyPermission`)            | Gates creating closure records and creating upload URLs for closure docs.     |
| `closures.edit`    | `cancel`, `update` mutations (and `generateUploadUrl` via `requireAnyPermission`) | Gates editing/cancelling closures and closure document upload URL generation. |
| `closures.confirm` | `confirm` mutation                                                                | Gates irreversible closure confirmation (`PENDING` -> `CONFIRMED`).           |
| `closures.view`    | `getById`, `list`, `getByLeadId` queries                                          | Gates closure board/detail reads in backoffice.                               |
| `payouts.create`   | `create` mutation                                                                 | Gates payout creation for a confirmed closure.                                |
| `payouts.view`     | `getPayoutAdjustment`, `getById`, `list` queries                                  | Gates payout visibility and payout-adjustment detail reads.                   |
| `payouts.approve`  | `approve`, `overridePayoutAmount` mutations                                       | Gates payout approval and admin amount override workflow.                     |
| `payouts.disburse` | `disburse`, `fail` mutations                                                      | Gates disbursement success/failure transitions.                               |
| `payouts.void`     | `void` mutation                                                                   | Gates voiding payouts and recording void metadata.                            |

---

## Part 1: Closures

### Admin Flow: Create Closure

**Trigger**: Admin knows a deal has closed (tenant is moving in / has moved in).

**From**: Lead detail or Closure management page → "Record Closure"

**Closure Form**:

| Field                       | Type              | Required | Description                                                  |
| --------------------------- | ----------------- | -------- | ------------------------------------------------------------ |
| Lead                        | Select            | Yes      | Dropdown of VERIFIED leads                                   |
| DemoRentals Deal ID             | Text              | No       | Internal reference to DemoRentals's deal tracking (manual entry) |
| Move-In Date                | Date              | Yes      | When tenant moves/moved in                                   |
| Rent Agreement              | File upload       | No       | PDF/image of signed rent agreement                           |
| Commission Amount (₹)       | Number            | No       | Total commission charged by DemoRentals                          |
| Brokerage - Tenant Side (₹) | Number            | No       | Amount collected from tenant                                 |
| Brokerage - Owner Side (₹)  | Number            | No       | Amount collected from owner                                  |
| Additional Documents        | Multi-file upload | No       | Any other proof/paperwork                                    |
| Notes                       | Textarea          | No       | Context, special terms, remarks                              |

**On Save**:

- Status: `PENDING`
- Audit: `CLOSURE_CREATED`

**Confirm Closure**:

- Admin reviews all documentation → clicks "Confirm"
- Status: `PENDING` → `CONFIRMED`
- This unlocks payout creation for the guard who submitted the original lead
- Audit: `CLOSURE_CONFIRMED`

### Why Two Steps (PENDING → CONFIRMED)?

Not all closures are instant. Sometimes:

- Agreement is being prepared
- Owner hasn't returned signed copy yet
- Brokerage payment is pending from one side
- Admin needs to verify details with another team member

PENDING lets admin start recording while CONFIRMED means "we're sure, pay the guard."

---

## Part 2: Payouts

### Admin Flow: Create Payout

**Trigger**: Closure is `CONFIRMED`. Admin creates a payout for the guard.

**Payout Form**:

| Field              | Type         | Required | Description                                                      |
| ------------------ | ------------ | -------- | ---------------------------------------------------------------- |
| Guard              | Auto-filled  | Yes      | Guard who submitted the original lead (from lead record)         |
| Lead               | Auto-filled  | Yes      | Source lead                                                      |
| Closure            | Auto-filled  | Yes      | Linked closure                                                   |
| Prospective Bounty | Display only | —        | Shows the bounty amount set on the lead (if any) — for reference |
| Payout Amount (₹)  | Number       | Yes      | **Admin enters manually.** May differ from prospective bounty.   |
| Method             | Select       | No       | CASH / UPI / BANK_TRANSFER (optional — can be set later)         |
| Payment Reference  | Textarea     | No       | e.g., "Paid cash at society office on Feb 17"                    |

**Payout Lifecycle**:

```
pending → approved → disbursed
```

| Transition    | Who                             | When                        |
| ------------- | ------------------------------- | --------------------------- |
| → `pending`   | Any admin with `payouts.create` | After closure confirmed     |
| → `approved`  | Admin with `payouts.approve`    | Review/sign-off step        |
| → `disbursed` | Admin with `payouts.disburse`   | After actual disbursement   |
| → `failed`    | Admin with `payouts.disburse`   | Disbursement attempt failed |

### Payout Voiding

When a closure is cancelled (`PENDING` → `CANCELLED`), any linked payout in `pending` status must be voided:

- **Transition**: `pending` → `voided` (terminal state)
- **Trigger**: System automatically voids `pending` payouts when the linked closure is cancelled. Admin can also manually void a payout using `payouts.void`.
- **Restriction**: Only payouts in `pending` status can be auto-voided. `approved` and `disbursed` payouts cannot be voided — admin must handle these manually (e.g., request refund).
- **Fields set on void**: `voided_reason` (required), `voided_by` (admin user ID), `voided_at` (timestamp).
- **Audit**: The void action is logged with reason "Linked closure cancelled" (or admin-provided reason for manual voids).
- **Guard visibility**: Guard sees the payout disappear from "Pending" section in earnings. No explicit "voided" display — the payout simply no longer appears.

**Payout statuses**: `pending` → `approved` → `disbursed` (happy path), `approved` → `failed` (disbursement failed), or `pending` → `voided` (closure cancelled).

**On each transition**: Audit log entry with admin ID and timestamp.

### Why Manual Amount?

Every deal is different:

- Some deals involve another broker (split commission = lower guard bounty)
- Some guards were problematic (rude, delayed) — admin may reduce
- Some deals are high-value → admin may reward extra
- Prospective bounty is aspirational; actual payout is based on deal economics

The system shows the prospective bounty as a reference but lets admin override freely.

---

## Guard Flow: Earnings

### Earnings Page (`/guard/earnings`)

Mobile-first. Two sections:

**Section 1: Pending**
Closures where guard's payout is not yet `disbursed`.

```
┌─────────────────────────────────┐
│  🕐 Pending Payouts             │
│                                 │
│  Tower A, Flat 1201             │
│  Closure confirmed: Feb 15      │
│  Prospective bounty: ₹1,000    │
│  Status: Processing             │
│                                 │
│  Tower B, Flat 302              │
│  Closure confirmed: Feb 10      │
│  Amount: ₹800                   │
│  Status: Approved (payment soon)│
└─────────────────────────────────┘
```

**Section 2: Paid History**

```
┌─────────────────────────────────┐
│  💰 Paid History                │
│                                 │
│  Tower C, Flat 501 — ₹1,200    │
│  Paid on: Jan 28, 2026 (Cash)  │
│                                 │
│  Tower A, Flat 803 — ₹900      │
│  Paid on: Jan 15, 2026 (UPI)   │
│                                 │
│  Total Earned: ₹2,100          │
└─────────────────────────────────┘
```

**What guard sees vs doesn't see**:

| Visible to Guard                               | NOT Visible to Guard  |
| ---------------------------------------------- | --------------------- |
| Flat reference (building + flat)               | Commission amounts    |
| Prospective bounty (if set)                    | Brokerage breakdown   |
| Payout amount (once `approved` or `disbursed`) | Rent agreement        |
| Payout method and date                         | Other deal financials |
| Total earnings                                 | Internal admin notes  |

---

## Admin Panel UI

### Closures Page (`/admin/closures`)

| Column          | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| Lead            | Building + Flat                                                |
| Society         | Society name                                                   |
| Move-In Date    | Date                                                           |
| Commission      | Commission amount                                              |
| Brokerage (T/O) | Tenant/Owner split                                             |
| Status          | PENDING / CONFIRMED / CANCELLED                                |
| Guard           | Submitting guard                                               |
| Payout Status   | pending / approved / disbursed / failed / voided / Not Created |

**Filters**: Status, Society, Date range
**Actions**: Create Closure, Confirm, Create Payout

### Payouts Page (`/admin/payouts`)

| Column    | Description                                      |
| --------- | ------------------------------------------------ |
| Guard     | Guard name                                       |
| Lead      | Building + Flat                                  |
| Amount    | ₹ amount                                         |
| Method    | CASH / UPI / BANK (optional)                     |
| Status    | pending / approved / disbursed / failed / voided |
| Initiated | Date                                             |
| Approved  | Date (if approved)                               |
| Disbursed | Date (if disbursed)                              |

**Filters**: Status, Guard, Date range
**Actions**: Approve, Disburse, Void

---

## Convex Functions

### Queries

```
closures.list({ status?, society_id?, date_from?, date_to?, pagination }) → Closure[]
closures.getById({ id }) → Closure + lead info + payout info
payouts.list({ status?, guard_user_id?, date_from?, date_to?, pagination }) → Payout[]
payouts.getById({ id }) → Payout + closure + lead + guard info
payouts.getGuardEarnings({ guard_user_id? }) → { pending: Payout[], paid: Payout[], total_earned: number }
// If guard_user_id not provided, uses auth context (guard-facing)
```

### Mutations

```
closures.create({ lead_id, demorentals_deal_id?, move_in_date, rent_agreement_storage_id?, commission_amount?, brokerage_tenant_side?, brokerage_owner_side?, additional_documents[]?, notes? })
// Status: PENDING
// Audit: CLOSURES_INSERT

closures.confirm({ id })
// Status: PENDING → CONFIRMED
// Audit: CLOSURES_UPDATE

closures.update({ id, ...fields })
// Only when PENDING
// Audit: CLOSURES_UPDATE

payouts.create({ closure_id, amount_paise, method?, payment_reference? })
// Auto-fills: guard_user_id (from lead), lead_id (from closure)
// Status: pending
// Audit: PAYOUTS_INSERT

payouts.approve({ id })
// Status: pending → approved
// Sets approved_at
// Audit: PAYOUTS_UPDATE

payouts.disburse({ id, payment_reference? })
// Status: approved → disbursed
// Sets disbursed_at
// Audit: PAYOUTS_UPDATE

payouts.markFailed({ id, failure_reason })
// Status: approved → failed
// Audit: PAYOUTS_UPDATE

payouts.void({ id, voided_reason })
// Status: pending → voided
// Sets voided_by, voided_at
// Audit: PAYOUTS_UPDATE
```

---

## Negotiation Gate

When a closure is linked to a negotiation (via `negotiation_id` on the closure record), it is **GATED** — it cannot move from `PENDING` to `CONFIRMED` until all of the following conditions are true on the linked `negotiations` record.

### 10 Mandatory Gate Conditions

| #   | Condition                                                                                                         | How Validated                                 |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Agreed terms recorded — all terms in the signed `negotiation_terms_proposals` record are present                  | System auto-validates when proposal is signed |
| 2   | Both-party sign-off captured — both `negotiation_terms_signatures` records exist for the active proposal          | System auto-validates when both parties sign  |
| 3   | Token payment recorded — `negotiation_token_records` record exists with `status: COLLECTED`                       | Ops records token collection explicitly       |
| 4   | Brokerage terms recorded — both `brokerage_tenant_side` and `brokerage_owner_side` are set on the signed proposal | System auto-validates when proposal is signed |
| 5   | Police verification status tracked — `police_verification_status` is not `NOT_STARTED`                            | Ops selects status from dropdown              |
| 6   | Society NOC status tracked — `society_noc_status` is not `NOT_STARTED`                                            | Ops selects status from dropdown              |
| 7   | Owner KYC status tracked — `owner_kyc_status` is not `NOT_STARTED`                                                | Ops selects status from dropdown              |
| 8   | Agreement drafting status tracked — `agreement_drafting_status` is `SIGNED` or `UPLOADED`                         | Ops advances drafting milestones              |
| 9   | Stamp/registration status tracked — `stamp_registration_status` is not `NOT_STARTED`                              | Ops selects status from dropdown              |
| 10  | Rent agreement uploaded — `rent_agreement_storage_id` is set on the negotiation (mandatory PDF)                   | Ops uploads signed PDF                        |

The negotiation status advances to `READY_FOR_CLOSURE` only when all 10 conditions are met. Closure confirmation is blocked until this status is reached.

**Ops cannot skip any item.** There is no override or bypass for this gate.

### Closures Without a Negotiation

Not all closures are linked to a negotiation. The guard lead pipeline (supply side) creates closures directly from verified leads without going through the negotiation workflow. The gate only applies when `negotiation_id` is set on the closure record.

### Admin UI Impact

The "Confirm" button on the closure detail page is disabled with a tooltip ("Negotiation not yet ready for closure") when the linked negotiation is not `READY_FOR_CLOSURE`. The checklist progress is shown inline: "Negotiation checklist: X of 10 items complete."

See [Rent Negotiation](19-rent-negotiation.md) for the full negotiation workflow and checklist details.

---

## Business Rules

1. Only `VERIFIED` leads can have closures.
2. One closure per lead. If closure exists, show "View Closure" instead of "Create".
3. Closure must be `CONFIRMED` before payout can be created.
4. One payout per closure.
5. Payout amount is manually entered by admin. No auto-calculation.
6. Guard cannot see payout amount until status is `approved` or `disbursed`.
7. Guard sees prospective bounty (from lead) as an indicator, not as a guarantee.
8. `disbursed` is terminal. Cannot be reversed in the app (handle offline if needed).
9. Admin who initiates should ideally be different from admin who approves (separation of duties, but not system-enforced in V1).
10. Closures can be cancelled (`PENDING → CANCELLED`) when deals fall through. This is a terminal state.
11. All money amounts (commission, brokerage, payout) stored in paise (integer × 100). Frontend displays in rupees.

---

## Edge Cases

- **Closure without full documentation**: Allowed in PENDING state. Must have at least move_in_date to confirm.
- **Payout for a deal with shared brokerage**: Admin manually calculates guard's share and enters reduced amount.
- **Guard was BANNED after submitting lead**: Payout is still owed. Admin can still create payout for a banned guard.
- **Multiple visits, one closure**: Normal. All visits reference the same lead. Closure references the lead, not individual visits.
- **Dispute after payout**: Handle offline. Platform records everything for evidence.
- **Closure cancelled after payout initiated**: Admin should not create closures/payouts prematurely. If needed, handle offline. No "reverse payout" in V1.

---

## Payout Adjustment Model (Phase 30)

Phase 30 introduced a quantitative quality engine that generates a **suggested payout amount** when admin creates a payout. The suggestion is transparent and computed from the guard's quality metrics, but admin always sets the final amount.

### How the Suggestion Is Computed

```
suggested_amount = (base_bounty × quality_multiplier) + streak_bonus + task_bonuses - penalties
```

| Component            | Description                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `base_bounty`        | The prospective bounty set on the lead (if any), or a configurable default base amount                    |
| `quality_multiplier` | 1.0x to 2.0x based on the guard's quality tier (BRONZE=1.0x, SILVER=1.25x, GOLD=1.5x, PLATINUM=2.0x)      |
| `streak_bonus`       | Flat bonus (in paise) for active streaks — e.g., consecutive verified leads, consecutive completed visits |
| `task_bonuses`       | Bonuses for specific behaviors — e.g., full checklist completion, fast response time                      |
| `penalties`          | Deductions for quality failures — e.g., LOW_COMPLETENESS, MISSING_PHOTOS, NO_SHOW on recent visits        |

### Admin Payout Form (Updated)

When admin opens the payout creation form for a confirmed closure, they see:

```
┌─────────────────────────────────────────────┐
│  Create Payout — Tower A, Flat 1201         │
│                                             │
│  Guard: Rajesh Kumar (GOLD tier)            │
│  Base bounty: ₹1,000                        │
│                                             │
│  Quality Adjustment Breakdown:              │
│  ├─ Base:              ₹1,000               │
│  ├─ Quality (1.5x):   +₹500                │
│  ├─ Streak bonus:     +₹100                │
│  ├─ Checklist bonus:  +₹50                 │
│  └─ Penalties:        -₹0                  │
│                                             │
│  Suggested amount:    ₹1,650               │
│                                             │
│  Final amount (₹): [1,650]  ← admin edits  │
│  Method: [Select...]                        │
│  Reference: [_______________]               │
│                                             │
│  [Create Payout]                            │
└─────────────────────────────────────────────┘
```

### Admin Override

Admin can change the final amount to anything. The suggestion is a starting point, not a constraint. Common override reasons:

- Deal had complications the system doesn't know about
- Guard was partially responsible for a delay
- Admin wants to reward exceptional effort beyond what the formula captures
- Base bounty was not set on the lead (suggestion defaults to system config base)

The override is not logged separately — the audit trail captures the final amount set. The suggestion is shown in the UI but not persisted.

### Guard Visibility

Guards do NOT see the quality adjustment breakdown. They see:

- Payout amount (once `approved` or `disbursed`)
- Their quality tier badge on their profile
- Streak indicators on their dashboard

The connection between tier/streaks and payout amounts is communicated through the guard portal's earnings guidance, not through per-payout breakdowns.

### Business Rules

1. Suggestion is computed at payout creation time using the guard's current quality score and active streaks.
2. If no base bounty is set on the lead, the system uses `system_config.default_base_bounty_paise`.
3. Penalties are computed per-payout based on recent behavior (configurable lookback window), not applied to the quality score directly.
4. Admin can always set the final amount to zero (e.g., if the guard was found to have submitted a false lead that somehow got verified).
5. The suggestion engine requires the guard to have a computed quality score. If no score exists yet (new guard), multiplier defaults to 1.0x.

See [Incentive V2](22-incentive-v2.md) for the full quality scoring model, tier definitions, streak types, and penalty mechanics.
