---
id: P34-E05
title: Move-In Handover & UI
phase: 34
status: pending
depends_on: ["P34-E02", "P34-E03", "P34-E04"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P34-E05: Move-In Handover & UI

> Phase 34 · Transaction Completion Rails · Status: pending

## Task Queue

- [ ] P34-E05-T01 — Integrate move-in checklist readiness with transaction state
- [ ] P34-E05-T02 — Build tenant transaction dashboard views
- [ ] P34-E05-T03 — Build admin transaction management screens
- [ ] P34-E05-T04 — Add handover completion actions and timeline UI

## Current Implementation Snapshot

- `src/app/(tenant)/tenant/transactions/page.tsx` exists (list page), but no transaction detail route exists yet.
- `src/app/(admin)/admin/transactions/page.tsx` exists (queue page), but no transaction detail route exists yet.
- Admin sidebar navigation link already exists at `src/components/admin/admin-nav-items.ts:205-210`.
- `handover_checklists` table exists in schema, but `convex/handoverChecklists.ts` backend file does not exist.
- `convex/rentalTransactions.ts` exists; exports: `advanceTransactionStatusInternal`, `createTransaction`, `advanceStatus`, `cancel`, `createMoveInChecklist`, `complete`, `getById`, `listByTenant`, `listForAdmin`, `listForOps`.
- `src/components/shared/transaction-timeline.tsx` does not exist.
- `src/components/tenant/transaction-timeline.tsx` does not exist.

## Out of Scope — V1 Owner Portal

- V1 owner interaction is limited to: (1) receiving Leegality eSign link via email/SMS for agreement signing, and (2) receiving payment confirmation notifications.
- No dedicated owner dashboard or owner transaction-tracking portal is included in P34.
- Owner portal product work is deferred to Phase 38 (`P38 — Owner Portal & Dashboard`).

---

### P34-E05-T01: Integrate Move-In Checklist Readiness with Transaction State

**Objective**: Verify and extend the existing transaction-linked `handover_checklists` table usage, then gate handover completion on checklist readiness.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — move-in handover requirements.
- `notes/features/21-field-checklists.md` — reusable checklist template/instance model from P30.
- `convex/checklists.ts` — checklist status query/update patterns.
- `convex/closures.ts` — transition-gated completion/cancellation mutation patterns.

**Key Rules**:

1. Do NOT reuse `checklist_instances` for P34 handovers. `checklist_instances.visit_id` is required in schema, and P34 transactions are not guaranteed to have a linked visit.
2. Verify and extend the existing `handover_checklists` table for transaction handover flow (do not reuse `checklist_instances`): required schema is `transaction_id: v.id("rental_transactions")`, `items: v.array(v.object({label: v.string(), checked: v.boolean(), checked_at: v.optional(v.number()), checked_by: v.optional(v.id("users"))}))`, `completed_at: v.optional(v.number())`, `completed_by: v.optional(v.id("users"))`, `is_deleted: v.boolean()`, `created_at: v.number()`, `updated_at: v.number()`, and index `by_transaction_id` on `["transaction_id"]`. Do not create a duplicate table.
3. `MOVE_IN_SCHEDULED -> COMPLETED` is allowed only when mandatory handover checklist sections are complete and evidence requirements are satisfied.
4. Readiness API must return explicit blockers (missing checklist item IDs/labels) for UI rendering.
5. All status changes must validate transition before patching transaction rows.
6. Register `handover_checklists` in `AUDITED_TABLES` array in `convex/functions.ts` while wiring this existing table into the Phase 34 handover backend. This was intentionally deferred from E01-T01.
7. If police verification status is not `VERIFIED` when attempting `MOVE_IN_SCHEDULED -> COMPLETED` transition, completion requires: `police_exemption_reason: v.string()`, `exemption_approved_by: v.id('users')`, `exemption_approved_at: v.number()`. Store on `handover_checklists` record. Without exemption metadata, completion is blocked with error: `Police verification incomplete. Admin exemption required to proceed.`

**Deliverables**:

- [ ] `convex/rentalTransactions.ts` — readiness query + completion gate logic.
- [ ] `convex/schema.ts` — verify and extend the existing `handover_checklists` table linked to `transaction_id` (not `visit_id`) so it includes fields `transaction_id`, `items[{label, checked, checked_at, checked_by}]`, `completed_at`, `completed_by`, `police_exemption_reason`, `exemption_approved_by`, `exemption_approved_at`, `is_deleted`, `created_at`, `updated_at`, and index `by_transaction_id`.
- [ ] `convex/handoverChecklists.ts` (or equivalent) — transaction-linked checklist create/update/complete queries and mutations.
- [ ] `convex/functions.ts` — add `handover_checklists` to `AUDITED_TABLES`.
- [ ] `notes/features/26-transaction-completion-rails.md` — document readiness gate behavior.

**Acceptance Criteria**:

- [ ] Handover completion fails with clear errors when required handover checklist items are incomplete.
- [ ] Readiness response includes machine-readable blocker payload.
- [ ] Transition validator is called before terminal status update.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/rentalTransactions.ts convex/handoverChecklists.ts convex/schema.ts
npm run test -- convex/rentalTransactions.test.ts
```

**Out of Scope**: V1 integrate: transaction-linked handover readiness gating. V1 stub/manual: on-ground checklist execution remains ops-led. V2 deferred: IoT/smart-lock based handover automation.

---

### P34-E05-T02: Build Tenant Transaction Dashboard Views

**Objective**: Deliver tenant-facing transaction overview and detail UI with real-time stage visibility and next-action cues.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — tenant workflow and expected status language.
- `notes/05-guard-portal-ux.md` — mobile-first interaction constraints used across non-admin surfaces.
- `src/components/shared/listing-status-badge.tsx` — shared badge pattern with optional label overrides.
- `src/app/(public)/listings/page.tsx` — mobile-first non-admin list page patterns relevant for tenant-facing UI.

**Key Rules**:

1. Tenant experience is mobile-first: concise cards, clear CTA copy, and no admin-only operational metadata.
2. Use real-time Convex queries for timeline and stage cards; avoid stale snapshot-only UI.
3. Status display should reuse shared badge conventions (color + label mapping) rather than ad-hoc styling.
4. Show manual-step guidance for V1 manual processes (e.g., employer verification follow-up, police form submission, registration reminders).

**Deliverables**:

- [ ] `src/app/(tenant)/tenant/transactions/page.tsx` — tenant transaction list/overview page.
- [ ] `src/app/(tenant)/tenant/transactions/[transactionId]/page.tsx` — tenant transaction detail timeline view.
- [ ] `src/components/tenant/transaction-timeline.tsx` (or equivalent) — reusable timeline/status component.

**Acceptance Criteria**:

- [ ] Tenant can view active transaction stage, completed stages, and pending actions in chronological order.
- [ ] UI reflects KYC/agreement/token/deposit/move-in states in real time.
- [ ] Empty/error/loading states match existing app conventions.

**Verification**:

```bash
npm run typecheck
npm run lint -- src/app/(tenant)/tenant/transactions/page.tsx src/app/(tenant)/tenant/transactions/[transactionId]/page.tsx
npm run build
```

**Out of Scope**: V1 integrate: tenant status visibility and guidance UI. V1 stub/manual: legal filing completion remains user-managed with instructions. V2 deferred: tenant self-serve payments, digital escrow controls, and automated reminders beyond base notifications.

---

### P34-E05-T03: Build Admin Transaction Management Screens

**Objective**: Create admin queue and detail surfaces to operate transaction stages, blockers, and SLA priorities.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — admin operational requirements.
- `src/components/admin/VerificationTable.tsx` — queue table pagination/filter/SLA pattern.
- `src/components/admin/VerificationDialog.tsx` — `react-hook-form` + `zod` form dialog pattern.
- `src/components/shared/listing-status-badge.tsx` — status badge rendering conventions.

**Key Rules**:

1. Queue UI must be index-backed and include status tabs, SLA highlighting, and deterministic sort order.
2. Mutating forms/dialogs must use `react-hook-form` + `zod` validation and show clear server error states.
3. Enforce permission-gated actions (`transactions.manage`, `kyc.verify`, `agreements.generate`) in both backend and UI visibility.
4. Surface V1 manual dependencies explicitly (eStamp/IGR handoff, manual UTR checks) so ops can track pending external work.
5. Verify existing admin-sidebar entry for transaction management (`/admin/transactions`) is correctly positioned and labeled; update if needed but do NOT duplicate.
6. All admin transaction queue pages MUST sort by status + creation time descending. Backend queries should use `.withIndex("by_status", (q) => q.eq("status", filterStatus)).order("desc")` to leverage Convex's built-in `_creationTime` ordering within index ranges.

**Deliverables**:

- [ ] `src/app/(admin)/admin/transactions/page.tsx` — admin transaction queue page.
- [ ] `src/app/(admin)/admin/transactions/[transactionId]/page.tsx` — detail page with sectioned stage data.
- [ ] `src/components/admin/transactions/TransactionTable.tsx` and `src/components/admin/transactions/TransactionDetailPanel.tsx`.
- [ ] `src/app/(admin)/admin-layout-client.tsx` (or equivalent sidebar config) — verify existing admin sidebar transaction nav item (`/admin/transactions`) is correctly positioned and labeled; update if needed but do NOT duplicate.

**Acceptance Criteria**:

- [ ] Admin queue supports status filtering, SLA bucket views, and navigation into detail.
- [ ] Detail page consolidates KYC/agreement/token/deposit/checklist artifacts in one workflow.
- [ ] Disabled/hidden actions correctly reflect permission and transaction status.
- [ ] Admin sidebar includes a link to `/admin/transactions`.

**Verification**:

```bash
npm run typecheck
npm run lint -- src/app/(admin)/admin/transactions/page.tsx src/app/(admin)/admin/transactions/[transactionId]/page.tsx
npm run build
```

**Out of Scope**: V1 integrate: admin transaction queue/detail and operational controls. V1 stub/manual: external filing/payment confirmations remain manual. V2 deferred: AI triage copilot, auto-assignment, and predictive escalation.

---

### P34-E05-T04: Add Handover Completion Actions and Timeline UI

**Objective**: Implement final completion actions and a unified event timeline with actor-level audit context.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — terminal completion rules.
- `notes/04-state-machines.md` — terminal status and cancel-path constraints.
- `convex/closures.ts` — terminal status + reason capture pattern for completion/cancel flows.
- `src/app/(admin)/admin/tenant-inquiries/page.tsx` — existing admin detail/queue integration surface to mirror.

**Key Rules**:

1. Completion mutation must re-check readiness and call `validateTransactionTransition(current, "COMPLETED")` before write.
2. Timeline must include all major events (KYC, agreement, token, deposit, checklist, completion/cancellation) in chronological order with actor and timestamp.
3. `CANCELLED` path requires reason and actor metadata and remains terminal.
4. UI actions must disable while mutation in progress and show toast feedback on success/failure.
5. Extend `convex/closures.ts` `confirm` mutation with transaction gate: if `closures.transaction_id` is set, fetch linked `rental_transactions` row and allow closure confirmation only when transaction status is `COMPLETED`.
6. Verify existing admin sidebar transaction nav item is correctly positioned and labeled.
7. Implement listing-archive -> transaction auto-cancel hook: in the listing status mutation (wherever listings transition to `ARCHIVED` status in `convex/listings.ts`), query `rental_transactions` by `by_listing` index for non-terminal statuses, and cancel each with reason `LISTING_ARCHIVED`. This implements feature spec Business Rule #17. Note: this was assigned to E01-T03 but deferred to E05-T04 because it requires the full completion/cancel infrastructure.

**Deliverables**:

- [ ] `convex/rentalTransactions.ts` — final handover completion/cancel mutations with audit-safe metadata.
- [ ] `convex/closures.ts` — enforce closure confirmation gate requiring linked transaction status `COMPLETED` when `transaction_id` exists.
- [ ] `src/components/shared/transaction-timeline.tsx` — reusable timeline component.
- [ ] Admin + tenant detail pages wired to show timeline and completion outcomes.

**Acceptance Criteria**:

- [ ] Completion action transitions transaction to `COMPLETED` only when readiness passes.
- [ ] Cancellation action captures mandatory reason and blocks future transitions.
- [ ] Timeline renders full lifecycle history without missing stage events.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/rentalTransactions.ts src/components/shared/transaction-timeline.tsx
npm run build
```

**Out of Scope**: V1 integrate: completion/cancellation actions and timeline visibility. V1 stub/manual: physical key exchange and on-site verification are ops-driven. V2 deferred: post-move-in automation flows and smart-device telemetry.
