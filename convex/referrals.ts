import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  LEAD_STATUS,
  PERMISSIONS,
  REFERRAL_CONFIG_SCOPE_TYPE,
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  REFERRAL_STATUS,
  REFERRAL_TYPE,
  USER_STATUS,
  USER_TYPE,
} from "../lib/constants";
import {
  calculateSplitAmount,
  validateMilestoneTransition,
  validateReferralTransition,
} from "../lib/referral";
import { normalizePhone } from "../lib/validators";
import { requireAuth, requirePermission, requireTenant } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const referralTypeValidator = v.union(
  v.literal(REFERRAL_TYPE.TENANT_FINDING),
  v.literal(REFERRAL_TYPE.OWNER_FINDING),
  v.literal(REFERRAL_TYPE.GUARD),
);

const referralStatusValidator = v.union(
  v.literal(REFERRAL_STATUS.PENDING),
  v.literal(REFERRAL_STATUS.QUALIFIED),
  v.literal(REFERRAL_STATUS.PARTIALLY_PAID),
  v.literal(REFERRAL_STATUS.FULLY_PAID),
  v.literal(REFERRAL_STATUS.VOIDED),
);

const demorentalsReferralTypeValidator = v.union(
  v.literal(REFERRAL_TYPE.TENANT_FINDING),
  v.literal(REFERRAL_TYPE.OWNER_FINDING),
);

const overrideTargetUserTypeValidator = v.union(
  v.literal(USER_TYPE.TENANT),
  v.literal(USER_TYPE.OWNER),
);

const tenantReferralShareMethodValidator = v.union(v.literal("COPY_LINK"), v.literal("WEB_SHARE"));

type ReferralDoc = Doc<"referrals">;
type MilestoneDoc = Doc<"referral_milestones">;
type ReferralContext = QueryCtx | MutationCtx;
type ReferralAnalyticsTimeWindow = "last_7_days" | "last_30_days" | "last_90_days" | "all_time";
type DemoRentalsReferralType = typeof REFERRAL_TYPE.TENANT_FINDING | typeof REFERRAL_TYPE.OWNER_FINDING;

type EstimatedBonusConfidence = "HIGH" | "MEDIUM" | "LOW";

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;
const DEMORENTALS_REFERRAL_ACCOUNT_AGE_LIMIT_MS = 48 * 60 * 60 * 1000;

const referralAnalyticsTimeWindowValidator = v.union(
  v.literal("last_7_days"),
  v.literal("last_30_days"),
  v.literal("last_90_days"),
  v.literal("all_time"),
);

function getTimeWindowCutoff(timeWindow: ReferralAnalyticsTimeWindow): number | null {
  const now = Date.now();

  if (timeWindow === "last_7_days") {
    return now - 7 * DAY_MS;
  }

  if (timeWindow === "last_30_days") {
    return now - 30 * DAY_MS;
  }

  if (timeWindow === "last_90_days") {
    return now - 90 * DAY_MS;
  }

  return null;
}

function toISTMonthKey(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 7);
}

function getLastNISTMonthKeys(count: number, now = Date.now()): string[] {
  const currentIstDate = new Date(now + IST_OFFSET_MS);
  const currentYear = currentIstDate.getUTCFullYear();
  const currentMonth = currentIstDate.getUTCMonth();

  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(currentYear, currentMonth - offset, 1));
    keys.push(date.toISOString().slice(0, 7));
  }

  return keys;
}

function getISTMonthKeysInRange(startTimestamp: number, endTimestamp: number): string[] {
  const safeStart = Math.min(startTimestamp, endTimestamp);
  const safeEnd = Math.max(startTimestamp, endTimestamp);

  const startDate = new Date(safeStart + IST_OFFSET_MS);
  const endDate = new Date(safeEnd + IST_OFFSET_MS);

  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth();

  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();

  const keys: string[] = [];

  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7));
    month += 1;

    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return keys;
}

async function getActiveReferralCodeByCode(ctx: ReferralContext, code: string) {
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  const referralCode = await ctx.db
    .query("referral_codes")
    .withIndex("by_code", (q) => q.eq("code", normalizedCode))
    .first();

  if (!referralCode || !referralCode.is_active) {
    return null;
  }

  return referralCode;
}

function getDemoRentalsReferralTypeForUser(
  userType: Doc<"users">["user_type"],
): DemoRentalsReferralType | null {
  if (userType === USER_TYPE.TENANT) {
    return REFERRAL_TYPE.TENANT_FINDING;
  }

  if (userType === USER_TYPE.OWNER) {
    return REFERRAL_TYPE.OWNER_FINDING;
  }

  return null;
}

function getDemoRentalsReferralTypeForTargetUserType(
  userType: typeof USER_TYPE.TENANT | typeof USER_TYPE.OWNER,
): DemoRentalsReferralType {
  return userType === USER_TYPE.TENANT ? REFERRAL_TYPE.TENANT_FINDING : REFERRAL_TYPE.OWNER_FINDING;
}

function getDemoRentalsMilestoneAmounts(config: {
  finding_bonus_total: number;
  publish_split_pct: number;
  closure_split_pct: number;
}) {
  return {
    listingPublishedAmount: calculateSplitAmount(
      config.finding_bonus_total,
      config.publish_split_pct,
    ),
    dealClosedAmount: calculateSplitAmount(config.finding_bonus_total, config.closure_split_pct),
  };
}

type ReferralDealContext = {
  lead_id?: Id<"leads">;
  listing_id?: Id<"listings">;
  closure_id?: Id<"closures">;
};

type ResolvedReferralScope = {
  lead_id: Id<"leads"> | undefined;
  building_id: Id<"buildings"> | undefined;
  society_id: Id<"societies"> | undefined;
};

type ScopedDemoRentalsConfig = {
  sign_up_bonus: number;
  finding_bonus_total: number;
  publish_split_pct: number;
  closure_split_pct: number;
};

function getDefaultDemoRentalsConfig(referralType: DemoRentalsReferralType): ScopedDemoRentalsConfig {
  if (referralType === REFERRAL_TYPE.OWNER_FINDING) {
    return {
      sign_up_bonus: 20000,
      finding_bonus_total: 200000,
      publish_split_pct: 30,
      closure_split_pct: 70,
    };
  }

  return {
    sign_up_bonus: 20000,
    finding_bonus_total: 100000,
    publish_split_pct: 30,
    closure_split_pct: 70,
  };
}

async function resolveReferralScopeFromContext(
  ctx: ReferralContext,
  args: ReferralDealContext,
): Promise<ResolvedReferralScope> {
  let leadId = args.lead_id;

  if (!leadId && args.listing_id) {
    const listing = await ctx.db.get(args.listing_id);
    leadId = listing?.lead_id;
  }

  if (!leadId && args.closure_id) {
    const closure = await ctx.db.get(args.closure_id);
    leadId = closure?.lead_id;
  }

  if (!leadId) {
    return {
      lead_id: undefined,
      building_id: undefined,
      society_id: undefined,
    };
  }

  const lead = await ctx.db.get(leadId);

  if (!lead) {
    return {
      lead_id: undefined,
      building_id: undefined,
      society_id: undefined,
    };
  }

  return {
    lead_id: lead._id,
    building_id: lead.building_id,
    society_id: lead.society_id,
  };
}

async function getScopedDemoRentalsConfig(
  ctx: MutationCtx,
  referralType: DemoRentalsReferralType,
  dealContext: ReferralDealContext,
): Promise<{ scope: ResolvedReferralScope; config: ScopedDemoRentalsConfig }> {
  const scope = await resolveReferralScopeFromContext(ctx, dealContext);
  const resolvedConfig = await getResolvedConfig(
    ctx,
    referralType,
    scope.building_id,
    scope.society_id,
  );

  const config: ScopedDemoRentalsConfig =
    resolvedConfig === null
      ? getDefaultDemoRentalsConfig(referralType)
      : {
          sign_up_bonus: resolvedConfig.sign_up_bonus,
          finding_bonus_total: resolvedConfig.finding_bonus_total,
          publish_split_pct: resolvedConfig.publish_split_pct,
          closure_split_pct: resolvedConfig.closure_split_pct,
        };

  return { scope, config };
}

