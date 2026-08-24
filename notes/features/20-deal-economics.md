# Feature: Deal Economics & Ops Transparency

> **Priority**: Phase 30 (after Rent Negotiation)
> **Personas**: Admin/Ops Managers (full P&L breakdown), Guards (payout amount only), Super Admin (config + overrides)
> **Dependencies**: Closure & Payouts (F07), Rent Negotiation (F19), Roles & Permissions

## Purpose

Every closed deal generates revenue, incurs costs, and produces a profit. Today, that math lives in spreadsheets or in ops managers' heads. This feature brings it into the platform: a per-deal P&L that is calculated automatically, locked when the closure is confirmed, and visible to the right people.

The primary goal is trust. Ops managers need to see that their commission is calculated on real profit after all costs are deducted, not on a number the company controls in a black box. Guards need to see their bounty in context without seeing the full deal financials. Platform-only metrics (platform retained share, GST liability) stay hidden from both.

Secondary goal: a foundation for profit-sharing compensation models where ops manager pay is tied directly to deal quality and margin.

---

## Part 1: Business Model

### Revenue per Deal

Brokerage in India is typically collected from both sides of a rental transaction. The platform charges each party a fraction of one month's rent.

**Example deal: ₹18,000/month rent**

| Revenue Line               | Calculation     | Amount      |
| -------------------------- | --------------- | ----------- |
| Owner brokerage (standard) | 15 days of rent | ₹9,000      |
| Tenant brokerage           | 15 days of rent | ₹9,000      |
| **Gross revenue**          | Owner + Tenant  | **₹18,000** |

**Owner discount/incentive**: To close deals faster and build owner relationships, the platform may offer owners a discount on their brokerage. The standard discount is 5 days, reducing the owner's effective charge from 15 days to 10 days.

| After Discount              | Calculation          | Amount      |
| --------------------------- | -------------------- | ----------- |
| Owner brokerage (effective) | 10 days of rent      | ₹6,000      |
| Tenant brokerage            | 15 days of rent      | ₹9,000      |
| **Net revenue**             | After owner discount | **₹15,000** |

### Costs per Deal

| Cost Line               | Type                            | Amount        |
| ----------------------- | ------------------------------- | ------------- |
| Guard bounty            | Variable, manually set per lead | ₹1,000–₹2,000 |
| Travel + transport      | Fixed default                   | ~₹500         |
| Org overhead            | Fixed default                   | ~₹500         |
| Ancillary service costs | Per service (e.g., cleaning)    | Variable      |

### Profit Calculation

```
Profit = Net Revenue - Guard Bounty - Travel - Org Expenses - All External Costs
```

**Example**: ₹15,000 - ₹2,000 - ₹500 - ₹500 = ₹12,000 profit

### Ops Manager Commission

Ops managers earn a percentage of **profit**, not revenue. This aligns their incentive with deal quality and cost discipline.

| Tier   | Rate | Condition                                       |
| ------ | ---- | ----------------------------------------------- |
| Base   | 15%  | Default for all ops managers                    |
| Mid    | 18%  | Volume/quality threshold (future)               |
| Senior | 22%  | High-volume, high-quality track record (future) |

**Example**: ₹12,000 profit × 18% = ₹2,160 ops commission

Commission is calculated on **ex-GST commercial profit**. GST is a pass-through tax; ops managers are not paid a share of tax collected.

### Ancillary Revenue Streams

Services like flat cleaning can be offered as add-ons. These are tracked in the same profit pool for simplicity in V1.

| Service       | Charge | Cost | Margin |
| ------------- | ------ | ---- | ------ |
| Flat cleaning | ₹500   | ₹200 | ₹300   |

### Dynamic Ancillary Costs

Deals involve many ad-hoc costs beyond guard bounty and travel. Each cost has two prices: what the platform charges the client (owner or tenant) and what the platform actually pays the vendor or worker. The margin is the spread.

| Service                       | Charged To | Charge | Actual Cost | Margin | GST Rate | Payment Mode   |
| ----------------------------- | ---------- | ------ | ----------- | ------ | -------- | -------------- |
| Flat painting (2BHK)          | Owner      | ₹5,000 | ₹3,000      | ₹2,000 | 18%      | Vendor invoice |
| Deep cleaning                 | Owner      | ₹500   | ₹200        | ₹300   | 18%      | Vendor invoice |
| Paint repair (minor touch-up) | Owner      | ₹1,500 | ₹600        | ₹900   | 18%      | Vendor invoice |
| Meat/food for handover event  | Platform   | ₹0     | ₹800        | -₹800  | Exempt   | Petty cash     |
| Transport (guard + ops)       | Platform   | ₹0     | ₹500        | -₹500  | Exempt   | Petty cash     |
| Key duplication               | Platform   | ₹0     | ₹100        | -₹100  | Exempt   | Petty cash     |

Key principles:

- **Two prices per cost**: What we charge the client (`charge_paise`) vs what we pay the vendor (`cost_paise`). The margin is derived at read time, never stored.
- **Who pays**: Some costs are billed to the owner (painting, cleaning, repairs). Some are absorbed by the platform (travel, food, keys). In future, some may be charged to the tenant.
- **Dynamic labels**: Ops managers can add any cost type — not just predefined categories. Templates provide common defaults, but free-text labels are supported for one-off expenses.
- **Payment mode**: Determines the accounting bucket. Vendor invoices are proper bills. Petty cash covers small cash expenses. UPI and bank transfer are tracked separately.
- **Platform-absorbed costs reduce profit directly**: If the platform pays ₹500 for transport but charges the client ₹0, that ₹500 comes straight out of the profit pool.

### GST Handling

Brokerage attracts 18% GST in India. Every revenue and cost line tracks three amounts:

- `base_paise`: Pre-tax amount
- `gst_paise`: GST component (18% of base for taxable lines, 0 for non-taxable)
- `total_paise`: base + gst

The UI shows two profit figures:

- **Commercial Profit (ex-GST)**: The number used for commission calculation
- **Cash Total (incl. GST)**: The actual cash flow including tax collected and paid

---

## Part 2: Transparency Principle

The platform's transparency model is explicit: ops managers see every rupee of revenue and every cost line item for deals they manage. Nothing is hidden behind a "net" number.

This is not just a UX choice. It is a trust mechanism. When an ops manager sees that their commission is calculated after guard bounty, travel, and overhead are deducted, they understand the company is not hiding margin. When they see the GST lines separately, they understand they are not being paid a share of tax.

**Real-time per-deal visibility**: Commission is visible the moment a closure is confirmed, not at month-end.

**Historical comparisons**: The UI surfaces context like "This deal earned you ₹2,250 vs your last month's average of ₹1,800" so managers can track their own performance.

**Framing**: The commission line is labeled "Your share of deal profit" with the rate shown explicitly (e.g., "18%"). The platform retained share is shown alongside it so the split is transparent.

### Precedents from Other Platforms

These real-world patterns informed the design:

- **Buffer's open-book model**: Full company financials visible to all employees. Builds trust by removing information asymmetry.
- **Civitai's withdrawal breakdown**: Shows "USD amount / Platform fee / You'll receive" side by side, with the creator's amount in green bold. The split is never hidden.
- **Dub.co's partner payouts**: Real-time analytics on $10M+ in partner payouts. Partners see their earnings update as conversions happen, not at month-end.
- **HiEvents' side-by-side preview**: Live preview of how configuration changes affect output, so users understand the system rather than just accepting a number.

The common thread: show the math, not just the result.

---

## Part 3: Data Model

### Schema Migration

These tables do NOT exist yet. They must be added to `convex/schema.ts`.

```ts
// convex/schema.ts (NEW additions)
const dealEconomicsStatusValidator = v.union(
  v.literal("draft"),
  v.literal("confirmed"),
  v.literal("voided"),
);

const dealEconomicsLineTypeValidator = v.union(
  v.literal("revenue"),
  v.literal("cost"),
  v.literal("discount"),
  v.literal("tax"),
  v.literal("commission"),
);

const dealEconomicsChargedToValidator = v.union(
  v.literal("owner"),
  v.literal("tenant"),
  v.literal("platform"),
);

const dealEconomicsPaymentModeValidator = v.union(
  v.literal("vendor_invoice"),
  v.literal("petty_cash"),
  v.literal("upi"),
  v.literal("bank_transfer"),
);

// Also extend existing systemConfigKeyValidator with NEW economics keys:
// - economics.owner_discount_policy
// - economics.guard_bounty_policy
// - economics.ops_commission_rates_bps
// - economics.cost_templates
// - economics.formula_version

export default defineSchema({
  // ...existing tables...

  deal_economics: defineTable({
    closure_id: v.id("closures"),
    lead_id: v.id("leads"),
    ops_admin_id: v.id("users"),
    formula_version: v.string(),
    config_snapshot: v.string(),
    gross_revenue_paise: v.number(),
    owner_discount_paise: v.number(),
    net_revenue_paise: v.number(),
    total_costs_paise: v.number(),
    gst_collected_paise: v.number(),
    gst_paid_paise: v.number(),
    profit_ex_gst_paise: v.number(),
    ops_commission_rate_bps: v.number(),
    ops_commission_paise: v.number(),
    platform_retained_paise: v.number(),
    status: dealEconomicsStatusValidator,
    calculated_at: v.number(),
    confirmed_at: v.optional(v.number()),
    voided_at: v.optional(v.number()),
    voided_reason: v.optional(v.string()),
  })
    .index("by_closure_id", ["closure_id"])
    .index("by_ops_admin_id", ["ops_admin_id", "status"])
    .index("by_lead_id", ["lead_id"]),

  deal_economics_line_items: defineTable({
    deal_economics_id: v.id("deal_economics"),
    line_type: dealEconomicsLineTypeValidator,
    category_code: v.string(),
    label: v.string(),
    charged_to: dealEconomicsChargedToValidator,
    charge_paise: v.number(),
    cost_paise: v.number(),
    gst_rate_bps: v.number(),
    vendor_name: v.optional(v.string()),
    vendor_phone: v.optional(v.string()),
    vendor_invoice_ref: v.optional(v.string()),
    payment_mode: dealEconomicsPaymentModeValidator,
    charge_collected_at: v.optional(v.number()),
    cost_paid_at: v.optional(v.number()),
    created_by: v.id("users"),
    created_at: v.number(),
  })
    .index("by_deal_economics_id", ["deal_economics_id", "created_at"])
    .index("by_category", ["deal_economics_id", "category_code"]),
});
```

