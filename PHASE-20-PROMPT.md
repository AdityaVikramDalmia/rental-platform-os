# Phase 20 Implementation Prompt: Owner Services Pipeline

> **FIRST STEP**: Read `AGENTS.md` in the project root. It contains the full project context — tech stack, personas, conventions, dev environment, routing rules, test accounts, and file structure. Do this before any other work.
>
> This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`. Load skills via `load_skills=["skill-name"]`.

---

## Scope

**Deliver**: A full owner services pipeline — from a property owner submitting a service request on the public `/owner-services` page, through admin review and contact, to owner onboarding (WorkOS account creation) and activation. Three UIs: (1) public owner services landing page at `/owner-services` with benefits grid and contact form, (2) admin owner requests queue at `/admin/owner-requests`, (3) WorkOS account creation action for onboarding. New `owner_service_requests` table with 6-status state machine. New `convex/ownerServiceRequests.ts` with 7 mutations + 3 queries. New constants, permissions, and schema validators.

**This is a SEPARATE pipeline from the guard lead pipeline and tenant inquiry pipeline.** Guard leads are supply-side discovery. Tenant inquiries are demand-side visit requests. Owner service requests are property management acquisition — owners who want DemoRentals to manage their property.

**Does NOT include** (out of scope — do NOT implement):

- Owner portal / owner dashboard (Phase 31 — owners have no authenticated portal in V1)
- Owner auth / Google SSO login for owners (Phase 31)
- Owner "My Requests" status tracking page (V2 — requires owner auth)
- Owner self-serve profile editing (V2)
- Automated email/SMS notifications to owners (V2)
- Property management agreement generation (V2)
- Owner referral system (Phase 22)
- Owner-to-tenant deal room (Phase 23/24)
- Rent collection / payment tracking for owners (V2)
- Owner analytics dashboard (V2)

> **⚠️ Dependency Note**: The `tasks/README.md` roadmap says P31-E01 (Owner Entity & RM Foundation)
> should execute before P20. However, P20's own task files (P20-E01, E02, E03) list only P19-E01
> and P15 as dependencies — both of which are complete. This prompt implements P20 as specified
> by its task files. If P31 is implemented later, minor schema adjustments may be needed
> (e.g., adding `owner_id` foreign key to `owner_service_requests`).

---

## V1 Simplifications (IMPORTANT — Read Before Implementing)

The feature spec (`notes/features/14-owner-services.md`) describes the full vision. For V1, we simplify:

| Feature                  | Spec Says                                       | V1 Implementation                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner auth**           | Owner signs in with Google SSO                  | **No auth on submission** — contact form is public (like existing contact form). `name` + `phone` + `email` fields on the request itself. No `owner_id` foreign key at submission. |
| **Owner portal**         | Owner can track request status, view properties | **Not in V1** — owner gets a toast "submitted" and that's it. No tracking page.                                                                                                    |
| **WorkOS account**       | Created when owner signs up                     | **Created by admin** — admin clicks "Onboard" which calls `createOwnerAccount` action. Owner gets a WorkOS account with their email, can sign in with Google.                      |
| **Duplicate prevention** | Unique phone per owner                          | **Not enforced** — duplicate phone submissions are allowed. Admin handles duplicates manually.                                                                                     |
| **Property value**       | Full property valuation workflow                | **Optional field** — owner can optionally enter estimated property value in ₹ (stored as paise). No validation workflow.                                                           |
| **Rate limiting**        | Rate limit contact form submissions             | **Yes** — 3 requests per hour per phone number (fixed window).                                                                                                                     |

**Why no owner auth for V1**: The current public pages already have a contact form (name + phone + message). The owner services form extends this with property details. Adding Google SSO auth-gating would block the entire acquisition funnel on an owner auth system that doesn't exist yet. V1 captures the supply acquisition funnel; V2 adds auth.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ Convex Backend                                                        │
│                                                                       │
│  NEW: convex/ownerServiceRequests.ts                                  │
│  ├── submit()              — public, no auth, rate-limited           │
│  ├── updateStatus()        — requirePermission(OWNER_SERVICE_REQUESTS_MANAGE) │
│  ├── list()                — requirePermission(OWNER_SERVICE_REQUESTS_VIEW)   │
│  ├── getById()             — requirePermission(OWNER_SERVICE_REQUESTS_VIEW)   │
│  ├── getStatusCounts()     — requirePermission(OWNER_SERVICE_REQUESTS_VIEW)   │
│  ├── getSubmittedCount()   — requirePermission(OWNER_SERVICE_REQUESTS_VIEW)   │
│  └── onboardInternal()     — internal mutation (called by createOwnerAccount) │
│                                                                       │
│  MODIFIED: convex/actions/workos.ts — add createOwnerAccount action  │
│  MODIFIED: convex/schema.ts — add owner_service_requests table       │
│  MODIFIED: convex/functions.ts — add "owner_service_requests" to AUDITED_TABLES │
│  MODIFIED: convex/rateLimiter.ts — add public:owner_service_request  │
│  MODIFIED: lib/constants.ts — add OWNER_SERVICE_REQUEST_STATUS + perms │
└─────────────────────┬─────────────────────────────────────────────────┘
                      │ useQuery / useMutation
┌─────────────────────▼─────────────────────────────────────────────────┐
│                                                                       │
│  PUBLIC: /owner-services — Owner services landing page                │
│  ├── Hero section (dark background, gradient)                        │
│  ├── Benefits grid (6 cards)                                         │
│  └── Contact form (name, phone, email, property_type, location,      │
│       property_value, notes) → submits via ownerServiceRequests.submit │
│                                                                       │
│  ADMIN: /admin/owner-requests — Owner requests queue page            │
│  ├── Status tabs with counts (SUBMITTED, CONTACTED, ONBOARDED, etc.) │
│  ├── Paginated table with filters                                    │
│  ├── Side panel with request detail + actions                        │
│  ├── Contact dialog, Reject dialog, Drop dialog                      │
│  └── Onboard dialog (triggers createOwnerAccount action)             │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## State Machine (6 Statuses)

```
     ┌───────────┐
     │ SUBMITTED │  ← Owner submits contact form on /owner-services
     └─────┬─────┘
           │
      ┌────┼────────┐
      │             │
      ▼             ▼
┌──────────┐   ┌──────────┐
│CONTACTED │   │ REJECTED │
└────┬─────┘   └──────────┘
     │          (terminal)
     │
     ├────────────────┐
     │                │
     ▼                ▼
┌──────────────┐  ┌─────────┐
│  ONBOARDED   │  │ DROPPED │
└──────┬───────┘  └─────────┘
       │           (terminal)
       ▼
┌──────────────┐
│    ACTIVE    │
└──────────────┘
  (terminal)
```

### Transition Table (EXHAUSTIVE — implement exactly this)

```typescript
const VALID_OWNER_SERVICE_REQUEST_TRANSITIONS: Record<string, string[]> = {
  [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]: [
    OWNER_SERVICE_REQUEST_STATUS.CONTACTED,
    OWNER_SERVICE_REQUEST_STATUS.REJECTED,
  ],
  [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]: [
    OWNER_SERVICE_REQUEST_STATUS.ONBOARDED,
    OWNER_SERVICE_REQUEST_STATUS.DROPPED,
  ],
  [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]: [OWNER_SERVICE_REQUEST_STATUS.ACTIVE],
  // Terminal states: REJECTED, DROPPED, ACTIVE — no outgoing transitions
};

