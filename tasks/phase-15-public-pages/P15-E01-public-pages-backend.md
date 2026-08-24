---
id: P15-E01
title: Public Pages Backend
phase: 15
status: pending
depends_on: ["P01-E02", "P06-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P15-E01: Public Pages Backend

## Overview

Implement the three Convex backend functions that power the public pages: a `listFeatured` query added to the existing `convex/listings.ts` module (returns PUBLISHED listings newest-first, no auth), a `supportInquiries.submit` mutation in a new `convex/supportInquiries.ts` module (rate-limited contact form persistence), and a `newsletterSubscriptions.subscribe` mutation in a new `convex/newsletterSubscriptions.ts` module (upsert-by-email). Also adds the `public:support_inquiry` rate limiter to `convex/rateLimiter.ts`. All three functions are fully public — no authentication required. Both tables (`support_inquiries`, `newsletter_subscriptions`) are expected from P01-E02. **Verify** they exist in `convex/schema.ts` before writing functions — if missing, add them first per `notes/10-convex-schema.md`.

## Prerequisites

- **Read first**: [P01-E02 Completion Summary](../phase-01-auth/P01-E02-schema-and-infra.md#completion-summary) — `support_inquiries` and `newsletter_subscriptions` tables should exist in `convex/schema.ts` after P01-E02. The `rateLimiter.ts` module already exports a `RateLimiter` instance with two entries (`guard:lead_submission`, `public:listing_inquiry`). **Verify** both tables and their indexes exist in `convex/schema.ts` before writing functions. If the tables are missing, add them to `convex/schema.ts` as the first step — see `notes/10-convex-schema.md` for the exact definitions (`support_inquiries` lines ~737-760, `newsletter_subscriptions` lines ~762-766).
- **Read first**: [P06-E01 Completion Summary](../phase-06-listings/P06-E01-listing-backend.md#completion-summary) — `convex/listings.ts` exists with the `by_status` index on the `listings` table. The `listFeatured` query is added to this existing file. **Verify** the `by_status` index exists in `convex/schema.ts` before writing the query.

## Task Queue

- [ ] P15-E01-T01: Featured Listings Query
- [ ] P15-E01-T02: Support Inquiry Submission Mutation
- [ ] P15-E01-T03: Newsletter Subscription Mutation + Rate Limiter

---

## T01: Featured Listings Query

### Objective

Add `listFeatured` to the existing `convex/listings.ts` module: a public query that returns PUBLISHED listings ordered by `_creationTime` descending, limited to a configurable count (default 9), with building name, society name, and first photo URL joined for each result. No authentication required.

### Required Reading

- `notes/features/15-public-pages.md` — "Featured Properties" row in Homepage table (line 24), "Convex Functions" section (lines 84-97), "Business Rules" rule 6 (line 106), "Edge Cases" first bullet (line 125)
- `notes/10-convex-schema.md` — `listings` table definition (verify `by_status` index exists), `listing_photos` table (for first photo join), `buildings` table (for building name join), `societies` table (for society name join)
- `notes/11-convex-architecture.md` — "Pattern 4: Domain File Organization" section (query structure), "Pattern 1: The Central Import Point" section (import rules)
- Load `convex-api` skill — index query API (`.withIndex`, `.order`, `.take`), file storage (`ctx.storage.getUrl`)

### Key Rules

1. **Modify `convex/listings.ts` — do NOT create a new file.** Add `listFeatured` as a new export at the bottom of the existing module.
2. Import `query` from `./_generated/server` (NOT from `./functions`). This is a public query with no auth check. The existing file already imports `query` from `./_generated/server` — use that same import.
3. Args: `{ limit: v.optional(v.number()) }`. Default to `9` when `limit` is undefined: `const count = args.limit ?? 9;`.
4. Use the existing `by_status` index: `.withIndex("by_status", (q) => q.eq("status", "PUBLISHED"))`. Order descending: `.order("desc")`. Terminal call: `.take(count)`.
5. For each listing in the result, perform three joins via `lead_id` (listings do NOT have `building_id`/`society_id` directly — they join through the lead):
   - **Lead**: `const lead = await ctx.db.get(listing.lead_id);`
   - **Building name**: `lead ? await ctx.db.get(lead.building_id) : null` → `building?.name ?? null`
   - **Society name**: `lead ? await ctx.db.get(lead.society_id) : null` → `society?.name ?? null`
   - **First photo URL**: query `listing_photos` with `.withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id)).filter((q) => q.neq(q.field("is_deleted"), true)).collect()`, then sort by `display_order` ascending (`.sort((a, b) => a.display_order - b.display_order)[0]`) to get the primary photo. If found, call `ctx.storage.getUrl(photo.storage_id)` → `string | null`. This matches the existing photo retrieval pattern in `convex/listings.ts` line ~608-616 (collect → sort by display_order → map).
     This follows the existing `getListingContext()` pattern in `convex/listings.ts` (line ~140). The `is_deleted` filter on photos matches the existing photo read pattern (line ~611).
6. Return an array of enriched objects. Each object includes all fields from the listing document plus `building_name: string | null`, `society_name: string | null`, `first_photo_url: string | null`.
7. No auth check. No `requireGuard`, no `requireAdmin`, no `requirePermission`. This is a fully public endpoint.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/listings.ts` — `listFeatured` query added (PUBLISHED, newest-first, limit arg, building/society/photo joins, no auth)

### Acceptance Criteria

1. **Pre-check**: `support_inquiries` and `newsletter_subscriptions` tables exist in `convex/schema.ts` with all indexes. If they were added as part of this epic, run `npx convex dev` to regenerate types before proceeding.
2. Query returns at most `limit` (default 9) PUBLISHED listings ordered by `_creationTime` descending.
3. Each result includes `building_name`, `society_name`, and `first_photo_url` (all nullable).
4. No authentication required — callable from unauthenticated client components.
5. Uses `by_status` index (not a full table scan).
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/listings.ts`. Confirm `query` is imported from `./_generated/server`. Confirm no implicit `any` on the return type. Confirm the function is exported and named `listFeatured`.

### Out of Scope

- Support inquiry mutation (T02), newsletter mutation (T03), rate limiter (T03).
- Frontend property card component (P15-E02).
- Listing browse/search/filter (P16).

---

## T02: Support Inquiry Submission Mutation

### Objective

Create `convex/supportInquiries.ts` with a `submit` mutation: a public, rate-limited endpoint that validates the contact form fields and inserts a new `support_inquiries` record with `status: "OPEN"`. No authentication required.

### Required Reading

- `notes/features/15-public-pages.md` — "Contact Form" row in Contact Hub table (line 59), "Convex Functions" mutations section (lines 93-97), "Business Rules" rules 1-2 (lines 103-104), "Edge Cases" third bullet (line 127)
- `notes/10-convex-schema.md` — `support_inquiries` table definition (lines 737-760): all field validators, status union, indexes
- `notes/02-data-models.md` — Section V (Support Inquiry, lines 633-658): field descriptions, phone format note, public form note
- `notes/11-convex-architecture.md` — "Pattern 9: Error Handling" section (throw descriptive errors), rate limiter usage pattern
- Load `convex-api` skill — mutation API, rate limiter (`rateLimiter.limit`)

### Key Rules

1. Create `convex/supportInquiries.ts`. Import `mutation` from `./_generated/server` (NOT from `./functions`). **Why deviate from the `./functions` convention**: `notes/11-convex-architecture.md` says to use `./functions` for the audit wrapper. However, `./functions` wraps mutation with audit triggers that only fire for tables listed in `AUDITED_TABLES` (see `convex/functions.ts` line ~14). Since `support_inquiries` is NOT in that list, the wrapper adds zero audit value. Using the raw import makes the "no auth, no audit" intent explicit. If `support_inquiries` is later added to `AUDITED_TABLES`, update this import to `./functions`.
2. Import `rateLimiter` from `./rateLimiter`.
3. Args (match schema exactly):
   ```
   name: v.string()
   email: v.string()
   phone: v.optional(v.string())
   subject: v.string()
   message: v.string()
   preferred_contact_method: v.optional(v.union(
     v.literal("WHATSAPP"), v.literal("PHONE"), v.literal("EMAIL"), v.literal("IN_APP")
   ))
   persona_type: v.optional(v.union(
     v.literal("GUARD"), v.literal("TENANT"), v.literal("OWNER"), v.literal("OTHER")
   ))
   source_channel: v.optional(v.string())
   ip: v.string()
   ```
   Note: `ip` is accepted as an arg for rate limiting. It is NOT stored in the database (not a schema field).
4. Rate limit check — call first, before any validation or DB access:
   ```typescript
   await rateLimiter.limit(ctx, "public:support_inquiry", { key: args.ip, throws: true });
   ```
   If the limit is exceeded, `throws: true` causes Convex to throw automatically — no manual error needed.
5. Validate required string fields are non-empty after trimming: `name`, `email`, `subject`, `message`. Throw `new Error("Name is required")` etc. if blank after trim.
6. Validate email format with a basic regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Throw `new Error("Invalid email address")` if it fails.
7. If `phone` is provided, validate it is exactly 10 digits after stripping non-digit characters. Throw `new Error("Phone must be 10 digits")` if invalid. Store the normalized 10-digit string (no `+91`, no spaces).
8. Insert into `support_inquiries` with `status: "OPEN"`. Do NOT set `assigned_admin_id` (leave undefined). Do NOT store `ip` in the record.
9. Return the new record's `Id<"support_inquiries">`.
10. No auth check. No `requireGuard`, no `requireAdmin`, no `requirePermission`.
11. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/supportInquiries.ts` — `submit` mutation with rate limiting, field validation, and `support_inquiries` insert (status `OPEN`, no auth)

### Acceptance Criteria

1. Mutation inserts a `support_inquiries` record with `status: "OPEN"` and all provided fields.
2. `assigned_admin_id` is not set on creation.
3. `ip` arg is used for rate limiting only — not stored in the database.
4. Rate limit throws when exceeded (5 per hour per IP).
5. Empty `name`, `email`, `subject`, or `message` throws a descriptive error.
6. Invalid email format throws `"Invalid email address"`.
7. Phone (if provided) is validated as 10 digits and stored normalized (digits only).
8. No authentication required — callable from unauthenticated client components.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/supportInquiries.ts`. Confirm `mutation` is imported from `./_generated/server`. Confirm `ip` is not in the `ctx.db.insert` call. Confirm `status: "OPEN"` is hardcoded on insert.

### Out of Scope

- Featured listings query (T01), newsletter mutation (T03), rate limiter config (T03).
- Admin support inbox UI (P21).
- Support inquiry status transitions (P21).

---

## T03: Newsletter Subscription Mutation + Rate Limiter

### Objective

Create `convex/newsletterSubscriptions.ts` with a `subscribe` mutation: a public endpoint that upserts a `newsletter_subscriptions` record by email (update `subscribed_at` if the email already exists, insert if not). Also add the `public:support_inquiry` rate limiter entry to `convex/rateLimiter.ts` so T02's rate limit call resolves correctly.

### Required Reading

- `notes/features/15-public-pages.md` — "Newsletter Signup" row in Contact Hub table (line 62), "Business Rules" rule 3 (line 105), "Edge Cases" second bullet (line 126)
- `notes/10-convex-schema.md` — `newsletter_subscriptions` table definition (lines 762-766): `email` (string), `subscribed_at` (number), `source_page` (optional string), `by_email` index
- `notes/02-data-models.md` — Section W (Newsletter Subscription, lines 661-678): upsert behavior note, source_page examples
- `notes/11-convex-architecture.md` — "Pattern 1: The Central Import Point" section (rate limiter config pattern), `convex/rateLimiter.ts` structure
- Load `convex-api` skill — mutation API, `.withIndex`, `.first()`, `ctx.db.patch`, `ctx.db.insert`

### Key Rules

1. **Add the rate limiter entry first** (to `convex/rateLimiter.ts`) before writing the mutation, so the TypeScript compiler can validate the rate limiter key in T02. Add `"public:support_inquiry"` to the existing `RateLimiter` config object, matching the pattern of `"public:listing_inquiry"`:
   ```typescript
   "public:support_inquiry": {
     kind: "fixed window",
     period: 60 * 60 * 1000, // 1 hour
     rate: 5,
   },
   ```
2. Create `convex/newsletterSubscriptions.ts`. Import `mutation` from `./_generated/server` (NOT from `./functions`). Same rationale as T02 — `newsletter_subscriptions` is NOT in `AUDITED_TABLES`, so `./functions` wrapper adds zero audit value. See T02 Key Rule 1 for full explanation.
3. Args:
   ```
   email: v.string()
   source_page: v.optional(v.string())
   ```
4. Validate email format with a basic regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Throw `new Error("Invalid email address")` if it fails.
5. Upsert logic using the `by_email` index:

   ```typescript
   const existing = await ctx.db
     .query("newsletter_subscriptions")
     .withIndex("by_email", (q) => q.eq("email", args.email))
     .first();

   if (existing) {
     await ctx.db.patch(existing._id, { subscribed_at: Date.now() });
     return existing._id;
   } else {
     return await ctx.db.insert("newsletter_subscriptions", {
       email: args.email,
       subscribed_at: Date.now(),
       source_page: args.source_page,
     });
   }
   ```

6. Return the `Id<"newsletter_subscriptions">` in both branches (existing or new).
7. Double-subscribe is silently handled — same success response either way. The frontend shows the same "You're subscribed!" toast regardless.
8. No rate limiting on newsletter signup (only the contact form is rate-limited).
9. No auth check. No `requireGuard`, no `requireAdmin`, no `requirePermission`.
10. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/rateLimiter.ts` — `public:support_inquiry` rate limiter entry added (5 per hour, fixed window)
- [ ] `convex/newsletterSubscriptions.ts` — `subscribe` mutation with email validation, upsert-by-email logic, no auth

### Acceptance Criteria

1. `convex/rateLimiter.ts` contains `"public:support_inquiry"` with `kind: "fixed window"`, `period: 60 * 60 * 1000`, `rate: 5`.
2. `subscribe` mutation upserts by email: updates `subscribed_at` if email exists, inserts new record if not.
3. `source_page` is stored on insert; not updated on re-subscribe (only `subscribed_at` is patched).
4. Invalid email format throws `"Invalid email address"`.
5. Returns `Id<"newsletter_subscriptions">` in both insert and update paths.
6. No authentication required — callable from unauthenticated client components.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/rateLimiter.ts` and `convex/newsletterSubscriptions.ts`. Confirm `mutation` is imported from `./_generated/server` in `newsletterSubscriptions.ts`. Confirm the upsert uses `.withIndex("by_email", ...)` and not a full table scan. Confirm `source_page` is only set on insert (not patched on re-subscribe).

### Out of Scope

- Featured listings query (T01), support inquiry mutation (T02).
- Admin newsletter management UI (P21).
- Unsubscribe flow (V2).
- Email delivery / transactional email (V2).

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
