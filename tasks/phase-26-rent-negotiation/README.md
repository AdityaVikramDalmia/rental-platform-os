# Phase 26: Rent Negotiation (P26)

## Overview

Phase 26 is the third and final phase split from the original Phase 23 scope. It implements the full ops-mediated rent negotiation engine: three-room brokering (OPS_TENANT, OPS_OWNER, COMBINED), structured and versioned terms proposals, token advance policy capture, mandatory post-agreement documentation checklist, and closure gating through negotiation readiness. This phase also introduces the most complex admin workflow in the system via a dedicated negotiation queue and detail workspace.

**Key Decisions (Oracle-validated)**:

- Use a centralized `VALID_NEGOTIATION_TRANSITIONS` map (same pattern as P20 `VALID_TRANSITIONS`) to model a cyclic negotiation lifecycle, including `TERMS_PROPOSED <-> COUNTER_PROPOSED`.
- Implement three rooms by extending existing `chat_channels` with `channel_type` and `negotiation_id` fields, rather than creating a parallel room table.
- Track the mandatory checklist directly on the `negotiations` document (single-record truth source), not in a separate checklist table.
- Auto-validate checklist items 1/2/4 (agreed terms, sign-off, token gate dependencies from related records); items 5-10 are explicit ops-controlled updates.
- Store token advance refund policy per negotiation (4 policy options), not as a platform-wide static policy.
- Extend `convex/closures.ts` `create()` with `negotiation_id` and enforce `READY_FOR_CLOSURE` before allowing closure creation.
- Add cron-driven escalation flags with configurable thresholds in `system_config`.
- Add a conditional negotiation initiation hook to `visits.complete()` for `INTERESTED` outcomes tied to tenant inquiry flows.

## Dependencies

- P25-E01 (deal checklist schema and extraction base for negotiation document dependencies)
- P25-E02 (checklist approvals and sign-off semantics reused by negotiation sign-off)
- P24-E02 (chat backend/channel lifecycle foundation required for 3-room orchestration)
- P08-E01 (closure backend structure used by both `closures.negotiation_id` schema linkage in P26-E01 and closure-gate enforcement in P26-E04)

**Note**: P26 is intentionally sequenced after P24/P25 so negotiation logic can reuse stable chat and sign-off infrastructure rather than duplicating communication primitives.

## Key Documentation

| Doc                                                                            | Sections to Read                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [features/19-rent-negotiation.md](../../notes/features/19-rent-negotiation.md) | Full file - canonical negotiation business rules, 3-room model, proposal lifecycle, checklist gate |
| [features/18-deal-room.md](../../notes/features/18-deal-room.md)               | 3-room channel extension notes, chat channel schema extension, masking and room visibility rules   |
| [10-convex-schema.md](../../notes/10-convex-schema.md)                         | Negotiation and chat table schema patterns, index conventions, closure linkage patterns            |
| [04-state-machines.md](../../notes/04-state-machines.md)                       | Transition-map patterns and validation style for cyclical state machines                           |
| [11-convex-architecture.md](../../notes/11-convex-architecture.md)             | Wrapped mutations, internal mutation orchestration, auth/permission guard patterns                 |
| `convex/closures.ts`                                                           | Existing closure creation and status transition flow to be negotiation-gated                       |
| `convex/visits.ts`                                                             | Visit completion mutation where `INTERESTED` negotiation hook is added                             |

## ⚠️ Schema Alerts

- Existing `negotiations`/proposal/token schema surfaces are not aligned with the finalized P26 field model and status enums.
- Existing `chat_channels` schema currently supports room-like fields but lacks finalized negotiation ACL task requirements.
- `convex/closures.ts` currently creates closures from lead context only and does not enforce negotiation readiness.
- `convex/visits.ts` currently completes visits without negotiation initiation logic for tenant-inquiry-linked interested visits.
- Negotiation status/constants maps and transition utility helpers are not centralized under a dedicated `lib/negotiation.ts` module.
- Escalation cron workflows and negotiation threshold config defaults are not fully wired.

## ⚠️ Oracle Clarifications

- Private room confidentiality is query-enforced and non-negotiable: tenant never sees OPS_OWNER, owner never sees OPS_TENANT.
- Ops can broker with asymmetric private-room numbers; formal convergence happens in structured proposal versions and sign-off.
- Closure remains blocked until negotiation checklist reaches full completion and state transitions to `READY_FOR_CLOSURE`.
- Escalation flags surface risk; they do not auto-fail a negotiation.
- Failed/stalled transitions require explicit reason capture for auditability.

## Epics

