import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_trust";
process.env.WORKOS_API_KEY ??= "sk_test_trust";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_trust";

await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const BASE_TIME = Date.UTC(2026, 6, 1, 0, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function createTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTest>;

let sequence = 0;

async function createUser(t: TestBackend, userType: UserType, permissions: string[] = []) {
  sequence += 1;
  const workosUserId = `workos_trust_${userType.toLowerCase()}_${sequence}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} user ${sequence}`,
      email: `${workosUserId}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });
    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Trust role ${sequence}`,
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
    as: t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" }),
  };
}

// Society → building → VERIFIED lead; listings are created per test at the
// current fake clock so their _creationTime is the freshness reference.
async function createLeadFixture(t: TestBackend) {
  const admin = await createUser(t, "ADMIN", [PERMISSIONS.TRUST_BADGES_VIEW]);
  const ids = await t.run(async (ctx) => {
    const societyId = await ctx.db.insert("societies", {
      name: "Trust Society",
      city: "Kolkata",
      status: "ACTIVE",
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower F",
      total_floors: 9,
      floor_labels: ["1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "2",
      flat_number: "205",
      owner_phone: "9888800000",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: admin.userId,
      status: "VERIFIED",
    });
    return { societyId, buildingId, leadId };
  });
  return { admin, ...ids };
}

type LeadFixture = Awaited<ReturnType<typeof createLeadFixture>>;

async function insertListing(
  t: TestBackend,
  fixture: LeadFixture,
  status: "PUBLISHED" | "DRAFT" = "PUBLISHED",
) {
  sequence += 1;
  return await t.run(async (ctx) =>
    ctx.db.insert("listings", {
      lead_id: fixture.leadId,
      slug: `trust-listing-${sequence}`,
      status,
      rent_monthly: 2_200_000,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "2",
      available_from: Date.now(),
      created_by_admin_id: fixture.admin.userId,
    }),
  );
}

async function computeRow(t: TestBackend, listingId: Id<"listings">) {
  await t.mutation(internal.trustBadges.computeForListing, { listing_id: listingId });
  return await t.run(async (ctx) =>
    ctx.db
      .query("listing_trust_badges")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", listingId))
      .unique(),
  );
}

async function addPhotos(t: TestBackend, listingId: Id<"listings">, count: number) {
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index += 1) {
      const storageId = await ctx.storage.store(new Blob([`photo-${index}`]));
      await ctx.db.insert("listing_photos", {
        listing_id: listingId,
        storage_id: storageId,
        display_order: index,
        is_deleted: false,
      });
    }
  });
}

