import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  PERMISSIONS,
  RM_ASSIGNED_BY,
  RM_ASSIGNMENT_STATUS,
  RM_CHECK_IN_METHOD,
  RM_CHECK_IN_OUTCOME,
  RM_CHECK_IN_TYPE,
  RM_STATUS_TRANSITIONS,
  type RmAssignmentStatus,
} from "../lib/constants";
import { requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./functions";
import { getActiveUnmergedOwner, setCurrentRmAssignment, updateLastActivity } from "./owners";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHECK_IN_FREQUENCY_DAYS = 30;

const rmAssignmentStatusValidator = v.union(
  v.literal(RM_ASSIGNMENT_STATUS.ACTIVE),
  v.literal(RM_ASSIGNMENT_STATUS.WARNING),
  v.literal(RM_ASSIGNMENT_STATUS.ESCALATED),
  v.literal(RM_ASSIGNMENT_STATUS.REASSIGNED),
  v.literal(RM_ASSIGNMENT_STATUS.ENDED),
);

const rmAssignedByValidator = v.union(
  v.literal(RM_ASSIGNED_BY.SYSTEM),
  v.literal(RM_ASSIGNED_BY.ADMIN),
);

const rmCheckInTypeValidator = v.union(
  v.literal(RM_CHECK_IN_TYPE.SCHEDULED),
  v.literal(RM_CHECK_IN_TYPE.ISSUE),
  v.literal(RM_CHECK_IN_TYPE.RE_LISTING),
  v.literal(RM_CHECK_IN_TYPE.OWNER_INITIATED),
  v.literal(RM_CHECK_IN_TYPE.AD_HOC),
);

const rmCheckInMethodValidator = v.union(
  v.literal(RM_CHECK_IN_METHOD.CALL),
  v.literal(RM_CHECK_IN_METHOD.WHATSAPP),
  v.literal(RM_CHECK_IN_METHOD.IN_PERSON),
  v.literal(RM_CHECK_IN_METHOD.OTHER),
);

const rmCheckInOutcomeValidator = v.union(
  v.literal(RM_CHECK_IN_OUTCOME.RESOLVED),
  v.literal(RM_CHECK_IN_OUTCOME.PENDING),
  v.literal(RM_CHECK_IN_OUTCOME.ESCALATED),
);

const ACTIVE_DASHBOARD_STATUSES = [
  RM_ASSIGNMENT_STATUS.ACTIVE,
  RM_ASSIGNMENT_STATUS.WARNING,
  RM_ASSIGNMENT_STATUS.ESCALATED,
] as const;

const dueWindowValidator = v.union(
  v.literal("OVERDUE"),
  v.literal("DUE_7_DAYS"),
  v.literal("DUE_30_DAYS"),
);

type ActiveDashboardStatus = (typeof ACTIVE_DASHBOARD_STATUSES)[number];
type DueWindow = "OVERDUE" | "DUE_7_DAYS" | "DUE_30_DAYS";

type RmAssignmentDoc = Doc<"owner_rm_assignments">;

function isTerminalAssignmentStatus(status: RmAssignmentStatus): boolean {
  return status === RM_ASSIGNMENT_STATUS.REASSIGNED || status === RM_ASSIGNMENT_STATUS.ENDED;
}

function validateRmTransition(
  currentStatus: RmAssignmentStatus,
  nextStatus: RmAssignmentStatus,
): boolean {
  return (RM_STATUS_TRANSITIONS[currentStatus] ?? []).includes(nextStatus);
}

function parseOffsetCursor(cursor: string | null): number {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function normalizeReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) {
    throw new Error("Reassignment reason is required");
  }

  return normalized;
}

async function ensureOwnerExists(ctx: MutationCtx, ownerId: Id<"owners">): Promise<void> {
  const owner = await ctx.db.get(ownerId);
  if (!owner || owner.is_deleted) {
    throw new Error("Owner not found");
  }
}

