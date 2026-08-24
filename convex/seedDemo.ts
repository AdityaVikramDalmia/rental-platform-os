// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { internalMutation, internalQuery } from "./functions";
import { SYSTEM_CONFIG_KEYS } from "../lib/constants";

const SEED_DEMO_VERSION = "3.4";
const SEED_DEMO_VERSION_KEY = SYSTEM_CONFIG_KEYS.SEED_DEMO_VERSION;

const DEMO_EMAILS = {
  founder_one: "admin@example.com",
  agent: "agent@example.com",
  guard1: "9999999999@guards.local",
  guard2: "9876543210@guards.local",
  guard3: "9765432109@guards.local",
  ops1: "8888888888@ops.local",
  ops2: "7777777777@ops.local",
  tenant1: "tenant1@test.demorentals.com",
  tenant2: "tenant2@test.demorentals.com",
  owner1: "owner1@test.demorentals.com",
  owner2: "owner2@test.demorentals.com",
} as const;

const DEMO_PHONES = {
  guard1: "9999999999",
  guard2: "9876543210",
  guard3: "9765432109",
  ops1: "8888888888",
  ops2: "7777777777",
  tenant1: "9111111111",
  tenant2: "9222222222",
  owner1: "7000000001",
  owner2: "7000000002",
} as const;

function floorLabels(totalFloors: number): string[] {
  return Array.from({ length: totalFloors }, (_, index) => (index === 0 ? "Ground" : `${index}`));
}

function dayKey(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export const seedDemoCheck = internalQuery({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SEED_DEMO_VERSION_KEY))
      .first();

    return {
      isSeeded: !!existing,
      version: existing?.value ?? null,
    };
  },
});

export const seedDemoUsers = internalMutation({
  args: {
    workosUserMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const accountDefinitions: Array<{
      email: string;
      user_type: Doc<"users">["user_type"];
      name: string;
      phone?: string;
      storeEmail: boolean;
    }> = [
      {
        email: DEMO_EMAILS.founder_one,
        user_type: "ADMIN",
        name: "Test Admin",
        storeEmail: true,
      },
      {
        email: DEMO_EMAILS.agent,
        user_type: "ADMIN",
        name: "Agent Bot",
        storeEmail: true,
      },
      {
        email: DEMO_EMAILS.guard1,
        user_type: "GUARD",
        name: "Test Guard",
        phone: DEMO_PHONES.guard1,
        storeEmail: false,
      },
      {
        email: DEMO_EMAILS.guard2,
        user_type: "GUARD",
        name: "Rajesh Kumar",
        phone: DEMO_PHONES.guard2,
        storeEmail: false,
      },
      {
        email: DEMO_EMAILS.guard3,
        user_type: "GUARD",
        name: "Suresh Patel",
        phone: DEMO_PHONES.guard3,
        storeEmail: false,
      },
      {
        email: DEMO_EMAILS.ops1,
        user_type: "OPS",
        name: "Test OPS Agent",
        phone: DEMO_PHONES.ops1,
        storeEmail: false,
      },
      {
        email: DEMO_EMAILS.ops2,
        user_type: "OPS",
        name: "Priya Sharma",
        phone: DEMO_PHONES.ops2,
        storeEmail: false,
      },
      {
        email: DEMO_EMAILS.tenant1,
        user_type: "TENANT",
        name: "Ankit Mehta",
        phone: DEMO_PHONES.tenant1,
        storeEmail: true,
      },
      {
        email: DEMO_EMAILS.tenant2,
        user_type: "TENANT",
        name: "Sneha Reddy",
        phone: DEMO_PHONES.tenant2,
        storeEmail: true,
      },
      {
        email: DEMO_EMAILS.owner1,
        user_type: "OWNER",
        name: "Ramesh Gupta",
        phone: DEMO_PHONES.owner1,
        storeEmail: true,
      },
      {
        email: DEMO_EMAILS.owner2,
        user_type: "OWNER",
        name: "Kavita Joshi",
        phone: DEMO_PHONES.owner2,
        storeEmail: true,
      },
    ];

    for (const account of accountDefinitions) {
      const workosUserId = args.workosUserMap[account.email];
      if (!workosUserId) {
        console.warn(`seedDemoUsers: Missing WorkOS ID for ${account.email}, skipping.`);
        continue;
      }

      const existing = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", workosUserId))
        .first();

      if (!existing) {
        await ctx.db.insert("users", {
          workos_user_id: workosUserId,
          user_type: account.user_type,
          user_types: [account.user_type],
          active_persona: account.user_type,
          name: account.name,
          phone: account.phone,
          email: account.storeEmail ? account.email : undefined,
          status: "ACTIVE",
          must_change_password: false,
        });
        continue;
      }

      const patch: Partial<Doc<"users">> = {};
      if (existing.name !== account.name) {
        patch.name = account.name;
      }
      if (existing.user_type !== account.user_type) {
        patch.user_type = account.user_type;
      }
      if (existing.phone !== account.phone) {
        patch.phone = account.phone;
      }
      if ((account.storeEmail ? account.email : undefined) !== existing.email) {
        patch.email = account.storeEmail ? account.email : undefined;
      }
      if (existing.status !== "ACTIVE") {
        patch.status = "ACTIVE";
      }
      if (existing.must_change_password) {
        patch.must_change_password = false;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
      }
    }

    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.founder_one))
      .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
      .first();
    if (!founder_one) {
      throw new Error("seedDemoUsers: Missing Test Admin user");
    }

    const testSociety = await ctx.db
      .query("societies")
      .withIndex("by_name", (q) => q.eq("name", "Test Society"))
      .first();
    if (!testSociety) {
      throw new Error("seedDemoUsers: Missing Test Society from base seed");
    }

    const guardProfileDefinitions = [
      { email: DEMO_EMAILS.guard2, guardType: "MAIN_GATE" as const },
      { email: DEMO_EMAILS.guard3, guardType: "BUILDING_SPECIFIC" as const },
    ];

    for (const definition of guardProfileDefinitions) {
      const workosUserId = args.workosUserMap[definition.email];
      if (!workosUserId) {
        continue;
      }

      const guardUser = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", workosUserId))
        .filter((q) => q.eq(q.field("user_type"), "GUARD"))
        .first();

      if (!guardUser) {
        continue;
      }

      const existingProfile = await ctx.db
        .query("guard_profiles")
        .withIndex("by_user_id", (q) => q.eq("user_id", guardUser._id))
        .first();

      if (!existingProfile) {
        await ctx.db.insert("guard_profiles", {
          user_id: guardUser._id,
          society_id: testSociety._id,
          guard_type: definition.guardType,
          has_seen_onboarding: true,
        });
      }
    }

    const tenantProfileDefinitions = [
      { email: DEMO_EMAILS.tenant1, name: "Ankit Mehta", phone: DEMO_PHONES.tenant1 },
      { email: DEMO_EMAILS.tenant2, name: "Sneha Reddy", phone: DEMO_PHONES.tenant2 },
    ];

    for (const definition of tenantProfileDefinitions) {
      const tenantUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", definition.email))
        .filter((q) => q.eq(q.field("user_type"), "TENANT"))
        .first();
      if (!tenantUser) {
        continue;
      }

      const existingProfile = await ctx.db
        .query("tenant_profiles")
        .withIndex("by_user_id", (q) => q.eq("user_id", tenantUser._id))
        .first();

      if (!existingProfile) {
        await ctx.db.insert("tenant_profiles", {
          user_id: tenantUser._id,
          name: definition.name,
          email: definition.email,
          phone: definition.phone,
          preferences: {
            localities: ["Bandra", "Powai", "Andheri"],
            budget_min: 2000000,
            budget_max: 5000000,
            property_types: ["2BHK", "3BHK"],
          },
          saved_listings: [],
        });
      }
    }

    const ownerDefinitions = [
      {
        email: DEMO_EMAILS.owner1,
        name: "Ramesh Gupta",
        phone: DEMO_PHONES.owner1,
      },
      {
        email: DEMO_EMAILS.owner2,
        name: "Kavita Joshi",
        phone: DEMO_PHONES.owner2,
      },
    ];

    for (const definition of ownerDefinitions) {
      const ownerUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", definition.email))
        .filter((q) => q.eq(q.field("user_type"), "OWNER"))
        .first();
      if (!ownerUser) {
        continue;
      }

      const existingOwner = await ctx.db
        .query("owners")
        .withIndex("by_phone", (q) => q.eq("phone", definition.phone))
        .first();

      if (!existingOwner) {
        await ctx.db.insert("owners", {
          phone: definition.phone,
          name: definition.name,
          email: definition.email,
          user_id: ownerUser._id,
          source: "OWNER_SERVICE_REQUEST",
          first_lead_id: undefined,
          active_properties_count: 1,
          total_leads_count: 0,
          total_closures_count: 0,
          current_rm_id: undefined,
          current_rm_guard_id: undefined,
          lifecycle_stage: "ACTIVE",
          lifecycle_updated_at: now,
          merged_into_id: undefined,
          first_seen_at: now,
          last_activity_at: now,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        });
      } else {
        await ctx.db.patch(existingOwner._id, {
          name: definition.name,
          email: definition.email,
          user_id: ownerUser._id,
          source: "OWNER_SERVICE_REQUEST",
          lifecycle_stage: "ACTIVE",
          lifecycle_updated_at: now,
          last_activity_at: now,
          updated_at: now,
          is_deleted: false,
        });
      }
    }

    const superAdminRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Super Admin"))
      .first();
    const opsAgentRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Ops Agent"))
      .first();

    if (superAdminRole) {
      const adminEmails = [DEMO_EMAILS.founder_one, DEMO_EMAILS.agent];
      for (const adminEmail of adminEmails) {
        const adminUser = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", adminEmail))
          .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
          .first();
        if (!adminUser) {
          continue;
        }

        const existingAssignment = await ctx.db
          .query("user_role_assignments")
          .withIndex("by_user_id", (q) => q.eq("user_id", adminUser._id))
          .filter((q) => q.eq(q.field("role_id"), superAdminRole._id))
          .first();

        if (!existingAssignment) {
          await ctx.db.insert("user_role_assignments", {
            user_id: adminUser._id,
            role_id: superAdminRole._id,
            assigned_by_admin_id: founder_one._id,
            is_deleted: false,
          });
        } else if (existingAssignment.is_deleted) {
          await ctx.db.patch(existingAssignment._id, { is_deleted: false });
        }
      }
    }

    if (opsAgentRole) {
      const ops2 = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.ops2))
        .filter((q) => q.eq(q.field("user_type"), "OPS"))
        .first();

      if (ops2) {
        const existingAssignment = await ctx.db
          .query("user_role_assignments")
          .withIndex("by_user_id", (q) => q.eq("user_id", ops2._id))
          .filter((q) => q.eq(q.field("role_id"), opsAgentRole._id))
          .first();

        if (!existingAssignment) {
          await ctx.db.insert("user_role_assignments", {
            user_id: ops2._id,
            role_id: opsAgentRole._id,
            assigned_by_admin_id: founder_one._id,
            is_deleted: false,
          });
        } else if (existingAssignment.is_deleted) {
          await ctx.db.patch(existingAssignment._id, { is_deleted: false });
        }
      }
    }

    return { seededAt: now };
  },
});

