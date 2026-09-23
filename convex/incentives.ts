import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  BONUS_TYPE,
  BONUS_TYPE_LABELS,
  CHECKLIST_ITEM_TYPE,
  CHECKLIST_STATUS,
  DOCUMENT_ITEM_STATUS,
  INCENTIVE_CARD_TYPE,
  INCENTIVE_LEVEL,
  PAYOUT_STATUS,
  PENALTY_TYPE,
  PENALTY_TYPE_LABELS,
  PERMISSIONS,
  QUALITY_TIER,
  STREAK_TYPE,
  SYSTEM_CONFIG_KEYS,
  VISIT_STATUS,
  type ChecklistDepth,
  type IncentiveCardType,
  type IncentiveLevel,
  type QualityTier,
  type StreakType,
} from "../lib/constants";
import { DAY_MS, getISTDateKey, getStartOfDayIST, getYesterdayISTDateKey } from "../lib/dates";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireFieldWorkerAuth, requirePermission } from "./auth.helpers";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import {
  DEFAULT_LEADERBOARD_FILTER,
  FIELD_WORKER_USER_TYPES,
  fieldWorkerLeaderboardFilterValidator,
  type FieldWorkerLeaderboardFilter,
  type FieldWorkerUserType,
} from "./fieldWorkerContracts";
import { getSystemConfigNumber } from "./systemConfig.helpers";

type DbContext = QueryCtx | MutationCtx;
type IncentiveCardDoc = Doc<"incentive_cards">;

type AutoAwardTrigger = "LEAD_VERIFIED" | "VISIT_COMPLETED";

type SuggestionCandidate = {
  card_type: IncentiveCardType;
  level: IncentiveLevel;
  metric_name: string;
  metric_value: number;
  thresholds: TierThresholds;
};

type IncentiveCardMetadata = Record<string, unknown>;

type AdminIncentiveCardRow = IncentiveCardDoc & {
  guard_name: string;
};

type QualityScoreComponents = {
  checklist: number;
  photo: number;
  speed: number;
  verification: number;
  document: number;
};

type QualityWeightConfig = {
  checklist: number;
  photo: number;
  speed: number;
  verification: number;
  document: number;
};

type QualityTierConfig = {
  bronzeMin: number;
  silverMin: number;
  goldMin: number;
  platinumMin: number;
};

type LeaderboardScope = "DAILY" | "WEEKLY" | "MONTHLY" | "SOCIETY" | "ALL_TIME";

type LeaderboardRow = {
  guard_user_id: Id<"users">;
  guard_name: string;
  persona: FieldWorkerUserType;
  quality_score: number;
  tasks_completed: number;
  composite_score: number;
  tier: QualityTier;
  recent_activity_at: number;
};

type ChecklistInstanceDoc = Doc<"checklist_instances">;

type TaskBonusBreakdown = {
  bonus_type: (typeof BONUS_TYPE)[keyof typeof BONUS_TYPE];
  label: string;
  amount_paise: number;
  percentage?: number;
};

type PenaltyBreakdown = {
  penalty_type: (typeof PENALTY_TYPE)[keyof typeof PENALTY_TYPE];
  label: string;
  amount_paise: number;
};

type LatestQualitySnapshot = {
  score: number;
  tier: QualityTier;
  components: QualityScoreComponents;
};

export type GuardMetrics = {
  verified_leads_count: number;
  total_submitted_leads_count: number;
  completed_visits_count: number;
  verified_rate: number;
};

export type TierThresholds = {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
  min_leads?: number;
};

const AUTO_AWARD_CARD_TYPES = new Set<IncentiveCardType>([
  INCENTIVE_CARD_TYPE.LEAD_MILESTONE,
  INCENTIVE_CARD_TYPE.VISIT_MILESTONE,
  INCENTIVE_CARD_TYPE.QUALITY_STREAK,
]);

export const INCENTIVE_CARD_TYPE_LABELS: Record<IncentiveCardType, string> = {
  [INCENTIVE_CARD_TYPE.LEAD_MILESTONE]: "Lead Milestone",
  [INCENTIVE_CARD_TYPE.VISIT_MILESTONE]: "Visit Milestone",
  [INCENTIVE_CARD_TYPE.QUALITY_STREAK]: "Quality Streak",
  [INCENTIVE_CARD_TYPE.SPEED_BONUS]: "Speed Bonus",
  [INCENTIVE_CARD_TYPE.MONTHLY_TOP]: "Monthly Top",
};

export const INCENTIVE_TIER_ICONS: Record<IncentiveLevel, string> = {
  [INCENTIVE_LEVEL.BRONZE]: "🥉",
  [INCENTIVE_LEVEL.SILVER]: "🥈",
  [INCENTIVE_LEVEL.GOLD]: "🥇",
  [INCENTIVE_LEVEL.PLATINUM]: "💎",
};

export const INCENTIVE_LEVEL_PRECEDENCE: Record<IncentiveLevel, number> = {
  [INCENTIVE_LEVEL.BRONZE]: 1,
  [INCENTIVE_LEVEL.SILVER]: 2,
  [INCENTIVE_LEVEL.GOLD]: 3,
  [INCENTIVE_LEVEL.PLATINUM]: 4,
};

const LEVEL_THRESHOLD_KEYS: Record<IncentiveLevel, keyof TierThresholds> = {
  [INCENTIVE_LEVEL.BRONZE]: "bronze",
  [INCENTIVE_LEVEL.SILVER]: "silver",
  [INCENTIVE_LEVEL.GOLD]: "gold",
  [INCENTIVE_LEVEL.PLATINUM]: "platinum",
};

const incentiveCardTypeValidator = v.union(
  v.literal(INCENTIVE_CARD_TYPE.LEAD_MILESTONE),
  v.literal(INCENTIVE_CARD_TYPE.VISIT_MILESTONE),
  v.literal(INCENTIVE_CARD_TYPE.QUALITY_STREAK),
  v.literal(INCENTIVE_CARD_TYPE.SPEED_BONUS),
  v.literal(INCENTIVE_CARD_TYPE.MONTHLY_TOP),
);

const incentiveLevelValidator = v.union(
  v.literal(INCENTIVE_LEVEL.BRONZE),
  v.literal(INCENTIVE_LEVEL.SILVER),
  v.literal(INCENTIVE_LEVEL.GOLD),
  v.literal(INCENTIVE_LEVEL.PLATINUM),
);

const qualityTriggerValidator = v.union(
  v.literal("CHECKLIST_APPROVED"),
  v.literal("VISIT_COMPLETED"),
  v.literal("DOCUMENTS_UPDATED"),
  v.literal("MANUAL_RECALC"),
  v.literal("CRON_DAILY"),
);

const leaderboardScopeValidator = v.union(
  v.literal("DAILY"),
  v.literal("WEEKLY"),
  v.literal("MONTHLY"),
  v.literal("SOCIETY"),
  v.literal("ALL_TIME"),
);

const leaderboardPositionScopeValidator = v.union(
  v.literal("DAILY"),
  v.literal("WEEKLY"),
  v.literal("MONTHLY"),
  v.literal("ALL_TIME"),
);

const QUALITY_COMPONENT_DEFAULT = 50;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const STREAK_MILESTONES = [3, 7, 14, 30] as const;

const CHECKLIST_COMPLETION_STATUSES = new Set<string>([
  CHECKLIST_STATUS.SUBMITTED,
  CHECKLIST_STATUS.UNDER_REVIEW,
  CHECKLIST_STATUS.APPROVED,
  CHECKLIST_STATUS.REJECTED,
  CHECKLIST_STATUS.REVISION_REQUESTED,
]);

const QUALITY_MULTIPLIER_BY_TIER: Record<QualityTier, number> = {
  [QUALITY_TIER.BRONZE]: 1,
  [QUALITY_TIER.SILVER]: 1.25,
  [QUALITY_TIER.GOLD]: 1.5,
  [QUALITY_TIER.PLATINUM]: 2,
};

const DAY_BASED_STREAK_TYPES = new Set<StreakType>([
  STREAK_TYPE.DAILY_ACTIVE,
  STREAK_TYPE.WEEKLY_WARRIOR,
]);

const STREAK_TYPES: readonly StreakType[] = [
  STREAK_TYPE.DAILY_ACTIVE,
  STREAK_TYPE.WEEKLY_WARRIOR,
  STREAK_TYPE.QUALITY_CHAIN,
  STREAK_TYPE.PERFECT_10,
];

const STREAK_MILESTONE_CONFIG = {
  3: {
    key: SYSTEM_CONFIG_KEYS.STREAK_BONUS_3DAY_PAISE,
    defaultPaise: 20000,
  },
  7: {
    key: SYSTEM_CONFIG_KEYS.STREAK_BONUS_7DAY_PAISE,
    defaultPaise: 50000,
  },
  14: {
    key: SYSTEM_CONFIG_KEYS.STREAK_BONUS_14DAY_PAISE,
    defaultPaise: 100000,
  },
  30: {
    key: SYSTEM_CONFIG_KEYS.STREAK_BONUS_30DAY_PAISE,
    defaultPaise: 200000,
  },
} as const;

const AUTO_REVIEW_STATE = "pending";

function isMetadataRecord(value: unknown): value is IncentiveCardMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadata(card: IncentiveCardDoc): IncentiveCardMetadata {
  if (!isMetadataRecord(card.metadata)) {
    return {};
  }

  return card.metadata;
}

function isAutoSuggestionPending(card: IncentiveCardDoc): boolean {
  if (card.status !== "active" || card.rejected_at !== undefined) {
    return false;
  }

  const metadata = getMetadata(card);

  return metadata.award_source === "auto" && metadata.review_state === AUTO_REVIEW_STATE;
}

async function enrichCardsWithGuardName(
  ctx: QueryCtx | MutationCtx,
  cards: IncentiveCardDoc[],
): Promise<AdminIncentiveCardRow[]> {
  const guardIds = [...new Set(cards.map((card) => card.guard_user_id))];
  const guards = await Promise.all(guardIds.map(async (guardId) => await ctx.db.get(guardId)));
  const guardNameById = new Map(
    guards
      .filter((guard): guard is NonNullable<typeof guard> => guard !== null)
      .map((guard) => [guard._id, guard.name]),
  );

  return cards.map((card) => ({
    ...card,
    guard_name: guardNameById.get(card.guard_user_id) ?? "Unknown",
  }));
}

