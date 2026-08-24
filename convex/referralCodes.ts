import { v } from "convex/values";
import { PERMISSIONS, USER_STATUS, USER_TYPE } from "../lib/constants";
import { generateReferralCode } from "../lib/referral";
import { requireAuth, requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const MAX_GENERATION_ATTEMPTS = 10;

export const generate = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    if (user.user_type !== USER_TYPE.TENANT && user.user_type !== USER_TYPE.OWNER) {
      throw new Error("Only tenant and owner users can generate DemoRentals referral codes");
    }

    const existingCode = await ctx.db
      .query("referral_codes")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .first();

    if (existingCode) {
      return existingCode;
    }

    let uniqueCode: string | null = null;

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const candidateCode = generateReferralCode();
      const existingByCode = await ctx.db
        .query("referral_codes")
        .withIndex("by_code", (q) => q.eq("code", candidateCode))
        .first();

      if (!existingByCode) {
        uniqueCode = candidateCode;
        break;
      }
    }

    if (!uniqueCode) {
      throw new Error("Unable to generate a unique referral code. Please try again.");
    }

    const referralCodeId = await ctx.db.insert("referral_codes", {
      user_id: user._id,
      code: uniqueCode,
      is_active: true,
    });

    const referralCode = await ctx.db.get(referralCodeId);

    if (!referralCode) {
      throw new Error("Failed to create referral code");
    }

    return referralCode;
  },
});

export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    return await ctx.db
      .query("referral_codes")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .first();
  },
});

export const getByCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const referralCode = await ctx.db
      .query("referral_codes")
      .withIndex("by_code", (q) => q.eq("code", args.code.trim().toUpperCase()))
      .first();

    if (!referralCode || !referralCode.is_active) {
      return null;
    }

    const referrer = await ctx.db.get(referralCode.user_id);

    if (!referrer) {
      return null;
    }

    if (referrer.user_type !== USER_TYPE.TENANT && referrer.user_type !== USER_TYPE.OWNER) {
      return null;
    }

    if (referrer.status !== USER_STATUS.ACTIVE) {
      return null;
    }

    return {
      referral_code: referralCode,
      referrer: {
        name: referrer.name,
        owner_type: referrer.user_type,
      },
    };
  },
});

export const deactivate = mutation({
  args: {
    id: v.id("referral_codes"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_MANAGE);

    const referralCode = await ctx.db.get(args.id);

    if (!referralCode) {
      throw new Error("Referral code not found");
    }

    await ctx.db.patch(args.id, {
      is_active: false,
    });

    return await ctx.db.get(args.id);
  },
});
