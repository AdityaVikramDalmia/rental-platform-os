import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import aggregateTest from "@convex-dev/aggregate/test";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_TYPE,
  CALL_OUTCOME,
  LEAD_STATUS,
  PERMISSIONS,
  QUALITY_FLAGS,
  SOCIETY_STATUS,
  SYSTEM_CONFIG_KEYS,
  USER_STATUS,
  USER_TYPE,
  VISIT_STATUS,
} from "../lib/constants";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

process.env.WORKOS_CLIENT_ID ??= "client_test_leads";
process.env.WORKOS_API_KEY ??= "sk_test_leads";
process.env.WORKOS_WEBHOOK_SECRET ??= "whsec_test_leads";
process.env.CONVEX_DISABLE_SCHEDULER_SIDE_EFFECTS ??= "1";

const { authKit } = await import("./auth");

const modules = (
  import.meta as ImportMeta & {
    glob: (patterns: string | string[]) => Record<string, () => Promise<unknown>>;
  }
).glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts"]);

type AuthKitUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;

const WORKOS_ISSUER = "https://api.workos.com/";
const LEAD_ADMIN_PERMISSIONS = [
  PERMISSIONS.LEADS_VIEW,
  PERMISSIONS.LEADS_REQUEST_INFO,
  PERMISSIONS.LEADS_REJECT,
  PERMISSIONS.LEADS_MARK_DUPLICATE,
  PERMISSIONS.LEADS_SET_BOUNTY,
];
const VERIFICATION_ADMIN_PERMISSIONS = [PERMISSIONS.LEADS_VIEW, PERMISSIONS.LEADS_VERIFY];
const INCENTIVE_THRESHOLD_CONFIG: Array<{ key: string; value: string }> = [
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_BRONZE, value: "10" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_SILVER, value: "25" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_GOLD, value: "50" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_PLATINUM, value: "100" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_BRONZE, value: "10" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_SILVER, value: "25" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_GOLD, value: "50" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_PLATINUM, value: "100" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_BRONZE, value: "70" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_SILVER, value: "80" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_GOLD, value: "90" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_PLATINUM, value: "95" },
  { key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_MIN_LEADS, value: "10" },
];

const verificationRefs = (
  api as unknown as {
    verifications: {
      create: FunctionReference<
        "mutation",
        "public",
        {
          lead_id: Id<"leads">;
          call_outcome: "VERIFIED" | "UNREACHABLE" | "DECLINED" | "FALSE";
          consent_contact_demorentals: boolean;
          consent_visit_coordination?: boolean;
          preferred_visit_slots?: string;
          rent_confirmed?: number;
          notes?: string;
        },
        Id<"owner_verifications">
      >;
      listByLead: FunctionReference<
        "query",
        "public",
        {
          lead_id: Id<"leads">;
        },
        Array<{
          _id: Id<"owner_verifications">;
          _creationTime: number;
          lead_id: Id<"leads">;
          called_by_admin_id: Id<"users">;
          call_outcome: "VERIFIED" | "UNREACHABLE" | "DECLINED" | "FALSE";
          consent_contact_demorentals: boolean;
          consent_visit_coordination?: boolean;
          preferred_visit_slots?: string;
          rent_confirmed?: number;
          notes?: string;
          verified_at: number;
          admin_name: string;
        }>
      >;
    };
  }
).verifications;

const createVerificationRef = verificationRefs.create;
const listVerificationsByLeadRef = verificationRefs.listByLead;

const internalLeadRefs = (
  internal as unknown as {
    leads: {
      __insertLeadForTests: FunctionReference<
        "mutation",
        "internal",
        {
          society_id: Id<"societies">;
          building_id: Id<"buildings">;
          submitted_by_guard_id: Id<"users">;
          status?:
            | "SUBMITTED"
            | "NEED_INFO"
            | "POTENTIAL_DUPLICATE"
            | "VERIFIED"
            | "REJECTED"
            | "DUPLICATE";
          floor_number?: string;
          flat_number?: string;
          owner_name?: string;
          owner_phone?: string;
          notes_thread?: {
            note: string;
            author_id: Id<"users">;
            author_name: string;
            author_type: "ADMIN" | "GUARD";
            timestamp: number;
          }[];
          quality_flags?: (
            | "DUPLICATE_FLAT_MATCH"
            | "DUPLICATE_PHONE_MATCH"
            | "GUARD_HIGH_REJECTION"
            | "OFF_SHIFT_SUBMISSION"
          )[];
          duplicate_of_lead_id?: Id<"leads">;
          prospective_bounty?: number;
          searchable_text?: string;
        },
        Id<"leads">
      >;
    };
  }
).leads;

const insertLeadForTestsRef = internalLeadRefs.__insertLeadForTests;

function createTestBackend() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, "leadCounts");
  aggregateTest.register(t, "visitCounts");
  aggregateTest.register(t, "payoutTotals");
  return t;
}

function buildAuthKitUser(id: string): AuthKitUser {
  const timestamp = new Date(0).toISOString();

  return {
    id,
    email: `${id}@example.com`,
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
}

async function createTestAdmin(
  t: ReturnType<typeof convexTest>,
  workosUserId: string,
  options?: {
    permissions?: string[];
  },
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      workos_user_id: workosUserId,
      user_type: USER_TYPE.ADMIN,
      name: `Admin ${workosUserId}`,
      email: `${workosUserId}@example.com`,
      status: USER_STATUS.ACTIVE,
      must_change_password: false,
    });

    const permissions = options?.permissions ?? [];

    if (permissions.length > 0) {
      const roleId = await ctx.db.insert("roles", {
        name: `Role ${workosUserId}`,
        permissions,
        is_system_role: false,
        is_deleted: false,
      });

      await ctx.db.insert("user_role_assignments", {
        user_id: adminId,
        role_id: roleId,
        assigned_by_admin_id: adminId,
        is_deleted: false,
      });
    }

    return adminId;
  });
}

async function createTestSociety(
  t: ReturnType<typeof convexTest>,
  options: {
    adminId: Id<"users">;
    name: string;
    status?: "ONBOARDING" | "ACTIVE" | "INACTIVE";
  },
): Promise<Id<"societies">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("societies", {
      name: options.name,
      city: "Mumbai",
      status: options.status ?? SOCIETY_STATUS.ACTIVE,
      created_by_admin_id: options.adminId,
    });
  });
}

async function createTestBuilding(
  t: ReturnType<typeof convexTest>,
  options: {
    societyId: Id<"societies">;
    name: string;
    isDeleted?: boolean;
  },
): Promise<Id<"buildings">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("buildings", {
      society_id: options.societyId,
      name: options.name,
      total_floors: 20,
      floor_labels: ["G", "1", "2"],
      status: "ACTIVE",
      is_deleted: options.isDeleted ?? false,
    });
  });
}

async function seedIncentiveThresholdConfig(
  t: ReturnType<typeof convexTest>,
  adminId: Id<"users">,
): Promise<void> {
  await t.run(async (ctx) => {
    for (const config of INCENTIVE_THRESHOLD_CONFIG) {
      await ctx.db.insert("system_config", {
        key: config.key as keyof typeof SYSTEM_CONFIG_KEYS,
        value: config.value,
        updated_by_admin_id: adminId,
      });
    }
  });
}

