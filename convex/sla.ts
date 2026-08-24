import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  AUDIT_ACTIONS,
  LEAD_STATUS,
  PAYOUT_STATUS,
  PERMISSIONS,
  SLA_POLICIES,
  SLA_STATUS,
  type SLAStatus,
} from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import { query } from "./functions";

type SLAEntityType = "lead" | "visit" | "payout";

type SLAEntityConfig = {
  auditEntityType: "leads" | "visits" | "payouts";
  insertAction: string;
};

const SLA_ENTITY_CONFIG: Record<SLAEntityType, SLAEntityConfig> = {
  lead: {
    auditEntityType: "leads",
    insertAction: AUDIT_ACTIONS.LEADS_INSERT,
  },
  visit: {
    auditEntityType: "visits",
    insertAction: AUDIT_ACTIONS.VISITS_INSERT,
  },
  payout: {
    auditEntityType: "payouts",
    insertAction: AUDIT_ACTIONS.PAYOUTS_INSERT,
  },
};

function deriveSLAStatus(
  timeElapsedMs: number,
  windowMs: number,
  warningThreshold: number,
): SLAStatus {
  if (timeElapsedMs >= windowMs) {
    return SLA_STATUS.BREACHED;
  }

  if (timeElapsedMs / windowMs >= warningThreshold) {
    return SLA_STATUS.WARNING;
  }

  return SLA_STATUS.ON_TRACK;
}

export const getSLAStatus = query({
  args: {
    entity_type: v.union(v.literal("lead"), v.literal("visit"), v.literal("payout")),
    entity_ids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const policy = SLA_POLICIES[args.entity_type];
    const entityConfig = SLA_ENTITY_CONFIG[args.entity_type];
    const now = Date.now();

    const results: Array<{
      entity_id: string;
      sla_status: SLAStatus;
      time_elapsed_ms: number;
      time_remaining_ms: number;
      breach_time: number;
    }> = [];

    for (const entityId of args.entity_ids) {
      const auditLogs = await ctx.db
        .query("audit_logs")
        .withIndex("by_entity", (q) =>
          q.eq("entity_type", entityConfig.auditEntityType).eq("entity_id", entityId),
        )
        .collect();

      const insertAuditLog = auditLogs.find((entry) => entry.action === entityConfig.insertAction);

      let slaStartTime = insertAuditLog?._creationTime;

      if (slaStartTime === undefined) {
        if (args.entity_type === "lead") {
          const lead = await ctx.db.get(entityId as Id<"leads">);
          slaStartTime = lead?._creationTime;
        } else if (args.entity_type === "visit") {
          const visit = await ctx.db.get(entityId as Id<"visits">);
          slaStartTime = visit?._creationTime;
        } else {
          const payout = await ctx.db.get(entityId as Id<"payouts">);
          slaStartTime = payout?._creationTime;
        }
      }

      const safeSlaStartTime = slaStartTime ?? now;
      const timeElapsedMs = Math.max(0, now - safeSlaStartTime);
      const timeRemainingMs = policy.windowMs - timeElapsedMs;
      const breachTime = safeSlaStartTime + policy.windowMs;

      results.push({
        entity_id: entityId,
        sla_status: deriveSLAStatus(timeElapsedMs, policy.windowMs, policy.warningThreshold),
        time_elapsed_ms: timeElapsedMs,
        time_remaining_ms: timeRemainingMs,
        breach_time: breachTime,
      });
    }

    return results;
  },
});

export const getSLABreachCounts = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const now = Date.now();
    const leadBreachCutoff = now - SLA_POLICIES.lead.windowMs;
    const payoutBreachCutoff = now - SLA_POLICIES.payout.windowMs;

    const [breachedLeads, breachedPayouts] = await Promise.all([
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

    return {
      lead_breaches: breachedLeads.length,
      payout_breaches: breachedPayouts.length,
    };
  },
});
