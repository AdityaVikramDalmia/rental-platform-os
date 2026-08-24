# P36 — Monetization Foundation: Implementation Prompt

> Comprehensive implementation guide for Phase 36 of Rental Platform OS.
> Covers 4 revenue streams: Transaction Fees, Discovery Pass, Promoted Listings, Service Bundles.
> Validated by 9 research agents + Oracle adversarial review.

---

## 0. FIRST STEPS (MANDATORY)

```
FIRST STEP: Read `AGENTS.md` in the project root. It contains the full project context — tech stack, personas, conventions, dev environment, routing rules, test accounts, and file structure. Do this before any other work.

This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`. Load skills via `load_skills=["skill-name"]`.
```

**PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):**
You MUST make tool calls in parallel whenever the calls are independent. Reading multiple files? Call Read on ALL of them in ONE message — not one at a time. Searching for multiple patterns? Fire ALL Grep/Glob calls in ONE message.

**Required Skills**: `rental-platform-os-arch`, `rental-platform-os-rules`, `convex-api`
**Additional Skills per Epic**: `frontend-ui-ux` (E04 only)

---

## 1. CONTEXT

### What P36 Is

Phase 36 creates the core monetization rails for Rental Platform OS with 4 revenue streams:

1. **Transaction Fees** — Rent-band-based platform fees charged at closure confirmation
2. **Discovery Pass** — Prepaid credit tenants buy, applied as offset against transaction fees
3. **Promoted Listings** — Time-bound visibility boost for listings in search results
4. **Service Bundles** — Partner services (packers, movers, cleaners) with commission tracking

### Prerequisites (ALL VERIFIED COMPLETE)

- **P06 (Listings)**: `convex/listings.ts` — `listPublished` query at lines 1458-1548
- **P08 (Closures)**: `convex/closures.ts` — `confirmClosure` mutation with referral milestone hook at line 889
- **P09 (Payouts)**: `convex/payouts.ts` — Payout lifecycle (pending→approved→disbursed/failed/voided)
- **P22 (Referrals)**: `convex/referrals.ts` — Referral codes, milestones, config
- **P34 (Transaction Rails)**: 6 tables, 5 backend files (2,620 LOC), 2 frontend pages, all state machines

### Independence

- P36 does NOT depend on P26 (Rent Negotiation) or P42 (Financial Products)
- P36 is safe to implement without those phases

### Tech Stack

- **Backend**: Convex (functions.ts wraps mutation/query for audit triggers)
- **Frontend**: Next.js 16 App Router + shadcn/ui + react-hook-form + zod
- **Payment**: Razorpay (India-focused, webhook-driven)
- **Auth**: WorkOS AuthKit

---

## 2. NON-NEGOTIABLE INVARIANTS

These rules MUST be followed. Violating any of them is a blocking error.

| #   | Invariant                                                                                                                                                                       | Rationale                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| I1  | **Closure NEVER rolls back for monetization failure.** Fee calculation fires via `ctx.scheduler.runAfter()` as a side effect. If it fails, closure proceeds and fee is retried. | Oracle finding: monetization must not block deal completion |
| I2  | **Every monetary event has an immutable `event_id` (UUID).** All related `revenue_line_items` share the same `event_id`.                                                        | Audit trail, reconciliation, idempotency                    |
| I3  | **Fee slab + billable rent are SNAPSHOTTED at closure confirmation time.** Even if slab config changes later, the snapshotted values apply.                                     | Prevents retroactive fee changes                            |
| I4  | **All money in paise (integer × 100).** ₹9,999 = `999900`. No floats. Use `Math.floor()` for any division.                                                                      | Project-wide convention (see `lib/money.ts`)                |
| I5  | **All dates in Unix milliseconds (`Date.now()`).** No string dates.                                                                                                             | Project-wide convention                                     |
| I6  | **Ledger credits MUST equal debits per `event_id`.** Reject writes at mutation time if imbalanced. Run nightly reconciliation cron as safety net.                               | Double-entry integrity                                      |
| I7  | **Webhook processing is idempotent.** Check `payment_id` exists before creating records. If duplicate, return 200 without writing.                                              | Razorpay retries webhooks on 5xx                            |
| I8  | **Do NOT modify `listPublished` pagination logic directly.** Use a separate promoted-listings overlay query. Organic pagination stays untouched.                                | Oracle finding: protect existing browse behavior            |
| I9  | **Pass credit applies only if pass status is ACTIVE at `closure_confirmed_at`.** Consume transactionally to prevent double-spend across concurrent closures.                    | Race condition prevention                                   |
| I10 | **No `as any`, `@ts-ignore`, `@ts-expect-error`.** Ever.                                                                                                                        | Project-wide hard rule                                      |
| I11 | **All status transitions validated against explicit transition maps.** No freeform status changes.                                                                              | Project convention (see `04-state-machines.md`)             |
| I12 | **Soft delete only (`is_deleted: boolean`).** Never hard-delete records.                                                                                                        | Project convention                                          |

---

## 3. SCHEMA DEFINITIONS

### 3.1 New Tables (Add to `convex/schema.ts`)

**Read the existing schema first** (`convex/schema.ts`, ~2437 lines) to understand patterns. Follow the exact validator style used for existing tables.

```typescript
// ============================================================
// P36: MONETIZATION FOUNDATION
// ============================================================

