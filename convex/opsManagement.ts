import {
  CHECKLIST_STATUS,
  CLOSURE_STATUS,
  DOCUMENT_ITEM_STATUS,
  LEAD_STATUS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  SYSTEM_CONFIG_DEFAULTS,
  SYSTEM_CONFIG_KEYS,
  TENANT_INQUIRY_STATUS,
  USER_STATUS,
  USER_TYPE,
  VISIT_STATUS,
} from "../lib/constants";
import { v } from "convex/values";
import {
  requireAuth,
  requireBackoffice,
  requireFieldWorker,
  requirePermission,
} from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";

const DAY_MS = 24 * 60 * 60 * 1000;
const TARGET_PROGRESS_THRESHOLD = 80;
const RED_MISS_RATE_THRESHOLD = 50;
const QUALITY_SCORE_THRESHOLD = 60;
const DEFAULT_FIRE_NEGOTIATION_STALE_DAYS = 14;
const DEFAULT_FIRE_CHECKIN_OVERDUE_DAYS = 7;
const DEFAULT_CHECKIN_OVERDUE_NUDGE_EVENT_CAP = 10;
const DEFAULT_FIRE_WARNING_QUALITY_THRESHOLD = 40;
const DEFAULT_CASELOAD_THRESHOLD = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.CASELOAD_THRESHOLD],
  10,
);
const DEFAULT_WARNING_LEVEL1_EXPIRY_DAYS = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.WARNING_LEVEL1_EXPIRY_DAYS],
  10,
);
const DEFAULT_WARNING_LEVEL2_EXPIRY_DAYS = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.WARNING_LEVEL2_EXPIRY_DAYS],
  10,
);
const DEFAULT_WARNING_TARGET_MISS_STREAK = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.WARNING_TARGET_MISS_STREAK],
  10,
);
const DEFAULT_WARNING_SLA_BREACH_COUNT_30D = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.WARNING_SLA_BREACH_COUNT_30D],
  10,
);
const DEFAULT_WARNING_INACTIVITY_DAYS = Number.parseInt(
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.WARNING_INACTIVITY_DAYS],
  10,
);
const DEFAULT_WARNING_ESCALATION_AUTO =
  SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.WARNING_ESCALATION_AUTO].toLowerCase() === "true";
const TARGET_LIST_READ_CAP = 1000;
const WARNING_SUMMARY_READ_CAP = 1000;
const OPEN_ACTION_ITEMS_READ_CAP = 1000;
const HEATMAP_FANIN_READ_CAP = 1000;

type FireSeverity = "CRITICAL" | "HIGH" | "MEDIUM";
type FireCategory = "warning" | "stale_negotiation" | "overdue_checkin" | "low_quality";
type FireEntityType = "lead" | "visit" | "negotiation" | "closure" | "warning";
type FireEntityDetail = {
  entity_type: FireEntityType;
  entity_id: string;
  display_label: string;
  days_stuck: number;
  current_blocker: string;
  action_href: string;
};

type FireItem = {
  id: string;
  severity: FireSeverity;
  category: FireCategory;
  description: string;
  agent_name: string;
  agent_user_id: string;
  action_label: string;
  action_href: string;
  entity_details: Array<FireEntityDetail>;
};

const FIRE_SEVERITY_PRIORITY: Record<FireSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
};

const ACTIVE_LEAD_CASELOAD_STATUSES: ReadonlyArray<Doc<"leads">["status"]> = [
  LEAD_STATUS.SUBMITTED,
  LEAD_STATUS.VERIFIED,
  LEAD_STATUS.NEED_INFO,
];

const ACTIVE_VISIT_CASELOAD_STATUSES: ReadonlyArray<Doc<"visits">["status"]> = [
  VISIT_STATUS.ASSIGNED,
  VISIT_STATUS.CONFIRMED,
  VISIT_STATUS.IN_PROGRESS,
];

const ACTIVE_NEGOTIATION_CASELOAD_STATUSES: ReadonlyArray<Doc<"negotiations">["status"]> = [
  NEGOTIATION_STATUS.INITIATED,
  NEGOTIATION_STATUS.ACTIVE,
  NEGOTIATION_STATUS.TERMS_PROPOSED,
  NEGOTIATION_STATUS.COUNTER_PROPOSED,
  NEGOTIATION_STATUS.TERMS_AGREED,
  NEGOTIATION_STATUS.TOKEN_COLLECTED,
  NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
  NEGOTIATION_STATUS.READY_FOR_CLOSURE,
  NEGOTIATION_STATUS.STALLED,
];

const PENDING_VISIT_OVERVIEW_STATUSES: ReadonlyArray<Doc<"visits">["status"]> = [
  VISIT_STATUS.ASSIGNED,
  VISIT_STATUS.CONFIRMED,
];

type CommandCenterOverview = {
  active_leads: number;
  pending_visits: number;
  active_negotiations: number;
  recent_closures_30d: number;
  team_quality_avg: number | null;
  review_compliance_pct: number | null;
  active_ops_count: number;
  active_warning_count: number;
};

type CelebrationItem = {
  id: string;
  type: "closure" | "target_exceeded" | "quality_high";
  agent_name: string;
  agent_user_id: string;
  description: string;
  timestamp: number;
  link_href: string | null;
};

type OpsKpiMetric = Doc<"ops_kpi_targets">["metric"];

const kpiMetricValidator = v.union(
  v.literal("visits_completed"),
  v.literal("closures_confirmed"),
  v.literal("leads_verified"),
  v.literal("quality_score_min"),
  v.literal("checklist_approval_rate"),
  v.literal("document_collection_rate"),
  v.literal("negotiation_closures"),
  v.literal("visit_no_show_rate_max"),
  v.literal("tenant_inquiry_resolutions"),
);

const kpiPeriodTypeValidator = v.union(
  v.literal("WEEKLY"),
  v.literal("MONTHLY"),
  v.literal("QUARTERLY"),
);

const kpiTargetStatusValidator = v.union(
  v.literal("ACTIVE"),
  v.literal("COMPLETED"),
  v.literal("MISSED"),
  v.literal("EXCEEDED"),
  v.literal("CANCELLED"),
);

const warningTriggerTypeValidator = v.union(v.literal("AUTO"), v.literal("MANUAL"));

const warningTriggerReasonValidator = v.union(
  v.literal("LOW_QUALITY_SCORE"),
  v.literal("MISSED_TARGETS"),
  v.literal("SLA_BREACHES"),
  v.literal("INACTIVITY"),
  v.literal("CUSTOM"),
);

const warningStatusValidator = v.union(
  v.literal("ACTIVE"),
  v.literal("ACKNOWLEDGED"),
  v.literal("RESOLVED"),
  v.literal("EXPIRED"),
  v.literal("ESCALATED"),
);

type AutoWarningReason = Extract<
  Doc<"ops_warnings">["trigger_reason"],
  "LOW_QUALITY_SCORE" | "MISSED_TARGETS" | "INACTIVITY" | "SLA_BREACHES"
>;

const AUTO_WARNING_PRIORITY: ReadonlyArray<AutoWarningReason> = [
  "SLA_BREACHES",
  "MISSED_TARGETS",
  "LOW_QUALITY_SCORE",
  "INACTIVITY",
];

const checkInSentimentValidator = v.union(
  v.literal("POSITIVE"),
  v.literal("NEUTRAL"),
  v.literal("NEEDS_IMPROVEMENT"),
);

const checkInActionItemInputValidator = v.object({
  description: v.string(),
  due_date: v.optional(v.number()),
  completed: v.literal(false),
});

type CheckInActionItemInput = {
  description: string;
  due_date?: number;
  completed: false;
};

type CheckInActionItem = Doc<"ops_check_in_notes">["action_items"][number];

const OPS_KPI_METRIC_LABELS: Record<OpsKpiMetric, string> = {
  visits_completed: "Visits Completed",
  closures_confirmed: "Closures Confirmed",
  leads_verified: "Leads Verified",
  quality_score_min: "Quality Score",
  checklist_approval_rate: "Checklist Approval Rate",
  document_collection_rate: "Document Collection Rate",
  negotiation_closures: "Negotiation Closures",
  visit_no_show_rate_max: "Visit No-show Rate",
  tenant_inquiry_resolutions: "Tenant Inquiry Resolutions",
};

type MetricDirection = "HIGHER_BETTER" | "LOWER_BETTER";

const KPI_METRIC_DIRECTION: Record<OpsKpiMetric, MetricDirection> = {
  visits_completed: "HIGHER_BETTER",
  closures_confirmed: "HIGHER_BETTER",
  leads_verified: "HIGHER_BETTER",
  quality_score_min: "HIGHER_BETTER",
  checklist_approval_rate: "HIGHER_BETTER",
  document_collection_rate: "HIGHER_BETTER",
  negotiation_closures: "HIGHER_BETTER",
  visit_no_show_rate_max: "LOWER_BETTER",
  tenant_inquiry_resolutions: "HIGHER_BETTER",
};

const TARGET_PERIOD_DAY_RANGE_BY_TYPE: Record<
  Doc<"ops_kpi_targets">["period_type"],
  { min_days: number; max_days: number }
> = {
  WEEKLY: { min_days: 6, max_days: 8 },
  MONTHLY: { min_days: 28, max_days: 31 },
  QUARTERLY: { min_days: 84, max_days: 93 },
};

const TERMINAL_TENANT_INQUIRY_STATUSES: ReadonlyArray<Doc<"tenant_inquiries">["status"]> = [
  TENANT_INQUIRY_STATUS.CLOSED,
  TENANT_INQUIRY_STATUS.REJECTED,
  TENANT_INQUIRY_STATUS.EXPIRED,
];

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sanitizeCheckInNotes(notes: string): string {
  const trimmedNotes = notes.trim();
  if (trimmedNotes.length === 0) {
    throw new Error("Notes are required");
  }

  return trimmedNotes;
}

function sanitizeCheckInActionItems(
  actionItems: Array<CheckInActionItemInput>,
): Array<CheckInActionItem> {
  return actionItems.map((item, index) => {
    const description = item.description.trim();
    if (description.length === 0) {
      throw new Error(`Action item ${index + 1} description is required`);
    }

    return {
      description,
      due_date: item.due_date,
      completed: false,
      completed_at: undefined,
    };
  });
}

function isInWindow(
  timestamp: number | undefined,
  periodStart: number,
  periodEnd: number,
): boolean {
  if (timestamp === undefined) {
    return false;
  }

  return timestamp >= periodStart && timestamp < periodEnd;
}

function computeTargetProgress(
  actualValue: number,
  targetValue: number,
  direction: MetricDirection,
): number {
  if (targetValue === 0) {
    return 100;
  }

  if (direction === "HIGHER_BETTER") {
    return (actualValue / targetValue) * 100;
  }

  if (actualValue === 0) {
    return 200;
  }

  return (targetValue / actualValue) * 100;
}

function resolveEndedTargetStatus(
  actualValue: number,
  targetValue: number,
  direction: MetricDirection,
): Doc<"ops_kpi_targets">["status"] {
  if (direction === "HIGHER_BETTER") {
    if (actualValue >= targetValue) {
      return "EXCEEDED";
    }

    if (actualValue >= targetValue * 0.8) {
      return "COMPLETED";
    }

    return "MISSED";
  }

  if (actualValue <= targetValue) {
    return "EXCEEDED";
  }

  if (actualValue > targetValue * 1.2) {
    return "MISSED";
  }

  return "COMPLETED";
}

async function computeVisitsCompleted(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const visits = await ctx.db
    .query("visits")
    .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", target.agent_user_id))
    .collect();

  return visits.filter((visit) => {
    if (visit.status !== VISIT_STATUS.COMPLETED && visit.outcome === undefined) {
      return false;
    }

    const completedAt = visit.completed_at ?? visit._creationTime;
    return isInWindow(completedAt, target.period_start, target.period_end);
  }).length;
}

async function computeClosuresConfirmed(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const [agentLeads, confirmedClosures] = await Promise.all([
    ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) =>
        q.eq("submitted_by_guard_id", target.agent_user_id),
      )
      .collect(),
    ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
      .collect(),
  ]);

  const leadIds = new Set(agentLeads.map((lead) => lead._id.toString()));

  return confirmedClosures.filter(
    (closure) =>
      leadIds.has(closure.lead_id.toString()) &&
      isInWindow(closure.confirmed_at, target.period_start, target.period_end),
  ).length;
}

async function computeLeadsVerified(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const statusUpdates = await ctx.db
    .query("audit_logs")
    .withIndex("by_action", (q) => q.eq("action", "LEADS_UPDATE"))
    .filter((q) =>
      q.and(
        q.gte(q.field("_creationTime"), target.period_start),
        q.lt(q.field("_creationTime"), target.period_end),
      ),
    )
    .collect();

  return statusUpdates.filter((log) => {
    if (log.entity_type !== "leads") {
      return false;
    }

    if (log.actor_user_id?.toString() !== target.agent_user_id.toString()) {
      return false;
    }

    return (
      log.changes?.some(
        (change) =>
          change.field === "status" &&
          change.new_value === LEAD_STATUS.VERIFIED &&
          change.old_value !== LEAD_STATUS.VERIFIED,
      ) ?? false
    );
  }).length;
}

async function computeQualityScoreMin(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const profile = await ctx.db
    .query("guard_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", target.agent_user_id))
    .unique();

  return profile?.quality_score ?? 0;
}

async function computeChecklistApprovalRate(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const checklists = await ctx.db
    .query("checklist_instances")
    .withIndex("by_assigned_to", (q) => q.eq("assigned_to", target.agent_user_id))
    .collect();

  let approvedCount = 0;
  let rejectedCount = 0;

  for (const checklist of checklists) {
    if (checklist.is_deleted) {
      continue;
    }

    if (
      checklist.status !== CHECKLIST_STATUS.APPROVED &&
      checklist.status !== CHECKLIST_STATUS.REJECTED
    ) {
      continue;
    }

    const reviewedAt = checklist.reviewed_at ?? checklist._creationTime;
    if (!isInWindow(reviewedAt, target.period_start, target.period_end)) {
      continue;
    }

    if (checklist.status === CHECKLIST_STATUS.APPROVED) {
      approvedCount += 1;
    } else {
      rejectedCount += 1;
    }
  }

  const reviewedCount = approvedCount + rejectedCount;
  if (reviewedCount === 0) {
    return 0;
  }

  return (approvedCount / reviewedCount) * 100;
}

async function computeDocumentCollectionRate(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const requirements = await ctx.db
    .query("document_requirements")
    .withIndex("by_assigned_to", (q) => q.eq("assigned_to", target.agent_user_id))
    .filter((q) =>
      q.and(
        q.neq(q.field("is_deleted"), true),
        q.gte(q.field("_creationTime"), target.period_start),
        q.lt(q.field("_creationTime"), target.period_end),
      ),
    )
    .collect();

  if (requirements.length === 0) {
    return 0;
  }

  let totalItems = 0;
  let collectedItems = 0;

  for (const requirement of requirements) {
    for (const item of requirement.items) {
      totalItems += 1;

      if (
        item.status === DOCUMENT_ITEM_STATUS.COLLECTED &&
        item.collected_by?.toString() === target.agent_user_id.toString() &&
        isInWindow(item.collected_at, target.period_start, target.period_end)
      ) {
        collectedItems += 1;
      }
    }
  }

  if (totalItems === 0) {
    return 0;
  }

  return (collectedItems / totalItems) * 100;
}

async function computeNegotiationClosures(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const negotiations = await ctx.db
    .query("negotiations")
    .withIndex("by_initiated_by_admin_id", (q) =>
      q.eq("initiated_by_admin_id", target.agent_user_id),
    )
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  return negotiations.filter(
    (negotiation) =>
      negotiation.status === NEGOTIATION_STATUS.CLOSED &&
      isInWindow(negotiation.last_activity_at, target.period_start, target.period_end),
  ).length;
}

async function computeVisitNoShowRateMax(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const visits = await ctx.db
    .query("visits")
    .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", target.agent_user_id))
    .filter((q) =>
      q.and(
        q.gte(q.field("_creationTime"), target.period_start),
        q.lt(q.field("_creationTime"), target.period_end),
      ),
    )
    .collect();

  if (visits.length === 0) {
    return 0;
  }

  const noShowCount = visits.filter((visit) => visit.status === VISIT_STATUS.NO_SHOW).length;
  return (noShowCount / visits.length) * 100;
}

