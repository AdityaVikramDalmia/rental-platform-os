---
id: P41-E02
title: Society Secretary and Resident Channels
phase: 41
status: pending
depends_on: ["P41-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P41-E02: Society Secretary and Resident Channels

## Overview

Implement secretary intake and resident referral channels on top of the source foundation from P41-E01. This epic delivers onboarding, eligibility gates, conversion to canonical leads, and bounty attribution compatible with P22 referral rails.

## Prerequisites

- Read first: `P41-E01` completion summary before starting this epic.
- P41-E01 source enums, collision model, and permissions must be available.
- Soft dependency awareness: P37 resident profile rails may not exist in all environments; implement fallback behavior.

## Task Queue

- [ ] P41-E02-T01: Implement secretary onboarding and `secretary_intake` schema/state machine
- [ ] P41-E02-T02: Implement `resident_referrals` schema and resident eligibility contract
- [ ] P41-E02-T03: Build secretary/resident submission-conversion flows with collision and payout impact handling
- [ ] P41-E02-T04: Build admin queues, channel reporting, and bounty lifecycle visibility

---

## T01: Implement Secretary Onboarding and `secretary_intake` Schema/State Machine

### Objective

Create secretary intake primitives with strict onboarding contract (`phone + society_id` identity), partnership prechecks, and complete intake state transitions.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/01-society-registry.md`
- `notes/04-state-machines.md`
- `notes/13-constants-reference.md`
- `convex/schema.ts`

### Key Rules

1. Secretary onboarding requires active society partnership and admin verification.
2. Secretary identity key is `(normalized_phone, society_id)`.
3. `secretary_intake` lifecycle must be exactly `NOMINATED -> VERIFIED -> TRAINED -> ACTIVE -> INACTIVE`.
4. Training completion requires all 5 checklist items tracked in `secretary_intake.training_checklist`.
5. All phones must be normalized to 10 digits and flats uppercase.
6. Compensation uses `secretary_bounty_amount_paise` and standard payout rails.

### Deliverables

- [ ] `convex/schema.ts` - `secretary_intake` table and indexes
- [ ] `convex/secretaryIntake.ts` - onboarding checks and intake state transitions
- [ ] `lib/constants.ts` - secretary enums/labels if new constants are required

### Acceptance Criteria

1. `secretaryIntake.nominate({phone, society_id, name})` creates `secretary_intake` records with `status=NOMINATED` and normalized phone.
2. Verification transition requires admin action and records proof metadata before moving to `VERIFIED`.
3. Training transition to `TRAINED` is blocked until all 5 checklist item IDs are present in `training_checklist`.
4. Activation transition `TRAINED -> ACTIVE` is admin-only and auditable.
5. Inactivity transition `ACTIVE -> INACTIVE` triggers after 90 days without submissions.
6. Secretary lead submissions produced from active secretaries store `leads.source_channel=SECRETARY`.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/secretaryIntake.ts`, `convex/schema.ts`, and touched constants files.

### Out of Scope

- Resident referral implementation

---

## T02: Implement `resident_referrals` Schema and Resident Eligibility Contract

### Objective

Create resident vacancy referral data model and eligibility enforcement, including self-referral and same-household blocking with P37 fallback behavior.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/17-referral-system.md`
- `notes/features/29-post-move-in-lifecycle.md`
- `notes/13-constants-reference.md`
- `convex/schema.ts`

### Key Rules

1. `resident_referrals` must include `resident_user_id`, `resident_profile_id`, `society_id`, `flat_number`, `referral_type`, `status`, and `bounty_status`.
2. Eligibility requires active resident profile when available.
3. Block self-referrals and same-household referrals.
4. Bounty triggers only on first verified canonical lead.
5. If P37 profile rails are absent, mark referral `NOT_ELIGIBLE` and route to manual review fallback.

### Deliverables

- [ ] `convex/schema.ts` - `resident_referrals` table and indexes
- [ ] `convex/residentReferrals.ts` - submission, validation, lifecycle, bounty trigger hooks
- [ ] `convex/referralMilestones.ts` - resident vacancy payout reuse integration

### Acceptance Criteria

1. Resident referral submissions block self-referrals and same-household referrals with explicit error codes.
2. Eligibility checks enforce active resident profile when available; fallback path marks `bounty_status=NOT_ELIGIBLE` when rails are unavailable.
3. De-dup validation checks against existing leads before `SUBMITTED -> VERIFIED` transition.
4. Referral lifecycle supports `SUBMITTED -> VERIFIED -> REWARDED -> EXPIRED` with legal-transition enforcement.
5. Reward transition is admin-approved only after linked lead reaches `VERIFIED`.
6. Bounty trigger reuses existing referral milestone system, not ad-hoc payout logic.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/residentReferrals.ts`, `convex/schema.ts`, and referral integration files.

### Out of Scope

- Secretary queue UI

---

## T03: Build Secretary/Resident Submission-Conversion Flows With Collision and Payout Impact Handling

### Objective

Implement end-to-end submission and conversion workflows that produce canonical leads, emit collisions, and apply loser payout voiding according to matrix rules.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/03-lead-pipeline.md`
- `convex/leads.ts`
- `convex/sourceCollisions.ts`
- `convex/secretaryIntake.ts`
- `convex/residentReferrals.ts`

### Key Rules

1. Conversion to canonical lead must write `source_reference_id` and typed `source_metadata`.
2. Collisions must follow fixed priority ordering and emit payout impact (`VOIDED_COLLISION` where applicable).
3. All transitions must be idempotent and retry-safe.
4. Secretary and resident channels must pass through standard lead verification gates.

### Deliverables

- [ ] `convex/secretaryIntake.ts` - convert/reject flows into canonical leads
- [ ] `convex/residentReferrals.ts` - convert/reject flows into canonical leads
- [ ] `convex/leads.ts` - source-aware ingestion helpers and conversion hooks
- [ ] `convex/sourceCollisions.ts` - payout-impact mutation helpers for loser outcomes

### Acceptance Criteria

1. Secretary conversions create canonical lead records with `source_channel=SECRETARY` and valid `source_reference_id`.
2. Resident conversions create canonical lead records with `source_channel=RESIDENT` and valid `source_reference_id`.
3. Cross-channel duplicates emit `source_collisions` records with `status=DETECTED` and computed priority difference.
4. Collision resolution honors status/resolution split (`status=RESOLVED` + `resolution_type`).
5. Loser payout status transitions to collision-voided states where required.
6. Conversion and collision handlers are idempotent under retry.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed Convex modules in this task.

### Out of Scope

- Corporate and broker flows

---

## T04: Build Admin Queues, Channel Reporting, and Bounty Lifecycle Visibility

### Objective

Provide admin operations views for secretary and resident channels with lifecycle tabs, collision signals, and bounty state visibility.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `src/app/(admin)/admin/owner-requests/page.tsx`
- `src/app/(admin)/admin/tenant-inquiries/page.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/table` (existing patterns)

### Key Rules

1. Admin visibility requires `supply.sources.view`.
2. Mutating actions require `supply.secretary.manage` or `supply.resident.manage`.
3. Queue must show status, collision state, and bounty status in one row model.
4. Pagination and sort conventions must match existing admin pages.

### Deliverables

- [ ] `convex/schema.ts` - add `channel_analytics` and `channel_configs` tables with required indexes
- [ ] `convex/channelAnalytics.ts` - per-channel dashboard query contracts for `7d`/`30d`/`90d` windows
- [ ] `convex/channelConfigs.ts` - channel config query/mutation contracts for enablement and limits
- [ ] `src/app/(admin)/admin/supply/secretary/page.tsx` - secretary intake queue
- [ ] `src/app/(admin)/admin/supply/resident/page.tsx` - resident referral queue
- [ ] `src/app/(admin)/admin/channels/page.tsx` - channel analytics and config management page
- [ ] `src/components/admin/supply/secretary-intake-table.tsx` - secretary queue table
- [ ] `src/components/admin/supply/resident-referral-table.tsx` - resident queue table
- [ ] `src/components/admin/supply/channel-analytics-table.tsx` - per-channel metrics table
- [ ] `src/components/admin/supply/channel-config-panel.tsx` - per-channel config controls

### Acceptance Criteria

1. Secretary queue supports legal admin actions for `NOMINATED`, `VERIFIED`, `TRAINED`, `ACTIVE`, and `INACTIVE` records.
2. Resident queue supports legal lifecycle actions for `SUBMITTED`, `VERIFIED`, `REWARDED`, and `EXPIRED` records.
3. Collision status and `resolution_type` are visible and consistent with backend state.
4. Bounty status is visible and updates in real time after reward/collision decisions.
5. Both pages support pagination, sorting, and empty/loading/error states consistent with admin standards.
6. Permission gating blocks unauthorized actions while allowing read-only visibility for `supply.sources.view` users.
7. Channel analytics/config surfaces are backed by canonical `channel_analytics` and `channel_configs` contracts.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed page/component files for this task.

### Out of Scope

- Broker/corporate dashboards

---

## Epic Verification (Task-Specific)

Run these checks before marking the epic done:

1. Nominate a secretary, complete all 5 training checklist items, and activate.
2. Submit a secretary lead and verify `leads.source_channel=SECRETARY`.
3. Submit resident referral for an existing lead and verify de-dup/collision handling runs.
4. Advance clock by 91 days with no secretary submissions and verify `ACTIVE -> INACTIVE` transition.

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
