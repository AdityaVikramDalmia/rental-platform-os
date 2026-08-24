import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./auth.helpers";
import { query } from "./functions";
import { PERMISSIONS } from "../lib/constants";

// ─── T01: Paginated List Query ──────────────────────────────

export const list = query({
  args: {
    actor_user_id: v.optional(v.id("users")),
    actor_type: v.optional(v.string()),
    action: v.optional(v.string()),
    entity_type: v.optional(v.string()),
    entity_id: v.optional(v.string()),
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AUDIT_VIEW);

    // Index selection priority (ONE index per query)
    type IndexChoice = "by_entity" | "by_actor_user_id" | "by_action" | "by_entity_type" | "none";

    let indexUsed: IndexChoice;
    if (args.entity_type !== undefined && args.entity_id !== undefined) {
      indexUsed = "by_entity";
    } else if (args.actor_user_id !== undefined) {
      indexUsed = "by_actor_user_id";
    } else if (args.action !== undefined) {
      indexUsed = "by_action";
    } else if (args.entity_type !== undefined) {
      indexUsed = "by_entity_type";
    } else {
      indexUsed = "none";
    }

    const buildOrderedQuery = () => {
      switch (indexUsed) {
        case "by_entity":
          return ctx.db
            .query("audit_logs")
            .withIndex("by_entity", (q) =>
              q.eq("entity_type", args.entity_type!).eq("entity_id", args.entity_id!),
            )
            .order("desc");
        case "by_actor_user_id":
          return ctx.db
            .query("audit_logs")
            .withIndex("by_actor_user_id", (q) => q.eq("actor_user_id", args.actor_user_id!))
            .order("desc");
        case "by_action":
          return ctx.db
            .query("audit_logs")
            .withIndex("by_action", (q) =>
              q.eq("action", args.action as Doc<"audit_logs">["action"]),
            )
            .order("desc");
        case "by_entity_type":
          return ctx.db
            .query("audit_logs")
            .withIndex("by_entity_type", (q) => q.eq("entity_type", args.entity_type!))
            .order("desc");
        default:
          return ctx.db.query("audit_logs").order("desc");
      }
    };

    let filteredQuery = buildOrderedQuery();

    if (args.actor_type !== undefined) {
      const actorType = args.actor_type;
      if (actorType === "SYSTEM") {
        filteredQuery = filteredQuery.filter((q) => q.eq(q.field("actor_user_id"), undefined));
      } else {
        filteredQuery = filteredQuery.filter((q) =>
          q.eq(q.field("actor_type"), actorType as Doc<"audit_logs">["actor_type"]),
        );
      }
    }

    if (args.action !== undefined && indexUsed !== "by_action") {
      const action = args.action;
      filteredQuery = filteredQuery.filter((q) =>
        q.eq(q.field("action"), action as Doc<"audit_logs">["action"]),
      );
    }

    if (
      args.entity_type !== undefined &&
      indexUsed !== "by_entity" &&
      indexUsed !== "by_entity_type"
    ) {
      const entityType = args.entity_type;
      filteredQuery = filteredQuery.filter((q) => q.eq(q.field("entity_type"), entityType));
    }

    if (args.entity_id !== undefined && indexUsed !== "by_entity") {
      const entityId = args.entity_id;
      filteredQuery = filteredQuery.filter((q) => q.eq(q.field("entity_id"), entityId));
    }

    if (args.actor_user_id !== undefined && indexUsed !== "by_actor_user_id") {
      const actorUserId = args.actor_user_id;
      filteredQuery = filteredQuery.filter((q) => q.eq(q.field("actor_user_id"), actorUserId));
    }

    // Date range filters (ALWAYS via .filter() — no by_creation_time index exists)
    if (args.date_from !== undefined) {
      const dateFrom = args.date_from;
      filteredQuery = filteredQuery.filter((q) => q.gte(q.field("_creationTime"), dateFrom));
    }
    if (args.date_to !== undefined) {
      const dateTo = args.date_to;
      filteredQuery = filteredQuery.filter((q) => q.lte(q.field("_creationTime"), dateTo));
    }

    const paginatedResults = await filteredQuery.paginate(args.paginationOpts);

    const enrichedPage = await Promise.all(
      paginatedResults.page.map(async (entry) => {
        let actor_name: string;
        if (entry.actor_type === "SYSTEM" || !entry.actor_user_id) {
          actor_name = "System";
        } else {
          const user = await ctx.db.get(entry.actor_user_id);
          actor_name = user?.name ?? "Unknown";
        }
        return { ...entry, actor_name };
      }),
    );

    return {
      ...paginatedResults,
      page: enrichedPage,
    };
  },
});

// ─── T02: Single Entry Detail Query ─────────────────────────

