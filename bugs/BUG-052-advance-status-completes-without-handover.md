# BUG-052: advanceStatus can mark a transaction COMPLETED without the handover checklist

| Field          | Value                         |
| -------------- | ----------------------------- |
| **Severity**   | High                          |
| **Status**     | **OPEN**                      |
| **Area**       | Rental transactions / Move-in |
| **Found**      | 2026-09-24                    |
| **Fixed**      | —                             |
| **Fix Commit** | —                             |

## Description

The `rentalTransactions.advanceStatus` override moves a `MOVE_IN_SCHEDULED` transaction to `COMPLETED` with no handover checklist at all. That skips the gate `complete()` enforces, and lets a closure (and its payout) be confirmed without a recorded handover.

## Repro Steps

1. `npx vitest run convex/rentalTransactions.test.ts -t "BUG-052"`

This is an `it.fails` test: it passes while the bug exists and starts failing once it is fixed.

## Expected

`advanceStatus` with `target_status: COMPLETED` is refused unless a completed handover checklist exists for the transaction, the same gate `complete()` applies.

## Actual

The call succeeds and the transaction becomes `COMPLETED` with no `handover_checklists` record.

## Root Cause

The transaction rails spec requires a completed transaction-linked handover checklist before move-in completion (`notes/features/26-transaction-completion-rails.md:389`, `:403`, `:423`). `rentalTransactions.complete()` enforces it (`convex/rentalTransactions.ts:683-718`, error at `:703`).

`advanceStatus` (`convex/rentalTransactions.ts:482`) still runs `assertAdvanceStatusPrerequisites` (`:271`), which gates `AGREEMENT_SIGNED`, `TOKEN_RECEIVED`, `DEPOSIT_RECEIVED` and `KYC_VERIFIED` (lines 276, 296, 315, 351). It has no case for `COMPLETED`. The closure's `transaction_id` back-link is written only in `complete()`, so this path also leaves the closure unlinked. `closures.confirm` checks only that the linked transaction is COMPLETED (`convex/closures.ts:886`).

## Fix

Not fixed yet. Proposed: add a `COMPLETED` case to `assertAdvanceStatusPrerequisites` that requires a non-deleted `handover_checklists` row for the transaction with `completed_at` set and every item checked, the same check `complete()` makes. Alternatively, have `advanceStatus` refuse `COMPLETED` and point callers to `complete()`, as it already does for `CANCELLED`.
