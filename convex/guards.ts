import { v } from "convex/values";
import {
  GUARD_TYPE,
  LEAD_STATUS,
  PAYOUT_STATUS,
  PERMISSIONS,
  QUALITY_FLAGS,
  RM_ASSIGNMENT_STATUS,
  SYSTEM_CONFIG_DEFAULTS,
  SYSTEM_CONFIG_KEYS,
  USER_STATUS,
  USER_TYPE,
  VISIT_STATUS,
  type GuardType,
  type UserType,
} from "../lib/constants";
import { getStartOfDayIST } from "../lib/dates";
import { normalizePhone } from "../lib/validators";
import { resolveOpsSociety } from "./opsAssignments.helpers";
import {
  requireAuth,
  requireFieldWorkerAuth,
  requireGuardAuth,
  requirePermission,
} from "./auth.helpers";
import {
  DEFAULT_LEADERBOARD_FILTER,
  FIELD_WORKER_USER_TYPES,
  fieldWorkerLeaderboardFilterValidator,
  type FieldWorkerLeaderboardFilter,
  type FieldWorkerUserType,
} from "./fieldWorkerContracts";
import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";
import { ALLOWED_IMAGE_CONTENT_TYPES, validateStoredFile } from "./storageValidation";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPS_PROFILE_BACKFILL_BATCH_SIZE = 50;
const OPS_PROFILE_GUARD_TYPE = "SOCIETY_GUARD";

const qualityTimeWindowValidator = v.union(
  v.literal("all_time"),
  v.literal("last_30_days"),
  v.literal("last_7_days"),
);

type QualityTimeWindow = "all_time" | "last_30_days" | "last_7_days";
type DbContext = QueryCtx | MutationCtx;

type QualityScoreWeights = {
  lead_approval_rate: number;
  visit_completion_rate: number;
  flag_frequency: number;
  speed_bonus: number;
};

export type GuardQualityMetrics = {
  total_submitted: number;
  verified_count: number;
  rejected_count: number;
  duplicate_count: number;
  verified_rate: number | null;
  rejection_rate: number | null;
  duplicate_rate: number | null;
  completed_visits: number;
  no_show_count: number;
  visit_completion_rate: number | null;
  quality_score: number | null;
};

const DEFAULT_QUALITY_SCORE_WEIGHTS: QualityScoreWeights = {
  lead_approval_rate: 40,
  visit_completion_rate: 30,
  flag_frequency: 20,
  speed_bonus: 10,
};

const opsProfileBackfillStatsValidator = v.object({
  scanned_count: v.number(),
  created_count: v.number(),
  skipped_existing_profile_count: v.number(),
  skipped_missing_society_count: v.number(),
  error_count: v.number(),
});

type OpsProfileBackfillStats = {
  scanned_count: number;
  created_count: number;
  skipped_existing_profile_count: number;
  skipped_missing_society_count: number;
  error_count: number;
};

function createInitialOpsProfileBackfillStats(): OpsProfileBackfillStats {
  return {
    scanned_count: 0,
    created_count: 0,
    skipped_existing_profile_count: 0,
    skipped_missing_society_count: 0,
    error_count: 0,
  };
}

const statusValidator = v.union(
  v.literal(USER_STATUS.ACTIVE),
  v.literal(USER_STATUS.INACTIVE),
  v.literal(USER_STATUS.BANNED),
);

const activeInactiveStatusValidator = v.union(
  v.literal(USER_STATUS.ACTIVE),
  v.literal(USER_STATUS.INACTIVE),
);

function normalizeName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Name is required");
  }

  return normalizedName;
}

function normalizeReason(reason: string): string {
  const normalizedReason = reason.trim();

  if (!normalizedReason) {
    throw new Error("Reason is required");
  }

  return normalizedReason;
}

function ensureGuardType(value: string): GuardType {
  if (!Object.values(GUARD_TYPE).includes(value as GuardType)) {
    throw new Error("Invalid guard type");
  }

  return value as GuardType;
}

function resolveWorkosUserId(
  subject: string | null | undefined,
  tokenIdentifier: string,
): string | null {
  if (subject && subject.length > 0) {
    return subject;
  }

  if (!tokenIdentifier) {
    return null;
  }

  const delimiterIndex = tokenIdentifier.lastIndexOf("|");
  return delimiterIndex === -1 ? tokenIdentifier : tokenIdentifier.slice(delimiterIndex + 1);
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toRatePercent(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  return roundTo2((numerator / denominator) * 100);
}

function matchesLeaderboardPersonaFilter(
  userType: Doc<"users">["user_type"],
  personaFilter: FieldWorkerLeaderboardFilter,
): userType is FieldWorkerUserType {
  if (personaFilter === "ALL") {
    return FIELD_WORKER_USER_TYPES.some((fieldWorkerType) => fieldWorkerType === userType);
  }

  return userType === personaFilter;
}

function isFieldWorkerUserType(
  userType: Doc<"users">["user_type"],
): userType is FieldWorkerUserType {
  return FIELD_WORKER_USER_TYPES.some((fieldWorkerType) => fieldWorkerType === userType);
}

function getTimeWindowCutoff(timeWindow: QualityTimeWindow | undefined): number | undefined {
  const now = Date.now();

  if (timeWindow === "last_30_days") {
    return now - 30 * DAY_MS;
  }

  if (timeWindow === "last_7_days") {
    return now - 7 * DAY_MS;
  }

  return undefined;
}

async function getSystemConfigNumber(
  ctx: DbContext,
  key: Doc<"system_config">["key"],
  defaultValue: number,
): Promise<number> {
  const config = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!config) {
    return defaultValue;
  }

  try {
    const parsed = JSON.parse(config.value) as unknown;
    if (typeof parsed !== "number" || Number.isNaN(parsed)) {
      return defaultValue;
    }

    return parsed;
  } catch {
    return defaultValue;
  }
}

