# Feature: Monetization Foundation

> **Priority**: #36 in implementation order
> **Personas**: Tenant, Owner, Admin
> **Dependencies**: P06 (Listings), P08 (Closures), P09 (Payouts), P22 (Referrals)
> **Route Groups**: `(public)/`, `(tenant)/`, `(admin)/`

## Purpose

Monetization Foundation defines the platform's multi-stream revenue model across transaction fees, discovery passes, promoted listing inventory, and partner-service commissions. It standardizes how revenue is configured, charged, recognized, and reported per deal while preserving transparent pricing for users.

The model has four primary streams:

1. Core transaction fee at deal closure (rent-band based)
2. Discovery Pass upfront payment (credited at closure)
3. Promoted listing visibility packages (time-bound placement)
4. Service bundles and partner services (commission-based ancillary revenue)

## Entities Involved

- `transaction_fees` table (rent-band fee schedule)
- `tenant_passes` table (Discovery Pass purchases, balances, credit usage)
- `service_bundles` table (deal-linked service orders and commissions)
- `promoted_listings` table (boost campaigns, duration, slot allocation)
- `partner_services` table (partner directory and commission contracts)
- `revenue_line_items` table (normalized ledger of all monetization events)
- Existing read dependencies: `listings`, `closures`, `tenant_inquiries`, `owners`, `users`

## Flows

### Flow 1: Transaction Fee Calculation at Closure

```text
1. Closure reaches CONFIRMED state
2. System reads monthly_rent_paise from closure/listing context
3. Fee slab is resolved from transaction_fees (or custom override)
4. Any applicable pass credit is applied from tenant_passes
5. revenue_line_items rows are created: FEE_GROSS, PASS_CREDIT, FEE_NET
6. Fee collection status defaults to `DUE` and moves to `PAID` only when payment evidence exists
```

### Flow 2: Discovery Pass Purchase and Credit

```text
1. Tenant completes Discovery Pass checkout
2. Razorpay `payment.captured` webhook is verified and processed idempotently
3. `tenant_passes` row is created directly in `ACTIVE` status with expiry window
4. Tenant gets priority listing visibility + dedicated support flags
5. On closure, system auto-applies pass credit to transaction fee
6. Pass status transitions to `CONSUMED` (full) or `PARTIALLY_CONSUMED` (partial)
7. If payment fails, no pass row is created
```

### Flow 3: Promoted Listings Inventory

```text
1. Owner/admin initiates promotion checkout for listing
2. Razorpay `payment.captured` webhook is verified and processed idempotently
3. `promoted_listings` row is created directly in `ACTIVE` status with plan duration: 7/14/30 days
4. Search query merges promoted and organic inventory
5. Max 3 promoted cards shown per search page, each labeled "Promoted"
6. Campaign auto-pauses when listing becomes stale/ineligible, and auto-expires when end timestamp is reached
7. If payment fails, no campaign row is created
```

### Flow 4: Service Bundle Order and Commission Recognition

```text
1. Tenant/owner selects service bundle (agreement, movers, cleaning, internet)
2. service_bundles row created with selected partner and quoted amount
3. On service completion, partner payout and platform commission are recorded
4. revenue_line_items rows capture `SERVICE_GROSS`, `PARTNER_COST`, and `SERVICE_COMMISSION`
```

### Flow 5: Admin Revenue Analytics

```text
1. Admin opens monetization dashboard
2. System aggregates revenue_line_items by stream and deal
3. Dashboard shows fee collection state, pass liability, promotion revenue, partner performance
4. Drill-down reveals per-deal contribution and pending collections
```

## User Stories

### Tenant: Buy Discovery Pass and Use It at Closure

**As a tenant**, I want to purchase a Discovery Pass for priority access and support, so I can improve my chances of finding a home quickly.

**Acceptance Criteria**:

- Tenant can buy pass from `(tenant)/` flows
- Pass amount is stored in paise and visible in order summary
- Closure fee screen clearly shows pass credit applied
- Unused/partially used pass balance follows expiry policy

### Owner: Promote a Listing for Better Visibility

