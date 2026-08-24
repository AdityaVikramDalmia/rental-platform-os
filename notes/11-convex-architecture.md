# Convex Architecture & Patterns

> How we structure Convex functions, handle auth, manage real-time data, and build the data access layer.

---

## Function Layer Architecture

### Wrapped Mutations (Audit + Auth)

All mutations go through custom wrappers that provide automatic audit logging and auth context.

```typescript
// convex/functions.ts — THE CENTRAL IMPORT POINT
import {
  query as rawQuery,
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
  internalQuery as rawInternalQuery,
} from "./_generated/server";
import { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";

// Set up triggers for audit logging
const triggers = new Triggers<DataModel>();

// Register audit triggers for all business tables
const AUDITED_TABLES = [
  "societies",
  "buildings",
  "users",
  "guard_profiles",
  "guard_shifts",
  "leads",
  "owner_verifications",
  "listings",
  "visits",
  "closures",
  "payouts",
  "incentive_cards",
  "referral_codes",
  "referrals",
  "referral_milestones",
  "referral_config",
  "roles",
  "user_role_assignments",
  "system_config",
] as const;

for (const table of AUDITED_TABLES) {
  triggers.register(table, async (ctx, change) => {
    const identity = await ctx.auth.getUserIdentity();
    await ctx.db.insert("audit_logs", {
      actor_user_id: identity ? /* resolve user id */ undefined : undefined,
      actor_type: identity ? "ADMIN" : "SYSTEM", // determined by context
      action: `${table.toUpperCase()}_${change.operation.toUpperCase()}`,
      entity_type: table,
      entity_id: change.id as string,
      changes: computeChanges(change.oldDoc, change.newDoc),
      metadata: {},
    });
  });
}

// Export wrapped functions — ALWAYS import from here, never from _generated
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
export const query = rawQuery; // Queries don't need triggers
export const internalQuery = rawInternalQuery;

function computeChanges(oldDoc: any, newDoc: any) {
  if (!oldDoc) return undefined; // INSERT — no diff
  if (!newDoc) return undefined; // DELETE — no diff
  const changes: { field: string; old_value: any; new_value: any }[] = [];
  for (const key of Object.keys({ ...oldDoc, ...newDoc })) {
    if (key.startsWith("_")) continue; // skip _id, _creationTime
    if (JSON.stringify(oldDoc[key]) !== JSON.stringify(newDoc[key])) {
      changes.push({ field: key, old_value: oldDoc[key], new_value: newDoc[key] });
    }
  }
  return changes.length > 0 ? changes : undefined;
}
```

**ESLint rule to enforce this**:

```json
{
  "no-restricted-imports": [
    "error",
    {
      "patterns": [
        {
          "group": ["*/_generated/server"],
          "importNames": ["mutation", "internalMutation"],
          "message": "Import mutation from './functions' to enable audit triggers"
        }
      ]
    }
  ]
}
```

---

## Shared Utility Layer

Utilities in `lib/` are imported by both Convex functions and frontend components.

### Phone Normalization

```typescript
// lib/validators.ts
export function normalizePhone(raw: string): string {
  // Strip everything except digits
  const digits = raw.replace(/\D/g, "");
  // If starts with 91 and is 12 digits, strip country code
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  // If 10 digits, return as-is
  if (digits.length === 10) return digits;
  throw new Error("Invalid phone number. Must be 10 digits.");
}

export function formatPhoneDisplay(phone: string): string {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

export function toSyntheticEmail(phone: string): string {
  return `${phone}@guards.local`;
}
```

### Money (Paise) Utilities

```typescript
// lib/money.ts
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatINR(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}
```

### Soft Delete Pattern

All deletable entities use `is_deleted: boolean`. Every query MUST filter:

```typescript
// In queries — always filter soft-deleted records
const buildings = await ctx.db
  .query("buildings")
  .withIndex("by_society_id", (q) => q.eq("society_id", societyId))
  .filter((q) => q.neq(q.field("is_deleted"), true))
  .collect();

// In mutations — "delete" by setting flag
export const deleteBuilding = mutation({
  args: { id: v.id("buildings") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "buildings.delete");
    await ctx.db.patch(args.id, { is_deleted: true });
    // Audit is automatic via trigger
  },
});
```

**Entities with `is_deleted`**: `buildings`, `guard_shifts`, `roles`, `user_role_assignments`, `listing_photos`.

---

## AuthKit Component (`convex/auth.ts`)

The `@convex-dev/workos-authkit` component auto-syncs WorkOS users to Convex via webhooks and provides `authKit.getAuthUser(ctx)` for server-side auth.

```typescript
// convex/auth.ts
import { AuthKit, type AuthFunctions } from "@convex-dev/workos-authkit";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
});

// Event handlers for WorkOS user lifecycle
export const { authKitEvent } = authKit.events({
  "user.created": async (ctx, event) => {
    const isGuard = event.data.email.endsWith("@guards.local");
    const isOps = event.data.email.endsWith("@ops.local");
    await ctx.db.insert("users", {
      workos_user_id: event.data.id,
      email: event.data.email,
      name: `${event.data.firstName ?? ""} ${event.data.lastName ?? ""}`.trim(),
      user_type: isGuard ? "GUARD" : isOps ? "OPS" : "ADMIN",
      status: "ACTIVE",
      must_change_password: isGuard || isOps, // Guards and OPS agents must change temp password
    });
    // If guard, also create guard_profiles record (done by calling internal mutation)
  },
  "user.updated": async (ctx, event) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", event.data.id))
      .unique();
    if (user) {
      await ctx.db.patch(user._id, {
        email: event.data.email,
        name: `${event.data.firstName ?? ""} ${event.data.lastName ?? ""}`.trim(),
      });
    }
  },
});
```

**Key points:**

- `authKit` is exported and imported by `auth.config.ts`, `auth.helpers.ts`, and `http.ts`
- `user.created` detects user type by email domain: `@guards.local` → GUARD, `@ops.local` → OPS, anything else → ADMIN
- Guard and OPS account creation happens via Convex Action → WorkOS API → webhook → this event handler
- Both guards and OPS agents have `must_change_password: true` on creation

---

## Auth Helper Layer

```typescript
// convex/auth.helpers.ts
import { QueryCtx, MutationCtx } from "./_generated/server";
import { authKit } from "./auth";

export async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const workosUser = await authKit.getAuthUser(ctx);
  if (!workosUser) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", workosUser.id))
    .unique();

  return user;
}

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthenticatedUser(ctx);
  if (!user) throw new Error("Not authenticated");
  if (user.status === "BANNED") throw new Error("Account banned");
  return user;
}

export async function requireGuard(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.user_type !== "GUARD") throw new Error("Guard access required");
  if (user.status !== "ACTIVE") throw new Error("Guard account not active");
  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.user_type !== "ADMIN") throw new Error("Admin access required");
  return user;
}

export async function requireOps(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.user_type !== "OPS") throw new Error("OPS access required");
  if (user.status !== "ACTIVE") throw new Error("OPS account not active");
  return user;
}

export async function requireBackoffice(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.user_type !== "ADMIN" && user.user_type !== "OPS") {
    throw new Error("Backoffice access required");
  }
  if (user.status !== "ACTIVE") {
    throw new Error("Account is not active");
  }
  return user;
}

export async function requirePermission(ctx: QueryCtx | MutationCtx, permission: string) {
  const user = await requireAuth(ctx);

  // Both ADMIN and OPS users share the same RBAC system — zero mutation duplication
  if (user.user_type !== "ADMIN" && user.user_type !== "OPS") {
    throw new Error("Admin or OPS access required");
  }

  const assignments = await ctx.db
    .query("user_role_assignments")
    .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  const roles = await Promise.all(assignments.map((a) => ctx.db.get(a.role_id)));
  const allPermissions = new Set(roles.flatMap((r) => r?.permissions ?? []));

  if (!allPermissions.has(permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }

  return user;
}
```