async function getQualityScoreWeights(ctx: DbContext): Promise<QualityScoreWeights> {
  const config = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.QUALITY_SCORE_WEIGHTS))
    .unique();

  if (!config) {
    return DEFAULT_QUALITY_SCORE_WEIGHTS;
  }

  try {
    const parsed = JSON.parse(config.value) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return DEFAULT_QUALITY_SCORE_WEIGHTS;
    }

    const values = parsed as Record<string, unknown>;

    const leadApprovalRate =
      typeof values.lead_approval_rate === "number" && Number.isFinite(values.lead_approval_rate)
        ? values.lead_approval_rate
        : DEFAULT_QUALITY_SCORE_WEIGHTS.lead_approval_rate;
    const visitCompletionRate =
      typeof values.visit_completion_rate === "number" &&
      Number.isFinite(values.visit_completion_rate)
        ? values.visit_completion_rate
        : DEFAULT_QUALITY_SCORE_WEIGHTS.visit_completion_rate;
    const flagFrequency =
      typeof values.flag_frequency === "number" && Number.isFinite(values.flag_frequency)
        ? values.flag_frequency
        : DEFAULT_QUALITY_SCORE_WEIGHTS.flag_frequency;
    const speedBonus =
      typeof values.speed_bonus === "number" && Number.isFinite(values.speed_bonus)
        ? values.speed_bonus
        : DEFAULT_QUALITY_SCORE_WEIGHTS.speed_bonus;

    return {
      lead_approval_rate: leadApprovalRate,
      visit_completion_rate: visitCompletionRate,
      flag_frequency: flagFrequency,
      speed_bonus: speedBonus,
    };
  } catch {
    return DEFAULT_QUALITY_SCORE_WEIGHTS;
  }
}

async function countLeadsByStatus(
  ctx: DbContext,
  guardUserId: Id<"users">,
  status: Doc<"leads">["status"],
  cutoffTimestamp: number | undefined,
): Promise<number> {
  let leadsQuery = ctx.db
    .query("leads")
    .withIndex("by_guard_and_status", (q) =>
      q.eq("submitted_by_guard_id", guardUserId).eq("status", status),
    );

  if (cutoffTimestamp !== undefined) {
    leadsQuery = leadsQuery.filter((q) => q.gte(q.field("_creationTime"), cutoffTimestamp));
  }

  const leads = await leadsQuery.collect();
  return leads.length;
}

async function countVisitsByStatus(
  ctx: DbContext,
  guardUserId: Id<"users">,
  status: Doc<"visits">["status"],
  cutoffTimestamp: number | undefined,
): Promise<number> {
  let visitsQuery = ctx.db
    .query("visits")
    .withIndex("by_guard_and_status", (q) =>
      q.eq("assigned_guard_id", guardUserId).eq("status", status),
    );

  if (cutoffTimestamp !== undefined) {
    visitsQuery = visitsQuery.filter((q) => q.gte(q.field("_creationTime"), cutoffTimestamp));
  }

  const visits = await visitsQuery.collect();
  return visits.length;
}

async function endNonTerminalRmAssignmentsForGuard(
  ctx: MutationCtx,
  guardUserId: Id<"users">,
  reason: string,
): Promise<void> {
  const guardProfile = await ctx.db
    .query("guard_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", guardUserId))
    .unique();

  if (!guardProfile) {
    return;
  }

  const assignments = await ctx.db
    .query("owner_rm_assignments")
    .withIndex("by_rm", (q) => q.eq("rm_guard_id", guardProfile._id))
    .collect();

  const assignmentsToEnd = assignments.filter(
    (assignment) =>
      assignment.status === RM_ASSIGNMENT_STATUS.ACTIVE ||
      assignment.status === RM_ASSIGNMENT_STATUS.WARNING ||
      assignment.status === RM_ASSIGNMENT_STATUS.ESCALATED,
  );

  const now = Date.now();
  for (const assignment of assignmentsToEnd) {
    await ctx.db.patch(assignment._id, {
      status: RM_ASSIGNMENT_STATUS.ENDED,
      reassignment_reason: reason,
      updated_at: now,
    });

    const owner = await ctx.db.get(assignment.owner_id);
    if (owner && !owner.is_deleted && owner.current_rm_guard_id === guardProfile._id) {
      await ctx.db.patch(owner._id, {
        current_rm_id: undefined,
        current_rm_guard_id: undefined,
        updated_at: now,
      });
    }
  }
}

