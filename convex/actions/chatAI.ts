"use node";

import OpenAI from "openai";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";

type PIIDetectedItem = {
  type: string;
  original: string;
  replacement: string;
};

type AIRewriteResult =
  | {
      success: true;
      rewritten_text: string;
      pii_detected: PIIDetectedItem[];
      has_pii: boolean;
    }
  | {
      success: false;
      error: string;
    };

function normalizePIIDetected(value: unknown): PIIDetectedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: PIIDetectedItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as {
      type?: unknown;
      original?: unknown;
      replacement?: unknown;
    };

    if (
      typeof candidate.type === "string" &&
      typeof candidate.original === "string" &&
      typeof candidate.replacement === "string"
    ) {
      normalized.push({
        type: candidate.type,
        original: candidate.original,
        replacement: candidate.replacement,
      });
    }
  }

  return normalized;
}

export const rewriteMessage = internalAction({
  args: {
    pre_masked_text: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<AIRewriteResult> => {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY is not configured" };
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 3,
    });

    const systemPrompt = [
      "You rewrite chat messages for a rental platform.",
      "Goal: produce a professional, concise message while masking personal contact information.",
      "Masking rules:",
      "- Phone numbers -> [PHONE]",
      "- Email addresses -> [EMAIL]",
      "- Social handles/usernames -> [HANDLE]",
      "Preserve property and deal details exactly when possible: flat numbers, building names, locality/area names, rent/deposit amounts, dates, move-in timing, furnishing/amenity details.",
      "Do not invent new facts.",
      "Return JSON only, with this exact shape:",
      '{"rewritten_text":"...","pii_detected":[{"type":"phone","original":"9876543210","replacement":"[PHONE]"}],"has_pii":true}',
      "pii_detected must be an array. has_pii must be a boolean.",
    ].join("\n");

    try {
      const completion = await openai.chat.completions.create({
        model: args.model?.trim() || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              pre_masked_text: args.pre_masked_text,
            }),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        return { success: false, error: "Failed to parse AI response" };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return { success: false, error: "Failed to parse AI response" };
      }

      if (!parsed || typeof parsed !== "object") {
        return { success: false, error: "Failed to parse AI response" };
      }

      const candidate = parsed as {
        rewritten_text?: unknown;
        pii_detected?: unknown;
        has_pii?: unknown;
      };

      if (typeof candidate.rewritten_text !== "string") {
        return { success: false, error: "Failed to parse AI response" };
      }

      const piiDetected = normalizePIIDetected(candidate.pii_detected);
      const hasPii =
        typeof candidate.has_pii === "boolean" ? candidate.has_pii : piiDetected.length > 0;

      return {
        success: true,
        rewritten_text: candidate.rewritten_text,
        pii_detected: piiDetected,
        has_pii: hasPii,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "OpenAI request failed";
      return {
        success: false,
        error: message,
      };
    }
  },
});
