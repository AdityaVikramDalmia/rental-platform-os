"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";

const STUB_DELAY_MS = 400;

async function simulateProviderDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));
}

export const verifyAadhaarOtp = internalAction({
  args: {
    transaction_id: v.id("rental_transactions"),
    aadhaar_last4: v.string(),
    otp: v.string(),
  },
  handler: async (_ctx, args) => {
    await simulateProviderDelay();

    const verified = args.otp.trim().length === 6;
    return {
      success: verified,
      provider_reference: `aadhaar_${args.transaction_id}_${Date.now()}`,
      reason: verified ? undefined : "OTP_INVALID",
    };
  },
});

export const verifyPan = internalAction({
  args: {
    transaction_id: v.id("rental_transactions"),
    pan: v.string(),
  },
  handler: async (_ctx, args) => {
    await simulateProviderDelay();

    const normalizedPan = args.pan.trim().toUpperCase();
    const verified = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPan);

    return {
      success: verified,
      provider_reference: `pan_${args.transaction_id}_${Date.now()}`,
      normalized_pan: normalizedPan,
      reason: verified ? undefined : "PAN_FORMAT_INVALID",
    };
  },
});

export const fetchDigiLockerDocs = internalAction({
  args: {
    transaction_id: v.id("rental_transactions"),
    consent_token: v.string(),
  },
  handler: async (_ctx, args) => {
    await simulateProviderDelay();

    const hasConsent = args.consent_token.trim().length > 10;

    return {
      success: hasConsent,
      provider_reference: `digilocker_${args.transaction_id}_${Date.now()}`,
      documents: hasConsent
        ? [
            { type: "AADHAAR_XML", status: "FETCHED" },
            { type: "PAN_CARD", status: "FETCHED" },
          ]
        : [],
      reason: hasConsent ? undefined : "CONSENT_TOKEN_INVALID",
    };
  },
});
