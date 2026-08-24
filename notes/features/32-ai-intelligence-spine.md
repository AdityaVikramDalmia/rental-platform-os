# Feature: AI Intelligence Spine

> **Priority**: #40 in implementation order
> **Personas**: Admin, OPS, Guard, Tenant
> **Dependencies**: P33 (Trust & Verification Display), P12 (Analytics)
> **Route Groups**: `(admin)/`, `(guard)/`, `(public)/`
> **External Integration**: OpenAI API (`gpt-4o-mini`)

## Overview

Phase 40 adds a production-safe intelligence layer with five modules:

1. Fair Rent Calculator (`/tools/fair-rent`)
2. Lead Conversion Score (admin lead queue)
3. Fraud Risk Score + Appeals (admin risk queue)
4. AI Photo Quality Gate (guard listing uploads)
5. Vacancy Heartbeat (public listing freshness + admin trust operations)

This phase is assistive, not autonomous. Every AI output is explainable, auditable, overrideable, and bounded by budget/rate limits.

## Hard Rules

1. Money is integer paise only.
2. Timestamps are Unix milliseconds only.
3. External AI calls only from Convex Actions under `convex/actions/`.
4. Every AI output stores `model_version`, `confidence_score`, `computed_at`.
5. AI failures never block core workflows; fallback behavior is mandatory per module.

---

## Shared Architecture

```
domain data (leads, listings, closures, visits, photos, fingerprints)
  -> feature extraction (queries/internal mutations)
  -> scoring/action calls (rules + OpenAI actions)
  -> persisted AI artifacts (tables below)
  -> admin/public queries + notifications + analytics snapshots
```

### Action Runtime Policy

### Model Configuration

Default runtime (lead scoring and fraud checks):

| Parameter       | Value                                            |
| --------------- | ------------------------------------------------ |
| model           | gpt-4o-mini                                      |
| temperature     | 0.1 (deterministic, reproducible scoring)        |
| max_tokens      | 1024 (sufficient for structured JSON response)   |
| response_format | { type: "json_schema", json_schema: {...} }      |
| timeout         | 30000ms per request                              |
| retry           | 3 attempts with exponential backoff (1s, 2s, 4s) |

Module overrides:

| Module             | temperature | max_tokens                         |
| ------------------ | ----------- | ---------------------------------- |
| Rent estimation    | 0.3         | 2048 (market comparison narrative) |
| Photo quality gate | 0.2         | 512                                |

- Final failure policy: module-specific fallback (defined in this document)

---

## Configuration Keys (`system_config`)

All keys are required in this phase unless marked optional.

| Key                            | Type   | Default         | Purpose                                             |
| ------------------------------ | ------ | --------------- | --------------------------------------------------- |
| `ai_model`                     | string | `"gpt-4o-mini"` | Global AI model for P40 actions                     |
| `ai_timeout_ms`                | number | `30000`         | Max single provider call duration                   |
| `ai_max_retries`               | number | `3`             | Retry cap for provider failures                     |
| `ai_retry_backoff_ms`          | number | `1000`          | Base backoff; retries use 1x/2x/4x                  |
| `ai_rent_confidence_threshold` | number | `0.7`           | UI trust threshold for fair-rent output             |
| `ai_photo_accept_threshold`    | number | `4`             | Photo auto-accept minimum score                     |
| `ai_photo_warn_threshold`      | number | `2`             | Photo warning threshold; <=2 requires retake/review |
| `ai_daily_budget_cents`        | number | `5000`          | Hard budget cap for all AI calls per UTC day        |
| `ai_cost_warn_pct`             | number | `80`            | Warn threshold for daily spend alerting             |
| `ai_cost_critical_pct`         | number | `95`            | Critical threshold for daily spend alerting         |
| `ai_cache_ttl_ms`              | number | `86400000`      | Rent estimate cache TTL                             |
| `ai_fraud_alert_threshold`     | number | `60`            | Fraud alert threshold                               |
| `ai_fraud_block_threshold`     | number | `80`            | Fraud block threshold                               |
| `ai_lead_band_hot_min`         | number | `80`            | P41 contract score gate                             |
| `ai_lead_band_warm_min`        | number | `50`            | P41 contract score gate                             |
| `ai_lead_band_cool_min`        | number | `20`            | P41 contract score gate                             |
| `ai_vacancy_fresh_days`        | number | `3`             | P33 freshness threshold                             |
| `ai_vacancy_aging_days`        | number | `10`            | P33 freshness threshold                             |
| `ai_vacancy_uncertain_days`    | number | `30`            | AI vacancy prediction uncertain threshold           |
| `ai_vacancy_stale_days`        | number | `90`            | AI vacancy prediction stale threshold               |
| `ai_batch_size`                | number | `50`            | Leads processed per batch invocation                |
| `ai_batch_concurrency`         | number | `5`             | Parallel provider calls per batch                   |

Vacancy key split is intentional: `ai_vacancy_fresh_days`/`ai_vacancy_aging_days` drive P33 display freshness states (`FRESH`/`AGING`/`STALE`), while `ai_vacancy_uncertain_days`/`ai_vacancy_stale_days` drive AI vacancy prediction recency (`VACANT`/`OCCUPIED`/`UNCERTAIN`) and stale-inference fallback behavior.

