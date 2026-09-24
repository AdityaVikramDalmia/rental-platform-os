import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_newsletter";
process.env.WORKOS_API_KEY ??= "sk_test_authz";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_newsletter";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const T0 = Date.parse("2026-06-10T04:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTest>;

function subscribe(
  t: TestBackend,
  email: string,
  extra: { source_page?: string; ip?: string } = {},
) {
  return t.mutation(internal.newsletterSubscriptions.subscribe, { email, ...extra });
}

async function readRows(t: TestBackend) {
  return await t.run(async (ctx) => ctx.db.query("newsletter_subscriptions").collect());
}

describe("newsletterSubscriptions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("subscribe", () => {
    it("stores a trimmed, lower-cased email and reuses the row on re-subscribe", async () => {
      const t = createTest();

      const id = await subscribe(t, "  Priya.S@Example.COM ", { source_page: "homepage" });
      await t.run(async (ctx) => ctx.db.patch(id, { is_deleted: true }));
      vi.setSystemTime(T0 + 60_000);
      const again = await subscribe(t, "priya.s@example.com", { source_page: "homepage" });

      expect(again).toBe(id);
      const rows = await readRows(t);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        email: "priya.s@example.com",
        subscribed_at: T0 + 60_000,
        is_deleted: false,
      });
    });

    // Characterisation of current behaviour, not an endorsement: P15-E01 acceptance criterion 3 says source_page is set on insert only, which loses first-touch attribution.
    it("currently overwrites the original source_page on re-subscribe", async () => {
      const t = createTest();

      await subscribe(t, "reader@example.com", { source_page: "homepage" });
      await subscribe(t, "reader@example.com", { source_page: "contact_hub" });
      expect((await readRows(t))[0]?.source_page).toBe("contact_hub");

      await subscribe(t, "reader@example.com");
      expect((await readRows(t))[0]?.source_page).toBeUndefined();
    });

    it("rejects a malformed address without storing it", async () => {
      const t = createTest();

      for (const email of ["", "no-at-sign.com", "two words@example.com", "user@nodot"]) {
        await expect(subscribe(t, email)).rejects.toThrow("Invalid email address");
      }
      expect(await readRows(t)).toEqual([]);
    });

    // Characterisation of current behaviour, not an endorsement: one shared budget lets anyone block every visitor's sign-up with 10 requests an hour.
    it("currently caps sign-ups site-wide at 10 per hour through the shared 'global' key", async () => {
      const t = createTest();

      for (let index = 0; index < 10; index += 1) {
        await subscribe(t, `reader${index}@example.com`, { ip: `203.0.113.${index}` });
      }
      // A new address from a new IP is still refused: the budget is shared by every visitor.
      await expect(subscribe(t, "newcomer@example.com", { ip: "198.51.100.1" })).rejects.toThrow(
        /RateLimited/,
      );
      expect(await readRows(t)).toHaveLength(10);

      vi.setSystemTime(T0 + HOUR);
      await expect(
        subscribe(t, "newcomer@example.com", { ip: "198.51.100.1" }),
      ).resolves.toBeTruthy();
    });

    it("does not charge the hourly budget for attempts that are rejected", async () => {
      const t = createTest();

      for (let index = 0; index < 12; index += 1) {
        await expect(subscribe(t, `broken-${index}`)).rejects.toThrow("Invalid email address");
      }

      await expect(subscribe(t, "valid@example.com")).resolves.toBeTruthy();
    });
  });
});
