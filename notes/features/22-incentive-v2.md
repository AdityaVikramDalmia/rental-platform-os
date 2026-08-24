# Feature: Incentive V2 (Quality Scoring + Streaks + Payout Adjustments)

> **Priority**: Phase 30 (Field Ops Platform)
> **Personas**: Guard (earning + viewing), Admin/OPS (reviewing + overriding), System (computing)
> **Dependencies**: Field Checklists (F21), Visit Management (F06), Closure & Payouts (F07), Incentive System (F08)

## Purpose

Incentive V2 extends the original badge system (F08) with a quantitative quality engine. Every guard now has a live quality score (0–100) that determines their payout multiplier, unlocks streak bonuses, and drives leaderboard rankings. The system is fully configurable via `system_config` — weights, tier thresholds, and bonus amounts are all admin-adjustable without code changes.

This document covers the four interconnected subsystems: quality scoring, quality tiers + multipliers, streak tracking, and the payout adjustment engine.

---

## Entities Involved

- `quality_score_history` table — time-series quality scores per guard
- `guard_streaks` table — streak counters per guard per streak type
- `payout_adjustments` table — computed payout breakdown per payout record
- `guard_profiles` table — `quality_score` field (denormalized latest score)
- `incentive_cards` table — milestone cards (from F08, extended here)
- `system_config` table — all configurable weights, thresholds, and bonus amounts

---

## Quality Score Formula

The quality score is a weighted average of five components, each scored 0–100. The formula:

```
quality_score = (
  checklist_component × weight_checklist +
  photo_component     × weight_photo +
  speed_component     × weight_speed +
  verification_component × weight_verification +
  document_component  × weight_document
) / 100
```

### Default Weights

| Component    | Config Key                    | Default Weight | What It Measures                                                   |
| ------------ | ----------------------------- | -------------- | ------------------------------------------------------------------ |
| Checklist    | `quality_weight_checklist`    | **30**         | Average `completeness_score` of approved checklists (last 30 days) |
| Photo        | `quality_weight_photo`        | **25**         | % of photo items with evidence; +10 bonus if any GPS-tagged        |
| Speed        | `quality_weight_speed`        | **20**         | Average hours from visit creation to completion                    |
| Verification | `quality_weight_verification` | **15**         | % of submitted checklists that got APPROVED (not REJECTED)         |
| Document     | `quality_weight_document`     | **10**         | % of required document items that are VERIFIED or NA               |

Weights are stored in `system_config` under keys `quality_weight_checklist`, `quality_weight_photo`, `quality_weight_speed`, `quality_weight_verification`, `quality_weight_document`. They must sum to 100 (enforced by convention, not code).

### Component Calculations

**Checklist component** (30%):

- Fetch all `checklist_instances` assigned to the guard, created in the last 30 days
- Filter to `status === "APPROVED"`
- Average their `completeness_score` values
- Default: 50 if no approved checklists exist yet

**Photo component** (25%):

- For each approved checklist, count photo-type items (`PHOTO` or `PHOTO_CONDITION`)
- Count how many have at least one photo uploaded
- Score = `(items_with_photos / total_photo_items) × 100`
- GPS bonus: if any photo has `lat` and `lng` metadata, add +10 (clamped to 100)
- Default: 50 if no photo items exist

**Speed component** (20%):

- Fetch completed visits from the last 30 days
- For each, compute hours from `_creationTime` to `completed_at`
- Average the durations, then score:
  - ≤ 24 hours → 100
  - ≤ 48 hours → 75
  - ≤ 72 hours → 50
  - > 72 hours → 25
- Default: 50 if no completed visits

**Verification component** (15%):

- Count checklists in "completion states" (SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, REVISION_REQUESTED) — these are "submitted"
- Count those with `status === "APPROVED"` — these are "approved"
- Score = `(approved / submitted) × 100`
- Default: 50 if no submitted checklists

