import { CHAT_MESSAGE_STATUS, TENANT_INQUIRY_STATUS, VISIT_STATUS } from "../lib/constants";
import { requireTenant } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";

const TERMINAL_INQUIRY_STATUSES = new Set<string>([
  TENANT_INQUIRY_STATUS.CLOSED,
  TENANT_INQUIRY_STATUS.REJECTED,
  TENANT_INQUIRY_STATUS.EXPIRED,
]);

const TERMINAL_VISIT_STATUSES = new Set<string>([
  VISIT_STATUS.COMPLETED,
  VISIT_STATUS.CANCELLED,
  VISIT_STATUS.NO_SHOW,
]);

function isTenantVisibleChannel(channelType: string | undefined): boolean {
  return channelType === undefined || channelType === "OPS_TENANT" || channelType === "COMBINED";
}

function toTitleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

async function getListingTitle(
  ctx: QueryCtx,
  listingId: Id<"listings">,
  leadCache: Map<string, Doc<"leads"> | null>,
  buildingCache: Map<string, Doc<"buildings"> | null>,
): Promise<string> {
  const listing = await ctx.db.get(listingId);

  if (!listing) {
    return "Listing";
  }

  const leadCacheKey = String(listing.lead_id);
  if (!leadCache.has(leadCacheKey)) {
    leadCache.set(leadCacheKey, await ctx.db.get(listing.lead_id));
  }

  const lead = leadCache.get(leadCacheKey) ?? null;

  if (lead?.building_id) {
    const buildingCacheKey = String(lead.building_id);
    if (!buildingCache.has(buildingCacheKey)) {
      buildingCache.set(buildingCacheKey, await ctx.db.get(lead.building_id));
    }

    const building = buildingCache.get(buildingCacheKey) ?? null;

    if (building) {
      return `${building.name} Flat ${lead.flat_number}`;
    }

    return `Flat ${lead.flat_number}`;
  }

  if (listing.slug) {
    return toTitleFromSlug(listing.slug);
  }

  return `${listing.bhk_config} listing`;
}

async function getFavoritesRows(
  ctx: QueryCtx,
  tenantUserId: Id<"users">,
): Promise<Doc<"tenant_favorites">[]> {
  return await ctx.db
    .query("tenant_favorites")
    .withIndex("by_tenant", (q) => q.eq("tenant_user_id", tenantUserId))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();
}

async function getVisitsForInquiryIds(
  ctx: QueryCtx,
  inquiryIds: Id<"tenant_inquiries">[],
): Promise<Doc<"visits">[]> {
  if (inquiryIds.length === 0) {
    return [];
  }

  const visitGroups = await Promise.all(
    inquiryIds.map(async (inquiryId) => {
      return await ctx.db
        .query("visits")
        .withIndex("by_tenant_inquiry_id", (q) => q.eq("tenant_inquiry_id", inquiryId))
        .collect();
    }),
  );

  return visitGroups.flat();
}

async function getChannelsForInquiryIds(
  ctx: QueryCtx,
  inquiryIds: Id<"tenant_inquiries">[],
): Promise<Doc<"chat_channels">[]> {
  if (inquiryIds.length === 0) {
    return [];
  }

  const channelGroups = await Promise.all(
    inquiryIds.map(async (inquiryId) => {
      return await ctx.db
        .query("chat_channels")
        .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", inquiryId))
        .collect();
    }),
  );

  return channelGroups.flat();
}

async function getReadReceiptsForChannels(
  ctx: QueryCtx,
  channelIds: Id<"chat_channels">[],
  userId: Id<"users">,
): Promise<Doc<"chat_read_receipts">[]> {
  if (channelIds.length === 0) {
    return [];
  }

  const receiptGroups = await Promise.all(
    channelIds.map(async (channelId) => {
      return await ctx.db
        .query("chat_read_receipts")
        .withIndex("by_channel_and_user", (q) =>
          q.eq("channel_id", channelId).eq("user_id", userId),
        )
        .collect();
    }),
  );

  return receiptGroups.flat();
}

