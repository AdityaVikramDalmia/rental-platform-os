# BUG-054: Partially signed rental agreements never expire

| Field          | Value                     |
| -------------- | ------------------------- |
| **Severity**   | Medium                    |
| **Status**     | **OPEN**                  |
| **Area**       | Rental agreements / Crons |
| **Found**      | 2026-09-24                |
| **Fixed**      | —                         |
| **Fix Commit** | —                         |

## Description

The e-sign expiry cron never expires an agreement that only one party has signed. Its transaction stays in `AGREEMENT_SENT` instead of returning to `AGREEMENT_PENDING` for regeneration.

## Repro Steps

1. `npx vitest run convex/rentalTransactions.test.ts -t "BUG-054"`

This is an `it.fails` test: it passes while the bug exists and starts failing once it is fixed.

## Expected

A `PARTIALLY_SIGNED` agreement whose `updated_at` is older than `esign_deadline_days` (default 5) is set to `EXPIRED`, and its `AGREEMENT_SENT` transaction returns to `AGREEMENT_PENDING`.

## Actual

The agreement stays `PARTIALLY_SIGNED` and the transaction stays `AGREEMENT_SENT`, until the separate 14-day auto-timeout cancels the whole transaction.

## Root Cause

The spec says that if the signing deadline passes while the transaction is `AGREEMENT_SENT`, the agreement becomes `EXPIRED` and the transaction returns to `AGREEMENT_PENDING` (`notes/features/26-transaction-completion-rails.md:384`). The agreement state machine lists `PARTIALLY_SIGNED → EXPIRED` as a System transition (`notes/04-state-machines.md:1530`; `lib/constants.ts:1180-1184`). A partially signed agreement's transaction is still `AGREEMENT_SENT`, because `recordSignature` advances the transaction only once both parties have signed. But `rentalTransactions.expireStaleAgreements` selects only `status == SENT` agreements (`convex/rentalTransactions.ts:752`).

## Fix

Not fixed yet. Proposed: have `expireStaleAgreements` also select `PARTIALLY_SIGNED` agreements, for example a second `by_status` query merged with the first, and apply the same cutoff, expiry and transaction roll-back to them.
