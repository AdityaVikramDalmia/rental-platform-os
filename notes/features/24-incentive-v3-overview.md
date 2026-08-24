# Feature: Incentive V3 Overview (Multi-Persona Engine)

> **Priority**: Phase 24 (Incentive V3 Foundation)
> **Personas**: Guard, OPS, Admin (plus specialization tracks within OPS/Guard)
> **Dependencies**: Incentive V2 (F32), Deal Economics (F20), OPS Portal (F30), State Machines, Constants Reference

## 1. Purpose & Scope

Incentive V3 is the master architecture for the next-generation incentive system. It extends Incentive V2 (Phase 30), which is currently guard-centric (quality score, tiers, streaks, payout adjustments), into a multi-persona incentive and commission platform.

V3 adds four major capabilities:

1. Multi-persona incentive tracks tied to work roles (not auth roles)
2. Dynamic commission engine with modifier breakdowns
3. Multi-contributor attribution and split accounting
4. Gamification across personas (XP, levels, weekly tiers, quests)

V3 does **not** replace V2 immediately. The rollout starts in shadow mode, validates parity and variance against V2, then migrates persona-by-persona.

### Scope Boundary for This Document

This is the **master overview and orchestration doc**. It defines architecture, rollout strategy, migration, config model, and build order.

Detailed implementation docs are split out:

- `25-commission-engine.md` - commission formulas, modifiers, preview/simulation math
- `26-multi-contributor-attribution.md` - attribution algorithm internals, disputes, override process
- `27-ops-gamification.md` - XP economy, levels, weekly tiers, quests, UI loops

### Core V3 Incentive Flow

```text
Deal closes
  -> commission evaluated (deal_commission_evaluations)
  -> contribution ledger materialized (deal_contributions)
  -> attribution computed (attribution_records + attribution_splits)
  -> disbursements created (incentive_disbursements)
  -> gamification updates applied (gamification_profiles)
```

```text
pool = max(0, floor(commission_base_profit_paise * effective_rate_bps / 10000) + flat_bonus_paise)
split_amount_paise = floor(pool_amount_paise * share_bps / 10000)
total_user_earnings = attribution_splits + quest_rewards + team_pool_disbursements
```

Authoritative commission formula for V3: `pool = max(0, floor(profit * effective_rate_bps / 10000) + flat_bonus_paise)`.

---

## 2. Persona Strategy

### Decision: No New `user_type` for V3

Incentive V3 uses **incentive persona tracks** instead of introducing new auth-level `user_type` values.

| Incentive Persona | Maps To `user_type`    | Auth Change?   | Description                                                  |
| ----------------- | ---------------------- | -------------- | ------------------------------------------------------------ |
| `GUARD`           | `GUARD`                | None           | Lead discovery and on-ground vacancy intelligence            |
| `OPS`             | `OPS`                  | None           | Visit execution, checklists, documents, and verification     |
| `SALES`           | `OPS` (specialization) | None initially | Negotiation and closure ownership                            |
| `RM`              | `OPS` or `GUARD`       | None           | Post-deal owner relationship management                      |
| `LIAISON`         | `OPS`                  | None           | Society coordination and external unblock workflows          |
| `ALL`             | Any eligible user      | None           | Global persona-agnostic rules (quests/templates/config only) |

### Why This Strategy

Adding a new `user_type` (for example `SALES`) would require platform-wide auth and routing changes:

- new auth flow and potential WorkOS changes
- new route group/app shell/layout conventions
- seed updates and RBAC profile branching
- new operational/legal paths for payout treatment

For V3, a closer is modeled as an OPS agent on a different incentive track. Create a real new `user_type` only if the product later requires a separate app shell or legal payout regime.

### Actor Profile Model

Every eligible user gets an `incentive_actor_profiles` row. A single user can have multiple active or time-bounded persona tracks over time (with effective dates).

---

## 3. Schema Overview (New Tables)

V3 introduces twelve new tables. These are additive and do not overload existing V2 structures (`payout_adjustments`, `guard_streaks`, `quality_score_history`, `incentive_cards`).

