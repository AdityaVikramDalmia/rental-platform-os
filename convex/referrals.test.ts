import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// DemoRentals (tenant/owner) referral codes: attribution, self-referral, the 48-hour
// new-account window, the hourly capture rate limit, and code generation.
const SIGNUP_TIME = new Date("2026-08-01T05:30:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function createReferralTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type ReferralTestBackend = ReturnType<typeof createReferralTest>;

let demoSequence = 0;

async function createDemoRentalsUser(
  t: ReferralTestBackend,
  userType: "TENANT" | "OWNER" | "ADMIN",
  options: { code?: string; permissions?: string[] } = {},
) {
  demoSequence += 1;
  const workosUserId = `workos_demo_${userType.toLowerCase()}_${demoSequence}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} ${demoSequence}`,
      email: `${workosUserId}@example.com`,
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });
    if (options.code) {
      await ctx.db.insert("referral_codes", { user_id: id, code: options.code, is_active: true });
    }
    if (options.permissions) {
      const roleId = await ctx.db.insert("roles", {
        name: `Referral role ${demoSequence}`,
        permissions: options.permissions,
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

async function referralsFor(t: ReferralTestBackend, referredUserId: Id<"users">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("referrals")
      .withIndex("by_referred_user_id", (q) => q.eq("referred_user_id", referredUserId))
      .collect(),
  );
}

describe("referrals DemoRentals attribution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SIGNUP_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("recordDemoRentalsReferral", () => {
    it("records a qualified referral with the default sign-up, listing and closure milestones", async () => {
      const t = createReferralTest();
      const referrer = await createDemoRentalsUser(t, "TENANT", { code: "FLAT-REFR2" });
      const newcomer = await createDemoRentalsUser(t, "TENANT");

      const referralId = await newcomer.as.mutation(api.referrals.recordDemoRentalsReferral, {
        referral_code: "  flat-refr2 ",
        referral_type: "TENANT_FINDING",
      });

      const referral = await t.run(async (ctx) => ctx.db.get(referralId));
      expect(referral).toMatchObject({
        referrer_user_id: referrer.userId,
        referred_user_id: newcomer.userId,
        referral_type: "TENANT_FINDING",
        status: "QUALIFIED",
      });
      const milestones = await t.run(async (ctx) =>
        ctx.db
          .query("referral_milestones")
          .withIndex("by_referral_id", (q) => q.eq("referral_id", referralId))
          .collect(),
      );
      // ₹1,000 finding bonus split 30/70 between listing publication and deal closure.
      expect(
        milestones
          .map((m) => [m.milestone_type, m.status, m.amount, m.triggered_at ?? null])
          .sort(),
      ).toEqual([
        ["DEAL_CLOSED", "PENDING", 70_000, null],
        ["LISTING_PUBLISHED", "PENDING", 30_000, null],
        ["SIGN_UP", "TRIGGERED", 20_000, SIGNUP_TIME.getTime()],
      ]);
    });

    it("refuses a user's own code while another user's code still attributes", async () => {
      const t = createReferralTest();
      const tenant = await createDemoRentalsUser(t, "TENANT", { code: "FLAT-SELF3" });
      await createDemoRentalsUser(t, "TENANT", { code: "FLAT-OTHR4" });

      await expect(
        tenant.as.mutation(api.referrals.recordDemoRentalsReferral, {
          referral_code: "FLAT-SELF3",
          referral_type: "TENANT_FINDING",
        }),
      ).rejects.toThrow("A user cannot refer themselves");
      expect(
        await tenant.as.mutation(api.referrals.captureReferralFromCode, {
          referral_code: "FLAT-SELF3",
        }),
      ).toEqual({ captured: false, reason: "self_referral" });
      expect(await referralsFor(t, tenant.userId)).toEqual([]);

      const captured = await tenant.as.mutation(api.referrals.captureReferralFromCode, {
        referral_code: "FLAT-OTHR4",
      });
      expect(captured).toMatchObject({ captured: true, reason: "captured" });
    });

    it("only attributes accounts at most 48 hours old", async () => {
      const t = createReferralTest();
      await createDemoRentalsUser(t, "TENANT", { code: "FLAT-WNDW5" });
      const atLimit = await createDemoRentalsUser(t, "TENANT");
      const pastLimit = await createDemoRentalsUser(t, "TENANT");

      vi.setSystemTime(SIGNUP_TIME.getTime() + 48 * HOUR_MS);
      await atLimit.as.mutation(api.referrals.recordDemoRentalsReferral, {
        referral_code: "FLAT-WNDW5",
        referral_type: "TENANT_FINDING",
      });

      vi.setSystemTime(SIGNUP_TIME.getTime() + 48 * HOUR_MS + 1);
      await expect(
        pastLimit.as.mutation(api.referrals.recordDemoRentalsReferral, {
          referral_code: "FLAT-WNDW5",
          referral_type: "TENANT_FINDING",
        }),
      ).rejects.toThrow("only available for accounts created in the last 48 hours");
      expect(
        await pastLimit.as.mutation(api.referrals.captureReferralFromCode, {
          referral_code: "FLAT-WNDW5",
        }),
      ).toEqual({ captured: false, reason: "existing_account" });

      expect(await referralsFor(t, atLimit.userId)).toHaveLength(1);
      expect(await referralsFor(t, pastLimit.userId)).toEqual([]);
    });

    it("allows a new attribution only after the earlier referral is voided", async () => {
      const t = createReferralTest();
      const admin = await createDemoRentalsUser(t, "ADMIN", {
        permissions: [PERMISSIONS.REFERRALS_MANAGE],
      });
      const first = await createDemoRentalsUser(t, "OWNER", { code: "FLAT-FRST6" });
      const second = await createDemoRentalsUser(t, "OWNER", { code: "FLAT-SCND7" });
      const newcomer = await createDemoRentalsUser(t, "OWNER");

      const firstReferralId = await newcomer.as.mutation(api.referrals.recordDemoRentalsReferral, {
        referral_code: "FLAT-FRST6",
        referral_type: "OWNER_FINDING",
      });
      expect(
        await newcomer.as.mutation(api.referrals.captureReferralFromCode, {
          referral_code: "FLAT-SCND7",
        }),
      ).toEqual({ captured: false, reason: "already_attributed" });

      await admin.as.mutation(api.referrals.voidReferral, {
        id: firstReferralId,
        reason: "wrong referrer",
      });
      const retry = await newcomer.as.mutation(api.referrals.captureReferralFromCode, {
        referral_code: "FLAT-SCND7",
      });

      expect(retry).toMatchObject({ captured: true });
      const referrals = await referralsFor(t, newcomer.userId);
      expect(new Map(referrals.map((r) => [r.referrer_user_id, r.status]))).toEqual(
        new Map([
          [first.userId, "VOIDED"],
          [second.userId, "QUALIFIED"],
        ]),
      );
    });
  });

  describe("captureReferralFromCode rate limit", () => {
    it("allows ten capture attempts per referred user per hour, then resets", async () => {
      const t = createReferralTest();
      const referrer = await createDemoRentalsUser(t, "TENANT", { code: "FLAT-RATE8" });
      const newcomer = await createDemoRentalsUser(t, "TENANT");
      const capture = (code: string) =>
        newcomer.as.mutation(api.referrals.captureReferralFromCode, { referral_code: code });

      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect(await capture("FLAT-NOPE9")).toEqual({ captured: false, reason: "invalid_code" });
      }
      expect(await capture("FLAT-RATE8")).toEqual({ captured: false, reason: "rate_limited" });
      expect(await referralsFor(t, newcomer.userId)).toEqual([]);

      vi.setSystemTime(SIGNUP_TIME.getTime() + HOUR_MS);
      const afterWindow = await capture("FLAT-RATE8");

      expect(afterWindow).toMatchObject({ captured: true });
      const [referral] = await referralsFor(t, newcomer.userId);
      expect(referral?.referrer_user_id).toBe(referrer.userId);
    });
  });

  describe("referralCodes.generate", () => {
    it("draws a fresh code when the first candidate collides and reuses it afterwards", async () => {
      const t = createReferralTest();
      await createDemoRentalsUser(t, "OWNER", { code: "FLAT-AAAAA" });
      const tenant = await createDemoRentalsUser(t, "TENANT");
      // Five draws of 0 spell AAAAA (taken); five draws of 1/32 spell BBBBB.
      const draws = [0, 0, 0, 0, 0, 1 / 32, 1 / 32, 1 / 32, 1 / 32, 1 / 32];
      const random = vi.spyOn(Math, "random").mockImplementation(() => draws.shift() ?? 0.5);

      const generated = await tenant.as.mutation(api.referralCodes.generate, {});
      const again = await tenant.as.mutation(api.referralCodes.generate, {});

      expect(generated).toMatchObject({
        user_id: tenant.userId,
        code: "FLAT-BBBBB",
        is_active: true,
      });
      expect(again?._id).toBe(generated?._id);
      expect(random).toHaveBeenCalledTimes(10);
    });

    it("gives up after ten colliding candidates", async () => {
      const t = createReferralTest();
      await createDemoRentalsUser(t, "OWNER", { code: "FLAT-AAAAA" });
      const tenant = await createDemoRentalsUser(t, "TENANT");
      vi.spyOn(Math, "random").mockReturnValue(0);

      await expect(tenant.as.mutation(api.referralCodes.generate, {})).rejects.toThrow(
        "Unable to generate a unique referral code. Please try again.",
      );
      const codes = await t.run(async (ctx) =>
        ctx.db
          .query("referral_codes")
          .withIndex("by_user_id", (q) => q.eq("user_id", tenant.userId))
          .collect(),
      );
      expect(codes).toEqual([]);
    });
  });
});

