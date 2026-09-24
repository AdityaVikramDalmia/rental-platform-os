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
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_negotiation_tokens";
process.env.WORKOS_API_KEY ??= "sk_test_negotiation_tokens";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_negotiation_tokens";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.UTC(2026, 2, 3, 9, 30, 0);
const TOKEN_AMOUNT_PAISE = 1_250_000;

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
  const workosUserId = `user_tokens_${userType.toLowerCase()}_${sequence}`;
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
        name: `Token role ${sequence}`,
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

// Property chain → inquiry → negotiation (given status) whose active proposal is BOTH_AGREED.
async function createAgreedNegotiation(t: TestBackend, status: NegotiationStatus) {
  const admin = await createUser(t, "ADMIN", [
    PERMISSIONS.NEGOTIATIONS_VIEW,
    PERMISSIONS.NEGOTIATIONS_MANAGE,
  ]);
  const tenant = await createUser(t, "TENANT");
  const owner = await createUser(t, "OWNER");

  const negotiationId = await t.run(async (ctx) => {
    const now = Date.now();
    const societyId = await ctx.db.insert("societies", {
      name: "Token Society",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Wing C",
      total_floors: 8,
      floor_labels: ["1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "2",
      flat_number: "204",
      owner_phone: "9700000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: admin.userId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      slug: `token-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 3_500_000,
      bhk_config: "2BHK",
      furnishing: "FULLY_FURNISHED",
      floor_number: "2",
      available_from: now,
      created_by_admin_id: admin.userId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenant.userId,
      tenant_name: "Token Tenant",
      tenant_phone: "9700000002",
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    });
    const id = await ctx.db.insert("negotiations", {
      tenant_inquiry_id: inquiryId,
      listing_id: listingId,
      tenant_user_id: tenant.userId,
      owner_user_id: owner.userId,
      initiated_by_admin_id: admin.userId,
      status,
      initiated_at: now,
      last_activity_at: now,
      stale_flagged: false,
      rounds_flagged: false,
      is_deleted: false,
    });
    const proposalId = await ctx.db.insert("negotiation_terms_proposals", {
      negotiation_id: id,
      version: 1,
      status: NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED,
      monthly_rent_paise: 3_500_000,
      security_deposit_paise: 7_000_000,
      security_deposit_months: 2,
      lock_in_period_months: 11,
      notice_period_months: 1,
      move_in_date: now + 20 * 86_400_000,
      maintenance_charges_paise: 300_000,
      maintenance_paid_by: "OWNER",
      rent_escalation_type: "PERCENTAGE",
      rent_escalation_value: 5,
      furnishing_terms: "Fully furnished",
      brokerage_tenant_side_paise: 1_750_000,
      brokerage_owner_side_paise: 1_750_000,
      token_advance_amount_paise: TOKEN_AMOUNT_PAISE,
      created_by_admin_id: admin.userId,
      created_at: now,
      shared_to_rooms: ["COMBINED"],
      shared_at: now,
      is_locked: true,
      locked_at: now,
      is_deleted: false,
    });
    await ctx.db.patch(id, { active_proposal_id: proposalId });
    return id;
  });

  return { admin, tenant, owner, negotiationId };
}

async function readTokenRecords(t: TestBackend, negotiationId: Id<"negotiations">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("negotiation_token_records")
      .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiationId))
      .collect(),
  );
}

