---
id: P25-E01
title: Deal Checklist Model & AI Extraction
phase: 25
status: pending
depends_on: ["P24-E01", "P24-E02", "P24-E03"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "doc-navigator"]
updated_at: 2026-02-18
---

# P25-E01: Deal Checklist Model & AI Extraction

## Overview

Define the canonical deal checklist data model, wire checklist audit coverage, implement admin lifecycle APIs for checklist creation/edit/share/regeneration, and add OpenAI structured extraction action support to transform chat history into a draft checklist with source attribution.

## Prerequisites

- P24-E01 and P24-E02 must be complete because this epic depends on `chat_channels` + `chat_messages` schema and transport functions.
- P24-E03 must be complete because AI term extraction reuses the OpenAI adapter and structured output patterns established there.
- Confirm chat message IDs are stable and queryable per channel before implementing extraction source linkage.
- Confirm admin permissions scaffolding from previous phases is available for new `deal_checklists.*` permission keys.

## Task Queue

- [ ] P25-E01-T01: Schema - Deal Checklist Tables
- [ ] P25-E01-T02: Deal Checklist Backend Functions
- [ ] P25-E01-T03: AI Term Extraction Action
- [ ] P25-E01-T04: Constants and Documentation Updates

---

## T01: Schema - Deal Checklist Tables

### Objective

Add `deal_checklists` and `deal_checklist_signatures` in `convex/schema.ts` with full item/approval object shapes, required indexes, and enum validators so checklist lifecycle and signatures are first-class persisted entities.

### Required Reading

- `notes/features/18-deal-room.md` - Deal Terms Checklist, Checklist Versioning, and Closure Integration sections
- `notes/10-convex-schema.md` - deal room schema patterns for table/object/index definition style
- `notes/04-state-machines.md` - deal checklist transition patterns
- `notes/11-convex-architecture.md` - wrapped mutation + audit trigger integration conventions

### Key Rules

1. `deal_checklists` must include: `inquiry_id`, `channel_id`, `version`, `previous_version_id`, `items`, `status`, `created_by_admin_id`, `created_at`, `shared_at`, `approved_at`.
2. `deal_checklists` indexes must include: `by_inquiry_id`, `by_channel_id`, `by_status`, and `by_inquiry_and_version` (compound).
3. `deal_checklist_signatures` must include: `checklist_id`, `signer_user_id`, `signer_role`, `signature_hash`, `signed_at`, `ip_address`.
4. `deal_checklist_signatures` indexes must include: `by_checklist_id` and `by_signer`.
5. Checklist item object shape must include: `item_id`, `term_type` (DEAL_TERM_TYPE enum), `source` (DEAL_CHECKLIST_ITEM_SOURCE enum), `description`, `extracted_value`, `admin_edited_value`, `source_message_ids`, `confidence`, `tenant_approval` (approval status object), `owner_approval` (approval status object), and `overall_status` (derived DEAL_CHECKLIST_ITEM_OVERALL_STATUS).
6. Approval status object shape must include: `status`, `responded_at`, `comment` with status enum `PENDING | AGREED | DISAGREED | COMMENTED`.
7. Add enums:
   - `DEAL_CHECKLIST_STATUS`: `DRAFT`, `SHARED`, `IN_REVIEW`, `APPROVED`, `DISPUTED`, `SUPERSEDED`. Matches state machine in `notes/04-state-machines.md` plus `SUPERSEDED` for version history.
   - `DEAL_CHECKLIST_ITEM_SOURCE`: `AI_EXTRACTED`, `ADMIN_ADDED`, `PARTY_RAISED`. Matches `notes/13-constants-reference.md`.
   - `DEAL_CHECKLIST_ITEM_APPROVAL`: `PENDING`, `AGREED`, `DISAGREED`, `COMMENTED`. Per-party approval values.
   - `DEAL_CHECKLIST_ITEM_OVERALL_STATUS`: Derived from both parties' approvals — `UNREVIEWED` (both PENDING), `RESOLVED` (both AGREED), `DISPUTED` (any DISAGREED), `NEEDS_DISCUSSION` (any COMMENTED, none DISAGREED).
   - `DEAL_TERM_TYPE` (optional metadata): `RENT_AMOUNT`, `DEPOSIT`, `LEASE_DURATION`, `MOVE_IN_DATE`, `MAINTENANCE`, `ESCALATION_CLAUSE`, `FURNISHING`, `LOCK_IN_PERIOD`, `NOTICE_PERIOD`, `BROKERAGE`, `CUSTOM`.
