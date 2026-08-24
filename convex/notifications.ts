import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_CHANNEL_THROTTLE_CAPS,
  NOTIFICATION_EVENT_STATUS,
  NOTIFICATION_SEVERITY,
  PERMISSIONS,
  PERSONA_CHANNEL_PRIORITY,
  SYSTEM_CONFIG_KEYS,
  type NotificationChannel,
  type UserType,
} from "../lib/constants";
import { requireAuth, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { getSystemConfigNumber, getSystemConfigRawValue } from "./systemConfig.helpers";

// V1 Architecture: delivery state tracked on notification_events.channel_status.
// V2 will move to per-channel notification rows for better monitoring.

const notificationChannelValidator = v.union(
  v.literal(NOTIFICATION_CHANNEL.IN_APP),
  v.literal(NOTIFICATION_CHANNEL.PUSH),
  v.literal(NOTIFICATION_CHANNEL.WHATSAPP),
  v.literal(NOTIFICATION_CHANNEL.SMS),
  v.literal(NOTIFICATION_CHANNEL.EMAIL),
);

const notificationCategoryValidator = v.union(
  v.literal(NOTIFICATION_CATEGORY.LEAD_UPDATE),
  v.literal(NOTIFICATION_CATEGORY.VISIT_UPDATE),
  v.literal(NOTIFICATION_CATEGORY.PAYOUT_UPDATE),
  v.literal(NOTIFICATION_CATEGORY.INQUIRY_UPDATE),
  v.literal(NOTIFICATION_CATEGORY.AGREEMENT_STATUS),
  v.literal(NOTIFICATION_CATEGORY.MOVE_IN_REMINDER),
  v.literal(NOTIFICATION_CATEGORY.MAINTENANCE_UPDATE),
  v.literal(NOTIFICATION_CATEGORY.SYSTEM_ALERT),
);

const notificationSeverityValidator = v.union(
  v.literal(NOTIFICATION_SEVERITY.NORMAL),
  v.literal(NOTIFICATION_SEVERITY.IMPORTANT),
  v.literal(NOTIFICATION_SEVERITY.URGENT),
);

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PROCESSING_TIMEOUT_MS = 5 * 60_000;
const PROCESSING_WEBHOOK_LOOKUP_LIMIT = 200;

type NotificationPreferenceDoc = Doc<"notification_preferences">;
type DbCtx = Pick<QueryCtx | MutationCtx, "db">;
type ChannelDeliveryState = {
  status: "PENDING" | "SCHEDULED" | "DELIVERED" | "FAILED" | "SUPPRESSED";
  attempt_count: number;
  last_error?: string;
  scheduled_at?: number;
  delivered_at?: number;
  failed_at?: number;
  provider_message_id?: string;
};
type ChannelStatusMap = Partial<Record<NotificationChannel, ChannelDeliveryState>>;

function getCurrentMinutesInTimezone(timeZone: string | undefined): number {
  const fallback = new Date();
  const resolvedZone = timeZone?.trim() || "Asia/Kolkata";

  try {
    const localNow = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: resolvedZone,
        hour12: false,
      }),
    );
    return localNow.getHours() * 60 + localNow.getMinutes();
  } catch {
    return fallback.getHours() * 60 + fallback.getMinutes();
  }
}

