# Feature: Tenant Trust Score & Reviews

> **Priority**: #39 in implementation order
> **Personas**: Tenant, Owner, Guard, Admin, OPS
> **Dependencies (hard)**: P34 (Transaction Rails)
> **Dependencies (soft/consumer)**: P37 (Post-Move-In Lifecycle), P22 (Referral System), P33 (Trust Display), P38 (Owner Portal), P42 (Financial Products)
> **Route Groups**: `(tenant)/`, `(public)/`, `(admin)/`, `(owner)/`

## Purpose

Phase 39 defines a canonical, portable trust layer for tenants and a verified review system across visits, tenancies, and completed transactions.

1. **Trust score**: one platform-wide score per tenant, integer `0-100`, explainable by four components.
2. **Reviews**: strictly interaction-gated reviews with cooling, anti-gaming, moderation, and one-time responses.

This phase intentionally ships score/review infrastructure and contracts; advanced dispute workflows are deferred.

## Dependency Graph (Reconciled)

```text
Hard dependencies (must exist before P39 implementation):
P34 (transaction anchors + KYC rails) -> P39

Soft dependencies (consumed when available, not blocking P39 ship):
P37 (rent + maintenance + renewal behavior signals) -> P39
P22 (verified referral milestones for one-time trust boost) -> P39
P33 (trust badge display patterns) -> P39

Soft dependencies / consuming phases:
P33 consumes TrustBadgeViewModel from P39 for trust chips
P38 consumes owner-facing review and response contracts
P42 consumes immutable eligibility snapshots from P39
```

## Canonical Enums (Literal Values)

### Trust Bands

| Enum        | Literal      | Score Range |
| ----------- | ------------ | ----------- |
| `TrustBand` | `"NEW"`      | `0-20`      |
| `TrustBand` | `"BUILDING"` | `21-50`     |
| `TrustBand` | `"TRUSTED"`  | `51-80`     |
| `TrustBand` | `"PREMIUM"`  | `81-100`    |

### Trust Components

| Enum                | Literal               | Max Points |
| ------------------- | --------------------- | ---------: |
| `TrustComponentKey` | `"IDENTITY"`          |         30 |
| `TrustComponentKey` | `"EMPLOYMENT"`        |         25 |
| `TrustComponentKey` | `"RENTAL_HISTORY"`    |         25 |
| `TrustComponentKey` | `"PLATFORM_BEHAVIOR"` |         20 |

### Review Dimensions

| Enum         | Literal                          | Meaning                                                    |
| ------------ | -------------------------------- | ---------------------------------------------------------- |
| `ReviewType` | `"TENANT_LISTING_ACCURACY"`      | Tenant rates listing accuracy after a completed visit      |
| `ReviewType` | `"TENANT_GUARD_PROFESSIONALISM"` | Tenant rates guard professionalism after a completed visit |
| `ReviewType` | `"OWNER_TENANT_RELIABILITY"`     | Owner rates tenant reliability after active tenancy        |
| `ReviewType` | `"OWNER_PLATFORM_SERVICE"`       | Owner rates platform service after completed transaction   |

| Enum               | Literal      | Meaning                        |
| ------------------ | ------------ | ------------------------------ |
| `ReviewTargetType` | `"LISTING"`  | Target is a listing            |
| `ReviewTargetType` | `"GUARD"`    | Target is a guard user         |
| `ReviewTargetType` | `"TENANT"`   | Target is a tenant user        |
| `ReviewTargetType` | `"PLATFORM"` | Target is the platform service |

| Enum                    | Literal         | Meaning                           |
| ----------------------- | --------------- | --------------------------------- |
| `ReviewInteractionType` | `"VISIT"`       | Anchored on `visits`              |
| `ReviewInteractionType` | `"TENANCY"`     | Anchored on `resident_profiles`   |
| `ReviewInteractionType` | `"TRANSACTION"` | Anchored on `rental_transactions` |

### Review Lifecycle & Moderation

| Enum           | Literal             |
| -------------- | ------------------- |
| `ReviewStatus` | `"PENDING_COOLING"` |
| `ReviewStatus` | `"PUBLISHED"`       |
| `ReviewStatus` | `"FLAGGED"`         |
| `ReviewStatus` | `"HIDDEN"`          |
| `ReviewStatus` | `"REMOVED"`         |

| Enum                     | Literal          | Applies To                         |
| ------------------------ | ---------------- | ---------------------------------- |
| `ReviewModerationAction` | `"HIDE"`         | `PUBLISHED`, `FLAGGED` -> `HIDDEN` |
| `ReviewModerationAction` | `"UNHIDE"`       | `HIDDEN` -> `PUBLISHED`            |
| `ReviewModerationAction` | `"MARK_ABUSIVE"` | Any non-`REMOVED` -> `REMOVED`     |
| `ReviewModerationAction` | `"RESOLVE_FLAG"` | `FLAGGED` -> `PUBLISHED`           |

