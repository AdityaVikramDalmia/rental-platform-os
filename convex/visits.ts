import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  CHECKLIST_DEPTH,
  CHECKLIST_STATUS,
  CONTRIBUTION_SOURCE_ENTITY,
  CONTRIBUTION_STAGE,
  INCENTIVE_PERSONA,
  LEAD_STATUS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  PERMISSIONS,
  SHIFT_TYPE,
  TENANT_INQUIRY_STATUS,
  USER_STATUS,
  USER_TYPE,
  VISIT_OUTCOME,
  VISIT_STATUS,
  XP_AWARDS,
  type VisitStatus,
} from "../lib/constants";
import {
  requireAnyPermission,
  requireFieldWorker,
  requirePermission,
  requireTenant,
} from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { FIELD_WORKER_USER_TYPES } from "./fieldWorkerContracts";
import { mutation, query } from "./functions";
import { validateTenantInquiryTransition } from "./tenantInquiries";

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const CONFLICT_WINDOW_MS = 2 * 60 * 60 * 1000;

const visitStatusValidator = v.union(
  v.literal(VISIT_STATUS.ASSIGNED),
  v.literal(VISIT_STATUS.CONFIRMED),
  v.literal(VISIT_STATUS.IN_PROGRESS),
  v.literal(VISIT_STATUS.COMPLETED),
  v.literal(VISIT_STATUS.CANCELLED),
  v.literal(VISIT_STATUS.NO_SHOW),
);

const visitOutcomeValidator = v.union(
  v.literal(VISIT_OUTCOME.INTERESTED),
  v.literal(VISIT_OUTCOME.NOT_INTERESTED),
  v.literal(VISIT_OUTCOME.FOLLOWUP),
);

const checklistDepthValidator = v.union(
  v.literal(CHECKLIST_DEPTH.LIGHT),
  v.literal(CHECKLIST_DEPTH.MEDIUM),
  v.literal(CHECKLIST_DEPTH.FULL),
);

type VisitDoc = Doc<"visits">;
type GuardAvailabilityIndicator =
  | "ON_SHIFT_SAME_BUILDING"
  | "ON_SHIFT_DIFFERENT_LOCATION"
  | "OFF_DUTY"
  | "INACTIVE"
  | "BANNED";

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Guard";
  }

  const [firstName] = trimmed.split(/\s+/);
  return firstName ?? trimmed;
}

function getStartOfDayIST(ms: number): number {
  const istMs = ms + IST_OFFSET_MS;
  const dayStart = Math.floor(istMs / DAY_MS) * DAY_MS;
  return dayStart - IST_OFFSET_MS;
}

function getDayOfWeekIST(ms: number): number {
  return new Date(ms + IST_OFFSET_MS).getUTCDay();
}

function getMinutesOfDayIST(ms: number): number {
  const istMs = ms + IST_OFFSET_MS;
  const timeOfDay = ((istMs % DAY_MS) + DAY_MS) % DAY_MS;
  return Math.floor(timeOfDay / MINUTE_MS);
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return -1;
  }

  return hours * 60 + minutes;
}

function shiftsOverlap(
  shiftStartMinutes: number,
  shiftEndMinutes: number,
  visitStartMinutes: number,
  visitEndMinutes: number,
): boolean {
  if (shiftStartMinutes < 0 || shiftEndMinutes <= shiftStartMinutes) {
    return false;
  }

  return shiftStartMinutes < visitEndMinutes && shiftEndMinutes > visitStartMinutes;
}

function isTerminalVisitStatus(status: VisitStatus): boolean {
  return (
    status === VISIT_STATUS.COMPLETED ||
    status === VISIT_STATUS.CANCELLED ||
    status === VISIT_STATUS.NO_SHOW
  );
}

function getVisitCompletionNextStep(outcome: Doc<"visits">["outcome"]): string {
  if (outcome === VISIT_OUTCOME.INTERESTED) {
    return "Advance to negotiation or closure";
  }

  if (outcome === VISIT_OUTCOME.FOLLOWUP) {
    return "Schedule a follow-up visit";
  }

  return "Mark inquiry as not interested and archive";
}

async function notifyBackofficeOnVisitCompleted(
  ctx: MutationCtx,
  args: {
    visit: VisitDoc;
    outcome: Doc<"visits">["outcome"];
  },
): Promise<void> {
  const [lead, activeUsers] = await Promise.all([
    ctx.db.get(args.visit.lead_id),
    ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", USER_STATUS.ACTIVE))
      .collect(),
  ]);

  const building = lead ? await ctx.db.get(lead.building_id) : null;
  const nextStep = getVisitCompletionNextStep(args.outcome);
  const flatNumber = lead?.flat_number ?? "Unknown";

  const backofficeRecipients = activeUsers.filter(
    (user) => user.user_type === USER_TYPE.ADMIN || user.user_type === USER_TYPE.OPS,
  );

  for (const recipient of backofficeRecipients) {
    try {
      await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
        user_id: recipient._id,
        event_type: "visit_completed",
        category: NOTIFICATION_CATEGORY.VISIT_UPDATE,
        severity: NOTIFICATION_SEVERITY.NORMAL,
        payload: {
          flat_number: flatNumber,
          building_name: building?.name ?? "Unknown building",
          visit_outcome: args.outcome,
          next_step: nextStep,
        },
        dedup_key: `visit:${args.visit._id}:completed:${recipient._id}`,
        action_url: recipient.user_type === USER_TYPE.OPS ? "/ops/visits" : "/admin/visits",
      });
    } catch (error) {
      console.error("Failed to enqueue visit completed notification (non-blocking):", error);
    }
  }
}