---

## Permission Model (`ai.*`)

| Permission          | Meaning                                           | Super Admin | Ops Agent | Guard | Tenant |
| ------------------- | ------------------------------------------------- | ----------- | --------- | ----- | ------ |
| `ai.view`           | View AI scores, bands, explainability payloads    | yes         | yes       | no    | no     |
| `ai.recompute`      | Trigger manual recompute jobs                     | yes         | yes       | no    | no     |
| `ai.override`       | Override AI decisions and publish manual outcomes | yes         | no        | no    | no     |
| `ai.review_pending` | Review pending photo/fraud items                  | yes         | yes       | no    | no     |
| `ai.configure`      | Modify `ai_*` config keys                         | yes         | no        | no    | no     |

---

## Canonical Enums

### Lead Conversion Bands

- `HOT` (`>= 80`)
- `WARM` (`50-79`)
- `COOL` (`20-49`)
- `COLD` (`< 20`)

### Fraud Risk Levels (AI output domain)

- `WATCH`
- `ALERT`
- `BLOCK`

Note: `CLEAR` is NOT a fraud risk level. A lead with no fraud signals simply has no `ai_fraud_signals` record. The absence of a record means clean/clear.

### Admin Flag States (ops workflow domain)

- `NONE`
- `ALERTED`
- `AUTO_FLAGGED`
- `UNDER_APPEAL`
- `RESOLVED`

### Photo Quality Status (standardized)

- `ACCEPTED`
- `PENDING_REVIEW`
- `RETAKE_REQUIRED`
- `REJECTED`

### Vacancy Heartbeat Sources (canonical)

- `GUARD_REPORT`
- `OWNER_CONFIRMATION`
- `OPS_VERIFICATION`
- `SYSTEM_INFERENCE`

Source precedence for conflicts: `OWNER_CONFIRMATION > OPS_VERIFICATION > GUARD_REPORT > SYSTEM_INFERENCE`.

Note: Listing freshness states (`FRESH`, `AGING`, `STALE` from P33) are distinct from AI vacancy predictions (`VACANT`, `OCCUPIED`, `UNCERTAIN`). Fraud risk levels (`WATCH`, `ALERT`, `BLOCK`) are distinct from admin flag states (`ALERTED`, `AUTO_FLAGGED` from P11). These are separate enum domains with no conflict.

### Fraud Appeal Lifecycle

- `SUBMITTED -> UNDER_REVIEW -> UPHELD` or `OVERTURNED`

### Photo Room Taxonomy

- `BEDROOM`
- `LIVING_ROOM`
- `KITCHEN`
- `BATHROOM`
- `BALCONY`
- `EXTERIOR`
- `OTHER`

---

## Data Model and Validators

### Canonical Table Names

> Use these names consistently across Phase 40 docs and implementation:
>
> - `ai_rent_estimates`
> - `ai_lead_scores`
> - `ai_fraud_signals`
> - `fraud_appeals`
> - `ai_photo_analyses`
> - `ai_usage_tracking`
> - `ai_model_configs`
> - `vacancy_heartbeats`

### Migration Note

Original gap analysis referenced `ai_scoring_results`, `ai_fraud_signals`, and `ai_model_configs` as table names. Canonical names are `ai_lead_scores`, `ai_fraud_signals`, `ai_photo_analyses`, `ai_rent_estimates`, `ai_usage_tracking`, and `ai_model_configs`. Cross-cutting docs will be updated separately.

### New Table: `ai_rent_estimates`

```ts
defineTable({
  estimate_key: v.string(),
  society_id: v.id("societies"),
  building_id: v.optional(v.id("buildings")),
  bhk_type: v.string(),
  floor_number: v.number(),
  furnishing_type: v.string(),
  area_sqft: v.number(),
  amenities: v.array(v.string()),
  estimated_rent_paise: v.number(),
  comparable_range_low_paise: v.number(),
  comparable_range_high_paise: v.number(),
  confidence_score: v.number(), // 0-1
  factors: v.array(v.string()),
  data_points_used: v.number(),
  is_stale: v.boolean(),
  model_version: v.string(),
  computed_at: v.number(),
  expires_at: v.number(),
})
  .index("by_estimate_key", ["estimate_key"])
  .index("by_society_expires", ["society_id", "expires_at"])
  .index("by_expires", ["expires_at"]);
```

### New Table: `ai_lead_scores`

```ts
defineTable({
  lead_id: v.id("leads"),
  score: v.number(), // normalized 0-100
  band: v.union(v.literal("HOT"), v.literal("WARM"), v.literal("COOL"), v.literal("COLD")),
  confidence_score: v.number(), // 0-1
  fit_score: v.number(),
  engagement_score: v.number(),
  anti_score: v.number(),
  explainability_payload: v.object({
    top_positive_factors: v.array(v.string()),
    top_negative_factors: v.array(v.string()),
    factor_values: v.record(v.string(), v.number()),
  }),
  original_score: v.optional(v.number()),
  is_override: v.optional(v.boolean()),
  override_by: v.optional(v.id("users")),
  override_reason: v.optional(v.string()),
  model_version: v.string(),
  computed_at: v.number(),
  next_refresh_at: v.number(),
})
  .index("by_lead", ["lead_id"])
  .index("by_band_score", ["band", "score"])
  .index("by_next_refresh", ["next_refresh_at"]);
```

