# BUG-015: Admin lead queue counts and displayed rows go out of sync

| Field          | Value                      |
| -------------- | -------------------------- |
| **Severity**   | High                       |
| **Status**     | **FIXED**                  |
| **Area**       | Admin Lead Queue (P04-E03) |
| **Found**      | 2026-02-17                 |
| **Fixed**      | —                          |
| **Fix Commit** | —                          |

## Description

After performing status transitions on leads (e.g., Request Info, Reject), the lead counter values shown on the status tabs become inconsistent with the actual number of visible rows. The "All" tab may show a count that doesn't match the displayed leads.

## Repro Steps

1. Login as admin → Navigate to `/admin/leads`
2. Note the "All" counter and visible rows
3. Open a lead → perform "Request Info" action → status changes to NEED_INFO
4. Open another lead → "Reject" it
5. Click "All" tab
6. Compare the counter number with actual visible rows

## Expected

Counter on "All" tab matches the total number of visible lead rows. Each status tab's counter reflects the actual count.

## Actual

Counter values do not match visible rows after status transitions. Numbers appear stale or incorrectly aggregated.

## Root Cause

Likely the tab counters are computed from a separate query or client-side state that doesn't update reactively when individual lead statuses change. The Convex subscription for the counts may be a different query than the one rendering the table.

## Fix

Not yet fixed. Ensure tab counters are derived from the same reactive data source as the table, or use a shared Convex query that updates in real-time.