async function ensureActiveGuardInSociety(
  ctx: QueryCtx | MutationCtx,
  guardId: Id<"users">,
  societyId: Id<"societies">,
): Promise<void> {
  const guard = await ctx.db.get(guardId);

  if (!guard || !FIELD_WORKER_USER_TYPES.some((userType) => userType === guard.user_type)) {
    throw new Error("Assigned field worker not found");
  }

  if (guard.status !== USER_STATUS.ACTIVE) {
    throw new Error(`Cannot assign a field worker with status: ${guard.status}`);
  }

  const guardProfile = await ctx.db
    .query("guard_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", guardId))
    .unique();

  if (!guardProfile) {
    throw new Error("Field worker profile not found");
  }

  if (guardProfile.society_id !== societyId) {
    throw new Error("Assigned field worker must belong to the same society as the lead");
  }
}

async function getVisitContext(
  ctx: QueryCtx | MutationCtx,
  visit: VisitDoc,
): Promise<{
  lead: Doc<"leads"> | null;
  building: Doc<"buildings"> | null;
  society: Doc<"societies"> | null;
  guard: {
    user_id: Id<"users">;
    name: string;
    phone: string | undefined;
    status: string;
    guard_type: string | undefined;
  } | null;
  listing: Doc<"listings"> | null;
}> {
  const [lead, society, guardUser, guardProfile, listing] = await Promise.all([
    ctx.db.get(visit.lead_id),
    ctx.db.get(visit.society_id),
    ctx.db.get(visit.assigned_guard_id),
    ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", visit.assigned_guard_id))
      .unique(),
    visit.listing_id ? ctx.db.get(visit.listing_id) : Promise.resolve(null),
  ]);

  const building = lead ? await ctx.db.get(lead.building_id) : null;

  return {
    lead,
    building,
    society,
    guard: guardUser
      ? {
          user_id: guardUser._id,
          name: guardUser.name,
          phone: guardUser.phone,
          status: guardUser.status,
          guard_type: guardProfile?.guard_type,
        }
      : null,
    listing,
  };
}

export function validateVisitTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions: Record<string, string[]> = {
    [VISIT_STATUS.ASSIGNED]: [
      VISIT_STATUS.CONFIRMED,
      VISIT_STATUS.IN_PROGRESS,
      VISIT_STATUS.CANCELLED,
      VISIT_STATUS.NO_SHOW,
    ],
    [VISIT_STATUS.CONFIRMED]: [
      VISIT_STATUS.IN_PROGRESS,
      VISIT_STATUS.CANCELLED,
      VISIT_STATUS.NO_SHOW,
    ],
    [VISIT_STATUS.IN_PROGRESS]: [VISIT_STATUS.COMPLETED],
  };

  return (validTransitions[currentStatus] ?? []).includes(newStatus);
}

async function rollbackLinkedInquiryToGuardAccepted(
  ctx: MutationCtx,
  visit: VisitDoc,
): Promise<void> {
  if (!visit.tenant_inquiry_id) {
    return;
  }

  const inquiry = await ctx.db.get(visit.tenant_inquiry_id);

  if (!inquiry || inquiry.status !== TENANT_INQUIRY_STATUS.VISIT_SCHEDULED) {
    return;
  }

  const rollbackStatus = TENANT_INQUIRY_STATUS.GUARD_ACCEPTED;

  if (!validateTenantInquiryTransition(inquiry.status, rollbackStatus)) {
    throw new Error(`Cannot rollback linked inquiry with status: ${inquiry.status}`);
  }

  // Keep guard assignment but clear the linked visit so ops can schedule a fresh slot.
  await ctx.db.patch(inquiry._id, {
    status: rollbackStatus,
    visit_id: inquiry.visit_id === visit._id ? undefined : inquiry.visit_id,
    updated_at: Date.now(),
  });
}