async function createTestGuard(
  t: ReturnType<typeof convexTest>,
  options: {
    workosUserId: string;
    societyId: Id<"societies">;
    phone: string;
    name?: string;
    status?: "ACTIVE" | "INACTIVE" | "BANNED";
  },
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      workos_user_id: options.workosUserId,
      user_type: USER_TYPE.GUARD,
      name: options.name ?? `Guard ${options.workosUserId}`,
      email: `${options.phone}@guards.local`,
      phone: options.phone,
      status: options.status ?? USER_STATUS.ACTIVE,
      must_change_password: false,
    });

    await ctx.db.insert("guard_profiles", {
      user_id: userId,
      society_id: options.societyId,
      guard_type: "MAIN_GATE",
      has_seen_onboarding: false,
    });

    return userId;
  });
}

async function createLeadRecord(
  t: ReturnType<typeof convexTest>,
  options: {
    societyId: Id<"societies">;
    buildingId: Id<"buildings">;
    guardUserId: Id<"users">;
    status?:
      | "SUBMITTED"
      | "NEED_INFO"
      | "POTENTIAL_DUPLICATE"
      | "VERIFIED"
      | "REJECTED"
      | "DUPLICATE";
    flatNumber?: string;
    ownerPhone?: string;
    ownerName?: string;
    notesThread?: {
      note: string;
      author_id: Id<"users">;
      author_name: string;
      author_type: "ADMIN" | "GUARD";
      timestamp: number;
    }[];
    qualityFlags?: (
      | "DUPLICATE_FLAT_MATCH"
      | "DUPLICATE_PHONE_MATCH"
      | "GUARD_HIGH_REJECTION"
      | "OFF_SHIFT_SUBMISSION"
    )[];
    duplicateOfLeadId?: Id<"leads">;
    prospectiveBounty?: number;
    searchableText?: string;
  },
): Promise<Id<"leads">> {
  return await t.mutation(insertLeadForTestsRef, {
    society_id: options.societyId,
    building_id: options.buildingId,
    submitted_by_guard_id: options.guardUserId,
    status: options.status,
    flat_number: options.flatNumber,
    owner_name: options.ownerName,
    owner_phone: options.ownerPhone,
    notes_thread: options.notesThread,
    quality_flags: options.qualityFlags,
    duplicate_of_lead_id: options.duplicateOfLeadId,
    prospective_bounty: options.prospectiveBounty,
    searchable_text: options.searchableText,
  });
}