async function ensureGuardProfileAndUserActive(
  ctx: MutationCtx,
  rmGuardId: Id<"guard_profiles">,
  rmUserId: Id<"users">,
): Promise<void> {
  const guardProfile = await ctx.db.get(rmGuardId);
  if (!guardProfile) {
    throw new Error("Guard profile not found");
  }

  if (guardProfile.user_id !== rmUserId) {
    throw new Error("rm_user_id must match the guard profile user_id");
  }

  const guardUser = await ctx.db.get(rmUserId);
  if (!guardUser || guardUser.user_type !== "GUARD") {
    throw new Error("RM user not found or is not a guard");
  }

  if (guardUser.status !== "ACTIVE") {
    throw new Error("RM guard must be active");
  }
}

async function ensureNoActiveAssignmentForOwner(
  ctx: MutationCtx,
  ownerId: Id<"owners">,
  ignoreAssignmentId?: Id<"owner_rm_assignments">,
): Promise<void> {
  const assignments = await ctx.db
    .query("owner_rm_assignments")
    .withIndex("by_owner", (q) => q.eq("owner_id", ownerId))
    .collect();

  const nonTerminalWithoutIgnored = assignments.filter(
    (assignment) =>
      assignment._id !== ignoreAssignmentId &&
      (assignment.status === RM_ASSIGNMENT_STATUS.ACTIVE ||
        assignment.status === RM_ASSIGNMENT_STATUS.WARNING ||
        assignment.status === RM_ASSIGNMENT_STATUS.ESCALATED),
  );
  if (nonTerminalWithoutIgnored.length > 0) {
    throw new Error("Owner already has a non-terminal RM assignment");
  }
}

async function createAssignmentRecord(
  ctx: MutationCtx,
  args: {
    owner_id: Id<"owners">;
    rm_guard_id: Id<"guard_profiles">;
    rm_user_id: Id<"users">;
    source_closure_id?: Id<"closures">;
    assigned_by: "SYSTEM" | "ADMIN";
    assigned_by_admin_id?: Id<"users">;
  },
): Promise<Id<"owner_rm_assignments">> {
  await ensureOwnerExists(ctx, args.owner_id);
  await ensureGuardProfileAndUserActive(ctx, args.rm_guard_id, args.rm_user_id);
  await ensureNoActiveAssignmentForOwner(ctx, args.owner_id);

  if (args.assigned_by === RM_ASSIGNED_BY.ADMIN && !args.assigned_by_admin_id) {
    throw new Error("assigned_by_admin_id is required when assigned_by is ADMIN");
  }

  const now = Date.now();
  const assignmentId = await ctx.db.insert("owner_rm_assignments", {
    owner_id: args.owner_id,
    rm_guard_id: args.rm_guard_id,
    rm_user_id: args.rm_user_id,
    source_closure_id: args.source_closure_id,
    assigned_by: args.assigned_by,
    assigned_by_admin_id: args.assigned_by_admin_id,
    status: RM_ASSIGNMENT_STATUS.ACTIVE,
    last_check_in_at: undefined,
    next_check_in_due: now + DEFAULT_CHECK_IN_FREQUENCY_DAYS * DAY_MS,
    check_in_frequency_days: DEFAULT_CHECK_IN_FREQUENCY_DAYS,
    missed_check_ins_count: 0,
    performance_score: undefined,
    sla_breach_count: 0,
    last_sla_breach_at: undefined,
    escalation_level: 0,
    reassigned_at: undefined,
    reassigned_to_guard_id: undefined,
    reassignment_reason: undefined,
    created_at: now,
    updated_at: now,
  });

  await setCurrentRmAssignment(ctx, args.owner_id, args.rm_user_id, args.rm_guard_id);

  return assignmentId;
}

export const createAssignment = mutation({
  args: {
    owner_id: v.id("owners"),
    rm_guard_id: v.id("guard_profiles"),
    rm_user_id: v.id("users"),
    source_closure_id: v.optional(v.id("closures")),
    assigned_by: rmAssignedByValidator,
    assigned_by_admin_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const actingUser = await requirePermission(ctx, PERMISSIONS.RM_MANAGE);

    if (args.assigned_by !== RM_ASSIGNED_BY.ADMIN) {
      throw new Error("SYSTEM assignments must use the internal RM assignment mutation");
    }

    if (args.assigned_by_admin_id && args.assigned_by_admin_id !== actingUser._id) {
      throw new Error("assigned_by_admin_id must match the authenticated user");
    }

    const assignmentId = await createAssignmentRecord(ctx, {
      ...args,
      assigned_by: RM_ASSIGNED_BY.ADMIN,
      assigned_by_admin_id: actingUser._id,
    });

    return await ctx.db.get(assignmentId);
  },
});

