---
id: P34-E03
title: Agreement Generation & eSign
phase: 34
status: pending
depends_on: ["P34-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P34-E03: Agreement Generation & eSign

> Phase 34 · Transaction Completion Rails · Status: pending

## Task Queue

- [ ] P34-E03-T01 — Build agreement template registry and placeholders
- [ ] P34-E03-T02 — Implement agreement auto-population pipeline
- [ ] P34-E03-T03 — Integrate eSign status sync and participant tracking
- [ ] P34-E03-T04 — Generate and store signed/unsigned PDF artifacts

## Current Implementation Snapshot (2026-02-20)

**Already Done**:

- `convex/rentalAgreements.ts` exists; exports: `generate`, `send`, `recordSignature`, `cancel`, `getByTransaction`, `updateStatus`.
- `convex/schema.ts` already defines the `rental_agreements` table.
- `lib/constants.ts` already defines `AGREEMENT_STATUS` and `VALID_AGREEMENT_TRANSITIONS`.

**Not Started Yet**:

- `convex/actions/esignProvider.ts` does not exist.
- `convex/actions/agreementPdf.ts` does not exist.
- Leegality webhook route in `convex/http.ts` does not exist.
- Agreement expiry cron/scheduled function does not exist.

---

### P34-E03-T01: Build Agreement Template Registry and Placeholders

**Objective**: Create a versioned agreement-template registry with strict placeholder contracts for Maharashtra Leave & License.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — legal and integration scope for agreements.
- `notes/features/20-deal-economics.md` — deal term fields that feed agreement payloads.
- `lib/constants.ts` — enum/type declaration style.
- `notes/13-constants-reference.md` — documentation format for new agreement constants.

**Key Rules**:

1. V1 must ship one Maharashtra Leave & License template with 15 mandatory clauses, including: "License does NOT create tenancy rights."
2. Template placeholders are typed and allowlisted; unknown tokens must fail validation.
3. Template versions are immutable once referenced by a generated agreement; create a new version for edits.
4. Multi-state templates are V2 scope only; keep V1 template registry Maharashtra-specific.
5. Agreement status vocabulary is canonical and fixed: `DRAFT`, `SENT`, `PARTIALLY_SIGNED`, `SIGNED`, `EXPIRED`, `CANCELLED`.
6. Enforce this exact agreement transition map in backend validators:

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

**Deliverables**:

- [ ] `lib/constants.ts` — agreement template/version/status enums + signer-role enums.
- [ ] `convex/schema.ts` — fields for template version, placeholder snapshot, and generation metadata in `rental_agreements`.
- [ ] `notes/features/26-transaction-completion-rails.md` — list mandatory clause and template-versioning policy.

**Acceptance Criteria**:

- [ ] Agreement generation references an explicit template version, never an implicit latest template.
- [ ] Placeholder validation rejects unknown/missing required tokens.
- [ ] Constants and schema literals are aligned.

**Verification**:

```bash
npm run typecheck
npm run lint -- lib/constants.ts convex/schema.ts
```

**Out of Scope**: V1 integrate: Maharashtra template registry and placeholder contracts. V1 stub/manual: legal review wording updates may be operationally approved. V2 deferred: multi-state legal template library.

---

### P34-E03-T02: Implement Agreement Auto-Population Pipeline

**Objective**: Build backend draft-generation flow that maps transaction data into legal/commercial agreement payloads.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — agreement data flow and legal constraints.
- `convex/tenantInquiries.ts` — existing inquiry-to-deal data model and field normalization patterns.
- `convex/verifications.ts` — mutation validation and error pattern.
- `notes/11-convex-architecture.md` — mutation import and validation conventions.

**Key Rules**:

1. Draft generation must pull canonical values from transaction/listing/tenant/owner records and persist a frozen snapshot used for signing.
2. Stamp duty and registration guidance must be computed in V1 docs/payload: stamp duty = `0.25% * (annual rent + deposit)` with minimum `500`, registration fee = `1000`.
3. Security deposit over two months' rent should produce a compliance warning (non-blocking warning in V1).
4. Missing mandatory fields must block generation with actionable errors (`field_name` + remediation hint).

**Deliverables**:

- [ ] `convex/rentalAgreements.ts` — draft generation mutation with validation and token replacement.
- [ ] `lib/constants.ts` — agreement lifecycle statuses consumed by pipeline.
- [ ] `notes/features/26-transaction-completion-rails.md` — document computed fee guidance and warning behavior.

**Acceptance Criteria**:

- [ ] Generated draft contains all mandatory commercial/legal fields with no unresolved placeholders.
- [ ] Deposit/rent values are read/written in paise only.
- [ ] Validation error payloads are deterministic and UI-friendly.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/rentalAgreements.ts
npm run test -- convex/rentalAgreements.test.ts
```

**Out of Scope**: V1 integrate: deterministic draft generation and fee guidance. V1 stub/manual: legal counsel review loop remains manual. V2 deferred: AI clause optimization and jurisdiction auto-selection.

---

### P34-E03-T03: Integrate eSign Status Sync and Participant Tracking

**Objective**: Integrate Leegality-based eSign workflow with robust webhook status synchronization.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — V1 eSign scope and legal handoff boundaries.
- `convex/actions/workos.ts` — external API action pattern to mirror.
- `convex/http.ts` — HTTP router style for webhook ingestion.
- `notes/11-convex-architecture.md` — Action vs Mutation responsibilities.

**Key Rules**:

1. External eSign calls belong in Convex Actions only; follow sequence: auth/permission -> provider call -> `ctx.runMutation` persistence.
2. Track signer progression per party (owner then tenant unless explicitly configured otherwise) with explicit status fields.
3. Webhook sync must be idempotent by provider event ID/request ID; duplicate callbacks cannot create duplicate transitions.
4. V1 keeps eStamping and IGR registration as manual handoff with generated instructions; no automated IGR integration.
5. Leegality webhook handler MUST:
   1. Be registered as an HTTP route in `convex/http.ts` at path `/webhooks/leegality`.
   2. Verify request signature: check `X-Leegality-Signature` header against HMAC-SHA256 of request body using webhook secret from env var `LEEGALITY_WEBHOOK_SECRET`.
   3. Reject requests with invalid/missing signatures (return `401`).
   4. Implement idempotency: store `event_id` from webhook payload in the agreement record's `last_webhook_event_id` field. If same `event_id` arrives again, return `200 OK` without processing.
   5. Parse event type (e.g., `document.signed`, `document.expired`, `document.rejected`) and map to agreement status transitions.
   6. Follow the existing HTTP route pattern from `convex/http.ts` (see WorkOS webhook handler for reference).
6. Enforce this exact agreement transition map in backend validators:

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

7. Signature verification must compute HMAC-SHA256 over the raw request body bytes before JSON parsing to avoid serialization mismatches. In the HTTP handler, read bytes via `request.arrayBuffer()` (or equivalent), verify signature, then parse JSON.
8. Agreements have a signing deadline. If not fully signed within `esign_deadline_days` (config key, default: `7` days) while transaction status is `AGREEMENT_SENT`: cron or scheduled function transitions agreement status to `EXPIRED`, transaction status transitions to `AGREEMENT_PENDING` (to allow regeneration), and admin can regenerate agreement (creates new version, old one stays `EXPIRED`).

**Schema extension required: Add `token_booking_amount: v.optional(v.number())` to `rental_transactions` table — stores the expected token amount (in paise) derived from listing deposit terms at transaction creation time. This field is the source of truth for token override validation in P34-E04-T01.**

**Schema extension required for `rental_agreements` table: Add `is_superseded: v.optional(v.boolean())` (marks old agreements when regenerated via admin override), `last_webhook_event_id: v.optional(v.string())` (eSign provider webhook idempotency), `signed_document_storage_id: v.optional(v.id('_storage'))` (Convex storage ID for signed PDF artifact). These fields are consumed by P34-E03-T03.**

9. eSign provider calls MUST go through abstraction:

- Create `convex/actions/esignProvider.ts` with interface: `createSigningRequest(args)`, `getSigningStatus(args)`.
- Mock mode returns deterministic test signing URLs and auto-completes after configurable delay.
- Allows P34-E03 verification without Leegality sandbox account.

10. Source of truth for signed PDF is the Leegality-hosted final artifact. On webhook completion:
    - Download signed PDF from Leegality URL.
    - Upload to Convex file storage via `ctx.storage.store()`.
    - Store `storage_id` on `rental_agreements.signed_document_storage_id`.
    - This ensures we have a permanent copy even if Leegality retention expires.
11. Agreement regeneration after `SIGNED` is an ADMIN OVERRIDE operation that bypasses the normal transition map. It requires `requireAdmin(ctx)` and creates an audit log entry with action `AGREEMENT_OVERRIDE_REGENERATION`. The old signed agreement record is NOT status-transitioned. Instead, set `is_superseded: true` on the old record and create a brand new agreement record at `DRAFT` status. This preserves transition-map integrity while allowing business-necessary regeneration.

    **Doc reconciliation:** The feature spec (`notes/features/26-transaction-completion-rails.md`) describes this as 'cancelling' the old agreement. The task files refine this to `is_superseded: true` instead of a status transition, because `SIGNED` has no outgoing transitions in the state machine. Update the feature spec's regeneration section to match this refined approach when implementing this task.

12. Owner withdrawal after agreement signing triggers: (a) mandatory admin escalation flag on transaction, (b) if token was collected, automatic token status -> `DISPUTED` with reason `OWNER_WITHDRAWAL`, (c) full token refund policy applies regardless of original policy snapshot, (d) transaction -> `CANCELLED` with reason `OWNER_WITHDRAWAL`. This flow must be a single mutation to prevent partial state.

**Deliverables**:

- [ ] `convex/actions/esignProvider.ts` (or equivalent) — provider abstraction with `createSigningRequest(args)` and `getSigningStatus(args)`.
- [ ] `convex/rentalAgreements.ts` — mutations to start sign flow and apply status transitions.
- [ ] `convex/http.ts` — add Leegality webhook route at `/webhooks/leegality`.
- [ ] `lib/constants.ts` — add `EXPIRED` to agreement status enum.
- [ ] `convex/crons.ts` or `convex/rentalAgreements.ts` scheduled function — add agreement expiry check using `esign_deadline_days`.
- [ ] `.env.local` / `.env.example` — add `LEEGALITY_WEBHOOK_SECRET` placeholder.

**Acceptance Criteria**:

- [ ] eSign request IDs and per-signer statuses are persisted on agreement records.
- [ ] Webhook replay does not duplicate events or corrupt status history.
- [ ] Agreement status reaches signed state only after all required signers complete.
- [ ] Agreement expiry cron/scheduled function correctly transitions agreement to `EXPIRED` and transaction to `AGREEMENT_PENDING` after deadline.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/actions/esignProvider.ts convex/http.ts convex/rentalAgreements.ts
npm run test -- convex/rentalAgreements.test.ts
```

**Out of Scope**: V1 integrate: Leegality eSign orchestration + status webhooks. V1 stub/manual: stamp duty payment and IGR filing are guided manual steps. V2 deferred: automated eStamp procurement and direct registrar integrations.

---

### P34-E03-T04: Generate and Store Signed/Unsigned PDF Artifacts

**Objective**: Persist draft and fully-signed agreement PDFs in Convex storage with version-safe linkage.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — document artifact expectations.
- `convex/verifications.ts` — file-upload evidence pattern.
- `notes/11-convex-architecture.md` — 3-step upload/storage pattern.
- `convex/schema.ts` — existing `v.id("_storage")` usage patterns.

**Key Rules**:

1. Use storage IDs (`v.id("_storage")`) for draft and signed artifacts; never store binary blobs in table fields.
2. Generate draft PDF before dispatching eSign request; signed PDF is attached only after final signer completion.
3. Keep historical artifact references for auditability when regeneration occurs (do not hard delete prior IDs).
4. Retrieval must always use `ctx.storage.getUrl(storageId)` and enforce role-based read access.

**Deliverables**:

- [ ] `convex/rentalAgreements.ts` — artifact metadata fields and retrieval queries.
- [ ] `convex/actions/agreementPdf.ts` (or equivalent) — PDF generation + storage write flow.
- [ ] `notes/features/26-transaction-completion-rails.md` — explicit artifact lifecycle (draft -> signed).

**Acceptance Criteria**:

- [ ] Every generated draft has a storage ID persisted before eSign initiation.
- [ ] Signed artifact is linked only after terminal signer completion.
- [ ] Artifact fetch endpoints return signed URLs and respect authorization boundaries.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/actions/agreementPdf.ts convex/rentalAgreements.ts
npm run test -- convex/rentalAgreements.test.ts
```

**Out of Scope**: V1 integrate: PDF generation/storage and signed artifact tracking. V1 stub/manual: legal notarization follow-ups stay manual. V2 deferred: OCR validation, clause anomaly detection, and automated legal redlining.
