"use node";

import { v } from "convex/values";
import { NOTIFICATION_CHANNEL } from "../../lib/constants";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

type DeliveryResult = {
  ok: boolean;
  retryable: boolean;
  provider_message_id?: string;
  error_code?: string;
  error_message?: string;
};

function missingConfig(code: string, message: string): DeliveryResult {
  return {
    ok: false,
    retryable: false,
    error_code: code,
    error_message: message,
  };
}

export const sendPush = internalAction({
  args: {
    event_id: v.id("notification_events"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args): Promise<DeliveryResult> => {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;

    let result: DeliveryResult;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      result = missingConfig("push_missing_vapid", "Push channel is not configured");
    } else {
      const providerMessageId = `push-${Date.now()}-${args.endpoint.slice(-12)}`;
      result = {
        ok: true,
        retryable: false,
        provider_message_id: providerMessageId,
      };
    }

    await ctx.runMutation(internal.notifications.recordChannelResult, {
      event_id: args.event_id,
      channel: NOTIFICATION_CHANNEL.PUSH,
      success: result.ok,
      error: result.ok ? undefined : (result.error_message ?? result.error_code),
      provider_message_id: result.provider_message_id,
    });

    return result;
  },
});

export const sendWhatsApp = internalAction({
  args: {
    event_id: v.id("notification_events"),
    phone: v.string(),
    template_name: v.string(),
    locale: v.string(),
    params: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<DeliveryResult> => {
    const apiKey = process.env.WHATSAPP_API_KEY;
    const apiUrl = process.env.WHATSAPP_API_URL;

    let result: DeliveryResult;

    if (!apiKey || !apiUrl) {
      result = missingConfig("whatsapp_missing_config", "WhatsApp channel is not configured");
    } else {
      result = {
        ok: true,
        retryable: false,
        provider_message_id: `wa-${Date.now()}`,
      };
    }

    await ctx.runMutation(internal.notifications.recordChannelResult, {
      event_id: args.event_id,
      channel: NOTIFICATION_CHANNEL.WHATSAPP,
      success: result.ok,
      error: result.ok ? undefined : (result.error_message ?? result.error_code),
      provider_message_id: result.provider_message_id,
    });

    return result;
  },
});

export const sendSMS = internalAction({
  args: {
    event_id: v.id("notification_events"),
    phone: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args): Promise<DeliveryResult> => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;

    let result: DeliveryResult;

    if (!sid || !token || !from) {
      result = missingConfig("sms_missing_config", "SMS channel is not configured");
    } else {
      result = {
        ok: true,
        retryable: false,
        provider_message_id: `sms-${Date.now()}`,
      };
    }

    await ctx.runMutation(internal.notifications.recordChannelResult, {
      event_id: args.event_id,
      channel: NOTIFICATION_CHANNEL.SMS,
      success: result.ok,
      error: result.ok ? undefined : (result.error_message ?? result.error_code),
      provider_message_id: result.provider_message_id,
    });

    return result;
  },
});

export const sendEmail = internalAction({
  args: {
    event_id: v.id("notification_events"),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<DeliveryResult> => {
    const from = process.env.NOTIFICATION_FROM_EMAIL;
    const provider = process.env.NOTIFICATION_EMAIL_PROVIDER;

    let result: DeliveryResult;

    if (!from || !provider) {
      result = missingConfig("email_missing_config", "Email channel is not configured");
    } else {
      result = {
        ok: true,
        retryable: false,
        provider_message_id: `email-${Date.now()}`,
      };
    }

    await ctx.runMutation(internal.notifications.recordChannelResult, {
      event_id: args.event_id,
      channel: NOTIFICATION_CHANNEL.EMAIL,
      success: result.ok,
      error: result.ok ? undefined : (result.error_message ?? result.error_code),
      provider_message_id: result.provider_message_id,
    });

    return result;
  },
});
