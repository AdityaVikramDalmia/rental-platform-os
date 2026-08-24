import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { SYSTEM_CONFIG_KEYS } from "../lib/constants";
import schema from "./schema";
import { getSystemConfigBoolean, getSystemConfigStringArray } from "./systemConfig.helpers";

async function insertAdminAndConfig(
  t: ReturnType<typeof convexTest>,
  key: (typeof SYSTEM_CONFIG_KEYS)[keyof typeof SYSTEM_CONFIG_KEYS],
  value: string,
) {
  await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      workos_user_id: `workos-system-config-helper-${key}`,
      user_type: "ADMIN",
      name: "System Config Helper Admin",
      email: `system-config-helper-${key}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });

    await ctx.db.insert("system_config", {
      key,
      value,
      updated_by_admin_id: adminId,
    });
  });
}

describe("systemConfig.helpers", () => {
  it("getSystemConfigBoolean parses strict boolean values", async () => {
    const t = convexTest(schema);

    await insertAdminAndConfig(
      t,
      SYSTEM_CONFIG_KEYS.INCENTIVE_V3_SHADOW_MODE_ENABLED,
      JSON.stringify(true),
    );

    const parsed = await t.run(async (ctx) => {
      return await getSystemConfigBoolean(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_V3_SHADOW_MODE_ENABLED);
    });

    expect(parsed).toBe(true);
  });

  it('getSystemConfigBoolean accepts string literals "true" and "false" only', async () => {
    const t = convexTest(schema);

    await insertAdminAndConfig(t, SYSTEM_CONFIG_KEYS.CHAT_PII_FAIL_ACTION, JSON.stringify("false"));

    const parsed = await t.run(async (ctx) => {
      return await getSystemConfigBoolean(ctx, SYSTEM_CONFIG_KEYS.CHAT_PII_FAIL_ACTION);
    });

    expect(parsed).toBe(false);
  });

  it("getSystemConfigBoolean throws for malformed values", async () => {
    const t = convexTest(schema);

    await insertAdminAndConfig(t, SYSTEM_CONFIG_KEYS.CHAT_AI_MODEL, JSON.stringify(1));

    await expect(
      t.run(async (ctx) => {
        return await getSystemConfigBoolean(ctx, SYSTEM_CONFIG_KEYS.CHAT_AI_MODEL);
      }),
    ).rejects.toThrow("must be a boolean or");
  });

  it("getSystemConfigBoolean returns default when key is missing", async () => {
    const t = convexTest(schema);

    const parsed = await t.run(async (ctx) => {
      return await getSystemConfigBoolean(
        ctx,
        SYSTEM_CONFIG_KEYS.INCENTIVE_V3_SHADOW_MODE_ENABLED,
        false,
      );
    });

    expect(parsed).toBe(false);
  });

  it("getSystemConfigStringArray parses JSON arrays of strings", async () => {
    const t = convexTest(schema);

    await insertAdminAndConfig(
      t,
      SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS,
      JSON.stringify(["user_1", "user_2"]),
    );

    const parsed = await t.run(async (ctx) => {
      return await getSystemConfigStringArray(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS);
    });

    expect(parsed).toEqual(["user_1", "user_2"]);
  });

  it("getSystemConfigStringArray rejects non-array values", async () => {
    const t = convexTest(schema);

    await insertAdminAndConfig(
      t,
      SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS,
      JSON.stringify({ canary: true }),
    );

    await expect(
      t.run(async (ctx) => {
        return await getSystemConfigStringArray(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS);
      }),
    ).rejects.toThrow("JSON array of strings");
  });

  it("getSystemConfigStringArray rejects non-string array entries", async () => {
    const t = convexTest(schema);

    await insertAdminAndConfig(
      t,
      SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS,
      JSON.stringify(["user_1", 2]),
    );

    await expect(
      t.run(async (ctx) => {
        return await getSystemConfigStringArray(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS);
      }),
    ).rejects.toThrow("JSON array of strings");
  });

  it("getSystemConfigStringArray returns default when key is missing", async () => {
    const t = convexTest(schema);

    const parsed = await t.run(async (ctx) => {
      return await getSystemConfigStringArray(ctx, SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS, [
        "fallback_user",
      ]);
    });

    expect(parsed).toEqual(["fallback_user"]);
  });
});
