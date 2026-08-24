import { v } from "convex/values";
import {
  CALL_OUTCOME,
  CLOSURE_STATUS,
  INCENTIVE_PERSONA,
  LEAD_STATUS,
  P44_CONFIG_KEYS,
  P44_DEFAULTS,
  PAYOUT_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  type SystemConfigKey,
  USER_STATUS,
  USER_TYPE,
  VISIT_STATUS,
} from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  DEFAULT_LEADERBOARD_FILTER,
  FIELD_WORKER_USER_TYPES,
  fieldWorkerLeaderboardFilterValidator,
  type FieldWorkerLeaderboardFilter,
  type FieldWorkerUserType,
} from "./fieldWorkerContracts";
import { resolveP44RolloutState } from "./fieldWorkerRollout";
import { internalMutation, leadCounts, payoutTotals, query, visitCounts } from "./functions";
import { getSystemConfigStringArray } from "./systemConfig.helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

const timeWindowValidator = v.union(
  v.literal("last_7_days"),
  v.literal("last_30_days"),
  v.literal("last_90_days"),
  v.literal("all_time"),
);

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

const shadowEntityTypeValidator = v.union(
  v.literal("commission"),
  v.literal("attribution"),
  v.literal("disbursement"),
);

type TimeWindow = "last_7_days" | "last_30_days" | "last_90_days" | "all_time";
type TrendDirection = "up" | "down" | "flat" | null;

type MetricWithTrend = {
  value: number | null;
  trend: TrendDirection;
};

type CommissionTrendsResponse = {
  trends: Array<{
    bucket: string;
    v2_total_paise: number;
    v3_total_paise: number;
    delta_paise: number;
  }>;
  period: number;
};

type AttributionFairnessResponse = {
  gini_coefficient: number;
  sample_size: number;
  period: number;
};

type GamificationEngagementResponse = {
  active_users: number;
  quest_completion_rate: number;
  avg_streak_days: number;
  tier_distribution: Record<string, number>;
  period: number;
};

type ModifierEffectivenessResponse = {
  modifiers: Array<{
    modifier_key: string;
    applied_count: number;
    avg_delta_paise: number;
  }>;
  period: number;
};

type ShadowModeDeltaResponse = {
  total_deltas: number;
  deltas: Doc<"shadow_mode_deltas">[];
  period: number;
};

type PersonaEarningsResponse = {
  earnings: Array<{
    persona: string;
    total_amount_paise: number;
    disbursement_count: number;
  }>;
  persona: string;
  period: number;
};

type OperationalValues = {
  avg_submitted_to_verified_days: number | null;
  avg_verified_to_listing_days: number | null;
  avg_listing_to_first_visit_days: number | null;
  avg_verified_to_closure_days: number | null;
  need_info_rate: number | null;
  duplicate_rate: number | null;
  visit_no_show_rate: number | null;
};

const SHADOW_ENTITY_TYPES: Array<Doc<"shadow_mode_deltas">["entity_type"]> = [
  "commission",
  "attribution",
  "disbursement",
];

const OPS_FIELD_WORKER_CANARY_USER_IDS_KEY =
  P44_CONFIG_KEYS.OPS_FIELD_WORKER_CANARY_USER_IDS as SystemConfigKey;

const FIELD_WORKER_ENDPOINT_ENTITY_TYPES = new Set<string>(["leads", "tenant_inquiries", "visits"]);

const LEAD_STATUS_VALUES: ReadonlyArray<Doc<"leads">["status"]> = [
  LEAD_STATUS.SUBMITTED,
  LEAD_STATUS.NEED_INFO,
  LEAD_STATUS.POTENTIAL_DUPLICATE,
  LEAD_STATUS.VERIFIED,
  LEAD_STATUS.REJECTED,
  LEAD_STATUS.DUPLICATE,
];

const VISIT_STATUS_VALUES: ReadonlyArray<Doc<"visits">["status"]> = [
  VISIT_STATUS.ASSIGNED,
  VISIT_STATUS.CONFIRMED,
  VISIT_STATUS.IN_PROGRESS,
  VISIT_STATUS.COMPLETED,
  VISIT_STATUS.CANCELLED,
  VISIT_STATUS.NO_SHOW,
];

const PAYOUT_STATUS_VALUES: ReadonlyArray<Doc<"payouts">["status"]> = [
  PAYOUT_STATUS.PENDING,
  PAYOUT_STATUS.APPROVED,
  PAYOUT_STATUS.DISBURSED,
  PAYOUT_STATUS.FAILED,
  PAYOUT_STATUS.VOIDED,
];

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toRateOrNull(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return roundTo2((numerator / denominator) * 100);
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return roundTo2(total / values.length);
}

function averagePaiseOrNull(totalPaise: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return Math.round(totalPaise / denominator);
}

function getTimeWindowCutoff(timeWindow: TimeWindow): number | null {
  const now = Date.now();

  switch (timeWindow) {
    case "last_7_days":
      return now - 7 * DAY_MS;
    case "last_30_days":
      return now - 30 * DAY_MS;
    case "last_90_days":
      return now - 90 * DAY_MS;
    case "all_time":
      return null;
  }
}

function getTimeWindowLengthMs(timeWindow: TimeWindow): number | null {
  switch (timeWindow) {
    case "last_7_days":
      return 7 * DAY_MS;
    case "last_30_days":
      return 30 * DAY_MS;
    case "last_90_days":
      return 90 * DAY_MS;
    case "all_time":
      return null;
  }
}

function normalizeTimeWindowDays(value: number | undefined): number {
  if (value === undefined) {
    return 30;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("time_window_days must be a positive integer");
  }

  return Math.min(value, 3650);
}

async function getShadowDeltasByEntityType(
  ctx: QueryCtx,
  args: {
    entityType: Doc<"shadow_mode_deltas">["entity_type"];
    persona: Doc<"shadow_mode_deltas">["persona"] | undefined;
    fromTimestamp: number | undefined;
    toTimestamp: number | undefined;
  },
): Promise<Doc<"shadow_mode_deltas">[]> {
  const { entityType, persona, fromTimestamp, toTimestamp } = args;

  let deltas: Doc<"shadow_mode_deltas">[];

  if (persona !== undefined && fromTimestamp !== undefined && toTimestamp !== undefined) {
    deltas = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) =>
        q
          .eq("entity_type", entityType)
          .eq("persona", persona)
          .gte("created_at", fromTimestamp)
          .lte("created_at", toTimestamp),
      )
      .collect();
  } else if (persona !== undefined && fromTimestamp !== undefined) {
    deltas = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) =>
        q.eq("entity_type", entityType).eq("persona", persona).gte("created_at", fromTimestamp),
      )
      .collect();
  } else if (persona !== undefined && toTimestamp !== undefined) {
    deltas = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) =>
        q.eq("entity_type", entityType).eq("persona", persona).lte("created_at", toTimestamp),
      )
      .collect();
  } else if (persona !== undefined) {
    deltas = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) => q.eq("entity_type", entityType).eq("persona", persona))
      .collect();
  } else {
    deltas = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) => q.eq("entity_type", entityType))
      .collect();
  }

  return deltas.filter((delta) => {
    if (fromTimestamp !== undefined && delta.created_at < fromTimestamp) {
      return false;
    }

    if (toTimestamp !== undefined && delta.created_at > toTimestamp) {
      return false;
    }

    return true;
  });
}

function toISTDateKey(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function toISTMonthKey(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 7);
}

function getCurrentISTDayStart(now = Date.now()): number {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

function getPreviousISTDayRange(now = Date.now()): {
  snapshotDate: string;
  startMs: number;
  endMs: number;
} {
  const currentDayStart = getCurrentISTDayStart(now);
  const startMs = currentDayStart - DAY_MS;
  const endMs = currentDayStart;

  return {
    snapshotDate: toISTDateKey(startMs),
    startMs,
    endMs,
  };
}

function getLastNISTMonthKeys(count: number, now = Date.now()): string[] {
  const currentIstDate = new Date(now + IST_OFFSET_MS);
  const currentYear = currentIstDate.getUTCFullYear();
  const currentMonth = currentIstDate.getUTCMonth();

  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(currentYear, currentMonth - offset, 1));
    keys.push(date.toISOString().slice(0, 7));
  }

  return keys;
}

