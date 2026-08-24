import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BADGE_CODE_V3,
  AVAILABILITY_TYPE,
  ATTRIBUTION_STAGE_WEIGHTS,
  BUILDING_STATUS,
  CLOSURE_STATUS,
  COMMISSION_BOUNDS,
  CONFIG_VERSION_STATUS,
  CONTRIBUTION_STAGE,
  DISBURSEMENT_SOURCE_TYPE,
  DISBURSEMENT_STATUS,
  INCENTIVE_PERSONA,
  LEAD_STATUS,
  MODIFIER_LINK_MODE,
  MODIFIER_REWARD_MODE,
  PERMISSIONS,
  SOCIETY_STATUS,
  STREAK_MILESTONES,
  SYSTEM_CONFIG_KEYS,
  USER_STATUS,
  USER_TYPE,
  WEEKLY_TIER_THRESHOLDS,
  XP_AWARDS,
} from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getLevelFromTotalXp, xpToNextLevel } from "./gamification";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_incentive_v3";
process.env.WORKOS_API_KEY ??= "sk_test_incentive_v3";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_incentive_v3";
process.env.SUPER_ADMIN_EMAIL ??= "super-admin@example.com";

const { authKit } = await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;
type TestInstance = ReturnType<typeof convexTest>;

const WORKOS_ISSUER = "https://api.workos.com/";
const DAY_MS = 24 * 60 * 60 * 1000;

const incentiveConfigRefs = {
  createDraft: api.incentiveConfig.createDraft as unknown as FunctionReference<"mutation">,
  updateDraft: api.incentiveConfig.updateDraft as unknown as FunctionReference<"mutation">,
  activate: api.incentiveConfig.activate as unknown as FunctionReference<"mutation">,
  archive: api.incentiveConfig.archive as unknown as FunctionReference<"mutation">,
} as const;

const incentiveActorRefs = {
  assign: api.incentiveActors.assign as unknown as FunctionReference<"mutation">,
  deactivate: api.incentiveActors.deactivate as unknown as FunctionReference<"mutation">,
  getActiveProfile: api.incentiveActors.getActiveProfile as unknown as FunctionReference<"query">,
} as const;

const commissionEngineRefs = {
  evaluate: api.commissionEngine.evaluate as unknown as FunctionReference<"mutation">,
  simulateEvaluation: api.commissionEngine
    .simulateEvaluation as unknown as FunctionReference<"query">,
} as const;

const shadowModeRefs = {
  getAggregateVariance: api.shadowMode
    .getAggregateVariance as unknown as FunctionReference<"query">,
  internalGetDeltaByClosureId: internal.shadowMode
    .internalGetDeltaByClosureId as unknown as FunctionReference<"query">,
  internalInsertDelta: internal.shadowMode
    .internalInsertDelta as unknown as FunctionReference<"mutation">,
} as const;

const shadowRolloutRefs = {
  checkDecommissionReadiness: api.shadowRollout
    .checkDecommissionReadiness as unknown as FunctionReference<"query">,
  getGuardPayoutSource: api.shadowRollout
    .getGuardPayoutSource as unknown as FunctionReference<"query">,
  getRolloutPolicy: api.shadowRollout.getRolloutPolicy as unknown as FunctionReference<"query">,
  migrateGuardToV3: api.shadowRollout.migrateGuardToV3 as unknown as FunctionReference<"mutation">,
  rollbackGuardToV2: api.shadowRollout
    .rollbackGuardToV2 as unknown as FunctionReference<"mutation">,
  updateRolloutPolicy: api.shadowRollout
    .updateRolloutPolicy as unknown as FunctionReference<"mutation">,
} as const;

const incentiveDisbursementRefs = {
  createFromSplit: internal.incentiveDisbursements
    .createFromSplit as unknown as FunctionReference<"mutation">,
} as const;

type CommissionModifier = {
  enabled: boolean;
  bps_delta: number;
};

type CommissionScenarioModifier = {
  name: string;
  reward_mode: "BPS" | "FLAT_PAISE";
  link_mode: "INDIVIDUAL" | "AND_GROUP" | "OR_GROUP";
  link_group_id?: string;
  operator?: string;
  threshold?: number;
  delta_value: number;
  enabled?: boolean;
};

type CommissionScenarioOptions = {
  scenarioName: string;
  profitPaise: number;
  baseRateBps: number;
  minRateBps: number;
  maxRateBps: number;
  modifiers?: CommissionScenarioModifier[];
  includeActorProfile?: boolean;
  invalidConfigJson?: string;
};

let commissionVersionCounter = 0;

function buildAuthKitUser(id: string): AuthKitUser {
  const timestamp = new Date(0).toISOString();

  return {
    id,
    email: `${id}@guards.local`,
    createdAt: timestamp,
    updatedAt: timestamp,
    emailVerified: true,
    metadata: {},
    externalId: null,
    firstName: null,
    lastName: null,
    lastSignInAt: null,
    locale: null,
    profilePictureUrl: null,
  };
}

async function createAdminWithPermissions(
  t: TestInstance,
  options: {
    workosUserId: string;
    permissions: string[];
  },
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      workos_user_id: options.workosUserId,
      user_type: USER_TYPE.ADMIN,
      name: `Admin ${options.workosUserId}`,
      email: `${options.workosUserId}@example.com`,
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });

    const roleId = await ctx.db.insert("roles", {
      name: `Role ${options.workosUserId}`,
      permissions: options.permissions,
      is_system_role: false,
      is_deleted: false,
    });

    await ctx.db.insert("user_role_assignments", {
      user_id: adminId,
      role_id: roleId,
      assigned_by_admin_id: adminId,
      is_deleted: false,
    });

    return adminId;
  });
}

async function createGuardUser(t: TestInstance, workosUserId: string): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: USER_TYPE.GUARD,
      name: `Guard ${workosUserId}`,
      phone: "9999999999",
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });
  });
}

async function upsertSystemConfigValueForTests(
  t: TestInstance,
  args: {
    key: Doc<"system_config">["key"];
    value: string;
    updatedByAdminId: Id<"users">;
  },
): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("system_config")
      .filter((q) => q.eq(q.field("key"), args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updated_by_admin_id: args.updatedByAdminId,
      });
      return;
    }

    await ctx.db.insert("system_config", {
      key: args.key,
      value: args.value,
      updated_by_admin_id: args.updatedByAdminId,
    });
  });
}

function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  const span = max - min + 1;
  return min + Math.floor(rng() * span);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function evaluateEffectiveRateBps(
  baseRateBps: number,
  minRateBps: number,
  maxRateBps: number,
  modifiers: CommissionModifier[],
): number {
  const totalModifierDelta = modifiers.reduce((sum, modifier) => {
    if (!modifier.enabled) {
      return sum;
    }

    return sum + modifier.bps_delta;
  }, 0);

  return clamp(baseRateBps + totalModifierDelta, minRateBps, maxRateBps);
}

function computePoolPaise(
  profitPaise: number,
  effectiveRateBps: number,
  flatBonusPaise: number,
): number {
  const commissionPart = Math.round((profitPaise * effectiveRateBps) / 10_000);
  return Math.max(0, commissionPart + flatBonusPaise);
}

function splitPoolEvenly(
  poolPaise: number,
  contributors: string[],
): Array<{ actor_id: string; amount_paise: number }> {
  if (contributors.length === 0) {
    throw new Error("contributors are required");
  }

  const baseShare = Math.floor(poolPaise / contributors.length);
  let remainder = poolPaise % contributors.length;

  return contributors.map((actorId) => {
    const bonus = remainder > 0 ? 1 : 0;
    if (remainder > 0) {
      remainder -= 1;
    }

    return {
      actor_id: actorId,
      amount_paise: baseShare + bonus,
    };
  });
}

type AttributionShare = {
  id: string;
  exact: number;
};

type DisbursementStatus = (typeof DISBURSEMENT_STATUS)[keyof typeof DISBURSEMENT_STATUS];

const ATTRIBUTION_STAGE_SCALE_BPS = 10_000;
const ATTRIBUTION_DEFAULT_QUALITY_SCORE = 50;
const ATTRIBUTION_MIN_QUALITY_SCORE = 30;

const ATTRIBUTION_STAGE_ORDER = [
  CONTRIBUTION_STAGE.DISCOVERY,
  CONTRIBUTION_STAGE.VERIFICATION,
  CONTRIBUTION_STAGE.CLOSURE,
  CONTRIBUTION_STAGE.SUPPORT,
] as const;

type AttributionStage = (typeof ATTRIBUTION_STAGE_ORDER)[number];
type StageWeightsBps = Record<AttributionStage, number>;

const DISBURSEMENT_TRANSITIONS: Record<DisbursementStatus, DisbursementStatus[]> = {
  [DISBURSEMENT_STATUS.PENDING]: [DISBURSEMENT_STATUS.APPROVED, DISBURSEMENT_STATUS.VOIDED],
  [DISBURSEMENT_STATUS.APPROVED]: [DISBURSEMENT_STATUS.DISBURSED, DISBURSEMENT_STATUS.VOIDED],
  [DISBURSEMENT_STATUS.DISBURSED]: [],
  [DISBURSEMENT_STATUS.FAILED]: [],
  [DISBURSEMENT_STATUS.VOIDED]: [],
};

function largestRemainderRound(
  shares: AttributionShare[],
  pool: number,
): Array<{ id: string; amount: number }> {
  if (shares.length === 0) {
    return [];
  }

  const normalizedPool = Math.max(0, Math.floor(pool));
  const rounded = shares.map((share) => {
    const floorAmount = Math.floor(Math.max(0, share.exact));
    return {
      id: share.id,
      exact: share.exact,
      amount: floorAmount,
      residue: share.exact - floorAmount,
    };
  });

  const sumFloors = rounded.reduce((sum, share) => sum + share.amount, 0);
  let remainder = Math.max(0, normalizedPool - sumFloors);

  const ranked = [...rounded].sort((left, right) => {
    if (left.residue !== right.residue) {
      return right.residue - left.residue;
    }

    return left.id.localeCompare(right.id);
  });

  let cursor = 0;
  while (remainder > 0 && ranked.length > 0) {
    ranked[cursor % ranked.length]!.amount += 1;
    remainder -= 1;
    cursor += 1;
  }

  return rounded.map(({ id, amount }) => ({ id, amount }));
}

