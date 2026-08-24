import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  CLOSURE_STATUS,
  INCENTIVE_PERSONA,
  PAYOUT_STATUS,
  SYSTEM_CONFIG_KEYS,
} from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./functions";

const SHADOW_MODE_VIEW_PERMISSION = "shadow_mode.view";
const SHADOW_MODE_MANAGE_PERMISSION = "shadow_mode.manage";

const entityTypeValidator = v.union(
  v.literal("commission"),
  v.literal("attribution"),
  v.literal("disbursement"),
);

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

const ENTITY_TYPES: Array<Doc<"shadow_mode_deltas">["entity_type"]> = [
  "commission",
  "attribution",
  "disbursement",
];

type RolloutMode = "OFF" | "SHADOW" | "PARTIAL" | "FULL";

const ROLLOUT_MODES: RolloutMode[] = ["OFF", "SHADOW", "PARTIAL", "FULL"];

function isRolloutMode(value: unknown): value is RolloutMode {
  return typeof value === "string" && (ROLLOUT_MODES as string[]).includes(value);
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseRolloutMode(value: string | null): RolloutMode {
  if (value === null) {
    return "OFF";
  }

  const parsed = parseJsonRecord(value);
  if (!parsed) {
    return "OFF";
  }

  const mode = parsed.mode;
  if (isRolloutMode(mode)) {
    return mode;
  }

  return "OFF";
}

function parseShadowModeFeatureFlag(value: string | null): boolean {
  if (value === null) {
    return true;
  }

  const parsed = parseJsonRecord(value);
  if (!parsed) {
    return true;
  }

  const shadowMode = parsed.shadow_mode;
  return typeof shadowMode === "boolean" ? shadowMode : true;
}

function parseLegacyShadowModeToggle(value: string | null): boolean {
  if (value === null) {
    return true;
  }

  return value.trim().toLowerCase() !== "false";
}

async function assertShadowModeWriteEnabled(ctx: MutationCtx): Promise<void> {
  const [rolloutPolicyConfig, featureFlagsConfig, legacyToggleConfig] = await Promise.all([
    ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY))
      .first(),
    ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS))
      .first(),
    ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_V3_SHADOW_MODE_ENABLED))
      .first(),
  ]);

  const rolloutMode = parseRolloutMode(rolloutPolicyConfig?.value ?? null);
  const isShadowModeEnabled =
    parseShadowModeFeatureFlag(featureFlagsConfig?.value ?? null) &&
    parseLegacyShadowModeToggle(legacyToggleConfig?.value ?? null);

  if (rolloutMode === "FULL" || !isShadowModeEnabled) {
    throw new Error("Cannot insert shadow delta: shadow mode is decommissioned");
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 100;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }

  return Math.min(limit, 500);
}

function assertDateRange(fromDate: number | undefined, toDate: number | undefined): void {
  if (fromDate !== undefined && toDate !== undefined && fromDate > toDate) {
    throw new Error("from_date must be less than or equal to to_date");
  }
}

function parseDeltaSummary(
  deltaSummary: string,
): { signedDeltaPaise: number; percentageDelta: number | null } | null {
  try {
    const parsed = JSON.parse(deltaSummary) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const signedDelta = record.absolute_delta_paise;
    const percentageDelta = record.percentage_delta;

    if (typeof signedDelta !== "number" || !Number.isFinite(signedDelta)) {
      return null;
    }

    const normalizedPercentage =
      typeof percentageDelta === "number" && Number.isFinite(percentageDelta)
        ? percentageDelta
        : null;

    return {
      signedDeltaPaise: signedDelta,
      percentageDelta: normalizedPercentage,
    };
  } catch {
    return null;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }

  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left === undefined || right === undefined) {
    return null;
  }

  return (left + right) / 2;
}