export async function computeMetrics(
  ctx: DbContext,
  guard_user_id: Id<"users">,
  cutoffTimestamp?: number,
): Promise<GuardQualityMetrics> {
  let submittedLeadsQuery = ctx.db
    .query("leads")
    .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guard_user_id));

  if (cutoffTimestamp !== undefined) {
    submittedLeadsQuery = submittedLeadsQuery.filter((q) =>
      q.gte(q.field("_creationTime"), cutoffTimestamp),
    );
  }

  const [
    submittedLeads,
    verified_count,
    rejected_count,
    duplicate_count,
    completed_visits,
    no_show_count,
    cancelled_visits,
    qualityScoreWeights,
  ] = await Promise.all([
    submittedLeadsQuery.collect(),
    countLeadsByStatus(ctx, guard_user_id, LEAD_STATUS.VERIFIED, cutoffTimestamp),
    countLeadsByStatus(ctx, guard_user_id, LEAD_STATUS.REJECTED, cutoffTimestamp),
    countLeadsByStatus(ctx, guard_user_id, LEAD_STATUS.DUPLICATE, cutoffTimestamp),
    countVisitsByStatus(ctx, guard_user_id, VISIT_STATUS.COMPLETED, cutoffTimestamp),
    countVisitsByStatus(ctx, guard_user_id, VISIT_STATUS.NO_SHOW, cutoffTimestamp),
    countVisitsByStatus(ctx, guard_user_id, VISIT_STATUS.CANCELLED, cutoffTimestamp),
    getQualityScoreWeights(ctx),
  ]);

  const total_submitted = submittedLeads.length;
  const hasSufficientData = total_submitted >= 5;

  const verified_rate = hasSufficientData ? toRatePercent(verified_count, total_submitted) : null;
  const rejection_rate = hasSufficientData ? toRatePercent(rejected_count, total_submitted) : null;
  const duplicate_rate = hasSufficientData ? toRatePercent(duplicate_count, total_submitted) : null;

  const totalVisitOutcomes = completed_visits + no_show_count + cancelled_visits;
  const visit_completion_rate = hasSufficientData
    ? toRatePercent(completed_visits, totalVisitOutcomes)
    : null;

  let quality_score: number | null = null;

  if (hasSufficientData && verified_rate !== null && visit_completion_rate !== null) {
    const flaggedLeadCount = submittedLeads.filter(
      (lead) => (lead.quality_flags?.length ?? 0) > 0,
    ).length;
    const flagFrequencyRate = toRatePercent(flaggedLeadCount, total_submitted);
    const flagHealthScore = Math.max(0, 100 - flagFrequencyRate);
    const speedBonusScore = 100;

    const totalWeight =
      qualityScoreWeights.lead_approval_rate +
      qualityScoreWeights.visit_completion_rate +
      qualityScoreWeights.flag_frequency +
      qualityScoreWeights.speed_bonus;

    if (totalWeight > 0) {
      quality_score = roundTo2(
        (verified_rate * qualityScoreWeights.lead_approval_rate +
          visit_completion_rate * qualityScoreWeights.visit_completion_rate +
          flagHealthScore * qualityScoreWeights.flag_frequency +
          speedBonusScore * qualityScoreWeights.speed_bonus) /
          totalWeight,
      );
    }
  }

  return {
    total_submitted,
    verified_count,
    rejected_count,
    duplicate_count,
    verified_rate,
    rejection_rate,
    duplicate_rate,
    completed_visits,
    no_show_count,
    visit_completion_rate,
    quality_score,
  };
}

export async function getGuardQualityFlags(
  ctx: DbContext,
  guard_user_id: Id<"users">,
): Promise<Array<(typeof QUALITY_FLAGS)[keyof typeof QUALITY_FLAGS]>> {
  const metrics = await computeMetrics(ctx, guard_user_id);
  const flags: Array<(typeof QUALITY_FLAGS)[keyof typeof QUALITY_FLAGS]> = [];

  if (
    metrics.total_submitted >= 5 &&
    metrics.rejection_rate !== null &&
    metrics.rejection_rate > 50
  ) {
    flags.push(QUALITY_FLAGS.GUARD_HIGH_REJECTION);
  }

  return flags;
}

async function persistQualityScore(
  ctx: MutationCtx,
  guardUserId: Id<"users">,
  qualityScore: number | null,
): Promise<void> {
  const guardProfile = await ctx.db
    .query("guard_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", guardUserId))
    .unique();

  if (!guardProfile) {
    throw new Error("Guard profile not found");
  }

  await ctx.db.patch(guardProfile._id, {
    quality_score: qualityScore ?? undefined,
  });
}

export const recomputeQualityScoreInternal = internalMutation({
  args: {
    guard_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const metrics = await computeMetrics(ctx, args.guard_user_id);
    await persistQualityScore(ctx, args.guard_user_id, metrics.quality_score);

    return {
      guard_user_id: args.guard_user_id,
      quality_score: metrics.quality_score,
    };
  },
});