function compareNumbers(current: number | null, previous: number | null): TrendDirection {
  if (current === null || previous === null) {
    return null;
  }

  const diff = current - previous;
  const baseline = Math.max(Math.abs(current), Math.abs(previous));
  if (baseline === 0 || Math.abs(diff) / baseline < 0.05) {
    return "flat";
  }

  return diff > 0 ? "up" : "down";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNumberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isAuditLogFailure(entry: Doc<"audit_logs">): boolean {
  if (entry.action.includes("FAILED") || entry.action.includes("ERROR")) {
    return true;
  }

  const metadata = asRecord(entry.metadata);
  const status = metadata?.status;

  if (typeof status === "string") {
    const normalizedStatus = status.toUpperCase();
    if (normalizedStatus === "FAILED" || normalizedStatus === "ERROR") {
      return true;
    }
  }

  return false;
}

function getPayoutEventTime(payout: Doc<"payouts">): number {
  if (payout.status === PAYOUT_STATUS.DISBURSED || payout.status === PAYOUT_STATUS.FAILED) {
    return payout.disbursed_at ?? payout._creationTime;
  }
  if (payout.status === PAYOUT_STATUS.APPROVED) {
    return payout.approved_at ?? payout._creationTime;
  }
  return payout._creationTime;
}

function getSocietySet(allowedSocietyIds: Id<"societies">[] | null): Set<Id<"societies">> | null {
  if (allowedSocietyIds === null) {
    return null;
  }

  return new Set(allowedSocietyIds);
}

function isSocietyAllowed(
  allowedSocietyIds: Id<"societies">[] | null,
  societyId: Id<"societies">,
): boolean {
  if (allowedSocietyIds === null) {
    return true;
  }

  return allowedSocietyIds.includes(societyId);
}

function isFieldWorkerUserType(
  userType: Doc<"users">["user_type"],
): userType is FieldWorkerUserType {
  return FIELD_WORKER_USER_TYPES.some((value) => value === userType);
}

function matchesPersonaFilter(
  userType: Doc<"users">["user_type"],
  personaFilter: FieldWorkerLeaderboardFilter,
): userType is FieldWorkerUserType {
  if (personaFilter === "ALL") {
    return isFieldWorkerUserType(userType);
  }

  return userType === personaFilter;
}

async function hasPayoutPermission(ctx: QueryCtx): Promise<boolean> {
  try {
    await requirePermission(ctx, PERMISSIONS.PAYOUTS_VIEW);
    return true;
  } catch {
    return false;
  }
}

async function getAllowedSocietyIds(_ctx: QueryCtx): Promise<Id<"societies">[] | null> {
  return null;
}

async function getActiveSocietyIds(
  ctx: QueryCtx,
  allowedSocietyIds: Id<"societies">[] | null,
): Promise<Id<"societies">[]> {
  const activeSocieties = await ctx.db
    .query("societies")
    .withIndex("by_status", (q) => q.eq("status", SOCIETY_STATUS.ACTIVE))
    .collect();

  if (allowedSocietyIds === null) {
    return activeSocieties.map((society) => society._id);
  }

  const allowedSet = getSocietySet(allowedSocietyIds);
  return activeSocieties
    .filter((society) => allowedSet !== null && allowedSet.has(society._id))
    .map((society) => society._id);
}

async function getScopedSocietyIds(
  ctx: QueryCtx,
  allowedSocietyIds: Id<"societies">[] | null,
): Promise<Id<"societies">[]> {
  const allSocieties = await ctx.db.query("societies").collect();

  if (allowedSocietyIds === null) {
    return allSocieties.map((society) => society._id);
  }

  const allowedSet = getSocietySet(allowedSocietyIds);
  return allSocieties
    .filter((society) => allowedSet !== null && allowedSet.has(society._id))
    .map((society) => society._id);
}

async function getScopedLeads(
  ctx: QueryCtx,
  options: {
    status?: Doc<"leads">["status"];
    societyId?: Id<"societies">;
    cutoff?: number | null;
    start?: number | null;
    end?: number | null;
    allowedSocietyIds: Id<"societies">[] | null;
  },
): Promise<Doc<"leads">[]> {
  const { status, societyId, cutoff, start, end, allowedSocietyIds } = options;

  if (societyId !== undefined && !isSocietyAllowed(allowedSocietyIds, societyId)) {
    return [];
  }

  const leads =
    societyId !== undefined && status !== undefined
      ? await ctx.db
          .query("leads")
          .withIndex("by_society_and_status", (q) =>
            q.eq("society_id", societyId).eq("status", status),
          )
          .collect()
      : societyId !== undefined
        ? await ctx.db
            .query("leads")
            .withIndex("by_society_id", (q) => q.eq("society_id", societyId))
            .collect()
        : status !== undefined
          ? await ctx.db
              .query("leads")
              .withIndex("by_status", (q) => q.eq("status", status))
              .collect()
          : await ctx.db.query("leads").collect();

  const timeFilteredLeads = leads.filter((lead) => {
    if (cutoff !== null && cutoff !== undefined && lead._creationTime < cutoff) {
      return false;
    }

    if (start !== null && start !== undefined && lead._creationTime < start) {
      return false;
    }

    if (end !== null && end !== undefined && lead._creationTime >= end) {
      return false;
    }

    return true;
  });

  if (allowedSocietyIds === null || societyId !== undefined) {
    return timeFilteredLeads;
  }

  const allowedSet = getSocietySet(allowedSocietyIds);
  return timeFilteredLeads.filter((lead) => allowedSet !== null && allowedSet.has(lead.society_id));
}

async function getLeadMap(
  ctx: QueryCtx,
  leadIds: Id<"leads">[],
): Promise<Map<Id<"leads">, Doc<"leads">>> {
  const uniqueLeadIds = [...new Set(leadIds)];
  const leadDocs = await Promise.all(uniqueLeadIds.map((leadId) => ctx.db.get(leadId)));

  const leadMap = new Map<Id<"leads">, Doc<"leads">>();
  for (const lead of leadDocs) {
    if (lead) {
      leadMap.set(lead._id, lead);
    }
  }

  return leadMap;
}

async function getConfirmedClosurePairs(
  ctx: QueryCtx,
  options: {
    cutoff?: number | null;
    start?: number | null;
    end?: number | null;
    societyId?: Id<"societies">;
    allowedSocietyIds: Id<"societies">[] | null;
  },
): Promise<Array<{ closure: Doc<"closures">; lead: Doc<"leads"> }>> {
  const { cutoff, start, end, societyId, allowedSocietyIds } = options;

  if (societyId !== undefined && !isSocietyAllowed(allowedSocietyIds, societyId)) {
    return [];
  }

  const closuresQuery = ctx.db
    .query("closures")
    .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED));

  const closures = await closuresQuery.collect();
  if (closures.length === 0) {
    return [];
  }

  // Filter by confirmed_at (the meaningful event timestamp), not _creationTime.
  // Closures can be created in PENDING and confirmed later.
  const filteredClosures = closures.filter((closure) => {
    const eventTime = closure.confirmed_at ?? closure._creationTime;
    if (cutoff !== null && cutoff !== undefined && eventTime < cutoff) {
      return false;
    }
    if (start !== null && start !== undefined && eventTime < start) {
      return false;
    }
    if (end !== null && end !== undefined && eventTime >= end) {
      return false;
    }
    return true;
  });

  if (filteredClosures.length === 0) {
    return [];
  }

  const leadMap = await getLeadMap(
    ctx,
    filteredClosures.map((closure) => closure.lead_id),
  );

  const allowedSet = getSocietySet(allowedSocietyIds);
  const rows: Array<{ closure: Doc<"closures">; lead: Doc<"leads"> }> = [];

  for (const closure of filteredClosures) {
    const lead = leadMap.get(closure.lead_id);
    if (!lead) {
      continue;
    }

    if (societyId !== undefined && lead.society_id !== societyId) {
      continue;
    }

    if (allowedSet !== null && !allowedSet.has(lead.society_id)) {
      continue;
    }

    rows.push({ closure, lead });
  }

  return rows;
}

async function getLeadStatusCountAllTime(
  ctx: QueryCtx,
  societyIds: Id<"societies">[],
  status: Doc<"leads">["status"],
): Promise<number> {
  const counts = await Promise.all(
    societyIds.map((societyId) => leadCounts.count(ctx, { namespace: `${societyId}|${status}` })),
  );

  return counts.reduce((sum, count) => sum + count, 0);
}

async function getVisitCountForGuardAllTime(
  ctx: QueryCtx,
  guardUserId: Id<"users">,
): Promise<number> {
  const counts = await Promise.all(
    VISIT_STATUS_VALUES.map((status) =>
      visitCounts.count(ctx, { namespace: `${guardUserId}|${status}` }),
    ),
  );

  return counts.reduce((sum, count) => sum + count, 0);
}

// BUG 1 fix: Pure computation function — takes pre-loaded data to avoid redundant table scans.
// Called by getOperationalMetrics which fetches all tables once for both current/previous windows.
function computeOperationalFromPreloadedData(
  leads: Doc<"leads">[],
  allVerifications: Doc<"owner_verifications">[],
  allListings: Doc<"listings">[],
  allVisits: Doc<"visits">[],
  allConfirmedClosures: Doc<"closures">[],
): OperationalValues {
  const totalSubmitted = leads.length;
  // TODO: These count leads currently in NEED_INFO/DUPLICATE status, not leads that
  // ever entered these states. Leads that passed through and moved on are undercounted.
  // Fix requires denormalized flags on leads or audit_logs scan.
  const needInfoCount = leads.filter((lead) => lead.status === LEAD_STATUS.NEED_INFO).length;
  const duplicateCount = leads.filter(
    (lead) =>
      lead.status === LEAD_STATUS.DUPLICATE || lead.status === LEAD_STATUS.POTENTIAL_DUPLICATE,
  ).length;

  if (totalSubmitted === 0) {
    return {
      avg_submitted_to_verified_days: null,
      avg_verified_to_listing_days: null,
      avg_listing_to_first_visit_days: null,
      avg_verified_to_closure_days: null,
      need_info_rate: null,
      duplicate_rate: null,
      visit_no_show_rate: null,
    };
  }

  const leadById = new Map<Id<"leads">, Doc<"leads">>();
  for (const lead of leads) {
    leadById.set(lead._id, lead);
  }

  const verificationByLead = new Map<Id<"leads">, number>();
  for (const verification of allVerifications) {
    if (!leadById.has(verification.lead_id)) {
      continue;
    }

    if (verification.call_outcome !== CALL_OUTCOME.VERIFIED) {
      continue;
    }

    const existing = verificationByLead.get(verification.lead_id);
    if (existing === undefined || verification.verified_at < existing) {
      verificationByLead.set(verification.lead_id, verification.verified_at);
    }
  }

  const listingByLead = new Map<Id<"leads">, Doc<"listings">>();
  for (const listing of allListings) {
    if (!leadById.has(listing.lead_id)) {
      continue;
    }

    const existing = listingByLead.get(listing.lead_id);
    if (!existing || listing._creationTime < existing._creationTime) {
      listingByLead.set(listing.lead_id, listing);
    }
  }

  const visitsByLead = new Map<Id<"leads">, Doc<"visits">[]>();
  for (const visit of allVisits) {
    if (!leadById.has(visit.lead_id)) {
      continue;
    }

    const bucket = visitsByLead.get(visit.lead_id);
    if (bucket) {
      bucket.push(visit);
    } else {
      visitsByLead.set(visit.lead_id, [visit]);
    }
  }

  const closureByLead = new Map<Id<"leads">, Doc<"closures">>();
  for (const closure of allConfirmedClosures) {
    if (!leadById.has(closure.lead_id)) {
      continue;
    }

    const existing = closureByLead.get(closure.lead_id);
    if (!existing || closure._creationTime < existing._creationTime) {
      closureByLead.set(closure.lead_id, closure);
    }
  }

  const submittedToVerifiedDays: number[] = [];
  const verifiedToListingDays: number[] = [];
  const listingToFirstVisitDays: number[] = [];
  const verifiedToClosureDays: number[] = [];

  let totalVisits = 0;
  let noShowVisits = 0;

  for (const lead of leads) {
    const verifiedAt = verificationByLead.get(lead._id);
    const listing = listingByLead.get(lead._id);
    const leadVisits = visitsByLead.get(lead._id) ?? [];
    const closure = closureByLead.get(lead._id);

    if (verifiedAt !== undefined) {
      const submittedToVerified = (verifiedAt - lead._creationTime) / DAY_MS;
      if (submittedToVerified >= 0) {
        submittedToVerifiedDays.push(submittedToVerified);
      }
    }

    if (verifiedAt !== undefined && listing) {
      const verifiedToListing = (listing._creationTime - verifiedAt) / DAY_MS;
      if (verifiedToListing >= 0) {
        verifiedToListingDays.push(verifiedToListing);
      }
    }

    if (listing && leadVisits.length > 0) {
      let firstVisit = leadVisits[0];
      for (const visit of leadVisits) {
        if (visit._creationTime < firstVisit._creationTime) {
          firstVisit = visit;
        }
      }

      const listingToVisit = (firstVisit._creationTime - listing._creationTime) / DAY_MS;
      if (listingToVisit >= 0) {
        listingToFirstVisitDays.push(listingToVisit);
      }
    }

    if (verifiedAt !== undefined && closure) {
      const closureEventAt = closure.confirmed_at ?? closure._creationTime;
      const verifiedToClosure = (closureEventAt - verifiedAt) / DAY_MS;
      if (verifiedToClosure >= 0) {
        verifiedToClosureDays.push(verifiedToClosure);
      }
    }

    totalVisits += leadVisits.length;
    noShowVisits += leadVisits.filter((visit) => visit.status === VISIT_STATUS.NO_SHOW).length;
  }

  return {
    avg_submitted_to_verified_days: averageOrNull(submittedToVerifiedDays),
    avg_verified_to_listing_days: averageOrNull(verifiedToListingDays),
    avg_listing_to_first_visit_days: averageOrNull(listingToFirstVisitDays),
    avg_verified_to_closure_days: averageOrNull(verifiedToClosureDays),
    need_info_rate: toRateOrNull(needInfoCount, totalSubmitted),
    duplicate_rate: toRateOrNull(duplicateCount, totalSubmitted),
    visit_no_show_rate: toRateOrNull(noShowVisits, totalVisits),
  };
}

