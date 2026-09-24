import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, TENANT_INQUIRY_STATUS, type UserType } from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_owner_invites";
process.env.WORKOS_API_KEY ??= "sk_test_owner_invites";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_owner_invites";

await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

const BASE_TIME = Date.UTC(2026, 0, 15, 6, 0, 0);
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

async function createUser(
  t: TestBackend,
  userType: UserType,
  permissions: string[] = [],
  email?: string,
) {
  sequence += 1;
  const workosUserId = `workos_invites_${userType.toLowerCase()}_${sequence}`;
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} user ${sequence}`,
      email: email ?? `${workosUserId}@example.com`,
      status: "ACTIVE",
      must_change_password: false,
    });
    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Invite role ${sequence}`,
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

// Society → building → lead → listing (owned) → inquiry → deal-room channel.
async function createInviteFixture(
  t: TestBackend,
  options: {
    inquiryStatus?: (typeof TENANT_INQUIRY_STATUS)[keyof typeof TENANT_INQUIRY_STATUS];
    ownerUserId?: Id<"users">;
  } = {},
) {
  const admin = await createUser(t, "ADMIN", [PERMISSIONS.OWNER_INVITES_MANAGE]);
  const ids = await t.run(async (ctx) => {
    const guardId = await ctx.db.insert("users", {
      workos_user_id: `workos_invites_submitter_${sequence}`,
      user_type: "GUARD",
      name: "Submitting guard",
      status: "ACTIVE",
      must_change_password: false,
    });
    const societyId = await ctx.db.insert("societies", {
      name: "Invite Society",
      city: "Pune",
      status: "ACTIVE",
      created_by_admin_id: admin.userId,
    });
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower B",
      total_floors: 12,
      floor_labels: ["1", "2", "3"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const now = Date.now();
    const ownerId = await ctx.db.insert("owners", {
      phone: "9000011111",
      name: "Listing Owner",
      user_id: options.ownerUserId,
      source: "GUARD_LEAD",
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
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "2",
      flat_number: "204",
      owner_phone: "9000011111",
      owner_id: ownerId,
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: guardId,
      status: "VERIFIED",
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      owner_id: ownerId,
      slug: `invite-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 2_800_000,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "2",
      available_from: now,
      created_by_admin_id: admin.userId,
    });
    const inquiryId = await ctx.db.insert("tenant_inquiries", {
      listing_id: listingId,
      tenant_name: "Prospective Tenant",
      tenant_phone: "9123400000",
      status: options.inquiryStatus ?? TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
    });
    const channelId = await ctx.db.insert("chat_channels", {
      inquiry_id: inquiryId,
      channel_type: "OPS_OWNER",
      status: "ACTIVE",
      created_by_admin_id: admin.userId,
      created_at: now,
    });
    return { ownerId, listingId, inquiryId, channelId };
  });
  return { admin, ...ids };
}

async function insertPendingInvite(
  t: TestBackend,
  fixture: Awaited<ReturnType<typeof createInviteFixture>>,
  fields: { token: string; expiresAt: number; expectedEmail?: string },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("owner_invites", {
      inquiry_id: fixture.inquiryId,
      channel_id: fixture.channelId,
      invite_token: fields.token,
      owner_expected_email: fields.expectedEmail,
      status: "PENDING",
      expires_at: fields.expiresAt,
      created_by_admin_id: fixture.admin.userId,
      created_at: Date.now(),
    }),
  );
}

describe("ownerInvites", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("generateInvite", () => {
    it("creates a PENDING invite expiring after the default 7 days with a lower-cased expected email", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);

      const invite = await fixture.admin.as.mutation(api.ownerInvites.generateInvite, {
        inquiry_id: fixture.inquiryId,
        channel_id: fixture.channelId,
        owner_expected_email: "  Owner@Example.COM ",
      });

      expect(invite.status).toBe("PENDING");
      expect(invite.expires_at).toBe(BASE_TIME + 7 * DAY_MS);
      expect(invite.owner_expected_email).toBe("owner@example.com");
      expect(invite.invite_token).toMatch(/^[0-9a-f-]{36}$/);
      expect(invite.created_by_admin_id).toBe(fixture.admin.userId);
    });

    it("takes the expiry from the chat_owner_invite_expiry_days config row", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      await t.run(async (ctx) => {
        await ctx.db.insert("system_config", {
          key: "chat_owner_invite_expiry_days",
          value: "3",
          updated_by_admin_id: fixture.admin.userId,
        });
      });

      const invite = await fixture.admin.as.mutation(api.ownerInvites.generateInvite, {
        inquiry_id: fixture.inquiryId,
        channel_id: fixture.channelId,
      });

      expect(invite.expires_at).toBe(BASE_TIME + 3 * DAY_MS);
    });

    it("refuses a second invite while one is live, but expires a lapsed pending invite and issues a new one", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      await fixture.admin.as.mutation(api.ownerInvites.generateInvite, {
        inquiry_id: fixture.inquiryId,
        channel_id: fixture.channelId,
      });

      await expect(
        fixture.admin.as.mutation(api.ownerInvites.generateInvite, {
          inquiry_id: fixture.inquiryId,
          channel_id: fixture.channelId,
        }),
      ).rejects.toThrow("A pending owner invite already exists for this inquiry");

      vi.setSystemTime(BASE_TIME + 7 * DAY_MS);
      const replacement = await fixture.admin.as.mutation(api.ownerInvites.generateInvite, {
        inquiry_id: fixture.inquiryId,
        channel_id: fixture.channelId,
      });

      const statuses = await t.run(async (ctx) =>
        (await ctx.db.query("owner_invites").collect()).map((row) => [row._id, row.status]),
      );
      expect(statuses).toHaveLength(2);
      expect(Object.fromEntries(statuses)[replacement._id]).toBe("PENDING");
      expect(statuses.filter(([, status]) => status === "EXPIRED")).toHaveLength(1);
    });

    it("rejects a channel that belongs to another inquiry", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const otherChannelId = await t.run(async (ctx) => {
        const otherInquiryId = await ctx.db.insert("tenant_inquiries", {
          listing_id: fixture.listingId,
          tenant_name: "Someone Else",
          tenant_phone: "9123400001",
          status: TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
        });
        return await ctx.db.insert("chat_channels", {
          inquiry_id: otherInquiryId,
          status: "ACTIVE",
          created_by_admin_id: fixture.admin.userId,
          created_at: Date.now(),
        });
      });

      await expect(
        fixture.admin.as.mutation(api.ownerInvites.generateInvite, {
          inquiry_id: fixture.inquiryId,
          channel_id: otherChannelId,
        }),
      ).rejects.toThrow("Channel does not belong to this inquiry");
    });

    it("rejects a backoffice caller without owner_invites.manage while a manager still succeeds", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const viewer = await createUser(t, "ADMIN", [PERMISSIONS.LISTINGS_VIEW]);

      await expect(
        viewer.as.mutation(api.ownerInvites.generateInvite, {
          inquiry_id: fixture.inquiryId,
          channel_id: fixture.channelId,
        }),
      ).rejects.toThrow("Missing permission: owner_invites.manage");

      const invite = await fixture.admin.as.mutation(api.ownerInvites.generateInvite, {
        inquiry_id: fixture.inquiryId,
        channel_id: fixture.channelId,
      });
      expect(invite.status).toBe("PENDING");
    });
  });

  describe("consumeInvite", () => {
    // Characterisation of current behaviour, not an endorsement: without an expected email the token is a bearer credential, so anyone it is forwarded to becomes the listing's owner (only flagged via identity_verified: false).
    it("currently links whichever tenant holds a token without an expected email as the owner and marks the join unverified", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const tenant = await createUser(t, "TENANT");
      await insertPendingInvite(t, fixture, { token: "tok-open", expiresAt: BASE_TIME + DAY_MS });

      const result = await tenant.as.mutation(api.ownerInvites.consumeInvite, {
        invite_token: "tok-open",
      });

      expect(result).toEqual({
        success: true,
        channel_id: fixture.channelId,
        inquiry_id: fixture.inquiryId,
      });
      const state = await t.run(async (ctx) => ({
        invite: await ctx.db
          .query("owner_invites")
          .withIndex("by_token", (q) => q.eq("invite_token", "tok-open"))
          .unique(),
        owner: await ctx.db.get(fixture.ownerId),
        user: await ctx.db.get(tenant.userId),
        messages: await ctx.db.query("chat_messages").collect(),
      }));
      expect(state.invite?.status).toBe("CONSUMED");
      expect(state.invite?.identity_verified).toBe(false);
      expect(state.invite?.consumed_by_user_id).toBe(tenant.userId);
      expect(state.invite?.consumed_at).toBe(BASE_TIME);
      expect(state.owner?.user_id).toBe(tenant.userId);
      expect(state.user?.user_types).toEqual(["TENANT", "OWNER"]);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toMatchObject({
        channel_id: fixture.channelId,
        sender_role: "SYSTEM",
        original_content: "Owner joined the conversation (identity not email-verified)",
      });
    });

    it("rejects the token at exactly expires_at but accepts it one millisecond earlier", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const tenant = await createUser(t, "TENANT");
      const expiresAt = BASE_TIME + DAY_MS;
      await insertPendingInvite(t, fixture, { token: "tok-edge", expiresAt });

      vi.setSystemTime(expiresAt);
      await expect(
        tenant.as.mutation(api.ownerInvites.consumeInvite, { invite_token: "tok-edge" }),
      ).rejects.toThrow("Invite has expired");

      vi.setSystemTime(expiresAt - 1);
      const result = await tenant.as.mutation(api.ownerInvites.consumeInvite, {
        invite_token: "tok-edge",
      });
      expect(result.success).toBe(true);
    });

    it("is single-use: a second consumption of the same token is rejected", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const tenant = await createUser(t, "TENANT");
      await insertPendingInvite(t, fixture, { token: "tok-once", expiresAt: BASE_TIME + DAY_MS });

      await tenant.as.mutation(api.ownerInvites.consumeInvite, { invite_token: "tok-once" });

      await expect(
        tenant.as.mutation(api.ownerInvites.consumeInvite, { invite_token: "tok-once" }),
      ).rejects.toThrow("Invite is no longer valid");
      const messages = await t.run(async (ctx) => ctx.db.query("chat_messages").collect());
      expect(messages).toHaveLength(1);
    });

    it("enforces the expected email case-insensitively and records the join as verified", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const stranger = await createUser(t, "TENANT", [], "stranger@example.com");
      const realOwner = await createUser(t, "OWNER", [], "Real.Owner@Example.com");
      await insertPendingInvite(t, fixture, {
        token: "tok-bound",
        expiresAt: BASE_TIME + DAY_MS,
        expectedEmail: "real.owner@example.com",
      });

      await expect(
        stranger.as.mutation(api.ownerInvites.consumeInvite, { invite_token: "tok-bound" }),
      ).rejects.toThrow("Invite email does not match authenticated user");

      await realOwner.as.mutation(api.ownerInvites.consumeInvite, { invite_token: "tok-bound" });

      const state = await t.run(async (ctx) => ({
        invite: await ctx.db.query("owner_invites").first(),
        owner: await ctx.db.get(fixture.ownerId),
        message: await ctx.db.query("chat_messages").first(),
      }));
      expect(state.invite?.identity_verified).toBe(true);
      expect(state.invite?.consumed_by_user_id).toBe(realOwner.userId);
      expect(state.owner?.user_id).toBe(realOwner.userId);
      expect(state.message?.original_content).toBe("Owner joined the conversation");
    });

    it("refuses when the owner record is already linked to a different user account", async () => {
      const t = createTest();
      const existingOwnerUser = await createUser(t, "OWNER");
      const fixture = await createInviteFixture(t, { ownerUserId: existingOwnerUser.userId });
      const tenant = await createUser(t, "TENANT");
      await insertPendingInvite(t, fixture, { token: "tok-taken", expiresAt: BASE_TIME + DAY_MS });

      await expect(
        tenant.as.mutation(api.ownerInvites.consumeInvite, { invite_token: "tok-taken" }),
      ).rejects.toThrow("Owner account is already linked to a different user");

      const invite = await t.run(async (ctx) => ctx.db.query("owner_invites").first());
      expect(invite?.status).toBe("PENDING");
    });

    it("refuses when the inquiry has reached a terminal status", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t, {
        inquiryStatus: TENANT_INQUIRY_STATUS.CLOSED,
      });
      const tenant = await createUser(t, "TENANT");
      await insertPendingInvite(t, fixture, { token: "tok-closed", expiresAt: BASE_TIME + DAY_MS });

      await expect(
        tenant.as.mutation(api.ownerInvites.consumeInvite, { invite_token: "tok-closed" }),
      ).rejects.toThrow("Cannot consume invite — inquiry is no longer active");
    });
  });

  describe("expireStaleInvites", () => {
    // Characterisation of current behaviour, not an endorsement: the cron uses `< now` (convex/ownerInvites.ts:514) while consume/getByToken use `<= now` (:263, :429), so the stored status lags the effective one at the edge.
    it("currently leaves an invite PENDING at exactly expires_at (while getByToken already reports EXPIRED) and expires it 1 ms later", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const expiresAt = BASE_TIME + DAY_MS;
      const inviteId = await insertPendingInvite(t, fixture, { token: "tok-cron", expiresAt });

      vi.setSystemTime(expiresAt);
      const atEdge = await t.mutation(internal.ownerInvites.expireStaleInvites, {});
      const publicView = await t.query(api.ownerInvites.getByToken, { invite_token: "tok-cron" });
      expect(atEdge.expired_count).toBe(0);
      expect(await t.run(async (ctx) => (await ctx.db.get(inviteId))?.status)).toBe("PENDING");
      expect(publicView?.status).toBe("EXPIRED");

      vi.setSystemTime(expiresAt + 1);
      const afterEdge = await t.mutation(internal.ownerInvites.expireStaleInvites, {});
      expect(afterEdge.expired_count).toBe(1);
      expect(await t.run(async (ctx) => (await ctx.db.get(inviteId))?.status)).toBe("EXPIRED");
    });
  });

  describe("regenerateInvite", () => {
    it("marks the old invite REGENERATED and issues a fresh pending token that keeps the expected email", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const original = await fixture.admin.as.mutation(api.ownerInvites.generateInvite, {
        inquiry_id: fixture.inquiryId,
        channel_id: fixture.channelId,
        owner_expected_email: "owner@example.com",
      });

      vi.setSystemTime(BASE_TIME + DAY_MS);
      const regenerated = await fixture.admin.as.mutation(api.ownerInvites.regenerateInvite, {
        invite_id: original._id,
      });

      expect(regenerated._id).not.toBe(original._id);
      expect(regenerated.invite_token).not.toBe(original.invite_token);
      expect(regenerated.status).toBe("PENDING");
      expect(regenerated.owner_expected_email).toBe("owner@example.com");
      expect(regenerated.expires_at).toBe(BASE_TIME + DAY_MS + 7 * DAY_MS);
      const old = await t.run(async (ctx) => ctx.db.get(original._id));
      expect(old?.status).toBe("REGENERATED");
    });

    it("refuses to regenerate an invite that was already consumed", async () => {
      const t = createTest();
      const fixture = await createInviteFixture(t);
      const tenant = await createUser(t, "TENANT");
      const inviteId = await insertPendingInvite(t, fixture, {
        token: "tok-used",
        expiresAt: BASE_TIME + DAY_MS,
      });
      await tenant.as.mutation(api.ownerInvites.consumeInvite, { invite_token: "tok-used" });

      await expect(
        fixture.admin.as.mutation(api.ownerInvites.regenerateInvite, { invite_id: inviteId }),
      ).rejects.toThrow("Only pending or expired invites can be regenerated");
    });
  });
});
