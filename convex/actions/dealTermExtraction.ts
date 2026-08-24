"use node";

import { v } from "convex/values";
import OpenAI from "openai";
import { ContentFilterFinishReasonError, LengthFinishReasonError } from "openai/error";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

const MAX_MESSAGES = 100;
const MAX_TEXT_BYTES = 50 * 1024;
const RETRY_MESSAGE_LIMIT = 50;
const RETRY_TEXT_BYTES = 25 * 1024;
const MODEL_NAME = "gpt-4o-mini";
const MAX_EXTRACTED_TERMS = 50;
const MAX_TERM_DESCRIPTION_CHARS = 500;
const MAX_TERM_EXTRACTED_VALUE_CHARS = 200;
const MAX_SOURCE_MESSAGE_INDICES = 20;

const dealTermTypeValues = [
  "RENT_AMOUNT",
  "DEPOSIT",
  "LEASE_DURATION",
  "MOVE_IN_DATE",
  "MAINTENANCE",
  "ESCALATION_CLAUSE",
  "FURNISHING",
  "LOCK_IN_PERIOD",
  "NOTICE_PERIOD",
  "BROKERAGE",
  "CUSTOM",
] as const;

const DealTermSchema = z.object({
  terms: z.array(
    z.object({
      term_type: z.enum(dealTermTypeValues),
      description: z.string().describe("Human-readable description of the term"),
      extracted_value: z
        .string()
        .describe(
          "The specific value discussed (e.g., 'Rs 25,000/month', '3 months', 'June 2026')",
        ),
      source_message_indices: z
        .array(z.number())
        .describe("0-based indices of messages where this term was discussed"),
      confidence: z.number().min(0).max(1).describe("Confidence score 0-1 for extraction accuracy"),
      needs_clarification: z
        .boolean()
        .describe("Whether this term is ambiguous and needs admin review"),
      clarification_note: z
        .string()
        .optional()
        .describe("Why this term needs clarification, if applicable"),
    }),
  ),
});

type DeliveredMessage = {
  _id: Id<"chat_messages">;
  sender_role: "TENANT" | "OWNER" | "OPS" | "SYSTEM";
  original_content: string;
  masked_content?: string;
};

type SelectedMessage = DeliveredMessage & {
  extraction_index: number;
};

type ExtractedTerm = {
  term_type: (typeof dealTermTypeValues)[number];
  description: string;
  extracted_value: string;
  source_message_indices: number[];
  source_message_ids: Array<Id<"chat_messages">>;
  confidence: number;
  needs_clarification: boolean;
  clarification_note?: string;
};

type ExtractionSuccess = {
  success: true;
  terms: ExtractedTerm[];
  total_delivered_messages: number;
  analyzed_message_count: number;
  was_truncated: boolean;
};

type ExtractionFailure = {
  success: false;
  error:
    | "openai_not_configured"
    | "model_refusal"
    | "output_truncated"
    | "content_filtered"
    | "EXTRACTION_FAILED";
  detail?: string;
};

type ExtractionResult = ExtractionSuccess | ExtractionFailure;

function formatRole(role: DeliveredMessage["sender_role"]): string {
  if (role === "TENANT") {
    return "TENANT";
  }

  if (role === "OWNER") {
    return "OWNER";
  }

  if (role === "OPS") {
    return "OPS";
  }

  return "SYSTEM";
}

function normalizeMessageText(message: DeliveredMessage): string {
  const preferred = (message.masked_content ?? message.original_content).trim();
  if (preferred.length > 0) {
    return preferred;
  }

  return "[EMPTY MESSAGE]";
}

function getTextBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function buildSelection(
  messages: DeliveredMessage[],
  limits: { maxMessages: number; maxBytes: number },
): SelectedMessage[] {
  const tail = messages.slice(-limits.maxMessages);
  let selected = [...tail];

  const buildPayload = (candidate: DeliveredMessage[]): string => {
    return candidate
      .map((message, index) => {
        return `${index}. [${formatRole(message.sender_role)}] ${normalizeMessageText(message)}`;
      })
      .join("\n");
  };

  while (selected.length > 0 && getTextBytes(buildPayload(selected)) > limits.maxBytes) {
    selected = selected.slice(1);
  }

  return selected.map((message, extractionIndex) => ({
    ...message,
    extraction_index: extractionIndex,
  }));
}

