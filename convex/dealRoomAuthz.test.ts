import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_TYPE,
  LEAD_STATUS,
  NEGOTIATION_ROOM_TYPE,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  SOCIETY_STATUS,
  TENANT_INQUIRY_STATUS,
  USER_STATUS,
  USER_TYPE,
  type UserType,
} from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_deal_room_authz";
process.env.WORKOS_API_KEY ??= "sk_test_deal_room_authz";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_deal_room_authz";
process.env.CONVEX_DISABLE_SCHEDULER_SIDE_EFFECTS ??= "1";

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const WORKOS_ISSUER = "https://api.workos.com/";

const IDENTITIES = {
  admin: "user_deal_room_admin",
  opsWithoutPermissions: "user_deal_room_ops_no_perms",
  opsAgent: "user_deal_room_ops_agent",
  multiPersonaStaff: "user_deal_room_multi_persona_staff",
  tenant: "user_deal_room_tenant",
  owner: "user_deal_room_owner",
  guard: "user_deal_room_guard",
  otherGuard: "user_deal_room_other_guard",
} as const;

type IdentityName = keyof typeof IDENTITIES;

function createTestBackend() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

type TestBackend = ReturnType<typeof createTestBackend>;

async function createDealRoomFixture(t: TestBackend) {
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const insertUser = (
      workosUserId: string,
      userType: UserType,
      extra: { user_types?: UserType[]; active_persona?: UserType } = {},
    ) =>
      ctx.db.insert("users", {
        workos_user_id: workosUserId,
        user_type: userType,
        name: `Test ${workosUserId}`,
        email: `${workosUserId}@example.com`,
        status: USER_STATUS.ACTIVE,
        must_change_password: false,
        ...extra,
      });

    const adminId = await insertUser(IDENTITIES.admin, USER_TYPE.ADMIN);
    await insertUser(IDENTITIES.opsWithoutPermissions, USER_TYPE.OPS);
    const opsAgentId = await insertUser(IDENTITIES.opsAgent, USER_TYPE.OPS);
    // Legacy primary type TENANT, but also holds the OPS persona and no chat/checklist role.
    const multiPersonaStaffId = await insertUser(IDENTITIES.multiPersonaStaff, USER_TYPE.TENANT, {
      user_types: [USER_TYPE.TENANT, USER_TYPE.OPS],
      active_persona: USER_TYPE.OPS,
    });
    // The inquiry's tenant also holds the OWNER persona (for some other property).
    const tenantId = await insertUser(IDENTITIES.tenant, USER_TYPE.TENANT, {
      user_types: [USER_TYPE.TENANT, USER_TYPE.OWNER],
      active_persona: USER_TYPE.TENANT,
    });
    const ownerUserId = await insertUser(IDENTITIES.owner, USER_TYPE.OWNER);
    const guardId = await insertUser(IDENTITIES.guard, USER_TYPE.GUARD);
    await insertUser(IDENTITIES.otherGuard, USER_TYPE.GUARD);

    const grant = async (userId: Id<"users">, name: string, permissions: string[]) => {
      const roleId = await ctx.db.insert("roles", {
        name,
        permissions,
        is_system_role: false,
        is_deleted: false,
      });
      await ctx.db.insert("user_role_assignments", {
        user_id: userId,
        role_id: roleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });
    };

    await grant(adminId, "Deal room admin", [
      PERMISSIONS.CHAT_VIEW,
      PERMISSIONS.CHAT_SEND,
      PERMISSIONS.DEAL_CHECKLISTS_VIEW,
    ]);
    await grant(opsAgentId, "Deal room agent", [PERMISSIONS.CHAT_VIEW, PERMISSIONS.CHAT_SEND]);

    const societyId = await ctx.db.insert("societies", {
      name: "Synthetic Society",
      city: "Mumbai",
      status: SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: adminId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower A",
      total_floors: 10,
      floor_labels: ["G", "1", "2"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "2",
      flat_number: "201",
      owner_phone: "9876543210",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: guardId,
      status: LEAD_STATUS.VERIFIED,
    });
    const ownerRecordId = await ctx.db.insert("owners", {
      phone: "9876543210",
      name: "Synthetic Owner",
      user_id: ownerUserId,
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
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerRecordId,
      slug: "synthetic-deal-room-2bhk",
      status: "PUBLISHED",
      rent_monthly: 3_000_000,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "2",
      available_from: now,
      created_by_admin_id: adminId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_id: tenantId,
      tenant_name: "Synthetic Tenant",
      tenant_phone: "9123456780",
      status: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    });

    const negotiationId = await ctx.db.insert("negotiations", {
      tenant_inquiry_id: inquiryId,
      listing_id: listingId,
      tenant_user_id: tenantId,
      owner_user_id: ownerUserId,
      initiated_by_admin_id: adminId,
      status: NEGOTIATION_STATUS.ACTIVE,
      initiated_at: now,
      last_activity_at: now,
      stale_flagged: false,
      rounds_flagged: false,
      is_deleted: false,
    });

    const insertChannel = (channelType: "OPS_TENANT" | "OPS_OWNER" | "COMBINED", offset: number) =>
      ctx.db.insert("chat_channels", {
        inquiry_id: inquiryId,
        channel_type: channelType,
        negotiation_id: negotiationId,
        status: "ACTIVE",
        created_by_admin_id: adminId,
        created_at: now + offset,
      });

    // The OPS_OWNER room is the newest, so a persona-based filter would pick it first.
    const opsTenantRoomId = await insertChannel(NEGOTIATION_ROOM_TYPE.OPS_TENANT, 0);
    const combinedRoomId = await insertChannel(NEGOTIATION_ROOM_TYPE.COMBINED, 1);
    const opsOwnerRoomId = await insertChannel(NEGOTIATION_ROOM_TYPE.OPS_OWNER, 2);
    await ctx.db.patch(negotiationId, {
      ops_tenant_channel_id: opsTenantRoomId,
      ops_owner_channel_id: opsOwnerRoomId,
      combined_channel_id: combinedRoomId,
    });

    const ownerRoomMessageId = await ctx.db.insert("chat_messages", {
      channel_id: opsOwnerRoomId,
      sender_user_id: ownerUserId,
      sender_role: "OWNER",
      original_content: "My lowest acceptable rent is 28k.",
      masked_content: "My lowest acceptable rent is 28k.",
      status: "DELIVERED",
      admin_review_required: false,
      is_ai_processed: true,
      created_at: now,
      delivered_at: now,
    });

    const templateSections = [
      {
        section_id: "entry",
        title: "Entry",
        items: [
          {
            item_id: "door",
            label: "Main door condition",
            item_type: "CHECKBOX" as const,
            is_required: true,
            requires_photo: false,
            min_depth: "LIGHT" as const,
          },
        ],
      },
    ];
    const assignedTemplateId = await ctx.db.insert("checklist_templates", {
      name: "Assigned inspection",
      depth: "LIGHT",
      is_active: true,
      is_deleted: false,
      sections: templateSections,
    });
    const unassignedTemplateId = await ctx.db.insert("checklist_templates", {
      name: "Unassigned inspection",
      depth: "FULL",
      is_active: true,
      is_deleted: false,
      sections: templateSections,
    });
    const visitId = await ctx.db.insert("visits", {
      lead_id: leadId,
      society_id: societyId,
      listing_id: listingId,
      scheduled_start: now,
      scheduled_end: now + 60 * 60 * 1000,
      assigned_guard_id: guardId,
      status: "ASSIGNED",
      created_by_admin_id: adminId,
    });
    const checklistInstanceId = await ctx.db.insert("checklist_instances", {
      template_id: assignedTemplateId,
      visit_id: visitId,
      assigned_to: guardId,
      assigned_by: adminId,
      depth: "LIGHT",
      status: "ASSIGNED",
      completeness_score: 0,
      responses: [],
      is_deleted: false,
    });

    return {
      adminId,
      multiPersonaStaffId,
      tenantId,
      ownerUserId,
      listingId,
      inquiryId,
      opsTenantRoomId,
      opsOwnerRoomId,
      combinedRoomId,
      ownerRoomMessageId,
      assignedTemplateId,
      unassignedTemplateId,
      checklistInstanceId,
    };
  });

  const as = (name: IdentityName) =>
    t.withIdentity({ subject: IDENTITIES[name], issuer: WORKOS_ISSUER });

  return { ...ids, as };
}

