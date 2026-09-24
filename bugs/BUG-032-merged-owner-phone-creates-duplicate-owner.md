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

`owners.merge` soft-deletes the source owner (`merged_into_id = target`, `is_deleted = true`;
`convex/owners.ts:1903-1907`, as specified in `notes/features/21-owner-entity-and-rm.md:115`).
`getOrCreateByPhoneInternal` is written to follow merges: it passes the phone match through
`resolveMergeTargetOwner` (`convex/owners.ts:303`, walks `merged_into_id`), but the lookup
first filters `is_deleted == false` (`convex/owners.ts:384-391`). A merged source is always
deleted, so the merge walk never runs for it. The next lead or service request with the source's
phone creates a fresh PROSPECT owner instead of linking to the merge target. That re-creates the
duplicate identity the merge was meant to remove (identity rule:
`notes/features/21-owner-entity-and-rm.md:99`).

## Repro Steps

Test: `owners lifecycle > getOrCreateByPhone > resolves a merged-away owner's phone to the merge target instead of creating a duplicate (BUG-032)` (marked `it.fails`).

```
npx vitest run convex/owners.lifecycle.test.ts -t "resolves a merged-away owner's phone to the merge target instead of creating a duplicate (BUG-032)"
```

## Expected

`getOrCreateByPhone` with the merged source's phone returns the merge target's id.

## Actual

It inserts and returns a new owner id with `lifecycle_stage = PROSPECT`.
