# Phase 18 Implementation Prompt: Tenant Inquiry Pipeline

> **FIRST STEP**: Read `AGENTS.md` in the project root. It contains the full project context — tech stack, personas, conventions, dev environment, routing rules, test accounts, and file structure. Do this before any other work.
>
> This project uses Claude Code (NOT Claude Code). Skills live in `.opencode/skills/`. Load skills via `load_skills=["skill-name"]`.

---

## Scope

**Deliver**: A full tenant inquiry pipeline — from a tenant requesting a visit on a published listing, through admin review and bounty posting, to guard acceptance and visit execution. Three UIs: (1) tenant visit request form on the listing detail page contact sidebar, (2) admin inquiry queue at `/admin/tenant-inquiries`, (3) guard bounty board at `/guard/bounties`. New `tenant_inquiries` table with 10-status state machine. New `convex/tenantInquiries.ts` with 8 mutations + 4 queries. New constants, permissions, and schema validators.

**This is a SEPARATE pipeline from the guard lead pipeline.** Guard leads are supply-side (guard discovers vacant flat → submits lead → admin verifies → listing created). Tenant inquiries are demand-side (tenant browses existing listing → requests visit → admin posts bounty → guard does showing).

**Does NOT include** (out of scope — do NOT implement):

- Rent negotiation engine (Phase 23/P26 — this phase stubs `NEGOTIATION_INITIATED` status only, no negotiation tables or UI)
- `tenant_profiles` table (not needed for V1 — visit requests are public/anonymous)
- `TENANT`/`OWNER` user types on the `users` table (not needed for V1 — submission is unauthenticated)
- `requireTenant()` auth helper (not needed for V1)
- Tenant "My Inquiries" status tracking page (V2 — requires tenant auth)
- Tenant self-serve reschedule/cancel (V2)
- Auto-assignment of guards to bounties (V2 — guards self-select)
- Bounty expiry cron job (V2 — admin manually expires for now)
- Push notifications for new bounties or status changes (V2)
- Guard i18n for bounty board (add translation keys to messages/\*.json but do NOT translate bounty board in this phase — use English hardcoded, translation deferred)

---

## V1 Simplifications (IMPORTANT — Read Before Implementing)

The feature spec (`notes/features/13-tenant-inquiry.md`) describes the full vision. For V1, we simplify:

| Feature                    | Spec Says                                         | V1 Implementation                                                                                                                                                             |
| -------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tenant auth**            | Requires Google Sign-In + `tenant_profiles` table | **No auth** — visit request is public (like existing contact form). `tenant_name` + `tenant_phone` + `tenant_email` fields on the inquiry itself. No `tenant_id` foreign key. |
| **User types**             | Adds `TENANT`/`OWNER` to `userTypeValidator`      | **Not in V1** — schema stays with `GUARD`/`ADMIN` only. Forward-compatible: `tenant_id` field on `tenant_inquiries` is optional for future.                                   |
| **Bounty expiry**          | Cron job checks and expires unclaimed bounties    | **Manual only** — admin clicks "Expire" button. No cron.                                                                                                                      |
| **Negotiation**            | Full negotiation engine after INTERESTED visit    | **Status stub only** — `NEGOTIATION_INITIATED` exists in state machine but no negotiation tables or UI. Admin can transition to it; it just acts as a pre-close state.        |
| **Visit creation**         | Auto-creates `visits` record when VISIT_SCHEDULED | **Yes, implemented** — when admin schedules visit, a real `visits` record is created. New `tenant_inquiry_id` field added to `visits` table.                                  |
| **Tenant status tracking** | Tenant can see inquiry status in portal           | **Not in V1** — tenant gets a toast "submitted" and that's it. No tracking page.                                                                                              |
| **Guard filtering**        | Guards see bounties for their society only        | **Yes, implemented** — filter by guard's `guard_profiles.society_id`.                                                                                                         |
| **Rate limiting**          | Rate limit visit request submissions              | **Yes** — reuse existing pattern. 5 requests per hour per phone number.                                                                                                       |

**Why no tenant auth for V1**: The current listing detail page already has a public contact form (name + phone + message). The visit request form extends this with preferred date/time. Adding Google SSO auth-gating would block the entire flow on a tenant auth system that doesn't exist yet. V1 captures the demand funnel; V2 adds auth.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ Convex Backend                                                        │
│                                                                       │
│  NEW: convex/tenantInquiries.ts                                       │
│  ├── submit()          — public, no auth, rate-limited               │
│  ├── review()          — requirePermission(TENANT_INQUIRIES_REVIEW)  │
│  ├── reject()          — requirePermission(TENANT_INQUIRIES_REVIEW)  │
│  ├── postBounty()      — requirePermission(TENANT_INQUIRIES_REVIEW)  │
│  ├── acceptBounty()    — requireGuard()                              │
│  ├── scheduleVisit()   — requirePermission(TENANT_INQUIRIES_REVIEW)  │
│  ├── completeVisit()   — NO DIRECT CALL — synced via visits.complete │
│  ├── expire()          — requirePermission(TENANT_INQUIRIES_REVIEW)  │
│  ├── close()           — requirePermission(TENANT_INQUIRIES_REVIEW)  │
│  ├── list()            — requirePermission(TENANT_INQUIRIES_VIEW)    │
│  ├── getById()         — requirePermission(TENANT_INQUIRIES_VIEW)    │
│  ├── getStatusCounts() — requirePermission(TENANT_INQUIRIES_VIEW)    │
│  └── listBounties()    — requireGuard() + society filter             │
│                                                                       │
│  MODIFIED: convex/schema.ts — add tenant_inquiries table             │
│  MODIFIED: convex/visits.ts — add tenant_inquiry_id field            │
│  MODIFIED: lib/constants.ts — add TENANT_INQUIRY_STATUS + perms      │
└─────────────────────┬─────────────────────────────────────────────────┘
                      │ useQuery / useMutation
┌─────────────────────▼─────────────────────────────────────────────────┐
│                                                                       │
│  TENANT: /listing/[slug] — Extended contact sidebar                   │
│  ├── New "Request Visit" tab in contact sidebar                       │
│  ├── Fields: name, phone, email, preferred date, time slot, message  │
│  └── Submits via tenantInquiries.submit()                            │
│                                                                       │
│  ADMIN: /admin/tenant-inquiries — Inquiry queue page                  │
│  ├── Status tabs with counts (SUBMITTED, REVIEWED, BOUNTY, etc.)     │
│  ├── Paginated table with filters                                    │
│  ├── Side panel with inquiry detail + actions                        │
│  ├── Review dialog, Reject dialog, Post Bounty dialog                │
│  ├── Schedule Visit dialog (creates visits record)                   │
│  └── Close/Expire actions                                            │
│                                                                       │
│  GUARD: /guard/bounties — Bounty board page                          │
│  ├── "Available" tab — BOUNTY_POSTED in guard's society              │
│  ├── "My Accepted" tab — guard's claimed bounties + status           │
│  ├── Bounty cards with listing info + amount + expiry                │
│  └── Accept confirmation dialog                                      │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## State Machine (10 Statuses)

```
     ┌───────────┐
     │ SUBMITTED │  ← Tenant submits visit request on listing
     └─────┬─────┘
           │
      ┌────┼────────┐
      │             │
      ▼             ▼
┌──────────┐   ┌──────────┐
│ REVIEWED │   │ REJECTED │
└────┬─────┘   └──────────┘
     │          (terminal)
     │
     ├────────────────┐
     │                │
     ▼                ▼
┌──────────────┐  ┌──────────┐
│ BOUNTY_POSTED│  │ REJECTED │
└──────┬───────┘  └──────────┘
       │
  ┌────┼────────┐
  │             │
  ▼             ▼
┌────────────────┐  ┌─────────┐
│ GUARD_ACCEPTED │  │ EXPIRED │
└───────┬────────┘  └─────────┘
        │             (terminal)
        ▼
┌─────────────────┐
│ VISIT_SCHEDULED │
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│ VISIT_COMPLETED │
└───────┬─────────┘
        │
   ┌────┼──────────────────────────┐
   │                               │
   ▼                               ▼
┌────────┐          ┌──────────────────────┐
│ CLOSED │          │ NEGOTIATION_INITIATED │  ← Stub only (V1)
└────────┘          └──────────┬───────────┘
 (terminal)                    │
                               ▼
                          ┌────────┐
                          │ CLOSED │
                          └────────┘
                           (terminal)
```

