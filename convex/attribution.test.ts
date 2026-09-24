// Stage-weighted attribution of a closure's incentive pool (attribution.ts computeAttribution)
// and the finalize -> dispute -> manual override flow that re-issues disbursements.
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_attribution";
process.env.WORKOS_API_KEY ??= "sk_test_attribution";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_attribution";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const FIXED_NOW = new Date("2026-04-01T09:00:00.000Z");

const ATTRIBUTION_ADMIN_PERMISSIONS = [
  PERMISSIONS.ATTRIBUTION_VIEW,
  PERMISSIONS.ATTRIBUTION_DISPUTE,
  PERMISSIONS.ATTRIBUTION_OVERRIDE,
  PERMISSIONS.DISBURSEMENT_APPROVE,
];

type Stage = Doc<"deal_contributions">["stage"];
type Persona = Doc<"deal_contributions">["actor_persona"];

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
  const workosUserId = `workos_attr_${userType.toLowerCase()}_${sequence}`;

  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} attribution ${sequence}`,
      email: `${workosUserId}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });

    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Attribution role ${sequence}`,
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
    as: t.withIdentity({ subject: workosUserId, issuer: WORKOS_ISSUER }),
  };
}

// Admin → society/building/lead → closure → one commission evaluation holding the pool.
async function createClosureWithPool(
  t: TestBackend,
  poolPaise: number,
  configSnapshot = "{}",
  admin?: Awaited<ReturnType<typeof createUser>>,
) {
  const owner = admin ?? (await createUser(t, "ADMIN", ATTRIBUTION_ADMIN_PERMISSIONS));
  const submitter = await createUser(t, "GUARD");

  const ids = await t.run(async (ctx) => {
    const societyId = await ctx.db.insert("societies", {
      name: `Attribution Society ${sequence}`,
      city: "Pune",
      status: "ACTIVE",
      created_by_admin_id: owner.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower A",
      total_floors: 8,
      floor_labels: ["1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "1",
      flat_number: `A-${sequence}`,
      owner_phone: "9333333333",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: submitter.userId,
      status: "VERIFIED",
    });
    const closureId = await ctx.db.insert("closures", {
      lead_id: leadId,
      move_in_date: FIXED_NOW.getTime(),
      status: "CONFIRMED",
      closed_by_admin_id: owner.userId,
      confirmed_at: FIXED_NOW.getTime(),
    });
    await ctx.db.insert("deal_commission_evaluations", {
      closure_id: closureId,
      primary_actor_user_id: submitter.userId,
      persona: "GUARD",
      base_rate_bps: 1500,
      effective_rate_bps: 1500,
      flat_bonus_paise: 0,
      commission_base_profit_paise: poolPaise * 10,
      incentive_pool_paise: poolPaise,
      modifier_breakdown: [],
      config_version: "test-v1",
      config_snapshot: configSnapshot,
      computed_at: FIXED_NOW.getTime(),
      status: "FINAL",
    });
    return { leadId, closureId };
  });

  return { admin: owner, ...ids };
}

async function addContribution(
  t: TestBackend,
  closureId: Id<"closures">,
  actorId: Id<"users">,
  stage: Stage,
  options: { units?: number; quality?: number; persona?: Persona } = {},
) {
  sequence += 1;
  const eventKey = `contribution:${sequence}`;
  return await t.run(async (ctx) =>
    ctx.db.insert("deal_contributions", {
      closure_id: closureId,
      actor_user_id: actorId,
      actor_persona: options.persona ?? "GUARD",
      stage,
      source_entity_type: "MANUAL",
      source_entity_id: eventKey,
      event_key: eventKey,
      contribution_units: options.units ?? 1,
      quality_score_snapshot: options.quality,
      occurred_at: FIXED_NOW.getTime(),
      is_voided: false,
      is_deleted: false,
    }),
  );
}

async function setRolloutPolicy(t: TestBackend, adminId: Id<"users">, mode: "FULL" | "OFF") {
  await t.run(async (ctx) => {
    await ctx.db.insert("system_config", {
      key: "incentive_v3_rollout_policy",
      value: JSON.stringify({ mode, enabled_personas: [], notes: "attribution test" }),
      updated_by_admin_id: adminId,
    });
  });
}

async function splitsFor(t: TestBackend, recordId: Id<"attribution_records">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("attribution_splits")
      .withIndex("by_attribution", (q) => q.eq("attribution_record_id", recordId))
      .collect(),
  );
}

async function disbursementsFor(t: TestBackend, closureId: Id<"closures">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("incentive_disbursements")
      .withIndex("by_closure", (q) => q.eq("closure_id", closureId))
      .collect(),
  );
}

function amountByRecipient(splits: Doc<"attribution_splits">[]) {
  return new Map(splits.map((split) => [split.recipient_user_id, split.amount_paise]));
}

// A finalized two-actor attribution under a FULL rollout, ready to be disputed.
async function createFinalizedAttribution(t: TestBackend) {
  const fixture = await createClosureWithPool(t, 100_000);
  const guard = await createUser(t, "GUARD");
  const ops = await createUser(t, "OPS");
  await addContribution(t, fixture.closureId, guard.userId, "DISCOVERY");
  await addContribution(t, fixture.closureId, ops.userId, "VERIFICATION", { persona: "OPS" });
  await setRolloutPolicy(t, fixture.admin.userId, "FULL");

  const computed = await t.mutation(internal.attribution.computeAttribution, {
    closure_id: fixture.closureId,
  });
  await t.mutation(internal.attribution.finalizeAttribution, { closure_id: fixture.closureId });

  return {
    ...fixture,
    guard,
    ops,
    recordId: computed.attribution_record_id as Id<"attribution_records">,
  };
}

describe("attribution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("computeAttribution", () => {
    it("re-weights empty stages away and hands the leftover paisa to the largest remainder", async () => {
      const t = createTest();
      const fixture = await createClosureWithPool(t, 100_000);
      const discoverer = await createUser(t, "GUARD");
      const verifier = await createUser(t, "GUARD");
      // No quality snapshot: the default score of 50 applies to both.
      await addContribution(t, fixture.closureId, discoverer.userId, "DISCOVERY");
      await addContribution(t, fixture.closureId, verifier.userId, "VERIFICATION");

      const result = await t.mutation(internal.attribution.computeAttribution, {
        closure_id: fixture.closureId,
      });

      expect(result.skipped).toBe(false);
      expect(result.split_count).toBe(2);
      // DISCOVERY 25 and VERIFICATION 35 re-scale to 41,666.67 and 58,333.33 of ₹1,000.
      const splits = await splitsFor(t, result.attribution_record_id!);
      const discovererSplit = splits.find((s) => s.recipient_user_id === discoverer.userId)!;
      const verifierSplit = splits.find((s) => s.recipient_user_id === verifier.userId)!;
      expect(discovererSplit).toMatchObject({
        provisional_amount_paise: 41_666,
        amount_paise: 41_667,
        remainder_rank: 1,
        primary_stage: "DISCOVERY",
      });
      expect(verifierSplit).toMatchObject({
        provisional_amount_paise: 58_333,
        amount_paise: 58_333,
        primary_stage: "VERIFICATION",
      });
      expect(verifierSplit.remainder_rank).toBeUndefined();

      const record = await t.run(async (ctx) => ctx.db.get(result.attribution_record_id!));
      expect(record).toMatchObject({ status: "PROVISIONAL", pool_amount_paise: 100_000 });
    });

    it("makes the splits sum exactly to the pool for awkward pool sizes", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", ATTRIBUTION_ADMIN_PERMISSIONS);
      const [a, b, c] = [
        await createUser(t, "GUARD"),
        await createUser(t, "OPS"),
        await createUser(t, "GUARD"),
      ];

      for (const pool of [1, 2, 7, 999, 100_003, 1_234_567]) {
        const fixture = await createClosureWithPool(t, pool, "{}", admin);
        await addContribution(t, fixture.closureId, a.userId, "DISCOVERY", {
          units: 2,
          quality: 80,
        });
        await addContribution(t, fixture.closureId, a.userId, "VERIFICATION", { quality: 45 });
        await addContribution(t, fixture.closureId, b.userId, "VERIFICATION", {
          units: 3,
          quality: 100,
          persona: "OPS",
        });
        await addContribution(t, fixture.closureId, b.userId, "CLOSURE", {
          quality: 60,
          persona: "OPS",
        });
        await addContribution(t, fixture.closureId, c.userId, "SUPPORT", { quality: 200 });
        await addContribution(t, fixture.closureId, c.userId, "CLOSURE", { units: 2, quality: 31 });

        const result = await t.mutation(internal.attribution.computeAttribution, {
          closure_id: fixture.closureId,
        });
        const splits = await splitsFor(t, result.attribution_record_id!);

        expect(
          splits.reduce((sum, split) => sum + split.amount_paise, 0),
          `pool ${pool}`,
        ).toBe(pool);
        for (const split of splits) {
          expect(split.amount_paise).toBeGreaterThanOrEqual(split.provisional_amount_paise ?? 0);
        }
      }
    });

    it("gives a tied leftover paisa to the recipient with the lower user id", async () => {
      const t = createTest();
      const fixture = await createClosureWithPool(t, 100_001);
      const first = await createUser(t, "GUARD");
      const second = await createUser(t, "GUARD");
      await addContribution(t, fixture.closureId, first.userId, "CLOSURE");
      await addContribution(t, fixture.closureId, second.userId, "CLOSURE");

      const result = await t.mutation(internal.attribution.computeAttribution, {
        closure_id: fixture.closureId,
      });
      const amounts = amountByRecipient(await splitsFor(t, result.attribution_record_id!));

      const [lowerId, higherId] = [first.userId, second.userId].sort((left, right) =>
        `${left}`.localeCompare(`${right}`),
      );
      expect(amounts.get(lowerId!)).toBe(50_001);
      expect(amounts.get(higherId!)).toBe(50_000);
    });

    it("gives contributions with a quality score below 30 zero weight", async () => {
      const t = createTest();
      const fixture = await createClosureWithPool(t, 100_000);
      const lowQuality = await createUser(t, "GUARD");
      const threshold = await createUser(t, "GUARD");
      await addContribution(t, fixture.closureId, lowQuality.userId, "DISCOVERY", {
        units: 10,
        quality: 29,
      });
      await addContribution(t, fixture.closureId, threshold.userId, "VERIFICATION", {
        quality: 30,
      });

      const result = await t.mutation(internal.attribution.computeAttribution, {
        closure_id: fixture.closureId,
      });
      const splits = await splitsFor(t, result.attribution_record_id!);

      expect(splits).toHaveLength(1);
      expect(splits[0]).toMatchObject({
        recipient_user_id: threshold.userId,
        amount_paise: 100_000,
        adj_points: 0.65,
      });
    });

    it("honours stage weights carried in the evaluation's config snapshot", async () => {
      const t = createTest();
      const fixture = await createClosureWithPool(
        t,
        90_000,
        JSON.stringify({
          stage_weights: { DISCOVERY: 50, VERIFICATION: 50, CLOSURE: 0, SUPPORT: 0 },
        }),
      );
      const discoverer = await createUser(t, "GUARD");
      const verifier = await createUser(t, "GUARD");
      const closer = await createUser(t, "GUARD");
      await addContribution(t, fixture.closureId, discoverer.userId, "DISCOVERY");
      await addContribution(t, fixture.closureId, verifier.userId, "VERIFICATION");
      await addContribution(t, fixture.closureId, closer.userId, "CLOSURE");

      const result = await t.mutation(internal.attribution.computeAttribution, {
        closure_id: fixture.closureId,
      });
      const amounts = amountByRecipient(await splitsFor(t, result.attribution_record_id!));

      expect(amounts.get(discoverer.userId)).toBe(45_000);
      expect(amounts.get(verifier.userId)).toBe(45_000);
      expect(amounts.get(closer.userId) ?? 0).toBe(0);
    });

    it("skips a second run for the same closure instead of writing another record", async () => {
      const t = createTest();
      const fixture = await createClosureWithPool(t, 50_000);
      const guard = await createUser(t, "GUARD");
      await addContribution(t, fixture.closureId, guard.userId, "DISCOVERY");

      const first = await t.mutation(internal.attribution.computeAttribution, {
        closure_id: fixture.closureId,
      });
      await addContribution(t, fixture.closureId, (await createUser(t, "GUARD")).userId, "SUPPORT");
      const second = await t.mutation(internal.attribution.computeAttribution, {
        closure_id: fixture.closureId,
      });

      expect(second).toEqual({
        attribution_record_id: first.attribution_record_id,
        split_count: 1,
        skipped: true,
      });
      const records = await t.run(async (ctx) =>
        ctx.db
          .query("attribution_records")
          .withIndex("by_closure", (q) => q.eq("closure_id", fixture.closureId))
          .collect(),
      );
      expect(records).toHaveLength(1);
    });

    it("throws without a commission evaluation and writes nothing when no contribution is eligible", async () => {
      const t = createTest();
      const withPool = await createClosureWithPool(t, 10_000);
      const lowQuality = await createUser(t, "GUARD");
      await addContribution(t, withPool.closureId, lowQuality.userId, "DISCOVERY", { quality: 10 });

      const noEligible = await t.mutation(internal.attribution.computeAttribution, {
        closure_id: withPool.closureId,
      });
      expect(noEligible).toEqual({ attribution_record_id: null, split_count: 0, skipped: true });

      const withoutEvaluation = await t.run(async (ctx) => {
        await ctx.db.delete(
          (await ctx.db
            .query("deal_commission_evaluations")
            .withIndex("by_closure", (q) => q.eq("closure_id", withPool.closureId))
            .first())!._id,
        );
        return withPool.closureId;
      });
      await expect(
        t.mutation(internal.attribution.computeAttribution, { closure_id: withoutEvaluation }),
      ).rejects.toThrow("Commission evaluation not found for closure");
      expect(await t.run(async (ctx) => ctx.db.query("attribution_records").collect())).toEqual([]);
    });
  });

  describe("disputeAttribution", () => {
    it("only disputes FINAL records and rejects callers without attribution.dispute", async () => {
      const t = createTest();
      const fixture = await createClosureWithPool(t, 20_000);
      const guard = await createUser(t, "GUARD");
      await addContribution(t, fixture.closureId, guard.userId, "DISCOVERY");
      const { attribution_record_id: recordId } = await t.mutation(
        internal.attribution.computeAttribution,
        { closure_id: fixture.closureId },
      );
      const viewer = await createUser(t, "ADMIN", [PERMISSIONS.ATTRIBUTION_VIEW]);

      await expect(
        fixture.admin.as.mutation(api.attribution.disputeAttribution, {
          attribution_record_id: recordId!,
          reason: "wrong split",
        }),
      ).rejects.toThrow("Only FINAL attribution records can be disputed");

      await t.mutation(internal.attribution.finalizeAttribution, { closure_id: fixture.closureId });

      await expect(
        viewer.as.mutation(api.attribution.disputeAttribution, {
          attribution_record_id: recordId!,
          reason: "wrong split",
        }),
      ).rejects.toThrow("Missing permission: attribution.dispute");

      const disputed = await fixture.admin.as.mutation(api.attribution.disputeAttribution, {
        attribution_record_id: recordId!,
        reason: "  verifier was on leave  ",
      });
      expect(disputed).toMatchObject({
        status: "DISPUTED",
        dispute_reason: "verifier was on leave",
        disputed_by_admin_id: fixture.admin.userId,
        disputed_at: FIXED_NOW.getTime(),
      });
    });
  });

  describe("overrideAttribution", () => {
    it("requires manual splits to sum to the pool, then supersedes the record and re-issues disbursements", async () => {
      const t = createTest();
      const fixture = await createFinalizedAttribution(t);
      const original = await disbursementsFor(t, fixture.closureId);
      expect(original.map((row) => row.status)).toEqual(["PENDING", "PENDING"]);

      await fixture.admin.as.mutation(api.attribution.disputeAttribution, {
        attribution_record_id: fixture.recordId,
        reason: "split was wrong",
      });

      await expect(
        fixture.admin.as.mutation(api.attribution.overrideAttribution, {
          attribution_record_id: fixture.recordId,
          manual_splits: [
            { recipient_user_id: fixture.guard.userId, amount_paise: 70_000 },
            { recipient_user_id: fixture.ops.userId, amount_paise: 29_999 },
          ],
          reason: "ops did less",
        }),
      ).rejects.toThrow("manual_splits total must equal pool_amount_paise exactly");

      const result = await fixture.admin.as.mutation(api.attribution.overrideAttribution, {
        attribution_record_id: fixture.recordId,
        manual_splits: [
          { recipient_user_id: fixture.guard.userId, amount_paise: 70_000 },
          { recipient_user_id: fixture.ops.userId, amount_paise: 30_000 },
        ],
        reason: "ops did less",
      });

      expect(result.attribution_record).toMatchObject({
        status: "RESOLVED",
        algorithm: "MANUAL_OVERRIDE",
        supersedes_record_id: fixture.recordId,
        pool_amount_paise: 100_000,
      });

      const disbursements = await disbursementsFor(t, fixture.closureId);
      const live = disbursements.filter((row) => row.status !== "VOIDED");
      expect(disbursements.filter((row) => row.status === "VOIDED")).toHaveLength(2);
      expect(new Map(live.map((row) => [row.recipient_user_id, row.amount_paise]))).toEqual(
        new Map([
          [fixture.guard.userId, 70_000],
          [fixture.ops.userId, 30_000],
        ]),
      );

      const current = await fixture.admin.as.query(api.attribution.getAttribution, {
        closure_id: fixture.closureId,
      });
      expect(current?.record._id).toBe(result.attribution_record?._id);
      expect(current?.splits.map((split) => split.amount_paise)).toEqual([70_000, 30_000]);

      await expect(
        fixture.admin.as.mutation(api.attribution.overrideAttribution, {
          attribution_record_id: fixture.recordId,
          manual_splits: [{ recipient_user_id: fixture.guard.userId, amount_paise: 100_000 }],
          reason: "second attempt",
        }),
      ).rejects.toThrow("Attribution record already superseded by a previous override");
    });

    it("refuses to override once any split disbursement has been paid out", async () => {
      const t = createTest();
      const fixture = await createFinalizedAttribution(t);
      const [paid] = await disbursementsFor(t, fixture.closureId);
      await fixture.admin.as.mutation(api.incentiveDisbursements.approve, {
        disbursement_id: paid!._id,
      });
      await fixture.admin.as.mutation(api.incentiveDisbursements.disburse, {
        disbursement_id: paid!._id,
      });
      await fixture.admin.as.mutation(api.attribution.disputeAttribution, {
        attribution_record_id: fixture.recordId,
        reason: "late complaint",
      });

      await expect(
        fixture.admin.as.mutation(api.attribution.overrideAttribution, {
          attribution_record_id: fixture.recordId,
          manual_splits: [{ recipient_user_id: fixture.ops.userId, amount_paise: 100_000 }],
          reason: "give it all to ops",
        }),
      ).rejects.toThrow("Cannot override attribution: disbursements already sent");

      const statuses = (await disbursementsFor(t, fixture.closureId)).map((row) => row.status);
      expect(statuses.sort()).toEqual(["DISBURSED", "PENDING"]);
    });
  });
});
