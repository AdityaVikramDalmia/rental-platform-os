import { anyApi } from "convex/server";
import { v } from "convex/values";
import { CHAT_BATCH_STATUS, CHAT_MESSAGE_STATUS, SYSTEM_CONFIG_KEYS } from "../lib/constants";
import {
  postCheckForPII,
  preMaskPII,
  preScanForPII,
  type PIIMatch,
  validateBatchTransition,
  validateMessageTransition,
} from "../lib/chat";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { internalMutation, internalQuery } from "./functions";

const DEFAULT_BATCH_WINDOW_MS = 5000;
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const PII_FAIL_ACTIONS = {
  ADMIN_REVIEW: "admin_review",
  AUTO_REJECT: "auto_reject",
} as const;

type PiiFailAction = (typeof PII_FAIL_ACTIONS)[keyof typeof PII_FAIL_ACTIONS];

const DEFAULT_PII_FAIL_ACTION: PiiFailAction = PII_FAIL_ACTIONS.ADMIN_REVIEW;

type DetectionStage = "pre_scan" | "ai_reported" | "post_check";

type AIRewriteResult =
  | {
      success: true;
      rewritten_text: string;
      pii_detected: Array<{
        type: string;
        original: string;
        replacement: string;
      }>;
      has_pii: boolean;
    }
  | {
      success: false;
      error: string;
    };

function getSnippet(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 30) {
    return compact;
  }

  return `${compact.slice(0, 27)}...`;
}

function formatPIIDetection(stage: DetectionStage, type: string, rawValue: string): string {
  return `${stage}:${type.toLowerCase()}:${getSnippet(rawValue)}`;
}

function formatDetectionsFromMatches(stage: DetectionStage, matches: PIIMatch[]): string[] {
  return matches.map((match) => formatPIIDetection(stage, match.type, match.value));
}

function mergeDetections(...groups: Array<string[] | undefined>): string[] | undefined {
  const merged = groups.flatMap((group) => group ?? []);
  if (merged.length === 0) {
    return undefined;
  }

  return [...new Set(merged)];
}

function isPIIFailAction(value: string): value is PiiFailAction {
  return value === PII_FAIL_ACTIONS.ADMIN_REVIEW || value === PII_FAIL_ACTIONS.AUTO_REJECT;
}

export const getAIConfigInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const modelConfig = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CHAT_AI_MODEL))
      .first();

    const failActionConfig = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CHAT_PII_FAIL_ACTION))
      .first();

    const model = modelConfig?.value.trim() || DEFAULT_CHAT_MODEL;
    const rawPIIFailAction = failActionConfig?.value.trim().toLowerCase() ?? "";
    const pii_fail_action = isPIIFailAction(rawPIIFailAction)
      ? rawPIIFailAction
      : DEFAULT_PII_FAIL_ACTION;

    return {
      model,
      pii_fail_action,
    };
  },
});

export const getBatchInternal = internalQuery({
  args: {
    batch_id: v.id("chat_message_batches"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batch_id);
    if (!batch) {
      return null;
    }

    const messages = await Promise.all(batch.messages.map((messageId) => ctx.db.get(messageId)));
    const validMessages = messages.filter((message) => message !== null);

    if (validMessages.length !== batch.messages.length) {
      console.error(
        `Batch ${batch._id}: ${batch.messages.length - validMessages.length} message(s) not found - possible data corruption`,
      );
    }

    return {
      batch,
      messages: validMessages,
    };
  },
});