**As an owner**, I want to promote my listing for a fixed duration, so it appears more prominently in search results.

**Acceptance Criteria**:

- Owner/admin can select 7/14/30-day promotion plans
- Promoted cards are visibly labeled and capped to 3 per page
- Promotion auto-stops if listing is unpublished or stale

### Admin: Manage Fee Slabs and Revenue Mix

**As an admin**, I want configurable fee slabs and revenue reporting, so pricing stays consistent and margins are measurable.

**Acceptance Criteria**:

- Admin can update slab configuration and effective dates
- Dashboard shows stream-wise revenue and fee collection status
- Partner performance includes order count, margin, and on-time completion

### Public Visitor: Understand Fees Transparently

**As a public user**, I want to see how platform fees work before engaging, so I can make an informed decision.

**Acceptance Criteria**:

- Public `(public)/` page/section describes fee slabs in plain language
- Fee table aligns with backend slab configuration
- All fee examples are displayed in INR while backend stores paise

---

## Convex Functions

### Queries

```ts
transactionFees.getActiveSchedule()
  => TransactionFee[]

tenantPasses.getMyActivePass()
  => TenantPass | null

promotedListings.listActiveForSearch({ locality?, page, page_size })
  => { promoted: PromotedListing[], organic: Listing[] }

serviceBundles.listByDeal({ closure_id })
  => ServiceBundle[]

monetization.getRevenueDashboard({ date_from?, date_to?, stream? })
  => RevenueDashboard
```

### Mutations

```ts
transactionFees.upsertSchedule({ slabs, effective_from })
  => { updated_count: number }

tenantPasses.purchase({ plan_id, amount_paise, payment_ref })
  => TenantPass

tenantPasses.applyCredit({ closure_id, tenant_user_id })
  => { credited_paise: number, remaining_fee_paise: number }

promotedListings.createCampaign({ listing_id, duration_days, amount_paise })
  => PromotedListing

promotedListings.expireCampaign({ campaign_id, reason? })
  => PromotedListing

serviceBundles.createOrder({ closure_id?, listing_id?, partner_service_id, bundle_type, quoted_amount_paise })
  => ServiceBundle

serviceBundles.markCompleted({ id, actual_partner_cost_paise, completed_at })
  => ServiceBundle
```

### Internal Functions

```ts
internal.monetization.computeClosureFee({ closure_id })
  => { fee_paise, slab_key, credit_paise, net_fee_paise }

internal.monetization.recordRevenueLineItems({ source_type, source_id, items })
  => { inserted: number }

internal.monetization.expireStalePromotions({ now })
  => { expired_count: number }
```

### Actions

```ts
actions.payments.capturePassPayment({ amount_paise, gateway_payload });
actions.payments.capturePromotionPayment({ amount_paise, gateway_payload });
actions.partners.notifyServiceAssignment({ partner_id, order_id });
```

## Payment Gateway Contract (P36 Scope)

### Provider and Scope

- Provider: **Razorpay** for Discovery Pass and Promoted Listing purchases only.
- This does not change P34 rule that token/deposit rails are record-first; P34 gateway settlement remains deferred.

### Required Environment Variables

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

### Webhook Endpoint

- HTTP route: `POST /api/payments/razorpay/webhook`
- Validation requirements:
  1. Verify `x-razorpay-signature` with `RAZORPAY_WEBHOOK_SECRET`.
  2. Reject invalid signatures with `400`.
  3. Use `payment_id` as idempotency key; if already processed, return `200` without duplicate writes.
  4. On successful capture, create source record (`tenant_passes` or `promoted_listings`) and write corresponding `revenue_line_items`.

### Webhook Events (minimum)

- `payment.captured` -> create the source purchase record in `ACTIVE` and recognize revenue.
- `payment.failed` -> fail-fast with no source purchase record creation and no revenue recognition.
- `refund.processed` -> write negative revenue reversal line item.

### Record Creation and Failure Mapping (Canonical)

