import { P44_DEFAULTS, SYSTEM_CONFIG_KEYS } from "../lib/constants";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { P44RolloutState } from "./fieldWorkerContracts";
import { getSystemConfigBoolean, getSystemConfigStringArray } from "./systemConfig.helpers";

type SystemConfigContext = Pick<QueryCtx | MutationCtx, "db">;

const OPS_FIELD_WORKER_ENABLED_KEY = SYSTEM_CONFIG_KEYS.OPS_FIELD_WORKER_ENABLED;
const OPS_FIELD_WORKER_CANARY_USER_IDS_KEY = SYSTEM_CONFIG_KEYS.OPS_FIELD_WORKER_CANARY_USER_IDS;

async function getOpsFieldWorkerCanaryUserIds(ctx: SystemConfigContext): Promise<string[]> {
  try {
    return await getSystemConfigStringArray(
      ctx,
      OPS_FIELD_WORKER_CANARY_USER_IDS_KEY,
      P44_DEFAULTS.OPS_FIELD_WORKER_CANARY_USER_IDS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Malformed ${OPS_FIELD_WORKER_CANARY_USER_IDS_KEY} config, defaulting to DISABLED: ${message}`,
    );
    return P44_DEFAULTS.OPS_FIELD_WORKER_CANARY_USER_IDS;
  }
}

async function getOpsFieldWorkerEnabled(ctx: SystemConfigContext): Promise<boolean> {
  return await getSystemConfigBoolean(
    ctx,
    OPS_FIELD_WORKER_ENABLED_KEY,
    P44_DEFAULTS.OPS_FIELD_WORKER_ENABLED,
  );
}

export async function resolveP44RolloutState(ctx: SystemConfigContext): Promise<P44RolloutState> {
  const isEnabled = await getOpsFieldWorkerEnabled(ctx);

  if (isEnabled) {
    return "ENABLED";
  }

  const canaryUserIds = await getOpsFieldWorkerCanaryUserIds(ctx);

  if (canaryUserIds.length > 0) {
    return "CANARY";
  }

  return "DISABLED";
}

export async function isOpsFieldWorkerEnabledForUser(
  ctx: SystemConfigContext,
  userId: string,
): Promise<boolean> {
  const isEnabled = await getOpsFieldWorkerEnabled(ctx);

  if (isEnabled) {
    return true;
  }

  const canaryUserIds = await getOpsFieldWorkerCanaryUserIds(ctx);

  return canaryUserIds.includes(userId);
}

export async function assertOpsFieldWorkerEnabledForUser(
  ctx: SystemConfigContext,
  userId: string,
): Promise<void> {
  const isEnabled = await isOpsFieldWorkerEnabledForUser(ctx, userId);

  if (!isEnabled) {
    throw new Error("Feature not enabled");
  }
}
