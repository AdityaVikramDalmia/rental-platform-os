import { v } from "convex/values";
import { internalMutation } from "./functions";
import { rateLimiter } from "./rateLimiter";

export const subscribe = internalMutation({
  args: {
    email: v.string(),
    source_page: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const ip = args.ip?.trim();

    if (ip) {
      await rateLimiter.limit(ctx, "public:newsletter_subscribe", {
        key: `ip:${ip}`,
        throws: true,
      });
    }

    await rateLimiter.limit(ctx, "public:newsletter_subscribe", {
      key: "global",
      throws: true,
    });

    await rateLimiter.limit(ctx, "public:newsletter_subscribe", {
      key: `email:${email}`,
      throws: true,
    });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address");
    }

    // Check for any existing row (including soft-deleted) to maintain true idempotency
    const existing = await ctx.db
      .query("newsletter_subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        subscribed_at: Date.now(),
        source_page: args.source_page,
        is_deleted: false,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("newsletter_subscriptions", {
      email,
      source_page: args.source_page,
      subscribed_at: Date.now(),
      is_deleted: false,
    });

    return id;
  },
});
