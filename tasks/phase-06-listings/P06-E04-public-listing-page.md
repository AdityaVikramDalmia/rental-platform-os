---
id: P06-E04
title: "Public Listing Page & Inquiries"
phase: 6
status: done
depends_on: ["P06-E01", "P06-E02", "P01-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P06-E04: Public Listing Page & Inquiries

## Overview

Deliver the public listing experience at `/listing/[slug]` with SSR, SEO metadata, JSON-LD, inquiry capture, and WhatsApp conversion CTA. This epic extends the existing P01 HTTP Router with a listing endpoint, builds the public page component stack, and enforces strict public-data privacy (no owner/guard exposure).

## Prerequisites

- **Read first**: [P06-E01 Completion Summary](P06-E01-listing-backend.md#completion-summary) — confirm `listings.getBySlugInternal`, `listings.submitInquiry`, and `listings.trackWhatsAppClick` contracts are implemented.
- **Read first**: [P06-E02 Completion Summary](P06-E02-photo-management.md#completion-summary) — confirm photo query/URL resolution approach and active photo ordering behavior.
- **Read first**: [P01-E03 Completion Summary](../phase-01-auth/P01-E03-workos-auth-config.md#completion-summary) — understand existing `convex/http.ts` routes and preserve AuthKit route wiring.
- `convex/http.ts` already exists from P01-E03; P06-E04 adds `/api/listing/:slug` to the existing router and does not create a new router file.

## Task Queue

- [x] P06-E04-T01: Add `/api/listing/:slug` HTTP Router Endpoint
- [x] P06-E04-T02: Build SSR Public Listing Page + Archived Listing Handling
- [x] P06-E04-T03: Implement SEO Metadata + JSON-LD (`Apartment`)
- [x] P06-E04-T04: WhatsApp CTA + Server Action Contact Form
- [x] P06-E04-T05: Photo Gallery + Listing Details Components + Privacy/Regression Verification

---

## T01: Add `/api/listing/:slug` HTTP Router Endpoint

### Objective

Extend the existing Convex HTTP router with the public listing slug endpoint so Next.js server components can fetch listing payloads with cache-friendly headers.

### Required Reading

- `notes/11-convex-architecture.md` — HTTP Router section (public endpoint pattern + cache behavior)
- `notes/01-tech-stack.md` — HTTP Router endpoint pattern and architecture rationale
- `notes/features/05-listings.md` — public listing endpoint contract and privacy expectations
- `tasks/phase-01-auth/P01-E03-workos-auth-config.md` — existing `convex/http.ts` baseline and route registration context
- `notes/13-constants-reference.md` — listing statuses and canonical naming

### Key Rules

1. Update existing `convex/http.ts`; do not create a new HTTP router file.
2. Add `GET /api/listing/:slug` route that calls `internal.listings.getBySlugInternal` with slug parsed from URL path.
3. Return `404` JSON (`{ "error": "Not found" }`) with `Content-Type: application/json` when slug does not resolve.
4. Success response must include exact cache header: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
5. Preserve all existing P01 AuthKit routes and exports in `convex/http.ts`.
6. Endpoint payload must remain public-safe: no owner name/phone, no guard identity, no private admin-only fields.

### Deliverables

- [ ] `convex/http.ts` — Add `/api/listing/:slug` GET route wired to `internal.listings.getBySlugInternal`
- [ ] `convex/http.ts` — Add 404 + cache-control response behavior per spec

### Acceptance Criteria

1. `GET /api/listing/:slug` returns listing JSON when slug exists.
2. Missing slug returns HTTP 404 with `{ "error": "Not found" }` response body.
3. Success responses include `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
4. Existing non-listing routes in `convex/http.ts` continue working unchanged.
5. Response payload excludes owner/guard info.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual request checks: one valid slug and one invalid slug against `/api/listing/:slug`; verify status codes, JSON payload, and cache header.

### Out of Scope

- Listing CRUD/status mutation logic
- Admin listing management UI
- Contact form submission handling

---

## T02: Build SSR Public Listing Page + Archived Listing Handling

### Objective

Create the public page server component that SSR-renders listing content from the HTTP endpoint while handling missing and archived listings with the correct UX behavior.

### Required Reading

- `notes/features/05-listings.md` — public listing page wireframe and archived listing behavior
- `notes/11-convex-architecture.md` — HTTP Router + Next.js Server Component consumption pattern
- `notes/01-tech-stack.md` — App Router conventions for SSR routes
- `notes/13-constants-reference.md` — listing status literals (`PUBLISHED`, `ARCHIVED`)

### Key Rules

1. Build `src/app/listing/[slug]/page.tsx` as an SSR server component that fetches listing data from `/api/listing/:slug`.
2. Use `notFound()` when the API returns 404 — this covers both non-existent slugs AND `DRAFT` listings (the HTTP Router endpoint returns 404 for DRAFT status, enforcing "DRAFT = not publicly visible" per `notes/04-state-machines.md`).
3. For `listing.status === "ARCHIVED"`, do not 404; render a friendly "No longer available" notice and keep URL alive.
4. Archived listings must hide inquiry entry points: no WhatsApp button, no contact phone, and no contact form.
5. Do not implement `generateStaticParams`; listing pages are dynamic and SSR-driven.
6. Keep mobile-first layout shape aligned to feature spec (gallery -> details -> contact section).

### Deliverables

- [ ] `src/app/listing/[slug]/page.tsx` — SSR public page data fetch + notFound/archived branching
- [ ] `src/app/listing/[slug]/components/archived-notice.tsx` — archived listing notice component

### Acceptance Criteria

1. `/listing/[slug]` renders server-side with listing data for valid PUBLISHED slug.
2. Missing slug or DRAFT slug triggers `notFound()` behavior (API returns 404 for both).
3. Archived listing slug renders "No longer available" notice and stays publicly accessible.
4. Archived listing view does not render WhatsApp CTA, contact phone, or inquiry form.
5. Page keeps public-safe field rendering (society/building/floor/flat shown; owner/guard hidden).
6. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual SSR checks: load one published slug, one archived slug, and one invalid slug.

### Out of Scope

- SEO metadata implementation (handled in T03)
- Contact form server action wiring (handled in T04)

---

## T03: Implement SEO Metadata + JSON-LD (`Apartment`)

### Objective

Add search/social metadata and structured data to the listing page so shared links and crawlers get rich, listing-specific content.

### Required Reading

- `notes/features/05-listings.md` — SEO requirements for public listing pages
- `notes/01-tech-stack.md` — SSR/public page architecture references
- `notes/11-convex-architecture.md` — public listing endpoint payload semantics
- `notes/13-constants-reference.md` — listing statuses and canonical value usage

### Key Rules

1. Add `generateMetadata` in `src/app/listing/[slug]/page.tsx` using fetched listing data.
2. Metadata must include `og:title`, `og:description`, `og:image` (from cover photo when available), and `twitter.card = "summary_large_image"`.
3. Inject JSON-LD script with `@type: "Apartment"` and include name, description, floorLevel, optional floorSize, petsAllowed, and Offer pricing/availability.
4. Map availability from listing status: `PUBLISHED -> InStock`, otherwise `OutOfStock`.
5. Guard against absent cover photo URL and absent carpet area values without breaking metadata generation.
6. Do not include owner identity or private contact data in metadata or JSON-LD.

### Deliverables

- [ ] `src/app/listing/[slug]/page.tsx` — `generateMetadata` implementation with Open Graph and Twitter tags
- [ ] `src/app/listing/[slug]/page.tsx` — JSON-LD `Apartment` script injection

### Acceptance Criteria

1. Public listing page returns listing-specific title and description metadata.
2. Open Graph metadata includes image when cover photo URL exists.
3. Twitter metadata includes `summary_large_image` card type.
4. JSON-LD script is present and valid JSON with `@type: "Apartment"`.
5. JSON-LD Offer availability reflects listing status (`PUBLISHED` vs archived/unavailable).
6. Metadata/JSON-LD does not expose owner/guard identity.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Inspect rendered page source for metadata tags and `application/ld+json` block.

### Out of Scope

- Analytics instrumentation for SEO impressions
- `generateStaticParams` pre-rendering

---

## T04: WhatsApp CTA + Server Action Contact Form

### Objective

Implement inquiry conversion pathways: a tracked WhatsApp deep link and a server-action contact form with IP-based rate limiting.

### Required Reading

- `notes/features/05-listings.md` — WhatsApp CTA and inquiry form workflow
- `notes/11-convex-architecture.md` — server action and public endpoint patterns
- `notes/01-tech-stack.md` — HTTP/public architecture constraints
- `notes/10-convex-schema.md` — `listing_inquiries` field requirements
- `notes/13-constants-reference.md` — system config keys and inquiry source literals

### Key Rules

1. Implement `src/app/listing/[slug]/components/whatsapp-button.tsx` with deep link format `https://wa.me/{demorentals_whatsapp_phone}?text={encoded_message}`.
2. Prefilled message must include listing context: BHK, society/building, floor, rent, and public listing URL.
3. Resolve `demorentals_whatsapp_phone` from `system_config` (key: `demorentals_whatsapp_phone`); do not hardcode numbers.
4. Resolve `demorentals_contact_phone` from `system_config` (key: `demorentals_contact_phone`) and display as clickable `tel:+91{phone}` link with `+91 XXXXX XXXXX` formatted display below the WhatsApp CTA, per the public page wireframe in `notes/features/05-listings.md`.
5. On WhatsApp CTA click, call `listings.trackWhatsAppClick({ listing_id })` to persist inquiry with source `WHATSAPP_CLICK`.
6. Implement `src/app/listing/[slug]/components/contact-form.tsx` with `react-hook-form` + `zod` (`name` min 2 chars, `phone` exactly 10 digits, optional `message`).
7. Submit inquiry via Next.js Server Action in `src/app/listing/[slug]/actions.ts` (not direct client mutation).
8. Server Action must capture client IP from `x-forwarded-for` header and pass it into `listings.submitInquiry` for `public:listing_inquiry` (5/hour/IP) enforcement.
9. UX feedback via toasts: success -> `Thanks! We'll be in touch soon.`; rate limit -> `Too many inquiries. Try again in 1 hour.`.
10. Archived listings must not render WhatsApp CTA, contact phone, or contact form.

### Deliverables

- [ ] `src/app/listing/[slug]/components/whatsapp-button.tsx` — deep link + click-tracking behavior
- [ ] `src/app/listing/[slug]/components/contact-form.tsx` — validated inquiry form UI and submit states
- [ ] `src/app/listing/[slug]/actions.ts` — server action(s) for inquiry submission and IP capture

### Acceptance Criteria

1. WhatsApp button opens `wa.me` URL with correctly encoded listing message.
2. WhatsApp click tracking mutation fires with `listing_id`.
3. DemoRentals contact phone displays as clickable `tel:` link with `+91` formatted number below WhatsApp CTA.
4. Contact form rejects invalid name/phone via zod validation.
5. Valid form submission persists inquiry and shows success toast.
6. Rate-limited submissions show "Too many inquiries. Try again in 1 hour.".
7. Inquiry submit flow uses Server Action path and captures client IP.
8. Archived listings do not show CTA, contact phone, or form.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual checks: submit one valid inquiry, trigger rate limit scenario, and validate WhatsApp URL text payload.

### Out of Scope

- Admin inquiry management UI
- Tenant inquiry bounty pipeline

---

## T05: Photo Gallery + Listing Details Components + Privacy/Regression Verification

### Objective

Build reusable public listing UI components for media/details and verify end-to-end public-page behavior, privacy boundaries, and non-regression against phase acceptance criteria.

### Required Reading

- `notes/features/05-listings.md` — public page layout block and listing detail fields
- `notes/11-convex-architecture.md` — file URL resolution (`ctx.storage.getUrl`) and SSR data flow guidance
- `notes/10-convex-schema.md` — listing + listing photo field semantics
- `notes/13-constants-reference.md` — furnishing/parking/pet-friendly literals and listing statuses
- `tasks/phase-06-listings/README.md` — P06 public-page completion criteria checklist

### Key Rules

1. Implement `src/app/listing/[slug]/components/photo-gallery.tsx` as mobile-first swipeable gallery with visible `current/total` counter (e.g., `1/7`).
2. Implement `src/app/listing/[slug]/components/listing-details.tsx` with required public fields: rent, deposit, maintenance, furnishing, floor, area, parking, pet-friendly, amenities, description, and availability date.
3. The HTTP Router endpoint returns photo `storage_id` values (NOT resolved URLs) to keep the endpoint simple and cacheable (per `notes/11-convex-architecture.md` line 449). Resolve `storage_id → URL` via a Server Action in `actions.ts` that calls a Convex query using `ctx.storage.getUrl()`. Never render raw storage IDs in UI.
4. Keep monetary display rupee-formatted from paise source values; no float persistence or client-side schema drift.
5. Enforce privacy at render layer and query contract: owner name/phone and guard identity must never appear on public page.
6. Verify end-to-end public page behavior: SSR rendering, metadata present, WhatsApp deep link, inquiry rate-limit UX, archived listing fallback.

### Deliverables

- [ ] `src/app/listing/[slug]/components/photo-gallery.tsx` — swipe gallery with counter and empty-state fallback
- [ ] `src/app/listing/[slug]/components/listing-details.tsx` — details block with formatted public listing attributes
- [ ] `src/app/listing/[slug]/actions.ts` — Server Actions for: (1) photo `storage_id → URL` resolution via Convex query, (2) inquiry submission with IP capture
- [ ] `src/app/listing/[slug]/page.tsx` — integration of gallery/details/contact/archive components

### Acceptance Criteria

1. Photo gallery renders ordered images with swipe navigation and visible counter.
2. Listing details section displays all required public attributes with readable formatting.
3. SSR page output includes gallery/details for published listing slugs.
4. Public page never exposes owner/guard private data.
5. End-to-end checks pass for SEO tags, WhatsApp CTA, inquiry form + rate limit, and archived listing behavior.
6. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual regression walk:

- Published listing: gallery, details, metadata, WhatsApp, inquiry success
- Archived listing: archived notice only, no CTA/form
- Invalid slug: notFound
- Response payload/source check: owner/guard fields absent

### Out of Scope

- Admin listing CRUD/status controls
- Photo upload/reorder/delete mutations
- Tenant browse/search directory features

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- `convex/http.ts` — GET `/api/listing/{slug}` endpoint using `pathPrefix`, with 404 JSON + cache headers (s-maxage=60, stale-while-revalidate=300)
- `/listing/[slug]` — SSR server component with `generateMetadata` (og:title, og:description, og:image, twitter:summary_large_image) + JSON-LD `Apartment` schema
- Photo gallery — client component with swipe navigation, counter overlay, dot indicators, empty state
- Listing details — rent/deposit/maintenance cards, detail grid (furnishing, floor, area, parking, pets, available date), amenities, description
- WhatsApp CTA — deep link with pre-filled message + `trackWhatsAppClick` mutation + `tel:` contact link
- Contact form — react-hook-form + zod, Server Action with IP capture via `x-forwarded-for`, success/rate-limit toasts
- Archived notice — friendly "No longer available" message, CTA/forms hidden
- Privacy: ZERO owner/guard info exposed on public page

### Key File Locations

- `convex/http.ts` — HTTP endpoint (pathPrefix approach)
- `src/app/listing/[slug]/page.tsx` — SSR page + generateMetadata + JSON-LD
- `src/app/listing/[slug]/actions.ts` — Server Action (submitContactFormAction)
- `src/app/listing/[slug]/components/` — 5 components (photo-gallery, listing-details, whatsapp-button, contact-form, archived-notice)

### Deviations from Spec

- HTTP Router uses `pathPrefix: "/api/listing/"` instead of path params (Convex doesn't support `:slug` syntax)
- Photo URLs constructed as `${CONVEX_URL}/api/storage/${storageId}` client-side instead of Server Action resolution (simpler, faster)
- WhatsApp phone uses `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` env var instead of system_config query (system_config values may not be seeded)

### Gotchas for Next Epic

- `fetchMutation` from "convex/nextjs" used in Server Actions — requires `CONVEX_URL` and `NEXT_PUBLIC_CONVEX_URL` env vars
- Photo URL pattern: `${NEXT_PUBLIC_CONVEX_URL}/api/storage/${storageId}` — depends on Convex deployment URL being accessible
- Contact form rate limiting is IP-based (5/hour) — `x-forwarded-for` header must be set by proxy/CDN in production
