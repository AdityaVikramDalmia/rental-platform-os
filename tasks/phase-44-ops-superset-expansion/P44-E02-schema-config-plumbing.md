---
id: P44-E02
title: Schema + Config Plumbing
phase: 44
status: done
depends_on: ["P44-E01"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api"]
updated_at: 2026-02-20
---

# P44-E02: Schema + Config Plumbing

## Overview

Add schema, constants, and seed support for P44 rollout controls and OPS field-worker parity primitives. This epic introduces no endpoint behavior changes; it only prepares foundational data contracts.

## Task Queue

- [x] P44-E02-T01: Add schema validators for P44 enums and system config keys
- [x] P44-E02-T02: Add constants/defaults and config helper parsers
- [x] P44-E02-T03: Seed and migration-safe wiring for default values

---

## T01: Add Schema Validators for P44 Enums and System Config Keys

### Objective

Update Convex schema validators to support OPS field-worker authorship, guard-type parity defaults, and rollout config keys.

### Required Reading

- `convex/schema.ts`
- `notes/10-convex-schema.md`
- `notes/features/35-ops-superset-expansion.md` (Sections 5 and 6)
- `lib/constants.ts`

### Key Rules

1. Extend existing unions; do not create parallel duplicated fields.
2. Keep existing data backward compatible and migration-safe.
3. Add OPS author type where notes/audit payloads depend on actor type unions.
4. Ensure system config key union includes all new P44 keys.

### Deliverables

- [x] `convex/schema.ts` - add `OPS` to `leads.notes_thread.author_type`, add `SOCIETY_GUARD` guard type literal, add P44 config keys
- [x] `notes/10-convex-schema.md` - sync schema docs with exact new literals/keys
- [x] `notes/13-constants-reference.md` - add reference entries for new enum literals and config keys

### Acceptance Criteria

1. Schema compiles with new enum literals and no type regressions.
2. `notes_thread.author_type` accepts `OPS` values.
3. P44 config keys are included in system config validator unions.
4. Existing records remain valid without mandatory data rewrites.
5. `npx tsc --noEmit` passes and `lsp_diagnostics` is clean on changed files.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `notes/10-convex-schema.md`, and `notes/13-constants-reference.md`.

### Out of Scope

- Auth helper logic
- Runtime endpoint migration
- Backfill execution

---

## T02: Add Constants, Defaults, and Config Helper Parsers

### Objective

Wire constants and parsing helpers for P44 rollout controls, including canary user-id arrays and boolean flags.

### Required Reading

- `lib/constants.ts`
- `convex/systemConfig.helpers.ts`
- `convex/seed.ts`
- `notes/features/35-ops-superset-expansion.md`

### Key Rules

1. Config parsing must fail loudly on malformed values (no silent coercion).
2. Boolean keys must parse only strict values (`"true"`, `"false"`).
3. Canary list parser must validate JSON array shape and value types.
4. Expose helper APIs reusable by `requireFieldWorker`.

### Deliverables

- [x] `lib/constants.ts` - add P44 config key constants and defaults
- [x] `convex/systemConfig.helpers.ts` - add `getSystemConfigBoolean` and `getSystemConfigStringArray` helpers
- [x] `convex/systemConfig.helpers.test.ts` - tests for strict parser behavior

### Acceptance Criteria

1. New helper functions parse valid values and reject invalid values with clear errors.
2. Canary parser rejects non-array JSON and non-string entries.
3. Default handling is explicit for missing keys.
4. No existing config helper behavior regresses.
5. Tests and type-check pass (`npx tsc --noEmit`, relevant test suite).

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed helper and constants files.

### Out of Scope

- Enforcing feature gates in endpoint handlers
- Backfill and provisioning logic

---

## T03: Seed and Migration-Safe Wiring for Default Values

### Objective

Seed P44 config defaults and ensure rollout can start in disabled mode without blocking existing flows.

### Required Reading

- `convex/seed.ts`
- `convex/schema.ts`
- `lib/constants.ts`
- `notes/features/35-ops-superset-expansion.md` (Section 5 and "Production Rollout Runbook" under Section 13)

### Key Rules

1. Default mode must be safe (`ops_field_worker_enabled=false`, empty canary list).
2. Seed must stay idempotent; reruns cannot duplicate config rows.
3. `default_unassigned_society_id` must be seeded only when a valid society id is available.
4. Existing environments must remain bootable even before P44 rollout.

### Deliverables

- [x] `convex/seed.ts` - seed P44 config defaults and idempotent update paths
- [x] `convex/seed.test.ts` - tests for idempotent config creation/update
- [x] `verification/p44-ops-superset-expansion.md` - update setup checklist for required config keys

### Acceptance Criteria

1. Fresh seed inserts P44 config keys with safe defaults.
2. Re-running seed does not create duplicate key rows.
3. Missing default-unassigned society path is handled deterministically with explicit warning/error behavior.
4. Existing guard flows are unchanged with feature disabled.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/seed.ts`, tests, and verification doc updates.

### Out of Scope

- Auth helper implementation
- Endpoint migration
- Admin and frontend UX changes