function getDefaultStageWeightsBpsForTests(): StageWeightsBps {
  return {
    [CONTRIBUTION_STAGE.DISCOVERY]: ATTRIBUTION_STAGE_WEIGHTS.DISCOVERY * 100,
    [CONTRIBUTION_STAGE.VERIFICATION]: ATTRIBUTION_STAGE_WEIGHTS.VERIFICATION * 100,
    [CONTRIBUTION_STAGE.CLOSURE]: ATTRIBUTION_STAGE_WEIGHTS.CLOSURE * 100,
    [CONTRIBUTION_STAGE.SUPPORT]: ATTRIBUTION_STAGE_WEIGHTS.SUPPORT * 100,
  };
}

function redistributeWeightsToNonEmptyStagesForTests(
  stageWeightsBps: StageWeightsBps,
  nonEmptyStages: Set<AttributionStage>,
): StageWeightsBps {
  const totalNonEmptyWeight = ATTRIBUTION_STAGE_ORDER.reduce((sum, stage) => {
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
      ? (stageWeightsBps[CONTRIBUTION_STAGE.DISCOVERY] * ATTRIBUTION_STAGE_SCALE_BPS) /
        totalNonEmptyWeight
      : 0,
    [CONTRIBUTION_STAGE.VERIFICATION]: nonEmptyStages.has(CONTRIBUTION_STAGE.VERIFICATION)
      ? (stageWeightsBps[CONTRIBUTION_STAGE.VERIFICATION] * ATTRIBUTION_STAGE_SCALE_BPS) /
        totalNonEmptyWeight
      : 0,
    [CONTRIBUTION_STAGE.CLOSURE]: nonEmptyStages.has(CONTRIBUTION_STAGE.CLOSURE)
      ? (stageWeightsBps[CONTRIBUTION_STAGE.CLOSURE] * ATTRIBUTION_STAGE_SCALE_BPS) /
        totalNonEmptyWeight
      : 0,
    [CONTRIBUTION_STAGE.SUPPORT]: nonEmptyStages.has(CONTRIBUTION_STAGE.SUPPORT)
      ? (stageWeightsBps[CONTRIBUTION_STAGE.SUPPORT] * ATTRIBUTION_STAGE_SCALE_BPS) /
        totalNonEmptyWeight
      : 0,
  };
}

function computeStageBucketFloorsForTests(
  poolPaise: number,
  stageWeightsBps: StageWeightsBps,
  nonEmptyStages: Set<AttributionStage>,
): {
  weights: StageWeightsBps;
  floors: Record<AttributionStage, number>;
} | null {
  if (nonEmptyStages.size === 0) {
    return null;
  }

  const redistributedWeights = redistributeWeightsToNonEmptyStagesForTests(
    stageWeightsBps,
    nonEmptyStages,
  );

  return {
    weights: redistributedWeights,
    floors: {
      [CONTRIBUTION_STAGE.DISCOVERY]: Math.floor(
        (poolPaise * redistributedWeights[CONTRIBUTION_STAGE.DISCOVERY]) /
          ATTRIBUTION_STAGE_SCALE_BPS,
      ),
      [CONTRIBUTION_STAGE.VERIFICATION]: Math.floor(
        (poolPaise * redistributedWeights[CONTRIBUTION_STAGE.VERIFICATION]) /
          ATTRIBUTION_STAGE_SCALE_BPS,
      ),
      [CONTRIBUTION_STAGE.CLOSURE]: Math.floor(
        (poolPaise * redistributedWeights[CONTRIBUTION_STAGE.CLOSURE]) /
          ATTRIBUTION_STAGE_SCALE_BPS,
      ),
      [CONTRIBUTION_STAGE.SUPPORT]: Math.floor(
        (poolPaise * redistributedWeights[CONTRIBUTION_STAGE.SUPPORT]) /
          ATTRIBUTION_STAGE_SCALE_BPS,
      ),
    },
  };
}

function getEligibleContributionWeightForTests(
  qualityScoreSnapshot: number | null | undefined,
  contributionUnits: number,
): number {
  const qualityScore = qualityScoreSnapshot ?? ATTRIBUTION_DEFAULT_QUALITY_SCORE;
  if (!Number.isFinite(qualityScore) || qualityScore < ATTRIBUTION_MIN_QUALITY_SCORE) {
    return 0;
  }

  if (!Number.isFinite(contributionUnits) || contributionUnits <= 0) {
    return 0;
  }

  return contributionUnits * qualityScore;
}

function isValidDisbursementTransitionForTests(
  from: DisbursementStatus,
  to: DisbursementStatus,
): boolean {
  return DISBURSEMENT_TRANSITIONS[from].includes(to);
}

function computeTierFromXp(weeklyXp: number): string {
  if (weeklyXp >= WEEKLY_TIER_THRESHOLDS.PLATINUM) {
    return "PLATINUM";
  }

  if (weeklyXp >= WEEKLY_TIER_THRESHOLDS.GOLD) {
    return "GOLD";
  }

  if (weeklyXp >= WEEKLY_TIER_THRESHOLDS.SILVER) {
    return "SILVER";
  }

  if (weeklyXp >= WEEKLY_TIER_THRESHOLDS.BRONZE) {
    return "BRONZE";
  }

  return "BRONZE";
}

async function createCommissionScenario(
  t: TestInstance,
  options: CommissionScenarioOptions,
): Promise<{
  adminWorkosId: string;
  adminId: Id<"users">;
  guardId: Id<"users">;
  closureId: Id<"closures">;
  configVersionId: Id<"incentive_config_versions">;
}> {
  commissionVersionCounter += 1;
  const uniqueSuffix = `${options.scenarioName}_${commissionVersionCounter}`;
  const adminWorkosId = `workos_incentive_v3_commission_admin_${uniqueSuffix}`;

  const adminId = await createAdminWithPermissions(t, {
    workosUserId: adminWorkosId,
    permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
  });
  const guardId = await createGuardUser(t, `workos_incentive_v3_commission_guard_${uniqueSuffix}`);

  const now = Date.now();

  const created = await t.run(async (ctx) => {
    const societyId = await ctx.db.insert("societies", {
      name: `Society ${uniqueSuffix}`,
      city: "Bengaluru",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: adminId,
    });

    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: `Tower ${uniqueSuffix}`,
      total_floors: 10,
      floor_labels: ["G", "1", "2"],
      status: BUILDING_STATUS.ACTIVE,
      is_deleted: false,
    });

    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "2",
      flat_number: `2${commissionVersionCounter.toString().padStart(2, "0")}`,
      owner_phone: `98${String(10_000_000 + commissionVersionCounter).padStart(8, "0")}`,
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: guardId,
      status: LEAD_STATUS.VERIFIED,
    });

    const closureId = await ctx.db.insert("closures", {
      lead_id: leadId,
      move_in_date: now + DAY_MS,
      status: CLOSURE_STATUS.CONFIRMED,
      commission_amount: options.profitPaise,
      closed_by_admin_id: adminId,
      confirmed_at: now,
    });

    const modifiers = options.modifiers ?? [];
    const configModifiers = await Promise.all(
      modifiers.map(async (modifier, index) => {
        const templateId = await ctx.db.insert("commission_modifier_templates", {
          name: `${modifier.name}-${uniqueSuffix}`,
          persona: INCENTIVE_PERSONA.ALL,
          reward_mode: modifier.reward_mode,
          rule_type: "threshold_step",
          metric_source: "unknown_metric",
          rule_config_json: JSON.stringify({}),
          link_mode: modifier.link_mode,
          link_group_id: modifier.link_group_id,
          is_active: true,
          sort_order: index,
          created_by: adminId,
          created_at: now,
        });

        return {
          id: templateId,
          template_id: templateId,
          template_name: modifier.name,
          persona: INCENTIVE_PERSONA.ALL,
          reward_mode: modifier.reward_mode,
          rule_type: "threshold_step",
          metric_key: "unknown_metric",
          link_mode: modifier.link_mode,
          link_group_id: modifier.link_group_id,
          operator: modifier.operator ?? ">=",
          threshold: modifier.threshold ?? 0,
          delta_value: modifier.delta_value,
          enabled: modifier.enabled ?? true,
          window_days: 30,
        };
      }),
    );

    const configJson =
      options.invalidConfigJson ??
      JSON.stringify({
        commission: {
          base_rate_bps: options.baseRateBps,
          min_rate_bps: options.minRateBps,
          max_rate_bps: options.maxRateBps,
          modifiers: configModifiers,
        },
      });

    const configVersionId = await ctx.db.insert("incentive_config_versions", {
      version_code: `v3.commission.${uniqueSuffix}`,
      status: CONFIG_VERSION_STATUS.ACTIVE,
      config_json: configJson,
      created_by: adminId,
      activated_by: adminId,
      activated_at: now,
      created_at: now,
      updated_at: now,
    });

    if (options.includeActorProfile !== false) {
      await ctx.db.insert("incentive_actor_profiles", {
        user_id: guardId,
        persona: INCENTIVE_PERSONA.GUARD,
        commission_base_bps: options.baseRateBps,
        commission_min_bps: options.minRateBps,
        commission_max_bps: options.maxRateBps,
        effective_from: now - DAY_MS,
        is_active: true,
        assigned_by: adminId,
        created_at: now,
      });
    }

    return { closureId, configVersionId };
  });

  return {
    adminWorkosId,
    adminId,
    guardId,
    closureId: created.closureId,
    configVersionId: created.configVersionId,
  };
}

