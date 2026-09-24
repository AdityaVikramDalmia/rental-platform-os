import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LISTING_STATUS, PERMISSIONS, type UserType } from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_listings";
process.env.WORKOS_API_KEY ??= "sk_test_listings";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_listings";

await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const BASE_TIME = Date.UTC(2026, 2, 1, 5, 0, 0);

const LISTING_PERMISSIONS = [
  PERMISSIONS.LISTINGS_CREATE,
  PERMISSIONS.LISTINGS_EDIT,
  PERMISSIONS.LISTINGS_PUBLISH,
];

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
  const workosUserId = `workos_listings_${userType.toLowerCase()}_${sequence}`;
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
        name: `Listings role ${sequence}`,
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

// Society "Green Acres" → building "Tower A" → one owner (PROSPECT) and a guard.
async function createPropertyFixture(t: TestBackend) {
  const admin = await createUser(t, "ADMIN", LISTING_PERMISSIONS);
  const ids = await t.run(async (ctx) => {
    const guardId = await ctx.db.insert("users", {
      workos_user_id: `workos_listings_guard_${sequence}`,
      user_type: "GUARD",
      name: "Lead guard",
      status: "ACTIVE",
      must_change_password: false,
    });
    const societyId = await ctx.db.insert("societies", {
      name: "Green Acres",
      city: "Bengaluru",
      status: "ACTIVE",
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower A",
      total_floors: 10,
      floor_labels: ["1", "2", "3"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const now = Date.now();
    const ownerId = await ctx.db.insert("owners", {
      phone: "9444400000",
      source: "GUARD_LEAD",
      active_properties_count: 0,
      total_leads_count: 1,
      total_closures_count: 0,
      lifecycle_stage: "PROSPECT",
      lifecycle_updated_at: now,
      first_seen_at: now,
      last_activity_at: now,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });
    return { guardId, societyId, buildingId, ownerId };
  });
  return { admin, ...ids };
}

type PropertyFixture = Awaited<ReturnType<typeof createPropertyFixture>>;

async function insertLead(
  t: TestBackend,
  fixture: PropertyFixture,
  status: "VERIFIED" | "SUBMITTED" = "VERIFIED",
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("leads", {
      society_id: fixture.societyId,
      building_id: fixture.buildingId,
      floor_number: "1",
      flat_number: "101",
      owner_phone: "9444400000",
      owner_id: fixture.ownerId,
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: fixture.guardId,
      status,
    }),
  );
}

async function createDraft(t: TestBackend, fixture: PropertyFixture, rent = 2_500_000) {
  const leadId = await insertLead(t, fixture);
  return await fixture.admin.as.mutation(api.listings.create, {
    lead_id: leadId,
    rent_monthly: rent,
    bhk_config: "2BHK",
    furnishing: "SEMI_FURNISHED",
    floor_number: " 1 ",
    available_from: BASE_TIME,
  });
}

async function addPhoto(t: TestBackend, listingId: Id<"listings">, isDeleted = false) {
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["jpeg-bytes"]));
    await ctx.db.insert("listing_photos", {
      listing_id: listingId,
      storage_id: storageId,
      display_order: 0,
      is_deleted: isDeleted,
    });
  });
}

async function publishDraft(t: TestBackend, fixture: PropertyFixture, listingId: Id<"listings">) {
  await addPhoto(t, listingId);
  return await fixture.admin.as.mutation(api.listings.publish, {
    listing_id: listingId,
    new_status: LISTING_STATUS.PUBLISHED,
  });
}