export const backfillAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    await leadCounts.clearAll(ctx);
    await visitCounts.clearAll(ctx);
    await payoutTotals.clearAll(ctx);

    let leadCount = 0;
    const allLeads = await ctx.db.query("leads").collect();
    for (const lead of allLeads) {
      await leadCounts.insertIfDoesNotExist(ctx, lead);
      leadCount++;
    }

    let visitCount = 0;
    const allVisits = await ctx.db.query("visits").collect();
    for (const visit of allVisits) {
      await visitCounts.insertIfDoesNotExist(ctx, visit);
      visitCount++;
    }

    let payoutCount = 0;
    const allPayouts = await ctx.db.query("payouts").collect();
    for (const payout of allPayouts) {
      await payoutTotals.insertIfDoesNotExist(ctx, payout);
      payoutCount++;
    }

    return { leadCount, visitCount, payoutCount };
  },
});

export const getOverviewKPIs = query({
  args: {
    time_window: timeWindowValidator,
    persona_filter: fieldWorkerLeaderboardFilterValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const personaFilter = args.persona_filter ?? DEFAULT_LEADERBOARD_FILTER;
    const cutoff = getTimeWindowCutoff(args.time_window);
    const allowedSocietyIds = await getAllowedSocietyIds(ctx);
    const hasPayoutView = await hasPayoutPermission(ctx);

    const [activeGuardUsers, activeOpsUsers, activeSocietyIds, scopedSocietyIds] =
      await Promise.all([
        ctx.db
          .query("users")
          .withIndex("by_type_and_status", (q) =>
            q.eq("user_type", USER_TYPE.GUARD).eq("status", USER_STATUS.ACTIVE),
          )
          .collect(),
        ctx.db
          .query("users")
          .withIndex("by_type_and_status", (q) =>
            q.eq("user_type", USER_TYPE.OPS).eq("status", USER_STATUS.ACTIVE),
          )
          .collect(),
        getActiveSocietyIds(ctx, allowedSocietyIds),
        getScopedSocietyIds(ctx, allowedSocietyIds),
      ]);

    const activeGuardCount = activeGuardUsers.length;
    const activeOpsCount = activeOpsUsers.length;
    const totalFieldWorkerCount = activeGuardCount + activeOpsCount;
    const activeFieldWorkerCount =
      personaFilter === "OPS"
        ? activeOpsCount
        : personaFilter === "ALL"
          ? totalFieldWorkerCount
          : activeGuardCount;

    let totalLeads = 0;
    let verifiedLeads = 0;

    if (cutoff === null) {
      const statusCounts = await Promise.all(
        LEAD_STATUS_VALUES.map((status) =>
          getLeadStatusCountAllTime(ctx, scopedSocietyIds, status),
        ),
      );
      totalLeads = statusCounts.reduce((sum, count) => sum + count, 0);
      verifiedLeads = statusCounts[LEAD_STATUS_VALUES.indexOf(LEAD_STATUS.VERIFIED)] ?? 0;
    } else {
      const leads = await getScopedLeads(ctx, {
        cutoff,
        allowedSocietyIds,
      });
      totalLeads = leads.length;
      verifiedLeads = leads.filter((lead) => lead.status === LEAD_STATUS.VERIFIED).length;
    }

    const confirmedClosures = await getConfirmedClosurePairs(ctx, {
      cutoff,
      allowedSocietyIds,
    });

    let pendingPayouts: number | null = null;
    let totalPaidOut: number | null = null;

    if (hasPayoutView) {
      // KNOWN INCONSISTENCY: aggregate path counts orphan payouts (missing/invalid lead);
      // scoped path excludes them. Rare in production; acceptable for V1.
      if (cutoff === null && allowedSocietyIds === null) {
        const [pendingSum, approvedSum, disbursedSum] = await Promise.all([
          payoutTotals.sum(ctx, { namespace: PAYOUT_STATUS.PENDING }),
          payoutTotals.sum(ctx, { namespace: PAYOUT_STATUS.APPROVED }),
          payoutTotals.sum(ctx, { namespace: PAYOUT_STATUS.DISBURSED }),
        ]);

        pendingPayouts = pendingSum + approvedSum;
        totalPaidOut = disbursedSum;
      } else {
        const [pendingPayoutRows, approvedPayoutRows, disbursedPayoutRows] = await Promise.all([
          ctx.db
            .query("payouts")
            .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.PENDING))
            .collect(),
          ctx.db
            .query("payouts")
            .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.APPROVED))
            .collect(),
          ctx.db
            .query("payouts")
            .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.DISBURSED))
            .collect(),
        ]);

        const allPayouts = [...pendingPayoutRows, ...approvedPayoutRows, ...disbursedPayoutRows];
        const leadMap = await getLeadMap(
          ctx,
          allPayouts.map((payout) => payout.lead_id),
        );
        const allowedSet = getSocietySet(allowedSocietyIds);

        pendingPayouts = 0;
        totalPaidOut = 0;

        for (const payout of allPayouts) {
          const eventTime = getPayoutEventTime(payout);
          if (cutoff !== null && eventTime < cutoff) {
            continue;
          }

          const lead = leadMap.get(payout.lead_id);
          if (!lead) {
            continue;
          }

          if (allowedSet !== null && !allowedSet.has(lead.society_id)) {
            continue;
          }

          if (payout.status === PAYOUT_STATUS.PENDING || payout.status === PAYOUT_STATUS.APPROVED) {
            pendingPayouts += payout.amount_paise;
            continue;
          }

          totalPaidOut += payout.amount_paise;
        }
      }
    }

    return {
      total_leads: totalLeads,
      verified_rate: toRateOrNull(verifiedLeads, totalLeads),
      guard_count: activeGuardCount,
      ops_count: activeOpsCount,
      active_guards: activeGuardCount,
      active_ops: activeOpsCount,
      active_field_workers: activeFieldWorkerCount,
      total_field_worker_count: totalFieldWorkerCount,
      active_societies: activeSocietyIds.length,
      pending_payouts: pendingPayouts,
      total_paid_out: totalPaidOut,
      conversion_rate: toRateOrNull(confirmedClosures.length, verifiedLeads),
    };
  },
});

