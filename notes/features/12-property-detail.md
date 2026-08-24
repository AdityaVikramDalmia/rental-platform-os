# Feature: Property Detail Page

> **Priority**: #17 in implementation order
> **Personas**: Prospective Tenant (public)
> **Dependencies**: Tenant Browse (P16) for navigation context, Listings (P06) for listing data
> **Route**: `/listing/[slug]` (public SSR page)

## Purpose

The property detail page is the full-richness view of a single listing. It provides everything a tenant needs to evaluate a property and decide to visit: photo gallery, pricing breakdown, amenities, house rules, commute calculator, location map, roommate profiles, tenant testimonials, and a contact sidebar for scheduling visits or contacting DemoRentals.

## Entities Involved

- `listings` table (read)
- `listing_photos` table (read — full gallery)
- `listing_roommate_profiles` table (read)
- `listing_commute_landmarks` table (read)
- `tenant_inquiries` table (write — visit request)

## Page Sections

All sections below are V1. The page URL is `/listing/[slug]`.

### 1. Property Gallery

- Main image viewer with thumbnail strip below
- Previous/Next navigation arrows
- Fullscreen mode (modal overlay with swipe support on mobile)
- Photo categories: main, bedroom, bathroom, kitchen, common area (from `listing_photos`)
- Cover photo (lowest `display_order`) shown first

### 2. Property Overview & Pricing

- Property title (building name, flat number, society)
- Location (locality, city)
- Property type + BHK config + furnishing status
- **Pricing breakdown**:
  - Monthly Rent: ₹XX,XXX
  - Security Deposit: ₹XX,XXX
  - Maintenance: ₹X,XXX/mo
  - **Move-in Cost**: Rent + Deposit + First Month Maintenance (computed)
- Available from date
- Carpet area (sqft)
- Parking type

### 3. Amenities Grid

- Two-column grid: Available (green check) / Not Available (grey X)
- Standard amenity set from [Constants Reference](../13-constants-reference.md): gym, pool, garden, security, lift, power_backup, clubhouse, parking, play_area, jogging_track, intercom, cctv, fire_safety, water_supply_24x7, gas_pipeline, rain_water_harvesting

### 4. Property Description & House Rules

- Long-form description text (plain text with read-more truncation)
- Numbered house rules list (e.g., "No pets", "No smoking indoors", "Quiet hours 10 PM - 7 AM")

### 5. Commute Calculator

- Displays pre-configured landmarks from `listing_commute_landmarks`
- Each landmark shows: name, distance, time, category icon
- Categories are grouped into UI buckets (`workplace`, `transit`, `education`, `healthcare`, `shopping`) based on stored category strings
- Landmarks grouped by category
- Static data (pre-populated by admin, not live API)

### 6. Location Map & Nearby Places

- Embedded Google Maps iframe centered on property coordinates
- Address text under the map card
- "Open in Google Maps" CTA link

### 7. Roommate Compatibility Profiles

- Only shown for shared accommodations (when `listing_roommate_profiles` exist)
- Cards showing: name alias, age range, gender, profession, optional bio, optional move-in date, lifestyle tags

### 8. Tenant Testimonials

- Static review cards with: name, rating (1-5 stars), comment, locality
- Displayed as a responsive grid
- Static testimonial data (admin-managed, not user-generated in V1)

### 9. Contact Sidebar

- **Desktop**: Sticky sidebar on the right (30% width)
- **Mobile**: Fixed bottom bar with "Contact" and "Schedule Visit" buttons, expanding to full-screen modal

**Sidebar Contents**:

- Quick actions: WhatsApp deep link button, Phone call button
- **Contact Us Form** (`listings.submitInquiry`):
  - Name (text)
  - Phone (10-digit)
  - Message (textarea, optional)
- **Request Visit Form** (`tenantInquiries.submit`, auth-gated for tenant users):
  - Name (text)
  - Phone (10-digit)
  - Email (email)
  - Preferred move-in date (date picker)
  - Preferred time slot (select)
  - Message (textarea)
- "Request Visit" button → creates `tenant_inquiries` record
- Inquiry count: "X people have inquired about this property"

### 10. Similar Listings

- Horizontal strip of up to 6 published similar listings
- Prioritizes same society and same BHK matches

---

## Convex Functions

### Queries

```
listings.getBySlugPublic({ slug }) → Listing + photos + roommates + landmarks
listings.getInquiryCountPublic({ listing_id }) → number
listings.getSimilarListings({ listing_id, bhk_config, society_name? }) → Listing[]
```

### Mutations

```
listings.submitInquiry({ listing_id, name, phone, message?, ip }) → ListingInquiry
tenantInquiries.submit({ listing_id, preferred_visit_date?, preferred_visit_slot?, message? }) → TenantInquiry
```

---

## Business Rules

1. Only `PUBLISHED` listings have accessible detail pages. Non-published slugs return 404.
2. Owner information (name, phone) is NEVER exposed on the detail page.
3. Contact form creates a `listing_inquiries` record; visit request form creates a `tenant_inquiries` record.
4. Visit request does NOT auto-schedule a visit. Ops reviews and posts as bounty.
5. Request-visit submission is tenant-auth gated through `InquiryForm`.
6. WhatsApp deep link uses env-configured phone (`NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE`) with a prefilled property message.
7. All money displayed in ₹ (converted from paise).
8. Move-in cost is computed client-side: `rent_monthly + deposit + maintenance`.
9. Roommate section only renders when `listing_roommate_profiles` exist for the listing.
10. Commute data is static (admin-managed), not from a live directions API.

---

## SEO

- Page title: `{bhk} {furnishing} in {society}, {locality} — ₹{rent}/mo | DemoRentals`
- Meta description: Auto-generated from listing description (first 160 chars)
- Open Graph image: Cover photo URL
- Structured data: `@type: Apartment` schema.org markup

---

## Edge Cases

- **Listing not published**: Return 404 from `getBySlugPublic`.
- **No photos**: Show placeholder image with "Photos coming soon" text.
- **No roommate profiles**: Roommate section hidden entirely.
- **No commute landmarks**: Commute section hidden entirely.
