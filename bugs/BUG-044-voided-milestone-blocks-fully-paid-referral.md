# BUG-044: A voided milestone keeps its referral from ever becoming FULLY_PAID

| Field          | Value      |
| -------------- | ---------- |
| **Severity**   | Medium     |
| **Status**     | **OPEN**   |
| **Area**       | Referrals  |
| **Found**      | 2026-09-24 |
| **Fixed**      | —          |
| **Fix Commit** | —          |

## Description

`referralMilestones.updateReferralStatusFromMilestones` marks a referral FULLY_PAID only when every milestone row is PAID: `allPaid = paidCount === milestones.length` (`convex/referralMilestones.ts:280-283`). VOIDED milestones count in `milestones.length` even though they can never be paid (VOIDED is terminal, `lib/referral.ts:39`). A referral with one voided milestone and every other milestone paid therefore stays PARTIALLY_PAID for good.

`voidMilestone` re-runs this status derivation right after voiding (`convex/referralMilestones.ts:243-245`). With voided rows counted as unpaid, voiding can never move a referral forward, so that call only makes sense if voided milestones were meant to be left out of the all-paid check.

Example: a tenant-finding referral has SIGN_UP (₹200), LISTING_PUBLISHED (₹300) and DEAL_CLOSED (₹700). The deal falls through, so DEAL_CLOSED is voided; SIGN_UP and LISTING_PUBLISHED are approved and paid. Every payable milestone is paid, but the referral stays PARTIALLY_PAID.

## Repro Steps

Test (marked `it.fails` while the bug exists; change it to `it` to see the assertion fail):
`convex/referralMilestones.test.ts` → "marks the referral FULLY_PAID once every milestone that was not voided is paid (BUG-044)"

```bash
npx vitest run convex/referralMilestones.test.ts -t "marks the referral FULLY_PAID once every milestone that was not voided is paid \(BUG-044\)"
```

## Expected

Referral status is `FULLY_PAID`.

## Actual

Referral status is `PARTIALLY_PAID`.

## Root Cause

`convex/referralMilestones.ts:280-283` compares the paid count with all milestones instead of the non-voided ones.
