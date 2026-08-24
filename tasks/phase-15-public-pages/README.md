# Phase 15: Public Pages (P15)

## Overview

Public pages are the front door of the DemoRentals platform — they introduce the service, build trust, and drive conversions for both tenants and property owners. Three pages: a homepage with hero carousel, featured listings, and trust signals; a how-it-works page with an interactive process timeline, FAQ accordion, and tenant tools hub; and a contact hub with a multi-channel support center, contact form, office location, and newsletter signup.

All pages are fully public (no authentication required). Contact form submissions persist to the `support_inquiries` table and newsletter signups persist to `newsletter_subscriptions` — both exposed via new Convex mutations. The homepage queries published listings via a new `listings.listFeatured` query. The contact form is rate-limited at 5 submissions per hour per IP.

No public route group exists yet. Phase 15 creates `src/app/(public)/` with a shared layout containing a public header, global footer, and `ConvexClientProvider` (needed for `useQuery` and `useMutation` in client components). Two new shadcn/ui primitives must be installed: Carousel (Embla-based, for hero and testimonials) and Accordion (for FAQ sections). All other UI uses the 24 shadcn/ui primitives already installed.

**Note**: The `support_inquiries` and `newsletter_subscriptions` tables should exist in `convex/schema.ts` from P01-E02. Before starting E01, **verify** both tables and their indexes exist in the actual schema file. If they are missing, add them as the first step — see `notes/10-convex-schema.md` for exact definitions (`support_inquiries` lines ~737-760, `newsletter_subscriptions` lines ~762-766). This phase primarily adds the Convex functions (queries/mutations) and the frontend pages.

## Dependencies

| Dependency                   | What It Provides for P15                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P01-E02 (Schema & Infra)** | `support_inquiries` table (fields: name, phone, email, subject, message, preferred_contact_method, persona_type, source_channel, status, assigned_admin_id; indexes: by_status, by_persona_type, by_assigned_admin_id). `newsletter_subscriptions` table (fields: email, subscribed_at, source_page; index: by_email). These tables are expected from P01-E02. **Verify** they exist in `convex/schema.ts` before starting E01 — if missing, add them first (see `notes/10-convex-schema.md` for exact definitions). |
| **P06-E01 (Listings)**       | Published listings in the `listings` table with status `PUBLISHED`. The homepage featured properties section queries these. At least some published listings must exist for the featured section to display; if none exist, the section shows a "New listings coming soon!" placeholder.                                                                                                                                                                                                                             |

## Key Documentation

| Doc                                 | Section                                             | Why You Need It                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/features/15-public-pages.md` | Full file                                           | THE feature spec — all 4 page sections (Homepage, How-It-Works, Contact Hub, Footer), entities, Convex functions, business rules, SEO titles, edge cases                                                                      |
| `notes/10-convex-schema.md`         | `support_inquiries` table (lines ~737-760)          | Exact field validators: name (string), phone (optional string), email (string), subject (string), message (string), preferred_contact_method (4 literals), persona_type (4 literals), status (4 literals). All three indexes. |
| `notes/10-convex-schema.md`         | `newsletter_subscriptions` table (lines ~762-766)   | Exact field validators: email (string), subscribed_at (number), source_page (optional string). `by_email` index for upsert dedup.                                                                                             |
| `notes/02-data-models.md`           | Section V (Support Inquiry, lines ~633-658)         | Field descriptions, notes: public form (no auth required), ops team manages queue from admin panel.                                                                                                                           |
| `notes/02-data-models.md`           | Section W (Newsletter Subscription, lines ~661-678) | Field descriptions, notes: simple email capture, de-duplicate by email on insert (upsert behavior).                                                                                                                           |
| `notes/13-constants-reference.md`   | System Config Keys (lines ~480-481)                 | `demorentals_contact_phone` and `demorentals_whatsapp_phone` — used for contact channels and WhatsApp deep links. Frontend reads from env vars `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` and `NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE`.          |
| `notes/11-convex-architecture.md`   | Rate Limiter setup, functions.ts wrapper            | How to add new rate limiters (`convex/rateLimiter.ts`), correct import paths (`mutation`/`query` from `./functions` vs `_generated/server`).                                                                                  |

## Epics

| ID      | Title                                                                                      | Tasks | Status | Depends On         |
| ------- | ------------------------------------------------------------------------------------------ | ----- | ------ | ------------------ |
| P15-E01 | [Public Pages Backend](P15-E01-public-pages-backend.md)                                    | 3     | done   | [P01-E02, P06-E01] |
| P15-E02 | [Public Pages Frontend](P15-E02-public-pages-frontend.md)                                  | 5     | done   | [P15-E01]          |
| P15-E03 | [Premium Component Infrastructure & Hero Redesign](P15-E03-premium-infrastructure-hero.md) | 4     | done   | [P15-E02]          |
| P15-E04 | [Premium Homepage Core Sections Redesign](P15-E04-premium-core-sections.md)                | 4     | done   | [P15-E03]          |
| P15-E05 | [Social Proof & New Conversion Sections](P15-E05-social-proof-conversion.md)               | 4     | done   | [P15-E04]          |
| P15-E06 | [Premium Polish, Performance & Global Enhancements](P15-E06-premium-polish-performance.md) | 5     | done   | [P15-E05]          |

## Dependency Graph

```
P01-E02 ──► P15-E01 ──► P15-E02 ──► P15-E03 ──► P15-E04 ──► P15-E05 ──► P15-E06
                ▲
