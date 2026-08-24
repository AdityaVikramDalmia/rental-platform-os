import { v } from "convex/values";
import {
  PAYOUT_METHOD,
  PERMISSIONS,
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  REFERRAL_STATUS,
} from "../lib/constants";
import { validateMilestoneTransition, validateReferralTransition } from "../lib/referral";
import { requireAuth, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./functions";

const triggerMilestoneTypeValidator = v.union(
  v.literal(REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED),
  v.literal(REFERRAL_MILESTONE_TYPE.DEAL_CLOSED),
);

const payoutMethodValidator = v.union(
  v.literal(PAYOUT_METHOD.CASH),
  v.literal(PAYOUT_METHOD.UPI),
  v.literal(PAYOUT_METHOD.BANK_TRANSFER),
);

export const getEarningsSummary = query({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (user._id !== args.user_id) {
      throw new Error("You can only view your own referral earnings summary");
    }

    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrer_user_id", (q) => q.eq("referrer_user_id", args.user_id))
      .collect();

    const activeReferrals = referrals.filter(
      (referral) => referral.status !== REFERRAL_STATUS.VOIDED,
    );

    const milestonesByReferral = await Promise.all(
      activeReferrals.map(async (referral) => {
        return await ctx.db
          .query("referral_milestones")
          .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
          .collect();
      }),
    );

    const paidMilestones = milestonesByReferral
      .flat()
      .filter((milestone) => milestone.status === REFERRAL_MILESTONE_STATUS.PAID);

    return paidMilestones.reduce(
      (totals, milestone) => {
        if (milestone.milestone_type === REFERRAL_MILESTONE_TYPE.SIGN_UP) {
          totals.sign_up_bonus_paid_paise += milestone.amount;
        }

        if (milestone.milestone_type === REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED) {
          totals.listing_bonus_paid_paise += milestone.amount;
        }

        if (milestone.milestone_type === REFERRAL_MILESTONE_TYPE.DEAL_CLOSED) {
          totals.closure_bonus_paid_paise += milestone.amount;
        }

        if (milestone.milestone_type === REFERRAL_MILESTONE_TYPE.FIRST_VERIFIED_LEAD) {
          totals.first_verified_lead_bonus_paid_paise += milestone.amount;
        }

        totals.total_earned_paid_paise += milestone.amount;

        return totals;
      },
      {
        sign_up_bonus_paid_paise: 0,
        listing_bonus_paid_paise: 0,
        closure_bonus_paid_paise: 0,
        first_verified_lead_bonus_paid_paise: 0,
        total_earned_paid_paise: 0,
      },
    );
  },
});

export const trigger = internalMutation({
  args: {
    referral_id: v.id("referrals"),
    milestone_type: triggerMilestoneTypeValidator,
    source_event: v.string(),
  },
  handler: async (ctx, args) => {
    const referral = await ctx.db.get(args.referral_id);

    if (!referral || referral.status === REFERRAL_STATUS.VOIDED) {
      return null;
    }

    const existingBySourceEvent = await ctx.db
      .query("referral_milestones")
      .withIndex("by_referral_and_source_event", (q) =>
        q.eq("referral_id", referral._id).eq("source_event", args.source_event),
      )
      .first();

    if (existingBySourceEvent) {
      return null;
    }

    const milestone = await ctx.db
      .query("referral_milestones")
      .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
      .filter((q) => q.eq(q.field("milestone_type"), args.milestone_type))
      .first();

    if (!milestone || milestone.status !== REFERRAL_MILESTONE_STATUS.PENDING) {
      return null;
    }

    if (!validateMilestoneTransition(milestone.status, REFERRAL_MILESTONE_STATUS.TRIGGERED)) {
      throw new Error(
        `Invalid milestone transition: ${milestone.status} -> ${REFERRAL_MILESTONE_STATUS.TRIGGERED}`,
      );
    }

    await ctx.db.patch(milestone._id, {
      status: REFERRAL_MILESTONE_STATUS.TRIGGERED,
      source_event: args.source_event,
      triggered_at: Date.now(),
    });

    await ctx.runMutation(internal.referralMilestones.updateReferralStatusFromMilestones, {
      referral_id: milestone.referral_id,
    });

    return milestone._id;
  },
});

