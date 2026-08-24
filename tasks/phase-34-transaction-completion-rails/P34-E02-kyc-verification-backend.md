---
id: P34-E02
title: KYC & Verification Backend
phase: 34
status: pending
depends_on: ["P34-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P34-E02: KYC & Verification Backend

> Phase 34 · Transaction Completion Rails · Status: pending

## Task Queue

- [ ] P34-E02-T01 — Model KYC packet lifecycle and evidence payloads
- [ ] P34-E02-T02 — Build Aadhaar eKYC action and verification hooks
- [ ] P34-E02-T03 — Add employer and landlord reference verification flows
- [ ] P34-E02-T04 — Expose packet status management mutations/queries
- [ ] P34-E02-T05 — Build tenant KYC document upload flow

## Current Implementation Snapshot (2026-02-20)

**Already Done**:

- `convex/kycPackets.ts` exists; exports: `create`, `updateStatus`, `updatePoliceVerification`, `getByTransaction`.
- `convex/schema.ts` already has `kyc_packets` table (currently missing `by_status` index).
- `lib/constants.ts` already defines `KYC_PACKET_STATUS` and `VALID_KYC_TRANSITIONS`.

**Not Started Yet**:

- `convex/kycVerifications.ts` does not exist.
- `convex/actions/kycProvider.ts` does not exist.

---

### P34-E02-T01: Model KYC Packet Lifecycle and Evidence Payloads

**Objective**: Define KYC packet schema and evidence structure covering automated checks plus manual fallback checks.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — KYC V1 scope and fallback pathways.
- `convex/schema.ts` — existing table design patterns for verification and evidence fields.
- `convex/verifications.ts` — verification mutation structure and status-handling style.
- `notes/10-convex-schema.md` — validator/index conventions for Convex schema docs.

**Key Rules**:

1. KYC evidence references must use file storage IDs (`storage_id: v.id("_storage")`) and retrieval is always via `ctx.storage.getUrl(storageId)`.
2. V1 integrated checks: Aadhaar OTP verification, PAN verification, and DigiLocker document fetch via aggregator APIs.
3. V1 manual checks: employer verification and landlord reference are stored as manual workflow artifacts with reviewer metadata.
4. V2 deferred checks (face match/liveness/video KYC/direct UIDAI) must not appear in schema-required fields.
5. KYC packet status vocabulary is canonical and fixed: `PENDING`, `IN_PROGRESS`, `PROVIDER_ERROR`, `NEEDS_REVIEW`, `VERIFIED`, `REJECTED`.
6. Enforce this exact KYC transition map in backend validators:

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

7. KYC document access MUST be restricted:
   - Create dedicated query `getKycDocumentUrl` that checks: (a) requesting user is the tenant who uploaded it, OR (b) requesting user has `kyc.verify` permission (admin/ops).
   - NEVER include raw `storage_id` values in public query payloads. Instead, return document metadata (type, upload date, status) and let the client call `getKycDocumentUrl` for individual file access.
   - Storage URLs from `ctx.storage.getUrl()` are time-limited but publicly accessible — this is acceptable for V1 with the query-level gate above. V2 should add signed URL middleware.

**Deliverables**:

- [ ] `convex/schema.ts` — extend/add KYC packet fields for Aadhaar/PAN/DigiLocker results, manual check metadata, and evidence storage IDs.
- [ ] `lib/constants.ts` — add KYC status/check-type constants used by schema and APIs.
- [ ] `notes/10-convex-schema.md` — document final KYC fields/indexes.

**Acceptance Criteria**:

- [ ] Packet model supports both provider-driven and manual-review checks without ambiguous nullable fields.
- [ ] Every check record stores actor/source/timestamp for auditability.
- [ ] KYC enums in schema and constants are identical.
- [ ] KYC documents are only accessible via gated query (tenant-owned or backoffice permission).
- [ ] No raw `storage_id` values appear in public/tenant-facing query responses.
- [ ] Tenant-facing KYC query (`getByTransaction` when called by tenant) strips `police_form_storage_id`, `police_ack_storage_id`, and any internal-only fields; return document metadata only (type, upload date, status).

**Verification**:

```bash
npm run typecheck
npm run test -- convex/schema.test.ts
```

**Out of Scope**: V1 integrate: Aadhaar/PAN/DigiLocker structure. V1 stub/manual: employer and landlord verification remain operational workflows. V2 deferred: biometric checks and direct UIDAI licensing path.

---

### P34-E02-T02: Build Aadhaar eKYC Action and Verification Hooks

**Objective**: Implement aggregator-backed KYC actions and persist normalized outcomes into KYC packet records.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — KYC integration scope and cost assumptions.
- `convex/actions/workos.ts` — canonical Convex Action pattern for auth/permission/external-call/persist flow.
- `convex/verifications.ts` — mutation-side verification state update pattern.
- `convex/auth.helpers.ts` — permission checks used by KYC operations.

**Key Rules**:

1. Follow this Action sequence exactly: auth check -> permission check via internal query -> external API call -> persist via internal mutation.
2. Use aggregator API integrations only (Surepass/Decentro class providers) for Aadhaar OTP, PAN, and DigiLocker; no direct UIDAI integration.
3. Provider failures must throw descriptive errors (`KYC verification failed: ...`) and store retryable state where relevant.
4. Mutations must persist normalized result + non-sensitive provider metadata in one transaction; do not persist raw payload fields that contain full identity numbers.
5. NEVER store raw Aadhaar numbers or full PAN numbers in the database. Store only:
   - Masked Aadhaar (last 4 digits): `aadhaar_masked: "XXXX-XXXX-1234"`
   - Masked PAN: `pan_masked: "XXXXX1234X"`
   - Provider reference ID (Surepass transaction ID) for audit trail
   - Verification outcome (`VERIFIED`, `FAILED`, `PENDING`)
   - Timestamp of verification
     Raw provider response payloads containing full identity numbers MUST be discarded after extracting the above fields. This is non-negotiable for UIDAI compliance.
6. External provider calls MUST go through a provider abstraction layer:
   - Create `convex/actions/kycProvider.ts` with interface: `verifyAadhaar(args)`, `verifyPan(args)`, `fetchDigilocker(args)`
   - In dev/test mode (check `CONVEX_IS_DEV` or `system_config` flag `kyc_provider_mode`), return mock success responses with deterministic test data
   - In production mode, call real Surepass/Signzy API
   - This allows P34 verification without live API keys during development
7. External provider calls MUST implement retry with exponential backoff: max 3 attempts, base delay 2 seconds, max delay 30 seconds. Set packet status to `IN_PROGRESS` while provider calls are running. After 3 failures, set KYC packet status to `PROVIDER_ERROR` with error details. Admin can manually retry from `PROVIDER_ERROR` state.
8. Enforce this exact KYC packet transition map in backend validators:

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

**Deliverables**:

- [ ] `convex/actions/kycProvider.ts` (or equivalent) — provider abstraction with `verifyAadhaar`, `verifyPan`, and `fetchDigilocker`.
- [ ] `convex/kycVerifications.ts` — internal/public mutations that map provider output to packet status fields.
- [ ] `lib/constants.ts` — provider source constants and error-state enums.

**Acceptance Criteria**:

- [ ] Action handlers enforce authentication and `kyc.verify` permission before calling provider APIs.
- [ ] Success, mismatch, and retryable failure outcomes are persisted with explicit statuses.
- [ ] KYC packet updates remain atomic and idempotent on webhook/action retries.
- [ ] No full Aadhaar or PAN number exists in any database field (only masked versions).
- [ ] Provider reference ID stored for audit trail.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/actions/kycProvider.ts convex/kycVerifications.ts
npm run test -- convex/kycVerifications.test.ts
```

**Out of Scope**: V1 integrate: aggregator API checks only. V1 stub/manual: non-API fallback review can be manually processed. V2 deferred: face match, video KYC, and direct UIDAI gateway.

---

### P34-E02-T03: Add Employer and Landlord Reference Verification Flows

**Objective**: Implement manual verification workflows for employer checks, landlord references, and police-verification handoff artifacts.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — manual verification boundaries and handoff rules.
- `convex/verifications.ts` — manual verification status mutation style.
- `notes/04-state-machines.md` — transition validation pattern for review states.
- `notes/13-constants-reference.md` — status enum naming conventions.

**Key Rules**:

1. Employer verification in V1 is manual-only: capture `company_name`, `hr_email`, reviewer notes, and result timestamps.
2. Landlord reference in V1 is manual-only: capture previous landlord phone, call/WhatsApp attempt log, and verification outcome.
3. Police verification in V1 is manual facilitation: generate/store pre-filled PDF + track portal submission metadata, not API automation.
4. Manual override/rejection requires actor metadata and reason fields; no silent status flips.
5. Every manual verification state change MUST record: `reviewed_by: v.id("users")`, `reviewed_at: v.number()`, `review_notes: v.optional(v.string())`. These fields go on the `kyc_packets` record or as structured sub-objects.

**Deliverables**:

- [ ] `convex/kycVerifications.ts` — manual workflow mutations/queries for employer, landlord, and police-verification status recording.
- [ ] `convex/schema.ts` — fields for manual verification notes, reviewer IDs, and optional police evidence storage IDs.
- [ ] `notes/features/26-transaction-completion-rails.md` — clarify manual workflow expectations and statuses.

**Acceptance Criteria**:

- [ ] Manual checks support at least `PENDING`, `IN_PROGRESS`, `PROVIDER_ERROR`, `NEEDS_REVIEW`, `VERIFIED`, `REJECTED` states.
- [ ] Every manual state change records `reviewed_by`, timestamp, and reason/notes.
- [ ] Police workflow can store generated form + submission acknowledgment files.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/kycVerifications.ts
npm run test -- convex/kycVerifications.test.ts
```

**Out of Scope**: V1 integrate: manual KYC fallback flows and police form generation. V1 stub/manual: downstream third-party calls remain operational. V2 deferred: automated employer APIs, automated police APIs, and biometric identity checks.

---

### P34-E02-T04: Expose Packet Status Management Mutations/Queries

**Objective**: Provide queue, status-update, and readiness APIs so ops/admin can drive KYC completion and unblock transactions.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — readiness and SLA requirements.
- `convex/verifications.ts` — queue/list and status-update patterns.
- `convex/crons.ts` — periodic scan style for SLA enforcement.
- `notes/11-convex-architecture.md` — permission and pagination conventions.

**Key Rules**:

1. Mutation pattern is mandatory: permission gate -> packet fetch -> transition validation -> patch/insert -> side effects.
2. Queue query must be index-backed and filterable by check type, KYC status, assignee, and SLA bucket.
3. Use scheduled functions for expiry/SLA checks where needed (`ctx.scheduler.runAfter`, `ctx.scheduler.runAt`) and hourly cron for global breaches.
4. Auth context does not propagate to scheduled functions; pass explicit user IDs and packet IDs.

**Deliverables**:

- [ ] `convex/kycVerifications.ts` — queue query, status mutation, and transaction readiness query.
- [ ] `convex/crons.ts` — hourly KYC SLA breach check (`tx-sla-check` style) and follow-up scheduling.
- [ ] `lib/constants.ts` — SLA/timeout config keys (`transaction_auto_cancel_days`, `kyc_provider_timeout_ms`) wired for lookups.

**Acceptance Criteria**:

- [ ] Admin/ops can list packets by stage and aging without scanning full table.
- [ ] Status update mutation rejects illegal transitions and stale updates.
- [ ] Readiness query returns explicit blockers used by Phase 34 UI.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/kycVerifications.ts convex/crons.ts
npm run test -- convex/kycVerifications.test.ts
```

**Out of Scope**: V1 integrate: status queue/readiness APIs and SLA checks. V1 stub/manual: escalation execution remains manual. V2 deferred: predictive KYC risk scoring and autonomous remediation workflows.

---

### P34-E02-T05: Build Tenant KYC Document Upload Flow

**Objective**: Allow tenants to upload identity documents (Aadhaar, PAN, employer letter) for their own transaction and track check-wise verification statuses.

**Required Reading** (read these BEFORE starting):

- `notes/features/26-transaction-completion-rails.md` — tenant KYC upload expectations and check status visibility.
- `convex/kycPackets.ts` — existing packet submit/update/get flow.
- `convex/schema.ts` — `kyc_packets` and transaction linkage fields.
- `notes/11-convex-architecture.md` — Convex file storage 3-step upload pattern.

**Key Rules**:

1. Tenant can upload documents for own transaction only; enforce ownership gate with `transaction.tenant_user_id === ctx.auth.getUserIdentity().subject` (or equivalent identity mapping helper).
2. Upload uses Convex file storage 3-step pattern (`generateUploadUrl` -> client upload -> mutation persists storage ID + metadata).
3. After first tenant document upload, packet transitions from `PENDING` to `IN_PROGRESS` via validated status transition.
4. Tenant can view status for each check type (`AADHAAR`, `PAN`, `EMPLOYER`, `LANDLORD`, `POLICE`) but must NOT receive admin/internal review notes.

**Deliverables**:

- [ ] `convex/kycPackets.ts` — tenant-facing upload mutations with ownership gating.
- [ ] `src/app/(tenant)/tenant/transactions/[transactionId]/kyc/page.tsx` — tenant KYC upload page.
- [ ] `src/components/tenant/kyc-upload-form.tsx` — upload form with file picker and per-check status display.

**Acceptance Criteria**:

- [ ] Tenant cannot upload or fetch KYC docs for another tenant's transaction.
- [ ] Aadhaar/PAN/employer documents upload successfully and persist packet metadata.
- [ ] Packet status auto-moves to `IN_PROGRESS` after upload when previous status is `PENDING`.
- [ ] Tenant KYC UI shows per-check status cards and excludes admin-only notes/fields.

**Verification**:

```bash
npm run typecheck
npm run lint -- convex/kycPackets.ts src/app/(tenant)/tenant/transactions/[transactionId]/kyc/page.tsx src/components/tenant/kyc-upload-form.tsx
npm run test -- convex/kycPackets.test.ts
```

**Out of Scope**: Admin/ops review UI changes, provider-side Aadhaar/PAN API integrations, and police backend automation.
