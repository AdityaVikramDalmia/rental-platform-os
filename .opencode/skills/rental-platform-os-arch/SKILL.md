---
name: rental-platform-os-arch
description: Rental Platform OS architecture patterns — the central import point (functions.ts), auth helpers, Convex Actions for WorkOS, HTTP Router, file uploads, real-time subscriptions, and project structure for building on Convex + Next.js + WorkOS.
license: MIT
---

# Rental Platform OS Architecture Patterns

This is the architecture reference for implementing Convex functions and Next.js pages in Rental Platform OS. Contains the code patterns you MUST follow, not just descriptions.

**Full details**: `notes/11-convex-architecture.md` is the source of truth. This skill extracts the patterns you need while coding.

## When to Use

- Writing any Convex mutation, query, or action
- Implementing auth-protected endpoints
- Building frontend pages with real-time data
- Uploading files (photos, documents)
- Understanding how the project pieces connect

## Project Structure

Single package. No monorepo. Convex auto-generates the type bridge between backend and frontend.

```
rental-platform-os/
  convex/                   # Backend — Convex functions + schema
    schema.ts               # Database schema (defineSchema)
    functions.ts            # THE CENTRAL IMPORT POINT (wrapped mutations)
    auth.config.ts          # WorkOS JWT provider config
    auth.helpers.ts         # requireGuard, requireAdmin, requirePermission
    actions/workos.ts       # WorkOS API calls (guard creation, password, ban)
    http.ts                 # HTTP Router (public listing endpoint)
    seed.ts                 # Bootstrap: roles + super admin + config
    rateLimiter.ts          # @convex-dev/rate-limiter config
    convex.config.ts        # Component registration (rate-limiter, aggregate)
    crons.ts                # Cron jobs (daily analytics snapshot)
    [domain].ts             # societies.ts, guards.ts, leads.ts, etc.
    _generated/             # Auto-generated types — NEVER import mutation from here
  src/                      # Frontend — Next.js App Router
    app/
      layout.tsx            # Root layout with ConvexProviderWithAuth + AuthKitProvider
      sw.ts                 # Serwist service worker source (compiled to public/sw.js)
      ~offline/page.tsx     # Offline fallback route
      (guard)/              # Guard portal (mobile-first)
      (admin)/              # Admin panel (desktop-first)
      listing/[slug]/       # Public listing pages (SSR, no auth)
    components/
      ui/                   # shadcn/ui base components
      guard/                # Guard-specific components
      admin/                # Admin-specific components
      shared/               # Cross-role (file upload, etc.)
    lib/                    # Frontend utilities
  public/                   # Static assets (PWA manifests, favicon, guard/admin icons)
    manifest-guard.webmanifest
    manifest-admin.webmanifest
    icons/
  lib/                      # SHARED utilities (imported by BOTH convex/ and src/)
    constants.ts            # All enums, permission strings, config keys
    validators.ts           # normalizePhone, validateFlatNumber
    money.ts                # rupeesToPaise, paiseToRupees, formatINR
    dates.ts                # Unix ms helpers
  messages/                 # i18n (en.json, hi.json, hinglish.json)
```

## Pattern 1: The Central Import Point (functions.ts)

**This is the most critical pattern.** All mutations go through `convex/functions.ts` which wraps them with automatic audit logging via `convex-helpers/server/triggers`.

```typescript
// convex/functions.ts — ALWAYS import mutation/internalMutation from HERE
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";

const triggers = new Triggers<DataModel>();

// Registers audit triggers on ALL business tables
const AUDITED_TABLES = [
  "societies", "buildings", "users", "guard_profiles", "guard_shifts",
  "leads", "owner_verifications", "listings", "visits",
  "closures", "payouts", "incentive_cards", "roles",
  "user_role_assignments", "system_config",
] as const;

// Each insert/update/delete auto-creates an audit_logs entry
for (const table of AUDITED_TABLES) {
  triggers.register(table, async (ctx, change) => {
    await ctx.db.insert("audit_logs", {
      actor_user_id: /* resolved from auth context */,
      actor_type: /* GUARD / ADMIN / SYSTEM */,
      action: `${table.toUpperCase()}_${change.operation.toUpperCase()}`,
      entity_type: table,
      entity_id: change.id as string,
      changes: computeChanges(change.oldDoc, change.newDoc),
      metadata: {},
    });
  });
}

// THESE are the exports every domain file imports
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
export const query = rawQuery;             // Queries don't need triggers
export const internalQuery = rawInternalQuery;
```

