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

`negotiations.markFailed` rejects a STALLED negotiation, although the documented state machine says a stalled negotiation can end in FAILED. Because STALLED is not a terminal status, the negotiation keeps blocking a new one on the same inquiry.

## Repro Steps

1. `npx vitest run convex/negotiations.test.ts -t "BUG-051"`

This is an `it.fails` test: it passes while the bug exists and starts failing once it is fixed.

## Expected

`markFailed` on a STALLED negotiation sets `status: FAILED`, `failure_reason` and `failed_at`.

## Actual

`markFailed` throws `Invalid negotiation status transition from STALLED to FAILED`.

## Root Cause

The documentation allows the transition: `notes/04-state-machines.md:862` lists `STALLED → FAILED` ("Ops marks stalled negotiation as failed"), and `notes/04-state-machines.md:871` says STALLED "can only resume to `ACTIVE` or end in `FAILED`". The code's transition table allows only `STALLED → TERMS_PROPOSED | COUNTER_PROPOSED` (`lib/negotiation.ts:67-70`), and `markFailed` enforces that table (`convex/negotiations.ts:572`).

The code sample in the same doc (`notes/04-state-machines.md:987`) matches the code rather than the doc's own table. That sample is also out of date elsewhere: it lacks `COUNTER_PROPOSED → TERMS_AGREED`, which the table and the code both have. The only way to end a stalled negotiation today is to write and share a new proposal (which leaves STALLED) and then mark the negotiation failed. Until then, `negotiations.initiate` keeps returning the stalled negotiation for the inquiry.

## Fix

Not fixed yet. Proposed: add `NEGOTIATION_STATUS.FAILED` to the STALLED entry in `VALID_NEGOTIATION_TRANSITIONS` (`lib/negotiation.ts:67-70`) and update the doc's code sample to match. The other option is to decide on the doc side that stalled negotiations must resume before they can fail. In that case, fix `notes/04-state-machines.md:832,862,871` instead, and this test becomes a plain rejection test.
