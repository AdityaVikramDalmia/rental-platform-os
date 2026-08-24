import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import { CONFIG_VERSION_STATUS, PERMISSIONS, SYSTEM_CONFIG_KEYS } from "../lib/constants";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requirePermission } from "./auth.helpers";
import { mutation, query } from "./functions";

const configVersionStatusValidator = v.union(
  v.literal(CONFIG_VERSION_STATUS.DRAFT),
  v.literal(CONFIG_VERSION_STATUS.ACTIVE),
  v.literal(CONFIG_VERSION_STATUS.ARCHIVED),
);

type IncentiveConfigVersionDoc = Doc<"incentive_config_versions">;

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeJsonString(value: string, fieldName: string): string {
  const normalized = normalizeRequiredString(value, fieldName);

  try {
    const parsed = JSON.parse(normalized) as unknown;
    return JSON.stringify(parsed);
  } catch {
    throw new Error(`${fieldName} must be valid JSON`);
  }
}

function normalizeOptionalJsonString(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeJsonString(value, fieldName);
}

async function upsertActiveVersionPointer(
  ctx: MutationCtx,
  updatedByAdminId: Id<"users">,
  versionCode: string,
): Promise<void> {
  const existing = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ACTIVE_CONFIG_VERSION))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      value: versionCode,
      updated_by_admin_id: updatedByAdminId,
    });
    return;
  }

  await ctx.db.insert("system_config", {
    key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ACTIVE_CONFIG_VERSION,
    value: versionCode,
    updated_by_admin_id: updatedByAdminId,
  });
}

export const createDraft = mutation({
  args: {
    version_code: v.string(),
    config_json: v.string(),
    optimizer_bounds_json: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const versionCode = normalizeRequiredString(args.version_code, "version_code");
    const existingVersion = await ctx.db
      .query("incentive_config_versions")
      .withIndex("by_version", (q) => q.eq("version_code", versionCode))
      .first();

    if (existingVersion) {
      throw new Error(`Config version '${versionCode}' already exists`);
    }

    const now = Date.now();
    return await ctx.db.insert("incentive_config_versions", {
      version_code: versionCode,
      status: CONFIG_VERSION_STATUS.DRAFT,
      config_json: normalizeJsonString(args.config_json, "config_json"),
      optimizer_bounds_json: normalizeOptionalJsonString(
        args.optimizer_bounds_json,
        "optimizer_bounds_json",
      ),
      description: normalizeOptionalString(args.description),
      created_by: admin._id,
      activated_by: undefined,
      activated_at: undefined,
      archived_by: undefined,
      archived_at: undefined,
      created_at: now,
      updated_at: undefined,
    });
  },
});

export const updateDraft = mutation({
  args: {
    id: v.id("incentive_config_versions"),
    version_code: v.optional(v.string()),
    config_json: v.optional(v.string()),
    optimizer_bounds_json: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const existingVersion = await ctx.db.get(args.id);
    if (!existingVersion) {
      throw new Error("Config version not found");
    }

    if (existingVersion.status !== CONFIG_VERSION_STATUS.DRAFT) {
      throw new Error("Only DRAFT config versions can be updated");
    }

    const nextVersionCode =
      args.version_code !== undefined
        ? normalizeRequiredString(args.version_code, "version_code")
        : existingVersion.version_code;

    if (nextVersionCode !== existingVersion.version_code) {
      const conflictingVersion = await ctx.db
        .query("incentive_config_versions")
        .withIndex("by_version", (q) => q.eq("version_code", nextVersionCode))
        .first();

      if (conflictingVersion && conflictingVersion._id !== existingVersion._id) {
        throw new Error(`Config version '${nextVersionCode}' already exists`);
      }
    }

    const nextConfigJson =
      args.config_json !== undefined
        ? normalizeJsonString(args.config_json, "config_json")
        : existingVersion.config_json;

    const nextOptimizerBoundsJson =
      args.optimizer_bounds_json !== undefined
        ? normalizeJsonString(args.optimizer_bounds_json, "optimizer_bounds_json")
        : existingVersion.optimizer_bounds_json;

    const nextDescription =
      args.description !== undefined
        ? normalizeOptionalString(args.description)
        : existingVersion.description;

    await ctx.db.patch(existingVersion._id, {
      version_code: nextVersionCode,
      config_json: nextConfigJson,
      optimizer_bounds_json: nextOptimizerBoundsJson,
      description: nextDescription,
      updated_at: Date.now(),
    });

    return await ctx.db.get(existingVersion._id);
  },
});

