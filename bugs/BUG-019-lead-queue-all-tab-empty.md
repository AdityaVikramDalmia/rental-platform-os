# BUG-019: Lead queue "All" tab shows empty state instead of aggregate view

| Field          | Value            |
| -------------- | ---------------- |
| **Severity**   | Medium           |
| **Status**     | **FIXED**        |
| **Area**       | Admin Lead Queue |
| **Found**      | 2026-02-17       |
| **Fixed**      | —                |
| **Fix Commit** | —                |

## Description

The "All" tab on the admin lead queue shows "No submitted leads" empty state and zero rows, even when leads exist in other status tabs (Verified, Rejected, etc.). The All tab should display an aggregate view of all leads regardless of status.

## Repro Steps

1. Login as admin → navigate to `/admin/leads`
2. Verify leads exist under individual status tabs (e.g. Submitted, Verified, Rejected)
3. Click the "All" tab

## Expected

All leads across all statuses are displayed in a single combined list.

## Actual

"No submitted leads" message shown with zero rows, despite leads existing in other status tabs.

## Root Cause

The "All" tab likely passes a status filter (e.g. `status=SUBMITTED`) or the query backing the All tab incorrectly filters by a default status instead of omitting the status filter entirely.

## Fix

Check the lead queue query — when no status filter is active (All tab), the query should not filter by status. The empty-state message should also be generic ("No leads found") rather than status-specific ("No submitted leads").
