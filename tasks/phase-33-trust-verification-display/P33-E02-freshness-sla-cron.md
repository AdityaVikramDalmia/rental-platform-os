---
epic: P33-E02
title: "Freshness SLA & Cron"
phase: 33
status: pending
priority: high
depends_on: ["P33-E01"]
---

# P33-E02: Freshness SLA & Cron

> Phase 33 · Trust & Verification Display · Status: pending

## Task Queue

- [ ] P33-E02-T01 — Define freshness SLA score bands, config, and state transitions
- [ ] P33-E02-T02 — Implement self-scheduling freshness recompute pipeline
- [ ] P33-E02-T03 — Register daily cron and ship admin stale-listing queries

---

### P33-E02-T01: Define freshness SLA score bands, config, and state transitions

**Objective**: Lock freshness thresholds and config contracts so every recompute path produces the same state labels.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:32-140` — freshness SLA intent, business rules, and idempotency expectations.
- `convex/schema.ts:397-441` — system config key validator additions via explicit `v.literal(...)` unions.
- `lib/constants.ts:892-981` — config key/default patterns (`SYSTEM_CONFIG_KEYS`, `SYSTEM_CONFIG_DEFAULTS`).
- `lib/constants.ts:1339-1373` — state-label enum + policy map style (`SLA_STATUS`, `SLA_POLICIES`).
- `convex/analytics.ts:141-155` — canonical IST day-range helper pattern for date boundary handling.

**Key Rules**:

1. Freshness states are trust-specific (`FRESH`, `AGING`, `STALE`), not reused generic SLA labels.
2. Freshness day cutoffs are config-driven: `trust_badge_freshness_threshold_days` (default `30`) defines `FRESH`; `AGING` extends to `2 * config_days`; `STALE` is beyond that.
3. Config keys must use lowercase snake_case (`trust_badge_freshness_threshold_days`) and be added in both validator and defaults.
4. Keep timestamps in Unix milliseconds and derive day deltas from ms math only.
5. State mapping must be deterministic and shared by event-driven and cron-driven recompute paths (`75-100 => FRESH`, `25-74 => AGING`, `0-24 => STALE`).

**Deliverables**:

- [ ] `lib/constants.ts` — trust freshness state constants, labels, and config keys/defaults.
- [ ] `convex/schema.ts` — add trust freshness config keys to `systemConfigKeyValidator`.
- [ ] `convex/trustBadges.ts` (or equivalent) — shared helpers for score-to-state conversion.

**Acceptance Criteria**:

- [ ] A single helper maps score to freshness state exactly once and is reused by all recompute entrypoints.
- [ ] Config keys compile in schema validator and constants defaults.
- [ ] Freshness state transitions are monotonic with score changes (no overlapping ranges).

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
```

**Out of Scope**: Cron registration and admin query surfaces.

---

### P33-E02-T02: Implement self-scheduling freshness recompute pipeline