export const seedDemoSocieties = internalMutation({
  args: {},
  handler: async (ctx) => {
    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.founder_one))
      .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
      .first();
    if (!founder_one) {
      throw new Error("seedDemoSocieties: Missing Test Admin user");
    }

    const societies = [
      {
        name: "Sunshine Heights",
        city: "Mumbai",
        address: "Bandra West, Mumbai",
        status: "ACTIVE" as const,
        buildings: [
          { name: "Wing A", total_floors: 8, flats_per_floor: 6 },
          { name: "Wing B", total_floors: 6, flats_per_floor: 4 },
        ],
      },
      {
        name: "Green Valley Residency",
        city: "Mumbai",
        address: "Powai, Mumbai",
        status: "ACTIVE" as const,
        buildings: [{ name: "Tower 1", total_floors: 12, flats_per_floor: 8 }],
      },
    ];

    for (const societyInput of societies) {
      let society = await ctx.db
        .query("societies")
        .withIndex("by_name", (q) => q.eq("name", societyInput.name))
        .first();

      if (!society) {
        const societyId = await ctx.db.insert("societies", {
          name: societyInput.name,
          city: societyInput.city,
          address: societyInput.address,
          status: societyInput.status,
          notes: "Demo seeded society",
          created_by_admin_id: founder_one._id,
        });
        society = await ctx.db.get(societyId);
      }

      if (!society) {
        continue;
      }

      for (const buildingInput of societyInput.buildings) {
        const existingBuilding = await ctx.db
          .query("buildings")
          .withIndex("by_society_and_name", (q) =>
            q.eq("society_id", society._id).eq("name", buildingInput.name),
          )
          .first();

        if (!existingBuilding) {
          await ctx.db.insert("buildings", {
            society_id: society._id,
            name: buildingInput.name,
            total_floors: buildingInput.total_floors,
            flats_per_floor: buildingInput.flats_per_floor,
            total_flats: buildingInput.total_floors * buildingInput.flats_per_floor,
            floor_labels: floorLabels(buildingInput.total_floors),
            status: "ACTIVE",
            notes: "Demo seeded building",
            is_deleted: false,
          });
        }
      }
    }

    const testSociety = await ctx.db
      .query("societies")
      .withIndex("by_name", (q) => q.eq("name", "Test Society"))
      .first();
    const sunshine = await ctx.db
      .query("societies")
      .withIndex("by_name", (q) => q.eq("name", "Sunshine Heights"))
      .first();
    const greenValley = await ctx.db
      .query("societies")
      .withIndex("by_name", (q) => q.eq("name", "Green Valley Residency"))
      .first();

    const testTower = testSociety
      ? await ctx.db
          .query("buildings")
          .withIndex("by_society_and_name", (q) =>
            q.eq("society_id", testSociety._id).eq("name", "Test Tower A"),
          )
          .first()
      : null;
    const sunshineWingA = sunshine
      ? await ctx.db
          .query("buildings")
          .withIndex("by_society_and_name", (q) =>
            q.eq("society_id", sunshine._id).eq("name", "Wing A"),
          )
          .first()
      : null;
    const greenTower = greenValley
      ? await ctx.db
          .query("buildings")
          .withIndex("by_society_and_name", (q) =>
            q.eq("society_id", greenValley._id).eq("name", "Tower 1"),
          )
          .first()
      : null;

    const guard1 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard1))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();
    const guard2 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard2))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();
    const guard3 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard3))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();

    const shiftDefinitions: Array<{
      guard: Doc<"users"> | null;
      dayOfWeek: number;
      start: string;
      end: string;
      locationType: Doc<"guard_shifts">["location_type"];
      buildingId?: Id<"buildings">;
      label: string;
    }> = [
      {
        guard: guard1,
        dayOfWeek: 1,
        start: "08:00",
        end: "16:00",
        locationType: "MAIN_GATE",
        label: "Test Society Main Gate",
      },
      {
        guard: guard1,
        dayOfWeek: 5,
        start: "16:00",
        end: "23:00",
        locationType: "BUILDING",
        buildingId: testTower?._id,
        label: "Test Tower A Evening",
      },
      {
        guard: guard2,
        dayOfWeek: 2,
        start: "07:00",
        end: "15:00",
        locationType: "MAIN_GATE",
        label: "Sunshine Heights Gate",
      },
      {
        guard: guard2,
        dayOfWeek: 6,
        start: "15:00",
        end: "22:00",
        locationType: "BUILDING",
        buildingId: sunshineWingA?._id,
        label: "Wing A Patrol",
      },
      {
        guard: guard3,
        dayOfWeek: 3,
        start: "08:30",
        end: "16:30",
        locationType: "MAIN_GATE",
        label: "Green Valley Gate",
      },
      {
        guard: guard3,
        dayOfWeek: 0,
        start: "16:30",
        end: "23:30",
        locationType: "BUILDING",
        buildingId: greenTower?._id,
        label: "Tower 1 Patrol",
      },
    ];

    for (const shift of shiftDefinitions) {
      const guard = shift.guard;
      if (!guard) {
        continue;
      }
      const guardId = guard._id;

      const existingShift = await ctx.db
        .query("guard_shifts")
        .withIndex("by_guard_and_day", (q) =>
          q.eq("guard_user_id", guardId).eq("day_of_week", shift.dayOfWeek),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("shift_type"), "RECURRING"),
            q.eq(q.field("start_time"), shift.start),
            q.eq(q.field("end_time"), shift.end),
            q.neq(q.field("is_deleted"), true),
          ),
        )
        .first();

      if (!existingShift) {
        await ctx.db.insert("guard_shifts", {
          guard_user_id: guardId,
          shift_type: "RECURRING",
          day_of_week: shift.dayOfWeek,
          specific_date: undefined,
          start_time: shift.start,
          end_time: shift.end,
          location_type: shift.locationType,
          building_id: shift.locationType === "BUILDING" ? shift.buildingId : undefined,
          location_label: shift.label,
          notes: "Demo seeded shift",
          created_by_admin_id: founder_one._id,
          is_deleted: false,
        });
      }
    }

    return { seeded: true };
  },
});