async function getOtherActiveCardsForType(
  ctx: MutationCtx,
  card: IncentiveCardDoc,
): Promise<IncentiveCardDoc[]> {
  const cards = await ctx.db
    .query("incentive_cards")
    .withIndex("by_guard_and_type", (q) =>
      q.eq("guard_user_id", card.guard_user_id).eq("card_type", card.card_type),
    )
    .collect();

  return cards.filter(
    (existingCard) => existingCard.status === "active" && existingCard._id !== card._id,
  );
}

async function getActiveCardsForGuardAndType(
  ctx: MutationCtx,
  guardUserId: Id<"users">,
  cardType: IncentiveCardType,
): Promise<IncentiveCardDoc[]> {
  const cards = await ctx.db
    .query("incentive_cards")
    .withIndex("by_guard_and_type", (q) =>
      q.eq("guard_user_id", guardUserId).eq("card_type", cardType),
    )
    .collect();

  return cards.filter((card) => card.status === "active");
}

function getTierTarget(thresholds: TierThresholds, level: IncentiveLevel): number {
  return thresholds[LEVEL_THRESHOLD_KEYS[level]] as number;
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

function getGuardMetricDescription(cardType: IncentiveCardType, metrics: GuardMetrics): string {
  if (cardType === INCENTIVE_CARD_TYPE.LEAD_MILESTONE) {
    return `${metrics.verified_leads_count} verified leads`;
  }

  if (cardType === INCENTIVE_CARD_TYPE.VISIT_MILESTONE) {
    return `${metrics.completed_visits_count} visits completed`;
  }

  if (cardType === INCENTIVE_CARD_TYPE.QUALITY_STREAK) {
    return `${metrics.verified_rate}% verification rate`;
  }

  if (cardType === INCENTIVE_CARD_TYPE.SPEED_BONUS) {
    return "Special speed bonus";
  }

  return "Top monthly performer";
}

function assertOptionalPaise(value: number | undefined, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a whole number in paise`);
  }
}

function getLevelLabel(level: IncentiveLevel): string {
  return `${level[0]}${level.slice(1).toLowerCase()}`;
}

function getMetricDescription(candidate: SuggestionCandidate): string {
  const target = getTierTarget(candidate.thresholds, candidate.level);

  if (candidate.card_type === INCENTIVE_CARD_TYPE.LEAD_MILESTONE) {
    return `Reached ${target} verified leads`;
  }

  if (candidate.card_type === INCENTIVE_CARD_TYPE.VISIT_MILESTONE) {
    return `Completed ${target} visits`;
  }

  return `Maintained ${target}% verification rate`;
}

function isFieldWorkerUserType(
  userType: Doc<"users">["user_type"],
): userType is FieldWorkerUserType {
  return FIELD_WORKER_USER_TYPES.some((fieldWorkerType) => fieldWorkerType === userType);
}

function matchesLeaderboardPersonaFilter(
  userType: Doc<"users">["user_type"],
  personaFilter: FieldWorkerLeaderboardFilter,
): userType is FieldWorkerUserType {
  if (!isFieldWorkerUserType(userType)) {
    return false;
  }

  if (personaFilter === "ALL") {
    return true;
  }

  return userType === personaFilter;
}

function buildAutoSuggestionCopy(candidate: SuggestionCandidate): {
  title: string;
  description: string;
} {
  const title = `${getLevelLabel(candidate.level)} ${INCENTIVE_CARD_TYPE_LABELS[candidate.card_type]}`;

  return {
    title,
    description: getMetricDescription(candidate),
  };
}

async function getHighestActiveCardForType(
  ctx: MutationCtx,
  guardUserId: Id<"users">,
  cardType: IncentiveCardType,
): Promise<IncentiveCardDoc | null> {
  const cards = await ctx.db
    .query("incentive_cards")
    .withIndex("by_guard_and_type", (q) =>
      q.eq("guard_user_id", guardUserId).eq("card_type", cardType),
    )
    .collect();

  const activeCards = cards.filter((card) => card.status === "active");

  if (activeCards.length === 0) {
    return null;
  }

  return activeCards.reduce((highest, current) => {
    if (INCENTIVE_LEVEL_PRECEDENCE[current.level] > INCENTIVE_LEVEL_PRECEDENCE[highest.level]) {
      return current;
    }

    if (
      INCENTIVE_LEVEL_PRECEDENCE[current.level] === INCENTIVE_LEVEL_PRECEDENCE[highest.level] &&
      current._creationTime > highest._creationTime
    ) {
      return current;
    }

    return highest;
  });
}

function canCreateSuggestion(
  existingCard: IncentiveCardDoc | null,
  nextLevel: IncentiveLevel,
): boolean {
  if (!existingCard) {
    return true;
  }

  return INCENTIVE_LEVEL_PRECEDENCE[nextLevel] > INCENTIVE_LEVEL_PRECEDENCE[existingCard.level];
}

async function buildSuggestionCandidates(
  ctx: MutationCtx,
  trigger: AutoAwardTrigger,
  metrics: GuardMetrics,
): Promise<SuggestionCandidate[]> {
  const candidates: SuggestionCandidate[] = [];

  if (trigger === "LEAD_VERIFIED") {
    const leadThresholds = await getThresholds(ctx, INCENTIVE_CARD_TYPE.LEAD_MILESTONE);
    if (leadThresholds) {
      const level = determineTier(metrics.verified_leads_count, leadThresholds);
      if (level) {
        candidates.push({
          card_type: INCENTIVE_CARD_TYPE.LEAD_MILESTONE,
          level,
          metric_name: "verified_leads_count",
          metric_value: metrics.verified_leads_count,
          thresholds: leadThresholds,
        });
      }
    }

    const qualityThresholds = await getThresholds(ctx, INCENTIVE_CARD_TYPE.QUALITY_STREAK);
    if (qualityThresholds) {
      const minLeads = qualityThresholds.min_leads ?? 0;

      if (metrics.total_submitted_leads_count >= minLeads) {
        const level = determineTier(metrics.verified_rate, qualityThresholds);

        if (level) {
          candidates.push({
            card_type: INCENTIVE_CARD_TYPE.QUALITY_STREAK,
            level,
            metric_name: "verified_rate",
            metric_value: metrics.verified_rate,
            thresholds: qualityThresholds,
          });
        }
      }
    }
  }

  if (trigger === "VISIT_COMPLETED") {
    const visitThresholds = await getThresholds(ctx, INCENTIVE_CARD_TYPE.VISIT_MILESTONE);

    if (visitThresholds) {
      const level = determineTier(metrics.completed_visits_count, visitThresholds);

      if (level) {
        candidates.push({
          card_type: INCENTIVE_CARD_TYPE.VISIT_MILESTONE,
          level,
          metric_name: "completed_visits_count",
          metric_value: metrics.completed_visits_count,
          thresholds: visitThresholds,
        });
      }
    }
  }

  return candidates;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const rounded = Math.round(value * 100) / 100;
  return Math.max(0, Math.min(100, rounded));
}

function getChecklistDepthOrder(depth: ChecklistDepth): number {
  if (depth === "LIGHT") {
    return 0;
  }

  if (depth === "MEDIUM") {
    return 1;
  }

  return 2;
}

function buildPhotoItemKey(sectionId: string, itemId: string): string {
  return `${sectionId}::${itemId}`;
}

function getPhotoItemKeys(
  template: Doc<"checklist_templates">,
  depth: ChecklistDepth,
): Set<string> {
  const requestedDepth = getChecklistDepthOrder(depth);
  const keys = new Set<string>();

  for (const section of template.sections) {
    for (const item of section.items) {
      const itemDepth = getChecklistDepthOrder(item.min_depth);
      if (itemDepth > requestedDepth) {
        continue;
      }

      if (
        item.item_type === CHECKLIST_ITEM_TYPE.PHOTO ||
        item.item_type === CHECKLIST_ITEM_TYPE.PHOTO_CONDITION
      ) {
        keys.add(buildPhotoItemKey(section.section_id, item.item_id));
      }
    }
  }

  return keys;
}

function hasGpsMetadata(response: ChecklistInstanceDoc["responses"][number]): boolean {
  return response.photo_metadata.some(
    (entry) => typeof entry.lat === "number" && typeof entry.lng === "number",
  );
}

function assertPositiveIntegerPaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive whole number in paise`);
  }
}

function isChecklistCompletionStatus(status: ChecklistInstanceDoc["status"]): boolean {
  return CHECKLIST_COMPLETION_STATUSES.has(status);
}

async function buildChecklistTemplateMap(
  ctx: DbContext,
  checklists: ChecklistInstanceDoc[],
): Promise<Map<Id<"checklist_templates">, Doc<"checklist_templates">>> {
  const templateIds = [...new Set(checklists.map((instance) => instance.template_id))];
  const templateEntries = await Promise.all(
    templateIds.map(async (templateId) => {
      const template = await ctx.db.get(templateId);
      return [templateId, template] as const;
    }),
  );

  return new Map(
    templateEntries.filter(
      (entry): entry is readonly [Id<"checklist_templates">, Doc<"checklist_templates">] =>
        entry[1] !== null && entry[1].is_deleted !== true,
    ),
  );
}

function summarizePhotoCoverage(
  checklists: ChecklistInstanceDoc[],
  templateMap: Map<Id<"checklist_templates">, Doc<"checklist_templates">>,
): {
  totalPhotoItems: number;
  photoItemsWithEvidence: number;
  gpsPhotoEvidenceCount: number;
} {
  let totalPhotoItems = 0;
  let photoItemsWithEvidence = 0;
  let gpsPhotoEvidenceCount = 0;

  for (const checklist of checklists) {
    const template = templateMap.get(checklist.template_id);

    if (!template) {
      continue;
    }

    const photoItemKeys = getPhotoItemKeys(template, checklist.depth);
    totalPhotoItems += photoItemKeys.size;

    for (const itemKey of photoItemKeys) {
      const response = checklist.responses.find(
        (entry) => buildPhotoItemKey(entry.section_id, entry.item_id) === itemKey,
      );

      if (!response || response.photo_ids.length === 0) {
        continue;
      }

      photoItemsWithEvidence += 1;
      if (hasGpsMetadata(response)) {
        gpsPhotoEvidenceCount += 1;
      }
    }
  }

  return {
    totalPhotoItems,
    photoItemsWithEvidence,
    gpsPhotoEvidenceCount,
  };
}