| Enum                         | Literal                   |
| ---------------------------- | ------------------------- |
| `ReviewModerationReasonCode` | `"SPAM"`                  |
| `ReviewModerationReasonCode` | `"ABUSIVE_LANGUAGE"`      |
| `ReviewModerationReasonCode` | `"HARASSMENT"`            |
| `ReviewModerationReasonCode` | `"PII_EXPOSED"`           |
| `ReviewModerationReasonCode` | `"OFF_TOPIC"`             |
| `ReviewModerationReasonCode` | `"DUPLICATE_CONTENT"`     |
| `ReviewModerationReasonCode` | `"FALSE_CLAIM"`           |
| `ReviewModerationReasonCode` | `"MANUAL_QUALITY_REVIEW"` |

## Trust Score Model (Canonical)

### Formula

```
trust_score_raw =
  identity_points (0..30) +
  employment_points (0..25) +
  rental_history_points (0..25) +
  platform_behavior_points (0..20) +
  referral_boost_points (0 or trust_referral_boost)
```

`trust_score_raw` is then processed as:

1. Recompute raw component points.
2. Apply inactivity decay.
3. Clamp to decay floor.
4. Clamp to `0..100`.
5. Derive band from thresholds.

This ordering is mandatory.

### Baseline, Backfill, and Confidence

- New tenant baseline score: `20`.
- One-time backfill for pre-existing tenants: initialize score `20` with `band = "NEW"`.
- Tenants remain `insufficient_data = true` until at least 3 trusted input signals are present.
- `insufficient_data` tenants still show score internally but UI displays an "Insufficient Data" badge.

### Signal-to-Component Mapping (Source, Normalization, Fallback)

| Component           | Source Table / Field                                                                                                | Normalization                                                                                    | Max Contribution | Fallback Behavior                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------: | -------------------------------------------------------------------------------------- |
| `IDENTITY`          | `kyc_packets.status` for tenant KYC packet(s)                                                                       | VERIFIED identity docs -> 30, PARTIAL -> 15, else 0                                              |               30 | If no packet, contribution 0 and mark missing signal                                   |
| `EMPLOYMENT`        | `kyc_packets.employment_verification_status` (or equivalent employment verification status from KYC packet context) | VERIFIED -> 25, PENDING/PARTIAL -> 10, FAILED -> 0                                               |               25 | If employment field unavailable, contribution 0; tenant remains eligible for recompute |
| `RENTAL_HISTORY`    | `rent_records` on-time ratio + `lease_renewals.status` outcomes                                                     | `on_time_ratio * 20` + renewal reliability bonus `0..5`                                          |               25 | If tenant has no active/closed resident profile, contribution 0                        |
| `PLATFORM_BEHAVIOR` | `tenant_inquiries`, `visits`, `maintenance_tickets`                                                                 | Visit completion ratio `0..8` + no-show penalty/bonus `-4..4` + maintenance SLA adherence `0..8` |               20 | Missing behavior signals default to 0, never negative final component                  |

### Referral Boost Rule (P22 -> P39)

- On first verified referral milestone for tenant/owner referral rails, add `trust_referral_boost` points once.
- Boost is one-time per tenant lifecycle and recorded with `referral_boost_applied_at`.
- Default boost: `5` points.

### Decay Rule

- Decay starts after `trust_decay_start_days` of inactivity.
- Decay rate: `trust_decay_rate_per_month` per 30-day block of inactivity beyond the start window.
- Decay cannot reduce score below `trust_decay_floor`.

### Recalculation Trigger Matrix

| Event                             | Triggers Recalculation | Component Affected  |
| --------------------------------- | ---------------------- | ------------------- |
| Identity verified (KYC)           | Yes                    | `identity`          |
| Employment doc uploaded           | Yes                    | `employment`        |
| Lease completed (P34 `COMPLETED`) | Yes                    | `rental_history`    |
| Review published                  | Yes                    | `platform_behavior` |
| Review hidden/removed             | Yes                    | `platform_behavior` |
| Visit completed                   | Yes                    | `platform_behavior` |
| Inquiry submitted                 | No (too frequent)      | -                   |
| 90-day inactivity cron            | Yes                    | decay applied       |

## Review Model (Canonical)

### Review Type -> Target Mapping Matrix

| Review Type                    | Author User Type | Target Type | Required Target Field   | Interaction Type | Source Validation                                                                                 |
| ------------------------------ | ---------------- | ----------- | ----------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `TENANT_LISTING_ACCURACY`      | `TENANT`         | `LISTING`   | `target_listing_id`     | `VISIT`          | `visits._id = interaction_ref_id` and `visits.status = "COMPLETED"` and reviewer is linked tenant |
| `TENANT_GUARD_PROFESSIONALISM` | `TENANT`         | `GUARD`     | `target_guard_user_id`  | `VISIT`          | same completed-visit gate; guard must match assigned/executed guard                               |
| `OWNER_TENANT_RELIABILITY`     | `OWNER`          | `TENANT`    | `target_tenant_user_id` | `TENANCY`        | `resident_profiles._id = interaction_ref_id`, tenant and owner linkage must match                 |
| `OWNER_PLATFORM_SERVICE`       | `OWNER`          | `PLATFORM`  | none                    | `TRANSACTION`    | `rental_transactions._id = interaction_ref_id` and transaction terminal status confirmed          |

