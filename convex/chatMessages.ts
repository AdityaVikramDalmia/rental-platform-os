import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  CHAT_CHANNEL_STATUS,
  CHAT_MESSAGE_STATUS,
  PERMISSIONS,
  CHAT_SENDER_ROLE,
  SYSTEM_CONFIG_KEYS,
  USER_TYPE,
} from "../lib/constants";
import { validateMessageTransition } from "../lib/chat";
import { requireAuth, requirePermission } from "./auth.helpers";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { type ChatAccess, requireChatParticipant } from "./chatChannels";
import { internalMutation, internalQuery, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

/**
 * sender_role comes from how the caller reached the channel. A user who is both tenant and
 * owner of the inquiry holds both labels truthfully; active_persona only picks between them.
 */
function resolveSenderRole(
  access: ChatAccess,
  user: Doc<"users">,
): (typeof CHAT_SENDER_ROLE)[keyof typeof CHAT_SENDER_ROLE] {
  if (access.kind === "PARTY") {
    const activePersona = user.active_persona ?? user.user_type;
    return access.partyRoles.find((role) => role === activePersona) ?? access.partyRoles[0];
  }

  if (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS) {
    return CHAT_SENDER_ROLE.OPS;
  }

  throw new Error("Not authorized to send chat messages");
}

function sanitizeMessageForViewer<
  T extends {
    status: string;
    original_content: string;
    masked_content?: string;
    failure_reason?: string;
    admin_review_required: boolean;
  },
>(message: T): T {
  return {
    ...message,
    original_content:
      message.status === CHAT_MESSAGE_STATUS.FAILED
        ? "Message unavailable"
        : (message.masked_content ?? "Message processing..."),
    failure_reason: undefined,
    admin_review_required: false,
  };
}

export const send = mutation({
  args: {
    channel_id: v.id("chat_channels"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const access = await requireChatParticipant(ctx, args.channel_id, user, PERMISSIONS.CHAT_SEND);
    const channel = access.channel;

    if (channel.status !== CHAT_CHANNEL_STATUS.ACTIVE) {
      throw new Error("Cannot send messages to an archived channel");
    }

    const content = args.content.trim();
    if (content.length === 0) {
      throw new Error("Message content is required");
    }

    const maxLenConfig = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CHAT_MAX_MESSAGE_LENGTH))
      .first();
    const parsedMaxLen = maxLenConfig ? Number.parseInt(maxLenConfig.value, 10) : 2000;
    const maxLen = Number.isInteger(parsedMaxLen) && parsedMaxLen > 0 ? parsedMaxLen : 2000;

    if (content.length > maxLen) {
      throw new Error(`Message exceeds max length of ${maxLen} characters`);
    }

    const sender_role = resolveSenderRole(access, user);

    await rateLimiter.limit(ctx, "chat:send_message", {
      key: user._id,
      throws: true,
    });

    const messageId = await ctx.db.insert("chat_messages", {
      channel_id: args.channel_id,
      sender_user_id: user._id,
      sender_role,
      original_content: content,
      masked_content: undefined,
      batch_id: undefined,
      status: CHAT_MESSAGE_STATUS.SUBMITTED,
      failure_reason: undefined,
      admin_review_required: false,
      is_ai_processed: false,
      created_at: Date.now(),
    });

    if (sender_role === CHAT_SENDER_ROLE.TENANT) {
      await ctx.db.insert("audit_logs", {
        actor_user_id: user._id,
        actor_type: "TENANT",
        action: "tenant.message_sent",
        entity_type: "chat_messages",
        entity_id: String(messageId),
        changes: undefined,
        metadata: {
          tenantId: String(user._id),
          channelId: String(args.channel_id),
          messageId: String(messageId),
        },
      });
    } else if (sender_role === CHAT_SENDER_ROLE.OWNER) {
      await ctx.db.insert("audit_logs", {
        actor_user_id: user._id,
        actor_type: "OWNER",
        action: "owner.message_sent",
        entity_type: "chat_messages",
        entity_id: String(messageId),
        changes: undefined,
        metadata: {
          ownerId: String(user._id),
          channelId: String(args.channel_id),
          messageId: String(messageId),
        },
      });
    }

    await ctx.scheduler.runAfter(0, internal.chatBatching.queueMessage, {
      message_id: messageId,
      channel_id: args.channel_id,
      sender_user_id: user._id,
    });

    return messageId;
  },
});

