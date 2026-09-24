import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, TENANT_INQUIRY_STATUS, VISIT_STATUS, type UserType } from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { validateVisitTransition } from "./visits";

process.env.WORKOS_CLIENT_ID ??= "client_test_visits";
process.env.WORKOS_API_KEY ??= "sk_test_visits";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_visits";

await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const BASE_TIME = Date.UTC(2026, 1, 10, 4, 30, 0);
const HOUR_MS = 60 * 60 * 1000;

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
  const workosUserId = `workos_visits_${userType.toLowerCase()}_${sequence}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} user ${sequence}`,
      email: `${workosUserId}@example.com`,
      phone: `97${String(sequence).padStart(8, "0")}`,
      status: "ACTIVE",
      must_change_password: false,
    });
    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Visits role ${sequence}`,
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

// Society → building → VERIFIED lead → published listing, plus an admin who can
// create/edit/cancel visits and two guards stationed in the society.
async function createVisitFixture(t: TestBackend) {
  const admin = await createUser(t, "ADMIN", [
    PERMISSIONS.VISITS_CREATE,
    PERMISSIONS.VISITS_EDIT,
    PERMISSIONS.VISITS_CANCEL,
  ]);
  const societyId = await t.run(async (ctx) =>
    ctx.db.insert("societies", {
      name: "Visit Society",
      city: "Mumbai",
      status: "ACTIVE",
      created_by_admin_id: admin.userId,
    }),
  );
  const guard = await createGuard(t, societyId);
  const otherGuard = await createGuard(t, societyId);
  const ids = await t.run(async (ctx) => {
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower C",
      total_floors: 8,
      floor_labels: ["1", "2", "3"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "3",
      flat_number: "302",
      owner_phone: "9222200000",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: guard.userId,
      status: "VERIFIED",
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      slug: `visit-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 3_200_000,
      bhk_config: "2BHK",
      furnishing: "FULLY_FURNISHED",
      floor_number: "3",
      available_from: Date.now(),
      created_by_admin_id: admin.userId,
    });
    return { buildingId, leadId, listingId };
  });
  return { admin, guard, otherGuard, societyId, ...ids };
}

type VisitFixture = Awaited<ReturnType<typeof createVisitFixture>>;

async function scheduleVisit(fixture: VisitFixture, guardId?: Id<"users">) {
  return await fixture.admin.as.mutation(api.visits.create, {
    lead_id: fixture.leadId,
    scheduled_start: BASE_TIME + 2 * HOUR_MS,
    scheduled_end: BASE_TIME + 3 * HOUR_MS,
    assigned_guard_id: guardId ?? fixture.guard.userId,
  });
}

// Attaches a checklist instance in the given status to the visit. Only the
// non-aggregated checklist_instance_id field is written on the visit.
async function attachChecklist(
  t: TestBackend,
  fixture: VisitFixture,
  visitId: Id<"visits">,
  status: "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED",
) {
  return await t.run(async (ctx) => {
    const templateId = await ctx.db.insert("checklist_templates", {
      name: "Move-in inspection",
      depth: "LIGHT",
      is_active: true,
      is_deleted: false,
      sections: [],
    });
    const checklistId = await ctx.db.insert("checklist_instances", {
      template_id: templateId,
      visit_id: visitId,
      assigned_to: fixture.guard.userId,
      assigned_by: fixture.admin.userId,
      depth: "LIGHT",
      status,
      completeness_score: 0,
      responses: [],
      is_deleted: false,
    });
    await ctx.db.patch(visitId, { checklist_instance_id: checklistId });
    return checklistId;
  });
}

// A tenant inquiry sitting in VISIT_SCHEDULED, linked both ways to the visit.
async function linkScheduledInquiry(t: TestBackend, fixture: VisitFixture, visitId: Id<"visits">) {
  return await t.run(async (ctx) => {
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: fixture.listingId,
      tenant_name: "Visiting Tenant",
      tenant_phone: "9333300000",
      status: TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
      assigned_guard_id: fixture.guard.userId,
      visit_id: visitId,
    });
    await ctx.db.patch(visitId, { tenant_inquiry_id: inquiryId });
    return inquiryId;
  });
}

