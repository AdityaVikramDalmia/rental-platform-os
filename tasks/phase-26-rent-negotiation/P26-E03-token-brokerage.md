---
id: P26-E03
title: Token Advance & Brokerage
phase: 26
status: done
depends_on: ["P26-E02", "P24-E02", "P25-E02"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "doc-reconciler"]
updated_at: 2026-02-20
---

# P26-E03: Token Advance & Brokerage

## Overview

Implement token advance policy agreement + collection workflows and brokerage capture behavior so financially sensitive negotiation terms are explicitly consented, auditable, and surfaced in negotiation detail UX.

## Prerequisites

- **Read first**: [P26-E02 Completion Summary](P26-E02-terms-proposal-engine.md#completion-summary) - proposal agreement state needed before token collection.
- **Read first**: [P24-E02 Chat Backend & Batching](../phase-24-chat-infrastructure/P24-E02-chat-backend-batching.md) - room message flow used to communicate token policy updates.
- **Read first**: P25-E02 sign-off context - consent and signature UX conventions reused here.
- P26-E02 must be complete before this epic.

## Task Queue

- [x] P26-E03-T01: Token Advance Backend
- [x] P26-E03-T02: Brokerage Recording
- [x] P26-E03-T03: Token + Brokerage UI

---

## T01: Token Advance Backend

### Objective

Create backend mutations and query surfaces for tenant policy agreement and token collection recording, with strict sequencing after terms agreement.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Token Advance section and refund policy options
- `notes/04-state-machines.md` - negotiation status transitions for `TERMS_AGREED -> TOKEN_COLLECTED`
- `notes/10-convex-schema.md` - `negotiation_token_records` schema shape
- `convex/negotiationProposals.ts` + `convex/negotiations.ts` - upstream status/signed-proposal dependencies

### Key Rules

1. Create `convex/negotiationTokens.ts` for token-specific domain functions.
2. Implement `tenantAgreeToPolicy` mutation so tenant explicitly records refund-policy acceptance before collection.
3. Implement `recordCollection` mutation (admin-only) that records amount, policy, method, timestamps, notes, and recorder metadata.
4. Validate `tenant_agreed_to_policy === true` (or equivalent persisted acceptance state) before allowing token collection write.
5. Enforce sequencing: token collection is only valid when negotiation is in `TERMS_AGREED` state.
6. On successful collection, transition negotiation status to `TOKEN_COLLECTED` and mark checklist token item complete.
7. Implement `getForNegotiation` query returning token record details for negotiation sidebar/panels.

### Deliverables

- [ ] `convex/negotiationTokens.ts` - `tenantAgreeToPolicy`, `recordCollection`, and `getForNegotiation`
- [ ] `convex/negotiations.ts` - checklist/status update hooks consumed by token recording

### Acceptance Criteria

1. Tenant agreement is persisted separately from token collection recording.
2. Token collection fails if terms are not agreed or tenant policy agreement is missing.
3. Successful token record transitions negotiation status to `TOKEN_COLLECTED`.
4. Token checklist synchronization is automatic after collection.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/negotiationTokens.ts` and any changed negotiation module files.

### Out of Scope

- Brokerage UI display components
- Mandatory checklist completion logic beyond token item auto-mark
- Queue/escalation analytics

---

## T02: Brokerage Recording

### Objective

Finalize brokerage handling as manual per-side proposal terms and ensure those values are available for downstream closure recording.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Brokerage section
- `convex/negotiationProposals.ts` - proposal term storage from P26-E02
- `convex/closures.ts` - closure financial field usage

### Key Rules

1. Keep brokerage fields on proposal terms (`tenant_brokerage_paise`, `owner_brokerage_paise`) as first-class values; do not introduce a separate brokerage table.
2. Enforce manual ops entry for both sides during proposal create/edit flows.
3. Validate brokerage amounts as paise integers and non-negative.
4. Ensure signed proposal brokerage values are available for closure creation/confirmation context.
5. Do not implement formula-based brokerage auto-calculation.

### Deliverables

- [ ] `convex/negotiationProposals.ts` - brokerage field validation and persistence checks in proposal mutations
- [ ] `convex/closures.ts` - negotiation-linked brokerage extraction or validation hooks for closure flow

### Acceptance Criteria

1. Brokerage values are persisted per proposal version.
2. Both-side brokerage fields are validated and auditable.
3. Closure flow can read signed proposal brokerage values when linked to negotiation.
4. No brokerage formula logic exists; values remain manual ops inputs.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/negotiationProposals.ts` and `convex/closures.ts`.

### Out of Scope

- Checklist gating transition to `READY_FOR_CLOSURE`
- Admin queue rendering
- Escalation jobs

---

## T03: Token + Brokerage UI

### Objective

Deliver admin and tenant UI components for token collection, tenant refund-policy agreement, and brokerage display in negotiation detail experiences.

### Required Reading

- `notes/features/19-rent-negotiation.md` - token and brokerage user stories
- `notes/06-admin-panel-ux.md` - admin form/sidebar patterns
- `src/components/ui/*` - select/form/dialog usage conventions
- `lib/money.ts` - paise/rupee formatting standards

### Key Rules

1. Build `TokenCollection` admin form with amount, refund policy dropdown (4 options), conditional refund-days input, method dropdown, and tenant-agreement indicator.
2. Build `TenantPolicyAgreement` component with policy details, explicit agreement checkbox, and confirm action.
3. Build `BrokerageDisplay` component for per-side brokerage values rendered in proposal and negotiation sidebars.
4. Integrate all three components into negotiation detail workflow surfaces.
5. Use `react-hook-form` + `zod` for forms and `sonner` for mutation feedback.

### Deliverables

- [ ] `src/components/negotiation/TokenCollection.tsx` - admin token recording form
- [ ] `src/components/negotiation/TenantPolicyAgreement.tsx` - tenant policy consent UI
- [ ] `src/components/negotiation/BrokerageDisplay.tsx` - brokerage presentation component
- [ ] `src/app/(admin)/admin/negotiations/[id]/page.tsx` (or detail composition module) - component integration

### Acceptance Criteria

1. Token collection UI enforces policy-dependent fields before submit.
2. Tenant policy agreement UI captures explicit consent before token record action.
3. Brokerage display shows both-side values in rupees with clear labels.
4. Negotiation detail surface exposes these components in context.
5. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on all new negotiation token/brokerage component files and integration surfaces.

### Out of Scope

- Mandatory checklist completion engine
- Closure gating mutations
- Escalation queue analytics

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-20

### What Was Built

- **T01**: `convex/negotiationTokens.ts` — 3 functions (tenantAgreeToPolicy, recordCollection, getForNegotiation). Tenant policy agreement creates PENDING token record from active proposal terms. Admin collection validates tenant agreement + TERMS_AGREED status, records method/policy/notes, transitions negotiation to TOKEN_COLLECTED. Idempotent tenant agree (returns existing record). Refund policy validation with conditional days/percentage fields.
- **T02**: Brokerage validation confirmed already in place in `convex/negotiationProposals.ts` create/edit. Added `resolveNegotiationBrokerage` helper in `convex/closures.ts` — extracts brokerage from BOTH_AGREED proposal when closure linked to negotiation. Closure create mutation updated to accept `negotiation_id` and auto-derive brokerage.
- **T03**: 3 UI components — TokenCollection (admin recording form with refund policy select, conditional fields, receipt display), TenantPolicyAgreement (consent checkbox + amount display + signed receipt), BrokerageDisplay (per-side brokerage formatted as rupees, compact mode).

### Key File Locations

- `convex/negotiationTokens.ts` — Token backend (3 functions, ~300 lines)
- `convex/closures.ts` — Modified: resolveNegotiationBrokerage helper + negotiation_id in create
- `src/components/negotiation/TokenCollection.tsx` — Admin token collection form
- `src/components/negotiation/TenantPolicyAgreement.tsx` — Tenant consent UI
- `src/components/negotiation/BrokerageDisplay.tsx` — Brokerage display component

### Deviations from Spec

- **Schema gaps**: `negotiations.token_record_id` field doesn't exist in schema — token records are linked via `by_negotiation_id` index query instead of direct foreign key. `tenantAgreeToPolicy` does not update negotiation.token_record_id (field absent).
- **Refund policy source**: Refund policy is set at collection time by admin (via recordCollection args) rather than from proposal — proposals don't have refund_policy fields, only token_advance_amount_paise.
- **Codegen required**: After creating negotiationTokens.ts, Convex codegen needed to be run (`npx convex dev --once --typecheck=disable`) before frontend components could resolve `api.negotiationTokens`.

### Gotchas for Next Epic

- Token collection transitions negotiation TERMS_AGREED → TOKEN_COLLECTED. E04 checklist must account for this status when evaluating checklist completeness.
- `getForNegotiation` returns the first non-deleted token record. If multiple records somehow exist, only the first is returned.
- Closure brokerage extraction helper (`resolveNegotiationBrokerage`) queries the negotiations table then the active BOTH_AGREED proposal. If no active proposal or negotiation, returns null (caller falls back to manual brokerage args).
- Frontend components reference `api.negotiationTokens` — requires Convex codegen to have been run after the backend file was created.
