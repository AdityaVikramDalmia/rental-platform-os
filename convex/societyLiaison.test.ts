import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PERMISSIONS,
  REGULATORY_STATUS,
  type RegulatoryStatus,
  type UserType,
} from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_liaison";
process.env.WORKOS_API_KEY ??= "sk_test_liaison";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_liaison";

await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const BASE_TIME = Date.UTC(2026, 5, 1, 4, 0, 0);
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
  const workosUserId = `workos_liaison_${userType.toLowerCase()}_${sequence}`;
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
        name: `Liaison role ${sequence}`,
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

// Society → building → lead → confirmed closure, plus an admin holding closures.edit/view.
async function createClosureFixture(t: TestBackend) {
  const admin = await createUser(t, "ADMIN", [
    PERMISSIONS.CLOSURES_EDIT,
    PERMISSIONS.CLOSURES_VIEW,
  ]);
  const closureId = await t.run(async (ctx) => {
    const societyId = await ctx.db.insert("societies", {
      name: "Liaison Society",
      city: "Delhi",
      status: "ACTIVE",
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower E",
      total_floors: 5,
      floor_labels: ["1"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "1",
      flat_number: "103",
      owner_phone: "9777700000",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: admin.userId,
      status: "VERIFIED",
    });
    return await ctx.db.insert("closures", {
      lead_id: leadId,
      move_in_date: BASE_TIME + 10 * DAY_MS,
      status: "CONFIRMED",
      closed_by_admin_id: admin.userId,
    });
  });
  return { admin, closureId };
}

type ClosureFixture = Awaited<ReturnType<typeof createClosureFixture>>;

async function insertItem(
  t: TestBackend,
  fixture: ClosureFixture,
  fields: { status: RegulatoryStatus; slaDeadline?: number; isDeleted?: boolean },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("regulatory_items", {
      closure_id: fixture.closureId,
      item_type: "POLICE_VERIFICATION",
      status: fields.status,
      sla_deadline: fields.slaDeadline,
      linked_document_ids: [],
      is_deleted: fields.isDeleted ?? false,
    }),
  );
}

async function readStatuses(t: TestBackend, ids: Id<"regulatory_items">[]) {
  return await t.run(async (ctx) =>
    Promise.all(ids.map(async (id) => (await ctx.db.get(id))?.status)),
  );
}