// --- Transaction Fee Slabs ---
transaction_fees: defineTable({
  slab_key: v.union(
    v.literal("LT_20K"),
    v.literal("BT_20K_40K"),
    v.literal("BT_40K_80K"),
    v.literal("GT_80K_CUSTOM")
  ),
  rent_min_paise: v.number(),          // Lower bound (inclusive), paise
  rent_max_paise: v.optional(v.number()), // Upper bound (exclusive), null for GT_80K
  fee_amount_paise: v.number(),        // Fixed fee for this slab (0 for CUSTOM)
  is_custom_quote: v.boolean(),        // true for GT_80K_CUSTOM
  effective_from: v.number(),          // Unix ms — when this slab becomes active
  effective_until: v.optional(v.number()), // Unix ms — null means currently active
  is_active: v.boolean(),
  created_by: v.id("users"),
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
})
  .index("by_slab_key", ["slab_key", "is_active"])
  .index("by_active", ["is_active", "effective_from"]),

// --- Tenant Passes (Discovery Pass) ---
tenant_passes: defineTable({
  tenant_id: v.id("users"),
  pass_type: v.union(
    v.literal("DISCOVERY_BASIC"),
    v.literal("DISCOVERY_PLUS"),
    v.literal("DISCOVERY_PREMIUM")
  ),
  status: v.union(
    v.literal("PURCHASED"),           // Payment initiated, awaiting webhook
    v.literal("ACTIVE"),              // Payment confirmed, credits available
    v.literal("PARTIALLY_CONSUMED"),  // Some credits used, balance > 0
    v.literal("CONSUMED"),            // All credits used
    v.literal("EXPIRED"),             // Passed expires_at with unused balance
    v.literal("REFUNDED"),            // Admin-initiated refund
    v.literal("VOIDED")              // Payment failed or admin cancelled before activation
  ),
  // Amounts (paise)
  purchase_amount_paise: v.number(),   // What tenant paid
  credit_value_paise: v.number(),      // Total credit toward fees
  remaining_credit_paise: v.number(),  // Current available balance
  total_consumed_paise: v.number(),    // Sum of all consumption
  consumption_count: v.number(),       // Number of transactions credited
  // Lifecycle timestamps
  purchased_at: v.number(),            // Unix ms
  activated_at: v.optional(v.number()),// When payment.captured webhook received
  expires_at: v.number(),              // Validity deadline (6 months from purchase)
  // Payment
  razorpay_order_id: v.optional(v.string()),
  razorpay_payment_id: v.optional(v.string()),
  // Refund
  refund_amount_paise: v.optional(v.number()),
  refund_reason: v.optional(v.string()),
  refunded_at: v.optional(v.number()),
  refund_id: v.optional(v.string()),   // Razorpay refund ID
  // Metadata
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
})
  .index("by_tenant_status", ["tenant_id", "status"])
  .index("by_tenant", ["tenant_id"])
  .index("by_status", ["status"])
  .index("by_razorpay_order", ["razorpay_order_id"])
  .index("by_razorpay_payment", ["razorpay_payment_id"]),

// --- Partner Services (Catalog) ---
partner_services: defineTable({
  name: v.string(),
  slug: v.string(),
  category: v.union(
    v.literal("PACKERS_MOVERS"),
    v.literal("CLEANING"),
    v.literal("PAINTING"),
    v.literal("PEST_CONTROL"),
    v.literal("FURNITURE_RENTAL"),
    v.literal("OTHER")
  ),
  description: v.string(),
  partner_name: v.string(),
  // Pricing
  base_price_paise: v.number(),
  commission_model: v.union(
    v.literal("FIXED"),               // Fixed commission per order
    v.literal("PERCENTAGE")           // Percentage of order value
  ),
  commission_value: v.number(),        // Paise (FIXED) or BPS (PERCENTAGE, e.g. 1500 = 15%)
  // Status
  is_active: v.boolean(),
  // Metadata
  created_by: v.id("users"),
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
})
  .index("by_category", ["category", "is_active"])
  .index("by_slug", ["slug"])
  .index("by_active", ["is_active"]),

// --- Service Bundles (Orders) ---
service_bundles: defineTable({
  tenant_id: v.id("users"),
  closure_id: v.optional(v.id("closures")),
  partner_service_id: v.id("partner_services"),
  listing_id: v.optional(v.id("listings")),
  status: v.union(
    v.literal("PENDING"),
    v.literal("IN_PROGRESS"),
    v.literal("COMPLETED"),
    v.literal("CANCELLED")
  ),
  // Pricing (paise)
  order_amount_paise: v.number(),
  commission_amount_paise: v.number(),  // Platform commission earned
  partner_payout_paise: v.number(),     // Amount to pay partner
  // Lifecycle
  ordered_at: v.number(),
  completed_at: v.optional(v.number()),
  cancelled_at: v.optional(v.number()),
  cancellation_reason: v.optional(v.string()),
  // Notes
  notes: v.optional(v.string()),
  // Metadata
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
})
  .index("by_tenant", ["tenant_id"])
  .index("by_closure", ["closure_id"])
  .index("by_status", ["status"])
  .index("by_partner_service", ["partner_service_id"]),