function buildConversationText(
  messages: SelectedMessage[],
  includeTruncationNote: boolean,
): string {
  const lines = messages.map((message) => {
    return `${message.extraction_index}. [${formatRole(message.sender_role)}] ${normalizeMessageText(message)}`;
  });

  if (includeTruncationNote) {
    lines.unshift("Earlier messages truncated. Analyzing last 100 messages.");
  }

  return lines.join("\n");
}

function parseIndices(raw: number[]): number[] {
  const normalized = new Set<number>();

  for (const value of raw) {
    const rounded = Math.floor(value);
    if (Number.isFinite(rounded) && rounded >= 0) {
      normalized.add(rounded);
    }
  }

  return Array.from(normalized).sort((a, b) => a - b);
}

function sanitizeParsedTerms(
  terms: z.infer<typeof DealTermSchema>["terms"],
): z.infer<typeof DealTermSchema>["terms"] {
  const sanitizedTerms: z.infer<typeof DealTermSchema>["terms"] = [];

  for (const term of terms.slice(0, MAX_EXTRACTED_TERMS)) {
    const description = term.description.trim().slice(0, MAX_TERM_DESCRIPTION_CHARS);
    if (description.length === 0) {
      continue;
    }

    sanitizedTerms.push({
      ...term,
      description,
      extracted_value: term.extracted_value.trim().slice(0, MAX_TERM_EXTRACTED_VALUE_CHARS),
      source_message_indices: parseIndices(term.source_message_indices).slice(
        0,
        MAX_SOURCE_MESSAGE_INDICES,
      ),
      clarification_note: term.clarification_note?.trim() || undefined,
    });
  }

  return sanitizedTerms;
}

function mapTermsToMessageIds(
  terms: z.infer<typeof DealTermSchema>["terms"],
  selectedMessages: SelectedMessage[],
): ExtractedTerm[] {
  return terms.map((term) => {
    const normalizedIndices = parseIndices(term.source_message_indices).slice(
      0,
      MAX_SOURCE_MESSAGE_INDICES,
    );
    const sourceMessageIds = normalizedIndices
      .map((index) => selectedMessages[index]?._id)
      .filter((id): id is Id<"chat_messages"> => id !== undefined);

    return {
      term_type: term.term_type,
      description: term.description.trim(),
      extracted_value: term.extracted_value.trim(),
      source_message_indices: normalizedIndices,
      source_message_ids: sourceMessageIds,
      confidence: term.confidence,
      needs_clarification: term.needs_clarification,
      clarification_note: term.clarification_note?.trim() || undefined,
    };
  });
}

