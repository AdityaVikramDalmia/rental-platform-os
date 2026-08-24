import { v } from "convex/values";
import { INCENTIVE_PERSONA, PERMISSIONS, SYSTEM_CONFIG_KEYS } from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requirePermission } from "./auth.helpers";
import { internalQuery, mutation, query } from "./functions";
import { getSystemConfigJson } from "./systemConfig.helpers";

const SHADOW_MODE_VIEW_PERMISSION = "shadow_mode.view";
const DECOMMISSION_VARIANCE_THRESHOLD_KEY =
  SYSTEM_CONFIG_KEYS.INCENTIVE_V3_DECOMMISSION_VARIANCE_THRESHOLD;
const DEFAULT_DECOMMISSION_VARIANCE_THRESHOLD_PCT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const ROLLOUT_MODE = {
  OFF: "OFF",
  SHADOW: "SHADOW",
  PARTIAL: "PARTIAL",
  FULL: "FULL",
} as const;

type RolloutMode = (typeof ROLLOUT_MODE)[keyof typeof ROLLOUT_MODE];
type DbContext = Pick<QueryCtx | MutationCtx, "db">;

const VALID_TRANSITIONS: Record<RolloutMode, RolloutMode[]> = {
  [ROLLOUT_MODE.OFF]: [ROLLOUT_MODE.SHADOW],
  [ROLLOUT_MODE.SHADOW]: [ROLLOUT_MODE.OFF, ROLLOUT_MODE.PARTIAL],
  [ROLLOUT_MODE.PARTIAL]: [ROLLOUT_MODE.SHADOW, ROLLOUT_MODE.FULL],
  [ROLLOUT_MODE.FULL]: [ROLLOUT_MODE.PARTIAL],
};

type RolloutPolicy = {
  mode: RolloutMode;
  enabled_personas: Array<
    | typeof INCENTIVE_PERSONA.GUARD
    | typeof INCENTIVE_PERSONA.OPS
    | typeof INCENTIVE_PERSONA.SALES
    | typeof INCENTIVE_PERSONA.RM
    | typeof INCENTIVE_PERSONA.LIAISON
  >;
  notes: string;
};

type IncentiveV3FeatureFlags = {
  shadow_mode: boolean;
  split_preview_enabled: boolean;
  disbursement_enabled: boolean;
  gamification_enabled: boolean;
};

type DecommissionReadiness = {
  ready: boolean;
  blockers: string[];
  stats: {
    cycles_completed: number;
    avg_variance_pct: number;
    threshold_pct: number;
  };
};

const DEFAULT_ROLLOUT_POLICY: RolloutPolicy = {
  mode: ROLLOUT_MODE.OFF,
  enabled_personas: [],
  notes: "v2 remains payout source of truth",
};

const DEFAULT_FEATURE_FLAGS: IncentiveV3FeatureFlags = {
  shadow_mode: true,
  split_preview_enabled: true,
  disbursement_enabled: false,
  gamification_enabled: false,
};

const rolloutModeValidator = v.union(
  v.literal(ROLLOUT_MODE.OFF),
  v.literal(ROLLOUT_MODE.SHADOW),
  v.literal(ROLLOUT_MODE.PARTIAL),
  v.literal(ROLLOUT_MODE.FULL),
);

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

const rolloutEnableablePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
);