describe("negotiationTokens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("tenantAgreeToPolicy", () => {
    it("creates one PENDING record for the agreed token amount and returns it again on a repeat call", async () => {
      const t = createTestBackend();
      const fixture = await createAgreedNegotiation(t, NEGOTIATION_STATUS.TERMS_AGREED);

      const firstId = await fixture.tenant.as.mutation(api.negotiationTokens.tenantAgreeToPolicy, {
        negotiation_id: fixture.negotiationId,
      });
      const secondId = await fixture.tenant.as.mutation(api.negotiationTokens.tenantAgreeToPolicy, {
        negotiation_id: fixture.negotiationId,
      });

      expect(secondId).toBe(firstId);
      const records = await readTokenRecords(t, fixture.negotiationId);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        amount_paise: TOKEN_AMOUNT_PAISE,
        status: TOKEN_RECORD_STATUS.PENDING,
        refund_policy: TOKEN_REFUND_POLICY.CASE_BY_CASE,
        tenant_agreed_at: T0,
        collected_by_admin_id: fixture.admin.userId,
      });
    });

    it("rejects a tenant who is not the negotiation's tenant while the linked tenant can consent", async () => {
      const t = createTestBackend();
      const fixture = await createAgreedNegotiation(t, NEGOTIATION_STATUS.TERMS_AGREED);
      const otherTenant = await createUser(t, "TENANT");

      await expect(
        otherTenant.as.mutation(api.negotiationTokens.tenantAgreeToPolicy, {
          negotiation_id: fixture.negotiationId,
        }),
      ).rejects.toThrow("Only linked tenant can agree to token policy");
      await expect(
        fixture.owner.as.mutation(api.negotiationTokens.tenantAgreeToPolicy, {
          negotiation_id: fixture.negotiationId,
        }),
      ).rejects.toThrow("Tenant access required");
      expect(await readTokenRecords(t, fixture.negotiationId)).toEqual([]);

      await fixture.tenant.as.mutation(api.negotiationTokens.tenantAgreeToPolicy, {
        negotiation_id: fixture.negotiationId,
      });
      expect(await readTokenRecords(t, fixture.negotiationId)).toHaveLength(1);
    });

    it("rejects consent before the terms are agreed", async () => {
      const t = createTestBackend();
      const fixture = await createAgreedNegotiation(t, NEGOTIATION_STATUS.COUNTER_PROPOSED);

      await expect(
        fixture.tenant.as.mutation(api.negotiationTokens.tenantAgreeToPolicy, {
          negotiation_id: fixture.negotiationId,
        }),
      ).rejects.toThrow("Token policy can only be agreed after terms are finalized");
      expect(await readTokenRecords(t, fixture.negotiationId)).toEqual([]);
    });
  });

  describe("recordCollection", () => {
    it("moves TERMS_AGREED to TOKEN_COLLECTED and snapshots the refund policy chosen at collection", async () => {
      const t = createTestBackend();
      const fixture = await createAgreedNegotiation(t, NEGOTIATION_STATUS.TERMS_AGREED);
      const recordId = await fixture.tenant.as.mutation(api.negotiationTokens.tenantAgreeToPolicy, {
        negotiation_id: fixture.negotiationId,
      });
      vi.setSystemTime(T0 + 3_600_000);

      await fixture.admin.as.mutation(api.negotiationTokens.recordCollection, {
        negotiation_id: fixture.negotiationId,
        collection_method: TOKEN_COLLECTION_METHOD.UPI,
        refund_policy: TOKEN_REFUND_POLICY.PARTIAL_REFUND,
        refund_percentage: 50,
        receipt_notes: "  UPI ref 88123  ",
      });

      const state = await t.run(async (ctx) => ({
        record: await ctx.db.get(recordId),
        negotiation: await ctx.db.get(fixture.negotiationId),
      }));
      expect(state.record).toMatchObject({
        status: TOKEN_RECORD_STATUS.COLLECTED,
        collected_at: T0 + 3_600_000,
        collection_method: TOKEN_COLLECTION_METHOD.UPI,
        refund_policy: TOKEN_REFUND_POLICY.PARTIAL_REFUND,
        refund_percentage: 50,
        notes: "UPI ref 88123",
      });
      expect(state.negotiation?.status).toBe(NEGOTIATION_STATUS.TOKEN_COLLECTED);
    });

    it("rejects a PARTIAL_REFUND policy without refund_percentage and leaves the record PENDING", async () => {
      const t = createTestBackend();
      const fixture = await createAgreedNegotiation(t, NEGOTIATION_STATUS.TERMS_AGREED);
      await fixture.tenant.as.mutation(api.negotiationTokens.tenantAgreeToPolicy, {
        negotiation_id: fixture.negotiationId,
      });

      await expect(
        fixture.admin.as.mutation(api.negotiationTokens.recordCollection, {
          negotiation_id: fixture.negotiationId,
          collection_method: TOKEN_COLLECTION_METHOD.CASH,
          refund_policy: TOKEN_REFUND_POLICY.PARTIAL_REFUND,
        }),
      ).rejects.toThrow("refund_percentage is required for PARTIAL_REFUND");

      const [record] = await readTokenRecords(t, fixture.negotiationId);
      expect(record?.status).toBe(TOKEN_RECORD_STATUS.PENDING);
      const negotiation = await t.run(async (ctx) => ctx.db.get(fixture.negotiationId));
      expect(negotiation?.status).toBe(NEGOTIATION_STATUS.TERMS_AGREED);
    });

    it("requires exactly one locator and a consented record before collecting", async () => {
      const t = createTestBackend();
      const fixture = await createAgreedNegotiation(t, NEGOTIATION_STATUS.TERMS_AGREED);

      await expect(
        fixture.admin.as.mutation(api.negotiationTokens.recordCollection, {
          collection_method: TOKEN_COLLECTION_METHOD.CASH,
        }),
      ).rejects.toThrow("Provide exactly one of negotiation_id or token_record_id");
      await expect(
        fixture.admin.as.mutation(api.negotiationTokens.recordCollection, {
          negotiation_id: fixture.negotiationId,
          collection_method: TOKEN_COLLECTION_METHOD.CASH,
        }),
      ).rejects.toThrow("Token record not found");

      const negotiation = await t.run(async (ctx) => ctx.db.get(fixture.negotiationId));
      expect(negotiation?.status).toBe(NEGOTIATION_STATUS.TERMS_AGREED);
    });
  });
});
