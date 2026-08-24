# BUG-016: Guard shifts page shows 8-day window instead of 7

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | Medium                     |
| **Status**     | **FIXED**                  |
| **Area**       | Guard Portal (P03-E04-T03) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

The guard shift schedule page at `/guard/shifts` renders 8 day cards (Today, Tomorrow, then 6 more weekdays) instead of the specified 7-day window. The spec says "next 7 days starting from today".

## Repro Steps

1. Login as guard → Navigate to `/guard/shifts`
2. Count the day cards/rows displayed

## Expected

7 day entries: Today, Tomorrow, and 5 more days.

## Actual

8 day entries: Today, Tomorrow, and 6 more weekday cards.

## Root Cause

Off-by-one in the date range calculation for `getMySchedule` query, or the component rendering one extra day.

## Fix

Not yet fixed. Check the `from_date`/`to_date` calculation in the shifts page and the `GuardShiftList` component loop.
