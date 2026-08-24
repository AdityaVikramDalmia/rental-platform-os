---
epic: P33-E01
title: "Trust Badge Schema & Computation"
phase: 33
status: pending
priority: high
depends_on: []
---

# P33-E01: Trust Badge Schema & Computation

> Phase 33 · Trust & Verification Display · Status: pending

## Task Queue

- [ ] P33-E01-T01 — Add trust badge schema, enums, permissions, and config keys
- [ ] P33-E01-T02 — Build deterministic badge computation and freshness scoring
- [ ] P33-E01-T03 — Expose public trust badge payloads for listing surfaces

---

### P33-E01-T01: Add trust badge schema, enums, permissions, and config keys

**Objective**: Define the `listing_trust_badges` data contract and shared constants so backend and frontend use a single source of truth.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:1-165` — current phase scope and trust rules baseline to reconcile.
- `convex/schema.ts:786-828` — `owner_verifications`, `listings`, and `listing_photos` patterns for foreign keys and soft delete usage.
- `convex/schema.ts:397-441` — `systemConfigKeyValidator` pattern for adding new config keys via `v.union(v.literal(...))`.
- `lib/constants.ts:46-53` — enum + type export pattern (`as const satisfies Record<string, string>` + derived type).
- `lib/constants.ts:732-810` — permission key naming (`entity.action`) and centralized `PERMISSIONS` object pattern.
- `lib/constants.ts:892-937` — system config keys + type pattern (`SYSTEM_CONFIG_KEYS`, `SystemConfigKey`).

**Key Rules**:

1. Define new schema with `defineTable({...}).index(...)` and explicit foreign keys (`listing_id: v.id("listings")`), following listing-linked table patterns.
2. Use strict enum validators for freshness state (`v.union(v.literal("FRESH"), v.literal("AGING"), v.literal("STALE"))`); do not use free-form strings.
3. Store all timestamps as Unix milliseconds (`v.number()`), never date strings.
4. Include `is_deleted: v.boolean()` on `listing_trust_badges` and use soft-delete semantics consistently.
5. Add trust constants in `lib/constants.ts` with typed maps for labels/colors and no duplicated literals in UI/backend.
6. All mutations/internal mutations touching `listing_trust_badges` MUST use the `customMutation` wrapper exports from `convex/functions.ts` (`mutation`/`internalMutation` imported from `./functions`, never `./_generated/server`) so audit triggers run automatically.
7. Add trust config keys: `trust_badge_freshness_threshold_days` (default `30`), `trust_badge_recompute_batch_size` (default `200`), and `trust_badges_recompute_lock` (no static default; runtime lock key used by cron singleton guard).
8. Before adding new permissions, verify existing permissions in `lib/constants.ts` `PERMISSIONS` object match `notes/13-constants-reference.md`. If drift is found, fix the doc to match code (code is source of truth). Do NOT modify code to match stale docs.
9. `system_config` entries written by cron/scheduled functions have no admin actor context. Update schema contract to `updated_by_admin_id: v.optional(v.id("users"))` and keep admin-authored writes populated while allowing cron lock keys (for example `trust_badges_recompute_lock`) to omit this field.

**Deliverables**:

- [ ] `convex/schema.ts` — add `listing_trust_badges` table and indexes (`by_listing_id`, `by_freshness_state`, `by_last_computed_at`).
- [ ] `convex/schema.ts` — update `system_config.updated_by_admin_id` to `v.optional(v.id("users"))` for cron-written lock/config entries.
- [ ] `convex/functions.ts` — add `listing_trust_badges` to `AUDITED_TABLES` so trust cache writes are audit-logged.
- [ ] `convex/schema.ts` — add `LISTING_TRUST_BADGES_INSERT` and `LISTING_TRUST_BADGES_UPDATE` literals to `auditActionValidator` (and `LISTING_TRUST_BADGES_DELETE` if hard delete is ever introduced).
- [ ] `lib/constants.ts` — add `TRUST_BADGE`, `TrustBadge`, `TRUST_BADGE_LABELS`, `TRUST_BADGE_COLORS`, trust freshness state constants, permission strings, and config keys (`trust_badge_freshness_threshold_days`, `trust_badge_recompute_batch_size`, `trust_badges_recompute_lock`).
- [ ] `lib/constants.ts` — add `AUDIT_ACTIONS` entries for `LISTING_TRUST_BADGES_INSERT` and `LISTING_TRUST_BADGES_UPDATE` (and `LISTING_TRUST_BADGES_DELETE` if applicable).
- [ ] `notes/10-convex-schema.md` — add `listing_trust_badges` table documentation (fields, indexes, validators) following existing table doc format.
- [ ] `notes/13-constants-reference.md` — add trust badge enums, permissions, config keys, labels, colors, and new trust-badge audit actions following existing format.
- [ ] `convex/seedDemo.ts` — ensure seeded listings include:
  - At least 2 listings with 5+ `listing_photos` (to trigger `REAL_PHOTOS` badge)
  - At least 1 listing linked to a verified lead (to trigger `OWNER_VERIFIED` badge)
  - At least 1 listing with completed visits that have photo evidence (to trigger `PHYSICALLY_INSPECTED` badge)
  - At least 1 listing in a building with confirmed closures (to trigger `CLOSURE_HISTORY` badge)
  - Trust badge records for all seeded published listings
- [ ] `notes/features/25-trust-verification-display.md` — update schema and constants section to match actual implementation contract.

**Acceptance Criteria**:

- [ ] Schema typechecks with strict validators for trust badges, freshness state, and evidence metadata.
- [ ] Constants export one canonical trust badge enum/type pair reused by both Convex and Next.js.
- [ ] New permission and config key names follow existing conventions (`trust_badges.compute`, `trust_badge_freshness_threshold_days`, `trust_badge_recompute_batch_size`, `trust_badges_recompute_lock`).
- [ ] `system_config` schema supports both admin-authored writes (with `updated_by_admin_id`) and cron-authored lock writes (without actor context).

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
```