async function computeTenantInquiryResolutions(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  const [assignedInquiries, terminalStatusGroups] = await Promise.all([
    ctx.db
      .query("tenant_inquiries")
      .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", target.agent_user_id))
      .collect(),
    Promise.all(
      TERMINAL_TENANT_INQUIRY_STATUSES.map((status) =>
        ctx.db
          .query("tenant_inquiries")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect(),
      ),
    ),
  ]);

  const resolvedInquiryIds = new Set<string>();

  for (const inquiry of assignedInquiries) {
    const updatedAt = inquiry.updated_at ?? inquiry._creationTime;
    if (
      TERMINAL_TENANT_INQUIRY_STATUSES.includes(inquiry.status) &&
      isInWindow(updatedAt, target.period_start, target.period_end)
    ) {
      resolvedInquiryIds.add(inquiry._id.toString());
    }
  }

  for (const inquiries of terminalStatusGroups) {
    for (const inquiry of inquiries) {
      const updatedAt = inquiry.updated_at ?? inquiry._creationTime;
      if (
        inquiry.reviewed_by_admin_id?.toString() === target.agent_user_id.toString() &&
        isInWindow(updatedAt, target.period_start, target.period_end)
      ) {
        resolvedInquiryIds.add(inquiry._id.toString());
      }
    }
  }

  return resolvedInquiryIds.size;
}

async function calculateMetricActualValue(
  ctx: MutationCtx,
  target: Doc<"ops_kpi_targets">,
): Promise<number> {
  switch (target.metric) {
    case "visits_completed":
      return await computeVisitsCompleted(ctx, target);
    case "closures_confirmed":
      return await computeClosuresConfirmed(ctx, target);
    case "leads_verified":
      return await computeLeadsVerified(ctx, target);
    case "quality_score_min":
      return await computeQualityScoreMin(ctx, target);
    case "checklist_approval_rate":
      return await computeChecklistApprovalRate(ctx, target);
    case "document_collection_rate":
      return await computeDocumentCollectionRate(ctx, target);
    case "negotiation_closures":
      return await computeNegotiationClosures(ctx, target);
    case "visit_no_show_rate_max":
      return await computeVisitNoShowRateMax(ctx, target);
    case "tenant_inquiry_resolutions":
      return await computeTenantInquiryResolutions(ctx, target);
    default: {
      const exhaustiveCheck: never = target.metric;
      throw new Error(`Unsupported metric: ${exhaustiveCheck}`);
    }
  }
}

type WeightedMetricEvent = {
  timestamp: number;
  value: number;
};

type TimeSeries = {
  timestamps: Array<number>;
  cumulativeValues: Array<number>;
};

type TargetActualPreAggregates = {
  qualityScoreByAgent: Map<string, number>;
  visitsCompletedByAgent: Map<string, TimeSeries>;
  closuresConfirmedByAgent: Map<string, TimeSeries>;
  leadsVerifiedByAgent: Map<string, TimeSeries>;
  checklistApprovedByAgent: Map<string, TimeSeries>;
  checklistRejectedByAgent: Map<string, TimeSeries>;
  documentTotalItemsByAgent: Map<string, TimeSeries>;
  documentCollectedItemsByAgent: Map<string, TimeSeries>;
  negotiationClosuresByAgent: Map<string, TimeSeries>;
  visitNoShowsByAgent: Map<string, TimeSeries>;
  totalVisitsByAgent: Map<string, TimeSeries>;
  tenantInquiryResolutionsByAgent: Map<string, TimeSeries>;
};

