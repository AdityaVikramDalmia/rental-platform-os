import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGREEMENT_STATUS,
  AVAILABILITY_TYPE,
  LEAD_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TRANSACTION_STATUS,
  USER_STATUS,
  type AgreementStatus,
  type TransactionStatus,
  type UserType,
} from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_rental_agreements";
process.env.WORKOS_API_KEY ??= "sk_test_rental_agreements";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_rental_agreements";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.UTC(2026, 7, 12, 10, 0, 0);
const TERMS = {
  monthly_rent_paise: 3_200_000,
  deposit_amount_paise: 6_400_000,
  lock_in_months: 11,
};

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
  const workosUserId = `user_agreements_${userType.toLowerCase()}_${sequence}`;
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
        name: `Agreement role ${sequence}`,
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

// Transaction whose owner record is linked to an OWNER user, plus unrelated tenant/owner users.
async function createAgreementFixture(t: TestBackend, status: TransactionStatus) {
  const staff = await createUser(t, "ADMIN", [
    PERMISSIONS.AGREEMENTS_GENERATE,
    PERMISSIONS.TRANSACTIONS_VIEW,
  ]);
  const tenant = await createUser(t, "TENANT");
  const ownerUser = await createUser(t, "OWNER");
  const otherTenant = await createUser(t, "TENANT");
  const otherOwner = await createUser(t, "OWNER");

  const transactionId = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("owners", {
      phone: `92${String(sequence).padStart(8, "0")}`,
      user_id: ownerUser.userId,
      source: "OWNER_SERVICE_REQUEST",
      active_properties_count: 1,
      total_leads_count: 1,
      total_closures_count: 0,
      lifecycle_stage: "ACTIVE",
      lifecycle_updated_at: now,
      first_seen_at: now,
      last_activity_at: now,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });
    const societyId = await ctx.db.insert("societies", {
      name: "Agreement Society",
      city: "Delhi",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: staff.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower H",
      total_floors: 10,
      floor_labels: ["8"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "8",
      flat_number: "801",
      owner_phone: "9200000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: staff.userId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerId,
      slug: `agreement-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: TERMS.monthly_rent_paise,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "8",
      available_from: now,
      created_by_admin_id: staff.userId,
    });
    return await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant.userId,
      listing_id: listingId,
      owner_id: ownerId,
      status,
      monthly_rent_paise: TERMS.monthly_rent_paise,
      deposit_amount_paise: TERMS.deposit_amount_paise,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
  });

  return { staff, tenant, ownerUser, otherTenant, otherOwner, transactionId };
}

type Fixture = Awaited<ReturnType<typeof createAgreementFixture>>;

async function insertAgreement(
  t: TestBackend,
  fixture: Fixture,
  status: AgreementStatus,
  withDocument: boolean,
): Promise<Id<"rental_agreements">> {
  return await t.run(async (ctx) => {
    const documentId = withDocument
      ? await ctx.storage.store(new Blob(["%PDF-1.7 synthetic lease"]))
      : undefined;
    return await ctx.db.insert("rental_agreements", {
      transaction_id: fixture.transactionId,
      template_version: "v2",
      terms: TERMS,
      document_storage_id: documentId,
      status,
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false,
    });
  });
}

function signAs(
  caller: Fixture["tenant"],
  agreementId: Id<"rental_agreements">,
  signerRole: "tenant" | "owner",
  payload = "c2lnbmVk",
) {
  return caller.as.mutation(api.rentalAgreements.recordSignature, {
    agreement_id: agreementId,
    signer_role: signerRole,
    signature_payload: payload,
  });
}

async function readState(t: TestBackend, fixture: Fixture, agreementId: Id<"rental_agreements">) {
  return await t.run(async (ctx) => ({
    agreement: await ctx.db.get(agreementId),
    transaction: await ctx.db.get(fixture.transactionId),
  }));
}

describe("rentalAgreements", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("generate", () => {
    it("replaces an open DRAFT, refuses while a SENT agreement exists, and opens AGREEMENT_PENDING", async () => {
      const t = createTestBackend();
      const fixture = await createAgreementFixture(t, TRANSACTION_STATUS.KYC_VERIFIED);
      const generate = () =>
        fixture.staff.as.mutation(api.rentalAgreements.generate, {
          transaction_id: fixture.transactionId,
          template_version: " v2 ",
          terms: TERMS,
        });

      const first = await generate();
      expect(first).toMatchObject({ status: AGREEMENT_STATUS.DRAFT, template_version: "v2" });
      expect((await readState(t, fixture, first._id)).transaction?.status).toBe(
        TRANSACTION_STATUS.AGREEMENT_PENDING,
      );

      const second = await generate();
      expect((await readState(t, fixture, first._id)).agreement?.status).toBe(
        AGREEMENT_STATUS.CANCELLED,
      );

      await t.run(async (ctx) => {
        await ctx.db.patch(second._id, { status: AGREEMENT_STATUS.SENT });
      });
      await expect(generate()).rejects.toThrow("Active agreement already exists — cancel it first");
    });
  });

  describe("send", () => {
    it("refuses an agreement without an attached document and otherwise moves the transaction to AGREEMENT_SENT", async () => {
      const t = createTestBackend();
      const fixture = await createAgreementFixture(t, TRANSACTION_STATUS.AGREEMENT_PENDING);
      const bareId = await insertAgreement(t, fixture, AGREEMENT_STATUS.DRAFT, false);

      await expect(
        fixture.staff.as.mutation(api.rentalAgreements.send, { agreement_id: bareId }),
      ).rejects.toThrow("Cannot send agreement: document PDF must be attached first.");

      await t.run(async (ctx) => {
        await ctx.db.patch(bareId, { status: AGREEMENT_STATUS.CANCELLED });
      });
      const documentedId = await insertAgreement(t, fixture, AGREEMENT_STATUS.DRAFT, true);
      await fixture.staff.as.mutation(api.rentalAgreements.send, { agreement_id: documentedId });

      const state = await readState(t, fixture, documentedId);
      expect(state.agreement?.status).toBe(AGREEMENT_STATUS.SENT);
      expect(state.transaction?.status).toBe(TRANSACTION_STATUS.AGREEMENT_SENT);
    });
  });

  describe("recordSignature", () => {
    it("goes PARTIALLY_SIGNED on the tenant's signature and SIGNED, with the transaction AGREEMENT_SIGNED, on the owner's", async () => {
      const t = createTestBackend();
      const fixture = await createAgreementFixture(t, TRANSACTION_STATUS.AGREEMENT_SENT);
      const agreementId = await insertAgreement(t, fixture, AGREEMENT_STATUS.SENT, true);

      const partial = await signAs(fixture.tenant, agreementId, "tenant", "dGVuYW50LXNpZw==");
      expect(partial?.status).toBe(AGREEMENT_STATUS.PARTIALLY_SIGNED);
      expect(partial?.tenant_signature).toMatchObject({
        signed_at: T0,
        signature_payload: "dGVuYW50LXNpZw==",
        signer_email: expect.stringContaining("@example.com"),
      });
      expect((await readState(t, fixture, agreementId)).transaction?.status).toBe(
        TRANSACTION_STATUS.AGREEMENT_SENT,
      );

      await signAs(fixture.ownerUser, agreementId, "owner", "b3duZXItc2ln");
      const state = await readState(t, fixture, agreementId);
      expect(state.agreement?.status).toBe(AGREEMENT_STATUS.SIGNED);
      expect(state.agreement?.owner_signature?.signature_payload).toBe("b3duZXItc2ln");
      expect(state.transaction?.status).toBe(TRANSACTION_STATUS.AGREEMENT_SIGNED);
    });

    it("rejects another tenant and an OWNER who does not own the property, while the real parties sign", async () => {
      const t = createTestBackend();
      const fixture = await createAgreementFixture(t, TRANSACTION_STATUS.AGREEMENT_SENT);
      const agreementId = await insertAgreement(t, fixture, AGREEMENT_STATUS.SENT, true);

      await expect(signAs(fixture.otherTenant, agreementId, "tenant")).rejects.toThrow(
        "You can only sign your own agreement",
      );
      await expect(signAs(fixture.otherOwner, agreementId, "owner")).rejects.toThrow(
        "Admin or OPS access required",
      );
      const untouched = await readState(t, fixture, agreementId);
      expect(untouched.agreement?.status).toBe(AGREEMENT_STATUS.SENT);
      expect(untouched.agreement?.tenant_signature).toBeUndefined();

      await signAs(fixture.ownerUser, agreementId, "owner");
      expect((await readState(t, fixture, agreementId)).agreement?.status).toBe(
        AGREEMENT_STATUS.PARTIALLY_SIGNED,
      );
    });

    it("rejects a malformed signature payload and treats a repeat signature as a no-op", async () => {
      const t = createTestBackend();
      const fixture = await createAgreementFixture(t, TRANSACTION_STATUS.AGREEMENT_SENT);
      const agreementId = await insertAgreement(t, fixture, AGREEMENT_STATUS.SENT, true);

      await expect(
        signAs(fixture.tenant, agreementId, "tenant", "not base64 <script>"),
      ).rejects.toThrow("Invalid signature format");

      await signAs(fixture.tenant, agreementId, "tenant", "Zmlyc3Q=");
      vi.setSystemTime(T0 + 5_000);
      const repeat = await signAs(fixture.tenant, agreementId, "tenant", "c2Vjb25k");

      expect(repeat?.tenant_signature).toMatchObject({
        signature_payload: "Zmlyc3Q=",
        signed_at: T0,
      });
      expect(repeat?.status).toBe(AGREEMENT_STATUS.PARTIALLY_SIGNED);
    });
  });
});
