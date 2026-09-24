# BUG-030: Regulatory item `updateDetails` accepts an SLA deadline in the past

| Field          | Value           |
| -------------- | --------------- |
| **Severity**   | Low             |
| **Status**     | **OPEN**        |
| **Area**       | Society Liaison |
| **Found**      | 2026-09-24      |
| **Fixed**      | —               |
| **Fix Commit** | —               |

## Description

`createRegulatoryItem` refuses a caller-supplied SLA deadline that is already in the past
(`convex/societyLiaison.ts:141-142`, "SLA deadline cannot be in the past"). `updateDetails`
writes the same `sla_deadline` field with no such check (`convex/societyLiaison.ts:208`,
`:237`), so the invariant enforced on create can be bypassed by creating an item and then
editing its deadline. A backdated deadline makes the next `auditSlaBreaches` run flip the item
to OVERDUE.

## Repro Steps

Test: `societyLiaison > updateDetails > rejects a past sla_deadline the way createRegulatoryItem does (BUG-030)` (marked `it.fails`).

```
npx vitest run convex/societyLiaison.test.ts -t "rejects a past sla_deadline the way createRegulatoryItem does (BUG-030)"
```

## Expected

`updateDetails` with `sla_deadline < Date.now()` throws "SLA deadline cannot be in the past",
matching `createRegulatoryItem`.

## Actual

The mutation succeeds and stores the past deadline.
