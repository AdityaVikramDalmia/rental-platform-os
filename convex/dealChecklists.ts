import { anyApi } from "convex/server";
import { v } from "convex/values";
import { CHAT_CHANNEL_STATUS, TENANT_INQUIRY_STATUS } from "../lib/constants";
import { requireAuth, requireBackoffice, requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireChatParticipant } from "./chatChannels";
import { internalMutation, internalQuery, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const DEAL_CHECKLIST_VIEW_PERMISSION = "deal_checklists.view";
const DEAL_CHECKLIST_MANAGE_PERMISSION = "deal_checklists.manage";

const LOW_CONFIDENCE_THRESHOLD = 0.5;
const MAX_GENERATED_CHECKLIST_ITEMS = 50;
const MAX_CHECKLIST_ITEM_DESCRIPTION_CHARS = 500;
const MAX_CHECKLIST_ITEM_EXTRACTED_VALUE_CHARS = 200;
const MAX_CHECKLIST_ITEM_SOURCE_MESSAGE_IDS = 20;

const TERMINAL_INQUIRY_STATUSES: ReadonlySet<string> = new Set([
  TENANT_INQUIRY_STATUS.CLOSED,
  TENANT_INQUIRY_STATUS.REJECTED,
  TENANT_INQUIRY_STATUS.EXPIRED,
]);

const dealTermTypeValidator = v.union(
  v.literal("RENT_AMOUNT"),
  v.literal("DEPOSIT"),
  v.literal("LEASE_DURATION"),
  v.literal("MOVE_IN_DATE"),
  v.literal("MAINTENANCE"),
  v.literal("ESCALATION_CLAUSE"),
  v.literal("FURNISHING"),
  v.literal("LOCK_IN_PERIOD"),
  v.literal("NOTICE_PERIOD"),
  v.literal("BROKERAGE"),
  v.literal("CUSTOM"),
);

const checklistItemSourceValidator = v.union(
  v.literal("AI_EXTRACTED"),
  v.literal("ADMIN_ADDED"),
  v.literal("PARTY_RAISED"),
);

const checklistCreateItemValidator = v.object({
  item_id: v.optional(v.string()),
  term_type: dealTermTypeValidator,
  source: checklistItemSourceValidator,
  description: v.string(),
  extracted_value: v.optional(v.string()),
  source_message_ids: v.optional(v.array(v.id("chat_messages"))),
  confidence: v.optional(v.number()),
});

const checklistCreateArgsValidator = {
  inquiry_id: v.id("tenant_inquiries"),
  channel_id: v.id("chat_channels"),
  items: v.array(checklistCreateItemValidator),
} as const;

type DealChecklistItemDoc = Doc<"deal_checklists">["items"][number];

type ChecklistCreateItemInput = {
  item_id?: string;
  term_type: DealChecklistItemDoc["term_type"];
  source: DealChecklistItemDoc["source"];
  description: string;
  extracted_value?: string;
  source_message_ids?: Array<Id<"chat_messages">>;
  confidence?: number;
};

type ChecklistCreateArgs = {
  inquiry_id: Id<"tenant_inquiries">;
  channel_id: Id<"chat_channels">;
  items: ChecklistCreateItemInput[];
};

type CheckManagePermissionResult = {
  authorized: boolean;
  user_id?: Id<"users">;
};

type DealTermExtractionFailure = {
  success: false;
  error: string;
  detail?: string;
};

type DealTermExtractionSuccess = {
  success: true;
  terms: Array<{
    term_type: DealChecklistItemDoc["term_type"];
    description: string;
    extracted_value: string;
    source_message_ids: Array<Id<"chat_messages">>;
    confidence: number;
    needs_clarification: boolean;
    clarification_note?: string;
  }>;
  analyzed_message_count: number;
  was_truncated: boolean;
};

type DealTermExtractionResult = DealTermExtractionFailure | DealTermExtractionSuccess;

type GenerateFromChatSuccess = {
  success: true;
  checklist_id: Id<"deal_checklists">;
  extracted_terms_count: number;
  analyzed_message_count: number;
  was_truncated: boolean;
};

type GenerateFromChatResult = DealTermExtractionFailure | GenerateFromChatSuccess;

type SourceMessageRefsInput = {
  source_message_ids?: Array<Id<"chat_messages">>;
};

type DbReaderContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

function collectSourceMessageIds(items: SourceMessageRefsInput[]): Array<Id<"chat_messages">> {
  const sourceMessageIds: Array<Id<"chat_messages">> = [];
  const seen = new Set<string>();

  for (const item of items) {
    for (const messageId of item.source_message_ids ?? []) {
      const key = messageId.toString();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      sourceMessageIds.push(messageId);
    }
  }

  return sourceMessageIds;
}

async function validateSourceMessageIdsForChannel(
  ctx: DbReaderContext,
  channelId: Id<"chat_channels">,
  sourceMessageIds: Array<Id<"chat_messages">>,
): Promise<void> {
  for (const msgId of sourceMessageIds) {
    const msg = await ctx.db.get(msgId);
    if (!msg || msg.channel_id.toString() !== channelId.toString()) {
      throw new Error("Invalid source message reference");
    }
  }
}

function canTransitionChecklistStatus(from: string, to: string): boolean {
  if (to === "SUPERSEDED") {
    return ["DRAFT", "SHARED", "IN_REVIEW", "DISPUTED"].includes(from);
  }

  const transitions: Record<string, ReadonlyArray<string>> = {
    DRAFT: ["SHARED"],
    SHARED: ["IN_REVIEW"],
    IN_REVIEW: ["APPROVED", "DISPUTED", "DRAFT"],
    APPROVED: [],
    DISPUTED: ["IN_REVIEW", "DRAFT"],
    SUPERSEDED: [],
  };

  return (transitions[from] ?? []).includes(to);
}

async function ensureChecklistReadAccess(
  ctx: QueryCtx,
  user: Doc<"users">,
  channelId: Id<"chat_channels">,
): Promise<void> {
  if (user.user_type === "ADMIN" || user.user_type === "OPS") {
    await requirePermission(ctx, DEAL_CHECKLIST_VIEW_PERMISSION);
    return;
  }

  await requireChatParticipant(ctx, channelId, user);
}

async function createDraftChecklist(
  ctx: MutationCtx,
  args: ChecklistCreateArgs,
  createdByAdminId: Id<"users">,
): Promise<Id<"deal_checklists">> {
  const creator = await ctx.db.get(createdByAdminId);
  if (!creator || (creator.user_type !== "ADMIN" && creator.user_type !== "OPS")) {
    throw new Error("Checklist creator must be an admin or OPS user");
  }

  const inquiry = await ctx.db.get(args.inquiry_id);
  if (!inquiry) {
    throw new Error("Tenant inquiry not found");
  }

  const channel = await ctx.db.get(args.channel_id);
  if (!channel) {
    throw new Error("Chat channel not found");
  }

  if (channel.inquiry_id.toString() !== args.inquiry_id.toString()) {
    throw new Error("Chat channel does not belong to this inquiry");
  }

  if (channel.status !== CHAT_CHANNEL_STATUS.ACTIVE) {
    throw new Error("Channel is not active");
  }

  if (TERMINAL_INQUIRY_STATUSES.has(inquiry.status)) {
    throw new Error(`Cannot create checklist for inquiry in status ${inquiry.status}`);
  }

  const existingChecklist = await ctx.db
    .query("deal_checklists")
    .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", args.inquiry_id))
    .first();

  if (existingChecklist) {
    throw new Error("Checklist already exists for this inquiry. Use regenerate instead.");
  }

  const sourceMessageIds = collectSourceMessageIds(args.items);
  if (sourceMessageIds.length > 0) {
    await validateSourceMessageIdsForChannel(ctx, channel._id, sourceMessageIds);
  }

  const now = Date.now();
  const normalizedItems = args.items.map((item, index) => {
    const resolvedItemId = item.item_id?.trim() || `item-${now}-${index + 1}`;
    const description = item.description.trim();
    if (description.length === 0) {
      throw new Error("Checklist item description cannot be empty");
    }

    const extractedValue = item.extracted_value?.trim();

    return {
      item_id: resolvedItemId,
      term_type: item.term_type,
      source: item.source,
      description,
      extracted_value: extractedValue && extractedValue.length > 0 ? extractedValue : undefined,
      admin_edited_value: undefined,
      source_message_ids: item.source_message_ids,
      confidence: item.confidence,
      tenant_approval: {
        status: "PENDING" as const,
        responded_at: undefined,
        comment: undefined,
      },
      owner_approval: {
        status: "PENDING" as const,
        responded_at: undefined,
        comment: undefined,
      },
      overall_status: "UNREVIEWED" as const,
    };
  });

  const uniqueItemIds = new Set(normalizedItems.map((item) => item.item_id));
  if (uniqueItemIds.size !== normalizedItems.length) {
    throw new Error("Checklist items must have unique item_id values");
  }

  return await ctx.db.insert("deal_checklists", {
    inquiry_id: args.inquiry_id,
    channel_id: args.channel_id,
    version: 1,
    previous_version_id: undefined,
    items: normalizedItems,
    status: "DRAFT",
    created_by_admin_id: createdByAdminId,
    created_at: now,
    shared_at: undefined,
    approved_at: undefined,
  });
}

export const checkManagePermission = internalQuery({
  args: {},
  handler: async (ctx) => {
    try {
      const user = await requirePermission(ctx, DEAL_CHECKLIST_MANAGE_PERMISSION);
      return {
        authorized: true,
        user_id: user._id,
      };
    } catch {
      return {
        authorized: false,
        user_id: undefined,
      };
    }
  },
});

export const validateInquiryChannelAssociation = internalQuery({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
    channel_id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    const inquiry = await ctx.db.get(args.inquiry_id);
    if (!inquiry) {
      throw new Error("Tenant inquiry not found");
    }

    const channel = await ctx.db.get(args.channel_id);
    if (!channel) {
      throw new Error("Chat channel not found");
    }

    if (channel.inquiry_id.toString() !== args.inquiry_id.toString()) {
      throw new Error("Chat channel does not belong to this inquiry");
    }

    return true;
  },
});