export const createAssignmentInternal = internalMutation({
  args: {
    owner_id: v.id("owners"),
    rm_guard_id: v.id("guard_profiles"),
    rm_user_id: v.id("users"),
    source_closure_id: v.optional(v.id("closures")),
  },
  handler: async (ctx, args) => {
    const assignmentId = await createAssignmentRecord(ctx, {
      ...args,
      assigned_by: RM_ASSIGNED_BY.SYSTEM,
      assigned_by_admin_id: undefined,
    });

    return await ctx.db.get(assignmentId);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("owner_rm_assignments"),
    new_status: rmAssignmentStatusValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.RM_MANAGE);

    if (args.new_status === RM_ASSIGNMENT_STATUS.REASSIGNED) {
      throw new Error(
        "Cannot transition to REASSIGNED directly. Use the reassign mutation instead.",
      );
    }

    const assignment = await ctx.db.get(args.id);
    if (!assignment) {
      throw new Error("RM assignment not found");
    }

    if (assignment.status === args.new_status) {
      return assignment;
    }

    if (!validateRmTransition(assignment.status, args.new_status)) {
      throw new Error(
        `Invalid RM assignment transition: ${assignment.status} -> ${args.new_status}`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.new_status,
      updated_at: now,
    });

    if (args.new_status === RM_ASSIGNMENT_STATUS.ENDED) {
      await setCurrentRmAssignment(ctx, assignment.owner_id, undefined, undefined);
    } else {
      await updateLastActivity(ctx, assignment.owner_id);
    }

    return await ctx.db.get(args.id);
  },
});

export const reassign = mutation({
  args: {
    assignment_id: v.id("owner_rm_assignments"),
    new_rm_guard_id: v.id("guard_profiles"),
    new_rm_user_id: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const [actingUser] = await Promise.all([
      requirePermission(ctx, PERMISSIONS.RM_REASSIGN),
      requirePermission(ctx, PERMISSIONS.GUARDS_VIEW),
    ]);
    const currentAssignment = await ctx.db.get(args.assignment_id);

    if (!currentAssignment) {
      throw new Error("RM assignment not found");
    }

    if (
      currentAssignment.status === RM_ASSIGNMENT_STATUS.REASSIGNED ||
      currentAssignment.status === RM_ASSIGNMENT_STATUS.ENDED
    ) {
      throw new Error("Cannot reassign a terminal RM assignment");
    }

    if (!validateRmTransition(currentAssignment.status, RM_ASSIGNMENT_STATUS.REASSIGNED)) {
      throw new Error(
        `Invalid RM assignment transition: ${currentAssignment.status} -> REASSIGNED`,
      );
    }

    if (currentAssignment.rm_guard_id === args.new_rm_guard_id) {
      throw new Error("New RM must be different from current RM");
    }

    await ensureGuardProfileAndUserActive(ctx, args.new_rm_guard_id, args.new_rm_user_id);

    const reassignmentReason = normalizeReason(args.reason);
    const now = Date.now();

    await ctx.db.patch(args.assignment_id, {
      status: RM_ASSIGNMENT_STATUS.REASSIGNED,
      reassigned_at: now,
      reassigned_to_guard_id: args.new_rm_guard_id,
      reassignment_reason: reassignmentReason,
      updated_at: now,
    });

    const newAssignmentId = await createAssignmentRecord(ctx, {
      owner_id: currentAssignment.owner_id,
      rm_guard_id: args.new_rm_guard_id,
      rm_user_id: args.new_rm_user_id,
      source_closure_id: currentAssignment.source_closure_id,
      assigned_by: RM_ASSIGNED_BY.ADMIN,
      assigned_by_admin_id: actingUser._id,
    });

    return {
      previous_assignment_id: args.assignment_id,
      new_assignment: await ctx.db.get(newAssignmentId),
    };
  },
});

export const getById = internalQuery({
  args: {
    id: v.id("owner_rm_assignments"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.RM_VIEW);
    return await ctx.db.get(args.id);
  },
});