function lowerBound(sorted: Array<number>, value: number): number {
  let low = 0;
  let high = sorted.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (sorted[mid] < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function buildTimeSeries(events: Array<WeightedMetricEvent>): TimeSeries | undefined {
  if (events.length === 0) {
    return undefined;
  }

  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const timestamps: Array<number> = [];
  const cumulativeValues: Array<number> = [];

  let runningTotal = 0;
  for (const event of sortedEvents) {
    runningTotal += event.value;
    timestamps.push(event.timestamp);
    cumulativeValues.push(runningTotal);
  }

  return {
    timestamps,
    cumulativeValues,
  };
}

function buildTimeSeriesMap(
  eventsByAgent: Map<string, Array<WeightedMetricEvent>>,
): Map<string, TimeSeries> {
  const seriesByAgent = new Map<string, TimeSeries>();

  for (const [agentKey, events] of eventsByAgent) {
    const series = buildTimeSeries(events);
    if (series) {
      seriesByAgent.set(agentKey, series);
    }
  }

  return seriesByAgent;
}

function sumTimeSeriesInWindow(
  series: TimeSeries | undefined,
  periodStart: number,
  periodEnd: number,
): number {
  if (!series || periodStart >= periodEnd) {
    return 0;
  }

  const startIndex = lowerBound(series.timestamps, periodStart);
  const endIndex = lowerBound(series.timestamps, periodEnd);

  if (startIndex >= endIndex) {
    return 0;
  }

  const totalBeforeEnd = series.cumulativeValues[endIndex - 1] ?? 0;
  const totalBeforeStart = startIndex > 0 ? (series.cumulativeValues[startIndex - 1] ?? 0) : 0;
  return totalBeforeEnd - totalBeforeStart;
}

function addWeightedEvent(
  eventsByAgent: Map<string, Array<WeightedMetricEvent>>,
  agentKey: string,
  timestamp: number | undefined,
  periodStart: number,
  periodEnd: number,
  value = 1,
): void {
  if (timestamp === undefined || !isInWindow(timestamp, periodStart, periodEnd)) {
    return;
  }

  const eventTimestamp = timestamp;

  const events = eventsByAgent.get(agentKey) ?? [];
  events.push({
    timestamp: eventTimestamp,
    value,
  });
  eventsByAgent.set(agentKey, events);
}

function didLeadTransitionToVerified(changes: Doc<"audit_logs">["changes"]): boolean {
  return (
    changes?.some(
      (change) =>
        change.field === "status" &&
        change.new_value === LEAD_STATUS.VERIFIED &&
        change.old_value !== LEAD_STATUS.VERIFIED,
    ) ?? false
  );
}

function calculateMetricActualValueFromPreAggregates(
  target: Doc<"ops_kpi_targets">,
  preAggregates: TargetActualPreAggregates,
): number {
  const agentKey = target.agent_user_id.toString();
  const periodStart = target.period_start;
  const periodEnd = target.period_end;

  switch (target.metric) {
    case "visits_completed":
      return sumTimeSeriesInWindow(
        preAggregates.visitsCompletedByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
    case "closures_confirmed":
      return sumTimeSeriesInWindow(
        preAggregates.closuresConfirmedByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
    case "leads_verified":
      return sumTimeSeriesInWindow(
        preAggregates.leadsVerifiedByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
    case "quality_score_min":
      return preAggregates.qualityScoreByAgent.get(agentKey) ?? 0;
    case "checklist_approval_rate": {
      const approvedCount = sumTimeSeriesInWindow(
        preAggregates.checklistApprovedByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
      const rejectedCount = sumTimeSeriesInWindow(
        preAggregates.checklistRejectedByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
      const reviewedCount = approvedCount + rejectedCount;
      if (reviewedCount === 0) {
        return 0;
      }
      return (approvedCount / reviewedCount) * 100;
    }
    case "document_collection_rate": {
      const totalItems = sumTimeSeriesInWindow(
        preAggregates.documentTotalItemsByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
      if (totalItems === 0) {
        return 0;
      }
      const collectedItems = sumTimeSeriesInWindow(
        preAggregates.documentCollectedItemsByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
      return (collectedItems / totalItems) * 100;
    }
    case "negotiation_closures":
      return sumTimeSeriesInWindow(
        preAggregates.negotiationClosuresByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
    case "visit_no_show_rate_max": {
      const totalVisits = sumTimeSeriesInWindow(
        preAggregates.totalVisitsByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
      if (totalVisits === 0) {
        return 0;
      }
      const noShows = sumTimeSeriesInWindow(
        preAggregates.visitNoShowsByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
      return (noShows / totalVisits) * 100;
    }
    case "tenant_inquiry_resolutions":
      return sumTimeSeriesInWindow(
        preAggregates.tenantInquiryResolutionsByAgent.get(agentKey),
        periodStart,
        periodEnd,
      );
    default: {
      const exhaustiveCheck: never = target.metric;
      throw new Error(`Unsupported metric: ${exhaustiveCheck}`);
    }
  }
}

async function precomputeTargetActualValues(
  ctx: MutationCtx,
  targets: Array<Doc<"ops_kpi_targets">>,
): Promise<Map<string, number>> {
  if (targets.length === 0) {
    return new Map();
  }

  const agentUserIds: Array<Id<"users">> = [];
  const activeAgentKeys = new Set<string>();
  let minPeriodStart = Number.POSITIVE_INFINITY;
  let maxPeriodEnd = Number.NEGATIVE_INFINITY;

  for (const target of targets) {
    const agentKey = target.agent_user_id.toString();
    if (!activeAgentKeys.has(agentKey)) {
      activeAgentKeys.add(agentKey);
      agentUserIds.push(target.agent_user_id);
    }

    if (target.period_start < minPeriodStart) {
      minPeriodStart = target.period_start;
    }
    if (target.period_end > maxPeriodEnd) {
      maxPeriodEnd = target.period_end;
    }
  }

  const [
    visitsByAgent,
    leadsByAgent,
    confirmedClosures,
    leadUpdateAuditLogs,
    checklistsByAgent,
    requirementsByAgent,
    negotiationsByAgent,
    terminalInquiryGroups,
    assignedInquiriesByAgent,
    guardProfilesByAgent,
  ] = await Promise.all([
    Promise.all(
      agentUserIds.map((agentUserId) =>
        ctx.db
          .query("visits")
          .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", agentUserId))
          .collect(),
      ),
    ),
    Promise.all(
      agentUserIds.map((agentUserId) =>
        ctx.db
          .query("leads")
          .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", agentUserId))
          .collect(),
      ),
    ),
    ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
      .collect(),
    ctx.db
      .query("audit_logs")
      .withIndex("by_action", (q) => q.eq("action", "LEADS_UPDATE"))
      .filter((q) =>
        q.and(
          q.eq(q.field("entity_type"), "leads"),
          q.gte(q.field("_creationTime"), minPeriodStart),
          q.lt(q.field("_creationTime"), maxPeriodEnd),
        ),
      )
      .collect(),
    Promise.all(
      agentUserIds.map((agentUserId) =>
        ctx.db
          .query("checklist_instances")
          .withIndex("by_assigned_to", (q) => q.eq("assigned_to", agentUserId))
          .collect(),
      ),
    ),
    Promise.all(
      agentUserIds.map((agentUserId) =>
        ctx.db
          .query("document_requirements")
          .withIndex("by_assigned_to", (q) => q.eq("assigned_to", agentUserId))
          .collect(),
      ),
    ),
    Promise.all(
      agentUserIds.map((agentUserId) =>
        ctx.db
          .query("negotiations")
          .withIndex("by_initiated_by_admin_id", (q) => q.eq("initiated_by_admin_id", agentUserId))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .collect(),
      ),
    ),
    Promise.all(
      TERMINAL_TENANT_INQUIRY_STATUSES.map((status) =>
        ctx.db
          .query("tenant_inquiries")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect(),
      ),
    ),
    Promise.all(
      agentUserIds.map((agentUserId) =>
        ctx.db
          .query("tenant_inquiries")
          .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", agentUserId))
          .collect(),
      ),
    ),
    Promise.all(
      agentUserIds.map((agentUserId) =>
        ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", agentUserId))
          .unique(),
      ),
    ),
  ]);

  const visitsCompletedEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const totalVisitEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const noShowVisitEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const closureConfirmedEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const leadsVerifiedEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const checklistApprovedEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const checklistRejectedEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const documentTotalItemEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const documentCollectedItemEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const negotiationClosureEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const tenantInquiryResolutionEventsByAgent = new Map<string, Array<WeightedMetricEvent>>();
  const leadAgentKeyById = new Map<string, string>();
  const qualityScoreByAgent = new Map<string, number>();

  for (const [index, agentUserId] of agentUserIds.entries()) {
    const agentKey = agentUserId.toString();

    const visits = visitsByAgent[index] ?? [];
    for (const visit of visits) {
      addWeightedEvent(
        totalVisitEventsByAgent,
        agentKey,
        visit._creationTime,
        minPeriodStart,
        maxPeriodEnd,
      );

      if (visit.status === VISIT_STATUS.NO_SHOW) {
        addWeightedEvent(
          noShowVisitEventsByAgent,
          agentKey,
          visit._creationTime,
          minPeriodStart,
          maxPeriodEnd,
        );
      }

      if (visit.status === VISIT_STATUS.COMPLETED || visit.outcome !== undefined) {
        addWeightedEvent(
          visitsCompletedEventsByAgent,
          agentKey,
          visit.completed_at ?? visit._creationTime,
          minPeriodStart,
          maxPeriodEnd,
        );
      }
    }

    const leads = leadsByAgent[index] ?? [];
    for (const lead of leads) {
      leadAgentKeyById.set(lead._id.toString(), agentKey);
    }

    const checklists = checklistsByAgent[index] ?? [];
    for (const checklist of checklists) {
      if (checklist.is_deleted) {
        continue;
      }

      const reviewedAt = checklist.reviewed_at ?? checklist._creationTime;
      if (checklist.status === CHECKLIST_STATUS.APPROVED) {
        addWeightedEvent(
          checklistApprovedEventsByAgent,
          agentKey,
          reviewedAt,
          minPeriodStart,
          maxPeriodEnd,
        );
      } else if (checklist.status === CHECKLIST_STATUS.REJECTED) {
        addWeightedEvent(
          checklistRejectedEventsByAgent,
          agentKey,
          reviewedAt,
          minPeriodStart,
          maxPeriodEnd,
        );
      }
    }

    const requirements = requirementsByAgent[index] ?? [];
    for (const requirement of requirements) {
      if (requirement.is_deleted) {
        continue;
      }

      if (requirement.items.length > 0) {
        addWeightedEvent(
          documentTotalItemEventsByAgent,
          agentKey,
          requirement._creationTime,
          minPeriodStart,
          maxPeriodEnd,
          requirement.items.length,
        );
      }

      for (const item of requirement.items) {
        if (
          item.status === DOCUMENT_ITEM_STATUS.COLLECTED &&
          item.collected_by?.toString() === agentKey
        ) {
          addWeightedEvent(
            documentCollectedItemEventsByAgent,
            agentKey,
            item.collected_at,
            minPeriodStart,
            maxPeriodEnd,
          );
        }
      }
    }

    const negotiations = negotiationsByAgent[index] ?? [];
    for (const negotiation of negotiations) {
      if (negotiation.status !== NEGOTIATION_STATUS.CLOSED || negotiation.is_deleted) {
        continue;
      }

      addWeightedEvent(
        negotiationClosureEventsByAgent,
        agentKey,
        negotiation.last_activity_at,
        minPeriodStart,
        maxPeriodEnd,
      );
    }

    const guardProfile = guardProfilesByAgent[index];
    qualityScoreByAgent.set(agentKey, guardProfile?.quality_score ?? 0);
  }

  for (const closure of confirmedClosures) {
    const agentKey = leadAgentKeyById.get(closure.lead_id.toString());
    if (!agentKey) {
      continue;
    }

    addWeightedEvent(
      closureConfirmedEventsByAgent,
      agentKey,
      closure.confirmed_at,
      minPeriodStart,
      maxPeriodEnd,
    );
  }

  for (const log of leadUpdateAuditLogs) {
    const actorKey = log.actor_user_id?.toString();
    if (!actorKey || !activeAgentKeys.has(actorKey)) {
      continue;
    }

    if (!didLeadTransitionToVerified(log.changes)) {
      continue;
    }

    addWeightedEvent(
      leadsVerifiedEventsByAgent,
      actorKey,
      log._creationTime,
      minPeriodStart,
      maxPeriodEnd,
    );
  }

  const resolvedInquiryTimestampsByAgent = new Map<string, Map<string, number>>();
  const recordResolvedInquiry = (
    agentKey: string,
    inquiryId: string,
    resolvedAt: number | undefined,
  ): void => {
    if (resolvedAt === undefined || !isInWindow(resolvedAt, minPeriodStart, maxPeriodEnd)) {
      return;
    }

    const resolvedTimestamp = resolvedAt;

    const byInquiry = resolvedInquiryTimestampsByAgent.get(agentKey) ?? new Map<string, number>();
    if (!byInquiry.has(inquiryId)) {
      byInquiry.set(inquiryId, resolvedTimestamp);
    }
    resolvedInquiryTimestampsByAgent.set(agentKey, byInquiry);
  };

  for (const inquiries of assignedInquiriesByAgent) {
    for (const inquiry of inquiries) {
      if (!inquiry.assigned_guard_id) {
        continue;
      }

      if (!TERMINAL_TENANT_INQUIRY_STATUSES.includes(inquiry.status)) {
        continue;
      }

      recordResolvedInquiry(
        inquiry.assigned_guard_id.toString(),
        inquiry._id.toString(),
        inquiry.updated_at ?? inquiry._creationTime,
      );
    }
  }

  for (const terminalInquiries of terminalInquiryGroups) {
    for (const inquiry of terminalInquiries) {
      const reviewerKey = inquiry.reviewed_by_admin_id?.toString();
      if (!reviewerKey || !activeAgentKeys.has(reviewerKey)) {
        continue;
      }

      recordResolvedInquiry(
        reviewerKey,
        inquiry._id.toString(),
        inquiry.updated_at ?? inquiry._creationTime,
      );
    }
  }

  for (const [agentKey, inquiryTimestamps] of resolvedInquiryTimestampsByAgent) {
    for (const resolvedAt of inquiryTimestamps.values()) {
      addWeightedEvent(
        tenantInquiryResolutionEventsByAgent,
        agentKey,
        resolvedAt,
        minPeriodStart,
        maxPeriodEnd,
      );
    }
  }

  const preAggregates: TargetActualPreAggregates = {
    qualityScoreByAgent,
    visitsCompletedByAgent: buildTimeSeriesMap(visitsCompletedEventsByAgent),
    closuresConfirmedByAgent: buildTimeSeriesMap(closureConfirmedEventsByAgent),
    leadsVerifiedByAgent: buildTimeSeriesMap(leadsVerifiedEventsByAgent),
    checklistApprovedByAgent: buildTimeSeriesMap(checklistApprovedEventsByAgent),
    checklistRejectedByAgent: buildTimeSeriesMap(checklistRejectedEventsByAgent),
    documentTotalItemsByAgent: buildTimeSeriesMap(documentTotalItemEventsByAgent),
    documentCollectedItemsByAgent: buildTimeSeriesMap(documentCollectedItemEventsByAgent),
    negotiationClosuresByAgent: buildTimeSeriesMap(negotiationClosureEventsByAgent),
    visitNoShowsByAgent: buildTimeSeriesMap(noShowVisitEventsByAgent),
    totalVisitsByAgent: buildTimeSeriesMap(totalVisitEventsByAgent),
    tenantInquiryResolutionsByAgent: buildTimeSeriesMap(tenantInquiryResolutionEventsByAgent),
  };

  const actualValuesByTargetId = new Map<string, number>();

  for (const target of targets) {
    actualValuesByTargetId.set(
      target._id.toString(),
      calculateMetricActualValueFromPreAggregates(target, preAggregates),
    );
  }

  return actualValuesByTargetId;
}

function parseConfigNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedNumber = Number(value);
  if (Number.isFinite(parsedNumber)) {
    return parsedNumber;
  }

  try {
    const parsedJson = JSON.parse(value) as unknown;
    if (typeof parsedJson === "number" && Number.isFinite(parsedJson)) {
      return parsedJson;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function parseConfigBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  try {
    const parsedJson = JSON.parse(value) as unknown;
    if (typeof parsedJson === "boolean") {
      return parsedJson;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

async function resolveWarningExpiryAt(
  ctx: MutationCtx,
  warningLevel: 1 | 2 | 3,
  now: number,
): Promise<number | undefined> {
  if (warningLevel === 3) {
    return undefined;
  }

  const [configKey, fallbackDays] =
    warningLevel === 1
      ? [SYSTEM_CONFIG_KEYS.WARNING_LEVEL1_EXPIRY_DAYS, DEFAULT_WARNING_LEVEL1_EXPIRY_DAYS]
      : [SYSTEM_CONFIG_KEYS.WARNING_LEVEL2_EXPIRY_DAYS, DEFAULT_WARNING_LEVEL2_EXPIRY_DAYS];

  const config = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", configKey))
    .unique();

  const expiryDays = Math.max(0, Math.floor(parseConfigNumber(config?.value, fallbackDays)));
  return now + expiryDays * DAY_MS;
}

async function findActiveWarningDuplicate(
  ctx: MutationCtx,
  args: {
    agent_user_id: Id<"users">;
    warning_level: 1 | 2 | 3;
    trigger_reason: Doc<"ops_warnings">["trigger_reason"];
  },
): Promise<Doc<"ops_warnings"> | null> {
  return await ctx.db
    .query("ops_warnings")
    .withIndex("by_agent_level_reason_status", (q) =>
      q
        .eq("agent_user_id", args.agent_user_id)
        .eq("warning_level", args.warning_level)
        .eq("trigger_reason", args.trigger_reason)
        .eq("status", "ACTIVE"),
    )
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .first();
}

async function hasActiveWarningDuplicate(
  ctx: MutationCtx,
  args: {
    agent_user_id: Id<"users">;
    warning_level: 1 | 2 | 3;
    trigger_reason: Doc<"ops_warnings">["trigger_reason"];
  },
): Promise<boolean> {
  const duplicate = await findActiveWarningDuplicate(ctx, args);
  return duplicate !== null;
}

function isActiveBackofficeUser(user: Doc<"users">): boolean {
  const userTypes = user.user_types ?? [user.user_type];
  const isBackoffice = userTypes.includes(USER_TYPE.ADMIN) || userTypes.includes(USER_TYPE.OPS);
  return isBackoffice && user.status === USER_STATUS.ACTIVE;
}

function getWarningNotificationSeverity(
  warningLevel: 1 | 2 | 3,
): Doc<"notification_events">["severity"] {
  return warningLevel >= 2 ? NOTIFICATION_SEVERITY.URGENT : NOTIFICATION_SEVERITY.IMPORTANT;
}

async function enqueueNotificationEvent(
  ctx: MutationCtx,
  args: {
    user_id: Id<"users">;
    event_type: string;
    category: Doc<"notification_events">["category"];
    severity: Doc<"notification_events">["severity"];
    payload: Record<string, string | number | boolean | null>;
    dedup_key?: string;
    action_url?: string;
    log_context: string;
  },
): Promise<void> {
  try {
    await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
      user_id: args.user_id,
      event_type: args.event_type,
      category: args.category,
      severity: args.severity,
      payload: args.payload,
      dedup_key: args.dedup_key,
      action_url: args.action_url,
    });
  } catch (error) {
    console.error(`[${args.log_context}] Failed to enqueue notification (non-blocking):`, error);
  }
}

async function getCaseloadThreshold(ctx: QueryCtx): Promise<number> {
  const config = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CASELOAD_THRESHOLD))
    .unique();

  return parseConfigNumber(config?.value, DEFAULT_CASELOAD_THRESHOLD);
}

async function listActiveOpsUsers(ctx: QueryCtx | MutationCtx): Promise<Array<Doc<"users">>> {
  const activeUsers = await ctx.db
    .query("users")
    .withIndex("by_status", (q) => q.eq("status", USER_STATUS.ACTIVE))
    .collect();

  return activeUsers.filter(isActiveOpsUser);
}

function countWarningLevels(warnings: Array<Doc<"ops_warnings">>) {
  const level1 = warnings.filter((warning) => warning.warning_level === 1).length;
  const level2 = warnings.filter((warning) => warning.warning_level === 2).length;
  const level3 = warnings.filter((warning) => warning.warning_level >= 3).length;

  return {
    level1,
    level2,
    level3,
  };
}

const WARNING_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["ACKNOWLEDGED", "RESOLVED", "EXPIRED", "ESCALATED"],
  ACKNOWLEDGED: ["RESOLVED", "EXPIRED", "ESCALATED"],
  RESOLVED: [],
  EXPIRED: [],
  ESCALATED: [],
};

function isValidWarningLevel(level: number): level is 1 | 2 | 3 {
  return level === 1 || level === 2 || level === 3;
}

function canTransitionWarning(
  currentStatus: Doc<"ops_warnings">["status"],
  nextStatus: Doc<"ops_warnings">["status"],
): boolean {
  return WARNING_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
}

function getDaysStuck(now: number, timestamp: number): number {
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

function isActiveOpsUser(user: Doc<"users">): boolean {
  return (
    (user.user_type === USER_TYPE.OPS || user.user_types?.includes(USER_TYPE.OPS) === true) &&
    user.status === USER_STATUS.ACTIVE
  );
}

function hasPeriodOverlap(
  existingPeriodStart: number,
  existingPeriodEnd: number,
  periodStart: number,
  periodEnd: number,
): boolean {
  return existingPeriodStart < periodEnd && existingPeriodEnd > periodStart;
}

function assertTargetPeriodWindow(
  periodStart: number,
  periodEnd: number,
  options: { enforceFutureStart: boolean },
): void {
  if (periodEnd <= periodStart) {
    throw new Error("Period end must be greater than period start");
  }

  if (options.enforceFutureStart && periodStart < Date.now()) {
    throw new Error("Target period start cannot be in the past");
  }
}

function assertTargetPeriodTypeAlignment(
  periodType: Doc<"ops_kpi_targets">["period_type"],
  periodStart: number,
  periodEnd: number,
): void {
  const range = TARGET_PERIOD_DAY_RANGE_BY_TYPE[periodType];
  const durationInDays = (periodEnd - periodStart) / DAY_MS;

  if (durationInDays < range.min_days || durationInDays > range.max_days) {
    throw new Error(
      `${periodType} target period must span between ${range.min_days} and ${range.max_days} days`,
    );
  }
}

async function listActiveTargetsForAgentMetric(
  ctx: MutationCtx,
  agentUserId: Id<"users">,
  metric: OpsKpiMetric,
): Promise<Array<Doc<"ops_kpi_targets">>> {
  return await ctx.db
    .query("ops_kpi_targets")
    .withIndex("by_agent_metric_period", (q) =>
      q.eq("agent_user_id", agentUserId).eq("metric", metric),
    )
    .filter((q) => q.and(q.eq(q.field("status"), "ACTIVE"), q.neq(q.field("is_deleted"), true)))
    .collect();
}

async function hasActiveTargetOverlap(
  ctx: MutationCtx,
  args: {
    agent_user_id: Id<"users">;
    metric: OpsKpiMetric;
    period_start: number;
    period_end: number;
  },
): Promise<boolean> {
  const existingTargets = await listActiveTargetsForAgentMetric(
    ctx,
    args.agent_user_id,
    args.metric,
  );
  return existingTargets.some((target) =>
    hasPeriodOverlap(target.period_start, target.period_end, args.period_start, args.period_end),
  );
}

export const getCommandCenterOverview = query({
  args: {},
  handler: async (ctx): Promise<CommandCenterOverview> => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const now = Date.now();
    const thirtyDaysAgo = now - DAY_MS * 30;

    const [
      leadGroups,
      visitGroups,
      negotiationGroups,
      confirmedClosures,
      activeOpsUsers,
      warningRows,
      checkinConfig,
    ] = await Promise.all([
      Promise.all(
        ACTIVE_LEAD_CASELOAD_STATUSES.map((status) =>
          ctx.db
            .query("leads")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect(),
        ),
      ),
      Promise.all(
        PENDING_VISIT_OVERVIEW_STATUSES.map((status) =>
          ctx.db
            .query("visits")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect(),
        ),
      ),
      Promise.all(
        ACTIVE_NEGOTIATION_CASELOAD_STATUSES.map((status) =>
          ctx.db
            .query("negotiations")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect(),
        ),
      ),
      ctx.db
        .query("closures")
        .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
        .collect(),
      listActiveOpsUsers(ctx),
      ctx.db
        .query("ops_warnings")
        .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
        .collect(),
      ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CHECKIN_OVERDUE_DAYS))
        .unique(),
    ]);

    const activeLeads = leadGroups.reduce((sum, leads) => sum + leads.length, 0);
    const pendingVisits = visitGroups.reduce((sum, visits) => sum + visits.length, 0);

    let activeNegotiations = 0;
    for (const negotiations of negotiationGroups) {
      for (const negotiation of negotiations) {
        if (!negotiation.is_deleted) {
          activeNegotiations += 1;
        }
      }
    }

    const recentClosures30d = confirmedClosures.filter(
      (closure) => closure.confirmed_at !== undefined && closure.confirmed_at >= thirtyDaysAgo,
    ).length;

    const checkinOverdueDays = parseConfigNumber(
      checkinConfig?.value,
      DEFAULT_FIRE_CHECKIN_OVERDUE_DAYS,
    );
    const checkinCutoff = now - checkinOverdueDays * DAY_MS;

    const opsStats = await Promise.all(
      activeOpsUsers.map(async (user) => {
        const [guardProfile, latestCheckIn] = await Promise.all([
          ctx.db
            .query("guard_profiles")
            .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
            .unique(),
          ctx.db
            .query("ops_check_in_notes")
            .withIndex("by_agent", (q) => q.eq("agent_user_id", user._id))
            .filter((q) => q.neq(q.field("is_deleted"), true))
            .order("desc")
            .first(),
        ]);

        return {
          qualityScore: guardProfile?.quality_score,
          hasRecentCheckin: latestCheckIn !== null && latestCheckIn.created_at >= checkinCutoff,
        };
      }),
    );

    const qualityScores = opsStats
      .map((entry) => entry.qualityScore)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    const teamQualityAvg =
      qualityScores.length === 0
        ? null
        : roundTo2(qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length);

    const compliantOpsCount = opsStats.filter((entry) => entry.hasRecentCheckin).length;
    const reviewCompliancePct =
      activeOpsUsers.length === 0
        ? null
        : roundTo2((compliantOpsCount / activeOpsUsers.length) * 100);

    const activeWarningCount = warningRows.filter((warning) => !warning.is_deleted).length;

    return {
      active_leads: activeLeads,
      pending_visits: pendingVisits,
      active_negotiations: activeNegotiations,
      recent_closures_30d: recentClosures30d,
      team_quality_avg: teamQualityAvg,
      review_compliance_pct: reviewCompliancePct,
      active_ops_count: activeOpsUsers.length,
      active_warning_count: activeWarningCount,
    };
  },
});

export const getMyTargets = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireFieldWorker(ctx);

    const targets = await ctx.db
      .query("ops_kpi_targets")
      .withIndex("by_agent_metric_period", (q) => q.eq("agent_user_id", user._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return targets.sort((a, b) => b.period_start - a.period_start);
  },
});

export const createTarget = mutation({
  args: {
    agent_user_id: v.id("users"),
    metric: kpiMetricValidator,
    target_value: v.number(),
    period_type: kpiPeriodTypeValidator,
    period_start: v.number(),
    period_end: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_SET_TARGETS);

    if (args.target_value <= 0) {
      throw new Error("Target value must be greater than 0");
    }
    assertTargetPeriodWindow(args.period_start, args.period_end, { enforceFutureStart: true });
    assertTargetPeriodTypeAlignment(args.period_type, args.period_start, args.period_end);

    const agentUser = await ctx.db.get(args.agent_user_id);
    if (!agentUser || !isActiveOpsUser(agentUser)) {
      throw new Error("Target agent must be an active OPS user");
    }

    const hasOverlap = await hasActiveTargetOverlap(ctx, args);
    if (hasOverlap) {
      throw new Error("Active target already exists for this agent/metric/period");
    }

    const timestamp = Date.now();
    return await ctx.db.insert("ops_kpi_targets", {
      agent_user_id: args.agent_user_id,
      set_by_user_id: actor._id,
      metric: args.metric,
      target_value: args.target_value,
      period_type: args.period_type,
      period_start: args.period_start,
      period_end: args.period_end,
      status: "ACTIVE",
      notes: args.notes,
      created_at: timestamp,
      updated_at: timestamp,
      is_deleted: false,
    });
  },
});

export const applyTargetTemplate = mutation({
  args: {
    template: v.array(
      v.object({
        metric: kpiMetricValidator,
        target_value: v.number(),
      }),
    ),
    period_type: kpiPeriodTypeValidator,
    period_start: v.number(),
    period_end: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_SET_TARGETS);

    if (args.template.length === 0) {
      throw new Error("Template must include at least one metric");
    }

    assertTargetPeriodWindow(args.period_start, args.period_end, { enforceFutureStart: true });
    assertTargetPeriodTypeAlignment(args.period_type, args.period_start, args.period_end);

    const seenMetrics = new Set<OpsKpiMetric>();
    for (const entry of args.template) {
      if (entry.target_value <= 0) {
        throw new Error(`Target value for ${entry.metric} must be greater than 0`);
      }

      if (seenMetrics.has(entry.metric)) {
        throw new Error(`Duplicate metric in template: ${entry.metric}`);
      }

      seenMetrics.add(entry.metric);
    }

    const activeOpsUsers = await listActiveOpsUsers(ctx);

    if (activeOpsUsers.length === 0) {
      return {
        created: 0,
        skipped: 0,
        errors: [] as string[],
      };
    }

    const timestamp = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of activeOpsUsers) {
      for (const entry of args.template) {
        try {
          const hasOverlap = await hasActiveTargetOverlap(ctx, {
            agent_user_id: user._id,
            metric: entry.metric,
            period_start: args.period_start,
            period_end: args.period_end,
          });

          if (hasOverlap) {
            skipped += 1;
            continue;
          }

          await ctx.db.insert("ops_kpi_targets", {
            agent_user_id: user._id,
            set_by_user_id: actor._id,
            metric: entry.metric,
            target_value: entry.target_value,
            period_type: args.period_type,
            period_start: args.period_start,
            period_end: args.period_end,
            status: "ACTIVE",
            notes: "Bulk template apply",
            created_at: timestamp,
            updated_at: timestamp,
            is_deleted: false,
          });
          created += 1;
        } catch (error) {
          errors.push(
            `Failed for ${user.name} (${entry.metric}): ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }
    }

    return {
      created,
      skipped,
      errors,
    };
  },
});

export const rollForwardTargets = mutation({
  args: {
    source_period_start: v.number(),
    source_period_end: v.number(),
    new_period_start: v.number(),
    new_period_end: v.number(),
    adjustment_pct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_SET_TARGETS);

    assertTargetPeriodWindow(args.source_period_start, args.source_period_end, {
      enforceFutureStart: false,
    });
    assertTargetPeriodWindow(args.new_period_start, args.new_period_end, {
      enforceFutureStart: true,
    });

    const adjustmentPct = args.adjustment_pct ?? 0;

    const sourceTargets = await ctx.db
      .query("ops_kpi_targets")
      .withIndex("by_period", (q) =>
        q.eq("period_start", args.source_period_start).eq("period_end", args.source_period_end),
      )
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    if (sourceTargets.length === 0) {
      return {
        created: 0,
        skipped: 0,
        errors: [] as string[],
      };
    }

    const sourcePeriodTypes = new Set(sourceTargets.map((target) => target.period_type));
    for (const periodType of sourcePeriodTypes) {
      assertTargetPeriodTypeAlignment(periodType, args.new_period_start, args.new_period_end);
    }

    const timestamp = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const sourceTarget of sourceTargets) {
      try {
        const adjustedTargetValue = roundTo2(sourceTarget.target_value * (1 + adjustmentPct / 100));

        if (adjustedTargetValue <= 0) {
          errors.push(
            `Skipped ${sourceTarget.metric} for ${sourceTarget.agent_user_id}: adjusted value must be greater than 0`,
          );
          continue;
        }

        const hasOverlap = await hasActiveTargetOverlap(ctx, {
          agent_user_id: sourceTarget.agent_user_id,
          metric: sourceTarget.metric,
          period_start: args.new_period_start,
          period_end: args.new_period_end,
        });

        if (hasOverlap) {
          skipped += 1;
          continue;
        }

        await ctx.db.insert("ops_kpi_targets", {
          agent_user_id: sourceTarget.agent_user_id,
          set_by_user_id: actor._id,
          metric: sourceTarget.metric,
          target_value: adjustedTargetValue,
          period_type: sourceTarget.period_type,
          period_start: args.new_period_start,
          period_end: args.new_period_end,
          status: "ACTIVE",
          notes: `Rolled forward from ${new Date(args.source_period_start).toISOString()} to ${new Date(args.source_period_end).toISOString()} (${adjustmentPct}% adjustment)`,
          created_at: timestamp,
          updated_at: timestamp,
          is_deleted: false,
        });
        created += 1;
      } catch (error) {
        errors.push(
          `Failed for source target ${sourceTarget._id}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    return {
      created,
      skipped,
      errors,
    };
  },
});

export const updateTarget = mutation({
  args: {
    target_id: v.id("ops_kpi_targets"),
    target_value: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_SET_TARGETS);

    const target = await ctx.db.get(args.target_id);
    if (!target || target.is_deleted) {
      throw new Error("Target not found");
    }
    if (target.status !== "ACTIVE") {
      throw new Error("Only active targets can be edited");
    }
    if (args.target_value !== undefined && args.target_value <= 0) {
      throw new Error("Target value must be greater than 0");
    }

    const patch: {
      target_value?: number;
      notes?: string;
      updated_at: number;
    } = {
      updated_at: Date.now(),
    };

    if (args.target_value !== undefined) {
      patch.target_value = args.target_value;
    }
    if (args.notes !== undefined) {
      patch.notes = args.notes;
    }

    await ctx.db.patch(args.target_id, patch);
    return args.target_id;
  },
});

export const cancelTarget = mutation({
  args: {
    target_id: v.id("ops_kpi_targets"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_SET_TARGETS);

    const target = await ctx.db.get(args.target_id);
    if (!target || target.is_deleted) {
      throw new Error("Target not found");
    }
    if (target.status !== "ACTIVE") {
      throw new Error("Only active targets can be cancelled");
    }

    await ctx.db.patch(args.target_id, {
      status: "CANCELLED",
      notes: args.reason ?? target.notes,
      updated_at: Date.now(),
    });

    return args.target_id;
  },
});

export const computeTargetActuals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const activeTargets = await ctx.db
      .query("ops_kpi_targets")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const actualValuesByTargetId = await precomputeTargetActualValues(ctx, activeTargets);

    let updatedCount = 0;
    let failedCount = 0;

    for (const target of activeTargets) {
      try {
        const direction = KPI_METRIC_DIRECTION[target.metric];
        const actualValue =
          actualValuesByTargetId.get(target._id.toString()) ??
          (await calculateMetricActualValue(ctx, target));
        const progressPct = roundTo1(
          computeTargetProgress(actualValue, target.target_value, direction),
        );

        const patch: {
          actual_value: number;
          progress_pct: number;
          updated_at: number;
          status?: Doc<"ops_kpi_targets">["status"];
        } = {
          actual_value: actualValue,
          progress_pct: progressPct,
          updated_at: now,
        };

        if (target.period_end <= now) {
          patch.status = resolveEndedTargetStatus(actualValue, target.target_value, direction);
        }

        await ctx.db.patch(target._id, patch);
        updatedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(
          `[computeTargetActuals] Failed for target ${target._id} (${target.metric}):`,
          error,
        );
      }
    }

    return {
      processed: activeTargets.length,
      updated: updatedCount,
      failed: failedCount,
      processed_at: now,
    };
  },
});

export const autoDetectWarnings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const [
      qualityThresholdConfig,
      targetMissStreakConfig,
      slaBreachCountConfig,
      inactivityDaysConfig,
      activeOpsUsers,
    ] = await Promise.all([
      ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.WARNING_QUALITY_THRESHOLD))
        .unique(),
      ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.WARNING_TARGET_MISS_STREAK))
        .unique(),
      ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.WARNING_SLA_BREACH_COUNT_30D))
        .unique(),
      ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.WARNING_INACTIVITY_DAYS))
        .unique(),
      listActiveOpsUsers(ctx),
    ]);

    const qualityThreshold = parseConfigNumber(
      qualityThresholdConfig?.value,
      DEFAULT_FIRE_WARNING_QUALITY_THRESHOLD,
    );
    const targetMissStreakThreshold = Math.max(
      1,
      Math.floor(
        parseConfigNumber(targetMissStreakConfig?.value, DEFAULT_WARNING_TARGET_MISS_STREAK),
      ),
    );
    const slaBreachThreshold = Math.max(
      1,
      Math.floor(
        parseConfigNumber(slaBreachCountConfig?.value, DEFAULT_WARNING_SLA_BREACH_COUNT_30D),
      ),
    );
    const inactivityDays = Math.max(
      1,
      Math.floor(parseConfigNumber(inactivityDaysConfig?.value, DEFAULT_WARNING_INACTIVITY_DAYS)),
    );

    let createdCount = 0;
    let failedCount = 0;

    for (const user of activeOpsUsers) {
      try {
        const [
          guardProfile,
          allPastTargets,
          recentLeadActivity,
          recentVisitActivity,
          staleSubmittedLeads,
          staleAssignedVisits,
        ] = await Promise.all([
          ctx.db
            .query("guard_profiles")
            .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
            .unique(),
          ctx.db
            .query("ops_kpi_targets")
            .withIndex("by_agent", (q) => q.eq("agent_user_id", user._id))
            .filter((q) =>
              q.and(q.neq(q.field("is_deleted"), true), q.lte(q.field("period_end"), now)),
            )
            .order("desc")
            .take(Math.max(1, targetMissStreakThreshold)),
          ctx.db
            .query("leads")
            .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", user._id))
            .filter((q) => q.gte(q.field("_creationTime"), now - inactivityDays * DAY_MS))
            .take(1),
          ctx.db
            .query("visits")
            .withIndex("by_guard_and_status", (q) =>
              q.eq("assigned_guard_id", user._id).eq("status", VISIT_STATUS.COMPLETED),
            )
            .filter((q) => q.gte(q.field("_creationTime"), now - inactivityDays * DAY_MS))
            .take(1),
          ctx.db
            .query("leads")
            .withIndex("by_guard_and_status", (q) =>
              q.eq("submitted_by_guard_id", user._id).eq("status", LEAD_STATUS.SUBMITTED),
            )
            .filter((q) => q.lt(q.field("_creationTime"), now - 3 * DAY_MS))
            .take(Math.max(1, slaBreachThreshold)),
          ctx.db
            .query("visits")
            .withIndex("by_guard_and_status", (q) =>
              q.eq("assigned_guard_id", user._id).eq("status", VISIT_STATUS.ASSIGNED),
            )
            .filter((q) => q.lt(q.field("_creationTime"), now - 5 * DAY_MS))
            .take(Math.max(1, slaBreachThreshold)),
        ]);

        const warningCandidates: Partial<Record<AutoWarningReason, string>> = {};

        const qualityScore = guardProfile?.quality_score;
        if (
          qualityScore !== undefined &&
          Number.isFinite(qualityScore) &&
          qualityScore < qualityThreshold
        ) {
          warningCandidates.LOW_QUALITY_SCORE = `Quality score ${roundTo2(qualityScore)} below threshold ${qualityThreshold}`;
        }

        const recentTargets = [...allPastTargets].sort((a, b) => b.period_end - a.period_end);
        const recentTargetWindow = recentTargets.slice(0, targetMissStreakThreshold);
        const missedRecentCount = recentTargetWindow.filter(
          (target) => target.status === "MISSED",
        ).length;
        if (
          recentTargetWindow.length >= targetMissStreakThreshold &&
          missedRecentCount >= targetMissStreakThreshold
        ) {
          warningCandidates.MISSED_TARGETS = `${missedRecentCount} recent target period${missedRecentCount === 1 ? "" : "s"} marked MISSED`;
        }

        if (recentLeadActivity.length === 0 && recentVisitActivity.length === 0) {
          warningCandidates.INACTIVITY = `No lead submissions or completed visits in the last ${inactivityDays} day${inactivityDays === 1 ? "" : "s"}`;
        }

        const staleCount = staleSubmittedLeads.length + staleAssignedVisits.length;
        if (staleCount >= slaBreachThreshold) {
          warningCandidates.SLA_BREACHES = `${staleCount} stale assignments (submitted leads >3d + assigned visits >5d)`;
        }

        const selectedReason = AUTO_WARNING_PRIORITY.find(
          (reason) => warningCandidates[reason] !== undefined,
        );

        if (!selectedReason) {
          continue;
        }

        const selectedDescription = warningCandidates[selectedReason];
        if (!selectedDescription) {
          continue;
        }

        const expiresAt = await resolveWarningExpiryAt(ctx, 1, now);

        const hasDuplicate = await hasActiveWarningDuplicate(ctx, {
          agent_user_id: user._id,
          warning_level: 1,
          trigger_reason: selectedReason,
        });

        if (hasDuplicate) {
          continue;
        }

        const warningId = await ctx.db.insert("ops_warnings", {
          agent_user_id: user._id,
          issued_by_type: "SYSTEM",
          warning_level: 1,
          trigger_type: "AUTO",
          trigger_reason: selectedReason,
          description: selectedDescription,
          status: "ACTIVE",
          expires_at: expiresAt,
          created_at: now,
          updated_at: now,
          is_deleted: false,
        });

        await enqueueNotificationEvent(ctx, {
          user_id: user._id,
          event_type: "ops_warning_issued",
          category: NOTIFICATION_CATEGORY.SYSTEM_ALERT,
          severity: getWarningNotificationSeverity(1),
          payload: {
            warning_id: `${warningId}`,
            warning_level: 1,
            trigger_reason: selectedReason,
            description: selectedDescription,
          },
          dedup_key: `ops_warning:${warningId}:issued`,
          action_url: "/ops/dashboard",
          log_context: "autoDetectWarnings",
        });

        createdCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(`[autoDetectWarnings] Failed for OPS user ${user._id}:`, error);
      }
    }

    return {
      processed: activeOpsUsers.length,
      created: createdCount,
      failed: failedCount,
      processed_at: now,
    };
  },
});

