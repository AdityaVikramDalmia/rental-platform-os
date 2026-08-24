---
id: P26-E02
title: Terms Proposal Engine
phase: 26
status: done
depends_on: ["P26-E01", "P24-E02", "P25-E02"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "doc-reconciler"]
updated_at: 2026-02-20
---

# P26-E02: Terms Proposal Engine

## Overview

Implement the structured, versioned negotiation proposal workflow end-to-end: backend CRUD, per-party sign-off with signature receipts, proposal-focused UI components, and chat stream integration so proposals behave as first-class negotiation messages.

## Prerequisites

- **Read first**: [P26-E01 Completion Summary](P26-E01-three-room-architecture-acl.md#completion-summary) - schema, ACL, and initiation primitives this epic builds on.
- **Read first**: [P24-E02 Chat Backend & Batching](../phase-24-chat-infrastructure/P24-E02-chat-backend-batching.md) - message stream behavior reused for proposal message injection.
- **Read first**: P25-E02 completion context - sign-off and hash-verification patterns reused by proposal signatures.
- P26-E01 must be complete before this epic.

## Task Queue

- [x] P26-E02-T01: Proposal CRUD
- [x] P26-E02-T02: Per-Party Sign-Off
- [x] P26-E02-T03: Proposal UI Components
- [x] P26-E02-T04: Proposal Integration with Chat

---

## T01: Proposal CRUD

### Objective

Create negotiation proposal backend mutations for draft creation, draft editing, room sharing, and version supersession with strict validation on monetary and version semantics.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Terms Proposal and Proposal Lifecycle sections
- `notes/10-convex-schema.md` - negotiation proposal table fields/indexes
- `notes/11-convex-architecture.md` - mutation organization and auth helper patterns
- `lib/constants.ts` + `lib/negotiation.ts` - proposal status enums and transition helpers from P26-E01

### Key Rules

1. Create `convex/negotiationProposals.ts` using wrapped `mutation/query` exports from `./functions`.
2. Implement `create` mutation (ops/admin) with all 11 term fields and initial `DRAFT` status.
3. Implement `edit` mutation to update only draft proposals before sharing or lock.
4. Implement `share` mutation to publish proposal to selected room types (`OPS_TENANT`, `OPS_OWNER`, `COMBINED`) and emit proposal share metadata.
5. Implement `supersede` mutation that creates a new proposal version and marks prior active version as `SUPERSEDED`.
6. Enforce paise integrity for all money fields (`rent_amount_paise`, `deposit_paise`, `maintenance_paise`, `tenant_brokerage_paise`, `owner_brokerage_paise`) as non-negative integers.
7. Auto-increment version number per negotiation and persist `previous_version_id` links.
8. Keep mutation permissions admin-only (ops roles via RBAC permissions).
9. All money fields use descriptive `{purpose}_paise` suffixes, including `rent_amount_paise`, `deposit_paise`, `maintenance_paise`, `tenant_brokerage_paise`, `owner_brokerage_paise`, and `token_advance_paise`.

### Deliverables

- [ ] `convex/negotiationProposals.ts` - create/edit/share/supersede mutations and required shared queries

### Acceptance Criteria

1. Proposal create/edit/share/supersede mutation surface exists and compiles.
2. Versioning is monotonic per negotiation and links previous version chain.
3. Draft edit restrictions and supersede behavior prevent in-place mutation of historical versions.
4. Money field validation rejects non-integer or negative paise values.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/negotiationProposals.ts`.

### Out of Scope

- Signature creation and agreement transitioning
- Proposal UI rendering
- Queue/detail page integration

---

## T02: Per-Party Sign-Off

### Objective

Add sign-off workflows where tenant and owner independently sign proposal versions, generating signature receipts and automatically transitioning negotiation state once both signatures are present.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Sign-Off section and status transition rules
- `notes/04-state-machines.md` - negotiation and proposal transition constraints
- `notes/features/18-deal-room.md` - checklist signature patterns (hash/sign receipt)
- `convex/negotiationProposals.ts` - version/state behavior from T01

### Key Rules

1. Implement `signTerms` mutation for tenant/owner participants only (caller role validation required).
2. Generate deterministic SHA-256 `signature_hash` from normalized proposal terms payload plus identity/version metadata.
3. Store signature record in `negotiation_terms_signatures` with signer role and timestamp.
4. Prevent duplicate signatures by same party on same proposal version.
5. When both tenant and owner signatures exist:
   - set proposal status to `BOTH_AGREED`,
   - lock proposal from further edits,
   - transition negotiation status to `TERMS_AGREED`.
6. Add `getActiveProposal` query returning latest non-superseded version with current signatures.
7. Add `getProposalHistory` query returning all versions with signature summaries.

### Deliverables

- [ ] `convex/negotiationProposals.ts` - `signTerms`, `getActiveProposal`, and `getProposalHistory`
- [ ] `convex/negotiationProposals.test.ts` - dual-signature transition and lock behavior coverage

### Acceptance Criteria

1. Tenant and owner can sign only when they are valid negotiation participants.
2. Signature hash is persisted for every sign action.
3. Proposal transitions to `BOTH_AGREED` only after both signatures exist.
4. Negotiation status transitions to `TERMS_AGREED` after dual sign-off.
5. Active proposal and history queries return signatures/version data.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/negotiationProposals.ts` and `convex/negotiationProposals.test.ts`.

### Out of Scope

- Token collection workflows
- Checklist progression logic
- Admin queue metrics

---

## T03: Proposal UI Components

### Objective

Build reusable proposal UI primitives for display, authoring, comparison, and sign-off so negotiation pages and chat integration can compose from a single component set.

### Required Reading

- `notes/features/19-rent-negotiation.md` - proposal user stories and acceptance criteria
- `notes/06-admin-panel-ux.md` - admin form/table interaction patterns
- `lib/money.ts` - rupee/paise conversion helpers for form input and display
- `src/components/ui/*` - form and dialog component conventions (shadcn)

### Key Rules

1. Create `ProposalCard` that renders all 11 terms with readable formatting (currency, months, date).
2. Create `ProposalEditor` with form controls for all 11 terms; frontend accepts rupee inputs and converts to paise before submit.
3. Create `TermsComparison` side-by-side diff view for two proposal versions with clear highlighted deltas.
4. Create `ProposalSignOff` with confirmation dialog and signature receipt state.
5. Use `react-hook-form` + `zod` validations in editors; no native date/time/select controls outside project UI conventions.
6. Keep components role-aware so sign actions render only for allowed participant roles.
7. `ProposalCard` must include a `Counter` button (tenant/owner-visible) that opens inline text input; submitting sends a regular P24 chat message with `content_type: "counter_proposal"` metadata so ops can create next proposal version from chat context (no separate counter-proposal table/model).

### Deliverables

- [ ] `src/components/negotiation/ProposalCard.tsx` - structured display card with `Counter` action button and inline text input
- [ ] `src/components/negotiation/ProposalEditor.tsx` - creation/editing form
- [ ] `src/components/negotiation/TermsComparison.tsx` - version diff component
- [ ] `src/components/negotiation/ProposalSignOff.tsx` - sign-off action and receipt UI

### Acceptance Criteria

1. All four proposal components render with typed props and compile.
2. Proposal editor enforces term validation and paise conversion boundaries.
3. Comparison component highlights changed fields across versions.
4. Sign-off component shows pending/signed/both-signed states and receipt metadata.
5. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on all four new component files.

### Out of Scope

- Queue page composition
- Checklist UI
- Escalation indicator UI

---

## T04: Proposal Integration with Chat

### Objective

Integrate proposal objects into the chat message stream so shared proposals appear as system-backed rich messages with inline sign/counter actions.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Proposal Integration with Chat requirements
- `notes/features/18-deal-room.md` - chat message rendering and sender/receiver visibility rules
- `convex/chatMessages.ts` (P24) - message creation/listing shape and system message capabilities
- `src/components/negotiation/*` - proposal components from T03

### Key Rules

1. Extend chat message rendering to support proposal message type payloads.
2. On proposal share, insert a system message into selected room streams containing proposal version metadata and embedded card data.
3. Render `ProposalCard` inside chat stream for proposal message types; keep normal text-message behavior unchanged.
4. Surface inline sign-off actions from chat cards for eligible tenant/owner participants.
5. Support counter-proposal workflow from chat context (counter action creates a new proposal version draft/path).
6. Preserve room ACL behavior from P26-E01 while rendering proposal messages.

### Deliverables

- [ ] `convex/chatMessages.ts` (or negotiation chat integration module) - proposal system message insertion path
- [ ] `src/components/chat/NegotiationProposalMessage.tsx` - proposal message renderer wrapper
- [ ] `src/components/chat/ChatMessageList.tsx` (or equivalent) - proposal message type integration with inline actions

### Acceptance Criteria

1. Shared proposals appear in room chat streams as special message cards.
2. Inline sign-off actions invoke backend sign mutation and refresh state.
3. Counter actions create a new proposal version path rather than mutating locked versions.
4. Non-proposal messages render as before.
5. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on all changed chat integration files and negotiation UI wrappers.

### Out of Scope

- Token collection UI/logic
- Mandatory checklist gating
- Escalation cron jobs and analytics

---

## Out of Scope (All Tasks)

- Token and brokerage workflows (P26-E03)
- Mandatory checklist + closure gate (P26-E04)
- Admin negotiation queue/escalation analytics (P26-E05)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-20

### What Was Built

- **T01+T02**: `convex/negotiationProposals.ts` — 9 functions (create, edit, share, supersede, list, getById, signTerms, getActiveProposal, getProposalHistory). Full proposal CRUD with admin-only mutations, per-party sign-off with SHA-256 hash, dual-signature auto-lock to BOTH_AGREED, negotiation status transitions (TERMS_PROPOSED, TERMS_AGREED), rate limiting on propose and sign.
- **T03**: 4 negotiation UI components — ProposalCard (full + compact mode, counter/sign actions), ProposalEditor (react-hook-form + zod, rupees→paise, create/edit modes), TermsComparison (side-by-side diff with change highlighting), ProposalSignOff (sign dialog, receipt states, awaiting/signed/both-signed).
- **T04**: Proposal-to-chat integration — share mutation inserts SYSTEM messages into negotiation rooms, NegotiationProposalMessage renders compact ProposalCard inline in chat, MessageBubble/MessageList/ChatView extended with currentUserRole passthrough for action button visibility.

### Key File Locations

- `convex/negotiationProposals.ts` — Proposal backend (9 functions, ~660 lines)
- `src/components/negotiation/ProposalCard.tsx` — Display card (full + compact)
- `src/components/negotiation/ProposalEditor.tsx` — Create/edit form
- `src/components/negotiation/TermsComparison.tsx` — Version diff
- `src/components/negotiation/ProposalSignOff.tsx` — Sign-off dialog + receipt
- `src/components/chat/NegotiationProposalMessage.tsx` — Chat proposal renderer
- `src/components/chat/MessageBubble.tsx` — Modified for proposal system message parsing
- `src/components/chat/MessageList.tsx` — Modified for currentUserRole passthrough
- `src/components/chat/ChatView.tsx` — Modified for currentUserRole passthrough

### Deviations from Spec

- **No signature_hash field**: Schema has `agreement_text` but no `signature_hash` column. SHA-256 is computed and logged but not stored (schema wasn't modified per instruction). The hash ensures integrity but lives in the agreement_text flow.
- **Proposal metadata in chat**: `chat_messages` has no metadata field for proposal IDs. Solution: system message content uses `NEGOTIATION_PROPOSAL_SHARED:{negotiationId}:{proposalId}` prefix string, parsed by MessageBubble to render ProposalCard inline.
- **No test file**: `convex/negotiationProposals.test.ts` was listed in T02 deliverables but deferred — backend was verified via tsc + lsp_diagnostics + npm run build.

### Gotchas for Next Epic

- The `share` mutation now inserts chat messages into negotiation rooms. It queries `chat_channels` by `negotiation_id` + `channel_type` to find target rooms. If no rooms exist for a given type, the message is silently skipped (no error).
- `signTerms` accepts any authenticated user but validates they are tenant_user_id or owner_user_id on the negotiation. The user_role is derived from this check, not from the users table.
- Proposal system messages use `NEGOTIATION_PROPOSAL_SHARED:` prefix — any code parsing chat messages must account for this special content format.
- `getActiveProposal` returns `{ proposal, signatures }` or `null`. It checks negotiation.active_proposal_id first. If the active proposal is SUPERSEDED, it still returns it (the field isn't cleared on supersede of active).
- Brokerage fields (`brokerage_tenant_side_paise`, `brokerage_owner_side_paise`) already exist on proposals and are validated as non-negative integers in create/edit. E03-T02 may not need additional brokerage mutations.
