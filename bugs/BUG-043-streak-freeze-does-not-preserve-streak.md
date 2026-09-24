# BUG-043: A spent streak freeze does not keep the streak alive when the user returns

| Field          | Value        |
| -------------- | ------------ |
| **Severity**   | Medium       |
| **Status**     | **OPEN**     |
| **Area**       | Gamification |
| **Found**      | 2026-09-24   |
| **Fixed**      | —            |
| **Fix Commit** | —            |

## Description

When the nightly `gamification.checkDailyStreaks` cron (18:34 UTC = 00:04 IST) finds a profile whose last active IST day was before yesterday, it spends a streak freeze and keeps `streak_days` (`convex/gamification.ts:689-697`), but it never moves `last_streak_date` forward. When the user is active again, `recordDailyStreakActivity` continues the streak only if `last_streak_date` equals yesterday (`convex/gamification.ts:224-225`); it still holds the day before the missed day, so the streak restarts at 1. The freeze is used up and the streak is lost anyway, so a freeze can never do what it is for.

Example: a guard on a 5-day streak last active 2026-03-08 misses 2026-03-09. The 00:04 IST run on 2026-03-10 spends their freeze (1 → 0) and keeps `streak_days = 5`. At 10:00 IST the same day they earn XP, and `streak_days` becomes 1 instead of 6.

## Repro Steps

Test (marked `it.fails` while the bug exists; change it to `it` to see the assertion fail):
`convex/gamification.test.ts` → "continues a freeze-covered streak when the guard is active the next day (BUG-043)"

```bash
npx vitest run convex/gamification.test.ts -t "continues a freeze-covered streak when the guard is active the next day \(BUG-043\)"
```

## Expected

After the freeze covers 2026-03-09, activity on 2026-03-10 continues the streak: `streak_days` = 6.

## Actual

`streak_days` = 1, and the freeze has still been spent (`streak_freezes_remaining` 1 → 0).

## Root Cause

The freeze branch at `convex/gamification.ts:689-697` does not advance `last_streak_date` to the frozen day, which the continuation check at `convex/gamification.ts:225` depends on.
