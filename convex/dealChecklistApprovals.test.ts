import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_TYPE,
  LEAD_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TENANT_INQUIRY_STATUS,
  USER_STATUS,
  type UserType,
} from "../lib/constants";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_deal_checklist_approvals";
process.env.WORKOS_API_KEY ??= "sk_test_deal_checklist_approvals";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_deal_checklist_approvals";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";
const T0 = Date.UTC(2026, 10, 2, 12, 0, 0);

type ChecklistItem = Doc<"deal_checklists">["items"][number];

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
  const workosUserId = `user_checklist_approvals_${userType.toLowerCase()}_${sequence}`;
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
        name: `Deal checklist role ${sequence}`,
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

function item(itemId: string, description: string, value: string): ChecklistItem {
  return {
    item_id: itemId,
    term_type: "CUSTOM",
    source: "ADMIN_ADDED",
    description,
    extracted_value: value,
    tenant_approval: { status: "PENDING" },
    owner_approval: { status: "PENDING" },
    overall_status: "UNREVIEWED",
  };
}

// Inquiry tenant + listing owner (owners.user_id) share a deal-room channel with a checklist.
async function createChecklistFixture(t: TestBackend, status: "SHARED" | "IN_REVIEW") {
  const admin = await createUser(t, "ADMIN", [
    PERMISSIONS.DEAL_CHECKLISTS_VIEW,
    PERMISSIONS.DEAL_CHECKLISTS_MANAGE,
  ]);
  const tenant = await createUser(t, "TENANT");
  const owner = await createUser(t, "OWNER");
  const stranger = await createUser(t, "TENANT");

  const checklistId = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("owners", {
      phone: `90${String(sequence).padStart(8, "0")}`,
      user_id: owner.userId,
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
      name: "Deal Room Society",
      city: "Noida",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower L",
      total_floors: 20,
      floor_labels: ["14"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "14",
      flat_number: "1402",
      owner_phone: "9010000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: admin.userId,
      status: LEAD_STATUS.VERIFIED,
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerId,
      slug: `deal-room-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 5_000_000,
      bhk_config: "3BHK",
      furnishing: "FULLY_FURNISHED",
      floor_number: "14",
      available_from: now,
      created_by_admin_id: admin.userId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenant.userId,
      tenant_name: "Deal Room Tenant",
      tenant_phone: "9010000002",
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    });
    const channelId = await ctx.db.insert("chat_channels", {
      inquiry_id: inquiryId,
      status: "ACTIVE",
      created_by_admin_id: admin.userId,
      created_at: now,
    });
    return await ctx.db.insert("deal_checklists", {
      inquiry_id: inquiryId,
      channel_id: channelId,
      version: 1,
      items: [
        item("rent", "Monthly rent", "₹50,000"),
        item("deposit", "Security deposit", "₹1,00,000"),
      ],
      status,
      created_by_admin_id: admin.userId,
      created_at: now,
      shared_at: now,
    });
  });

  return { admin, tenant, owner, stranger, checklistId };
}

type Fixture = Awaited<ReturnType<typeof createChecklistFixture>>;

function respond(
  caller: Fixture["tenant"],
  checklistId: Id<"deal_checklists">,
  itemId: string,
  response: "AGREED" | "DISAGREED" | "COMMENTED",
  comment?: string,
) {
  return caller.as.mutation(api.dealChecklistApprovals.respondToItem, {
    checklist_id: checklistId,
    item_id: itemId,
    response,
    comment,
  });
}

async function agreeAll(fixture: Fixture) {
  for (const party of [fixture.tenant, fixture.owner]) {
    await respond(party, fixture.checklistId, "rent", "AGREED");
    await respond(party, fixture.checklistId, "deposit", "AGREED");
  }
}

async function readChecklist(t: TestBackend, checklistId: Id<"deal_checklists">) {
  return await t.run(async (ctx) => await ctx.db.get(checklistId));
}

describe("dealChecklistApprovals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("respondToItem", () => {
    it("moves SHARED to IN_REVIEW on a first response and IN_REVIEW to DISPUTED on a disagreement", async () => {
      const t = createTestBackend();
      const fixture = await createChecklistFixture(t, "SHARED");

      const inReview = await respond(
        fixture.tenant,
        fixture.checklistId,
        "rent",
        "AGREED",
        "  ok ",
      );
      expect(inReview?.status).toBe("IN_REVIEW");
      expect(inReview?.items[0]?.tenant_approval).toEqual({
        status: "AGREED",
        responded_at: T0,
        comment: "ok",
      });
      expect(inReview?.items[0]?.overall_status).toBe("UNREVIEWED");

      const disputed = await respond(fixture.owner, fixture.checklistId, "deposit", "DISAGREED");
      expect(disputed?.status).toBe("DISPUTED");
      expect(disputed?.items.map((entry) => entry.overall_status)).toEqual([
        "UNREVIEWED",
        "DISPUTED",
      ]);
    });

    it("rejects an outsider and a repeat response while the parties' own responses are kept", async () => {
      const t = createTestBackend();
      const fixture = await createChecklistFixture(t, "IN_REVIEW");

      await expect(
        respond(fixture.stranger, fixture.checklistId, "rent", "AGREED"),
      ).rejects.toThrow("Not authorized for this checklist");
      await respond(fixture.owner, fixture.checklistId, "rent", "COMMENTED", "Can we discuss?");
      await expect(respond(fixture.owner, fixture.checklistId, "rent", "AGREED")).rejects.toThrow(
        "You have already responded to this checklist item",
      );

      const checklist = await readChecklist(t, fixture.checklistId);
      expect(checklist?.items[0]?.owner_approval.status).toBe("COMMENTED");
      expect(checklist?.items[0]?.overall_status).toBe("NEEDS_DISCUSSION");
      expect(checklist?.items[0]?.tenant_approval.status).toBe("PENDING");
    });
  });

  describe("signOff", () => {
    it("needs every item agreed by both parties; the second party's signature approves the checklist", async () => {
      const t = createTestBackend();
      const fixture = await createChecklistFixture(t, "IN_REVIEW");
      const signOff = (party: Fixture["tenant"]) =>
        party.as.mutation(api.dealChecklistApprovals.signOff, {
          checklist_id: fixture.checklistId,
        });

      await respond(fixture.tenant, fixture.checklistId, "rent", "AGREED");
      await respond(fixture.tenant, fixture.checklistId, "deposit", "AGREED");
      await respond(fixture.owner, fixture.checklistId, "rent", "AGREED");
      await expect(signOff(fixture.tenant)).rejects.toThrow(
        "All items must be agreed by both parties before signing",
      );

      await respond(fixture.owner, fixture.checklistId, "deposit", "AGREED");
      const tenantSignature = await signOff(fixture.tenant);
      expect(tenantSignature).toMatchObject({ signer_role: "TENANT", signed_at: T0 });
      expect(tenantSignature?.signature_hash).toMatch(/^[0-9a-f]{64}$/);
      expect((await readChecklist(t, fixture.checklistId))?.status).toBe("IN_REVIEW");
      await expect(signOff(fixture.tenant)).rejects.toThrow("Already signed.");

      const ownerSignature = await signOff(fixture.owner);
      expect(ownerSignature?.signature_hash).toBe(tenantSignature?.signature_hash);
      expect(await readChecklist(t, fixture.checklistId)).toMatchObject({
        status: "APPROVED",
        approved_at: T0,
      });
    });
  });

  describe("resolveDispute", () => {
    it("needs deal_checklists.manage, rewrites the value, resets both approvals and returns to IN_REVIEW", async () => {
      const t = createTestBackend();
      const fixture = await createChecklistFixture(t, "IN_REVIEW");
      const opsWithoutManage = await createUser(t, "OPS", [PERMISSIONS.DEAL_CHECKLISTS_VIEW]);
      await respond(fixture.tenant, fixture.checklistId, "deposit", "DISAGREED", "Too high");
      const resolve = (caller: Fixture["admin"]) =>
        caller.as.mutation(api.dealChecklistApprovals.resolveDispute, {
          checklist_id: fixture.checklistId,
          item_id: "deposit",
          resolved_value: " ₹80,000 ",
          resolution_notes: "Owner agreed to reduce",
        });

      await expect(resolve(opsWithoutManage)).rejects.toThrow(
        "Missing permission: deal_checklists.manage",
      );
      const resolved = await resolve(fixture.admin);

      expect(resolved?.status).toBe("IN_REVIEW");
      expect(resolved?.items[1]).toMatchObject({
        admin_edited_value: "₹80,000",
        overall_status: "UNREVIEWED",
        tenant_approval: { status: "PENDING", comment: "Owner agreed to reduce" },
        owner_approval: { status: "PENDING", comment: "Owner agreed to reduce" },
      });
      const reanswered = await respond(fixture.tenant, fixture.checklistId, "deposit", "AGREED");
      expect(reanswered?.items[1]?.tenant_approval.status).toBe("AGREED");
    });
  });

  describe("getChecklistForParty", () => {
    it("redacts the other party's responses until both have signed off", async () => {
      const t = createTestBackend();
      const fixture = await createChecklistFixture(t, "IN_REVIEW");
      await agreeAll(fixture);
      const view = () =>
        fixture.tenant.as.query(api.dealChecklistApprovals.getChecklistForParty, {
          checklist_id: fixture.checklistId,
        });

      const before = await view();
      expect(before?.current_party_role).toBe("TENANT");
      expect(before?.items[0]?.owner_approval).toEqual({ status: "PENDING" });
      expect(before?.items[0]?.tenant_approval.status).toBe("AGREED");

      for (const party of [fixture.tenant, fixture.owner]) {
        await party.as.mutation(api.dealChecklistApprovals.signOff, {
          checklist_id: fixture.checklistId,
        });
      }

      const after = await view();
      expect(after?.items[0]?.owner_approval).toMatchObject({ status: "AGREED", responded_at: T0 });
      await expect(
        fixture.stranger.as.query(api.dealChecklistApprovals.getChecklistForParty, {
          checklist_id: fixture.checklistId,
        }),
      ).rejects.toThrow("Not authorized for this checklist");
    });
  });
});