function parseHHMM(value: string | undefined): number | null {
  if (!value || !hhmmRegex.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function isNowInsideQuietHours(
  start: string | undefined,
  end: string | undefined,
  timezone: string | undefined,
): boolean {
  const startMinutes = parseHHMM(start);
  const endMinutes = parseHHMM(end);

  if (startMinutes === null || endMinutes === null) {
    return false;
  }

  const currentMinutes = getCurrentMinutesInTimezone(timezone);

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function minutesUntilQuietHoursEnd(
  start: string | undefined,
  end: string | undefined,
  timezone: string | undefined,
): number {
  const startMinutes = parseHHMM(start);
  const endMinutes = parseHHMM(end);

  if (startMinutes === null || endMinutes === null) {
    return 0;
  }

  const currentMinutes = getCurrentMinutesInTimezone(timezone);

  if (!isNowInsideQuietHours(start, end, timezone)) {
    return 0;
  }

  if (startMinutes < endMinutes) {
    return Math.max(0, endMinutes - currentMinutes);
  }

  if (currentMinutes < endMinutes) {
    return endMinutes - currentMinutes;
  }

  return 24 * 60 - currentMinutes + endMinutes;
}

function getDefaultChannelSettings() {
  return {
    in_app: true,
    push: true,
    whatsapp: true,
    sms: true,
    email: true,
  };
}

function getEmptyCategorySettings() {
  return Object.values(NOTIFICATION_CATEGORY).map((category) => ({
    category,
    channels: getDefaultChannelSettings(),
  }));
}

async function getEffectivePreferences(
  ctx: DbCtx,
  userId: Id<"users">,
): Promise<NotificationPreferenceDoc | null> {
  const preferences = await ctx.db
    .query("notification_preferences")
    .withIndex("by_user_id", (q) => q.eq("user_id", userId))
    .filter((q) => q.eq(q.field("is_deleted"), false))
    .first();

  return preferences ?? null;
}

async function ensurePreferences(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<NotificationPreferenceDoc> {
  const existing = await getEffectivePreferences(ctx, userId);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const id = await ctx.db.insert("notification_preferences", {
    user_id: userId,
    locale: "",
    timezone: "Asia/Kolkata",
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    channels_enabled: getDefaultChannelSettings(),
    category_settings: getEmptyCategorySettings(),
    is_deleted: false,
    created_at: now,
    updated_at: now,
  });

  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to initialize notification preferences");
  }
  return created;
}

async function resolveNotificationLocale(
  ctx: MutationCtx,
  user: Doc<"users">,
  preference: NotificationPreferenceDoc,
): Promise<string> {
  const preferredLocale = preference.locale?.trim();
  if (preferredLocale) {
    return preferredLocale;
  }

  if (user.user_types?.includes("GUARD") ?? user.user_type === "GUARD") {
    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .first();

    const guardLocale = guardProfile?.language_preference?.trim();
    if (guardLocale) {
      return guardLocale;
    }
  }

  return "en";
}

function normalizeChannelPriority(userType: UserType): NotificationChannel[] {
  return [...PERSONA_CHANNEL_PRIORITY[userType]];
}

function resolveAllowedChannels(
  userType: UserType,
  preference: NotificationPreferenceDoc | null,
  category: Doc<"notification_events">["category"],
): NotificationChannel[] {
  const base = normalizeChannelPriority(userType);

  if (!preference) {
    return Array.from(new Set([NOTIFICATION_CHANNEL.IN_APP, ...base]));
  }

  const categorySetting = preference.category_settings.find((entry) => entry.category === category);
  const channels = Array.from(new Set([NOTIFICATION_CHANNEL.IN_APP, ...base]));

  return channels.filter((channel) => {
    if (channel === NOTIFICATION_CHANNEL.IN_APP) {
      return true;
    }

    if (channel === NOTIFICATION_CHANNEL.WHATSAPP && preference.whatsapp_opt_out === true) {
      return false;
    }

    const globallyEnabled =
      channel === NOTIFICATION_CHANNEL.PUSH
        ? preference.channels_enabled.push
        : channel === NOTIFICATION_CHANNEL.WHATSAPP
          ? preference.channels_enabled.whatsapp
          : channel === NOTIFICATION_CHANNEL.SMS
            ? preference.channels_enabled.sms
            : preference.channels_enabled.email;

    if (!globallyEnabled) {
      return false;
    }

    if (!categorySetting) {
      return true;
    }

    return channel === NOTIFICATION_CHANNEL.PUSH
      ? categorySetting.channels.push
      : channel === NOTIFICATION_CHANNEL.WHATSAPP
        ? categorySetting.channels.whatsapp
        : channel === NOTIFICATION_CHANNEL.SMS
          ? categorySetting.channels.sms
          : categorySetting.channels.email;
  });
}

function renderTemplateText(payload: Record<string, unknown>, body: string): string {
  // V1: Simple {{var}} replacement. V2: Migrate to ICU MessageFormat for plural/select/number formatting.
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = payload[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

async function resolveTemplate(
  ctx: DbCtx,
  args: {
    event_type: string;
    category: Doc<"notification_templates">["category"];
    channel: Doc<"notification_templates">["channel"];
    locale?: string;
  },
) {
  const preferredLocale = args.locale?.trim() || "en";
  const template = await ctx.db
    .query("notification_templates")
    .withIndex("by_event_channel_locale", (q) =>
      q.eq("event_type", args.event_type).eq("channel", args.channel).eq("locale", preferredLocale),
    )
    .filter((q) => q.and(q.eq(q.field("is_deleted"), false), q.eq(q.field("is_active"), true)))
    .first();

  if (template) {
    return template;
  }

  return await ctx.db
    .query("notification_templates")
    .withIndex("by_event_channel_locale", (q) =>
      q.eq("event_type", args.event_type).eq("channel", args.channel).eq("locale", "en"),
    )
    .filter((q) => q.and(q.eq(q.field("is_deleted"), false), q.eq(q.field("is_active"), true)))
    .first();
}

function buildInitialChannelStatus(channels: NotificationChannel[], now: number): ChannelStatusMap {
  const channelStatus: ChannelStatusMap = {};

  for (const channel of channels) {
    if (channel === NOTIFICATION_CHANNEL.IN_APP) {
      channelStatus[channel] = {
        status: "DELIVERED",
        attempt_count: 0,
        delivered_at: now,
      };
      continue;
    }

    channelStatus[channel] = {
      status: "PENDING",
      attempt_count: 0,
    };
  }

  return channelStatus;
}

function mergeChannelStatus(event: Doc<"notification_events">, now: number): ChannelStatusMap {
  const existing = event.channel_status ?? {};
  const merged: ChannelStatusMap = { ...existing };

  for (const channel of event.channels) {
    if (merged[channel]) {
      continue;
    }

    if (channel === NOTIFICATION_CHANNEL.IN_APP) {
      merged[channel] = {
        status: "DELIVERED",
        attempt_count: 0,
        delivered_at: event.created_at ?? now,
      };
      continue;
    }

    merged[channel] = {
      status: "PENDING",
      attempt_count: 0,
    };
  }

  return merged;
}

function toStringRecord(payload: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const);

  return Object.fromEntries(entries);
}

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const preference = await getEffectivePreferences(ctx, user._id);

    if (preference) {
      return {
        ...preference,
        whatsapp_opt_out: preference.whatsapp_opt_out ?? false,
      };
    }

    return {
      user_id: user._id,
      locale: "",
      timezone: "Asia/Kolkata",
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
      whatsapp_opt_out: false,
      channels_enabled: getDefaultChannelSettings(),
      category_settings: getEmptyCategorySettings(),
    };
  },
});

export const updatePreferences = mutation({
  args: {
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    quiet_hours_start: v.optional(v.string()),
    quiet_hours_end: v.optional(v.string()),
    whatsapp_opt_out: v.optional(v.boolean()),
    channels_enabled: v.object({
      in_app: v.boolean(),
      push: v.boolean(),
      whatsapp: v.boolean(),
      sms: v.boolean(),
      email: v.boolean(),
    }),
    category_settings: v.array(
      v.object({
        category: notificationCategoryValidator,
        channels: v.object({
          in_app: v.boolean(),
          push: v.boolean(),
          whatsapp: v.boolean(),
          sms: v.boolean(),
          email: v.boolean(),
        }),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (args.quiet_hours_start && !hhmmRegex.test(args.quiet_hours_start)) {
      throw new Error("quiet_hours_start must be HH:MM");
    }

    if (args.quiet_hours_end && !hhmmRegex.test(args.quiet_hours_end)) {
      throw new Error("quiet_hours_end must be HH:MM");
    }

    const now = Date.now();
    const existing = await getEffectivePreferences(ctx, user._id);

    if (existing) {
      await ctx.db.patch(existing._id, {
        locale: args.locale,
        timezone: args.timezone,
        quiet_hours_start: args.quiet_hours_start,
        quiet_hours_end: args.quiet_hours_end,
        whatsapp_opt_out: args.whatsapp_opt_out ?? existing.whatsapp_opt_out ?? false,
        channels_enabled: {
          ...args.channels_enabled,
          in_app: true,
        },
        category_settings: args.category_settings.map((entry) => ({
          ...entry,
          channels: {
            ...entry.channels,
            in_app: true,
          },
        })),
        updated_at: now,
      });

      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("notification_preferences", {
      user_id: user._id,
      locale: args.locale,
      timezone: args.timezone,
      quiet_hours_start: args.quiet_hours_start,
      quiet_hours_end: args.quiet_hours_end,
      whatsapp_opt_out: args.whatsapp_opt_out ?? false,
      channels_enabled: {
        ...args.channels_enabled,
        in_app: true,
      },
      category_settings: args.category_settings.map((entry) => ({
        ...entry,
        channels: {
          ...entry.channels,
          in_app: true,
        },
      })),
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    return await ctx.db.get(id);
  },
});

export const listTemplates = query({
  args: {
    category: v.optional(notificationCategoryValidator),
    channel: v.optional(notificationChannelValidator),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.NOTIFICATIONS_VIEW);

    let templates = await ctx.db
      .query("notification_templates")
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .collect();

    if (args.category) {
      templates = templates.filter((template) => template.category === args.category);
    }

    if (args.channel) {
      templates = templates.filter((template) => template.channel === args.channel);
    }

    if (args.locale) {
      templates = templates.filter((template) => template.locale === args.locale);
    }

    return templates.sort((a, b) => b.created_at - a.created_at);
  },
});

export const upsertTemplate = mutation({
  args: {
    event_type: v.string(),
    category: notificationCategoryValidator,
    channel: notificationChannelValidator,
    locale: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    variables: v.array(v.string()),
    is_active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE);

    const locale = args.locale.trim().toLowerCase();
    const now = Date.now();
    const existing = await ctx.db
      .query("notification_templates")
      .withIndex("by_event_channel_locale", (q) =>
        q.eq("event_type", args.event_type).eq("channel", args.channel).eq("locale", locale),
      )
      .first();

    if (existing) {
      const nextVersion = (existing.version ?? 0) + 1;
      await ctx.db.patch(existing._id, {
        category: args.category,
        subject: args.subject,
        body: args.body,
        variables: args.variables,
        version: nextVersion,
        is_active: args.is_active ?? true,
        is_deleted: false,
        updated_at: now,
      });
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("notification_templates", {
      event_type: args.event_type,
      category: args.category,
      channel: args.channel,
      locale,
      subject: args.subject,
      body: args.body,
      variables: args.variables,
      version: 1,
      is_active: args.is_active ?? true,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    return await ctx.db.get(id);
  },
});

export const registerPushSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    user_agent: v.optional(v.string()),
    device_fingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = Date.now();

    const sameEndpoint = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();

    if (sameEndpoint) {
      if (sameEndpoint.user_id !== user._id) {
        await ctx.db.patch(sameEndpoint._id, {
          is_active: false,
          updated_at: now,
        });
      }

      await ctx.db.patch(sameEndpoint._id, {
        user_id: user._id,
        p256dh: args.p256dh,
        auth: args.auth,
        user_agent: args.user_agent,
        device_fingerprint: args.device_fingerprint,
        is_active: true,
        is_deleted: false,
        updated_at: now,
      });

      return await ctx.db.get(sameEndpoint._id);
    }

    const id = await ctx.db.insert("push_subscriptions", {
      user_id: user._id,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      user_agent: args.user_agent,
      device_fingerprint: args.device_fingerprint,
      last_error: undefined,
      is_active: true,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    return await ctx.db.get(id);
  },
});

export const unregisterPushSubscription = mutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const existing = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();

    if (!existing || existing.user_id !== user._id) {
      return { success: true };
    }

    await ctx.db.patch(existing._id, {
      is_active: false,
      updated_at: Date.now(),
    });

    return { success: true };
  },
});

export const listMyPushSubscriptions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return await ctx.db
      .query("push_subscriptions")
      .withIndex("by_user_and_active", (q) => q.eq("user_id", user._id).eq("is_active", true))
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .collect();
  },
});

export const emitEvent = internalMutation({
  args: {
    user_id: v.id("users"),
    event_type: v.string(),
    category: notificationCategoryValidator,
    severity: notificationSeverityValidator,
    payload: v.record(v.string(), v.any()),
    dedup_key: v.optional(v.string()),
    action_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await ctx.db.get(args.user_id);

    if (!user || user.status !== "ACTIVE") {
      return { suppressed: true, reason: "recipient_inactive" as const };
    }

    const dedupWindowMs = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_DEDUP_WINDOW_MS,
      300000,
    );

    if (args.dedup_key) {
      // V1: query-then-insert dedup has theoretical race window under concurrent emits.
      // Acceptable since duplicate notifications are non-harmful. V2: deterministic key table.
      const dedupHits = await ctx.db
        .query("notification_events")
        .withIndex("by_dedup_key", (q) => q.eq("dedup_key", args.dedup_key))
        .filter((q) => q.eq(q.field("user_id"), args.user_id))
        .collect();
      const duplicate = dedupHits.find((event) => now - event.created_at <= dedupWindowMs);

      if (duplicate) {
        return { suppressed: true, reason: "dedup_window" as const, event_id: duplicate._id };
      }
    }

    const preference = await ensurePreferences(ctx, args.user_id);
    const locale = await resolveNotificationLocale(ctx, user, preference);
    const channels = resolveAllowedChannels(
      (user.active_persona ?? user.user_type) as UserType,
      preference,
      args.category,
    );
    const channel_status = buildInitialChannelStatus(channels, now);

    const inAppTemplate = await resolveTemplate(ctx, {
      event_type: args.event_type,
      category: args.category,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      locale,
    });

    const title =
      inAppTemplate?.subject ??
      args.event_type.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase());
    const body = inAppTemplate
      ? renderTemplateText(args.payload, inAppTemplate.body)
      : JSON.stringify(args.payload);

    const eventId = await ctx.db.insert("notification_events", {
      user_id: args.user_id,
      event_type: args.event_type,
      category: args.category,
      severity: args.severity,
      status: NOTIFICATION_EVENT_STATUS.PENDING,
      channels,
      payload: args.payload,
      dedup_key: args.dedup_key,
      channel_status,
      retry_count: 0,
      next_attempt_at: now,
      last_error: undefined,
      final_error: undefined,
      provider_message_id: undefined,
      attempted_at: undefined,
      delivered_at: undefined,
      failed_at: undefined,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    const inAppId = await ctx.db.insert("notifications", {
      user_id: args.user_id,
      event_id: eventId,
      category: args.category,
      severity: args.severity,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      title,
      body,
      action_url: args.action_url,
      metadata: args.payload,
      is_read: false,
      read_at: undefined,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    return {
      event_id: eventId,
      notification_id: inAppId,
      channels,
      suppressed: false,
    };
  },
});

function getFirstChannelError(
  channelStatus: ChannelStatusMap,
  channels: Exclude<NotificationChannel, "IN_APP">[],
): string | undefined {
  for (const channel of channels) {
    const state = channelStatus[channel];
    if (state?.status === "FAILED" && state.last_error) {
      return state.last_error;
    }
  }

  return undefined;
}

async function dispatchExternalChannel(
  ctx: MutationCtx,
  event: Doc<"notification_events">,
  user: Doc<"users">,
  args: {
    channels: Exclude<NotificationChannel, "IN_APP">[];
    locale: string;
    channelStatus: ChannelStatusMap;
  },
): Promise<{
  hasScheduled: boolean;
  hasFailed: boolean;
  error?: string;
  channel_status: ChannelStatusMap;
}> {
  let hasScheduled = false;
  let hasFailed = false;
  let firstError: string | undefined;

  for (const channel of args.channels) {
    const template = await resolveTemplate(ctx, {
      event_type: event.event_type,
      category: event.category,
      channel,
      locale: args.locale,
    });

    if (!template) {
      const error = `template_missing:${channel}`;
      args.channelStatus[channel] = {
        status: "FAILED",
        attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
        last_error: error,
        failed_at: Date.now(),
      };
      hasFailed = true;
      firstError ??= error;
      continue;
    }

    const fallbackTitle = event.event_type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (s) => s.toUpperCase());
    const subject = template.subject
      ? renderTemplateText(event.payload, template.subject)
      : fallbackTitle;
    const body = renderTemplateText(event.payload, template.body);
    const data = toStringRecord(event.payload);

    if (channel === NOTIFICATION_CHANNEL.PUSH) {
      const subscription = await ctx.db
        .query("push_subscriptions")
        .withIndex("by_user_and_active", (q) => q.eq("user_id", user._id).eq("is_active", true))
        .filter((q) => q.eq(q.field("is_deleted"), false))
        .unique();

      if (!subscription) {
        args.channelStatus[channel] = {
          status: "SUPPRESSED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          last_error: "push_subscription_not_found",
        };
        continue;
      }

      try {
        await ctx.scheduler.runAfter(0, internal.actions.notifications.sendPush, {
          event_id: event._id,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          title: subject,
          body,
          data: Object.keys(data).length > 0 ? data : undefined,
        });
        hasScheduled = true;
        args.channelStatus[channel] = {
          status: "SCHEDULED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          scheduled_at: Date.now(),
          last_error: undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const channelError = `push_schedule_failed:${message}`;
        args.channelStatus[channel] = {
          status: "FAILED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          last_error: channelError,
          failed_at: Date.now(),
        };
        hasFailed = true;
        firstError ??= channelError;
      }
      continue;
    }

    if (channel === NOTIFICATION_CHANNEL.WHATSAPP) {
      if (!user.phone) {
        args.channelStatus[channel] = {
          status: "SUPPRESSED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          last_error: "whatsapp_missing_phone",
        };
        continue;
      }

      try {
        await ctx.scheduler.runAfter(0, internal.actions.notifications.sendWhatsApp, {
          event_id: event._id,
          phone: user.phone,
          template_name: event.event_type,
          locale: args.locale,
          params: [body],
        });
        hasScheduled = true;
        args.channelStatus[channel] = {
          status: "SCHEDULED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          scheduled_at: Date.now(),
          last_error: undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const channelError = `whatsapp_schedule_failed:${message}`;
        args.channelStatus[channel] = {
          status: "FAILED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          last_error: channelError,
          failed_at: Date.now(),
        };
        hasFailed = true;
        firstError ??= channelError;
      }
      continue;
    }

    if (channel === NOTIFICATION_CHANNEL.SMS) {
      if (!user.phone) {
        args.channelStatus[channel] = {
          status: "SUPPRESSED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          last_error: "sms_missing_phone",
        };
        continue;
      }

      try {
        await ctx.scheduler.runAfter(0, internal.actions.notifications.sendSMS, {
          event_id: event._id,
          phone: user.phone,
          text: body,
        });
        hasScheduled = true;
        args.channelStatus[channel] = {
          status: "SCHEDULED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          scheduled_at: Date.now(),
          last_error: undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const channelError = `sms_schedule_failed:${message}`;
        args.channelStatus[channel] = {
          status: "FAILED",
          attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
          last_error: channelError,
          failed_at: Date.now(),
        };
        hasFailed = true;
        firstError ??= channelError;
      }
      continue;
    }

    if (!user.email) {
      args.channelStatus[channel] = {
        status: "SUPPRESSED",
        attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
        last_error: "email_missing_recipient",
      };
      continue;
    }

    try {
      await ctx.scheduler.runAfter(0, internal.actions.notifications.sendEmail, {
        event_id: event._id,
        to: user.email,
        subject,
        body,
      });
      hasScheduled = true;
      args.channelStatus[channel] = {
        status: "SCHEDULED",
        attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
        scheduled_at: Date.now(),
        last_error: undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const channelError = `email_schedule_failed:${message}`;
      args.channelStatus[channel] = {
        status: "FAILED",
        attempt_count: args.channelStatus[channel]?.attempt_count ?? 0,
        last_error: channelError,
        failed_at: Date.now(),
      };
      hasFailed = true;
      firstError ??= channelError;
    }
  }
  return {
    hasScheduled,
    hasFailed,
    ...(firstError ? { error: firstError } : {}),
    channel_status: args.channelStatus,
  };
}

async function applyChannelResult(
  ctx: MutationCtx,
  args: {
    event: Doc<"notification_events">;
    channel: Exclude<NotificationChannel, "IN_APP">;
    success: boolean;
    error?: string;
    provider_message_id?: string;
  },
) {
  const now = Date.now();
  const channelStatus = mergeChannelStatus(args.event, now);
  const previousState = channelStatus[args.channel];

  channelStatus[args.channel] = {
    status: args.success ? "DELIVERED" : "FAILED",
    attempt_count: Math.max(previousState?.attempt_count ?? 0, 1),
    scheduled_at: previousState?.scheduled_at,
    delivered_at: args.success ? now : undefined,
    failed_at: args.success ? undefined : now,
    last_error: args.success ? undefined : (args.error ?? "delivery_failed"),
    provider_message_id: args.provider_message_id ?? previousState?.provider_message_id,
  };

  const basePatch = {
    channel_status: channelStatus,
    provider_message_id: args.provider_message_id ?? args.event.provider_message_id,
    updated_at: now,
  };

  const externalChannels = args.event.channels.filter(
    (channel): channel is Exclude<NotificationChannel, "IN_APP"> =>
      channel !== NOTIFICATION_CHANNEL.IN_APP,
  );

  if (args.event.status !== NOTIFICATION_EVENT_STATUS.PROCESSING) {
    await ctx.db.patch(args.event._id, basePatch);
    return { updated: true, status: args.event.status };
  }

  const allTerminal = externalChannels.every((channel) => {
    const state = channelStatus[channel]?.status;
    return state === "DELIVERED" || state === "FAILED" || state === "SUPPRESSED";
  });

  if (!allTerminal) {
    await ctx.db.patch(args.event._id, {
      ...basePatch,
      status: NOTIFICATION_EVENT_STATUS.PROCESSING,
      last_error: args.success ? args.event.last_error : (args.error ?? args.event.last_error),
    });
    return { updated: true, status: NOTIFICATION_EVENT_STATUS.PROCESSING };
  }

  const hasFailed = externalChannels.some((channel) => channelStatus[channel]?.status === "FAILED");
  const hasDelivered = externalChannels.some(
    (channel) => channelStatus[channel]?.status === "DELIVERED",
  );

  if (hasFailed) {
    const maxRetries = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_MAX_RETRIES,
      3,
    );
    const retryBaseMs = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_RETRY_BASE_MS,
      2000,
    );
    const retryCount = args.event.retry_count + 1;
    const shouldDeadLetter = retryCount >= maxRetries;
    const firstError =
      getFirstChannelError(channelStatus, externalChannels) ?? args.error ?? "delivery_failed";

    await ctx.db.patch(args.event._id, {
      ...basePatch,
      status: shouldDeadLetter
        ? NOTIFICATION_EVENT_STATUS.DEAD_LETTER
        : NOTIFICATION_EVENT_STATUS.FAILED,
      retry_count: retryCount,
      next_attempt_at: shouldDeadLetter ? undefined : now + retryBaseMs * Math.pow(2, retryCount),
      last_error: firstError,
      final_error: shouldDeadLetter ? firstError : undefined,
      failed_at: now,
      delivered_at: undefined,
    });

    return {
      updated: true,
      status: shouldDeadLetter
        ? NOTIFICATION_EVENT_STATUS.DEAD_LETTER
        : NOTIFICATION_EVENT_STATUS.FAILED,
    };
  }

  if (!hasDelivered) {
    await ctx.db.patch(args.event._id, {
      ...basePatch,
      status: NOTIFICATION_EVENT_STATUS.SUPPRESSED,
      last_error: "no_deliverable_channel",
      final_error: undefined,
      next_attempt_at: undefined,
      failed_at: undefined,
      delivered_at: undefined,
    });

    return { updated: true, status: NOTIFICATION_EVENT_STATUS.SUPPRESSED };
  }

  await ctx.db.patch(args.event._id, {
    ...basePatch,
    status: NOTIFICATION_EVENT_STATUS.DELIVERED,
    delivered_at: now,
    failed_at: undefined,
    next_attempt_at: undefined,
    last_error: undefined,
    final_error: undefined,
  });

  return { updated: true, status: NOTIFICATION_EVENT_STATUS.DELIVERED };
}

export const processQueue = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const maxRetries = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_MAX_RETRIES,
      3,
    );
    const retryBaseMs = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_RETRY_BASE_MS,
      2000,
    );
    const pending = await ctx.db
      .query("notification_events")
      .withIndex("by_status_and_next_attempt", (q) =>
        q.eq("status", NOTIFICATION_EVENT_STATUS.PENDING).lte("next_attempt_at", now),
      )
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .take(args.limit ?? 50);

    let processed = 0;
    let failed = 0;

    for (const event of pending) {
      processed += 1;

      const queueEvent = await ctx.db.get(event._id);
      if (
        !queueEvent ||
        queueEvent.is_deleted ||
        queueEvent.status !== NOTIFICATION_EVENT_STATUS.PENDING
      ) {
        continue;
      }

      const user = await ctx.db.get(queueEvent.user_id);
      const preference = user ? await getEffectivePreferences(ctx, user._id) : null;
      const timezone = preference?.timezone ?? "Asia/Kolkata";
      const shouldDeferForQuietHours =
        !!user &&
        queueEvent.severity !== NOTIFICATION_SEVERITY.URGENT &&
        isNowInsideQuietHours(preference?.quiet_hours_start, preference?.quiet_hours_end, timezone);

      if (shouldDeferForQuietHours) {
        const delayMinutes = minutesUntilQuietHoursEnd(
          preference?.quiet_hours_start,
          preference?.quiet_hours_end,
          timezone,
        );
        await ctx.db.patch(queueEvent._id, {
          next_attempt_at: now + delayMinutes * 60_000,
          updated_at: now,
        });
        continue;
      }

      const channelStatus = mergeChannelStatus(queueEvent, now);
      const externalChannels = queueEvent.channels.filter(
        (channel): channel is Exclude<NotificationChannel, "IN_APP"> =>
          channel !== NOTIFICATION_CHANNEL.IN_APP,
      );

      if (externalChannels.length === 0) {
        await ctx.db.patch(queueEvent._id, {
          status: NOTIFICATION_EVENT_STATUS.DELIVERED,
          channel_status: channelStatus,
          delivered_at: now,
          attempted_at: now,
          next_attempt_at: undefined,
          last_error: undefined,
          final_error: undefined,
          updated_at: now,
        });
        continue;
      }

      const channelsToDispatch: Exclude<NotificationChannel, "IN_APP">[] = [];

      for (const channel of externalChannels) {
        const current = channelStatus[channel];
        if (
          current?.status === "DELIVERED" ||
          current?.status === "SCHEDULED" ||
          current?.status === "SUPPRESSED"
        ) {
          continue;
        }
        channelStatus[channel] = {
          status: "PENDING",
          attempt_count: (current?.attempt_count ?? 0) + 1,
          scheduled_at: undefined,
          delivered_at: undefined,
          failed_at: undefined,
          provider_message_id: current?.provider_message_id,
        };
        channelsToDispatch.push(channel);
      }

      if (channelsToDispatch.length === 0) {
        const hasScheduledChannel = externalChannels.some(
          (channel) => channelStatus[channel]?.status === "SCHEDULED",
        );
        const hasFailedChannel = externalChannels.some(
          (channel) => channelStatus[channel]?.status === "FAILED",
        );
        const hasDeliveredChannel = externalChannels.some(
          (channel) => channelStatus[channel]?.status === "DELIVERED",
        );

        if (hasScheduledChannel) {
          const latestEvent = await ctx.db.get(queueEvent._id);
          if (
            !latestEvent ||
            latestEvent.is_deleted ||
            latestEvent.status !== NOTIFICATION_EVENT_STATUS.PENDING
          ) {
            continue;
          }

          await ctx.db.patch(queueEvent._id, {
            status: NOTIFICATION_EVENT_STATUS.PROCESSING,
            channel_status: channelStatus,
            attempted_at: now,
            next_attempt_at: undefined,
            updated_at: now,
          });
          continue;
        }

        if (hasFailedChannel) {
          const retryCount = queueEvent.retry_count + 1;
          const shouldDeadLetter = retryCount >= maxRetries;
          const firstError =
            getFirstChannelError(channelStatus, externalChannels) ??
            "delivery_failed_no_retry_channels";
          await ctx.db.patch(queueEvent._id, {
            status: shouldDeadLetter
              ? NOTIFICATION_EVENT_STATUS.DEAD_LETTER
              : NOTIFICATION_EVENT_STATUS.FAILED,
            retry_count: retryCount,
            next_attempt_at: shouldDeadLetter
              ? undefined
              : now + retryBaseMs * Math.pow(2, retryCount),
            last_error: firstError,
            final_error: shouldDeadLetter ? firstError : undefined,
            failed_at: now,
            channel_status: channelStatus,
            attempted_at: now,
            updated_at: now,
          });
          failed += 1;
          continue;
        }

        await ctx.db.patch(queueEvent._id, {
          status: hasDeliveredChannel
            ? NOTIFICATION_EVENT_STATUS.DELIVERED
            : NOTIFICATION_EVENT_STATUS.SUPPRESSED,
          channel_status: channelStatus,
          delivered_at: hasDeliveredChannel ? now : undefined,
          failed_at: undefined,
          attempted_at: now,
          next_attempt_at: undefined,
          last_error: hasDeliveredChannel ? undefined : "no_deliverable_channel",
          final_error: undefined,
          updated_at: now,
        });
        continue;
      }

      if (!user) {
        for (const channel of externalChannels) {
          channelStatus[channel] = {
            status: "SUPPRESSED",
            attempt_count: channelStatus[channel]?.attempt_count ?? 0,
            last_error: "recipient_not_found",
          };
        }
        await ctx.db.patch(queueEvent._id, {
          status: NOTIFICATION_EVENT_STATUS.SUPPRESSED,
          last_error: "recipient_not_found",
          channel_status: channelStatus,
          updated_at: now,
        });
        continue;
      }

      const recentEvents = await ctx.db
        .query("notification_events")
        .withIndex("by_user_id", (q) => q.eq("user_id", queueEvent.user_id))
        .filter((q) =>
          q.and(q.eq(q.field("is_deleted"), false), q.gte(q.field("created_at"), now - 60_000)),
        )
        .collect();

      const deliverableChannels: Exclude<NotificationChannel, "IN_APP">[] = [];
      for (const channel of channelsToDispatch) {
        const recentCount = recentEvents.filter(
          (item) => item._id !== queueEvent._id && item.channels.includes(channel),
        ).length;
        if (recentCount >= NOTIFICATION_CHANNEL_THROTTLE_CAPS[channel]) {
          channelStatus[channel] = {
            status: "SUPPRESSED",
            attempt_count: channelStatus[channel]?.attempt_count ?? 0,
            last_error: `throttled:${channel}`,
          };
          continue;
        }
        deliverableChannels.push(channel);
      }

      if (channelsToDispatch.length > 0 && deliverableChannels.length === 0) {
        await ctx.db.patch(queueEvent._id, {
          status: NOTIFICATION_EVENT_STATUS.SUPPRESSED,
          last_error: "throttled_all_channels",
          channel_status: channelStatus,
          attempted_at: now,
          next_attempt_at: undefined,
          updated_at: now,
        });
        continue;
      }

      const effectivePreference = preference ?? (await ensurePreferences(ctx, user._id));
      const locale = await resolveNotificationLocale(ctx, user, effectivePreference);

      const result = await dispatchExternalChannel(ctx, queueEvent, user, {
        channels: deliverableChannels,
        locale,
        channelStatus,
      });

      if (result.hasScheduled) {
        const latestEvent = await ctx.db.get(queueEvent._id);
        if (
          !latestEvent ||
          latestEvent.is_deleted ||
          latestEvent.status !== NOTIFICATION_EVENT_STATUS.PENDING
        ) {
          continue;
        }

        await ctx.db.patch(queueEvent._id, {
          status: NOTIFICATION_EVENT_STATUS.PROCESSING,
          attempted_at: now,
          channel_status: result.channel_status,
          next_attempt_at: undefined,
          updated_at: now,
          last_error: result.error,
        });
        continue;
      }

      if (!result.hasFailed) {
        await ctx.db.patch(queueEvent._id, {
          status: NOTIFICATION_EVENT_STATUS.SUPPRESSED,
          last_error: result.error ?? "no_deliverable_channel",
          channel_status: result.channel_status,
          attempted_at: now,
          next_attempt_at: undefined,
          updated_at: now,
        });
        continue;
      }

      failed += 1;
      const retryCount = queueEvent.retry_count + 1;
      const shouldDeadLetter = retryCount >= maxRetries;

      await ctx.db.patch(queueEvent._id, {
        status: shouldDeadLetter
          ? NOTIFICATION_EVENT_STATUS.DEAD_LETTER
          : NOTIFICATION_EVENT_STATUS.FAILED,
        retry_count: retryCount,
        next_attempt_at: shouldDeadLetter ? undefined : now + retryBaseMs * Math.pow(2, retryCount),
        last_error: result.error ?? "dispatch_schedule_failed",
        final_error: shouldDeadLetter ? (result.error ?? "dispatch_schedule_failed") : undefined,
        failed_at: now,
        channel_status: result.channel_status,
        attempted_at: now,
        updated_at: now,
      });
    }

    return { processed, failed };
  },
});