| Table                           | Purpose                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `incentive_actor_profiles`      | Per-user persona assignment with base/min/max commission bounds                               |
| `deal_commission_evaluations`   | Per-deal commission calculation with modifier breakdown and config snapshot                   |
| `commission_modifier_templates` | Runtime admin-defined modifier templates (BPS/flat modes, composition links, persona routing) |
| `deal_contributions`            | Atomic contribution ledger (event-driven, append-only, handoff-safe)                          |
| `attribution_records`           | Attribution algorithm decision record with status lifecycle and snapshots                     |
| `attribution_splits`            | Materialized split rows per recipient for query and payout pipelines                          |
| `incentive_disbursements`       | Generic disbursement ledger (separate from guard payout table)                                |
| `incentive_config_versions`     | Versioned config documents (`DRAFT` -> `ACTIVE` -> `ARCHIVED`)                                |
| `gamification_profiles`         | User-persona XP, level, weekly tier, streak, badges                                           |
| `gamification_quests`           | Quest definitions by persona with reward rules and time windows                               |
| `user_quest_progress`           | Per-user quest progress and claim tracking                                                    |
| `shadow_mode_deltas`            | Immutable V2-vs-V3 comparison logs for shadow rollout validation                              |

### Schema

### Full Convex Schema Definitions

