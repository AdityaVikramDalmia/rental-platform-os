# Feature: OPS Gamification Layer

> **Priority**: Part of Incentive V3 (Phase 4 of V3 rollout, after commission engine + attribution)
> **Personas**: OPS (primary), Guard (extended), Sales (future), Admin (configuration)
> **Dependencies**: [Incentive V3 Overview](24-incentive-v3-overview.md), Incentive Actor Profiles ([Actor Profile Model](24-incentive-v3-overview.md#actor-profile-model))

## 1. Purpose

Add an RPG-style gamification layer on top of the commission engine to drive engagement, retention, and sustained performance.

The system converts work metrics into game mechanics: XP, levels, weekly competitive tiers, daily quests, enhanced streaks with freeze mechanics, and achievement badges.

This is an extension of existing V2 gamification primitives already in production:

- `quality_score_history` (score progression over time)
- `guard_streaks` (streak counters)
- `incentive_cards` (badge and milestone recognition)

V3 adds deeper progression loops while keeping payout logic transparent and operationally controllable.

---

## 2. What Is V1 (Build Now) vs V2 (Build Later) vs Skip

### V1 - Build Now (High ROI)

| Mechanic           | Why                                                      | Source Inspiration         |
| ------------------ | -------------------------------------------------------- | -------------------------- |
| XP + Levels        | Core progression loop and visible growth                 | Duolingo, Habitica         |
| Weekly Tiers       | Dynamic competition instead of static badge state        | Swiggy partner tiers       |
| Daily Quests       | Recurring engagement hook and habit formation            | Duolingo daily goals       |
| Enhanced Streaks   | Freeze safety net reduces anxiety from occasional misses | Duolingo streak freeze     |
| Badges (extend V2) | Achievement recognition and profile display              | Existing `incentive_cards` |

### V2 - Build Later

| Mechanic                      | Why Later                                                             |
| ----------------------------- | --------------------------------------------------------------------- |
| Skill trees / specializations | Needs richer persona signal first (`SCOUT` / `NEGOTIATOR` / `CLOSER`) |
| Seasonal events               | Need baseline engagement data before introducing event multipliers    |
| Team pools / guilds           | Need multi-society team structure and pool governance                 |
| Co-op missions                | Requires stable team topology and contribution tracking norms         |
| Mystery bonus wheel           | Lower ROI than core progression loops                                 |

### Skip (Overkill for Field Workforce)

| Mechanic                                       | Why Skip                                                        |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Full RPG stats (`STR` / `INT` / `CON` / `PER`) | Adds cognitive load for non-game workflow                       |
| Item inventory / equipment                     | No supporting in-app economy                                    |
| PvP battles                                    | Creates unhealthy competition in collaboration-heavy operations |
| Loot boxes with real money                     | Legal risk in India and ethical concerns                        |
| Mana points / health points                    | Unnecessary abstraction over business actions                   |

---

## 3. XP System

### XP Awards by Action

| Action                          | XP     | Persona                          | Condition                                        |
| ------------------------------- | ------ | -------------------------------- | ------------------------------------------------ |
| Lead submitted (verified)       | 50     | `GUARD_DISCOVERY`                | If `quality_score > 80`, award 50 XP; else 25 XP |
| Lead submitted (rejected)       | 0      | `GUARD_DISCOVERY`                | Rejected leads do not earn XP                    |
| Visit completed                 | 75     | `OPS_EXECUTION`                  | Base award; +25 XP bonus if checklist >= 90%     |
| Closure completed               | 200    | `OPS_EXECUTION` / `SALES_CLOSER` | Standard closure completion reward               |
| Document collected (on time)    | 30     | `OPS_EXECUTION`                  | Collected within SLA                             |
| Document collected (late)       | 15     | `OPS_EXECUTION`                  | Collected after SLA                              |
| Daily checklist 100%            | 50     | `OPS_EXECUTION`                  | All daily assigned items completed               |
| Perfect week (all dailies done) | 300    | ALL                              | Weekly bonus stacked on daily XP                 |
| Quest completed                 | varies | ALL                              | Per quest template/reward definition             |

### Level Curve (Adapted from Habitica, Accelerated for Workforce Use)

```typescript
function xpToNextLevel(level: number): number {
  if (level <= 10) return 100 * level; // Levels 1-10: 100-1000 XP
  if (level <= 30) return 1000 + (level - 10) * 75; // Levels 11-30: 1075-2500 XP
  return 2500 + Math.floor((level - 30) ** 1.5) * 50; // Level 31+: polynomial
}
// Level 1: 100, Level 5: 500, Level 10: 1000, Level 20: 1750, Level 30: 2500
```

### Level Benefits

| Level | Unlocks                                              |
| ----- | ---------------------------------------------------- |
| 1-5   | Basic features (already available)                   |
| 10    | `Experienced` title and profile badge                |
| 20    | Priority quest access                                |
| 30    | `Veteran` title and +5% XP bonus on all actions      |
| 50    | `Elite` title, +10% XP bonus, priority shift booking |
| 100   | `Legend` title (cosmetic prestige)                   |

---

## 4. Weekly Tiers (Swiggy-Inspired Dynamic Leagues)

Weekly tiers are recalculated every Monday at 00:00 IST based on XP earned in the prior week.

| Tier      | XP Threshold (Weekly) | Perks                                                                 |
| --------- | --------------------- | --------------------------------------------------------------------- |
| `IRON`    | 0                     | Base access                                                           |
| `BRONZE`  | 200                   | Priority lead assignment                                              |
| `SILVER`  | 500                   | +5% commission modifier bonus                                         |
| `GOLD`    | 1000                  | +10% commission bonus + priority shifts                               |
| `DIAMOND` | 2000                  | +15% commission bonus + priority everything + `Diamond` profile badge |

### Promotion / Demotion Rules

- Top 3 in each tier group are promoted to the next tier
- Bottom 3 in each tier group are demoted to the previous tier
- Middle ranks stay in the same tier
- Tier groups are sized at approximately 20-30 users (Duolingo-style league cohorts)

### Weekly Tier Cron Job

- Schedule: Monday 00:00 IST
- Computes weekly XP per user and persona
- Buckets users into tier groups
- Applies promotion and demotion logic
- Resets `weekly_xp` counters for the new week
- Emits user-facing notification for tier movement

### Cron Timezone Mapping (UTC -> IST)

- Weekly tier recalculation: Sunday 18:30 UTC = Monday 00:00 IST
- Daily quest reset: 18:30 UTC = 00:00 IST next day
- Monthly streak freeze refill: last day of month 18:30 UTC (= 1st of next month 00:00 IST)

Convex crons use UTC. All business logic times are IST (Asia/Kolkata, UTC+5:30).

---

## 5. Daily Quests

Every user receives 3 quests per day, selected from persona-specific templates.

- Reset cadence: 00:00 IST daily (Convex cron at 18:30 UTC)
- Expiry rule: uncompleted quests expire with no penalty
- Reward policy: completion awards immediate reward (typically XP)

### Quest Templates - `OPS_EXECUTION`

| Quest                        | Target                         | Reward |
| ---------------------------- | ------------------------------ | ------ |
| Complete 3 visits            | `visits_completed >= 3`        | 100 XP |
| Score 90+ on a checklist     | `max_checklist_score >= 90`    | 75 XP  |
| Collect 2 documents          | `docs_collected >= 2`          | 50 XP  |
| Respond to a lead within 2h  | `min_lead_response_hours <= 2` | 75 XP  |
| Complete all assigned visits | `visit_completion_rate = 100%` | 150 XP |

### Quest Templates - `GUARD_DISCOVERY`

| Quest                   | Target                   | Reward |
| ----------------------- | ------------------------ | ------ |
| Submit 2 leads          | `leads_submitted >= 2`   | 75 XP  |
| Get a lead verified     | `leads_verified >= 1`    | 100 XP |
| Submit lead with photos | `leads_with_photos >= 1` | 50 XP  |

---

## 6. Enhanced Streaks

V3 extends V2 streak tracking with resilience and milestone progression.

### Streak Freeze Mechanic (Duolingo-Inspired)

- Each user gets 1 free streak freeze per month
- Additional freezes can be purchased with XP: 500 XP per freeze
- Maximum additional freezes: 2 per month
- Freeze auto-activates on a missed day when available
- Manual recovery window: 3 hours after daily reset to perform a qualifying action and preserve streak
- Monthly refill job runs on the last day of month at 18:30 UTC (= 1st of next month 00:00 IST) and sets `streak_freezes_remaining = Math.max(current, 1)` on all active `gamification_profiles`.
- Monthly refill also resets `streak_freezes_used_this_month` for the new cycle.

### Streak Milestones

| Streak Length | Reward                                             |
| ------------- | -------------------------------------------------- |
| 7 days        | 100 XP + `Week Warrior` badge                      |
| 14 days       | 250 XP                                             |
| 30 days       | 500 XP + `Monthly Champion` badge                  |
| 60 days       | 1000 XP + `Dedication` badge                       |
| 100 days      | 2000 XP + `Century` badge + permanent +5% XP bonus |
| 365 days      | `Year of Excellence` legendary badge               |

---

## 7. Badges (Extension of Existing `incentive_cards`)

V2 badges remain valid (`lead_milestone`, `visit_milestone`, `quality_streak`, `speed_bonus`, `monthly_top`).

V3 introduces additional achievement badges:

| Badge            | Trigger                                             | Persona         |
| ---------------- | --------------------------------------------------- | --------------- |
| First Closure    | Complete first deal                                 | ALL             |
| Speed Demon      | 5 visits completed under 2 hours each               | `OPS_EXECUTION` |
| Document Master  | 100% document completion on 10 consecutive closures | `OPS_EXECUTION` |
| Perfect Week     | Complete all daily quests for 7 days                | ALL             |
| Diamond Achiever | Reach `DIAMOND` tier                                | ALL             |
| Century Streak   | Reach 100-day activity streak                       | ALL             |
| Quality King     | Quality score >= 95 for 30 consecutive days         | `OPS_EXECUTION` |
| Team Player      | Contribute to 5 multi-person deals                  | ALL             |

Implementation note: V3 achievement events can either map to new `incentive_cards.card_type` variants or be represented in `gamification_profiles.badges` with mirrored rendering in profile UI.

---

## 8. OPS Dashboard Gamification Widgets

OPS dashboard gets a dedicated gamification panel with progression, quests, and leaderboard visibility.

```text
┌─────────────────────────────────────┐
│  Level 23 ████████████░░░ 720/1500  │
│  Weekly Tier: 🥈 SILVER (450 XP)    │
│  Streak: 🔥 14 days (1 freeze left) │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Today's Quests                     │
│  [✅] Complete 3 visits    +100 XP  │
│  [⬜] Score 90+ checklist  +75 XP   │
│  [⬜] Collect 2 docs       +50 XP   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Weekly Leaderboard                 │
│  1. 🥇 Rajesh    1250 XP  GOLD     │
│  2. 🥈 Suresh    980 XP   SILVER   │
│  3. 🥉 You       450 XP   SILVER   │
│  4.    Mahesh    320 XP   BRONZE   │
└─────────────────────────────────────┘
```

Widget data sources:

- Progress card: `gamification_profiles`
- Quest card: `gamification_quests` + `user_quest_progress`
- Leaderboard card: gamification leaderboard query (weekly scope)

---

## 9. Schema

The following tables define the V3 gamification state layer.

### `gamification_profiles`

Schema: See [Incentive v3 Overview §Schema](24-incentive-v3-overview.md#schema).

### `gamification_quests`

> **Schema**: See [Incentive v3 Overview §Schema](24-incentive-v3-overview.md#schema) for the canonical `gamification_quests` definition.

`incentivePersonaValidator` includes `ALL`, and `applicable_personas: ["ALL"]` means the quest applies to every persona track.

### `user_quest_progress`

> **Schema**: See [Incentive v3 Overview §Schema](24-incentive-v3-overview.md#schema) for the canonical `user_quest_progress` definition.

---

## 10. Convex Functions

Required function surface for V3 gamification:

```ts
// Mutations / internal mutations
gamification.awardXp(user_id, action, amount, source);
gamification.completeQuest(quest_id);
gamification.useStreakFreeze();
gamification.awardBadge(user_id, badge_code);

// Queries
gamification.getProfile(user_id);
gamification.getMyProfile();
gamification.getDailyQuests();
gamification.getLeaderboard(scope, period);

// Cron/internal jobs
gamification.recalculateWeeklyTiers(); // Monday 00:00 IST
gamification.checkStreakFreeze(user_id); // daily cron pass
gamification.refillMonthlyStreakFreezes(); // last day of month 18:30 UTC (= 1st of next month 00:00 IST)
```

### Recommended Event Hooks

- Lead verify/reject transitions -> XP and quest progress updates
- Visit completion and checklist approval -> XP, streak, and badge checks
- Closure confirmation -> high-value XP award and milestone checks
- Document SLA transitions -> on-time vs late XP branching

---

## 11. Reporting Query Contracts

Required gamification read-model queries:

- `gamification.getWeeklyLeaderboard({ persona, week_start_ts, cursor? })`
- `gamification.getQuestCompletionStats({ from_ts, to_ts, persona? })`
- `gamification.getTierMovementReport({ week_start_ts, persona? })`

All reporting queries must include stable ordering and return UTC timestamps with IST display conversion handled in UI.

---

## 12. Notifications (Contract-Only for V3)

Notification events emitted by gamification logic:

- Level up -> push notification to user
- Weekly tier change (promotion/demotion) -> push notification
- Quest completed -> in-app toast
- Streak at risk (end of day, no activity) -> push notification
- Commission rate change -> in-app notification

Note: Notification transport/infrastructure is future work; this section defines event contracts only.

---

## 13. Research Sources

This design is informed by:

- **Swiggy**: Weekly partner tiering (`Gold`/`Silver`/`Bronze`) with priority shift and perk mechanics
- **Duolingo**: XP progression, daily goals, streak freezes, and weekly league promotion/demotion
- **Habitica**: Polynomial level-curve model and achievement structures
- **Urban Company**: Transparent earnings index and capped penalty behavior (`₹1,500/month` cap pattern)
- **Trophy.so**: Event-driven gamification microservice architecture patterns
- **Yu-kai Chou Octalysis**: Core drives focus on accomplishment, empowerment, social influence, unpredictability

---

## 14. Cross-References

- [Incentive V3 Overview](24-incentive-v3-overview.md)
- [Commission Engine](25-commission-engine.md)
- [Attribution](26-multi-contributor-attribution.md)
- [Incentive V2](22-incentive-v2.md)
- [Incentive V1](08-incentive-system.md)

---

## 15. Related Documents

- [Incentive V3 Overview](24-incentive-v3-overview.md) - architecture, rollout sequencing, and config model
- [Incentive V2](22-incentive-v2.md) - current production quality/streak/badge behavior extended by this layer
- [Incentive System](08-incentive-system.md) - original incentive card model that remains backward compatible
- [Deal Economics](20-deal-economics.md) - commission base economics and payout context
- [Constants Reference](../13-constants-reference.md) - enum and config-key source of truth for validators and settings