export const create = mutation({
  args: {
    lead_id: v.id("leads"),
    scheduled_start: v.number(),
    scheduled_end: v.number(),
    assigned_guard_id: v.id("users"),
    checklist_template_id: v.optional(v.id("checklist_templates")),
    checklist_depth: v.optional(checklistDepthValidator),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.VISITS_CREATE);

    if (args.scheduled_start >= args.scheduled_end) {
      throw new Error("scheduled_start must be less than scheduled_end");
    }

    const hasChecklistTemplate = args.checklist_template_id !== undefined;
    const hasChecklistDepth = args.checklist_depth !== undefined;

    if (hasChecklistTemplate !== hasChecklistDepth) {
      throw new Error(
        "Both checklist_template_id and checklist_depth are required when attaching a checklist",
      );
    }

    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (lead.status === LEAD_STATUS.REJECTED || lead.status === LEAD_STATUS.DUPLICATE) {
      throw new Error(`Cannot schedule a visit for a ${lead.status} lead`);
    }

    if (lead.status !== LEAD_STATUS.VERIFIED) {
      throw new Error("Only VERIFIED leads can have visits scheduled");
    }

    await ensureActiveGuardInSociety(ctx, args.assigned_guard_id, lead.society_id);

    const linkedListing = await ctx.db
      .query("listings")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .first();

    const visitId = await ctx.db.insert("visits", {
      lead_id: args.lead_id,
      society_id: lead.society_id,
      listing_id: linkedListing?._id,
      scheduled_start: args.scheduled_start,
      scheduled_end: args.scheduled_end,
      assigned_guard_id: args.assigned_guard_id,
      status: VISIT_STATUS.ASSIGNED,
      outcome: undefined,
      outcome_notes: undefined,
      started_at: undefined,
      completed_at: undefined,
      needs_reassignment: false,
      checklist_instance_id: undefined,
      created_by_admin_id: admin._id,
    });

    if (args.checklist_template_id && args.checklist_depth) {
      const checklistInstanceId = await ctx.runMutation(
        internal.checklists.createInstanceInternal,
        {
          template_id: args.checklist_template_id,
          visit_id: visitId,
          assigned_to: args.assigned_guard_id,
          assigned_by: admin._id,
          depth: args.checklist_depth,
        },
      );

      await ctx.db.patch(visitId, {
        checklist_instance_id: checklistInstanceId,
      });
    }

    const building = await ctx.db.get(lead.building_id);

    try {
      await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
        user_id: args.assigned_guard_id,
        event_type: "visit_scheduled",
        category: NOTIFICATION_CATEGORY.VISIT_UPDATE,
        severity: NOTIFICATION_SEVERITY.IMPORTANT,
        payload: {
          flat_number: lead.flat_number,
          building_name: building?.name ?? "Unknown building",
          visit_date: new Date(args.scheduled_start).toISOString().slice(0, 10),
          visit_time: new Date(args.scheduled_start).toISOString().slice(11, 16),
        },
        dedup_key: `visit:${visitId}:scheduled`,
        action_url: "/guard/visits",
      });
    } catch (error) {
      console.error("Failed to enqueue visit scheduled notification (non-blocking):", error);
    }

    return visitId;
  },
});

export const getById = query({
  args: {
    id: v.id("visits"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_VIEW);

    const visit = await ctx.db.get(args.id);

    if (!visit) {
      throw new Error("Visit not found");
    }

    const context = await getVisitContext(ctx, visit);

    return {
      visit,
      lead: context.lead,
      building: context.building,
      society: context.society,
      guard: context.guard,
      listing: context.listing,
    };
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(visitStatusValidator),
    society_id: v.optional(v.id("societies")),
    assigned_guard_id: v.optional(v.id("users")),
    needs_reassignment: v.optional(v.boolean()),
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_VIEW);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    const dateFrom = args.date_from ?? 0;
    const dateTo = args.date_to;
    let visitsQuery =
      dateTo === undefined
        ? ctx.db
            .query("visits")
            .withIndex("by_scheduled_start", (q) => q.gte("scheduled_start", dateFrom))
        : ctx.db
            .query("visits")
            .withIndex("by_scheduled_start", (q) =>
              q.gte("scheduled_start", dateFrom).lte("scheduled_start", dateTo),
            );

    if (args.status !== undefined) {
      visitsQuery = visitsQuery.filter((q) => q.eq(q.field("status"), args.status));
    }

    if (args.society_id !== undefined) {
      visitsQuery = visitsQuery.filter((q) => q.eq(q.field("society_id"), args.society_id));
    }

    if (args.assigned_guard_id !== undefined) {
      visitsQuery = visitsQuery.filter((q) =>
        q.eq(q.field("assigned_guard_id"), args.assigned_guard_id),
      );
    }

    if (args.needs_reassignment === true) {
      visitsQuery = visitsQuery.filter((q) => q.eq(q.field("needs_reassignment"), true));
    }

    if (args.needs_reassignment === false) {
      visitsQuery = visitsQuery.filter((q) => q.neq(q.field("needs_reassignment"), true));
    }

    const paginatedResults = await visitsQuery.order("asc").paginate(args.paginationOpts);
    const enrichedVisits = await Promise.all(
      paginatedResults.page.map(async (visit) => {
        const context = await getVisitContext(ctx, visit);

        return {
          ...visit,
          lead: context.lead,
          building: context.building,
          society: context.society,
          guard: context.guard,
          listing: context.listing,
        };
      }),
    );

    return {
      ...paginatedResults,
      page: enrichedVisits,
    } as PaginationResult<(typeof enrichedVisits)[number]>;
  },
});

export const getTodayCount = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_VIEW);

    const startOfDay = getStartOfDayIST(Date.now());
    const startOfNextDay = startOfDay + DAY_MS;
    const todaysVisits = await ctx.db
      .query("visits")
      .withIndex("by_scheduled_start", (q) =>
        q.gte("scheduled_start", startOfDay).lt("scheduled_start", startOfNextDay),
      )
      .collect();

    const count = todaysVisits.filter((visit) => !isTerminalVisitStatus(visit.status)).length;

    return count;
  },
});

