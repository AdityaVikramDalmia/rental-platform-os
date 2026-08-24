# Feature: Transaction Completion Rails

> **Note**: Despite the filename `26-*`, this feature is **Phase 34 (P34)** in the implementation roadmap. Phase 26 is Rent Negotiation (see `19-rent-negotiation.md`). The filename reflects the original document numbering before the strategic improvement plan reorganized phase numbers.

> **Priority**: #34 in implementation order
> **Personas**: Tenant, Owner, OPS, Admin
> **Dependencies**: P08 (Closures), P19 (Tenant Inquiry Pipeline), P20 (Owner Services), P30 (Field Ops), P31 (Owner Entity) | Soft dependency: P33 (Trust Display)
> **Route Groups**: `(tenant)/`, `(ops)/`, `(admin)/`, `(public)/`

> **Implementation Note (Feb 2026):** V1 uses stub/manual workflows for KYC and eSign. Provider integration (Aadhaar/PAN/DigiLocker, Leegality) is planned for V2.

## Purpose

Complete the rental transaction lifecycle from "tenant decides to rent" through "tenant moves in." Today, the platform loses operating control after visit intent because agreement signing, token confirmation, deposit transfer, police verification, and move-in handover happen offline. This phase introduces structured digital rails for each post-visit step while staying compatible with current manual payment and field operations.

## V1 Scope

### V1 Integrate (Build in Product)

- KYC integrations via aggregator APIs: Aadhaar OTP verify, PAN verify, DigiLocker document fetch
- KYC packet lifecycle with evidence storage, retry/error states, and admin/ops queue APIs
- Maharashtra Leave & License agreement draft generation with required clauses and typed placeholders
- eSign integration (Leegality class provider) with owner -> tenant signing status tracking and webhook sync
- Token and deposit workflows as record-only ledgers (amount, date, UTR/reference, status, receipts)
- Move-in handover gating using transaction-linked `handover_checklists` before transaction completion

### V1 Stub / Manual (Track in Product, Execute Operationally)

- Employer verification (company + HR email capture, ops verifies manually)
- Previous landlord reference verification (phone capture + call/WhatsApp attempt log)
- Police verification (pre-filled PDF generation + portal guidance; no API automation)
- eStamping and IGR registration handoff (guided checklist, no direct filing API)

### V2 Deferred (Explicitly Out of Scope)

- Payment gateway processing for token/deposit/rent (Razorpay/Cashfree rails)
- In-app escrow and automated settlement/reconciliation
- Face match/liveness/video KYC and direct UIDAI integration
- Automated IGR filing/eStamp API execution
- Multi-state legal template packs beyond Maharashtra

### Out of Scope — V1 Owner Portal

- V1 owner interaction is external-only: owner receives Leegality eSign link via email/SMS and payment confirmation notifications.
- No dedicated owner dashboard/portal for transaction tracking is included in P34.
- Owner portal implementation is deferred to Phase 38 (`P38 — Owner Portal & Dashboard`).

## Entities Involved

- `rental_transactions` table (new — master transaction state across all post-visit steps)
- `rental_agreements` table (new — agreement terms, document, signature state)
- `kyc_packets` table (new — tenant verification state, manual police-verification tracking, and evidence)
- `token_bookings` table (new — hold/release/refund lifecycle)
- `deposit_records` table (new — deposit payment confirmation and receipts)
- `closures` table (extend — optional linkage to transaction)
- `handover_checklists` table (new — transaction-linked move-in handover readiness records)
- `tenant_inquiries` table (extend — optional `transaction_id` backlink for inquiry -> transaction traceability)

## Flow: Happy Path

