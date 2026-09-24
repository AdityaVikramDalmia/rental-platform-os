# BUG-032: A merged-away owner's phone resolves to a new duplicate owner

| Field          | Value                     |
| -------------- | ------------------------- |
| **Severity**   | Medium                    |
| **Status**     | **OPEN**                  |
| **Area**       | Owner Identity Resolution |
| **Found**      | 2026-09-24                |
| **Fixed**      | —                         |
| **Fix Commit** | —                         |

## Description

After two owners are merged, a new lead or service request carrying the source owner's phone creates a fresh PROSPECT owner instead of linking to the merge target. This re-creates the duplicate identity the merge removed.

## Repro Steps

1. Test: `owners lifecycle > getOrCreateByPhone > resolves a merged-away owner's phone to the merge target instead of creating a duplicate (BUG-032)` (marked `it.fails`, so it passes while the bug exists).
2. Run `npx vitest run convex/owners.lifecycle.test.ts -t "BUG-032"` (expect `1 passed | 11 skipped`).

## Expected

`getOrCreateByPhone` with the merged source's phone returns the merge target's id (identity rule "If owner exists, link lead to existing owner", `notes/features/21-owner-entity-and-rm.md:99`).

## Actual

It inserts and returns a new owner id with `lifecycle_stage = PROSPECT`.

## Root Cause

`owners.merge` soft-deletes the source, setting `merged_into_id = target` and `is_deleted = true` (`convex/owners.ts:1903-1907`, as specified in `notes/features/21-owner-entity-and-rm.md:115`). `getOrCreateByPhoneInternal` is written to follow merges by passing its phone match through `resolveMergeTargetOwner` (`convex/owners.ts:303`, which walks `merged_into_id`). However, the phone lookup first filters on `is_deleted == false` (`convex/owners.ts:384-391`). A merged source is always deleted, so it is never matched, the merge walk never runs for it, and a new owner is inserted. The helper has three callers: `convex/leads.ts:455`, `convex/leads.ts:590` and `convex/verifications.ts:101`.

## Fix

Proposed: in `getOrCreateByPhoneInternal`, query `owners.by_phone` without the `is_deleted` filter. Prefer a row that is neither deleted nor merged. Otherwise take a row with `merged_into_id` set and resolve it through `resolveMergeTargetOwner`, which already returns null for a deleted or cyclic chain. Create a new owner only when neither exists. Then flip the test from `it.fails` to `it`.
