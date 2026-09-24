import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type OwnerLifecycleStage, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_owners";
process.env.WORKOS_API_KEY ??= "sk_test_owners";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_owners";

await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const BASE_TIME = Date.UTC(2026, 4, 5, 2, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const workosUserId = `workos_owners_${userType.toLowerCase()}_${sequence}`;
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
        name: `Owners role ${sequence}`,
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
    as: t.withIdentity({ subject: workosUserId, issuer: "https://api.workos.com/" }),
  };
}

async function insertOwner(
  t: TestBackend,
  fields: {
    phone: string;
    stage?: OwnerLifecycleStage;
    lastActivityAt?: number;
    name?: string;
    email?: string;
    isDeleted?: boolean;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("owners", {
      phone: fields.phone,
      name: fields.name,
      email: fields.email,
      source: "GUARD_LEAD",
      active_properties_count: 0,
      total_leads_count: 0,
      total_closures_count: 0,
      lifecycle_stage: fields.stage ?? "MANAGED",
      lifecycle_updated_at: now,
      first_seen_at: now,
      last_activity_at: fields.lastActivityAt ?? now,
      is_deleted: fields.isDeleted ?? false,
      created_at: now,
      updated_at: now,
    });
  });
}

// Society → building plus an RM guard; leads/listings/closures hang off it per test.
async function createEstate(t: TestBackend) {
  const guard = await createUser(t, "GUARD");
  return await t.run(async (ctx) => {
    const societyId = await ctx.db.insert("societies", {
      name: "Owner Society",
      city: "Chennai",
      status: "ACTIVE",
      created_by_admin_id: guard.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower D",
      total_floors: 6,
      floor_labels: ["1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const guardProfileId = await ctx.db.insert("guard_profiles", {
      user_id: guard.userId,
      society_id: societyId,
      guard_type: "MAIN_GATE",
      has_seen_onboarding: true,
    });
    return { societyId, buildingId, guardUserId: guard.userId, guardProfileId };
  });
}

type Estate = Awaited<ReturnType<typeof createEstate>>;

async function insertLead(
  t: TestBackend,
  estate: Estate,
  ownerId: Id<"owners">,
  status: "VERIFIED" | "SUBMITTED",
  flat: string,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("leads", {
      society_id: estate.societyId,
      building_id: estate.buildingId,
      floor_number: "1",
      flat_number: flat,
      owner_phone: "9555500000",
      owner_id: ownerId,
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: estate.guardUserId,
      status,
    }),
  );
}

async function insertListing(
  t: TestBackend,
  ownerId: Id<"owners">,
  leadId: Id<"leads">,
  status: "PUBLISHED" | "DRAFT",
  adminId: Id<"users">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerId,
      slug: `owner-listing-${leadId}`,
      status,
      rent_monthly: 1_800_000,
      bhk_config: "1BHK",
      furnishing: "UNFURNISHED",
      floor_number: "1",
      available_from: Date.now(),
      created_by_admin_id: adminId,
    }),
  );
}

async function insertAssignment(
  t: TestBackend,
  estate: Estate,
  ownerId: Id<"owners">,
  status: "ACTIVE" | "ENDED" = "ACTIVE",
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("owner_rm_assignments", {
      owner_id: ownerId,
      rm_guard_id: estate.guardProfileId,
      rm_user_id: estate.guardUserId,
      assigned_by: "SYSTEM",
      status,
      next_check_in_due: Date.now() + 30 * DAY_MS,
      check_in_frequency_days: 30,
      missed_check_ins_count: 0,
      sla_breach_count: 0,
      escalation_level: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    }),
  );
}

