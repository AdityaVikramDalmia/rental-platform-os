"use node";

import OpenAI, { toFile } from "openai";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";

export const transcribeAudio = internalAction({
  args: {
    storageId: v.id("_storage"),
    language: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 3,
    });

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) {
      throw new Error(`Audio file not found in storage: ${args.storageId}`);
    }

    const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — Whisper API limit
    if (blob.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Audio file too large: ${(blob.size / (1024 * 1024)).toFixed(1)}MB exceeds 25MB limit`,
      );
    }

    const file = await toFile(blob, "audio.webm", {
      type: blob.type || "audio/webm",
    });

    try {
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: args.language,
      });

      return transcription.text;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Whisper transcription failed";
      throw new Error(`Transcription failed: ${message}`);
    }
  },
});
