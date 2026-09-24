# BUG-040: Payout-approved notification shows the pre-adjustment amount

| Field          | Value      |
| -------------- | ---------- |
| **Severity**   | Medium     |
| **Status**     | **OPEN**   |
| **Area**       | Payouts    |
| **Found**      | 2026-09-24 |
| **Fixed**      | —          |
| **Fix Commit** | —          |

## Description

`payouts.approve` computes the approved amount as admin override > live adjustment `final_amount_paise` > original `amount_paise` and writes it to the payout (`convex/payouts.ts:363-371`). The `payout_approved` notification queued in the same mutation formats `payout.amount_paise` from the document read _before_ that patch (`convex/payouts.ts:380`). Whenever the quality-tier adjustment or an admin override changes the amount, the guard is told the wrong figure. The later `payout_disbursed` notification reads the approved amount (`convex/payouts.ts:428`), so the guard is shown two different amounts for the same payout.

Example: a GOLD-tier guard (quality score 80, multiplier 1.5) on a ₹1,000 base is approved for ₹1,500, but the approval notification says "Rs 1,000".

## Repro Steps

Test (marked `it.fails` while the bug exists; change it to `it` to see the assertion fail):
`convex/payouts.test.ts` → "tells the guard the approved amount, not the pre-adjustment base (BUG-040)"

```bash
npx vitest run convex/payouts.test.ts -t "tells the guard the approved amount, not the pre-adjustment base \(BUG-040\)"
```

## Expected

The `payout_approved` notification payload `amount_inr` is `"Rs 1,500"`, matching the approved `amount_paise` of 150,000.

## Actual

`amount_inr` is `"Rs 1,000"` (the 100,000-paise base), while the stored payout says 150,000.

## Root Cause

`convex/payouts.ts:380` uses the stale `payout` document instead of `finalAmount` computed at `convex/payouts.ts:363-364`.

## Fix

In `payouts.approve`, format the notification from the amount that was just approved: replace `payout.amount_paise` with `finalAmount` in the `amount_inr` payload (`convex/payouts.ts:380`). Then flip the BUG-040 test from `it.fails` to `it`.
