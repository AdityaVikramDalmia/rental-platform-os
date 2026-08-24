---
id: P06-E02
title: Photo Management
phase: 6
status: done
depends_on: ["P06-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P06-E02: Photo Management

## Overview

Implement listing photo management in `convex/listings.ts` using Convex file storage and soft delete conventions. This epic adds upload URL generation, photo persistence, photo removal/reordering, photo query helpers with storage URL resolution, and server-side validation (max active photos + MIME enforcement).

## Prerequisites

- **Read first**: [P06-E01 Completion Summary](P06-E01-listing-backend.md#completion-summary) — confirm listing domain functions, listing status lifecycle, and `listings` audit table wiring already exist. Note: `listing_photos` is NOT in AUDITED_TABLES.
- P06-E01 is complete and `convex/listings.ts` already exists as the canonical listing namespace.

## Task Queue

- [x] P06-E02-T01: `generateUploadUrl` + `addPhoto` Mutations
- [x] P06-E02-T02: `removePhoto` + `reorderPhotos` Mutations
- [x] P06-E02-T03: `getPhotosForListing` Query Helper + Storage URL Resolution
- [x] P06-E02-T04: Server-Side Validation + Max Photo Enforcement

---

## T01: `generateUploadUrl` + `addPhoto` Mutations

### Objective

Implement the first and third steps of the Convex file upload flow: generate a signed upload URL and persist uploaded file `storage_id` records into `listing_photos` with deterministic ordering.

### Required Reading

- `notes/features/05-listings.md` — "Convex Functions" section (photo upload function names and payload expectations)
- `notes/10-convex-schema.md` — `listing_photos` table (`listing_id`, `storage_id`, `display_order`, `is_deleted`) + `by_listing_id` index
- `notes/11-convex-architecture.md` — "File Upload" pattern (3-step flow and mutation/query split)
- `notes/12-decisions-log.md` — D11 (photo ordering stored in separate `listing_photos` table)
- `notes/13-constants-reference.md` — listing permissions (`listings.edit`) and audit action naming conventions
- `notes/03-roles-and-permissions.md` — listing permission ownership for admin actions

### Key Rules

1. **Import `mutation` from `./functions`** — do NOT import mutation from `./_generated/server`; photo writes must run through audit-wrapped mutations.
2. **Keep photo functions in `convex/listings.ts`** under `listings.generateUploadUrl` and `listings.addPhoto`; do NOT create `convex/photos.ts`.
3. **`listings.generateUploadUrl` contract**: args `{}` only, RBAC gate `requirePermission(ctx, "listings.edit")`, return `ctx.storage.generateUploadUrl()` directly.
4. **`listings.addPhoto` args** must be schema-accurate: `listing_id: v.id("listings")`, `storage_id: v.id("_storage")`, `display_order: v.number()`.
5. **`listings.addPhoto` RBAC**: require `listings.edit` before any listing/file checks.
6. **Validate listing exists before insert**, then write schema-exact row: `{ listing_id, storage_id, display_order, is_deleted: false }`; `is_deleted` defaults to `false` on insert.
7. **Do not manually write to `audit_logs`** for photo mutations. Note: `listing_photos` is NOT in `AUDITED_TABLES` (the `audit_logs.action` literal union does not include `LISTING_PHOTOS_*`). Photo operations are implicitly tracked via listing-level audit events. Import `mutation` from `./functions` anyway for consistency, but photo writes will not emit individual audit log entries.
8. **`display_order` is 0-indexed**; lower value means earlier display position, and `0` is cover photo by convention.

### Deliverables

- [ ] `convex/listings.ts` — Add `listings.generateUploadUrl` mutation (RBAC-gated signed upload URL)
- [ ] `convex/listings.ts` — Add `listings.addPhoto` mutation (persist `storage_id` to `listing_photos`)

### Acceptance Criteria

1. `listings.generateUploadUrl` compiles with empty args and returns a valid signed upload URL string.
2. `listings.generateUploadUrl` fails without `listings.edit` permission.
3. `listings.addPhoto` inserts a `listing_photos` row with `is_deleted: false`.
4. Inserted row stores provided `display_order` unchanged.
5. `listings.addPhoto` fails without `listings.edit` permission.
6. No explicit `audit_logs` insert exists in either mutation body.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual smoke check: request upload URL -> upload file from client -> call `listings.addPhoto` with returned `storageId`.

### Out of Scope

- Client-side upload POST implementation (step 2)
- Client-side image resize/compression UX
- Public gallery rendering

---

## T02: `removePhoto` + `reorderPhotos` Mutations

### Objective

Implement admin photo management mutations for non-destructive removal and deterministic ordering updates without deleting stored files.

### Required Reading

- `notes/features/05-listings.md` — photo manager behavior (delete + drag reorder)
- `notes/10-convex-schema.md` — `listing_photos` table and `by_listing_id` index
- `notes/11-convex-architecture.md` — "Soft Delete" pattern (`is_deleted` flag + query filter requirement)
- `notes/13-constants-reference.md` — listing permissions (`listings.edit`) and table naming
- `notes/03-roles-and-permissions.md` — listing edit authorization model

### Key Rules

1. **Import `mutation` from `./functions`** and gate both mutations with `requirePermission(ctx, "listings.edit")`.
2. **`listings.removePhoto` must soft delete only**: patch `is_deleted: true`; never call `ctx.db.delete()`.
3. **Do NOT call `ctx.storage.delete()` on soft delete**; storage cleanup is explicitly deferred to V2.
4. **`listings.reorderPhotos` args**: `listing_id: v.id("listings")`, `photo_ids: v.array(v.id("listing_photos"))`.
5. **Reorder operation writes sequential `display_order` values** based on incoming ID order: `[0, 1, 2, ...]`.
6. **Validate photo ownership** before patching order: each `photo_id` must belong to the provided `listing_id` and must not be soft-deleted.
7. **Do not mutate deleted photos during reorder**; reorder applies only to active photos.
8. **Preserve cover photo convention**: first ID in `photo_ids` becomes `display_order: 0`.

### Deliverables

- [ ] `convex/listings.ts` — Add `listings.removePhoto` mutation (soft delete via `is_deleted: true`)
- [ ] `convex/listings.ts` — Add `listings.reorderPhotos` mutation (batch `display_order` updates)

### Acceptance Criteria

1. `listings.removePhoto` marks targeted photo as `is_deleted: true` and does not hard-delete DB row.
2. `listings.removePhoto` does not call `ctx.storage.delete()`.
3. `listings.removePhoto` fails without `listings.edit` permission.
4. `listings.reorderPhotos` updates active photo orders to contiguous 0-indexed values.
5. `listings.reorderPhotos` rejects payloads containing IDs from another listing.
6. `listings.reorderPhotos` rejects payloads containing deleted photo IDs.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual mutation checks: remove one photo, then reorder remaining photos and confirm cover photo changes with `display_order: 0`.

### Out of Scope

- Permanent storage cleanup
- Client drag-and-drop UI behavior
- Publish/unpublish validation (handled in listing status mutations)

---

## T03: `getPhotosForListing` Query Helper + Storage URL Resolution

### Objective

Add the listing photo query helper that returns active photos in display order and resolves signed storage URLs for rendering in admin/public consumers.

### Required Reading

- `notes/features/05-listings.md` — photo display requirements for admin/public surfaces
- `notes/10-convex-schema.md` — `listing_photos` index + field constraints
- `notes/11-convex-architecture.md` — query patterns and file URL resolution (`ctx.storage.getUrl`)
- `notes/13-constants-reference.md` — listing permission strings for read access decisions
- `notes/03-roles-and-permissions.md` — `listings.view` permission context

### Key Rules

1. **Import `query` from `./_generated/server`** (queries do not use the mutation wrapper).
2. **Implement `listings.getPhotosForListing` in `convex/listings.ts`**; keep photo APIs under the listings namespace. This is the **admin-path photo query** — gated by RBAC, resolves URLs server-side for admin UI consumption.
3. **Query by `by_listing_id` index** and apply required soft-delete filter: `.filter((q) => q.neq(q.field("is_deleted"), true))`.
4. **Order results by `display_order` ascending** so lowest index is returned first.
5. **Resolve each file URL with `ctx.storage.getUrl(photo.storage_id)`** and include URL in response payload. Note: the public-path photo resolution uses a different strategy — `getBySlugInternal` returns raw `storage_id` values and a Next.js Server Action resolves them to URLs (per `notes/11-convex-architecture.md` line 449 and `notes/features/05-listings.md` line 149).
6. **Handle missing storage URLs safely** (`string | null`) without throwing on null URL values.
7. **Gate the query with `requirePermission(ctx, "listings.view")`** and import `requirePermission` from `./auth.helpers`.

### Deliverables

- [ ] `convex/listings.ts` — Add `listings.getPhotosForListing` query helper
- [ ] `convex/listings.ts` — Include URL resolution mapping (`storage_id` -> signed URL)

### Acceptance Criteria

1. Query returns only non-deleted photos for a listing.
2. Returned photos are sorted by `display_order` ascending.
3. Each returned photo includes resolved URL from `ctx.storage.getUrl`.
4. Query handles `null` URL responses without crashing.
5. Query uses `by_listing_id` index (no full table scan).
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual query check: call helper for listing with mixed deleted/active photos and verify ordering + URL shape.

### Out of Scope

- Public listing page gallery component
- Image transformation/CDN optimization
- Contact or inquiry data joins

---

## T04: Server-Side Validation + Max Photo Enforcement

### Objective

Harden photo management mutations with server-side enforcement for active photo limits and MIME validation based on storage metadata.

### Required Reading

- `notes/features/05-listings.md` — photo constraints (max photos, allowed image formats)
- `notes/10-convex-schema.md` — `listing_photos` schema and index definitions
- `notes/11-convex-architecture.md` — file upload safety and validation placement
- `notes/13-constants-reference.md` — listing permissions and canonical naming
- `notes/02-data-models.md` — Listing Photo entity semantics

### Key Rules

1. **Enforce max 10 active photos per listing in `listings.addPhoto`** by counting non-deleted records before insert.
2. **Validation uses active records only** (`is_deleted !== true`); deleted photos do not count toward the limit.
3. **Validate uploaded file metadata via `ctx.db.system.get("_storage", args.storage_id)`** before inserting row. Note: `ctx.db.system.get` requires TWO arguments — the system table name `"_storage"` and the storage ID. Returns `{ _id, _creationTime, contentType, sha256, size }` or `null`.
4. **Allow only image MIME types**: reject non-`image/*` from `contentType`, then enforce whitelist `image/jpeg`, `image/png`, `image/webp`.
5. **Enforce server-side 10MB file size limit**: reject uploads where `metadata.size > 10 * 1024 * 1024` (10,485,760 bytes). This is the hard limit safety net — client-side resize targets ~1MB but may fail or be bypassed.
6. **Fail with explicit error messages** for limit breach, missing metadata, invalid content type, and oversized files.
7. **Keep `display_order` semantics strict**: values must represent 0-indexed positions for active photos.
8. **Do not add storage cleanup calls** during validation failures or soft delete paths (`ctx.storage.delete()` remains out of scope for V2).
9. **Apply validation consistently across add/reorder/remove boundaries** so no mutation can violate active-photo invariants.

### Deliverables

- [ ] `convex/listings.ts` — Add max active photo guard in `listings.addPhoto` (limit = 10)
- [ ] `convex/listings.ts` — Add MIME metadata validation using `ctx.db.system.get("_storage", storage_id)`
- [ ] `convex/listings.ts` — Add 10MB file size server-side validation using `metadata.size`
- [ ] `convex/listings.ts` — Add/adjust shared validation helpers for listing/photo ownership and active-photo invariants

### Acceptance Criteria

1. Attempting to add an 11th active photo throws a clear server error.
2. Adding photo with non-image metadata throws "Only image files are allowed".
3. Adding image with unsupported type (e.g., GIF) throws "Only JPEG, PNG, and WebP images are allowed".
4. Adding file larger than 10MB throws "File too large. Maximum size is 10MB".
5. Metadata lookup uses `ctx.db.system.get("_storage", args.storage_id)` with both arguments.
6. Metadata lookup failure for `storage_id` (returns `null`) throws a descriptive error.
7. Soft-deleted photos are excluded from max-photo count checks.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: upload valid JPEG/PNG/WebP (success), upload GIF (reject), exceed 10 active photos (reject).

### Out of Scope

- Client-side MIME pre-validation UX
- Image resizing/compression pipeline
- Background storage garbage collection

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- `listings.generateUploadUrl` — RBAC-gated upload URL generation
- `listings.addPhoto` — Photo persistence with max 10 enforcement, MIME validation (JPEG/PNG/WebP only), 10MB size cap, storage metadata lookup via `ctx.db.system.get("_storage", storageId)`
- `listings.removePhoto` — Soft delete only (is_deleted: true, no storage cleanup)
- `listings.reorderPhotos` — Batch display_order update with ownership + active-photo validation
- `listings.getPhotosForListing` — RBAC-gated query returning ordered active photos with resolved URLs

### Key File Locations

- `convex/listings.ts:669-815` — All photo management functions appended after inquiry functions

### Deviations from Spec

None. All 4 tasks implemented exactly as specified.

### Gotchas for Next Epic

- Client upload pipeline must: (1) compress image, (2) call generateUploadUrl, (3) POST to URL, (4) parse storageId from response JSON, (5) call addPhoto
- `getPhotosForListing` resolves URLs server-side via `ctx.storage.getUrl()` — use this for admin UI
- For public page, `getBySlugInternal` returns raw storage_ids — resolve via Convex storage URL pattern `${CONVEX_URL}/api/storage/${storageId}`
- `display_order` is 0-indexed; position 0 = cover photo