async function setActivePersona(t: TestBackend, userId: Id<"users">, persona: UserType) {
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, { active_persona: persona });
  });
}

async function grantPermissions(
  t: TestBackend,
  userId: Id<"users">,
  grantedById: Id<"users">,
  permissions: string[],
) {
  await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: `Granted ${permissions.join(",")}`,
      permissions,
      is_system_role: false,
      is_deleted: false,
    });
    await ctx.db.insert("user_role_assignments", {
      user_id: userId,
      role_id: roleId,
      assigned_by_admin_id: grantedById,
      is_deleted: false,
    });
  });
}

async function insertDealChecklist(
  t: TestBackend,
  fixture: Fixture,
  status: "DRAFT" | "SHARED",
  version = 1,
): Promise<Id<"deal_checklists">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("deal_checklists", {
      inquiry_id: fixture.inquiryId,
      channel_id: fixture.combinedRoomId,
      version,
      items: [
        {
          item_id: `item-${version}`,
          term_type: "RENT_AMOUNT",
          source: "ADMIN_ADDED",
          description: "Monthly rent",
          extracted_value: "30000",
          tenant_approval: { status: "PENDING" },
          owner_approval: { status: "PENDING" },
          overall_status: "UNREVIEWED",
        },
      ],
      status,
      created_by_admin_id: fixture.adminId,
      created_at: now + version,
    });
  });
}

