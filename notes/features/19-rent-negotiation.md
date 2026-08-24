# Feature: Rent Negotiation

> **Priority**: #26 in implementation order (P26 — Rent Negotiation, third phase split from original P23 scope: P24 Chat Infrastructure → P25 Deal Room Features → P26 Rent Negotiation)
> **Personas**: Ops Agent, Super Admin, Prospective Tenant, Property Owner
> **Dependencies**: Auth (P01), Listings (P06), Tenant Inquiry (P19), Deal Room (P23), Closure & Payouts (P08)
> **Route Groups**: `(admin)/`, `(tenant)/`, owner portal route (TBD)

## Purpose

Rent Negotiation is an ops-mediated workflow where DemoRentals ops staff broker deal terms between property owners and prospective tenants. It begins after a visit completes with outcome `INTERESTED` and gates closure — no closure can be confirmed until the negotiation reaches `READY_FOR_CLOSURE` with all mandatory checklist items complete.

The platform serves three simultaneous purposes:

1. **Facilitate the deal**: Structured communication and formal terms proposals move negotiations from informal interest to signed agreement.
2. **Protect both parties**: AI masking prevents PII leakage; formal sign-off creates a record both sides agreed to.
3. **Protect DemoRentals from internal scams**: Mandatory documentation checklist, combined room accountability, and full audit trail prevent ops staff from running side deals, faking negotiations, or rushing closures without paperwork.

**Key principle**: Ops is a broker. In private rooms, ops may present different numbers to each side — this is normal and expected brokering behavior. Only when a formal terms proposal is shared in the combined room must both sides see identical terms.

See [Deal Room](18-deal-room.md) for the underlying chat infrastructure this feature builds on. See [Tenant Inquiry](13-tenant-inquiry.md) for the pipeline that feeds into negotiation. See [Closure & Payouts](07-closure-and-payouts.md) for what happens after negotiation completes.

---

## Architecture Overview

### 3-Room Architecture

Each negotiation (deal) has three separate chat rooms. These are NOT one room with visibility toggles — they are three distinct channels with independent participant lists and message histories.

| Room                | Participants         | Owner Sees? | Tenant Sees? | Ops Sees? | Purpose                                                                                                |
| ------------------- | -------------------- | ----------- | ------------ | --------- | ------------------------------------------------------------------------------------------------------ |
| **Ops-Tenant Room** | Ops + Tenant         | Never       | Yes          | Yes       | Ops discusses budget, constraints, preferences with tenant. Tenant shares real numbers here.           |
| **Ops-Owner Room**  | Ops + Owner          | Yes         | Never        | Yes       | Ops contacts owner about this specific tenant. Owner learns they are "in a deal" when this room opens. |
| **Combined Room**   | Ops + Tenant + Owner | Yes         | Yes          | Yes       | Final agreement, formal terms sign-off. Not every deal requires this room.                             |

All three rooms have AI masking active — PII is stripped (phone numbers, email addresses, social handles) and messages are rewritten for professionalism. Ops sees original messages alongside masked versions in all rooms.

### Relationship to Deal Room Infrastructure

The three rooms are implemented as `chat_channels` records with a `channel_type` field distinguishing them:

- `OPS_TENANT` — Ops-Tenant private room
- `OPS_OWNER` — Ops-Owner private room
- `COMBINED` — Three-party combined room

All existing Deal Room infrastructure applies: AI message batching, PII masking pipeline, read receipts, owner invite flow. See [Deal Room](18-deal-room.md) for the full chat infrastructure spec.

### Negotiation as a First-Class Entity

A `negotiations` record is the parent entity. It:

- Links to the `tenant_inquiries` record (and through it, to the listing and tenant)
- Owns all three chat channels
- Owns all terms proposals (versioned)
- Tracks the mandatory post-agreement checklist
- Has its own status state machine
- Gates closure creation

---

## Entities Involved

- `negotiations` table (core entity — one per interested tenant per listing)
- `negotiation_terms_proposals` table (versioned structured proposals)
- `negotiation_terms_signatures` table (per-party sign-off on proposals)
- `negotiation_token_records` table (token advance tracking)
- `chat_channels` table (three rooms per negotiation — extended from Deal Room)
- `chat_messages` table (messages within rooms — shared with Deal Room)
- `chat_message_batches` table (AI rewrite batches — shared with Deal Room)
- `tenant_inquiries` table (read — negotiation is triggered by INTERESTED visit outcome)
- `visits` table (read — the completed visit that triggered this negotiation)
- `listings` table (read — property context)
- `users` table (read — participants)
- `closures` table (write — negotiation gates closure creation)

## Permissions

| Permission            | Used By                                                                                                                                                                                                                                                                                                                                                                                          | Description                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `negotiations.manage` | `initiate`, `linkOwnerToNegotiation`, `openOwnerRoom`, `openCombinedRoom`, `markFailed`, `markStalled`, `markExpired`, `dismissEscalationFlag` mutations in `negotiations`; `create`, `edit`, `share`, `supersede` mutations in `negotiationProposals`; `updateChecklistItem`, `waiveItem` mutations in `negotiationChecklist`; `recordCollection` mutation in `negotiationTokens`               | Gates all negotiation state-changing operations across rooms, proposals, checklist, and token collection. |
| `negotiations.view`   | `getRentAgreementFile`, `listRoomsForNegotiation`, `getById`, `getByInquiryId`, `listForAdmin`, `statusCounts`, `getDetailForAdmin`, `flaggedNegotiations`, `negotiationAnalytics` queries in `negotiations`; `list`, `getById`, `getActiveProposal`, `getProposalHistory` in `negotiationProposals`; `getChecklistStatus` in `negotiationChecklist`; `getForNegotiation` in `negotiationTokens` | Gates read access to negotiation queues, detail pages, proposal history, checklist state, and analytics.  |

Uses `requireBackoffice()` on shared admin/ops paths, and uses `requireAdmin()` on escalation-sensitive admin flows (`markFailed`, `markStalled`, `markExpired`, `waiveItem`, `dismissEscalationFlag`).

---

## Flow