export const recordChannelResult = internalMutation({
  args: {
    event_id: v.id("notification_events"),
    channel: v.union(
      v.literal(NOTIFICATION_CHANNEL.PUSH),
      v.literal(NOTIFICATION_CHANNEL.WHATSAPP),
      v.literal(NOTIFICATION_CHANNEL.SMS),
      v.literal(NOTIFICATION_CHANNEL.EMAIL),
    ),
    success: v.boolean(),
    error: v.optional(v.string()),
    provider_message_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.event_id);
    if (!event || event.is_deleted) {
      return { updated: false };
    }

    if (!event.channels.includes(args.channel)) {
      return { updated: false };
    }

    return await applyChannelResult(ctx, {
      event,
      channel: args.channel,
      success: args.success,
      error: args.error,
      provider_message_id: args.provider_message_id,
    });
  },
});

export const retryFailed = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const maxRetries = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_MAX_RETRIES,
      3,
    );

    const failedItems = await ctx.db
      .query("notification_events")
      .withIndex("by_status_and_next_attempt", (q) =>
        q.eq("status", NOTIFICATION_EVENT_STATUS.FAILED).lte("next_attempt_at", now),
      )
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .take(args.limit ?? 50);

    let retried = 0;
    let dead_lettered = 0;

    for (const event of failedItems) {
      const failedEvent = await ctx.db.get(event._id);
      if (
        !failedEvent ||
        failedEvent.is_deleted ||
        failedEvent.status !== NOTIFICATION_EVENT_STATUS.FAILED
      ) {
        continue;
      }

      if (failedEvent.retry_count >= maxRetries) {
        dead_lettered += 1;
        await ctx.db.patch(failedEvent._id, {
          status: NOTIFICATION_EVENT_STATUS.DEAD_LETTER,
          final_error: failedEvent.last_error ?? "max_retries_exhausted",
          failed_at: now,
          updated_at: now,
        });
        continue;
      }

      const failedChannels = failedEvent.channels.filter(
        (channel): channel is Exclude<NotificationChannel, "IN_APP"> =>
          channel !== NOTIFICATION_CHANNEL.IN_APP &&
          failedEvent.channel_status?.[channel]?.status === "FAILED",
      );

      if (failedChannels.length === 0) {
        const deliveredChannels = failedEvent.channels.filter(
          (channel): channel is Exclude<NotificationChannel, "IN_APP"> =>
            channel !== NOTIFICATION_CHANNEL.IN_APP &&
            failedEvent.channel_status?.[channel]?.status === "DELIVERED",
        );

        await ctx.db.patch(failedEvent._id, {
          status:
            deliveredChannels.length > 0
              ? NOTIFICATION_EVENT_STATUS.DELIVERED
              : NOTIFICATION_EVENT_STATUS.SUPPRESSED,
          delivered_at: deliveredChannels.length > 0 ? now : undefined,
          failed_at: deliveredChannels.length > 0 ? undefined : failedEvent.failed_at,
          next_attempt_at: undefined,
          updated_at: now,
        });
        continue;
      }

      retried += 1;
      await ctx.db.patch(failedEvent._id, {
        status: NOTIFICATION_EVENT_STATUS.PENDING,
        next_attempt_at: now,
        last_error: undefined,
        updated_at: now,
      });
    }

    return { retried, dead_lettered };
  },
});