async function updatePendingMilestoneAmount(
  ctx: MutationCtx,
  referralId: Id<"referrals">,
  milestoneType: MilestoneDoc["milestone_type"],
  amount: number,
): Promise<void> {
  const milestone = await ctx.db
    .query("referral_milestones")
    .withIndex("by_referral_id", (q) => q.eq("referral_id", referralId))
    .filter((q) => q.eq(q.field("milestone_type"), milestoneType))
    .first();

  if (
    milestone &&
    milestone.status === REFERRAL_MILESTONE_STATUS.PENDING &&
    milestone.amount !== amount
  ) {
    await ctx.db.patch(milestone._id, {
      amount,
    });
  }
}

async function resolveClosureTarget(
  ctx: MutationCtx,
  closureId: Id<"closures">,
  targetUserType: typeof USER_TYPE.TENANT | typeof USER_TYPE.OWNER,
): Promise<{
  referredUserId: Id<"users">;
  referralType: DemoRentalsReferralType;
  leadId: Id<"leads">;
  listingId: Id<"listings"> | undefined;
  closureId: Id<"closures">;
}> {
  const closure = await ctx.db.get(closureId);

  if (!closure) {
    throw new Error("Closure not found");
  }

  if (targetUserType === USER_TYPE.OWNER) {
    const lead = await ctx.db.get(closure.lead_id);
    const owner = closure.owner_id
      ? await ctx.db.get(closure.owner_id)
      : lead?.owner_id
        ? await ctx.db.get(lead.owner_id)
        : null;
    const ownerUser = owner?.user_id ? await ctx.db.get(owner.user_id) : null;

    if (
      !ownerUser ||
      !(ownerUser.user_types?.includes(USER_TYPE.OWNER) ?? ownerUser.user_type === USER_TYPE.OWNER)
    ) {
      throw new Error("Unable to resolve owner user for this closure");
    }

    return {
      referredUserId: ownerUser._id,
      referralType: getDemoRentalsReferralTypeForTargetUserType(USER_TYPE.OWNER),
      leadId: closure.lead_id,
      listingId: closure.listing_id,
      closureId: closure._id,
    };
  }

  if (!closure.visit_id) {
    throw new Error("Closure does not have a linked visit for tenant attribution");
  }

  const visit = await ctx.db.get(closure.visit_id);

  if (!visit || visit.lead_id !== closure.lead_id || !visit.tenant_inquiry_id) {
    throw new Error("Unable to resolve tenant inquiry from closure visit");
  }

  const tenantInquiry = await ctx.db.get(visit.tenant_inquiry_id);

  if (!tenantInquiry?.tenant_id) {
    throw new Error("Unable to resolve tenant user from closure inquiry");
  }

  const tenantUser = await ctx.db.get(tenantInquiry.tenant_id);

  if (
    !tenantUser ||
    !(
      tenantUser.user_types?.includes(USER_TYPE.TENANT) ?? tenantUser.user_type === USER_TYPE.TENANT
    )
  ) {
    throw new Error("Resolved closure participant is not a tenant user");
  }

  return {
    referredUserId: tenantUser._id,
    referralType: getDemoRentalsReferralTypeForTargetUserType(USER_TYPE.TENANT),
    leadId: closure.lead_id,
    listingId: closure.listing_id,
    closureId: closure._id,
  };
}

async function createDemoRentalsReferralAttribution(
  ctx: MutationCtx,
  args: {
    referredUserRecord: Doc<"users">;
    referral_code: string;
    referral_type: DemoRentalsReferralType;
    enforceRateLimit: boolean;
    lead_id?: Id<"leads">;
    listing_id?: Id<"listings">;
    closure_id?: Id<"closures">;
  },
): Promise<Id<"referrals">> {
  if (
    args.referral_type === REFERRAL_TYPE.TENANT_FINDING &&
    !(
      args.referredUserRecord.user_types?.includes(USER_TYPE.TENANT) ??
      args.referredUserRecord.user_type === USER_TYPE.TENANT
    )
  ) {
    throw new Error("Referral type TENANT_FINDING requires a TENANT user");
  }

  if (
    args.referral_type === REFERRAL_TYPE.OWNER_FINDING &&
    !(
      args.referredUserRecord.user_types?.includes(USER_TYPE.OWNER) ??
      args.referredUserRecord.user_type === USER_TYPE.OWNER
    )
  ) {
    throw new Error("Referral type OWNER_FINDING requires an OWNER user");
  }

  if (args.enforceRateLimit) {
    const { ok, retryAfter } = await rateLimiter.limit(ctx, "public:referral_signup", {
      key: args.referredUserRecord._id,
    });

    if (!ok) {
      throw new Error(`Rate limited. Try again in ${Math.ceil(retryAfter / 1000)}s`);
    }
  }

  const referralCode = await getActiveReferralCodeByCode(ctx, args.referral_code);

  if (!referralCode) {
    throw new Error("Referral code is invalid or inactive");
  }

  const referralCodeOwner = await ctx.db.get(referralCode.user_id);

  if (
    !referralCodeOwner ||
    (!(
      referralCodeOwner.user_types?.includes(USER_TYPE.TENANT) ??
      referralCodeOwner.user_type === USER_TYPE.TENANT
    ) &&
      !(
        referralCodeOwner.user_types?.includes(USER_TYPE.OWNER) ??
        referralCodeOwner.user_type === USER_TYPE.OWNER
      ))
  ) {
    throw new Error("Referral code is invalid or inactive");
  }

  if (referralCodeOwner.status !== USER_STATUS.ACTIVE) {
    throw new Error("Referrer account is no longer active");
  }

  if (referralCode.user_id === args.referredUserRecord._id) {
    throw new Error("A user cannot refer themselves");
  }

  const existingReferrals = await ctx.db
    .query("referrals")
    .withIndex("by_referred_user_id", (q) => q.eq("referred_user_id", args.referredUserRecord._id))
    .collect();

  if (existingReferrals.some((referral) => referral.status !== REFERRAL_STATUS.VOIDED)) {
    throw new Error("Referral attribution already exists for this user");
  }

  const { scope, config } = await getScopedDemoRentalsConfig(ctx, args.referral_type, {
    lead_id: args.lead_id,
    listing_id: args.listing_id,
    closure_id: args.closure_id,
  });
  const milestoneAmounts = getDemoRentalsMilestoneAmounts(config);

  const referralId = await ctx.db.insert("referrals", {
    referrer_user_id: referralCode.user_id,
    referred_user_id: args.referredUserRecord._id,
    referral_code_id: referralCode._id,
    referral_type: args.referral_type,
    status: REFERRAL_STATUS.PENDING,
    lead_id: scope.lead_id,
    listing_id: args.listing_id,
    closure_id: args.closure_id,
    building_id: scope.building_id,
    society_id: scope.society_id,
    voided_reason: undefined,
    voided_by_admin_id: undefined,
    attributed_by_admin_id: undefined,
    attributed_at: undefined,
    attribution_source: undefined,
  });

  await Promise.all([
    ctx.db.insert("referral_milestones", {
      referral_id: referralId,
      milestone_type: REFERRAL_MILESTONE_TYPE.SIGN_UP,
      amount: config.sign_up_bonus,
      status: REFERRAL_MILESTONE_STATUS.TRIGGERED,
      triggered_at: Date.now(),
      approved_by_admin_id: undefined,
      paid_at: undefined,
      payout_method: undefined,
      voided_reason: undefined,
    }),
    ctx.db.insert("referral_milestones", {
      referral_id: referralId,
      milestone_type: REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
      amount: milestoneAmounts.listingPublishedAmount,
      status: REFERRAL_MILESTONE_STATUS.PENDING,
      triggered_at: undefined,
      approved_by_admin_id: undefined,
      paid_at: undefined,
      payout_method: undefined,
      voided_reason: undefined,
    }),
    ctx.db.insert("referral_milestones", {
      referral_id: referralId,
      milestone_type: REFERRAL_MILESTONE_TYPE.DEAL_CLOSED,
      amount: milestoneAmounts.dealClosedAmount,
      status: REFERRAL_MILESTONE_STATUS.PENDING,
      triggered_at: undefined,
      approved_by_admin_id: undefined,
      paid_at: undefined,
      payout_method: undefined,
      voided_reason: undefined,
    }),
  ]);

  if (!validateReferralTransition(REFERRAL_STATUS.PENDING, REFERRAL_STATUS.QUALIFIED)) {
    throw new Error(
      `Invalid referral transition: ${REFERRAL_STATUS.PENDING} -> ${REFERRAL_STATUS.QUALIFIED}`,
    );
  }

  await ctx.db.patch(referralId, {
    status: REFERRAL_STATUS.QUALIFIED,
  });

  return referralId;
}

