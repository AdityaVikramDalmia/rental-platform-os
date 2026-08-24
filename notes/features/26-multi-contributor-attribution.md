# Feature: Multi-Contributor Attribution

> **Priority**: Part of Incentive v3
> **Personas**: Guard, OPS, Sales, Admin (all contributors + admin override)
> **Dependencies**: Commission Engine (Feature 25), Closure pipeline, Visit pipeline, Lead pipeline

## 1. Purpose

Current payout attribution assumes a single contributor gets the full deal bounty. In practice, rental closures involve multiple contributors across discovery, verification, closure, and support. This feature captures contribution events and splits the commission pool fairly and transparently.

The pool source is [Dynamic Commission Engine](25-commission-engine.md): this feature does not decide total pool size, it decides how that pool is distributed.

---

## 2. Contribution Stages

| Stage          | Weight (default bps) | Who Typically | Description                                                   |
| -------------- | -------------------- | ------------- | ------------------------------------------------------------- |
| `DISCOVERY`    | `2500` (25%)         | Guard         | Vacancy discovery and lead submission                         |
| `VERIFICATION` | `3500` (35%)         | OPS           | First visit, checklist, media, verification workflow          |
| `CLOSURE`      | `2500` (25%)         | Sales/OPS     | Negotiation and paperwork that closes the deal                |
| `SUPPORT`      | `1500` (15%)         | Admin/OPS     | Verification calls, follow-up support, coordination, unblocks |

Rules:

- Stage weights are admin-configurable.
- Weight set must sum to exactly `10000 bps`.
- A config publish is rejected if weight sum is not exactly `10000`.
- FOLLOW_UP activities (post-closure support, tenant settling) are classified under the `SUPPORT` stage.

**Stage-First Allocation**: The profit pool is first divided into per-stage buckets using stage weights (e.g., `DISCOVERY` 25%, `VERIFICATION` 35%, `CLOSURE` 25%, `SUPPORT` 15%). Then, within each stage bucket, the amount is split among contributors based on their quality-weighted scores. This prevents a deal with many contributors in one stage from receiving more than that stage's intended allocation.

---

## 3. Contribution Logging

Contribution logging is event-driven and append-only. Each contribution is captured at the time the action happens:

- Lead submitted -> `DISCOVERY` contribution (`leads` source)
- Visit completed -> `VERIFICATION` contribution (`visits` source)
- Replacement visit completed -> `SUPPORT` contribution with `handoff_from_user_id`
- Closure confirmed -> `CLOSURE` contribution (log on confirmation only; do not log on closure creation because closure may be cancelled)
- Admin verification call -> `SUPPORT` contribution when lead is moved to `VERIFIED` by admin in owner verification flow (`audit_logs` source: `LEADS_UPDATE` by admin user)

Each contribution persists:

- actor (`actor_user_id`, persona)
- stage (`DISCOVERY` to `SUPPORT`)
- source entity (`source_entity_type`, `source_entity_id`)
- `quality_score_snapshot` (frozen at event time)
- `timeliness_score_snapshot` (frozen at event time)
- handoff metadata when applicable

---

## 4. Primary Algorithm: `STAGE_WEIGHTED_QUALITY_V1`

### Step 1: Gather Contributions

Load all non-voided `deal_contributions` for the closure.

