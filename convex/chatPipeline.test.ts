// Deal-room chat pipeline: send → batch → AI rewrite (OpenAI stubbed via fetch) → deliver/fail,
// plus what each viewer is allowed to read and how moderators resolve failed messages.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_chat_pipeline";
process.env.WORKOS_API_KEY ??= "sk_test_chat_pipeline";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_chat_pipeline";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.parse("2026-04-01T06:00:00.000Z");
const PAGE = { numItems: 50, cursor: null };

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTest>;

// Admin (all chat permissions), a view-only OPS agent, the inquiry's tenant, the listing owner,
// and one plain (non-negotiation) channel on that inquiry.
async function createChatFixture(t: TestBackend) {
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const insertUser = (workosUserId: string, userType: UserType) =>
      ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: userType,
        name: `Test ${workosUserId}`,
        email: `${workosUserId}@example.com`,
        status: "ACTIVE",
        must_change_password: false,
      });
    const grant = async (userId: Id<"users">, permissions: string[]) => {
      const roleId = await ctx.db.insert("roles", {
        name: `role for ${userId}`,
        permissions,
        is_system_role: false,
        is_deleted: false,
      });
      await ctx.db.insert("user_role_assignments", {
        user_id: userId,
        role_id: roleId,
        assigned_by_admin_id: userId,
        is_deleted: false,
      });
    };

    const adminId = await insertUser("user_chat_admin", "ADMIN");
    const viewerId = await insertUser("user_chat_viewer", "OPS");
    const tenantId = await insertUser("user_chat_tenant", "TENANT");
    const ownerUserId = await insertUser("user_chat_owner", "OWNER");
    const guardId = await insertUser("user_chat_guard", "GUARD");
    await grant(adminId, [
      PERMISSIONS.CHAT_VIEW,
      PERMISSIONS.CHAT_SEND,
      PERMISSIONS.CHAT_MODERATE,
      PERMISSIONS.CHAT_ADMIN,
    ]);
    await grant(viewerId, [PERMISSIONS.CHAT_VIEW]);

    const ownerId = await ctx.db.insert("owners", {
      phone: "9111111111",
      user_id: ownerUserId,
      source: "OPS_CREATED",
      active_properties_count: 1,
      total_leads_count: 0,
      total_closures_count: 0,
      lifecycle_stage: "ACTIVE",
      lifecycle_updated_at: now,
      first_seen_at: now,
      last_activity_at: now,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });
    const societyId = await ctx.db.insert("societies", {
      name: "Chat Society",
      city: "Mumbai",
      status: "ACTIVE",
      created_by_admin_id: adminId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower A",
      total_floors: 10,
      floor_labels: ["1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "2",
      flat_number: "201",
      owner_phone: "9111111111",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: guardId,
      status: "VERIFIED",
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerId,
      slug: "chat-2bhk",
      status: "PUBLISHED",
      rent_monthly: 3_000_000,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "2",
      available_from: now,
      created_by_admin_id: adminId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenantId,
      tenant_name: "Chat Tenant",
      tenant_phone: "9123456780",
      status: "VISIT_COMPLETED",
    });
    const channelId = await ctx.db.insert("chat_channels", {
      inquiry_id: inquiryId,
      status: "ACTIVE",
      created_by_admin_id: adminId,
      created_at: now,
    });
    return { adminId, viewerId, tenantId, ownerUserId, channelId };
  });

  const as = (subject: string) => t.withIdentity({ subject, issuer: WORKOS_ISSUER });
  return {
    ...ids,
    admin: as("user_chat_admin"),
    viewer: as("user_chat_viewer"),
    tenant: as("user_chat_tenant"),
    owner: as("user_chat_owner"),
  };
}

type Fixture = Awaited<ReturnType<typeof createChatFixture>>;

async function insertMessage(
  t: TestBackend,
  fixture: Fixture,
  overrides: Partial<Doc<"chat_messages">> & { original_content: string },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("chat_messages", {
      channel_id: fixture.channelId,
      sender_user_id: fixture.tenantId,
      sender_role: "TENANT",
      status: "SUBMITTED",
      admin_review_required: false,
      is_ai_processed: false,
      created_at: Date.now(),
      ...overrides,
    }),
  );
}

async function setConfig(t: TestBackend, fixture: Fixture, key: string, value: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("system_config", {
      key: key as Doc<"system_config">["key"],
      value,
      updated_by_admin_id: fixture.adminId,
    });
  });
}