async function queryByEntityType(
  ctx: QueryCtx,
  args: {
    entity_type: Doc<"shadow_mode_deltas">["entity_type"];
    persona: Doc<"shadow_mode_deltas">["persona"] | undefined;
    from_date: number | undefined;
    to_date: number | undefined;
  },
): Promise<Doc<"shadow_mode_deltas">[]> {
  const { entity_type: entityType, persona, from_date: fromDate, to_date: toDate } = args;

  let rows: Doc<"shadow_mode_deltas">[];

  if (persona !== undefined && fromDate !== undefined && toDate !== undefined) {
    rows = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) =>
        q
          .eq("entity_type", entityType)
          .eq("persona", persona)
          .gte("created_at", fromDate)
          .lte("created_at", toDate),
      )
      .collect();
  } else if (persona !== undefined && fromDate !== undefined) {
    rows = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) =>
        q.eq("entity_type", entityType).eq("persona", persona).gte("created_at", fromDate),
      )
      .collect();
  } else if (persona !== undefined && toDate !== undefined) {
    rows = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) =>
        q.eq("entity_type", entityType).eq("persona", persona).lte("created_at", toDate),
      )
      .collect();
  } else if (persona !== undefined) {
    rows = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) => q.eq("entity_type", entityType).eq("persona", persona))
      .collect();
  } else {
    rows = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_entity_type", (q) => q.eq("entity_type", entityType))
      .collect();
  }

  return rows.filter((row) => {
    if (fromDate !== undefined && row.created_at < fromDate) {
      return false;
    }

    if (toDate !== undefined && row.created_at > toDate) {
      return false;
    }

    return true;
  });
}

export const getByClosureId = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, SHADOW_MODE_VIEW_PERMISSION);

    const rows = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_deal", (q) => q.eq("deal_id", args.closure_id))
      .collect();

    return rows.sort((a, b) => b.created_at - a.created_at);
  },
});

export const listDeltas = query({
  args: {
    entity_type: v.optional(entityTypeValidator),
    persona: v.optional(incentivePersonaValidator),
    from_date: v.optional(v.number()),
    to_date: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, SHADOW_MODE_VIEW_PERMISSION);
    assertDateRange(args.from_date, args.to_date);

    const limit = normalizeLimit(args.limit);
    const targetEntityTypes = args.entity_type ? [args.entity_type] : ENTITY_TYPES;
    const rowsByEntityType = await Promise.all(
      targetEntityTypes.map((entityType) =>
        queryByEntityType(ctx, {
          entity_type: entityType,
          persona: args.persona,
          from_date: args.from_date,
          to_date: args.to_date,
        }),
      ),
    );

    const deltas = rowsByEntityType
      .flat()
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);

    return {
      total_count: deltas.length,
      deltas,
    };
  },
});

export const getAggregateVariance = query({
  args: {
    entity_type: v.optional(entityTypeValidator),
    persona: v.optional(incentivePersonaValidator),
    from_date: v.optional(v.number()),
    to_date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, SHADOW_MODE_VIEW_PERMISSION);
    assertDateRange(args.from_date, args.to_date);

    const targetEntityTypes = args.entity_type ? [args.entity_type] : ENTITY_TYPES;
    const rowsByEntityType = await Promise.all(
      targetEntityTypes.map((entityType) =>
        queryByEntityType(ctx, {
          entity_type: entityType,
          persona: args.persona,
          from_date: args.from_date,
          to_date: args.to_date,
        }),
      ),
    );

    const deltas = rowsByEntityType.flat();
    const parsed = deltas
      .map((delta) => parseDeltaSummary(delta.delta_summary))
      .filter(
        (
          value,
        ): value is {
          signedDeltaPaise: number;
          percentageDelta: number | null;
        } => value !== null,
      );

    if (parsed.length === 0) {
      return {
        count: 0,
        avg_absolute_delta_paise: null,
        avg_percentage_delta: null,
        max_delta_paise: null,
        min_delta_paise: null,
        median_delta_paise: null,
      };
    }

    const signedDeltas = parsed.map((item) => item.signedDeltaPaise);
    const percentageDeltas = parsed
      .map((item) => item.percentageDelta)
      .filter((value): value is number => value !== null);

    const avgAbsoluteDelta =
      signedDeltas.reduce((sum, delta) => sum + Math.abs(delta), 0) / signedDeltas.length;
    const avgPercentageDelta =
      percentageDeltas.length === 0
        ? null
        : percentageDeltas.reduce((sum, value) => sum + value, 0) / percentageDeltas.length;

    return {
      count: parsed.length,
      avg_absolute_delta_paise: avgAbsoluteDelta,
      avg_percentage_delta: avgPercentageDelta,
      max_delta_paise: Math.max(...signedDeltas),
      min_delta_paise: Math.min(...signedDeltas),
      median_delta_paise: median(signedDeltas),
    };
  },
});

