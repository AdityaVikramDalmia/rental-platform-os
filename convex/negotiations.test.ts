import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_TYPE,
  LEAD_STATUS,
  NEGOTIATION_PROPOSAL_STATUS,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TENANT_INQUIRY_STATUS,
  TOKEN_COLLECTION_METHOD,
  TOKEN_RECORD_STATUS,
  TOKEN_REFUND_POLICY,
  USER_STATUS,
  type NegotiationStatus,
  type UserType,
} from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_negotiations";
process.env.WORKOS_API_KEY ??= "sk_test_negotiations";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_negotiations";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 0, 15, 6, 0, 0);

function createTestBackend() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTestBackend>;

let sequence = 0;

async function createUser(t: TestBackend, userType: UserType, permissions: string[] = []) {
  sequence += 1;
  const workosUserId = `user_negotiations_${userType.toLowerCase()}_${sequence}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} ${sequence}`,
      email: `${workosUserId}@example.com`,
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });
    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Negotiations role ${sequence}`,
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
  return { userId, as: t.withIdentity({ subject: workosUserId, issuer: WORKOS_ISSUER }) };
}

// Admin (negotiations.view + manage) → society → lead → listing → VISIT_COMPLETED inquiry.
async function createInquiryFixture(t: TestBackend) {
  const admin = await createUser(t, "ADMIN", [
    PERMISSIONS.NEGOTIATIONS_VIEW,
    PERMISSIONS.NEGOTIATIONS_MANAGE,
  ]);
  const tenant = await createUser(t, "TENANT");
  const owner = await createUser(t, "OWNER");

  const ids = await t.run(async (ctx) => {
    const guardId = await ctx.db.insert("users", {
      workos_user_id: `user_negotiations_submitter_${sequence}`,
      user_type: "GUARD",
      name: "Submitting guard",
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });
    const societyId = await ctx.db.insert("societies", {
      name: "Negotiation Society",
      city: "Pune",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower B",
      total_floors: 12,
      floor_labels: ["1", "2", "3"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "3",
      flat_number: "302",
      owner_phone: "9800000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: guardId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      slug: `negotiation-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 3_000_000,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "3",
      available_from: T0,
      created_by_admin_id: admin.userId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenant.userId,
      tenant_name: "Negotiating Tenant",
      tenant_phone: "9800000002",
      status: TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
    });
    return { listingId, inquiryId };
  });

  return { admin, tenant, owner, ...ids };
}

type InquiryFixture = Awaited<ReturnType<typeof createInquiryFixture>>;

async function insertNegotiation(
  t: TestBackend,
  fixture: InquiryFixture,
  overrides: Partial<Doc<"negotiations">> & { status: NegotiationStatus },
): Promise<Id<"negotiations">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("negotiations", {
      tenant_inquiry_id: fixture.inquiryId,
      listing_id: fixture.listingId,
      tenant_user_id: fixture.tenant.userId,
      owner_user_id: fixture.owner.userId,
      initiated_by_admin_id: fixture.admin.userId,
      initiated_at: now,
      last_activity_at: now,
      stale_flagged: false,
      rounds_flagged: false,
      is_deleted: false,
      ...overrides,
    });
  });
}

async function insertProposals(
  t: TestBackend,
  fixture: InquiryFixture,
  negotiationId: Id<"negotiations">,
  count: number,
  isDeleted = false,
) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("negotiation_terms_proposals")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiationId))
      .collect();
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("negotiation_terms_proposals", {
        negotiation_id: negotiationId,
        version: existing.length + index + 1,
        status: NEGOTIATION_PROPOSAL_STATUS.SUPERSEDED,
        monthly_rent_paise: 3_000_000 - index * 10_000,
        security_deposit_paise: 6_000_000,
        security_deposit_months: 2,
        lock_in_period_months: 11,
        notice_period_months: 1,
        move_in_date: Date.now() + 30 * DAY_MS,
        maintenance_charges_paise: 250_000,
        maintenance_paid_by: "TENANT",
        rent_escalation_type: "PERCENTAGE",
        rent_escalation_value: 5,
        furnishing_terms: "Semi-furnished",
        brokerage_tenant_side_paise: 1_500_000,
        brokerage_owner_side_paise: 1_500_000,
        token_advance_amount_paise: 1_000_000,
        created_by_admin_id: fixture.admin.userId,
        created_at: Date.now(),
        is_locked: false,
        is_deleted: isDeleted,
      });
    }
  });
}