`requireBackoffice()` accepts both `ADMIN` and `OPS` users with `ACTIVE` status. Use it for shared read-only paths that both personas need (for example, system config reads, user lookups, and role assignment queries used by sidebar rendering). For admin-only management surfaces (roles administration, admin account CRUD), continue using `requireAdmin()`. For permission-gated mutations, use `requirePermission()`.

---

## Convex Actions Layer (External API Calls)

Convex mutations cannot call external APIs. All WorkOS interactions go through Convex Actions.

### Action File Structure

```typescript
// convex/actions/workos.ts
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { WorkOS } from "@workos-inc/node";

const workos = new WorkOS(process.env.WORKOS_API_KEY!);

// ============ GUARD ACCOUNT CREATION ============

export const createGuardAccount = action({
  args: {
    name: v.string(),
    phone: v.string(),
    society_id: v.id("societies"),
    guard_type: v.string(),
    temp_password: v.string(),
  },
  handler: async (ctx, args) => {
    const syntheticEmail = `${args.phone}@guards.local`;

    // 1. Create WorkOS user
    const workosUser = await workos.userManagement.createUser({
      email: syntheticEmail,
      password: args.temp_password,
      firstName: args.name,
    });

    // 2. Create Convex user + guard_profile via internal mutation
    const userId = await ctx.runMutation(internal.guards.createInternal, {
      workos_user_id: workosUser.id,
      name: args.name,
      phone: args.phone,
      society_id: args.society_id,
      guard_type: args.guard_type,
    });

    return { userId, workosUserId: workosUser.id };
  },
});

// ============ PASSWORD MANAGEMENT ============

export const changePassword = action({
  args: {
    workos_user_id: v.string(),
    new_password: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Update password in WorkOS
    await workos.userManagement.updateUser(args.workos_user_id, {
      password: args.new_password,
    });

    // 2. Flip must_change_password flag in Convex
    await ctx.runMutation(internal.guards.clearMustChangePassword, {
      workos_user_id: args.workos_user_id,
    });
  },
});

export const resetGuardPassword = action({
  args: {
    workos_user_id: v.string(),
    new_temp_password: v.string(),
  },
  handler: async (ctx, args) => {
    await workos.userManagement.updateUser(args.workos_user_id, {
      password: args.new_temp_password,
    });

    await ctx.runMutation(internal.guards.setMustChangePassword, {
      workos_user_id: args.workos_user_id,
    });

    return { success: true };
  },
});

// ============ GUARD STATUS (BAN/UNBAN) ============

export const suspendGuard = action({
  args: {
    workos_user_id: v.string(),
    user_id: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Suspend in WorkOS (prevents login)
    await workos.userManagement.updateUser(args.workos_user_id, {
      // WorkOS suspension mechanism
    });

    // 2. Update status in Convex + flag visits for reassignment
    await ctx.runMutation(internal.guards.banGuardInternal, {
      user_id: args.user_id,
      reason: args.reason,
    });
  },
});

export const unsuspendGuard = action({
  args: {
    workos_user_id: v.string(),
    user_id: v.id("users"),
    new_status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
  },
  handler: async (ctx, args) => {
    await workos.userManagement.updateUser(args.workos_user_id, {
      // WorkOS unsuspend
    });

    await ctx.runMutation(internal.guards.updateStatusInternal, {
      user_id: args.user_id,
      status: args.new_status,
    });
  },
});
```

**Error handling**: If the WorkOS API call succeeds but the Convex mutation fails, the action should retry the mutation. If WorkOS fails, throw immediately — the UI shows the error. No silent partial state.

**Important**: The admin creation flow does NOT use an Action. Admins are auto-created on first Google SSO login — the callback checks if a Convex user exists for the `workos_user_id`, and creates one if not (via a standard mutation since no external API call is needed at that point; WorkOS already created the user during SSO).

---

## HTTP Router (Public Endpoints)

Public listing pages are server-rendered for SEO. Convex HTTP Router provides the data endpoint.

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { authKit } from "./auth";

const http = httpRouter();

authKit.registerRoutes(http); // POST /workos/webhook + POST /workos/action

// Public listing data — called by Next.js Server Components for SSR
http.route({
  path: "/api/listing/:slug",
  method: "GET",
  handler: async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.split("/").pop()!;

    const listing = await ctx.runQuery(internal.listings.getBySlugInternal, { slug });
    if (!listing) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    // Return listing data WITHOUT owner info (enforced at query level)
    return new Response(JSON.stringify(listing), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  },
});

export default http;
```

**Photo URLs**: The HTTP endpoint returns `listing_photos` with `storage_id` values. The Next.js Server Component resolves `storage_id` → URL separately via a Server Action that calls `ctx.storage.getUrl()`. This keeps the HTTP endpoint simple and cacheable.

**Listing inquiry form**: Submitted via Next.js Server Action (not the HTTP router). The Server Action captures the client IP from request headers for rate limiting, then calls the Convex mutation with the IP as the rate-limit key.

**Enum validation in HTTP handlers**: When HTTP routes accept enum parameters (e.g., `persona_type`, `preferred_contact_method`), the handler MUST validate against the allowed set and return `400 Bad Request` with a descriptive error message if the value is invalid. This prevents invalid data from reaching Convex mutations. Example:

```typescript
const VALID_PERSONA_TYPES = ["GUARD", "TENANT", "OWNER", "OTHER"];
const VALID_CONTACT_METHODS = ["WHATSAPP", "PHONE", "EMAIL", "IN_APP"];

http.route({
  path: "/api/support-inquiry",
  method: "POST",
  handler: async (ctx, request) => {
    const body = await request.json();

    if (!VALID_PERSONA_TYPES.includes(body.persona_type)) {
      return new Response(JSON.stringify({ error: `Invalid persona_type: ${body.persona_type}` }), {
        status: 400,
      });
    }

    if (!VALID_CONTACT_METHODS.includes(body.preferred_contact_method)) {
      return new Response(
        JSON.stringify({
          error: `Invalid preferred_contact_method: ${body.preferred_contact_method}`,
        }),
        { status: 400 },
      );
    }

    // Proceed with mutation
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  },
});
```

---

## Function Organization

Each domain has its own file. Functions follow a consistent pattern.

```typescript
// convex/leads.ts — Example domain file
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./functions"; // ALWAYS from functions.ts
import { requireGuard, requirePermission } from "./auth.helpers";

// ============ QUERIES ============