function summarizeMilestones(milestones: MilestoneDoc[]) {
  const total_amount = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  const paid_amount = milestones
    .filter((milestone) => milestone.status === REFERRAL_MILESTONE_STATUS.PAID)
    .reduce((sum, milestone) => sum + milestone.amount, 0);

  return {
    count: milestones.length,
    total_amount,
    paid_amount,
  };
}

async function getUserNameMap(
  ctx: QueryCtx,
  userIds: Id<"users">[],
): Promise<Map<Id<"users">, string>> {
  const uniqueIds = Array.from(new Set(userIds));
  const users = await Promise.all(uniqueIds.map(async (userId) => await ctx.db.get(userId)));

  const map = new Map<Id<"users">, string>();

  uniqueIds.forEach((userId, index) => {
    map.set(userId, users[index]?.name ?? "Unknown");
  });

  return map;
}

function averageAmount(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function getConfigByScope(
  ctx: ReferralContext,
  referralType: ReferralDoc["referral_type"],
  scopeType: (typeof REFERRAL_CONFIG_SCOPE_TYPE)[keyof typeof REFERRAL_CONFIG_SCOPE_TYPE],
  scopeId: string | undefined,
) {
  return await ctx.db
    .query("referral_config")
    .withIndex("by_scope", (q) => q.eq("scope_type", scopeType).eq("scope_id", scopeId))
    .filter((q) => q.eq(q.field("referral_type"), referralType))
    .filter((q) => q.eq(q.field("is_active"), true))
    .first();
}

async function getResolvedConfig(
  ctx: ReferralContext,
  referralType: ReferralDoc["referral_type"],
  buildingId: Id<"buildings"> | undefined,
  societyId: Id<"societies"> | undefined,
) {
  if (buildingId) {
    const buildingConfig = await getConfigByScope(
      ctx,
      referralType,
      REFERRAL_CONFIG_SCOPE_TYPE.BUILDING,
      buildingId,
    );

    if (buildingConfig) {
      return buildingConfig;
    }
  }

  if (societyId) {
    const societyConfig = await getConfigByScope(
      ctx,
      referralType,
      REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY,
      societyId,
    );

    if (societyConfig) {
      return societyConfig;
    }
  }

  return await getConfigByScope(ctx, referralType, REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL, undefined);
}

function getUserType(user: unknown): string | null {
  if (typeof user !== "object" || user === null) {
    return null;
  }

  if (!("user_type" in user)) {
    return null;
  }

  const userTypeValue = (user as Record<string, unknown>).user_type;
  return typeof userTypeValue === "string" ? userTypeValue : null;
}

function assertGuardReferralEligibleReferredUser(referredUser: Doc<"users"> | null): void {
  const userType = getUserType(referredUser);

  if (userType === USER_TYPE.OPS) {
    throw new Error("Guard referral is GUARD-only; OPS field workers are excluded");
  }

  if (userType !== USER_TYPE.GUARD) {
    throw new Error("Referred user must be a guard");
  }
}

export const recordGuardReferral = mutation({
  args: {
    referred_guard_user_id: v.id("users"),
    referrer_phone: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_MANAGE);

    const normalizedPhone = normalizePhone(args.referrer_phone);
    const syntheticEmail = `${normalizedPhone}@guards.local`;

    const usersWithPhone = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", normalizedPhone))
      .collect();

    let referrerUser =
      usersWithPhone.find(
        (user) => user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD,
      ) ?? null;

    if (!referrerUser) {
      const opsUserByPhone =
        usersWithPhone.find(
          (user) => user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS,
        ) ?? null;
      if (opsUserByPhone) {
        throw new Error("Guard referral is GUARD-only; OPS field workers are excluded");
      }
    }

    if (!referrerUser) {
      const guardBySyntheticEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", syntheticEmail))
        .first();

      if (
        guardBySyntheticEmail &&
        (guardBySyntheticEmail.user_types?.includes(USER_TYPE.GUARD) ??
          guardBySyntheticEmail.user_type === USER_TYPE.GUARD)
      ) {
        referrerUser = guardBySyntheticEmail;
      }
    }

    if (
      !referrerUser ||
      !(
        referrerUser.user_types?.includes(USER_TYPE.GUARD) ??
        referrerUser.user_type === USER_TYPE.GUARD
      )
    ) {
      throw new Error("Referrer guard not found");
    }

    if (referrerUser.status === "BANNED") {
      throw new Error("Referrer guard is banned");
    }

    const referrerProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", referrerUser._id))
      .first();

    if (!referrerProfile) {
      throw new Error("Referrer guard profile not found");
    }

    const referredUser = await ctx.db.get(args.referred_guard_user_id);
    assertGuardReferralEligibleReferredUser(referredUser);

    if (referrerUser._id === args.referred_guard_user_id) {
      throw new Error("A guard cannot refer themselves");
    }

    const existingReferrals = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user_id", (q) =>
        q.eq("referred_user_id", args.referred_guard_user_id),
      )
      .filter((q) => q.eq(q.field("referral_type"), REFERRAL_TYPE.GUARD))
      .filter((q) => q.neq(q.field("status"), REFERRAL_STATUS.VOIDED))
      .collect();

    if (existingReferrals.length > 0) {
      throw new Error("Guard referral already exists for this user");
    }

    const referralId = await ctx.db.insert("referrals", {
      referrer_user_id: referrerUser._id,
      referred_user_id: args.referred_guard_user_id,
      referral_code_id: undefined,
      referral_type: REFERRAL_TYPE.GUARD,
      status: REFERRAL_STATUS.PENDING,
      lead_id: undefined,
      listing_id: undefined,
      closure_id: undefined,
      voided_reason: undefined,
      voided_by_admin_id: undefined,
    });

    const config = await ctx.runQuery(internal.referralConfig.getForScope, {
      referral_type: REFERRAL_TYPE.GUARD,
    });

    await ctx.db.insert("referral_milestones", {
      referral_id: referralId,
      milestone_type: REFERRAL_MILESTONE_TYPE.FIRST_VERIFIED_LEAD,
      amount: config.finding_bonus_total,
      status: REFERRAL_MILESTONE_STATUS.PENDING,
      triggered_at: undefined,
      approved_by_admin_id: undefined,
      paid_at: undefined,
      payout_method: undefined,
      voided_reason: undefined,
    });

    return referralId;
  },
});

