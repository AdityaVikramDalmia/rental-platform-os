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

The transaction rails spec requires a completed transaction-linked handover checklist before move-in completion (`notes/features/26-transaction-completion-rails.md:389`, `:403`, `:423`). `rentalTransactions.complete()` enforces it (`convex/rentalTransactions.ts:683-718`, error at `:703`).

`rentalTransactions.advanceStatus` (`convex/rentalTransactions.ts:482`) is the manual override path. It still runs `assertAdvanceStatusPrerequisites` (`convex/rentalTransactions.ts:271`), which gates `AGREEMENT_SIGNED`, `TOKEN_RECEIVED`, `DEPOSIT_RECEIVED` and `KYC_VERIFIED` (lines 276, 296, 315, 351), but has no case for `COMPLETED`. Any holder of `transactions.manage` can therefore move `MOVE_IN_SCHEDULED → COMPLETED` with only an override reason, with no checklist at all. The transaction's closure is also left unlinked, because the `closure.transaction_id` back-link lives only in `complete()`. `closures.confirm` checks only that the linked transaction is COMPLETED (`convex/closures.ts:886`), so this lets a closure, and the payout that follows it, go through without any record of the handover.

## Repro Steps

1. `npx vitest run convex/rentalTransactions.test.ts -t "refuses COMPLETED without a completed handover checklist, as complete() does (BUG-052)"`

This is an `it.fails` test: it passes while the bug exists and starts failing once it is fixed.

## Expected

`advanceStatus` with `target_status: COMPLETED` is refused unless a completed handover checklist exists for the transaction, the same gate `complete()` applies.

## Actual

The call succeeds and the transaction becomes `COMPLETED` with no `handover_checklists` record.
