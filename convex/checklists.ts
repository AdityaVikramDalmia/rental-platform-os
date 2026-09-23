import { v } from "convex/values";
import {
  CHECKLIST_DEPTH,
  CHECKLIST_ITEM_TYPE,
  CHECKLIST_STATUS,
  CONDITION_RATING,
  PERMISSIONS,
  USER_TYPE,
  type ChecklistDepth,
  type ChecklistStatus,
} from "../lib/constants";
import { requireAuth, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const checklistDepthValidator = v.union(
  v.literal(CHECKLIST_DEPTH.LIGHT),
  v.literal(CHECKLIST_DEPTH.MEDIUM),
  v.literal(CHECKLIST_DEPTH.FULL),
);

const checklistStatusValidator = v.union(
  v.literal(CHECKLIST_STATUS.ASSIGNED),
  v.literal(CHECKLIST_STATUS.IN_PROGRESS),
  v.literal(CHECKLIST_STATUS.SUBMITTED),
  v.literal(CHECKLIST_STATUS.UNDER_REVIEW),
  v.literal(CHECKLIST_STATUS.APPROVED),
  v.literal(CHECKLIST_STATUS.REJECTED),
  v.literal(CHECKLIST_STATUS.REVISION_REQUESTED),
);

const conditionRatingValidator = v.union(
  v.literal(CONDITION_RATING.EXCELLENT),
  v.literal(CONDITION_RATING.GOOD),
  v.literal(CONDITION_RATING.FAIR),
  v.literal(CONDITION_RATING.POOR),
  v.literal(CONDITION_RATING.NA),
);

const reviewOutcomeValidator = v.union(
  v.literal(CHECKLIST_STATUS.APPROVED),
  v.literal(CHECKLIST_STATUS.REJECTED),
  v.literal(CHECKLIST_STATUS.REVISION_REQUESTED),
);

const photoMetadataValidator = v.object({
  storage_id: v.id("_storage"),
  taken_at: v.number(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});

const DEPTH_ORDER: Record<ChecklistDepth, number> = {
  [CHECKLIST_DEPTH.LIGHT]: 0,
  [CHECKLIST_DEPTH.MEDIUM]: 1,
  [CHECKLIST_DEPTH.FULL]: 2,
};

const VALID_CHECKLIST_TRANSITIONS: Record<ChecklistStatus, ChecklistStatus[]> = {
  [CHECKLIST_STATUS.ASSIGNED]: [CHECKLIST_STATUS.IN_PROGRESS],
  [CHECKLIST_STATUS.IN_PROGRESS]: [CHECKLIST_STATUS.SUBMITTED],
  [CHECKLIST_STATUS.SUBMITTED]: [CHECKLIST_STATUS.UNDER_REVIEW],
  [CHECKLIST_STATUS.UNDER_REVIEW]: [
    CHECKLIST_STATUS.APPROVED,
    CHECKLIST_STATUS.REJECTED,
    CHECKLIST_STATUS.REVISION_REQUESTED,
  ],
  [CHECKLIST_STATUS.REVISION_REQUESTED]: [CHECKLIST_STATUS.IN_PROGRESS],
  [CHECKLIST_STATUS.APPROVED]: [],
  [CHECKLIST_STATUS.REJECTED]: [],
};

const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);

type ChecklistTemplateSection = Doc<"checklist_templates">["sections"][number];
type ChecklistTemplateItem = ChecklistTemplateSection["items"][number];
type ChecklistResponse = Doc<"checklist_instances">["responses"][number];

function validateTransition(from: ChecklistStatus, to: ChecklistStatus): void {
  const allowed = VALID_CHECKLIST_TRANSITIONS[from];

  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Invalid checklist status transition: ${from} -> ${to}`);
  }
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function filterSectionsByDepth(
  sections: ChecklistTemplateSection[],
  depth: ChecklistDepth,
): ChecklistTemplateSection[] {
  const requestedDepthOrder = DEPTH_ORDER[depth];

  return sections
    .map((section) => ({
      section_id: section.section_id,
      title: section.title,
      description: section.description,
      items: section.items.filter((item) => DEPTH_ORDER[item.min_depth] <= requestedDepthOrder),
    }))
    .filter((section) => section.items.length > 0);
}

function getTemplateItemsForDepth(
  templateSections: ChecklistTemplateSection[],
  depth: ChecklistDepth,
): Array<ChecklistTemplateItem & { section_id: string }> {
  const sections = filterSectionsByDepth(templateSections, depth);

  return sections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      section_id: section.section_id,
    })),
  );
}

function normalizeResponseValueByItemType(
  itemType: ChecklistTemplateItem["item_type"],
  rawValue: string | undefined,
): string | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const trimmed = rawValue.trim();

  if (itemType === CHECKLIST_ITEM_TYPE.CHECKBOX) {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

function isResponseValidForItem(
  response: ChecklistResponse | undefined,
  item: ChecklistTemplateItem,
): boolean {
  if (!response) {
    return false;
  }

  if (item.requires_photo && response.photo_ids.length === 0) {
    return false;
  }

  switch (item.item_type) {
    case CHECKLIST_ITEM_TYPE.CONDITION:
      return response.condition_rating !== undefined;
    case CHECKLIST_ITEM_TYPE.CHECKBOX:
      return response.value === "true" || response.value === "false";
    case CHECKLIST_ITEM_TYPE.TEXT:
      return (response.value?.trim().length ?? 0) > 0;
    case CHECKLIST_ITEM_TYPE.NUMBER: {
      if ((response.value?.trim().length ?? 0) === 0) {
        return false;
      }

      const numericValue = Number(response.value);
      return Number.isFinite(numericValue);
    }
    case CHECKLIST_ITEM_TYPE.PHOTO:
      return response.photo_ids.length > 0;
    case CHECKLIST_ITEM_TYPE.PHOTO_CONDITION:
      return response.condition_rating !== undefined && response.photo_ids.length > 0;
    default:
      return false;
  }
}

function assertValidResponsePayload(
  item: ChecklistTemplateItem,
  response: Omit<ChecklistResponse, "completed_at">,
): void {
  if (item.requires_photo && response.photo_ids.length === 0) {
    throw new Error(`Photo evidence is required for item: ${item.label}`);
  }

  switch (item.item_type) {
    case CHECKLIST_ITEM_TYPE.CONDITION:
      if (response.condition_rating === undefined) {
        throw new Error(`condition_rating is required for CONDITION item: ${item.label}`);
      }
      return;
    case CHECKLIST_ITEM_TYPE.CHECKBOX:
      if (response.value !== "true" && response.value !== "false") {
        throw new Error(`value must be \"true\" or \"false\" for CHECKBOX item: ${item.label}`);
      }
      return;
    case CHECKLIST_ITEM_TYPE.TEXT:
      if ((response.value?.trim().length ?? 0) === 0) {
        throw new Error(`value is required for TEXT item: ${item.label}`);
      }
      return;
    case CHECKLIST_ITEM_TYPE.NUMBER: {
      if ((response.value?.trim().length ?? 0) === 0) {
        throw new Error(`value is required for NUMBER item: ${item.label}`);
      }

      const numericValue = Number(response.value);
      if (!Number.isFinite(numericValue)) {
        throw new Error(`value must be a valid number string for NUMBER item: ${item.label}`);
      }
      return;
    }
    case CHECKLIST_ITEM_TYPE.PHOTO:
      if (response.photo_ids.length === 0) {
        throw new Error(`At least one photo is required for PHOTO item: ${item.label}`);
      }
      return;
    case CHECKLIST_ITEM_TYPE.PHOTO_CONDITION:
      if (response.condition_rating === undefined) {
        throw new Error(`condition_rating is required for PHOTO_CONDITION item: ${item.label}`);
      }
      if (response.photo_ids.length === 0) {
        throw new Error(`At least one photo is required for PHOTO_CONDITION item: ${item.label}`);
      }
      return;
    default:
      throw new Error(`Unsupported checklist item type: ${item.item_type}`);
  }
}

