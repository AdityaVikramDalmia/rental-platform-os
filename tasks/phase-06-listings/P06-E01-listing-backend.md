---
id: P06-E01
title: Listing Backend
phase: 6
status: done
depends_on: ["P05-E01", "P04-E02", "P01-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P06-E01: Listing Backend

## Overview

Implement the listing backend foundation for Phase 6: schema + audit registration, listing CRUD with deterministic slug generation, listing status transition enforcement, lead rejection cascade wiring, and public inquiry/query primitives consumed by the HTTP Router in E04.

## Prerequisites

- **Read first**: [P05-E01 Completion Summary](../phase-05-owner-verification/P05-E01-verification-backend.md#completion-summary) — understand VERIFIED lead rejection support and the exact `// TODO P06` hook in `convex/leads.ts`.
- **Read first**: [P04-E02 Completion Summary](../phase-04-lead-pipeline/P04-E02-lead-admin-backend.md#completion-summary) — reuse established admin mutation/query + RBAC style in `convex/leads.ts`.
- **Read first**: [P01-E02 Completion Summary](../phase-01-auth/P01-E02-schema-and-infra.md#completion-summary) — preserve schema/index conventions and `AUDITED_TABLES` trigger wiring pattern.
- P05 verification backend is complete and VERIFIED leads exist for listing creation.

## Task Queue

- [x] P06-E01-T01: Schema Registration + Audit Table Registration
- [x] P06-E01-T02: Listing CRUD (`create`, `update`, `getById`, `list`) + Slug Generation
- [x] P06-E01-T03: Listing Status Transition Mutation (`listings.publish`)
- [x] P06-E01-T04: Lead Rejection Cascade (`leads.reject` -> Listing Archive)
- [x] P06-E01-T05: Public Inquiry Rate Limit + Inquiry Mutations + `getBySlugInternal` + `getInquiries`

---

## T01: Schema Registration + Audit Table Registration

### Objective

Register listing domain tables in schema and ensure listing writes are automatically audited via trigger-backed mutation wrappers.

### Required Reading

- `notes/10-convex-schema.md` — "Full Schema" section (`listings`, `listing_photos`, `listing_inquiries` table definitions + indexes)
- `notes/02-data-models.md` — Sections H, H2, I (Listing, Listing Photo, Listing Inquiry field semantics)
- `notes/11-convex-architecture.md` — "Function Layer Architecture" -> "Wrapped Mutations (Audit + Auth)"
- `notes/13-constants-reference.md` — "Listing Status", "Listing Inquiry Source", "Audit Action Strings -> Listings"

### Key Rules

1. In `convex/schema.ts`, add `listings`, `listing_photos`, and `listing_inquiries` with exact field validators and index names from docs (`by_lead_id`, `by_slug`, `by_status`, `by_listing_id`).
2. Use literal unions for status/source/furnishing/parking/amenities exactly as documented; do not broaden to `v.string()` for enum-like fields.
3. In `convex/functions.ts`, append `"listings"` to `AUDITED_TABLES` so wrapper triggers emit `LISTINGS_INSERT` / `LISTINGS_UPDATE` automatically. Do NOT add `listing_photos` — the `audit_logs.action` literal union in `notes/10-convex-schema.md` does not include `LISTING_PHOTOS_*` entries, and no source doc requires photo-level audit trails. Photo operations are implicitly tracked via listing-level audit events.
4. Do NOT add `listing_inquiries` to `AUDITED_TABLES` either — keep audit coverage aligned to the documented action literals.
5. Preserve soft-delete model for photos: `listing_photos.is_deleted` is required and query filtering is enforced in downstream tasks.
6. Do not add manual `audit_logs` inserts anywhere; trigger wrapper remains the only audit mechanism.

### Deliverables

- [ ] `convex/schema.ts` — Add `listings`, `listing_photos`, `listing_inquiries` tables with required indexes
- [ ] `convex/functions.ts` — Add `listings` to `AUDITED_TABLES` (NOT `listing_photos` — see Key Rules)

### Acceptance Criteria

1. `convex/schema.ts` contains all three listing tables with exact validators and index names defined in this epic spec.
2. `listings.status` is `DRAFT | PUBLISHED | ARCHIVED` via literal union (not free-form string).
3. `listing_photos` includes required `is_deleted: v.boolean()` and `by_listing_id` index.
4. `listing_inquiries.source` is `CONTACT_FORM | WHATSAPP_CLICK` via literal union.
5. `AUDITED_TABLES` includes `listings` (and does NOT include `listing_photos` or `listing_inquiries`).
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Confirm schema/index names exactly match docs and trigger registration changes compile.

### Out of Scope

- Listing domain mutation/query implementation
- Lead rejection cascade wiring
- Public listing HTTP endpoint registration

---

## T02: Listing CRUD (`create`, `update`, `getById`, `list`) + Slug Generation

### Objective

Create the listing domain module and implement admin CRUD surfaces for creating/editing and retrieving listings, including deterministic slug generation with collision handling.

### Required Reading

- `notes/features/05-listings.md` — "Admin Flow: Create Listing", "Convex Functions", "Slug Generation", "Business Rules"
- `notes/10-convex-schema.md` — `listings`, `listing_photos`, `listing_inquiries`, `leads` table validators/indexes
- `notes/13-constants-reference.md` — "Listing Management" permissions, listing enums (`BHK`, `Furnishing`, `Parking`), listing status literals
- `notes/03-roles-and-permissions.md` — "Listing Management" permission ownership (`listings.create`, `listings.edit`, `listings.view`)
- `notes/11-convex-architecture.md` — "Function Organization" import/query style and RBAC patterns
- `tasks/phase-04-lead-pipeline/P04-E02-lead-admin-backend.md` — query payload composition style for admin detail views

### Key Rules

1. Create `convex/listings.ts`; keep listing domain functions isolated from `convex/leads.ts` except explicit cascade integration in T04.
2. Import `mutation` from `./functions`; import `query`/`internalQuery` from `./_generated/server`; use `requirePermission` for admin RBAC gates.
3. `listings.create` requires `listings.create`, verifies source lead is `VERIFIED`, and rejects non-VERIFIED leads with explicit errors.
4. Enforce one listing per lead via `listings.by_lead_id` index check before insert; throw if a listing already exists.
5. Generate slug from `{building_name}-{flat_number}-{society_name}-{bhk_config}` -> lowercase -> non-alphanumeric to `-` -> collapse hyphens -> trim hyphens; resolve collisions by checking `by_slug` and appending `-2`, `-3`, etc.
6. `listings.create` must insert with `status: "DRAFT"`, `created_by_admin_id` from auth context, paise fields as integers (`rent_monthly`, `deposit`, `maintenance`), and `available_from` as Unix ms.
7. `listings.update` requires `listings.edit`; update editable listing fields only (no lead reassignment, no ad-hoc status transitions).
8. `listings.getById` and `listings.list` require `listings.view`; return admin-useful payloads (listing record + linked lead/building/society context + inquiry/photo counts where applicable) using index-backed queries.

### Deliverables

- [ ] `convex/listings.ts` — Add helper(s) for slug normalization + collision-safe slug generation
- [ ] `convex/listings.ts` — Add `listings.create` mutation with VERIFIED-lead + uniqueness guards
- [ ] `convex/listings.ts` — Add `listings.update` mutation (`listings.edit`)
- [ ] `convex/listings.ts` — Add `listings.getById` query (`listings.view`)
- [ ] `convex/listings.ts` — Add `listings.list` paginated query (`listings.view`)

### Acceptance Criteria

1. `listings.create` succeeds only when `lead.status === "VERIFIED"` and caller has `listings.create`.
2. Attempting to create a second listing for the same lead fails with explicit one-listing-per-lead error.
3. Slug generation follows required transformation rules and produces numeric suffixes (`-2`, `-3`, ...) on collisions.
4. New listings are always created in `DRAFT` with `created_by_admin_id` set to the authenticated admin user ID.
5. `listings.update` is permission-gated by `listings.edit` and does not permit arbitrary status transition bypass.
6. `listings.getById` returns listing + linked lead/building/society context + inquiry/photo counts for admin detail views.
7. `listings.list` returns paginated results and supports documented filters without table-scan-only implementation.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual mutation smoke checks: create listing from VERIFIED lead, verify slug and DRAFT state, then update and query via getById/list.

### Out of Scope

- Photo upload/add/remove/reorder mutations (P06-E02)
- Listing publish/archive/re-list transitions (T03)
- Public inquiry mutations and internal slug query for HTTP Router (T05)

---

## T03: Listing Status Transition Mutation (`listings.publish`)

### Objective

Implement strict listing status lifecycle transitions with publish guard conditions (>=1 active photo).

### Required Reading

- `notes/features/05-listings.md` — "Listing Status" + "Business Rules"
- `notes/04-state-machines.md` — "Listing Status" transition table
- `notes/10-convex-schema.md` — `listings.status` union + `listing_photos` soft-delete shape
- `notes/13-constants-reference.md` — listing status literals + `listings.publish` permission
- `notes/03-roles-and-permissions.md` — listing publish permission semantics
- `notes/02-data-models.md` — Section H2 soft-delete photo behavior (active photo count semantics)

### Key Rules

1. Implement `listings.publish` in `convex/listings.ts` as the single status-transition mutation for this epic.
2. Require `requirePermission(ctx, "listings.publish")` before any state change.
3. Allow only these transitions: `DRAFT -> PUBLISHED`, `PUBLISHED -> DRAFT`, `PUBLISHED -> ARCHIVED`, `ARCHIVED -> DRAFT`; reject every other pair.
4. Enforce publish guard: `DRAFT -> PUBLISHED` requires at least one non-deleted photo from `listing_photos` (`by_listing_id` + `is_deleted !== true`).
5. Do not require photos for unpublish/archive/re-list transitions.
6. Keep transition validation explicit in code (map/helper); do not hardcode partial conditional branches that can silently drift from state-machine docs.
7. Continue using wrapped mutations from `./functions` so status updates emit listing audit events automatically.

### Deliverables

- [ ] `convex/listings.ts` — Add `listings.publish` mutation with transition validation
- [ ] `convex/listings.ts` — Add active-photo guard check for `DRAFT -> PUBLISHED`

### Acceptance Criteria

1. `DRAFT -> PUBLISHED` succeeds only when at least one active (non-deleted) photo exists.
2. `PUBLISHED -> DRAFT` succeeds (unpublish-to-edit flow).
3. `PUBLISHED -> ARCHIVED` succeeds (manual archive flow).
4. `ARCHIVED -> DRAFT` succeeds (re-list flow).
5. Invalid transitions (for example `DRAFT -> ARCHIVED` direct) throw explicit errors.
6. Mutation fails without `listings.publish` permission.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Mutation smoke checks: attempt all valid paths and one invalid path; verify photo guard only applies to publish.

### Out of Scope

- Photo CRUD/reorder APIs (P06-E02)
- Admin UI status controls/buttons (P06-E03)
- HTTP Router integration for public page (P06-E04)

---

## T04: Lead Rejection Cascade (`leads.reject` -> Listing Archive)

### Objective

Wire the P05 forward-coupling TODO in `leads.reject` so rejecting a VERIFIED lead automatically archives its linked published listing.

### Required Reading

- `tasks/phase-05-owner-verification/P05-E01-verification-backend.md` — T04 (`leads.reject` extension + exact `// TODO P06` hook)
- `tasks/phase-04-lead-pipeline/P04-E02-lead-admin-backend.md` — existing `leads.reject` contract and notes-thread behavior
- `notes/features/05-listings.md` — "Edge Cases" (lead rejected after listing created)
- `notes/04-state-machines.md` — Lead + Listing status transitions
- `notes/10-convex-schema.md` — `listings.by_lead_id` index and listing status validator
- `notes/13-constants-reference.md` — lead/listing status literals + listing audit action mapping

### Key Rules

1. Extend existing `leads.reject` in `convex/leads.ts`; do not create a separate rejection mutation for listing-aware behavior.
2. Preserve existing `leads.reject` semantics from P04/P05: `leads.reject` permission gate, transition validation, and notes-thread append behavior.
3. Replace `// TODO P06` with concrete cascade logic: query listing by `by_lead_id` for the rejected lead.
4. If linked listing exists and current listing status is `PUBLISHED`, patch listing status to `ARCHIVED` in the same mutation flow.
5. If linked listing is `DRAFT` or `ARCHIVED`, do nothing (no redundant writes).
6. Keep this cascade scoped to reject flow; do not introduce public-page or visit-side effects here.
7. Do not add manual audit writes; rely on wrapped mutation trigger behavior (listing updates audited once T01 registration is done).

### Deliverables

- [ ] `convex/leads.ts` — `leads.reject` TODO block replaced with listing archive cascade
- [ ] `convex/leads.ts` — Cascade guarded to affect only linked `PUBLISHED` listings

### Acceptance Criteria

1. Rejecting a VERIFIED lead with linked `PUBLISHED` listing transitions the listing to `ARCHIVED`.
2. Rejecting a VERIFIED lead with linked `DRAFT` listing leaves listing status unchanged.
3. Rejecting a lead with no linked listing still succeeds with no cascade errors.
4. Existing rejection note append (`Rejected: ...`, `author_type: "ADMIN"`) remains intact.
5. Mutation remains permission-gated by `leads.reject`.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual behavior checks: reject a VERIFIED lead with published listing and verify archival; reject one with draft listing and verify no change.

### Out of Scope

- Visit cancellation cascade (P07)
- Public listing HTTP endpoint behavior
- Admin confirmation dialog UX copy

---

## T05: Public Inquiry Rate Limit + Inquiry Mutations + `getBySlugInternal` + `getInquiries`

### Objective

Implement the public inquiry backend surfaces: rate limiter rule, contact/WhatsApp inquiry mutations, internal slug query consumed by the HTTP Router in E04, and admin inquiry listing query.

### Required Reading

- `notes/features/05-listings.md` — "Contact Form Submission", "Privacy", "Convex Functions", "Business Rules"
- `notes/11-convex-architecture.md` — "HTTP Router (Public Endpoints)" + "Rate Limiter"
- `notes/10-convex-schema.md` — `listing_inquiries`, `listing_photos`, `listings` tables + "Rate Limiter Configuration"
- `notes/13-constants-reference.md` — "Listing Inquiry Source", listing status literals, amenities list
- `notes/02-data-models.md` — Sections H, H2, I (public payload constraints, photo ordering, inquiry fields)
- `notes/03-roles-and-permissions.md` — confirm listings are admin-gated except public inquiry mutations

### Key Rules

1. In `convex/rateLimiter.ts`, add `"public:listing_inquiry": { kind: "fixed window", rate: 5, period: HOUR }` exactly.
2. Implement `listings.submitInquiry` as a public mutation (no `requireGuard`, no `requirePermission`) that rate-limits by client IP key and inserts `listing_inquiries` row with `source: "CONTACT_FORM"`.
3. Normalize inquiry phone to 10-digit storage format before insert; keep message optional and store timestamps via Convex `_creationTime`.
4. Implement `listings.trackWhatsAppClick` as a public mutation that inserts `listing_inquiries` with `source: "WHATSAPP_CLICK"`, using a schema-valid name/phone strategy consistently.
5. Implement `getBySlugInternal` as an `internalQuery` in `convex/listings.ts` for HTTP Router consumption (`ctx.runQuery(internal.listings.getBySlugInternal, { slug })`).
6. `getBySlugInternal` must return listing core fields + non-deleted photos ordered by `display_order` (returning `storage_id` values, NOT resolved URLs — per `notes/11-convex-architecture.md` line 449, "HTTP endpoint returns `listing_photos` with `storage_id` values" to keep the endpoint simple and cacheable) + joined `building_name`, `society_name`, `flat_number`, and listing `floor_number`.
7. Enforce privacy at query level: never include owner name/phone, guard identity, or other private lead/operator data in returned payload.
8. Status handling for `getBySlugInternal`: return `null` when slug does not exist OR when listing status is `DRAFT` (DRAFT listings are not publicly visible per `notes/04-state-machines.md`). Return listing data for `PUBLISHED` and `ARCHIVED` slugs — the page component decides render mode (full view vs archived notice).
9. Implement `listings.getInquiries` as an admin query gated by `requirePermission(ctx, "listings.view_inquiries")`, returning paginated `listing_inquiries` for a given `listing_id` with columns: name, phone, message, source, `_creationTime`.

### Deliverables

- [ ] `convex/rateLimiter.ts` — Add `public:listing_inquiry` fixed-window rule (`5/HOUR`)
- [ ] `convex/listings.ts` — Add public `listings.submitInquiry` mutation
- [ ] `convex/listings.ts` — Add public `listings.trackWhatsAppClick` mutation
- [ ] `convex/listings.ts` — Add `internalQuery` export `getBySlugInternal`
- [ ] `convex/listings.ts` — Add `listings.getInquiries` paginated query (`listings.view_inquiries`)

### Acceptance Criteria

1. Rate limiter config includes `public:listing_inquiry` with fixed-window period `HOUR` and rate `5`.
2. `listings.submitInquiry` enforces rate limiting by IP key and inserts `listing_inquiries` with `source: "CONTACT_FORM"`.
3. `listings.trackWhatsAppClick` inserts `listing_inquiries` with `source: "WHATSAPP_CLICK"` using schema-valid required fields (e.g., `name: "WhatsApp Click"`, `phone: "0000000000"` as tracking placeholder).
4. `getBySlugInternal` returns ordered non-deleted photos (`display_order` ascending) plus joined building/society/flat context.
5. `getBySlugInternal` payload omits owner and guard private fields.
6. `getBySlugInternal` returns `null` for unknown slug AND for `DRAFT` listings (DRAFT = not publicly visible).
7. `getBySlugInternal` returns data for `PUBLISHED` and `ARCHIVED` listings (page component decides archived notice vs full view).
8. `listings.getInquiries` returns paginated inquiries for a listing with name, phone, message, source, timestamp.
9. `listings.getInquiries` is gated by `requirePermission(ctx, "listings.view_inquiries")`.
10. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: hit inquiry mutations with repeated IP key to verify throttling; run `getBySlugInternal` on published and archived slugs and compare payload shape/privacy.

### Out of Scope

- Adding `/api/listing/:slug` route in `convex/http.ts` (P06-E04)
- Next.js public page UI and Server Action wiring (P06-E04)
- Photo upload/remove/reorder mutation implementation (P06-E02)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- `convex/listings.ts` (668 lines) — Full listing backend: create, update, getById, list, publish, submitInquiry, trackWhatsAppClick, getBySlugInternal, getInquiries
- Deterministic slug generation with collision handling (-2, -3 suffixes)
- Listing status machine: DRAFT→PUBLISHED (photo guard), PUBLISHED→DRAFT, PUBLISHED→ARCHIVED, ARCHIVED→DRAFT
- Lead rejection cascade in `convex/leads.ts`: auto-archives PUBLISHED listing when linked VERIFIED lead is rejected
- Rate limiter: `public:listing_inquiry` (5/hour/IP) in `convex/rateLimiter.ts`
- Audit: "listings" added to AUDITED_TABLES in `convex/functions.ts`

### Key File Locations

- `convex/listings.ts` — All listing domain functions
- `convex/functions.ts:20` — "listings" in AUDITED_TABLES
- `convex/leads.ts:494-502` — Lead rejection cascade (TODO P06 wired)
- `convex/rateLimiter.ts:10-14` — public:listing_inquiry rule

### Deviations from Spec

None. All 5 tasks implemented exactly as specified.

### Gotchas for Next Epic

- `listing_photos` is NOT in AUDITED_TABLES — photo writes won't emit individual audit events
- `getBySlugInternal` returns `storage_id` array (not resolved URLs) — photo URL resolution happens in E04 via Server Actions or direct Convex storage URL construction
- `submitInquiry` requires `ip` argument — must be captured from request headers in the Server Action layer
