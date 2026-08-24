// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./functions";
import type { MutationCtx } from "./_generated/server";
import {
  DEMO_EMAILS,
  daysAgo,
  daysFromNow,
  ensureSeedRecord,
  hoursAgo,
  lookupUserDoc,
  minutesAgo,
} from "./seedHelpers";

const DEMO_USERS = {
  founder_one: { email: "admin@example.com", phone: undefined, user_type: "ADMIN" as const },
  agent: { email: "agent@example.com", phone: undefined, user_type: "ADMIN" as const },
  guard1: {
    email: "9999999999@guards.local",
    phone: "9999999999",
    user_type: "GUARD" as const,
  },
  guard2: {
    email: "9876543210@guards.local",
    phone: "9876543210",
    user_type: "GUARD" as const,
  },
  guard3: {
    email: "9765432109@guards.local",
    phone: "9765432109",
    user_type: "GUARD" as const,
  },
  ops1: {
    email: "8888888888@ops.local",
    phone: "8888888888",
    user_type: "OPS" as const,
  },
  ops2: {
    email: "7777777777@ops.local",
    phone: "7777777777",
    user_type: "OPS" as const,
  },
  tenant1: { email: "tenant1@test.demorentals.com", phone: undefined, user_type: "TENANT" as const },
  tenant2: { email: "tenant2@test.demorentals.com", phone: undefined, user_type: "TENANT" as const },
  owner1: { email: "owner1@test.demorentals.com", phone: undefined, user_type: "OWNER" as const },
  owner2: { email: "owner2@test.demorentals.com", phone: undefined, user_type: "OWNER" as const },
} as const;

type DemoUserKey = keyof typeof DEMO_USERS;
type IncentivePersona = Doc<"incentive_actor_profiles">["persona"];

const NOTIFICATION_CATEGORIES: Array<
  Doc<"notification_preferences">["category_settings"][number]["category"]
> = [
  "LEAD_UPDATE",
  "VISIT_UPDATE",
  "PAYOUT_UPDATE",
  "INQUIRY_UPDATE",
  "AGREEMENT_STATUS",
  "MOVE_IN_REMINDER",
  "MAINTENANCE_UPDATE",
  "SYSTEM_ALERT",
];

const NOTIFICATION_CHANNELS_ON = {
  in_app: true,
  push: true,
  whatsapp: true,
  sms: true,
  email: true,
} as const;

function dayStartMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isoWeekKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const year = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000) + 1) / 7,
  );

  return `${year}-${String(week).padStart(2, "0")}`;
}

async function resolveUser(ctx: MutationCtx, key: DemoUserKey): Promise<Doc<"users">> {
  const lookup = DEMO_USERS[key];

  let user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", lookup.email))
    .filter((q) => q.eq(q.field("user_type"), lookup.user_type))
    .first();

  const lookupPhone = lookup.phone;

  if (!user && lookupPhone) {
    user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", lookupPhone))
      .filter((q) => q.eq(q.field("user_type"), lookup.user_type))
      .first();
  }

  if (!user) {
    throw new Error(`seedDemoTier2: Missing user ${key} (${lookup.user_type})`);
  }

  return user;
}

async function resolveUsers(ctx: MutationCtx): Promise<Record<DemoUserKey, Doc<"users">>> {
  const entries = await Promise.all(
    (Object.keys(DEMO_USERS) as DemoUserKey[]).map(async (key) => {
      return [key, await resolveUser(ctx, key)] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<DemoUserKey, Doc<"users">>;
}

export const seedDemoNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await resolveUsers(ctx);
    const orderedUserKeys = Object.keys(DEMO_USERS) as DemoUserKey[];

    let preferenceInserts = 0;
    let preferenceUpdates = 0;

    for (const key of orderedUserKeys) {
      const user = users[key];
      const existing = await ctx.db
        .query("notification_preferences")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
        .first();

      const payload: Omit<Doc<"notification_preferences">, "_id" | "_creationTime" | "user_id"> = {
        locale: "en",
        timezone: "Asia/Kolkata",
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
        whatsapp_opt_out: false,
        channels_enabled: { ...NOTIFICATION_CHANNELS_ON },
        category_settings: NOTIFICATION_CATEGORIES.map((category) => ({
          category,
          channels: { ...NOTIFICATION_CHANNELS_ON },
        })),
        is_deleted: false,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        preferenceUpdates += 1;
      } else {
        await ctx.db.insert("notification_preferences", {
          user_id: user._id,
          ...payload,
        });
        preferenceInserts += 1;
      }
    }

    const templateDefinitions: Array<{
      event_type: string;
      category: Doc<"notification_templates">["category"];
      subject: string;
      body: string;
      variables: string[];
    }> = [
      {
        event_type: "lead_verified",
        category: "LEAD_UPDATE",
        subject: "Lead verified for {{flat_number}}",
        body: "Great news {{guard_name}}! Lead for {{flat_number}}, {{building_name}} is now verified.",
        variables: ["guard_name", "flat_number", "building_name"],
      },
      {
        event_type: "lead_rejected",
        category: "LEAD_UPDATE",
        subject: "Lead update for {{flat_number}}",
        body: "Lead for {{flat_number}} in {{building_name}} was rejected. Reason: {{reason}}.",
        variables: ["flat_number", "building_name", "reason"],
      },
      {
        event_type: "visit_scheduled",
        category: "VISIT_UPDATE",
        subject: "Visit scheduled at {{building_name}}",
        body: "Visit for {{flat_number}} is set on {{visit_date}} at {{visit_time}}.",
        variables: ["building_name", "flat_number", "visit_date", "visit_time"],
      },
      {
        event_type: "visit_completed",
        category: "VISIT_UPDATE",
        subject: "Visit completed for {{flat_number}}",
        body: "Visit completed. Outcome: {{visit_outcome}}. Next step: {{next_step}}.",
        variables: ["flat_number", "visit_outcome", "next_step"],
      },
      {
        event_type: "payout_approved",
        category: "PAYOUT_UPDATE",
        subject: "Payout approved: {{amount_inr}}",
        body: "Your payout of {{amount_inr}} has been approved and is queued for disbursal.",
        variables: ["amount_inr"],
      },
      {
        event_type: "payout_disbursed",
        category: "PAYOUT_UPDATE",
        subject: "Payout sent: {{amount_inr}}",
        body: "{{amount_inr}} has been disbursed to your account. Ref: {{payment_ref}}.",
        variables: ["amount_inr", "payment_ref"],
      },
      {
        event_type: "inquiry_received",
        category: "INQUIRY_UPDATE",
        subject: "New inquiry from {{tenant_name}}",
        body: "A new inquiry arrived for {{flat_number}}. Tenant: {{tenant_name}}, Phone: {{tenant_phone}}.",
        variables: ["flat_number", "tenant_name", "tenant_phone"],
      },
      {
        event_type: "system_welcome",
        category: "SYSTEM_ALERT",
        subject: "Welcome to Rental Platform OS",
        body: "Hi {{name}}, your {{persona}} account is ready. Start at {{start_url}}.",
        variables: ["name", "persona", "start_url"],
      },
    ];

    const channels: Array<Doc<"notification_templates">["channel"]> = [
      "IN_APP",
      "PUSH",
      "WHATSAPP",
    ];

    let templateInserts = 0;
    let templateUpdates = 0;

    for (const definition of templateDefinitions) {
      for (const channel of channels) {
        const existing = await ctx.db
          .query("notification_templates")
          .withIndex("by_event_channel_locale", (q) =>
            q.eq("event_type", definition.event_type).eq("channel", channel).eq("locale", "en"),
          )
          .first();

        const bodyByChannel =
          channel === "WHATSAPP"
            ? `*${definition.subject}*\n${definition.body}`
            : channel === "PUSH"
              ? `${definition.body} Tap to view details.`
              : definition.body;

        if (existing) {
          await ctx.db.patch(existing._id, {
            category: definition.category,
            subject: definition.subject,
            body: bodyByChannel,
            variables: definition.variables,
            version: existing.version ?? 1,
            is_active: true,
            is_deleted: false,
            updated_at: now,
          });
          templateUpdates += 1;
          continue;
        }

        await ctx.db.insert("notification_templates", {
          event_type: definition.event_type,
          category: definition.category,
          channel,
          locale: "en",
          subject: definition.subject,
          body: bodyByChannel,
          variables: definition.variables,
          version: 1,
          is_active: true,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        });
        templateInserts += 1;
      }
    }

    const eventSeeds: Array<{
      key: string;
      user: DemoUserKey;
      event_type: string;
      category: Doc<"notification_events">["category"];
      severity: Doc<"notification_events">["severity"];
      status: Doc<"notification_events">["status"];
      channels: Doc<"notification_events">["channels"];
      payload: Record<string, string | number | boolean>;
      action_url: string;
      is_read: boolean;
      delivered_channel?: Exclude<Doc<"notification_events">["channels"][number], "IN_APP">;
      failed_channel?: Exclude<Doc<"notification_events">["channels"][number], "IN_APP">;
      suppressed_channel?: Exclude<Doc<"notification_events">["channels"][number], "IN_APP">;
    }> = [
      {
        key: "evt-1",
        user: "guard1",
        event_type: "lead_verified",
        category: "LEAD_UPDATE",
        severity: "IMPORTANT",
        status: "DELIVERED",
        channels: ["IN_APP", "PUSH", "WHATSAPP"],
        payload: {
          guard_name: "Test Guard",
          flat_number: "501",
          building_name: "Sunshine Heights",
          rent_amount: 3000000,
        },
        action_url: "/guard/leads",
        is_read: false,
        delivered_channel: "PUSH",
      },
      {
        key: "evt-2",
        user: "guard2",
        event_type: "lead_rejected",
        category: "LEAD_UPDATE",
        severity: "NORMAL",
        status: "FAILED",
        channels: ["IN_APP", "PUSH"],
        payload: {
          guard_name: "Rajesh Kumar",
          flat_number: "202",
          building_name: "Sunshine Wing B",
          reason: "Owner unavailable",
        },
        action_url: "/guard/leads",
        is_read: true,
        failed_channel: "PUSH",
      },
      {
        key: "evt-3",
        user: "guard3",
        event_type: "visit_scheduled",
        category: "VISIT_UPDATE",
        severity: "IMPORTANT",
        status: "PROCESSING",
        channels: ["IN_APP", "PUSH", "WHATSAPP"],
        payload: {
          flat_number: "904",
          building_name: "Green Valley",
          visit_date: "2026-02-24",
          visit_time: "18:30",
        },
        action_url: "/guard/visits",
        is_read: false,
      },
      {
        key: "evt-4",
        user: "ops1",
        event_type: "visit_completed",
        category: "VISIT_UPDATE",
        severity: "NORMAL",
        status: "PENDING",
        channels: ["IN_APP", "PUSH"],
        payload: {
          flat_number: "604",
          visit_outcome: "INTERESTED",
          next_step: "Start closure checklist",
        },
        action_url: "/ops/visits",
        is_read: false,
      },
      {
        key: "evt-5",
        user: "guard1",
        event_type: "payout_approved",
        category: "PAYOUT_UPDATE",
        severity: "IMPORTANT",
        status: "DELIVERED",
        channels: ["IN_APP", "PUSH", "WHATSAPP"],
        payload: {
          amount_inr: "Rs 450",
          payment_ref: "APPROVED-P1",
        },
        action_url: "/guard/earnings",
        is_read: true,
        delivered_channel: "WHATSAPP",
      },
      {
        key: "evt-6",
        user: "guard2",
        event_type: "payout_disbursed",
        category: "PAYOUT_UPDATE",
        severity: "IMPORTANT",
        status: "DELIVERED",
        channels: ["IN_APP", "PUSH", "WHATSAPP"],
        payload: {
          amount_inr: "Rs 720",
          payment_ref: "DEMO-UPI-P4",
        },
        action_url: "/guard/earnings",
        is_read: false,
        delivered_channel: "PUSH",
      },
      {
        key: "evt-7",
        user: "owner1",
        event_type: "inquiry_received",
        category: "INQUIRY_UPDATE",
        severity: "NORMAL",
        status: "SUPPRESSED",
        channels: ["IN_APP", "PUSH", "WHATSAPP"],
        payload: {
          tenant_name: "Ankit Mehta",
          tenant_phone: "9300000001",
          flat_number: "501",
        },
        action_url: "/owner/messages",
        is_read: false,
        suppressed_channel: "WHATSAPP",
      },
      {
        key: "evt-8",
        user: "tenant1",
        event_type: "system_welcome",
        category: "SYSTEM_ALERT",
        severity: "URGENT",
        status: "DEAD_LETTER",
        channels: ["IN_APP", "PUSH", "WHATSAPP"],
        payload: {
          name: "Ankit",
          persona: "TENANT",
          start_url: "/listings",
        },
        action_url: "/tenant/dashboard",
        is_read: false,
        failed_channel: "PUSH",
      },
    ];

    let eventInserts = 0;
    let eventUpdates = 0;
    let notificationInserts = 0;
    let notificationUpdates = 0;

    for (let index = 0; index < eventSeeds.length; index += 1) {
      const seed = eventSeeds[index];
      const user = users[seed.user];
      const createdAt = now - (eventSeeds.length - index) * 90_000;
      const dedupKey = `tier2:notification:${seed.key}`;

      const channelStatus: NonNullable<Doc<"notification_events">["channel_status"]> = {
        IN_APP: {
          status: "DELIVERED",
          attempt_count: 1,
          delivered_at: createdAt,
          provider_message_id: `in-app-${seed.key}`,
        },
      };

      for (const channel of seed.channels) {
        if (channel === "IN_APP") {
          continue;
        }

        if (seed.delivered_channel === channel) {
          channelStatus[channel] = {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: createdAt + 30_000,
            provider_message_id: `${channel.toLowerCase()}-${seed.key}`,
          };
          continue;
        }

        if (seed.failed_channel === channel) {
          channelStatus[channel] = {
            status: "FAILED",
            attempt_count: 2,
            failed_at: createdAt + 45_000,
            last_error: `${channel.toLowerCase()}_provider_timeout`,
          };
          continue;
        }

        if (seed.suppressed_channel === channel) {
          channelStatus[channel] = {
            status: "SUPPRESSED",
            attempt_count: 0,
            last_error: `${channel.toLowerCase()}_suppressed_by_quiet_hours`,
          };
          continue;
        }

        channelStatus[channel] = {
          status: "PENDING",
          attempt_count: 0,
          scheduled_at: createdAt + 60_000,
        };
      }

      const existingEvent = await ctx.db
        .query("notification_events")
        .withIndex("by_dedup_key", (q) => q.eq("dedup_key", dedupKey))
        .filter((q) => q.eq(q.field("user_id"), user._id))
        .first();

      let eventId: Id<"notification_events">;
      if (existingEvent) {
        await ctx.db.patch(existingEvent._id, {
          event_type: seed.event_type,
          category: seed.category,
          severity: seed.severity,
          status: seed.status,
          channels: seed.channels,
          payload: seed.payload,
          channel_status: channelStatus,
          retry_count: 0,
          next_attempt_at: seed.status === "PROCESSING" ? createdAt + 120_000 : undefined,
          last_error: seed.status === "FAILED" ? "push_provider_timeout" : undefined,
          final_error: seed.status === "DEAD_LETTER" ? "max_retry_exceeded" : undefined,
          provider_message_id: seed.status === "DELIVERED" ? `provider-${seed.key}` : undefined,
          attempted_at: createdAt + 30_000,
          delivered_at: seed.status === "DELIVERED" ? createdAt + 40_000 : undefined,
          failed_at:
            seed.status === "FAILED" || seed.status === "DEAD_LETTER"
              ? createdAt + 45_000
              : undefined,
          is_deleted: false,
          updated_at: now,
        });
        eventId = existingEvent._id;
        eventUpdates += 1;
      } else {
        eventId = await ctx.db.insert("notification_events", {
          user_id: user._id,
          event_type: seed.event_type,
          category: seed.category,
          severity: seed.severity,
          status: seed.status,
          channels: seed.channels,
          payload: seed.payload,
          dedup_key: dedupKey,
          channel_status: channelStatus,
          retry_count: 0,
          next_attempt_at: seed.status === "PROCESSING" ? createdAt + 120_000 : undefined,
          last_error: seed.status === "FAILED" ? "push_provider_timeout" : undefined,
          final_error: seed.status === "DEAD_LETTER" ? "max_retry_exceeded" : undefined,
          provider_message_id: seed.status === "DELIVERED" ? `provider-${seed.key}` : undefined,
          attempted_at: createdAt + 30_000,
          delivered_at: seed.status === "DELIVERED" ? createdAt + 40_000 : undefined,
          failed_at:
            seed.status === "FAILED" || seed.status === "DEAD_LETTER"
              ? createdAt + 45_000
              : undefined,
          is_deleted: false,
          created_at: createdAt,
          updated_at: now,
        });
        eventInserts += 1;
      }

      const existingNotification = await ctx.db
        .query("notifications")
        .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
        .filter((q) => q.eq(q.field("event_id"), eventId))
        .filter((q) => q.eq(q.field("channel"), "IN_APP"))
        .first();

      const title = seed.event_type
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      const body =
        seed.event_type === "lead_verified"
          ? `Lead for flat ${(seed.payload.flat_number as string) ?? "--"} verified.`
          : seed.event_type === "lead_rejected"
            ? `Lead ${(seed.payload.flat_number as string) ?? "--"} rejected: ${(seed.payload.reason as string) ?? "n/a"}.`
            : seed.event_type === "visit_scheduled"
              ? `Visit set for ${(seed.payload.flat_number as string) ?? "--"} on ${(seed.payload.visit_date as string) ?? "TBD"}.`
              : seed.event_type === "visit_completed"
                ? `Visit outcome ${(seed.payload.visit_outcome as string) ?? "RECORDED"} for ${(seed.payload.flat_number as string) ?? "--"}.`
                : seed.event_type === "payout_approved"
                  ? `Payout ${(seed.payload.amount_inr as string) ?? ""} approved.`
                  : seed.event_type === "payout_disbursed"
                    ? `Payout ${(seed.payload.amount_inr as string) ?? ""} disbursed.`
                    : seed.event_type === "inquiry_received"
                      ? `New inquiry from ${(seed.payload.tenant_name as string) ?? "tenant"}.`
                      : `Welcome ${(seed.payload.name as string) ?? "user"} to Rental Platform OS.`;

      if (existingNotification) {
        await ctx.db.patch(existingNotification._id, {
          event_id: eventId,
          category: seed.category,
          severity: seed.severity,
          channel: "IN_APP",
          title,
          body,
          action_url: seed.action_url,
          metadata: seed.payload,
          is_read: seed.is_read,
          read_at: seed.is_read ? createdAt + 70_000 : undefined,
          is_deleted: false,
          updated_at: now,
        });
        notificationUpdates += 1;
      } else {
        await ctx.db.insert("notifications", {
          user_id: user._id,
          event_id: eventId,
          category: seed.category,
          severity: seed.severity,
          channel: "IN_APP",
          title,
          body,
          action_url: seed.action_url,
          metadata: seed.payload,
          is_read: seed.is_read,
          read_at: seed.is_read ? createdAt + 70_000 : undefined,
          is_deleted: false,
          created_at: createdAt,
          updated_at: now,
        });
        notificationInserts += 1;
      }
    }

    const pushSeeds: Array<{ user: DemoUserKey; endpointSuffix: string }> = [
      { user: "guard1", endpointSuffix: "guard-001" },
      { user: "ops1", endpointSuffix: "ops-001" },
      { user: "tenant1", endpointSuffix: "tenant-001" },
    ];

    let pushInserts = 0;
    let pushUpdates = 0;

    for (const seed of pushSeeds) {
      const user = users[seed.user];
      const endpoint = `https://fcm.googleapis.com/fcm/send/demo-${seed.endpointSuffix}`;
      const existing = await ctx.db
        .query("push_subscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          user_id: user._id,
          p256dh: `BDemoKey-${seed.endpointSuffix}`,
          auth: `demoAuth-${seed.endpointSuffix}`,
          user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
          device_fingerprint: `demo-device-${seed.endpointSuffix}`,
          last_error: undefined,
          is_active: true,
          is_deleted: false,
          updated_at: now,
        });
        pushUpdates += 1;
        continue;
      }

      await ctx.db.insert("push_subscriptions", {
        user_id: user._id,
        endpoint,
        p256dh: `BDemoKey-${seed.endpointSuffix}`,
        auth: `demoAuth-${seed.endpointSuffix}`,
        user_agent: "Mozilla/5.0 (Linux; Android 14; Demo Device)",
        device_fingerprint: `demo-device-${seed.endpointSuffix}`,
        last_error: undefined,
        is_active: true,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      });
      pushInserts += 1;
    }

    return {
      notification_preferences: { inserted: preferenceInserts, updated: preferenceUpdates },
      notification_templates: { inserted: templateInserts, updated: templateUpdates },
      notification_events: { inserted: eventInserts, updated: eventUpdates },
      notifications: { inserted: notificationInserts, updated: notificationUpdates },
      push_subscriptions: { inserted: pushInserts, updated: pushUpdates },
    };
  },
});