function calculateCompletenessScore(
  instance: { responses: ChecklistResponse[] },
  templateSections: ChecklistTemplateSection[],
  depth: ChecklistDepth,
): number {
  const requiredItems = getTemplateItemsForDepth(templateSections, depth).filter(
    (item) => item.is_required,
  );

  if (requiredItems.length === 0) {
    return 100;
  }

  const completedRequiredItems = requiredItems.filter((item) => {
    const response = instance.responses.find(
      (entry) => entry.item_id === item.item_id && entry.section_id === item.section_id,
    );
    return isResponseValidForItem(response, item);
  }).length;

  return Math.round((completedRequiredItems / requiredItems.length) * 100);
}

function assertCanReadChecklist(user: Doc<"users">, instance: Doc<"checklist_instances">): void {
  if (user.user_type === USER_TYPE.TENANT || user.user_type === USER_TYPE.OWNER) {
    throw new Error("You do not have permission to access checklists");
  }

  if (user.user_type === USER_TYPE.GUARD && instance.assigned_to !== user._id) {
    throw new Error("You can only access checklists assigned to you");
  }
}

function assertAssignedUser(user: Doc<"users">, instance: Doc<"checklist_instances">): void {
  if (instance.assigned_to !== user._id) {
    throw new Error("Only the assigned user can modify this checklist");
  }
}

