"use node";

import { v } from "convex/values";
import { INCENTIVE_PERSONA } from "../../lib/constants";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 50;
const MAX_LEVEL = 100;
const SOURCE_TYPE = "V2_MIGRATION";

type PlannedGamificationProfile = {
  user_id: Id<"users">;
  xp: number;
  level: number;
  current_streak_days: number;
  weekly_xp: number;
  monthly_xp: number;
  lifetime_quests_completed: number;
  migration_run_id: string;
};

type PlannedDisbursement = {
  source_type: "V2_MIGRATION";
  source_key: string;
  status: "DISBURSED";
  amount_paise: number;
  recipient_user_id: Id<"users">;
  persona: "GUARD";
  migration_run_id: string;
};

type MigrationReadiness = {
  feature_flags: Record<string, unknown>;
  gamification_ready: boolean;
  disbursement_ready: boolean;
  reasons: {
    gamification: string[];
    disbursement: string[];
  };
};

type PaginatedResult<T> = {
  page: T[];
  isDone: boolean;
  continueCursor: string;
};

type QualityHistoryRow = Pick<Doc<"quality_score_history">, "guard_user_id" | "score">;
type GuardTypeRow = {
  user_id: Id<"users">;
  exists: boolean;
  user_type?: Doc<"users">["user_type"];
};
type StreakRow = {
  guard_user_id: Id<"users">;
  current_streak_days: number;
};
type IncentiveCardRow = Pick<
  Doc<"incentive_cards">,
  "_id" | "status" | "metadata" | "reward_amount_paise" | "guard_user_id"
>;

function normalizeBatchSize(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_BATCH_SIZE;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("batchSize must be a positive integer");
  }

  return Math.min(value, MAX_BATCH_SIZE);
}

function normalizeMaxBatches(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_BATCHES;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("maxBatches must be a positive integer");
  }

  return value;
}

