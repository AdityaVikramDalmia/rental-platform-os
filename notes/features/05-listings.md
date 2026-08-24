# Feature: Listings

> **Priority**: #6 in implementation order
> **Personas**: Admin/Ops (creation + management), Public (viewing via shareable link)
> **Dependencies**: Lead Pipeline + Owner Verification

## Purpose

Once a lead is verified, ops creates a rich property listing — the marketable version of the vacancy. This is what tenants see. Listings include photos, rent, amenities, and all the details needed for a tenant to decide if they want to visit. Listings have shareable public URLs that ops can send via WhatsApp to potential tenants.

Owner information is NEVER exposed on public listings. All contact goes through DemoRentals.

## Entities Involved

- `listings` table
- `listing_inquiries` table
- `leads` table (source data)
- Convex file storage (photos)

## Permissions

| Permission                | Used By                                                                                                                                                                                                                             | Description                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `listings.create`         | `create` mutation                                                                                                                                                                                                                   | Gates creation of a new draft listing from a verified lead.                     |
| `listings.edit`           | `update`, `addRoommateProfile`, `updateRoommateProfile`, `removeRoommateProfile`, `addCommuteLandmark`, `updateCommuteLandmark`, `removeCommuteLandmark`, `generateUploadUrl`, `addPhoto`, `removePhoto`, `reorderPhotos` mutations | Gates listing edits, media upload workflow, and structured listing enrichments. |
| `listings.view`           | `getById`, `list`, `getPhotosForListing` queries                                                                                                                                                                                    | Gates backoffice listing reads and photo management views.                      |
| `listings.publish`        | `publish` mutation                                                                                                                                                                                                                  | Gates listing status transition to/from `PUBLISHED`/`ARCHIVED`.                 |
| `listings.view_inquiries` | `getInquiries` query                                                                                                                                                                                                                | Gates access to listing inquiry records in admin/ops views.                     |

Public mutation/query paths (`submitInquiry`, `trackWhatsAppClick`, `getBySlugPublic`, `listFeatured`, `listPublished`) do not require authentication.

---

## Admin Flow: Create Listing

### Trigger

Admin opens a `VERIFIED` lead and clicks "Create Listing".

### Listing Creation Form

Pre-populated from lead data where available. Admin fills in the rest.

**Required Fields**:

| Field          | Type        | Pre-filled                                                 | Description                                    |
| -------------- | ----------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Rent (₹/month) | Number      | From verification `rent_confirmed` or lead `rent_expected` | Monthly rent in INR                            |
| BHK Config     | Select      | No                                                         | 1BHK / 2BHK / 3BHK / 4BHK / Studio / Other     |
| Furnishing     | Select      | From lead                                                  | Unfurnished / Semi-Furnished / Fully Furnished |
| Floor          | Text        | From lead `floor_number`                                   |                                                |
| Available From | Date        | From lead `availability_date`                              |                                                |
| Photos         | File upload | No                                                         | Min 1, max 10 photos. Convex file storage.     |

**Optional Fields**:

| Field                 | Type               | Description                                           |
| --------------------- | ------------------ | ----------------------------------------------------- |
| Deposit (₹)           | Number             | Security deposit                                      |
| Maintenance (₹/month) | Number             | Monthly maintenance charges                           |
| Carpet Area (sq ft)   | Number             |                                                       |
| Description           | Textarea           | Rich description of the flat                          |
| Parking               | Select             | None / Covered / Open / Both                          |
| Pet Friendly          | Checkbox           |                                                       |
| Amenities             | Multi-select chips | gym, pool, garden, security, lift, power_backup, etc. |

### Photo Upload

- Drag & drop or click to upload
- Max 10 active (non-deleted) photos per listing
- **Server-side hard limit**: 10MB per photo (uploads larger than 10MB are rejected)
- **Client-side resize target**: ~1MB before upload (for faster upload on slow 3G connections). The 10MB limit is a fallback safety net if client-side resize fails or is bypassed.
- **Accepted formats**: JPEG, PNG, WebP
- Uploaded to Convex file storage via `listing_photos` table (separate from listings table)
- Each photo has a `display_order` field. Lowest order = cover image.
- Admin can reorder photos (drag & drop, updates `display_order`)
- Admin can delete individual photos (soft delete: `is_deleted = true`)