export const queueMessage = internalMutation({
  args: {
    message_id: v.id("chat_messages"),
    channel_id: v.id("chat_channels"),
    sender_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.message_id);
    if (!message) {
      throw new Error("Chat message not found");
    }

    if (message.status !== CHAT_MESSAGE_STATUS.SUBMITTED) {
      return message.batch_id ?? null;
    }

    const collectingBatch = await ctx.db
      .query("chat_message_batches")
      .withIndex("by_channel_sender_status", (q) =>
        q
          .eq("channel_id", args.channel_id)
          .eq("sender_user_id", args.sender_user_id)
          .eq("status", CHAT_BATCH_STATUS.COLLECTING),
      )
      .order("desc")
      .first();

    let batchId = collectingBatch?._id;

    if (!batchId) {
      batchId = await ctx.db.insert("chat_message_batches", {
        channel_id: args.channel_id,
        sender_user_id: args.sender_user_id,
        messages: [args.message_id],
        combined_original: "",
        masked_content: undefined,
        pii_detected: undefined,
        status: CHAT_BATCH_STATUS.COLLECTING,
        failure_reason: undefined,
        created_at: Date.now(),
        processing_started_at: undefined,
        processed_at: undefined,
      });

      const batchWindowConfig = await ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.CHAT_BATCH_WINDOW_MS))
        .first();
      const parsedBatchWindow = batchWindowConfig
        ? Number.parseInt(batchWindowConfig.value, 10)
        : DEFAULT_BATCH_WINDOW_MS;
      const batchWindowMs =
        Number.isInteger(parsedBatchWindow) && parsedBatchWindow > 0
          ? parsedBatchWindow
          : DEFAULT_BATCH_WINDOW_MS;

      await ctx.scheduler.runAfter(batchWindowMs, internal.chatBatching.processBatch, {
        batch_id: batchId,
      });
    } else {
      if (!collectingBatch) {
        throw new Error("Collecting batch lookup failed");
      }

      const alreadyInBatch = collectingBatch.messages.some((id) => id === args.message_id);

      if (!alreadyInBatch) {
        await ctx.db.patch(batchId, {
          messages: [...collectingBatch.messages, args.message_id],
        });
      }
    }

    if (!validateMessageTransition(message.status, CHAT_MESSAGE_STATUS.BATCHED)) {
      throw new Error(
        `Cannot transition message from ${message.status} to ${CHAT_MESSAGE_STATUS.BATCHED}`,
      );
    }

    await ctx.db.patch(args.message_id, {
      batch_id: batchId,
      status: CHAT_MESSAGE_STATUS.BATCHED,
    });

    return batchId;
  },
});

export const processBatch = internalMutation({
  args: {
    batch_id: v.id("chat_message_batches"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batch_id);
    if (!batch) {
      throw new Error("Chat batch not found");
    }

    if (batch.status !== CHAT_BATCH_STATUS.COLLECTING) {
      return null;
    }

    if (!validateBatchTransition(batch.status, CHAT_BATCH_STATUS.PROCESSING)) {
      throw new Error(
        `Cannot transition batch from ${batch.status} to ${CHAT_BATCH_STATUS.PROCESSING}`,
      );
    }

    const messages = await Promise.all(batch.messages.map((messageId) => ctx.db.get(messageId)));
    const validMessages = messages.filter((message) => message !== null);

    if (validMessages.length !== batch.messages.length) {
      console.error(
        `Batch ${batch._id}: ${batch.messages.length - validMessages.length} message(s) not found - possible data corruption`,
      );
    }

    for (const message of validMessages) {
      if (!validateMessageTransition(message.status, CHAT_MESSAGE_STATUS.PROCESSING)) {
        throw new Error(
          `Cannot transition message from ${message.status} to ${CHAT_MESSAGE_STATUS.PROCESSING}`,
        );
      }
    }

    const combinedOriginal = validMessages.map((message) => message.original_content).join("\n\n");
    const preScanMatches = preScanForPII(combinedOriginal);
    const preScanDetections = formatDetectionsFromMatches("pre_scan", preScanMatches);

    const processingStartedAt = Date.now();

    await ctx.db.patch(args.batch_id, {
      status: CHAT_BATCH_STATUS.PROCESSING,
      combined_original: combinedOriginal,
      pii_detected: preScanDetections.length > 0 ? preScanDetections : undefined,
      failure_reason: undefined,
      processing_started_at: processingStartedAt,
    });

    await Promise.all(
      validMessages.map((message) =>
        ctx.db.patch(message._id, {
          status: CHAT_MESSAGE_STATUS.PROCESSING,
        }),
      ),
    );

    await ctx.scheduler.runAfter(0, internal.chatBatching.processWithAI, {
      batch_id: args.batch_id,
    });

    return args.batch_id;
  },
});

