# BUG-007: Recurring shift day selection fails with type mismatch

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | High                       |
| **Status**     | **FIXED**                  |
| **Area**       | Shift Management (P03-E03) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

When creating a recurring shift, selecting any day other than the default (Monday) triggers a Zod validation error: `Invalid input: expected string, received number`. This blocks creation of recurring shifts on any day except Monday.

## Repro Steps

1. Login as admin → Navigate to `/admin/guards` → Open any guard detail
2. Click "Shifts" tab → Click "Add Shift"
3. Select "Recurring" shift type (default)
4. Day dropdown defaults to Monday — leave start/end time and location as valid values
5. **Change the day dropdown from Monday to any other day (e.g., Wednesday, Friday)**
6. Click Submit

## Expected

Shift should be created for the selected day. No validation errors.

## Actual

Validation error appears: `Invalid input: expected string, received number`. The shift is NOT created. The dialog stays open with the error.

## Root Cause

Likely the day-of-week `<select>` dropdown is passing a numeric value (the option index or a numeric enum) while the Zod schema expects a string value (e.g., `"monday"`, `"tuesday"`). The default Monday option works because it's the first/default value and may be handled differently during form initialization.

Check the `AddShiftDialog` component — the `day_of_week` field value type coming from the dropdown vs what the Zod validator expects.

## Fix

Not yet fixed. Likely needs the select dropdown's `onChange` to coerce the value to string, or the Zod schema to accept the numeric type being passed.