async function readSenderRoles(t: TestBackend, messageIds: Id<"chat_messages">[]) {
  return await t.run(async (ctx) => {
    const messages = await Promise.all(messageIds.map((id) => ctx.db.get(id)));
    return messages.map((message) => message?.sender_role);
  });
}

type Fixture = Awaited<ReturnType<typeof createDealRoomFixture>>;

const PAGE = { numItems: 20, cursor: null };

describe("deal-room chat access is decided by the caller's role in the inquiry, not active_persona", () => {
  beforeEach(() => {
    // chatMessages.send schedules AI batching; never let those jobs (or their provider call) run.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a tenant who switches to their OWNER persona from the ops-owner room of their own inquiry", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    await setActivePersona(t, fixture.tenantId, USER_TYPE.OWNER);
    const attacker = fixture.as("tenant");

    await expect(
      attacker.query(api.chatChannels.getById, { id: fixture.opsOwnerRoomId }),
    ).rejects.toThrow();
    await expect(
      attacker.query(api.chatMessages.listByChannel, {
        channel_id: fixture.opsOwnerRoomId,
        paginationOpts: PAGE,
      }),
    ).rejects.toThrow();
    await expect(
      attacker.query(api.chatMessages.getById, { id: fixture.ownerRoomMessageId }),
    ).rejects.toThrow();
    await expect(
      attacker.mutation(api.chatMessages.send, {
        channel_id: fixture.opsOwnerRoomId,
        content: "Posting into the owner's private room",
      }),
    ).rejects.toThrow();

    const selected = await attacker.query(api.chatChannels.getByInquiryId, {
      inquiry_id: fixture.inquiryId,
    });
    expect(selected?.channel_type).not.toBe(NEGOTIATION_ROOM_TYPE.OPS_OWNER);
    expect([NEGOTIATION_ROOM_TYPE.OPS_TENANT, NEGOTIATION_ROOM_TYPE.COMBINED]).toContain(
      selected?.channel_type,
    );

    const ownerRoomMessages = await t.run(async (ctx) =>
      ctx.db
        .query("chat_messages")
        .withIndex("by_channel_and_created", (q) => q.eq("channel_id", fixture.opsOwnerRoomId))
        .collect(),
    );
    expect(ownerRoomMessages).toHaveLength(1);
  });

  it("labels a persona-switched tenant's message in the shared room as TENANT, never OWNER", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    await setActivePersona(t, fixture.tenantId, USER_TYPE.OWNER);

    const messageId = await fixture.as("tenant").mutation(api.chatMessages.send, {
      channel_id: fixture.combinedRoomId,
      content: "Speaking as the owner, I accept 25k",
    });

    expect(await readSenderRoles(t, [messageId])).toEqual(["TENANT"]);
  });

  it("keeps the tenant in the ops-tenant and shared rooms and out of the ops-owner room", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    const tenant = fixture.as("tenant");

    for (const roomId of [fixture.opsTenantRoomId, fixture.combinedRoomId]) {
      const room = await tenant.query(api.chatChannels.getById, { id: roomId });
      expect(room?._id).toBe(roomId);
      await tenant.query(api.chatMessages.listByChannel, {
        channel_id: roomId,
        paginationOpts: PAGE,
      });
    }

    const sent = [
      await tenant.mutation(api.chatMessages.send, {
        channel_id: fixture.opsTenantRoomId,
        content: "Can we move in on the 1st?",
      }),
      await tenant.mutation(api.chatMessages.send, {
        channel_id: fixture.combinedRoomId,
        content: "Happy with the terms",
      }),
    ];
    expect(await readSenderRoles(t, sent)).toEqual(["TENANT", "TENANT"]);

    await expect(
      tenant.query(api.chatChannels.getById, { id: fixture.opsOwnerRoomId }),
    ).rejects.toThrow("Access denied");

    const forTenant = await tenant.query(api.chatChannels.getByInquiryForTenant, {
      inquiry_id: fixture.inquiryId,
    });
    expect(forTenant?._id).toBe(fixture.combinedRoomId);
  });

  it("keeps the listing owner in the ops-owner and shared rooms and out of the ops-tenant room", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    const owner = fixture.as("owner");

    for (const roomId of [fixture.opsOwnerRoomId, fixture.combinedRoomId]) {
      const room = await owner.query(api.chatChannels.getById, { id: roomId });
      expect(room?._id).toBe(roomId);
      await owner.query(api.chatMessages.listByChannel, {
        channel_id: roomId,
        paginationOpts: PAGE,
      });
    }
    const ownMessage = await owner.query(api.chatMessages.getById, {
      id: fixture.ownerRoomMessageId,
    });
    expect(ownMessage?._id).toBe(fixture.ownerRoomMessageId);

    const sent = [
      await owner.mutation(api.chatMessages.send, {
        channel_id: fixture.opsOwnerRoomId,
        content: "I can do 29k",
      }),
      await owner.mutation(api.chatMessages.send, {
        channel_id: fixture.combinedRoomId,
        content: "Welcome aboard",
      }),
    ];
    expect(await readSenderRoles(t, sent)).toEqual(["OWNER", "OWNER"]);

    await expect(
      owner.query(api.chatChannels.getById, { id: fixture.opsTenantRoomId }),
    ).rejects.toThrow("Access denied");

    const selected = await owner.query(api.chatChannels.getByInquiryId, {
      inquiry_id: fixture.inquiryId,
    });
    expect(selected?._id).toBe(fixture.opsOwnerRoomId);
  });

  it("lets a listing owner who also holds the TENANT persona reach their owner room under either persona", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.ownerUserId, {
        user_types: [USER_TYPE.OWNER, USER_TYPE.TENANT],
        active_persona: USER_TYPE.TENANT,
      });
    });
    const owner = fixture.as("owner");

    const room = await owner.query(api.chatChannels.getById, { id: fixture.opsOwnerRoomId });
    expect(room?._id).toBe(fixture.opsOwnerRoomId);
    const messageId = await owner.mutation(api.chatMessages.send, {
      channel_id: fixture.combinedRoomId,
      content: "Still the owner here",
    });
    expect(await readSenderRoles(t, [messageId])).toEqual(["OWNER"]);
    await expect(
      owner.query(api.chatChannels.getById, { id: fixture.opsTenantRoomId }),
    ).rejects.toThrow();
  });

  it("limits a user who is both the tenant and the listing owner to the shared room", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const selfOwnerId = await ctx.db.insert("owners", {
        phone: "9123456780",
        user_id: fixture.tenantId,
        source: "OPS_CREATED",
        active_properties_count: 1,
        total_leads_count: 0,
        total_closures_count: 0,
        lifecycle_stage: "ACTIVE",
        lifecycle_updated_at: now,
        first_seen_at: now,
        last_activity_at: now,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      });
      await ctx.db.patch(fixture.listingId, { owner_id: selfOwnerId });
    });

    for (const persona of [USER_TYPE.TENANT, USER_TYPE.OWNER]) {
      await setActivePersona(t, fixture.tenantId, persona);
      const dualParty = fixture.as("tenant");

      const shared = await dualParty.query(api.chatChannels.getById, {
        id: fixture.combinedRoomId,
      });
      expect(shared?._id).toBe(fixture.combinedRoomId);
      await expect(
        dualParty.query(api.chatChannels.getById, { id: fixture.opsTenantRoomId }),
      ).rejects.toThrow();
      await expect(
        dualParty.query(api.chatChannels.getById, { id: fixture.opsOwnerRoomId }),
      ).rejects.toThrow();

      const selected = await dualParty.query(api.chatChannels.getByInquiryId, {
        inquiry_id: fixture.inquiryId,
      });
      expect(selected?._id).toBe(fixture.combinedRoomId);

      const messageId = await dualParty.mutation(api.chatMessages.send, {
        channel_id: fixture.combinedRoomId,
        content: `Posting as ${persona}`,
      });
      expect(await readSenderRoles(t, [messageId])).toEqual([persona]);
    }
  });

  it("requires chat.view for backoffice monitoring and chat.send for backoffice posting", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);

    const unprivileged = fixture.as("opsWithoutPermissions");
    await expect(
      unprivileged.query(api.chatChannels.getById, { id: fixture.opsOwnerRoomId }),
    ).rejects.toThrow("Missing permission: chat.view");
    await expect(
      unprivileged.query(api.chatMessages.listByChannel, {
        channel_id: fixture.opsTenantRoomId,
        paginationOpts: PAGE,
      }),
    ).rejects.toThrow("Missing permission: chat.view");
    await expect(
      unprivileged.mutation(api.chatMessages.send, {
        channel_id: fixture.opsTenantRoomId,
        content: "hello",
      }),
    ).rejects.toThrow("Missing permission: chat.send");

    const staffWithoutRole = fixture.as("multiPersonaStaff");
    await expect(
      staffWithoutRole.query(api.chatChannels.getById, { id: fixture.opsOwnerRoomId }),
    ).rejects.toThrow("Missing permission: chat.view");

    const agent = fixture.as("opsAgent");
    for (const roomId of [
      fixture.opsTenantRoomId,
      fixture.opsOwnerRoomId,
      fixture.combinedRoomId,
    ]) {
      const room = await agent.query(api.chatChannels.getById, { id: roomId });
      expect(room?._id).toBe(roomId);
    }
    const monitored = await agent.query(api.chatMessages.listByChannel, {
      channel_id: fixture.opsOwnerRoomId,
      paginationOpts: PAGE,
    });
    expect(monitored.page).toHaveLength(1);
    const messageId = await agent.mutation(api.chatMessages.send, {
      channel_id: fixture.opsOwnerRoomId,
      content: "Noted, will relay",
    });
    expect(await readSenderRoles(t, [messageId])).toEqual(["OPS"]);

    const admin = fixture.as("admin");
    const newest = await admin.query(api.chatChannels.getByInquiryId, {
      inquiry_id: fixture.inquiryId,
    });
    expect(newest?._id).toBe(fixture.opsOwnerRoomId);
  });
});

