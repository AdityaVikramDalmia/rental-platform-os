import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_TYPE,
  LEAD_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  SYSTEM_CONFIG_KEYS,
  TENANT_INQUIRY_STATUS,
  USER_STATUS,
  VISIT_OUTCOME,
  type TenantInquiryStatus,
  type UserType,
} from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_tenant_inquiries";
process.env.WORKOS_API_KEY ??= "sk_test_tenant_inquiries";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_tenant_inquiries";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 9, 5, 4, 0, 0);

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
  const workosUserId = `user_inquiries_${userType.toLowerCase()}_${sequence}`;
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
        name: `Inquiry role ${sequence}`,
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

async function createGuard(t: TestBackend, societyId: Id<"societies">) {
  const guard = await createUser(t, "GUARD");
  await t.run(async (ctx) => {
    await ctx.db.insert("guard_profiles", {
      user_id: guard.userId,
      society_id: societyId,
      guard_type: "MAIN_GATE",
      has_seen_onboarding: true,
    });
  });
  return guard;
}

// Two societies; the listing sits in `societyId`, `otherSocietyId` has its own guard.
async function createBountyFixture(t: TestBackend) {
  const ops = await createUser(t, "OPS", [
    PERMISSIONS.TENANT_INQUIRIES_VIEW,
    PERMISSIONS.TENANT_INQUIRIES_MANAGE,
  ]);
  const tenant = await createUser(t, "TENANT");

  const ids = await t.run(async (ctx) => {
    const insertSociety = (name: string) =>
      ctx.db.insert("societies", {
        name,
        city: "Mumbai",
        status: SOCIETY_STATUS.ACTIVE,
        created_by_admin_id: ops.userId,
      });
    const societyId = await insertSociety("Listing Society");
    const otherSocietyId = await insertSociety("Neighbouring Society");
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower K",
      total_floors: 11,
      floor_labels: ["9"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "9",
      flat_number: "903",
      owner_phone: "9000000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: ops.userId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      slug: `inquiry-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 2_200_000,
      bhk_config: "1BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "9",
      available_from: Date.now(),
      created_by_admin_id: ops.userId,
    });
    return { societyId, otherSocietyId, leadId, listingId };
  });

  return { ops, tenant, ...ids };
}

type Fixture = Awaited<ReturnType<typeof createBountyFixture>>;

async function insertInquiry(
  t: TestBackend,
  fixture: Fixture,
  status: TenantInquiryStatus,
  extra: Partial<Doc<"tenant_inquiries">> = {},
): Promise<Id<"tenant_inquiries">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("tenant_inquiries", {
      listing_id: fixture.listingId,
      tenant_id: fixture.tenant.userId,
      tenant_name: "Inquiring Tenant",
      tenant_phone: "9000000002",
      status,
      ...extra,
    }),
  );
}

function postedBounty(expiresAt: number): Partial<Doc<"tenant_inquiries">> {
  return { bounty_amount: 50_000, bounty_posted_at: T0 - DAY_MS, bounty_expires_at: expiresAt };
}

async function readInquiry(t: TestBackend, inquiryId: Id<"tenant_inquiries">) {
  return await t.run(async (ctx) => await ctx.db.get(inquiryId));
}