export const recomputeQualityScore = mutation({
  args: {
    guard_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.QUALITY_VIEW);

    const guardUser = await ctx.db.get(args.guard_user_id);
    if (
      !guardUser ||
      !(guardUser.user_types?.includes(USER_TYPE.GUARD) ?? guardUser.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    const metrics = await computeMetrics(ctx, args.guard_user_id);
    await persistQualityScore(ctx, args.guard_user_id, metrics.quality_score);

    return {
      guard_user_id: args.guard_user_id,
      quality_score: metrics.quality_score,
    };
  },
});

export const createInternal = internalMutation({
  args: {
    workos_user_id: v.string(),
    name: v.string(),
    phone: v.string(),
    society_id: v.id("societies"),
    guard_type: v.string(),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const phone = normalizePhone(args.phone);
    const guardType = ensureGuardType(args.guard_type);

    const society = await ctx.db.get(args.society_id);

    if (!society) {
      throw new Error("Society not found");
    }

    const existingUserByWorkOSId = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", args.workos_user_id))
      .unique();

    if (existingUserByWorkOSId) {
      throw new Error("User with this WorkOS ID already exists");
    }

    const existingUserByPhone = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();

    if (existingUserByPhone) {
      throw new Error("Guard with this phone number already exists");
    }

    const user_id = await ctx.db.insert("users", {
      workos_user_id: args.workos_user_id,
      user_type: USER_TYPE.GUARD,
      name,
      phone,
      status: USER_STATUS.ACTIVE,
      must_change_password: true,
    });

    await ctx.db.insert("guard_profiles", {
      user_id,
      society_id: args.society_id,
      guard_type: guardType,
      has_seen_onboarding: false,
    });

    return user_id;
  },
});

export const checkPhoneExists = internalQuery({
  args: {
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    return { exists: !!existing };
  },
});

export const backfillOpsProfiles = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    dry_run: v.optional(v.boolean()),
    stats: v.optional(opsProfileBackfillStatsValidator),
  },
  handler: async (ctx, args) => {
    const cursor = args.cursor ?? null;
    const dryRun = args.dry_run ?? false;
    const stats: OpsProfileBackfillStats = {
      ...createInitialOpsProfileBackfillStats(),
      ...(args.stats ?? {}),
    };

    const batch = await ctx.db
      .query("users")
      .withIndex("by_type_and_status", (q) =>
        q.eq("user_type", USER_TYPE.OPS).eq("status", USER_STATUS.ACTIVE),
      )
      .paginate({
        numItems: OPS_PROFILE_BACKFILL_BATCH_SIZE,
        cursor,
      });

    for (const user of batch.page) {
      stats.scanned_count += 1;

      try {
        const existingProfile = await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
          .unique();

        if (existingProfile) {
          stats.skipped_existing_profile_count += 1;
          continue;
        }

        let societyId: Id<"societies">;

        try {
          societyId = await resolveOpsSociety(ctx, user._id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          stats.skipped_missing_society_count += 1;
          console.warn(`[backfillOpsProfiles] skipped user ${user._id}: ${message}`);
          continue;
        }

        if (!dryRun) {
          await ctx.db.insert("guard_profiles", {
            user_id: user._id,
            society_id: societyId,
            guard_type: OPS_PROFILE_GUARD_TYPE,
            has_seen_onboarding: false,
          });
        }

        stats.created_count += 1;
      } catch (error) {
        stats.error_count += 1;
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[backfillOpsProfiles] failed for user ${user._id}: ${message}`);
      }
    }

    if (!batch.isDone) {
      await ctx.scheduler.runAfter(100, internal.guards.backfillOpsProfiles, {
        cursor: batch.continueCursor,
        dry_run: dryRun,
        stats,
      });
    }

    return {
      ...stats,
      next_cursor: batch.isDone ? null : batch.continueCursor,
    };
  },
});

export const createOpsInternal = internalMutation({
  args: {
    workos_user_id: v.string(),
    name: v.string(),
    phone: v.string(),
    assigned_by_workos_user_id: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const phone = normalizePhone(args.phone);

    const existingUserByWorkOSId = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", args.workos_user_id))
      .unique();

    const usersWithPhone = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .collect();

    const conflictingOpsUser = usersWithPhone.find(
      (user) =>
        (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS) &&
        user._id !== existingUserByWorkOSId?._id,
    );

    if (conflictingOpsUser) {
      throw new Error("OPS user with this phone number already exists");
    }

    const assigningAdmin = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) =>
        q.eq("workos_user_id", args.assigned_by_workos_user_id),
      )
      .unique();

    if (
      !assigningAdmin ||
      !(
        assigningAdmin.user_types?.includes(USER_TYPE.ADMIN) ??
        assigningAdmin.user_type === USER_TYPE.ADMIN
      )
    ) {
      throw new Error("Admin user not found");
    }

    const opsAgentRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Ops Agent"))
      .unique();

    if (!opsAgentRole || opsAgentRole.is_deleted) {
      throw new Error("Ops Agent role not found");
    }

    let user_id: Id<"users">;

    if (existingUserByWorkOSId) {
      await ctx.db.patch(existingUserByWorkOSId._id, {
        user_type: USER_TYPE.OPS,
        name,
        phone,
        email: args.email,
        status: USER_STATUS.ACTIVE,
        must_change_password: true,
      });
      user_id = existingUserByWorkOSId._id;
    } else {
      user_id = await ctx.db.insert("users", {
        workos_user_id: args.workos_user_id,
        user_type: USER_TYPE.OPS,
        name,
        phone,
        email: args.email,
        status: USER_STATUS.ACTIVE,
        must_change_password: true,
      });
    }

    const existingOpsRoleAssignments = await ctx.db
      .query("user_role_assignments")
      .withIndex("by_user_id", (q) => q.eq("user_id", user_id))
      .filter((q) => q.eq(q.field("role_id"), opsAgentRole._id))
      .collect();
    const activeOpsRoleAssignment = existingOpsRoleAssignments.find(
      (assignment) => !assignment.is_deleted,
    );

    if (!activeOpsRoleAssignment) {
      const deletedAssignment = existingOpsRoleAssignments[0];

      if (deletedAssignment) {
        await ctx.db.patch(deletedAssignment._id, {
          assigned_by_admin_id: assigningAdmin._id,
          is_deleted: false,
        });
      } else {
        await ctx.db.insert("user_role_assignments", {
          user_id,
          role_id: opsAgentRole._id,
          assigned_by_admin_id: assigningAdmin._id,
          is_deleted: false,
        });
      }
    }

    const existingGuardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", user_id))
      .unique();

    if (!existingGuardProfile) {
      const societyId = await resolveOpsSociety(ctx, user_id);

      await ctx.db.insert("guard_profiles", {
        user_id,
        society_id: societyId,
        guard_type: OPS_PROFILE_GUARD_TYPE,
        has_seen_onboarding: false,
      });
    }

    return user_id;
  },
});

export const checkOpsPhoneExists = internalQuery({
  args: {
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    const usersWithPhone = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .collect();

    return {
      exists: usersWithPhone.some(
        (user) => user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS,
      ),
    };
  },
});

export const checkPermission = internalQuery({
  args: {
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return { authorized: false };
    }

    const workosUserId = resolveWorkosUserId(identity.subject, identity.tokenIdentifier);

    if (!workosUserId) {
      return { authorized: false };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", workosUserId))
      .unique();

    if (!user) {
      return { authorized: false };
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      return { authorized: false };
    }

    const isBackofficeUser =
      user.user_types?.some(
        (userType) => userType === USER_TYPE.ADMIN || userType === USER_TYPE.OPS,
      ) ??
      (user.user_type === USER_TYPE.ADMIN || user.user_type === USER_TYPE.OPS);

    if (!isBackofficeUser) {
      return { authorized: false };
    }

    const assignments = await ctx.db
      .query("user_role_assignments")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const roles = await Promise.all(
      assignments.map((assignment) => ctx.db.get(assignment.role_id)),
    );
    const permissions = new Set<string>();

    for (const role of roles) {
      if (!role || role.is_deleted) {
        continue;
      }

      for (const rolePermission of role.permissions) {
        permissions.add(rolePermission);
      }
    }

    return { authorized: permissions.has(args.permission) };
  },
});

export const updateProfile = mutation({
  args: {
    user_id: v.id("users"),
    name: v.optional(v.string()),
    guard_type: v.optional(v.string()),
    society_id: v.optional(v.id("societies")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_EDIT);

    const user = await ctx.db.get(args.user_id);

    if (
      !user ||
      !(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.user_id))
      .unique();

    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }

    if (args.name !== undefined) {
      await ctx.db.patch(args.user_id, {
        name: normalizeName(args.name),
      });
    }

    const guardProfilePatch: {
      guard_type?: GuardType;
      society_id?: Id<"societies">;
    } = {};

    if (args.guard_type !== undefined) {
      guardProfilePatch.guard_type = ensureGuardType(args.guard_type);
    }

    if (args.society_id !== undefined && args.society_id !== guardProfile.society_id) {
      const society = await ctx.db.get(args.society_id);

      if (!society) {
        throw new Error("Society not found");
      }

      guardProfilePatch.society_id = args.society_id;

      const activeShifts = await ctx.db
        .query("guard_shifts")
        .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", args.user_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect();

      await Promise.all(
        activeShifts.map(async (shift) => {
          await ctx.db.patch(shift._id, { is_deleted: true });
        }),
      );
    }

    if (Object.keys(guardProfilePatch).length > 0) {
      await ctx.db.patch(guardProfile._id, guardProfilePatch);
    }

    return null;
  },
});

export const updateStatus = mutation({
  args: {
    user_id: v.id("users"),
    status: statusValidator,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_MANAGE_STATUS);

    const user = await ctx.db.get(args.user_id);

    if (
      !user ||
      !(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    if (user.status === args.status) {
      throw new Error("Invalid status transition");
    }

    if (user.status === USER_STATUS.ACTIVE && args.status === USER_STATUS.INACTIVE) {
      const pendingVisits = await ctx.db
        .query("visits")
        .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", args.user_id))
        .filter((q) =>
          q.and(
            q.neq(q.field("status"), VISIT_STATUS.COMPLETED),
            q.neq(q.field("status"), VISIT_STATUS.CANCELLED),
            q.neq(q.field("status"), VISIT_STATUS.NO_SHOW),
          ),
        )
        .collect();

      await Promise.all(
        pendingVisits.map(async (visit) => {
          await ctx.db.patch(visit._id, {
            needs_reassignment: true,
          });
        }),
      );

      await ctx.db.patch(args.user_id, {
        status: USER_STATUS.INACTIVE,
      });

      try {
        await endNonTerminalRmAssignmentsForGuard(ctx, args.user_id, "Guard deactivated/banned");
      } catch (error) {
        console.error(
          `Failed to end RM assignments for inactive guard ${args.user_id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }

      return { success: true };
    }

    if (user.status === USER_STATUS.INACTIVE && args.status === USER_STATUS.ACTIVE) {
      await ctx.db.patch(args.user_id, {
        status: USER_STATUS.ACTIVE,
      });

      return { success: true };
    }

    if (
      (user.status === USER_STATUS.ACTIVE || user.status === USER_STATUS.INACTIVE) &&
      args.status === USER_STATUS.BANNED
    ) {
      const reason = normalizeReason(args.reason ?? "");

      await ctx.scheduler.runAfter(0, internal.actions.workos.suspendGuard, {
        workos_user_id: user.workos_user_id,
        user_id: args.user_id,
        reason,
      });

      return { success: true };
    }

    if (
      user.status === USER_STATUS.BANNED &&
      (args.status === USER_STATUS.ACTIVE || args.status === USER_STATUS.INACTIVE)
    ) {
      await ctx.scheduler.runAfter(0, internal.actions.workos.unsuspendGuard, {
        workos_user_id: user.workos_user_id,
        user_id: args.user_id,
        new_status: args.status,
      });

      return { success: true };
    }

    throw new Error(`Invalid status transition from ${user.status} to ${args.status}`);
  },
});