// Queues each SUBMITTED message and closes the batch, leaving it PROCESSING.
async function processingBatchFor(t: TestBackend, fixture: Fixture, contents: string[]) {
  const messageIds: Id<"chat_messages">[] = [];
  for (const content of contents) {
    messageIds.push(await insertMessage(t, fixture, { original_content: content }));
  }
  let batchId: Id<"chat_message_batches"> | null = null;
  for (const messageId of messageIds) {
    batchId = await t.mutation(internal.chatBatching.queueMessage, {
      message_id: messageId,
      channel_id: fixture.channelId,
      sender_user_id: fixture.tenantId,
    });
  }
  if (!batchId) throw new Error("no batch created");
  await t.mutation(internal.chatBatching.processBatch, { batch_id: batchId });
  return { batchId, messageIds };
}

function stubOpenAI(reply: { rewritten_text: string; pii_detected?: unknown[] }) {
  const requests: string[] = [];
  const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
    requests.push(String(init?.body ?? ""));
    return new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 0,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                rewritten_text: reply.rewritten_text,
                pii_detected: reply.pii_detected ?? [],
                has_pii: (reply.pii_detected ?? []).length > 0,
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
}

async function readMessages(t: TestBackend, ids: Id<"chat_messages">[]) {
  return await t.run(async (ctx) => Promise.all(ids.map((id) => ctx.db.get(id))));
}

