# BUG-013: Admin lead queue table missing Owner column

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | Medium                     |
| **Status**     | **FIXED**                  |
| **Area**       | Admin Lead Queue (P04-E03) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

The admin lead queue table at `/admin/leads` is missing the Owner name column. The table shows Society, Building, Phone, Guard, Time, Status, and Flags — but not the owner's name, which is important for quick identification.

## Repro Steps

1. Login as admin → Navigate to `/admin/leads`
2. Observe table columns

## Expected

Table columns include Owner name for quick identification without opening the detail panel.

## Actual

Owner column is absent from the table. Owner info is only visible in the lead detail side panel.

## Root Cause

The lead queue table component doesn't include an owner name column in its column definition.

## Fix

Not yet fixed. Add Owner name column to the admin lead queue table.