```text
1. Admin/OPS clicks **Start Transaction** from approved tenant inquiry detail
   -> `createTransaction({ tenant_inquiry_id, ... })` creates `rental_transaction` (`INITIATED`)
   -> mutation auto-populates `listing_id` + `tenant_user_id` from inquiry and stores inquiry `transaction_id` backlink

2. KYC packet opened and processed
   -> transaction moves to `KYC_PENDING`
   -> Aadhaar/PAN/DigiLocker checks + manual fallback checks run
   -> transaction becomes `KYC_VERIFIED` (or `KYC_REJECTED` and loops back)

3. Agreement draft generated and sent for eSign
   -> transaction moves to `AGREEMENT_PENDING`
   -> agreement dispatch transitions transaction to `AGREEMENT_SENT`
   -> owner signs, then tenant signs
   -> transaction becomes `AGREEMENT_SIGNED`

4. Token recorded (record-only workflow)
   -> transaction moves to `TOKEN_PENDING`
   -> OPS/admin records amount + reference + policy snapshot
   -> transaction becomes `TOKEN_RECEIVED`

5. Deposit recorded (record-only workflow)
   -> transaction moves to `DEPOSIT_PENDING`
   -> partial/full records captured until received state
   -> transaction becomes `DEPOSIT_RECEIVED`

6. Move-in handover scheduled and checklist completed
   -> transaction moves to `MOVE_IN_SCHEDULED`
   -> checklist readiness gate passes
   -> transaction becomes `COMPLETED`
```

## Status Model

### `rental_transactions.status`

```typescript
const VALID_TRANSACTION_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  INITIATED: ["KYC_PENDING", "CANCELLED"],
  KYC_PENDING: ["KYC_VERIFIED", "KYC_REJECTED", "CANCELLED"],
  KYC_VERIFIED: ["AGREEMENT_PENDING", "CANCELLED"],
  KYC_REJECTED: ["KYC_PENDING", "CANCELLED"],
  AGREEMENT_PENDING: ["AGREEMENT_SENT", "CANCELLED"],
  AGREEMENT_SENT: ["AGREEMENT_SIGNED", "AGREEMENT_PENDING", "CANCELLED"],
  AGREEMENT_SIGNED: ["TOKEN_PENDING", "CANCELLED"],
  TOKEN_PENDING: ["TOKEN_RECEIVED", "CANCELLED"],
  TOKEN_RECEIVED: ["DEPOSIT_PENDING", "CANCELLED"],
  DEPOSIT_PENDING: ["DEPOSIT_RECEIVED", "CANCELLED"],
  DEPOSIT_RECEIVED: ["MOVE_IN_SCHEDULED", "CANCELLED"],
  MOVE_IN_SCHEDULED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
```

Cancellation is supported from every non-terminal transaction status in V1 (`INITIATED`, `KYC_PENDING`, `KYC_VERIFIED`, `KYC_REJECTED`, `AGREEMENT_PENDING`, `AGREEMENT_SENT`, `AGREEMENT_SIGNED`, `TOKEN_PENDING`, `TOKEN_RECEIVED`, `DEPOSIT_PENDING`, `DEPOSIT_RECEIVED`, `MOVE_IN_SCHEDULED`). `COMPLETED`, `CANCELLED`, and future `DISPUTED` terminal states cannot transition to `CANCELLED`.

### Canonical Status Vocabulary

- `rental_transactions.status`: `INITIATED`, `KYC_PENDING`, `KYC_VERIFIED`, `KYC_REJECTED`, `AGREEMENT_PENDING`, `AGREEMENT_SENT`, `AGREEMENT_SIGNED`, `TOKEN_PENDING`, `TOKEN_RECEIVED`, `DEPOSIT_PENDING`, `DEPOSIT_RECEIVED`, `MOVE_IN_SCHEDULED`, `COMPLETED`, `CANCELLED`
- `kyc_packets.overall_status`: `PENDING`, `IN_PROGRESS`, `PROVIDER_ERROR`, `NEEDS_REVIEW`, `VERIFIED`, `REJECTED`
- `rental_agreements.status`: `DRAFT`, `SENT`, `PARTIALLY_SIGNED`, `SIGNED`, `EXPIRED`, `CANCELLED`
- `token_bookings.status`: `PENDING`, `RECORDED`, `CONFIRMED`, `DISPUTED`, `CANCELLED`
- `deposit_records.status`: `PENDING`, `RECORDED`, `CONFIRMED`, `DISPUTED`, `CANCELLED`

