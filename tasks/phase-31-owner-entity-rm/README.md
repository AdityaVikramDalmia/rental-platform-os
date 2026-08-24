# Phase 31: Owner Entity & RM Foundation (P31)

## Overview

This phase creates the canonical owner identity model and post-closure relationship-management (RM) foundation used by owner-facing and deal-lifecycle features. It is a foundational phase that must execute before Owner Services implementation completes end-to-end.

## Prerequisites

- **P05 (Owner Verification)** must be complete: verified lead outcomes are used for owner lifecycle progression.
- **P09 (Payouts)** must be complete: closure-confirmation and post-deal events are prerequisites for RM auto-assignment.
- **P19-E01** should already include `OWNER` in user type validators/constants. If missing, P31-E01 includes fallback completion.

## What This Phase Delivers

1. Unified `owners` entity with phone-based identity resolution and lifecycle stages.
2. Owner linkage on `leads`, `listings`, and `closures` via `owner_id`.
3. RM assignment domain (`owner_rm_assignments`, `rm_check_ins`) with explicit status machine.
4. Admin owner operations surfaces (`/admin/owners`, owner detail, RM dashboard, reassignment).
5. Operational automation hooks (cron reminders, SLA breach detection, dormancy lifecycle movement).

## Epics

| ID      | Title                                                         | Status | Depends On |
| ------- | ------------------------------------------------------------- | ------ | ---------- |
| P31-E01 | [Owner Entity Foundation](P31-E01-owner-entity-foundation.md) | done   | []         |
| P31-E02 | [RM Assignment Core](P31-E02-rm-assignment-core.md)           | done   | [P31-E01]  |
| P31-E03 | [RM Operations](P31-E03-rm-operations.md)                     | done   | [P31-E02]  |

## Epic Breakdown

- **P31-E01 (Tier 1 - Hard prerequisite)**: Core owner schema, identity resolution, linkage backfills, migration, and admin owner base pages.
- **P31-E02 (Tier 2 - Core RM execution)**: RM assignment/check-in schema, transitions, closure-triggered auto-assignment, and reassignment tooling.
- **P31-E03 (Tier 3 - Operational maturity, can defer/overlap)**: SLA crons, lifecycle automation, performance scoring, escalation automation, minimal owner status page.

## Execution Order

1. **Run P31-E01 first**. This is the hard prerequisite for any owner-lifecycle feature and for P20 coupling.
2. **Run P31-E02 next** to activate RM assignment workflows after closure confirmation.
3. **Run P31-E03 last**. This can overlap with other phases once P31-E02 schema/contracts are stable.

## What This Unblocks

- **P20 Owner Services**: request records and onboarding can bind to canonical owners.
- **P22 Referral System**: owner-side attribution can reference stable `owner_id`.
- **P25 Deal Room Features**: owner invite and checklist flows can use canonical owner identity.
- **P26 Rent Negotiation**: owner participation and signatures can map to one owner entity.
- **Economics/Ops phases (P30+)**: owner-level attribution, retention, and RM outcomes become measurable.

## Completion Criteria

- [x] `owners`, `owner_rm_assignments`, and `rm_check_ins` schema entities are implemented with documented indexes.
- [x] `leads`, `listings`, and `closures` include `owner_id` linkage with migration/backfill.
- [x] Owner lifecycle and RM assignment transitions are validated by centralized transition maps.
- [x] Closure confirmation auto-creates RM assignment from original lead submitter.
- [x] Admin owner and RM operational pages are implemented and wired to backend queries/mutations.
- [x] Cron workflows for check-in SLA and owner dormancy are implemented (or explicitly deferred via P31-E03 status).
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` passes.