P06-E01 ────────┘
```

**Sequential note**: E01 (Backend) must complete before E02 (Frontend) begins — the frontend pages depend on `listings.listFeatured`, `supportInquiries.submit`, and `newsletterSubscriptions.subscribe` being available. E03-E06 are the **Premium Homepage Redesign** epics — they upgrade the basic V1 homepage from E02 into a premium, animated, conversion-optimized experience using Magic UI, Aceternity UI, and Motion. E03-E06 are sequential: each builds on the previous epic's components and patterns.

## Execution Order

1. **P15-E01**: Public Pages Backend — add `listings.listFeatured` query (no auth, PUBLISHED only), create `supportInquiries.submit` mutation with rate limiting, create `newsletterSubscriptions.subscribe` mutation with upsert-by-email, add `public:support_inquiry` rate limiter to `convex/rateLimiter.ts`.
2. **P15-E02**: Public Pages Frontend — create `(public)` route group with shared layout (header, footer, ConvexClientProvider), install shadcn Carousel + Accordion, build homepage (7 sections), how-it-works page (7 sections), contact hub (6 sections), and global footer component.
3. **P15-E03**: Premium Component Infrastructure & Hero Redesign — install Magic UI + Motion, create shared animation utilities (SectionReveal, StaggerChildren, SectionContainer), redesign hero with Particles background + animated gradient text + Number Ticker counters + ShimmerButton CTAs, add Proof Strip with infinite-scrolling logo Marquee.
4. **P15-E04**: Premium Homepage Core Sections Redesign — upgrade Featured Properties cards (hover zoom, verified badge animation), enhance Locality Search (glassmorphic card, quick filter chips), redesign How It Works (scroll-triggered vertical timeline, 4-step tenant journey), replace Why Choose Us with asymmetric Bento Grid (5 cards, animated icons, gradient backgrounds).
5. **P15-E05**: Social Proof & New Conversion Sections — upgrade Testimonials (outcome-focused copy, highlight badges, gradient avatars), add Comparison Table (Rental Platform OS vs traditional brokers, animated check/cross), add Tools Preview (3 teaser cards for rent calculator, commute estimator, roommate quiz), redesign Dual CTA (animated gradient blob background, ShimmerButton, owner sub-CTA).
6. **P15-E06**: Premium Polish, Performance & Global Enhancements — add auth buttons to public header (Sign In / Get Started for tenants/owners, avatar dropdown when authenticated), add floating WhatsApp widget on all public pages, micro-interaction polish (button feedback, card hover consistency, smooth scroll), performance optimization (lazy loading, LCP < 2.5s, bundle audit), SEO enhancements (JSON-LD, OpenGraph, canonical URLs).

## Completion Criteria

### Backend

- [ ] `listings.listFeatured({ limit })` query exists in `convex/listings.ts` — returns PUBLISHED listings ordered by `_creationTime` descending, limited to `limit` (default 9), each enriched with `building_name`, `society_name`, and `first_photo_url` (all nullable, joined via `lead_id → lead → building/society` and `listing_photos`). No auth required. Uses existing `by_status` index.
- [ ] `convex/supportInquiries.ts` exists with `submit` mutation — creates `support_inquiries` record with status `OPEN`, validates required fields (name, email, subject, message), rate-limited by `public:support_inquiry`. No auth required.
- [ ] `convex/newsletterSubscriptions.ts` exists with `subscribe` mutation — upserts by email using `by_email` index: if email exists, updates `subscribed_at` to `Date.now()`; if not, inserts new record. No auth required.
- [ ] `public:support_inquiry` rate limiter added to `convex/rateLimiter.ts` — 5 per hour per IP, fixed window (matches `public:listing_inquiry` pattern).

### Frontend (Infrastructure)

- [ ] `src/app/(public)/` route group created with `layout.tsx` — wraps children in `ConvexClientProvider` (no auth check, public pages). Includes public header and global footer.
- [ ] `src/components/public/header.tsx` created — logo, nav links (Home, Browse Listings, How It Works, Contact), CTA button ("Browse Listings"). Responsive (hamburger on mobile).
- [ ] `src/components/public/footer.tsx` created — navigation links, contact channels (phone, email, WhatsApp quick action via `wa.me`), abbreviated office address, social links (placeholder), copyright "© {year} DemoRentals. All rights reserved."
- [ ] shadcn Carousel installed (`npx shadcn@latest add carousel`)
- [ ] shadcn Accordion installed (`npx shadcn@latest add accordion`)

### Frontend (Homepage — `(public)/homepage/page.tsx`)

- [ ] Hero section: carousel with hero images (placeholder in V1), trust counters (properties managed, happy tenants, cities — hardcoded in V1), primary headline, CTAs ("Browse Listings", "WhatsApp Us")
- [ ] Locality search bar: search input with locality dropdown, price range, property type selectors. Pushes query params to listing directory route (placeholder URL until P16).
- [ ] Featured properties: carousel of 6-9 published listings via `useQuery(api.listings.listFeatured, { limit: 9 })`. Property cards with image, rent, BHK, location, WhatsApp CTA. Empty state: "New listings coming soon! Check back later."
- [ ] "Why Choose Us" section: 4-6 feature cards (verified properties, transparent pricing, etc.) — hardcoded content.
- [ ] Testimonials: rotating testimonial carousel with name, rating, comment — hardcoded content in V1.
- [ ] How It Works summary: 4-step process teaser (Search → Visit → Move In → Enjoy), "Learn More" link to how-it-works page.
- [ ] CTA section: conversion block for tenants ("Browse Listings") and owners ("List Your Property", "WhatsApp").
- [ ] SEO metadata: title "DemoRentals — Find Your Perfect Rental Home", Open Graph tags.

### Frontend (How-It-Works — `(public)/how-it-works/page.tsx`)

- [ ] Hero section: "How Renting with DemoRentals Works" headline + trust stat cards.
- [ ] Process Timeline: 6-step interactive timeline (Search → Shortlist → Visit → Apply → Move In → Settle). Clickable steps with descriptions and duration estimates.
- [ ] Interactive Tools Hub: tabbed interface (shadcn Tabs) with 3 tool tabs: Rent Calculator, Commute Estimator, Roommate Quiz. Placeholder content in V1 — actual tools are Phase 18.
- [ ] Rental Checklist Tracker: grouped checklist with category sections, completion progress bar. Placeholder content in V1 — full implementation is Phase 18.
- [ ] Testimonial Videos: testimonial cards with simulated video player (placeholder thumbnails, play button overlay, testimonial text). No real video in V1.
- [ ] FAQ: searchable, category-filtered accordion (shadcn Accordion). Categories: General, Pricing, Process, Legal, Roommates. Static content (hardcoded or from content file).
- [ ] CTA: "Start Your Search" → listing directory.
- [ ] SEO metadata: title "How Renting Works — DemoRentals", Open Graph tags.

### Frontend (Contact Hub — `(public)/contact/page.tsx`)

- [ ] Hero section: "Get in Touch" + immediate WhatsApp CTA.
- [ ] Contact methods grid: 6 channel cards — WhatsApp (deep link `wa.me/{phone}?text={message}`), Phone (`tel:+91{phone}`), Email (`mailto:{email}`), Video Call ("Coming Soon" badge), Live Chat ("Coming Soon" badge), Visit Office (map link). Cards use shadcn Card.
- [ ] Contact form: name, email, phone (optional), subject, message, preferred contact method dropdown. Uses react-hook-form + zod + shadcn Form. Submits via server action (`src/app/(public)/contact/actions.ts`) that extracts IP from headers and calls `fetchMutation(api.supportInquiries.submit)` — matching the existing listing inquiry pattern. Uses `useTransition` for pending state. Shows success toast on submit, error toast on rate limit.
- [ ] Office location: address, hours, embedded Google Maps iframe (lazy-loaded), "Open in Maps" CTA.
- [ ] FAQ: category-filtered accordion (different content from how-it-works FAQ). Static content.
- [ ] Newsletter signup: email input + subscribe button. Calls `newsletterSubscriptions.subscribe` mutation. Success: "You're subscribed!" toast. Double-subscribe: silent success (upsert behavior, same toast).
- [ ] SEO metadata: title "Contact DemoRentals — Get Help with Your Rental Search", Open Graph tags.

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] All public pages accessible without authentication (no auth checks in `(public)` layout)
- [ ] Changed files have clean `lsp_diagnostics`
- [ ] WhatsApp deep links use `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE` env var
- [ ] Contact phone uses `NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE` env var
- [ ] FAQ content is static (hardcoded or content file) — not in Convex DB in V1

## Files Created by This Phase

### E01-E02 (Backend + V1 Frontend)

```
convex/
  listings.ts                                       # Modified: add listFeatured query (PUBLISHED, newest-first, no auth)
  supportInquiries.ts                               # New: submit mutation (rate-limited, no auth)
  newsletterSubscriptions.ts                        # New: subscribe mutation (upsert by email, no auth)
  rateLimiter.ts                                    # Modified: add public:support_inquiry rate limiter