### Target Field Requirements by `target_type`

| `target_type` | Required Fields         | Forbidden Fields                                |
| ------------- | ----------------------- | ----------------------------------------------- |
| `LISTING`     | `target_listing_id`     | `target_guard_user_id`, `target_tenant_user_id` |
| `GUARD`       | `target_guard_user_id`  | `target_listing_id`, `target_tenant_user_id`    |
| `TENANT`      | `target_tenant_user_id` | `target_listing_id`, `target_guard_user_id`     |
| `PLATFORM`    | none                    | all target entity fields                        |

### Eligibility Gates

Submission allowed only when all pass:

1. Interaction record exists and matches `interaction_type` source table.
2. Reviewer is a participant in that interaction.
3. Current time <= interaction completion + `review_submission_window_days`.
4. No existing review for `(interaction_ref_id, review_type, reviewer_user_id)`.
5. Reviewer is not reviewing self or own protected entity.

## Review Lifecycle State Machine

### Status Transitions

| From              | Event                                         | To          | Notes                              |
| ----------------- | --------------------------------------------- | ----------- | ---------------------------------- |
| `PENDING_COOLING` | Cooling window expires with no flags          | `PUBLISHED` | Aggregate refresh runs             |
| `PENDING_COOLING` | Cooling window expires with auto/manual flags | `FLAGGED`   | Hidden from public until resolved  |
| `PENDING_COOLING` | `MARK_ABUSIVE`                                | `REMOVED`   | Terminal                           |
| `PUBLISHED`       | Flag by admin/system                          | `FLAGGED`   | Profanity detected or manual flag  |
| `PUBLISHED`       | `HIDE`                                        | `HIDDEN`    | Removed from public aggregates     |
| `PUBLISHED`       | `MARK_ABUSIVE`                                | `REMOVED`   | Terminal                           |
| `FLAGGED`         | `RESOLVE_FLAG`                                | `PUBLISHED` | Publishes and refreshes aggregates |
| `FLAGGED`         | `HIDE`                                        | `HIDDEN`    | No public visibility               |
| `FLAGGED`         | `MARK_ABUSIVE`                                | `REMOVED`   | Terminal                           |
| `HIDDEN`          | `UNHIDE`                                      | `PUBLISHED` | Re-enters aggregates               |
| `HIDDEN`          | `MARK_ABUSIVE`                                | `REMOVED`   | Terminal                           |

Terminal state: `REMOVED`.

Terminal status is `REMOVED` (not `ABUSIVE`). `ABUSIVE` is a flag reason, not a lifecycle state.

### Cooling Edit Semantics

- Exactly one edit is allowed while `now <= cooling_until`.
- Edit increments `cooling_edit_count` from `0` to `1`.
- Any second edit attempt or any edit after cooling expiry is rejected with `ERR_REVIEW_EDIT_WINDOW_CLOSED`.

## Anti-Gaming and Anomaly Detection

1. Hard uniqueness rule: one review per `(interaction_ref_id, review_type, reviewer_user_id)`.
2. Idempotency rule: caller must send `idempotency_key`; duplicates by `(reviewer_user_id, idempotency_key)` return prior result.
3. Text dedup rule: persist `review_text_hash = sha256(normalized_text)` and reject repeats for same `(target_type + target_id)` when hash matches active review.
4. Anomaly trigger rule: flag reviewer when at least 5 reviews are submitted in 24 hours and rating z-score magnitude exceeds `review_anomaly_z_threshold` with sample size >= `review_anomaly_min_sample`.
5. Auto-flag rule: rating <= 2 and empty text always flags.

## Materialized Aggregates

- Listing and guard review summaries are stored in `review_aggregates` cache rows.
- Cache refresh triggers on `PUBLISHED`, `UNHIDE`, `HIDE`, `MARK_ABUSIVE`, and `RESOLVE_FLAG` transitions.
- Averages are rounded to 1 decimal place.
- Only `PUBLISHED` reviews contribute to aggregates.

## Schema (P39 Tables)

### `tenant_trust_scores`

