---
id: P37-E02
title: Maintenance Ticketing
phase: 37
status: pending
depends_on: ["P37-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P37-E02: Maintenance Ticketing

## Overview

Implement maintenance operations end-to-end: schema + status model, tenant/backoffice actions, SLA escalation, and admin-facing query surfaces.

## Task Queue

- [ ] P37-E02-T01: Add maintenance ticket schema and enums
- [ ] P37-E02-T02: Implement ticket CRUD lifecycle (create, assign, update status, resolve, close)
- [ ] P37-E02-T03: Implement category/severity routing and escalation handlers
- [ ] P37-E02-T04: Implement admin maintenance dashboard queries

---

## T01: Add Maintenance Ticket Schema and Enums

### Objective

Define `maintenance_tickets` structure for issue category, severity, assignee, and SLA metadata.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Status transitions must be explicit and validated server-side.
2. Severity and category enums must live in `lib/constants.ts` and be documented.
3. Every ticket links to resident, tenant, owner, and listing/property context.
4. Timestamps use Unix ms; no date strings.
5. No direct role bypass: tenant, owner, and backoffice capabilities are permission-scoped.

### Deliverables

- [ ] `convex/schema.ts` - add/extend `maintenance_tickets` schema fields and indexes
- [ ] `lib/constants.ts` - add maintenance category, severity, and status enums
- [ ] `notes/13-constants-reference.md` - document maintenance lifecycle constants

### Acceptance Criteria

1. Schema captures ticket creator, resident context, owner linkage, assignee, category, severity, status, and SLA fields.
2. Status enum supports `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, and `CANCELLED`.
3. Indexes exist for owner queue, resident query, status filtering, and SLA breach sweeps.
4. Severity/category values are consistent between schema and constants.
5. No field violates paise/date/ID conventions.
6. Constants docs are updated to avoid implementation drift.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T02: Implement Ticket CRUD Lifecycle (Create, Assign, Update Status, Resolve, Close)

### Objective

Implement full ticket action surface across tenant and backoffice roles with strict transition and authorization checks.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Creation is tenant-scoped to active resident profiles only.
2. Assign, resolve, and close actions are backoffice-gated.
3. Illegal transitions (for example CLOSED -> IN_PROGRESS) are rejected.
4. Resolution requires resolution notes and resolution timestamp.
5. Every mutation uses wrapped functions (`convex/functions.ts`) to preserve audit trails.

### Deliverables

- [ ] `convex/maintenanceTickets.ts` - implement `create`, `assign`, `updateStatus`, resolve/close handling
- [ ] `convex/functions.ts` - export/route new maintenance mutations and queries
- [ ] `notes/features/29-post-move-in-lifecycle.md` - align function names/status flow if implementation naming diverges

### Acceptance Criteria

1. Tenant can create ticket with category, severity, title, description, and optional photo evidence.
2. Backoffice can assign or reassign tickets with audit-safe mutation calls.
3. Status update mutation enforces legal state transitions only.
4. Resolve action captures resolution details; close action requires resolved state.
5. Unauthorized role attempts are rejected with deterministic errors.
6. Query payloads reflect latest assignee, status, SLA, and timeline metadata.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T03: Implement Category/Severity Routing and Escalation Handlers

### Objective

Implement deterministic assignment routing and escalation handlers that flag SLA-breached ticket states.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Routing priority: owner assignee first, then configured backoffice fallback.
2. SLA threshold must be severity-aware and stored/derived consistently.
3. Escalation handlers must be idempotent and avoid duplicate escalations.
4. Escalation is tracked via `escalated` boolean flag; status remains in normal lifecycle.
5. Escalation handlers emit notification events through P35 API contract.

### Deliverables

- [ ] `convex/maintenanceTickets.ts` - add routing helper logic based on category/severity and ownership
- [ ] `convex/maintenanceTickets.ts` - add internal escalation mutation handler(s) invoked by E01 cron ownership

### Acceptance Criteria

1. New tickets are assigned according to deterministic routing rules.
2. Escalation handler marks tickets `escalated = true` when SLA threshold is breached.
3. Escalation metadata includes breach timestamp and escalation actor/system marker.
4. Re-running handler in same window does not re-escalate already flagged tickets.
5. Escalation path emits notification event with ticket context.
6. Severity-aware queues can be derived without full-table scans.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T04: Implement Admin Maintenance Dashboard Queries

### Objective

Provide admin-facing list and count queries for operations dashboard usage, including filters for status, severity, SLA risk, and assignee.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Query scope for backoffice uses `requireBackoffice`/permission checks.
2. Tenant and owner scoped queries must never leak cross-entity tickets.
3. Filters/pagination must be stable and deterministic.
4. Dashboard counts should be index-backed when possible.
5. Include fields needed by P37-E04 and P38 owner portal consumers.

### Deliverables

- [ ] `convex/maintenanceTickets.ts` - add `listByResident`, `listByProperty`, and `adminList` query contracts
- [ ] `src/components/admin/maintenance/MaintenanceDashboardTable.tsx` - consume and render query payload contract fields for admin maintenance dashboard

### Acceptance Criteria

1. Admin list query supports filter params: status, severity, category, assignee, SLA state.
2. Resident and property-scoped queries return only authorized records.
3. Query responses include pagination cursor/count metadata for dashboard consumption.
4. SLA and escalation indicators are present in list payloads.
5. Data contracts are stable for E04 UI wiring and P38 owner portal consumption.
6. Query performance relies on schema indexes introduced in T01.

### Verification

```bash
npx tsc --noEmit
npm run build
```
