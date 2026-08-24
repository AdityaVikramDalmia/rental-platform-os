import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  CLOSURE_STATUS,
  CONFIG_VERSION_STATUS,
  INCENTIVE_PERSONA,
  MODIFIER_LINK_MODE,
  MODIFIER_REWARD_MODE,
  PERMISSIONS,
  USER_TYPE,
} from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ON_TIME_VISIT_WINDOW_MS = 15 * 60 * 1000;
const DOC_SLA_HOURS = 48;
const LEAD_RESPONSE_SPEED_LOOKBACK_LIMIT = 50;

type FunctionCtx = QueryCtx | MutationCtx;

type MetricComputation = {
  value: number;
  limited_data: boolean;
  sample_size: number;
};

type CommissionConfigModifier = {
  template_id: Id<"commission_modifier_templates">;
  template_name: string;
  persona: Doc<"deal_commission_evaluations">["persona"];
  reward_mode: "BPS" | "FLAT_PAISE";
  rule_type: "threshold_step" | "linear_band" | "penalty_step";
  metric_key: string;
  link_mode: "INDIVIDUAL" | "AND_GROUP" | "OR_GROUP";
  link_group_id: string | undefined;
  operator: string;
  threshold: number;
  threshold_upper: number | undefined;
  delta_value: number;
  cap_value: number | undefined;
  slope_per_unit: number;
  window_days: number;
};

type RuntimeCommissionConfig = {
  base_rate_bps: number;
  min_rate_bps: number;
  max_rate_bps: number;
  modifiers: CommissionConfigModifier[];
};

type ModifierEvaluation = {
  template_id: Id<"commission_modifier_templates">;
  template_name: string;
  reward_mode: "BPS" | "FLAT_PAISE";
  link_mode: "INDIVIDUAL" | "AND_GROUP" | "OR_GROUP";
  link_group_id: string | undefined;
  passed: boolean;
  delta_bps: number | undefined;
  delta_paise: number | undefined;
  metric_value: number;
  limited_data: boolean;
};

type EvaluationComputationResult = {
  closure: Doc<"closures">;
  lead: Doc<"leads">;
  actor_user: Doc<"users">;
  persona: Doc<"deal_commission_evaluations">["persona"];
  config_version: string;
  config_snapshot: string;
  base_rate_bps: number;
  effective_rate_bps: number;
  flat_bonus_paise: number;
  commission_base_profit_paise: number;
  incentive_pool_paise: number;
  modifier_breakdown: ModifierEvaluation[];
};

type SimulationComparison = {
  closure_id: Id<"closures">;
  primary_actor_user_id: Id<"users">;
  persona: Doc<"deal_commission_evaluations">["persona"];
  config_version: string;
  v3_effective_rate_bps: number;
  v3_pool_paise: number;
  v2_payout_paise: number | undefined;
  delta_paise: number | undefined;
  delta_percent: number | undefined;
  modifier_breakdown: ModifierEvaluation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function readString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseRuleConfig(rawModifier: Record<string, unknown>): Record<string, unknown> {
  const rawRuleConfig = rawModifier.rule_config_json;

  if (typeof rawRuleConfig === "string") {
    try {
      const parsed = JSON.parse(rawRuleConfig) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  if (isRecord(rawRuleConfig)) {
    return rawRuleConfig;
  }

  return {};
}

function getModifierField(
  rawModifier: Record<string, unknown>,
  ruleConfig: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(rawModifier, key)) {
      return rawModifier[key];
    }
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(ruleConfig, key)) {
      return ruleConfig[key];
    }
  }

  return undefined;
}

function hasModifierField(
  rawModifier: Record<string, unknown>,
  ruleConfig: Record<string, unknown>,
  key: string,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(rawModifier, key) ||
    Object.prototype.hasOwnProperty.call(ruleConfig, key)
  );
}