```ts
// New validators
const incentivePersonaValidator = v.union(
  v.literal("ALL"),
  v.literal("GUARD"),
  v.literal("OPS"),
  v.literal("SALES"),
  v.literal("RM"),
  v.literal("LIAISON"),
);
const contributionSourceEntityValidator = v.union(
  v.literal("LEAD"),
  v.literal("VISIT"),
  v.literal("CLOSURE"),
  v.literal("AUDIT_LOG"),
  v.literal("MANUAL"),
);
const contributionStageValidator = v.union(
  v.literal("DISCOVERY"),
  v.literal("VERIFICATION"),
  v.literal("CLOSURE"),
  v.literal("SUPPORT"),
);
const attributionAlgorithmValidator = v.union(
  v.literal("STAGE_WEIGHTED_QUALITY_V1"),
  v.literal("SHAPLEY_DISPUTE_V1"),
  v.literal("MANUAL_OVERRIDE_V1"),
);
const configVersionStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("ACTIVE"),
  v.literal("ARCHIVED"),
);

// 1) incentive_actor_profiles
incentive_actor_profiles: defineTable({
  user_id: v.id("users"),
  persona: incentivePersonaValidator,
  track_code: v.string(),
  commission_base_bps: v.optional(v.number()),
  commission_min_bps: v.optional(v.number()),
  commission_max_bps: v.optional(v.number()),
  is_active: v.boolean(),
  effective_from: v.number(),
  effective_to: v.optional(v.number()),
  updated_by_admin_id: v.id("users"),
}).index("by_user", ["user_id"]).index("by_persona_active", ["persona", "is_active"]),

// 2) deal_commission_evaluations
deal_commission_evaluations: defineTable({
  closure_id: v.id("closures"),
  lead_id: v.id("leads"),
  deal_economics_id: v.optional(v.id("deal_economics")),
  primary_actor_user_id: v.id("users"),
  persona: incentivePersonaValidator,
  base_rate_bps: v.number(),
  effective_rate_bps: v.number(),
  commission_base_profit_paise: v.number(),
  incentive_pool_paise: v.number(),
  modifier_breakdown: v.array(v.object({
    template_id: v.id("commission_modifier_templates"),
    template_name: v.string(),
    reward_mode: v.union(v.literal("BPS"), v.literal("FLAT_PAISE")),
    delta_bps: v.optional(v.float64()),
    delta_paise: v.optional(v.int64()),
    link_mode: v.union(v.literal("INDIVIDUAL"), v.literal("AND_GROUP"), v.literal("OR_GROUP")),
    link_group_id: v.optional(v.string()),
    passed: v.boolean(),
  })),
  config_version: v.string(),
  config_snapshot: v.string(),
  computed_at: v.number(),
  status: v.union(v.literal("DRAFT"), v.literal("FINAL"), v.literal("VOIDED")),
}).index("by_closure", ["closure_id"]).index("by_primary_actor", ["primary_actor_user_id", "computed_at"]),

// 3) commission_modifier_templates
commission_modifier_templates: defineTable({
  code: v.string(),
  display_name: v.string(),
  description: v.string(),
  reward_mode: v.union(v.literal("BPS"), v.literal("FLAT_PAISE")),
  rule_type: v.union(v.literal("threshold_step"), v.literal("linear_band"), v.literal("penalty_step")),
  metric_source: v.union(
    v.literal("AUTO_COMPUTED"),
    v.literal("MANUAL_ENTRY"),
    v.literal("SELF_DECLARED"),
  ),
  metric_key: v.optional(v.string()),
  operator: v.string(),
  threshold: v.number(),
  threshold_upper: v.optional(v.number()),
  delta_value: v.number(),
  cap_value: v.optional(v.number()),
  slope_per_unit: v.optional(v.number()),
  link_mode: v.union(v.literal("INDIVIDUAL"), v.literal("AND_GROUP"), v.literal("OR_GROUP")),
  link_group_id: v.optional(v.string()),
  persona: v.union(
    v.literal("ALL"),
    v.literal("GUARD"),
    v.literal("OPS"),
    v.literal("SALES"),
    v.literal("RM"),
    v.literal("LIAISON"),
  ),
  sort_order: v.number(),
  is_active: v.boolean(),
  created_by_admin_id: v.id("users"),
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
}).index("by_persona_active", ["persona", "is_active"])
  .index("by_code", ["code"])
  .index("by_link_group", ["link_group_id"]),

// 4) deal_contributions
deal_contributions: defineTable({
  closure_id: v.id("closures"),
  lead_id: v.optional(v.id("leads")),
  actor_user_id: v.id("users"),
  actor_persona: incentivePersonaValidator,
  stage: contributionStageValidator,
  source_entity_type: contributionSourceEntityValidator,
  source_entity_id: v.string(),
  event_key: v.string(),
  contribution_units: v.number(),
  quality_score_snapshot: v.optional(v.number()),
  timeliness_score_snapshot: v.optional(v.number()),
  handoff_from_user_id: v.optional(v.id("users")),
  handoff_reason: v.optional(v.string()),
  occurred_at: v.number(),
  metadata: v.optional(v.any()),
  is_voided: v.boolean(),
  voided_reason: v.optional(v.string()),
  voided_by_admin_id: v.optional(v.id("users")),
  voided_at: v.optional(v.number()),
  is_deleted: v.boolean(),
}).index("by_closure_stage", ["closure_id", "stage"])
  .index("by_actor", ["actor_user_id", "occurred_at"])
  .index("by_closure", ["closure_id"])
  .index("by_source", ["source_entity_type", "source_entity_id"])
  .index("by_event_key", ["event_key"]),

// 5) attribution_records
attribution_records: defineTable({
  closure_id: v.id("closures"),
  lead_id: v.id("leads"),
  deal_commission_evaluation_id: v.id("deal_commission_evaluations"),
  algorithm: attributionAlgorithmValidator,
  algorithm_version: v.string(),
  pool_amount_paise: v.number(),
  total_adj_points: v.optional(v.number()),
  config_version: v.string(),
  config_snapshot: v.string(),
  status: v.union(v.literal("PROVISIONAL"), v.literal("FINAL"), v.literal("DISPUTED"), v.literal("RESOLVED")),
  dispute_reason: v.optional(v.string()),
  disputed_by_admin_id: v.optional(v.id("users")),
  disputed_at: v.optional(v.number()),
  override_reason: v.optional(v.string()),
  overridden_by_admin_id: v.optional(v.id("users")),
  overridden_at: v.optional(v.number()),
  resolved_by_admin_id: v.optional(v.id("users")),
  resolution_notes: v.optional(v.string()),
  supersedes_record_id: v.optional(v.id("attribution_records")),
  computed_at: v.number(),
  finalized_at: v.optional(v.number()),
  resolved_at: v.optional(v.number()),
  is_deleted: v.optional(v.boolean()),
}).index("by_closure", ["closure_id"]).index("by_status", ["status"])
  .index("by_supersedes_record_id", ["supersedes_record_id"]),

// 6) attribution_splits
attribution_splits: defineTable({
  attribution_record_id: v.id("attribution_records"),
  closure_id: v.id("closures"),
  recipient_user_id: v.id("users"),
  recipient_persona: incentivePersonaValidator,
  primary_stage: v.optional(contributionStageValidator),
  contribution_count: v.optional(v.number()),
  raw_points: v.optional(v.number()),
  adj_points: v.optional(v.number()),
  share_bps: v.number(),
  share_bps_display: v.optional(v.number()),
  provisional_amount_paise: v.optional(v.number()),
  residue_numerator: v.optional(v.number()),
  remainder_rank: v.optional(v.number()),
  amount_paise: v.number(),
  contribution_points: v.number(),
  contribution_ids: v.array(v.id("deal_contributions")),
  is_manual_override: v.optional(v.boolean()),
  notes: v.optional(v.string()),
  created_at: v.number(),
  is_deleted: v.optional(v.boolean()),
}).index("by_recipient", ["recipient_user_id", "created_at"])
  .index("by_closure", ["closure_id"])
  .index("by_attribution", ["attribution_record_id"]),

// 7) incentive_disbursements
incentive_disbursements: defineTable({
  recipient_user_id: v.id("users"),
  recipient_persona: incentivePersonaValidator,
  source_type: v.union(v.literal("ATTRIBUTION_SPLIT"), v.literal("QUEST_REWARD"), v.literal("TEAM_POOL"), v.literal("V2_MIGRATION")),
  source_record_id: v.string(),
  source_key: v.string(),
  closure_id: v.optional(v.id("closures")),
  amount_paise: v.number(),
  status: v.union(v.literal("PENDING"), v.literal("APPROVED"), v.literal("DISBURSED"), v.literal("FAILED"), v.literal("VOIDED")),
  approved_by_admin_id: v.optional(v.id("users")),
  approved_at: v.optional(v.number()),
  disbursed_at: v.optional(v.number()),
  created_at: v.number(),
}).index("by_recipient_status", ["recipient_user_id", "status"])
  .index("by_closure", ["closure_id"])
  .index("by_source_key", ["source_key"]),

// 8) incentive_config_versions
incentive_config_versions: defineTable({
  version_code: v.string(),
  status: configVersionStatusValidator,
  config_json: v.string(),
  optimizer_bounds_json: v.string(),
  created_by_admin_id: v.id("users"),
  activated_by_admin_id: v.optional(v.id("users")),
  change_note: v.string(),
  created_at: v.number(),
  activated_at: v.optional(v.number()),
}).index("by_version", ["version_code"]).index("by_status", ["status"]),

// 9) gamification_profiles
gamification_profiles: defineTable({
  user_id: v.id("users"),
  persona: incentivePersonaValidator,
  xp_total: v.number(),
  level: v.number(),
  weekly_tier: v.string(),
  weekly_xp: v.number(),
  streak_days: v.number(),
  longest_streak: v.number(),
  streak_freezes_remaining: v.number(),
  streak_freezes_used_this_month: v.number(),
  badges: v.array(v.string()),
  is_active: v.boolean(),
  updated_at: v.number(),
}).index("by_user_persona", ["user_id", "persona"]),

// 10) gamification_quests
gamification_quests: defineTable({
  quest_code: v.string(),
  applicable_personas: v.array(incentivePersonaValidator),
  scope: v.union(v.literal("INDIVIDUAL"), v.literal("TEAM")),
  target_metric_key: v.string(),
  target_value: v.number(),
  reward_type: v.union(v.literal("XP"), v.literal("PAISE"), v.literal("PERK")),
  reward_value: v.number(),
  start_at: v.number(),
  end_at: v.number(),
  status: v.union(v.literal("ACTIVE"), v.literal("ENDED")),
}).index("by_start", ["start_at"]).index("by_status", ["status"]),

// 11) user_quest_progress
user_quest_progress: defineTable({
  user_id: v.id("users"),
  quest_id: v.id("gamification_quests"),
  progress: v.number(),
  target: v.number(),
  completed: v.boolean(),
  claimed: v.boolean(),
  completed_at: v.optional(v.number()),
  created_at: v.number(),
}).index("by_user", ["user_id"]).index("by_quest", ["quest_id"]),

// 12) shadow_mode_deltas
shadow_mode_deltas: defineTable({
  deal_id: v.id("closures"),
  entity_type: v.union(v.literal("commission"), v.literal("attribution"), v.literal("disbursement")),
  persona: v.optional(incentivePersonaValidator),
  config_version_id: v.optional(v.id("incentive_config_versions")),
  v2_result_json: v.string(),
  v3_result_json: v.string(),
  delta_summary: v.string(),
  created_at: v.float64(),
}).index("by_deal", ["deal_id"]).index("by_entity_type", ["entity_type", "persona", "created_at"]),
```