export function validateOwnerServiceRequestTransition(
  currentStatus: string,
  newStatus: string,
): boolean {
  return (VALID_OWNER_SERVICE_REQUEST_TRANSITIONS[currentStatus] ?? []).includes(newStatus);
}
```

**CRITICAL**: The `CONTACTED → ONBOARDED` transition is ONLY triggered by the `createOwnerAccount` action (via `onboardInternal` internal mutation). It is NOT available via `updateStatus`. The `updateStatus` mutation handles: SUBMITTED→CONTACTED, SUBMITTED→REJECTED, CONTACTED→DROPPED. The `onboardInternal` mutation handles: CONTACTED→ONBOARDED. The `activate` mutation handles: ONBOARDED→ACTIVE.

---

## Existing Patterns to Follow (File References)

Read these files to understand existing conventions before implementing:

| Pattern                          | Reference File                                                                 | What to Copy                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Mutation with audit triggers** | `convex/functions.ts` (lines 1-100)                                            | Use `mutation` from `./functions` (NOT from `_generated/server`) for audited mutations. Use `query` from `_generated/server` for queries. |
| **Internal mutation**            | `convex/tenantInquiries.ts` (if exists) or `convex/leads.ts`                   | `internalMutation` from `./functions` for mutations called by Actions                                                                     |
| **Auth helpers**                 | `convex/auth.helpers.ts`                                                       | `requirePermission()`, `requireAdmin()` patterns                                                                                          |
| **WorkOS Action pattern**        | `convex/actions/workos.ts` (`createGuardAccount` action)                       | How to call WorkOS REST API, handle "already exists", create Convex user, call internal mutation                                          |
| **Status validation**            | `convex/leads.ts` (`validateLeadTransition`, line ~177)                        | Transition table pattern for state machine                                                                                                |
| **Constants + colors**           | `lib/constants.ts` (lines 1-460)                                               | Enum pattern, color map pattern, permissions pattern                                                                                      |
| **Schema validators**            | `convex/schema.ts` (lines 1-210)                                               | Validator union pattern                                                                                                                   |
| **Admin list page**              | `src/app/(admin)/admin/tenant-inquiries/page.tsx`                              | URL-driven tabs, filters, side panel, permission check                                                                                    |
| **Admin sidebar nav**            | `src/app/(admin)/admin-layout-client.tsx` (lines 40-126)                       | Nav items with badge counts, permission-gated visibility                                                                                  |
| **Admin detail panel**           | `src/app/(admin)/admin/tenant-inquiries/components/inquiry-detail-panel.tsx`   | Side panel pattern                                                                                                                        |
| **Paginated query**              | `convex/tenantInquiries.ts` (`list` query) or `convex/leads.ts` (`list` query) | `paginationOptsValidator` + enrichment pattern                                                                                            |
| **Public page layout**           | `src/app/(public)/homepage/page.tsx`                                           | `SectionContainer`, `SectionReveal` animation wrappers                                                                                    |
| **Public hero section**          | `src/components/public/hero-section.tsx`                                       | Dark background hero with gradient, motion animations                                                                                     |
| **Rate limiter**                 | `convex/rateLimiter.ts`                                                        | Existing rate limiter configuration                                                                                                       |
| **Public header nav**            | `src/components/public/header.tsx`                                             | `NAV_ITEMS` array — update "Owner Services" href from `/contact` to `/owner-services`                                                     |

---

## Implementation Order

Execute in this exact order. Each step builds on the previous.

---

### Step 1: Schema Changes — Add `owner_service_requests` Table

**File:** `convex/schema.ts`

#### 1a: Add `ownerServiceRequestStatusValidator` (after `tenantInquiryStatusValidator` or after `listingInquirySourceValidator`, around line 101-115)

```typescript
const ownerServiceRequestStatusValidator = v.union(
  v.literal("SUBMITTED"),
  v.literal("CONTACTED"),
  v.literal("ONBOARDED"),
  v.literal("ACTIVE"),
  v.literal("REJECTED"),
  v.literal("DROPPED"),
);
```

#### 1b: Add `owner_service_requests` table (after `tenant_inquiries` table or after `listing_inquiries`, around line 460-480)

```typescript
owner_service_requests: defineTable({
  name: v.string(),
  phone: v.string(),
  email: v.optional(v.string()),
  property_type: v.optional(v.string()),
  location: v.optional(v.string()),
  property_value: v.optional(v.number()), // paise
  notes: v.optional(v.string()),
  status: ownerServiceRequestStatusValidator,
  ops_notes: v.optional(v.string()),
  assigned_admin_id: v.optional(v.id("users")),
  contacted_at: v.optional(v.number()), // Unix ms — set on SUBMITTED→CONTACTED
  owner_user_id: v.optional(v.id("users")), // set after onboarding
})
  .index("by_status", ["status"])
  .index("by_phone", ["phone"])
  .index("by_assigned_admin_id", ["assigned_admin_id"]),
```

#### 1c: Add audit actions for owner service requests

Add to the `auditActionValidator` union (find the existing `v.literal("TENANT_INQUIRIES_INSERT")` block and add after it):

```typescript
v.literal("OWNER_SERVICE_REQUESTS_INSERT"),
v.literal("OWNER_SERVICE_REQUESTS_UPDATE"),
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 2: Constants — Add Owner Service Request Status, Colors, Labels, Permissions

**File:** `lib/constants.ts`

#### 2a: Add `OWNER_SERVICE_REQUEST_STATUS` enum (after `TENANT_INQUIRY_STATUS` or after `INQUIRY_SOURCE`, around line 200-220)

```typescript
export const OWNER_SERVICE_REQUEST_STATUS = {
  SUBMITTED: "SUBMITTED",
  CONTACTED: "CONTACTED",
  ONBOARDED: "ONBOARDED",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  DROPPED: "DROPPED",
} as const satisfies Record<string, string>;

export type OwnerServiceRequestStatus =
  (typeof OWNER_SERVICE_REQUEST_STATUS)[keyof typeof OWNER_SERVICE_REQUEST_STATUS];
```

#### 2b: Add `OWNER_SERVICE_REQUEST_STATUS_COLORS` (after `TENANT_INQUIRY_STATUS_COLORS` or other color maps, around line 460-480)

```typescript
export const OWNER_SERVICE_REQUEST_STATUS_COLORS: Record<OwnerServiceRequestStatus, string> = {
  [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]: "bg-blue-100 text-blue-700",
  [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]: "bg-indigo-100 text-indigo-700",
  [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]: "bg-green-100 text-green-700",
  [OWNER_SERVICE_REQUEST_STATUS.ACTIVE]: "bg-emerald-100 text-emerald-700",
  [OWNER_SERVICE_REQUEST_STATUS.REJECTED]: "bg-red-100 text-red-700",
  [OWNER_SERVICE_REQUEST_STATUS.DROPPED]: "bg-gray-100 text-gray-500",
};
```

#### 2c: Add `OWNER_SERVICE_REQUEST_STATUS_LABELS` (display labels for UI)

```typescript
export const OWNER_SERVICE_REQUEST_STATUS_LABELS: Record<OwnerServiceRequestStatus, string> = {
  [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]: "Submitted",
  [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]: "Contacted",
  [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]: "Onboarded",
  [OWNER_SERVICE_REQUEST_STATUS.ACTIVE]: "Active",
  [OWNER_SERVICE_REQUEST_STATUS.REJECTED]: "Rejected",
  [OWNER_SERVICE_REQUEST_STATUS.DROPPED]: "Dropped",
};
```

#### 2d: Add permissions (in `PERMISSIONS` object, after `TENANT_INQUIRIES_REVIEW` or after `AUDIT_VIEW`)

```typescript
OWNER_SERVICE_REQUESTS_VIEW: "owner_service_requests.view",
OWNER_SERVICE_REQUESTS_MANAGE: "owner_service_requests.manage",
```

#### 2e: Add permissions to `OPS_AGENT_PERMISSIONS` array

```typescript
// Add to the OPS_AGENT_PERMISSIONS array:
PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW,
PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE,
```

#### 2f: Add audit actions (in `AUDIT_ACTIONS` object)

```typescript
OWNER_SERVICE_REQUESTS_INSERT: "OWNER_SERVICE_REQUESTS_INSERT",
OWNER_SERVICE_REQUESTS_UPDATE: "OWNER_SERVICE_REQUESTS_UPDATE",
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 3: Register Audit Triggers for `owner_service_requests`

**File:** `convex/functions.ts`

Add `"owner_service_requests"` to the `AUDITED_TABLES` array. Find the existing array (around line 54) and add the new entry:

```typescript
const AUDITED_TABLES = [
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
  "roles",
  "user_role_assignments",
  "system_config",
  "tenant_inquiries",
  "owner_service_requests", // ← ADD THIS
];
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 4: Add Rate Limiter for Owner Service Request Submissions

**File:** `convex/rateLimiter.ts`

