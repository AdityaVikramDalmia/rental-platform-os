// HTTP edge: Razorpay webhook signature checks, the internal notification webhook, and the
// shared-secret gate on public routes. Requests go through convex-test's t.fetch.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_http_edge";
process.env.WORKOS_API_KEY ??= "sk_test_http_edge";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_http_edge";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const RAZORPAY_PATH = "/api/payments/razorpay/webhook";
const NOTIFICATION_WEBHOOK_PATH = "/api/notifications/webhook";
const NEWSLETTER_PATH = "/api/public/newsletter-subscribe";
const RAZORPAY_SECRET = "rzp_webhook_test_secret";

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

// Razorpay's side of the protocol: hex HMAC-SHA256 of the exact request body.
async function sign(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function postRazorpay(
  t: ReturnType<typeof createTest>,
  body: string,
  signature?: string,
): Promise<Response> {
  return await t.fetch(RAZORPAY_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "x-razorpay-signature": signature } : {}),
    },
    body,
  });
}

function postJson(
  t: ReturnType<typeof createTest>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return t.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const capturedEvent = {
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_123", order_id: "order_456", amount: 49900 } } },
};

describe("http", () => {
  beforeEach(() => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", RAZORPAY_SECRET);
    vi.stubEnv("INTERNAL_API_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe(`POST ${RAZORPAY_PATH}`, () => {
    it("answers 500 when the webhook secret is not configured", async () => {
      vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
      const t = createTest();
      const body = JSON.stringify(capturedEvent);

      const response = await postRazorpay(t, body, await sign(RAZORPAY_SECRET, body));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Not configured" });
    });

    it("rejects a missing signature with 400 and a wrong one with 401", async () => {
      const t = createTest();
      const body = JSON.stringify(capturedEvent);

      const unsigned = await postRazorpay(t, body);
      expect(unsigned.status).toBe(400);
      expect(await unsigned.json()).toEqual({ error: "Missing signature" });

      const forged = await postRazorpay(t, body, await sign("some-other-secret", body));
      expect(forged.status).toBe(401);
      expect(await forged.json()).toEqual({ error: "Invalid signature" });
      expect(console.info).not.toHaveBeenCalled();
    });

    it("verifies the signature over the raw body, so a re-serialized payload is refused", async () => {
      const t = createTest();
      const compact = JSON.stringify(capturedEvent);
      const signature = await sign(RAZORPAY_SECRET, compact);

      const reformatted = await postRazorpay(t, JSON.stringify(capturedEvent, null, 2), signature);
      expect(reformatted.status).toBe(401);

      const original = await postRazorpay(t, compact, signature);
      expect(original.status).toBe(200);
      expect(await original.json()).toEqual({ status: "ok" });
    });

    it("routes payment.captured to its handler and 400s when its fields are missing", async () => {
      const t = createTest();
      const body = JSON.stringify(capturedEvent);

      const response = await postRazorpay(t, body, await sign(RAZORPAY_SECRET, body));
      expect(response.status).toBe(200);
      expect(console.info).toHaveBeenCalledWith("[monetization] payment.captured stub", {
        payment_id: "pay_123",
        order_id: "order_456",
        amount_paise: 49900,
      });

      const noAmount = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_123", order_id: "order_456" } } },
      });
      const rejected = await postRazorpay(t, noAmount, await sign(RAZORPAY_SECRET, noAmount));
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ error: "Missing payment.captured fields" });
    });

    it("acknowledges an unknown event with 200 and refuses a signed body with no event", async () => {
      const t = createTest();
      const unknown = JSON.stringify({ event: "subscription.charged", payload: {} });

      const acknowledged = await postRazorpay(t, unknown, await sign(RAZORPAY_SECRET, unknown));
      expect(acknowledged.status).toBe(200);
      expect(await acknowledged.json()).toEqual({ status: "ok" });
      expect(console.info).not.toHaveBeenCalled();

      const eventless = JSON.stringify({ payload: {} });
      const refused = await postRazorpay(t, eventless, await sign(RAZORPAY_SECRET, eventless));
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({ error: "Missing event" });
    });
  });

  describe(`POST ${NOTIFICATION_WEBHOOK_PATH}`, () => {
    it("refuses with 403 while INTERNAL_API_SECRET is unset, whatever the caller sends", async () => {
      const t = createTest();

      const response = await postJson(
        t,
        NOTIFICATION_WEBHOOK_PATH,
        { provider_message_id: "sms-1", status: "DELIVERED" },
        { "x-internal-secret": "" },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Notification webhook secret not configured",
      });
    });

    it("requires the shared secret and applies a valid delivery report", async () => {
      vi.stubEnv("INTERNAL_API_SECRET", "internal-test-secret");
      const t = createTest();
      const eventId = await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {
          workos_user_id: "user_http_webhook",
          user_type: "GUARD",
          name: "Webhook Guard",
          status: "ACTIVE",
          must_change_password: false,
        });
        return await ctx.db.insert("notification_events", {
          user_id: userId,
          event_type: "lead_verified",
          category: "LEAD_UPDATE",
          severity: "NORMAL",
          status: "PROCESSING",
          channels: ["IN_APP", "SMS"],
          payload: {},
          channel_status: {
            IN_APP: { status: "DELIVERED", attempt_count: 0 },
            SMS: { status: "SCHEDULED", attempt_count: 1, provider_message_id: "sms-1" },
          },
          retry_count: 0,
          is_deleted: false,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      });
      const report = { provider_message_id: "sms-1", status: "delivered" };

      const wrongSecret = await postJson(t, NOTIFICATION_WEBHOOK_PATH, report, {
        "x-internal-secret": "guess",
      });
      expect(wrongSecret.status).toBe(401);
      const incomplete = await postJson(
        t,
        NOTIFICATION_WEBHOOK_PATH,
        { provider_message_id: "sms-1", status: "bounced" },
        { "x-internal-secret": "internal-test-secret" },
      );
      expect(incomplete.status).toBe(400);
      expect((await t.run(async (ctx) => ctx.db.get(eventId)))?.status).toBe("PROCESSING");

      const accepted = await postJson(t, NOTIFICATION_WEBHOOK_PATH, report, {
        "x-internal-secret": "internal-test-secret",
      });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toEqual({ ok: true });
      expect((await t.run(async (ctx) => ctx.db.get(eventId)))?.status).toBe("DELIVERED");
    });
  });

  describe(`POST ${NEWSLETTER_PATH}`, () => {
    it("accepts sign-ups without a header while the secret is unset and requires it once set", async () => {
      const t = createTest();
      const open = await postJson(t, NEWSLETTER_PATH, { email: "Reader@Example.com" });
      expect(open.status).toBe(200);
      expect(await open.json()).toMatchObject({ id: expect.any(String) });

      vi.stubEnv("INTERNAL_API_SECRET", "internal-test-secret");
      const closed = await postJson(t, NEWSLETTER_PATH, { email: "second@example.com" });
      expect(closed.status).toBe(401);
      const withSecret = await postJson(
        t,
        NEWSLETTER_PATH,
        { email: "second@example.com" },
        { "x-internal-secret": "internal-test-secret" },
      );
      expect(withSecret.status).toBe(200);

      const stored = await t.run(async (ctx) => ctx.db.query("newsletter_subscriptions").collect());
      expect(stored.map((row) => row.email).sort()).toEqual([
        "reader@example.com",
        "second@example.com",
      ]);
    });

    it("maps a malformed email to 400 and malformed JSON to 400", async () => {
      const t = createTest();

      const badEmail = await postJson(t, NEWSLETTER_PATH, { email: "not-an-email" });
      expect(badEmail.status).toBe(400);
      expect(await badEmail.json()).toEqual({ error: "Invalid email address" });

      const badJson = await t.fetch(NEWSLETTER_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      });
      expect(badJson.status).toBe(400);
      expect(await badJson.json()).toEqual({ error: "Invalid JSON" });
    });
  });
});
