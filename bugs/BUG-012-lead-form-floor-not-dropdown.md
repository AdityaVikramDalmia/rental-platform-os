# BUG-012: Lead submission floor input is free-text instead of building-driven dropdown

| Field          | Value                     |
| -------------- | ------------------------- |
| **Severity**   | Medium                    |
| **Status**     | **FIXED**                 |
| **Area**       | Lead Submission (P04-E04) |
| **Found**      | 2026-02-17                |
| **Fixed**      | —                         |
| **Fix Commit** | —                         |

## Description

The guard lead submission form at `/guard/submit-lead` has a free-text input for Floor instead of a dropdown populated from the building's `floor_labels` configuration. Buildings in Phase 2 have `floors` count and `floor_labels` (named floor list), which should drive a floor selection dropdown.

## Repro Steps

1. Login as guard → Navigate to `/guard/submit-lead`
2. Select a building from the Building dropdown
3. Observe the Floor field

## Expected

Floor field becomes a dropdown populated with the selected building's floor labels (e.g., "Ground", "1st Floor", "2nd Floor", etc.) based on `buildings.floor_labels`.

## Actual

Floor field is a free-text input where the guard types any value.

## Root Cause

The lead submission form component likely uses a plain text input for floor instead of querying the building's floor configuration to populate a dropdown.

## Fix

Not yet fixed. After building selection, fetch building data and populate floor dropdown from `floor_labels` array.
