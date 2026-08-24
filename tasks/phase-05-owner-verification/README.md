# Phase 5: Owner Verification (P05)

## Overview

Owner verification is the trust gate between lead intake and downstream execution. In this phase, admins call owners (outside the app), record call outcomes in `owner_verifications`, and move leads through verification-driven status transitions so only owner-confirmed inventory proceeds to listings and visits.

## Dependencies

| Phase / Epic                          | What It Provides for P05                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **P04-E01 (Lead Submission Backend)** | Lead status machine helper (`validateLeadTransition`), lead lifecycle foundation, guard-submitted leads in triageable statuses |
| **P04-E02 (Lead Admin Backend)**      | `leads.getById` (already includes `verifications` join), `leads.reject`, duplicate workflows, RBAC patterns for lead actions   |
| **P04-E03 (Admin Lead Queue UI)**     | Admin lead detail side panel, action button section, lead queue table/status tabs where verification UX is added               |
| **P04-E04 (Guard Lead UI)**           | Existing guard-facing VERIFIED badge + bounty visibility logic (`status === "VERIFIED" && prospective_bounty !== undefined`)   |

## Key Documentation

| Doc                                                           | Section                                            | Why You Need It                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `notes/features/04-owner-verification.md`                     | Full file                                          | THE feature spec for verification workflow, outcomes, and UI wireframe                  |
| `notes/04-state-machines.md`                                  | Lead Status + Validation Pattern                   | Canonical transitions, including VERIFIED behavior and two-step duplicate flow          |
| `notes/02-data-models.md`                                     | Section G (Owner Verification)                     | Field-level semantics (`rent_confirmed`, consent fields, multi-attempt rules)           |
| `notes/10-convex-schema.md`                                   | `owner_verifications` table + `leads` status field | Exact validators, index name, and lead status enum                                      |
| `notes/13-constants-reference.md`                             | Call outcomes, permissions, audit actions          | Canonical string values (`VERIFIED`, `UNREACHABLE`, `OWNER_VERIFICATIONS_INSERT`, etc.) |
| `notes/03-roles-and-permissions.md`                           | Lead Management permissions                        | `leads.verify` ownership and role mapping                                               |
| `notes/06-admin-panel-ux.md`                                  | Lead detail panel + verification flow              | Side-panel UX placement and verification entry point                                    |
| `tasks/phase-04-lead-pipeline/P04-E02-lead-admin-backend.md`  | `leads.getById`, `leads.reject` tasks              | Existing backend behavior P05 extends                                                   |
| `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` | Lead detail actions + panel sections               | Existing UI where `Call & Verify` is added                                              |

## Epics

| ID      | Title                                                     | Tasks | Status | Depends On         |
| ------- | --------------------------------------------------------- | ----- | ------ | ------------------ |
| P05-E01 | [Verification Backend](P05-E01-verification-backend.md)   | 5     | done   | [P04-E01, P04-E02] |
| P05-E02 | [Admin Verification UI](P05-E02-admin-verification-ui.md) | 4     | done   | [P05-E01, P04-E03] |

## Dependency Graph

```
P04-E01 ──┐
P04-E02 ──┴──► P05-E01 ───────► P05-E02
P04-E03 ─────────────────────────────►
```

## Execution Order

1. **P05-E01**: Verification backend domain, state transition updates, rejection extension, tests, and state-machine doc fix.
2. **P05-E02**: Admin lead detail action update + verification side-panel workflow + attempt history/status indicators.

## Completion Criteria

### Backend

- [ ] `convex/verifications.ts` exists with `verifications.create` mutation and `verifications.listByLead` query
- [ ] `verifications.create` inserts `owner_verifications` records with exact schema fields and enforces `leads.verify`
- [ ] Outcome side effects are correct:
  - `VERIFIED` + `consent_contact_demorentals=true` -> lead `VERIFIED`
  - `VERIFIED` + `consent_contact_demorentals=false` -> no lead status change
  - `UNREACHABLE` -> no lead status change
  - `DECLINED` / `FALSE` -> lead `REJECTED`
