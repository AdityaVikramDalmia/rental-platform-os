---
id: P06-E03
title: Admin Listing UI
phase: 6
status: done
depends_on: ["P06-E02", "P04-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P06-E03: Admin Listing UI

## Overview

Build the admin listing management workspace end-to-end: listing table (`/admin/listings`), create form with lead pre-fill, photo upload/management UX, listing detail/edit page (`/admin/listings/[id]`) with status controls, and inquiry visibility. This epic follows the P04 admin table + detail-page pattern while reusing P06 backend/photo APIs and admin desktop conventions.

## Prerequisites

- **Read first**: [P06-E02 Completion Summary](P06-E02-photo-management.md#completion-summary) — confirm photo APIs (`generateUploadUrl`, `addPhoto`, `removePhoto`, `reorderPhotos`) and constraints are ready.
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — reuse existing admin table, RBAC-gated sidebar, and detail workflow patterns.
- P06 listing backend is complete (`listings.list`, `listings.create`, `listings.update`, `listings.publish`, `listings.getById`, `listings.getInquiries`).
- Admin layout/sidebar patterns from earlier phases are available and should be reused, not redesigned.

## Task Queue

- [x] P06-E03-T01: Listing Management Page + Data Table
- [x] P06-E03-T02: Listing Creation Form with Lead Pre-Fill
- [x] P06-E03-T03: Photo Upload + Management UX
- [x] P06-E03-T04: Listing Detail/Edit Page + Status Controls
- [x] P06-E03-T05: Inquiry List + Shared Listing Status Badge

---

## T01: Listing Management Page + Data Table

### Objective

Implement `/admin/listings` with status filter tabs, sortable listing table, pagination (20/page), and real-time updates so ops can monitor inventory and open listing detail pages quickly.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 3: Create Listing from Verified Lead", "Table Patterns", and "Sidebar Navigation" sections
- `notes/features/05-listings.md` — "Admin Panel UI" and "Listings List (`/admin/listings`)" sections
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — T01/T02 table shell, status tabs, RBAC sidebar item pattern
- `notes/13-constants-reference.md` — listing statuses, listing permissions, badge color semantics
- `notes/11-convex-architecture.md` — real-time query/subscription behavior (`useQuery`, `usePaginatedQuery`)

### Key Rules

1. Route is `src/app/(admin)/admin/listings/page.tsx` and follows existing admin page shell conventions (title, filter/tabs, table).
2. Sidebar deliverable is required but pattern-driven: verify/add "Listings" nav item only using the exact P04-E03 sidebar approach; if already present, keep behavior unchanged.
3. Status tabs are exactly: `ALL` (default), `DRAFT`, `PUBLISHED`, `ARCHIVED`.
4. Table uses Convex real-time data with `usePaginatedQuery` and 20 items/page (`initialNumItems: 20`), plus load-more/page controls per existing admin pattern.
5. Columns must match spec exactly:

   | Column    | Type             | Sortable | Notes                                                  |
   | --------- | ---------------- | -------- | ------------------------------------------------------ |
   | Listing   | Text (clickable) | Yes      | BHK + Building + Flat (example: `2BHK Tower A/1201`)   |
   | Society   | Text             | Yes      | Society name                                           |
   | Rent      | Number           | Yes      | Monthly rent formatted as INR (`formatINR` from paise) |
   | Status    | Badge            | Yes      | `DRAFT` / `PUBLISHED` / `ARCHIVED`                     |
   | Inquiries | Number           | Yes      | Combined count of `CONTACT_FORM` + `WHATSAPP_CLICK`    |
   | Created   | Date             | Yes      | Formatted creation timestamp                           |
   | Lead      | Link             | No       | Link to source lead at `/admin/leads`                  |

6. Listing column format is `"{BHK} {Building}/{Flat}"` (example: `2BHK Tower A/1201`).
7. Rent column formats paise using `formatINR()` from `lib/money.ts`; no inline formatting logic duplication.
8. Status uses shared `listing-status-badge.tsx` color mapping: `DRAFT` (`bg-gray-100 text-gray-600`), `PUBLISHED` (`bg-green-100 text-green-700`), `ARCHIVED` (`bg-gray-100 text-gray-500`).
9. Page access, nav visibility, and table fetch are RBAC-gated by `listings.view`.
10. Loading/empty states follow admin standards: centered spinner for full-page loading and clear empty-state messaging per selected tab.

### Deliverables

- [ ] Admin sidebar component — "Listings" nav item verified/added using exact P04-E03 nav pattern (note: may already exist from prior work)
- [ ] `src/app/(admin)/admin/listings/page.tsx` — listing management page shell and table integration
- [ ] `src/app/(admin)/admin/listings/components/listing-status-tabs.tsx` — status filter tabs
- [ ] `src/app/(admin)/admin/listings/components/listing-table.tsx` — sortable table with pagination and row/link actions

### Acceptance Criteria

1. `/admin/listings` renders page title, status tabs, and table in desktop-first admin layout.
2. Tabs render `ALL`, `DRAFT`, `PUBLISHED`, `ARCHIVED`, with `ALL` active by default.
3. Table shows all required columns with sortable headers except `Lead`.
4. Rent displays as INR currency converted from paise.
5. Listing row click opens detail route (`/admin/listings/[id]`), and Lead column links to `/admin/leads`.
6. Pagination is 20/page and can load more results.
7. New/updated listings appear without manual refresh (Convex reactivity).
8. Users without `listings.view` do not see sidebar entry and cannot use page data UI.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Visual check on `/admin/listings`: tabs, sorting, pagination, link navigation, and reactive updates.

### Out of Scope

- Listing creation form internals (T02)
- Photo upload/management interactions (T03)
- Detail status controls and inquiry section (T04/T05)

---

## T02: Listing Creation Form with Lead Pre-Fill

### Objective

Build the admin listing creation form with exact field order, verified-lead selector, and pre-fill logic from lead data so ops can create drafts quickly and publish when ready.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 3: Create Listing from Verified Lead" section
- `notes/features/05-listings.md` — "Admin Flow: Create Listing", "Listing Creation Form", and "Save & Publish Flow" sections
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — form/dialog UX conventions (`react-hook-form` + `zod`, loading + toast behavior)
- `notes/10-convex-schema.md` — `listings` fields and optional/required validator contracts
- `notes/13-constants-reference.md` — listing enums (`bhk_config`, furnishing, parking, amenity literals), permissions

### Key Rules

1. Implement reusable form component in `src/app/(admin)/admin/listings/components/listing-form.tsx` and mount it in create flow from `/admin/listings`.
2. Form tech stack is mandatory: `react-hook-form` + `zod`; toasts use `sonner`.
3. Field order is exact and must not be rearranged:
   1. Lead selector
   2. Rent
   3. BHK Config
   4. Furnishing
   5. Floor
   6. Available From
   7. Photos
   8. Deposit
   9. Maintenance
   10. Carpet Area
   11. Description
   12. Parking
   13. Pet Friendly
   14. Amenities
4. Lead selector shows only `VERIFIED` leads without existing listings; selecting a lead fetches `leads.getById` for pre-fill.
5. Pre-fill mapping from `leads.getById` must match spec exactly:

   | Listing Field    | Lead Source                                           | Notes                                                     |
   | ---------------- | ----------------------------------------------------- | --------------------------------------------------------- |
   | `rent_monthly`   | `lead.rent_expected` or verification `rent_confirmed` | Convert rupees input back to paise payload                |
   | `furnishing`     | `lead.furnishing`                                     | Direct copy if present                                    |
   | `floor_number`   | `lead.floor_number`                                   | Direct copy                                               |
   | `available_from` | `lead.availability_date`                              | Use Unix ms value when availability type is `VACANT_FROM` |

   `bhk_config` is never pre-filled.

6. Select options must use canonical literals:
   - `BHK Config`: `1BHK`, `2BHK`, `3BHK`, `4BHK`, `STUDIO`, `OTHER`
   - `Furnishing`: `UNFURNISHED`, `SEMI_FURNISHED`, `FULLY_FURNISHED`
   - `Parking`: `NONE`, `COVERED`, `OPEN`, `BOTH`
   - Amenities multi-select chips: `gym`, `pool`, `garden`, `security`, `lift`, `power_backup`, `clubhouse`, `parking`, `play_area`, `jogging_track`, `intercom`, `cctv`, `fire_safety`, `water_supply_24x7`, `gas_pipeline`, `rain_water_harvesting`
7. Money fields are entered in rupees and converted to paise before mutations (`rupeesToPaise`).
8. Button behavior is strict:
   - `Save as Draft` enabled when required fields are valid
   - `Save & Publish` enabled only when required fields are valid **and** at least one photo exists
9. Save actions align with backend contract: create draft first, then publish transition when `Save & Publish` is used.
10. UI for create/edit visibility follows RBAC (`listings.create` for creation path; publish action additionally gated by `listings.publish`).

### Deliverables

- [ ] `src/app/(admin)/admin/listings/components/listing-form.tsx` — create/edit form with schema validation and pre-fill wiring
- [ ] `src/app/(admin)/admin/listings/page.tsx` — create listing trigger + form mount path (modal/panel/page section per existing admin pattern)

### Acceptance Criteria

1. Form renders all 14 fields in the exact order specified.
2. Lead dropdown excludes non-VERIFIED leads and leads already linked to listings.
3. Selecting a lead pre-fills rent/furnishing/floor/available-from correctly.
4. `BHK Config` remains manually selected and is not auto-filled.
5. `Save as Draft` and `Save & Publish` button enabled/disabled states match spec.
6. Submissions convert rupee money inputs to paise before mutation payload.
7. Validation errors render inline and mutation errors render via toast.
8. UI respects RBAC visibility for create/publish controls.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual form test: choose verified lead, verify pre-fill values, validate button states with/without photo, submit draft and publish flows.

### Out of Scope

- Backend listing mutation implementation
- Public page preview implementation beyond existing form context
- Contact/WhatsApp public interactions

---

## T03: Photo Upload + Management UX

### Objective

Deliver admin photo upload and organization UX (upload, progress, reorder, delete, cover indication) that maps directly to P06-E02 photo mutations and listing publish constraints.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 3: Create Listing from Verified Lead" section (photo upload zone expectation)
- `notes/features/05-listings.md` — "Photo Upload", "Listing Status", and "Admin Panel UI" sections
- `tasks/phase-06-listings/P06-E02-photo-management.md` — photo API contracts and server constraints to match in UI
- `notes/11-convex-architecture.md` — 3-step file upload pattern
- `notes/13-constants-reference.md` — listing status/publish constraints, listing permissions

### Key Rules

1. Implement upload drop zone in `photo-uploader.tsx` with drag-and-drop plus "Click to upload" fallback.
2. Accepted formats are JPEG, PNG, WebP only; hard cap is 10 photos in UI (show actionable error toast if exceeded).
3. Before upload, resize each image client-side to ~1MB with `browser-image-compression`.
4. Upload pipeline is exact:
   - resize file
   - `generateUploadUrl()`
   - `fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file })`
   - parse `storageId`
   - `addPhoto({ listing_id, storage_id, display_order })`
5. Show per-photo upload progress/loading state; prevent duplicate interactions while a photo is uploading.
6. Implement `photo-manager.tsx` thumbnail grid with drag-to-reorder and delete actions (`removePhoto` soft delete).
7. First photo (`display_order === 0`) must show persistent `Cover Image` indicator.
8. Reorder updates must persist via `reorderPhotos` so UI order and backend `display_order` stay consistent.
9. Publishing dependency is visualized in the form: `Save & Publish` unavailable until at least one active photo exists.

### Deliverables

- [ ] `src/app/(admin)/admin/listings/components/photo-uploader.tsx` — drag/drop uploader with compression + upload flow
- [ ] `src/app/(admin)/admin/listings/components/photo-manager.tsx` — thumbnail grid with reorder, cover label, delete
- [ ] `src/app/(admin)/admin/listings/components/listing-form.tsx` — photo uploader/manager integration and publish-state dependency wiring

### Acceptance Criteria

1. Admin can drag/drop or click-select valid image files and upload successfully.
2. Non-JPEG/PNG/WebP files are rejected in UI with clear feedback.
3. UI prevents adding more than 10 photos.
4. Upload progress appears per photo until completion/failure.
5. Grid shows uploaded thumbnails with delete control and cover-image label on first photo.
6. Drag reordering updates thumbnail order and persists after refresh.
7. Delete action removes photo from active grid state via soft-delete mutation.
8. `Save & Publish` remains disabled until at least one active photo exists.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual upload check: add 3 photos, reorder them, verify cover label moves to index 0, delete one, verify publish eligibility toggles correctly.

### Out of Scope

- Server-side photo validation logic (already covered in P06-E02)
- Public gallery rendering
- CDN/image optimization pipeline

---

## T04: Listing Detail/Edit Page + Status Controls

### Objective

Implement `/admin/listings/[id]` as the full listing edit surface with form + photo manager + status transitions and quick public-link actions.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 3: Create Listing from Verified Lead" and desktop admin page conventions
- `notes/features/05-listings.md` — "Listing Detail / Edit Page (`/admin/listings/[id]`)" and "Listing Status" sections
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — detail page/panel conditional action pattern and RBAC visibility conventions
- `notes/04-state-machines.md` — Listing Status Machine transitions
- `notes/13-constants-reference.md` — listing status literals and permission strings (`listings.edit`, `listings.publish`)

### Key Rules

1. Route file is `src/app/(admin)/admin/listings/[id]/page.tsx`; it loads listing detail via listing ID and renders editable form state.
2. Reuse `listing-form.tsx`, `photo-uploader.tsx`, and `photo-manager.tsx` for edit parity with create flow.
3. Add `listing-status-controls.tsx` with conditional buttons by status:
   - `DRAFT`: `Publish` (enabled only with >=1 photo)
   - `PUBLISHED`: `Un-publish` (to `DRAFT`) and `Archive` (to `ARCHIVED`)
   - `ARCHIVED`: `Re-list` (to `DRAFT`)
4. Status transitions must call `listings.publish` and follow legal state-machine transitions only.
5. Add `Copy Public Link` button to copy `/listing/{slug}` URL to clipboard.
6. Add `Open Public Page` button opening `/listing/{slug}` in a new tab.
7. Show button spinners and disable controls during mutation execution; show success/error toasts via `sonner`.
8. Form edits and photo edits are gated by `listings.edit`; status controls are gated by `listings.publish`.

### Deliverables

- [ ] `src/app/(admin)/admin/listings/[id]/page.tsx` — listing detail/edit page
- [ ] `src/app/(admin)/admin/listings/components/listing-status-controls.tsx` — conditional status transition controls
- [ ] `src/app/(admin)/admin/listings/components/listing-form.tsx` — edit-mode behavior support

### Acceptance Criteria

1. `/admin/listings/[id]` renders full editable listing form and photo section.
2. Status control buttons render conditionally by current listing status.
3. `Publish` is disabled when listing has zero active photos.
4. `Un-publish`, `Archive`, and `Re-list` appear only in valid statuses.
5. `Copy Public Link` writes correct `/listing/{slug}` URL to clipboard.
6. `Open Public Page` opens the correct public URL in a new tab.
7. Mutation loading and disabled states prevent duplicate clicks.
8. RBAC gating hides or disables edit/publish controls for unauthorized users.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual detail flow: open draft listing, add/reorder photos, publish, un-publish/archive/re-list, copy/open link actions.

### Out of Scope

- Public listing route implementation (`/listing/[slug]`)
- Contact form and WhatsApp button behavior
- Lead rejection cascade backend behavior

---

## T05: Inquiry List + Shared Listing Status Badge

### Objective

Add inquiry visibility inside listing detail and create a shared listing status badge component reused across listing table/detail surfaces.

### Required Reading

- `notes/06-admin-panel-ux.md` — table conventions and admin detail-page composition
- `notes/features/05-listings.md` — "Inquiry List" and "Admin Panel UI" sections
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — shared status badge component pattern and reusable component placement
- `notes/10-convex-schema.md` — `listing_inquiries` fields and source enum values
- `notes/13-constants-reference.md` — listing status badge colors and inquiry source literals

### Key Rules

1. Create shared `src/components/shared/listing-status-badge.tsx` and use it anywhere listing status appears in admin listing UI.
2. Badge colors must match constants exactly:
   - `DRAFT`: `bg-gray-100 text-gray-600`
   - `PUBLISHED`: `bg-green-100 text-green-700`
   - `ARCHIVED`: `bg-gray-100 text-gray-500`
3. Implement inquiry table component `inquiry-list.tsx` inside listing detail page with columns:
   - Name
   - Phone (`tel:` link with +91 formatted display)
   - Message
   - Source badge (`CONTACT_FORM` / `WHATSAPP_CLICK`)
   - Date
4. Inquiry source badge labels must use canonical source literals (no custom renamed values).
5. Show robust empty state when no inquiries exist.
6. Inquiry visibility is RBAC-gated by `listings.view_inquiries`; hide section/actions if permission missing.
7. Keep this epic scoped to admin display only; no public inquiry submission UI changes.

### Deliverables

- [ ] `src/components/shared/listing-status-badge.tsx` — reusable listing status badge component
- [ ] `src/app/(admin)/admin/listings/components/inquiry-list.tsx` — listing inquiry table section
- [ ] `src/app/(admin)/admin/listings/[id]/page.tsx` — inquiry list integration in detail page

### Acceptance Criteria

1. Listing status badge component is reusable and applied in table/detail/status contexts.
2. Badge color classes for DRAFT/PUBLISHED/ARCHIVED match spec exactly.
3. Inquiry list renders required columns and formatted values.
4. Phone column uses clickable `tel:` links and +91 display formatting.
5. Source badges show only `CONTACT_FORM` and `WHATSAPP_CLICK`.
6. Empty inquiry state is shown when listing has no inquiries.
7. Users without `listings.view_inquiries` do not see inquiry list section.
8. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on `/admin/listings/[id]`: verify badge reuse, inquiry rows, tel links, source badges, and permission-gated visibility.

### Out of Scope

- Inquiry submission backend or public form UX
- WhatsApp click tracking implementation
- Admin CRM workflows for tenant inquiries (later phase)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- Admin sidebar "Listings" nav item enabled with RBAC gate (`PERMISSIONS.LISTINGS_VIEW`)
- `/admin/listings` — listing management page with ALL/DRAFT/PUBLISHED/ARCHIVED status tabs, paginated data table (20/page), create listing sheet
- `/admin/listings/[id]` — listing detail/edit page with form, photo manager, status controls (Publish/Un-publish/Archive/Re-list), Copy Link, Open Public Page
- Listing form with 14 fields in exact order, verified-lead selector, pre-fill from lead data, react-hook-form + zod, rupees→paise conversion
- Photo uploader with drag & drop, browser-image-compression (~1MB), 3-step upload pipeline
- Photo manager with thumbnail grid, cover label, up/down reorder, delete
- Inquiry list with Name, Phone (tel: link), Message, Source badge, Date columns
- Shared `listing-status-badge.tsx` with LISTING_STATUS_COLORS

### Key File Locations

- `src/app/(admin)/admin-layout-client.tsx:69` — Sidebar nav item
- `src/app/(admin)/admin/listings/page.tsx` — Listing management page
- `src/app/(admin)/admin/listings/[id]/page.tsx` — Listing detail/edit page
- `src/app/(admin)/admin/listings/components/` — 8 components (listing-table, listing-status-tabs, listing-form, photo-uploader, photo-manager, listing-status-controls, inquiry-list)
- `src/components/shared/listing-status-badge.tsx` — Reusable status badge

### Deviations from Spec

- Photo reorder uses up/down arrows instead of drag-and-drop (simpler, more reliable approach)

### Gotchas for Next Epic

- Photo upload pipeline: compress → generateUploadUrl → POST → addPhoto (4 async steps, UI must handle each failure state)
- Lead selector filters to VERIFIED leads but client-side filters out leads with existing listings
- Money in form is RUPEES input → PAISE on submit via rupeesToPaise()
