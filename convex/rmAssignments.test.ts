import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type RmAssignmentStatus, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_rm";
process.env.WORKOS_API_KEY ??= "sk_test_rm";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_rm";

await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const BASE_TIME = Date.UTC(2026, 3, 20, 3, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTest>;

let sequence = 0;

async function createUser(t: TestBackend, userType: UserType, permissions: string[] = []) {
  sequence += 1;
  const workosUserId = `workos_rm_${userType.toLowerCase()}_${sequence}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} user ${sequence}`,
      email: `${workosUserId}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });
    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `RM role ${sequence}`,
        permissions,
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
  return {
    userId,
    as: t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" }),
  };
}

async function createRmGuard(t: TestBackend) {
  const guard = await createUser(t, "GUARD");
  const guardProfileId = await t.run(async (ctx) => {
    const societyId = await ctx.db.insert("societies", {
      name: `RM Society ${sequence}`,
      city: "Hyderabad",
      status: "ACTIVE",
      created_by_admin_id: guard.userId,
    });
    return await ctx.db.insert("guard_profiles", {
      user_id: guard.userId,
      society_id: societyId,
      guard_type: "MAIN_GATE",
      has_seen_onboarding: true,
    });
  });
  return { ...guard, guardProfileId };
}

async function insertOwner(t: TestBackend) {
  sequence += 1;
  const phone = `95${String(sequence).padStart(8, "0")}`;
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("owners", {
      phone,
      source: "GUARD_LEAD",
      active_properties_count: 1,
      total_leads_count: 1,
      total_closures_count: 1,
      lifecycle_stage: "MANAGED",
      lifecycle_updated_at: now,
      first_seen_at: now,
      last_activity_at: now,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });
  });
}

type AssignmentSeed = {
  status?: RmAssignmentStatus;
  missed?: number;
  breaches?: number;
  score?: number;
  nextCheckInDue?: number;
  lastSlaBreachAt?: number;
};

async function insertAssignment(
  t: TestBackend,
  rm: Awaited<ReturnType<typeof createRmGuard>>,
  seed: AssignmentSeed = {},
) {
  const ownerId = await insertOwner(t);
  return await t.run(async (ctx) =>
    ctx.db.insert("owner_rm_assignments", {
      owner_id: ownerId,
      rm_guard_id: rm.guardProfileId,
      rm_user_id: rm.userId,
      assigned_by: "SYSTEM",
      status: seed.status ?? "ACTIVE",
      next_check_in_due: seed.nextCheckInDue ?? Date.now() + 30 * DAY_MS,
      check_in_frequency_days: 30,
      missed_check_ins_count: seed.missed ?? 0,
      performance_score: seed.score,
      sla_breach_count: seed.breaches ?? 0,
      last_sla_breach_at: seed.lastSlaBreachAt,
      escalation_level: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    }),
  );
}

async function insertCheckIns(
  t: TestBackend,
  assignmentId: Id<"owner_rm_assignments">,
  checkIns: Array<{ outcome: "RESOLVED" | "PENDING" | "ESCALATED"; createdAt: number }>,
) {
  await t.run(async (ctx) => {
    const assignment = await ctx.db.get(assignmentId);
    for (const checkIn of checkIns) {
      await ctx.db.insert("rm_check_ins", {
        assignment_id: assignmentId,
        owner_id: assignment!.owner_id,
        rm_guard_id: assignment!.rm_guard_id,
        check_in_type: "SCHEDULED",
        method: "CALL",
        summary: "Monthly call",
        outcome: checkIn.outcome,
        created_at: checkIn.createdAt,
      });
    }
  });
}

async function readAssignments(t: TestBackend, ids: Id<"owner_rm_assignments">[]) {
  return await t.run(async (ctx) => Promise.all(ids.map((id) => ctx.db.get(id))));
}

describe("rmAssignments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("recalculatePerformanceScores", () => {
    it("subtracts 10 per missed check-in (capped at 50) and 15 per SLA breach (capped at 45) from 100", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const seeds: Array<[AssignmentSeed, number]> = [
        [{ missed: 0, breaches: 0 }, 100],
        [{ missed: 5 }, 50],
        [{ missed: 6 }, 50],
        [{ breaches: 3 }, 55],
        [{ breaches: 4 }, 55],
        [{ missed: 9, breaches: 9, status: "WARNING" }, 5],
      ];
      const ids = [];
      for (const [seed] of seeds) {
        ids.push(await insertAssignment(t, rm, seed));
      }

      const result = await t.mutation(internal.rmAssignments.recalculatePerformanceScores, {});

      expect(result).toEqual({ scored: seeds.length, processedAt: BASE_TIME });
      const scored = await readAssignments(t, ids);
      expect(scored.map((row) => row?.performance_score)).toEqual(seeds.map(([, score]) => score));
    });

    it("adds 5 per RESOLVED check-in newer than 90 days (capped at 20) and clamps the total at 100", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const recent = BASE_TIME - DAY_MS;
      const threeResolved = await insertAssignment(t, rm, { missed: 3 });
      const fiveResolved = await insertAssignment(t, rm, { missed: 3 });
      const alreadyPerfect = await insertAssignment(t, rm, { missed: 0 });
      const windowEdges = await insertAssignment(t, rm, { missed: 4 });
      await insertCheckIns(
        t,
        threeResolved,
        Array(3).fill({ outcome: "RESOLVED", createdAt: recent }),
      );
      await insertCheckIns(
        t,
        fiveResolved,
        Array(5).fill({ outcome: "RESOLVED", createdAt: recent }),
      );
      await insertCheckIns(
        t,
        alreadyPerfect,
        Array(2).fill({ outcome: "RESOLVED", createdAt: recent }),
      );
      await insertCheckIns(t, windowEdges, [
        { outcome: "RESOLVED", createdAt: BASE_TIME - 90 * DAY_MS },
        { outcome: "RESOLVED", createdAt: BASE_TIME - 90 * DAY_MS + 1 },
        { outcome: "PENDING", createdAt: recent },
      ]);

      await t.mutation(internal.rmAssignments.recalculatePerformanceScores, {});

      const rows = await readAssignments(t, [
        threeResolved,
        fiveResolved,
        alreadyPerfect,
        windowEdges,
      ]);
      expect(rows.map((row) => row?.performance_score)).toEqual([85, 90, 100, 65]);
    });

    it("does not score ENDED or REASSIGNED assignments", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const ended = await insertAssignment(t, rm, { status: "ENDED", missed: 2 });
      const reassigned = await insertAssignment(t, rm, { status: "REASSIGNED", missed: 2 });
      const escalated = await insertAssignment(t, rm, { status: "ESCALATED", missed: 2 });

      const result = await t.mutation(internal.rmAssignments.recalculatePerformanceScores, {});

      expect(result.scored).toBe(1);
      const rows = await readAssignments(t, [ended, reassigned, escalated]);
      expect(rows.map((row) => row?.performance_score)).toEqual([undefined, undefined, 80]);
    });
  });

  describe("escalateWarnings", () => {
    it("needs two runs to take an ACTIVE assignment with 3 missed check-ins to ESCALATED", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const id = await insertAssignment(t, rm, { missed: 3 });

      const first = await t.mutation(internal.rmAssignments.escalateWarnings, {});
      const [afterFirst] = await readAssignments(t, [id]);
      const second = await t.mutation(internal.rmAssignments.escalateWarnings, {});
      const [afterSecond] = await readAssignments(t, [id]);

      expect(first).toMatchObject({ warned: 1, escalated: 0 });
      expect(afterFirst).toMatchObject({ status: "WARNING", escalation_level: 1 });
      expect(second).toMatchObject({ warned: 0, escalated: 1 });
      expect(afterSecond).toMatchObject({ status: "ESCALATED", escalation_level: 2 });
    });

    it("warns at 2 missed check-ins or a score below 60, escalates a WARNING below 40, and leaves the boundaries alone", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const cases: Array<[AssignmentSeed, RmAssignmentStatus]> = [
        [{ missed: 1 }, "ACTIVE"],
        [{ missed: 2 }, "WARNING"],
        [{ score: 60 }, "ACTIVE"],
        [{ score: 59 }, "WARNING"],
        [{ status: "WARNING", score: 40 }, "WARNING"],
        [{ status: "WARNING", score: 39 }, "ESCALATED"],
        [{ status: "WARNING", missed: 3 }, "ESCALATED"],
      ];
      const ids = [];
      for (const [seed] of cases) {
        ids.push(await insertAssignment(t, rm, seed));
      }

      const result = await t.mutation(internal.rmAssignments.escalateWarnings, {});

      expect(result).toMatchObject({ warned: 2, escalated: 2 });
      const rows = await readAssignments(t, ids);
      expect(rows.map((row) => row?.status)).toEqual(cases.map(([, status]) => status));
    });
  });

  describe("processSlaBreach", () => {
    it("records at most one breach per assignment per 24 hours", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const id = await insertAssignment(t, rm, { nextCheckInDue: BASE_TIME - DAY_MS });

      const first = await t.mutation(internal.rmAssignments.processSlaBreach, {});
      vi.setSystemTime(BASE_TIME + DAY_MS);
      const exactlyADayLater = await t.mutation(internal.rmAssignments.processSlaBreach, {});
      const [afterWindow] = await readAssignments(t, [id]);
      vi.setSystemTime(BASE_TIME + DAY_MS + 1);
      const justPastTheWindow = await t.mutation(internal.rmAssignments.processSlaBreach, {});
      const [final] = await readAssignments(t, [id]);

      expect(first.breachCount).toBe(1);
      expect(exactlyADayLater.breachCount).toBe(0);
      expect(afterWindow).toMatchObject({
        sla_breach_count: 1,
        missed_check_ins_count: 1,
        last_sla_breach_at: BASE_TIME,
      });
      expect(justPastTheWindow.breachCount).toBe(1);
      expect(final).toMatchObject({
        sla_breach_count: 2,
        missed_check_ins_count: 2,
        last_sla_breach_at: BASE_TIME + DAY_MS + 1,
      });
    });

    it("breaches only ACTIVE or WARNING assignments whose due date is strictly in the past", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const overdue = BASE_TIME - 1;
      const dueNow = await insertAssignment(t, rm, { nextCheckInDue: BASE_TIME });
      const warning = await insertAssignment(t, rm, { status: "WARNING", nextCheckInDue: overdue });
      const escalated = await insertAssignment(t, rm, {
        status: "ESCALATED",
        nextCheckInDue: overdue,
      });
      const ended = await insertAssignment(t, rm, { status: "ENDED", nextCheckInDue: overdue });

      const result = await t.mutation(internal.rmAssignments.processSlaBreach, {});

      expect(result.breachCount).toBe(1);
      const rows = await readAssignments(t, [dueNow, warning, escalated, ended]);
      expect(rows.map((row) => row?.sla_breach_count)).toEqual([0, 1, 0, 0]);
    });
  });

  describe("createAssignment", () => {
    it("creates an ACTIVE admin assignment due in 30 days and records the RM on the owner; rm.manage is required", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const ownerId = await insertOwner(t);
      const manager = await createUser(t, "ADMIN", [PERMISSIONS.RM_MANAGE]);
      const viewer = await createUser(t, "ADMIN", [PERMISSIONS.RM_VIEW]);
      const args = {
        owner_id: ownerId,
        rm_guard_id: rm.guardProfileId,
        rm_user_id: rm.userId,
        assigned_by: "ADMIN" as const,
      };

      await expect(viewer.as.mutation(api.rmAssignments.createAssignment, args)).rejects.toThrow(
        "Missing permission: rm.manage",
      );
      const assignment = await manager.as.mutation(api.rmAssignments.createAssignment, args);

      expect(assignment).toMatchObject({
        status: "ACTIVE",
        assigned_by: "ADMIN",
        assigned_by_admin_id: manager.userId,
        next_check_in_due: BASE_TIME + 30 * DAY_MS,
        missed_check_ins_count: 0,
        sla_breach_count: 0,
        escalation_level: 0,
      });
      const owner = await t.run(async (ctx) => ctx.db.get(ownerId));
      expect(owner?.current_rm_id).toBe(rm.userId);
      expect(owner?.current_rm_guard_id).toBe(rm.guardProfileId);
    });

    it("rejects SYSTEM assignments from the public API, a second live assignment and a non-guard RM", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const ownerId = await insertOwner(t);
      const manager = await createUser(t, "ADMIN", [PERMISSIONS.RM_MANAGE]);
      const base = { owner_id: ownerId, rm_guard_id: rm.guardProfileId, rm_user_id: rm.userId };

      await expect(
        manager.as.mutation(api.rmAssignments.createAssignment, { ...base, assigned_by: "SYSTEM" }),
      ).rejects.toThrow("SYSTEM assignments must use the internal RM assignment mutation");

      await t.run(async (ctx) => ctx.db.patch(rm.userId, { user_type: "OPS" }));
      await expect(
        manager.as.mutation(api.rmAssignments.createAssignment, { ...base, assigned_by: "ADMIN" }),
      ).rejects.toThrow("RM user not found or is not a guard");

      await t.run(async (ctx) => ctx.db.patch(rm.userId, { user_type: "GUARD" }));
      await manager.as.mutation(api.rmAssignments.createAssignment, {
        ...base,
        assigned_by: "ADMIN",
      });
      await expect(
        manager.as.mutation(api.rmAssignments.createAssignment, { ...base, assigned_by: "ADMIN" }),
      ).rejects.toThrow("Owner already has a non-terminal RM assignment");
    });
  });

  describe("createCheckIn", () => {
    it("resets missed check-ins, pushes the next due date by the frequency and returns a WARNING assignment to ACTIVE", async () => {
      const t = createTest();
      const rm = await createRmGuard(t);
      const id = await insertAssignment(t, rm, { status: "WARNING", missed: 2 });
      await t.run(async (ctx) => ctx.db.patch(id, { escalation_level: 1 }));
      const checker = await createUser(t, "OPS", [PERMISSIONS.RM_CHECK_IN]);

      vi.setSystemTime(BASE_TIME + DAY_MS);
      const checkIn = await checker.as.mutation(api.rmAssignments.createCheckIn, {
        assignment_id: id,
        check_in_type: "SCHEDULED",
        method: "WHATSAPP",
        summary: "  Tenant settled in  ",
        outcome: "RESOLVED",
      });

      expect(checkIn).toMatchObject({
        summary: "Tenant settled in",
        created_at: BASE_TIME + DAY_MS,
      });
      const [assignment] = await readAssignments(t, [id]);
      expect(assignment).toMatchObject({
        status: "ACTIVE",
        escalation_level: 0,
        missed_check_ins_count: 0,
        last_check_in_at: BASE_TIME + DAY_MS,
        next_check_in_due: BASE_TIME + DAY_MS + 30 * DAY_MS,
      });
    });
  });
});