export const validateSourceMessagesForChannel = internalQuery({
  args: {
    channel_id: v.id("chat_channels"),
    source_message_ids: v.array(v.id("chat_messages")),
  },
  handler: async (ctx, args) => {
    await validateSourceMessageIdsForChannel(ctx, args.channel_id, args.source_message_ids);
    return true;
  },
});

export const createInternal = internalMutation({
  args: {
    ...checklistCreateArgsValidator,
    created_by_admin_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await createDraftChecklist(
      ctx,
      {
        inquiry_id: args.inquiry_id,
        channel_id: args.channel_id,
        items: args.items,
      },
      args.created_by_admin_id,
    );
  },
});

export const generateFromChat = action({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
    channel_id: v.id("chat_channels"),
  },
  handler: async (ctx, args): Promise<GenerateFromChatResult> => {
    const permissionCheck: CheckManagePermissionResult = await ctx.runQuery(
      anyApi["dealChecklists"].checkManagePermission,
      {},
    );
    if (!permissionCheck.authorized || !permissionCheck.user_id) {
      throw new Error(`Missing permission: ${DEAL_CHECKLIST_MANAGE_PERMISSION}`);
    }

    await ctx.runQuery(anyApi["dealChecklists"].validateInquiryChannelAssociation, {
      inquiry_id: args.inquiry_id,
      channel_id: args.channel_id,
    });

    const extractionResult: DealTermExtractionResult = await ctx.runAction(
      anyApi["actions/dealTermExtraction"].extractTerms,
      {
        channel_id: args.channel_id,
      },
    );

    if (!extractionResult.success) {
      return extractionResult;
    }

    const postExtractionPermissionCheck: CheckManagePermissionResult = await ctx.runQuery(
      anyApi["dealChecklists"].checkManagePermission,
      {},
    );
    if (!postExtractionPermissionCheck.authorized || !postExtractionPermissionCheck.user_id) {
      throw new Error(`Missing permission: ${DEAL_CHECKLIST_MANAGE_PERMISSION}`);
    }

    const transformedItems: ChecklistCreateItemInput[] = [];

    for (const term of extractionResult.terms.slice(0, MAX_GENERATED_CHECKLIST_ITEMS)) {
      const baseDescription = term.description.trim();
      if (baseDescription.length === 0) {
        continue;
      }

      const clarificationSuffix = term.needs_clarification
        ? ` [Needs clarification${term.clarification_note ? `: ${term.clarification_note}` : ""}]`
        : "";

      const description = `${baseDescription}${clarificationSuffix}`
        .trim()
        .slice(0, MAX_CHECKLIST_ITEM_DESCRIPTION_CHARS);
      if (description.length === 0) {
        continue;
      }

      const extractedValue = term.extracted_value
        .trim()
        .slice(0, MAX_CHECKLIST_ITEM_EXTRACTED_VALUE_CHARS);

      transformedItems.push({
        item_id: undefined,
        term_type: term.term_type,
        source: "AI_EXTRACTED",
        description,
        extracted_value: extractedValue.length > 0 ? extractedValue : undefined,
        source_message_ids:
          term.source_message_ids.length > 0
            ? Array.from(new Set(term.source_message_ids)).slice(
                0,
                MAX_CHECKLIST_ITEM_SOURCE_MESSAGE_IDS,
              )
            : undefined,
        confidence: term.confidence,
      });
    }

    if (transformedItems.length === 0) {
      throw new Error(
        "No deal terms found in chat conversation. Ensure there are actual negotiation messages before generating a checklist.",
      );
    }

    const sourceMessageIds = collectSourceMessageIds(transformedItems);
    if (sourceMessageIds.length > 0) {
      await ctx.runQuery(anyApi["dealChecklists"].validateSourceMessagesForChannel, {
        channel_id: args.channel_id,
        source_message_ids: sourceMessageIds,
      });
    }

    const checklistId: Id<"deal_checklists"> = await ctx.runMutation(
      anyApi["dealChecklists"].createInternal,
      {
        inquiry_id: args.inquiry_id,
        channel_id: args.channel_id,
        items: transformedItems,
        created_by_admin_id: postExtractionPermissionCheck.user_id,
      },
    );

    return {
      success: true,
      checklist_id: checklistId,
      extracted_terms_count: transformedItems.length,
      analyzed_message_count: extractionResult.analyzed_message_count,
      was_truncated: extractionResult.was_truncated,
    };
  },
});