export const internalAssertManagePermission = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, SHADOW_MODE_MANAGE_PERMISSION);
    return true;
  },
});

export const internalListConfirmedClosures = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", CLOSURE_STATUS.CONFIRMED))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const internalGetV2PayoutSummary = internalQuery({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
      .collect();

    const v2Payouts = payouts.filter(
      (payout) => payout.status !== PAYOUT_STATUS.FAILED && payout.status !== PAYOUT_STATUS.VOIDED,
    );

    return {
      total_paise: v2Payouts.reduce((sum, payout) => sum + payout.amount_paise, 0),
      count: v2Payouts.length,
    };
  },
});

export const internalGetConfigVersionIdByVersionCode = internalQuery({
  args: {
    version_code: v.string(),
  },
  handler: async (ctx, args) => {
    const configVersion = await ctx.db
      .query("incentive_config_versions")
      .withIndex("by_version", (q) => q.eq("version_code", args.version_code))
      .first();

    return configVersion?._id;
  },
});

export const internalGetDeltaByClosureId = internalQuery({
  args: {
    closure_id: v.id("closures"),
    entity_type: v.optional(entityTypeValidator),
  },
  handler: async (ctx, args) => {
    const deltas = await ctx.db
      .query("shadow_mode_deltas")
      .withIndex("by_deal", (q) => q.eq("deal_id", args.closure_id))
      .collect();

    if (args.entity_type === undefined) {
      return deltas[0] ?? null;
    }

    return deltas.find((delta) => delta.entity_type === args.entity_type) ?? null;
  },
});

const shadowDeltaInsertArgs = {
  deal_id: v.id("closures"),
  entity_type: entityTypeValidator,
  persona: v.optional(incentivePersonaValidator),
  config_version_id: v.optional(v.id("incentive_config_versions")),
  v2_result_json: v.string(),
  v3_result_json: v.string(),
  delta_summary: v.string(),
  created_at: v.number(),
};

export const internalInsertDelta = internalMutation({
  args: shadowDeltaInsertArgs,
  handler: async (ctx, args) => {
    return await ctx.db.insert("shadow_mode_deltas", {
      deal_id: args.deal_id,
      entity_type: args.entity_type,
      persona: args.persona,
      config_version_id: args.config_version_id,
      v2_result_json: args.v2_result_json,
      v3_result_json: args.v3_result_json,
      delta_summary: args.delta_summary,
      created_at: args.created_at,
    });
  },
});

export const internalInsertDeltaIfMissing = internalMutation({
  args: shadowDeltaInsertArgs,
  handler: async (ctx, args) => {
    const existingDelta = (
      await ctx.db
        .query("shadow_mode_deltas")
        .withIndex("by_deal", (q) => q.eq("deal_id", args.deal_id))
        .collect()
    ).find((delta) => delta.entity_type === args.entity_type);

    if (existingDelta) {
      return existingDelta._id;
    }

    await assertShadowModeWriteEnabled(ctx);

    return await ctx.db.insert("shadow_mode_deltas", {
      deal_id: args.deal_id,
      entity_type: args.entity_type,
      persona: args.persona,
      config_version_id: args.config_version_id,
      v2_result_json: args.v2_result_json,
      v3_result_json: args.v3_result_json,
      delta_summary: args.delta_summary,
      created_at: args.created_at,
    });
  },
});