function parseModifier(rawModifier: unknown): CommissionConfigModifier | null {
  if (!isRecord(rawModifier)) {
    return null;
  }

  if (rawModifier.enabled === false) {
    return null;
  }

  const rawTemplateId = getModifierField(rawModifier, {}, ["template_id", "id"]);

  if (typeof rawTemplateId !== "string" || rawTemplateId.trim().length === 0) {
    return null;
  }

  const ruleConfig = parseRuleConfig(rawModifier);
  const templateName = readString(
    getModifierField(rawModifier, ruleConfig, ["template_name", "name", "display_name", "code"]),
    "Modifier",
  );
  const rewardModeCandidate = readString(
    getModifierField(rawModifier, ruleConfig, ["reward_mode"]),
    MODIFIER_REWARD_MODE.BPS,
  );
  const rewardMode =
    rewardModeCandidate === MODIFIER_REWARD_MODE.FLAT_PAISE
      ? MODIFIER_REWARD_MODE.FLAT_PAISE
      : MODIFIER_REWARD_MODE.BPS;
  const ruleType = readString(
    getModifierField(rawModifier, ruleConfig, ["rule_type"]),
    "threshold_step",
  );

  if (ruleType !== "threshold_step" && ruleType !== "linear_band" && ruleType !== "penalty_step") {
    return null;
  }

  const metricKey = readString(
    getModifierField(rawModifier, ruleConfig, ["metric_key", "metric_source", "metric"]),
    "unknown_metric",
  );
  const linkModeCandidate = readString(
    getModifierField(rawModifier, ruleConfig, ["link_mode"]),
    MODIFIER_LINK_MODE.INDIVIDUAL,
  );
  const linkMode =
    linkModeCandidate === MODIFIER_LINK_MODE.AND_GROUP ||
    linkModeCandidate === MODIFIER_LINK_MODE.OR_GROUP
      ? linkModeCandidate
      : MODIFIER_LINK_MODE.INDIVIDUAL;
  const linkGroupIdRaw = getModifierField(rawModifier, ruleConfig, ["link_group_id"]);
  const linkGroupId =
    typeof linkGroupIdRaw === "string" && linkGroupIdRaw.trim().length > 0
      ? linkGroupIdRaw.trim()
      : undefined;
  const hasDeltaValue = hasModifierField(rawModifier, ruleConfig, "delta_value");
  const hasDeltaBps = hasModifierField(rawModifier, ruleConfig, "delta_bps");
  const hasDeltaPaise = hasModifierField(rawModifier, ruleConfig, "delta_paise");
  const usesDeltaFields = ruleType === "threshold_step" || ruleType === "penalty_step";

  if (
    usesDeltaFields &&
    rewardMode === MODIFIER_REWARD_MODE.BPS &&
    hasDeltaPaise &&
    !hasDeltaValue &&
    !hasDeltaBps
  ) {
    console.warn("Skipping BPS modifier with only delta_paise configured", {
      template_id: rawTemplateId,
      template_name: templateName,
      reward_mode: rewardMode,
    });
    return null;
  }

  if (
    usesDeltaFields &&
    rewardMode === MODIFIER_REWARD_MODE.FLAT_PAISE &&
    hasDeltaBps &&
    !hasDeltaValue &&
    !hasDeltaPaise
  ) {
    console.warn("Skipping FLAT_PAISE modifier with only delta_bps configured", {
      template_id: rawTemplateId,
      template_name: templateName,
      reward_mode: rewardMode,
    });
    return null;
  }

  const deltaValue =
    rewardMode === MODIFIER_REWARD_MODE.BPS
      ? readNumber(getModifierField(rawModifier, ruleConfig, ["delta_bps", "delta_value"]), 0)
      : readNumber(getModifierField(rawModifier, ruleConfig, ["delta_paise", "delta_value"]), 0);

  return {
    template_id: rawTemplateId as Id<"commission_modifier_templates">,
    template_name: templateName,
    persona: (() => {
      const personaCandidate = readString(
        getModifierField(rawModifier, ruleConfig, ["persona"]),
        INCENTIVE_PERSONA.ALL,
      );

      if (
        personaCandidate === INCENTIVE_PERSONA.GUARD ||
        personaCandidate === INCENTIVE_PERSONA.OPS ||
        personaCandidate === INCENTIVE_PERSONA.SALES ||
        personaCandidate === INCENTIVE_PERSONA.RM ||
        personaCandidate === INCENTIVE_PERSONA.LIAISON ||
        personaCandidate === INCENTIVE_PERSONA.ALL
      ) {
        return personaCandidate;
      }

      return INCENTIVE_PERSONA.ALL;
    })(),
    reward_mode: rewardMode,
    rule_type: ruleType,
    metric_key: metricKey,
    link_mode: linkMode,
    link_group_id: linkGroupId,
    operator: readString(getModifierField(rawModifier, ruleConfig, ["operator"]), ">="),
    threshold: readNumber(getModifierField(rawModifier, ruleConfig, ["threshold"]), 0),
    threshold_upper: (() => {
      const value = getModifierField(rawModifier, ruleConfig, [
        "threshold_upper",
        "max",
        "upper_bound",
      ]);
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    })(),
    delta_value: deltaValue,
    cap_value: (() => {
      const value = getModifierField(rawModifier, ruleConfig, ["cap_value", "cap"]);
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    })(),
    slope_per_unit: readNumber(getModifierField(rawModifier, ruleConfig, ["slope_per_unit"]), 0),
    window_days: Math.max(
      1,
      Math.floor(readNumber(getModifierField(rawModifier, ruleConfig, ["window_days"]), 30)),
    ),
  };
}

function parseRuntimeConfig(configJson: string): RuntimeCommissionConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(configJson) as unknown;
  } catch {
    throw new Error("Invalid commission config JSON");
  }

  const configRoot = isRecord(parsed) ? parsed : {};
  const commissionConfig = isRecord(configRoot.commission) ? configRoot.commission : configRoot;

  const rawModifiers = Array.isArray(commissionConfig.modifiers) ? commissionConfig.modifiers : [];
  const modifiers = rawModifiers
    .map((modifier) => parseModifier(modifier))
    .filter((modifier): modifier is CommissionConfigModifier => modifier !== null);

  let minRateBps = Math.floor(readNumber(commissionConfig.min_rate_bps, 1500));
  let maxRateBps = Math.floor(readNumber(commissionConfig.max_rate_bps, 2200));

  if (minRateBps > maxRateBps) {
    console.warn("Commission config has inverted rate bounds; swapping values", {
      min_rate_bps: minRateBps,
      max_rate_bps: maxRateBps,
    });
    [minRateBps, maxRateBps] = [maxRateBps, minRateBps];
  }

  return {
    base_rate_bps: Math.floor(readNumber(commissionConfig.base_rate_bps, 1500)),
    min_rate_bps: minRateBps,
    max_rate_bps: maxRateBps,
    modifiers,
  };
}

async function assertValidModifierTemplateIds(
  ctx: FunctionCtx,
  modifiers: CommissionConfigModifier[],
): Promise<void> {
  const templateIds = Array.from(new Set(modifiers.map((modifier) => modifier.template_id)));

  const checks = await Promise.all(
    templateIds.map(async (templateId) => {
      try {
        const template = await ctx.db.get(templateId);
        return {
          template_id: templateId,
          invalid_format: false,
          missing: template === null,
        };
      } catch {
        return {
          template_id: templateId,
          invalid_format: true,
          missing: false,
        };
      }
    }),
  );

  const invalidFormatIds = checks
    .filter((check) => check.invalid_format)
    .map((check) => `${check.template_id}`);
  if (invalidFormatIds.length > 0) {
    throw new Error(
      `Invalid commission modifier template_id value(s): ${invalidFormatIds.join(", ")}`,
    );
  }

  const missingTemplateIds = checks
    .filter((check) => check.missing)
    .map((check) => `${check.template_id}`);
  if (missingTemplateIds.length > 0) {
    throw new Error(
      `Commission config references unknown modifier template_id(s): ${missingTemplateIds.join(", ")}`,
    );
  }
}

function compareWithOperator(
  metricValue: number,
  operator: string,
  threshold: number,
  thresholdUpper: number | undefined,
): boolean {
  switch (operator) {
    case "<":
      return metricValue < threshold;
    case "<=":
      return metricValue <= threshold;
    case ">":
      return metricValue > threshold;
    case ">=":
      return metricValue >= threshold;
    case "=":
    case "==":
      return metricValue === threshold;
    case "!=":
      return metricValue !== threshold;
    case "between_inclusive":
      return (
        thresholdUpper !== undefined && metricValue >= threshold && metricValue <= thresholdUpper
      );
    case "between_exclusive":
      return (
        thresholdUpper !== undefined && metricValue > threshold && metricValue < thresholdUpper
      );
    default:
      return metricValue >= threshold;
  }
}