| Field                       | Validator                                                                                      | Required | Notes                         |
| --------------------------- | ---------------------------------------------------------------------------------------------- | -------- | ----------------------------- |
| `tenant_user_id`            | `v.id("users")`                                                                                | yes      | canonical tenant              |
| `overall_score`             | `v.number()`                                                                                   | yes      | integer `0..100`              |
| `band`                      | `v.union(v.literal("NEW"), v.literal("BUILDING"), v.literal("TRUSTED"), v.literal("PREMIUM"))` | yes      | derived band                  |
| `identity_points`           | `v.number()`                                                                                   | yes      | integer `0..30`               |
| `employment_points`         | `v.number()`                                                                                   | yes      | integer `0..25`               |
| `rental_history_points`     | `v.number()`                                                                                   | yes      | integer `0..25`               |
| `platform_behavior_points`  | `v.number()`                                                                                   | yes      | integer `0..20`               |
| `referral_boost_points`     | `v.number()`                                                                                   | yes      | `0` or configured boost       |
| `insufficient_data`         | `v.boolean()`                                                                                  | yes      | true until 3+ trusted signals |
| `trusted_signal_count`      | `v.number()`                                                                                   | yes      | integer count                 |
| `last_signal_at`            | `v.number()`                                                                                   | yes      | Unix ms                       |
| `computed_at`               | `v.number()`                                                                                   | yes      | Unix ms                       |
| `model_version`             | `v.string()`                                                                                   | yes      | e.g. `"p39.v1"`               |
| `referral_boost_applied_at` | `v.optional(v.number())`                                                                       | no       | Unix ms                       |

Indexes:

- `by_tenant_user_id` (unique-by-contract)
- `by_overall_score`
- `by_computed_at`

### `trust_score_components`

| Field               | Validator                                                                                                              | Required | Notes                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------- |
| `tenant_user_id`    | `v.id("users")`                                                                                                        | yes      |                                 |
| `component_key`     | `v.union(v.literal("IDENTITY"), v.literal("EMPLOYMENT"), v.literal("RENTAL_HISTORY"), v.literal("PLATFORM_BEHAVIOR"))` | yes      |                                 |
| `raw_metric_value`  | `v.number()`                                                                                                           | yes      | source metric pre-normalization |
| `normalized_points` | `v.number()`                                                                                                           | yes      | integer points                  |
| `max_points`        | `v.number()`                                                                                                           | yes      | 30/25/25/20                     |
| `signal_count`      | `v.number()`                                                                                                           | yes      | count contributing to component |
| `source_refs`       | `v.array(v.string())`                                                                                                  | yes      | source IDs as strings           |
| `computed_at`       | `v.number()`                                                                                                           | yes      | Unix ms                         |
| `model_version`     | `v.string()`                                                                                                           | yes      | formula version                 |

Indexes:

- `by_tenant_and_component`
- `by_tenant_user_id`
- `by_computed_at`

### `trust_score_history`

| Field                      | Validator                                                                                      | Required | Notes                     |
| -------------------------- | ---------------------------------------------------------------------------------------------- | -------- | ------------------------- |
| `tenant_user_id`           | `v.id("users")`                                                                                | yes      |                           |
| `overall_score`            | `v.number()`                                                                                   | yes      | integer `0..100`          |
| `band`                     | `v.union(v.literal("NEW"), v.literal("BUILDING"), v.literal("TRUSTED"), v.literal("PREMIUM"))` | yes      | snapshot band             |
| `identity_points`          | `v.number()`                                                                                   | yes      | snapshot                  |
| `employment_points`        | `v.number()`                                                                                   | yes      | snapshot                  |
| `rental_history_points`    | `v.number()`                                                                                   | yes      | snapshot                  |
| `platform_behavior_points` | `v.number()`                                                                                   | yes      | snapshot                  |
| `referral_boost_points`    | `v.number()`                                                                                   | yes      | snapshot                  |
| `decay_points_applied`     | `v.number()`                                                                                   | yes      | integer decay amount      |
| `computed_at`              | `v.number()`                                                                                   | yes      | Unix ms                   |
| `model_version`            | `v.string()`                                                                                   | yes      | snapshot model version    |
| `trigger`                  | `v.string()`                                                                                   | yes      | event/cron trigger reason |

Indexes:

- `by_tenant_user_id`
- `by_tenant_and_computed_at`
- `by_computed_at`

### `trust_eligibility_snapshots` (P39 -> P42 contract)

| Field                 | Validator                                                                                      | Required | Notes                        |
| --------------------- | ---------------------------------------------------------------------------------------------- | -------- | ---------------------------- |
| `tenant_user_id`      | `v.id("users")`                                                                                | yes      | eligibility subject          |
| `tenancy_anchor_id`   | `v.string()`                                                                                   | yes      | transaction/tenancy anchor   |
| `product_key`         | `v.string()`                                                                                   | yes      | financial product identifier |
| `score_at_issue`      | `v.number()`                                                                                   | yes      | immutable score snapshot     |
| `band_at_issue`       | `v.union(v.literal("NEW"), v.literal("BUILDING"), v.literal("TRUSTED"), v.literal("PREMIUM"))` | yes      | immutable band snapshot      |
| `computed_at`         | `v.number()`                                                                                   | yes      | score compute timestamp used |
| `snapshot_created_at` | `v.number()`                                                                                   | yes      | Unix ms                      |
| `model_version`       | `v.string()`                                                                                   | yes      | scoring model version        |
| `policy_context`      | `v.optional(v.object({ rule_version: v.string(), threshold: v.number() }))`                    | no       | underwriting metadata        |

Indexes:

- `by_tenant_user_id`
- `by_product_key`
- `by_tenant_and_snapshot_created_at`