export const activate = mutation({
  args: {
    id: v.id("incentive_config_versions"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const versionToActivate = await ctx.db.get(args.id);
    if (!versionToActivate) {
      throw new Error("Config version not found");
    }

    if (versionToActivate.status !== CONFIG_VERSION_STATUS.DRAFT) {
      throw new Error("Only DRAFT config versions can be activated");
    }

    const now = Date.now();
    const currentlyActiveVersions = await ctx.db
      .query("incentive_config_versions")
      .withIndex("by_status", (q) => q.eq("status", CONFIG_VERSION_STATUS.ACTIVE))
      .collect();

    for (const activeVersion of currentlyActiveVersions) {
      await ctx.db.patch(activeVersion._id, {
        status: CONFIG_VERSION_STATUS.ARCHIVED,
        archived_by: admin._id,
        archived_at: now,
        updated_at: now,
      });
    }

    await ctx.db.patch(versionToActivate._id, {
      status: CONFIG_VERSION_STATUS.ACTIVE,
      activated_by: admin._id,
      activated_at: now,
      updated_at: now,
    });

    await upsertActiveVersionPointer(ctx, admin._id, versionToActivate.version_code);

    return await ctx.db.get(versionToActivate._id);
  },
});

export const archive = mutation({
  args: {
    id: v.id("incentive_config_versions"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.COMMISSION_CONFIGURE);

    const existingVersion = await ctx.db.get(args.id);
    if (!existingVersion) {
      throw new Error("Config version not found");
    }

    if (
      existingVersion.status !== CONFIG_VERSION_STATUS.ACTIVE &&
      existingVersion.status !== CONFIG_VERSION_STATUS.DRAFT
    ) {
      throw new Error("Only ACTIVE or DRAFT versions can be archived");
    }

    if (existingVersion.status === CONFIG_VERSION_STATUS.ACTIVE) {
      const activeVersions = await ctx.db
        .query("incentive_config_versions")
        .withIndex("by_status", (q) => q.eq("status", CONFIG_VERSION_STATUS.ACTIVE))
        .collect();

      if (activeVersions.length <= 1) {
        throw new Error(
          "Cannot archive the last active config version. Activate a replacement first.",
        );
      }
    }

    const now = Date.now();
    await ctx.db.patch(existingVersion._id, {
      status: CONFIG_VERSION_STATUS.ARCHIVED,
      archived_by: admin._id,
      archived_at: now,
      updated_at: now,
    });

    if (existingVersion.status === CONFIG_VERSION_STATUS.ACTIVE) {
      const stillActiveVersion = await ctx.db
        .query("incentive_config_versions")
        .withIndex("by_status", (q) => q.eq("status", CONFIG_VERSION_STATUS.ACTIVE))
        .first();

      await upsertActiveVersionPointer(ctx, admin._id, stillActiveVersion?.version_code ?? "");
    }

    return await ctx.db.get(existingVersion._id);
  },
});

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    // Source of truth: runtime evaluators must read the ACTIVE config_json snapshot from
    // incentive_config_versions, never directly from draft modifier/template tables.
    return await ctx.db
      .query("incentive_config_versions")
      .withIndex("by_status", (q) => q.eq("status", CONFIG_VERSION_STATUS.ACTIVE))
      .first();
  },
});

export const getById = query({
  args: {
    id: v.id("incentive_config_versions"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(configVersionStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.COMMISSION_VIEW);

    const versionsQuery = args.status
      ? ctx.db
          .query("incentive_config_versions")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
      : ctx.db.query("incentive_config_versions");

    const page = await versionsQuery.order("desc").paginate(args.paginationOpts);
    return page as PaginationResult<IncentiveConfigVersionDoc>;
  },
});