export const seedDemoLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.founder_one))
      .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
      .first();
    if (!founder_one) {
      throw new Error("seedDemoLeads: Missing Test Admin user");
    }

    const societiesByName = {
      test: await ctx.db
        .query("societies")
        .withIndex("by_name", (q) => q.eq("name", "Test Society"))
        .first(),
      sunshine: await ctx.db
        .query("societies")
        .withIndex("by_name", (q) => q.eq("name", "Sunshine Heights"))
        .first(),
      green: await ctx.db
        .query("societies")
        .withIndex("by_name", (q) => q.eq("name", "Green Valley Residency"))
        .first(),
    };

    if (!societiesByName.test || !societiesByName.sunshine || !societiesByName.green) {
      throw new Error("seedDemoLeads: Required societies missing");
    }

    const buildings = {
      testTower: await ctx.db
        .query("buildings")
        .withIndex("by_society_and_name", (q) =>
          q.eq("society_id", societiesByName.test!._id).eq("name", "Test Tower A"),
        )
        .first(),
      wingA: await ctx.db
        .query("buildings")
        .withIndex("by_society_and_name", (q) =>
          q.eq("society_id", societiesByName.sunshine!._id).eq("name", "Wing A"),
        )
        .first(),
      wingB: await ctx.db
        .query("buildings")
        .withIndex("by_society_and_name", (q) =>
          q.eq("society_id", societiesByName.sunshine!._id).eq("name", "Wing B"),
        )
        .first(),
      tower1: await ctx.db
        .query("buildings")
        .withIndex("by_society_and_name", (q) =>
          q.eq("society_id", societiesByName.green!._id).eq("name", "Tower 1"),
        )
        .first(),
    };

    if (!buildings.testTower || !buildings.wingA || !buildings.wingB || !buildings.tower1) {
      throw new Error("seedDemoLeads: Required buildings missing");
    }

    const guard1 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard1))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();
    const guard2 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard2))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();
    const guard3 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard3))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();

    if (!guard1 || !guard2 || !guard3) {
      throw new Error("seedDemoLeads: Guard users missing");
    }

    const leadDefinitions: Array<{
      key: string;
      societyId: Id<"societies">;
      buildingId: Id<"buildings">;
      floor: string;
      flat: string;
      ownerName: string;
      ownerPhone: string;
      status: Doc<"leads">["status"];
      guardId: Id<"users">;
      notes?: string;
      rentExpected?: number;
      availabilityType: Doc<"leads">["availability_type"];
      duplicateOf?: string;
      qualityFlags?: Doc<"leads">["quality_flags"];
    }> = [
      {
        key: "L01",
        societyId: societiesByName.test._id,
        buildingId: buildings.testTower._id,
        floor: "1",
        flat: "101",
        ownerName: "Manoj Shah",
        ownerPhone: "9000000001",
        status: "SUBMITTED",
        guardId: guard1._id,
        rentExpected: 1800000,
        availabilityType: "VACANT_NOW",
      },
      {
        key: "L02",
        societyId: societiesByName.sunshine._id,
        buildingId: buildings.wingA._id,
        floor: "2",
        flat: "204",
        ownerName: "Parul Jain",
        ownerPhone: "9000000002",
        status: "SUBMITTED",
        guardId: guard2._id,
        rentExpected: 2400000,
        availabilityType: "VACANT_FROM",
      },
      {
        key: "L03",
        societyId: societiesByName.green._id,
        buildingId: buildings.tower1._id,
        floor: "7",
        flat: "706",
        ownerName: "Kiran Bhat",
        ownerPhone: "9000000003",
        status: "SUBMITTED",
        guardId: guard3._id,
        rentExpected: 3200000,
        availabilityType: "VACANT_NOW",
      },
      {
        key: "L04",
        societyId: societiesByName.sunshine._id,
        buildingId: buildings.wingB._id,
        floor: "4",
        flat: "403",
        ownerName: "Nikhil Rao",
        ownerPhone: "9000000004",
        status: "NEED_INFO",
        guardId: guard2._id,
        notes: "Owner asked for callback after 7 PM.",
        rentExpected: 2200000,
        availabilityType: "VACANT_FROM",
      },
      {
        key: "L05",
        societyId: societiesByName.test._id,
        buildingId: buildings.testTower._id,
        floor: "3",
        flat: "305",
        ownerName: "Rekha Iyer",
        ownerPhone: "9000000005",
        status: "NEED_INFO",
        guardId: guard1._id,
        notes: "Need furnishing confirmation.",
        rentExpected: 2100000,
        availabilityType: "VACANT_NOW",
      },
      {
        key: "L06",
        societyId: societiesByName.sunshine._id,
        buildingId: buildings.wingA._id,
        floor: "5",
        flat: "501",
        ownerName: "Deepak Soni",
        ownerPhone: "9000000006",
        status: "VERIFIED",
        guardId: guard2._id,
        rentExpected: 3000000,
        availabilityType: "VACANT_NOW",
      },
      {
        key: "L07",
        societyId: societiesByName.sunshine._id,
        buildingId: buildings.wingB._id,
        floor: "2",
        flat: "202",
        ownerName: "Pooja Bansal",
        ownerPhone: "9000000007",
        status: "VERIFIED",
        guardId: guard2._id,
        rentExpected: 2600000,
        availabilityType: "VACANT_FROM",
      },
      {
        key: "L08",
        societyId: societiesByName.green._id,
        buildingId: buildings.tower1._id,
        floor: "9",
        flat: "904",
        ownerName: "Arvind Menon",
        ownerPhone: "9000000008",
        status: "VERIFIED",
        guardId: guard3._id,
        rentExpected: 4200000,
        availabilityType: "VACANT_NOW",
      },
      {
        key: "L09",
        societyId: societiesByName.test._id,
        buildingId: buildings.testTower._id,
        floor: "6",
        flat: "604",
        ownerName: "Lata Kapoor",
        ownerPhone: "9000000009",
        status: "VERIFIED",
        guardId: guard1._id,
        rentExpected: 2800000,
        availabilityType: "VACANT_NOW",
      },
      {
        key: "L10",
        societyId: societiesByName.green._id,
        buildingId: buildings.tower1._id,
        floor: "4",
        flat: "409",
        ownerName: "Harish Lal",
        ownerPhone: "9000000010",
        status: "REJECTED",
        guardId: guard3._id,
        notes: "Owner denied consent to list.",
        rentExpected: 2300000,
        availabilityType: "VACANT_NOW",
      },
      {
        key: "L11",
        societyId: societiesByName.sunshine._id,
        buildingId: buildings.wingA._id,
        floor: "1",
        flat: "106",
        ownerName: "Vikas Arora",
        ownerPhone: "9000000011",
        status: "REJECTED",
        guardId: guard2._id,
        notes: "Invalid ownership details shared.",
        rentExpected: 2000000,
        availabilityType: "VACANT_FROM",
      },
      {
        key: "L12",
        societyId: societiesByName.sunshine._id,
        buildingId: buildings.wingA._id,
        floor: "7",
        flat: "703",
        ownerName: "Neeraj Gupta",
        ownerPhone: "9000000012",
        status: "DUPLICATE",
        guardId: guard2._id,
        notes: "Duplicate against previously verified listing.",
        rentExpected: 2900000,
        availabilityType: "VACANT_NOW",
        duplicateOf: "L06",
      },
      {
        key: "L13",
        societyId: societiesByName.test._id,
        buildingId: buildings.testTower._id,
        floor: "8",
        flat: "802",
        ownerName: "Sonal Verma",
        ownerPhone: "9000000013",
        status: "DUPLICATE",
        guardId: guard1._id,
        notes: "Duplicate against verified lead from same owner.",
        rentExpected: 2700000,
        availabilityType: "VACANT_FROM",
        duplicateOf: "L09",
      },
      {
        key: "L14",
        societyId: societiesByName.green._id,
        buildingId: buildings.tower1._id,
        floor: "11",
        flat: "1102",
        ownerName: "Bhavna Taneja",
        ownerPhone: "9000000014",
        status: "POTENTIAL_DUPLICATE",
        guardId: guard3._id,
        notes: "Phone appears in recent lead.",
        rentExpected: 3500000,
        availabilityType: "VACANT_NOW",
        qualityFlags: ["DUPLICATE_PHONE_MATCH"],
      },
      {
        key: "L15",
        societyId: societiesByName.sunshine._id,
        buildingId: buildings.wingB._id,
        floor: "5",
        flat: "504",
        ownerName: "Ravi Dhingra",
        ownerPhone: "9000000015",
        status: "POTENTIAL_DUPLICATE",
        guardId: guard2._id,
        notes: "Flat-level duplicate signal from old record.",
        rentExpected: 2550000,
        availabilityType: "VACANT_FROM",
        qualityFlags: ["DUPLICATE_FLAT_MATCH"],
      },
    ];

    const leadIdsByKey = new Map<string, Id<"leads">>();

    const orderedDefinitions = [
      ...leadDefinitions.filter((item) => !item.duplicateOf),
      ...leadDefinitions.filter((item) => !!item.duplicateOf),
    ];

    for (const definition of orderedDefinitions) {
      const existingLead = await ctx.db
        .query("leads")
        .withIndex("by_society_building_flat", (q) =>
          q
            .eq("society_id", definition.societyId)
            .eq("building_id", definition.buildingId)
            .eq("flat_number", definition.flat),
        )
        .first();

      if (existingLead) {
        leadIdsByKey.set(definition.key, existingLead._id);
        continue;
      }

      const duplicateOfLeadId = definition.duplicateOf
        ? leadIdsByKey.get(definition.duplicateOf)
        : undefined;
      const availabilityDate =
        definition.availabilityType === "VACANT_FROM" ? now + 5 * 24 * 60 * 60 * 1000 : undefined;

      const leadId = await ctx.db.insert("leads", {
        society_id: definition.societyId,
        building_id: definition.buildingId,
        floor_number: definition.floor,
        flat_number: definition.flat,
        owner_name: definition.ownerName,
        owner_phone: definition.ownerPhone,
        owner_id: undefined,
        availability_type: definition.availabilityType,
        availability_date: availabilityDate,
        rent_expected: definition.rentExpected,
        furnishing: "SEMI_FURNISHED",
        notes: definition.notes,
        owner_consent_to_call: true,
        submitted_by_guard_id: definition.guardId,
        status: definition.status,
        notes_thread: undefined,
        quality_flags: definition.qualityFlags,
        duplicate_of_lead_id: duplicateOfLeadId,
        prospective_bounty: 25000,
        searchable_text: `${definition.ownerName} ${definition.ownerPhone} ${definition.flat}`,
      });

      leadIdsByKey.set(definition.key, leadId);
    }

    for (const definition of leadDefinitions.filter((item) => item.status === "VERIFIED")) {
      const leadId = leadIdsByKey.get(definition.key);
      if (!leadId) {
        continue;
      }

      const existingVerification = await ctx.db
        .query("owner_verifications")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", leadId))
        .first();

      if (!existingVerification) {
        await ctx.db.insert("owner_verifications", {
          lead_id: leadId,
          called_by_admin_id: founder_one._id,
          call_outcome: "VERIFIED",
          consent_contact_demorentals: true,
          consent_visit_coordination: true,
          preferred_visit_slots: "Weekdays after 6 PM",
          rent_confirmed: definition.rentExpected,
          notes: "Demo verification call completed successfully.",
          verified_at: now,
        });
      }
    }

    return { seededLeads: leadIdsByKey.size };
  },
});