export const listByOwner = query({
  args: {
    owner_id: v.id("owners"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.RM_VIEW);
    const owner = await getActiveUnmergedOwner(ctx, args.owner_id);
    if (!owner) {
      return [];
    }

    const assignments = await ctx.db
      .query("owner_rm_assignments")
      .withIndex("by_owner", (q) => q.eq("owner_id", owner._id))
      .collect();

    return assignments.sort((a, b) => b.created_at - a.created_at);
  },
});

export const listByRm = internalQuery({
  args: {
    rm_guard_id: v.id("guard_profiles"),
    status: v.optional(rmAssignmentStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.RM_VIEW);

    if (args.status) {
      return await ctx.db
        .query("owner_rm_assignments")
        .withIndex("by_rm", (q) => q.eq("rm_guard_id", args.rm_guard_id).eq("status", args.status!))
        .collect();
    }

    return await ctx.db
      .query("owner_rm_assignments")
      .withIndex("by_rm", (q) => q.eq("rm_guard_id", args.rm_guard_id))
      .collect();
  },
});

function isActiveDashboardStatus(status: string): status is ActiveDashboardStatus {
  return ACTIVE_DASHBOARD_STATUSES.includes(status as ActiveDashboardStatus);
}

function sortActiveAssignmentsForDashboard(assignments: RmAssignmentDoc[]): RmAssignmentDoc[] {
  return assignments.sort((a, b) => {
    const aDue = a.next_check_in_due ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.next_check_in_due ?? Number.MAX_SAFE_INTEGER;

    if (aDue !== bDue) {
      return aDue - bDue;
    }

    return b.updated_at - a.updated_at;
  });
}

function filterByDueWindow(
  assignments: RmAssignmentDoc[],
  dueWindow: DueWindow,
): RmAssignmentDoc[] {
  const now = Date.now();
  const sevenDaysFromNow = now + 7 * DAY_MS;
  const thirtyDaysFromNow = now + 30 * DAY_MS;

  return assignments.filter((assignment) => {
    if (assignment.next_check_in_due === undefined) {
      return false;
    }

    if (dueWindow === "OVERDUE") {
      return assignment.next_check_in_due < now;
    }

    if (dueWindow === "DUE_7_DAYS") {
      return (
        assignment.next_check_in_due >= now && assignment.next_check_in_due <= sevenDaysFromNow
      );
    }

    return assignment.next_check_in_due >= now && assignment.next_check_in_due <= thirtyDaysFromNow;
  });
}

export const listActive = query({
  args: {
    status_filter: v.optional(v.string()),
    rm_guard_id: v.optional(v.id("guard_profiles")),
    due_window: v.optional(dueWindowValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.RM_VIEW);
    const offset = parseOffsetCursor(args.paginationOpts.cursor);

    let statusesToFetch: ActiveDashboardStatus[];
    if (args.status_filter) {
      if (isActiveDashboardStatus(args.status_filter)) {
        statusesToFetch = [args.status_filter];
      } else {
        throw new Error("status_filter must be one of ACTIVE, WARNING, ESCALATED");
      }
    } else {
      statusesToFetch = [...ACTIVE_DASHBOARD_STATUSES];
    }

    const assignmentBuckets = await Promise.all(
      statusesToFetch.map((status) => {
        if (args.rm_guard_id) {
          return ctx.db
            .query("owner_rm_assignments")
            .withIndex("by_rm", (q) => q.eq("rm_guard_id", args.rm_guard_id!).eq("status", status))
            .collect();
        }

        return ctx.db
          .query("owner_rm_assignments")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect();
      }),
    );

    const mergedAssignments = assignmentBuckets.flat();
    const dueFiltered = args.due_window
      ? filterByDueWindow(mergedAssignments, args.due_window)
      : mergedAssignments;
    const merged = sortActiveAssignmentsForDashboard(dueFiltered);
    const page = merged.slice(offset, offset + args.paginationOpts.numItems);
    const nextOffset = offset + page.length;

    return {
      page,
      isDone: nextOffset >= merged.length,
      continueCursor: nextOffset >= merged.length ? "" : String(nextOffset),
    } as PaginationResult<RmAssignmentDoc>;
  },
});

