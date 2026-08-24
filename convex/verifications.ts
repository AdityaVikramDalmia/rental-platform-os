import { v } from "convex/values";
import {
  CALL_OUTCOME,
  INCENTIVE_PERSONA,
  LEAD_STATUS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  OWNER_LIFECYCLE_STAGE,
  OWNER_SOURCE,
  PERMISSIONS,
  XP_AWARDS,
} from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import { mutation, query } from "./functions";
import { validateLeadTransition } from "./leads";
import { getOrCreateByPhoneInternal, progressLifecycleStage } from "./owners";

const SKIP_SCHEDULER_SIDE_EFFECTS_IN_TESTS =
  process.env.VITEST === "true" || process.env.CONVEX_DISABLE_SCHEDULER_SIDE_EFFECTS === "1";

export const listByLead = query({
  args: {
    lead_id: v.id("leads"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LEADS_VIEW);

    const attempts = await ctx.db
      .query("owner_verifications")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .order("desc")
      .collect();

    const enrichedAttempts = await Promise.all(
      attempts.map(async (attempt) => {
        const admin = await ctx.db.get(attempt.called_by_admin_id);
        return {
          ...attempt,
          admin_name: admin?.name ?? "Unknown",
        };
      }),
    );

    return enrichedAttempts;
  },
});

export const create = mutation({
  args: {
    lead_id: v.id("leads"),
    call_outcome: v.union(
      v.literal(CALL_OUTCOME.VERIFIED),
      v.literal(CALL_OUTCOME.UNREACHABLE),
      v.literal(CALL_OUTCOME.DECLINED),
      v.literal(CALL_OUTCOME.FALSE),
    ),
    consent_contact_demorentals: v.boolean(),
    consent_visit_coordination: v.optional(v.boolean()),
    preferred_visit_slots: v.optional(v.string()),
    rent_confirmed: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.LEADS_VERIFY);

    const lead = await ctx.db.get(args.lead_id);
    if (!lead) {
      throw new Error("Lead not found");
    }

    if (lead.status !== LEAD_STATUS.SUBMITTED) {
      throw new Error(
        `Cannot verify a lead with status: ${lead.status}. Only SUBMITTED leads can be verified.`,
      );
    }

    if (args.rent_confirmed !== undefined && !Number.isInteger(args.rent_confirmed)) {
      throw new Error("Rent confirmed must be a whole number in paise.");
    }

    const verificationId = await ctx.db.insert("owner_verifications", {
      lead_id: args.lead_id,
      called_by_admin_id: admin._id,
      call_outcome: args.call_outcome,
      consent_contact_demorentals: args.consent_contact_demorentals,
      consent_visit_coordination: args.consent_visit_coordination,
      preferred_visit_slots: args.preferred_visit_slots,
      rent_confirmed: args.rent_confirmed,
      notes: args.notes,
      verified_at: Date.now(),
    });

    if (args.call_outcome === CALL_OUTCOME.VERIFIED && args.consent_contact_demorentals) {
      if (!validateLeadTransition(lead.status, LEAD_STATUS.VERIFIED)) {
        throw new Error(`Invalid transition: ${lead.status} → ${LEAD_STATUS.VERIFIED}`);
      }

      let ownerId = lead.owner_id;
      if (!ownerId) {
        const resolvedOwner = await getOrCreateByPhoneInternal(
          ctx,
          lead.owner_phone,
          lead.owner_name,
          OWNER_SOURCE.GUARD_LEAD,
        );
        ownerId = resolvedOwner.ownerId;
      }

      await ctx.db.patch(args.lead_id, {
        status: LEAD_STATUS.VERIFIED,
        owner_id: ownerId,
      });

      const [guardUser, building] = await Promise.all([
        ctx.db.get(lead.submitted_by_guard_id),
        ctx.db.get(lead.building_id),
      ]);

      if (!SKIP_SCHEDULER_SIDE_EFFECTS_IN_TESTS) {
        try {
          await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
            user_id: lead.submitted_by_guard_id,
            event_type: "lead_verified",
            category: NOTIFICATION_CATEGORY.LEAD_UPDATE,
            severity: NOTIFICATION_SEVERITY.IMPORTANT,
            payload: {
              guard_name: guardUser?.name ?? "Guard",
              flat_number: lead.flat_number,
              building_name: building?.name ?? "Unknown building",
            },
            dedup_key: `lead:${lead._id}:verified`,
            action_url: "/guard/leads",
          });
        } catch (error) {
          console.error("Failed to enqueue lead verified notification (non-blocking):", error);
        }
      }

      if (!SKIP_SCHEDULER_SIDE_EFFECTS_IN_TESTS) {
        try {
          await ctx.runMutation(internal.gamification.awardXp, {
            user_id: lead.submitted_by_guard_id,
            persona: INCENTIVE_PERSONA.GUARD,
            xp_amount: XP_AWARDS.LEAD_VERIFIED,
            event_key: `${lead._id}:LEAD_VERIFIED:${lead.submitted_by_guard_id}:verification`,
            reason: "Lead verified",
          });
        } catch (error) {
          console.error("V3 gamification XP hook failed (non-blocking):", error);
        }
      }

      if (ownerId) {
        const owner = await ctx.db.get(ownerId);
        if (
          owner &&
          !owner.is_deleted &&
          owner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.PROSPECT
        ) {
          await progressLifecycleStage(ctx, ownerId, OWNER_LIFECYCLE_STAGE.VERIFIED);
        }
      }

      if (!SKIP_SCHEDULER_SIDE_EFFECTS_IN_TESTS) {
        await ctx.runMutation(internal.incentives.checkAndSuggest, {
          guard_user_id: lead.submitted_by_guard_id,
          trigger: "LEAD_VERIFIED",
        });

        await ctx.runMutation(internal.referrals.checkFirstLeadBonus, {
          guard_user_id: lead.submitted_by_guard_id,
        });
      }

      const linkedListing = await ctx.db
        .query("listings")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
        .first();

      if (linkedListing && !SKIP_SCHEDULER_SIDE_EFFECTS_IN_TESTS) {
        await ctx.scheduler.runAfter(0, internal.trustBadges.computeForListing, {
          listing_id: linkedListing._id,
        });
      }
    } else if (
      args.call_outcome === CALL_OUTCOME.DECLINED ||
      args.call_outcome === CALL_OUTCOME.FALSE
    ) {
      if (!validateLeadTransition(lead.status, LEAD_STATUS.REJECTED)) {
        throw new Error(`Invalid transition: ${lead.status} → ${LEAD_STATUS.REJECTED}`);
      }
      await ctx.db.patch(args.lead_id, { status: LEAD_STATUS.REJECTED });

      const building = await ctx.db.get(lead.building_id);

      if (!SKIP_SCHEDULER_SIDE_EFFECTS_IN_TESTS) {
        try {
          await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
            user_id: lead.submitted_by_guard_id,
            event_type: "lead_rejected",
            category: NOTIFICATION_CATEGORY.LEAD_UPDATE,
            severity: NOTIFICATION_SEVERITY.IMPORTANT,
            payload: {
              flat_number: lead.flat_number,
              building_name: building?.name ?? "Unknown building",
              reason: args.notes?.trim() || args.call_outcome,
            },
            dedup_key: `lead:${lead._id}:rejected`,
            action_url: "/guard/leads",
          });
        } catch (error) {
          console.error("Failed to enqueue lead rejected notification (non-blocking):", error);
        }
      }
    }

    return verificationId;
  },
});
