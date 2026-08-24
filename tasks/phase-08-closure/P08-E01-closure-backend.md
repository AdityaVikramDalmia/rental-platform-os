---
id: P08-E01
title: Closure Backend
phase: 8
status: done
depends_on: ["P05-E01", "P06-E01", "P01-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P08-E01: Closure Backend

## Overview

Implement the closure backend foundation for Phase 8: create the `convex/closures.ts` domain module, enforce closure lifecycle transitions, support closure document uploads, provide admin list/detail queries with required joins, implement cancellation-driven payout void cascade, and create the shared `closure-status-badge.tsx` component so E02 can consume it without hidden dependencies.

## Prerequisites

- **Read first**: [P05-E01 Completion Summary](../phase-05-owner-verification/P05-E01-verification-backend.md#completion-summary) — closure creation must enforce VERIFIED-only leads.
- **Read first**: [P06-E01 Completion Summary](../phase-06-listings/P06-E01-listing-backend.md#completion-summary) — reuse `listings.by_lead_id` linkage when creating closures.
- **Read first**: [P01-E02 Completion Summary](../phase-01-auth/P01-E02-schema-and-infra.md#completion-summary) — `closures` is NOT yet in `AUDITED_TABLES` and must be added in T01. `CLOSURES_INSERT`/`CLOSURES_UPDATE` already exist in `audit_logs.action` union — do NOT re-add those.

## Task Queue

- [ ] P08-E01-T01: Closure Domain Module + Status Transition Helper + Shared Badge
- [ ] P08-E01-T02: Closure Create + Document Upload + List + GetById
- [ ] P08-E01-T03: Closure Confirm + Cancel with Payout Void Cascade
- [ ] P08-E01-T04: Closure Update (Edit PENDING Closures)
- [ ] P08-E01-T05: Closure Queries + Edge Case Enforcement

---

## T01: Closure Domain Module + Status Transition Helper + Shared Badge

### Objective

Create the closure module scaffold, centralize closure transition validation in a reusable helper, and create a role-agnostic shared closure status badge in E01 so E02 admin UI can consume it without hidden cross-epic dependency.

### Required Reading

- `notes/04-state-machines.md` — "Closure Status" and terminal-state rules
- `notes/10-convex-schema.md` — `closures` table definition and `audit_logs.action` union literals
- `notes/11-convex-architecture.md` — "Function Layer Architecture" (`mutation` import conventions, audited tables)
- `notes/13-constants-reference.md` — "Closure Status" colors and "Audit Action Strings" for closures
- `tasks/phase-07-visit-management/P07-E01-visit-backend.md` — T01 pattern for shared badge placement in backend epic

### Key Rules

1. Create `convex/closures.ts` as the closure domain module and keep closure backend functions in this file.
2. Import `mutation` from `./functions` (audit-enabled path) and import `query` from `./_generated/server` exactly.
3. Add `validateClosureTransition(currentStatus, newStatus)` helper returning `boolean`.
4. Encode transitions exactly: `PENDING -> CONFIRMED`, `PENDING -> CANCELLED`; terminal states `CONFIRMED` and `CANCELLED` have no outgoing transitions.
5. Create `src/components/shared/closure-status-badge.tsx` in E01 (not E02) to avoid hidden dependency and unblock parallel-safe UI consumption.
6. Badge colors must match constants docs exactly: `PENDING` -> `bg-amber-100 text-amber-700`, `CONFIRMED` -> `bg-green-100 text-green-700`, `CANCELLED` -> `bg-red-100 text-red-700`.
7. Add `"closures"` to `AUDITED_TABLES` in `convex/functions.ts` (NOT already present — must be added after `"visits"`). Do NOT add `CLOSURES_INSERT`/`CLOSURES_UPDATE` to `audit_logs.action` (those already exist in schema.ts).
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/closures.ts` — Create module skeleton with required imports and shared transition helper
- [ ] `convex/closures.ts` — Add explicit `validateClosureTransition(currentStatus, newStatus)` map
- [ ] `convex/functions.ts` — Add `"closures"` to `AUDITED_TABLES` array (after `"visits"`)
- [ ] `src/components/shared/closure-status-badge.tsx` — Shared role-agnostic badge with exact 3-status color mapping

### Acceptance Criteria

1. `convex/closures.ts` exists and imports `mutation` from `./functions` plus `query` from `./_generated/server`.
2. `validateClosureTransition("PENDING", "CONFIRMED")` returns `true`.
3. `validateClosureTransition("PENDING", "CANCELLED")` returns `true`.
4. `validateClosureTransition("CONFIRMED", "PENDING")` returns `false`.
5. `validateClosureTransition("CANCELLED", "CONFIRMED")` returns `false`.
6. `src/components/shared/closure-status-badge.tsx` renders `PENDING`, `CONFIRMED`, `CANCELLED` with exact Tailwind classes from constants docs.
7. Badge component is shared/role-agnostic and does not import admin-only or guard-only modules.
8. `"closures"` is added to `AUDITED_TABLES` in `convex/functions.ts` (after `"visits"`), and `CLOSURES_INSERT`/`CLOSURES_UPDATE` are NOT re-added to `audit_logs.action` (already present in schema.ts).
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual check: validate transition helper truth table and run `lsp_diagnostics` on `convex/closures.ts` and `src/components/shared/closure-status-badge.tsx`.

### Out of Scope

- Closure CRUD/query implementation
- Payout mutations
- Admin closure page/UI wiring

---

## T02: Closure Create + Document Upload + List + GetById

### Objective

Implement closure creation and retrieval endpoints with VERIFIED-only gating, one-closure-per-lead enforcement, listing auto-linking, document upload URL generation, and joined list/detail payloads required by admin closure workflows.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Part 1: Closures" and "Convex Functions" sections
- `notes/features/07-closure-and-payouts.md` — "Business Rules" items 1, 2, and 11
- `notes/10-convex-schema.md` — `closures` table args and indexes (`by_lead_id`, `by_status`), `payouts.by_closure_id` reference
- `notes/11-convex-architecture.md` — "File Upload Pattern" and auth helper usage
- `notes/13-constants-reference.md` — closure permissions (`closures.view`, `closures.create`, `closures.edit`)

### Key Rules

1. `closures.create` must use `requirePermission(ctx, "closures.create")`.
2. `closures.create` validates `lead.status === "VERIFIED"` before insert.
   2a. `closures.create` must validate uploaded file metadata server-side: check `ctx.storage.getMetadata()` for `rent_agreement_storage_id` and each `additional_documents[].storage_id` — enforce allowed MIME types (`application/pdf`, `image/jpeg`, `image/png`) and max size (10MB). Reject invalid files before insert. Match the listings `addPhoto` validation pattern.
3. Enforce one closure per lead by querying `closures.by_lead_id`; throw if an existing closure is found.
4. Auto-link `listing_id` by querying `listings.by_lead_id` and storing listing ID when present.
5. Insert with `status: "PENDING"` and set `closed_by_admin_id` from authenticated admin.
6. `closures.generateUploadUrl` returns `ctx.storage.generateUploadUrl()` and must allow either `closures.create` OR `closures.edit` permission.
7. `closures.getById` must use `requirePermission(ctx, "closures.view")` and return closure + lead + building + society + guard + optional listing + optional payout joins + resolved document URLs. Payout is queried via `payouts.by_closure_id` index (returns `null` until P09 creates payouts — forward-compatible). Document URLs are resolved via `ctx.storage.getUrl()` for `rent_agreement_storage_id` and each `additional_documents[].storage_id`.
8. `closures.list` must use `requirePermission(ctx, "closures.view")`, support `paginationOptsValidator`, filter by optional `status` (via `by_status` index), optional `move_in_date` range (post-index filter), and optional `society_id` (via lead/building join post-filter). Sort order is descending by `_creationTime` — must explicitly call `.order("desc")` (Convex default is ascending, NOT descending). Include payout status per closure (query `payouts.by_closure_id` for each paginated result — `null` until P09). Note: `move_in_date` sorting would require a compound index; for V1 closure volumes, `_creationTime` descending is sufficient. Post-join filters (society, date range) may produce sparse pages — this is acceptable for V1 closure volumes; do NOT implement cursor-fill loops. Validate `date_from` ≤ `date_to` when both are provided.
9. Do not denormalize `society_id` onto `closures`; derive society in query via `lead -> building -> society` joins at read time.
10. Store all monetary fields as paise integers and all dates as Unix ms numbers.

### Deliverables

- [ ] `convex/closures.ts` — Add `closures.create` mutation with VERIFIED-only and one-per-lead enforcement
- [ ] `convex/closures.ts` — Add `closures.generateUploadUrl` mutation for rent agreement/additional docs upload flow
- [ ] `convex/closures.ts` — Add `closures.getById` query with required joined payload (including optional payout join via `payouts.by_closure_id`)
- [ ] `convex/closures.ts` — Add `closures.list` paginated query with status/date filters, `_creationTime` desc sort, and payout status per closure

### Acceptance Criteria

1. `closures.create` requires `requirePermission(ctx, "closures.create")` and accepts args: `lead_id` (required), `demorentals_deal_id` (optional), `move_in_date` (required), `rent_agreement_storage_id` (optional), `commission_amount` (optional), `brokerage_tenant_side` (optional), `brokerage_owner_side` (optional), `additional_documents` (optional array of `{ name, storage_id }`), and `notes` (optional).
2. `closures.create` rejects when lead status is not exactly `"VERIFIED"`.
3. `closures.create` rejects when a closure already exists for the same `lead_id` via `closures.by_lead_id` lookup.
4. `closures.create` inserts with `status: "PENDING"`, sets `closed_by_admin_id`, and auto-links `listing_id` when `listings.by_lead_id` finds a record.
5. `closures.generateUploadUrl` returns a signed upload URL from `ctx.storage.generateUploadUrl()` and allows callers with `closures.create` OR `closures.edit`.
6. `closures.getById` is gated by `closures.view` and returns `{ closure, lead, building, society, guard, listing?, payout?, rent_agreement_url?, additional_document_urls? }` (listing and payout optional). Payout queried via `payouts.by_closure_id` — returns `null` until P09 creates payouts. Document URLs resolved via `ctx.storage.getUrl()` for `rent_agreement_storage_id` and each `additional_documents[].storage_id`.
7. `closures.getById` derives society via lead/building joins and does not depend on `closures.society_id` (field does not exist).
8. `closures.list` is gated by `closures.view`, supports `paginationOptsValidator`, accepts `status` (uses `by_status` index), optional `date_from`/`date_to` on `move_in_date` (post-index filter), and optional `society_id` (derived via lead/building join post-filter). Sort order is descending by `_creationTime` (newest first, index-compatible). Includes `payout_status` per closure (queried via `payouts.by_closure_id` for each paginated result — returns `null` until P09).
9. Monetary values are stored as non-float paise numbers; date values are Unix ms numbers.
10. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: create closure from VERIFIED lead, retry create on same lead (expect rejection), fetch via `getById`, run `list` with date/status filters, and verify upload URL generation path.

### Out of Scope

- Closure confirm/cancel transitions
- Payout creation or lifecycle mutations
- Guard-facing closure/earnings queries

---

## T03: Closure Confirm + Cancel with Payout Void Cascade

### Objective

Implement admin transition mutations for confirming and cancelling closures, enforce closure state machine validity via shared helper, and add forward-compatible payout void cascade for linked INITIATED payouts.

### Required Reading

- `notes/04-state-machines.md` — "Closure Status" and "Payout Status" sections
- `notes/features/07-closure-and-payouts.md` — "Payout Voiding" and "Business Rules" item 10
- `notes/03-roles-and-permissions.md` — closure permission ownership and Finance role scope
- `notes/13-constants-reference.md` — closure/payout status literals and closure permissions
- `notes/10-convex-schema.md` — `payouts.by_closure_id` index and payout status union (`INITIATED`, `APPROVED`, `PAID`, `VOIDED`)

### Key Rules

1. `closures.confirm` uses `requirePermission(ctx, "closures.confirm")` and only allows `PENDING -> CONFIRMED`.
2. `closures.confirm` sets `confirmed_at = Date.now()` on successful confirmation.
3. `closures.cancel` uses `requirePermission(ctx, "closures.edit")` and only allows `PENDING -> CANCELLED`.
4. `closures.confirm` permission is distinct from `closures.edit`; do not substitute one for the other.
5. On cancellation, query `payouts.by_closure_id`; for each linked payout with `status === "INITIATED"`, patch status to `"VOIDED"`.
6. Do not void `APPROVED` or `PAID` payouts in this cascade.
7. Treat `closures.cancel` as required inferred behavior even though it is omitted from the feature spec's Convex function list.
8. Reuse `validateClosureTransition` from T01 for both confirm and cancel mutations.

### Deliverables

- [ ] `convex/closures.ts` — Add `closures.confirm` mutation (`closures.confirm` RBAC, sets `confirmed_at`)
- [ ] `convex/closures.ts` — Add `closures.cancel` mutation (`closures.edit` RBAC, payout void cascade)
- [ ] `convex/closures.ts` — Wire both mutations through `validateClosureTransition`

### Acceptance Criteria

1. `closures.confirm` is gated by `requirePermission(ctx, "closures.confirm")` and rejects callers with only `closures.edit`.
2. `closures.confirm` succeeds only when closure status is `"PENDING"`; all other source statuses are rejected.
3. `closures.confirm` sets `status: "CONFIRMED"` and sets `confirmed_at` to a Unix ms timestamp.
4. `closures.cancel` is gated by `requirePermission(ctx, "closures.edit")` and succeeds only from `"PENDING"`.
5. `closures.cancel` sets closure status to `"CANCELLED"` and rejects cancellation of `"CONFIRMED"` or existing `"CANCELLED"` closures.
6. Cancel cascade loads linked payouts via `payouts.by_closure_id` and patches only `"INITIATED"` payouts to `"VOIDED"`.
7. Linked payouts with `"APPROVED"` or `"PAID"` are not mutated by the cancel cascade.
8. Both confirm/cancel transitions call `validateClosureTransition` and fail invalid transitions explicitly.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: confirm a PENDING closure, cancel a PENDING closure, attempt invalid transitions, and verify only INITIATED payouts are voided when present.

### Out of Scope

- Manual payout void mutation/API (belongs to P09)
- Payout approve/mark-paid flows
- Listing archival on closure changes

---

## T04: Closure Update (Edit PENDING Closures)

### Objective

Implement closure edit behavior for PENDING closures only, allow targeted field updates, enforce paise/date validation, and block edits on terminal closure states.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Part 1: Closures" fields and "Convex Functions" (`closures.update`)
- `notes/04-state-machines.md` — terminal closure states (`CONFIRMED`, `CANCELLED`)
- `notes/10-convex-schema.md` — editable closure fields and validator types
- `notes/13-constants-reference.md` — `closures.edit` permission string

### Key Rules

1. `closures.update` must use `requirePermission(ctx, "closures.edit")`.
2. `closures.update` can edit only: `demorentals_deal_id`, `move_in_date`, `rent_agreement_storage_id`, `commission_amount`, `brokerage_tenant_side`, `brokerage_owner_side`, `additional_documents`, and `notes`.
3. Reject updates when closure status is terminal (`CONFIRMED` or `CANCELLED`) with descriptive error messages.
4. Preserve immutable linkage fields (`lead_id`, `listing_id`, `closed_by_admin_id`, `status`) in update flow.
5. Monetary fields, when provided, must be non-negative integer paise values.
   5a. `closures.update` must validate uploaded file metadata server-side (same MIME type + size checks as `closures.create`) when `rent_agreement_storage_id` or `additional_documents` are provided.
6. Date fields (`move_in_date`) remain Unix ms numbers.
7. Use strict typing; no `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/closures.ts` — Add `closures.update` mutation with `closures.edit` RBAC
- [ ] `convex/closures.ts` — Enforce editable-field whitelist and terminal-state guard
- [ ] `convex/closures.ts` — Add non-negative paise integer validation for money fields

### Acceptance Criteria

1. `closures.update` is gated by `requirePermission(ctx, "closures.edit")`.
2. `closures.update` succeeds only when current closure status is `"PENDING"`.
3. Attempts to edit `"CONFIRMED"` or `"CANCELLED"` closures fail with explicit terminal-state errors.
4. Update payload supports only the listed editable fields and does not allow changing `lead_id` or `status`.
5. `commission_amount`, `brokerage_tenant_side`, and `brokerage_owner_side` reject negative values.
6. `commission_amount`, `brokerage_tenant_side`, and `brokerage_owner_side` reject non-integer values.
7. `move_in_date` remains a Unix ms numeric field after update.
8. `additional_documents` entries require shape `{ name: string, storage_id: Id<"_storage"> }`.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: edit a PENDING closure with valid payload, attempt invalid money values, and attempt edit on terminal closures.

### Out of Scope

- Confirm/cancel mutations
- Payout linkage changes
- Admin UI edit form implementation

---

## T05: Closure Queries + Edge Case Enforcement

### Objective

Add closure-by-lead lookup for admin UI branching and explicitly enforce/verify critical closure business rules and edge cases in backend behavior.

### Required Reading

- `notes/features/07-closure-and-payouts.md` — "Business Rules" and "Edge Cases"
- `notes/features/07-closure-and-payouts.md` — "Convex Functions" (`closures.getByLeadId` parity requirement)
- `notes/02-data-models.md` — Section K (Closure) and Section L (Payout) notes for cancel/void relationship
- `notes/10-convex-schema.md` — `closures.by_lead_id` index and `_storage` validator usage
- `notes/13-constants-reference.md` — `closures.view` permission string

### Key Rules

1. Implement `closures.getByLeadId` query gated by `requirePermission(ctx, "closures.view")`.
2. Query must return closure for the provided lead when it exists, or `null` when absent, to drive "View Closure" vs "Create Closure" UI.
3. Preserve one-closure-per-lead enforcement in create path (end-to-end behavior).
4. Preserve VERIFIED-only lead constraint in create path.
5. Keep file storage references strongly typed with `v.id("_storage")` validators in closure args.
6. Allow closure creation in `PENDING` with partial documentation (move-in date required, documents optional).
7. Allow closure creation even if submitting guard later became `BANNED` (closure remains valid because lead is historical source).
8. Do not add payout mutations, guard earnings APIs, or other P09 scope in this epic.

### Deliverables

- [ ] `convex/closures.ts` — Add `closures.getByLeadId` query (`closures.view` RBAC)
- [ ] `convex/closures.ts` — Ensure one-closure-per-lead and VERIFIED-only checks are clearly enforced/documented in create path
- [ ] `convex/closures.ts` — Ensure `_storage` IDs are validated via typed args for rent agreement/additional docs fields

### Acceptance Criteria

1. `closures.getByLeadId` requires `requirePermission(ctx, "closures.view")`.
2. `closures.getByLeadId({ lead_id })` returns closure document when one exists and `null` when none exists.
3. Admin UI can branch from `getByLeadId` response to show "View Closure" when non-null and "Create Closure" when null.
4. `closures.create` still rejects duplicate closure creation for an existing `lead_id`.
5. `closures.create` still rejects leads whose status is not exactly `"VERIFIED"`.
6. `rent_agreement_storage_id` and `additional_documents[].storage_id` use `Id<"_storage">`-validated args (invalid IDs fail validation before handler logic).
7. Creating PENDING closure with only required fields (`lead_id`, `move_in_date`) succeeds without rent agreement or additional documents.
8. Closure creation does not block based on current guard status if the source lead is VERIFIED (including cases where lead submitter is now `BANNED`).
9. No payout mutations are introduced in `convex/closures.ts` in this epic.
10. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual checks: run `getByLeadId` for lead with/without closure, verify create constraints and optional-doc edge case behavior, and confirm no P09 payout mutation scope is added.

### Out of Scope

- Payout lifecycle APIs (`payouts.create`, `payouts.approve`, `payouts.markPaid`, manual void)
- Guard earnings query/UI
- New closure documents table or schema denormalization (`society_id` on closure)

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