### Idempotency Contract

- Before inserting into `deal_contributions`, check for existing rows with the same `event_key` (`{closure_id}:{stage}:{user_id}:{action_type}`).
- Before inserting into `incentive_disbursements`, check for existing rows with the same `source_key` (`{source_type}:{source_record_id}`).
- This makes contribution/disbursement writes idempotent and safe for retries.

---

## 4. Config Architecture

### Runtime Pointer Keys (`system_config`)

V3 keeps runtime pointers and rollout controls in `system_config`:

| Key                                  | Purpose                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| `incentive_v3_active_config_version` | Active version code currently used for V3 computation    |
| `incentive_v3_feature_flags`         | Flags controlling shadow/split/disbursement behavior     |
| `incentive_v3_rollout_policy`        | Persona-level enablement policy and phased rollout state |

### Versioned Config Documents (`incentive_config_versions`)

All detailed tunables live in `incentive_config_versions.config_json`.

```json
{
  "persona_tracks": {},
  "commission": {
    "base_ranges": {},
    "modifier_template_version": "mt.v1"
  },
  "attribution": {
    "stage_weights_bps": {}
  },
  "gamification": {
    "xp_map": {}
  },
  "events": {},
  "team_pools": {}
}
```

### Source-of-Truth Rule

At evaluation time (commission calculation, attribution split, gamification XP award), the source of truth is ALWAYS the `config_json` snapshot in the ACTIVE `incentive_config_versions` record. The `commission_modifier_templates` table is the draft-editing UI layer - templates get serialized into `config_json` when an admin publishes a new config version. Code must NEVER read templates directly during evaluation; always read from the active config snapshot.

