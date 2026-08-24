---
id: P25-E02
title: Multi-Party Approvals & Sign-Off
phase: 25
status: pending
depends_on: ["P25-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-18
---

# P25-E02: Multi-Party Approvals & Sign-Off

## Overview

Implement the deal checklist collaboration layer: per-item tenant/owner responses, dispute resolution controls for admins, formal dual-party sign-off with SHA-256 signature receipts, and checklist-facing UI for parties and admins including version history visibility.

## Prerequisites

- **Read first**: P25-E01 completion summary for checklist schema, statuses, and extraction payload assumptions.
- P25-E01 must be complete because this epic writes to checklist item approval objects and signature tables introduced there.
- Confirm checklist status transitions and permission constants exist before wiring UI actions.

## Task Queue

- [ ] P25-E02-T01: Per-Item Approval Mutations
- [ ] P25-E02-T02: Formal Sign-Off Backend
- [ ] P25-E02-T03: Approval UI Components
- [ ] P25-E02-T04: Admin Checklist Management UI

---

## T01: Per-Item Approval Mutations

### Objective

Add checklist item response and dispute-resolution mutations so tenant and owner can respond independently while admin can mediate disagreements and finalize per-item values.

### Required Reading

- `notes/features/18-deal-room.md` - Checklist Item States and checklist flow
- `notes/04-state-machines.md` - checklist lifecycle transitions
- `notes/11-convex-architecture.md` - role-based mutation guards and wrapped mutation imports
- `tasks/phase-25-deal-room-features/P25-E01-deal-checklist-model-ai-extraction.md` - item/approval object shape

### Key Rules

1. Create `convex/dealChecklistApprovals.ts` using wrapped `mutation`/`query` imports.
2. Implement `respondToItem` mutation for tenant/owner responses (`AGREED`, `DISAGREED`, `COMMENTED`) with optional comment.
3. Implement `resolveDispute` mutation for admin override with resolution notes and final value capture.
4. Only tenant may update `tenant_approval`; only owner may update `owner_approval`.
5. Responses are allowed only when checklist status is `SHARED` (or `IN_REVIEW` if you model incremental review); block on `DRAFT`, `APPROVED`, `SUPERSEDED`.
6. Reject duplicate responses after a party has already responded unless admin performs dispute resolution/reset first.
7. Recalculate item `overall_status` after each response using exact derivation:
   - both parties `AGREED` → `RESOLVED`
   - any party `DISAGREED` → `DISPUTED`
   - any party `COMMENTED` (and none DISAGREED) → `NEEDS_DISCUSSION`
   - any party still `PENDING` (and none DISAGREED/COMMENTED) → `UNREVIEWED`
     These match the `DEAL_CHECKLIST_ITEM_OVERALL_STATUS` enum defined in P25-E01-T01.
8. Update checklist-level status derivation consistently with item changes (`IN_REVIEW`/dispute signaling as needed).
9. Handle version supersession during active approval: if the checklist this response targets has been superseded (status = `SUPERSEDED`), reject the response with error "Checklist has been updated — please review the new version." This prevents stale approvals on old versions.

### Deliverables

- [ ] `convex/dealChecklistApprovals.ts` - `respondToItem` and `resolveDispute` mutations with status recomputation helpers

### Acceptance Criteria

1. Tenant and owner can respond only to their own approval field.
2. Responding on non-shared/non-reviewable checklist states is blocked.
3. Duplicate responses are prevented without explicit admin mediation path.
4. `overall_status` updates correctly for all approval combinations.
5. `resolveDispute` records admin decision metadata and resulting value.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/dealChecklistApprovals.ts`.

### Out of Scope

- Signature hashing and final checklist approval
- Invite acceptance and owner onboarding
- Admin chat moderation controls

---

## T02: Formal Sign-Off Backend

### Objective

Implement formal checklist sign-off so each party can sign only after agreeing all items, with deterministic SHA-256 signature hash generation and automatic checklist approval after both signatures.

### Required Reading

- `notes/features/18-deal-room.md` - final sign-off and closure integration sections
- `notes/04-state-machines.md` - checklist `IN_REVIEW -> APPROVED` gating rules
- `notes/11-convex-architecture.md` - secure mutation patterns and actor validation

### Key Rules

1. Add `signOff` mutation for tenant/owner in `convex/dealChecklistApprovals.ts` (or dedicated signature module if preferred).
2. Before sign-off, validate every checklist item is `AGREED` by the signing party.
3. Build deterministic signing payload: use JSON canonicalization (RFC 8785 JCS via `json-canonicalize` package, or a sorted-key stringifier) to ensure identical agreed-item payloads always produce the same hash. `JSON.stringify()` is NOT deterministic — property order varies across engines. Generate SHA-256 via `crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPayload))` — available in Convex's default V8 runtime without polyfills.
4. Insert a `deal_checklist_signatures` record with role, user, hash, timestamp, and optional IP.
5. Prevent duplicate signatures for the same user+checklist version.
6. After both tenant and owner signatures exist, transition checklist status to `APPROVED` and set `approved_at`.
7. Add `getSignatures` query returning signature records for checklist receipt UI.

### Deliverables

- [ ] `convex/dealChecklistApprovals.ts` - `signOff` mutation and `getSignatures` query

### Acceptance Criteria

1. Sign-off is blocked when signer has any non-agreed item.
2. Signature hash generation is deterministic for identical agreed-item payloads.
3. Duplicate sign attempts by same signer are rejected.
4. Checklist moves to `APPROVED` only after both required signatures exist.
5. `getSignatures` returns signatures suitable for receipt rendering.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/dealChecklistApprovals.ts`.