describe("visits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("validateVisitTransition", () => {
    it("allows exactly the forward edges of the visit state machine and nothing else", () => {
      const statuses = Object.values(VISIT_STATUS);
      const allowed = new Set([
        "ASSIGNED->CONFIRMED",
        "ASSIGNED->IN_PROGRESS",
        "ASSIGNED->CANCELLED",
        "ASSIGNED->NO_SHOW",
        "CONFIRMED->IN_PROGRESS",
        "CONFIRMED->CANCELLED",
        "CONFIRMED->NO_SHOW",
        "IN_PROGRESS->COMPLETED",
      ]);

      expect(statuses).toHaveLength(6);
      for (const from of statuses) {
        for (const to of statuses) {
          expect(validateVisitTransition(from, to), `${from}->${to}`).toBe(
            allowed.has(`${from}->${to}`),
          );
        }
      }
      expect(validateVisitTransition("RESCHEDULED", VISIT_STATUS.CONFIRMED)).toBe(false);
    });
  });

  describe("create", () => {
    it("schedules an ASSIGNED visit in the lead's society and links the lead's listing", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);

      const visitId = await scheduleVisit(fixture);

      const visit = await t.run(async (ctx) => ctx.db.get(visitId));
      expect(visit).toMatchObject({
        lead_id: fixture.leadId,
        society_id: fixture.societyId,
        listing_id: fixture.listingId,
        assigned_guard_id: fixture.guard.userId,
        status: VISIT_STATUS.ASSIGNED,
        needs_reassignment: false,
        created_by_admin_id: fixture.admin.userId,
      });
    });

    it("refuses an inverted window, a non-VERIFIED lead and a guard from another society", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const outsiderSocietyId = await t.run(async (ctx) =>
        ctx.db.insert("societies", {
          name: "Elsewhere",
          city: "Mumbai",
          status: "ACTIVE",
          created_by_admin_id: fixture.admin.userId,
        }),
      );
      const outsider = await createGuard(t, outsiderSocietyId);

      await expect(
        fixture.admin.as.mutation(api.visits.create, {
          lead_id: fixture.leadId,
          scheduled_start: BASE_TIME + HOUR_MS,
          scheduled_end: BASE_TIME + HOUR_MS,
          assigned_guard_id: fixture.guard.userId,
        }),
      ).rejects.toThrow("scheduled_start must be less than scheduled_end");

      await expect(scheduleVisit(fixture, outsider.userId)).rejects.toThrow(
        "Assigned field worker must belong to the same society as the lead",
      );

      await t.run(async (ctx) => ctx.db.patch(fixture.leadId, { status: "SUBMITTED" }));
      await expect(scheduleVisit(fixture)).rejects.toThrow(
        "Only VERIFIED leads can have visits scheduled",
      );
      expect(await t.run(async (ctx) => ctx.db.query("visits").collect())).toHaveLength(0);
    });
  });

  describe("start", () => {
    it("lets only the assigned guard start, stamping started_at and moving an ASSIGNED checklist to IN_PROGRESS", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      const checklistId = await attachChecklist(t, fixture, visitId, "ASSIGNED");

      await expect(
        fixture.otherGuard.as.mutation(api.visits.start, { id: visitId }),
      ).rejects.toThrow("You can only start visits assigned to you");

      vi.setSystemTime(BASE_TIME + 2 * HOUR_MS);
      const started = await fixture.guard.as.mutation(api.visits.start, { id: visitId });

      expect(started?.status).toBe(VISIT_STATUS.IN_PROGRESS);
      expect(started?.started_at).toBe(BASE_TIME + 2 * HOUR_MS);
      const checklist = await t.run(async (ctx) => ctx.db.get(checklistId));
      expect(checklist?.status).toBe("IN_PROGRESS");
      expect(checklist?.started_at).toBe(BASE_TIME + 2 * HOUR_MS);
    });
  });

  describe("complete", () => {
    it("refuses to complete a visit that was never started", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);

      await expect(
        fixture.guard.as.mutation(api.visits.complete, { id: visitId, outcome: "FOLLOWUP" }),
      ).rejects.toThrow("Cannot complete a visit with status: ASSIGNED");
    });

    it("refuses while the attached checklist is unsubmitted, then completes once it is SUBMITTED", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      const checklistId = await attachChecklist(t, fixture, visitId, "ASSIGNED");
      await fixture.guard.as.mutation(api.visits.start, { id: visitId });

      await expect(
        fixture.guard.as.mutation(api.visits.complete, { id: visitId, outcome: "NOT_INTERESTED" }),
      ).rejects.toThrow("Checklist must be submitted or approved before completing this visit.");
      expect((await t.run(async (ctx) => ctx.db.get(visitId)))?.status).toBe(
        VISIT_STATUS.IN_PROGRESS,
      );

      await t.run(async (ctx) => ctx.db.patch(checklistId, { status: "SUBMITTED" }));
      vi.setSystemTime(BASE_TIME + 3 * HOUR_MS);
      const completed = await fixture.guard.as.mutation(api.visits.complete, {
        id: visitId,
        outcome: "NOT_INTERESTED",
        outcome_notes: "  Budget too low  ",
      });

      expect(completed).toMatchObject({
        status: VISIT_STATUS.COMPLETED,
        outcome: "NOT_INTERESTED",
        outcome_notes: "Budget too low",
        completed_at: BASE_TIME + 3 * HOUR_MS,
      });
    });
  });

  describe("forceComplete", () => {
    // Characterisation of current behaviour, not an endorsement: a single visits.edit holder can skip the checklist gate with no reason or second approver; notes/features/37-dynamic-checklist-engine.md:864-865 plans to remove this path.
    it("currently completes an in-progress visit even though its checklist was never submitted (break-glass path)", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      const checklistId = await attachChecklist(t, fixture, visitId, "ASSIGNED");
      await fixture.guard.as.mutation(api.visits.start, { id: visitId });

      const completed = await fixture.admin.as.mutation(api.visits.forceComplete, {
        id: visitId,
        outcome: "FOLLOWUP",
      });

      expect(completed?.status).toBe(VISIT_STATUS.COMPLETED);
      expect(completed?.outcome).toBe("FOLLOWUP");
      const checklist = await t.run(async (ctx) => ctx.db.get(checklistId));
      expect(checklist?.status).toBe("IN_PROGRESS");
    });

    it("requires visits.edit: the assigned guard and an admin without it are rejected", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      await fixture.guard.as.mutation(api.visits.start, { id: visitId });
      const creatorOnly = await createUser(t, "ADMIN", [PERMISSIONS.VISITS_CREATE]);

      await expect(
        fixture.guard.as.mutation(api.visits.forceComplete, { id: visitId, outcome: "FOLLOWUP" }),
      ).rejects.toThrow("Admin or OPS access required");
      await expect(
        creatorOnly.as.mutation(api.visits.forceComplete, { id: visitId, outcome: "FOLLOWUP" }),
      ).rejects.toThrow("Missing permission: visits.edit");
      expect((await t.run(async (ctx) => ctx.db.get(visitId)))?.status).toBe(
        VISIT_STATUS.IN_PROGRESS,
      );
    });
  });

  describe("cancel and markNoShow", () => {
    it("cancel rolls a VISIT_SCHEDULED inquiry back to GUARD_ACCEPTED, clearing only its visit link", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      const inquiryId = await linkScheduledInquiry(t, fixture, visitId);

      const cancelled = await fixture.admin.as.mutation(api.visits.cancel, {
        id: visitId,
        reason: "  Tenant rescheduled  ",
      });

      expect(cancelled?.status).toBe(VISIT_STATUS.CANCELLED);
      expect(cancelled?.outcome_notes).toBe("Tenant rescheduled");
      const inquiry = await t.run(async (ctx) => ctx.db.get(inquiryId));
      expect(inquiry?.status).toBe(TENANT_INQUIRY_STATUS.GUARD_ACCEPTED);
      expect(inquiry?.visit_id).toBeUndefined();
      expect(inquiry?.assigned_guard_id).toBe(fixture.guard.userId);
    });

    it("markNoShow rolls the inquiry back but keeps a visit_id that points at a different visit", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      const newerVisitId = await scheduleVisit(fixture);
      const inquiryId = await linkScheduledInquiry(t, fixture, visitId);
      await t.run(async (ctx) => ctx.db.patch(inquiryId, { visit_id: newerVisitId }));

      await fixture.admin.as.mutation(api.visits.markNoShow, { id: visitId });

      const inquiry = await t.run(async (ctx) => ctx.db.get(inquiryId));
      expect(inquiry?.status).toBe(TENANT_INQUIRY_STATUS.GUARD_ACCEPTED);
      expect(inquiry?.visit_id).toBe(newerVisitId);
    });

    it("leaves an inquiry that has already moved past VISIT_SCHEDULED untouched", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      const inquiryId = await linkScheduledInquiry(t, fixture, visitId);
      await t.run(async (ctx) =>
        ctx.db.patch(inquiryId, { status: TENANT_INQUIRY_STATUS.VISIT_COMPLETED }),
      );

      await fixture.admin.as.mutation(api.visits.cancel, { id: visitId });

      const inquiry = await t.run(async (ctx) => ctx.db.get(inquiryId));
      expect(inquiry?.status).toBe(TENANT_INQUIRY_STATUS.VISIT_COMPLETED);
      expect(inquiry?.visit_id).toBe(visitId);
    });

    it("cancel needs visits.cancel (visits.edit alone is refused) and cannot touch a completed visit", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      const editor = await createUser(t, "ADMIN", [PERMISSIONS.VISITS_EDIT]);

      await expect(editor.as.mutation(api.visits.cancel, { id: visitId })).rejects.toThrow(
        "Missing permission: visits.cancel",
      );

      await fixture.guard.as.mutation(api.visits.start, { id: visitId });
      await fixture.guard.as.mutation(api.visits.complete, { id: visitId, outcome: "FOLLOWUP" });
      await expect(fixture.admin.as.mutation(api.visits.cancel, { id: visitId })).rejects.toThrow(
        "Cannot cancel a visit with status: COMPLETED",
      );
    });
  });

  describe("edit", () => {
    it("reassigning hands the attached checklist to the new guard and clears needs_reassignment", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      const checklistId = await attachChecklist(t, fixture, visitId, "ASSIGNED");
      await t.run(async (ctx) => ctx.db.patch(visitId, { needs_reassignment: true }));

      const edited = await fixture.admin.as.mutation(api.visits.edit, {
        id: visitId,
        assigned_guard_id: fixture.otherGuard.userId,
      });

      expect(edited?.assigned_guard_id).toBe(fixture.otherGuard.userId);
      expect(edited?.needs_reassignment).toBe(false);
      const checklist = await t.run(async (ctx) => ctx.db.get(checklistId));
      expect(checklist?.assigned_to).toBe(fixture.otherGuard.userId);
    });

    it("refuses to edit a visit in a terminal status", async () => {
      const t = createTest();
      const fixture = await createVisitFixture(t);
      const visitId = await scheduleVisit(fixture);
      await fixture.admin.as.mutation(api.visits.markNoShow, { id: visitId });

      await expect(
        fixture.admin.as.mutation(api.visits.edit, {
          id: visitId,
          scheduled_end: BASE_TIME + 5 * HOUR_MS,
        }),
      ).rejects.toThrow("Cannot edit a terminal visit with status: NO_SHOW");
    });
  });
});