function evaluateModifierRule(
  modifier: CommissionConfigModifier,
  metricValue: number,
): {
  passed: boolean;
  delta_bps: number | undefined;
  delta_paise: number | undefined;
} {
  if (modifier.rule_type === "linear_band") {
    const lower = modifier.threshold;
    const upper = modifier.threshold_upper ?? modifier.threshold;

    if (upper <= lower || modifier.slope_per_unit === 0) {
      return {
        passed: false,
        delta_bps: undefined,
        delta_paise: undefined,
      };
    }

    const boundedMetric = clamp(metricValue, lower, upper);
    const rawDelta = (boundedMetric - lower) * modifier.slope_per_unit;
    const cappedDelta =
      modifier.cap_value !== undefined
        ? clamp(rawDelta, -Math.abs(modifier.cap_value), Math.abs(modifier.cap_value))
        : rawDelta;

    if (cappedDelta === 0) {
      return {
        passed: false,
        delta_bps: undefined,
        delta_paise: undefined,
      };
    }

    if (modifier.reward_mode === MODIFIER_REWARD_MODE.BPS) {
      return {
        passed: true,
        delta_bps: cappedDelta,
        delta_paise: undefined,
      };
    }

    return {
      passed: true,
      delta_bps: undefined,
      delta_paise: Math.floor(cappedDelta),
    };
  }

  const passedThreshold = compareWithOperator(
    metricValue,
    modifier.operator,
    modifier.threshold,
    modifier.threshold_upper,
  );

  if (!passedThreshold) {
    return {
      passed: false,
      delta_bps: undefined,
      delta_paise: undefined,
    };
  }

  let deltaValue = modifier.delta_value;
  if (modifier.rule_type === "penalty_step") {
    deltaValue = -Math.abs(deltaValue);
  }

  if (modifier.reward_mode === MODIFIER_REWARD_MODE.BPS) {
    return {
      passed: true,
      delta_bps: deltaValue,
      delta_paise: undefined,
    };
  }

  return {
    passed: true,
    delta_bps: undefined,
    delta_paise: Math.floor(deltaValue),
  };
}

function getPersonaFromUser(user: Doc<"users">): Doc<"deal_commission_evaluations">["persona"] {
  if (user.user_type === USER_TYPE.OPS) {
    return INCENTIVE_PERSONA.OPS;
  }

  if (user.user_type === USER_TYPE.GUARD) {
    return INCENTIVE_PERSONA.GUARD;
  }

  if (user.user_type === USER_TYPE.OWNER) {
    return INCENTIVE_PERSONA.RM;
  }

  if (user.user_type === USER_TYPE.TENANT) {
    return INCENTIVE_PERSONA.SALES;
  }

  return INCENTIVE_PERSONA.ALL;
}

function deriveProfitPaise(closure: Doc<"closures">): number {
  const brokerageTotal = (closure.brokerage_owner_side ?? 0) + (closure.brokerage_tenant_side ?? 0);
  const profit = closure.commission_amount ?? brokerageTotal;
  return Math.max(0, Math.floor(profit));
}

async function getActiveConfigVersion(
  ctx: FunctionCtx,
  configVersionId: Id<"incentive_config_versions"> | undefined,
  requireExplicitActive: boolean,
): Promise<Doc<"incentive_config_versions">> {
  if (configVersionId) {
    const byId = await ctx.db.get(configVersionId);
    if (!byId) {
      throw new Error("Config version not found");
    }

    if (requireExplicitActive && byId.status !== CONFIG_VERSION_STATUS.ACTIVE) {
      throw new Error(
        `Cannot evaluate with non-ACTIVE config version (status: ${byId.status}). Use simulation endpoint for draft/archived configs.`,
      );
    }

    return byId;
  }

  const active = await ctx.db
    .query("incentive_config_versions")
    .withIndex("by_status", (q) => q.eq("status", CONFIG_VERSION_STATUS.ACTIVE))
    .order("desc")
    .first();

  if (!active) {
    throw new Error("No ACTIVE incentive config version found");
  }

  return active;
}

async function getActiveActorProfile(
  ctx: FunctionCtx,
  userId: Id<"users">,
): Promise<Doc<"incentive_actor_profiles"> | null> {
  const now = Date.now();
  const profiles = await ctx.db
    .query("incentive_actor_profiles")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .filter((q) => q.eq(q.field("is_active"), true))
    .filter((q) => q.lte(q.field("effective_from"), now))
    .filter((q) =>
      q.or(q.eq(q.field("effective_to"), undefined), q.gte(q.field("effective_to"), now)),
    )
    .collect();

  if (profiles.length === 0) {
    return null;
  }

  return profiles.reduce((latest, candidate) => {
    if (candidate.effective_from !== latest.effective_from) {
      return candidate.effective_from > latest.effective_from ? candidate : latest;
    }

    return candidate._creationTime > latest._creationTime ? candidate : latest;
  });
}

async function computeAvgDocProcessingHours(
  ctx: FunctionCtx,
  userId: Id<"users">,
  windowDays: number,
  closureId: Id<"closures"> | undefined,
): Promise<MetricComputation> {
  const cutoff = Date.now() - windowDays * DAY_MS;

  const requirements = closureId
    ? await ctx.db
        .query("document_requirements")
        .withIndex("by_closure_id", (q) => q.eq("closure_id", closureId))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect()
    : await ctx.db
        .query("document_requirements")
        .withIndex("by_assigned_to", (q) => q.eq("assigned_to", userId))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .filter((q) => q.gte(q.field("_creationTime"), cutoff))
        .collect();

  const durations: number[] = [];

  for (const requirement of requirements) {
    for (const item of requirement.items) {
      if (item.collected_at === undefined) {
        continue;
      }

      const durationHours = (item.collected_at - requirement._creationTime) / HOUR_MS;
      if (durationHours >= 0) {
        durations.push(durationHours);
      }
    }
  }

  if (durations.length === 0) {
    return { value: 0, limited_data: true, sample_size: 0 };
  }

  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    value: total / durations.length,
    limited_data: durations.length < 3,
    sample_size: durations.length,
  };
}

async function computeOnTimeVisitRate(
  ctx: FunctionCtx,
  userId: Id<"users">,
  windowDays: number,
): Promise<MetricComputation> {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const visits = await ctx.db
    .query("visits")
    .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", userId))
    .filter((q) => q.gte(q.field("_creationTime"), cutoff))
    .collect();

  const completedVisits = visits.filter((visit) => visit.status === "COMPLETED");
  if (completedVisits.length === 0) {
    return { value: 0, limited_data: true, sample_size: 0 };
  }

  const onTimeCount = completedVisits.filter((visit) => {
    if (visit.started_at === undefined) {
      return false;
    }

    return visit.started_at <= visit.scheduled_start + ON_TIME_VISIT_WINDOW_MS;
  }).length;

  return {
    value: (onTimeCount / completedVisits.length) * 100,
    limited_data: completedVisits.length < 3,
    sample_size: completedVisits.length,
  };
}