```
1. Visit completes with outcome: INTERESTED
   → Ops sees the completed visit in admin panel
   → "Start Negotiation" action becomes available on the tenant inquiry

2. Ops initiates negotiation
   → negotiations record created (status: INITIATED)
   → Ops-Tenant room opens automatically (chat_channel: OPS_TENANT)
   → Ops begins shuttle diplomacy: discusses budget, preferences, constraints with tenant

3. Ops opens Ops-Owner room when ready to contact owner
   → chat_channel: OPS_OWNER created (status: OPEN)
   → Owner receives invite link (same flow as Deal Room owner invite)
   → Owner learns a specific tenant is interested
   → Ops discusses owner's expectations, flexibility, conditions

4. Negotiation enters active back-and-forth
   → status: INITIATED → ACTIVE
   → Ops shuttles between private rooms, relaying positions
   → Ops may present different numbers to each side (normal brokering)
   → Can drag on for days or weeks with multiple rounds

5. Ops creates a structured terms proposal when positions are close
   → negotiation_terms_proposals record created (version 1)
   → Ops shares proposal into one or both private rooms for informal review
   → status: ACTIVE → TERMS_PROPOSED

6. Party counters (optional, may repeat multiple times)
   → Party communicates counter via chat
   → Ops creates new terms proposal version (version 2, 3, ...)
   → status: TERMS_PROPOSED → COUNTER_PROPOSED → TERMS_PROPOSED (cycles)

7. Ops opens Combined Room when terms are close enough for three-way discussion (optional)
   → chat_channel: COMBINED created
   → All three parties in one room
   → Formal terms proposal shared here — both sides see identical terms

8. Both parties sign off on the terms proposal
   → Tenant signs: negotiation_terms_signatures record (role: TENANT)
   → Owner signs: negotiation_terms_signatures record (role: OWNER)
   → status: TERMS_PROPOSED → TERMS_AGREED
   → Terms are LOCKED — no changes without creating a new proposal version

9. Token advance collected
   → Ops selects refund policy, tenant agrees to conditions
   → negotiation_token_records record created
   → status: TERMS_AGREED → TOKEN_COLLECTED

10. Post-agreement documentation checklist (ops completes all 10 items)
    → status: TOKEN_COLLECTED → DOCUMENTATION_IN_PROGRESS
    → Ops works through mandatory checklist items
    → Each item tracked individually

11. All 10 mandatory items complete
    → status: DOCUMENTATION_IN_PROGRESS → READY_FOR_CLOSURE
    → Closure creation is now unblocked for this negotiation

12. Admin creates closure (P08 flow)
    → Closure links to this negotiation record
    → Private rooms (OPS_TENANT, OPS_OWNER) become read-only archives
    → Combined room stays active for post-deal coordination until closure is CONFIRMED
    → All rooms are never deleted
```

**Failure path**:

- Ops can mark negotiation FAILED at any point from INITIATED onward
- Failure reason is mandatory (see Failure Reasons section)
- status → FAILED (terminal)

**Expiry path**:

- System auto-flags negotiations with no activity for a configurable number of days
- Admin can mark as EXPIRED (terminal). If the deal revives later, ops must create a new negotiation record.

---

## State Machine

### Negotiation Status

```
                    ┌───────────┐
                    │ INITIATED │  ← Ops starts negotiation after INTERESTED visit
                    └─────┬─────┘
                          │ (ops begins discussion)
                          ▼
                    ┌────────┐
                    │ ACTIVE │  ← Shuttle diplomacy in private rooms
                    └───┬────┘
                        │
              ┌─────────┼──────────┐
              │                    │
              ▼                    ▼
    ┌────────────────┐         ┌────────┐
    │ TERMS_PROPOSED │ ←──┐    │ FAILED │
    └───────┬────────┘    │    └────────┘
            │             │    (terminal)
            │ (party      │
            │  counters)  │
            ▼             │
    ┌──────────────────┐  │
    │ COUNTER_PROPOSED │──┘  (ops creates new proposal version)
    └──────────────────┘
            │
            │ (ops shares updated proposal)
            ▼
    ┌────────────────┐
    │ TERMS_PROPOSED │  (cycles until both sign off)
    └───────┬────────┘
            │ (both parties sign)
            ▼
    ┌───────────────┐
    │ TERMS_AGREED  │  ← Terms locked, no changes without new version
    └───────┬───────┘
            │ (token collected)
            ▼
    ┌─────────────────┐
    │ TOKEN_COLLECTED │
    └────────┬────────┘
             │ (ops begins post-agreement checklist)
             ▼
    ┌──────────────────────────┐
    │ DOCUMENTATION_IN_PROGRESS│
    └────────────┬─────────────┘
                 │ (all 10 mandatory items complete)
                 ▼
    ┌──────────────────────┐
    │ READY_FOR_CLOSURE    │  ← Closure creation unblocked
    └──────────────────────┘
            (terminal — closure takes over)

Any state from INITIATED onward → FAILED (ops marks failed with reason)
Any state from ACTIVE onward → EXPIRED (system flags, admin confirms)
```

### Transition Table

| From                        | To                          | Trigger                                                             | Who            |
| --------------------------- | --------------------------- | ------------------------------------------------------------------- | -------------- |
| (new)                       | `INITIATED`                 | Ops starts negotiation on INTERESTED visit                          | Admin          |
| `INITIATED`                 | `ACTIVE`                    | Ops begins discussion in any room                                   | Admin          |
| `INITIATED`                 | `FAILED`                    | Ops marks failed before any discussion                              | Admin          |
| `ACTIVE`                    | `TERMS_PROPOSED`            | Ops creates and shares first terms proposal                         | Admin          |
| `ACTIVE`                    | `FAILED`                    | Ops marks failed (reason required)                                  | Admin          |
| `ACTIVE`                    | `EXPIRED`                   | No activity for X days (system flags, admin confirms)               | System/Admin   |
| `TERMS_PROPOSED`            | `COUNTER_PROPOSED`          | Either party counters via chat                                      | Tenant/Owner   |
| `TERMS_PROPOSED`            | `TERMS_AGREED`              | Both parties sign off on proposal                                   | Tenant + Owner |
| `TERMS_PROPOSED`            | `FAILED`                    | Ops marks failed                                                    | Admin          |
| `TERMS_PROPOSED`            | `EXPIRED`                   | No activity for X days                                              | System/Admin   |
| `COUNTER_PROPOSED`          | `TERMS_PROPOSED`            | Ops creates new proposal version                                    | Admin          |
| `TERMS_AGREED`              | `TERMS_PROPOSED`            | Either party withdraws agreement (ops creates new proposal version) | Admin          |
| `COUNTER_PROPOSED`          | `FAILED`                    | Ops marks failed                                                    | Admin          |
| `TERMS_AGREED`              | `TOKEN_COLLECTED`           | Token advance recorded                                              | Admin          |
| `TERMS_AGREED`              | `FAILED`                    | Deal collapses after agreement (rare)                               | Admin          |
| `TOKEN_COLLECTED`           | `DOCUMENTATION_IN_PROGRESS` | Ops begins checklist                                                | Admin          |
| `DOCUMENTATION_IN_PROGRESS` | `READY_FOR_CLOSURE`         | All 10 mandatory items complete                                     | System         |
| `DOCUMENTATION_IN_PROGRESS` | `FAILED`                    | Deal collapses during documentation                                 | Admin          |

**Terminal states**: `READY_FOR_CLOSURE`, `FAILED`, `EXPIRED`

**Key rules**:

- Only visits with `outcome: INTERESTED` can trigger a negotiation.
- One negotiation per tenant per listing. If a tenant re-inquires after a FAILED negotiation, ops creates a new negotiation record.
- Multiple tenants can have simultaneous active negotiations on the same listing (owner picks who to proceed with).
- Closure creation is blocked unless the linked negotiation is `READY_FOR_CLOSURE`.
- Terms are locked after both parties sign. Creating a new proposal version resets sign-off status.
- If a party withdraws after sign-off, the signed proposal is marked `SUPERSEDED`, a new proposal version is created, and both prior sign-off records are invalidated for active decisioning.

---

## Terms Proposal

### What Gets Negotiated

The structured terms proposal captures 11 negotiated terms (stored across 15 fields):

