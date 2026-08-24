import { SYSTEM_CONFIG_KEYS } from "../lib/constants";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getSystemConfigRawValue } from "./systemConfig.helpers";

type SystemConfigContext = Pick<QueryCtx | MutationCtx, "db">;

const DEFAULT_UNASSIGNED_SOCIETY_ID_KEY = SYSTEM_CONFIG_KEYS.DEFAULT_UNASSIGNED_SOCIETY_ID;

async function validateSocietyId(
  ctx: SystemConfigContext,
  societyId: Id<"societies">,
): Promise<Id<"societies"> | null> {
  try {
    const society = await ctx.db.get(societyId);
    return society ? society._id : null;
  } catch {
    return null;
  }
}

export async function resolveOpsSociety(
  ctx: SystemConfigContext,
  userId: Id<"users">,
  explicitSocietyId?: Id<"societies">,
): Promise<Id<"societies">> {
  if (explicitSocietyId) {
    const explicitSociety = await validateSocietyId(ctx, explicitSocietyId);
    if (explicitSociety) {
      return explicitSociety;
    }

    throw new Error("Provided explicit society_id is invalid");
  }

  const existingAssignment = await ctx.db
    .query("guard_profiles")
    .withIndex("by_user_id", (q) => q.eq("user_id", userId))
    .unique();

  if (existingAssignment) {
    const assignedSociety = await validateSocietyId(ctx, existingAssignment.society_id);
    if (assignedSociety) {
      return assignedSociety;
    }
  }

  const fallbackRawValue = await getSystemConfigRawValue(ctx, DEFAULT_UNASSIGNED_SOCIETY_ID_KEY);
  const fallbackSocietyId = fallbackRawValue?.trim();

  if (fallbackSocietyId) {
    const fallbackSociety = await validateSocietyId(ctx, fallbackSocietyId as Id<"societies">);
    if (fallbackSociety) {
      return fallbackSociety;
    }

    throw new Error(
      `Configured ${DEFAULT_UNASSIGNED_SOCIETY_ID_KEY} is invalid: ${fallbackSocietyId}`,
    );
  }

  throw new Error(
    `Unable to resolve OPS society assignment. Set ${DEFAULT_UNASSIGNED_SOCIETY_ID_KEY} or provide explicit society_id.`,
  );
}