async function computeAvgChecklistScore(
  ctx: FunctionCtx,
  userId: Id<"users">,
  windowDays: number,
): Promise<MetricComputation> {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const instances = await ctx.db
    .query("checklist_instances")
    .withIndex("by_assigned_to", (q) => q.eq("assigned_to", userId))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .filter((q) => q.gte(q.field("_creationTime"), cutoff))
    .collect();

  const scoredInstances = instances.filter(
    (instance) => instance.status === "SUBMITTED" || instance.status === "APPROVED",
  );

  if (scoredInstances.length === 0) {
    return { value: 0, limited_data: true, sample_size: 0 };
  }

  const total = scoredInstances.reduce((sum, instance) => sum + instance.completeness_score, 0);
  return {
    value: total / scoredInstances.length,
    limited_data: scoredInstances.length < 3,
    sample_size: scoredInstances.length,
  };
}

async function computeLeadResponseSpeedHours(
  ctx: FunctionCtx,
  userId: Id<"users">,
  windowDays: number,
): Promise<MetricComputation> {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const leads = await ctx.db
    .query("leads")
    .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", userId))
    .filter((q) => q.gte(q.field("_creationTime"), cutoff))
    .order("desc")
    .take(LEAD_RESPONSE_SPEED_LOOKBACK_LIMIT);

  const firstUpdates = await Promise.all(
    leads.map((lead) =>
      ctx.db
        .query("audit_logs")
        .withIndex("by_entity", (q) => q.eq("entity_type", "leads").eq("entity_id", `${lead._id}`))
        .filter((q) => q.eq(q.field("action"), "LEADS_UPDATE"))
        .order("asc")
        .first(),
    ),
  );

  const leadResponseDurations: number[] = [];

  for (let i = 0; i < leads.length; i++) {
    const firstUpdate = firstUpdates[i];
    if (!firstUpdate) continue;

    const responseHours = (firstUpdate._creationTime - leads[i]._creationTime) / HOUR_MS;
    if (responseHours >= 0) {
      leadResponseDurations.push(responseHours);
    }
  }

  if (leadResponseDurations.length === 0) {
    return { value: 0, limited_data: true, sample_size: 0 };
  }

  const total = leadResponseDurations.reduce((sum, value) => sum + value, 0);
  return {
    value: total / leadResponseDurations.length,
    limited_data: leadResponseDurations.length < 3,
    sample_size: leadResponseDurations.length,
  };
}

async function computeCompletionRate(
  ctx: FunctionCtx,
  userId: Id<"users">,
  windowDays: number,
): Promise<MetricComputation> {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const visits = await ctx.db
    .query("visits")
    .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", userId))
    .filter((q) => q.gte(q.field("_creationTime"), cutoff))
    .collect();

  if (visits.length === 0) {
    return { value: 0, limited_data: true, sample_size: 0 };
  }

  const completedCount = visits.filter((visit) => visit.status === "COMPLETED").length;

  return {
    value: (completedCount / visits.length) * 100,
    limited_data: visits.length < 3,
    sample_size: visits.length,
  };
}

async function computePenaltyCount(
  ctx: FunctionCtx,
  userId: Id<"users">,
  windowDays: number,
): Promise<MetricComputation> {
  const cutoff = Date.now() - windowDays * DAY_MS;

  const [noShowVisits, payoutAdjustments] = await Promise.all([
    ctx.db
      .query("visits")
      .withIndex("by_guard_and_status", (q) =>
        q.eq("assigned_guard_id", userId).eq("status", "NO_SHOW"),
      )
      .filter((q) => q.gte(q.field("_creationTime"), cutoff))
      .collect(),
    ctx.db
      .query("payout_adjustments")
      .withIndex("by_guard", (q) => q.eq("guard_user_id", userId))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .filter((q) => q.gte(q.field("_creationTime"), cutoff))
      .collect(),
  ]);

  const penaltyAdjustments = payoutAdjustments.filter(
    (adjustment) => adjustment.penalty_total_paise > 0,
  );
  const penaltyCount = noShowVisits.length + penaltyAdjustments.length;

  return {
    value: penaltyCount,
    limited_data: noShowVisits.length + payoutAdjustments.length < 3,
    sample_size: noShowVisits.length + payoutAdjustments.length,
  };
}

async function computeDocCompletionRate(
  ctx: FunctionCtx,
  closureId: Id<"closures">,
): Promise<MetricComputation> {
  const requirements = await ctx.db
    .query("document_requirements")
    .withIndex("by_closure_id", (q) => q.eq("closure_id", closureId))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  if (requirements.length === 0) {
    return { value: 0, limited_data: true, sample_size: 0 };
  }

  let requiredTotal = 0;
  let requiredCompleted = 0;

  for (const requirement of requirements) {
    for (const item of requirement.items) {
      if (!item.is_required) {
        continue;
      }

      requiredTotal += 1;
      if (item.status === "COLLECTED" || item.status === "VERIFIED") {
        requiredCompleted += 1;
      }
    }
  }

  if (requiredTotal === 0) {
    return { value: 0, limited_data: true, sample_size: 0 };
  }

  return {
    value: (requiredCompleted / requiredTotal) * 100,
    limited_data: requiredTotal < 3,
    sample_size: requiredTotal,
  };
}

async function computeLateDocRate(
  ctx: FunctionCtx,
  userId: Id<"users">,
  windowDays: number,
): Promise<MetricComputation> {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const requirements = await ctx.db
    .query("document_requirements")
    .withIndex("by_assigned_to", (q) => q.eq("assigned_to", userId))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .filter((q) => q.gte(q.field("_creationTime"), cutoff))
    .collect();

  let totalCollected = 0;
  let lateCollected = 0;

  for (const requirement of requirements) {
    for (const item of requirement.items) {
      if (item.collected_at === undefined) {
        continue;
      }

      totalCollected += 1;
      const processingHours = (item.collected_at - requirement._creationTime) / HOUR_MS;
      if (processingHours > DOC_SLA_HOURS) {
        lateCollected += 1;
      }
    }
  }

  if (totalCollected === 0) {
    return { value: 0, limited_data: true, sample_size: 0 };
  }

  return {
    value: (lateCollected / totalCollected) * 100,
    limited_data: totalCollected < 3,
    sample_size: totalCollected,
  };
}