8. Add `deal_checklists` and `deal_checklist_signatures` to `AUDITED_TABLES` in `convex/functions.ts`.
9. Add `deal_checklist_id: v.optional(v.id("deal_checklists"))` to the existing `closures` table. This field was intentionally deferred from P24 because it requires the `deal_checklists` table to exist first.

### Deliverables

- [ ] `convex/schema.ts` - `deal_checklists` and `deal_checklist_signatures` table definitions with item/approval object validators and indexes
- [ ] `convex/schema.ts` - `closures` table extended with `deal_checklist_id: v.optional(v.id("deal_checklists"))`
- [ ] `convex/functions.ts` - `AUDITED_TABLES` updated with checklist tables

### Acceptance Criteria

1. Both new tables compile with Convex validators and expose all required fields.
2. All required indexes exist with exact names and field ordering.
3. Item and nested approval object validators enforce enum-safe status values.
4. New checklist tables are audit-triggered via `AUDITED_TABLES`.
5. `closures` table has `deal_checklist_id` field.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/schema.ts` and `convex/functions.ts`.

### Out of Scope

- Checklist mutations/queries implementation
- AI extraction logic and prompt design
- UI rendering for checklists or signatures

---

## T02: Deal Checklist Backend Functions

### Objective

Implement checklist lifecycle backend functions in `convex/dealChecklists.ts` for admin-driven draft creation, item editing, sharing, regeneration/version supersession, and retrieval by inquiry/version history.

### Required Reading

- `notes/features/18-deal-room.md` - Checklist Flow + Checklist Versioning sections
- `notes/04-state-machines.md` - checklist transition rules
- `notes/11-convex-architecture.md` - domain file layout, wrapped function imports, permission enforcement
- `notes/13-constants-reference.md` - permission naming conventions

### Key Rules

1. Create `convex/dealChecklists.ts` using wrapped `mutation`/`query` exports from `./functions`.
2. Implement mutations: `create`, `editItem`, `share`, `regenerate`.
3. Implement queries: `getByInquiry` (active version), `getById`, `listVersions` (audit history).
4. Enforce admin permissions for write operations and admin/participant-safe access for read operations.
5. `share` must reject checklist items with `confidence` below threshold unless `admin_edited_value` is present.
6. `regenerate` must create a new version linked by `previous_version_id` and mark prior active version as `SUPERSEDED`.
7. Version numbering must be monotonic per inquiry/channel pair.
8. `create` should persist AI extraction results as `DRAFT` before party visibility.
9. Handle concurrent edit/approve conflicts: if admin regenerates a checklist (creating new version) while a party is approving items on the old version, the new version supersedes the old one. All pending approvals on the superseded version are invalidated. The `regenerate` mutation must set the old version's status to `SUPERSEDED` before creating the new version. UI should show a toast: 'Checklist updated — please review the new version.'

### Deliverables

- [ ] `convex/dealChecklists.ts` - lifecycle mutations and queries for checklist model

### Acceptance Criteria

1. `create` stores a new checklist draft with source extraction payload.
2. `editItem` only changes admin-editable fields and updates audit trail.
3. `share` transitions status correctly and blocks unedited low-confidence terms.
4. `regenerate` produces a new version and supersedes the prior active version.
5. `getByInquiry`, `getById`, and `listVersions` return correct version slices.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/dealChecklists.ts`.

### Out of Scope

- Per-item tenant/owner approvals and sign-off hashing
- Invite token flow and owner onboarding
- Admin chat moderation pages

---

## T03: AI Term Extraction Action

### Objective

Add a dedicated Convex Action to extract structured deal terms from channel chat history using OpenAI structured outputs with Zod validation, then return normalized terms with source message attribution for checklist draft creation.

### Required Reading

- `notes/features/18-deal-room.md` - AI Pipeline + Deal Terms Checklist extraction requirements
- `notes/11-convex-architecture.md` - Convex Action pattern and action-to-mutation call flow
- `notes/10-convex-schema.md` - chat table fields (`chat_messages`, `chat_channels`) used by extraction