### New Table: `ai_fraud_signals`

```ts
defineTable({
  lead_id: v.id("leads"),
  score: v.number(), // 0-100
  confidence_score: v.number(), // 0-1
  duplicate_photo_score: v.number(),
  location_mismatch_score: v.number(),
  price_anomaly_score: v.number(),
  rapid_submissions_score: v.number(),
  fingerprint_dup_score: v.number(),
  info_inconsistency_score: v.number(),
  signal_flags: v.array(v.string()),
  explainability_payload: v.object({
    evidence_ids: v.array(v.string()),
    signal_breakdown: v.record(v.string(), v.number()),
  }),
  risk_level: v.union(v.literal("WATCH"), v.literal("ALERT"), v.literal("BLOCK")),
  risk_override: v.optional(v.union(v.literal("WATCH"), v.literal("ALERT"), v.literal("BLOCK"))),
  alert_state: v.union(
    v.literal("NONE"),
    v.literal("ALERTED"),
    v.literal("AUTO_FLAGGED"),
    v.literal("UNDER_APPEAL"),
    v.literal("RESOLVED"),
  ),
  model_version: v.string(),
  computed_at: v.number(),
})
  .index("by_lead", ["lead_id"])
  .index("by_alert_state", ["alert_state", "computed_at"])
  .index("by_score", ["score"]);
```

### New Table: `fraud_appeals`

```ts
defineTable({
  fraud_signal_id: v.id("ai_fraud_signals"),
  lead_id: v.id("leads"),
  submitted_by_user_id: v.id("users"),
  reason: v.string(),
  evidence_note: v.optional(v.string()),
  status: v.union(
    v.literal("SUBMITTED"),
    v.literal("UNDER_REVIEW"),
    v.literal("UPHELD"),
    v.literal("OVERTURNED"),
  ),
  reviewer_user_id: v.optional(v.id("users")),
  resolution_note: v.optional(v.string()),
  submitted_at: v.number(),
  reviewed_at: v.optional(v.number()),
})
  .index("by_lead", ["lead_id", "submitted_at"])
  .index("by_status", ["status", "submitted_at"])
  .index("by_fraud_signal", ["fraud_signal_id"]);
```

### New Table: `ai_photo_analyses`

```ts
defineTable({
  listing_photo_id: v.id("listing_photos"),
  image_hash: v.string(), // dHash, 64-bit hex (16 chars)
  hamming_nearest: v.optional(v.number()),
  is_near_duplicate: v.boolean(),
  quality_score: v.number(), // 1-5
  quality_confidence_score: v.number(), // 0-1
  quality_status: v.union(
    v.literal("ACCEPTED"),
    v.literal("PENDING_REVIEW"),
    v.literal("RETAKE_REQUIRED"),
    v.literal("REJECTED"),
  ),
  quality_defects: v.array(v.string()),
  quality_room_type: v.string(),
  quality_explainability_payload: v.record(v.string(), v.string()),
  model_version: v.string(),
  computed_at: v.number(),
})
  .index("by_listing_photo", ["listing_photo_id"])
  .index("by_image_hash", ["image_hash"])
  .index("by_quality_status", ["quality_status", "computed_at"]);
```

### New Table: `ai_usage_tracking`

```ts
defineTable({
  user_id: v.id("users"),
  action_type: v.union(
    v.literal("RENT_ESTIMATE"),
    v.literal("PHOTO_QUALITY"),
    v.literal("LEAD_SCORE"),
    v.literal("FRAUD_CHECK"),
  ),
  model: v.string(),
  input_tokens: v.number(),
  output_tokens: v.number(),
  cost_cents: v.number(),
  request_id: v.string(),
  created_at: v.number(),
})
  .index("by_created_at", ["created_at"])
  .index("by_action_created", ["action_type", "created_at"])
  .index("by_user_created", ["user_id", "created_at"]);
```

### New Table: `ai_model_configs`

```ts
defineTable({
  config_key: v.string(),
  model: v.string(),
  temperature: v.number(),
  max_tokens: v.number(),
  timeout_ms: v.number(),
  retry_attempts: v.number(),
  retry_backoff_ms: v.number(),
  response_schema_version: v.string(),
  is_active: v.boolean(),
  updated_by: v.id("users"),
  updated_at: v.number(),
})
  .index("by_config_key", ["config_key", "updated_at"])
  .index("by_active", ["is_active", "updated_at"]);
```

### New Table: `vacancy_heartbeats`