function hasAllChecklistPhotoItemsWithGps(
  checklist: ChecklistInstanceDoc,
  templateMap: Map<Id<"checklist_templates">, Doc<"checklist_templates">>,
): boolean {
  const template = templateMap.get(checklist.template_id);

  if (!template) {
    return false;
  }

  const photoItemKeys = getPhotoItemKeys(template, checklist.depth);

  if (photoItemKeys.size === 0) {
    return false;
  }

  for (const itemKey of photoItemKeys) {
    const response = checklist.responses.find(
      (entry) => buildPhotoItemKey(entry.section_id, entry.item_id) === itemKey,
    );

    if (!response || response.photo_ids.length === 0 || !hasGpsMetadata(response)) {
      return false;
    }
  }

  return true;
}

async function getQualityWeightConfig(ctx: DbContext): Promise<QualityWeightConfig> {
  const [checklist, photo, speed, verification, document] = await Promise.all([
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_CHECKLIST, 30),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_PHOTO, 25),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_SPEED, 20),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_VERIFICATION, 15),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_WEIGHT_DOCUMENT, 10),
  ]);

  return { checklist, photo, speed, verification, document };
}

async function getQualityTierConfig(ctx: DbContext): Promise<QualityTierConfig> {
  const [bronzeMin, silverMin, goldMin, platinumMin] = await Promise.all([
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_TIER_BRONZE_MIN, 0),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_TIER_SILVER_MIN, 50),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_TIER_GOLD_MIN, 75),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.QUALITY_TIER_PLATINUM_MIN, 90),
  ]);

  return {
    bronzeMin,
    silverMin,
    goldMin,
    platinumMin,
  };
}

function determineQualityTier(score: number, config: QualityTierConfig): QualityTier {
  if (score >= config.platinumMin) {
    return QUALITY_TIER.PLATINUM;
  }

  if (score >= config.goldMin) {
    return QUALITY_TIER.GOLD;
  }

  if (score >= config.silverMin) {
    return QUALITY_TIER.SILVER;
  }

  return QUALITY_TIER.BRONZE;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeLeaderboardLimit(
  limit: number | undefined,
  defaultLimit: number,
  maxLimit: number,
): number {
  if (limit === undefined) {
    return defaultLimit;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }

  return Math.min(limit, maxLimit);
}

function normalizeLeaderboardCursor(cursor: number | undefined): number {
  if (cursor === undefined) {
    return 0;
  }

  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("cursor must be a non-negative integer");
  }

  return cursor;
}

function getWindowStart(scope: LeaderboardScope): number {
  const startOfToday = getStartOfDayIST(Date.now());

  switch (scope) {
    case "DAILY":
      return startOfToday;
    case "WEEKLY":
      return startOfToday - 6 * DAY_MS;
    case "MONTHLY":
      return startOfToday - 29 * DAY_MS;
    default:
      return 0;
  }
}

function getScopeWindowStart(scope: LeaderboardScope): number | undefined {
  if (scope === "SOCIETY" || scope === "ALL_TIME") {
    return undefined;
  }

  return getWindowStart(scope);
}

async function getGuardProfileByUserId(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"guard_profiles"> | null> {
  return await ctx.db
    .query("guard_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", userId))
    .unique();
}

function resolveLeaderboardSocietyId(
  scope: LeaderboardScope,
  providedSocietyId: Id<"societies"> | undefined,
): Id<"societies"> | undefined;
function resolveLeaderboardSocietyId(
  _ctx: QueryCtx,
  _user: Doc<"users">,
  scope: LeaderboardScope,
  providedSocietyId: Id<"societies"> | undefined,
): Id<"societies"> | undefined;
function resolveLeaderboardSocietyId(
  scopeOrCtx: LeaderboardScope | QueryCtx,
  providedSocietyIdOrUser: Id<"societies"> | Doc<"users"> | undefined,
  legacyScope?: LeaderboardScope,
  legacySocietyId?: Id<"societies">,
): Id<"societies"> | undefined {
  const scope =
    typeof scopeOrCtx === "string" && legacyScope === undefined ? scopeOrCtx : legacyScope;
  const providedSocietyId =
    typeof scopeOrCtx === "string" && legacyScope === undefined
      ? (providedSocietyIdOrUser as Id<"societies"> | undefined)
      : legacySocietyId;

  if (scope === undefined) {
    throw new Error("Leaderboard scope is required");
  }

  if (scope !== "SOCIETY") {
    return undefined;
  }

  if (providedSocietyId === undefined) {
    throw new Error("society_id is required for SOCIETY scope");
  }

  return providedSocietyId;
}

async function listLeaderboardProfiles(
  ctx: QueryCtx,
  societyId: Id<"societies"> | undefined,
): Promise<Doc<"guard_profiles">[]> {
  if (societyId !== undefined) {
    return await ctx.db
      .query("guard_profiles")
      .withIndex("by_society_id", (q) => q.eq("society_id", societyId))
      .filter((q) => q.gt(q.field("quality_score"), 0))
      .collect();
  }

  return await ctx.db
    .query("guard_profiles")
    .withIndex("by_quality_score", (q) => q.gt("quality_score", 0))
    .collect();
}

function summarizeCompletedVisits(
  visits: Doc<"visits">[],
  windowStart: number | undefined,
): { tasks_completed: number; recent_activity_at: number } {
  let tasksCompleted = 0;
  let recentActivityAt = 0;

  for (const visit of visits) {
    const activityAt = visit.completed_at ?? visit._creationTime;
    if (windowStart !== undefined && activityAt < windowStart) {
      continue;
    }

    tasksCompleted += 1;
    if (activityAt > recentActivityAt) {
      recentActivityAt = activityAt;
    }
  }

  return {
    tasks_completed: tasksCompleted,
    recent_activity_at: recentActivityAt,
  };
}

type LeaderboardPrefetched = {
  userMap: Map<Id<"users">, Doc<"users">>;
  visitMap: Map<Id<"users">, Doc<"visits">[]>;
};

async function batchFetchLeaderboardData(
  ctx: QueryCtx,
  profiles: Doc<"guard_profiles">[],
): Promise<LeaderboardPrefetched> {
  const guardUserIds = [...new Set(profiles.map((p) => p.user_id))];

  const [users, visitArrays] = await Promise.all([
    Promise.all(guardUserIds.map((id) => ctx.db.get(id))),
    Promise.all(
      guardUserIds.map(async (guardId) => {
        const visits = await ctx.db
          .query("visits")
          .withIndex("by_guard_and_status", (q) =>
            q.eq("assigned_guard_id", guardId).eq("status", VISIT_STATUS.COMPLETED),
          )
          .collect();
        return [guardId, visits] as const;
      }),
    ),
  ]);

  const userMap = new Map<Id<"users">, Doc<"users">>();
  for (let i = 0; i < guardUserIds.length; i++) {
    const user = users[i];
    if (user) {
      userMap.set(guardUserIds[i], user);
    }
  }

  return {
    userMap,
    visitMap: new Map(visitArrays),
  };
}

function buildLeaderboardRowsFromData(
  profiles: Doc<"guard_profiles">[],
  windowStart: number | undefined,
  tierConfig: QualityTierConfig,
  prefetched: LeaderboardPrefetched,
  personaFilter: FieldWorkerLeaderboardFilter,
): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];

  for (const profile of profiles) {
    const guardUser = prefetched.userMap.get(profile.user_id);

    if (
      !guardUser ||
      !matchesLeaderboardPersonaFilter(guardUser.user_type, personaFilter) ||
      guardUser.status === "BANNED"
    ) {
      continue;
    }

    const completedVisits = prefetched.visitMap.get(profile.user_id) ?? [];
    const visitSummary = summarizeCompletedVisits(completedVisits, windowStart);
    const qualityScore = clampScore(profile.quality_score ?? 0);
    const compositeScore = roundTo2(qualityScore * visitSummary.tasks_completed);

    rows.push({
      guard_user_id: profile.user_id,
      guard_name: guardUser.name,
      persona: guardUser.user_type,
      quality_score: qualityScore,
      tasks_completed: visitSummary.tasks_completed,
      composite_score: compositeScore,
      tier: determineQualityTier(qualityScore, tierConfig),
      recent_activity_at: visitSummary.recent_activity_at,
    });
  }

  return rows;
}

async function buildLeaderboardRows(
  ctx: QueryCtx,
  profiles: Doc<"guard_profiles">[],
  windowStart: number | undefined,
  tierConfig: QualityTierConfig,
  personaFilter: FieldWorkerLeaderboardFilter,
  prefetched?: LeaderboardPrefetched,
): Promise<LeaderboardRow[]> {
  const data = prefetched ?? (await batchFetchLeaderboardData(ctx, profiles));
  return buildLeaderboardRowsFromData(profiles, windowStart, tierConfig, data, personaFilter);
}

function sortLeaderboardRows(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (b.composite_score !== a.composite_score) {
      return b.composite_score - a.composite_score;
    }

    if (b.quality_score !== a.quality_score) {
      return b.quality_score - a.quality_score;
    }

    if (b.recent_activity_at !== a.recent_activity_at) {
      return b.recent_activity_at - a.recent_activity_at;
    }

    const nameSort = a.guard_name.localeCompare(b.guard_name);
    if (nameSort !== 0) {
      return nameSort;
    }

    return String(a.guard_user_id).localeCompare(String(b.guard_user_id));
  });
}

function toLeaderboardItem(
  row: LeaderboardRow,
  rank: number,
): {
  rank: number;
  guard_user_id: Id<"users">;
  guard_name: string;
  persona: FieldWorkerUserType;
  quality_score: number;
  tasks_completed: number;
  composite_score: number;
  tier: QualityTier;
} {
  return {
    rank,
    guard_user_id: row.guard_user_id,
    guard_name: row.guard_name,
    persona: row.persona,
    quality_score: row.quality_score,
    tasks_completed: row.tasks_completed,
    composite_score: row.composite_score,
    tier: row.tier,
  };
}