export const recoverStaleProcessing = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const maxRetries = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_MAX_RETRIES,
      3,
    );
    const retryBaseMs = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_RETRY_BASE_MS,
      2000,
    );

    const staleCutoff = now - PROCESSING_TIMEOUT_MS;
    const staleItems = await ctx.db
      .query("notification_events")
      .withIndex("by_status", (q) => q.eq("status", NOTIFICATION_EVENT_STATUS.PROCESSING))
      .filter((q) =>
        q.and(q.eq(q.field("is_deleted"), false), q.lte(q.field("updated_at"), staleCutoff)),
      )
      .take(args.limit ?? 50);

    let requeued = 0;
    let dead_lettered = 0;

    for (const event of staleItems) {
      const staleEvent = await ctx.db.get(event._id);
      if (
        !staleEvent ||
        staleEvent.is_deleted ||
        staleEvent.status !== NOTIFICATION_EVENT_STATUS.PROCESSING ||
        staleEvent.updated_at > staleCutoff
      ) {
        continue;
      }

      const retryCount = staleEvent.retry_count + 1;
      const channelStatus = mergeChannelStatus(staleEvent, now);
      const externalChannels = staleEvent.channels.filter(
        (channel): channel is Exclude<NotificationChannel, "IN_APP"> =>
          channel !== NOTIFICATION_CHANNEL.IN_APP,
      );

      for (const channel of externalChannels) {
        const current = channelStatus[channel];
        if (current?.status !== "SCHEDULED" && current?.status !== "PENDING") {
          continue;
        }

        channelStatus[channel] = {
          status: "FAILED",
          attempt_count: Math.max(current?.attempt_count ?? 0, 1),
          scheduled_at: current?.scheduled_at,
          delivered_at: undefined,
          failed_at: now,
          last_error: "processing_timeout",
          provider_message_id: current?.provider_message_id,
        };
      }

      if (retryCount >= maxRetries) {
        dead_lettered += 1;
        await ctx.db.patch(staleEvent._id, {
          status: NOTIFICATION_EVENT_STATUS.DEAD_LETTER,
          retry_count: retryCount,
          next_attempt_at: undefined,
          last_error: "processing_timeout",
          final_error: "processing_timeout",
          failed_at: now,
          delivered_at: undefined,
          channel_status: channelStatus,
          updated_at: now,
        });
        continue;
      }

      requeued += 1;
      await ctx.db.patch(staleEvent._id, {
        status: NOTIFICATION_EVENT_STATUS.PENDING,
        retry_count: retryCount,
        next_attempt_at: now + retryBaseMs * Math.pow(2, retryCount),
        last_error: "processing_timeout",
        final_error: undefined,
        failed_at: undefined,
        delivered_at: undefined,
        channel_status: channelStatus,
        updated_at: now,
      });
    }

    return { recovered: requeued, dead_lettered };
  },
});