src/app/(public)/
  layout.tsx                                        # New: public layout with ConvexClientProvider, header, footer
  homepage/
    page.tsx                                        # New: homepage with 7 sections
  how-it-works/
    page.tsx                                        # New: how-it-works with 7 sections
    data/
      faq-how-it-works.ts                           # New: FAQ data for how-it-works page (15+ items, 5 categories)
  contact/
    page.tsx                                        # New: contact hub with 6 sections
    actions.ts                                      # New: server action for contact form (IP extraction + Convex mutation)
    data/
      faq-contact.ts                                # New: FAQ data for contact page (15+ items, 5 categories)

src/components/public/
  header.tsx                                        # New: public site header (logo, nav, CTA)
  footer.tsx                                        # New: global footer (nav, contact, WhatsApp, social, copyright)
  featured-listings.tsx                             # New: featured property cards (uses useQuery)
  locality-search.tsx                               # New: locality search bar with router push to /listings
  process-timeline.tsx                              # New: interactive 6-step timeline
  faq-section.tsx                                   # New: searchable, category-filtered FAQ accordion
  contact-form.tsx                                  # New: support inquiry form (react-hook-form + zod + useTransition)
  newsletter-signup.tsx                             # New: email signup component
  contact-methods-grid.tsx                          # New: 6-channel contact card grid
  testimonial-carousel.tsx                          # New: rotating testimonial cards