### `reviews`

| Field                    | Validator                                                                                                                                                                                                                                        | Required | Notes                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------- |
| `interaction_type`       | `v.union(v.literal("VISIT"), v.literal("TENANCY"), v.literal("TRANSACTION"))`                                                                                                                                                                    | yes      | source domain                       |
| `interaction_ref_id`     | `v.string()`                                                                                                                                                                                                                                     | yes      | serialized id of source record      |
| `review_type`            | `v.union(v.literal("TENANT_LISTING_ACCURACY"), v.literal("TENANT_GUARD_PROFESSIONALISM"), v.literal("OWNER_TENANT_RELIABILITY"), v.literal("OWNER_PLATFORM_SERVICE"))`                                                                           | yes      | canonical review type               |
| `reviewer_user_id`       | `v.id("users")`                                                                                                                                                                                                                                  | yes      | author                              |
| `target_type`            | `v.union(v.literal("LISTING"), v.literal("GUARD"), v.literal("TENANT"), v.literal("PLATFORM"))`                                                                                                                                                  | yes      | target enum                         |
| `target_listing_id`      | `v.optional(v.id("listings"))`                                                                                                                                                                                                                   | no       | required if `target_type = LISTING` |
| `target_guard_user_id`   | `v.optional(v.id("users"))`                                                                                                                                                                                                                      | no       | required if `target_type = GUARD`   |
| `target_tenant_user_id`  | `v.optional(v.id("users"))`                                                                                                                                                                                                                      | no       | required if `target_type = TENANT`  |
| `rating`                 | `v.number()`                                                                                                                                                                                                                                     | yes      | integer `1..5`                      |
| `review_text`            | `v.optional(v.string())`                                                                                                                                                                                                                         | no       | required when rating <= 2           |
| `review_text_hash`       | `v.optional(v.string())`                                                                                                                                                                                                                         | no       | sha256 of normalized text           |
| `idempotency_key`        | `v.string()`                                                                                                                                                                                                                                     | yes      | request dedup key                   |
| `status`                 | `v.union(v.literal("PENDING_COOLING"), v.literal("PUBLISHED"), v.literal("FLAGGED"), v.literal("HIDDEN"), v.literal("REMOVED"))`                                                                                                                 | yes      | lifecycle status                    |
| `cooling_until`          | `v.number()`                                                                                                                                                                                                                                     | yes      | Unix ms                             |
| `cooling_edit_count`     | `v.number()`                                                                                                                                                                                                                                     | yes      | `0` or `1`                          |
| `submitted_at`           | `v.number()`                                                                                                                                                                                                                                     | yes      | Unix ms                             |
| `published_at`           | `v.optional(v.number())`                                                                                                                                                                                                                         | no       | Unix ms                             |
| `flagged_at`             | `v.optional(v.number())`                                                                                                                                                                                                                         | no       | Unix ms                             |
| `hidden_at`              | `v.optional(v.number())`                                                                                                                                                                                                                         | no       | Unix ms                             |
| `removed_at`             | `v.optional(v.number())`                                                                                                                                                                                                                         | no       | Unix ms                             |
| `moderated_by`           | `v.optional(v.id("users"))`                                                                                                                                                                                                                      | no       | moderator                           |
| `moderated_at`           | `v.optional(v.number())`                                                                                                                                                                                                                         | no       | Unix ms                             |
| `moderation_reason_code` | `v.optional(v.union(v.literal("SPAM"), v.literal("ABUSIVE_LANGUAGE"), v.literal("HARASSMENT"), v.literal("PII_EXPOSED"), v.literal("OFF_TOPIC"), v.literal("DUPLICATE_CONTENT"), v.literal("FALSE_CLAIM"), v.literal("MANUAL_QUALITY_REVIEW")))` | no       | reason                              |
| `anomaly_score`          | `v.optional(v.number())`                                                                                                                                                                                                                         | no       | z-score at flag time                |
| `is_anomalous`           | `v.boolean()`                                                                                                                                                                                                                                    | yes      | anomaly marker                      |

Indexes:

- `by_interaction_reviewer_type` (unique-by-contract on interaction_ref_id + review_type + reviewer_user_id)
- `by_reviewer_and_idempotency_key` (idempotency uniqueness)
- `by_target_type_and_listing`
- `by_target_type_and_guard`
- `by_target_type_and_tenant`
- `by_status`
- `by_cooling_until`
- `by_submitted_at`

### `review_responses`

| Field               | Validator                                         | Required | Notes                           |
| ------------------- | ------------------------------------------------- | -------- | ------------------------------- |
| `review_id`         | `v.id("reviews")`                                 | yes      | parent                          |
| `responder_user_id` | `v.id("users")`                                   | yes      | owner/admin responder           |
| `responder_role`    | `v.union(v.literal("OWNER"), v.literal("ADMIN"))` | yes      | role used for permission checks |
| `response_text`     | `v.string()`                                      | yes      | body                            |
| `created_at`        | `v.number()`                                      | yes      | Unix ms                         |
| `edited_at`         | `v.optional(v.number())`                          | no       | Unix ms                         |
| `edit_count`        | `v.number()`                                      | yes      | `0` or `1`                      |

