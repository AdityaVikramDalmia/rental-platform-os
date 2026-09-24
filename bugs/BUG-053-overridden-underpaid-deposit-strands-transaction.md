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

When an admin confirms an underpaid deposit with an override, the deposit record becomes `CONFIRMED` but the transaction stays in `DEPOSIT_PENDING`, and every way forward is refused. For example, the agreement says ₹80,000 (8,000,000 paise) and the owner accepts ₹60,000 as the full deposit: once the admin confirms with an override, the deal can no longer reach move-in.

## Repro Steps

1. `npx vitest run convex/depositRecords.test.ts -t "BUG-053"`

This is an `it.fails` test: it passes while the bug exists and starts failing once it is fixed.

## Expected

An admin-overridden confirmation lets the transaction reach `DEPOSIT_RECEIVED`, either automatically or through a documented override path.

## Actual

The deposit record is `CONFIRMED` and the transaction stays `DEPOSIT_PENDING`. Every follow-up path fails:

- `rentalTransactions.advanceStatus → DEPOSIT_RECEIVED`: `Deposit amount insufficient for transition`
- `depositRecords.markPaid`: `Cannot mark paid for deposit in status: CONFIRMED`
- `depositRecords.updateStatus → DISPUTED`: `Invalid deposit transition: CONFIRMED -> DISPUTED`
- `rentalTransactions.createMoveInChecklist`: `Cannot create checklist: transaction is DEPOSIT_PENDING`

The only exit left is cancelling the transaction.

## Root Cause

The spec says a deposit that does not match the agreement terms needs an explicit admin override reason (`notes/features/26-transaction-completion-rails.md:387`). `depositRecords.confirmByOwner` implements that: when the amount doesn't match, it requires an ADMIN with `override_reason` / `override_by` (`convex/depositRecords.ts:272-292`) and marks the record `CONFIRMED`. It then advances the transaction only when `outstanding <= 0` (`convex/depositRecords.ts:300-310`).

Nothing else can move the transaction forward afterwards:

- `advanceStatus`'s prerequisite check compares the deposit amount with the agreement and rejects it (`convex/rentalTransactions.ts:346-347`).
- `markPaid` refuses a CONFIRMED record (`convex/depositRecords.ts:160`).
- CONFIRMED is terminal in `VALID_DEPOSIT_RECORD_TRANSITIONS`.
- The SIGNED agreement is terminal, so a regenerated agreement with the lower deposit cannot replace it.

## Fix

Not fixed yet. Proposed: in `confirmByOwner`, when the admin override path was taken (`overridePatch` set), advance a `DEPOSIT_PENDING` transaction to `DEPOSIT_RECEIVED` whatever the outstanding amount. Also make the `DEPOSIT_RECEIVED` prerequisite in `assertAdvanceStatusPrerequisites` accept a confirmed record that carries `override_reason`.