export const list = query({
  args: {
    persona_filter: fieldWorkerLeaderboardFilterValidator,
    society_id: v.optional(v.id("societies")),
    // Intentional: validated at runtime for flexibility
    guard_type: v.optional(v.string()),
    // Intentional: validated at runtime for flexibility
    status: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_VIEW);
    const personaFilter = args.persona_filter ?? DEFAULT_LEADERBOARD_FILTER;

    const searchText = args.search?.trim();
    const searchTextLower = searchText?.toLowerCase();
    const searchPhoneDigits = searchText?.replace(/\D/g, "");
    const guardProfiles =
      args.society_id !== undefined
        ? await ctx.db
            .query("guard_profiles")
            .withIndex("by_society_id", (q) =>
              q.eq("society_id", args.society_id as Id<"societies">),
            )
            .collect()
        : await ctx.db.query("guard_profiles").collect();
    const filteredProfiles =
      args.guard_type === undefined
        ? guardProfiles
        : guardProfiles.filter((profile) => profile.guard_type === args.guard_type);
    const societyNameById = new Map<Id<"societies">, string | null>();
    const guards: {
      user_id: Id<"users">;
      guard_profile_id: Id<"guard_profiles">;
      persona: FieldWorkerUserType;
      name: string;
      phone: string | undefined;
      status: string;
      guard_type: string;
      society_id: Id<"societies">;
      society_name: string | null;
      has_seen_onboarding: boolean;
      photo_storage_id: Id<"_storage"> | undefined;
      language_preference: "en" | "hi" | "hinglish" | undefined;
      metadata:
        | {
            languages?: string[];
            experience_years?: number;
          }
        | undefined;
      lead_count: number;
      verified_rate: number;
      _creationTime: number;
    }[] = [];

    // V1: ~50 guards, N+1 enrichment acceptable
    for (const profile of filteredProfiles) {
      const user = await ctx.db.get(profile.user_id);

      if (!user) {
        continue;
      }

      const actingPersona = user.active_persona ?? user.user_type;

      if (!matchesLeaderboardPersonaFilter(actingPersona, personaFilter)) {
        continue;
      }

      if (args.status !== undefined && user.status !== args.status) {
        continue;
      }

      if (searchTextLower !== undefined && searchTextLower.length > 0) {
        const nameMatches = user.name.toLowerCase().includes(searchTextLower);
        const phoneValue = user.phone ?? "";
        const phoneMatches =
          searchPhoneDigits !== undefined && searchPhoneDigits.length > 0
            ? phoneValue.includes(searchPhoneDigits)
            : false;

        if (!nameMatches && !phoneMatches) {
          continue;
        }
      }

      if (!societyNameById.has(profile.society_id)) {
        const society = await ctx.db.get(profile.society_id);
        societyNameById.set(profile.society_id, society?.name ?? null);
      }

      const leads = await ctx.db
        .query("leads")
        .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", user._id))
        .collect();
      const leadCount = leads.length;
      const verifiedLeadCount = leads.filter((lead) => lead.status === LEAD_STATUS.VERIFIED).length;

      guards.push({
        user_id: user._id,
        guard_profile_id: profile._id,
        persona: actingPersona,
        name: user.name,
        phone: user.phone,
        status: user.status,
        guard_type: profile.guard_type,
        society_id: profile.society_id,
        society_name: societyNameById.get(profile.society_id) ?? null,
        has_seen_onboarding: profile.has_seen_onboarding,
        photo_storage_id: profile.photo_storage_id,
        language_preference: profile.language_preference,
        metadata: profile.metadata,
        lead_count: leadCount,
        verified_rate: leadCount === 0 ? 0 : (verifiedLeadCount / leadCount) * 100,
        _creationTime: user._creationTime,
      });
    }

    return guards.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getById = query({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_VIEW);

    const user = await ctx.db.get(args.user_id);

    if (!user || !isFieldWorkerUserType((user.active_persona ?? user.user_type) as UserType)) {
      return null;
    }

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.user_id))
      .unique();

    if (!guardProfile) {
      return null;
    }

    const [society, leads, visits, payouts] = await Promise.all([
      ctx.db.get(guardProfile.society_id),
      ctx.db
        .query("leads")
        .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", args.user_id))
        .collect(),
      ctx.db
        .query("visits")
        .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", args.user_id))
        .collect(),
      ctx.db
        .query("payouts")
        .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", args.user_id))
        .collect(),
    ]);
    const leadCount = leads.length;
    const verifiedLeadCount = leads.filter((lead) => lead.status === LEAD_STATUS.VERIFIED).length;
    const visitCount = visits.length;
    const completedVisitCount = visits.filter(
      (visit) => visit.status === VISIT_STATUS.COMPLETED,
    ).length;
    const payoutTotalPaise = payouts.reduce((sum, payout) => {
      return payout.status === PAYOUT_STATUS.DISBURSED ? sum + payout.amount_paise : sum;
    }, 0);

    return {
      user_id: user._id,
      guard_profile_id: guardProfile._id,
      persona: user.active_persona ?? user.user_type,
      workos_user_id: user.workos_user_id,
      name: user.name,
      phone: user.phone,
      status: user.status,
      must_change_password: user.must_change_password,
      guard_type: guardProfile.guard_type,
      society_id: guardProfile.society_id,
      society_name: society?.name ?? null,
      has_seen_onboarding: guardProfile.has_seen_onboarding,
      photo_storage_id: guardProfile.photo_storage_id,
      language_preference: guardProfile.language_preference,
      metadata: guardProfile.metadata,
      lead_count: leadCount,
      verified_lead_count: verifiedLeadCount,
      visit_count: visitCount,
      completed_visit_count: completedVisitCount,
      payout_total_paise: payoutTotalPaise,
    };
  },
});