### Transition Table (EXHAUSTIVE — implement exactly this)

```typescript
const VALID_TENANT_INQUIRY_TRANSITIONS: Record<string, string[]> = {
  [TENANT_INQUIRY_STATUS.SUBMITTED]: [
    TENANT_INQUIRY_STATUS.REVIEWED,
    TENANT_INQUIRY_STATUS.REJECTED,
  ],
  [TENANT_INQUIRY_STATUS.REVIEWED]: [
    TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
    TENANT_INQUIRY_STATUS.REJECTED,
  ],
  [TENANT_INQUIRY_STATUS.BOUNTY_POSTED]: [
    TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
    TENANT_INQUIRY_STATUS.EXPIRED,
  ],
  [TENANT_INQUIRY_STATUS.GUARD_ACCEPTED]: [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED],
  [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED]: [TENANT_INQUIRY_STATUS.VISIT_COMPLETED],
  [TENANT_INQUIRY_STATUS.VISIT_COMPLETED]: [
    TENANT_INQUIRY_STATUS.CLOSED,
    TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
  ],
  [TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED]: [TENANT_INQUIRY_STATUS.CLOSED],
  // Terminal states: REJECTED, EXPIRED, CLOSED — no outgoing transitions
};

export function validateTenantInquiryTransition(currentStatus: string, newStatus: string): boolean {
  return (VALID_TENANT_INQUIRY_TRANSITIONS[currentStatus] ?? []).includes(newStatus);
}
```

---

## Existing Patterns to Follow (File References)

Read these files to understand existing conventions before implementing:

| Pattern                          | Reference File                                                 | What to Copy                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Mutation with audit triggers** | `convex/functions.ts` (lines 1-100)                            | Use `mutation` from `./functions` (NOT from `_generated/server`) for audited mutations. Use `query` from `_generated/server` for queries. |
| **Auth helpers**                 | `convex/auth.helpers.ts`                                       | `requireGuard()`, `requireAdmin()`, `requirePermission()` patterns                                                                        |
| **Visit creation**               | `convex/visits.ts` (`create` mutation, line 196)               | How to create a `visits` record with `ensureActiveGuardInSociety` check                                                                   |
| **Visit completion sync**        | `convex/visits.ts` (`complete` mutation, line 546)             | Where to add tenant inquiry status sync hook                                                                                              |
| **Status validation**            | `convex/visits.ts` (`validateVisitTransition`, line 177)       | Transition table pattern for state machine                                                                                                |
| **Constants + colors**           | `lib/constants.ts` (lines 1-460)                               | Enum pattern, color map pattern, permissions pattern                                                                                      |
| **Schema validators**            | `convex/schema.ts` (lines 1-210)                               | Validator union pattern                                                                                                                   |
| **Admin list page**              | `src/app/(admin)/admin/leads/page.tsx`                         | URL-driven tabs, filters, side panel, permission check                                                                                    |
| **Admin sidebar nav**            | `src/app/(admin)/admin-layout-client.tsx` (lines 40-126)       | Nav items with badge counts, permission-gated visibility                                                                                  |
| **Admin detail panel**           | `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` | Side panel pattern                                                                                                                        |
| **Guard bottom nav**             | `src/app/(guard)/guard-layout-client.tsx` (lines 158-184)      | Guard nav items with i18n labels                                                                                                          |
| **Contact sidebar**              | `src/app/listing/[slug]/components/contact-sidebar.tsx`        | Current form structure, Sheet pattern, WhatsApp/phone buttons                                                                             |
| **Guard portal pages**           | `src/app/(guard)/guard/visits/page.tsx`                        | Guard page with `requireGuard` and visit cards                                                                                            |
| **Rate limiter**                 | `convex/rateLimiter.ts`                                        | Existing rate limiter configuration                                                                                                       |
| **Paginated query**              | `convex/leads.ts` (`list` query)                               | `paginationOptsValidator` + enrichment pattern                                                                                            |

---

## Implementation Order

Execute in this exact order. Each step builds on the previous.

---

### Step 1: Schema Changes — Add `tenant_inquiries` Table + Modify `visits`

**File:** `convex/schema.ts`

#### 1a: Add `tenantInquiryStatusValidator` (after `listingInquirySourceValidator`, around line 101)

```typescript
const tenantInquiryStatusValidator = v.union(
  v.literal("SUBMITTED"),
  v.literal("REVIEWED"),
  v.literal("BOUNTY_POSTED"),
  v.literal("GUARD_ACCEPTED"),
  v.literal("VISIT_SCHEDULED"),
  v.literal("VISIT_COMPLETED"),
  v.literal("NEGOTIATION_INITIATED"),
  v.literal("CLOSED"),
  v.literal("REJECTED"),
  v.literal("EXPIRED"),
);
```

#### 1b: Add `tenant_inquiries` table (after `listing_inquiries`, around line 452)

```typescript
tenant_inquiries: defineTable({
  listing_id: v.id("listings"),
  tenant_name: v.string(),
  tenant_phone: v.string(),
  tenant_email: v.optional(v.string()),
  preferred_visit_date: v.optional(v.number()),
  preferred_visit_slot: v.optional(v.string()),
  message: v.optional(v.string()),
  status: tenantInquiryStatusValidator,
  bounty_amount: v.optional(v.number()),
  bounty_posted_at: v.optional(v.number()),
  bounty_expires_at: v.optional(v.number()),
  assigned_guard_id: v.optional(v.id("users")),
  visit_id: v.optional(v.id("visits")),
  ops_notes: v.optional(v.string()),
  rejection_reason: v.optional(v.string()),
  reviewed_by_admin_id: v.optional(v.id("users")),
})
  .index("by_status", ["status"])
  .index("by_listing_id", ["listing_id"])
  .index("by_assigned_guard_id", ["assigned_guard_id"])
  .index("by_tenant_phone", ["tenant_phone"]),
```

#### 1c: Add `tenant_inquiry_id` to `visits` table

Add a new optional field to the existing `visits` table definition:

```typescript
// In the visits defineTable, add after needs_reassignment:
tenant_inquiry_id: v.optional(v.id("tenant_inquiries")),
```

#### 1d: Add audit actions for tenant inquiries

Add to the `auditActionValidator` union (around line 156):

```typescript
v.literal("TENANT_INQUIRIES_INSERT"),
v.literal("TENANT_INQUIRIES_UPDATE"),
```

#### 1e: Add `tenant_bounty_default_amount` and `tenant_bounty_default_expiry_days` to `systemConfigKeyValidator`

Add to the `systemConfigKeyValidator` union (around line 188):

```typescript
v.literal("tenant_bounty_default_amount"),
v.literal("tenant_bounty_default_expiry_days"),
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 2: Constants — Add Tenant Inquiry Status, Colors, Labels, Permissions

**File:** `lib/constants.ts`

#### 2a: Add `TENANT_INQUIRY_STATUS` enum (after `INQUIRY_SOURCE`, around line 198)

```typescript
export const TENANT_INQUIRY_STATUS = {
  SUBMITTED: "SUBMITTED",
  REVIEWED: "REVIEWED",
  BOUNTY_POSTED: "BOUNTY_POSTED",
  GUARD_ACCEPTED: "GUARD_ACCEPTED",
  VISIT_SCHEDULED: "VISIT_SCHEDULED",
  VISIT_COMPLETED: "VISIT_COMPLETED",
  NEGOTIATION_INITIATED: "NEGOTIATION_INITIATED",
  CLOSED: "CLOSED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
} as const satisfies Record<string, string>;