export const getMyNotifications = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(notificationCategoryValidator),
  },
  handler: async (ctx, args): Promise<PaginationResult<Doc<"notifications">>> => {
    const user = await requireAuth(ctx);

    if (args.category) {
      const page = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_created", (q) => q.eq("user_id", user._id))
        .filter((q) =>
          q.and(q.eq(q.field("is_deleted"), false), q.eq(q.field("category"), args.category)),
        )
        .order("desc")
        .paginate(args.paginationOpts);

      return page;
    }

    return await ctx.db
      .query("notifications")
      .withIndex("by_user_and_created", (q) => q.eq("user_id", user._id))
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_is_read", (q) => q.eq("user_id", user._id).eq("is_read", false))
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .collect();

    return { unread_count: unread.length };
  },
});

export const markRead = mutation({
  args: {
    notification_id: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const notification = await ctx.db.get(args.notification_id);

    if (!notification || notification.is_deleted || notification.user_id !== user._id) {
      throw new Error("Notification not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.notification_id, {
      is_read: true,
      read_at: now,
      updated_at: now,
    });

    return await ctx.db.get(args.notification_id);
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_is_read", (q) => q.eq("user_id", user._id).eq("is_read", false))
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .collect();

    const now = Date.now();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, {
        is_read: true,
        read_at: now,
        updated_at: now,
      });
    }

    return { updated_count: unread.length };
  },
});

