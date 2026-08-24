// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import {
  CHAT_BATCH_STATUS,
  CHAT_CHANNEL_STATUS,
  CHAT_MESSAGE_STATUS,
  CHAT_SENDER_ROLE,
  NEGOTIATION_ROOM_TYPE,
} from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import {
  daysAgo,
  DEMO_EMAILS,
  ensureSeedRecord,
  hoursAgo,
  lookupListingBySlug,
  lookupUser,
  minutesAgo,
} from "./seedHelpers";

type CoreUsers = {
  founder_one: Id<"users">;
  ops1: Id<"users">;
  tenant1: Id<"users">;
  tenant2: Id<"users">;
  owner1: Id<"users">;
};

type MessageSeedInput = {
  channelId: Id<"chat_channels">;
  senderUserId: Id<"users">;
  senderRole: Doc<"chat_messages">["sender_role"];
  originalContent: string;
  maskedContent?: string;
  batchId?: Id<"chat_message_batches">;
  status: Doc<"chat_messages">["status"];
  failureReason?: string;
  adminReviewRequired: boolean;
  isAiProcessed: boolean;
  isImpersonated?: boolean;
  impersonatedByAdminId?: Id<"users">;
  isDeleted: boolean;
  createdAt: number;
  deliveredAt?: number;
};

type BatchSeedInput = {
  channelId: Id<"chat_channels">;
  senderUserId: Id<"users">;
  messageIds: Id<"chat_messages">[];
  combinedOriginal: string;
  maskedContent?: string;
  piiDetected?: string[];
  status: Doc<"chat_message_batches">["status"];
  failureReason?: string;
  createdAt: number;
  processingStartedAt?: number;
  processedAt?: number;
};

async function resolveCoreUsers(ctx: MutationCtx): Promise<CoreUsers> {
  const [founder_one, ops1, tenant1, tenant2, owner1] = await Promise.all([
    lookupUser(ctx, DEMO_EMAILS.founder_one),
    lookupUser(ctx, DEMO_EMAILS.ops1),
    lookupUser(ctx, DEMO_EMAILS.tenant1),
    lookupUser(ctx, DEMO_EMAILS.tenant2),
    lookupUser(ctx, DEMO_EMAILS.owner1),
  ]);

  return { founder_one, ops1, tenant1, tenant2, owner1 };
}

async function requireListingBySlug(ctx: MutationCtx, slug: string): Promise<Doc<"listings">> {
  const listing = await lookupListingBySlug(ctx, slug);
  if (!listing) {
    throw new Error(`seedDemoChat: listing not found for slug "${slug}"`);
  }
  return listing;
}

async function requireInquiryForListing(
  ctx: MutationCtx,
  listingId: Id<"listings">,
  preferredTenantId?: Id<"users">,
): Promise<Doc<"tenant_inquiries">> {
  const inquiries = await ctx.db
    .query("tenant_inquiries")
    .withIndex("by_listing_id", (q) => q.eq("listing_id", listingId))
    .collect();

  if (inquiries.length === 0) {
    throw new Error(`seedDemoChat: no tenant inquiry found for listing ${listingId}`);
  }

  if (preferredTenantId) {
    const byPreferredTenant = inquiries.find((inquiry) => inquiry.tenant_id === preferredTenantId);
    if (byPreferredTenant) {
      return byPreferredTenant;
    }
  }

  const withTenant = inquiries.find((inquiry) => inquiry.tenant_id !== undefined);
  if (withTenant) {
    return withTenant;
  }

  return [...inquiries].sort((a, b) => b._creationTime - a._creationTime)[0];
}