export const seedDemoListings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.founder_one))
      .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
      .first();
    if (!founder_one) {
      throw new Error("seedDemoListings: Missing Test Admin user");
    }

    const verifiedLeads = await ctx.db
      .query("leads")
      .withIndex("by_status", (q) => q.eq("status", "VERIFIED"))
      .collect();

    if (verifiedLeads.length === 0) {
      throw new Error("seedDemoListings: No VERIFIED leads found");
    }

    const listingDefinitions: Array<{
      slug: string;
      status: Doc<"listings">["status"];
      bhk: Doc<"listings">["bhk_config"];
      furnishing: Doc<"listings">["furnishing"];
      rent: number;
      deposit: number;
      maintenance: number;
      floor: string;
      leadOffset: number;
      description: string;
      petFriendly: boolean;
      amenities: Array<
        | "gym"
        | "pool"
        | "garden"
        | "security"
        | "lift"
        | "power_backup"
        | "clubhouse"
        | "parking"
        | "play_area"
        | "jogging_track"
        | "intercom"
        | "cctv"
        | "fire_safety"
        | "water_supply_24x7"
        | "gas_pipeline"
        | "rain_water_harvesting"
      >;
    }> = [
      {
        slug: "2bhk-sunshine-heights-bandra-501",
        status: "PUBLISHED",
        bhk: "2BHK",
        furnishing: "SEMI_FURNISHED",
        rent: 3000000,
        deposit: 7500000,
        maintenance: 300000,
        floor: "5",
        leadOffset: 0,
        description: "Bright 2BHK with balcony and excellent ventilation.",
        petFriendly: true,
        amenities: ["lift", "security", "cctv", "gym", "parking"],
      },
      {
        slug: "1bhk-wingb-sunshine-bandra-202",
        status: "PUBLISHED",
        bhk: "1BHK",
        furnishing: "FULLY_FURNISHED",
        rent: 2100000,
        deposit: 4200000,
        maintenance: 250000,
        floor: "2",
        leadOffset: 1,
        description: "Move-in ready furnished apartment near transit routes.",
        petFriendly: false,
        amenities: ["lift", "security", "intercom", "power_backup"],
      },
      {
        slug: "3bhk-green-valley-powai-904",
        status: "PUBLISHED",
        bhk: "3BHK",
        furnishing: "SEMI_FURNISHED",
        rent: 4500000,
        deposit: 12000000,
        maintenance: 500000,
        floor: "9",
        leadOffset: 2,
        description: "Spacious family apartment with premium amenities.",
        petFriendly: true,
        amenities: ["pool", "clubhouse", "garden", "parking", "security"],
      },
      {
        slug: "2bhk-test-society-andheri-604",
        status: "PUBLISHED",
        bhk: "2BHK",
        furnishing: "UNFURNISHED",
        rent: 2400000,
        deposit: 4800000,
        maintenance: 200000,
        floor: "6",
        leadOffset: 3,
        description: "Value-for-money apartment in central Andheri location.",
        petFriendly: false,
        amenities: ["security", "lift", "water_supply_24x7"],
      },
      {
        slug: "1bhk-test-society-andheri-302",
        status: "PUBLISHED",
        bhk: "1BHK",
        furnishing: "FULLY_FURNISHED",
        rent: 1800000,
        deposit: 3600000,
        maintenance: 150000,
        floor: "3",
        leadOffset: 0,
        description: "Compact furnished unit ideal for working professionals.",
        petFriendly: false,
        amenities: ["lift", "security", "power_backup", "intercom"],
      },
      {
        slug: "studio-sunshine-heights-bandra-demo-draft",
        status: "DRAFT",
        bhk: "STUDIO",
        furnishing: "SEMI_FURNISHED",
        rent: 1500000,
        deposit: 3000000,
        maintenance: 100000,
        floor: "3",
        leadOffset: 0,
        description: "Draft listing awaiting final owner confirmation.",
        petFriendly: false,
        amenities: ["security", "lift"],
      },
      {
        slug: "3bhk-archive-green-valley-powai-demo",
        status: "ARCHIVED",
        bhk: "3BHK",
        furnishing: "FULLY_FURNISHED",
        rent: 5000000,
        deposit: 15000000,
        maintenance: 550000,
        floor: "11",
        leadOffset: 1,
        description: "Archived listing kept for demo reporting scenarios.",
        petFriendly: true,
        amenities: ["pool", "clubhouse", "security", "parking", "cctv"],
      },
    ];

    const listingIds = new Map<string, Id<"listings">>();

    for (const definition of listingDefinitions) {
      const existing = await ctx.db
        .query("listings")
        .withIndex("by_slug", (q) => q.eq("slug", definition.slug))
        .first();

      if (existing) {
        listingIds.set(definition.slug, existing._id);
        continue;
      }

      const lead = verifiedLeads[definition.leadOffset % verifiedLeads.length];
      const listingId = await ctx.db.insert("listings", {
        lead_id: lead._id,
        owner_id: lead.owner_id,
        slug: definition.slug,
        status: definition.status,
        rent_monthly: definition.rent,
        deposit: definition.deposit,
        maintenance: definition.maintenance,
        bhk_config: definition.bhk,
        furnishing: definition.furnishing,
        floor_number: definition.floor,
        carpet_area_sqft: 850 + definition.leadOffset * 90,
        available_from: now + (definition.leadOffset + 3) * 24 * 60 * 60 * 1000,
        description: definition.description,
        house_rules: ["No loud music after 10 PM", "Society rules apply", "ID proof mandatory"],
        parking: "COVERED",
        pet_friendly: definition.petFriendly,
        amenities: definition.amenities,
        created_by_admin_id: founder_one._id,
      });
      listingIds.set(definition.slug, listingId);
    }

    const roommateProfiles = [
      {
        name_alias: "Aman",
        age_range: "25-30",
        gender: "Male",
        profession: "Software Engineer",
        lifestyle_tags: ["clean", "early_riser"],
      },
      {
        name_alias: "Priya",
        age_range: "24-29",
        gender: "Female",
        profession: "Product Designer",
        lifestyle_tags: ["social", "non_smoker"],
      },
    ];

    const commuteLandmarks = [
      {
        name: "Nearest Metro",
        category: "metro",
        distance_km: 0.8,
        time_minutes: 8,
        transport_mode: "walk",
      },
      {
        name: "Business Park",
        category: "office",
        distance_km: 4.2,
        time_minutes: 18,
        transport_mode: "cab",
      },
      {
        name: "International School",
        category: "school",
        distance_km: 2.1,
        time_minutes: 12,
        transport_mode: "auto",
      },
    ];

    const publishedSlugs = listingDefinitions
      .filter((item) => item.status === "PUBLISHED")
      .map((item) => item.slug);

    for (const slug of publishedSlugs) {
      const listingId = listingIds.get(slug);
      if (!listingId) {
        continue;
      }

      for (const roommate of roommateProfiles) {
        const existingRoommate = await ctx.db
          .query("listing_roommate_profiles")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", listingId).eq("is_deleted", false))
          .filter((q) => q.eq(q.field("name_alias"), roommate.name_alias))
          .first();

        if (!existingRoommate) {
          await ctx.db.insert("listing_roommate_profiles", {
            listing_id: listingId,
            name_alias: roommate.name_alias,
            age_range: roommate.age_range,
            gender: roommate.gender,
            profession: roommate.profession,
            lifestyle_tags: roommate.lifestyle_tags,
            bio: "Friendly and respectful flatmate preferred.",
            move_in_date: now + 10 * 24 * 60 * 60 * 1000,
            is_deleted: false,
          });
        }
      }

      for (const landmark of commuteLandmarks) {
        const existingLandmark = await ctx.db
          .query("listing_commute_landmarks")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", listingId).eq("is_deleted", false))
          .filter((q) => q.eq(q.field("name"), landmark.name))
          .first();

        if (!existingLandmark) {
          await ctx.db.insert("listing_commute_landmarks", {
            listing_id: listingId,
            name: landmark.name,
            category: landmark.category,
            distance_km: landmark.distance_km,
            time_minutes: landmark.time_minutes,
            transport_mode: landmark.transport_mode,
            is_deleted: false,
          });
        }
      }

      const inquiryTemplates = [
        { name: "Kunal", phone: "9333300001", source: "CONTACT_FORM" as const },
        { name: "Meera", phone: "9333300002", source: "WHATSAPP_CLICK" as const },
        { name: "Rohan", phone: "9333300003", source: "CONTACT_FORM" as const },
      ];

      for (const inquiry of inquiryTemplates) {
        const existingInquiry = await ctx.db
          .query("listing_inquiries")
          .withIndex("by_listing_id", (q) => q.eq("listing_id", listingId))
          .filter((q) => q.eq(q.field("phone"), inquiry.phone))
          .first();

        if (!existingInquiry) {
          await ctx.db.insert("listing_inquiries", {
            listing_id: listingId,
            name: inquiry.name,
            phone: inquiry.phone,
            message: "Interested in scheduling a weekend visit.",
            source: inquiry.source,
          });
        }
      }
    }

    return { seededListings: listingIds.size };
  },
});