Indexes:

- `by_review_id` (unique-by-contract: one response per review)
- `by_responder_user_id`

### `review_aggregates`

| Field                  | Validator                                                                                                                                                              | Required | Notes                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------- |
| `target_type`          | `v.union(v.literal("LISTING"), v.literal("GUARD"))`                                                                                                                    | yes      | aggregate domain                            |
| `target_listing_id`    | `v.optional(v.id("listings"))`                                                                                                                                         | no       | required for listing rows                   |
| `target_guard_user_id` | `v.optional(v.id("users"))`                                                                                                                                            | no       | required for guard rows                     |
| `review_type`          | `v.union(v.literal("TENANT_LISTING_ACCURACY"), v.literal("TENANT_GUARD_PROFESSIONALISM"), v.literal("OWNER_TENANT_RELIABILITY"), v.literal("OWNER_PLATFORM_SERVICE"))` | yes      | aggregate dimension                         |
| `average_rating_x10`   | `v.number()`                                                                                                                                                           | yes      | rating \* 10, integer for 1-decimal display |
| `review_count`         | `v.number()`                                                                                                                                                           | yes      | published review count                      |
| `last_review_at`       | `v.optional(v.number())`                                                                                                                                               | no       | Unix ms                                     |
| `last_refreshed_at`    | `v.number()`                                                                                                                                                           | yes      | Unix ms                                     |

Indexes:

- `by_target_listing_and_type`
- `by_target_guard_and_type`
- `by_last_refreshed_at`

## Permissions and RBAC

### Permission Keys

- `tenant_trust.view`
- `tenant_trust.view_any`
- `tenant_trust.recalculate`
- `tenant_trust.export_eligibility_snapshot`
- `reviews.submit`
- `reviews.view`
- `reviews.view_any`
- `reviews.moderate`
- `reviews.respond`
- `reviews.respond_owner`

`reviews.respond_owner` is a convenience alias that grants the same capability as `reviews.respond`, but it is assigned specifically to the Owner role. Admin gets `reviews.respond` directly. Both permissions allow posting responses to reviews. Tenants cannot respond to reviews and can only submit new reviews. In V1, tenant disputes are handled through support.

### Default Role Allocation

| Permission                                 | Tenant | Owner | OPS | Admin |
| ------------------------------------------ | ------ | ----- | --- | ----- |
| `tenant_trust.view`                        | yes    | no    | no  | no    |
| `tenant_trust.view_any`                    | no     | no    | no  | yes   |
| `tenant_trust.recalculate`                 | no     | no    | no  | yes   |
| `tenant_trust.export_eligibility_snapshot` | no     | no    | no  | yes   |
| `reviews.submit`                           | yes    | yes   | no  | yes   |
| `reviews.view`                             | yes    | yes   | no  | yes   |
| `reviews.view_any`                         | no     | no    | no  | yes   |
| `reviews.moderate`                         | no     | no    | no  | yes   |
| `reviews.respond`                          | no     | no    | no  | yes   |
| `reviews.respond_owner`                    | no     | yes   | no  | no    |

V1 moderation actor is Admin only. OPS moderation is deferred to V2.

## Config Keys (System Config)

| Key                             | Type    |   Default | Description                                                                      |
| ------------------------------- | ------- | --------: | -------------------------------------------------------------------------------- |
| `trust_baseline_score`          | number  |        20 | baseline score for new and backfilled tenants                                    |
| `trust_decay_rate_per_month`    | number  |         2 | points decayed every 30 inactive days after decay start                          |
| `trust_decay_start_days`        | number  |        90 | inactivity days before decay starts                                              |
| `trust_decay_floor`             | number  |        15 | minimum score allowed after decay                                                |
| `trust_referral_boost`          | number  |         5 | one-time boost from first verified referral                                      |
| `trust_ai_signal_enabled`       | boolean |     false | gates future P40 AI signal integration into `platform_behavior`; V1 always false |
| `review_submission_rate_limit`  | number  |         5 | max reviews per user per rolling 24-hour window                                  |
| `review_cooling_period_ms`      | number  | 172800000 | cooling window before publish eligibility (48 hours)                             |
| `review_submission_window_days` | number  |        30 | max age of interaction for review submission                                     |
| `review_anomaly_z_threshold`    | number  |       2.0 | z-score threshold for anomaly flagging                                           |
| `review_anomaly_min_sample`     | number  |         5 | minimum sample size to run anomaly detector                                      |

`trust_ai_signal_enabled` is owned by P39 and consumed by the P40 -> P39 contract.

Rate limiting is enforced via existing `rateLimiter.ts` pattern using key `reviews:submit` with 5 submissions per 24 hours per user.

## Convex Contracts

### Queries

