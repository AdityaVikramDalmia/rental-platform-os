---
id: P40-E05
title: Vacancy Heartbeat
phase: 40
status: pending
depends_on: ["P33"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P40-E05: Vacancy Heartbeat

## Overview

Implement canonical vacancy heartbeat ingestion and freshness computation with source precedence, trust-aligned statuses (`FRESH`, `AGING`, `STALE`), reactive listing/admin queries, and six-hour stale sweeps. This epic is the hard contract between P40 intelligence and P33 trust display.

## Prerequisites

- P33 trust badges and freshness surfaces exist.
- `notes/features/32-ai-intelligence-spine.md` heartbeat source + precedence contract is final.
- Listing and visit entities (P06/P07) already provide event hooks.

## Task Queue

- [ ] P40-E05-T01: Add vacancy heartbeat schema, source enums, and threshold config keys
- [ ] P40-E05-T02: Implement `record`/`getForListing` contracts with canonical precedence logic
- [ ] P40-E05-T03: Implement cron schedule (`vacancyHeartbeat` every 6h) and stale-notification events
- [ ] P40-E05-T04: Integrate heartbeat outputs into admin/public trust surfaces and P41 export contract

---

## T01: Add Vacancy Heartbeat Schema, Source Enums, and Threshold Config Keys

### Objective

Create canonical storage and config foundation for heartbeat freshness while keeping status semantics aligned with P33 trust rails.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md`
- `notes/features/25-trust-verification-display.md`
- `notes/10-convex-schema.md`
- `convex/schema.ts`
- `lib/constants.ts`

### Key Rules

1. Source enum must be exactly `GUARD_REPORT`, `OWNER_CONFIRMATION`, `OPS_VERIFICATION`, `SYSTEM_INFERENCE`.
2. Precedence must be represented explicitly (`OWNER > OPS > GUARD > SYSTEM`).
3. Freshness thresholds come from config keys (`ai_vacancy_fresh_days`, `ai_vacancy_aging_days`).
4. Status enum is only `FRESH`, `AGING`, `STALE`.
5. Include `confidence_score`, `model_version`, and `computed_at` fields.

### Deliverables

- [ ] `convex/schema.ts` - add `vacancy_heartbeats` table and indexes
- [ ] `lib/constants.ts` - add heartbeat source/status constants and precedence map
- [ ] `lib/constants.ts` - add `ai_vacancy_fresh_days` and `ai_vacancy_aging_days` config constants

### Acceptance Criteria

1. Schema stores listing, source, source rank, timestamps, status, and confidence.
2. All four canonical source values are accepted and no legacy aliases remain.
3. Indexes support lookup by listing and stale sweeps by status/time.
4. Config keys are discoverable via existing system config conventions.
5. TypeScript/build pass with no enum drift.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts` and `lib/constants.ts`.

### Out of Scope

- ingest mutation logic
- UI rendering

---

## T02: Implement `record`/`getForListing` Contracts With Canonical Precedence Logic

### Objective

Implement heartbeat ingestion and read APIs with deterministic precedence and freshness-state computation.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Vacancy Heartbeat Contract)
- `convex/functions.ts`
- `convex/listings.ts`
- `convex/visits.ts`

### Key Rules

1. `vacancyHeartbeat.record` args/returns must exactly match feature contract.
2. Conflict resolution: higher source precedence wins; same source uses latest timestamp.
3. Freshness status must map to configurable day thresholds.
4. Include confidence scoring and model version in persisted row.
5. Mutation must write audit action for every accepted heartbeat.

### Deliverables

- [ ] `convex/vacancyHeartbeat.ts` - `record` mutation and `getForListing` query contracts
- [ ] `convex/vacancyHeartbeat.ts` - helper utilities (`resolveSourcePriority`, `deriveFreshnessStatus`)
- [ ] `convex/vacancyHeartbeat.ts` - optional list query for stale admin surfaces

### Acceptance Criteria