export const list = query({
  args: {
    society_id: v.optional(v.id("societies")),
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "leads.view");

    if (args.search) {
      // Full-text search path
      return await ctx.db
        .query("leads")
        .withSearchIndex("search_leads", (q) => {
          let search = q.search("searchable_text", args.search!);
          if (args.status) search = search.eq("status", args.status as any);
          if (args.society_id) search = search.eq("society_id", args.society_id);
          return search;
        })
        .paginate(args.paginationOpts);
    }

    // Index-based query path
    let dbQuery = ctx.db.query("leads");

    if (args.society_id && args.status) {
      dbQuery = dbQuery.withIndex("by_society_and_status", (q) =>
        q.eq("society_id", args.society_id!).eq("status", args.status as any),
      );
    } else if (args.society_id) {
      dbQuery = dbQuery.withIndex("by_society_id", (q) => q.eq("society_id", args.society_id!));
    } else if (args.status) {
      dbQuery = dbQuery.withIndex("by_status", (q) => q.eq("status", args.status as any));
    }

    return await dbQuery.order("desc").paginate(args.paginationOpts);
  },
});

export const getMyLeads = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const guard = await requireGuard(ctx);
    return await ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guard._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// ============ MUTATIONS ============

export const create = mutation({
  args: {
    building_id: v.id("buildings"),
    floor_number: v.string(),
    flat_number: v.string(),
    owner_phone: v.string(),
    availability_type: v.union(v.literal("VACANT_NOW"), v.literal("VACANT_FROM")),
    availability_date: v.optional(v.number()), // Unix ms
    owner_name: v.optional(v.string()),
    rent_expected: v.optional(v.number()),
    furnishing: v.optional(
      v.union(v.literal("UNFURNISHED"), v.literal("SEMI_FURNISHED"), v.literal("FULLY_FURNISHED")),
    ),
    notes: v.optional(v.string()),
    owner_consent_to_call: v.boolean(),
  },
  handler: async (ctx, args) => {
    const guard = await requireGuard(ctx);

    // 1. Validate consent
    if (!args.owner_consent_to_call) {
      throw new Error("Owner consent to call is required");
    }

    // 2. Get guard's society
    const profile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", guard._id))
      .unique();
    if (!profile) throw new Error("Guard profile not found");

    // 3. Validate society is ACTIVE
    const society = await ctx.db.get(profile.society_id);
    if (!society || society.status !== "ACTIVE") {
      throw new Error("Society is not active");
    }

    // 4. Validate building belongs to society
    const building = await ctx.db.get(args.building_id);
    if (!building || building.society_id !== profile.society_id) {
      throw new Error("Building not found in your society");
    }

    // 5. Rate limit check
    // (using @convex-dev/rate-limiter)
    await checkRateLimit(ctx, guard._id);

    // 6. De-dup check
    const { isDuplicate, duplicateFlags, duplicateOfId } = await checkDuplicates(
      ctx,
      profile.society_id,
      args.building_id,
      args.flat_number,
      args.owner_phone,
    );

    // 7. Build searchable text (computed inline — NOT via trigger)
    const searchable_text = [
      args.flat_number,
      args.owner_phone,
      args.owner_name,
      building.name,
      society.name,
    ]
      .filter(Boolean)
      .join(" ");

    // 8. Create lead
    const leadId = await ctx.db.insert("leads", {
      society_id: profile.society_id,
      building_id: args.building_id,
      floor_number: args.floor_number,
      flat_number: args.flat_number.toUpperCase(),
      owner_phone: args.owner_phone,
      owner_name: args.owner_name,
      availability_type: args.availability_type,
      availability_date: args.availability_date,
      rent_expected: args.rent_expected,
      furnishing: args.furnishing,
      notes: args.notes,
      owner_consent_to_call: true,
      submitted_by_guard_id: guard._id,
      status: isDuplicate ? "POTENTIAL_DUPLICATE" : "SUBMITTED",
      quality_flags: duplicateFlags.length > 0 ? duplicateFlags : undefined,
      duplicate_of_lead_id: duplicateOfId,
      searchable_text,
    });

    // Audit is AUTOMATIC via trigger — no manual log needed

    return leadId;
  },
});

// ============ DE-DUPLICATION ============

async function checkDuplicates(
  ctx: MutationCtx,
  societyId: Id<"societies">,
  buildingId: Id<"buildings">,
  flatNumber: string,
  ownerPhone: string,
): Promise<{
  isDuplicate: boolean;
  duplicateFlags: string[];
  duplicateOfId: Id<"leads"> | undefined;
}> {
  const flags: string[] = [];
  let duplicateOfId: Id<"leads"> | undefined;
  const now = Date.now();

  // Rule 1: Same flat in same building within 90 days
  const flatWindowMs = 90 * 24 * 60 * 60 * 1000; // TODO: read from system_config
  const flatMatches = await ctx.db
    .query("leads")
    .withIndex("by_society_building_flat", (q) =>
      q
        .eq("society_id", societyId)
        .eq("building_id", buildingId)
        .eq("flat_number", flatNumber.toUpperCase()),
    )
    .filter((q) =>
      q.and(
        q.neq(q.field("status"), "REJECTED"),
        q.neq(q.field("status"), "DUPLICATE"),
        q.gte(q.field("_creationTime"), now - flatWindowMs),
      ),
    )
    .collect();

  if (flatMatches.length > 0) {
    flags.push("DUPLICATE_FLAT_MATCH");
    duplicateOfId = flatMatches[0]._id;
  }

  // Rule 2: Same owner phone in same society within 30 days
  const phoneWindowMs = 30 * 24 * 60 * 60 * 1000; // TODO: read from system_config
  const phoneMatches = await ctx.db
    .query("leads")
    .withIndex("by_owner_phone", (q) => q.eq("owner_phone", ownerPhone))
    .filter((q) =>
      q.and(
        q.eq(q.field("society_id"), societyId),
        q.neq(q.field("status"), "REJECTED"),
        q.neq(q.field("status"), "DUPLICATE"),
        q.gte(q.field("_creationTime"), now - phoneWindowMs),
      ),
    )
    .collect();

  if (phoneMatches.length > 0) {
    flags.push("DUPLICATE_PHONE_MATCH");
    if (!duplicateOfId) duplicateOfId = phoneMatches[0]._id;
  }

  return {
    isDuplicate: flags.length > 0,
    duplicateFlags: flags,
    duplicateOfId,
  };
}
```

---

## Referral Trigger Orchestration (P22)

Referral milestones are triggered across multiple domain files (`referrals.ts`, `listings.ts`, `tenantInquiries.ts`, `closures.ts`) and converge in `referralMilestones.ts`.

### Pattern 1: Scoped Config Resolution (Building > Society > Global)

Use referral config precedence to compute payout amounts with deal context:

```typescript
// convex/referrals.ts
async function getResolvedConfig(ctx, referralType, buildingId, societyId) {
  if (buildingId) {
    const building = await getConfigByScope(ctx, referralType, "BUILDING", buildingId);
    if (building) return building;
  }

  if (societyId) {
    const society = await getConfigByScope(ctx, referralType, "SOCIETY", societyId);
    if (society) return society;
  }

  return await getConfigByScope(ctx, referralType, "GLOBAL", undefined);
}
```

This resolution is used both at referral creation time (initial milestone amounts) and later when deal linkage becomes available.

### Pattern 2: Cross-Module Milestone Triggers

- `listings.publish` triggers owner `LISTING_PUBLISHED` milestones.
- `tenantInquiries.submit` backfills tenant `LISTING_PUBLISHED` when referral existed before inquiry submission.
- `closures.confirm` triggers `DEAL_CLOSED` for owner + tenant referrals and resolves tenant attribution via `closure.visit_id` → `visits.tenant_inquiry_id` → `tenant_inquiries.tenant_id`.

```typescript
// common trigger call shape
await ctx.runMutation(internal.referralMilestones.trigger, {
  referral_id,
  milestone_type: "LISTING_PUBLISHED" | "DEAL_CLOSED",
  source_event: `listing_published:${listingId}`,
});
```

### Pattern 3: Idempotent Triggering via `source_event`

`internal.referralMilestones.trigger` checks the composite index `by_referral_and_source_event` before transitioning milestone status. Replayed events become no-ops.

### Pattern 4: Pending-Only Linkage + Amount Refresh

- Referral `listing_id` / `closure_id` are auto-patched only while matching milestones are `PENDING`.
- Pending milestones can be repriced with scoped config when linkage context appears later.
- Triggered/approved/paid milestones keep stored amounts (no retroactive repricing).

### Pattern 5: Capture Gating + Retry Safety

- DemoRentals capture path enforces a 48-hour account-age window in both `recordDemoRentalsReferral` and `captureReferralFromCode`.
- Frontend capture (`ReferralAttributionCapture`) persists dedup state only on success/permanent failures; transient failures preserve stored referral code for retries.

---

## Real-Time Patterns

### Admin Panel: Auto-Updating Lead Queue

```typescript
// components/admin/LeadQueue.tsx
"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function LeadQueue({ societyId }: { societyId?: string }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.leads.list,
    { society_id: societyId, status: "SUBMITTED" },
    { initialNumItems: 20 }
  );

  // `results` automatically updates when a new lead is submitted!
  // No polling, no manual refresh.

  return (
    <div>
      {results.map((lead) => (
        <LeadRow key={lead._id} lead={lead} />
      ))}
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(20)}>Load More</button>
      )}
    </div>
  );
}
```

### Guard Portal: Live Status Updates

```typescript
// components/guard/MyLeads.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function MyLeads() {
  // Auto-updates when admin changes lead status
  const leads = useQuery(api.leads.getMyLeads, { paginationOpts: { numItems: 50 } });

  // Guard sees status change in real-time (e.g., SUBMITTED → VERIFIED)
  // without refreshing the page
}
```

---

## File Upload Pattern

### Listing Photo Upload

```typescript
// convex/listings.ts
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "listings.create");
    return await ctx.storage.generateUploadUrl();
  },
});