export const autoExpireWarnings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const [escalationAutoConfig, activeWarnings, acknowledgedWarnings] = await Promise.all([
      ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.WARNING_ESCALATION_AUTO))
        .unique(),
      ctx.db
        .query("ops_warnings")
        .withIndex("by_status_expires_at", (q) => q.eq("status", "ACTIVE"))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db
        .query("ops_warnings")
        .withIndex("by_status_expires_at", (q) => q.eq("status", "ACKNOWLEDGED"))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
    ]);

    const escalationAuto = parseConfigBoolean(
      escalationAutoConfig?.value,
      DEFAULT_WARNING_ESCALATION_AUTO,
    );

    const expirableWarnings = [...activeWarnings, ...acknowledgedWarnings].filter(
      (warning) => warning.expires_at !== undefined && warning.expires_at <= now,
    );

    let escalatedCount = 0;
    let expiredCount = 0;
    let failedCount = 0;

    for (const warning of expirableWarnings) {
      try {
        if (escalationAuto && warning.warning_level < 3) {
          const nextLevel = warning.warning_level + 1;
          if (!isValidWarningLevel(nextLevel)) {
            throw new Error("Escalation target level must be between 1 and 3");
          }

          const duplicateWarning = await findActiveWarningDuplicate(ctx, {
            agent_user_id: warning.agent_user_id,
            warning_level: nextLevel,
            trigger_reason: warning.trigger_reason,
          });

          if (duplicateWarning) {
            await ctx.db.patch(warning._id, {
              status: "ESCALATED",
              updated_at: now,
            });

            await enqueueNotificationEvent(ctx, {
              user_id: warning.agent_user_id,
              event_type: "ops_warning_escalated",
              category: NOTIFICATION_CATEGORY.SYSTEM_ALERT,
              severity: NOTIFICATION_SEVERITY.URGENT,
              payload: {
                warning_id: `${duplicateWarning._id}`,
                warning_level: nextLevel,
                trigger_reason: warning.trigger_reason,
                description: warning.description,
                escalated_from_id: `${warning._id}`,
              },
              dedup_key: `ops_warning:${warning._id}:escalated`,
              action_url: "/ops/dashboard",
              log_context: "autoExpireWarnings",
            });

            escalatedCount += 1;
            continue;
          }

          const escalatedExpiresAt = await resolveWarningExpiryAt(ctx, nextLevel, now);

          const escalatedWarningId = await ctx.db.insert("ops_warnings", {
            agent_user_id: warning.agent_user_id,
            issued_by_type: "SYSTEM",
            warning_level: nextLevel,
            trigger_type: "AUTO",
            trigger_reason: warning.trigger_reason,
            description: warning.description,
            evidence: warning.evidence,
            status: "ACTIVE",
            escalated_from_id: warning._id,
            expires_at: escalatedExpiresAt,
            created_at: now,
            updated_at: now,
            is_deleted: false,
          });

          await ctx.db.patch(warning._id, {
            status: "ESCALATED",
            updated_at: now,
          });

          await enqueueNotificationEvent(ctx, {
            user_id: warning.agent_user_id,
            event_type: "ops_warning_escalated",
            category: NOTIFICATION_CATEGORY.SYSTEM_ALERT,
            severity: NOTIFICATION_SEVERITY.URGENT,
            payload: {
              warning_id: `${escalatedWarningId}`,
              warning_level: nextLevel,
              trigger_reason: warning.trigger_reason,
              description: warning.description,
              escalated_from_id: `${warning._id}`,
            },
            dedup_key: `ops_warning:${escalatedWarningId}:escalated`,
            action_url: "/ops/dashboard",
            log_context: "autoExpireWarnings",
          });

          escalatedCount += 1;
        } else {
          await ctx.db.patch(warning._id, {
            status: "EXPIRED",
            updated_at: now,
          });
          expiredCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        console.error(`[autoExpireWarnings] Failed for warning ${warning._id}:`, error);
      }
    }

    return {
      processed: expirableWarnings.length,
      escalated: escalatedCount,
      expired: expiredCount,
      failed: failedCount,
      processed_at: now,
    };
  },
});

