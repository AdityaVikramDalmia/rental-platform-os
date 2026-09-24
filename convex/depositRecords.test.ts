import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGREEMENT_STATUS,
  AVAILABILITY_TYPE,
  DEPOSIT_RECORD_STATUS,
  LEAD_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TRANSACTION_STATUS,
  USER_STATUS,
  type TransactionStatus,
  type UserType,
} from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_deposit_records";
process.env.WORKOS_API_KEY ??= "sk_test_deposit_records";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_deposit_records";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.UTC(2026, 5, 1, 7, 0, 0);
const MONTHLY_RENT_PAISE = 4_000_000;
const AGREED_DEPOSIT_PAISE = 8_000_000;

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
  const workosUserId = `user_deposits_${userType.toLowerCase()}_${sequence}`;
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
        name: `Deposit role ${sequence}`,
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

// Owner-linked listing → transaction (given status) with a SIGNED agreement for ₹80,000 deposit.
async function createDepositFixture(t: TestBackend, status: TransactionStatus) {
  const admin = await createUser(t, "ADMIN", [
    PERMISSIONS.TRANSACTIONS_VIEW,
    PERMISSIONS.TRANSACTIONS_MANAGE,
  ]);
  const ops = await createUser(t, "OPS", [
    PERMISSIONS.TRANSACTIONS_VIEW,
    PERMISSIONS.TRANSACTIONS_MANAGE,
  ]);
  const tenant = await createUser(t, "TENANT");

  const transactionId = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("owners", {
      phone: `94${String(sequence).padStart(8, "0")}`,
      source: "OPS_CREATED",
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
      name: "Deposit Society",
      city: "Chennai",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower F",
      total_floors: 9,
      floor_labels: ["7"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "7",
      flat_number: "702",
      owner_phone: "9400000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: admin.userId,
      status: LEAD_STATUS.VERIFIED,
      owner_id: ownerId,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerId,
      slug: `deposit-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: MONTHLY_RENT_PAISE,
      bhk_config: "2BHK",
      furnishing: "UNFURNISHED",
      floor_number: "7",
      available_from: now,
      created_by_admin_id: admin.userId,
    });
    const id = await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant.userId,
      listing_id: listingId,
      owner_id: ownerId,
      status,
      monthly_rent_paise: MONTHLY_RENT_PAISE,
      deposit_amount_paise: AGREED_DEPOSIT_PAISE,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    await ctx.db.insert("rental_agreements", {
      transaction_id: id,
      template_version: "v1",
      terms: { monthly_rent_paise: MONTHLY_RENT_PAISE, deposit_amount_paise: AGREED_DEPOSIT_PAISE },
      tenant_signature: { signed_at: now, signature_payload: "dGVuYW50" },
      owner_signature: { signed_at: now, signature_payload: "b3duZXI=" },
      status: AGREEMENT_STATUS.SIGNED,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    return id;
  });

  return { admin, ops, tenant, transactionId };
}

type DepositFixture = Awaited<ReturnType<typeof createDepositFixture>>;

async function recordPayment(fixture: DepositFixture, amountPaise: number) {
  const record = await fixture.ops.as.mutation(api.depositRecords.markPaid, {
    transaction_id: fixture.transactionId,
    amount_paise: amountPaise,
    payment_reference: `NEFT-${amountPaise}`,
  });
  return record!;
}

async function readTransactionStatus(t: TestBackend, transactionId: Id<"rental_transactions">) {
  return (await t.run(async (ctx) => ctx.db.get(transactionId)))?.status;
}

describe("depositRecords", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("markPaid", () => {
    it("opens DEPOSIT_PENDING from TOKEN_RECEIVED and accumulates partial payments into one record", async () => {
      const t = createTestBackend();
      const fixture = await createDepositFixture(t, TRANSACTION_STATUS.TOKEN_RECEIVED);

      const first = await recordPayment(fixture, 5_000_000);
      vi.setSystemTime(T0 + 86_400_000);
      const second = await recordPayment(fixture, 3_000_000);

      expect(second._id).toBe(first._id);
      expect(second).toMatchObject({
        amount_paise: AGREED_DEPOSIT_PAISE,
        status: DEPOSIT_RECORD_STATUS.RECORDED,
        payment_reference: "NEFT-3000000",
      });
      expect(second.mismatch_reason).toBeUndefined();
      expect(second.payment_events?.map((event) => event.amount_paise)).toEqual([
        5_000_000, 3_000_000,
      ]);
      expect(await readTransactionStatus(t, fixture.transactionId)).toBe(
        TRANSACTION_STATUS.DEPOSIT_PENDING,
      );
    });

    it("rejects an overpayment without mismatch_reason and flags one above two months' rent", async () => {
      const t = createTestBackend();
      const fixture = await createDepositFixture(t, TRANSACTION_STATUS.DEPOSIT_PENDING);

      await expect(recordPayment(fixture, 9_000_000)).rejects.toThrow(
        "Recorded deposit exceeds agreement deposit amount. Provide mismatch_reason.",
      );

      const record = await fixture.ops.as.mutation(api.depositRecords.markPaid, {
        transaction_id: fixture.transactionId,
        amount_paise: 9_000_000,
        mismatch_reason: "Tenant prepaid first month's maintenance",
      });
      expect(record).toMatchObject({
        amount_paise: 9_000_000,
        mismatch_reason: "Tenant prepaid first month's maintenance",
        compliance_warning: "DEPOSIT_EXCEEDS_TWO_MONTHS",
      });
    });
  });

  describe("confirmByOwner", () => {
    it("confirms an exact deposit for an OPS holder of transactions.manage and advances to DEPOSIT_RECEIVED", async () => {
      const t = createTestBackend();
      const fixture = await createDepositFixture(t, TRANSACTION_STATUS.DEPOSIT_PENDING);
      const record = await recordPayment(fixture, AGREED_DEPOSIT_PAISE);

      const confirmed = await fixture.ops.as.mutation(api.depositRecords.confirmByOwner, {
        deposit_record_id: record._id,
      });

      expect(confirmed).toMatchObject({
        status: DEPOSIT_RECORD_STATUS.CONFIRMED,
        confirmed_by_owner_at: T0,
      });
      expect(confirmed?.override_reason).toBeUndefined();
      expect(await readTransactionStatus(t, fixture.transactionId)).toBe(
        TRANSACTION_STATUS.DEPOSIT_RECEIVED,
      );
    });

    it("needs the ADMIN persona and a matching override_by to confirm a mismatched deposit", async () => {
      const t = createTestBackend();
      const fixture = await createDepositFixture(t, TRANSACTION_STATUS.DEPOSIT_PENDING);
      const record = await recordPayment(fixture, 6_000_000);

      await expect(
        fixture.ops.as.mutation(api.depositRecords.confirmByOwner, {
          deposit_record_id: record._id,
          override_reason: "Balance agreed in instalments",
          override_by: fixture.ops.userId,
        }),
      ).rejects.toThrow("Admin access required");
      await expect(
        fixture.admin.as.mutation(api.depositRecords.confirmByOwner, {
          deposit_record_id: record._id,
          override_reason: "Balance agreed in instalments",
          override_by: fixture.ops.userId,
        }),
      ).rejects.toThrow("override_by must match the confirming admin user");
      await expect(
        fixture.admin.as.mutation(api.depositRecords.confirmByOwner, {
          deposit_record_id: record._id,
        }),
      ).rejects.toThrow("override_reason and override_by are required for mismatched confirmation");

      const confirmed = await fixture.admin.as.mutation(api.depositRecords.confirmByOwner, {
        deposit_record_id: record._id,
        override_reason: "Balance agreed in instalments",
        override_by: fixture.admin.userId,
      });
      expect(confirmed).toMatchObject({
        status: DEPOSIT_RECORD_STATUS.CONFIRMED,
        amount_paise: 6_000_000,
        override_reason: "Balance agreed in instalments",
        override_by: fixture.admin.userId,
        override_at: T0,
      });
    });

    it.fails(
      "moves the transaction to DEPOSIT_RECEIVED after an admin-overridden underpaid confirmation (BUG-053)",
      async () => {
        const t = createTestBackend();
        const fixture = await createDepositFixture(t, TRANSACTION_STATUS.DEPOSIT_PENDING);
        const record = await recordPayment(fixture, 6_000_000);

        await fixture.admin.as.mutation(api.depositRecords.confirmByOwner, {
          deposit_record_id: record._id,
          override_reason: "Owner accepted ₹60,000 as full deposit",
          override_by: fixture.admin.userId,
        });

        expect(await readTransactionStatus(t, fixture.transactionId)).toBe(
          TRANSACTION_STATUS.DEPOSIT_RECEIVED,
        );
      },
    );
  });

  describe("updateStatus", () => {
    it("refuses CONFIRMED and requires a reason to dispute", async () => {
      const t = createTestBackend();
      const fixture = await createDepositFixture(t, TRANSACTION_STATUS.DEPOSIT_PENDING);
      const record = await recordPayment(fixture, AGREED_DEPOSIT_PAISE);

      await expect(
        fixture.ops.as.mutation(api.depositRecords.updateStatus, {
          deposit_record_id: record._id,
          target_status: DEPOSIT_RECORD_STATUS.CONFIRMED,
        }),
      ).rejects.toThrow("Use confirmByOwner for CONFIRMED transition");
      await expect(
        fixture.ops.as.mutation(api.depositRecords.updateStatus, {
          deposit_record_id: record._id,
          target_status: DEPOSIT_RECORD_STATUS.DISPUTED,
        }),
      ).rejects.toThrow("reason is required for CANCELLED or DISPUTED transitions");

      const disputed = await fixture.ops.as.mutation(api.depositRecords.updateStatus, {
        deposit_record_id: record._id,
        target_status: DEPOSIT_RECORD_STATUS.DISPUTED,
        reason: "Owner says transfer not received",
      });
      expect(disputed).toMatchObject({
        status: DEPOSIT_RECORD_STATUS.DISPUTED,
        status_note: "Owner says transfer not received",
      });
    });
  });
});