export const seedDemoTrustBadges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const [published, draft, archived] = await Promise.all([
      ctx.db
        .query("listings")
        .withIndex("by_status", (q) => q.eq("status", "PUBLISHED"))
        .collect(),
      ctx.db
        .query("listings")
        .withIndex("by_status", (q) => q.eq("status", "DRAFT"))
        .collect(),
      ctx.db
        .query("listings")
        .withIndex("by_status", (q) => q.eq("status", "ARCHIVED"))
        .collect(),
    ]);

    const allListings = [...published, ...draft, ...archived].sort((a, b) =>
      a.slug.localeCompare(b.slug),
    );
    const targetListings = allListings.slice(0, 6);

    if (targetListings.length === 0) {
      throw new Error("seedDemoTrustBadges: No listings found to seed trust badges");
    }

    const distributions: Array<{
      score: number;
      state: Doc<"listing_trust_badges">["freshness_state"];
      photo_count: number;
      visit_count: number;
      has_closure: boolean;
      owner_verified: boolean;
      physically_inspected: boolean;
      real_photos: boolean;
      visits_completed: boolean;
      closure_history: boolean;
    }> = [
      {
        score: 92,
        state: "FRESH",
        photo_count: 14,
        visit_count: 6,
        has_closure: true,
        owner_verified: true,
        physically_inspected: true,
        real_photos: true,
        visits_completed: true,
        closure_history: true,
      },
      {
        score: 84,
        state: "FRESH",
        photo_count: 9,
        visit_count: 4,
        has_closure: true,
        owner_verified: true,
        physically_inspected: true,
        real_photos: true,
        visits_completed: true,
        closure_history: true,
      },
      {
        score: 58,
        state: "AGING",
        photo_count: 5,
        visit_count: 2,
        has_closure: false,
        owner_verified: true,
        physically_inspected: true,
        real_photos: true,
        visits_completed: true,
        closure_history: false,
      },
      {
        score: 45,
        state: "AGING",
        photo_count: 4,
        visit_count: 1,
        has_closure: false,
        owner_verified: true,
        physically_inspected: false,
        real_photos: true,
        visits_completed: true,
        closure_history: false,
      },
      {
        score: 18,
        state: "STALE",
        photo_count: 2,
        visit_count: 0,
        has_closure: false,
        owner_verified: false,
        physically_inspected: false,
        real_photos: false,
        visits_completed: false,
        closure_history: false,
      },
      {
        score: 9,
        state: "STALE",
        photo_count: 1,
        visit_count: 0,
        has_closure: false,
        owner_verified: false,
        physically_inspected: false,
        real_photos: false,
        visits_completed: false,
        closure_history: false,
      },
    ];

    let inserts = 0;
    let updates = 0;

    for (let index = 0; index < targetListings.length; index += 1) {
      const listing = targetListings[index]!;
      const distribution = distributions[index % distributions.length]!;
      const activityAt = now - (index + 1) * 24 * 60 * 60 * 1000;

      const badges: Doc<"listing_trust_badges">["badges"] = [
        {
          type: "OWNER_VERIFIED",
          earned: distribution.owner_verified,
          timestamp: distribution.owner_verified ? activityAt - 8 * 60 * 60 * 1000 : undefined,
          count: distribution.owner_verified ? 1 : undefined,
        },
        {
          type: "PHYSICALLY_INSPECTED",
          earned: distribution.physically_inspected,
          timestamp: distribution.physically_inspected
            ? activityAt - 6 * 60 * 60 * 1000
            : undefined,
          count: distribution.physically_inspected ? distribution.visit_count : undefined,
        },
        {
          type: "FRESH_LISTING",
          earned: distribution.state === "FRESH",
          timestamp: activityAt,
          count: distribution.score,
        },
        {
          type: "REAL_PHOTOS",
          earned: distribution.real_photos,
          timestamp: distribution.real_photos ? activityAt - 4 * 60 * 60 * 1000 : undefined,
          count: distribution.photo_count,
        },
        {
          type: "VISITS_COMPLETED",
          earned: distribution.visits_completed,
          timestamp: distribution.visits_completed ? activityAt - 2 * 60 * 60 * 1000 : undefined,
          count: distribution.visit_count,
        },
        {
          type: "CLOSURE_HISTORY",
          earned: distribution.closure_history,
          timestamp: distribution.closure_history ? activityAt - 60 * 60 * 1000 : undefined,
          count: distribution.has_closure ? 1 : undefined,
        },
      ];

      const existing = await ctx.db
        .query("listing_trust_badges")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          badges,
          freshness_score: distribution.score,
          freshness_state: distribution.state,
          last_activity_at: activityAt,
          last_computed_at: now,
          evidence: {
            photo_count: distribution.photo_count,
            visit_count: distribution.visit_count,
            has_closure: distribution.has_closure,
          },
          is_deleted: false,
        });
        updates += 1;
      } else {
        await ctx.db.insert("listing_trust_badges", {
          listing_id: listing._id,
          badges,
          freshness_score: distribution.score,
          freshness_state: distribution.state,
          last_activity_at: activityAt,
          last_computed_at: now,
          evidence: {
            photo_count: distribution.photo_count,
            visit_count: distribution.visit_count,
            has_closure: distribution.has_closure,
          },
          is_deleted: false,
        });
        inserts += 1;
      }
    }

    return {
      listing_count: targetListings.length,
      trust_badges: { inserted: inserts, updated: updates },
    };
  },
});

