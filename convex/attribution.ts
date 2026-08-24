import { anyApi, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  ATTRIBUTION_ALGORITHM,
  ATTRIBUTION_STAGE_WEIGHTS,
  ATTRIBUTION_STATUS,
  CONTRIBUTION_STAGE,
  DISBURSEMENT_STATUS,
  DISBURSEMENT_SOURCE_TYPE,
  INCENTIVE_PERSONA,
  PERMISSIONS,
  USER_TYPE,
} from "../lib/constants";
import { requireAuth, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";

const DEFAULT_QUALITY_SCORE = 50;
const MIN_QUALITY_SCORE = 30;
const STAGE_WEIGHT_SCALE_BPS = 10_000;
const ALGORITHM_VERSION_STAGE_WEIGHTED = "STAGE_WEIGHTED_QUALITY_V1";
const ALGORITHM_VERSION_MANUAL_OVERRIDE = "MANUAL_OVERRIDE_V1";

const STAGE_ORDER = [
  CONTRIBUTION_STAGE.DISCOVERY,
  CONTRIBUTION_STAGE.VERIFICATION,
  CONTRIBUTION_STAGE.CLOSURE,
  CONTRIBUTION_STAGE.SUPPORT,
] as const;

type Stage = (typeof STAGE_ORDER)[number];

type StageWeights = Record<Stage, number>;
type FunctionCtx = QueryCtx | MutationCtx;

type ActorAggregate = {
  recipient_user_id: Id<"users">;
  recipient_persona: Doc<"deal_contributions">["actor_persona"];
  contribution_ids: Set<Id<"deal_contributions">>;
  contribution_count: number;
  raw_points: number;
  adj_points: number;
  stage_points: Record<Stage, number>;
  exact_amount: number;
  provisional_amount_paise: number;
  amount_paise: number;
  residue: number;
  remainder_rank: number | undefined;
};

const incentivePersonaValidator = v.union(
  v.literal(INCENTIVE_PERSONA.GUARD),
  v.literal(INCENTIVE_PERSONA.OPS),
  v.literal(INCENTIVE_PERSONA.SALES),
  v.literal(INCENTIVE_PERSONA.RM),
  v.literal(INCENTIVE_PERSONA.LIAISON),
  v.literal(INCENTIVE_PERSONA.ALL),
);

const attributionStatusValidator = v.union(
  v.literal(ATTRIBUTION_STATUS.PROVISIONAL),
  v.literal(ATTRIBUTION_STATUS.FINAL),
  v.literal(ATTRIBUTION_STATUS.DISPUTED),
  v.literal(ATTRIBUTION_STATUS.RESOLVED),
);

const splitDistributionGroupByValidator = v.union(
  v.literal("persona"),
  v.literal("stage"),
  v.literal("algorithm"),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalIntegerPaise(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative whole number in paise`);
  }

  return value;
}

function assertValidTimeWindow(fromTs: number | undefined, toTs: number | undefined): void {
  if (fromTs !== undefined && toTs !== undefined && fromTs > toTs) {
    throw new Error("from_ts must be less than or equal to to_ts");
  }
}

function getDefaultStageWeightsBps(): StageWeights {
  return {
    [CONTRIBUTION_STAGE.DISCOVERY]: ATTRIBUTION_STAGE_WEIGHTS.DISCOVERY * 100,
    [CONTRIBUTION_STAGE.VERIFICATION]: ATTRIBUTION_STAGE_WEIGHTS.VERIFICATION * 100,
    [CONTRIBUTION_STAGE.CLOSURE]: ATTRIBUTION_STAGE_WEIGHTS.CLOSURE * 100,
    [CONTRIBUTION_STAGE.SUPPORT]: ATTRIBUTION_STAGE_WEIGHTS.SUPPORT * 100,
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function readStageWeightCandidate(
  source: Record<string, unknown>,
  key: Stage,
  fallback: number,
): number {
  const parsed = toFiniteNumber(source[key]);
  if (parsed === null) {
    return fallback;
  }

  return Math.max(0, parsed);
}

function normalizeStageWeightScale(weights: StageWeights): StageWeights {
  const values = STAGE_ORDER.map((stage) => weights[stage]);
  const maxValue = Math.max(...values);
  const totalRaw = values.reduce((sum, value) => sum + value, 0);

  if (totalRaw <= 0) {
    return getDefaultStageWeightsBps();
  }

  const sourceWeights =
    maxValue <= 100 && totalRaw <= 100 + Number.EPSILON
      ? {
          [CONTRIBUTION_STAGE.DISCOVERY]: weights[CONTRIBUTION_STAGE.DISCOVERY] * 100,
          [CONTRIBUTION_STAGE.VERIFICATION]: weights[CONTRIBUTION_STAGE.VERIFICATION] * 100,
          [CONTRIBUTION_STAGE.CLOSURE]: weights[CONTRIBUTION_STAGE.CLOSURE] * 100,
          [CONTRIBUTION_STAGE.SUPPORT]: weights[CONTRIBUTION_STAGE.SUPPORT] * 100,
        }
      : weights;

  const total = STAGE_ORDER.reduce((sum, stage) => sum + sourceWeights[stage], 0);
  if (total <= 0) {
    return getDefaultStageWeightsBps();
  }

  return {
    [CONTRIBUTION_STAGE.DISCOVERY]:
      (sourceWeights[CONTRIBUTION_STAGE.DISCOVERY] * STAGE_WEIGHT_SCALE_BPS) / total,
    [CONTRIBUTION_STAGE.VERIFICATION]:
      (sourceWeights[CONTRIBUTION_STAGE.VERIFICATION] * STAGE_WEIGHT_SCALE_BPS) / total,
    [CONTRIBUTION_STAGE.CLOSURE]:
      (sourceWeights[CONTRIBUTION_STAGE.CLOSURE] * STAGE_WEIGHT_SCALE_BPS) / total,
    [CONTRIBUTION_STAGE.SUPPORT]:
      (sourceWeights[CONTRIBUTION_STAGE.SUPPORT] * STAGE_WEIGHT_SCALE_BPS) / total,
  };
}

function parseStageWeightsFromConfigSnapshot(configSnapshot: string): StageWeights {
  const defaults = getDefaultStageWeightsBps();

  let parsed: unknown;
  try {
    parsed = JSON.parse(configSnapshot) as unknown;
  } catch {
    return defaults;
  }

  if (!isRecord(parsed)) {
    return defaults;
  }

  const root = parsed;

  const directAttributionWeights = isRecord(root.attribution_stage_weights)
    ? root.attribution_stage_weights
    : null;
  const directStageWeights = isRecord(root.stage_weights) ? root.stage_weights : null;
  const nestedAttribution = isRecord(root.attribution) ? root.attribution : null;
  const nestedAttributionWeights =
    nestedAttribution && isRecord(nestedAttribution.stage_weights)
      ? nestedAttribution.stage_weights
      : null;

  const source = directAttributionWeights ?? directStageWeights ?? nestedAttributionWeights;
  if (!source) {
    return defaults;
  }

  return normalizeStageWeightScale({
    [CONTRIBUTION_STAGE.DISCOVERY]: readStageWeightCandidate(
      source,
      CONTRIBUTION_STAGE.DISCOVERY,
      defaults[CONTRIBUTION_STAGE.DISCOVERY],
    ),
    [CONTRIBUTION_STAGE.VERIFICATION]: readStageWeightCandidate(
      source,
      CONTRIBUTION_STAGE.VERIFICATION,
      defaults[CONTRIBUTION_STAGE.VERIFICATION],
    ),
    [CONTRIBUTION_STAGE.CLOSURE]: readStageWeightCandidate(
      source,
      CONTRIBUTION_STAGE.CLOSURE,
      defaults[CONTRIBUTION_STAGE.CLOSURE],
    ),
    [CONTRIBUTION_STAGE.SUPPORT]: readStageWeightCandidate(
      source,
      CONTRIBUTION_STAGE.SUPPORT,
      defaults[CONTRIBUTION_STAGE.SUPPORT],
    ),
  });
}

function getEligibleContributionWeight(contribution: Doc<"deal_contributions">): number {
  const qualityScore = contribution.quality_score_snapshot ?? DEFAULT_QUALITY_SCORE;
  if (!Number.isFinite(qualityScore) || qualityScore < MIN_QUALITY_SCORE) {
    return 0;
  }

  if (!Number.isFinite(contribution.contribution_units) || contribution.contribution_units <= 0) {
    return 0;
  }

  const cappedQualityScore = Math.min(qualityScore, 200);
  const qualityMultiplier = 0.5 + cappedQualityScore / 200;
  return contribution.contribution_units * qualityMultiplier;
}

function redistributeWeightsToNonEmptyStages(
  stageWeightsBps: StageWeights,
  nonEmptyStages: Set<Stage>,
): StageWeights {
  const totalNonEmptyWeight = STAGE_ORDER.reduce((sum, stage) => {
    return sum + (nonEmptyStages.has(stage) ? stageWeightsBps[stage] : 0);
  }, 0);

  if (totalNonEmptyWeight <= 0) {
    return {
      [CONTRIBUTION_STAGE.DISCOVERY]: 0,
      [CONTRIBUTION_STAGE.VERIFICATION]: 0,
      [CONTRIBUTION_STAGE.CLOSURE]: 0,
      [CONTRIBUTION_STAGE.SUPPORT]: 0,
    };
  }

  return {
    [CONTRIBUTION_STAGE.DISCOVERY]: nonEmptyStages.has(CONTRIBUTION_STAGE.DISCOVERY)
      ? (stageWeightsBps[CONTRIBUTION_STAGE.DISCOVERY] * STAGE_WEIGHT_SCALE_BPS) /
        totalNonEmptyWeight
      : 0,
    [CONTRIBUTION_STAGE.VERIFICATION]: nonEmptyStages.has(CONTRIBUTION_STAGE.VERIFICATION)
      ? (stageWeightsBps[CONTRIBUTION_STAGE.VERIFICATION] * STAGE_WEIGHT_SCALE_BPS) /
        totalNonEmptyWeight
      : 0,
    [CONTRIBUTION_STAGE.CLOSURE]: nonEmptyStages.has(CONTRIBUTION_STAGE.CLOSURE)
      ? (stageWeightsBps[CONTRIBUTION_STAGE.CLOSURE] * STAGE_WEIGHT_SCALE_BPS) / totalNonEmptyWeight
      : 0,
    [CONTRIBUTION_STAGE.SUPPORT]: nonEmptyStages.has(CONTRIBUTION_STAGE.SUPPORT)
      ? (stageWeightsBps[CONTRIBUTION_STAGE.SUPPORT] * STAGE_WEIGHT_SCALE_BPS) / totalNonEmptyWeight
      : 0,
  };
}

function ensureActorAggregate(
  map: Map<string, ActorAggregate>,
  recipientUserId: Id<"users">,
  recipientPersona: Doc<"deal_contributions">["actor_persona"],
): ActorAggregate {
  const key = `${recipientUserId}`;
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const actor: ActorAggregate = {
    recipient_user_id: recipientUserId,
    recipient_persona: recipientPersona,
    contribution_ids: new Set(),
    contribution_count: 0,
    raw_points: 0,
    adj_points: 0,
    stage_points: {
      [CONTRIBUTION_STAGE.DISCOVERY]: 0,
      [CONTRIBUTION_STAGE.VERIFICATION]: 0,
      [CONTRIBUTION_STAGE.CLOSURE]: 0,
      [CONTRIBUTION_STAGE.SUPPORT]: 0,
    },
    exact_amount: 0,
    provisional_amount_paise: 0,
    amount_paise: 0,
    residue: 0,
    remainder_rank: undefined,
  };

  map.set(key, actor);
  return actor;
}

function getPrimaryStage(stagePoints: Record<Stage, number>): Stage | undefined {
  let primary: Stage | undefined;
  let maxPoints = -1;

  for (const stage of STAGE_ORDER) {
    const points = stagePoints[stage];
    if (points > maxPoints) {
      maxPoints = points;
      primary = stage;
    }
  }

  return maxPoints > 0 ? primary : undefined;
}

async function getLatestAttributionTip(
  ctx: FunctionCtx,
  closureId: Id<"closures">,
): Promise<Doc<"attribution_records"> | null> {
  const records = await ctx.db
    .query("attribution_records")
    .withIndex("by_closure", (q) => q.eq("closure_id", closureId))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  if (records.length === 0) {
    return null;
  }

  const supersededIds = new Set(
    records
      .map((record) => record.supersedes_record_id)
      .filter((value): value is Id<"attribution_records"> => value !== undefined),
  );

  const tipCandidates = records.filter((record) => !supersededIds.has(record._id));
  if (tipCandidates.length === 0) {
    return records.sort((left, right) => right.computed_at - left.computed_at)[0] ?? null;
  }

  return (
    tipCandidates.sort((left, right) => {
      if (left.computed_at !== right.computed_at) {
        return right.computed_at - left.computed_at;
      }

      return `${left._id}`.localeCompare(`${right._id}`);
    })[0] ?? null
  );
}

function mapUserToIncentivePersona(user: Doc<"users">): Doc<"deal_contributions">["actor_persona"] {
  if (user.user_type === USER_TYPE.GUARD) {
    return INCENTIVE_PERSONA.GUARD;
  }

  if (user.user_type === USER_TYPE.OPS) {
    return INCENTIVE_PERSONA.OPS;
  }

  if (user.user_type === USER_TYPE.TENANT) {
    return INCENTIVE_PERSONA.SALES;
  }

  if (user.user_type === USER_TYPE.OWNER) {
    return INCENTIVE_PERSONA.RM;
  }

  return INCENTIVE_PERSONA.ALL;
}

const createFromSplitRef = internal.incentiveDisbursements.createFromSplit;

export const computeAttribution = internalMutation({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    const closure = await ctx.db.get(args.closure_id);
    if (!closure) {
      throw new Error("Closure not found");
    }

    const latestAttribution = await getLatestAttributionTip(ctx, args.closure_id);
    if (latestAttribution) {
      const existingSplitCount = await ctx.db
        .query("attribution_splits")
        .withIndex("by_attribution", (q) => q.eq("attribution_record_id", latestAttribution._id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect();

      if (
        latestAttribution.status === ATTRIBUTION_STATUS.FINAL ||
        latestAttribution.status === ATTRIBUTION_STATUS.DISPUTED ||
        latestAttribution.status === ATTRIBUTION_STATUS.RESOLVED
      ) {
        console.warn(
          `Skipping attribution recompute for closure ${args.closure_id}: latest attribution ${latestAttribution._id} is ${latestAttribution.status}.`,
        );
        return {
          attribution_record_id: latestAttribution._id,
          split_count: existingSplitCount.length,
          skipped: true,
        };
      }

      if (latestAttribution.status === ATTRIBUTION_STATUS.PROVISIONAL) {
        return {
          attribution_record_id: latestAttribution._id,
          split_count: existingSplitCount.length,
          skipped: true,
        };
      }

      return {
        attribution_record_id: latestAttribution._id,
        split_count: existingSplitCount.length,
        skipped: true,
      };
    }

    const [contributions, evaluation] = await Promise.all([
      ctx.db
        .query("deal_contributions")
        .withIndex("by_closure", (q) => q.eq("closure_id", args.closure_id))
        .filter((q) => q.eq(q.field("is_voided"), false))
        .filter((q) => q.eq(q.field("is_deleted"), false))
        .collect(),
      ctx.db
        .query("deal_commission_evaluations")
        .withIndex("by_closure", (q) => q.eq("closure_id", args.closure_id))
        .filter((q) => q.neq(q.field("status"), "VOIDED"))
        .order("desc")
        .first(),
    ]);

    if (!evaluation) {
      throw new Error("Commission evaluation not found for closure");
    }

    const poolAmountPaise = Math.max(0, Math.floor(evaluation.incentive_pool_paise));
    const stageWeights = parseStageWeightsFromConfigSnapshot(evaluation.config_snapshot);

    const stageActorMaps = new Map<
      Stage,
      Map<string, { contribution: Doc<"deal_contributions">; weight: number }[]>
    >();
    for (const stage of STAGE_ORDER) {
      stageActorMaps.set(stage, new Map());
    }

    for (const contribution of contributions) {
      const weight = getEligibleContributionWeight(contribution);
      if (weight <= 0) {
        continue;
      }

      const stage = contribution.stage as Stage;
      const perStage = stageActorMaps.get(stage);
      if (!perStage) {
        continue;
      }

      const actorKey = `${contribution.actor_user_id}`;
      const list = perStage.get(actorKey) ?? [];
      list.push({ contribution, weight });
      perStage.set(actorKey, list);
    }

    const nonEmptyStages = new Set<Stage>(
      STAGE_ORDER.filter((stage) => {
        const perStage = stageActorMaps.get(stage);
        return perStage !== undefined && perStage.size > 0;
      }),
    );

    if (nonEmptyStages.size === 0) {
      return {
        attribution_record_id: null,
        split_count: 0,
        skipped: true,
      };
    }

    const redistributedWeights = redistributeWeightsToNonEmptyStages(stageWeights, nonEmptyStages);

    const stageBucketFloor: Record<Stage, number> = {
      [CONTRIBUTION_STAGE.DISCOVERY]: Math.floor(
        (poolAmountPaise * redistributedWeights[CONTRIBUTION_STAGE.DISCOVERY]) /
          STAGE_WEIGHT_SCALE_BPS,
      ),
      [CONTRIBUTION_STAGE.VERIFICATION]: Math.floor(
        (poolAmountPaise * redistributedWeights[CONTRIBUTION_STAGE.VERIFICATION]) /
          STAGE_WEIGHT_SCALE_BPS,
      ),
      [CONTRIBUTION_STAGE.CLOSURE]: Math.floor(
        (poolAmountPaise * redistributedWeights[CONTRIBUTION_STAGE.CLOSURE]) /
          STAGE_WEIGHT_SCALE_BPS,
      ),
      [CONTRIBUTION_STAGE.SUPPORT]: Math.floor(
        (poolAmountPaise * redistributedWeights[CONTRIBUTION_STAGE.SUPPORT]) /
          STAGE_WEIGHT_SCALE_BPS,
      ),
    };

    const stageBucketExact: Record<Stage, number> = {
      [CONTRIBUTION_STAGE.DISCOVERY]:
        (poolAmountPaise * redistributedWeights[CONTRIBUTION_STAGE.DISCOVERY]) /
        STAGE_WEIGHT_SCALE_BPS,
      [CONTRIBUTION_STAGE.VERIFICATION]:
        (poolAmountPaise * redistributedWeights[CONTRIBUTION_STAGE.VERIFICATION]) /
        STAGE_WEIGHT_SCALE_BPS,
      [CONTRIBUTION_STAGE.CLOSURE]:
        (poolAmountPaise * redistributedWeights[CONTRIBUTION_STAGE.CLOSURE]) /
        STAGE_WEIGHT_SCALE_BPS,
      [CONTRIBUTION_STAGE.SUPPORT]:
        (poolAmountPaise * redistributedWeights[CONTRIBUTION_STAGE.SUPPORT]) /
        STAGE_WEIGHT_SCALE_BPS,
    };

    const actors = new Map<string, ActorAggregate>();

    for (const stage of STAGE_ORDER) {
      const perStage = stageActorMaps.get(stage);
      if (!perStage || perStage.size === 0) {
        continue;
      }

      const actorRows = Array.from(perStage.values()).map((rows) => {
        const first = rows[0]!;
        return {
          recipient_user_id: first.contribution.actor_user_id,
          recipient_persona: first.contribution.actor_persona,
          contribution_ids: rows.map((row) => row.contribution._id),
          contribution_count: rows.length,
          raw_points: rows.reduce((sum, row) => sum + row.contribution.contribution_units, 0),
          adj_points: rows.reduce((sum, row) => sum + row.weight, 0),
        };
      });

      const stageWeightTotal = actorRows.reduce((sum, row) => sum + row.adj_points, 0);
      if (stageWeightTotal <= 0) {
        continue;
      }

      for (const actorRow of actorRows) {
        const aggregate = ensureActorAggregate(
          actors,
          actorRow.recipient_user_id,
          actorRow.recipient_persona,
        );

        const exactFromStage = (stageBucketExact[stage] * actorRow.adj_points) / stageWeightTotal;
        const floorFromStage = Math.floor(
          (stageBucketFloor[stage] * actorRow.adj_points) / stageWeightTotal,
        );

        aggregate.exact_amount += exactFromStage;
        aggregate.provisional_amount_paise += floorFromStage;
        aggregate.amount_paise += floorFromStage;
        aggregate.raw_points += actorRow.raw_points;
        aggregate.adj_points += actorRow.adj_points;
        aggregate.contribution_count += actorRow.contribution_count;
        aggregate.stage_points[stage] += actorRow.adj_points;

        for (const contributionId of actorRow.contribution_ids) {
          aggregate.contribution_ids.add(contributionId);
        }
      }
    }

    const actorList = Array.from(actors.values());
    if (actorList.length === 0) {
      return {
        attribution_record_id: null,
        split_count: 0,
        skipped: true,
      };
    }

    const sumFloor = actorList.reduce((sum, actor) => sum + actor.provisional_amount_paise, 0);
    let remainder = poolAmountPaise - sumFloor;

    for (const actor of actorList) {
      actor.residue = actor.exact_amount - actor.provisional_amount_paise;
    }

    const rankedByResidue = [...actorList].sort((left, right) => {
      if (left.residue !== right.residue) {
        return right.residue - left.residue;
      }

      return `${left.recipient_user_id}`.localeCompare(`${right.recipient_user_id}`);
    });

    let distributeCursor = 0;
    while (remainder > 0 && rankedByResidue.length > 0) {
      const idx = distributeCursor % rankedByResidue.length;
      const actor = rankedByResidue[idx]!;
      actor.amount_paise += 1;
      if (actor.remainder_rank === undefined) {
        actor.remainder_rank = idx + 1;
      }

      remainder -= 1;
      distributeCursor += 1;
    }

    const totalFinal = actorList.reduce((sum, actor) => sum + actor.amount_paise, 0);
    if (totalFinal !== poolAmountPaise) {
      throw new Error("Attribution split total does not match pool amount");
    }

    const now = Date.now();
    const attributionRecordId = await ctx.db.insert("attribution_records", {
      closure_id: closure._id,
      lead_id: closure.lead_id,
      deal_commission_evaluation_id: evaluation._id,
      algorithm: ATTRIBUTION_ALGORITHM.STAGE_WEIGHTED_QUALITY,
      algorithm_version: ALGORITHM_VERSION_STAGE_WEIGHTED,
      pool_amount_paise: poolAmountPaise,
      total_adj_points: actorList.reduce((sum, actor) => sum + actor.adj_points, 0),
      config_version: evaluation.config_version,
      config_snapshot: evaluation.config_snapshot,
      status: ATTRIBUTION_STATUS.PROVISIONAL,
      dispute_reason: undefined,
      disputed_by_admin_id: undefined,
      disputed_at: undefined,
      override_reason: undefined,
      overridden_by_admin_id: undefined,
      overridden_at: undefined,
      resolved_by_admin_id: undefined,
      resolution_notes: undefined,
      supersedes_record_id: undefined,
      computed_at: now,
      finalized_at: undefined,
      resolved_at: undefined,
      is_deleted: false,
    });

    await Promise.all(
      actorList.map(async (actor) => {
        const contributionIds = [...actor.contribution_ids].sort((left, right) =>
          `${left}`.localeCompare(`${right}`),
        );

        const primaryStage = getPrimaryStage(actor.stage_points);
        const shareBps =
          poolAmountPaise > 0
            ? Math.floor((actor.amount_paise * STAGE_WEIGHT_SCALE_BPS) / poolAmountPaise)
            : 0;
        const shareBpsDisplay =
          poolAmountPaise > 0
            ? Math.floor(
                (actor.provisional_amount_paise * STAGE_WEIGHT_SCALE_BPS) /
                  Math.max(1, poolAmountPaise),
              )
            : 0;

        await ctx.db.insert("attribution_splits", {
          attribution_record_id: attributionRecordId,
          closure_id: closure._id,
          recipient_user_id: actor.recipient_user_id,
          recipient_persona: actor.recipient_persona,
          primary_stage: primaryStage,
          contribution_count: actor.contribution_count,
          raw_points: actor.raw_points,
          adj_points: actor.adj_points,
          share_bps: shareBps,
          share_bps_display: shareBpsDisplay,
          provisional_amount_paise: actor.provisional_amount_paise,
          residue_numerator: Math.floor(actor.residue * 1_000_000),
          remainder_rank: actor.remainder_rank,
          amount_paise: actor.amount_paise,
          contribution_points: actor.adj_points,
          contribution_ids: contributionIds,
          is_manual_override: false,
          notes: undefined,
          created_at: now,
          is_deleted: false,
        });
      }),
    );

    return {
      attribution_record_id: attributionRecordId,
      split_count: actorList.length,
      skipped: false,
    };
  },
});

export const finalizeAttribution = internalMutation({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    const latestAttribution = await getLatestAttributionTip(ctx, args.closure_id);
    if (!latestAttribution) {
      throw new Error("No attribution record found for closure");
    }

    if (
      latestAttribution.status === ATTRIBUTION_STATUS.FINAL ||
      latestAttribution.status === ATTRIBUTION_STATUS.DISPUTED ||
      latestAttribution.status === ATTRIBUTION_STATUS.RESOLVED
    ) {
      console.warn(
        `Skipping attribution finalization for closure ${args.closure_id}: latest attribution ${latestAttribution._id} is ${latestAttribution.status}.`,
      );
      return latestAttribution;
    }

    if (latestAttribution.status !== ATTRIBUTION_STATUS.PROVISIONAL) {
      console.warn(
        `Skipping attribution finalization for closure ${args.closure_id}: latest attribution ${latestAttribution._id} is ${latestAttribution.status}.`,
      );
      return latestAttribution;
    }

    const attributionRecord = latestAttribution;

    const rolloutPolicy = await ctx.runQuery(anyApi["shadowRollout"].getRolloutPolicyInternal, {});

    const finalizedAt = Date.now();
    await ctx.db.patch(attributionRecord._id, {
      status: ATTRIBUTION_STATUS.FINAL,
      finalized_at: finalizedAt,
    });

    const splits = await ctx.db
      .query("attribution_splits")
      .withIndex("by_attribution", (q) => q.eq("attribution_record_id", attributionRecord._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    await Promise.all(
      splits
        .filter((split) => split.amount_paise > 0)
        .map(async (split) => {
          await ctx.runMutation(createFromSplitRef, {
            recipient_user_id: split.recipient_user_id,
            recipient_persona: split.recipient_persona,
            source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
            source_record_id: `${split._id}`,
            source_key: `${DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT}:${split._id}`,
            closure_id: split.closure_id,
            amount_paise: split.amount_paise,
            rollout_policy_override: rolloutPolicy,
          });
        }),
    );

    return await ctx.db.get(attributionRecord._id);
  },
});

export const disputeAttribution = mutation({
  args: {
    attribution_record_id: v.id("attribution_records"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_DISPUTE);
    const attributionRecord = await ctx.db.get(args.attribution_record_id);

    if (!attributionRecord || attributionRecord.is_deleted) {
      throw new Error("Attribution record not found");
    }

    if (attributionRecord.status !== ATTRIBUTION_STATUS.FINAL) {
      throw new Error(`Only ${ATTRIBUTION_STATUS.FINAL} attribution records can be disputed`);
    }

    await ctx.db.patch(attributionRecord._id, {
      status: ATTRIBUTION_STATUS.DISPUTED,
      dispute_reason: normalizeRequiredString(args.reason, "reason"),
      disputed_by_admin_id: admin._id,
      disputed_at: Date.now(),
    });

    return await ctx.db.get(attributionRecord._id);
  },
});

export const overrideAttribution = mutation({
  args: {
    attribution_record_id: v.id("attribution_records"),
    manual_splits: v.array(
      v.object({
        recipient_user_id: v.id("users"),
        amount_paise: v.number(),
        notes: v.optional(v.string()),
      }),
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_OVERRIDE);
    const sourceRecord = await ctx.db.get(args.attribution_record_id);

    if (!sourceRecord || sourceRecord.is_deleted) {
      throw new Error("Attribution record not found");
    }

    if (sourceRecord.status !== ATTRIBUTION_STATUS.DISPUTED) {
      throw new Error(`Only ${ATTRIBUTION_STATUS.DISPUTED} attribution records can be overridden`);
    }

    const existingOverrideRecord = await ctx.db
      .query("attribution_records")
      .withIndex("by_supersedes_record_id", (q) => q.eq("supersedes_record_id", sourceRecord._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    if (existingOverrideRecord) {
      throw new Error("Attribution record already superseded by a previous override");
    }

    if (args.manual_splits.length === 0) {
      throw new Error("manual_splits must include at least one recipient");
    }

    const normalizedReason = normalizeRequiredString(args.reason, "reason");

    const previousSplits = await ctx.db
      .query("attribution_splits")
      .withIndex("by_attribution", (q) => q.eq("attribution_record_id", sourceRecord._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const previousPersonaByUser = new Map<string, Doc<"deal_contributions">["actor_persona"]>();
    for (const split of previousSplits) {
      previousPersonaByUser.set(`${split.recipient_user_id}`, split.recipient_persona);
    }

    const mergedSplitsByUser = new Map<
      string,
      { recipient_user_id: Id<"users">; amount_paise: number; notes: string | undefined }
    >();
    for (const split of args.manual_splits) {
      const amountPaise = normalizeOptionalIntegerPaise(split.amount_paise, "amount_paise");
      const key = `${split.recipient_user_id}`;
      const existing = mergedSplitsByUser.get(key);
      if (existing) {
        mergedSplitsByUser.set(key, {
          recipient_user_id: split.recipient_user_id,
          amount_paise: existing.amount_paise + amountPaise,
          notes: existing.notes ?? normalizeOptionalString(split.notes),
        });
        continue;
      }

      mergedSplitsByUser.set(key, {
        recipient_user_id: split.recipient_user_id,
        amount_paise: amountPaise,
        notes: normalizeOptionalString(split.notes),
      });
    }

    const normalizedSplits = Array.from(mergedSplitsByUser.values());
    const splitTotal = normalizedSplits.reduce((sum, split) => sum + split.amount_paise, 0);

    if (splitTotal !== sourceRecord.pool_amount_paise) {
      throw new Error("manual_splits total must equal pool_amount_paise exactly");
    }

    const recipientUsers = await Promise.all(
      normalizedSplits.map((split) => ctx.db.get(split.recipient_user_id)),
    );

    for (const [idx, recipient] of recipientUsers.entries()) {
      if (!recipient) {
        throw new Error(`Recipient user not found for manual split at index ${idx}`);
      }
    }

    const disbursementsForClosure = await ctx.db
      .query("incentive_disbursements")
      .withIndex("by_closure", (q) => q.eq("closure_id", sourceRecord.closure_id))
      .filter((q) => q.eq(q.field("source_type"), DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT))
      .collect();

    const hasBlockingDisbursements = disbursementsForClosure.some(
      (disbursement) =>
        disbursement.status === DISBURSEMENT_STATUS.DISBURSED ||
        disbursement.status === DISBURSEMENT_STATUS.FAILED,
    );

    if (hasBlockingDisbursements) {
      throw new Error(
        "Cannot override attribution: disbursements already sent. Use compensating reversal flow instead.",
      );
    }

    const rolloutPolicy = await ctx.runQuery(anyApi["shadowRollout"].getRolloutPolicyInternal, {});

    const now = Date.now();
    const newRecordId = await ctx.db.insert("attribution_records", {
      closure_id: sourceRecord.closure_id,
      lead_id: sourceRecord.lead_id,
      deal_commission_evaluation_id: sourceRecord.deal_commission_evaluation_id,
      algorithm: ATTRIBUTION_ALGORITHM.MANUAL_OVERRIDE,
      algorithm_version: ALGORITHM_VERSION_MANUAL_OVERRIDE,
      pool_amount_paise: sourceRecord.pool_amount_paise,
      total_adj_points: undefined,
      config_version: sourceRecord.config_version,
      config_snapshot: sourceRecord.config_snapshot,
      status: ATTRIBUTION_STATUS.RESOLVED,
      dispute_reason: sourceRecord.dispute_reason,
      disputed_by_admin_id: sourceRecord.disputed_by_admin_id,
      disputed_at: sourceRecord.disputed_at,
      override_reason: normalizedReason,
      overridden_by_admin_id: admin._id,
      overridden_at: now,
      resolved_by_admin_id: admin._id,
      resolution_notes: normalizedReason,
      supersedes_record_id: sourceRecord._id,
      computed_at: now,
      finalized_at: sourceRecord.finalized_at,
      resolved_at: now,
      is_deleted: false,
    });

    const voidableDisbursements = disbursementsForClosure.filter(
      (disbursement) =>
        disbursement.status === DISBURSEMENT_STATUS.PENDING ||
        disbursement.status === DISBURSEMENT_STATUS.APPROVED,
    );

    if (voidableDisbursements.length > 0) {
      console.warn(
        `Voiding ${voidableDisbursements.length} disbursement(s) for closure ${sourceRecord.closure_id}: superseded by attribution override.`,
      );
      await Promise.all(
        voidableDisbursements.map(async (disbursement) => {
          await ctx.db.patch(disbursement._id, {
            status: DISBURSEMENT_STATUS.VOIDED,
          });
        }),
      );
    }

    await Promise.all(
      normalizedSplits.map(async (split, idx) => {
        const recipient = recipientUsers[idx]!;
        const recipientPersona =
          previousPersonaByUser.get(`${split.recipient_user_id}`) ??
          mapUserToIncentivePersona(recipient);

        const shareBps =
          sourceRecord.pool_amount_paise > 0
            ? Math.floor(
                (split.amount_paise * STAGE_WEIGHT_SCALE_BPS) / sourceRecord.pool_amount_paise,
              )
            : 0;

        const splitId = await ctx.db.insert("attribution_splits", {
          attribution_record_id: newRecordId,
          closure_id: sourceRecord.closure_id,
          recipient_user_id: split.recipient_user_id,
          recipient_persona: recipientPersona,
          primary_stage: undefined,
          contribution_count: 0,
          raw_points: 0,
          adj_points: 0,
          share_bps: shareBps,
          share_bps_display: shareBps,
          provisional_amount_paise: split.amount_paise,
          residue_numerator: 0,
          remainder_rank: idx + 1,
          amount_paise: split.amount_paise,
          contribution_points: 0,
          contribution_ids: [],
          is_manual_override: true,
          notes: split.notes,
          created_at: now,
          is_deleted: false,
        });

        if (split.amount_paise > 0) {
          const replacementDisbursementId = await ctx.runMutation(createFromSplitRef, {
            recipient_user_id: split.recipient_user_id,
            recipient_persona: recipientPersona,
            source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
            source_record_id: `${splitId}`,
            source_key: `${DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT}:${splitId}`,
            closure_id: sourceRecord.closure_id,
            amount_paise: split.amount_paise,
            rollout_policy_override: rolloutPolicy,
          });

          if (replacementDisbursementId === null) {
            throw new Error(
              "Cannot override: rollout state would prevent replacement disbursements",
            );
          }
        }
      }),
    );

    return {
      attribution_record: await ctx.db.get(newRecordId),
      split_count: normalizedSplits.length,
    };
  },
});

export const getAttribution = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_VIEW);

    const record = await getLatestAttributionTip(ctx, args.closure_id);
    if (!record) {
      return null;
    }

    const splits = await ctx.db
      .query("attribution_splits")
      .withIndex("by_attribution", (q) => q.eq("attribution_record_id", record._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const sortedSplits = splits.sort((left, right) => {
      if (left.amount_paise !== right.amount_paise) {
        return right.amount_paise - left.amount_paise;
      }
      return `${left.recipient_user_id}`.localeCompare(`${right.recipient_user_id}`);
    });

    return {
      record,
      splits: sortedSplits,
    };
  },
});

export const getMyEarnings = query({
  args: {
    from_ts: v.optional(v.number()),
    to_ts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    assertValidTimeWindow(args.from_ts, args.to_ts);

    const splitsQuery =
      args.from_ts !== undefined && args.to_ts !== undefined
        ? ctx.db
            .query("attribution_splits")
            .withIndex("by_recipient", (q) =>
              q
                .eq("recipient_user_id", user._id)
                .gte("created_at", args.from_ts!)
                .lte("created_at", args.to_ts!),
            )
        : args.from_ts !== undefined
          ? ctx.db
              .query("attribution_splits")
              .withIndex("by_recipient", (q) =>
                q.eq("recipient_user_id", user._id).gte("created_at", args.from_ts!),
              )
          : args.to_ts !== undefined
            ? ctx.db
                .query("attribution_splits")
                .withIndex("by_recipient", (q) =>
                  q.eq("recipient_user_id", user._id).lte("created_at", args.to_ts!),
                )
            : ctx.db
                .query("attribution_splits")
                .withIndex("by_recipient", (q) => q.eq("recipient_user_id", user._id));

    return await splitsQuery
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .collect();
  },
});

export const listByWindow = query({
  args: {
    paginationOpts: paginationOptsValidator,
    from_ts: v.optional(v.number()),
    to_ts: v.optional(v.number()),
    status: v.optional(attributionStatusValidator),
    persona: v.optional(incentivePersonaValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_VIEW);
    assertValidTimeWindow(args.from_ts, args.to_ts);

    let recordsQuery = args.status
      ? ctx.db
          .query("attribution_records")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
      : ctx.db.query("attribution_records");

    recordsQuery = recordsQuery.filter((q) => q.neq(q.field("is_deleted"), true));

    if (args.from_ts !== undefined) {
      recordsQuery = recordsQuery.filter((q) => q.gte(q.field("computed_at"), args.from_ts!));
    }

    if (args.to_ts !== undefined) {
      recordsQuery = recordsQuery.filter((q) => q.lte(q.field("computed_at"), args.to_ts!));
    }

    const paginated = await recordsQuery.order("desc").paginate(args.paginationOpts);

    const page = (
      await Promise.all(
        paginated.page.map(async (record) => {
          const splits = await ctx.db
            .query("attribution_splits")
            .withIndex("by_attribution", (q) => q.eq("attribution_record_id", record._id))
            .filter((q) => q.neq(q.field("is_deleted"), true))
            .collect();

          if (
            args.persona !== undefined &&
            !splits.some((split) => split.recipient_persona === args.persona)
          ) {
            return null;
          }

          return {
            record,
            splits,
            total_split_amount_paise: splits.reduce((sum, split) => sum + split.amount_paise, 0),
          };
        }),
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      ...paginated,
      page,
    };
  },
});

export const getDisputeQueue = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_DISPUTE);

    const [disputed, resolved] = await Promise.all([
      ctx.db
        .query("attribution_records")
        .withIndex("by_status", (q) => q.eq("status", ATTRIBUTION_STATUS.DISPUTED))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db
        .query("attribution_records")
        .withIndex("by_status", (q) => q.eq("status", ATTRIBUTION_STATUS.RESOLVED))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
    ]);

    return [...disputed, ...resolved].sort((left, right) => right.computed_at - left.computed_at);
  },
});

export const getSplitDistributionSummary = query({
  args: {
    from_ts: v.number(),
    to_ts: v.number(),
    group_by: splitDistributionGroupByValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ATTRIBUTION_VIEW);
    assertValidTimeWindow(args.from_ts, args.to_ts);

    const records = await ctx.db
      .query("attribution_records")
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .filter((q) => q.gte(q.field("computed_at"), args.from_ts))
      .filter((q) => q.lte(q.field("computed_at"), args.to_ts))
      .collect();

    const splitsByRecord = await Promise.all(
      records.map(async (record) => {
        const splits = await ctx.db
          .query("attribution_splits")
          .withIndex("by_attribution", (q) => q.eq("attribution_record_id", record._id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .collect();

        return {
          record,
          splits,
        };
      }),
    );

    const buckets = new Map<
      string,
      {
        key: string;
        amount_paise: number;
        split_count: number;
        record_ids: Set<Id<"attribution_records">>;
      }
    >();

    for (const entry of splitsByRecord) {
      for (const split of entry.splits) {
        const key =
          args.group_by === "persona"
            ? split.recipient_persona
            : args.group_by === "stage"
              ? (split.primary_stage ?? "UNSPECIFIED")
              : `${entry.record.algorithm}:${entry.record.algorithm_version}`;

        const bucket = buckets.get(key) ?? {
          key,
          amount_paise: 0,
          split_count: 0,
          record_ids: new Set<Id<"attribution_records">>(),
        };

        bucket.amount_paise += split.amount_paise;
        bucket.split_count += 1;
        bucket.record_ids.add(entry.record._id);
        buckets.set(key, bucket);
      }
    }

    const items = Array.from(buckets.values())
      .map((bucket) => ({
        key: bucket.key,
        amount_paise: bucket.amount_paise,
        split_count: bucket.split_count,
        record_count: bucket.record_ids.size,
      }))
      .sort((left, right) => right.amount_paise - left.amount_paise);

    return {
      from_ts: args.from_ts,
      to_ts: args.to_ts,
      group_by: args.group_by,
      total_amount_paise: items.reduce((sum, item) => sum + item.amount_paise, 0),
      total_split_count: items.reduce((sum, item) => sum + item.split_count, 0),
      items,
    };
  },
});