src/components/ui/
  carousel.tsx                                      # New: installed via npx shadcn@latest add carousel
  accordion.tsx                                     # New: installed via npx shadcn@latest add accordion
```

### E03-E06 (Premium Homepage Redesign)

```
# E03: Infrastructure + Hero
src/components/magicui/
  blur-fade.tsx                                     # Magic UI: scroll-reveal wrapper
  number-ticker.tsx                                 # Magic UI: animated counters
  shimmer-button.tsx                                # Magic UI: premium CTA buttons
  marquee.tsx                                       # Magic UI: infinite-scroll ticker
  particles.tsx                                     # Magic UI: particle background
  animated-gradient-text.tsx                        # Magic UI: gradient text effects
  bento-grid.tsx                                    # Magic UI: asymmetric grid (optional, may use CSS Grid instead)

src/components/public/animations/
  section-reveal.tsx                                # Shared: BlurFade-based scroll reveal wrapper
  stagger-children.tsx                              # Shared: staggered child animations
  section-container.tsx                             # Shared: standardized section layout (padding, max-width)
  index.ts                                          # Barrel export

src/components/public/
  hero-section.tsx                                  # E03: Premium hero (Particles bg, gradient text, NumberTicker, ShimmerButton)
  proof-strip.tsx                                   # E03: Marquee logo strip + trust metrics

# E04: Core Section Redesigns
  homepage-timeline.tsx                             # E04: 4-step vertical timeline with scroll reveals
  why-rental-platform-os.tsx                                # E04: Asymmetric bento grid (5 cards, animated icons)
  # featured-listings.tsx                           # E04: Modified (premium card hover effects)
  # locality-search.tsx                             # E04: Modified (glassmorphic design, quick filter chips)

# E05: New Sections
  comparison-table.tsx                              # E05: Rental Platform OS vs traditional brokers
  tools-preview.tsx                                 # E05: 3 teaser cards (calculator, commute, quiz)
  cta-section.tsx                                   # E05: Animated gradient CTA with ShimmerButton

# E06: Polish & Global
  whatsapp-widget.tsx                               # E06: Floating WhatsApp button (all public pages)
  # header.tsx                                      # E06: Modified (auth buttons: Sign In, Get Started, avatar dropdown)