1. New higher-precedence heartbeat can override older lower-precedence signal.
2. Lower-precedence stale signal cannot downgrade fresher higher-precedence state.
3. `getForListing` returns typed payload with source, status, confidence, and timestamps.
4. `record` mutation works for all four heartbeat sources.
5. Audit log entries are emitted for record/update operations.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/vacancyHeartbeat.ts`.

### Out of Scope

- six-hour cron sweeps
- notification event emission

---

## T03: Implement Cron Schedule (`vacancyHeartbeat` Every 6h) and Stale-Notification Events

### Objective

Add recurring stale reevaluation and emit stale-heartbeat events for downstream notification workflows.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Cron Cadence + P40 -> P35 contract)
- `convex/crons.ts`
- `convex/notifications.ts`

### Key Rules

1. Cron name must be exactly `vacancyHeartbeat`.
2. Schedule frequency must be every 6 hours.
3. Emit `vacancy.heartbeat.stale` only on status transition to `STALE`.
4. Event payload must follow P40 -> P35 schema exactly.
5. Cron path must be idempotent and safe to rerun.

### Deliverables

- [ ] `convex/crons.ts` - add 6-hour vacancy heartbeat cron
- [ ] `convex/vacancyHeartbeat.ts` - add stale sweep internal function
- [ ] `convex/notifications.ts` - stale heartbeat event emitter

### Acceptance Criteria

1. Cron registration uses 6-hour interval and correct internal function reference.
2. Sweep updates listing heartbeat status when threshold crossing occurs.
3. Stale transition emits one event per transition, not every sweep.
4. Event payload includes `entity_type`, `entity_id`, `score`, `confidence_score`, `model_version`, and timestamp.
5. Cron and event code compile without circular imports or type errors.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/crons.ts`, `convex/vacancyHeartbeat.ts`, and `convex/notifications.ts`.

### Out of Scope

- notification channel template rendering
- admin UI list design changes

---

## T04: Integrate Heartbeat Outputs Into Admin/Public Trust Surfaces and P41 Export Contract

### Objective

Expose heartbeat freshness in listing and admin trust contexts and ensure score contract export consumed by P41 is stable.

### Required Reading

- `notes/features/25-trust-verification-display.md`
- `notes/features/32-ai-intelligence-spine.md` (Cross-Phase Contracts)
- `src/app/listing/[slug]/page.tsx`
- `src/components/shared/trust-badge-chip.tsx`
- `src/app/(admin)/admin/stale-listings/page.tsx`

### Key Rules

1. P33 freshness semantics remain canonical; P40 enriches, not replaces.
2. Public listing page must show last confirmed vacancy timestamp.
3. Admin stale queue must consume heartbeat status without duplicate source-of-truth logic.
4. Export object for P41 must include `{score, band, confidence, model_version}` where relevant.
5. No hardcoded day thresholds in UI; use backend-derived status.

### Deliverables

- [ ] `src/app/listing/[slug]/page.tsx` and related listing components - heartbeat freshness rendering
- [ ] `src/app/(admin)/admin/stale-listings/page.tsx` - query wiring to canonical heartbeat outputs
- [ ] `convex/vacancyHeartbeat.ts` or shared contract module - P41 export payload helper

### Acceptance Criteria

1. Public listing detail shows freshness status and last-confirmed time.
2. Admin stale listings page reflects same status values (`FRESH/AGING/STALE`) as backend.
3. Trust chips and stale queue remain consistent after heartbeat updates.
4. P41-facing export object shape is implemented and type-safe.
5. UI and backend compile cleanly and pass build.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed listing/admin files and `convex/vacancyHeartbeat.ts`.

### Out of Scope

- redesign of trust badge visuals
- adding new trust badge types beyond freshness

---

## Epic Verification Scenario

Run vacancy heartbeat cron for test society. Verify heartbeat records created for all active listings in society. Verify freshness state (FRESH/AGING/STALE) computed correctly based on `ai_vacancy_fresh_days`/`ai_vacancy_aging_days`/`ai_vacancy_stale_days` thresholds. Verify listings exceeding `ai_vacancy_stale_days` threshold flagged. Test with corrupt/missing photo data - verify graceful fallback to AGING.

---

## Completion Summary

> Fill this section when epic status becomes `done`.

**Completed**: YYYY-MM-DD

### What Was Built

- TODO

### Key File Locations

| File                         | What |
| ---------------------------- | ---- |
| `convex/vacancyHeartbeat.ts` | TODO |

### Deviations from Spec

- TODO

### Gotchas for Next Epic

- TODO
