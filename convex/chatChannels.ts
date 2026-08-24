import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  CHAT_CHANNEL_STATUS,
  CHAT_MESSAGE_STATUS,
  NEGOTIATION_ROOM_TYPE,
  PERMISSIONS,
  type UserType,
  USER_TYPE,
} from "../lib/constants";
import { validateChannelTransition } from "../lib/chat";
import { requireAuth, requirePermission, requireTenant } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";

type ChatParticipantCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

type ChannelListCursor = {
  lastMessageAt: number;
  channelId: string;
};

function parseChannelListCursor(cursor: string | null): ChannelListCursor | null {
  if (!cursor) {
    return null;
  }

  const separatorIndex = cursor.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === cursor.length - 1) {
    return null;
  }

  const timestampPart = cursor.slice(0, separatorIndex);
  const channelId = cursor.slice(separatorIndex + 1);
  const parsed = Number.parseInt(timestampPart, 10);

  if (!Number.isInteger(parsed) || parsed < 0 || channelId.length === 0) {
    return null;
  }

  return {
    lastMessageAt: parsed,
    channelId,
  };
}

function isBeforeChannelListCursor(row: ChannelListRow, cursor: ChannelListCursor | null): boolean {
  if (!cursor) {
    return true;
  }

  return (
    row.last_message_at < cursor.lastMessageAt ||
    (row.last_message_at === cursor.lastMessageAt &&
      String(row.channel_id).localeCompare(cursor.channelId) < 0)
  );
}

function toChannelListCursor(row: ChannelListRow): string {
  return `${row.last_message_at}:${String(row.channel_id)}`;
}

const channelStatusValidator = v.union(
  v.literal(CHAT_CHANNEL_STATUS.ACTIVE),
  v.literal(CHAT_CHANNEL_STATUS.ARCHIVED),
);

async function getLatestOwnerForUser(
  ctx: ChatParticipantCtx,
  userId: Id<"users">,
): Promise<Doc<"owners"> | null> {
  const owners = await ctx.db
    .query("owners")
    .withIndex("by_user_id", (q) => q.eq("user_id", userId))
    .filter((q) =>
      q.and(q.neq(q.field("is_deleted"), true), q.eq(q.field("merged_into_id"), undefined)),
    )
    .collect();

  if (owners.length === 0) {
    return null;
  }

  return owners.reduce((latest, candidate) => {
    if (candidate._creationTime > latest._creationTime) {
      return candidate;
    }

    if (candidate._creationTime === latest._creationTime) {
      return String(candidate._id) > String(latest._id) ? candidate : latest;
    }

    return latest;
  });
}

