# BUG-042: Recomputing a payout adjustment drops the streak bonus it had already credited

| Field          | Value      |
| -------------- | ---------- |
| **Severity**   | Low        |
| **Status**     | **OPEN**   |
| **Area**       | Incentives |
| **Found**      | 2026-09-24 |
| **Fixed**      | —          |
| **Fix Commit** | —          |

## Description

`incentives.computePayoutAdjustment` is written to be re-run for a payout: it soft-deletes every earlier adjustment for that payout and inserts a replacement (`convex/incentives.ts:2135-2161`). The streak bonus, however, is only granted if no live adjustment for the guard already carries that bonus within the streak window (`convex/incentives.ts:1923-1927`), and that lookup (`convex/incentives.ts:1900-1904`) includes the payout's own current adjustment, the one about to be replaced. On a recompute the bonus is therefore judged "already credited", the replacement gets `streak_bonus_paise: 0`, and the adjustment that did carry it is then deleted, so the guard is paid the bonus zero times.

Example: a guard with a 3-day streak gets a ₹200 (20,000 paise) streak bonus on the first computation; recomputing the same payout with identical inputs returns 0.

Today's callers (`convex/payouts.ts:176`, `convex/closures.ts:383`) run the computation once, right after inserting a new payout, so this is only reachable by re-invoking the internal mutation. That is why the severity is Low.

## Repro Steps

Test (marked `it.fails` while the bug exists; change it to `it` to see the assertion fail):
`convex/incentivePayoutAdjustment.test.ts` → "keeps the streak bonus when recomputing the payout that already received it (BUG-042)"

```bash
npx vitest run convex/incentivePayoutAdjustment.test.ts -t "keeps the streak bonus when recomputing the payout that already received it \(BUG-042\)"
```

## Expected

Recomputing with unchanged inputs gives the same `streak_bonus_paise` (20,000).

## Actual

The recomputed adjustment has `streak_bonus_paise: 0`.

## Root Cause

The already-credited check at `convex/incentives.ts:1923-1927` does not exclude adjustments belonging to the payout being recomputed.