export const seedDemoCommissions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await resolveUsers(ctx);

    const confirmedClosures = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", "CONFIRMED"))
      .collect();

    if (confirmedClosures.length === 0) {
      throw new Error("seedDemoCommissions: No CONFIRMED closures available");
    }

    const primaryClosure = confirmedClosures[0]!;
    const secondaryClosure = confirmedClosures[1] ?? primaryClosure;

    const primaryLead = await ctx.db.get(primaryClosure.lead_id);
    const secondaryLead = await ctx.db.get(secondaryClosure.lead_id);
    if (!primaryLead || !secondaryLead) {
      throw new Error("seedDemoCommissions: Missing lead(s) linked to confirmed closure(s)");
    }

    const [primaryLeadVisits, fallbackVisit] = await Promise.all([
      ctx.db
        .query("visits")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", primaryLead._id))
        .collect(),
      ctx.db
        .query("visits")
        .withIndex("by_status", (q) => q.eq("status", "COMPLETED"))
        .first(),
    ]);

    const visitA = primaryLeadVisits[0] ?? fallbackVisit;
    const visitB = primaryLeadVisits[1] ?? primaryLeadVisits[0] ?? fallbackVisit;

    const configVersion = await ctx.db
      .query("incentive_config_versions")
      .withIndex("by_version", (q) => q.eq("version_code", "v3.0.0"))
      .first();

    const modifierSeeds: Array<{
      name: string;
      description: string;
      persona: IncentivePersona;
      reward_mode: Doc<"commission_modifier_templates">["reward_mode"];
      rule_type: Doc<"commission_modifier_templates">["rule_type"];
      metric_source: string;
      rule_config_json: string;
      link_mode: Doc<"commission_modifier_templates">["link_mode"];
      link_group_id?: string;
      sort_order: number;
    }> = [
      {
        name: "Quality Score Accelerator",
        description: "Boosts commission for consistently high quality submissions.",
        persona: "GUARD",
        reward_mode: "BPS",
        rule_type: "threshold_step",
        metric_source: "quality_score",
        rule_config_json: JSON.stringify({ threshold: 80, delta_bps: 120 }),
        link_mode: "INDIVIDUAL",
        sort_order: 1,
      },
      {
        name: "Streak Continuity Boost",
        description: "Rewards active streak continuity for field teams.",
        persona: "OPS",
        reward_mode: "BPS",
        rule_type: "linear_band",
        metric_source: "streak_days",
        rule_config_json: JSON.stringify({ threshold: 3, threshold_upper: 21, slope_per_unit: 8 }),
        link_mode: "AND_GROUP",
        link_group_id: "field_consistency",
        sort_order: 2,
      },
      {
        name: "Visit Completion Kicker",
        description: "Adds fixed payout bonus after sustained visit throughput.",
        persona: "ALL",
        reward_mode: "FLAT_PAISE",
        rule_type: "threshold_step",
        metric_source: "visits_completed",
        rule_config_json: JSON.stringify({ threshold: 5, delta_paise: 15000 }),
        link_mode: "OR_GROUP",
        link_group_id: "volume_pack",
        sort_order: 3,
      },
      {
        name: "Lead Pipeline Momentum",
        description: "Rewards healthy top-of-funnel lead volume.",
        persona: "GUARD",
        reward_mode: "BPS",
        rule_type: "threshold_step",
        metric_source: "lead_count",
        rule_config_json: JSON.stringify({ threshold: 8, delta_bps: 80 }),
        link_mode: "INDIVIDUAL",
        sort_order: 4,
      },
      {
        name: "Closure Reliability Guardrail",
        description: "Applies a mild penalty when closure count drops below baseline.",
        persona: "OPS",
        reward_mode: "BPS",
        rule_type: "penalty_step",
        metric_source: "closure_count",
        rule_config_json: JSON.stringify({ threshold: 1, delta_bps: -40 }),
        link_mode: "INDIVIDUAL",
        sort_order: 5,
      },
    ];

    let modifierInserts = 0;
    let modifierUpdates = 0;
    const modifierIdsByName = new Map<string, Id<"commission_modifier_templates">>();

    for (const seed of modifierSeeds) {
      const existing = (
        await ctx.db
          .query("commission_modifier_templates")
          .withIndex("by_persona_active", (q) =>
            q.eq("persona", seed.persona).eq("is_active", true),
          )
          .collect()
      ).find((template) => template.name === seed.name);

      if (existing) {
        await ctx.db.patch(existing._id, {
          description: seed.description,
          reward_mode: seed.reward_mode,
          rule_type: seed.rule_type,
          metric_source: seed.metric_source,
          rule_config_json: seed.rule_config_json,
          link_mode: seed.link_mode,
          link_group_id: seed.link_group_id,
          sort_order: seed.sort_order,
          updated_by: users.founder_one._id,
          updated_at: now,
          is_active: true,
        });
        modifierIdsByName.set(seed.name, existing._id);
        modifierUpdates += 1;
      } else {
        const id = await ctx.db.insert("commission_modifier_templates", {
          name: seed.name,
          description: seed.description,
          persona: seed.persona,
          reward_mode: seed.reward_mode,
          rule_type: seed.rule_type,
          metric_source: seed.metric_source,
          rule_config_json: seed.rule_config_json,
          link_mode: seed.link_mode,
          link_group_id: seed.link_group_id,
          is_active: true,
          sort_order: seed.sort_order,
          created_by: users.founder_one._id,
          updated_by: undefined,
          created_at: now,
          updated_at: undefined,
        });
        modifierIdsByName.set(seed.name, id);
        modifierInserts += 1;
      }
    }

    const actorProfileSeeds: Array<{ key: DemoUserKey; persona: IncentivePersona }> = [
      { key: "guard1", persona: "GUARD" },
      { key: "guard2", persona: "GUARD" },
      { key: "guard3", persona: "GUARD" },
      { key: "ops1", persona: "OPS" },
      { key: "ops2", persona: "OPS" },
    ];

    const effectiveFrom = now - 30 * 24 * 60 * 60 * 1000;
    let actorProfileInserts = 0;
    let actorProfileUpdates = 0;

    for (const seed of actorProfileSeeds) {
      const user = users[seed.key];
      const existing = (
        await ctx.db
          .query("incentive_actor_profiles")
          .withIndex("by_user", (q) => q.eq("user_id", user._id))
          .collect()
      ).find((profile) => profile.persona === seed.persona && profile.is_active);

      if (existing) {
        await ctx.db.patch(existing._id, {
          commission_base_bps: 1500,
          commission_min_bps: 1000,
          commission_max_bps: 2200,
          effective_from: effectiveFrom,
          effective_to: undefined,
          is_active: true,
          updated_by: users.founder_one._id,
          updated_at: now,
        });
        actorProfileUpdates += 1;
      } else {
        await ctx.db.insert("incentive_actor_profiles", {
          user_id: user._id,
          persona: seed.persona,
          commission_base_bps: 1500,
          commission_min_bps: 1000,
          commission_max_bps: 2200,
          effective_from: effectiveFrom,
          effective_to: undefined,
          is_active: true,
          assigned_by: users.founder_one._id,
          updated_by: undefined,
          created_at: now,
          updated_at: undefined,
        });
        actorProfileInserts += 1;
      }
    }

    const contributionSeeds: Array<{
      key: string;
      actor: DemoUserKey;
      actor_persona: IncentivePersona;
      stage: Doc<"deal_contributions">["stage"];
      source_entity_type: Doc<"deal_contributions">["source_entity_type"];
      source_entity_id: string;
      quality_score_snapshot?: number;
      timeliness_score_snapshot?: number;
      metadata?: Record<string, string | number>;
    }> = [
      {
        key: "c1",
        actor: "guard1",
        actor_persona: "GUARD",
        stage: "DISCOVERY",
        source_entity_type: "LEAD",
        source_entity_id: `${primaryLead._id}`,
        quality_score_snapshot: 88,
        timeliness_score_snapshot: 82,
      },
      {
        key: "c2",
        actor: "guard2",
        actor_persona: "GUARD",
        stage: "DISCOVERY",
        source_entity_type: "LEAD",
        source_entity_id: `${primaryLead._id}`,
        quality_score_snapshot: 79,
        timeliness_score_snapshot: 84,
      },
      {
        key: "c3",
        actor: "ops1",
        actor_persona: "OPS",
        stage: "VERIFICATION",
        source_entity_type: "VISIT",
        source_entity_id: `${visitA?._id ?? primaryClosure._id}`,
        quality_score_snapshot: 91,
        timeliness_score_snapshot: 89,
      },
      {
        key: "c4",
        actor: "guard2",
        actor_persona: "GUARD",
        stage: "VERIFICATION",
        source_entity_type: "VISIT",
        source_entity_id: `${visitB?._id ?? primaryClosure._id}`,
        quality_score_snapshot: 84,
        timeliness_score_snapshot: 86,
      },
      {
        key: "c5",
        actor: "guard1",
        actor_persona: "GUARD",
        stage: "CLOSURE",
        source_entity_type: "CLOSURE",
        source_entity_id: `${primaryClosure._id}`,
        metadata: { closure_score: 93 },
      },
      {
        key: "c6",
        actor: "ops2",
        actor_persona: "OPS",
        stage: "CLOSURE",
        source_entity_type: "MANUAL",
        source_entity_id: `manual-closure-${primaryClosure._id}`,
        metadata: { override: 1 },
      },
      {
        key: "c7",
        actor: "guard3",
        actor_persona: "GUARD",
        stage: "SUPPORT",
        source_entity_type: "VISIT",
        source_entity_id: `${visitA?._id ?? primaryClosure._id}`,
        quality_score_snapshot: 76,
      },
      {
        key: "c8",
        actor: "ops1",
        actor_persona: "OPS",
        stage: "SUPPORT",
        source_entity_type: "MANUAL",
        source_entity_id: `manual-support-${primaryClosure._id}`,
        timeliness_score_snapshot: 92,
      },
    ];

    let contributionInserts = 0;
    let contributionUpdates = 0;
    const contributionIds = new Map<string, Id<"deal_contributions">>();

    for (let index = 0; index < contributionSeeds.length; index += 1) {
      const seed = contributionSeeds[index]!;
      const eventKey = `tier2:contribution:${primaryClosure._id}:${seed.key}`;
      const existing = await ctx.db
        .query("deal_contributions")
        .withIndex("by_event_key", (q) => q.eq("event_key", eventKey))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          lead_id: primaryLead._id,
          actor_user_id: users[seed.actor]._id,
          actor_persona: seed.actor_persona,
          stage: seed.stage,
          source_entity_type: seed.source_entity_type,
          source_entity_id: seed.source_entity_id,
          contribution_units: 1,
          quality_score_snapshot: seed.quality_score_snapshot,
          timeliness_score_snapshot: seed.timeliness_score_snapshot,
          handoff_from_user_id: undefined,
          handoff_reason: undefined,
          occurred_at: now - (contributionSeeds.length - index) * 120_000,
          metadata: seed.metadata,
          is_voided: false,
          voided_reason: undefined,
          voided_by_admin_id: undefined,
          voided_at: undefined,
          is_deleted: false,
        });
        contributionIds.set(seed.key, existing._id);
        contributionUpdates += 1;
      } else {
        const id = await ctx.db.insert("deal_contributions", {
          closure_id: primaryClosure._id,
          lead_id: primaryLead._id,
          actor_user_id: users[seed.actor]._id,
          actor_persona: seed.actor_persona,
          stage: seed.stage,
          source_entity_type: seed.source_entity_type,
          source_entity_id: seed.source_entity_id,
          event_key: eventKey,
          contribution_units: 1,
          quality_score_snapshot: seed.quality_score_snapshot,
          timeliness_score_snapshot: seed.timeliness_score_snapshot,
          handoff_from_user_id: undefined,
          handoff_reason: undefined,
          occurred_at: now - (contributionSeeds.length - index) * 120_000,
          metadata: seed.metadata,
          is_voided: false,
          voided_reason: undefined,
          voided_by_admin_id: undefined,
          voided_at: undefined,
          is_deleted: false,
        });
        contributionIds.set(seed.key, id);
        contributionInserts += 1;
      }
    }

    const qualityTemplateId = modifierIdsByName.get("Quality Score Accelerator");
    const streakTemplateId = modifierIdsByName.get("Streak Continuity Boost");
    const visitTemplateId = modifierIdsByName.get("Visit Completion Kicker");
    const leadTemplateId = modifierIdsByName.get("Lead Pipeline Momentum");
    const closureTemplateId = modifierIdsByName.get("Closure Reliability Guardrail");

    if (
      !qualityTemplateId ||
      !streakTemplateId ||
      !visitTemplateId ||
      !leadTemplateId ||
      !closureTemplateId
    ) {
      throw new Error("seedDemoCommissions: Missing one or more modifier template IDs");
    }

    const evaluationSeeds: Array<{
      key: string;
      closure: Doc<"closures">;
      lead: Doc<"leads">;
      primary_actor: DemoUserKey;
      persona: IncentivePersona;
      base_rate_bps: number;
      effective_rate_bps: number;
      flat_bonus_paise: number;
      commission_base_profit_paise: number;
      incentive_pool_paise: number;
      modifier_breakdown: Doc<"deal_commission_evaluations">["modifier_breakdown"];
      computed_at: number;
    }> = [
      {
        key: "eval1",
        closure: primaryClosure,
        lead: primaryLead,
        primary_actor: "guard1",
        persona: "GUARD",
        base_rate_bps: 1500,
        effective_rate_bps: 1650,
        flat_bonus_paise: 0,
        commission_base_profit_paise: 2500000,
        incentive_pool_paise: 412500,
        modifier_breakdown: [
          {
            template_id: qualityTemplateId,
            template_name: "Quality Score Accelerator",
            reward_mode: "BPS",
            delta_bps: 120,
            delta_paise: undefined,
            link_mode: "INDIVIDUAL",
            link_group_id: undefined,
            passed: true,
          },
          {
            template_id: visitTemplateId,
            template_name: "Visit Completion Kicker",
            reward_mode: "FLAT_PAISE",
            delta_bps: undefined,
            delta_paise: BigInt(0),
            link_mode: "OR_GROUP",
            link_group_id: "volume_pack",
            passed: false,
          },
          {
            template_id: leadTemplateId,
            template_name: "Lead Pipeline Momentum",
            reward_mode: "BPS",
            delta_bps: 30,
            delta_paise: undefined,
            link_mode: "INDIVIDUAL",
            link_group_id: undefined,
            passed: true,
          },
        ],
        computed_at: now - 60_000,
      },
      {
        key: "eval2",
        closure: secondaryClosure,
        lead: secondaryLead,
        primary_actor: "ops1",
        persona: "OPS",
        base_rate_bps: 1500,
        effective_rate_bps: 1700,
        flat_bonus_paise: 15000,
        commission_base_profit_paise: 1850000,
        incentive_pool_paise: 329500,
        modifier_breakdown: [
          {
            template_id: streakTemplateId,
            template_name: "Streak Continuity Boost",
            reward_mode: "BPS",
            delta_bps: 80,
            delta_paise: undefined,
            link_mode: "AND_GROUP",
            link_group_id: "field_consistency",
            passed: true,
          },
          {
            template_id: closureTemplateId,
            template_name: "Closure Reliability Guardrail",
            reward_mode: "BPS",
            delta_bps: -40,
            delta_paise: undefined,
            link_mode: "INDIVIDUAL",
            link_group_id: undefined,
            passed: true,
          },
          {
            template_id: visitTemplateId,
            template_name: "Visit Completion Kicker",
            reward_mode: "FLAT_PAISE",
            delta_bps: undefined,
            delta_paise: BigInt(15000),
            link_mode: "OR_GROUP",
            link_group_id: "volume_pack",
            passed: true,
          },
        ],
        computed_at: now - 30_000,
      },
    ];

    let evaluationInserts = 0;
    let evaluationUpdates = 0;
    const evaluationIds = new Map<string, Id<"deal_commission_evaluations">>();

    for (const seed of evaluationSeeds) {
      const existing = (
        await ctx.db
          .query("deal_commission_evaluations")
          .withIndex("by_closure", (q) => q.eq("closure_id", seed.closure._id))
          .collect()
      ).find(
        (evaluation) =>
          evaluation.primary_actor_user_id === users[seed.primary_actor]._id &&
          evaluation.status === "FINAL",
      );

      if (existing) {
        await ctx.db.patch(existing._id, {
          primary_actor_user_id: users[seed.primary_actor]._id,
          persona: seed.persona,
          base_rate_bps: seed.base_rate_bps,
          effective_rate_bps: seed.effective_rate_bps,
          flat_bonus_paise: seed.flat_bonus_paise,
          commission_base_profit_paise: seed.commission_base_profit_paise,
          incentive_pool_paise: seed.incentive_pool_paise,
          modifier_breakdown: seed.modifier_breakdown,
          config_version: configVersion?.version_code ?? "v3.0.0",
          config_snapshot:
            configVersion?.config_json ??
            JSON.stringify({ source: "seedDemoTier2", version: "v3.0.0" }),
          computed_at: seed.computed_at,
          status: "FINAL",
        });
        evaluationIds.set(seed.key, existing._id);
        evaluationUpdates += 1;
      } else {
        const id = await ctx.db.insert("deal_commission_evaluations", {
          closure_id: seed.closure._id,
          primary_actor_user_id: users[seed.primary_actor]._id,
          persona: seed.persona,
          base_rate_bps: seed.base_rate_bps,
          effective_rate_bps: seed.effective_rate_bps,
          flat_bonus_paise: seed.flat_bonus_paise,
          commission_base_profit_paise: seed.commission_base_profit_paise,
          incentive_pool_paise: seed.incentive_pool_paise,
          modifier_breakdown: seed.modifier_breakdown,
          config_version: configVersion?.version_code ?? "v3.0.0",
          config_snapshot:
            configVersion?.config_json ??
            JSON.stringify({ source: "seedDemoTier2", version: "v3.0.0" }),
          computed_at: seed.computed_at,
          status: "FINAL",
        });
        evaluationIds.set(seed.key, id);
        evaluationInserts += 1;
      }
    }

    const eval1Id = evaluationIds.get("eval1");
    const eval2Id = evaluationIds.get("eval2");
    if (!eval1Id || !eval2Id) {
      throw new Error("seedDemoCommissions: Missing evaluation IDs after upsert");
    }

    const eval1Doc = await ctx.db.get(eval1Id);
    const eval2Doc = await ctx.db.get(eval2Id);
    if (!eval1Doc || !eval2Doc) {
      throw new Error("seedDemoCommissions: Failed to load commission evaluation document(s)");
    }

    const attributionSeeds: Array<{
      key: string;
      closure: Doc<"closures">;
      lead: Doc<"leads">;
      evaluation: Doc<"deal_commission_evaluations">;
      computed_at: number;
    }> = [
      {
        key: "attr1",
        closure: primaryClosure,
        lead: primaryLead,
        evaluation: eval1Doc,
        computed_at: now - 20_000,
      },
      {
        key: "attr2",
        closure: secondaryClosure,
        lead: secondaryLead,
        evaluation: eval2Doc,
        computed_at: now - 10_000,
      },
    ];

    let attributionInserts = 0;
    let attributionUpdates = 0;
    const attributionIds = new Map<string, Id<"attribution_records">>();

    for (const seed of attributionSeeds) {
      const existing = (
        await ctx.db
          .query("attribution_records")
          .withIndex("by_closure", (q) => q.eq("closure_id", seed.closure._id))
          .collect()
      ).find(
        (record) =>
          record.deal_commission_evaluation_id === seed.evaluation._id &&
          record.algorithm === "STAGE_WEIGHTED_QUALITY",
      );

      const payload: Omit<
        Doc<"attribution_records">,
        "_id" | "_creationTime" | "closure_id" | "lead_id" | "deal_commission_evaluation_id"
      > = {
        algorithm: "STAGE_WEIGHTED_QUALITY",
        algorithm_version: "STAGE_WEIGHTED_QUALITY_V1",
        pool_amount_paise: seed.evaluation.incentive_pool_paise,
        total_adj_points: seed.key === "attr1" ? 108 : 92,
        config_version: seed.evaluation.config_version,
        config_snapshot: seed.evaluation.config_snapshot,
        status: "FINAL",
        dispute_reason: undefined,
        disputed_by_admin_id: undefined,
        disputed_at: undefined,
        override_reason: undefined,
        overridden_by_admin_id: undefined,
        overridden_at: undefined,
        resolved_by_admin_id: undefined,
        resolution_notes: undefined,
        supersedes_record_id: undefined,
        computed_at: seed.computed_at,
        finalized_at: seed.computed_at + 2_000,
        resolved_at: undefined,
        is_deleted: false,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        attributionIds.set(seed.key, existing._id);
        attributionUpdates += 1;
      } else {
        const id = await ctx.db.insert("attribution_records", {
          closure_id: seed.closure._id,
          lead_id: seed.lead._id,
          deal_commission_evaluation_id: seed.evaluation._id,
          ...payload,
        });
        attributionIds.set(seed.key, id);
        attributionInserts += 1;
      }
    }

    const attr1Id = attributionIds.get("attr1");
    const attr2Id = attributionIds.get("attr2");
    if (!attr1Id || !attr2Id) {
      throw new Error("seedDemoCommissions: Missing attribution IDs after upsert");
    }

    const splitSeeds: Array<{
      key: string;
      attribution_key: "attr1" | "attr2";
      closure: Doc<"closures">;
      user: DemoUserKey;
      persona: IncentivePersona;
      primary_stage: Doc<"attribution_splits">["primary_stage"];
      contribution_count: number;
      raw_points: number;
      adj_points: number;
      share_bps: number;
      amount_paise: number;
      contribution_points: number;
      contribution_keys: string[];
    }> = [
      {
        key: "split-1",
        attribution_key: "attr1",
        closure: primaryClosure,
        user: "guard1",
        persona: "GUARD",
        primary_stage: "DISCOVERY",
        contribution_count: 2,
        raw_points: 42,
        adj_points: 40,
        share_bps: 5000,
        amount_paise: 206250,
        contribution_points: 40,
        contribution_keys: ["c1", "c5"],
      },
      {
        key: "split-2",
        attribution_key: "attr1",
        closure: primaryClosure,
        user: "ops1",
        persona: "OPS",
        primary_stage: "VERIFICATION",
        contribution_count: 2,
        raw_points: 34,
        adj_points: 33,
        share_bps: 3000,
        amount_paise: 123750,
        contribution_points: 33,
        contribution_keys: ["c3", "c8"],
      },
      {
        key: "split-3",
        attribution_key: "attr1",
        closure: primaryClosure,
        user: "guard2",
        persona: "GUARD",
        primary_stage: "CLOSURE",
        contribution_count: 3,
        raw_points: 31,
        adj_points: 35,
        share_bps: 2000,
        amount_paise: 82500,
        contribution_points: 35,
        contribution_keys: ["c2", "c4", "c6"],
      },
      {
        key: "split-4",
        attribution_key: "attr2",
        closure: secondaryClosure,
        user: "ops1",
        persona: "OPS",
        primary_stage: "SUPPORT",
        contribution_count: 2,
        raw_points: 38,
        adj_points: 36,
        share_bps: 6000,
        amount_paise: 197700,
        contribution_points: 36,
        contribution_keys: ["c8", "c7"],
      },
      {
        key: "split-5",
        attribution_key: "attr2",
        closure: secondaryClosure,
        user: "ops2",
        persona: "OPS",
        primary_stage: "CLOSURE",
        contribution_count: 1,
        raw_points: 26,
        adj_points: 24,
        share_bps: 4000,
        amount_paise: 131800,
        contribution_points: 24,
        contribution_keys: ["c6"],
      },
    ];

    let splitInserts = 0;
    let splitUpdates = 0;
    const splitIds = new Map<string, Id<"attribution_splits">>();

    for (const seed of splitSeeds) {
      const attributionId = seed.attribution_key === "attr1" ? attr1Id : attr2Id;
      const existing = (
        await ctx.db
          .query("attribution_splits")
          .withIndex("by_attribution", (q) => q.eq("attribution_record_id", attributionId))
          .collect()
      ).find((split) => split.recipient_user_id === users[seed.user]._id);

      const contributionIdList = seed.contribution_keys
        .map((key) => contributionIds.get(key))
        .filter((id): id is Id<"deal_contributions"> => id !== undefined);

      if (existing) {
        await ctx.db.patch(existing._id, {
          closure_id: seed.closure._id,
          recipient_user_id: users[seed.user]._id,
          recipient_persona: seed.persona,
          primary_stage: seed.primary_stage,
          contribution_count: seed.contribution_count,
          raw_points: seed.raw_points,
          adj_points: seed.adj_points,
          share_bps: seed.share_bps,
          share_bps_display: seed.share_bps,
          provisional_amount_paise: seed.amount_paise,
          residue_numerator: 0,
          remainder_rank: 1,
          amount_paise: seed.amount_paise,
          contribution_points: seed.contribution_points,
          contribution_ids: contributionIdList,
          is_manual_override: false,
          notes: undefined,
          created_at: existing.created_at,
          is_deleted: false,
        });
        splitIds.set(seed.key, existing._id);
        splitUpdates += 1;
      } else {
        const id = await ctx.db.insert("attribution_splits", {
          attribution_record_id: attributionId,
          closure_id: seed.closure._id,
          recipient_user_id: users[seed.user]._id,
          recipient_persona: seed.persona,
          primary_stage: seed.primary_stage,
          contribution_count: seed.contribution_count,
          raw_points: seed.raw_points,
          adj_points: seed.adj_points,
          share_bps: seed.share_bps,
          share_bps_display: seed.share_bps,
          provisional_amount_paise: seed.amount_paise,
          residue_numerator: 0,
          remainder_rank: 1,
          amount_paise: seed.amount_paise,
          contribution_points: seed.contribution_points,
          contribution_ids: contributionIdList,
          is_manual_override: false,
          notes: undefined,
          created_at: now,
          is_deleted: false,
        });
        splitIds.set(seed.key, id);
        splitInserts += 1;
      }
    }

    const disbursementSeeds: Array<{
      split_key: string;
      user: DemoUserKey;
      persona: IncentivePersona;
      amount_paise: number;
      closure_id: Id<"closures">;
      status: Doc<"incentive_disbursements">["status"];
    }> = [
      {
        split_key: "split-1",
        user: "guard1",
        persona: "GUARD",
        amount_paise: 206250,
        closure_id: primaryClosure._id,
        status: "PENDING",
      },
      {
        split_key: "split-2",
        user: "ops1",
        persona: "OPS",
        amount_paise: 123750,
        closure_id: primaryClosure._id,
        status: "APPROVED",
      },
      {
        split_key: "split-3",
        user: "guard2",
        persona: "GUARD",
        amount_paise: 82500,
        closure_id: primaryClosure._id,
        status: "DISBURSED",
      },
      {
        split_key: "split-4",
        user: "ops1",
        persona: "OPS",
        amount_paise: 197700,
        closure_id: secondaryClosure._id,
        status: "PENDING",
      },
    ];

    let disbursementInserts = 0;
    let disbursementUpdates = 0;

    for (const seed of disbursementSeeds) {
      const splitId = splitIds.get(seed.split_key);
      if (!splitId) {
        continue;
      }

      const sourceKey = `tier2:disbursement:${splitId}`;
      const existing = await ctx.db
        .query("incentive_disbursements")
        .withIndex("by_source_key", (q) => q.eq("source_key", sourceKey))
        .first();

      const approvedAt =
        seed.status === "APPROVED" || seed.status === "DISBURSED" ? now - 8 * 60 * 1000 : undefined;
      const disbursedAt = seed.status === "DISBURSED" ? now - 4 * 60 * 1000 : undefined;

      if (existing) {
        await ctx.db.patch(existing._id, {
          recipient_user_id: users[seed.user]._id,
          recipient_persona: seed.persona,
          source_type: "ATTRIBUTION_SPLIT",
          source_record_id: `${splitId}`,
          source_key: sourceKey,
          closure_id: seed.closure_id,
          amount_paise: seed.amount_paise,
          status: seed.status,
          approved_by_admin_id:
            seed.status === "APPROVED" || seed.status === "DISBURSED"
              ? users.founder_one._id
              : undefined,
          approved_at: approvedAt,
          disbursed_at: disbursedAt,
        });
        disbursementUpdates += 1;
      } else {
        await ctx.db.insert("incentive_disbursements", {
          recipient_user_id: users[seed.user]._id,
          recipient_persona: seed.persona,
          source_type: "ATTRIBUTION_SPLIT",
          source_record_id: `${splitId}`,
          source_key: sourceKey,
          closure_id: seed.closure_id,
          amount_paise: seed.amount_paise,
          status: seed.status,
          approved_by_admin_id:
            seed.status === "APPROVED" || seed.status === "DISBURSED"
              ? users.founder_one._id
              : undefined,
          approved_at: approvedAt,
          disbursed_at: disbursedAt,
          created_at: now,
        });
        disbursementInserts += 1;
      }
    }

    const shadowSeeds: Array<{
      deal: Doc<"closures">;
      entity_type: Doc<"shadow_mode_deltas">["entity_type"];
      persona?: IncentivePersona;
      absolute_delta_paise: number;
      percentage_delta: number;
      v2_value: number;
      v3_value: number;
    }> = [
      {
        deal: primaryClosure,
        entity_type: "commission",
        persona: "GUARD",
        absolute_delta_paise: 57500,
        percentage_delta: 16.2,
        v2_value: 355000,
        v3_value: 412500,
      },
      {
        deal: secondaryClosure,
        entity_type: "attribution",
        absolute_delta_paise: 29500,
        percentage_delta: 9.8,
        v2_value: 300000,
        v3_value: 329500,
      },
    ];

    let shadowInserts = 0;
    let shadowUpdates = 0;

    for (const seed of shadowSeeds) {
      const existing = (
        await ctx.db
          .query("shadow_mode_deltas")
          .withIndex("by_deal", (q) => q.eq("deal_id", seed.deal._id))
          .collect()
      ).find((delta) => delta.entity_type === seed.entity_type && delta.persona === seed.persona);

      const payload: Omit<Doc<"shadow_mode_deltas">, "_id" | "_creationTime" | "deal_id"> = {
        entity_type: seed.entity_type,
        persona: seed.persona,
        config_version_id: configVersion?._id,
        v2_result_json: JSON.stringify({ value_paise: seed.v2_value }),
        v3_result_json: JSON.stringify({ value_paise: seed.v3_value }),
        delta_summary: JSON.stringify({
          absolute_delta_paise: seed.absolute_delta_paise,
          percentage_delta: seed.percentage_delta,
        }),
        created_at: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        shadowUpdates += 1;
      } else {
        await ctx.db.insert("shadow_mode_deltas", {
          deal_id: seed.deal._id,
          ...payload,
        });
        shadowInserts += 1;
      }
    }

    return {
      commission_modifier_templates: { inserted: modifierInserts, updated: modifierUpdates },
      incentive_actor_profiles: { inserted: actorProfileInserts, updated: actorProfileUpdates },
      deal_contributions: { inserted: contributionInserts, updated: contributionUpdates },
      deal_commission_evaluations: { inserted: evaluationInserts, updated: evaluationUpdates },
      attribution_records: { inserted: attributionInserts, updated: attributionUpdates },
      attribution_splits: { inserted: splitInserts, updated: splitUpdates },
      incentive_disbursements: { inserted: disbursementInserts, updated: disbursementUpdates },
      shadow_mode_deltas: { inserted: shadowInserts, updated: shadowUpdates },
    };
  },
});

