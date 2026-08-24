import { v } from "convex/values";
import { DEFAULT_FEE_SLABS, FEE_SLAB, PERMISSIONS } from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import { internalMutation, mutation, query } from "./functions";

const feeSlabValidator = v.union(
  v.literal(FEE_SLAB.LT_20K),
  v.literal(FEE_SLAB.BT_20K_40K),
  v.literal(FEE_SLAB.BT_40K_80K),
  v.literal(FEE_SLAB.GT_80K_CUSTOM),
);

export const getActiveSlabs = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.MONETIZATION_VIEW);

    const now = Date.now();

    return await ctx.db
      .query("transaction_fees")
      .withIndex("by_active", (q) => q.eq("is_active", true))
      .filter((q) =>
        q.and(
          q.neq(q.field("is_deleted"), true),
          q.lte(q.field("effective_from"), now),
          q.or(q.eq(q.field("effective_until"), undefined), q.gt(q.field("effective_until"), now)),
        ),
      )
      .collect();
  },
});

export const seedDefaultSlabs = internalMutation({
  args: {
    created_by: v.id("users"),
    effective_from: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const effectiveFrom = args.effective_from ?? now;

    const slabs = [
      { slab_key: FEE_SLAB.LT_20K, ...DEFAULT_FEE_SLABS.LT_20K, is_custom_quote: false },
      {
        slab_key: FEE_SLAB.BT_20K_40K,
        ...DEFAULT_FEE_SLABS.BT_20K_40K,
        is_custom_quote: false,
      },
      {
        slab_key: FEE_SLAB.BT_40K_80K,
        ...DEFAULT_FEE_SLABS.BT_40K_80K,
        is_custom_quote: false,
      },
      {
        slab_key: FEE_SLAB.GT_80K_CUSTOM,
        ...DEFAULT_FEE_SLABS.GT_80K_CUSTOM,
        is_custom_quote: true,
      },
    ] as const;

    let inserted = 0;

    for (const slab of slabs) {
      const existing = await ctx.db
        .query("transaction_fees")
        .withIndex("by_slab_key", (q) => q.eq("slab_key", slab.slab_key).eq("is_active", true))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .first();

      if (existing) {
        continue;
      }

      await ctx.db.insert("transaction_fees", {
        slab_key: slab.slab_key,
        rent_min_paise: slab.rent_min,
        rent_max_paise: slab.rent_max ?? undefined,
        fee_amount_paise: slab.fee,
        is_custom_quote: slab.is_custom_quote,
        effective_from: effectiveFrom,
        effective_until: undefined,
        is_active: true,
        created_by: args.created_by,
        created_at: now,
        updated_at: now,
        is_deleted: false,
      });

      inserted += 1;
    }

    return { inserted };
  },
});

export const upsertSlab = mutation({
  args: {
    slab_id: v.optional(v.id("transaction_fees")),
    slab_key: feeSlabValidator,
    rent_min_paise: v.number(),
    rent_max_paise: v.optional(v.number()),
    fee_amount_paise: v.number(),
    is_custom_quote: v.boolean(),
    effective_from: v.number(),
    effective_until: v.optional(v.number()),
    is_active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TRANSACTION_FEES_MANAGE);
    const now = Date.now();

    if (args.slab_id) {
      const existing = await ctx.db.get(args.slab_id);
      if (!existing || existing.is_deleted) {
        throw new Error("Transaction fee slab not found");
      }

      await ctx.db.patch(args.slab_id, {
        slab_key: args.slab_key,
        rent_min_paise: args.rent_min_paise,
        rent_max_paise: args.rent_max_paise,
        fee_amount_paise: args.fee_amount_paise,
        is_custom_quote: args.is_custom_quote,
        effective_from: args.effective_from,
        effective_until: args.effective_until,
        is_active: args.is_active,
        updated_at: now,
      });

      return { slab_id: args.slab_id, created: false };
    }

    const slabId = await ctx.db.insert("transaction_fees", {
      slab_key: args.slab_key,
      rent_min_paise: args.rent_min_paise,
      rent_max_paise: args.rent_max_paise,
      fee_amount_paise: args.fee_amount_paise,
      is_custom_quote: args.is_custom_quote,
      effective_from: args.effective_from,
      effective_until: args.effective_until,
      is_active: args.is_active,
      created_by: admin._id,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });

    return { slab_id: slabId, created: true };
  },
});
