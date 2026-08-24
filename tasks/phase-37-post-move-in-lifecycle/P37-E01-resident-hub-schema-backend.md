---
id: P37-E01
title: Resident Hub Schema & Backend
phase: 37
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P37-E01: Resident Hub Schema & Backend

## Overview

Build the backend foundation for post-move-in operations: resident identity, rent-cycle tracking, query-based receipt contracts, activation hooks, and reminder crons.

## Task Queue

- [ ] P37-E01-T01: Add resident/rent schema, indexes, and constants
- [ ] P37-E01-T02: Implement resident activation contract and owner linkage fallback logic
- [ ] P37-E01-T03: Implement rent records, receipt generation query, and rent reminder SLA cron

---

## T01: Add Resident/Rent Schema, Indexes, and Constants

### Objective

Define `resident_profiles` and `rent_records` schema contracts with P31 owner linkage fields, settlement/negotiation fields, and query-safe indexes.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. All money is paise integers; no float or decimal storage.
2. All timestamps are Unix milliseconds; no string dates.
3. Use canonical owner identity (`owner_id -> owners._id`) and optional `owner_user_id` denormalization.
4. `resident_profiles` must include `move_out_settlement`, `negotiation_log`, and `assigned_backoffice_user_id`.
5. Add all new backend enums/constants to `lib/constants.ts` and mirror in docs.

### Deliverables

- [ ] `convex/schema.ts` - add/extend `resident_profiles` and `rent_records` with validators and indexes
- [ ] `lib/constants.ts` - add resident/rent enums and status-label mappings
- [ ] `notes/13-constants-reference.md` - document new enums and status meanings

### Acceptance Criteria

1. `resident_profiles` contains `owner_id`, optional `owner_user_id`, optional `assigned_backoffice_user_id`, optional `move_out_settlement`, and optional `negotiation_log`.
2. `rent_records` supports monthly cycle tracking with due date, amount, status, and payment evidence metadata.
3. `rent_records` supports receipt-number metadata used by query-based receipt generation.
4. Query indexes exist for tenant scope, owner scope, listing scope, status filtering, and monthly rent retrieval.
5. Constants in `lib/constants.ts` match schema and state-machine labels exactly.
6. No schema field violates global conventions (paise, Unix ms, 10-digit phones, soft-delete rules where applicable).

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T02: Implement Resident Activation Contract and Owner Linkage Fallback Logic

### Objective

Implement resident activation as an internal backend contract using preferred P34 transaction completion signal with legacy P08 closure fallback.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Preferred trigger is `rental_transactions.status = COMPLETED`.
2. Fallback trigger is `closures.status = CONFIRMED` when no transaction link exists.
3. Activation resolves owner linkage from `closures.owner_id -> owners._id`.
4. Activation sets resident status to `ACTIVE` and stamps `activated_at`.
5. Activation is idempotent per closure/listing occupancy period.

### Deliverables

- [ ] `convex/residentProfiles.ts` - add `activate` internal mutation and owner/tenant/listing scoped queries (`getByTenant`, `getByOwner`, `getByListing`)
- [ ] `convex/functions.ts` - export new resident profile functions via wrapped mutation/query helpers
- [ ] `convex/closures.ts` - trigger activation fallback hook at closure confirmation completion point

### Acceptance Criteria

1. Resident activation works from P34 transaction completion when transaction linkage is present.
2. Resident activation falls back to closure confirmation for pre-P34 legacy closures.
3. Activation resolves and stores `owner_id` from canonical owners table.
4. Duplicate activation attempts do not create duplicate active residents for the same closure/listing period.
5. Activation emits `RESIDENT_ACTIVATED` event via notification emitter integration point.
6. Activation can trigger `internal.referrals.checkPostMoveInMilestone` without blocking core activation success.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T03: Implement Rent Records, Receipt Generation Query, and Rent Reminder SLA Cron

### Objective

Ship canonical rent-record lifecycle handling, receipt generation contract query, and reminder/escalation internal crons.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Receipt generation is read-only query contract; PDF rendering is out-of-band (client/action).
2. Receipt generation is derived from canonical rent record payment fields/status (no owner-confirmed status contract).
3. Reminder cadence covers pre-due and overdue windows; events emit through P35 API.
4. Refund/settlement outputs are capped at zero minimum where applicable.
5. Role scoping: tenant only sees own resident/rent records; backoffice can access scoped admin queries.

### Deliverables

- [ ] `convex/rentRecords.ts` - implement `recordPayment`, canonical status transitions, `listByResident`, and `generateReceipt`
- [ ] `convex/crons.ts` - wire rent reminder and overdue checks to `internal.residentProfiles.sendRentReminders` / SLA checks
- [ ] `convex/residentProfiles.ts` - add `checkSLAs` internal mutation for scheduled lifecycle checks

### Acceptance Criteria

1. Rent lifecycle supports canonical transitions (`UPCOMING -> DUE -> PAID`, `DUE -> PARTIALLY_PAID -> PAID`, `DUE -> OVERDUE -> ...`, and waiver paths) without illegal transitions.
2. `rentRecords.generateReceipt` returns deterministic contract fields (`receipt_number`, period label, parties, amount, mode, timestamps).
3. `rentRecords.listByResident` supports time-window filtering and returns only resident-linked rows.
4. Cron/internals emit configured events for due reminders and overdue follow-ups.
5. Reminder/overdue runs are idempotent per resident-cycle and do not spam duplicate events.
6. TypeScript and production build pass with no contract drift.

### Verification

```bash
npx tsc --noEmit
npm run build
```