export const seedDemoGamification = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await resolveUsers(ctx);
    const todayIsoDate = new Date(now).toISOString().slice(0, 10);
    const currentWeekKey = isoWeekKey(now);

    const profileSeeds: Array<{
      user: DemoUserKey;
      persona: IncentivePersona;
      xp_total: number;
      level: number;
      weekly_tier: string;
      weekly_xp: number;
      streak_days: number;
      longest_streak: number;
      badges: string[];
    }> = [
      {
        user: "guard1",
        persona: "GUARD",
        xp_total: 2500,
        level: 12,
        weekly_tier: "GOLD",
        weekly_xp: 950,
        streak_days: 15,
        longest_streak: 19,
        badges: ["EXPERIENCED", "WEEK_WARRIOR"],
      },
      {
        user: "guard2",
        persona: "GUARD",
        xp_total: 800,
        level: 5,
        weekly_tier: "SILVER",
        weekly_xp: 420,
        streak_days: 3,
        longest_streak: 6,
        badges: [],
      },
      {
        user: "guard3",
        persona: "GUARD",
        xp_total: 200,
        level: 2,
        weekly_tier: "BRONZE",
        weekly_xp: 120,
        streak_days: 0,
        longest_streak: 2,
        badges: [],
      },
      {
        user: "ops1",
        persona: "OPS",
        xp_total: 1500,
        level: 8,
        weekly_tier: "PLATINUM",
        weekly_xp: 1400,
        streak_days: 22,
        longest_streak: 24,
        badges: ["WEEK_WARRIOR"],
      },
      {
        user: "ops2",
        persona: "OPS",
        xp_total: 400,
        level: 3,
        weekly_tier: "SILVER",
        weekly_xp: 520,
        streak_days: 5,
        longest_streak: 7,
        badges: [],
      },
    ];

    let profileInserts = 0;
    let profileUpdates = 0;

    for (const seed of profileSeeds) {
      const user = users[seed.user];
      const existing = await ctx.db
        .query("gamification_profiles")
        .withIndex("by_user_persona", (q) => q.eq("user_id", user._id).eq("persona", seed.persona))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          xp_total: seed.xp_total,
          level: seed.level,
          weekly_tier: seed.weekly_tier,
          weekly_xp: seed.weekly_xp,
          last_weekly_reset_week: currentWeekKey,
          streak_days: seed.streak_days,
          last_streak_date: seed.streak_days > 0 ? todayIsoDate : undefined,
          longest_streak: seed.longest_streak,
          streak_freezes_remaining: 1,
          streak_freezes_used_this_month: 0,
          badges: seed.badges,
          is_active: true,
          updated_at: now,
        });
        profileUpdates += 1;
      } else {
        await ctx.db.insert("gamification_profiles", {
          user_id: user._id,
          persona: seed.persona,
          xp_total: seed.xp_total,
          level: seed.level,
          weekly_tier: seed.weekly_tier,
          weekly_xp: seed.weekly_xp,
          last_weekly_reset_week: currentWeekKey,
          streak_days: seed.streak_days,
          last_streak_date: seed.streak_days > 0 ? todayIsoDate : undefined,
          longest_streak: seed.longest_streak,
          streak_freezes_remaining: 1,
          streak_freezes_used_this_month: 0,
          badges: seed.badges,
          is_active: true,
          updated_at: now,
        });
        profileInserts += 1;
      }
    }

    const startToday = dayStartMs(now);
    const oneDay = 24 * 60 * 60 * 1000;

    const questSeeds: Array<Omit<Doc<"gamification_quests">, "_id" | "_creationTime">> = [
      {
        quest_code: "daily_3_leads",
        applicable_personas: ["GUARD"],
        scope: "INDIVIDUAL",
        target_metric_key: "leads_submitted_today",
        target_value: 3,
        reward_type: "XP",
        reward_value: 50,
        start_at: startToday,
        end_at: startToday + oneDay,
        status: "ACTIVE",
      },
      {
        quest_code: "weekly_5_visits",
        applicable_personas: ["GUARD", "OPS"],
        scope: "INDIVIDUAL",
        target_metric_key: "visits_completed_weekly",
        target_value: 5,
        reward_type: "XP",
        reward_value: 200,
        start_at: startToday - 2 * oneDay,
        end_at: startToday + 5 * oneDay,
        status: "ACTIVE",
      },
      {
        quest_code: "quality_champion",
        applicable_personas: ["ALL"],
        scope: "INDIVIDUAL",
        target_metric_key: "quality_score_days_above_80",
        target_value: 7,
        reward_type: "PAISE",
        reward_value: 50000,
        start_at: startToday - oneDay,
        end_at: startToday + 8 * oneDay,
        status: "ACTIVE",
      },
      {
        quest_code: "first_closure",
        applicable_personas: ["GUARD", "OPS"],
        scope: "INDIVIDUAL",
        target_metric_key: "first_closure_count",
        target_value: 1,
        reward_type: "XP",
        reward_value: 500,
        start_at: startToday - 14 * oneDay,
        end_at: startToday + 30 * oneDay,
        status: "ACTIVE",
      },
      {
        quest_code: "team_10_closures",
        applicable_personas: ["ALL"],
        scope: "TEAM",
        target_metric_key: "team_closures_monthly",
        target_value: 10,
        reward_type: "PAISE",
        reward_value: 200000,
        start_at: startToday - 10 * oneDay,
        end_at: startToday + 20 * oneDay,
        status: "ACTIVE",
      },
    ];

    const [activeQuests, endedQuests] = await Promise.all([
      ctx.db
        .query("gamification_quests")
        .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
        .collect(),
      ctx.db
        .query("gamification_quests")
        .withIndex("by_status", (q) => q.eq("status", "ENDED"))
        .collect(),
    ]);
    const allQuests = [...activeQuests, ...endedQuests];

    const questIdByCode = new Map<string, Id<"gamification_quests">>();
    let questInserts = 0;
    let questUpdates = 0;

    for (const seed of questSeeds) {
      const existing = allQuests.find((quest) => quest.quest_code === seed.quest_code);

      if (existing) {
        await ctx.db.patch(existing._id, {
          applicable_personas: seed.applicable_personas,
          scope: seed.scope,
          target_metric_key: seed.target_metric_key,
          target_value: seed.target_value,
          reward_type: seed.reward_type,
          reward_value: seed.reward_value,
          start_at: seed.start_at,
          end_at: seed.end_at,
          status: seed.status,
        });
        questIdByCode.set(seed.quest_code, existing._id);
        questUpdates += 1;
      } else {
        const id = await ctx.db.insert("gamification_quests", seed);
        questIdByCode.set(seed.quest_code, id);
        questInserts += 1;
      }
    }

    const progressSeeds: Array<{
      user: DemoUserKey;
      quest_code: string;
      progress: number;
      target: number;
      completed: boolean;
      claimed: boolean;
    }> = [
      {
        user: "guard1",
        quest_code: "daily_3_leads",
        progress: 3,
        target: 3,
        completed: true,
        claimed: false,
      },
      {
        user: "guard2",
        quest_code: "daily_3_leads",
        progress: 1,
        target: 3,
        completed: false,
        claimed: false,
      },
      {
        user: "guard1",
        quest_code: "weekly_5_visits",
        progress: 4,
        target: 5,
        completed: false,
        claimed: false,
      },
      {
        user: "ops1",
        quest_code: "weekly_5_visits",
        progress: 5,
        target: 5,
        completed: true,
        claimed: true,
      },
      {
        user: "guard3",
        quest_code: "first_closure",
        progress: 0,
        target: 1,
        completed: false,
        claimed: false,
      },
      {
        user: "ops2",
        quest_code: "first_closure",
        progress: 1,
        target: 1,
        completed: true,
        claimed: false,
      },
      {
        user: "guard1",
        quest_code: "team_10_closures",
        progress: 6,
        target: 10,
        completed: false,
        claimed: false,
      },
      {
        user: "ops1",
        quest_code: "quality_champion",
        progress: 7,
        target: 7,
        completed: true,
        claimed: false,
      },
    ];

    let progressInserts = 0;
    let progressUpdates = 0;

    for (let index = 0; index < progressSeeds.length; index += 1) {
      const seed = progressSeeds[index]!;
      const user = users[seed.user];
      const questId = questIdByCode.get(seed.quest_code);

      if (!questId) {
        continue;
      }

      const existing = await ctx.db
        .query("user_quest_progress")
        .withIndex("by_user", (q) => q.eq("user_id", user._id))
        .filter((q) => q.eq(q.field("quest_id"), questId))
        .first();

      const completedAt = seed.completed
        ? now - (progressSeeds.length - index) * 15_000
        : undefined;

      if (existing) {
        await ctx.db.patch(existing._id, {
          progress: seed.progress,
          target: seed.target,
          completed: seed.completed,
          claimed: seed.claimed,
          completed_at: completedAt,
          created_at: existing.created_at,
        });
        progressUpdates += 1;
      } else {
        await ctx.db.insert("user_quest_progress", {
          user_id: user._id,
          quest_id: questId,
          progress: seed.progress,
          target: seed.target,
          completed: seed.completed,
          claimed: seed.claimed,
          completed_at: completedAt,
          created_at: now - (progressSeeds.length - index) * 20_000,
        });
        progressInserts += 1;
      }
    }

    return {
      gamification_profiles: { inserted: profileInserts, updated: profileUpdates },
      gamification_quests: { inserted: questInserts, updated: questUpdates },
      user_quest_progress: { inserted: progressInserts, updated: progressUpdates },
    };
  },
});