export const sendAsAdmin = mutation({
  args: {
    channel_id: v.id("chat_channels"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, "chat.admin");

    const channel = await ctx.db.get(args.channel_id);
    if (!channel) {
      throw new Error("Chat channel not found");
    }

    if (channel.status !== CHAT_CHANNEL_STATUS.ACTIVE) {
      throw new Error("Cannot send messages to an archived channel");
    }

    const content = args.content.trim();
    if (content.length === 0) {
      throw new Error("Message content is required");
    }

    const now = Date.now();

    return await ctx.db.insert("chat_messages", {
      channel_id: args.channel_id,
      sender_user_id: admin._id,
      sender_role: "SYSTEM",
      original_content: content,
      masked_content: content,
      batch_id: undefined,
      status: CHAT_MESSAGE_STATUS.DELIVERED,
      failure_reason: undefined,
      admin_review_required: false,
      is_ai_processed: false,
      is_impersonated: false,
      created_at: now,
      delivered_at: now,
    });
  },
});

export const sendImpersonated = mutation({
  args: {
    channel_id: v.id("chat_channels"),
    content: v.string(),
    impersonate_as: v.union(v.literal("TENANT"), v.literal("OWNER")),
    skip_ai: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, "chat.admin");

    const channel = await ctx.db.get(args.channel_id);
    if (!channel) {
      throw new Error("Chat channel not found");
    }

    if (channel.status !== CHAT_CHANNEL_STATUS.ACTIVE) {
      throw new Error("Cannot send messages to an archived channel");
    }

    const content = args.content.trim();
    if (content.length === 0) {
      throw new Error("Message content is required");
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("chat_messages", {
      channel_id: args.channel_id,
      sender_user_id: admin._id,
      sender_role: args.impersonate_as,
      original_content: content,
      masked_content: args.skip_ai ? content : undefined,
      batch_id: undefined,
      status: args.skip_ai ? CHAT_MESSAGE_STATUS.DELIVERED : CHAT_MESSAGE_STATUS.SUBMITTED,
      failure_reason: undefined,
      admin_review_required: false,
      is_ai_processed: false,
      is_impersonated: true,
      impersonated_by_admin_id: admin._id,
      created_at: now,
      delivered_at: args.skip_ai ? now : undefined,
    });

    if (!args.skip_ai) {
      await ctx.scheduler.runAfter(0, internal.chatBatching.queueMessage, {
        message_id: messageId,
        channel_id: args.channel_id,
        sender_user_id: admin._id,
      });
    }

    return messageId;
  },
});

/**
 * @internal Used by batch pipeline. Also available for manual delivery recovery.
 */
export const markDelivered = internalMutation({
  args: {
    id: v.id("chat_messages"),
    masked_content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Chat message not found");
    }

    if (!validateMessageTransition(message.status, CHAT_MESSAGE_STATUS.DELIVERED)) {
      throw new Error(
        `Cannot transition message from ${message.status} to ${CHAT_MESSAGE_STATUS.DELIVERED}`,
      );
    }

    const deliveredAt = Date.now();

    await ctx.db.patch(args.id, {
      status: CHAT_MESSAGE_STATUS.DELIVERED,
      masked_content: args.masked_content,
      is_ai_processed: true,
      delivered_at: deliveredAt,
    });

    return await ctx.db.get(args.id);
  },
});

/**
 * @internal Used by batch pipeline. Also available for manual failure marking.
 */