async function ensureChatChannel(
  ctx: MutationCtx,
  args: {
    inquiryId: Id<"tenant_inquiries">;
    channelType: Doc<"chat_channels">["channel_type"];
    createdByAdminId: Id<"users">;
    createdAt: number;
    label: string;
  },
): Promise<{ doc: Doc<"chat_channels">; created: boolean }> {
  return await ensureSeedRecord(ctx, {
    label: args.label,
    lookup: async () => {
      const channels = await ctx.db
        .query("chat_channels")
        .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", args.inquiryId))
        .collect();
      return channels.find((channel) => channel.channel_type === args.channelType) ?? null;
    },
    create: async () =>
      await ctx.db.insert("chat_channels", {
        inquiry_id: args.inquiryId,
        channel_type: args.channelType,
        negotiation_id: undefined,
        status: CHAT_CHANNEL_STATUS.ACTIVE,
        created_by_admin_id: args.createdByAdminId,
        created_at: args.createdAt,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        inquiry_id: args.inquiryId,
        channel_type: args.channelType,
        negotiation_id: undefined,
        status: CHAT_CHANNEL_STATUS.ACTIVE,
        created_by_admin_id: args.createdByAdminId,
        created_at: args.createdAt,
      });
    },
  });
}

async function ensureChatMessage(
  ctx: MutationCtx,
  input: MessageSeedInput,
  label: string,
): Promise<{ doc: Doc<"chat_messages">; created: boolean }> {
  return await ensureSeedRecord(ctx, {
    label,
    lookup: async () =>
      await ctx.db
        .query("chat_messages")
        .withIndex("by_channel_id", (q) => q.eq("channel_id", input.channelId))
        .filter((q) =>
          q.and(
            q.eq(q.field("sender_user_id"), input.senderUserId),
            q.eq(q.field("sender_role"), input.senderRole),
            q.eq(q.field("original_content"), input.originalContent),
          ),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("chat_messages", {
        channel_id: input.channelId,
        sender_user_id: input.senderUserId,
        sender_role: input.senderRole,
        original_content: input.originalContent,
        masked_content: input.maskedContent,
        batch_id: input.batchId,
        status: input.status,
        failure_reason: input.failureReason,
        admin_review_required: input.adminReviewRequired,
        is_ai_processed: input.isAiProcessed,
        is_impersonated: input.isImpersonated,
        impersonated_by_admin_id: input.impersonatedByAdminId,
        is_deleted: input.isDeleted,
        created_at: input.createdAt,
        delivered_at: input.deliveredAt,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        sender_user_id: input.senderUserId,
        sender_role: input.senderRole,
        original_content: input.originalContent,
        masked_content: input.maskedContent,
        batch_id: input.batchId,
        status: input.status,
        failure_reason: input.failureReason,
        admin_review_required: input.adminReviewRequired,
        is_ai_processed: input.isAiProcessed,
        is_impersonated: input.isImpersonated,
        impersonated_by_admin_id: input.impersonatedByAdminId,
        is_deleted: input.isDeleted,
        created_at: input.createdAt,
        delivered_at: input.deliveredAt,
      });
    },
  });
}

async function ensureChatBatch(
  ctx: MutationCtx,
  input: BatchSeedInput,
  label: string,
): Promise<{ doc: Doc<"chat_message_batches">; created: boolean }> {
  return await ensureSeedRecord(ctx, {
    label,
    lookup: async () => {
      const batches = await ctx.db
        .query("chat_message_batches")
        .withIndex("by_channel_id", (q) => q.eq("channel_id", input.channelId))
        .collect();

      return (
        batches.find(
          (batch) =>
            batch.sender_user_id === input.senderUserId &&
            batch.combined_original === input.combinedOriginal,
        ) ?? null
      );
    },
    create: async () =>
      await ctx.db.insert("chat_message_batches", {
        channel_id: input.channelId,
        sender_user_id: input.senderUserId,
        messages: input.messageIds,
        combined_original: input.combinedOriginal,
        masked_content: input.maskedContent,
        pii_detected: input.piiDetected,
        status: input.status,
        failure_reason: input.failureReason,
        created_at: input.createdAt,
        processing_started_at: input.processingStartedAt,
        processed_at: input.processedAt,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        sender_user_id: input.senderUserId,
        messages: input.messageIds,
        combined_original: input.combinedOriginal,
        masked_content: input.maskedContent,
        pii_detected: input.piiDetected,
        status: input.status,
        failure_reason: input.failureReason,
        created_at: input.createdAt,
        processing_started_at: input.processingStartedAt,
        processed_at: input.processedAt,
      });
    },
  });
}