### Listing Status

| Status      | Description                                              |
| ----------- | -------------------------------------------------------- |
| `DRAFT`     | Just created. Not publicly visible. Admin still editing. |
| `PUBLISHED` | Live. Public URL works. Shareable.                       |
| `ARCHIVED`  | Taken down. Public URL shows "No longer available".      |

**Status Transitions**:

- `DRAFT` → `PUBLISHED`: Publish the listing
- `PUBLISHED` → `ARCHIVED`: Archive a live listing
- `ARCHIVED` → `DRAFT`: Re-list a property (flat becomes available again after previous tenant leaves, or archival was premature)

### Save & Publish Flow

1. Admin fills form → "Save as Draft"
2. Admin reviews → "Publish"
3. System generates slug (URL-friendly: `tower-a-1201-hiranandani-2bhk`)
4. Public URL becomes active: `https://app.rental-platform-os.com/listing/{slug}`
5. Admin can copy the URL and share via WhatsApp / SMS

---

## Public Listing Page

### URL: `/listing/[slug]`

**Publicly accessible** — no auth required.

### Layout (Mobile-Optimized)

```
┌─────────────────────────────────┐
│  [Photo Gallery / Carousel]     │
│  ◄ 1/7 ►                       │
├─────────────────────────────────┤
│  2BHK in Maplewood, Tower A   │
│  Floor 12, Flat 1201            │
│                                 │
│  ₹25,000/month                  │
│  Deposit: ₹75,000               │
│  Maintenance: ₹3,500/month      │
│  Available from: Mar 1, 2026    │
│                                 │
│  Semi-Furnished | 850 sq ft     │
│  Parking: Covered | Pet Friendly│
│                                 │
│  Amenities: Gym, Pool, Garden,  │
│  24/7 Security, Power Backup    │
│                                 │
│  "Spacious 2BHK on high floor   │
│  with great ventilation and     │
│  garden view. Recently painted. │
│  Modular kitchen included."     │
│                                 │
├─────────────────────────────────┤
│  Interested? Contact DemoRentals    │
│                                 │
│  [💬 Chat on WhatsApp]          │  ← Primary CTA. Opens WhatsApp with pre-filled message.
│                                 │
│  📞 +91 XXXXX XXXXX            │  ← DemoRentals's ops phone number
│                                 │
│  ── Or fill the form ──         │
│  Name:  [_______________]       │
│  Phone: [_______________]       │
│  Message: [_____________]       │
│  [Send Inquiry]                 │
└─────────────────────────────────┘
```

### WhatsApp Pre-Filled Message

```
Hi, I'm interested in {building_name} {flat_number} at {society_name}
```

### Contact Form Submission

Submits via Next.js Server Action. Server Action captures client IP from request headers for rate limiting (5 submissions/hour/IP), then calls Convex mutation to create `listing_inquiries` record. Visible to admin in the admin panel.

### SEO / Sharing

- Meta tags for social sharing (Open Graph): title, description, cover image
- Public pages should be server-rendered (Next.js SSR) for SEO and WhatsApp link previews
- SSR data fetched from Convex HTTP Router endpoint (`/api/listing/:slug`). See `11-convex-architecture.md` for implementation.
- Photo URLs resolved separately via Server Action (storage_id → URL).

### Privacy

