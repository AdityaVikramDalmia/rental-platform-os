# Feature: Supply Channel Diversification

> **Priority**: #41 in implementation order
> **Personas**: Owner, Resident, Society Secretary, Broker, Corporate Ops, Admin, Guard
> **Hard Dependencies**: P04 (Lead Pipeline), P31 (Owner Entity and RM)
> **Soft Dependencies**: P40 (AI scoring), P37 (resident profiles)

## Overview

Phase 41 expands lead intake beyond guard-only discovery while preserving one canonical lead per vacancy, strict attribution, and auditable payout impact.

Channels in scope:

1. Owner self-list
2. Society secretary intake
3. Resident referrals
4. Corporate relocation
5. Broker partnerships

This phase must remain backward compatible with the existing guard-led `leads` pipeline.

---

## Source Taxonomy and Priority

### Canonical Table Names

Use these table names exactly; these are authoritative for P41:

- `supply_sources` - source records across all channels
- `source_collisions` - collision detection and resolution records
- `owner_direct_leads` - owner self-list submissions
- `broker_partnerships` - broker registrations and lifecycle
- `corporate_partnerships` - corporate relocation partnerships
- `secretary_intake` - society secretary onboarding + submissions
- `resident_referrals` - resident referral submissions
- `channel_analytics` - per-channel performance snapshots
- `channel_configs` - per-channel configuration and rollout
- `leads.source_channel` - canonical source enum (`GUARD | OWNER | SECRETARY | RESIDENT | BROKER | CORPORATE`)

### Source Channel Enum

`source_channel` has exactly 6 values:

- `GUARD`
- `OWNER`
- `SECRETARY`
- `RESIDENT`
- `BROKER`
- `CORPORATE`

### Canonical Collision Priority (Locked)

Default rank is fixed and non-configurable:

1. `GUARD`
2. `OWNER`
3. `SECRETARY`
4. `RESIDENT`
5. `BROKER`
6. `CORPORATE`

Exception: `corporate_partnerships.is_exclusive=true` with society scope sets effective priority to `0` for scoped societies.

---

## Data Model (Canonical Tables + Leads Extension)

### Shared Validators

```ts
const sourceChannelValidator = v.union(
  v.literal("GUARD"),
  v.literal("OWNER"),
  v.literal("SECRETARY"),
  v.literal("RESIDENT"),
  v.literal("BROKER"),
  v.literal("CORPORATE"),
);

const collisionStatusValidator = v.union(
  v.literal("DETECTED"),
  v.literal("UNDER_REVIEW"),
  v.literal("RESOLVED"),
);

const collisionResolutionTypeValidator = v.union(
  v.literal("PRIORITY_WINS"),
  v.literal("SPLIT_CREDIT"),
  v.literal("DISMISSED"),
);
```

### 1) `leads` (Extended, Backward Compatible)

Existing fields remain unchanged, including `submitted_by_guard_id`.

New fields:

```ts
source_channel: sourceChannelValidator,
source_reference_id: v.optional(
  v.union(
    v.id("owner_direct_leads"),
    v.id("secretary_intake"),
    v.id("resident_referrals"),
    v.id("broker_partnerships"),
    v.id("corporate_partnerships"),
  ),
),
source_metadata: v.optional(
  v.object({
    normalized_phone: v.string(),
    normalized_flat_number: v.string(),
    normalized_society_key: v.string(),
    owner_match_status: v.optional(
      v.union(v.literal("MATCHED"), v.literal("CREATED"), v.literal("CONFLICT_REVIEW")),
    ),
    submitted_via: v.union(
      v.literal("WEB_FORM"),
      v.literal("ADMIN_IMPORT"),
      v.literal("API"),
    ),
    payload_version: v.string(),
  }),
),
collision_check_pending: v.optional(v.boolean()),
```

Indexes:

- existing `leads` indexes stay intact
- add `by_source_channel` on `source_channel`
- add `by_source_reference_id` on `source_reference_id`
- add `by_source_channel_and_created` on `source_channel, _creationTime`

### 2) `supply_sources`