// --- Promoted Listings ---
promoted_listings: defineTable({
  listing_id: v.id("listings"),
  owner_id: v.id("users"),
  status: v.union(
    v.literal("PENDING_PAYMENT"),     // Awaiting Razorpay confirmation
    v.literal("SCHEDULED"),           // Paid, starts_at in future
    v.literal("ACTIVE"),              // Currently running
    v.literal("PAUSED"),              // Auto-paused (listing ineligible)
    v.literal("ENDED"),               // Time expired normally
    v.literal("CANCELLED")            // Admin/owner cancelled
  ),
  // Campaign details
  duration_days: v.union(v.literal(7), v.literal(14), v.literal(30)),
  starts_at: v.number(),              // Unix ms
  ends_at: v.number(),                // Unix ms
  // Payment (paise)
  price_paise: v.number(),            // What was charged
  razorpay_order_id: v.optional(v.string()),
  razorpay_payment_id: v.optional(v.string()),
  // Performance
  impressions: v.number(),
  clicks: v.number(),
  // Metadata
  created_at: v.number(),
  updated_at: v.number(),
  is_deleted: v.boolean(),
})
  .index("by_listing", ["listing_id"])
  .index("by_status", ["status"])
  .index("by_status_time", ["status", "starts_at", "ends_at"])
  .index("by_razorpay_order", ["razorpay_order_id"])
  .index("by_razorpay_payment", ["razorpay_payment_id"]),

// --- Revenue Line Items (Append-Only Ledger) ---
revenue_line_items: defineTable({
  // Event grouping (all legs of one event share event_id)
  event_id: v.string(),               // UUID — groups related line items
  idempotency_key: v.string(),        // Prevents duplicate processing
  // Type
  line_type: v.union(
    v.literal("FEE_GROSS"),           // Platform fee charged
    v.literal("PASS_CREDIT"),         // Discovery Pass offset (negative)
    v.literal("FEE_NET"),             // Fee after credits
    v.literal("SERVICE_GROSS"),       // Service bundle revenue
    v.literal("PARTNER_COST"),        // Cost to partner
    v.literal("SERVICE_COMMISSION"),  // Platform commission on service
    v.literal("PROMOTION_REVENUE"),   // Promoted listing revenue
    v.literal("REFUND"),              // Refund reversal
    v.literal("ADJUSTMENT")           // Manual adjustment
  ),
  // Double-entry direction
  direction: v.union(v.literal("credit"), v.literal("debit")),
  amount_paise: v.number(),           // Always positive
  // Source linking
  closure_id: v.optional(v.id("closures")),
  tenant_pass_id: v.optional(v.id("tenant_passes")),
  service_bundle_id: v.optional(v.id("service_bundles")),
  promoted_listing_id: v.optional(v.id("promoted_listings")),
  // Snapshot context (immutable at write time)
  rent_amount_paise: v.optional(v.number()),  // Rent at time of fee calc
  fee_slab_key: v.optional(v.string()),       // Slab used for this fee
  // Status
  status: v.union(
    v.literal("pending"),             // Recorded but not finalized
    v.literal("posted"),              // Finalized
    v.literal("reversed")             // Reversed by another event
  ),
  reversal_event_id: v.optional(v.string()),  // Links to reversal event
  // Metadata
  description: v.string(),
  metadata: v.optional(v.any()),      // Additional context
  created_at: v.number(),
  created_by: v.optional(v.id("users")),
  is_deleted: v.boolean(),
})
  .index("by_event_id", ["event_id"])
  .index("by_idempotency_key", ["idempotency_key"])
  .index("by_closure", ["closure_id"])
  .index("by_line_type", ["line_type", "status"])
  .index("by_status", ["status"])
  .index("by_created_at", ["created_at"])
  .index("by_tenant_pass", ["tenant_pass_id"])
  .index("by_promoted_listing", ["promoted_listing_id"]),
```

### 3.2 Audit Action Validators

Add to the `auditActionValidator` in `schema.ts`:

```typescript
// Add these to the existing auditActionValidator union
v.literal("transaction_fee.create"),
v.literal("transaction_fee.update"),
v.literal("transaction_fee.archive"),
v.literal("tenant_pass.purchase"),
v.literal("tenant_pass.activate"),
v.literal("tenant_pass.consume"),
v.literal("tenant_pass.expire"),
v.literal("tenant_pass.refund"),
v.literal("tenant_pass.void"),
v.literal("partner_service.create"),
v.literal("partner_service.update"),
v.literal("service_bundle.create"),
v.literal("service_bundle.update_status"),
v.literal("service_bundle.cancel"),
v.literal("promoted_listing.create"),
v.literal("promoted_listing.activate"),
v.literal("promoted_listing.pause"),
v.literal("promoted_listing.end"),
v.literal("promoted_listing.cancel"),
v.literal("revenue_line_item.create"),
v.literal("revenue_line_item.reverse"),
```

---

## 4. CONSTANTS & PERMISSIONS

### 4.1 Add to `lib/constants.ts`

```typescript
// ============================================================
// P36: MONETIZATION
// ============================================================

