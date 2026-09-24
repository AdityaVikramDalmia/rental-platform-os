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

`updateDetails` stores an `sla_deadline` that is already in the past, which `createRegulatoryItem` refuses. No spec requires update-time validation; filed for consistency with createRegulatoryItem.

## Repro Steps

1. Test: `societyLiaison > updateDetails > rejects a past sla_deadline the way createRegulatoryItem does (BUG-030)` (marked `it.fails`, so it passes while the bug exists).
2. Run `npx vitest run convex/societyLiaison.test.ts -t "BUG-030"` (expect `1 passed | 11 skipped`).

## Expected

`updateDetails` with `sla_deadline < Date.now()` throws "SLA deadline cannot be in the past", matching `createRegulatoryItem`.

## Actual

The mutation succeeds and stores the past deadline.

## Root Cause

No spec requires update-time validation; filed for consistency with createRegulatoryItem. `createRegulatoryItem` rejects a caller-supplied past deadline (`convex/societyLiaison.ts:141-142`, "SLA deadline cannot be in the past"). `updateDetails` (`convex/societyLiaison.ts:208`) copies `args.sla_deadline` into the patch with no check (`convex/societyLiaison.ts:237`). The create-time rule can therefore be bypassed by creating an item and then editing its deadline. A backdated deadline makes the next `auditSlaBreaches` run move the item to OVERDUE.

## Fix

Proposed: in `updateDetails`, when `args.sla_deadline` is provided and `args.sla_deadline < Date.now()`, throw "SLA deadline cannot be in the past", mirroring `convex/societyLiaison.ts:141-142`. Then flip the test from `it.fails` to `it`.