export const checkGuardConflicts = query({
  args: {
    assigned_guard_id: v.id("users"),
    proposed_start_ms: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_VIEW);

    const activeStatuses = [
      VISIT_STATUS.ASSIGNED,
      VISIT_STATUS.CONFIRMED,
      VISIT_STATUS.IN_PROGRESS,
    ] as const;

    const possibleConflicts = (
      await Promise.all(
        activeStatuses.map((status) =>
          ctx.db
            .query("visits")
            .withIndex("by_guard_and_status", (q) =>
              q.eq("assigned_guard_id", args.assigned_guard_id).eq("status", status),
            )
            .collect(),
        ),
      )
    )
      .flat()
      .filter(
        (visit) => Math.abs(visit.scheduled_start - args.proposed_start_ms) <= CONFLICT_WINDOW_MS,
      )
      .sort((a, b) => a.scheduled_start - b.scheduled_start);

    const conflicts = await Promise.all(
      possibleConflicts.map(async (visit) => {
        const [lead, society] = await Promise.all([
          ctx.db.get(visit.lead_id),
          ctx.db.get(visit.society_id),
        ]);

        return {
          visit_id: String(visit._id),
          scheduled_start_ms: visit.scheduled_start,
          scheduled_end_ms: visit.scheduled_end,
          society_name: society?.name ?? "Unknown society",
          flat_number: lead?.flat_number ?? "Unknown flat",
          status: visit.status,
        };
      }),
    );

    return { conflicts };
  },
});

export const getVisitsByDate = query({
  args: {
    date_ms: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_VIEW);

    const startOfDay = args.date_ms;
    const startOfNextDay = startOfDay + DAY_MS;
    const visits = await ctx.db
      .query("visits")
      .withIndex("by_scheduled_start", (q) =>
        q.gte("scheduled_start", startOfDay).lt("scheduled_start", startOfNextDay),
      )
      .collect();

    const visitsWithContext = await Promise.all(
      visits.map(async (visit) => {
        const [guard, society, lead] = await Promise.all([
          ctx.db.get(visit.assigned_guard_id),
          ctx.db.get(visit.society_id),
          ctx.db.get(visit.lead_id),
        ]);

        return {
          visit_id: String(visit._id),
          scheduled_start_ms: visit.scheduled_start,
          scheduled_end_ms: visit.scheduled_end,
          guard_name: guard?.name ?? "Unknown guard",
          society_name: society?.name ?? "Unknown society",
          flat_number: lead?.flat_number ?? "Unknown flat",
          status: visit.status,
        };
      }),
    );

    return visitsWithContext.sort((a, b) => a.scheduled_start_ms - b.scheduled_start_ms);
  },
});

export const confirm = mutation({
  args: {
    id: v.id("visits"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_EDIT);

    const visit = await ctx.db.get(args.id);

    if (!visit) {
      throw new Error("Visit not found");
    }

    if (!validateVisitTransition(visit.status, VISIT_STATUS.CONFIRMED)) {
      throw new Error(`Cannot confirm a visit with status: ${visit.status}`);
    }

    await ctx.db.patch(args.id, {
      status: VISIT_STATUS.CONFIRMED,
    });

    return await ctx.db.get(args.id);
  },
});

export const cancel = mutation({
  args: {
    id: v.id("visits"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_CANCEL);

    const visit = await ctx.db.get(args.id);

    if (!visit) {
      throw new Error("Visit not found");
    }

    if (!validateVisitTransition(visit.status, VISIT_STATUS.CANCELLED)) {
      throw new Error(`Cannot cancel a visit with status: ${visit.status}`);
    }

    await ctx.db.patch(args.id, {
      status: VISIT_STATUS.CANCELLED,
      outcome_notes: normalizeOptionalString(args.reason),
    });

    await rollbackLinkedInquiryToGuardAccepted(ctx, visit);

    return await ctx.db.get(args.id);
  },
});

export const markNoShow = mutation({
  args: {
    id: v.id("visits"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_EDIT);

    const visit = await ctx.db.get(args.id);

    if (!visit) {
      throw new Error("Visit not found");
    }

    if (!validateVisitTransition(visit.status, VISIT_STATUS.NO_SHOW)) {
      throw new Error(`Cannot mark no-show for visit with status: ${visit.status}`);
    }

    await ctx.db.patch(args.id, {
      status: VISIT_STATUS.NO_SHOW,
      outcome_notes: normalizeOptionalString(args.notes),
    });

    await rollbackLinkedInquiryToGuardAccepted(ctx, visit);

    return await ctx.db.get(args.id);
  },
});