// Client-side:
// 1. Call generateUploadUrl() to get a signed URL
// 2. POST file to that URL → get storageId
// 3. Pass storageId to the listing create/update mutation
```

```typescript
// components/admin/PhotoUploader.tsx
"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function PhotoUploader({ onUpload }: { onUpload: (id: string) => void }) {
  const generateUploadUrl = useMutation(api.listings.generateUploadUrl);

  const handleUpload = async (file: File) => {
    // 1. Get upload URL from Convex
    const url = await generateUploadUrl();

    // 2. Upload file directly to Convex storage
    const result = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = await result.json();

    // 3. Return storage ID to parent component
    onUpload(storageId);
  };

  return <input type="file" accept="image/*" onChange={(e) => {
    if (e.target.files?.[0]) handleUpload(e.target.files[0]);
  }} />;
}
```

---

## Error Handling Pattern

```typescript
// Convex functions throw errors that are caught by the client
// Use descriptive error messages — they're shown to the user

// In mutations:
throw new Error("Daily lead limit reached. Come back tomorrow!");
throw new Error("Owner consent is required to submit this lead.");
throw new Error("Missing permission: leads.verify");

// Client-side:
import { useMutation } from "convex/react";

function SubmitLeadForm() {
  const createLead = useMutation(api.leads.create);

  const handleSubmit = async (data: FormData) => {
    try {
      await createLead(data);
      toast.success("Lead submitted!");
    } catch (error) {
      // Error message from Convex mutation is in error.message
      toast.error(error.message);
    }
  };
}
```

---

## Testing Approach

Convex supports testing via `convex-test`:

```typescript
// convex/leads.test.ts
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

describe("leads", () => {
  test("guard can submit a lead", async () => {
    const t = convexTest(schema);
    // Set up test data...
    // Call mutation...
    // Assert result...
  });

  test("rate limit blocks 6th lead", async () => {
    // Submit 5 leads → success
    // Submit 6th → throws "Daily lead limit reached"
  });

  test("de-dup flags matching flat", async () => {
    // Submit lead for Tower A, Flat 1201
    // Submit another for same flat
    // Assert second has status POTENTIAL_DUPLICATE
  });
});
```

---

## Seed Process

On first deployment, the seed function bootstraps the system with default roles and the first super-admin.

**Location**: `convex/seed.ts`

**Invocation**: `npx convex run seed:init`

**Idempotent**: Checks if roles table is empty before running. Safe to run multiple times.

**Steps**:

1. **Check if already seeded**: Query roles table. If not empty, exit early.
2. **Create "Super Admin" role**: All permissions, `is_system_role: true`.
3. **Create "Ops Agent" role**: Operational permissions (leads, verification, listings, visits, closures, payouts), `is_system_role: true`.
4. **Read `SUPER_ADMIN_EMAIL` from environment variable**: The Google email of the first super admin.
5. **Call WorkOS `createUser()`**: Via Convex Action, create the WorkOS user with that email.
6. **Create Convex user record**: `user_type: ADMIN`, `status: ACTIVE`, `email` from environment variable.
7. **Assign Super Admin role**: Create `user_role_assignments` entry linking the user to the Super Admin role.
8. **Create default `system_config` entries**: Rate limits, incentive thresholds, contact info, etc.

**Reference**: See [Roles & Permissions](03-roles-and-permissions.md) for role definitions, [Constants Reference](13-constants-reference.md) for default config values.

---

## Cron Jobs

Defined in `convex/crons.ts`.

**Daily Analytics Snapshot**:

- **Schedule**: Daily at 19:00 UTC (12:30 AM IST next day)
- **Function**: `internal.analytics.computeDailySnapshot`
- **Purpose**: Pre-compute daily metrics and store in `analytics_snapshots` table for fast dashboard queries.

**Recover Stale Chat Batches**:

- **Schedule**: Every 5 minutes
- **Function**: `internal.chatBatching.recoverStaleBatches`
- **Purpose**: Detect and recover chat message batches stuck in `COLLECTING` or `PROCESSING` state (e.g., after a server restart or AI timeout). Marks them `FAILED` so the admin review queue can surface them.

**Rate Limit Counter Reset**:

- **Automatic**: Handled by `@convex-dev/rate-limiter` component. No manual cron needed.

**Reference**: See [Convex Schema](10-convex-schema.md) for cron configuration.

---

## Component Registration

Defined in `convex/convex.config.ts`.

Registers three third-party Convex components:

1. **`@convex-dev/workos-authkit`**: For WorkOS authentication integration — webhook handling, user sync, and `getAuthUser(ctx)`.
2. **`@convex-dev/rate-limiter`**: For guard lead submission and public inquiry rate limiting.
3. **`@convex-dev/aggregate`**: For real-time counters. Registered 3 times with different names:
   - `leadCounts`: Lead pipeline metrics
   - `visitCounts`: Visit metrics
   - `payoutTotals`: Payout totals by guard

**Configuration**:

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(workOSAuthKit);
app.use(rateLimiter);
app.use(aggregate, { name: "leadCounts" });
app.use(aggregate, { name: "visitCounts" });
app.use(aggregate, { name: "payoutTotals" });
export default app;
```

