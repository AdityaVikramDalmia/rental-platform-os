---
id: P45-E05
title: Feature Flag + Schema Cleanup
phase: 45
status: done
depends_on: ["P45-E04"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P45-E05: Feature Flag + Schema Cleanup

## Overview

Add the `multi_persona_enabled` config key that gates the persona picker and switcher UI. Document the production rollout runbook with canary testing steps. Document the Phase 5 schema cleanup tasks (making `user_types` and `active_persona` non-optional, removing `user_type`, removing backward-compat fallbacks) as a deferred cleanup that executes only after `multi_persona_enabled=true` is stable in production. This epic follows the same feature-flag pattern established by P44's `fieldWorkerRollout.ts` and `ops_field_worker_enabled` config key.

## Prerequisites

- **Read first**: [P45-E04 Completion Summary](P45-E04-layout-callback-integration.md#completion-summary) — confirms all layout files, callback redirect, and index migration are complete.
- All 5 portal layouts render `<PersonaSwitcher>` (E04-T01 done).
- Callback redirect uses `active_persona` routing (E04-T02 done).
- `by_active_persona` index is in use (E04-T03 done).

## Task Queue

- [x] P45-E05-T01: Add `multi_persona_enabled` config key and gate picker/switcher rendering
- [x] P45-E05-T02: Create production rollout runbook (documented in this epic file)
- [x] P45-E05-T03: Document Phase 5 schema cleanup as a deferred task

---

## T01: Add `multi_persona_enabled` Config Key and Gate Picker/Switcher Rendering

### Objective

Add the `multi_persona_enabled` boolean config key to `system_config`, seed its default as `false`, and gate the persona picker redirect and switcher rendering behind this flag. When `false`, the system behaves exactly as before P45 (single-persona routing, no picker, no switcher). When `true`, the full multi-persona UX is active.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 8 Phase 4 (Feature Flag Rollout), Section 12 (P44 relationship — `fieldWorkerRollout.ts` pattern reference)
- `convex/fieldWorkerContracts.ts` — P44 config key pattern (`P44_CONFIG_KEYS`, `ops_field_worker_enabled`)
- `convex/seed.ts` — how config keys are seeded with defaults
- `notes/13-constants-reference.md` — config key naming conventions

### Key Rules

1. Config key name: `multi_persona_enabled`. Type: boolean. Default: `false`.
2. When `multi_persona_enabled = false` (from Section 8 Phase 4):
   - Persona picker is hidden — multi-persona users are routed directly to `PORTAL_ROOT[active_persona]` without seeing the picker.
   - `PersonaSwitcher` is hidden — the component returns null regardless of `user_types.length`.
   - `consumeInvite` still uses `addPersonaToUser` (the bug fix is permanent regardless of flag) — but the UX to switch personas is not exposed.
3. When `multi_persona_enabled = true`:
   - Full multi-persona UX active — picker shown for multi-persona users, switcher visible in all portal headers.
4. Follow the P44 pattern from `convex/fieldWorkerContracts.ts`: define a `P45_CONFIG_KEYS` constant with the key name, add to `lib/constants.ts`, seed the default in `convex/seed.ts`.
5. The flag is read server-side in `resolvePostAuthDestination` (for picker redirect) and client-side in layout files (for switcher visibility). Use `useQuery(api.config.get, { key: "multi_persona_enabled" })` in client components.
6. Gate the `<PersonaSwitcher>` in each layout: `{multiPersonaEnabled && <PersonaSwitcher ... />}`.

### Deliverables

- [ ] `lib/constants.ts` — `P45_CONFIG_KEYS` constant with `multi_persona_enabled` key name
- [ ] `convex/seed.ts` — `multi_persona_enabled: false` seeded as a system config default
- [ ] `src/app/callback/redirect.ts` — picker redirect gated on `multi_persona_enabled` config value
- [ ] All 5 portal layout client files — `<PersonaSwitcher>` wrapped in `{multiPersonaEnabled && ...}` check

### Acceptance Criteria

1. With `multi_persona_enabled = false`: a TENANT+OWNER user is routed directly to `PORTAL_ROOT[active_persona]` after login, no picker shown.
2. With `multi_persona_enabled = false`: `<PersonaSwitcher>` is not rendered in any portal layout.
3. With `multi_persona_enabled = true`: a TENANT+OWNER user is redirected to `/post-auth/select-persona`.
4. With `multi_persona_enabled = true`: `<PersonaSwitcher>` renders in portal headers for multi-persona users.
5. `npx tsc --noEmit` passes.
6. `lsp_diagnostics` is clean on all changed files.
7. `npm run build` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
npx convex run seed:init  # Confirm multi_persona_enabled is seeded as false
```

Run `lsp_diagnostics` on `lib/constants.ts`, `convex/seed.ts`, `src/app/callback/redirect.ts`, and all 5 layout client files.

### Out of Scope

- Schema cleanup (T03)
- Removing backward-compat fallbacks (T03)

---

## T02: Production Rollout Runbook

### Objective

Document the production rollout plan for `multi_persona_enabled` as a runbook within this epic file. This is a documentation task — no code changes. The runbook covers canary testing, validation steps, and rollback procedure.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 8 Phase 4 (Feature Flag Rollout), Section 12 (P44 relationship — `fieldWorkerRollout.ts` rollout pattern)
- `tasks/phase-44-ops-superset-expansion/P44-E09-rollout-monitoring-rollback.md` — P44 rollout runbook as reference

### Key Rules

1. The runbook must be written directly in this epic file (below this task section) — not in a separate file.
2. Canary testing plan: enable `multi_persona_enabled = true` for 2-3 test accounts first (use the dev test accounts from `AGENTS.md`). Validate before enabling globally.
3. Validation checklist must cover: persona picker renders correctly, switcher renders in all 5 portals, `setActivePersona` mutation works, `localStorage["preferred_persona"]` is set and read correctly, single-persona users are NOT shown the picker.
4. Rollback: set `multi_persona_enabled = false` via Convex dashboard. No data operations needed — the flag is purely a UX gate. The `addPersonaToUser` fix in `ownerInvites.ts` is permanent and does NOT roll back.
5. The runbook must note that the destructive overwrite fix (E02-T03) is NOT gated by the feature flag — it is always active regardless of `multi_persona_enabled`.

### Deliverables

- [ ] Production rollout runbook documented in this epic file (see "Rollout Runbook" section below)

### Acceptance Criteria

1. Runbook covers: canary enable steps, validation checklist, global enable steps, rollback procedure.
2. Runbook explicitly notes that the `ownerInvites.ts` bug fix is permanent (not rolled back with the flag).
3. Runbook references the specific test accounts from `AGENTS.md` for canary testing.

### Verification

Review the runbook section below for completeness. No code verification needed.

### Out of Scope

- Executing the rollout (that's an ops task, not a code task)
- Schema cleanup (T03)

---

## T03: Document Phase 5 Schema Cleanup as a Deferred Task

### Objective

Document the Phase 5 schema cleanup steps as a deferred task within this epic file. These steps execute ONLY after `multi_persona_enabled=true` has been stable in production for a sufficient period. No code changes in this task — documentation only.

### Required Reading

- `notes/features/36-multi-persona-identity.md` — Section 8 Phase 5 (Schema Cleanup) for the exact cleanup steps

### Key Rules

1. The cleanup steps from Section 8 Phase 5 (document all four):
   - Make `user_types` and `active_persona` non-optional in schema (remove `v.optional(...)` wrapper).
   - Remove `user_type` field from schema entirely.
   - Remove backward-compat fallback from `hasPersona()` in `auth.helpers.ts` (the `return user.user_type === type` branch).
   - Remove `multi_persona_enabled` feature flag and all gating code.
2. Also document the index cleanup:
   - Remove `by_user_type` and `by_type_and_status` indexes from schema (they are no longer used after E04-T03).
3. Document the prerequisite: all users must have non-null `user_types` (backfill must be complete and verified) before making the fields non-optional.
4. Document the grep commands to find any remaining `user_type` (singular) references before executing cleanup:
   ```bash
   grep -rn "user\.user_type" convex/ src/ lib/
   grep -rn "by_user_type" convex/
   grep -rn "by_type_and_status" convex/
   ```
5. This task is documentation only — write the cleanup steps in the "Phase 5 Cleanup Checklist" section below.

### Deliverables

- [ ] Phase 5 cleanup checklist documented in this epic file (see "Phase 5 Cleanup Checklist" section below)

### Acceptance Criteria

1. Cleanup checklist covers all 4 steps from Section 8 Phase 5.
2. Checklist includes the index cleanup steps.
3. Checklist includes the prerequisite verification (all users backfilled).
4. Checklist includes grep commands to find remaining `user_type` references.

### Verification

Review the cleanup checklist section below for completeness. No code verification needed.

### Out of Scope

- Executing the cleanup (deferred until production validation)
- Any code changes in this task

---

## Rollout Runbook

> Written as part of T02. Execute this runbook after all P45 epics are complete and deployed.

### Prerequisites Before Enabling

1. All P45 epics (E01-E05) are deployed to production.
2. `migrations.backfillUserPersonas` has been run in production — verify `created > 0, errors == 0`.
3. Run backfill a second time to confirm idempotency — `created == 0, skipped == N`.
4. Confirm `multi_persona_enabled` is `false` in production `system_config`.

### Step 1: Canary Enable (2-3 Test Accounts)

Enable `multi_persona_enabled = true` in the dev environment only. Use these test accounts from `AGENTS.md`:

- `tenant1@test.demorentals.com` (Test Tenant) — manually add OWNER persona via `users.addPersona` mutation to create a multi-persona test case.
- `owner1@test.demorentals.com` (Test Owner) — manually add TENANT persona.
- `admin@example.com` (Admin) — manually add TENANT persona.

### Step 2: Canary Validation Checklist

- [ ] Log in as `tenant1@test.demorentals.com` — persona picker appears at `/post-auth/select-persona`.
- [ ] Select TENANT persona — redirected to `/tenant/dashboard`.
- [ ] `PersonaSwitcher` visible in tenant portal header.
- [ ] Switch to OWNER persona via switcher — redirected to `/owner/dashboard`.
- [ ] `localStorage["preferred_persona"]` is set to `"OWNER"`.
- [ ] Log out and log back in — auto-redirected to `/owner/dashboard` without seeing picker (remembered preference).
- [ ] Log in as `owner1@test.demorentals.com` (single-persona OWNER) — NO picker shown, routed directly to `/owner/dashboard`.
- [ ] `PersonaSwitcher` NOT visible for single-persona user.
- [ ] Log in as `admin@example.com` (ADMIN+TENANT) — picker appears.
- [ ] Select ADMIN — routed to `/admin/dashboard`. Switcher visible.
- [ ] Switch to TENANT — routed to `/tenant/dashboard`.
- [ ] Verify no data bleed: ADMIN portal shows admin data, TENANT portal shows tenant data.

### Step 3: Global Enable

After canary validation passes:

1. Set `multi_persona_enabled = true` in production `system_config` via Convex dashboard.
2. Monitor error rates for 30 minutes — check Convex function error logs.
3. Spot-check 3 real users with multiple personas (if any exist in production).

### Rollback Procedure

If issues are found after enabling:

1. Set `multi_persona_enabled = false` in production `system_config` via Convex dashboard.
2. All users are immediately routed via `active_persona` directly — no picker, no switcher.
3. **The `ownerInvites.ts` bug fix is NOT rolled back** — `addPersonaToUser` remains active. This is intentional: the additive model is always correct, only the UX is gated.
4. No data operations needed — the flag flip is instant and reversible.

---

## Phase 5 Cleanup Checklist

> Written as part of T03. Execute ONLY after `multi_persona_enabled=true` has been stable in production for at least 2 weeks.

### Prerequisites

- [ ] `multi_persona_enabled = true` in production for at least 2 weeks with no incidents.
- [ ] All users have non-null `user_types` — verify: `migrations.backfillUserPersonas` returns `created == 0, skipped == N` (all already migrated).
- [ ] No remaining `user_type` (singular) references in active code paths:
  ```bash
  grep -rn "user\.user_type[^s]" convex/ src/ lib/
  grep -rn "by_user_type" convex/
  grep -rn "by_type_and_status" convex/
  ```

### Cleanup Steps (Execute in Order)

1. **Make `user_types` and `active_persona` non-optional in `convex/schema.ts`**:
   - Change `user_types: v.optional(v.array(userTypeValidator))` → `user_types: v.array(userTypeValidator)`
   - Change `active_persona: v.optional(userTypeValidator)` → `active_persona: userTypeValidator`

2. **Remove `user_type` field from `convex/schema.ts`**:
   - Remove the `user_type: userTypeValidator` line from the `users` table definition.
   - Remove `by_user_type` and `by_type_and_status` index definitions.

3. **Remove backward-compat fallback from `hasPersona()` in `convex/auth.helpers.ts`**:
   - Before: `if (user.user_types) return user.user_types.includes(type); return user.user_type === type;`
   - After: `return user.user_types.includes(type);`

4. **Remove `multi_persona_enabled` feature flag**:
   - Remove from `lib/constants.ts` (`P45_CONFIG_KEYS`).
   - Remove from `convex/seed.ts`.
   - Remove all `multiPersonaEnabled &&` guards from layout files and callback redirect.
   - Remove from `system_config` table in production via a cleanup migration.

5. **Run `npx tsc --noEmit` and `npm run build`** — confirm clean.

6. **Deploy and monitor** for 30 minutes.

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**