export const checkinOverdueNudge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const [activeOpsUsers, checkinConfig, activeAdminUsers] = await Promise.all([
      listActiveOpsUsers(ctx),
      ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CHECKIN_OVERDUE_DAYS))
        .unique(),
      ctx.db
        .query("users")
        .withIndex("by_type_and_status", (q) =>
          q.eq("user_type", USER_TYPE.ADMIN).eq("status", USER_STATUS.ACTIVE),
        )
        .collect(),
    ]);

    const checkinOverdueDays = Math.max(
      1,
      Math.floor(parseConfigNumber(checkinConfig?.value, DEFAULT_FIRE_CHECKIN_OVERDUE_DAYS)),
    );
    const checkinCutoff = now - checkinOverdueDays * DAY_MS;

    const latestCheckIns = await Promise.all(
      activeOpsUsers.map((user) =>
        ctx.db
          .query("ops_check_in_notes")
          .withIndex("by_agent", (q) => q.eq("agent_user_id", user._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .first(),
      ),
    );

    const reviewerIds = Array.from(
      new Set(
        latestCheckIns
          .map((checkIn) => checkIn?.reviewer_user_id)
          .filter((reviewerId): reviewerId is Id<"users"> => reviewerId !== undefined),
      ),
    );
    const reviewers = await Promise.all(reviewerIds.map((reviewerId) => ctx.db.get(reviewerId)));
    const reviewerById = new Map(
      reviewerIds.map((reviewerId, index) => [reviewerId, reviewers[index]]),
    );

    const overdueEntries: Array<{
      user: Doc<"users">;
      daysSinceLastCheckin: number;
      reviewer: Doc<"users"> | null;
      recipientIds: Array<Id<"users">>;
    }> = [];

    for (let index = 0; index < activeOpsUsers.length; index += 1) {
      const user = activeOpsUsers[index];
      const latestCheckIn = latestCheckIns[index];

      const isOverdue = latestCheckIn === null || latestCheckIn.created_at < checkinCutoff;
      if (!isOverdue) {
        continue;
      }

      const daysSinceLastCheckin =
        latestCheckIn === null
          ? Math.max(0, Math.floor((now - user._creationTime) / DAY_MS))
          : Math.max(0, Math.floor((now - latestCheckIn.created_at) / DAY_MS));

      const reviewer = latestCheckIn ? reviewerById.get(latestCheckIn.reviewer_user_id) : null;
      const recipientIds = new Set<Id<"users">>();

      if (reviewer && isActiveBackofficeUser(reviewer)) {
        recipientIds.add(reviewer._id);
      }

      if (recipientIds.size === 0) {
        for (const adminUser of activeAdminUsers) {
          recipientIds.add(adminUser._id);
        }
      }

      overdueEntries.push({
        user,
        daysSinceLastCheckin,
        reviewer: reviewer ?? null,
        recipientIds: Array.from(recipientIds),
      });
    }

    overdueEntries.sort((left, right) => right.daysSinceLastCheckin - left.daysSinceLastCheckin);

    const overdueCount = overdueEntries.length;
    let emittedEvents = 0;
    let skippedAgents = 0;

    for (let index = 0; index < overdueEntries.length; index += 1) {
      const overdueEntry = overdueEntries[index];
      const remainingCapacity = DEFAULT_CHECKIN_OVERDUE_NUDGE_EVENT_CAP - emittedEvents;
      if (remainingCapacity <= 0 || overdueEntry.recipientIds.length > remainingCapacity) {
        skippedAgents = overdueEntries.length - index;
        break;
      }

      for (const recipientId of overdueEntry.recipientIds) {
        await enqueueNotificationEvent(ctx, {
          user_id: recipientId,
          event_type: "ops_checkin_overdue_nudge",
          category: NOTIFICATION_CATEGORY.SYSTEM_ALERT,
          severity: NOTIFICATION_SEVERITY.IMPORTANT,
          payload: {
            agent_user_id: `${overdueEntry.user._id}`,
            agent_name: overdueEntry.user.name,
            checkin_overdue_days: checkinOverdueDays,
            days_since_last_checkin: overdueEntry.daysSinceLastCheckin,
            reviewer_user_id: overdueEntry.reviewer ? `${overdueEntry.reviewer._id}` : null,
          },
          dedup_key: `ops_checkin_overdue:${overdueEntry.user._id}:recipient:${recipientId}:day:${Math.floor(now / DAY_MS)}`,
          action_url: "/admin/ops-command-center",
          log_context: "checkinOverdueNudge",
        });
      }
      emittedEvents += overdueEntry.recipientIds.length;

      console.log("[checkinOverdueNudge] OPS check-in overdue", {
        user_id: `${overdueEntry.user._id}`,
        name: overdueEntry.user.name,
        phone: overdueEntry.user.phone ?? null,
        checkin_overdue_days: checkinOverdueDays,
        days_since_last_checkin: overdueEntry.daysSinceLastCheckin,
        notified_recipient_count: overdueEntry.recipientIds.length,
      });
    }

    if (skippedAgents > 0) {
      console.log(`Nudge cap reached: ${skippedAgents} agents skipped`);
    }

    return {
      processed: activeOpsUsers.length,
      overdue: overdueCount,
      checkin_overdue_days: checkinOverdueDays,
      processed_at: now,
    };
  },
});

export const listTargetsForAgent = query({
  args: {
    agent_user_id: v.id("users"),
    status_filter: v.optional(kpiTargetStatusValidator),
    period_type_filter: v.optional(kpiPeriodTypeValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const limit = Math.max(1, Math.floor(args.limit ?? 50));

    const [targets, agentUser] = await Promise.all([
      ctx.db
        .query("ops_kpi_targets")
        .withIndex("by_agent", (q) => q.eq("agent_user_id", args.agent_user_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db.get(args.agent_user_id),
    ]);

    const filteredTargets = targets
      .filter((target) => {
        if (args.status_filter && target.status !== args.status_filter) {
          return false;
        }
        if (args.period_type_filter && target.period_type !== args.period_type_filter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.period_start - a.period_start)
      .slice(0, limit);

    const agent = agentUser
      ? {
          user_id: agentUser._id,
          name: agentUser.name,
          phone: agentUser.phone ?? null,
        }
      : null;

    return filteredTargets.map((target) => ({
      ...target,
      agent,
    }));
  },
});

export const listAllTargets = query({
  args: {
    status_filter: v.optional(kpiTargetStatusValidator),
    metric_filter: v.optional(kpiMetricValidator),
    period_type_filter: v.optional(kpiPeriodTypeValidator),
    agent_user_id_filter: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const limit = Math.max(1, Math.floor(args.limit ?? 100));
    const initialFetchLimit = Math.min(TARGET_LIST_READ_CAP, Math.max(limit, 250));

    const statusFilter = args.status_filter;
    const initialTargets = statusFilter
      ? await ctx.db
          .query("ops_kpi_targets")
          .withIndex("by_status", (q) => q.eq("status", statusFilter))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .take(initialFetchLimit)
      : await ctx.db
          .query("ops_kpi_targets")
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .take(initialFetchLimit);

    const filteredTargets = initialTargets
      .filter((target) => {
        if (args.status_filter && target.status !== args.status_filter) {
          return false;
        }
        if (args.metric_filter && target.metric !== args.metric_filter) {
          return false;
        }
        if (args.period_type_filter && target.period_type !== args.period_type_filter) {
          return false;
        }
        if (args.agent_user_id_filter && target.agent_user_id !== args.agent_user_id_filter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.period_start - a.period_start)
      .slice(0, limit);

    const agentIds = Array.from(new Set(filteredTargets.map((target) => target.agent_user_id)));
    const agentUsers = await Promise.all(agentIds.map((agentId) => ctx.db.get(agentId)));
    const agentById = new Map(agentIds.map((agentId, index) => [agentId, agentUsers[index]]));

    return filteredTargets.map((target) => {
      const agentUser = agentById.get(target.agent_user_id) ?? null;

      return {
        ...target,
        agent: agentUser
          ? {
              user_id: agentUser._id,
              name: agentUser.name,
              phone: agentUser.phone ?? null,
            }
          : null,
      };
    });
  },
});

export const getTargetDetail = query({
  args: {
    target_id: v.id("ops_kpi_targets"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const target = await ctx.db.get(args.target_id);
    if (!target || target.is_deleted) {
      return null;
    }

    const [agentUser, setByUser] = await Promise.all([
      ctx.db.get(target.agent_user_id),
      ctx.db.get(target.set_by_user_id),
    ]);

    return {
      ...target,
      agent: agentUser
        ? {
            user_id: agentUser._id,
            name: agentUser.name,
            phone: agentUser.phone ?? null,
          }
        : null,
      set_by: setByUser
        ? {
            user_id: setByUser._id,
            name: setByUser.name,
            phone: setByUser.phone ?? null,
          }
        : null,
    };
  },
});

export const issueWarning = mutation({
  args: {
    agent_user_id: v.id("users"),
    warning_level: v.number(),
    trigger_type: warningTriggerTypeValidator,
    trigger_reason: warningTriggerReasonValidator,
    description: v.string(),
    evidence: v.optional(v.string()),
    expires_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_ISSUE_WARNINGS);

    if (!isValidWarningLevel(args.warning_level)) {
      throw new Error("Warning level must be 1, 2, or 3");
    }

    const agent = await ctx.db.get(args.agent_user_id);
    if (!agent || !isActiveOpsUser(agent)) {
      throw new Error("Warning agent must be an active OPS user");
    }

    const hasDuplicate = await hasActiveWarningDuplicate(ctx, {
      agent_user_id: args.agent_user_id,
      warning_level: args.warning_level,
      trigger_reason: args.trigger_reason,
    });

    if (hasDuplicate) {
      throw new Error("Active warning already exists at this level for this reason");
    }

    const now = Date.now();
    const expiresAt =
      args.expires_at ?? (await resolveWarningExpiryAt(ctx, args.warning_level, now));

    const warningId = await ctx.db.insert("ops_warnings", {
      agent_user_id: args.agent_user_id,
      issued_by_user_id: actor._id,
      issued_by_type: "USER",
      warning_level: args.warning_level,
      trigger_type: args.trigger_type,
      trigger_reason: args.trigger_reason,
      description: args.description,
      evidence: args.evidence,
      status: "ACTIVE",
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });

    await enqueueNotificationEvent(ctx, {
      user_id: args.agent_user_id,
      event_type: "ops_warning_issued",
      category: NOTIFICATION_CATEGORY.SYSTEM_ALERT,
      severity: getWarningNotificationSeverity(args.warning_level),
      payload: {
        warning_id: `${warningId}`,
        warning_level: args.warning_level,
        trigger_reason: args.trigger_reason,
        description: args.description,
      },
      dedup_key: `ops_warning:${warningId}:issued`,
      action_url: "/ops/dashboard",
      log_context: "issueWarning",
    });

    return warningId;
  },
});

export const acknowledgeWarning = mutation({
  args: {
    warning_id: v.id("ops_warnings"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const warning = await ctx.db.get(args.warning_id);
    if (!warning || warning.is_deleted) {
      throw new Error("Warning not found");
    }

    let canSelfAcknowledge = false;
    try {
      const { user } = await requireFieldWorker(ctx);
      canSelfAcknowledge = user._id === warning.agent_user_id;
    } catch {
      canSelfAcknowledge = false;
    }

    if (!canSelfAcknowledge) {
      await requireBackoffice(ctx);
      await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_ISSUE_WARNINGS);
    }

    if (!canTransitionWarning(warning.status, "ACKNOWLEDGED")) {
      throw new Error(`Cannot acknowledge warning from status ${warning.status}`);
    }

    const now = Date.now();
    await ctx.db.patch(args.warning_id, {
      status: "ACKNOWLEDGED",
      acknowledged_at: now,
      updated_at: now,
    });

    return args.warning_id;
  },
});

export const resolveWarning = mutation({
  args: {
    warning_id: v.id("ops_warnings"),
    resolution_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_ISSUE_WARNINGS);

    const warning = await ctx.db.get(args.warning_id);
    if (!warning || warning.is_deleted) {
      throw new Error("Warning not found");
    }

    if (!canTransitionWarning(warning.status, "RESOLVED")) {
      throw new Error(`Cannot resolve warning from status ${warning.status}`);
    }

    const now = Date.now();
    await ctx.db.patch(args.warning_id, {
      status: "RESOLVED",
      resolved_at: now,
      resolution_notes: args.resolution_notes,
      updated_at: now,
    });

    await enqueueNotificationEvent(ctx, {
      user_id: warning.agent_user_id,
      event_type: "ops_warning_resolved",
      category: NOTIFICATION_CATEGORY.SYSTEM_ALERT,
      severity: NOTIFICATION_SEVERITY.NORMAL,
      payload: {
        warning_id: `${warning._id}`,
        warning_level: warning.warning_level,
        trigger_reason: warning.trigger_reason,
        resolution_notes: args.resolution_notes ?? null,
      },
      dedup_key: `ops_warning:${warning._id}:resolved`,
      action_url: "/ops/dashboard",
      log_context: "resolveWarning",
    });

    return args.warning_id;
  },
});

export const escalateWarning = mutation({
  args: {
    warning_id: v.id("ops_warnings"),
    description: v.optional(v.string()),
    evidence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_ISSUE_WARNINGS);

    const warning = await ctx.db.get(args.warning_id);
    if (!warning || warning.is_deleted) {
      throw new Error("Warning not found");
    }

    if (!canTransitionWarning(warning.status, "ESCALATED")) {
      throw new Error(`Cannot escalate warning from status ${warning.status}`);
    }

    if (warning.warning_level >= 3) {
      throw new Error("Cannot escalate warning beyond level 3");
    }

    const nextLevel = warning.warning_level + 1;
    if (!isValidWarningLevel(nextLevel)) {
      throw new Error("Escalation target level must be between 1 and 3");
    }

    const hasDuplicate = await hasActiveWarningDuplicate(ctx, {
      agent_user_id: warning.agent_user_id,
      warning_level: nextLevel,
      trigger_reason: warning.trigger_reason,
    });

    if (hasDuplicate) {
      throw new Error("Active warning already exists at this level for this reason");
    }

    const now = Date.now();
    const escalatedExpiresAt = await resolveWarningExpiryAt(ctx, nextLevel, now);

    const newWarningId = await ctx.db.insert("ops_warnings", {
      agent_user_id: warning.agent_user_id,
      issued_by_user_id: actor._id,
      issued_by_type: "USER",
      warning_level: nextLevel,
      trigger_type: warning.trigger_type,
      trigger_reason: warning.trigger_reason,
      description: args.description ?? warning.description,
      evidence: args.evidence ?? warning.evidence,
      status: "ACTIVE",
      escalated_from_id: warning._id,
      expires_at: escalatedExpiresAt,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });

    await ctx.db.patch(args.warning_id, {
      status: "ESCALATED",
      updated_at: now,
    });

    await enqueueNotificationEvent(ctx, {
      user_id: warning.agent_user_id,
      event_type: "ops_warning_escalated",
      category: NOTIFICATION_CATEGORY.SYSTEM_ALERT,
      severity: NOTIFICATION_SEVERITY.URGENT,
      payload: {
        warning_id: `${newWarningId}`,
        warning_level: nextLevel,
        trigger_reason: warning.trigger_reason,
        description: args.description ?? warning.description,
        escalated_from_id: `${warning._id}`,
      },
      dedup_key: `ops_warning:${newWarningId}:escalated`,
      action_url: "/ops/dashboard",
      log_context: "escalateWarning",
    });

    return newWarningId;
  },
});

export const listWarningsForAgent = query({
  args: {
    agent_user_id: v.id("users"),
    status_filter: v.optional(warningStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const limit = Math.max(1, Math.floor(args.limit ?? 50));

    const warnings = args.status_filter
      ? await ctx.db
          .query("ops_warnings")
          .withIndex("by_agent", (q) =>
            q.eq("agent_user_id", args.agent_user_id).eq("status", args.status_filter!),
          )
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .collect()
      : await ctx.db
          .query("ops_warnings")
          .withIndex("by_agent", (q) => q.eq("agent_user_id", args.agent_user_id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .collect();

    const sortedWarnings = warnings.sort((a, b) => b.created_at - a.created_at).slice(0, limit);

    const parentIds = Array.from(
      new Set(
        sortedWarnings
          .map((warning) => warning.escalated_from_id)
          .filter((warningId): warningId is Id<"ops_warnings"> => warningId !== undefined),
      ),
    );

    const parentWarnings = await Promise.all(parentIds.map((warningId) => ctx.db.get(warningId)));
    const parentById = new Map(
      parentIds.map((warningId, index) => [warningId, parentWarnings[index]]),
    );

    return sortedWarnings.map((warning) => {
      const parentWarning = warning.escalated_from_id
        ? (parentById.get(warning.escalated_from_id) ?? null)
        : null;

      return {
        ...warning,
        escalated_from:
          parentWarning && !parentWarning.is_deleted
            ? {
                warning_id: parentWarning._id,
                warning_level: parentWarning.warning_level,
                status: parentWarning.status,
              }
            : null,
      };
    });
  },
});

export const getActiveWarnings = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const activeWarnings = await ctx.db
      .query("ops_warnings")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const agentIds = Array.from(new Set(activeWarnings.map((warning) => warning.agent_user_id)));
    const agentUsers = await Promise.all(agentIds.map((agentId) => ctx.db.get(agentId)));
    const agentById = new Map(agentIds.map((agentId, index) => [agentId, agentUsers[index]]));

    return activeWarnings
      .sort((a, b) => {
        if (b.warning_level !== a.warning_level) {
          return b.warning_level - a.warning_level;
        }

        return b.created_at - a.created_at;
      })
      .map((warning) => ({
        ...warning,
        agent_name: agentById.get(warning.agent_user_id)?.name ?? null,
      }));
  },
});

export const getWarningSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const activeWarnings = await ctx.db
      .query("ops_warnings")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .take(WARNING_SUMMARY_READ_CAP);
    const byReason: Record<string, number> = {};

    for (const warning of activeWarnings) {
      byReason[warning.trigger_reason] = (byReason[warning.trigger_reason] ?? 0) + 1;
    }

    const activeAgentCount = new Set(
      activeWarnings.map((warning) => warning.agent_user_id.toString()),
    ).size;

    return {
      total_active: activeWarnings.length,
      by_level: {
        level1: activeWarnings.filter((warning) => warning.warning_level === 1).length,
        level2: activeWarnings.filter((warning) => warning.warning_level === 2).length,
        level3: activeWarnings.filter((warning) => warning.warning_level >= 3).length,
      },
      by_reason: byReason,
      agents_with_active_warnings: activeAgentCount,
    };
  },
});

export const getMyWarnings = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireFieldWorker(ctx);

    const warnings = await ctx.db
      .query("ops_warnings")
      .withIndex("by_agent", (q) => q.eq("agent_user_id", user._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return warnings.sort((a, b) => b.created_at - a.created_at);
  },
});

export const createCheckIn = mutation({
  args: {
    agent_user_id: v.id("users"),
    notes: v.string(),
    action_items: v.array(checkInActionItemInputValidator),
    sentiment: v.optional(checkInSentimentValidator),
    next_review_date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reviewer = await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_WRITE_CHECKINS);

    const agent = await ctx.db.get(args.agent_user_id);
    if (!agent || !isActiveOpsUser(agent)) {
      throw new Error("Check-in agent must be an active OPS user");
    }

    const now = Date.now();
    const notes = sanitizeCheckInNotes(args.notes);
    const actionItems = sanitizeCheckInActionItems(args.action_items);

    return await ctx.db.insert("ops_check_in_notes", {
      agent_user_id: args.agent_user_id,
      reviewer_user_id: reviewer._id,
      notes,
      action_items: actionItems,
      sentiment: args.sentiment,
      next_review_date: args.next_review_date,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
  },
});

export const updateCheckIn = mutation({
  args: {
    check_in_id: v.id("ops_check_in_notes"),
    notes: v.optional(v.string()),
    action_items: v.optional(v.array(checkInActionItemInputValidator)),
    sentiment: v.optional(checkInSentimentValidator),
    next_review_date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_WRITE_CHECKINS);

    const checkIn = await ctx.db.get(args.check_in_id);
    if (!checkIn || checkIn.is_deleted) {
      throw new Error("Check-in not found");
    }

    const now = Date.now();
    if (now - checkIn.created_at >= DAY_MS) {
      throw new Error("Check-in can only be edited within 24 hours");
    }

    const patch: {
      notes?: string;
      action_items?: Array<CheckInActionItem>;
      sentiment?: Doc<"ops_check_in_notes">["sentiment"];
      next_review_date?: number;
      updated_at: number;
    } = {
      updated_at: now,
    };

    if (args.notes !== undefined) {
      patch.notes = sanitizeCheckInNotes(args.notes);
    }

    if (args.action_items !== undefined) {
      patch.action_items = sanitizeCheckInActionItems(args.action_items);
    }

    if (args.sentiment !== undefined) {
      patch.sentiment = args.sentiment;
    }

    if (args.next_review_date !== undefined) {
      patch.next_review_date = args.next_review_date;
    }

    await ctx.db.patch(args.check_in_id, patch);
    return args.check_in_id;
  },
});

export const toggleActionItem = mutation({
  args: {
    check_in_id: v.id("ops_check_in_notes"),
    item_index: v.number(),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_WRITE_CHECKINS);

    const checkIn = await ctx.db.get(args.check_in_id);
    if (!checkIn || checkIn.is_deleted) {
      throw new Error("Check-in not found");
    }

    if (
      !Number.isInteger(args.item_index) ||
      args.item_index < 0 ||
      args.item_index >= checkIn.action_items.length
    ) {
      throw new Error("Invalid action item index");
    }

    const now = Date.now();
    const nextActionItems = [...checkIn.action_items];
    const item = nextActionItems[args.item_index];
    const willComplete = !item.completed;

    nextActionItems[args.item_index] = {
      ...item,
      completed: willComplete,
      completed_at: willComplete ? now : undefined,
    };

    await ctx.db.patch(args.check_in_id, {
      action_items: nextActionItems,
      updated_at: now,
    });

    return args.check_in_id;
  },
});