async function createVisitRecord(
  t: ReturnType<typeof convexTest>,
  options: {
    leadId: Id<"leads">;
    societyId: Id<"societies">;
    guardUserId: Id<"users">;
    adminUserId: Id<"users">;
    status: "ASSIGNED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  },
): Promise<Id<"visits">> {
  return await t.run(async (ctx) => {
    const now = Date.now();

    return await ctx.db.insert("visits", {
      lead_id: options.leadId,
      society_id: options.societyId,
      scheduled_start: now + 60_000,
      scheduled_end: now + 3_600_000,
      assigned_guard_id: options.guardUserId,
      status: options.status,
      created_by_admin_id: options.adminUserId,
    });
  });
}

async function createGuardFixture(
  t: ReturnType<typeof convexTest>,
  prefix: string,
  options?: {
    societyStatus?: "ONBOARDING" | "ACTIVE" | "INACTIVE";
    guardStatus?: "ACTIVE" | "INACTIVE" | "BANNED";
    guardName?: string;
  },
) {
  const adminId = await createTestAdmin(t, `${prefix}_admin`);
  const societyId = await createTestSociety(t, {
    adminId,
    name: `${prefix} Society`,
    status: options?.societyStatus,
  });
  const buildingId = await createTestBuilding(t, {
    societyId,
    name: `${prefix} Tower`,
  });
  const guardWorkosUserId = `${prefix}_guard`;
  const guardUserId = await createTestGuard(t, {
    workosUserId: guardWorkosUserId,
    societyId,
    phone: "9999999999",
    status: options?.guardStatus,
    name: options?.guardName,
  });

  return {
    adminId,
    societyId,
    buildingId,
    guardWorkosUserId,
    guardUserId,
  };
}

async function createLeadAdminFixture(
  t: ReturnType<typeof convexTest>,
  prefix: string,
  permissions: string[] = LEAD_ADMIN_PERMISSIONS,
) {
  const guardFixture = await createGuardFixture(t, `${prefix}_guard_fixture`);
  const adminWorkosUserId = `${prefix}_admin`;
  const adminUserId = await createTestAdmin(t, adminWorkosUserId, {
    permissions,
  });
  const adminAuthed = t.withIdentity({
    subject: adminWorkosUserId,
    issuer: WORKOS_ISSUER,
  });

  return {
    ...guardFixture,
    adminWorkosUserId,
    adminUserId,
    adminAuthed,
  };
}

async function createVerificationAdminFixture(
  t: ReturnType<typeof convexTest>,
  prefix: string,
  permissions: string[] = VERIFICATION_ADMIN_PERMISSIONS,
) {
  const guardFixture = await createGuardFixture(t, `${prefix}_guard_fixture`);
  const adminWorkosUserId = `${prefix}_admin`;
  const adminUserId = await createTestAdmin(t, adminWorkosUserId, {
    permissions,
  });
  const adminAuthed = t.withIdentity({
    subject: adminWorkosUserId,
    issuer: WORKOS_ISSUER,
  });

  await seedIncentiveThresholdConfig(t, adminUserId);

  return {
    ...guardFixture,
    adminWorkosUserId,
    adminUserId,
    adminAuthed,
  };
}

describe("leads", () => {
  beforeEach(() => {
    vi.spyOn(authKit, "getAuthUser").mockImplementation(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity) {
        return null;
      }

      return buildAuthKitUser(identity.subject);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a submitted lead with normalized fields", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_create_happy", {
      guardName: "Rajesh Kumar",
    });

    const authed = t.withIdentity({
      subject: fixture.guardWorkosUserId,
      issuer: WORKOS_ISSUER,
    });

    const leadId = await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "12",
      flat_number: "a-1201",
      owner_name: "Sharma Ji",
      owner_phone: "+91 98765 43210",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const lead = await t.run(async (ctx) => await ctx.db.get(leadId));

    expect(lead).not.toBeNull();
    expect(lead?.status).toBe(LEAD_STATUS.SUBMITTED);
    expect(lead?.flat_number).toBe("A-1201");
    expect(lead?.owner_phone).toBe("9876543210");
    expect(lead?.submitted_by_guard_id).toBe(fixture.guardUserId);
    expect(lead?.society_id).toBe(fixture.societyId);
    expect(lead?.searchable_text).toContain("lead_create_happy society");
    expect(lead?.searchable_text).toContain("lead_create_happy tower");
    expect(lead?.searchable_text).toContain("a-1201");
    expect(lead?.searchable_text).toContain("rajesh kumar");
  });

  it("allows five submissions and rejects the sixth", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_rate_limit");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T10:00:00.000Z"));

    for (let i = 0; i < 3; i += 1) {
      await authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "10",
        flat_number: `R-${i + 1}`,
        owner_phone: `900000000${i}`,
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      });
    }

    vi.setSystemTime(new Date("2025-01-01T10:01:10.000Z"));

    for (let i = 3; i < 5; i += 1) {
      await authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "10",
        flat_number: `R-${i + 1}`,
        owner_phone: `900000000${i}`,
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      });
    }

    await expect(
      authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "11",
        flat_number: "R-6",
        owner_phone: "9111111111",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      }),
    ).rejects.toThrow("Daily lead limit reached");

    const allLeads = await t.run(async (ctx) => {
      return await ctx.db
        .query("leads")
        .withIndex("by_submitted_by_guard_id", (q) =>
          q.eq("submitted_by_guard_id", fixture.guardUserId),
        )
        .collect();
    });

    expect(allLeads).toHaveLength(5);
  });

  it("flags duplicate flat submissions", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_dup_flat");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    const firstLeadId = await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "3",
      flat_number: "A301",
      owner_phone: "9000000000",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const secondLeadId = await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "3",
      flat_number: "a301",
      owner_phone: "9000000001",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const secondLead = await t.run(async (ctx) => await ctx.db.get(secondLeadId));

    expect(secondLead?.status).toBe(LEAD_STATUS.POTENTIAL_DUPLICATE);
    expect(secondLead?.duplicate_of_lead_id).toBe(firstLeadId);
    expect(secondLead?.quality_flags).toContain(QUALITY_FLAGS.DUPLICATE_FLAT_MATCH);
  });

  it("flags duplicate owner phone submissions within the same society", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_dup_phone");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "6",
      flat_number: "601",
      owner_phone: "9222222222",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const secondLeadId = await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "7",
      flat_number: "701",
      owner_phone: "9222222222",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const secondLead = await t.run(async (ctx) => await ctx.db.get(secondLeadId));

    expect(secondLead?.status).toBe(LEAD_STATUS.POTENTIAL_DUPLICATE);
    expect(secondLead?.quality_flags).toContain(QUALITY_FLAGS.DUPLICATE_PHONE_MATCH);
  });

  it("does not flag duplicate phone across different societies", async () => {
    const t = createTestBackend();
    const firstFixture = await createGuardFixture(t, "lead_dup_diff_society_1");
    const secondFixture = await createGuardFixture(t, "lead_dup_diff_society_2");

    const firstGuard = t.withIdentity({
      subject: firstFixture.guardWorkosUserId,
      issuer: WORKOS_ISSUER,
    });
    const secondGuard = t.withIdentity({
      subject: secondFixture.guardWorkosUserId,
      issuer: WORKOS_ISSUER,
    });

    await firstGuard.mutation(api.leads.create, {
      building_id: firstFixture.buildingId,
      floor_number: "9",
      flat_number: "901",
      owner_phone: "9333333333",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const secondLeadId = await secondGuard.mutation(api.leads.create, {
      building_id: secondFixture.buildingId,
      floor_number: "9",
      flat_number: "902",
      owner_phone: "9333333333",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const secondLead = await t.run(async (ctx) => await ctx.db.get(secondLeadId));

    expect(secondLead?.status).toBe(LEAD_STATUS.SUBMITTED);
    expect(secondLead?.quality_flags).toBeUndefined();
  });

  it("ignores flat duplicates outside the 90-day window", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_dup_flat_expired");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    try {
      await t.mutation(internal.leads.__setNowOverrideForTests, {
        now_ms: Date.now() + 400 * 24 * 60 * 60 * 1000,
      });

      await authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "2",
        flat_number: "201",
        owner_phone: "9444444444",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      });

      await t.mutation(internal.leads.__setNowOverrideForTests, {
        now_ms: Date.now() + 800 * 24 * 60 * 60 * 1000,
      });

      const nextLeadId = await authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "2",
        flat_number: "201",
        owner_phone: "9444444445",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      });

      const nextLead = await t.run(async (ctx) => await ctx.db.get(nextLeadId));
      expect(nextLead?.status).toBe(LEAD_STATUS.SUBMITTED);
    } finally {
      await t.mutation(internal.leads.__setNowOverrideForTests, {});
    }
  });

  it("ignores phone duplicates outside the 30-day window", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_dup_phone_expired");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    try {
      await t.mutation(internal.leads.__setNowOverrideForTests, {
        now_ms: Date.now() + 120 * 24 * 60 * 60 * 1000,
      });

      await authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "4",
        flat_number: "401",
        owner_phone: "9555555555",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      });

      await t.mutation(internal.leads.__setNowOverrideForTests, {
        now_ms: Date.now() + 300 * 24 * 60 * 60 * 1000,
      });

      const nextLeadId = await authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "5",
        flat_number: "501",
        owner_phone: "9555555555",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      });

      const nextLead = await t.run(async (ctx) => await ctx.db.get(nextLeadId));
      expect(nextLead?.status).toBe(LEAD_STATUS.SUBMITTED);
    } finally {
      await t.mutation(internal.leads.__setNowOverrideForTests, {});
    }
  });

  it("does not dedup against REJECTED leads", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_dup_excluded_status");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.REJECTED,
      flatNumber: "R1201",
      ownerPhone: "9666666666",
    });

    const newLeadId = await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "12",
      flat_number: "R1201",
      owner_phone: "9666666666",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const newLead = await t.run(async (ctx) => await ctx.db.get(newLeadId));
    expect(newLead?.status).toBe(LEAD_STATUS.SUBMITTED);
    expect(newLead?.quality_flags).toBeUndefined();
  });

  it("adds GUARD_HIGH_REJECTION when guard has 5+ leads and over 50% rejected", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_high_rejection");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    for (let i = 0; i < 6; i += 1) {
      await createLeadRecord(t, {
        societyId: fixture.societyId,
        buildingId: fixture.buildingId,
        guardUserId: fixture.guardUserId,
        status: i < 4 ? LEAD_STATUS.REJECTED : LEAD_STATUS.SUBMITTED,
        flatNumber: `H${i}`,
        ownerPhone: `970000000${i}`,
      });
    }

    await t.mutation(internal.leads.__setNowOverrideForTests, {
      now_ms: Date.now() + 24 * 60 * 60 * 1000,
    });

    try {
      const leadId = await authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "15",
        flat_number: "1501",
        owner_phone: "9777777777",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      });

      const lead = await t.run(async (ctx) => await ctx.db.get(leadId));
      expect(lead?.quality_flags).toContain(QUALITY_FLAGS.GUARD_HIGH_REJECTION);
    } finally {
      await t.mutation(internal.leads.__setNowOverrideForTests, {});
    }
  });

  it("does not add GUARD_HIGH_REJECTION when guard has fewer than five leads", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_high_rejection_low_count");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    for (let i = 0; i < 3; i += 1) {
      await createLeadRecord(t, {
        societyId: fixture.societyId,
        buildingId: fixture.buildingId,
        guardUserId: fixture.guardUserId,
        status: LEAD_STATUS.REJECTED,
        flatNumber: `L${i}`,
        ownerPhone: `980000000${i}`,
      });
    }

    const leadId = await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "16",
      flat_number: "1601",
      owner_phone: "9888888888",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const lead = await t.run(async (ctx) => await ctx.db.get(leadId));
    expect(lead?.quality_flags?.includes(QUALITY_FLAGS.GUARD_HIGH_REJECTION) ?? false).toBe(false);
  });

  it("requires owner consent before submission", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_consent");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await expect(
      authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "1",
        flat_number: "101",
        owner_phone: "9998887776",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: false,
      }),
    ).rejects.toThrow("Owner consent is required to submit this lead.");
  });

  it("rejects submissions when guard's society is inactive", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_inactive_society", {
      societyStatus: SOCIETY_STATUS.INACTIVE,
    });
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await expect(
      authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "2",
        flat_number: "202",
        owner_phone: "9998887775",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      }),
    ).rejects.toThrow("Cannot submit leads for an inactive society.");
  });

  it("rejects submissions for buildings outside guard society", async () => {
    const t = createTestBackend();
    const firstFixture = await createGuardFixture(t, "lead_wrong_building_1");
    const secondFixture = await createGuardFixture(t, "lead_wrong_building_2");
    const authed = t.withIdentity({
      subject: firstFixture.guardWorkosUserId,
      issuer: WORKOS_ISSUER,
    });

    await expect(
      authed.mutation(api.leads.create, {
        building_id: secondFixture.buildingId,
        floor_number: "3",
        flat_number: "303",
        owner_phone: "9998887774",
        availability_type: AVAILABILITY_TYPE.VACANT_NOW,
        owner_consent_to_call: true,
      }),
    ).rejects.toThrow("Building does not belong to your society.");
  });

  it("requires availability_date when availability_type is VACANT_FROM", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_availability_validation");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await expect(
      authed.mutation(api.leads.create, {
        building_id: fixture.buildingId,
        floor_number: "4",
        flat_number: "404",
        owner_phone: "9998887773",
        availability_type: AVAILABILITY_TYPE.VACANT_FROM,
        owner_consent_to_call: true,
      }),
    ).rejects.toThrow("Availability date is required when type is VACANT_FROM");
  });

  it("updates NEED_INFO lead by guard and appends notes_thread", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_update_success");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    const existingNoteTimestamp = Date.now() - 60_000;
    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.NEED_INFO,
      notesThread: [
        {
          note: "Please confirm owner details",
          author_id: fixture.adminId,
          author_name: "Admin",
          author_type: "ADMIN",
          timestamp: existingNoteTimestamp,
        },
      ],
    });

    const updated = await authed.mutation(api.leads.updateByGuard, {
      lead_id: leadId,
      owner_phone: "+91 91234 56789",
      owner_name: "Updated Owner",
      notes: "Updated after speaking to owner",
      reply_note: "Owner details corrected",
    });

    expect(updated?.status).toBe(LEAD_STATUS.SUBMITTED);
    expect(updated?.owner_phone).toBe("9123456789");
    expect(updated?.owner_name).toBe("Updated Owner");
    expect(updated?.notes_thread).toHaveLength(2);
    expect(updated?.notes_thread?.[1]?.author_type).toBe("GUARD");
    expect(updated?.notes_thread?.[1]?.note).toBe("Owner details corrected");
  });

  it("rejects NEED_INFO update by non-owner guard", async () => {
    const t = createTestBackend();
    const firstFixture = await createGuardFixture(t, "lead_update_wrong_guard_1");
    const secondFixture = await createGuardFixture(t, "lead_update_wrong_guard_2");

    const leadId = await createLeadRecord(t, {
      societyId: firstFixture.societyId,
      buildingId: firstFixture.buildingId,
      guardUserId: firstFixture.guardUserId,
      status: LEAD_STATUS.NEED_INFO,
    });

    const secondGuardAuthed = t.withIdentity({
      subject: secondFixture.guardWorkosUserId,
      issuer: WORKOS_ISSUER,
    });

    await expect(
      secondGuardAuthed.mutation(api.leads.updateByGuard, {
        lead_id: leadId,
        reply_note: "Trying to update another guard lead",
      }),
    ).rejects.toThrow("You can only update your own leads.");
  });

  it("rejects guard update when lead status is not NEED_INFO", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_update_wrong_status");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    await expect(
      authed.mutation(api.leads.updateByGuard, {
        lead_id: leadId,
        reply_note: "This should fail",
      }),
    ).rejects.toThrow("Lead can only be updated when status is NEED_INFO.");
  });

  it("getMyLeads returns own leads with joined building and society names", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_query_all");
    const secondGuard = await createTestGuard(t, {
      workosUserId: "lead_query_all_other_guard",
      societyId: fixture.societyId,
      phone: "9999999998",
    });

    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "A1",
      ownerPhone: "9001111111",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.VERIFIED,
      flatNumber: "A2",
      ownerPhone: "9001111112",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: secondGuard,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "A3",
      ownerPhone: "9001111113",
    });

    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });
    const result = await authed.query(api.leads.getMyLeads, {
      paginationOpts: { numItems: 20, cursor: null },
      status_filter: "ALL",
    });

    expect(result.page).toHaveLength(2);
    expect(result.page.every((lead) => lead.submitted_by_guard_id === fixture.guardUserId)).toBe(
      true,
    );
    expect(result.page[0]?.building_name).toBe("lead_query_all Tower");
    expect(result.page[0]?.society_name).toBe("lead_query_all Society");
  });

  it("getMyLeads IN_REVIEW filter returns submitted, need_info, and potential_duplicate", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_query_in_review");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "B1",
      ownerPhone: "9002222201",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.NEED_INFO,
      flatNumber: "B2",
      ownerPhone: "9002222202",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.POTENTIAL_DUPLICATE,
      flatNumber: "B3",
      ownerPhone: "9002222203",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.VERIFIED,
      flatNumber: "B4",
      ownerPhone: "9002222204",
    });

    const result = await authed.query(api.leads.getMyLeads, {
      paginationOpts: { numItems: 20, cursor: null },
      status_filter: "IN_REVIEW",
    });

    const statuses = new Set(result.page.map((lead) => lead.status));
    expect(statuses.has(LEAD_STATUS.SUBMITTED)).toBe(true);
    expect(statuses.has(LEAD_STATUS.NEED_INFO)).toBe(true);
    expect(statuses.has(LEAD_STATUS.POTENTIAL_DUPLICATE)).toBe(true);
    expect(statuses.has(LEAD_STATUS.VERIFIED)).toBe(false);
  });

  it("getMyLeads VERIFIED filter returns only verified leads", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_query_verified");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.VERIFIED,
      flatNumber: "C1",
      ownerPhone: "9003333301",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "C2",
      ownerPhone: "9003333302",
    });

    const result = await authed.query(api.leads.getMyLeads, {
      paginationOpts: { numItems: 20, cursor: null },
      status_filter: "VERIFIED",
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0]?.status).toBe(LEAD_STATUS.VERIFIED);
  });

  it("getMyLeads REJECTED filter returns rejected and duplicate leads", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_query_rejected");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.REJECTED,
      flatNumber: "D1",
      ownerPhone: "9004444401",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.DUPLICATE,
      flatNumber: "D2",
      ownerPhone: "9004444402",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.NEED_INFO,
      flatNumber: "D3",
      ownerPhone: "9004444403",
    });

    const result = await authed.query(api.leads.getMyLeads, {
      paginationOpts: { numItems: 20, cursor: null },
      status_filter: "REJECTED",
    });

    expect(result.page).toHaveLength(2);
    expect(result.page.every((lead) => lead.status !== LEAD_STATUS.NEED_INFO)).toBe(true);
    expect(result.page.some((lead) => lead.status === LEAD_STATUS.REJECTED)).toBe(true);
    expect(result.page.some((lead) => lead.status === LEAD_STATUS.DUPLICATE)).toBe(true);
  });

  it("getSubmissionCount returns today's count in IST", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_submission_count");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "9",
      flat_number: "Y2",
      owner_phone: "9111000002",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });
    await authed.mutation(api.leads.create, {
      building_id: fixture.buildingId,
      floor_number: "9",
      flat_number: "Y3",
      owner_phone: "9111000003",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
    });

    const countResult = await authed.query(api.leads.getSubmissionCount, {});

    expect(countResult).toEqual({
      count: 2,
      limit: 5,
    });
  });

  it("getMyLeadById returns joined data and notes_thread", async () => {
    const t = createTestBackend();
    const fixture = await createGuardFixture(t, "lead_get_by_id");
    const authed = t.withIdentity({ subject: fixture.guardWorkosUserId, issuer: WORKOS_ISSUER });

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.NEED_INFO,
      notesThread: [
        {
          note: "Need more info",
          author_id: fixture.adminId,
          author_name: "Admin",
          author_type: "ADMIN",
          timestamp: Date.now(),
        },
      ],
    });

    const lead = await authed.query(api.leads.getMyLeadById, {
      lead_id: leadId,
    });

    expect(lead._id).toBe(leadId);
    expect(lead.building_name).toBe("lead_get_by_id Tower");
    expect(lead.society_name).toBe("lead_get_by_id Society");
    expect(lead.notes_thread).toHaveLength(1);
    expect(lead.notes_thread[0]?.note).toBe("Need more info");
  });

  it("getMyLeadById enforces ownership", async () => {
    const t = createTestBackend();
    const firstFixture = await createGuardFixture(t, "lead_get_by_id_owner_1");
    const secondFixture = await createGuardFixture(t, "lead_get_by_id_owner_2");

    const leadId = await createLeadRecord(t, {
      societyId: firstFixture.societyId,
      buildingId: firstFixture.buildingId,
      guardUserId: firstFixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    const secondGuard = t.withIdentity({
      subject: secondFixture.guardWorkosUserId,
      issuer: WORKOS_ISSUER,
    });

    await expect(
      secondGuard.query(api.leads.getMyLeadById, {
        lead_id: leadId,
      }),
    ).rejects.toThrow("Lead not found");
  });

  it("requestInfo transitions SUBMITTED to NEED_INFO and appends admin note", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_request_info_success");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    const updated = await fixture.adminAuthed.mutation(api.leads.requestInfo, {
      lead_id: leadId,
      note: "Please confirm owner alternate number",
    });

    expect(updated?.status).toBe(LEAD_STATUS.NEED_INFO);
    expect(updated?.notes_thread).toHaveLength(1);
    expect(updated?.notes_thread?.[0]?.author_type).toBe("ADMIN");
    expect(updated?.notes_thread?.[0]?.author_id).toBe(fixture.adminUserId);
    expect(updated?.notes_thread?.[0]?.note).toBe("Please confirm owner alternate number");
  });

  it("requestInfo rejects invalid status transitions", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_request_info_invalid");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.NEED_INFO,
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.requestInfo, {
        lead_id: leadId,
        note: "Already requested",
      }),
    ).rejects.toThrow("Cannot request info on a lead with status: NEED_INFO");
  });

  it("requestInfo enforces leads.request_info permission", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_request_info_rbac", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.requestInfo, {
        lead_id: leadId,
        note: "Need more details",
      }),
    ).rejects.toThrow("Missing permission: leads.request_info");
  });

  it("reject works from SUBMITTED and prefixes rejection note", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_reject_submitted");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    const updated = await fixture.adminAuthed.mutation(api.leads.reject, {
      lead_id: leadId,
      reason: "Owner declined listing",
    });

    expect(updated?.status).toBe(LEAD_STATUS.REJECTED);
    expect(updated?.notes_thread?.[0]?.note).toBe("Rejected: Owner declined listing");
    expect(updated?.notes_thread?.[0]?.author_type).toBe("ADMIN");
  });

  it("reject works from NEED_INFO", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_reject_need_info");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.NEED_INFO,
    });

    const updated = await fixture.adminAuthed.mutation(api.leads.reject, {
      lead_id: leadId,
      reason: "Owner number invalid",
    });

    expect(updated?.status).toBe(LEAD_STATUS.REJECTED);
  });

  it("reject blocks terminal re-rejection and enforces permission", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_reject_terminal");

    const rejectedLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.REJECTED,
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.reject, {
        lead_id: rejectedLeadId,
        reason: "Should fail",
      }),
    ).rejects.toThrow("Cannot reject a lead with status: REJECTED");

    const restrictedFixture = await createLeadAdminFixture(t, "lead_admin_reject_rbac", [
      PERMISSIONS.LEADS_VIEW,
    ]);
    const leadId = await createLeadRecord(t, {
      societyId: restrictedFixture.societyId,
      buildingId: restrictedFixture.buildingId,
      guardUserId: restrictedFixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    await expect(
      restrictedFixture.adminAuthed.mutation(api.leads.reject, {
        lead_id: leadId,
        reason: "No permission",
      }),
    ).rejects.toThrow("Missing permission: leads.reject");
  });

  it("reject blocks when a linked visit is in progress", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_reject_in_progress_visit");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.VERIFIED,
      flatNumber: "IP-101",
      ownerPhone: "9888000401",
    });

    await createVisitRecord(t, {
      leadId,
      societyId: fixture.societyId,
      guardUserId: fixture.guardUserId,
      adminUserId: fixture.adminUserId,
      status: VISIT_STATUS.IN_PROGRESS,
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.reject, {
        lead_id: leadId,
        reason: "Owner changed mind",
      }),
    ).rejects.toThrow("Cannot reject lead while a linked visit is IN_PROGRESS.");
  });

  it("markDuplicate sets duplicate_of_lead_id and optional reason note", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_mark_duplicate_success");

    const originalLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "A-101",
      ownerPhone: "9009990001",
    });
    const duplicateLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.POTENTIAL_DUPLICATE,
      flatNumber: "A-101",
      ownerPhone: "9009990002",
    });

    const updated = await fixture.adminAuthed.mutation(api.leads.markDuplicate, {
      lead_id: duplicateLeadId,
      original_lead_id: originalLeadId,
      reason: "Same owner and same flat",
    });

    expect(updated?.status).toBe(LEAD_STATUS.DUPLICATE);
    expect(updated?.duplicate_of_lead_id).toBe(originalLeadId);
    expect(updated?.notes_thread?.[0]?.note).toContain(
      "Marked duplicate: Same owner and same flat",
    );
  });

  it("markDuplicate rejects wrong status, missing original lead, and missing permission", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_mark_duplicate_errors");

    const submittedLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });
    const originalLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "B-202",
      ownerPhone: "9009990011",
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.markDuplicate, {
        lead_id: submittedLeadId,
        original_lead_id: originalLeadId,
      }),
    ).rejects.toThrow("Can only mark POTENTIAL_DUPLICATE leads as duplicate.");

    const potentialLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.POTENTIAL_DUPLICATE,
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(originalLeadId);
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.markDuplicate, {
        lead_id: potentialLeadId,
        original_lead_id: originalLeadId,
      }),
    ).rejects.toThrow("Original lead not found.");

    const restrictedFixture = await createLeadAdminFixture(t, "lead_admin_mark_duplicate_rbac", [
      PERMISSIONS.LEADS_VIEW,
    ]);
    const restrictedPotentialLead = await createLeadRecord(t, {
      societyId: restrictedFixture.societyId,
      buildingId: restrictedFixture.buildingId,
      guardUserId: restrictedFixture.guardUserId,
      status: LEAD_STATUS.POTENTIAL_DUPLICATE,
    });
    const restrictedOriginalLead = await createLeadRecord(t, {
      societyId: restrictedFixture.societyId,
      buildingId: restrictedFixture.buildingId,
      guardUserId: restrictedFixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "C-303",
      ownerPhone: "9009990022",
    });

    await expect(
      restrictedFixture.adminAuthed.mutation(api.leads.markDuplicate, {
        lead_id: restrictedPotentialLead,
        original_lead_id: restrictedOriginalLead,
      }),
    ).rejects.toThrow("Missing permission: leads.mark_duplicate");
  });

  it("clearDuplicateFlag removes duplicate flags, preserves GUARD_HIGH_REJECTION, and clears duplicate reference", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_clear_duplicate_success");

    const originalLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.POTENTIAL_DUPLICATE,
      qualityFlags: [
        QUALITY_FLAGS.DUPLICATE_FLAT_MATCH,
        QUALITY_FLAGS.DUPLICATE_PHONE_MATCH,
        QUALITY_FLAGS.GUARD_HIGH_REJECTION,
      ],
      duplicateOfLeadId: originalLeadId,
    });

    const updated = await fixture.adminAuthed.mutation(api.leads.clearDuplicateFlag, {
      lead_id: leadId,
    });

    expect(updated?.status).toBe(LEAD_STATUS.SUBMITTED);
    expect(updated?.quality_flags).toEqual([QUALITY_FLAGS.GUARD_HIGH_REJECTION]);
    expect(updated?.duplicate_of_lead_id).toBeUndefined();
  });

  it("clearDuplicateFlag sets quality_flags to undefined when only duplicate flags exist", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_clear_duplicate_empty_flags");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.POTENTIAL_DUPLICATE,
      qualityFlags: [QUALITY_FLAGS.DUPLICATE_FLAT_MATCH, QUALITY_FLAGS.DUPLICATE_PHONE_MATCH],
    });

    const updated = await fixture.adminAuthed.mutation(api.leads.clearDuplicateFlag, {
      lead_id: leadId,
    });

    expect(updated?.status).toBe(LEAD_STATUS.SUBMITTED);
    expect(updated?.quality_flags).toBeUndefined();
  });

  it("clearDuplicateFlag rejects wrong status", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_clear_duplicate_wrong_status");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.clearDuplicateFlag, {
        lead_id: leadId,
      }),
    ).rejects.toThrow("Can only clear duplicate flag on POTENTIAL_DUPLICATE leads.");
  });

  it("setBounty works on non-terminal statuses", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_set_bounty_success");

    const statuses = [
      LEAD_STATUS.SUBMITTED,
      LEAD_STATUS.VERIFIED,
      LEAD_STATUS.POTENTIAL_DUPLICATE,
    ] as const;

    for (const [index, status] of statuses.entries()) {
      const leadId = await createLeadRecord(t, {
        societyId: fixture.societyId,
        buildingId: fixture.buildingId,
        guardUserId: fixture.guardUserId,
        status,
        flatNumber: `B${index + 1}`,
        ownerPhone: `911111110${index}`,
      });

      const updated = await fixture.adminAuthed.mutation(api.leads.setBounty, {
        lead_id: leadId,
        amount: 250000,
      });

      expect(updated?.prospective_bounty).toBe(250000);
    }
  });

  it("setBounty rejects terminal statuses and invalid amount", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_set_bounty_failures");

    const rejectedLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.REJECTED,
      flatNumber: "T-1",
      ownerPhone: "9222333441",
    });
    const duplicateLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.DUPLICATE,
      flatNumber: "T-2",
      ownerPhone: "9222333442",
    });
    const submittedLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "T-3",
      ownerPhone: "9222333443",
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.setBounty, {
        lead_id: rejectedLeadId,
        amount: 100000,
      }),
    ).rejects.toThrow("Cannot set bounty on a terminated lead.");

    await expect(
      fixture.adminAuthed.mutation(api.leads.setBounty, {
        lead_id: duplicateLeadId,
        amount: 100000,
      }),
    ).rejects.toThrow("Cannot set bounty on a terminated lead.");

    await expect(
      fixture.adminAuthed.mutation(api.leads.setBounty, {
        lead_id: submittedLeadId,
        amount: 0,
      }),
    ).rejects.toThrow("Bounty amount must be a positive whole number in paise.");
  });

  it("setBounty enforces leads.set_bounty permission", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_set_bounty_rbac", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.setBounty, {
        lead_id: leadId,
        amount: 100000,
      }),
    ).rejects.toThrow("Missing permission: leads.set_bounty");
  });

  it("list supports pagination and includes join data", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_list_pagination", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    for (let i = 0; i < 3; i += 1) {
      await createLeadRecord(t, {
        societyId: fixture.societyId,
        buildingId: fixture.buildingId,
        guardUserId: fixture.guardUserId,
        status: LEAD_STATUS.SUBMITTED,
        flatNumber: `L-${i + 1}`,
        ownerPhone: `933300000${i}`,
      });
    }

    const result = await fixture.adminAuthed.query(api.leads.list, {
      paginationOpts: { numItems: 2, cursor: null },
    });

    expect(result.page).toHaveLength(2);
    expect(result.isDone).toBe(false);
    expect(result.page[0]?.guard_name).toBeDefined();
    expect(result.page[0]?.building_name).toContain("Tower");
    expect(result.page[0]?.society_name).toBeDefined();
  });

  it("list supports status and society filters", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_list_filters", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    const secondSocietyId = await createTestSociety(t, {
      adminId: fixture.adminUserId,
      name: "Second Society",
    });
    const secondBuildingId = await createTestBuilding(t, {
      societyId: secondSocietyId,
      name: "Second Tower",
    });

    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "F-1",
      ownerPhone: "9444000001",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.REJECTED,
      flatNumber: "F-2",
      ownerPhone: "9444000002",
    });
    await createLeadRecord(t, {
      societyId: secondSocietyId,
      buildingId: secondBuildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "F-3",
      ownerPhone: "9444000003",
    });

    const statusFiltered = await fixture.adminAuthed.query(api.leads.list, {
      paginationOpts: { numItems: 20, cursor: null },
      status: LEAD_STATUS.SUBMITTED,
    });
    expect(statusFiltered.page.every((lead) => lead.status === LEAD_STATUS.SUBMITTED)).toBe(true);

    const societyFiltered = await fixture.adminAuthed.query(api.leads.list, {
      paginationOpts: { numItems: 20, cursor: null },
      society_id: fixture.societyId,
    });
    expect(societyFiltered.page.every((lead) => lead.society_id === fixture.societyId)).toBe(true);
  });

  it("list search branch returns relevance results with post-query filters", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_list_search", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    const secondBuildingId = await createTestBuilding(t, {
      societyId: fixture.societyId,
      name: "Search Secondary Tower",
    });

    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "S-1",
      ownerPhone: "9555000001",
      searchableText: "sunrise tower s-1 owner-a",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: secondBuildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "S-2",
      ownerPhone: "9555000002",
      searchableText: "sunrise secondary s-2 owner-b",
    });

    const searchResult = await fixture.adminAuthed.query(api.leads.list, {
      paginationOpts: { numItems: 20, cursor: null },
      search: "sunrise",
      building_id: fixture.buildingId,
    });

    expect(searchResult.isDone).toBe(true);
    expect(searchResult.continueCursor).toBe("");
    expect(searchResult.page).toHaveLength(1);
    expect(searchResult.page[0]?.building_id).toBe(fixture.buildingId);
    expect(searchResult.page[0]?.guard_name).toBeDefined();
  });

  it("getById returns joined guard, building, society, duplicate lead, and verifications", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_get_by_id", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    const originalLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "G-1",
      ownerPhone: "9666000001",
    });
    const targetLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.POTENTIAL_DUPLICATE,
      flatNumber: "G-2",
      ownerPhone: "9666000002",
      duplicateOfLeadId: originalLeadId,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("owner_verifications", {
        lead_id: targetLeadId,
        called_by_admin_id: fixture.adminUserId,
        call_outcome: "UNREACHABLE",
        consent_contact_demorentals: false,
        verified_at: Date.now(),
      });
    });

    const result = await fixture.adminAuthed.query(api.leads.getById, {
      lead_id: targetLeadId,
    });

    expect(result._id).toBe(targetLeadId);
    expect(result.guard?.name).toBeDefined();
    expect(result.guard?.email).toContain("@guards.local");
    expect(result.guard?.guard_type).toBe("MAIN_GATE");
    expect(result.building?.name).toContain("Tower");
    expect(result.building?.total_floors).toBe(20);
    expect(result.society?.city).toBe("Mumbai");
    expect(result.duplicate_lead?.lead_id).toBe(originalLeadId);
    expect(result.verifications).toHaveLength(1);
  });

  it("getById throws for non-existent lead", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_get_by_id_missing", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(leadId);
    });

    await expect(
      fixture.adminAuthed.query(api.leads.getById, {
        lead_id: leadId,
      }),
    ).rejects.toThrow("Lead not found");
  });

  it("admin lead queries enforce leads.view permission", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_query_rbac", []);

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      searchableText: "rbac lead",
    });

    await expect(
      fixture.adminAuthed.query(api.leads.list, {
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).rejects.toThrow("Missing permission: leads.view");

    await expect(
      fixture.adminAuthed.query(api.leads.getById, {
        lead_id: leadId,
      }),
    ).rejects.toThrow("Missing permission: leads.view");

    await expect(fixture.adminAuthed.query(api.leads.getStatusCounts, {})).rejects.toThrow(
      "Missing permission: leads.view",
    );
  });

  it("getStatusCounts returns per-status counts and supports society filter", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_status_counts", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    const secondSocietyId = await createTestSociety(t, {
      adminId: fixture.adminUserId,
      name: "Counts Society Two",
    });
    const secondBuildingId = await createTestBuilding(t, {
      societyId: secondSocietyId,
      name: "Counts Tower Two",
    });

    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "C-1",
      ownerPhone: "9777000001",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.NEED_INFO,
      flatNumber: "C-2",
      ownerPhone: "9777000002",
    });
    await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.REJECTED,
      flatNumber: "C-3",
      ownerPhone: "9777000003",
    });
    await createLeadRecord(t, {
      societyId: secondSocietyId,
      buildingId: secondBuildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "C-4",
      ownerPhone: "9777000004",
    });

    const allCounts = await fixture.adminAuthed.query(api.leads.getStatusCounts, {});
    expect(allCounts[LEAD_STATUS.SUBMITTED]).toBe(2);
    expect(allCounts[LEAD_STATUS.NEED_INFO]).toBe(1);
    expect(allCounts[LEAD_STATUS.REJECTED]).toBe(1);

    const societyCounts = await fixture.adminAuthed.query(api.leads.getStatusCounts, {
      society_id: fixture.societyId,
    });
    expect(societyCounts[LEAD_STATUS.SUBMITTED]).toBe(1);
    expect(societyCounts[LEAD_STATUS.NEED_INFO]).toBe(1);
    expect(societyCounts[LEAD_STATUS.REJECTED]).toBe(1);
  });

  it("verification create sets lead to VERIFIED when outcome is VERIFIED with consent true", async () => {
    const t = createTestBackend();
    const fixture = await createVerificationAdminFixture(t, "verification_verified_consent_true");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "V-101",
      ownerPhone: "9888000001",
    });

    await fixture.adminAuthed.mutation(createVerificationRef, {
      lead_id: leadId,
      call_outcome: CALL_OUTCOME.VERIFIED,
      consent_contact_demorentals: true,
    });

    const [updatedLead, verifications] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.get(leadId),
        ctx.db
          .query("owner_verifications")
          .withIndex("by_lead_id", (q) => q.eq("lead_id", leadId))
          .collect(),
      ]);
    });

    expect(updatedLead?.status).toBe(LEAD_STATUS.VERIFIED);
    expect(verifications).toHaveLength(1);
    expect(verifications[0]?.lead_id).toBe(leadId);
    expect(verifications[0]?.call_outcome).toBe(CALL_OUTCOME.VERIFIED);
  });

  it("verification create keeps lead SUBMITTED when outcome is VERIFIED with consent false", async () => {
    const t = createTestBackend();
    const fixture = await createVerificationAdminFixture(t, "verification_verified_consent_false");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "V-102",
      ownerPhone: "9888000002",
    });

    await fixture.adminAuthed.mutation(createVerificationRef, {
      lead_id: leadId,
      call_outcome: CALL_OUTCOME.VERIFIED,
      consent_contact_demorentals: false,
    });

    const [updatedLead, verifications] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.get(leadId),
        ctx.db
          .query("owner_verifications")
          .withIndex("by_lead_id", (q) => q.eq("lead_id", leadId))
          .collect(),
      ]);
    });

    expect(updatedLead?.status).toBe(LEAD_STATUS.SUBMITTED);
    expect(verifications).toHaveLength(1);
    expect(verifications[0]?.lead_id).toBe(leadId);
    expect(verifications[0]?.call_outcome).toBe(CALL_OUTCOME.VERIFIED);
  });

  it("verification create keeps lead SUBMITTED when outcome is UNREACHABLE", async () => {
    const t = createTestBackend();
    const fixture = await createVerificationAdminFixture(t, "verification_unreachable");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "V-103",
      ownerPhone: "9888000003",
    });

    await fixture.adminAuthed.mutation(createVerificationRef, {
      lead_id: leadId,
      call_outcome: CALL_OUTCOME.UNREACHABLE,
      consent_contact_demorentals: false,
    });

    const [updatedLead, verifications] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.get(leadId),
        ctx.db
          .query("owner_verifications")
          .withIndex("by_lead_id", (q) => q.eq("lead_id", leadId))
          .collect(),
      ]);
    });

    expect(updatedLead?.status).toBe(LEAD_STATUS.SUBMITTED);
    expect(verifications).toHaveLength(1);
    expect(verifications[0]?.lead_id).toBe(leadId);
    expect(verifications[0]?.call_outcome).toBe(CALL_OUTCOME.UNREACHABLE);
  });

  it("verification create sets lead to REJECTED when outcome is DECLINED", async () => {
    const t = createTestBackend();
    const fixture = await createVerificationAdminFixture(t, "verification_declined");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "V-104",
      ownerPhone: "9888000004",
    });

    await fixture.adminAuthed.mutation(createVerificationRef, {
      lead_id: leadId,
      call_outcome: CALL_OUTCOME.DECLINED,
      consent_contact_demorentals: false,
    });

    const [updatedLead, verifications] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.get(leadId),
        ctx.db
          .query("owner_verifications")
          .withIndex("by_lead_id", (q) => q.eq("lead_id", leadId))
          .collect(),
      ]);
    });

    expect(updatedLead?.status).toBe(LEAD_STATUS.REJECTED);
    expect(verifications).toHaveLength(1);
    expect(verifications[0]?.lead_id).toBe(leadId);
    expect(verifications[0]?.call_outcome).toBe(CALL_OUTCOME.DECLINED);
  });

  it("verification create sets lead to REJECTED when outcome is FALSE", async () => {
    const t = createTestBackend();
    const fixture = await createVerificationAdminFixture(t, "verification_false");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "V-105",
      ownerPhone: "9888000005",
    });

    await fixture.adminAuthed.mutation(createVerificationRef, {
      lead_id: leadId,
      call_outcome: CALL_OUTCOME.FALSE,
      consent_contact_demorentals: false,
    });

    const updatedLead = await t.run(async (ctx) => await ctx.db.get(leadId));
    expect(updatedLead?.status).toBe(LEAD_STATUS.REJECTED);
  });

  it("verification create enforces leads.verify permission", async () => {
    const t = createTestBackend();
    const fixture = await createVerificationAdminFixture(t, "verification_rbac", [
      PERMISSIONS.LEADS_VIEW,
    ]);

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "V-106",
      ownerPhone: "9888000006",
    });

    await expect(
      fixture.adminAuthed.mutation(createVerificationRef, {
        lead_id: leadId,
        call_outcome: CALL_OUTCOME.UNREACHABLE,
        consent_contact_demorentals: false,
      }),
    ).rejects.toThrow("Missing permission: leads.verify");
  });

  it("verification create only allows SUBMITTED leads", async () => {
    const t = createTestBackend();
    const fixture = await createVerificationAdminFixture(t, "verification_status_gate");
    const blockedStatuses = [
      LEAD_STATUS.NEED_INFO,
      LEAD_STATUS.VERIFIED,
      LEAD_STATUS.REJECTED,
      LEAD_STATUS.DUPLICATE,
    ] as const;

    for (const [index, status] of blockedStatuses.entries()) {
      const leadId = await createLeadRecord(t, {
        societyId: fixture.societyId,
        buildingId: fixture.buildingId,
        guardUserId: fixture.guardUserId,
        status,
        flatNumber: `V-20${index}`,
        ownerPhone: `988800010${index}`,
      });

      await expect(
        fixture.adminAuthed.mutation(createVerificationRef, {
          lead_id: leadId,
          call_outcome: CALL_OUTCOME.UNREACHABLE,
          consent_contact_demorentals: false,
        }),
      ).rejects.toThrow(`Cannot verify a lead with status: ${status}`);
    }
  });

  it("reject supports VERIFIED to REJECTED transition and appends note", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_reject_verified");

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.VERIFIED,
      notesThread: [
        {
          note: "Verified by owner call",
          author_id: fixture.adminUserId,
          author_name: `Admin ${fixture.adminWorkosUserId}`,
          author_type: "ADMIN",
          timestamp: Date.now() - 1000,
        },
      ],
    });

    const updated = await fixture.adminAuthed.mutation(api.leads.reject, {
      lead_id: leadId,
      reason: "Owner backed out after verification",
    });

    expect(updated?.status).toBe(LEAD_STATUS.REJECTED);
    expect(updated?.notes_thread).toHaveLength(2);
    expect(updated?.notes_thread?.[1]?.note).toBe("Rejected: Owner backed out after verification");
    expect(updated?.notes_thread?.[1]?.author_type).toBe("ADMIN");
  });

  it("reject still blocks terminal statuses", async () => {
    const t = createTestBackend();
    const fixture = await createLeadAdminFixture(t, "lead_admin_reject_terminal_regression");

    const rejectedLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.REJECTED,
      flatNumber: "V-301",
      ownerPhone: "9888000201",
    });

    const duplicateLeadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.DUPLICATE,
      flatNumber: "V-302",
      ownerPhone: "9888000202",
    });

    await expect(
      fixture.adminAuthed.mutation(api.leads.reject, {
        lead_id: rejectedLeadId,
        reason: "Should fail",
      }),
    ).rejects.toThrow("Cannot reject a lead with status: REJECTED");

    await expect(
      fixture.adminAuthed.mutation(api.leads.reject, {
        lead_id: duplicateLeadId,
        reason: "Should fail",
      }),
    ).rejects.toThrow("Cannot reject a lead with status: DUPLICATE");
  });

  it("listByLead returns verification attempts with admin names in newest-first order", async () => {
    const t = createTestBackend();
    const fixture = await createVerificationAdminFixture(t, "verification_list_by_lead");
    const secondAdminWorkosUserId = "verification_list_by_lead_admin_two";

    await createTestAdmin(t, secondAdminWorkosUserId, {
      permissions: VERIFICATION_ADMIN_PERMISSIONS,
    });

    const secondAdminAuthed = t.withIdentity({
      subject: secondAdminWorkosUserId,
      issuer: WORKOS_ISSUER,
    });

    const leadId = await createLeadRecord(t, {
      societyId: fixture.societyId,
      buildingId: fixture.buildingId,
      guardUserId: fixture.guardUserId,
      status: LEAD_STATUS.SUBMITTED,
      flatNumber: "V-401",
      ownerPhone: "9888000301",
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T10:00:00.000Z"));
    await fixture.adminAuthed.mutation(createVerificationRef, {
      lead_id: leadId,
      call_outcome: CALL_OUTCOME.UNREACHABLE,
      consent_contact_demorentals: false,
      notes: "first attempt",
    });

    vi.setSystemTime(new Date("2025-01-01T10:05:00.000Z"));
    await secondAdminAuthed.mutation(createVerificationRef, {
      lead_id: leadId,
      call_outcome: CALL_OUTCOME.VERIFIED,
      consent_contact_demorentals: false,
      notes: "second attempt",
    });

    vi.setSystemTime(new Date("2025-01-01T10:10:00.000Z"));
    await fixture.adminAuthed.mutation(createVerificationRef, {
      lead_id: leadId,
      call_outcome: CALL_OUTCOME.UNREACHABLE,
      consent_contact_demorentals: false,
      notes: "third attempt",
    });

    const attempts = await fixture.adminAuthed.query(listVerificationsByLeadRef, {
      lead_id: leadId,
    });

    expect(attempts).toHaveLength(3);
    expect(attempts[0]?.notes).toBe("third attempt");
    expect(attempts[0]?.admin_name).toBe(`Admin ${fixture.adminWorkosUserId}`);
    expect(attempts[1]?.notes).toBe("second attempt");
    expect(attempts[1]?.admin_name).toBe(`Admin ${secondAdminWorkosUserId}`);
    expect(attempts[2]?.notes).toBe("first attempt");
    expect(attempts[2]?.admin_name).toBe(`Admin ${fixture.adminWorkosUserId}`);
    expect(attempts[0]?.verified_at).toBeGreaterThan(attempts[1]?.verified_at ?? 0);
    expect(attempts[1]?.verified_at).toBeGreaterThan(attempts[2]?.verified_at ?? 0);
  });
});