Add a new rate limiter entry for owner service request submissions. Use a fixed window (not token bucket) since owner submissions are less frequent:

```typescript
"public:owner_service_request": {
  kind: "fixed window",
  period: 60 * 60 * 1000, // 1 hour in ms
  rate: 3,
},
```

The key will be the owner's phone number (same pattern as existing rate limiters).

---

### Step 5: Backend — `convex/ownerServiceRequests.ts` (Full File)

**Create new file:** `convex/ownerServiceRequests.ts`

This is the core backend file. It contains ALL mutations and queries for the owner service request pipeline.

```typescript
import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  OWNER_SERVICE_REQUEST_STATUS,
  PERMISSIONS,
  type OwnerServiceRequestStatus,
} from "../lib/constants";
import { normalizePhone } from "../lib/validators";
import { requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./functions";
import { query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { rateLimiter } from "./rateLimiter";
```

#### 5a: State Machine Validation

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]: [
    OWNER_SERVICE_REQUEST_STATUS.CONTACTED,
    OWNER_SERVICE_REQUEST_STATUS.REJECTED,
  ],
  [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]: [
    OWNER_SERVICE_REQUEST_STATUS.ONBOARDED,
    OWNER_SERVICE_REQUEST_STATUS.DROPPED,
  ],
  [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]: [OWNER_SERVICE_REQUEST_STATUS.ACTIVE],
  // Terminal states: REJECTED, DROPPED, ACTIVE — no outgoing transitions
};

export function validateOwnerServiceRequestTransition(
  currentStatus: string,
  newStatus: string,
): boolean {
  return (VALID_TRANSITIONS[currentStatus] ?? []).includes(newStatus);
}
```

#### 5b: `submit` Mutation (Public — No Auth)

```typescript
export const submit = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    property_type: v.optional(v.string()),
    location: v.optional(v.string()),
    property_value: v.optional(v.number()), // paise
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // NO auth check — public submission

    // Validate and normalize phone
    const phone = args.phone.replace(/\D/g, "");
    if (phone.length !== 10) {
      throw new Error("Phone must be exactly 10 digits");
    }

    // Validate name
    const name = args.name.trim();
    if (name.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }

    // Rate limit: 3 per hour per phone (fixed window)
    const { ok } = await rateLimiter.limit(ctx, "public:owner_service_request", {
      key: phone,
      throws: false,
    });
    if (!ok) {
      throw new Error("Too many requests. Please try again later.");
    }

    return await ctx.db.insert("owner_service_requests", {
      name,
      phone,
      email: args.email?.trim() || undefined,
      property_type: args.property_type?.trim() || undefined,
      location: args.location?.trim() || undefined,
      property_value: args.property_value,
      notes: args.notes?.trim() || undefined,
      status: OWNER_SERVICE_REQUEST_STATUS.SUBMITTED,
      ops_notes: undefined,
      assigned_admin_id: undefined,
      contacted_at: undefined,
      owner_user_id: undefined,
    });
  },
});
```

#### 5c: `updateStatus` Mutation (Admin — handles SUBMITTED→CONTACTED, SUBMITTED→REJECTED, CONTACTED→DROPPED)

**IMPORTANT**: This mutation does NOT handle CONTACTED→ONBOARDED. That transition is ONLY done via `createOwnerAccount` action → `onboardInternal`. This mutation also does NOT handle ONBOARDED→ACTIVE — that is done via `activate`.

```typescript
export const updateStatus = mutation({
  args: {
    id: v.id("owner_service_requests"),
    status: v.union(v.literal("CONTACTED"), v.literal("REJECTED"), v.literal("DROPPED")),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Owner service request not found");

    if (!validateOwnerServiceRequestTransition(request.status, args.status)) {
      throw new Error(`Cannot transition from ${request.status} to ${args.status}`);
    }

    // Reject and Drop require non-empty ops_notes
    if (
      (args.status === OWNER_SERVICE_REQUEST_STATUS.REJECTED ||
        args.status === OWNER_SERVICE_REQUEST_STATUS.DROPPED) &&
      (!args.ops_notes || args.ops_notes.trim().length === 0)
    ) {
      throw new Error("Ops notes are required when rejecting or dropping a request");
    }

    const patch: Partial<Doc<"owner_service_requests">> = {
      status: args.status,
    };

    if (args.ops_notes?.trim()) {
      patch.ops_notes = args.ops_notes.trim();
    }

    // Set contacted_at on first contact (only if not already set)
    if (args.status === OWNER_SERVICE_REQUEST_STATUS.CONTACTED && !request.contacted_at) {
      patch.contacted_at = Date.now();
      patch.assigned_admin_id = admin._id;
    }

    await ctx.db.patch(args.id, patch);
    return await ctx.db.get(args.id);
  },
});
```

#### 5d: `activate` Mutation (Admin — ONBOARDED→ACTIVE)

```typescript
export const activate = mutation({
  args: {
    id: v.id("owner_service_requests"),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Owner service request not found");

    if (
      !validateOwnerServiceRequestTransition(request.status, OWNER_SERVICE_REQUEST_STATUS.ACTIVE)
    ) {
      throw new Error(`Cannot activate request with status: ${request.status}`);
    }

    await ctx.db.patch(args.id, {
      status: OWNER_SERVICE_REQUEST_STATUS.ACTIVE,
      ops_notes: args.ops_notes?.trim() || request.ops_notes,
    });

    return await ctx.db.get(args.id);
  },
});
```

#### 5e: `onboardInternal` Internal Mutation (called ONLY by `createOwnerAccount` action)

```typescript
export const onboardInternal = internalMutation({
  args: {
    request_id: v.id("owner_service_requests"),
    owner_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.request_id);
    if (!request) throw new Error("Owner service request not found");

    if (
      !validateOwnerServiceRequestTransition(request.status, OWNER_SERVICE_REQUEST_STATUS.ONBOARDED)
    ) {
      throw new Error(
        `Cannot onboard request with status: ${request.status}. Must be CONTACTED first.`,
      );
    }

    await ctx.db.patch(args.request_id, {
      status: OWNER_SERVICE_REQUEST_STATUS.ONBOARDED,
      owner_user_id: args.owner_user_id,
    });
  },
});
```

#### 5f: `list` Query (Admin — paginated)

```typescript
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

    const requestsQuery = args.status
      ? ctx.db
          .query("owner_service_requests")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
      : ctx.db.query("owner_service_requests");

    const paginatedResults = await requestsQuery.order("desc").paginate(args.paginationOpts);

    const enriched = await Promise.all(
      paginatedResults.page.map(async (request) => {
        const assignedAdmin = request.assigned_admin_id
          ? await ctx.db.get(request.assigned_admin_id)
          : null;
        const ownerUser = request.owner_user_id ? await ctx.db.get(request.owner_user_id) : null;
        return {
          ...request,
          assigned_admin_name: assignedAdmin?.name ?? null,
          owner_workos_id: ownerUser?.workos_user_id ?? null,
        };
      }),
    );

    return {
      ...paginatedResults,
      page: enriched,
    } as PaginationResult<(typeof enriched)[number]>;
  },
});
```

#### 5g: `getById` Query (Admin)

```typescript
export const getById = query({
  args: {
    id: v.id("owner_service_requests"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Owner service request not found");

    const assignedAdmin = request.assigned_admin_id
      ? await ctx.db.get(request.assigned_admin_id)
      : null;
    const ownerUser = request.owner_user_id ? await ctx.db.get(request.owner_user_id) : null;

    return {
      ...request,
      assigned_admin_name: assignedAdmin?.name ?? null,
      owner_workos_id: ownerUser?.workos_user_id ?? null,
    };
  },
});
```

#### 5h: `getStatusCounts` Query (Admin)

```typescript
export const getStatusCounts = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

    const allRequests = await ctx.db.query("owner_service_requests").collect();

    const counts: Record<string, number> = {};
    for (const status of Object.values(OWNER_SERVICE_REQUEST_STATUS)) {
      counts[status] = 0;
    }
    for (const request of allRequests) {
      counts[request.status] = (counts[request.status] ?? 0) + 1;
    }

    return counts;
  },
});
```

#### 5i: `getSubmittedCount` Query (for admin sidebar badge)

```typescript
export const getSubmittedCount = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

    const submitted = await ctx.db
      .query("owner_service_requests")
      .withIndex("by_status", (q) => q.eq("status", OWNER_SERVICE_REQUEST_STATUS.SUBMITTED))
      .collect();

    return submitted.length;
  },
});
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 6: WorkOS Action — `createOwnerAccount`