```ts
source_channel: sourceChannelValidator,
source_reference_id: v.union(
  v.id("owner_direct_leads"),
  v.id("secretary_intake"),
  v.id("resident_referrals"),
  v.id("broker_partnerships"),
  v.id("corporate_partnerships"),
  v.id("users"),
),
status: v.union(
  v.literal("SUBMITTED"),
  v.literal("VERIFIED"),
  v.literal("ACTIVE"),
  v.literal("SUSPENDED"),
  v.literal("CLOSED"),
),
priority_rank: v.number(),
society_id: v.optional(v.id("societies")),
last_submission_at: v.optional(v.number()),
created_at: v.number(),
updated_at: v.number(),
```

Indexes:

- `by_channel_and_status` (`source_channel`, `status`)
- `by_source_reference_id` (`source_reference_id`)
- `by_society_and_channel` (`society_id`, `source_channel`)

### 3) `owner_direct_leads`

```ts
owner_id: v.optional(v.id("owners")),
owner_user_id: v.optional(v.id("users")),
owner_phone: v.string(),
owner_name: v.string(),
society_id: v.id("societies"),
building_id: v.optional(v.id("buildings")),
flat_number: v.string(),
vacancy_type: v.union(v.literal("FULL_FLAT"), v.literal("PRIVATE_ROOM")),
expected_rent_paise: v.number(),
available_from: v.number(),
status: v.union(
  v.literal("SUBMITTED"),
  v.literal("VERIFIED"),
  v.literal("ACTIVE"),
  v.literal("SUSPENDED"),
  v.literal("CLOSED"),
),
canonical_lead_id: v.optional(v.id("leads")),
submitted_at: v.number(),
verified_at: v.optional(v.number()),
updated_at: v.number(),
```

### 4) `secretary_intake`

```ts
secretary_name: v.string(),
phone: v.string(),
society_id: v.id("societies"),
status: v.union(
  v.literal("NOMINATED"),
  v.literal("VERIFIED"),
  v.literal("TRAINED"),
  v.literal("ACTIVE"),
  v.literal("INACTIVE"),
),
training_checklist: v.array(v.string()),
last_submission_at: v.optional(v.number()),
canonical_lead_count: v.optional(v.number()),
updated_at: v.number(),
```

### 5) `resident_referrals`

```ts
resident_user_id: v.id("users"),
resident_profile_id: v.id("resident_profiles"),
society_id: v.id("societies"),
flat_number: v.string(),
referral_type: v.literal("RESIDENT_VACANCY"),
status: v.union(
  v.literal("SUBMITTED"),
  v.literal("VERIFIED"),
  v.literal("REWARDED"),
  v.literal("EXPIRED"),
),
bounty_status: v.union(
  v.literal("NOT_ELIGIBLE"),
  v.literal("PENDING"),
  v.literal("TRIGGERED"),
  v.literal("PAID"),
  v.literal("VOIDED_COLLISION"),
),
canonical_lead_id: v.optional(v.id("leads")),
rewarded_at: v.optional(v.number()),
submitted_at: v.number(),
updated_at: v.number(),
```

### 6) `broker_partnerships`

```ts
broker_name: v.string(),
broker_phone: v.string(),
broker_email: v.optional(v.string()),
society_scope_ids: v.array(v.id("societies")),
status: v.union(
  v.literal("APPLIED"),
  v.literal("UNDER_REVIEW"),
  v.literal("APPROVED"),
  v.literal("ACTIVE"),
  v.literal("SUSPENDED"),
  v.literal("TERMINATED"),
),
conversion_rate_bps: v.optional(v.number()),
window_lead_count: v.optional(v.number()),
consecutive_under_threshold_windows: v.optional(v.number()),
suspension_reason: v.optional(v.string()),
appeal_eligible_at: v.optional(v.number()),
created_at: v.number(),
updated_at: v.number(),
```

### 7) `corporate_partnerships`