export const FEE_SLAB = {
  LT_20K: "LT_20K",
  BT_20K_40K: "BT_20K_40K",
  BT_40K_80K: "BT_40K_80K",
  GT_80K_CUSTOM: "GT_80K_CUSTOM",
} as const;
export type FeeSlab = (typeof FEE_SLAB)[keyof typeof FEE_SLAB];

// Default fee amounts (paise) — these are the initial seed values
export const DEFAULT_FEE_SLABS = {
  LT_20K: { rent_min: 0, rent_max: 2000000, fee: 999900 }, // ₹9,999
  BT_20K_40K: { rent_min: 2000000, rent_max: 4000000, fee: 1499900 }, // ₹14,999
  BT_40K_80K: { rent_min: 4000000, rent_max: 8000000, fee: 2299900 }, // ₹22,999
  GT_80K_CUSTOM: { rent_min: 8000000, rent_max: null, fee: 0 }, // Admin quote
} as const;

export const PASS_STATUS = {
  PURCHASED: "PURCHASED",
  ACTIVE: "ACTIVE",
  PARTIALLY_CONSUMED: "PARTIALLY_CONSUMED",
  CONSUMED: "CONSUMED",
  EXPIRED: "EXPIRED",
  REFUNDED: "REFUNDED",
  VOIDED: "VOIDED",
} as const;
export type PassStatus = (typeof PASS_STATUS)[keyof typeof PASS_STATUS];

export const PASS_TYPE = {
  DISCOVERY_BASIC: "DISCOVERY_BASIC",
  DISCOVERY_PLUS: "DISCOVERY_PLUS",
  DISCOVERY_PREMIUM: "DISCOVERY_PREMIUM",
} as const;
export type PassType = (typeof PASS_TYPE)[keyof typeof PASS_TYPE];

export const PROMOTION_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ENDED: "ENDED",
  CANCELLED: "CANCELLED",
} as const;
export type PromotionStatus = (typeof PROMOTION_STATUS)[keyof typeof PROMOTION_STATUS];

export const BUNDLE_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type BundleStatus = (typeof BUNDLE_STATUS)[keyof typeof BUNDLE_STATUS];

export const SERVICE_CATEGORY = {
  PACKERS_MOVERS: "PACKERS_MOVERS",
  CLEANING: "CLEANING",
  PAINTING: "PAINTING",
  PEST_CONTROL: "PEST_CONTROL",
  FURNITURE_RENTAL: "FURNITURE_RENTAL",
  OTHER: "OTHER",
} as const;

export const REVENUE_LINE_TYPE = {
  FEE_GROSS: "FEE_GROSS",
  PASS_CREDIT: "PASS_CREDIT",
  FEE_NET: "FEE_NET",
  SERVICE_GROSS: "SERVICE_GROSS",
  PARTNER_COST: "PARTNER_COST",
  SERVICE_COMMISSION: "SERVICE_COMMISSION",
  PROMOTION_REVENUE: "PROMOTION_REVENUE",
  REFUND: "REFUND",
  ADJUSTMENT: "ADJUSTMENT",
} as const;

export const COMMISSION_MODEL = {
  FIXED: "FIXED",
  PERCENTAGE: "PERCENTAGE",
} as const;

// --- Pass Transition Map ---
export const PASS_TRANSITIONS: Record<PassStatus, PassStatus[]> = {
  PURCHASED: ["ACTIVE", "VOIDED"],
  ACTIVE: ["PARTIALLY_CONSUMED", "CONSUMED", "EXPIRED", "REFUNDED"],
  PARTIALLY_CONSUMED: ["CONSUMED", "EXPIRED", "REFUNDED"],
  CONSUMED: [],
  EXPIRED: ["REFUNDED"], // Admin can refund expired pass with remaining balance
  REFUNDED: [],
  VOIDED: [],
};

// --- Promotion Transition Map ---
export const PROMOTION_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  PENDING_PAYMENT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PAUSED", "ENDED", "CANCELLED"],
  PAUSED: ["ACTIVE", "ENDED", "CANCELLED"],
  ENDED: [],
  CANCELLED: [],
};