export const listCheckInsForAgent = query({
  args: {
    agent_user_id: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const limit = Math.max(1, Math.floor(args.limit ?? 20));
    const checkIns = await ctx.db
      .query("ops_check_in_notes")
      .withIndex("by_agent", (q) => q.eq("agent_user_id", args.agent_user_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .take(limit);

    const reviewerIds = Array.from(new Set(checkIns.map((checkIn) => checkIn.reviewer_user_id)));
    const reviewers = await Promise.all(reviewerIds.map((reviewerId) => ctx.db.get(reviewerId)));
    const reviewerById = new Map(
      reviewerIds.map((reviewerId, index) => [reviewerId, reviewers[index]]),
    );

    return checkIns.map((checkIn) => {
      const reviewer = reviewerById.get(checkIn.reviewer_user_id) ?? null;

      return {
        ...checkIn,
        reviewer: reviewer
          ? {
              user_id: reviewer._id,
              name: reviewer.name,
              phone: reviewer.phone ?? null,
            }
          : null,
      };
    });
  },
});

export const getLatestCheckIn = query({
  args: {
    agent_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const latestCheckIn = await ctx.db
      .query("ops_check_in_notes")
      .withIndex("by_agent", (q) => q.eq("agent_user_id", args.agent_user_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .first();

    if (!latestCheckIn) {
      return null;
    }

    const reviewer = await ctx.db.get(latestCheckIn.reviewer_user_id);

    return {
      ...latestCheckIn,
      reviewer: reviewer
        ? {
            user_id: reviewer._id,
            name: reviewer.name,
            phone: reviewer.phone ?? null,
          }
        : null,
    };
  },
});

type PreCheckInCountMetric = {
  leads_submitted: number;
  leads_verified: number;
  visits_completed: number;
  closures_confirmed: number;
};

type PreCheckInOpenCommitment = {
  description: string;
  due_date: number | null;
};

type PreCheckInTargetProgress = {
  metric: OpsKpiMetric;
  target_value: number;
  actual_value: number | null;
  progress_pct: number | null;
};

type PreCheckInWarning = {
  level: number;
  reason: Doc<"ops_warnings">["trigger_reason"];
  description: string;
  created_at: number;
};

type PreCheckInBrief = {
  performance_delta: {
    current_7d: PreCheckInCountMetric;
    previous_7d: PreCheckInCountMetric;
    delta: PreCheckInCountMetric;
  };
  open_commitments: Array<PreCheckInOpenCommitment>;
  target_progress: Array<PreCheckInTargetProgress>;
  active_warnings: Array<PreCheckInWarning>;
  pipeline_snapshot: {
    active_leads: number;
    active_visits: number;
    active_negotiations: number;
  };
  quality_score: number | null;
};

type OpenActionItem = {
  agent_user_id: Id<"users">;
  agent_name: string;
  description: string;
  due_date: number | null;
  check_in_created_at: number;
  check_in_id: Id<"ops_check_in_notes">;
  overdue: boolean;
};

type OpenActionItemsGroup = {
  agent_user_id: Id<"users">;
  agent_name: string;
  overdue_count: number;
  items: Array<OpenActionItem>;
};

type OpenActionItemsResult = {
  total_open_items: number;
  groups: Array<OpenActionItemsGroup>;
};

export const getPreCheckInBrief = query({
  args: {
    agent_user_id: v.id("users"),
  },
  handler: async (ctx, args): Promise<PreCheckInBrief> => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const now = Date.now();
    const currentWindowStart = now - 7 * DAY_MS;
    const previousWindowStart = now - 14 * DAY_MS;
    const previousWindowEnd = currentWindowStart;
    const agentUserId = args.agent_user_id.toString();

    const [
      agentLeads,
      agentVisits,
      agentNegotiations,
      leadStatusUpdates,
      activeTargets,
      activeWarnings,
      latestCheckIn,
    ] = await Promise.all([
      ctx.db
        .query("leads")
        .withIndex("by_submitted_by_guard_id", (q) =>
          q.eq("submitted_by_guard_id", args.agent_user_id),
        )
        .collect(),
      ctx.db
        .query("visits")
        .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", args.agent_user_id))
        .collect(),
      ctx.db
        .query("negotiations")
        .withIndex("by_initiated_by_admin_id", (q) =>
          q.eq("initiated_by_admin_id", args.agent_user_id),
        )
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db
        .query("audit_logs")
        .withIndex("by_action", (q) => q.eq("action", "LEADS_UPDATE"))
        .filter((q) =>
          q.and(
            q.eq(q.field("entity_type"), "leads"),
            q.gte(q.field("_creationTime"), previousWindowStart),
            q.lt(q.field("_creationTime"), now),
          ),
        )
        .collect(),
      ctx.db
        .query("ops_kpi_targets")
        .withIndex("by_agent", (q) => q.eq("agent_user_id", args.agent_user_id))
        .filter((q) => q.and(q.eq(q.field("status"), "ACTIVE"), q.neq(q.field("is_deleted"), true)))
        .collect(),
      ctx.db
        .query("ops_warnings")
        .withIndex("by_agent", (q) =>
          q.eq("agent_user_id", args.agent_user_id).eq("status", "ACTIVE"),
        )
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db
        .query("ops_check_in_notes")
        .withIndex("by_agent", (q) => q.eq("agent_user_id", args.agent_user_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .order("desc")
        .first(),
    ]);

    const leadIds = new Set(agentLeads.map((lead) => lead._id.toString()));
    const confirmedClosures = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
      .collect();

    const countMetricWindow = (windowStart: number, windowEnd: number): PreCheckInCountMetric => ({
      leads_submitted: agentLeads.filter((lead) =>
        isInWindow(lead._creationTime, windowStart, windowEnd),
      ).length,
      leads_verified: leadStatusUpdates.filter((log) => {
        if (log.actor_user_id?.toString() !== agentUserId) {
          return false;
        }

        if (!isInWindow(log._creationTime, windowStart, windowEnd)) {
          return false;
        }

        return didLeadTransitionToVerified(log.changes);
      }).length,
      visits_completed: agentVisits.filter((visit) => {
        if (visit.status !== VISIT_STATUS.COMPLETED && visit.outcome === undefined) {
          return false;
        }

        return isInWindow(visit.completed_at ?? visit._creationTime, windowStart, windowEnd);
      }).length,
      closures_confirmed: confirmedClosures.filter(
        (closure) =>
          leadIds.has(closure.lead_id.toString()) &&
          isInWindow(closure.confirmed_at, windowStart, windowEnd),
      ).length,
    });

    const currentMetrics = countMetricWindow(currentWindowStart, now);
    const previousMetrics = countMetricWindow(previousWindowStart, previousWindowEnd);

    const openCommitments = (latestCheckIn?.action_items ?? [])
      .filter((item) => !item.completed)
      .map((item) => ({
        description: item.description,
        due_date: item.due_date ?? null,
      }));

    const targetProgress = [...activeTargets]
      .sort((a, b) => a.metric.localeCompare(b.metric))
      .map((target) => ({
        metric: target.metric,
        target_value: target.target_value,
        actual_value: target.actual_value ?? null,
        progress_pct: target.progress_pct ?? null,
      }));

    const warnings = [...activeWarnings]
      .sort((a, b) => {
        if (b.warning_level !== a.warning_level) {
          return b.warning_level - a.warning_level;
        }
        return b.created_at - a.created_at;
      })
      .map((warning) => ({
        level: warning.warning_level,
        reason: warning.trigger_reason,
        description: warning.description,
        created_at: warning.created_at,
      }));

    const qualityProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.agent_user_id))
      .unique();

    return {
      performance_delta: {
        current_7d: currentMetrics,
        previous_7d: previousMetrics,
        delta: {
          leads_submitted: currentMetrics.leads_submitted - previousMetrics.leads_submitted,
          leads_verified: currentMetrics.leads_verified - previousMetrics.leads_verified,
          visits_completed: currentMetrics.visits_completed - previousMetrics.visits_completed,
          closures_confirmed:
            currentMetrics.closures_confirmed - previousMetrics.closures_confirmed,
        },
      },
      open_commitments: openCommitments,
      target_progress: targetProgress,
      active_warnings: warnings,
      pipeline_snapshot: {
        active_leads: agentLeads.filter(
          (lead) => lead.status === LEAD_STATUS.SUBMITTED || lead.status === LEAD_STATUS.NEED_INFO,
        ).length,
        active_visits: agentVisits.filter(
          (visit) =>
            visit.status === VISIT_STATUS.ASSIGNED || visit.status === VISIT_STATUS.CONFIRMED,
        ).length,
        active_negotiations: agentNegotiations.filter((negotiation) =>
          ACTIVE_NEGOTIATION_CASELOAD_STATUSES.includes(negotiation.status),
        ).length,
      },
      quality_score: qualityProfile?.quality_score ?? null,
    };
  },
});

export const getOpenActionItems = query({
  args: {},
  handler: async (ctx): Promise<OpenActionItemsResult> => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const now = Date.now();
    const ninetyDaysAgo = now - 90 * DAY_MS;
    const recentCheckIns = await ctx.db
      .query("ops_check_in_notes")
      .filter((q) =>
        q.and(q.neq(q.field("is_deleted"), true), q.gte(q.field("created_at"), ninetyDaysAgo)),
      )
      .order("desc")
      .take(OPEN_ACTION_ITEMS_READ_CAP);

    const agentIds = Array.from(new Set(recentCheckIns.map((checkIn) => checkIn.agent_user_id)));
    const agents = await Promise.all(agentIds.map((agentId) => ctx.db.get(agentId)));
    const agentNameById = new Map<Id<"users">, string>(
      agentIds.map((agentId, index) => [agentId, agents[index]?.name ?? "Unknown agent"]),
    );

    const openItems: Array<OpenActionItem> = [];
    for (const checkIn of recentCheckIns) {
      const agentName = agentNameById.get(checkIn.agent_user_id) ?? "Unknown agent";
      for (const item of checkIn.action_items) {
        if (item.completed) {
          continue;
        }

        const dueDate = item.due_date ?? null;
        openItems.push({
          agent_user_id: checkIn.agent_user_id,
          agent_name: agentName,
          description: item.description,
          due_date: dueDate,
          check_in_created_at: checkIn.created_at,
          check_in_id: checkIn._id,
          overdue: dueDate !== null && dueDate < now,
        });
      }
    }

    openItems.sort((a, b) => {
      if (a.overdue !== b.overdue) {
        return a.overdue ? -1 : 1;
      }

      const aDue = a.due_date ?? Number.MAX_SAFE_INTEGER;
      const bDue = b.due_date ?? Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) {
        return aDue - bDue;
      }

      return b.check_in_created_at - a.check_in_created_at;
    });

    const groupsMap = new Map<string, OpenActionItemsGroup>();
    for (const item of openItems) {
      const userKey = item.agent_user_id.toString();
      const existing = groupsMap.get(userKey);
      if (existing) {
        existing.items.push(item);
        if (item.overdue) {
          existing.overdue_count += 1;
        }
      } else {
        groupsMap.set(userKey, {
          agent_user_id: item.agent_user_id,
          agent_name: item.agent_name,
          overdue_count: item.overdue ? 1 : 0,
          items: [item],
        });
      }
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (b.overdue_count !== a.overdue_count) {
        return b.overdue_count - a.overdue_count;
      }

      return a.agent_name.localeCompare(b.agent_name);
    });

    return {
      total_open_items: openItems.length,
      groups,
    };
  },
});