export const seedNotificationTemplates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const channels: Array<Doc<"notification_templates">["channel"]> = [
      "IN_APP",
      "PUSH",
      "WHATSAPP",
      "SMS",
      "EMAIL",
    ];

    const templateSeeds: Array<{
      event_type: string;
      category: Doc<"notification_templates">["category"];
      locale: string;
      subject: string;
      body: string;
      variables: string[];
    }> = [
      {
        event_type: "lead_submitted",
        category: "LEAD_UPDATE",
        locale: "en",
        subject: "Lead submitted for {{flat_number}}",
        body: "{{guard_name}} submitted a lead for {{flat_number}} in {{building_name}}.",
        variables: ["guard_name", "flat_number", "building_name"],
      },
      {
        event_type: "visit_scheduled",
        category: "VISIT_UPDATE",
        locale: "en",
        subject: "Visit scheduled: {{flat_number}}",
        body: "Visit is scheduled on {{visit_date}} at {{visit_time}} for {{flat_number}}.",
        variables: ["visit_date", "visit_time", "flat_number"],
      },
      {
        event_type: "payout_approved",
        category: "PAYOUT_UPDATE",
        locale: "en",
        subject: "Payout approved - {{amount_inr}}",
        body: "Your payout of {{amount_inr}} was approved. Ref: {{payment_ref}}.",
        variables: ["amount_inr", "payment_ref"],
      },
      {
        event_type: "inquiry_received",
        category: "INQUIRY_UPDATE",
        locale: "en",
        subject: "New tenant inquiry for {{flat_number}}",
        body: "{{tenant_name}} submitted an inquiry for {{flat_number}}.",
        variables: ["tenant_name", "flat_number"],
      },
      {
        event_type: "agreement_signed",
        category: "AGREEMENT_STATUS",
        locale: "en",
        subject: "Agreement signed for {{flat_number}}",
        body: "Agreement is signed by {{party_name}} for {{flat_number}}.",
        variables: ["party_name", "flat_number"],
      },
      {
        event_type: "move_in_reminder",
        category: "MOVE_IN_REMINDER",
        locale: "en",
        subject: "Move-in reminder: {{move_in_date}}",
        body: "Reminder: move-in for {{flat_number}} is on {{move_in_date}}.",
        variables: ["flat_number", "move_in_date"],
      },
    ];

    let inserted = 0;
    let updated = 0;

    for (const seed of templateSeeds) {
      for (const channel of channels) {
        const bodyByChannel =
          channel === "WHATSAPP"
            ? `*${seed.subject}*\n${seed.body}`
            : channel === "PUSH"
              ? `${seed.body} Tap to open.`
              : channel === "SMS"
                ? `${seed.subject}: ${seed.body}`
                : seed.body;

        const result = await ensureSeedRecord(ctx, {
          lookup: async () =>
            await ctx.db
              .query("notification_templates")
              .withIndex("by_event_channel_locale", (q) =>
                q
                  .eq("event_type", seed.event_type)
                  .eq("channel", channel)
                  .eq("locale", seed.locale),
              )
              .first(),
          create: async () =>
            await ctx.db.insert("notification_templates", {
              event_type: seed.event_type,
              category: seed.category,
              channel,
              locale: seed.locale,
              subject: seed.subject,
              body: bodyByChannel,
              variables: seed.variables,
              version: 1,
              is_active: true,
              is_deleted: false,
              created_at: now,
              updated_at: now,
            }),
          patchIfExists: async (existing) => {
            await ctx.db.patch(existing._id, {
              category: seed.category,
              subject: seed.subject,
              body: bodyByChannel,
              variables: seed.variables,
              version: existing.version ?? 1,
              is_active: true,
              is_deleted: false,
              updated_at: now,
            });
          },
          label: `notification_template:${seed.event_type}:${channel}:${seed.locale}`,
        });

        if (result.created) {
          inserted += 1;
        } else {
          updated += 1;
        }
      }
    }

    return {
      notification_templates: {
        inserted,
        updated,
      },
      event_types_seeded: templateSeeds.length,
      channels_seeded: channels.length,
    };
  },
});

export const seedNotificationLifecycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await resolveUsers(ctx);
    const founder_one = await lookupUserDoc(ctx, DEMO_EMAILS.founder_one);

    const lifecycleSeeds: Array<{
      key: string;
      user: DemoUserKey;
      status: Doc<"notification_events">["status"];
      retry_count: number;
      next_attempt_at?: number;
      last_error?: string;
      final_error?: string;
      attempted_at?: number;
      delivered_at?: number;
      failed_at?: number;
      in_app_read: boolean;
      category: Doc<"notification_events">["category"];
      severity: Doc<"notification_events">["severity"];
      event_type: string;
      action_url: string;
      channel_status: NonNullable<Doc<"notification_events">["channel_status"]>;
      payload: Record<string, string | number | boolean>;
      created_at: number;
    }> = [
      {
        key: "happy-pending",
        user: "guard1",
        status: "PENDING",
        retry_count: 0,
        attempted_at: undefined,
        delivered_at: undefined,
        failed_at: undefined,
        in_app_read: false,
        category: "LEAD_UPDATE",
        severity: "NORMAL",
        event_type: "lifecycle_happy_pending",
        action_url: "/guard/leads",
        channel_status: {
          IN_APP: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(16),
            provider_message_id: "tier2-in-app-happy-pending",
          },
          PUSH: {
            status: "PENDING",
            attempt_count: 0,
          },
        },
        payload: {
          lifecycle: "PENDING_TO_SENT_TO_DELIVERED_TO_READ",
          stage: "PENDING",
          seeded_by_admin_id: `${founder_one._id}`,
        },
        created_at: minutesAgo(16),
      },
      {
        key: "happy-sent",
        user: "guard1",
        status: "PROCESSING",
        retry_count: 0,
        attempted_at: minutesAgo(15),
        in_app_read: false,
        category: "LEAD_UPDATE",
        severity: "NORMAL",
        event_type: "lifecycle_happy_sent",
        action_url: "/guard/leads",
        channel_status: {
          IN_APP: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(15),
            provider_message_id: "tier2-in-app-happy-sent",
          },
          PUSH: {
            status: "SCHEDULED",
            attempt_count: 1,
            scheduled_at: minutesAgo(15),
            provider_message_id: "tier2-push-happy-sent",
          },
        },
        payload: {
          lifecycle: "PENDING_TO_SENT_TO_DELIVERED_TO_READ",
          stage: "SENT",
          seeded_by_admin_id: `${founder_one._id}`,
        },
        created_at: minutesAgo(15),
      },
      {
        key: "happy-delivered-read",
        user: "guard1",
        status: "DELIVERED",
        retry_count: 0,
        attempted_at: minutesAgo(14),
        delivered_at: minutesAgo(14),
        in_app_read: true,
        category: "LEAD_UPDATE",
        severity: "NORMAL",
        event_type: "lifecycle_happy_delivered",
        action_url: "/guard/leads",
        channel_status: {
          IN_APP: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(14),
            provider_message_id: "tier2-in-app-happy-delivered",
          },
          PUSH: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(14),
            provider_message_id: "tier2-push-happy-delivered",
          },
        },
        payload: {
          lifecycle: "PENDING_TO_SENT_TO_DELIVERED_TO_READ",
          stage: "READ",
          seeded_by_admin_id: `${founder_one._id}`,
        },
        created_at: minutesAgo(14),
      },
      {
        key: "retry-failed",
        user: "ops1",
        status: "FAILED",
        retry_count: 1,
        next_attempt_at: minutesAgo(9),
        last_error: "push_provider_timeout",
        failed_at: minutesAgo(10),
        attempted_at: minutesAgo(10),
        in_app_read: false,
        category: "VISIT_UPDATE",
        severity: "IMPORTANT",
        event_type: "lifecycle_retry_failed",
        action_url: "/ops/visits",
        channel_status: {
          IN_APP: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(10),
            provider_message_id: "tier2-in-app-retry-failed",
          },
          PUSH: {
            status: "FAILED",
            attempt_count: 1,
            failed_at: minutesAgo(10),
            last_error: "push_provider_timeout",
          },
        },
        payload: {
          lifecycle: "PENDING_TO_SENT_TO_FAILED_TO_RETRIED_TO_DELIVERED",
          stage: "FAILED",
          seeded_by_admin_id: `${founder_one._id}`,
        },
        created_at: minutesAgo(10),
      },
      {
        key: "retry-retried",
        user: "ops1",
        status: "PROCESSING",
        retry_count: 1,
        attempted_at: minutesAgo(8),
        in_app_read: false,
        category: "VISIT_UPDATE",
        severity: "IMPORTANT",
        event_type: "lifecycle_retry_retried",
        action_url: "/ops/visits",
        channel_status: {
          IN_APP: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(8),
            provider_message_id: "tier2-in-app-retry-retried",
          },
          PUSH: {
            status: "SCHEDULED",
            attempt_count: 2,
            scheduled_at: minutesAgo(8),
            provider_message_id: "tier2-push-retry-retried",
          },
        },
        payload: {
          lifecycle: "PENDING_TO_SENT_TO_FAILED_TO_RETRIED_TO_DELIVERED",
          stage: "RETRIED",
          seeded_by_admin_id: `${founder_one._id}`,
        },
        created_at: minutesAgo(8),
      },
      {
        key: "retry-delivered",
        user: "ops1",
        status: "DELIVERED",
        retry_count: 1,
        attempted_at: minutesAgo(7),
        delivered_at: minutesAgo(7),
        in_app_read: true,
        category: "VISIT_UPDATE",
        severity: "IMPORTANT",
        event_type: "lifecycle_retry_delivered",
        action_url: "/ops/visits",
        channel_status: {
          IN_APP: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(7),
            provider_message_id: "tier2-in-app-retry-delivered",
          },
          PUSH: {
            status: "DELIVERED",
            attempt_count: 2,
            delivered_at: minutesAgo(7),
            provider_message_id: "tier2-push-retry-delivered",
          },
        },
        payload: {
          lifecycle: "PENDING_TO_SENT_TO_FAILED_TO_RETRIED_TO_DELIVERED",
          stage: "DELIVERED",
          seeded_by_admin_id: `${founder_one._id}`,
        },
        created_at: minutesAgo(7),
      },
      {
        key: "throttled",
        user: "tenant1",
        status: "SUPPRESSED",
        retry_count: 0,
        last_error: "throttled_all_channels",
        attempted_at: minutesAgo(4),
        in_app_read: false,
        category: "INQUIRY_UPDATE",
        severity: "NORMAL",
        event_type: "lifecycle_throttled",
        action_url: "/tenant/inquiries",
        channel_status: {
          IN_APP: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(4),
            provider_message_id: "tier2-in-app-throttled",
          },
          PUSH: {
            status: "SUPPRESSED",
            attempt_count: 1,
            last_error: "throttled:PUSH",
          },
        },
        payload: {
          lifecycle: "PENDING_TO_THROTTLED",
          stage: "THROTTLED",
          seeded_by_admin_id: `${founder_one._id}`,
        },
        created_at: minutesAgo(4),
      },
      {
        key: "dead-letter",
        user: "owner1",
        status: "DEAD_LETTER",
        retry_count: 3,
        last_error: "delivery_failed_after_retries",
        final_error: "max_retries_exhausted",
        attempted_at: minutesAgo(2),
        failed_at: minutesAgo(2),
        in_app_read: false,
        category: "SYSTEM_ALERT",
        severity: "URGENT",
        event_type: "lifecycle_dead_letter",
        action_url: "/owner/messages",
        channel_status: {
          IN_APP: {
            status: "DELIVERED",
            attempt_count: 1,
            delivered_at: minutesAgo(2),
            provider_message_id: "tier2-in-app-dead-letter",
          },
          PUSH: {
            status: "FAILED",
            attempt_count: 3,
            failed_at: minutesAgo(2),
            last_error: "provider_unreachable",
          },
        },
        payload: {
          lifecycle: "PENDING_TO_DEAD_LETTER",
          stage: "DEAD_LETTER",
          seeded_by_admin_id: `${founder_one._id}`,
        },
        created_at: minutesAgo(2),
      },
    ];

    let eventInserted = 0;
    let eventUpdated = 0;
    let notificationInserted = 0;
    let notificationUpdated = 0;

    for (const seed of lifecycleSeeds) {
      const user = users[seed.user];
      const dedupKey = `tier2:lifecycle:${seed.key}`;

      const eventResult = await ensureSeedRecord(ctx, {
        lookup: async () =>
          await ctx.db
            .query("notification_events")
            .withIndex("by_dedup_key", (q) => q.eq("dedup_key", dedupKey))
            .filter((q) => q.eq(q.field("user_id"), user._id))
            .first(),
        create: async () =>
          await ctx.db.insert("notification_events", {
            user_id: user._id,
            event_type: seed.event_type,
            category: seed.category,
            severity: seed.severity,
            status: seed.status,
            channels: ["IN_APP", "PUSH"],
            payload: seed.payload,
            dedup_key: dedupKey,
            channel_status: seed.channel_status,
            retry_count: seed.retry_count,
            next_attempt_at: seed.next_attempt_at,
            last_error: seed.last_error,
            final_error: seed.final_error,
            provider_message_id:
              seed.status === "DELIVERED" ? `tier2-provider-${seed.key}` : undefined,
            attempted_at: seed.attempted_at,
            delivered_at: seed.delivered_at,
            failed_at: seed.failed_at,
            is_deleted: false,
            created_at: seed.created_at,
            updated_at: now,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            event_type: seed.event_type,
            category: seed.category,
            severity: seed.severity,
            status: seed.status,
            channels: ["IN_APP", "PUSH"],
            payload: seed.payload,
            channel_status: seed.channel_status,
            retry_count: seed.retry_count,
            next_attempt_at: seed.next_attempt_at,
            last_error: seed.last_error,
            final_error: seed.final_error,
            provider_message_id:
              seed.status === "DELIVERED" ? `tier2-provider-${seed.key}` : undefined,
            attempted_at: seed.attempted_at,
            delivered_at: seed.delivered_at,
            failed_at: seed.failed_at,
            is_deleted: false,
            updated_at: now,
          });
        },
        label: `notification_event:${dedupKey}`,
      });

      if (eventResult.created) {
        eventInserted += 1;
      } else {
        eventUpdated += 1;
      }

      const title = seed.event_type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (part) => part.toUpperCase());

      const notificationResult = await ensureSeedRecord(ctx, {
        lookup: async () =>
          await ctx.db
            .query("notifications")
            .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
            .filter((q) => q.eq(q.field("event_id"), eventResult.doc._id))
            .filter((q) => q.eq(q.field("channel"), "IN_APP"))
            .first(),
        create: async () =>
          await ctx.db.insert("notifications", {
            user_id: user._id,
            event_id: eventResult.doc._id,
            category: seed.category,
            severity: seed.severity,
            channel: "IN_APP",
            title,
            body: `Lifecycle stage: ${(seed.payload.stage as string) ?? "UNKNOWN"}`,
            action_url: seed.action_url,
            metadata: {
              ...seed.payload,
              dedup_key: dedupKey,
            },
            is_read: seed.in_app_read,
            read_at: seed.in_app_read ? seed.created_at + 30_000 : undefined,
            is_deleted: false,
            created_at: seed.created_at,
            updated_at: now,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            category: seed.category,
            severity: seed.severity,
            title,
            body: `Lifecycle stage: ${(seed.payload.stage as string) ?? "UNKNOWN"}`,
            action_url: seed.action_url,
            metadata: {
              ...seed.payload,
              dedup_key: dedupKey,
            },
            is_read: seed.in_app_read,
            read_at: seed.in_app_read ? seed.created_at + 30_000 : undefined,
            is_deleted: false,
            updated_at: now,
          });
        },
        label: `notification:${dedupKey}`,
      });

      if (notificationResult.created) {
        notificationInserted += 1;
      } else {
        notificationUpdated += 1;
      }
    }

    return {
      notification_events: {
        inserted: eventInserted,
        updated: eventUpdated,
      },
      notifications: {
        inserted: notificationInserted,
        updated: notificationUpdated,
      },
      scenarios_seeded: lifecycleSeeds.length,
    };
  },
});

