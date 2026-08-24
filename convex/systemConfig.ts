import { v } from "convex/values";
import {
  P44_CONFIG_KEYS,
  P44_DEFAULTS,
  PERMISSIONS,
  SYSTEM_CONFIG_KEYS,
  USER_STATUS,
  USER_TYPE,
  type SystemConfigKey,
} from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAdmin, requireBackoffice, requirePermission } from "./auth.helpers";
import { resolveP44RolloutState } from "./fieldWorkerRollout";
import { mutation, query } from "./functions";
import { getSystemConfigBoolean, getSystemConfigStringArray } from "./systemConfig.helpers";

const VALID_SYSTEM_CONFIG_KEYS = new Set<SystemConfigKey>(Object.values(SYSTEM_CONFIG_KEYS));
const PUBLIC_SYSTEM_CONFIG_KEYS = new Set<SystemConfigKey>([
  SYSTEM_CONFIG_KEYS.DEMORENTALS_CONTACT_PHONE,
  SYSTEM_CONFIG_KEYS.DEMORENTALS_WHATSAPP_PHONE,
]);

function isSystemConfigKey(key: string): key is SystemConfigKey {
  return VALID_SYSTEM_CONFIG_KEYS.has(key as SystemConfigKey);
}

type SystemConfigResponse = Omit<Doc<"system_config">, "key"> & { key: string };
type OpsRolloutConfigResponse = {
  rollout_state: "DISABLED" | "CANARY" | "ENABLED";
  enabled: boolean;
  canary_user_ids: string[];
  canary_users: Array<{
    user_id: Id<"users">;
    name: string;
    phone: string | undefined;
    status: Doc<"users">["status"];
    has_guard_profile: boolean;
  }>;
  invalid_canary_user_ids: string[];
  available_ops_users: Array<{
    user_id: Id<"users">;
    name: string;
    phone: string | undefined;
    has_guard_profile: boolean;
  }>;
};

type DbMutationContext = Pick<MutationCtx, "db">;

const OPS_FIELD_WORKER_ENABLED_KEY =
  P44_CONFIG_KEYS.OPS_FIELD_WORKER_ENABLED as Doc<"system_config">["key"];
const OPS_FIELD_WORKER_ENABLED_SYSTEM_CONFIG_KEY =
  P44_CONFIG_KEYS.OPS_FIELD_WORKER_ENABLED as SystemConfigKey;
const OPS_FIELD_WORKER_CANARY_USER_IDS_KEY =
  P44_CONFIG_KEYS.OPS_FIELD_WORKER_CANARY_USER_IDS as Doc<"system_config">["key"];
const OPS_FIELD_WORKER_CANARY_USER_IDS_SYSTEM_CONFIG_KEY =
  P44_CONFIG_KEYS.OPS_FIELD_WORKER_CANARY_USER_IDS as SystemConfigKey;

function dedupeAndSortUserIds(userIds: readonly Id<"users">[]): Id<"users">[] {
  return [...new Set(userIds)].sort((a, b) => a.localeCompare(b));
}

async function upsertSystemConfigValue(
  ctx: DbMutationContext,
  args: {
    key: Doc<"system_config">["key"];
    value: string;
    updated_by_admin_id: Id<"users">;
  },
): Promise<Id<"system_config">> {
  const existingConfig = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", args.key))
    .first();

  if (existingConfig) {
    if (existingConfig.value === args.value) {
      return existingConfig._id;
    }

    await ctx.db.patch(existingConfig._id, {
      value: args.value,
      updated_by_admin_id: args.updated_by_admin_id,
    });

    return existingConfig._id;
  }

  return await ctx.db.insert("system_config", {
    key: args.key,
    value: args.value,
    updated_by_admin_id: args.updated_by_admin_id,
  });
}

async function validateOpsCanaryUserIds(
  ctx: DbMutationContext,
  userIds: readonly Id<"users">[],
): Promise<Id<"users">[]> {
  const normalizedUserIds = dedupeAndSortUserIds(userIds);

  const users = await Promise.all(normalizedUserIds.map((userId) => ctx.db.get(userId)));

  for (let index = 0; index < normalizedUserIds.length; index += 1) {
    const userId = normalizedUserIds[index];
    const user = users[index];

    if (!user) {
      throw new Error(`Invalid canary user: ${userId} does not exist`);
    }

    if (user.user_type !== USER_TYPE.OPS) {
      throw new Error(`Invalid canary user: ${userId} is not an OPS user`);
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      throw new Error(`Invalid canary user: ${userId} is not ACTIVE`);
    }
  }

  return normalizedUserIds;
}

export const get = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isSystemConfigKey(args.key)) {
      return null;
    }

    const configKey = args.key;
    const configTableKey = configKey as Doc<"system_config">["key"];

    if (!PUBLIC_SYSTEM_CONFIG_KEYS.has(configKey)) {
      await requireBackoffice(ctx);
    }

    return await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", configTableKey))
      .first();
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.SYSTEM_CONFIGURE);

    const entries = await ctx.db.query("system_config").collect();

    return entries as SystemConfigResponse[];
  },
});

