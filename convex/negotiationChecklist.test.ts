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

process.env.WORKOS_CLIENT_ID ??= "client_test_negotiation_checklist";
process.env.WORKOS_API_KEY ??= "sk_test_negotiation_checklist";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_negotiation_checklist";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.UTC(2026, 3, 10, 5, 0, 0);

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
  const workosUserId = `user_checklist_${userType.toLowerCase()}_${sequence}`;
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
        name: `Checklist role ${sequence}`,
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

type FixtureOptions = {
  status: NegotiationStatus;
  signers?: Array<"TENANT" | "OWNER">;
  tokenCollected?: boolean;
  rentAgreementFile?: boolean;
};

// Negotiation after agreement: BOTH_AGREED proposal, optional signatures, token record and
// uploaded rent agreement (stored directly: convex-test keeps no content type for uploads).
async function createPostAgreementNegotiation(t: TestBackend, options: FixtureOptions) {
  const manager = await createUser(t, "ADMIN", [
    PERMISSIONS.NEGOTIATIONS_VIEW,
    PERMISSIONS.NEGOTIATIONS_MANAGE,
  ]);
  const tenant = await createUser(t, "TENANT");
  const owner = await createUser(t, "OWNER");

  const negotiationId = await t.run(async (ctx) => {
    const now = Date.now();
    const societyId = await ctx.db.insert("societies", {
      name: "Checklist Society",
      city: "Bengaluru",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: manager.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Block D",
      total_floors: 6,
      floor_labels: ["1"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "1",
      flat_number: "101",
      owner_phone: "9600000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: manager.userId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      slug: `checklist-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 2_800_000,
      bhk_config: "1BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "1",
      available_from: now,
      created_by_admin_id: manager.userId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenant.userId,
      tenant_name: "Checklist Tenant",
      tenant_phone: "9600000002",
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    });
    const rentAgreementStorageId = options.rentAgreementFile
      ? await ctx.storage.store(new Blob(["%PDF-1.7 synthetic agreement"]))
      : undefined;
    const id = await ctx.db.insert("negotiations", {
      tenant_inquiry_id: inquiryId,
      listing_id: listingId,
      tenant_user_id: tenant.userId,
      owner_user_id: owner.userId,
      initiated_by_admin_id: manager.userId,
      status: options.status,
      rent_agreement_storage_id: rentAgreementStorageId,
      initiated_at: now,
      terms_agreed_at: now,
      last_activity_at: now,
      stale_flagged: false,
      rounds_flagged: false,
      is_deleted: false,
    });
    const proposalId = await ctx.db.insert("negotiation_terms_proposals", {
      negotiation_id: id,
      version: 1,
      status: NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED,
      monthly_rent_paise: 2_800_000,
      security_deposit_paise: 5_600_000,
      security_deposit_months: 2,
      lock_in_period_months: 11,
      notice_period_months: 1,
      move_in_date: now + 15 * 86_400_000,
      maintenance_charges_paise: 0,
      maintenance_paid_by: "OWNER",
      rent_escalation_type: "NONE",
      rent_escalation_value: 0,
      furnishing_terms: "Semi-furnished",
      brokerage_tenant_side_paise: 1_400_000,
      brokerage_owner_side_paise: 0,
      token_advance_amount_paise: 500_000,
      created_by_admin_id: manager.userId,
      created_at: now,
      shared_to_rooms: ["COMBINED"],
      shared_at: now,
      is_locked: true,
      locked_at: now,
      is_deleted: false,
    });
    await ctx.db.patch(id, { active_proposal_id: proposalId });
    for (const role of options.signers ?? ["TENANT", "OWNER"]) {
      await ctx.db.insert("negotiation_terms_signatures", {
        proposal_id: proposalId,
        negotiation_id: id,
        user_id: role === "TENANT" ? tenant.userId : owner.userId,
        user_role: role,
        signed_at: now,
        agreement_text: "I agree to these terms.",
        proposal_version: 1,
        is_deleted: false,
      });
    }
    if (options.tokenCollected ?? true) {
      await ctx.db.insert("negotiation_token_records", {
        negotiation_id: id,
        amount_paise: 500_000,
        collected_at: now,
        collection_method: TOKEN_COLLECTION_METHOD.BANK_TRANSFER,
        refund_policy: TOKEN_REFUND_POLICY.NON_REFUNDABLE,
        tenant_agreed_at: now,
        status: TOKEN_RECORD_STATUS.COLLECTED,
        collected_by_admin_id: manager.userId,
        is_deleted: false,
      });
    }
    return id;
  });

  return { manager, tenant, owner, negotiationId };
}

type Fixture = Awaited<ReturnType<typeof createPostAgreementNegotiation>>;

async function completeManualItemsExceptKeys(fixture: Fixture) {
  const update = (
    item_key:
      | "police_verification_status"
      | "society_noc_status"
      | "owner_kyc_status"
      | "rent_agreement_status"
      | "move_in_inspection_status",
    status: "COMPLETED" | "OBTAINED" | "VERIFIED" | "STAMP_REGISTERED",
  ) =>
    fixture.manager.as.mutation(api.negotiationChecklist.updateChecklistItem, {
      negotiation_id: fixture.negotiationId,
      item_key,
      status,
    });

  await update("police_verification_status", "COMPLETED");
  await update("society_noc_status", "OBTAINED");
  await update("owner_kyc_status", "VERIFIED");
  await update("rent_agreement_status", "STAMP_REGISTERED");
  return await update("move_in_inspection_status", "COMPLETED");
}

async function readNegotiation(t: TestBackend, negotiationId: Id<"negotiations">) {
  return await t.run(async (ctx) => await ctx.db.get(negotiationId));
}

describe("negotiationChecklist", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("updateChecklistItem", () => {
    it("rejects updates before token collection; the first update after it starts DOCUMENTATION_IN_PROGRESS", async () => {
      const t = createTestBackend();
      const agreedOnly = await createPostAgreementNegotiation(t, {
        status: NEGOTIATION_STATUS.TERMS_AGREED,
        tokenCollected: false,
      });
      await expect(
        agreedOnly.manager.as.mutation(api.negotiationChecklist.updateChecklistItem, {
          negotiation_id: agreedOnly.negotiationId,
          item_key: "society_noc_status",
          status: "OBTAINED",
        }),
      ).rejects.toThrow("Checklist can only be updated after token collection");

      const collected = await createPostAgreementNegotiation(t, {
        status: NEGOTIATION_STATUS.TOKEN_COLLECTED,
      });
      const status = await collected.manager.as.mutation(
        api.negotiationChecklist.updateChecklistItem,
        {
          negotiation_id: collected.negotiationId,
          item_key: "society_noc_status",
          status: "OBTAINED",
        },
      );

      expect(status.negotiation_status).toBe(NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS);
      expect(status.manual_items.society_noc_status.status).toBe("OBTAINED");
      expect(status.completed_items_count).toBe(5);
      expect(status.total_items).toBe(10);
    });

    it("rejects a status that does not belong to the item", async () => {
      const t = createTestBackend();
      const fixture = await createPostAgreementNegotiation(t, {
        status: NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
      });

      await expect(
        fixture.manager.as.mutation(api.negotiationChecklist.updateChecklistItem, {
          negotiation_id: fixture.negotiationId,
          item_key: "police_verification_status",
          status: "OBTAINED",
        }),
      ).rejects.toThrow("Invalid status OBTAINED for checklist item police_verification_status");
      expect((await readNegotiation(t, fixture.negotiationId))?.police_verification_status).toBe(
        undefined,
      );
    });

    it("refuses to mark the rent agreement STAMP_REGISTERED until a file is on the negotiation", async () => {
      const t = createTestBackend();
      const withoutFile = await createPostAgreementNegotiation(t, {
        status: NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
      });
      await expect(
        withoutFile.manager.as.mutation(api.negotiationChecklist.updateChecklistItem, {
          negotiation_id: withoutFile.negotiationId,
          item_key: "rent_agreement_status",
          status: "STAMP_REGISTERED",
        }),
      ).rejects.toThrow("Rent agreement file must be uploaded before marking complete.");

      const withFile = await createPostAgreementNegotiation(t, {
        status: NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
        rentAgreementFile: true,
      });
      const status = await withFile.manager.as.mutation(
        api.negotiationChecklist.updateChecklistItem,
        {
          negotiation_id: withFile.negotiationId,
          item_key: "rent_agreement_status",
          status: "STAMP_REGISTERED",
        },
      );
      expect(status.manual_items.rent_agreement_status.status).toBe("STAMP_REGISTERED");
    });

    it("reaches READY_FOR_CLOSURE on the tenth complete item, and reopenChecklist sends it back", async () => {
      const t = createTestBackend();
      const fixture = await createPostAgreementNegotiation(t, {
        status: NEGOTIATION_STATUS.TOKEN_COLLECTED,
        rentAgreementFile: true,
      });

      const nineDone = await completeManualItemsExceptKeys(fixture);
      expect(nineDone.completed_items_count).toBe(9);
      expect(nineDone.negotiation_status).toBe(NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS);

      vi.setSystemTime(T0 + 60_000);
      const ready = await fixture.manager.as.mutation(
        api.negotiationChecklist.updateChecklistItem,
        {
          negotiation_id: fixture.negotiationId,
          item_key: "key_handover_status",
          status: "COMPLETED",
        },
      );
      expect(ready).toMatchObject({
        negotiation_status: NEGOTIATION_STATUS.READY_FOR_CLOSURE,
        completed_items_count: 10,
        is_ready_for_closure: true,
      });
      expect((await readNegotiation(t, fixture.negotiationId))?.ready_for_closure_at).toBe(
        T0 + 60_000,
      );

      await fixture.manager.as.mutation(api.negotiationChecklist.reopenChecklist, {
        negotiation_id: fixture.negotiationId,
        reason: "Society NOC was withdrawn",
      });
      const reopened = await readNegotiation(t, fixture.negotiationId);
      expect(reopened?.status).toBe(NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS);
      expect(reopened?.ready_for_closure_at).toBeUndefined();
    });

    it("never becomes ready while the owner's signature on the agreed proposal is missing", async () => {
      const t = createTestBackend();
      const fixture = await createPostAgreementNegotiation(t, {
        status: NEGOTIATION_STATUS.TOKEN_COLLECTED,
        signers: ["TENANT"],
        rentAgreementFile: true,
      });

      await completeManualItemsExceptKeys(fixture);
      const status = await fixture.manager.as.mutation(
        api.negotiationChecklist.updateChecklistItem,
        {
          negotiation_id: fixture.negotiationId,
          item_key: "key_handover_status",
          status: "COMPLETED",
        },
      );

      expect(status.auto_items).toEqual({
        terms_agreed: true,
        both_parties_signed: false,
        token_collected: true,
        brokerage_recorded: true,
      });
      expect(status.is_ready_for_closure).toBe(false);
      expect(status.negotiation_status).toBe(NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS);
    });
  });

  describe("waiveItem", () => {
    it("requires the ADMIN persona and refuses to waive the mandatory rent agreement", async () => {
      const t = createTestBackend();
      const fixture = await createPostAgreementNegotiation(t, {
        status: NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
      });
      const opsManager = await createUser(t, "OPS", [PERMISSIONS.NEGOTIATIONS_MANAGE]);

      await expect(
        opsManager.as.mutation(api.negotiationChecklist.waiveItem, {
          negotiation_id: fixture.negotiationId,
          item_key: "police_verification_status",
          waive_reason: "Tenant is a returning resident",
        }),
      ).rejects.toThrow("Admin access required");
      await expect(
        fixture.manager.as.mutation(api.negotiationChecklist.waiveItem, {
          negotiation_id: fixture.negotiationId,
          item_key: "rent_agreement_status",
          waive_reason: "Verbal agreement",
        }),
      ).rejects.toThrow("Rent agreement cannot be waived — it is a mandatory document.");

      const status = await fixture.manager.as.mutation(api.negotiationChecklist.waiveItem, {
        negotiation_id: fixture.negotiationId,
        item_key: "police_verification_status",
        waive_reason: "  Tenant is a returning resident  ",
      });
      expect(status.manual_items.police_verification_status).toEqual({
        status: "WAIVED",
        waive_reason: "Tenant is a returning resident",
      });
    });
  });
});