async function validatePhotoAssets(
  ctx: MutationCtx,
  photoIds: Id<"_storage">[],
  photoMetadata: Array<{
    storage_id: Id<"_storage">;
    taken_at: number;
    lat?: number;
    lng?: number;
  }>,
): Promise<void> {
  const photoIdSet = new Set(photoIds);

  for (const metadata of photoMetadata) {
    if (!photoIdSet.has(metadata.storage_id)) {
      throw new Error("photo_metadata contains storage_id that is not present in photo_ids");
    }

    if (metadata.lat !== undefined && (metadata.lat < -90 || metadata.lat > 90)) {
      throw new Error("Photo latitude must be between -90 and 90");
    }

    if (metadata.lng !== undefined && (metadata.lng < -180 || metadata.lng > 180)) {
      throw new Error("Photo longitude must be between -180 and 180");
    }

    if (metadata.taken_at > Date.now() + 60_000) {
      throw new Error("Photo taken_at cannot be in the future");
    }

    if (metadata.taken_at < 0) {
      throw new Error("Photo taken_at must be a positive timestamp");
    }
  }

  await Promise.all(
    photoIds.map(async (photoId) => {
      const fileMetadata = await ctx.db.system.get("_storage", photoId);

      if (!fileMetadata) {
        throw new Error(`Photo file not found in storage: ${photoId}`);
      }

      const contentType = fileMetadata.contentType ?? "";
      if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
        throw new Error("Only JPEG and PNG images are allowed");
      }

      if (fileMetadata.size > MAX_PHOTO_SIZE_BYTES) {
        throw new Error("Photo file too large. Maximum allowed size is 10MB");
      }
    }),
  );
}

async function getTemplateForInstance(
  ctx: MutationCtx,
  instance: Doc<"checklist_instances">,
): Promise<Doc<"checklist_templates">> {
  const template = await ctx.db.get(instance.template_id);

  if (!template || template.is_deleted) {
    throw new Error("Checklist template not found");
  }

  return template;
}