const ENABLEABLE_PERSONAS = new Set<string>([
  INCENTIVE_PERSONA.GUARD,
  INCENTIVE_PERSONA.OPS,
  INCENTIVE_PERSONA.SALES,
  INCENTIVE_PERSONA.RM,
  INCENTIVE_PERSONA.LIAISON,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNotes(value: string | undefined): string {
  if (value === undefined) {
    return DEFAULT_ROLLOUT_POLICY.notes;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : DEFAULT_ROLLOUT_POLICY.notes;
}

function normalizeEnabledPersonas(value: unknown): RolloutPolicy["enabled_personas"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<RolloutPolicy["enabled_personas"][number]>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    if (!ENABLEABLE_PERSONAS.has(entry)) {
      continue;
    }

    deduped.add(entry as RolloutPolicy["enabled_personas"][number]);
  }

  return [...deduped];
}

function parseRolloutPolicy(value: unknown): RolloutPolicy {
  if (!isRecord(value)) {
    return DEFAULT_ROLLOUT_POLICY;
  }

  const rawMode = value.mode;
  const mode =
    rawMode === ROLLOUT_MODE.OFF ||
    rawMode === ROLLOUT_MODE.SHADOW ||
    rawMode === ROLLOUT_MODE.PARTIAL ||
    rawMode === ROLLOUT_MODE.FULL
      ? rawMode
      : DEFAULT_ROLLOUT_POLICY.mode;

  return {
    mode,
    enabled_personas: normalizeEnabledPersonas(value.enabled_personas),
    notes: normalizeNotes(typeof value.notes === "string" ? value.notes : undefined),
  };
}

function parseFeatureFlags(value: unknown): IncentiveV3FeatureFlags {
  if (!isRecord(value)) {
    return DEFAULT_FEATURE_FLAGS;
  }

  return {
    shadow_mode:
      typeof value.shadow_mode === "boolean"
        ? value.shadow_mode
        : DEFAULT_FEATURE_FLAGS.shadow_mode,
    split_preview_enabled:
      typeof value.split_preview_enabled === "boolean"
        ? value.split_preview_enabled
        : DEFAULT_FEATURE_FLAGS.split_preview_enabled,
    disbursement_enabled:
      typeof value.disbursement_enabled === "boolean"
        ? value.disbursement_enabled
        : DEFAULT_FEATURE_FLAGS.disbursement_enabled,
    gamification_enabled:
      typeof value.gamification_enabled === "boolean"
        ? value.gamification_enabled
        : DEFAULT_FEATURE_FLAGS.gamification_enabled,
  };
}

async function getRolloutPolicyFromConfig(ctx: DbContext): Promise<RolloutPolicy> {
  const rawPolicy = await getSystemConfigJson<unknown>(
    ctx,
    SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
    DEFAULT_ROLLOUT_POLICY,
  );

  return parseRolloutPolicy(rawPolicy);
}

async function getFeatureFlagsFromConfig(ctx: DbContext): Promise<IncentiveV3FeatureFlags> {
  const rawFlags = await getSystemConfigJson<unknown>(
    ctx,
    SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS,
    DEFAULT_FEATURE_FLAGS,
  );

  return parseFeatureFlags(rawFlags);
}

async function upsertSystemConfigValue(
  ctx: MutationCtx,
  key: Doc<"system_config">["key"],
  value: string,
  updatedByAdminId: Id<"users">,
): Promise<void> {
  const existing = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      value,
      updated_by_admin_id: updatedByAdminId,
    });
    return;
  }

  await ctx.db.insert("system_config", {
    key,
    value,
    updated_by_admin_id: updatedByAdminId,
  });
}

async function assertShadowModeFeatureEnabled(ctx: DbContext): Promise<void> {
  const flags = await getFeatureFlagsFromConfig(ctx);
  if (!flags.shadow_mode) {
    throw new Error("shadow_mode feature flag is disabled in incentive_v3_feature_flags");
  }
}

async function isShadowModeEnabled(ctx: DbContext): Promise<boolean> {
  const [flags, legacyToggle] = await Promise.all([
    getFeatureFlagsFromConfig(ctx),
    ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_V3_SHADOW_MODE_ENABLED))
      .first(),
  ]);

  const isLegacyToggleEnabled =
    legacyToggle === null ? true : legacyToggle.value.trim().toLowerCase() !== "false";

  return flags.shadow_mode && isLegacyToggleEnabled;
}

function getGuardPayoutSourceFromPolicy(policy: RolloutPolicy): "v2" | "v3" {
  if (policy.mode === ROLLOUT_MODE.OFF || policy.mode === ROLLOUT_MODE.SHADOW) {
    return "v2";
  }

  if (policy.mode === ROLLOUT_MODE.FULL) {
    return "v3";
  }

  return policy.enabled_personas.includes(INCENTIVE_PERSONA.GUARD) ? "v3" : "v2";
}

function assertValidRolloutTransition(current: RolloutMode, next: RolloutMode): void {
  if (current === next) {
    return;
  }

  const allowedTransitions = VALID_TRANSITIONS[current] ?? [];
  if (allowedTransitions.includes(next)) {
    return;
  }

  throw new Error(
    `Invalid rollout transition: ${current} -> ${next}. Allowed transitions: ${allowedTransitions.join(", ")}`,
  );
}

function toMonthCycleKey(timestampMs: number): string {
  const value = new Date(timestampMs);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toWeekCycleKey(timestampMs: number): string {
  const value = new Date(timestampMs);
  const utcDate = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeNumericPercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.abs(parsed);
    }
  }

  return null;
}