**File:** `convex/actions/workos.ts` — Add new action at the end of the file

This action creates a WorkOS user account for an owner and transitions the request to ONBOARDED. It follows the exact same pattern as `createGuardAccount` but with key differences:

- Uses the owner's real email (NOT a synthetic email)
- Sets `emailVerified: true` (Google SSO — no password needed)
- Does NOT set a password
- Calls `onboardInternal` instead of a guard-specific mutation

```typescript
export const createOwnerAccount = action({
  args: {
    request_id: v.id("owner_service_requests"),
    owner_email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args): Promise<{ user_id: Id<"users">; workos_user_id: string }> => {
    // 1. Auth check — must have OWNER_SERVICE_REQUESTS_MANAGE permission
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // 2. Validate email format
    const email = args.owner_email.trim().toLowerCase();
    if (!email.includes("@")) {
      throw new Error("Invalid email address");
    }

    // 3. Validate name
    const name = args.name.trim();
    if (name.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }

    // 4. Get WorkOS API key from environment
    const workosApiKey = process.env.WORKOS_API_KEY;
    if (!workosApiKey) throw new Error("WORKOS_API_KEY not configured");

    const workosClientId = process.env.WORKOS_CLIENT_ID;
    if (!workosClientId) throw new Error("WORKOS_CLIENT_ID not configured");

    // 5. Create WorkOS user (real email, emailVerified: true, no password)
    let workosUserId: string;
    try {
      const response = await fetch("https://api.workos.com/user_management/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workosApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          first_name: name,
          email_verified: true,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        // Handle "user already exists" gracefully
        if (response.status === 409 || (errorBody as { code?: string }).code === "entity_exists") {
          // Fetch existing user by email
          const listResponse = await fetch(
            `https://api.workos.com/user_management/users?email=${encodeURIComponent(email)}`,
            {
              headers: { Authorization: `Bearer ${workosApiKey}` },
            },
          );
          if (!listResponse.ok) {
            throw new Error("Failed to fetch existing WorkOS user");
          }
          const listData = (await listResponse.json()) as {
            data: Array<{ id: string }>;
          };
          if (!listData.data[0]) {
            throw new Error("WorkOS user exists but could not be retrieved");
          }
          workosUserId = listData.data[0].id;
        } else {
          throw new Error(
            `WorkOS user creation failed: ${(errorBody as { message?: string }).message ?? response.statusText}`,
          );
        }
      } else {
        const userData = (await response.json()) as { id: string };
        workosUserId = userData.id;
      }
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to create WorkOS user");
    }

    // 6. Create Convex user record with user_type: "OWNER"
    const userId: Id<"users"> = await ctx.runMutation(
      internal.ownerServiceRequests.createOwnerUserInternal,
      {
        workos_user_id: workosUserId,
        name,
        email,
        request_id: args.request_id,
      },
    );

    return { user_id: userId, workos_user_id: workosUserId };
  },
});
```

**IMPORTANT**: The `createOwnerAccount` action calls TWO internal mutations:

1. `createOwnerUserInternal` — creates the Convex `users` record with `user_type: "OWNER"`
2. `onboardInternal` — transitions the request to ONBOARDED and links `owner_user_id`

Add `createOwnerUserInternal` to `convex/ownerServiceRequests.ts`:

```typescript
export const createOwnerUserInternal = internalMutation({
  args: {
    workos_user_id: v.string(),
    name: v.string(),
    email: v.string(),
    request_id: v.id("owner_service_requests"),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    // Check if user already exists (idempotent)
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", args.workos_user_id))
      .unique();

    if (existing) {
      // Already exists — still call onboardInternal to ensure status is updated
      await ctx.runMutation(internal.ownerServiceRequests.onboardInternal, {
        request_id: args.request_id,
        owner_user_id: existing._id,
      });
      return existing._id;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      workos_user_id: args.workos_user_id,
      name: args.name,
      email: args.email,
      phone: undefined,
      user_type: "OWNER",
      status: "ACTIVE",
      is_deleted: false,
    });

    // Transition request to ONBOARDED
    await ctx.runMutation(internal.ownerServiceRequests.onboardInternal, {
      request_id: args.request_id,
      owner_user_id: userId,
    });

    return userId;
  },
});
```

**Note on `ctx.runMutation` inside `internalMutation`**: In Convex, mutations cannot call other mutations via `ctx.runMutation`. Instead, call `onboardInternal` directly as a function call within `createOwnerUserInternal` by importing and calling it inline. Alternatively, merge the logic of `onboardInternal` directly into `createOwnerUserInternal`. The cleanest approach is to inline the onboard logic:

```typescript
export const createOwnerUserInternal = internalMutation({
  args: {
    workos_user_id: v.string(),
    name: v.string(),
    email: v.string(),
    request_id: v.id("owner_service_requests"),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    // Check if user already exists (idempotent)
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", args.workos_user_id))
      .unique();

    let userId: Id<"users">;

    if (existing) {
      userId = existing._id;
    } else {
      userId = await ctx.db.insert("users", {
        workos_user_id: args.workos_user_id,
        name: args.name,
        email: args.email,
        phone: undefined,
        user_type: "OWNER",
        status: "ACTIVE",
        is_deleted: false,
      });
    }

    // Inline onboard logic — transition request to ONBOARDED
    const request = await ctx.db.get(args.request_id);
    if (!request) throw new Error("Owner service request not found");

    if (
      !validateOwnerServiceRequestTransition(request.status, OWNER_SERVICE_REQUEST_STATUS.ONBOARDED)
    ) {
      throw new Error(
        `Cannot onboard request with status: ${request.status}. Must be CONTACTED first.`,
      );
    }

    await ctx.db.patch(args.request_id, {
      status: OWNER_SERVICE_REQUEST_STATUS.ONBOARDED,
      owner_user_id: userId,
    });

    return userId;
  },
});
```

**Update `createOwnerAccount` action to call `createOwnerUserInternal` only** (remove the separate `onboardInternal` call since it's now inlined):

```typescript
// In createOwnerAccount action, replace the two-step call with:
const userId: Id<"users"> = await ctx.runMutation(
  internal.ownerServiceRequests.createOwnerUserInternal,
  {
    workos_user_id: workosUserId,
    name,
    email,
    request_id: args.request_id,
  },
);
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 7: Public Page — Owner Services Landing Page

**Create new files:**

- `src/app/(public)/owner-services/page.tsx` — Main page (server component)
- `src/app/(public)/owner-services/owner-services-client.tsx` — Client wrapper with ConvexClientProvider
- `src/app/(public)/owner-services/owner-contact-form.tsx` — Contact form component

**CRITICAL**: The `(public)` layout does NOT include `ConvexClientProvider`. The contact form uses `useMutation` which requires Convex context. The `owner-services-client.tsx` wrapper must include its own `ConvexClientProvider`.

#### 7a: Main Page (`page.tsx`)

