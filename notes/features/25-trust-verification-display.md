# Feature: Trust & Verification Display

> **Priority**: #33 in implementation order
> **Personas**: Tenant, Owner, Admin, OPS
> **Dependencies**: P05 (Owner Verification), P06 (Listings), P07 (Visits), P12 (Cron/analytics patterns)
> **Route Groups**: `(public)/`, `(tenant)/`, `(admin)/`

## Purpose

Expose existing trust signals from verification and operations directly in listing discovery. Rental Platform OS already verifies owners and tracks visits, but tenants cannot currently see this evidence. This phase adds a precomputed trust layer so public listing surfaces can show reliability quickly without expensive runtime aggregation.

## Scope Summary

- Add a trust cache table (`listing_trust_badges`) keyed by listing.
- Compute six trust badges from existing source data.
- Add freshness scoring + state classification (`FRESH`, `AGING`, `STALE`) using a configurable policy cutoff.
- Run daily recompute via cron using self-scheduling cursor batches.
- Surface trust data in browse cards, list items, detail page, and freshness-first sort.

## Entities Involved

- `listings` (source listing status and creation time; only `PUBLISHED` listings are eligible)
- `owner_verifications` (owner verification signal via source lead)
- `visits` (completed visit count and inspection evidence)
- `listing_photos` (photo count, soft-delete aware)
- `closures` (building-level closure confidence signal)
- `listing_trust_badges` (new precomputed trust cache)

## Permissions

| Permission          | Used By                                           | Description                                                                 |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| `trust_badges.view` | `listStaleForAdmin`, `getFreshnessCounts` queries | Gates admin-facing stale-listing queue and freshness distribution counters. |

Public trust rendering paths consume precomputed trust data from listing queries; no additional end-user permission is required.

## Trust Badge Definitions

| Badge                  | Condition                                                                 | Color                            | Icon Suggestion  |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------- | ---------------- |
| `OWNER_VERIFIED`       | `owner_verifications.call_outcome = VERIFIED` for listing's source lead   | `bg-emerald-50 text-emerald-700` | `ShieldCheck`    |
| `PHYSICALLY_INSPECTED` | At least 1 completed visit with photo/checklist evidence for this listing | `bg-blue-50 text-blue-700`       | `ClipboardCheck` |
| `FRESH_LISTING`        | Freshness score >= 75                                                     | `bg-amber-50 text-amber-700`     | `Clock`          |
| `REAL_PHOTOS`          | At least 5 non-deleted listing photos                                     | `bg-purple-50 text-purple-700`   | `Camera`         |
| `VISITS_COMPLETED`     | At least 1 completed visit for this listing                               | `bg-indigo-50 text-indigo-700`   | `Users`          |
| `CLOSURE_HISTORY`      | At least 1 confirmed closure in the same building                         | `bg-orange-50 text-orange-700`   | `Trophy`         |

## Freshness Scoring (Config-Driven)

Freshness is policy-driven. Score is recalculated from the most recent trusted activity timestamp using `trust_badge_freshness_threshold_days` (default: `30`).

```typescript
function calculateFreshnessScore(
  listingCreatedAt: number,
  lastActivityAt: number,
  freshnessThresholdDays = 30,
): number {
  const reference = Math.max(listingCreatedAt, lastActivityAt);
  const daysSince = (Date.now() - reference) / (1000 * 60 * 60 * 24);
  if (daysSince <= freshnessThresholdDays)
    return 75 + Math.round((1 - daysSince / freshnessThresholdDays) * 25);
  if (daysSince <= 2 * freshnessThresholdDays)
    return (
      25 + Math.round((1 - (daysSince - freshnessThresholdDays) / freshnessThresholdDays) * 49)
    );
  return Math.max(
    0,
    24 - Math.round(((daysSince - 2 * freshnessThresholdDays) / freshnessThresholdDays) * 24),
  );
}
```

State mapping:

- `FRESH`: score `>= 75`
- `AGING`: score `25-74`
- `STALE`: score `0-24`

## Schema: `listing_trust_badges` (New)

Precomputed cache for public and admin trust reads.

| Field              | Type                                                                  | Required | Notes                                        |
| ------------------ | --------------------------------------------------------------------- | -------- | -------------------------------------------- |
| `listing_id`       | `v.id("listings")`                                                    | yes      | FK to listing; one row per listing           |
| `badges`           | `v.array(trustBadgeValidator)`                                        | yes      | Computed badge array                         |
| `freshness_score`  | `v.number()`                                                          | yes      | Integer 0-100                                |
| `freshness_state`  | `v.union(v.literal("FRESH"), v.literal("AGING"), v.literal("STALE"))` | yes      | Display and filtering state                  |
| `last_activity_at` | `v.optional(v.number())`                                              | no       | Latest trusted activity (Unix ms)            |
| `last_computed_at` | `v.number()`                                                          | yes      | Recompute timestamp (Unix ms)                |
| `evidence`         | `v.optional(v.object({...}))`                                         | no       | Public-safe summary metadata for detail page |
| `is_deleted`       | `v.boolean()`                                                         | yes      | Soft-delete flag                             |