export const edit = mutation({
  args: {
    id: v.id("visits"),
    scheduled_start: v.optional(v.number()),
    scheduled_end: v.optional(v.number()),
    assigned_guard_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const actingUser = await requirePermission(ctx, PERMISSIONS.VISITS_EDIT);

    const visit = await ctx.db.get(args.id);

    if (!visit) {
      throw new Error("Visit not found");
    }

    if (isTerminalVisitStatus(visit.status)) {
      throw new Error(`Cannot edit a terminal visit with status: ${visit.status}`);
    }

    const nextScheduledStart = args.scheduled_start ?? visit.scheduled_start;
    const nextScheduledEnd = args.scheduled_end ?? visit.scheduled_end;

    if (
      (args.scheduled_start !== undefined || args.scheduled_end !== undefined) &&
      nextScheduledStart >= nextScheduledEnd
    ) {
      throw new Error("scheduled_start must be less than scheduled_end");
    }

    const patch: Partial<
      Pick<
        VisitDoc,
        "scheduled_start" | "scheduled_end" | "assigned_guard_id" | "needs_reassignment"
      >
    > = {};

    if (args.scheduled_start !== undefined) {
      patch.scheduled_start = args.scheduled_start;
    }

    if (args.scheduled_end !== undefined) {
      patch.scheduled_end = args.scheduled_end;
    }

    if (
      args.assigned_guard_id !== undefined &&
      args.assigned_guard_id !== visit.assigned_guard_id
    ) {
      await ensureActiveGuardInSociety(ctx, args.assigned_guard_id, visit.society_id);
      patch.assigned_guard_id = args.assigned_guard_id;
      patch.needs_reassignment = false;
    }

    if (Object.keys(patch).length === 0) {
      return visit;
    }

    await ctx.db.patch(args.id, patch);

    if (patch.assigned_guard_id && visit.checklist_instance_id) {
      const checklist = await ctx.db.get(visit.checklist_instance_id);

      if (checklist && !checklist.is_deleted) {
        await ctx.db.patch(checklist._id, {
          assigned_to: patch.assigned_guard_id,
        });
      }
    }

    if (patch.assigned_guard_id) {
      try {
        const closure = await ctx.db
          .query("closures")
          .withIndex("by_lead_id", (q) => q.eq("lead_id", visit.lead_id))
          .first();

        if (closure) {
          await ctx.runMutation(internal.dealContributions.logContribution, {
            closure_id: closure._id,
            lead_id: visit.lead_id,
            actor_user_id: patch.assigned_guard_id,
            actor_persona: INCENTIVE_PERSONA.GUARD,
            stage: CONTRIBUTION_STAGE.SUPPORT,
            source_entity_type: CONTRIBUTION_SOURCE_ENTITY.VISIT,
            source_entity_id: `${visit._id}`,
            event_key: `${closure._id}:SUPPORT:${patch.assigned_guard_id}:visit_handoff:${visit._id}:${visit.assigned_guard_id}`,
            contribution_units: 1,
            handoff_from_user_id: visit.assigned_guard_id,
            handoff_reason: `Visit reassigned by ${actingUser._id}`,
          });
        }
      } catch (error) {
        console.error("V3 attribution hook failed (non-blocking):", error);
      }
    }

    return await ctx.db.get(args.id);
  },
});

export const start = mutation({
  args: {
    id: v.id("visits"),
  },
  handler: async (ctx, args) => {
    const { user: guard } = await requireFieldWorker(ctx);
    const visit = await ctx.db.get(args.id);

    if (!visit) {
      throw new Error("Visit not found");
    }

    if (visit.assigned_guard_id !== guard._id) {
      throw new Error("You can only start visits assigned to you");
    }

    if (!validateVisitTransition(visit.status, VISIT_STATUS.IN_PROGRESS)) {
      throw new Error(`Cannot start a visit with status: ${visit.status}`);
    }

    const startedAt = Date.now();

    await ctx.db.patch(args.id, {
      status: VISIT_STATUS.IN_PROGRESS,
      started_at: startedAt,
    });

    if (visit.checklist_instance_id) {
      const checklist = await ctx.db.get(visit.checklist_instance_id);

      if (!checklist || checklist.is_deleted) {
        throw new Error("Attached checklist instance not found");
      }

      if (checklist.assigned_to !== guard._id) {
        throw new Error("Attached checklist is assigned to a different guard");
      }

      if (checklist.status === CHECKLIST_STATUS.ASSIGNED) {
        await ctx.db.patch(checklist._id, {
          status: CHECKLIST_STATUS.IN_PROGRESS,
          started_at: checklist.started_at ?? startedAt,
        });
      }
    }

    return await ctx.db.get(args.id);
  },
});

