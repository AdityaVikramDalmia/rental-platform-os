---
id: P11-E01
title: Quality Metrics & Controls Backend
phase: 11
status: done
depends_on: ["P01-E02", "P03-E01", "P04-E01", "P05-E01", "P07-E01", "P01-E08", "P09-E01", "P10-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-18
---

# P11-E01: Quality Metrics & Controls Backend

## Overview

Implement the quality metrics and controls backend: create quality metric query helpers for computing all 10 guard performance metrics with time window support (all-time, 30-day, 7-day), implement quality score computation using config-driven weights, implement the guard leaderboard query with society filtering, migrate rate limiting from P04's hardcoded value to system_config-based with IST midnight reset, add high-rejection quality flag handling (`GUARD_HIGH_REJECTION`) at lead submission time (stored on the lead record), and implement browser fingerprint tracking on guard login with mismatch detection. `GUARD_HIGH_REJECTION` already exists in the current `leadQualityFlagValidator` and should be used directly (no schema literal addition required). All metrics are computed in real-time via Convex queries (NOT cached snapshots). "Insufficient data" returned for guards with <5 submissions. Current fingerprint schema shape is `{ fingerprint, ip, last_seen, flagged }`; P11-E01-T05 migrates it to add `first_seen`, add optional `device_label`, and make `ip` optional. This epic extends existing `convex/guards.ts` and modifies `convex/leads.ts` - no new tables created.

## Prerequisites

- **Read first**: [P03-E01 Completion Summary](../phase-03-guard-management/P03-E01-guard-account-backend.md#completion-summary) — guard profiles exist with status transitions. Ban/deactivate mutations exist. `guard_profiles.browser_fingerprints` field is in the schema.
- **Read first**: [P04-E01 Completion Summary](../phase-04-lead-pipeline/P04-E01-lead-submission-backend.md#completion-summary) — leads exist with hardcoded rate limit. Has TODO for P11 migration to system_config. `leads.by_submitted_by_guard_id` and `leads.by_guard_and_status` indexes exist.
- **Read first**: [P01-E08 Completion Summary](../phase-01-auth/P01-E08-seed-and-config.md#completion-summary) — system config CRUD exists. `max_leads_per_guard_per_day` already seeded with default value of 5.
- **Read first**: [P09-E01 Completion Summary](../phase-09-payouts/P09-E01-payout-backend.md#completion-summary) — once P09 implementation lands, `payouts.getGuardEarnings` should be migrated to `requireGuardAuth`.
- **Read first**: [P10-E01 Completion Summary](../phase-10-incentive-system/P10-E01-incentive-backend.md#completion-summary) — once P10 implementation lands, `incentives.getMyCards` should be migrated to `requireGuardAuth`.
- Leads from P04, verification from P05, visits from P07 all exist. `visits.by_guard_and_status` index exists.

## Task Queue

- [x] P11-E01-T01: Quality Metrics Module + Time-Windowed Query
- [x] P11-E01-T02: Guard Leaderboard Query
- [x] P11-E01-T03: Configurable Rate Limits + IST Midnight Reset
- [x] P11-E01-T04: Quality Flags on Lead Queue
- [x] P11-E01-T05: Browser Fingerprint Tracking

**All tasks complete.**

---

## T01: Quality Metrics Module + Time-Windowed Query

### Objective

Create quality metric helpers and the `guards.getMetrics` query that computes all 10 performance metrics for a guard with optional time window filtering.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Quality Metrics" section, "Time Windows" section, "Convex Functions" section, Business Rule #7
- `notes/10-convex-schema.md` — leads table indexes (`by_guard_and_status`, `by_submitted_by_guard_id`), visits table indexes (`by_guard_and_status`)
- `notes/13-constants-reference.md` — Lead Status enum, Visit Status enum
- `notes/11-convex-architecture.md` — `mutation` and `query` import from `./functions`, `requirePermission` patterns, `requireGuard` pattern

### Key Rules

1. Add to `convex/guards.ts` (or create `convex/quality.ts` if `guards.ts` is already large — check file size first before deciding).
2. Import `query` from `./_generated/server` and `mutation`/`internalMutation` from `./functions` (audit-enabled path) — same pattern as `convex/closures.ts` and `convex/payouts.ts`.
3. Implement `guards.getMetrics({ guard_user_id: v.id("users"), time_window: v.optional(v.union(v.literal("all_time"), v.literal("last_30_days"), v.literal("last_7_days"))) })`.
4. Compute ALL 10 metrics from the feature spec:
   - `total_submitted`: COUNT leads WHERE `submitted_by_guard_id` = guard
   - `verified_count`: COUNT leads WHERE `submitted_by_guard_id` = guard AND status = `"VERIFIED"`
   - `rejected_count`: COUNT leads WHERE `submitted_by_guard_id` = guard AND status = `"REJECTED"`
   - `duplicate_count`: COUNT leads WHERE `submitted_by_guard_id` = guard AND status = `"DUPLICATE"`
   - `verified_rate`: `verified_count / total_submitted × 100` (null if total_submitted < 5)
   - `rejection_rate`: `rejected_count / total_submitted × 100` (null if total_submitted < 5)
   - `duplicate_rate`: `duplicate_count / total_submitted × 100` (null if total_submitted < 5)
   - `completed_visits`: COUNT visits WHERE `assigned_guard_id` = guard AND status = `"COMPLETED"`
   - `no_show_count`: COUNT visits WHERE `assigned_guard_id` = guard AND status = `"NO_SHOW"`
   - `visit_completion_rate`: `completed_visits / (completed + no_show + cancelled) × 100` (null if denominator < 5)
5. Time window filtering: filter by `_creationTime >= cutoffTimestamp`. All-time = no filter. Last 30 days = `Date.now() - 30 * 24 * 60 * 60 * 1000`. Last 7 days = `Date.now() - 7 * 24 * 60 * 60 * 1000`.
6. "Insufficient data" handling: if `total_submitted < 5`, return all rate fields as `null` (not 0, not computed). Frontend displays "Insufficient data" instead of percentages. This is Business Rule #7.
7. Use indexes for efficient querying: `leads.by_guard_and_status` for status-filtered counts, `visits.by_guard_and_status` for visit counts.
8. RBAC: `requirePermission(ctx, "quality.view")` for the admin-facing query. ⚠️ `quality.view` does not exist in current `lib/constants.ts`; P11 must add it to `PERMISSIONS` and seed it to admin roles before using it in RBAC gates.
9. **Optional enhancement**: A guard-facing version `guards.getMyMetrics()` may be added using `requireGuardAuth(ctx)` — see rule 10 for auth helper split. Guard can see own metrics only, no args accepted. This is NOT required by the feature spec but useful for future guard profile display.
10. **Auth helper split (CRITICAL for INACTIVE guard support)**: Current `requireGuard(ctx)` enforces `status === "ACTIVE"`, which blocks INACTIVE guards from all queries. The feature spec requires INACTIVE guards to login and view history. Create `requireGuardAuth(ctx)` in `convex/auth.helpers.ts` that checks `user_type === "GUARD"` but does NOT enforce ACTIVE status (BANNED is already blocked by `requireAuth`). Use `requireGuardAuth` for read-only guard queries (e.g., `getRemainingLeads`, `getMyMetrics`). Keep `requireGuard` for write mutations (e.g., `leads.create`, visit actions) that require ACTIVE status. **⚠️ Cross-phase migration**: After creating `requireGuardAuth`, update these read-only guard queries once they exist from P09/P10 implementation: `payouts.getGuardEarnings` and `incentives.getMyCards`.
11. **Quality score computation (required)**: compute and persist `guard_profiles.quality_score` using `system_config.quality_score_weights`. Default weights if config is missing: lead_approval_rate 40%, visit_completion_rate 30%, flag_frequency 20%, speed_bonus 10%. Recompute on each lead status change and visit completion. Use `system_config.min_quality_score_for_incentives` when evaluating incentive eligibility. ⚠️ These config keys do not exist in current `SYSTEM_CONFIG_KEYS`; P11 must add them in `lib/constants.ts` and seed defaults in `convex/seed.ts`.
12. Extract shared computation logic into a `computeMetrics(ctx, guard_user_id, cutoffTimestamp?)` helper used by both admin and guard queries to avoid duplication.
13. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/guards.ts` (or `convex/quality.ts`) — `guards.getMetrics` query with time window support, all 10 metrics, "insufficient data" handling
- [ ] `convex/guards.ts` (or `convex/quality.ts`) — (Optional) `guards.getMyMetrics` guard-facing query (no args, own metrics only, `requireGuardAuth`)
- [ ] `convex/auth.helpers.ts` — Add `requireGuardAuth(ctx)` helper: checks `user_type === "GUARD"` without enforcing ACTIVE status (BANNED blocked by `requireAuth`). For read-only guard queries.
- [ ] `convex/guards.ts` (or `convex/quality.ts`) — Quality score persistence using `quality_score_weights` and `min_quality_score_for_incentives`
- [ ] Helper: `computeMetrics(ctx, guard_user_id, cutoffTimestamp?)` — shared computation logic used by both admin and guard queries

### Acceptance Criteria

1. `guards.getMetrics` returns all 10 metrics with correct formulas.
2. Time window filtering works for `all_time`, `last_30_days`, and `last_7_days`.
3. Returns `null` for all rate fields when `total_submitted < 5`.
4. Uses proper indexes for querying (no full table scans).
5. Admin query gated by `quality.view` permission.
6. Guard query (if implemented) uses `requireGuardAuth` (NOT `requireGuard` — INACTIVE guards must be able to read). Accepts no args, returns own metrics only.
   6a. `requireGuardAuth` helper added to `convex/auth.helpers.ts` — required by T03 (`getRemainingLeads`) and E03 (guard-facing queries for INACTIVE guards).
7. `guard_profiles.quality_score` is computed with config-driven weights and persisted.
8. Incentive threshold check uses `min_quality_score_for_incentives`.
9. Division by zero handled: 0 total submissions returns null rates (insufficient data threshold applies).
10. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual check: validate metric computation logic against the formula table in the feature spec. Run `lsp_diagnostics` on all changed files.

### Out of Scope

- Leaderboard (T02), rate limits (T03), quality flags (T04), fingerprints (T05).

---

## T02: Guard Leaderboard Query

### Objective

Implement the guard leaderboard query that ranks guards by a selected metric with optional society filtering.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Convex Functions" section: `guards.getLeaderboard` spec, Business Rule #7
- `notes/13-constants-reference.md` — Quality permissions (`quality.view`)
- `notes/10-convex-schema.md` — `guard_profiles` table, society assignment field

### Key Rules

1. Implement `guards.getLeaderboard({ society_id: v.optional(v.id("societies")), metric: v.union(v.literal("verified_rate"), v.literal("total_submitted"), v.literal("completed_visits"), v.literal("visit_completion_rate")), limit: v.number() })`.
2. Returns an array of `{ guard_user_id, guard_name, metric_value, rank }` sorted by `metric_value` descending.
3. If `society_id` is provided, filter guards by their society assignment in `guard_profiles`.
4. Exclude guards with `total_submitted < 5` from rate-based leaderboards (`verified_rate`, `visit_completion_rate`) — prevents misleading 100% rates from a single submission.
5. For count-based metrics (`total_submitted`, `completed_visits`), include all guards regardless of submission count.
6. `limit` parameter caps results (e.g., top 10, top 20). Validate it is a positive integer.
7. RBAC: `requirePermission(ctx, "quality.view")`.
8. Reuse the `computeMetrics` helper from T01 to compute each guard's metric value.
9. Fetch all relevant guards first, compute metrics for each, sort in memory, then apply limit. This is acceptable for V1 guard counts (not thousands of guards per society).

### Deliverables

- [ ] `convex/guards.ts` (or `convex/quality.ts`) — `guards.getLeaderboard` query with society filter, metric sort, limit, and minimum submission threshold for rate-based metrics

### Acceptance Criteria

1. Returns ranked guards sorted by selected metric descending.
2. Society filter correctly restricts to guards assigned to that society.
3. Guards with `total_submitted < 5` excluded from `verified_rate` and `visit_completion_rate` leaderboards.
4. Guards with `total_submitted < 5` included in `total_submitted` and `completed_visits` leaderboards.
5. `limit` parameter caps the result array length.
6. RBAC gated by `quality.view`.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on changed files.

### Out of Scope

- Admin leaderboard UI (P11-E02), analytics dashboards (P12).

---

## T03: Configurable Rate Limits + IST Midnight Reset

### Objective

Migrate the hardcoded lead submission rate limit from P04 to a system_config-based configurable value, implement IST midnight reset logic, and create a guard-facing remaining leads query.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Rate Limiting" section (full), "Guard UX" subsection, "Rate Limit Window" callout, Edge Cases section
- `notes/13-constants-reference.md` — System Config Keys: `max_leads_per_guard_per_day` (default 5)
- P04-E01 Completion Summary — find the hardcoded rate limit in `convex/leads.ts` and the TODO comment for P11 migration

### Key Rules

1. Modify `convex/leads.ts` — replace the hardcoded rate limit value (likely `5`) with a read from the `system_config` table using key `max_leads_per_guard_per_day`.
2. Read config value: query `system_config` by key, `JSON.parse` the value string, fallback to `5` if the key is not found.
3. IST midnight reset: implement `getStartOfDayIST()` helper that returns the Unix ms timestamp of midnight IST today. IST = UTC+5:30. Compute as: start of UTC day minus 5.5 hours offset, adjusted so the result is the most recent midnight IST that has already passed.
4. Count today's leads: query leads WHERE `submitted_by_guard_id` = guard AND `_creationTime >= getStartOfDayIST()`. Use the `leads.by_submitted_by_guard_id` index.
5. If `count >= maxLeadsPerDay`, throw: `"Daily lead limit reached"`.
6. Place `getStartOfDayIST()` in `lib/dates.ts` if it is a pure date utility, or as a local helper in `convex/leads.ts` if it needs to stay server-side. Prefer `lib/dates.ts` for reuse.
7. Create `guards.getRemainingLeads()` query using `requireGuardAuth(ctx)` (NOT `requireGuard` — INACTIVE guards should see the counter even though they can't submit). Returns `{ submitted_today: number, limit: number, remaining: number }`. Guard sees "3 of 5 leads today" in the UI.
8. Edge case: if rate limit is changed mid-day via config, it takes effect immediately. Existing leads already submitted that day are not affected.
9. Migration approach (explicit):
   - Read `max_leads_per_guard_per_day` from `system_config` (default: 5 if not set).
   - `guard:lead_submission` in `convex/rateLimiter.ts` is the CURRENT daily limiter (24h fixed window, rate 5) used by `leads.create`; migrate/replace this path so the effective daily cap matches config and no hidden 5/day cap remains.
   - If burst protection is desired, define a SEPARATE short-window limiter key (e.g., per-minute). Do NOT keep the current 24h/5 key alongside a new config-driven daily check.
10. The IST calendar-day limit is the AUTHORITATIVE daily cap for guard-facing messaging.
11. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/leads.ts` — Replace hardcoded rate limit with `system_config` read + IST midnight reset logic
- [ ] `lib/dates.ts` (or helper in `convex/leads.ts`) — `getStartOfDayIST()` helper function
- [ ] `convex/guards.ts` (or `convex/quality.ts`) — `guards.getRemainingLeads()` query (guard-facing, `requireGuardAuth`, no args)

### Acceptance Criteria

1. Rate limit reads from `system_config` key `max_leads_per_guard_per_day` instead of a hardcoded value.
2. Fallback to `5` if the config key is not found.
3. IST midnight reset works correctly — all guards reset at the same time (midnight IST).
4. `guards.getRemainingLeads` returns correct `submitted_today`, `limit`, and `remaining` values.
5. Mid-day config change takes effect immediately for subsequent submissions.
6. Existing `guard:lead_submission` 24h/5 limiter in `convex/rateLimiter.ts` is migrated/replaced so the effective daily cap matches `system_config.max_leads_per_guard_per_day`; any optional burst protection uses a separate short-window key.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/leads.ts`, `lib/dates.ts`, and the guards file.

### Out of Scope

- Guard UI for remaining count (P11-E03-T02), admin rate limit config UI (P11-E02-T04).

---

## T04: Quality Flags on Lead Queue

### Objective

Implement high-rejection quality flag computation using `GUARD_HIGH_REJECTION` and integrate it into lead queue visibility for admins.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Where Metrics Are Displayed" point 3: Lead Queue flag, Business Rule #7
- `notes/13-constants-reference.md` — Quality Flags section and `leadQualityFlagValidator` literals
- P04-E01 Completion Summary — find the existing admin lead list/queue query in `convex/leads.ts`

### Key Rules

1. High-rejection signal triggers when the submitting guard's `rejection_rate > 50%` AND `total_submitted >= 5` at the time of lead submission.
2. The signal is computed at submit time in `leads.create` and stored on the lead record in `quality_flags` using `GUARD_HIGH_REJECTION`.
3. Modify `convex/leads.ts` -> `leads.create` mutation to compute the submitting guard's rejection rate before inserting the lead. If `rejection_rate > 50%` AND `total_submitted >= 5`, add `"GUARD_HIGH_REJECTION"` to the lead's `quality_flags` array alongside existing de-dup flags.
4. Current `leadQualityFlagValidator` in `convex/schema.ts` already includes: `DUPLICATE_FLAT_MATCH`, `DUPLICATE_PHONE_MATCH`, `GUARD_HIGH_REJECTION`, `OFF_SHIFT_SUBMISSION` (all uppercase).
5. De-dup flag mapping must use valid literals only: same-flat de-dup maps to `DUPLICATE_FLAT_MATCH`; same-phone de-dup maps to `DUPLICATE_PHONE_MATCH`.
6. `OFF_SHIFT_SUBMISSION` remains a V2 implementation item (requires GPS capture) even though the literal already exists in schema.
7. The flag captures the guard's rate at submission time. Existing leads are NOT retroactively updated when rates change later.
8. Implement helper `getGuardQualityFlags(ctx, guard_user_id)` with typed return:
   `Array<"DUPLICATE_FLAT_MATCH" | "DUPLICATE_PHONE_MATCH" | "GUARD_HIGH_REJECTION" | "OFF_SHIFT_SUBMISSION">`.
   Reference the `leadQualityFlagValidator` type from schema for compile-time safety (do NOT use plain `string[]`).
   Reuse `computeMetrics` from T01.
9. The admin lead queue query does NOT need to compute flags — they are stored on the lead record and returned by existing query responses.
10. RBAC: existing lead submission permissions apply (guard submits via `requireGuard`). No new permissions needed for quality flag computation.
11. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/leads.ts` — Modify `leads.create` to compute high-rejection signal and store `GUARD_HIGH_REJECTION` in the lead's `quality_flags` array
- [ ] Helper `getGuardQualityFlags(ctx, guard_user_id)` returning `Array<"DUPLICATE_FLAT_MATCH" | "DUPLICATE_PHONE_MATCH" | "GUARD_HIGH_REJECTION" | "OFF_SHIFT_SUBMISSION">` — computes applicable quality flags for a guard while preserving typed-union safety

### Acceptance Criteria

1. `leads.create` computes high-rejection signal at submit time and stores `GUARD_HIGH_REJECTION` in `quality_flags`.
2. `GUARD_HIGH_REJECTION` appears in `quality_flags` when the submitting guard's `rejection_rate > 50%` AND `total_submitted >= 5` at time of submission.
3. Guards with `total_submitted < 5` do not receive this high-rejection signal.
4. Existing de-dup flags use valid schema literals only (`DUPLICATE_FLAT_MATCH` and/or `DUPLICATE_PHONE_MATCH` as appropriate).
5. Flag reflects guard's rate at submission time (not retroactively updated).
6. `getGuardQualityFlags` return type is compile-time safe and aligned with `leadQualityFlagValidator`.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/leads.ts` and the guards/quality file.

### Out of Scope

- Admin UI for quality badges (P11-E02), analytics (P12).

---

## T05: Browser Fingerprint Tracking

### Objective

Implement browser fingerprint capture on guard login, storage in `guard_profiles.browser_fingerprints` array, and mismatch detection for admin review.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Browser Fingerprint Tracking" section (full), Business Rule #6
- `notes/10-convex-schema.md` — `guard_profiles` table, `browser_fingerprints` field definition
- `notes/02-data-models.md` — Guard Profile entity fields
- `notes/11-convex-architecture.md` — `mutation` import from `./functions`, `requireGuard` pattern

### Key Rules

1. Capture fingerprint data on every guard login. The frontend computes a fingerprint string (combining User-Agent + screen resolution into a single hash/composite) and may pass an optional `device_label` for admin readability as part of the P11 migration.
2. Current schema shape is `{ fingerprint: string, ip: string, last_seen: number, flagged: boolean }`. P11-E01-T05 must migrate this shape to `{ fingerprint: string, first_seen: number, last_seen: number, flagged: boolean, ip?: string, device_label?: string }` before storing new entries.
3. After migration, matching logic is: IF guard has previous fingerprints and the new `fingerprint` string matches an existing entry, update that entry's `last_seen` (preserve original `first_seen`). IF no match exists, append a new entry with `first_seen = last_seen = Date.now()`.
4. "Match" means exact same `fingerprint` composite string.
5. Since current schema already stores `ip`, preserve compatibility with existing records; post-migration, treat `ip` as optional for backward compatibility.
6. Guard login currently uses a server action redirect, so fingerprint capture must NOT rely on a post-success login callback in the login action. Trigger capture from the first authenticated guard page load hook (for example, guard layout `useEffect` on mount after auth is confirmed) or an equivalent post-auth client hook.
7. Create `guards.recordFingerprint` as a regular `mutation` (not `internalMutation`) so the frontend can call it from that post-auth hook. Use `requireGuardAuth(ctx)` (from the new auth helper in T01) — the guard must be authenticated but INACTIVE guards logging in should also have their fingerprint recorded.
8. NO BLOCKING on mismatch. Mismatches are informational for admin review only. Business Rule #6: fingerprint mismatches never block login.
9. Create an admin query `guards.getFingerprintHistory({ guard_user_id: v.id("users") })` — returns the full `browser_fingerprints` array. RBAC: `requirePermission(ctx, "guards.view")`.
10. Import `mutation` from `./functions` (audit-enabled path) for `guards.recordFingerprint`.
11. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/guards.ts` — `guards.recordFingerprint` mutation (capture + store + mismatch detection logic, `requireGuardAuth`)
- [ ] `convex/guards.ts` — `guards.getFingerprintHistory` query (admin-facing, `requirePermission(ctx, "guards.view")`)
- [ ] Guard frontend post-auth hook (for example, in `src/app/(guard)/layout.tsx`) — call `guards.recordFingerprint` on first authenticated mount, passing computed fingerprint composite string (e.g., `${navigator.userAgent}|${screen.width}x${screen.height}`), optional IP, and optional device label

### Acceptance Criteria

1. `guards.recordFingerprint` captures fingerprint composite string and persists records in the migrated schema shape (`first_seen`, `last_seen`, `flagged`, optional `ip`, optional `device_label`).
2. Entries stored in `guard_profiles.browser_fingerprints` via `ctx.db.patch`, with backward-compatible handling for existing pre-migration rows (`{ fingerprint, ip, last_seen, flagged }`).
3. First login appends one entry with `first_seen === last_seen`.
4. Subsequent logins with a matching fingerprint update `last_seen`; non-matching fingerprints append a new entry.
5. Login is never blocked on mismatch — mutation succeeds regardless.
6. `guards.getFingerprintHistory` gated by `guards.view` permission, returns full fingerprint array.
7. `guards.recordFingerprint` uses `mutation` from `./functions` for audit triggers. Uses `requireGuardAuth` (not `requireGuard`) so INACTIVE guards also record fingerprints.
8. Schema migration for fingerprints is complete: current rows are migrated safely and new writes use the migrated shape.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/guards.ts` and the modified login page file.

### Out of Scope

- Admin fingerprint UI (P11-E02), guard-facing fingerprint display (guards don't see this data).

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-18

### What Was Built

- `requireGuardAuth(ctx)` in `convex/auth.helpers.ts` — checks user_type === "GUARD" without enforcing ACTIVE status (BANNED blocked by requireAuth)
- `computeMetrics(ctx, guard_user_id, cutoffTimestamp?)` shared helper in `convex/guards.ts` — computes all 10 quality metrics with time window support
- `guards.getMetrics` query — admin-facing, RBAC gated by `quality.view`, returns 10 metrics + quality_score
- `guards.getMyMetrics` query — guard-facing, uses `requireGuardAuth`, returns own metrics (all_time)
- `guards.getLeaderboard` query — ranked guards by metric with society filtering, excludes <5 submissions from rate metrics
- `guards.getRemainingLeads` query — guard-facing remaining daily lead count using system_config + IST midnight
- `getGuardQualityFlags` helper — computes GUARD_HIGH_REJECTION flag when rejection_rate > 50% and total_submitted >= 5
- `guards.recordFingerprint` mutation — captures browser fingerprint on guard login via `requireGuardAuth`
- `guards.getFingerprintHistory` query — admin-facing fingerprint viewer gated by `guards.view`
- `getStartOfDayIST()` in `lib/dates.ts` — shared IST midnight helper
- `convex/systemConfig.helpers.ts` — shared `getSystemConfigNumber` and `getSystemConfigJson` helpers
- `QUALITY_VIEW` permission added to `lib/constants.ts` + OPS_AGENT_PERMISSIONS
- `quality_score_weights` and `min_quality_score_for_incentives` added to SYSTEM_CONFIG_KEYS/DEFAULTS
- Schema migration: `browser_fingerprints` now uses `{ fingerprint, first_seen, last_seen, flagged, ip?, device_label? }`
- Schema: `quality_score: v.optional(v.number())` added to guard_profiles
- Rate limit migrated: `leads.create` reads from system_config instead of hardcoded 5; rateLimiter.ts `guard:lead_submission` changed to 1-min/3-rate burst protection
- Cross-phase migration: `payouts.getGuardEarnings` and `incentives.getMyCards` migrated to `requireGuardAuth`
- Frontend fingerprint capture in `guard-layout-client.tsx` via sessionStorage guard

### Key File Locations

- `convex/guards.ts` — computeMetrics, getMetrics, getMyMetrics, getLeaderboard, getRemainingLeads, recordFingerprint, getFingerprintHistory, getGuardQualityFlags
- `convex/auth.helpers.ts` — requireGuardAuth (line 51)
- `convex/systemConfig.helpers.ts` — getSystemConfigNumber, getSystemConfigJson, getSystemConfigRawValue
- `convex/leads.ts` — modified leads.create with system_config rate limit + GUARD_HIGH_REJECTION flag
- `lib/dates.ts` — getStartOfDayIST
- `lib/constants.ts` — QUALITY_VIEW, QUALITY_SCORE_WEIGHTS, MIN_QUALITY_SCORE_FOR_INCENTIVES

### Deviations from Spec

- Created `convex/systemConfig.helpers.ts` as a shared helper file (not in spec, but improves reuse)
- Quality score is computed on read in `computeMetrics`, not persisted via trigger on each lead status change — schema field `quality_score` exists but persistence is on-demand

### Gotchas for Next Epic

- `getSubmissionCount` in leads.ts uses `requireGuard` (ACTIVE only) — this is intentional since INACTIVE guards shouldn't access the submit page
- `guard:lead_submission` in rateLimiter.ts is now burst protection (1min/3), not the daily cap — daily cap is IST-based via system_config
- Quality score weights are JSON-encoded in system_config — parse with `getSystemConfigJson`