export const createCheckIn = mutation({
  args: {
    assignment_id: v.id("owner_rm_assignments"),
    check_in_type: rmCheckInTypeValidator,
    method: rmCheckInMethodValidator,
    summary: v.string(),
    outcome: rmCheckInOutcomeValidator,
    owner_satisfaction: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.RM_CHECK_IN);

    const assignment = await ctx.db.get(args.assignment_id);
    if (!assignment) {
      throw new Error("RM assignment not found");
    }

    if (
      assignment.status === RM_ASSIGNMENT_STATUS.REASSIGNED ||
      assignment.status === RM_ASSIGNMENT_STATUS.ENDED
    ) {
      throw new Error("Cannot create check-in for terminal RM assignments");
    }

    const summary = args.summary.trim();
    if (!summary) {
      throw new Error("Check-in summary is required");
    }

    if (args.owner_satisfaction !== undefined) {
      if (
        !Number.isInteger(args.owner_satisfaction) ||
        args.owner_satisfaction < 1 ||
        args.owner_satisfaction > 5
      ) {
        throw new Error("owner_satisfaction must be an integer between 1 and 5");
      }
    }

    const now = Date.now();
    const checkInId = await ctx.db.insert("rm_check_ins", {
      assignment_id: assignment._id,
      owner_id: assignment.owner_id,
      rm_guard_id: assignment.rm_guard_id,
      check_in_type: args.check_in_type,
      method: args.method,
      summary,
      outcome: args.outcome,
      owner_satisfaction: args.owner_satisfaction,
      created_at: now,
    });

    const patch: Partial<
      Pick<
        RmAssignmentDoc,
        | "last_check_in_at"
        | "next_check_in_due"
        | "missed_check_ins_count"
        | "status"
        | "escalation_level"
        | "updated_at"
      >
    > = {
      last_check_in_at: now,
      next_check_in_due: now + assignment.check_in_frequency_days * DAY_MS,
      missed_check_ins_count: 0,
      updated_at: now,
    };

    if (args.outcome === RM_CHECK_IN_OUTCOME.ESCALATED) {
      if (
        assignment.status !== RM_ASSIGNMENT_STATUS.ESCALATED &&
        validateRmTransition(assignment.status, RM_ASSIGNMENT_STATUS.ESCALATED)
      ) {
        patch.status = RM_ASSIGNMENT_STATUS.ESCALATED;
      }
      patch.escalation_level = Math.max(assignment.escalation_level, 2);
    } else if (
      assignment.status === RM_ASSIGNMENT_STATUS.WARNING &&
      validateRmTransition(assignment.status, RM_ASSIGNMENT_STATUS.ACTIVE)
    ) {
      patch.status = RM_ASSIGNMENT_STATUS.ACTIVE;
      patch.escalation_level = 0;
    }

    await ctx.db.patch(assignment._id, patch);
    await updateLastActivity(ctx, assignment.owner_id);

    return await ctx.db.get(checkInId);
  },
});

export const processSlaBreach = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const idempotencyWindowStart = now - DAY_MS;

    const overdueAssignments = await ctx.db
      .query("owner_rm_assignments")
      .withIndex("by_next_check_in", (q) => q.lt("next_check_in_due", now))
      .collect();

    let breachCount = 0;

    for (const assignment of overdueAssignments) {
      if (isTerminalAssignmentStatus(assignment.status)) {
        continue;
      }

      if (
        assignment.status !== RM_ASSIGNMENT_STATUS.ACTIVE &&
        assignment.status !== RM_ASSIGNMENT_STATUS.WARNING
      ) {
        continue;
      }

      if (
        assignment.last_sla_breach_at !== undefined &&
        assignment.last_sla_breach_at >= idempotencyWindowStart
      ) {
        continue;
      }

      await ctx.db.patch(assignment._id, {
        missed_check_ins_count: assignment.missed_check_ins_count + 1,
        sla_breach_count: assignment.sla_breach_count + 1,
        last_sla_breach_at: now,
        updated_at: now,
      });
      breachCount += 1;
    }

    return { breachCount, processedAt: now };
  },
});