export const seedGamificationProfiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await resolveUsers(ctx);
    const currentWeek = isoWeekKey(now);
    const todayStart = dayStartMs(now);
    const dayMs = 24 * 60 * 60 * 1000;
    const todayDateKey = new Date(now).toISOString().slice(0, 10);

    const profileSeeds: Array<{
      user: DemoUserKey;
      persona: IncentivePersona;
      xp_total: number;
      level: number;
      weekly_tier: string;
      weekly_xp: number;
      streak_days: number;
      longest_streak: number;
      badges: string[];
    }> = [
      {
        user: "guard1",
        persona: "GUARD",
        xp_total: 2500,
        level: 5,
        weekly_tier: "GOLD",
        weekly_xp: 780,
        streak_days: 9,
        longest_streak: 15,
        badges: ["EXPERIENCED", "WEEK_WARRIOR"],
      },
      {
        user: "guard2",
        persona: "GUARD",
        xp_total: 800,
        level: 2,
        weekly_tier: "SILVER",
        weekly_xp: 260,
        streak_days: 2,
        longest_streak: 5,
        badges: [],
      },
    ];

    let profileInserted = 0;
    let profileUpdated = 0;

    for (const seed of profileSeeds) {
      const user = users[seed.user];
      const profileResult = await ensureSeedRecord(ctx, {
        lookup: async () =>
          await ctx.db
            .query("gamification_profiles")
            .withIndex("by_user_persona", (q) =>
              q.eq("user_id", user._id).eq("persona", seed.persona),
            )
            .first(),
        create: async () =>
          await ctx.db.insert("gamification_profiles", {
            user_id: user._id,
            persona: seed.persona,
            xp_total: seed.xp_total,
            level: seed.level,
            weekly_tier: seed.weekly_tier,
            weekly_xp: seed.weekly_xp,
            last_weekly_reset_week: currentWeek,
            streak_days: seed.streak_days,
            last_streak_date: todayDateKey,
            longest_streak: seed.longest_streak,
            streak_freezes_remaining: 1,
            streak_freezes_used_this_month: 0,
            badges: seed.badges,
            is_active: true,
            updated_at: now,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            xp_total: seed.xp_total,
            level: seed.level,
            weekly_tier: seed.weekly_tier,
            weekly_xp: seed.weekly_xp,
            last_weekly_reset_week: currentWeek,
            streak_days: seed.streak_days,
            last_streak_date: todayDateKey,
            longest_streak: seed.longest_streak,
            streak_freezes_remaining: 1,
            streak_freezes_used_this_month: 0,
            badges: seed.badges,
            is_active: true,
            updated_at: now,
          });
        },
        label: `gamification_profile:${seed.user}`,
      });

      if (profileResult.created) {
        profileInserted += 1;
      } else {
        profileUpdated += 1;
      }
    }

    const questSeeds: Array<Omit<Doc<"gamification_quests">, "_id" | "_creationTime">> = [
      {
        quest_code: "tier2_submit_3_leads_today",
        applicable_personas: ["GUARD"],
        scope: "INDIVIDUAL",
        target_metric_key: "leads_submitted_today",
        target_value: 3,
        reward_type: "XP",
        reward_value: 60,
        start_at: todayStart,
        end_at: todayStart + dayMs,
        status: "ACTIVE",
      },
      {
        quest_code: "tier2_complete_2_visits_today",
        applicable_personas: ["GUARD"],
        scope: "INDIVIDUAL",
        target_metric_key: "visits_completed_today",
        target_value: 2,
        reward_type: "XP",
        reward_value: 75,
        start_at: todayStart,
        end_at: todayStart + dayMs,
        status: "ACTIVE",
      },
      {
        quest_code: "tier2_quality_streak_week",
        applicable_personas: ["GUARD"],
        scope: "INDIVIDUAL",
        target_metric_key: "quality_score_days_above_80",
        target_value: 7,
        reward_type: "XP",
        reward_value: 220,
        start_at: todayStart - 8 * dayMs,
        end_at: todayStart - dayMs,
        status: "ENDED",
      },
      {
        quest_code: "tier2_first_closure_bonus",
        applicable_personas: ["GUARD"],
        scope: "INDIVIDUAL",
        target_metric_key: "first_closure_count",
        target_value: 1,
        reward_type: "PAISE",
        reward_value: 15000,
        start_at: todayStart - 14 * dayMs,
        end_at: todayStart + 14 * dayMs,
        status: "ACTIVE",
      },
    ];

    let questInserted = 0;
    let questUpdated = 0;
    const questIdByCode = new Map<string, Id<"gamification_quests">>();

    for (const seed of questSeeds) {
      const questResult = await ensureSeedRecord(ctx, {
        lookup: async () => {
          const [active, ended] = await Promise.all([
            ctx.db
              .query("gamification_quests")
              .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
              .collect(),
            ctx.db
              .query("gamification_quests")
              .withIndex("by_status", (q) => q.eq("status", "ENDED"))
              .collect(),
          ]);
          return (
            [...active, ...ended].find((quest) => quest.quest_code === seed.quest_code) ?? null
          );
        },
        create: async () => await ctx.db.insert("gamification_quests", seed),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            applicable_personas: seed.applicable_personas,
            scope: seed.scope,
            target_metric_key: seed.target_metric_key,
            target_value: seed.target_value,
            reward_type: seed.reward_type,
            reward_value: seed.reward_value,
            start_at: seed.start_at,
            end_at: seed.end_at,
            status: seed.status,
          });
        },
        label: `gamification_quest:${seed.quest_code}`,
      });

      questIdByCode.set(seed.quest_code, questResult.doc._id);
      if (questResult.created) {
        questInserted += 1;
      } else {
        questUpdated += 1;
      }
    }

    const progressSeeds: Array<{
      user: DemoUserKey;
      quest_code: string;
      progress: number;
      target: number;
      completed: boolean;
      claimed: boolean;
      completed_at?: number;
    }> = [
      {
        user: "guard1",
        quest_code: "tier2_submit_3_leads_today",
        progress: 3,
        target: 3,
        completed: true,
        claimed: true,
        completed_at: hoursAgo(5),
      },
      {
        user: "guard1",
        quest_code: "tier2_complete_2_visits_today",
        progress: 2,
        target: 2,
        completed: true,
        claimed: false,
        completed_at: hoursAgo(3),
      },
      {
        user: "guard1",
        quest_code: "tier2_quality_streak_week",
        progress: 7,
        target: 7,
        completed: true,
        claimed: true,
        completed_at: daysAgo(2),
      },
      {
        user: "guard1",
        quest_code: "tier2_first_closure_bonus",
        progress: 0,
        target: 1,
        completed: false,
        claimed: false,
      },
      {
        user: "guard2",
        quest_code: "tier2_submit_3_leads_today",
        progress: 3,
        target: 3,
        completed: true,
        claimed: false,
        completed_at: hoursAgo(2),
      },
      {
        user: "guard2",
        quest_code: "tier2_complete_2_visits_today",
        progress: 1,
        target: 2,
        completed: false,
        claimed: false,
      },
    ];

    let progressInserted = 0;
    let progressUpdated = 0;

    for (const seed of progressSeeds) {
      const questId = questIdByCode.get(seed.quest_code);
      if (!questId) {
        continue;
      }

      const user = users[seed.user];
      const progressResult = await ensureSeedRecord(ctx, {
        lookup: async () =>
          await ctx.db
            .query("user_quest_progress")
            .withIndex("by_user", (q) => q.eq("user_id", user._id))
            .filter((q) => q.eq(q.field("quest_id"), questId))
            .first(),
        create: async () =>
          await ctx.db.insert("user_quest_progress", {
            user_id: user._id,
            quest_id: questId,
            progress: seed.progress,
            target: seed.target,
            completed: seed.completed,
            claimed: seed.claimed,
            completed_at: seed.completed_at,
            created_at: now,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            progress: seed.progress,
            target: seed.target,
            completed: seed.completed,
            claimed: seed.claimed,
            completed_at: seed.completed_at,
            created_at: existing.created_at,
          });
        },
        label: `quest_progress:${seed.user}:${seed.quest_code}`,
      });

      if (progressResult.created) {
        progressInserted += 1;
      } else {
        progressUpdated += 1;
      }
    }

    return {
      gamification_profiles: { inserted: profileInserted, updated: profileUpdated },
      gamification_quests: { inserted: questInserted, updated: questUpdated },
      user_quest_progress: { inserted: progressInserted, updated: progressUpdated },
      coverage: {
        guard1_completed_quests: 3,
        guard1_active_quests: 1,
        guard2_completed_quests: 1,
      },
    };
  },
});

