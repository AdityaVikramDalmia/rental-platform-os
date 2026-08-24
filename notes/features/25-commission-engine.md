# Feature: Dynamic Commission Engine

> **Priority**: Part of Incentive v3 (after Phase 31)
> **Personas**: OPS (primary), Sales (future), Admin (configuration), System (computation)
> **Dependencies**: Incentive v2 (Phase 30), Deal Economics (Phase 30 spec), Closure pipeline

## 1. Purpose

The commission engine computes a dynamic commission payout for each deal using OPS performance metrics and transparent rules. Instead of one static rate, each closure gets an evaluated rate in a configurable range (15% to 22%, i.e. 1500 to 2200 bps) plus optional flat bonuses/penalties, with a complete modifier breakdown visible to OPS and admin users.

The system is explainable by design: every positive or negative delta is persisted with metric value, threshold comparison, and explanation text so users can see exactly why a rate changed.

---

## 2. The Formula

The authoritative commission formula is defined in [Incentive V3 Overview](24-incentive-v3-overview.md#core-v3-incentive-flow):

`pool = max(0, floor(profit × effective_rate_bps / 10000) + flat_bonus_paise)`

This document defines how `effective_rate_bps` and `flat_bonus_paise` are computed via modifier rules.

Notes:

- `bps` = basis points (`100 bps = 1%`)
- `1500 bps = 15.00%`
- `2200 bps = 22.00%`
- The pool is always stored in paise as a non-negative integer
- BPS modifiers and flat paise modifiers are evaluated separately, then composed in the final pool

---

## 3. Commission Modifiers

Three rule types cover all modifier behavior:

| Rule Type        | How It Works                                              | Example                                           |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------- |
| `threshold_step` | If metric OP threshold then apply fixed `+/- delta_bps`   | `doc_hours <= 24 -> +50 bps`                      |
| `linear_band`    | Linear slope within band `[min,max]`, capped by max delta | `+5 bps per quality point above 80, cap +100 bps` |
| `penalty_step`   | Fixed negative delta if breach condition is met           | `no_shows >= 2 -> -100 bps`                       |

### Dynamic Modifier Templates (Runtime Table)

Modifiers are runtime-configured rows in `commission_modifier_templates`, not fixed constants in `lib/constants.ts`.

| Example Code        | Reward Mode  | Rule Type        | Metric Source   | Description                                |
| ------------------- | ------------ | ---------------- | --------------- | ------------------------------------------ |
| `DOC_SPEED`         | `BPS`        | `threshold_step` | `AUTO_COMPUTED` | Process documents within 24 hours          |
| `OWN_VEHICLE`       | `BPS`        | `threshold_step` | `SELF_DECLARED` | Agent has own vehicle for site visits      |
| `WEEKEND_AVAILABLE` | `FLAT_PAISE` | `threshold_step` | `MANUAL_ENTRY`  | Weekend execution incentive for hard slots |
| `NO_SHOW_PENALTY`   | `BPS`        | `penalty_step`   | `AUTO_COMPUTED` | Penalty for no-shows                       |

### Modifier Composition Logic (INDIVIDUAL / AND_GROUP / OR_GROUP)

| Link Mode    | Behavior                                                     | Example                                     |
| ------------ | ------------------------------------------------------------ | ------------------------------------------- |
| `INDIVIDUAL` | Standalone, evaluates independently                          | `Doc speed <= 24h -> +0.5%`                 |
| `AND_GROUP`  | All modifiers in group must pass for any to apply            | `Own scooty AND weekend available -> +0.7%` |
| `OR_GROUP`   | If any modifier in group passes, only the passing ones apply | `Own scooty OR company vehicle -> +0.2%`    |

Evaluation order:

1. Evaluate all `INDIVIDUAL` modifiers.
2. For each `AND_GROUP`: if all members pass, apply all deltas; else skip the entire group.
3. For each `OR_GROUP`: apply deltas only for members that pass.

---

## 4. Modifier Evaluation Flow

```text
1. Closure confirmed -> trigger commission evaluation
2. Fetch OPS incentive_actor_profile -> commission_base_bps, commission_min_bps, commission_max_bps
3. Fetch ACTIVE `incentive_config_versions.config_json` snapshot (published source of truth; do not read draft templates directly)
4. For each serialized modifier row in the active config snapshot:
   a. Compute metric value using recent data window (default 30 days)
   b. Evaluate rule (threshold_step / linear_band / penalty_step)
   c. Persist delta + explanation, classified by `reward_mode` (`BPS` or `FLAT_PAISE`)
5. Compute effective bps with min/max clamp
6. Compute flat paise bonus sum
7. Compute incentive_pool_paise from composed formula
8. Persist deal_commission_evaluations record with full modifier_breakdown
9. Trigger attribution computation (see Feature 26)
```

---

## 5. Metric Computation

| Metric Key                  | Computation                                                                                         | Window                                                  | Source                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `avg_doc_processing_hours`  | Average hours between requirement creation and item collection across closure documents             | Closure-scoped (plus optional 30-day behavioral sample) | `document_requirements` (`items[].collected_at`) |
| `on_time_visit_rate_pct`    | `%` of visits in last 30 days where arrival <= 15 minutes from `scheduled_start` with OTP/GPS proof | 30 days rolling                                         | `visits` (+ visit execution evidence)            |
| `avg_checklist_score`       | Average `completeness_score` for submitted/approved checklist instances                             | 30 days rolling                                         | `checklist_instances`                            |
| `avg_lead_response_hours`   | Average hours from assignment to first action/status change                                         | 30 days rolling                                         | `leads` + `audit_logs`                           |
| `doc_completion_rate_pct`   | `(required_docs_collected / required_docs_total) * 100` for the closure                             | Closure-scoped                                          | `document_requirements` + `items[]`              |
| `customer_satisfaction_avg` | Mean CSAT from tenant/owner feedback; before feedback module, use admin-entered score               | 30 days rolling (or latest manual)                      | Future feedback table or manual admin score      |
| `no_show_count_30d`         | Count of visits with `status = NO_SHOW`                                                             | 30 days rolling                                         | `visits`                                         |
| `late_doc_rate_pct`         | `%` of documents where `collected_at - requirement_created_at > SLA` (default SLA = 48h)            | 30 days rolling                                         | `document_requirements` + `items[]`              |

Implementation notes:

- When <30 days of history exists, use available data and set `limited_data = true` in modifier explanations.
- Metric calculations are deterministic and fully reproducible from the stored `config_snapshot` + source records.

- `config_snapshot` must include both active `config_version` values and the resolved modifier template payload serialized at publish time.
- Replay/debug paths must use `config_snapshot` only; do not re-resolve current live modifier templates.

---

## 6. Transparency Card (OPS-Facing UI)

```text
┌─────────────────────────────────────────────────────────┐
│  Your Commission Rate This Month                        │
│                                                         │
│  Base Rate                              15.00%          │
│  BPS Modifiers                                           │
│  + Document Speed (avg 18h)             +0.50%    ✅    │
│  + Visit Punctuality (97%)              +0.75%    ✅    │
│  - No Shows (1 this month)               0.00%    —     │
│  Effective BPS Rate                      16.25%         │
│                                                         │
│  Flat Modifiers                                          │
│  + Weekend Slot Bonus                    +₹150     ✅    │
│  + Own Vehicle Allowance                 +₹250     ✅    │
│  Flat Bonus Total                        +₹400          │
│  ─────────────────────────────────────────────────      │
│  Final Commission                         ₹2,350         │
│                                                         │
│  Applied to deal profit: ₹12,000                        │
│  Formula: floor(₹12,000 × 16.25%) + ₹400               │
└─────────────────────────────────────────────────────────┘
```

Card behavior:

- Every line item is driven by `modifier_breakdown` from the latest evaluation.
- OPS can tap a line for details: metric formula, threshold, sampled records, and timestamp.
- A warning banner appears when `limited_data = true`.

---

## 7. AI-Agent Optimization

The commission config includes machine-readable parameter bounds so an optimization agent can propose safe changes without violating business guardrails.

Example `optimizer_bounds` item:

```json
{
  "parameter_id": "DOC_SPEED.threshold",
  "json_path": "commission.modifiers[0].threshold",
  "type": "number",
  "current": 24,
  "min": 4,
  "max": 72,
  "step": 1,
  "unit": "hours",
  "guardrail": "Must be > 0"
}
```

Field meanings:

- `parameter_id`: stable identifier for experiments and audit trail
- `json_path`: exact path to mutate inside config JSON
- `min/max/step`: legal search space for simulation
- `guardrail`: human-readable invariant checked before publish

Planned workflow:

1. Agent loads historical deals + active config
2. Agent runs simulation sweeps within `optimizer_bounds`
3. Agent proposes a draft config version with projected deltas
4. Admin reviews impact and publishes explicitly

---

## 8. Admin Settings UI (Commission Tab)

```text
+----------------------------------------------------------------------------------+
| Settings > Incentive V3 > Commission                                             |
+----------------------------------------------------------------------------------+
| Base rate defaults                                                               |
|   Default base rate: [1500] bps   Floor: [1500] bps   Ceiling: [2200] bps       |
|   Profit source: (•) deal_economics   ( ) closure_proxy                          |
|                                                                                  |
| Modifier Rules                                                                    |
| [Enabled] [Code]              [Metric]                    [Rule] [Threshold] [Δ] |
| [x]       DOC_SPEED           avg_doc_processing_hours    <=     24h        +50  |
| [x]       VISIT_PUNCTUALITY   on_time_visit_rate_pct      >=     95%        +75  |
| [x]       CHECKLIST_QUALITY   avg_checklist_score         >=     90         +50  |
| [x]       NO_SHOW_PENALTY     no_show_count_30d           >=     2         -100  |
|                                    [Add Modifier] [Duplicate] [Disable]          |
|                                                                                  |
| Optimizer Bounds                                                                  |
| DOC_SPEED.threshold: min 4h | max 72h | step 1h | guardrail: Must be > 0         |
| [Edit Bounds JSON]                                                             |
|                                                                                  |
| Simulation                                                                        |
| Closure ID [____________________] [Run Simulation]                               |
| Result: Effective rate 17.00% | Pool ₹2,040 | Delta vs live +₹180               |
|                                                                                  |
| [Save Draft Version]   [Publish Version]   [Rollback to Previous]                |
+----------------------------------------------------------------------------------+
```

---

## 9. Schema

> **Schema**: See [Incentive v3 Overview §Schema](24-incentive-v3-overview.md#schema) for the canonical `deal_commission_evaluations` definition.

> **Schema**: See [Incentive v3 Overview §Schema](24-incentive-v3-overview.md#schema) for the canonical `commission_modifier_templates` definition.

---

## 10. Convex Functions

```ts
commissionEngine.evaluate({ closure_id })
// Internal mutation.
// Trigger: closure confirmation.
// Computes and persists deal_commission_evaluations.

commissionEngine.getEvaluation({ closure_id })
// Query for admin/ops viewing.
// Returns latest non-deleted evaluation + modifier breakdown.

commissionEngine.getMyCommissionBreakdown()
// OPS-facing query.
// Returns current period effective rate, modifier summary, and recent evaluations.

commissionEngine.simulateEvaluation({ closure_id, config_version? })
// Query.
// Dry-run mode using specified config version or live config.
// No DB write.
```

---

## 11. Edge Cases

- No `incentive_actor_profile` for OPS actor -> use global defaults from active config.
- Deal has no realized profit (or negative profit) -> BPS component is `0`; final pool still clamps to non-negative after flat modifiers.
- All modifiers disabled -> `effective_rate_bps = commission_base_bps` (still clamped) and `flat_bonus_paise = 0`.
- OPS actor has less than 30 days of records -> evaluate on available data and set explanation flag `limited_data = true`.

---

## 12. Integration with Deal Economics

Primary source of truth for profit is the `commission_base_profit_paise` input sourced from confirmed deal economics.

Transitional behavior until full economics rollout:

- If `deal_economics` exists and is confirmed, use that as `commission_base_profit_paise`.
- Else use a closure proxy baseline for shadow/simulation compatibility.
- Persist the chosen base in `commission_base_profit_paise` and full config in `config_snapshot`.

The output `incentive_pool_paise` is consumed by [Multi-Contributor Attribution](26-multi-contributor-attribution.md), which performs actor-level splits.

---

## 13. Reporting Query Contracts

Required read-model queries for admin/reporting surfaces:

- `commissionEngine.listEvaluationsByWindow({ from_ts, to_ts, persona?, config_version?, cursor? })`
- `commissionEngine.getVarianceSummary({ from_ts, to_ts, group_by: "persona" | "modifier_code" | "config_version" })`
- `commissionEngine.getModifierHitRates({ from_ts, to_ts, persona? })`

All reporting queries must return pagination metadata and deterministic ordering (`computed_at desc`, tie-break `_id desc`).

---

## 14. Related Documents

- [Deal Economics](20-deal-economics.md) — provides `profit_ex_gst_paise`, the commission base for this engine
- [Incentive V2](22-incentive-v2.md) — predecessor incentive architecture and payout-adjustment patterns
- [Multi-Contributor Attribution](26-multi-contributor-attribution.md) — consumes `incentive_pool_paise` and splits it across contributors
- [Closure & Payouts](07-closure-and-payouts.md) — closure lifecycle trigger point for commission evaluation
- [Constants Reference](../13-constants-reference.md) — location for future Incentive V3 enums/config keys