```ts
company_name: v.string(),
partner_contact_name: v.string(),
partner_contact_phone: v.string(),
partner_contact_email: v.string(),
status: v.union(
  v.literal("PROSPECT"),
  v.literal("NEGOTIATION"),
  v.literal("CONTRACTED"),
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("EXPIRED"),
),
pricing_tier: v.union(v.literal("STANDARD"), v.literal("BULK_10_50"), v.literal("BULK_50_PLUS")),
is_exclusive: v.boolean(),
exclusive_society_scope_ids: v.optional(v.array(v.id("societies"))),
billing_terms: v.string(),
sla_miss_streak: v.optional(v.number()),
contract_end_at: v.optional(v.number()),
created_at: v.number(),
updated_at: v.number(),
```

### 8) `source_collisions`

`source_collisions` uses two distinct fields:

- `status` tracks lifecycle (`DETECTED | UNDER_REVIEW | RESOLVED`)
- `resolution_type` tracks outcome (`PRIORITY_WINS | SPLIT_CREDIT | DISMISSED`)

```ts
collision_id: v.string(),
lead_id: v.id("leads"),
incoming_source_channel: sourceChannelValidator,
winner_source_channel: sourceChannelValidator,
loser_source_channel: sourceChannelValidator,
priority_difference: v.number(),
status: collisionStatusValidator,
resolution_type: v.optional(collisionResolutionTypeValidator),
resolved_by: v.optional(v.id("users")),
resolved_at: v.optional(v.number()),
retry_count: v.optional(v.number()),
payout_impact: v.union(
  v.literal("NONE"),
  v.literal("LOSER_BOUNTY_VOIDED"),
  v.literal("LOSER_COMMISSION_VOIDED"),
  v.literal("SPLIT_BOUNTY"),
  v.literal("SPLIT_COMMISSION"),
),
notes: v.optional(v.string()),
created_at: v.number(),
updated_at: v.number(),
```

### 9) `channel_analytics`

```ts
channel: sourceChannelValidator,
society_id: v.optional(v.id("societies")),
window: v.union(v.literal("7d"), v.literal("30d"), v.literal("90d")),
lead_count: v.number(),
verified_count: v.number(),
conversion_rate_bps: v.number(),
avg_time_to_verify_ms: v.number(),
cost_per_lead_paise: v.number(),
active_sources: v.number(),
computed_at: v.number(),
```

### 10) `channel_configs`

```ts
channel: sourceChannelValidator,
society_id: v.optional(v.id("societies")),
is_enabled: v.boolean(),
priority_override: v.optional(v.number()),
rate_limit_per_24h: v.number(),
cost_alert_threshold_paise: v.optional(v.number()),
updated_by: v.id("users"),
updated_at: v.number(),
```

---

## State Machines (Complete)

Each transition validates actor permission and guard conditions.

### A) Supply Source Lifecycle

States: `SUBMITTED -> VERIFIED -> ACTIVE -> SUSPENDED -> CLOSED`

| From             | To        | Actor | Guard                                     |
| ---------------- | --------- | ----- | ----------------------------------------- |
| SUBMITTED        | VERIFIED  | Admin | identity check passed                     |
| VERIFIED         | ACTIVE    | Admin | source approved for live intake           |
| ACTIVE           | SUSPENDED | Admin | quality threshold failed                  |
| SUSPENDED        | ACTIVE    | Admin | quality recovered and admin review passed |
| ACTIVE/SUSPENDED | CLOSED    | Admin | voluntary closure or admin decision       |

### B) Broker Lifecycle

States: `APPLIED -> UNDER_REVIEW -> APPROVED -> ACTIVE -> SUSPENDED -> TERMINATED`

Broker is the actor that creates `APPLIED` records.

| From             | To           | Actor | Guard                                                    |
| ---------------- | ------------ | ----- | -------------------------------------------------------- |
| APPLIED          | UNDER_REVIEW | Admin | application intake validated for review queue            |
| UNDER_REVIEW     | APPROVED     | Admin | background check and license verified                    |
| APPROVED         | ACTIVE       | Admin | contract accepted and scope configured                   |
| ACTIVE           | SUSPENDED    | Admin | conversion below 10% across 2 consecutive 30-day windows |
| SUSPENDED        | ACTIVE       | Admin | conversion improves and admin reinstates                 |
| ACTIVE/SUSPENDED | TERMINATED   | Admin | contract terminated or severe breach                     |