/**
 * Creates a draft deal checklist from extracted terms for an inquiry/channel pair.
 */
export const create = mutation({
  args: checklistCreateArgsValidator,
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, DEAL_CHECKLIST_MANAGE_PERMISSION);

    await rateLimiter.limit(ctx, "checklist:create", {
      key: admin._id,
      throws: true,
    });

    return await createDraftChecklist(ctx, args, admin._id);
  },
});

/**
 * Updates a single checklist item's admin edited value while checklist is in draft.
 */
export const editItem = mutation({
  args: {
    checklist_id: v.id("deal_checklists"),
    item_id: v.string(),
    admin_edited_value: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, DEAL_CHECKLIST_MANAGE_PERMISSION);

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      throw new Error("Deal checklist not found");
    }

    if (checklist.status !== "DRAFT") {
      throw new Error(`Cannot edit checklist in status ${checklist.status} — must be DRAFT`);
    }

    const editedValue = args.admin_edited_value.trim();
    if (editedValue.length === 0) {
      throw new Error("admin_edited_value cannot be empty");
    }

    const targetItem = checklist.items.find((item) => item.item_id === args.item_id);
    if (!targetItem) {
      throw new Error("Checklist item not found");
    }

    const updatedItems = checklist.items.map((item) => {
      if (item.item_id !== args.item_id) {
        return item;
      }

      return {
        ...item,
        admin_edited_value: editedValue,
      };
    });

    await ctx.db.patch(args.checklist_id, {
      items: updatedItems,
    });

    return await ctx.db.get(args.checklist_id);
  },
});