export const getMetrics = query({
  args: {
    guard_user_id: v.id("users"),
    time_window: v.optional(qualityTimeWindowValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.QUALITY_VIEW);

    const guardUser = await ctx.db.get(args.guard_user_id);
    if (
      !guardUser ||
      !(guardUser.user_types?.includes(USER_TYPE.GUARD) ?? guardUser.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    const timeWindow = args.time_window ?? "all_time";
    const cutoffTimestamp = getTimeWindowCutoff(timeWindow);
    const metrics = await computeMetrics(ctx, args.guard_user_id, cutoffTimestamp);
    const minimumForIncentives = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.MIN_QUALITY_SCORE_FOR_INCENTIVES,
      Number.parseInt(SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.MIN_QUALITY_SCORE_FOR_INCENTIVES]),
    );

    return {
      guard_user_id: args.guard_user_id,
      time_window: timeWindow,
      min_quality_score_for_incentives: minimumForIncentives,
      ...metrics,
    };
  },
});

export const getMyMetrics = query({
  args: {},
  handler: async (ctx) => {
    const { user: guard } = await requireFieldWorkerAuth(ctx);
    const metrics = await computeMetrics(ctx, guard._id);
    const minimumForIncentives = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.MIN_QUALITY_SCORE_FOR_INCENTIVES,
      Number.parseInt(SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.MIN_QUALITY_SCORE_FOR_INCENTIVES]),
    );

    return {
      guard_user_id: guard._id,
      time_window: "all_time" as const,
      min_quality_score_for_incentives: minimumForIncentives,
      ...metrics,
    };
  },
});

export const getRemainingLeads = query({
  args: {},
  handler: async (ctx) => {
    const { user: guard } = await requireFieldWorkerAuth(ctx);

    const startOfDayIST = getStartOfDayIST();
    const submittedToday = await ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guard._id))
      .filter((q) => q.gte(q.field("_creationTime"), startOfDayIST))
      .collect();

    const defaultLimit = Number.parseInt(
      SYSTEM_CONFIG_DEFAULTS[SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY],
      10,
    );
    const limit = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
      Number.isNaN(defaultLimit) ? 5 : defaultLimit,
    );

    return {
      submitted_today: submittedToday.length,
      limit,
      remaining: Math.max(0, limit - submittedToday.length),
    };
  },
});