export type TenantInquiryStatus =
  (typeof TENANT_INQUIRY_STATUS)[keyof typeof TENANT_INQUIRY_STATUS];
```

#### 2b: Add `TENANT_INQUIRY_STATUS_COLORS` (after other color maps, around line 458)

```typescript
export const TENANT_INQUIRY_STATUS_COLORS = {
  [TENANT_INQUIRY_STATUS.SUBMITTED]: "bg-blue-100 text-blue-700",
  [TENANT_INQUIRY_STATUS.REVIEWED]: "bg-indigo-100 text-indigo-700",
  [TENANT_INQUIRY_STATUS.BOUNTY_POSTED]: "bg-amber-100 text-amber-700",
  [TENANT_INQUIRY_STATUS.GUARD_ACCEPTED]: "bg-cyan-100 text-cyan-700",
  [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED]: "bg-purple-100 text-purple-700",
  [TENANT_INQUIRY_STATUS.VISIT_COMPLETED]: "bg-green-100 text-green-700",
  [TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED]: "bg-orange-100 text-orange-700",
  [TENANT_INQUIRY_STATUS.CLOSED]: "bg-gray-100 text-gray-500",
  [TENANT_INQUIRY_STATUS.REJECTED]: "bg-red-100 text-red-700",
  [TENANT_INQUIRY_STATUS.EXPIRED]: "bg-gray-100 text-gray-400",
} as const satisfies Record<TenantInquiryStatus, string>;
```

#### 2c: Add `TENANT_INQUIRY_STATUS_LABELS` (display labels for UI)

```typescript
export const TENANT_INQUIRY_STATUS_LABELS: Record<TenantInquiryStatus, string> = {
  [TENANT_INQUIRY_STATUS.SUBMITTED]: "Submitted",
  [TENANT_INQUIRY_STATUS.REVIEWED]: "Reviewed",
  [TENANT_INQUIRY_STATUS.BOUNTY_POSTED]: "Bounty Posted",
  [TENANT_INQUIRY_STATUS.GUARD_ACCEPTED]: "Guard Accepted",
  [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED]: "Visit Scheduled",
  [TENANT_INQUIRY_STATUS.VISIT_COMPLETED]: "Visit Completed",
  [TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED]: "Negotiation",
  [TENANT_INQUIRY_STATUS.CLOSED]: "Closed",
  [TENANT_INQUIRY_STATUS.REJECTED]: "Rejected",
  [TENANT_INQUIRY_STATUS.EXPIRED]: "Expired",
};
```

#### 2d: Add permissions (in `PERMISSIONS` object, after `AUDIT_VIEW`)

```typescript
TENANT_INQUIRIES_VIEW: "tenant_inquiries.view",
TENANT_INQUIRIES_REVIEW: "tenant_inquiries.review",
```

#### 2e: Add permissions to `OPS_AGENT_PERMISSIONS` array

```typescript
// Add to the OPS_AGENT_PERMISSIONS array:
PERMISSIONS.TENANT_INQUIRIES_VIEW,
PERMISSIONS.TENANT_INQUIRIES_REVIEW,
```

#### 2f: Add audit actions (in `AUDIT_ACTIONS` object)

```typescript
TENANT_INQUIRIES_INSERT: "TENANT_INQUIRIES_INSERT",
TENANT_INQUIRIES_UPDATE: "TENANT_INQUIRIES_UPDATE",
```

#### 2g: Add system config keys (in `SYSTEM_CONFIG_KEYS` object)

```typescript
TENANT_BOUNTY_DEFAULT_AMOUNT: "tenant_bounty_default_amount",
TENANT_BOUNTY_DEFAULT_EXPIRY_DAYS: "tenant_bounty_default_expiry_days",
```

#### 2h: Add system config defaults (in `SYSTEM_CONFIG_DEFAULTS`)

```typescript
[SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_DEFAULT_AMOUNT]: "50000", // ₹500 in paise
[SYSTEM_CONFIG_KEYS.TENANT_BOUNTY_DEFAULT_EXPIRY_DAYS]: "3",
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 3: Register Audit Triggers for `tenant_inquiries`

**File:** `convex/functions.ts`

Add `"tenant_inquiries"` to the `AUDITED_TABLES` array (around line 54):

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
  "tenant_inquiries", // ← ADD THIS
];
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 4: Add Rate Limiter for Tenant Visit Requests

**File:** `convex/rateLimiter.ts`

Add a new rate limiter entry for tenant inquiry submissions:

```typescript
"public:tenant_inquiry_submit": {
  kind: "token bucket",
  rate: 5,
  period: 3600000, // 1 hour
  capacity: 5,
  shards: 1,
},
```

The key will be the tenant's phone number (similar to how existing contact form rate limiting works).

---

### Step 5: Backend — `convex/tenantInquiries.ts` (Full File)

**Create new file:** `convex/tenantInquiries.ts`

This is the core backend file. It contains ALL mutations and queries for the tenant inquiry pipeline.

```typescript
import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  LISTING_STATUS,
  PERMISSIONS,
  TENANT_INQUIRY_STATUS,
  VISIT_STATUS,
  type TenantInquiryStatus,
} from "../lib/constants";
import { requireGuard, requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { mutation } from "./functions";
```

#### 5a: State Machine Validation

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  [TENANT_INQUIRY_STATUS.SUBMITTED]: [
    TENANT_INQUIRY_STATUS.REVIEWED,
    TENANT_INQUIRY_STATUS.REJECTED,
  ],
  [TENANT_INQUIRY_STATUS.REVIEWED]: [
    TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
    TENANT_INQUIRY_STATUS.REJECTED,
  ],
  [TENANT_INQUIRY_STATUS.BOUNTY_POSTED]: [
    TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
    TENANT_INQUIRY_STATUS.EXPIRED,
  ],
  [TENANT_INQUIRY_STATUS.GUARD_ACCEPTED]: [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED],
  [TENANT_INQUIRY_STATUS.VISIT_SCHEDULED]: [TENANT_INQUIRY_STATUS.VISIT_COMPLETED],
  [TENANT_INQUIRY_STATUS.VISIT_COMPLETED]: [
    TENANT_INQUIRY_STATUS.CLOSED,
    TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
  ],
  [TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED]: [TENANT_INQUIRY_STATUS.CLOSED],
};

export function validateTenantInquiryTransition(currentStatus: string, newStatus: string): boolean {
  return (VALID_TRANSITIONS[currentStatus] ?? []).includes(newStatus);
}
```

#### 5b: Inquiry Context Enrichment Helper

```typescript
type InquiryContext = {
  listing: Doc<"listings"> | null;
  lead: Doc<"leads"> | null;
  building: Doc<"buildings"> | null;
  society: Doc<"societies"> | null;
  guard: { _id: Id<"users">; name: string; phone: string | undefined } | null;
  visit: Doc<"visits"> | null;
};