export const adminList = query({
  args: {
    status: v.optional(
      v.union(
        v.literal(NOTIFICATION_EVENT_STATUS.PENDING),
        v.literal(NOTIFICATION_EVENT_STATUS.PROCESSING),
        v.literal(NOTIFICATION_EVENT_STATUS.DELIVERED),
        v.literal(NOTIFICATION_EVENT_STATUS.FAILED),
        v.literal(NOTIFICATION_EVENT_STATUS.DEAD_LETTER),
        v.literal(NOTIFICATION_EVENT_STATUS.SUPPRESSED),
      ),
    ),
    channel: v.optional(notificationChannelValidator),
    category: v.optional(notificationCategoryValidator),
    user_id: v.optional(v.id("users")),
    from_ts: v.optional(v.number()),
    to_ts: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.NOTIFICATIONS_VIEW);

    const indexedByStatus = args.status !== undefined;
    const indexedByUser = !indexedByStatus && args.user_id !== undefined;
    const indexedByCategory = !indexedByStatus && !indexedByUser && args.category !== undefined;

    let items: Doc<"notification_events">[];

    if (indexedByStatus) {
      const status = args.status;
      if (!status) {
        throw new Error("status is required when indexedByStatus is true");
      }
      items = await ctx.db
        .query("notification_events")
        .withIndex("by_status", (q) => q.eq("status", status))
        .filter((q) => q.eq(q.field("is_deleted"), false))
        .collect();
    } else if (indexedByUser) {
      const userId = args.user_id;
      if (!userId) {
        throw new Error("user_id is required when indexedByUser is true");
      }
      items = await ctx.db
        .query("notification_events")
        .withIndex("by_user_id", (q) => q.eq("user_id", userId))
        .filter((q) => q.eq(q.field("is_deleted"), false))
        .collect();
    } else if (indexedByCategory) {
      const category = args.category;
      if (!category) {
        throw new Error("category is required when indexedByCategory is true");
      }
      items = await ctx.db
        .query("notification_events")
        .withIndex("by_category_and_created", (q) => q.eq("category", category))
        .filter((q) => q.eq(q.field("is_deleted"), false))
        .collect();
    } else {
      // V1 fallback: no single selective index for multi-dimensional filters without status/user/category.
      items = await ctx.db
        .query("notification_events")
        .filter((q) => q.eq(q.field("is_deleted"), false))
        .collect();
    }

    if (args.status && !indexedByStatus) {
      items = items.filter((item) => item.status === args.status);
    }
    const channelFilter = args.channel;
    if (channelFilter !== undefined) {
      const channel = channelFilter;
      items = items.filter((item) => item.channels.includes(channel));
    }
    if (args.category && !indexedByCategory) {
      items = items.filter((item) => item.category === args.category);
    }
    if (args.user_id && !indexedByUser) {
      items = items.filter((item) => item.user_id === args.user_id);
    }
    if (args.from_ts !== undefined) {
      items = items.filter((item) => item.created_at >= args.from_ts!);
    }
    if (args.to_ts !== undefined) {
      items = items.filter((item) => item.created_at <= args.to_ts!);
    }

    const sorted = items.sort((a, b) => b.created_at - a.created_at);
    const start = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
    const page = sorted.slice(start, start + args.paginationOpts.numItems);
    const nextCursor =
      start + args.paginationOpts.numItems < sorted.length
        ? String(start + args.paginationOpts.numItems)
        : null;

    return {
      page,
      isDone: nextCursor === null,
      continueCursor: nextCursor,
      pageStatus: "SplitRecommended" as const,
    };
  },
});