**Out of Scope**: Freshness cron orchestration and any UI rendering changes.

---

### P33-E01-T02: Build deterministic badge computation and freshness scoring

**Objective**: Implement idempotent trust badge computation that derives badge set and freshness state from listing/verification/visit/photo/closure signals.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:21-157` — badge definitions, freshness scoring expectations, and acceptance checklist.
- `convex/listings.ts:25` — mutation import pattern from `./functions`.
- `convex/listings.ts:843-929` — `getBySlugPublic` enrichment style (`Promise.all`, soft-delete filters, public payload shaping).
- `convex/listings.ts:1389-1444` — `listPublished` constraints (`PUBLISHED` only, `.take(500)` cap, enriched return shape).
- `convex/analytics.ts:141-155` — time-window helper pattern using Unix ms.
- `convex/analytics.ts:1819-1892` — internal mutation compute + upsert pattern (query existing by index, patch-or-insert).

**Key Rules**:

1. Freshness scoring must be config-driven using `trust_badge_freshness_threshold_days` (default `30`): `FRESH` days = `0..config_days` (score `75-100`), `AGING` = `config_days..2*config_days` (score `25-74`), `STALE` = beyond `2*config_days` (score `0-24`).
2. Freshness reference timestamp is `max(listing._creationTime, last_activity_at)` to avoid stale false-positives after recent activity.
3. Only `LISTING_STATUS.PUBLISHED` listings are eligible for badge computation.
4. Badge recomputation must be idempotent: exactly one trust row per listing (upsert by `listing_id`) and deterministic output for repeated runs.
5. Use public-safe evidence snapshots (counts/timestamps/boolean checks); do not leak phone numbers, emails, or internal notes.
6. Keep DB writes in mutations/internal mutations only; no external API calls from recomputation path.
7. Badge recompute must be callable from both daily cron (batch) and event triggers. Implement single-listing recompute as an `internalMutation` accepting `listing_id`; cron iterates over published listings and calls it per listing.
8. Every recompute hook must verify the listing is still `PUBLISHED` before writing badge data. If listing was archived between the trigger event and the recompute execution, skip silently.
9. Badge recompute MUST use deterministic upsert: query `listing_trust_badges` by `by_listing_id` index. If row exists, `ctx.db.patch()`. If not, `ctx.db.insert()`. Never allow two rows for the same `listing_id`.
10. The single-listing recompute function MUST be an `internalMutation` (not a public mutation). It is called only from event hooks and the cron. If an admin-facing "force recompute" button is needed, create a separate public mutation gated by `requirePermission(ctx, PERMISSIONS.TRUST_BADGES_COMPUTE)` that delegates to the internal function.

**Deliverables**:

- [ ] `convex/trustBadges.ts` (or dedicated equivalent module) — pure helpers for badge eligibility + `calculateFreshnessScore`.
- [ ] `convex/trustBadges.ts` — mutation/internalMutation entrypoints for single-listing and batch recomputation.
- [ ] `convex/verifications.ts` — add recompute call after VERIFIED outcome.
- [ ] `convex/visits.ts` — add recompute call after COMPLETED outcome.
- [ ] `convex/listings.ts` — add recompute call after successful photo add.
- [ ] `convex/listings.ts` — add recompute call to `removePhoto` mutation (after successful photo removal — may change `REAL_PHOTOS` badge).
- [ ] `convex/listings.ts` — add recompute call to `publish` mutation (on `new_status === PUBLISHED` create initial badges; on `new_status === ARCHIVED` delete/invalidate badge record).
- [ ] `convex/closures.ts` — add recompute call to `confirm` mutation (after `CONFIRMED` status — updates `CLOSURE_HISTORY` badge for building).
- [ ] `notes/features/25-trust-verification-display.md` — update business rules with config-driven thresholds and eligibility logic.

**Acceptance Criteria**:

- [ ] Re-running recomputation without data changes produces identical badge arrays, freshness score, and freshness state.
- [ ] Badge conditions map exactly to P33 definitions (`OWNER_VERIFIED`, `PHYSICALLY_INSPECTED`, `FRESH_LISTING`, `REAL_PHOTOS`, `VISITS_COMPLETED`, `CLOSURE_HISTORY`).
- [ ] Freshness state mapping is enforced (`FRESH >= 75`, `AGING 25-74`, `STALE 0-24`).

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
```