export const recordGuardReferralInternal = internalMutation({
  args: {
    referred_guard_user_id: v.id("users"),
    referrer_phone: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedPhone = normalizePhone(args.referrer_phone);
    const syntheticEmail = `${normalizedPhone}@guards.local`;

    const usersWithPhone = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", normalizedPhone))
      .collect();

    let referrerUser =
      usersWithPhone.find(
        (user) => user.user_types?.includes(USER_TYPE.GUARD) ?? user.user_type === USER_TYPE.GUARD,
      ) ?? null;

    if (!referrerUser) {
      const opsUserByPhone =
        usersWithPhone.find(
          (user) => user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS,
        ) ?? null;
      if (opsUserByPhone) {
        return null;
      }
    }

    if (!referrerUser) {
      const guardBySyntheticEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", syntheticEmail))
        .first();

      if (
        guardBySyntheticEmail &&
        (guardBySyntheticEmail.user_types?.includes(USER_TYPE.GUARD) ??
          guardBySyntheticEmail.user_type === USER_TYPE.GUARD)
      ) {
        referrerUser = guardBySyntheticEmail;
      }
    }

    if (
      !referrerUser ||
      !(
        referrerUser.user_types?.includes(USER_TYPE.GUARD) ??
        referrerUser.user_type === USER_TYPE.GUARD
      )
    ) {
      return null;
    }

    if (referrerUser.status === "BANNED") {
      return null;
    }

    const referrerProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", referrerUser._id))
      .first();

    if (!referrerProfile) {
      return null;
    }

    const referredUser = await ctx.db.get(args.referred_guard_user_id);
    if (getUserType(referredUser) === USER_TYPE.OPS) {
      return null;
    }

    if (getUserType(referredUser) !== USER_TYPE.GUARD) {
      return null;
    }

    if (referrerUser._id === args.referred_guard_user_id) {
      return null;
    }

    const existingReferrals = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user_id", (q) =>
        q.eq("referred_user_id", args.referred_guard_user_id),
      )
      .filter((q) => q.eq(q.field("referral_type"), REFERRAL_TYPE.GUARD))
      .filter((q) => q.neq(q.field("status"), REFERRAL_STATUS.VOIDED))
      .collect();

    if (existingReferrals.length > 0) {
      return null;
    }

    const referralId = await ctx.db.insert("referrals", {
      referrer_user_id: referrerUser._id,
      referred_user_id: args.referred_guard_user_id,
      referral_code_id: undefined,
      referral_type: REFERRAL_TYPE.GUARD,
      status: REFERRAL_STATUS.PENDING,
      lead_id: undefined,
      listing_id: undefined,
      closure_id: undefined,
      voided_reason: undefined,
      voided_by_admin_id: undefined,
    });

    const config = await ctx.runQuery(internal.referralConfig.getForScope, {
      referral_type: REFERRAL_TYPE.GUARD,
    });

    await ctx.db.insert("referral_milestones", {
      referral_id: referralId,
      milestone_type: REFERRAL_MILESTONE_TYPE.FIRST_VERIFIED_LEAD,
      amount: config.finding_bonus_total,
      status: REFERRAL_MILESTONE_STATUS.PENDING,
      triggered_at: undefined,
      approved_by_admin_id: undefined,
      paid_at: undefined,
      payout_method: undefined,
      voided_reason: undefined,
    });

    return referralId;
  },
});

export const recordDemoRentalsReferral = mutation({
  args: {
    referral_code: v.string(),
    referral_type: demorentalsReferralTypeValidator,
  },
  handler: async (ctx, args) => {
    const referredUser = await requireAuth(ctx);
    const referredUserRecord = await ctx.db.get(referredUser._id);

    if (!referredUserRecord) {
      throw new Error("Authenticated user not found");
    }

    if (Date.now() - referredUserRecord._creationTime > DEMORENTALS_REFERRAL_ACCOUNT_AGE_LIMIT_MS) {
      throw new Error(
        "Referral attribution is only available for accounts created in the last 48 hours",
      );
    }

    return await createDemoRentalsReferralAttribution(ctx, {
      referredUserRecord,
      referral_code: args.referral_code,
      referral_type: args.referral_type,
      enforceRateLimit: true,
    });
  },
});

export const captureReferralFromCode = mutation({
  args: {
    referral_code: v.string(),
  },
  handler: async (ctx, args) => {
    const referredUser = await requireAuth(ctx);
    const referredUserRecord = await ctx.db.get(referredUser._id);

    if (!referredUserRecord) {
      return {
        captured: false,
        reason: "user_not_found" as const,
      };
    }

    if (Date.now() - referredUserRecord._creationTime > DEMORENTALS_REFERRAL_ACCOUNT_AGE_LIMIT_MS) {
      return {
        captured: false,
        reason: "existing_account" as const,
      };
    }

    const referralType = getDemoRentalsReferralTypeForUser(referredUserRecord.user_type);

    if (!referralType) {
      return {
        captured: false,
        reason: "unsupported_user_type" as const,
      };
    }

    try {
      const referralId = await createDemoRentalsReferralAttribution(ctx, {
        referredUserRecord,
        referral_code: args.referral_code,
        referral_type: referralType,
        enforceRateLimit: true,
      });

      return {
        captured: true,
        reason: "captured" as const,
        referral_id: referralId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("Rate limited")) {
        return {
          captured: false,
          reason: "rate_limited" as const,
        };
      }

      if (message.includes("invalid or inactive")) {
        return {
          captured: false,
          reason: "invalid_code" as const,
        };
      }

      if (message.includes("cannot refer themselves")) {
        return {
          captured: false,
          reason: "self_referral" as const,
        };
      }

      if (message.includes("already exists for this user")) {
        return {
          captured: false,
          reason: "already_attributed" as const,
        };
      }

      throw error;
    }
  },
});