async function computeMetric(
  ctx: FunctionCtx,
  userId: Id<"users">,
  metricKey: string,
  windowDays: number,
  closureId: Id<"closures"> | undefined,
): Promise<MetricComputation> {
  switch (metricKey) {
    case "avg_doc_processing_hours":
      return await computeAvgDocProcessingHours(ctx, userId, windowDays, closureId);
    case "on_time_visit_rate":
    case "on_time_visit_rate_pct":
      return await computeOnTimeVisitRate(ctx, userId, windowDays);
    case "avg_checklist_score":
      return await computeAvgChecklistScore(ctx, userId, windowDays);
    case "response_speed_hours":
    case "avg_lead_response_hours":
      return await computeLeadResponseSpeedHours(ctx, userId, windowDays);
    case "completion_rate":
      return await computeCompletionRate(ctx, userId, windowDays);
    case "penalty_count":
    case "no_show_count_30d":
      return await computePenaltyCount(ctx, userId, windowDays);
    case "doc_completion_rate_pct":
      if (closureId === undefined) {
        return { value: 0, limited_data: true, sample_size: 0 };
      }

      return await computeDocCompletionRate(ctx, closureId);
    case "late_doc_rate_pct":
      return await computeLateDocRate(ctx, userId, windowDays);
    case "customer_satisfaction_avg":
      return { value: 0, limited_data: true, sample_size: 0 };
    default:
      return { value: 0, limited_data: true, sample_size: 0 };
  }
}

function applyModifierComposition(evaluatedModifiers: ModifierEvaluation[]): ModifierEvaluation[] {
  const individualModifiers: ModifierEvaluation[] = [];
  const groupedModifiers = new Map<string, ModifierEvaluation[]>();

  for (const modifier of evaluatedModifiers) {
    if (modifier.link_mode === MODIFIER_LINK_MODE.INDIVIDUAL) {
      individualModifiers.push(modifier);
      continue;
    }

    if (modifier.link_group_id === undefined) {
      console.warn("Skipping grouped commission modifier without link_group_id", {
        template_id: modifier.template_id,
        template_name: modifier.template_name,
        link_mode: modifier.link_mode,
      });
      continue;
    }

    const key = `${modifier.link_mode}:${modifier.link_group_id}`;
    const existing = groupedModifiers.get(key) ?? [];
    existing.push(modifier);
    groupedModifiers.set(key, existing);
  }

  const adjusted: ModifierEvaluation[] = [...individualModifiers];

  for (const modifiers of groupedModifiers.values()) {
    const mode = modifiers[0]?.link_mode;

    if (mode === MODIFIER_LINK_MODE.AND_GROUP) {
      const allPassed = modifiers.every((modifier) => modifier.passed);
      adjusted.push(
        ...modifiers.map((modifier) => ({
          ...modifier,
          passed: allPassed && modifier.passed,
          delta_bps: allPassed ? modifier.delta_bps : undefined,
          delta_paise: allPassed ? modifier.delta_paise : undefined,
        })),
      );
      continue;
    }

    adjusted.push(...modifiers);
  }

  return adjusted;
}

async function buildEvaluation(
  ctx: FunctionCtx,
  args: {
    closure_id: Id<"closures">;
    config_version_id: Id<"incentive_config_versions"> | undefined;
    require_active_config_version: boolean;
  },
): Promise<EvaluationComputationResult> {
  const [closure, configVersion] = await Promise.all([
    ctx.db.get(args.closure_id),
    getActiveConfigVersion(ctx, args.config_version_id, args.require_active_config_version),
  ]);

  if (!closure) {
    throw new Error("Closure not found");
  }

  const lead = await ctx.db.get(closure.lead_id);
  if (!lead) {
    throw new Error("Lead not found for closure");
  }

  const actorUser = await ctx.db.get(lead.submitted_by_guard_id);
  if (!actorUser) {
    throw new Error("Primary actor not found for closure lead");
  }

  const actorProfile = await getActiveActorProfile(ctx, actorUser._id);
  const persona = actorProfile?.persona ?? getPersonaFromUser(actorUser);

  const runtimeConfig = parseRuntimeConfig(configVersion.config_json);
  await assertValidModifierTemplateIds(ctx, runtimeConfig.modifiers);
  let minRateBps = actorProfile?.commission_min_bps ?? runtimeConfig.min_rate_bps;
  let maxRateBps = actorProfile?.commission_max_bps ?? runtimeConfig.max_rate_bps;
  if (minRateBps > maxRateBps) {
    console.warn("Commission bounds inverted after profile override merge; swapping values", {
      min_rate_bps: minRateBps,
      max_rate_bps: maxRateBps,
      actor_profile_id: actorProfile?._id,
      actor_user_id: actorUser._id,
    });
    [minRateBps, maxRateBps] = [maxRateBps, minRateBps];
  }
  const baseRateBps = actorProfile?.commission_base_bps ?? runtimeConfig.base_rate_bps;

  const initialModifierEvaluations = await Promise.all(
    runtimeConfig.modifiers
      .filter(
        (modifier) => modifier.persona === persona || modifier.persona === INCENTIVE_PERSONA.ALL,
      )
      .map(async (modifier) => {
        const metric = await computeMetric(
          ctx,
          actorUser._id,
          modifier.metric_key,
          modifier.window_days,
          closure._id,
        );
        const ruleResult = evaluateModifierRule(modifier, metric.value);

        return {
          template_id: modifier.template_id,
          template_name: modifier.template_name,
          reward_mode: modifier.reward_mode,
          link_mode: modifier.link_mode,
          link_group_id: modifier.link_group_id,
          passed: ruleResult.passed,
          delta_bps: ruleResult.delta_bps,
          delta_paise: ruleResult.delta_paise,
          metric_value: metric.value,
          limited_data: metric.limited_data,
        } as ModifierEvaluation;
      }),
  );

  const modifierBreakdown = applyModifierComposition(initialModifierEvaluations);
  const bpsDeltaTotal = modifierBreakdown.reduce(
    (sum, modifier) => sum + (modifier.passed ? (modifier.delta_bps ?? 0) : 0),
    0,
  );
  const flatBonusPaise = modifierBreakdown.reduce(
    (sum, modifier) => sum + (modifier.passed ? (modifier.delta_paise ?? 0) : 0),
    0,
  );

  const effectiveRateBps = clamp(Math.floor(baseRateBps + bpsDeltaTotal), minRateBps, maxRateBps);
  const commissionBaseProfitPaise = deriveProfitPaise(closure);
  const commissionComponent = Math.floor((commissionBaseProfitPaise * effectiveRateBps) / 10_000);
  const incentivePoolPaise = Math.max(0, commissionComponent + flatBonusPaise);

  return {
    closure,
    lead,
    actor_user: actorUser,
    persona,
    config_version: configVersion.version_code,
    config_snapshot: configVersion.config_json,
    base_rate_bps: baseRateBps,
    effective_rate_bps: effectiveRateBps,
    flat_bonus_paise: flatBonusPaise,
    commission_base_profit_paise: commissionBaseProfitPaise,
    incentive_pool_paise: incentivePoolPaise,
    modifier_breakdown: modifierBreakdown,
  };
}