export const getById = query({
  args: {
    id: v.id("audit_logs"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.AUDIT_VIEW);

    const entry = await ctx.db.get(args.id);
    if (!entry) {
      throw new Error("Audit log entry not found");
    }

    let actor_name: string;
    let actor_email: string | null;

    if (entry.actor_type === "SYSTEM" || !entry.actor_user_id) {
      actor_name = "System";
      actor_email = null;
    } else {
      const user = await ctx.db.get(entry.actor_user_id);
      actor_name = user?.name ?? "Unknown";
      actor_email = user?.email ?? null;
    }

    // Resolve entity label (best-effort, NEVER throw)
    let entity_label: string | null = null;
    try {
      switch (entry.entity_type) {
        case "leads":
          entity_label = "Lead #" + entry.entity_id.slice(-6);
          break;
        case "users": {
          const entityUser = await ctx.db.get(entry.entity_id as Id<"users">);
          entity_label = entityUser?.name ?? null;
          break;
        }
        case "societies": {
          const society = await ctx.db.get(entry.entity_id as Id<"societies">);
          entity_label = society?.name ?? null;
          break;
        }
        case "buildings": {
          const building = await ctx.db.get(entry.entity_id as Id<"buildings">);
          entity_label = building?.name ?? null;
          break;
        }
        case "visits":
          entity_label = "Visit #" + entry.entity_id.slice(-6);
          break;
        case "payouts":
          entity_label = "Payout #" + entry.entity_id.slice(-6);
          break;
        default:
          entity_label = null;
      }
    } catch {
      entity_label = null;
    }

    return {
      ...entry,
      actor_name,
      actor_email,
      entity_label,
    };
  },
});

// ─── T03: Filter Dropdown Data ──────────────────────────────

export const getFilterOptions = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.AUDIT_VIEW);

    // Hardcoded action groups (matching ACTUAL schema auditActionValidator — 30 literals)
    const actions = [
      {
        group: "Society & Building",
        items: ["SOCIETIES_INSERT", "SOCIETIES_UPDATE", "BUILDINGS_INSERT", "BUILDINGS_UPDATE"],
      },
      {
        group: "Users & Guards",
        items: [
          "USERS_INSERT",
          "USERS_UPDATE",
          "GUARD_PROFILES_INSERT",
          "GUARD_PROFILES_UPDATE",
          "GUARD_SHIFTS_INSERT",
          "GUARD_SHIFTS_UPDATE",
          "GUARD_SHIFTS_DELETE",
        ],
      },
      { group: "Leads", items: ["LEADS_INSERT", "LEADS_UPDATE"] },
      { group: "Owner Verification", items: ["OWNER_VERIFICATIONS_INSERT"] },
      { group: "Listings", items: ["LISTINGS_INSERT", "LISTINGS_UPDATE"] },
      { group: "Visits", items: ["VISITS_INSERT", "VISITS_UPDATE"] },
      {
        group: "Closures & Payouts",
        items: ["CLOSURES_INSERT", "CLOSURES_UPDATE", "PAYOUTS_INSERT", "PAYOUTS_UPDATE"],
      },
      {
        group: "Incentives",
        items: ["INCENTIVE_CARDS_INSERT", "INCENTIVE_CARDS_UPDATE"],
      },
      {
        group: "RBAC & Config",
        items: [
          "ROLES_INSERT",
          "ROLES_UPDATE",
          "USER_ROLE_ASSIGNMENTS_INSERT",
          "USER_ROLE_ASSIGNMENTS_UPDATE",
          "SYSTEM_CONFIG_INSERT",
          "SYSTEM_CONFIG_UPDATE",
        ],
      },
    ];

    const entity_types = [
      "societies",
      "buildings",
      "users",
      "guard_profiles",
      "guard_shifts",
      "leads",
      "owner_verifications",
      "listings",
      "listing_trust_badges",
      "visits",
      "closures",
      "payouts",
      "incentive_cards",
      "roles",
      "user_role_assignments",
      "system_config",
      "rental_transactions",
      "kyc_packets",
      "rental_agreements",
      "token_bookings",
      "deposit_records",
      "notification_preferences",
      "notification_events",
      "notification_templates",
      "notifications",
      "push_subscriptions",
    ];

    // Recent actors from last 100 entries
    const recentEntries = await ctx.db.query("audit_logs").order("desc").take(100);

    const seenActors = new Map<string, { user_id: Id<"users">; actor_type: string }>();
    let hasSystemActor = false;

    for (const entry of recentEntries) {
      if (!entry.actor_user_id) {
        hasSystemActor = true;
        continue;
      }

      const key = entry.actor_user_id as string;
      if (!seenActors.has(key)) {
        seenActors.set(key, {
          user_id: entry.actor_user_id,
          actor_type: entry.actor_type,
        });
      }
    }

    const recent_actors: Array<{
      user_id: string | null;
      name: string;
      actor_type: string;
    }> = await Promise.all(
      Array.from(seenActors.values()).map(async ({ user_id, actor_type }) => {
        const user = await ctx.db.get(user_id);
        return {
          user_id: user_id as string,
          name: user?.name ?? "Unknown",
          actor_type,
        };
      }),
    );

    if (hasSystemActor) {
      recent_actors.unshift({
        user_id: null,
        name: "System",
        actor_type: "SYSTEM",
      });
    }

    return {
      actions,
      entity_types,
      recent_actors,
    };
  },
});