async function getUnreadCountForChannel(
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

function isNegotiationRoomChannelType(channelType: string | undefined): boolean {
  return (
    channelType === NEGOTIATION_ROOM_TYPE.OPS_TENANT ||
    channelType === NEGOTIATION_ROOM_TYPE.OPS_OWNER ||
    channelType === NEGOTIATION_ROOM_TYPE.COMBINED
  );
}

function isRoomVisibleToUser(channelType: string | undefined, userType: UserType): boolean {
  if (!isNegotiationRoomChannelType(channelType)) {
    return true;
  }

  if (userType === USER_TYPE.ADMIN || userType === USER_TYPE.OPS) {
    return true;
  }

  if (userType === USER_TYPE.TENANT) {
    return (
      channelType === NEGOTIATION_ROOM_TYPE.OPS_TENANT ||
      channelType === NEGOTIATION_ROOM_TYPE.COMBINED
    );
  }

  if (userType === USER_TYPE.OWNER) {
    return (
      channelType === NEGOTIATION_ROOM_TYPE.OPS_OWNER ||
      channelType === NEGOTIATION_ROOM_TYPE.COMBINED
    );
  }

  return false;
}

function getActivePersona(user: Doc<"users">): UserType {
  return (user.active_persona ?? user.user_type) as UserType;
}

export async function requireChatParticipant(
  ctx: ChatParticipantCtx,
  channelId: Id<"chat_channels">,
  user: Doc<"users">,
): Promise<void> {
  const channel = await ctx.db.get(channelId);
  if (!channel) {
    throw new Error("Channel not found");
  }

  if (
    (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
    (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
  ) {
    return;
  }

  const inquiry = await ctx.db.get(channel.inquiry_id);
  if (!inquiry) {
    throw new Error("Inquiry not found");
  }

  if (user.user_types?.includes(USER_TYPE.TENANT) ?? user.user_type === USER_TYPE.TENANT) {
    if (inquiry.tenant_id?.toString() !== user._id.toString()) {
      throw new Error("Not authorized for this channel");
    }
    if (
      !isRoomVisibleToUser(
        channel.channel_type,
        (user.active_persona ?? user.user_type) as UserType,
      )
    ) {
      throw new Error("Access denied");
    }
    return;
  }

  if (user.user_types?.includes(USER_TYPE.OWNER) ?? user.user_type === USER_TYPE.OWNER) {
    const listing = await ctx.db.get(inquiry.listing_id);
    if (!listing || !listing.owner_id) {
      throw new Error("Not authorized for this channel");
    }
    const owner = await ctx.db.get(listing.owner_id);
    if (!owner || !owner.user_id || owner.user_id.toString() !== user._id.toString()) {
      throw new Error("Not authorized for this channel");
    }
    if (
      !isRoomVisibleToUser(
        channel.channel_type,
        (user.active_persona ?? user.user_type) as UserType,
      )
    ) {
      throw new Error("Access denied");
    }
    return;
  }

  throw new Error("Not authorized for this channel");
}

export const create = mutation({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, PERMISSIONS.CHAT_ADMIN);

    const inquiry = await ctx.db.get(args.inquiry_id);
    if (!inquiry) {
      throw new Error("Tenant inquiry not found");
    }

    const existingActiveChannel = await ctx.db
      .query("chat_channels")
      .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", args.inquiry_id))
      .filter((q) => q.eq(q.field("status"), CHAT_CHANNEL_STATUS.ACTIVE))
      .first();

    if (existingActiveChannel) {
      throw new Error("An active channel already exists for this inquiry");
    }

    return await ctx.db.insert("chat_channels", {
      inquiry_id: args.inquiry_id,
      status: CHAT_CHANNEL_STATUS.ACTIVE,
      created_by_admin_id: user._id,
      created_at: Date.now(),
    });
  },
});

export const archive = mutation({
  args: {
    id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CHAT_ADMIN);

    const channel = await ctx.db.get(args.id);
    if (!channel) {
      throw new Error("Chat channel not found");
    }

    if (!validateChannelTransition(channel.status, CHAT_CHANNEL_STATUS.ARCHIVED)) {
      throw new Error(
        `Cannot transition channel from ${channel.status} to ${CHAT_CHANNEL_STATUS.ARCHIVED}`,
      );
    }

    await ctx.db.patch(args.id, {
      status: CHAT_CHANNEL_STATUS.ARCHIVED,
    });

    return await ctx.db.get(args.id);
  },
});

/**
 * @future P25+ — Reopen archived channels for deal renegotiation
 */
export const reopen = mutation({
  args: {
    id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CHAT_ADMIN);

    const channel = await ctx.db.get(args.id);
    if (!channel) {
      throw new Error("Chat channel not found");
    }

    if (channel.status !== CHAT_CHANNEL_STATUS.ARCHIVED) {
      throw new Error("Only archived channels can be reopened");
    }

    if (!validateChannelTransition(channel.status, CHAT_CHANNEL_STATUS.ACTIVE)) {
      throw new Error(
        `Cannot transition channel from ${channel.status} to ${CHAT_CHANNEL_STATUS.ACTIVE}`,
      );
    }

    const channelsForInquiry = await ctx.db
      .query("chat_channels")
      .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", channel.inquiry_id))
      .collect();

    const existingActiveChannel = channelsForInquiry.find(
      (candidate) =>
        candidate._id.toString() !== args.id.toString() &&
        candidate.status === CHAT_CHANNEL_STATUS.ACTIVE,
    );

    if (existingActiveChannel) {
      throw new Error("An active channel already exists for this inquiry. Archive it first.");
    }

    await ctx.db.patch(args.id, {
      status: CHAT_CHANNEL_STATUS.ACTIVE,
    });

    return await ctx.db.get(args.id);
  },
});