async function runStructuredExtraction(
  openai: OpenAI,
  conversation: string,
): Promise<z.infer<typeof DealTermSchema>> {
  const completion = await openai.chat.completions.parse({
    model: MODEL_NAME,
    messages: [
      {
        role: "system",
        content: [
          "You are an expert rental agreement analyst. Extract all discussed deal terms from this tenant-owner conversation.",
          "",
          "For each term:",
          "- Identify the specific type (rent, deposit, lease duration, etc.)",
          "- Extract the exact value discussed or most recently agreed upon",
          "- Note which messages contain this discussion (by index)",
          "- Rate your confidence (0-1) in the extraction accuracy",
          "- Flag any terms that are ambiguous or contradictory",
          "",
          "Focus on the LATEST agreed values. If a term was discussed multiple times with different values, use the most recent agreement. If there's no clear agreement, flag needs_clarification=true.",
          "",
          "Do NOT hallucinate terms that weren't discussed. Only extract terms that appear in the conversation.",
        ].join("\n"),
      },
      {
        role: "user",
        content: conversation,
      },
    ],
    response_format: zodResponseFormat(DealTermSchema, "deal_terms"),
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new Error(`MODEL_REFUSAL:${message.refusal}`);
  }

  return message?.parsed ?? { terms: [] };
}

export const extractTerms = internalAction({
  args: {
    channel_id: v.id("chat_channels"),
  },
  handler: async (ctx, args): Promise<ExtractionResult> => {
    if (!process.env.OPENAI_API_KEY) {
      return {
        success: false,
        error: "openai_not_configured",
      };
    }

    const allDeliveredMessages = await ctx.runQuery(
      internal.chatMessages.listDeliveredForExtraction,
      {
        channel_id: args.channel_id,
      },
    );

    if (allDeliveredMessages.length === 0) {
      return {
        success: true,
        terms: [],
        total_delivered_messages: 0,
        analyzed_message_count: 0,
        was_truncated: false,
      };
    }

    const selectedMessages = buildSelection(allDeliveredMessages, {
      maxMessages: MAX_MESSAGES,
      maxBytes: MAX_TEXT_BYTES,
    });

    if (selectedMessages.length === 0) {
      return {
        success: true,
        terms: [],
        total_delivered_messages: allDeliveredMessages.length,
        analyzed_message_count: 0,
        was_truncated: true,
      };
    }

    const wasTruncated = selectedMessages.length < allDeliveredMessages.length;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const primaryConversation = buildConversationText(selectedMessages, wasTruncated);

    try {
      const parsed = await runStructuredExtraction(openai, primaryConversation);
      const sanitizedTerms = sanitizeParsedTerms(parsed.terms);
      const extractedTerms = mapTermsToMessageIds(sanitizedTerms, selectedMessages);

      return {
        success: true,
        terms: extractedTerms,
        total_delivered_messages: allDeliveredMessages.length,
        analyzed_message_count: selectedMessages.length,
        was_truncated: wasTruncated,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("MODEL_REFUSAL:")) {
        return {
          success: false,
          error: "model_refusal",
          detail: error.message.replace("MODEL_REFUSAL:", ""),
        };
      }

      if (error instanceof LengthFinishReasonError) {
        const retryMessages = buildSelection(allDeliveredMessages, {
          maxMessages: Math.min(selectedMessages.length, RETRY_MESSAGE_LIMIT),
          maxBytes: RETRY_TEXT_BYTES,
        });

        if (retryMessages.length === 0) {
          return {
            success: false,
            error: "output_truncated",
          };
        }

        const retryConversation = buildConversationText(retryMessages, true);

        try {
          const parsed = await runStructuredExtraction(openai, retryConversation);
          const sanitizedTerms = sanitizeParsedTerms(parsed.terms);
          const extractedTerms = mapTermsToMessageIds(sanitizedTerms, retryMessages);

          return {
            success: true,
            terms: extractedTerms,
            total_delivered_messages: allDeliveredMessages.length,
            analyzed_message_count: retryMessages.length,
            was_truncated: true,
          };
        } catch (retryError: unknown) {
          if (retryError instanceof Error && retryError.message.startsWith("MODEL_REFUSAL:")) {
            return {
              success: false,
              error: "model_refusal",
              detail: retryError.message.replace("MODEL_REFUSAL:", ""),
            };
          }

          if (retryError instanceof LengthFinishReasonError) {
            return {
              success: false,
              error: "output_truncated",
            };
          }

          if (retryError instanceof ContentFilterFinishReasonError) {
            return {
              success: false,
              error: "content_filtered",
            };
          }

          const message =
            retryError instanceof Error ? retryError.message : "Unknown extraction error";
          return {
            success: false,
            error: "EXTRACTION_FAILED",
            detail: message,
          };
        }
      }

      if (error instanceof ContentFilterFinishReasonError) {
        return {
          success: false,
          error: "content_filtered",
        };
      }

      // Normalize unknown errors into structured failure response
      const message = error instanceof Error ? error.message : "Unknown extraction error";
      return {
        success: false,
        error: "EXTRACTION_FAILED",
        detail: message,
      };
    }
  },
});
