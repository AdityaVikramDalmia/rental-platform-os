"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { action } from "../_generated/server";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

type ConfirmedClosureBatch = {
  page: Doc<"closures">[];
  isDone: boolean;
  continueCursor: string;
};

type RolloutPolicy = {
  mode: "OFF" | "SHADOW" | "PARTIAL" | "FULL";
};

const assertManagePermissionRef = internal.shadowMode.internalAssertManagePermission;
const listConfirmedClosuresRef = internal.shadowMode.internalListConfirmedClosures;
const getDeltaByClosureIdRef = internal.shadowMode.internalGetDeltaByClosureId;
const getV2PayoutSummaryRef = internal.shadowMode.internalGetV2PayoutSummary;
const getConfigVersionIdByVersionCodeRef =
  internal.shadowMode.internalGetConfigVersionIdByVersionCode;
const insertDeltaRef = internal.shadowMode.internalInsertDeltaIfMissing;
const getRolloutPolicyInternalRef = internal.shadowRollout.getRolloutPolicyInternal;
const isShadowModeEnabledInternalRef = internal.shadowRollout.isShadowModeEnabledInternal;
const evaluateInternalRef = internal.commissionEngine.evaluateInternal;

function normalizeBatchSize(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_BATCH_SIZE;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("batch_size must be a positive integer");
  }

  return Math.min(value, MAX_BATCH_SIZE);
}

export const run = action({
  args: {
    batch_size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(assertManagePermissionRef, {});

    const [rolloutPolicy, isShadowModeEnabled]: [RolloutPolicy, boolean] = await Promise.all([
      ctx.runQuery(getRolloutPolicyInternalRef, {}),
      ctx.runQuery(isShadowModeEnabledInternalRef, {}),
    ]);

    if (rolloutPolicy.mode === "FULL" || !isShadowModeEnabled) {
      throw new Error("Cannot backfill: shadow mode is decommissioned");
    }

    const batchSize = normalizeBatchSize(args.batch_size);
    let cursor: string | null = null;
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    while (true) {
      const batch: ConfirmedClosureBatch = await ctx.runQuery(listConfirmedClosuresRef, {
        paginationOpts: {
          numItems: batchSize,
          cursor,
        },
      });

      const [currentRolloutPolicy, isShadowModeStillEnabled]: [RolloutPolicy, boolean] =
        await Promise.all([
          ctx.runQuery(getRolloutPolicyInternalRef, {}),
          ctx.runQuery(isShadowModeEnabledInternalRef, {}),
        ]);

      if (currentRolloutPolicy.mode === "FULL" || !isShadowModeStillEnabled) {
        console.warn(
          `Shadow delta backfill aborted after ${processed} processed closures: shadow mode is decommissioned`,
        );
        break;
      }

      for (const closure of batch.page) {
        try {
          const existingDelta = await ctx.runQuery(getDeltaByClosureIdRef, {
            closure_id: closure._id,
            entity_type: "commission",
          });

          if (existingDelta) {
            skipped += 1;
            continue;
          }

          const [evaluation, v2Summary] = await Promise.all([
            ctx.runMutation(evaluateInternalRef, {
              closure_id: closure._id,
            }),
            ctx.runQuery(getV2PayoutSummaryRef, {
              closure_id: closure._id,
            }),
          ]);

          const configVersionId = await ctx.runQuery(getConfigVersionIdByVersionCodeRef, {
            version_code: evaluation.config_version,
          });

          const v2TotalPaise = v2Summary.total_paise;
          const v3TotalPaise = evaluation.incentive_pool_paise;
          const percentageDelta =
            v2TotalPaise === 0 ? null : ((v3TotalPaise - v2TotalPaise) / v2TotalPaise) * 100;

          const v2Result =
            v2Summary.count === 0
              ? {
                  total_paise: 0,
                  note: "no_v2_payouts_found",
                }
              : {
                  total_paise: v2TotalPaise,
                };

          const v3Result = {
            evaluation_id: evaluation._id,
            commission_pool_paise: evaluation.incentive_pool_paise,
            effective_rate_bps: evaluation.effective_rate_bps,
            base_rate_bps: evaluation.base_rate_bps,
            flat_bonus_paise: evaluation.flat_bonus_paise,
            commission_base_profit_paise: evaluation.commission_base_profit_paise,
            config_version: evaluation.config_version,
            persona: evaluation.persona,
            computed_at: evaluation.computed_at,
          };

          const deltaSummary = {
            v2_total_paise: v2TotalPaise,
            v3_total_paise: v3TotalPaise,
            absolute_delta_paise: v3TotalPaise - v2TotalPaise,
            percentage_delta: percentageDelta,
          };

          const shadowCreatedAt = closure.confirmed_at ?? closure._creationTime;

          await ctx.runMutation(insertDeltaRef, {
            deal_id: closure._id,
            entity_type: "commission",
            persona: evaluation.persona,
            config_version_id: configVersionId ?? undefined,
            v2_result_json: JSON.stringify(v2Result),
            v3_result_json: JSON.stringify(v3Result),
            delta_summary: JSON.stringify(deltaSummary),
            created_at: shadowCreatedAt,
          });

          processed += 1;
        } catch (error) {
          errors += 1;
          console.error(
            `Shadow delta backfill failed for closure ${closure._id}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      if (batch.isDone) {
        break;
      }

      cursor = batch.continueCursor;
    }

    return {
      processed,
      skipped,
      errors,
    };
  },
});
