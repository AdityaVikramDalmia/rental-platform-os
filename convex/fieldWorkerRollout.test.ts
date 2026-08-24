import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import {
  assertOpsFieldWorkerEnabledForUser,
  isOpsFieldWorkerEnabledForUser,
  resolveP44RolloutState,
} from "./fieldWorkerRollout";
import schema from "./schema";
import { createOpsFixture, setRolloutState } from "./testUtils/fieldWorkerFixtures";

describe("fieldWorkerRollout", () => {
  it("resolveP44RolloutState returns DISABLED when flag is false and canary list is empty", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await setRolloutState(ctx, "DISABLED");
    });

    const rolloutState = await t.run(async (ctx) => {
      return await resolveP44RolloutState(ctx);
    });

    expect(rolloutState).toBe("DISABLED");
  });

  it("resolveP44RolloutState returns CANARY when flag is false and canary list has users", async () => {
    const t = convexTest(schema);

    const ops = await t.run(async (ctx) => {
      return await createOpsFixture(ctx);
    });

    await t.run(async (ctx) => {
      await setRolloutState(ctx, "CANARY", [ops.userId]);
    });

    const rolloutState = await t.run(async (ctx) => {
      return await resolveP44RolloutState(ctx);
    });

    expect(rolloutState).toBe("CANARY");
  });

  it("resolveP44RolloutState returns ENABLED when global flag is true", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await setRolloutState(ctx, "ENABLED");
    });

    const rolloutState = await t.run(async (ctx) => {
      return await resolveP44RolloutState(ctx);
    });

    expect(rolloutState).toBe("ENABLED");
  });

  it("resolveP44RolloutState ignores malformed canary config when global flag is enabled", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await setRolloutState(ctx, "ENABLED");

      const canaryConfig = await ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", "ops_field_worker_canary_user_ids"))
        .first();

      if (!canaryConfig) {
        throw new Error("Missing canary config");
      }

      await ctx.db.patch(canaryConfig._id, {
        value: "{malformed",
      });
    });

    const rolloutState = await t.run(async (ctx) => {
      return await resolveP44RolloutState(ctx);
    });

    expect(rolloutState).toBe("ENABLED");
  });

  it("isOpsFieldWorkerEnabledForUser returns false in disabled mode", async () => {
    const t = convexTest(schema);

    const ops = await t.run(async (ctx) => {
      const fixture = await createOpsFixture(ctx);
      await setRolloutState(ctx, "DISABLED");
      return fixture;
    });

    const isEnabled = await t.run(async (ctx) => {
      return await isOpsFieldWorkerEnabledForUser(ctx, ops.userId);
    });

    expect(isEnabled).toBe(false);
  });

  it("isOpsFieldWorkerEnabledForUser allows only canary users in canary mode", async () => {
    const t = convexTest(schema);

    const [allowedOps, blockedOps] = await t.run(async (ctx) => {
      const allowed = await createOpsFixture(ctx);
      const blocked = await createOpsFixture(ctx);
      await setRolloutState(ctx, "CANARY", [allowed.userId]);
      return [allowed, blocked] as const;
    });

    const [allowed, blocked] = await t.run(async (ctx) => {
      return await Promise.all([
        isOpsFieldWorkerEnabledForUser(ctx, allowedOps.userId),
        isOpsFieldWorkerEnabledForUser(ctx, blockedOps.userId),
      ]);
    });

    expect(allowed).toBe(true);
    expect(blocked).toBe(false);
  });

  it("isOpsFieldWorkerEnabledForUser allows all users in enabled mode", async () => {
    const t = convexTest(schema);

    const ops = await t.run(async (ctx) => {
      const fixture = await createOpsFixture(ctx);
      await setRolloutState(ctx, "ENABLED");
      return fixture;
    });

    const isEnabled = await t.run(async (ctx) => {
      return await isOpsFieldWorkerEnabledForUser(ctx, ops.userId);
    });

    expect(isEnabled).toBe(true);
  });

  it("isOpsFieldWorkerEnabledForUser ignores malformed canary config when global flag is enabled", async () => {
    const t = convexTest(schema);

    const ops = await t.run(async (ctx) => {
      const fixture = await createOpsFixture(ctx);
      await setRolloutState(ctx, "ENABLED");

      const canaryConfig = await ctx.db
        .query("system_config")
        .withIndex("by_key", (q) => q.eq("key", "ops_field_worker_canary_user_ids"))
        .first();

      if (!canaryConfig) {
        throw new Error("Missing canary config");
      }

      await ctx.db.patch(canaryConfig._id, {
        value: "{malformed",
      });

      return fixture;
    });

    const isEnabled = await t.run(async (ctx) => {
      return await isOpsFieldWorkerEnabledForUser(ctx, ops.userId);
    });

    expect(isEnabled).toBe(true);
  });

  it("assertOpsFieldWorkerEnabledForUser throws in blocked states and passes when enabled", async () => {
    const t = convexTest(schema);

    const [allowedOps, blockedOps] = await t.run(async (ctx) => {
      const allowed = await createOpsFixture(ctx);
      const blocked = await createOpsFixture(ctx);
      await setRolloutState(ctx, "CANARY", [allowed.userId]);
      return [allowed, blocked] as const;
    });

    await expect(
      t.run(async (ctx) => {
        await assertOpsFieldWorkerEnabledForUser(ctx, blockedOps.userId);
      }),
    ).rejects.toThrow("Feature not enabled");

    await expect(
      t.run(async (ctx) => {
        await assertOpsFieldWorkerEnabledForUser(ctx, allowedOps.userId);
      }),
    ).resolves.toBeNull();
  });
});
