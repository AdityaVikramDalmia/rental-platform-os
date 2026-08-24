# BUG-009: Week navigation buttons lack text labels

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | Low                        |
| **Status**     | **FIXED**                  |
| **Area**       | Shift Management (P03-E03) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

The Previous/Next week navigation buttons on the shift calendar are icon-only (chevron arrows) with no visible text labels. This reduces discoverability and accessibility — screen readers may not announce the button purpose without an `aria-label`.

## Repro Steps

1. Login as admin → Navigate to any guard detail → Shifts tab
2. Observe the week navigation controls above the calendar grid

## Expected

Buttons should have either visible text labels ("Previous Week" / "Next Week") or at minimum `aria-label` attributes for screen reader accessibility.

## Actual

Buttons show only chevron icons with no text labels. Accessibility tree may not convey button purpose.

## Root Cause

The `ShiftCalendar` component uses icon-only buttons for week navigation without adding `aria-label` or `sr-only` text.

## Fix

Not yet fixed. Add `aria-label="Previous week"` and `aria-label="Next week"` to the navigation buttons, or add visually-hidden `<span className="sr-only">` text.