| ID      | Title                                                                                            | Tasks | Status | Depends On                                           |
| ------- | ------------------------------------------------------------------------------------------------ | ----- | ------ | ---------------------------------------------------- |
| P26-E01 | [Three-Room Architecture & ACL](P26-E01-three-room-architecture-acl.md)                          | 4     | done   | P24-E02, P25-E01, P25-E02, P08-E01                   |
| P26-E02 | [Terms Proposal Engine](P26-E02-terms-proposal-engine.md)                                        | 4     | done   | P26-E01, P24-E02, P25-E02                            |
| P26-E03 | [Token Advance & Brokerage](P26-E03-token-brokerage.md)                                          | 3     | done   | P26-E02, P24-E02, P25-E02                            |
| P26-E04 | [Mandatory Checklist & Closure Gate](P26-E04-mandatory-checklist-closure-gate.md)                | 4     | done   | P26-E01, P26-E02, P26-E03, P24-E02, P25-E02, P08-E01 |
| P26-E05 | [Admin Negotiation Queue, Escalation & Analytics](P26-E05-admin-negotiation-queue-escalation.md) | 4     | done   | P26-E01, P26-E02, P26-E03, P26-E04                   |

**Total: 5 epics, 19 tasks**

## Dependency Graph

```
P24-E02 --> P26-E01
P24-E02 --> P26-E02
P24-E02 --> P26-E03
P24-E02 --> P26-E04

P25-E01 --> P26-E01

P25-E02 --> P26-E01
P25-E02 --> P26-E02
P25-E02 --> P26-E03
P25-E02 --> P26-E04

P08-E01 --> P26-E01
P08-E01 --> P26-E04

P26-E01 --> P26-E02
P26-E01 --> P26-E04
P26-E01 --> P26-E05

P26-E02 --> P26-E03
P26-E02 --> P26-E04
P26-E02 --> P26-E05

P26-E03 --> P26-E04
P26-E03 --> P26-E05

P26-E04 --> P26-E05
```

**Parallel note**: P26-E02 and P26-E05 planning can begin after P26-E01 completion, but implementation order stays sequential because proposal, token, checklist, and queue surfaces share the same negotiation state primitives.

## Completion Criteria

- [x] Negotiation schema extensions are complete (`negotiations`, proposal/signature/token records, `chat_channels`, `closures` linkage)
- [x] `lib/constants.ts` includes full negotiation enums, proposal enums, token enums, checklist enums, and status color maps
- [x] `lib/negotiation.ts` exposes `VALID_NEGOTIATION_TRANSITIONS` and transition validator helpers
- [x] `convex/negotiations.ts` supports room initiation/opening and strict room visibility ACL per role
- [x] `visits.complete()` conditionally triggers internal negotiation initiation for inquiry-linked interested visits
- [x] Versioned proposal CRUD, sharing, superseding, and sign-off flows are implemented
- [x] Chat stream can render proposal cards and inline sign-off actions as special negotiation messages
- [x] Token collection and tenant refund-policy agreement flows are enforced and persisted
- [x] Brokerage values are captured per side from proposals and flow into closure context
- [x] Mandatory 10-item checklist backend exists with auto and manual item handling
- [x] Closure creation is negotiation-gated (`READY_FOR_CLOSURE`) when `negotiation_id` is supplied
- [x] Negotiation status auto-transitions include `READY_FOR_CLOSURE` and `CLOSED` pathways
- [x] Admin queue page (`/admin/negotiations`) renders status tabs, counts, sorting, and flag indicators
- [x] Admin negotiation detail page (`/admin/negotiations/[id]`) renders 3-room tabs, checklist, history, token, and action controls
- [x] Escalation jobs/config defaults/analytics queries are implemented and auditable
- [x] `AGENTS.md` updated with new file paths (`convex/negotiations.ts`, `convex/negotiationProposals.ts`, `convex/negotiationTokens.ts`, `src/components/negotiation/`), new components, and updated Project Structure section
- [x] `npx convex dev` starts without errors
- [x] `npm run build` succeeds

## File Tree

```
tasks/phase-26-rent-negotiation/
├── README.md
├── P26-E01-three-room-architecture-acl.md
├── P26-E02-terms-proposal-engine.md
├── P26-E03-token-brokerage.md
├── P26-E04-mandatory-checklist-closure-gate.md
└── P26-E05-admin-negotiation-queue-escalation.md
```

## Scope Boundaries

### IN This Phase

- Three-room negotiation architecture using existing chat infrastructure
- Structured proposal lifecycle with versioning, per-party signatures, and supersession
- Token advance policy agreement + recording + checklist synchronization
- Per-side brokerage capture and visibility through negotiation to closure
- Mandatory documentation checklist as hard negotiation-to-closure gate
- Negotiation queue, detail workspace, escalation flags, and negotiation analytics
- Visit completion integration that initiates negotiation from inquiry-linked interested outcomes

### NOT In This Phase

- New generic chat infrastructure primitives (already handled by P24)
- Deal checklist extraction/sign-off foundational features (already handled by P25)
- Guard-admin chat channel productization
- Voice/video/file-sharing chat surfaces
- WhatsApp Business automation and push notification flows
- In-app escrow/payment rails for token handling

See [V2 Backlog](../../notes/09-v2-backlog.md) for deferred negotiation-adjacent surfaces.

## Tech Debt Documentation

See `notes/features/19-rent-negotiation.md` → **Known Tech Debt & Deferred Items** section for 15 items identified during 3 waves of Oracle adversarial review. Items are categorized by severity (Medium: 3 items, Low: 12 items) with impact assessment and resolution paths for future phases.