describe("owners lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("transitionDormantOwners", () => {
    it("moves a MANAGED owner to DORMANT only after strictly more than 90 days without activity", async () => {
      const t = createTest();
      const exactlyNinety = await insertOwner(t, {
        phone: "9555500001",
        lastActivityAt: BASE_TIME - 90 * DAY_MS,
      });
      const pastNinety = await insertOwner(t, {
        phone: "9555500002",
        lastActivityAt: BASE_TIME - 90 * DAY_MS - 1,
      });

      const result = await t.mutation(internal.owners.transitionDormantOwners, {});

      expect(result).toEqual({ transitioned: 1, processedAt: BASE_TIME });
      const [kept, moved] = await t.run(async (ctx) =>
        Promise.all([ctx.db.get(exactlyNinety), ctx.db.get(pastNinety)]),
      );
      expect(kept?.lifecycle_stage).toBe("MANAGED");
      expect(moved?.lifecycle_stage).toBe("DORMANT");
      expect(moved?.lifecycle_updated_at).toBe(BASE_TIME);
    });

    it("keeps an inactive MANAGED owner with a published listing or a live RM assignment, refreshing its activity", async () => {
      const t = createTest();
      const estate = await createEstate(t);
      const stale = BASE_TIME - 200 * DAY_MS;
      const withListing = await insertOwner(t, { phone: "9555500003", lastActivityAt: stale });
      const withRm = await insertOwner(t, { phone: "9555500004", lastActivityAt: stale });
      const withEndedRm = await insertOwner(t, { phone: "9555500005", lastActivityAt: stale });
      const leadId = await insertLead(t, estate, withListing, "VERIFIED", "101");
      await insertListing(t, withListing, leadId, "PUBLISHED", estate.guardUserId);
      await insertAssignment(t, estate, withRm, "ACTIVE");
      await insertAssignment(t, estate, withEndedRm, "ENDED");

      const result = await t.mutation(internal.owners.transitionDormantOwners, {});

      expect(result.transitioned).toBe(1);
      const owners = await t.run(async (ctx) =>
        Promise.all([withListing, withRm, withEndedRm].map((id) => ctx.db.get(id))),
      );
      expect(owners.map((owner) => owner?.lifecycle_stage)).toEqual([
        "MANAGED",
        "MANAGED",
        "DORMANT",
      ]);
      expect(owners[0]?.last_activity_at).toBe(BASE_TIME);
      expect(owners[1]?.last_activity_at).toBe(BASE_TIME);
    });

    it("only considers MANAGED, non-deleted owners", async () => {
      const t = createTest();
      const stale = BASE_TIME - 365 * DAY_MS;
      const active = await insertOwner(t, {
        phone: "9555500006",
        stage: "ACTIVE",
        lastActivityAt: stale,
      });
      const deleted = await insertOwner(t, {
        phone: "9555500007",
        lastActivityAt: stale,
        isDeleted: true,
      });

      const result = await t.mutation(internal.owners.transitionDormantOwners, {});

      expect(result.transitioned).toBe(0);
      const owners = await t.run(async (ctx) =>
        Promise.all([ctx.db.get(active), ctx.db.get(deleted)]),
      );
      expect(owners.map((owner) => owner?.lifecycle_stage)).toEqual(["ACTIVE", "MANAGED"]);
    });
  });

  describe("merge", () => {
    async function createMergeFixture(t: TestBackend) {
      const estate = await createEstate(t);
      const admin = await createUser(t, "ADMIN", [PERMISSIONS.OWNERS_MERGE]);
      const sourceId = await insertOwner(t, {
        phone: "9555500010",
        stage: "VERIFIED",
        name: "Asha Rao",
        email: "asha@example.com",
        lastActivityAt: BASE_TIME - 5 * DAY_MS,
      });
      const targetId = await insertOwner(t, {
        phone: "9555500011",
        stage: "PROSPECT",
        lastActivityAt: BASE_TIME - 10 * DAY_MS,
      });
      const sourceLeadId = await insertLead(t, estate, sourceId, "VERIFIED", "201");
      const targetLeadId = await insertLead(t, estate, targetId, "SUBMITTED", "202");
      const listingId = await insertListing(t, sourceId, sourceLeadId, "PUBLISHED", admin.userId);
      const ids = await t.run(async (ctx) => {
        const closureId = await ctx.db.insert("closures", {
          lead_id: sourceLeadId,
          listing_id: listingId,
          owner_id: sourceId,
          move_in_date: BASE_TIME,
          status: "CONFIRMED",
          closed_by_admin_id: admin.userId,
        });
        return { closureId };
      });
      // Leads were seeded directly; register them with the leadCounts aggregate
      // before merge patches them (the production backfill used by guards.test.ts).
      await t.mutation(internal.analytics.backfillAggregates, {});
      return { estate, admin, sourceId, targetId, sourceLeadId, targetLeadId, listingId, ...ids };
    }

    it("relinks leads, listings, closures and check-ins to the target and soft-deletes the source", async () => {
      const t = createTest();
      const fixture = await createMergeFixture(t);
      const assignmentId = await insertAssignment(t, fixture.estate, fixture.sourceId);
      const checkInId = await t.run(async (ctx) =>
        ctx.db.insert("rm_check_ins", {
          assignment_id: assignmentId,
          owner_id: fixture.sourceId,
          rm_guard_id: fixture.estate.guardProfileId,
          check_in_type: "SCHEDULED",
          method: "CALL",
          summary: "Pre-merge call",
          outcome: "RESOLVED",
          created_at: BASE_TIME - DAY_MS,
        }),
      );

      await fixture.admin.as.mutation(api.owners.merge, {
        source_id: fixture.sourceId,
        target_id: fixture.targetId,
      });

      const state = await t.run(async (ctx) => ({
        lead: await ctx.db.get(fixture.sourceLeadId),
        listing: await ctx.db.get(fixture.listingId),
        closure: await ctx.db.get(fixture.closureId),
        assignment: await ctx.db.get(assignmentId),
        checkIn: await ctx.db.get(checkInId),
        source: await ctx.db.get(fixture.sourceId),
      }));
      expect(state.lead?.owner_id).toBe(fixture.targetId);
      expect(state.listing?.owner_id).toBe(fixture.targetId);
      expect(state.closure?.owner_id).toBe(fixture.targetId);
      expect(state.assignment?.owner_id).toBe(fixture.targetId);
      expect(state.checkIn?.owner_id).toBe(fixture.targetId);
      expect(state.checkIn?.assignment_id).toBe(assignmentId);
      expect(state.source).toMatchObject({ is_deleted: true, merged_into_id: fixture.targetId });
      expect(state.source?.email).toBeUndefined();
      expect(state.source?.user_id).toBeUndefined();
    });

    it("recomputes the target's counters and stage and fills its blank profile fields from the source", async () => {
      const t = createTest();
      const fixture = await createMergeFixture(t);

      const target = await fixture.admin.as.mutation(api.owners.merge, {
        source_id: fixture.sourceId,
        target_id: fixture.targetId,
      });

      expect(target).toMatchObject({
        active_properties_count: 1,
        total_leads_count: 2,
        total_closures_count: 1,
        lifecycle_stage: "MANAGED",
        name: "Asha Rao",
        email: "asha@example.com",
        last_activity_at: BASE_TIME - 5 * DAY_MS,
      });
    });

    it("ends the source's live RM assignment when the target already has one, keeping the target's RM", async () => {
      const t = createTest();
      const fixture = await createMergeFixture(t);
      const sourceAssignment = await insertAssignment(t, fixture.estate, fixture.sourceId);
      const targetAssignment = await insertAssignment(t, fixture.estate, fixture.targetId);

      await fixture.admin.as.mutation(api.owners.merge, {
        source_id: fixture.sourceId,
        target_id: fixture.targetId,
      });

      const [ended, kept] = await t.run(async (ctx) =>
        Promise.all([ctx.db.get(sourceAssignment), ctx.db.get(targetAssignment)]),
      );
      expect(ended).toMatchObject({
        status: "ENDED",
        reassignment_reason: "merged",
        owner_id: fixture.sourceId,
      });
      expect(kept).toMatchObject({ status: "ACTIVE", owner_id: fixture.targetId });
    });

    it("rejects self-merges and already-merged sources, and requires owners.merge", async () => {
      const t = createTest();
      const fixture = await createMergeFixture(t);
      const editor = await createUser(t, "ADMIN", [PERMISSIONS.OWNERS_EDIT]);
      const args = { source_id: fixture.sourceId, target_id: fixture.targetId };

      await expect(editor.as.mutation(api.owners.merge, args)).rejects.toThrow(
        "Missing permission: owners.merge",
      );
      await expect(
        fixture.admin.as.mutation(api.owners.merge, {
          source_id: fixture.targetId,
          target_id: fixture.targetId,
        }),
      ).rejects.toThrow("source_id and target_id must be different");

      await fixture.admin.as.mutation(api.owners.merge, args);
      await expect(fixture.admin.as.mutation(api.owners.merge, args)).rejects.toThrow(
        "Source owner not found",
      );
    });
  });

  describe("updateLifecycle", () => {
    it("refuses to skip stages, and churning ends live RM assignments and clears the owner's RM", async () => {
      const t = createTest();
      const estate = await createEstate(t);
      const manager = await createUser(t, "ADMIN", [PERMISSIONS.OWNERS_MANAGE_LIFECYCLE]);
      const prospect = await insertOwner(t, { phone: "9555500020", stage: "PROSPECT" });
      const managed = await insertOwner(t, { phone: "9555500021", stage: "MANAGED" });
      const assignmentId = await insertAssignment(t, estate, managed);
      await t.run(async (ctx) =>
        ctx.db.patch(managed, {
          current_rm_id: estate.guardUserId,
          current_rm_guard_id: estate.guardProfileId,
        }),
      );

      await expect(
        manager.as.mutation(api.owners.updateLifecycle, { id: prospect, new_stage: "ACTIVE" }),
      ).rejects.toThrow("Invalid owner lifecycle transition: PROSPECT -> ACTIVE");

      const churned = await manager.as.mutation(api.owners.updateLifecycle, {
        id: managed,
        new_stage: "CHURNED",
      });

      expect(churned.lifecycle_stage).toBe("CHURNED");
      expect(churned.current_rm_id).toBeUndefined();
      expect(churned.current_rm_guard_id).toBeUndefined();
      const assignment = await t.run(async (ctx) => ctx.db.get(assignmentId));
      expect(assignment).toMatchObject({ status: "ENDED", reassignment_reason: "owner_churned" });
    });
  });

  describe("getOrCreateByPhone", () => {
    it("normalises the phone and reuses an existing owner, filling a blank name instead of duplicating", async () => {
      const t = createTest();
      const existing = await insertOwner(t, { phone: "9876501234", stage: "PROSPECT" });

      const resolved = await t.mutation(internal.owners.getOrCreateByPhone, {
        phone: "+91 98765-01234",
        name: "  Ravi Kumar ",
        source: "OWNER_SERVICE_REQUEST",
      });
      const created = await t.mutation(internal.owners.getOrCreateByPhone, {
        phone: "(987) 650-9999",
        source: "GUARD_LEAD",
      });

      expect(resolved).toBe(existing);
      const [reused, fresh] = await t.run(async (ctx) =>
        Promise.all([ctx.db.get(existing), ctx.db.get(created)]),
      );
      expect(reused?.name).toBe("Ravi Kumar");
      expect(reused?.source).toBe("GUARD_LEAD");
      expect(fresh).toMatchObject({
        phone: "9876509999",
        source: "GUARD_LEAD",
        lifecycle_stage: "PROSPECT",
        active_properties_count: 0,
      });
    });

    it.fails(
      "resolves a merged-away owner's phone to the merge target instead of creating a duplicate (BUG-032)",
      async () => {
        const t = createTest();
        const admin = await createUser(t, "ADMIN", [PERMISSIONS.OWNERS_MERGE]);
        const sourceId = await insertOwner(t, { phone: "9555500030", stage: "PROSPECT" });
        const targetId = await insertOwner(t, { phone: "9555500031", stage: "PROSPECT" });
        await admin.as.mutation(api.owners.merge, { source_id: sourceId, target_id: targetId });

        const resolved = await t.mutation(internal.owners.getOrCreateByPhone, {
          phone: "9555500030",
          source: "GUARD_LEAD",
        });

        expect(resolved).toBe(targetId);
      },
    );
  });

  describe("owner onboarding (ownerServiceRequests internals)", () => {
    it("onboardInternal moves a CONTACTED request to ONBOARDED and refuses one that was never contacted", async () => {
      const t = createTest();
      const owner = await createUser(t, "OWNER");
      const [contacted, submitted] = await t.run(async (ctx) => {
        const insertRequest = (status: "CONTACTED" | "SUBMITTED") =>
          ctx.db.insert("owner_service_requests", {
            name: "Prospective Owner",
            phone: "9666600000",
            status,
          });
        return [await insertRequest("CONTACTED"), await insertRequest("SUBMITTED")];
      });

      await t.mutation(internal.ownerServiceRequests.onboardInternal, {
        request_id: contacted,
        owner_user_id: owner.userId,
      });
      await expect(
        t.mutation(internal.ownerServiceRequests.onboardInternal, {
          request_id: submitted,
          owner_user_id: owner.userId,
        }),
      ).rejects.toThrow("Cannot onboard request with status: SUBMITTED. Must be CONTACTED first.");

      const [onboarded, untouched] = await t.run(async (ctx) =>
        Promise.all([ctx.db.get(contacted), ctx.db.get(submitted)]),
      );
      expect(onboarded).toMatchObject({ status: "ONBOARDED", owner_user_id: owner.userId });
      expect(untouched?.status).toBe("SUBMITTED");
    });

    it("createOwnerUserInternal adds the OWNER persona to an existing account and creates new accounts with a lower-cased email", async () => {
      const t = createTest();
      const tenant = await createUser(t, "TENANT");
      const requestId = await t.run(async (ctx) =>
        ctx.db.insert("owner_service_requests", {
          name: "Prospective Owner",
          phone: "9666600001",
          status: "CONTACTED",
        }),
      );

      const reusedId = await t.mutation(internal.ownerServiceRequests.createOwnerUserInternal, {
        workos_user_id: tenant.workosUserId,
        name: "Ignored Name",
        email: "ignored@example.com",
        request_id: requestId,
      });
      const newId = await t.mutation(internal.ownerServiceRequests.createOwnerUserInternal, {
        workos_user_id: "workos_owners_brand_new",
        name: "  Meera Iyer ",
        email: " Meera.Iyer@Example.COM ",
        request_id: requestId,
      });

      expect(reusedId).toBe(tenant.userId);
      const [reused, created] = await t.run(async (ctx) =>
        Promise.all([ctx.db.get(reusedId), ctx.db.get(newId)]),
      );
      expect(reused?.user_types).toEqual(["TENANT", "OWNER"]);
      expect(reused?.email).toBe(`${tenant.workosUserId}@example.com`);
      expect(created).toMatchObject({
        user_type: "OWNER",
        name: "Meera Iyer",
        email: "meera.iyer@example.com",
        status: "ACTIVE",
      });
    });
  });
});