### C) Corporate Partnership Lifecycle

States: `PROSPECT -> NEGOTIATION -> CONTRACTED -> ACTIVE -> PAUSED -> EXPIRED`

| From                     | To          | Actor | Guard                                           |
| ------------------------ | ----------- | ----- | ----------------------------------------------- |
| PROSPECT                 | NEGOTIATION | Admin | partner qualification accepted                  |
| NEGOTIATION              | CONTRACTED  | Admin | legal review complete and SLA signed            |
| CONTRACTED               | ACTIVE      | Admin | onboarding complete and billing terms confirmed |
| ACTIVE                   | PAUSED      | Admin | SLA breach threshold hit                        |
| PAUSED                   | ACTIVE      | Admin | remediation completed and admin reactivates     |
| ACTIVE/PAUSED/CONTRACTED | EXPIRED     | Admin | contract end date reached or non-renewal        |

### D) Secretary Intake Lifecycle

States: `NOMINATED -> VERIFIED -> TRAINED -> ACTIVE -> INACTIVE`

| From      | To       | Actor | Guard                                       |
| --------- | -------- | ----- | ------------------------------------------- |
| NOMINATED | VERIFIED | Admin | society confirms employment                 |
| VERIFIED  | TRAINED  | Admin | onboarding checklist (all 5 items) complete |
| TRAINED   | ACTIVE   | Admin | activation approved                         |
| ACTIVE    | INACTIVE | Admin | no submissions for 90 days                  |
| INACTIVE  | ACTIVE   | Admin | re-verification completed                   |

### E) Resident Referral Lifecycle

States: `SUBMITTED -> VERIFIED -> REWARDED -> EXPIRED`

| From               | To        | Actor    | Guard                                       |
| ------------------ | --------- | -------- | ------------------------------------------- |
| -                  | SUBMITTED | Resident | valid referral payload submitted            |
| SUBMITTED          | VERIFIED  | System   | not duplicate of existing lead              |
| VERIFIED           | REWARDED  | Admin    | referred lead reaches `VERIFIED` in `leads` |
| SUBMITTED/VERIFIED | EXPIRED   | System   | 90 days elapsed without verification        |

### F) Collision Resolution Lifecycle

States: `DETECTED -> UNDER_REVIEW -> RESOLVED`

Resolution subtype (`resolution_type`) is mandatory on `RESOLVED` and is one of `PRIORITY_WINS | SPLIT_CREDIT | DISMISSED`.

| From         | To           | Actor  | Guard                                                |
| ------------ | ------------ | ------ | ---------------------------------------------------- |
| DETECTED     | RESOLVED     | System | auto-resolve when priority difference >= 2           |
| DETECTED     | UNDER_REVIEW | System | manual review required when priority difference <= 1 |
| UNDER_REVIEW | RESOLVED     | Admin  | review completed with explicit `resolution_type`     |

---

## Full Collision Matrix (15 Pair Combinations)