**Reference**: See [Analytics](features/10-analytics.md) for how aggregates are used.

---

## Phase 24: Chat Infrastructure Architecture

The Chat Infrastructure (Phase 24) introduces six new Convex backend files implementing AI-masked deal room messaging.

### New Domain Files

| File                         | Purpose                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `convex/chatChannels.ts`     | Channel creation, archival, and query functions. One channel per tenant inquiry.                                          |
| `convex/chatMessages.ts`     | Message send mutation (rate-limited), message list query, status update internals.                                        |
| `convex/chatBatching.ts`     | Batch window management — groups messages from the same sender within `chat_batch_window_ms`, triggers AI action.         |
| `convex/chatReadReceipts.ts` | Read receipt upsert and unread count queries per channel/user.                                                            |
| `convex/chatAIMonitor.ts`    | Admin monitor queries — flagged messages, admin review queue, batch failure list.                                         |
| `convex/actions/chatAI.ts`   | Convex Action (external API call) — calls OpenAI to rewrite batch content with PII masking, updates batch/message status. |

### Chat Message Flow

```
User sends message
  → chatMessages.send mutation (rate-limited: 20/min per user)
  → Message inserted with status SUBMITTED
  → chatBatching.assignToBatch internal mutation
      → If open COLLECTING batch exists for sender → append message
      → Else → create new batch, schedule batch close after chat_batch_window_ms
  → Message status → BATCHED
  → After window closes → batch status → PROCESSING
  → chatAI action called (OpenAI gpt-4o-mini)
      → PII detection + content rewriting
      → On success → batch + messages → DELIVERED
      → On PII detected post-check → chat_pii_fail_action ("admin_review") → admin_review_required flag set
      → On failure → batch + messages → FAILED
  → recover-stale-chat-batches cron (every 5 min) catches any stuck batches
```

### Audited Tables (P24 Additions)

The `AUDITED_TABLES` array in `convex/functions.ts` includes these Phase 24 tables:

```typescript
const AUDITED_TABLES = [
  // ... existing tables ...
  "chat_channels",
  "chat_messages",
  "chat_message_batches",
  "chat_read_receipts",
] as const;
```

---

## Phase 30: Checklist Engine Architecture

The Field Checklist Engine (Phase 30) introduces three new Convex domain files and a quality scoring pipeline.

### New Domain Files

| File                           | Purpose                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `convex/checklists.ts`         | Checklist template CRUD, instance assignment, guard response submission, admin review flow |
| `convex/checklistTemplates.ts` | Template management (create, edit, activate/deactivate, version management)                |
| `convex/documents.ts`          | Document requirement bundle creation, item status updates, file upload, verification       |

### Checklist Instance Lifecycle

```typescript
// convex/checklists.ts — Assign checklist to a visit
export const assignToVisit = mutation({
  args: {
    visit_id: v.id("visits"),
    template_id: v.id("checklist_templates"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "checklists.assign");

    // 1. Load template and snapshot items
    const template = await ctx.db.get(args.template_id);
    if (!template || !template.is_active) throw new Error("Template not active");

    // 2. Create instance with snapshotted items
    const instanceId = await ctx.db.insert("checklist_instances", {
      template_id: args.template_id,
      visit_id: args.visit_id,
      assigned_to: guardUserId,
      status: "ASSIGNED",
      items_snapshot: template.items, // snapshot at assignment time
      responses: [],
    });

    // 3. Link back to visit
    await ctx.db.patch(args.visit_id, { checklist_instance_id: instanceId });

    return instanceId;
  },
});

// Guard submits responses
export const submitResponses = mutation({
  args: {
    instance_id: v.id("checklist_instances"),
    responses: v.array(
      v.object({
        item_id: v.string(),
        condition_rating: v.optional(v.string()),
        checkbox_value: v.optional(v.boolean()),
        text_value: v.optional(v.string()),
        number_value: v.optional(v.number()),
        photo_storage_ids: v.optional(v.array(v.string())),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const guard = await requireGuard(ctx);
    const instance = await ctx.db.get(args.instance_id);
    if (!instance || instance.assigned_to !== guard._id) throw new Error("Not authorized");

    await ctx.db.patch(args.instance_id, {
      responses: args.responses,
      status: "SUBMITTED",
      submitted_at: Date.now(),
    });
  },
});
```

### Quality Score Computation

Quality scores are computed as a weighted composite of 5 sub-scores. The computation runs as an internal mutation triggered after key events (lead verified, visit completed, checklist approved, document verified).

```typescript
// convex/checklists.ts — internal quality score update
export const recomputeQualityScore = internalMutation({
  args: { guard_id: v.id("users") },
  handler: async (ctx, args) => {
    // 1. Read weights from system_config
    const weights = {
      lead_quality: await getConfigNumber(ctx, "quality_weight_lead_quality"), // 0.30
      checklist_completeness: await getConfigNumber(ctx, "quality_weight_checklist_completeness"), // 0.25
      visit_reliability: await getConfigNumber(ctx, "quality_weight_visit_reliability"), // 0.20
      response_time: await getConfigNumber(ctx, "quality_weight_response_time"), // 0.15
      document_compliance: await getConfigNumber(ctx, "quality_weight_document_compliance"), // 0.10
    };

    // 2. Compute each sub-score (0-100)
    const components = {
      lead_quality_score: await computeLeadQualityScore(ctx, args.guard_id),
      checklist_completeness_score: await computeChecklistScore(ctx, args.guard_id),
      visit_reliability_score: await computeVisitReliabilityScore(ctx, args.guard_id),
      response_time_score: await computeResponseTimeScore(ctx, args.guard_id),
      document_compliance_score: await computeDocumentComplianceScore(ctx, args.guard_id),
    };

    // 3. Weighted composite (0-100)
    const overall_score = Math.round(
      components.lead_quality_score * weights.lead_quality +
        components.checklist_completeness_score * weights.checklist_completeness +
        components.visit_reliability_score * weights.visit_reliability +
        components.response_time_score * weights.response_time +
        components.document_compliance_score * weights.document_compliance,
    );

    // 4. Determine tier from system_config thresholds
    const tier = await computeTier(ctx, overall_score);

    // 5. Insert history record
    await ctx.db.insert("quality_score_history", {
      guard_id: args.guard_id,
      score_date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
      overall_score,
      tier,
      components,
    });

    // 6. Update guard_profiles.quality_tier (denormalized for fast display)
    const profile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.guard_id))
      .unique();
    if (profile) await ctx.db.patch(profile._id, { quality_tier: tier });
  },
});
```

**Trigger points**: `recomputeQualityScore` is called (via `ctx.scheduler.runAfter(0, ...)`) after:

- A lead transitions to `VERIFIED`
- A visit transitions to `COMPLETED`
- A checklist instance transitions to `APPROVED`
- A document item transitions to `VERIFIED`

### Payout Adjustment Integration

Payout adjustments (bonuses and penalties) are computed when a payout is initiated and stored in `payout_adjustments`. The final payout amount = base bounty + sum of all adjustments.