Relationship to existing closure fields:

- `deal_economics` is a strict 1:1 extension of `closures` via `deal_economics.closure_id`.
- Existing closure summary fields remain canonical on `closures`: `commission_amount`, `brokerage_tenant_side`, `brokerage_owner_side`.
- `deal_economics` stores the auditable P&L breakdown and line-level calculations that roll up to those closure summary values.

### New Table: `deal_economics`

One record per closure. Created automatically when a closure is created, frozen when the closure is confirmed.

| Field                     | Type                                                                       | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `closure_id`              | `v.id("closures")`                                                         | Link to the closure record                                                 |
| `lead_id`                 | `v.id("leads")`                                                            | Denormalized for fast queries without joining through closures             |
| `ops_admin_id`            | `v.id("users")`                                                            | The ops manager who managed this deal                                      |
| `formula_version`         | `v.string()`                                                               | Version string from `economics.formula_version` config at calculation time |
| `config_snapshot`         | `v.string()`                                                               | JSON snapshot of all economics config values used in this calculation      |
| `gross_revenue_paise`     | `v.number()`                                                               | Sum of all revenue lines before discounts                                  |
| `owner_discount_paise`    | `v.number()`                                                               | Total owner-side discount applied                                          |
| `net_revenue_paise`       | `v.number()`                                                               | gross_revenue - owner_discount                                             |
| `total_costs_paise`       | `v.number()`                                                               | Sum of all cost lines (guard bounty + travel + overhead + ancillary costs) |
| `gst_collected_paise`     | `v.number()`                                                               | Total GST on revenue lines                                                 |
| `gst_paid_paise`          | `v.number()`                                                               | Total GST on deductible cost lines (input credit)                          |
| `profit_ex_gst_paise`     | `v.number()`                                                               | net_revenue_ex_gst - total_costs_ex_gst. Basis for commission.             |
| `ops_commission_rate_bps` | `v.number()`                                                               | Commission rate in basis points (e.g., 1800 = 18%)                         |
| `ops_commission_paise`    | `v.number()`                                                               | profit_ex_gst \* rate_bps / 10000. Never negative.                         |
| `platform_retained_paise` | `v.number()`                                                               | profit_ex_gst - ops_commission                                             |
| `status`                  | `v.union(v.literal("draft"), v.literal("confirmed"), v.literal("voided"))` | Lifecycle state                                                            |
| `calculated_at`           | `v.number()`                                                               | Unix ms when economics were first calculated                               |
| `confirmed_at`            | `v.optional(v.number())`                                                   | Unix ms when locked (on closure confirm)                                   |
| `voided_at`               | `v.optional(v.number())`                                                   | Unix ms when voided (on closure cancel)                                    |
| `voided_reason`           | `v.optional(v.string())`                                                   | Required when voided                                                       |

**Indexes**:

- `by_closure_id`: `["closure_id"]` — primary lookup
- `by_ops_admin_id`: `["ops_admin_id", "status"]` — ops earnings dashboard
- `by_lead_id`: `["lead_id"]` — cross-reference from lead detail

### New Table: `deal_economics_line_items`

Append-only ledger of every revenue, cost, and commission line. Never mutated after creation. Reversals are written as new entries with negative amounts.

Each cost line tracks TWO prices: what we charge the client and what we pay the vendor. The margin (charge minus cost) is derived at read time, never stored. This avoids reconciliation bugs between stored and computed values.

| Field                 | Type                                                                                                                 | Description                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `deal_economics_id`   | `v.id("deal_economics")`                                                                                             | Parent economics record                                                                        |
| `line_type`           | `v.union(v.literal("revenue"), v.literal("cost"), v.literal("discount"), v.literal("tax"), v.literal("commission"))` | Classification for grouping in UI                                                              |
| `category_code`       | `v.string()`                                                                                                         | Template code (e.g., `"PAINT"`, `"CLEAN"`, `"TRANSPORT"`) or `"CUSTOM"` for free-text entries  |
| `label`               | `v.string()`                                                                                                         | Human-readable label. Free text — ops can write anything. E.g., "Flat painting - 2BHK Tower A" |
| `charged_to`          | `v.union(v.literal("owner"), v.literal("tenant"), v.literal("platform"))`                                            | Who pays. `"platform"` means the company absorbs the cost (charge is 0).                       |
| `charge_paise`        | `v.number()`                                                                                                         | What we bill the client (owner or tenant). 0 if platform absorbs.                              |
| `cost_paise`          | `v.number()`                                                                                                         | What we actually pay the vendor or worker. Always populated.                                   |
| `gst_rate_bps`        | `v.number()`                                                                                                         | GST rate in basis points. 1800 = 18%, 1200 = 12%, 0 = exempt.                                  |
| `vendor_name`         | `v.optional(v.string())`                                                                                             | Who we paid. Null for petty cash or platform-absorbed costs with no vendor.                    |
| `vendor_phone`        | `v.optional(v.string())`                                                                                             | Vendor contact. 10 digits, no formatting.                                                      |
| `vendor_invoice_ref`  | `v.optional(v.string())`                                                                                             | Vendor's bill or receipt reference number.                                                     |
| `payment_mode`        | `v.union(v.literal("vendor_invoice"), v.literal("petty_cash"), v.literal("upi"), v.literal("bank_transfer"))`        | How the cost was paid. Determines accounting bucket for financial tracking.                    |
| `charge_collected_at` | `v.optional(v.number())`                                                                                             | Unix ms when client payment was received. Null if not yet collected.                           |
| `cost_paid_at`        | `v.optional(v.number())`                                                                                             | Unix ms when vendor was paid. Null if not yet paid.                                            |
| `created_by`          | `v.id("users")`                                                                                                      | Admin who created this line.                                                                   |
| `created_at`          | `v.number()`                                                                                                         | Unix ms.                                                                                       |

