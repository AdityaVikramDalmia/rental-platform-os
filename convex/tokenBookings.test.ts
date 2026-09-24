import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_TYPE,
  LEAD_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TOKEN_BOOKING_STATUS,
  TRANSACTION_STATUS,
  USER_STATUS,
  type TokenBookingStatus,
  type TransactionStatus,
  type UserType,
} from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_token_bookings";
process.env.WORKOS_API_KEY ??= "sk_test_token_bookings";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_token_bookings";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.UTC(2026, 6, 7, 11, 0, 0);
const HELD_PAISE = 2_000_000;

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
  const workosUserId = `user_token_bookings_${userType.toLowerCase()}_${sequence}`;
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
        name: `Token booking role ${sequence}`,
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

async function createTransactionFixture(t: TestBackend, status: TransactionStatus) {
  const staffPermissions = [PERMISSIONS.TRANSACTIONS_VIEW, PERMISSIONS.TRANSACTIONS_MANAGE];
  const admin = await createUser(t, "ADMIN", staffPermissions);
  const ops = await createUser(t, "OPS", staffPermissions);
  const tenant = await createUser(t, "TENANT");

  const transactionId = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("owners", {
      phone: `93${String(sequence).padStart(8, "0")}`,
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
      name: "Token Booking Society",
      city: "Kolkata",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower G",
      total_floors: 4,
      floor_labels: ["4"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "4",
      flat_number: "401",
      owner_phone: "9300000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: admin.userId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerId,
      slug: `token-booking-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 2_500_000,
      bhk_config: "1BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "4",
      available_from: now,
      created_by_admin_id: admin.userId,
    });
    return await ctx.db.insert("rental_transactions", {
      tenant_user_id: tenant.userId,
      listing_id: listingId,
      owner_id: ownerId,
      status,
      monthly_rent_paise: 2_500_000,
      deposit_amount_paise: 5_000_000,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
  });

  return { admin, ops, tenant, transactionId };
}

type Fixture = Awaited<ReturnType<typeof createTransactionFixture>>;

async function insertBooking(
  t: TestBackend,
  fixture: Fixture,
  status: TokenBookingStatus,
  refundType: "FULL" | "PARTIAL" | "FORFEITED",
): Promise<Id<"token_bookings">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("token_bookings", {
      transaction_id: fixture.transactionId,
      amount_paise: HELD_PAISE,
      policy_snapshot: { refund_type: refundType },
      payment_reference: "UPI-4411",
      status,
      held_at: Date.now(),
      is_deleted: false,
    }),
  );
}

async function readState(t: TestBackend, fixture: Fixture, bookingId: Id<"token_bookings">) {
  return await t.run(async (ctx) => ({
    booking: await ctx.db.get(bookingId),
    transaction: await ctx.db.get(fixture.transactionId),
  }));
}

describe("tokenBookings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("hold and resolve", () => {
    it("holds from AGREEMENT_SIGNED as PENDING; recording needs a payment reference and advances TOKEN_RECEIVED", async () => {
      const t = createTestBackend();
      const fixture = await createTransactionFixture(t, TRANSACTION_STATUS.AGREEMENT_SIGNED);

      const booking = await fixture.ops.as.mutation(api.tokenBookings.hold, {
        transaction_id: fixture.transactionId,
        amount_paise: HELD_PAISE,
        policy_snapshot: { refund_type: "FULL", conditions: "  Refundable if owner backs out " },
      });
      expect(booking).toMatchObject({
        status: TOKEN_BOOKING_STATUS.PENDING,
        amount_paise: HELD_PAISE,
        policy_snapshot: { refund_type: "FULL", conditions: "Refundable if owner backs out" },
        held_at: T0,
      });
      expect((await readState(t, fixture, booking._id)).transaction?.status).toBe(
        TRANSACTION_STATUS.TOKEN_PENDING,
      );

      await expect(
        fixture.ops.as.mutation(api.tokenBookings.resolve, {
          token_booking_id: booking._id,
          target_status: TOKEN_BOOKING_STATUS.RECORDED,
        }),
      ).rejects.toThrow("Payment reference is required for recorded token bookings");

      await fixture.ops.as.mutation(api.tokenBookings.resolve, {
        token_booking_id: booking._id,
        target_status: TOKEN_BOOKING_STATUS.RECORDED,
        payment_reference: "UPI-99812",
      });
      const state = await readState(t, fixture, booking._id);
      expect(state.booking?.status).toBe(TOKEN_BOOKING_STATUS.RECORDED);
      expect(state.transaction?.status).toBe(TRANSACTION_STATUS.TOKEN_RECEIVED);
    });

    // Characterisation of current behaviour, not an endorsement: a second hold with a different
    // amount or refund policy is silently ignored instead of being rejected or recorded.
    it("currently returns the existing booking unchanged when hold is called again with a different amount", async () => {
      const t = createTestBackend();
      const fixture = await createTransactionFixture(t, TRANSACTION_STATUS.TOKEN_PENDING);
      const first = await fixture.ops.as.mutation(api.tokenBookings.hold, {
        transaction_id: fixture.transactionId,
        amount_paise: HELD_PAISE,
        policy_snapshot: { refund_type: "PARTIAL" },
      });

      const second = await fixture.ops.as.mutation(api.tokenBookings.hold, {
        transaction_id: fixture.transactionId,
        amount_paise: 3_500_000,
        policy_snapshot: { refund_type: "FULL" },
      });

      expect(second._id).toBe(first._id);
      expect(second.amount_paise).toBe(HELD_PAISE);
      expect(second.policy_snapshot.refund_type).toBe("PARTIAL");
      const bookings = await t.run(async (ctx) => ctx.db.query("token_bookings").collect());
      expect(bookings).toHaveLength(1);
    });
  });

  describe("refundToken", () => {
    it("refuses a refund above the held amount and a booking that is still PENDING", async () => {
      const t = createTestBackend();
      const fixture = await createTransactionFixture(t, TRANSACTION_STATUS.TOKEN_RECEIVED);
      const recordedId = await insertBooking(t, fixture, TOKEN_BOOKING_STATUS.RECORDED, "PARTIAL");
      const pendingFixture = await createTransactionFixture(t, TRANSACTION_STATUS.TOKEN_PENDING);
      const pendingId = await insertBooking(
        t,
        pendingFixture,
        TOKEN_BOOKING_STATUS.PENDING,
        "FULL",
      );

      await expect(
        fixture.ops.as.mutation(api.tokenBookings.refundToken, {
          token_booking_id: recordedId,
          refund_amount_paise: HELD_PAISE + 1,
          reason: "Owner withdrew",
        }),
      ).rejects.toThrow("Refund amount cannot exceed held token amount");
      await expect(
        fixture.ops.as.mutation(api.tokenBookings.refundToken, {
          token_booking_id: pendingId,
          refund_amount_paise: HELD_PAISE,
          reason: "Owner withdrew",
        }),
      ).rejects.toThrow("Cannot refund token booking in status: PENDING");

      expect((await readState(t, fixture, recordedId)).booking?.status).toBe(
        TOKEN_BOOKING_STATUS.RECORDED,
      );
    });

    it("FULL policy refunds only the whole held amount and cancels the transaction as REFUND_PROCESSED", async () => {
      const t = createTestBackend();
      const fixture = await createTransactionFixture(t, TRANSACTION_STATUS.TOKEN_RECEIVED);
      const bookingId = await insertBooking(t, fixture, TOKEN_BOOKING_STATUS.DISPUTED, "FULL");

      await expect(
        fixture.ops.as.mutation(api.tokenBookings.refundToken, {
          token_booking_id: bookingId,
          refund_amount_paise: HELD_PAISE - 100_000,
          reason: "Owner withdrew",
        }),
      ).rejects.toThrow("Full refund policy requires refunding the entire held token amount");

      await fixture.ops.as.mutation(api.tokenBookings.refundToken, {
        token_booking_id: bookingId,
        refund_amount_paise: HELD_PAISE,
        refund_reference: " IMPS-7781 ",
        reason: "Owner withdrew",
      });
      const state = await readState(t, fixture, bookingId);
      expect(state.booking).toMatchObject({
        status: TOKEN_BOOKING_STATUS.CANCELLED,
        refund_amount_paise: HELD_PAISE,
        refund_reference: "IMPS-7781",
        refunded_by: fixture.ops.userId,
        cancel_reason: "REFUND_PROCESSED",
        resolved_at: T0,
      });
      expect(state.transaction).toMatchObject({
        status: TRANSACTION_STATUS.CANCELLED,
        cancellation_reason: "REFUND_PROCESSED",
      });
    });

    it("PARTIAL policy requires a refund strictly below the held amount", async () => {
      const t = createTestBackend();
      const fixture = await createTransactionFixture(t, TRANSACTION_STATUS.TOKEN_RECEIVED);
      const bookingId = await insertBooking(t, fixture, TOKEN_BOOKING_STATUS.DISPUTED, "PARTIAL");

      await expect(
        fixture.ops.as.mutation(api.tokenBookings.refundToken, {
          token_booking_id: bookingId,
          refund_amount_paise: HELD_PAISE,
          reason: "Tenant withdrew",
        }),
      ).rejects.toThrow("Partial refund policy requires refund amount below held token amount");

      await fixture.ops.as.mutation(api.tokenBookings.refundToken, {
        token_booking_id: bookingId,
        refund_amount_paise: HELD_PAISE / 2,
        reason: "Tenant withdrew",
      });
      expect((await readState(t, fixture, bookingId)).booking?.refund_amount_paise).toBe(
        HELD_PAISE / 2,
      );
    });

    it("FORFEITED policy needs the ADMIN persona; an OPS holder of transactions.manage is rejected", async () => {
      const t = createTestBackend();
      const fixture = await createTransactionFixture(t, TRANSACTION_STATUS.TOKEN_RECEIVED);
      const bookingId = await insertBooking(t, fixture, TOKEN_BOOKING_STATUS.DISPUTED, "FORFEITED");
      const refund = (caller: Fixture["ops"]) =>
        caller.as.mutation(api.tokenBookings.refundToken, {
          token_booking_id: bookingId,
          refund_amount_paise: 1,
          reason: "Goodwill gesture after forfeiture",
        });

      await expect(refund(fixture.ops)).rejects.toThrow("Admin access required");
      expect((await readState(t, fixture, bookingId)).booking?.status).toBe(
        TOKEN_BOOKING_STATUS.DISPUTED,
      );

      await refund(fixture.admin);
      expect((await readState(t, fixture, bookingId)).booking?.refunded_by).toBe(
        fixture.admin.userId,
      );
    });

    // Characterisation of current behaviour, not an endorsement: refundToken bypasses the token
    // state machine, which (in code and in notes/04-state-machines.md) has no RECORDED → CANCELLED.
    it("currently cancels a RECORDED booking through refundToken although resolve() forbids RECORDED → CANCELLED", async () => {
      const t = createTestBackend();
      const fixture = await createTransactionFixture(t, TRANSACTION_STATUS.TOKEN_RECEIVED);
      const bookingId = await insertBooking(t, fixture, TOKEN_BOOKING_STATUS.RECORDED, "FULL");

      await expect(
        fixture.ops.as.mutation(api.tokenBookings.resolve, {
          token_booking_id: bookingId,
          target_status: TOKEN_BOOKING_STATUS.CANCELLED,
          reason: "Deal off",
        }),
      ).rejects.toThrow("Invalid token booking transition: RECORDED -> CANCELLED");

      await fixture.ops.as.mutation(api.tokenBookings.refundToken, {
        token_booking_id: bookingId,
        refund_amount_paise: HELD_PAISE,
        reason: "Deal off",
      });
      expect((await readState(t, fixture, bookingId)).booking?.status).toBe(
        TOKEN_BOOKING_STATUS.CANCELLED,
      );
    });
  });
});