```ts
defineTable({
  listing_id: v.id("listings"),
  source: v.union(
    v.literal("GUARD_REPORT"),
    v.literal("OWNER_CONFIRMATION"),
    v.literal("OPS_VERIFICATION"),
    v.literal("SYSTEM_INFERENCE"),
  ),
  source_rank: v.number(),
  latest_confirmed_at: v.number(),
  freshness_status: v.union(v.literal("FRESH"), v.literal("AGING"), v.literal("STALE")),
  confidence_score: v.number(), // 0-1
  days_since_confirmation: v.number(),
  model_version: v.string(),
  computed_at: v.number(),
  updated_at: v.number(),
})
  .index("by_listing", ["listing_id"])
  .index("by_status_updated", ["freshness_status", "updated_at"])
  .index("by_latest_confirmed", ["latest_confirmed_at"]);
```

### Extension: `listing_photos`

```ts
// existing fields omitted
ai_photo_analysis_id: v.optional(v.id("ai_photo_analyses")),
quality_score: v.optional(v.number()), // 1-5
quality_confidence_score: v.optional(v.number()), // 0-1
quality_status: v.optional(
  v.union(
    v.literal("ACCEPTED"),
    v.literal("PENDING_REVIEW"),
    v.literal("RETAKE_REQUIRED"),
    v.literal("REJECTED")
  )
),
quality_defects: v.optional(v.array(v.string())),
quality_room_type: v.optional(v.string()),
quality_explainability_payload: v.optional(v.record(v.string(), v.string())),
quality_evaluated_at: v.optional(v.number()),
```

Image similarity uses dHash (difference hash). Implementation: `imghash` npm package or equivalent pure-JS implementation. Hamming distance threshold: `<= 5` means duplicate. Hashing runs server-side in Convex Action. Hash is stored as a hex string in `ai_photo_analyses.image_hash` (64-bit = 16 hex chars). Comparison uses bitwise XOR + popcount.

---

## Scoring Formulas

## 1) Lead Conversion Score

### Score Components

`FIT` (max 90)

- `location_fit`: 0-15
- `bhk_fit`: 0-20
- `budget_fit`: 0-20
- `furnishing_fit`: 0-10
- `availability_fit`: 0-15
- `amenity_fit`: 0-10

`ENGAGEMENT` (max 15)

- `profile`: 0-5
- `response_speed`: 0-3
- `visit_accept`: 0-5
- `repeat`: 0-2

`ANTI` (min -30)

- `no_show`: `-15`
- `late_cancel`: `-10`
- `low_review`: `-5`

### Raw Formula

```
raw_score = fit_total + engagement_total + anti_total
// range: -30 to 105
```

### Normalization Formula

```
normalized_score = round(clamp(((raw_score + 30) / 135) * 100, 0, 100))
```

### Bands

- `HOT`: `score >= 80`
- `WARM`: `50 <= score <= 79`
- `COOL`: `20 <= score <= 49`
- `COLD`: `score < 20`

## 2) Fraud Risk Score

### Signal Weights

- `duplicate_photo` (dHash Hamming <= 5): `+30`
- `location_mismatch`: `+20`
- `price_anomaly`: `+15`
- `rapid_submissions`: `+15`
- `fingerprint_dup`: `+10`
- `info_inconsistency`: `+10`

### Aggregation Formula

```
fraud_score =
  duplicate_photo_score +
  location_mismatch_score +
  price_anomaly_score +
  rapid_submissions_score +
  fingerprint_dup_score +
  info_inconsistency_score

fraud_score = clamp(fraud_score, 0, 100)
```

### Alerting

- `WATCH` when `fraud_score >= ai_fraud_alert_threshold` (default `60`)
- `BLOCK` when `fraud_score >= ai_fraud_block_threshold` (default `80`)
- `ALERT` is an admin-confirmed escalation state used for queue prioritization

---

## OpenAI Prompt Templates (verbatim)

These prompts are copied as implementation templates. Do not paraphrase inside code.

### Rent Estimation Prompt

```text
SYSTEM PROMPT (RENT ESTIMATION)
You are a rental valuation engine for Bangalore residential flats.
Given locality, BHK, furnishing, area, and amenities, estimate fair monthly rent in INR paise.
You must return strict JSON only.

Required output JSON keys:
- estimated_rent_paise (integer)
- confidence_score (number, 0 to 1)
- comparable_range_low_paise (integer)
- comparable_range_high_paise (integer)
- factors (string[])

Never include markdown or extra text.
```

```text
USER PROMPT TEMPLATE (RENT ESTIMATION)
locality: {{locality_name}}
building: {{building_name_or_null}}
bhk_type: {{bhk_type}}
furnishing_type: {{furnishing_type}}
area_sqft: {{area_sqft}}
floor_number: {{floor_number}}
amenities: {{amenities_csv}}
recent_comparables: {{comparables_json}}
```

### Photo Quality Prompt

```text
SYSTEM PROMPT (PHOTO QUALITY)
You are a residential listing photo quality evaluator.
Score each photo on 5 criteria: lighting, framing, resolution, content relevance, room identification.
Return strict JSON only.

Required output JSON keys:
- overall_score (integer 1-5)
- defects (string[])
- room_type (string)
- is_acceptable (boolean)

Defects examples: LOW_LIGHT, BLURRY, TILTED, NOT_PROPERTY, DUPLICATE_ROOM, OBSTRUCTED.
Never include markdown or extra text.
```

```text
USER PROMPT TEMPLATE (PHOTO QUALITY)
listing_id: {{listing_id}}
photo_context: {{photo_metadata_json}}
room_hints: {{room_hints_csv}}
```