export const overrideAttribution = mutation({
  args: {
    closure_id: v.optional(v.id("closures")),
    referred_user_id: v.optional(v.id("users")),
    target_user_type: v.optional(overrideTargetUserTypeValidator),
    new_referral_code: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.REFERRALS_MANAGE);
    const reason = args.reason.trim();

    if (!reason) {
      throw new Error("reason is required");
    }

    const hasClosureId = args.closure_id !== undefined;
    const hasReferredUserId = args.referred_user_id !== undefined;

    if (hasClosureId === hasReferredUserId) {
      throw new Error("Provide exactly one target: closure_id or referred_user_id");
    }

    if (args.closure_id !== undefined && args.target_user_type === undefined) {
      throw new Error("target_user_type is required when overriding attribution by closure_id");
    }

    if (args.referred_user_id !== undefined && args.target_user_type !== undefined) {
      throw new Error("target_user_type is only supported with closure_id");
    }

    let existingReferral: ReferralDoc | null = null;
    let targetReferredUserId: Id<"users"> | null = null;
    let targetReferralType: DemoRentalsReferralType | null = null;
    let targetLeadId: Id<"leads"> | undefined;
    let targetListingId: Id<"listings"> | undefined;
    let targetClosureId: Id<"closures"> | undefined;

    if (args.closure_id !== undefined) {
      const targetUserType = args.target_user_type;

      if (targetUserType === undefined) {
        throw new Error("target_user_type is required when overriding attribution by closure_id");
      }

      const targetReferralType = getDemoRentalsReferralTypeForTargetUserType(targetUserType);

      const closureReferrals = await ctx.db
        .query("referrals")
        .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
        .order("desc")
        .collect();

      existingReferral =
        closureReferrals.find(
          (referral) =>
            referral.status !== REFERRAL_STATUS.VOIDED &&
            referral.referral_type === targetReferralType,
        ) ?? null;
    } else if (args.referred_user_id !== undefined) {
      const referredUserId = args.referred_user_id;

      if (referredUserId === undefined) {
        throw new Error("referred_user_id is required");
      }

      const userReferrals = await ctx.db
        .query("referrals")
        .withIndex("by_referred_user_id", (q) => q.eq("referred_user_id", referredUserId))
        .order("desc")
        .collect();

      existingReferral =
        userReferrals.find((referral) => referral.status !== REFERRAL_STATUS.VOIDED) ?? null;
    }

    if (existingReferral) {
      if (existingReferral.referral_type === REFERRAL_TYPE.GUARD) {
        throw new Error("Override not supported for guard referrals");
      }

      targetReferredUserId = existingReferral.referred_user_id;
      targetReferralType = existingReferral.referral_type;
      targetLeadId = existingReferral.lead_id;
      targetListingId = existingReferral.listing_id;
      targetClosureId = existingReferral.closure_id;
    } else if (args.referred_user_id !== undefined) {
      const referredUser = await ctx.db.get(args.referred_user_id);

      if (!referredUser) {
        throw new Error("Referred user not found");
      }

      const inferredReferralType = getDemoRentalsReferralTypeForUser(referredUser.user_type);

      if (!inferredReferralType) {
        throw new Error("Referred user must be a tenant or owner");
      }

      targetReferredUserId = referredUser._id;
      targetReferralType = inferredReferralType;
    } else if (args.closure_id !== undefined) {
      const targetUserType = args.target_user_type;

      if (targetUserType === undefined) {
        throw new Error("target_user_type is required when overriding attribution by closure_id");
      }

      const resolvedTarget = await resolveClosureTarget(ctx, args.closure_id, targetUserType);

      targetReferredUserId = resolvedTarget.referredUserId;
      targetReferralType = resolvedTarget.referralType;
      targetLeadId = resolvedTarget.leadId;
      targetListingId = resolvedTarget.listingId;
      targetClosureId = resolvedTarget.closureId;
    }

    if (!targetReferredUserId || !targetReferralType) {
      throw new Error("Unable to determine referral attribution target");
    }

    const newReferralCode = await getActiveReferralCodeByCode(ctx, args.new_referral_code);

    if (!newReferralCode) {
      throw new Error("New referral code is invalid or inactive");
    }

    const newReferralCodeOwner = await ctx.db.get(newReferralCode.user_id);

    if (
      !newReferralCodeOwner ||
      (!(
        newReferralCodeOwner.user_types?.includes(USER_TYPE.TENANT) ??
        newReferralCodeOwner.user_type === USER_TYPE.TENANT
      ) &&
        !(
          newReferralCodeOwner.user_types?.includes(USER_TYPE.OWNER) ??
          newReferralCodeOwner.user_type === USER_TYPE.OWNER
        ))
    ) {
      throw new Error("New referral code is invalid or inactive");
    }

    if (newReferralCodeOwner.status !== USER_STATUS.ACTIVE) {
      throw new Error("New referrer account is no longer active");
    }

    if (newReferralCode.user_id === targetReferredUserId) {
      throw new Error("A user cannot refer themselves");
    }

    const now = Date.now();
    const scopedDemoRentalsConfig = await getScopedDemoRentalsConfig(ctx, targetReferralType, {
      lead_id: targetLeadId,
      listing_id: targetListingId,
      closure_id: targetClosureId,
    });
    const milestoneAmounts = getDemoRentalsMilestoneAmounts(scopedDemoRentalsConfig.config);

    if (existingReferral === null) {
      const activeReferralsForUser = await ctx.db
        .query("referrals")
        .withIndex("by_referred_user_id", (q) => q.eq("referred_user_id", targetReferredUserId))
        .order("desc")
        .collect();

      const activeReferral =
        activeReferralsForUser.find((referral) => referral.status !== REFERRAL_STATUS.VOIDED) ??
        null;

      if (activeReferral) {
        if (activeReferral.referral_type === REFERRAL_TYPE.GUARD) {
          throw new Error("Cannot override a guard referral using DemoRentals attribution");
        }

        await ctx.db.patch(activeReferral._id, {
          referrer_user_id: newReferralCode.user_id,
          referral_code_id: newReferralCode._id,
          referral_type: targetReferralType,
          lead_id: targetLeadId ?? activeReferral.lead_id,
          listing_id: targetListingId ?? activeReferral.listing_id,
          closure_id: targetClosureId ?? activeReferral.closure_id,
          building_id: scopedDemoRentalsConfig.scope.building_id ?? activeReferral.building_id,
          society_id: scopedDemoRentalsConfig.scope.society_id ?? activeReferral.society_id,
          attributed_by_admin_id: admin._id,
          attributed_at: now,
          attribution_source: "admin_override",
        });

        await updatePendingMilestoneAmount(
          ctx,
          activeReferral._id,
          REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
          milestoneAmounts.listingPublishedAmount,
        );
        await updatePendingMilestoneAmount(
          ctx,
          activeReferral._id,
          REFERRAL_MILESTONE_TYPE.DEAL_CLOSED,
          milestoneAmounts.dealClosedAmount,
        );

        if (targetListingId) {
          await ctx.runMutation(internal.referralMilestones.trigger, {
            referral_id: activeReferral._id,
            milestone_type: REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
            source_event: `admin_override:listing_published:${targetListingId}`,
          });
        }

        if (targetClosureId) {
          await ctx.runMutation(internal.referralMilestones.trigger, {
            referral_id: activeReferral._id,
            milestone_type: REFERRAL_MILESTONE_TYPE.DEAL_CLOSED,
            source_event: `admin_override:closure_confirmed:${targetClosureId}`,
          });
        }

        return activeReferral._id;
      }
    }

    const oldMilestones =
      existingReferral === null
        ? []
        : await ctx.db
            .query("referral_milestones")
            .withIndex("by_referral_id", (q) => q.eq("referral_id", existingReferral._id))
            .collect();

    if (existingReferral) {
      if (!validateReferralTransition(existingReferral.status, REFERRAL_STATUS.VOIDED)) {
        throw new Error(
          `Invalid referral transition: ${existingReferral.status} -> ${REFERRAL_STATUS.VOIDED}`,
        );
      }

      const milestoneVoidReason = `Attribution override: ${reason}`;

      await Promise.all(
        oldMilestones.map(async (milestone) => {
          if (
            milestone.status !== REFERRAL_MILESTONE_STATUS.PENDING &&
            milestone.status !== REFERRAL_MILESTONE_STATUS.TRIGGERED &&
            milestone.status !== REFERRAL_MILESTONE_STATUS.APPROVED
          ) {
            return;
          }

          if (!validateMilestoneTransition(milestone.status, REFERRAL_MILESTONE_STATUS.VOIDED)) {
            throw new Error(
              `Invalid milestone transition: ${milestone.status} -> ${REFERRAL_MILESTONE_STATUS.VOIDED}`,
            );
          }

          await ctx.db.patch(milestone._id, {
            status: REFERRAL_MILESTONE_STATUS.VOIDED,
            voided_reason: milestoneVoidReason,
          });
        }),
      );

      await ctx.db.patch(existingReferral._id, {
        status: REFERRAL_STATUS.VOIDED,
        voided_reason: reason,
        voided_by_admin_id: admin._id,
      });
    }

    const newReferralId = await ctx.db.insert("referrals", {
      referrer_user_id: newReferralCode.user_id,
      referred_user_id: targetReferredUserId,
      referral_code_id: newReferralCode._id,
      referral_type: targetReferralType,
      status: REFERRAL_STATUS.QUALIFIED,
      lead_id: scopedDemoRentalsConfig.scope.lead_id ?? targetLeadId,
      listing_id: targetListingId,
      closure_id: targetClosureId,
      building_id: scopedDemoRentalsConfig.scope.building_id,
      society_id: scopedDemoRentalsConfig.scope.society_id,
      voided_reason: undefined,
      voided_by_admin_id: undefined,
      attributed_by_admin_id: admin._id,
      attributed_at: now,
      attribution_source: "admin_override",
    });

    type NewMilestone = {
      milestone_type: MilestoneDoc["milestone_type"];
      amount: number;
      status: MilestoneDoc["status"];
      triggered_at: number | undefined;
    };

    const baseMilestones: NewMilestone[] = [
      {
        milestone_type: REFERRAL_MILESTONE_TYPE.SIGN_UP,
        amount: scopedDemoRentalsConfig.config.sign_up_bonus,
        status: REFERRAL_MILESTONE_STATUS.TRIGGERED,
        triggered_at: now,
      },
      {
        milestone_type: REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
        amount: milestoneAmounts.listingPublishedAmount,
        status: REFERRAL_MILESTONE_STATUS.PENDING,
        triggered_at: undefined,
      },
      {
        milestone_type: REFERRAL_MILESTONE_TYPE.DEAL_CLOSED,
        amount: milestoneAmounts.dealClosedAmount,
        status: REFERRAL_MILESTONE_STATUS.PENDING,
        triggered_at: undefined,
      },
    ];

    const replayedMilestones: NewMilestone[] =
      existingReferral === null
        ? baseMilestones
        : (() => {
            const oldMilestoneByType = new Map(
              oldMilestones.map((milestone) => [milestone.milestone_type, milestone]),
            );
            const replayed: NewMilestone[] = [];

            for (const milestone of baseMilestones) {
              const oldMilestone = oldMilestoneByType.get(milestone.milestone_type);

              if (!oldMilestone) {
                replayed.push(milestone);
                continue;
              }

              if (oldMilestone.status === REFERRAL_MILESTONE_STATUS.PAID) {
                continue;
              }

              if (
                oldMilestone.status === REFERRAL_MILESTONE_STATUS.TRIGGERED ||
                oldMilestone.status === REFERRAL_MILESTONE_STATUS.APPROVED
              ) {
                replayed.push({
                  ...milestone,
                  amount: oldMilestone.amount,
                  status: REFERRAL_MILESTONE_STATUS.TRIGGERED,
                  triggered_at: oldMilestone.triggered_at ?? now,
                });
                continue;
              }

              if (
                oldMilestone.status === REFERRAL_MILESTONE_STATUS.PENDING ||
                oldMilestone.status === REFERRAL_MILESTONE_STATUS.VOIDED
              ) {
                replayed.push({
                  ...milestone,
                  amount: oldMilestone.amount,
                  status: REFERRAL_MILESTONE_STATUS.PENDING,
                  triggered_at: undefined,
                });
                continue;
              }

              replayed.push(milestone);
            }

            return replayed;
          })();

    await Promise.all(
      replayedMilestones.map(
        async (milestone) =>
          await ctx.db.insert("referral_milestones", {
            referral_id: newReferralId,
            milestone_type: milestone.milestone_type,
            amount: milestone.amount,
            status: milestone.status,
            triggered_at: milestone.triggered_at,
            approved_by_admin_id: undefined,
            paid_at: undefined,
            payout_method: undefined,
            voided_reason: undefined,
          }),
      ),
    );

    await ctx.runMutation(internal.referralMilestones.updateReferralStatusFromMilestones, {
      referral_id: newReferralId,
    });

    if (existingReferral === null) {
      if (targetListingId) {
        await ctx.runMutation(internal.referralMilestones.trigger, {
          referral_id: newReferralId,
          milestone_type: REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED,
          source_event: `admin_override:listing_published:${targetListingId}`,
        });
      }

      if (targetClosureId) {
        await ctx.runMutation(internal.referralMilestones.trigger, {
          referral_id: newReferralId,
          milestone_type: REFERRAL_MILESTONE_TYPE.DEAL_CLOSED,
          source_event: `admin_override:closure_confirmed:${targetClosureId}`,
        });
      }
    }

    return newReferralId;
  },
});