**Objective**: Build a cursor-driven internal mutation pipeline that recomputes trust freshness safely under Convex mutation execution limits.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:121-149` — event-driven vs daily recompute requirements and edge cases.
- `convex/crons.ts:6-57` — existing scheduled job naming and `internal.*` invocation patterns.
- `convex/listings.ts:1393-1398` — current published-listings query scope baseline.
- `convex/listings.ts:502-543` — pagination/cursor handling pattern for custom filtering.
- `convex/analytics.ts:1819-1892` — internal mutation compute + upsert behavior in production code.

**Key Rules**:

1. Recompute entrypoint must be `internalMutation`, not public mutation/query.
2. Use cursor pagination over published listings with config-driven batch size (`paginate({ numItems: batchSize, cursor })`) and continue with `ctx.scheduler.runAfter(...)` when `!isDone`.
3. Respect Convex mutation time limits by never scanning full listing corpus in one invocation.
4. Preserve idempotency: repeated execution for same listing/date should patch existing trust row, not insert duplicates.
5. Gate continuation with `shouldScheduleNext` to support manual one-shot calls and cron-driven fan-out.
6. Batch writes should skip unchanged rows when possible to reduce audit churn and write pressure.
7. Recompute must read `trust_badge_freshness_threshold_days` (with default fallback) each run so policy updates apply without code changes.
8. Batch size for cron recompute should be read from `system_config` key `trust_badge_recompute_batch_size` (default: `200`). Do not hardcode.
9. Lock contract: Use `system_config` table. Key: `trust_badges_recompute_lock`. Value: JSON string `{"started_at": <unix_ms>, "last_heartbeat_at": <unix_ms>, "cursor": <string|null>}`. Before starting, read lock and stale-check against `last_heartbeat_at` (not `started_at`): if heartbeat is within 10 minutes, skip (run is active); if older than 10 minutes, treat as stale and overwrite.
10. Update `last_heartbeat_at` at the START of each batch iteration (before processing the page) so long-running active jobs are not marked stale.
11. On completion, delete the lock key. Use `ctx.db.query("system_config").withIndex("by_key", (q) => q.eq("key", "trust_badges_recompute_lock")).unique()` to read.
12. Cron/scheduler contexts do not have an admin actor. Lock writes must rely on `system_config.updated_by_admin_id` being optional (set in P33-E01-T01). For cron lock writes, omit `updated_by_admin_id` or set it to `undefined`; do not fabricate user context.

**Deliverables**:

- [ ] `convex/trustBadges.ts` — `internalMutation` recompute function with args `{ cursor?: string, shouldScheduleNext: boolean }`.
- [ ] `convex/trustBadges.ts` — helper that processes one page and returns `{ processedCount, continueCursor, isDone }`.
- [ ] `notes/features/25-trust-verification-display.md` — document cursor-based continuation behavior and operational safeguards.

**Acceptance Criteria**:

- [ ] Pipeline can process more listings than one configured batch (`trust_badge_recompute_batch_size`, default `200`) by chaining scheduled invocations.
- [ ] Re-running the same cursor window does not create duplicate `listing_trust_badges` rows.
- [ ] Function supports both cron mode (`shouldScheduleNext=true`) and manual mode (`shouldScheduleNext=false`).

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
```

**Out of Scope**: Cron registration and frontend stale-listing views.

---

### P33-E02-T03: Register daily cron and ship admin stale-listing queries

**Objective**: Schedule daily freshness recomputation and expose admin query endpoints to triage stale inventory.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:39-52` — required admin freshness surfaces and filter behavior.
- `convex/crons.ts:6-57` — existing `crons.daily(...)`/`crons.interval(...)` registration style.
- `convex/listings.ts:502-563` — paginated admin query contract pattern with permission checks.
- `lib/constants.ts:732-810` — permission constants naming for new trust/admin query permissions.
- `convex/http.ts:44-70` — public listing route contract (ensure no stale-only admin fields leak here).

**Key Rules**:

1. Register freshness cron with explicit daily schedule and `internal.trustBadges.recomputeFreshness` target.
2. Admin stale queries must be permission-gated and paginated (`paginationOptsValidator`) to avoid unbounded table scans.
3. Keep stale triage private to admin/ops surfaces; do not expose stale operational metadata to public APIs beyond trust display fields.
4. Query filters must support at least freshness state and recency buckets using indexed fields where possible.
5. Cron job should enqueue recompute work, not perform full synchronous compute in the cron registration file.
6. First production cron run acts as backfill: for any published listing missing `listing_trust_badges`, the recompute upsert must create the missing row.
7. Implement singleton run guard using `system_config` key `trust_badges_recompute_lock` with JSON payload `{started_at, last_heartbeat_at, cursor}`. Update heartbeat at each batch start and stale-check on `last_heartbeat_at` (10-minute threshold) so active long runs are not interrupted.
8. Ensure lock upsert/delete logic remains valid with `system_config.updated_by_admin_id` optional for cron-authored records.

**Deliverables**:

- [ ] `convex/crons.ts` — add daily trust freshness cron entry.
- [ ] `convex/trustBadges.ts` — add admin-facing stale queue query and stale counts query.
- [ ] `lib/constants.ts` — add trust/admin permissions needed by new queries.
- [ ] `notes/features/25-trust-verification-display.md` — document first-run cron backfill behavior for listings with no trust row.

**Acceptance Criteria**:

- [ ] Daily cron invokes internal freshness recompute with continuation enabled.
- [ ] Admin stale queue query returns paginated results with state, score, and last activity metadata.
- [ ] Stale counts query returns accurate totals by freshness band for dashboard/filters.
- [ ] Concurrent cron invocations do not produce duplicate cursor chains (singleton guard enforced).

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
```

**Out of Scope**: Manual recompute button UX.