### Structured Output Configuration

Use `response_format: { type: "json_schema" }` with strict schemas matching the keys above.

---

## Function/API Contracts (Convex)

All contracts below are required and intentionally explicit.

## Queries

### `aiRent.getEstimate`

```ts
args: {
  society_id: v.id("societies"),
  building_id: v.optional(v.id("buildings")),
  bhk_type: v.string(),
  floor_number: v.number(),
  furnishing_type: v.string(),
  area_sqft: v.number(),
  amenities: v.array(v.string()),
}
returns: {
  estimated_rent_paise: number,
  confidence_score: number,
  comparable_range_low_paise: number,
  comparable_range_high_paise: number,
  factors: string[],
  is_stale: boolean,
  model_version: string,
  computed_at: number,
}
```

### `aiLeadScores.getForLead`

```ts
args: { lead_id: v.id("leads") }
returns: {
  lead_id: Id<"leads">,
  score: number,
  band: "HOT" | "WARM" | "COOL" | "COLD",
  confidence_score: number,
  fit_score: number,
  engagement_score: number,
  anti_score: number,
  explainability_payload: {
    top_positive_factors: string[],
    top_negative_factors: string[],
    factor_values: Record<string, number>,
  },
  model_version: string,
  computed_at: number,
}
```

### `aiLeadScores.listTopPriority`

```ts
args: {
  limit: v.optional(v.number()),
  min_band: v.optional(v.union(v.literal("HOT"), v.literal("WARM"), v.literal("COOL"), v.literal("COLD"))),
}
returns: Array<{
  lead_id: Id<"leads">,
  score: number,
  band: "HOT" | "WARM" | "COOL" | "COLD",
  confidence_score: number,
  computed_at: number,
}>
```

### `aiFraudSignals.getForLead`

```ts
args: { lead_id: v.id("leads") }
returns: {
  lead_id: Id<"leads">,
  score: number,
  confidence_score: number,
  risk_level: "WATCH" | "ALERT" | "BLOCK",
  risk_override?: "WATCH" | "ALERT" | "BLOCK",
  alert_state: "NONE" | "ALERTED" | "AUTO_FLAGGED" | "UNDER_APPEAL" | "RESOLVED",
  signal_flags: string[],
  explainability_payload: {
    evidence_ids: string[],
    signal_breakdown: Record<string, number>,
  },
  model_version: string,
  computed_at: number,
}
```

### `aiFraudSignals.listAlerts`

```ts
args: {
  min_score: v.optional(v.number()),
  paginationOpts: paginationOptsValidator,
}
returns: {
  page: Array<{
    lead_id: Id<"leads">,
    score: number,
    risk_level: "WATCH" | "ALERT" | "BLOCK",
    alert_state: "ALERTED" | "AUTO_FLAGGED" | "UNDER_APPEAL",
    confidence_score: number,
    computed_at: number,
  }>,
  isDone: boolean,
  continueCursor: string,
}
```

### `vacancyHeartbeat.getForListing`

```ts
args: { listing_id: v.id("listings") }
returns: {
  listing_id: Id<"listings">,
  source: "GUARD_REPORT" | "OWNER_CONFIRMATION" | "OPS_VERIFICATION" | "SYSTEM_INFERENCE",
  latest_confirmed_at: number,
  freshness_status: "FRESH" | "AGING" | "STALE",
  days_since_confirmation: number,
  confidence_score: number,
  model_version: string,
  computed_at: number,
}
```

## Mutations

### `aiRent.requestEstimateRefresh`

```ts
args: {
  society_id: v.id("societies"),
  building_id: v.optional(v.id("buildings")),
  bhk_type: v.string(),
  floor_number: v.number(),
  furnishing_type: v.string(),
  area_sqft: v.number(),
  amenities: v.array(v.string()),
}
returns: {
  request_id: string,
  queued: boolean,
}
```

### `aiLeadScores.recomputeForLead`

```ts
args: { lead_id: v.id("leads") }
returns: {
  lead_id: Id<"leads">,
  score: number,
  band: "HOT" | "WARM" | "COOL" | "COLD",
  confidence_score: number,
  computed_at: number,
}
```

### `aiFraudSignals.recomputeForLead`

```ts
args: { lead_id: v.id("leads") }
returns: {
  lead_id: Id<"leads">,
  score: number,
  risk_level: "WATCH" | "ALERT" | "BLOCK",
  alert_state: "NONE" | "ALERTED" | "AUTO_FLAGGED" | "UNDER_APPEAL" | "RESOLVED",
  confidence_score: number,
  computed_at: number,
}
```

### `aiLeadScores.adminOverride`

Requires permission: `ai.override`.

```ts
args: {
  leadId: v.id("leads"),
  overrideScore: v.number(),
  overrideBand: v.union(v.literal("HOT"), v.literal("WARM"), v.literal("COOL"), v.literal("COLD")),
  reason: v.string(),
}
returns: {
  lead_id: Id<"leads">,
  score: number,
  band: "HOT" | "WARM" | "COOL" | "COLD",
  is_override: true,
  original_score: number,
  override_by: Id<"users">,
  override_reason: string,
  computed_at: number,
}
```