export const getByDeal = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_VIEW);

    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
      .order("desc")
      .collect();

    const referral = referrals.find((candidate) => candidate.status !== REFERRAL_STATUS.VOIDED);

    if (!referral) {
      return null;
    }

    const [referrer, milestones] = await Promise.all([
      ctx.db.get(referral.referrer_user_id),
      ctx.db
        .query("referral_milestones")
        .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
        .collect(),
    ]);

    return {
      ...referral,
      referrer: referrer
        ? {
            _id: referrer._id,
            name: referrer.name,
          }
        : null,
      milestones,
      milestone_summary: summarizeMilestones(milestones),
    };
  },
});

export const getEstimatedBonus = query({
  args: {
    building_id: v.optional(v.id("buildings")),
    society_id: v.optional(v.id("societies")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_VIEW);

    const building = args.building_id ? await ctx.db.get(args.building_id) : null;
    const effectiveSocietyId = args.society_id ?? building?.society_id;

    const paidMilestones = await ctx.db
      .query("referral_milestones")
      .withIndex("by_status", (q) => q.eq("status", REFERRAL_MILESTONE_STATUS.PAID))
      .collect();

    const historicalRows = (
      await Promise.all(
        paidMilestones.map(async (milestone) => {
          const referral = await ctx.db.get(milestone.referral_id);

          if (
            !referral ||
            referral.referral_type === REFERRAL_TYPE.GUARD ||
            referral.status === REFERRAL_STATUS.VOIDED
          ) {
            return null;
          }

          let leadId = referral.lead_id;

          if (!leadId && referral.listing_id) {
            const listing = await ctx.db.get(referral.listing_id);
            leadId = listing?.lead_id;
          }

          if (!leadId && referral.closure_id) {
            const closure = await ctx.db.get(referral.closure_id);
            leadId = closure?.lead_id;
          }

          const lead = leadId ? await ctx.db.get(leadId) : null;

          return {
            amount: milestone.amount,
            building_id: lead?.building_id,
            society_id: lead?.society_id,
          };
        }),
      )
    ).filter((row): row is NonNullable<typeof row> => row !== null);

    const buildingAmounts =
      args.building_id === undefined
        ? []
        : historicalRows
            .filter((row) => row.building_id === args.building_id)
            .map((row) => row.amount);

    if (buildingAmounts.length >= 3) {
      return {
        estimated_amount: averageAmount(buildingAmounts),
        confidence: (buildingAmounts.length >= 10 ? "HIGH" : "MEDIUM") as EstimatedBonusConfidence,
        data_points: buildingAmounts.length,
      };
    }

    const societyAmounts =
      effectiveSocietyId === undefined
        ? []
        : historicalRows
            .filter((row) => row.society_id === effectiveSocietyId)
            .map((row) => row.amount);

    if (societyAmounts.length >= 3) {
      return {
        estimated_amount: averageAmount(societyAmounts),
        confidence: "MEDIUM" as EstimatedBonusConfidence,
        data_points: societyAmounts.length,
      };
    }

    const globalAmounts = historicalRows.map((row) => row.amount);

    if (globalAmounts.length >= 3) {
      return {
        estimated_amount: averageAmount(globalAmounts),
        confidence: "MEDIUM" as EstimatedBonusConfidence,
        data_points: globalAmounts.length,
      };
    }

    const [ownerConfig, tenantConfig] = await Promise.all([
      getResolvedConfig(ctx, REFERRAL_TYPE.OWNER_FINDING, args.building_id, effectiveSocietyId),
      getResolvedConfig(ctx, REFERRAL_TYPE.TENANT_FINDING, args.building_id, effectiveSocietyId),
    ]);

    const fallbackTotals = [ownerConfig, tenantConfig]
      .filter((config): config is NonNullable<typeof config> => config !== null)
      .map((config) => config.sign_up_bonus + config.finding_bonus_total);

    return {
      estimated_amount:
        fallbackTotals.length === 0
          ? 0
          : averageAmount(fallbackTotals.map((value) => Math.round(value))),
      confidence: "LOW" as EstimatedBonusConfidence,
      data_points: globalAmounts.length,
    };
  },
});

