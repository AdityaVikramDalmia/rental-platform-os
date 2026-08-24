---
id: P36-E01
title: Fee Schema & Calculation
phase: 36
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P36-E01: Fee Schema & Calculation

## Epic Guardrails

- Shared file boundaries follow `tasks/phase-36-monetization-foundation/README.md` -> "File Ownership (Epic Boundaries)".

## Task Queue

- [ ] P36-E01-T01: Add transaction fee schema and slab config
- [ ] P36-E01-T02: Implement rent-band fee computation engine
- [ ] P36-E01-T03: Expose fee preview and persisted breakdown APIs

---

## T01: Add Transaction Fee Schema and Slab Config

### Objective

Define canonical fee slab storage and normalized revenue ledger schema with Convex validators and indexes.

### Required Reading

- `notes/features/28-monetization-foundation.md` — Flows + schema + deterministic fee rules
- `notes/10-convex-schema.md` — existing table style and index conventions
- `notes/13-constants-reference.md` — enum and config key conventions
- `notes/11-convex-architecture.md` — mutation/internalMutation patterns

### Key Rules

1. All money fields are paise integers.
2. Slab matching boundaries must be deterministic and non-overlapping.
3. `revenue_line_items` is append-only and never updated in-place for historical rows.
4. New tables must be added to audited table list.
5. Do not couple payout lifecycle state to fee schema writes.

### Deliverables

- [ ] `convex/schema.ts` — add `transaction_fees` and `revenue_line_items` with indexes
- [ ] `lib/constants.ts` — add P36 enum/constants and config key strings
- [ ] `convex/seed.ts` — seed default slab config keys
- [ ] `convex/functions.ts` — include monetization tables in `AUDITED_TABLES`

### Acceptance Criteria

1. `transaction_fees` supports deterministic slab lookup with active/effective date filtering.
2. `revenue_line_items` supports query by closure and by source type.
3. Seed creates the three fixed slab fee values in paise.
4. TypeScript infers strict table types with no `any` or ignore directives.
5. Audit logs fire on insert/update for both new tables.

### Verification

```bash
npx tsc --noEmit
npm run build
```

---

## T02: Implement Rent-Band Fee Computation Engine

### Objective

Implement internal deterministic fee engine with pass credit handling and custom quote gate.

### Required Reading

- `notes/features/28-monetization-foundation.md` — deterministic slab logic and custom quote workflow
- `notes/04-state-machines.md` — status validation style
- `notes/11-convex-architecture.md` — internal function patterns

### Key Rules

1. Fee engine must be pure/deterministic for same inputs.
2. For rent > ₹80,000, computation must block without custom quote.
3. `pass_credit_paise = min(fee_gross_paise, remaining_pass_credit_paise)`.
4. Net fee cannot be negative.
5. Return machine-readable breakdown for downstream ledger writer.

### Deliverables

- [ ] `convex/monetization.ts` — `internal.monetization.computeClosureFee`
- [ ] `convex/transactionFees.ts` — helper query to resolve active slab/custom quote
- [ ] `convex/tenantPasses.ts` — helper query for eligible pass credit
- [ ] `convex/monetization.test.ts` — deterministic unit tests for slab boundaries and pass credit

### Acceptance Criteria

1. Boundary rents (`1999999`, `2000000`, `3999999`, `4000000`, `8000000`, `8000001`) resolve correctly.
2. Same input payload always returns identical output.
3. Pass credit never exceeds fee gross.
4. High-rent custom quote path returns explicit `requires_custom_quote`.
5. Output includes `slab_key`, `fee_gross_paise`, `pass_credit_paise`, `fee_net_paise`.

### Verification

```bash
npx tsc --noEmit
npm run build
npm test -- monetization
```

---

## T03: Expose Fee Preview and Persisted Breakdown APIs

### Objective

Ship query/mutation surface for fee preview and finalization with append-only revenue ledger writes.

### Required Reading

- `notes/features/28-monetization-foundation.md` — Convex function contracts
- `notes/features/26-transaction-completion-rails.md` — fee collection linkage expectations
- `notes/11-convex-architecture.md` — auth helper + mutation wrapper patterns

### Key Rules

1. Preview must not mutate data.
2. Finalization must write normalized ledger rows (`FEE_GROSS`, `PASS_CREDIT`, `FEE_NET`) in one mutation.
3. Fee collection status defaults to `DUE` unless payment evidence exists.
4. Mutations must be permission-gated.
5. Writes must be idempotent per closure fee event key.

### Deliverables

- [ ] `convex/transactionFees.ts` — `getActiveSchedule`, `upsertSchedule`, `setCustomQuote` (admin)
- [ ] `convex/monetization.ts` — `previewClosureFee`, `finalizeClosureFee`, `recordRevenueLineItems`
- [ ] `convex/closures.ts` — integrate fee finalization trigger on closure confirmation path
- [ ] `convex/rateLimiter.ts` — add monetization mutation limits if needed
- [ ] `convex/monetization.test.ts` — idempotency + ledger write tests

### Acceptance Criteria

1. Preview endpoint returns full component breakdown and no DB writes.
2. Finalization writes exactly three base ledger rows for standard fee path.
3. Custom quote closure cannot finalize without quote.
4. Duplicate finalize call for same idempotency key does not duplicate ledger rows.
5. Permission checks reject unauthorized callers with clear error message.

### Verification

```bash
npx tsc --noEmit
npm run build
npm test -- transactionFees
npm test -- monetization
```