| Field                     | Type             | Description                                                                             |
| ------------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| `monthly_rent`            | number (paise)   | Monthly rent amount. ₹25,000 = `2500000`.                                               |
| `security_deposit`        | number (paise)   | Security deposit amount.                                                                |
| `security_deposit_months` | number           | Deposit expressed as months of rent (informational, calculated from above two fields).  |
| `lock_in_period_months`   | number           | Lock-in period in months (from either side).                                            |
| `notice_period_months`    | number           | Notice period in months (from either side).                                             |
| `move_in_date`            | number (Unix ms) | Target move-in date.                                                                    |
| `maintenance_charges`     | number (paise)   | Monthly maintenance amount.                                                             |
| `maintenance_paid_by`     | string           | `TENANT` / `OWNER` / `SPLIT`                                                            |
| `rent_escalation_type`    | string           | `PERCENTAGE` / `FIXED_AMOUNT` / `NONE`                                                  |
| `rent_escalation_value`   | number           | Annual escalation: percentage (e.g., `5` for 5%) or fixed paise amount. Zero if `NONE`. |
| `furnishing_terms`        | string           | Free text: what owner provides, painting responsibilities, inclusions/exclusions.       |
| `brokerage_tenant_side`   | number (paise)   | Brokerage amount collected from tenant. Manually decided per deal.                      |
| `brokerage_owner_side`    | number (paise)   | Brokerage amount collected from owner. Manually decided per deal.                       |
| `token_advance_amount`    | number (paise)   | Token advance amount to be collected.                                                   |
| `special_conditions`      | string           | Free text: no pets, parking terms, visitor policy, etc.                                 |

### Proposal Lifecycle

- Ops creates proposals; only ops can create or update proposals.
- Each proposal is a new versioned record — full history is preserved, nothing is overwritten.
- Ops can share a proposal into any room (private or combined).
- In private rooms, ops may share a proposal showing numbers that differ from what the other side sees — this is permitted brokering behavior.
- In the combined room, the proposal shared must reflect the actual agreed terms — both sides see identical numbers.
- Both parties sign off at the deal level (not per-room). Sign-off is on the proposal record itself.
- After both parties sign, the proposal is locked. Any change requires creating a new version, which resets sign-off status.

### Sign-Off

- Each party (tenant, owner) independently signs a proposal.
- Sign-off records: who signed, when, which proposal version.
- Both signatures required before status can advance to `TERMS_AGREED`.
- Signing constitutes agreement to all negotiated terms as recorded.
- Signed proposals are permanent — never deleted, never modified.

---

## Token Advance

### Collection Flow

```
1. Ops selects refund policy from options (before collecting)
2. Ops shares refund policy conditions with tenant (via chat or formal notice)
3. Tenant explicitly agrees to refund policy conditions in the app
4. Token collected (UPI, cash, or bank transfer in V1)
5. negotiation_token_records record created with all details
6. Negotiation status advances: TERMS_AGREED → TOKEN_COLLECTED
```

### Refund Policy Options

Ops selects one of the following before collecting:

| Policy                   | Description                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| `NON_REFUNDABLE`         | Token is non-refundable under any circumstances.                            |
| `REFUNDABLE_WITHIN_DAYS` | Refundable if tenant cancels within X days (configurable: 3, 5, or 7 days). |
| `PARTIAL_REFUND`         | Partial refund of configurable percentage.                                  |
| `CASE_BY_CASE`           | Management decides on a case-by-case basis.                                 |

Tenant must explicitly agree to the selected policy before token is recorded. This agreement is captured in the `negotiation_token_records` record.

### Token Record Fields

| Field                   | Type               | Description                                                     |
| ----------------------- | ------------------ | --------------------------------------------------------------- |
| `negotiation_id`        | Id<"negotiations"> | Parent negotiation                                              |
| `amount`                | number (paise)     | Token amount collected                                          |
| `collected_at`          | number (Unix ms)   | When collected                                                  |
| `collection_method`     | string             | `UPI` / `CASH` / `BANK_TRANSFER`                                |
| `refund_policy`         | string             | One of the four policy options above                            |
| `refund_days`           | number             | Days window (only for `REFUNDABLE_WITHIN_DAYS`)                 |
| `refund_percentage`     | number             | Percentage (only for `PARTIAL_REFUND`)                          |
| `tenant_agreed_at`      | number (Unix ms)   | When tenant agreed to refund policy                             |
| `status`                | string             | `PENDING` / `COLLECTED` / `REFUNDED` / `FORFEITED` / `DISPUTED` |
| `collected_by_admin_id` | Id<"users">        | Ops agent who recorded the collection                           |
| `notes`                 | string             | Optional notes                                                  |

---

## Brokerage

Brokerage is manually decided per deal. There is no formula or auto-calculation.

- Both tenant-side and owner-side brokerage amounts are fields on the terms proposal.
- Both parties must explicitly sign off on the terms proposal (which includes brokerage amounts) before the negotiation can advance.
- Preferred collection timing: upfront, deducted from first month's rent. Ops has flexibility on timing to avoid losing a deal.
- Brokerage belongs to the platform for facilitating the deal and cannot be transferred to any individual.
- In V1, brokerage terms are captured as free-text fields with guardrails (amounts in paise, mandatory sign-off). Configurable structure is a V2 enhancement.

---

## Mandatory Post-Agreement Checklist

After both parties sign off on terms, ops must complete all ten items before closure is unblocked. The system enforces this — closure creation is blocked until all items are marked complete.

| #   | Item                             | What Ops Records                                                                                                                                               |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Agreed terms recorded**        | All terms in the signed proposal are present. System validates automatically.                                                                                  |
| 2   | **Both-party sign-off captured** | Both `negotiation_terms_signatures` records exist for the active proposal. System validates automatically.                                                     |
| 3   | **Token payment recorded**       | `negotiation_token_records` record exists with status `COLLECTED`. Ops confirms.                                                                               |
| 4   | **Brokerage terms recorded**     | Both `brokerage_tenant_side` and `brokerage_owner_side` are set on the signed proposal. System validates automatically.                                        |
| 5   | **Police verification status**   | Enum values: `NOT_STARTED` (default) / `INITIATED` / `PENDING` / `COMPLETE`. Gate condition: status is anything other than `NOT_STARTED`.                      |
| 6   | **Society NOC status**           | Enum values: `NOT_STARTED` (default) / `APPLIED` / `PENDING` / `APPROVED` / `REJECTED`. Gate condition: status is anything other than `NOT_STARTED`.           |
| 7   | **Owner KYC status**             | Enum values: `NOT_STARTED` (default) / `DOCUMENTS_REQUESTED` / `DOCUMENTS_RECEIVED` / `VERIFIED`. Gate condition: status is anything other than `NOT_STARTED`. |
| 8   | **Agreement drafting status**    | Enum values: `NOT_STARTED` (default) / `DRAFT_SENT` / `REVIEW` / `SIGNED` / `UPLOADED`. Gate condition: status is `SIGNED` or `UPLOADED`.                      |
| 9   | **Stamp/registration status**    | Enum values: `NOT_STARTED` (default) / `STAMP_PURCHASED` / `NOTARIZED` / `REGISTERED`. Gate condition: status is anything other than `NOT_STARTED`.            |
| 10  | **Rent agreement uploaded**      | PDF attachment is mandatory. Drafted offline on a third-party platform. Ops uploads the signed PDF.                                                            |

