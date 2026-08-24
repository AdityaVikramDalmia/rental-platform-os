# Phase 6: Listings (P06)

## Overview

Listings are the public face of verified leads. Admin creates a listing from a VERIFIED lead, uploads photos, fills in rental details, and publishes to a shareable URL. The public listing page is server-rendered for SEO and social sharing, includes a WhatsApp deep link and a rate-limited contact form. This phase delivers the full listing lifecycle (DRAFT→PUBLISHED→ARCHIVED), photo management via Convex file storage, the public listing page with SSR, and the lead rejection cascade that auto-archives linked listings.

## Dependencies

| Phase / Epic                          | What It Provides for P06                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P04-E01 (Lead Submission Backend)** | `validateLeadTransition` helper, lead status machine foundation, `leads` table with all indexes                                                                                                               |
| **P04-E02 (Lead Admin Backend)**      | `leads.getById` returns full lead + building + society + guard joins (used to pre-fill listing creation form), `leads.reject` mutation (P06 adds cascade logic)                                               |
| **P05-E01 (Verification Backend)**    | Verified leads exist (`status === "VERIFIED"`), `leads.reject` extended with `VERIFIED → REJECTED` transition, `// TODO P06: Archive linked listing when verified lead is rejected` hook in `convex/leads.ts` |
| **P01-E03 (WorkOS Auth Config)**      | `convex/http.ts` exists with AuthKit routes registered — P06 adds the `/api/listing/:slug` endpoint to this file                                                                                              |
| **P01-E02 (Schema & Infra)**          | `convex/functions.ts` audit trigger wrapper — P06 adds `listings` to `AUDITED_TABLES`                                                                                                                         |

## Key Documentation

| Doc                                                                 | Section                                                     | Why You Need It                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `notes/features/05-listings.md`                                     | Full file                                                   | THE feature spec — listing creation, photo upload, slug generation, public page, contact form   |
| `notes/04-state-machines.md`                                        | Listing Status Machine                                      | All valid transitions, guard conditions (≥1 photo to publish), lead rejection cascade           |
| `notes/02-data-models.md`                                           | Sections H, H2, I (Listing, Listing Photo, Listing Inquiry) | Field reference with types, constraints, relationships                                          |
| `notes/10-convex-schema.md`                                         | `listings`, `listing_photos`, `listing_inquiries` tables    | Exact validators, indexes, 16 amenity literal types                                             |
| `notes/13-constants-reference.md`                                   | Listing statuses, permissions, audit actions, enums         | Canonical enum values, badge colors, permission strings, amenity list                           |
| `notes/11-convex-architecture.md`                                   | HTTP Router, File Upload, Soft Delete patterns              | Implementation patterns with code examples                                                      |
| `notes/06-admin-panel-ux.md`                                        | Listing creation/management sections                        | Admin-facing wireframes, field order, action buttons                                            |
| `notes/03-roles-and-permissions.md`                                 | Listing permissions                                         | RBAC matrix — `listings.create`, `listings.edit`, `listings.publish`, `listings.view_inquiries` |
| `notes/01-tech-stack.md`                                            | HTTP Router endpoint, file upload pattern                   | Architecture decisions for public listing delivery                                              |
| `notes/12-decisions-log.md`                                         | D11 (Photo ordering in separate table)                      | Why photos use `listing_photos` with `display_order` instead of inline array                    |
| `tasks/phase-05-owner-verification/P05-E01-verification-backend.md` | T04 (`leads.reject` extension + TODO P06 hook)              | Exact forward-coupling TODO comment that P06 must wire up                                       |
| `tasks/phase-04-lead-pipeline/P04-E02-lead-admin-backend.md`        | T01 (`leads.getById` return shape)                          | Lead data available for pre-filling listing creation form                                       |

## Epics

| ID      | Title                                                             | Tasks | Status | Depends On                  |
| ------- | ----------------------------------------------------------------- | ----- | ------ | --------------------------- |
| P06-E01 | [Listing Backend](P06-E01-listing-backend.md)                     | 5     | done   | [P05-E01, P04-E02, P01-E02] |
| P06-E02 | [Photo Management](P06-E02-photo-management.md)                   | 4     | done   | [P06-E01]                   |
| P06-E03 | [Admin Listing UI](P06-E03-admin-listing-ui.md)                   | 5     | done   | [P06-E02, P04-E03]          |
| P06-E04 | [Public Listing Page & Inquiries](P06-E04-public-listing-page.md) | 5     | done   | [P06-E01, P06-E02, P01-E03] |

## Dependency Graph

