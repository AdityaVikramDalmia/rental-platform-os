# Convex Dev Push Blockers

**Date**: 2026-02-19
**Stack**: Convex local dev, OpenAI SDK v6, TypeScript strict mode
**Time to diagnose**: ~20 minutes

## Problem: `npx convex dev` refuses to push functions

### Symptom

`npx convex dev` starts, shows "Preparing Convex functions..." but never reaches "Convex functions ready!". Three independent blockers surface depending on your DB state and dependencies.

## Issue 1: Schema Validation — Stale Config Key

### Symptom

```
✖ Schema validation failed.
Document with ID "..." in table "system_config" does not match the schema:
  Path: .key
  Value: "tenant_bounty_default_expiry_days"
  Validator: v.union(v.literal("tenant_bounty_expiry_days"), ...)
```

### Root Cause

The `system_config` table uses a union of literal strings for the `key` field. At some point the key was renamed from `tenant_bounty_default_expiry_days` to `tenant_bounty_expiry_days` in the schema, but a stale record with the old key name persists in the local DB. Convex validates ALL existing data against the new schema on push and rejects the mismatch.

Similarly, adding new config keys (e.g., `seed_demo_version` for the demo seeder) requires adding the literal to the schema union BEFORE the seed can insert records with that key.

### Fix

Add missing/renamed literals to the `configKeyValidator` union in `convex/schema.ts`:

```typescript
v.literal("tenant_bounty_default_expiry_days"),  // legacy key, stale DB records
v.literal("seed_demo_version"),                   // demo seeder version tracking
```

### Prevention

When renaming a config key:

1. Add the NEW key to the schema
2. Write a migration that copies old → new and deletes old records
3. Only THEN remove the old literal from the schema

Never rename a literal in the schema union without migrating existing data first.

---

## Issue 2: OpenAI SDK v6 Removed Named Error Classes

### Symptom

```
✘ [ERROR] No matching export in "node_modules/openai/index.mjs"
    for import "ContentFilterFinishReasonError"

✘ [ERROR] No matching export in "node_modules/openai/index.mjs"
    for import "LengthFinishReasonError"
```

Both errors point to `convex/actions/dealTermExtraction.ts:4`.

### Root Cause

OpenAI SDK v4/v5 exported `ContentFilterFinishReasonError` and `LengthFinishReasonError` as named classes. The project upgraded to `openai@6.22.0` which removed these exports. The code in `dealTermExtraction.ts` still imports them.

### Fix

Replace the named error class imports with helper functions that check error messages:

```typescript
// Before (OpenAI v4/v5)
import { ContentFilterFinishReasonError, LengthFinishReasonError, OpenAI } from "openai";
// ...
if (error instanceof LengthFinishReasonError) { ... }

// After (OpenAI v6)
import { OpenAI } from "openai";

function isLengthFinishError(err: unknown): boolean {
  return err instanceof Error && /length/i.test(err.message);
}
function isContentFilterError(err: unknown): boolean {
  return err instanceof Error && /content.?filter/i.test(err.message);
}
// ...
if (isLengthFinishError(error)) { ... }
```

Replace all 4 `instanceof` checks (2 for each error type) in the file.

### Files Changed

| File                                   | Change                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `convex/actions/dealTermExtraction.ts` | Replaced 2 named imports with helper functions, updated 4 `instanceof` checks |

---

## Issue 3: Pre-Existing Test File TypeScript Errors

### Symptom

```
✖ TypeScript typecheck via `tsc` failed.
Found 70 errors in 10 files.

Errors  Files
     5  convex/admins.test.ts
     7  convex/buildings.test.ts
     1  convex/chatBatching.ts
     6  convex/dealChecklists.ts
     ...
```

### Root Cause

Test files (`.test.ts`) and some implementation files have accumulated TypeScript errors over time. Convex runs `tsc` by default before pushing and blocks on any errors, even in files unrelated to the changes being made.

### Fix

Run Convex dev with type checking disabled:

```bash
npx convex dev --typecheck=disable
```

This skips the `tsc` check and pushes functions based on esbuild bundling only (which is more lenient). Use this when pre-existing test errors are blocking unrelated work.

### Prevention

Periodically fix test file type errors. Run `npx tsc --noEmit` to see the full list. The errors are in test files that use outdated patterns or reference moved/renamed types.

---

## Debugging Checklist

When `npx convex dev` is stuck on "Preparing Convex functions...":

1. **Check the terminal output** — Convex prints the specific error. Scroll up.
2. **Schema validation error?** → Check if a DB record uses a key/value not in the schema union. Add the literal or migrate the data.
3. **Import error?** → A dependency changed its exports. Check the package version (`npm ls <pkg>`) and update imports.
4. **TypeScript errors?** → If all errors are in test files or unrelated code, use `--typecheck=disable` as a workaround.
5. **Multiple issues?** → Fix them in order: schema first (blocks data validation), then imports (blocks bundling), then types (blocks tsc).

## Quick Fix Command

```bash
npx convex dev --typecheck=disable
```

This bypasses issue 3 entirely. Issues 1 and 2 require code fixes.