export const complete = mutation({
  args: {
    id: v.id("visits"),
    outcome: visitOutcomeValidator,
    outcome_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user: guard } = await requireFieldWorker(ctx);
    const visit = await ctx.db.get(args.id);

    if (!visit) {
      throw new Error("Visit not found");
    }

    if (visit.assigned_guard_id !== guard._id) {
      throw new Error("You can only complete visits assigned to you");
    }

    if (!validateVisitTransition(visit.status, VISIT_STATUS.COMPLETED)) {
      throw new Error(`Cannot complete a visit with status: ${visit.status}`);
    }

    if (visit.checklist_instance_id) {
      const checklist = await ctx.db.get(visit.checklist_instance_id);

      if (!checklist || checklist.is_deleted) {
        throw new Error("Attached checklist instance not found");
      }

      if (checklist.assigned_to !== guard._id) {
        throw new Error("Attached checklist is assigned to a different guard");
      }

      const canCompleteWithChecklist =
        checklist.status === CHECKLIST_STATUS.SUBMITTED ||
        checklist.status === CHECKLIST_STATUS.APPROVED;

      if (!canCompleteWithChecklist) {
        throw new Error("Checklist must be submitted or approved before completing this visit.");
      }
    }

    await ctx.db.patch(args.id, {
      status: VISIT_STATUS.COMPLETED,
      outcome: args.outcome,
      outcome_notes: normalizeOptionalString(args.outcome_notes),
      completed_at: Date.now(),
    });

    await ctx.runMutation(internal.incentives.checkAndSuggest, {
      guard_user_id: visit.assigned_guard_id,
      trigger: "VISIT_COMPLETED",
    });

    await ctx.runMutation(internal.incentives.recomputeQualityScore, {
      guard_user_id: visit.assigned_guard_id,
      trigger: "VISIT_COMPLETED",
    });

    try {
      await ctx.runMutation(internal.gamification.awardXp, {
        user_id: visit.assigned_guard_id,
        persona: INCENTIVE_PERSONA.GUARD,
        xp_amount: XP_AWARDS.VISIT_COMPLETED,
        event_key: `${args.id}:VISIT_COMPLETED:${visit.assigned_guard_id}:visit_complete`,
        reason: "Visit completed",
      });
    } catch (error) {
      console.error("V3 gamification XP hook failed (non-blocking):", error);
    }

    if (visit.tenant_inquiry_id) {
      const inquiry = await ctx.db.get(visit.tenant_inquiry_id);
      if (inquiry && inquiry.status === TENANT_INQUIRY_STATUS.VISIT_SCHEDULED) {
        if (
          !validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.VISIT_COMPLETED)
        ) {
          throw new Error(`Cannot complete linked inquiry with status: ${inquiry.status}`);
        }

        await ctx.db.patch(visit.tenant_inquiry_id, {
          status: TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
          updated_at: Date.now(),
        });

        try {
          await ctx.runMutation(internal.tenantInquiries.emitVisitCompletedNotification, {
            inquiry_id: visit.tenant_inquiry_id,
            visit_id: visit._id,
            outcome: args.outcome,
          });
        } catch (error) {
          console.error(
            "Failed to enqueue inquiry visit completed notification (non-blocking):",
            error,
          );
        }
      }

      if (args.outcome === VISIT_OUTCOME.INTERESTED) {
        await ctx.runMutation(internal.negotiations.initiateFromVisit, {
          tenant_inquiry_id: visit.tenant_inquiry_id,
          initiated_by_admin_id: guard._id,
        });
      }
    }

    const linkedListing =
      visit.listing_id !== undefined
        ? await ctx.db.get(visit.listing_id)
        : await ctx.db
            .query("listings")
            .withIndex("by_lead_id", (q) => q.eq("lead_id", visit.lead_id))
            .first();

    if (linkedListing) {
      await ctx.scheduler.runAfter(0, internal.trustBadges.computeForListing, {
        listing_id: linkedListing._id,
      });
    }

    try {
      await notifyBackofficeOnVisitCompleted(ctx, {
        visit,
        outcome: args.outcome,
      });
    } catch (error) {
      console.error("Failed to enqueue backoffice visit notifications (non-blocking):", error);
    }

    return await ctx.db.get(args.id);
  },
});

export const forceComplete = mutation({
  args: {
    id: v.id("visits"),
    outcome: visitOutcomeValidator,
    outcome_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.VISITS_EDIT);
    const visit = await ctx.db.get(args.id);

    if (!visit) {
      throw new Error("Visit not found");
    }

    if (!validateVisitTransition(visit.status, VISIT_STATUS.COMPLETED)) {
      throw new Error(`Cannot complete a visit with status: ${visit.status}`);
    }

    await ctx.db.patch(args.id, {
      status: VISIT_STATUS.COMPLETED,
      outcome: args.outcome,
      outcome_notes: normalizeOptionalString(args.outcome_notes),
      completed_at: Date.now(),
    });

    await ctx.runMutation(internal.incentives.checkAndSuggest, {
      guard_user_id: visit.assigned_guard_id,
      trigger: "VISIT_COMPLETED",
    });

    await ctx.runMutation(internal.incentives.recomputeQualityScore, {
      guard_user_id: visit.assigned_guard_id,
      trigger: "VISIT_COMPLETED",
    });

    if (visit.tenant_inquiry_id) {
      const inquiry = await ctx.db.get(visit.tenant_inquiry_id);
      if (inquiry && inquiry.status === TENANT_INQUIRY_STATUS.VISIT_SCHEDULED) {
        if (
          !validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.VISIT_COMPLETED)
        ) {
          throw new Error(`Cannot complete linked inquiry with status: ${inquiry.status}`);
        }

        await ctx.db.patch(visit.tenant_inquiry_id, {
          status: TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
          updated_at: Date.now(),
        });

        try {
          await ctx.runMutation(internal.tenantInquiries.emitVisitCompletedNotification, {
            inquiry_id: visit.tenant_inquiry_id,
            visit_id: visit._id,
            outcome: args.outcome,
          });
        } catch (error) {
          console.error(
            "Failed to enqueue inquiry visit completed notification (non-blocking):",
            error,
          );
        }
      }

      if (args.outcome === VISIT_OUTCOME.INTERESTED) {
        await ctx.runMutation(internal.negotiations.initiateFromVisit, {
          tenant_inquiry_id: visit.tenant_inquiry_id,
          initiated_by_admin_id: admin._id,
        });
      }
    }

    const linkedListing =
      visit.listing_id !== undefined
        ? await ctx.db.get(visit.listing_id)
        : await ctx.db
            .query("listings")
            .withIndex("by_lead_id", (q) => q.eq("lead_id", visit.lead_id))
            .first();

    if (linkedListing) {
      await ctx.scheduler.runAfter(0, internal.trustBadges.computeForListing, {
        listing_id: linkedListing._id,
      });
    }

    try {
      await notifyBackofficeOnVisitCompleted(ctx, {
        visit,
        outcome: args.outcome,
      });
    } catch (error) {
      console.error("Failed to enqueue backoffice visit notifications (non-blocking):", error);
    }

    return await ctx.db.get(args.id);
  },
});

