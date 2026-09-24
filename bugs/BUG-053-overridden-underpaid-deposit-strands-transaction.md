# BUG-053: Confirming an underpaid deposit with an admin override leaves the transaction stuck in DEPOSIT_PENDING

| Field          | Value                          |
| -------------- | ------------------------------ |
| **Severity**   | High                           |
| **Status**     | **OPEN**                       |
| **Area**       | Rental transactions / Deposits |
| **Found**      | 2026-09-24                     |
| **Fixed**      | —                              |
| **Fix Commit** | —                              |

## Description

The spec says a deposit that does not match the agreement terms needs an explicit admin override reason (`notes/features/26-transaction-completion-rails.md:387`). `depositRecords.confirmByOwner` implements that: when the amount doesn't match, it requires an ADMIN with `override_reason` / `override_by` (`convex/depositRecords.ts:272-292`) and marks the record `CONFIRMED`. It then advances the transaction only when `outstanding <= 0` (`convex/depositRecords.ts:300-310`). An override on an **underpaid** deposit therefore confirms the record but leaves the transaction in `DEPOSIT_PENDING`, and every way forward is blocked:

- `rentalTransactions.advanceStatus → DEPOSIT_RECEIVED` rejects: `Deposit amount insufficient for transition` (`convex/rentalTransactions.ts:346-347`).
- `depositRecords.markPaid` rejects the confirmed record: `Cannot mark paid for deposit in status: CONFIRMED` (`convex/depositRecords.ts:160`).
- `depositRecords.updateStatus` cannot move it out of CONFIRMED, which is terminal: `Invalid deposit transition: CONFIRMED -> DISPUTED`.
- `rentalTransactions.createMoveInChecklist` refuses: `Cannot create checklist: transaction is DEPOSIT_PENDING`.

The only exit left is cancelling the transaction. The agreement is SIGNED (terminal), so a regenerated agreement with the agreed lower deposit cannot replace it either.

Example: the agreement says ₹80,000 (8,000,000 paise). The tenant pays ₹60,000 and the owner accepts that as the full deposit. The admin confirms with an override, and the deal can no longer reach move-in.

## Repro Steps

1. `npx vitest run convex/depositRecords.test.ts -t "moves the transaction to DEPOSIT_RECEIVED after an admin-overridden underpaid confirmation (BUG-053)"`

This is an `it.fails` test: it passes while the bug exists and starts failing once it is fixed.

## Expected

An admin-overridden confirmation lets the transaction reach `DEPOSIT_RECEIVED`, either automatically or through a documented override path.

## Actual

The deposit record is `CONFIRMED`, the transaction stays `DEPOSIT_PENDING`, and each follow-up path above fails with the error quoted next to it.
