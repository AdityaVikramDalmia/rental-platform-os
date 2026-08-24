import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { PERMISSIONS, USER_STATUS, USER_TYPE } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_referrals";
process.env.WORKOS_API_KEY ??= "sk_test_referrals";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_referrals";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";

async function createAdminWithReferralManagePermission(
  t: ReturnType<typeof convexTest>,
  workosUserId: string,
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: USER_TYPE.ADMIN,
      name: "Admin",
      email: `${workosUserId}@example.com`,
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });

    const roleId = await ctx.db.insert("roles", {
      name: "Referral Admin",
      permissions: [PERMISSIONS.REFERRALS_MANAGE],
      is_system_role: false,
      is_deleted: false,
    });

    await ctx.db.insert("user_role_assignments", {
      user_id: adminId,
      role_id: roleId,
      assigned_by_admin_id: adminId,
      is_deleted: false,
    });

    return adminId;
  });
}

async function createGuardUser(
  t: ReturnType<typeof convexTest>,
  options: {
    workosUserId: string;
    phone: string;
    name: string;
  },
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      workos_user_id: options.workosUserId,
      user_type: USER_TYPE.GUARD,
      name: options.name,
      phone: options.phone,
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });

    const societyId = await ctx.db.insert("societies", {
      name: `Society ${options.workosUserId}`,
      city: "Mumbai",
      status: "ACTIVE",
      created_by_admin_id: userId,
    });

    await ctx.db.insert("guard_profiles", {
      user_id: userId,
      society_id: societyId,
      guard_type: "MAIN_GATE",
      has_seen_onboarding: false,
    });

    return userId;
  });
}

async function createOpsUser(
  t: ReturnType<typeof convexTest>,
  options: {
    workosUserId: string;
    phone: string;
    name: string;
  },
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      workos_user_id: options.workosUserId,
      user_type: USER_TYPE.OPS,
      name: options.name,
      phone: options.phone,
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });
  });
}

describe("referrals guard-only scope", () => {
  it("recordGuardReferral rejects OPS referred users with explicit message", async () => {
    const t = convexTest(schema, modules);
    const adminWorkosUserId = "workos_admin_referral_scope_1";

    await createAdminWithReferralManagePermission(t, adminWorkosUserId);
    await createGuardUser(t, {
      workosUserId: "workos_guard_referrer_1",
      phone: "9000000001",
      name: "Referrer Guard",
    });
    const referredOpsId = await createOpsUser(t, {
      workosUserId: "workos_ops_referred_1",
      phone: "9000000002",
      name: "Referred OPS",
    });

    const authed = t.withIdentity({
      subject: adminWorkosUserId,
      issuer: WORKOS_ISSUER,
    });

    await expect(
      authed.mutation(api.referrals.recordGuardReferral, {
        referred_guard_user_id: referredOpsId,
        referrer_phone: "9000000001",
      }),
    ).rejects.toThrow("Guard referral is GUARD-only; OPS field workers are excluded");
  });

  it("recordGuardReferral rejects OPS referrer phone with explicit message", async () => {
    const t = convexTest(schema, modules);
    const adminWorkosUserId = "workos_admin_referral_scope_2";

    await createAdminWithReferralManagePermission(t, adminWorkosUserId);
    await createOpsUser(t, {
      workosUserId: "workos_ops_referrer_2",
      phone: "9000000011",
      name: "OPS Referrer",
    });
    const referredGuardId = await createGuardUser(t, {
      workosUserId: "workos_guard_referred_2",
      phone: "9000000012",
      name: "Referred Guard",
    });

    const authed = t.withIdentity({
      subject: adminWorkosUserId,
      issuer: WORKOS_ISSUER,
    });

    await expect(
      authed.mutation(api.referrals.recordGuardReferral, {
        referred_guard_user_id: referredGuardId,
        referrer_phone: "9000000011",
      }),
    ).rejects.toThrow("Guard referral is GUARD-only; OPS field workers are excluded");
  });

  it("recordGuardReferralInternal returns null for OPS referred users", async () => {
    const t = convexTest(schema, modules);

    await createGuardUser(t, {
      workosUserId: "workos_guard_referrer_3",
      phone: "9000000021",
      name: "Referrer Guard",
    });
    const referredOpsId = await createOpsUser(t, {
      workosUserId: "workos_ops_referred_3",
      phone: "9000000022",
      name: "Referred OPS",
    });

    const result = await t.mutation(internal.referrals.recordGuardReferralInternal, {
      referred_guard_user_id: referredOpsId,
      referrer_phone: "9000000021",
    });

    expect(result).toBeNull();
  });

  it("recordGuardReferralInternal returns null for OPS referrer phone", async () => {
    const t = convexTest(schema, modules);

    await createOpsUser(t, {
      workosUserId: "workos_ops_referrer_4",
      phone: "9000000031",
      name: "OPS Referrer",
    });
    const referredGuardId = await createGuardUser(t, {
      workosUserId: "workos_guard_referred_4",
      phone: "9000000032",
      name: "Referred Guard",
    });

    const result = await t.mutation(internal.referrals.recordGuardReferralInternal, {
      referred_guard_user_id: referredGuardId,
      referrer_phone: "9000000031",
    });

    expect(result).toBeNull();
  });
});
