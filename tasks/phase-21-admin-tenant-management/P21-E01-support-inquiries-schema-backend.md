---
id: P21-E01
title: Support Inquiries Schema & Backend
phase: 21
epic: 1
status: done
updated_at: 2026-02-19
priority: high
depends_on: ["P01-E01"]
estimated_tasks: 3
---

# P21-E01: Support Inquiries Schema & Backend

## Overview

Add backend coverage for support inquiries submitted from the public Contact Hub: resolve schema drift (`support_inquiries` missing in code), add support inquiry constants/permissions/rate limiter/audit wiring, and implement `convex/supportInquiries.ts` with lifecycle mutations and admin inbox queries required by `/admin/support`.

This epic is backend-only and intentionally includes a same-phase doc reconciliation update (`ops_notes` addition) so `notes/10-convex-schema.md` and `convex/schema.ts` stay aligned.

## Prerequisites

- **Read first**: [P01-E01 Completion Summary](../phase-01-auth/P01-E01-project-scaffolding.md#completion-summary) - baseline auth wrappers, constants conventions, and audit trigger architecture.
- `P01-E01` must be complete before starting this epic because this work depends on existing wrapped mutations (`convex/functions.ts`), permission constants (`lib/constants.ts`), and admin auth helpers.
- **Codebase facts to verify before starting**:
  - `convex/schema.ts` currently has no `support_inquiries` table (schema drift vs `notes/10-convex-schema.md` lines 737-760).
  - `lib/constants.ts` currently has no `SUPPORT_INQUIRY_STATUS`, no support inquiry status color map, and no support inquiry permissions.
  - `convex/rateLimiter.ts` currently has no `public:support_inquiry` key.
  - `convex/functions.ts` `AUDITED_TABLES` currently does not include `support_inquiries`.
  - `convex/schema.ts` `auditActionValidator` and `lib/constants.ts` `AUDIT_ACTIONS` currently have no support inquiry actions.
  - `convex/supportInquiries.ts` does not exist yet.

## Task Queue

- [x] P21-E01-T01: Schema Drift Fix + Constants + Permissions + Rate Limiter + Audit
- [x] P21-E01-T02: Core Mutations
- [x] P21-E01-T03: Queries

---

## T01: Schema Drift Fix + Constants + Permissions + Rate Limiter + Audit

### Objective

Add `support_inquiries` to the runtime schema and wire all shared backend primitives (constants, permissions, rate limiter, audit actions, audited tables) so the support inquiry lifecycle is fully represented before implementing mutations/queries.

### Required Reading

- `notes/10-convex-schema.md` - `support_inquiries` schema definition (lines 737-760)
- `notes/06-admin-panel-ux.md` - Support Inquiry Queue filters/actions and internal-notes requirement (lines 440-463)
- `notes/13-constants-reference.md` - Support inquiry status colors (lines 576-583)
- `notes/04-state-machines.md` - support inquiry transitions (lines 821-826)
- `convex/schema.ts` - current validator/table/index ordering and `auditActionValidator`
- `lib/constants.ts` - status/permission/audit constant patterns (`TENANT_INQUIRY_STATUS`, `OWNER_SERVICE_REQUEST_STATUS`, `AUDIT_ACTIONS` style)
- `convex/rateLimiter.ts` - fixed-window limiter key structure
- `convex/functions.ts` - `AUDITED_TABLES` trigger coverage pattern

### Key Rules

1. Add `support_inquiries` to `convex/schema.ts` using `notes/10-convex-schema.md` lines 737-760 as baseline, with one intentional extension: `ops_notes: v.optional(v.string())` for admin internal notes from wireframe actions (`notes/06-admin-panel-ux.md` line 462).
2. Add all documented indexes exactly: `.index("by_status", ["status"])`, `.index("by_persona_type", ["persona_type"])`, `.index("by_assigned_admin_id", ["assigned_admin_id"])`.
3. Add `SUPPORT_INQUIRY_STATUS` to `lib/constants.ts` with exactly four values: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.
4. Add `SupportInquiryStatus` type and `SUPPORT_INQUIRY_STATUS_COLORS` map using doc-defined Tailwind tokens exactly:
   - `OPEN`: `bg-blue-100 text-blue-700`
   - `IN_PROGRESS`: `bg-amber-100 text-amber-700`
   - `RESOLVED`: `bg-green-100 text-green-700`
   - `CLOSED`: `bg-gray-100 text-gray-500`
5. Add permissions in `lib/constants.ts` `PERMISSIONS` object:
   - `SUPPORT_INQUIRIES_VIEW`
   - `SUPPORT_INQUIRIES_MANAGE`
6. Add `public:support_inquiry` to `convex/rateLimiter.ts` as fixed-window limiter for contact-hub spam protection (5 per hour; keying strategy is implemented at call sites in T02).
7. Add `"support_inquiries"` to `AUDITED_TABLES` in `convex/functions.ts` so wrapped mutations auto-write `audit_logs` entries.
8. Extend `convex/schema.ts` `auditActionValidator` and `lib/constants.ts` `AUDIT_ACTIONS` with support inquiry actions needed by trigger-generated writes:
   - `SUPPORT_INQUIRIES_INSERT`
   - `SUPPORT_INQUIRIES_UPDATE`
9. Update `notes/10-convex-schema.md` support inquiry block to include `ops_notes` and mark it as an intentional schema-doc reconciliation for Phase 21.

### Deliverables

- [ ] `convex/schema.ts` - `support_inquiries` table added with all documented fields/indexes plus intentional `ops_notes` field; `auditActionValidator` includes support inquiry actions
- [ ] `lib/constants.ts` - `SUPPORT_INQUIRY_STATUS`, `SupportInquiryStatus`, `SUPPORT_INQUIRY_STATUS_COLORS`, support inquiry permissions, and support inquiry `AUDIT_ACTIONS`
- [ ] `convex/rateLimiter.ts` - `public:support_inquiry` fixed-window limiter key
- [ ] `convex/functions.ts` - `support_inquiries` added to `AUDITED_TABLES`
- [ ] `notes/10-convex-schema.md` - `support_inquiries` docs updated to include `ops_notes`

### Acceptance Criteria

1. `support_inquiries` exists in `convex/schema.ts` with all fields from docs plus optional `ops_notes`.
2. `support_inquiries` indexes are exactly `by_status`, `by_persona_type`, and `by_assigned_admin_id`.
3. `SUPPORT_INQUIRY_STATUS` contains exactly 4 statuses and compiles as a typed constant pattern matching existing status enums.
4. `SUPPORT_INQUIRY_STATUS_COLORS` exactly matches constants reference colors for all 4 statuses.
5. `PERMISSIONS` includes both `SUPPORT_INQUIRIES_VIEW` and `SUPPORT_INQUIRIES_MANAGE`.
6. `public:support_inquiry` limiter exists and is registered in the exported `RateLimiter` config.
7. `support_inquiries` is included in both audit action validators/constants and in `AUDITED_TABLES`.
8. `notes/10-convex-schema.md` documents `ops_notes` so schema/docs are aligned.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npx convex dev
```

Confirm Convex starts with no schema validation errors and that `public:support_inquiry` and all new constants are importable.

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, `convex/rateLimiter.ts`, `convex/functions.ts`, and `notes/10-convex-schema.md`.

### Out of Scope

- Implementing support inquiry mutations (`submit`, `updateStatus`, `assign`, `updateOpsNotes`) (T02)
- Implementing support inquiry admin list/detail/count queries (T03)
- Admin support inbox UI route/components (`/admin/support`) (later P21 epic)

---

## T02: Core Mutations

### Objective

Create `convex/supportInquiries.ts` lifecycle mutations so public users can submit support inquiries from Contact Hub and admins can assign inquiries, update status under strict transitions, and maintain internal ops notes.

### Required Reading

- `notes/features/15-public-pages.md` - Contact Hub form and submission contract (`supportInquiries.submit`) (lines 49-63, 95-97, 127)
- `notes/04-state-machines.md` - support inquiry transitions with no reopen paths (lines 821-826)
- `notes/06-admin-panel-ux.md` - admin actions required for support queue (lines 461-463)
- `convex/functions.ts` - wrapped `mutation` export and audit-trigger behavior
- `convex/rateLimiter.ts` - limiter invocation pattern for public flows
- `convex/auth.helpers.ts` - admin permission enforcement helpers
- `lib/validators.ts` - `normalizePhone()` input normalization

### Key Rules

1. Create `convex/supportInquiries.ts` and import `mutation` from `./functions` so all writes flow through audit triggers.
2. Implement `submit` as a public mutation (no auth requirement) with args matching the public-page contract and default `status: "OPEN"`.
3. `submit` must call rate limiter key `public:support_inquiry` before insert and enforce the intended anti-spam semantics.
4. `submit` must normalize phone using `normalizePhone()` when phone is provided; store normalized 10-digit value or `undefined`.
5. Implement `updateStatus` as admin-only with `SUPPORT_INQUIRIES_MANAGE` permission and exact transition validation:
   - `OPEN -> IN_PROGRESS, RESOLVED, CLOSED`
   - `IN_PROGRESS -> RESOLVED, CLOSED`
   - `RESOLVED -> CLOSED`
   - no reopen paths
6. Invalid transitions must throw explicit errors; do not silently coerce statuses.
7. Implement `assign` as admin-only with `SUPPORT_INQUIRIES_MANAGE`, updating `assigned_admin_id` for a target inquiry.
8. Implement `updateOpsNotes` as admin-only with `SUPPORT_INQUIRIES_MANAGE`, and only patch `ops_notes` (dedicated internal-notes mutation).
9. Keep all status/date conventions intact: statuses from constants/state machine only, Unix ms via `Date.now()` if any timestamp fields are added later, no `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `convex/supportInquiries.ts` - `submit`, `updateStatus`, `assign`, and `updateOpsNotes` mutations with transition validation and permission checks

### Acceptance Criteria

1. Public contact submissions can create `support_inquiries` records with `status: OPEN`.
2. Excessive submissions are blocked by `public:support_inquiry` limiter.
3. `updateStatus` enforces only the allowed transitions from `notes/04-state-machines.md` lines 821-826.
4. Attempts to reopen (`IN_PROGRESS -> OPEN`, `RESOLVED -> OPEN`) fail with explicit errors.
5. `assign` updates `assigned_admin_id` only for authorized admins.
6. `updateOpsNotes` exists as a dedicated mutation and persists admin internal notes.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npx convex dev
```

Exercise each mutation via Convex dashboard/function calls: valid status paths succeed, invalid status paths throw, and repeated `submit` calls trigger limiter rejection.

Run `lsp_diagnostics` on `convex/supportInquiries.ts`.

### Out of Scope

- Admin support inbox list/detail/count queries (T03)
- UI wiring for Contact Hub form to mutation invocation (public page work)
- Admin table/detail panel components for support queue

---

## T03: Queries

### Objective

Implement admin-facing support inbox queries required by `/admin/support`: paginated list with filter controls, single-record detail with assigned admin enrichment, and per-status count badges.

### Required Reading

- `notes/06-admin-panel-ux.md` - support queue tabs, table, and filters (lines 440-463)
- `notes/04-state-machines.md` - support inquiry statuses/transitions (lines 821-826)
- `convex/leads.ts` - admin paginated list/query patterns and index-first filtering style
- `convex/functions.ts` - `query` export usage pattern
- `notes/13-constants-reference.md` - support inquiry status list/colors (lines 576-583)

### Key Rules

1. Add `list` query in `convex/supportInquiries.ts` as admin-only and paginated using `paginationOptsValidator`.
2. `list` must support optional filters required by wireframe/actions:
   - `status`
   - `persona_type`
   - `assigned_admin_id`
   - `preferred_contact_method`
3. Query implementation should prefer index-first access where possible and use post-index `.filter()` only when index combination is unavailable.
4. Add `getById` query as admin-only and return inquiry enriched with assigned admin summary (`name`, `email`) when `assigned_admin_id` is present.
5. Add `statusCounts` query as admin-only returning counts for all four statuses using simple V1 approach (`.collect().length`), not aggregate components.
6. `statusCounts` return shape must be:
   `{ OPEN: number, IN_PROGRESS: number, RESOLVED: number, CLOSED: number }`.
7. Import `query` from `./functions` (project convention), keep strict typing, and do not introduce unrelated dashboard aggregation scope.

### Deliverables

- [ ] `convex/supportInquiries.ts` - `list`, `getById`, and `statusCounts` queries for admin support inbox

### Acceptance Criteria

1. `list` returns paginated support inquiries and respects all four optional filters.
2. `list` works for unfiltered and filtered modes without type errors.
3. `getById` returns inquiry data plus assigned admin `name`/`email` enrichment when available.
4. `statusCounts` returns all four status keys, each reflecting current DB counts.
5. Results are restricted to authorized admins with support inquiry view permissions.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npx convex dev
```

Test list filtering and counts against seeded/manual support inquiry records; verify tab totals in query output match actual status distribution.

Run `lsp_diagnostics` on `convex/supportInquiries.ts`.

### Out of Scope

- `/admin/support` page implementation and component rendering
- Dashboard CRM summary cards using these query outputs (later P21 epic)
- Bulk actions/export workflows for support inquiries (V2)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-19

### What Was Built

- Added support inquiry lifecycle constants, permissions, status colors/labels, and audit action keys in shared constants.
- Expanded `support_inquiries` schema with status lifecycle fields (`status`, `ops_notes`, assignment/timestamps) and status/persona/assignee indexes.
- Added support inquiries to audit trigger coverage (`AUDITED_TABLES`) and audit action validator literals.
- Rebuilt `convex/supportInquiries.ts` with transition-safe status updates, assignment, ops notes mutation, and admin list/detail/count queries.

### Key File Locations

| File                         | What                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`           | Support inquiry status validator, audit action literals, and expanded `support_inquiries` fields/indexes |
| `lib/constants.ts`           | Support inquiry status enum/type, colors/labels, permissions, and audit action constants                 |
| `convex/functions.ts`        | Added `support_inquiries` to trigger-backed audited tables                                               |
| `convex/supportInquiries.ts` | Public submission + admin status/assignment/notes mutations and inbox queries                            |

### Deviations from Spec

None - implemented exactly as specified for Phase 21 support backend scope.

### Gotchas for Next Epic

- `submit` remains `internalMutation` because Contact Hub currently posts through Convex HTTP route (`/api/public/support-inquiry`) and calls `internal.supportInquiries.submit`.
- `getSubmittedCount` returns `OPEN` inquiries and is reused for sidebar badge wiring in admin layout.