- Pass enters `ACTIVE` on successful payment capture (Razorpay `payment.captured` webhook).
- There is no `PENDING` or `FAILED` pass state. If payment fails, no `tenant_passes` row is created.
- Promotion campaigns follow the same fail-fast pattern. Failed payments do not create `promoted_listings` rows.
- Only successful payments create monetization purchase records.

## Public Pricing Page Contract

- Route: `/pricing` under `(public)` route group.
- Data source: active fee slabs + pass price + promotion plan prices from `system_config` and active `transaction_fees` rows.
- Must render:
  1. rent-band fee table
  2. discovery pass price + validity
  3. promotion plan prices (7/14/30 days)
  4. custom quote note for rent above ₹80,000
  5. "prices stored/calculated in paise; displayed in INR" disclosure

---

## Schema (Proposed)

### `transaction_fees` Table

| Field               | Type           | Required | Description                                           |
| ------------------- | -------------- | -------- | ----------------------------------------------------- |
| slab_key            | string         | yes      | `LT_20K`, `BT_20K_40K`, `BT_40K_80K`, `GT_80K_CUSTOM` |
| min_rent_paise      | number         | yes      | Lower bound inclusive                                 |
| max_rent_paise      | number         | no       | Upper bound exclusive; null for open-ended            |
| fee_paise           | number         | no       | Flat fee in paise                                     |
| is_custom_quote     | boolean        | yes      | True only for >₹80K custom                            |
| custom_quote_reason | string         | no       | Required when custom quote is set                     |
| closure_id          | Id<"closures"> | no       | Closure link for custom quote rows                    |
| effective_from      | number         | yes      | Unix ms                                               |
| effective_to        | number         | no       | Unix ms                                               |
| is_active           | boolean        | yes      | Active schedule flag                                  |
| updated_by_admin_id | Id<"users">    | yes      | Last editor                                           |

**Indexes**: `by_active_effective_from`, `by_slab_key`, `by_closure_id`

### `tenant_passes` Table

| Field                  | Type           | Required | Description                                                       |
| ---------------------- | -------------- | -------- | ----------------------------------------------------------------- |
| tenant_user_id         | Id<"users">    | yes      | Pass owner                                                        |
| plan_code              | string         | yes      | Plan identifier (`DISCOVERY_999`, etc.)                           |
| amount_paise           | number         | yes      | Amount paid                                                       |
| credited_paise         | number         | yes      | Applied amount at closure                                         |
| remaining_credit_paise | number         | yes      | Credit not yet consumed                                           |
| status                 | string         | yes      | `ACTIVE`, `PARTIALLY_CONSUMED`, `CONSUMED`, `EXPIRED`, `REFUNDED` |
| purchased_at           | number         | yes      | Unix ms                                                           |
| expires_at             | number         | yes      | Unix ms (default 6 months)                                        |
| consumed_at            | number         | no       | Unix ms                                                           |
| payment_ref            | string         | yes      | Gateway/payment reference                                         |
| closure_id             | Id<"closures"> | no       | Linked closure when consumed                                      |

**Indexes**: `by_tenant_user_id`, `by_status`, `by_expires_at`

### `service_bundles` Table

