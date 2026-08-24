---
id: P34-E04
title: Token & Deposit Workflow
phase: 34
status: pending
depends_on: ["P34-E01", "P34-E02", "P34-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P34-E04: Token & Deposit Workflow

> Phase 34 · Transaction Completion Rails · Status: pending

## Task Queue

- [ ] P34-E04-T01 — Implement token booking lifecycle mutations
- [ ] P34-E04-T02 — Implement deposit tracking and settlement records
- [ ] P34-E04-T03 — Generate receipts and enforce refund-policy metadata

## Current Implementation Snapshot

- `convex/tokenBookings.ts` already exists; exports: `hold`, `resolve`, `getByTransaction`.
- `convex/depositRecords.ts` already exists; exports: `markPaid`, `confirmByOwner`, `updateStatus`, `getByTransaction`.
- Schema already includes token booking and deposit record tables with status validators.
- `lib/constants.ts` already includes token/deposit status enums and transition maps.
- `convex/actions/receiptGenerator.ts` does not exist yet (not started).
- `deposit_records` schema currently does not include `payment_events`.
- Current deposit/token code does not include mismatch override enforcement logic.

---

### P34-E04-T01: Implement Token Booking Lifecycle Mutations

**Objective**: Build record-only token booking lifecycle with strict status controls and refund metadata capture.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — token booking scope and refund-window policy.
- `notes/features/20-deal-economics.md` — deal amount fields and financial recording constraints.
- `convex/payouts.ts` — status transition validation style.
- `lib/constants.ts` — enum/config key conventions.

**Key Rules**:

1. V1 is record-only: capture token amount, payment date, payment mode, UTR/reference, and verifier metadata; do not integrate payment gateway.
2. Transition flow must pass `validateTransactionTransition` before transaction status patch (`TOKEN_PENDING -> TOKEN_RECEIVED` or cancellation path).
3. Refund policy snapshot is immutable once token is recorded and must include refund window (`token_refund_window_days`).
4. Cancellation/refund updates require `reason`, `acted_by_user_id`, and timestamp for auditability.
5. Token booking statuses are canonical: `PENDING`, `RECORDED`, `CONFIRMED`, `DISPUTED`, `CANCELLED`.
6. Enforce this exact token booking transition map in backend validators:

   ```typescript
   const VALID_TOKEN_BOOKING_TRANSITIONS: Record<TokenBookingStatus, TokenBookingStatus[]> = {
     PENDING: ["RECORDED", "CANCELLED"],
     RECORDED: ["CONFIRMED", "DISPUTED"],
     CONFIRMED: [],
     DISPUTED: ["CONFIRMED", "CANCELLED"],
     CANCELLED: [],
   };
   ```

7. Add explicit `refundToken` mutation: validates token is in `DISPUTED` or `RECORDED` status, records refund amount/method/reference, transitions to `CANCELLED` with reason `REFUND_PROCESSED`. Requires `transactions.manage` permission. Records `refunded_by: v.id('users')`, `refunded_at: v.number()`, `refund_amount_paise: v.number()`, `refund_reference: v.optional(v.string())`.
8. ALL token booking mutations require `transactions.manage` permission. Token recording additionally requires `override_reason` if amount differs from negotiated terms. **Concrete rule for token override:** If token amount differs from the `token_booking_amount` field on the parent `rental_transactions` record (set during transaction creation from listing deposit terms), the mutation MUST require `override_reason` (string, non-empty) and `override_approved_by` (admin user ID). This ensures the transaction record is the single source of truth for expected token amounts.

**Schema Extensions Required** (fields not in current `convex/schema.ts` `token_bookings` table):

- `refunded_by: v.optional(v.id('users'))` — user who processed the refund
- `refunded_at: v.optional(v.number())` — Unix ms timestamp of refund processing
- `refund_amount_paise: v.optional(v.number())` — refund amount in paise
- `refund_reference: v.optional(v.string())` — UTR/reference for refund payment
- `override_reason: v.optional(v.string())` — reason for token amount override
- `override_approved_by: v.optional(v.id('users'))` — admin who approved the override

**Deliverables**:

- [ ] `convex/schema.ts` — add refund and override metadata fields to `token_bookings` table (see schema extensions above).
- [ ] `convex/tokenBookings.ts` — create/receive/cancel/refund mutations with transition checks.
- [ ] `lib/constants.ts` — token/refund status constants and config keys.
- [ ] `notes/13-constants-reference.md` — add token/refund constants section.

**Acceptance Criteria**:

- [ ] Token create mutation enforces required amount, policy, and payment reference fields.
- [ ] Refund/cancel states cannot be reached without reason + actor metadata.
- [ ] Transaction status advances only through legal map transitions.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/tokenBookings.ts lib/constants.ts
npm run test -- convex/tokenBookings.test.ts
```

**Out of Scope**: V1 integrate: record-only token lifecycle and refund metadata. V1 stub/manual: admin manually verifies UTR/payment proof. V2 deferred: Razorpay/Cashfree gateway settlement and automated bank reconciliation.

---

### P34-E04-T02: Implement Deposit Tracking and Settlement Records

**Objective**: Capture deposit collection and balance state with support for partial payments and dispute-safe settlement.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — deposit lifecycle and compliance guidance.
- `convex/schema.ts` — money + timestamp modeling conventions.
- `convex/verifications.ts` — mutation sequencing and validation style.
- `notes/04-state-machines.md` — transition validation patterns.

**Key Rules**:

1. Deposit entries are paise integers only (`v.number()`), and running totals must be arithmetic-safe (no floats).
2. Support partial deposit payments and compute outstanding balance deterministically.
3. If deposit exceeds two months' rent, surface compliance warning metadata (do not hard-block in V1).
4. Deposit record statuses are canonical: `PENDING`, `RECORDED`, `CONFIRMED`, `DISPUTED`, `CANCELLED`; transaction status sync remains `DEPOSIT_PENDING` -> `DEPOSIT_RECEIVED` only when completion conditions are met.
5. Enforce this exact deposit record transition map in backend validators:

   ```typescript
   const VALID_DEPOSIT_RECORD_TRANSITIONS: Record<DepositRecordStatus, DepositRecordStatus[]> = {
     PENDING: ["RECORDED", "CANCELLED"],
     RECORDED: ["CONFIRMED", "DISPUTED"],
     CONFIRMED: [],
     DISPUTED: ["CONFIRMED", "CANCELLED"],
     CANCELLED: [],
   };
   ```

6. If `deposit_records.amount_paise` differs from `rental_agreements.terms.deposit_amount_paise` for the same transaction, the deposit `RECORDED -> CONFIRMED` transition MUST require an explicit override: `override_reason: v.string()`, `override_by: v.id("users")`, `override_at: v.number()`. Mismatch override requires `requireAdmin(ctx)` - OPS cannot override deposit mismatches. This is a financial safeguard separate from `transactions.manage`. Without override metadata, the transition is blocked with error: `Deposit amount does not match agreement terms. Admin override required.`
7. Partial deposits use a CUMULATIVE SINGLE-ROW model in V1: `deposit_records.amount_paise` represents the total amount received so far. Each payment event appends to a `payment_events: v.array(v.object({ amount_paise: v.number(), payment_reference: v.optional(v.string()), recorded_at: v.number(), recorded_by: v.id('users') }))` field on the deposit record. Outstanding balance = `rental_agreements.terms.deposit_amount_paise - deposit_records.amount_paise`. Transaction advances to `DEPOSIT_RECEIVED` only when outstanding balance <= 0.
8. ALL deposit mutations require `transactions.manage` permission. Deposit confirmation mismatch-override path (rule 6) additionally requires `requireAdmin(ctx)`.

**Schema Extensions Required** (fields not in current `convex/schema.ts` `deposit_records` table):

- `payment_events: v.optional(v.array(v.object({ amount_paise: v.number(), payment_reference: v.optional(v.string()), recorded_at: v.number(), recorded_by: v.id('users') })))` — cumulative payment event log
- `override_reason: v.optional(v.string())` — reason for deposit mismatch override
- `override_by: v.optional(v.id('users'))` — admin who approved the override
- `override_at: v.optional(v.number())` — Unix ms timestamp of override approval

**Deliverables**:

- [ ] `convex/depositRecords.ts` — create/add-payment/mark-received/dispute/settle mutations and list/detail queries.
- [ ] `convex/schema.ts` — add `payment_events` array and override metadata fields to `deposit_records` schema (see schema extensions above).
- [ ] `convex/rentalTransactions.ts` — hooks to update transaction status after deposit milestones.
- [ ] `notes/features/26-transaction-completion-rails.md` — document partial-payment behavior and warning logic.

**Acceptance Criteria**:

- [ ] Deposit balance cannot become negative or drift across updates.
- [ ] Deposit receive mutation stores payment reference and confirmation timestamps.
- [ ] Dispute/settlement path captures reason and actor metadata.
- [ ] Deposit confirmation with mismatched amount is blocked unless admin provides override reason.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/depositRecords.ts convex/rentalTransactions.ts
npm run test -- convex/depositRecords.test.ts
```

**Out of Scope**: V1 integrate: record-keeping for deposit milestones and balances. V1 stub/manual: bank transfer confirmation remains ops/admin-driven. V2 deferred: automated payout rails and smart escrow disbursement.

---

### P34-E04-T03: Generate Receipts and Enforce Refund-Policy Metadata

**Objective**: Produce immutable receipt artifacts and enforce policy acknowledgments before financial status completion.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — receipt and refund workflow expectations.
- `convex/verifications.ts` — storage evidence pattern (`storage_id` + retrieval).
- `notes/11-convex-architecture.md` — Convex storage/file upload workflow.
- `convex/schema.ts` — `_storage` reference usage patterns.

**Key Rules**:

1. Auto-generate PDF receipts when token booking is recorded (`RECORDED`) and when deposit reaches `CONFIRMED`; store only `storage_id` in records.
2. Token dispute/cancel outcomes must stay within canonical token statuses (`CONFIRMED`, `DISPUTED`, `CANCELLED`) and remain fully auditable.
3. Refund policy acknowledgment text/version must be captured at booking time and referenced in receipt metadata.
4. Retrieval endpoints must use `ctx.storage.getUrl(storageId)` and enforce role checks.

**Deliverables**:

- [ ] `convex/actions/receiptGenerator.ts` (or equivalent) — PDF receipt generation action.
- [ ] `convex/tokenBookings.ts` and `convex/depositRecords.ts` — receipt storage ID persistence and fetch queries.
- [ ] `notes/features/26-transaction-completion-rails.md` — document receipt trigger points and refund-state transitions.

**Acceptance Criteria**:

- [ ] Token and deposit receipt IDs are persisted when token is `RECORDED` and deposit is `CONFIRMED`.
- [ ] Refund completion is blocked if policy acknowledgment snapshot is missing.
- [ ] Receipts are downloadable through signed storage URLs.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/actions/receiptGenerator.ts convex/tokenBookings.ts convex/depositRecords.ts
npm run test -- convex/tokenBookings.test.ts convex/depositRecords.test.ts
```

**Out of Scope**: V1 integrate: receipt generation + policy metadata enforcement. V1 stub/manual: manual exception handling for disputed payments. V2 deferred: gateway webhook receipt automation and third-party accounting exports.