async function readNegotiation(t: TestBackend, negotiationId: Id<"negotiations">) {
  return await t.run(async (ctx) => await ctx.db.get(negotiationId));
}

describe("negotiations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("markFailed", () => {
    it("records the reason, stamps failed_at and clears every escalation flag", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const negotiationId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.TERMS_PROPOSED,
        is_stale: true,
        too_many_rounds: true,
        token_without_agreement: true,
        stale_flagged: true,
        rounds_flagged: true,
      });

      const result = await fixture.admin.as.mutation(api.negotiations.markFailed, {
        negotiation_id: negotiationId,
        failure_reason: "  Owner withdrew the flat  ",
      });

      expect(result).toMatchObject({
        status: NEGOTIATION_STATUS.FAILED,
        failure_reason: "Owner withdrew the flat",
        failed_at: T0,
        is_stale: false,
        too_many_rounds: false,
        token_without_agreement: false,
        stale_flagged: false,
        rounds_flagged: false,
        escalation_flags_updated_at: T0,
      });
    });

    it("requires the ADMIN persona: an OPS user with negotiations.manage is rejected, the admin is not", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const ops = await createUser(t, "OPS", [PERMISSIONS.NEGOTIATIONS_MANAGE]);
      const negotiationId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.ACTIVE,
      });

      await expect(
        ops.as.mutation(api.negotiations.markFailed, {
          negotiation_id: negotiationId,
          failure_reason: "Tenant unresponsive",
        }),
      ).rejects.toThrow("Admin access required");
      expect((await readNegotiation(t, negotiationId))?.status).toBe(NEGOTIATION_STATUS.ACTIVE);

      await fixture.admin.as.mutation(api.negotiations.markFailed, {
        negotiation_id: negotiationId,
        failure_reason: "Tenant unresponsive",
      });
      expect((await readNegotiation(t, negotiationId))?.status).toBe(NEGOTIATION_STATUS.FAILED);
    });

    it("rejects a whitespace-only failure reason", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const negotiationId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.ACTIVE,
      });

      await expect(
        fixture.admin.as.mutation(api.negotiations.markFailed, {
          negotiation_id: negotiationId,
          failure_reason: "   ",
        }),
      ).rejects.toThrow("failure_reason is required");
    });

    it.fails(
      "fails a STALLED negotiation through the documented STALLED → FAILED transition (BUG-051)",
      async () => {
        const t = createTestBackend();
        const fixture = await createInquiryFixture(t);
        const negotiationId = await insertNegotiation(t, fixture, {
          status: NEGOTIATION_STATUS.STALLED,
          failure_reason: "Parties unresponsive",
        });

        await fixture.admin.as.mutation(api.negotiations.markFailed, {
          negotiation_id: negotiationId,
          failure_reason: "Stalled for a month; closing out",
        });

        expect((await readNegotiation(t, negotiationId))?.status).toBe(NEGOTIATION_STATUS.FAILED);
      },
    );
  });

  describe("markExpired", () => {
    it("rejects a STALLED negotiation, which is not an expiry source", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const negotiationId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.STALLED,
      });

      await expect(
        fixture.admin.as.mutation(api.negotiations.markExpired, {
          negotiation_id: negotiationId,
          failure_reason: "No response",
        }),
      ).rejects.toThrow("Invalid negotiation status transition from STALLED to EXPIRED");

      const activeId = await insertNegotiation(t, fixture, { status: NEGOTIATION_STATUS.ACTIVE });
      const expired = await fixture.admin.as.mutation(api.negotiations.markExpired, {
        negotiation_id: activeId,
        failure_reason: "No response",
      });
      expect(expired?.status).toBe(NEGOTIATION_STATUS.EXPIRED);
    });
  });

  describe("initiate", () => {
    it("returns the STALLED negotiation instead of opening a parallel one on the same inquiry", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const stalledId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.STALLED,
      });

      const returnedId = await fixture.admin.as.mutation(api.negotiations.initiate, {
        tenant_inquiry_id: fixture.inquiryId,
      });

      expect(returnedId).toBe(stalledId);
      const all = await t.run(async (ctx) => await ctx.db.query("negotiations").collect());
      expect(all).toHaveLength(1);
    });

    it("opens a fresh ACTIVE negotiation with its tenant room once the previous one FAILED", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const firstId = await fixture.admin.as.mutation(api.negotiations.initiate, {
        tenant_inquiry_id: fixture.inquiryId,
      });
      await fixture.admin.as.mutation(api.negotiations.markFailed, {
        negotiation_id: firstId,
        failure_reason: "Rent gap too wide",
      });

      const secondId = await fixture.admin.as.mutation(api.negotiations.initiate, {
        tenant_inquiry_id: fixture.inquiryId,
      });

      expect(secondId).not.toBe(firstId);
      const state = await t.run(async (ctx) => ({
        second: await ctx.db.get(secondId),
        inquiry: await ctx.db.get(fixture.inquiryId),
        rooms: await ctx.db
          .query("chat_channels")
          .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", secondId))
          .collect(),
      }));
      expect(state.second?.status).toBe(NEGOTIATION_STATUS.ACTIVE);
      expect(state.second?.owner_user_id).toBeUndefined();
      expect(state.inquiry?.status).toBe(TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED);
      expect(state.rooms.map((room) => room.channel_type)).toEqual(["OPS_TENANT"]);
      expect(state.second?.ops_tenant_channel_id).toBe(state.rooms[0]?._id);
    });
  });

  describe("checkStaleNegotiations", () => {
    it("flags a negotiation idle for more than 7 days but not one idle for exactly 7 days", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const staleId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.ACTIVE,
        last_activity_at: T0 - 7 * DAY_MS - 1,
      });
      const boundaryId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.TERMS_PROPOSED,
        last_activity_at: T0 - 7 * DAY_MS,
      });

      const result = await t.mutation(internal.negotiations.checkStaleNegotiations, {});

      expect(result).toMatchObject({ processed: 2, flagged: 1, cleared: 0, staleDays: 7 });
      expect(await readNegotiation(t, staleId)).toMatchObject({
        is_stale: true,
        stale_flagged: true,
        escalation_flags_updated_at: T0,
      });
      expect((await readNegotiation(t, boundaryId))?.is_stale).toBeUndefined();
    });

    it("is idempotent: a second run changes nothing and keeps escalation_flags_updated_at", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const staleId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.ACTIVE,
        last_activity_at: T0 - 10 * DAY_MS,
      });

      await t.mutation(internal.negotiations.checkStaleNegotiations, {});
      vi.setSystemTime(T0 + 60_000);
      const second = await t.mutation(internal.negotiations.checkStaleNegotiations, {});

      expect(second).toMatchObject({ processed: 1, flagged: 0, cleared: 0 });
      expect((await readNegotiation(t, staleId))?.escalation_flags_updated_at).toBe(T0);
    });

    it("clears the stale flag after fresh activity and skips terminal negotiations", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const revivedId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.COUNTER_PROPOSED,
        last_activity_at: T0 - DAY_MS,
        is_stale: true,
        stale_flagged: true,
      });
      const closedId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.CLOSED,
        last_activity_at: T0 - 30 * DAY_MS,
      });

      const result = await t.mutation(internal.negotiations.checkStaleNegotiations, {});

      expect(result).toMatchObject({ processed: 1, flagged: 0, cleared: 1 });
      expect(await readNegotiation(t, revivedId)).toMatchObject({
        is_stale: false,
        stale_flagged: false,
      });
      expect((await readNegotiation(t, closedId))?.is_stale).toBeUndefined();
    });
  });

  describe("checkTokenWithoutAgreement", () => {
    it("flags TOKEN_COLLECTED negotiations whose token was collected more than 3 days ago", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const insertToken = async (negotiationId: Id<"negotiations">, collectedAt: number) =>
        await t.run(async (ctx) => {
          await ctx.db.insert("negotiation_token_records", {
            negotiation_id: negotiationId,
            amount_paise: 1_000_000,
            collected_at: collectedAt,
            collection_method: TOKEN_COLLECTION_METHOD.UPI,
            refund_policy: TOKEN_REFUND_POLICY.NON_REFUNDABLE,
            tenant_agreed_at: collectedAt,
            status: TOKEN_RECORD_STATUS.COLLECTED,
            collected_by_admin_id: fixture.admin.userId,
            is_deleted: false,
          });
        });

      const overdueId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.TOKEN_COLLECTED,
      });
      await insertToken(overdueId, T0 - 3 * DAY_MS - 1);
      const boundaryId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.TOKEN_COLLECTED,
      });
      await insertToken(boundaryId, T0 - 3 * DAY_MS);
      const laterStageId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
      });
      await insertToken(laterStageId, T0 - 20 * DAY_MS);

      const result = await t.mutation(internal.negotiations.checkTokenWithoutAgreement, {});

      expect(result).toMatchObject({ processed: 3, flagged: 1, tokenAgreementDays: 3 });
      expect((await readNegotiation(t, overdueId))?.token_without_agreement).toBe(true);
      expect((await readNegotiation(t, boundaryId))?.token_without_agreement).toBeUndefined();
      expect((await readNegotiation(t, laterStageId))?.token_without_agreement).toBeUndefined();
    });
  });

  describe("checkExcessiveRoundsCron", () => {
    it("flags more than 5 live proposals, not exactly 5, and ignores deleted proposals", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const sixRoundsId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.COUNTER_PROPOSED,
      });
      await insertProposals(t, fixture, sixRoundsId, 6);
      const fiveRoundsId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.COUNTER_PROPOSED,
      });
      await insertProposals(t, fixture, fiveRoundsId, 5);
      await insertProposals(t, fixture, fiveRoundsId, 3, true);

      const first = await t.mutation(internal.negotiations.checkExcessiveRoundsCron, {});
      const second = await t.mutation(internal.negotiations.checkExcessiveRoundsCron, {});

      expect(first).toEqual({ processed: 2, flagged: 1, cleared: 0 });
      expect(second).toEqual({ processed: 2, flagged: 0, cleared: 0 });
      expect(await readNegotiation(t, sixRoundsId)).toMatchObject({
        too_many_rounds: true,
        rounds_flagged: true,
      });
      expect((await readNegotiation(t, fiveRoundsId))?.too_many_rounds).toBeUndefined();
    });
  });

  describe("dismissEscalationFlag", () => {
    it("keeps a dismissal through unchanged cron runs and drops it when a new flag appears", async () => {
      const t = createTestBackend();
      const fixture = await createInquiryFixture(t);
      const negotiationId = await insertNegotiation(t, fixture, {
        status: NEGOTIATION_STATUS.COUNTER_PROPOSED,
        last_activity_at: T0 - 9 * DAY_MS,
      });
      await t.mutation(internal.negotiations.checkStaleNegotiations, {});
      expect(await fixture.admin.as.query(api.negotiations.flaggedNegotiations, {})).toHaveLength(
        1,
      );

      await fixture.admin.as.mutation(api.negotiations.dismissEscalationFlag, {
        negotiation_id: negotiationId,
        reason: "Owner travelling, expected back",
      });
      await t.mutation(internal.negotiations.checkStaleNegotiations, {});
      expect(await fixture.admin.as.query(api.negotiations.flaggedNegotiations, {})).toEqual([]);

      await insertProposals(t, fixture, negotiationId, 6);
      await t.mutation(internal.negotiations.checkExcessiveRoundsCron, {});

      const flagged = await fixture.admin.as.query(api.negotiations.flaggedNegotiations, {});
      expect(flagged.map((row) => row.active_flag_labels)).toEqual([["STALE", "TOO_MANY_ROUNDS"]]);
      expect((await readNegotiation(t, negotiationId))?.flag_dismissed_at).toBeUndefined();
    });
  });
});
