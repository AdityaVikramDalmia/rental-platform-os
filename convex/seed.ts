// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import { v } from "convex/values";
import { MOVE_IN_HANDOVER_TEMPLATE } from "../lib/checklists/move-in-handover-template";
import { PROPERTY_INSPECTION_TEMPLATES } from "../lib/checklists/property-inspection-templates";
import {
  ALL_PERMISSIONS,
  OPS_AGENT_PERMISSIONS,
  P44_CONFIG_KEYS,
  P45_CONFIG_KEYS,
  SYSTEM_CONFIG_DEFAULTS,
  SYSTEM_CONFIG_KEYS,
} from "../lib/constants";
import { LOCAL_AUTH_IDENTITIES, isLocalConvexAuthEnabled } from "../lib/localAuthConfig";
import type { Doc } from "./_generated/dataModel";
import { upsertChecklistTemplateByDepth } from "./checklistTemplates";
import { internalMutation } from "./functions";

void v;

const DEV_USERS = {
  founder_one: {
    workos_user_id: "user_01ADMIN0000000000000000000",
    user_type: "ADMIN" as const,
    name: "Test Admin",
    email: "admin@example.com",
    phone: undefined,
  },
  agent: {
    workos_user_id: "user_01AGENT0000000000000000000",
    user_type: "ADMIN" as const,
    name: "Agent Bot",
    email: "agent@example.com",
    phone: undefined,
  },
  guard: {
    workos_user_id: "user_01GUARD0000000000000000000",
    user_type: "GUARD" as const,
    name: "Test Guard",
    email: undefined,
    phone: "9999999999",
  },
  ops: {
    workos_user_id: "user_01OPSXX0000000000000000000",
    user_type: "OPS" as const,
    name: "Test OPS Agent",
    email: undefined,
    phone: "8888888888",
  },
  tenant: {
    workos_user_id: LOCAL_AUTH_IDENTITIES.tenant.workosUserId,
    user_type: "TENANT" as const,
    name: LOCAL_AUTH_IDENTITIES.tenant.name,
    email: LOCAL_AUTH_IDENTITIES.tenant.email,
    phone: "9111111111",
  },
  owner: {
    workos_user_id: LOCAL_AUTH_IDENTITIES.owner.workosUserId,
    user_type: "OWNER" as const,
    name: LOCAL_AUTH_IDENTITIES.owner.name,
    email: LOCAL_AUTH_IDENTITIES.owner.email,
    phone: "7000000001",
  },
};

const INITIAL_INCENTIVE_V3_CONFIG = {
  base_rate_bps: 1500,
  min_rate_bps: 1500,
  max_rate_bps: 2200,
  modifiers: [],
  stage_weights: {
    DISCOVERY: 25,
    VERIFICATION: 35,
    CLOSURE: 25,
    SUPPORT: 15,
  },
};

