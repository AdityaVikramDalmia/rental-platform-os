import { v } from "convex/values";
import {
  PERMISSIONS,
  REGULATORY_ITEM_TYPE,
  REGULATORY_STATUS,
  type RegulatoryItemType,
  type RegulatoryStatus,
} from "../lib/constants";
import { mutation, query, internalMutation } from "./functions";
import { requireAuth, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const INTERNAL_API = internal;

const regulatoryItemTypeValidator = v.union(
  v.literal(REGULATORY_ITEM_TYPE.POLICE_VERIFICATION),
  v.literal(REGULATORY_ITEM_TYPE.RENT_REGISTRATION),
  v.literal(REGULATORY_ITEM_TYPE.SOCIETY_NOC),
  v.literal(REGULATORY_ITEM_TYPE.STAMP_DUTY),
);

const regulatoryStatusValidator = v.union(
  v.literal(REGULATORY_STATUS.NOT_STARTED),
  v.literal(REGULATORY_STATUS.IN_PROGRESS),
  v.literal(REGULATORY_STATUS.SUBMITTED),
  v.literal(REGULATORY_STATUS.APPROVED),
  v.literal(REGULATORY_STATUS.REJECTED),
  v.literal(REGULATORY_STATUS.OVERDUE),
  v.literal(REGULATORY_STATUS.WAIVED),
);

const VALID_REGULATORY_TRANSITIONS: Record<RegulatoryStatus, RegulatoryStatus[]> = {
  [REGULATORY_STATUS.NOT_STARTED]: [REGULATORY_STATUS.IN_PROGRESS, REGULATORY_STATUS.WAIVED],
  [REGULATORY_STATUS.IN_PROGRESS]: [REGULATORY_STATUS.SUBMITTED, REGULATORY_STATUS.WAIVED],
  [REGULATORY_STATUS.SUBMITTED]: [
    REGULATORY_STATUS.APPROVED,
    REGULATORY_STATUS.REJECTED,
    REGULATORY_STATUS.WAIVED,
  ],
  [REGULATORY_STATUS.APPROVED]: [],
  [REGULATORY_STATUS.REJECTED]: [REGULATORY_STATUS.IN_PROGRESS, REGULATORY_STATUS.WAIVED],
  [REGULATORY_STATUS.OVERDUE]: [REGULATORY_STATUS.IN_PROGRESS, REGULATORY_STATUS.WAIVED],
  [REGULATORY_STATUS.WAIVED]: [],
};

const SLA_DEFAULTS_MS: Record<RegulatoryItemType, number> = {
  [REGULATORY_ITEM_TYPE.POLICE_VERIFICATION]: 7 * 24 * 60 * 60 * 1000,
  [REGULATORY_ITEM_TYPE.RENT_REGISTRATION]: 60 * 24 * 60 * 60 * 1000,
  [REGULATORY_ITEM_TYPE.SOCIETY_NOC]: 14 * 24 * 60 * 60 * 1000,
  [REGULATORY_ITEM_TYPE.STAMP_DUTY]: 30 * 24 * 60 * 60 * 1000,
};

const ACTIVE_SLA_STATUSES = new Set<RegulatoryStatus>([
  REGULATORY_STATUS.NOT_STARTED,
  REGULATORY_STATUS.IN_PROGRESS,
  REGULATORY_STATUS.SUBMITTED,
]);

const TERMINAL_REGULATORY_STATUSES = new Set<RegulatoryStatus>([
  REGULATORY_STATUS.APPROVED,
  REGULATORY_STATUS.WAIVED,
]);

type RegulatoryItemDoc = Doc<"regulatory_items">;
type ReadCtx = QueryCtx | MutationCtx;

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function assertValidStatusTransition(from: RegulatoryStatus, to: RegulatoryStatus): void {
  const allowedTransitions = VALID_REGULATORY_TRANSITIONS[from] ?? [];

  if (!allowedTransitions.includes(to)) {
    throw new Error(`Invalid regulatory status transition: ${from} -> ${to}`);
  }
}

function makeEmptyStatusCounts(): Record<RegulatoryStatus, number> {
  return {
    [REGULATORY_STATUS.NOT_STARTED]: 0,
    [REGULATORY_STATUS.IN_PROGRESS]: 0,
    [REGULATORY_STATUS.SUBMITTED]: 0,
    [REGULATORY_STATUS.APPROVED]: 0,
    [REGULATORY_STATUS.REJECTED]: 0,
    [REGULATORY_STATUS.OVERDUE]: 0,
    [REGULATORY_STATUS.WAIVED]: 0,
  };
}

async function getRegulatoryItemOrThrow(
  ctx: ReadCtx,
  regulatoryItemId: Id<"regulatory_items">,
): Promise<RegulatoryItemDoc> {
  const item = await ctx.db.get(regulatoryItemId);

  if (!item || item.is_deleted) {
    throw new Error("Regulatory item not found");
  }

  return item;
}

export const createRegulatoryItem = mutation({
  args: {
    closure_id: v.id("closures"),
    item_type: regulatoryItemTypeValidator,
    assigned_to: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    sla_deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const [closure, assignee] = await Promise.all([
      ctx.db.get(args.closure_id),
      args.assigned_to ? ctx.db.get(args.assigned_to) : Promise.resolve(null),
    ]);

    if (!closure) {
      throw new Error("Closure not found");
    }

    if (args.assigned_to && !assignee) {
      throw new Error("Assigned user not found");
    }

    if (assignee && assignee.user_type !== "ADMIN" && assignee.user_type !== "OPS") {
      throw new Error("Regulatory items can only be assigned to admin or OPS users");
    }

    const now = Date.now();
    const slaDeadline = args.sla_deadline ?? now + SLA_DEFAULTS_MS[args.item_type];

    if (args.sla_deadline !== undefined && slaDeadline < now) {
      throw new Error("SLA deadline cannot be in the past");
    }

    const regulatoryItemId = await ctx.db.insert("regulatory_items", {
      closure_id: args.closure_id,
      item_type: args.item_type,
      status: REGULATORY_STATUS.NOT_STARTED,
      reference_number: undefined,
      sla_deadline: slaDeadline,
      submitted_at: undefined,
      completed_at: undefined,
      assigned_to: args.assigned_to,
      assigned_by: args.assigned_to ? actor._id : undefined,
      linked_document_ids: [],
      notes: normalizeOptionalString(args.notes),
      escalation_notes: undefined,
      is_deleted: false,
    });

    return await ctx.db.get(regulatoryItemId);
  },
});

export const updateStatus = mutation({
  args: {
    regulatory_item_id: v.id("regulatory_items"),
    new_status: regulatoryStatusValidator,
    reference_number: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const item = await getRegulatoryItemOrThrow(ctx, args.regulatory_item_id);
    assertValidStatusTransition(item.status, args.new_status);

    const now = Date.now();
    const patch: Partial<
      Pick<
        RegulatoryItemDoc,
        "status" | "submitted_at" | "completed_at" | "reference_number" | "notes"
      >
    > = {
      status: args.new_status,
    };

    if (args.new_status === REGULATORY_STATUS.SUBMITTED) {
      patch.submitted_at = now;
    }

    if (args.new_status === REGULATORY_STATUS.APPROVED) {
      patch.completed_at = now;
    }

    if (Object.prototype.hasOwnProperty.call(args, "reference_number")) {
      patch.reference_number = normalizeOptionalString(args.reference_number);
    }

    if (Object.prototype.hasOwnProperty.call(args, "notes")) {
      patch.notes = normalizeOptionalString(args.notes);
    }

    await ctx.db.patch(item._id, patch);
    return await ctx.db.get(item._id);
  },
});

export const updateDetails = mutation({
  args: {
    regulatory_item_id: v.id("regulatory_items"),
    reference_number: v.optional(v.string()),
    notes: v.optional(v.string()),
    escalation_notes: v.optional(v.string()),
    sla_deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const item = await getRegulatoryItemOrThrow(ctx, args.regulatory_item_id);

    const patch: Partial<
      Pick<RegulatoryItemDoc, "reference_number" | "notes" | "escalation_notes" | "sla_deadline">
    > = {};

    if (Object.prototype.hasOwnProperty.call(args, "reference_number")) {
      patch.reference_number = normalizeOptionalString(args.reference_number);
    }

    if (Object.prototype.hasOwnProperty.call(args, "notes")) {
      patch.notes = normalizeOptionalString(args.notes);
    }

    if (Object.prototype.hasOwnProperty.call(args, "escalation_notes")) {
      patch.escalation_notes = normalizeOptionalString(args.escalation_notes);
    }

    if (Object.prototype.hasOwnProperty.call(args, "sla_deadline")) {
      patch.sla_deadline = args.sla_deadline;
    }

    if (Object.keys(patch).length === 0) {
      return item;
    }

    await ctx.db.patch(item._id, patch);
    return await ctx.db.get(item._id);
  },
});

export const assignTo = mutation({
  args: {
    regulatory_item_id: v.id("regulatory_items"),
    assigned_to: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const item = await getRegulatoryItemOrThrow(ctx, args.regulatory_item_id);
    const assignee = await ctx.db.get(args.assigned_to);

    if (!assignee) {
      throw new Error("Assigned user not found");
    }

    if (assignee.user_type !== "ADMIN" && assignee.user_type !== "OPS") {
      throw new Error("Regulatory items can only be assigned to admin or OPS users");
    }

    await ctx.db.patch(item._id, {
      assigned_to: args.assigned_to,
      assigned_by: actor._id,
    });

    return await ctx.db.get(item._id);
  },
});

const ALLOWED_REGULATORY_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_REGULATORY_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const linkDocument = mutation({
  args: {
    regulatory_item_id: v.id("regulatory_items"),
    storage_id: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const item = await getRegulatoryItemOrThrow(ctx, args.regulatory_item_id);
    const metadata = await ctx.db.system.get("_storage", args.storage_id);

    if (!metadata) {
      throw new Error("Storage file not found");
    }

    const contentType = metadata.contentType ?? "";
    if (!ALLOWED_REGULATORY_CONTENT_TYPES.has(contentType)) {
      throw new Error("Only JPEG, PNG, and PDF files can be linked to regulatory items");
    }

    if (metadata.size > MAX_REGULATORY_FILE_SIZE_BYTES) {
      throw new Error("File too large. Maximum size is 10MB");
    }

    const linkedDocumentIds = item.linked_document_ids.includes(args.storage_id)
      ? item.linked_document_ids
      : [...item.linked_document_ids, args.storage_id];

    await ctx.db.patch(item._id, {
      linked_document_ids: linkedDocumentIds,
    });

    return await ctx.db.get(item._id);
  },
});

export const softDelete = mutation({
  args: {
    regulatory_item_id: v.id("regulatory_items"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const item = await getRegulatoryItemOrThrow(ctx, args.regulatory_item_id);

    await ctx.db.patch(item._id, {
      is_deleted: true,
    });

    return await ctx.db.get(item._id);
  },
});

export const getByClosureId = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_VIEW);

    const sortOrder: Record<RegulatoryItemType, number> = {
      [REGULATORY_ITEM_TYPE.POLICE_VERIFICATION]: 0,
      [REGULATORY_ITEM_TYPE.RENT_REGISTRATION]: 1,
      [REGULATORY_ITEM_TYPE.SOCIETY_NOC]: 2,
      [REGULATORY_ITEM_TYPE.STAMP_DUTY]: 3,
    };

    const items = await ctx.db
      .query("regulatory_items")
      .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return items.sort((a, b) => sortOrder[a.item_type] - sortOrder[b.item_type]);
  },
});

