---
id: P41-E01
title: Owner Self-List and Source Foundation
phase: 41
status: pending
depends_on: []
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P41-E01: Owner Self-List and Source Foundation

## Overview

Implement the foundational supply-source contract for P41: backward-compatible lead attribution, owner self-list lifecycle, and collision tracking/resolution. This epic defines the canonical primitives consumed by secretary/resident/corporate/broker epics.

## Prerequisites

- P04 lead de-dup behavior must be understood before modifying collision flows.
- P31 owner identity matching contract (10-digit phone, canonical `owners` lookup) must be reused.
- Read `notes/features/33-supply-channel-diversification.md` first and follow it exactly.

## Task Queue

- [ ] P41-E01-T01: Add source enums, permissions, config keys, rate limits, and audit action constants
- [ ] P41-E01-T02: Extend `leads` source model and implement `source_collisions` with de-dup integration
- [ ] P41-E01-T03: Implement `owner_direct_leads` lifecycle and state transition guards
- [ ] P41-E01-T04: Build owner self-list intake and admin review surfaces with collision controls

---

## T01: Add Source Enums, Permissions, Config Keys, Rate Limits, and Audit Action Constants

### Objective

Create the global P41 constants contract so all downstream channels use one canonical vocabulary for source types, permissions, config defaults, rate limits, and audit actions.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/13-constants-reference.md`
- `notes/03-roles-and-permissions.md`
- `convex/rateLimiter.ts`
- `convex/functions.ts`

### Key Rules

1. Source enum must be exactly `GUARD | OWNER | SECRETARY | RESIDENT | BROKER | CORPORATE`.
2. Add required permission strings exactly as specified in feature doc; no renaming.
3. Add required config keys with defaults: broker window/suspension keys, corporate SLA, collision auto-resolve, resident/secretary bounty paise.
4. Add channel rate-limit config keys with defaults: `owner_self_list_rate_limit=3`, `secretary_submission_rate_limit=10`, `resident_referral_rate_limit=5`, `broker_submission_rate_limit=20`, `corporate_submission_rate_limit=50` (all per 24h).
5. Add audit action constants for all new entities (owner direct, secretary intake, resident referral, corporate, broker, collision).

### Deliverables

- [ ] `lib/constants.ts` - source enums, permissions, config key constants, audit action constants
- [ ] `convex/rateLimiter.ts` - supply intake limiter definitions
- [ ] `notes/features/33-supply-channel-diversification.md` (if needed during implementation) - kept aligned with shipped constants

### Acceptance Criteria

1. Shared constants export `source_channel` values exactly as `GUARD|OWNER|SECRETARY|RESIDENT|BROKER|CORPORATE` and all downstream imports compile.
2. Permissions required by P41 (`supply.sources.*`, `supply.collisions.*`, `supply.brokers.*`, `supply.corporate.manage`, `supply.secretary.manage`, `supply.resident.manage`) are declared once and reused.
3. Config defaults match the feature spec, including `broker_commission_pct=5000`, `secretary_bounty_amount_paise=50000`, and channel rate-limit keys.
4. Rate limiter definitions enforce 24h windows for owner/secretary/resident/broker/corporate channels and keep existing guard limiter unchanged.
5. Audit action constants include supply source lifecycle, collision lifecycle, owner direct, secretary intake, resident referral, corporate partnership, and broker partnership events.
6. No naming drift exists between code constants and canonical table names (`supply_sources`, `source_collisions`, `owner_direct_leads`, `broker_partnerships`, `corporate_partnerships`, `secretary_intake`, `resident_referrals`, `channel_analytics`, `channel_configs`).

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `lib/constants.ts` and `convex/rateLimiter.ts`.

### Out of Scope

- Schema table creation
- UI implementation

---

## T02: Extend `leads` Source Model and Implement `source_collisions` With De-Dup Integration

### Objective

Upgrade canonical lead attribution to support all source types while preserving legacy guard fields, and persist cross-channel duplicate outcomes into `source_collisions`.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/03-lead-pipeline.md`
- `notes/10-convex-schema.md`
- `notes/11-convex-architecture.md`
- `convex/schema.ts`
- `convex/leads.ts`

### Key Rules

1. Add to `leads`: `source_channel`, `source_reference_id`, typed `source_metadata`; keep `submitted_by_guard_id` unchanged.
2. `source_metadata` must be typed by source (no untyped `any`).
3. Implement `source_collisions` table with lifecycle `status` (`DETECTED`, `UNDER_REVIEW`, `RESOLVED`) and separate `resolution_type` (`PRIORITY_WINS`, `SPLIT_CREDIT`, `DISMISSED`).
4. Integrate P04 de-dup output so cross-source duplicates create collision records.
5. Enforce fixed priority order (`GUARD=1`, `OWNER=2`, `SECRETARY=3`, `RESIDENT=4`, `BROKER=5`, `CORPORATE=6`) and full 15-pair matrix resolution behavior with payout impact tagging.

### Deliverables

- [ ] `convex/schema.ts` - `leads` extension + `supply_sources` and `source_collisions` tables with required indexes
- [ ] `convex/leads.ts` - de-dup to collision emission and source-aware lead creation
- [ ] `convex/sourceCollisions.ts` - collision query/mutation module for review and resolution
- [ ] `convex/functions.ts` - include new audited table(s)

### Acceptance Criteria