export const listByReferrer = query({
  args: {
    referral_type: v.optional(referralTypeValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const [asReferrer, asReferred] = await Promise.all([
      (async () => {
        const referrals = await ctx.db
          .query("referrals")
          .withIndex("by_referrer_user_id", (q) => q.eq("referrer_user_id", user._id))
          .order("desc")
          .collect();

        if (args.referral_type === undefined) {
          return referrals;
        }

        return referrals.filter((referral) => referral.referral_type === args.referral_type);
      })(),
      (async () => {
        const referred = await ctx.db
          .query("referrals")
          .withIndex("by_referred_user_id", (q) => q.eq("referred_user_id", user._id))
          .order("desc")
          .collect();

        if (args.referral_type === undefined) {
          return referred[0] ?? null;
        }

        return referred.find((referral) => referral.referral_type === args.referral_type) ?? null;
      })(),
    ]);

    const userIds = asReferrer.flatMap((referral) => [
      referral.referrer_user_id,
      referral.referred_user_id,
    ]);

    if (asReferred) {
      userIds.push(asReferred.referrer_user_id, asReferred.referred_user_id);
    }

    const userNameMap = await getUserNameMap(ctx, userIds);

    const referredGuards = await Promise.all(
      asReferrer.map(async (referral) => {
        const milestones = await ctx.db
          .query("referral_milestones")
          .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
          .collect();

        return {
          _id: referral._id,
          status: referral.status,
          referral_type: referral.referral_type,
          milestones,
          milestone_summary: summarizeMilestones(milestones),
        };
      }),
    );

    const referredByMilestones = asReferred
      ? await ctx.db
          .query("referral_milestones")
          .withIndex("by_referral_id", (q) => q.eq("referral_id", asReferred._id))
          .collect()
      : [];

    const referredBy = asReferred
      ? {
          _id: asReferred._id,
          status: asReferred.status,
          referral_type: asReferred.referral_type,
          referrer_name: userNameMap.get(asReferred.referrer_user_id) ?? "Unknown",
          milestones: referredByMilestones,
          milestone_summary: summarizeMilestones(referredByMilestones),
        }
      : null;

    return {
      referredBy,
      referredGuards,
    };
  },
});

export const trackTenantReferralShare = mutation({
  args: {
    method: tenantReferralShareMethodValidator,
    referral_code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    await ctx.db.insert("audit_logs", {
      actor_user_id: tenant._id,
      actor_type: "TENANT",
      action: "TENANT_REFERRAL_SHARE",
      entity_type: "referrals",
      entity_id: String(tenant._id),
      changes: undefined,
      metadata: {
        event_name: "tenant.referral_shared",
        method: args.method,
        referral_code: args.referral_code?.trim().toUpperCase() || undefined,
      },
    });

    return { tracked: true };
  },
});

export const getAnalytics = query({
  args: {
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
    time_window: v.optional(referralAnalyticsTimeWindowValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.ANALYTICS_VIEW);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    const timeWindow = args.time_window ?? "all_time";
    const cutoffFromTimeWindow = getTimeWindowCutoff(timeWindow);
    let effectiveDateFrom: number | undefined = args.date_from;

    if (
      effectiveDateFrom === undefined &&
      args.date_to === undefined &&
      cutoffFromTimeWindow !== null
    ) {
      effectiveDateFrom = cutoffFromTimeWindow;
    }

    const effectiveDateTo = args.date_to;

    const [allReferrals, allCodes] = await Promise.all([
      ctx.db.query("referrals").collect(),
      ctx.db.query("referral_codes").collect(),
    ]);

    const referrals = allReferrals.filter((referral) => {
      if (effectiveDateFrom != null && referral._creationTime < effectiveDateFrom) {
        return false;
      }

      if (effectiveDateTo !== undefined && referral._creationTime > effectiveDateTo) {
        return false;
      }

      return true;
    });

    const generatedCodes = allCodes.filter((code) => {
      if (effectiveDateFrom != null && code._creationTime < effectiveDateFrom) {
        return false;
      }

      if (effectiveDateTo !== undefined && code._creationTime > effectiveDateTo) {
        return false;
      }

      return true;
    });

    const milestonesByReferral = await Promise.all(
      referrals.map(
        async (referral) =>
          await ctx.db
            .query("referral_milestones")
            .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
            .collect(),
      ),
    );
    const milestones = milestonesByReferral.flat();

    const referralTypeById = new Map(
      referrals.map((referral) => [referral._id, referral.referral_type]),
    );

    const statusBreakdown = {
      [REFERRAL_STATUS.PENDING]: 0,
      [REFERRAL_STATUS.QUALIFIED]: 0,
      [REFERRAL_STATUS.PARTIALLY_PAID]: 0,
      [REFERRAL_STATUS.FULLY_PAID]: 0,
      [REFERRAL_STATUS.VOIDED]: 0,
    };

    const typeBreakdown = {
      [REFERRAL_TYPE.GUARD]: {
        count: 0,
        approved_payout_paise: 0,
        paid_payout_paise: 0,
      },
      [REFERRAL_TYPE.TENANT_FINDING]: {
        count: 0,
        approved_payout_paise: 0,
        paid_payout_paise: 0,
      },
      [REFERRAL_TYPE.OWNER_FINDING]: {
        count: 0,
        approved_payout_paise: 0,
        paid_payout_paise: 0,
      },
    };

    for (const referral of referrals) {
      statusBreakdown[referral.status] += 1;
      typeBreakdown[referral.referral_type].count += 1;
    }

    for (const milestone of milestones) {
      const referralType = referralTypeById.get(milestone.referral_id);

      if (!referralType) {
        continue;
      }

      if (milestone.status === REFERRAL_MILESTONE_STATUS.APPROVED) {
        typeBreakdown[referralType].approved_payout_paise += milestone.amount;
      }

      if (milestone.status === REFERRAL_MILESTONE_STATUS.PAID) {
        typeBreakdown[referralType].paid_payout_paise += milestone.amount;
      }
    }

    const totalPotentialPayoutPaise = milestones.reduce(
      (sum, milestone) => sum + milestone.amount,
      0,
    );
    const totalApprovedPayoutPaise = milestones
      .filter((milestone) => milestone.status === REFERRAL_MILESTONE_STATUS.APPROVED)
      .reduce((sum, milestone) => sum + milestone.amount, 0);
    const totalPaidPayoutPaise = milestones
      .filter((milestone) => milestone.status === REFERRAL_MILESTONE_STATUS.PAID)
      .reduce((sum, milestone) => sum + milestone.amount, 0);

    const monthKeys =
      args.date_from !== undefined || args.date_to !== undefined
        ? getISTMonthKeysInRange(
            effectiveDateFrom ??
              Math.min(
                ...referrals.map((referral) => referral._creationTime),
                effectiveDateTo ?? Date.now(),
              ),
            effectiveDateTo ?? Date.now(),
          )
        : getLastNISTMonthKeys(timeWindow === "all_time" ? 12 : 6);
    const monthSet = new Set(monthKeys);
    const monthlyMap = new Map<string, { referrals: number; paid_payout_paise: number }>();

    for (const key of monthKeys) {
      monthlyMap.set(key, { referrals: 0, paid_payout_paise: 0 });
    }

    for (const referral of referrals) {
      const monthKey = toISTMonthKey(referral._creationTime);
      if (!monthSet.has(monthKey)) {
        continue;
      }

      const row = monthlyMap.get(monthKey);
      if (!row) {
        continue;
      }

      row.referrals += 1;
    }

    for (const milestone of milestones) {
      if (milestone.status !== REFERRAL_MILESTONE_STATUS.PAID) {
        continue;
      }

      const monthKey = toISTMonthKey(milestone.paid_at ?? milestone._creationTime);
      if (!monthSet.has(monthKey)) {
        continue;
      }

      const row = monthlyMap.get(monthKey);
      if (!row) {
        continue;
      }

      row.paid_payout_paise += milestone.amount;
    }

    const signupsCaptured = referrals.filter(
      (referral) =>
        referral.status !== REFERRAL_STATUS.VOIDED &&
        referral.referral_type !== REFERRAL_TYPE.GUARD,
    ).length;
    const dealsClosed = milestones.filter(
      (milestone) =>
        milestone.milestone_type === REFERRAL_MILESTONE_TYPE.DEAL_CLOSED &&
        (milestone.status === REFERRAL_MILESTONE_STATUS.TRIGGERED ||
          milestone.status === REFERRAL_MILESTONE_STATUS.APPROVED ||
          milestone.status === REFERRAL_MILESTONE_STATUS.PAID),
    ).length;

    return {
      total_referrals: referrals.length,
      status_breakdown: statusBreakdown,
      type_breakdown: typeBreakdown,
      total_potential_payout_paise: totalPotentialPayoutPaise,
      total_approved_payout_paise: totalApprovedPayoutPaise,
      total_paid_payout_paise: totalPaidPayoutPaise,
      total_unpaid_payout_paise: totalPotentialPayoutPaise - totalPaidPayoutPaise,
      funnel_metrics: {
        codes_generated: generatedCodes.length,
        signups_captured: signupsCaptured,
        deals_closed: dealsClosed,
      },
      monthly_trend: monthKeys.map((month) => ({
        month,
        referrals: monthlyMap.get(month)?.referrals ?? 0,
        paid_payout_paise: monthlyMap.get(month)?.paid_payout_paise ?? 0,
      })),
    };
  },
});

export const listAll = query({
  args: {
    paginationOpts: paginationOptsValidator,
    referral_type: v.optional(referralTypeValidator),
    status: v.optional(referralStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_VIEW);

    let paginatedResults: PaginationResult<ReferralDoc>;

    if (args.status !== undefined) {
      paginatedResults = await ctx.db
        .query("referrals")
        .withIndex("by_status", (q) => q.eq("status", args.status as ReferralDoc["status"]))
        .filter((q) =>
          args.referral_type === undefined
            ? q.eq(q.field("status"), args.status as ReferralDoc["status"])
            : q.eq(q.field("referral_type"), args.referral_type as ReferralDoc["referral_type"]),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.referral_type !== undefined) {
      paginatedResults = await ctx.db
        .query("referrals")
        .withIndex("by_referral_type", (q) =>
          q.eq("referral_type", args.referral_type as ReferralDoc["referral_type"]),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      paginatedResults = await ctx.db
        .query("referrals")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const filteredPage = paginatedResults.page.filter((referral) => {
      if (args.referral_type !== undefined && referral.referral_type !== args.referral_type) {
        return false;
      }

      if (args.status !== undefined && referral.status !== args.status) {
        return false;
      }

      return true;
    });

    const userNameMap = await getUserNameMap(
      ctx,
      filteredPage.flatMap((referral) => [referral.referrer_user_id, referral.referred_user_id]),
    );

    const milestoneTotalMap = new Map<Id<"referrals">, number>();

    await Promise.all(
      filteredPage.map(async (referral) => {
        const milestones = await ctx.db
          .query("referral_milestones")
          .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
          .collect();

        milestoneTotalMap.set(
          referral._id,
          milestones.reduce((sum, milestone) => sum + milestone.amount, 0),
        );
      }),
    );

    return {
      ...paginatedResults,
      page: filteredPage.map((referral) => ({
        ...referral,
        referrer_name: userNameMap.get(referral.referrer_user_id) ?? "Unknown",
        referred_name: userNameMap.get(referral.referred_user_id) ?? "Unknown",
        total_bonus: milestoneTotalMap.get(referral._id) ?? 0,
      })),
    };
  },
});

export const getById = query({
  args: {
    id: v.id("referrals"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.REFERRALS_VIEW);

    const referral = await ctx.db.get(args.id);

    if (!referral) {
      return null;
    }

    const [referrer, referred, milestones] = await Promise.all([
      ctx.db.get(referral.referrer_user_id),
      ctx.db.get(referral.referred_user_id),
      ctx.db
        .query("referral_milestones")
        .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
        .collect(),
    ]);

    return {
      referral,
      referrer,
      referred,
      milestones,
      milestone_summary: summarizeMilestones(milestones),
    };
  },
});

export const voidReferral = mutation({
  args: {
    id: v.id("referrals"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.REFERRALS_MANAGE);
    const referral = await ctx.db.get(args.id);

    if (!referral) {
      throw new Error("Referral not found");
    }

    const reason = args.reason.trim();

    if (!reason) {
      throw new Error("reason is required");
    }

    if (!validateReferralTransition(referral.status, REFERRAL_STATUS.VOIDED)) {
      throw new Error(
        `Invalid referral transition: ${referral.status} -> ${REFERRAL_STATUS.VOIDED}`,
      );
    }

    await ctx.db.patch(args.id, {
      status: REFERRAL_STATUS.VOIDED,
      voided_reason: reason,
      voided_by_admin_id: admin._id,
    });

    const milestones = await ctx.db
      .query("referral_milestones")
      .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
      .collect();

    const cascadeReason = `Parent referral voided: ${reason}`;

    await Promise.all(
      milestones.map(async (milestone) => {
        if (
          milestone.status === REFERRAL_MILESTONE_STATUS.PAID ||
          milestone.status === REFERRAL_MILESTONE_STATUS.VOIDED
        ) {
          return;
        }

        if (!validateMilestoneTransition(milestone.status, REFERRAL_MILESTONE_STATUS.VOIDED)) {
          throw new Error(
            `Invalid milestone transition: ${milestone.status} -> ${REFERRAL_MILESTONE_STATUS.VOIDED}`,
          );
        }

        await ctx.db.patch(milestone._id, {
          status: REFERRAL_MILESTONE_STATUS.VOIDED,
          voided_reason: cascadeReason,
        });
      }),
    );

    return await ctx.db.get(args.id);
  },
});

export { voidReferral as void };

export const checkFirstLeadBonus = internalMutation({
  args: {
    guard_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user_id", (q) => q.eq("referred_user_id", args.guard_user_id))
      .filter((q) => q.eq(q.field("referral_type"), REFERRAL_TYPE.GUARD))
      .filter((q) => q.neq(q.field("status"), REFERRAL_STATUS.VOIDED))
      .first();

    if (!referral) {
      return;
    }

    const milestone = await ctx.db
      .query("referral_milestones")
      .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
      .filter((q) => q.eq(q.field("milestone_type"), REFERRAL_MILESTONE_TYPE.FIRST_VERIFIED_LEAD))
      .first();

    if (!milestone || milestone.milestone_type !== REFERRAL_MILESTONE_TYPE.FIRST_VERIFIED_LEAD) {
      return;
    }

    if (milestone.status !== REFERRAL_MILESTONE_STATUS.PENDING) {
      return;
    }

    const verifiedLeads = await ctx.db
      .query("leads")
      .withIndex("by_guard_and_status", (q) =>
        q.eq("submitted_by_guard_id", args.guard_user_id).eq("status", LEAD_STATUS.VERIFIED),
      )
      .collect();

    if (verifiedLeads.length !== 1) {
      return;
    }

    if (!validateMilestoneTransition(milestone.status, REFERRAL_MILESTONE_STATUS.TRIGGERED)) {
      throw new Error(
        `Invalid milestone transition: ${milestone.status} -> ${REFERRAL_MILESTONE_STATUS.TRIGGERED}`,
      );
    }

    await ctx.db.patch(milestone._id, {
      status: REFERRAL_MILESTONE_STATUS.TRIGGERED,
      triggered_at: Date.now(),
    });

    if (referral.status === REFERRAL_STATUS.PENDING) {
      if (!validateReferralTransition(referral.status, REFERRAL_STATUS.QUALIFIED)) {
        throw new Error(
          `Invalid referral transition: ${referral.status} -> ${REFERRAL_STATUS.QUALIFIED}`,
        );
      }

      await ctx.db.patch(referral._id, {
        status: REFERRAL_STATUS.QUALIFIED,
      });
    }
  },
});