describe("listings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("create", () => {
    it("creates a DRAFT for a VERIFIED lead with a slug built from building, flat, society and BHK", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);

      const listingId = await createDraft(t, fixture);

      const listing = await t.run(async (ctx) => ctx.db.get(listingId));
      expect(listing).toMatchObject({
        status: LISTING_STATUS.DRAFT,
        slug: "tower-a-101-green-acres-2bhk",
        owner_id: fixture.ownerId,
        floor_number: "1",
        rent_monthly: 2_500_000,
        created_by_admin_id: fixture.admin.userId,
      });
    });

    it("suffixes colliding slugs with -2 then -3", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);

      const ids = [
        await createDraft(t, fixture),
        await createDraft(t, fixture),
        await createDraft(t, fixture),
      ];

      const slugs = await t.run(async (ctx) =>
        Promise.all(ids.map(async (id) => (await ctx.db.get(id))?.slug)),
      );
      expect(slugs).toEqual([
        "tower-a-101-green-acres-2bhk",
        "tower-a-101-green-acres-2bhk-2",
        "tower-a-101-green-acres-2bhk-3",
      ]);
    });

    it("rejects fractional paise and negative amounts", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const leadId = await insertLead(t, fixture);
      const base = {
        lead_id: leadId,
        rent_monthly: 2_500_000,
        bhk_config: "1BHK" as const,
        furnishing: "UNFURNISHED" as const,
        floor_number: "1",
        available_from: BASE_TIME,
      };

      await expect(
        fixture.admin.as.mutation(api.listings.create, { ...base, rent_monthly: 2_500_000.5 }),
      ).rejects.toThrow("Rent must be a whole number in paise.");
      await expect(
        fixture.admin.as.mutation(api.listings.create, { ...base, deposit: -1 }),
      ).rejects.toThrow("Deposit must be non-negative.");
      await expect(
        fixture.admin.as.mutation(api.listings.create, { ...base, maintenance: 99.9 }),
      ).rejects.toThrow("Maintenance must be a whole number in paise.");
      expect(await t.run(async (ctx) => ctx.db.query("listings").collect())).toHaveLength(0);
    });

    // Characterisation of current behaviour, not an endorsement: a published ₹0 rent is almost certainly a data-entry error, and rental transactions reject non-positive rent (convex/rentalTransactions.ts:154).
    it("currently accepts a monthly rent of 0 paise", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);

      const listingId = await createDraft(t, fixture, 0);

      const listing = await t.run(async (ctx) => ctx.db.get(listingId));
      expect(listing?.rent_monthly).toBe(0);
    });

    it("refuses a non-VERIFIED lead and a second listing for the same lead", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const submittedLeadId = await insertLead(t, fixture, "SUBMITTED");
      const args = {
        rent_monthly: 2_000_000,
        bhk_config: "1BHK" as const,
        furnishing: "UNFURNISHED" as const,
        floor_number: "1",
        available_from: BASE_TIME,
      };

      await expect(
        fixture.admin.as.mutation(api.listings.create, { ...args, lead_id: submittedLeadId }),
      ).rejects.toThrow("Only VERIFIED leads can be converted to listings");

      const verifiedLeadId = await insertLead(t, fixture);
      await fixture.admin.as.mutation(api.listings.create, { ...args, lead_id: verifiedLeadId });
      await expect(
        fixture.admin.as.mutation(api.listings.create, { ...args, lead_id: verifiedLeadId }),
      ).rejects.toThrow("A listing already exists for this lead");
    });

    it("requires listings.create while a holder of it still succeeds", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const editorOnly = await createUser(t, "ADMIN", [PERMISSIONS.LISTINGS_EDIT]);
      const leadId = await insertLead(t, fixture);
      const args = {
        lead_id: leadId,
        rent_monthly: 2_000_000,
        bhk_config: "STUDIO" as const,
        furnishing: "UNFURNISHED" as const,
        floor_number: "1",
        available_from: BASE_TIME,
      };

      await expect(editorOnly.as.mutation(api.listings.create, args)).rejects.toThrow(
        "Missing permission: listings.create",
      );
      await expect(fixture.admin.as.mutation(api.listings.create, args)).resolves.toBeDefined();
    });
  });

  describe("update", () => {
    it("rejects fractional maintenance and a blank floor number but applies a valid partial update", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const listingId = await createDraft(t, fixture);

      await expect(
        fixture.admin.as.mutation(api.listings.update, { listing_id: listingId, maintenance: 0.5 }),
      ).rejects.toThrow("Maintenance must be a whole number in paise.");
      await expect(
        fixture.admin.as.mutation(api.listings.update, {
          listing_id: listingId,
          floor_number: "   ",
        }),
      ).rejects.toThrow("Floor number is required");

      const updated = await fixture.admin.as.mutation(api.listings.update, {
        listing_id: listingId,
        deposit: 7_500_000,
        description: "  Corner flat  ",
      });
      expect(updated).toMatchObject({
        deposit: 7_500_000,
        description: "Corner flat",
        rent_monthly: 2_500_000,
        floor_number: "1",
      });
    });
  });

  describe("publish", () => {
    it("allows DRAFT→PUBLISHED→ARCHIVED→DRAFT and rejects DRAFT→ARCHIVED and ARCHIVED→PUBLISHED", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const listingId = await createDraft(t, fixture);
      const move = (newStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED") =>
        fixture.admin.as.mutation(api.listings.publish, {
          listing_id: listingId,
          new_status: newStatus,
        });
      await addPhoto(t, listingId);

      await expect(move("ARCHIVED")).rejects.toThrow(
        "Cannot change listing status from DRAFT to ARCHIVED",
      );
      expect((await move("PUBLISHED"))?.status).toBe("PUBLISHED");
      expect((await move("ARCHIVED"))?.status).toBe("ARCHIVED");
      await expect(move("PUBLISHED")).rejects.toThrow(
        "Cannot change listing status from ARCHIVED to PUBLISHED",
      );
      expect((await move("DRAFT"))?.status).toBe("DRAFT");
    });

    it("needs at least one non-deleted photo to publish a draft", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const listingId = await createDraft(t, fixture);
      await addPhoto(t, listingId, true);

      await expect(
        fixture.admin.as.mutation(api.listings.publish, {
          listing_id: listingId,
          new_status: "PUBLISHED",
        }),
      ).rejects.toThrow("At least one photo is required to publish");

      const published = await publishDraft(t, fixture, listingId);
      expect(published?.status).toBe("PUBLISHED");
    });

    it("blocks archiving while a PENDING closure references the listing, but not a CONFIRMED one", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const listingId = await createDraft(t, fixture);
      await publishDraft(t, fixture, listingId);
      const closureId = await t.run(async (ctx) => {
        const listing = await ctx.db.get(listingId);
        return await ctx.db.insert("closures", {
          lead_id: listing!.lead_id,
          listing_id: listingId,
          move_in_date: BASE_TIME,
          status: "PENDING",
          closed_by_admin_id: fixture.admin.userId,
        });
      });
      const archive = () =>
        fixture.admin.as.mutation(api.listings.publish, {
          listing_id: listingId,
          new_status: "ARCHIVED",
        });

      await expect(archive()).rejects.toThrow(
        "Cannot archive listing with pending closures. Cancel or confirm closures first.",
      );

      await t.run(async (ctx) => ctx.db.patch(closureId, { status: "CONFIRMED" }));
      expect((await archive())?.status).toBe("ARCHIVED");
    });

    it("archiving cancels in-flight rental transactions with reason LISTING_ARCHIVED and leaves completed ones", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const tenant = await createUser(t, "TENANT");
      const listingId = await createDraft(t, fixture);
      await publishDraft(t, fixture, listingId);
      const [openId, doneId] = await t.run(async (ctx) => {
        const insertTransaction = (status: "INITIATED" | "COMPLETED") =>
          ctx.db.insert("rental_transactions", {
            tenant_user_id: tenant.userId,
            listing_id: listingId,
            owner_id: fixture.ownerId,
            status,
            monthly_rent_paise: 2_500_000,
            deposit_amount_paise: 7_500_000,
            created_at: BASE_TIME,
            updated_at: BASE_TIME,
            is_deleted: false,
          });
        return [await insertTransaction("INITIATED"), await insertTransaction("COMPLETED")];
      });

      await fixture.admin.as.mutation(api.listings.publish, {
        listing_id: listingId,
        new_status: "ARCHIVED",
      });

      const [open, done] = await t.run(async (ctx) =>
        Promise.all([ctx.db.get(openId), ctx.db.get(doneId)]),
      );
      expect(open?.status).toBe("CANCELLED");
      expect(open?.cancellation_reason).toBe("LISTING_ARCHIVED");
      expect(done?.status).toBe("COMPLETED");
    });

    it("counts the property on the owner, walks a PROSPECT owner to ACTIVE, and decrements on unpublish", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const listingId = await createDraft(t, fixture);

      vi.setSystemTime(BASE_TIME + 60_000);
      await publishDraft(t, fixture, listingId);
      const afterPublish = await t.run(async (ctx) => ctx.db.get(fixture.ownerId));
      expect(afterPublish?.active_properties_count).toBe(1);
      expect(afterPublish?.lifecycle_stage).toBe("ACTIVE");
      expect(afterPublish?.last_activity_at).toBe(BASE_TIME + 60_000);

      await fixture.admin.as.mutation(api.listings.publish, {
        listing_id: listingId,
        new_status: "DRAFT",
      });
      const afterUnpublish = await t.run(async (ctx) => ctx.db.get(fixture.ownerId));
      expect(afterUnpublish?.active_properties_count).toBe(0);
      expect(afterUnpublish?.lifecycle_stage).toBe("ACTIVE");
    });

    it("schedules a trust-badge recompute for the listing after a status change", async () => {
      const t = createTest();
      const fixture = await createPropertyFixture(t);
      const listingId = await createDraft(t, fixture);

      await publishDraft(t, fixture, listingId);

      const jobs = await t.run(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      const recomputes = jobs.filter((job) => job.name.includes("trustBadges"));
      expect(recomputes).toHaveLength(1);
      expect(recomputes[0].name).toContain("computeForListing");
      expect(recomputes[0].args).toEqual([{ listing_id: listingId }]);
    });
  });
});