| Pair                   | Winner    | Loser Handling                                                                              | Payout Impact                                                          |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| GUARD vs OWNER         | GUARD     | owner self-list submission linked to `source_collisions` and marked non-canonical           | owner has no bounty; no payout change                                  |
| GUARD vs SECRETARY     | GUARD     | secretary submission remains linked as non-canonical while canonical lead stays guard-owned | secretary bounty `VOIDED_COLLISION`                                    |
| GUARD vs RESIDENT      | GUARD     | resident referral linked as loser                                                           | resident bounty `VOIDED_COLLISION`                                     |
| GUARD vs BROKER        | GUARD     | broker attribution retained only for audit                                                  | broker commission `VOIDED_COLLISION`                                   |
| GUARD vs CORPORATE     | GUARD     | corporate partner submission remains non-canonical for this lead                            | no corporate payout                                                    |
| OWNER vs SECRETARY     | OWNER     | secretary intake converted as loser link                                                    | secretary bounty `VOIDED_COLLISION`                                    |
| OWNER vs RESIDENT      | OWNER     | resident referral collision loser                                                           | resident bounty `VOIDED_COLLISION`                                     |
| OWNER vs BROKER        | OWNER     | broker attribution set non-payable                                                          | broker commission `VOIDED_COLLISION`                                   |
| OWNER vs CORPORATE     | OWNER     | corporate partner signal linked as supporting source                                        | no corporate payout                                                    |
| SECRETARY vs RESIDENT  | SECRETARY | resident referral collision loser                                                           | resident bounty `VOIDED_COLLISION`                                     |
| SECRETARY vs BROKER    | SECRETARY | broker non-canonical attribution only                                                       | broker commission `VOIDED_COLLISION`                                   |
| SECRETARY vs CORPORATE | SECRETARY | corporate partner signal remains as secondary                                               | no corporate payout                                                    |
| RESIDENT vs BROKER     | RESIDENT  | broker non-canonical attribution only                                                       | broker commission `VOIDED_COLLISION`; resident bounty remains eligible |
| RESIDENT vs CORPORATE  | RESIDENT  | corporate partner signal linked for SLA reporting                                           | resident bounty remains eligible                                       |
| BROKER vs CORPORATE    | BROKER    | corporate partner signal linked as secondary source                                         | broker commission remains eligible                                     |

Notes:

- `resolution_type=SPLIT_CREDIT` is allowed only by manual admin decision in `source_collisions`.
- Matrix governs deterministic default behavior and auto-resolution.

---

## Cross-Phase Contracts

### P40 -> P41 (AI Score Interface)

P41 consumes these P40 fields when available:

- `lead_conversion_score` (`0-100`)
- `fraud_risk_score` (`0-100`)
- `confidence_score` (`0-100`)
- `computed_at` (Unix ms)

Score bands and quality gates:

| Band | Score Range | P41 Gate |
| ---- | ----------- | -------- |
| HOT  | `>= 80`     | accept   |
| WARM | `60-79`     | warn     |
| COOL | `40-59`     | review   |
| COLD | `< 40`      | reject   |

Freshness TTL:

- Score is fresh for 24 hours from `computed_at`.
- Older than 24 hours is stale and cannot auto-approve high-risk channels.

Fallback when score unavailable:

- set `score_band = UNKNOWN`
- route to manual review
- do not auto-reject solely because score is missing

### P04 -> P41 (Lead De-Dup Integration)

- Existing P04 duplicate detection (same flat within 90d, same phone within 30d) remains the trigger source.
- If P04 duplicate candidate spans different `source_channel`, system writes `source_collisions` with `status=DETECTED`.
- If `supply_collision_auto_resolve_enabled=true`, deterministic priority resolution runs immediately.

### P31 -> P41 (Owner Identity Matching)

- Normalize phone to 10 digits before owner lookup.
- Resolve owner via `owners.by_phone`.
- For owner-direct intake conflict (multiple ownership claims), set `owner_match_status=CONFLICT_REVIEW` in `source_metadata` and block promotion until admin resolves.

### P22 -> P41 (Resident Referral Reuse)

- `resident_referrals.referral_type` is fixed as `RESIDENT_VACANCY`.
- Bounty lifecycle reuses P22 milestone rails; trigger on first verified canonical lead.
- Payout trigger is blocked if collision marks resident source as loser.

### P37 -> P41 (Resident Eligibility)

- Resident channel requires `resident_profiles.status = ACTIVE` (soft dependency contract).
- If P37 is not available yet, allow submission only with manual admin verification and set `bounty_status=NOT_ELIGIBLE` until profile backfill is present.

---

## Permissions

Required permission strings:

- `supply.sources.view`
- `supply.sources.manage`
- `supply.collisions.view`
- `supply.collisions.resolve`
- `supply.brokers.manage`
- `supply.brokers.suspend`
- `supply.corporate.manage`
- `supply.secretary.manage`
- `supply.resident.manage`

---

## Config Keys