Items 1, 2, and 4 are validated automatically by the system when the proposal is signed. Items 3 and 5-10 require explicit ops action. The negotiation status advances to `READY_FOR_CLOSURE` only when all ten items are complete.

Ops cannot skip any item. There is no override or bypass for this checklist.

---

## Multiple Tenants for the Same Flat

When multiple tenants are interested in the same listing:

- Each interested tenant gets their own independent set of three rooms and their own `negotiations` record.
- Owner receives full details of all interested tenants: name, phone, profession, budget, preferred move-in date, family details.
- Owner picks which tenant to proceed with. Ops facilitates this selection via the Ops-Owner room.
- Ops may verbally use "another party is interested" as leverage in private rooms. The app does not surface competing tenant details to any tenant.
- Negotiations for non-selected tenants are marked FAILED with reason `OWNER_SELECTED_OTHER_TENANT`.

---

## Negotiation Failure

When ops marks a negotiation FAILED, a failure reason is mandatory. Trackable reasons:

| Reason Code                   | Description                                               |
| ----------------------------- | --------------------------------------------------------- |
| `RENT_GAP_TOO_LARGE`          | Tenant and owner could not agree on rent amount           |
| `DEPOSIT_DISAGREEMENT`        | Deposit amount or terms could not be agreed               |
| `TENANT_GHOSTED`              | Tenant stopped responding                                 |
| `OWNER_CHANGED_MIND`          | Owner withdrew from negotiation                           |
| `HOUSE_RULES_CONFLICT`        | Tenant's lifestyle conflicts with owner's house rules     |
| `TIMELINE_MISMATCH`           | Move-in date or lock-in period could not be aligned       |
| `OWNER_SELECTED_OTHER_TENANT` | Owner chose to proceed with a different interested tenant |
| `BROKERAGE_DISAGREEMENT`      | Either party refused brokerage terms                      |
| `OTHER`                       | Free-text reason (ops must provide notes)                 |

---

## Escalation

Ops escalates to Team Lead, then to Founder if needed.

The system auto-flags negotiations for review when:

- No activity in the negotiation for a configurable number of days (default: 7 days) — `negotiation_stale_days` in `system_config`
- More than a configurable number of proposal rounds without sign-off (default: 5 rounds) — `negotiation_max_rounds` in `system_config`
- Token collected but rent agreement not uploaded within a configurable number of days (default: 3 days) — `negotiation_token_agreement_days` in `system_config`

Auto-flagged negotiations appear in a dedicated admin queue for review. Flags do not block the negotiation — they surface it for human attention.

---

## Anti-Scam Guardrails

| Ops Scam Vector                                                          | Platform Prevention                                                                                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Side deals** (introduces parties directly, takes deal off-platform)    | AI masking strips all PII from every message. All communication is logged and visible to admins. Parties cannot exchange contact details through the chat.                             |
| **Fake negotiations** (tells different numbers to manipulate both sides) | Private rooms permit different numbers — this is normal brokering. Combined room and formal signed proposals create accountability. Full message history is auditable by super admins. |
| **Rushing closures** (skips documentation to collect brokerage faster)   | Mandatory 10-item checklist gates closure. System blocks closure creation until all items are complete. Rent agreement PDF upload is non-negotiable.                                   |
| **Hiding tenant options from owner**                                     | Owner receives full details of all interested tenants. Owner selects who to negotiate with.                                                                                            |
| **Ghost tenants** (fabricates interest to inflate activity metrics)      | All interest must flow through a verifiable inquiry and completed visit with `INTERESTED` outcome. Negotiation cannot be created without a real visit record.                          |
| **Brokerage diversion** (collecting brokerage personally)                | Brokerage terms are recorded in the signed proposal. Both parties sign off. Amounts are visible to super admins.                                                                       |

---

## Room Lifecycle

- All three rooms remain open even after the deal closes or fails.
- After the negotiation reaches `READY_FOR_CLOSURE` or `FAILED`, private rooms become read-only archives.
- The combined room remains active for post-deal coordination (move-in logistics, etc.) and becomes read-only after closure is confirmed.
- Rooms are never deleted.

---

## User Stories

### Ops: Initiate Negotiation

**As an ops agent**, I want to start a negotiation after a tenant visit with an INTERESTED outcome, so I can broker the deal between tenant and owner.

**Acceptance Criteria**:

- "Start Negotiation" action visible on any tenant inquiry with a completed visit outcome of `INTERESTED`
- Clicking creates a `negotiations` record and opens the Ops-Tenant room automatically
- Negotiation appears in ops negotiation queue at `(admin)/negotiations/`
- Ops can see all three rooms from the negotiation detail page

### Ops: Manage Three Rooms

**As an ops agent**, I want to communicate privately with each party and bring them together when terms are close, so I can broker effectively.

**Acceptance Criteria**:

- Negotiation detail page shows three room tabs: "Tenant Room", "Owner Room", "Combined Room"
- Ops-Owner room opens when ops clicks "Open Owner Room" (triggers owner invite flow)
- Combined room opens when ops clicks "Open Combined Room"
- Each room shows full message history with original + masked versions for ops
- Ops can send messages as "DemoRentals" in any room
- Rooms not yet opened show a clear "Not opened yet" state

### Ops: Create Terms Proposal

**As an ops agent**, I want to create a structured terms proposal and share it into rooms, so both parties have a clear record of what is being offered.

**Acceptance Criteria**:

- "New Terms Proposal" button on negotiation detail page
- Form covering all negotiated terms (all amounts in rupees on frontend, stored in paise)
- Ops selects which room(s) to share the proposal into
- Proposal appears as a special card in the chat (not a regular message)
- Previous proposal versions accessible from a "Proposal History" panel
- Proposal version number displayed on each proposal card

### Tenant: Review and Sign Terms

**As a tenant**, I want to review the proposed terms and sign off when I agree, so the deal can move forward.

**Acceptance Criteria**:

- Tenant sees active terms proposal in their room (Ops-Tenant or Combined)
- Proposal card shows all negotiated terms in a readable format (amounts in rupees)
- "Accept Terms" button with confirmation dialog: "By accepting, you agree to all terms as listed."
- "Counter" button opens a text field to communicate counter-position via chat
- After signing: proposal card shows "You have signed" badge
- After both parties sign: proposal card shows "Both parties have agreed" and terms are locked

### Owner: Review and Sign Terms

**As an owner**, I want to review the proposed terms and sign off when I agree, so the deal is formally recorded.

**Acceptance Criteria**:

- Owner sees active terms proposal in their room (Ops-Owner or Combined)
- Same proposal card UI as tenant
- "Accept Terms" and "Counter" buttons
- After signing: proposal card shows "You have signed" badge
- After both parties sign: proposal card shows "Both parties have agreed"

### Ops: Record Token Advance

**As an ops agent**, I want to record the token advance collection with the agreed refund policy, so the financial record is complete.

**Acceptance Criteria**:

- "Record Token" action available after both parties sign terms
- Form: amount (₹), collection date, method (UPI/Cash/Bank Transfer), refund policy selection
- If `REFUNDABLE_WITHIN_DAYS`: input for number of days (3, 5, or 7)
- If `PARTIAL_REFUND`: input for percentage
- "Tenant must agree to refund policy" checkbox — ops confirms tenant has been informed and agreed
- On save: `negotiation_token_records` record created, status advances to `TOKEN_COLLECTED`