async function getGuardStreakRecord(
  ctx: MutationCtx,
  guardUserId: Id<"users">,
  streakType: StreakType,
): Promise<Doc<"guard_streaks"> | null> {
  const streaks = await ctx.db
    .query("guard_streaks")
    .withIndex("by_guard_and_type", (q) =>
      q.eq("guard_user_id", guardUserId).eq("streak_type", streakType),
    )
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  if (streaks.length === 0) {
    return null;
  }

  return streaks.reduce((latest, current) =>
    current.updated_at > latest.updated_at ? current : latest,
  );
}

async function getStreakMilestoneBonusMap(
  ctx: DbContext,
): Promise<Map<(typeof STREAK_MILESTONES)[number], number>> {
  const entries = await Promise.all(
    STREAK_MILESTONES.map(async (milestone) => {
      const config = STREAK_MILESTONE_CONFIG[milestone];
      const amount = await getSystemConfigNumber(ctx, config.key, config.defaultPaise);
      return [milestone, Math.max(0, Math.round(amount))] as const;
    }),
  );

  return new Map(entries);
}

function getExactReachedStreakMilestone(count: number): (typeof STREAK_MILESTONES)[number] | null {
  for (const milestone of STREAK_MILESTONES) {
    if (count === milestone) {
      return milestone;
    }
  }

  return null;
}

function getHighestReachedStreakMilestone(
  count: number,
): (typeof STREAK_MILESTONES)[number] | null {
  const reached = STREAK_MILESTONES.filter((milestone) => count >= milestone);

  if (reached.length === 0) {
    return null;
  }

  return reached[reached.length - 1] ?? null;
}

function computeTrailingQualifiedCount(
  history: Array<Pick<Doc<"quality_score_history">, "score" | "computed_at">>,
  qualifies: (score: number) => boolean,
): {
  count: number;
  startedAt: number | null;
  lastActivityDate: string | null;
} {
  let count = 0;
  let startedAt: number | null = null;

  for (const entry of history) {
    if (!qualifies(clampScore(entry.score))) {
      break;
    }

    count += 1;
    startedAt = entry.computed_at;
  }

  return {
    count,
    startedAt,
    lastActivityDate: count > 0 && history[0] ? getISTDateKey(history[0].computed_at) : null,
  };
}

async function checkStreakMilestone(
  ctx: MutationCtx,
  guardUserId: Id<"users">,
  currentCount: number,
  streakStartedAt: number,
  bonusMap: Map<(typeof STREAK_MILESTONES)[number], number>,
): Promise<{ milestone: number; bonus_paise: number } | null> {
  const exactMilestone = getExactReachedStreakMilestone(currentCount);

  if (exactMilestone === null) {
    return null;
  }

  const bonusAmount = bonusMap.get(exactMilestone) ?? 0;
  if (bonusAmount <= 0) {
    return null;
  }

  const payoutAdjustments = await ctx.db
    .query("payout_adjustments")
    .withIndex("by_guard", (q) => q.eq("guard_user_id", guardUserId))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  const alreadyCreditedInCurrentWindow = payoutAdjustments.some(
    (adjustment) =>
      adjustment.streak_bonus_paise === bonusAmount &&
      adjustment.streak_bonus_paise > 0 &&
      adjustment.computed_at >= streakStartedAt,
  );

  if (alreadyCreditedInCurrentWindow) {
    return null;
  }

  return {
    milestone: exactMilestone,
    bonus_paise: bonusAmount,
  };
}

export async function getGuardMetrics(
  ctx: DbContext,
  guard_user_id: Id<"users">,
): Promise<GuardMetrics> {
  const [verifiedLeads, totalSubmittedLeads, completedVisits] = await Promise.all([
    ctx.db
      .query("leads")
      .withIndex("by_guard_and_status", (q) =>
        q.eq("submitted_by_guard_id", guard_user_id).eq("status", "VERIFIED"),
      )
      .collect(),
    ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guard_user_id))
      .collect(),
    ctx.db
      .query("visits")
      .withIndex("by_guard_and_status", (q) =>
        q.eq("assigned_guard_id", guard_user_id).eq("status", "COMPLETED"),
      )
      .collect(),
  ]);

  const verified_leads_count = verifiedLeads.length;
  const total_submitted_leads_count = totalSubmittedLeads.length;
  const completed_visits_count = completedVisits.length;

  const verified_rate =
    total_submitted_leads_count === 0
      ? 0
      : Math.round((verified_leads_count / total_submitted_leads_count) * 10000) / 100;

  return {
    verified_leads_count,
    total_submitted_leads_count,
    completed_visits_count,
    verified_rate,
  };
}

export async function getThresholds(
  ctx: DbContext,
  card_type: IncentiveCardType,
): Promise<TierThresholds | null> {
  if (!AUTO_AWARD_CARD_TYPES.has(card_type)) {
    return null;
  }

  if (card_type === INCENTIVE_CARD_TYPE.LEAD_MILESTONE) {
    const [bronze, silver, gold, platinum] = await Promise.all([
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_BRONZE, 10),
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_SILVER, 25),
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_GOLD, 50),
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_PLATINUM, 100),
    ]);

    return { bronze, silver, gold, platinum };
  }

  if (card_type === INCENTIVE_CARD_TYPE.VISIT_MILESTONE) {
    const [bronze, silver, gold, platinum] = await Promise.all([
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_BRONZE, 10),
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_SILVER, 25),
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_GOLD, 50),
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_PLATINUM, 100),
    ]);

    return { bronze, silver, gold, platinum };
  }

  const [bronze, silver, gold, platinum, min_leads] = await Promise.all([
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_BRONZE, 70),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_SILVER, 80),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_GOLD, 90),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_PLATINUM, 95),
    getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_MIN_LEADS, 10),
  ]);

  return {
    bronze,
    silver,
    gold,
    platinum,
    min_leads,
  };
}

export function determineTier(
  metricValue: number,
  thresholds: TierThresholds,
): IncentiveLevel | null {
  if (metricValue >= thresholds.platinum) {
    return INCENTIVE_LEVEL.PLATINUM;
  }

  if (metricValue >= thresholds.gold) {
    return INCENTIVE_LEVEL.GOLD;
  }

  if (metricValue >= thresholds.silver) {
    return INCENTIVE_LEVEL.SILVER;
  }

  if (metricValue >= thresholds.bronze) {
    return INCENTIVE_LEVEL.BRONZE;
  }

  return null;
}

export const checkAndSuggest = internalMutation({
  args: {
    guard_user_id: v.id("users"),
    trigger: v.union(v.literal("LEAD_VERIFIED"), v.literal("VISIT_COMPLETED")),
  },
  handler: async (ctx, args) => {
    const guard = await ctx.db.get(args.guard_user_id);

    if (!guard || !isFieldWorkerUserType(guard.user_type)) {
      throw new Error("Guard not found");
    }

    const metrics = await getGuardMetrics(ctx, args.guard_user_id);
    const candidates = await buildSuggestionCandidates(ctx, args.trigger, metrics);
    const created_card_ids: Id<"incentive_cards">[] = [];

    for (const candidate of candidates) {
      const existingHighest = await getHighestActiveCardForType(
        ctx,
        args.guard_user_id,
        candidate.card_type,
      );

      if (!canCreateSuggestion(existingHighest, candidate.level)) {
        continue;
      }

      // Enforce one-active-per-type: expire all lower-tier active cards before inserting
      const existingActiveCards = await getActiveCardsForGuardAndType(
        ctx,
        args.guard_user_id,
        candidate.card_type,
      );
      const now = Date.now();
      for (const existingCard of existingActiveCards) {
        if (
          INCENTIVE_LEVEL_PRECEDENCE[existingCard.level] <
          INCENTIVE_LEVEL_PRECEDENCE[candidate.level]
        ) {
          await ctx.db.patch(existingCard._id, {
            status: "expired",
            expires_at: now,
            metadata: {
              ...getMetadata(existingCard),
              expired_reason: "superseded_by_higher_tier",
            },
          });
        }
      }

      const copy = buildAutoSuggestionCopy(candidate);
      const cardId = await ctx.db.insert("incentive_cards", {
        guard_user_id: args.guard_user_id,
        card_type: candidate.card_type,
        level: candidate.level,
        awarded_method: "AUTO",
        title: copy.title,
        description: copy.description,
        badge_icon: INCENTIVE_TIER_ICONS[candidate.level],
        earned_at: Date.now(),
        status: "active",
        metadata: {
          award_source: "auto",
          review_state: AUTO_REVIEW_STATE,
          trigger: args.trigger,
          metric_snapshot: {
            metric_name: candidate.metric_name,
            metric_value: candidate.metric_value,
            verified_leads_count: metrics.verified_leads_count,
            total_submitted_leads_count: metrics.total_submitted_leads_count,
            completed_visits_count: metrics.completed_visits_count,
            verified_rate: metrics.verified_rate,
            thresholds: candidate.thresholds,
          },
        },
      });

      created_card_ids.push(cardId);
    }

    return {
      trigger: args.trigger,
      created_card_ids,
      metrics,
    };
  },
});