```typescript
// convex/payouts.ts — compute adjustments before creating payout
async function computePayoutAdjustments(
  ctx: MutationCtx,
  guard_id: Id<"users">,
  payout_id: Id<"payouts">,
  base_amount: number,
): Promise<number> {
  const adjustments: Array<{ type: string; amount: number; reason: string }> = [];

  // Bonus: full checklist completion
  const checklistBonus = await checkFullChecklistBonus(ctx, guard_id);
  if (checklistBonus)
    adjustments.push({ type: "BONUS", amount: checklistBonus, reason: "FULL_CHECKLIST" });

  // Bonus: streak multiplier
  const streakBonus = await computeStreakBonus(ctx, guard_id, base_amount);
  if (streakBonus > 0)
    adjustments.push({ type: "BONUS", amount: streakBonus, reason: "STREAK_MILESTONE" });

  // Penalty: low completeness
  const completenessScore = await getLatestChecklistCompleteness(ctx, guard_id);
  if (completenessScore < 60) {
    const penalty = Math.round(base_amount * 0.1); // 10% penalty
    adjustments.push({ type: "PENALTY", amount: -penalty, reason: "LOW_COMPLETENESS" });
  }

  // Insert adjustment records
  for (const adj of adjustments) {
    await ctx.db.insert("payout_adjustments", {
      payout_id,
      guard_id,
      adjustment_type: adj.type as any,
      amount: adj.amount,
      reason: adj.reason,
      applied_by: "SYSTEM",
    });
  }

  return adjustments.reduce((sum, a) => sum + a.amount, 0);
}
```

### Audited Tables (P30 Additions)

The `AUDITED_TABLES` array in `convex/functions.ts` includes these Phase 30 tables:

```typescript
const AUDITED_TABLES = [
  // ... existing tables ...
  "checklist_templates",
  "checklist_instances",
  "document_requirements",
  "regulatory_items",
  "quality_score_history",
  "guard_streaks",
  "payout_adjustments",
] as const;
```

---

## Phase 35: Notification Orchestration Architecture

### Pattern: Domain-Event -> Queue -> Channel Adapters -> Retry/Dead-Letter

```
[Any Phase Mutation]
  -> internal.notifications.emitEvent({ user_id, event_type, category, severity, payload, dedup_key })
  -> notification_events row created (processed: false)

[Cron: process-notification-queue (every 30s)]
  -> fetch unprocessed events (batch of 50)
  -> for each event:
    -> create IN_APP notification row (ALWAYS)
    -> read user notification_preferences
    -> for each enabled channel:
      -> resolve template (event_type + channel + locale)
      -> interpolate template variables from payload
      -> create channel-specific notification row (status: PENDING)
  -> mark event processed

[Cron: retry-failed-notifications (every 5m)]
  -> fetch PENDING/FAILED notifications where retry_count < max_retries
  -> for each:
    -> call channel action adapter
    -> on success: status -> DELIVERED
    -> on failure: increment retry_count
    -> if retry_count >= max_retries: status -> FAILED (dead-letter)
```

### Channel Action Adapters

Each channel has a dedicated Convex Action:

- `actions.notifications.sendPush` - FCM HTTP v1 API
- `actions.notifications.sendWhatsApp` - WhatsApp Business API
- `actions.notifications.sendSMS` - Twilio/MSG91 API
- `actions.notifications.sendEmail` - SendGrid/SES API

All adapters follow the same interface:

```typescript
async function sendChannel(ctx, { notification_id, title, body, recipient_token, metadata }) {
  return { success: boolean; provider_response?: string; error?: string };
}
```

### Dedup Pattern

Events with duplicate `dedup_key` within the `notification_dedup_window_ms` config window are silently dropped at emission time.

---

## Phase 40: AI Intelligence Spine Architecture

### Pattern: Budget-Guarded AI Calls

```typescript
// convex/actions/aiIntelligence.ts
export const scoreLeadQuality = action({
  args: {
    lead_id: v.id("leads"),
  },
  handler: async (ctx, args) => {
    // 1) Check daily budget (in cents, not dollars)
    const budget = await getConfigNumber(ctx, "ai_daily_budget_cents"); // e.g., 5000 = $50
    const spent = await getTodayAISpend(ctx); // in cents
    if (spent + CALL_COST_CENTS > budget) {
      throw new Error("Daily AI budget exhausted");
    }

    // 2) Call OpenAI with lead data
    const score = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Score this lead: ${JSON.stringify(lead)}` }],
    });

    // 3) Record spend
    await recordAISpend(ctx, CALL_COST_CENTS);
    return score;
  },
});
```

**Key rule**: All monetary amounts in config are stored as integer smallest-unit (paise for INR, cents for USD). No floats.

---

## Phase 36: Monetization Ledger Architecture

### Pattern: Compute -> Finalize -> Ledger (Idempotent)

```typescript
// convex/monetization.ts
export const finalizeClosureFee = mutation({
  args: {
    closure_id: v.id("closures"),
    idempotency_key: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "transaction_fees.manage");

    // 1) idempotency guard
    const existing = await ctx.db
      .query("revenue_line_items")
      .withIndex("by_source_type", (q) => q.eq("source_type", "TRANSACTION_FEE"))
      .filter((q) => q.eq(q.field("source_id"), args.idempotency_key))
      .first();
    if (existing) return { reused: true };

    // 2) deterministic compute
    const fee = await ctx.runMutation(internal.monetization.computeClosureFee, {
      closure_id: args.closure_id,
    });
    if (fee.requires_custom_quote) {
      throw new Error("Custom quote required for rent above ₹80,000");
    }

    // 3) append-only ledger rows (FEE_GROSS, PASS_CREDIT, FEE_NET)
    await ctx.db.insert("revenue_line_items", {
      /* FEE_GROSS row */
    });
    await ctx.db.insert("revenue_line_items", {
      /* PASS_CREDIT row */
    });
    await ctx.db.insert("revenue_line_items", {
      /* FEE_NET row */
    });

    return fee;
  },
});
```

### Pattern: Razorpay Webhook (Signature + Idempotency)

```typescript
// convex/http.ts - Razorpay webhook route
http.route({
  path: "/api/payments/razorpay/webhook",
  method: "POST",
  handler: async (ctx, request) => {
    const bodyText = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    // 1) verify signature with RAZORPAY_WEBHOOK_SECRET
    // 2) extract payment_id as idempotency key
    // 3) process event (payment.captured / payment.failed / refund.processed)
    // 4) return 200
  },
});
```

### Cross-Phase Invariants

- P09 payouts are independent; monetization ledger can mirror cost but must not mutate payout lifecycle.
- P34 transaction completion drives fee collection reconciliation (`DUE/PARTIAL -> PAID`).
- P22 referral payouts can be mirrored as negative cost line items.

---

## Phase 37: Resident Lifecycle Automation Architecture

### Pattern: Closure-Triggered Activation

```
closures.confirm() mutation
  -> if rental_transactions link exists:
      -> check rental_transactions.status === "COMPLETED"
      -> if yes: activate resident
  -> else (legacy/pre-P34):
      -> activate resident on closure confirmation

activate resident:
  -> create resident_profiles row (status: PENDING_ACTIVATION)
  -> if rental_transactions.status === "COMPLETED":
      -> transition to ACTIVE, set activated_at = Date.now()
  -> else (legacy fallback on closure confirmation):
      -> transition to ACTIVE, set activated_at = Date.now()
  -> resolve owner_id from closures.owner_id -> owners._id
  -> emit RESIDENT_ACTIVATED notification event (P35)
  -> check referral milestone (P22) via internal.referrals.checkPostMoveInMilestone