describe("dealChecklists reads require deal_checklists.view for backoffice callers", () => {
  it("rejects a multi-persona staff member without the permission on getByInquiry and getById", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    const staff = fixture.as("multiPersonaStaff");

    await insertDealChecklist(t, fixture, "SHARED", 1);
    await expect(
      staff.query(api.dealChecklists.getByInquiry, { inquiry_id: fixture.inquiryId }),
    ).rejects.toThrow("Missing permission: deal_checklists.view");

    const draftId = await insertDealChecklist(t, fixture, "DRAFT", 2);
    await expect(
      staff.query(api.dealChecklists.getById, { checklist_id: draftId }),
    ).rejects.toThrow("Missing permission: deal_checklists.view");

    await expect(
      fixture.as("opsWithoutPermissions").query(api.dealChecklists.getById, {
        checklist_id: draftId,
      }),
    ).rejects.toThrow("Missing permission: deal_checklists.view");
  });

  it("gives a backoffice caller holding the permission the draft as well as shared versions", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    await grantPermissions(t, fixture.multiPersonaStaffId, fixture.adminId, [
      PERMISSIONS.DEAL_CHECKLISTS_VIEW,
    ]);
    const draftId = await insertDealChecklist(t, fixture, "DRAFT", 1);

    const staff = fixture.as("multiPersonaStaff");
    expect((await staff.query(api.dealChecklists.getById, { checklist_id: draftId }))?._id).toBe(
      draftId,
    );
    expect(
      (await staff.query(api.dealChecklists.getByInquiry, { inquiry_id: fixture.inquiryId }))?._id,
    ).toBe(draftId);
    expect(
      (await fixture.as("admin").query(api.dealChecklists.getById, { checklist_id: draftId }))?._id,
    ).toBe(draftId);
  });

  it("keeps participant access: tenant and owner see shared checklists but not drafts", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    const draftId = await insertDealChecklist(t, fixture, "DRAFT", 1);

    for (const party of ["tenant", "owner"] as const) {
      const caller = fixture.as(party);
      expect(await caller.query(api.dealChecklists.getById, { checklist_id: draftId })).toBeNull();
      expect(
        await caller.query(api.dealChecklists.getByInquiry, { inquiry_id: fixture.inquiryId }),
      ).toBeNull();
    }

    const sharedId = await insertDealChecklist(t, fixture, "SHARED", 2);
    for (const party of ["tenant", "owner"] as const) {
      const caller = fixture.as(party);
      expect(
        (await caller.query(api.dealChecklists.getById, { checklist_id: sharedId }))?._id,
      ).toBe(sharedId);
      expect(
        (await caller.query(api.dealChecklists.getByInquiry, { inquiry_id: fixture.inquiryId }))
          ?._id,
      ).toBe(sharedId);
    }

    await expect(
      fixture.as("guard").query(api.dealChecklists.getById, { checklist_id: sharedId }),
    ).rejects.toThrow();
  });
});