export const seedDemoDemandPipeline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.founder_one))
      .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
      .first();
    if (!founder_one) {
      throw new Error("seedDemoDemandPipeline: Missing Test Admin user");
    }

    const guardUsers = {
      guard1: await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard1))
        .filter((q) => q.eq(q.field("user_type"), "GUARD"))
        .first(),
      guard2: await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard2))
        .filter((q) => q.eq(q.field("user_type"), "GUARD"))
        .first(),
      guard3: await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard3))
        .filter((q) => q.eq(q.field("user_type"), "GUARD"))
        .first(),
    };

    if (!guardUsers.guard1 || !guardUsers.guard2 || !guardUsers.guard3) {
      throw new Error("seedDemoDemandPipeline: Guard users missing");
    }

    const tenantUsers = {
      tenant1: await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.tenant1))
        .filter((q) => q.eq(q.field("user_type"), "TENANT"))
        .first(),
      tenant2: await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.tenant2))
        .filter((q) => q.eq(q.field("user_type"), "TENANT"))
        .first(),
    };

    const listingSlugs = [
      "2bhk-sunshine-heights-bandra-501",
      "1bhk-wingb-sunshine-bandra-202",
      "3bhk-green-valley-powai-904",
      "2bhk-test-society-andheri-604",
      "1bhk-test-society-andheri-302",
      "studio-sunshine-heights-bandra-demo-draft",
      "3bhk-archive-green-valley-powai-demo",
    ];

    const listings: Doc<"listings">[] = [];
    for (const slug of listingSlugs) {
      const listing = await ctx.db
        .query("listings")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (listing) {
        listings.push(listing);
      }
    }

    if (listings.length === 0) {
      throw new Error("seedDemoDemandPipeline: Listings missing");
    }

    const inquiryDefinitions: Array<{
      key: string;
      listing: Doc<"listings">;
      tenantName: string;
      tenantPhone: string;
      tenantEmail: string;
      tenantId?: Id<"users">;
      status: Doc<"tenant_inquiries">["status"];
      assignedGuardId?: Id<"users">;
    }> = [
      {
        key: "TI1",
        listing: listings[0],
        tenantName: "Ankit Mehta",
        tenantPhone: "9300000001",
        tenantEmail: DEMO_EMAILS.tenant1,
        tenantId: tenantUsers.tenant1?._id,
        status: "SUBMITTED",
      },
      {
        key: "TI2",
        listing: listings[1 % listings.length],
        tenantName: "Sneha Reddy",
        tenantPhone: "9300000002",
        tenantEmail: DEMO_EMAILS.tenant2,
        tenantId: tenantUsers.tenant2?._id,
        status: "SUBMITTED",
      },
      {
        key: "TI3",
        listing: listings[2 % listings.length],
        tenantName: "Rahul Nair",
        tenantPhone: "9300000003",
        tenantEmail: "rahul.demo@test.demorentals.com",
        status: "REVIEWED",
      },
      {
        key: "TI4",
        listing: listings[3 % listings.length],
        tenantName: "Neha S",
        tenantPhone: "9300000004",
        tenantEmail: "neha.demo@test.demorentals.com",
        status: "BOUNTY_POSTED",
      },
      {
        key: "TI5",
        listing: listings[0],
        tenantName: "Karthik R",
        tenantPhone: "9300000005",
        tenantEmail: "karthik.demo@test.demorentals.com",
        status: "GUARD_ACCEPTED",
        assignedGuardId: guardUsers.guard2._id,
      },
      {
        key: "TI6",
        listing: listings[1 % listings.length],
        tenantName: "Divya M",
        tenantPhone: "9300000006",
        tenantEmail: "divya.demo@test.demorentals.com",
        status: "VISIT_SCHEDULED",
        assignedGuardId: guardUsers.guard1._id,
      },
      {
        key: "TI7",
        listing: listings[3 % listings.length],
        tenantName: "Amit P",
        tenantPhone: "9300000007",
        tenantEmail: "amit.demo@test.demorentals.com",
        status: "VISIT_COMPLETED",
        assignedGuardId: guardUsers.guard3._id,
      },
      {
        key: "TI8",
        listing: listings[3 % listings.length],
        tenantName: "Sara K",
        tenantPhone: "9300000008",
        tenantEmail: "sara.demo@test.demorentals.com",
        status: "CLOSED",
        assignedGuardId: guardUsers.guard2._id,
      },
    ];

    const inquiryByKey = new Map<string, Doc<"tenant_inquiries">>();

    for (const definition of inquiryDefinitions) {
      const existing = await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_listing_id", (q) => q.eq("listing_id", definition.listing._id))
        .filter((q) => q.eq(q.field("tenant_phone"), definition.tenantPhone))
        .first();

      if (existing) {
        inquiryByKey.set(definition.key, existing);
        continue;
      }

      const inquiryId = await ctx.db.insert("tenant_inquiries", {
        listing_id: definition.listing._id,
        tenant_id: definition.tenantId,
        tenant_name: definition.tenantName,
        tenant_phone: definition.tenantPhone,
        tenant_email: definition.tenantEmail,
        preferred_visit_date: now + 2 * 24 * 60 * 60 * 1000,
        preferred_visit_slot: "Evening",
        message: "Interested in visit this week.",
        status: definition.status,
        bounty_amount:
          definition.status === "BOUNTY_POSTED" ||
          definition.status === "GUARD_ACCEPTED" ||
          definition.status === "VISIT_SCHEDULED" ||
          definition.status === "VISIT_COMPLETED" ||
          definition.status === "CLOSED"
            ? 50000
            : undefined,
        bounty_posted_at:
          definition.status === "BOUNTY_POSTED" ||
          definition.status === "GUARD_ACCEPTED" ||
          definition.status === "VISIT_SCHEDULED" ||
          definition.status === "VISIT_COMPLETED" ||
          definition.status === "CLOSED"
            ? now - 6 * 60 * 60 * 1000
            : undefined,
        bounty_expires_at:
          definition.status === "BOUNTY_POSTED" ||
          definition.status === "GUARD_ACCEPTED" ||
          definition.status === "VISIT_SCHEDULED" ||
          definition.status === "VISIT_COMPLETED" ||
          definition.status === "CLOSED"
            ? now + 2 * 24 * 60 * 60 * 1000
            : undefined,
        assigned_guard_id: definition.assignedGuardId,
        visit_id: undefined,
        ops_notes: "Demo inquiry lifecycle record",
        rejection_reason: undefined,
        reviewed_by_admin_id: definition.status !== "SUBMITTED" ? founder_one._id : undefined,
        updated_at: now,
      });

      const inserted = await ctx.db.get(inquiryId);
      if (inserted) {
        inquiryByKey.set(definition.key, inserted);
      }
    }

    const leadPool = await ctx.db
      .query("leads")
      .withIndex("by_status", (q) => q.eq("status", "VERIFIED"))
      .collect();
    const fallbackLeads = await ctx.db
      .query("leads")
      .withIndex("by_status", (q) => q.eq("status", "SUBMITTED"))
      .collect();
    const combinedLeads = [...leadPool, ...fallbackLeads];

    if (combinedLeads.length === 0) {
      throw new Error("seedDemoDemandPipeline: No leads available for visits");
    }

    const visitDefinitions: Array<{
      key: string;
      inquiryKey: string;
      status: Doc<"visits">["status"];
      assignedGuardId: Id<"users">;
      outcome?: Doc<"visits">["outcome"];
    }> = [
      { key: "V1", inquiryKey: "TI1", status: "ASSIGNED", assignedGuardId: guardUsers.guard1._id },
      { key: "V2", inquiryKey: "TI2", status: "ASSIGNED", assignedGuardId: guardUsers.guard2._id },
      { key: "V3", inquiryKey: "TI3", status: "CONFIRMED", assignedGuardId: guardUsers.guard3._id },
      {
        key: "V4",
        inquiryKey: "TI4",
        status: "IN_PROGRESS",
        assignedGuardId: guardUsers.guard1._id,
      },
      {
        key: "V5",
        inquiryKey: "TI5",
        status: "COMPLETED",
        assignedGuardId: guardUsers.guard2._id,
        outcome: "INTERESTED",
      },
      {
        key: "V6",
        inquiryKey: "TI6",
        status: "COMPLETED",
        assignedGuardId: guardUsers.guard1._id,
        outcome: "NOT_INTERESTED",
      },
      { key: "V7", inquiryKey: "TI7", status: "CANCELLED", assignedGuardId: guardUsers.guard3._id },
      { key: "V8", inquiryKey: "TI8", status: "NO_SHOW", assignedGuardId: guardUsers.guard2._id },
    ];

    const visitsByKey = new Map<string, Doc<"visits">>();

    for (let index = 0; index < visitDefinitions.length; index += 1) {
      const definition = visitDefinitions[index];
      const inquiry = inquiryByKey.get(definition.inquiryKey);
      if (!inquiry) {
        continue;
      }

      const lead = combinedLeads[index % combinedLeads.length];
      const scheduledStart = now + (index + 1) * 3 * 60 * 60 * 1000;
      const scheduledEnd = scheduledStart + 45 * 60 * 1000;

      const existingVisit = await ctx.db
        .query("visits")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .filter((q) => q.eq(q.field("scheduled_start"), scheduledStart))
        .first();

      if (existingVisit) {
        visitsByKey.set(definition.key, existingVisit);
        continue;
      }

      const visitId = await ctx.db.insert("visits", {
        lead_id: lead._id,
        society_id: lead.society_id,
        listing_id: inquiry.listing_id,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        assigned_guard_id: definition.assignedGuardId,
        status: definition.status,
        outcome: definition.outcome,
        outcome_notes:
          definition.status === "COMPLETED" ? "Demo visit outcome recorded." : undefined,
        started_at:
          definition.status === "IN_PROGRESS" || definition.status === "COMPLETED"
            ? scheduledStart + 5 * 60 * 1000
            : undefined,
        completed_at:
          definition.status === "COMPLETED" ? scheduledStart + 35 * 60 * 1000 : undefined,
        needs_reassignment: definition.status === "CANCELLED" ? true : undefined,
        checklist_instance_id: undefined,
        tenant_inquiry_id: inquiry._id,
        created_by_admin_id: founder_one._id,
      });

      const inserted = await ctx.db.get(visitId);
      if (inserted) {
        visitsByKey.set(definition.key, inserted);
      }
    }

    const closureDefinitions: Array<{
      key: string;
      visitKey: string;
      status: Doc<"closures">["status"];
    }> = [
      { key: "C1", visitKey: "V5", status: "PENDING" },
      { key: "C2", visitKey: "V6", status: "CONFIRMED" },
      { key: "C3", visitKey: "V7", status: "CANCELLED" },
    ];

    const closuresByKey = new Map<string, Doc<"closures">>();

    for (const definition of closureDefinitions) {
      const visit = visitsByKey.get(definition.visitKey);
      if (!visit) {
        continue;
      }

      const existingClosure = await ctx.db
        .query("closures")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", visit.lead_id))
        .first();

      if (existingClosure) {
        closuresByKey.set(definition.key, existingClosure);
        continue;
      }

      const closureId = await ctx.db.insert("closures", {
        lead_id: visit.lead_id,
        listing_id: visit.listing_id,
        owner_id: undefined,
        demorentals_deal_id: `DEMO-${definition.key}`,
        move_in_date: now + 14 * 24 * 60 * 60 * 1000,
        status: definition.status,
        rent_agreement_storage_id: undefined,
        commission_amount: 85000,
        brokerage_tenant_side: 42000,
        brokerage_owner_side: 43000,
        notes: "Demo closure seed record.",
        additional_documents: undefined,
        deal_checklist_id: undefined,
        closed_by_admin_id: founder_one._id,
        confirmed_at: definition.status === "CONFIRMED" ? now : undefined,
      });

      const inserted = await ctx.db.get(closureId);
      if (inserted) {
        closuresByKey.set(definition.key, inserted);
      }
    }

    const confirmedClosure = closuresByKey.get("C2") ?? Array.from(closuresByKey.values())[0];
    if (!confirmedClosure) {
      return { seeded: false };
    }

    const payoutDefinitions = [
      {
        key: "P1",
        guardId: guardUsers.guard1._id,
        leadId: confirmedClosure.lead_id,
        status: "pending" as const,
        amount: 45000,
      },
      {
        key: "P2",
        guardId: guardUsers.guard2._id,
        leadId: confirmedClosure.lead_id,
        status: "pending" as const,
        amount: 50000,
      },
      {
        key: "P3",
        guardId: guardUsers.guard3._id,
        leadId: confirmedClosure.lead_id,
        status: "approved" as const,
        amount: 65000,
      },
      {
        key: "P4",
        guardId: guardUsers.guard1._id,
        leadId: confirmedClosure.lead_id,
        status: "disbursed" as const,
        amount: 72000,
      },
      {
        key: "P5",
        guardId: guardUsers.guard2._id,
        leadId: confirmedClosure.lead_id,
        status: "voided" as const,
        amount: 30000,
      },
    ];

    for (const definition of payoutDefinitions) {
      let payout = await ctx.db
        .query("payouts")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", definition.leadId))
        .filter((q) =>
          q.and(
            q.eq(q.field("guard_user_id"), definition.guardId),
            q.eq(q.field("status"), definition.status),
          ),
        )
        .first();

      if (!payout) {
        const payoutId = await ctx.db.insert("payouts", {
          guard_user_id: definition.guardId,
          lead_id: definition.leadId,
          closure_id: confirmedClosure._id,
          amount_paise: definition.amount,
          method: definition.status === "pending" ? undefined : "UPI",
          status: definition.status,
          initiated_by_admin_id: founder_one._id,
          approved_by_admin_id:
            definition.status === "approved" || definition.status === "disbursed"
              ? founder_one._id
              : undefined,
          approved_at:
            definition.status === "approved" || definition.status === "disbursed"
              ? now - 2 * 60 * 60 * 1000
              : undefined,
          disbursed_at: definition.status === "disbursed" ? now - 60 * 60 * 1000 : undefined,
          payment_reference:
            definition.status === "disbursed" ? `DEMO-UPI-${definition.key}` : undefined,
          failure_reason: undefined,
          voided_reason:
            definition.status === "voided" ? "Owner dispute in demo record" : undefined,
          voided_by: definition.status === "voided" ? founder_one._id : undefined,
          voided_at: definition.status === "voided" ? now : undefined,
        });

        const insertedPayout = await ctx.db.get(payoutId);
        if (!insertedPayout) {
          continue;
        }
        payout = insertedPayout;
      }

      const existingAdjustment = await ctx.db
        .query("payout_adjustments")
        .withIndex("by_payout", (q) => q.eq("payout_id", payout._id))
        .first();

      if (!existingAdjustment) {
        await ctx.db.insert("payout_adjustments", {
          payout_id: payout._id,
          guard_user_id: payout.guard_user_id,
          base_amount_paise: payout.amount_paise,
          quality_score: 84,
          quality_tier: "SILVER",
          quality_multiplier: 1.1,
          streak_bonus_paise: 5000,
          task_bonuses: [
            {
              bonus_type: "FULL_CHECKLIST",
              label: "Checklist completed",
              amount_paise: 2000,
              percentage: undefined,
            },
          ],
          task_bonuses_total_paise: 2000,
          penalties: [],
          penalty_total_paise: 0,
          suggested_total_paise: payout.amount_paise + 7000,
          admin_override_paise: undefined,
          final_amount_paise: payout.amount_paise,
          computed_at: now,
          is_deleted: false,
        });
      }
    }

    return { seeded: true };
  },
});