async function ensureReadReceipt(
  ctx: MutationCtx,
  args: {
    channelId: Id<"chat_channels">;
    userId: Id<"users">;
    lastReadMessageId: Id<"chat_messages">;
    lastReadAt: number;
    label: string;
  },
): Promise<{ doc: Doc<"chat_read_receipts">; created: boolean }> {
  return await ensureSeedRecord(ctx, {
    label: args.label,
    lookup: async () =>
      await ctx.db
        .query("chat_read_receipts")
        .withIndex("by_channel_and_user", (q) =>
          q.eq("channel_id", args.channelId).eq("user_id", args.userId),
        )
        .first(),
    create: async () =>
      await ctx.db.insert("chat_read_receipts", {
        channel_id: args.channelId,
        user_id: args.userId,
        last_read_message_id: args.lastReadMessageId,
        last_read_at: args.lastReadAt,
      }),
    patchIfExists: async (existing) => {
      await ctx.db.patch(existing._id, {
        last_read_message_id: args.lastReadMessageId,
        last_read_at: args.lastReadAt,
      });
    },
  });
}

async function resolveExistingChannelForImpersonated(
  ctx: MutationCtx,
  preferredInquiryId: Id<"tenant_inquiries">,
): Promise<Doc<"chat_channels">> {
  const preferredChannels = await ctx.db
    .query("chat_channels")
    .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", preferredInquiryId))
    .collect();
  const preferred = preferredChannels.find(
    (channel) => channel.status === CHAT_CHANNEL_STATUS.ACTIVE,
  );
  if (preferred) {
    return preferred;
  }

  const active = await ctx.db
    .query("chat_channels")
    .withIndex("by_status", (q) => q.eq("status", CHAT_CHANNEL_STATUS.ACTIVE))
    .first();
  if (active) {
    return active;
  }

  const anyChannel = await ctx.db.query("chat_channels").first();
  if (anyChannel) {
    return anyChannel;
  }

  throw new Error("seedChatImpersonated: no existing chat channel found");
}