export const getByInquiryId = query({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);
    }

    const allChannels = await ctx.db
      .query("chat_channels")
      .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", args.inquiry_id))
      .collect();

    const channels = allChannels.filter((channel) =>
      isRoomVisibleToUser(
        channel.channel_type,
        (user.active_persona ?? user.user_type) as UserType,
      ),
    );

    if (channels.length === 0) {
      return null;
    }

    const activeChannels = channels.filter(
      (channel) => channel.status === CHAT_CHANNEL_STATUS.ACTIVE,
    );
    const candidateChannels = activeChannels.length > 0 ? activeChannels : channels;
    const selectedChannel = [...candidateChannels].sort(
      (a, b) => (b.created_at ?? b._creationTime) - (a.created_at ?? a._creationTime),
    )[0];

    await requireChatParticipant(ctx, selectedChannel._id, user);

    return selectedChannel;
  },
});

export const getById = query({
  args: {
    id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (
      (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
      (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);
    }

    await requireChatParticipant(ctx, args.id, user);
    return await ctx.db.get(args.id);
  },
});

type ParticipantChannelRecord = {
  channel: Doc<"chat_channels">;
  inquiry: Doc<"tenant_inquiries">;
};

type ChannelListRow = {
  channel_id: Id<"chat_channels">;
  inquiry_id: Id<"tenant_inquiries">;
  inquiry_status: Doc<"tenant_inquiries">["status"];
  status: Doc<"chat_channels">["status"];
  listing_summary: {
    society_name: string | null;
    building_name: string | null;
    flat_number: string | null;
    slug: string | null;
  };
  last_message_preview: string | null;
  last_message_at: number;
  unread_count: number;
  channel_created_at: number;
};

function getChannelSortTimestamp(channel: Doc<"chat_channels">): number {
  return channel.created_at ?? channel._creationTime;
}

function getPreferredChannel(channels: Doc<"chat_channels">[]): Doc<"chat_channels"> | null {
  if (channels.length === 0) {
    return null;
  }

  const activeChannels = channels.filter(
    (channel) => channel.status === CHAT_CHANNEL_STATUS.ACTIVE,
  );
  const candidateChannels = activeChannels.length > 0 ? activeChannels : channels;

  return [...candidateChannels].sort((a, b) => {
    const aTime = getChannelSortTimestamp(a);
    const bTime = getChannelSortTimestamp(b);

    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return String(b._id).localeCompare(String(a._id));
  })[0];
}

async function getParticipantChannelsForUser(
  ctx: QueryCtx,
  user: Doc<"users">,
  status: Doc<"chat_channels">["status"] | undefined,
): Promise<ParticipantChannelRecord[]> {
  const records: ParticipantChannelRecord[] = [];
  const seenChannelIds = new Set<string>();
  const activePersona = getActivePersona(user);

  const pushRecord = (record: ParticipantChannelRecord) => {
    const channelId = String(record.channel._id);
    if (seenChannelIds.has(channelId)) {
      return;
    }

    seenChannelIds.add(channelId);
    records.push(record);
  };

  const shouldTraverseOwnerChannels =
    activePersona === USER_TYPE.OWNER ||
    activePersona === USER_TYPE.ADMIN ||
    activePersona === USER_TYPE.OPS;

  const shouldTraverseTenantChannels =
    activePersona === USER_TYPE.TENANT ||
    activePersona === USER_TYPE.ADMIN ||
    activePersona === USER_TYPE.OPS;

  const shouldTraverseAllChannels =
    activePersona === USER_TYPE.ADMIN || activePersona === USER_TYPE.OPS;

  if (activePersona === USER_TYPE.GUARD) {
    return records;
  }

  if (shouldTraverseOwnerChannels) {
    const owner = await getLatestOwnerForUser(ctx, user._id);

    if (!owner) {
      if (!shouldTraverseTenantChannels && !shouldTraverseAllChannels) {
        return records;
      }
    } else {
      const listings = await ctx.db
        .query("listings")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect();

      for (const listing of listings) {
        const inquiries = await ctx.db
          .query("tenant_inquiries")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
          .collect();

        for (const inquiry of inquiries) {
          const channels = await ctx.db
            .query("chat_channels")
            .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", inquiry._id))
            .collect();

          for (const channel of channels) {
            if (!isRoomVisibleToUser(channel.channel_type, activePersona)) {
              continue;
            }

            if (status && channel.status !== status) {
              continue;
            }

            pushRecord({ channel, inquiry });
          }
        }
      }
    }
  }

  if (shouldTraverseTenantChannels) {
    const inquiries = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_tenant_id", (q) => q.eq("tenant_id", user._id))
      .collect();

    for (const inquiry of inquiries) {
      const channels = await ctx.db
        .query("chat_channels")
        .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", inquiry._id))
        .collect();

      for (const channel of channels) {
        if (!isRoomVisibleToUser(channel.channel_type, activePersona)) {
          continue;
        }

        if (status && channel.status !== status) {
          continue;
        }

        pushRecord({ channel, inquiry });
      }
    }
  }

  if (!shouldTraverseAllChannels) {
    return records;
  }

  const channels = status
    ? await ctx.db
        .query("chat_channels")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect()
    : await ctx.db.query("chat_channels").collect();

  for (const channel of channels) {
    if (!isRoomVisibleToUser(channel.channel_type, activePersona)) {
      continue;
    }

    const inquiry = await ctx.db.get(channel.inquiry_id);
    if (!inquiry) {
      continue;
    }

    pushRecord({ channel, inquiry });
  }

  return records;
}

async function buildChannelListRows(
  ctx: QueryCtx,
  participantChannels: ParticipantChannelRecord[],
  user: Doc<"users">,
): Promise<ChannelListRow[]> {
  const listingCache = new Map<string, Doc<"listings"> | null>();
  const leadCache = new Map<string, Doc<"leads"> | null>();
  const buildingCache = new Map<string, Doc<"buildings"> | null>();
  const societyCache = new Map<string, Doc<"societies"> | null>();

  async function getListing(id: Id<"listings">): Promise<Doc<"listings"> | null> {
    const key = String(id);
    if (!listingCache.has(key)) {
      listingCache.set(key, await ctx.db.get(id));
    }
    return listingCache.get(key) ?? null;
  }

  async function getLead(id: Id<"leads">): Promise<Doc<"leads"> | null> {
    const key = String(id);
    if (!leadCache.has(key)) {
      leadCache.set(key, await ctx.db.get(id));
    }
    return leadCache.get(key) ?? null;
  }

  async function getBuilding(id: Id<"buildings">): Promise<Doc<"buildings"> | null> {
    const key = String(id);
    if (!buildingCache.has(key)) {
      buildingCache.set(key, await ctx.db.get(id));
    }
    return buildingCache.get(key) ?? null;
  }

  async function getSociety(id: Id<"societies">): Promise<Doc<"societies"> | null> {
    const key = String(id);
    if (!societyCache.has(key)) {
      societyCache.set(key, await ctx.db.get(id));
    }
    return societyCache.get(key) ?? null;
  }

  return await Promise.all(
    participantChannels.map(async ({ channel, inquiry }) => {
      const listing = await getListing(inquiry.listing_id);
      const lead = listing ? await getLead(listing.lead_id) : null;
      const building = lead?.building_id ? await getBuilding(lead.building_id) : null;
      const society = lead ? await getSociety(lead.society_id) : null;

      const latestDeliveredMessage = await ctx.db
        .query("chat_messages")
        .withIndex("by_channel_and_created", (q) => q.eq("channel_id", channel._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), CHAT_MESSAGE_STATUS.DELIVERED),
            q.neq(q.field("is_deleted"), true),
          ),
        )
        .order("desc")
        .first();

      const isSender = latestDeliveredMessage?.sender_user_id.toString() === user._id.toString();
      const lastMessagePreview = latestDeliveredMessage
        ? isSender
          ? latestDeliveredMessage.original_content
          : (latestDeliveredMessage.masked_content ?? "Message processing...")
        : null;

      const lastMessageAt =
        latestDeliveredMessage?.delivered_at ??
        latestDeliveredMessage?.created_at ??
        getChannelSortTimestamp(channel);

      const unreadCount = await getUnreadCountForChannel(ctx, channel._id, user._id);

      return {
        channel_id: channel._id,
        inquiry_id: inquiry._id,
        inquiry_status: inquiry.status,
        status: channel.status,
        listing_summary: {
          society_name: society?.name ?? null,
          building_name: building?.name ?? null,
          flat_number: lead?.flat_number ?? null,
          slug: listing?.slug ?? null,
        },
        last_message_preview: lastMessagePreview,
        last_message_at: lastMessageAt,
        unread_count: unreadCount,
        channel_created_at: getChannelSortTimestamp(channel),
      };
    }),
  );
}