Behavior: creates a new `ai_lead_scores` row with `is_override: true`, `override_by`, and `override_reason`; original AI score remains preserved in `original_score`.

### `aiFraudSignals.adminOverride`

Requires permission: `ai.override`.

```ts
args: {
  leadId: v.id("leads"),
  overrideRiskLevel: v.union(v.literal("WATCH"), v.literal("ALERT"), v.literal("BLOCK")),
  reason: v.string(),
}
returns: {
  lead_id: Id<"leads">,
  risk_level: "WATCH" | "ALERT" | "BLOCK",
  risk_override: "WATCH" | "ALERT" | "BLOCK",
  override_by: Id<"users">,
  override_reason: string,
  computed_at: number,
}
```

Behavior: sets `risk_override` on the latest `ai_fraud_signals` record for the lead while preserving original model output.

All overrides must log to audit trail with action `ai.score_overridden`.

### `aiFraudSignals.submitAppeal`

```ts
args: {
  fraud_signal_id: v.id("ai_fraud_signals"),
  lead_id: v.id("leads"),
  reason: v.string(),
  evidence_note: v.optional(v.string()),
}
returns: {
  appeal_id: Id<"fraud_appeals">,
  status: "SUBMITTED",
  submitted_at: number,
}
```

### `aiFraudSignals.updateAppealStatus`

```ts
args: {
  appeal_id: v.id("fraud_appeals"),
  status: v.union(v.literal("UNDER_REVIEW"), v.literal("UPHELD"), v.literal("OVERTURNED")),
  resolution_note: v.optional(v.string()),
}
returns: {
  appeal_id: Id<"fraud_appeals">,
  status: "UNDER_REVIEW" | "UPHELD" | "OVERTURNED",
  reviewed_at: number,
}
```

### `photos.applyQualityResult`

```ts
args: {
  listing_photo_id: v.id("listing_photos"),
  quality_score: v.number(),
  quality_confidence_score: v.number(),
  quality_status: v.union(
    v.literal("ACCEPTED"),
    v.literal("PENDING_REVIEW"),
    v.literal("RETAKE_REQUIRED"),
    v.literal("REJECTED")
  ),
  quality_defects: v.array(v.string()),
  quality_room_type: v.string(),
  quality_explainability_payload: v.record(v.string(), v.string()),
}
returns: {
  listing_photo_id: Id<"listing_photos">,
  quality_status: "ACCEPTED" | "PENDING_REVIEW" | "RETAKE_REQUIRED" | "REJECTED",
  quality_evaluated_at: number,
}
```

### `vacancyHeartbeat.record`

```ts
args: {
  listing_id: v.id("listings"),
  source: v.union(
    v.literal("GUARD_REPORT"),
    v.literal("OWNER_CONFIRMATION"),
    v.literal("OPS_VERIFICATION"),
    v.literal("SYSTEM_INFERENCE")
  ),
  confirmed_at: v.number(),
}
returns: {
  listing_id: Id<"listings">,
  freshness_status: "FRESH" | "AGING" | "STALE",
  latest_confirmed_at: number,
  confidence_score: number,
}
```

## Actions

### `actions/aiRent.estimateRent`

```ts
args: {
  request_id: v.string(),
  estimate_key: v.string(),
  locality_context: v.string(),
  comparables_json: v.string(),
}
returns: {
  estimated_rent_paise: number,
  confidence_score: number,
  comparable_range_low_paise: number,
  comparable_range_high_paise: number,
  factors: string[],
  input_tokens: number,
  output_tokens: number,
  cost_cents: number,
}
```

### `actions/aiPhoto.evaluatePhotoQuality`

```ts
args: {
  request_id: v.string(),
  listing_photo_id: v.id("listing_photos"),
  storage_id: v.id("_storage"),
  room_hints: v.array(v.string()),
}
returns: {
  overall_score: number,
  defects: string[],
  room_type: string,
  is_acceptable: boolean,
  input_tokens: number,
  output_tokens: number,
  cost_cents: number,
}
```

### `actions/aiBatch.recomputeLeadScores`

```ts
args: { run_key: v.string() }
returns: {
  processed: number,
  failed: number,
  started_at: number,
  finished_at: number,
}
```

### `actions/aiBatch.recomputeFraudRisk`

```ts
args: { run_key: v.string() }
returns: {
  processed: number,
  failed: number,
  started_at: number,
  finished_at: number,
}
```

---

## Cost Governance and Budget Control

### Daily Budget Gate

1. Before every OpenAI call, compute today's UTC spend from `ai_usage_tracking`.
2. If `sum(cost_cents) >= ai_daily_budget_cents`, deny new call.
3. Denied calls use module fallback immediately.

### Usage Tracking Write

Each successful or failed provider call must write one `ai_usage_tracking` row with tokens/cost and `request_id`.

### Cost Formula

Use provider response token counters and configured per-model pricing. `gpt-4o-mini` baseline target is approximately `$0.002` per request for normal payload sizes.

### Cost Alerting

Three alert levels:

1. `WARN` at `80%` of `ai_daily_budget_cents` -> `IN_APP` notification to admins.
2. `CRITICAL` at `95%` -> `IN_APP` + `EMAIL` to admins.
3. `HARD_STOP` at `100%` -> all non-critical AI calls blocked, `IN_APP` + `EMAIL` + `SMS` to super admins.

Alert check runs on every AI Action invocation (single read of daily spend counter). Config keys: `ai_cost_warn_pct` (`80`), `ai_cost_critical_pct` (`95`).

---

## Rate Limiting

Use `@convex-dev/rate-limiter` with keys below.

- `ai:rent_estimate`: `20/min` per user
- `ai:photo_quality`: `50/min` per listing
- `ai:lead_score`: `100/min` global

---

## AI Analytics Dashboard Spec

Admin page: `/admin/ai-analytics`.

Widgets:

1. Daily spend chart (line, 30d) with budget line overlay.
2. Request volume by endpoint (bar, 7d).
3. Avg latency by model (table).
4. Score distribution histogram (lead scores, fraud scores).
5. Override rate (% of AI decisions overridden by admin).

Data source: `ai_usage_tracking` table. Filters: time window (`7d`/`30d`/`90d`), model, endpoint. Query: `aiAnalytics.getDashboard(timeWindow)`. Cross-link: P12 analytics patterns.

---

## Fallback Behavior and Retries

Retry policy for all AI actions:

- Attempt 1: immediate
- Attempt 2: `+1000ms`
- Attempt 3: `+2000ms`
- Attempt 4: `+4000ms`
- Stop after max 3 retries (4 total attempts)

Final fallback by module:

- Rent: return cached result; if expired, return stale with `is_stale: true`
- Photo quality: set `quality_status = PENDING_REVIEW` and queue manual review
- Lead score: compute and persist rule-based score only (no AI enhancement)
- Fraud: persist `WATCH` risk level with `ALERTED` admin flag and manual review required

---

## Duplicate Photo Detection Contract

1. Generate dHash (`image_hash`) for every uploaded photo in action layer.
2. Compare against photos in same listing and same building.
3. Hamming distance `<= 5` marks duplicate signal.
4. Persist fraud evidence link in `ai_fraud_signals.explainability_payload.evidence_ids`.
5. Emit notification event for admin review when duplicate contributes to threshold crossing.

---

## Vacancy Heartbeat Contract

Canonical sources:

- `GUARD_REPORT`
- `OWNER_CONFIRMATION`
- `OPS_VERIFICATION`
- `SYSTEM_INFERENCE`

Conflict resolution:

1. Higher source precedence wins.
2. If same source, latest `confirmed_at` wins.
3. Status mapping uses P33 thresholds:
   - `FRESH`: `0..ai_vacancy_fresh_days`
   - `AGING`: `(ai_vacancy_fresh_days + 1)..ai_vacancy_aging_days`
   - `STALE`: `> ai_vacancy_aging_days`

---

## Audit Action Coverage

Add constants and trigger coverage for:

- `AI_RENT_ESTIMATE_REQUESTED`
- `AI_RENT_ESTIMATE_COMPUTED`
- `AI_RENT_ESTIMATE_FALLBACK_USED`
- `AI_LEAD_SCORE_COMPUTED`
- `AI_LEAD_SCORE_RECOMPUTED`
- `AI_FRAUD_SCORE_COMPUTED`
- `AI_FRAUD_ALERT_TRIGGERED`
- `AI_FRAUD_AUTO_FLAGGED`
- `AI_FRAUD_APPEAL_SUBMITTED`
- `AI_FRAUD_APPEAL_RESOLVED`
- `AI_PHOTO_QUALITY_EVALUATED`
- `AI_PHOTO_QUALITY_PENDING_REVIEW`
- `AI_PHOTO_QUALITY_OVERRIDDEN`
- `AI_SCORE_OVERRIDDEN`
- `AI_VACANCY_HEARTBEAT_RECORDED`
- `AI_CONFIG_UPDATED`

---

## Cron Cadence (exact)

- `ai_lead_scoring_batch`: every `4` hours, `50` leads per run (`ai_batch_size`), `5` concurrent provider calls (`ai_batch_concurrency`)
- `recomputeLeadScores`: daily at `02:00` UTC
- `recomputeFraudRisk`: daily at `03:00` UTC
- `vacancyHeartbeat`: every `6` hours

### Batch Processing

Cron `ai_lead_scoring_batch` runs every 4 hours. Batch size is `50` leads per invocation (`ai_batch_size`). Concurrency is `5` parallel OpenAI calls (`ai_batch_concurrency`). Backpressure rule: if previous batch is still running (checked via `ai_usage_tracking` last entry), skip invocation. Timeout: `120s` per batch total.

---

## Cross-Phase Contracts

## P40 -> P41 (Supply Quality Gates)

Export score object contract:

```ts
{
  score: number,
  band: "HOT" | "WARM" | "COOL" | "COLD",
  confidence: number,
  model_version: string,
}
```

P41 consumes band thresholds from config keys `ai_lead_band_hot_min`, `ai_lead_band_warm_min`, `ai_lead_band_cool_min`.