function extractVariancePercent(deltaSummary: string): number | null {
  try {
    const parsed = JSON.parse(deltaSummary) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const candidateKeys = [
      "percentage_delta",
      "percentageDelta",
      "variance_pct",
      "variancePct",
      "delta_pct",
      "deltaPct",
    ] as const;

    for (const key of candidateKeys) {
      const numeric = normalizeNumericPercent(parsed[key]);
      if (numeric !== null) {
        return numeric;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function getVarianceThresholdPercent(ctx: DbContext): Promise<number> {
  const matching = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", DECOMMISSION_VARIANCE_THRESHOLD_KEY))
    .first();
  if (!matching) {
    return DEFAULT_DECOMMISSION_VARIANCE_THRESHOLD_PCT;
  }

  const parsed = Number(matching.value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return DEFAULT_DECOMMISSION_VARIANCE_THRESHOLD_PCT;
}

async function computeDecommissionReadiness(ctx: DbContext): Promise<DecommissionReadiness> {
  const [policy, deltas, thresholdPercent] = await Promise.all([
    getRolloutPolicyFromConfig(ctx),
    ctx.db.query("shadow_mode_deltas").collect(),
    getVarianceThresholdPercent(ctx),
  ]);

  const weekCycles = new Set<string>();
  const monthCycles = new Set<string>();
  const varianceSamples: number[] = [];

  for (const delta of deltas) {
    weekCycles.add(toWeekCycleKey(delta.created_at));
    monthCycles.add(toMonthCycleKey(delta.created_at));

    const variancePercent = extractVariancePercent(delta.delta_summary);
    if (variancePercent !== null) {
      varianceSamples.push(variancePercent);
    }
  }

  const cyclesCompleted = Math.max(weekCycles.size, monthCycles.size);
  const avgVariancePercent =
    varianceSamples.length === 0
      ? null
      : varianceSamples.reduce((sum, value) => sum + value, 0) / varianceSamples.length;

  const blockers: string[] = [];
  if (policy.mode !== ROLLOUT_MODE.FULL) {
    blockers.push("Rollout policy mode must be FULL before decommissioning v2 shadow path");
  }

  if (cyclesCompleted < 2) {
    blockers.push(
      `At least 2 payout cycles with shadow_mode_deltas are required (found ${cyclesCompleted})`,
    );
  }

  if (avgVariancePercent === null) {
    blockers.push("Unable to calculate aggregate variance from shadow_mode_deltas delta_summary");
  } else if (avgVariancePercent >= thresholdPercent) {
    blockers.push(
      `Average variance ${avgVariancePercent.toFixed(2)}% exceeds threshold ${thresholdPercent}%`,
    );
  }

  return {
    ready: blockers.length === 0,
    blockers,
    stats: {
      cycles_completed: cyclesCompleted,
      avg_variance_pct: avgVariancePercent ?? 0,
      threshold_pct: thresholdPercent,
    },
  };
}

export const getRolloutPolicy = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, SHADOW_MODE_VIEW_PERMISSION);
    return await getRolloutPolicyFromConfig(ctx);
  },
});

export const getRolloutPolicyInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getRolloutPolicyFromConfig(ctx);
  },
});

export const isShadowModeEnabledInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await isShadowModeEnabled(ctx);
  },
});

export const updateRolloutPolicy = mutation({
  args: {
    mode: rolloutModeValidator,
    enabled_personas: v.array(rolloutEnableablePersonaValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.SHADOW_MODE_MANAGE);
    const currentPolicy = await getRolloutPolicyFromConfig(ctx);

    if (currentPolicy.mode === ROLLOUT_MODE.FULL && args.mode !== ROLLOUT_MODE.FULL) {
      const featureFlags = await getFeatureFlagsFromConfig(ctx);
      if (!featureFlags.shadow_mode) {
        throw new Error(
          "System is decommissioned. Use recommission mutation to re-enable transitions.",
        );
      }
    }

    assertValidRolloutTransition(currentPolicy.mode, args.mode);

    const policy: RolloutPolicy = {
      mode: args.mode,
      enabled_personas: normalizeEnabledPersonas(args.enabled_personas),
      notes: normalizeNotes(args.notes),
    };

    await upsertSystemConfigValue(
      ctx,
      SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
      JSON.stringify(policy),
      admin._id,
    );

    return policy;
  },
});

export const isPersonaEnabled = internalQuery({
  args: {
    persona: incentivePersonaValidator,
  },
  handler: async (ctx, args) => {
    const policy = await getRolloutPolicyFromConfig(ctx);

    if (policy.mode === ROLLOUT_MODE.OFF) {
      return false;
    }

    return policy.enabled_personas.includes(
      args.persona as RolloutPolicy["enabled_personas"][number],
    );
  },
});

/*
 * During PARTIAL mode, guards continue earning from v2 payout system while v3 computes in
 * parallel for shadow comparison. Guard payout source only switches when explicitly migrated
 * via T06.
 */
export const getGuardPayoutSource = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, SHADOW_MODE_VIEW_PERMISSION);
    const policy = await getRolloutPolicyFromConfig(ctx);
    return getGuardPayoutSourceFromPolicy(policy);
  },
});

export const isGuardOnV3 = internalQuery({
  args: {},
  handler: async (ctx) => {
    const policy = await getRolloutPolicyFromConfig(ctx);
    return getGuardPayoutSourceFromPolicy(policy) === "v3";
  },
});

