# Feature: Public Pages

> **Priority**: #15 in implementation order
> **Personas**: Public (unauthenticated), Prospective Tenant, Property Owner
> **Dependencies**: Auth (P01) for optional sign-in CTA
> **Route Group**: `(public)/`

## Purpose

Public pages are the front door of the DemoRentals platform — they introduce the service, build trust, educate tenants about the rental process, route users into listing browse and tools, and provide multiple contact channels. All pages are fully public (no authentication required).

## Pages

### 1. Homepage (`(public)/homepage/`)

The primary landing page. Drives tenants to browse listings and owners to contact DemoRentals.

**Sections** (all V1):

| Section                  | Content                                                                                                 | CTA                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Hero**                 | Premium hero + trust positioning                                                                        | "Browse Listings", "WhatsApp Us"                    |
| **Proof Strip**          | Quick trust stats and social proof                                                                      | —                                                   |
| **Locality Search**      | Search bar + quick budget/type shortcuts that map to listing URL params                                 | Pushes query params to listing directory            |
| **Featured Properties**  | 6-9 featured published listings (newest)                                                                | Card → property detail, WhatsApp                    |
| **Why Rental Platform OS**       | Benefit cards (verified properties, transparent pricing, guided process)                                | —                                                   |
| **Testimonials**         | Rotating testimonial carousel                                                                           | —                                                   |
| **Comparison Table**     | Rental Platform OS vs traditional brokers                                                                       | —                                                   |
| **How It Works Summary** | Timeline teaser section                                                                                 | "Learn More" → how-it-works page                    |
| **Tools Preview**        | 3 preview cards linking to `/tools#rent-calculator`, `/tools#commute-estimator`, `/tools#roommate-quiz` | "Try it free" links into `/tools`                   |
| **CTA Section**          | Conversion block for tenants (browse) and owners (contact)                                              | "Browse Listings", "List Your Property", "WhatsApp" |
| **Footer**               | Navigation links, contact info, social links, WhatsApp quick action, copyright                          | —                                                   |

**Featured Properties**: Query `listings` with `status: PUBLISHED`, ordered by `_creationTime` descending, limit 9. Show as property cards (same component as listing directory).

### 2. How-It-Works (`(public)/how-it-works/`)

Education page for tenants. Explains the rental process and provides interactive decision-support tools.

**Sections** (all V1):

| Section                      | Content                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero**                     | "How Renting with DemoRentals Works" + trust stat cards                                                                                            |
| **Process Timeline**         | 6-step interactive timeline (Search → Shortlist → Visit → Apply → Move In → Settle). Clickable steps with descriptions and duration estimates. |
| **Tools Hub (Teaser)**       | Preview cards for tools with "Coming Soon" badges on this page. Interactive tools live on `/tools`.                                            |
| **Rental Checklist Preview** | Checklist preview cards and static progress indicator (interactive tracker is on `/tools`).                                                    |
| **Testimonial Videos**       | Testimonial cards with simulated video player (placeholder thumbnails, play button, testimonial text)                                          |
| **FAQ**                      | Searchable, category-filtered FAQ accordion (categories: General, Pricing, Process, Legal, Roommates)                                          |
| **CTA**                      | "Start Your Search" → listing directory                                                                                                        |

### 3. Contact Hub (`(public)/contact/`)

Multi-channel support and contact center.

**Sections** (all V1):

| Section                  | Content                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hero**                 | "Get in Touch" + immediate WhatsApp CTA                                                                                                                              |
| **Contact Methods Grid** | 6 contact channel cards: WhatsApp (deep link), Phone (tel:), Email (mailto:), Video Call (coming soon badge), Live Chat (coming soon badge), Visit Office (map link) |
| **Contact Form**         | General inquiry form: name, email, phone, subject, message, preferred contact method. Creates `support_inquiries` record.                                            |
| **Office Location**      | Address, hours, embedded Google Maps iframe, "Open in Maps" CTA                                                                                                      |
| **FAQ**                  | Category-filtered accordion (different content from how-it-works FAQ)                                                                                                |
| **Newsletter Signup**    | Email input + subscribe button. Creates `newsletter_subscriptions` record.                                                                                           |

### 4. Footer (Shared Component)

Appears on all public pages.

**Content**:

- Navigation links: Homepage, Browse Listings, How It Works, Contact, Owner Services
- Contact channels: Phone, Email, WhatsApp quick action
- Office address (abbreviated)
- Social links (placeholder for V1)
- Copyright: "© {year} DemoRentals. All rights reserved."

---

## Entities Involved

- `listings` table (read — featured properties on homepage)
- `support_inquiries` table (write — contact form)
- `newsletter_subscriptions` table (write — newsletter signup)

## Permissions

| Permission                 | Used By                                                           | Description                                                         |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `support_inquiries.manage` | `updateStatus`, `assign`, `updateOpsNotes` mutations              | Gates backoffice management actions on submitted support inquiries. |
| `support_inquiries.view`   | `list`, `getById`, `getStatusCounts`, `getSubmittedCount` queries | Gates backoffice read access to support inquiry inbox data.         |

Public mutation paths used by this feature (`supportInquiries.submit`, `newsletterSubscriptions.subscribe`) do not require authentication.

## Convex Functions

### Queries

```
listings.listFeatured({ limit: 9 }) → Listing[] (PUBLISHED, newest)
```

### Mutations

```
supportInquiries.submit({ name, email, phone?, subject, message, preferred_contact_method?, persona_type? }) → SupportInquiry
newsletterSubscriptions.subscribe({ email, source_page }) → NewsletterSubscription (upsert by email)
```

---

## Business Rules

1. All public pages are fully accessible without authentication.
2. Contact form submissions create `support_inquiries` records via **public Convex mutation** (not HTTP-only).
3. Support inquiry rate limiting is keyed by **phone number** (not IP), 3 submissions per hour per phone.
4. HTTP handler validates `persona_type` and `preferred_contact_method` enums — returns 400 on invalid values.
5. Newsletter signup is idempotent (same email = update `subscribed_at`, not duplicate).
6. WhatsApp deep links use `NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE`.
7. Phone links use `NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE`.
8. Featured properties: only PUBLISHED listings, newest first.
9. "Coming soon" badges on Video Call and Live Chat contact methods — no functionality in V1.
10. FAQ content is static (hardcoded or from a content file). Not in Convex DB in V1.

---

## SEO

- Homepage: title "DemoRentals - Find Your Perfect Rental Home"
- How-It-Works: title "How Renting Works"
- Contact: title "Contact Us"
- All pages: Open Graph tags, structured data where applicable

---

## Edge Cases

- **No published listings for featured section**: Show placeholder: "New listings coming soon! Check back later."
- **Newsletter double-subscribe**: Silently update timestamp, show success message.
- **Contact form spam**: Rate limit: 5 submissions per hour per IP via `public:support_inquiry` rate limiter.