export const updateStreak = internalMutation({
  args: {
    guard_user_id: v.id("users"),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    const guard = await ctx.db.get(args.guard_user_id);

    if (!guard || !isFieldWorkerUserType(guard.user_type)) {
      throw new Error("Guard not found");
    }

    const normalizedScore = clampScore(args.score);
    const now = Date.now();
    const todayDateKey = getISTDateKey(now);
    const yesterdayDateKey = getYesterdayISTDateKey(now);
    const [bonusMap, qualityHistory] = await Promise.all([
      getStreakMilestoneBonusMap(ctx),
      ctx.db
        .query("quality_score_history")
        .withIndex("by_guard_and_date", (q) => q.eq("guard_user_id", args.guard_user_id))
        .order("desc")
        .collect(),
    ]);
    const nonDeletedQualityHistory = qualityHistory.filter((entry) => entry.is_deleted !== true);
    const qualityChain = computeTrailingQualifiedCount(
      nonDeletedQualityHistory,
      (score) => score >= 85,
    );
    const perfectChain = computeTrailingQualifiedCount(
      nonDeletedQualityHistory,
      (score) => score === 100,
    );
    const milestone_bonuses: Array<{
      streak_type: StreakType;
      milestone: number;
      bonus_paise: number;
      streak_started_at: number;
    }> = [];

    for (const streakType of STREAK_TYPES) {
      const existingStreak = await getGuardStreakRecord(ctx, args.guard_user_id, streakType);

      let qualifies = false;
      if (streakType === STREAK_TYPE.PERFECT_10) {
        qualifies = normalizedScore === 100;
      } else if (streakType === STREAK_TYPE.QUALITY_CHAIN) {
        qualifies = normalizedScore >= 85;
      } else {
        qualifies = normalizedScore >= 60;
      }

      if (DAY_BASED_STREAK_TYPES.has(streakType)) {
        if (!qualifies) {
          continue;
        }

        let nextCurrentCount = 1;
        let nextStartedAt = now;
        let countChanged = true;

        if (
          existingStreak &&
          existingStreak.is_active &&
          existingStreak.last_activity_date === todayDateKey
        ) {
          nextCurrentCount = existingStreak.current_count;
          nextStartedAt = existingStreak.started_at;
          countChanged = false;
        } else if (
          existingStreak &&
          existingStreak.is_active &&
          existingStreak.last_activity_date === yesterdayDateKey
        ) {
          nextCurrentCount = existingStreak.current_count + 1;
          nextStartedAt = existingStreak.started_at;
        }

        const nextLongestCount = Math.max(existingStreak?.longest_count ?? 0, nextCurrentCount);

        if (existingStreak) {
          await ctx.db.patch(existingStreak._id, {
            current_count: nextCurrentCount,
            longest_count: nextLongestCount,
            is_active: true,
            last_activity_date: todayDateKey,
            started_at: nextStartedAt,
            updated_at: now,
            is_deleted: false,
          });
        } else {
          await ctx.db.insert("guard_streaks", {
            guard_user_id: args.guard_user_id,
            streak_type: streakType,
            current_count: nextCurrentCount,
            longest_count: nextLongestCount,
            is_active: true,
            last_activity_date: todayDateKey,
            started_at: nextStartedAt,
            updated_at: now,
            is_deleted: false,
          });
        }

        if (countChanged) {
          const milestoneBonus = await checkStreakMilestone(
            ctx,
            args.guard_user_id,
            nextCurrentCount,
            nextStartedAt,
            bonusMap,
          );

          if (milestoneBonus) {
            milestone_bonuses.push({
              streak_type: streakType,
              milestone: milestoneBonus.milestone,
              bonus_paise: milestoneBonus.bonus_paise,
              streak_started_at: nextStartedAt,
            });
          }
        }

        continue;
      }

      const taskStreak = streakType === STREAK_TYPE.QUALITY_CHAIN ? qualityChain : perfectChain;
      const nextCurrentCount = taskStreak.count;
      const nextStartedAt = taskStreak.startedAt ?? now;
      const nextLastActivityDate = taskStreak.lastActivityDate ?? todayDateKey;
      const nextLongestCount = Math.max(existingStreak?.longest_count ?? 0, nextCurrentCount);

      if (nextCurrentCount === 0) {
        if (!existingStreak) {
          continue;
        }

        if (!existingStreak.is_active && existingStreak.current_count === 0) {
          continue;
        }

        await ctx.db.patch(existingStreak._id, {
          current_count: 0,
          is_active: false,
          last_activity_date: nextLastActivityDate,
          updated_at: now,
        });
        continue;
      }

      const countChanged =
        !existingStreak ||
        existingStreak.current_count !== nextCurrentCount ||
        !existingStreak.is_active ||
        existingStreak.last_activity_date !== nextLastActivityDate;

      if (existingStreak) {
        await ctx.db.patch(existingStreak._id, {
          current_count: nextCurrentCount,
          longest_count: nextLongestCount,
          is_active: true,
          last_activity_date: nextLastActivityDate,
          started_at: nextStartedAt,
          updated_at: now,
          is_deleted: false,
        });
      } else {
        await ctx.db.insert("guard_streaks", {
          guard_user_id: args.guard_user_id,
          streak_type: streakType,
          current_count: nextCurrentCount,
          longest_count: nextLongestCount,
          is_active: true,
          last_activity_date: nextLastActivityDate,
          started_at: nextStartedAt,
          updated_at: now,
          is_deleted: false,
        });
      }

      if (countChanged) {
        const milestoneBonus = await checkStreakMilestone(
          ctx,
          args.guard_user_id,
          nextCurrentCount,
          nextStartedAt,
          bonusMap,
        );

        if (milestoneBonus) {
          milestone_bonuses.push({
            streak_type: streakType,
            milestone: milestoneBonus.milestone,
            bonus_paise: milestoneBonus.bonus_paise,
            streak_started_at: nextStartedAt,
          });
        }
      }
    }

    return {
      guard_user_id: args.guard_user_id,
      score: normalizedScore,
      updated_at: now,
      milestone_bonuses,
    };
  },
});

export const validateStreaks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const todayDateKey = getISTDateKey(now);
    const yesterdayDateKey = getYesterdayISTDateKey(now);

    const activeStreaks = await ctx.db
      .query("guard_streaks")
      .withIndex("by_active", (q) => q.eq("is_active", true))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    let brokenCount = 0;
    for (const streak of activeStreaks) {
      if (!DAY_BASED_STREAK_TYPES.has(streak.streak_type)) {
        continue;
      }

      if (
        streak.last_activity_date === todayDateKey ||
        streak.last_activity_date === yesterdayDateKey
      ) {
        continue;
      }

      await ctx.db.patch(streak._id, {
        current_count: 0,
        is_active: false,
        updated_at: now,
      });
      brokenCount += 1;
    }

    console.log(`Streak audit: ${brokenCount} streaks broken`);

    return {
      checked_count: activeStreaks.length,
      streaks_broken: brokenCount,
      audited_at: now,
      yesterday_date_key: yesterdayDateKey,
    };
  },
});

export const breakStaleStreaks = validateStreaks;