> **Pipeline Config Pinning**: When a closure triggers the commission -> attribution -> disbursement pipeline, the `config_version` used by commission evaluation MUST be passed through to attribution and disbursement. Attribution and disbursement MUST NOT independently look up the active config; they use the `config_snapshot` and `config_version` persisted on `deal_commission_evaluations` for that closure.

### Config + Modifier Template Publishing Contract

- Modifier templates are managed in `commission_modifier_templates` while a config is in `DRAFT`.
- Publishing a config version serializes the resolved modifier set into `config_json` and activates that immutable snapshot.
- Every persisted `deal_commission_evaluations.config_snapshot` must include the exact resolved modifier payload used at compute time.
- Evaluation replay must read from `config_snapshot`, never from current draft template rows.

### AI Tunability (`optimizer_bounds_json`)

`optimizer_bounds_json` defines safe machine-tuning bounds.

| Field                  | Meaning                                    |
| ---------------------- | ------------------------------------------ |
| `parameter_id`         | Stable id for a tunable                    |
| `json_path`            | Path inside `config_json`                  |
| `type`                 | Number/integer/boolean/categorical         |
| `min` / `max` / `step` | Numeric search boundaries                  |
| `guardrails`           | Hard constraints and non-negotiable checks |

### Lifecycle Workflow

```text
DRAFT -> Simulate -> Publish -> ACTIVE -> ARCHIVED
```

1. Create/modify a draft config version
2. Run simulation against historical closures
3. Review variance, fairness, and payout risk
4. Publish and atomically update active version pointer
5. Archive old version for immutable audit history

---

## 5. Settings UI Wireframe

V3 introduces a dedicated 5-tab admin settings page.

### Layout

