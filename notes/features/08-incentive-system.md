# Feature: Incentive System

> **Priority**: #10 in implementation order
> **Personas**: Admin (configuration + manual awards), Guard (viewing badges + tier), System (auto-awards + scoring)
> **Dependencies**: Lead Pipeline + Payouts (for metrics) + Field Checklists (Phase 30)

## Purpose

The incentive system has two layers that work together:

**Layer 1 — Badge System (original)**: Incentive cards (badges) gamify the guard experience. Guards who submit quality leads consistently earn recognition visible on their profile. Cards are informational and motivational — they don't directly affect payout amounts, but admin may consider them when setting bounties.

**Layer 2 — Quality Engine (Phase 30)**: A quantitative scoring system that computes a 0-100 quality score per guard from five weighted behavioral components. The score determines a quality tier (BRONZE/SILVER/GOLD/PLATINUM), which drives a bounty multiplier applied when admin creates payouts. This makes quality directly and transparently connected to earnings.

Both layers coexist. The badge system rewards milestones. The quality engine rewards consistent behavior across every interaction.

## Entities Involved

- `incentive_cards` table
- `guard_profiles` (display on profile)
- `system_config` (thresholds)

## Permissions

| Permission          | Used By                                                             | Description                                                                       |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `incentives.view`   | `getLeaderboard`, `listPending`, `listActive`, `getByGuard` queries | Gates admin/ops visibility into incentive queues, cards, and leaderboard outputs. |
| `incentives.award`  | `confirm`, `reject`, `manualAward` mutations                        | Gates confirmation/rejection of auto-suggestions and manual incentive awarding.   |
| `incentives.expire` | `expire` mutation                                                   | Gates expiring/removing active incentive cards.                                   |

---

## Card Types

| Card Type          | What It Rewards                    | Metric                          |
| ------------------ | ---------------------------------- | ------------------------------- |
| `LEAD_SUBMITTER`   | Volume of quality lead submissions | Count of VERIFIED leads         |
| `VISIT_HANDLER`    | Reliable visit execution           | Count of COMPLETED visits       |
| `QUALITY_CHAMPION` | High verification rate             | verified_rate > threshold       |
| `CUSTOM`           | Admin's discretion                 | Manual award with custom reason |

## Levels

| Level      | Icon | Typical Threshold                      |
| ---------- | ---- | -------------------------------------- |
| `BRONZE`   | 🥉   | Entry level (e.g., 10 verified leads)  |
| `SILVER`   | 🥈   | Intermediate (e.g., 25 verified leads) |
| `GOLD`     | 🥇   | Advanced (e.g., 50 verified leads)     |
| `PLATINUM` | 💎   | Elite (e.g., 100 verified leads)       |

Thresholds are configurable in `system_config`.

---

## Auto-Award Logic

### When to Check

Run the auto-award check whenever a relevant event occurs:

- Lead transitions to `VERIFIED` → check LEAD_SUBMITTER + QUALITY_CHAMPION for submitting guard
- Visit transitions to `COMPLETED` → check VISIT_HANDLER for assigned guard

### Auto-Award Flow

```
1. Event triggers check for specific guard
2. Query guard's current metrics:
   - verified_leads_count
   - completed_visits_count
   - verified_rate (verified / total submitted)
3. Compare against thresholds in system_config
4. For each card_type:
   a. Get guard's current highest level for this card_type
   b. Determine what level they qualify for now
   c. If new level > current level:
      - Create incentive_card record (awarded_method: AUTO)
      - Flag for admin confirmation (is_active: false until confirmed)
      - Audit: INCENTIVE_AUTO_SUGGESTED
5. Admin sees pending suggestions in incentive management
6. Admin confirms → is_active: true → Audit: INCENTIVE_AWARDED
   OR Admin rejects → card deleted → Audit: INCENTIVE_REJECTED
```

### Why Admin Confirmation?

A guard might have high numbers but bad behavior (rude to owners, unreliable). Auto-award is a suggestion, not a final decision. Admin has full override power.

---

## Manual Award Flow

Admin can award any card type + level to any guard at any time.

1. Admin goes to Guard Profile → Incentives tab → "Award Card"
2. Select card type (or CUSTOM)
3. Select level
4. Enter reason (required for CUSTOM, optional for standard types)
5. Card is immediately active (no confirmation step for manual awards)
6. Audit: `INCENTIVE_MANUALLY_AWARDED`

---

## Revocation

Admin can revoke any active card:

1. Guard Profile → Incentives tab → click card → "Revoke"
2. Enter reason (required)
3. Card set to `is_active: false`
4. Audit: `INCENTIVE_REVOKED`

> **Revocation Reason Storage**: Revocation reason is captured in the audit log entry (via the automatic trigger system), not as a field on the `incentive_cards` table. The `awarded_reason` field stores the original award reason only. Admin enters the revocation reason in the confirmation dialog, and it's persisted as `metadata` in the `audit_logs` entry for the status change.

