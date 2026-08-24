import { v } from "convex/values";
import { REVENUE_LINE_TYPE } from "../lib/constants";
import { internalMutation } from "./functions";

const revenueLineTypeValidator = v.union(
  v.literal(REVENUE_LINE_TYPE.FEE_GROSS),
  v.literal(REVENUE_LINE_TYPE.PASS_CREDIT),
  v.literal(REVENUE_LINE_TYPE.FEE_NET),
  v.literal(REVENUE_LINE_TYPE.SERVICE_GROSS),
  v.literal(REVENUE_LINE_TYPE.PARTNER_COST),
  v.literal(REVENUE_LINE_TYPE.SERVICE_COMMISSION),
  v.literal(REVENUE_LINE_TYPE.PROMOTION_REVENUE),
  v.literal(REVENUE_LINE_TYPE.REFUND),
  v.literal(REVENUE_LINE_TYPE.ADJUSTMENT),
);

export const recordMonetizationEvent = internalMutation({
  args: {
    idempotency_key: v.string(),
    event_id: v.string(),
    lines: v.array(
      v.object({
        line_type: revenueLineTypeValidator,
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
    const existing = await ctx.db
      .query("revenue_line_items")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotency_key", args.idempotency_key))
      .first();

    if (existing) {
      return { duplicate: true, event_id: existing.event_id };
    }

    let creditTotal = 0;
    let debitTotal = 0;

    for (const line of args.lines) {
      if (line.direction === "credit") {
        creditTotal += line.amount_paise;
      } else {
        debitTotal += line.amount_paise;
      }
    }

    if (creditTotal !== debitTotal) {
      throw new Error(
        `Ledger imbalance for event ${args.event_id}: credits=${creditTotal} debits=${debitTotal}`,
      );
    }

    const now = Date.now();

    for (const line of args.lines) {
      await ctx.db.insert("revenue_line_items", {
        event_id: args.event_id,
        idempotency_key: args.idempotency_key,
        line_type: line.line_type,
        direction: line.direction,
        amount_paise: line.amount_paise,
        closure_id: line.closure_id,
        tenant_pass_id: line.tenant_pass_id,
        service_bundle_id: line.service_bundle_id,
        promoted_listing_id: line.promoted_listing_id,
        rent_amount_paise: line.rent_amount_paise,
        fee_slab_key: line.fee_slab_key,
        status: "posted",
        reversal_event_id: undefined,
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

export const handlePaymentCaptured = internalMutation({
  args: {
    payment_id: v.string(),
    order_id: v.string(),
    amount_paise: v.number(),
    raw_event: v.any(),
  },
  handler: async (_ctx, args) => {
    console.info("[monetization] payment.captured stub", {
      payment_id: args.payment_id,
      order_id: args.order_id,
      amount_paise: args.amount_paise,
    });

    return { handled: true, event: "payment.captured", payment_id: args.payment_id };
  },
});

export const handlePaymentFailed = internalMutation({
  args: {
    payment_id: v.string(),
    order_id: v.string(),
    raw_event: v.any(),
  },
  handler: async (_ctx, args) => {
    console.info("[monetization] payment.failed stub", {
      payment_id: args.payment_id,
      order_id: args.order_id,
    });

    return { handled: true, event: "payment.failed", payment_id: args.payment_id };
  },
});

export const handleRefundProcessed = internalMutation({
  args: {
    refund_id: v.string(),
    payment_id: v.string(),
    amount_paise: v.number(),
    raw_event: v.any(),
  },
  handler: async (_ctx, args) => {
    console.info("[monetization] refund.processed stub", {
      refund_id: args.refund_id,
      payment_id: args.payment_id,
      amount_paise: args.amount_paise,
    });

    return { handled: true, event: "refund.processed", refund_id: args.refund_id };
  },
});