describe("incentive v3 property tests", () => {
  beforeEach(() => {
    vi.spyOn(authKit, "getAuthUser").mockImplementation(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity) {
        return null;
      }

      return buildAuthKitUser(identity.subject);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("config version lifecycle", () => {
    it("creates draft config with DRAFT status", async () => {
      const t = convexTest(schema, modules);
      const adminWorkosId = "workos_incentive_v3_config_create_draft_admin";
      const adminId = await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
      });

      const authed = t.withIdentity({ subject: adminWorkosId, issuer: WORKOS_ISSUER });
      const createdId = (await authed.mutation(incentiveConfigRefs.createDraft, {
        version_code: "v3.0.1-test",
        config_json: JSON.stringify({
          base_rate_bps: 1500,
          min_rate_bps: 1500,
          max_rate_bps: 2200,
          modifiers: [],
        }),
        description: "test draft",
      })) as Id<"incentive_config_versions">;

      const created = (await t.run(
        async (ctx) => await ctx.db.get(createdId),
      )) as Doc<"incentive_config_versions"> | null;

      expect(created).not.toBeNull();
      expect(created?.created_by).toBe(adminId);
      expect(created?.status).toBe(CONFIG_VERSION_STATUS.DRAFT);
      expect(created?.version_code).toBe("v3.0.1-test");
    });

    it("activates draft and archives previously active version", async () => {
      const t = convexTest(schema, modules);
      const adminWorkosId = "workos_incentive_v3_config_activate_admin";
      await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
      });

      const authed = t.withIdentity({ subject: adminWorkosId, issuer: WORKOS_ISSUER });

      const v1Id = (await authed.mutation(incentiveConfigRefs.createDraft, {
        version_code: "v3.activate.1",
        config_json: JSON.stringify({
          base_rate_bps: 1500,
          min_rate_bps: 1500,
          max_rate_bps: 2200,
          modifiers: [],
        }),
      })) as Id<"incentive_config_versions">;
      const v2Id = (await authed.mutation(incentiveConfigRefs.createDraft, {
        version_code: "v3.activate.2",
        config_json: JSON.stringify({
          base_rate_bps: 1600,
          min_rate_bps: 1500,
          max_rate_bps: 2200,
          modifiers: [],
        }),
      })) as Id<"incentive_config_versions">;

      await authed.mutation(incentiveConfigRefs.activate, { id: v1Id });
      await authed.mutation(incentiveConfigRefs.activate, { id: v2Id });

      const [v1, v2, activeVersions, activeVersionPointer] = await t.run(async (ctx) => {
        const v1Doc = await ctx.db.get(v1Id);
        const v2Doc = await ctx.db.get(v2Id);
        const activeDocs = await ctx.db
          .query("incentive_config_versions")
          .withIndex("by_status", (q) => q.eq("status", CONFIG_VERSION_STATUS.ACTIVE))
          .collect();
        const pointer = await ctx.db
          .query("system_config")
          .withIndex("by_key", (q) =>
            q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ACTIVE_CONFIG_VERSION),
          )
          .first();

        return [
          v1Doc as Doc<"incentive_config_versions"> | null,
          v2Doc as Doc<"incentive_config_versions"> | null,
          activeDocs,
          pointer,
        ] as const;
      });

      expect(v1?.status).toBe(CONFIG_VERSION_STATUS.ARCHIVED);
      expect(v2?.status).toBe(CONFIG_VERSION_STATUS.ACTIVE);
      expect(activeVersions).toHaveLength(1);
      expect(activeVersions[0]?._id).toBe(v2Id);
      expect(activeVersionPointer?.value).toBe("v3.activate.2");
    });

    it("rejects updating non-DRAFT version", async () => {
      const t = convexTest(schema, modules);
      const adminWorkosId = "workos_incentive_v3_config_update_non_draft_admin";
      await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
      });

      const authed = t.withIdentity({ subject: adminWorkosId, issuer: WORKOS_ISSUER });
      const versionId = (await authed.mutation(incentiveConfigRefs.createDraft, {
        version_code: "v3.update.non.draft",
        config_json: JSON.stringify({
          base_rate_bps: 1500,
          min_rate_bps: 1500,
          max_rate_bps: 2200,
          modifiers: [],
        }),
      })) as Id<"incentive_config_versions">;
      await authed.mutation(incentiveConfigRefs.activate, { id: versionId });

      await expect(
        authed.mutation(incentiveConfigRefs.updateDraft, {
          id: versionId,
          description: "should fail",
        }),
      ).rejects.toThrow("Only DRAFT config versions can be updated");
    });

    it("rejects activating non-DRAFT version", async () => {
      const t = convexTest(schema, modules);
      const adminWorkosId = "workos_incentive_v3_config_activate_non_draft_admin";
      await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
      });

      const authed = t.withIdentity({ subject: adminWorkosId, issuer: WORKOS_ISSUER });
      const versionId = (await authed.mutation(incentiveConfigRefs.createDraft, {
        version_code: "v3.activate.non.draft",
        config_json: JSON.stringify({
          base_rate_bps: 1500,
          min_rate_bps: 1500,
          max_rate_bps: 2200,
          modifiers: [],
        }),
      })) as Id<"incentive_config_versions">;
      await authed.mutation(incentiveConfigRefs.activate, { id: versionId });

      await expect(
        authed.mutation(incentiveConfigRefs.activate, { id: versionId }),
      ).rejects.toThrow("Only DRAFT config versions can be activated");
    });

    it("rejects archiving the last active version", async () => {
      const t = convexTest(schema, modules);
      const adminWorkosId = "workos_incentive_v3_config_archive_admin";
      await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
      });

      const authed = t.withIdentity({ subject: adminWorkosId, issuer: WORKOS_ISSUER });
      const versionId = (await authed.mutation(incentiveConfigRefs.createDraft, {
        version_code: "v3.archive.active",
        config_json: JSON.stringify({
          base_rate_bps: 1500,
          min_rate_bps: 1500,
          max_rate_bps: 2200,
          modifiers: [],
        }),
      })) as Id<"incentive_config_versions">;
      await authed.mutation(incentiveConfigRefs.activate, { id: versionId });

      await expect(authed.mutation(incentiveConfigRefs.archive, { id: versionId })).rejects.toThrow(
        "Cannot archive the last active config version. Activate a replacement first.",
      );

      const stillActive = (await t.run(
        async (ctx) => await ctx.db.get(versionId),
      )) as Doc<"incentive_config_versions"> | null;
      expect(stillActive?.status).toBe(CONFIG_VERSION_STATUS.ACTIVE);
    });
  });

  describe("actor profiles", () => {
    it("assigns persona profile with expected fields", async () => {
      const t = convexTest(schema, modules);
      const adminWorkosId = "workos_incentive_v3_actor_assign_admin";
      await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
      });
      const guardUserId = await createGuardUser(t, "workos_incentive_v3_actor_assign_guard");
      const effectiveFrom = Date.now() - DAY_MS;

      const authed = t.withIdentity({ subject: adminWorkosId, issuer: WORKOS_ISSUER });
      const profileId = (await authed.mutation(incentiveActorRefs.assign, {
        user_id: guardUserId,
        persona: INCENTIVE_PERSONA.GUARD,
        commission_base_bps: 1500,
        commission_min_bps: 1300,
        commission_max_bps: 2200,
        effective_from: effectiveFrom,
      })) as Id<"incentive_actor_profiles">;

      const profile = (await t.run(
        async (ctx) => await ctx.db.get(profileId),
      )) as Doc<"incentive_actor_profiles"> | null;

      expect(profile).not.toBeNull();
      expect(profile?.user_id).toBe(guardUserId);
      expect(profile?.persona).toBe(INCENTIVE_PERSONA.GUARD);
      expect(profile?.commission_base_bps).toBe(1500);
      expect(profile?.is_active).toBe(true);
    });

    it("returns active profile inside effective date window", async () => {
      const t = convexTest(schema, modules);
      const adminWorkosId = "workos_incentive_v3_actor_window_admin";
      await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
      });
      const guardUserId = await createGuardUser(t, "workos_incentive_v3_actor_window_guard");
      const now = Date.now();

      const authed = t.withIdentity({ subject: adminWorkosId, issuer: WORKOS_ISSUER });

      await authed.mutation(incentiveActorRefs.assign, {
        user_id: guardUserId,
        persona: INCENTIVE_PERSONA.GUARD,
        commission_base_bps: 1200,
        effective_from: now - 10 * DAY_MS,
        effective_to: now - DAY_MS,
      });

      await authed.mutation(incentiveActorRefs.assign, {
        user_id: guardUserId,
        persona: INCENTIVE_PERSONA.GUARD,
        commission_base_bps: 1600,
        effective_from: now - DAY_MS,
        effective_to: now + DAY_MS,
      });

      await authed.mutation(incentiveActorRefs.assign, {
        user_id: guardUserId,
        persona: INCENTIVE_PERSONA.GUARD,
        commission_base_bps: 2000,
        effective_from: now + DAY_MS,
      });

      const activeProfile = await authed.query(incentiveActorRefs.getActiveProfile, {
        user_id: guardUserId,
        persona: INCENTIVE_PERSONA.GUARD,
      });

      expect(activeProfile).not.toBeNull();
      expect(activeProfile?.commission_base_bps).toBe(1600);
    });

    it("deactivates profile by toggling is_active false", async () => {
      const t = convexTest(schema, modules);
      const adminWorkosId = "workos_incentive_v3_actor_deactivate_admin";
      await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions: [PERMISSIONS.COMMISSION_CONFIGURE, PERMISSIONS.COMMISSION_VIEW],
      });
      const guardUserId = await createGuardUser(t, "workos_incentive_v3_actor_deactivate_guard");

      const authed = t.withIdentity({ subject: adminWorkosId, issuer: WORKOS_ISSUER });
      const profileId = (await authed.mutation(incentiveActorRefs.assign, {
        user_id: guardUserId,
        persona: INCENTIVE_PERSONA.GUARD,
        effective_from: Date.now() - DAY_MS,
      })) as Id<"incentive_actor_profiles">;

      await authed.mutation(incentiveActorRefs.deactivate, { id: profileId });

      const profile = (await t.run(
        async (ctx) => await ctx.db.get(profileId),
      )) as Doc<"incentive_actor_profiles"> | null;
      expect(profile?.is_active).toBe(false);
    });
  });

  describe("core engine edge cases", () => {
    it("uses base rate when modifier list is empty", () => {
      const effectiveRate = evaluateEffectiveRateBps(1500, 1500, 2200, []);
      expect(effectiveRate).toBe(1500);
    });

    it("falls back to base rate when all modifiers are disabled", () => {
      const effectiveRate = evaluateEffectiveRateBps(1700, 1500, 2200, [
        { enabled: false, bps_delta: 100 },
        { enabled: false, bps_delta: -50 },
      ]);

      expect(effectiveRate).toBe(1700);
    });

    it("handles zero or negative profit with max(0, flat_bonus_only)", () => {
      const effectiveRate = evaluateEffectiveRateBps(1500, 1500, 2200, []);

      const zeroProfitPool = computePoolPaise(0, effectiveRate, 12_500);
      expect(zeroProfitPool).toBe(12_500);

      const negativeProfitPool = computePoolPaise(-100_000, effectiveRate, 5_000);
      expect(negativeProfitPool).toBe(0);
    });

    it("allocates full pool to a single contributor", () => {
      const allocation = splitPoolEvenly(99_999, ["guard_1"]);

      expect(allocation).toHaveLength(1);
      expect(allocation[0]?.amount_paise).toBe(99_999);
    });

    it("is deterministic and rounding-safe across randomized valid inputs", () => {
      const rng = createDeterministicRng(32_010_113);

      for (let index = 0; index < 150; index += 1) {
        const baseRateBps = randomInt(rng, 1000, 2200);
        const minRateBps = randomInt(rng, 900, baseRateBps);
        const maxRateBps = randomInt(rng, baseRateBps, 2600);
        const modifierCount = randomInt(rng, 0, 4);
        const modifiers: CommissionModifier[] = Array.from({ length: modifierCount }, () => ({
          enabled: rng() >= 0.5,
          bps_delta: randomInt(rng, -150, 250),
        }));

        const profitPaise = randomInt(rng, -200_000, 2_000_000);
        const flatBonusPaise = randomInt(rng, 0, 50_000);
        const contributors = Array.from(
          { length: randomInt(rng, 1, 7) },
          (_, contributorIndex) => `actor_${contributorIndex + 1}`,
        );

        const evaluateScenario = () => {
          const effectiveRateBps = evaluateEffectiveRateBps(
            baseRateBps,
            minRateBps,
            maxRateBps,
            modifiers,
          );
          const poolPaise = computePoolPaise(profitPaise, effectiveRateBps, flatBonusPaise);
          const shares = splitPoolEvenly(poolPaise, contributors);

          return {
            effective_rate_bps: effectiveRateBps,
            pool_paise: poolPaise,
            shares,
          };
        };

        const first = evaluateScenario();
        const second = evaluateScenario();

        expect(second).toEqual(first);
        expect(first.effective_rate_bps).toBeGreaterThanOrEqual(minRateBps);
        expect(first.effective_rate_bps).toBeLessThanOrEqual(maxRateBps);

        const allocated = first.shares.reduce((sum, share) => sum + share.amount_paise, 0);
        expect(allocated).toBe(first.pool_paise);

        if (contributors.length === 1) {
          expect(first.shares[0]?.amount_paise).toBe(first.pool_paise);
          continue;
        }

        const amounts = first.shares.map((share) => share.amount_paise);
        const maxShare = Math.max(...amounts);
        const minShare = Math.min(...amounts);
        expect(maxShare - minShare).toBeLessThanOrEqual(1);
      }
    });

    it("seed init remains idempotent for v3 baseline records", async () => {
      const t = convexTest(schema, modules);

      await t.mutation(internal.seed.init, {});
      await t.mutation(internal.seed.init, {});

      const [v3Configs, rolloutPointers] = await t.run(async (ctx) => {
        const versions = await ctx.db
          .query("incentive_config_versions")
          .withIndex("by_version", (q) => q.eq("version_code", "v3.0.0"))
          .collect();

        const pointers = await ctx.db
          .query("system_config")
          .withIndex("by_key", (q) =>
            q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ACTIVE_CONFIG_VERSION),
          )
          .collect();

        return [versions, pointers] as const;
      });

      expect(v3Configs).toHaveLength(1);
      expect(rolloutPointers).toHaveLength(1);
    });
  });

  describe("commission engine property coverage", () => {
    it("rounds using floor(profit * rate / 10000) and keeps non-negative integer pool", async () => {
      const t = convexTest(schema, modules);
      const profits = [1, 100, 999_999, 250_000_000];
      const rates = [1500, 1750, 2200];

      for (const profit of profits) {
        for (const rate of rates) {
          const scenario = await createCommissionScenario(t, {
            scenarioName: `rounding_${profit}_${rate}`,
            profitPaise: profit,
            baseRateBps: rate,
            minRateBps: rate,
            maxRateBps: rate,
          });
          const authed = t.withIdentity({ subject: scenario.adminWorkosId, issuer: WORKOS_ISSUER });

          const result = await authed.query(commissionEngineRefs.simulateEvaluation, {
            closure_id: scenario.closureId,
            config_version_id: scenario.configVersionId,
          });
          const expectedPool = Math.max(0, Math.floor((profit * rate) / 10_000));

          expect(result.v3_pool_paise).toBe(expectedPool);
          expect(Number.isInteger(result.v3_pool_paise)).toBe(true);
          expect(result.v3_pool_paise).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("applies AND_GROUP deltas only when all linked modifiers pass", async () => {
      const t = convexTest(schema, modules);
      const allPass = await createCommissionScenario(t, {
        scenarioName: "and_group_all_pass",
        profitPaise: 100_000,
        baseRateBps: 1500,
        minRateBps: 1200,
        maxRateBps: 2200,
        modifiers: [
          {
            name: "and-pass-1",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.AND_GROUP,
            link_group_id: "g1",
            operator: ">=",
            threshold: 0,
            delta_value: 80,
          },
          {
            name: "and-pass-2",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.AND_GROUP,
            link_group_id: "g1",
            operator: ">=",
            threshold: 0,
            delta_value: 20,
          },
        ],
      });

      const andFail = await createCommissionScenario(t, {
        scenarioName: "and_group_one_fail",
        profitPaise: 100_000,
        baseRateBps: 1500,
        minRateBps: 1200,
        maxRateBps: 2200,
        modifiers: [
          {
            name: "and-fail-1",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.AND_GROUP,
            link_group_id: "g2",
            operator: ">=",
            threshold: 0,
            delta_value: 80,
          },
          {
            name: "and-fail-2",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.AND_GROUP,
            link_group_id: "g2",
            operator: ">",
            threshold: 0,
            delta_value: 20,
          },
        ],
      });

      const authedPass = t.withIdentity({ subject: allPass.adminWorkosId, issuer: WORKOS_ISSUER });
      const authedFail = t.withIdentity({ subject: andFail.adminWorkosId, issuer: WORKOS_ISSUER });

      const passResult = await authedPass.query(commissionEngineRefs.simulateEvaluation, {
        closure_id: allPass.closureId,
        config_version_id: allPass.configVersionId,
      });
      const failResult = await authedFail.query(commissionEngineRefs.simulateEvaluation, {
        closure_id: andFail.closureId,
        config_version_id: andFail.configVersionId,
      });

      expect(passResult.v3_effective_rate_bps).toBe(1600);
      expect(
        passResult.modifier_breakdown.every((modifier: { passed: boolean }) => modifier.passed),
      ).toBe(true);

      expect(failResult.v3_effective_rate_bps).toBe(1500);
      expect(
        failResult.modifier_breakdown.every(
          (modifier: { passed: boolean }) => modifier.passed === false,
        ),
      ).toBe(true);
    });

    it("applies OR_GROUP and INDIVIDUAL modifiers independently with mixed BPS and FLAT", async () => {
      const t = convexTest(schema, modules);
      const scenario = await createCommissionScenario(t, {
        scenarioName: "or_individual_mixed",
        profitPaise: 100_000,
        baseRateBps: 1500,
        minRateBps: 1200,
        maxRateBps: 2200,
        modifiers: [
          {
            name: "or-pass",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.OR_GROUP,
            link_group_id: "g3",
            operator: ">=",
            threshold: 0,
            delta_value: 60,
          },
          {
            name: "or-fail",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.OR_GROUP,
            link_group_id: "g3",
            operator: ">",
            threshold: 0,
            delta_value: 30,
          },
          {
            name: "individual-flat",
            reward_mode: MODIFIER_REWARD_MODE.FLAT_PAISE,
            link_mode: MODIFIER_LINK_MODE.INDIVIDUAL,
            operator: ">=",
            threshold: 0,
            delta_value: 5_000,
          },
        ],
      });

      const authed = t.withIdentity({ subject: scenario.adminWorkosId, issuer: WORKOS_ISSUER });
      const result = await authed.query(commissionEngineRefs.simulateEvaluation, {
        closure_id: scenario.closureId,
        config_version_id: scenario.configVersionId,
      });

      expect(result.v3_effective_rate_bps).toBe(1560);
      expect(result.v3_pool_paise).toBe(Math.floor((100_000 * 1560) / 10_000) + 5_000);
      expect(
        result.modifier_breakdown.filter((modifier: { passed: boolean }) => modifier.passed),
      ).toHaveLength(2);
    });

    it("handles zero profit, disabled modifiers, and missing actor profile safely", async () => {
      const t = convexTest(schema, modules);

      const zeroProfit = await createCommissionScenario(t, {
        scenarioName: "zero_profit_flat_bonus",
        profitPaise: 0,
        baseRateBps: 1500,
        minRateBps: 1500,
        maxRateBps: 2200,
        modifiers: [
          {
            name: "flat-bonus",
            reward_mode: MODIFIER_REWARD_MODE.FLAT_PAISE,
            link_mode: MODIFIER_LINK_MODE.INDIVIDUAL,
            operator: ">=",
            threshold: 0,
            delta_value: 7_000,
          },
        ],
      });
      const disabledModifiers = await createCommissionScenario(t, {
        scenarioName: "all_modifiers_disabled",
        profitPaise: 90_000,
        baseRateBps: 1650,
        minRateBps: 1500,
        maxRateBps: 2200,
        modifiers: [
          {
            name: "disabled-bps",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.INDIVIDUAL,
            delta_value: 300,
            enabled: false,
          },
        ],
      });
      const noActorProfile = await createCommissionScenario(t, {
        scenarioName: "no_actor_profile",
        profitPaise: 75_000,
        baseRateBps: 1500,
        minRateBps: 1500,
        maxRateBps: 2200,
        includeActorProfile: false,
      });

      const zeroAuthed = t.withIdentity({
        subject: zeroProfit.adminWorkosId,
        issuer: WORKOS_ISSUER,
      });
      const disabledAuthed = t.withIdentity({
        subject: disabledModifiers.adminWorkosId,
        issuer: WORKOS_ISSUER,
      });
      const noProfileAuthed = t.withIdentity({
        subject: noActorProfile.adminWorkosId,
        issuer: WORKOS_ISSUER,
      });

      const zeroResult = await zeroAuthed.query(commissionEngineRefs.simulateEvaluation, {
        closure_id: zeroProfit.closureId,
        config_version_id: zeroProfit.configVersionId,
      });
      const disabledResult = await disabledAuthed.query(commissionEngineRefs.simulateEvaluation, {
        closure_id: disabledModifiers.closureId,
        config_version_id: disabledModifiers.configVersionId,
      });
      const noProfileResult = await noProfileAuthed.query(commissionEngineRefs.simulateEvaluation, {
        closure_id: noActorProfile.closureId,
        config_version_id: noActorProfile.configVersionId,
      });

      expect(zeroResult.v3_pool_paise).toBe(7_000);
      expect(disabledResult.v3_effective_rate_bps).toBe(1650);
      expect(noProfileResult.persona).toBe(INCENTIVE_PERSONA.GUARD);
      expect(noProfileResult.v3_pool_paise).toBeGreaterThanOrEqual(0);
    });

    it("returns clear error for invalid config_json", async () => {
      const t = convexTest(schema, modules);
      const scenario = await createCommissionScenario(t, {
        scenarioName: "invalid_config_json",
        profitPaise: 80_000,
        baseRateBps: 1500,
        minRateBps: 1500,
        maxRateBps: 2200,
        invalidConfigJson: "",
      });
      const authed = t.withIdentity({ subject: scenario.adminWorkosId, issuer: WORKOS_ISSUER });

      await expect(
        authed.mutation(commissionEngineRefs.evaluate, {
          closure_id: scenario.closureId,
          config_version_id: scenario.configVersionId,
        }),
      ).rejects.toThrow("Invalid commission config JSON");
    });

    it("clamps effective rate at configured min and max bounds", async () => {
      const t = convexTest(schema, modules);
      const maxClamp = await createCommissionScenario(t, {
        scenarioName: "max_clamp",
        profitPaise: 100_000,
        baseRateBps: COMMISSION_BOUNDS.DEFAULT_BASE_BPS,
        minRateBps: COMMISSION_BOUNDS.DEFAULT_MIN_BPS,
        maxRateBps: 1600,
        modifiers: [
          {
            name: "push-up",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.INDIVIDUAL,
            delta_value: 500,
            operator: ">=",
            threshold: 0,
          },
        ],
      });

      const minClamp = await createCommissionScenario(t, {
        scenarioName: "min_clamp",
        profitPaise: 100_000,
        baseRateBps: COMMISSION_BOUNDS.DEFAULT_BASE_BPS,
        minRateBps: 1400,
        maxRateBps: COMMISSION_BOUNDS.DEFAULT_MAX_BPS,
        modifiers: [
          {
            name: "push-down",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.INDIVIDUAL,
            delta_value: -500,
            operator: ">=",
            threshold: 0,
          },
        ],
      });

      const maxAuthed = t.withIdentity({ subject: maxClamp.adminWorkosId, issuer: WORKOS_ISSUER });
      const minAuthed = t.withIdentity({ subject: minClamp.adminWorkosId, issuer: WORKOS_ISSUER });

      const maxResult = await maxAuthed.query(commissionEngineRefs.simulateEvaluation, {
        closure_id: maxClamp.closureId,
        config_version_id: maxClamp.configVersionId,
      });
      const minResult = await minAuthed.query(commissionEngineRefs.simulateEvaluation, {
        closure_id: minClamp.closureId,
        config_version_id: minClamp.configVersionId,
      });

      expect(maxResult.v3_effective_rate_bps).toBe(1600);
      expect(minResult.v3_effective_rate_bps).toBe(1400);
    });

    it("remains idempotent in value and creates distinct evaluation records on retry", async () => {
      const t = convexTest(schema, modules);
      const scenario = await createCommissionScenario(t, {
        scenarioName: "evaluate_idempotency",
        profitPaise: 120_000,
        baseRateBps: 1500,
        minRateBps: 1500,
        maxRateBps: 2200,
        modifiers: [
          {
            name: "idempotent-bps",
            reward_mode: MODIFIER_REWARD_MODE.BPS,
            link_mode: MODIFIER_LINK_MODE.INDIVIDUAL,
            delta_value: 100,
            operator: ">=",
            threshold: 0,
          },
        ],
      });
      const authed = t.withIdentity({ subject: scenario.adminWorkosId, issuer: WORKOS_ISSUER });

      const first = await authed.mutation(commissionEngineRefs.evaluate, {
        closure_id: scenario.closureId,
        config_version_id: scenario.configVersionId,
      });
      const second = await authed.mutation(commissionEngineRefs.evaluate, {
        closure_id: scenario.closureId,
        config_version_id: scenario.configVersionId,
      });

      expect(first._id).not.toBe(second._id);
      expect(first.effective_rate_bps).toBe(second.effective_rate_bps);
      expect(first.incentive_pool_paise).toBe(second.incentive_pool_paise);

      const records = await t.run(async (ctx) => {
        return await ctx.db
          .query("deal_commission_evaluations")
          .withIndex("by_closure", (q) => q.eq("closure_id", scenario.closureId))
          .collect();
      });

      expect(records).toHaveLength(2);
      expect(records[0]?.incentive_pool_paise).toBe(records[1]?.incentive_pool_paise);
    });
  });

  describe("P32-E03: Attribution & Disbursement", () => {
    describe("Largest-Remainder Rounding Property", () => {
      it("preserves pool sum across representative pools and actor counts", () => {
        const pools = [1, 100, 999, 10_000, 204_000, 1_234_567];
        const actorCounts = [1, 2, 3, 5, 10];

        for (const pool of pools) {
          for (const actorCount of actorCounts) {
            const rng = createDeterministicRng(pool + actorCount * 17);
            const weights = Array.from({ length: actorCount }, () => randomInt(rng, 1, 200));
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
            const shares = weights.map((weight, index) => ({
              id: `actor_${index + 1}`,
              exact: (pool * weight) / totalWeight,
            }));

            const rounded = largestRemainderRound(shares, pool);
            const totalRounded = rounded.reduce((sum, share) => sum + share.amount, 0);

            expect(rounded).toHaveLength(actorCount);
            expect(totalRounded).toBe(pool);
            expect(rounded.every((share) => Number.isInteger(share.amount))).toBe(true);
            expect(rounded.every((share) => share.amount >= 0)).toBe(true);
          }
        }
      });

      it("allocates pool=1 across three actors with one winner and two zeroes", () => {
        const rounded = largestRemainderRound(
          [
            { id: "actor_1", exact: 1 / 3 },
            { id: "actor_2", exact: 1 / 3 },
            { id: "actor_3", exact: 1 / 3 },
          ],
          1,
        );

        const ones = rounded.filter((share) => share.amount === 1);
        const zeroes = rounded.filter((share) => share.amount === 0);

        expect(ones).toHaveLength(1);
        expect(zeroes).toHaveLength(2);
      });

      it("returns all zero amounts when pool=0", () => {
        const rounded = largestRemainderRound(
          [
            { id: "actor_1", exact: 0.2 },
            { id: "actor_2", exact: 0.5 },
            { id: "actor_3", exact: 0.3 },
          ],
          0,
        );

        expect(rounded.map((share) => share.amount)).toEqual([0, 0, 0]);
      });

      it("breaks equal-residue ties by actor id ascending", () => {
        const rounded = largestRemainderRound(
          [
            { id: "z_actor", exact: 0.5 },
            { id: "a_actor", exact: 0.5 },
          ],
          1,
        );

        const byId = new Map(rounded.map((share) => [share.id, share.amount] as const));
        expect(byId.get("a_actor")).toBe(1);
        expect(byId.get("z_actor")).toBe(0);
      });
    });

    describe("Stage Weight Distribution", () => {
      it("keeps bucket floor sum within pool for default stage weights", () => {
        const poolPaise = 1_234_567;
        const defaults = getDefaultStageWeightsBpsForTests();
        const buckets = computeStageBucketFloorsForTests(
          poolPaise,
          defaults,
          new Set<AttributionStage>(ATTRIBUTION_STAGE_ORDER),
        );

        expect(buckets).not.toBeNull();
        if (!buckets) {
          return;
        }

        const floorSum = Object.values(buckets.floors).reduce((sum, amount) => sum + amount, 0);
        const weightSum = Object.values(buckets.weights).reduce((sum, weight) => sum + weight, 0);

        expect(floorSum).toBeLessThanOrEqual(poolPaise);
        expect(weightSum).toBeCloseTo(10_000, 8);
      });

      it("redistributes empty SUPPORT stage proportionally and keeps total at 10000 bps", () => {
        const defaults = getDefaultStageWeightsBpsForTests();
        const nonEmpty = new Set<AttributionStage>([
          CONTRIBUTION_STAGE.DISCOVERY,
          CONTRIBUTION_STAGE.VERIFICATION,
          CONTRIBUTION_STAGE.CLOSURE,
        ]);
        const buckets = computeStageBucketFloorsForTests(204_000, defaults, nonEmpty);

        expect(buckets).not.toBeNull();
        if (!buckets) {
          return;
        }

        const redistributed = buckets.weights;
        const denominator =
          defaults[CONTRIBUTION_STAGE.DISCOVERY] +
          defaults[CONTRIBUTION_STAGE.VERIFICATION] +
          defaults[CONTRIBUTION_STAGE.CLOSURE];

        expect(redistributed[CONTRIBUTION_STAGE.SUPPORT]).toBe(0);
        expect(Object.values(redistributed).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(
          10_000,
          8,
        );
        expect(redistributed[CONTRIBUTION_STAGE.DISCOVERY]).toBeCloseTo(
          (defaults[CONTRIBUTION_STAGE.DISCOVERY] * 10_000) / denominator,
          8,
        );
        expect(redistributed[CONTRIBUTION_STAGE.VERIFICATION]).toBeCloseTo(
          (defaults[CONTRIBUTION_STAGE.VERIFICATION] * 10_000) / denominator,
          8,
        );
        expect(redistributed[CONTRIBUTION_STAGE.CLOSURE]).toBeCloseTo(
          (defaults[CONTRIBUTION_STAGE.CLOSURE] * 10_000) / denominator,
          8,
        );
      });

      it("returns null when all stages are empty", () => {
        const defaults = getDefaultStageWeightsBpsForTests();
        const buckets = computeStageBucketFloorsForTests(
          10_000,
          defaults,
          new Set<AttributionStage>(),
        );

        expect(buckets).toBeNull();
      });
    });

    describe("Quality Threshold", () => {
      it("ignores contributions below quality threshold", () => {
        expect(getEligibleContributionWeightForTests(29, 3)).toBe(0);
      });

      it("includes contributions at quality=30", () => {
        expect(getEligibleContributionWeightForTests(30, 3)).toBe(90);
      });

      it("defaults null quality to 50", () => {
        expect(getEligibleContributionWeightForTests(null, 2)).toBe(100);
      });
    });

    describe("Disbursement Status Transitions", () => {
      it("accepts valid status transitions", () => {
        expect(
          isValidDisbursementTransitionForTests(
            DISBURSEMENT_STATUS.PENDING,
            DISBURSEMENT_STATUS.APPROVED,
          ),
        ).toBe(true);
        expect(
          isValidDisbursementTransitionForTests(
            DISBURSEMENT_STATUS.APPROVED,
            DISBURSEMENT_STATUS.DISBURSED,
          ),
        ).toBe(true);
        expect(
          isValidDisbursementTransitionForTests(
            DISBURSEMENT_STATUS.PENDING,
            DISBURSEMENT_STATUS.VOIDED,
          ),
        ).toBe(true);
        expect(
          isValidDisbursementTransitionForTests(
            DISBURSEMENT_STATUS.APPROVED,
            DISBURSEMENT_STATUS.VOIDED,
          ),
        ).toBe(true);
      });

      it("rejects transitions from DISBURSED and VOIDED to any status", () => {
        const allStatuses: DisbursementStatus[] = [
          DISBURSEMENT_STATUS.PENDING,
          DISBURSEMENT_STATUS.APPROVED,
          DISBURSEMENT_STATUS.DISBURSED,
          DISBURSEMENT_STATUS.FAILED,
          DISBURSEMENT_STATUS.VOIDED,
        ];

        for (const status of allStatuses) {
          expect(isValidDisbursementTransitionForTests(DISBURSEMENT_STATUS.DISBURSED, status)).toBe(
            false,
          );
          expect(isValidDisbursementTransitionForTests(DISBURSEMENT_STATUS.VOIDED, status)).toBe(
            false,
          );
        }
      });
    });
  });

  describe("Gamification Engine", () => {
    describe("xpToNextLevel", () => {
      it("returns known values for key levels", () => {
        expect(xpToNextLevel(1)).toBe(100);
        expect(xpToNextLevel(2)).toBe(282);
        expect(xpToNextLevel(3)).toBe(519);
        expect(xpToNextLevel(5)).toBe(1118);
        expect(xpToNextLevel(10)).toBe(3162);
        expect(xpToNextLevel(20)).toBe(8944);
        expect(xpToNextLevel(50)).toBe(35355);
        expect(xpToNextLevel(100)).toBe(100000);
      });

      it("is monotonic from level 1 through level 50", () => {
        for (let level = 1; level < 50; level += 1) {
          expect(xpToNextLevel(level + 1)).toBeGreaterThanOrEqual(xpToNextLevel(level));
        }
      });

      it("always returns a positive integer for valid levels", () => {
        for (let level = 1; level <= 100; level += 1) {
          const xpRequired = xpToNextLevel(level);
          expect(Number.isInteger(xpRequired)).toBe(true);
          expect(xpRequired).toBeGreaterThan(0);
        }
      });

      it("falls back to level 1 curve for non-positive levels", () => {
        expect(xpToNextLevel(0)).toBe(xpToNextLevel(1));
        expect(xpToNextLevel(-5)).toBe(xpToNextLevel(1));
      });
    });

    describe("getLevelFromTotalXp", () => {
      it("returns level 1 with zero progress for zero XP", () => {
        expect(getLevelFromTotalXp(0)).toEqual({
          level: 1,
          xpInCurrentLevel: 0,
          xpToNext: 100,
          progressPercent: 0,
        });
      });

      it("lands exactly on level boundaries with zero carry XP", () => {
        let totalXp = 0;

        for (let level = 1; level <= 12; level += 1) {
          totalXp += xpToNextLevel(level);
          const state = getLevelFromTotalXp(totalXp);

          expect(state.level).toBe(level + 1);
          expect(state.xpInCurrentLevel).toBe(0);
          expect(state.progressPercent).toBe(0);
        }
      });

      it("handles multi-level jumps with consistent state", () => {
        const totalXp = 10_000;
        const state = getLevelFromTotalXp(totalXp);

        let spent = 0;
        for (let level = 1; level < state.level; level += 1) {
          spent += xpToNextLevel(level);
        }

        expect(state.level).toBeGreaterThan(1);
        expect(spent).toBeLessThanOrEqual(totalXp);
        expect(spent + xpToNextLevel(state.level)).toBeGreaterThan(totalXp);
        expect(state.xpInCurrentLevel).toBe(totalXp - spent);
      });

      it("keeps progress percentage in [0, 100]", () => {
        for (let totalXp = 0; totalXp <= 25_000; totalXp += 113) {
          const state = getLevelFromTotalXp(totalXp);
          expect(state.progressPercent).toBeGreaterThanOrEqual(0);
          expect(state.progressPercent).toBeLessThanOrEqual(100);
        }
      });

      it("is consistent around first level round-trip boundaries", () => {
        expect(getLevelFromTotalXp(0).level).toBe(1);
        expect(xpToNextLevel(1)).toBe(100);

        const beforeLevelUp = getLevelFromTotalXp(99);
        expect(beforeLevelUp.level).toBe(1);
        expect(beforeLevelUp.progressPercent).toBe(99);

        const onLevelUp = getLevelFromTotalXp(100);
        expect(onLevelUp.level).toBe(2);
        expect(onLevelUp.xpInCurrentLevel).toBe(0);
      });

      it("clamps negative XP safely to level 1", () => {
        const state = getLevelFromTotalXp(-5);

        expect(state.level).toBe(1);
        expect(state.xpInCurrentLevel).toBe(0);
        expect(state.progressPercent).toBe(0);
      });

      it("computes very large XP quickly without infinite loops", () => {
        const startedAt = Date.now();
        const state = getLevelFromTotalXp(1_000_000);
        const elapsedMs = Date.now() - startedAt;

        expect(state.level).toBeGreaterThan(1);
        expect(elapsedMs).toBeLessThan(1_000);
      });
    });

    describe("weekly tier mapping", () => {
      it("maps exact threshold values to expected tiers", () => {
        expect(computeTierFromXp(0)).toBe("BRONZE");
        expect(computeTierFromXp(200)).toBe("SILVER");
        expect(computeTierFromXp(500)).toBe("GOLD");
        expect(computeTierFromXp(1000)).toBe("PLATINUM");
        expect(computeTierFromXp(2000)).toBe("PLATINUM");
      });

      it("maps boundary values just below and at tier cutoffs", () => {
        expect(computeTierFromXp(199)).toBe("BRONZE");
        expect(computeTierFromXp(200)).toBe("SILVER");
        expect(computeTierFromXp(999)).toBe("GOLD");
        expect(computeTierFromXp(1000)).toBe("PLATINUM");
      });
    });

    describe("badge and reward invariants", () => {
      it("deduplicates duplicate badges using set semantics", () => {
        const merged = Array.from(
          new Set([
            BADGE_CODE_V3.WEEK_WARRIOR,
            BADGE_CODE_V3.WEEK_WARRIOR,
            BADGE_CODE_V3.EXPERIENCED,
            BADGE_CODE_V3.WEEK_WARRIOR,
          ]),
        );

        expect(merged).toEqual([BADGE_CODE_V3.WEEK_WARRIOR, BADGE_CODE_V3.EXPERIENCED]);
      });

      it("keeps configured XP awards and streak XP as non-negative integers", () => {
        for (const xp of Object.values(XP_AWARDS)) {
          expect(Number.isInteger(xp)).toBe(true);
          expect(xp).toBeGreaterThanOrEqual(0);
        }

        for (const milestone of Object.values(STREAK_MILESTONES)) {
          expect(Number.isInteger(milestone.xp)).toBe(true);
          expect(milestone.xp).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  describe("P32-E05: Shadow Rollout & Migration", () => {
    const SHADOW_MODE_VIEW_PERMISSION = "shadow_mode.view";
    const SHADOW_MODE_MANAGE_PERMISSION = "shadow_mode.manage";
    const DEFAULT_ROLLOUT_NOTES = "v2 remains payout source of truth";

    function buildDeltaSummary(v2TotalPaise: number, v3TotalPaise: number) {
      const absoluteDeltaPaise = v3TotalPaise - v2TotalPaise;
      return {
        v2_total_paise: v2TotalPaise,
        v3_total_paise: v3TotalPaise,
        absolute_delta_paise: absoluteDeltaPaise,
        percentage_delta:
          v2TotalPaise === 0 ? null : ((v3TotalPaise - v2TotalPaise) / v2TotalPaise) * 100,
      };
    }

    async function createShadowAdmin(
      t: TestInstance,
      suffix: string,
      permissions: string[],
    ): Promise<{
      adminId: Id<"users">;
      adminWorkosId: string;
      authed: ReturnType<TestInstance["withIdentity"]>;
    }> {
      const adminWorkosId = `workos_incentive_v3_shadow_admin_${suffix}`;
      const adminId = await createAdminWithPermissions(t, {
        workosUserId: adminWorkosId,
        permissions,
      });

      return {
        adminId,
        adminWorkosId,
        authed: t.withIdentity({
          subject: adminWorkosId,
          issuer: WORKOS_ISSUER,
        }),
      };
    }

    async function createShadowClosure(
      t: TestInstance,
      scenarioName: string,
    ): Promise<{ closureId: Id<"closures">; adminId: Id<"users">; guardId: Id<"users"> }> {
      const scenario = await createCommissionScenario(t, {
        scenarioName,
        profitPaise: 180_000,
        baseRateBps: 1500,
        minRateBps: 1200,
        maxRateBps: 2200,
      });

      return {
        closureId: scenario.closureId,
        adminId: scenario.adminId,
        guardId: scenario.guardId,
      };
    }

    async function setRolloutPolicy(
      t: TestInstance,
      adminId: Id<"users">,
      policy: {
        mode: "OFF" | "SHADOW" | "PARTIAL" | "FULL";
        enabled_personas: string[];
        notes?: string;
      },
    ): Promise<void> {
      await upsertSystemConfigValueForTests(t, {
        key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
        value: JSON.stringify({
          mode: policy.mode,
          enabled_personas: policy.enabled_personas,
          notes: policy.notes ?? DEFAULT_ROLLOUT_NOTES,
        }),
        updatedByAdminId: adminId,
      });
    }

    async function setFeatureFlags(
      t: TestInstance,
      adminId: Id<"users">,
      featureFlagsJson: string,
    ): Promise<void> {
      await upsertSystemConfigValueForTests(t, {
        key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS,
        value: featureFlagsJson,
        updatedByAdminId: adminId,
      });
    }

    async function insertCommissionDelta(
      t: TestInstance,
      args: {
        closureId: Id<"closures">;
        summary: {
          v2_total_paise: number;
          v3_total_paise: number;
          absolute_delta_paise: number;
          percentage_delta: number | null;
        };
        createdAt: number;
      },
    ): Promise<void> {
      await t.mutation(shadowModeRefs.internalInsertDelta, {
        deal_id: args.closureId,
        entity_type: "commission",
        persona: INCENTIVE_PERSONA.GUARD,
        config_version_id: undefined,
        v2_result_json: JSON.stringify({ total_paise: args.summary.v2_total_paise }),
        v3_result_json: JSON.stringify({ total_paise: args.summary.v3_total_paise }),
        delta_summary: JSON.stringify(args.summary),
        created_at: args.createdAt,
      });
    }

    describe("A. Delta Recording", () => {
      it("records delta_summary JSON with expected structure", async () => {
        const t = convexTest(schema, modules);
        const { closureId } = await createShadowClosure(t, "delta_schema");
        const summary = buildDeltaSummary(120_000, 131_250);

        await insertCommissionDelta(t, {
          closureId,
          summary,
          createdAt: Date.UTC(2026, 0, 10),
        });

        const stored = await t.query(shadowModeRefs.internalGetDeltaByClosureId, {
          closure_id: closureId,
          entity_type: "commission",
        });

        expect(stored).not.toBeNull();
        if (!stored) {
          return;
        }

        const parsed = JSON.parse(stored.delta_summary) as Record<string, unknown>;
        expect(parsed).toMatchObject(summary);
        expect(Object.keys(parsed).sort()).toEqual(
          ["v2_total_paise", "v3_total_paise", "absolute_delta_paise", "percentage_delta"].sort(),
        );
      });

      it("computes paise-level deltas exactly without floating-point drift", () => {
        const v2TotalPaise = 99_999;
        const v3TotalPaise = 100_001;
        const summary = buildDeltaSummary(v2TotalPaise, v3TotalPaise);

        expect(summary.absolute_delta_paise).toBe(2);
        expect(Number.isInteger(summary.absolute_delta_paise)).toBe(true);
        expect(summary.percentage_delta).toBeCloseTo((2 / 99_999) * 100, 12);
      });

      it("sets percentage_delta to null when v2_total_paise is zero", () => {
        const summary = buildDeltaSummary(0, 7_500);

        expect(summary.v2_total_paise).toBe(0);
        expect(summary.absolute_delta_paise).toBe(7_500);
        expect(summary.percentage_delta).toBeNull();
      });

      it("parses only valid delta_summary entries via aggregate variance query", async () => {
        const t = convexTest(schema, modules);
        const { closureId } = await createShadowClosure(t, "delta_parse_validity");
        const { authed } = await createShadowAdmin(t, "delta_parse_validity", [
          SHADOW_MODE_VIEW_PERMISSION,
        ]);

        await insertCommissionDelta(t, {
          closureId,
          summary: buildDeltaSummary(100_000, 104_000),
          createdAt: Date.UTC(2026, 0, 11),
        });

        await t.mutation(shadowModeRefs.internalInsertDelta, {
          deal_id: closureId,
          entity_type: "commission",
          persona: INCENTIVE_PERSONA.GUARD,
          config_version_id: undefined,
          v2_result_json: JSON.stringify({ total_paise: 100_000 }),
          v3_result_json: JSON.stringify({ total_paise: 101_000 }),
          delta_summary: "{invalid-json",
          created_at: Date.UTC(2026, 0, 12),
        });

        const aggregate = await authed.query(shadowModeRefs.getAggregateVariance, {
          entity_type: "commission",
        });

        expect(aggregate.count).toBe(1);
        expect(aggregate.avg_absolute_delta_paise).toBe(4_000);
        expect(aggregate.max_delta_paise).toBe(4_000);
        expect(aggregate.min_delta_paise).toBe(4_000);
      });
    });

    describe("B. Rollout Policy", () => {
      it("parses valid rollout policy JSON through getRolloutPolicy", async () => {
        const t = convexTest(schema, modules);
        const { adminId, authed } = await createShadowAdmin(t, "rollout_parse_valid", [
          SHADOW_MODE_VIEW_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "PARTIAL",
          enabled_personas: [INCENTIVE_PERSONA.GUARD, INCENTIVE_PERSONA.OPS],
          notes: "  phased rollout  ",
        });

        const policy = await authed.query(shadowRolloutRefs.getRolloutPolicy, {});

        expect(policy.mode).toBe("PARTIAL");
        expect(policy.enabled_personas).toEqual([INCENTIVE_PERSONA.GUARD, INCENTIVE_PERSONA.OPS]);
        expect(policy.notes).toBe("phased rollout");
      });

      it("falls back to default rollout policy for missing or malformed config", async () => {
        const t = convexTest(schema, modules);
        const { adminId, authed } = await createShadowAdmin(t, "rollout_parse_default", [
          SHADOW_MODE_VIEW_PERMISSION,
        ]);

        const missingPolicy = await authed.query(shadowRolloutRefs.getRolloutPolicy, {});
        expect(missingPolicy).toEqual({
          mode: "OFF",
          enabled_personas: [],
          notes: DEFAULT_ROLLOUT_NOTES,
        });

        await upsertSystemConfigValueForTests(t, {
          key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
          value: "{not-valid-json",
          updatedByAdminId: adminId,
        });

        const malformedPolicy = await authed.query(shadowRolloutRefs.getRolloutPolicy, {});
        expect(malformedPolicy).toEqual({
          mode: "OFF",
          enabled_personas: [],
          notes: DEFAULT_ROLLOUT_NOTES,
        });
      });

      it("accepts OFF -> SHADOW -> PARTIAL -> FULL mode transitions", async () => {
        const t = convexTest(schema, modules);
        const { authed } = await createShadowAdmin(t, "rollout_transitions", [
          SHADOW_MODE_MANAGE_PERMISSION,
        ]);

        const off = await authed.mutation(shadowRolloutRefs.updateRolloutPolicy, {
          mode: "OFF",
          enabled_personas: [],
        });
        const shadow = await authed.mutation(shadowRolloutRefs.updateRolloutPolicy, {
          mode: "SHADOW",
          enabled_personas: [],
        });
        const partial = await authed.mutation(shadowRolloutRefs.updateRolloutPolicy, {
          mode: "PARTIAL",
          enabled_personas: [INCENTIVE_PERSONA.OPS],
        });
        const full = await authed.mutation(shadowRolloutRefs.updateRolloutPolicy, {
          mode: "FULL",
          enabled_personas: [INCENTIVE_PERSONA.OPS, INCENTIVE_PERSONA.GUARD],
        });

        expect([off.mode, shadow.mode, partial.mode, full.mode]).toEqual([
          "OFF",
          "SHADOW",
          "PARTIAL",
          "FULL",
        ]);
      });

      it("normalizes enabled_personas by deduping and dropping invalid entries", async () => {
        const t = convexTest(schema, modules);
        const { adminId, authed } = await createShadowAdmin(t, "rollout_persona_normalization", [
          SHADOW_MODE_VIEW_PERMISSION,
        ]);

        await upsertSystemConfigValueForTests(t, {
          key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
          value: JSON.stringify({
            mode: "PARTIAL",
            enabled_personas: [
              INCENTIVE_PERSONA.GUARD,
              INCENTIVE_PERSONA.GUARD,
              INCENTIVE_PERSONA.OPS,
              "NOT_A_PERSONA",
              10,
            ],
            notes: "   ",
          }),
          updatedByAdminId: adminId,
        });

        const normalized = await authed.query(shadowRolloutRefs.getRolloutPolicy, {});
        expect(normalized.enabled_personas).toEqual([
          INCENTIVE_PERSONA.GUARD,
          INCENTIVE_PERSONA.OPS,
        ]);
        expect(normalized.notes).toBe(DEFAULT_ROLLOUT_NOTES);
      });

      it("selects guard payout source as v2/v3 based on rollout policy", async () => {
        const t = convexTest(schema, modules);
        const { adminId, authed } = await createShadowAdmin(t, "guard_source_policy", [
          SHADOW_MODE_VIEW_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "OFF",
          enabled_personas: [],
        });
        expect(await authed.query(shadowRolloutRefs.getGuardPayoutSource, {})).toBe("v2");

        await setRolloutPolicy(t, adminId, {
          mode: "SHADOW",
          enabled_personas: [INCENTIVE_PERSONA.OPS],
        });
        expect(await authed.query(shadowRolloutRefs.getGuardPayoutSource, {})).toBe("v2");

        await setRolloutPolicy(t, adminId, {
          mode: "PARTIAL",
          enabled_personas: [INCENTIVE_PERSONA.OPS],
        });
        expect(await authed.query(shadowRolloutRefs.getGuardPayoutSource, {})).toBe("v2");

        await setRolloutPolicy(t, adminId, {
          mode: "PARTIAL",
          enabled_personas: [INCENTIVE_PERSONA.GUARD],
        });
        expect(await authed.query(shadowRolloutRefs.getGuardPayoutSource, {})).toBe("v3");

        await setRolloutPolicy(t, adminId, {
          mode: "FULL",
          enabled_personas: [],
        });
        expect(await authed.query(shadowRolloutRefs.getGuardPayoutSource, {})).toBe("v3");
      });
    });

    describe("C. Guard Migration", () => {
      it("migrateGuardToV3 adds GUARD persona and upgrades SHADOW to PARTIAL", async () => {
        const t = convexTest(schema, modules);
        const { adminId, authed } = await createShadowAdmin(t, "migrate_guard", [
          SHADOW_MODE_MANAGE_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "SHADOW",
          enabled_personas: [INCENTIVE_PERSONA.OPS],
        });

        const migrated = await authed.mutation(shadowRolloutRefs.migrateGuardToV3, {});

        expect(migrated.mode).toBe("PARTIAL");
        expect(migrated.enabled_personas).toEqual([INCENTIVE_PERSONA.OPS, INCENTIVE_PERSONA.GUARD]);
      });

      it("rollbackGuardToV2 removes GUARD and downgrades mode when no personas remain", async () => {
        const t = convexTest(schema, modules);
        const { adminId, authed } = await createShadowAdmin(t, "rollback_guard", [
          SHADOW_MODE_MANAGE_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "FULL",
          enabled_personas: [INCENTIVE_PERSONA.GUARD],
        });

        const rolledBack = await authed.mutation(shadowRolloutRefs.rollbackGuardToV2, {});

        expect(rolledBack.mode).toBe("SHADOW");
        expect(rolledBack.enabled_personas).toEqual([]);
      });

      it("migration is idempotent when guard is already enabled", async () => {
        const t = convexTest(schema, modules);
        const { adminId, authed } = await createShadowAdmin(t, "migrate_guard_idempotent", [
          SHADOW_MODE_MANAGE_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "SHADOW",
          enabled_personas: [INCENTIVE_PERSONA.GUARD],
        });

        await authed.mutation(shadowRolloutRefs.migrateGuardToV3, {});
        const second = await authed.mutation(shadowRolloutRefs.migrateGuardToV3, {});

        expect(second.mode).toBe("PARTIAL");
        expect(
          second.enabled_personas.filter((persona: string) => persona === INCENTIVE_PERSONA.GUARD),
        ).toHaveLength(1);
      });

      it("rollback is a no-op when guard is not on v3 and migration respects feature flags", async () => {
        const t = convexTest(schema, modules);
        const { adminId, authed } = await createShadowAdmin(t, "rollback_noop_and_flags", [
          SHADOW_MODE_MANAGE_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "SHADOW",
          enabled_personas: [INCENTIVE_PERSONA.OPS],
        });
        await setFeatureFlags(
          t,
          adminId,
          JSON.stringify({
            shadow_mode: true,
            split_preview_enabled: true,
            disbursement_enabled: false,
            gamification_enabled: false,
          }),
        );

        const rolledBack = await authed.mutation(shadowRolloutRefs.rollbackGuardToV2, {});
        expect(rolledBack.mode).toBe("SHADOW");
        expect(rolledBack.enabled_personas).toEqual([INCENTIVE_PERSONA.OPS]);

        await setFeatureFlags(
          t,
          adminId,
          JSON.stringify({
            shadow_mode: false,
            split_preview_enabled: true,
            disbursement_enabled: false,
            gamification_enabled: false,
          }),
        );

        await expect(authed.mutation(shadowRolloutRefs.migrateGuardToV3, {})).rejects.toThrow(
          "shadow_mode feature flag is disabled",
        );
      });
    });

    describe("D. Anti-Double-Pay", () => {
      it("deduplicates by source_key and returns the existing disbursement", async () => {
        const t = convexTest(schema, modules);
        const scenario = await createCommissionScenario(t, {
          scenarioName: "anti_double_source_key",
          profitPaise: 175_000,
          baseRateBps: 1500,
          minRateBps: 1200,
          maxRateBps: 2200,
        });

        await setRolloutPolicy(t, scenario.adminId, {
          mode: "FULL",
          enabled_personas: [],
        });

        const first = (await t.mutation(incentiveDisbursementRefs.createFromSplit, {
          recipient_user_id: scenario.guardId,
          recipient_persona: INCENTIVE_PERSONA.GUARD,
          source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
          source_record_id: "split_a",
          source_key: "split_key_same",
          closure_id: scenario.closureId,
          amount_paise: 8_000,
        })) as Id<"incentive_disbursements"> | null;

        const second = (await t.mutation(incentiveDisbursementRefs.createFromSplit, {
          recipient_user_id: scenario.guardId,
          recipient_persona: INCENTIVE_PERSONA.GUARD,
          source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
          source_record_id: "split_b",
          source_key: "split_key_same",
          closure_id: scenario.closureId,
          amount_paise: 9_000,
        })) as Id<"incentive_disbursements"> | null;

        expect(first).not.toBeNull();
        expect(second).toBe(first);

        const record = await t.run(async (ctx) => {
          return await ctx.db
            .query("incentive_disbursements")
            .withIndex("by_source_key", (q) => q.eq("source_key", "split_key_same"))
            .first();
        });

        expect(record?.amount_paise).toBe(8_000);
      });

      it("deduplicates by closure_id + recipient_user_id across different source keys", async () => {
        const t = convexTest(schema, modules);
        const scenario = await createCommissionScenario(t, {
          scenarioName: "anti_double_closure_recipient",
          profitPaise: 175_000,
          baseRateBps: 1500,
          minRateBps: 1200,
          maxRateBps: 2200,
        });

        await setRolloutPolicy(t, scenario.adminId, {
          mode: "FULL",
          enabled_personas: [],
        });

        const first = (await t.mutation(incentiveDisbursementRefs.createFromSplit, {
          recipient_user_id: scenario.guardId,
          recipient_persona: INCENTIVE_PERSONA.GUARD,
          source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
          source_record_id: "split_1",
          source_key: "unique_key_1",
          closure_id: scenario.closureId,
          amount_paise: 8_000,
        })) as Id<"incentive_disbursements"> | null;

        const second = (await t.mutation(incentiveDisbursementRefs.createFromSplit, {
          recipient_user_id: scenario.guardId,
          recipient_persona: INCENTIVE_PERSONA.GUARD,
          source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
          source_record_id: "split_2",
          source_key: "unique_key_2",
          closure_id: scenario.closureId,
          amount_paise: 8_500,
        })) as Id<"incentive_disbursements"> | null;

        expect(first).not.toBeNull();
        expect(second).toBe(first);

        const records = await t.run(async (ctx) => {
          return await ctx.db
            .query("incentive_disbursements")
            .withIndex("by_closure", (q) => q.eq("closure_id", scenario.closureId))
            .collect();
        });

        expect(
          records.filter(
            (record) => record.recipient_user_id === scenario.guardId && record.status !== "VOIDED",
          ),
        ).toHaveLength(1);
      });

      it("is retry-safe: repeated createFromSplit calls with same args create one record", async () => {
        const t = convexTest(schema, modules);
        const scenario = await createCommissionScenario(t, {
          scenarioName: "anti_double_retry",
          profitPaise: 175_000,
          baseRateBps: 1500,
          minRateBps: 1200,
          maxRateBps: 2200,
        });

        await setRolloutPolicy(t, scenario.adminId, {
          mode: "FULL",
          enabled_personas: [],
        });

        const args = {
          recipient_user_id: scenario.guardId,
          recipient_persona: INCENTIVE_PERSONA.GUARD,
          source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
          source_record_id: "split_retry",
          source_key: "retry_key",
          closure_id: scenario.closureId,
          amount_paise: 7_500,
        } as const;

        const first = (await t.mutation(
          incentiveDisbursementRefs.createFromSplit,
          args,
        )) as Id<"incentive_disbursements"> | null;
        const second = (await t.mutation(
          incentiveDisbursementRefs.createFromSplit,
          args,
        )) as Id<"incentive_disbursements"> | null;

        expect(first).not.toBeNull();
        expect(second).toBe(first);

        const allBySourceKey = await t.run(async (ctx) => {
          return await ctx.db
            .query("incentive_disbursements")
            .withIndex("by_source_key", (q) => q.eq("source_key", "retry_key"))
            .collect();
        });
        expect(allBySourceKey).toHaveLength(1);
      });

      it("allows different recipients on same closure to receive disbursements", async () => {
        const t = convexTest(schema, modules);
        const scenario = await createCommissionScenario(t, {
          scenarioName: "anti_double_multi_recipient",
          profitPaise: 175_000,
          baseRateBps: 1500,
          minRateBps: 1200,
          maxRateBps: 2200,
        });
        const secondRecipientId = await createGuardUser(
          t,
          "workos_incentive_v3_disbursement_second_recipient",
        );

        await setRolloutPolicy(t, scenario.adminId, {
          mode: "FULL",
          enabled_personas: [],
        });

        const firstRecipientDisbursement = (await t.mutation(
          incentiveDisbursementRefs.createFromSplit,
          {
            recipient_user_id: scenario.guardId,
            recipient_persona: INCENTIVE_PERSONA.GUARD,
            source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
            source_record_id: "split_guard_1",
            source_key: "closure_shared_guard_1",
            closure_id: scenario.closureId,
            amount_paise: 4_000,
          },
        )) as Id<"incentive_disbursements"> | null;

        const secondRecipientDisbursement = (await t.mutation(
          incentiveDisbursementRefs.createFromSplit,
          {
            recipient_user_id: secondRecipientId,
            recipient_persona: INCENTIVE_PERSONA.GUARD,
            source_type: DISBURSEMENT_SOURCE_TYPE.ATTRIBUTION_SPLIT,
            source_record_id: "split_guard_2",
            source_key: "closure_shared_guard_2",
            closure_id: scenario.closureId,
            amount_paise: 4_500,
          },
        )) as Id<"incentive_disbursements"> | null;

        expect(firstRecipientDisbursement).not.toBeNull();
        expect(secondRecipientDisbursement).not.toBeNull();
        expect(firstRecipientDisbursement).not.toBe(secondRecipientDisbursement);

        const records = await t.run(async (ctx) => {
          return await ctx.db
            .query("incentive_disbursements")
            .withIndex("by_closure", (q) => q.eq("closure_id", scenario.closureId))
            .collect();
        });

        expect(new Set(records.map((record) => record.recipient_user_id)).size).toBe(2);
      });
    });

    describe("E. Decommission", () => {
      it("fails readiness when rollout mode is not FULL", async () => {
        const t = convexTest(schema, modules);
        const { closureId } = await createShadowClosure(t, "decommission_mode_blocker");
        const { adminId, authed } = await createShadowAdmin(t, "decommission_mode_blocker", [
          SHADOW_MODE_VIEW_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "SHADOW",
          enabled_personas: [INCENTIVE_PERSONA.GUARD],
        });

        await insertCommissionDelta(t, {
          closureId,
          summary: buildDeltaSummary(100_000, 102_000),
          createdAt: Date.UTC(2026, 0, 5),
        });
        await insertCommissionDelta(t, {
          closureId,
          summary: buildDeltaSummary(100_000, 103_000),
          createdAt: Date.UTC(2026, 0, 19),
        });

        const readiness = await authed.query(shadowRolloutRefs.checkDecommissionReadiness, {});

        expect(readiness.ready).toBe(false);
        expect(readiness.blockers).toContain(
          "Rollout policy mode must be FULL before decommissioning v2 shadow path",
        );
      });

      it("fails readiness when fewer than two payout cycles are available", async () => {
        const t = convexTest(schema, modules);
        const { closureId } = await createShadowClosure(t, "decommission_cycle_blocker");
        const { adminId, authed } = await createShadowAdmin(t, "decommission_cycle_blocker", [
          SHADOW_MODE_VIEW_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "FULL",
          enabled_personas: [INCENTIVE_PERSONA.GUARD],
        });

        await insertCommissionDelta(t, {
          closureId,
          summary: buildDeltaSummary(100_000, 101_500),
          createdAt: Date.UTC(2026, 0, 12),
        });

        const readiness = await authed.query(shadowRolloutRefs.checkDecommissionReadiness, {});

        expect(readiness.ready).toBe(false);
        expect(readiness.stats.cycles_completed).toBe(1);
        expect(
          readiness.blockers.some((blocker: string) =>
            blocker.includes("At least 2 payout cycles"),
          ),
        ).toBe(true);
      });

      it("fails readiness with variance threshold blocker and reports deterministic blocker array", async () => {
        const t = convexTest(schema, modules);
        const { closureId } = await createShadowClosure(t, "decommission_variance_blocker");
        const { adminId, authed } = await createShadowAdmin(t, "decommission_variance_blocker", [
          SHADOW_MODE_VIEW_PERMISSION,
        ]);

        await setRolloutPolicy(t, adminId, {
          mode: "FULL",
          enabled_personas: [INCENTIVE_PERSONA.GUARD],
        });

        await insertCommissionDelta(t, {
          closureId,
          summary: buildDeltaSummary(100_000, 108_000),
          createdAt: Date.UTC(2026, 0, 5),
        });
        await insertCommissionDelta(t, {
          closureId,
          summary: buildDeltaSummary(100_000, 106_000),
          createdAt: Date.UTC(2026, 0, 19),
        });

        const readiness = await authed.query(shadowRolloutRefs.checkDecommissionReadiness, {});

        expect(readiness.ready).toBe(false);
        expect(readiness.stats.cycles_completed).toBe(2);
        expect(readiness.stats.avg_variance_pct).toBeCloseTo(7, 8);
        expect(readiness.blockers).toEqual(["Average variance 7.00% exceeds threshold 5%"]);
      });
    });
  });
});