**Document component** (10%):

- Fetch all `document_requirements` assigned to the guard
- Count required items (`is_required: true`)
- Count those with `status === "VERIFIED"` or `status === "NA"`
- Score = `(completed_required / total_required) × 100`
- Default: 50 if no required document items

### Score Clamping

All component scores and the final weighted score are clamped to [0, 100] via `clampScore()`. Non-finite values (NaN, Infinity) become 0.

### Trigger Events

Quality score is recomputed whenever:

| Trigger              | Constant               | When                                      |
| -------------------- | ---------------------- | ----------------------------------------- |
| `CHECKLIST_APPROVED` | `"CHECKLIST_APPROVED"` | Admin/OPS approves a checklist            |
| `VISIT_COMPLETED`    | `"VISIT_COMPLETED"`    | Guard completes a visit                   |
| `DOCUMENTS_UPDATED`  | `"DOCUMENTS_UPDATED"`  | Document requirement item status changes  |
| `MANUAL_RECALC`      | `"MANUAL_RECALC"`      | Admin manually triggers recomputation     |
| `CRON_DAILY`         | `"CRON_DAILY"`         | Daily cron job runs for all active guards |

Each recomputation inserts a new `quality_score_history` record and patches `guard_profiles.quality_score` with the latest value.

---

## Quality Tiers

The quality score maps to a tier, which determines the payout multiplier.

| Tier     | Constant                | Min Score | Multiplier | Config Key (min)                          |
| -------- | ----------------------- | --------- | ---------- | ----------------------------------------- |
| Bronze   | `QUALITY_TIER.BRONZE`   | 0+        | 1.0x       | `quality_tier_bronze_min` (default: 0)    |
| Silver   | `QUALITY_TIER.SILVER`   | 50+       | 1.25x      | `quality_tier_silver_min` (default: 50)   |
| Gold     | `QUALITY_TIER.GOLD`     | 75+       | 1.5x       | `quality_tier_gold_min` (default: 75)     |
| Platinum | `QUALITY_TIER.PLATINUM` | 90+       | 2.0x       | `quality_tier_platinum_min` (default: 90) |

Multipliers are hardcoded in `QUALITY_MULTIPLIER_BY_TIER` in `convex/incentives.ts`:

```typescript
const QUALITY_MULTIPLIER_BY_TIER: Record<QualityTier, number> = {
  BRONZE: 1,
  SILVER: 1.25,
  GOLD: 1.5,
  PLATINUM: 2,
};
```

