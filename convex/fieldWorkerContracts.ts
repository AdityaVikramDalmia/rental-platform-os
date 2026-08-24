import { v } from "convex/values";

export type FieldWorkerLeaderboardFilter = "GUARD" | "OPS" | "ALL";
export type P44MigrationAction = "migrate" | "keep_guard_only" | "defer" | "no_migration";
export type P44RolloutState = "DISABLED" | "CANARY" | "ENABLED";

export const FIELD_WORKER_USER_TYPES = ["GUARD", "OPS"] as const;
export type FieldWorkerUserType = (typeof FIELD_WORKER_USER_TYPES)[number];

export const DEFAULT_LEADERBOARD_FILTER: FieldWorkerLeaderboardFilter = "GUARD";

export const fieldWorkerLeaderboardFilterValidator = v.optional(
  v.union(v.literal("GUARD"), v.literal("OPS"), v.literal("ALL")),
);
