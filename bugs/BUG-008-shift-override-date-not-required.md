# BUG-008: One-time override shift date field not required

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | Medium                     |
| **Status**     | **FIXED**                  |
| **Area**       | Shift Management (P03-E03) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

When creating a one-time override shift, the date input field is not marked as required. Submitting the form without selecting a date produces no validation error — the form either submits with an empty date or silently fails without useful feedback.

## Repro Steps

1. Login as admin → Navigate to any guard detail → Shifts tab
2. Click "Add Shift"
3. Select "One-time" shift type
4. Fill in start time, end time, and location type
5. **Leave the date field empty**
6. Click Submit

## Expected

Validation error should appear: "Date is required" or similar. The form should not submit without a date for one-time shifts.

## Actual

No validation error is shown for the empty date field. The form either submits with invalid data or fails silently.

## Root Cause

The Zod schema or react-hook-form validation for the Add Shift form likely doesn't have a conditional required rule for `specific_date` when shift type is `one-time`. The date field needs to be conditionally required based on the shift type selection.

## Fix

Not yet fixed. Add conditional validation: when shift type is "one-time", `specific_date` must be required and non-empty.