export const init = internalMutation({
  args: {},
  handler: async (ctx) => {
    const superAdminEmail =
      process.env.SUPER_ADMIN_EMAIL ??
      (isLocalConvexAuthEnabled() ? LOCAL_AUTH_IDENTITIES.admin.email : undefined);
    if (!superAdminEmail) {
      throw new Error("SUPER_ADMIN_EMAIL environment variable is required");
    }

    // ── Roles (idempotent) ───────────────────────────────────────────
    let superAdminRole = await ctx.db
      .query("roles")
      .filter((q) => q.eq(q.field("name"), "Super Admin"))
      .first();

    if (!superAdminRole) {
      const id = await ctx.db.insert("roles", {
        name: "Super Admin",
        permissions: [...ALL_PERMISSIONS],
        is_system_role: true,
        is_deleted: false,
      });
      superAdminRole = await ctx.db.get(id);
    } else {
      // Sync permissions — ALL_PERMISSIONS may have grown since the role was created
      const currentPerms = new Set(superAdminRole.permissions);
      const expectedPerms = ALL_PERMISSIONS;
      const missing = expectedPerms.filter((p) => !currentPerms.has(p));
      if (missing.length > 0) {
        await ctx.db.patch(superAdminRole._id, {
          permissions: [...ALL_PERMISSIONS],
        });
        console.log(
          `Super Admin role updated — added ${missing.length} new permission(s): ${missing.join(", ")}`,
        );
        superAdminRole = await ctx.db.get(superAdminRole._id);
      }
    }

    let opsAgentRole = await ctx.db
      .query("roles")
      .filter((q) => q.eq(q.field("name"), "Ops Agent"))
      .first();

    if (!opsAgentRole) {
      const id = await ctx.db.insert("roles", {
        name: "Ops Agent",
        permissions: [...OPS_AGENT_PERMISSIONS],
        is_system_role: true,
        is_deleted: false,
      });
      opsAgentRole = await ctx.db.get(id);
    } else {
      // Sync permissions — OPS_AGENT_PERMISSIONS may have grown since the role was created
      const currentPerms = new Set(opsAgentRole.permissions);
      const expectedPerms = OPS_AGENT_PERMISSIONS;
      const missing = expectedPerms.filter((p) => !currentPerms.has(p));
      if (missing.length > 0) {
        await ctx.db.patch(opsAgentRole._id, {
          permissions: [...OPS_AGENT_PERMISSIONS],
        });
        console.log(
          `Ops Agent role updated — added ${missing.length} new permission(s): ${missing.join(", ")}`,
        );
        opsAgentRole = await ctx.db.get(opsAgentRole._id);
      }
    }

    // ── Admin users (idempotent) ─────────────────────────────────────
    let founder_oneUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("workos_user_id"), DEV_USERS.founder_one.workos_user_id))
      .first();

    if (!founder_oneUser) {
      const id = await ctx.db.insert("users", {
        workos_user_id: DEV_USERS.founder_one.workos_user_id,
        user_type: DEV_USERS.founder_one.user_type,
        user_types: [DEV_USERS.founder_one.user_type],
        active_persona: DEV_USERS.founder_one.user_type,
        name: DEV_USERS.founder_one.name,
        email: superAdminEmail,
        status: "ACTIVE",
        must_change_password: false,
      });
      founder_oneUser = await ctx.db.get(id);
    }

    if (founder_oneUser && superAdminRole) {
      const existingAssignment = await ctx.db
        .query("user_role_assignments")
        .filter((q) =>
          q.and(
            q.eq(q.field("user_id"), founder_oneUser!._id),
            q.eq(q.field("role_id"), superAdminRole!._id),
          ),
        )
        .first();

      if (!existingAssignment) {
        await ctx.db.insert("user_role_assignments", {
          user_id: founder_oneUser._id,
          role_id: superAdminRole._id,
          assigned_by_admin_id: founder_oneUser._id,
          is_deleted: false,
        });
      }
    }

    // Agent dev user is created here so it exists for downstream demo
    // seeding (see seedDemo.ts), which handles its own role assignment.
    const existingAgentUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("workos_user_id"), DEV_USERS.agent.workos_user_id))
      .first();

    if (!existingAgentUser) {
      await ctx.db.insert("users", {
        workos_user_id: DEV_USERS.agent.workos_user_id,
        user_type: DEV_USERS.agent.user_type,
        user_types: [DEV_USERS.agent.user_type],
        active_persona: DEV_USERS.agent.user_type,
        name: DEV_USERS.agent.name,
        email: DEV_USERS.agent.email,
        status: "ACTIVE",
        must_change_password: false,
      });
    }

    // ── Test Society (idempotent) ────────────────────────────────────
    let testSociety = await ctx.db
      .query("societies")
      .filter((q) => q.eq(q.field("name"), "Test Society"))
      .first();

    if (!testSociety && founder_oneUser) {
      const id = await ctx.db.insert("societies", {
        name: "Test Society",
        city: "Mumbai",
        address: "123 Test Lane, Andheri",
        status: "ACTIVE",
        created_by_admin_id: founder_oneUser._id,
      });
      testSociety = await ctx.db.get(id);
    }

    // ── Test Building (idempotent) ───────────────────────────────────
    if (testSociety && founder_oneUser) {
      const existingBuilding = await ctx.db
        .query("buildings")
        .withIndex("by_society_id", (q) => q.eq("society_id", testSociety!._id))
        .filter((q) => q.eq(q.field("name"), "Test Tower A"))
        .first();

      if (!existingBuilding) {
        await ctx.db.insert("buildings", {
          society_id: testSociety._id,
          name: "Test Tower A",
          total_floors: 10,
          flats_per_floor: 4,
          total_flats: 40,
          floor_labels: ["Ground", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"],
          status: "ACTIVE",
          is_deleted: false,
        });
      }
    }

    // ── Test Guard (idempotent) ──────────────────────────────────────
    let testGuardUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("workos_user_id"), DEV_USERS.guard.workos_user_id))
      .first();

    if (!testGuardUser) {
      const id = await ctx.db.insert("users", {
        workos_user_id: DEV_USERS.guard.workos_user_id,
        user_type: DEV_USERS.guard.user_type,
        user_types: [DEV_USERS.guard.user_type],
        active_persona: DEV_USERS.guard.user_type,
        name: DEV_USERS.guard.name,
        phone: DEV_USERS.guard.phone,
        status: "ACTIVE",
        must_change_password: false,
      });
      testGuardUser = await ctx.db.get(id);
    }

    if (testGuardUser && testSociety) {
      const existingProfile = await ctx.db
        .query("guard_profiles")
        .withIndex("by_user_id", (q) => q.eq("user_id", testGuardUser!._id))
        .first();

      if (!existingProfile) {
        await ctx.db.insert("guard_profiles", {
          user_id: testGuardUser._id,
          society_id: testSociety._id,
          guard_type: "MAIN_GATE",
          has_seen_onboarding: false,
        });
        console.log("Created guard_profiles for Test Guard");
      }
    }

    // Ops dev user is created here so it exists for downstream demo
    // seeding (see seedDemo.ts), which handles its own role assignment.
    const existingTestOpsUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("workos_user_id"), DEV_USERS.ops.workos_user_id))
      .first();

    if (!existingTestOpsUser) {
      await ctx.db.insert("users", {
        workos_user_id: DEV_USERS.ops.workos_user_id,
        user_type: DEV_USERS.ops.user_type,
        user_types: [DEV_USERS.ops.user_type],
        active_persona: DEV_USERS.ops.user_type,
        name: DEV_USERS.ops.name,
        phone: DEV_USERS.ops.phone,
        status: "ACTIVE",
        must_change_password: false,
      });
    }

    // Tenant and owner demos make the zero-signup local-auth flow useful without
    // requiring the WorkOS-powered full demo seed. Never add these demo accounts
    // to a normal Convex deployment.
    if (isLocalConvexAuthEnabled()) {
      const localDemoUsers = [DEV_USERS.tenant, DEV_USERS.owner];
      for (const localDemoUser of localDemoUsers) {
        const existingUser = await ctx.db
          .query("users")
          .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", localDemoUser.workos_user_id))
          .first();

        if (!existingUser) {
          await ctx.db.insert("users", {
            workos_user_id: localDemoUser.workos_user_id,
            user_type: localDemoUser.user_type,
            user_types: [localDemoUser.user_type],
            active_persona: localDemoUser.user_type,
            name: localDemoUser.name,
            email: localDemoUser.email,
            phone: localDemoUser.phone,
            status: "ACTIVE",
            must_change_password: false,
          });
        }
      }

      const ownerUser = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q) =>
          q.eq("workos_user_id", DEV_USERS.owner.workos_user_id),
        )
        .unique();
      const existingOwner = await ctx.db
        .query("owners")
        .withIndex("by_phone", (q) => q.eq("phone", DEV_USERS.owner.phone!))
        .first();

      if (ownerUser && !existingOwner) {
        const now = Date.now();
        await ctx.db.insert("owners", {
          phone: DEV_USERS.owner.phone!,
          name: DEV_USERS.owner.name,
          email: DEV_USERS.owner.email,
          user_id: ownerUser._id,
          source: "OWNER_SERVICE_REQUEST",
          active_properties_count: 0,
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
      }
    }

    // ── System config (idempotent) ───────────────────────────────────
    const defaultConfigEntries = Object.entries(SYSTEM_CONFIG_DEFAULTS) as Array<
      [keyof typeof SYSTEM_CONFIG_DEFAULTS, string]
    >;

    for (const [key, value] of defaultConfigEntries) {
      const typedKey = key as Doc<"system_config">["key"];

      const existingConfig = await ctx.db
        .query("system_config")
        .filter((q) => q.eq(q.field("key"), typedKey))
        .first();

      if (!existingConfig && founder_oneUser) {
        await ctx.db.insert("system_config", {
          key: typedKey,
          value,
          updated_by_admin_id: founder_oneUser._id,
        });
      }
    }

    const seedConfigIfMissing = async (
      key:
        | (typeof SYSTEM_CONFIG_KEYS)[keyof typeof SYSTEM_CONFIG_KEYS]
        | (typeof P44_CONFIG_KEYS)[keyof typeof P44_CONFIG_KEYS]
        | (typeof P45_CONFIG_KEYS)[keyof typeof P45_CONFIG_KEYS],
      value: string,
      warningLabel: string,
    ) => {
      const typedKey = key as Doc<"system_config">["key"];

      const existingConfig = await ctx.db
        .query("system_config")
        .filter((q) => q.eq(q.field("key"), typedKey))
        .first();

      if (existingConfig || !founder_oneUser) {
        return;
      }

      try {
        await ctx.db.insert("system_config", {
          key: typedKey,
          value,
          updated_by_admin_id: founder_oneUser._id,
        });
      } catch (error) {
        console.warn(`Skipping ${warningLabel} seed backfill:`, error);
      }
    };

    const tenantBountyExpiryKey = SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_EXPIRY_DAYS;
    await seedConfigIfMissing(tenantBountyExpiryKey, "3", "tenant_bounty_expiry_days");
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.NEGOTIATION_STALE_DAYS,
      "7",
      "negotiation_stale_days",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.NEGOTIATION_MAX_ROUNDS,
      "5",
      "negotiation_max_rounds",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.NEGOTIATION_TOKEN_AGREEMENT_DAYS,
      "3",
      "negotiation_token_agreement_days",
    );
    await seedConfigIfMissing(
      P44_CONFIG_KEYS.OPS_FIELD_WORKER_ENABLED,
      JSON.stringify(false),
      "ops_field_worker_enabled",
    );
    await seedConfigIfMissing(
      P44_CONFIG_KEYS.OPS_FIELD_WORKER_CANARY_USER_IDS,
      JSON.stringify([]),
      "ops_field_worker_canary_user_ids",
    );
    const defaultUnassignedSocietyId = testSociety?._id ?? "";

    if (!defaultUnassignedSocietyId) {
      console.warn(
        `No default society available for ${P44_CONFIG_KEYS.DEFAULT_UNASSIGNED_SOCIETY_ID}; seeding empty fallback`,
      );
    }

    await seedConfigIfMissing(
      P44_CONFIG_KEYS.DEFAULT_UNASSIGNED_SOCIETY_ID,
      defaultUnassignedSocietyId,
      "default_unassigned_society_id",
    );
    await seedConfigIfMissing(
      P45_CONFIG_KEYS.MULTI_PERSONA_ENABLED,
      JSON.stringify(false),
      "multi_persona_enabled",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.WARNING_QUALITY_THRESHOLD,
      "40",
      "warning_quality_threshold",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.WARNING_TARGET_MISS_STREAK,
      "3",
      "warning_target_miss_streak",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.WARNING_SLA_BREACH_COUNT_30D,
      "5",
      "warning_sla_breach_count_30d",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.WARNING_INACTIVITY_DAYS,
      "7",
      "warning_inactivity_days",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.WARNING_LEVEL1_EXPIRY_DAYS,
      "30",
      "warning_level1_expiry_days",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.WARNING_LEVEL2_EXPIRY_DAYS,
      "60",
      "warning_level2_expiry_days",
    );
    await seedConfigIfMissing(
      SYSTEM_CONFIG_KEYS.WARNING_ESCALATION_AUTO,
      "true",
      "warning_escalation_auto",
    );
    await seedConfigIfMissing(SYSTEM_CONFIG_KEYS.CHECKIN_OVERDUE_DAYS, "7", "checkin_overdue_days");
    await seedConfigIfMissing(SYSTEM_CONFIG_KEYS.CASELOAD_THRESHOLD, "15", "caseload_threshold");

    if (founder_oneUser && defaultUnassignedSocietyId) {
      const defaultUnassignedConfig = await ctx.db
        .query("system_config")
        .filter((q) => q.eq(q.field("key"), P44_CONFIG_KEYS.DEFAULT_UNASSIGNED_SOCIETY_ID))
        .first();

      if (defaultUnassignedConfig && !defaultUnassignedConfig.value.trim()) {
        await ctx.db.patch(defaultUnassignedConfig._id, {
          value: defaultUnassignedSocietyId,
          updated_by_admin_id: founder_oneUser._id,
        });
      }
    }

    const referralConfigs = [
      {
        referral_type: "GUARD" as const,
        sign_up_bonus: 0,
        finding_bonus_total: 50000,
        publish_split_pct: 0,
        closure_split_pct: 100,
      },
      {
        referral_type: "TENANT_FINDING" as const,
        sign_up_bonus: 20000,
        finding_bonus_total: 100000,
        publish_split_pct: 30,
        closure_split_pct: 70,
      },
      {
        referral_type: "OWNER_FINDING" as const,
        sign_up_bonus: 20000,
        finding_bonus_total: 200000,
        publish_split_pct: 30,
        closure_split_pct: 70,
      },
    ];

    for (const config of referralConfigs) {
      const existing = await ctx.db
        .query("referral_config")
        .withIndex("by_scope", (q) => q.eq("scope_type", "GLOBAL"))
        .filter((q) => q.eq(q.field("referral_type"), config.referral_type))
        .first();

      if (!existing && founder_oneUser) {
        await ctx.db.insert("referral_config", {
          referral_type: config.referral_type,
          scope_type: "GLOBAL",
          scope_id: undefined,
          sign_up_bonus: config.sign_up_bonus,
          finding_bonus_total: config.finding_bonus_total,
          publish_split_pct: config.publish_split_pct,
          closure_split_pct: config.closure_split_pct,
          is_active: true,
          updated_by_admin_id: founder_oneUser._id,
        });
      }
    }

    if (founder_oneUser) {
      const existingIncentiveV3Config = await ctx.db
        .query("incentive_config_versions")
        .withIndex("by_version", (q) => q.eq("version_code", "v3.0.0"))
        .first();

      if (!existingIncentiveV3Config) {
        await ctx.db.insert("incentive_config_versions", {
          version_code: "v3.0.0",
          status: "DRAFT",
          config_json: JSON.stringify(INITIAL_INCENTIVE_V3_CONFIG),
          optimizer_bounds_json: undefined,
          description: "Initial v3 config mirroring v2 behavior",
          created_by: founder_oneUser._id,
          activated_by: undefined,
          activated_at: undefined,
          archived_by: undefined,
          archived_at: undefined,
          created_at: Date.now(),
          updated_at: undefined,
        });
      }
    }

    for (const template of PROPERTY_INSPECTION_TEMPLATES) {
      await upsertChecklistTemplateByDepth(ctx, template);
    }

    console.log("Checklist templates seeded (3 templates)");

    await upsertChecklistTemplateByDepth(ctx, MOVE_IN_HANDOVER_TEMPLATE);
    console.log("Move-in handover template seeded");

    console.log("Seed complete (idempotent — filled any gaps)");
  },
});

export const syncWorkosIds = internalMutation({
  args: {
    users: v.array(
      v.object({
        identifier: v.string(),
        identifier_type: v.union(v.literal("email"), v.literal("phone")),
        user_type: v.string(),
        workos_user_id: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const entry of args.users) {
      const existing =
        entry.identifier_type === "email"
          ? await ctx.db
              .query("users")
              .filter((q) => q.eq(q.field("email"), entry.identifier))
              .first()
          : await ctx.db
              .query("users")
              .filter((q) =>
                q.and(
                  q.eq(q.field("phone"), entry.identifier),
                  q.eq(q.field("user_type"), entry.user_type),
                ),
              )
              .first();

      if (!existing) {
        console.warn(
          `syncWorkosIds: user not found for ${entry.identifier} (${entry.user_type}) — run seed:init first`,
        );
        continue;
      }

      if (existing.workos_user_id !== entry.workos_user_id) {
        await ctx.db.patch(existing._id, { workos_user_id: entry.workos_user_id });
        console.log(
          `Synced ${entry.identifier} WorkOS ID: ${existing.workos_user_id} → ${entry.workos_user_id}`,
        );
      }
    }
  },
});