### Import Rules

```typescript
// CORRECT — audit triggers fire automatically
import { mutation, query } from "./functions";

// WRONG — bypasses audit logging, ESLint will block this
import { mutation } from "./_generated/server"; // NEVER DO THIS
```

ESLint enforces this via `no-restricted-imports` rule on `*/_generated/server` for `mutation` and `internalMutation` imports.

## Pattern 2: Auth Helpers

All in `convex/auth.helpers.ts`. Use the right helper for the right context.

```typescript
// For guard-facing functions (leads, visits, earnings, profile):
const guard = await requireGuard(ctx);
// Checks: authenticated → user exists → not BANNED → user_type === GUARD → status === ACTIVE

// For admin functions with specific permission:
const admin = await requirePermission(ctx, "leads.verify");
// Checks: authenticated → user exists → not BANNED → user_type === ADMIN → has permission via RBAC

// For admin functions (any admin):
const admin = await requireAdmin(ctx);
// Checks: authenticated → user exists → not BANNED → user_type === ADMIN

// For either role (rare — e.g., notes_thread where both can write):
const user = await requireAuth(ctx);
// Checks: authenticated → user exists → not BANNED
```

### How requirePermission Works

```typescript
// 1. Get user from auth context (WorkOS JWT → workos_user_id → users table)
// 2. Check user_type === ADMIN
// 3. Fetch user_role_assignments for this user
// 4. Fetch all linked roles
// 5. Flatten all permissions from all roles
// 6. Check if the requested permission is in the set
// 7. Throw "Missing permission: X" if not
```

## Pattern 3: Convex Actions (External API Calls)

Mutations/queries CANNOT call external APIs. Actions CAN. All WorkOS calls go through `convex/actions/workos.ts`.

### Action → Internal Mutation Pattern

```typescript
// convex/actions/workos.ts
export const createGuardAccount = action({
  args: { name: v.string(), phone: v.string() /* ... */ },
  handler: async (ctx, args) => {
    // 1. Call external API (WorkOS)
    const workosUser = await workos.userManagement.createUser({
      email: `${args.phone}@guards.local`,
      password: args.temp_password,
      firstName: args.name,
    });

    // 2. Call internal mutation to write to Convex DB
    const userId = await ctx.runMutation(internal.guards.createInternal, {
      workos_user_id: workosUser.id,
      name: args.name,
      phone: args.phone,
      /* ... */
    });

    return { userId, workosUserId: workosUser.id };
  },
});
```

### Key Actions

| Action               | What It Does                                                          |
| -------------------- | --------------------------------------------------------------------- |
| `createGuardAccount` | WorkOS createUser → internal mutation (user + guard_profile)          |
| `changePassword`     | WorkOS updateUser password → flip `must_change_password = false`      |
| `resetGuardPassword` | WorkOS updateUser password → set `must_change_password = true`        |
| `suspendGuard`       | WorkOS suspend → set status BANNED → flag visits `needs_reassignment` |
| `unsuspendGuard`     | WorkOS unsuspend → set status ACTIVE or INACTIVE                      |

### Error Handling in Actions

- If WorkOS call succeeds but Convex mutation fails → retry the mutation.
- If WorkOS call fails → throw immediately. UI shows the error.
- **No silent partial state.** Never leave WorkOS and Convex out of sync.

### Admin Creation Does NOT Use an Action

Admins auto-create on first Google SSO login. The callback checks if a Convex user exists for the `workos_user_id`, creates one if not. No external API call needed — WorkOS already created the user during SSO.

## Pattern 4: Domain File Organization

Each domain gets its own file. Follow this consistent structure.

```typescript
// convex/leads.ts — example
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./functions"; // ALWAYS from functions.ts
import { requireGuard, requirePermission } from "./auth.helpers";

// ============ QUERIES ============

export const list = query({
  args: {
    /* filters, paginationOpts */
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "leads.view");
    // Query logic...
  },
});

export const getMyLeads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const guard = await requireGuard(ctx);
    // Guard can ONLY see their own leads
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
    /* validated fields */
  },
  handler: async (ctx, args) => {
    const guard = await requireGuard(ctx);
    // 1. Validate (consent, society active, building belongs to society)
    // 2. Rate limit check
    // 3. De-dup check
    // 4. Build searchable_text (computed inline — NOT via trigger)
    // 5. Insert record
    // Audit log is AUTOMATIC via trigger — no manual logging
    return leadId;
  },
});
```