**Indexes**:

- `by_deal_economics_id`: `["deal_economics_id", "created_at"]` — fetch all lines for a deal in order
- `by_category`: `["deal_economics_id", "category_code"]` — filter by category

**Derived fields** (computed at query/UI time, NOT stored):

| Derived Field           | Formula                                      | Notes                                       |
| ----------------------- | -------------------------------------------- | ------------------------------------------- |
| `margin_paise`          | `charge_paise - cost_paise`                  | Can be negative for platform-absorbed costs |
| `gst_on_charge_paise`   | `round(charge_paise * gst_rate_bps / 10000)` | GST collected from client                   |
| `gst_on_cost_paise`     | `round(cost_paise * gst_rate_bps / 10000)`   | GST paid to vendor (input credit)           |
| `charge_with_gst_paise` | `charge_paise + gst_on_charge_paise`         | Total client owes                           |
| `cost_with_gst_paise`   | `cost_paise + gst_on_cost_paise`             | Total we pay vendor                         |
| `is_collected`          | `charge_collected_at !== null`               | Boolean for UI badges                       |
| `is_paid`               | `cost_paid_at !== null`                      | Boolean for UI badges                       |

### system_config Keys

Five new keys under the `economics.*` namespace. All stored as JSON strings in the existing `system_config` table.

#### `economics.owner_discount_policy`

Controls how the owner-side discount is calculated.

```json
{
  "type": "days_of_rent",
  "days": 5,
  "applies_to": "owner_side",
  "min_rent_for_discount_paise": 0
}
```

| Field                         | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `type`                        | `"days_of_rent"` — discount expressed as N days of monthly rent     |
| `days`                        | Number of days to deduct from owner brokerage                       |
| `applies_to`                  | Always `"owner_side"` in V1                                         |
| `min_rent_for_discount_paise` | Minimum rent below which discount is not applied (0 = always apply) |

#### `economics.guard_bounty_policy`

Defines the allowed range for guard bounties and the approval threshold.

```json
{
  "default_paise": 150000,
  "min_paise": 100000,
  "max_paise": 200000,
  "requires_approval_above_paise": 150000
}
```

| Field                           | Description                                                         |
| ------------------------------- | ------------------------------------------------------------------- |
| `default_paise`                 | Pre-filled value when admin creates a bounty line item (₹1,500)     |
| `min_paise`                     | Minimum allowed bounty (₹1,000)                                     |
| `max_paise`                     | Maximum allowed bounty (₹2,000)                                     |
| `requires_approval_above_paise` | Bounties above this amount require a second admin approval (₹1,500) |

#### `economics.ops_commission_rates_bps`

Defines the allowed commission rates and which rate applies to each ops profile.

```json
{
  "allowed_rates_bps": [1500, 1800, 2200],
  "default_rate_bps": 1500,
  "rate_assignment": "per_ops_profile"
}
```

| Field               | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `allowed_rates_bps` | Whitelist of valid rates. Prevents arbitrary rates being set.           |
| `default_rate_bps`  | Rate used when no per-profile rate is configured                        |
| `rate_assignment`   | `"per_ops_profile"` — rate is stored on the user's admin profile record |

#### `economics.cost_templates`

Standard cost categories with default pricing. Ops managers select from these templates when adding cost lines, or type a custom label for one-off expenses.

```json
{
  "templates": [
    {
      "code": "GUARD_BOUNTY",
      "label": "Guard Bounty",
      "charged_to": "platform",
      "default_charge_paise": 0,
      "default_cost_paise": 150000,
      "gst_rate_bps": 0,
      "payment_mode": "upi",
      "is_mandatory": true
    },
    {
      "code": "TRAVEL",
      "label": "Travel & Transport",
      "charged_to": "platform",
      "default_charge_paise": 0,
      "default_cost_paise": 50000,
      "gst_rate_bps": 0,
      "payment_mode": "petty_cash",
      "is_mandatory": false
    },
    {
      "code": "PAINTING",
      "label": "Flat Painting",
      "charged_to": "owner",
      "default_charge_paise": 500000,
      "default_cost_paise": 300000,
      "gst_rate_bps": 1800,
      "payment_mode": "vendor_invoice",
      "is_mandatory": false
    },
    {
      "code": "CLEANING",
      "label": "Deep Cleaning",
      "charged_to": "owner",
      "default_charge_paise": 50000,
      "default_cost_paise": 20000,
      "gst_rate_bps": 1800,
      "payment_mode": "vendor_invoice",
      "is_mandatory": false
    },
    {
      "code": "REPAIRS",
      "label": "Repairs & Maintenance",
      "charged_to": "owner",
      "default_charge_paise": 0,
      "default_cost_paise": 0,
      "gst_rate_bps": 1800,
      "payment_mode": "vendor_invoice",
      "is_mandatory": false
    },
    {
      "code": "CATERING",
      "label": "Food / Event Catering",
      "charged_to": "platform",
      "default_charge_paise": 0,
      "default_cost_paise": 0,
      "gst_rate_bps": 0,
      "payment_mode": "petty_cash",
      "is_mandatory": false
    }
  ],
  "allow_custom_labels": true,
  "custom_requires_approval": false
}
```