export const processWithAI = internalAction({
  args: {
    batch_id: v.id("chat_message_batches"),
  },
  handler: async (ctx, args) => {
    const batchState = await ctx.runQuery(internal.chatBatching.getBatchInternal, {
      batch_id: args.batch_id,
    });
    if (!batchState) {
      throw new Error("Chat batch not found");
    }

    if (batchState.batch.status !== CHAT_BATCH_STATUS.PROCESSING) {
      return null;
    }

    const config = await ctx.runQuery(internal.chatBatching.getAIConfigInternal, {});
    const combinedOriginal =
      batchState.batch.combined_original ||
      batchState.messages
        .map((message: { original_content: string }) => message.original_content)
        .join("\n\n");
    const preScanMatches = preScanForPII(combinedOriginal);
    const preMaskedText = preMaskPII(combinedOriginal, preScanMatches);
    const preScanDetections = formatDetectionsFromMatches("pre_scan", preScanMatches);

    const aiResult: AIRewriteResult = await ctx.runAction(anyApi["actions/chatAI"].rewriteMessage, {
      pre_masked_text: preMaskedText,
      model: config.model,
    });

    if (!aiResult.success) {
      await ctx.runMutation(internal.chatBatching.failBatch, {
        batch_id: args.batch_id,
        failure_reason: `AI rewrite failed: ${aiResult.error}`,
        pii_detected: preScanDetections,
        admin_review_required: config.pii_fail_action === "admin_review",
      });
      return null;
    }

    const aiDetections = aiResult.pii_detected.map((match) =>
      formatPIIDetection("ai_reported", match.type, match.original),
    );
    const postCheckMatches = postCheckForPII(aiResult.rewritten_text);
    const postCheckDetections = formatDetectionsFromMatches("post_check", postCheckMatches);
    const allDetections = mergeDetections(preScanDetections, aiDetections, postCheckDetections);

    if (postCheckMatches.length > 0) {
      await ctx.runMutation(internal.chatBatching.failBatch, {
        batch_id: args.batch_id,
        failure_reason: "Post-check detected residual PII in AI output",
        pii_detected: allDetections,
        admin_review_required: config.pii_fail_action === "admin_review",
      });
      return null;
    }

    await ctx.runMutation(internal.chatBatching.deliverBatch, {
      batch_id: args.batch_id,
      masked_content: aiResult.rewritten_text,
      pii_detected: allDetections,
    });

    return null;
  },
});

export const deliverBatch = internalMutation({
  args: {
    batch_id: v.id("chat_message_batches"),
    masked_content: v.string(),
    pii_detected: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batch_id);
    if (!batch) {
      throw new Error("Chat batch not found");
    }

    if (!validateBatchTransition(batch.status, CHAT_BATCH_STATUS.DELIVERED)) {
      throw new Error(
        `Cannot transition batch from ${batch.status} to ${CHAT_BATCH_STATUS.DELIVERED}`,
      );
    }

    const now = Date.now();

    await ctx.db.patch(args.batch_id, {
      status: CHAT_BATCH_STATUS.DELIVERED,
      masked_content: args.masked_content,
      pii_detected: args.pii_detected,
      processed_at: now,
      failure_reason: undefined,
    });

    const messages = await Promise.all(batch.messages.map((messageId) => ctx.db.get(messageId)));
    const validMessages = messages.filter((message) => message !== null);

    if (validMessages.length !== batch.messages.length) {
      console.error(
        `Batch ${batch._id}: ${batch.messages.length - validMessages.length} message(s) not found - possible data corruption`,
      );
    }

    for (const message of validMessages) {
      if (!validateMessageTransition(message.status, CHAT_MESSAGE_STATUS.DELIVERED)) {
        throw new Error(
          `Cannot transition message from ${message.status} to ${CHAT_MESSAGE_STATUS.DELIVERED}`,
        );
      }
    }

    const totalMessages = validMessages.length;

    await Promise.all(
      validMessages.map((message, index) => {
        const perMessageMaskedContent =
          totalMessages === 1 || index === 0
            ? args.masked_content
            : "[Combined with previous message]";

        return ctx.db.patch(message._id, {
          status: CHAT_MESSAGE_STATUS.DELIVERED,
          masked_content: perMessageMaskedContent,
          is_ai_processed: true,
          failure_reason: undefined,
          admin_review_required: false,
          delivered_at: now,
        });
      }),
    );

    return await ctx.db.get(args.batch_id);
  },
});

