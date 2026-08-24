import { v } from "convex/values";
import { PERMISSIONS } from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import { query } from "./functions";

export const listByEvent = query({
  args: {
    event_id: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REVENUE_VIEW);

    const lines = await ctx.db
      .query("revenue_line_items")
      .withIndex("by_event_id", (q) => q.eq("event_id", args.event_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return lines.sort((a, b) => a.created_at - b.created_at);
  },
});

export const listByClosure = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REVENUE_VIEW);

    const lines = await ctx.db
      .query("revenue_line_items")
      .withIndex("by_closure", (q) => q.eq("closure_id", args.closure_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return lines.sort((a, b) => a.created_at - b.created_at);
  },
});

export const getBalanceCheck = query({
  args: {
    event_id: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REVENUE_VIEW);

    const lines = await ctx.db
      .query("revenue_line_items")
      .withIndex("by_event_id", (q) => q.eq("event_id", args.event_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const totals = lines.reduce(
      (acc, line) => {
        if (line.direction === "credit") {
          acc.credit_total_paise += line.amount_paise;
        } else {
          acc.debit_total_paise += line.amount_paise;
        }

        return acc;
      },
      {
        credit_total_paise: 0,
        debit_total_paise: 0,
      },
    );

    return {
      event_id: args.event_id,
      line_count: lines.length,
      credit_total_paise: totals.credit_total_paise,
      debit_total_paise: totals.debit_total_paise,
      balanced: totals.credit_total_paise === totals.debit_total_paise,
    };
  },
});