export const getReviewCompliance = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const now = Date.now();

    const [activeOpsUsers, checkinConfig] = await Promise.all([
      listActiveOpsUsers(ctx),
      ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CHECKIN_OVERDUE_DAYS))
        .unique(),
    ]);

    const checkinOverdueDays = Math.max(
      1,
      Math.floor(parseConfigNumber(checkinConfig?.value, DEFAULT_FIRE_CHECKIN_OVERDUE_DAYS)),
    );
    const checkinCutoff = now - checkinOverdueDays * DAY_MS;

    const latestCheckIns = await Promise.all(
      activeOpsUsers.map((user) =>
        ctx.db
          .query("ops_check_in_notes")
          .withIndex("by_agent", (q) => q.eq("agent_user_id", user._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .first(),
      ),
    );

    let reviewedCount = 0;
    const overdueAgents: Array<{
      user_id: Id<"users">;
      name: string;
      phone: string | null;
      days_since_last_checkin: number | null;
    }> = [];

    for (let index = 0; index < activeOpsUsers.length; index += 1) {
      const user = activeOpsUsers[index];
      const latestCheckIn = latestCheckIns[index];

      if (latestCheckIn !== null && latestCheckIn.created_at >= checkinCutoff) {
        reviewedCount += 1;
        continue;
      }

      overdueAgents.push({
        user_id: user._id,
        name: user.name,
        phone: user.phone ?? null,
        days_since_last_checkin:
          latestCheckIn === null
            ? null
            : Math.max(0, Math.floor((now - latestCheckIn.created_at) / DAY_MS)),
      });
    }

    const totalAgents = activeOpsUsers.length;
    const overdueCount = overdueAgents.length;
    const compliancePct = totalAgents === 0 ? 0 : roundTo2((reviewedCount / totalAgents) * 100);

    return {
      total_agents: totalAgents,
      reviewed_count: reviewedCount,
      overdue_count: overdueCount,
      compliance_pct: compliancePct,
      overdue_agents: overdueAgents.sort((a, b) => {
        if (a.days_since_last_checkin === null) {
          return -1;
        }
        if (b.days_since_last_checkin === null) {
          return 1;
        }
        return b.days_since_last_checkin - a.days_since_last_checkin;
      }),
    };
  },
});

export const getMyCheckIns = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireFieldWorker(ctx);

    return await ctx.db
      .query("ops_check_in_notes")
      .withIndex("by_agent", (q) => q.eq("agent_user_id", user._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .collect();
  },
});

export const getCelebrations = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const now = Date.now();
    const sevenDaysAgo = now - DAY_MS * 7;

    const [allConfirmedClosures, exceededTargets, activeOpsUsers] = await Promise.all([
      ctx.db
        .query("closures")
        .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
        .collect(),
      ctx.db
        .query("ops_kpi_targets")
        .withIndex("by_status", (q) => q.eq("status", "EXCEEDED"))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      listActiveOpsUsers(ctx),
    ]);

    const recentClosures = allConfirmedClosures.filter(
      (closure) => closure.confirmed_at !== undefined && closure.confirmed_at >= sevenDaysAgo,
    );
    const recentExceededTargets = exceededTargets.filter(
      (target) => target.updated_at >= sevenDaysAgo,
    );

    const closureItems = (
      await Promise.all(
        recentClosures.map(async (closure): Promise<CelebrationItem | null> => {
          const lead = await ctx.db.get(closure.lead_id);
          if (!lead) {
            return null;
          }

          const agentUser = await ctx.db.get(lead.submitted_by_guard_id);
          if (!agentUser) {
            return null;
          }

          return {
            id: `closure:${closure._id}`,
            type: "closure",
            agent_name: agentUser.name,
            agent_user_id: `${agentUser._id}`,
            description: `confirmed a closure for Flat ${lead.flat_number}`,
            timestamp: closure.confirmed_at ?? closure._creationTime,
            link_href: `/admin/closures/${closure._id}`,
          };
        }),
      )
    ).filter((item): item is CelebrationItem => item !== null);

    const targetItems = (
      await Promise.all(
        recentExceededTargets.map(async (target): Promise<CelebrationItem | null> => {
          const agentUser = await ctx.db.get(target.agent_user_id);
          if (!agentUser) {
            return null;
          }

          const metricLabel = OPS_KPI_METRIC_LABELS[target.metric] ?? target.metric;
          const actualValue = target.actual_value ?? 0;

          return {
            id: `target:${target._id}`,
            type: "target_exceeded",
            agent_name: agentUser.name,
            agent_user_id: `${agentUser._id}`,
            description: `exceeded ${metricLabel} target (${actualValue}/${target.target_value})`,
            timestamp: target.updated_at,
            link_href: "/admin/ops-command-center?view=ops_head",
          };
        }),
      )
    ).filter((item): item is CelebrationItem => item !== null);

    const qualityItems = (
      await Promise.all(
        activeOpsUsers.map(async (user): Promise<CelebrationItem | null> => {
          const profile = await ctx.db
            .query("guard_profiles")
            .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
            .unique();

          if (!profile || profile.quality_score === undefined || profile.quality_score <= 80) {
            return null;
          }

          return {
            id: `quality:${user._id}`,
            type: "quality_high",
            agent_name: user.name,
            agent_user_id: `${user._id}`,
            description: `maintains high quality at ${roundTo2(profile.quality_score)} points`,
            timestamp: now,
            link_href: "/admin/ops-command-center?view=ops_head",
          };
        }),
      )
    ).filter((item): item is CelebrationItem => item !== null);

    return [...closureItems, ...targetItems, ...qualityItems]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
  },
});

export const getStagnantPipeline = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const now = Date.now();
    const staleLeadSubmittedCutoff = now - 3 * DAY_MS;
    const staleLeadNeedInfoCutoff = now - 7 * DAY_MS;
    const staleVisitCutoff = now - 5 * DAY_MS;
    const staleNegotiationCutoff = now - 14 * DAY_MS;

    const [staleSubmittedLeads, staleNeedInfoLeads, staleAssignedVisits, staleConfirmedVisits] =
      await Promise.all([
        ctx.db
          .query("leads")
          .withIndex("by_status", (q) => q.eq("status", LEAD_STATUS.SUBMITTED))
          .filter((q) => q.lt(q.field("_creationTime"), staleLeadSubmittedCutoff))
          .take(20),
        ctx.db
          .query("leads")
          .withIndex("by_status", (q) => q.eq("status", LEAD_STATUS.NEED_INFO))
          .filter((q) => q.lt(q.field("_creationTime"), staleLeadNeedInfoCutoff))
          .take(20),
        ctx.db
          .query("visits")
          .withIndex("by_status", (q) => q.eq("status", VISIT_STATUS.ASSIGNED))
          .filter((q) => q.lt(q.field("_creationTime"), staleVisitCutoff))
          .take(20),
        ctx.db
          .query("visits")
          .withIndex("by_status", (q) => q.eq("status", VISIT_STATUS.CONFIRMED))
          .filter((q) => q.lt(q.field("_creationTime"), staleVisitCutoff))
          .take(20),
      ]);

    const staleNegotiationGroups = await Promise.all(
      ACTIVE_NEGOTIATION_CASELOAD_STATUSES.map((status) =>
        ctx.db
          .query("negotiations")
          .withIndex("by_status_last_activity", (q) =>
            q.eq("status", status).lt("last_activity_at", staleNegotiationCutoff),
          )
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .take(20),
      ),
    );

    const staleLeads = [...staleSubmittedLeads, ...staleNeedInfoLeads];
    const staleVisits = [...staleAssignedVisits, ...staleConfirmedVisits];
    const staleNegotiations = staleNegotiationGroups.flat();

    const leadAgentIds = new Set<Doc<"users">["_id"]>(
      staleLeads.map((lead) => lead.submitted_by_guard_id),
    );
    const leadSocietyIds = new Set<Doc<"societies">["_id"]>(
      staleLeads.map((lead) => lead.society_id),
    );
    const visitAgentIds = new Set<Doc<"users">["_id"]>(
      staleVisits.map((visit) => visit.assigned_guard_id),
    );
    const visitListingIds = new Set<Doc<"listings">["_id"]>();
    for (const visit of staleVisits) {
      if (visit.listing_id !== undefined) {
        visitListingIds.add(visit.listing_id);
      }
    }
    const visitLeadIds = new Set<Doc<"leads">["_id"]>(staleVisits.map((visit) => visit.lead_id));
    const negotiationAgentIds = new Set<Doc<"users">["_id"]>(
      staleNegotiations.map((negotiation) => negotiation.initiated_by_admin_id),
    );
    const negotiationListingIds = new Set<Doc<"listings">["_id"]>();
    for (const negotiation of staleNegotiations) {
      if (negotiation.listing_id !== undefined) {
        negotiationListingIds.add(negotiation.listing_id);
      }
    }

    const leadAgentUsersPromise: Promise<Array<Doc<"users"> | null>> = Promise.all(
      Array.from(leadAgentIds, (id) => ctx.db.get(id)),
    );
    const leadSocietiesPromise: Promise<Array<Doc<"societies"> | null>> = Promise.all(
      Array.from(leadSocietyIds, (id) => ctx.db.get(id)),
    );
    const visitAgentUsersPromise: Promise<Array<Doc<"users"> | null>> = Promise.all(
      Array.from(visitAgentIds, (id) => ctx.db.get(id)),
    );
    const visitListingsPromise: Promise<Array<Doc<"listings"> | null>> = Promise.all(
      Array.from(visitListingIds, (id) => ctx.db.get(id)),
    );
    const visitLeadsPromise: Promise<Array<Doc<"leads"> | null>> = Promise.all(
      Array.from(visitLeadIds, (id) => ctx.db.get(id)),
    );
    const negotiationAgentUsersPromise: Promise<Array<Doc<"users"> | null>> = Promise.all(
      Array.from(negotiationAgentIds, (id) => ctx.db.get(id)),
    );
    const negotiationListingsPromise: Promise<Array<Doc<"listings"> | null>> = Promise.all(
      Array.from(negotiationListingIds, (id) => ctx.db.get(id)),
    );

    const [
      leadAgentUsers,
      leadSocieties,
      visitAgentUsers,
      visitListings,
      visitLeads,
      negotiationAgentUsers,
      negotiationListings,
    ] = await Promise.all([
      leadAgentUsersPromise,
      leadSocietiesPromise,
      visitAgentUsersPromise,
      visitListingsPromise,
      visitLeadsPromise,
      negotiationAgentUsersPromise,
      negotiationListingsPromise,
    ]);

    const leadAgentNameById = new Map<Doc<"users">["_id"], string>();
    for (const user of leadAgentUsers) {
      if (user) {
        leadAgentNameById.set(user._id, user.name);
      }
    }

    const leadSocietyNameById = new Map<Doc<"societies">["_id"], string>();
    for (const society of leadSocieties) {
      if (society) {
        leadSocietyNameById.set(society._id, society.name);
      }
    }

    const visitAgentNameById = new Map<Doc<"users">["_id"], string>();
    for (const user of visitAgentUsers) {
      if (user) {
        visitAgentNameById.set(user._id, user.name);
      }
    }

    const visitListingById = new Map<Doc<"listings">["_id"], Doc<"listings">>();
    for (const listing of visitListings) {
      if (listing) {
        visitListingById.set(listing._id, listing);
      }
    }

    const visitLeadById = new Map<Doc<"leads">["_id"], Doc<"leads">>();
    for (const lead of visitLeads) {
      if (lead) {
        visitLeadById.set(lead._id, lead);
      }
    }

    const negotiationAgentNameById = new Map<Doc<"users">["_id"], string>();
    for (const user of negotiationAgentUsers) {
      if (user) {
        negotiationAgentNameById.set(user._id, user.name);
      }
    }

    const negotiationListingById = new Map<Doc<"listings">["_id"], Doc<"listings">>();
    for (const listing of negotiationListings) {
      if (listing) {
        negotiationListingById.set(listing._id, listing);
      }
    }

    const stale_leads = staleLeads
      .map((lead) => ({
        id: `${lead._id}`,
        flat_no: lead.flat_number,
        society_name: leadSocietyNameById.get(lead.society_id) ?? "Unknown society",
        status: lead.status,
        days_stuck: getDaysStuck(now, lead._creationTime),
        agent_name: leadAgentNameById.get(lead.submitted_by_guard_id) ?? null,
        link: `/admin/leads?id=${lead._id}`,
      }))
      .sort((a, b) => b.days_stuck - a.days_stuck);

    const stale_visits = staleVisits
      .map((visit) => {
        const listing = visit.listing_id ? visitListingById.get(visit.listing_id) : null;
        const lead = visitLeadById.get(visit.lead_id);
        const listingLabel =
          listing?.slug ?? (lead ? `Flat ${lead.flat_number}` : "Unknown listing");

        return {
          id: `${visit._id}`,
          listing_label: listingLabel,
          status: visit.status,
          days_stuck: getDaysStuck(now, visit._creationTime),
          agent_name: visitAgentNameById.get(visit.assigned_guard_id) ?? null,
          link: `/admin/visits?id=${visit._id}`,
        };
      })
      .sort((a, b) => b.days_stuck - a.days_stuck)
      .slice(0, 20);

    const stale_negotiations = staleNegotiations
      .map((negotiation) => {
        const listing = negotiationListingById.get(negotiation.listing_id);

        return {
          id: `${negotiation._id}`,
          listing_label: listing?.slug ?? `Negotiation ${`${negotiation._id}`.slice(-6)}`,
          status: negotiation.status,
          days_stuck: getDaysStuck(now, negotiation.last_activity_at),
          agent_name: negotiationAgentNameById.get(negotiation.initiated_by_admin_id) ?? null,
          link: `/admin/negotiations/${negotiation._id}`,
        };
      })
      .sort((a, b) => b.days_stuck - a.days_stuck)
      .slice(0, 20);

    return {
      stale_leads,
      stale_visits,
      stale_negotiations,
      total_stale_count: stale_leads.length + stale_visits.length + stale_negotiations.length,
    };
  },
});

