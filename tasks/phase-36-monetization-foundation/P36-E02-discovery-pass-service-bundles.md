---
id: P36-E02
title: Discovery Pass & Service Bundles
phase: 36
status: pending
depends_on: ["P36-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P36-E02: Discovery Pass & Service Bundles

## Epic Guardrails

- Shared file boundaries follow `tasks/phase-36-monetization-foundation/README.md` -> "File Ownership (Epic Boundaries)".

## Task Queue

- [ ] P36-E02-T01: Add tenant pass and service bundle schema models
- [ ] P36-E02-T02: Implement pass purchase and activation lifecycle
- [ ] P36-E02-T03: Implement bundle usage and partner service attachment
- [ ] P36-E02-T04: Apply credit-at-closure logic in fee finalization

---

## T01: Add Tenant Pass and Service Bundle Schema Models

### Objective

Add canonical schema for `tenant_passes`, `service_bundles`, and `partner_services` with strict enum validators and indexes.

### Required Reading

- `notes/features/28-monetization-foundation.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/02-data-models.md`

### Key Rules

1. Store pass and bundle money values in paise only.
2. `service_areas` must be typed as array data, not JSON-string payloads.
3. Status fields must use explicit unions, no free-form strings.
4. Keep partner commission model explicit (`PERCENT` vs `FLAT`).
5. All three tables must be audit-triggered.

### Deliverables

- [ ] `convex/schema.ts` — add three tables + indexes
- [ ] `lib/constants.ts` — add pass/service enum constants
- [ ] `convex/functions.ts` — add tables to audit list
- [ ] `notes/10-convex-schema.md` and `notes/13-constants-reference.md` — document new definitions

### Acceptance Criteria

1. `tenant_passes` supports query by user, status, and expiry.
2. `service_bundles` supports query by closure/listing/partner/status.
3. `partner_services` supports query by service type and active flag.
4. Enum validators match constants doc exactly.
5. Build and types pass with no schema type regressions.

### Verification

```bash
npx tsc --noEmit
npm run build
```

---

## T02: Implement Pass Purchase and Activation Lifecycle

### Objective

Implement purchase -> capture -> active/expiry lifecycle for discovery passes.

### Required Reading

- `notes/features/28-monetization-foundation.md` — pass flow + gateway section
- `notes/11-convex-architecture.md` — action and webhook patterns
- `notes/04-state-machines.md` — add pass status transitions

### Key Rules

1. Razorpay webhook must be signature-validated.
2. Webhook processing must be idempotent on payment id.
3. Pass row is created only on successful `payment.captured`.
4. There is no `PENDING` or `FAILED` pass status.
5. Failed/unpaid payments create no pass row (fail-fast).
6. Expired passes are ignored for credit application.
7. Purchase mutation is tenant-scoped and rate-limited.

### Deliverables

- [ ] `convex/tenantPasses.ts` — `purchase`, `getMyActivePass`, lifecycle updates
- [ ] `convex/actions/payments.ts` — pass payment capture action
- [ ] `convex/http.ts` — Razorpay webhook route handler
- [ ] `convex/rateLimiter.ts` — `tenant:pass_purchase` limiter
- [ ] `convex/crons.ts` — pass expiry job
- [ ] `convex/tenantPasses.test.ts` — lifecycle + idempotency tests

### Acceptance Criteria

1. Failed/unpaid purchase attempts do not create `tenant_passes` rows.
2. Captured webhook creates pass row directly in `ACTIVE` with payment reference.
3. Duplicate webhook does not duplicate writes.
4. Expiry cron transitions expired active passes to `EXPIRED`.
5. Tenant query returns only currently eligible pass for credit use.

### Verification

```bash
npx tsc --noEmit
npm run build
npm test -- tenantPasses
```

---

## T03: Implement Bundle Usage and Partner Service Attachment

### Objective

Implement service bundle order creation, completion flow, and partner-notification integration.

### Required Reading

- `notes/features/28-monetization-foundation.md` — service bundle flow
- `notes/03-roles-and-permissions.md` — required permissions
- `notes/11-convex-architecture.md` — action/mutation split

### Key Rules

1. Bundle order requires either `closure_id` or `listing_id`.
2. Commission is recognized only on `COMPLETED`.
3. Partner notification happens through action layer only.
4. Order state transitions must be validated.
5. Completion writes revenue ledger rows in same transaction boundary as status update.

### Deliverables

- [ ] `convex/serviceBundles.ts` — `createOrder`, `markCompleted`, `listByDeal`
- [ ] `convex/actions/partners.ts` — `notifyServiceAssignment`
- [ ] `convex/monetization.ts` — ledger write helper usage for service bundle rows
- [ ] `convex/serviceBundles.test.ts` — transition and commission tests

### Acceptance Criteria

1. Invalid state transitions are rejected.
2. `markCompleted` computes and stores `commission_paise`.
3. Partner notification is emitted on valid order creation.
4. Completion writes `SERVICE_GROSS`, `PARTNER_COST`, and `SERVICE_COMMISSION` line items.
5. Query by closure returns deterministic ordering and complete order details.

### Verification

```bash
npx tsc --noEmit
npm run build
npm test -- serviceBundles
```

---

## T04: Apply Credit-at-Closure Logic in Fee Finalization

### Objective

Integrate pass credit into closure fee finalization and revenue ledger without mutating P09 payout logic.

### Required Reading

- `notes/features/28-monetization-foundation.md` — cross-phase contracts
- `notes/features/07-closure-and-payouts.md` — payout lifecycle boundaries
- `notes/features/26-transaction-completion-rails.md` — fee collection linkage

### Key Rules

1. Pass credit must be applied before net fee is finalized.
2. Pass consumption order is oldest-expiry-first.
3. Pass application cannot alter payout amount or payout status.
4. Ledger writes must include explicit pass credit row.
5. Fee collection status update must follow transaction/payment evidence.

### Deliverables

- [ ] `convex/tenantPasses.ts` — `applyCredit`
- [ ] `convex/monetization.ts` — closure finalization integration
- [ ] `convex/closures.ts` — call integration
- [ ] `convex/tenantPasses.test.ts` — multi-pass consumption and partial consumption tests

### Acceptance Criteria

1. Full/partial pass application behaves as documented.
2. Multiple active passes consume oldest expiry first.
3. Net fee never goes below zero.
4. Ledger rows include pass credit for every credited closure.
5. Payout records remain unchanged by pass-credit mutation path.

### Verification

```bash
npx tsc --noEmit
npm run build
npm test -- tenantPasses
npm test -- monetization
```