export const seedChatSuccessfulBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await resolveCoreUsers(ctx);
    const baseTime = daysAgo(5);

    const listing = await requireListingBySlug(ctx, "2bhk-sunshine-heights-bandra-501");
    const inquiry = await requireInquiryForListing(ctx, listing._id, users.tenant1);

    const { doc: channel, created: channelCreated } = await ensureChatChannel(ctx, {
      inquiryId: inquiry._id,
      channelType: NEGOTIATION_ROOM_TYPE.OPS_TENANT,
      createdByAdminId: users.founder_one,
      createdAt: baseTime,
      label: "seed_chat_success_channel",
    });

    const successfulMessages = [
      {
        original:
          "Hi OPS, I am Priya from Tower B. Call me at 9876543210 before scheduling the visit.",
        masked:
          "Hi OPS, I am Priya from Tower B. Please call me on my registered number before scheduling the visit.",
        createdAt: baseTime + 60_000,
      },
      {
        original: "You can email me at priya.mehta@example.com with the checklist details.",
        masked: "You can email me on my registered address with the checklist details.",
        createdAt: baseTime + 120_000,
      },
      {
        original: "Backup contact is 9123456789 in case network is weak at the gate.",
        masked: "I also have a backup contact in my profile in case network is weak at the gate.",
        createdAt: baseTime + 180_000,
      },
    ] as const;

    const pendingMessages = await Promise.all(
      successfulMessages.map(async (message, index) =>
        ensureChatMessage(
          ctx,
          {
            channelId: channel._id,
            senderUserId: users.tenant1,
            senderRole: CHAT_SENDER_ROLE.TENANT,
            originalContent: message.original,
            maskedContent: message.masked,
            batchId: undefined,
            status: CHAT_MESSAGE_STATUS.DELIVERED,
            failureReason: undefined,
            adminReviewRequired: false,
            isAiProcessed: true,
            isImpersonated: false,
            impersonatedByAdminId: undefined,
            isDeleted: false,
            createdAt: message.createdAt,
            deliveredAt: message.createdAt + 30_000,
          },
          `seed_chat_success_message_${index + 1}`,
        ),
      ),
    );

    const messageIds = pendingMessages.map((entry) => entry.doc._id);
    const combinedOriginal = successfulMessages.map((message) => message.original).join("\n\n");
    const combinedMasked = successfulMessages.map((message) => message.masked).join("\n\n");

    const { doc: batch, created: batchCreated } = await ensureChatBatch(
      ctx,
      {
        channelId: channel._id,
        senderUserId: users.tenant1,
        messageIds,
        combinedOriginal,
        maskedContent: combinedMasked,
        piiDetected: [
          "pre_scan:phone:9876543210",
          "pre_scan:email:priya.mehta@example.com",
          "pre_scan:phone:9123456789",
        ],
        status: CHAT_BATCH_STATUS.DELIVERED,
        failureReason: undefined,
        createdAt: baseTime + 240_000,
        processingStartedAt: baseTime + 300_000,
        processedAt: baseTime + 360_000,
      },
      "seed_chat_success_batch",
    );

    const deliveredMessages = await Promise.all(
      successfulMessages.map(async (message, index) =>
        ensureChatMessage(
          ctx,
          {
            channelId: channel._id,
            senderUserId: users.tenant1,
            senderRole: CHAT_SENDER_ROLE.TENANT,
            originalContent: message.original,
            maskedContent: message.masked,
            batchId: batch._id,
            status: CHAT_MESSAGE_STATUS.DELIVERED,
            failureReason: undefined,
            adminReviewRequired: false,
            isAiProcessed: true,
            isImpersonated: false,
            impersonatedByAdminId: undefined,
            isDeleted: false,
            createdAt: message.createdAt,
            deliveredAt: message.createdAt + 30_000,
          },
          `seed_chat_success_message_${index + 1}`,
        ),
      ),
    );

    const latestMessage = deliveredMessages[deliveredMessages.length - 1]!.doc;
    const secondMessage = deliveredMessages[1]!.doc;

    await Promise.all([
      ensureReadReceipt(ctx, {
        channelId: channel._id,
        userId: users.tenant1,
        lastReadMessageId: latestMessage._id,
        lastReadAt: latestMessage.delivered_at ?? latestMessage.created_at,
        label: "seed_chat_success_receipt_tenant",
      }),
      ensureReadReceipt(ctx, {
        channelId: channel._id,
        userId: users.ops1,
        lastReadMessageId: secondMessage._id,
        lastReadAt: secondMessage.delivered_at ?? secondMessage.created_at,
        label: "seed_chat_success_receipt_ops",
      }),
    ]);

    return {
      scenario: "seedChatSuccessfulBatch",
      channel_id: channel._id,
      channel_created: channelCreated,
      batch_id: batch._id,
      batch_created: batchCreated,
      message_ids: deliveredMessages.map((entry) => entry.doc._id),
      message_created_count: deliveredMessages.filter((entry) => entry.created).length,
    };
  },
});