export const migrateGuardToV3 = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requirePermission(ctx, PERMISSIONS.SHADOW_MODE_MANAGE);
    await assertShadowModeFeatureEnabled(ctx);

    const currentPolicy = await getRolloutPolicyFromConfig(ctx);
    const enabledPersonas = normalizeEnabledPersonas([
      ...currentPolicy.enabled_personas,
      INCENTIVE_PERSONA.GUARD,
    ]);

    const updatedPolicy: RolloutPolicy = {
      mode: currentPolicy.mode === ROLLOUT_MODE.SHADOW ? ROLLOUT_MODE.PARTIAL : currentPolicy.mode,
      enabled_personas: enabledPersonas,
      notes: currentPolicy.notes,
    };

    await upsertSystemConfigValue(
      ctx,
      SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
      JSON.stringify(updatedPolicy),
      admin._id,
    );

    return updatedPolicy;
  },
});

export const rollbackGuardToV2 = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requirePermission(ctx, PERMISSIONS.SHADOW_MODE_MANAGE);

    const currentPolicy = await getRolloutPolicyFromConfig(ctx);
    if (currentPolicy.mode === ROLLOUT_MODE.OFF || currentPolicy.mode === ROLLOUT_MODE.SHADOW) {
      return currentPolicy;
    }

    await assertShadowModeFeatureEnabled(ctx);

    const enabledPersonasWithoutGuard = currentPolicy.enabled_personas.filter(
      (persona) => persona !== INCENTIVE_PERSONA.GUARD,
    );

    let nextMode: RolloutMode;
    if (currentPolicy.mode === ROLLOUT_MODE.PARTIAL) {
      nextMode =
        enabledPersonasWithoutGuard.length === 0 ? ROLLOUT_MODE.SHADOW : ROLLOUT_MODE.PARTIAL;
      assertValidRolloutTransition(currentPolicy.mode, nextMode);
    } else if (currentPolicy.mode === ROLLOUT_MODE.FULL) {
      nextMode =
        enabledPersonasWithoutGuard.length === 0 ? ROLLOUT_MODE.SHADOW : ROLLOUT_MODE.PARTIAL;

      if (nextMode === ROLLOUT_MODE.SHADOW) {
        assertValidRolloutTransition(currentPolicy.mode, ROLLOUT_MODE.PARTIAL);
        assertValidRolloutTransition(ROLLOUT_MODE.PARTIAL, ROLLOUT_MODE.SHADOW);
      } else {
        assertValidRolloutTransition(currentPolicy.mode, nextMode);
      }
    } else {
      throw new Error(
        "rollbackGuardToV2 only supports one-step rollback transitions: PARTIAL -> SHADOW or FULL -> PARTIAL",
      );
    }

    const enabledPersonas = nextMode === ROLLOUT_MODE.SHADOW ? [] : enabledPersonasWithoutGuard;

    const updatedPolicy: RolloutPolicy = {
      mode: nextMode,
      enabled_personas: enabledPersonas,
      notes: currentPolicy.notes,
    };

    await upsertSystemConfigValue(
      ctx,
      SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
      JSON.stringify(updatedPolicy),
      admin._id,
    );

    return updatedPolicy;
  },
});

export const checkDecommissionReadiness = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, SHADOW_MODE_VIEW_PERMISSION);
    return await computeDecommissionReadiness(ctx);
  },
});

export const decommissionV2Shadow = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requirePermission(ctx, PERMISSIONS.SHADOW_MODE_MANAGE);
    const readiness = await computeDecommissionReadiness(ctx);

    if (!readiness.ready) {
      throw new Error(`Decommission readiness check failed: ${readiness.blockers.join("; ")}`);
    }

    const [featureFlags, policy] = await Promise.all([
      getFeatureFlagsFromConfig(ctx),
      getRolloutPolicyFromConfig(ctx),
    ]);

    const updatedFeatureFlags: IncentiveV3FeatureFlags = {
      ...featureFlags,
      shadow_mode: false,
    };

    const updatedPolicy: RolloutPolicy = {
      ...policy,
      mode: ROLLOUT_MODE.FULL,
    };

    await Promise.all([
      upsertSystemConfigValue(
        ctx,
        SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS,
        JSON.stringify(updatedFeatureFlags),
        admin._id,
      ),
      upsertSystemConfigValue(
        ctx,
        SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
        JSON.stringify(updatedPolicy),
        admin._id,
      ),
      upsertSystemConfigValue(
        ctx,
        SYSTEM_CONFIG_KEYS.INCENTIVE_V3_SHADOW_MODE_ENABLED,
        "false",
        admin._id,
      ),
    ]);

    return {
      success: true,
      message:
        "V2 shadow path decommissioned. Shadow computation disabled and rollout forced to FULL.",
    };
  },
});