export const seedCommissionEvaluations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await resolveUsers(ctx);

    const confirmedClosures = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", "CONFIRMED"))
      .collect();

    let targetClosure: Doc<"closures"> | null = null;
    let targetLead: Doc<"leads"> | null = null;

    for (const closure of confirmedClosures) {
      const lead = await ctx.db.get(closure.lead_id);
      if (lead) {
        targetClosure = closure;
        targetLead = lead;
        break;
      }
    }

    if (!targetClosure || !targetLead) {
      throw new Error("seedCommissionEvaluations: Missing confirmed closure with linked lead");
    }

    const [leadVisit, fallbackVisit] = await Promise.all([
      ctx.db
        .query("visits")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", targetLead._id))
        .first(),
      ctx.db
        .query("visits")
        .withIndex("by_status", (q) => q.eq("status", "COMPLETED"))
        .first(),
    ]);

    const visit = leadVisit ?? fallbackVisit;
    const configVersion =
      (await ctx.db
        .query("incentive_config_versions")
        .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
        .first()) ??
      (await ctx.db
        .query("incentive_config_versions")
        .withIndex("by_version", (q) => q.eq("version_code", "v3.0.0"))
        .first());

    const modifierTemplateSeeds: Array<{
      name: string;
      description: string;
      reward_mode: Doc<"commission_modifier_templates">["reward_mode"];
      rule_type: Doc<"commission_modifier_templates">["rule_type"];
      metric_source: string;
      rule_config_json: string;
      link_mode: Doc<"commission_modifier_templates">["link_mode"];
      sort_order: number;
    }> = [
      {
        name: "Tier2 Discovery Quality Boost",
        description: "BPS boost for high quality discovery contributions.",
        reward_mode: "BPS",
        rule_type: "threshold_step",
        metric_source: "quality_score",
        rule_config_json: JSON.stringify({ threshold: 80, delta_bps: 120 }),
        link_mode: "INDIVIDUAL",
        sort_order: 101,
      },
      {
        name: "Tier2 Closure Reliability Bonus",
        description: "Flat paise bonus when closure reliability threshold is met.",
        reward_mode: "FLAT_PAISE",
        rule_type: "threshold_step",
        metric_source: "closure_count",
        rule_config_json: JSON.stringify({ threshold: 1, delta_paise: 25000 }),
        link_mode: "INDIVIDUAL",
        sort_order: 102,
      },
    ];

    let modifierInserted = 0;
    let modifierUpdated = 0;
    const modifierByName = new Map<string, Id<"commission_modifier_templates">>();

    for (const seed of modifierTemplateSeeds) {
      const modifierResult = await ensureSeedRecord(ctx, {
        lookup: async () => {
          const active = await ctx.db
            .query("commission_modifier_templates")
            .withIndex("by_persona_active", (q) => q.eq("persona", "ALL").eq("is_active", true))
            .collect();
          return active.find((template) => template.name === seed.name) ?? null;
        },
        create: async () =>
          await ctx.db.insert("commission_modifier_templates", {
            name: seed.name,
            description: seed.description,
            persona: "ALL",
            reward_mode: seed.reward_mode,
            rule_type: seed.rule_type,
            metric_source: seed.metric_source,
            rule_config_json: seed.rule_config_json,
            link_mode: seed.link_mode,
            link_group_id: undefined,
            is_active: true,
            sort_order: seed.sort_order,
            created_by: users.founder_one._id,
            updated_by: undefined,
            created_at: now,
            updated_at: undefined,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            description: seed.description,
            reward_mode: seed.reward_mode,
            rule_type: seed.rule_type,
            metric_source: seed.metric_source,
            rule_config_json: seed.rule_config_json,
            link_mode: seed.link_mode,
            link_group_id: undefined,
            sort_order: seed.sort_order,
            is_active: true,
            updated_by: users.founder_one._id,
            updated_at: now,
          });
        },
        label: `commission_modifier_template:${seed.name}`,
      });

      modifierByName.set(seed.name, modifierResult.doc._id);
      if (modifierResult.created) {
        modifierInserted += 1;
      } else {
        modifierUpdated += 1;
      }
    }

    const bpsTemplateId = modifierByName.get("Tier2 Discovery Quality Boost");
    const flatTemplateId = modifierByName.get("Tier2 Closure Reliability Bonus");
    if (!bpsTemplateId || !flatTemplateId) {
      throw new Error("seedCommissionEvaluations: Failed to resolve modifier templates");
    }

    const contributionSeeds: Array<{
      key: string;
      actor_user_id: Id<"users">;
      actor_persona: IncentivePersona;
      stage: Doc<"deal_contributions">["stage"];
      source_entity_type: Doc<"deal_contributions">["source_entity_type"];
      source_entity_id: string;
      quality_score_snapshot?: number;
      timeliness_score_snapshot?: number;
      metadata?: Record<string, string | number | boolean>;
    }> = [
      {
        key: "discovery",
        actor_user_id: users.guard1._id,
        actor_persona: "GUARD",
        stage: "DISCOVERY",
        source_entity_type: "LEAD",
        source_entity_id: `${targetLead._id}`,
        quality_score_snapshot: 92,
        timeliness_score_snapshot: 86,
      },
      {
        key: "verification",
        actor_user_id: users.ops1._id,
        actor_persona: "OPS",
        stage: "VERIFICATION",
        source_entity_type: "VISIT",
        source_entity_id: `${visit?._id ?? targetClosure._id}`,
        quality_score_snapshot: 88,
        timeliness_score_snapshot: 90,
      },
      {
        key: "closure",
        actor_user_id: users.ops1._id,
        actor_persona: "OPS",
        stage: "CLOSURE",
        source_entity_type: "CLOSURE",
        source_entity_id: `${targetClosure._id}`,
        quality_score_snapshot: 89,
        timeliness_score_snapshot: 87,
      },
      {
        key: "support",
        actor_user_id: users.founder_one._id,
        actor_persona: "ALL",
        stage: "SUPPORT",
        source_entity_type: "MANUAL",
        source_entity_id: `tier2-support-${targetClosure._id}`,
        metadata: { support_action: "approval_and_document_review" },
      },
    ];

    let contributionInserted = 0;
    let contributionUpdated = 0;
    const contributionIds = new Map<string, Id<"deal_contributions">>();

    for (let index = 0; index < contributionSeeds.length; index += 1) {
      const seed = contributionSeeds[index]!;
      const eventKey = `tier2:commission-eval:${targetClosure._id}:${seed.key}`;

      const contributionResult = await ensureSeedRecord(ctx, {
        lookup: async () =>
          await ctx.db
            .query("deal_contributions")
            .withIndex("by_event_key", (q) => q.eq("event_key", eventKey))
            .first(),
        create: async () =>
          await ctx.db.insert("deal_contributions", {
            closure_id: targetClosure._id,
            lead_id: targetLead._id,
            actor_user_id: seed.actor_user_id,
            actor_persona: seed.actor_persona,
            stage: seed.stage,
            source_entity_type: seed.source_entity_type,
            source_entity_id: seed.source_entity_id,
            event_key: eventKey,
            contribution_units: 1,
            quality_score_snapshot: seed.quality_score_snapshot,
            timeliness_score_snapshot: seed.timeliness_score_snapshot,
            handoff_from_user_id: undefined,
            handoff_reason: undefined,
            occurred_at: now - (contributionSeeds.length - index) * 30_000,
            metadata: seed.metadata,
            is_voided: false,
            voided_reason: undefined,
            voided_by_admin_id: undefined,
            voided_at: undefined,
            is_deleted: false,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            lead_id: targetLead._id,
            actor_user_id: seed.actor_user_id,
            actor_persona: seed.actor_persona,
            stage: seed.stage,
            source_entity_type: seed.source_entity_type,
            source_entity_id: seed.source_entity_id,
            contribution_units: 1,
            quality_score_snapshot: seed.quality_score_snapshot,
            timeliness_score_snapshot: seed.timeliness_score_snapshot,
            handoff_from_user_id: undefined,
            handoff_reason: undefined,
            occurred_at: now - (contributionSeeds.length - index) * 30_000,
            metadata: seed.metadata,
            is_voided: false,
            voided_reason: undefined,
            voided_by_admin_id: undefined,
            voided_at: undefined,
            is_deleted: false,
          });
        },
        label: `deal_contribution:${eventKey}`,
      });

      contributionIds.set(seed.key, contributionResult.doc._id);
      if (contributionResult.created) {
        contributionInserted += 1;
      } else {
        contributionUpdated += 1;
      }
    }

    const baseProfitPaise = Math.max(
      0,
      targetClosure.commission_amount ??
        (targetClosure.brokerage_owner_side ?? 0) + (targetClosure.brokerage_tenant_side ?? 0),
    );
    const baseRateBps = 1500;
    const effectiveRateBps = 1620;
    const flatBonusPaise = 25000;
    const incentivePoolPaise =
      Math.floor((baseProfitPaise * effectiveRateBps) / 10_000) + flatBonusPaise;

    const modifierBreakdown: Doc<"deal_commission_evaluations">["modifier_breakdown"] = [
      {
        template_id: bpsTemplateId,
        template_name: "Tier2 Discovery Quality Boost",
        reward_mode: "BPS",
        delta_bps: 120,
        delta_paise: undefined,
        link_mode: "INDIVIDUAL",
        link_group_id: undefined,
        passed: true,
      },
      {
        template_id: flatTemplateId,
        template_name: "Tier2 Closure Reliability Bonus",
        reward_mode: "FLAT_PAISE",
        delta_bps: undefined,
        delta_paise: BigInt(flatBonusPaise),
        link_mode: "INDIVIDUAL",
        link_group_id: undefined,
        passed: true,
      },
    ];

    let evaluationInserted = 0;
    let evaluationUpdated = 0;

    const evaluationResult = await ensureSeedRecord(ctx, {
      lookup: async () => {
        const evaluations = await ctx.db
          .query("deal_commission_evaluations")
          .withIndex("by_closure", (q) => q.eq("closure_id", targetClosure._id))
          .collect();
        return (
          evaluations.find(
            (evaluation) =>
              evaluation.primary_actor_user_id === users.guard1._id &&
              evaluation.status === "FINAL",
          ) ?? null
        );
      },
      create: async () =>
        await ctx.db.insert("deal_commission_evaluations", {
          closure_id: targetClosure._id,
          primary_actor_user_id: users.guard1._id,
          persona: "GUARD",
          base_rate_bps: baseRateBps,
          effective_rate_bps: effectiveRateBps,
          flat_bonus_paise: flatBonusPaise,
          commission_base_profit_paise: baseProfitPaise,
          incentive_pool_paise: incentivePoolPaise,
          modifier_breakdown: modifierBreakdown,
          config_version: configVersion?.version_code ?? "v3.0.0",
          config_snapshot:
            configVersion?.config_json ??
            JSON.stringify({
              source: "seedCommissionEvaluations",
              version: "v3.0.0",
              stage_weights: { DISCOVERY: 25, VERIFICATION: 35, CLOSURE: 25, SUPPORT: 15 },
            }),
          computed_at: minutesAgo(1),
          status: "FINAL",
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          persona: "GUARD",
          base_rate_bps: baseRateBps,
          effective_rate_bps: effectiveRateBps,
          flat_bonus_paise: flatBonusPaise,
          commission_base_profit_paise: baseProfitPaise,
          incentive_pool_paise: incentivePoolPaise,
          modifier_breakdown: modifierBreakdown,
          config_version: configVersion?.version_code ?? "v3.0.0",
          config_snapshot:
            configVersion?.config_json ??
            JSON.stringify({
              source: "seedCommissionEvaluations",
              version: "v3.0.0",
              stage_weights: { DISCOVERY: 25, VERIFICATION: 35, CLOSURE: 25, SUPPORT: 15 },
            }),
          computed_at: minutesAgo(1),
          status: "FINAL",
        });
      },
      label: `deal_commission_evaluation:${targetClosure._id}`,
    });

    if (evaluationResult.created) {
      evaluationInserted += 1;
    } else {
      evaluationUpdated += 1;
    }

    const attributionResult = await ensureSeedRecord(ctx, {
      lookup: async () => {
        const records = await ctx.db
          .query("attribution_records")
          .withIndex("by_closure", (q) => q.eq("closure_id", targetClosure._id))
          .collect();
        return (
          records.find(
            (record) =>
              record.deal_commission_evaluation_id === evaluationResult.doc._id &&
              record.algorithm === "STAGE_WEIGHTED_QUALITY",
          ) ?? null
        );
      },
      create: async () =>
        await ctx.db.insert("attribution_records", {
          closure_id: targetClosure._id,
          lead_id: targetLead._id,
          deal_commission_evaluation_id: evaluationResult.doc._id,
          algorithm: "STAGE_WEIGHTED_QUALITY",
          algorithm_version: "STAGE_WEIGHTED_QUALITY_V1",
          pool_amount_paise: incentivePoolPaise,
          total_adj_points: 100,
          config_version: evaluationResult.doc.config_version,
          config_snapshot: evaluationResult.doc.config_snapshot,
          status: "FINAL",
          dispute_reason: undefined,
          disputed_by_admin_id: undefined,
          disputed_at: undefined,
          override_reason: undefined,
          overridden_by_admin_id: undefined,
          overridden_at: undefined,
          resolved_by_admin_id: undefined,
          resolution_notes: undefined,
          supersedes_record_id: undefined,
          computed_at: now,
          finalized_at: now,
          resolved_at: undefined,
          is_deleted: false,
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          lead_id: targetLead._id,
          deal_commission_evaluation_id: evaluationResult.doc._id,
          algorithm: "STAGE_WEIGHTED_QUALITY",
          algorithm_version: "STAGE_WEIGHTED_QUALITY_V1",
          pool_amount_paise: incentivePoolPaise,
          total_adj_points: 100,
          config_version: evaluationResult.doc.config_version,
          config_snapshot: evaluationResult.doc.config_snapshot,
          status: "FINAL",
          dispute_reason: undefined,
          disputed_by_admin_id: undefined,
          disputed_at: undefined,
          override_reason: undefined,
          overridden_by_admin_id: undefined,
          overridden_at: undefined,
          resolved_by_admin_id: undefined,
          resolution_notes: undefined,
          supersedes_record_id: undefined,
          computed_at: now,
          finalized_at: now,
          resolved_at: undefined,
          is_deleted: false,
        });
      },
      label: `attribution_record:${targetClosure._id}`,
    });

    const discoveryContributionId = contributionIds.get("discovery");
    const verificationContributionId = contributionIds.get("verification");
    const closureContributionId = contributionIds.get("closure");
    const supportContributionId = contributionIds.get("support");

    if (
      !discoveryContributionId ||
      !verificationContributionId ||
      !closureContributionId ||
      !supportContributionId
    ) {
      throw new Error("seedCommissionEvaluations: Missing contribution IDs for attribution splits");
    }

    const guardAmount = Math.floor((incentivePoolPaise * 25) / 100);
    const opsAmount = Math.floor((incentivePoolPaise * 60) / 100);
    const adminAmount = incentivePoolPaise - guardAmount - opsAmount;

    const splitSeeds: Array<{
      recipient_user_id: Id<"users">;
      recipient_persona: IncentivePersona;
      primary_stage: Doc<"attribution_splits">["primary_stage"];
      contribution_count: number;
      raw_points: number;
      adj_points: number;
      share_bps: number;
      amount_paise: number;
      contribution_points: number;
      contribution_ids: Id<"deal_contributions">[];
      notes?: string;
    }> = [
      {
        recipient_user_id: users.guard1._id,
        recipient_persona: "GUARD",
        primary_stage: "DISCOVERY",
        contribution_count: 1,
        raw_points: 25,
        adj_points: 25,
        share_bps: 2500,
        amount_paise: guardAmount,
        contribution_points: 25,
        contribution_ids: [discoveryContributionId],
        notes: "Discovery contributor share",
      },
      {
        recipient_user_id: users.ops1._id,
        recipient_persona: "OPS",
        primary_stage: "VERIFICATION",
        contribution_count: 2,
        raw_points: 60,
        adj_points: 60,
        share_bps: 6000,
        amount_paise: opsAmount,
        contribution_points: 60,
        contribution_ids: [verificationContributionId, closureContributionId],
        notes: "Verification + closure contributor share",
      },
      {
        recipient_user_id: users.founder_one._id,
        recipient_persona: "ALL",
        primary_stage: "SUPPORT",
        contribution_count: 1,
        raw_points: 15,
        adj_points: 15,
        share_bps: 1500,
        amount_paise: adminAmount,
        contribution_points: 15,
        contribution_ids: [supportContributionId],
        notes: "Support contributor share",
      },
    ];

    let splitInserted = 0;
    let splitUpdated = 0;

    for (const seed of splitSeeds) {
      const splitResult = await ensureSeedRecord(ctx, {
        lookup: async () => {
          const splits = await ctx.db
            .query("attribution_splits")
            .withIndex("by_attribution", (q) =>
              q.eq("attribution_record_id", attributionResult.doc._id),
            )
            .collect();
          return splits.find((split) => split.recipient_user_id === seed.recipient_user_id) ?? null;
        },
        create: async () =>
          await ctx.db.insert("attribution_splits", {
            attribution_record_id: attributionResult.doc._id,
            closure_id: targetClosure._id,
            recipient_user_id: seed.recipient_user_id,
            recipient_persona: seed.recipient_persona,
            primary_stage: seed.primary_stage,
            contribution_count: seed.contribution_count,
            raw_points: seed.raw_points,
            adj_points: seed.adj_points,
            share_bps: seed.share_bps,
            share_bps_display: seed.share_bps,
            provisional_amount_paise: seed.amount_paise,
            residue_numerator: 0,
            remainder_rank: 1,
            amount_paise: seed.amount_paise,
            contribution_points: seed.contribution_points,
            contribution_ids: seed.contribution_ids,
            is_manual_override: false,
            notes: seed.notes,
            created_at: now,
            is_deleted: false,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            closure_id: targetClosure._id,
            recipient_persona: seed.recipient_persona,
            primary_stage: seed.primary_stage,
            contribution_count: seed.contribution_count,
            raw_points: seed.raw_points,
            adj_points: seed.adj_points,
            share_bps: seed.share_bps,
            share_bps_display: seed.share_bps,
            provisional_amount_paise: seed.amount_paise,
            residue_numerator: 0,
            remainder_rank: 1,
            amount_paise: seed.amount_paise,
            contribution_points: seed.contribution_points,
            contribution_ids: seed.contribution_ids,
            is_manual_override: false,
            notes: seed.notes,
            is_deleted: false,
          });
        },
        label: `attribution_split:${attributionResult.doc._id}:${seed.recipient_user_id}`,
      });

      if (splitResult.created) {
        splitInserted += 1;
      } else {
        splitUpdated += 1;
      }
    }

    return {
      commission_modifier_templates: { inserted: modifierInserted, updated: modifierUpdated },
      deal_contributions: { inserted: contributionInserted, updated: contributionUpdated },
      deal_commission_evaluations: { inserted: evaluationInserted, updated: evaluationUpdated },
      attribution_records: {
        inserted: attributionResult.created ? 1 : 0,
        updated: attributionResult.created ? 0 : 1,
      },
      attribution_splits: { inserted: splitInserted, updated: splitUpdated },
    };
  },
});