async function getInquiryContext(
  ctx: QueryCtx | MutationCtx,
  inquiry: Doc<"tenant_inquiries">,
): Promise<InquiryContext> {
  const listing = await ctx.db.get(inquiry.listing_id);
  const lead = listing ? await ctx.db.get(listing.lead_id) : null;
  const building = lead?.building_id ? await ctx.db.get(lead.building_id) : null;
  const society = building?.society_id ? await ctx.db.get(building.society_id) : null;

  let guard: InquiryContext["guard"] = null;
  if (inquiry.assigned_guard_id) {
    const guardUser = await ctx.db.get(inquiry.assigned_guard_id);
    if (guardUser) {
      guard = {
        _id: guardUser._id,
        name: guardUser.name,
        phone: guardUser.phone,
      };
    }
  }

  const visit = inquiry.visit_id ? await ctx.db.get(inquiry.visit_id) : null;

  return { listing, lead, building, society, guard, visit };
}
```

#### 5c: `submit` Mutation (Public — No Auth)

```typescript
export const submit = mutation({
  args: {
    listing_id: v.id("listings"),
    tenant_name: v.string(),
    tenant_phone: v.string(),
    tenant_email: v.optional(v.string()),
    preferred_visit_date: v.optional(v.number()),
    preferred_visit_slot: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // NO auth check — public submission (like existing contact form)

    // Validate listing exists and is published
    const listing = await ctx.db.get(args.listing_id);
    if (!listing) {
      throw new Error("Listing not found");
    }
    if (listing.status !== LISTING_STATUS.PUBLISHED) {
      throw new Error("Can only submit inquiries for published listings");
    }

    // Validate phone is 10 digits
    const phone = args.tenant_phone.replace(/\D/g, "");
    if (phone.length !== 10) {
      throw new Error("Phone must be exactly 10 digits");
    }

    // Validate name
    const name = args.tenant_name.trim();
    if (name.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }

    // Rate limit: 5 per hour per phone
    // NOTE: Import and check rate limiter here.
    // If your codebase uses a specific rate limiter pattern from convex/rateLimiter.ts,
    // follow that exact pattern. Example:
    // await rateLimiter.limit(ctx, "public:tenant_inquiry_submit", { key: phone });

    return await ctx.db.insert("tenant_inquiries", {
      listing_id: args.listing_id,
      tenant_name: name,
      tenant_phone: phone,
      tenant_email: args.tenant_email?.trim() || undefined,
      preferred_visit_date: args.preferred_visit_date,
      preferred_visit_slot: args.preferred_visit_slot?.trim() || undefined,
      message: args.message?.trim() || undefined,
      status: TENANT_INQUIRY_STATUS.SUBMITTED,
      bounty_amount: undefined,
      bounty_posted_at: undefined,
      bounty_expires_at: undefined,
      assigned_guard_id: undefined,
      visit_id: undefined,
      ops_notes: undefined,
      rejection_reason: undefined,
      reviewed_by_admin_id: undefined,
    });
  },
});
```

#### 5d: `review` Mutation (Admin)

```typescript
export const review = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_REVIEW);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.REVIEWED)) {
      throw new Error(`Cannot review inquiry with status: ${inquiry.status}`);
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.REVIEWED,
      reviewed_by_admin_id: admin._id,
      ops_notes: args.ops_notes?.trim() || inquiry.ops_notes,
    });

    return await ctx.db.get(args.id);
  },
});
```

#### 5e: `reject` Mutation (Admin)

```typescript
export const reject = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    rejection_reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_REVIEW);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.REJECTED)) {
      throw new Error(`Cannot reject inquiry with status: ${inquiry.status}`);
    }

    const reason = args.rejection_reason.trim();
    if (reason.length === 0) {
      throw new Error("Rejection reason is required");
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.REJECTED,
      rejection_reason: reason,
      reviewed_by_admin_id: admin._id,
    });

    return await ctx.db.get(args.id);
  },
});
```

#### 5f: `postBounty` Mutation (Admin)

```typescript
export const postBounty = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    bounty_amount: v.number(),
    expiry_days: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_REVIEW);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.BOUNTY_POSTED)) {
      throw new Error(`Cannot post bounty for inquiry with status: ${inquiry.status}`);
    }

    if (args.bounty_amount <= 0) {
      throw new Error("Bounty amount must be positive");
    }

    if (args.expiry_days < 1 || args.expiry_days > 30) {
      throw new Error("Expiry must be between 1 and 30 days");
    }

    const now = Date.now();
    const expiresAt = now + args.expiry_days * 24 * 60 * 60 * 1000;

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
      bounty_amount: args.bounty_amount,
      bounty_posted_at: now,
      bounty_expires_at: expiresAt,
      reviewed_by_admin_id: admin._id,
    });

    return await ctx.db.get(args.id);
  },
});
```

#### 5g: `acceptBounty` Mutation (Guard)

```typescript
export const acceptBounty = mutation({
  args: {
    id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    const guard = await requireGuard(ctx);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.GUARD_ACCEPTED)) {
      throw new Error(`Cannot accept bounty for inquiry with status: ${inquiry.status}`);
    }

    // Check bounty hasn't expired
    if (inquiry.bounty_expires_at && inquiry.bounty_expires_at < Date.now()) {
      throw new Error("This bounty has expired");
    }

    // Verify guard is in the same society as the listing
    const listing = await ctx.db.get(inquiry.listing_id);
    if (!listing) throw new Error("Listing not found");

    const lead = await ctx.db.get(listing.lead_id);
    if (!lead) throw new Error("Lead not found");

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", guard._id))
      .unique();

    if (!guardProfile) throw new Error("Guard profile not found");

    if (guardProfile.society_id !== lead.society_id) {
      throw new Error("You can only accept bounties for listings in your society");
    }

    // Check not already accepted by another guard
    if (inquiry.assigned_guard_id) {
      throw new Error("This bounty has already been accepted");
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
      assigned_guard_id: guard._id,
    });

    return await ctx.db.get(args.id);
  },
});
```

#### 5h: `scheduleVisit` Mutation (Admin — creates a real `visits` record)

```typescript
export const scheduleVisit = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    scheduled_start: v.number(),
    scheduled_end: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_REVIEW);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.VISIT_SCHEDULED)) {
      throw new Error(`Cannot schedule visit for inquiry with status: ${inquiry.status}`);
    }

    if (!inquiry.assigned_guard_id) {
      throw new Error("No guard assigned to this inquiry");
    }

    if (args.scheduled_start >= args.scheduled_end) {
      throw new Error("scheduled_start must be less than scheduled_end");
    }

    const listing = await ctx.db.get(inquiry.listing_id);
    if (!listing) throw new Error("Listing not found");

    const lead = await ctx.db.get(listing.lead_id);
    if (!lead) throw new Error("Lead not found");

    // Create the actual visits record (same table as guard-sourced visits)
    const visitId = await ctx.db.insert("visits", {
      lead_id: lead._id,
      society_id: lead.society_id,
      listing_id: listing._id,
      scheduled_start: args.scheduled_start,
      scheduled_end: args.scheduled_end,
      assigned_guard_id: inquiry.assigned_guard_id,
      status: VISIT_STATUS.ASSIGNED,
      outcome: undefined,
      outcome_notes: undefined,
      started_at: undefined,
      completed_at: undefined,
      needs_reassignment: false,
      created_by_admin_id: admin._id,
      tenant_inquiry_id: args.id,
    });

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
      visit_id: visitId,
    });

    return await ctx.db.get(args.id);
  },
});
```

#### 5i: `expire` Mutation (Admin — manual expiry for V1)

```typescript
export const expire = mutation({
  args: {
    id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_REVIEW);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.EXPIRED)) {
      throw new Error(`Cannot expire inquiry with status: ${inquiry.status}`);
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.EXPIRED,
    });

    return await ctx.db.get(args.id);
  },
});
```

#### 5j: `close` Mutation (Admin)

```typescript
export const close = mutation({
  args: {
    id: v.id("tenant_inquiries"),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_REVIEW);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    if (!validateTenantInquiryTransition(inquiry.status, TENANT_INQUIRY_STATUS.CLOSED)) {
      throw new Error(`Cannot close inquiry with status: ${inquiry.status}`);
    }

    await ctx.db.patch(args.id, {
      status: TENANT_INQUIRY_STATUS.CLOSED,
      ops_notes: args.ops_notes?.trim() || inquiry.ops_notes,
    });

    return await ctx.db.get(args.id);
  },
});
```

#### 5k: `list` Query (Admin — paginated)

```typescript
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_VIEW);

    let inquiriesQuery = args.status
      ? ctx.db.query("tenant_inquiries").withIndex("by_status", (q) => q.eq("status", args.status!))
      : ctx.db.query("tenant_inquiries");

    const paginatedResults = await inquiriesQuery.order("desc").paginate(args.paginationOpts);

    const enriched = await Promise.all(
      paginatedResults.page.map(async (inquiry) => {
        const context = await getInquiryContext(ctx, inquiry);
        return {
          ...inquiry,
          listing: context.listing,
          lead: context.lead,
          building: context.building,
          society: context.society,
          guard: context.guard,
          visit: context.visit,
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

#### 5l: `getById` Query (Admin)

```typescript
export const getById = query({
  args: {
    id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_VIEW);
    const inquiry = await ctx.db.get(args.id);
    if (!inquiry) throw new Error("Inquiry not found");

    const context = await getInquiryContext(ctx, inquiry);
    return {
      ...inquiry,
      listing: context.listing,
      lead: context.lead,
      building: context.building,
      society: context.society,
      guard: context.guard,
      visit: context.visit,
    };
  },
});
```

#### 5m: `getStatusCounts` Query (Admin)

```typescript
export const getStatusCounts = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_VIEW);

    const allInquiries = await ctx.db.query("tenant_inquiries").collect();

    const counts: Record<string, number> = {};
    for (const status of Object.values(TENANT_INQUIRY_STATUS)) {
      counts[status] = 0;
    }
    for (const inquiry of allInquiries) {
      counts[inquiry.status] = (counts[inquiry.status] ?? 0) + 1;
    }

    return counts;
  },
});
```

#### 5n: `listBounties` Query (Guard — filtered by society)

```typescript
export const listBounties = query({
  args: {
    tab: v.union(v.literal("available"), v.literal("accepted")),
  },
  handler: async (ctx, args) => {
    const guard = await requireGuard(ctx);

    const guardProfile = await ctx.db
      .query("guard_profiles")
      .withIndex("by_user_id", (q) => q.eq("user_id", guard._id))
      .unique();

    if (!guardProfile) throw new Error("Guard profile not found");

    if (args.tab === "available") {
      // Show BOUNTY_POSTED inquiries for listings in guard's society
      const bounties = await ctx.db
        .query("tenant_inquiries")
        .withIndex("by_status", (q) => q.eq("status", TENANT_INQUIRY_STATUS.BOUNTY_POSTED))
        .order("desc")
        .collect();

      // Filter to guard's society + not expired
      const now = Date.now();
      const filtered = [];
      for (const bounty of bounties) {
        // Skip expired
        if (bounty.bounty_expires_at && bounty.bounty_expires_at < now) continue;

        const listing = await ctx.db.get(bounty.listing_id);
        if (!listing) continue;

        const lead = await ctx.db.get(listing.lead_id);
        if (!lead) continue;

        if (lead.society_id !== guardProfile.society_id) continue;

        const building = await ctx.db.get(lead.building_id);
        const society = await ctx.db.get(lead.society_id);

        filtered.push({
          ...bounty,
          listing_bhk: listing.bhk_config,
          listing_rent: listing.rent_monthly,
          listing_slug: listing.slug,
          flat_number: lead.flat_number,
          floor_number: listing.floor_number,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
        });
      }

      return filtered;
    }

    // "accepted" tab — guard's own claimed bounties
    const myBounties = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_assigned_guard_id", (q) => q.eq("assigned_guard_id", guard._id))
      .order("desc")
      .collect();

    return await Promise.all(
      myBounties.map(async (inquiry) => {
        const listing = await ctx.db.get(inquiry.listing_id);
        const lead = listing ? await ctx.db.get(listing.lead_id) : null;
        const building = lead ? await ctx.db.get(lead.building_id) : null;
        const society = lead ? await ctx.db.get(lead.society_id) : null;

        return {
          ...inquiry,
          listing_bhk: listing?.bhk_config ?? null,
          listing_rent: listing?.rent_monthly ?? null,
          listing_slug: listing?.slug ?? null,
          flat_number: lead?.flat_number ?? null,
          floor_number: listing?.floor_number ?? null,
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
        };
      }),
    );
  },
});
```

#### 5o: `getSubmittedCount` Query (for admin sidebar badge)

```typescript
export const getSubmittedCount = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.TENANT_INQUIRIES_VIEW);

    const submitted = await ctx.db
      .query("tenant_inquiries")
      .withIndex("by_status", (q) => q.eq("status", TENANT_INQUIRY_STATUS.SUBMITTED))
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

### Step 6: Sync Hook — Update Inquiry Status When Visit Completes

**File:** `convex/visits.ts` — Modify the `complete` mutation

In the `complete` mutation handler (around line 546), after the existing `ctx.db.patch` and `ctx.runMutation(internal.incentives.checkAndSuggest)` calls, add a sync hook to update the linked tenant inquiry:

```typescript
// After existing incentive check...

// Sync tenant inquiry status if this visit came from an inquiry
if (visit.tenant_inquiry_id) {
  const inquiry = await ctx.db.get(visit.tenant_inquiry_id);
  if (inquiry && inquiry.status === TENANT_INQUIRY_STATUS.VISIT_SCHEDULED) {
    await ctx.db.patch(visit.tenant_inquiry_id, {
      status: TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
    });
  }
}
```

Add the import at the top of `convex/visits.ts`:

```typescript
import { TENANT_INQUIRY_STATUS } from "../lib/constants";
```

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 7: Extend Contact Sidebar — Add "Request Visit" Tab

**File:** `src/app/listing/[slug]/components/contact-sidebar.tsx` — Modify

Add a tabbed interface to the existing contact sidebar. The current form becomes the "Contact Us" tab. A new "Request Visit" tab adds preferred date/time fields.

**Changes:**

1. Import `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs`
2. Import `DatePicker` from `@/components/ui/date-picker`
3. Import `TimePicker` from `@/components/ui/time-picker`
4. Add a new zod schema for the visit request form
5. Wrap the desktop sidebar content in `<Tabs defaultValue="contact">`
6. Tab 1 ("Contact Us"): existing contact form — no changes
7. Tab 2 ("Request Visit"): new form with name, phone, email, preferred date, time slot, message

**Visit request form schema:**

```typescript
const visitRequestSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  preferred_date: z.date().optional(),
  preferred_slot: z.string().optional(),
  message: z.string().optional(),
});
```

**On submit:**

```typescript
const result = await submitVisitRequest({
  listing_id: listingId as Id<"listings">,
  tenant_name: data.name,
  tenant_phone: data.phone,
  tenant_email: data.email || undefined,
  preferred_visit_date: data.preferred_date?.getTime(),
  preferred_visit_slot: data.preferred_slot,
  message: data.message,
});

toast.success("Visit request submitted! Our team will review and get back to you.");
```

Use `useMutation(api.tenantInquiries.submit)` for the visit request form.

**Time slot options** (use a `<Select>` dropdown):

```typescript
const TIME_SLOT_OPTIONS = [
  { label: "Morning (9 AM – 12 PM)", value: "Morning" },
  { label: "Afternoon (12 PM – 3 PM)", value: "Afternoon" },
  { label: "Evening (3 PM – 6 PM)", value: "Evening" },
  { label: "Late Evening (6 PM – 8 PM)", value: "Late Evening" },
];
```

**Mobile bottom bar:** Add the "Request Visit" option alongside the existing "Contact Us" button. When tapped, it opens a Sheet with the visit request form (same as the new tab's content).

**Key rules:**

- Keep the existing contact form exactly as-is (it writes to `listing_inquiries` table)
- The visit request form writes to `tenant_inquiries` table (different table!)
- Both forms share the same name/phone validation pattern
- `useMutation` for tenant inquiry (Convex real-time) — NOT server action
- Show success state after submission (same pattern as existing contact form success)
- DatePicker: use the existing `date-picker.tsx` component from `src/components/ui/`
- Do NOT use native `<input type="date">` or `<input type="time">`

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 8: Admin Page — Tenant Inquiries Queue

**Create new files:**

- `src/app/(admin)/admin/tenant-inquiries/page.tsx` — Main page
- `src/app/(admin)/admin/tenant-inquiries/components/inquiry-status-tabs.tsx` — Status tabs
- `src/app/(admin)/admin/tenant-inquiries/components/inquiry-table.tsx` — Paginated table
- `src/app/(admin)/admin/tenant-inquiries/components/inquiry-detail-panel.tsx` — Side panel
- `src/app/(admin)/admin/tenant-inquiries/components/post-bounty-dialog.tsx` — Bounty posting dialog
- `src/app/(admin)/admin/tenant-inquiries/components/reject-dialog.tsx` — Rejection dialog
- `src/app/(admin)/admin/tenant-inquiries/components/schedule-visit-dialog.tsx` — Visit scheduling dialog

#### 8a: Main Page (`page.tsx`)

Follow the EXACT pattern from `src/app/(admin)/admin/leads/page.tsx`:

```typescript
"use client";

// Same pattern: useQuery for currentUser, roleAssignments, permissionSet
// URL-driven status tabs via useSearchParams + router.replace
// Selected inquiry ID from URL param ?id=
// Status tabs component + table component + detail panel component
```

**URL params:**

```
/admin/tenant-inquiries?status=SUBMITTED&id=INQUIRY_ID
```

**Page header:**

```typescript
<h2 className="text-2xl font-semibold tracking-tight text-slate-900">Tenant Inquiries</h2>
<p className="text-sm text-slate-600">
  Review visit requests, post bounties for guards, and track the inquiry pipeline.
</p>
```

**Permission check:** `PERMISSIONS.TENANT_INQUIRIES_VIEW`

#### 8b: Status Tabs (`inquiry-status-tabs.tsx`)

Tab order (matches the pipeline flow):

| Tab Label | Filter Value      | Badge Color |
| --------- | ----------------- | ----------- |
| All       | `"ALL"`           | none        |
| Submitted | `SUBMITTED`       | blue        |
| Reviewed  | `REVIEWED`        | indigo      |
| Bounty    | `BOUNTY_POSTED`   | amber       |
| Accepted  | `GUARD_ACCEPTED`  | cyan        |
| Scheduled | `VISIT_SCHEDULED` | purple      |
| Completed | `VISIT_COMPLETED` | green       |
| Closed    | `CLOSED`          | gray        |

Show counts from `getStatusCounts` query. Terminal states (REJECTED, EXPIRED) are NOT tabs — they're accessible via a dropdown filter or the "All" tab.

#### 8c: Inquiry Table (`inquiry-table.tsx`)

Use `usePaginatedQuery(api.tenantInquiries.list, { status: ... })` with "Load More" button.

**Table columns:**

| Column         | Width  | Content                                                 |
| -------------- | ------ | ------------------------------------------------------- |
| #              | narrow | Inquiry number (row index or last 4 chars of `_id`)     |
| Listing        | 25%    | `{building_name}/{floor}/{flat} {bhk_config}`           |
| Tenant         | 20%    | `{tenant_name}` + phone below in muted text             |
| Preferred Date | 15%    | Formatted date or "ASAP" if no date                     |
| Status         | 15%    | Status badge with `TENANT_INQUIRY_STATUS_COLORS`        |
| Time           | 10%    | Relative time since creation (e.g., "3h ago", "2d ago") |

**Row click:** Opens detail panel (sets `?id=` URL param).

**Active row:** Highlighted background (`bg-blue-50`).

#### 8d: Inquiry Detail Panel (`inquiry-detail-panel.tsx`)

Slide-in panel from the right side (same pattern as lead detail panel).

Uses `useQuery(api.tenantInquiries.getById, { id })`.

**Sections:**

1. **Header**: Status badge + inquiry creation time
2. **Listing Info**: Building, floor, flat, BHK, rent (clickable link to `/listing/{slug}`)
3. **Tenant Info**: Name, phone (`+91 XXXXX XXXXX` format), email (if provided)
4. **Request Details**: Preferred visit date, time slot, message
5. **Bounty Info** (if BOUNTY_POSTED or later): Amount (₹), posted date, expires date, assigned guard name
6. **Visit Info** (if VISIT_SCHEDULED or later): Scheduled date/time, visit status, outcome
7. **Actions** (context-dependent buttons — see action table below)
8. **Ops Notes**: Text area for internal notes (saved via a separate `updateOpsNotes` mutation, or inline in the review mutation)

**Action buttons by status:**

| Current Status          | Available Actions              |
| ----------------------- | ------------------------------ |
| `SUBMITTED`             | [Review] [Reject]              |
| `REVIEWED`              | [Post Bounty] [Reject]         |
| `BOUNTY_POSTED`         | [Expire]                       |
| `GUARD_ACCEPTED`        | [Schedule Visit]               |
| `VISIT_COMPLETED`       | [Close] [Initiate Negotiation] |
| `NEGOTIATION_INITIATED` | [Close]                        |
| Terminal states         | No actions (read-only)         |

#### 8e: Post Bounty Dialog (`post-bounty-dialog.tsx`)

`<Dialog>` with:

- Bounty amount input (`<Input type="number">`, label "Bounty Amount (₹)", stored as paise — multiply by 100 before sending)
- Expiry days input (`<Input type="number">`, label "Expires After (days)", default: 3)
- [Cancel] [Post Bounty] buttons
- Validation: amount > 0, days between 1-30

#### 8f: Reject Dialog (`reject-dialog.tsx`)

`<Dialog>` with:

- Rejection reason textarea (`<Textarea>`, required)
- [Cancel] [Reject Inquiry] buttons (reject button is `variant="destructive"`)

#### 8g: Schedule Visit Dialog (`schedule-visit-dialog.tsx`)

`<Dialog>` with:

- Date picker for visit date (`<DatePicker>`)
- Start time picker (`<TimePicker>`)
- End time picker (`<TimePicker>`)
- Guard name display (pre-filled — the guard who accepted the bounty)
- [Cancel] [Schedule Visit] buttons
- Validation: start < end, date is in the future

This dialog calls `tenantInquiries.scheduleVisit` which creates the `visits` record.

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 9: Admin Sidebar — Add Tenant Inquiries Nav Item with Badge

**File:** `src/app/(admin)/admin-layout-client.tsx`

#### 9a: Add nav item

Add to the `adminNavItems` array (after "Audit", before "Settings"):

```typescript
{
  label: "Inquiries",
  href: "/admin/tenant-inquiries",
  icon: MessageSquare,  // from lucide-react
  available: true,
  requiredPermission: PERMISSIONS.TENANT_INQUIRIES_VIEW,
},
```

Import `MessageSquare` from `lucide-react`.

#### 9b: Add badge count

Follow the existing pattern for leads/payouts badges:

```typescript
const hasTenantInquiriesView =
  roleAssignments !== undefined && permissionSet.has(PERMISSIONS.TENANT_INQUIRIES_VIEW);

const submittedInquiriesCount = useQuery(
  api.tenantInquiries.getSubmittedCount,
  hasTenantInquiriesView ? {} : "skip",
);
```

In the nav rendering, add badge count logic (same pattern as `leadsBadgeCount`):

```typescript
const inquiriesBadgeCount =
  item.href === "/admin/tenant-inquiries" &&
  submittedInquiriesCount !== undefined &&
  submittedInquiriesCount > 0
    ? submittedInquiriesCount
    : null;
```

Badge color: red (same as leads — `bg-red-100 text-red-700`).

Add `inquiriesBadgeCount` to the `navBadgeCount` resolution chain and `usesRedBadge` check.

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 10: Guard Page — Bounty Board

**Create new files:**

- `src/app/(guard)/guard/bounties/page.tsx` — Bounty board page
- `src/app/(guard)/guard/bounties/components/bounty-card.tsx` — Bounty card component
- `src/app/(guard)/guard/bounties/components/accepted-card.tsx` — Accepted bounty card

#### 10a: Bounty Board Page (`page.tsx`)

```typescript
"use client";
```

Two tabs: "Available" and "My Accepted".

Uses `useQuery(api.tenantInquiries.listBounties, { tab: activeTab })`.

**Layout follows guard portal conventions:**

- Mobile-first, max-w-md container (inherited from guard layout)
- Rule banner visible (handled by guard layout)
- No sidebar — content fills the mobile viewport

**Tab structure:**

```typescript
<Tabs defaultValue="available" className="w-full">
  <TabsList className="w-full">
    <TabsTrigger value="available" className="flex-1">
      Available
      {availableCount > 0 && (
        <Badge className="ml-2 bg-amber-100 text-amber-700">{availableCount}</Badge>
      )}
    </TabsTrigger>
    <TabsTrigger value="accepted" className="flex-1">
      My Accepted
    </TabsTrigger>
  </TabsList>

  <TabsContent value="available">
    {/* BountyCard list or empty state */}
  </TabsContent>

  <TabsContent value="accepted">
    {/* AcceptedCard list or empty state */}
  </TabsContent>
</Tabs>
```

**Empty states:**

- Available: "No bounties available right now. Check back later!" with `Inbox` icon
- Accepted: "You haven't accepted any bounties yet." with `ClipboardList` icon

#### 10b: Bounty Card (`bounty-card.tsx`)

Follow the wireframe from `notes/05-guard-portal-ux.md` (Flow 8):

```
┌─────────────────────────────┐
│ 🏠 Tower A, Fl 12, #1201    │
│ Maplewood Gardens          │
│                              │
│ 2BHK • ₹25,000/mo           │
│                              │
│ Tenant wants: Feb 20,        │
│ Morning slot                 │
│ 💰 Bounty: ₹500              │
│ ⏰ Expires: 2 days           │
│                              │
│ ┌──────────────────────────┐│
│ │     ACCEPT BOUNTY        ││
│ └──────────────────────────┘│
└─────────────────────────────┘
```

**Props:**

```typescript
type BountyCardProps = {
  bounty: {
    _id: Id<"tenant_inquiries">;
    listing_bhk: string;
    listing_rent: number;
    building_name: string | null;
    society_name: string | null;
    floor_number: string;
    flat_number: string;
    preferred_visit_date: number | undefined;
    preferred_visit_slot: string | undefined;
    bounty_amount: number | undefined;
    bounty_expires_at: number | undefined;
  };
  onAccept: (id: Id<"tenant_inquiries">) => void;
  isAccepting: boolean;
};
```

**Rules:**

- Use `<Card>` from shadcn
- Address: `{building_name}, Fl {floor_number}, #{flat_number}` — first line. `{society_name}` — second line.
- Listing info: `{bhk_config} • {formatINR(listing_rent)}/mo`
- Preferred date: Format with `new Date(preferred_visit_date).toLocaleDateString()` or "ASAP" if undefined
- Time slot: Display as-is or "Flexible" if undefined
- Bounty amount: `₹{paiseToRupees(bounty_amount)}` — use `paiseToRupees()` from `lib/money.ts`
- Expiry countdown: Calculate days remaining from `bounty_expires_at - Date.now()`. Show "Expires: X days" or "Expires today" if < 24h.
- Accept button: `<Button className="w-full bg-green-600 hover:bg-green-700 text-white">Accept Bounty</Button>`

**On Accept:**

1. Show `<AlertDialog>` confirmation: "Accept this showing? You'll be contacted by our team to confirm the schedule."
2. On confirm: call `tenantInquiries.acceptBounty({ id })`
3. Toast: "Bounty accepted! Our team will confirm the schedule."
4. Card disappears from Available, appears in My Accepted

#### 10c: Accepted Card (`accepted-card.tsx`)

Similar to BountyCard but with status tracking:

```
┌─────────────────────────────┐
│ 🏠 Tower A, Fl 12, #1201    │
│ Maplewood Gardens          │
│                              │
│ 💰 Bounty: ₹500              │
│                              │
│ Status: [GUARD_ACCEPTED]     │  ← Badge with status color
│ Waiting for schedule...       │
└─────────────────────────────┘
```

**Status labels for accepted tab:**

| Status            | Display                              |
| ----------------- | ------------------------------------ |
| `GUARD_ACCEPTED`  | "Waiting for schedule" — amber badge |
| `VISIT_SCHEDULED` | "Visit scheduled" — purple badge     |
| `VISIT_COMPLETED` | "Visit completed" — green badge      |
| `CLOSED`          | "Closed" — gray badge                |

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 11: Guard Bottom Nav — Add Bounties Nav Item

**File:** `src/app/(guard)/guard-layout-client.tsx`

Add a 6th nav item for bounties. The guard bottom nav currently has 5 items (Home, Add Lead, My Leads, My Visits, Earnings). Adding a 6th item requires adjusting the grid from `grid-cols-5` to `grid-cols-6`.

**Add to `guardNavItems` array (after "My Visits", before "Earnings"):**

```typescript
{
  href: "/guard/bounties",
  label: "Bounties",  // Not translated in V1 — English hardcoded
  icon: Gift,  // from lucide-react (Gift represents bounty/reward)
},
```

Import `Gift` from `lucide-react`.

**Change the nav grid:**

```typescript
// Change from:
<div className="mx-auto grid w-full max-w-md grid-cols-5 gap-1 py-2">

// To:
<div className="mx-auto grid w-full max-w-md grid-cols-6 gap-1 py-2">
```

**Translation note:** The existing nav labels use `t("nav.home")`, `t("nav.addLead")`, etc. For the bounties label, use a hardcoded English string for V1:

```typescript
{
  href: "/guard/bounties",
  label: "Bounties",  // i18n deferred — not in messages/*.json yet
  icon: Gift,
},
```

This means the bounties label will always show "Bounties" regardless of locale. This is acceptable for V1. Future phase adds the translation key.

**Verify after this step:**

```bash
npx tsc --noEmit
```

---

### Step 12: Add `tenant_inquiries` to Seed Roles

**File:** `convex/seed.ts`

If the seed script defines the `Super Admin` role with `ALL_PERMISSIONS`, no change is needed (it picks up the new permissions automatically from `ALL_PERMISSIONS`).

If `Ops Agent` role permissions are explicitly listed, add the two new permissions:

```typescript
PERMISSIONS.TENANT_INQUIRIES_VIEW,
PERMISSIONS.TENANT_INQUIRIES_REVIEW,
```

Check the seed file and add if necessary. The `OPS_AGENT_PERMISSIONS` array in `lib/constants.ts` already includes them (from Step 2e), so if the seed reads from that array, it's automatic.

---

## Hard Constraints (MUST follow — violations are blocking)

1. **No `as any`, `@ts-ignore`, `@ts-expect-error`** — ever. Fix type errors properly.
2. **Money is always paise** — `formatINR(listing.rent_monthly)` for display. NEVER divide by 100 manually. Use `paiseToRupees()` from `lib/money.ts` when you need the numeric rupee value.
3. **No i18n on admin or public pages** — English only. No `NextIntlClientProvider`. No `useTranslations`.
4. **Guard bounty board:** English hardcoded for V1. Do NOT add translation keys to `messages/*.json` in this phase.
5. **No native HTML form elements** — use shadcn/ui `<Input>`, `<Textarea>`, `<Select>`, `<DatePicker>`, `<TimePicker>`, etc.
6. **sonner for toasts** — all user feedback via toast.
7. **lucide-react for all icons** — no other icon libraries.
8. **`react-hook-form` + `zod`** for all forms — visit request form, post bounty form, reject form, schedule visit form.
9. **Audited mutations use `mutation` from `./functions`** — NOT from `_generated/server`. Queries use `query` from `_generated/server`.
10. **State machine transitions are enforced in backend** — every mutation validates the transition with `validateTenantInquiryTransition()`. The UI should also only show valid action buttons, but the backend is the source of truth.
11. **Tenant inquiry pipeline is SEPARATE from guard lead pipeline** — different table (`tenant_inquiries` vs `leads`), different mutations file (`tenantInquiries.ts` vs `leads.ts`), different admin page (`/admin/tenant-inquiries` vs `/admin/leads`). Do NOT mix them.
12. **Visits created from tenant inquiries use the SAME `visits` table** — linked via `tenant_inquiry_id` field. They follow the same visit status lifecycle.
13. **No tenant auth in V1** — the `submit` mutation has NO auth check. Tenant name/phone are stored directly on the `tenant_inquiries` record, not as a foreign key to a `users` record.
14. **Guard society filter is mandatory** — guards ONLY see bounties for listings in their assigned society. This is enforced in `listBounties` query by checking `lead.society_id === guardProfile.society_id`.
15. **One guard per bounty** — first guard to accept claims it. Race condition handled by checking `inquiry.assigned_guard_id` is undefined before accepting.
16. **Rate limiting on public submission** — 5 requests per hour per phone number. Use the existing rate limiter pattern from `convex/rateLimiter.ts`.
17. **Home links to `/homepage`** — NOT `/`.
18. **`.filter()` uses `.includes()` for search** — NOT regex.
19. **URL params are source of truth** for admin page filters — same pattern as leads page.
20. **`router.replace()` with `{ scroll: false }`** for filter changes.

---

## Tenant Inquiry Status Display Labels

| Enum Value              | Display Label   | Badge Colors                    |
| ----------------------- | --------------- | ------------------------------- |
| `SUBMITTED`             | Submitted       | `bg-blue-100 text-blue-700`     |
| `REVIEWED`              | Reviewed        | `bg-indigo-100 text-indigo-700` |
| `BOUNTY_POSTED`         | Bounty Posted   | `bg-amber-100 text-amber-700`   |
| `GUARD_ACCEPTED`        | Guard Accepted  | `bg-cyan-100 text-cyan-700`     |
| `VISIT_SCHEDULED`       | Visit Scheduled | `bg-purple-100 text-purple-700` |
| `VISIT_COMPLETED`       | Visit Completed | `bg-green-100 text-green-700`   |
| `NEGOTIATION_INITIATED` | Negotiation     | `bg-orange-100 text-orange-700` |
| `CLOSED`                | Closed          | `bg-gray-100 text-gray-500`     |
| `REJECTED`              | Rejected        | `bg-red-100 text-red-700`       |
| `EXPIRED`               | Expired         | `bg-gray-100 text-gray-400`     |

---

## File Inventory (Expected Deliverables)

### New Files

| File                                                                          | Type      | Purpose                                             |
| ----------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| `convex/tenantInquiries.ts`                                                   | Backend   | All mutations + queries for tenant inquiry pipeline |
| `src/app/(admin)/admin/tenant-inquiries/page.tsx`                             | Page      | Admin inquiry queue                                 |
| `src/app/(admin)/admin/tenant-inquiries/components/inquiry-status-tabs.tsx`   | Component | Status tabs with counts                             |
| `src/app/(admin)/admin/tenant-inquiries/components/inquiry-table.tsx`         | Component | Paginated inquiry table                             |
| `src/app/(admin)/admin/tenant-inquiries/components/inquiry-detail-panel.tsx`  | Component | Side panel with inquiry details + actions           |
| `src/app/(admin)/admin/tenant-inquiries/components/post-bounty-dialog.tsx`    | Component | Bounty amount + expiry dialog                       |
| `src/app/(admin)/admin/tenant-inquiries/components/reject-dialog.tsx`         | Component | Rejection reason dialog                             |
| `src/app/(admin)/admin/tenant-inquiries/components/schedule-visit-dialog.tsx` | Component | Visit scheduling dialog                             |
| `src/app/(guard)/guard/bounties/page.tsx`                                     | Page      | Guard bounty board                                  |
| `src/app/(guard)/guard/bounties/components/bounty-card.tsx`                   | Component | Available bounty card                               |
| `src/app/(guard)/guard/bounties/components/accepted-card.tsx`                 | Component | Accepted bounty status card                         |

### Modified Files

| File                                                    | Change                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `convex/schema.ts`                                      | Add `tenant_inquiries` table, `tenant_inquiry_id` on visits, audit actions, system config keys |
| `convex/visits.ts`                                      | Add `TENANT_INQUIRY_STATUS` import, sync hook in `complete` mutation                           |
| `convex/functions.ts`                                   | Add `"tenant_inquiries"` to `AUDITED_TABLES`                                                   |
| `convex/rateLimiter.ts`                                 | Add `public:tenant_inquiry_submit` rate limiter                                                |
| `lib/constants.ts`                                      | Add `TENANT_INQUIRY_STATUS`, colors, labels, permissions, audit actions, system config keys    |
| `src/app/listing/[slug]/components/contact-sidebar.tsx` | Add "Request Visit" tab with visit request form                                                |
| `src/app/(admin)/admin-layout-client.tsx`               | Add "Inquiries" nav item with badge count                                                      |
| `src/app/(guard)/guard-layout-client.tsx`               | Add "Bounties" nav item, change grid from 5 to 6 columns                                       |

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
# TENANT SIDE:
# - Navigate to /listing/{any-slug} — contact sidebar has two tabs
# - "Contact Us" tab works as before (name + phone + message → listing_inquiries)
# - "Request Visit" tab shows date, time slot, and submits to tenant_inquiries
# - On submit: toast "Visit request submitted!"
# - Submit 6x rapidly → rate limit error

# ADMIN SIDE:
# - Sidebar shows "Inquiries" nav item with badge count
# - /admin/tenant-inquiries loads with status tabs
# - SUBMITTED tab shows the submitted inquiry
# - Click inquiry → detail panel opens
# - Click "Review" → status changes to REVIEWED
# - Click "Post Bounty" → dialog opens, set amount + expiry → status becomes BOUNTY_POSTED
# - Click "Reject" → dialog opens, enter reason → status becomes REJECTED

# GUARD SIDE:
# - Bottom nav shows 6 items (Bounties added)
# - /guard/bounties loads with "Available" and "My Accepted" tabs
# - Available tab shows bounties for guard's society
# - Click "Accept Bounty" → confirmation dialog → status becomes GUARD_ACCEPTED
# - Card moves from Available to My Accepted tab

# FULL PIPELINE:
# 1. Tenant submits visit request → SUBMITTED
# 2. Admin reviews → REVIEWED
# 3. Admin posts bounty → BOUNTY_POSTED
# 4. Guard accepts → GUARD_ACCEPTED
# 5. Admin schedules visit → VISIT_SCHEDULED (creates visits record)
# 6. Guard completes visit (via existing visits page) → VISIT_COMPLETED (synced)
# 7. Admin closes → CLOSED
```

---

## Performance Notes

- `useQuery(api.tenantInquiries.list)` creates a **real-time subscription** — when admin reviews an inquiry, the table updates instantly.
- `useQuery(api.tenantInquiries.listBounties)` on the guard bounty board also auto-updates — when admin posts a new bounty, guards see it immediately.
- `getStatusCounts` reads all inquiries on each call. At V1 scale (<100 inquiries), this is fine. If scale grows, switch to `@convex-dev/aggregate` component (same pattern as leads).
- `getSubmittedCount` for sidebar badge uses the `by_status` index — efficient.
- Guard society filter in `listBounties` requires joining through `listings → leads → society_id`. At V1 scale this is acceptable. If >100 bounties, consider denormalizing `society_id` onto `tenant_inquiries`.

---

## PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE)

You MUST make tool calls in parallel whenever the calls are independent. This is the single biggest performance optimization available to you.

- **Reading multiple files?** Call Read on ALL of them in ONE message.
- **Searching for multiple patterns?** Fire ALL Grep/Glob calls in ONE message.
- **Multiple independent edits?** Make ALL Edit calls in ONE message.

SEQUENTIAL tool calls are ONLY acceptable when Call B depends on the RESULT of Call A.