export const getLeadFunnel = query({
  args: {
    society_id: v.optional(v.id("societies")),
    time_window: timeWindowValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const allowedSocietyIds = await getAllowedSocietyIds(ctx);
    const cutoff = getTimeWindowCutoff(args.time_window);

    const leads = await getScopedLeads(ctx, {
      societyId: args.society_id,
      cutoff,
      allowedSocietyIds,
    });

    const submittedSet = new Set<Id<"leads">>(leads.map((lead) => lead._id));
    const verifiedSet = new Set<Id<"leads">>(
      leads
        .filter((lead) => lead.status === LEAD_STATUS.VERIFIED)
        .map((lead) => lead._id)
        .filter((leadId) => submittedSet.has(leadId)),
    );

    const listings = await ctx.db.query("listings").collect();
    const hasListingSet = new Set<Id<"leads">>();
    for (const listing of listings) {
      if (verifiedSet.has(listing.lead_id)) {
        hasListingSet.add(listing.lead_id);
      }
    }

    const visits = await ctx.db.query("visits").collect();
    const hasVisitSet = new Set<Id<"leads">>();
    for (const visit of visits) {
      if (hasListingSet.has(visit.lead_id)) {
        hasVisitSet.add(visit.lead_id);
      }
    }

    const confirmedClosures = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
      .collect();
    const closureSet = new Set<Id<"leads">>();
    for (const closure of confirmedClosures) {
      if (hasVisitSet.has(closure.lead_id)) {
        closureSet.add(closure.lead_id);
      }
    }

    const disbursedPayouts = await ctx.db
      .query("payouts")
      .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.DISBURSED))
      .collect();
    const paidSet = new Set<Id<"leads">>();
    for (const payout of disbursedPayouts) {
      if (closureSet.has(payout.lead_id)) {
        paidSet.add(payout.lead_id);
      }
    }

    const stages = [
      { stage: "SUBMITTED", count: submittedSet.size },
      { stage: "VERIFIED", count: verifiedSet.size },
      { stage: "HAS_LISTING", count: hasListingSet.size },
      { stage: "HAS_VISIT", count: hasVisitSet.size },
      { stage: "CLOSURE_CONFIRMED", count: closureSet.size },
      { stage: "PAID", count: paidSet.size },
    ];

    return stages.map((stage, index) => {
      if (index === 0) {
        return {
          ...stage,
          drop_off_pct: null,
        };
      }

      const previousCount = stages[index - 1]?.count ?? 0;
      return {
        ...stage,
        drop_off_pct:
          previousCount === 0
            ? null
            : roundTo2(((previousCount - stage.count) / previousCount) * 100),
      };
    });
  },
});

export const getLeadTrend = query({
  args: {
    society_id: v.optional(v.id("societies")),
    days: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    if (!Number.isInteger(args.days) || args.days <= 0) {
      throw new Error("days must be a positive integer");
    }

    const allowedSocietyIds = await getAllowedSocietyIds(ctx);
    if (args.society_id !== undefined && !isSocietyAllowed(allowedSocietyIds, args.society_id)) {
      return [];
    }

    const now = Date.now();
    const currentDayStart = getCurrentISTDayStart(now);
    const trendDays = Array.from({ length: args.days }, (_, index) => {
      const offset = args.days - index - 1;
      const startMs = currentDayStart - offset * DAY_MS;
      const endMs = startMs + DAY_MS;

      return {
        date: toISTDateKey(startMs),
        startMs,
        endMs,
      };
    });

    const thirtyDayCutoff = now - 30 * DAY_MS;
    const olderDays = trendDays.filter((day) => day.endMs <= thirtyDayCutoff);

    const snapshotMap = new Map<
      string,
      { submitted: number; verified: number; closures: number }
    >();

    if (olderDays.length > 0) {
      const olderDateSet = new Set(olderDays.map((day) => day.date));
      const minSnapshotDate = olderDays[0].date;
      const maxSnapshotDate = olderDays[olderDays.length - 1].date;

      if (args.society_id === undefined) {
        const summarySnapshots = await ctx.db
          .query("analytics_snapshots")
          .withIndex("by_type_and_date", (q) =>
            q
              .eq("snapshot_type", "daily_summary")
              .gte("snapshot_date", minSnapshotDate)
              .lte("snapshot_date", maxSnapshotDate),
          )
          .collect();

        for (const snapshot of summarySnapshots) {
          if (!olderDateSet.has(snapshot.snapshot_date)) {
            continue;
          }

          const record = asRecord(snapshot.data);
          if (!record) {
            continue;
          }

          snapshotMap.set(snapshot.snapshot_date, {
            submitted: readNumberField(record, "total_leads_submitted") ?? 0,
            verified: readNumberField(record, "verified_count") ?? 0,
            closures: readNumberField(record, "closure_count") ?? 0,
          });
        }
      } else {
        const societySnapshots = await ctx.db
          .query("analytics_snapshots")
          .withIndex("by_type_and_date", (q) =>
            q
              .eq("snapshot_type", "society_stats")
              .gte("snapshot_date", minSnapshotDate)
              .lte("snapshot_date", maxSnapshotDate),
          )
          .collect();

        for (const snapshot of societySnapshots) {
          if (!olderDateSet.has(snapshot.snapshot_date)) {
            continue;
          }

          const record = asRecord(snapshot.data);
          if (!record) {
            continue;
          }

          const societyIdRaw = record.society_id;
          if (typeof societyIdRaw !== "string" || societyIdRaw !== args.society_id) {
            continue;
          }

          snapshotMap.set(snapshot.snapshot_date, {
            submitted: readNumberField(record, "leads_submitted") ?? 0,
            verified: readNumberField(record, "verified_count") ?? 0,
            closures: readNumberField(record, "closures_count") ?? 0,
          });
        }
      }
    }

    const daysForLiveComputation = trendDays.filter((day) => !snapshotMap.has(day.date));

    const liveMap = new Map<string, { submitted: number; verified: number; closures: number }>();
    if (daysForLiveComputation.length > 0) {
      const minStart = Math.min(...daysForLiveComputation.map((day) => day.startMs));
      const maxEnd = Math.max(...daysForLiveComputation.map((day) => day.endMs));
      const daySet = new Set(daysForLiveComputation.map((day) => day.date));

      const leads = await getScopedLeads(ctx, {
        societyId: args.society_id,
        start: minStart,
        end: maxEnd,
        allowedSocietyIds,
      });

      for (const lead of leads) {
        const dayKey = toISTDateKey(lead._creationTime);
        if (!daySet.has(dayKey)) {
          continue;
        }

        const bucket =
          liveMap.get(dayKey) ??
          (() => {
            const initial = { submitted: 0, verified: 0, closures: 0 };
            liveMap.set(dayKey, initial);
            return initial;
          })();

        bucket.submitted += 1;
        if (lead.status === LEAD_STATUS.VERIFIED) {
          bucket.verified += 1;
        }
      }

      const allConfirmedClosures = await ctx.db
        .query("closures")
        .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
        .collect();

      const closures = allConfirmedClosures.filter((closure) => {
        const eventTime = closure.confirmed_at ?? closure._creationTime;
        return eventTime >= minStart && eventTime < maxEnd;
      });
      const leadMap = await getLeadMap(
        ctx,
        closures.map((closure) => closure.lead_id),
      );
      const allowedSet = getSocietySet(allowedSocietyIds);

      for (const closure of closures) {
        const lead = leadMap.get(closure.lead_id);
        if (!lead) {
          continue;
        }

        if (args.society_id !== undefined && lead.society_id !== args.society_id) {
          continue;
        }

        if (allowedSet !== null && !allowedSet.has(lead.society_id)) {
          continue;
        }

        const eventTimestamp = closure.confirmed_at ?? closure._creationTime;
        const dayKey = toISTDateKey(eventTimestamp);
        if (!daySet.has(dayKey)) {
          continue;
        }

        const bucket =
          liveMap.get(dayKey) ??
          (() => {
            const initial = { submitted: 0, verified: 0, closures: 0 };
            liveMap.set(dayKey, initial);
            return initial;
          })();

        bucket.closures += 1;
      }
    }

    return trendDays.map((day) => {
      const snapshotRow = snapshotMap.get(day.date);
      const liveRow = liveMap.get(day.date);
      const dataRow = snapshotRow ?? liveRow ?? { submitted: 0, verified: 0, closures: 0 };

      return {
        date: day.date,
        submitted: dataRow.submitted,
        verified: dataRow.verified,
        closures: dataRow.closures,
      };
    });
  },
});