### `kyc_packets.overall_status`

```typescript
const VALID_KYC_TRANSITIONS: Record<KycPacketStatus, KycPacketStatus[]> = {
  PENDING: ["IN_PROGRESS"],
  IN_PROGRESS: ["NEEDS_REVIEW", "VERIFIED", "REJECTED", "PROVIDER_ERROR"],
  PROVIDER_ERROR: ["IN_PROGRESS"],
  NEEDS_REVIEW: ["VERIFIED", "REJECTED"],
  VERIFIED: [],
  REJECTED: ["PENDING"],
};
```

### `rental_agreements.status`

```typescript
const VALID_AGREEMENT_TRANSITIONS: Record<AgreementStatus, AgreementStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["PARTIALLY_SIGNED", "SIGNED", "EXPIRED", "CANCELLED"],
  PARTIALLY_SIGNED: ["SIGNED", "EXPIRED", "CANCELLED"],
  SIGNED: [],
  EXPIRED: ["DRAFT"],
  CANCELLED: [],
};
```

### `token_bookings.status`

```typescript
const VALID_TOKEN_BOOKING_TRANSITIONS: Record<TokenBookingStatus, TokenBookingStatus[]> = {
  PENDING: ["RECORDED", "CANCELLED"],
  RECORDED: ["CONFIRMED", "DISPUTED"],
  CONFIRMED: [],
  DISPUTED: ["CONFIRMED", "CANCELLED"],
  CANCELLED: [],
};
```

### `deposit_records.status`

```typescript
const VALID_DEPOSIT_RECORD_TRANSITIONS: Record<DepositRecordStatus, DepositRecordStatus[]> = {
  PENDING: ["RECORDED", "CANCELLED"],
  RECORDED: ["CONFIRMED", "DISPUTED"],
  CONFIRMED: [],
  DISPUTED: ["CONFIRMED", "CANCELLED"],
  CANCELLED: [],
};
```

## Schema (Proposed)

### `rental_transactions` Table

| Field                 | Type                                                                                                                                                                                                                                                                                                                                                                                                                | Required | Description                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| tenant_user_id        | `Id<"users">`                                                                                                                                                                                                                                                                                                                                                                                                       | yes      | FK to tenant user                                                              |
| listing_id            | `Id<"listings">`                                                                                                                                                                                                                                                                                                                                                                                                    | yes      | FK to listing                                                                  |
| owner_id              | `Id<"owners">`                                                                                                                                                                                                                                                                                                                                                                                                      | yes      | FK to owner                                                                    |
| closure_id            | `v.optional(Id<"closures">)`                                                                                                                                                                                                                                                                                                                                                                                        | no       | Linked closure record (if already created)                                     |
| tenant_inquiry_id     | `v.optional(Id<"tenant_inquiries">)`                                                                                                                                                                                                                                                                                                                                                                                | no       | Provenance link to P19 inquiry when transaction is initiated from inquiry flow |
| source_negotiation_id | `v.optional(v.string())`                                                                                                                                                                                                                                                                                                                                                                                            | no       | Reserved placeholder for future P26 negotiation linkage (not active in P34)    |
| status                | `v.union(v.literal("INITIATED"), v.literal("KYC_PENDING"), v.literal("KYC_VERIFIED"), v.literal("KYC_REJECTED"), v.literal("AGREEMENT_PENDING"), v.literal("AGREEMENT_SENT"), v.literal("AGREEMENT_SIGNED"), v.literal("TOKEN_PENDING"), v.literal("TOKEN_RECEIVED"), v.literal("DEPOSIT_PENDING"), v.literal("DEPOSIT_RECEIVED"), v.literal("MOVE_IN_SCHEDULED"), v.literal("COMPLETED"), v.literal("CANCELLED"))` | yes      | Transaction lifecycle status                                                   |
| monthly_rent_paise    | `v.number()`                                                                                                                                                                                                                                                                                                                                                                                                        | yes      | Agreed monthly rent in paise                                                   |
| deposit_amount_paise  | `v.number()`                                                                                                                                                                                                                                                                                                                                                                                                        | yes      | Deposit in paise                                                               |
| move_in_date          | `v.optional(v.number())`                                                                                                                                                                                                                                                                                                                                                                                            | no       | Planned move-in date (Unix ms)                                                 |
| cancellation_reason   | `v.optional(v.string())`                                                                                                                                                                                                                                                                                                                                                                                            | no       | Required when cancelled                                                        |
| created_at            | `v.number()`                                                                                                                                                                                                                                                                                                                                                                                                        | yes      | Unix ms                                                                        |
| updated_at            | `v.number()`                                                                                                                                                                                                                                                                                                                                                                                                        | yes      | Unix ms                                                                        |