// --- Bundle Transition Map ---
export const BUNDLE_TRANSITIONS: Record<BundleStatus, BundleStatus[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
```

### 4.2 Add Permissions

```typescript
// Add to the PERMISSIONS object in lib/constants.ts
MONETIZATION_VIEW: "monetization.view",
MONETIZATION_CONFIGURE: "monetization.configure",
TRANSACTION_FEES_MANAGE: "transaction_fees.manage",
TENANT_PASSES_VIEW: "tenant_passes.view",
PROMOTED_LISTINGS_MANAGE: "promoted_listings.manage",
PARTNER_SERVICES_MANAGE: "partner_services.manage",
SERVICE_BUNDLES_MANAGE: "service_bundles.manage",
REVENUE_VIEW: "revenue.view",
```

### 4.3 Add Config Keys

```typescript
// Add to system_config seed values
"fee_slab_lt_20k_paise": 999900,
"fee_slab_bt_20k_40k_paise": 1499900,
"fee_slab_bt_40k_80k_paise": 2299900,
"discovery_pass_basic_price_paise": 99900,      // ₹999
"discovery_pass_basic_credit_paise": 150000,     // ₹1,500
"discovery_pass_plus_price_paise": 249900,       // ₹2,499
"discovery_pass_plus_credit_paise": 500000,      // ₹5,000
"discovery_pass_premium_price_paise": 499900,    // ₹4,999
"discovery_pass_premium_credit_paise": 1200000,  // ₹12,000
"discovery_pass_validity_days": 180,             // 6 months
"promotion_7d_price_paise": 99900,               // ₹999
"promotion_14d_price_paise": 179900,             // ₹1,799
"promotion_30d_price_paise": 299900,             // ₹2,999
"promoted_listings_max_per_page": 3,
"promoted_listings_slots": "[1,5,9]",            // JSON array of slot positions
```

---

## 5. BACKEND IMPLEMENTATION

### 5.1 File Ownership Map

| File                         | Primary Epic | Secondary     | Notes                                                   |
| ---------------------------- | ------------ | ------------- | ------------------------------------------------------- |
| `convex/transactionFees.ts`  | E01          | E04 read-only | Fee slab CRUD + computation engine                      |
| `convex/monetization.ts`     | E01          | E02/E03/E04   | Shared `recordMonetizationEvent` idempotent writer      |
| `convex/tenantPasses.ts`     | E02          | E01 consume   | Pass lifecycle + credit consumption                     |
| `convex/serviceBundles.ts`   | E02          | —             | Bundle orders + partner service management              |
| `convex/promotedListings.ts` | E03          | E04 read-only | Campaign lifecycle + overlay query                      |
| `convex/revenueLineItems.ts` | E01          | E04 read-only | Ledger queries + admin analytics                        |
| `convex/actions/payments.ts` | E02          | E03 extends   | Razorpay order/refund/subscription Actions              |
| `convex/http.ts`             | E02          | E03 extends   | Razorpay webhook handler (single route)                 |
| `convex/closures.ts`         | E01          | —             | **MODIFY**: Add fee calculation scheduler hook          |
| `convex/crons.ts`            | E02/E03      | —             | **MODIFY**: Add pass expiry + promotion lifecycle crons |
| `convex/schema.ts`           | E01          | —             | **MODIFY**: Add 6 tables + audit actions                |
| `lib/constants.ts`           | E01          | —             | **MODIFY**: Add enums, transitions, permissions, config |

### 5.2 The Central Idempotent Writer (CRITICAL)

**File: `convex/monetization.ts`**

All monetary state changes flow through ONE internal mutation. Both closure hooks and webhooks call this path.

```typescript
// convex/monetization.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Single idempotent writer for ALL monetization events.
 * Called by: closure fee hook, webhook handler, refund processor, admin adjustments.
 *
 * INVARIANT: If idempotency_key already exists, return existing event_id without writing.
 * INVARIANT: All revenue_line_items for an event MUST have credits == debits (enforced here).
 */
export const recordMonetizationEvent = internalMutation({
  args: {
    idempotency_key: v.string(),
    event_id: v.string(),
    lines: v.array(
      v.object({
        line_type: v.string(),
        direction: v.union(v.literal("credit"), v.literal("debit")),
        amount_paise: v.number(),
        closure_id: v.optional(v.id("closures")),
        tenant_pass_id: v.optional(v.id("tenant_passes")),
        service_bundle_id: v.optional(v.id("service_bundles")),
        promoted_listing_id: v.optional(v.id("promoted_listings")),
        rent_amount_paise: v.optional(v.number()),
        fee_slab_key: v.optional(v.string()),
        description: v.string(),
        metadata: v.optional(v.any()),
      }),
    ),
    created_by: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // 1. Idempotency check
    const existing = await ctx.db
      .query("revenue_line_items")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotency_key", args.idempotency_key))
      .first();
    if (existing) {
      return { duplicate: true, event_id: existing.event_id };
    }

    // 2. Double-entry validation: credits MUST equal debits
    let creditTotal = 0;
    let debitTotal = 0;
    for (const line of args.lines) {
      if (line.direction === "credit") creditTotal += line.amount_paise;
      else debitTotal += line.amount_paise;
    }
    if (creditTotal !== debitTotal) {
      throw new Error(
        `Ledger imbalance for event ${args.event_id}: credits=${creditTotal} debits=${debitTotal}`,
      );
    }

    // 3. Write all line items
    const now = Date.now();
    for (const line of args.lines) {
      await ctx.db.insert("revenue_line_items", {
        event_id: args.event_id,
        idempotency_key: args.idempotency_key,
        line_type: line.line_type as any,
        direction: line.direction,
        amount_paise: line.amount_paise,
        closure_id: line.closure_id,
        tenant_pass_id: line.tenant_pass_id,
        service_bundle_id: line.service_bundle_id,
        promoted_listing_id: line.promoted_listing_id,
        rent_amount_paise: line.rent_amount_paise,
        fee_slab_key: line.fee_slab_key,
        status: "posted",
        description: line.description,
        metadata: line.metadata,
        created_at: now,
        created_by: args.created_by,
        is_deleted: false,
      });
    }

    return { duplicate: false, event_id: args.event_id };
  },
});
```

### 5.3 Fee Calculation Engine

**File: `convex/transactionFees.ts`**

Key functions:

- `seedDefaultSlabs` — One-time seed of default fee slabs
- `getActiveSlabs` — Query all active slabs
- `resolveFeeForRent(rent_paise)` — Deterministic fee resolution
- `previewFee(closure_id)` — Preview fee for a closure (with pass credit)
- `calculateAndRecordFee(closure_id)` — Called via scheduler from closure confirmation

**Fee Resolution Logic (DETERMINISTIC):**

```
if (rent < ₹20K)      → LT_20K      → ₹9,999
if (₹20K ≤ rent < ₹40K) → BT_20K_40K → ₹14,999
if (₹40K ≤ rent < ₹80K) → BT_40K_80K → ₹22,999
if (rent ≥ ₹80K)      → GT_80K_CUSTOM → admin-set quote (error if no quote exists)
```

**Pass Credit Logic:**

```
pass_credit = Math.min(fee_gross_paise, active_pass.remaining_credit_paise)
fee_net = fee_gross_paise - pass_credit  // Never negative
```

**Worked Examples:**
| Rent | Slab | Fee Gross | Pass Credit | Fee Net |
|------|------|-----------|-------------|---------|
| ₹19,000 | LT_20K | ₹9,999 | ₹0 | ₹9,999 |
| ₹35,000 | BT_20K_40K | ₹14,999 | ₹5,000 (from ₹5K pass) | ₹9,999 |
| ₹47,000 | BT_40K_80K | ₹22,999 | ₹22,999 (fully consumed) | ₹0 |
| ₹95,000 | GT_80K_CUSTOM | admin quote | depends | computed |

### 5.4 Closure Integration Hook

**File: `convex/closures.ts`** — MODIFY existing `confirmClosure` function.

**Pattern**: Follow the referral milestone hook at line 889. Add AFTER it:

```typescript
// In confirmClosure, after referral milestone hook (line ~893):
// P36: Schedule fee calculation as non-blocking side effect
await ctx.scheduler.runAfter(0, internal.transactionFees.calculateAndRecordFee, {
  closure_id: closureId,
  rent_amount_paise: closure.monthly_rent, // Snapshot rent at confirmation time
  confirmed_at: Date.now(),
});
```

**CRITICAL**: This MUST use `ctx.scheduler.runAfter()`, NOT a direct function call. If fee calculation fails, the closure still succeeds (Invariant I1).

### 5.5 Razorpay Webhook Handler

**File: `convex/http.ts`** — ADD new route.

```typescript
// Add to http.ts after existing routes:
http.route({
  path: "/api/payments/razorpay/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[razorpay:webhook] Secret not configured");
      return new Response("Not configured", { status: 500 });
    }

    // 1. Get raw body BEFORE parsing (critical for signature)
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    // 2. HMAC-SHA256 verification
    const crypto = await import("crypto");
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    if (expected !== signature) {
      console.error("[razorpay:webhook] Invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    // 3. Parse and dispatch
    const payload = JSON.parse(rawBody);
    const event = payload.event;

    try {
      if (event === "payment.captured") {
        await ctx.runMutation(internal.monetization.handlePaymentCaptured, {
          payment_id: payload.payload.payment.entity.id,
          order_id: payload.payload.payment.entity.order_id,
          amount_paise: payload.payload.payment.entity.amount,
          raw_event: payload,
        });
      } else if (event === "payment.failed") {
        await ctx.runMutation(internal.monetization.handlePaymentFailed, {
          payment_id: payload.payload.payment.entity.id,
          order_id: payload.payload.payment.entity.order_id,
          raw_event: payload,
        });
      } else if (event === "refund.processed") {
        await ctx.runMutation(internal.monetization.handleRefundProcessed, {
          refund_id: payload.payload.refund.entity.id,
          payment_id: payload.payload.refund.entity.payment_id,
          amount_paise: payload.payload.refund.entity.amount,
          raw_event: payload,
        });
      }
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[razorpay:webhook] Error:", error);
      return new Response("Error", { status: 500 }); // Triggers retry
    }
  }),
});
```

### 5.6 Promoted Listings Overlay Query

**File: `convex/promotedListings.ts`** — NEW file.

**DO NOT modify `listPublished` in `listings.ts`.** Instead, create a separate query:

```typescript
// Called by the browse page alongside listPublished
export const getPromotedForPage = query({
  args: {
    page: v.number(), // 1-indexed page number
    filters: v.optional(/* same filters as listPublished */),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const maxSlots = args.page === 1 ? 3 : 1;

    // Get active promotions with over-sampling
    const candidates = await ctx.db
      .query("promoted_listings")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .filter((q) => q.and(q.lte(q.field("starts_at"), now), q.gte(q.field("ends_at"), now)))
      .take(maxSlots * 8); // Over-sample for variety

    // Verify each listing is still PUBLISHED and matches filters
    const valid = [];
    for (const promo of candidates) {
      const listing = await ctx.db.get(promo.listing_id);
      if (listing && listing.status === "PUBLISHED" && !listing.is_deleted) {
        valid.push({ ...promo, listing });
      }
      if (valid.length >= maxSlots) break;
    }

    // Return promoted listing IDs + slot positions
    const slots = [1, 5, 9]; // Config: promoted_listings_slots
    return valid.slice(0, maxSlots).map((v, i) => ({
      listing: v.listing,
      promotionId: v._id,
      slotPosition: slots[i] ?? i, // Insert at configured positions
      isPromoted: true,
    }));
  },
});
```

**Frontend merge**: The browse page calls BOTH `listPublished` (organic) and `getPromotedForPage` (promoted), then merges client-side at the configured slot positions. Organic items shift down to accommodate promoted items.

### 5.7 Cron Jobs

**File: `convex/crons.ts`** — ADD entries:

```typescript
// P36: Pass expiry check (every hour)
crons.interval("checkPassExpiry", { hours: 1 }, internal.tenantPasses.expireStale);