```

### Pattern: SLA Cron Enforcement

```typescript
// Cron: check-resident-slas (every 6 hours)
internal.residentProfiles.checkSLAs = internalMutation({
  handler: async (ctx) => {
    // 1) Find OVERDUE rent records -> emit RENT_OVERDUE events
    // 2) Find maintenance tickets past SLA deadline -> set escalated=true, emit alert
    // 3) Find lease renewals approaching expiry -> emit LEASE_EXPIRY_NOTICE
  },
});

// Cron: send-rent-reminders (daily)
internal.residentProfiles.sendRentReminders = internalMutation({
  handler: async (ctx) => {
    // Find rent records with due_date within rent_reminder_days_before
    // Emit RENT_DUE_REMINDER for each
  },
});
```

### Receipt Generation Pattern

Rent receipts are generated as computed queries (no separate storage):

```typescript
rentRecords.generateReceipt({ rent_record_id })
  => { receipt_number, tenant_name, owner_name, property_address, period_label, amount_paise, ... }
```

---

## Phase 42: Financial Products & Insurance Architecture

### Pattern: Partner Adapter Interface

Use the canonical `FinancialPartnerAdapter` contract in **Phase 42: Partner Adapter Patterns** below.

**Key rule**: All monetary amounts are in paise (INR integer), stored as integers. No floats.

---

## Phase 38: Post-Auth Resolver + Owner Read-Model Architecture

### Pattern: Owner-Scoped Aggregator Query

P38 does not create new tables. It creates a single resolver that fetches all owner-relevant data:

```typescript
// convex/owners.ts (or convex/ownerPortal.ts)
type OwnerDashboardSummary = {
  kpis: {
    total_properties: number;
    active_tenants: number;
    expected_monthly_rent: number;
    pending_requests: number;
  };
  recent_activity: Array<{
    type: "closure" | "payout" | "check_in";
    timestamp: number;
    details: object;
  }>;
  rm_contact: {
    rm_name: string;
    rm_phone: string;
    last_check_in: number;
  } | null;
  alerts: Array<{
    type: "lease_expiry" | "pending_request";
    property_id: Id<"listings">;
    message: string;
  }>;
};

export const getMyDashboardSummary = query({
  handler: async (ctx): Promise<OwnerDashboardSummary> => {
    const owner = await requireOwner(ctx); // resolves user -> owner record

    // Parallel fetches (Convex queries are reactive)
    const kpis = await getOwnerDashboardKpis(ctx, owner._id);
    const recent_activity = await getOwnerRecentActivity(ctx, owner._id, { limit: 5 });
    const rm_contact = await getOwnerRmContact(ctx, owner._id);
    const alerts = await getOwnerDashboardAlerts(ctx, owner._id);

    return {
      kpis: {
        total_properties: kpis.total_properties,
        active_tenants: kpis.active_tenants,
        expected_monthly_rent: kpis.expected_monthly_rent,
        pending_requests: kpis.pending_requests,
      },
      recent_activity,
      rm_contact,
      alerts,
    };
  },
});
```

### Auth Redirect Fix Pattern (P38-E02)

Owner users who authenticate via Google SSO must be redirected to `/owner/dashboard` instead of `/admin/dashboard`. The auth callback resolver checks `user_type` and redirects accordingly:

- `ADMIN` / `OPS` -> `/admin/dashboard`
- `TENANT` -> `/tenant/dashboard`
- `OWNER` -> `/owner/dashboard`
- `GUARD` -> `/guard/dashboard`

---

## Rate Limiter

Defined in `convex/rateLimiter.ts`.

Three rate limit rules:

1. **`guard:lead_submission`**:
   - **Type**: Fixed window
   - **Period**: 24 hours
   - **Default rate**: 5 leads per day
   - **Override**: Actual limit read from `system_config.max_leads_per_guard_per_day` at check time (legacy P4/P11 key)
   - **Key**: Guard user ID

2. **`public:listing_inquiry`**:
   - **Type**: Fixed window
   - **Period**: 1 hour
   - **Rate**: 5 inquiries per hour
   - **Key**: Client IP address
   - **Purpose**: Basic spam protection on public listing inquiry form

3. **`chat:send_message`**:
   - **Type**: Fixed window
   - **Period**: 1 minute
   - **Rate**: 20 messages per minute
   - **Key**: Sender user ID
   - **Purpose**: Prevent chat message flooding in deal room channels

**Usage Pattern**:

```typescript
// In a mutation
await rateLimiter.check(ctx, "guard:lead_submission", { key: guardUserId });
```

**Reference**: See [Quality & Controls](features/09-quality-and-controls.md) for rate limit UX.

---

## Phase 39: Tenant Trust & Reviews Architecture

Reference: [Tenant Trust Score & Reviews](features/31-tenant-trust-score-reviews.md)

- `convex/tenantTrust.ts` owns trust-score recompute logic, history writes, and immutable eligibility snapshot export for downstream financial products.
- `convex/reviews.ts` owns interaction-gated review eligibility, cooling/edit lifecycle, moderation transitions, responses, and `review_aggregates` refresh.
- `convex/crons.ts` schedules the trust/review background jobs, while domain internals in `tenantTrust.ts` and `reviews.ts` implement batch cursor processing.

```typescript
// internal ownership contracts (P39)
internal.tenantTrust.dailyDecaySweep({ cursor? });
internal.tenantTrust.nightlyRecompute({ cursor? });
internal.reviews.processCoolingExpiries({ cursor? });
internal.reviews.refreshAggregate({ review_id });
```

---

## Phase 40: AI Action Patterns

Reference: [AI Intelligence Spine](features/32-ai-intelligence-spine.md)

### Pattern: Actions-Only AI Calls

All OpenAI/provider calls run in Convex Actions only. Mutations/queries compute deterministic features and invoke Actions through internal contracts.

```typescript
// convex/actions/aiRent.ts
export const estimateRent = action({
  args: {
    request_id: v.string(),
    estimate_key: v.string(),
    locality_context: v.string(),
    comparables_json: v.string(),
  },
  handler: async (ctx, args) => {
    // External call only here
    // Use response_format: { type: "json_schema" }
    return {
      estimated_rent_paise: 0,
      confidence_score: 0,
      comparable_range_low_paise: 0,
      comparable_range_high_paise: 0,
      factors: [],
      input_tokens: 0,
      output_tokens: 0,
      cost_cents: 0,
    };
  },
});
```

### Pattern: Structured Output + Validation

- Force strict JSON schema for every model response.
- Reject responses that fail validator shape checks.
- Persist `model_version`, `confidence_score`, and `computed_at` on every AI artifact row.

### Pattern: Retry + Backoff

- Attempt schedule: immediate, +1000ms, +2000ms, +4000ms.
- Respect `ai_max_retries` and `ai_timeout_ms` config values.
- On final failure, execute module fallback instead of blocking user workflow.

### Pattern: Budget Guard

```typescript
async function canRunAI(ctx: MutationCtx) {
  const spentToday = await sumAiSpendForUtcDay(ctx);
  const budget = await getConfigNumber(ctx, "ai_daily_budget_cents", 5000);
  return spentToday < budget;
}
```

- If budget exceeded, skip provider call and run fallback path.
- Always write usage rows (`ai_usage_tracking`) for successful and failed attempts with token/cost metadata.

### Pattern: Fallback Flows

- Rent estimate: return cached/stale result (`is_stale: true`) when provider unavailable.
- Lead score: compute deterministic rules-only score if enrichment fails.
- Fraud score: mark for manual review path instead of hard-failing lead operations.
- Photo quality: move to `PENDING_REVIEW` with review queue event.

### Pattern: Recompute Triggers

- Scheduled recompute crons for lead/fraud pipelines.
- Manual recompute mutations gated by `ai.recompute` permission.
- Event-driven recomputes on relevant domain changes (listing updates, lead updates, photo uploads).

---

## Phase 41: Supply Channel Architecture

Reference: [Supply Channel Diversification](features/33-supply-channel-diversification.md)

- Channel ingestion uses dedicated channel tables (`owner_direct_leads`, `secretary_intake`, `resident_referrals`, `broker_partnerships`, `corporate_partnerships`) and normalizes into canonical `leads` rows.
- De-dup/collision handling persists every cross-channel conflict in `source_collisions` and resolves by deterministic priority with explicit admin override paths.
- Corporate partner lifecycle SLAs are monitored by `checkCorporateSLAStages` cron, which advances/escalates stalled corporate pipeline stages.
- Aggregates are materialized into `channel_analytics` and governed by `channel_configs` for enablement, rate limits, and cost alert thresholds.
- P41 GUARD-channel intake uses `system_config.guard_lead_daily_max` for per-channel daily rate limits; legacy `system_config.max_leads_per_guard_per_day` remains in place for P4/P11 guard-only flow.

---

## Phase 42: Partner Adapter Patterns

Reference: [Financial Products & Insurance](features/34-financial-products-insurance.md)

### Pattern: Partner Adapter Interface Contracts

```typescript
type EMIRow = {
  dueDate: number;
  emiPaise: number;
  principalPaise: number;
  interestPaise: number;
  status: "DUE" | "PAID" | "OVERDUE";
};

