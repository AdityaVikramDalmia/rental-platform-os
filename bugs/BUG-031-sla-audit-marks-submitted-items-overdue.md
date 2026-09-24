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

The documented regulatory state machine defines OVERDUE as "Deadline passed without
submission" (`notes/04-state-machines.md:1158`) and lists no OVERDUE edge out of SUBMITTED
(`notes/04-state-machines.md:1186`, `SUBMITTED: ["APPROVED", "REJECTED"]`). The code's
`ACTIVE_SLA_STATUSES` set includes SUBMITTED (`convex/societyLiaison.ts:55-58`), so
`auditSlaBreaches` (`convex/societyLiaison.ts:484-489`) moves an item that was already
submitted to the authority into OVERDUE once its deadline passes. From OVERDUE the only exits are
IN_PROGRESS or WAIVED (`convex/societyLiaison.ts:44`), so when the authority later approves,
ops must walk the item back through IN_PROGRESS → SUBMITTED before it can be APPROVED.

## Repro Steps

Test: `societyLiaison > auditSlaBreaches > leaves a SUBMITTED item that is awaiting the authority out of OVERDUE (BUG-031)` (marked `it.fails`).

```
npx vitest run convex/societyLiaison.test.ts -t "leaves a SUBMITTED item that is awaiting the authority out of OVERDUE (BUG-031)"
```

## Expected

A SUBMITTED item whose deadline has passed keeps status SUBMITTED after `auditSlaBreaches`.

## Actual

The item's status becomes OVERDUE.