async function getDeliveredMessagesForChannels(
  ctx: QueryCtx,
  channelIds: Id<"chat_channels">[],
): Promise<Doc<"chat_messages">[]> {
  if (channelIds.length === 0) {
    return [];
  }

  const messageGroups = await Promise.all(
    channelIds.map(async (channelId) => {
      return await ctx.db
        .query("chat_messages")
        .withIndex("by_channel_id", (q) => q.eq("channel_id", channelId))
        .collect();
    }),
  );

  return messageGroups
    .flat()
    .filter(
      (message) => message.status === CHAT_MESSAGE_STATUS.DELIVERED && message.is_deleted !== true,
    );
}

type RecentActivity = {
  activity_type: "INQUIRY" | "VISIT" | "FAVORITE" | "CHAT";
  label: string;
  timestamp: number;
  href: string;
};

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireTenant(ctx);
    const now = Date.now();

    const inquiries = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_tenant_id", (q) => q.eq("tenant_id", tenant._id))
      .collect();

    const inquiryCounts: Record<string, number> = {};
    for (const inquiry of inquiries) {
      inquiryCounts[inquiry.status] = (inquiryCounts[inquiry.status] ?? 0) + 1;
    }

    const openInquiriesCount = inquiries.reduce((count, inquiry) => {
      return count + (TERMINAL_INQUIRY_STATUSES.has(inquiry.status) ? 0 : 1);
    }, 0);

    const inquiryIdList = inquiries.map((inquiry) => inquiry._id);
    const inquiryIds = new Set(inquiryIdList.map((inquiryId) => String(inquiryId)));

    const [allVisitsRaw, allChannelsRaw, favoriteRows] = await Promise.all([
      getVisitsForInquiryIds(ctx, inquiryIdList),
      getChannelsForInquiryIds(ctx, inquiryIdList),
      getFavoritesRows(ctx, tenant._id),
    ]);

    const allVisits = allVisitsRaw.filter(
      (visit) =>
        visit.tenant_inquiry_id !== undefined && inquiryIds.has(String(visit.tenant_inquiry_id)),
    );
    const upcomingVisits = allVisits
      .filter((visit) => visit.scheduled_start >= now && !TERMINAL_VISIT_STATUSES.has(visit.status))
      .sort((a, b) => a.scheduled_start - b.scheduled_start);

    const inquiriesById = new Map<string, Doc<"tenant_inquiries">>();
    for (const inquiry of inquiries) {
      inquiriesById.set(String(inquiry._id), inquiry);
    }

    const leadCache = new Map<string, Doc<"leads"> | null>();
    const buildingCache = new Map<string, Doc<"buildings"> | null>();

    const upcomingVisitRows = await Promise.all(
      upcomingVisits.slice(0, 5).map(async (visit) => {
        const inquiry = visit.tenant_inquiry_id
          ? (inquiriesById.get(String(visit.tenant_inquiry_id)) ?? null)
          : null;
        const listingId = visit.listing_id ?? inquiry?.listing_id;

        const listingTitle = listingId
          ? await getListingTitle(ctx, listingId, leadCache, buildingCache)
          : "Listing";

        return {
          visit_id: visit._id,
          listing_title: listingTitle,
          scheduled_date: visit.scheduled_start,
          status: visit.status,
        };
      }),
    );

    const tenantChannels = allChannelsRaw.filter(
      (channel) =>
        inquiryIds.has(String(channel.inquiry_id)) && isTenantVisibleChannel(channel.channel_type),
    );

    const tenantChannelIds = new Set(tenantChannels.map((channel) => String(channel._id)));

    let unreadMessagesCount = 0;
    const channelActivity: Array<RecentActivity | null> = [];

    if (tenantChannelIds.size > 0) {
      const tenantChannelIdList = tenantChannels.map((channel) => channel._id);
      const [allReceipts, deliveredMessagesRaw] = await Promise.all([
        getReadReceiptsForChannels(ctx, tenantChannelIdList, tenant._id),
        getDeliveredMessagesForChannels(ctx, tenantChannelIdList),
      ]);

      const receiptByChannel = new Map<string, Doc<"chat_read_receipts">>();
      for (const receipt of allReceipts) {
        const channelKey = String(receipt.channel_id);
        if (!tenantChannelIds.has(channelKey)) {
          continue;
        }

        receiptByChannel.set(channelKey, receipt);
      }

      const messagesByChannel = new Map<string, Array<Doc<"chat_messages">>>();
      for (const message of deliveredMessagesRaw) {
        const channelKey = String(message.channel_id);
        if (!tenantChannelIds.has(channelKey)) {
          continue;
        }

        const group = messagesByChannel.get(channelKey);
        if (group) {
          group.push(message);
        } else {
          messagesByChannel.set(channelKey, [message]);
        }
      }

      const MAX_UNREAD_DISPLAY = 99;
      for (const channel of tenantChannels) {
        const channelKey = String(channel._id);
        const receipt = receiptByChannel.get(channelKey);
        const channelMessages = messagesByChannel.get(channelKey) ?? [];

        const latestMessage = channelMessages.reduce<Doc<"chat_messages"> | null>(
          (latest, message) => {
            if (!latest || message.created_at > latest.created_at) {
              return message;
            }

            return latest;
          },
          null,
        );

        if (latestMessage) {
          channelActivity.push({
            activity_type: "CHAT",
            label: "New chat activity",
            timestamp: latestMessage.delivered_at ?? latestMessage.created_at,
            href: "/tenant/messages",
          });
        } else {
          channelActivity.push(null);
        }

        const incomingMessages = channelMessages.filter(
          (message) => message.sender_user_id.toString() !== tenant._id.toString(),
        );

        if (!receipt) {
          unreadMessagesCount += Math.min(incomingMessages.length, MAX_UNREAD_DISPLAY);
          continue;
        }

        const deliveredUnread = incomingMessages.filter(
          (message) =>
            message.delivered_at !== undefined &&
            message.delivered_at > receipt.last_read_at &&
            message._id !== receipt.last_read_message_id,
        ).length;

        if (deliveredUnread > MAX_UNREAD_DISPLAY) {
          unreadMessagesCount += MAX_UNREAD_DISPLAY;
          continue;
        }

        const legacyUnread = incomingMessages.filter(
          (message) =>
            message.delivered_at === undefined &&
            message.created_at > receipt.last_read_at &&
            message._id !== receipt.last_read_message_id,
        ).length;

        unreadMessagesCount += Math.min(deliveredUnread + legacyUnread, MAX_UNREAD_DISPLAY);
      }
    }

    const favoritesCount = favoriteRows.length;

    const inquiryActivity: RecentActivity[] = inquiries.map((inquiry) => ({
      activity_type: "INQUIRY",
      label: `Inquiry ${inquiry.status.replace(/_/g, " ").toLowerCase()}`,
      timestamp: inquiry.updated_at ?? inquiry._creationTime,
      href: "/tenant/inquiries",
    }));

    const visitActivity: RecentActivity[] = allVisits.map((visit) => ({
      activity_type: "VISIT",
      label: `Visit ${visit.status.replace(/_/g, " ").toLowerCase()}`,
      timestamp: visit.completed_at ?? visit.scheduled_start,
      href: "/tenant/visits",
    }));

    const favoriteActivity = favoriteRows.reduce<RecentActivity[]>((entries, row) => {
      entries.push({
        activity_type: "FAVORITE",
        label: "Listing saved to favorites",
        timestamp: row.created_at,
        href: "/tenant/favorites",
      });

      return entries;
    }, []);

    const recentActivity = [
      ...inquiryActivity,
      ...visitActivity,
      ...favoriteActivity,
      ...channelActivity,
    ]
      .filter((entry): entry is RecentActivity => entry !== null)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 12);

    return {
      inquiry_counts: inquiryCounts,
      open_inquiries_count: openInquiriesCount,
      upcoming_visits_count: upcomingVisits.length,
      upcoming_visits: upcomingVisitRows,
      favorites_count: favoritesCount,
      unread_messages_count: unreadMessagesCount,
      recent_activity: recentActivity,
    };
  },
});

export const trackDashboardViewed = mutation({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireTenant(ctx);

    await ctx.db.insert("audit_logs", {
      actor_user_id: tenant._id,
      actor_type: "TENANT",
      action: "tenant.dashboard_viewed",
      entity_type: "tenant_dashboard",
      entity_id: String(tenant._id),
      changes: undefined,
      metadata: {
        tenantId: String(tenant._id),
      },
    });

    return { tracked: true };
  },
});
