// Notification engine: emit → queue (quiet hours, throttle, per-channel dispatch) → provider
// result → retry/dead-letter. Provider actions run for real with their env unset or stubbed.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_notifications";
process.env.WORKOS_API_KEY ??= "sk_test_notifications";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_notifications";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
// 11:30 IST — outside the default 22:00–07:00 quiet hours.
const T0 = Date.parse("2026-04-01T06:00:00.000Z");
const MINUTE = 60_000;
const EVENT_TYPE = "lead_verified";
const PROVIDER_ENV = [
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "WHATSAPP_API_KEY",
  "WHATSAPP_API_URL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "NOTIFICATION_FROM_EMAIL",
  "NOTIFICATION_EMAIL_PROVIDER",
];

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTest>;
type ExternalChannel = "PUSH" | "WHATSAPP" | "SMS" | "EMAIL";

let sequence = 0;

async function createUser(
  t: TestBackend,
  userType: UserType,
  extra: Partial<Doc<"users">> = {},
  permissions: string[] = [],
) {
  sequence += 1;
  const workosUserId = `user_notifications_${sequence}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} ${sequence}`,
      email: `${workosUserId}@example.com`,
      phone: `98${String(sequence).padStart(8, "0")}`,
      status: "ACTIVE",
      must_change_password: false,
      ...extra,
    });
    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `notifications role ${sequence}`,
        permissions,
        is_system_role: false,
        is_deleted: false,
      });
      await ctx.db.insert("user_role_assignments", {
        user_id: id,
        role_id: roleId,
        assigned_by_admin_id: id,
        is_deleted: false,
      });
    }
    return id;
  });
  return { userId, as: t.withIdentity({ subject: workosUserId, issuer: WORKOS_ISSUER }) };
}