// P36: Promotion lifecycle (every 5 minutes)
crons.interval("promotionLifecycle", { minutes: 5 }, internal.promotedListings.updateStatuses);

// P36: Revenue ledger nightly reconciliation (every 24 hours)
crons.daily(
  "revenueReconciliation",
  { hourUTC: 2, minuteUTC: 0 },
  internal.revenueLineItems.nightlyReconciliation,
);
```

### 5.8 Razorpay Actions

**File: `convex/actions/payments.ts`** — NEW file.

Key Actions:

- `createPassOrder(pass_type)` — Creates Razorpay order for Discovery Pass purchase
- `createPromotionOrder(listing_id, duration_days)` — Creates Razorpay order for promotion
- `processRefund(payment_id, amount_paise)` — Initiates Razorpay refund

**IMPORTANT**: These are Convex Actions (not mutations). They make external API calls to Razorpay.

```typescript
// Install: npm install razorpay
import Razorpay from "razorpay";

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}
```

### 5.9 Environment Variables

Add to `.env.local` and `.env.example`:

```bash
# Razorpay (P36)
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxx
```

---

## 6. FRONTEND IMPLEMENTATION

### 6.1 New Pages

| Page                    | Route                       | Layout     | Purpose                                                   |
| ----------------------- | --------------------------- | ---------- | --------------------------------------------------------- |
| Admin Revenue Dashboard | `/admin/revenue`            | `(admin)`  | KPI cards, revenue streams chart, fee collection tracking |
| Admin Fee Config        | `/admin/revenue/fees`       | `(admin)`  | Fee slab management, custom quote queue                   |
| Admin Partner Services  | `/admin/revenue/services`   | `(admin)`  | Partner service catalog management                        |
| Admin Promoted Listings | `/admin/revenue/promotions` | `(admin)`  | Campaign management, performance metrics                  |
| Public Pricing          | `/pricing`                  | `(public)` | Fee disclosure, Discovery Pass plans, promotion pricing   |
| Tenant Pass Purchase    | `/tenant/pass`              | `(tenant)` | Discovery Pass purchase flow with Razorpay checkout       |

### 6.2 New Components

```
src/components/
  monetization/
    FeeBreakdown.tsx          — Fee preview with slab, gross, credit, net
    PassPurchaseCard.tsx       — Discovery Pass tier card with buy button
    PassBalanceWidget.tsx      — Current pass balance in tenant nav
    PromotionBadge.tsx         — "Promoted" badge on listing cards
    ServiceBundleCard.tsx      — Partner service order card
    PaymentButton.tsx          — Razorpay checkout trigger (shared)
    RevenueKPICard.tsx         — Admin revenue KPI display
    RevenueStreamChart.tsx     — Admin revenue breakdown by stream (Recharts)
    FeeSlabEditor.tsx          — Admin fee slab config form
    PricingTable.tsx           — Public pricing page tier comparison