```
P05-E01 ──┐
P04-E02 ──┼──► P06-E01 ──┬──► P06-E02 ──► P06-E03
P01-E02 ──┘              │
                         └──► P06-E04  (parallel with E02→E03, after E01+E02)
P04-E03 ────────────────────────────► P06-E03
P01-E03 ────────────────────────────► P06-E04
```

**Parallel note**: E03 (Admin UI) and E04 (Public Page) can run in parallel once E01 and E02 are complete. E03 also depends on P04-E03 for existing admin UI patterns. E04 depends on P01-E03 for the existing `convex/http.ts` file.

## Execution Order

1. **P06-E01**: Listing Backend — CRUD mutations, slug generation, status transitions, lead rejection cascade wiring, listing queries
2. **P06-E02**: Photo Management — `generateUploadUrl`, photo CRUD, reordering, soft delete, max 10 enforcement
3. **P06-E03 + P06-E04** _(parallel)_: Admin Listing UI + Public Listing Page & Inquiries

## Completion Criteria

### Backend

- [ ] `convex/listings.ts` exists with all mutations and queries
- [ ] `listings.create` creates listing from VERIFIED lead, auto-generates slug, starts as DRAFT
- [ ] `listings.update` edits listing details (RBAC: `listings.edit`)
- [ ] `listings.publish` transitions DRAFT→PUBLISHED (requires ≥1 non-deleted photo), PUBLISHED→DRAFT (un-publish), PUBLISHED→ARCHIVED (archive), ARCHIVED→DRAFT (re-list) (RBAC: `listings.publish`)
- [ ] `listings.getById` returns listing + lead info + photo count + inquiry count (RBAC: `listings.view`)
- [ ] `getBySlugInternal` internal query — returns listing data WITHOUT owner info (replaces the `listings.getBySlug` public query from feature spec; public access is via HTTP Router endpoint `/api/listing/:slug` which calls this internal query)
- [ ] `listings.list` paginated with status/society filters (RBAC: `listings.view`)
- [ ] `listings.getInquiries` returns paginated inquiries for a listing (RBAC: `listings.view_inquiries`)
- [ ] `listings.submitInquiry` public mutation — creates `listing_inquiries` record with rate limiting (5/hour/IP)
- [ ] `listings.trackWhatsAppClick` public mutation — creates inquiry with `source: "WHATSAPP_CLICK"`
- [ ] Slug format: `{building}-{flat}-{society}-{bhk}` lowercased, hyphenated, collision suffix `-2`, `-3`
- [ ] `listings.generateUploadUrl` returns signed upload URL (RBAC: `listings.edit`)
- [ ] `listings.addPhoto` inserts `listing_photos` record with `storage_id` and `display_order` (RBAC: `listings.edit`)
- [ ] `listings.removePhoto` soft-deletes photo (`is_deleted: true`) (RBAC: `listings.edit`)
- [ ] `listings.reorderPhotos` updates `display_order` values (RBAC: `listings.edit`)
- [ ] Max 10 active (non-deleted) photos enforced server-side
- [ ] One listing per lead enforced (check `by_lead_id` index before insert)
- [ ] `convex/functions.ts` AUDITED*TABLES updated: `listings` added (NOT `listing_photos` — action literal union does not include `LISTING_PHOTOS*\*`)
- [ ] `convex/leads.ts` — `// TODO P06` wired up: when rejecting a VERIFIED lead with a linked PUBLISHED listing, auto-archive the listing
- [ ] `convex/http.ts` — `/api/listing/:slug` GET endpoint added with cache headers
- [ ] `getBySlugInternal` internal query for HTTP Router (returns listing + photos + building/society names, no owner info; returns `null` for DRAFT listings)
- [ ] All mutations use `mutation` from `./functions` (not `_generated/server`) for audit triggers
- [ ] All admin mutations check exact permission strings via `requirePermission`
- [ ] Soft delete filter on all `listing_photos` queries: `.filter(q => q.neq(q.field("is_deleted"), true))`

### Admin UI

- [ ] "Listings" nav item in admin sidebar
- [ ] Listing management page at `/admin/listings` with status filter tabs (ALL, DRAFT, PUBLISHED, ARCHIVED)
- [ ] Data table: columns (Listing, Society, Rent, Status, Inquiries, Created, Lead), sortable, paginated (20/page)
- [ ] "Create Listing" action — opens creation form with verified lead dropdown
- [ ] Listing creation form pre-fills fields from lead data (rent, furnishing, floor, available_from)
- [ ] Photo upload UI: drag & drop zone, max 10, client-side resize to ~1MB, JPEG/PNG/WebP
- [ ] Photo management: thumbnail grid, drag-to-reorder, delete button, cover image indicator
- [ ] Listing detail/edit page at `/admin/listings/[id]` with full form + photo manager + status controls
- [ ] Status toggle buttons: Publish (if DRAFT + ≥1 photo), Archive (if PUBLISHED), Re-list (if ARCHIVED)
- [ ] "Copy Public Link" and "Open Public Page" buttons
- [ ] Inquiry list section: name, phone (tel: link), message, source badge, timestamp
- [ ] Real-time updates via Convex subscriptions