export const getSocietyComparison = query({
  args: {
    time_window: timeWindowValidator,
    persona_filter: fieldWorkerLeaderboardFilterValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const personaFilter = args.persona_filter ?? DEFAULT_LEADERBOARD_FILTER;
    const allowedSocietyIds = await getAllowedSocietyIds(ctx);
    const cutoff = getTimeWindowCutoff(args.time_window);

    const societies = await ctx.db
      .query("societies")
      .withIndex("by_status", (q) => q.eq("status", SOCIETY_STATUS.ACTIVE))
      .collect();

    const scopedSocieties =
      allowedSocietyIds === null
        ? societies
        : societies.filter((society) => allowedSocietyIds.includes(society._id));

    if (scopedSocieties.length === 0) {
      return [];
    }

    const societyIds = scopedSocieties.map((society) => society._id);
    const societyIdSet = new Set(societyIds);

    const leadsBySociety = new Map<Id<"societies">, number>();
    const verifiedBySociety = new Map<Id<"societies">, number>();

    if (cutoff === null) {
      await Promise.all(
        scopedSocieties.map(async (society) => {
          const statusCounts = await Promise.all(
            LEAD_STATUS_VALUES.map((status) =>
              leadCounts.count(ctx, { namespace: `${society._id}|${status}` }),
            ),
          );

          leadsBySociety.set(
            society._id,
            statusCounts.reduce((sum, count) => sum + count, 0),
          );

          const verifiedIndex = LEAD_STATUS_VALUES.indexOf(LEAD_STATUS.VERIFIED);
          verifiedBySociety.set(society._id, verifiedIndex >= 0 ? statusCounts[verifiedIndex] : 0);
        }),
      );
    } else {
      const leads = await getScopedLeads(ctx, {
        cutoff,
        allowedSocietyIds,
      });

      for (const lead of leads) {
        if (!societyIdSet.has(lead.society_id)) {
          continue;
        }

        leadsBySociety.set(lead.society_id, (leadsBySociety.get(lead.society_id) ?? 0) + 1);

        if (lead.status === LEAD_STATUS.VERIFIED) {
          verifiedBySociety.set(lead.society_id, (verifiedBySociety.get(lead.society_id) ?? 0) + 1);
        }
      }
    }

    const guardProfiles = await ctx.db.query("guard_profiles").collect();
    const scopedGuardProfiles = guardProfiles.filter((profile) =>
      societyIdSet.has(profile.society_id),
    );
    // N×get parallelized via Promise.all — acceptable for typical society counts (<100 guards).
    const guardUsers = await Promise.all(
      scopedGuardProfiles.map((profile) => ctx.db.get(profile.user_id)),
    );

    const guardCountBySociety = new Map<Id<"societies">, number>();
    const opsCountBySociety = new Map<Id<"societies">, number>();
    for (let index = 0; index < scopedGuardProfiles.length; index += 1) {
      const profile = scopedGuardProfiles[index];
      const user = guardUsers[index];

      if (
        !profile ||
        !user ||
        !isFieldWorkerUserType(user.user_type) ||
        user.status !== USER_STATUS.ACTIVE
      ) {
        continue;
      }

      if (user.user_type === USER_TYPE.GUARD) {
        guardCountBySociety.set(
          profile.society_id,
          (guardCountBySociety.get(profile.society_id) ?? 0) + 1,
        );
      } else {
        opsCountBySociety.set(
          profile.society_id,
          (opsCountBySociety.get(profile.society_id) ?? 0) + 1,
        );
      }
    }

    const closurePairs = await getConfirmedClosurePairs(ctx, {
      cutoff,
      allowedSocietyIds,
    });

    const closureCountBySociety = new Map<Id<"societies">, number>();
    const closureAgesBySociety = new Map<Id<"societies">, number[]>();

    for (const pair of closurePairs) {
      const { closure, lead } = pair;
      if (!societyIdSet.has(lead.society_id)) {
        continue;
      }

      closureCountBySociety.set(
        lead.society_id,
        (closureCountBySociety.get(lead.society_id) ?? 0) + 1,
      );

      const ages = closureAgesBySociety.get(lead.society_id) ?? [];
      const closureEventAt = closure.confirmed_at ?? closure._creationTime;
      ages.push((closureEventAt - lead._creationTime) / DAY_MS);
      closureAgesBySociety.set(lead.society_id, ages);
    }

    return scopedSocieties
      .map((society) => {
        const leadsCount = leadsBySociety.get(society._id) ?? 0;
        const verifiedCount = verifiedBySociety.get(society._id) ?? 0;
        const guardCount = guardCountBySociety.get(society._id) ?? 0;
        const opsCount = opsCountBySociety.get(society._id) ?? 0;
        const totalFieldWorkerCount = guardCount + opsCount;
        const fieldWorkerCount =
          personaFilter === "OPS"
            ? opsCount
            : personaFilter === "ALL"
              ? totalFieldWorkerCount
              : guardCount;

        return {
          society_id: society._id,
          society_name: society.name,
          city: society.city,
          guard_count: guardCount,
          ops_count: opsCount,
          field_worker_count: fieldWorkerCount,
          total_field_worker_count: totalFieldWorkerCount,
          leads_count: leadsCount,
          verified_rate: toRateOrNull(verifiedCount, leadsCount),
          closures_count: closureCountBySociety.get(society._id) ?? 0,
          avg_days_to_closure: averageOrNull(closureAgesBySociety.get(society._id) ?? []),
        };
      })
      .sort((a, b) => {
        if (b.leads_count !== a.leads_count) {
          return b.leads_count - a.leads_count;
        }

        return a.society_name.localeCompare(b.society_name);
      });
  },
});

export const getGuardLeaderboard = query({
  args: {
    society_id: v.optional(v.id("societies")),
    persona_filter: fieldWorkerLeaderboardFilterValidator,
    metric: v.union(
      v.literal("leads"),
      v.literal("verified"),
      v.literal("verified_rate"),
      v.literal("visits"),
      v.literal("closures"),
      v.literal("earned"),
    ),
    time_window: timeWindowValidator,
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);
    const personaFilter = args.persona_filter ?? DEFAULT_LEADERBOARD_FILTER;

    if (!Number.isInteger(args.limit) || args.limit <= 0) {
      throw new Error("limit must be a positive integer");
    }

    const cutoff = getTimeWindowCutoff(args.time_window);
    const allowedSocietyIds = await getAllowedSocietyIds(ctx);
    const hasPayoutView = await hasPayoutPermission(ctx);

    if (args.society_id !== undefined && !isSocietyAllowed(allowedSocietyIds, args.society_id)) {
      return [];
    }

    const societyFilterId = args.society_id;
    const guardProfiles =
      societyFilterId !== undefined
        ? await ctx.db
            .query("guard_profiles")
            .withIndex("by_society_id", (q) => q.eq("society_id", societyFilterId))
            .collect()
        : await ctx.db.query("guard_profiles").collect();

    const scopedProfiles =
      allowedSocietyIds === null
        ? guardProfiles
        : guardProfiles.filter((profile) => allowedSocietyIds.includes(profile.society_id));

    if (scopedProfiles.length === 0) {
      return [];
    }

    const societyMap = new Map<Id<"societies">, Doc<"societies">>();
    const societies = await Promise.all(
      [...new Set(scopedProfiles.map((profile) => profile.society_id))].map((societyId) =>
        ctx.db.get(societyId),
      ),
    );
    for (const society of societies) {
      if (society) {
        societyMap.set(society._id, society);
      }
    }

    const userMap = new Map<Id<"users">, Doc<"users">>();
    const users = await Promise.all(
      [...new Set(scopedProfiles.map((profile) => profile.user_id))].map((userId) =>
        ctx.db.get(userId),
      ),
    );
    for (const user of users) {
      if (user) {
        userMap.set(user._id, user);
      }
    }

    const scopedSocietyIdSet = new Set(scopedProfiles.map((profile) => profile.society_id));
    const scopedUserIdSet = new Set(scopedProfiles.map((profile) => profile.user_id));

    const leads = await getScopedLeads(ctx, {
      societyId: args.society_id,
      cutoff,
      allowedSocietyIds,
    });

    const leadsByGuard = new Map<Id<"users">, number>();
    const verifiedByGuard = new Map<Id<"users">, number>();
    for (const lead of leads) {
      if (!scopedUserIdSet.has(lead.submitted_by_guard_id)) {
        continue;
      }

      leadsByGuard.set(
        lead.submitted_by_guard_id,
        (leadsByGuard.get(lead.submitted_by_guard_id) ?? 0) + 1,
      );
      if (lead.status === LEAD_STATUS.VERIFIED) {
        verifiedByGuard.set(
          lead.submitted_by_guard_id,
          (verifiedByGuard.get(lead.submitted_by_guard_id) ?? 0) + 1,
        );
      }
    }

    const visitsByGuard = new Map<Id<"users">, number>();
    if (cutoff === null) {
      const visitRows = await Promise.all(
        [...scopedUserIdSet].map(async (guardUserId) => {
          const count = await getVisitCountForGuardAllTime(ctx, guardUserId);
          return { guardUserId, count };
        }),
      );

      for (const row of visitRows) {
        visitsByGuard.set(row.guardUserId, row.count);
      }
    } else {
      const visits =
        societyFilterId !== undefined
          ? await ctx.db
              .query("visits")
              .withIndex("by_society_id", (q) => q.eq("society_id", societyFilterId))
              .filter((q) => q.gte(q.field("_creationTime"), cutoff))
              .collect()
          : await ctx.db
              .query("visits")
              .filter((q) => q.gte(q.field("_creationTime"), cutoff))
              .collect();

      const allowedSet = getSocietySet(allowedSocietyIds);
      for (const visit of visits) {
        if (!scopedUserIdSet.has(visit.assigned_guard_id)) {
          continue;
        }

        if (allowedSet !== null && !allowedSet.has(visit.society_id)) {
          continue;
        }

        visitsByGuard.set(
          visit.assigned_guard_id,
          (visitsByGuard.get(visit.assigned_guard_id) ?? 0) + 1,
        );
      }
    }

    const confirmedClosures = await getConfirmedClosurePairs(ctx, {
      cutoff,
      societyId: args.society_id,
      allowedSocietyIds,
    });

    const closuresByGuard = new Map<Id<"users">, number>();
    for (const { lead } of confirmedClosures) {
      if (!scopedUserIdSet.has(lead.submitted_by_guard_id)) {
        continue;
      }

      closuresByGuard.set(
        lead.submitted_by_guard_id,
        (closuresByGuard.get(lead.submitted_by_guard_id) ?? 0) + 1,
      );
    }

    const earnedByGuard = new Map<Id<"users">, number>();
    if (hasPayoutView) {
      const disbursedPayouts = await ctx.db
        .query("payouts")
        .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.DISBURSED))
        .collect();
      const leadMap = await getLeadMap(
        ctx,
        disbursedPayouts.map((payout) => payout.lead_id),
      );
      const allowedSet = getSocietySet(allowedSocietyIds);

      for (const payout of disbursedPayouts) {
        if (!scopedUserIdSet.has(payout.guard_user_id)) {
          continue;
        }

        const eventTime = payout.disbursed_at ?? payout._creationTime;
        if (cutoff !== null && eventTime < cutoff) {
          continue;
        }

        const lead = leadMap.get(payout.lead_id);
        if (!lead) {
          continue;
        }

        if (!scopedSocietyIdSet.has(lead.society_id)) {
          continue;
        }

        if (args.society_id !== undefined && lead.society_id !== args.society_id) {
          continue;
        }

        if (allowedSet !== null && !allowedSet.has(lead.society_id)) {
          continue;
        }

        earnedByGuard.set(
          payout.guard_user_id,
          (earnedByGuard.get(payout.guard_user_id) ?? 0) + payout.amount_paise,
        );
      }
    }

    const rows = scopedProfiles
      .map((profile) => {
        const guardUser = userMap.get(profile.user_id);
        if (!guardUser || !matchesPersonaFilter(guardUser.user_type, personaFilter)) {
          return null;
        }

        const leadsCount = leadsByGuard.get(profile.user_id) ?? 0;
        const verifiedCount = verifiedByGuard.get(profile.user_id) ?? 0;
        const visitsCount = visitsByGuard.get(profile.user_id) ?? 0;
        const closuresCount = closuresByGuard.get(profile.user_id) ?? 0;

        return {
          rank: 0,
          guard_user_id: profile.user_id,
          guard_name: guardUser.name,
          persona: guardUser.user_type,
          society_name: societyMap.get(profile.society_id)?.name ?? null,
          leads: leadsCount,
          verified: verifiedCount,
          verified_rate: leadsCount < 5 ? null : toRateOrNull(verifiedCount, leadsCount),
          visits: visitsCount,
          closures: closuresCount,
          earned: hasPayoutView ? (earnedByGuard.get(profile.user_id) ?? 0) : null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const getMetricValue = (row: (typeof rows)[number]): number => {
      if (args.metric === "leads") {
        return row.leads;
      }
      if (args.metric === "verified") {
        return row.verified;
      }
      if (args.metric === "verified_rate") {
        return row.verified_rate ?? -1;
      }
      if (args.metric === "visits") {
        return row.visits;
      }
      if (args.metric === "closures") {
        return row.closures;
      }

      return row.earned ?? -1;
    };

    return rows
      .sort((a, b) => {
        const metricDiff = getMetricValue(b) - getMetricValue(a);
        if (metricDiff !== 0) {
          return metricDiff;
        }

        return a.guard_name.localeCompare(b.guard_name);
      })
      .slice(0, args.limit)
      .map((row, index) => ({
        ...row,
        rank: index + 1,
      }));
  },
});