| Key                                            | Type    | Default  | Purpose                                                       |
| ---------------------------------------------- | ------- | -------- | ------------------------------------------------------------- |
| `supply_broker_min_leads_per_window`           | number  | `5`      | minimum sample size for broker quality review                 |
| `supply_broker_window_days`                    | number  | `30`     | broker performance window length                              |
| `supply_broker_suspension_consecutive_windows` | number  | `2`      | windows below threshold before suspension                     |
| `supply_corporate_sla_hours`                   | number  | `48`     | first-response SLA target                                     |
| `supply_collision_auto_resolve_enabled`        | boolean | `false`  | enable deterministic auto-resolution                          |
| `supply_resident_bounty_paise`                 | number  | `50000`  | resident referral bounty amount                               |
| `secretary_bounty_amount_paise`                | number  | `50000`  | secretary per-lead bounty amount                              |
| `broker_commission_pct`                        | number  | `5000`   | broker commission share in bps (50.00%)                       |
| `owner_self_list_rate_limit`                   | number  | `3`      | owner self-list max submissions per 24h                       |
| `secretary_submission_rate_limit`              | number  | `10`     | secretary submissions per 24h                                 |
| `resident_referral_rate_limit`                 | number  | `5`      | resident referrals per 24h                                    |
| `broker_submission_rate_limit`                 | number  | `20`     | broker submissions per 24h                                    |
| `corporate_submission_rate_limit`              | number  | `50`     | corporate submissions per 24h                                 |
| `channel_cost_alert_threshold`                 | number  | `100000` | cost alert threshold in paise per verified lead (default ₹1k) |

---

## Audit Actions

Add action constants for new entities:

- `supply_source.submitted`
- `supply_source.verified`
- `supply_source.activated`
- `supply_source.suspended`
- `supply_source.closed`
- `owner_direct_lead.submitted`
- `owner_direct_lead.verified`
- `owner_direct_lead.activated`
- `owner_direct_lead.closed`
- `secretary_intake.nominated`
- `secretary_intake.verified`
- `secretary_intake.trained`
- `secretary_intake.activated`
- `secretary_intake.inactivated`
- `resident_referral.submitted`
- `resident_referral.verified`
- `resident_referral.rewarded`
- `resident_referral.expired`
- `corporate_partnership.prospected`
- `corporate_partnership.contracted`
- `corporate_partnership.activated`
- `corporate_partnership.paused`
- `corporate_partnership.expired`
- `broker_partnership.applied`
- `broker_partnership.reviewed`
- `broker_partnership.approved`
- `broker_partnership.suspended`
- `broker_partnership.terminated`
- `broker_partnership.reinstated`
- `source_collision.detected`
- `source_collision.under_review`
- `source_collision.resolved`

---

## Cron and Rate-Limit Contracts

### Crons

- `resolveStaleCollisions` - daily at 04:00 IST (resolve stale `DETECTED` collisions)
- `retryPendingCollisions` - every 15 minutes (retry `collision_check_pending=true` leads)
- `checkBrokerPerformance` - every Monday at 06:00 IST (evaluate rolling conversion windows)
- `checkCorporateSLAStages` - hourly (track SLA miss streaks and pause thresholds)
- `channel_health_check` - daily (compute health alerts and status colors)

### Rate Limits by Channel

| Channel   | Rate Limit Key                    | Default | Window |
| --------- | --------------------------------- | ------- | ------ |
| OWNER     | `owner_self_list_rate_limit`      | `3`     | `24h`  |
| SECRETARY | `secretary_submission_rate_limit` | `10`    | `24h`  |
| RESIDENT  | `resident_referral_rate_limit`    | `5`     | `24h`  |
| BROKER    | `broker_submission_rate_limit`    | `20`    | `24h`  |
| CORPORATE | `corporate_submission_rate_limit` | `50`    | `24h`  |
| GUARD     | `guard_lead_daily_max`            | `10`    | `24h`  |

All rate limits are enforced through the existing `rateLimiter.ts` pattern.

---

## Operational Rules

### Broker Suspension Threshold

- `conversion_rate = verified_leads / total_leads`
- evaluate as basis points (`conversion_rate_bps`)
- minimum sample required: 5 leads per 30-day window
- under-threshold rule: `< 1000 bps` (10%)
- auto-suspend after 2 consecutive under-threshold windows
- reinstatement requires improved conversion plus admin review

