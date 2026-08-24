import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  CHAT_BATCH_STATUS,
  CHAT_MESSAGE_STATUS,
  PERMISSIONS,
  type ChatBatchStatus,
} from "../lib/constants";
import { postCheckForPII, validateBatchTransition, validateMessageTransition } from "../lib/chat";
import { requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

function parseDetectionType(detection: string): string {
  const parts = detection.split(":");
  if (parts.length >= 2 && parts[1].trim().length > 0) {
    return parts[1].trim().toLowerCase();
  }

  return detection.trim().toLowerCase() || "unknown";
}

export const getRecentFailures = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CHAT_MODERATE);
    await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);

    const failedMessages = await ctx.db
      .query("chat_messages")
      .withIndex("by_status", (q) => q.eq("status", CHAT_MESSAGE_STATUS.FAILED))
      .order("desc")
      .paginate(args.paginationOpts);

    const enrichedMessages = await Promise.all(
      failedMessages.page.map(async (message) => {
        const batch = message.batch_id ? await ctx.db.get(message.batch_id) : null;

        return {
          ...message,
          batch: batch
            ? {
                _id: batch._id,
                status: batch.status,
                processed_at: batch.processed_at,
                failure_reason: batch.failure_reason,
                message_count: batch.messages.length,
              }
            : null,
        };
      }),
    );

    return {
      messages: {
        ...failedMessages,
        page: enrichedMessages,
      },
    };
  },
});

/**
 * @future P25+ — PII analytics dashboard for compliance reporting
 */
export const getPIIStats = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.CHAT_MODERATE);
    await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);

    const recentBatches = await ctx.db.query("chat_message_batches").order("desc").take(100);

    const countsByStatus: Partial<Record<ChatBatchStatus, number>> = {};
    const byType: Record<string, number> = {};
    let piiDetectionCount = 0;

    for (const batch of recentBatches) {
      countsByStatus[batch.status] = (countsByStatus[batch.status] ?? 0) + 1;

      for (const detection of batch.pii_detected ?? []) {
        const type = parseDetectionType(detection);
        byType[type] = (byType[type] ?? 0) + 1;
        piiDetectionCount += 1;
      }
    }

    return {
      total_batches: recentBatches.length,
      delivered: countsByStatus[CHAT_BATCH_STATUS.DELIVERED] ?? 0,
      failed: countsByStatus[CHAT_BATCH_STATUS.FAILED] ?? 0,
      pii_detection_count: piiDetectionCount,
      by_type: byType,
    };
  },
});

export const approveMessage = mutation({
  args: {
    id: v.id("chat_messages"),
    approved_content: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CHAT_MODERATE);
    await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);

    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Chat message not found");
    }

    if (message.status !== CHAT_MESSAGE_STATUS.FAILED || !message.admin_review_required) {
      throw new Error("Only review-required failed messages can be approved");
    }

    const approvedContent = args.approved_content.trim();
    if (approvedContent.length === 0) {
      throw new Error("Approved content is required");
    }

    if (approvedContent.length > 2000) {
      throw new Error("Approved content exceeds maximum length (2000 characters)");
    }

    if (!validateMessageTransition(message.status, CHAT_MESSAGE_STATUS.DELIVERED)) {
      throw new Error(`Cannot approve message in ${message.status} state`);
    }

    const piiMatches = postCheckForPII(approvedContent);
    if (piiMatches.length > 0) {
      throw new Error(
        `Approved content still contains PII: ${piiMatches.map((match) => match.type).join(", ")}. Please mask before approving.`,
      );
    }

    const deliveredAt = Date.now();

    await ctx.db.patch(args.id, {
      status: CHAT_MESSAGE_STATUS.DELIVERED,
      masked_content: approvedContent,
      admin_review_required: false,
      is_ai_processed: true,
      failure_reason: undefined,
      delivered_at: deliveredAt,
    });

    if (message.batch_id) {
      const batch = await ctx.db.get(message.batch_id);
      if (batch && batch.status === CHAT_BATCH_STATUS.FAILED) {
        const siblings = await Promise.all(
          batch.messages.map((messageId) => ctx.db.get(messageId)),
        );
        const allDelivered = siblings.every(
          (sibling) => sibling && sibling.status === CHAT_MESSAGE_STATUS.DELIVERED,
        );

        if (allDelivered) {
          if (!validateBatchTransition(batch.status, CHAT_BATCH_STATUS.DELIVERED)) {
            throw new Error(`Cannot transition batch from ${batch.status} to DELIVERED`);
          }

          await ctx.db.patch(batch._id, {
            status: CHAT_BATCH_STATUS.DELIVERED,
            processed_at: Date.now(),
            failure_reason: undefined,
          });
        } else {
          const partialApprovalNote =
            "Admin approved one or more failed messages; batch still has unresolved failures.";
          const currentBatch = await ctx.db.get(message.batch_id);

          if (currentBatch && currentBatch.status === CHAT_BATCH_STATUS.FAILED) {
            const hasNote = currentBatch.failure_reason?.includes(partialApprovalNote) ?? false;

            if (!hasNote) {
              await ctx.db.patch(batch._id, {
                failure_reason: currentBatch.failure_reason
                  ? `${currentBatch.failure_reason} | ${partialApprovalNote}`
                  : partialApprovalNote,
              });
            }
          }
        }
      }
    }

    return await ctx.db.get(args.id);
  },
});

export const rejectMessage = mutation({
  args: {
    id: v.id("chat_messages"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CHAT_MODERATE);
    await requirePermission(ctx, PERMISSIONS.CHAT_VIEW);

    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Chat message not found");
    }

    if (message.status !== CHAT_MESSAGE_STATUS.FAILED || !message.admin_review_required) {
      throw new Error("Only review-required failed messages can be rejected");
    }

    const reason = args.reason.trim();
    if (reason.length === 0) {
      throw new Error("Rejection reason is required");
    }

    if (reason.length > 500) {
      throw new Error("Rejection reason exceeds maximum length (500 characters)");
    }

    await ctx.db.patch(args.id, {
      admin_review_required: false,
      failure_reason: reason,
    });

    return await ctx.db.get(args.id);
  },
});