Indexes:

- `by_listing_id`
- `by_freshness_state`
- `by_last_computed_at`

## Computation Lifecycle

### Event-Driven Recompute

Trigger recompute for affected listing when any of these events happen:

1. Owner verification outcome changes to `VERIFIED`
2. Visit status changes to `COMPLETED`
3. Listing photo add/remove (non-deleted count changes)
4. Listing publish/archive state transition (via `listings.publish` when `new_status` changes)
5. Closure confirmed in related building

### Daily Safety Recompute (Cron)

Run once daily to decay freshness for listings with no recent events.

The first production cron run also acts as a backfill: any `PUBLISHED` listing without a `listing_trust_badges` row gets one created during recompute.

```typescript
crons.daily(
  "freshness-badge-update",
  { hourUTC: 18, minuteUTC: 35 },
  internal.trustBadges.recomputeFreshness,
);
```

### Large Dataset Strategy

Convex mutation execution windows are short, so daily recompute must use cursor pagination plus self-scheduling continuation (`ctx.scheduler.runAfter`).

Convex has no SQL-style multi-ID `IN` query. For list surfaces (typically 20-50 listings per page), batch trust reads with capped parallel index lookups:

```typescript
const trustRows = await Promise.all(
  listingIds.map((id) =>
    ctx.db
      .query("listing_trust_badges")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", id))
      .unique(),
  ),
);
```

This is O(N) index reads and is the standard Convex pattern for this access shape.

## Query Contracts

### Public/Browse

- `api.listings.listPublished` returns trust summary per listing (badges, freshness score/state) for card/list rendering.

### Public/Detail

- `api.listings.getBySlugPublic` returns trust detail payload (badges + freshness + evidence).
- Data is served to Next.js via existing HTTP endpoint: `/api/listing/:slug`.

### Admin

- `api.trustBadges.listStaleForAdmin` (paginated stale queue)
- `api.trustBadges.getFreshnessCounts` (FRESH/AGING/STALE counters)

## UI Surfaces

### Browse (`/listings`)

- Add trust badge chips to both:
  - `PropertyCard` (grid)
  - `PropertyListItem` (list)
- Show max 3 badges by priority to keep mobile layout clean.

### Detail (`/listing/[slug]`)

- Add trust strip near top of detail content.
- Show freshness state/score and evidence snippets.

### Sorting

- Extend sort options with `freshness_first`.
- Ordering uses freshness score desc, then deterministic fallback.

## Business Rules

1. Trust computation only runs for `PUBLISHED` listings.
2. Public listing queries read trust cache, not inline expensive recomputation.
3. `listing_trust_badges` is the single trust cache source of truth; do not denormalize trust summary columns onto `listings`.
4. Recompute is idempotent (one cache row per listing, deterministic output).
5. Cron and event recompute use the same scoring helper.
6. Freshness uses `trust_badge_freshness_threshold_days` (default `30`) as the `FRESH` cutoff; `AGING` spans up to `2x` that cutoff and `STALE` is beyond `2x`.
7. Stale listings remain visible/searchable; trust impacts ranking and display only.
8. Badge display never blocks inquiry or visit request actions.
9. All timestamps are Unix milliseconds (`v.number()`).
10. All counts are integer values.
11. No public response includes owner/tenant PII in trust evidence fields.

## Edge Cases

- Listing with no visits can still show `OWNER_VERIFIED` and `FRESH_LISTING`.
- Listing with old creation date but recent completed visit can recover to `FRESH`.
- Listing with fewer than 5 active photos loses `REAL_PHOTOS` badge.
- Archived listing should not retain active freshness calculations until republished.
- Building closure count for `CLOSURE_HISTORY` uses confirmed closures only.

## Out of Scope (Future Phases)

- `QUICK_RESPONDER` badge (owner response time < 2 hours)
- `HIGH_DEMAND` badge (10+ inquiries in 7 days)
- Tenant-generated reviews and tenant trust scores (Phase 39)
- AI ranking/scoring models (Phase 40)

## Acceptance & Verification Checklist

1. Browse cards/list items render trust badges using cache-backed fields.
2. Detail page trust section reads from `getBySlugPublic` payload.
3. Freshness-first sort works without breaking existing sort modes.
4. Daily cron updates freshness state deterministically using cursor continuation.
5. Admin stale queries return accurate state buckets and listing-level details.

## Related Documents

- [Owner Verification](04-owner-verification.md) — owner verification source signal.
- [Listings](05-listings.md) — listing lifecycle and publish constraints.
- [Visit Management](06-visit-management.md) — completed visit evidence.
- [Analytics](10-analytics.md) — cron and snapshot implementation patterns.
- [State Machines](../04-state-machines.md) — listing status transitions.