**Indexes**: `by_tenant`, `by_listing`, `by_status`, `by_owner`, `by_tenant_inquiry_id`, `by_created_at`

### `rental_agreements` Table

| Field               | Type                                                                                                                                               | Required | Description                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| transaction_id      | `Id<"rental_transactions">`                                                                                                                        | yes      | FK to transaction                                                     |
| template_version    | `v.string()`                                                                                                                                       | yes      | Agreement template version                                            |
| terms               | `v.object({ ... })`                                                                                                                                | yes      | Structured terms (rent, deposit, lock-in, notice period, etc.)        |
| tenant_signature    | `v.optional(v.object({ ... }))`                                                                                                                    | no       | Tenant signature payload + timestamp                                  |
| owner_signature     | `v.optional(v.object({ ... }))`                                                                                                                    | no       | Owner signature payload + timestamp                                   |
| document_storage_id | `v.optional(Id<"_storage">)`                                                                                                                       | no       | Generated agreement PDF                                               |
| status              | `v.union(v.literal("DRAFT"), v.literal("SENT"), v.literal("PARTIALLY_SIGNED"), v.literal("SIGNED"), v.literal("EXPIRED"), v.literal("CANCELLED"))` | yes      | `DRAFT`, `SENT`, `PARTIALLY_SIGNED`, `SIGNED`, `EXPIRED`, `CANCELLED` |
| created_at          | `v.number()`                                                                                                                                       | yes      | Unix ms                                                               |

**Indexes**: `by_transaction_id`, `by_status`

### `kyc_packets` Table

| Field                      | Type                                                                                                                                                            | Required | Description                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| transaction_id             | `Id<"rental_transactions">`                                                                                                                                     | yes      | FK to transaction                                                                             |
| tenant_user_id             | `Id<"users">`                                                                                                                                                   | yes      | FK to tenant                                                                                  |
| aadhaar_verified           | `v.boolean()`                                                                                                                                                   | yes      | eKYC result                                                                                   |
| employer_verified          | `v.boolean()`                                                                                                                                                   | yes      | Employer verification result                                                                  |
| landlord_reference         | `v.optional(v.object({ ... }))`                                                                                                                                 | no       | Prior landlord reference capture                                                              |
| overall_status             | `v.union(v.literal("PENDING"), v.literal("IN_PROGRESS"), v.literal("PROVIDER_ERROR"), v.literal("NEEDS_REVIEW"), v.literal("VERIFIED"), v.literal("REJECTED"))` | yes      | `PENDING`, `IN_PROGRESS`, `PROVIDER_ERROR`, `NEEDS_REVIEW`, `VERIFIED`, `REJECTED`            |
| police_verification_status | `v.optional(v.union(v.literal("NOT_STARTED"), v.literal("FORM_GENERATED"), v.literal("SUBMITTED"), v.literal("VERIFIED"), v.literal("REJECTED")))`              | no       | V1 stub manual tracking: `NOT_STARTED`, `FORM_GENERATED`, `SUBMITTED`, `VERIFIED`, `REJECTED` |
| police_form_storage_id     | `v.optional(Id<"_storage">)`                                                                                                                                    | no       | Generated pre-filled police-verification form                                                 |
| police_ack_storage_id      | `v.optional(Id<"_storage">)`                                                                                                                                    | no       | Uploaded acknowledgment copy from manual submission                                           |
| verified_at                | `v.optional(v.number())`                                                                                                                                        | no       | Unix ms                                                                                       |