export const seedDemoEngagement = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.founder_one))
      .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
      .first();
    if (!founder_one) {
      throw new Error("seedDemoEngagement: Missing Test Admin user");
    }

    const supportEntries = [
      { email: "support+open@test.demorentals.com", status: "OPEN" as const },
      { email: "support+progress@test.demorentals.com", status: "IN_PROGRESS" as const },
      { email: "support+resolved@test.demorentals.com", status: "RESOLVED" as const },
      { email: "support+closed@test.demorentals.com", status: "CLOSED" as const },
      { email: "support+owner@test.demorentals.com", status: "OPEN" as const },
    ];

    for (const entry of supportEntries) {
      const existing = await ctx.db
        .query("support_inquiries")
        .withIndex("by_email", (q) => q.eq("email", entry.email))
        .filter((q) => q.eq(q.field("subject"), "Demo support inquiry"))
        .first();

      if (!existing) {
        await ctx.db.insert("support_inquiries", {
          name: "Demo User",
          email: entry.email,
          phone: "9444400000",
          subject: "Demo support inquiry",
          message: "This is seeded support traffic for CRM demos.",
          preferred_contact_method: "EMAIL",
          persona_type: "TENANT",
          source_channel: "demo_seed",
          status: entry.status,
          ops_notes: "Seeded support ticket",
          assigned_admin_id: founder_one._id,
          resolved_at: entry.status === "RESOLVED" || entry.status === "CLOSED" ? now : undefined,
          closed_at: entry.status === "CLOSED" ? now : undefined,
          ip_address: "127.0.0.1",
          is_deleted: false,
        });
      }
    }

    const ownerUser1 = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.owner1))
      .filter((q) => q.eq(q.field("user_type"), "OWNER"))
      .first();
    const ownerUser2 = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.owner2))
      .filter((q) => q.eq(q.field("user_type"), "OWNER"))
      .first();

    const ownerRequestEntries = [
      {
        phone: "8111100001",
        name: "Owner Prospect A",
        status: "SUBMITTED" as const,
        ownerUserId: undefined,
      },
      {
        phone: "8111100002",
        name: "Owner Prospect B",
        status: "CONTACTED" as const,
        ownerUserId: undefined,
      },
      {
        phone: "8111100003",
        name: "Owner Prospect C",
        status: "ONBOARDED" as const,
        ownerUserId: ownerUser1?._id,
      },
      {
        phone: "8111100004",
        name: "Owner Prospect D",
        status: "ACTIVE" as const,
        ownerUserId: ownerUser2?._id,
      },
    ];

    for (const entry of ownerRequestEntries) {
      const existing = await ctx.db
        .query("owner_service_requests")
        .withIndex("by_phone", (q) => q.eq("phone", entry.phone))
        .filter((q) => q.eq(q.field("status"), entry.status))
        .first();

      if (!existing) {
        await ctx.db.insert("owner_service_requests", {
          name: entry.name,
          phone: entry.phone,
          email: `${entry.phone}@owner.demo`,
          property_type: "Apartment",
          location: "Mumbai",
          property_value: 15000000,
          notes: "Seeded owner request",
          status: entry.status,
          ops_notes: "Seeded for admin CRM demo",
          assigned_admin_id: founder_one._id,
          contacted_at:
            entry.status === "CONTACTED" ||
            entry.status === "ONBOARDED" ||
            entry.status === "ACTIVE"
              ? now - 24 * 60 * 60 * 1000
              : undefined,
          owner_user_id: entry.ownerUserId,
        });
      }
    }

    const guard1 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard1))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();
    const guard2 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard2))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();
    const tenant1 = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.tenant1))
      .filter((q) => q.eq(q.field("user_type"), "TENANT"))
      .first();
    const tenant2 = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.tenant2))
      .filter((q) => q.eq(q.field("user_type"), "TENANT"))
      .first();

    if (!guard1 || !guard2 || !tenant1 || !tenant2 || !ownerUser1 || !ownerUser2) {
      return { seeded: false };
    }

    const referralCodeSeeds = [
      { userId: guard1._id, code: "GUARD999" },
      { userId: tenant1._id, code: "TENANT1" },
    ];

    const referralCodeByUser = new Map<Id<"users">, Doc<"referral_codes">>();

    for (const seed of referralCodeSeeds) {
      let codeDoc = await ctx.db
        .query("referral_codes")
        .withIndex("by_user_id", (q) => q.eq("user_id", seed.userId))
        .first();

      if (!codeDoc) {
        const codeId = await ctx.db.insert("referral_codes", {
          user_id: seed.userId,
          code: seed.code,
          is_active: true,
        });
        const inserted = await ctx.db.get(codeId);
        if (inserted) {
          codeDoc = inserted;
        }
      }

      if (codeDoc) {
        referralCodeByUser.set(seed.userId, codeDoc);
      }
    }

    const anyListing = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "PUBLISHED"))
      .first();
    const anyClosure = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", "CONFIRMED"))
      .first();
    const anyLead = await ctx.db
      .query("leads")
      .withIndex("by_status", (q) => q.eq("status", "VERIFIED"))
      .first();

    const referralSeeds: Array<{
      key: string;
      referrer: Id<"users">;
      referred: Id<"users">;
      type: Doc<"referrals">["referral_type"];
      status: Doc<"referrals">["status"];
      referralCodeId?: Id<"referral_codes">;
      leadId?: Id<"leads">;
      listingId?: Id<"listings">;
      closureId?: Id<"closures">;
    }> = [
      {
        key: "R1",
        referrer: guard1._id,
        referred: guard2._id,
        type: "GUARD",
        status: "QUALIFIED",
        referralCodeId: referralCodeByUser.get(guard1._id)?._id,
        leadId: anyLead?._id,
      },
      {
        key: "R2",
        referrer: tenant1._id,
        referred: tenant2._id,
        type: "TENANT_FINDING",
        status: "PARTIALLY_PAID",
        referralCodeId: referralCodeByUser.get(tenant1._id)?._id,
        listingId: anyListing?._id,
      },
      {
        key: "R3",
        referrer: ownerUser1._id,
        referred: ownerUser2._id,
        type: "OWNER_FINDING",
        status: "PENDING",
        referralCodeId: undefined,
        closureId: anyClosure?._id,
      },
    ];

    const referralByKey = new Map<string, Doc<"referrals">>();

    for (const referralSeed of referralSeeds) {
      let referral = await ctx.db
        .query("referrals")
        .withIndex("by_referrer_user_id", (q) => q.eq("referrer_user_id", referralSeed.referrer))
        .filter((q) =>
          q.and(
            q.eq(q.field("referred_user_id"), referralSeed.referred),
            q.eq(q.field("referral_type"), referralSeed.type),
          ),
        )
        .first();

      if (!referral) {
        const referralId = await ctx.db.insert("referrals", {
          referrer_user_id: referralSeed.referrer,
          referred_user_id: referralSeed.referred,
          referral_code_id: referralSeed.referralCodeId,
          referral_type: referralSeed.type,
          status: referralSeed.status,
          lead_id: referralSeed.leadId,
          listing_id: referralSeed.listingId,
          closure_id: referralSeed.closureId,
          voided_reason: undefined,
          voided_by_admin_id: undefined,
        });
        const inserted = await ctx.db.get(referralId);
        if (inserted) {
          referral = inserted;
        }
      }

      if (referral) {
        referralByKey.set(referralSeed.key, referral);
      }
    }

    const milestoneSeeds: Array<{
      referralKey: string;
      type: Doc<"referral_milestones">["milestone_type"];
      amount: number;
      status: Doc<"referral_milestones">["status"];
    }> = [
      { referralKey: "R1", type: "FIRST_VERIFIED_LEAD", amount: 50000, status: "APPROVED" },
      { referralKey: "R2", type: "SIGN_UP", amount: 20000, status: "PAID" },
      { referralKey: "R3", type: "DEAL_CLOSED", amount: 200000, status: "TRIGGERED" },
    ];

    for (const milestoneSeed of milestoneSeeds) {
      const referral = referralByKey.get(milestoneSeed.referralKey);
      if (!referral) {
        continue;
      }

      const existingMilestone = await ctx.db
        .query("referral_milestones")
        .withIndex("by_referral_id", (q) => q.eq("referral_id", referral._id))
        .filter((q) => q.eq(q.field("milestone_type"), milestoneSeed.type))
        .first();

      if (!existingMilestone) {
        await ctx.db.insert("referral_milestones", {
          referral_id: referral._id,
          milestone_type: milestoneSeed.type,
          amount: milestoneSeed.amount,
          status: milestoneSeed.status,
          triggered_at: now,
          approved_by_admin_id:
            milestoneSeed.status === "APPROVED" || milestoneSeed.status === "PAID"
              ? founder_one._id
              : undefined,
          paid_at: milestoneSeed.status === "PAID" ? now : undefined,
          payout_method: milestoneSeed.status === "PAID" ? "UPI" : undefined,
          voided_reason: undefined,
        });
      }
    }

    const inquiryForChat =
      (await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_status", (q) => q.eq("status", "CLOSED"))
        .first()) ??
      (await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_status", (q) => q.eq("status", "SUBMITTED"))
        .first());

    if (!inquiryForChat) {
      return { seeded: true };
    }

    let chatChannel = await ctx.db
      .query("chat_channels")
      .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", inquiryForChat._id))
      .first();

    if (!chatChannel) {
      const channelId = await ctx.db.insert("chat_channels", {
        inquiry_id: inquiryForChat._id,
        status: "ACTIVE",
        created_by_admin_id: founder_one._id,
        created_at: now,
      });
      const inserted = await ctx.db.get(channelId);
      if (inserted) {
        chatChannel = inserted;
      }
    }

    if (chatChannel) {
      const chatMessages = [
        { role: "TENANT" as const, sender: tenant1._id, text: "Hi, is the rent negotiable?" },
        {
          role: "OWNER" as const,
          sender: ownerUser1._id,
          text: "Slightly negotiable for long lease.",
        },
        {
          role: "TENANT" as const,
          sender: tenant1._id,
          text: "Can I schedule a visit this Saturday?",
        },
        { role: "OWNER" as const, sender: ownerUser1._id, text: "Yes, post 4 PM works for me." },
        { role: "TENANT" as const, sender: tenant1._id, text: "Great, confirming with guard now." },
      ];

      for (const message of chatMessages) {
        const existingMessage = await ctx.db
          .query("chat_messages")
          .withIndex("by_channel_id", (q) => q.eq("channel_id", chatChannel._id))
          .filter((q) => q.eq(q.field("original_content"), message.text))
          .first();

        if (!existingMessage) {
          await ctx.db.insert("chat_messages", {
            channel_id: chatChannel._id,
            sender_user_id: message.sender,
            sender_role: message.role,
            original_content: message.text,
            masked_content: message.text,
            batch_id: undefined,
            status: "DELIVERED",
            failure_reason: undefined,
            admin_review_required: false,
            is_ai_processed: true,
            created_at: now,
          });
        }
      }
    }

    const newsletterEmails = [
      "newsletter1@test.demorentals.com",
      "newsletter2@test.demorentals.com",
      "newsletter3@test.demorentals.com",
    ];

    for (const email of newsletterEmails) {
      const existingSub = await ctx.db
        .query("newsletter_subscriptions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();

      if (!existingSub) {
        await ctx.db.insert("newsletter_subscriptions", {
          email,
          source_page: "/contact",
          subscribed_at: now,
          is_deleted: false,
        });
      } else if (existingSub.is_deleted) {
        await ctx.db.patch(existingSub._id, { is_deleted: false });
      }
    }

    return { seeded: true };
  },
});

