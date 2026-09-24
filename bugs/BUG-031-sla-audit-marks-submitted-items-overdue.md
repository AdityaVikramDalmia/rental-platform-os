# BUG-031: SLA audit cron marks SUBMITTED regulatory items OVERDUE

| Field          | Value           |
| -------------- | --------------- |
| **Severity**   | Medium          |
| **Status**     | **OPEN**        |
| **Area**       | Society Liaison |
| **Found**      | 2026-09-24      |
| **Fixed**      | —               |
| **Fix Commit** | —               |

## Description

`auditSlaBreaches` moves an item that has already been submitted to the authority into OVERDUE once its deadline passes. The documented state machine reserves OVERDUE for items whose deadline passed without submission.

## Repro Steps

1. Test: `societyLiaison > auditSlaBreaches > leaves a SUBMITTED item that is awaiting the authority out of OVERDUE (BUG-031)` (marked `it.fails`, so it passes while the bug exists).
2. Run `npx vitest run convex/societyLiaison.test.ts -t "BUG-031"` (expect `1 passed | 11 skipped`).

## Expected

A SUBMITTED item whose deadline has passed keeps status SUBMITTED after `auditSlaBreaches`.

## Actual

The item's status becomes OVERDUE.

## Root Cause

The spec defines OVERDUE as "Deadline passed without submission" (`notes/04-state-machines.md:1158`) and gives SUBMITTED no OVERDUE edge (`notes/04-state-machines.md:1186`, `SUBMITTED: ["APPROVED", "REJECTED"]`). The code's `ACTIVE_SLA_STATUSES` set includes SUBMITTED (`convex/societyLiaison.ts:55-58`). `auditSlaBreaches` patches every past-deadline item in that set to OVERDUE (`convex/societyLiaison.ts:484-489`). From OVERDUE the only exits are IN_PROGRESS or WAIVED (`convex/societyLiaison.ts:44`). So when the authority later approves, ops must walk the item back through IN_PROGRESS → SUBMITTED before it can be APPROVED.

## Fix

Proposed: remove `REGULATORY_STATUS.SUBMITTED` from `ACTIVE_SLA_STATUSES` (`convex/societyLiaison.ts:55-58`); its only reader is `auditSlaBreaches` at `:484`. The audit then marks only NOT_STARTED and IN_PROGRESS items OVERDUE, as the spec describes. Then flip the test from `it.fails` to `it`.