### Broker Commission Structure

- Commission rate is 50% of platform brokerage fee, configurable via `broker_commission_pct` (default `5000` bps = 50.00%).
- Payout cadence is monthly on the 1st of the following month.
- Settlement is credited to broker's registered bank account through the Phase 9 payout pipeline.
- Minimum payout threshold is `100000` paise (₹1,000); amounts below threshold roll over.
- Commission is voided if broker is suspended, lead is reversed, or closure is cancelled within 30 days.
- Clawback applies when reversal occurs after payout; deduction is applied to next month's payout.

### Corporate Partnership Commercial Terms

- Bulk pricing tiers: standard for `<10` leads/month, `10%` discount for `10-50`, and `20%` discount for `50+`; stored via `corporate_partnerships.pricing_tier`.
- Exclusivity is non-exclusive by default. Exclusive contracts require `is_exclusive: true` plus society-level geographic scope.
- Exclusive corporate partners receive effective priority `0` (above `GUARD`) for scoped societies.
- SLA obligations: partner responds to lead within 48h and platform provides listing within 72h of verified lead.
- SLA breach rule: 3 consecutive misses transitions partnership to `PAUSED`.
- Billing is monthly invoice with NET-30 terms via `corporate_partnerships.billing_terms`.

### Secretary Onboarding

- Nomination flow: `secretaryIntake.nominate({ phone, society_id, name })` by admin or society liaison.
- Verification: admin confirms active employment with society office phone verification; status becomes `VERIFIED`.
- Training checklist requires all 5 items in `secretary_intake.training_checklist` (JSON array of completed item IDs):
  1. Platform intro video watched
  2. Lead submission tutorial completed
  3. Privacy policy acknowledged
  4. Test lead submitted
  5. Photo quality guide reviewed
- Status moves to `TRAINED` only after all 5 checklist items are complete.
- Compensation is per-lead bounty aligned with guard bounty rails; configured by `secretary_bounty_amount_paise` (default `50000`) and paid through the standard payout pipeline.
- Activation is admin-only and transitions `TRAINED -> ACTIVE`.

### Resident Referral Eligibility

- resident must have active `resident_profile`
- self-referral is blocked
- same-household referral is blocked
- reward applies only when referred lead reaches `VERIFIED`

---

## Channel Analytics

Query contract:

- `channelAnalytics.getDashboard(timeWindow)` returns per-channel metrics:
  - `lead_count`
  - `verified_count`
  - `conversion_rate`
  - `avg_time_to_verify`
  - `cost_per_lead`
  - `active_sources`

Dashboard contract:

- Admin page: `/admin/channels`
- Views: channel comparison table, conversion funnel chart, cost efficiency chart
- Filters: time window (`7d`/`30d`/`90d`), channel type, society

---

## Notification Trigger Matrix

| Event                       | Channel        | Recipient               |
| --------------------------- | -------------- | ----------------------- |
| New source registered       | IN_APP         | Admin                   |
| Source verified             | IN_APP         | Source submitter        |
| Source suspended            | IN_APP + EMAIL | Source submitter        |
| Collision detected          | IN_APP         | Admin                   |
| Broker commission paid      | IN_APP         | Broker                  |
| Corporate SLA breach        | IN_APP + EMAIL | Admin + Partner contact |
| Secretary training complete | IN_APP         | Admin                   |

---

## Migration Plan

V1 launch starts with guard channel as default.

- Existing leads are backfilled with `source_channel=GUARD` using `supplyChannels.backfillExistingLeads()` for rows where `source_channel` is undefined.
- New channels are enabled per society via `channel_configs`.
- Rollout stages (admin activation required at each step):
  1. Backfill existing leads
  2. Enable owner self-list society-by-society
  3. Secretary pilot in 5 societies
  4. Broker onboarding
  5. Corporate partnerships

---

## Channel Health Monitoring