## Pattern 5: Auth Architecture (WorkOS + Convex)

### Two JWT Providers

```typescript
// convex/auth.config.ts
export default {
  providers: [
    {
      type: "customJwt",
      issuer: "https://api.workos.com/", // Google SSO (admins)
      algorithm: "RS256",
      applicationID: clientId,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`, // Email+password (guards)
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};
```

### Auth Flow Summary

| Who   | How                                                                                      | Login Page     | Post-Login                                                            |
| ----- | ---------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| Guard | Phone+password → synthetic email (`{phone}@guards.local`) → WorkOS email+password auth | `/guard/login` | If `must_change_password`: redirect to `/guard/change-password` first |
| Admin | Google SSO via WorkOS AuthKit                                                            | `/admin/login` | Auto-create Convex user on first SSO if not exists                    |

### Client-Side Provider Setup

```typescript
// Root layout wraps with:
// AuthKitProvider → ConvexProviderWithAuth → App
// Uses useAuthFromAuthKit() hook to bridge WorkOS tokens to Convex
```

### Route Protection

```typescript
// middleware.ts
// 1. authkitMiddleware() validates auth tokens
// 2. /guard/* → require user_type GUARD, status not BANNED
// 3. /admin/* → require user_type ADMIN
// 4. /listing/* → public, no auth
// 5. Guard with must_change_password → redirect to /guard/change-password
```

## Pattern 6: HTTP Router (Public Endpoints)

For SEO-friendly public listing pages. Next.js Server Components fetch from this endpoint.

```typescript
// convex/http.ts
const http = httpRouter();