```

### 6.3 Razorpay Client Hook

```typescript
// src/hooks/useRazorpay.ts
// Loads checkout.js script dynamically
// Opens payment modal
// Returns { openCheckout, isLoading, error }
// See Razorpay research for full implementation
```

### 6.4 Admin Sidebar

Add "Revenue" section to admin sidebar:

```
📊 Revenue
  ├── Dashboard (/admin/revenue)
  ├── Fee Config (/admin/revenue/fees)
  ├── Promotions (/admin/revenue/promotions)
  └── Services (/admin/revenue/services)
```

---

## 7. CROSS-PHASE CONTRACTS

| Contract                          | Rule                                                                                                                                                     | Enforcement                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **P36 × P09 (Payouts)**           | `revenue_line_items` is SEPARATE from `payouts`. Do NOT mutate `payouts` table from P36 code. Mirror payout cost as read-model convenience only.         | Code review: no `ctx.db.patch` on `payouts` from monetization files |
| **P36 × P22 (Referrals)**         | Referral milestone payouts stay in `referral_milestones`. P36 writes a balancing cost line item in `revenue_line_items` to track the cost.               | Separate ledger entry, no mutation of referral tables               |
| **P36 × P32 (Incentive v3)**      | Transaction fee calculation is INDEPENDENT from commission engine. Fee is charged to tenant; commission is paid to ops/guard. Completely separate flows. | Different code paths, different tables                              |
| **P36 × P34 (Transaction Rails)** | Optional integration. When P34 exists, transaction completion can reconcile `fee_collection_status`. P36 works standalone without P34.                   | Fee calculation does not require `rental_transactions` to exist     |
| **P36 × P33 (Trust Badges)**      | Promoted listings must have PUBLISHED status AND non-STALE freshness. Auto-pause promotion if listing becomes stale.                                     | Promotion lifecycle cron checks trust badge freshness               |

---

## 8. EXECUTION ORDER

```
E01a: Schema + Ledger + Idempotency Infrastructure
  → Add 6 tables to schema.ts
  → Add enums/permissions/config to constants.ts
  → Create monetization.ts (recordMonetizationEvent)
  → Create revenueLineItems.ts (queries)
  → Create transactionFees.ts (slab CRUD + computation)
  → Wire Razorpay webhook in http.ts