### Ops: Complete Post-Agreement Checklist

**As an ops agent**, I want to complete all mandatory documentation items so the deal is properly recorded and closure is unblocked.

**Acceptance Criteria**:

- Checklist panel visible on negotiation detail page after `TOKEN_COLLECTED`
- Each of the 10 items shown with current status
- Items 1, 2, 4 auto-checked by system (validated from proposal and signatures)
- Item 3 (token): auto-checked when token record exists
- Item 5 (police verification): dropdown to select status
- Item 6 (society NOC): dropdown to select status
- Item 7 (owner KYC): dropdown to select status
- Item 8 (agreement drafting): dropdown to select status
- Item 9 (stamp/registration): dropdown to select status
- Item 10 (rent agreement): file upload (PDF only, mandatory)
- Progress indicator: "X of 10 items complete"
- When all 10 complete: status advances to `READY_FOR_CLOSURE`, closure creation unblocked
- Ops cannot mark closure as ready manually — system validates all items

### Admin: Negotiation Queue

**As an admin**, I want to see all active negotiations and their status, so I can monitor pipeline health and intervene when needed.

**Acceptance Criteria**:

- Negotiation queue at `(admin)/negotiations/`
- Status tabs: INITIATED, ACTIVE, TERMS_PROPOSED, COUNTER_PROPOSED, TERMS_AGREED, TOKEN_COLLECTED, DOCUMENTATION_IN_PROGRESS, READY_FOR_CLOSURE, FAILED, EXPIRED
- Each row shows: listing (building + flat), tenant name, current status, days in current status, auto-flag indicator
- Auto-flagged negotiations highlighted (stale, too many rounds, token without agreement)
- Click row → negotiation detail page with all three rooms and checklist

---

## Convex Functions

### Queries

```
negotiations.list({ status?, listing_id?, tenant_id?, cursor? }) → { negotiations: Negotiation[], nextCursor? }
negotiations.getById({ id }) → Negotiation + rooms + active proposal + checklist status
negotiations.getByInquiry({ tenant_inquiry_id }) → Negotiation (one per inquiry)
negotiations.listFlagged() → Negotiation[] (stale, too many rounds, token without agreement)

negotiationTermsProposals.listByNegotiation({ negotiation_id }) → TermsProposal[] (all versions)
negotiationTermsProposals.getActive({ negotiation_id }) → TermsProposal (latest version)

negotiationTokenRecords.getByNegotiation({ negotiation_id }) → TokenRecord
```

### Mutations

```
negotiations.initiate({ tenant_inquiry_id }) → Negotiation + OPS_TENANT chat_channel
  // Validates: visit exists with outcome INTERESTED
  // Status: INITIATED
  // Auto-opens OPS_TENANT room

negotiations.openOwnerRoom({ negotiation_id }) → chat_channel (OPS_OWNER)
  // Creates OPS_OWNER channel, triggers owner invite flow

negotiations.openCombinedRoom({ negotiation_id }) → chat_channel (COMBINED)
  // Creates COMBINED channel with all three participants

negotiations.markFailed({ negotiation_id, failure_reason, notes? }) → Negotiation
  // Status: any state from INITIATED onward → FAILED
  // failure_reason is mandatory

negotiations.markExpired({ negotiation_id }) → Negotiation
  // Admin confirms system-flagged expiry
  // Status: ACTIVE or TERMS_PROPOSED or COUNTER_PROPOSED → EXPIRED

negotiationTermsProposals.create({ negotiation_id, ...proposal_term_fields }) → TermsProposal
  // Creates new versioned proposal (version = previous_max + 1)
  // Status: DRAFT

negotiationTermsProposals.share({ proposal_id, room_types }) → TermsProposal
  // room_types: ("OPS_TENANT" | "OPS_OWNER" | "COMBINED")[]
  // Shares proposal card into selected rooms
  // Advances negotiation status: ACTIVE → TERMS_PROPOSED (or COUNTER_PROPOSED → TERMS_PROPOSED)

negotiationTermsSignatures.sign({ proposal_id }) → TermsSignature
  // Caller must be tenant or owner participant
  // Records sign-off with timestamp
  // If both parties signed: negotiation status → TERMS_AGREED, proposal locked

negotiationTokenRecords.record({ negotiation_id, amount, collected_at, collection_method, refund_policy, refund_days?, refund_percentage?, notes? }) → TokenRecord
  // Validates: negotiation status is TERMS_AGREED
  // Creates token record with status COLLECTED
  // Advances negotiation status: TERMS_AGREED → TOKEN_COLLECTED

negotiationTokenRecords.updateStatus({ token_record_id, status, notes? }) → TokenRecord
  // status: PENDING | COLLECTED | REFUNDED | FORFEITED | DISPUTED
  // Admin updates token status post-collection

negotiations.updateChecklistItem({ negotiation_id, item, value }) → Negotiation
  // item: "police_verification_status" | "society_noc_status" | "owner_kyc_status" | "agreement_drafting_status" | "stamp_registration_status" | "rent_agreement_storage_id"
  // Updates the specific checklist field
  // System checks if all 10 items complete → if yes, status → READY_FOR_CLOSURE
```

---

## Data Model

### `negotiations` Table

| Field                        | Type                              | Required | Description                                                                                       |
| ---------------------------- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `tenant_inquiry_id`          | Id<"tenant_inquiries">            | yes      | Source inquiry (links to listing, tenant, visit)                                                  |
| `listing_id`                 | Id<"listings">                    | yes      | Denormalized from inquiry                                                                         |
| `tenant_user_id`             | Id<"users">                       | yes      | Tenant participant                                                                                |
| `owner_user_id`              | Id<"users">                       | no       | Owner participant (null until owner accepts invite)                                               |
| `initiated_by_admin_id`      | Id<"users">                       | yes      | Ops agent who started the negotiation                                                             |
| `status`                     | string                            | yes      | See state machine above                                                                           |
| `failure_reason`             | string                            | no       | Required when status is `FAILED`                                                                  |
| `failure_notes`              | string                            | no       | Additional context for failure                                                                    |
| `ops_tenant_channel_id`      | Id<"chat_channels">               | no       | OPS_TENANT room (created on initiation)                                                           |
| `ops_owner_channel_id`       | Id<"chat_channels">               | no       | OPS_OWNER room (created when ops opens it)                                                        |
| `combined_channel_id`        | Id<"chat_channels">               | no       | COMBINED room (created when ops opens it)                                                         |
| `active_proposal_id`         | Id<"negotiation_terms_proposals"> | no       | Current active proposal (latest version)                                                          |
| `police_verification_status` | string                            | no       | `NOT_STARTED` / `INITIATED` / `PENDING` / `COMPLETE` (default `NOT_STARTED`)                      |
| `society_noc_status`         | string                            | no       | `NOT_STARTED` / `APPLIED` / `PENDING` / `APPROVED` / `REJECTED` (default `NOT_STARTED`)           |
| `owner_kyc_status`           | string                            | no       | `NOT_STARTED` / `DOCUMENTS_REQUESTED` / `DOCUMENTS_RECEIVED` / `VERIFIED` (default `NOT_STARTED`) |
| `agreement_drafting_status`  | string                            | no       | `NOT_STARTED` / `DRAFT_SENT` / `REVIEW` / `SIGNED` / `UPLOADED` (default `NOT_STARTED`)           |
| `stamp_registration_status`  | string                            | no       | `NOT_STARTED` / `STAMP_PURCHASED` / `NOTARIZED` / `REGISTERED` (default `NOT_STARTED`)            |
| `rent_agreement_storage_id`  | Id<"\_storage">                   | no       | Uploaded rent agreement PDF                                                                       |
| `initiated_at`               | number                            | yes      | Unix ms — when negotiation was created                                                            |
| `terms_agreed_at`            | number                            | no       | Unix ms — when both parties signed                                                                |
| `ready_for_closure_at`       | number                            | no       | Unix ms — when all checklist items completed                                                      |
| `failed_at`                  | number                            | no       | Unix ms — when marked failed                                                                      |
| `last_activity_at`           | number                            | yes      | Unix ms — updated on any action (for stale detection)                                             |
| `stale_flagged`              | boolean                           | yes      | `true` if system auto-flagged for inactivity                                                      |
| `rounds_flagged`             | boolean                           | yes      | `true` if system auto-flagged for too many proposal rounds                                        |