**Indexes**: `by_transaction_id`, `by_tenant`

### `token_bookings` Table

| Field           | Type                                                                                                                          | Required | Description                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| transaction_id  | `Id<"rental_transactions">`                                                                                                   | yes      | FK to transaction                                           |
| amount_paise    | `v.number()`                                                                                                                  | yes      | Token amount in paise                                       |
| policy_snapshot | `v.object({ ... })`                                                                                                           | yes      | Immutable refund policy captured at hold time               |
| status          | `v.union(v.literal("PENDING"), v.literal("RECORDED"), v.literal("CONFIRMED"), v.literal("DISPUTED"), v.literal("CANCELLED"))` | yes      | `PENDING`, `RECORDED`, `CONFIRMED`, `DISPUTED`, `CANCELLED` |
| held_at         | `v.number()`                                                                                                                  | yes      | Unix ms                                                     |
| resolved_at     | `v.optional(v.number())`                                                                                                      | no       | Unix ms                                                     |

**Indexes**: `by_transaction_id`, `by_status`

### `deposit_records` Table

| Field                 | Type                                                                                                                          | Required | Description                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| transaction_id        | `Id<"rental_transactions">`                                                                                                   | yes      | FK to transaction                                           |
| amount_paise          | `v.number()`                                                                                                                  | yes      | Deposit amount in paise                                     |
| paid_by_tenant_at     | `v.optional(v.number())`                                                                                                      | no       | Tenant transfer timestamp (Unix ms)                         |
| confirmed_by_owner_at | `v.optional(v.number())`                                                                                                      | no       | Owner confirmation timestamp (Unix ms)                      |
| payment_reference     | `v.optional(v.string())`                                                                                                      | no       | UPI/bank reference number                                   |
| receipt_storage_id    | `v.optional(Id<"_storage">)`                                                                                                  | no       | Receipt upload                                              |
| status                | `v.union(v.literal("PENDING"), v.literal("RECORDED"), v.literal("CONFIRMED"), v.literal("DISPUTED"), v.literal("CANCELLED"))` | yes      | `PENDING`, `RECORDED`, `CONFIRMED`, `DISPUTED`, `CANCELLED` |

**Indexes**: `by_transaction_id`, `by_status`

### `handover_checklists` Table

| Field          | Type                                                              | Required | Description                              |
| -------------- | ----------------------------------------------------------------- | -------- | ---------------------------------------- |
| transaction_id | `Id<"rental_transactions">`                                       | yes      | FK to transaction                        |
| items          | `v.array(v.object({ label, checked, checked_at?, checked_by? }))` | yes      | Checklist items with completion metadata |
| completed_at   | `v.optional(v.number())`                                          | no       | Unix ms when checklist is completed      |
| completed_by   | `v.optional(Id<"users">)`                                         | no       | User who marked checklist complete       |
| is_deleted     | `v.boolean()`                                                     | yes      | Soft delete flag                         |
| created_at     | `v.number()`                                                      | yes      | Unix ms                                  |
| updated_at     | `v.number()`                                                      | yes      | Unix ms                                  |

**Indexes**: `by_transaction_id`

### Existing Table Extensions

#### `closures` (extend)

- Add `transaction_id: v.optional(v.id("rental_transactions"))`
- Add index `by_transaction_id`
- Enforce gate in `closures.confirm`: when `transaction_id` exists, linked transaction must be `COMPLETED`

#### `tenant_inquiries` (extend)