export const recalculatePerformanceScores = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * DAY_MS;
    const assignmentsToScore: RmAssignmentDoc[] = [];

    for (const status of ACTIVE_DASHBOARD_STATUSES) {
      const assignments = await ctx.db
        .query("owner_rm_assignments")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      assignmentsToScore.push(...assignments);
    }

    let scored = 0;

    for (const assignment of assignmentsToScore) {
      if (isTerminalAssignmentStatus(assignment.status)) {
        continue;
      }

      const checkIns = await ctx.db
        .query("rm_check_ins")
        .withIndex("by_assignment", (q) => q.eq("assignment_id", assignment._id))
        .collect();

      let resolvedRecent = 0;
      for (const checkIn of checkIns) {
        if (
          checkIn.outcome === RM_CHECK_IN_OUTCOME.RESOLVED &&
          checkIn.created_at > ninetyDaysAgo
        ) {
          resolvedRecent += 1;
        }
      }

      let score = 100;
      score -= Math.min(assignment.missed_check_ins_count * 10, 50);
      score -= Math.min(assignment.sla_breach_count * 15, 45);
      score += Math.min(resolvedRecent * 5, 20);
      score = Math.max(0, Math.min(100, score));

      await ctx.db.patch(assignment._id, {
        performance_score: score,
        updated_at: now,
      });
      scored += 1;
    }

    return { scored, processedAt: now };
  },
});

export const escalateWarnings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const activeAssignments = await ctx.db
      .query("owner_rm_assignments")
      .withIndex("by_status", (q) => q.eq("status", RM_ASSIGNMENT_STATUS.ACTIVE))
      .collect();

    const warningAssignments = await ctx.db
      .query("owner_rm_assignments")
      .withIndex("by_status", (q) => q.eq("status", RM_ASSIGNMENT_STATUS.WARNING))
      .collect();

    let warned = 0;
    let escalated = 0;

    for (const assignment of warningAssignments) {
      if (isTerminalAssignmentStatus(assignment.status)) {
        continue;
      }

      const shouldEscalate =
        assignment.missed_check_ins_count >= 3 ||
        (assignment.performance_score !== undefined && assignment.performance_score < 40);

      if (!shouldEscalate) {
        continue;
      }

      if (!validateRmTransition(assignment.status, RM_ASSIGNMENT_STATUS.ESCALATED)) {
        continue;
      }

      await ctx.db.patch(assignment._id, {
        status: RM_ASSIGNMENT_STATUS.ESCALATED,
        escalation_level: 2,
        updated_at: now,
      });
      escalated += 1;
    }

    for (const assignment of activeAssignments) {
      if (isTerminalAssignmentStatus(assignment.status)) {
        continue;
      }

      const shouldWarn =
        assignment.missed_check_ins_count >= 2 ||
        (assignment.performance_score !== undefined && assignment.performance_score < 60);

      if (!shouldWarn) {
        continue;
      }

      if (!validateRmTransition(assignment.status, RM_ASSIGNMENT_STATUS.WARNING)) {
        continue;
      }

      await ctx.db.patch(assignment._id, {
        status: RM_ASSIGNMENT_STATUS.WARNING,
        escalation_level: Math.max(assignment.escalation_level, 1),
        updated_at: now,
      });
      warned += 1;
    }

    return { warned, escalated, processedAt: now };
  },
});

export const listCheckIns = query({
  args: {
    assignment_id: v.optional(v.id("owner_rm_assignments")),
    owner_id: v.optional(v.id("owners")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.RM_VIEW);

    const hasAssignmentId = args.assignment_id !== undefined;
    const hasOwnerId = args.owner_id !== undefined;

    if (hasAssignmentId === hasOwnerId) {
      throw new Error("Provide exactly one of assignment_id or owner_id");
    }

    if (hasOwnerId) {
      const owner = await getActiveUnmergedOwner(ctx, args.owner_id!);
      if (!owner) {
        return [];
      }

      const ownerCheckIns = await ctx.db
        .query("rm_check_ins")
        .withIndex("by_owner", (q) => q.eq("owner_id", owner._id))
        .collect();

      return ownerCheckIns.sort((a, b) => b.created_at - a.created_at);
    }

    const checkIns = await ctx.db
      .query("rm_check_ins")
      .withIndex("by_assignment", (q) => q.eq("assignment_id", args.assignment_id!))
      .collect();

    return checkIns.sort((a, b) => b.created_at - a.created_at);
  },
});