```typescript
import type { Metadata } from "next";
import { SectionContainer } from "@/components/public/animations/section-container";
import { SectionReveal } from "@/components/public/animations/section-reveal";
import { OwnerServicesClient } from "./owner-services-client";

export const metadata: Metadata = {
  title: "Owner Services | Rental Platform OS",
  description:
    "Let Rental Platform OS manage your property. Guaranteed rent, professional tenant screening, and hassle-free property management.",
};

export default function OwnerServicesPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 py-24 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 opacity-90" />
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <SectionReveal>
            <div className="mb-4 inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-1.5 text-sm text-indigo-300">
              Property Management Services
            </div>
            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Your Property, Our Expertise
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-slate-300 sm:text-xl">
              Rental Platform OS handles everything — tenant screening, rent collection, maintenance
              coordination, and legal documentation. You earn, we manage.
            </p>
          </SectionReveal>
        </div>
      </section>

      {/* Benefits Grid */}
      <SectionContainer>
        <SectionReveal>
          <div className="py-20">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-slate-900">
                Why Property Owners Choose Rental Platform OS
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Professional property management so you can focus on what matters.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map((benefit) => (
                <div
                  key={benefit.title}
                  className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-2xl">
                    {benefit.icon}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">{benefit.title}</h3>
                  <p className="text-sm text-slate-600">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionReveal>
      </SectionContainer>

      {/* Contact Form Section */}
      <section className="bg-slate-50 py-20">
        <SectionContainer>
          <SectionReveal>
            <div className="mx-auto max-w-2xl">
              <div className="mb-10 text-center">
                <h2 className="text-3xl font-bold text-slate-900">Get Started Today</h2>
                <p className="mt-4 text-lg text-slate-600">
                  Tell us about your property. Our team will contact you within 24 hours.
                </p>
              </div>
              <OwnerServicesClient />
            </div>
          </SectionReveal>
        </SectionContainer>
      </section>
    </main>
  );
}

const BENEFITS = [
  {
    icon: "💰",
    title: "Guaranteed Rent Collection",
    description:
      "We ensure timely rent collection every month. No more chasing tenants or dealing with late payments.",
  },
  {
    icon: "🔍",
    title: "Professional Tenant Screening",
    description:
      "Background checks, employment verification, and reference checks for every prospective tenant.",
  },
  {
    icon: "📋",
    title: "Legal & Documentation Support",
    description:
      "Rental agreements, police verification, and all legal paperwork handled by our expert team.",
  },
  {
    icon: "🔧",
    title: "24/7 Maintenance Coordination",
    description:
      "Dedicated maintenance team handles repairs and upkeep. Your property stays in top condition.",
  },
  {
    icon: "📊",
    title: "Transparent Pricing",
    description:
      "Simple, flat-fee management. No hidden charges. You always know exactly what you're paying.",
  },
  {
    icon: "📈",
    title: "Regular Property Reports",
    description:
      "Monthly reports on your property's performance, maintenance history, and tenant feedback.",
  },
];
```

#### 7b: Client Wrapper (`owner-services-client.tsx`)

This wrapper provides `ConvexClientProvider` context for the form component, since the public layout does not include it.

```typescript
"use client";

import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { OwnerContactForm } from "./owner-contact-form";

export function OwnerServicesClient() {
  return (
    <ConvexClientProvider>
      <OwnerContactForm />
    </ConvexClientProvider>
  );
}
```

**Note**: Check the actual path of `ConvexClientProvider` in your project. It may be at `@/app/providers`, `@/components/providers/convex-client-provider`, or similar. Look at `src/app/layout.tsx` to find the correct import path.

#### 7c: Contact Form (`owner-contact-form.tsx`)

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { rupeesToPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CheckCircle2 } from "lucide-react";

const ownerContactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  property_type: z.string().optional(),
  location: z.string().optional(),
  property_value_rupees: z.coerce
    .number()
    .positive("Property value must be positive")
    .optional()
    .or(z.literal("")),
  notes: z.string().optional(),
});

type OwnerContactFormValues = z.infer<typeof ownerContactSchema>;

const PROPERTY_TYPE_OPTIONS = [
  { label: "1 BHK", value: "1BHK" },
  { label: "2 BHK", value: "2BHK" },
  { label: "3 BHK", value: "3BHK" },
  { label: "Villa / Independent House", value: "Villa" },
  { label: "Other", value: "Other" },
];