export const markFailed = internalMutation({
  args: {
    id: v.id("chat_messages"),
    failure_reason: v.string(),
    admin_review_required: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Chat message not found");
    }

    if (!validateMessageTransition(message.status, CHAT_MESSAGE_STATUS.FAILED)) {
      throw new Error(
        `Cannot transition message from ${message.status} to ${CHAT_MESSAGE_STATUS.FAILED}`,
      );
    }

    await ctx.db.patch(args.id, {
      status: CHAT_MESSAGE_STATUS.FAILED,
      failure_reason: args.failure_reason,
      admin_review_required: args.admin_review_required ?? true,
    });

    return await ctx.db.get(args.id);
  },
});

export const listByChannel = query({
  args: {
    channel_id: v.id("chat_channels"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const access = await requireChatParticipant(ctx, args.channel_id, user, PERMISSIONS.CHAT_VIEW);
    const isBackofficeViewer = access.kind === "BACKOFFICE";

    const results = isBackofficeViewer
      ? await ctx.db
          .query("chat_messages")
          .withIndex("by_channel_and_created", (q) => q.eq("channel_id", args.channel_id))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("chat_messages")
          .withIndex("by_channel_and_created", (q) => q.eq("channel_id", args.channel_id))
          .filter((q) => q.neq(q.field("is_deleted"), true))
          .order("desc")
          .paginate(args.paginationOpts);

    const userId = user._id.toString();
    const sanitizedPage = results.page.map((message) => {
      if (message.sender_user_id.toString() === userId) {
        return message;
      }

      return sanitizeMessageForViewer(message);
    });

    return {
      ...results,
      page: sanitizedPage,
    };
  },
});

/**
 * @future P25+ — Message detail view for moderation drill-down
 */
export const getById = query({
  args: {
    id: v.id("chat_messages"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = user._id.toString();

    const message = await ctx.db.get(args.id);
    if (!message) {
      return null;
    }

    await requireChatParticipant(ctx, message.channel_id, user, PERMISSIONS.CHAT_VIEW);

    if (message.sender_user_id.toString() !== userId) {
      return sanitizeMessageForViewer(message);
    }

    return message;
  },
});

export const softDeleteMessage = mutation({
  args: {
    message_id: v.id("chat_messages"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "chat.admin");

    const message = await ctx.db.get(args.message_id);
    if (!message) {
      throw new Error("Chat message not found");
    }

    if (message.is_deleted) {
      throw new Error("Chat message is already deleted");
    }

    await ctx.db.patch(args.message_id, {
      is_deleted: true,
    });

    return await ctx.db.get(args.message_id);
  },
});

export const getFullTranscript = query({
  args: {
    channel_id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "chat.admin");

    const channel = await ctx.db.get(args.channel_id);
    if (!channel) {
      throw new Error("Chat channel not found");
    }

    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_channel_and_created", (q) => q.eq("channel_id", args.channel_id))
      .order("desc")
      .take(500);

    return messages.reverse().map((message) => ({
      ...message,
      original_content: message.original_content,
      masked_content: message.masked_content,
      sender_role: message.sender_role,
      is_impersonated: message.is_impersonated,
      impersonated_by_admin_id: message.impersonated_by_admin_id,
      is_deleted: message.is_deleted,
      status: message.status,
      admin_review_required: message.admin_review_required,
      is_ai_processed: message.is_ai_processed,
      created_at: message.created_at,
      delivered_at: message.delivered_at,
    }));
  },
});

export const listDeliveredForExtraction = internalQuery({
  args: {
    channel_id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channel_id);
    if (!channel) {
      throw new Error("Chat channel not found");
    }

    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_channel_and_created", (q) => q.eq("channel_id", args.channel_id))
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), CHAT_MESSAGE_STATUS.DELIVERED),
          q.neq(q.field("is_deleted"), true),
        ),
      )
      .take(200);

    return messages.reverse();
  },
});
