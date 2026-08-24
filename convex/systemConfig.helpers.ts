import type { SystemConfigKey } from "../lib/constants";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbContext = Pick<QueryCtx | MutationCtx, "db">;

function parseSystemConfigValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return rawValue;
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asStrictBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

export async function getSystemConfigRawValue(
  ctx: DbContext,
  key: SystemConfigKey,
): Promise<string | null> {
  const configKey = key as Doc<"system_config">["key"];

  const config = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", configKey))
    .first();

  return config?.value ?? null;
}

export async function getSystemConfigNumber(
  ctx: DbContext,
  key: SystemConfigKey,
  defaultValue?: number,
): Promise<number> {
  const rawValue = await getSystemConfigRawValue(ctx, key);

  if (rawValue === null) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new Error(`Missing system config: ${key}`);
  }

  const numericValue = asNumber(parseSystemConfigValue(rawValue));

  if (numericValue !== null) {
    return numericValue;
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  throw new Error(`System config '${key}' is not a valid number`);
}

export async function getSystemConfigJson<T>(
  ctx: DbContext,
  key: SystemConfigKey,
  defaultValue: T,
): Promise<T> {
  const rawValue = await getSystemConfigRawValue(ctx, key);

  if (rawValue === null) {
    return defaultValue;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return defaultValue;
  }
}

export async function getSystemConfigBoolean(
  ctx: DbContext,
  key: SystemConfigKey,
  defaultValue?: boolean,
): Promise<boolean> {
  const rawValue = await getSystemConfigRawValue(ctx, key);

  if (rawValue === null) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new Error(`Missing system config: ${key}`);
  }

  const parsedValue = parseSystemConfigValue(rawValue);
  const booleanValue = asStrictBoolean(parsedValue);

  if (booleanValue !== null) {
    return booleanValue;
  }

  throw new Error(`System config '${key}' must be a boolean or \"true\"/\"false\" string`);
}

export async function getSystemConfigStringArray(
  ctx: DbContext,
  key: SystemConfigKey,
  defaultValue: string[] = [],
): Promise<string[]> {
  const rawValue = await getSystemConfigRawValue(ctx, key);

  if (rawValue === null) {
    return defaultValue;
  }

  const parsedValue = parseSystemConfigValue(rawValue);

  if (!Array.isArray(parsedValue)) {
    throw new Error(`System config '${key}' must be a JSON array of strings`);
  }

  const values: string[] = [];

  for (const item of parsedValue) {
    if (typeof item !== "string") {
      throw new Error(`System config '${key}' must be a JSON array of strings`);
    }
    values.push(item);
  }

  return values;
}
