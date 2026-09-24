import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_TYPE,
  CLOSURE_STATUS,
  LEAD_STATUS,
  NEGOTIATION_PROPOSAL_STATUS,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TENANT_INQUIRY_STATUS,
  TRANSACTION_STATUS,
  USER_STATUS,
  type LeadStatus,
  type NegotiationStatus,
  type TransactionStatus,
  type UserType,
} from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { payoutTotals } from "./functions";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_closures";
process.env.WORKOS_API_KEY ??= "sk_test_closures";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_closures";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.UTC(2026, 8, 1, 6, 30, 0);

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
  const workosUserId = `user_closures_${userType.toLowerCase()}_${sequence}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} ${sequence}`,
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });
    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Closure role ${sequence}`,
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

// Admin with closure permissions → society → guard-submitted lead (given status) → listing
// → tenant inquiry. The lead carries no owner record, so confirm skips RM/owner side effects.
async function createClosureFixture(t: TestBackend, leadStatus: LeadStatus = LEAD_STATUS.VERIFIED) {
  const admin = await createUser(t, "ADMIN", [
    PERMISSIONS.CLOSURES_VIEW,
    PERMISSIONS.CLOSURES_CREATE,
    PERMISSIONS.CLOSURES_EDIT,
    PERMISSIONS.CLOSURES_CONFIRM,
  ]);
  const guard = await createUser(t, "GUARD");
  const tenant = await createUser(t, "TENANT");

  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const societyId = await ctx.db.insert("societies", {
      name: "Closure Society",
      city: "Ahmedabad",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: admin.userId,
    });
    await ctx.db.insert("guard_profiles", {
      user_id: guard.userId,
      society_id: societyId,
      guard_type: "MAIN_GATE",
      has_seen_onboarding: true,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower J",
      total_floors: 7,
      floor_labels: ["6"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const insertLead = (flat: string) =>
      ctx.db.insert("leads", {
        society_id: societyId,
        building_id: buildingId,
        floor_number: "6",
        flat_number: flat,
        owner_phone: "9100000001",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
        submitted_by_guard_id: guard.userId,
        status: leadStatus,
      });
    const insertListing = (leadId: Id<"leads">, slug: string) =>
      ctx.db.insert("listings", {
        lead_id: leadId,
        slug,
        status: "PUBLISHED",
        rent_monthly: 2_700_000,
        bhk_config: "2BHK",
        furnishing: "SEMI_FURNISHED",
        floor_number: "6",
        available_from: now,
        created_by_admin_id: admin.userId,
      });
    const leadId = await insertLead("601");
    const listingId = await insertListing(leadId, `closure-listing-${sequence}`);
    const otherLeadId = await insertLead("602");
    const otherListingId = await insertListing(otherLeadId, `closure-other-listing-${sequence}`);
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenant.userId,
      tenant_name: "Closure Tenant",
      tenant_phone: "9100000002",
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    });
    const ownerId = await ctx.db.insert("owners", {
      phone: `91${String(sequence).padStart(8, "0")}`,
      source: "GUARD_LEAD",
      active_properties_count: 1,
      total_leads_count: 1,
      total_closures_count: 0,
      lifecycle_stage: "VERIFIED",
      lifecycle_updated_at: now,
      first_seen_at: now,
      last_activity_at: now,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });
    return { leadId, listingId, otherListingId, inquiryId, ownerId };
  });

  return { admin, guard, tenant, ...ids };
}

type Fixture = Awaited<ReturnType<typeof createClosureFixture>>;

async function insertNegotiationWithAgreedProposal(
  t: TestBackend,
  fixture: Fixture,
  status: NegotiationStatus,
): Promise<Id<"negotiations">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const negotiationId = await ctx.db.insert("negotiations", {
      tenant_inquiry_id: fixture.inquiryId,
      listing_id: fixture.listingId,
      tenant_user_id: fixture.tenant.userId,
      initiated_by_admin_id: fixture.admin.userId,
      status,
      initiated_at: now,
      last_activity_at: now,
      stale_flagged: false,
      rounds_flagged: false,
      is_deleted: false,
    });
    const proposalId = await ctx.db.insert("negotiation_terms_proposals", {
      negotiation_id: negotiationId,
      version: 2,
      status: NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED,
      monthly_rent_paise: 2_650_000,
      security_deposit_paise: 5_300_000,
      security_deposit_months: 2,
      lock_in_period_months: 11,
      notice_period_months: 1,
      move_in_date: now + 10 * 86_400_000,
      maintenance_charges_paise: 0,
      maintenance_paid_by: "OWNER",
      rent_escalation_type: "NONE",
      rent_escalation_value: 0,
      furnishing_terms: "Semi-furnished",
      brokerage_tenant_side_paise: 1_325_000,
      brokerage_owner_side_paise: 662_500,
      token_advance_amount_paise: 500_000,
      created_by_admin_id: fixture.admin.userId,
      created_at: now,
      is_locked: true,
      is_deleted: false,
    });
    await ctx.db.patch(negotiationId, { active_proposal_id: proposalId });
    return negotiationId;
  });
}

async function insertTransaction(
  t: TestBackend,
  fixture: Fixture,
  listingId: Id<"listings">,
  status: TransactionStatus,
): Promise<Id<"rental_transactions">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("rental_transactions", {
      tenant_user_id: fixture.tenant.userId,
      listing_id: listingId,
      owner_id: fixture.ownerId,
      status,
      monthly_rent_paise: 2_650_000,
      deposit_amount_paise: 5_300_000,
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false,
    }),
  );
}

function createClosure(
  fixture: Fixture,
  extra: {
    negotiation_id?: Id<"negotiations">;
    transaction_id?: Id<"rental_transactions">;
    brokerage_tenant_side?: number;
  } = {},
) {
  return fixture.admin.as.mutation(api.closures.create, {
    lead_id: fixture.leadId,
    move_in_date: T0 + 10 * 86_400_000,
    ...extra,
  });
}

describe("closures", () => {
  beforeEach(() => {
    // confirm() schedules trust-badge and notification jobs; fake timers keep them queued.
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("create", () => {
    it("refuses a lead that is not VERIFIED", async () => {
      const t = createTestBackend();
      const fixture = await createClosureFixture(t, LEAD_STATUS.SUBMITTED);

      await expect(createClosure(fixture)).rejects.toThrow("Only VERIFIED leads can have closures");
      expect(await t.run(async (ctx) => ctx.db.query("closures").collect())).toEqual([]);
    });

    it("allows one closure per lead, refusing a second even after the first is cancelled", async () => {
      const t = createTestBackend();
      const fixture = await createClosureFixture(t);
      const closureId = await createClosure(fixture);
      const created = await t.run(async (ctx) => ctx.db.get(closureId));
      expect(created).toMatchObject({
        status: CLOSURE_STATUS.PENDING,
        listing_id: fixture.listingId,
        closed_by_admin_id: fixture.admin.userId,
      });

      await fixture.admin.as.mutation(api.closures.cancel, { id: closureId });

      await expect(createClosure(fixture)).rejects.toThrow(
        "A closure already exists for this lead",
      );
    });

    it("takes brokerage from a READY_FOR_CLOSURE negotiation's agreed proposal and refuses earlier stages", async () => {
      const t = createTestBackend();
      const fixture = await createClosureFixture(t);
      const earlyId = await insertNegotiationWithAgreedProposal(
        t,
        fixture,
        NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
      );
      await expect(createClosure(fixture, { negotiation_id: earlyId })).rejects.toThrow(
        "Negotiation must be READY_FOR_CLOSURE before creating closure",
      );

      await t.run(async (ctx) => {
        await ctx.db.patch(earlyId, { status: NEGOTIATION_STATUS.READY_FOR_CLOSURE });
      });
      const closureId = await createClosure(fixture, {
        negotiation_id: earlyId,
        brokerage_tenant_side: 999,
      });

      const closure = await t.run(async (ctx) => ctx.db.get(closureId));
      expect(closure).toMatchObject({
        negotiation_id: earlyId,
        brokerage_tenant_side: 1_325_000,
        brokerage_owner_side: 662_500,
      });
    });

    it("refuses a transaction from another listing or one already attached to a closure", async () => {
      const t = createTestBackend();
      const fixture = await createClosureFixture(t);
      const foreignId = await insertTransaction(
        t,
        fixture,
        fixture.otherListingId,
        TRANSACTION_STATUS.COMPLETED,
      );
      await expect(createClosure(fixture, { transaction_id: foreignId })).rejects.toThrow(
        "Linked transaction must belong to the same listing as this closure",
      );

      const attachedId = await insertTransaction(
        t,
        fixture,
        fixture.listingId,
        TRANSACTION_STATUS.COMPLETED,
      );
      await t.run(async (ctx) => {
        const otherClosure = await ctx.db.insert("closures", {
          lead_id: fixture.leadId,
          move_in_date: T0,
          status: CLOSURE_STATUS.CANCELLED,
          closed_by_admin_id: fixture.admin.userId,
        });
        await ctx.db.patch(attachedId, { closure_id: otherClosure });
        await ctx.db.delete(otherClosure);
      });
      await expect(createClosure(fixture, { transaction_id: attachedId })).rejects.toThrow(
        "Linked transaction is already attached to another closure",
      );
    });
  });

  describe("confirm", () => {
    it("waits for the linked transaction to be COMPLETED, then closes the negotiation and inquiry", async () => {
      const t = createTestBackend();
      const fixture = await createClosureFixture(t);
      const negotiationId = await insertNegotiationWithAgreedProposal(
        t,
        fixture,
        NEGOTIATION_STATUS.READY_FOR_CLOSURE,
      );
      const transactionId = await insertTransaction(
        t,
        fixture,
        fixture.listingId,
        TRANSACTION_STATUS.MOVE_IN_SCHEDULED,
      );
      const closureId = await createClosure(fixture, {
        negotiation_id: negotiationId,
        transaction_id: transactionId,
      });

      await expect(
        fixture.admin.as.mutation(api.closures.confirm, { id: closureId }),
      ).rejects.toThrow(
        "Cannot confirm closure until linked transaction is COMPLETED (current: MOVE_IN_SCHEDULED)",
      );

      await t.run(async (ctx) => {
        await ctx.db.patch(transactionId, { status: TRANSACTION_STATUS.COMPLETED });
      });
      await fixture.admin.as.mutation(api.closures.confirm, { id: closureId });

      const state = await t.run(async (ctx) => ({
        closure: await ctx.db.get(closureId),
        negotiation: await ctx.db.get(negotiationId),
        inquiry: await ctx.db.get(fixture.inquiryId),
        transaction: await ctx.db.get(transactionId),
      }));
      expect(state.closure).toMatchObject({ status: CLOSURE_STATUS.CONFIRMED, confirmed_at: T0 });
      expect(state.negotiation?.status).toBe(NEGOTIATION_STATUS.CLOSED);
      expect(state.inquiry?.status).toBe(TENANT_INQUIRY_STATUS.CLOSED);
      expect(state.transaction?.closure_id).toBe(closureId);
    });
  });

  describe("cancel", () => {
    it("voids pending and approved payouts, keeps disbursed ones, and blocks a later confirm", async () => {
      const t = createTestBackend();
      const fixture = await createClosureFixture(t);
      const closureId = await createClosure(fixture);
      const payoutIds = await t.run(async (ctx) => {
        // Raw inserts skip triggers; register each row in the payout aggregate as the
        // production insert path would, so the cancel-time patch trigger can find it.
        const insertPayout = async (status: "pending" | "approved" | "disbursed") => {
          const id = await ctx.db.insert("payouts", {
            guard_user_id: fixture.guard.userId,
            lead_id: fixture.leadId,
            closure_id: closureId,
            amount_paise: 250_000,
            status,
            initiated_by_admin_id: fixture.admin.userId,
          });
          await payoutTotals.insert(ctx, (await ctx.db.get(id))!);
          return id;
        };
        return {
          pending: await insertPayout("pending"),
          approved: await insertPayout("approved"),
          disbursed: await insertPayout("disbursed"),
        };
      });

      const cancelled = await fixture.admin.as.mutation(api.closures.cancel, { id: closureId });

      expect(cancelled?.status).toBe(CLOSURE_STATUS.CANCELLED);
      const payouts = await t.run(async (ctx) => ({
        pending: await ctx.db.get(payoutIds.pending),
        approved: await ctx.db.get(payoutIds.approved),
        disbursed: await ctx.db.get(payoutIds.disbursed),
      }));
      expect(payouts.pending?.status).toBe("voided");
      expect(payouts.approved?.status).toBe("voided");
      expect(payouts.disbursed?.status).toBe("disbursed");
      await expect(
        fixture.admin.as.mutation(api.closures.confirm, { id: closureId }),
      ).rejects.toThrow("Cannot confirm a closure with status: CANCELLED");
    });
  });
});
