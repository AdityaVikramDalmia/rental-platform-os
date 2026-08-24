---
id: P26-E01
title: Three-Room Architecture & ACL
phase: 26
status: done
depends_on: ["P24-E02", "P25-E01", "P25-E02", "P08-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "doc-reconciler"]
updated_at: 2026-02-20
---

# P26-E01: Three-Room Architecture & ACL

## Overview

Define negotiation-first backend foundations by extending schema/constants/state machines, creating negotiation room orchestration mutations, enforcing strict room-level visibility ACLs, and wiring the visit completion trigger that starts negotiation for inquiry-linked interested outcomes.

## Prerequisites

- **Read first**: [P24-E02 Chat Backend & Batching](../phase-24-chat-infrastructure/P24-E02-chat-backend-batching.md) - channel lifecycle assumptions reused by room creation.
- **Read first**: P25-E01 + P25-E02 completion context - checklist/signature concepts reused by negotiation status semantics.
- **Read first**: [P08-E01 Closure Backend](../phase-08-closure/P08-E01-closure-backend.md) - closure integration point for negotiation gating.
- P24-E02, P25-E01, P25-E02, and P08-E01 must be complete before this epic.

## Task Queue

- [x] P26-E01-T01: Schema Extensions for Negotiation
- [x] P26-E01-T02: Negotiation State Machine + Constants
- [x] P26-E01-T03: Room Creation + Access Control
- [x] P26-E01-T04: Visit Completion Hook

---

## T01: Schema Extensions for Negotiation

### Objective

Add all negotiation schema surfaces required for roomed brokering, proposal tracking, signatures, token capture, and closure linkage while preserving existing chat/closure foundations.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Entities Involved, Data Model, 3-Room Architecture, and checklist sections
- `notes/features/18-deal-room.md` - chat channel extension model (`channel_type`, `negotiation_id`)
- `notes/10-convex-schema.md` - table/index conventions and negotiation schema patterns
- `notes/11-convex-architecture.md` - `AUDITED_TABLES` mutation wrapper requirements
- `convex/schema.ts` - current table validators and index naming patterns
- `convex/functions.ts` - audited table registration source

### Key Rules

1. Add/align `negotiations` table with required fields: `inquiry_id`, `listing_id`, `tenant_user_id`, `owner_user_id`, `ops_admin_id`, `status`, `current_proposal_version`, optional `deal_checklist_id`, `negotiation_checklist`, `escalation_flags`, optional `stale_since`, `proposal_round_count`, `created_at`, `updated_at`.
2. `negotiations.status` must support the finalized P26 lifecycle (`INITIATED`, `ROOMS_OPENED`, `TERMS_PROPOSED`, `COUNTER_PROPOSED`, `TERMS_AGREED`, `TOKEN_COLLECTED`, `DOCUMENTATION_IN_PROGRESS`, `READY_FOR_CLOSURE`, `CLOSED`, `FAILED`, `STALLED`, `EXPIRED`).
3. Add indexes on `negotiations`: `by_inquiry_id`, `by_listing_id`, `by_status`, `by_tenant_user_id`, `by_owner_user_id`, `by_ops_admin_id`.
4. Add/align `negotiation_terms_proposals` with fields: `negotiation_id`, `version`, optional `previous_version_id`, `proposed_by_role`, `terms` (11 fields), `status`, `created_at`; indexes: `by_negotiation_id`, `by_status`, `by_negotiation_and_version`.
5. Add/align `negotiation_terms_signatures` with fields: `proposal_id`, `signer_user_id`, `signer_role`, `signature_hash`, `signed_at`; indexes: `by_proposal_id`, `by_signer`.
6. Add/align `negotiation_token_records` with fields: `negotiation_id`, `amount_paise`, `refund_policy`, optional `refund_days`, `collection_method`, `tenant_agreed_to_policy`, optional `tenant_agreed_at`, `collected_at`, `recorded_by_admin_id`, optional `notes`; index `by_negotiation_id`.
7. Extend `chat_channels` by ensuring optional negotiation fields exist for P26 rooming: `channel_type: v.optional(...)` (OPS_TENANT/OPS_OWNER/COMBINED) and `negotiation_id: v.optional(v.id("negotiations"))`; include index `by_negotiation_id`.
8. Add `negotiation_id: v.optional(v.id("negotiations"))` to the existing `closures` table.
9. Add all new negotiation tables to `AUDITED_TABLES` in `convex/functions.ts` so writes auto-log.
10. Add all required negotiation-related enums/constants scaffolding to support validator literals in schema and downstream code.

### Deliverables

- [ ] `convex/schema.ts` - negotiation tables, chat/closure extensions, and indexes
- [ ] `convex/functions.ts` - negotiation tables added to `AUDITED_TABLES`
- [ ] `lib/constants.ts` - negotiation schema-support enums needed by table validators
- [ ] `convex/schema.ts` - explicit `closures.negotiation_id: v.optional(v.id("negotiations"))` field added

### Acceptance Criteria

1. All four negotiation tables exist with required fields and index names.
2. `chat_channels` includes negotiation room metadata and `by_negotiation_id` index.
3. `closures` includes optional `negotiation_id` field.
4. Negotiation tables are included in audit trigger coverage.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts`, `convex/functions.ts`, and `lib/constants.ts`.

### Out of Scope

- Negotiation mutation/query behavior
- Room ACL filtering logic implementation
- UI rendering for negotiation surfaces

---

## T02: Negotiation State Machine + Constants

### Objective

Create a canonical negotiation state machine and enum layer so all status transitions, status colors, and checklist/token/proposal values are centralized and reusable.

### Required Reading

- `notes/features/19-rent-negotiation.md` - state machine, proposal lifecycle, token policy, checklist requirements
- `notes/04-state-machines.md` - transition-table style and validator-map patterns
- `notes/13-constants-reference.md` - enum/color/permission documentation conventions
- `lib/constants.ts` - existing enum and status-color map style

### Key Rules

1. Add enums/types in `lib/constants.ts`: `NEGOTIATION_STATUS`, `NEGOTIATION_ROOM_TYPE`, `NEGOTIATION_PROPOSAL_STATUS`, `TOKEN_REFUND_POLICY`, `TOKEN_COLLECTION_METHOD`, `NEGOTIATION_CHECKLIST_ITEM`, and `NEGOTIATION_CHECKLIST_ITEM_STATUS`.
2. Define `NEGOTIATION_PROPOSAL_STATUS` enum with values: `DRAFT`, `SHARED`, `BOTH_AGREED`, `SUPERSEDED`; add corresponding `_COLORS` map and schema validator.
3. Define `NEGOTIATION_CHECKLIST_ITEM_STATUS` enum with values: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `OBTAINED`, `VERIFIED`, `STAMP_REGISTERED`, `DRAFT_READY`, `WAIVED`; add corresponding `_COLORS` map and schema validator.
4. Define `TOKEN_COLLECTION_METHOD` enum with values: `CASH`, `UPI`, `BANK_TRANSFER`, `CHEQUE`; add corresponding schema validator.
5. Ensure `NEGOTIATION_STATUS` includes `EXPIRED` as a terminal state alongside `READY_FOR_CLOSURE`, `CLOSED`, and `FAILED`.
6. Implement centralized `VALID_NEGOTIATION_TRANSITIONS` map (P20-style) including cycles between `TERMS_PROPOSED` and `COUNTER_PROPOSED`.
7. Add transition helper functions in `lib/negotiation.ts` (for negotiation status and proposal status validation).
8. Add status color maps for all negotiation statuses used in admin queue/detail UI.
9. Add audit action constants to `lib/constants.ts` and `convex/schema.ts` `auditActionValidator` for new negotiation tables: `NEGOTIATIONS_INSERT`, `NEGOTIATIONS_UPDATE`, `NEGOTIATION_TERMS_PROPOSALS_INSERT`, `NEGOTIATION_TERMS_PROPOSALS_UPDATE`, `NEGOTIATION_TERMS_SIGNATURES_INSERT`, `NEGOTIATION_TOKEN_RECORDS_INSERT`, `NEGOTIATION_TOKEN_RECORDS_UPDATE`.
10. Add all 4 new tables to `AUDITED_TABLES` in `convex/functions.ts`: `negotiations`, `negotiation_terms_proposals`, `negotiation_terms_signatures`, `negotiation_token_records`.
11. Add rate limiter keys in `convex/rateLimiter.ts`: `negotiation:propose_terms` (5/hour per admin user key), `negotiation:sign_terms` (10/hour per user key).
12. Keep failed/stalled/expired transitions reason-aware at the helper layer (validation helper should support reason-required checks where applicable).
13. Update `notes/04-state-machines.md` with the P26 negotiation state diagram and transition table aligned to the new constants.
14. Ensure constants/doc naming is consistent with P26 (`ROOMS_OPENED`, `STALLED`, `CLOSED`, `EXPIRED`) and does not regress earlier phase docs.

### Deliverables

- [ ] `lib/constants.ts` - negotiation, room, proposal, token, and checklist enums plus status color maps (`NEGOTIATION_CHECKLIST_ITEM_STATUS`, `NEGOTIATION_PROPOSAL_STATUS`, `TOKEN_COLLECTION_METHOD`)
- [ ] `lib/constants.ts` - `NEGOTIATION_CHECKLIST_ITEM_STATUS` enum + colors map
- [ ] `convex/schema.ts` - `negotiationChecklistItemStatusValidator`
- [ ] `convex/schema.ts` - proposal/token validators (`negotiationProposalStatusValidator`, `tokenCollectionMethodValidator`) and negotiation audit action literals
- [ ] `convex/functions.ts` - `AUDITED_TABLES` updated with 4 negotiation tables
- [ ] `convex/rateLimiter.ts` - 2 new limiter keys for negotiation operations
- [ ] `lib/negotiation.ts` - transition maps + validator helpers
- [ ] `notes/04-state-machines.md` - updated negotiation state machine documentation

### Acceptance Criteria

1. All requested enums are exported with matching literal values.
2. `VALID_NEGOTIATION_TRANSITIONS` exists and enforces cyclical proposal rounds.
3. Status color maps cover all negotiation status values.
4. State machine docs reflect the same transitions implemented in code helpers.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/constants.ts`, `lib/negotiation.ts`, and `notes/04-state-machines.md`.

### Out of Scope

- Room creation mutation implementations
- Proposal CRUD and sign-off behavior
- Cron/escalation implementations

---

## T03: Room Creation + Access Control

### Objective

Implement negotiation room lifecycle mutations and strict role-based room visibility so private brokering rooms remain confidential while ops retains full oversight.

### Required Reading

- `notes/features/19-rent-negotiation.md` - 3-room architecture and room confidentiality rules
- `notes/features/18-deal-room.md` - chat channel behavior and participation assumptions
- `notes/11-convex-architecture.md` - wrapped mutation import and auth helper patterns
- `convex/chatChannels.ts` (or equivalent P24 chat backend module) - channel creation APIs reused by negotiation orchestration

### Key Rules

1. Create `convex/negotiations.ts` using wrapped exports from `./functions` only.
2. Implement `initiate` (admin) to create negotiation from INTERESTED inquiry context and auto-open OPS_TENANT room.
3. Implement `openOwnerRoom` (admin) to create OPS_OWNER room after owner invite readiness.
4. Implement `openCombinedRoom` (admin) to create COMBINED room for joint finalization.
5. Reuse existing channel creation flow (`chatChannels.create`) and pass `channel_type` + `negotiation_id` metadata.
6. Implement `listRoomsForNegotiation` query with strict ACL:
   - Tenant sees `OPS_TENANT` + `COMBINED`
   - Owner sees `OPS_OWNER` + `COMBINED`
   - Admin sees all three room types
7. Enforce ACL in query-layer response filtering (not UI-only filtering).
8. Enforce read-only mode on private rooms (`OPS_TENANT`, `OPS_OWNER`) when linked negotiation status is `READY_FOR_CLOSURE`, `FAILED`, or `CLOSED`; `chatMessages.send` must block writes for negotiation-linked private channels in these statuses.
9. Combined room remains writable until linked closure status is `CONFIRMED`, then becomes read-only.
10. Add regression test coverage that tenant room listing never returns OPS_OWNER channels.

### Deliverables

- [ ] `convex/negotiations.ts` - initiate/openOwnerRoom/openCombinedRoom/listRoomsForNegotiation
- [ ] `convex/negotiations.test.ts` - ACL test coverage including tenant exclusion from OPS_OWNER rooms

### Acceptance Criteria

1. Negotiation initiation creates negotiation record and OPS_TENANT room atomically.
2. Owner and combined rooms can be opened only via admin mutations.
3. Room list query returns role-scoped visibility exactly as specified.
4. Messages cannot be sent to private rooms after negotiation reaches terminal state; combined room remains active until linked closure is `CONFIRMED`.
5. Automated test proves tenant cannot retrieve OPS_OWNER room rows.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/negotiations.ts` and `convex/negotiations.test.ts`.

### Out of Scope

- Proposal lifecycle and sign-off logic
- Token collection workflows
- Admin queue/detail UI

---

## T04: Visit Completion Hook

### Objective

Bridge visit completion into negotiation entry by adding a conditional internal initiation hook for inquiry-linked interested outcomes.

### Required Reading

- `convex/visits.ts` - `complete()` mutation flow and existing incentive hook
- `notes/features/19-rent-negotiation.md` - trigger rule for `INTERESTED` outcome
- `notes/features/13-tenant-inquiry.md` - inquiry linkage model for visits
- `convex/negotiations.ts` - internal initiation API added in T03

### Key Rules

1. Modify `visits.complete()` after existing completion logic (including incentive trigger) to conditionally call `internal.negotiations.initiate`.
2. Fire hook only when:
   - visit outcome is `INTERESTED`, and
   - the visit is linked to a tenant inquiry record.
3. Do not fire hook for non-inquiry visits or non-interested outcomes.
4. Make integration idempotent (avoid duplicate negotiations for the same inquiry on retries).
5. Preserve existing permissions, validation flow, and return shape in `visits.complete()`.

### Deliverables

- [ ] `convex/visits.ts` - conditional negotiation initiation hook in `complete()`
- [ ] `convex/negotiations.ts` - internal initiate entrypoint usable from `visits.complete()`

### Acceptance Criteria

1. Inquiry-linked interested visit completion triggers negotiation initiation.
2. Non-linked or non-interested visit completion does not trigger negotiation initiation.
3. Existing visit completion behavior remains intact for guards.
4. Hook is idempotent for repeated completion execution paths.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/visits.ts` and `convex/negotiations.ts`.

### Out of Scope

- Admin negotiation queue UI
- Proposal creation/share/signing
- Closure gate enforcement

---

## Out of Scope (All Tasks)

- Proposal engine implementation (P26-E02)
- Token and brokerage workflows (P26-E03)
- Checklist gate and closure integration (P26-E04)
- Admin queue/escalation analytics (P26-E05)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-20

### What Was Built

- **T01+T02 (Schema + Constants)**: 4 new schema tables (`negotiations`, `negotiation_terms_proposals`, `negotiation_terms_signatures`, `negotiation_token_records`), 2 table extensions (`chat_channels` + `closures` with `negotiation_id`), 6 validators, 7 audit actions, 9 enums with color/label maps, `lib/negotiation.ts` transition helpers, 2 rate limiter keys, state machine documentation in `notes/04-state-machines.md`.
- **T03 (Room Creation + ACL)**: `convex/negotiations.ts` (411 lines) with `initiate`, `openOwnerRoom`, `openCombinedRoom` public mutations, `createNegotiationRoom` and `initiateFromVisit` internal mutations, `listRoomsForNegotiation` (query-layer ACL: tenant sees OPS_TENANT+COMBINED, owner sees OPS_OWNER+COMBINED, admin sees all), `getById`, `getByInquiryId` queries.
- **T04 (Visit Hook)**: Conditional negotiation initiation in `visits.complete()` — fires `internal.negotiations.initiateFromVisit` only when outcome is INTERESTED and visit has a `tenant_inquiry_id`.

### Key File Locations

- `convex/schema.ts` — negotiation tables and validators (lines ~1328-1440)
- `convex/negotiations.ts` — all negotiation mutations and queries (new file, 411 lines)
- `convex/visits.ts` — visit completion hook (line ~815)
- `convex/functions.ts` — AUDITED_TABLES (lines 98-101)
- `convex/rateLimiter.ts` — negotiation rate limiter keys (lines 30-39)
- `lib/constants.ts` — negotiation enums, colors, labels, permissions, audit actions
- `lib/negotiation.ts` — transition maps and helpers (new file)
- `notes/04-state-machines.md` — P26 negotiation state machine section

### Deviations from Spec

- Task spec mentioned `ROOMS_OPENED` status; implementation uses `ACTIVE` as the post-initiation status (aligned with the canonical state machine in `lib/negotiation.ts` and `notes/04-state-machines.md`).
- Room creation uses direct `ctx.db.insert("chat_channels", ...)` via internal helper rather than calling the existing `chatChannels.create()` function, because the existing function doesn't accept `channel_type`/`negotiation_id` args and we were told not to modify it.

### Gotchas for Next Epic

- `initiateFromVisit` skips auth checks (it's internal). P26-E02 proposal mutations must use the public `requireBackoffice` + `requirePermission` pattern.
- `chat_channels` records created for negotiation rooms include `channel_type` and `negotiation_id` fields. The existing `chatMessages.send` does NOT check negotiation status for read-only enforcement yet — that needs to be added in P26-E02 or P26-E04.
- The `listRoomsForNegotiation` query determines user role by checking the `user_type` field on the users table. If a user has no `user_type`, they get an empty room list.