export const getLeaderboard = query({
  args: {
    society_id: v.optional(v.id("societies")),
    persona_filter: fieldWorkerLeaderboardFilterValidator,
    metric: v.union(
      v.literal("verified_rate"),
      v.literal("total_submitted"),
      v.literal("completed_visits"),
      v.literal("visit_completion_rate"),
    ),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.QUALITY_VIEW);
    const personaFilter = args.persona_filter ?? DEFAULT_LEADERBOARD_FILTER;

    const guardProfiles = args.society_id
      ? await ctx.db
          .query("guard_profiles")
          .withIndex("by_society_id", (q) => q.eq("society_id", args.society_id as Id<"societies">))
          .collect()
      : await ctx.db.query("guard_profiles").collect();

    const leaderboardRows = await Promise.all(
      guardProfiles.map(async (profile) => {
        const guardUser = await ctx.db.get(profile.user_id);
        if (!guardUser) {
          return null;
        }

        const actingPersona = guardUser.active_persona ?? guardUser.user_type;

        if (!matchesLeaderboardPersonaFilter(actingPersona, personaFilter)) {
          return null;
        }

        const metrics = await computeMetrics(ctx, guardUser._id);
        const isRateMetric =
          args.metric === "verified_rate" || args.metric === "visit_completion_rate";

        if (isRateMetric && metrics.total_submitted < 5) {
          return null;
        }

        const metricValue =
          args.metric === "verified_rate"
            ? (metrics.verified_rate ?? 0)
            : args.metric === "total_submitted"
              ? metrics.total_submitted
              : args.metric === "completed_visits"
                ? metrics.completed_visits
                : (metrics.visit_completion_rate ?? 0);

        return {
          guard_user_id: guardUser._id,
          guard_name: guardUser.name,
          persona: actingPersona,
          metric_value: metricValue,
        };
      }),
    );

    const safeLimit = Math.max(1, Math.floor(args.limit));

    return leaderboardRows
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        if (b.metric_value !== a.metric_value) {
          return b.metric_value - a.metric_value;
        }

        return a.guard_name.localeCompare(b.guard_name);
      })
      .slice(0, safeLimit)
      .map((row, index) => ({
        ...row,
        rank: index + 1,
      }));
  },
});

export const search = query({
  args: {
    search: v.string(),
    persona_filter: fieldWorkerLeaderboardFilterValidator,
    society_id: v.optional(v.id("societies")),
    // Intentional: validated at runtime for flexibility
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_VIEW);
    const personaFilter = args.persona_filter ?? DEFAULT_LEADERBOARD_FILTER;

    const searchText = args.search.trim();

    if (!searchText) {
      return [];
    }

    const searchTextLower = searchText.toLowerCase();
    const searchPhonePrefixRaw = searchText.replace(/\D/g, "");
    const searchPhonePrefix =
      searchPhonePrefixRaw.length > 10 && searchPhonePrefixRaw.startsWith("91")
        ? searchPhonePrefixRaw.slice(2)
        : searchPhonePrefixRaw;
    const guardProfiles =
      args.society_id !== undefined
        ? await ctx.db
            .query("guard_profiles")
            .withIndex("by_society_id", (q) =>
              q.eq("society_id", args.society_id as Id<"societies">),
            )
            .collect()
        : await ctx.db.query("guard_profiles").collect();
    const societyNameById = new Map<Id<"societies">, string | null>();
    const results: {
      user_id: Id<"users">;
      guard_profile_id: Id<"guard_profiles">;
      persona: FieldWorkerUserType;
      name: string;
      phone: string | undefined;
      status: string;
      guard_type: string;
      society_id: Id<"societies">;
      society_name: string | null;
    }[] = [];

    for (const profile of guardProfiles) {
      if (results.length >= 50) {
        break;
      }

      const user = await ctx.db.get(profile.user_id);

      if (!user) {
        continue;
      }

      const actingPersona = user.active_persona ?? user.user_type;

      if (!matchesLeaderboardPersonaFilter(actingPersona, personaFilter)) {
        continue;
      }

      if (args.status !== undefined && user.status !== args.status) {
        continue;
      }

      const nameMatches = user.name.toLowerCase().includes(searchTextLower);
      const phoneValue = user.phone ?? "";
      const phoneMatches =
        searchPhonePrefix.length > 0 ? phoneValue.startsWith(searchPhonePrefix) : false;

      if (!nameMatches && !phoneMatches) {
        continue;
      }

      if (!societyNameById.has(profile.society_id)) {
        const society = await ctx.db.get(profile.society_id);
        societyNameById.set(profile.society_id, society?.name ?? null);
      }

      results.push({
        user_id: user._id,
        guard_profile_id: profile._id,
        persona: actingPersona,
        name: user.name,
        phone: user.phone,
        status: user.status,
        guard_type: profile.guard_type,
        society_id: profile.society_id,
        society_name: societyNameById.get(profile.society_id) ?? null,
      });
    }

    return results;
  },
});

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireFieldWorkerAuth(ctx);

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .unique();

    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }

    const [society, photoUrl] = await Promise.all([
      ctx.db.get(guardProfile.society_id),
      guardProfile.photo_storage_id ? ctx.storage.getUrl(guardProfile.photo_storage_id) : null,
    ]);

    return {
      user_id: user._id,
      guard_profile_id: guardProfile._id,
      name: user.name,
      phone: user.phone,
      status: user.status,
      must_change_password: user.must_change_password,
      guard_type: guardProfile.guard_type,
      society_id: guardProfile.society_id,
      society_name: society?.name ?? null,
      has_seen_onboarding: guardProfile.has_seen_onboarding,
      photo_storage_id: guardProfile.photo_storage_id,
      photo_url: photoUrl,
      language_preference: guardProfile.language_preference,
      metadata: guardProfile.metadata,
      badges: [],
    };
  },
});