function createMigrationRunId(): string {
  return `mig_v2_v3_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function computeLevelFromXp(xp: number): number {
  const normalizedXp = Math.max(0, Math.floor(xp));
  const level = Math.floor(Math.sqrt(normalizedXp / 100)) + 1;
  return Math.min(level, MAX_LEVEL);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConfirmedCard(card: {
  status: "active" | "expired" | "redeemed";
  metadata?: unknown;
}): boolean {
  if (card.status === "redeemed") {
    return true;
  }

  if (!isRecord(card.metadata)) {
    return false;
  }

  const reviewState = card.metadata.review_state;
  return reviewState === "confirmed";
}

export const run = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
    maxBatches: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const dryRun = args.dryRun ?? true;
    const batchSize = normalizeBatchSize(args.batchSize);
    const maxBatches = normalizeMaxBatches(args.maxBatches);
    const migrationRunId = createMigrationRunId();
    const writesSupportedInThisPhase = false;

    const readiness = (await ctx.runQuery(
      internal.migrateIncentiveV3.getMigrationReadiness,
      {},
    )) as MigrationReadiness;

    const xpByGuard = new Map<Id<"users">, { xp: number; quality_history_count: number }>();
    let qualityRowsScanned = 0;
    let qualityBatchCursor: string | null = null;
    let qualityBatchesProcessed = 0;

    while (qualityBatchesProcessed < maxBatches) {
      const page = (await ctx.runQuery(internal.migrateIncentiveV3.listQualityHistoryBatch, {
        paginationOpts: {
          numItems: batchSize,
          cursor: qualityBatchCursor,
        },
      })) as PaginatedResult<QualityHistoryRow>;

      qualityRowsScanned += page.page.length;
      qualityBatchesProcessed += 1;

      for (const row of page.page) {
        const xpContribution = Math.max(0, Math.round(row.score * 10));
        const previous = xpByGuard.get(row.guard_user_id);

        if (previous) {
          xpByGuard.set(row.guard_user_id, {
            xp: previous.xp + xpContribution,
            quality_history_count: previous.quality_history_count + 1,
          });
          continue;
        }

        xpByGuard.set(row.guard_user_id, {
          xp: xpContribution,
          quality_history_count: 1,
        });
      }

      if (page.isDone) {
        break;
      }

      qualityBatchCursor = page.continueCursor;
    }

    const guardIds = [...xpByGuard.keys()];
    const [guardTypes, streakRows] = await Promise.all([
      ctx.runQuery(internal.migrateIncentiveV3.getGuardUserTypeMap, {
        user_ids: guardIds,
      }),
      ctx.runQuery(internal.migrateIncentiveV3.listActiveStreaksByGuards, {
        guard_user_ids: guardIds,
      }),
    ]);

    const guardTypeRows = guardTypes as GuardTypeRow[];
    const streakRowsByGuard = streakRows as StreakRow[];

    const guardIdSet = new Set<Id<"users">>(
      guardTypeRows
        .filter((row) => row.exists && row.user_type === "GUARD")
        .map((row) => row.user_id),
    );

    const streakByGuard = new Map<Id<"users">, number>(
      streakRowsByGuard.map((row) => [row.guard_user_id, row.current_streak_days]),
    );

    const plannedGamificationProfiles: PlannedGamificationProfile[] = [];
    for (const [guardUserId, stats] of xpByGuard.entries()) {
      if (!guardIdSet.has(guardUserId)) {
        continue;
      }

      plannedGamificationProfiles.push({
        user_id: guardUserId,
        xp: stats.xp,
        level: computeLevelFromXp(stats.xp),
        current_streak_days: streakByGuard.get(guardUserId) ?? 0,
        weekly_xp: 0,
        monthly_xp: 0,
        lifetime_quests_completed: 0,
        migration_run_id: migrationRunId,
      });
    }

    const plannedDisbursements: PlannedDisbursement[] = [];
    const seenSourceKeys = new Set<string>();
    let cardRowsScanned = 0;
    let cardBatchesProcessed = 0;
    let duplicateSourceKeysInInput = 0;
    let skippedNonConfirmedCards = 0;
    let skippedCardsWithNoAmount = 0;

    const cardStatuses: Array<"active" | "redeemed"> = ["active", "redeemed"];

    for (const status of cardStatuses) {
      let cursor: string | null = null;
      let statusBatches = 0;

      while (statusBatches < maxBatches) {
        const page = (await ctx.runQuery(internal.migrateIncentiveV3.listIncentiveCardsBatch, {
          status,
          paginationOpts: {
            numItems: batchSize,
            cursor,
          },
        })) as PaginatedResult<IncentiveCardRow>;

        cardRowsScanned += page.page.length;
        cardBatchesProcessed += 1;
        statusBatches += 1;

        for (const card of page.page) {
          if (!isConfirmedCard(card)) {
            skippedNonConfirmedCards += 1;
            continue;
          }

          const sourceKey = `${SOURCE_TYPE}:${card._id}`;
          if (seenSourceKeys.has(sourceKey)) {
            duplicateSourceKeysInInput += 1;
            continue;
          }

          seenSourceKeys.add(sourceKey);

          const amountPaise = card.reward_amount_paise ?? 0;
          if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
            skippedCardsWithNoAmount += 1;
            continue;
          }

          plannedDisbursements.push({
            source_type: SOURCE_TYPE,
            source_key: sourceKey,
            status: "DISBURSED",
            amount_paise: amountPaise,
            recipient_user_id: card.guard_user_id,
            persona: INCENTIVE_PERSONA.GUARD,
            migration_run_id: migrationRunId,
          });
        }

        if (page.isDone) {
          break;
        }

        cursor = page.continueCursor;
      }
    }

    const migrationMode =
      dryRun || !writesSupportedInThisPhase ? "planning_only" : "writes_enabled_for_future_phase";

    return {
      migration_run_id: migrationRunId,
      dry_run: dryRun,
      mode: migrationMode,
      table_readiness: readiness,
      write_support: {
        enabled: writesSupportedInThisPhase,
        reason:
          "Target tables (incentive_disbursements, gamification_profiles) are not present in this schema yet",
      },
      gamification_profiles: {
        scanned_quality_rows: qualityRowsScanned,
        batches_processed: qualityBatchesProcessed,
        planned_count: plannedGamificationProfiles.length,
        applied_count: 0,
        sample: plannedGamificationProfiles.slice(0, 10),
      },
      incentive_disbursements: {
        scanned_card_rows: cardRowsScanned,
        batches_processed: cardBatchesProcessed,
        planned_count: plannedDisbursements.length,
        applied_count: 0,
        duplicate_source_keys_in_input: duplicateSourceKeysInInput,
        skipped_non_confirmed_cards: skippedNonConfirmedCards,
        skipped_no_amount_cards: skippedCardsWithNoAmount,
        sample: plannedDisbursements.slice(0, 10),
      },
      idempotency: {
        source_key_pattern: `${SOURCE_TYPE}:{legacy_id}`,
        deterministic_dedupe_key: true,
        safe_to_rerun: true,
      },
      notes: [
        "This action computes migration plans and deterministic dedupe keys in Phase 32 E01.",
        "Actual table writes will be enabled once E03/E04 add target schema tables.",
      ],
    };
  },
});

export const rollback = internalAction({
  args: {
    migration_run_id: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const dryRun = args.dryRun ?? true;

    return {
      migration_run_id: args.migration_run_id,
      dry_run: dryRun,
      rolled_back: {
        gamification_profiles: 0,
        incentive_disbursements: 0,
      },
      mode: "no_op",
      reason:
        "Rollback wiring is defined, but no v3 target rows are written in this phase because target tables are not in schema yet.",
      rollback_strategy: {
        disbursement_match: "source_type='V2_MIGRATION' and source_key prefix",
        gamification_match: "migration_run_id metadata",
      },
    };
  },
});