export const seedChatFailedBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await resolveCoreUsers(ctx);
    const baseTime = daysAgo(3);

    const listing = await requireListingBySlug(ctx, "1bhk-wingb-sunshine-bandra-202");
    const inquiry = await requireInquiryForListing(ctx, listing._id, users.tenant2);

    const { doc: channel, created: channelCreated } = await ensureChatChannel(ctx, {
      inquiryId: inquiry._id,
      channelType: NEGOTIATION_ROOM_TYPE.OPS_OWNER,
      createdByAdminId: users.founder_one,
      createdAt: baseTime,
      label: "seed_chat_failed_channel",
    });

    const failedMessages = [
      {
        original:
          "Owner Rajiv here. Email agreement draft at rajiv.owner@example.com and call 9988776655.",
        approvedMasked:
          "Owner Rajiv here. Please share the agreement draft on my registered contact details.",
        createdAt: baseTime + 60_000,
      },
      {
        original: "Use backup number 9876501234 if I am travelling.",
        approvedMasked: undefined,
        createdAt: baseTime + 120_000,
      },
    ] as const;

    const pendingMessages = await Promise.all(
      failedMessages.map(async (message, index) =>
        ensureChatMessage(
          ctx,
          {
            channelId: channel._id,
            senderUserId: users.owner1,
            senderRole: CHAT_SENDER_ROLE.OWNER,
            originalContent: message.original,
            maskedContent: message.approvedMasked,
            batchId: undefined,
            status: CHAT_MESSAGE_STATUS.FAILED,
            failureReason: "PII masking failed: residual personal identifiers detected",
            adminReviewRequired: true,
            isAiProcessed: false,
            isImpersonated: false,
            impersonatedByAdminId: undefined,
            isDeleted: false,
            createdAt: message.createdAt,
            deliveredAt: undefined,
          },
          `seed_chat_failed_message_${index + 1}`,
        ),
      ),
    );

    const messageIds = pendingMessages.map((entry) => entry.doc._id);
    const combinedOriginal = failedMessages.map((message) => message.original).join("\n\n");

    const { doc: batch, created: batchCreated } = await ensureChatBatch(
      ctx,
      {
        channelId: channel._id,
        senderUserId: users.owner1,
        messageIds,
        combinedOriginal,
        maskedContent: undefined,
        piiDetected: [
          "pre_scan:email:rajiv.owner@example.com",
          "pre_scan:phone:9988776655",
          "post_check:phone:9876501234",
        ],
        status: CHAT_BATCH_STATUS.FAILED,
        failureReason: "AI rewrite failed with unmasked PII; error_message: manual review required",
        createdAt: baseTime + 180_000,
        processingStartedAt: baseTime + 240_000,
        processedAt: baseTime + 300_000,
      },
      "seed_chat_failed_batch",
    );

    const finalMessages = await Promise.all(
      failedMessages.map(async (message, index) =>
        ensureChatMessage(
          ctx,
          {
            channelId: channel._id,
            senderUserId: users.owner1,
            senderRole: CHAT_SENDER_ROLE.OWNER,
            originalContent: message.original,
            maskedContent: message.approvedMasked,
            batchId: batch._id,
            status: CHAT_MESSAGE_STATUS.FAILED,
            failureReason: "PII masking failed: residual personal identifiers detected",
            adminReviewRequired: true,
            isAiProcessed: false,
            isImpersonated: false,
            impersonatedByAdminId: undefined,
            isDeleted: false,
            createdAt: message.createdAt,
            deliveredAt: undefined,
          },
          `seed_chat_failed_message_${index + 1}`,
        ),
      ),
    );

    return {
      scenario: "seedChatFailedBatch",
      channel_id: channel._id,
      channel_created: channelCreated,
      batch_id: batch._id,
      batch_created: batchCreated,
      message_ids: finalMessages.map((entry) => entry.doc._id),
      message_created_count: finalMessages.filter((entry) => entry.created).length,
    };
  },
});