http.route({
  path: "/api/listing/:slug",
  method: "GET",
  handler: async (ctx, request) => {
    const slug = /* extract from URL */;
    const listing = await ctx.runQuery(internal.listings.getBySlugInternal, { slug });
    if (!listing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
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

**Why HTTP Router** instead of `fetchQuery`: cacheable, no Convex client setup needed on server, works cleanly with Next.js ISR/SSR.

**Photo URLs**: NOT included in HTTP response. Server Component resolves `storage_id` → URL separately via `ctx.storage.getUrl()` in a Server Action.

**Listing inquiry form**: Submitted via Next.js Server Action (not HTTP Router). Server Action captures client IP for rate limiting.

## Pattern 7: Real-Time Subscriptions

Convex queries are reactive. `useQuery` / `usePaginatedQuery` auto-update when data changes.

```typescript
// Admin: auto-updating lead queue
const { results, status, loadMore } = usePaginatedQuery(
  api.leads.list,
  { society_id: societyId, status: "SUBMITTED" },
  { initialNumItems: 20 },
);
// results auto-update when a guard submits a new lead

// Guard: live status updates on their leads
const leads = useQuery(api.leads.getMyLeads, { paginationOpts: { numItems: 50 } });
// Guard sees status change (SUBMITTED → VERIFIED) in real-time
```

No polling. No manual refresh. No WebSocket setup. Convex handles it.

## Pattern 8: File Upload

Three-step pattern using Convex file storage.

```typescript
// Step 1: Backend — Generate upload URL (auth-protected)
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "listings.create");
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 2: Client — Upload file directly to Convex storage
const url = await generateUploadUrl();
const result = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": file.type },
  body: file,
});
const { storageId } = await result.json();

// Step 3: Client — Pass storageId to a mutation
await addPhoto({ listing_id, storage_id: storageId, display_order: nextOrder });
```

**Client-side resize** before upload: guard photos → ~500KB, listing photos → ~1MB. Use `browser-image-compression`.

## Pattern 9: Error Handling

```typescript
// Backend: throw descriptive errors — they reach the UI
throw new Error("Daily lead limit reached. Come back tomorrow!");
throw new Error("Owner consent is required to submit this lead.");
throw new Error("Missing permission: leads.verify");

// Frontend: catch and toast
try {
  await createLead(data);
  toast.success("Lead submitted!");
} catch (error) {
  toast.error(error.message);
}
```

Use `sonner` for toasts. Convex auto-retries transient failures.

## Pattern 10: Bootstrap / Seed

Run once on first deployment: `npx convex run seed:init`

```typescript
// convex/seed.ts — Internal mutation, idempotent
// 1. Check if roles table is empty (skip if already seeded)
// 2. Create "Super Admin" role (all permissions, is_system_role: true)
// 3. Create "Ops Agent" role (operational permissions, is_system_role: true)
// 4. Read SUPER_ADMIN_EMAIL from env
// 5. Create Convex user record (user_type: ADMIN, status: ACTIVE)
// 6. Assign Super Admin role
// 7. Create default system_config entries (rate limits, thresholds)
```

**Note**: Seed does NOT create a WorkOS user for the super admin. WorkOS account is auto-created on first Google SSO login.

## Pattern 11: Status Transition Validation

Every status-changing mutation MUST validate the transition is legal.

```typescript
function validateTransition(entity: string, current: string, next: string): boolean {
  const valid: Record<string, Record<string, string[]>> = {
    lead: {
      SUBMITTED: ["NEED_INFO", "VERIFIED", "REJECTED"],
      NEED_INFO: ["SUBMITTED", "REJECTED"],
      POTENTIAL_DUPLICATE: ["DUPLICATE", "SUBMITTED"],
      // VERIFIED, REJECTED, DUPLICATE: terminal
    },
    visit: {
      ASSIGNED: ["CONFIRMED", "IN_PROGRESS", "CANCELLED", "NO_SHOW"],
      CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
      IN_PROGRESS: ["COMPLETED"],
    },
    listing: {
      DRAFT: ["PUBLISHED"],
      PUBLISHED: ["ARCHIVED", "DRAFT"],
      ARCHIVED: ["DRAFT"],
    },
    closure: {
      PENDING: ["CONFIRMED", "CANCELLED"],
    },
    payout: {
      INITIATED: ["APPROVED"],
      APPROVED: ["PAID"],
    },
  };
  return (valid[entity]?.[current] ?? []).includes(next);
}
```

**Full transition details**: `notes/04-state-machines.md` — the source of truth for all transitions.

## Pattern 12: Soft Delete

```typescript
// "Delete" = set flag
await ctx.db.patch(args.id, { is_deleted: true });

// EVERY query on soft-deletable tables MUST filter:
.filter((q) => q.neq(q.field("is_deleted"), true))
```

**Tables with `is_deleted`**: `buildings`, `guard_shifts`, `roles`, `user_role_assignments`, `listing_photos`.

**Tables WITHOUT `is_deleted`** (use status field instead): `societies`, `users`, `leads`, `listings`, `visits`, `closures`, `payouts`.

## Pattern 13: Convex Components

```typescript
// convex/convex.config.ts
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(rateLimiter);
app.use(aggregate, { name: "leadCounts" });
app.use(aggregate, { name: "visitCounts" });
app.use(aggregate, { name: "payoutTotals" });
```

Rate limiter: `@convex-dev/rate-limiter` — 5 leads/day/guard, 5 inquiries/hour/IP.
Aggregates: `@convex-dev/aggregate` — efficient counters for analytics dashboards.

## Key Architectural Decisions

| Decision                        | Choice                           | Why                                                                  |
| ------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| Single package                  | One `package.json`, no monorepo  | Convex auto-generates the type bridge                                |
| Synthetic email for guards      | `{phone}@guards.local`         | WorkOS requires email for email+password auth                        |
| Audit via triggers              | `convex-helpers/server/triggers` | Automatic, can't forget, consistent                                  |
| Actions for external APIs       | `convex/actions/workos.ts`       | Convex mutations can't call external APIs                            |
| HTTP Router for public pages    | Not `fetchQuery`                 | Cacheable, no Convex client needed on server                         |
| Separate PWA manifests          | Per-portal (guard/admin)         | Different users, different install surfaces, different colors/scopes |
| searchable_text computed inline | NOT via trigger                  | Triggers run after mutation; need the text during insert             |
| 30-day sessions                 | WorkOS default                   | Guards almost never re-login                                         |
| Manual payout amounts           | Not auto-calculated              | Prospective bounty is motivational; actual payout varies per deal    |

**Full decision log**: `notes/12-decisions-log.md` — 44 decisions with rationale.
