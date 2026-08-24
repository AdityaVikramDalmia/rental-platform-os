import { P44_CONFIG_KEYS, P44_DEFAULTS, USER_STATUS, USER_TYPE } from "../../lib/constants";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { P44RolloutState } from "../fieldWorkerContracts";

type FixtureCtx = Pick<MutationCtx, "db">;

type GuardUserStatus = Doc<"users">["status"];
type GuardType = Doc<"guard_profiles">["guard_type"];

type BaseFixtureResult = {
  userId: Id<"users">;
  workosUserId: string;
  phone: string;
};

type GuardFixtureResult = BaseFixtureResult & {
  guardProfileId: Id<"guard_profiles">;
  societyId: Id<"societies">;
};

type GuardFixtureOverrides = {
  workosUserId?: string;
  phone?: string;
  name?: string;
  status?: GuardUserStatus;
  mustChangePassword?: boolean;
  societyId?: Id<"societies">;
  guardType?: GuardType;
  hasSeenOnboarding?: boolean;
};

type OpsFixtureOverrides = {
  workosUserId?: string;
  phone?: string;
  name?: string;
  status?: GuardUserStatus;
  mustChangePassword?: boolean;
};

type OpsWithProfileFixtureOverrides = OpsFixtureOverrides & {
  societyId?: Id<"societies">;
  guardType?: GuardType;
  hasSeenOnboarding?: boolean;
};

let fixtureSequence = 0;

function nextFixtureToken(prefix: string): string {
  fixtureSequence += 1;
  return `${prefix}_${String(fixtureSequence).padStart(4, "0")}`;
}

function nextPhoneNumber(): string {
  fixtureSequence += 1;
  return `9${String(fixtureSequence).padStart(9, "0")}`;
}

async function createFixtureAdmin(ctx: FixtureCtx): Promise<Id<"users">> {
  const workosUserId = nextFixtureToken("workos_fixture_admin");

  return await ctx.db.insert("users", {
    workos_user_id: workosUserId,
    user_type: USER_TYPE.ADMIN,
    name: "Field Worker Fixture Admin",
    email: `${workosUserId}@example.com`,
    status: USER_STATUS.ACTIVE,
    must_change_password: false,
  });
}

async function ensureSocietyId(
  ctx: FixtureCtx,
  societyId?: Id<"societies">,
): Promise<Id<"societies">> {
  if (societyId) {
    return societyId;
  }

  const adminId = await createFixtureAdmin(ctx);

  return await ctx.db.insert("societies", {
    name: `Fixture Society ${nextFixtureToken("society")}`,
    city: "Mumbai",
    status: "ACTIVE",
    created_by_admin_id: adminId,
  });
}

async function upsertSystemConfigValue(
  ctx: FixtureCtx,
  updatedByAdminId: Id<"users">,
  key: string,
  value: string,
): Promise<void> {
  const configKey = key as Doc<"system_config">["key"];
  const existing = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", configKey))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      value,
      updated_by_admin_id: updatedByAdminId,
    });
    return;
  }

  await ctx.db.insert("system_config", {
    key: configKey,
    value,
    updated_by_admin_id: updatedByAdminId,
  });
}

export async function createGuardFixture(
  ctx: FixtureCtx,
  overrides: GuardFixtureOverrides = {},
): Promise<GuardFixtureResult> {
  const workosUserId = overrides.workosUserId ?? nextFixtureToken("workos_guard_fixture");
  const phone = overrides.phone ?? nextPhoneNumber();
  const societyId = await ensureSocietyId(ctx, overrides.societyId);

  const userId = await ctx.db.insert("users", {
    workos_user_id: workosUserId,
    user_type: USER_TYPE.GUARD,
    name: overrides.name ?? "Field Worker Fixture Guard",
    phone,
    email: `${phone}@guards.local`,
    status: overrides.status ?? USER_STATUS.ACTIVE,
    must_change_password: overrides.mustChangePassword ?? false,
  });

  const guardProfileId = await ctx.db.insert("guard_profiles", {
    user_id: userId,
    society_id: societyId,
    guard_type: overrides.guardType ?? "MAIN_GATE",
    has_seen_onboarding: overrides.hasSeenOnboarding ?? true,
  });

  return {
    userId,
    guardProfileId,
    societyId,
    workosUserId,
    phone,
  };
}

export async function createOpsFixture(
  ctx: FixtureCtx,
  overrides: OpsFixtureOverrides = {},
): Promise<BaseFixtureResult> {
  const workosUserId = overrides.workosUserId ?? nextFixtureToken("workos_ops_fixture");
  const phone = overrides.phone ?? nextPhoneNumber();

  const userId = await ctx.db.insert("users", {
    workos_user_id: workosUserId,
    user_type: USER_TYPE.OPS,
    name: overrides.name ?? "Field Worker Fixture OPS",
    phone,
    email: `${phone}@ops.local`,
    status: overrides.status ?? USER_STATUS.ACTIVE,
    must_change_password: overrides.mustChangePassword ?? false,
  });

  return {
    userId,
    workosUserId,
    phone,
  };
}

export async function createOpsWithProfileFixture(
  ctx: FixtureCtx,
  overrides: OpsWithProfileFixtureOverrides = {},
): Promise<GuardFixtureResult> {
  const ops = await createOpsFixture(ctx, overrides);
  const societyId = await ensureSocietyId(ctx, overrides.societyId);

  const guardProfileId = await ctx.db.insert("guard_profiles", {
    user_id: ops.userId,
    society_id: societyId,
    guard_type: overrides.guardType ?? "MAIN_GATE",
    has_seen_onboarding: overrides.hasSeenOnboarding ?? true,
  });

  return {
    ...ops,
    guardProfileId,
    societyId,
  };
}

export async function setRolloutState(
  ctx: FixtureCtx,
  state: P44RolloutState,
  canaryUserIds: string[] = [],
): Promise<void> {
  const updatedByAdminId = await createFixtureAdmin(ctx);
  const defaultSocietyId = await ensureSocietyId(ctx);

  let opsFieldWorkerEnabled: boolean = P44_DEFAULTS.OPS_FIELD_WORKER_ENABLED;
  let opsFieldWorkerCanaryUserIds: string[] = [...P44_DEFAULTS.OPS_FIELD_WORKER_CANARY_USER_IDS];

  if (state === "CANARY") {
    opsFieldWorkerCanaryUserIds = canaryUserIds;
  }

  if (state === "ENABLED") {
    opsFieldWorkerEnabled = true;
    opsFieldWorkerCanaryUserIds = canaryUserIds;
  }

  await upsertSystemConfigValue(
    ctx,
    updatedByAdminId,
    P44_CONFIG_KEYS.OPS_FIELD_WORKER_ENABLED,
    String(opsFieldWorkerEnabled),
  );
  await upsertSystemConfigValue(
    ctx,
    updatedByAdminId,
    P44_CONFIG_KEYS.OPS_FIELD_WORKER_CANARY_USER_IDS,
    JSON.stringify(opsFieldWorkerCanaryUserIds),
  );
  await upsertSystemConfigValue(
    ctx,
    updatedByAdminId,
    P44_CONFIG_KEYS.DEFAULT_UNASSIGNED_SOCIETY_ID,
    defaultSocietyId,
  );
}