# Modified Files
src/app/(public)/
  layout.tsx                                        # E06: Modified (auth state passed to header, WhatsApp widget added)
  homepage/
    page.tsx                                        # E03-E05: Modified (new section order, extracted components)
  how-it-works/
    page.tsx                                        # E06: Modified (canonical URL added)
  contact/
    page.tsx                                        # E06: Modified (canonical URL added)

src/app/globals.css                                 # E06: Modified (smooth scroll, button active feedback)
tailwind.config.ts                                  # E03+E05: Modified (Magic UI keyframes, blob animation)
package.json                                        # E03: Modified (motion dependency added)
```

## Scope Boundaries

### IN This Phase

**E01-E02 (V1 Baseline)**:

- `(public)` route group with shared layout (header, footer, ConvexClientProvider)
- Homepage with hero carousel, locality search bar, featured published listings, "Why Choose Us" cards, testimonial carousel, how-it-works summary, CTA section
- How-It-Works page with process timeline, tabbed tools hub (placeholder), rental checklist (placeholder), testimonial video cards (placeholder), searchable FAQ accordion, CTA
- Contact Hub with contact methods grid (6 channels), contact form persisted to `support_inquiries`, office location with Google Maps embed, FAQ accordion, newsletter signup persisted to `newsletter_subscriptions`
- Global footer with nav links, contact channels, WhatsApp deep link, social links (placeholder), copyright
- Public header with logo, nav, responsive hamburger menu
- `listings.listFeatured` query (PUBLISHED, newest-first, no auth)
- `supportInquiries.submit` mutation with `public:support_inquiry` rate limiter (5/hour/IP)
- `newsletterSubscriptions.subscribe` mutation with upsert-by-email
- SEO metadata on all 3 pages (title, description, Open Graph)
- Install shadcn Carousel and Accordion components
- Static FAQ content (hardcoded, not from DB)
- Static testimonial content (hardcoded, no real video)
- Static trust counters on homepage (hardcoded, not computed from real data in V1)

**E03-E06 (Premium Redesign)**:

- Magic UI + Motion installation and shared animation utilities
- Premium hero with Particles background, animated gradient text, NumberTicker counters, ShimmerButton CTAs
- Proof Strip with infinite-scrolling logo Marquee and animated trust metrics
- Premium featured properties with hover zoom, verified badge spring animation
- Glassmorphic locality search with quick filter chips
- Scroll-triggered vertical timeline (4-step tenant journey)
- Asymmetric Bento Grid "Why Rental Platform OS" (5 differentiation cards, animated icons)
- Upgraded testimonials with outcome-focused copy, highlight badges, gradient avatars
- NEW: Comparison Table (Rental Platform OS vs traditional brokers, animated check/cross)
- NEW: Tools Preview (3 teaser cards for upcoming tenant tools)
- Redesigned Dual CTA with animated gradient blob background and ShimmerButton
- Auth buttons in public header (Sign In / Get Started for tenants/owners via Google SSO, avatar dropdown when authenticated)
- Floating WhatsApp widget on all public pages
- Micro-interaction polish (button active feedback, card hover consistency, smooth scroll)
- Performance optimization (lazy loading, LCP target < 2.5s, bundle audit)
- SEO enhancements (JSON-LD structured data, OpenGraph, canonical URLs)

### NOT In This Phase

- Tenant listing directory / browse page — **P16**
- Property detail page — **P17**
- Tenant tools (rent calculator, commute estimator, roommate quiz, rental checklist) — **P18** (how-it-works shows placeholder tabs only, homepage shows teaser cards)
- Tenant inquiry pipeline — **P19**
- Owner services landing page and contact form — **P20**
- Admin management of support inquiries and newsletter subscriptions — **P21**
- Guard-facing content on homepage — guards use `/guard/login` and their own portal
- Dynamic trust counters (computed from real listing/tenant data) — **V2**
- Real testimonial videos — **V2** (placeholder thumbnails with play button overlay in V1)
- CMS for FAQ content — **V2** (hardcoded in V1)
- Blog / content marketing pages — **V2**
- Live chat integration — **V2** ("Coming Soon" badge on contact hub)
- Video call scheduling — **V2** ("Coming Soon" badge on contact hub)
- SEO sitemap.xml generation — **V2** (use `next-sitemap` when going live)
- Social media link destinations — placeholder `#` links in V1
- Dark mode — **V2**
- Page transition animations — **V2**
- Real partner logos in Proof Strip — placeholder name pills in V1
- OG image assets — placeholder comments in V1, create when branding finalized