1. Existing guard lead submissions still work with no migration break.
2. New `leads.source_channel` is required on creation and stores canonical channel values without using legacy `lead_source_type`.
3. Cross-channel duplicate detections create `source_collisions` rows within 5 seconds of lead submission.
4. Priority ordering query/API returns channels sorted by canonical rank (guard priority 1 first).
5. Collision lifecycle rejects invalid status transitions and rejects `status=RESOLVED` without `resolution_type`.
6. Payout impact code is persisted on collision resolution and is queryable for admin review.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `convex/leads.ts`, `convex/sourceCollisions.ts`, and `convex/functions.ts`.

### Out of Scope

- Channel-specific intake tables outside owner-direct

---

## T03: Implement `owner_direct_leads` Lifecycle and State Transition Guards

### Objective

Implement owner self-list backend lifecycle (`SUBMITTED -> VERIFIED -> ACTIVE -> SUSPENDED -> CLOSED`) with canonical lead promotion and owner identity resolution.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/21-owner-entity-and-rm.md`
- `notes/04-state-machines.md`
- `convex/schema.ts`
- `convex/auth.helpers.ts`

### Key Rules

1. Owner self-list creation mutation validates required fields and returns typed error codes for missing/invalid `phone` and `society_id`.
2. Owner self-list transitions must enforce actor checks and transition legality.
3. Owner identity must resolve via normalized 10-digit phone using P31 owner contract.
4. Promotion to canonical lead must set `source_channel=OWNER` and linkage fields.
5. Money remains paise and dates remain Unix ms only.
6. Transition logic is idempotent for retry/re-submit flows.

### Deliverables

- [ ] `convex/schema.ts` - `owner_direct_leads` table and indexes
- [ ] `convex/ownerDirectLeads.ts` - create, submit, verify, activate, reject, close, promote flows
- [ ] `convex/leads.ts` - owner direct promotion hooks (if colocated)

### Acceptance Criteria

1. Owner self-list create mutation rejects missing/invalid `phone` and `society_id` with typed, testable error payloads.
2. Owner-direct records support full required lifecycle (`SUBMITTED`, `VERIFIED`, `ACTIVE`, `SUSPENDED`, `CLOSED`).
3. Illegal transitions fail with clear, channel-specific errors.
4. Canonical lead promotion is idempotent and stores `source_channel=OWNER` with `source_reference_id` linkage.
5. Owner identity conflict routes to explicit `CONFLICT_REVIEW` path in source metadata.
6. Source lifecycle state in `supply_sources` remains consistent with owner-direct status transitions.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/ownerDirectLeads.ts`, `convex/schema.ts`, and touched lead modules.

### Out of Scope

- Secretary/resident/corporate/broker intake logic

---

## T04: Build Owner Self-List Intake and Admin Review Surfaces With Collision Controls

### Objective

Ship owner-facing submission and admin triage UI for owner-direct leads, including conversion, rejection, and collision resolution actions.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/14-owner-services.md`
- `src/app/(public)/owner-services/page.tsx`
- `src/app/(admin)/admin/tenant-inquiries/page.tsx`
- `src/components/ui/form.tsx`

### Key Rules

1. Public flow must use `react-hook-form + zod` and enforce normalized phone/flat rules.
2. Apply `owner_self_list_rate_limit` (default 3 per 24h) in backend path and reflect limit errors in UI.
3. Admin queue must expose status tabs and collision indicators.
4. Admin actions must be permission-gated (`supply.sources.manage`, `supply.collisions.resolve`).

### Deliverables

- [ ] `src/app/(public)/owner-services/list-property/page.tsx` - owner self-list page
- [ ] `src/app/(admin)/admin/supply/owner-direct/page.tsx` - admin queue page
- [ ] `src/components/admin/supply/owner-direct-table.tsx` - triage table and actions
- [ ] `src/components/admin/supply/collision-resolution-dialog.tsx` - winner/split/dismiss actions

### Acceptance Criteria

1. Public submission creates owner-direct record and enters lifecycle queue.
2. Public submission creates canonical lead with `source_channel=OWNER` after verification/activation path.
3. Admin can verify, activate, suspend, and close owner-direct records through legal transitions only.
4. Admin can resolve collision states from queue using `DETECTED -> UNDER_REVIEW -> RESOLVED` lifecycle.
5. Rate limit is enforced: a 4th owner self-list attempt in the same 24h window is rejected with a visible error.
6. UI behavior remains mobile-safe for public flow and desktop-safe for admin flow.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed frontend files in this task.

### Out of Scope

- Secretary/resident/corporate/broker admin pages

---

## Epic Verification (Task-Specific)

Run these checks before marking the epic done:

1. Create owner self-list lead and verify `leads.source_channel=OWNER`.
2. Submit duplicate vacancy from guard and verify collision record is created with `status=DETECTED`.
3. Resolve guard-vs-owner collision and verify priority outcome: guard (`priority=1`) wins over owner (`priority=2`).
4. Submit four owner leads within 24h and verify the 4th request is rate-limited and rejected.

## Completion Summary

> Write this section when epic status changes to `done`.

**Completed**: YYYY-MM-DD

### What Was Built

- [To be filled during completion]

### Key File Locations

| File  | What  |
| ----- | ----- |
| `TBD` | `TBD` |

### Deviations from Spec

- [To be filled during completion]

### Gotchas for Next Epic

- [To be filled during completion]