export const recordFingerprint = mutation({
  args: {
    fingerprint: v.string(),
    ip: v.optional(v.string()),
    device_label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const guard = await requireGuardAuth(ctx);
    const fingerprint = args.fingerprint.trim();

    if (!fingerprint) {
      throw new Error("Fingerprint is required");
    }

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", guard._id))
      .unique();

    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }

    const now = Date.now();
    const rawFingerprints = guardProfile.browser_fingerprints ?? [];

    // Normalize pre-migration entries that lack first_seen / have required ip
    const existingFingerprints = rawFingerprints.map((entry) => ({
      fingerprint: entry.fingerprint,
      first_seen: entry.first_seen ?? entry.last_seen,
      last_seen: entry.last_seen,
      flagged: entry.flagged,
      ip: entry.ip,
      device_label: entry.device_label,
    }));

    const existingIndex = existingFingerprints.findIndex(
      (entry) => entry.fingerprint === fingerprint,
    );
    const isFirstFingerprint = existingFingerprints.length === 0;
    const isNewDevice = existingIndex === -1;

    const updatedFingerprints = isNewDevice
      ? [
          ...existingFingerprints,
          {
            fingerprint,
            first_seen: now,
            last_seen: now,
            flagged: !isFirstFingerprint,
            ip: args.ip,
            device_label: args.device_label,
          },
        ]
      : existingFingerprints.map((entry, index) =>
          index === existingIndex
            ? {
                ...entry,
                last_seen: now,
                ip: args.ip ?? entry.ip,
                device_label: args.device_label ?? entry.device_label,
              }
            : entry,
        );

    await ctx.db.patch(guardProfile._id, {
      browser_fingerprints: updatedFingerprints,
    });

    return null;
  },
});

export const getFingerprintHistory = query({
  args: {
    guard_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_VIEW);

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.guard_user_id))
      .unique();

    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }

    return guardProfile.browser_fingerprints ?? [];
  },
});

export const getInFlightItems = query({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.GUARDS_VIEW);

    const user = await ctx.db.get(args.user_id);

    if (
      !user ||
      !(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    const pendingVisits = await ctx.db
      .query("visits")
      .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", args.user_id))
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), VISIT_STATUS.COMPLETED),
          q.neq(q.field("status"), VISIT_STATUS.CANCELLED),
          q.neq(q.field("status"), VISIT_STATUS.NO_SHOW),
        ),
      )
      .collect();

    const activeLeads = await ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", args.user_id))
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), LEAD_STATUS.REJECTED),
          q.neq(q.field("status"), LEAD_STATUS.DUPLICATE),
        ),
      )
      .collect();

    return {
      pending_visits: pendingVisits.length,
      active_leads: activeLeads.length,
    };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (!(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)) {
      throw new Error("Guard access required");
    }

    await rateLimiter.limit(ctx, "guard:upload_url_generation", {
      key: user._id,
      throws: true,
    });

    return await ctx.storage.generateUploadUrl();
  },
});

export const updateMyPhoto = mutation({
  args: {
    storage_id: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (!(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)) {
      throw new Error("Guard access required");
    }

    await validateStoredFile(ctx, args.storage_id, {
      fieldName: "storage_id",
      allowedContentTypes: ALLOWED_IMAGE_CONTENT_TYPES,
      allowedLabel: "JPEG, PNG, and WebP",
    });

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .unique();
    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }
    await ctx.db.patch(guardProfile._id, { photo_storage_id: args.storage_id });
    return null;
  },
});

export const updateMyLanguage = mutation({
  args: {
    language: v.union(v.literal("en"), v.literal("hi"), v.literal("hinglish")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (!(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)) {
      throw new Error("Guard access required");
    }
    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .unique();
    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }
    await ctx.db.patch(guardProfile._id, { language_preference: args.language });
    return null;
  },
});

export const setMustChangePassword = internalMutation({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);

    if (
      !user ||
      !(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    await ctx.db.patch(args.user_id, {
      must_change_password: true,
    });

    return { success: true };
  },
});

export const clearMustChangePassword = internalMutation({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);

    if (
      !user ||
      !(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    await ctx.db.patch(args.user_id, {
      must_change_password: false,
    });

    return { success: true };
  },
});

export const banGuardInternal = internalMutation({
  args: {
    user_id: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);

    if (
      !user ||
      !(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    normalizeReason(args.reason);

    await ctx.db.patch(args.user_id, {
      status: USER_STATUS.BANNED,
    });

    const pendingVisits = await ctx.db
      .query("visits")
      .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", args.user_id))
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), VISIT_STATUS.COMPLETED),
          q.neq(q.field("status"), VISIT_STATUS.CANCELLED),
          q.neq(q.field("status"), VISIT_STATUS.NO_SHOW),
        ),
      )
      .collect();

    await Promise.all(
      pendingVisits.map(async (visit) => {
        await ctx.db.patch(visit._id, {
          needs_reassignment: true,
        });
      }),
    );

    try {
      await endNonTerminalRmAssignmentsForGuard(ctx, args.user_id, "Guard deactivated/banned");
    } catch (error) {
      console.error(
        `Failed to end RM assignments for banned guard ${args.user_id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    return { success: true };
  },
});

export const dismissOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (!(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)) {
      throw new Error("Guard access required");
    }
    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .unique();
    if (!guardProfile) {
      throw new Error("Guard profile not found");
    }
    await ctx.db.patch(guardProfile._id, { has_seen_onboarding: true });
    return null;
  },
});

export const updateStatusInternal = internalMutation({
  args: {
    user_id: v.id("users"),
    status: activeInactiveStatusValidator,
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);

    if (
      !user ||
      !(user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD)
    ) {
      throw new Error("Guard not found");
    }

    await ctx.db.patch(args.user_id, {
      status: args.status,
    });

    return { success: true };
  },
});