| Field               | Type                   | Required | Description                                                       |
| ------------------- | ---------------------- | -------- | ----------------------------------------------------------------- |
| closure_id          | Id<"closures">         | no       | Deal link if post-closure service                                 |
| listing_id          | Id<"listings">         | no       | Listing context                                                   |
| requester_user_id   | Id<"users">            | yes      | Tenant or owner requester                                         |
| partner_service_id  | Id<"partner_services"> | yes      | Selected partner capability                                       |
| bundle_type         | string                 | yes      | `AGREEMENT`, `MOVERS`, `CLEANING`, `INTERNET`, `CUSTOM`           |
| quoted_amount_paise | number                 | yes      | Customer-facing quote                                             |
| partner_cost_paise  | number                 | no       | Actual payable to partner                                         |
| commission_paise    | number                 | no       | Derived margin at completion                                      |
| status              | string                 | yes      | `REQUESTED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| scheduled_for       | number                 | no       | Unix ms                                                           |
| completed_at        | number                 | no       | Unix ms                                                           |

**Indexes**: `by_closure_id`, `by_listing_id`, `by_status`, `by_partner_service_id`

### `promoted_listings` Table

| Field         | Type           | Required | Description                                    |
| ------------- | -------------- | -------- | ---------------------------------------------- |
| listing_id    | Id<"listings"> | yes      | Promoted listing                               |
| owner_user_id | Id<"users">    | yes      | Campaign payer/owner                           |
| duration_days | number         | yes      | `7`, `14`, `30`                                |
| amount_paise  | number         | yes      | Campaign charge                                |
| starts_at     | number         | yes      | Unix ms                                        |
| ends_at       | number         | yes      | Unix ms                                        |
| status        | string         | yes      | `ACTIVE`, `EXPIRED`, `PAUSED`, `CANCELLED`     |
| stale_reason  | string         | no       | Why campaign was auto-paused for ineligibility |
| payment_ref   | string         | yes      | Payment reference                              |

**Indexes**: `by_listing_id`, `by_status_ends_at`, `by_owner_user_id`

### `partner_services` Table

| Field                  | Type     | Required | Description                                                                 |
| ---------------------- | -------- | -------- | --------------------------------------------------------------------------- |
| name                   | string   | yes      | Partner/business name                                                       |
| service_type           | string   | yes      | `MOVERS`, `PAINTERS`, `LAWYERS`, `FURNITURE_RENTAL`, `INTERNET`, `CLEANING` |
| contact_phone          | string   | yes      | 10-digit normalized phone                                                   |
| service_areas          | string[] | yes      | List of supported areas/societies                                           |
| commission_type        | string   | yes      | `PERCENT`, `FLAT`                                                           |
| commission_value_bps   | number   | no       | Basis points when percent                                                   |
| commission_value_paise | number   | no       | Flat amount when flat                                                       |
| rating                 | number   | no       | Internal performance score                                                  |
| is_active              | boolean  | yes      | Partner availability                                                        |

**Indexes**: `by_service_type`, `by_is_active`, `by_contact_phone`

### `revenue_line_items` Table

| Field                 | Type           | Required | Description                                                                                                                                                     |
| --------------------- | -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| closure_id            | Id<"closures"> | no       | Related deal                                                                                                                                                    |
| source_type           | string         | yes      | `TRANSACTION_FEE`, `TENANT_PASS`, `PROMOTION`, `SERVICE_BUNDLE`, `REFERRAL_BONUS`, `PAYOUT_ADJUSTMENT`                                                          |
| source_id             | string         | yes      | Source record id as string                                                                                                                                      |
| line_type             | string         | yes      | `FEE_GROSS`, `PASS_CREDIT`, `FEE_NET`, `PROMOTION_REVENUE`, `SERVICE_GROSS`, `PARTNER_COST`, `SERVICE_COMMISSION`, `REFERRAL_COST`, `PAYOUT_COST`, `ADJUSTMENT` |
| amount_paise          | number         | yes      | Signed paise amount                                                                                                                                             |
| fee_collection_status | string         | no       | `DUE`, `PARTIAL`, `PAID`, `WAIVED`                                                                                                                              |
| recognized_at         | number         | yes      | Unix ms                                                                                                                                                         |
| metadata              | object         | no       | Optional dimensions payload                                                                                                                                     |

**Indexes**: `by_closure_id`, `by_source_type`, `by_recognized_at`

---

## Placement and Override Rules

### Promoted Listing Merge Algorithm (Canonical)

Given filters and pagination inputs:

1. Build organic result set exactly as existing listing browse query does.
2. Fetch active campaigns where:
   - `promoted_listings.status = "ACTIVE"`
   - `starts_at <= now < ends_at`
   - linked listing is `PUBLISHED`
3. Remove stale campaigns (see stale rule below).
4. For each page, place at most 3 promoted cards at slot indexes `[1, 5, 9]` (1-based UI positions).
5. If fewer than 3 eligible campaigns exist, fill remaining positions with organic items.
6. Do not duplicate a listing in the same page; promoted wins and organic duplicate is removed.

### Stale Listing Rule for Promotions

A campaign is treated as stale and must be auto-paused when any condition is true:

- linked listing status is not `PUBLISHED`
- linked listing was archived

Auto-paused campaigns set:

- `status = "PAUSED"`
- `stale_reason = "LISTING_INELIGIBLE"`

### Campaign Expiry Rule for Promotions

Campaign expiry is a separate trigger from stale detection:

- if `now >= ends_at` and `status = "ACTIVE"`, transition to `EXPIRED`
- if `now >= ends_at` and `status = "PAUSED"`, transition to `EXPIRED`

`EXPIRED` is terminal and cannot be resumed.

### Custom Quote Workflow (`GT_80K_CUSTOM`)

For closures where `monthly_rent_paise > 8000000`:

1. `internal.monetization.computeClosureFee` must return `requires_custom_quote = true` until quote exists.
2. Admin sets quote via `transactionFees.setCustomQuote({ closure_id, quoted_fee_paise, reason })`.
3. Quote write must be audited with actor + reason.
4. Only after quote exists can fee finalization write `FEE_GROSS`, `PASS_CREDIT`, `FEE_NET` ledger entries.

---

## Access Control & Configuration (Phase 36)

### Permissions

| Permission                | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `transaction_fees.manage` | Manage slab schedule and custom fee quotes      |
| `passes.purchase`         | Tenant purchase of Discovery Pass               |
| `passes.apply_credit`     | Internal pass-credit application on closure fee |
| `promotions.create`       | Owner campaign creation                         |
| `promotions.manage`       | Backoffice pause/expire/cancel controls         |
| `service_bundles.create`  | Create service bundle orders                    |
| `service_bundles.manage`  | Update service bundle lifecycle/completion      |
| `revenue.view`            | View monetization dashboard + ledger            |

### System Config Keys

| Key                                 | Type   | Description                          |
| ----------------------------------- | ------ | ------------------------------------ |
| `fee_slab_lt_20k_paise`             | number | Fee for rent < ₹20k (paise)          |
| `fee_slab_20k_40k_paise`            | number | Fee for rent ₹20k-40k (paise)        |
| `fee_slab_40k_80k_paise`            | number | Fee for rent ₹40k-80k (paise)        |
| `discovery_pass_price_paise`        | number | Discovery Pass price (paise)         |
| `discovery_pass_validity_days`      | number | Discovery Pass validity (days)       |
| `promotion_price_7d_paise`          | number | 7-day promotion price (paise)        |
| `promotion_price_14d_paise`         | number | 14-day promotion price (paise)       |
| `promotion_price_30d_paise`         | number | 30-day promotion price (paise)       |
| `promotion_max_slots_per_page`      | number | Max promoted slots per listings page |
| `service_bundle_enabled_types_json` | string | JSON array of enabled bundle types   |

---

## Business Rules

## Deterministic Fee Resolution (Canonical)

### Slab Resolution Logic (`monthly_rent_paise`)

Use this exact precedence order:

1. If `monthly_rent_paise < 2000000` -> `slab_key = "LT_20K"` -> `fee_gross_paise = 999900`
2. Else if `monthly_rent_paise < 4000000` -> `slab_key = "BT_20K_40K"` -> `fee_gross_paise = 1499900`
3. Else if `monthly_rent_paise <= 8000000` -> `slab_key = "BT_40K_80K"` -> `fee_gross_paise = 2299900`
4. Else (`monthly_rent_paise > 8000000`) -> `slab_key = "GT_80K_CUSTOM"` and fee must come from admin custom quote record.

For any closure:

- `pass_credit_paise = min(fee_gross_paise, eligible_pass_remaining_credit_paise)`
- `fee_net_paise = fee_gross_paise - pass_credit_paise`
- `fee_net_paise` must never be negative.

### Worked Examples (Deterministic)

| monthly_rent_paise | rent_display | slab_key        | fee_gross_paise | pass_credit_paise | fee_net_paise |
| ------------------ | ------------ | --------------- | --------------- | ----------------- | ------------- |
| `1900000`          | ₹19,000      | `LT_20K`        | `999900`        | `0`               | `999900`      |
| `3500000`          | ₹35,000      | `BT_20K_40K`    | `1499900`       | `500000`          | `999900`      |
| `4700000`          | ₹47,000      | `BT_40K_80K`    | `2299900`       | `2299900`         | `0`           |
| `9500000`          | ₹95,000      | `GT_80K_CUSTOM` | _admin quote_   | _depends on pass_ | _computed_    |

### Cross-Phase Contract Clarifications (Mandatory)

#### P36 x P09 (Closure & Payouts)

- `revenue_line_items` is platform monetization ledger only; it must not replace or mutate `payouts`.
- Guard bounty/payout remains in `payouts` (P09). If finance needs consolidated P&L, mirror payout cost into `revenue_line_items` using `source_type = "PAYOUT_ADJUSTMENT"` and negative `amount_paise` as a read-model convenience only.

#### P36 x P22 (Referrals)

- Referral milestone payout flow remains in `referral_milestones` and does not change.
- When a referral milestone is `PAID`, insert a balancing cost line item in `revenue_line_items` with `source_type = "REFERRAL_BONUS"` and negative `amount_paise`.

#### P36 x P32 (Incentive V3)

- P36 transaction fee calculation is independent of P32 commission engine.
- P32 computes internal contributor payouts from deal economics; P36 computes customer-facing monetization charges. Neither engine mutates the other engine's base amount.

#### P36 x P34 (Transaction Completion Rails, Optional Integration)

- P34 is not a hard dependency for P36 monetization core flows.
- Fee collection starts from `DUE`/`PARTIAL` in P36 and can be reconciled to `PAID` from any valid payment evidence source.
- When P34 exists, linked `rental_transactions.status = COMPLETED` provides a canonical reconciliation signal to move `fee_collection_status` from `DUE/PARTIAL -> PAID`.

1. **Fee slabs are deterministic**: Base fee uses monthly rent bands - `<₹20K => ₹9,999`, `₹20K-₹40K => ₹14,999`, `₹40K-₹80K => ₹22,999`, `>₹80K => custom quote`.
2. **Money storage**: All monetary values are stored in paise (`number`, integer), never floating INR.
3. **Pass crediting order**: Discovery Pass credit is applied before final fee collection amount is computed.
4. **Pass validity**: If no qualifying closure occurs, pass credit remains valid for 6 months from purchase date.
5. **Pass consumption**: A pass can be fully or partially consumed depending on closure fee; remaining credit persists until expiry.
6. **Promotion cap**: Search ranking can surface at most 3 promoted listings per page regardless of active campaign volume.
7. **Promotion labeling**: Every boosted card must display `Promoted` badge; undisclosed paid boosts are disallowed.
8. **Promotion eligibility**: Only `PUBLISHED` and non-stale listings are eligible for active promotion placement.
9. **Service commission recognition**: Commission is recognized only when service status reaches `COMPLETED`.
10. **Custom quote governance**: `GT_80K_CUSTOM` fee requires admin-set amount and audit trail reason.
11. **Revenue ledger integrity**: Every monetization mutation that changes financial state must write normalized `revenue_line_items` rows.
12. **Public transparency**: Public fee content must match active slab policy and show clear non-hidden pricing language.

---

## Edge Cases

- **Deal falls through after pass purchase**: Credit is retained for up to 6 months; no automatic burn.
- **Deal falls through after partial pass application**: Applied credit remains consumed for that processed transaction event; remaining balance continues until expiry.
- **Promoted listing becomes stale/unresponsive**: Campaign auto-pauses and placement is removed from search.
- **Listing archived during active campaign**: Campaign status moves to `PAUSED` with stale reason; no visibility delivery afterward.
- **Tenant has multiple active passes**: Oldest-expiring pass is consumed first to reduce breakage and simplify reconciliation.
- **Partner service cancelled mid-way**: No commission recognition; optional cancellation fee is recorded as separate revenue line item.
- **Custom quote not configured for high-rent closure**: Fee calculation blocks final settlement and raises admin action required.
