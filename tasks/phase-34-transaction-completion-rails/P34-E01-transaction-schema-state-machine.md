---
id: P34-E01
title: Transaction Schema & State Machine
phase: 34
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P34-E01: Transaction Schema & State Machine

> Phase 34 · Transaction Completion Rails · Status: pending

## Task Queue

- [ ] P34-E01-T01 — Add core transaction tables and indexes
- [ ] P34-E01-T02 — Define transaction and agreement enums/constants
- [ ] P34-E01-T03 — Implement state transition validators
- [ ] P34-E01-T04 — Add baseline create/read mutations and queries

---

### P34-E01-T01: Add Core Transaction Tables and Indexes

**Objective**: Verify and extend existing transaction tables/indexes for transaction lifecycle, agreement artifacts, KYC packets, and token/deposit records.

**Current State Note**: Verify and extend existing Phase 34 foundations instead of recreating them. `convex/schema.ts` already contains all six core tables (`rental_transactions`, `kyc_packets`, `rental_agreements`, `token_bookings`, `deposit_records`, `handover_checklists`), and `closures.transaction_id` + `tenant_inquiries.transaction_id` already exist. `lib/constants.ts` already includes Phase 34 constants/enums and transition maps. `convex/rentalTransactions.ts` already exists with create/list/detail/cancel/complete flows. P34 audit validators exist in schema, but `AUDITED_TABLES` coverage is still incomplete. `notes/04-state-machines.md` and `notes/13-constants-reference.md` still need Phase 34 sections.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — canonical Phase 34 scope and lifecycle expectations.
- `notes/10-convex-schema.md` — schema style, index conventions, and validator patterns.
- `convex/schema.ts` — existing table/index naming and field style used in this codebase.
- `notes/02-data-models.md` — relationship modeling patterns and money/date conventions.

**Key Rules**:

1. Use Convex table + index pattern exactly: `defineTable({ ... }).index("by_status", ["status"])`; every queue view must be backed by an index.
2. Use explicit enum validators in schema: `v.union(v.literal("INITIATED"), v.literal("KYC_PENDING"), ...)`; never use free-form `v.string()` for statuses.
3. Model cross-table references with `v.id("table")` (`v.id("listings")`, `v.id("users")`, `v.id("owners")`) and evidence references with `v.id("_storage")`.
4. Money and time are strict: all amounts in paise (`v.number()`, `25000 INR => 2500000`) and all timestamps in Unix ms (`v.number()`).
5. V1 police verification is a stub workflow: do not add a dedicated `police_verification_cases` table; track it on `kyc_packets` via `police_verification_status` plus optional form/acknowledgment storage IDs.
6. `rental_transactions` MUST include `tenant_inquiry_id: v.id("tenant_inquiries")` (required in V1) to anchor provenance from the P19 inquiry pipeline. Add index `by_tenant_inquiry_id` for reverse lookups.
7. All queue-facing tables MUST have compound indexes for status + time sorting. Minimum required: `rental_transactions` (`by_status`, `by_tenant`, `by_owner`, `by_listing`), `kyc_packets` (`by_status`, `by_tenant`, `by_transaction_id`), `rental_agreements` (`by_status`, `by_transaction_id`), `token_bookings` (`by_status`, `by_transaction_id`), `deposit_records` (`by_status`, `by_transaction_id`). `kyc_packets.by_status` is currently missing and must be added in this task.
8. `rental_transactions` MUST include `source_negotiation_id: v.optional(v.string())` as a nullable placeholder for future P26 integration. No index needed in V1.
9. Extend `closures` with optional transaction linkage: `transaction_id: v.optional(v.id("rental_transactions"))` plus index `by_transaction_id` so closure confirmation can enforce transaction gating when linked.
10. All mutations/internal mutations on new P34 tables MUST use the `customMutation` wrapper exports from `convex/functions.ts` (`mutation`/`internalMutation` imported from `./functions`, never `./_generated/server`) so automatic audit triggers run.
11. Audit coverage must be explicit for every P34 table introduced in this phase (`rental_transactions`, `kyc_packets`, `rental_agreements`, `token_bookings`, `deposit_records`): add table names to `AUDITED_TABLES`, add matching `auditActionValidator` literals, and add matching `AUDIT_ACTIONS` constants.

**Deliverables**:

- [ ] `convex/schema.ts` — add `rental_transactions`, `rental_agreements`, `kyc_packets`, `token_bookings`, `deposit_records` with complete indexes; include police verification stub fields on `kyc_packets`.
- [ ] `convex/schema.ts` — extend `closures` with `transaction_id: v.optional(v.id("rental_transactions"))` and `by_transaction_id` index.
- [ ] `convex/functions.ts` — add `rental_transactions`, `kyc_packets`, `rental_agreements`, `token_bookings`, and `deposit_records` to `AUDITED_TABLES` as their tables are introduced.
- [ ] `convex/schema.ts` — add audit literals to `auditActionValidator` for all P34 table writes (`*_INSERT`, `*_UPDATE`, and `*_DELETE` if hard-delete ever applies).
- [ ] `lib/constants.ts` — add matching entries to `AUDIT_ACTIONS` for all new P34 audit literals.
- [ ] `notes/10-convex-schema.md` — add `rental_transactions`, `rental_agreements`, `kyc_packets`, `token_bookings`, `deposit_records` table documentation.
- [ ] `notes/13-constants-reference.md` — document P34 audit actions and keep parity with `auditActionValidator` + `AUDIT_ACTIONS`.
- [ ] `convex/seedDemo.ts` — add sample transaction rails rows for seeded listings (`rental_transactions`, `kyc_packets`, `rental_agreements`, `token_bookings`, `deposit_records`).

Note: `handover_checklists` audit wiring belongs in `P34-E05-T01`, where that table is created for the move-in handover flow.

**Acceptance Criteria**:

- [ ] All five tables include required FKs (`transaction_id`, `listing_id`, `tenant_user_id`, `owner_id`) and lifecycle timestamps.
- [ ] Queue-critical indexes exist for status, actor ownership, and SLA retrieval (`by_status`, `by_tenant`, `by_owner`, `by_updated_at` as needed).
- [ ] No money/date field uses strings or floats.
- [ ] Police verification for V1 is represented on `kyc_packets` fields (status + optional form/acknowledgment storage IDs), not a separate table.
- [ ] `rental_transactions` includes required `tenant_inquiry_id` FK with `by_tenant_inquiry_id` index.

**Verification**:

```bash
npm run typecheck
npm run test -- convex/schema.test.ts
```

**Out of Scope**: V1 integrate: schema rails only. V1 stub/manual: payment execution and legal filing execution stay manual. V2 deferred: payment gateway, escrow wallet, and automated government integrations.

---

### P34-E01-T02: Define Transaction and Agreement Enums/Constants

**Objective**: Verify and extend typed constants for statuses, permissions, and config keys used by transaction rails.

**Current State Note**: Verify and extend existing constants rather than recreating them. `lib/constants.ts` already has transaction/KYC/agreement/token/deposit enums and transition maps for Phase 34, and core schema tables already exist. This task focuses on parity hardening and documentation completion, since `notes/13-constants-reference.md` and `notes/04-state-machines.md` do not yet include complete P34 sections.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — source scope for status families and stage gates.
- `lib/constants.ts` — established enum/type/permission style.
- `notes/13-constants-reference.md` — master format for constants documentation.
- `notes/03-roles-and-permissions.md` — permission naming and assignment rules.

**Key Rules**:

1. Follow constant pattern exactly:
   ```typescript
   export const TRANSACTION_STATUS = { INITIATED: "INITIATED" } as const satisfies Record<
     string,
     string
   >;
   export type TransactionStatus = (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];
   ```
2. Permission keys must use dot notation (`"transactions.create"`, `"transactions.manage"`, `"kyc.verify"`, `"agreements.generate"`) and map to RBAC seed roles.
3. Config keys must be lowercase snake_case only and aligned to existing `lib/constants.ts` names (`transaction_auto_cancel_days`, `kyc_provider_timeout_ms`, `esign_deadline_days`). Additional config keys can be introduced by implementing tasks when required by feature scope. The canonical config key for agreement signing deadline is `esign_deadline_days` (not `agreement_signing_deadline_days`).
4. Status literals in `lib/constants.ts` must match schema `v.literal(...)` values 1:1.
5. Canonical status vocab for Phase 34 is fixed and shared across docs/tasks: transaction (`INITIATED`, `KYC_PENDING`, `KYC_VERIFIED`, `KYC_REJECTED`, `AGREEMENT_PENDING`, `AGREEMENT_SENT`, `AGREEMENT_SIGNED`, `TOKEN_PENDING`, `TOKEN_RECEIVED`, `DEPOSIT_PENDING`, `DEPOSIT_RECEIVED`, `MOVE_IN_SCHEDULED`, `COMPLETED`, `CANCELLED`), KYC packet (`PENDING`, `IN_PROGRESS`, `PROVIDER_ERROR`, `NEEDS_REVIEW`, `VERIFIED`, `REJECTED`), agreement (`DRAFT`, `SENT`, `PARTIALLY_SIGNED`, `SIGNED`, `EXPIRED`, `CANCELLED`), token booking (`PENDING`, `RECORDED`, `CONFIRMED`, `DISPUTED`, `CANCELLED`), deposit (`PENDING`, `RECORDED`, `CONFIRMED`, `DISPUTED`, `CANCELLED`).