describe("trustBadges", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("computeForListing freshness", () => {
    it("scores 100→75 across the 30-day window, drops to AGING just past it and to STALE past twice it", async () => {
      const t = createTest();
      const fixture = await createLeadFixture(t);
      const listingId = await insertListing(t, fixture);
      const expectations: Array<[number, number, "FRESH" | "AGING" | "STALE"]> = [
        [0, 100, "FRESH"],
        [15 * DAY_MS, 88, "FRESH"],
        [30 * DAY_MS, 75, "FRESH"],
        [30 * DAY_MS + HOUR_MS, 74, "AGING"],
        [60 * DAY_MS, 25, "AGING"],
        [60 * DAY_MS + HOUR_MS, 24, "STALE"],
        [90 * DAY_MS, 0, "STALE"],
        [200 * DAY_MS, 0, "STALE"],
      ];

      for (const [elapsed, score, state] of expectations) {
        vi.setSystemTime(BASE_TIME + elapsed);
        const row = await computeRow(t, listingId);
        expect([row?.freshness_score, row?.freshness_state], `elapsed ${elapsed}ms`).toEqual([
          score,
          state,
        ]);
        expect(row?.last_computed_at).toBe(BASE_TIME + elapsed);
      }
      const rows = await t.run(async (ctx) => ctx.db.query("listing_trust_badges").collect());
      expect(rows).toHaveLength(1);
    });

    it("reads the window length from trust_badge_freshness_threshold_days", async () => {
      const t = createTest();
      const fixture = await createLeadFixture(t);
      await t.run(async (ctx) =>
        ctx.db.insert("system_config", {
          key: "trust_badge_freshness_threshold_days",
          value: "10",
          updated_by_admin_id: fixture.admin.userId,
        }),
      );
      const listingId = await insertListing(t, fixture);

      vi.setSystemTime(BASE_TIME + 10 * DAY_MS);
      const atThreshold = await computeRow(t, listingId);
      vi.setSystemTime(BASE_TIME + 11 * DAY_MS);
      const pastThreshold = await computeRow(t, listingId);

      expect(atThreshold).toMatchObject({ freshness_score: 75, freshness_state: "FRESH" });
      expect(pastThreshold).toMatchObject({ freshness_score: 69, freshness_state: "AGING" });
    });

    it("measures freshness from the latest activity, so a new photo on an old listing makes it fresh again", async () => {
      const t = createTest();
      const fixture = await createLeadFixture(t);
      const listingId = await insertListing(t, fixture);

      vi.setSystemTime(BASE_TIME + 50 * DAY_MS);
      const before = await computeRow(t, listingId);
      await addPhotos(t, listingId, 1);
      const after = await computeRow(t, listingId);

      expect(before?.freshness_state).toBe("AGING");
      expect(before?.last_activity_at).toBeUndefined();
      expect(after).toMatchObject({ freshness_score: 100, freshness_state: "FRESH" });
      // convex-test keeps _creationTime strictly increasing with sub-millisecond offsets.
      expect(Math.floor(after?.last_activity_at ?? 0)).toBe(BASE_TIME + 50 * DAY_MS);
    });
  });

  describe("computeForListing badges", () => {
    it("earns badges from verifications, inspected visits, photos (min 5) and confirmed closures in the building, in priority order", async () => {
      const t = createTest();
      const fixture = await createLeadFixture(t);
      const listingId = await insertListing(t, fixture);
      await addPhotos(t, listingId, 4);
      await t.run(async (ctx) => {
        await ctx.db.insert("owner_verifications", {
          lead_id: fixture.leadId,
          called_by_admin_id: fixture.admin.userId,
          call_outcome: "UNREACHABLE",
          consent_contact_demorentals: false,
          verified_at: BASE_TIME - 2 * DAY_MS,
        });
        await ctx.db.insert("owner_verifications", {
          lead_id: fixture.leadId,
          called_by_admin_id: fixture.admin.userId,
          call_outcome: "VERIFIED",
          consent_contact_demorentals: true,
          verified_at: BASE_TIME - DAY_MS,
        });
        await ctx.db.insert("visits", {
          lead_id: fixture.leadId,
          society_id: fixture.societyId,
          listing_id: listingId,
          scheduled_start: BASE_TIME - 3 * DAY_MS,
          scheduled_end: BASE_TIME - 3 * DAY_MS + HOUR_MS,
          assigned_guard_id: fixture.admin.userId,
          status: "COMPLETED",
          completed_at: BASE_TIME - 3 * DAY_MS + HOUR_MS,
          created_by_admin_id: fixture.admin.userId,
        });
      });

      const withFourPhotos = await computeRow(t, listingId);
      await addPhotos(t, listingId, 1);
      const withFivePhotos = await computeRow(t, listingId);

      expect(withFourPhotos?.badges.map((badge) => [badge.type, badge.earned])).toEqual([
        ["OWNER_VERIFIED", true],
        ["PHYSICALLY_INSPECTED", false],
        ["FRESH_LISTING", true],
        ["REAL_PHOTOS", false],
        ["VISITS_COMPLETED", true],
        ["CLOSURE_HISTORY", false],
      ]);
      expect(withFourPhotos?.badges[0].timestamp).toBe(BASE_TIME - DAY_MS);
      expect(withFivePhotos?.badges[3]).toMatchObject({
        type: "REAL_PHOTOS",
        earned: true,
        count: 5,
      });
      expect(withFivePhotos?.evidence).toEqual({
        photo_count: 5,
        visit_count: 1,
        has_closure: false,
      });
    });

    it("counts a confirmed closure on any lead in the same building but ignores pending ones", async () => {
      const t = createTest();
      const fixture = await createLeadFixture(t);
      const listingId = await insertListing(t, fixture);
      await t.run(async (ctx) => {
        const neighbourLeadId = await ctx.db.insert("leads", {
          society_id: fixture.societyId,
          building_id: fixture.buildingId,
          floor_number: "1",
          flat_number: "102",
          owner_phone: "9888800001",
          availability_type: "VACANT_NOW",
          owner_consent_to_call: true,
          submitted_by_guard_id: fixture.admin.userId,
          status: "VERIFIED",
        });
        await ctx.db.insert("closures", {
          lead_id: neighbourLeadId,
          move_in_date: BASE_TIME,
          status: "CONFIRMED",
          confirmed_at: BASE_TIME - 4 * DAY_MS,
          closed_by_admin_id: fixture.admin.userId,
        });
        await ctx.db.insert("closures", {
          lead_id: fixture.leadId,
          move_in_date: BASE_TIME,
          status: "PENDING",
          closed_by_admin_id: fixture.admin.userId,
        });
      });

      const row = await computeRow(t, listingId);

      expect(row?.badges[5]).toEqual({
        type: "CLOSURE_HISTORY",
        earned: true,
        timestamp: BASE_TIME - 4 * DAY_MS,
        count: 1,
      });
      expect(row?.evidence?.has_closure).toBe(true);
    });

    it("soft-deletes the trust row once the listing is no longer published and hides it from getForListing", async () => {
      const t = createTest();
      const fixture = await createLeadFixture(t);
      const listingId = await insertListing(t, fixture);
      await computeRow(t, listingId);
      expect(
        await t.query(api.trustBadges.getForListing, { listing_id: listingId }),
      ).not.toBeNull();

      await t.run(async (ctx) => ctx.db.patch(listingId, { status: "ARCHIVED" }));
      vi.setSystemTime(BASE_TIME + HOUR_MS);
      const result = await t.mutation(internal.trustBadges.computeForListing, {
        listing_id: listingId,
      });

      expect(result).toBeNull();
      const row = await t.run(async (ctx) => ctx.db.query("listing_trust_badges").unique());
      expect(row).toMatchObject({ is_deleted: true, last_computed_at: BASE_TIME + HOUR_MS });
      expect(await t.query(api.trustBadges.getForListing, { listing_id: listingId })).toBeNull();
    });
  });

  describe("recomputeFreshness", () => {
    it("processes published listings 50 at a time and schedules itself with the continuation cursor", async () => {
      const t = createTest();
      const fixture = await createLeadFixture(t);
      for (let index = 0; index < 51; index += 1) {
        await insertListing(t, fixture);
      }
      await insertListing(t, fixture, "DRAFT");

      const first = await t.mutation(internal.trustBadges.recomputeFreshness, {});
      const scheduled = await t.run(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      const second = await t.mutation(internal.trustBadges.recomputeFreshness, {
        cursor: first.continueCursor,
      });

      expect(first).toMatchObject({ processed: 50, isDone: false });
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].name).toContain("recomputeFreshness");
      expect(scheduled[0].args).toEqual([{ cursor: first.continueCursor }]);
      expect(second).toMatchObject({ processed: 1, isDone: true });
      const rows = await t.run(async (ctx) => ctx.db.query("listing_trust_badges").collect());
      expect(rows).toHaveLength(51);
      const jobsAfter = await t.run(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      expect(jobsAfter).toHaveLength(1);
    });
  });

  describe("listStaleForAdmin and getFreshnessCounts", () => {
    it("pages trust rows, filters by freshness state and counts states; trust_badges.view is required", async () => {
      const t = createTest();
      const fixture = await createLeadFixture(t);
      const staleListing = await insertListing(t, fixture);
      vi.setSystemTime(BASE_TIME + 40 * DAY_MS);
      const agingListing = await insertListing(t, fixture);
      vi.setSystemTime(BASE_TIME + 100 * DAY_MS);
      const freshListing = await insertListing(t, fixture);
      for (const listingId of [staleListing, agingListing, freshListing]) {
        await computeRow(t, listingId);
      }
      const outsider = await createUser(t, "ADMIN", [PERMISSIONS.LISTINGS_VIEW]);

      const firstPage = await fixture.admin.as.query(api.trustBadges.listStaleForAdmin, {
        paginationOpts: { numItems: 2, cursor: null },
      });
      const secondPage = await fixture.admin.as.query(api.trustBadges.listStaleForAdmin, {
        paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
      });
      const staleOnly = await fixture.admin.as.query(api.trustBadges.listStaleForAdmin, {
        paginationOpts: { numItems: 10, cursor: null },
        freshness_state: "STALE",
      });
      const counts = await fixture.admin.as.query(api.trustBadges.getFreshnessCounts, {});

      expect(firstPage.page).toHaveLength(2);
      expect(firstPage.isDone).toBe(false);
      expect(secondPage.page).toHaveLength(1);
      expect(secondPage.isDone).toBe(true);
      expect([...firstPage.page, ...secondPage.page].map((row) => row.listing_id).sort()).toEqual(
        [staleListing, agingListing, freshListing].sort(),
      );
      expect(staleOnly.page.map((row) => row.listing_id)).toEqual([staleListing]);
      expect(staleOnly.page[0]).toMatchObject({
        title: "2BHK Tower F / Fl 2",
        society_name: "Trust Society",
        badges_earned: [],
      });
      expect(counts).toEqual({ FRESH: 1, AGING: 1, STALE: 1, total: 3 });
      await expect(outsider.as.query(api.trustBadges.getFreshnessCounts, {})).rejects.toThrow(
        "Missing permission: trust_badges.view",
      );
    });
  });
});