### Public Page

- [ ] Public listing page at `/listing/[slug]` — server-rendered, no auth required
- [ ] Data fetched from Convex HTTP Router endpoint `/api/listing/:slug`
- [ ] Photo gallery/carousel with swipe and counter ("1/7")
- [ ] Listing details: title, rent, deposit, maintenance, furnishing, floor, area, parking, pet-friendly, amenities, description
- [ ] WhatsApp deep link button with pre-filled message template
- [ ] Contact form: name, phone, optional message — rate-limited (5/hour/IP)
- [ ] Contact form submits via Next.js Server Action (captures client IP for rate limiting)
- [ ] Archived listing shows "No longer available" page (does NOT 404)
- [ ] Owner info NEVER displayed on public page (enforced at query level)
- [ ] SEO meta tags: `generateMetadata` with `og:title`, `og:description`, `og:image` (cover photo), `twitter:card`
- [ ] JSON-LD structured data (`@type: Apartment` with address, price, floor size)

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] All status changes create `audit_logs` entries automatically via triggers
- [ ] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
convex/
  listings.ts                              # New: All listing mutations + queries + helpers
  functions.ts                             # Updated: listings added to AUDITED_TABLES
  leads.ts                                 # Updated: TODO P06 cascade wired up (archive listing on lead rejection)
  http.ts                                  # Updated: /api/listing/:slug GET endpoint added
  rateLimiter.ts                           # Updated: public:listing_inquiry rate limit rule added

src/app/
  (admin)/admin/listings/
    page.tsx                               # Listing management page
    [id]/
      page.tsx                             # Listing detail/edit page
    components/
      listing-table.tsx                    # Data table with columns, filters
      listing-status-tabs.tsx              # Status filter tabs
      listing-form.tsx                     # Create/edit form (react-hook-form + zod)
      photo-uploader.tsx                   # Drag & drop photo upload with client-side resize
      photo-manager.tsx                    # Grid with reorder, delete, cover indicator
      inquiry-list.tsx                     # Inquiry table with source badge
      listing-status-controls.tsx          # Publish/Archive/Re-list buttons
  listing/
    [slug]/
      page.tsx                             # Public listing page (SSR server component)
      components/
        photo-gallery.tsx                  # Carousel with swipe + counter
        listing-details.tsx                # Rent, deposit, amenities, description display
        whatsapp-button.tsx                # WhatsApp deep link with pre-filled message
        contact-form.tsx                   # Name, phone, message + rate limit feedback
        archived-notice.tsx                # "No longer available" display
      actions.ts                           # Server Actions: photo storage_id→URL resolution + contact form submission with IP capture

src/components/shared/
  listing-status-badge.tsx                 # Listing status badge (DRAFT/PUBLISHED/ARCHIVED)
```

## Scope Boundaries

### IN This Phase

- Listing creation from VERIFIED leads with slug generation
- Photo upload via Convex file storage (max 10, client-side resize, soft delete)
- Listing status lifecycle: DRAFT→PUBLISHED→ARCHIVED (all valid transitions)
- Lead rejection cascade: auto-archive linked listing when VERIFIED lead rejected
- Admin listing management table with filters, detail/edit page, photo manager
- Public listing page with SSR via HTTP Router endpoint
- SEO meta tags + JSON-LD structured data
- WhatsApp deep link button with click tracking
- Contact form with rate limiting (5/hour/IP via Server Action)
- Listing inquiry storage and admin inquiry list view
- System config keys: `demorentals_contact_phone`, `demorentals_whatsapp_phone` (read from `system_config`)

### NOT In This Phase

- Visit scheduling from listings → **P07 (Visit Management)**
- Closure + deal tracking from listings → **P08 (Closure)**
- Tenant browse/search/filter directory → **P16 (Tenant Browse)**
- Property detail page with full richness (commute calculator, roommate profiles, testimonials) → **P17 (Property Detail)**
- Tenant inquiry pipeline (inquiry→bounty→guard visit→closure) → **P19 (Tenant Inquiry Pipeline)**
- Photo optimization CDN / image resizing service → **V2**
- Listing analytics (views, clicks, conversion) → **P12 (Analytics)**
- i18n for public listing page → **P14 (i18n)**