| Field                      | Description                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `code`                     | Unique template code. Used as `category_code` on line items when selected.         |
| `label`                    | Default label. Ops can override with free text per line item.                      |
| `charged_to`               | Default payer. Ops can override per line.                                          |
| `default_charge_paise`     | Pre-filled charge amount. 0 means ops must enter manually.                         |
| `default_cost_paise`       | Pre-filled cost amount. 0 means ops must enter manually.                           |
| `gst_rate_bps`             | Default GST rate in basis points. 1800 = 18%.                                      |
| `payment_mode`             | Default payment mode. Determines accounting bucket.                                |
| `is_mandatory`             | If true, this line is auto-created on every new deal.                              |
| `allow_custom_labels`      | Global: if true, ops can add lines not in the template list using `"CUSTOM"` code. |
| `custom_requires_approval` | Global: if true, custom-label lines need admin approval before deal confirmation.  |

#### `economics.formula_version`

Version string used to stamp every `deal_economics` record. When the formula changes, bump this version so historical records can be audited against the formula that was active when they were calculated.

```json
{
  "version": "v1.0",
  "effective_from": "2026-03-01"
}
```

---

## Part 4: Calculation Rules

### Canonical Formula

```
gross_revenue = owner_brokerage_base + tenant_brokerage_base + ancillary_charges_base

owner_discount = owner_brokerage_base * (discount_days / standard_days)
  where standard_days = 15 (the full brokerage period)
  and discount_days = economics.owner_discount_policy.days

net_revenue_base = gross_revenue - owner_discount

total_costs_base = guard_bounty + travel + org_overhead + ancillary_costs_base

gst_collected = sum(gst_paise) for all revenue line_items
gst_paid = sum(gst_paise) for all deductible cost line_items

profit_ex_gst = net_revenue_base - total_costs_base

ops_commission = max(0, floor(profit_ex_gst * ops_commission_rate_bps / 10000))

platform_retained = profit_ex_gst - ops_commission
```

All intermediate values are stored as line items in `deal_economics_line_items`. The summary totals on `deal_economics` are derived from these line items and stored for fast reads.

### Brokerage Calculation

Brokerage uses the existing closure-side brokerage fields (`brokerage_owner_side`, `brokerage_tenant_side`) when already captured. During draft calculations where those are not finalized yet, derive from lead/listing data using `leads.rent_expected` with `listings.rent_monthly` as fallback. The formula:

```
brokerage_per_side_base = floor(monthly_rent_paise * brokerage_days / 30)
```

Where `brokerage_days` is 15 for both sides by default. The owner discount reduces the owner side:

```
owner_brokerage_effective_days = standard_days - discount_days
owner_brokerage_base = floor(monthly_rent_paise * owner_brokerage_effective_days / 30)
```

### Edge Cases

**Zero or negative profit**: `ops_commission = 0`. Commission is never negative. The platform absorbs the loss. No clawback from ops managers.

**Partial brokerage collected**: If only the tenant side has been collected (owner refused to pay), `is_realized` on the owner brokerage line item is set to `false`. Commission is calculated on **realized** revenue only, not planned. The unrealized line is still shown for transparency.

**Very low rent**: A minimum brokerage floor is enforced so net revenue cannot silently go negative. If `net_revenue_base < 0` after applying the owner discount, the discount is capped so that `net_revenue_base >= 0`. A warning is shown to the admin.

**Closure cancelled after economics confirmed**: Reversal line items are written to `deal_economics_line_items` with negative amounts. The `deal_economics` record is voided. No line items are deleted or mutated.

**Ancillary services with zero margin**: Still tracked. A cleaning service with `charge_paise == cost_paise` produces a revenue line and a cost line that net to zero. This is correct and expected.

**Config changes after calculation**: The `config_snapshot` field on `deal_economics` captures the exact config values used. Future config changes do not retroactively affect historical records.

### Per-Line Cost Calculations (Derived at Read Time)

For each line item:

```
margin = charge_paise - cost_paise
gst_on_charge = round(charge_paise * gst_rate_bps / 10000)
gst_on_cost = round(cost_paise * gst_rate_bps / 10000)
charge_with_gst = charge_paise + gst_on_charge
cost_with_gst = cost_paise + gst_on_cost
net_gst_on_line = gst_on_charge - gst_on_cost
```

For deal-level totals, costs are grouped by `charged_to`:

```
total_client_charges = sum(charge_paise) where charged_to in ("owner", "tenant")
total_platform_absorbed = sum(cost_paise) where charged_to = "platform"
ancillary_vendor_costs = sum(cost_paise) where charged_to in ("owner", "tenant")
ancillary_margin = total_client_charges - ancillary_vendor_costs

Full profit formula (expanded):
  gross_revenue = owner_brokerage + tenant_brokerage + total_client_charges
  total_costs = guard_bounty + total_platform_absorbed + ancillary_vendor_costs
  profit_ex_gst = gross_revenue - total_costs - owner_discount
  ops_commission = max(0, profit_ex_gst * rate_bps / 10000)
```

Platform-absorbed costs (travel, catering, key duplication) reduce profit directly. Owner/tenant-charged services only reduce profit by their vendor cost — the charge portion is revenue.

---

## Part 5: Lifecycle & State Machine

### deal_economics.status

```
draft ──────────────────────────────► confirmed
  │                                       │
  │                                       │
  └──────────────────────────────────► voided
                                      (terminal)
```

| Transition             | Trigger                                  | Who                                            |
| ---------------------- | ---------------------------------------- | ---------------------------------------------- |
| Created as `draft`     | Closure is created                       | System (auto)                                  |
| `draft` → `confirmed`  | Closure status moves to `CONFIRMED`      | System (auto, triggered by `closures.confirm`) |
| `confirmed` → `voided` | Closure is cancelled                     | System (auto, triggered by `closures.cancel`)  |
| `draft` → `voided`     | Closure is cancelled before confirmation | System (auto)                                  |

### Key Lifecycle Rules

**Auto-calculation on closure create**: When `closures.create` is called, the system immediately calculates economics and creates the `deal_economics` record in `draft` status, along with all line items. The admin sees the economics card immediately.

**Frozen on confirm**: When `closures.confirm` is called, `deal_economics.status` moves to `confirmed`. No fields on `deal_economics` or its line items can be edited after this point without going through the "reopen with reason" flow (Super Admin only, with mandatory audit log entry).

**Cancellation writes reversals**: When a confirmed closure is cancelled, the system writes reversal line items (negative amounts) to `deal_economics_line_items` and sets `deal_economics.status = "voided"`. The original line items are never touched.

**Config snapshot**: At calculation time, the current values of all five `economics.*` system_config keys are serialized to JSON and stored in `deal_economics.config_snapshot`. This is the audit record of what rules applied to this deal.

### Canonical Enum Mapping & Validation

All status validation follows the transition rules and validation pattern in [State Machines](../04-state-machines.md).

| Entity                | Canonical Values                                                                     |
| --------------------- | ------------------------------------------------------------------------------------ |
| Lead status           | `SUBMITTED`, `NEED_INFO`, `POTENTIAL_DUPLICATE`, `VERIFIED`, `REJECTED`, `DUPLICATE` |
| Visit status          | `ASSIGNED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`          |
| Closure status        | `PENDING`, `CONFIRMED`, `CANCELLED`                                                  |
| Payout status         | `pending`, `approved`, `disbursed`, `failed`, `voided`                               |
| Deal economics status | `draft`, `confirmed`, `voided`                                                       |

Use only the canonical lowercase payout statuses above.

New deal economics statuses must be added to `lib/constants.ts` and `notes/13-constants-reference.md` during implementation.

---

## Part 6: Anti-Gaming & Governance Controls

### 1. Fixed Deal Assignment

Ops managers do not self-select which deals they manage. Deals are assigned by a Super Admin or by the system based on society/territory. This prevents cherry-picking high-margin deals.

### 2. Bounty Override Approvals

If an admin sets a guard bounty above `economics.guard_bounty_policy.requires_approval_above_paise`, the economics record stays in `draft` and a second admin must approve the bounty amount before the economics can be confirmed. The approval is logged in `audit_logs`.

### 3. Locked Cost Taxonomy

Cost categories are defined in `economics.cost_templates` and can only be modified by Super Admin via the system config. Ops managers cannot create new cost categories or relabel existing ones. The distinction between "external" costs (guard bounty, cleaning) and "internal" costs (org overhead) is fixed in the config.

### 4. Reason Codes for Overrides

Any manual edit to a field that affects profit or commission after the economics record is in `confirmed` status requires:

- A mandatory reason string (minimum 20 characters)
- An audit log entry with the before/after values, the admin's user ID, and the timestamp

This applies to: bounty amount changes, cost line additions or removals, commission rate changes, and revenue line adjustments.

### 5. Balanced Scorecard (Future)

In a future phase, ops manager commission tiers will be gated not just on volume but on a balanced scorecard:

| Dimension | Weight | Metrics                                   |
| --------- | ------ | ----------------------------------------- |
| Financial | 60%    | Margin per deal, revenue per deal         |
| Customer  | 20%    | Tenant satisfaction, owner retention      |
| Process   | 10%    | Closure speed, documentation completeness |
| Learning  | 10%    | Training completion, process adherence    |

This is out of scope for Phase 30 MVP but the data model should not preclude it.

---

## Part 7: UI Specifications

### Deal Economics Card (Closure Detail Page)

Displayed on the admin closure detail page, below the closure summary. Visible only to users with `economics.view` permission.