export const getOpsFieldWorkerRollout = query({
  args: {},
  handler: async (ctx): Promise<OpsRolloutConfigResponse> => {
    await requireAdmin(ctx);

    const [rolloutState, enabled, canaryUserIds, activeOpsUsers, guardProfiles] = await Promise.all(
      [
        resolveP44RolloutState(ctx),
        getSystemConfigBoolean(
          ctx,
          OPS_FIELD_WORKER_ENABLED_SYSTEM_CONFIG_KEY,
          P44_DEFAULTS.OPS_FIELD_WORKER_ENABLED,
        ),
        getSystemConfigStringArray(
          ctx,
          OPS_FIELD_WORKER_CANARY_USER_IDS_SYSTEM_CONFIG_KEY,
          P44_DEFAULTS.OPS_FIELD_WORKER_CANARY_USER_IDS,
        ),
        ctx.db
          .query("users")
          .withIndex("by_type_and_status", (q) =>
            q.eq("user_type", USER_TYPE.OPS).eq("status", USER_STATUS.ACTIVE),
          )
          .collect(),
        ctx.db.query("guard_profiles").collect(),
      ],
    );

    const hasGuardProfileByUserId = new Set(guardProfiles.map((profile) => profile.user_id));
    const availableOpsUsers = activeOpsUsers
      .map((user) => ({
        user_id: user._id,
        name: user.name,
        phone: user.phone,
        has_guard_profile: hasGuardProfileByUserId.has(user._id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const normalizedCanaryUserIds = [...new Set(canaryUserIds)];
    const canaryUsers = await Promise.all(
      normalizedCanaryUserIds.map(async (userId) => {
        const user = await ctx.db.get(userId as Id<"users">);
        return { userId, user };
      }),
    );

    const validCanaryUsers: OpsRolloutConfigResponse["canary_users"] = [];
    const invalidCanaryUserIds: string[] = [];

    for (const entry of canaryUsers) {
      const user = entry.user;

      if (!user || user.user_type !== USER_TYPE.OPS || user.status !== USER_STATUS.ACTIVE) {
        invalidCanaryUserIds.push(entry.userId);
        continue;
      }

      validCanaryUsers.push({
        user_id: user._id,
        name: user.name,
        phone: user.phone,
        status: user.status,
        has_guard_profile: hasGuardProfileByUserId.has(user._id),
      });
    }

    return {
      rollout_state: rolloutState,
      enabled,
      canary_user_ids: normalizedCanaryUserIds,
      canary_users: validCanaryUsers,
      invalid_canary_user_ids: invalidCanaryUserIds,
      available_ops_users: availableOpsUsers,
    };
  },
});

export const setOpsFieldWorkerEnabled = mutation({
  args: {
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    return await upsertSystemConfigValue(ctx, {
      key: OPS_FIELD_WORKER_ENABLED_KEY,
      value: String(args.enabled),
      updated_by_admin_id: admin._id,
    });
  },
});

export const setOpsFieldWorkerCanaryUserIds = mutation({
  args: {
    user_ids: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const validCanaryUserIds = await validateOpsCanaryUserIds(ctx, args.user_ids);

    return await upsertSystemConfigValue(ctx, {
      key: OPS_FIELD_WORKER_CANARY_USER_IDS_KEY,
      value: JSON.stringify(validCanaryUserIds),
      updated_by_admin_id: admin._id,
    });
  },
});

export const addOpsFieldWorkerCanaryUser = mutation({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const currentCanaryUserIds = await getSystemConfigStringArray(
      ctx,
      OPS_FIELD_WORKER_CANARY_USER_IDS_SYSTEM_CONFIG_KEY,
      P44_DEFAULTS.OPS_FIELD_WORKER_CANARY_USER_IDS,
    );

    const validCanaryUserIds = await validateOpsCanaryUserIds(ctx, [
      ...(currentCanaryUserIds as Id<"users">[]),
      args.user_id,
    ]);

    return await upsertSystemConfigValue(ctx, {
      key: OPS_FIELD_WORKER_CANARY_USER_IDS_KEY,
      value: JSON.stringify(validCanaryUserIds),
      updated_by_admin_id: admin._id,
    });
  },
});

export const removeOpsFieldWorkerCanaryUser = mutation({
  args: {
    user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const currentCanaryUserIds = await getSystemConfigStringArray(
      ctx,
      OPS_FIELD_WORKER_CANARY_USER_IDS_SYSTEM_CONFIG_KEY,
      P44_DEFAULTS.OPS_FIELD_WORKER_CANARY_USER_IDS,
    );

    const nextCanaryUserIds = currentCanaryUserIds.filter((userId) => userId !== args.user_id);

    return await upsertSystemConfigValue(ctx, {
      key: OPS_FIELD_WORKER_CANARY_USER_IDS_KEY,
      value: JSON.stringify(nextCanaryUserIds),
      updated_by_admin_id: admin._id,
    });
  },
});

export const set = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, "system.configure");

    if (!isSystemConfigKey(args.key)) {
      throw new Error(`Invalid system config key: ${args.key}`);
    }

    const configKey = args.key;
    const configTableKey = configKey as Doc<"system_config">["key"];

    const existingConfig = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", configTableKey))
      .first();

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        value: args.value,
        updated_by_admin_id: admin._id,
      });

      return existingConfig._id;
    }

    return await ctx.db.insert("system_config", {
      key: configTableKey,
      value: args.value,
      updated_by_admin_id: admin._id,
    });
  },
});