**Deliverables**:

- [ ] `lib/constants.ts` — add transaction rails enums, permission constants, and config keys with exported types.
- [ ] `notes/13-constants-reference.md` — add transaction status enums, KYC statuses, agreement statuses, permissions, and config keys.
- [ ] `notes/04-state-machines.md` — add transaction state machine diagram and transition rules.

**Acceptance Criteria**:

- [ ] New constants compile with inferred union types and no `as any`.
- [ ] Status/key drift between schema and constants is eliminated.
- [ ] Permissions are ready for `requirePermission(ctx, "...")` checks in backend modules.

**Verification**:

```bash
npm run typecheck
npm run lint -- lib/constants.ts
```

**Out of Scope**: V1 integrate: status/permission/config constants only. V1 stub/manual: role rollout and operational SOP documentation can be manual. V2 deferred: advanced policy engines and dynamic permission composers.

---

### P34-E01-T03: Implement State Transition Validators

**Objective**: Verify and extend legal transaction status validation with a centralized transition map and helper.

**Current State Note**: Verify and extend existing transition logic instead of duplicating it. Transition maps already exist in `lib/constants.ts`, and `convex/rentalTransactions.ts` already has create/list/detail/cancel/complete APIs. This task ensures backend mutations consistently enforce the canonical transition map and updates missing documentation sections.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — target lifecycle for transaction rails.
- `notes/04-state-machines.md` — platform transition-validation style.
- `convex/closures.ts` — closure transition helper pattern.
- `convex/payouts.ts` — payout transition helper pattern.

**Key Rules**:

1. Use (or align existing code to) this transition map exactly:

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

   function validateTransactionTransition(
     current: TransactionStatus,
     next: TransactionStatus,
   ): void {
     const allowed = VALID_TRANSACTION_TRANSITIONS[current];
     if (!allowed || !allowed.includes(next)) {
       throw new Error(`Invalid transition: ${current} → ${next}`);
     }
   }
   ```

   `CANCELLED` is valid from every non-terminal transaction state (`INITIATED`, `KYC_PENDING`, `KYC_VERIFIED`, `KYC_REJECTED`, `AGREEMENT_PENDING`, `AGREEMENT_SENT`, `AGREEMENT_SIGNED`, `TOKEN_PENDING`, `TOKEN_RECEIVED`, `DEPOSIT_PENDING`, `DEPOSIT_RECEIVED`, `MOVE_IN_SCHEDULED`). Only `COMPLETED`, `CANCELLED`, and future `DISPUTED` terminal states cannot transition to `CANCELLED`.

2. Always call transition validation before persistence:
   ```typescript
   validateTransactionTransition(existing.status, nextStatus);
   await ctx.db.patch(existing._id, { status: nextStatus, updated_at: Date.now() });
   ```
3. Terminal states (`COMPLETED`, `CANCELLED`) must reject further updates. If a future `DISPUTED` transaction status is introduced, treat it as terminal as well.
4. Document the same transition table in `notes/04-state-machines.md` after implementation.
5. NOTE: Listing-archive -> transaction auto-cancel hook is owned by `P34-E05-T04`. `E01-T03` must define the `LISTING_ARCHIVED` cancellation reason in schema/constants but MUST NOT implement the hook itself.

**Deliverables**:

- [ ] `convex/rentalTransactions.ts` (or equivalent Phase 34 domain module) — add transition map + validator helper.
- [ ] Status-changing transaction mutations call validator before `ctx.db.patch()`.
- [ ] `notes/04-state-machines.md` — add Phase 34 transition table.

**Acceptance Criteria**:

- [ ] Invalid transitions throw deterministic `Invalid transition: X → Y` errors.
- [ ] All transaction status mutations route through shared validator.
- [ ] Terminal state updates are blocked at server level.

**Verification**:

```bash
npm run typecheck
npm run test -- convex/rentalTransactions.test.ts
```

**Out of Scope**: V1 integrate: strict lifecycle validation only. V1 stub/manual: operational escalation after rejection remains manual. V2 deferred: AI-based transition suggestions or automatic remediation.

---

### P34-E01-T04: Add Baseline Create/Read Mutations and Queries

**Objective**: Create foundational API surface to open transactions and retrieve role-scoped transaction bundles.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — required query/mutation contract for Phase 34.
- `convex/verifications.ts` — mutation sequencing pattern (permission gate -> fetch -> validation -> write).
- `convex/auth.helpers.ts` — `requirePermission`, `requireBackoffice`, and role checks.
- `notes/11-convex-architecture.md` — import rules and pagination conventions.

**Key Rules**:

1. Mutation flow must follow platform pattern: permission gate -> entity fetch -> status validation -> consent/business checks -> insert/patch -> side effects.
2. Import `mutation`/`internalMutation` from `"./functions"` only; never from `"./_generated/server"`.
3. Read APIs must support pagination via `paginationOptsValidator` and role-scoped filtering for admin/ops/tenant views.
4. External API calls are forbidden in these mutations; if needed later, use Convex Actions.
5. The create transaction mutation MUST enforce a one-active-transaction-per-listing invariant. Before inserting, query `rental_transactions` by `listing_id` index filtered to non-terminal statuses (not `COMPLETED`, not `CANCELLED`). If any active transaction exists, throw: `An active transaction already exists for this listing.` This is atomic within the Convex mutation — no external lock needed.
6. Add explicit entry integration from P19 inquiry flow: admin starts a transaction from an approved tenant inquiry via `createTransaction` mutation with `tenant_inquiry_id`. The mutation must fetch the inquiry, require a tenant-linked inquiry (`tenant_id` present), and auto-populate `listing_id` and `tenant_user_id` from the inquiry instead of trusting client input.
7. Add backlink field on `tenant_inquiries`: `transaction_id: v.optional(v.id("rental_transactions"))` with `by_transaction_id` index so inquiry detail surfaces can show linked transaction state.
8. Transaction role matrix:
   - CREATE: Admin/OPS only (via `transactions.manage`) from tenant inquiry detail (`Start Transaction` action). `tenant_inquiry_id` is REQUIRED in V1; direct tenant self-initiation is V2 scope.
   - CANCEL: Admin/OPS only for any non-terminal state (reason required). Tenant self-cancel is V2 scope.
   - ADVANCE (status transitions): Admin/OPS only.
   - VIEW: Tenant (own), Owner (linked), Admin/OPS (all).
     Enforce in mutations via `requirePermission` and identity checks.

**Deliverables**:

- [ ] `convex/rentalTransactions.ts` — add create mutation and list/detail queries for admin/ops/tenant contexts.
- [ ] `convex/schema.ts` — add `tenant_inquiries.transaction_id` optional FK and `by_transaction_id` index.
- [ ] `convex/rentalTransactions.ts` and `convex/tenantInquiries.ts` — wire `createTransaction({ tenant_inquiry_id, ... })` flow and persist inquiry backlink.
- [ ] `src/app/(admin)/admin/tenant-inquiries/page.tsx` (or inquiry detail panel component) — add `Start Transaction` action that calls `createTransaction` for eligible inquiries.
- [ ] `convex/auth.helpers.ts` integration points for new permissions (`transactions.create`, `transactions.manage`).
- [ ] `notes/features/26-transaction-completion-rails.md` — align function contract names with implemented API.

**Acceptance Criteria**:

- [ ] Create mutation normalizes and persists tenant/listing/owner references in one write transaction.
- [ ] Detail query returns transaction bundle scaffold (agreement/KYC/token/deposit references).
- [ ] List queries support status filters + pagination without full-table scans.
- [ ] Attempting to create a second active transaction for the same listing throws a clear error.
- [ ] Admin can start transaction from inquiry detail with one click; mutation derives `listing_id` and `tenant_user_id` from `tenant_inquiry_id` and stores reciprocal linkage.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/rentalTransactions.ts
npm run test -- convex/rentalTransactions.test.ts
```

**Out of Scope**: V1 integrate: baseline CRUD/query rails only. V1 stub/manual: partner-side operational follow-up is manual. V2 deferred: payment-provider orchestration and autonomous workflow engines.