export const approve = mutation({
  args: {
    id: v.id("referral_milestones"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.REFERRALS_APPROVE_PAYOUT);
    const milestone = await ctx.db.get(args.id);

    if (!milestone) {
      throw new Error("Referral milestone not found");
    }

    if (!validateMilestoneTransition(milestone.status, REFERRAL_MILESTONE_STATUS.APPROVED)) {
      throw new Error(
        `Invalid milestone transition: ${milestone.status} -> ${REFERRAL_MILESTONE_STATUS.APPROVED}`,
      );
    }

    await ctx.db.patch(milestone._id, {
      status: REFERRAL_MILESTONE_STATUS.APPROVED,
      approved_by_admin_id: admin._id,
    });

    await ctx.runMutation(internal.referralMilestones.updateReferralStatusFromMilestones, {
      referral_id: milestone.referral_id,
    });

    return await ctx.db.get(milestone._id);
  },
});

export const markPaid = mutation({
  args: {
    id: v.id("referral_milestones"),
    payout_method: payoutMethodValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_APPROVE_PAYOUT);
    const milestone = await ctx.db.get(args.id);

    if (!milestone) {
      throw new Error("Referral milestone not found");
    }

    if (!validateMilestoneTransition(milestone.status, REFERRAL_MILESTONE_STATUS.PAID)) {
      throw new Error(
        `Invalid milestone transition: ${milestone.status} -> ${REFERRAL_MILESTONE_STATUS.PAID}`,
      );
    }

    await ctx.db.patch(milestone._id, {
      status: REFERRAL_MILESTONE_STATUS.PAID,
      paid_at: Date.now(),
      payout_method: args.payout_method,
    });

    await ctx.runMutation(internal.referralMilestones.updateReferralStatusFromMilestones, {
      referral_id: milestone.referral_id,
    });

    return await ctx.db.get(milestone._id);
  },
});

export const voidMilestone = mutation({
  args: {
    id: v.id("referral_milestones"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_MANAGE);
    const milestone = await ctx.db.get(args.id);

    if (!milestone) {
      throw new Error("Referral milestone not found");
    }

    const reason = args.reason.trim();

    if (!reason) {
      throw new Error("reason is required");
    }

    if (milestone.status === REFERRAL_MILESTONE_STATUS.PAID) {
      throw new Error("Cannot void a paid milestone");
    }

    if (!validateMilestoneTransition(milestone.status, REFERRAL_MILESTONE_STATUS.VOIDED)) {
      throw new Error(
        `Invalid milestone transition: ${milestone.status} -> ${REFERRAL_MILESTONE_STATUS.VOIDED}`,
      );
    }

    await ctx.db.patch(milestone._id, {
      status: REFERRAL_MILESTONE_STATUS.VOIDED,
      voided_reason: reason,
    });

    await ctx.runMutation(internal.referralMilestones.updateReferralStatusFromMilestones, {
      referral_id: milestone.referral_id,
    });

    return await ctx.db.get(milestone._id);
  },
});

export { voidMilestone as void };

export const updateReferralStatusFromMilestones = internalMutation({
  args: {
    referral_id: v.id("referrals"),
  },
  handler: async (ctx, args) => {
    const referral = await ctx.db.get(args.referral_id);

    if (!referral) {
      return;
    }

    if (
      referral.status === REFERRAL_STATUS.VOIDED ||
      referral.status === REFERRAL_STATUS.FULLY_PAID
    ) {
      return;
    }

    const milestones = await ctx.db
      .query("referral_milestones")
      .withIndex("by_referral_id", (q) => q.eq("referral_id", args.referral_id))
      .collect();

    if (milestones.length === 0) {
      return;
    }

    const paidCount = milestones.filter(
      (milestone) => milestone.status === REFERRAL_MILESTONE_STATUS.PAID,
    ).length;
    const allPaid = paidCount === milestones.length;
    const anyPaid = paidCount > 0;
    const hasTriggeredOrApproved = milestones.some(
      (milestone) =>
        milestone.status === REFERRAL_MILESTONE_STATUS.TRIGGERED ||
        milestone.status === REFERRAL_MILESTONE_STATUS.APPROVED,
    );

    let derivedStatus: (typeof REFERRAL_STATUS)[keyof typeof REFERRAL_STATUS] | null = null;

    if (allPaid) {
      derivedStatus = REFERRAL_STATUS.FULLY_PAID;
    } else if (anyPaid) {
      derivedStatus = REFERRAL_STATUS.PARTIALLY_PAID;
    } else if (hasTriggeredOrApproved && referral.status === REFERRAL_STATUS.PENDING) {
      derivedStatus = REFERRAL_STATUS.QUALIFIED;
    }

    if (!derivedStatus || derivedStatus === referral.status) {
      return;
    }

    if (!validateReferralTransition(referral.status, derivedStatus)) {
      return;
    }

    await ctx.db.patch(referral._id, {
      status: derivedStatus,
    });
  },
});