export const recomputeQualityScore = internalMutation({
  args: {
    guard_user_id: v.id("users"),
    trigger: qualityTriggerValidator,
  },
  handler: async (ctx, args) => {
    const guard = await ctx.db.get(args.guard_user_id);

    if (!guard || !isFieldWorkerUserType(guard.user_type)) {
      throw new Error("Guard not found");
    }

    const [weightConfig, tierConfig] = await Promise.all([
      getQualityWeightConfig(ctx),
      getQualityTierConfig(ctx),
    ]);

    const now = Date.now();
    const thirtyDaysAgo = now - THIRTY_DAYS_MS;

    const [checklists, completedVisits, documentRequirements] = await Promise.all([
      ctx.db
        .query("checklist_instances")
        .withIndex("by_assigned_to", (q) => q.eq("assigned_to", args.guard_user_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db
        .query("visits")
        .withIndex("by_guard_and_status", (q) =>
          q.eq("assigned_guard_id", args.guard_user_id).eq("status", "COMPLETED"),
        )
        .collect(),
      ctx.db
        .query("document_requirements")
        .withIndex("by_assigned_to", (q) => q.eq("assigned_to", args.guard_user_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
    ]);

    const recentChecklists = checklists.filter(
      (instance) => instance._creationTime >= thirtyDaysAgo,
    );
    const approvedChecklists = recentChecklists.filter(
      (instance) => instance.status === CHECKLIST_STATUS.APPROVED,
    );
    const submittedChecklists = recentChecklists.filter(
      (instance) =>
        instance.status === CHECKLIST_STATUS.SUBMITTED ||
        instance.status === CHECKLIST_STATUS.UNDER_REVIEW ||
        instance.status === CHECKLIST_STATUS.APPROVED ||
        instance.status === CHECKLIST_STATUS.REJECTED ||
        instance.status === CHECKLIST_STATUS.REVISION_REQUESTED,
    );

    const checklistComponent =
      approvedChecklists.length === 0
        ? QUALITY_COMPONENT_DEFAULT
        : clampScore(
            approvedChecklists.reduce((sum, instance) => sum + instance.completeness_score, 0) /
              approvedChecklists.length,
          );

    const templateIds = [...new Set(approvedChecklists.map((instance) => instance.template_id))];
    const templateEntries = await Promise.all(
      templateIds.map(async (templateId) => {
        const template = await ctx.db.get(templateId);
        return [templateId, template] as const;
      }),
    );
    const templateMap = new Map(
      templateEntries.filter(
        (entry): entry is readonly [Id<"checklist_templates">, Doc<"checklist_templates">] =>
          entry[1] !== null && entry[1].is_deleted !== true,
      ),
    );

    let totalPhotoItems = 0;
    let itemsWithPhotos = 0;
    let gpsPhotoEvidenceCount = 0;

    for (const checklist of approvedChecklists) {
      const template = templateMap.get(checklist.template_id);

      if (!template) {
        continue;
      }

      const photoItemKeys = getPhotoItemKeys(template, checklist.depth);
      totalPhotoItems += photoItemKeys.size;

      for (const itemKey of photoItemKeys) {
        const response = checklist.responses.find(
          (entry) => buildPhotoItemKey(entry.section_id, entry.item_id) === itemKey,
        );

        if (!response || response.photo_ids.length === 0) {
          continue;
        }

        itemsWithPhotos += 1;
        if (hasGpsMetadata(response)) {
          gpsPhotoEvidenceCount += 1;
        }
      }
    }

    let photoComponent =
      totalPhotoItems === 0
        ? QUALITY_COMPONENT_DEFAULT
        : clampScore((itemsWithPhotos / totalPhotoItems) * 100);

    if (gpsPhotoEvidenceCount > 0) {
      photoComponent = clampScore(photoComponent + 10);
    }

    const recentVisitDurationsHours = completedVisits
      .filter((visit) => visit.completed_at !== undefined && visit.completed_at >= thirtyDaysAgo)
      .map((visit) => Math.max(0, (visit.completed_at! - visit._creationTime) / (60 * 60 * 1000)));

    let speedComponent = QUALITY_COMPONENT_DEFAULT;
    if (recentVisitDurationsHours.length > 0) {
      const averageHours =
        recentVisitDurationsHours.reduce((sum, value) => sum + value, 0) /
        recentVisitDurationsHours.length;

      if (averageHours <= 24) {
        speedComponent = 100;
      } else if (averageHours <= 48) {
        speedComponent = 75;
      } else if (averageHours <= 72) {
        speedComponent = 50;
      } else {
        speedComponent = 25;
      }
    }

    const verificationComponent =
      submittedChecklists.length === 0
        ? QUALITY_COMPONENT_DEFAULT
        : clampScore((approvedChecklists.length / submittedChecklists.length) * 100);

    let totalRequiredDocuments = 0;
    let completedRequiredDocuments = 0;

    for (const requirement of documentRequirements) {
      for (const item of requirement.items) {
        if (!item.is_required) {
          continue;
        }

        totalRequiredDocuments += 1;

        if (
          item.status === DOCUMENT_ITEM_STATUS.VERIFIED ||
          item.status === DOCUMENT_ITEM_STATUS.NA
        ) {
          completedRequiredDocuments += 1;
        }
      }
    }

    const documentComponent =
      totalRequiredDocuments === 0
        ? QUALITY_COMPONENT_DEFAULT
        : clampScore((completedRequiredDocuments / totalRequiredDocuments) * 100);

    const components: QualityScoreComponents = {
      checklist: clampScore(checklistComponent),
      photo: clampScore(photoComponent),
      speed: clampScore(speedComponent),
      verification: clampScore(verificationComponent),
      document: clampScore(documentComponent),
    };

    const weightedScore = clampScore(
      (components.checklist * weightConfig.checklist +
        components.photo * weightConfig.photo +
        components.speed * weightConfig.speed +
        components.verification * weightConfig.verification +
        components.document * weightConfig.document) /
        100,
    );

    const tier = determineQualityTier(weightedScore, tierConfig);

    await ctx.db.insert("quality_score_history", {
      guard_user_id: args.guard_user_id,
      score: weightedScore,
      components,
      trigger: args.trigger,
      tier,
      computed_at: now,
      is_deleted: false,
    });

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.guard_user_id))
      .unique();

    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }

    await ctx.db.patch(guardProfile._id, {
      quality_score: weightedScore,
    });

    await ctx.runMutation(internal.incentives.updateStreak, {
      guard_user_id: args.guard_user_id,
      score: weightedScore,
    });

    return {
      guard_user_id: args.guard_user_id,
      trigger: args.trigger,
      score: weightedScore,
      tier,
      components,
    };
  },
});

export async function getLatestQualityComponents(
  ctx: DbContext,
  guardUserId: Id<"users">,
): Promise<LatestQualitySnapshot | null> {
  const history = await ctx.db
    .query("quality_score_history")
    .withIndex("by_guard_and_date", (q) => q.eq("guard_user_id", guardUserId))
    .order("desc")
    .collect();

  const latest = history.find((entry) => entry.is_deleted !== true);

  if (!latest) {
    return null;
  }

  return {
    score: clampScore(latest.score),
    tier: latest.tier,
    components: {
      checklist: clampScore(latest.components.checklist),
      photo: clampScore(latest.components.photo),
      speed: clampScore(latest.components.speed),
      verification: clampScore(latest.components.verification),
      document: clampScore(latest.components.document),
    },
  };
}

async function getConsecutivePoorScoreCount(
  ctx: DbContext,
  guardUserId: Id<"users">,
  threshold: number,
): Promise<number> {
  const history = await ctx.db
    .query("quality_score_history")
    .withIndex("by_guard_and_date", (q) => q.eq("guard_user_id", guardUserId))
    .order("desc")
    .collect();

  let count = 0;

  for (const entry of history) {
    if (entry.is_deleted === true) {
      continue;
    }

    if (clampScore(entry.score) < threshold) {
      count += 1;
      continue;
    }

    break;
  }

  return count;
}

async function getEligibleStreakBonusPaise(
  ctx: MutationCtx,
  guardUserId: Id<"users">,
): Promise<number> {
  const [activeStreaks, adjustments, bonusMap] = await Promise.all([
    ctx.db
      .query("guard_streaks")
      .withIndex("by_guard", (q) => q.eq("guard_user_id", guardUserId))
      .filter((q) => q.and(q.eq(q.field("is_active"), true), q.neq(q.field("is_deleted"), true)))
      .collect(),
    ctx.db
      .query("payout_adjustments")
      .withIndex("by_guard", (q) => q.eq("guard_user_id", guardUserId))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect(),
    getStreakMilestoneBonusMap(ctx),
  ]);

  let highestEligibleBonus = 0;

  for (const streak of activeStreaks) {
    const milestone = getHighestReachedStreakMilestone(streak.current_count);

    if (!milestone) {
      continue;
    }

    const bonusAmount = bonusMap.get(milestone) ?? 0;

    if (bonusAmount <= 0) {
      continue;
    }

    const alreadyCreditedInWindow = adjustments.some(
      (adjustment) =>
        adjustment.streak_bonus_paise === bonusAmount &&
        adjustment.computed_at >= streak.started_at,
    );

    if (alreadyCreditedInWindow) {
      continue;
    }

    highestEligibleBonus = Math.max(highestEligibleBonus, bonusAmount);
  }

  return highestEligibleBonus;
}

export const computePayoutAdjustment = internalMutation({
  args: {
    payout_id: v.id("payouts"),
    guard_user_id: v.id("users"),
    base_amount_paise: v.number(),
  },
  handler: async (ctx, args) => {
    assertPositiveIntegerPaise(args.base_amount_paise, "base_amount_paise");

    const payout = await ctx.db.get(args.payout_id);

    if (!payout) {
      throw new Error("Payout not found");
    }

    if (payout.guard_user_id !== args.guard_user_id) {
      throw new Error("guard_user_id does not match payout guard");
    }

    if (
      payout.status === PAYOUT_STATUS.DISBURSED ||
      payout.status === PAYOUT_STATUS.FAILED ||
      payout.status === PAYOUT_STATUS.VOIDED
    ) {
      throw new Error("Cannot compute payout adjustment for a finalized payout");
    }

    const guard = await ctx.db.get(args.guard_user_id);

    if (!guard || !isFieldWorkerUserType(guard.user_type)) {
      throw new Error("Guard not found");
    }

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.guard_user_id))
      .unique();

    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }

    const now = Date.now();

    const [
      qualityTierConfig,
      noShowPenaltyPaise,
      latestQuality,
      checklists,
      lead,
      leadVisits,
      streakBonusPaise,
      consecutivePoorCount,
      existingAdjustments,
    ] = await Promise.all([
      getQualityTierConfig(ctx),
      getSystemConfigNumber(ctx, SYSTEM_CONFIG_KEYS.PENALTY_NO_SHOW_PAISE, 20000),
      getLatestQualityComponents(ctx, args.guard_user_id),
      ctx.db
        .query("checklist_instances")
        .withIndex("by_assigned_to", (q) => q.eq("assigned_to", args.guard_user_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db.get(payout.lead_id),
      ctx.db
        .query("visits")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", payout.lead_id))
        .collect(),
      getEligibleStreakBonusPaise(ctx, args.guard_user_id),
      getConsecutivePoorScoreCount(ctx, args.guard_user_id, 40),
      ctx.db
        .query("payout_adjustments")
        .withIndex("by_payout", (q) => q.eq("payout_id", args.payout_id))
        .collect(),
    ]);

    const qualityScore = clampScore(guardProfile.quality_score ?? latestQuality?.score ?? 0);
    const qualityTier = determineQualityTier(qualityScore, qualityTierConfig);
    const qualityMultiplier = QUALITY_MULTIPLIER_BY_TIER[qualityTier];
    const qualityAdjusted = Math.round(args.base_amount_paise * qualityMultiplier);

    const components: QualityScoreComponents = latestQuality?.components ?? {
      checklist: QUALITY_COMPONENT_DEFAULT,
      photo: QUALITY_COMPONENT_DEFAULT,
      speed: QUALITY_COMPONENT_DEFAULT,
      verification: QUALITY_COMPONENT_DEFAULT,
      document: QUALITY_COMPONENT_DEFAULT,
    };

    // Scope FULL_CHECKLIST bonus to this payout's lead visits, not guard-wide
    const leadVisitIds = new Set(leadVisits.map((visit) => visit._id));
    const leadSpecificChecklists = checklists.filter(
      (checklist) =>
        checklist.status === CHECKLIST_STATUS.APPROVED && leadVisitIds.has(checklist.visit_id),
    );
    const leadApprovedChecklist = leadSpecificChecklists.reduce<ChecklistInstanceDoc | null>(
      (latest, checklist) => {
        if (!latest || checklist._creationTime > latest._creationTime) {
          return checklist;
        }

        return latest;
      },
      null,
    );

    const taskBonuses: TaskBonusBreakdown[] = [];

    if (leadApprovedChecklist && leadApprovedChecklist.completeness_score === 100) {
      taskBonuses.push({
        bonus_type: BONUS_TYPE.FULL_CHECKLIST,
        label: BONUS_TYPE_LABELS[BONUS_TYPE.FULL_CHECKLIST],
        amount_paise: Math.round(args.base_amount_paise * 0.1),
        percentage: 10,
      });
    }

    if (components.photo >= 90) {
      taskBonuses.push({
        bonus_type: BONUS_TYPE.ALL_GPS_PHOTOS,
        label: BONUS_TYPE_LABELS[BONUS_TYPE.ALL_GPS_PHOTOS],
        amount_paise: Math.round(args.base_amount_paise * 0.05),
        percentage: 5,
      });
    }

    if (components.speed >= 75) {
      taskBonuses.push({
        bonus_type: BONUS_TYPE.WITHIN_SLA,
        label: BONUS_TYPE_LABELS[BONUS_TYPE.WITHIN_SLA],
        amount_paise: Math.round(args.base_amount_paise * 0.1),
        percentage: 10,
      });
    }

    if (components.document >= 90) {
      taskBonuses.push({
        bonus_type: BONUS_TYPE.ALL_REQUIRED_DOCS,
        label: BONUS_TYPE_LABELS[BONUS_TYPE.ALL_REQUIRED_DOCS],
        amount_paise: Math.round(args.base_amount_paise * 0.15),
        percentage: 15,
      });
    }

    const penalties: PenaltyBreakdown[] = [];

    if (components.checklist < 40) {
      penalties.push({
        penalty_type: PENALTY_TYPE.LOW_COMPLETENESS,
        label: PENALTY_TYPE_LABELS[PENALTY_TYPE.LOW_COMPLETENESS],
        amount_paise: 50000,
      });
    }

    if (components.photo < 30) {
      penalties.push({
        penalty_type: PENALTY_TYPE.MISSING_PHOTOS,
        label: PENALTY_TYPE_LABELS[PENALTY_TYPE.MISSING_PHOTOS],
        amount_paise: 30000,
      });
    }

    if ((lead?.quality_flags?.length ?? 0) > 0) {
      penalties.push({
        penalty_type: PENALTY_TYPE.FALSE_LEAD,
        label: PENALTY_TYPE_LABELS[PENALTY_TYPE.FALSE_LEAD],
        amount_paise: 100000,
      });
    }

    const noShowPenalty = Math.max(0, Math.round(noShowPenaltyPaise));
    const hasNoShowVisit = leadVisits.some((visit) => visit.status === VISIT_STATUS.NO_SHOW);

    if (hasNoShowVisit && noShowPenalty > 0) {
      penalties.push({
        penalty_type: PENALTY_TYPE.NO_SHOW,
        label: PENALTY_TYPE_LABELS[PENALTY_TYPE.NO_SHOW],
        amount_paise: noShowPenalty,
      });
    }

    if (consecutivePoorCount >= 3) {
      penalties.push({
        penalty_type: PENALTY_TYPE.CONSECUTIVE_POOR,
        label: PENALTY_TYPE_LABELS[PENALTY_TYPE.CONSECUTIVE_POOR],
        amount_paise: 50000,
      });
    }

    const taskBonusesTotalPaise = taskBonuses.reduce((sum, bonus) => sum + bonus.amount_paise, 0);
    const penaltyTotalPaise = penalties.reduce((sum, penalty) => sum + penalty.amount_paise, 0);
    const suggestedTotalPaise = Math.max(
      0,
      qualityAdjusted + streakBonusPaise + taskBonusesTotalPaise - penaltyTotalPaise,
    );

    for (const adjustment of existingAdjustments) {
      if (adjustment.is_deleted === true) {
        continue;
      }

      await ctx.db.patch(adjustment._id, {
        is_deleted: true,
      });
    }

    const adjustmentId = await ctx.db.insert("payout_adjustments", {
      payout_id: args.payout_id,
      guard_user_id: args.guard_user_id,
      base_amount_paise: args.base_amount_paise,
      quality_score: qualityScore,
      quality_tier: qualityTier,
      quality_multiplier: qualityMultiplier,
      streak_bonus_paise: streakBonusPaise,
      task_bonuses: taskBonuses,
      task_bonuses_total_paise: taskBonusesTotalPaise,
      penalties,
      penalty_total_paise: penaltyTotalPaise,
      suggested_total_paise: suggestedTotalPaise,
      final_amount_paise: suggestedTotalPaise,
      computed_at: now,
      is_deleted: false,
    });

    return await ctx.db.get(adjustmentId);
  },
});