- ZERO owner information on public pages
- No owner name, no owner phone, no guard info
- Society name visible (it's the location)
- Building name + floor + flat visible (needed for identification)

---

## Admin Panel UI

### Listings List (`/admin/listings`)

| Column    | Description                        |
| --------- | ---------------------------------- |
| Listing   | BHK + Building + Flat (clickable)  |
| Society   | Society name                       |
| Rent      | Monthly rent                       |
| Status    | DRAFT / PUBLISHED / ARCHIVED badge |
| Inquiries | Count of contact form submissions  |
| Created   | Date                               |
| Lead      | Link to source lead                |

**Filters**: Status, Society
**Actions**: + Create Listing (from verified lead dropdown)

### Listing Detail / Edit Page (`/admin/listings/[id]`)

- Full form (same as creation)
- Photo manager (reorder, add, delete)
- Status toggle: Draft → Published → Archived
- "Copy Public Link" button
- "Open Public Page" button (new tab)
- Inquiry list: name, phone, message, timestamp

### Inquiry List

| Column  | Description                   |
| ------- | ----------------------------- |
| Name    | Inquirer name                 |
| Phone   | Clickable tel: link           |
| Message | Text                          |
| Source  | CONTACT_FORM / WHATSAPP_CLICK |
| Date    | Timestamp                     |

Note: `WHATSAPP_CLICK` is tracked when user clicks the WhatsApp button (analytics event, no form submission).

---

## Convex Functions

### Queries

```
listings.list({ status?, society_id?, search?, pagination }) → Listing[]
listings.getById({ id }) → Listing + lead info + inquiry count
listings.getBySlug({ slug }) → Listing (public, no auth required)
listings.getInquiries({ listing_id, pagination }) → ListingInquiry[]
```

### Mutations

```
listings.create({ lead_id, rent_monthly, bhk_config, furnishing, floor_number, available_from, photos[], deposit?, maintenance?, carpet_area_sqft?, description?, parking?, pet_friendly?, amenities[]? })
// Auto-generates slug
// Status: DRAFT
// Audit: LISTINGS_INSERT

listings.update({ id, ...fields })
// Audit: LISTINGS_UPDATE

listings.publish({ id })
// Status: DRAFT → PUBLISHED
// Audit: LISTINGS_UPDATE

listings.archive({ id })
// Status: → ARCHIVED
// Audit: LISTINGS_UPDATE

listings.addPhotos({ id, storage_ids[] })
listings.removePhoto({ id, storage_id })
listings.reorderPhotos({ id, storage_ids[] })

listings.submitInquiry({ listing_id, name, phone, message? })
// Public mutation (no auth)
// Creates listing_inquiries record

listings.trackWhatsAppClick({ listing_id })
// Public mutation (no auth)
// Creates inquiry with source = WHATSAPP_CLICK
```

---

## Slug Generation

```typescript
function generateSlug(
  building_name: string,
  flat_number: string,
  society_name: string,
  bhk_config: string,
): string {
  // "Tower A" + "1201" + "Maplewood" + "2BHK"
  // → "tower-a-1201-hiranandani-2bhk"
  const base = [building_name, flat_number, society_name, bhk_config]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // If collision, append random suffix
  return base; // + check uniqueness, append "-2" etc. if needed
}
```

---

## Business Rules

1. Only `VERIFIED` leads can have listings created.
2. One listing per lead. If listing exists, show "Edit Listing" instead of "Create Listing".
3. At least 1 photo required to publish (can save as DRAFT without photos). Photos stored in `listing_photos` table with explicit ordering.
4. Public page never shows owner info — hard rule, enforced in the query.
5. Archived listings show a "No longer available" page at the public URL (don't 404).
6. Contact form submissions are stored but no notifications in V1 — admin checks inquiry list manually.
7. WhatsApp button uses `https://wa.me/{demorentals_phone}?text={encoded_message}` format.
8. Public listing inquiry form is rate-limited: max 5 submissions per hour per IP address. Basic spam protection.

---

## Edge Cases

- **Lead rejected after listing created**: If a lead is rejected (`VERIFIED` lead → `REJECTED`) and has a linked published listing, the listing is automatically archived (`PUBLISHED` → `ARCHIVED`). Admin sees a confirmation dialog: "This lead has a published listing. Rejecting will archive it. Continue?" This is a cascade triggered by the lead rejection mutation.
- **Slug collision**: Append numeric suffix (-2, -3). Extremely rare.
- **Photo upload fails**: Show retry button. Convex file storage is reliable but network can fail.
- **Very long description**: No hard limit in V1. Frontend truncates on public page with "Read more".
- **Listing with no inquiries**: Normal. Not all listings get traction immediately.
- **Public page performance**: Server-rendered. No auth check needed. Should be fast.