async function insertTemplates(
  t: TestBackend,
  channels: Array<Doc<"notification_templates">["channel"]>,
  locale = "en",
  body = "Flat {{flat}} was verified. Bounty ₹{{amount}}.",
) {
  await t.run(async (ctx) => {
    for (const channel of channels) {
      await ctx.db.insert("notification_templates", {
        event_type: EVENT_TYPE,
        category: "LEAD_UPDATE",
        channel,
        locale,
        subject: "Lead {{flat}} verified",
        body,
        variables: ["flat", "amount"],
        is_active: true,
        is_deleted: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }
  });
}

async function emit(
  t: TestBackend,
  userId: Id<"users">,
  overrides: { severity?: "NORMAL" | "IMPORTANT" | "URGENT"; dedup_key?: string } = {},
) {
  return await t.mutation(internal.notifications.emitEvent, {
    user_id: userId,
    event_type: EVENT_TYPE,
    category: "LEAD_UPDATE",
    severity: overrides.severity ?? "NORMAL",
    payload: { flat: "B-1203", amount: 500 },
    dedup_key: overrides.dedup_key,
  });
}

async function emittedEventId(t: TestBackend, userId: Id<"users">, overrides = {}) {
  const result = await emit(t, userId, overrides);
  if (!("event_id" in result) || !result.event_id) throw new Error("event was suppressed");
  return result.event_id;
}

async function getEvent(t: TestBackend, eventId: Id<"notification_events">) {
  const event = await t.run(async (ctx) => ctx.db.get(eventId));
  if (!event) throw new Error("event missing");
  return event;
}

function channelStatus(event: Doc<"notification_events">, channel: ExternalChannel) {
  return event.channel_status?.[channel];
}

async function addPushSubscription(t: TestBackend, userId: Id<"users">, endpoint: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("push_subscriptions", {
      user_id: userId,
      endpoint,
      p256dh: "p256dh-key",
      auth: "auth-key",
      is_active: true,
      is_deleted: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  });
}

async function insertProcessingEvent(
  t: TestBackend,
  userId: Id<"users">,
  fields: Partial<Doc<"notification_events">> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("notification_events", {
      user_id: userId,
      event_type: EVENT_TYPE,
      category: "LEAD_UPDATE",
      severity: "NORMAL",
      status: "PROCESSING",
      channels: ["IN_APP", "SMS"],
      payload: {},
      channel_status: {
        IN_APP: { status: "DELIVERED", attempt_count: 0, delivered_at: Date.now() },
        SMS: { status: "SCHEDULED", attempt_count: 1, scheduled_at: Date.now() },
      },
      retry_count: 0,
      is_deleted: false,
      created_at: Date.now(),
      updated_at: Date.now(),
      ...fields,
    }),
  );
}

describe("notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    for (const key of PROVIDER_ENV) {
      vi.stubEnv(key, "");
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("emitEvent", () => {
    it("writes the in-app row and picks external channels from the recipient's persona", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const admin = await createUser(t, "ADMIN");
      await insertTemplates(t, ["IN_APP"]);

      const result = await emit(t, guard.userId);
      expect(result).toMatchObject({
        suppressed: false,
        channels: ["IN_APP", "WHATSAPP", "PUSH", "SMS"],
      });
      expect((await emit(t, admin.userId)).channels).toEqual(["IN_APP"]);

      const inbox = await guard.as.query(api.notifications.getMyNotifications, {
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(inbox.page).toHaveLength(1);
      expect(inbox.page[0]).toMatchObject({
        channel: "IN_APP",
        body: "Flat B-1203 was verified. Bounty ₹500.",
        is_read: false,
      });
      const preferences = await guard.as.query(api.notifications.getPreferences, {});
      expect(preferences).toMatchObject({
        timezone: "Asia/Kolkata",
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:00",
      });
    });

    it.fails(
      "fills payload placeholders in the in-app title as external subjects do (BUG-024)",
      async () => {
        const t = createTest();
        const guard = await createUser(t, "GUARD");
        await insertTemplates(t, ["IN_APP"]);

        await emit(t, guard.userId);

        const [row] = await t.run(async (ctx) => ctx.db.query("notifications").collect());
        expect(row?.title).toBe("Lead B-1203 verified");
      },
    );

    it("suppresses events for an inactive recipient without writing anything", async () => {
      const t = createTest();
      const suspended = await createUser(t, "GUARD", { status: "INACTIVE" });

      expect(await emit(t, suspended.userId)).toEqual({
        suppressed: true,
        reason: "recipient_inactive",
      });
      const rows = await t.run(async (ctx) => ({
        events: await ctx.db.query("notification_events").collect(),
        inbox: await ctx.db.query("notifications").collect(),
      }));
      expect(rows).toEqual({ events: [], inbox: [] });
    });

    it("suppresses a repeated dedup_key for the same user only within the 5-minute window", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const other = await createUser(t, "GUARD");

      const firstId = await emittedEventId(t, guard.userId, { dedup_key: "lead:42" });
      vi.setSystemTime(T0 + 5 * MINUTE);
      expect(await emit(t, guard.userId, { dedup_key: "lead:42" })).toEqual({
        suppressed: true,
        reason: "dedup_window",
        event_id: firstId,
      });
      expect((await emit(t, other.userId, { dedup_key: "lead:42" })).suppressed).toBe(false);

      vi.setSystemTime(T0 + 5 * MINUTE + 1);
      const later = await emit(t, guard.userId, { dedup_key: "lead:42" });
      expect(later.suppressed).toBe(false);
      expect("event_id" in later && later.event_id).not.toBe(firstId);
    });

    it("renders the recipient's locale template and falls back to English, then to the raw payload", async () => {
      const t = createTest();
      const hindiGuard = await createUser(t, "GUARD");
      await t.run(async (ctx) => {
        const societyId = await ctx.db.insert("societies", {
          name: "Locale Society",
          city: "Pune",
          status: "ACTIVE",
          created_by_admin_id: hindiGuard.userId,
        });
        await ctx.db.insert("guard_profiles", {
          user_id: hindiGuard.userId,
          society_id: societyId,
          guard_type: "MAIN_GATE",
          language_preference: "hi",
          has_seen_onboarding: true,
        });
      });
      const readInbox = async (userId: Id<"users">) =>
        t.run(async (ctx) =>
          ctx.db
            .query("notifications")
            .withIndex("by_user_id", (q) => q.eq("user_id", userId))
            .collect(),
        );

      await emit(t, hindiGuard.userId);
      const [untemplated] = await readInbox(hindiGuard.userId);
      expect(untemplated?.title).toBe("Lead Verified");
      expect(JSON.parse(untemplated?.body ?? "null")).toEqual({ flat: "B-1203", amount: 500 });

      await insertTemplates(t, ["IN_APP"], "en", "Flat {{flat}} verified {{missing}}!");
      vi.setSystemTime(T0 + 1);
      await emit(t, hindiGuard.userId);
      await insertTemplates(t, ["IN_APP"], "hi", "फ्लैट {{flat}} सत्यापित");
      vi.setSystemTime(T0 + 2);
      await emit(t, hindiGuard.userId);

      const bodies = (await readInbox(hindiGuard.userId)).map((row) => row.body);
      expect(bodies.slice(1)).toEqual(["Flat B-1203 verified !", "फ्लैट B-1203 सत्यापित"]);
    });

    it("drops opted-out channels and keeps the WhatsApp opt-out when a later update omits it", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const all = { in_app: true, push: true, whatsapp: true, sms: true, email: true };

      await guard.as.mutation(api.notifications.updatePreferences, {
        whatsapp_opt_out: true,
        channels_enabled: { ...all, push: false },
        category_settings: [{ category: "LEAD_UPDATE", channels: all }],
      });
      expect((await emit(t, guard.userId)).channels).toEqual(["IN_APP", "SMS"]);

      await guard.as.mutation(api.notifications.updatePreferences, {
        channels_enabled: all,
        category_settings: [{ category: "LEAD_UPDATE", channels: { ...all, sms: false } }],
      });
      vi.setSystemTime(T0 + 1);
      expect((await emit(t, guard.userId)).channels).toEqual(["IN_APP", "PUSH"]);
    });
  });

  describe("processQueue", () => {
    it("defers a non-urgent event to 07:00 IST during quiet hours and sends urgent ones now", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      await insertTemplates(t, ["IN_APP", "WHATSAPP", "SMS"]);
      const lateNight = Date.parse("2026-04-01T17:30:00.000Z"); // 23:00 IST
      vi.setSystemTime(lateNight);
      const normalId = await emittedEventId(t, guard.userId);
      const urgentId = await emittedEventId(t, guard.userId, { severity: "URGENT" });

      await t.mutation(internal.notifications.processQueue, {});

      const normal = await getEvent(t, normalId);
      expect(normal.status).toBe("PENDING");
      expect(normal.next_attempt_at).toBe(lateNight + 8 * 60 * MINUTE);
      const urgent = await getEvent(t, urgentId);
      expect(urgent.status).toBe("PROCESSING");
      expect(channelStatus(urgent, "WHATSAPP")?.status).toBe("SCHEDULED");
    });

    it("treats 22:00 IST as inside quiet hours and 07:00 IST as outside", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      await insertTemplates(t, ["IN_APP", "WHATSAPP", "SMS"]);

      const tenPm = Date.parse("2026-04-01T16:30:00.000Z");
      vi.setSystemTime(tenPm);
      const atStart = await emittedEventId(t, guard.userId);
      await t.mutation(internal.notifications.processQueue, {});
      expect((await getEvent(t, atStart)).next_attempt_at).toBe(tenPm + 9 * 60 * MINUTE);

      const sevenAm = Date.parse("2026-04-02T01:30:00.000Z");
      vi.setSystemTime(sevenAm);
      await t.mutation(internal.notifications.processQueue, {});
      expect((await getEvent(t, atStart)).status).toBe("PROCESSING");
    });

    it("suppresses channels it cannot reach and fails the one without a template", async () => {
      const t = createTest();
      const tenant = await createUser(t, "TENANT", { phone: undefined });
      await insertTemplates(t, ["IN_APP", "PUSH", "WHATSAPP"]);
      const eventId = await emittedEventId(t, tenant.userId);

      await t.mutation(internal.notifications.processQueue, {});

      const event = await getEvent(t, eventId);
      expect(channelStatus(event, "PUSH")).toMatchObject({
        status: "SUPPRESSED",
        last_error: "push_subscription_not_found",
      });
      expect(channelStatus(event, "WHATSAPP")).toMatchObject({
        status: "SUPPRESSED",
        last_error: "whatsapp_missing_phone",
      });
      expect(channelStatus(event, "SMS")).toMatchObject({
        status: "FAILED",
        last_error: "template_missing:SMS",
      });
      expect(event).toMatchObject({
        status: "FAILED",
        retry_count: 1,
        next_attempt_at: T0 + 2000 * 2,
        last_error: "template_missing:SMS",
      });
    });

    it("throttles SMS after one SMS-eligible event for the user in the last minute", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      await insertTemplates(t, ["IN_APP", "WHATSAPP", "PUSH", "SMS"]);

      await emittedEventId(t, guard.userId);
      await t.mutation(internal.notifications.processQueue, {});

      vi.setSystemTime(T0 + 30_000);
      const throttledId = await emittedEventId(t, guard.userId);
      await t.mutation(internal.notifications.processQueue, {});
      const throttled = await getEvent(t, throttledId);
      expect(channelStatus(throttled, "SMS")).toMatchObject({
        status: "SUPPRESSED",
        last_error: "throttled:SMS",
      });
      expect(channelStatus(throttled, "WHATSAPP")?.status).toBe("SCHEDULED");

      vi.setSystemTime(T0 + 91_000);
      const laterId = await emittedEventId(t, guard.userId);
      await t.mutation(internal.notifications.processQueue, {});
      expect(channelStatus(await getEvent(t, laterId), "SMS")?.status).toBe("SCHEDULED");
    });

    it.fails(
      "lets the first of two SMS-eligible events queued in the same minute send its SMS (BUG-022)",
      async () => {
        const t = createTest();
        const guard = await createUser(t, "GUARD");
        await insertTemplates(t, ["IN_APP", "WHATSAPP", "PUSH", "SMS"]);
        const firstId = await emittedEventId(t, guard.userId);
        vi.setSystemTime(T0 + 20_000);
        const secondId = await emittedEventId(t, guard.userId);

        vi.setSystemTime(T0 + 40_000);
        await t.mutation(internal.notifications.processQueue, {});

        // SMS is capped at 1 per user per minute: one of the two goes out, not zero.
        const smsStates = [await getEvent(t, firstId), await getEvent(t, secondId)].map(
          (event) => channelStatus(event, "SMS")?.status,
        );
        expect(smsStates.filter((state) => state === "SCHEDULED")).toHaveLength(1);
      },
    );

    it.fails("schedules push for a user with two active devices (BUG-021)", async () => {
      const t = createTest();
      const tenant = await createUser(t, "TENANT");
      await insertTemplates(t, ["IN_APP", "PUSH", "WHATSAPP", "SMS"]);
      await addPushSubscription(t, tenant.userId, "https://push.example/phone");
      await addPushSubscription(t, tenant.userId, "https://push.example/laptop");
      const eventId = await emittedEventId(t, tenant.userId);

      await t.mutation(internal.notifications.processQueue, {});

      expect(channelStatus(await getEvent(t, eventId), "PUSH")?.status).toBe("SCHEDULED");
    });

    it.fails(
      "still processes other users' events when one recipient has two active devices (BUG-021)",
      async () => {
        const t = createTest();
        const bystander = await createUser(t, "GUARD");
        const multiDevice = await createUser(t, "TENANT");
        await insertTemplates(t, ["IN_APP", "PUSH", "WHATSAPP", "SMS"]);
        await addPushSubscription(t, multiDevice.userId, "https://push.example/phone");
        await addPushSubscription(t, multiDevice.userId, "https://push.example/laptop");
        const bystanderEvent = await emittedEventId(t, bystander.userId);
        await emittedEventId(t, multiDevice.userId);

        await t.mutation(internal.notifications.processQueue, {}).catch(() => undefined);

        expect((await getEvent(t, bystanderEvent)).status).toBe("PROCESSING");
      },
    );
  });

  describe("delivery results", () => {
    it("records unconfigured providers as failures and schedules a 2000·2^n ms retry", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      await insertTemplates(t, ["IN_APP", "WHATSAPP", "PUSH", "SMS"]);
      await addPushSubscription(t, guard.userId, "https://push.example/guard");
      const eventId = await emittedEventId(t, guard.userId);

      await t.mutation(internal.notifications.processQueue, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const event = await getEvent(t, eventId);
      expect(channelStatus(event, "WHATSAPP")).toMatchObject({
        status: "FAILED",
        last_error: "WhatsApp channel is not configured",
      });
      expect(channelStatus(event, "PUSH")?.last_error).toBe("Push channel is not configured");
      expect(channelStatus(event, "SMS")?.last_error).toBe("SMS channel is not configured");
      expect(event).toMatchObject({
        status: "FAILED",
        retry_count: 1,
        last_error: "WhatsApp channel is not configured",
      });
      expect(event.next_attempt_at).toBe(T0 + 2000 * 2);
    });

    it("marks the event delivered once every configured provider accepts it", async () => {
      const t = createTest();
      for (const key of PROVIDER_ENV) {
        vi.stubEnv(key, `test-${key.toLowerCase()}`);
      }
      const guard = await createUser(t, "GUARD");
      await insertTemplates(t, ["IN_APP", "WHATSAPP", "PUSH", "SMS"]);
      await addPushSubscription(t, guard.userId, "https://push.example/guard-device");
      const eventId = await emittedEventId(t, guard.userId);

      await t.mutation(internal.notifications.processQueue, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const event = await getEvent(t, eventId);
      expect(event.status).toBe("DELIVERED");
      for (const channel of ["WHATSAPP", "PUSH", "SMS"] as const) {
        expect(channelStatus(event, channel)?.status).toBe("DELIVERED");
        expect(channelStatus(event, channel)?.provider_message_id).toBeTruthy();
      }
      expect(channelStatus(event, "PUSH")?.provider_message_id).toMatch(/guard-device$/);
    });

    it("dead-letters on the third failed attempt and honours configured retry settings", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const fail = (eventId: Id<"notification_events">) =>
        t.mutation(internal.notifications.recordChannelResult, {
          event_id: eventId,
          channel: "SMS",
          success: false,
          error: "carrier rejected",
        });

      const thirdAttempt = await insertProcessingEvent(t, guard.userId, { retry_count: 2 });
      await fail(thirdAttempt);
      const deadLetter = await getEvent(t, thirdAttempt);
      expect(deadLetter).toMatchObject({
        status: "DEAD_LETTER",
        retry_count: 3,
        final_error: "carrier rejected",
      });
      expect(deadLetter.next_attempt_at).toBeUndefined();

      await t.run(async (ctx) => {
        for (const [key, value] of [
          ["notification_max_retries", "5"],
          ["notification_retry_base_ms", "1000"],
        ] as const) {
          await ctx.db.insert("system_config", { key, value, updated_by_admin_id: guard.userId });
        }
      });
      const configured = await insertProcessingEvent(t, guard.userId, { retry_count: 2 });
      await fail(configured);
      expect(await getEvent(t, configured)).toMatchObject({
        status: "FAILED",
        retry_count: 3,
        next_attempt_at: T0 + 1000 * 8,
      });
    });

    it("applies a provider webhook to the channel that carries its message id", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const eventId = await insertProcessingEvent(t, guard.userId, {
        channel_status: {
          IN_APP: { status: "DELIVERED", attempt_count: 0 },
          SMS: { status: "SCHEDULED", attempt_count: 1, provider_message_id: "sms-777" },
        },
      });

      expect(
        await t.mutation(internal.notifications.processDeliveryWebhook, {
          provider_message_id: "sms-unknown",
          status: "DELIVERED",
        }),
      ).toEqual({ updated: false });
      await t.mutation(internal.notifications.processDeliveryWebhook, {
        provider_message_id: "sms-777",
        status: "DELIVERED",
      });

      const event = await getEvent(t, eventId);
      expect(event.status).toBe("DELIVERED");
      expect(channelStatus(event, "SMS")).toMatchObject({
        status: "DELIVERED",
        provider_message_id: "sms-777",
      });
    });
  });

  describe("retryFailed", () => {
    it("requeues failed events only after their backoff and dead-letters exhausted ones", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const failedSms = {
        IN_APP: { status: "DELIVERED" as const, attempt_count: 0 },
        SMS: { status: "FAILED" as const, attempt_count: 1, last_error: "timeout" },
      };
      const waiting = await insertProcessingEvent(t, guard.userId, {
        status: "FAILED",
        retry_count: 1,
        next_attempt_at: T0 + 4000,
        channel_status: failedSms,
      });
      const due = await insertProcessingEvent(t, guard.userId, {
        status: "FAILED",
        retry_count: 1,
        next_attempt_at: T0,
        channel_status: failedSms,
      });
      const exhausted = await insertProcessingEvent(t, guard.userId, {
        status: "FAILED",
        retry_count: 3,
        next_attempt_at: T0,
        last_error: "timeout",
        channel_status: failedSms,
      });

      expect(await t.mutation(internal.notifications.retryFailed, {})).toEqual({
        retried: 1,
        dead_lettered: 1,
      });
      expect((await getEvent(t, waiting)).status).toBe("FAILED");
      expect(await getEvent(t, due)).toMatchObject({ status: "PENDING", next_attempt_at: T0 });
      expect(await getEvent(t, exhausted)).toMatchObject({
        status: "DEAD_LETTER",
        final_error: "timeout",
      });
    });
  });

  describe("recoverStaleProcessing", () => {
    it("requeues an event stuck in PROCESSING for 5 minutes and fails its scheduled channel", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const eventId = await insertProcessingEvent(t, guard.userId);

      vi.setSystemTime(T0 + 5 * MINUTE - 1);
      expect(await t.mutation(internal.notifications.recoverStaleProcessing, {})).toEqual({
        recovered: 0,
        dead_lettered: 0,
      });

      vi.setSystemTime(T0 + 5 * MINUTE);
      expect(await t.mutation(internal.notifications.recoverStaleProcessing, {})).toEqual({
        recovered: 1,
        dead_lettered: 0,
      });
      const event = await getEvent(t, eventId);
      expect(event).toMatchObject({
        status: "PENDING",
        retry_count: 1,
        next_attempt_at: T0 + 5 * MINUTE + 2000 * 2,
        last_error: "processing_timeout",
      });
      expect(channelStatus(event, "SMS")).toMatchObject({
        status: "FAILED",
        last_error: "processing_timeout",
      });
    });
  });

  describe("inbox", () => {
    it("lets only the recipient mark a notification read", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const other = await createUser(t, "GUARD");
      const result = await emit(t, guard.userId);
      const notificationId = "notification_id" in result ? result.notification_id : undefined;
      if (!notificationId) throw new Error("no notification");

      await expect(
        other.as.mutation(api.notifications.markRead, { notification_id: notificationId }),
      ).rejects.toThrow("Notification not found");
      expect(await guard.as.query(api.notifications.getUnreadCount, {})).toEqual({
        unread_count: 1,
      });

      await guard.as.mutation(api.notifications.markRead, { notification_id: notificationId });
      expect(await guard.as.query(api.notifications.getUnreadCount, {})).toEqual({
        unread_count: 0,
      });
    });

    it("moves a push endpoint to whoever registered it last and ignores unregister by others", async () => {
      const t = createTest();
      const first = await createUser(t, "TENANT");
      const second = await createUser(t, "TENANT");
      const device = { endpoint: "https://push.example/shared-browser", p256dh: "k", auth: "a" };

      await first.as.mutation(api.notifications.registerPushSubscription, device);
      await second.as.mutation(api.notifications.registerPushSubscription, device);

      expect(await first.as.query(api.notifications.listMyPushSubscriptions, {})).toEqual([]);
      expect(
        (await second.as.query(api.notifications.listMyPushSubscriptions, {})).map(
          (s) => s.endpoint,
        ),
      ).toEqual([device.endpoint]);

      await first.as.mutation(api.notifications.unregisterPushSubscription, {
        endpoint: device.endpoint,
      });
      expect(await second.as.query(api.notifications.listMyPushSubscriptions, {})).toHaveLength(1);
    });
  });

  describe("admin monitor", () => {
    it("requires notifications.view to list events and filters by status", async () => {
      const t = createTest();
      const guard = await createUser(t, "GUARD");
      const monitor = await createUser(t, "ADMIN", {}, [PERMISSIONS.NOTIFICATIONS_VIEW]);
      const noPermission = await createUser(t, "ADMIN");
      await insertProcessingEvent(t, guard.userId, { status: "DEAD_LETTER", failed_at: T0 });
      await insertProcessingEvent(t, guard.userId);
      const args = {
        status: "DEAD_LETTER" as const,
        paginationOpts: { numItems: 10, cursor: null },
      };

      await expect(noPermission.as.query(api.notifications.adminList, args)).rejects.toThrow(
        "Missing permission: notifications.view",
      );
      const listed = await monitor.as.query(api.notifications.adminList, args);
      expect(listed.page.map((event) => event.status)).toEqual(["DEAD_LETTER"]);
      expect(listed.isDone).toBe(true);
    });
  });
});