export const adminGetDeadLetter = query({
  args: {
    channel: v.optional(notificationChannelValidator),
    from_ts: v.optional(v.number()),
    to_ts: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.NOTIFICATIONS_VIEW);

    let items = await ctx.db
      .query("notification_events")
      .withIndex("by_final_status", (q) => q.eq("status", NOTIFICATION_EVENT_STATUS.DEAD_LETTER))
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .collect();

    const channelFilter = args.channel;
    if (channelFilter !== undefined) {
      const channel = channelFilter;
      items = items.filter((item) => item.channels.includes(channel));
    }
    if (args.from_ts !== undefined) {
      items = items.filter((item) => item.created_at >= args.from_ts!);
    }
    if (args.to_ts !== undefined) {
      items = items.filter((item) => item.created_at <= args.to_ts!);
    }

    const sorted = items.sort((a, b) => (b.failed_at ?? 0) - (a.failed_at ?? 0));
    const start = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
    const page = sorted.slice(start, start + args.paginationOpts.numItems);
    const nextCursor =
      start + args.paginationOpts.numItems < sorted.length
        ? String(start + args.paginationOpts.numItems)
        : null;

    return {
      page,
      isDone: nextCursor === null,
      continueCursor: nextCursor,
      pageStatus: "SplitRecommended" as const,
    };
  },
});