```
+-----------------------------------------------------------+
| Deal Economics                       [Locked] [Info]      |
+-----------------------------------------------------------+
|                                                           |
|  REVENUE                                                  |
|  Owner brokerage (10 days)              +6,000            |
|  Tenant brokerage (15 days)             +9,000            |
|  - - - - - - - - - - - - - - - - - - - - - - - - - - - - |
|  Brokerage subtotal                    +15,000            |
|                                                           |
|  SERVICES (charged to owner)       Charge    Cost         |
|  Flat painting - 2BHK              +5,000   -3,000       |
|  Deep cleaning                        +500     -200       |
|  Paint repair (minor)              +1,500     -600       |
|  - - - - - - - - - - - - - - - - - - - - - - - - - - - - |
|  Services subtotal                  +7,000   -3,800       |
|  Services margin                             +3,200       |
|                                                           |
|  COSTS (platform absorbed)                                |
|  Guard bounty (Raju)                         -2,000       |
|  Travel + transport                            -500       |
|  Catering (handover event)                     -800       |
|  Key duplication                               -100       |
|  - - - - - - - - - - - - - - - - - - - - - - - - - - - - |
|  Platform costs                              -3,400       |
|                                                           |
|  PROFIT                                                   |
|  Commercial profit (ex-GST)               +14,800         |
|  GST collected                             +3,960         |
|  GST paid (vendor input credit)              -684         |
|  - - - - - - - - - - - - - - - - - - - - - - - - - - - - |
|                                                           |
|  YOUR COMMISSION (18%)         +2,664   [green, bold]     |
|  Platform share (82%)         +12,136                     |
|                                                           |
|  Status: CONFIRMED     Calculated: 18 Feb 2026           |
+-----------------------------------------------------------+
```

The card groups line items by `charged_to`:

- **Revenue**: Brokerage lines (always present, from closure data)
- **Services (charged to owner/tenant)**: Two-column layout showing both charge and cost, with margin subtotal
- **Costs (platform absorbed)**: Single-column layout showing only cost (no charge column — platform eats it)
- **Profit**: Aggregates everything into commercial profit, then shows commission split

**Card states**:

| State       | Visual                                   | Behavior                                       |
| ----------- | ---------------------------------------- | ---------------------------------------------- |
| `draft`     | No lock icon, "Draft" badge              | All line items editable by admin               |
| `confirmed` | Lock icon, "Confirmed" badge             | Read-only. Super Admin can reopen with reason. |
| `voided`    | Strikethrough on amounts, "Voided" badge | Read-only. Reversal entries shown below.       |

**Info tooltip** (the [Info] button): Explains the formula in plain language. "Commission is calculated on commercial profit after all costs are deducted. GST is excluded from the commission base."

**Unrealized revenue lines**: Shown with a grey italic label and a "Not yet collected" badge. Excluded from the commission calculation.

### Ops Earnings Dashboard (Phase 30 Full Vision)

A dedicated page at `/admin/ops-earnings` for ops managers to track their commission history.

**Summary row** (top of page):

- Total deals this month
- Total commission earned this month
- Average margin per deal
- Comparison to last month (delta, color-coded)

**Per-deal table**:

| Column      | Description        |
| ----------- | ------------------ |
| Deal        | Building + Flat    |
| Closed      | Date               |
| Net Revenue | ex-GST             |
| Costs       | Total              |
| Profit      | ex-GST             |
| Rate        | Commission %       |
| Commission  | Amount earned      |
| Status      | confirmed / voided |

Sortable by any column. Filterable by date range and status.

**Trend chart**: Commission earned per month, last 6 months. Bar chart using Recharts (consistent with existing admin dashboard charts).

---

## Part 8: Permissions

| Permission            | Who                       | What                                          |
| --------------------- | ------------------------- | --------------------------------------------- |
| `economics.view`      | Ops managers, Super Admin | See the Deal Economics card on closure detail |
| `economics.calculate` | System (internal)         | Trigger P&L calculation on closure create     |
| `economics.confirm`   | Super Admin               | Lock economics when closure is confirmed      |
| `economics.override`  | Super Admin, Finance role | Edit locked economics with mandatory reason   |
| `economics.void`      | Super Admin               | Void economics when closure is cancelled      |
| `economics.config`    | Super Admin               | Edit `economics.*` system_config keys         |

These permission strings must be added to `lib/constants.ts` and seeded into the `roles` table for the relevant default roles.

These are NEW permission additions and do not exist in `lib/constants.ts` today.

Guards have no economics permissions. The guard earnings page (`/guard/earnings`) continues to show only the payout amount, unchanged.

---

## Part 9: Convex Functions

### Queries

```
dealEconomics.getByClosureId({ closure_id }) → DealEconomics + LineItems[]
// Requires: economics.view permission
// Returns: full economics record with all line items, sorted by created_at

dealEconomics.getOpsEarnings({ ops_admin_id?, date_from?, date_to?, pagination })
// Requires: economics.view permission
// If ops_admin_id not provided, uses auth context (ops manager sees own earnings)
// Returns: paginated list of confirmed deal_economics records with summary totals
```

### Mutations