async function getLatestPayoutForClosure(
  ctx: FunctionCtx,
  closureId: Id<"closures">,
): Promise<Doc<"payouts"> | null> {
  return await ctx.db
    .query("payouts")
    .withIndex("by_closure_id", (q) => q.eq("closure_id", closureId))
    .order("desc")
    .first();
}

function getDeltaPercent(
  v3PoolPaise: number,
  v2PayoutPaise: number | undefined,
): number | undefined {
  if (v2PayoutPaise === undefined) {
    return undefined;
  }

  if (v2PayoutPaise === 0) {
    if (v3PoolPaise === 0) {
      return 0;
    }

    return 100;
  }

  return ((v3PoolPaise - v2PayoutPaise) / v2PayoutPaise) * 100;
}

async function buildSimulationComparison(
  ctx: FunctionCtx,
  args: {
    closure_id: Id<"closures">;
    config_version_id: Id<"incentive_config_versions"> | undefined;
  },
): Promise<SimulationComparison> {
  const result = await buildEvaluation(ctx, {
    closure_id: args.closure_id,
    config_version_id: args.config_version_id,
    require_active_config_version: false,
  });

  const v2Payout = await getLatestPayoutForClosure(ctx, args.closure_id);
  const v2PayoutPaise = v2Payout?.amount_paise;

  return {
    closure_id: args.closure_id,
    primary_actor_user_id: result.actor_user._id,
    persona: result.persona,
    config_version: result.config_version,
    v3_effective_rate_bps: result.effective_rate_bps,
    v3_pool_paise: result.incentive_pool_paise,
    v2_payout_paise: v2PayoutPaise,
    delta_paise:
      v2PayoutPaise !== undefined ? result.incentive_pool_paise - v2PayoutPaise : undefined,
    delta_percent: getDeltaPercent(result.incentive_pool_paise, v2PayoutPaise),
    modifier_breakdown: result.modifier_breakdown,
  };
}

export async function evaluateCommissionForClosure(
  ctx: MutationCtx,
  args: {
    closure_id: Id<"closures">;
    config_version_id?: Id<"incentive_config_versions">;
  },
): Promise<Doc<"deal_commission_evaluations">> {
  const result = await buildEvaluation(ctx, {
    closure_id: args.closure_id,
    config_version_id: args.config_version_id,
    require_active_config_version: true,
  });

  const evaluationId = await ctx.db.insert("deal_commission_evaluations", {
    closure_id: result.closure._id,
    primary_actor_user_id: result.actor_user._id,
    persona: result.persona,
    base_rate_bps: result.base_rate_bps,
    effective_rate_bps: result.effective_rate_bps,
    flat_bonus_paise: result.flat_bonus_paise,
    commission_base_profit_paise: result.commission_base_profit_paise,
    incentive_pool_paise: result.incentive_pool_paise,
    modifier_breakdown: result.modifier_breakdown.map((modifier) => ({
      template_id: modifier.template_id,
      template_name: modifier.template_name,
      reward_mode: modifier.reward_mode,
      delta_bps: modifier.passed ? modifier.delta_bps : undefined,
      delta_paise:
        modifier.passed && modifier.delta_paise !== undefined
          ? BigInt(Math.trunc(modifier.delta_paise))
          : undefined,
      link_mode: modifier.link_mode,
      link_group_id: modifier.link_group_id,
      passed: modifier.passed,
    })),
    config_version: result.config_version,
    config_snapshot: result.config_snapshot,
    computed_at: Date.now(),
    status: "FINAL",
  });

  const evaluation = await ctx.db.get(evaluationId);
  if (!evaluation) {
    throw new Error("Failed to persist commission evaluation");
  }

  return evaluation;
}

export const evaluateInternal = internalMutation({
  args: {
    closure_id: v.id("closures"),
    config_version_id: v.optional(v.id("incentive_config_versions")),
  },
  handler: async (ctx, args) => {
    return await evaluateCommissionForClosure(ctx, args);
  },
});

export const evaluate = mutation({
  args: {
    closure_id: v.id("closures"),
    config_version_id: v.optional(v.id("incentive_config_versions")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);
    return await evaluateCommissionForClosure(ctx, args);
  },
});

export const getEvaluation = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    return await ctx.db
      .query("deal_commission_evaluations")
      .withIndex("by_closure", (q) => q.eq("closure_id", args.closure_id))
      .filter((q) => q.neq(q.field("status"), "VOIDED"))
      .order("desc")
      .first();
  },
});

export const getMyCommissionBreakdown = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 10)));

    const evaluations = await ctx.db
      .query("deal_commission_evaluations")
      .withIndex("by_primary_actor", (q) => q.eq("primary_actor_user_id", user._id))
      .filter((q) => q.neq(q.field("status"), "VOIDED"))
      .order("desc")
      .take(limit);

    const latest = evaluations[0] ?? null;
    const totalPoolPaise = evaluations.reduce(
      (sum, evaluation) => sum + evaluation.incentive_pool_paise,
      0,
    );
    const avgEffectiveRateBps =
      evaluations.length > 0
        ? Math.round(
            evaluations.reduce((sum, evaluation) => sum + evaluation.effective_rate_bps, 0) /
              evaluations.length,
          )
        : 0;
    const appliedModifiers = evaluations.reduce(
      (sum, evaluation) =>
        sum + evaluation.modifier_breakdown.filter((modifier) => modifier.passed).length,
      0,
    );

    return {
      actor_user_id: user._id,
      latest_evaluation: latest,
      summary: {
        evaluations_count: evaluations.length,
        avg_effective_rate_bps: avgEffectiveRateBps,
        total_pool_paise: totalPoolPaise,
        applied_modifiers_count: appliedModifiers,
      },
      recent_evaluations: evaluations,
    };
  },
});