export const processDeliveryWebhook = internalMutation({
  args: {
    provider_message_id: v.string(),
    status: v.union(v.literal("DELIVERED"), v.literal("FAILED")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let event = await ctx.db
      .query("notification_events")
      .withIndex("by_provider_message_id", (q) =>
        q.eq("provider_message_id", args.provider_message_id),
      )
      .filter((q) => q.eq(q.field("is_deleted"), false))
      .first();

    if (!event) {
      const processingCandidates = await ctx.db
        .query("notification_events")
        .withIndex("by_status", (q) => q.eq("status", NOTIFICATION_EVENT_STATUS.PROCESSING))
        .filter((q) => q.eq(q.field("is_deleted"), false))
        .take(PROCESSING_WEBHOOK_LOOKUP_LIMIT);

      event =
        processingCandidates.find((candidate) =>
          Object.values(candidate.channel_status ?? {}).some(
            (state) => state?.provider_message_id === args.provider_message_id,
          ),
        ) ?? null;
    }

    if (!event) {
      return { updated: false };
    }

    const matchedChannel = event.channels.find(
      (channel): channel is Exclude<NotificationChannel, "IN_APP"> =>
        channel !== NOTIFICATION_CHANNEL.IN_APP &&
        event.channel_status?.[channel]?.provider_message_id === args.provider_message_id,
    );

    if (!matchedChannel) {
      return { updated: false };
    }

    return await applyChannelResult(ctx, {
      event,
      channel: matchedChannel,
      success: args.status === "DELIVERED",
      error: args.error,
      provider_message_id: args.provider_message_id,
    });
  },
});

export const getRuntimeConfig = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.NOTIFICATIONS_VIEW);

    const quietStart = await getSystemConfigRawValue(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_QUIET_HOURS_START,
    );
    const quietEnd = await getSystemConfigRawValue(
      ctx,
      SYSTEM_CONFIG_KEYS.NOTIFICATION_QUIET_HOURS_END,
    );

    return {
      quiet_hours_start: quietStart ?? "22:00",
      quiet_hours_end: quietEnd ?? "07:00",
    };
  },
});