/**
 * Shares a draft checklist with parties after low-confidence terms are reviewed.
 */
export const share = mutation({
  args: {
    checklist_id: v.id("deal_checklists"),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, DEAL_CHECKLIST_MANAGE_PERMISSION);

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      throw new Error("Deal checklist not found");
    }

    if (!checklist.items || checklist.items.length === 0) {
      throw new Error("Cannot share an empty checklist");
    }

    if (!canTransitionChecklistStatus(checklist.status, "SHARED")) {
      throw new Error(`Cannot share checklist in status ${checklist.status} — must be DRAFT`);
    }

    const hasUnreviewedLowConfidenceItem = checklist.items.some((item) => {
      const confidence = item.confidence ?? 1;
      const hasEditedValue = (item.admin_edited_value ?? "").trim().length > 0;
      return confidence < LOW_CONFIDENCE_THRESHOLD && !hasEditedValue;
    });

    if (hasUnreviewedLowConfidenceItem) {
      throw new Error(
        "Cannot share checklist with low-confidence unedited items. Review and edit those terms first.",
      );
    }

    await ctx.db.patch(args.checklist_id, {
      status: "SHARED",
      shared_at: Date.now(),
    });

    const now = Date.now();
    await ctx.db.insert("chat_messages", {
      channel_id: checklist.channel_id,
      sender_user_id: user._id,
      sender_role: "SYSTEM",
      original_content: `CHECKLIST_SHARED:${checklist._id}`,
      masked_content: `CHECKLIST_SHARED:${checklist._id}`,
      batch_id: undefined,
      status: "DELIVERED",
      failure_reason: undefined,
      admin_review_required: false,
      is_ai_processed: false,
      is_impersonated: false,
      is_deleted: false,
      created_at: now,
      delivered_at: now,
    });

    return await ctx.db.get(args.checklist_id);
  },
});