describe("tenantInquiries", () => {
  beforeEach(() => {
    // acceptBounty schedules a tenant notification; fake timers keep it queued.
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("acceptBounty", () => {
    it("rejects a guard from another society while a guard of the listing's society takes it", async () => {
      const t = createTestBackend();
      const fixture = await createBountyFixture(t);
      const outsider = await createGuard(t, fixture.otherSocietyId);
      const localGuard = await createGuard(t, fixture.societyId);
      const inquiryId = await insertInquiry(
        t,
        fixture,
        TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
        postedBounty(T0 + DAY_MS),
      );

      await expect(
        outsider.as.mutation(api.tenantInquiries.acceptBounty, { id: inquiryId }),
      ).rejects.toThrow("You can only accept bounties for listings in your society");
      expect((await readInquiry(t, inquiryId))?.assigned_guard_id).toBeUndefined();

      const accepted = await localGuard.as.mutation(api.tenantInquiries.acceptBounty, {
        id: inquiryId,
      });
      expect(accepted).toEqual({ _id: inquiryId, status: TENANT_INQUIRY_STATUS.GUARD_ACCEPTED });
      expect((await readInquiry(t, inquiryId))?.assigned_guard_id).toBe(localGuard.userId);
    });

    it("refuses a second guard once the bounty has been taken", async () => {
      const t = createTestBackend();
      const fixture = await createBountyFixture(t);
      const first = await createGuard(t, fixture.societyId);
      const second = await createGuard(t, fixture.societyId);
      const inquiryId = await insertInquiry(
        t,
        fixture,
        TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
        postedBounty(T0 + DAY_MS),
      );

      await first.as.mutation(api.tenantInquiries.acceptBounty, { id: inquiryId });
      await expect(
        second.as.mutation(api.tenantInquiries.acceptBounty, { id: inquiryId }),
      ).rejects.toThrow("Cannot accept bounty for inquiry with status: GUARD_ACCEPTED");

      expect((await readInquiry(t, inquiryId))?.assigned_guard_id).toBe(first.userId);
    });

    it("accepts at the exact expiry instant and refuses a bounty one millisecond past it", async () => {
      const t = createTestBackend();
      const fixture = await createBountyFixture(t);
      const guard = await createGuard(t, fixture.societyId);
      const expiringNowId = await insertInquiry(
        t,
        fixture,
        TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
        postedBounty(T0),
      );
      const expiredId = await insertInquiry(
        t,
        fixture,
        TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
        postedBounty(T0 - 1),
      );

      await expect(
        guard.as.mutation(api.tenantInquiries.acceptBounty, { id: expiredId }),
      ).rejects.toThrow("This bounty has expired");
      await guard.as.mutation(api.tenantInquiries.acceptBounty, { id: expiringNowId });

      expect((await readInquiry(t, expiringNowId))?.status).toBe(
        TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
      );
      expect((await readInquiry(t, expiredId))?.status).toBe(TENANT_INQUIRY_STATUS.BOUNTY_POSTED);
    });
  });

  describe("expireBounties", () => {
    it("expires only posted bounties strictly past their expiry", async () => {
      const t = createTestBackend();
      const fixture = await createBountyFixture(t);
      const pastId = await insertInquiry(
        t,
        fixture,
        TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
        postedBounty(T0 - 1),
      );
      const boundaryId = await insertInquiry(
        t,
        fixture,
        TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
        postedBounty(T0),
      );
      const acceptedId = await insertInquiry(t, fixture, TENANT_INQUIRY_STATUS.GUARD_ACCEPTED, {
        ...postedBounty(T0 - DAY_MS),
      });
      vi.spyOn(console, "log").mockImplementation(() => {});

      await t.mutation(internal.tenantInquiries.expireBounties, {});

      expect(await readInquiry(t, pastId)).toMatchObject({
        status: TENANT_INQUIRY_STATUS.EXPIRED,
        updated_at: T0,
      });
      expect((await readInquiry(t, boundaryId))?.status).toBe(TENANT_INQUIRY_STATUS.BOUNTY_POSTED);
      expect((await readInquiry(t, acceptedId))?.status).toBe(TENANT_INQUIRY_STATUS.GUARD_ACCEPTED);
    });
  });

  describe("postBounty", () => {
    it("uses tenant_bounty_expiry_days when no expiry is given and bounds an explicit expiry to 1-30 days", async () => {
      const t = createTestBackend();
      const fixture = await createBountyFixture(t);
      const inquiryId = await insertInquiry(t, fixture, TENANT_INQUIRY_STATUS.REVIEWED);
      const post = (expiry_days?: number) =>
        fixture.ops.as.mutation(api.tenantInquiries.postBounty, {
          id: inquiryId,
          bounty_amount: 75_000,
          expiry_days,
        });

      await expect(post()).rejects.toThrow("Missing system config: tenant_bounty_expiry_days");
      await expect(post(31)).rejects.toThrow("Expiry must be between 1 and 30 days");

      await t.run(async (ctx) => {
        await ctx.db.insert("system_config", {
          key: SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_EXPIRY_DAYS,
          value: "4",
          updated_by_admin_id: fixture.ops.userId,
        });
      });
      const posted = await post();
      expect(posted).toMatchObject({
        status: TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
        bounty_amount: 75_000,
        bounty_posted_at: T0,
        bounty_expires_at: T0 + 4 * DAY_MS,
        reviewed_by_admin_id: fixture.ops.userId,
      });
    });
  });

  describe("initiateNegotiation", () => {
    it("requires the linked visit to have an INTERESTED outcome", async () => {
      const t = createTestBackend();
      const fixture = await createBountyFixture(t);
      const guard = await createGuard(t, fixture.societyId);
      const insertCompletedVisit = (outcome: "INTERESTED" | "NOT_INTERESTED") =>
        t.run(async (ctx) =>
          ctx.db.insert("visits", {
            lead_id: fixture.leadId,
            society_id: fixture.societyId,
            listing_id: fixture.listingId,
            scheduled_start: T0 - 2 * DAY_MS,
            scheduled_end: T0 - 2 * DAY_MS + 3_600_000,
            assigned_guard_id: guard.userId,
            status: "COMPLETED",
            outcome,
            completed_at: T0 - 2 * DAY_MS + 3_600_000,
            created_by_admin_id: fixture.ops.userId,
          }),
        );
      const uninterestedId = await insertInquiry(
        t,
        fixture,
        TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
        {
          visit_id: await insertCompletedVisit(VISIT_OUTCOME.NOT_INTERESTED),
        },
      );
      const interestedId = await insertInquiry(t, fixture, TENANT_INQUIRY_STATUS.VISIT_COMPLETED, {
        visit_id: await insertCompletedVisit(VISIT_OUTCOME.INTERESTED),
      });

      await expect(
        fixture.ops.as.mutation(api.tenantInquiries.initiateNegotiation, { id: uninterestedId }),
      ).rejects.toThrow("Negotiation can only be initiated when visit outcome is INTERESTED");

      const initiated = await fixture.ops.as.mutation(api.tenantInquiries.initiateNegotiation, {
        id: interestedId,
        ops_notes: "Tenant keen on a 2-year lease",
      });
      expect(initiated).toMatchObject({
        status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
        ops_notes: "Tenant keen on a 2-year lease",
        updated_at: T0,
      });
    });
  });
});
