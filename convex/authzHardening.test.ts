// Authorization hardening regressions: each block proves an unprivileged caller is
// rejected (or receives no private fields) while the legitimate caller still works.
// Sweep record: docs/security/authz-sweep-2026-09-23.md
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type UserType } from "../lib/constants";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_authz";
process.env.WORKOS_API_KEY ??= "sk_test_authz";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_authz";

const { authKit } = await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;
type FunctionFlags = { isInternal?: boolean; isPublic?: boolean };

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
  const workosUserId = `workos_authz_${userType.toLowerCase()}_${sequence}`;
  const phone = `98${String(sequence).padStart(8, "0")}`;

  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: userType,
      name: `${userType} user ${sequence}`,
      email: `${workosUserId}@example.com`,
      phone,
      status: "ACTIVE",
      must_change_password: false,
    });

    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Authz role ${sequence}`,
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

async function createGuardWithProfile(t: TestBackend, societyId: Id<"societies">) {
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

// Society → building → lead (submitted by a guard) → published listing.
async function createPropertyFixture(t: TestBackend) {
  const admin = await createUser(t, "ADMIN");
  const societyId = await t.run(async (ctx) => {
    return await ctx.db.insert("societies", {
      name: "Authz Society",
      city: "Mumbai",
      status: "ACTIVE",
      created_by_admin_id: admin.userId,
    });
  });
  const submitter = await createGuardWithProfile(t, societyId);

  const ids = await t.run(async (ctx) => {
    const buildingId = await ctx.db.insert("buildings", {
      society_id: societyId,
      name: "Tower A",
      total_floors: 10,
      floor_labels: ["1", "2", "3"],
      status: "ACTIVE",
      is_deleted: false,
    });
    const leadId = await ctx.db.insert("leads", {
      society_id: societyId,
      building_id: buildingId,
      floor_number: "3",
      flat_number: "301",
      owner_phone: "9111111111",
      availability_type: "VACANT_NOW",
      owner_consent_to_call: true,
      submitted_by_guard_id: submitter.userId,
      status: "VERIFIED",
    });
    const listingId = await ctx.db.insert("listings", {
      lead_id: leadId,
      slug: `authz-listing-${sequence}`,
      status: "PUBLISHED",
      rent_monthly: 2500000,
      bhk_config: "2BHK",
      furnishing: "SEMI_FURNISHED",
      floor_number: "3",
      available_from: Date.now(),
      created_by_admin_id: admin.userId,
    });
    return { buildingId, leadId, listingId };
  });

  return { admin, societyId, submitter, ...ids };
}

describe("authorization hardening", () => {
  beforeEach(() => {
    vi.spyOn(authKit, "getAuthUser").mockImplementation(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        return null;
      }
      const timestamp = new Date(0).toISOString();
      const user: AuthKitUser = {
        id: identity.subject,
        email: `${identity.subject}@example.com`,
        createdAt: timestamp,
        updatedAt: timestamp,
        emailVerified: true,
        metadata: {},
        externalId: null,
        firstName: null,
        lastName: null,
        lastSignInAt: null,
        locale: null,
        profilePictureUrl: null,
      };
      return user;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("internal-only entry points", () => {
    it("incentive v3 migration run/rollback are not client-callable", async () => {
      const migration = await import("./actions/migrateIncentiveV3");
      const run = migration.run as unknown as FunctionFlags;
      const rollback = migration.rollback as unknown as FunctionFlags;

      expect(run.isInternal).toBe(true);
      expect(run.isPublic).not.toBe(true);
      expect(rollback.isInternal).toBe(true);
      expect(rollback.isPublic).not.toBe(true);
    });

    it("support inquiry submit is internal but the public contact route still accepts", async () => {
      const supportInquiries = await import("./supportInquiries");
      const submit = supportInquiries.submit as unknown as FunctionFlags;
      expect(submit.isInternal).toBe(true);
      expect(submit.isPublic).not.toBe(true);

      const previousSecret = process.env.INTERNAL_API_SECRET;
      delete process.env.INTERNAL_API_SECRET;
      try {
        const t = createTest();
        const response = await t.fetch("/api/public/support-inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Visitor",
            email: "visitor@example.com",
            subject: "A question",
            message: "Hello, I have a question about listings.",
          }),
        });
        expect(response.status).toBe(200);

        const rows = await t.run(async (ctx) => await ctx.db.query("support_inquiries").collect());
        expect(rows).toHaveLength(1);
      } finally {
        if (previousSecret !== undefined) {
          process.env.INTERNAL_API_SECRET = previousSecret;
        }
      }
    });
  });

  describe("users.getById", () => {
    it("returns only a display name for another user without users.manage", async () => {
      const t = createTest();
      const caller = await createUser(t, "ADMIN", [PERMISSIONS.LEADS_VIEW]);
      const target = await createUser(t, "TENANT");

      const result = await caller.as.query(api.users.getById, { id: target.userId });

      expect(result).toEqual({
        _id: target.userId,
        name: expect.any(String),
        email: undefined,
        phone: undefined,
      });
      expect(result).not.toHaveProperty("workos_user_id");
      expect(result).not.toHaveProperty("must_change_password");
    });

    it("includes contact details for a users.manage holder and for the caller's own record", async () => {
      const t = createTest();
      const manager = await createUser(t, "ADMIN", [PERMISSIONS.USERS_MANAGE]);
      const target = await createUser(t, "TENANT");

      const other = await manager.as.query(api.users.getById, { id: target.userId });
      expect(other?.email).toBe(`${target.workosUserId}@example.com`);

      const self = await manager.as.query(api.users.getById, { id: manager.userId });
      expect(self?.email).toBe(`${manager.workosUserId}@example.com`);
      expect(self).not.toHaveProperty("workos_user_id");
    });

    it("rejects OPS lookups of other users and non-backoffice callers", async () => {
      const t = createTest();
      const ops = await createUser(t, "OPS");
      const tenant = await createUser(t, "TENANT");

      await expect(ops.as.query(api.users.getById, { id: tenant.userId })).rejects.toThrow(
        "OPS users can only view their own user record",
      );
      await expect(tenant.as.query(api.users.getById, { id: ops.userId })).rejects.toThrow(
        "Admin or OPS access required",
      );
    });
  });

  describe("userRoleAssignments reads", () => {
    it("getByUserId requires a roles permission for another user's assignments", async () => {
      const t = createTest();
      const plainAdmin = await createUser(t, "ADMIN", [PERMISSIONS.LEADS_VIEW]);
      const target = await createUser(t, "ADMIN", [PERMISSIONS.GUARDS_VIEW]);
      const viewer = await createUser(t, "ADMIN", [PERMISSIONS.ROLES_VIEW]);

      await expect(
        plainAdmin.as.query(api.userRoleAssignments.getByUserId, { user_id: target.userId }),
      ).rejects.toThrow("Missing one of permissions");

      const own = await plainAdmin.as.query(api.userRoleAssignments.getByUserId, {
        user_id: plainAdmin.userId,
      });
      expect(own).toHaveLength(1);
      expect(own[0]?.role.permissions).toContain(PERMISSIONS.LEADS_VIEW);
      expect(own[0]).not.toHaveProperty("assigned_by_admin_id");

      const viewed = await viewer.as.query(api.userRoleAssignments.getByUserId, {
        user_id: target.userId,
      });
      expect(viewed).toHaveLength(1);
    });

    it("listByRole requires a roles permission and returns a user summary only", async () => {
      const t = createTest();
      const plainAdmin = await createUser(t, "ADMIN", [PERMISSIONS.LEADS_VIEW]);
      const viewer = await createUser(t, "ADMIN", [PERMISSIONS.ROLES_VIEW]);
      const roleId = await t.run(async (ctx) => {
        const assignment = await ctx.db
          .query("user_role_assignments")
          .withIndex("by_user_id", (q) => q.eq("user_id", plainAdmin.userId))
          .first();
        if (!assignment) {
          throw new Error("fixture assignment missing");
        }
        return assignment.role_id;
      });

      await expect(
        plainAdmin.as.query(api.userRoleAssignments.listByRole, { role_id: roleId }),
      ).rejects.toThrow("Missing one of permissions");

      const rows = await viewer.as.query(api.userRoleAssignments.listByRole, { role_id: roleId });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.user._id).toBe(plainAdmin.userId);
      expect(rows[0]?.user).not.toHaveProperty("workos_user_id");
      expect(rows[0]?.user).not.toHaveProperty("phone");
      expect(rows[0]).not.toHaveProperty("assigned_by_admin_id");
    });
  });

  describe("OPS field-worker rollout config", () => {
    it("rejects an admin without system.configure on every rollout entry point", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", [PERMISSIONS.LEADS_VIEW]);
      const ops = await createUser(t, "OPS");
      const missing = "Missing permission: system.configure";

      await expect(
        admin.as.mutation(api.systemConfig.setOpsFieldWorkerEnabled, { enabled: true }),
      ).rejects.toThrow(missing);
      await expect(
        admin.as.mutation(api.systemConfig.setOpsFieldWorkerCanaryUserIds, {
          user_ids: [ops.userId],
        }),
      ).rejects.toThrow(missing);
      await expect(
        admin.as.mutation(api.systemConfig.addOpsFieldWorkerCanaryUser, { user_id: ops.userId }),
      ).rejects.toThrow(missing);
      await expect(
        admin.as.mutation(api.systemConfig.removeOpsFieldWorkerCanaryUser, {
          user_id: ops.userId,
        }),
      ).rejects.toThrow(missing);
      await expect(admin.as.query(api.systemConfig.getOpsFieldWorkerRollout, {})).rejects.toThrow(
        missing,
      );
    });

    it("allows a system.configure holder to manage the rollout", async () => {
      const t = createTest();
      const admin = await createUser(t, "ADMIN", [PERMISSIONS.SYSTEM_CONFIGURE]);
      const ops = await createUser(t, "OPS");

      await admin.as.mutation(api.systemConfig.setOpsFieldWorkerEnabled, { enabled: false });
      await admin.as.mutation(api.systemConfig.addOpsFieldWorkerCanaryUser, {
        user_id: ops.userId,
      });

      const rollout = await admin.as.query(api.systemConfig.getOpsFieldWorkerRollout, {});
      expect(rollout.canary_user_ids).toEqual([ops.userId]);

      await admin.as.mutation(api.systemConfig.removeOpsFieldWorkerCanaryUser, {
        user_id: ops.userId,
      });
      const after = await admin.as.query(api.systemConfig.getOpsFieldWorkerRollout, {});
      expect(after.canary_user_ids).toEqual([]);
    });
  });

  describe("roles.create", () => {
    it("does not accept is_system_role from the client and always creates a custom role", async () => {
      const t = createTest();
      const manager = await createUser(t, "ADMIN", [PERMISSIONS.ROLES_MANAGE]);

      const forged = {
        name: "Forged System Role",
        permissions: [PERMISSIONS.LEADS_VIEW],
        is_system_role: true,
      };
      await expect(manager.as.mutation(api.roles.create, forged)).rejects.toThrow(/is_system_role/);

      const roleId = await manager.as.mutation(api.roles.create, {
        name: "Custom Role",
        permissions: [PERMISSIONS.LEADS_VIEW],
      });
      const role = await t.run(async (ctx) => await ctx.db.get(roleId));
      expect(role?.is_system_role).toBe(false);
    });
  });

  describe("document requirements", () => {
    async function createRequirement(
      t: TestBackend,
      assigneeId: Id<"users">,
      status: "PENDING" | "VERIFIED",
    ) {
      return await t.run(async (ctx) => {
        return await ctx.db.insert("document_requirements", {
          requirement_type: "OWNER_DOCS",
          assigned_to: assigneeId,
          overall_status: "NOT_STARTED",
          items: [{ item_id: "id_proof", label: "ID proof", is_required: true, status }],
          is_deleted: false,
        });
      });
    }

    it("updateNotes: other backoffice users need closures.edit; the assignee does not", async () => {
      const t = createTest();
      const assignee = await createUser(t, "OPS");
      const otherOps = await createUser(t, "OPS");
      const editor = await createUser(t, "ADMIN", [PERMISSIONS.CLOSURES_EDIT]);
      const requirementId = await createRequirement(t, assignee.userId, "PENDING");

      await expect(
        otherOps.as.mutation(api.documents.updateNotes, {
          requirement_id: requirementId,
          notes: "overwrite",
        }),
      ).rejects.toThrow("Missing permission: closures.edit");

      const byAssignee = await assignee.as.mutation(api.documents.updateNotes, {
        requirement_id: requirementId,
        notes: "assignee note",
      });
      expect(byAssignee?.notes).toBe("assignee note");

      const byEditor = await editor.as.mutation(api.documents.updateNotes, {
        requirement_id: requirementId,
        notes: "editor note",
      });
      expect(byEditor?.notes).toBe("editor note");
    });

    it("generateUploadUrl: only the assignee, only for an item that can still be collected", async () => {
      const t = createTest();
      const assignee = await createUser(t, "OPS");
      const otherOps = await createUser(t, "OPS");
      const tenant = await createUser(t, "TENANT");
      const pendingId = await createRequirement(t, assignee.userId, "PENDING");
      const verifiedId = await createRequirement(t, assignee.userId, "VERIFIED");
      const args = { requirement_id: pendingId, item_id: "id_proof" };

      await expect(otherOps.as.mutation(api.documents.generateUploadUrl, args)).rejects.toThrow(
        "Only the assigned user can collect this document item",
      );
      await expect(tenant.as.mutation(api.documents.generateUploadUrl, args)).rejects.toThrow(
        "Admin or OPS access required",
      );
      await expect(
        assignee.as.mutation(api.documents.generateUploadUrl, {
          requirement_id: verifiedId,
          item_id: "id_proof",
        }),
      ).rejects.toThrow("Invalid document item status transition");

      const url = await assignee.as.mutation(api.documents.generateUploadUrl, args);
      expect(typeof url).toBe("string");
    });
  });

  describe("checklists.generateUploadUrl", () => {
    it("requires an in-progress checklist assigned to the caller", async () => {
      const t = createTest();
      const property = await createPropertyFixture(t);
      const guard = await createGuardWithProfile(t, property.societyId);
      const otherGuard = await createGuardWithProfile(t, property.societyId);
      const tenant = await createUser(t, "TENANT");

      await t.run(async (ctx) => {
        const templateId = await ctx.db.insert("checklist_templates", {
          name: "Visit checklist",
          depth: "LIGHT",
          is_active: true,
          is_deleted: false,
          sections: [],
        });
        const visitId = await ctx.db.insert("visits", {
          lead_id: property.leadId,
          society_id: property.societyId,
          scheduled_start: Date.now(),
          scheduled_end: Date.now() + 3_600_000,
          assigned_guard_id: guard.userId,
          status: "IN_PROGRESS",
          created_by_admin_id: property.admin.userId,
        });
        await ctx.db.insert("checklist_instances", {
          template_id: templateId,
          visit_id: visitId,
          assigned_to: guard.userId,
          assigned_by: property.admin.userId,
          depth: "LIGHT",
          status: "IN_PROGRESS",
          completeness_score: 0,
          responses: [],
          is_deleted: false,
        });
      });

      await expect(otherGuard.as.mutation(api.checklists.generateUploadUrl, {})).rejects.toThrow(
        "No in-progress checklist assigned to you",
      );
      await expect(
        property.admin.as.mutation(api.checklists.generateUploadUrl, {}),
      ).rejects.toThrow("No in-progress checklist assigned to you");
      await expect(tenant.as.mutation(api.checklists.generateUploadUrl, {})).rejects.toThrow(
        "Only guards, admins, or OPS can upload checklist photos",
      );

      const url = await guard.as.mutation(api.checklists.generateUploadUrl, {});
      expect(typeof url).toBe("string");
    });
  });

  describe("voice transcription", () => {
    it("restricts audio upload URLs to field workers", async () => {
      const t = createTest();
      const property = await createPropertyFixture(t);
      const guard = await createGuardWithProfile(t, property.societyId);
      const tenant = await createUser(t, "TENANT");

      await expect(
        tenant.as.mutation(api.voiceTranscriptions.generateAudioUploadUrl, {}),
      ).rejects.toThrow("Not authorized as field worker");

      const url = await guard.as.mutation(api.voiceTranscriptions.generateAudioUploadUrl, {});
      expect(typeof url).toBe("string");
    });

    it("rejects a non-field-worker before the paid transcription call", async () => {
      const previousKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        const t = createTest();
        const property = await createPropertyFixture(t);
        const guard = await createGuardWithProfile(t, property.societyId);
        const tenant = await createUser(t, "TENANT");
        const storageId = await t.run(
          async (ctx) => await ctx.storage.store(new Blob(["audio"], { type: "audio/webm" })),
        );
        const args = {
          storageId,
          language: "en",
          entity_type: "lead",
          entity_id: String(property.leadId),
          duration_ms: 1000,
        };

        await expect(tenant.as.action(api.voiceTranscriptions.transcribe, args)).rejects.toThrow(
          "Not authorized as field worker",
        );
        // A field worker passes the gate and reaches the provider call, which fails
        // here only because no API key is configured in tests.
        await expect(guard.as.action(api.voiceTranscriptions.transcribe, args)).rejects.toThrow(
          "OPENAI_API_KEY is not configured",
        );
      } finally {
        if (previousKey !== undefined) {
          process.env.OPENAI_API_KEY = previousKey;
        }
      }
    });
  });

  describe("public referral code lookup", () => {
    it("exposes only the referrer persona, never their name or ids", async () => {
      const t = createTest();
      const tenant = await createUser(t, "TENANT");
      await t.run(async (ctx) => {
        await ctx.db.insert("referral_codes", {
          user_id: tenant.userId,
          code: "FLAT-ABCDE",
          is_active: true,
        });
      });

      const result = await t.query(api.referralCodes.getByCode, { code: "flat-abcde" });

      expect(result).toEqual({ referrer: { owner_type: "TENANT" } });
    });
  });

  describe("tenant-facing rental transactions", () => {
    it("tenant reads omit owner contact, closure economics and inquiry ops fields", async () => {
      const t = createTest();
      const property = await createPropertyFixture(t);
      const tenant = await createUser(t, "TENANT");
      const staff = await createUser(t, "ADMIN", [PERMISSIONS.TRANSACTIONS_VIEW]);

      const transactionId = await t.run(async (ctx) => {
        const now = Date.now();
        const ownerId = await ctx.db.insert("owners", {
          phone: "9222222222",
          email: "owner@example.com",
          source: "GUARD_LEAD",
          active_properties_count: 1,
          total_leads_count: 1,
          total_closures_count: 1,
          lifecycle_stage: "ACTIVE",
          lifecycle_updated_at: now,
          first_seen_at: now,
          last_activity_at: now,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        });
        const closureId = await ctx.db.insert("closures", {
          lead_id: property.leadId,
          move_in_date: now,
          status: "CONFIRMED",
          closed_by_admin_id: property.admin.userId,
          commission_amount: 5000000,
          notes: "internal closure note",
        });
        const inquiryId = await ctx.db.insert("tenant_inquiries", {
          listing_id: property.listingId,
          tenant_id: tenant.userId,
          tenant_name: "Tenant",
          tenant_phone: "9333333333",
          status: "CLOSED",
          ops_notes: "internal ops note",
        });
        return await ctx.db.insert("rental_transactions", {
          tenant_user_id: tenant.userId,
          listing_id: property.listingId,
          owner_id: ownerId,
          closure_id: closureId,
          tenant_inquiry_id: inquiryId,
          status: "INITIATED",
          monthly_rent_paise: 2500000,
          deposit_amount_paise: 5000000,
          last_override_reason: "internal override reason",
          created_at: now,
          updated_at: now,
          is_deleted: false,
        });
      });

      const list = await tenant.as.query(api.rentalTransactions.listByTenant, {
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(list.page).toHaveLength(1);
      const row = list.page[0];
      expect(row?.owner).toBeNull();
      expect(row?.closure).toBeNull();
      expect(row?.inquiry).toBeNull();
      expect(row?.last_override_reason).toBeUndefined();
      expect(row?.listing?.slug).toMatch(/^authz-listing-/);
      expect(row?.monthly_rent_paise).toBe(2500000);

      const detail = await tenant.as.query(api.rentalTransactions.getById, { id: transactionId });
      expect(detail.transaction.owner).toBeNull();
      expect(detail.transaction.closure).toBeNull();

      const staffDetail = await staff.as.query(api.rentalTransactions.getById, {
        id: transactionId,
      });
      expect(staffDetail.transaction.owner?.phone).toBe("9222222222");
      expect(staffDetail.transaction.closure?.commission_amount).toBe(5000000);
    });
  });

  describe("field-worker bounty views", () => {
    it("accepting and listing bounties never returns the tenant's identity or ops notes", async () => {
      // acceptBounty schedules a notification; keep it queued instead of letting it
      // fire after the test's transaction has closed.
      vi.useFakeTimers();
      const t = createTest();
      const property = await createPropertyFixture(t);
      const guard = await createGuardWithProfile(t, property.societyId);
      const tenant = await createUser(t, "TENANT");

      const inquiryId = await t.run(async (ctx) => {
        return await ctx.db.insert("tenant_inquiries", {
          listing_id: property.listingId,
          tenant_id: tenant.userId,
          tenant_name: "Private Tenant",
          tenant_phone: "9444444444",
          tenant_email: "private-tenant@example.com",
          status: "BOUNTY_POSTED",
          bounty_amount: 50000,
          bounty_posted_at: Date.now(),
          bounty_expires_at: Date.now() + 86_400_000,
          ops_notes: "internal ops note",
        });
      });

      const accepted = await guard.as.mutation(api.tenantInquiries.acceptBounty, {
        id: inquiryId,
      });
      expect(accepted).toEqual({ _id: inquiryId, status: "GUARD_ACCEPTED" });

      const privateFields = ["tenant_name", "tenant_phone", "tenant_email", "ops_notes", "lead"];

      const tracked = await guard.as.query(api.tenantInquiries.listByGuard, {
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(tracked.page).toHaveLength(1);
      expect(tracked.page[0]?.bounty_amount).toBe(50000);
      expect(tracked.page[0]?.flat_number).toBe("301");
      for (const field of privateFields) {
        expect(tracked.page[0]).not.toHaveProperty(field);
      }

      const acceptedTab = await guard.as.query(api.tenantInquiries.listBounties, {
        tab: "accepted",
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(acceptedTab.page).toHaveLength(1);
      for (const field of privateFields) {
        expect(acceptedTab.page[0]).not.toHaveProperty(field);
      }
    });
  });

  describe("incentives.getTopGuards", () => {
    it("is limited to field workers", async () => {
      const t = createTest();
      const property = await createPropertyFixture(t);
      const guard = await createGuardWithProfile(t, property.societyId);
      const tenant = await createUser(t, "TENANT");
      const args = { scope: "ALL_TIME" as const };

      await expect(tenant.as.query(api.incentives.getTopGuards, args)).rejects.toThrow(
        "Not authorized as field worker",
      );
      const leaderboard = await guard.as.query(api.incentives.getTopGuards, args);
      expect(leaderboard.scope).toBe("ALL_TIME");
      expect(Array.isArray(leaderboard.items)).toBe(true);
    });
  });

  describe("owner portal reads", () => {
    it("RM assignment omits the RM's internal performance data; earnings omit payee references", async () => {
      const t = createTest();
      const property = await createPropertyFixture(t);
      const ownerUser = await createUser(t, "OWNER");

      const ownerId = await t.run(async (ctx) => {
        const now = Date.now();
        const id = await ctx.db.insert("owners", {
          user_id: ownerUser.userId,
          phone: "9555555555",
          source: "GUARD_LEAD",
          active_properties_count: 1,
          total_leads_count: 1,
          total_closures_count: 1,
          lifecycle_stage: "ACTIVE",
          lifecycle_updated_at: now,
          first_seen_at: now,
          last_activity_at: now,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        });
        const rmProfile = await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", property.submitter.userId))
          .unique();
        if (!rmProfile) {
          throw new Error("fixture guard profile missing");
        }
        await ctx.db.insert("owner_rm_assignments", {
          owner_id: id,
          rm_guard_id: rmProfile._id,
          rm_user_id: property.submitter.userId,
          assigned_by: "SYSTEM",
          status: "ACTIVE",
          check_in_frequency_days: 7,
          missed_check_ins_count: 3,
          performance_score: 41,
          sla_breach_count: 2,
          escalation_level: 1,
          created_at: now,
          updated_at: now,
        });
        const closureId = await ctx.db.insert("closures", {
          lead_id: property.leadId,
          owner_id: id,
          move_in_date: now,
          status: "CONFIRMED",
          closed_by_admin_id: property.admin.userId,
        });
        await ctx.db.insert("payouts", {
          guard_user_id: property.submitter.userId,
          lead_id: property.leadId,
          closure_id: closureId,
          amount_paise: 85000,
          status: "disbursed",
          initiated_by_admin_id: property.admin.userId,
          payment_reference: "UPI-PAYEE-REF-123",
        });
        return id;
      });

      const assignment = await ownerUser.as.query(api.owners.getMyRmAssignment, {
        owner_id: ownerId,
      });
      expect(assignment?.status).toBe("ACTIVE");
      expect(assignment?.rm_name).toEqual(expect.any(String));
      for (const field of [
        "performance_score",
        "sla_breach_count",
        "missed_check_ins_count",
        "escalation_level",
        "rm_user_id",
      ]) {
        expect(assignment).not.toHaveProperty(field);
      }

      const earnings = await ownerUser.as.query(api.owners.getMyEarnings, {});
      expect(earnings.rows).toHaveLength(1);
      expect(earnings.rows[0]?.payment_reference).toBeUndefined();
    });
  });

  describe("opsManagement.acknowledgeWarning", () => {
    it("requires a login before touching the warning, and still works for a permitted user", async () => {
      const t = createTest();
      const agent = await createUser(t, "OPS");
      const manager = await createUser(t, "ADMIN", [PERMISSIONS.OPS_MANAGEMENT_ISSUE_WARNINGS]);
      const warningId = await t.run(async (ctx) => {
        const now = Date.now();
        return await ctx.db.insert("ops_warnings", {
          agent_user_id: agent.userId,
          issued_by_type: "SYSTEM",
          warning_level: 1,
          trigger_type: "AUTO",
          trigger_reason: "MISSED_TARGETS",
          description: "Missed weekly target",
          status: "ACTIVE",
          created_at: now,
          updated_at: now,
          is_deleted: false,
        });
      });

      await expect(
        t.mutation(api.opsManagement.acknowledgeWarning, { warning_id: warningId }),
      ).rejects.toThrow("Not authenticated");

      await manager.as.mutation(api.opsManagement.acknowledgeWarning, { warning_id: warningId });
      const warning = await t.run(async (ctx) => await ctx.db.get(warningId));
      expect(warning?.status).toBe("ACKNOWLEDGED");
    });
  });
});