Revocation is visible in audit trail. Guard loses the badge from their profile.

---

## Guard View

### Profile: Incentive Cards Section

```
┌─────────────────────────────────┐
│  My Badges                      │
│                                 │
│  🥈 Silver Lead Submitter       │
│  25 verified leads              │
│                                 │
│  🥉 Bronze Visit Handler        │
│  10 visits completed            │
│                                 │
│  💎 Platinum Quality Champion   │
│  98% verification rate          │
└─────────────────────────────────┘
```

Guard sees: card type, level, and the metric that earned it. Only active cards shown.

---

## Admin Panel UI

### Incentive Management (`/admin/incentives`)

**Tabs**:

- **Pending Suggestions**: Auto-suggested cards awaiting admin confirmation
- **Active Cards**: All currently active cards across guards
- **Configuration**: Threshold settings

**Pending Suggestions Table**:

| Guard        | Card Type        | Suggested Level | Metric            | Actions            |
| ------------ | ---------------- | --------------- | ----------------- | ------------------ |
| Rajesh Kumar | Lead Submitter   | Silver          | 27 verified leads | [Confirm] [Reject] |
| Suresh Yadav | Quality Champion | Gold            | 95% rate          | [Confirm] [Reject] |

**Configuration Panel**:

| Config Key                 | Default | Description                                               |
| -------------------------- | ------- | --------------------------------------------------------- |
| Lead Submitter Bronze      | 10      | Verified leads for Bronze                                 |
| Lead Submitter Silver      | 25      | Verified leads for Silver                                 |
| Lead Submitter Gold        | 50      | Verified leads for Gold                                   |
| Lead Submitter Platinum    | 100     | Verified leads for Platinum                               |
| Visit Handler Bronze       | 10      | Completed visits for Bronze                               |
| Visit Handler Silver       | 25      | ...                                                       |
| Visit Handler Gold         | 50      | ...                                                       |
| Visit Handler Platinum     | 100     | ...                                                       |
| Quality Champion Bronze    | 70%     | Verified rate threshold                                   |
| Quality Champion Silver    | 80%     | ...                                                       |
| Quality Champion Gold      | 90%     | ...                                                       |
| Quality Champion Platinum  | 95%     | ...                                                       |
| Quality Champion Min Leads | 10      | Minimum submitted leads before quality rate is meaningful |

---

## Convex Functions

### Queries

```
incentives.getByGuard({ guard_user_id }) → IncentiveCard[]
incentives.getMyCards() → guard's own cards (guard-facing)
incentives.listPending({ pagination }) → pending suggestions
incentives.listActive({ guard_user_id?, card_type?, pagination }) → active cards
```

### Mutations

```
incentives.suggest({ guard_user_id, card_type, level, metric_value })
// System-initiated. is_active: false. awarded_method: AUTO.

incentives.confirm({ card_id })
// is_active: true. Audit: INCENTIVE_AWARDED

incentives.reject({ card_id })
// Delete record. Audit: INCENTIVE_REJECTED

incentives.manualAward({ guard_user_id, card_type, level, reason })
// is_active: true. awarded_method: MANUAL.
// Audit: INCENTIVE_CARDS_INSERT

incentives.revoke({ card_id, reason })
// is_active: false. Audit: INCENTIVE_CARDS_UPDATE
```

---

## Business Rules

1. A guard can have at most ONE active card per card_type. Upgrading replaces the old level.
2. Auto-suggestions require admin confirmation. Not auto-activated.
3. Manual awards are immediately active.
4. CUSTOM cards have no auto-award logic — purely admin-driven.
5. Revocation requires a reason (audit trail).
6. Cards do NOT directly affect payout amounts in V1. They're informational/motivational. Admin may consider them when setting bounty amounts.
7. Quality Champion requires a minimum number of submitted leads before the rate is meaningful (default: 10).

---

## Edge Cases

- **Guard drops below threshold after card awarded**: Card stays. No auto-revocation. Admin can manually revoke if behavior deteriorates.
- **Guard moves to new society**: Cards stay. They're tied to the guard, not the society.
- **Guard banned**: Cards stay on record but aren't visible (guard can't login). If re-activated, cards reappear.
- **Threshold config changed**: Only affects future suggestions. Existing cards are not retroactively evaluated.

---

## Quality Engine (Phase 30)

Phase 30 added a quantitative quality scoring system that runs alongside the badge system. Where badges reward milestones, the quality engine tracks ongoing behavioral patterns and translates them into a multiplier that affects payout suggestions.

### Quality Score Formula

The quality score is a weighted average of five components, each scored 0-100:

| Component                | Weight | What It Measures                                                            |
| ------------------------ | ------ | --------------------------------------------------------------------------- |
| `lead_quality`           | 25%    | Verified rate of submitted leads (verified / total submitted × 100)         |
| `checklist_completeness` | 30%    | Average completeness score across all submitted checklists                  |
| `visit_reliability`      | 20%    | Visit completion rate (completed / (completed + no_show + cancelled) × 100) |
| `response_time`          | 15%    | How quickly guard starts assigned visits after they're scheduled            |
| `document_compliance`    | 10%    | Compliance with document collection requests from admin                     |

```
quality_score = (lead_quality × 0.25) + (checklist_completeness × 0.30)
              + (visit_reliability × 0.20) + (response_time × 0.15)
              + (document_compliance × 0.10)
```

Component weights are configurable via `system_config`. The defaults above reflect the product team's judgment that checklist completeness is the most controllable behavior and therefore deserves the highest weight.

### Quality Tiers

| Tier       | Score Range | Bounty Multiplier | Description                               |
| ---------- | ----------- | ----------------- | ----------------------------------------- |
| `BRONZE`   | 0-49        | 1.0x              | Entry level — no adjustment               |
| `SILVER`   | 50-69       | 1.25x             | Consistent performer                      |
| `GOLD`     | 70-84       | 1.5x              | High quality                              |
| `PLATINUM` | 85-100      | 2.0x              | Elite — exceptional across all dimensions |

Tier boundaries are configurable via `system_config`. The multiplier is applied to the base bounty when admin creates a payout (see [Closure & Payouts](07-closure-and-payouts.md#payout-adjustment-model-phase-30)).

### Streak System

Streaks track consecutive positive behaviors. Four streak types are tracked:

| Streak Type        | What Triggers It                                                     | What Breaks It                                             |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| `VERIFIED_LEADS`   | Each consecutive lead that gets VERIFIED                             | Any lead that gets REJECTED or DUPLICATE                   |
| `COMPLETED_VISITS` | Each consecutive visit that reaches COMPLETED                        | Any visit that becomes NO_SHOW or CANCELLED (guard-caused) |
| `CHECKLIST_FULL`   | Each consecutive checklist with completeness_score ≥ 90              | Any checklist with completeness_score < 90                 |
| `FAST_RESPONSE`    | Each consecutive visit started within the configured response window | Any visit started late or not started                      |

Active streaks contribute a flat bonus (in paise) to the payout suggestion. Streak bonuses are configurable per streak type via `system_config`.

### Payout Adjustment Engine

When admin creates a payout, the system computes a suggested amount:

```
suggested = (base_bounty × quality_multiplier) + streak_bonuses + task_bonuses - penalties
```

Admin sees the full breakdown and can override the final amount freely. See [Closure & Payouts](07-closure-and-payouts.md#payout-adjustment-model-phase-30) for the full payout form UI and override rules.

### Leaderboards

The quality engine powers leaderboards visible to admin:

- Top guards by quality score (society-scoped or platform-wide)
- Top guards by streak length (per streak type)
- Quality tier distribution across all active guards

Guards see their own tier and streak status on their profile. They do not see other guards' scores.

### Admin Panel UI (Quality Engine)

**Quality tab on Guard Detail page**:

- Current quality score (0-100) with component breakdown bar chart
- Current tier badge with multiplier
- Active streaks with current length
- Score trend over last 30/90 days
- Recent penalty history

**Quality Leaderboard** (`/admin/quality`):

- Sortable table: guard name, society, quality score, tier, active streaks, last updated
- Filter by society, tier
- Export to CSV

### Convex Functions (Quality Engine)

```
quality.getGuardScore({ guard_user_id }) → QualityScore + components + tier + streaks
quality.getLeaderboard({ society_id?, tier?, limit, pagination }) → GuardQualityRanking[]
quality.recomputeScore({ guard_user_id })
// Internal — triggered after lead/visit/checklist events
// Recomputes all 5 components and updates tier

quality.getActiveStreaks({ guard_user_id }) → Streak[]
quality.computePayoutSuggestion({ closure_id, guard_user_id }) → PayoutSuggestion
// Returns: base, multiplier, streak_bonuses, task_bonuses, penalties, suggested_total
```

### Business Rules

1. Quality score is recomputed after every relevant event (lead status change, visit completion, checklist submission).
2. Score uses a configurable lookback window (default: all-time, with recent-30-day weighting).
3. Guards with fewer than 5 total submissions show "Insufficient data" for quality score — no tier assigned.
4. Tier assignment uses the most recently computed score. No manual tier override.
5. Streaks are broken immediately when the triggering negative event occurs. They cannot be restored retroactively.
6. The quality engine does NOT replace admin judgment — it informs it. Admin can always override the payout suggestion.

See [Incentive V2](22-incentive-v2.md) for the complete spec including penalty mechanics, streak configuration, and the full payout adjustment algorithm.