export const seedIncentiveDisbursements = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await resolveUsers(ctx);

    const [guard1Profile, guard2Profile] = await Promise.all([
      ctx.db
        .query("guard_profiles")
        .withIndex("by_user_id", (q) => q.eq("user_id", users.guard1._id))
        .first(),
      ctx.db
        .query("guard_profiles")
        .withIndex("by_user_id", (q) => q.eq("user_id", users.guard2._id))
        .first(),
    ]);

    if (!guard1Profile || !guard2Profile) {
      throw new Error("seedIncentiveDisbursements: Missing guard profile(s) for guard1/guard2");
    }

    const actorProfileSeeds: Array<{
      user_id: Id<"users">;
      persona: IncentivePersona;
      base_bps: number;
      min_bps: number;
      max_bps: number;
    }> = [
      {
        user_id: users.guard1._id,
        persona: "GUARD",
        base_bps: 1550,
        min_bps: 1200,
        max_bps: 2200,
      },
      {
        user_id: users.guard2._id,
        persona: "GUARD",
        base_bps: 1500,
        min_bps: 1200,
        max_bps: 2200,
      },
    ];

    let actorInserted = 0;
    let actorUpdated = 0;

    for (const seed of actorProfileSeeds) {
      const actorResult = await ensureSeedRecord(ctx, {
        lookup: async () => {
          const profiles = await ctx.db
            .query("incentive_actor_profiles")
            .withIndex("by_user", (q) => q.eq("user_id", seed.user_id))
            .collect();
          return (
            profiles.find((profile) => profile.persona === seed.persona && profile.is_active) ??
            null
          );
        },
        create: async () =>
          await ctx.db.insert("incentive_actor_profiles", {
            user_id: seed.user_id,
            persona: seed.persona,
            commission_base_bps: seed.base_bps,
            commission_min_bps: seed.min_bps,
            commission_max_bps: seed.max_bps,
            effective_from: daysAgo(30),
            effective_to: undefined,
            is_active: true,
            assigned_by: users.founder_one._id,
            updated_by: undefined,
            created_at: now,
            updated_at: undefined,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            commission_base_bps: seed.base_bps,
            commission_min_bps: seed.min_bps,
            commission_max_bps: seed.max_bps,
            effective_from: daysAgo(30),
            effective_to: undefined,
            is_active: true,
            updated_by: users.founder_one._id,
            updated_at: now,
          });
        },
        label: `incentive_actor_profile:${seed.user_id}`,
      });

      if (actorResult.created) {
        actorInserted += 1;
      } else {
        actorUpdated += 1;
      }
    }

    const incentiveCardSeeds: Array<{
      key: "guard1" | "guard2";
      guard_user_id: Id<"users">;
      card_type: Doc<"incentive_cards">["card_type"];
      level: Doc<"incentive_cards">["level"];
      reward_amount_paise: number;
      title: string;
      description: string;
    }> = [
      {
        key: "guard1",
        guard_user_id: users.guard1._id,
        card_type: "quality_streak",
        level: "GOLD",
        reward_amount_paise: 12000,
        title: "Tier2 Quality Streak",
        description: "Maintained high quality over 7 days.",
      },
      {
        key: "guard2",
        guard_user_id: users.guard2._id,
        card_type: "speed_bonus",
        level: "SILVER",
        reward_amount_paise: 9000,
        title: "Tier2 Speed Bonus",
        description: "Quick verification turnaround achieved.",
      },
    ];

    let cardInserted = 0;
    let cardUpdated = 0;
    const cardIdByKey = new Map<"guard1" | "guard2", Id<"incentive_cards">>();

    for (const seed of incentiveCardSeeds) {
      const cardResult = await ensureSeedRecord(ctx, {
        lookup: async () =>
          await ctx.db
            .query("incentive_cards")
            .withIndex("by_guard_and_type", (q) =>
              q.eq("guard_user_id", seed.guard_user_id).eq("card_type", seed.card_type),
            )
            .first(),
        create: async () =>
          await ctx.db.insert("incentive_cards", {
            guard_user_id: seed.guard_user_id,
            card_type: seed.card_type,
            level: seed.level,
            awarded_method: "MANUAL",
            title: seed.title,
            description: seed.description,
            badge_icon: "sparkles",
            reward_amount_paise: seed.reward_amount_paise,
            awarded_reason: "Tier2 disbursement lifecycle demo",
            awarded_by_admin_id: users.founder_one._id,
            earned_at: now,
            rejected_at: undefined,
            redeemed_at: undefined,
            expires_at: daysFromNow(45),
            metadata: {
              source: "seedIncentiveDisbursements",
            },
            status: "active",
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            level: seed.level,
            title: seed.title,
            description: seed.description,
            badge_icon: "sparkles",
            reward_amount_paise: seed.reward_amount_paise,
            awarded_reason: "Tier2 disbursement lifecycle demo",
            awarded_by_admin_id: users.founder_one._id,
            earned_at: now,
            expires_at: daysFromNow(45),
            metadata: {
              source: "seedIncentiveDisbursements",
            },
            status: "active",
          });
        },
        label: `incentive_card:${seed.guard_user_id}:${seed.card_type}`,
      });

      cardIdByKey.set(seed.key, cardResult.doc._id);
      if (cardResult.created) {
        cardInserted += 1;
      } else {
        cardUpdated += 1;
      }
    }

    const confirmedClosure = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", "CONFIRMED"))
      .first();

    const guard1CardId = cardIdByKey.get("guard1");
    const guard2CardId = cardIdByKey.get("guard2");
    if (!guard1CardId || !guard2CardId) {
      throw new Error("seedIncentiveDisbursements: Missing seeded incentive card IDs");
    }

    const disbursementSeeds: Array<{
      source_key: string;
      recipient_user_id: Id<"users">;
      recipient_persona: IncentivePersona;
      source_record_id: string;
      amount_paise: number;
      status: Doc<"incentive_disbursements">["status"];
      closure_id?: Id<"closures">;
    }> = [
      {
        source_key: `tier2:card:${guard1CardId}:pending`,
        recipient_user_id: guard1Profile.user_id,
        recipient_persona: "GUARD",
        source_record_id: `${guard1CardId}`,
        amount_paise: 12000,
        status: "PENDING",
        closure_id: confirmedClosure?._id,
      },
      {
        source_key: `tier2:card:${guard1CardId}:approved`,
        recipient_user_id: guard1Profile.user_id,
        recipient_persona: "GUARD",
        source_record_id: `${guard1CardId}`,
        amount_paise: 8000,
        status: "APPROVED",
        closure_id: confirmedClosure?._id,
      },
      {
        source_key: `tier2:card:${guard2CardId}:disbursed`,
        recipient_user_id: guard2Profile.user_id,
        recipient_persona: "GUARD",
        source_record_id: `${guard2CardId}`,
        amount_paise: 9000,
        status: "DISBURSED",
        closure_id: confirmedClosure?._id,
      },
      {
        source_key: `tier2:card:${guard2CardId}:failed`,
        recipient_user_id: guard2Profile.user_id,
        recipient_persona: "GUARD",
        source_record_id: `${guard2CardId}`,
        amount_paise: 4500,
        status: "FAILED",
      },
    ];

    let disbursementInserted = 0;
    let disbursementUpdated = 0;

    for (const seed of disbursementSeeds) {
      const disbursementResult = await ensureSeedRecord(ctx, {
        lookup: async () =>
          await ctx.db
            .query("incentive_disbursements")
            .withIndex("by_source_key", (q) => q.eq("source_key", seed.source_key))
            .first(),
        create: async () =>
          await ctx.db.insert("incentive_disbursements", {
            recipient_user_id: seed.recipient_user_id,
            recipient_persona: seed.recipient_persona,
            source_type: "QUEST_REWARD",
            source_record_id: seed.source_record_id,
            source_key: seed.source_key,
            closure_id: seed.closure_id,
            amount_paise: seed.amount_paise,
            status: seed.status,
            approved_by_admin_id:
              seed.status === "APPROVED" || seed.status === "DISBURSED"
                ? users.founder_one._id
                : undefined,
            approved_at:
              seed.status === "APPROVED" || seed.status === "DISBURSED" ? hoursAgo(6) : undefined,
            disbursed_at: seed.status === "DISBURSED" ? hoursAgo(4) : undefined,
            created_at: now,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            recipient_user_id: seed.recipient_user_id,
            recipient_persona: seed.recipient_persona,
            source_type: "QUEST_REWARD",
            source_record_id: seed.source_record_id,
            closure_id: seed.closure_id,
            amount_paise: seed.amount_paise,
            status: seed.status,
            approved_by_admin_id:
              seed.status === "APPROVED" || seed.status === "DISBURSED"
                ? users.founder_one._id
                : undefined,
            approved_at:
              seed.status === "APPROVED" || seed.status === "DISBURSED" ? hoursAgo(6) : undefined,
            disbursed_at: seed.status === "DISBURSED" ? hoursAgo(4) : undefined,
          });
        },
        label: `incentive_disbursement:${seed.source_key}`,
      });

      if (disbursementResult.created) {
        disbursementInserted += 1;
      } else {
        disbursementUpdated += 1;
      }
    }

    const payoutAdjustmentSeeds: Array<{
      guard_user_id: Id<"users">;
      quality_tier: Doc<"payout_adjustments">["quality_tier"];
      quality_score: number;
      quality_multiplier: number;
      streak_bonus_paise: number;
      penalty_total_paise: number;
    }> = [
      {
        guard_user_id: users.guard1._id,
        quality_tier: "GOLD",
        quality_score: 88,
        quality_multiplier: 1.2,
        streak_bonus_paise: 3000,
        penalty_total_paise: 0,
      },
      {
        guard_user_id: users.guard2._id,
        quality_tier: "SILVER",
        quality_score: 74,
        quality_multiplier: 1.05,
        streak_bonus_paise: 1000,
        penalty_total_paise: 500,
      },
    ];

    let adjustmentInserted = 0;
    let adjustmentUpdated = 0;

    for (const seed of payoutAdjustmentSeeds) {
      const payout = await ctx.db
        .query("payouts")
        .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", seed.guard_user_id))
        .first();

      if (!payout) {
        continue;
      }

      const bonuses: Doc<"payout_adjustments">["task_bonuses"] = [
        {
          bonus_type: "FULL_CHECKLIST",
          label: "Tier2 checklist quality bonus",
          amount_paise: 1200,
          percentage: undefined,
        },
      ];

      const penalties: Doc<"payout_adjustments">["penalties"] =
        seed.penalty_total_paise > 0
          ? [
              {
                penalty_type: "NO_SHOW",
                label: "Tier2 failed disbursement risk penalty",
                amount_paise: seed.penalty_total_paise,
              },
            ]
          : [];

      const suggestedTotal =
        payout.amount_paise +
        seed.streak_bonus_paise +
        bonuses[0]!.amount_paise -
        seed.penalty_total_paise;

      const adjustmentResult = await ensureSeedRecord(ctx, {
        lookup: async () =>
          await ctx.db
            .query("payout_adjustments")
            .withIndex("by_payout", (q) => q.eq("payout_id", payout._id))
            .first(),
        create: async () =>
          await ctx.db.insert("payout_adjustments", {
            payout_id: payout._id,
            guard_user_id: seed.guard_user_id,
            base_amount_paise: payout.amount_paise,
            quality_score: seed.quality_score,
            quality_tier: seed.quality_tier,
            quality_multiplier: seed.quality_multiplier,
            streak_bonus_paise: seed.streak_bonus_paise,
            task_bonuses: bonuses,
            task_bonuses_total_paise: bonuses.reduce((sum, bonus) => sum + bonus.amount_paise, 0),
            penalties,
            penalty_total_paise: seed.penalty_total_paise,
            suggested_total_paise: suggestedTotal,
            admin_override_paise: undefined,
            final_amount_paise: payout.amount_paise,
            computed_at: now,
            is_deleted: false,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            guard_user_id: seed.guard_user_id,
            base_amount_paise: payout.amount_paise,
            quality_score: seed.quality_score,
            quality_tier: seed.quality_tier,
            quality_multiplier: seed.quality_multiplier,
            streak_bonus_paise: seed.streak_bonus_paise,
            task_bonuses: bonuses,
            task_bonuses_total_paise: bonuses.reduce((sum, bonus) => sum + bonus.amount_paise, 0),
            penalties,
            penalty_total_paise: seed.penalty_total_paise,
            suggested_total_paise: suggestedTotal,
            admin_override_paise: undefined,
            final_amount_paise: payout.amount_paise,
            computed_at: now,
            is_deleted: false,
          });
        },
        label: `payout_adjustment:${payout._id}`,
      });

      if (adjustmentResult.created) {
        adjustmentInserted += 1;
      } else {
        adjustmentUpdated += 1;
      }
    }

    return {
      incentive_actor_profiles: { inserted: actorInserted, updated: actorUpdated },
      incentive_cards: { inserted: cardInserted, updated: cardUpdated },
      incentive_disbursements: { inserted: disbursementInserted, updated: disbursementUpdated },
      payout_adjustments: { inserted: adjustmentInserted, updated: adjustmentUpdated },
    };
  },
});