**Indexes**: `by_tenant_inquiry_id`, `by_listing_id`, `by_tenant_user_id`, `by_owner_user_id`, `by_status`, `by_initiated_by_admin_id`, `by_last_activity_at`, `by_stale_flagged`

### `negotiation_terms_proposals` Table

| Field                     | Type               | Required | Description                                                                                                                                                                                  |
| ------------------------- | ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `negotiation_id`          | Id<"negotiations"> | yes      | Parent negotiation                                                                                                                                                                           |
| `version`                 | number             | yes      | Incrementing version number (1, 2, 3, ...)                                                                                                                                                   |
| `status`                  | string             | yes      | Lifecycle status of this proposal version. See `PROPOSAL_STATUS` enum (`DRAFT` / `SENT` / `COUNTERED` / `ACCEPTED_TENANT` / `ACCEPTED_OWNER` / `ACCEPTED_BOTH` / `REJECTED` / `SUPERSEDED`). |
| `monthly_rent`            | number             | yes      | Monthly rent in paise                                                                                                                                                                        |
| `security_deposit`        | number             | yes      | Security deposit in paise                                                                                                                                                                    |
| `security_deposit_months` | number             | yes      | Deposit as months of rent (informational)                                                                                                                                                    |
| `lock_in_period_months`   | number             | yes      | Lock-in period in months                                                                                                                                                                     |
| `notice_period_months`    | number             | yes      | Notice period in months                                                                                                                                                                      |
| `move_in_date`            | number             | yes      | Target move-in date (Unix ms)                                                                                                                                                                |
| `maintenance_charges`     | number             | yes      | Monthly maintenance in paise                                                                                                                                                                 |
| `maintenance_paid_by`     | string             | yes      | `TENANT` / `OWNER` / `SPLIT`                                                                                                                                                                 |
| `rent_escalation_type`    | string             | yes      | `PERCENTAGE` / `FIXED_AMOUNT` / `NONE`                                                                                                                                                       |
| `rent_escalation_value`   | number             | yes      | Annual escalation value (percentage or paise). Zero if `NONE`.                                                                                                                               |
| `furnishing_terms`        | string             | yes      | Free text: inclusions, painting, owner provisions                                                                                                                                            |
| `brokerage_tenant_side`   | number             | yes      | Brokerage from tenant in paise                                                                                                                                                               |
| `brokerage_owner_side`    | number             | yes      | Brokerage from owner in paise                                                                                                                                                                |
| `token_advance_amount`    | number             | yes      | Token advance in paise                                                                                                                                                                       |
| `special_conditions`      | string             | no       | Free text: no pets, parking, etc.                                                                                                                                                            |
| `created_by_admin_id`     | Id<"users">        | yes      | Ops agent who created this version                                                                                                                                                           |
| `created_at`              | number             | yes      | Unix ms                                                                                                                                                                                      |
| `shared_to_rooms`         | string[]           | no       | Room types this proposal was shared into                                                                                                                                                     |
| `shared_at`               | number             | no       | Unix ms — when first shared                                                                                                                                                                  |
| `is_locked`               | boolean            | yes      | `true` after both parties sign. No edits permitted.                                                                                                                                          |
| `locked_at`               | number             | no       | Unix ms — when locked                                                                                                                                                                        |

**Indexes**: `by_negotiation_id`, `by_negotiation_and_version` (compound: negotiation_id + version)

### `negotiation_terms_signatures` Table

| Field              | Type                              | Required | Description                                                       |
| ------------------ | --------------------------------- | -------- | ----------------------------------------------------------------- |
| `proposal_id`      | Id<"negotiation_terms_proposals"> | yes      | Which proposal was signed                                         |
| `negotiation_id`   | Id<"negotiations">                | yes      | Denormalized for query convenience                                |
| `user_id`          | Id<"users">                       | yes      | Who signed                                                        |
| `user_role`        | string                            | yes      | `TENANT` / `OWNER`                                                |
| `signed_at`        | number                            | yes      | Unix ms                                                           |
| `agreement_text`   | string                            | yes      | Static text: "I agree to all terms as recorded in this proposal." |
| `proposal_version` | number                            | yes      | Snapshot of version number at signing time                        |

**Indexes**: `by_proposal_id`, `by_negotiation_id`, `by_user_id`, `by_proposal_and_user` (compound: proposal_id + user_id — unique per user per proposal)

### `negotiation_token_records` Table

| Field                   | Type               | Required | Description                                                                     |
| ----------------------- | ------------------ | -------- | ------------------------------------------------------------------------------- |
| `negotiation_id`        | Id<"negotiations"> | yes      | Parent negotiation                                                              |
| `amount`                | number             | yes      | Token amount in paise                                                           |
| `collected_at`          | number             | yes      | Unix ms — when collected                                                        |
| `collection_method`     | string             | yes      | `UPI` / `CASH` / `BANK_TRANSFER`                                                |
| `refund_policy`         | string             | yes      | `NON_REFUNDABLE` / `REFUNDABLE_WITHIN_DAYS` / `PARTIAL_REFUND` / `CASE_BY_CASE` |
| `refund_days`           | number             | no       | Days window (only for `REFUNDABLE_WITHIN_DAYS`)                                 |
| `refund_percentage`     | number             | no       | Percentage (only for `PARTIAL_REFUND`)                                          |
| `tenant_agreed_at`      | number             | yes      | Unix ms — when tenant agreed to refund policy                                   |
| `status`                | string             | yes      | `PENDING` / `COLLECTED` / `REFUNDED` / `FORFEITED` / `DISPUTED`                 |
| `collected_by_admin_id` | Id<"users">        | yes      | Ops agent who recorded the collection                                           |
| `notes`                 | string             | no       | Optional notes                                                                  |

**Indexes**: `by_negotiation_id`, `by_status`

### `chat_channels` Table Extension

The existing `chat_channels` table (defined in [Deal Room](18-deal-room.md)) requires a new field:

| Field            | Type               | Required | Description                                                                               |
| ---------------- | ------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `channel_type`   | string             | yes      | `DEAL_ROOM` (existing) / `OPS_TENANT` / `OPS_OWNER` / `COMBINED` / `GUARD_ADMIN` (future) |
| `negotiation_id` | Id<"negotiations"> | no       | Parent negotiation (null for `DEAL_ROOM` channels)                                        |

**New index**: `by_negotiation_id`

---

## Admin Panel UI

### Negotiation Queue (`/admin/negotiations`)

| Column         | Description                                       |
| -------------- | ------------------------------------------------- |
| Listing        | Building + flat + society                         |
| Tenant         | Tenant name                                       |
| Status         | Current negotiation status                        |
| Days in Status | How long in current status                        |
| Proposal Round | Current proposal version number                   |
| Flags          | Stale / Too many rounds / Token without agreement |
| Ops Agent      | Who initiated                                     |

**Filters**: Status, Listing, Tenant, Ops Agent, Flagged only, Date range

**Actions**: View Detail, Mark Failed, Mark Expired

### Negotiation Detail Page (`/admin/negotiations/[id]`)

Layout: two-column. Left: negotiation metadata + checklist. Right: tabbed room view.

**Left panel**:

- Negotiation status badge
- Linked inquiry and listing (with links)
- Tenant and owner details
- Proposal history panel (all versions, with sign-off status per version)
- "New Terms Proposal" button
- Post-agreement checklist (10 items with status indicators)
- Token record (if collected)
- Failure reason (if failed)
- Escalation notes

**Right panel (tabs)**:

- "Tenant Room" tab — OPS_TENANT channel chat
- "Owner Room" tab — OPS_OWNER channel chat (with "Open Owner Room" button if not yet opened)
- "Combined Room" tab — COMBINED channel chat (with "Open Combined Room" button if not yet opened)
- Each tab shows full message history with original + masked for ops
- Ops can send messages in any open room

### Checklist Panel

```
Post-Agreement Checklist                    5 of 10 complete

[x] 1. Agreed terms recorded               Auto-validated
[x] 2. Both-party sign-off captured        Auto-validated
[x] 3. Token payment recorded              Recorded: ₹50,000 (UPI, Feb 17)
[x] 4. Brokerage terms recorded            Auto-validated
[ ] 5. Police verification status          [Select status ▼]
[ ] 6. Society NOC status                  [Select status ▼]
[ ] 7. Owner KYC status                    [Select status ▼]
[ ] 8. Agreement drafting status           [Select status ▼]
[ ] 9. Stamp/registration status           [Select status ▼]
[ ] 10. Rent agreement uploaded            [Upload PDF]

Closure is blocked until all 10 items are complete.
```

---

## Business Rules

1. **Trigger**: Negotiation can only be initiated on a tenant inquiry that has a completed visit with `outcome: INTERESTED`. No other trigger is valid.

2. **One negotiation per inquiry**: One `negotiations` record per `tenant_inquiries` record. If a negotiation fails and the tenant re-inquires, a new inquiry and new negotiation record are created.

3. **Multiple tenants, same listing**: Multiple simultaneous active negotiations on the same listing are permitted. Each tenant has their own independent set of rooms and proposal history.

4. **Ops-only proposal creation**: Only ops agents can create, update, or share terms proposals. Tenants and owners cannot create proposals — they can only accept or counter via chat.

5. **Private room confidentiality**: The OPS_TENANT room is never visible to the owner. The OPS_OWNER room is never visible to the tenant. This is enforced at the query level — participant lists are checked on every message fetch.

6. **Brokerage is not algorithmic**: Brokerage amounts on both sides are manually entered by ops per deal. No formula, no auto-calculation.

7. **Terms lock on dual sign-off**: Once both parties sign a proposal, `is_locked: true` is set. Any subsequent change requires creating a new proposal version, which resets sign-off status on the new version.

8. **Token before documentation**: Token must be recorded before the post-agreement checklist can be started. Checklist item 3 (token recorded) is a prerequisite for the status to advance to `DOCUMENTATION_IN_PROGRESS`.

9. **Rent agreement PDF is mandatory**: Item 10 of the checklist (rent agreement upload) is non-negotiable. The system will not advance to `READY_FOR_CLOSURE` without a valid `rent_agreement_storage_id`.

10. **Closure is blocked**: The closure creation mutation must validate that the linked negotiation is in `READY_FOR_CLOSURE` status. Attempting to create a closure on a negotiation in any other status returns an error.

11. **Rooms are permanent**: Chat rooms are never deleted. After deal completion or failure, rooms become read-only archives. The full message history is preserved for audit and dispute resolution.

12. **AI masking applies to all rooms**: All tenant and owner messages in all three rooms go through the AI masking pipeline (same as Deal Room). Ops sees originals. Parties see masked versions only.

13. **Money in paise**: All monetary fields (monthly_rent, security_deposit, maintenance_charges, brokerage amounts, token amount) are stored as integers in paise. Frontend displays in rupees. No floating point.

14. **Dates as Unix ms**: All date fields (move_in_date, collected_at, signed_at, etc.) are stored as Unix milliseconds via `Date.now()`.

15. **Escrow is V2**: Token advance collection in V1 supports UPI, cash, and bank transfer. Escrow integration is deferred. See [V2 Backlog](../09-v2-backlog.md).

---

## Edge Cases

- **Owner never accepts invite to Ops-Owner room**: Negotiation can still proceed. Ops communicates with owner off-platform and records outcomes manually. The Ops-Tenant room and Combined room can still be used. Closure is not blocked by owner's room participation status.

- **Tenant ghosts after terms agreed**: Ops marks negotiation FAILED with reason `TENANT_GHOSTED`. Token forfeiture is handled per the recorded refund policy. Token record status updated to `FORFEITED`.

- **Owner changes mind after signing**: Ops creates a new proposal version and marks the previously signed proposal `SUPERSEDED`. Both parties must re-sign on the new version, and prior sign-off records are invalidated for active decisioning. History remains preserved.

- **Multiple ops agents on same negotiation**: Any admin can view and act on any negotiation. The `initiated_by_admin_id` records who started it, but ownership is not exclusive. All actions are audit-logged.

- **Proposal shared to wrong room**: Ops cannot unsend a proposal. Ops can send a corrective message as "DemoRentals" clarifying the error. A new proposal version with correct terms can be created and shared.

- **Tenant negotiating 3+ flats simultaneously**: Each negotiation is independent. Tenant sees their active negotiations in their portal. Ops sees all active negotiations in the queue.

- **Ops handles 20+ deals simultaneously**: The negotiation queue with status filters and flag indicators is designed for high-volume ops management. Stale flags surface deals that need attention.

- **Rent agreement uploaded but wrong file**: Ops can re-upload. The `rent_agreement_storage_id` field is overwritten. Previous upload is orphaned in storage (cleanup is a V2 concern).

- **Token disputed after collection**: Token record status updated to `DISPUTED`. Ops notes the dispute. Resolution is handled offline. Platform records the dispute for evidence.

- **Negotiation stale flag fires but deal is actually active**: Admin dismisses the flag. `stale_flagged` set back to `false`. `last_activity_at` is updated on any action, which prevents re-flagging until the next inactivity window.

---