```text
/admin/incentive-settings

┌──────────────────────────────────────────────────────────────────────┐
│ Incentive V3 Program                                 [Simulate]     │
├──────────────────────────────────────────────────────────────────────┤
│ Program | Personas | Commission | Attribution | Gamification         │
├──────────────────────────────────────────────────────────────────────┤
│ Active Version: v3.0.4-shadow                                      │
│ Feature Flags: shadow=true, disburse=false, gamification=true       │
│ Rollout Policy: OPS_ONLY                                            │
│                                                                     │
│ [Tab Content Area]                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Tab Definitions

| Tab          | Primary Controls                                                  |
| ------------ | ----------------------------------------------------------------- |
| Program      | Active version, feature flags, rollout policy                     |
| Personas     | Persona assignment table, track config, effective window          |
| Commission   | Base range, modifier rules, commission preview                    |
| Attribution  | Stage-weight sliders, quality adjustment toggle, dispute fallback |
| Gamification | XP map, tier thresholds, quest templates                          |

### Simulate Button Behavior

`Simulate` flow:

1. Pick a closure id
2. Run V3 evaluation with chosen config version
3. Compare outputs side-by-side with V2
4. Show variance, recipient splits, and disbursement impact

No disbursement occurs in simulation. Output is read-only and auditable.

---

## 6. Migration Path (V2 -> V3)

V3 migration is explicitly phased to avoid payout regressions and guard trust loss.

| Phase   | Scope                                                                     | Guard Impact             |
| ------- | ------------------------------------------------------------------------- | ------------------------ |
| Phase 1 | Schema + Config (tables, seed defaults, feature flags OFF)                | No guard impact          |
| Phase 2 | Shadow Mode (compute V3 on closures, no disbursement, delta logging)      | No guard impact          |
| Phase 3 | OPS Activation (enable V3 for OPS/SALES; guards stay V2)                  | No guard impact          |
| Phase 4 | Guard Migration (after 2 low-variance cycles, switch guards to V3 source) | Same amounts, new source |
| Phase 5 | Full V3 (remove V2 shadow path, all personas on V3)                       | Transparent upgrade      |

### Shadow Mode Contract

- V2 remains payout source of truth initially
- Runtime: shadow evaluator writes a `shadow_mode_deltas` row on every closure during shadow mode
- Backfill: one-time migration action processes historical closures to generate comparison deltas
- migration gate requires sustained low variance and no fairness regressions

---

## 7. V3 State Machines

All V3 status changes must follow explicit transition guards:

- `incentive_config_versions`: `DRAFT -> ACTIVE -> ARCHIVED` (only one `ACTIVE` version at a time; publishing a new version archives the current `ACTIVE` version)
- `incentive_disbursements`: `PENDING -> APPROVED -> DISBURSED / FAILED / VOIDED` (mirrors V2 payout flow)
- `attribution_records`: `PROVISIONAL -> FINAL -> DISPUTED -> RESOLVED`

Note: `notes/04-state-machines.md` currently uses `DRAFT`/`OVERRIDDEN` for attribution and must be updated to `PROVISIONAL`/`RESOLVED` during P32-E01 implementation.

These should be added to the canonical `notes/04-state-machines.md` during implementation (P32-E01-T01).

## 8. V3 Permissions

- `commission.configure` - Create/edit modifier templates, publish config versions
- `commission.view` - View commission evaluations and breakdowns
- `attribution.override` - Manually adjust attribution splits
- `attribution.view` - View attribution records
- `gamification.manage` - Create/edit quests, adjust XP/levels, manage badges
- `gamification.view` - View gamification profiles and leaderboards
- `shadow_mode.manage` - Toggle shadow mode, view shadow deltas
- `disbursement.approve` - Approve pending disbursements
- `disbursement.void` - Void disbursements

These are the authoritative V3 permission strings. They must match the pattern used in `lib/constants.ts` `PERMISSIONS` object (dot-notation, e.g. `leads.view`, `visits.create`).

Note: `notes/13-constants-reference.md` currently lists `incentive_v3.*` permission names; reconcile that doc during P32-E01 to match the implementation namespace.

## 9. V3 Analytics Queries

- `getCommissionTrends(time_window)` - Commission totals and averages over time, by persona
- `getAttributionFairness(time_window)` - Gini coefficient or similar fairness metric across contributors
- `getGamificationEngagement(time_window)` - Active users, quest completion rates, streak lengths, tier distribution
- `getModifierEffectiveness(time_window)` - Which modifiers fire most often, average impact on commission
- `getShadowModeDelta(time_window)` - V2 vs V3 divergence summary for shadow mode monitoring
- `getPersonaEarnings(persona, time_window)` - Earnings breakdown per persona type

Exact return shapes defined during implementation. These enable the future AI optimization agent.

## 10. V2 -> V3 Migration

- `quality_score_history` -> seed initial XP in `gamification_profiles` (`total_quality_points * 10 = starting_xp`)
- `guard_streaks` -> seed streak values in `gamification_profiles` (`streak_days`, `longest_streak`, and freeze counters)
- `incentive_cards` (`CONFIRMED` cards) -> create equivalent `incentive_disbursements` with status `DISBURSED`, `source_type: "V2_MIGRATION"`, and deterministic `source_key`
- `guard_quality_scores` -> no migration needed; V2 scoring continues while V3 gamification runs in parallel during shadow mode
- Migration runs as a one-time Convex migration action and must be idempotent (check for existing V3 records before insert)
- Rollback during shadow mode: V3 tables can be truncated without affecting V2 operation

## 11. Audit Trail Integration

The following V3 tables must be wired into audit triggers in `convex/functions.ts`:

- `deal_commission_evaluations` -> audit on INSERT, UPDATE (status change)
- `attribution_records` -> audit on INSERT, UPDATE (status change)
- `attribution_splits` -> audit on INSERT
- `incentive_disbursements` -> audit on INSERT, UPDATE (status change)
- `incentive_config_versions` -> audit on INSERT, UPDATE (activation)
- `commission_modifier_templates` -> audit on INSERT, UPDATE, soft DELETE

## 12. Anti-Double-Pay Contract (V2 + V3 Coexistence)

To prevent duplicate payouts during phased rollout:

- During shadow mode: V2 payouts remain source of truth; V3 disbursements are computed but never paid.
- During OPS activation: V3 disbursements are paid for OPS/SALES; V2 payouts remain for guards.
- A closure cannot have both a V2 payout and a V3 disbursement for the same recipient.
- `incentive_disbursements.source_record_id` references `attribution_splits._id`.
- Before creating a V3 disbursement, enforce no `payouts` record exists for the same `closure_id + recipient_user_id`.

## 13. Build Order

| Phase   | Duration  | Deliverables                                                                              |
| ------- | --------- | ----------------------------------------------------------------------------------------- |
| Phase 1 | 1-2 weeks | Core engine: actor profiles, config versioning, commission evaluations, feature flags     |
| Phase 2 | 1-2 weeks | Attribution: contribution logging, attribution records/splits, disbursements, shadow mode |
| Phase 3 | 1 week    | Settings UI: 5 tabs, simulation engine, persona management                                |
| Phase 4 | 1-2 weeks | Gamification v1: XP/levels, weekly tiers, daily quests, dashboard widgets                 |
| Phase 5 | 1 week    | Rollout: enable OPS disbursements, monitor, guard migration                               |

### Implementation Sequence (High-Level)

```text
schema -> config -> commission eval -> contributions -> attribution -> disbursements
-> settings UI + simulator -> gamification -> phased rollout
```

---

## 14. Cross-References

- [Commission Engine](25-commission-engine.md) - detailed commission formulas, modifier rule types, simulation math
- [Multi-Contributor Attribution](26-multi-contributor-attribution.md) - attribution algorithm internals, split policy, disputes
- [OPS Gamification](27-ops-gamification.md) - XP curves, tiers, quests, persona progression loops
- [Incentive V2](22-incentive-v2.md) - existing guard-centric quality/streak/payout adjustment system
- [Deal Economics](20-deal-economics.md) - profit base and economics integration points for commission pool
- [State Machines](../04-state-machines.md) - status transition conventions and validation patterns
- [Constants Reference](../13-constants-reference.md) - enums/config keys to be added for V3 validators and settings

---

## 15. Key Decisions

| Decision                   | Choice                     | Why                                             |
| -------------------------- | -------------------------- | ----------------------------------------------- |
| New `user_type` for SALES? | No - persona track         | Avoids auth/routing churn                       |
| Attribution algorithm      | Stage-weighted quality     | Deterministic, explainable                      |
| Commission modifiers       | Rule-based (3 types)       | `threshold_step`, `linear_band`, `penalty_step` |
| Config storage             | Versioned JSON documents   | Audit trail, simulation, AI-tunable             |
| Gamification scope         | XP + weekly tiers + quests | High ROI, skip RPG stats                        |
| Migration                  | Shadow mode first          | Zero-risk validation                            |

---

## 16. Research Sources

This design is informed by the following patterns and references:

- Swiggy partner tier systems (weekly dynamic ratings)
- Urban Company 12-point partner program (transparency and penalty caps)
- Uber additive surge mechanics (incentive-compatible pricing)
- Real estate co-brokerage split models (20-35% referral fee bands)
- Shapley value game theory (fair division baseline for dispute mode)
- Duolingo/Habitica gamification loops (XP curves, streaks, quests)
- Multi-agent contract design literature, including arXiv:2301.13654

---

## Related Documents

- [Incentive V2](22-incentive-v2.md) - current production incentive model used as migration baseline
- [Deal Economics](20-deal-economics.md) - source of deal profit inputs used by V3 commission calculations
- [OPS Portal](20-ops-portal.md) - persona surface and workflow context for OPS tracks
- [Commission Engine](25-commission-engine.md) - implementation-level commission formula details
- [Multi-Contributor Attribution](26-multi-contributor-attribution.md) - attribution mechanics and dispute strategy
- [OPS Gamification](27-ops-gamification.md) - detailed gamification mechanics
- [State Machines](../04-state-machines.md) - status transition standards
- [Constants Reference](../13-constants-reference.md) - enum and config key source of truth