export const seedChatStaleBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await resolveCoreUsers(ctx);
    const baseTime = minutesAgo(10);

    const listing = await requireListingBySlug(ctx, "2bhk-test-society-andheri-604");
    const inquiry = await requireInquiryForListing(ctx, listing._id);

    const { doc: channel, created: channelCreated } = await ensureChatChannel(ctx, {
      inquiryId: inquiry._id,
      channelType: NEGOTIATION_ROOM_TYPE.COMBINED,
      createdByAdminId: users.founder_one,
      createdAt: baseTime - 60_000,
      label: "seed_chat_stale_channel",
    });

    const staleMessages = [
      {
        original: "Can we lock the visit by evening? My number is 9898989898.",
        createdAt: baseTime,
      },
      {
        original: "Send the final terms to anuj.kulkarni@example.com once ready.",
        createdAt: baseTime + 30_000,
      },
    ] as const;

    const pendingMessages = await Promise.all(
      staleMessages.map(async (message, index) =>
        ensureChatMessage(
          ctx,
          {
            channelId: channel._id,
            senderUserId: users.tenant2,
            senderRole: CHAT_SENDER_ROLE.TENANT,
            originalContent: message.original,
            maskedContent: undefined,
            batchId: undefined,
            status: CHAT_MESSAGE_STATUS.BATCHED,
            failureReason: undefined,
            adminReviewRequired: false,
            isAiProcessed: false,
            isImpersonated: false,
            impersonatedByAdminId: undefined,
            isDeleted: false,
            createdAt: message.createdAt,
            deliveredAt: undefined,
          },
          `seed_chat_stale_message_${index + 1}`,
        ),
      ),
    );

    const messageIds = pendingMessages.map((entry) => entry.doc._id);
    const combinedOriginal = staleMessages.map((message) => message.original).join("\n\n");

    const { doc: batch, created: batchCreated } = await ensureChatBatch(
      ctx,
      {
        channelId: channel._id,
        senderUserId: users.tenant2,
        messageIds,
        combinedOriginal,
        maskedContent: undefined,
        piiDetected: ["pre_scan:phone:9898989898", "pre_scan:email:anuj.kulkarni@example.com"],
        status: CHAT_BATCH_STATUS.PROCESSING,
        failureReason: undefined,
        createdAt: minutesAgo(13),
        processingStartedAt: minutesAgo(12),
        processedAt: undefined,
      },
      "seed_chat_stale_batch",
    );

    const finalMessages = await Promise.all(
      staleMessages.map(async (message, index) =>
        ensureChatMessage(
          ctx,
          {
            channelId: channel._id,
            senderUserId: users.tenant2,
            senderRole: CHAT_SENDER_ROLE.TENANT,
            originalContent: message.original,
            maskedContent: undefined,
            batchId: batch._id,
            status: CHAT_MESSAGE_STATUS.BATCHED,
            failureReason: undefined,
            adminReviewRequired: false,
            isAiProcessed: false,
            isImpersonated: false,
            impersonatedByAdminId: undefined,
            isDeleted: false,
            createdAt: message.createdAt,
            deliveredAt: undefined,
          },
          `seed_chat_stale_message_${index + 1}`,
        ),
      ),
    );

    return {
      scenario: "seedChatStaleBatch",
      channel_id: channel._id,
      channel_created: channelCreated,
      batch_id: batch._id,
      batch_created: batchCreated,
      processing_started_at: batch.processing_started_at,
      message_ids: finalMessages.map((entry) => entry.doc._id),
    };
  },
});

export const seedChatImpersonated = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await resolveCoreUsers(ctx);
    const baseTime = hoursAgo(24);

    const listing = await requireListingBySlug(ctx, "2bhk-sunshine-heights-bandra-501");
    const inquiry = await requireInquiryForListing(ctx, listing._id, users.tenant1);
    const channel = await resolveExistingChannelForImpersonated(ctx, inquiry._id);

    const impersonatedMessage = await ensureChatMessage(
      ctx,
      {
        channelId: channel._id,
        senderUserId: users.founder_one,
        senderRole: CHAT_SENDER_ROLE.TENANT,
        originalContent:
          "(Impersonated) Namaste, I am tenant Priya. Please keep the security desk informed for a 7 PM visit.",
        maskedContent:
          "(Impersonated) Namaste, I am tenant Priya. Please keep the security desk informed for a 7 PM visit.",
        batchId: undefined,
        status: CHAT_MESSAGE_STATUS.DELIVERED,
        failureReason: undefined,
        adminReviewRequired: false,
        isAiProcessed: false,
        isImpersonated: true,
        impersonatedByAdminId: users.founder_one,
        isDeleted: false,
        createdAt: baseTime,
        deliveredAt: baseTime,
      },
      "seed_chat_impersonated_message",
    );

    const systemMessage = await ensureChatMessage(
      ctx,
      {
        channelId: channel._id,
        senderUserId: users.founder_one,
        senderRole: CHAT_SENDER_ROLE.SYSTEM,
        originalContent:
          "System update: visit slot locked for tomorrow evening. AI masking skipped for this administrative message.",
        maskedContent:
          "System update: visit slot locked for tomorrow evening. AI masking skipped for this administrative message.",
        batchId: undefined,
        status: CHAT_MESSAGE_STATUS.DELIVERED,
        failureReason: undefined,
        adminReviewRequired: false,
        isAiProcessed: false,
        isImpersonated: false,
        impersonatedByAdminId: undefined,
        isDeleted: false,
        createdAt: baseTime + 60_000,
        deliveredAt: baseTime + 60_000,
      },
      "seed_chat_system_message",
    );

    return {
      scenario: "seedChatImpersonated",
      channel_id: channel._id,
      impersonated_message_id: impersonatedMessage.doc._id,
      system_message_id: systemMessage.doc._id,
      created_count: Number(impersonatedMessage.created) + Number(systemMessage.created),
    };
  },
});