## Schema Prerequisites

Before implementing this feature, the following schema and code changes are required:

1. **`convex/schema.ts`**: Add new table definitions: `negotiations`, `negotiation_terms_proposals`, `negotiation_terms_signatures`, `negotiation_token_records`
2. **`convex/schema.ts`**: Extend `chat_channels` table with `channel_type` and `negotiation_id` fields
3. **`convex/schema.ts`**: Add `negotiation_id: v.optional(v.id("negotiations"))` field to the `closures` table (links closure to the negotiation that gated it)
4. **`lib/constants.ts`**: Add enums: `NEGOTIATION_STATUS`, `NEGOTIATION_FAILURE_REASON`, `TERMS_PROPOSAL_MAINTENANCE_PAID_BY`, `TERMS_PROPOSAL_ESCALATION_TYPE`, `TOKEN_REFUND_POLICY`, `TOKEN_RECORD_STATUS`, `NEGOTIATION_CHECKLIST_POLICE_STATUS`, `NEGOTIATION_CHECKLIST_NOC_STATUS`, `CHAT_CHANNEL_TYPE` (extending existing)
5. **`convex/functions.ts`**: Add new tables to `AUDITED_TABLES`: `negotiations`, `negotiation_terms_proposals`, `negotiation_terms_signatures`, `negotiation_token_records`
6. **`convex/schema.ts` audit validators**: Extend `auditActionValidator` with negotiation-related audit actions
7. **`convex/seed.ts`**: Add default `system_config` entries: `negotiation_stale_days`, `negotiation_max_rounds`, `negotiation_token_agreement_days`

---

## Known Tech Debt & Deferred Items

Items identified during 3 waves of Oracle adversarial review. Severity indicates operational impact if left unresolved.

### Medium Priority (implement in next relevant phase)

| #   | Item                                                  | Impact                                                                                                                                                | Resolution Path                                                                                                                                                            |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | **No token settlement mutations**                     | Collected tokens on failed/expired deals remain in limbo. No way to mark REFUNDED/FORFEITED/DISPUTED.                                                 | Implement `settleTokenRecord` mutation when financial operations are built out (likely Phase 36 Monetization). Requires integration with payment provider settlement APIs. |
| 14  | **Terminal negotiations don't archive chat channels** | Participants can technically keep messaging on dead negotiations. Rooms should be read-only after FAILED/EXPIRED.                                     | Add channel archival to `markFailed`/`markExpired` mutations. Set `is_archived: true` on all three rooms. Requires `is_archived` field on `chat_channels` table.           |
| 15  | **No automated STALLED/EXPIRED transitions**          | Cron jobs compute escalation flags but don't auto-transition negotiations to `STALLED` or `EXPIRED`. All state transitions are manual (admin-driven). | Add cron-driven auto-transition with configurable thresholds when ops volume requires it. Requires new `negotiation_auto_transition_days` config key.                      |

### Low Priority (acceptable at current scale)

| #   | Item                                           | Impact                                                                                                                                                                                         | Resolution Path                                                                                                                                                 |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **listForAdmin full-table pagination**         | Uses custom cursor instead of `.paginate()`. Works correctly but won't scale past ~10k negotiations.                                                                                           | Rewrite to server-cursor pagination when volume warrants. Requires refactoring `listForAdmin` query to use Convex `.paginate()` API.                            |
| 2   | **Cron N+1 scan pattern**                      | `checkStaleNegotiations`, `checkTokenWithoutAgreement`, and `checkExcessiveRoundsCron` do full-table scans. Works at current scale, will need index-based batching at >5k active negotiations. | Implement index-based batching with cursor pagination. Requires new indexes on `last_activity_at`, `created_at`, and `rounds_count`.                            |
| 3   | **getProposalHistory N+1**                     | Fetches signatures per proposal in a loop. Works with typical proposal counts (<20).                                                                                                           | Optimize with batch query if proposal volumes grow. Requires refactoring to single batch query for all signatures per negotiation.                              |
| 4   | **Same-user double-sign race**                 | No uniqueness constraint on `(proposal_id, user_id)` in `negotiation_terms_signatures`. A user could theoretically sign twice in rapid succession.                                             | Mitigated by UI guards; needs DB-level uniqueness constraint if high concurrency becomes an issue. Add compound unique index on `(proposal_id, user_id)`.       |
| 5   | **Double closure creation race**               | No uniqueness constraint on `negotiation_id` in closures table. Two admins could create closures simultaneously.                                                                               | Needs canonical pointer field or DB constraint. Add unique index on `negotiation_id` in closures table.                                                         |
| 6   | **Visit completion duplication**               | Negotiation initiation side effects could fire twice on visit completion retries.                                                                                                              | Needs idempotency guard (check if negotiation already exists for inquiry before creating). Add `if (existing) return existing` check in `visits.complete` hook. |
| 7   | **Concurrent proposal version collision**      | Version number computed as `max(version) + 1` from query. Two simultaneous creates could get the same version.                                                                                 | Needs atomic counter on negotiation doc. Refactor to use Convex atomic operations or increment field.                                                           |
| 8   | **`initiated_by_admin_id` semantic mismatch**  | Field stores the guard's user ID despite the "admin" name. Rename to `initiated_by_user_id` in a future migration.                                                                             | Rename field in schema and all references. Requires data migration for existing records.                                                                        |
| 9   | **Dead schema fields**                         | `failure_notes`, `agreement_drafting_status`, `stamp_registration_status` on negotiations appear unused.                                                                                       | Remove or implement in future phase. Audit codebase to confirm no references, then drop fields.                                                                 |
| 10  | **No soft-delete mutations**                   | `is_deleted` modeled on negotiation tables but no mutation sets it.                                                                                                                            | Add admin soft-delete when needed. Implement `softDeleteNegotiation` mutation with audit trail.                                                                 |
| 11  | **No periodic excessive-rounds recalculation** | Only computed on proposal creation and daily cron. Status changes between cron runs aren't caught.                                                                                             | Acceptable frequency for operational use. Recalculate on every proposal creation and status change if needed.                                                   |
| 12  | **Cron vs dismiss flag race**                  | Escalation flags can reappear after admin dismissal if cron runs between dismiss and resolution.                                                                                               | Acceptable UX friction; fix with "dismissed_until" timestamp if it becomes annoying. Add `escalation_dismissed_until` field to negotiations table.              |

---

## Cross-References

| Topic                                                                   | Document                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| Chat infrastructure (AI masking, batching, owner invite, read receipts) | [Deal Room](18-deal-room.md)                        |
| Tenant inquiry pipeline that feeds into negotiation                     | [Tenant Inquiry](13-tenant-inquiry.md)              |
| Closure and payouts that follow negotiation                             | [Closure & Payouts](07-closure-and-payouts.md)      |
| State machine format and validation pattern                             | [State Machines](../04-state-machines.md)           |
| Data model conventions (paise, Unix ms, soft delete)                    | [Data Models](../02-data-models.md)                 |
| Escrow (V2 token advance)                                               | [V2 Backlog](../09-v2-backlog.md)                   |
| All status enums and config keys                                        | [Constants Reference](../13-constants-reference.md) |
| Visit outcomes that trigger negotiation                                 | [Visit Management](06-visit-management.md)          |