Tier thresholds are configurable. Multipliers are not (they're code constants).

---

## Streak System

Guards earn streaks by maintaining consistent quality activity. Four streak types track different behaviors.

### Streak Types

| Type           | Constant                     | Qualifies When      | Tracking                                   |
| -------------- | ---------------------------- | ------------------- | ------------------------------------------ |
| Daily Active   | `STREAK_TYPE.DAILY_ACTIVE`   | Quality score ≥ 60  | Day-based (IST calendar days)              |
| Weekly Warrior | `STREAK_TYPE.WEEKLY_WARRIOR` | Quality score ≥ 60  | Day-based (IST calendar days)              |
| Quality Chain  | `STREAK_TYPE.QUALITY_CHAIN`  | Quality score ≥ 85  | Task-based (consecutive qualifying scores) |
| Perfect 10     | `STREAK_TYPE.PERFECT_10`     | Quality score = 100 | Task-based (consecutive perfect scores)    |

Day-based streaks (`DAILY_ACTIVE`, `WEEKLY_WARRIOR`) increment once per IST calendar day. If the guard qualifies today and already qualified yesterday, the streak continues. If they miss a day, the streak resets to 0.

Task-based streaks (`QUALITY_CHAIN`, `PERFECT_10`) count consecutive qualifying scores in `quality_score_history`, looking backward from the most recent entry.

### Streak Data Model

```typescript
// guard_streaks table
{
  guard_user_id: Id<"users">,
  streak_type: StreakType,
  current_count: number,       // current streak length
  longest_count: number,       // all-time best streak
  is_active: boolean,          // false when streak is broken
  last_activity_date: string,  // IST date key "YYYY-MM-DD"
  started_at: number,          // Unix ms when current streak started
  updated_at: number,          // Unix ms of last update
  is_deleted: boolean,
}
```

One record per guard per streak type. Updated in-place (not append-only).

### Streak Milestones

When a streak reaches a milestone count, a bonus is credited to the guard's next payout adjustment. Milestones are checked at exact counts (not "at or above"):

| Milestone     | Config Key                 | Default Bonus         |
| ------------- | -------------------------- | --------------------- |
| 3 days/tasks  | `streak_bonus_3day_paise`  | ₹200 (20000 paise)    |
| 7 days/tasks  | `streak_bonus_7day_paise`  | ₹500 (50000 paise)    |
| 14 days/tasks | `streak_bonus_14day_paise` | ₹1,000 (100000 paise) |
| 30 days/tasks | `streak_bonus_30day_paise` | ₹2,000 (200000 paise) |

Milestone bonuses are de-duplicated: if a `payout_adjustments` record already credits the same bonus amount within the current streak window (`computed_at >= streak.started_at`), the bonus is not credited again.

### Streak Validation (Daily Cron)

A daily cron job calls `incentives.validateStreaks()` (also exported as `incentives.breakStaleStreaks`). It finds all active day-based streaks and breaks any where `last_activity_date` is not yesterday's IST date key. Broken streaks have `current_count` set to 0 and `is_active` set to false.

---

## Penalty System

Penalties reduce the final payout amount. They are computed per-payout in `computePayoutAdjustment()`.

| Penalty          | Constant                        | Trigger                                            | Amount                                                                 |
| ---------------- | ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Low Completeness | `PENALTY_TYPE.LOW_COMPLETENESS` | Checklist component < 40                           | ₹500 (50000 paise)                                                     |
| Missing Photos   | `PENALTY_TYPE.MISSING_PHOTOS`   | Photo component < 30                               | ₹300 (30000 paise)                                                     |
| False Lead       | `PENALTY_TYPE.FALSE_LEAD`       | Lead has quality flags                             | ₹1,000 (100000 paise)                                                  |
| No Show          | `PENALTY_TYPE.NO_SHOW`          | Any visit for this lead has `status === "NO_SHOW"` | Configurable via `penalty_no_show_paise` (default: ₹200 = 20000 paise) |
| Consecutive Poor | `PENALTY_TYPE.CONSECUTIVE_POOR` | 3+ consecutive quality scores below 40             | ₹500 (50000 paise)                                                     |

Penalty amounts are hardcoded in `computePayoutAdjustment()` except for `NO_SHOW` which reads from `system_config`.

---

## Bonus System

Task bonuses are earned per-payout based on the guard's performance on the specific deal.

| Bonus             | Constant                       | Trigger                                                    | Amount                  |
| ----------------- | ------------------------------ | ---------------------------------------------------------- | ----------------------- |
| Full Checklist    | `BONUS_TYPE.FULL_CHECKLIST`    | Latest approved checklist has `completeness_score === 100` | 10% of base amount      |
| All GPS Photos    | `BONUS_TYPE.ALL_GPS_PHOTOS`    | Photo component ≥ 90                                       | 5% of base amount       |
| Within SLA        | `BONUS_TYPE.WITHIN_SLA`        | Speed component ≥ 75                                       | 10% of base amount      |
| All Required Docs | `BONUS_TYPE.ALL_REQUIRED_DOCS` | Document component ≥ 90                                    | 15% of base amount      |
| Streak Milestone  | `BONUS_TYPE.STREAK_MILESTONE`  | Active streak at a milestone                               | Fixed paise from config |

Bonuses are percentage-based (except streak milestone which is fixed). They're computed against `base_amount_paise`.

---

## Payout Adjustment Engine

When a payout is created, `computePayoutAdjustment()` runs as an internal mutation to compute the full breakdown.

### Calculation Formula

```
final_amount = max(0,
  base_amount × quality_multiplier
  + streak_bonus_paise
  + task_bonuses_total_paise
  - penalty_total_paise
)
```

### Payout Adjustment Data Model

```typescript
// payout_adjustments table
{
  payout_id: Id<"payouts">,
  guard_user_id: Id<"users">,
  base_amount_paise: number,          // original bounty amount
  quality_score: number,              // guard's score at computation time
  quality_tier: QualityTier,          // BRONZE | SILVER | GOLD | PLATINUM
  quality_multiplier: number,         // 1.0 | 1.25 | 1.5 | 2.0
  streak_bonus_paise: number,         // eligible streak milestone bonus
  task_bonuses: Array<{
    bonus_type: BonusType,
    label: string,
    amount_paise: number,
    percentage?: number,
  }>,
  task_bonuses_total_paise: number,
  penalties: Array<{
    penalty_type: PenaltyType,
    label: string,
    amount_paise: number,
  }>,
  penalty_total_paise: number,
  suggested_total_paise: number,      // computed total before admin override
  admin_override_paise?: number,      // admin can override the final amount
  final_amount_paise: number,         // suggested_total or admin_override
  computed_at: number,                // Unix ms
  is_deleted: boolean,
}
```

### Admin Override

Admin can override the suggested total by setting `admin_override_paise`. When an override is set, `final_amount_paise` uses the override value instead of `suggested_total_paise`. The override is visible in the payout detail view alongside the full breakdown.

### Recomputation

If the payout is recomputed (e.g., after a checklist is approved post-payout creation), the existing `payout_adjustments` record is soft-deleted (`is_deleted: true`) and a new one is inserted. Only the latest non-deleted record is used.

---

## Leaderboards

Guards compete on leaderboards across multiple time scopes.

### Scopes

| Scope    | Constant     | Window                        |
| -------- | ------------ | ----------------------------- |
| Daily    | `"DAILY"`    | Today (IST)                   |
| Weekly   | `"WEEKLY"`   | Last 7 days                   |
| Monthly  | `"MONTHLY"`  | Last 30 days                  |
| All Time | `"ALL_TIME"` | No window                     |
| Society  | `"SOCIETY"`  | All time, filtered by society |

### Ranking Formula

Guards are ranked by `composite_score = quality_score × tasks_completed`. Ties broken by: quality_score desc → recent_activity_at desc → guard_name asc → guard_user_id asc.

### Leaderboard Queries

```typescript
incentives.getLeaderboard({
  scope: LeaderboardScope,
  society_id?: Id<"societies">,  // required for SOCIETY scope
  limit?: number,                // default 20, max 50
  cursor?: number,               // offset-based pagination
})
// Requires: incentives.view permission
// Returns: { scope, items: [{ rank, guard_user_id, guard_name, quality_score, tasks_completed, composite_score, tier }], hasMore, nextCursor }

incentives.getMyLeaderboardPosition({ scope?: "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME" })
// Guard-facing: returns their rank across all scopes + quality score + tier
// Returns: { daily_rank, weekly_rank, monthly_rank, quality_score, tier, tasks_completed, rank, total_guards, percentile }

incentives.getTopGuards({ scope: "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME", limit?: number })
// Any authenticated user: top N guards for a scope
// Used in guard dashboard to show "Top Performers" widget
```

---

## Guard Dashboard Enhancements

The guard dashboard (`/guard/dashboard`) shows quality-related widgets:

### Quality Score Card

```
┌─────────────────────────────────┐
│  Your Quality Score             │
│                                 │
│  🥇 Gold Tier                   │
│  Score: 78 / 100                │
│                                 │
│  Checklist  ████████░░  82      │
│  Photos     ███████░░░  70      │
│  Speed      █████████░  90      │
│  Verification ████████  80      │
│  Documents  ██████░░░░  60      │
└─────────────────────────────────┘
```

Data from: `incentives.getMyLeaderboardPosition()` + `quality_score_history` latest entry.

### Streak Widget

```
┌─────────────────────────────────┐
│  Your Streaks                   │
│                                 │
│  🔥 Daily Active    7 days      │
│  ⚡ Quality Chain   3 tasks     │
│  💎 Perfect 10      0 tasks     │
│                                 │
│  Next milestone: 14 days (₹1,000)│
└─────────────────────────────────┘
```

Data from: `guard_streaks` records for the guard.

### Leaderboard Position

```
┌─────────────────────────────────┐
│  Leaderboard                    │
│                                 │
│  Weekly Rank: #3 of 47          │
│  Top 6%                         │
│                                 │
│  [View Full Leaderboard]        │
└─────────────────────────────────┘
```

---

## Convex Functions

### Internal Mutations (System-Triggered)

```typescript
incentives.recomputeQualityScore({ guard_user_id, trigger });
// Computes all 5 components, inserts quality_score_history, patches guard_profiles.quality_score
// Then calls updateStreak() with the new score

incentives.updateStreak({ guard_user_id, score });
// Updates all 4 streak types for the guard based on the new score
// Returns milestone_bonuses array for any newly reached milestones

incentives.validateStreaks(); // also exported as breakStaleStreaks
// Daily cron: breaks day-based streaks where last_activity_date is not yesterday

incentives.computePayoutAdjustment({ payout_id, guard_user_id, base_amount_paise });
// Computes full payout breakdown, inserts payout_adjustments record

incentives.checkAndSuggest({ guard_user_id, trigger: "LEAD_VERIFIED" | "VISIT_COMPLETED" });
// Checks if guard qualifies for new incentive card milestones (from F08)
// Creates auto-suggestion cards for admin review
```

### Public Queries

```typescript
incentives.getLeaderboard({ scope, society_id?, limit?, cursor? })
// Admin/OPS: paginated leaderboard for any scope
// Requires: incentives.view permission

incentives.getMyLeaderboardPosition({ scope? })
// Guard: their rank + quality score + tier across all scopes

incentives.getTopGuards({ scope, limit? })
// Any authenticated user: top N guards
```

### Public Mutations (Admin/OPS)

```typescript
incentives.confirm({ card_id });
// Confirm a pending auto-suggested incentive card
// Requires: incentives.award permission

incentives.reject({ card_id });
// Reject a pending auto-suggested incentive card
// Requires: incentives.award permission
```

---

## System Config Keys

All configurable values in `system_config` (from `SYSTEM_CONFIG_KEYS` in `lib/constants.ts`):

| Key                                | Default | Description                                      |
| ---------------------------------- | ------- | ------------------------------------------------ |
| `quality_weight_checklist`         | 30      | Checklist component weight                       |
| `quality_weight_photo`             | 25      | Photo component weight                           |
| `quality_weight_speed`             | 20      | Speed component weight                           |
| `quality_weight_verification`      | 15      | Verification component weight                    |
| `quality_weight_document`          | 10      | Document component weight                        |
| `quality_tier_bronze_min`          | 0       | Min score for Bronze tier                        |
| `quality_tier_silver_min`          | 50      | Min score for Silver tier                        |
| `quality_tier_gold_min`            | 75      | Min score for Gold tier                          |
| `quality_tier_platinum_min`        | 90      | Min score for Platinum tier                      |
| `streak_bonus_3day_paise`          | 20000   | ₹200 bonus at 3-day/task milestone               |
| `streak_bonus_7day_paise`          | 50000   | ₹500 bonus at 7-day/task milestone               |
| `streak_bonus_14day_paise`         | 100000  | ₹1,000 bonus at 14-day/task milestone            |
| `streak_bonus_30day_paise`         | 200000  | ₹2,000 bonus at 30-day/task milestone            |
| `penalty_no_show_paise`            | 20000   | ₹200 no-show penalty                             |
| `min_quality_score_for_incentives` | 50      | Minimum score to be eligible for incentive cards |

---

## Business Rules

1. Quality score is always 0–100 (clamped). Non-finite values become 0.
2. The `guard_profiles.quality_score` field is a denormalized cache of the latest score. The authoritative history is in `quality_score_history`.
3. Quality score recomputation always inserts a new `quality_score_history` record — it never updates existing records.
4. Streak milestones fire at exact counts (3, 7, 14, 30) — not "at or above." A guard at count 31 does not re-trigger the 30-day bonus.
5. Streak milestone bonuses are de-duplicated per streak window. A guard cannot earn the same milestone bonus twice in the same streak run.
6. Payout adjustments are recomputed fresh each time. Previous adjustments for the same payout are soft-deleted before inserting the new one.
7. `final_amount_paise` is always `max(0, ...)` — payouts cannot go negative.
8. Admin override (`admin_override_paise`) replaces `suggested_total_paise` as `final_amount_paise`. The override is stored separately so the original suggestion is preserved for audit.
9. BANNED guards are excluded from leaderboards.
10. Guards with `quality_score === 0` are excluded from leaderboard profiles (index filter: `q.gt("quality_score", 0)`).
11. The `QUALITY_COMPONENT_DEFAULT` value is 50 — used when a component has no data yet. This prevents new guards from starting at 0.
12. All paise values MUST be non-negative integers. `assertPositiveIntegerPaise()` enforces this on `base_amount_paise`.

---

## Edge Cases

- **Guard has no checklists yet**: All components default to 50. Quality score = 50. Tier = Silver. Multiplier = 1.25x. This is intentional — new guards start at a reasonable baseline.
- **Guard's quality score drops below tier threshold after payout computed**: The payout adjustment uses the score at computation time. No retroactive adjustment.
- **Streak broken by cron, then guard qualifies same day**: The streak restarts at 1. The broken streak's `longest_count` is preserved.
- **Multiple quality recomputations same day**: Each inserts a new `quality_score_history` record. The latest is used for streak computation. `guard_profiles.quality_score` is patched each time.
- **Admin overrides payout to 0**: `admin_override_paise = 0` is valid. `final_amount_paise = 0`. The guard receives nothing for that payout.
- **Checklist approved after payout already disbursed**: `computePayoutAdjustment()` throws "Cannot compute payout adjustment for a finalized payout" for DISBURSED/FAILED/VOIDED payouts. Quality score still updates, but the payout is not retroactively adjusted.
- **Guard achieves Platinum tier mid-streak**: The multiplier applies to the next payout computation. Existing payout adjustments are not retroactively updated.

---

## Related Documents

- [Incentive System](08-incentive-system.md) — V1 badge system (cards, auto-award, manual award) that V2 extends
- [Field Checklists](21-field-checklists.md) — checklist completeness_score is the largest quality component (30%)
- [Visit Management](06-visit-management.md) — visit completion triggers quality recomputation
- [Closure & Payouts](07-closure-and-payouts.md) — payout_adjustments links to payouts; final_amount_paise feeds the payout record
- [Quality & Controls](09-quality-and-controls.md) — quality flags, rate limits, ban process that interact with quality scoring
- [Constants Reference](../13-constants-reference.md) — QUALITY_TIER, STREAK_TYPE, PENALTY_TYPE, BONUS_TYPE, SYSTEM_CONFIG_KEYS, SYSTEM_CONFIG_DEFAULTS
- [Convex Schema](../10-convex-schema.md) — quality_score_history, guard_streaks, payout_adjustments table definitions