**Out of Scope**: Cron scheduling/continuation logic and frontend badge rendering.

---

### P33-E01-T03: Expose public trust badge payloads for listing surfaces

**Objective**: Extend listing public query contracts so cards and detail pages can consume trust data without expensive per-card recomputation.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:68-132` — expected query/mutation contracts and public behavior rules.
- `convex/listings.ts:1389-1444` — `listPublished` payload shape and 500-item cap.
- `convex/listings.ts:843-929` — `getBySlugPublic` payload shape for detail page composition.
- `convex/http.ts:44-70` — HTTP endpoint forwarding `api.listings.getBySlugPublic` + cache headers.
- `src/app/listing/[slug]/page.tsx:64-74` — SSR data fetch path from Convex HTTP endpoint.
- `src/components/public/listings/listings-directory.tsx:26-33` — card list derives type directly from `api.listings.listPublished`.

**Key Rules**:

1. Keep `listPublished` public-safe and capped (`.take(500)`) while adding trust fields needed by browse cards.
2. Extend `getBySlugPublic` payload compatibly; existing required listing fields must remain unchanged.
3. Return badge arrays already sorted by display priority so UI components stay presentational.
4. Read from precomputed cache (`listing_trust_badges`) in public queries; do not recompute badge logic inline.
5. Keep HTTP endpoint behavior stable (`/api/listing/:slug`) and preserve cache headers.
6. Convex has no SQL-style `IN` query. For public listing pages (typically 20-50 items per page load), batch-fetch trust rows with capped parallel index lookups using `Promise.all`, then merge into listing payloads.
7. Use this exact pattern for batch trust reads (O(N) indexed reads, no table scan):
   ```ts
   const trustRows = await Promise.all(
     listingIds.map((id) =>
       ctx.db
         .query("listing_trust_badges")
         .withIndex("by_listing_id", (q) => q.eq("listing_id", id))
         .unique(),
     ),
   );
   ```

**Deliverables**:

- [ ] `convex/listings.ts` — enrich `listPublished` with trust summary fields used by card/list views.
- [ ] `convex/listings.ts` — enrich `getBySlugPublic` with detailed trust payload (badges + freshness metadata + evidence snippets).
- [ ] `convex/http.ts` — ensure endpoint remains compatible after payload extension (no route contract break).

**Acceptance Criteria**:

- [ ] Listing browse query returns trust data for each listing with no additional client-side Convex calls per card.
- [ ] Detail payload exposes freshness score/state and evidence fields required by trust strip UI.
- [ ] Existing consumers of listing title/price/photo fields keep working without payload regressions.

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
```

**Out of Scope**: Admin stale queue tooling, cron registration, and UI component implementation.