async function createChecklistInstanceRecord(
  ctx: MutationCtx,
  args: {
    template_id: Id<"checklist_templates">;
    visit_id: Id<"visits">;
    assigned_to: Id<"users">;
    depth: ChecklistDepth;
  },
  assignedBy: Id<"users">,
): Promise<Id<"checklist_instances">> {
  const [template, visit, assignedUser, existingInstance] = await Promise.all([
    ctx.db.get(args.template_id),
    ctx.db.get(args.visit_id),
    ctx.db.get(args.assigned_to),
    ctx.db
      .query("checklist_instances")
      .withIndex("by_visit_id", (q) => q.eq("visit_id", args.visit_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first(),
  ]);

  if (!template || template.is_deleted || !template.is_active) {
    throw new Error("Checklist template not found or inactive");
  }

  if (!visit) {
    throw new Error("Visit not found");
  }

  if (
    !assignedUser ||
    (assignedUser.user_type !== USER_TYPE.GUARD && assignedUser.user_type !== USER_TYPE.OPS)
  ) {
    throw new Error("Assigned user must be an existing guard or OPS agent");
  }

  if (assignedUser.user_type === USER_TYPE.GUARD && visit.assigned_guard_id !== args.assigned_to) {
    throw new Error("Checklist assignee must match the visit's assigned guard");
  }

  if (existingInstance) {
    throw new Error("Checklist instance already exists for this visit");
  }

  const filteredSections = filterSectionsByDepth(template.sections, args.depth);

  if (filteredSections.length === 0) {
    throw new Error("No checklist items are available for the selected depth");
  }

  return await ctx.db.insert("checklist_instances", {
    template_id: args.template_id,
    visit_id: args.visit_id,
    assigned_to: args.assigned_to,
    assigned_by: assignedBy,
    depth: args.depth,
    status: CHECKLIST_STATUS.ASSIGNED,
    completeness_score: 0,
    responses: [],
    review_notes: undefined,
    reviewed_by: undefined,
    reviewed_at: undefined,
    submitted_at: undefined,
    started_at: undefined,
    is_deleted: false,
  });
}

export const createInstance = mutation({
  args: {
    template_id: v.id("checklist_templates"),
    visit_id: v.id("visits"),
    assigned_to: v.id("users"),
    depth: checklistDepthValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.VISITS_CREATE);

    return await createChecklistInstanceRecord(ctx, args, admin._id);
  },
});

export const createInstanceInternal = internalMutation({
  args: {
    template_id: v.id("checklist_templates"),
    visit_id: v.id("visits"),
    assigned_to: v.id("users"),
    assigned_by: v.id("users"),
    depth: checklistDepthValidator,
  },
  handler: async (ctx, args) => {
    return await createChecklistInstanceRecord(
      ctx,
      {
        template_id: args.template_id,
        visit_id: args.visit_id,
        assigned_to: args.assigned_to,
        depth: args.depth,
      },
      args.assigned_by,
    );
  },
});

export const startChecklist = mutation({
  args: {
    checklist_id: v.id("checklist_instances"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const instance = await ctx.db.get(args.checklist_id);

    if (!instance || instance.is_deleted) {
      throw new Error("Checklist instance not found");
    }

    assertAssignedUser(user, instance);
    validateTransition(instance.status, CHECKLIST_STATUS.IN_PROGRESS);

    const startedAt = instance.started_at ?? Date.now();

    await ctx.db.patch(instance._id, {
      status: CHECKLIST_STATUS.IN_PROGRESS,
      started_at: startedAt,
    });

    return await ctx.db.get(instance._id);
  },
});

export const updateResponse = mutation({
  args: {
    checklist_id: v.id("checklist_instances"),
    item_id: v.string(),
    section_id: v.string(),
    value: v.optional(v.string()),
    condition_rating: v.optional(conditionRatingValidator),
    photo_ids: v.array(v.id("_storage")),
    photo_metadata: v.array(photoMetadataValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const instance = await ctx.db.get(args.checklist_id);

    if (!instance || instance.is_deleted) {
      throw new Error("Checklist instance not found");
    }

    assertAssignedUser(user, instance);

    if (instance.status !== CHECKLIST_STATUS.IN_PROGRESS) {
      throw new Error(`Checklist responses can only be updated in IN_PROGRESS status`);
    }

    const template = await getTemplateForInstance(ctx, instance);
    const allowedItems = getTemplateItemsForDepth(template.sections, instance.depth);
    const item = allowedItems.find(
      (entry) => entry.section_id === args.section_id && entry.item_id === args.item_id,
    );

    if (!item) {
      throw new Error("Checklist item not found for this section/depth combination");
    }

    await validatePhotoAssets(ctx, args.photo_ids, args.photo_metadata);

    const normalizedResponse: Omit<ChecklistResponse, "completed_at"> = {
      item_id: args.item_id,
      section_id: args.section_id,
      value: normalizeResponseValueByItemType(item.item_type, args.value),
      condition_rating: args.condition_rating,
      photo_ids: args.photo_ids,
      photo_metadata: args.photo_metadata,
      notes: normalizeOptionalString(args.notes),
    };

    assertValidResponsePayload(item, normalizedResponse);

    const responseWithTimestamp: ChecklistResponse = {
      ...normalizedResponse,
      completed_at: Date.now(),
    };

    const existingIndex = instance.responses.findIndex(
      (response) =>
        response.item_id === responseWithTimestamp.item_id &&
        response.section_id === responseWithTimestamp.section_id,
    );

    const nextResponses = [...instance.responses];

    if (existingIndex >= 0) {
      nextResponses[existingIndex] = responseWithTimestamp;
    } else {
      nextResponses.push(responseWithTimestamp);
    }

    const completenessScore = calculateCompletenessScore(
      { responses: nextResponses },
      template.sections,
      instance.depth,
    );

    await ctx.db.patch(instance._id, {
      responses: nextResponses,
      completeness_score: completenessScore,
    });

    return await ctx.db.get(instance._id);
  },
});

export const submitChecklist = mutation({
  args: {
    checklist_id: v.id("checklist_instances"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const instance = await ctx.db.get(args.checklist_id);

    if (!instance || instance.is_deleted) {
      throw new Error("Checklist instance not found");
    }

    assertAssignedUser(user, instance);
    validateTransition(instance.status, CHECKLIST_STATUS.SUBMITTED);

    const template = await getTemplateForInstance(ctx, instance);
    const requiredItems = getTemplateItemsForDepth(template.sections, instance.depth).filter(
      (item) => item.is_required,
    );

    for (const item of requiredItems) {
      const response = instance.responses.find(
        (entry) => entry.item_id === item.item_id && entry.section_id === item.section_id,
      );

      if (!response) {
        throw new Error(`Missing required response for item: ${item.label}`);
      }

      if (!isResponseValidForItem(response, item)) {
        throw new Error(`Incomplete required response for item: ${item.label}`);
      }

      if (item.requires_photo && response.photo_ids.length === 0) {
        throw new Error(`Photo evidence is required for item: ${item.label}`);
      }
    }

    const completenessScore = calculateCompletenessScore(
      instance,
      template.sections,
      instance.depth,
    );

    await ctx.db.patch(instance._id, {
      status: CHECKLIST_STATUS.SUBMITTED,
      submitted_at: Date.now(),
      completeness_score: completenessScore,
    });

    return await ctx.db.get(instance._id);
  },
});

export const reviewChecklist = mutation({
  args: {
    checklist_id: v.id("checklist_instances"),
    outcome: reviewOutcomeValidator,
    review_notes: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.VISITS_EDIT);
    const instance = await ctx.db.get(args.checklist_id);

    if (!instance || instance.is_deleted) {
      throw new Error("Checklist instance not found");
    }

    if (
      instance.status !== CHECKLIST_STATUS.SUBMITTED &&
      instance.status !== CHECKLIST_STATUS.UNDER_REVIEW
    ) {
      throw new Error("Only SUBMITTED or UNDER_REVIEW checklists can be reviewed");
    }

    if (instance.status === CHECKLIST_STATUS.SUBMITTED) {
      validateTransition(instance.status, CHECKLIST_STATUS.UNDER_REVIEW);
      await ctx.db.patch(instance._id, {
        status: CHECKLIST_STATUS.UNDER_REVIEW,
      });
    }

    validateTransition(CHECKLIST_STATUS.UNDER_REVIEW, args.outcome);

    await ctx.db.patch(instance._id, {
      status: args.outcome,
      review_notes: normalizeOptionalString(args.review_notes),
      reviewed_by: admin._id,
      reviewed_at: Date.now(),
    });

    if (args.outcome === CHECKLIST_STATUS.APPROVED) {
      const visit = await ctx.db.get(instance.visit_id);

      if (!visit) {
        throw new Error("Linked visit not found for checklist");
      }

      await ctx.runMutation(internal.incentives.recomputeQualityScore, {
        guard_user_id: visit.assigned_guard_id,
        trigger: "CHECKLIST_APPROVED",
      });
    }

    return await ctx.db.get(instance._id);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    if (
      user.user_type !== USER_TYPE.GUARD &&
      user.user_type !== USER_TYPE.ADMIN &&
      user.user_type !== USER_TYPE.OPS
    ) {
      throw new Error("Only guards, admins, or OPS can upload checklist photos");
    }

    if (user.status !== "ACTIVE") {
      throw new Error("Account not active");
    }

    // Photos are only attachable via updateResponse on an IN_PROGRESS checklist
    // assigned to the caller, so only such a participant may mint upload URLs.
    const activeAssignedChecklist = await ctx.db
      .query("checklist_instances")
      .withIndex("by_assigned_to", (q) => q.eq("assigned_to", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), CHECKLIST_STATUS.IN_PROGRESS),
          q.neq(q.field("is_deleted"), true),
        ),
      )
      .first();

    if (!activeAssignedChecklist) {
      throw new Error("No in-progress checklist assigned to you");
    }

    await rateLimiter.limit(ctx, "checklist:upload_url_generation", {
      key: user._id,
      throws: true,
    });

    return await ctx.storage.generateUploadUrl();
  },
});

export const getByVisitId = query({
  args: {
    visit_id: v.id("visits"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const instance = await ctx.db
      .query("checklist_instances")
      .withIndex("by_visit_id", (q) => q.eq("visit_id", args.visit_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    if (!instance) {
      return null;
    }

    assertCanReadChecklist(user, instance);

    return instance;
  },
});

export const getById = query({
  args: {
    checklist_id: v.id("checklist_instances"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const instance = await ctx.db.get(args.checklist_id);

    if (!instance || instance.is_deleted) {
      throw new Error("Checklist instance not found");
    }

    assertCanReadChecklist(user, instance);

    return instance;
  },
});

export const getPhotoUrls = query({
  args: {
    checklist_id: v.id("checklist_instances"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const instance = await ctx.db.get(args.checklist_id);

    if (!instance || instance.is_deleted) {
      throw new Error("Checklist instance not found");
    }

    assertCanReadChecklist(user, instance);

    const uniquePhotoIds = new Set<Id<"_storage">>();

    for (const response of instance.responses) {
      for (const photoId of response.photo_ids) {
        uniquePhotoIds.add(photoId);
      }
    }

    return await Promise.all(
      Array.from(uniquePhotoIds).map(async (storage_id) => ({
        storage_id,
        url: await ctx.storage.getUrl(storage_id),
      })),
    );
  },
});

export const listForReview = query({
  args: {
    status: v.optional(checklistStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.VISITS_VIEW);

    const requestedLimit = args.limit === undefined ? 50 : Math.floor(args.limit);
    const limit = Math.max(1, Math.min(requestedLimit, 200));

    let instances: Doc<"checklist_instances">[];

    if (args.status !== undefined) {
      instances = await ctx.db
        .query("checklist_instances")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .order("desc")
        .take(limit);
    } else {
      const [submitted, underReview] = await Promise.all([
        ctx.db
          .query("checklist_instances")
          .withIndex("by_status", (q) => q.eq("status", CHECKLIST_STATUS.SUBMITTED))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .take(limit),
        ctx.db
          .query("checklist_instances")
          .withIndex("by_status", (q) => q.eq("status", CHECKLIST_STATUS.UNDER_REVIEW))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .take(limit),
      ]);

      instances = [...submitted, ...underReview]
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, limit);
    }

    return await Promise.all(
      instances.map(async (instance) => {
        const [assignedUser, template, visit] = await Promise.all([
          ctx.db.get(instance.assigned_to),
          ctx.db.get(instance.template_id),
          ctx.db.get(instance.visit_id),
        ]);

        return {
          ...instance,
          assigned_user: assignedUser
            ? {
                _id: assignedUser._id,
                name: assignedUser.name,
                phone: assignedUser.phone,
                status: assignedUser.status,
                user_type: assignedUser.user_type,
              }
            : null,
          template: template
            ? {
                _id: template._id,
                name: template.name,
                depth: template.depth,
              }
            : null,
          visit: visit
            ? {
                _id: visit._id,
                status: visit.status,
                scheduled_start: visit.scheduled_start,
                scheduled_end: visit.scheduled_end,
              }
            : null,
        };
      }),
    );
  },
});
