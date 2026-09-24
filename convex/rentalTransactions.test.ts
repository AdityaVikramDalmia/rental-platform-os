import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGREEMENT_STATUS,
  AVAILABILITY_TYPE,
  DEPOSIT_RECORD_STATUS,
  KYC_PACKET_STATUS,
  LEAD_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TENANT_INQUIRY_STATUS,
  TOKEN_BOOKING_STATUS,
  TRANSACTION_STATUS,
  USER_STATUS,
  type AgreementStatus,
  type TransactionStatus,
  type UserType,
} from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_rental_transactions";
process.env.WORKOS_API_KEY ??= "sk_test_rental_transactions";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_rental_transactions";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 4, 20, 8, 0, 0);

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
  const workosUserId = `user_transactions_${userType.toLowerCase()}_${sequence}`;
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
        name: `Transactions role ${sequence}`,
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
    workosUserId,
    as: t.withIdentity({ subject: workosUserId, issuer: WORKOS_ISSUER }),
  };
}

// Staff → owner record → lead → listing (owner-linked) → VISIT_COMPLETED inquiry.
async function createListingFixture(t: TestBackend, options: { ownerLinked?: boolean } = {}) {
  const staff = await createUser(t, "ADMIN", [
    PERMISSIONS.TRANSACTIONS_VIEW,
    PERMISSIONS.TRANSACTIONS_MANAGE,
    PERMISSIONS.KYC_VERIFY,
    PERMISSIONS.AGREEMENTS_GENERATE,
  ]);
  const tenant = await createUser(t, "TENANT");
  const ownerUser = await createUser(t, "OWNER");

  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("owners", {
      phone: `95${String(sequence).padStart(8, "0")}`,
      user_id: ownerUser.userId,
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
      name: "Transaction Society",
      city: "Hyderabad",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: staff.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower E",
      total_floors: 15,
      floor_labels: ["5"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "5",
      flat_number: "503",
      owner_phone: "9500000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: staff.userId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: options.ownerLinked === false ? undefined : ownerId,
      slug: `transaction-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 4_000_000,
      bhk_config: "3BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "5",
      available_from: now,
      created_by_admin_id: staff.userId,
    });
    const insertInquiry = () =>
      ctx.db.insert("tenant_inquiries", {
        listing_id: listingId,
        tenant_id: tenant.userId,
        tenant_name: "Transaction Tenant",
        tenant_phone: "9500000002",
        status: TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
      });
    const inquiryId = await insertInquiry();
    const secondInquiryId = await insertInquiry();
    return { ownerId, leadId, listingId, inquiryId, secondInquiryId };
  });

  return { staff, tenant, ownerUser, ...ids };
}

type ListingFixture = Awaited<ReturnType<typeof createListingFixture>>;

async function insertTransaction(
  t: TestBackend,
  fixture: ListingFixture,
  status: TransactionStatus,
  updatedAt = Date.now(),
): Promise<Id<"rental_transactions">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("rental_transactions", {
      tenant_user_id: fixture.tenant.userId,
      listing_id: fixture.listingId,
      owner_id: fixture.ownerId,
      tenant_inquiry_id: fixture.inquiryId,
      status,
      monthly_rent_paise: 4_000_000,
      deposit_amount_paise: 8_000_000,
      created_at: updatedAt,
      updated_at: updatedAt,
      is_deleted: false,
    }),
  );
}

async function insertAgreement(
  t: TestBackend,
  transactionId: Id<"rental_transactions">,
  status: AgreementStatus,
  updatedAt: number,
): Promise<Id<"rental_agreements">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("rental_agreements", {
      transaction_id: transactionId,
      template_version: "v1",
      terms: { monthly_rent_paise: 4_000_000, deposit_amount_paise: 8_000_000 },
      tenant_signature:
        status === AGREEMENT_STATUS.PARTIALLY_SIGNED
          ? { signed_at: updatedAt, signature_payload: "dGVuYW50" }
          : undefined,
      status,
      created_at: updatedAt,
      updated_at: updatedAt,
      is_deleted: false,
    }),
  );
}

async function readTransaction(t: TestBackend, transactionId: Id<"rental_transactions">) {
  return await t.run(async (ctx) => await ctx.db.get(transactionId));
}

describe("rentalTransactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createTransaction", () => {
    it("starts INITIATED, links the inquiry back, and refuses a second active transaction on the listing", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);

      const transaction = await fixture.staff.as.mutation(
        api.rentalTransactions.createTransaction,
        {
          tenant_inquiry_id: fixture.inquiryId,
          monthly_rent_paise: 4_000_000,
          deposit_amount_paise: 8_000_000,
        },
      );

      expect(transaction).toMatchObject({
        status: TRANSACTION_STATUS.INITIATED,
        tenant_user_id: fixture.tenant.userId,
        owner_id: fixture.ownerId,
        tenant_inquiry_id: fixture.inquiryId,
      });
      const inquiry = await t.run(async (ctx) => ctx.db.get(fixture.inquiryId));
      expect(inquiry?.transaction_id).toBe(transaction._id);

      await expect(
        fixture.staff.as.mutation(api.rentalTransactions.createTransaction, {
          tenant_inquiry_id: fixture.secondInquiryId,
          monthly_rent_paise: 4_000_000,
          deposit_amount_paise: 8_000_000,
        }),
      ).rejects.toThrow("An active transaction already exists for this listing");
    });

    it("refuses a listing whose lead and listing carry no owner record", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t, { ownerLinked: false });

      await expect(
        fixture.staff.as.mutation(api.rentalTransactions.createTransaction, {
          tenant_inquiry_id: fixture.inquiryId,
          monthly_rent_paise: 4_000_000,
          deposit_amount_paise: 8_000_000,
        }),
      ).rejects.toThrow("Cannot start transaction: listing is not linked to an owner");
      const transactions = await t.run(async (ctx) =>
        ctx.db.query("rental_transactions").collect(),
      );
      expect(transactions).toEqual([]);
    });
  });

  describe("advanceStatus", () => {
    it("requires an override reason, refuses CANCELLED, and records who overrode and why", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);
      const transactionId = await insertTransaction(t, fixture, TRANSACTION_STATUS.INITIATED);

      await expect(
        fixture.staff.as.mutation(api.rentalTransactions.advanceStatus, {
          transaction_id: transactionId,
          target_status: TRANSACTION_STATUS.KYC_PENDING,
          override_reason: "   ",
        }),
      ).rejects.toThrow("override_reason is required");
      await expect(
        fixture.staff.as.mutation(api.rentalTransactions.advanceStatus, {
          transaction_id: transactionId,
          target_status: TRANSACTION_STATUS.CANCELLED,
          override_reason: "Tenant backed out",
        }),
      ).rejects.toThrow("Use the cancel() mutation to cancel transactions");

      const advanced = await fixture.staff.as.mutation(api.rentalTransactions.advanceStatus, {
        transaction_id: transactionId,
        target_status: TRANSACTION_STATUS.KYC_PENDING,
        override_reason: " KYC started offline ",
      });
      expect(advanced).toMatchObject({
        status: TRANSACTION_STATUS.KYC_PENDING,
        last_override_reason: "KYC started offline",
        last_override_by: fixture.staff.workosUserId,
        last_override_at: T0,
      });
    });

    it("still enforces the KYC_VERIFIED prerequisite on the override path", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);
      const transactionId = await insertTransaction(t, fixture, TRANSACTION_STATUS.KYC_PENDING);
      const advance = () =>
        fixture.staff.as.mutation(api.rentalTransactions.advanceStatus, {
          transaction_id: transactionId,
          target_status: TRANSACTION_STATUS.KYC_VERIFIED,
          override_reason: "Documents checked in person",
        });

      await expect(advance()).rejects.toThrow(
        "Cannot advance to KYC_VERIFIED: kyc packet with VERIFIED status is required",
      );

      await t.run(async (ctx) => {
        await ctx.db.insert("kyc_packets", {
          transaction_id: transactionId,
          tenant_user_id: fixture.tenant.userId,
          aadhaar_verified: true,
          employer_verified: true,
          overall_status: KYC_PACKET_STATUS.VERIFIED,
          created_at: T0,
          updated_at: T0,
          is_deleted: false,
        });
      });
      expect((await advance()).status).toBe(TRANSACTION_STATUS.KYC_VERIFIED);
    });

    it.fails(
      "refuses COMPLETED without a completed handover checklist, as complete() does (BUG-052)",
      async () => {
        const t = createTestBackend();
        const fixture = await createListingFixture(t);
        const transactionId = await insertTransaction(
          t,
          fixture,
          TRANSACTION_STATUS.MOVE_IN_SCHEDULED,
        );

        await expect(
          fixture.staff.as.mutation(api.rentalTransactions.advanceStatus, {
            transaction_id: transactionId,
            target_status: TRANSACTION_STATUS.COMPLETED,
            override_reason: "Keys handed over",
          }),
        ).rejects.toThrow();
        expect((await readTransaction(t, transactionId))?.status).toBe(
          TRANSACTION_STATUS.MOVE_IN_SCHEDULED,
        );
      },
    );
  });

  describe("move-in handover", () => {
    it("creates the six-item checklist once and moves DEPOSIT_RECEIVED to MOVE_IN_SCHEDULED", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);
      const transactionId = await insertTransaction(
        t,
        fixture,
        TRANSACTION_STATUS.DEPOSIT_RECEIVED,
      );

      const checklist = await fixture.staff.as.mutation(
        api.rentalTransactions.createMoveInChecklist,
        { transaction_id: transactionId },
      );
      const again = await fixture.staff.as.mutation(api.rentalTransactions.createMoveInChecklist, {
        transaction_id: transactionId,
      });

      expect(again._id).toBe(checklist._id);
      expect(checklist.items).toHaveLength(6);
      expect(checklist.items.every((item) => !item.checked)).toBe(true);
      expect((await readTransaction(t, transactionId))?.status).toBe(
        TRANSACTION_STATUS.MOVE_IN_SCHEDULED,
      );
    });

    it("complete() refuses unchecked items, then completes and links the closure to the transaction", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);
      const transactionId = await insertTransaction(
        t,
        fixture,
        TRANSACTION_STATUS.DEPOSIT_RECEIVED,
      );
      const closureId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("closures", {
          lead_id: fixture.leadId,
          listing_id: fixture.listingId,
          move_in_date: T0,
          status: "PENDING",
          closed_by_admin_id: fixture.staff.userId,
        });
        await ctx.db.patch(transactionId, { closure_id: id });
        return id;
      });
      const checklist = await fixture.staff.as.mutation(
        api.rentalTransactions.createMoveInChecklist,
        { transaction_id: transactionId },
      );

      await expect(
        fixture.staff.as.mutation(api.rentalTransactions.complete, {
          transaction_id: transactionId,
          handover_checklist_id: checklist._id,
        }),
      ).rejects.toThrow("All handover checklist items must be checked before completion");
      await expect(
        fixture.staff.as.mutation(api.rentalTransactions.updateChecklistItem, {
          transaction_id: transactionId,
          item_index: 6,
          checked: true,
        }),
      ).rejects.toThrow("item_index is out of range for this checklist");

      let latest = checklist;
      for (let index = 0; index < 6; index += 1) {
        latest = (await fixture.staff.as.mutation(api.rentalTransactions.updateChecklistItem, {
          transaction_id: transactionId,
          item_index: index,
          checked: true,
        }))!;
      }
      expect(latest.completed_at).toBe(T0);
      expect(latest.completed_by).toBe(fixture.staff.userId);

      const completed = await fixture.staff.as.mutation(api.rentalTransactions.complete, {
        transaction_id: transactionId,
        handover_checklist_id: checklist._id,
      });
      expect(completed.status).toBe(TRANSACTION_STATUS.COMPLETED);
      const closure = await t.run(async (ctx) => ctx.db.get(closureId));
      expect(closure?.transaction_id).toBe(transactionId);
    });
  });

  describe("cancel", () => {
    it("requires a reason and refuses a transaction that is already terminal", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);
      const liveId = await insertTransaction(t, fixture, TRANSACTION_STATUS.TOKEN_PENDING);
      const completedId = await insertTransaction(t, fixture, TRANSACTION_STATUS.COMPLETED);

      await expect(
        fixture.staff.as.mutation(api.rentalTransactions.cancel, {
          transaction_id: liveId,
          reason: " ",
        }),
      ).rejects.toThrow("Cancellation reason is required");
      await expect(
        fixture.staff.as.mutation(api.rentalTransactions.cancel, {
          transaction_id: completedId,
          reason: "Duplicate",
        }),
      ).rejects.toThrow("Cannot cancel transaction in terminal state: COMPLETED");

      const cancelled = await fixture.staff.as.mutation(api.rentalTransactions.cancel, {
        transaction_id: liveId,
        reason: "Owner sold the flat",
      });
      expect(cancelled).toMatchObject({
        status: TRANSACTION_STATUS.CANCELLED,
        cancellation_reason: "Owner sold the flat",
      });
    });
  });

  describe("autoTimeoutTransactions", () => {
    it("cancels non-terminal transactions idle for more than 14 days, not exactly 14, as AUTO_TIMEOUT", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);
      const idleId = await insertTransaction(
        t,
        fixture,
        TRANSACTION_STATUS.KYC_PENDING,
        T0 - 14 * DAY_MS - 1,
      );
      const boundaryId = await insertTransaction(
        t,
        fixture,
        TRANSACTION_STATUS.AGREEMENT_SENT,
        T0 - 14 * DAY_MS,
      );
      const completedId = await insertTransaction(
        t,
        fixture,
        TRANSACTION_STATUS.COMPLETED,
        T0 - 90 * DAY_MS,
      );

      const result = await t.mutation(internal.rentalTransactions.autoTimeoutTransactions, {});

      expect(result).toEqual({ cancelledCount: 1 });
      expect(await readTransaction(t, idleId)).toMatchObject({
        status: TRANSACTION_STATUS.CANCELLED,
        cancellation_reason: "AUTO_TIMEOUT",
        updated_at: T0,
      });
      expect((await readTransaction(t, boundaryId))?.status).toBe(
        TRANSACTION_STATUS.AGREEMENT_SENT,
      );
      expect((await readTransaction(t, completedId))?.status).toBe(TRANSACTION_STATUS.COMPLETED);
    });

    it("currently cancels an idle DEPOSIT_RECEIVED transaction and leaves its confirmed deposit and token untouched", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);
      const transactionId = await insertTransaction(
        t,
        fixture,
        TRANSACTION_STATUS.DEPOSIT_RECEIVED,
        T0 - 15 * DAY_MS,
      );
      const { depositId, tokenId } = await t.run(async (ctx) => ({
        depositId: await ctx.db.insert("deposit_records", {
          transaction_id: transactionId,
          amount_paise: 8_000_000,
          status: DEPOSIT_RECORD_STATUS.CONFIRMED,
          created_at: T0 - 15 * DAY_MS,
          updated_at: T0 - 15 * DAY_MS,
          is_deleted: false,
        }),
        tokenId: await ctx.db.insert("token_bookings", {
          transaction_id: transactionId,
          amount_paise: 1_000_000,
          policy_snapshot: { refund_type: "FULL" },
          status: TOKEN_BOOKING_STATUS.CONFIRMED,
          held_at: T0 - 20 * DAY_MS,
          is_deleted: false,
        }),
      }));

      await t.mutation(internal.rentalTransactions.autoTimeoutTransactions, {});

      const state = await t.run(async (ctx) => ({
        transaction: await ctx.db.get(transactionId),
        deposit: await ctx.db.get(depositId),
        token: await ctx.db.get(tokenId),
      }));
      expect(state.transaction?.status).toBe(TRANSACTION_STATUS.CANCELLED);
      expect(state.deposit?.status).toBe(DEPOSIT_RECORD_STATUS.CONFIRMED);
      expect(state.token?.status).toBe(TOKEN_BOOKING_STATUS.CONFIRMED);
      expect(state.token?.refund_amount_paise).toBeUndefined();
    });
  });

  describe("expireStaleAgreements", () => {
    it("expires SENT agreements idle more than 5 days and returns their transaction to AGREEMENT_PENDING", async () => {
      const t = createTestBackend();
      const fixture = await createListingFixture(t);
      const staleTransactionId = await insertTransaction(
        t,
        fixture,
        TRANSACTION_STATUS.AGREEMENT_SENT,
      );
      const staleAgreementId = await insertAgreement(
        t,
        staleTransactionId,
        AGREEMENT_STATUS.SENT,
        T0 - 5 * DAY_MS - 1,
      );
      const boundaryTransactionId = await insertTransaction(
        t,
        fixture,
        TRANSACTION_STATUS.AGREEMENT_SENT,
      );
      const boundaryAgreementId = await insertAgreement(
        t,
        boundaryTransactionId,
        AGREEMENT_STATUS.SENT,
        T0 - 5 * DAY_MS,
      );

      const result = await t.mutation(internal.rentalTransactions.expireStaleAgreements, {});

      expect(result).toEqual({ expiredCount: 1 });
      const state = await t.run(async (ctx) => ({
        stale: await ctx.db.get(staleAgreementId),
        boundary: await ctx.db.get(boundaryAgreementId),
      }));
      expect(state.stale?.status).toBe(AGREEMENT_STATUS.EXPIRED);
      expect(state.boundary?.status).toBe(AGREEMENT_STATUS.SENT);
      expect((await readTransaction(t, staleTransactionId))?.status).toBe(
        TRANSACTION_STATUS.AGREEMENT_PENDING,
      );
      expect((await readTransaction(t, boundaryTransactionId))?.status).toBe(
        TRANSACTION_STATUS.AGREEMENT_SENT,
      );
    });

    it.fails(
      "expires a PARTIALLY_SIGNED agreement past the 5-day signing deadline (BUG-054)",
      async () => {
        const t = createTestBackend();
        const fixture = await createListingFixture(t);
        const transactionId = await insertTransaction(
          t,
          fixture,
          TRANSACTION_STATUS.AGREEMENT_SENT,
        );
        const agreementId = await insertAgreement(
          t,
          transactionId,
          AGREEMENT_STATUS.PARTIALLY_SIGNED,
          T0 - 30 * DAY_MS,
        );

        await t.mutation(internal.rentalTransactions.expireStaleAgreements, {});

        const agreement = await t.run(async (ctx) => ctx.db.get(agreementId));
        expect(agreement?.status).toBe(AGREEMENT_STATUS.EXPIRED);
        expect((await readTransaction(t, transactionId))?.status).toBe(
          TRANSACTION_STATUS.AGREEMENT_PENDING,
        );
      },
    );
  });
});