- Cron `channel_health_check` runs daily.
- Alerts:
  1. conversion below 5% for 30 days -> WARN to admin
  2. no submissions from active source in 14 days -> STALE alert
  3. collision rate above 30% for channel -> quality review alert
  4. cost per verified lead above `channel_cost_alert_threshold` (default `100000` paise) -> COST alert
- Dashboard shows `GREEN | YELLOW | RED` health status per channel on `/admin/channels`.

---

## Test Strategy

- Unit tests: collision matrix (all 15 pairs), priority resolution, commission calculation, suspension formula.
- Integration tests: full channel lifecycle (`register -> verify -> activate -> submit lead -> collision check -> resolve`).
- E2E: admin creates source, source submits lead, admin reviews collision, lead gets verified.
- Multi-channel scenario: same flat submitted by guard + owner + secretary simultaneously, then verify collision detection and priority resolution.
- No external dependencies to mock.

---

## Collision Resolution Error Handling

- If collision detection fails (query timeout/index miss), log error, set `leads.collision_check_pending=true`, and retry on next cron cycle (every 15 minutes).
- If resolution fails because admin rejects both parties, keep `status=UNDER_REVIEW` and escalate to super admin via IN_APP notification.
- Maximum retry attempts: 3 per collision; then auto-escalate.
- If both sources are inactive at resolution time, auto-set `resolution_type=DISMISSED` and mark collision `status=RESOLVED`.

---

## Medium-Risk Contracts

### Metadata Normalization

All intake channels must normalize and persist:

- `phone` as 10 digits
- `flat_number` uppercase
- `society_id` and optional `building_id` references
- monetary values in paise
- timestamps in Unix ms

### Corporate Import Error Model

Batch imports are partial-success by design:

```ts
{
  batch_id: string,
  created_count: number,
  failed_count: number,
  errors: Array<{
    row_number: number,
    code:
      | "INVALID_PHONE"
      | "INVALID_BUDGET"
      | "MISSING_REQUIRED_FIELD"
      | "DUPLICATE_EMPLOYEE_REF"
      | "SOCIETY_NOT_SUPPORTED"
      | "INTERNAL_ERROR";
    message: string;
  }>;
}
```

### Corporate to Inquiry Linkage

- corporate-origin leads keep tenant inquiry linkage in `leads.source_metadata` for conversion tracking.
- linkage is set when outreach starts and is preserved through closure.

### Cross-Channel Verification Matrix

| Source      | Required Verification Before Listing Activation      |
| ----------- | ---------------------------------------------------- |
| `GUARD`     | existing P04 + P05 flow                              |
| `OWNER`     | admin verification + owner identity resolution       |
| `SECRETARY` | secretary identity verification + admin validation   |
| `RESIDENT`  | resident eligibility + anti-self/household checks    |
| `BROKER`    | active broker status + quality gate pass             |
| `CORPORATE` | account active + request completeness + SLA tracking |

### Index Strategy

All channel tables include:

- lifecycle index (`by_status` or equivalent)
- entity ownership/index for principal lookup (phone, owner_id, resident_profile_id, company contact)
- canonical lead linkage index (`by_canonical_lead_id` or `by_lead_id`) for attribution joins

---

## Business Rules

1. Every lead has exactly one `source_channel`.
2. Canonical collision winner defaults to locked priority order unless manually dismissed/split.
3. `submitted_by_guard_id` remains untouched for backward compatibility.
4. Money is always paise.
5. Phones are always normalized 10-digit strings.
6. All dates are Unix milliseconds.
7. No channel can bypass legal state transitions.

---

## Related Documents

- [Lead Pipeline](03-lead-pipeline.md) - P04 de-dup and canonical lead lifecycle
- [Referral System](17-referral-system.md) - resident bounty and milestone reuse
- [Owner Entity and RM Foundation](21-owner-entity-and-rm.md) - owner identity resolution contract
- [Post-Move-In Lifecycle](29-post-move-in-lifecycle.md) - resident profile eligibility
- [AI Intelligence Spine](32-ai-intelligence-spine.md) - score inputs and freshness contracts
- [Constants Reference](../13-constants-reference.md) - enums, permissions, audit actions, config keys