- Add `transaction_id: v.optional(v.id("rental_transactions"))`
- Add index `by_transaction_id`
- Maintain backlink on transaction creation so inquiry screens can show linked transaction stage

## Convex Functions

### Queries

```ts
rentalTransactions.getById({ id })
  -> transaction + agreement + kyc (including police verification fields) + token + deposit + move-in checklist summary

rentalTransactions.listByTenant({ cursor? })
  -> tenant transaction timeline

rentalTransactions.listForOps({ status?, cursor? })
  -> ops work queue

rentalTransactions.listForAdmin({ status?, owner_id?, cursor? })
  -> admin transaction board
```

### Mutations

```ts
rentalTransactions.createTransaction({ tenant_inquiry_id, monthly_rent_paise, deposit_amount_paise, move_in_date? })
  -> RentalTransaction

kycPackets.submit({ transaction_id, aadhaar_payload, employer_details, landlord_reference? })
  -> KycPacket

kycPackets.verify({ transaction_id, aadhaar_verified, employer_verified, notes? })
  -> KycPacket

tokenBookings.hold({ transaction_id, amount_paise })
  -> TokenBooking

tokenBookings.resolve({ transaction_id, resolution, reason? })
  -> TokenBooking

rentalAgreements.generate({ transaction_id, template_version, terms })
  -> RentalAgreement

rentalAgreements.sign({ transaction_id, signer_role, signature_payload })
  -> RentalAgreement

depositRecords.markPaid({ transaction_id, amount_paise, payment_reference? })
  -> DepositRecord

depositRecords.confirmByOwner({ transaction_id, receipt_storage_id? })
  -> DepositRecord

kycPackets.updatePoliceVerificationStatus({ transaction_id, police_verification_status, police_ack_storage_id? })
  -> KycPacket

rentalTransactions.createMoveInChecklist({ transaction_id })
  -> HandoverChecklist

rentalTransactions.complete({ transaction_id, handover_checklist_id })
  -> RentalTransaction

rentalTransactions.cancel({ transaction_id, reason })
  -> RentalTransaction
```

Entry contract notes:

- `createTransaction` is admin/ops initiated from tenant inquiry detail ("Start Transaction" action).
- Mutation reads `tenant_inquiry_id`, derives `listing_id` and `tenant_user_id` from inquiry, and writes `tenant_inquiries.transaction_id` backlink.
- If inquiry has no tenant linkage (`tenant_id` missing), mutation rejects with actionable error.

## User Stories

### Tenant: Complete deal digitally

As a tenant, I want one guided transaction timeline after I choose a flat, so I can finish agreement, KYC, deposit, and move-in without confusion.

- Tenant sees current stage and pending actions.
- Tenant can upload required documents and track verification statuses.
- Tenant can see token/deposit records and downloadable receipts.

### Owner: V1 external signing only (portal deferred)

As an owner, in V1 I receive agreement signing links and payment confirmations externally without logging into an owner dashboard.

- V1: Owner receives Leegality signing link via email/SMS and completes signature externally.
- V1: Owner receives payment confirmation notifications.
- Deferred to P38: in-app owner dashboard for tracking readiness, signatures, and handover progression.

### OPS/Admin: Operate and unblock transactions

As OPS/admin, I want a transaction control plane to track bottlenecks and resolve exceptions quickly.

- Queue filters by stage and aging SLA.
- Manual overrides with reason are available for controlled exceptions.
- Every state change is auditable.

## Business Rules