Attribution reads config from the commission evaluation record for this closure (see [Config Pinning](24-incentive-v3-overview.md#source-of-truth-rule)), never from the active config directly.

### Step 2: Compute Stage Buckets (Fixed by Config)

```text
stage_bucket_paise = floor(pool_paise × stage_weight_bps / 10000)
```

Each stage gets a fixed bucket from the total pool. Contributor count does not change the stage's total allocation.

**Empty Stage Handling**: If a stage has zero contributors, its budget is redistributed proportionally to the remaining non-empty stages. For example, if `SUPPORT` (15%) has no contributors, the remaining 85% is rescaled: `DISCOVERY` gets `25/85 × 100 = 29.4%`, `VERIFICATION` gets `35/85 × 100 = 41.2%`, `CLOSURE` gets `25/85 × 100 = 29.4%`. The total always sums to 100% of the profit pool. If all stages are empty (no contributors at all), the entire pool is held in reserve (no disbursement created).

### Step 3: Split Within Stage by Quality-Weighted Units

```text
stage_actor_weight = contribution_units × quality_score
stage_weight_sum = Σ(stage_actor_weight for all actors in stage)
stage_actor_amount_floor = floor(stage_bucket_paise × stage_actor_weight / max(1, stage_weight_sum))
```

### Step 4: Aggregate per Actor Across Stages

```text
user_amount_paise_floor = Σ(stage_actor_amount_floor across all stages for actor)
```

### Step 5: Compute Display Share and Largest-Remainder Allocation

Display-share basis points:

```text
user_share_bps_display = floor(user_amount_paise_floor / max(1, pool_paise) × 10000)
```

Provisional paise split:

```text
sum_floor = Σ(user_amount_paise_floor)
remainder_paise = pool_paise - sum_floor
residue = exact_user_amount - floor(exact_user_amount)
```

Distribute `remainder_paise` one paise at a time by descending fractional residue from Step 5 until total equals pool.

Tie-break order for equal residue is deterministic: `(recipient_user_id asc, attribution_record_id asc)`.

---

## 5. Worked Example (Correct, Paise-Based)

Deal profit = `₹12,000` (`1,200,000 paise`), effective rate = `17.00%` (`1700 bps`)

```text
pool_paise = floor(1,200,000 × 1700 / 10000) = 204,000 paise (₹2,040.00)
```

Contribution set:

| Actor   | Stage          | Units | Quality | Raw Points | Adj Points |
| ------- | -------------- | ----- | ------- | ---------- | ---------- |
| Guard A | `DISCOVERY`    | 1     | 72      | 2000       | 1440       |
| OPS B   | `VERIFICATION` | 1     | 85      | 3500       | 2975       |
| OPS C   | `SUPPORT`      | 1     | 78      | 1000       | 780        |
| Sales D | `CLOSURE`      | 1     | 90      | 2500       | 2250       |
| Admin E | `SUPPORT`      | 1     | 100     | 1000       | 1000       |

```text
total_adj_points = 1440 + 2975 + 780 + 2250 + 1000 = 8445
```

Provisional split before largest remainder:

| Actor   | Share % (from points) | Floor Amount (paise) | Floor Amount (INR) | Fractional Residue |
| ------- | --------------------- | -------------------- | ------------------ | ------------------ |
| Guard A | 17.0515%              | 34,785               | ₹347.85            | 0.0799             |
| OPS B   | 35.2279%              | 71,865               | ₹718.65            | 0.0089             |
| OPS C   | 9.2362%               | 18,841               | ₹188.41            | 0.9183             |
| Sales D | 26.6430%              | 54,351               | ₹543.51            | 0.6874             |
| Admin E | 11.8413%              | 24,156               | ₹241.56            | 0.3055             |

```text
sum_floor = 203,998 paise
remainder = 204,000 - 203,998 = 2 paise
```

Largest residues are OPS C then Sales D, so +1 paise each:

| Actor   | Final Amount (paise) | Final Amount (INR) |
| ------- | -------------------- | ------------------ |
| Guard A | 34,785               | ₹347.85            |
| OPS B   | 71,865               | ₹718.65            |
| OPS C   | 18,842               | ₹188.42            |
| Sales D | 54,352               | ₹543.52            |
| Admin E | 24,156               | ₹241.56            |

```text
Final total = 34,785 + 71,865 + 18,842 + 54,352 + 24,156 = 204,000 paise (₹2,040.00)
```

---

## 6. Handoff Tracking

When OPS Agent B is replaced by OPS Agent C:

- B's completed `VERIFICATION` contribution stays immutable.
- C gets a new `SUPPORT` contribution with `handoff_from_user_id = B`.
- Both remain eligible for split based on stage weight and quality snapshots.
- Handoff reason is mandatory and persisted for audit (`handoff_reason`).

This avoids all-or-nothing reassignment and preserves the true history of execution.

---

## 7. Fallback Algorithm: `SHAPLEY_DISPUTE_V1`

`SHAPLEY_DISPUTE_V1` is only used when an admin disputes an attribution record.

Execution model:

- Triggered by admin action (`DISPUTED` status)
- Computed in Convex Action (can run heavier leave-one-out simulations)
- For each actor, estimate counterfactual deal value without that actor
- Convert marginal contribution estimates to split amounts
- Persist as a new attribution record version linked to the disputed one

Admin may still override manually after reviewing the Shapley suggestion.

---

## 8. Attribution Status Lifecycle

```text
PROVISIONAL -> FINAL (auto on closure confirmation)
FINAL -> DISPUTED (admin flags dispute)
DISPUTED -> RESOLVED (admin accepts recompute or applies manual override with reason)
```

Lifecycle notes:

- `PROVISIONAL` is system-generated as contributions accumulate pre-confirmation.
- `FINAL` freezes automatic computation output.
- `DISPUTED` opens re-compute/override workflow.
- `RESOLVED` is terminal for the active record version.

---

## 9. Schema

> **Schema**: See [Incentive v3 Overview §Schema](24-incentive-v3-overview.md#schema) for the canonical `deal_contributions` definition.

> **Schema**: See [Incentive v3 Overview §Schema](24-incentive-v3-overview.md#schema) for the canonical `attribution_records` definition.

> **Schema**: See [Incentive v3 Overview §Schema](24-incentive-v3-overview.md#schema) for the canonical `attribution_splits` definition.

Schema contract note:

- Keep field names aligned with the canonical V3 lifecycle in `24-incentive-v3-overview.md`.
- Additional computed/debug fields are allowed only if they are additive and do not rename canonical fields used by downstream modules.

---

## 10. Convex Functions

```ts
attribution.logContribution({ closure_id, actor, stage, ... })
// Internal mutation.
// Append-only contribution logging from lead/visit/closure/admin events.

attribution.computeAttribution({ closure_id })
// Internal mutation.
// Triggered after commissionEngine.evaluate succeeds.
// Creates attribution_records + attribution_splits.

attribution.getAttribution({ closure_id })
// Query for admin viewing.
// Returns latest active attribution record with split table and audit metadata.

attribution.disputeAttribution({ attribution_record_id, reason })
// Admin mutation.
// Moves record FINAL -> DISPUTED and triggers SHAPLEY_DISPUTE_V1 action.

attribution.overrideAttribution({ attribution_record_id, manual_splits, reason })
// Admin mutation.
// Resolves DISPUTED record with explicit manual split and reason.

attribution.getMyEarnings({ period? })
// User-facing query.
// Returns actor-level split earnings across attribution_splits for the period.
```

---

## 11. Anti-Gaming

- Contributions are append-only; no in-place edits of historical events.
- `quality_score_snapshot` is frozen at contribution time (no retroactive quality gaming).
- Admin can void individual contributions, but only through explicit void metadata (`voided_reason`, `voided_by_admin_id`, `voided_at`).
- Minimum quality threshold is configurable (default: `30`); contributions below threshold are ignored during computation.

---

## 12. Integration

Data flow:

- Reads from: `deal_commission_evaluations` (`incentive_pool_paise`, `effective_rate_bps`)
- Writes to: `attribution_records` + `attribution_splits` then downstream `incentive_disbursements`

Event triggers:

- `lead.submit` -> log `DISCOVERY`
- `visit.complete` -> log `VERIFICATION` or `SUPPORT` (follow-up work is classified under `SUPPORT`)
- `closure.confirm` -> log `CLOSURE` and finalize attribution (no `closure.create` trigger)
- Admin lead verification in owner verification flow -> log `SUPPORT` from `audit_logs` (`LEADS_UPDATE` by admin user)

This module is downstream of [Dynamic Commission Engine](25-commission-engine.md) and upstream of payout/disbursement execution.

---

## 13. Reporting Query Contracts

Required read-model queries for attribution reporting:

- `attribution.listByWindow({ from_ts, to_ts, status?, persona?, cursor? })`
- `attribution.getClosureBreakdown({ closure_id })`
- `attribution.getDisputeQueue({ status: "DISPUTED" | "RESOLVED", cursor? })`
- `attribution.getSplitDistributionSummary({ from_ts, to_ts, group_by: "persona" | "stage" | "algorithm" })`

All query outputs must preserve exact paise sums and include `config_version` + `algorithm_version` for audit replay.

---

## 14. Related Documents

- [Dynamic Commission Engine](25-commission-engine.md) — computes pool size consumed by this attribution model
- [Deal Economics](20-deal-economics.md) — provides profit base for commission pool calculation
- [Incentive V2](22-incentive-v2.md) — prior payout-adjustment model and guard-facing earnings context
- [Visit Management](06-visit-management.md) — source events for `VERIFICATION` and `SUPPORT`
- [Lead Pipeline](03-lead-pipeline.md) — source events for `DISCOVERY`
- [Closure & Payouts](07-closure-and-payouts.md) — closure trigger and payout integration boundary