/**
 * Supersedes an existing checklist and creates a new draft version with approvals reset.
 */
export const regenerate = mutation({
  args: {
    checklist_id: v.id("deal_checklists"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, DEAL_CHECKLIST_MANAGE_PERMISSION);

    const reason = args.reason.trim();
    if (reason.length === 0) {
      throw new Error("Regeneration reason is required");
    }

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      throw new Error("Deal checklist not found");
    }

    if (!canTransitionChecklistStatus(checklist.status, "SUPERSEDED")) {
      throw new Error(
        `Cannot regenerate checklist in status ${checklist.status} — must not be SUPERSEDED`,
      );
    }

    const sourceMessageIds = collectSourceMessageIds(checklist.items);
    if (sourceMessageIds.length > 0) {
      await validateSourceMessageIdsForChannel(ctx, checklist.channel_id, sourceMessageIds);
    }

    const latestVersion = await ctx.db
      .query("deal_checklists")
      .withIndex("by_inquiry_and_version", (q) => q.eq("inquiry_id", checklist.inquiry_id))
      .order("desc")
      .first();

    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const now = Date.now();

    await ctx.db.patch(args.checklist_id, {
      status: "SUPERSEDED",
    });

    const copiedItems = checklist.items.map((item) => ({
      ...item,
      tenant_approval: {
        status: "PENDING" as const,
        responded_at: undefined,
        comment: undefined,
      },
      owner_approval: {
        status: "PENDING" as const,
        responded_at: undefined,
        comment: undefined,
      },
      overall_status: "UNREVIEWED" as const,
    }));

    const newChecklistId = await ctx.db.insert("deal_checklists", {
      inquiry_id: checklist.inquiry_id,
      channel_id: checklist.channel_id,
      version: nextVersion,
      previous_version_id: checklist._id,
      items: copiedItems,
      status: "DRAFT",
      created_by_admin_id: admin._id,
      created_at: now,
      shared_at: undefined,
      approved_at: undefined,
    });

    return newChecklistId;
  },
});

/**
 * Returns the latest non-superseded checklist for an inquiry.
 */
export const getByInquiry = query({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const isBackofficeUser = user.user_type === "ADMIN" || user.user_type === "OPS";

    const checklist = await ctx.db
      .query("deal_checklists")
      .withIndex("by_inquiry_and_version", (q) => q.eq("inquiry_id", args.inquiry_id))
      .order("desc")
      .filter((q) => q.neq(q.field("status"), "SUPERSEDED"))
      .first();

    if (checklist) {
      await ensureChecklistReadAccess(ctx, user, checklist.channel_id);

      if (!isBackofficeUser) {
        const visibleStatuses = new Set(["SHARED", "IN_REVIEW", "DISPUTED", "APPROVED"]);
        if (!visibleStatuses.has(checklist.status)) {
          return null;
        }
      }

      return checklist;
    }

    if (isBackofficeUser) {
      await requirePermission(ctx, DEAL_CHECKLIST_VIEW_PERMISSION);
      return null;
    }

    const inquiryChannel = await ctx.db
      .query("chat_channels")
      .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", args.inquiry_id))
      .first();

    if (!inquiryChannel) {
      return null;
    }

    await ensureChecklistReadAccess(ctx, user, inquiryChannel._id);
    return null;
  },
});

/**
 * Returns a checklist by ID if the caller has checklist-view permission or channel participation.
 */
export const getById = query({
  args: {
    checklist_id: v.id("deal_checklists"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    let isBackofficeUser = false;

    try {
      await requireBackoffice(ctx);
      isBackofficeUser = true;
    } catch {
      isBackofficeUser = false;
    }

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      return null;
    }

    await ensureChecklistReadAccess(ctx, user, checklist.channel_id);

    if (!isBackofficeUser) {
      const visibleStatuses = new Set(["SHARED", "IN_REVIEW", "DISPUTED", "APPROVED"]);
      if (!visibleStatuses.has(checklist.status)) {
        return null;
      }
    }

    return checklist;
  },
});

/**
 * Lists all checklist versions for an inquiry ordered by latest version first.
 */
export const listVersions = query({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, DEAL_CHECKLIST_VIEW_PERMISSION);

    return await ctx.db
      .query("deal_checklists")
      .withIndex("by_inquiry_and_version", (q) => q.eq("inquiry_id", args.inquiry_id))
      .order("desc")
      .collect();
  },
});