export const getLeaderboard = query({
  args: {
    scope: leaderboardScopeValidator,
    persona_filter: fieldWorkerLeaderboardFilterValidator,
    society_id: v.optional(v.id("societies")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.INCENTIVES_VIEW);
    const personaFilter = args.persona_filter ?? DEFAULT_LEADERBOARD_FILTER;
    const limit = normalizeLeaderboardLimit(args.limit, 20, 50);
    const cursor = normalizeLeaderboardCursor(args.cursor);
    const societyId = resolveLeaderboardSocietyId(args.scope, args.society_id);
    const windowStart = getScopeWindowStart(args.scope);

    const [tierConfig, profiles] = await Promise.all([
      getQualityTierConfig(ctx),
      listLeaderboardProfiles(ctx, societyId),
    ]);

    const prefetched = await batchFetchLeaderboardData(ctx, profiles);

    const sortedRows = sortLeaderboardRows(
      buildLeaderboardRowsFromData(profiles, windowStart, tierConfig, prefetched, personaFilter),
    );

    const totalGuards = sortedRows.length;
    const start = Math.min(cursor, totalGuards);
    const end = Math.min(start + limit, totalGuards);

    const items = sortedRows
      .slice(start, end)
      .map((row, index) => toLeaderboardItem(row, start + index + 1));

    const hasMore = end < totalGuards;

    return {
      scope: args.scope,
      persona_filter: personaFilter,
      society_id: societyId,
      cursor: start,
      limit,
      total_guards: totalGuards,
      hasMore,
      nextCursor: hasMore ? end : null,
      items,
    };
  },
});

export const getMyLeaderboardPosition = query({
  args: {
    scope: leaderboardPositionScopeValidator,
    persona_filter: fieldWorkerLeaderboardFilterValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireFieldWorkerAuth(ctx);
    const personaFilter =
      args.persona_filter ?? (user.user_type === "OPS" ? "OPS" : DEFAULT_LEADERBOARD_FILTER);

    const [tierConfig, profiles] = await Promise.all([
      getQualityTierConfig(ctx),
      listLeaderboardProfiles(ctx, undefined),
    ]);

    const [prefetched, guardProfile] = await Promise.all([
      batchFetchLeaderboardData(ctx, profiles),
      getGuardProfileByUserId(ctx, user._id),
    ]);

    const dailyRows = buildLeaderboardRowsFromData(
      profiles,
      getScopeWindowStart("DAILY"),
      tierConfig,
      prefetched,
      personaFilter,
    );
    const weeklyRows = buildLeaderboardRowsFromData(
      profiles,
      getScopeWindowStart("WEEKLY"),
      tierConfig,
      prefetched,
      personaFilter,
    );
    const monthlyRows = buildLeaderboardRowsFromData(
      profiles,
      getScopeWindowStart("MONTHLY"),
      tierConfig,
      prefetched,
      personaFilter,
    );
    const allTimeRows = buildLeaderboardRowsFromData(
      profiles,
      getScopeWindowStart("ALL_TIME"),
      tierConfig,
      prefetched,
      personaFilter,
    );

    const dailySorted = sortLeaderboardRows(dailyRows);
    const weeklySorted = sortLeaderboardRows(weeklyRows);
    const monthlySorted = sortLeaderboardRows(monthlyRows);
    const allTimeSorted = sortLeaderboardRows(allTimeRows);

    const getRank = (rows: LeaderboardRow[]): number | null => {
      const index = rows.findIndex((row) => row.guard_user_id === user._id);
      return index === -1 ? null : index + 1;
    };

    const getTasksCompleted = (rows: LeaderboardRow[]): number => {
      const row = rows.find((candidate) => candidate.guard_user_id === user._id);
      return row?.tasks_completed ?? 0;
    };

    const qualityScore = clampScore(guardProfile?.quality_score ?? 0);

    const selectedScope = args.scope;
    const selectedRows =
      selectedScope === "DAILY"
        ? dailySorted
        : selectedScope === "WEEKLY"
          ? weeklySorted
          : selectedScope === "MONTHLY"
            ? monthlySorted
            : allTimeSorted;
    const selectedRank = getRank(selectedRows);
    const selectedTotalGuards = selectedRows.length;
    const selectedPercentile =
      selectedRank === null || selectedTotalGuards === 0
        ? 0
        : roundTo2(((selectedTotalGuards - selectedRank + 1) / selectedTotalGuards) * 100);

    return {
      persona: user.user_type,
      persona_filter: personaFilter,
      daily_rank: getRank(dailySorted),
      weekly_rank: getRank(weeklySorted),
      monthly_rank: getRank(monthlySorted),
      quality_score: qualityScore,
      tier: determineQualityTier(qualityScore, tierConfig),
      tasks_completed: getTasksCompleted(allTimeSorted),
      tasks_completed_daily: getTasksCompleted(dailySorted),
      tasks_completed_weekly: getTasksCompleted(weeklySorted),
      tasks_completed_monthly: getTasksCompleted(monthlySorted),
      rank: selectedRank,
      total_guards: selectedTotalGuards,
      percentile: selectedPercentile,
    };
  },
});

export const getTopGuards = query({
  args: {
    scope: leaderboardPositionScopeValidator,
    persona_filter: fieldWorkerLeaderboardFilterValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Staff roster data: field workers only (admins use getLeaderboard).
    await requireFieldWorkerAuth(ctx);

    const personaFilter = args.persona_filter ?? DEFAULT_LEADERBOARD_FILTER;
    const limit = normalizeLeaderboardLimit(args.limit, 5, 50);
    const windowStart = getScopeWindowStart(args.scope);

    const [tierConfig, profiles] = await Promise.all([
      getQualityTierConfig(ctx),
      listLeaderboardProfiles(ctx, undefined),
    ]);

    const prefetched = await batchFetchLeaderboardData(ctx, profiles);

    const sortedRows = sortLeaderboardRows(
      buildLeaderboardRowsFromData(profiles, windowStart, tierConfig, prefetched, personaFilter),
    );

    return {
      scope: args.scope,
      persona_filter: personaFilter,
      items: sortedRows.slice(0, limit).map((row, index) => toLeaderboardItem(row, index + 1)),
    };
  },
});

export const confirm = mutation({
  args: {
    card_id: v.id("incentive_cards"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.INCENTIVES_AWARD);
    const card = await ctx.db.get(args.card_id);

    if (!card) {
      throw new Error("Incentive card not found");
    }

    if (!isAutoSuggestionPending(card)) {
      throw new Error("Only pending auto-suggestions can be confirmed");
    }

    const otherActiveCards = await getOtherActiveCardsForType(ctx, card);

    for (const existingCard of otherActiveCards) {
      if (
        INCENTIVE_LEVEL_PRECEDENCE[existingCard.level] >= INCENTIVE_LEVEL_PRECEDENCE[card.level]
      ) {
        throw new Error(
          `Guard already has an active ${INCENTIVE_CARD_TYPE_LABELS[card.card_type]} card at ${existingCard.level} or higher`,
        );
      }
    }

    const now = Date.now();
    for (const lowerTierCard of otherActiveCards) {
      await ctx.db.patch(lowerTierCard._id, {
        status: "expired",
        expires_at: now,
      });
    }

    const metadata = getMetadata(card);
    await ctx.db.patch(card._id, {
      metadata: {
        ...metadata,
        award_source: "auto",
        review_state: "confirmed",
        confirmed_at: now,
        confirmed_by_admin_id: admin._id,
      },
    });

    return await ctx.db.get(card._id);
  },
});