export const seedDemoOpsData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.founder_one))
      .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
      .first();
    if (!founder_one) {
      throw new Error("seedDemoOpsData: Missing Test Admin user");
    }

    const templateLight = await ctx.db
      .query("checklist_templates")
      .withIndex("by_depth_and_active", (q) => q.eq("depth", "LIGHT").eq("is_active", true))
      .first();
    const templateMedium = await ctx.db
      .query("checklist_templates")
      .withIndex("by_depth_and_active", (q) => q.eq("depth", "MEDIUM").eq("is_active", true))
      .first();
    const templateFull = await ctx.db
      .query("checklist_templates")
      .withIndex("by_depth_and_active", (q) => q.eq("depth", "FULL").eq("is_active", true))
      .first();

    const visitSubmitted = await ctx.db
      .query("visits")
      .withIndex("by_status", (q) => q.eq("status", "COMPLETED"))
      .first();
    const visitApproved = await ctx.db
      .query("visits")
      .withIndex("by_status", (q) => q.eq("status", "CONFIRMED"))
      .first();
    const visitInProgress = await ctx.db
      .query("visits")
      .withIndex("by_status", (q) => q.eq("status", "IN_PROGRESS"))
      .first();

    const checklistSeeds: Array<{
      visit: Doc<"visits"> | null;
      template: Doc<"checklist_templates"> | null;
      depth: Doc<"checklist_instances">["depth"];
      status: Doc<"checklist_instances">["status"];
      score: number;
    }> = [
      {
        visit: visitSubmitted,
        template: templateLight,
        depth: "LIGHT",
        status: "SUBMITTED",
        score: 78,
      },
      {
        visit: visitApproved,
        template: templateMedium,
        depth: "MEDIUM",
        status: "APPROVED",
        score: 92,
      },
      {
        visit: visitInProgress,
        template: templateFull,
        depth: "FULL",
        status: "IN_PROGRESS",
        score: 41,
      },
    ];

    for (const seed of checklistSeeds) {
      const visit = seed.visit;
      const template = seed.template;
      if (!visit || !template) {
        continue;
      }
      const visitId = visit._id;

      const existingChecklist = await ctx.db
        .query("checklist_instances")
        .withIndex("by_visit_id", (q) => q.eq("visit_id", visitId))
        .first();

      if (!existingChecklist) {
        await ctx.db.insert("checklist_instances", {
          template_id: template._id,
          visit_id: visitId,
          assigned_to: visit.assigned_guard_id,
          assigned_by: founder_one._id,
          depth: seed.depth,
          status: seed.status,
          completeness_score: seed.score,
          responses: [
            {
              item_id: "general-condition",
              section_id: "overview",
              value: "Good",
              condition_rating: "GOOD",
              photo_ids: [],
              photo_metadata: [],
              notes: "Seeded checklist response",
              completed_at: seed.status === "IN_PROGRESS" ? undefined : now,
            },
          ],
          review_notes: seed.status === "APPROVED" ? "Looks complete" : undefined,
          reviewed_by: seed.status === "APPROVED" ? founder_one._id : undefined,
          reviewed_at: seed.status === "APPROVED" ? now : undefined,
          submitted_at: seed.status === "SUBMITTED" || seed.status === "APPROVED" ? now : undefined,
          started_at: now - 30 * 60 * 1000,
          is_deleted: false,
        });
      }
    }

    const closureConfirmed = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", "CONFIRMED"))
      .first();
    const closurePending = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .first();

    const documentSeeds = [
      {
        closure: closureConfirmed,
        requirementType: "OWNER_DOCS" as const,
        overallStatus: "COMPLETE" as const,
      },
      {
        closure: closurePending,
        requirementType: "TENANT_DOCS" as const,
        overallStatus: "IN_PROGRESS" as const,
      },
    ];

    for (const seed of documentSeeds) {
      const closure = seed.closure;
      if (!closure) {
        continue;
      }
      const closureId = closure._id;

      const existingRequirement = await ctx.db
        .query("document_requirements")
        .withIndex("by_closure_id", (q) => q.eq("closure_id", closureId))
        .filter((q) => q.eq(q.field("requirement_type"), seed.requirementType))
        .first();

      if (!existingRequirement) {
        await ctx.db.insert("document_requirements", {
          lead_id: closure.lead_id,
          listing_id: closure.listing_id,
          closure_id: closureId,
          requirement_type: seed.requirementType,
          assigned_to: undefined,
          assigned_by: founder_one._id,
          overall_status: seed.overallStatus,
          items: [
            {
              item_id: "id-proof",
              label: "Government ID",
              description: "PAN or Aadhaar",
              is_required: true,
              status: seed.overallStatus === "COMPLETE" ? "VERIFIED" : "PENDING",
              storage_id: undefined,
              file_type: undefined,
              file_size: undefined,
              collected_at: seed.overallStatus === "COMPLETE" ? now : undefined,
              collected_by: seed.overallStatus === "COMPLETE" ? founder_one._id : undefined,
              verified_at: seed.overallStatus === "COMPLETE" ? now : undefined,
              verified_by: seed.overallStatus === "COMPLETE" ? founder_one._id : undefined,
              rejection_notes: undefined,
              notes: "Demo seeded item",
            },
          ],
          notes: "Demo seeded document requirement",
          is_deleted: false,
        });
      }
    }

    const regulatorySeeds = [
      {
        closure: closureConfirmed,
        itemType: "POLICE_VERIFICATION" as const,
        status: "APPROVED" as const,
      },
      {
        closure: closurePending,
        itemType: "RENT_REGISTRATION" as const,
        status: "IN_PROGRESS" as const,
      },
    ];

    for (const seed of regulatorySeeds) {
      const closure = seed.closure;
      if (!closure) {
        continue;
      }
      const closureId = closure._id;

      const existingRegulatory = await ctx.db
        .query("regulatory_items")
        .withIndex("by_closure_id", (q) => q.eq("closure_id", closureId))
        .filter((q) => q.eq(q.field("item_type"), seed.itemType))
        .first();

      if (!existingRegulatory) {
        await ctx.db.insert("regulatory_items", {
          closure_id: closureId,
          item_type: seed.itemType,
          status: seed.status,
          reference_number: `DEMO-${seed.itemType}`,
          sla_deadline: now + 7 * 24 * 60 * 60 * 1000,
          submitted_at:
            seed.status === "IN_PROGRESS" || seed.status === "APPROVED" ? now : undefined,
          completed_at: seed.status === "APPROVED" ? now : undefined,
          assigned_to: undefined,
          assigned_by: founder_one._id,
          linked_document_ids: [],
          notes: "Seeded regulatory tracking item",
          escalation_notes: undefined,
          is_deleted: false,
        });
      }
    }

    const guardIds: Id<"users">[] = [];
    const guard1 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard1))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();
    const guard2 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard2))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();
    const guard3 = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.guard3))
      .filter((q) => q.eq(q.field("user_type"), "GUARD"))
      .first();

    if (guard1) {
      guardIds.push(guard1._id);
    }
    if (guard2) {
      guardIds.push(guard2._id);
    }
    if (guard3) {
      guardIds.push(guard3._id);
    }

    for (let guardIndex = 0; guardIndex < guardIds.length; guardIndex += 1) {
      const guardId = guardIds[guardIndex];
      for (let sample = 0; sample < 2; sample += 1) {
        const computedAt = now - (guardIndex * 2 + sample + 1) * 60 * 60 * 1000;
        const existingHistory = await ctx.db
          .query("quality_score_history")
          .withIndex("by_guard_and_date", (q) =>
            q.eq("guard_user_id", guardId).eq("computed_at", computedAt),
          )
          .first();

        if (!existingHistory) {
          const score = 70 + guardIndex * 8 + sample * 3;
          const tier: Doc<"quality_score_history">["tier"] =
            score >= 90 ? "PLATINUM" : score >= 80 ? "GOLD" : "SILVER";

          await ctx.db.insert("quality_score_history", {
            guard_user_id: guardId,
            score,
            components: {
              checklist: 22,
              photo: 18,
              speed: 14,
              verification: 10,
              document: 8,
            },
            trigger: "CRON_DAILY",
            tier,
            computed_at: computedAt,
            is_deleted: false,
          });
        }
      }
    }

    const streakSeeds: Array<{
      guardId: Id<"users">;
      streakType: Doc<"guard_streaks">["streak_type"];
      count: number;
      date: string;
    }> = guardIds.map((guardId, index) => ({
      guardId,
      streakType: index === 0 ? "DAILY_ACTIVE" : index === 1 ? "WEEKLY_WARRIOR" : "QUALITY_CHAIN",
      count: 3 + index,
      date: dayKey(0),
    }));

    for (const seed of streakSeeds) {
      const existingStreak = await ctx.db
        .query("guard_streaks")
        .withIndex("by_guard_and_type", (q) =>
          q.eq("guard_user_id", seed.guardId).eq("streak_type", seed.streakType),
        )
        .first();

      if (!existingStreak) {
        await ctx.db.insert("guard_streaks", {
          guard_user_id: seed.guardId,
          streak_type: seed.streakType,
          current_count: seed.count,
          longest_count: seed.count + 2,
          is_active: true,
          last_activity_date: seed.date,
          started_at: now - 10 * 24 * 60 * 60 * 1000,
          updated_at: now,
          is_deleted: false,
        });
      }
    }

    const incentiveSeeds: Array<{
      guardId: Id<"users">;
      cardType: Doc<"incentive_cards">["card_type"];
      level: Doc<"incentive_cards">["level"];
      title: string;
      description: string;
      reward: number;
    }> = [
      {
        guardId: guardIds[0],
        cardType: "lead_milestone",
        level: "BRONZE",
        title: "Lead Milestone",
        description: "Submitted 10 quality leads",
        reward: 5000,
      },
      {
        guardId: guardIds[1],
        cardType: "visit_milestone",
        level: "SILVER",
        title: "Visit Warrior",
        description: "Completed 15 visits",
        reward: 8000,
      },
      {
        guardId: guardIds[2],
        cardType: "quality_streak",
        level: "GOLD",
        title: "Quality Chain",
        description: "Maintained high quality for 2 weeks",
        reward: 12000,
      },
      {
        guardId: guardIds[0],
        cardType: "speed_bonus",
        level: "SILVER",
        title: "Speed Bonus",
        description: "Quick turnaround on verification",
        reward: 4000,
      },
      {
        guardId: guardIds[1],
        cardType: "monthly_top",
        level: "PLATINUM",
        title: "Monthly Top Performer",
        description: "Highest quality score this month",
        reward: 15000,
      },
    ];

    for (const seed of incentiveSeeds) {
      if (!seed.guardId) {
        continue;
      }
      const existingCard = await ctx.db
        .query("incentive_cards")
        .withIndex("by_guard_and_type", (q) =>
          q.eq("guard_user_id", seed.guardId).eq("card_type", seed.cardType),
        )
        .first();

      if (!existingCard) {
        await ctx.db.insert("incentive_cards", {
          guard_user_id: seed.guardId,
          card_type: seed.cardType,
          level: seed.level,
          awarded_method: "MANUAL",
          title: seed.title,
          description: seed.description,
          badge_icon: "star",
          reward_amount_paise: seed.reward,
          awarded_reason: "Seeded demo incentive",
          awarded_by_admin_id: founder_one._id,
          earned_at: now,
          rejected_at: undefined,
          redeemed_at: undefined,
          expires_at: now + 45 * 24 * 60 * 60 * 1000,
          metadata: { source: "seedDemoOpsData" },
          status: "active",
        });
      }
    }

    const owner1 = await ctx.db
      .query("owners")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.owner1))
      .first();
    const owner2 = await ctx.db
      .query("owners")
      .withIndex("by_phone", (q) => q.eq("phone", DEMO_PHONES.owner2))
      .first();
    const guardProfile1 = guard1
      ? await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", guard1._id))
          .first()
      : null;
    const guardProfile2 = guard2
      ? await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", guard2._id))
          .first()
      : null;
    const confirmedClosure = await ctx.db
      .query("closures")
      .withIndex("by_status", (q) => q.eq("status", "CONFIRMED"))
      .first();

    const assignmentSeeds: Array<{
      owner: Doc<"owners"> | null;
      guardProfile: Doc<"guard_profiles"> | null;
      guardUser: Doc<"users"> | null;
      closure?: Doc<"closures"> | null;
    }> = [
      {
        owner: owner1,
        guardProfile: guardProfile1,
        guardUser: guard1,
        closure: confirmedClosure,
      },
      {
        owner: owner2,
        guardProfile: guardProfile2,
        guardUser: guard2,
        closure: confirmedClosure,
      },
    ];

    const assignments: Doc<"owner_rm_assignments">[] = [];

    for (const seed of assignmentSeeds) {
      const owner = seed.owner;
      const guardProfile = seed.guardProfile;
      const guardUser = seed.guardUser;
      if (!owner || !guardProfile || !guardUser) {
        continue;
      }
      const ownerId = owner._id;
      const guardProfileId = guardProfile._id;
      const guardUserId = guardUser._id;

      let assignment = await ctx.db
        .query("owner_rm_assignments")
        .withIndex("by_owner", (q) => q.eq("owner_id", ownerId).eq("status", "ACTIVE"))
        .first();

      if (!assignment) {
        const assignmentId = await ctx.db.insert("owner_rm_assignments", {
          owner_id: ownerId,
          rm_guard_id: guardProfileId,
          rm_user_id: guardUserId,
          source_closure_id: seed.closure?._id,
          assigned_by: "ADMIN",
          assigned_by_admin_id: founder_one._id,
          status: "ACTIVE",
          last_check_in_at: now - 2 * 24 * 60 * 60 * 1000,
          next_check_in_due: now + 5 * 24 * 60 * 60 * 1000,
          check_in_frequency_days: 7,
          missed_check_ins_count: 0,
          performance_score: 88,
          sla_breach_count: 0,
          last_sla_breach_at: undefined,
          escalation_level: 0,
          reassigned_at: undefined,
          reassigned_to_guard_id: undefined,
          reassignment_reason: undefined,
          created_at: now,
          updated_at: now,
        });
        const inserted = await ctx.db.get(assignmentId);
        if (inserted) {
          assignment = inserted;
        }
      }

      if (assignment) {
        assignments.push(assignment);
        await ctx.db.patch(ownerId, {
          current_rm_id: guardUserId,
          current_rm_guard_id: guardProfileId,
          updated_at: now,
          last_activity_at: now,
        });
      }
    }

    const checkInSeeds = [
      {
        assignment: assignments[0],
        type: "SCHEDULED" as const,
        method: "CALL" as const,
        outcome: "RESOLVED" as const,
        summary: "Owner confirmed rent expectations.",
      },
      {
        assignment: assignments[1],
        type: "ISSUE" as const,
        method: "WHATSAPP" as const,
        outcome: "PENDING" as const,
        summary: "Pending maintenance request review.",
      },
      {
        assignment: assignments[0],
        type: "AD_HOC" as const,
        method: "IN_PERSON" as const,
        outcome: "ESCALATED" as const,
        summary: "Escalated rental agreement concern.",
      },
    ];

    for (const seed of checkInSeeds) {
      if (!seed.assignment) {
        continue;
      }
      const existingCheckIn = await ctx.db
        .query("rm_check_ins")
        .withIndex("by_assignment", (q) => q.eq("assignment_id", seed.assignment._id))
        .filter((q) => q.eq(q.field("summary"), seed.summary))
        .first();

      if (!existingCheckIn) {
        await ctx.db.insert("rm_check_ins", {
          assignment_id: seed.assignment._id,
          owner_id: seed.assignment.owner_id,
          rm_guard_id: seed.assignment.rm_guard_id,
          check_in_type: seed.type,
          method: seed.method,
          summary: seed.summary,
          outcome: seed.outcome,
          owner_satisfaction: seed.outcome === "ESCALATED" ? 2 : 4,
          created_at: now,
        });
      }
    }

    for (let i = 0; i < 3; i += 1) {
      const snapshotDate = dayKey(i);
      const existingSnapshot = await ctx.db
        .query("analytics_snapshots")
        .withIndex("by_type_and_date", (q) =>
          q.eq("snapshot_type", "daily_demo").eq("snapshot_date", snapshotDate),
        )
        .first();

      if (!existingSnapshot) {
        await ctx.db.insert("analytics_snapshots", {
          snapshot_date: snapshotDate,
          snapshot_type: "daily_demo",
          data: {
            leads: 20 - i * 2,
            visits: 12 - i,
            closures: 3,
            payouts: 5,
          },
        });
      }
    }

    return { seeded: true };
  },
});

