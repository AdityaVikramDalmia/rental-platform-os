import { anyApi } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { requireAuth, requireFieldWorkerAuth } from "./auth.helpers";
import { USER_TYPE } from "../lib/constants";
import { rateLimiter } from "./rateLimiter";

export const generateAudioUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    // Voice notes are a field-worker (guard portal) feature.
    const { user } = await requireFieldWorkerAuth(ctx);
    await rateLimiter.limit(ctx, "voice:upload_url", { key: user._id, throws: true });
    return await ctx.storage.generateUploadUrl();
  },
});

export const preTranscribeCheck = internalMutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // Gates the paid transcription call in `transcribe`, which runs only after this.
    const { user } = await requireFieldWorkerAuth(ctx);
    await rateLimiter.limit(ctx, "voice:transcribe", { key: user._id, throws: true });

    const existing = await ctx.db
      .query("voice_transcriptions")
      .withIndex("by_storage_id", (q) => q.eq("storage_id", args.storageId))
      .first();
    if (existing) {
      throw new Error("This audio file has already been transcribed");
    }

    return { userId: user._id };
  },
});

export const saveTranscription = internalMutation({
  args: {
    storage_id: v.id("_storage"),
    transcript: v.string(),
    language: v.string(),
    user_id: v.id("users"),
    entity_type: v.string(),
    entity_id: v.string(),
    duration_ms: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("voice_transcriptions", {
      storage_id: args.storage_id,
      transcript: args.transcript,
      language: args.language,
      user_id: args.user_id,
      entity_type: args.entity_type,
      entity_id: args.entity_id,
      duration_ms: args.duration_ms,
      is_deleted: false,
      created_at: Date.now(),
    });
  },
});

export const transcribe = action({
  args: {
    storageId: v.id("_storage"),
    language: v.string(),
    entity_type: v.string(),
    entity_id: v.string(),
    duration_ms: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    transcript: string;
    transcriptionId: Id<"voice_transcriptions"> | null;
  }> => {
    const { userId }: { userId: Id<"users"> } = await ctx.runMutation(
      anyApi["voiceTranscriptions"].preTranscribeCheck,
      {
        storageId: args.storageId,
      },
    );

    const transcript: string = await ctx.runAction(internal.actions.transcription.transcribeAudio, {
      storageId: args.storageId,
      language: args.language,
    });

    if (transcript.trim().length === 0) {
      return { transcript: "", transcriptionId: null };
    }

    const transcriptionId: Id<"voice_transcriptions"> = await ctx.runMutation(
      anyApi["voiceTranscriptions"].saveTranscription,
      {
        storage_id: args.storageId,
        transcript,
        language: args.language,
        user_id: userId,
        entity_type: args.entity_type,
        entity_id: args.entity_id,
        duration_ms: args.duration_ms,
      },
    );

    return { transcript, transcriptionId };
  },
});

export const softDelete = mutation({
  args: {
    transcriptionId: v.id("voice_transcriptions"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const transcription = await ctx.db.get(args.transcriptionId);

    if (!transcription) {
      throw new Error("Transcription not found");
    }

    if (transcription.user_id !== user._id) {
      throw new Error("Not authorized to delete this transcription");
    }

    await ctx.db.patch(transcription._id, {
      is_deleted: true,
      deleted_by: user._id,
      deleted_at: Date.now(),
    });
  },
});

export const listByEntity = query({
  args: {
    entity_type: v.string(),
    entity_id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const isAdmin =
      user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN;

    if (isAdmin) {
      return await ctx.db
        .query("voice_transcriptions")
        .withIndex("by_entity", (q) =>
          q.eq("entity_type", args.entity_type).eq("entity_id", args.entity_id),
        )
        .collect();
    }

    return await ctx.db
      .query("voice_transcriptions")
      .withIndex("by_entity_user", (q) =>
        q
          .eq("entity_type", args.entity_type)
          .eq("entity_id", args.entity_id)
          .eq("user_id", user._id),
      )
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();
  },
});
