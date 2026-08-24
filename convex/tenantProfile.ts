import { v } from "convex/values";
import { BHK_CONFIG } from "../lib/constants";
import { normalizePhone } from "../lib/validators";
import { requireTenant } from "./auth.helpers";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./functions";

type PropertyType = (typeof BHK_CONFIG)[keyof typeof BHK_CONFIG];

const allowedPropertyTypes = new Set<PropertyType>(Object.values(BHK_CONFIG));

const updatePreferencesValidator = v.object({
  localities: v.array(v.string()),
  budget_min: v.union(v.number(), v.null()),
  budget_max: v.union(v.number(), v.null()),
  property_types: v.array(v.string()),
});

function sanitizeName(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Name is required");
  }

  return trimmed;
}

function sanitizeLocalities(values: string[]): string[] {
  const deduped = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (!trimmed) {
      continue;
    }

    const dedupeKey = trimmed.toLowerCase();
    if (deduped.has(dedupeKey)) {
      continue;
    }

    deduped.add(dedupeKey);
    normalized.push(trimmed);
  }

  return normalized;
}

function sanitizePropertyTypes(values: string[]): string[] {
  const normalized = values
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);

  const deduped = Array.from(new Set(normalized));

  for (const propertyType of deduped) {
    if (!allowedPropertyTypes.has(propertyType as PropertyType)) {
      throw new Error(`Invalid property type: ${propertyType}`);
    }
  }

  return deduped;
}

function sanitizeBudget(
  fieldName: "budget_min" | "budget_max",
  value: number | null,
): number | null {
  if (value === null) {
    return null;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer amount in paise`);
  }

  return value;
}

function normalizeProfileForRead(user: Doc<"users">, profile: Doc<"tenant_profiles"> | null) {
  const localities = sanitizeLocalities(profile?.preferences?.localities ?? []);
  const propertyTypes = (profile?.preferences?.property_types ?? [])
    .map((value) => value.trim().toUpperCase())
    .filter((value) => allowedPropertyTypes.has(value as PropertyType));

  return {
    user_id: user._id,
    name: profile?.name?.trim() || user.name,
    email: user.email?.trim().toLowerCase() || profile?.email || "",
    phone: profile?.phone ?? user.phone ?? null,
    preferences: {
      localities,
      budget_min: profile?.preferences?.budget_min ?? null,
      budget_max: profile?.preferences?.budget_max ?? null,
      property_types: Array.from(new Set(propertyTypes)),
    },
  };
}

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const tenant = await requireTenant(ctx);

    const profile = await ctx.db
      .query("tenant_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", tenant._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    return normalizeProfileForRead(tenant, profile);
  },
});

export const updateMine = mutation({
  args: {
    name: v.string(),
    phone: v.union(v.string(), v.null()),
    preferences: updatePreferencesValidator,
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx);

    const name = sanitizeName(args.name);
    const phoneInput = args.phone?.trim() ?? "";
    const phone = phoneInput.length > 0 ? normalizePhone(phoneInput) : undefined;

    const localities = sanitizeLocalities(args.preferences.localities);
    const propertyTypes = sanitizePropertyTypes(args.preferences.property_types);
    const budgetMin = sanitizeBudget("budget_min", args.preferences.budget_min);
    const budgetMax = sanitizeBudget("budget_max", args.preferences.budget_max);

    if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
      throw new Error("budget_min cannot be greater than budget_max");
    }

    const existingProfile = await ctx.db
      .query("tenant_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", tenant._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    if (phone !== undefined && phone !== tenant.phone) {
      const usersWithPhone = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .collect();

      const conflictingUser = usersWithPhone.find((user) => user._id !== tenant._id);
      if (conflictingUser) {
        throw new Error("Phone number already in use by another account");
      }
    }

    await ctx.db.patch(tenant._id, {
      name,
      phone,
    });

    const email = tenant.email?.trim().toLowerCase() || existingProfile?.email || "";

    const preferences = {
      localities: localities.length > 0 ? localities : undefined,
      budget_min: budgetMin ?? undefined,
      budget_max: budgetMax ?? undefined,
      property_types: propertyTypes.length > 0 ? propertyTypes : undefined,
    };

    let profileId = existingProfile?._id;

    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, {
        name,
        email,
        phone,
        preferences,
      });
    } else {
      profileId = await ctx.db.insert("tenant_profiles", {
        user_id: tenant._id,
        name,
        email,
        phone,
        preferences,
        is_deleted: false,
        created_at: Date.now(),
      });
    }

    if (!profileId) {
      throw new Error("Failed to resolve tenant profile id");
    }

    await ctx.db.insert("audit_logs", {
      actor_user_id: tenant._id,
      actor_type: "TENANT",
      action: "TENANT_PROFILE_UPDATE",
      entity_type: "tenant_profiles",
      entity_id: String(profileId),
      changes: undefined,
      metadata: {
        event_name: "tenant.profile_updated",
        user_id: String(tenant._id),
      },
    });

    const updatedProfile = await ctx.db.get(profileId);

    return normalizeProfileForRead(
      {
        ...tenant,
        name,
        phone,
      },
      updatedProfile,
    );
  },
});
