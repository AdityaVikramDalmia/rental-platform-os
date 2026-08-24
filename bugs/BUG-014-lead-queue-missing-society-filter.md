# BUG-014: Admin lead queue missing society filter

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | Medium                     |
| **Status**     | **FIXED**                  |
| **Area**       | Admin Lead Queue (P04-E03) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

The admin lead queue at `/admin/leads` has status tabs and a search bar, but no society filter dropdown. The spec requires filtering leads by society for multi-society operations.

## Repro Steps

1. Login as admin → Navigate to `/admin/leads`
2. Look for a society filter control

## Expected

A society filter dropdown (populated from `societies.list`) allowing admin to filter leads by society.

## Actual

No society filter control present. Only status tabs and text search are available.

## Root Cause

The lead queue page component doesn't include a society filter dropdown.

## Fix

Not yet fixed. Add society filter dropdown to the lead queue page, similar to the guard list page's society filter.