```ts
tenantTrust.getMyTrustScore()
  => TenantTrustScoreWithComponents

tenantTrust.getByTenant({ tenant_user_id })
  => TenantTrustScoreWithComponents

tenantTrust.getScoreHistory({ tenant_user_id, paginationOpts })
  => { page, isDone, continueCursor }

tenantTrust.getEligibilitySnapshot({ tenant_user_id, product_key })
  => TrustEligibilitySnapshot | null

reviews.getEligibility({ interaction_type, interaction_ref_id, review_type })
  => { eligible: boolean; reason_code?: string }

reviews.listForListing({ listing_id, paginationOpts })
  => { page, isDone, continueCursor }

reviews.listForGuard({ guard_user_id, paginationOpts })
  => { page, isDone, continueCursor }

reviews.listForTenant({ tenant_user_id, paginationOpts })
  => { page, isDone, continueCursor }

reviews.listModerationQueue({
  status?,
  review_type?,
  target_type?,
  is_anomalous?,
  from_ts?,
  to_ts?,
  sort: "submitted_desc" | "rating_asc" | "rating_desc",
  paginationOpts,
})
  => { page, isDone, continueCursor }

reviews.getAnalytics({ timeWindow })
  => { byStatus, volumeTrend, avgRatingByProperty, flaggedCount, scoreDistribution }
```

Pagination defaults:

- default page size `20`
- max page size `100`
- moderation queue default sort `submitted_desc`

### Mutations

```ts
tenantTrust.recompute({ tenant_user_id, trigger })
  => TenantTrustScore

tenantTrust.exportEligibilitySnapshot({ tenant_user_id, product_key, tenancy_anchor_id, policy_context? })
  => TrustEligibilitySnapshot

reviews.submit({
  interaction_type,
  interaction_ref_id,
  review_type,
  rating,
  review_text?,
  target_type,
  target_listing_id?,
  target_guard_user_id?,
  target_tenant_user_id?,
  idempotency_key,
})
  => Review

reviews.editDuringCooling({ review_id, rating, review_text? })
  => Review

reviews.addResponse({ review_id, response_text })
  => ReviewResponse

reviews.editResponse({ review_id, response_text })
  => ReviewResponse

reviews.moderate({ review_id, action, reason_code })
  => Review

reviews.bulkModerate({ reviewIds, action, reason })
  => { successCount, failedIds }
```

### Bulk Moderation

Admin can select multiple reviews and apply bulk actions: `Flag All`, `Hide All`, `Remove All`.

- Mutation: `reviews.bulkModerate({ reviewIds, action, reason })`
- Maximum batch size: `50`
- Permission required: `reviews.moderate`

### Internal + Cron Ownership

```ts
internal.tenantTrust.dailyDecaySweep({ cursor? })
internal.tenantTrust.nightlyRecompute({ cursor? })
internal.reviews.processCoolingExpiries({ cursor? })
internal.reviews.refreshAggregate({ review_id })
```

Cron ownership:

- `convex/crons.ts` schedules jobs.
- `convex/tenantTrust.ts` owns trust recompute + decay handlers.
- `convex/reviews.ts` owns cooling expiry + aggregate refresh handlers.

## Error Contract (Stable Codes)

| Code                                 | Meaning                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| `ERR_REVIEW_NOT_ELIGIBLE`            | interaction/role window check failed                             |
| `ERR_REVIEW_DUPLICATE`               | existing review for interaction+type+reviewer                    |
| `ERR_REVIEW_IDEMPOTENCY_CONFLICT`    | idempotency key reuse with mismatched payload                    |
| `ERR_REVIEW_EDIT_WINDOW_CLOSED`      | edit after cooling or second edit attempt                        |
| `ERR_REVIEW_RESPONSE_FORBIDDEN`      | responder role/type mismatch                                     |
| `ERR_REVIEW_RESPONSE_ALREADY_EXISTS` | once-only response violated                                      |
| `ERR_REVIEW_RESPONSE_EDIT_LIMIT`     | response edit attempted more than once                           |
| `ERR_TRUST_RECOMPUTE_FORBIDDEN`      | missing permission                                               |
| `ERR_TRUST_SNAPSHOT_CONFLICT`        | duplicate immutable eligibility snapshot for same issuance event |

### Error Handling

- If score computation fails due to missing component data, log to `auditLogs` and return the last cached score with `stale: true`.
- If all trust components are missing (new user), return cold-start score `20`.
- If review submission fails, show toast with retry action and preserve draft in `localStorage`.

## Cross-Phase Contracts

### P37 -> P39 (Behavior Signals)

- P39 consumes resident behavior from P37 as `platform_behavior` inputs:
  - rent on-time ratio from `rent_records`
  - maintenance SLA adherence from `maintenance_tickets`
  - lease renewal outcomes from `lease_renewals`

### P38 -> P39 (Owner Review + Response UX)

- P39 owns backend contracts (`reviews.listForTenant`, `reviews.addResponse`, `reviews.editResponse`, `reviews.getEligibility`).
- P38 renders owner-facing review and response UI using P39 contracts only.

### P33 -> P39 (Trust Badge Consumption)