export const reject = mutation({
  args: {
    card_id: v.id("incentive_cards"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.INCENTIVES_AWARD);
    const card = await ctx.db.get(args.card_id);

    if (!card) {
      throw new Error("Incentive card not found");
    }

    if (!isAutoSuggestionPending(card)) {
      throw new Error("Only pending auto-suggestions can be rejected");
    }

    const now = Date.now();
    const metadata = getMetadata(card);

    await ctx.db.patch(card._id, {
      status: "expired",
      rejected_at: now,
      metadata: {
        ...metadata,
        award_source: "auto",
        review_state: "rejected",
        rejected_at: now,
        rejected_by_admin_id: admin._id,
      },
    });

    return await ctx.db.get(card._id);
  },
});

export const manualAward = mutation({
  args: {
    guard_user_id: v.id("users"),
    card_type: incentiveCardTypeValidator,
    level: incentiveLevelValidator,
    title: v.string(),
    description: v.string(),
    badge_icon: v.string(),
    reward_amount_paise: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.INCENTIVES_AWARD);

    const guard = await ctx.db.get(args.guard_user_id);
    if (!guard || !isFieldWorkerUserType(guard.user_type)) {
      throw new Error("Field worker not found");
    }

    assertOptionalPaise(args.reward_amount_paise, "reward_amount_paise");

    const activeCards = await getActiveCardsForGuardAndType(
      ctx,
      args.guard_user_id,
      args.card_type,
    );

    for (const existingCard of activeCards) {
      if (
        INCENTIVE_LEVEL_PRECEDENCE[existingCard.level] >= INCENTIVE_LEVEL_PRECEDENCE[args.level]
      ) {
        throw new Error(
          `Guard already has an active ${INCENTIVE_CARD_TYPE_LABELS[args.card_type]} card at ${existingCard.level} or higher`,
        );
      }
    }

    const now = Date.now();

    for (const lowerCard of activeCards) {
      await ctx.db.patch(lowerCard._id, {
        status: "expired",
        expires_at: now,
      });
    }

    const title = normalizeRequiredString(args.title, "title");
    const description = normalizeRequiredString(args.description, "description");
    const badgeIcon = normalizeRequiredString(args.badge_icon, "badge_icon");
    const reason = normalizeOptionalString(args.reason);

    const cardId = await ctx.db.insert("incentive_cards", {
      guard_user_id: args.guard_user_id,
      card_type: args.card_type,
      level: args.level,
      awarded_method: "MANUAL",
      awarded_by_admin_id: admin._id,
      title,
      description,
      badge_icon: badgeIcon,
      reward_amount_paise: args.reward_amount_paise,
      earned_at: now,
      status: "active",
      metadata: {
        award_source: "manual",
        reason,
        awarded_by_admin_id: admin._id,
      },
    });

    return await ctx.db.get(cardId);
  },
});

export const expire = mutation({
  args: {
    card_id: v.id("incentive_cards"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.INCENTIVES_EXPIRE);
    const card = await ctx.db.get(args.card_id);

    if (!card) {
      throw new Error("Incentive card not found");
    }

    if (card.status !== "active") {
      throw new Error("Only active incentive cards can be expired");
    }

    const reason = normalizeRequiredString(args.reason, "reason");
    const now = Date.now();
    const metadata = getMetadata(card);

    await ctx.db.patch(card._id, {
      status: "expired",
      expires_at: now,
      metadata: {
        ...metadata,
        reason,
        expired_at: now,
        expired_by_admin_id: admin._id,
      },
    });

    return await ctx.db.get(card._id);
  },
});

export const listPending = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.INCENTIVES_VIEW);

    const paginatedCards: PaginationResult<IncentiveCardDoc> = await ctx.db
      .query("incentive_cards")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .paginate(args.paginationOpts);

    const pendingCards = paginatedCards.page.filter((card) => isAutoSuggestionPending(card));
    const page = await enrichCardsWithGuardName(ctx, pendingCards);

    return {
      ...paginatedCards,
      page,
    };
  },
});

export const listActive = query({
  args: {
    guard_user_id: v.optional(v.id("users")),
    card_type: v.optional(incentiveCardTypeValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.INCENTIVES_VIEW);

    let paginatedCards: PaginationResult<IncentiveCardDoc>;

    if (args.guard_user_id && args.card_type) {
      paginatedCards = await ctx.db
        .query("incentive_cards")
        .withIndex("by_guard_and_type", (q) =>
          q.eq("guard_user_id", args.guard_user_id!).eq("card_type", args.card_type!),
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.guard_user_id) {
      paginatedCards = await ctx.db
        .query("incentive_cards")
        .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", args.guard_user_id!))
        .filter((q) => q.eq(q.field("status"), "active"))
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.card_type) {
      paginatedCards = await ctx.db
        .query("incentive_cards")
        .withIndex("by_card_type", (q) => q.eq("card_type", args.card_type!))
        .filter((q) => q.eq(q.field("status"), "active"))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      paginatedCards = await ctx.db
        .query("incentive_cards")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const page = await enrichCardsWithGuardName(ctx, paginatedCards.page);

    return {
      ...paginatedCards,
      page,
    };
  },
});

export const getByGuard = query({
  args: {
    guard_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.INCENTIVES_VIEW);

    const cards = await ctx.db
      .query("incentive_cards")
      .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", args.guard_user_id))
      .order("desc")
      .collect();

    const [guard] = await Promise.all([ctx.db.get(args.guard_user_id)]);
    const guard_name = guard?.name ?? "Unknown";

    return cards.map((card) => ({
      ...card,
      guard_name,
    }));
  },
});

export const getMyQualitySnapshot = query({
  args: {},
  handler: async (ctx) => {
    const { user: guard } = await requireFieldWorkerAuth(ctx);

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", guard._id))
      .unique();

    const qualityScore = guardProfile?.quality_score ?? undefined;

    const [tierConfig, streakBonusMap, activeStreaks, recentHistory, completedVisits] =
      await Promise.all([
        getQualityTierConfig(ctx),
        getStreakMilestoneBonusMap(ctx),
        ctx.db
          .query("guard_streaks")
          .withIndex("by_guard", (q) => q.eq("guard_user_id", guard._id))
          .filter((q) =>
            q.and(q.eq(q.field("is_active"), true), q.neq(q.field("is_deleted"), true)),
          )
          .collect(),
        ctx.db
          .query("quality_score_history")
          .withIndex("by_guard_and_date", (q) => q.eq("guard_user_id", guard._id))
          .order("desc")
          .take(20),
        ctx.db
          .query("visits")
          .withIndex("by_guard_and_status", (q) =>
            q.eq("assigned_guard_id", guard._id).eq("status", "COMPLETED"),
          )
          .collect(),
      ]);

    const nonDeletedHistory = recentHistory.filter((entry) => entry.is_deleted !== true);
    const last5History = nonDeletedHistory.slice(0, 5).map((entry) => ({
      score: clampScore(entry.score),
      tier: entry.tier,
      trigger: entry.trigger,
      computed_at: entry.computed_at,
    }));

    const tier =
      qualityScore !== undefined
        ? determineQualityTier(qualityScore, tierConfig)
        : QUALITY_TIER.BRONZE;

    const topActiveStreaks = [...activeStreaks]
      .sort((a, b) => b.current_count - a.current_count)
      .slice(0, 4);

    return {
      quality_score: qualityScore,
      tier,
      streaks: topActiveStreaks.map((streak) => {
        const nextMilestone =
          STREAK_MILESTONES.find((milestone) => milestone > streak.current_count) ?? null;

        return {
          next_milestone: nextMilestone,
          next_milestone_bonus_paise:
            nextMilestone === null ? 0 : (streakBonusMap.get(nextMilestone) ?? 0),
          streak_type: streak.streak_type,
          current_count: streak.current_count,
          longest_count: streak.longest_count,
          is_active: streak.is_active,
          last_activity_date: streak.last_activity_date,
        };
      }),
      recent_history: last5History,
      total_completed_tasks: completedVisits.length,
    };
  },
});

export const getMyStreaks = query({
  args: {},
  handler: async (ctx) => {
    const { user: guard } = await requireFieldWorkerAuth(ctx);

    const streaks = await ctx.db
      .query("guard_streaks")
      .withIndex("by_guard", (q) => q.eq("guard_user_id", guard._id))
      .filter((q) => q.and(q.eq(q.field("is_active"), true), q.neq(q.field("is_deleted"), true)))
      .collect();

    return streaks.map((streak) => ({
      streak_type: streak.streak_type,
      current_count: streak.current_count,
      longest_count: streak.longest_count,
      is_active: streak.is_active,
      last_activity_date: streak.last_activity_date,
    }));
  },
});

export const getMyCards = query({
  args: {},
  handler: async (ctx) => {
    const { user: guard } = await requireFieldWorkerAuth(ctx);
    const metrics = await getGuardMetrics(ctx, guard._id);

    const cards = await ctx.db
      .query("incentive_cards")
      .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", guard._id))
      .collect();

    const activeCards = cards.filter(
      (card) => card.status === "active" && !isAutoSuggestionPending(card),
    );

    const sortedCards = [...activeCards].sort((a, b) => {
      if (a.card_type !== b.card_type) {
        return a.card_type.localeCompare(b.card_type);
      }

      return INCENTIVE_LEVEL_PRECEDENCE[b.level] - INCENTIVE_LEVEL_PRECEDENCE[a.level];
    });

    return sortedCards.map((card) => {
      const metadata = getMetadata(card);
      const reason =
        typeof metadata.reason === "string" ? normalizeOptionalString(metadata.reason) : undefined;

      return {
        card_type: card.card_type,
        card_type_display: INCENTIVE_CARD_TYPE_LABELS[card.card_type],
        level: card.level,
        tier_icon: INCENTIVE_TIER_ICONS[card.level],
        title: card.title,
        description: card.description,
        badge_icon: card.badge_icon,
        reward_amount_paise: card.reward_amount_paise,
        earned_at: card.earned_at,
        metric_description: getGuardMetricDescription(card.card_type, metrics),
        metadata: reason ? { reason } : undefined,
      };
    });
  },
});