type CreditPaymentHistoryRow = {
  reportingPeriod: string;
  paymentOnTime: boolean;
  rentAmountPaise: number;
};

type PartnerMetadataValue = string | number | boolean | null;

type PartnerCallbackPayload = {
  partnerKey: string;
  eventId: string;
  productType: "RENT_SHIELD" | "DEPOSIT_LITE" | "DEPOSIT_FINANCING" | "CREDIT_REPORTING";
  externalId: string;
  status: string;
  occurredAt: number;
  payload: Record<string, PartnerMetadataValue>;
};

interface FinancialPartnerAdapter {
  // Rent Shield
  createPolicy(params: {
    tenantId: string;
    propertyId: string;
    coverageAmountPaise: number;
    termMonths: number;
  }): Promise<{ partnerId: string; policyNumber: string; premiumPaise: number }>;
  fileClaim(params: {
    policyNumber: string;
    claimAmountPaise: number;
    reason: string;
    evidenceDocs: string[];
  }): Promise<{ claimId: string; status: "ACCEPTED" | "REJECTED"; reason?: string }>;
  collectPremium(params: {
    policyNumber: string;
    amountPaise: number;
    periodStart: number;
    periodEnd: number;
  }): Promise<{
    transactionId: string;
    status: "SUCCESS" | "FAILED" | "PENDING";
    failureReason?: string;
  }>;

  // Deposit Lite
  enrollPlan(params: {
    tenantId: string;
    propertyId: string;
    annualFeePaise: number;
  }): Promise<{ planId: string }>;

  // Deposit Financing
  applyLoan(params: {
    tenantId: string;
    amountPaise: number;
    termMonths: number;
    interestRateBps: number;
  }): Promise<{ applicationId: string; emiPaise: number; schedule: EMIRow[] }>;
  recordPayment(params: {
    loanId: string;
    amountPaise: number;
    paymentRef: string;
  }): Promise<{ status: "SUCCESS" | "FAILED" }>;

  // Credit Reporting
  submitReport(params: {
    tenantId: string;
    reportingPeriod: string;
    paymentHistory: CreditPaymentHistoryRow[];
  }): Promise<{ reportId: string; bureau: string }>;

  // Common
  getStatus(params: {
    productType: string;
    externalId: string;
  }): Promise<{ status: string; metadata: Record<string, PartnerMetadataValue> }>;
  handleCallback(payload: PartnerCallbackPayload): Promise<void>;
}
```

Adapter methods must enforce timeout/retry policy and preserve paise-only money contracts.

### Pattern: Signed Webhook Ingress

```typescript
http.route({
  path: "/api/financial/callback",
  method: "POST",
  handler: async (ctx, request) => {
    const body = await request.text();
    const signature = request.headers.get("x-signature");
    verifyHmacSignatureOrThrow(body, signature);
    // Continue only on valid signature
    return new Response("ok", { status: 200 });
  },
});
```

- Verify signature before parsing callback payload.
- Enforce replay-window checks using timestamp headers.

### Pattern: Callback Idempotency

- Use partner `idempotency_key` / `event_id` as unique callback key.
- First processed callback writes canonical state transition.
- Replays return success without duplicate mutation side effects.

### Pattern: Retry + Dead-Letter

- Callback processing retries with exponential backoff.
- After retry cap, move callback to dead-letter queue table.
- Dead-letter rows are replayable by admin-only repair mutation.

### Pattern: Reconciliation Queue

- Periodic reconciliation compares local status vs partner status.
- Drift opens reconciliation work items.
- Reconciliation writes audit metadata and does not bypass lifecycle guards.

### Pattern: Ledger Posting Invariants

Financial posting mutations must maintain:

1. Exactly balanced debit/credit pairs for each `transaction_ref`.
2. Idempotent writes for each posting key.
3. No state transition finalization before successful ledger write.

```typescript
await postLedgerPair(ctx, {
  transaction_ref,
  debit: { account_type: "TENANT_WALLET", amount_paise },
  credit: { account_type: "PARTNER_PAYABLE", amount_paise },
});
```

---

## Phase 44: Field-Worker Auth Helper Contract

Reference: [OPS Superset Expansion](features/35-ops-superset-expansion.md)

### `requireFieldWorker(ctx)`

1. Resolve auth identity (same baseline as `requireAuth`).
2. Load `users` row.
3. Permit `user_type` only in `{GUARD, OPS}`.
4. Reject non-active users (`status !== "ACTIVE"`).
5. For `OPS`, allow only when:
   - `ops_field_worker_enabled === true`, or
   - user id is in `ops_field_worker_canary_user_ids`.
6. Load `guard_profiles` by `user_id`.
7. If profile is missing, fail deterministically.

Return type:

```typescript
Promise<{
  user: Doc<"users">;
  guardProfile: Doc<"guard_profiles">;
}>;
```

Role/eligibility mismatch error message: `"Not authorized as field worker"`.

### `requireFieldWorkerAuth(ctx)`

- Same checks as `requireFieldWorker` except no profile lookup.

Return type:

```typescript
Promise<{ user: Doc<"users"> }>;
```

Role/eligibility mismatch error message: `"Not authorized as field worker"`.

### Migration Pattern (Guard-Only -> Field-Worker)

1. Keep legacy guard-only function contracts unchanged where explicitly guard-only.
2. For field-worker eligible paths, replace `requireGuard` with `requireFieldWorker`.
3. Preserve existing field names (`submitted_by_guard_id`, `assigned_guard_id`) for backward compatibility; treat values as field-worker user ids.
4. Add persona-aware filters in admin analytics/leaderboards (`GUARD`, `OPS`, `ALL`) to avoid mixing cohorts by default.