export const getMyGuardVisits = query({
  args: {
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user: guard } = await requireFieldWorker(ctx);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    const dateFrom = args.date_from ?? 0;
    const dateTo = args.date_to;
    let visitsQuery =
      dateTo === undefined
        ? ctx.db
            .query("visits")
            .withIndex("by_scheduled_start", (q) => q.gte("scheduled_start", dateFrom))
        : ctx.db
            .query("visits")
            .withIndex("by_scheduled_start", (q) =>
              q.gte("scheduled_start", dateFrom).lte("scheduled_start", dateTo),
            );

    visitsQuery = visitsQuery.filter((q) => q.eq(q.field("assigned_guard_id"), guard._id));

    const visits = await visitsQuery.order("desc").collect();

    return await Promise.all(
      visits.map(async (visit) => {
        const context = await getVisitContext(ctx, visit);

        return {
          ...visit,
          lead: context.lead,
          building: context.building,
          society: context.society,
          guard: context.guard,
          listing: context.listing,
        };
      }),
    );
  },
});

export const getMyVisits = query({
  args: {
    paginationOpts: v.optional(paginationOptsValidator),
    status: v.optional(visitStatusValidator),
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    const paginationOpts = args.paginationOpts ?? { numItems: 20, cursor: null };

    const tenantInquiries = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_tenant_id", (q) => q.eq("tenant_id", tenant._id))
      .collect();

    if (tenantInquiries.length === 0) {
      return {
        page: [] as never[],
        isDone: true,
        continueCursor: "",
      };
    }

    const inquiryById = new Map<string, Doc<"tenant_inquiries">>();
    for (const inquiry of tenantInquiries) {
      inquiryById.set(String(inquiry._id), inquiry);
    }

    const inquiryIds = tenantInquiries.map((inquiry) => inquiry._id);

    const perInquiryVisits = await Promise.all(
      inquiryIds.map((inquiryId) =>
        ctx.db
          .query("visits")
          .withIndex("by_tenant_inquiry_id", (q) => q.eq("tenant_inquiry_id", inquiryId))
          .order("desc")
          .collect(),
      ),
    );

    let allVisits = perInquiryVisits.flat();

    const dateFrom = args.date_from ?? 0;
    const dateTo = args.date_to;

    allVisits = allVisits.filter((visit) => {
      if (visit.scheduled_start < dateFrom) return false;
      if (dateTo !== undefined && visit.scheduled_start > dateTo) return false;
      if (args.status !== undefined && visit.status !== args.status) return false;
      return true;
    });

    allVisits.sort((a, b) => b.scheduled_start - a.scheduled_start);

    const cursorValue = paginationOpts.cursor;
    let startIndex = 0;
    if (cursorValue) {
      const cursorIndex = allVisits.findIndex((v) => String(v._id) === cursorValue);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : allVisits.length;
    }

    const pageVisits = allVisits.slice(startIndex, startIndex + paginationOpts.numItems);
    const isDone = startIndex + paginationOpts.numItems >= allVisits.length;
    const continueCursor =
      pageVisits.length > 0 ? String(pageVisits[pageVisits.length - 1]._id) : "";

    const page = await Promise.all(
      pageVisits.map(async (visit) => {
        const inquiry = visit.tenant_inquiry_id
          ? (inquiryById.get(String(visit.tenant_inquiry_id)) ?? null)
          : null;
        const listingId = visit.listing_id ?? inquiry?.listing_id;

        const [listing, guardUser] = await Promise.all([
          listingId ? ctx.db.get(listingId) : Promise.resolve(null),
          ctx.db.get(visit.assigned_guard_id),
        ]);
        const lead = listing ? await ctx.db.get(listing.lead_id) : null;
        const [building, society] = await Promise.all([
          lead?.building_id ? ctx.db.get(lead.building_id) : Promise.resolve(null),
          lead?.society_id ? ctx.db.get(lead.society_id) : Promise.resolve(null),
        ]);

        const listingTitle =
          building && lead?.flat_number
            ? `${building.name} Flat ${lead.flat_number}`
            : lead?.flat_number
              ? `Flat ${lead.flat_number}`
              : listing?.slug
                ? listing.slug
                    .split("-")
                    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
                    .join(" ")
                : listing
                  ? `${listing.bhk_config} listing`
                  : "Listing";

        return {
          _id: visit._id,
          visit_id: visit._id,
          _creationTime: visit._creationTime,
          inquiry_id: visit.tenant_inquiry_id ?? null,
          inquiry: visit.tenant_inquiry_id
            ? {
                _id: visit.tenant_inquiry_id,
              }
            : null,
          status: visit.status,
          outcome: visit.outcome ?? null,
          scheduled_start: visit.scheduled_start,
          scheduled_end: visit.scheduled_end,
          listing: listing
            ? {
                _id: listing._id,
                id: listing._id,
                title: listingTitle,
                slug: listing.slug,
                rent_monthly: listing.rent_monthly,
                bhk_config: listing.bhk_config,
                building_name: building?.name ?? null,
                society_name: society?.name ?? null,
              }
            : null,
          society: society
            ? {
                name: society.name,
              }
            : null,
          guard: guardUser
            ? {
                name: getFirstName(guardUser.name),
                id: guardUser._id,
                first_name: getFirstName(guardUser.name),
              }
            : null,
        };
      }),
    );

    return {
      page,
      isDone,
      continueCursor,
    };
  },
});