export const failBatch = internalMutation({
  args: {
    batch_id: v.id("chat_message_batches"),
    failure_reason: v.string(),
    pii_detected: v.optional(v.array(v.string())),
    admin_review_required: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batch_id);
    if (!batch) {
      throw new Error("Chat batch not found");
    }

    if (!validateBatchTransition(batch.status, CHAT_BATCH_STATUS.FAILED)) {
      throw new Error(
        `Cannot transition batch from ${batch.status} to ${CHAT_BATCH_STATUS.FAILED}`,
      );
    }

    const now = Date.now();

    await ctx.db.patch(args.batch_id, {
      status: CHAT_BATCH_STATUS.FAILED,
      failure_reason: args.failure_reason,
      pii_detected: args.pii_detected,
      processed_at: now,
    });

    const messages = await Promise.all(batch.messages.map((messageId) => ctx.db.get(messageId)));
    const validMessages = messages.filter((message) => message !== null);

    if (validMessages.length !== batch.messages.length) {
      console.error(
        `Batch ${batch._id}: ${batch.messages.length - validMessages.length} message(s) not found - possible data corruption`,
      );
    }

    for (const message of validMessages) {
      if (!validateMessageTransition(message.status, CHAT_MESSAGE_STATUS.FAILED)) {
        throw new Error(
          `Cannot transition message from ${message.status} to ${CHAT_MESSAGE_STATUS.FAILED}`,
        );
      }
    }

    await Promise.all(
      validMessages.map((message) =>
        ctx.db.patch(message._id, {
          status: CHAT_MESSAGE_STATUS.FAILED,
          failure_reason: args.failure_reason,
          admin_review_required: args.admin_review_required ?? true,
        }),
      ),
    );

    return await ctx.db.get(args.batch_id);
  },
});

export const recoverStaleBatches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const staleThresholdMs = 5 * 60 * 1000;
    const cutoff = Date.now() - staleThresholdMs;

    const processingBatches = await ctx.db
      .query("chat_message_batches")
      .withIndex("by_status", (q) => q.eq("status", CHAT_BATCH_STATUS.PROCESSING))
      .collect();

    for (const batch of processingBatches) {
      if (!batch.processing_started_at || batch.processing_started_at >= cutoff) {
        continue;
      }

      if (!validateBatchTransition(batch.status, CHAT_BATCH_STATUS.FAILED)) {
        continue;
      }

      // Check message states to detect partial failures
      const messages = await Promise.all(batch.messages.map((messageId) => ctx.db.get(messageId)));
      const validMessages = messages.filter((message) => message !== null);

      let deliveredCount = 0;
      let processingCount = 0;

      for (const message of validMessages) {
        if (message.status === CHAT_MESSAGE_STATUS.DELIVERED) {
          deliveredCount++;
        } else if (message.status === CHAT_MESSAGE_STATUS.PROCESSING) {
          processingCount++;
        }
      }

      const totalCount = validMessages.length;
      const now = Date.now();

      // Build failure reason reflecting partial success if applicable
      let failureReason: string;
      if (deliveredCount > 0 && processingCount > 0) {
        failureReason = `Processing timeout - batch stuck for over 5 minutes. ${deliveredCount} of ${totalCount} messages delivered before failure.`;
      } else {
        failureReason = "Processing timeout - batch stuck for over 5 minutes";
      }

      await ctx.db.patch(batch._id, {
        status: CHAT_BATCH_STATUS.FAILED,
        failure_reason: failureReason,
        processed_at: now,
      });

      for (const messageId of batch.messages) {
        const message = await ctx.db.get(messageId);
        if (!message || message.status !== CHAT_MESSAGE_STATUS.PROCESSING) {
          continue;
        }

        if (!validateMessageTransition(message.status, CHAT_MESSAGE_STATUS.FAILED)) {
          continue;
        }

        await ctx.db.patch(messageId, {
          status: CHAT_MESSAGE_STATUS.FAILED,
          failure_reason: "Batch processing timeout",
          admin_review_required: true,
        });
      }
    }
  },
});