async function listMyChannelsHandler(
  ctx: QueryCtx,
  args: {
    status: Doc<"chat_channels">["status"] | undefined;
    paginationOpts: { numItems: number; cursor: string | null };
  },
) {
  const user = await requireAuth(ctx);

  if (
    (user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) ||
    (user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
  ) {
    await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);
  }

  const participantChannels = await getParticipantChannelsForUser(ctx, user, args.status);
  const rows = await buildChannelListRows(ctx, participantChannels, user);

  const sortedRows = [...rows].sort((a, b) => {
    if (a.last_message_at !== b.last_message_at) {
      return b.last_message_at - a.last_message_at;
    }

    return String(b.channel_id).localeCompare(String(a.channel_id));
  });

  const cursor = parseChannelListCursor(args.paginationOpts.cursor);
  const filteredRows = sortedRows.filter((row) => isBeforeChannelListCursor(row, cursor));
  const page = filteredRows.slice(0, args.paginationOpts.numItems);
  const isDone = page.length >= filteredRows.length;

  return {
    page,
    isDone,
    continueCursor: isDone || page.length === 0 ? "" : toChannelListCursor(page[page.length - 1]),
  };
}

export const listMyChannels = query({
  args: {
    status: v.optional(channelStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await listMyChannelsHandler(ctx, {
      status: args.status,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const listForOwner = query({
  args: {
    status: v.optional(channelStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await listMyChannelsHandler(ctx, {
      status: args.status,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const getByInquiryForTenant = query({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);
    const inquiry = await ctx.db.get(args.inquiry_id);

    if (!inquiry) {
      throw new Error("Inquiry not found");
    }

    if (inquiry.tenant_id?.toString() !== tenant._id.toString()) {
      throw new Error("Not authorized for this inquiry");
    }

    const allChannels = await ctx.db
      .query("chat_channels")
      .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", args.inquiry_id))
      .collect();

    const tenantVisibleChannels = allChannels.filter((channel) =>
      isRoomVisibleToUser(channel.channel_type, USER_TYPE.TENANT),
    );

    const channel = getPreferredChannel(tenantVisibleChannels);

    if (!channel) {
      return null;
    }

    await requireChatParticipant(ctx, channel._id, tenant);
    return channel;
  },
});

export const trackTenantChatOpened = mutation({
  args: {
    channel_id: v.id("chat_channels"),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    await requireChatParticipant(ctx, args.channel_id, tenant);

    await ctx.db.insert("audit_logs", {
      actor_user_id: tenant._id,
      actor_type: "TENANT",
      action: "tenant.chat_opened",
      entity_type: "chat_channels",
      entity_id: String(args.channel_id),
      changes: undefined,
      metadata: {
        tenantId: String(tenant._id),
        channelId: String(args.channel_id),
      },
    });

    return { tracked: true };
  },
});

export const listForAdmin = query({
  args: {
    status: v.optional(
      v.union(v.literal(CHAT_CHANNEL_STATUS.ACTIVE), v.literal(CHAT_CHANNEL_STATUS.ARCHIVED)),
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);

    const status = args.status;

    if (status) {
      return await ctx.db
        .query("chat_channels")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db.query("chat_channels").order("desc").paginate(args.paginationOpts);
  },
});