export const getMyTodayVisits = query({
  args: {},
  handler: async (ctx) => {
    const { user: guard } = await requireFieldWorker(ctx);
    const startOfDay = getStartOfDayIST(Date.now());
    const startOfNextDay = startOfDay + DAY_MS;

    const visits = await ctx.db
      .query("visits")
      .withIndex("by_scheduled_start", (q) =>
        q.gte("scheduled_start", startOfDay).lt("scheduled_start", startOfNextDay),
      )
      .filter((q) => q.eq(q.field("assigned_guard_id"), guard._id))
      .order("asc")
      .collect();

    return await Promise.all(
      visits.map(async (visit) => {
        const context = await getVisitContext(ctx, visit);

        return {
          ...visit,
          lead: context.lead,
          building: context.building,
          society: context.society,
          guard: context.guard,
          listing: context.listing,
        };
      }),
    );
  },
});

export const getGuardAvailability = query({
  args: {
    society_id: v.id("societies"),
    building_id: v.id("buildings"),
    date: v.number(),
    time_start: v.number(),
    time_end: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAnyPermission(ctx, [PERMISSIONS.VISITS_CREATE, PERMISSIONS.VISITS_EDIT]);

    if (args.time_start >= args.time_end) {
      throw new Error("time_start must be less than time_end");
    }

    const [society, targetBuilding] = await Promise.all([
      ctx.db.get(args.society_id),
      ctx.db.get(args.building_id),
    ]);

    if (!society) {
      throw new Error("Society not found");
    }

    if (!targetBuilding || targetBuilding.is_deleted) {
      throw new Error("Building not found");
    }

    if (targetBuilding.society_id !== args.society_id) {
      throw new Error("Building does not belong to the selected society");
    }

    const targetDate = getStartOfDayIST(args.date);
    const dayOfWeek = getDayOfWeekIST(targetDate);
    const visitStartMinutes = getMinutesOfDayIST(args.time_start);
    const visitEndMinutes = getMinutesOfDayIST(args.time_end);

    if (visitStartMinutes >= visitEndMinutes) {
      throw new Error("time_start and time_end must be in the same day with a valid range");
    }

    const guardProfiles = await ctx.db
      .query("guard_profiles")
      .withIndex("by_society_id", (q) => q.eq("society_id", args.society_id))
      .collect();

    const availabilityRows = await Promise.all(
      guardProfiles.map(async (profile) => {
        const user = await ctx.db.get(profile.user_id);

        if (!user || user.user_type !== USER_TYPE.GUARD) {
          return null;
        }

        let availabilityIndicator: GuardAvailabilityIndicator = "OFF_DUTY";
        let shiftLocation: string | null = null;

        if (user.status === USER_STATUS.INACTIVE) {
          availabilityIndicator = "INACTIVE";
        } else if (user.status === USER_STATUS.BANNED) {
          availabilityIndicator = "BANNED";
        } else if (user.status === USER_STATUS.ACTIVE) {
          const overrideShifts = await ctx.db
            .query("guard_shifts")
            .withIndex("by_guard_and_date", (q) =>
              q.eq("guard_user_id", profile.user_id).eq("specific_date", targetDate),
            )
            .filter((q) => q.neq(q.field("is_deleted"), true))
            .collect();

          const shiftsForDate =
            overrideShifts.length > 0
              ? overrideShifts
              : await ctx.db
                  .query("guard_shifts")
                  .withIndex("by_guard_and_day", (q) =>
                    q.eq("guard_user_id", profile.user_id).eq("day_of_week", dayOfWeek),
                  )
                  .filter((q) =>
                    q.and(
                      q.neq(q.field("is_deleted"), true),
                      q.eq(q.field("shift_type"), SHIFT_TYPE.RECURRING),
                    ),
                  )
                  .collect();

          const overlappingShifts = shiftsForDate.filter((shift) =>
            shiftsOverlap(
              parseTimeToMinutes(shift.start_time),
              parseTimeToMinutes(shift.end_time),
              visitStartMinutes,
              visitEndMinutes,
            ),
          );

          if (overlappingShifts.length === 0) {
            availabilityIndicator = "OFF_DUTY";
          } else {
            const sameBuildingShift = overlappingShifts.find(
              (shift) => shift.building_id !== undefined && shift.building_id === args.building_id,
            );

            if (sameBuildingShift) {
              availabilityIndicator = "ON_SHIFT_SAME_BUILDING";
              shiftLocation = targetBuilding.name;
            } else {
              availabilityIndicator = "ON_SHIFT_DIFFERENT_LOCATION";
              const shiftWithBuilding = overlappingShifts.find(
                (shift) => shift.building_id !== undefined,
              );

              if (shiftWithBuilding?.building_id) {
                const shiftBuilding = await ctx.db.get(shiftWithBuilding.building_id);
                shiftLocation = shiftBuilding?.name ?? null;
              }
            }
          }
        }

        return {
          guard_id: user._id,
          guard_name: user.name,
          guard_type: profile.guard_type,
          availability_indicator: availabilityIndicator,
          shift_location: shiftLocation,
        };
      }),
    );

    return availabilityRows.filter(
      (row): row is NonNullable<(typeof availabilityRows)[number]> => row !== null,
    );
  },
});