### Out of Scope

- Regeneration/version supersession mechanics (handled in P25-E01)
- Owner invite token flow
- Admin transcript management page

---

## T03: Approval UI Components

### Objective

Build tenant/owner-facing checklist UI components for item-by-item approvals, progress tracking, sign-off confirmation, and version timeline visibility.

### Required Reading

- `notes/features/18-deal-room.md` - tenant/owner checklist UX and sign-off acceptance criteria
- `notes/05-guard-portal-ux.md` and `notes/06-admin-panel-ux.md` - component structure conventions and status badge patterns
- `tasks/phase-25-deal-room-features/P25-E01-deal-checklist-model-ai-extraction.md` - checklist item structure

### Key Rules

1. Create `src/components/deal-room/ChecklistItemCard.tsx` showing term/value, both party statuses, and response actions for current actor.
2. Create `src/components/deal-room/ChecklistView.tsx` rendering full checklist, grouped by term type, with progress bar (`N/M` agreed).
3. Create `src/components/deal-room/SignOffDialog.tsx` with final term confirmation and signature receipt rendering after success.
4. Create `src/components/deal-room/VersionHistory.tsx` as a sheet/dialog listing all versions with status badges.
5. UI actions must enforce role-aware controls (tenant cannot submit owner response and vice versa).
6. Show immutable read-only state when checklist is `APPROVED` or `SUPERSEDED`.
7. The shared deal checklist must render as a special card/message type within the chat stream (not just a sidebar panel). When admin shares a checklist, insert a SYSTEM message with `content_type: 'deal_checklist'` and `checklist_id` reference. The `MessageBubble` component (P24-E04-T01) should handle this content type by rendering an inline `ChecklistCard` component. Note: P24-E04-T01's `MessageBubble` may not have been built with `content_type` extensibility. If `MessageBubble` does not accept a `contentType` prop, this task must extend it to support a conditional render path: when `content_type === 'deal_checklist'`, render `ChecklistCard` instead of the default text bubble.
8. Implement real-time version supersession detection: subscribe to the active checklist version. When a new version supersedes the current one (admin regenerated), show a toast: "Checklist updated — please review the new version" and refresh the checklist view to show the new version.

### Deliverables

- [ ] `src/components/deal-room/ChecklistItemCard.tsx` - per-item approval UI
- [ ] `src/components/deal-room/ChecklistView.tsx` - grouped checklist + progress UX
- [ ] `src/components/deal-room/SignOffDialog.tsx` - sign-off flow and receipt surface
- [ ] `src/components/deal-room/VersionHistory.tsx` - checklist version timeline
- [ ] `src/components/deal-room/ChecklistCard.tsx` - inline card rendered inside chat message stream with checklist summary, approval progress, and link to full checklist view

### Acceptance Criteria

1. Checklist item cards display both party statuses and current value resolution.
2. Progress bar reflects current agreement totals from checklist data.
3. Sign-off dialog blocks submit until backend eligibility checks pass.
4. Version history shows all versions with status and timestamp context.
5. Components render without TypeScript or runtime errors.
6. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on all four new component files.

### Out of Scope

- Admin moderation controls unrelated to checklist workflows
- Invite landing and owner auth flows
- Negotiation (P26) mandatory checklist UI
- PDF/structured export of signed deal checklists deferred to V2. The signed checklist data (terms + signatures + hashes) is persisted in the database and can be queried for closure documentation; a dedicated export feature is not built in V1.

---

## T04: Admin Checklist Management UI

### Objective

Add admin-facing checklist operations for response oversight, dispute resolution, regeneration/version comparison, and checklist control integration into admin inquiry management.

> **Scope boundary with P25-E04-T04**: This task (E02-T04) owns the standalone checklist management surface — term editing, dispute resolution, version diff, regeneration — embedded within the admin inquiry detail page. P25-E04-T04 owns the chat transcript detail view with embedded checklist summary card, moderation controls, and impersonation actions. They are separate UI surfaces that may link to each other.

### Required Reading

- `notes/features/18-deal-room.md` - admin checklist management and edit/regenerate expectations
- `notes/06-admin-panel-ux.md` - admin panel table/detail interaction patterns
- `tasks/phase-25-deal-room-features/P25-E02-multi-party-approvals-signoff.md` - approval/sign-off backend contracts

### Key Rules

1. Provide an admin checklist view that shows all items with tenant/owner responses and current per-item status.
2. Add admin edit controls and a dispute-resolution dialog that calls `resolveDispute`.
3. Add checklist regeneration trigger with mandatory reason prompt before creating new version.
4. Implement version comparison view (diff between selected versions).
5. Embed this UI in admin inquiry detail page or dedicated admin checklist section with clear navigation.
6. Preserve audit visibility for admin overrides and regenerated versions.

### Deliverables

- [ ] Admin checklist management surface integrated into admin inquiry/detail workflow
- [ ] Regenerate checklist action with reason capture
- [ ] Version comparison (diff) UI for checklist revisions

### Acceptance Criteria

1. Admin can view full per-item response matrix (tenant + owner) from one screen.
2. Admin can resolve disputes and persist resolution notes/value.
3. Regenerate action creates a new version and visibly supersedes old one.
4. Version diff view shows field-level term changes between versions.
5. Build passes with no diagnostics errors on changed UI files.
6. `npm run build` succeeds.

### Verification

```bash
npm run build
```

Run `lsp_diagnostics` on changed admin checklist UI files.

### Out of Scope

- Channel freeze/unfreeze and transcript moderation actions
- Owner invite generation UI
- Negotiation queue and P26 checklists

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
