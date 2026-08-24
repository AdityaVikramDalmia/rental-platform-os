import { v } from "convex/values";
import { CHAT_MESSAGE_STATUS, NOTIFICATION_CHANNEL } from "../lib/constants";
import { requireTenant } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./functions";
import { getUnreadCountForChannelForUser } from "./chatReadReceipts";

type ConsolidatedItem = {
  type: "notification" | "message";
  id: string;
  timestamp: number;
  title: string;
  body: string;
  read: boolean;
  sourceId: string;
};

type ConsolidatedCursor = {
  timestamp: number;
  id: string;
};

function parseConsolidatedCursor(cursor: string | undefined): ConsolidatedCursor | null {
  if (!cursor) {
    return null;
  }

  const separatorIndex = cursor.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === cursor.length - 1) {
    return null;
  }

  const timestampPart = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);
  const timestamp = Number.parseInt(timestampPart, 10);

  if (!Number.isInteger(timestamp) || timestamp < 0 || id.length === 0) {
    return null;
  }

  return {
    timestamp,
    id,
  };
}

function compareConsolidatedItemsDesc(a: ConsolidatedItem, b: ConsolidatedItem): number {
  if (a.timestamp !== b.timestamp) {
    return b.timestamp - a.timestamp;
  }

  return b.id.localeCompare(a.id);
}

function isBeforeCursor(item: ConsolidatedItem, cursor: ConsolidatedCursor | null): boolean {
  if (!cursor) {
    return true;
  }

  return (
    item.timestamp < cursor.timestamp ||
    (item.timestamp === cursor.timestamp && item.id.localeCompare(cursor.id) < 0)
  );
}

function toCursor(item: ConsolidatedItem): string {
  return `${item.timestamp}:${item.id}`;
}

function isTenantVisibleChannel(channelType: string | undefined): boolean {
  return channelType === undefined || channelType === "OPS_TENANT" || channelType === "COMBINED";
}

function getMessageTimestamp(message: Doc<"chat_messages">): number {
  return message.delivered_at ?? message.created_at;
}

function isMessageRead(
  message: Doc<"chat_messages">,
  receipt: Doc<"chat_read_receipts"> | null,
  tenantUserId: Id<"users">,
): boolean {
  if (message.sender_user_id.toString() === tenantUserId.toString()) {
    return true;
  }

  if (!receipt) {
    return false;
  }

  const messageTimestamp = getMessageTimestamp(message);

  if (messageTimestamp < receipt.last_read_at) {
    return true;
  }

  if (messageTimestamp > receipt.last_read_at) {
    return false;
  }

  return receipt.last_read_message_id.toString() === message._id.toString();
}

async function getListingContext(ctx: QueryCtx, inquiry: Doc<"tenant_inquiries">) {
  const listing = await ctx.db.get(inquiry.listing_id);
  const lead = listing ? await ctx.db.get(listing.lead_id) : null;
  const building = lead?.building_id ? await ctx.db.get(lead.building_id) : null;

  return {
    listing,
    lead,
    building,
  };
}

export const getUnreadCount = query({
  args: {
    tenantUserId: v.optional(v.id("users")),
  },
  handler: async (ctx) => {
    const tenant = await requireTenant(ctx);

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_is_read", (q) => q.eq("user_id", tenant._id).eq("is_read", false))
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .collect();

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

    const tenantChannels = channelsByInquiry
      .flat()
      .filter((channel) => isTenantVisibleChannel(channel.channel_type));

    const unreadCounts = await Promise.all(
      tenantChannels.map((channel) =>
        getUnreadCountForChannelForUser(ctx, channel._id, tenant._id),
      ),
    );

    const unreadMessages = Math.min(
      unreadCounts.reduce((sum, count) => sum + count, 0),
      99,
    );

    return {
      notifications: unreadNotifications.length,
      messages: unreadMessages,
      total: unreadNotifications.length + unreadMessages,
    };
  },
});