export function OwnerContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const submitRequest = useMutation(api.ownerServiceRequests.submit);

  const form = useForm<OwnerContactFormValues>({
    resolver: zodResolver(ownerContactSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      property_type: undefined,
      location: "",
      property_value_rupees: undefined,
      notes: "",
    },
  });

  const onSubmit = async (data: OwnerContactFormValues) => {
    try {
      await submitRequest({
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        property_type: data.property_type || undefined,
        location: data.location || undefined,
        property_value:
          data.property_value_rupees && data.property_value_rupees !== ""
            ? rupeesToPaise(Number(data.property_value_rupees))
            : undefined,
        notes: data.notes || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (message.includes("Too many requests")) {
        toast.error("Too many requests. Please try again later.");
      } else {
        toast.error(message);
      }
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-green-100 bg-green-50 px-8 py-16 text-center">
        <CheckCircle2 className="mb-4 h-16 w-16 text-green-500" />
        <h3 className="mb-2 text-xl font-semibold text-slate-900">Request Submitted!</h3>
        <p className="text-slate-600">
          Thank you! Our team will contact you within 24 hours to discuss your property.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Full Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Rajesh Kumar" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Phone */}
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Mobile Number <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="9876543210" maxLength={10} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="rajesh@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Property Type */}
          <FormField
            control={form.control}
            name="property_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Property Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select property type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PROPERTY_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Location */}
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Property Location</FormLabel>
                <FormControl>
                  <Input placeholder="Society / Area name (e.g. Maplewood Gardens)" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Property Value */}
          <FormField
            control={form.control}
            name="property_value_rupees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estimated Property Value (₹)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="e.g. 5000000"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? undefined : e.target.value)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Additional Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Any additional details about your property or requirements..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Submitting..." : "Submit Request"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 8: Fix Public Header Nav — Update "Owner Services" Link

**File:** `src/components/public/header.tsx`

The `NAV_ITEMS` array currently has `{ label: "Owner Services", href: "/contact" }`. Update it to point to the new page:

Find the nav items array (search for `"Owner Services"`) and change the `href`:

```typescript
// Change from:
{ label: "Owner Services", href: "/contact" },

// To:
{ label: "Owner Services", href: "/owner-services" },
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 9: Admin Page — Owner Requests Queue

**Create new files:**

- `src/app/(admin)/admin/owner-requests/page.tsx` — Main page
- `src/app/(admin)/admin/owner-requests/components/request-status-tabs.tsx` — Status tabs
- `src/app/(admin)/admin/owner-requests/components/request-table.tsx` — Paginated table
- `src/app/(admin)/admin/owner-requests/components/request-detail-panel.tsx` — Side panel
- `src/app/(admin)/admin/owner-requests/components/contact-dialog.tsx` — Mark as contacted dialog
- `src/app/(admin)/admin/owner-requests/components/reject-dialog.tsx` — Rejection dialog
- `src/app/(admin)/admin/owner-requests/components/drop-dialog.tsx` — Drop dialog
- `src/app/(admin)/admin/owner-requests/components/onboard-dialog.tsx` — Onboard (create WorkOS account) dialog

#### 9a: Main Page (`page.tsx`)

Follow the EXACT pattern from `src/app/(admin)/admin/tenant-inquiries/page.tsx`:

```typescript
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { PERMISSIONS } from "@/lib/constants";
import { RequestStatusTabs } from "./components/request-status-tabs";
import { RequestTable } from "./components/request-table";
import { RequestDetailPanel } from "./components/request-detail-panel";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function OwnerRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "ALL";
  const selectedId = searchParams.get("id") as Id<"owner_service_requests"> | null;

  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.roles.getMyRoleAssignments,
    currentUser ? {} : "skip",
  );
  const permissionSet = new Set(
    roleAssignments?.flatMap((ra) => ra.permissions ?? []) ?? [],
  );

  const hasView = permissionSet.has(PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

  const statusCounts = useQuery(
    api.ownerServiceRequests.getStatusCounts,
    hasView ? {} : "skip",
  );

  const setStatus = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", status);
    params.delete("id");
    router.replace(`/admin/owner-requests?${params.toString()}`, { scroll: false });
  };

  const setSelectedId = (id: Id<"owner_service_requests"> | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set("id", id);
    } else {
      params.delete("id");
    }
    router.replace(`/admin/owner-requests?${params.toString()}`, { scroll: false });
  };

  if (!hasView) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        You do not have permission to view owner requests.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Owner Requests</h2>
        <p className="text-sm text-slate-600">
          Review property owner service requests, contact owners, and manage onboarding.
        </p>
      </div>

      {/* Status Tabs */}
      <div className="border-b border-slate-200 bg-white px-6">
        <RequestStatusTabs
          activeStatus={statusFilter}
          onStatusChange={setStatus}
          counts={statusCounts ?? {}}
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <RequestTable
            statusFilter={statusFilter === "ALL" ? undefined : statusFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {selectedId && (
          <div className="w-96 border-l border-slate-200 overflow-auto">
            <RequestDetailPanel
              requestId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

**URL params:**

```
/admin/owner-requests?status=SUBMITTED&id=REQUEST_ID
```

#### 9b: Status Tabs (`request-status-tabs.tsx`)

Tab order (matches the pipeline flow):

| Tab Label | Filter Value | Badge Color                       |
| --------- | ------------ | --------------------------------- |
| All       | `"ALL"`      | none                              |
| Submitted | `SUBMITTED`  | `bg-blue-100 text-blue-700`       |
| Contacted | `CONTACTED`  | `bg-indigo-100 text-indigo-700`   |
| Onboarded | `ONBOARDED`  | `bg-green-100 text-green-700`     |
| Active    | `ACTIVE`     | `bg-emerald-100 text-emerald-700` |

Terminal states (REJECTED, DROPPED) are NOT tabs — accessible via the "All" tab.

```typescript
"use client";

import { OWNER_SERVICE_REQUEST_STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Props = {
  activeStatus: string;
  onStatusChange: (status: string) => void;
  counts: Record<string, number>;
};

const TABS = [
  { label: "All", value: "ALL" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Contacted", value: "CONTACTED" },
  { label: "Onboarded", value: "ONBOARDED" },
  { label: "Active", value: "ACTIVE" },
];

export function RequestStatusTabs({ activeStatus, onStatusChange, counts }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto py-2">
      {TABS.map((tab) => {
        const count = tab.value === "ALL" ? undefined : (counts[tab.value] ?? 0);
        const isActive = activeStatus === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onStatusChange(tab.value)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {tab.label}
            {count !== undefined && count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  isActive
                    ? "bg-white/20 text-white"
                    : (OWNER_SERVICE_REQUEST_STATUS_COLORS[
                        tab.value as keyof typeof OWNER_SERVICE_REQUEST_STATUS_COLORS
                      ] ?? "bg-slate-100 text-slate-600"),
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

#### 9c: Request Table (`request-table.tsx`)

Use `usePaginatedQuery(api.ownerServiceRequests.list, { status: ... })` with "Load More" button.

```typescript
"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { OWNER_SERVICE_REQUEST_STATUS_COLORS, OWNER_SERVICE_REQUEST_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  statusFilter: string | undefined;
  selectedId: Id<"owner_service_requests"> | null;
  onSelect: (id: Id<"owner_service_requests">) => void;
};

export function RequestTable({ statusFilter, selectedId, onSelect }: Props) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.ownerServiceRequests.list,
    { status: statusFilter },
    { initialNumItems: 20 },
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-slate-400">
        <p className="text-sm">No owner requests found.</p>
      </div>
    );
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600">#</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Owner</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Property</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {results.map((request, idx) => (
            <tr
              key={request._id}
              onClick={() => onSelect(request._id)}
              className={cn(
                "cursor-pointer transition-colors hover:bg-slate-50",
                selectedId === request._id && "bg-blue-50 hover:bg-blue-50",
              )}
            >
              <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{request.name}</div>
                <div className="text-xs text-slate-500">+91 {request.phone}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {request.property_type ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {request.location ?? <span className="text-slate-400">—</span>}
              </td>
              <td className="px-4 py-3">
                <Badge
                  className={cn(
                    "text-xs font-medium",
                    OWNER_SERVICE_REQUEST_STATUS_COLORS[
                      request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_COLORS
                    ],
                  )}
                >
                  {OWNER_SERVICE_REQUEST_STATUS_LABELS[
                    request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_LABELS
                  ] ?? request.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-500">
                {new Date(request._creationTime).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {status === "CanLoadMore" && (
        <div className="flex justify-center p-4">
          <Button variant="outline" onClick={() => loadMore(20)}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
```

#### 9d: Request Detail Panel (`request-detail-panel.tsx`)

```typescript
"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  OWNER_SERVICE_REQUEST_STATUS,
  OWNER_SERVICE_REQUEST_STATUS_COLORS,
  OWNER_SERVICE_REQUEST_STATUS_LABELS,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";
import { formatINR } from "@/lib/money";
import { ContactDialog } from "./contact-dialog";
import { RejectDialog } from "./reject-dialog";
import { DropDialog } from "./drop-dialog";
import { OnboardDialog } from "./onboard-dialog";
import { cn } from "@/lib/utils";

type Props = {
  requestId: Id<"owner_service_requests">;
  onClose: () => void;
};

export function RequestDetailPanel({ requestId, onClose }: Props) {
  const request = useQuery(api.ownerServiceRequests.getById, { id: requestId });

  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDropDialog, setShowDropDialog] = useState(false);
  const [showOnboardDialog, setShowOnboardDialog] = useState(false);

  if (!request) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading...
      </div>
    );
  }

  const statusColor =
    OWNER_SERVICE_REQUEST_STATUS_COLORS[
      request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_COLORS
    ] ?? "bg-gray-100 text-gray-500";

  const statusLabel =
    OWNER_SERVICE_REQUEST_STATUS_LABELS[
      request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_LABELS
    ] ?? request.status;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs font-medium", statusColor)}>{statusLabel}</Badge>
          <span className="text-xs text-slate-400">
            {new Date(request._creationTime).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Owner Info */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Owner
          </h3>
          <div className="space-y-1">
            <p className="font-medium text-slate-900">{request.name}</p>
            <p className="text-sm text-slate-600">+91 {request.phone}</p>
            {request.email && (
              <p className="text-sm text-slate-600">{request.email}</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Property Info */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Property
          </h3>
          <div className="space-y-1 text-sm text-slate-700">
            {request.property_type && (
              <p>
                <span className="text-slate-500">Type:</span> {request.property_type}
              </p>
            )}
            {request.location && (
              <p>
                <span className="text-slate-500">Location:</span> {request.location}
              </p>
            )}
            {request.property_value && (
              <p>
                <span className="text-slate-500">Est. Value:</span>{" "}
                {formatINR(request.property_value)}
              </p>
            )}
            {!request.property_type && !request.location && !request.property_value && (
              <p className="text-slate-400">No property details provided.</p>
            )}
          </div>
        </div>

        {request.notes && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Notes from Owner
              </h3>
              <p className="text-sm text-slate-700">{request.notes}</p>
            </div>
          </>
        )}

        {/* Timeline */}
        {request.contacted_at && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Timeline
              </h3>
              <div className="space-y-1 text-sm text-slate-700">
                <p>
                  <span className="text-slate-500">Contacted:</span>{" "}
                  {new Date(request.contacted_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {request.assigned_admin_name && (
                    <span className="text-slate-400"> by {request.assigned_admin_name}</span>
                  )}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Ops Notes */}
        {request.ops_notes && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Internal Notes
              </h3>
              <p className="text-sm text-slate-700">{request.ops_notes}</p>
            </div>
          </>
        )}

        {/* WorkOS Account Info */}
        {request.owner_workos_id && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                WorkOS Account
              </h3>
              <p className="text-xs font-mono text-slate-500">{request.owner_workos_id}</p>
              <p className="mt-1 text-xs text-slate-400">
                Owner can sign in with Google using {request.email ?? "their email"}.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-slate-200 p-4 space-y-2">
        {request.status === OWNER_SERVICE_REQUEST_STATUS.SUBMITTED && (
          <>
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => setShowContactDialog(true)}
            >
              Mark as Contacted
            </Button>
            <Button
              variant="outline"
              className="w-full text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setShowRejectDialog(true)}
            >
              Reject
            </Button>
          </>
        )}

        {request.status === OWNER_SERVICE_REQUEST_STATUS.CONTACTED && (
          <>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setShowOnboardDialog(true)}
            >
              Onboard Owner
            </Button>
            <Button
              variant="outline"
              className="w-full text-slate-600"
              onClick={() => setShowDropDialog(true)}
            >
              Drop
            </Button>
          </>
        )}

        {request.status === OWNER_SERVICE_REQUEST_STATUS.ONBOARDED && (
          <ActivateButton requestId={requestId} />
        )}
      </div>

      {/* Dialogs */}
      <ContactDialog
        open={showContactDialog}
        onOpenChange={setShowContactDialog}
        requestId={requestId}
      />
      <RejectDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        requestId={requestId}
      />
      <DropDialog
        open={showDropDialog}
        onOpenChange={setShowDropDialog}
        requestId={requestId}
      />
      <OnboardDialog
        open={showOnboardDialog}
        onOpenChange={setShowOnboardDialog}
        requestId={requestId}
        ownerName={request.name}
        ownerEmail={request.email}
      />
    </div>
  );
}

function ActivateButton({ requestId }: { requestId: Id<"owner_service_requests"> }) {
  const activate = useMutation(api.ownerServiceRequests.activate);
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    setLoading(true);
    try {
      await activate({ id: requestId });
      toast.success("Owner activated successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate owner");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
      onClick={handleActivate}
      disabled={loading}
    >
      {loading ? "Activating..." : "Activate Owner"}
    </Button>
  );
}
```

Add missing imports to `request-detail-panel.tsx`:

```typescript
import { useMutation } from "convex/react";
import { toast } from "sonner";
```

#### 9e: Contact Dialog (`contact-dialog.tsx`)

```typescript
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
};

export function ContactDialog({ open, onOpenChange, requestId }: Props) {
  const [opsNotes, setOpsNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const updateStatus = useMutation(api.ownerServiceRequests.updateStatus);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await updateStatus({
        id: requestId,
        status: "CONTACTED",
        ops_notes: opsNotes || undefined,
      });
      toast.success("Owner marked as contacted.");
      onOpenChange(false);
      setOpsNotes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as Contacted</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="ops-notes">Internal Notes (optional)</Label>
            <Textarea
              id="ops-notes"
              placeholder="e.g. Called owner, interested in full management package..."
              value={opsNotes}
              onChange={(e) => setOpsNotes(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loading ? "Saving..." : "Mark as Contacted"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### 9f: Reject Dialog (`reject-dialog.tsx`)

```typescript
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
};

export function RejectDialog({ open, onOpenChange, requestId }: Props) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const updateStatus = useMutation(api.ownerServiceRequests.updateStatus);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }
    setLoading(true);
    try {
      await updateStatus({
        id: requestId,
        status: "REJECTED",
        ops_notes: reason.trim(),
      });
      toast.success("Request rejected.");
      onOpenChange(false);
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="reject-reason">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g. Property outside service area, owner not responsive..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
          >
            {loading ? "Rejecting..." : "Reject Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### 9g: Drop Dialog (`drop-dialog.tsx`)

```typescript
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
};

export function DropDialog({ open, onOpenChange, requestId }: Props) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const updateStatus = useMutation(api.ownerServiceRequests.updateStatus);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for dropping.");
      return;
    }
    setLoading(true);
    try {
      await updateStatus({
        id: requestId,
        status: "DROPPED",
        ops_notes: reason.trim(),
      });
      toast.success("Request dropped.");
      onOpenChange(false);
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to drop request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Drop Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-600">
            Dropping marks this owner as no longer being pursued after initial contact.
          </p>
          <div>
            <Label htmlFor="drop-reason">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="drop-reason"
              placeholder="e.g. Owner changed mind, not interested in management services..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="text-slate-700 border-slate-300"
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
          >
            {loading ? "Dropping..." : "Drop Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### 9h: Onboard Dialog (`onboard-dialog.tsx`)

This dialog collects the owner's email (if not already provided) and calls the `createOwnerAccount` action.

```typescript
"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
  ownerName: string;
  ownerEmail: string | undefined;
};

export function OnboardDialog({
  open,
  onOpenChange,
  requestId,
  ownerName,
  ownerEmail,
}: Props) {
  const [email, setEmail] = useState(ownerEmail ?? "");
  const [loading, setLoading] = useState(false);
  const createOwnerAccount = useAction(api.actions.workos.createOwnerAccount);

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Please provide a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await createOwnerAccount({
        request_id: requestId,
        owner_email: email.trim().toLowerCase(),
        name: ownerName,
      });
      toast.success("Owner account created successfully. They can now sign in with Google.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create owner account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Onboard Owner</DialogTitle>
          <DialogDescription>
            Create a WorkOS account for {ownerName}. They will be able to sign in with Google
            using this email address.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="owner-email">
              Owner Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="owner-email"
              type="email"
              placeholder="owner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-slate-500">
              The owner will use this email to sign in with Google.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !email.trim()}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? "Creating Account..." : "Create Owner Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 10: Admin Sidebar — Add Owner Requests Nav Item with Badge

**File:** `src/app/(admin)/admin-layout-client.tsx`

#### 10a: Add nav item

Add to the `adminNavItems` array (after "Inquiries" or after "Audit", before "Settings"):

```typescript
{
  label: "Owner Requests",
  href: "/admin/owner-requests",
  icon: Building2,  // from lucide-react
  available: true,
  requiredPermission: PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW,
},
```

Import `Building2` from `lucide-react`.

#### 10b: Add badge count

Follow the existing pattern for leads/inquiries badges:

```typescript
const hasOwnerRequestsView =
  roleAssignments !== undefined && permissionSet.has(PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

const submittedOwnerRequestsCount = useQuery(
  api.ownerServiceRequests.getSubmittedCount,
  hasOwnerRequestsView ? {} : "skip",
);
```

In the nav rendering, add badge count logic (same pattern as `inquiriesBadgeCount`):

```typescript
const ownerRequestsBadgeCount =
  item.href === "/admin/owner-requests" &&
  submittedOwnerRequestsCount !== undefined &&
  submittedOwnerRequestsCount > 0
    ? submittedOwnerRequestsCount
    : null;
```

Badge color: red (same as leads — `bg-red-100 text-red-700`).

Add `ownerRequestsBadgeCount` to the `navBadgeCount` resolution chain and `usesRedBadge` check.

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 11: Add `owner_service_requests` to Seed Roles

**File:** `convex/seed.ts`

If the seed script defines the `Super Admin` role with `ALL_PERMISSIONS`, no change is needed (it picks up the new permissions automatically).

If `Ops Agent` role permissions are explicitly listed, add the two new permissions:

```typescript
PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW,
PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE,
```

Check the seed file and add if necessary. The `OPS_AGENT_PERMISSIONS` array in `lib/constants.ts` already includes them (from Step 2e), so if the seed reads from that array, it's automatic.

---

## Hard Constraints (MUST follow — violations are blocking)

1. **No `as any`, `@ts-ignore`, `@ts-expect-error`** — ever. Fix type errors properly.
2. **Money is always paise** — `formatINR(request.property_value)` for display. NEVER divide by 100 manually. Use `rupeesToPaise()` from `lib/money.ts` when converting user input (₹) to storage (paise). Use `formatINR()` for display.
3. **No i18n on admin or public pages** — English only. No `NextIntlClientProvider`. No `useTranslations`.
4. **No native HTML form elements** — use shadcn/ui `<Input>`, `<Textarea>`, `<Select>`, etc.
5. **sonner for toasts** — all user feedback via `toast.success()` / `toast.error()`.
6. **lucide-react for all icons** — no other icon libraries.
7. **`react-hook-form` + `zod`** for all forms — owner contact form, contact dialog, reject dialog, drop dialog, onboard dialog.
8. **Audited mutations use `mutation` from `./functions`** — NOT from `_generated/server`. Queries use `query` from `_generated/server`. Internal mutations use `internalMutation` from `./functions`.
9. **State machine transitions are enforced in backend** — every mutation validates the transition with `validateOwnerServiceRequestTransition()`. The UI should also only show valid action buttons, but the backend is the source of truth.
10. **CONTACTED→ONBOARDED transition is ONLY via `createOwnerAccount` action** — NOT via `updateStatus`. The `updateStatus` mutation explicitly does NOT accept `"ONBOARDED"` as a target status.
11. **Reject and Drop require non-empty `ops_notes`** — enforced in `updateStatus` backend mutation. UI dialogs also validate before submitting.
12. **Contact `ops_notes` is optional** — the `updateStatus` mutation for CONTACTED does NOT require ops_notes.
13. **`contacted_at` is set on SUBMITTED→CONTACTED only if not already set** — idempotent.
14. **No owner auth in V1** — the `submit` mutation has NO auth check. Owner name/phone are stored directly on the `owner_service_requests` record.
15. **Rate limiting on public submission** — 3 requests per hour per phone number (fixed window). Use the existing rate limiter pattern from `convex/rateLimiter.ts`.
16. **Duplicate phones allowed** — no uniqueness check on phone. Admin handles duplicates manually.
17. **Public layout has NO ConvexClientProvider** — the `owner-services-client.tsx` wrapper MUST include its own `ConvexClientProvider`. Do NOT modify the public layout.
18. **`createOwnerAccount` uses real email** — NOT a synthetic email like guards. Owner email is their actual Google account email.
19. **`emailVerified: true` in WorkOS** — owner accounts are created with `email_verified: true` so they can sign in with Google immediately.
20. **No password for owner WorkOS accounts** — owners sign in via Google SSO only. Do NOT set a password.
21. **URL params are source of truth** for admin page filters — same pattern as leads/inquiries pages.
22. **`router.replace()` with `{ scroll: false }`** for filter changes.
23. **`onboardInternal` logic is inlined into `createOwnerUserInternal`** — do NOT use `ctx.runMutation` inside a mutation to call another mutation. Inline the logic directly.
24. **`owner_service_requests` is in `AUDITED_TABLES`** — all inserts and updates are automatically audit-logged.

---

## Owner Service Request Status Display Labels

| Enum Value  | Display Label | Badge Colors                      |
| ----------- | ------------- | --------------------------------- |
| `SUBMITTED` | Submitted     | `bg-blue-100 text-blue-700`       |
| `CONTACTED` | Contacted     | `bg-indigo-100 text-indigo-700`   |
| `ONBOARDED` | Onboarded     | `bg-green-100 text-green-700`     |
| `ACTIVE`    | Active        | `bg-emerald-100 text-emerald-700` |
| `REJECTED`  | Rejected      | `bg-red-100 text-red-700`         |
| `DROPPED`   | Dropped       | `bg-gray-100 text-gray-500`       |

---

## File Inventory (Expected Deliverables)

### New Files

| File                                                                       | Type      | Purpose                                                    |
| -------------------------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| `convex/ownerServiceRequests.ts`                                           | Backend   | All mutations + queries for owner service request pipeline |
| `src/app/(public)/owner-services/page.tsx`                                 | Page      | Public owner services landing page                         |
| `src/app/(public)/owner-services/owner-services-client.tsx`                | Component | ConvexClientProvider wrapper for the form                  |
| `src/app/(public)/owner-services/owner-contact-form.tsx`                   | Component | Owner contact form (react-hook-form + zod)                 |
| `src/app/(admin)/admin/owner-requests/page.tsx`                            | Page      | Admin owner requests queue                                 |
| `src/app/(admin)/admin/owner-requests/components/request-status-tabs.tsx`  | Component | Status tabs with counts                                    |
| `src/app/(admin)/admin/owner-requests/components/request-table.tsx`        | Component | Paginated request table                                    |
| `src/app/(admin)/admin/owner-requests/components/request-detail-panel.tsx` | Component | Side panel with request details + actions                  |
| `src/app/(admin)/admin/owner-requests/components/contact-dialog.tsx`       | Component | Mark as contacted dialog                                   |
| `src/app/(admin)/admin/owner-requests/components/reject-dialog.tsx`        | Component | Rejection reason dialog                                    |
| `src/app/(admin)/admin/owner-requests/components/drop-dialog.tsx`          | Component | Drop reason dialog                                         |
| `src/app/(admin)/admin/owner-requests/components/onboard-dialog.tsx`       | Component | Create WorkOS owner account dialog                         |

### Modified Files

| File                                      | Change                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `convex/schema.ts`                        | Add `owner_service_requests` table, `ownerServiceRequestStatusValidator`, audit actions |
| `convex/actions/workos.ts`                | Add `createOwnerAccount` action                                                         |
| `convex/functions.ts`                     | Add `"owner_service_requests"` to `AUDITED_TABLES`                                      |
| `convex/rateLimiter.ts`                   | Add `public:owner_service_request` rate limiter (fixed window, 3/hour)                  |
| `lib/constants.ts`                        | Add `OWNER_SERVICE_REQUEST_STATUS`, colors, labels, permissions, audit actions          |
| `src/components/public/header.tsx`        | Update "Owner Services" nav href from `/contact` to `/owner-services`                   |
| `src/app/(admin)/admin-layout-client.tsx` | Add "Owner Requests" nav item with badge count                                          |

### Deleted Files

None.

---

## Verification Checklist

```bash
# 1. TypeScript — must be clean
npx tsc --noEmit

# 2. Build — must succeed
npm run build

# 3. Manual checks (if dev server is running):

# PUBLIC SIDE:
# - Navigate to /owner-services — page loads with hero, benefits grid, contact form
# - Header "Owner Services" link navigates to /owner-services (not /contact)
# - Fill out contact form with name + phone → submit → success state shown
# - Submit 4x rapidly with same phone → rate limit error toast
# - Submit with invalid phone (< 10 digits) → validation error shown
# - Submit with invalid email → validation error shown
# - Property type Select works (1BHK, 2BHK, 3BHK, Villa, Other)
# - Property value field accepts numbers, converts to paise on submit

# ADMIN SIDE:
# - Sidebar shows "Owner Requests" nav item with badge count (red badge)
# - /admin/owner-requests loads with status tabs
# - SUBMITTED tab shows the submitted request
# - Click request → detail panel opens on right
# - Detail panel shows owner name, phone, email, property details
# - Click "Mark as Contacted" → contact dialog opens → submit → status becomes CONTACTED
# - Click "Reject" → reject dialog opens → requires reason → submit → status becomes REJECTED
# - For CONTACTED request: "Onboard Owner" button visible
# - Click "Onboard Owner" → onboard dialog opens with email pre-filled
# - Submit onboard → WorkOS account created → status becomes ONBOARDED
# - For ONBOARDED request: "Activate Owner" button visible
# - Click "Activate Owner" → status becomes ACTIVE
# - For CONTACTED request: "Drop" button visible → requires reason → status becomes DROPPED

# FULL PIPELINE:
# 1. Owner submits form on /owner-services → SUBMITTED
# 2. Admin marks as contacted → CONTACTED
# 3. Admin onboards (creates WorkOS account) → ONBOARDED
# 4. Admin activates → ACTIVE

# EDGE CASES:
# - Onboard dialog: if owner has no email, field is empty and required
# - Onboard dialog: if WorkOS user already exists with that email, handles gracefully
# - Drop/Reject without reason → backend throws error, toast shown
# - Transition validation: cannot go SUBMITTED→ONBOARDED directly (backend rejects)
```

---

## Performance Notes

- `useQuery(api.ownerServiceRequests.list)` creates a **real-time subscription** — when admin contacts an owner, the table updates instantly.
- `getStatusCounts` reads all requests on each call. At V1 scale (<200 requests), this is fine. If scale grows, switch to `@convex-dev/aggregate` component (same pattern as leads).
- `getSubmittedCount` for sidebar badge uses the `by_status` index — efficient.
- The `createOwnerAccount` action makes an external HTTP call to WorkOS API. This is a Convex Action (not mutation) — correct pattern for external API calls.
- `owner_service_requests` has `by_status` and `by_phone` indexes. The `by_phone` index enables future duplicate detection queries.

---

## PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE)

You MUST make tool calls in parallel whenever the calls are independent. This is the single biggest performance optimization available to you.

- **Reading multiple files?** Call Read on ALL of them in ONE message.
- **Searching for multiple patterns?** Fire ALL Grep/Glob calls in ONE message.
- **Multiple independent edits?** Make ALL Edit calls in ONE message.

SEQUENTIAL tool calls are ONLY acceptable when Call B depends on the RESULT of Call A.

**WRONG (sequential — wastes 5x the time):**

Message 1: Read file A → wait
Message 2: Read file B → wait
Message 3: Read file C → wait

**CORRECT (parallel — all resolve in one round-trip):**

Message 1: Read file A + Read file B + Read file C → wait once

This applies to ALL tool types: Read, Grep, Glob, Edit, Bash, LSP diagnostics, etc. Before every message, ask yourself: "Are any of these calls independent?" If yes, batch them.