describe("societyLiaison", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("createRegulatoryItem", () => {
    it("starts NOT_STARTED with the per-type default SLA (police 7d, rent registration 60d, NOC 14d, stamp duty 30d)", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);
      const expectedDays = {
        POLICE_VERIFICATION: 7,
        RENT_REGISTRATION: 60,
        SOCIETY_NOC: 14,
        STAMP_DUTY: 30,
      } as const;

      for (const [itemType, days] of Object.entries(expectedDays)) {
        const item = await fixture.admin.as.mutation(api.societyLiaison.createRegulatoryItem, {
          closure_id: fixture.closureId,
          item_type: itemType as keyof typeof expectedDays,
        });
        expect(item, itemType).toMatchObject({
          status: REGULATORY_STATUS.NOT_STARTED,
          sla_deadline: BASE_TIME + days * DAY_MS,
          linked_document_ids: [],
          is_deleted: false,
        });
      }
    });

    it("rejects an explicit deadline in the past but accepts one equal to now", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);

      await expect(
        fixture.admin.as.mutation(api.societyLiaison.createRegulatoryItem, {
          closure_id: fixture.closureId,
          item_type: "SOCIETY_NOC",
          sla_deadline: BASE_TIME - 1,
        }),
      ).rejects.toThrow("SLA deadline cannot be in the past");

      const item = await fixture.admin.as.mutation(api.societyLiaison.createRegulatoryItem, {
        closure_id: fixture.closureId,
        item_type: "SOCIETY_NOC",
        sla_deadline: BASE_TIME,
      });
      expect(item?.sla_deadline).toBe(BASE_TIME);
    });

    it("only assigns items to ADMIN or OPS users, recording who assigned them", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);
      const tenant = await createUser(t, "TENANT");
      const ops = await createUser(t, "OPS");

      await expect(
        fixture.admin.as.mutation(api.societyLiaison.createRegulatoryItem, {
          closure_id: fixture.closureId,
          item_type: "STAMP_DUTY",
          assigned_to: tenant.userId,
        }),
      ).rejects.toThrow("Regulatory items can only be assigned to admin or OPS users");

      const item = await fixture.admin.as.mutation(api.societyLiaison.createRegulatoryItem, {
        closure_id: fixture.closureId,
        item_type: "STAMP_DUTY",
        assigned_to: ops.userId,
      });
      expect(item).toMatchObject({ assigned_to: ops.userId, assigned_by: fixture.admin.userId });
    });

    it("requires closures.edit while a holder still succeeds", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);
      const viewer = await createUser(t, "ADMIN", [PERMISSIONS.CLOSURES_VIEW]);
      const args = { closure_id: fixture.closureId, item_type: "RENT_REGISTRATION" as const };

      await expect(
        viewer.as.mutation(api.societyLiaison.createRegulatoryItem, args),
      ).rejects.toThrow("Missing permission: closures.edit");
      await expect(
        fixture.admin.as.mutation(api.societyLiaison.createRegulatoryItem, args),
      ).resolves.toMatchObject({ status: "NOT_STARTED" });
    });
  });

  describe("updateStatus", () => {
    it("rejects a manual move to OVERDUE from every status", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);

      for (const status of Object.values(REGULATORY_STATUS)) {
        const itemId = await insertItem(t, fixture, { status, slaDeadline: BASE_TIME + DAY_MS });
        await expect(
          fixture.admin.as.mutation(api.societyLiaison.updateStatus, {
            regulatory_item_id: itemId,
            new_status: "OVERDUE",
          }),
          status,
        ).rejects.toThrow(`Invalid regulatory status transition: ${status} -> OVERDUE`);
      }
    });

    it("stamps submitted_at on SUBMITTED and completed_at on APPROVED, after which the item is terminal", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);
      const itemId = await insertItem(t, fixture, { status: "IN_PROGRESS" });

      vi.setSystemTime(BASE_TIME + HOUR_MS);
      const submitted = await fixture.admin.as.mutation(api.societyLiaison.updateStatus, {
        regulatory_item_id: itemId,
        new_status: "SUBMITTED",
        reference_number: "  PV-2026-0042 ",
      });
      vi.setSystemTime(BASE_TIME + 2 * HOUR_MS);
      const approved = await fixture.admin.as.mutation(api.societyLiaison.updateStatus, {
        regulatory_item_id: itemId,
        new_status: "APPROVED",
      });

      expect(submitted).toMatchObject({
        status: "SUBMITTED",
        submitted_at: BASE_TIME + HOUR_MS,
        reference_number: "PV-2026-0042",
      });
      expect(approved).toMatchObject({
        status: "APPROVED",
        submitted_at: BASE_TIME + HOUR_MS,
        completed_at: BASE_TIME + 2 * HOUR_MS,
      });
      await expect(
        fixture.admin.as.mutation(api.societyLiaison.updateStatus, {
          regulatory_item_id: itemId,
          new_status: "WAIVED",
        }),
      ).rejects.toThrow("Invalid regulatory status transition: APPROVED -> WAIVED");
    });

    it("currently allows waiving a SUBMITTED or REJECTED item", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);
      const submittedId = await insertItem(t, fixture, { status: "SUBMITTED" });
      const rejectedId = await insertItem(t, fixture, { status: "REJECTED" });

      for (const itemId of [submittedId, rejectedId]) {
        await fixture.admin.as.mutation(api.societyLiaison.updateStatus, {
          regulatory_item_id: itemId,
          new_status: "WAIVED",
        });
      }

      expect(await readStatuses(t, [submittedId, rejectedId])).toEqual(["WAIVED", "WAIVED"]);
    });
  });

  describe("updateDetails", () => {
    it("moves the deadline to a future date and trims notes", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);
      const itemId = await insertItem(t, fixture, {
        status: "IN_PROGRESS",
        slaDeadline: BASE_TIME + DAY_MS,
      });

      const updated = await fixture.admin.as.mutation(api.societyLiaison.updateDetails, {
        regulatory_item_id: itemId,
        sla_deadline: BASE_TIME + 5 * DAY_MS,
        escalation_notes: "  Police station backlog  ",
      });

      expect(updated).toMatchObject({
        sla_deadline: BASE_TIME + 5 * DAY_MS,
        escalation_notes: "Police station backlog",
      });
    });

    it.fails(
      "rejects a past sla_deadline the way createRegulatoryItem does (BUG-030)",
      async () => {
        const t = createTest();
        const fixture = await createClosureFixture(t);
        const itemId = await insertItem(t, fixture, {
          status: "IN_PROGRESS",
          slaDeadline: BASE_TIME + DAY_MS,
        });

        await expect(
          fixture.admin.as.mutation(api.societyLiaison.updateDetails, {
            regulatory_item_id: itemId,
            sla_deadline: BASE_TIME - DAY_MS,
          }),
        ).rejects.toThrow("SLA deadline cannot be in the past");
      },
    );
  });

  describe("auditSlaBreaches", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("marks past-deadline NOT_STARTED and IN_PROGRESS items OVERDUE and skips terminal, deleted and not-yet-due items", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);
      const past = BASE_TIME - 1;
      const ids = [
        await insertItem(t, fixture, { status: "NOT_STARTED", slaDeadline: past }),
        await insertItem(t, fixture, { status: "IN_PROGRESS", slaDeadline: past }),
        await insertItem(t, fixture, { status: "APPROVED", slaDeadline: past }),
        await insertItem(t, fixture, { status: "WAIVED", slaDeadline: past }),
        await insertItem(t, fixture, { status: "REJECTED", slaDeadline: past }),
        await insertItem(t, fixture, { status: "NOT_STARTED", slaDeadline: past, isDeleted: true }),
        await insertItem(t, fixture, { status: "NOT_STARTED", slaDeadline: BASE_TIME }),
      ];

      const result = await t.mutation(internal.societyLiaison.auditSlaBreaches, {});

      expect(result).toEqual({ count: 2, processed_at: BASE_TIME });
      expect(await readStatuses(t, ids)).toEqual([
        "OVERDUE",
        "OVERDUE",
        "APPROVED",
        "WAIVED",
        "REJECTED",
        "NOT_STARTED",
        "NOT_STARTED",
      ]);
    });

    it.fails(
      "leaves a SUBMITTED item that is awaiting the authority out of OVERDUE (BUG-031)",
      async () => {
        const t = createTest();
        const fixture = await createClosureFixture(t);
        const itemId = await insertItem(t, fixture, {
          status: "SUBMITTED",
          slaDeadline: BASE_TIME - DAY_MS,
        });

        await t.mutation(internal.societyLiaison.auditSlaBreaches, {});

        expect(await readStatuses(t, [itemId])).toEqual(["SUBMITTED"]);
      },
    );
  });

  describe("listOverdue and listAtRisk", () => {
    it("splits open items into overdue (deadline passed) and at-risk (due inside the window)", async () => {
      const t = createTest();
      const fixture = await createClosureFixture(t);
      const overdueOpen = await insertItem(t, fixture, {
        status: "IN_PROGRESS",
        slaDeadline: BASE_TIME - HOUR_MS,
      });
      await insertItem(t, fixture, { status: "APPROVED", slaDeadline: BASE_TIME - HOUR_MS });
      const dueSoon = await insertItem(t, fixture, {
        status: "NOT_STARTED",
        slaDeadline: BASE_TIME + 47 * HOUR_MS,
      });
      await insertItem(t, fixture, { status: "OVERDUE", slaDeadline: BASE_TIME + HOUR_MS });
      await insertItem(t, fixture, {
        status: "NOT_STARTED",
        slaDeadline: BASE_TIME + 48 * HOUR_MS,
      });

      const overdue = await fixture.admin.as.query(api.societyLiaison.listOverdue, {});
      const atRisk = await fixture.admin.as.query(api.societyLiaison.listAtRisk, {});

      expect(overdue.map((item) => item._id)).toEqual([overdueOpen]);
      expect(atRisk.map((item) => item._id)).toEqual([dueSoon]);
      await expect(
        fixture.admin.as.query(api.societyLiaison.listAtRisk, { hours_threshold: 0 }),
      ).rejects.toThrow("hours_threshold must be greater than 0");
    });
  });
});
