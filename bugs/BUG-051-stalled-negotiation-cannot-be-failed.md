# BUG-051: A STALLED negotiation cannot be marked FAILED

| Field          | Value                 |
| -------------- | --------------------- |
| **Severity**   | Medium                |
| **Status**     | **OPEN**              |
| **Area**       | Negotiation lifecycle |
| **Found**      | 2026-09-24            |
| **Fixed**      | —                     |
| **Fix Commit** | —                     |

## Description

The negotiation state-machine documentation allows a stalled negotiation to end as failed: `notes/04-state-machines.md:862` lists a `STALLED → FAILED` transition ("Ops marks stalled negotiation as failed"), and `notes/04-state-machines.md:871` says STALLED "can only resume to `ACTIVE` or end in `FAILED`". The transition table in code allows only `STALLED → TERMS_PROPOSED | COUNTER_PROPOSED` (`lib/negotiation.ts:67-70`), so `negotiations.markFailed` rejects it (`convex/negotiations.ts:572`). The code sample in the same doc (`notes/04-state-machines.md:987`) matches the code, not the doc's table. That sample is also out of date elsewhere: it lacks `COUNTER_PROPOSED → TERMS_AGREED`, which the table and the code both have.

STALLED is not a terminal status, so the stalled negotiation keeps blocking the inquiry: `negotiations.initiate` returns it instead of opening a new negotiation. The only way to end it is to write and share a new proposal (which leaves STALLED) and then mark the negotiation failed.

## Repro Steps

1. `npx vitest run convex/negotiations.test.ts -t "fails a STALLED negotiation through the documented STALLED → FAILED transition (BUG-051)"`

This is an `it.fails` test: it passes while the bug exists and starts failing once it is fixed.

## Expected

`markFailed` on a STALLED negotiation sets `status: FAILED`, `failure_reason` and `failed_at`.

## Actual

`markFailed` throws `Invalid negotiation status transition from STALLED to FAILED`.
