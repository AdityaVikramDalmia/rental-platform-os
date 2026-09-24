# BUG-041: Disbursing a payout without a new reference erases the stored payment reference

| Field          | Value      |
| -------------- | ---------- |
| **Severity**   | Medium     |
| **Status**     | **OPEN**   |
| **Area**       | Payouts    |
| **Found**      | 2026-09-24 |
| **Fixed**      | —          |
| **Fix Commit** | —          |

## Description

`payouts.create` accepts an optional `payment_reference` (for example a UTR number) and stores it (`convex/payouts.ts:173`). `payouts.disburse` then patches `payment_reference: normalizeOptionalString(args.payment_reference)` unconditionally (`convex/payouts.ts:414`); when the admin disburses without typing a new reference that value is `undefined`, and a Convex patch with `undefined` removes the field. The same mutation's notification code falls back to the old reference — `normalizeOptionalString(args.payment_reference) ?? payout.payment_reference` (`convex/payouts.ts:419-420`) — so the guard is told reference "UTR-CREATE-7" while the payout record, and the guard's own earnings view (`convex/payouts.ts:531`), no longer hold any reference.

## Repro Steps

Test (marked `it.fails` while the bug exists; change it to `it` to see the assertion fail):
`convex/payouts.test.ts` → "keeps the creation-time payment reference when disbursing without a new one (BUG-041)"

```bash
npx vitest run convex/payouts.test.ts -t "keeps the creation-time payment reference when disbursing without a new one \(BUG-041\)"
```

The companion test "tells the guard the creation-time reference when disbursing without a new one" (passing) shows the notification still carries the old reference.

## Expected

After `create(payment_reference: "UTR-CREATE-7")` → `approve` → `disburse(method: "CASH")`, the payout's `payment_reference` is still `"UTR-CREATE-7"`.

## Actual

`payment_reference` is `undefined`; only the notification payload remembers `"UTR-CREATE-7"`.

## Root Cause

`convex/payouts.ts:414` writes the (possibly undefined) argument instead of the same fallback the notification uses at `convex/payouts.ts:419-420`.

## Fix

In `payouts.disburse`, work out the reference once, as `normalizeOptionalString(args.payment_reference) ?? payout.payment_reference`. Use it both in the patch (`convex/payouts.ts:414`) and in the notification payload (`convex/payouts.ts:419-429`), so the stored record and the guard's message always agree. Then flip the BUG-041 test from `it.fails` to `it`.