export const getConsolidated = query({
  args: {
    tenantUserId: v.optional(v.id("users")),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const cursor = parseConsolidatedCursor(args.cursor);
    const sourceFetchLimit = Math.min(limit * 2, 200);

    const notificationsQuery = cursor
      ? ctx.db
          .query("notifications")
          .withIndex("by_user_and_created", (q) =>
            q.eq("user_id", tenant._id).lte("created_at", cursor.timestamp),
          )
      : ctx.db
          .query("notifications")
          .withIndex("by_user_and_created", (q) => q.eq("user_id", tenant._id));

    const notifications = await notificationsQuery
      .filter((q) =>
        q.and(
          q.eq(q.field("is_deleted"), false),
          q.eq(q.field("channel"), NOTIFICATION_CHANNEL.IN_APP),
        ),
      )
      .order("desc")
      .take(sourceFetchLimit);

    const notificationItems: ConsolidatedItem[] = notifications
      .map(
        (notification): ConsolidatedItem => ({
          type: "notification",
          id: String(notification._id),
          timestamp: notification.created_at,
          title: notification.title,
          body: notification.body,
          read: notification.is_read,
          sourceId: String(notification.event_id ?? notification._id),
        }),
      )
      .filter((item) => isBeforeCursor(item, cursor))
      .sort(compareConsolidatedItemsDesc)
      .slice(0, limit);

    const inquiries = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_tenant_id", (q) => q.eq("tenant_id", tenant._id))
      .collect();

    const inquiryMap = new Map<string, Doc<"tenant_inquiries">>();

    for (const inquiry of inquiries) {
      inquiryMap.set(String(inquiry._id), inquiry);
    }

    const channelsByInquiry = await Promise.all(
      inquiries.map((inquiry) =>
        ctx.db
          .query("chat_channels")
          .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", inquiry._id))
          .collect(),
      ),
    );

    const tenantChannels = channelsByInquiry
      .flat()
      .filter((channel) => isTenantVisibleChannel(channel.channel_type));

    const channelContextEntries = await Promise.all(
      tenantChannels.map(async (channel) => {
        const inquiry = inquiryMap.get(String(channel.inquiry_id));
        if (!inquiry) {
          return [String(channel._id), { title: "Conversation" }] as const;
        }

        const context = await getListingContext(ctx, inquiry);
        const titleParts = [
          context.building?.name,
          context.lead?.flat_number ? `Flat ${context.lead.flat_number}` : null,
        ].filter((part): part is string => Boolean(part));
        const fallbackTitle = context.listing?.slug
          ? `/listing/${context.listing.slug}`
          : "Conversation";

        return [
          String(channel._id),
          {
            title: titleParts.length > 0 ? titleParts.join(" • ") : fallbackTitle,
          },
        ] as const;
      }),
    );
    const channelContextMap = new Map<string, { title: string }>(channelContextEntries);

    const receiptEntries = await Promise.all(
      tenantChannels.map(async (channel) => {
        const receipt = await ctx.db
          .query("chat_read_receipts")
          .withIndex("by_channel_and_user", (q) =>
            q.eq("channel_id", channel._id).eq("user_id", tenant._id),
          )
          .first();

        return [String(channel._id), receipt ?? null] as const;
      }),
    );
    const receiptMap = new Map<string, Doc<"chat_read_receipts"> | null>(receiptEntries);

    const messageGroups = await Promise.all(
      tenantChannels.map((channel) =>
        (cursor
          ? ctx.db
              .query("chat_messages")
              .withIndex("by_channel_and_created", (q) =>
                q.eq("channel_id", channel._id).lte("created_at", cursor.timestamp),
              )
          : ctx.db
              .query("chat_messages")
              .withIndex("by_channel_and_created", (q) => q.eq("channel_id", channel._id))
        )
          .filter((q) =>
            q.and(
              q.eq(q.field("status"), CHAT_MESSAGE_STATUS.DELIVERED),
              q.neq(q.field("is_deleted"), true),
            ),
          )
          .order("desc")
          .take(limit),
      ),
    );

    const messageCandidates: ConsolidatedItem[] = [];

    for (let index = 0; index < tenantChannels.length; index += 1) {
      const channel = tenantChannels[index];
      const channelMessages = messageGroups[index] ?? [];
      const context = channelContextMap.get(String(channel._id));
      const receipt = receiptMap.get(String(channel._id)) ?? null;

      for (const message of channelMessages) {
        const isOwnMessage = message.sender_user_id.toString() === tenant._id.toString();
        const body = isOwnMessage
          ? message.original_content
          : (message.masked_content ?? "Message processing...");

        const item: ConsolidatedItem = {
          type: "message",
          id: String(message._id),
          timestamp: getMessageTimestamp(message),
          title: context?.title ?? "Conversation",
          body,
          read: isMessageRead(message, receipt, tenant._id),
          sourceId: String(channel._id),
        };

        if (isBeforeCursor(item, cursor)) {
          messageCandidates.push(item);
        }
      }
    }

    const messageItems = messageCandidates.sort(compareConsolidatedItemsDesc).slice(0, limit);

    const mergedItems = [...notificationItems, ...messageItems]
      .sort(compareConsolidatedItemsDesc)
      .slice(0, limit);

    const nextCursor =
      mergedItems.length === limit ? toCursor(mergedItems[mergedItems.length - 1]) : null;

    return {
      items: mergedItems,
      nextCursor,
    };
  },
});