export const getById = query({
  args: {
    regulatory_item_id: v.id("regulatory_items"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_VIEW);
    const item = await ctx.db.get(args.regulatory_item_id);

    if (!item || item.is_deleted) {
      return null;
    }

    return item;
  },
});

export const listOverdue = query({
  args: {
    assigned_to: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_VIEW);
    const now = Date.now();

    const items = await ctx.db
      .query("regulatory_items")
      .withIndex("by_sla_deadline", (q) => q.lt("sla_deadline", now))
      .collect();

    return items.filter(
      (item) =>
        !item.is_deleted &&
        item.sla_deadline !== undefined &&
        item.sla_deadline < now &&
        !TERMINAL_REGULATORY_STATUSES.has(item.status) &&
        (args.assigned_to === undefined || item.assigned_to === args.assigned_to),
    );
  },
});

export const listAtRisk = query({
  args: {
    hours_threshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_VIEW);
    const hoursThreshold = args.hours_threshold ?? 48;

    if (hoursThreshold <= 0) {
      throw new Error("hours_threshold must be greater than 0");
    }

    const now = Date.now();
    const threshold = now + hoursThreshold * 60 * 60 * 1000;

    const items = await ctx.db
      .query("regulatory_items")
      .withIndex("by_sla_deadline", (q) => q.lt("sla_deadline", threshold))
      .collect();

    return items.filter(
      (item) =>
        !item.is_deleted &&
        item.sla_deadline !== undefined &&
        item.sla_deadline >= now &&
        item.sla_deadline < threshold &&
        item.status !== REGULATORY_STATUS.APPROVED &&
        item.status !== REGULATORY_STATUS.WAIVED &&
        item.status !== REGULATORY_STATUS.OVERDUE,
    );
  },
});

export const listAssignedToMe = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    return await ctx.db
      .query("regulatory_items")
      .withIndex("by_assigned_to", (q) => q.eq("assigned_to", user._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .collect();
  },
});

export const statusCounts = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_VIEW);

    const items = await ctx.db
      .query("regulatory_items")
      .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const counts = makeEmptyStatusCounts();

    for (const item of items) {
      counts[item.status] += 1;
    }

    return counts;
  },
});

export const auditSlaBreaches = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!INTERNAL_API) {
      throw new Error("Internal API unavailable");
    }

    const now = Date.now();
    const candidates = await ctx.db
      .query("regulatory_items")
      .withIndex("by_sla_deadline", (q) => q.lt("sla_deadline", now))
      .collect();

    let count = 0;

    for (const item of candidates) {
      if (item.is_deleted || item.sla_deadline === undefined) {
        continue;
      }

      if (!ACTIVE_SLA_STATUSES.has(item.status)) {
        continue;
      }

      await ctx.db.patch(item._id, {
        status: REGULATORY_STATUS.OVERDUE,
      });
      count += 1;
    }

    console.log(`Regulatory SLA audit: ${count} items marked OVERDUE`);

    return {
      count,
      processed_at: now,
    };
  },
});