export const getFinancialOverview = query({
  args: {
    time_window: timeWindowValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const hasPayoutView = await hasPayoutPermission(ctx);
    if (!hasPayoutView) {
      return {
        total_brokerage_paise: null,
        total_payouts_paise: null,
        net_revenue_paise: null,
        avg_payout_per_closure_paise: null,
        avg_days_verified_to_closure: null,
        payout_breakdown: null,
        monthly_trend: null,
      };
    }

    const cutoff = getTimeWindowCutoff(args.time_window);
    const allowedSocietyIds = await getAllowedSocietyIds(ctx);

    const confirmedClosures = await getConfirmedClosurePairs(ctx, {
      cutoff,
      allowedSocietyIds,
    });

    const totalBrokeragePaise = confirmedClosures.reduce((sum, row) => {
      const tenantSide = row.closure.brokerage_tenant_side ?? 0;
      const ownerSide = row.closure.brokerage_owner_side ?? 0;
      return sum + tenantSide + ownerSide;
    }, 0);

    let totalPayoutsPaise = 0;
    if (cutoff === null && allowedSocietyIds === null) {
      totalPayoutsPaise = await payoutTotals.sum(ctx, { namespace: PAYOUT_STATUS.DISBURSED });
    } else {
      const disbursedPayouts = await ctx.db
        .query("payouts")
        .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.DISBURSED))
        .collect();
      const leadMap = await getLeadMap(
        ctx,
        disbursedPayouts.map((payout) => payout.lead_id),
      );
      const allowedSet = getSocietySet(allowedSocietyIds);

      totalPayoutsPaise = disbursedPayouts.reduce((sum, payout) => {
        const eventTime = payout.disbursed_at ?? payout._creationTime;
        if (cutoff !== null && eventTime < cutoff) {
          return sum;
        }

        const lead = leadMap.get(payout.lead_id);
        if (!lead) {
          return sum;
        }

        if (allowedSet !== null && !allowedSet.has(lead.society_id)) {
          return sum;
        }

        return sum + payout.amount_paise;
      }, 0);
    }

    const closureLeadIdSet = new Set(confirmedClosures.map((row) => row.lead._id as string));
    const verifications = await ctx.db.query("owner_verifications").collect();
    const verifiedAtByLead = new Map<string, number>();
    for (const v of verifications) {
      if (v.call_outcome !== CALL_OUTCOME.VERIFIED) {
        continue;
      }
      if (!closureLeadIdSet.has(v.lead_id as string)) {
        continue;
      }
      const existing = verifiedAtByLead.get(v.lead_id);
      if (existing === undefined || v.verified_at < existing) {
        verifiedAtByLead.set(v.lead_id, v.verified_at);
      }
    }

    const avgDaysVerifiedToClosure = averageOrNull(
      confirmedClosures
        .map((row) => {
          const verifiedAt = verifiedAtByLead.get(row.lead._id);
          if (verifiedAt === undefined) {
            return null;
          }
          const confirmTime = row.closure.confirmed_at ?? row.closure._creationTime;
          return (confirmTime - verifiedAt) / DAY_MS;
        })
        .filter((v): v is number => v !== null && v >= 0),
    );

    const payoutBreakdown: Record<string, { count: number; total_paise: number }> = {
      [PAYOUT_STATUS.PENDING]: { count: 0, total_paise: 0 },
      [PAYOUT_STATUS.APPROVED]: { count: 0, total_paise: 0 },
      [PAYOUT_STATUS.DISBURSED]: { count: 0, total_paise: 0 },
      [PAYOUT_STATUS.FAILED]: { count: 0, total_paise: 0 },
      [PAYOUT_STATUS.VOIDED]: { count: 0, total_paise: 0 },
    };

    if (cutoff === null && allowedSocietyIds === null) {
      const [counts, sums] = await Promise.all([
        Promise.all(
          PAYOUT_STATUS_VALUES.map((status) => payoutTotals.count(ctx, { namespace: status })),
        ),
        Promise.all(
          PAYOUT_STATUS_VALUES.map((status) => payoutTotals.sum(ctx, { namespace: status })),
        ),
      ]);

      PAYOUT_STATUS_VALUES.forEach((status, index) => {
        payoutBreakdown[status] = {
          count: counts[index] ?? 0,
          total_paise: sums[index] ?? 0,
        };
      });
    } else {
      const payoutRowsByStatus = await Promise.all(
        PAYOUT_STATUS_VALUES.map((status) =>
          ctx.db
            .query("payouts")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect(),
        ),
      );

      const allPayoutRows = payoutRowsByStatus.flat();
      const leadMap = await getLeadMap(
        ctx,
        allPayoutRows.map((payout) => payout.lead_id),
      );
      const allowedSet = getSocietySet(allowedSocietyIds);

      for (const payout of allPayoutRows) {
        const eventTime = getPayoutEventTime(payout);
        if (cutoff !== null && eventTime < cutoff) {
          continue;
        }

        const lead = leadMap.get(payout.lead_id);
        if (!lead) {
          continue;
        }

        if (allowedSet !== null && !allowedSet.has(lead.society_id)) {
          continue;
        }

        const bucket = payoutBreakdown[payout.status];
        if (!bucket) {
          continue;
        }

        bucket.count += 1;
        bucket.total_paise += payout.amount_paise;
      }
    }

    const monthKeys = getLastNISTMonthKeys(12);

    const monthSet = new Set(monthKeys);
    const monthBuckets = new Map<string, { brokerage_paise: number; payouts_paise: number }>();
    for (const monthKey of monthKeys) {
      monthBuckets.set(monthKey, { brokerage_paise: 0, payouts_paise: 0 });
    }

    const allConfirmedClosures = await getConfirmedClosurePairs(ctx, {
      allowedSocietyIds,
    });
    for (const row of allConfirmedClosures) {
      const monthKey = toISTMonthKey(row.closure.confirmed_at ?? row.closure._creationTime);
      if (!monthSet.has(monthKey)) {
        continue;
      }

      const bucket = monthBuckets.get(monthKey);
      if (!bucket) {
        continue;
      }

      bucket.brokerage_paise +=
        (row.closure.brokerage_tenant_side ?? 0) + (row.closure.brokerage_owner_side ?? 0);
    }

    const allDisbursedPayouts = await ctx.db
      .query("payouts")
      .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.DISBURSED))
      .collect();
    const payoutLeadMap = await getLeadMap(
      ctx,
      allDisbursedPayouts.map((payout) => payout.lead_id),
    );
    const allowedSet = getSocietySet(allowedSocietyIds);

    for (const payout of allDisbursedPayouts) {
      const lead = payoutLeadMap.get(payout.lead_id);
      if (!lead) {
        continue;
      }

      if (allowedSet !== null && !allowedSet.has(lead.society_id)) {
        continue;
      }

      const eventTime = payout.disbursed_at ?? payout._creationTime;
      const monthKey = toISTMonthKey(eventTime);
      if (!monthSet.has(monthKey)) {
        continue;
      }

      const bucket = monthBuckets.get(monthKey);
      if (!bucket) {
        continue;
      }

      bucket.payouts_paise += payout.amount_paise;
    }

    return {
      total_brokerage_paise: totalBrokeragePaise,
      total_payouts_paise: totalPayoutsPaise,
      net_revenue_paise: totalBrokeragePaise - totalPayoutsPaise,
      avg_payout_per_closure_paise: averagePaiseOrNull(totalPayoutsPaise, confirmedClosures.length),
      avg_days_verified_to_closure: avgDaysVerifiedToClosure,
      payout_breakdown: payoutBreakdown,
      monthly_trend: monthKeys.map((month) => {
        const bucket = monthBuckets.get(month) ?? { brokerage_paise: 0, payouts_paise: 0 };
        return {
          month,
          brokerage_paise: bucket.brokerage_paise,
          payouts_paise: bucket.payouts_paise,
        };
      }),
    };
  },
});