- P39 exposes stable trust view model for badges:

```ts
type TrustBadgeViewModel = {
  score: number;
  band: "NEW" | "BUILDING" | "TRUSTED" | "PREMIUM";
  confidence: "INSUFFICIENT" | "LOW" | "MEDIUM" | "HIGH";
  computed_at: number;
};
```

### P39 -> P42 (Financial Eligibility Snapshot)

- P39 exports immutable eligibility snapshots at policy issuance with:
  - `score_at_issue`
  - `band_at_issue`
  - `computed_at`
  - `model_version`

### P22 -> P39 (Referral Boost)

- First verified referral milestone applies one-time trust boost (`trust_referral_boost`, default `5`).
- Boost cannot be applied more than once to the same tenant.

### P40 (AI Intelligence Spine) -> P39

- V1 has no direct AI signal integration; P40 fraud scores and AI signals do NOT feed P39 trust computation.
- P40 signals will feed only the `platform_behavior` sub-score in a future phase, capped at `5` points.
- Integration remains gated by `trust_ai_signal_enabled` config key (default `false`).

## Response Permissions and Policies

- Owner response allowed once for `TENANT_LISTING_ACCURACY` reviews on owner-linked listings.
- Platform response allowed once for `OWNER_PLATFORM_SERVICE` reviews by admin users.
- Response edit policy: max one edit by same responder; no ownership transfer.

## Admin Analytics

Admin reviews dashboard shows:

- total reviews by status (pie)
- review volume trend (7d/30d/90d line)
- average rating by property
- flagged review queue count
- trust score distribution histogram

Query contract: `reviews.getAnalytics(timeWindow)` returns `{byStatus, volumeTrend, avgRatingByProperty, flaggedCount, scoreDistribution}`.

## Notification Triggers (P35 Integration)

| Event                           | Channel            | Recipient         |
| ------------------------------- | ------------------ | ----------------- |
| Review published about tenant   | `IN_APP`           | Tenant            |
| Review published about property | `IN_APP`           | Owner             |
| Review flagged                  | `IN_APP`           | Reviewer          |
| Review hidden/removed           | `IN_APP` + `EMAIL` | Reviewer          |
| Owner response posted           | `IN_APP`           | Original reviewer |
| Trust score band changed        | `IN_APP`           | Tenant            |

## Data Retention

- Reviews are soft-deleted (`is_deleted` flag), never hard-deleted in user-facing operations.
- Trust score history is retained indefinitely for audit.
- Review content is retained for 7 years per platform TOS.
- Purge policy: only `is_deleted = true` reviews older than 7 years are eligible for hard deletion via admin cron.

## Accessibility

- Trust badge chips use `aria-label="Trust score: {band} ({score}/100)"`.
- Review cards use `role="article"` with `aria-labelledby` pointing to reviewer name.
- Star ratings use `aria-label="{n} out of 5 stars"`.
- Color-coded badges include text labels (not color-only communication).
- After review submission, focus returns to review list.

## Mobile UI

- On mobile (`<768px`), trust badge renders as compact chip (icon + band label).
- Full score breakdown is shown through expandable accordion.
- Review cards stack vertically with reviewer avatar (`32px`), rating, and text truncated to 3 lines with `Read more`.
- Review form uses full-screen modal on mobile.

## Cron Schedule

- `trust_score_decay`: runs daily at `02:00 UTC`, batch size `100`, processes scores where `last_updated < now - 90 days`, applies `-2` decay per month of inactivity, floor `15`.
- `review_auto_flag`: runs every 6 hours and checks published reviews against auto-flag rules (profanity list and suspicious patterns).

## Dispute Resolution (V1 Scope)

V1 supports admin-only moderation (flag/hide/remove). Formal tenant-initiated dispute workflow (SLA-driven escalation and arbitration) is deferred to V2.

In V1, tenants contact `support@guards.local` for review disputes. Admin resolves within 48h SLA.

## Out of Scope (Explicit)

- Formal tenant-initiated dispute workflow, arbitration, or appeals automation.
- AI sentiment moderation or LLM-based auto-decisioning.
- External bureau credit pulls for trust scoring.
- Public anonymous reviews.

## Decisions Log Follow-Up

Implementation of P39 should add new entries to `notes/12-decisions-log.md` for:

1. Four-component trust formula and weight lock.
2. Cooling period + one-edit policy.
3. Immutable P42 eligibility snapshot design.
4. Materialized aggregate cache strategy.

## Related Documents

- [Trust & Verification Display](25-trust-verification-display.md)
- [Post-Move-In Lifecycle](29-post-move-in-lifecycle.md)
- [Premium Portal Infrastructure + Owner Portal](30-owner-portal-dashboard.md)
- [Financial Products & Insurance](34-financial-products-insurance.md)
- [Referral System](17-referral-system.md)
- [Tenant Inquiry](13-tenant-inquiry.md)
- [State Machines](../04-state-machines.md)
- [Convex Schema](../10-convex-schema.md)
- [Constants Reference](../13-constants-reference.md)
