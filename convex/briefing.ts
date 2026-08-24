import { LEAD_STATUS, PAYOUT_STATUS, PERMISSIONS, SLA_POLICIES } from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import { query } from "./functions";

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

export const getMorningBriefing = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const now = Date.now();
    const startOfDay = now - (now % DAY_MS);
    const endOfDay = startOfDay + DAY_MS;
    const leadBreachCutoff = now - SLA_POLICIES.lead.windowMs;
    const payoutBreachCutoff = now - SLA_POLICIES.payout.windowMs;

    const [
      submittedLeads,
      needInfoLeads,
      visitsToday,
      pendingPayouts,
      breachedLeads,
      breachedPayouts,
    ] = await Promise.all([
      ctx.db
        .query("leads")
        .withIndex("by_status", (q) => q.eq("status", LEAD_STATUS.SUBMITTED))
        .collect(),
      ctx.db
        .query("leads")
        .withIndex("by_status", (q) => q.eq("status", LEAD_STATUS.NEED_INFO))
        .collect(),
      ctx.db
        .query("visits")
        .withIndex("by_scheduled_start", (q) =>
          q.gte("scheduled_start", startOfDay).lt("scheduled_start", endOfDay),
        )
        .collect(),
      ctx.db
        .query("payouts")
        .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.PENDING))
        .collect(),
      ctx.db
        .query("leads")
        .withIndex("by_status", (q) => q.eq("status", LEAD_STATUS.SUBMITTED))
        .filter((q) => q.lt(q.field("_creationTime"), leadBreachCutoff))
        .collect(),
      ctx.db
        .query("payouts")
        .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.PENDING))
        .filter((q) => q.lt(q.field("_creationTime"), payoutBreachCutoff))
        .collect(),
    ]);

    const leadsAwaitingVerification = [...submittedLeads, ...needInfoLeads];
    const oldestLead = leadsAwaitingVerification.reduce<
      (typeof leadsAwaitingVerification)[number] | null
    >((oldest, lead) => {
      if (!oldest) {
        return lead;
      }

      return lead._creationTime < oldest._creationTime ? lead : oldest;
    }, null);

    const oldestAgeMs = oldestLead ? now - oldestLead._creationTime : 0;
    const payoutTotalPaise = pendingPayouts.reduce(
      (total, payout) => total + payout.amount_paise,
      0,
    );

    const topAlert =
      breachedLeads.length > 0
        ? {
            type: "sla_breach" as const,
            message: `${breachedLeads.length} lead(s) have breached their 24-hour verification SLA`,
            entity_id: String(breachedLeads[0]._id),
          }
        : oldestAgeMs > HALF_DAY_MS
          ? {
              type: "old_lead" as const,
              message: `Oldest unverified lead is ${Math.floor(oldestAgeMs / (60 * 60 * 1000))}h old`,
              entity_id: oldestLead ? String(oldestLead._id) : undefined,
            }
          : {
              type: "none" as const,
              message: "",
            };

    return {
      leads_awaiting_verification: {
        count: leadsAwaitingVerification.length,
        oldest_age_ms: oldestAgeMs,
      },
      visits_scheduled_today: {
        count: visitsToday.length,
      },
      payouts_pending_approval: {
        count: pendingPayouts.length,
        total_amount_paise: payoutTotalPaise,
      },
      sla_breaches: {
        lead_breaches: breachedLeads.length,
        payout_breaches: breachedPayouts.length,
      },
      top_alert: topAlert,
    };
  },
});