describe("checklistTemplates.getById for the guard checklist screen", () => {
  it("lets a guard load the template of a checklist assigned to them", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);
    const guard = fixture.as("guard");

    const instance = await guard.query(api.checklists.getById, {
      checklist_id: fixture.checklistInstanceId,
    });
    const template = await guard.query(api.checklistTemplates.getById, {
      id: instance.template_id,
    });
    expect(template?._id).toBe(fixture.assignedTemplateId);
  });

  it("does not widen template reads beyond the guard's own assignments", async () => {
    const t = createTestBackend();
    const fixture = await createDealRoomFixture(t);

    await expect(
      fixture.as("guard").query(api.checklistTemplates.getById, {
        id: fixture.unassignedTemplateId,
      }),
    ).rejects.toThrow();
    await expect(
      fixture.as("otherGuard").query(api.checklistTemplates.getById, {
        id: fixture.assignedTemplateId,
      }),
    ).rejects.toThrow();
    await expect(
      fixture.as("tenant").query(api.checklistTemplates.getById, {
        id: fixture.assignedTemplateId,
      }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.checklistInstanceId, { is_deleted: true });
    });
    await expect(
      fixture.as("guard").query(api.checklistTemplates.getById, {
        id: fixture.assignedTemplateId,
      }),
    ).rejects.toThrow();

    const viaBackoffice = await fixture.as("opsAgent").query(api.checklistTemplates.getById, {
      id: fixture.unassignedTemplateId,
    });
    expect(viaBackoffice?._id).toBe(fixture.unassignedTemplateId);
  });
});
