import { v } from "convex/values";
import { CHAT_MESSAGE_STATUS, PERMISSIONS, USER_TYPE } from "../lib/constants";
import { requireAuth, requirePermission, requireTenant } from "./auth.helpers";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireChatParticipant } from "./chatChannels";
import { mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

function isTenantVisibleChannel(channelType: string | undefined): boolean {
  return channelType === undefined || channelType === "OPS_TENANT" || channelType === "COMBINED";
}

export async function getUnreadCountForChannelForUser(
  ctx: QueryCtx,
  channelId: Id<"chat_channels">,
  userId: Id<"users">,
): Promise<number> {
  const MAX_UNREAD_DISPLAY = 99;

  const receipt = await ctx.db
    .query("chat_read_receipts")
    .withIndex("by_channel_and_user", (q) => q.eq("channel_id", channelId).eq("user_id", userId))
    .first();

  const deliveredBaseQuery = receipt
    ? ctx.db
        .query("chat_messages")
        .withIndex("by_channel_delivered", (q) =>
          q.eq("channel_id", channelId).gt("delivered_at", receipt.last_read_at),
        )
    : ctx.db
        .query("chat_messages")
        .withIndex("by_channel_delivered", (q) => q.eq("channel_id", channelId));

  const deliveredFilteredQuery = deliveredBaseQuery.filter((q) =>
    q.and(
      q.eq(q.field("status"), CHAT_MESSAGE_STATUS.DELIVERED),
      q.neq(q.field("sender_user_id"), userId),
      q.neq(q.field("is_deleted"), true),
    ),
  );

  const deliveredMessages = await (
    receipt
      ? deliveredFilteredQuery.filter((q) => q.neq(q.field("_id"), receipt.last_read_message_id))
      : deliveredFilteredQuery
  ).take(MAX_UNREAD_DISPLAY + 1);

  if (!receipt || deliveredMessages.length > MAX_UNREAD_DISPLAY) {
    return Math.min(deliveredMessages.length, MAX_UNREAD_DISPLAY);
  }

  const legacyMessages = await ctx.db
    .query("chat_messages")
    .withIndex("by_channel_and_created", (q) =>
      q.eq("channel_id", channelId).gt("created_at", receipt.last_read_at),
    )
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), CHAT_MESSAGE_STATUS.DELIVERED),
        q.neq(q.field("sender_user_id"), userId),
        q.neq(q.field("is_deleted"), true),
        q.eq(q.field("delivered_at"), undefined),
        q.neq(q.field("_id"), receipt.last_read_message_id),
      ),
    )
    .take(MAX_UNREAD_DISPLAY + 1);

  return Math.min(deliveredMessages.length + legacyMessages.length, MAX_UNREAD_DISPLAY);
}

export const markRead = mutation({
  args: {
    channel_id: v.id("chat_channels"),
    message_id: v.id("chat_messages"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);
    }

    await rateLimiter.limit(ctx, "chat:mark_read", {
      key: user._id,
      throws: true,
    });

    await requireChatParticipant(ctx, args.channel_id, user);

    const message = await ctx.db.get(args.message_id);
    if (!message) {
      throw new Error("Chat message not found");
    }

    if (message.channel_id !== args.channel_id) {
      throw new Error("Message does not belong to this channel");
    }

    if (message.status !== CHAT_MESSAGE_STATUS.DELIVERED) {
      return;
    }

    const readCursorAt = message.delivered_at ?? message.created_at;

    const existingReceipt = await ctx.db
      .query("chat_read_receipts")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channel_id", args.channel_id).eq("user_id", user._id),
      )
      .first();

    if (existingReceipt) {
      const isNewerMessage =
        readCursorAt > existingReceipt.last_read_at ||
        (readCursorAt === existingReceipt.last_read_at &&
          args.message_id !== existingReceipt.last_read_message_id);

      if (isNewerMessage) {
        await ctx.db.patch(existingReceipt._id, {
          last_read_message_id: args.message_id,
          last_read_at: readCursorAt,
        });

        return await ctx.db.get(existingReceipt._id);
      }

      return existingReceipt;
    }

    const receiptId = await ctx.db.insert("chat_read_receipts", {
      channel_id: args.channel_id,
      user_id: user._id,
      last_read_message_id: args.message_id,
      last_read_at: readCursorAt,
    });

    return await ctx.db.get(receiptId);
  },
});

/**
 * @future P25+ — Read receipt display in message UI (seen indicators)
 */
export const getForChannel = query({
  args: {
    channel_id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);
    }

    await requireChatParticipant(ctx, args.channel_id, user);

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      return await ctx.db
        .query("chat_read_receipts")
        .withIndex("by_channel_and_user", (q) => q.eq("channel_id", args.channel_id))
        .collect();
    }

    const ownReceipt = await ctx.db
      .query("chat_read_receipts")
      .withIndex("by_channel_and_user", (q) =>
        q.eq("channel_id", args.channel_id).eq("user_id", user._id),
      )
      .first();

    return ownReceipt ? [ownReceipt] : [];
  },
});

export const getUnreadCount = query({
  args: {
    channel_id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);
    }

    await requireChatParticipant(ctx, args.channel_id, user);

    return await getUnreadCountForChannelForUser(ctx, args.channel_id, user._id);
  },
});

export const getMyTotalUnread = query({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireTenant(ctx);

    const inquiries = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_tenant_id", (q) => q.eq("tenant_id", tenant._id))
      .collect();

    const channelsByInquiry = await Promise.all(
      inquiries.map((inquiry) =>
        ctx.db
          .query("chat_channels")
          .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", inquiry._id))
          .collect(),
      ),
    );

    const tenantVisibleChannels = channelsByInquiry
      .flat()
      .filter((channel) => isTenantVisibleChannel(channel.channel_type));

    const unreadCounts = await Promise.all(
      tenantVisibleChannels.map((channel) =>
        getUnreadCountForChannelForUser(ctx, channel._id, tenant._id),
      ),
    );

    const totalUnread = unreadCounts.reduce((sum, count) => sum + count, 0);
    return Math.min(totalUnread, 99);
  },
});