export const seedDemoVersion = internalMutation({
  args: {},
  handler: async (ctx) => {
    const founder_one = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_EMAILS.founder_one))
      .filter((q) => q.eq(q.field("user_type"), "ADMIN"))
      .first();
    if (!founder_one) {
      throw new Error("seedDemoVersion: Missing Test Admin user");
    }

    const existing = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", SEED_DEMO_VERSION_KEY))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: SEED_DEMO_VERSION,
        updated_by_admin_id: founder_one._id,
      });
      return { updated: true };
    }

    await ctx.db.insert("system_config", {
      key: SEED_DEMO_VERSION_KEY,
      value: SEED_DEMO_VERSION,
      updated_by_admin_id: founder_one._id,
    });

    return { inserted: true };
  },
});

export const mega = internalAction({
  args: {},
  handler: async (ctx) => {
    const check = await ctx.runQuery(internal.seedDemo.seedDemoCheck, {});
    if (check.isSeeded && check.version === SEED_DEMO_VERSION) {
      console.log(`Demo data already seeded (v${SEED_DEMO_VERSION}). Skipping.`);
      return;
    }

    await ctx.runMutation(internal.seed.init, {});

    const workosMap = await ctx.runAction(internal.actions.workos.ensureDevWorkosUsers, {});

    await ctx.runMutation(internal.seedDemo.seedDemoUsers, { workosUserMap: workosMap });
    await ctx.runMutation(internal.seedDemo.seedDemoSocieties, {});
    await ctx.runMutation(internal.seedDemo.seedDemoLeads, {});
    await ctx.runMutation(internal.seedDemo.seedDemoListings, {});
    await ctx.runMutation(internal.seedDemo.seedDemoDemandPipeline, {});
    await ctx.runMutation(internal.seedDemo.seedDemoEngagement, {});
    await ctx.runMutation(internal.seedDemo.seedDemoOpsData, {});

    await ctx.runMutation(internal.seedDemoNegotiations.cleanupNegotiations, {});
    await ctx.runMutation(internal.seedDemoNegotiations.seedDemoNegotiations, {});
    await ctx.runMutation(internal.seedDemoNegotiations.seedDemoDealRoom, {});
    await ctx.runMutation(internal.seedDemoTransactions.seedDemoTransactions, {});
    await ctx.runMutation(internal.seedDemoTier2.seedDemoNotifications, {});
    await ctx.runMutation(internal.seedDemoTier2.seedDemoTrustBadges, {});
    await ctx.runMutation(internal.seedDemoTier2.seedDemoCommissions, {});
    await ctx.runMutation(internal.seedDemoTier2.seedDemoGamification, {});

    // === v3.0: Chat Pipeline Scenarios ===
    console.log("  📨 Seeding chat pipeline scenarios...");
    await ctx.runMutation(internal.seedDemoChat.seedChatSuccessfulBatch, {});
    await ctx.runMutation(internal.seedDemoChat.seedChatFailedBatch, {});
    await ctx.runMutation(internal.seedDemoChat.seedChatStaleBatch, {});
    await ctx.runMutation(internal.seedDemoChat.seedChatImpersonated, {});

    // === v3.0: End-to-End Journey Scenarios ===
    console.log("  🗺️ Seeding end-to-end journeys...");
    await ctx.runMutation(internal.seedDemoJourneys.seedJourneyLeadToClosureHappy, {});
    await ctx.runMutation(internal.seedDemoJourneys.seedJourneyNegotiationToClosure, {});
    await ctx.runMutation(internal.seedDemoJourneys.seedJourneyTransactionComplete, {});
    await ctx.runMutation(internal.seedDemoJourneys.seedJourneyDealRoomApproved, {});
    await ctx.runMutation(internal.seedDemoJourneys.seedJourneyReferralFullCycle, {});

    // === v3.0: Verification Outcome Scenarios ===
    console.log("  ✅ Seeding verification outcomes...");
    await ctx.runMutation(internal.seedDemoJourneys.seedVerificationVerified, {});
    await ctx.runMutation(internal.seedDemoJourneys.seedVerificationUnreachable, {});
    await ctx.runMutation(internal.seedDemoJourneys.seedVerificationDeclined, {});
    await ctx.runMutation(internal.seedDemoJourneys.seedVerificationFalseInfo, {});

    // === v3.0: Negotiation Edge Cases ===
    console.log("  🤝 Seeding negotiation edge cases...");
    await ctx.runMutation(internal.seedDemoNegotiations.seedNegotiationStale, {});
    await ctx.runMutation(internal.seedDemoNegotiations.seedNegotiationTooManyRounds, {});
    await ctx.runMutation(internal.seedDemoNegotiations.seedNegotiationTokenWithoutAgreement, {});
    await ctx.runMutation(internal.seedDemoNegotiations.seedNegotiationFailed, {});

    // === v3.0: Transaction Edge Cases ===
    console.log("  💳 Seeding transaction edge cases...");
    await ctx.runMutation(internal.seedDemoTransactions.seedTransactionKycRejected, {});
    await ctx.runMutation(internal.seedDemoTransactions.seedTransactionAgreementExpired, {});
    await ctx.runMutation(internal.seedDemoTransactions.seedTransactionDepositDisputed, {});
    await ctx.runMutation(internal.seedDemoTransactions.seedTransactionCancelled, {});

    // === v3.0: Edge Cases (Quality, RM, Checklists) ===
    console.log("  ⚠️ Seeding edge cases...");
    await ctx.runMutation(internal.seedDemoEdgeCases.seedGuardQualityDecline, {});
    await ctx.runMutation(internal.seedDemoEdgeCases.seedRmEscalation, {});
    await ctx.runMutation(internal.seedDemoEdgeCases.seedChecklistRevision, {});

    // === v3.0: Command Center (KPI, Warnings) ===
    console.log("  📊 Seeding command center data...");
    await ctx.runMutation(internal.seedDemoCommandCenter.seedOpsTargetMissed, {});

    // === v3.0: Tier 2 Expansion (Notifications, Gamification, Commission) ===
    console.log("  🎮 Seeding tier 2 expansion...");
    await ctx.runMutation(internal.seedDemoTier2.seedNotificationTemplates, {});
    await ctx.runMutation(internal.seedDemoTier2.seedNotificationLifecycle, {});
    await ctx.runMutation(internal.seedDemoTier2.seedGamificationProfiles, {});
    await ctx.runMutation(internal.seedDemoTier2.seedCommissionEvaluations, {});
    await ctx.runMutation(internal.seedDemoTier2.seedIncentiveDisbursements, {});

    await ctx.runMutation(internal.seedDemo.seedDemoVersion, {});

    console.log("✅ Demo data seeded successfully (v3.0)!");
  },
});

export const seedMega = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal.seedDemo.mega, {});
    return { success: true, message: "Demo data seeded" };
  },
});