export const getOperationalMetrics = query({
  args: {
    society_id: v.optional(v.id("societies")),
    time_window: timeWindowValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const allowedSocietyIds = await getAllowedSocietyIds(ctx);
    if (args.society_id !== undefined && !isSocietyAllowed(allowedSocietyIds, args.society_id)) {
      return {
        avg_submitted_to_verified_days: { value: null, trend: null },
        avg_verified_to_listing_days: { value: null, trend: null },
        avg_listing_to_first_visit_days: { value: null, trend: null },
        avg_verified_to_closure_days: { value: null, trend: null },
        need_info_rate: { value: null, trend: null },
        duplicate_rate: { value: null, trend: null },
        visit_no_show_rate: { value: null, trend: null },
      };
    }

    const windowLength = getTimeWindowLengthMs(args.time_window);
    const now = Date.now();

    // Fetch superset range covering both current and previous windows ONCE,
    // then split in memory. Cuts from ~10 table scans to 5.
    const supersetStart = windowLength === null ? null : now - 2 * windowLength;
    const supersetLeads = await getScopedLeads(ctx, {
      societyId: args.society_id,
      start: supersetStart,
      end: windowLength === null ? null : now,
      allowedSocietyIds,
    });

    // Early exit: if no leads in the superset window, skip 4 table scans entirely.
    if (supersetLeads.length === 0) {
      const zeroMetric: MetricWithTrend = { value: 0, trend: null };
      return {
        avg_submitted_to_verified_days: zeroMetric,
        avg_verified_to_listing_days: zeroMetric,
        avg_listing_to_first_visit_days: zeroMetric,
        avg_verified_to_closure_days: zeroMetric,
        need_info_rate: zeroMetric,
        duplicate_rate: zeroMetric,
        visit_no_show_rate: zeroMetric,
      };
    }

    const [allVerifications, allListings, allVisits, allConfirmedClosures] = await Promise.all([
      ctx.db.query("owner_verifications").collect(),
      ctx.db.query("listings").collect(),
      ctx.db.query("visits").collect(),
      ctx.db
        .query("closures")
        .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
        .collect(),
    ]);

    const currentStart = windowLength === null ? null : now - windowLength;
    const currentLeads =
      currentStart === null
        ? supersetLeads
        : supersetLeads.filter((lead) => lead._creationTime >= currentStart);

    const currentValues = computeOperationalFromPreloadedData(
      currentLeads,
      allVerifications,
      allListings,
      allVisits,
      allConfirmedClosures,
    );

    let previousValues: OperationalValues | null = null;
    if (windowLength !== null) {
      const previousEnd = now - windowLength;
      const previousLeads = supersetLeads.filter(
        (lead) => lead._creationTime >= now - 2 * windowLength && lead._creationTime < previousEnd,
      );
      previousValues = computeOperationalFromPreloadedData(
        previousLeads,
        allVerifications,
        allListings,
        allVisits,
        allConfirmedClosures,
      );
    }

    const withTrend = (key: keyof OperationalValues): MetricWithTrend => {
      const currentValue = currentValues[key];
      const previousValue = previousValues?.[key] ?? null;

      return {
        value: currentValue,
        trend: previousValues ? compareNumbers(currentValue, previousValue) : null,
      };
    };

    return {
      avg_submitted_to_verified_days: withTrend("avg_submitted_to_verified_days"),
      avg_verified_to_listing_days: withTrend("avg_verified_to_listing_days"),
      avg_listing_to_first_visit_days: withTrend("avg_listing_to_first_visit_days"),
      avg_verified_to_closure_days: withTrend("avg_verified_to_closure_days"),
      need_info_rate: withTrend("need_info_rate"),
      duplicate_rate: withTrend("duplicate_rate"),
      visit_no_show_rate: withTrend("visit_no_show_rate"),
    };
  },
});

export const getOpsSupersetGateMetrics = query({
  args: {
    time_window: timeWindowValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const cutoff = getTimeWindowCutoff(args.time_window);

    const [rolloutState, canaryUserIds, activeOpsUsers, activeGuardUsers, guardProfiles] =
      await Promise.all([
        resolveP44RolloutState(ctx),
        getSystemConfigStringArray(
          ctx,
          OPS_FIELD_WORKER_CANARY_USER_IDS_KEY,
          P44_DEFAULTS.OPS_FIELD_WORKER_CANARY_USER_IDS,
        ),
        ctx.db
          .query("users")
          .withIndex("by_type_and_status", (q) =>
            q.eq("user_type", USER_TYPE.OPS).eq("status", USER_STATUS.ACTIVE),
          )
          .collect(),
        ctx.db
          .query("users")
          .withIndex("by_type_and_status", (q) =>
            q.eq("user_type", USER_TYPE.GUARD).eq("status", USER_STATUS.ACTIVE),
          )
          .collect(),
        ctx.db.query("guard_profiles").collect(),
      ]);

    const hasGuardProfileByUserId = new Set<Id<"users">>(
      guardProfiles.map((guardProfile) => guardProfile.user_id),
    );

    const activeOpsWithProfileCount = activeOpsUsers.filter((user) =>
      hasGuardProfileByUserId.has(user._id),
    ).length;

    const activeOpsCount = activeOpsUsers.length;
    const profileCoveragePct =
      activeOpsCount === 0 ? 0 : roundTo2((activeOpsWithProfileCount / activeOpsCount) * 100);
    const profileCoveragePass = activeOpsCount > 0 && profileCoveragePct >= 95;

    const leads =
      cutoff === null
        ? await ctx.db.query("leads").collect()
        : await ctx.db
            .query("leads")
            .filter((q) => q.gte(q.field("_creationTime"), cutoff))
            .collect();

    const completedVisits = await ctx.db
      .query("visits")
      .withIndex("by_status", (q) => q.eq("status", VISIT_STATUS.COMPLETED))
      .collect();
    const scopedCompletedVisits = completedVisits.filter((visit) => {
      if (cutoff === null) {
        return true;
      }

      const eventTime = visit.completed_at ?? visit._creationTime;
      return eventTime >= cutoff;
    });

    const incentiveCards = await ctx.db.query("incentive_cards").collect();
    const scopedIncentiveCards = incentiveCards.filter((card) => {
      if (cutoff === null) {
        return true;
      }

      const eventTime = card.earned_at ?? card._creationTime;
      return eventTime >= cutoff;
    });

    const [leadAuditLogs, tenantInquiryAuditLogs, visitAuditLogs] = await Promise.all([
      ctx.db
        .query("audit_logs")
        .withIndex("by_entity_type", (q) => q.eq("entity_type", "leads"))
        .collect(),
      ctx.db
        .query("audit_logs")
        .withIndex("by_entity_type", (q) => q.eq("entity_type", "tenant_inquiries"))
        .collect(),
      ctx.db
        .query("audit_logs")
        .withIndex("by_entity_type", (q) => q.eq("entity_type", "visits"))
        .collect(),
    ]);

    const endpointAuditLogs = [
      ...leadAuditLogs,
      ...tenantInquiryAuditLogs,
      ...visitAuditLogs,
    ].filter((entry) => {
      if (!FIELD_WORKER_ENDPOINT_ENTITY_TYPES.has(entry.entity_type)) {
        return false;
      }

      return cutoff === null || entry._creationTime >= cutoff;
    });

    const candidateUserIds = new Set<Id<"users">>();

    for (const user of activeOpsUsers) {
      candidateUserIds.add(user._id);
    }

    for (const user of activeGuardUsers) {
      candidateUserIds.add(user._id);
    }

    for (const lead of leads) {
      candidateUserIds.add(lead.submitted_by_guard_id);
    }

    for (const visit of scopedCompletedVisits) {
      candidateUserIds.add(visit.assigned_guard_id);
    }

    for (const card of scopedIncentiveCards) {
      candidateUserIds.add(card.guard_user_id);
    }

    for (const entry of endpointAuditLogs) {
      if (entry.actor_user_id) {
        candidateUserIds.add(entry.actor_user_id);
      }
    }

    const users = await Promise.all([...candidateUserIds].map((userId) => ctx.db.get(userId)));
    const userTypeById = new Map<Id<"users">, Doc<"users">["user_type"]>();

    for (const user of users) {
      if (user) {
        userTypeById.set(user._id, user.user_type);
      }
    }

    let guardLeadSubmissions = 0;
    let opsLeadSubmissions = 0;
    let opsVerifiedLeads = 0;

    for (const lead of leads) {
      const submitterType = userTypeById.get(lead.submitted_by_guard_id);

      if (submitterType === USER_TYPE.GUARD) {
        guardLeadSubmissions += 1;
      } else if (submitterType === USER_TYPE.OPS) {
        opsLeadSubmissions += 1;

        if (lead.status === LEAD_STATUS.VERIFIED) {
          opsVerifiedLeads += 1;
        }
      }
    }

    let guardVisitCompletions = 0;
    let opsVisitCompletions = 0;

    for (const visit of scopedCompletedVisits) {
      const assigneeType = userTypeById.get(visit.assigned_guard_id);

      if (assigneeType === USER_TYPE.GUARD) {
        guardVisitCompletions += 1;
      } else if (assigneeType === USER_TYPE.OPS) {
        opsVisitCompletions += 1;
      }
    }

    let opsIncentiveCardsCount = 0;

    for (const card of scopedIncentiveCards) {
      const userType = userTypeById.get(card.guard_user_id);

      if (userType === USER_TYPE.OPS) {
        opsIncentiveCardsCount += 1;
      }
    }

    let opsEndpointEvents = 0;
    let opsEndpointErrors = 0;

    for (const entry of endpointAuditLogs) {
      if (!entry.actor_user_id) {
        continue;
      }

      const actorType = userTypeById.get(entry.actor_user_id);
      if (actorType !== USER_TYPE.OPS) {
        continue;
      }

      opsEndpointEvents += 1;

      if (isAuditLogFailure(entry)) {
        opsEndpointErrors += 1;
      }
    }

    const opsEndpointErrorRatePct =
      opsEndpointEvents === 0 ? null : roundTo2((opsEndpointErrors / opsEndpointEvents) * 100);
    const endpointErrorRatePass = opsEndpointErrorRatePct !== null && opsEndpointErrorRatePct < 1;

    const opsTriggerEventsCount = opsVerifiedLeads + opsVisitCompletions;
    const incentiveZeroCase = opsTriggerEventsCount > 0 && opsIncentiveCardsCount === 0;
    const incentiveMismatchCount =
      opsIncentiveCardsCount > opsTriggerEventsCount
        ? opsIncentiveCardsCount - opsTriggerEventsCount
        : 0;
    const incentiveSanityPass = !incentiveZeroCase && incentiveMismatchCount === 0;

    const backfillCompletionPct = profileCoveragePct;
    const backfillCompletionPass = profileCoveragePass;

    return {
      rollout_state: rolloutState,
      canary_user_count: new Set(canaryUserIds).size,
      generated_at: Date.now(),
      profile_coverage: {
        active_ops_count: activeOpsCount,
        active_ops_with_profile_count: activeOpsWithProfileCount,
        coverage_pct: profileCoveragePct,
        threshold_pct: 95,
        status: profileCoveragePass ? "pass" : "fail",
      },
      endpoint_error_rate: {
        ops_endpoint_events: opsEndpointEvents,
        ops_endpoint_errors: opsEndpointErrors,
        error_rate_pct: opsEndpointErrorRatePct,
        threshold_pct: 1,
        status: endpointErrorRatePass ? "pass" : "fail",
      },
      lead_submissions: {
        guard_count: guardLeadSubmissions,
        ops_count: opsLeadSubmissions,
      },
      visit_completions: {
        guard_count: guardVisitCompletions,
        ops_count: opsVisitCompletions,
      },
      incentive_sanity: {
        ops_trigger_events_count: opsTriggerEventsCount,
        ops_incentive_cards_count: opsIncentiveCardsCount,
        mismatch_count: incentiveMismatchCount,
        zero_case_alert: incentiveZeroCase,
        status: incentiveSanityPass ? "pass" : "fail",
      },
      backfill_completion: {
        completion_pct: backfillCompletionPct,
        threshold_pct: 95,
        status: backfillCompletionPass ? "pass" : "fail",
      },
      gate_status: {
        overall:
          profileCoveragePass &&
          endpointErrorRatePass &&
          incentiveSanityPass &&
          backfillCompletionPass
            ? "pass"
            : "fail",
        profile_coverage: profileCoveragePass ? "pass" : "fail",
        endpoint_error_rate: endpointErrorRatePass ? "pass" : "fail",
        incentive_sanity: incentiveSanityPass ? "pass" : "fail",
        backfill_completion: backfillCompletionPass ? "pass" : "fail",
      },
    };
  },
});

