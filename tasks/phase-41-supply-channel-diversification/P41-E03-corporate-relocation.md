---
id: P41-E03
title: Corporate Relocation
phase: 41
status: pending
depends_on: ["P41-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P41-E03: Corporate Relocation

## Overview

Implement B2B corporate relocation intake with account rails, request lifecycle management, tenant-inquiry linkage, SLA stage escalation, and batch import support with row-level error reporting.

## Prerequisites

- Read first: `P41-E01` completion summary and source attribution contracts.
- Understand P19 tenant inquiry linkage requirements for downstream conversion tracking.
- Review P40 score interface contract for optional quality gating.

## Task Queue

- [ ] P41-E03-T01: Add `corporate_partnerships` schema plus lifecycle constants
- [ ] P41-E03-T02: Implement single and batch relocation intake with typed import error model
- [ ] P41-E03-T03: Implement SLA lifecycle transitions and notification hooks
- [ ] P41-E03-T04: Build admin corporate operations surfaces and inquiry-linking controls

---

## T01: Add `corporate_partnerships` Schema Plus Lifecycle Constants

### Objective

Create corporate partnership tables/fields with full lifecycle and commercial terms, index strategy, and stable source attribution linkage fields.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `convex/schema.ts`

### Key Rules

1. Corporate partnership lifecycle must be exactly `PROSPECT -> NEGOTIATION -> CONTRACTED -> ACTIVE -> PAUSED -> EXPIRED`.
2. Commercial terms fields must include `pricing_tier`, `is_exclusive`, scope, and `billing_terms`.
3. Keep inquiry linkage optional but indexed for lifecycle tracing.
4. All budget fields are paise integers.
5. All phone fields are normalized 10-digit strings.

### Deliverables

- [ ] `convex/schema.ts` - `corporate_partnerships` definitions + indexes
- [ ] `lib/constants.ts` - corporate status and SLA stage enums/labels/config references

### Acceptance Criteria

1. `corporate_partnerships` schema compiles with validators for lifecycle, pricing tier, exclusivity, SLA, and billing fields.
2. Lifecycle enums are shared from constants and reused by backend + UI modules.
3. `pricing_tier` supports `<10`, `10-50`, and `50+` monthly lead bands.
4. Exclusivity contract requires `is_exclusive=true` with society-scope metadata for priority override handling.
5. Billing terms support monthly invoice with NET-30 configuration.
6. Tenant inquiry linkage fields are available for downstream conversion reporting.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts` and `lib/constants.ts`.

### Out of Scope

- UI pages

---

## T02: Implement Single and Batch Relocation Intake With Typed Import Error Model

### Objective

Build intake APIs for both single relocation requests and batch uploads, returning deterministic row-level error output while allowing partial success.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/13-tenant-inquiry.md`
- `convex/schema.ts`
- `convex/auth.helpers.ts`

### Key Rules

1. Batch API must return `{ batch_id, created_count, failed_count, errors[] }` with typed error codes.
2. Partial success is required; one bad row cannot fail whole batch.
3. Every created corporate-origin lead must carry `source_channel=CORPORATE` context through promotion path.
4. Required move-in date and budget ranges must be validated server-side.

### Deliverables

- [ ] `convex/corporatePartnerships.ts` - create, importBatch, list, getById, updateStatus mutations/queries
- [ ] `convex/internal/corporateImport.ts` - row parser and validator logic

### Acceptance Criteria

1. Single create works with required fields and normalized values.
2. Batch import supports partial success with row-level errors.
3. Import outputs stable typed error codes for downstream UI rendering.
4. Imported rows map to configured `pricing_tier` and preserve tier in stored records.
5. Created leads from corporate path persist `source_channel=CORPORATE`.
6. Invalid rows do not block valid rows from persisting in the same batch.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed corporate intake modules.

### Out of Scope

- SLA cron execution

---

## T03: Implement SLA Lifecycle Transitions and Notification Hooks

### Objective

Enforce response-SLA stage progression (`NORMAL`, `WARNING`, `BREACHED`, `ESCALATED`) with automatic notifications at 36h/48h/72h thresholds.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/27-notification-infrastructure.md`
- `convex/crons.ts`
- `convex/notifications.ts`

### Key Rules

1. SLA stage transitions must be monotonic and idempotent.
2. Stage boundaries are fixed: 36h warning, 48h breached, 72h escalated.
3. Every stage change emits notification event and audit log action.
4. `supply_corporate_sla_hours` default is 48h and must be config-driven for breach threshold checks.
5. Three consecutive SLA misses must move partnership status to `PAUSED`.

### Deliverables

- [ ] `convex/corporatePartnerships.ts` - SLA evaluation helpers and stage transition mutation
- [ ] `convex/crons.ts` - hourly SLA stage checker registration
- [ ] `convex/notifications.ts` - stage-based notifications

### Acceptance Criteria

1. SLA stages auto-advance based on elapsed hours since intake/last required action.
2. Notifications trigger exactly once per stage change.
3. Stages are queryable for dashboard and queue filtering.
4. Partnership status auto-transitions to `PAUSED` after 3 consecutive SLA misses.
5. Pause transitions are auditable and include miss-streak metadata.
6. Re-activation from `PAUSED` requires explicit admin action after remediation.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/corporatePartnerships.ts`, `convex/crons.ts`, and changed notification files.

### Out of Scope

- Broker performance cron

---

## T04: Build Admin Corporate Operations Surfaces and Inquiry-Linking Controls

### Objective

Ship admin tools to triage corporate requests, manage SLA stages, and link relocation records to tenant inquiries for downstream conversion tracking.

### Required Reading

- `notes/features/33-supply-channel-diversification.md`
- `src/app/(admin)/admin/tenant-inquiries/page.tsx`
- `src/components/admin/dashboard/DashboardAlertsAndActions.tsx`
- `src/components/ui/dialog.tsx`

### Key Rules

1. Admin access requires `supply.corporate.manage`.
2. Queue must expose partnership lifecycle status, pricing tier, and SLA stage.
3. Linking to `tenant_inquiries` must validate inquiry ownership/state compatibility.
4. UI must show itemized import errors for batch jobs.

### Deliverables

- [ ] `src/app/(admin)/admin/supply/corporate/page.tsx` - corporate queue and account panels
- [ ] `src/components/admin/supply/corporate-relocation-table.tsx` - corporate table with SLA and pricing indicators
- [ ] `src/components/admin/supply/corporate-batch-import-dialog.tsx` - CSV import + error rendering
- [ ] `src/components/admin/supply/corporate-link-inquiry-dialog.tsx` - relocation-to-inquiry linking flow

### Acceptance Criteria

1. Admin can process corporate partnership records through legal transitions to `ACTIVE`.
2. SLA badges reflect backend stage in real time.
3. Batch import surfaces row-level failure codes and messages.
4. Pricing tier and exclusivity flags are visible and editable in admin detail views.
5. Inquiry linkage updates persist and are visible in detail panel.
6. Simulated 3 consecutive SLA misses surface `PAUSED` state in UI without page refresh regression.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed corporate admin pages/components.

### Out of Scope

- Secretary/resident admin queues

---

## Epic Verification (Task-Specific)

Run these checks before marking the epic done:

1. Create a corporate partnership and move lifecycle to `ACTIVE`.
2. Submit a corporate-origin lead and verify bulk pricing tier is applied.
3. Simulate 3 consecutive SLA misses and verify partnership moves to `PAUSED`.
4. Confirm `source_channel=CORPORATE` on corporate-origin leads.

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