1. A `rental_transaction` starts from tenant inquiry detail via `createTransaction({ tenant_inquiry_id, ... })` after admin/OPS confirms tenant intent.
2. KYC is mandatory before agreement progression (`KYC_PENDING -> KYC_VERIFIED`).
3. V1 integrated KYC checks are Aadhaar OTP, PAN, and DigiLocker document fetch; employer and landlord checks are manual-review workflows.
4. Agreement status can move to signed only after both tenant and owner signatures are persisted.
5. If signing deadline expires while transaction is `AGREEMENT_SENT`, agreement status becomes `EXPIRED` and transaction returns to `AGREEMENT_PENDING` for regeneration.
6. Token and deposit rails are record-only in V1 (amount/date/reference/receipt); no payment gateway processing.
7. Refund outcomes must follow immutable policy snapshot captured at token-record time.
8. Deposit amount mismatch to agreement terms requires explicit admin override reason.
9. Police verification is tracked manually on `kyc_packets` (status + optional form/acknowledgment storage IDs); no dedicated `police_verification_cases` table and no direct government API integration in V1.
10. Move-in completion requires a completed `handover_checklists` record linked to the transaction; do not reuse `checklist_instances` because that table requires `visit_id`.
11. Closure linkage is explicit: `closures.transaction_id` optionally links closure to a transaction, and `closures.confirm` must reject confirmation unless linked transaction status is `COMPLETED`.
12. `tenant_inquiries.transaction_id` stores reciprocal linkage so inquiry detail can show transaction status and deep-link to transaction workflow.
13. Only one active (`non-CANCELLED`, `non-COMPLETED`) transaction per listing at a time.
14. All money values are paise integers; all date/time values are Unix milliseconds.
15. Mutating endpoints require transaction/KYC/agreement permissions (`transactions.manage`, `kyc.verify`, `agreements.generate`).
16. P34 transaction provenance is anchored on `tenant_inquiry_id`; `source_negotiation_id` remains an optional placeholder for future P26 linkage.
17. If a listing is archived while a linked transaction is still non-terminal, auto-cancel the transaction with reason `LISTING_ARCHIVED`.

## Concurrency & Idempotency Rules

1. Status-changing mutations validate expected current status before applying transitions.
2. Signature operations are idempotent per signer role; duplicate signature submissions do not create extra records.
3. `createTransaction` rejects creation if another active transaction exists for the same listing.
4. Move-in completion checks checklist status at write time to prevent race-condition completion.
5. Cancel operation is terminal and cannot be reversed; restart requires a new transaction record.

## Edge Cases

- **Tenant exits after token held**: Token resolved by policy (`full`, `partial`, or `forfeit`) and transaction is cancelled.
- **Owner exits after agreement signed**: Mandatory admin escalation and full token refund to tenant.
- **Employer verification fails**: Transaction remains blocked in `KYC_PENDING` unless admin override is explicitly recorded.
- **Agreement terms change after both signatures**: Existing agreement is cancelled; regenerated agreement must be re-signed.
- **Multiple tenants competing for same listing**: One active transaction enforced; others remain in queue/waitlist.
- **Deposit dispute**: `deposit_records.status` set to `DISPUTED` and transaction cannot complete until resolved.
- **Police verification delayed beyond move-in date**: transaction remains in `MOVE_IN_SCHEDULED` and completion requires manual exemption reason + checklist override metadata.

## Acceptance & Verification Checklist

1. End-to-end path from intent to move-in completion exists with auditable stage changes.
2. KYC gate blocks agreement completion until required checks pass.
3. Token policy snapshot controls refund behavior deterministically.
4. Agreement requires both signatures before transaction advances.
5. Deposit and police verification statuses are tracked with timestamped evidence (police status tracked on `kyc_packets`).
6. Move-in completion requires checklist completion from transaction-linked `handover_checklists`.
7. Closure confirmation checks linked transaction status and blocks confirmation until transaction is `COMPLETED` when `transaction_id` is present.

## Related Documents

- [Closure & Payouts](07-closure-and-payouts.md) — closure linkage and post-deal financial context.
- [Owner Services](14-owner-services.md) — owner onboarding data source.
- [Owner Entity & RM Foundation](21-owner-entity-and-rm.md) — canonical owner identity model.
- [Field Checklists](21-field-checklists.md) — move-in checklist engine reuse.
- [State Machines](../04-state-machines.md) — transition validation patterns.
- [Constants Reference](../13-constants-reference.md) — status and permission constants.