export const getCommissionTrends = query({
  args: { time_window_days: v.optional(v.number()) },
  handler: async (ctx, args): Promise<CommissionTrendsResponse> => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const period = normalizeTimeWindowDays(args.time_window_days);

    return {
      trends: [],
      period,
    };
  },
});

export const getAttributionFairness = query({
  args: { time_window_days: v.optional(v.number()) },
  handler: async (ctx, args): Promise<AttributionFairnessResponse> => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const period = normalizeTimeWindowDays(args.time_window_days);

    return {
      gini_coefficient: 0,
      sample_size: 0,
      period,
    };
  },
});

export const getGamificationEngagement = query({
  args: { time_window_days: v.optional(v.number()) },
  handler: async (ctx, args): Promise<GamificationEngagementResponse> => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const period = normalizeTimeWindowDays(args.time_window_days);

    return {
      active_users: 0,
      quest_completion_rate: 0,
      avg_streak_days: 0,
      tier_distribution: {},
      period,
    };
  },
});

export const getModifierEffectiveness = query({
  args: { time_window_days: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ModifierEffectivenessResponse> => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const period = normalizeTimeWindowDays(args.time_window_days);

    return {
      modifiers: [],
      period,
    };
  },
});

export const getShadowModeDelta = query({
  args: {
    time_window_days: v.optional(v.number()),
    entity_type: v.optional(shadowEntityTypeValidator),
    persona: v.optional(incentivePersonaValidator),
    from_timestamp: v.optional(v.number()),
    to_timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ShadowModeDeltaResponse> => {
    await requirePermission(ctx, "shadow_mode.view");

    if (
      args.from_timestamp !== undefined &&
      args.to_timestamp !== undefined &&
      args.from_timestamp > args.to_timestamp
    ) {
      throw new Error("from_timestamp must be less than or equal to to_timestamp");
    }

    const period = normalizeTimeWindowDays(args.time_window_days);
    const defaultFromTimestamp = Date.now() - period * DAY_MS;
    const fromTimestamp = args.from_timestamp ?? defaultFromTimestamp;
    const toTimestamp = args.to_timestamp;
    const entityTypes = args.entity_type ? [args.entity_type] : SHADOW_ENTITY_TYPES;

    const deltasByEntity = await Promise.all(
      entityTypes.map((entityType) =>
        getShadowDeltasByEntityType(ctx, {
          entityType,
          persona: args.persona,
          fromTimestamp,
          toTimestamp,
        }),
      ),
    );

    const deltas = deltasByEntity.flat().sort((a, b) => b.created_at - a.created_at);

    return {
      total_deltas: deltas.length,
      deltas,
      period,
    };
  },
});

export const getPersonaEarnings = query({
  args: {
    persona: v.optional(incentivePersonaValidator),
    time_window_days: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PersonaEarningsResponse> => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    const period = normalizeTimeWindowDays(args.time_window_days);

    return {
      earnings: [],
      persona: args.persona ?? INCENTIVE_PERSONA.ALL,
      period,
    };
  },
});

export const computeDailySnapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { snapshotDate, startMs, endMs } = getPreviousISTDayRange();

    const [activeGuardUsers, activeOpsUsers, activeSocieties, dayLeads] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_type_and_status", (q) =>
          q.eq("user_type", USER_TYPE.GUARD).eq("status", USER_STATUS.ACTIVE),
        )
        .collect(),
      ctx.db
        .query("users")
        .withIndex("by_type_and_status", (q) =>
          q.eq("user_type", USER_TYPE.OPS).eq("status", USER_STATUS.ACTIVE),
        )
        .collect(),
      ctx.db
        .query("societies")
        .withIndex("by_status", (q) => q.eq("status", SOCIETY_STATUS.ACTIVE))
        .collect(),
      ctx.db
        .query("leads")
        .filter((q) =>
          q.and(q.gte(q.field("_creationTime"), startMs), q.lt(q.field("_creationTime"), endMs)),
        )
        .collect(),
    ]);

    const allDayClosures = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
      .collect();
    const dayConfirmedClosures = allDayClosures.filter((closure) => {
      const eventTime = closure.confirmed_at ?? closure._creationTime;
      return eventTime >= startMs && eventTime < endMs;
    });

    const dayDisbursedPayouts = await ctx.db
      .query("payouts")
      .withIndex("by_status", (q) => q.eq("status", PAYOUT_STATUS.DISBURSED))
      .filter((q) =>
        q.and(q.gte(q.field("disbursed_at"), startMs), q.lt(q.field("disbursed_at"), endMs)),
      )
      .collect();

    const totalPayoutPaise = dayDisbursedPayouts.reduce(
      (sum, payout) => sum + payout.amount_paise,
      0,
    );

    const summaryData = {
      total_leads_submitted: dayLeads.length,
      verified_count: dayLeads.filter((lead) => lead.status === LEAD_STATUS.VERIFIED).length,
      rejected_count: dayLeads.filter((lead) => lead.status === LEAD_STATUS.REJECTED).length,
      closure_count: dayConfirmedClosures.length,
      total_payout_paise: totalPayoutPaise,
      guard_count: activeGuardUsers.length,
      ops_count: activeOpsUsers.length,
      total_field_worker_count: activeGuardUsers.length + activeOpsUsers.length,
      active_guards: activeGuardUsers.length,
      active_ops: activeOpsUsers.length,
      active_societies: activeSocieties.length,
    };

    const existingSummary = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_type_and_date", (q) =>
        q.eq("snapshot_type", "daily_summary").eq("snapshot_date", snapshotDate),
      )
      .first();

    if (existingSummary) {
      await ctx.db.patch(existingSummary._id, {
        data: summaryData,
      });
    } else {
      await ctx.db.insert("analytics_snapshots", {
        snapshot_type: "daily_summary",
        snapshot_date: snapshotDate,
        data: summaryData,
      });
    }

    const leadsBySociety = new Map<Id<"societies">, number>();
    const verifiedBySociety = new Map<Id<"societies">, number>();

    for (const lead of dayLeads) {
      leadsBySociety.set(lead.society_id, (leadsBySociety.get(lead.society_id) ?? 0) + 1);

      if (lead.status === LEAD_STATUS.VERIFIED) {
        verifiedBySociety.set(lead.society_id, (verifiedBySociety.get(lead.society_id) ?? 0) + 1);
      }
    }

    const closureLeadMap = await getLeadMap(
      ctx,
      dayConfirmedClosures.map((closure) => closure.lead_id),
    );
    const closuresBySociety = new Map<Id<"societies">, number>();
    for (const closure of dayConfirmedClosures) {
      const lead = closureLeadMap.get(closure.lead_id);
      if (!lead) {
        continue;
      }

      closuresBySociety.set(lead.society_id, (closuresBySociety.get(lead.society_id) ?? 0) + 1);
    }

    const existingSocietySnapshots = await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_type_and_date", (q) =>
        q.eq("snapshot_type", "society_stats").eq("snapshot_date", snapshotDate),
      )
      .collect();

    const snapshotBySocietyId = new Map<string, Doc<"analytics_snapshots">>();
    for (const snapshot of existingSocietySnapshots) {
      const record = asRecord(snapshot.data);
      const societyId = typeof record?.society_id === "string" ? record.society_id : null;
      if (societyId) {
        snapshotBySocietyId.set(societyId, snapshot);
      }
    }

    for (const society of activeSocieties) {
      const societyData = {
        society_id: society._id,
        leads_submitted: leadsBySociety.get(society._id) ?? 0,
        verified_count: verifiedBySociety.get(society._id) ?? 0,
        closures_count: closuresBySociety.get(society._id) ?? 0,
      };

      const existingSnapshot = snapshotBySocietyId.get(society._id);
      if (existingSnapshot) {
        await ctx.db.patch(existingSnapshot._id, {
          data: societyData,
        });
      } else {
        await ctx.db.insert("analytics_snapshots", {
          snapshot_type: "society_stats",
          snapshot_date: snapshotDate,
          data: societyData,
        });
      }
    }

    return {
      snapshot_date: snapshotDate,
      summary: summaryData,
      societies_processed: activeSocieties.length,
    };
  },
});