describe("chat pipeline", () => {
  beforeEach(() => {
    // Scheduled batching/AI jobs only run when a test advances the fake clock.
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("chatMessages", () => {
    describe("send", () => {
      it("stores the trimmed text as SUBMITTED and queues it into the sender's batch", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);

        const messageId = await fixture.tenant.mutation(api.chatMessages.send, {
          channel_id: fixture.channelId,
          content: "  Is the flat still available?  ",
        });
        const [submitted] = await readMessages(t, [messageId]);
        expect(submitted).toMatchObject({
          original_content: "Is the flat still available?",
          status: "SUBMITTED",
          sender_role: "TENANT",
          is_ai_processed: false,
        });

        vi.advanceTimersByTime(0);
        await t.finishInProgressScheduledFunctions();

        const [batched] = await readMessages(t, [messageId]);
        expect(batched?.status).toBe("BATCHED");
        const batch = await t.run(async (ctx) =>
          batched?.batch_id ? ctx.db.get(batched.batch_id) : null,
        );
        expect(batch).toMatchObject({ status: "COLLECTING", messages: [messageId] });
        const audit = await t.run(async (ctx) =>
          ctx.db
            .query("audit_logs")
            .filter((q) => q.eq(q.field("action"), "tenant.message_sent"))
            .collect(),
        );
        expect(audit.map((row) => row.entity_id)).toEqual([String(messageId)]);
      });

      it("enforces the configured maximum length and falls back to 2000 on a bad value", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        await setConfig(t, fixture, "chat_max_message_length", "10");

        await expect(
          fixture.tenant.mutation(api.chatMessages.send, {
            channel_id: fixture.channelId,
            content: "12345678901",
          }),
        ).rejects.toThrow("Message exceeds max length of 10 characters");
        await expect(
          fixture.tenant.mutation(api.chatMessages.send, {
            channel_id: fixture.channelId,
            content: "  1234567890  ",
          }),
        ).resolves.toBeTruthy();

        await t.run(async (ctx) => {
          const row = await ctx.db
            .query("system_config")
            .withIndex("by_key", (q) => q.eq("key", "chat_max_message_length"))
            .first();
          if (row) await ctx.db.patch(row._id, { value: "not-a-number" });
        });
        await expect(
          fixture.tenant.mutation(api.chatMessages.send, {
            channel_id: fixture.channelId,
            content: "x".repeat(2001),
          }),
        ).rejects.toThrow("Message exceeds max length of 2000 characters");
      });

      it("rejects blank messages and messages to an archived channel", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);

        await expect(
          fixture.tenant.mutation(api.chatMessages.send, {
            channel_id: fixture.channelId,
            content: "   ",
          }),
        ).rejects.toThrow("Message content is required");

        await fixture.admin.mutation(api.chatChannels.archive, { id: fixture.channelId });
        await expect(
          fixture.tenant.mutation(api.chatMessages.send, {
            channel_id: fixture.channelId,
            content: "hello",
          }),
        ).rejects.toThrow("Cannot send messages to an archived channel");
      });

      it("limits a sender to 20 messages per minute and reopens when the clock moves on", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const send = (content: string) =>
          fixture.tenant.mutation(api.chatMessages.send, {
            channel_id: fixture.channelId,
            content,
          });

        for (let index = 0; index < 20; index += 1) {
          await send(`message ${index}`);
        }
        await expect(send("message 21")).rejects.toThrow(/RateLimited.*chat:send_message/);
        // The owner has their own budget.
        await expect(
          fixture.owner.mutation(api.chatMessages.send, {
            channel_id: fixture.channelId,
            content: "owner reply",
          }),
        ).resolves.toBeTruthy();

        vi.setSystemTime(T0 + 60_000);
        await expect(send("next minute")).resolves.toBeTruthy();
      });
    });

    describe("listByChannel", () => {
      it("shows other participants only the masked text, and the sender their own original", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        await insertMessage(t, fixture, {
          original_content: "Call me on 9876543210",
          masked_content: "Call me on [PHONE]",
          status: "DELIVERED",
          is_ai_processed: true,
        });
        await insertMessage(t, fixture, {
          original_content: "my email is a@b.co",
          status: "FAILED",
          failure_reason: "Post-check detected residual PII in AI output",
          admin_review_required: true,
        });
        await insertMessage(t, fixture, {
          original_content: "still in the batch",
          status: "BATCHED",
        });

        const ownerView = await fixture.owner.query(api.chatMessages.listByChannel, {
          channel_id: fixture.channelId,
          paginationOpts: PAGE,
        });
        const byStatus = Object.fromEntries(ownerView.page.map((m) => [m.status, m]));
        expect(byStatus.DELIVERED?.original_content).toBe("Call me on [PHONE]");
        expect(byStatus.FAILED).toMatchObject({
          original_content: "Message unavailable",
          admin_review_required: false,
        });
        expect(byStatus.FAILED?.failure_reason).toBeUndefined();
        expect(byStatus.BATCHED?.original_content).toBe("Message processing...");

        const tenantView = await fixture.tenant.query(api.chatMessages.listByChannel, {
          channel_id: fixture.channelId,
          paginationOpts: PAGE,
        });
        expect(tenantView.page.map((m) => m.original_content).sort()).toEqual(
          ["Call me on 9876543210", "my email is a@b.co", "still in the batch"].sort(),
        );
      });

      it("hides soft-deleted messages from parties but not from backoffice monitors", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const messageId = await insertMessage(t, fixture, {
          original_content: "rude message",
          masked_content: "rude message",
          status: "DELIVERED",
        });
        await fixture.admin.mutation(api.chatMessages.softDeleteMessage, { message_id: messageId });

        const ownerView = await fixture.owner.query(api.chatMessages.listByChannel, {
          channel_id: fixture.channelId,
          paginationOpts: PAGE,
        });
        expect(ownerView.page).toHaveLength(0);
        const monitorView = await fixture.viewer.query(api.chatMessages.listByChannel, {
          channel_id: fixture.channelId,
          paginationOpts: PAGE,
        });
        expect(monitorView.page.map((m) => m._id)).toEqual([messageId]);
      });
    });

    describe("getById", () => {
      it("masks another participant's message and returns the caller's own message raw", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const messageId = await insertMessage(t, fixture, {
          original_content: "whatsapp 9876543210",
          masked_content: "whatsapp [WHATSAPP]",
          status: "DELIVERED",
        });

        const asOwner = await fixture.owner.query(api.chatMessages.getById, { id: messageId });
        expect(asOwner?.original_content).toBe("whatsapp [WHATSAPP]");
        const asTenant = await fixture.tenant.query(api.chatMessages.getById, { id: messageId });
        expect(asTenant?.original_content).toBe("whatsapp 9876543210");
      });

      it.fails(
        "hides a soft-deleted message from a party, as listByChannel does (BUG-023)",
        async () => {
          const t = createTest();
          const fixture = await createChatFixture(t);
          const messageId = await insertMessage(t, fixture, {
            original_content: "removed by moderation",
            masked_content: "removed by moderation",
            status: "DELIVERED",
          });
          await fixture.admin.mutation(api.chatMessages.softDeleteMessage, {
            message_id: messageId,
          });

          const outcome = await fixture.owner
            .query(api.chatMessages.getById, { id: messageId })
            .then(
              (message) => message,
              () => null,
            );
          expect(outcome).toBeNull();
        },
      );
    });
  });

  describe("chatBatching", () => {
    describe("queueMessage", () => {
      it("collects one sender's messages into a single batch and gives another sender their own", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const first = await insertMessage(t, fixture, { original_content: "first" });
        const second = await insertMessage(t, fixture, { original_content: "second" });
        const fromOwner = await insertMessage(t, fixture, {
          original_content: "owner",
          sender_user_id: fixture.ownerUserId,
          sender_role: "OWNER",
        });
        const queue = (messageId: Id<"chat_messages">, senderId: Id<"users">) =>
          t.mutation(internal.chatBatching.queueMessage, {
            message_id: messageId,
            channel_id: fixture.channelId,
            sender_user_id: senderId,
          });

        const batchA = await queue(first, fixture.tenantId);
        expect(await queue(second, fixture.tenantId)).toBe(batchA);
        const batchB = await queue(fromOwner, fixture.ownerUserId);
        expect(batchB).not.toBe(batchA);
        // Re-queueing an already batched message is a no-op.
        expect(await queue(first, fixture.tenantId)).toBe(batchA);

        const batch = await t.run(async (ctx) => (batchA ? ctx.db.get(batchA) : null));
        expect(batch?.messages).toEqual([first, second]);
      });

      it("closes the batch after the configured window, defaulting to 5 seconds", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const scheduledCloses = async () =>
          t.run(async (ctx) =>
            (await ctx.db.system.query("_scheduled_functions").collect())
              .filter((job) => job.name.includes("processBatch"))
              .map((job) => job.scheduledTime - T0),
          );

        const first = await insertMessage(t, fixture, { original_content: "default window" });
        await t.mutation(internal.chatBatching.queueMessage, {
          message_id: first,
          channel_id: fixture.channelId,
          sender_user_id: fixture.tenantId,
        });
        expect(await scheduledCloses()).toEqual([5000]);

        await setConfig(t, fixture, "chat_batch_window_ms", "1500");
        const fromOwner = await insertMessage(t, fixture, {
          original_content: "custom window",
          sender_user_id: fixture.ownerUserId,
          sender_role: "OWNER",
        });
        await t.mutation(internal.chatBatching.queueMessage, {
          message_id: fromOwner,
          channel_id: fixture.channelId,
          sender_user_id: fixture.ownerUserId,
        });
        expect((await scheduledCloses()).sort((a, b) => a - b)).toEqual([1500, 5000]);
      });
    });

    describe("processBatch", () => {
      it("joins the messages, records pre-scan PII and moves everything to PROCESSING once", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const { batchId, messageIds } = await processingBatchFor(t, fixture, [
          "Hi, call 9876543210",
          "or mail rahul@example.com",
        ]);

        const batch = await t.run(async (ctx) => ctx.db.get(batchId));
        expect(batch).toMatchObject({
          status: "PROCESSING",
          combined_original: "Hi, call 9876543210\n\nor mail rahul@example.com",
          pii_detected: ["pre_scan:phone:9876543210", "pre_scan:email:rahul@example.com"],
          processing_started_at: T0,
        });
        expect((await readMessages(t, messageIds)).map((m) => m?.status)).toEqual([
          "PROCESSING",
          "PROCESSING",
        ]);
        expect(
          await t.mutation(internal.chatBatching.processBatch, { batch_id: batchId }),
        ).toBeNull();
      });
    });

    describe("processWithAI", () => {
      it("fails the batch into admin review when the model is not configured", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const { batchId, messageIds } = await processingBatchFor(t, fixture, ["hello there"]);

        await t.action(internal.chatBatching.processWithAI, { batch_id: batchId });

        const batch = await t.run(async (ctx) => ctx.db.get(batchId));
        expect(batch).toMatchObject({
          status: "FAILED",
          failure_reason: "AI rewrite failed: OPENAI_API_KEY is not configured",
        });
        const [message] = await readMessages(t, messageIds);
        expect(message).toMatchObject({ status: "FAILED", admin_review_required: true });
      });

      it("skips admin review for a failed batch when the fail action is auto_reject", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        await setConfig(t, fixture, "chat_pii_fail_action", " AUTO_REJECT ");
        const { batchId, messageIds } = await processingBatchFor(t, fixture, ["hello there"]);

        await t.action(internal.chatBatching.processWithAI, { batch_id: batchId });

        const [message] = await readMessages(t, messageIds);
        expect(message).toMatchObject({ status: "FAILED", admin_review_required: false });
      });

      it("sends only pre-masked text to the model and delivers its rewrite to the first message", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        vi.stubEnv("OPENAI_API_KEY", "sk-test-not-real");
        const { requests } = stubOpenAI({
          rewritten_text: "Hi, please call me on [PHONE]. Can we visit Saturday?",
          pii_detected: [{ type: "phone", original: "[PHONE]", replacement: "[PHONE]" }],
        });
        const { batchId, messageIds } = await processingBatchFor(t, fixture, [
          "Hi call me on 9812345678",
          "can we visit saturday",
        ]);

        await t.action(internal.chatBatching.processWithAI, { batch_id: batchId });

        expect(requests).toHaveLength(1);
        expect(requests[0]).not.toContain("9812345678");
        const body = JSON.parse(requests[0]) as {
          messages: Array<{ role: string; content: string }>;
        };
        const userTurn = body.messages.find((message) => message.role === "user");
        expect(JSON.parse(userTurn?.content ?? "{}")).toEqual({
          pre_masked_text: "Hi call me on [PHONE]\n\ncan we visit saturday",
        });
        const batch = await t.run(async (ctx) => ctx.db.get(batchId));
        expect(batch?.status).toBe("DELIVERED");
        expect(batch?.pii_detected).toEqual([
          "pre_scan:phone:9812345678",
          "ai_reported:phone:[PHONE]",
        ]);
        const [first, second] = await readMessages(t, messageIds);
        expect(first).toMatchObject({
          status: "DELIVERED",
          masked_content: "Hi, please call me on [PHONE]. Can we visit Saturday?",
          is_ai_processed: true,
          delivered_at: T0,
        });
        expect(second?.masked_content).toBe("[Combined with previous message]");
      });

      it("fails the batch when the model's rewrite still contains a phone number", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        vi.stubEnv("OPENAI_API_KEY", "sk-test-not-real");
        stubOpenAI({ rewritten_text: "Sure, ring 9123456780 anytime" });
        const { batchId, messageIds } = await processingBatchFor(t, fixture, ["ring me"]);

        await t.action(internal.chatBatching.processWithAI, { batch_id: batchId });

        const batch = await t.run(async (ctx) => ctx.db.get(batchId));
        expect(batch).toMatchObject({
          status: "FAILED",
          failure_reason: "Post-check detected residual PII in AI output",
          pii_detected: ["post_check:phone:9123456780"],
        });
        const [message] = await readMessages(t, messageIds);
        expect(message?.masked_content).toBeUndefined();
        expect(message?.status).toBe("FAILED");
      });
    });

    describe("recoverStaleBatches", () => {
      it("fails batches stuck in PROCESSING for over 5 minutes and leaves recent ones alone", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const stale = await processingBatchFor(t, fixture, ["stuck"]);
        vi.setSystemTime(T0 + 60_000);
        const fresh = await t.run(async (ctx) => {
          const messageId = await ctx.db.insert("chat_messages", {
            channel_id: fixture.channelId,
            sender_user_id: fixture.ownerUserId,
            sender_role: "OWNER",
            original_content: "recent",
            status: "PROCESSING",
            admin_review_required: false,
            is_ai_processed: false,
            created_at: Date.now(),
          });
          const batchId = await ctx.db.insert("chat_message_batches", {
            channel_id: fixture.channelId,
            sender_user_id: fixture.ownerUserId,
            messages: [messageId],
            combined_original: "recent",
            status: "PROCESSING",
            created_at: Date.now(),
            processing_started_at: Date.now(),
          });
          return { batchId, messageId };
        });

        vi.setSystemTime(T0 + 5 * 60_000 + 1);
        await t.mutation(internal.chatBatching.recoverStaleBatches, {});

        const [staleBatch, freshBatch] = await t.run(async (ctx) =>
          Promise.all([ctx.db.get(stale.batchId), ctx.db.get(fresh.batchId)]),
        );
        expect(staleBatch).toMatchObject({
          status: "FAILED",
          failure_reason: "Processing timeout - batch stuck for over 5 minutes",
        });
        expect(freshBatch?.status).toBe("PROCESSING");
        const [staleMessage, freshMessage] = await readMessages(t, [
          stale.messageIds[0],
          fresh.messageId,
        ]);
        expect(staleMessage).toMatchObject({
          status: "FAILED",
          failure_reason: "Batch processing timeout",
          admin_review_required: true,
        });
        expect(freshMessage?.status).toBe("PROCESSING");
      });
    });
  });

  describe("chatAIMonitor", () => {
    async function reviewRequiredBatch(t: TestBackend, fixture: Fixture, contents: string[]) {
      const { batchId, messageIds } = await processingBatchFor(t, fixture, contents);
      await t.mutation(internal.chatBatching.failBatch, {
        batch_id: batchId,
        failure_reason: "Post-check detected residual PII in AI output",
        admin_review_required: true,
      });
      return { batchId, messageIds };
    }

    describe("approveMessage", () => {
      it("refuses content that still carries PII or exceeds 2000 characters", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const { messageIds } = await reviewRequiredBatch(t, fixture, ["call 9876543210"]);
        const approve = (approved_content: string) =>
          fixture.admin.mutation(api.chatAIMonitor.approveMessage, {
            id: messageIds[0],
            approved_content,
          });

        await expect(approve("call 9876543210")).rejects.toThrow(
          "Approved content still contains PII: PHONE",
        );
        await expect(approve("x".repeat(2001))).rejects.toThrow("exceeds maximum length (2000");
        await expect(approve("   ")).rejects.toThrow("Approved content is required");
        const [message] = await readMessages(t, messageIds);
        expect(message?.status).toBe("FAILED");
      });

      it("delivers approved text and marks the batch delivered once every message is resolved", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const { batchId, messageIds } = await reviewRequiredBatch(t, fixture, [
          "call 9876543210",
          "tomorrow works",
        ]);

        await fixture.admin.mutation(api.chatAIMonitor.approveMessage, {
          id: messageIds[0],
          approved_content: "Please call me via the platform.",
        });
        let batch = await t.run(async (ctx) => ctx.db.get(batchId));
        expect(batch?.status).toBe("FAILED");
        expect(batch?.failure_reason).toContain("batch still has unresolved failures");

        await fixture.admin.mutation(api.chatAIMonitor.approveMessage, {
          id: messageIds[1],
          approved_content: "Tomorrow works.",
        });
        batch = await t.run(async (ctx) => ctx.db.get(batchId));
        expect(batch?.status).toBe("DELIVERED");
        expect(batch?.failure_reason).toBeUndefined();
        const [first] = await readMessages(t, messageIds);
        expect(first).toMatchObject({
          status: "DELIVERED",
          masked_content: "Please call me via the platform.",
          admin_review_required: false,
        });
      });

      it("requires chat.moderate while a moderator with it can approve", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const { messageIds } = await reviewRequiredBatch(t, fixture, ["hello"]);

        await expect(
          fixture.viewer.mutation(api.chatAIMonitor.approveMessage, {
            id: messageIds[0],
            approved_content: "hello",
          }),
        ).rejects.toThrow("Missing permission: chat.moderate");
        await expect(
          fixture.admin.mutation(api.chatAIMonitor.approveMessage, {
            id: messageIds[0],
            approved_content: "hello",
          }),
        ).resolves.toMatchObject({ status: "DELIVERED" });
      });
    });

    describe("rejectMessage", () => {
      it("closes the review with a reason but keeps the message undelivered", async () => {
        const t = createTest();
        const fixture = await createChatFixture(t);
        const { messageIds } = await reviewRequiredBatch(t, fixture, ["spam"]);

        await expect(
          fixture.admin.mutation(api.chatAIMonitor.rejectMessage, {
            id: messageIds[0],
            reason: "x".repeat(501),
          }),
        ).rejects.toThrow("Rejection reason exceeds maximum length (500 characters)");
        await fixture.admin.mutation(api.chatAIMonitor.rejectMessage, {
          id: messageIds[0],
          reason: "  Contact sharing  ",
        });

        const [message] = await readMessages(t, messageIds);
        expect(message).toMatchObject({
          status: "FAILED",
          admin_review_required: false,
          failure_reason: "Contact sharing",
        });
        await expect(
          fixture.admin.mutation(api.chatAIMonitor.approveMessage, {
            id: messageIds[0],
            approved_content: "spam",
          }),
        ).rejects.toThrow("Only review-required failed messages can be approved");
      });
    });
  });
});
