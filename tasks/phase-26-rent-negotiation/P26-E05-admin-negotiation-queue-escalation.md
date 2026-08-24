---
id: P26-E05
title: Admin Negotiation Queue, Escalation & Analytics
phase: 26
status: done
depends_on: ["P26-E01", "P26-E02", "P26-E03", "P26-E04", "P24-E02", "P25-E02"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "doc-reconciler"]
updated_at: 2026-02-18
---

# P26-E05: Admin Negotiation Queue, Escalation & Analytics

## Overview

Deliver negotiation operations control surfaces: admin queue, negotiation detail workspace, escalation automation, and analytics/flag workflows that make negotiation throughput measurable and intervention-ready.

## Prerequisites

- **Read first**: [P26-E01 Completion Summary](P26-E01-three-room-architecture-acl.md#completion-summary) - room ACL and status base.
- **Read first**: [P26-E02 Completion Summary](P26-E02-terms-proposal-engine.md#completion-summary) - proposal version/sign-off metrics for queue and escalation.
- **Read first**: [P26-E03 Completion Summary](P26-E03-token-brokerage.md#completion-summary) - token metadata surfaced in detail sidebar and flag rules.
- **Read first**: [P26-E04 Completion Summary](P26-E04-mandatory-checklist-closure-gate.md#completion-summary) - checklist and readiness states shown in admin detail.
- P26-E01 through P26-E04 must be complete before this epic.

## Task Queue

- [x] P26-E05-T01: Negotiation Admin Queue
- [x] P26-E05-T02: Negotiation Detail Page
- [x] P26-E05-T03: Escalation Crons
- [x] P26-E05-T04: Escalation + Analytics

---

## T01: Negotiation Admin Queue

### Objective

Build the top-level negotiation operations board with status tabs, sortable metrics, and escalation indicators so ops can triage active deal pipelines quickly.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Admin Negotiation Queue story
- `notes/06-admin-panel-ux.md` - admin table/filter/sort interaction patterns
- `convex/negotiations.ts` - list/count query APIs and state fields
- `lib/constants.ts` - negotiation status values and badge mappings

### Key Rules

1. Create `src/app/(admin)/admin/negotiations/page.tsx` as the queue route.
2. Render paginated table with columns: listing, tenant, owner, ops agent, status, days in status, proposal rounds, escalation flags.
3. Add status tabs for every negotiation status value plus `All`.
4. Tab counts must come from backend `statusCounts` query.
5. Add sorting controls for: days in status, last activity, created date.
6. Add search by listing name/slug and tenant name.
7. Render visual flag indicators:
   - stale: red
   - many rounds: yellow
   - token without agreement progress: orange

### Deliverables

- [ ] `src/app/(admin)/admin/negotiations/page.tsx` - queue page scaffold
- [ ] `src/app/(admin)/admin/negotiations/components/negotiation-table.tsx` - table and sorting
- [ ] `src/app/(admin)/admin/negotiations/components/negotiation-status-tabs.tsx` - tab/filter counts
- [ ] `src/app/(admin)/admin/negotiations/components/negotiation-search.tsx` - search controls

### Acceptance Criteria

1. Queue route renders and loads paginated negotiation rows.
2. Status tabs show live counts from backend.
3. Sorting/search/filter controls update results predictably.
4. Escalation indicators are visible per row.
5. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on queue page and all new queue components.

### Out of Scope

- Detail page room tabs and sidebars
- Cron jobs and system config thresholds
- Analytics aggregation views

---

## T02: Negotiation Detail Page

### Objective

Build the negotiation workspace route where admins operate room conversations, proposals, checklist, token records, and status actions in one screen.

### Required Reading

- `notes/features/19-rent-negotiation.md` - detail-page user stories and 3-room behavior
- `notes/features/18-deal-room.md` - chat-view integration assumptions
- `src/components/negotiation/*` - proposal/token/checklist components from prior epics
- `convex/negotiations.ts` - detail query shape

### Key Rules

1. Create `src/app/(admin)/admin/negotiations/[id]/page.tsx`.
2. Header must show listing context, tenant/owner avatars, status badge, and ops assignment.
3. Render room tabs (`OPS_TENANT`, `OPS_OWNER`, `COMBINED`) each with chat view integration from P24.
4. Right sidebar must include mandatory checklist panel, proposal history, token record, and escalation flags.
5. Action bar must include: create proposal, share to room, assign/reassign ops, mark failed/stalled.
6. Include status timeline showing transition history.

### Deliverables

- [ ] `src/app/(admin)/admin/negotiations/[id]/page.tsx` - detail page shell and data wiring
- [ ] `src/app/(admin)/admin/negotiations/[id]/components/negotiation-room-tabs.tsx` - room tab/chat wrapper
- [ ] `src/app/(admin)/admin/negotiations/[id]/components/negotiation-sidebar.tsx` - checklist/proposal/token/escalation panel
- [ ] `src/app/(admin)/admin/negotiations/[id]/components/negotiation-status-timeline.tsx` - transition timeline

### Acceptance Criteria

1. Detail route loads negotiation by id and renders all required sections.
2. Room tabs route to correct chat contexts with ACL-safe visibility.
3. Sidebar surfaces checklist/proposal/token/flag data in one panel.
4. Action bar exposes required admin actions.
5. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on detail page and newly added detail components.

### Out of Scope

- Cron scheduling and flag-generation internals
- Analytics aggregate computations
- Referral/support dashboard integrations
- Owner-facing UI for selecting among competing tenants is deferred. In V1, ops manages competing negotiations manually by reviewing all negotiations for a listing and marking non-selected ones as `FAILED` with reason. Dedicated owner comparison/selection UI is V2.

---

## T03: Escalation Crons

### Objective

Implement escalation flag automation and threshold configuration so negotiation risk signals are generated consistently without manual scanning.

### Required Reading

- `notes/features/19-rent-negotiation.md` - Escalation section and threshold defaults
- `convex/crons.ts` - existing cron registration patterns
- `convex/seed.ts` + `lib/constants.ts` - `system_config` key/default conventions
- `convex/negotiations.ts` - status/activity/proposal-round fields used in flag logic

### Key Rules

1. Add escalation jobs in `convex/crons.ts`:
   - `checkStaleNegotiations` (daily)
   - `checkTokenWithoutAgreement` (daily)
   - proposal-round threshold check path (`checkExcessiveRounds`) invoked on proposal create/update flow
2. Add configurable system config keys with defaults:
   - `negotiation_stale_days` (default `7`)
   - `negotiation_max_rounds` (default `5`)
   - `negotiation_token_agreement_days` (default `3`)
3. Seed defaults via idempotent `system_config` bootstrap flow.
4. Flag writes must set negotiation `escalation_flags` fields (`is_stale`, `too_many_rounds`, `token_without_agreement`) without mutating unrelated fields.
5. Keep escalation checks side-effect scoped (flags only, no status auto-fail).

### Deliverables

- [ ] `convex/crons.ts` - escalation cron registrations and schedule wiring
- [ ] `convex/negotiations.ts` (or `convex/internal/negotiationEscalation.ts`) - escalation check handlers
- [ ] `lib/constants.ts` - escalation config keys
- [ ] `convex/seed.ts` - escalation threshold defaults

### Acceptance Criteria

1. Daily stale and token-without-agreement checks are scheduled.
2. Proposal-round overflow check is triggered from proposal write path.
3. All three threshold keys are configurable via `system_config` with defaults seeded.
4. Flags are set/reset on negotiations without status mutation side effects.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/crons.ts`, escalation handlers, `lib/constants.ts`, and `convex/seed.ts`.

### Out of Scope

- Queue/detail UI rendering
- Analytics dashboard summaries
- Manual flag dismissal UX

---

## T04: Escalation + Analytics

### Objective

Expose escalation operations and negotiation analytics queries, including flag dismissal with reasons, and wire indicators into queue/detail workflows.

### Required Reading

- `notes/features/19-rent-negotiation.md` - escalation + admin queue requirements
- `convex/negotiations.ts` - negotiation list/detail query shape
- `src/app/(admin)/admin/negotiations/*` - queue/detail UI from T01/T02
- `notes/features/10-analytics.md` - aggregate query style guidance

### Key Rules

1. Implement `flaggedNegotiations` query returning rows with any active escalation flag, sorted by severity.
2. Implement `negotiationAnalytics` query returning at minimum: average days to close, average proposal rounds, stale rate.
3. Implement admin mutation to dismiss individual flags with mandatory reason and audit metadata.
4. Surface escalation indicators and dismissal controls on both queue and detail pages.
5. Keep analytics read-only; no mutation side effects from analytics query execution.

### Deliverables

- [ ] `convex/negotiations.ts` - `flaggedNegotiations`, `negotiationAnalytics`, and `dismissEscalationFlag`
- [ ] `src/app/(admin)/admin/negotiations/components/negotiation-flags.tsx` - shared flag indicator + dismissal controls
- [ ] `src/app/(admin)/admin/negotiations/components/negotiation-analytics-cards.tsx` - analytics summary widgets

### Acceptance Criteria

1. Flagged query returns only negotiations with active flags and deterministic severity ordering.
2. Analytics query returns aggregate metrics required by spec.
3. Dismiss mutation requires reason and persists auditable dismissal state.
4. Queue/detail surfaces show both active flags and dismissal controls.
5. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on changed negotiation backend queries and UI analytics/flag components.

### Out of Scope

- Cross-phase KPI dashboard redesign
- Notification channels for escalations
- V2 predictive negotiation scoring

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