export const simulateEvaluation = query({
  args: {
    closure_id: v.id("closures"),
    config_version_id: v.optional(v.id("incentive_config_versions")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const simulation = await buildSimulationComparison(ctx, {
      closure_id: args.closure_id,
      config_version_id: args.config_version_id,
    });

    return {
      ...simulation,
      effective_rate_bps: simulation.v3_effective_rate_bps,
      incentive_pool_paise: simulation.v3_pool_paise,
      delta_vs_v2_paise: simulation.delta_paise,
      persisted: false,
    };
  },
});

export const simulateBatch = query({
  args: {
    closure_ids: v.array(v.id("closures")),
    config_version_id: v.optional(v.id("incentive_config_versions")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const uniqueClosureIds = Array.from(new Set(args.closure_ids)).slice(0, 100);
    const items = await Promise.all(
      uniqueClosureIds.map(async (closureId) => {
        return await buildSimulationComparison(ctx, {
          closure_id: closureId,
          config_version_id: args.config_version_id,
        });
      }),
    );

    const withBaseline = items.filter((item) => item.delta_paise !== undefined);
    const comparedCount = withBaseline.length;
    const deltas = withBaseline
      .map((item) => item.delta_paise)
      .filter((delta): delta is number => delta !== undefined);
    const deltaPercents = withBaseline
      .map((item) => item.delta_percent)
      .filter((delta): delta is number => delta !== undefined);

    const v3GreaterCount = deltas.filter((delta) => delta > 0).length;
    const v3LowerCount = deltas.filter((delta) => delta < 0).length;
    const v3EqualCount = deltas.filter((delta) => delta === 0).length;

    return {
      items,
      aggregate: {
        evaluated_count: items.length,
        compared_count: comparedCount,
        avg_delta_paise:
          deltas.length > 0
            ? Math.floor(deltas.reduce((sum, value) => sum + value, 0) / deltas.length)
            : 0,
        avg_delta_percent:
          deltaPercents.length > 0
            ? deltaPercents.reduce((sum, value) => sum + value, 0) / deltaPercents.length
            : 0,
        max_delta_paise: deltas.length > 0 ? Math.max(...deltas) : 0,
        min_delta_paise: deltas.length > 0 ? Math.min(...deltas) : 0,
        v3_greater_count: v3GreaterCount,
        v3_lower_count: v3LowerCount,
        v3_equal_count: v3EqualCount,
        v3_greater_percent: comparedCount > 0 ? (v3GreaterCount / comparedCount) * 100 : 0,
        v3_lower_percent: comparedCount > 0 ? (v3LowerCount / comparedCount) * 100 : 0,
      },
    };
  },
});

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

export const getEvaluationHistory = query({
  args: {
    paginationOpts: paginationOptsValidator,
    persona: v.optional(incentivePersonaValidator),
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    let evaluationsQuery = ctx.db
      .query("deal_commission_evaluations")
      .filter((q) => q.neq(q.field("status"), "VOIDED"));

    if (args.persona !== undefined) {
      const persona = args.persona;
      evaluationsQuery = evaluationsQuery.filter((q) => q.eq(q.field("persona"), persona));
    }

    if (args.date_from !== undefined) {
      const dateFrom = args.date_from;
      evaluationsQuery = evaluationsQuery.filter((q) => q.gte(q.field("computed_at"), dateFrom));
    }

    if (args.date_to !== undefined) {
      const dateTo = args.date_to;
      evaluationsQuery = evaluationsQuery.filter((q) => q.lte(q.field("computed_at"), dateTo));
    }

    const paginated = await evaluationsQuery.order("desc").paginate(args.paginationOpts);

    const page = await Promise.all(
      paginated.page.map(async (evaluation) => {
        const [closure, v2Payout] = await Promise.all([
          ctx.db.get(evaluation.closure_id),
          getLatestPayoutForClosure(ctx, evaluation.closure_id),
        ]);

        const v2PayoutPaise = v2Payout?.amount_paise;

        return {
          evaluation,
          closure,
          v2_payout_paise: v2PayoutPaise,
          delta_paise:
            v2PayoutPaise !== undefined
              ? evaluation.incentive_pool_paise - v2PayoutPaise
              : undefined,
          delta_percent: getDeltaPercent(evaluation.incentive_pool_paise, v2PayoutPaise),
        };
      }),
    );

    return {
      ...paginated,
      page,
    };
  },
});

export const getModifierHitRates = query({
  args: {
    persona: v.optional(incentivePersonaValidator),
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
    config_version: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    let evaluationsQuery = ctx.db
      .query("deal_commission_evaluations")
      .filter((q) => q.neq(q.field("status"), "VOIDED"));

    if (args.persona !== undefined) {
      const persona = args.persona;
      evaluationsQuery = evaluationsQuery.filter((q) => q.eq(q.field("persona"), persona));
    }

    if (args.date_from !== undefined) {
      const dateFrom = args.date_from;
      evaluationsQuery = evaluationsQuery.filter((q) => q.gte(q.field("computed_at"), dateFrom));
    }

    if (args.date_to !== undefined) {
      const dateTo = args.date_to;
      evaluationsQuery = evaluationsQuery.filter((q) => q.lte(q.field("computed_at"), dateTo));
    }

    if (args.config_version !== undefined) {
      const configVersion = args.config_version;
      evaluationsQuery = evaluationsQuery.filter((q) =>
        q.eq(q.field("config_version"), configVersion),
      );
    }

    const evaluations = await evaluationsQuery.collect();

    const stats = new Map<
      string,
      {
        template_id: Id<"commission_modifier_templates">;
        template_name: string;
        reward_mode: "BPS" | "FLAT_PAISE";
        total_count: number;
        passed_count: number;
        passed_delta_bps_total: number;
        passed_delta_bps_count: number;
        passed_delta_paise_total: number;
        passed_delta_paise_count: number;
      }
    >();

    for (const evaluation of evaluations) {
      for (const modifier of evaluation.modifier_breakdown) {
        const key = `${modifier.template_id}`;
        const existing = stats.get(key) ?? {
          template_id: modifier.template_id,
          template_name: modifier.template_name,
          reward_mode: modifier.reward_mode,
          total_count: 0,
          passed_count: 0,
          passed_delta_bps_total: 0,
          passed_delta_bps_count: 0,
          passed_delta_paise_total: 0,
          passed_delta_paise_count: 0,
        };

        existing.total_count += 1;

        if (modifier.passed) {
          existing.passed_count += 1;

          if (modifier.delta_bps !== undefined) {
            existing.passed_delta_bps_total += modifier.delta_bps;
            existing.passed_delta_bps_count += 1;
          }

          if (modifier.delta_paise !== undefined) {
            existing.passed_delta_paise_total += Number(modifier.delta_paise);
            existing.passed_delta_paise_count += 1;
          }
        }

        stats.set(key, existing);
      }
    }

    const templates = Array.from(stats.values())
      .map((entry) => {
        return {
          template_id: entry.template_id,
          template_name: entry.template_name,
          reward_mode: entry.reward_mode,
          total_count: entry.total_count,
          passed_count: entry.passed_count,
          pass_rate_percent:
            entry.total_count > 0 ? (entry.passed_count / entry.total_count) * 100 : 0,
          avg_delta_bps:
            entry.passed_delta_bps_count > 0
              ? entry.passed_delta_bps_total / entry.passed_delta_bps_count
              : undefined,
          avg_delta_paise:
            entry.passed_delta_paise_count > 0
              ? Math.floor(entry.passed_delta_paise_total / entry.passed_delta_paise_count)
              : undefined,
        };
      })
      .sort((left, right) => right.pass_rate_percent - left.pass_rate_percent);

    return {
      total_evaluations: evaluations.length,
      templates,
    };
  },
});

export const getVarianceSummary = query({
  args: {
    persona: v.optional(incentivePersonaValidator),
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
    config_version: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    let evaluationsQuery = ctx.db
      .query("deal_commission_evaluations")
      .filter((q) => q.neq(q.field("status"), "VOIDED"));

    if (args.persona !== undefined) {
      const persona = args.persona;
      evaluationsQuery = evaluationsQuery.filter((q) => q.eq(q.field("persona"), persona));
    }

    if (args.date_from !== undefined) {
      const dateFrom = args.date_from;
      evaluationsQuery = evaluationsQuery.filter((q) => q.gte(q.field("computed_at"), dateFrom));
    }

    if (args.date_to !== undefined) {
      const dateTo = args.date_to;
      evaluationsQuery = evaluationsQuery.filter((q) => q.lte(q.field("computed_at"), dateTo));
    }

    if (args.config_version !== undefined) {
      const configVersion = args.config_version;
      evaluationsQuery = evaluationsQuery.filter((q) =>
        q.eq(q.field("config_version"), configVersion),
      );
    }

    const evaluations = await evaluationsQuery.collect();

    const comparisons = await Promise.all(
      evaluations.map(async (evaluation) => {
        const v2Payout = await getLatestPayoutForClosure(ctx, evaluation.closure_id);
        const v2PayoutPaise = v2Payout?.amount_paise;

        if (v2PayoutPaise === undefined) {
          return null;
        }

        return {
          delta_paise: evaluation.incentive_pool_paise - v2PayoutPaise,
          delta_percent: getDeltaPercent(evaluation.incentive_pool_paise, v2PayoutPaise) ?? 0,
          v2_payout_paise: v2PayoutPaise,
          v3_pool_paise: evaluation.incentive_pool_paise,
        };
      }),
    );

    const validComparisons = comparisons.filter((comparison) => comparison !== null);
    const deltas = validComparisons.map((comparison) => comparison.delta_paise);
    const deltaPercents = validComparisons.map((comparison) => comparison.delta_percent);

    const v3GreaterCount = deltas.filter((delta) => delta > 0).length;
    const v3LowerCount = deltas.filter((delta) => delta < 0).length;
    const v3EqualCount = deltas.filter((delta) => delta === 0).length;

    const distribution = {
      below_minus_25_pct: deltaPercents.filter((delta) => delta < -25).length,
      minus_25_to_minus_10_pct: deltaPercents.filter((delta) => delta >= -25 && delta < -10).length,
      minus_10_to_zero_pct: deltaPercents.filter((delta) => delta >= -10 && delta < 0).length,
      zero_to_plus_10_pct: deltaPercents.filter((delta) => delta >= 0 && delta <= 10).length,
      plus_10_to_plus_25_pct: deltaPercents.filter((delta) => delta > 10 && delta <= 25).length,
      above_plus_25_pct: deltaPercents.filter((delta) => delta > 25).length,
    };

    return {
      total_evaluations: evaluations.length,
      compared_evaluations: validComparisons.length,
      avg_v3_pool_paise:
        validComparisons.length > 0
          ? Math.floor(
              validComparisons.reduce((sum, comparison) => sum + comparison.v3_pool_paise, 0) /
                validComparisons.length,
            )
          : 0,
      avg_v2_payout_paise:
        validComparisons.length > 0
          ? Math.floor(
              validComparisons.reduce((sum, comparison) => sum + comparison.v2_payout_paise, 0) /
                validComparisons.length,
            )
          : 0,
      avg_delta_paise:
        deltas.length > 0
          ? Math.floor(deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length)
          : 0,
      avg_delta_percent:
        deltaPercents.length > 0
          ? deltaPercents.reduce((sum, delta) => sum + delta, 0) / deltaPercents.length
          : 0,
      max_delta_paise: deltas.length > 0 ? Math.max(...deltas) : 0,
      min_delta_paise: deltas.length > 0 ? Math.min(...deltas) : 0,
      v3_greater_count: v3GreaterCount,
      v3_lower_count: v3LowerCount,
      v3_equal_count: v3EqualCount,
      distribution,
    };
  },
});

export const listSimulationClosures = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)));
    const closures = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
      .order("desc")
      .take(limit);

    return await Promise.all(
      closures.map(async (closure) => {
        const [lead, payout] = await Promise.all([
          ctx.db.get(closure.lead_id),
          getLatestPayoutForClosure(ctx, closure._id),
        ]);
        const [building, society] = await Promise.all([
          lead ? ctx.db.get(lead.building_id) : null,
          lead ? ctx.db.get(lead.society_id) : null,
        ]);

        return {
          closure_id: closure._id,
          lead_id: closure.lead_id,
          move_in_date: closure.move_in_date,
          confirmed_at: closure.confirmed_at,
          v2_payout_paise: payout?.amount_paise,
          commission_base_profit_paise: deriveProfitPaise(closure),
          flat_number: lead?.flat_number,
          building_name: building?.name,
          society_name: society?.name,
        };
      }),
    );
  },
});