export const getTeamHealthHeatmap = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const [opsUsers, caseloadThreshold] = await Promise.all([
      listActiveOpsUsers(ctx),
      getCaseloadThreshold(ctx),
    ]);

    if (opsUsers.length === 0) {
      return [];
    }

    const opsUserIds = new Set(opsUsers.map((user) => user._id.toString()));

    const [
      guardProfilesRaw,
      activeTargetsRaw,
      activeWarningsRaw,
      checkInsRaw,
      leadGroups,
      visitGroups,
      negotiationGroups,
    ] = await Promise.all([
      ctx.db.query("guard_profiles").take(HEATMAP_FANIN_READ_CAP),
      ctx.db
        .query("ops_kpi_targets")
        .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
        .order("desc")
        .take(HEATMAP_FANIN_READ_CAP),
      ctx.db
        .query("ops_warnings")
        .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
        .order("desc")
        .take(HEATMAP_FANIN_READ_CAP),
      ctx.db.query("ops_check_in_notes").order("desc").take(HEATMAP_FANIN_READ_CAP),
      Promise.all(
        ACTIVE_LEAD_CASELOAD_STATUSES.map((status) =>
          ctx.db
            .query("leads")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(HEATMAP_FANIN_READ_CAP),
        ),
      ),
      Promise.all(
        ACTIVE_VISIT_CASELOAD_STATUSES.map((status) =>
          ctx.db
            .query("visits")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(HEATMAP_FANIN_READ_CAP),
        ),
      ),
      Promise.all(
        ACTIVE_NEGOTIATION_CASELOAD_STATUSES.map((status) =>
          ctx.db
            .query("negotiations")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(HEATMAP_FANIN_READ_CAP),
        ),
      ),
    ]);

    const profileByUserId = new Map<string, Doc<"guard_profiles">>();
    for (const profile of guardProfilesRaw) {
      const userKey = profile.user_id.toString();
      if (opsUserIds.has(userKey) && !profileByUserId.has(userKey)) {
        profileByUserId.set(userKey, profile);
      }
    }

    const targetsByUserId = new Map<string, Array<Doc<"ops_kpi_targets">>>();
    for (const target of activeTargetsRaw) {
      if (target.is_deleted) {
        continue;
      }

      const userKey = target.agent_user_id.toString();
      if (!opsUserIds.has(userKey)) {
        continue;
      }

      const existing = targetsByUserId.get(userKey);
      if (existing) {
        existing.push(target);
      } else {
        targetsByUserId.set(userKey, [target]);
      }
    }

    const warningsByUserId = new Map<string, Array<Doc<"ops_warnings">>>();
    for (const warning of activeWarningsRaw) {
      if (warning.is_deleted) {
        continue;
      }

      const userKey = warning.agent_user_id.toString();
      if (!opsUserIds.has(userKey)) {
        continue;
      }

      const existing = warningsByUserId.get(userKey);
      if (existing) {
        existing.push(warning);
      } else {
        warningsByUserId.set(userKey, [warning]);
      }
    }

    const latestCheckInByUserId = new Map<string, Doc<"ops_check_in_notes">>();
    for (const checkIn of checkInsRaw) {
      if (checkIn.is_deleted) {
        continue;
      }

      const userKey = checkIn.agent_user_id.toString();
      if (!opsUserIds.has(userKey)) {
        continue;
      }

      const existing = latestCheckInByUserId.get(userKey);
      if (!existing || checkIn.created_at > existing.created_at) {
        latestCheckInByUserId.set(userKey, checkIn);
      }
    }

    const leadCaseloadByUserId = new Map<string, number>();
    for (const leads of leadGroups) {
      for (const lead of leads) {
        const userKey = lead.submitted_by_guard_id.toString();
        if (!opsUserIds.has(userKey)) {
          continue;
        }

        leadCaseloadByUserId.set(userKey, (leadCaseloadByUserId.get(userKey) ?? 0) + 1);
      }
    }

    const visitCaseloadByUserId = new Map<string, number>();
    for (const visits of visitGroups) {
      for (const visit of visits) {
        const userKey = visit.assigned_guard_id.toString();
        if (!opsUserIds.has(userKey)) {
          continue;
        }

        visitCaseloadByUserId.set(userKey, (visitCaseloadByUserId.get(userKey) ?? 0) + 1);
      }
    }

    const negotiationCaseloadByUserId = new Map<string, number>();
    for (const negotiations of negotiationGroups) {
      for (const negotiation of negotiations) {
        if (negotiation.is_deleted) {
          continue;
        }

        const userKey = negotiation.initiated_by_admin_id.toString();
        if (!opsUserIds.has(userKey)) {
          continue;
        }

        negotiationCaseloadByUserId.set(
          userKey,
          (negotiationCaseloadByUserId.get(userKey) ?? 0) + 1,
        );
      }
    }

    const now = Date.now();
    const rows = opsUsers.map((user) => {
      const userKey = user._id.toString();
      const guardProfile = profileByUserId.get(userKey) ?? null;
      const targets = targetsByUserId.get(userKey) ?? [];
      const warnings = warningsByUserId.get(userKey) ?? [];
      const latestCheckIn = latestCheckInByUserId.get(userKey) ?? null;
      const leadCaseload = leadCaseloadByUserId.get(userKey) ?? 0;
      const visitCaseload = visitCaseloadByUserId.get(userKey) ?? 0;
      const negotiationCaseload = negotiationCaseloadByUserId.get(userKey) ?? 0;

      const activeTargetCount = targets.length;
      const targetHitCount = targets.filter(
        (target) => (target.progress_pct ?? 0) >= TARGET_PROGRESS_THRESHOLD,
      ).length;
      const targetMissCount = activeTargetCount - targetHitCount;

      const targetHitRate =
        activeTargetCount > 0 ? roundTo2((targetHitCount / activeTargetCount) * 100) : null;
      const targetMissRate =
        activeTargetCount > 0 ? roundTo2((targetMissCount / activeTargetCount) * 100) : null;

      const qualityScore = guardProfile?.quality_score ?? null;
      const activeWarningCount = warnings.length;

      const hasTargetBelowThreshold = targets.some(
        (target) => (target.progress_pct ?? 0) < TARGET_PROGRESS_THRESHOLD,
      );
      const hasLowOrMissingQuality =
        qualityScore === null || qualityScore < QUALITY_SCORE_THRESHOLD;
      const hasRedCondition =
        activeWarningCount > 0 ||
        (targetMissRate !== null && targetMissRate > RED_MISS_RATE_THRESHOLD);

      let healthColor: "RED" | "YELLOW" | "GREEN" = "GREEN";
      if (hasRedCondition) {
        healthColor = "RED";
      } else if (hasTargetBelowThreshold || hasLowOrMissingQuality) {
        healthColor = "YELLOW";
      }

      const healthReasons: string[] = [];
      if (activeWarningCount > 0) {
        healthReasons.push(
          `${activeWarningCount} active warning${activeWarningCount === 1 ? "" : "s"}`,
        );
      }
      if (targetMissRate !== null && targetMissRate > RED_MISS_RATE_THRESHOLD) {
        healthReasons.push("Target miss rate above 50%");
      } else if (hasTargetBelowThreshold) {
        healthReasons.push("At least one target below 80%");
      }
      if (qualityScore === null) {
        healthReasons.push("Quality score unavailable");
      } else if (qualityScore < QUALITY_SCORE_THRESHOLD) {
        healthReasons.push("Quality score below 60");
      }
      if (healthReasons.length === 0) {
        healthReasons.push("All health checks passing");
      }

      const lastCheckInAt = latestCheckIn?.created_at ?? null;
      const daysSinceLastCheckIn =
        lastCheckInAt === null ? null : Math.max(0, Math.floor((now - lastCheckInAt) / DAY_MS));

      const activeCaseload = leadCaseload + visitCaseload + negotiationCaseload;

      return {
        user_id: user._id,
        name: user.name,
        phone: user.phone,
        status: user.status,
        quality_score: qualityScore,
        health_color: healthColor,
        health_reasons: healthReasons,
        target_hit_rate: targetHitRate,
        target_miss_rate: targetMissRate,
        active_target_count: activeTargetCount,
        active_warning_count: activeWarningCount,
        warning_level_breakdown: countWarningLevels(warnings),
        last_check_in_at: lastCheckInAt,
        days_since_last_check_in: daysSinceLastCheckIn,
        active_caseload: activeCaseload,
        is_overloaded: activeCaseload > caseloadThreshold,
        quality_score_delta_pct: null,
        target_hit_rate_delta_pct: null,
        active_caseload_delta: null,
      };
    });

    const healthPriority: Record<"RED" | "YELLOW" | "GREEN", number> = {
      RED: 0,
      YELLOW: 1,
      GREEN: 2,
    };

    return rows.sort((a, b) => {
      const colorDiff = healthPriority[a.health_color] - healthPriority[b.health_color];
      if (colorDiff !== 0) {
        return colorDiff;
      }

      return a.name.localeCompare(b.name);
    });
  },
});

export const getFiresAlert = query({
  args: {},
  handler: async (ctx) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.OPS_MANAGEMENT_VIEW);

    const now = Date.now();

    const [activeWarningsRaw, staleConfig, checkinConfig, qualityConfig, opsUsers] =
      await Promise.all([
        ctx.db
          .query("ops_warnings")
          .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
          .collect(),
        ctx.db
          .query("system_config")
          .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.NEGOTIATION_STALE_DAYS))
          .unique(),
        ctx.db
          .query("system_config")
          .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CHECKIN_OVERDUE_DAYS))
          .unique(),
        ctx.db
          .query("system_config")
          .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.WARNING_QUALITY_THRESHOLD))
          .unique(),
        listActiveOpsUsers(ctx),
      ]);

    const staleDays = parseConfigNumber(staleConfig?.value, DEFAULT_FIRE_NEGOTIATION_STALE_DAYS);
    const checkinOverdueDays = parseConfigNumber(
      checkinConfig?.value,
      DEFAULT_FIRE_CHECKIN_OVERDUE_DAYS,
    );
    const qualityThreshold = parseConfigNumber(
      qualityConfig?.value,
      DEFAULT_FIRE_WARNING_QUALITY_THRESHOLD,
    );

    const activeWarnings = activeWarningsRaw.filter(
      (warning) => !warning.is_deleted && warning.warning_level >= 2,
    );

    const staleCutoff = now - staleDays * DAY_MS;
    const staleNegotiations = (
      await Promise.all(
        ACTIVE_NEGOTIATION_CASELOAD_STATUSES.map((status) =>
          ctx.db
            .query("negotiations")
            .withIndex("by_status_last_activity", (q) =>
              q.eq("status", status).lt("last_activity_at", staleCutoff),
            )
            .filter((q) => q.neq(q.field("is_deleted"), true))
            .collect(),
        ),
      )
    ).flat();

    const opsUserMap = new Map(opsUsers.map((user) => [user._id.toString(), user]));

    const opsProfiles = await Promise.all(
      opsUsers.map(async (user) => {
        const [guardProfile, latestCheckIn] = await Promise.all([
          ctx.db
            .query("guard_profiles")
            .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
            .unique(),
          ctx.db
            .query("ops_check_in_notes")
            .withIndex("by_agent", (q) => q.eq("agent_user_id", user._id))
            .filter((q) => q.neq(q.field("is_deleted"), true))
            .order("desc")
            .first(),
        ]);

        return {
          user,
          guardProfile,
          latestCheckIn,
        };
      }),
    );

    const fireCandidates: Array<FireItem & { sortTimestamp: number }> = [];

    const warningsByAgent = new Map<string, Array<Doc<"ops_warnings">>>();
    for (const warning of activeWarnings) {
      const agentKey = warning.agent_user_id.toString();
      if (!opsUserMap.has(agentKey)) {
        continue;
      }
      const group = warningsByAgent.get(agentKey);
      if (group) {
        group.push(warning);
      } else {
        warningsByAgent.set(agentKey, [warning]);
      }
    }

    for (const [agentKey, warnings] of warningsByAgent.entries()) {
      const agent = opsUserMap.get(agentKey);
      if (!agent) {
        continue;
      }

      const maxLevel = warnings.reduce(
        (level, warning) => Math.max(level, warning.warning_level),
        0,
      );
      const severity: FireSeverity = maxLevel >= 3 ? "CRITICAL" : "HIGH";
      const sortedWarnings = [...warnings].sort((a, b) => a.created_at - b.created_at);
      const topWarnings = sortedWarnings.slice(0, 5);
      const latestWarningAt = warnings.reduce(
        (latest, warning) => Math.max(latest, warning.updated_at ?? warning.created_at),
        0,
      );

      fireCandidates.push({
        id: `warning-${agentKey}`,
        severity,
        category: "warning",
        description: `${warnings.length} active level-2+ warning${warnings.length === 1 ? "" : "s"}`,
        agent_name: agent.name,
        agent_user_id: agentKey,
        action_label: severity === "CRITICAL" ? "Escalate now" : "Review warnings",
        action_href: "/admin/ops-command-center?view=ops_head",
        entity_details: topWarnings.map((warning) => ({
          entity_type: "warning",
          entity_id: warning._id,
          display_label: `L${warning.warning_level} - ${warning.trigger_reason}`,
          days_stuck: getDaysStuck(now, warning.created_at),
          current_blocker: warning.description,
          action_href: "/admin/ops-command-center?view=ops_head",
        })),
        sortTimestamp: latestWarningAt,
      });
    }

    const staleByAgent = new Map<string, Array<Doc<"negotiations">>>();
    for (const negotiation of staleNegotiations) {
      const agentKey = negotiation.initiated_by_admin_id.toString();
      if (!opsUserMap.has(agentKey)) {
        continue;
      }
      const group = staleByAgent.get(agentKey);
      if (group) {
        group.push(negotiation);
      } else {
        staleByAgent.set(agentKey, [negotiation]);
      }
    }

    for (const [agentKey, negotiations] of staleByAgent.entries()) {
      const agent = opsUserMap.get(agentKey);
      if (!agent) {
        continue;
      }

      const oldestFirst = [...negotiations].sort((a, b) => a.last_activity_at - b.last_activity_at);
      const topNegotiations = oldestFirst.slice(0, 5);
      const oldestAt = topNegotiations[0]?.last_activity_at ?? now;

      fireCandidates.push({
        id: `stale-negotiation-${agentKey}`,
        severity: "MEDIUM",
        category: "stale_negotiation",
        description: `${negotiations.length} stale negotiation${negotiations.length === 1 ? "" : "s"} over ${staleDays} days`,
        agent_name: agent.name,
        agent_user_id: agentKey,
        action_label: "Review negotiations",
        action_href: "/admin/negotiations",
        entity_details: topNegotiations.map((negotiation) => {
          const daysStuck = getDaysStuck(now, negotiation.last_activity_at);
          return {
            entity_type: "negotiation" as const,
            entity_id: negotiation._id,
            display_label: `Negotiation ${negotiation._id.slice(-6)} - ${negotiation.status}`,
            days_stuck: daysStuck,
            current_blocker: `No activity for ${daysStuck} day${daysStuck === 1 ? "" : "s"}`,
            action_href: `/admin/negotiations/${negotiation._id}`,
          };
        }),
        sortTimestamp: oldestAt,
      });
    }

    for (const profile of opsProfiles) {
      const latestCheckInAt = profile.latestCheckIn?.created_at ?? null;
      const daysSinceCheckIn =
        latestCheckInAt === null ? checkinOverdueDays + 1 : getDaysStuck(now, latestCheckInAt);

      if (daysSinceCheckIn >= checkinOverdueDays) {
        fireCandidates.push({
          id: `overdue-checkin-${profile.user._id}`,
          severity: "MEDIUM",
          category: "overdue_checkin",
          description:
            latestCheckInAt === null
              ? `No check-in logged in the last ${checkinOverdueDays} days`
              : `${daysSinceCheckIn} days since last check-in (threshold ${checkinOverdueDays} days)`,
          agent_name: profile.user.name,
          agent_user_id: profile.user._id,
          action_label: "Schedule check-in",
          action_href: "/admin/ops-command-center?view=ops_head",
          entity_details: [
            {
              entity_type: "warning",
              entity_id: profile.latestCheckIn?._id ?? profile.user._id,
              display_label:
                latestCheckInAt === null
                  ? "No historical check-in note"
                  : `Last check-in - ${new Date(latestCheckInAt).toLocaleDateString("en-IN")}`,
              days_stuck: daysSinceCheckIn,
              current_blocker: "Manager follow-up overdue",
              action_href: "/admin/ops-command-center?view=ops_head",
            },
          ],
          sortTimestamp: latestCheckInAt ?? 0,
        });
      }

      const qualityScore = profile.guardProfile?.quality_score;
      if (qualityScore !== null && qualityScore !== undefined && qualityScore < qualityThreshold) {
        fireCandidates.push({
          id: `low-quality-${profile.user._id}`,
          severity: "HIGH",
          category: "low_quality",
          description: `Quality score ${roundTo2(qualityScore)} below threshold ${qualityThreshold}`,
          agent_name: profile.user.name,
          agent_user_id: profile.user._id,
          action_label: "Open profile",
          action_href: "/admin/ops-command-center?view=ops_head",
          entity_details: [
            {
              entity_type: "warning",
              entity_id: profile.guardProfile?._id ?? profile.user._id,
              display_label: "Latest quality score snapshot",
              days_stuck: 0,
              current_blocker: "Quality score requires intervention",
              action_href: "/admin/ops-command-center?view=ops_head",
            },
          ],
          sortTimestamp: now,
        });
      }
    }

    return fireCandidates
      .sort((a, b) => {
        const severityDiff =
          FIRE_SEVERITY_PRIORITY[a.severity] - FIRE_SEVERITY_PRIORITY[b.severity];
        if (severityDiff !== 0) {
          return severityDiff;
        }

        return b.sortTimestamp - a.sortTimestamp;
      })
      .map(({ sortTimestamp: _sortTimestamp, ...item }) => item);
  },
});