- [ ] Multiple verification attempts per lead are supported as separate records (append-only)
- [ ] `verifications.listByLead` returns attempts by `lead_id` (newest first or explicitly documented order)
- [ ] `convex/leads.ts` transition helper includes `VERIFIED: ["REJECTED"]`
- [ ] Existing `leads.reject` mutation accepts `VERIFIED` -> `REJECTED` (no new reject mutation created)
- [ ] `leads.reject` includes forward-coupling TODOs:
  - `// TODO P06: Archive linked listing when verified lead is rejected`
  - `// TODO P07: Cancel in-progress visits when verified lead is rejected`
- [ ] `notes/04-state-machines.md` validation snippet comment corrected to non-terminal VERIFIED and includes `VERIFIED: ["REJECTED"]`
- [ ] `notes/04-state-machines.md` lead transition table/prose reflects `VERIFIED -> REJECTED` and VERIFIED non-terminal behavior
- [ ] Audit behavior is documented correctly via wrapper triggers (`OWNER_VERIFICATIONS_INSERT`, `LEADS_UPDATE`), with no manual audit insertions
- [ ] Backend tests cover decisive and non-decisive outcomes, permission gates, and VERIFIED->REJECTED transitions

### Admin UI

- [ ] Lead detail panel action row includes `Call & Verify` for `SUBMITTED` leads (side panel flow)
- [ ] Verification form is implemented as a side panel (not a separate page)
- [ ] Form fields match spec/order: outcome, consent fields, preferred slots, rent confirmed, notes
- [ ] Consent conditional logic is enforced in UI and backend-compatible payloads
- [ ] Previous verification attempts are shown inside the verification panel
- [ ] Verification submit updates lead state reactively in lead queue/detail panel
- [ ] Verification status indicators appear in queue/detail views for verified leads (badge + consent metadata + verified timing)
- [ ] `Call & Verify` action is RBAC-gated by `leads.verify`

### RBAC / State Machine Compliance

- [ ] Verification-induced rejection (DECLINED/FALSE via `verifications.create`) is documented as `leads.verify`-protected behavior (not `leads.reject`)
- [ ] Manual rejection remains governed by `leads.reject`
- [ ] Two-step duplicate flow is preserved: `POTENTIAL_DUPLICATE -> SUBMITTED -> VERIFIED`

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] Changed files have clean diagnostics

## Files Created by This Phase

```
tasks/
  phase-05-owner-verification/
    README.md
    P05-E01-verification-backend.md
    P05-E02-admin-verification-ui.md

convex/
  verifications.ts                             # New verification domain functions (implemented in P05 execution)
  leads.ts                                     # Updated transitions + reject extension (implemented in P05 execution)

src/app/(admin)/admin/leads/components/
  lead-detail-panel.tsx                        # Updated with Call & Verify action (implemented in P05 execution)
  verification-panel.tsx                        # New side-panel form (implemented in P05 execution)
  verification-attempts.tsx                     # New prior-attempts section (implemented in P05 execution)

notes/
  04-state-machines.md                         # Transition table/prose + validation snippet correction (implemented in P05 execution)
```

## Scope Boundaries

### IN This Phase

- Owner verification data model usage (`owner_verifications`), including multiple call attempts
- Verification outcome capture and lead status side effects
- Admin verification UX inside existing lead detail side panel
- Extension of existing lead rejection semantics to include `VERIFIED -> REJECTED`
- State-machine documentation correction for VERIFIED non-terminal behavior

### NOT In This Phase

- Listing creation from verified leads -> **P06**
- Listing archival implementation logic when rejected (only TODO hooks in P05) -> **P06**
- Visit scheduling/cancellation implementation logic when rejected (only TODO hooks in P05) -> **P07**
- Guard notification system or push alerts -> **V2**
- Reimplementation of `leads.setBounty` (already delivered in P04)
- Guard UI bounty display changes (already delivered in P04-E04)
