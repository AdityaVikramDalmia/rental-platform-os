# Phase 25: Deal Room Features (P25)

## Overview

Phase 25 delivers the full deal room experience on top of P24 chat rails: AI-extracted deal terms checklist generation, multi-party approvals with formal sign-off, secure owner onboarding via invite flow, and admin master control over communication and moderation surfaces. This phase converts raw chat transport into an auditable agreement workflow that can be linked into closure operations.

**Key Decisions (Oracle-validated)**:

- AI extraction uses OpenAI structured outputs with Zod schema (NOT function calling) to guarantee schema-compliant term extraction.
- Deal checklist is versioned: a new version supersedes the prior active version while preserving all previous versions for audit history.
- Two separate checklist systems coexist on the same deal with different lifecycles: deal checklist (P25, AI-extracted terms) and mandatory post-agreement checklist (P26, hardcoded 10 items).
- Owner invite uses Google SSO (WorkOS) and reuses existing SSO rails with invite token validation layered on top.
- Formal sign-off uses SHA-256 hash of agreed items as a lightweight digital signature (not a full e-signature product).
- Admin god-mode impersonation is explicitly audit-logged with impersonation metadata and flags.

## Dependencies

- P24-E01 (chat schema/constants/permissions foundation)
- P24-E02 (chat backend rails and channel lifecycle)
- P24-E03 (AI pipeline - OpenAI integration used by P25-E01-T03 deal term extraction)
- P06 (listing context used in deal-room prompts and invite copy)
- P20 (owner account model and onboarding conventions)

**Note**: Phase-level dependencies include P06 and P20; epic-level execution additionally pins P24-E01/P24-E02 where transport and channel participation primitives are required.

## Key Documentation

| Doc                                                                | Sections to Read                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [features/18-deal-room.md](../../notes/features/18-deal-room.md)   | Full file - checklist extraction/sign-off flow, owner invite rules, admin god-mode behavior |
| [10-convex-schema.md](../../notes/10-convex-schema.md)             | Deal room tables, indexing patterns, audit validator patterns                               |
| [04-state-machines.md](../../notes/04-state-machines.md)           | Deal checklist transition rules + chat status/state machine patterns                        |
| [11-convex-architecture.md](../../notes/11-convex-architecture.md) | Wrapped mutation imports, Convex Action pattern, auth helper enforcement                    |
| [13-constants-reference.md](../../notes/13-constants-reference.md) | Enum and permission naming patterns, status color map conventions                           |

## Epics

| ID      | Title                                                                                 | Tasks | Status  | Depends On                |
| ------- | ------------------------------------------------------------------------------------- | ----- | ------- | ------------------------- |
| P25-E01 | [Deal Checklist Model & AI Extraction](P25-E01-deal-checklist-model-ai-extraction.md) | 4     | pending | P24-E01, P24-E02, P24-E03 |
| P25-E02 | [Multi-Party Approvals & Sign-Off](P25-E02-multi-party-approvals-signoff.md)          | 4     | pending | P25-E01                   |
| P25-E03 | [Owner Invite Flow](P25-E03-owner-invite-flow.md)                                     | 3     | pending | P24-E01, P24-E02, P20-E01 |
| P25-E04 | [Admin God-Mode & Chat Management](P25-E04-admin-god-mode-chat-management.md)         | 4     | pending | P24-E02, P25-E02, P25-E03 |

**Total: 4 epics, 15 tasks**

## Dependency Graph

```
P24-E01 ──┬──► P25-E01 ──► P25-E02 ──┐
          │       ▲                   ├──► P25-E04
P24-E02 ──┤       │                   │
          │   P24-E03                 │
P24-E02 ──┴──────────────► P25-E03 ───┘

P20-E01 ─────────────────► P25-E03
```

**Parallel note**: P25-E02 and P25-E03 can execute in parallel after their respective prerequisites are met (E01->E02, P24-E02->E03). P25-E04 MUST wait for BOTH E02 and E03 to complete before starting - it merges outputs from both tracks into the admin detail view.

## Completion Criteria

- [ ] `deal_checklists` and `deal_checklist_signatures` schemas include all required fields, indexes, and enum validators
- [ ] Deal checklist enums and permissions exist in `lib/constants.ts` with status color maps
- [ ] `convex/functions.ts` includes new deal checklist tables in `AUDITED_TABLES`
- [ ] `convex/dealChecklists.ts` implements create/edit/share/regenerate plus `getByInquiry`, `getById`, `listVersions`
- [ ] Share guard blocks low-confidence items unless admin-edited value is present
- [ ] `convex/actions/dealTermExtraction.ts` uses OpenAI structured outputs with Zod schema and source message IDs
- [ ] `convex/dealChecklistApprovals.ts` supports per-item tenant/owner responses with role-safe validation
- [ ] `signOff` mutation enforces per-party all-items-agreed gate and writes SHA-256 signature hashes
- [ ] Checklist status advances to APPROVED only after both party signatures are present
- [ ] Owner invite backend (`ownerInvites.ts`) supports generate/consume/regenerate and configurable expiry
- [ ] Expired invite cron marks stale invites as EXPIRED and prevents consumption
- [ ] Owner invite landing route (`/invite/[token]`) validates token and routes owner through Google SSO
- [ ] Admin chat management page renders channel table with filters/actions at `/admin/chat`
- [ ] Admin chat detail view exposes full transcript metadata, impersonation markers, and moderation actions
- [ ] `AGENTS.md` updated with new file paths (`convex/dealChecklists.ts`, `convex/dealChecklistApprovals.ts`, `convex/ownerInvites.ts`, `convex/actions/dealTermExtraction.ts`, `src/components/deal-room/`), new components, and updated Project Structure section
- [ ] `npm run build` succeeds and changed files pass `lsp_diagnostics`

## File Tree

```
tasks/phase-25-deal-room-features/
├── README.md
├── P25-E01-deal-checklist-model-ai-extraction.md
├── P25-E02-multi-party-approvals-signoff.md
├── P25-E03-owner-invite-flow.md
└── P25-E04-admin-god-mode-chat-management.md
```

## Scope Boundaries

### IN This Phase

- Deal checklist data model with versioning, supersession, and audit-friendly source attribution
- OpenAI structured extraction of terms from chat history into admin-reviewable checklist drafts
- Admin checklist lifecycle operations: create, edit term value, share, regenerate version
- Tenant/owner per-item response flow (agree/disagree/comment) with derived overall item status
- Formal dual-party sign-off backed by SHA-256 hash receipts
- Owner invite token lifecycle: generate, validate, consume, expire, regenerate
- Owner invite landing experience and post-SSO join path into chat channel
- Admin god-mode message controls (send as DemoRentals, impersonate, optional AI bypass per message)
- Admin moderation controls (freeze/unfreeze channel, soft-delete message, transcript review)
- Admin chat management and detailed transcript UX with impersonation and flag metadata

### NOT In This Phase

- 3-room negotiation channel architecture (`OPS_TENANT`, `OPS_OWNER`, `COMBINED`) -> **P26**
- Structured terms proposal engine and negotiation offer versioning -> **P26**
- Token advance recording and refund policy workflow -> **P26**
- Mandatory post-agreement 10-item hard closure gate -> **P26**
- Negotiation queue at `/admin/negotiations` and stale/round escalation flags -> **P26**
- Voice/video, file attachments, WhatsApp Business API automation -> **V2**

See [V2 Backlog](../../notes/09-v2-backlog.md) for deferred communication and negotiation surfaces.