E01b: Fee Engine + Closure Hook
  → Implement fee resolution logic
  → Add closure hook via scheduler
  → Write fee preview + finalization
  → Test: fee calculation with worked examples

E02: Discovery Pass + Service Bundles (parallel with E03)
  → Create tenantPasses.ts (lifecycle)
  → Create serviceBundles.ts (orders)
  → Create actions/payments.ts (Razorpay)
  → Add pass credit consumption in fee calc
  → Add pass expiry cron
  → Frontend: pass purchase page + balance widget

E03: Promoted Listings (parallel with E02)
  → Create promotedListings.ts (campaign lifecycle + overlay query)
  → Extend actions/payments.ts for promotion orders
  → Add promotion lifecycle cron
  → Frontend: promotion badge + browse merge

E04: Revenue Dashboard + Public Pricing (after E01+E02+E03)
  → Admin revenue dashboard (KPIs + charts)
  → Admin fee/service/promotion management pages
  → Public /pricing page
  → Nightly reconciliation cron
```

---

## 9. VERIFICATION CHECKLIST

After EACH epic, run:

```bash
# Type safety
npx tsc --noEmit --project convex/tsconfig.json

# Build
npm run build

# Existing tests still pass
npx vitest run

# Manual verification
# 1. Fee calculation: verify worked examples match
# 2. Razorpay: test webhook with signature from Razorpay dashboard
# 3. Promoted listings: verify max 3 per page, organic unaffected
# 4. Pass credit: verify min(fee, balance) logic
# 5. Ledger: verify credits == debits for every event_id
```

### Acceptance Criteria (ALL must pass)

- [ ] All 6 tables created with correct validators and indexes
- [ ] Fee resolution matches worked examples (4 slabs)
- [ ] Closure confirmation fires fee calculation without blocking
- [ ] Razorpay webhook validates signature and processes idempotently
- [ ] Discovery Pass lifecycle: purchase → activate → consume → expire
- [ ] Pass credit correctly offsets fee (min logic, never negative)
- [ ] Promoted listings appear at slots [1,5,9] without breaking organic pagination
- [ ] Promotions auto-pause when listing becomes ineligible
- [ ] Revenue ledger balances: credits == debits per event_id
- [ ] Admin revenue dashboard shows live data
- [ ] Public /pricing page renders all tiers and fees
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] All pre-existing tests still pass

---

## 10. EDGE CASES

| Scenario                                  | Required Handling                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Pass expires mid-closure                  | Credit applies only if ACTIVE at `closure_confirmed_at`. If expired → no credit.   |
| Two closures race for same pass credit    | Transactional consume: first closure wins, second gets no credit (or partial).     |
| Razorpay webhook replayed 3x              | Idempotency key prevents duplicate ledger entries. Return 200 on duplicates.       |
| GT_80K rent with no admin quote           | Throw error. Do NOT default to a fee. Admin must set custom quote first.           |
| Listing becomes STALE while promoted      | Promotion auto-pauses. Resume when freshness restored.                             |
| Promoted listing deleted                  | Promotion transitions to CANCELLED. Remaining days not refunded (or configurable). |
| Pass refund after partial consumption     | Refund = `(purchase_amount × remaining_credit / credit_value)` pro-rated.          |
| Service bundle partner goes inactive      | Bundle stays in current status. No new orders for that service.                    |
| Concurrent fee slab update during closure | Slab is SNAPSHOTTED at closure confirmation time. Later changes don't affect it.   |
| Zero-rent closure (rare edge)             | Fee = ₹0 (LT_20K slab applies, but admin can configure minimum fee).               |
