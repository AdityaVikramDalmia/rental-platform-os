# BUG-010: Guard list table missing Created column

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | Medium                     |
| **Status**     | **FIXED**                  |
| **Area**       | Admin Guards (P03-E02-T02) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

The guard list table at `/admin/guards` is missing the `Created` column. The spec (P03-E02-T02) requires columns: Name, Phone, Society, Type, Status, Leads, Verified Rate, Created. The actual table shows all columns except Created.

## Repro Steps

1. Login as admin → Navigate to `/admin/guards`
2. Observe table header columns

## Expected

8 columns: Name, Phone, Society, Type, Status, Leads, Verified Rate, **Created**

## Actual

7 columns: Name, Phone, Society, Type, Status, Leads, Verified Rate — `Created` column is missing.

## Root Cause

The `GuardTable.tsx` component likely omits the `created` column from the table definition.

## Fix

Not yet fixed. Add a `Created` column to `GuardTable.tsx` displaying formatted creation date.