```
dealEconomics.calculate({ closure_id })
// Called internally by closures.create
// Creates deal_economics (draft) + all line_items
// Snapshots config at calculation time
// Requires: economics.calculate (internal only)

dealEconomics.confirm({ closure_id })
// Called internally by closures.confirm
// Transitions draft → confirmed
// Requires: economics.confirm

dealEconomics.void({ closure_id, reason })
// Called internally by closures.cancel
// Transitions draft/confirmed → voided
// Writes reversal line items if status was confirmed
// Requires: economics.void

dealEconomics.override({ deal_economics_id, field, new_value_paise, reason })
// Only when status = confirmed
// Requires: economics.override
// Writes audit log entry with before/after values
// Recalculates summary totals from line items

dealEconomics.addLineItem({ deal_economics_id, line_type, category, description, base_paise, gst_paise, is_realized })
// Only when status = draft
// Requires: economics.override (if confirmed, use override flow)
// Recalculates summary totals

dealEconomics.markLineRealized({ line_item_id })
// Marks a revenue line as collected
// Triggers recalculation of commission on realized revenue
// Requires: economics.override
```

### Cost Line Item Mutations

```
dealEconomics.addCostLine({ deal_economics_id, category_code, label, charged_to, charge_paise, cost_paise, gst_rate_bps, payment_mode, vendor_name?, vendor_phone?, vendor_invoice_ref? })
// Only when deal_economics.status = "draft"
// Validates: charge_paise >= 0, cost_paise >= 0
// Validates: gst_rate_bps in [0, 500, 1200, 1800, 2800]
// If category_code = "CUSTOM" and custom_requires_approval, sets needs_approval flag
// Recalculates deal_economics summary totals from all line items

dealEconomics.removeCostLine({ line_item_id })
// Only when deal_economics.status = "draft"
// Writes a reversal entry (negative amounts) rather than deleting
// Recalculates summary totals

dealEconomics.markChargeCollected({ line_item_id })
// Sets charge_collected_at = Date.now()
// Requires: economics.override permission

dealEconomics.markCostPaid({ line_item_id })
// Sets cost_paid_at = Date.now()
// Requires: economics.override permission
```

---

## Part 10: Implementation Phasing

### Phase 30 MVP (Medium effort, 1-2 days)

Scope: The core data model and the Deal Economics card on the closure detail page.

- [ ] Add `deal_economics` and `deal_economics_line_items` tables to `convex/schema.ts`
- [ ] Add 5 `economics.*` keys to `system_config` seed data
- [ ] Add `economics.*` permission strings to `lib/constants.ts` and seed into roles
- [ ] Implement `dealEconomics.calculate` — called from `closures.create`
- [ ] Implement `dealEconomics.confirm` — called from `closures.confirm`
- [ ] Implement `dealEconomics.void` — called from `closures.cancel`
- [ ] Implement `dealEconomics.getByClosureId` query
- [ ] Build `DealEconomicsCard` component for the closure detail page
- [ ] Wire card into `/admin/closures/[id]` page
- [ ] Audit log entries for all economics state transitions

### Phase 30 Full Vision (Large effort, 3+ days)

Scope: Ops earnings dashboard, dynamic commission tiers, and reconciliation tooling.

- [ ] Ops earnings dashboard page (`/admin/ops-earnings`)
- [ ] `dealEconomics.getOpsEarnings` query with pagination
- [ ] Trend chart component (Recharts, consistent with existing dashboard)
- [ ] Dynamic commission tiers based on volume/quality thresholds
- [ ] Ancillary service packs (configurable add-on services via system_config)
- [ ] Automated reconciliation: planned vs realized revenue tracking
- [ ] `dealEconomics.markLineRealized` mutation + UI for marking revenue collected
- [ ] CSV export of ops earnings history
- [ ] Holding period for commission (30-day lockup before payout eligibility)
- [ ] `dealEconomics.override` mutation + Super Admin override UI with reason capture

### Boundary with Phase 28/29

Deal Economics owns the P&L breakdown view, cost line items CRUD, ops commission calculation, and deal-level financial reporting. P28 owns bulk actions and CSV export. P29 owns SLA timers and priority scoring. There is no overlap — Deal Economics provides the financial DATA layer that P28/P29 UI features may DISPLAY but do not own.

Component ownership (non-overlapping):

- `DealEconomicsPanel` (F20): Financial computation + line-item editing/view
- `InlineActions` (P28): Row-level and bulk action controls
- `SLABadge` (P29): Time/SLA urgency visualization only

---

## Part 11: Cross-References

- [Data Models](../02-data-models.md) — Add `deal_economics` and `deal_economics_line_items` entities here when implementing
- [State Machines](../04-state-machines.md) — `deal_economics.status` transitions documented above; add to the state machines doc when implementing
- [Closure & Payouts](07-closure-and-payouts.md) — Economics are calculated on closure create and frozen on closure confirm. The closure lifecycle drives the economics lifecycle.
- [Constants Reference](../13-constants-reference.md) — Add `economics.*` permission strings and `economics.*` system_config keys to the master reference
- [Admin Panel UX](../06-admin-panel-ux.md) — Deal Economics card appears on the closure detail page; ops earnings dashboard is a new sidebar item
- [Audit Trail](../07-audit-trail.md) — All economics state transitions and overrides must produce audit log entries with before/after values
