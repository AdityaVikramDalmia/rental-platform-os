"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";

const STUB_DELAY_MS = 300;

type SignerRole = "owner" | "tenant";

async function simulateProviderDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));
}

export const createSigningSession = internalAction({
  args: {
    agreement_id: v.id("rental_agreements"),
    signer_role: v.union(v.literal("owner"), v.literal("tenant")),
    signer_email: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    await simulateProviderDelay();

    const signerRole = args.signer_role as SignerRole;
    const sessionId = `esign_${signerRole}_${args.agreement_id}_${Date.now()}`;

    return {
      success: true,
      session_id: sessionId,
      signing_url: `https://esign.stub.demorentals.local/session/${sessionId}`,
      expires_at: Date.now() + 3 * 24 * 60 * 60 * 1000,
      signer_email: args.signer_email?.trim().toLowerCase() || undefined,
    };
  },
});

export const getSigningStatus = internalAction({
  args: {
    session_id: v.string(),
  },
  handler: async (_ctx, args) => {
    await simulateProviderDelay();

    const normalized = args.session_id.trim().toLowerCase();
    const status = normalized.includes("signed") ? "SIGNED" : "PENDING";

    return {
      success: true,
      session_id: args.session_id,
      status,
      signed_at: status === "SIGNED" ? Date.now() : undefined,
    };
  },
});

export const parseWebhookPayload = internalAction({
  args: {
    provider_event: v.string(),
    provider_payload: v.string(),
  },
  handler: async (_ctx, args) => {
    await simulateProviderDelay();

    return {
      success: true,
      event: args.provider_event,
      raw_payload: args.provider_payload,
      normalized_status: args.provider_event.includes("signed") ? "SIGNED" : "UNKNOWN",
    };
  },
});
