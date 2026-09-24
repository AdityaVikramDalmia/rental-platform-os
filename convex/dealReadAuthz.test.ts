// Cross-party read denial for deal-pipeline records: each block refuses another tenant, another
// owner, a guard and an OPS user without the permission, and still serves the legitimate caller.
// Sweep record: docs/security/authz-sweep-2026-09-23.md
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGREEMENT_STATUS,
  AVAILABILITY_TYPE,
  KYC_PACKET_STATUS,
  LEAD_STATUS,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TENANT_INQUIRY_STATUS,
  TOKEN_COLLECTION_METHOD,
  TOKEN_RECORD_STATUS,
  TOKEN_REFUND_POLICY,
  TRANSACTION_STATUS,
  USER_STATUS,
  type UserType,
} from "../lib/constants";
import { api } from "./_generated/api";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_deal_read_authz";
process.env.WORKOS_API_KEY ??= "sk_test_deal_read_authz";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_deal_read_authz";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.UTC(2026, 11, 1, 9, 0, 0);

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
  const workosUserId = `user_deal_reads_${userType.toLowerCase()}_${sequence}`;
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
        name: `Deal read role ${sequence}`,
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

// One deal with every record type, plus the callers each read path must refuse or serve.
async function createDealFixture(t: TestBackend, options: { withKycPacket?: boolean } = {}) {
  const staff = await createUser(t, "ADMIN", [
    PERMISSIONS.TRANSACTIONS_VIEW,
    PERMISSIONS.KYC_VERIFY,
    PERMISSIONS.NEGOTIATIONS_VIEW,
  ]);
  const opsWithoutPermissions = await createUser(t, "OPS");
  const tenant = await createUser(t, "TENANT");
  const otherTenant = await createUser(t, "TENANT");
  const owner = await createUser(t, "OWNER");
  const otherOwner = await createUser(t, "OWNER");
  const guard = await createUser(t, "GUARD");
  const otherGuard = await createUser(t, "GUARD");

  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("owners", {
      phone: `89${String(sequence).padStart(8, "0")}`,
      user_id: owner.userId,
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
    const societyId = await ctx.db.insert("societies", {
      name: "Read Authz Society",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: staff.userId,
    });
    for (const guardUserId of [guard.userId, otherGuard.userId]) {
      await ctx.db.insert("guard_profiles", {
        user_id: guardUserId,
        society_id: societyId,
        guard_type: "MAIN_GATE",
        has_seen_onboarding: true,
      });
    }
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower M",
      total_floors: 12,
      floor_labels: ["10"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "10",
      flat_number: "1001",
      owner_phone: "9890000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: guard.userId,
      status: LEAD_STATUS.VERIFIED,
      owner_id: ownerId,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerId,
      slug: `read-authz-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 3_300_000,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "10",
      available_from: now,
      created_by_admin_id: staff.userId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenant.userId,
      tenant_name: "Private Tenant",
      tenant_phone: "9890000002",
      tenant_email: "private-tenant@example.com",
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
      ops_notes: "internal ops note",
    });
    const transactionId = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant.userId,
      listing_id: listingId,
      owner_id: ownerId,
      tenant_inquiry_id: inquiryId,
      status: TRANSACTION_STATUS.AGREEMENT_SENT,
      monthly_rent_paise: 3_300_000,
      deposit_amount_paise: 6_600_000,
      last_override_reason: "internal override reason",
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    await ctx.db.insert("rental_agreements", {
      transaction_id: transactionId,
      template_version: "v1",
      terms: { monthly_rent_paise: 3_300_000, deposit_amount_paise: 6_600_000 },
      status: AGREEMENT_STATUS.SENT,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    if (options.withKycPacket ?? true) {
      await ctx.db.insert("kyc_packets", {
        transaction_id: transactionId,
        tenant_user_id: tenant.userId,
        aadhaar_verified: true,
        employer_verified: false,
        landlord_reference: { name: "Previous landlord", phone: "9890000003" },
        overall_status: KYC_PACKET_STATUS.IN_PROGRESS,
        status_note: "Employer letter pending",
        police_verification_status: "FORM_GENERATED",
        police_form_storage_id: await ctx.storage.store(new Blob(["%PDF police form"])),
        created_at: now,
        updated_at: now,
        is_deleted: false,
      });
    }
    const negotiationId = await ctx.db.insert("negotiations", {
      tenant_inquiry_id: inquiryId,
      listing_id: listingId,
      tenant_user_id: tenant.userId,
      owner_user_id: owner.userId,
      initiated_by_admin_id: staff.userId,
      status: NEGOTIATION_STATUS.TOKEN_COLLECTED,
      initiated_at: now,
      last_activity_at: now,
      stale_flagged: false,
      rounds_flagged: false,
      is_deleted: false,
    });
    const insertRoom = (channelType: "OPS_TENANT" | "OPS_OWNER" | "COMBINED") =>
      ctx.db.insert("chat_channels", {
        inquiry_id: inquiryId,
        channel_type: channelType,
        negotiation_id: negotiationId,
        status: "ACTIVE",
        created_by_admin_id: staff.userId,
        created_at: now,
      });
    await ctx.db.patch(negotiationId, {
      ops_tenant_channel_id: await insertRoom("OPS_TENANT"),
      ops_owner_channel_id: await insertRoom("OPS_OWNER"),
      combined_channel_id: await insertRoom("COMBINED"),
    });
    const tokenRecordId = await ctx.db.insert("negotiation_token_records", {
      negotiation_id: negotiationId,
      amount_paise: 800_000,
      collected_at: now,
      collection_method: TOKEN_COLLECTION_METHOD.UPI,
      refund_policy: TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS,
      refund_days: 7,
      tenant_agreed_at: now,
      status: TOKEN_RECORD_STATUS.COLLECTED,
      collected_by_admin_id: staff.userId,
      is_deleted: false,
    });
    const requirementId = await ctx.db.insert("document_requirements", {
      lead_id: leadId,
      listing_id: listingId,
      requirement_type: "OWNER_DOCS",
      assigned_to: guard.userId,
      assigned_by: staff.userId,
      overall_status: "NOT_STARTED",
      items: [{ item_id: "pan", label: "Owner PAN", is_required: true, status: "PENDING" }],
      is_deleted: false,
    });
    const templateId = await ctx.db.insert("checklist_templates", {
      name: "Move-in inspection",
      depth: "LIGHT",
      is_active: true,
      is_deleted: false,
      sections: [],
    });
    const visitId = await ctx.db.insert("visits", {
      lead_id: leadId,
      society_id: societyId,
      listing_id: listingId,
      scheduled_start: now,
      scheduled_end: now + 3_600_000,
      assigned_guard_id: guard.userId,
      status: "ASSIGNED",
      created_by_admin_id: staff.userId,
    });
    const checklistId = await ctx.db.insert("checklist_instances", {
      template_id: templateId,
      visit_id: visitId,
      assigned_to: guard.userId,
      assigned_by: staff.userId,
      depth: "LIGHT",
      status: "ASSIGNED",
      completeness_score: 0,
      responses: [],
      is_deleted: false,
    });
    return {
      inquiryId,
      transactionId,
      negotiationId,
      tokenRecordId,
      requirementId,
      checklistId,
    };
  });

  return {
    staff,
    opsWithoutPermissions,
    tenant,
    otherTenant,
    owner,
    otherOwner,
    guard,
    otherGuard,
    ...ids,
  };
}

describe("deal read authorization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rentalTransactions.getById", () => {
    it("refuses another tenant, an owner, a guard and an OPS user without transactions.view", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { id: fixture.transactionId };

      await expect(
        fixture.otherTenant.as.query(api.rentalTransactions.getById, args),
      ).rejects.toThrow("Transaction not found or access denied");
      for (const caller of [fixture.otherOwner, fixture.guard, fixture.opsWithoutPermissions]) {
        await expect(caller.as.query(api.rentalTransactions.getById, args)).rejects.toThrow(
          "Not authorized to view this transaction",
        );
      }
    });

    it("serves the deal's tenant a trimmed view and a transactions.view holder the full one", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { id: fixture.transactionId };

      const tenantView = await fixture.tenant.as.query(api.rentalTransactions.getById, args);
      expect(tenantView.transaction.owner).toBeNull();
      expect(tenantView.transaction.inquiry).toBeNull();
      expect(tenantView.transaction.last_override_reason).toBeUndefined();
      expect(tenantView.agreement?.status).toBe(AGREEMENT_STATUS.SENT);
      expect(tenantView.kyc_packet).not.toHaveProperty("police_form_storage_id");

      const staffView = await fixture.staff.as.query(api.rentalTransactions.getById, args);
      expect(staffView.transaction.inquiry?.ops_notes).toBe("internal ops note");
      expect(staffView.transaction.last_override_reason).toBe("internal override reason");
    });
  });

  describe("rentalAgreements.getByTransaction", () => {
    it("refuses another tenant, another owner, a guard and an OPS user without transactions.view", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { transaction_id: fixture.transactionId };
      const read = (caller: typeof fixture.tenant) =>
        caller.as.query(api.rentalAgreements.getByTransaction, args);

      await expect(read(fixture.otherTenant)).rejects.toThrow(
        "You can only view your own agreement",
      );
      await expect(read(fixture.otherOwner)).rejects.toThrow(
        "You can only view agreements for your own properties",
      );
      await expect(read(fixture.guard)).rejects.toThrow("Not authorized to view agreement");
      await expect(read(fixture.opsWithoutPermissions)).rejects.toThrow(
        "Missing permission: transactions.view",
      );
    });

    it("serves the tenant, the property's owner and a transactions.view holder", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { transaction_id: fixture.transactionId };

      for (const caller of [fixture.tenant, fixture.owner, fixture.staff]) {
        const agreement = await caller.as.query(api.rentalAgreements.getByTransaction, args);
        expect(agreement?.transaction_id).toBe(fixture.transactionId);
      }
    });
  });

  describe("kycPackets.getByTransaction", () => {
    it("refuses another tenant, the property owner, a guard and an OPS user without kyc.verify", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { transaction_id: fixture.transactionId };
      const read = (caller: typeof fixture.tenant) =>
        caller.as.query(api.kycPackets.getByTransaction, args);

      await expect(read(fixture.otherTenant)).rejects.toThrow(
        "You can only view your own KYC packet",
      );
      await expect(read(fixture.owner)).rejects.toThrow("Not authorized to view KYC packet");
      await expect(read(fixture.guard)).rejects.toThrow("Not authorized to view KYC packet");
      await expect(read(fixture.opsWithoutPermissions)).rejects.toThrow(
        "Missing permission: kyc.verify",
      );
    });

    it("gives the tenant a redacted packet and a kyc.verify holder the full record", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { transaction_id: fixture.transactionId };

      const tenantView = await fixture.tenant.as.query(api.kycPackets.getByTransaction, args);
      expect(tenantView).toMatchObject({
        overall_status: KYC_PACKET_STATUS.IN_PROGRESS,
        aadhaar_verified: true,
        police_verification_status: "FORM_GENERATED",
      });
      for (const hidden of ["landlord_reference", "status_note", "police_form_storage_id"]) {
        expect(tenantView).not.toHaveProperty(hidden);
      }

      const staffView = await fixture.staff.as.query(api.kycPackets.getByTransaction, args);
      expect(staffView).toMatchObject({
        status_note: "Employer letter pending",
        landlord_reference: { name: "Previous landlord" },
      });
    });

    it("currently returns null to any signed-in caller before the persona gate when no packet exists", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t, { withKycPacket: false });
      const args = { transaction_id: fixture.transactionId };

      expect(await fixture.guard.as.query(api.kycPackets.getByTransaction, args)).toBeNull();
      expect(await fixture.otherOwner.as.query(api.kycPackets.getByTransaction, args)).toBeNull();
    });
  });

  describe("negotiations.getByInquiryId", () => {
    it("returns null to another tenant, another owner and a guard, and throws for OPS without negotiations.view", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { tenant_inquiry_id: fixture.inquiryId };

      for (const caller of [fixture.otherTenant, fixture.otherOwner, fixture.guard]) {
        expect(await caller.as.query(api.negotiations.getByInquiryId, args)).toBeNull();
      }
      await expect(
        fixture.opsWithoutPermissions.as.query(api.negotiations.getByInquiryId, args),
      ).rejects.toThrow("Missing permission: negotiations.view");
    });

    it("hides the owner room from the tenant's copy and the tenant room from the owner's copy", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { tenant_inquiry_id: fixture.inquiryId };

      const tenantCopy = await fixture.tenant.as.query(api.negotiations.getByInquiryId, args);
      expect(tenantCopy?._id).toBe(fixture.negotiationId);
      expect(tenantCopy).not.toHaveProperty("ops_owner_channel_id");
      expect(tenantCopy).toHaveProperty("ops_tenant_channel_id");

      const ownerCopy = await fixture.owner.as.query(api.negotiations.getByInquiryId, args);
      expect(ownerCopy).not.toHaveProperty("ops_tenant_channel_id");
      expect(ownerCopy).toHaveProperty("ops_owner_channel_id");

      const staffCopy = await fixture.staff.as.query(api.negotiations.getByInquiryId, args);
      expect(staffCopy).toHaveProperty("ops_tenant_channel_id");
      expect(staffCopy).toHaveProperty("ops_owner_channel_id");
    });
  });

  describe("negotiationTokens.getForNegotiation", () => {
    it("hides the token record from outsiders and serves the tenant, owner and negotiations.view holders", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { negotiation_id: fixture.negotiationId };

      for (const caller of [fixture.otherTenant, fixture.otherOwner, fixture.guard]) {
        expect(await caller.as.query(api.negotiationTokens.getForNegotiation, args)).toBeNull();
      }
      await expect(
        fixture.opsWithoutPermissions.as.query(api.negotiationTokens.getForNegotiation, args),
      ).rejects.toThrow("Missing permission: negotiations.view");

      for (const caller of [fixture.tenant, fixture.owner, fixture.staff]) {
        const record = await caller.as.query(api.negotiationTokens.getForNegotiation, args);
        expect(record?._id).toBe(fixture.tokenRecordId);
      }
    });
  });

  describe("tenantInquiries.getMyInquiryById", () => {
    it("refuses another tenant and non-tenant personas, and gives the inquiry's tenant a contact-free view", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { id: fixture.inquiryId };

      await expect(
        fixture.otherTenant.as.query(api.tenantInquiries.getMyInquiryById, args),
      ).rejects.toThrow("You do not have access to this inquiry");
      for (const caller of [fixture.owner, fixture.guard, fixture.staff]) {
        await expect(caller.as.query(api.tenantInquiries.getMyInquiryById, args)).rejects.toThrow(
          "Tenant access required",
        );
      }

      const own = await fixture.tenant.as.query(api.tenantInquiries.getMyInquiryById, args);
      expect(own).toMatchObject({
        inquiry_id: fixture.inquiryId,
        status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
        society_name: "Read Authz Society",
      });
      for (const hidden of ["tenant_phone", "tenant_email", "ops_notes", "lead"]) {
        expect(own).not.toHaveProperty(hidden);
      }
    });
  });

  describe("documents.getById", () => {
    it("currently lets any ADMIN or OPS user read any requirement without a permission; others need the assignment", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { requirement_id: fixture.requirementId };

      const opsRead = await fixture.opsWithoutPermissions.as.query(api.documents.getById, args);
      expect(opsRead._id).toBe(fixture.requirementId);

      for (const caller of [fixture.otherGuard, fixture.tenant, fixture.owner]) {
        await expect(caller.as.query(api.documents.getById, args)).rejects.toThrow(
          "You do not have access to this requirement",
        );
      }
      const assigneeRead = await fixture.guard.as.query(api.documents.getById, args);
      expect(assigneeRead.items[0]?.label).toBe("Owner PAN");
    });
  });

  describe("checklists.getById", () => {
    it("currently lets any ADMIN or OPS user read any checklist without a permission; tenants, owners and other guards are refused", async () => {
      const t = createTestBackend();
      const fixture = await createDealFixture(t);
      const args = { checklist_id: fixture.checklistId };

      const opsRead = await fixture.opsWithoutPermissions.as.query(api.checklists.getById, args);
      expect(opsRead._id).toBe(fixture.checklistId);

      for (const caller of [fixture.tenant, fixture.owner]) {
        await expect(caller.as.query(api.checklists.getById, args)).rejects.toThrow(
          "You do not have permission to access checklists",
        );
      }
      await expect(fixture.otherGuard.as.query(api.checklists.getById, args)).rejects.toThrow(
        "You can only access checklists assigned to you",
      );
      expect((await fixture.guard.as.query(api.checklists.getById, args)).assigned_to).toBe(
        fixture.guard.userId,
      );
    });
  });
});