## P40 -> P33 (Trust Freshness)

Vacancy freshness output contract:

```ts
{
  freshness_status: "FRESH" | "AGING" | "STALE",
  latest_confirmed_at: number,
  days_since_confirmation: number,
  confidence_score: number,
}
```

## P40 -> P35 (Notification Events)

Required events:

- `fraud.alert.triggered`
- `fraud.alert.auto_flagged`
- `photo.quality.pending_review`
- `vacancy.heartbeat.stale`

Payload contract:

```ts
{
  event_key: string,
  entity_type: "LEAD" | "LISTING" | "PHOTO",
  entity_id: string,
  score: number,
  confidence_score: number,
  model_version: string,
  created_at: number,
  metadata: Record<string, string>,
}
```

## P40 -> P39 (Tenant Trust Score)

V1: No direct integration. P40 fraud scores and AI signals are NOT consumed by P39 trust score computation.

Future: P40 may provide `platform_behavior` signals to P39 (gated by `trust_ai_signal_enabled` config key, default `false`). When enabled, P40 contributes max 5 points to P39 `platform_behavior` component. Contract owner: P39.

## P40 -> P12 (Analytics Snapshot)

Daily AI snapshot payload:

```ts
{
  snapshot_date: string,
  total_cost_cents: number,
  total_calls: number,
  total_failures: number,
  fail_rate: number,
  module_breakdown: {
    rent_estimate_calls: number,
    photo_quality_calls: number,
    lead_score_runs: number,
    fraud_score_runs: number,
  },
  created_at: number,
}
```

---

## Explainability Payload Standard (medium gap closure)

Every score table must expose:

```ts
{
  top_positive_factors: string[],
  top_negative_factors: string[],
  factor_values: Record<string, number>,
  evidence_ids: string[],
  narrative: string,
}
```

`narrative` is short plain-English explanation rendered in admin tooltips.

---

## Rollout and Version Migration (medium gap closure)

1. Start in shadow mode with `model_version = "p40-v1-shadow"`.
2. Compare shadow outputs to live rules-only baseline for 7 days.
3. Promote to `p40-v1-live` when:
   - fail rate < 5%
   - manual override rate < 15%
   - budget overrun days = 0
4. Never overwrite historical rows across model versions.
5. Recompute jobs always write new rows and mark latest by `computed_at`.

---

## Rent Cache Behavior (medium gap closure)

1. Use deterministic `estimate_key` from request args.
2. Cache valid while `Date.now() <= expires_at`.
3. If expired and AI unavailable, return stale row with `is_stale: true`.
4. If no cache exists and AI unavailable, return typed error `AI_RENT_UNAVAILABLE`.
5. Cache TTL from `ai_cache_ttl_ms`.

---

## Data Retention

- `ai_rent_estimates`: retain 1 year, then archive.
- `ai_lead_scores`: retain 2 years (audit requirement).
- `ai_fraud_signals`: retain 3 years (regulatory).
- `ai_photo_analyses`: retain 1 year.
- `ai_usage_tracking`: retain 90 days (cost monitoring), then purge.
- `ai_model_configs`: retain indefinitely (versioned configuration history).

Purge cron: `ai_data_retention` runs weekly and soft-deletes expired rows.

---

## Testing Strategy (medium gap closure)

All AI features use a mock provider pattern.

- `convex/actions/aiProvider.ts` exports provider interface; production uses OpenAI, tests use `MockAIProvider` with deterministic responses.
- Mock fixtures live in `tests/fixtures/ai-responses/` for rent estimates, lead scores, fraud signals, and photo analyses.
- Property tests verify scoring formulas with randomized inputs always produce scores in `[0,100]`.
- Integration tests cover full pipeline: lead creation -> cron trigger -> score computation -> admin dashboard display.
- CI policy: no real OpenAI calls; all AI tests run against mocks only.

---

## Observability and SLOs (medium gap closure)

- AI action success rate SLO: `>= 95%` daily
- P95 action latency SLO: `<= 4s`
- Daily budget breach SLO: `0` breaches
- Data freshness SLO:
  - lead/fraud recompute completed by `04:00` UTC
  - heartbeat cron gap never > `6h`

Required metrics:

- `ai_calls_total`
- `ai_calls_failed_total`
- `ai_retry_count`
- `ai_cost_cents_total`
- `ai_fallback_used_total`

---

## Privacy and Data Handling (medium gap closure)

1. Never send raw phone numbers or full names to OpenAI; mask before prompt creation.
2. Send only minimum fields required for output quality.
3. Store provider request/response IDs, not raw provider payload blobs.
4. Retain `ai_usage_tracking` and explainability metadata for audit; purge raw transient media context after processing.
5. Follow existing P24 masking standards for any text sent to AI models.

---

## Related Documents

- [Strategic Improvement Plan](24-strategic-improvement-plan.md)
- [Trust & Verification Display](25-trust-verification-display.md)
- [Notification Infrastructure](27-notification-infrastructure.md)
- [Tenant Tools](16-tenant-tools.md)
- [Analytics](10-analytics.md)
- [Convex Architecture](../11-convex-architecture.md)
- [Constants Reference](../13-constants-reference.md)