describe("referrals guard referral recording", () => {
  it("records a pending guard referral with the first-verified-lead bonus and refuses self-referral", async () => {
    const t = convexTest(schema, modules);
    const adminWorkosUserId = "workos_admin_referral_record_1";
    await createAdminWithReferralManagePermission(t, adminWorkosUserId);
    const referrerId = await createGuardUser(t, {
      workosUserId: "workos_guard_referrer_record_1",
      phone: "9000000041",
      name: "Referrer Guard",
    });
    const referredId = await createGuardUser(t, {
      workosUserId: "workos_guard_referred_record_1",
      phone: "9000000042",
      name: "Referred Guard",
    });
    const authed = t.withIdentity({ subject: adminWorkosUserId, issuer: WORKOS_ISSUER });

    await expect(
      authed.mutation(api.referrals.recordGuardReferral, {
        referred_guard_user_id: referrerId,
        referrer_phone: "+91 90000 00041",
      }),
    ).rejects.toThrow("A guard cannot refer themselves");

    const referralId = await authed.mutation(api.referrals.recordGuardReferral, {
      referred_guard_user_id: referredId,
      referrer_phone: "+91 90000 00041",
    });

    const stored = await t.run(async (ctx) => {
      const referral = await ctx.db.get(referralId);
      const milestones = await ctx.db
        .query("referral_milestones")
        .withIndex("by_referral_id", (q) => q.eq("referral_id", referralId))
        .collect();
      return { referral, milestones };
    });
    expect(stored.referral).toMatchObject({
      referrer_user_id: referrerId,
      referred_user_id: referredId,
      referral_type: "GUARD",
      status: "PENDING",
    });
    expect(stored.milestones.map((m) => [m.milestone_type, m.status, m.amount])).toEqual([
      ["FIRST_VERIFIED_LEAD", "PENDING", 50_000],
    ]);

    await expect(
      authed.mutation(api.referrals.recordGuardReferral, {
        referred_guard_user_id: referredId,
        referrer_phone: "9000000041",
      }),
    ).rejects.toThrow("Guard referral already exists for this user");
  });
});