### Key Rules

1. Create `convex/actions/dealTermExtraction.ts` as a Convex Action (external API allowed only in actions).
2. Load all channel chat messages needed for extraction and preserve source message IDs.
3. Use OpenAI structured outputs with a Zod schema matching `DealTermSchema`; do NOT use function-calling mode.
4. System prompt must explicitly require: extract discussed terms, flag ambiguities with clarification questions, and map each term to source message IDs.
5. Return a structured array of extracted terms with fields required by checklist draft creation.
6. Wire admin-triggered checklist generation flow: admin trigger -> action extraction -> draft checklist persisted.
7. Fail closed on schema mismatch (reject invalid model output instead of coercing silently).
8. Limit chat history sent to OpenAI for term extraction: send only the last 100 messages (or ~50KB of text, whichever is smaller). If the conversation exceeds this limit, prepend a system note: `Earlier messages truncated. Analyzing last 100 messages.` This prevents excessive token usage on long conversations.
9. Use `openai.chat.completions.parse()` with `zodResponseFormat()` from `openai/helpers/zod` — NOT `chat.completions.create()`. The `.parse()` method returns a `ParsedChatCompletion` with a typed `.parsed` property.
10. Handle three OpenAI failure modes explicitly:
    - **Refusal**: Check `message.refusal` BEFORE accessing `.parsed`. If present, the model refused the request (safety filter) — log refusal reason and return extraction failure.
    - **LengthFinishReasonError**: Catch this exception (thrown when output exceeds max_tokens). Log and retry with reduced chat history.
    - **ContentFilterFinishReasonError**: Catch this exception (thrown when content filter blocks generation). Log and mark extraction as requiring admin review.
11. The `openai/helpers/zod` module handles Zod-to-JSON-Schema conversion internally — do NOT install `zod-to-json-schema` as a separate dependency.

### Deliverables

- [ ] `convex/actions/dealTermExtraction.ts` - OpenAI structured extraction action with Zod schema
- [ ] `convex/dealChecklists.ts` - integration hook that stores extraction output as `DRAFT`

### Acceptance Criteria

1. Extraction action returns only schema-valid structured terms.
2. Each extracted term includes source message IDs for auditability.
3. Ambiguous terms include clarification metadata/questions in output payload.
4. Admin-triggered generation persists a checklist draft in `deal_checklists`.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/actions/dealTermExtraction.ts` and `convex/dealChecklists.ts`.

### Out of Scope

- Per-item response workflow and signatures
- Owner invite acceptance and channel join behavior
- Admin transcript management UI

---

## T04: Constants and Documentation Updates

### Objective

Update constants, permissions, and core docs so checklist enums/transitions/schema are fully documented and aligned with implementation artifacts.

### Required Reading

- `notes/13-constants-reference.md` - constants and permission naming patterns
- `notes/04-state-machines.md` - checklist transition table style
- `notes/10-convex-schema.md` - table documentation format
- `lib/constants.ts` - enum + status color map conventions

### Key Rules

1. Add checklist enums and status colors in `lib/constants.ts` for all statuses introduced in this epic.
2. Add permissions: `DEAL_CHECKLISTS_VIEW`, `DEAL_CHECKLISTS_MANAGE`, `DEAL_CHECKLISTS_APPROVE`.
3. Update `notes/04-state-machines.md` with deal checklist transitions including supersession behavior.
4. Update `notes/10-convex-schema.md` with finalized table definitions for `deal_checklists` and `deal_checklist_signatures`.
5. Keep enum names and values identical across schema, constants, and docs.
6. Do not modify unrelated feature docs outside checklist scope.

### Deliverables

- [ ] `lib/constants.ts` - checklist enums, colors, and permissions
- [ ] `notes/04-state-machines.md` - checklist state machine updates
- [ ] `notes/10-convex-schema.md` - checklist table spec updates

### Acceptance Criteria

1. Constants contain all checklist statuses, term types, and permission keys.
2. State machine docs reflect implemented transitions and terminal states.
3. Schema docs match validator/index definitions implemented in code.
4. No naming drift exists across code and docs.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `lib/constants.ts`.

### Out of Scope

- UI component work for checklist approvals/sign-off
- Invite token and owner onboarding docs
- Negotiation (P26) mandatory checklist documentation

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
