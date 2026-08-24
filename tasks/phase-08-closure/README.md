# Phase 8: Closure (P08)

## Overview

Closures are the financial record of a successful deal: admin creates a closure from a VERIFIED lead, capturing the brokerage breakdown (tenant-side + owner-side in paise), rent agreement upload, additional documents via Convex file storage, and an optional DemoRentals deal ID reference. Closures follow a two-step confirmation flow (PENDING → CONFIRMED) before payouts can be created in P09, and cancellation (PENDING → CANCELLED) triggers a forward-compatible payout void cascade that voids any INITIATED payouts linked via the `payouts.by_closure_id` index. Each lead can have at most one closure, and only VERIFIED leads are eligible. The `listing_id` is auto-linked on creation if a listing exists for the lead.

## Dependencies

| Phase / Epic                       | What It Provides for P08                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P05-E01 (Verification Backend)** | VERIFIED leads exist (`status === "VERIFIED"`) for closure creation. Only VERIFIED leads can have closures created.                                                                                                |
| **P07-E01 (Visit Backend)**        | Visits provide deal context — business flow assumes visits occur before closure. Closures reference leads (not visits) directly, so this is an execution-order dependency, not a hard data dependency.             |
| **P06-E01 (Listing Backend)**      | `listings.by_lead_id` index exists — P08 uses it to auto-link `listing_id` on closure creation if a listing exists for the lead (same pattern as P07 visits)                                                       |
| **P01-E02 (Schema & Infra)**       | `convex/functions.ts` audit trigger wrapper — `closures` is NOT yet in `AUDITED_TABLES` — P08-E01-T01 MUST add it. `CLOSURES_INSERT`/`CLOSURES_UPDATE` already in `audit_logs.action` union — do NOT re-add those. |
| **P04-E03 (Admin Lead Queue UI)**  | Admin table + filter + detail panel patterns — P08 reuses for closures board UI layout                                                                                                                             |

## Key Documentation

| Doc                                                           | Section                                                                            | Why You Need It                                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `notes/features/07-closure-and-payouts.md`                    | Part 1: Closures + Payout Voiding + Convex Functions + Business Rules + Edge Cases | THE feature spec — closure creation, two-step confirmation, document upload, brokerage, business rules, edge cases               |
| `notes/04-state-machines.md`                                  | Closure Status section + Payout Status section                                     | All valid transitions (PENDING → CONFIRMED/CANCELLED), terminal states, payout void cascade on cancel                            |
| `notes/02-data-models.md`                                     | Section K (Closure) + Section L (Payout)                                           | Closure entity fields, types, indexes, relationships. Payout model for void cascade reference.                                   |
| `notes/10-convex-schema.md`                                   | `closures` table + `payouts` table + `audit_logs.action` union                     | Exact validators, indexes, confirms `CLOSURES_INSERT`/`CLOSURES_UPDATE` already in action literal union                          |
| `notes/13-constants-reference.md`                             | Closure statuses/colors, Payout statuses/colors, permissions, audit actions        | Badge colors (PENDING amber, CONFIRMED green, CANCELLED red), permission strings, audit action strings                           |
| `notes/03-roles-and-permissions.md`                           | Closure & Payout permissions + Ops Agent + Finance role                            | RBAC matrix: `closures.view`, `closures.create`, `closures.edit`, `closures.confirm`                                             |
| `notes/11-convex-architecture.md`                             | Function Layer Architecture, AUDITED_TABLES, Auth Helpers, File Upload Pattern     | `mutation` from `./functions`, `requirePermission` patterns, `closures` must be added to AUDITED_TABLES, file upload 3-step flow |
| `notes/06-admin-panel-ux.md`                                  | Flow 5: Process Closure & Payout                                                   | Closure form layout, confirmation flow, admin navigation placement                                                               |
| `notes/features/05-listings.md`                               | Photo upload constraints                                                           | Reference for file upload constraints (max size, accepted formats) applied to closure documents                                  |
| `tasks/phase-07-visit-management/P07-E01-visit-backend.md`    | Pattern reference for backend epic structure                                       | Epic template, task sections, YAML frontmatter format, shared badge in E01-T01 pattern                                           |
| `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` | Pattern reference for admin UI epic structure                                      | Admin table, filter bar, detail page, real-time subscription patterns                                                            |

## Epics

| ID      | Title                                           | Tasks | Status | Depends On                  |
| ------- | ----------------------------------------------- | ----- | ------ | --------------------------- |
| P08-E01 | [Closure Backend](P08-E01-closure-backend.md)   | 5     | done   | [P05-E01, P06-E01, P01-E02] |
| P08-E02 | [Admin Closure UI](P08-E02-admin-closure-ui.md) | 5     | done   | [P08-E01, P04-E03]          |

## Dependency Graph

```
P05-E01 ──┐
P07-E01 ──┤
P06-E01 ──┼──► P08-E01 ──► P08-E02
P01-E02 ──┘                 ▲
P04-E03 ────────────────────┘
```

**Sequential note**: E02 (Admin Closure UI) requires E01 (Closure Backend) to be complete — admin UI calls backend mutations/queries. E02 also depends on P04-E03 for existing admin table/filter UI patterns. P07-E01 is an execution-order dependency (visits provide deal context) — closures don't query the visits table directly.

## Execution Order

1. **P08-E01**: Closure Backend — domain module creation, CRUD mutations, status transitions, document upload via file storage, payout void cascade, shared closure-status-badge
2. **P08-E02**: Admin Closure UI — closures board, record closure dialog, document upload component, status actions, detail/edit page

## Completion Criteria

### Backend

- [ ] `convex/closures.ts` exists with all mutations and queries
- [ ] `closures.create` creates closure from VERIFIED lead, enforces one-closure-per-lead via `closures.by_lead_id` index, auto-links `listing_id` via `listings.by_lead_id` if listing exists, sets `closed_by_admin_id` from auth context, sets `status: "PENDING"` (RBAC: `closures.create`). Note: `society_id` is NOT on the closures schema — derive from lead→building→society join at query time for display.
- [ ] `closures.confirm` transitions PENDING → CONFIRMED, sets `confirmed_at = Date.now()` (RBAC: `closures.confirm`)
- [ ] `closures.cancel` transitions PENDING → CANCELLED, voids any linked INITIATED payouts via `payouts.by_closure_id` index — forward-compatible cascade (no-op until P09 creates payouts) (RBAC: `closures.edit`)
- [ ] `closures.update` edits fields on PENDING closures only, rejects edits to terminal statuses (CONFIRMED, CANCELLED) (RBAC: `closures.edit`)
- [ ] `closures.getById` returns closure + lead + building + society + guard (lead submitter) + listing joins (RBAC: `closures.view`)
- [ ] `closures.list` paginated (descending by `_creationTime`, newest first) with filters: status (via `by_status` index), date range on `move_in_date` (post-index filter), society (via lead→building→society join post-filter), payout status per closure (via `payouts.by_closure_id` join — `null` until P09) (RBAC: `closures.view`)
- [ ] `closures.getByLeadId` returns closure for a lead (for "View Closure" vs "Create Closure" UI toggle — Business Rule #2) (RBAC: `closures.view`)
- [ ] `closures.generateUploadUrl` returns signed upload URL for document upload (RBAC: `closures.create` or `closures.edit`)
- [ ] Status transition validation helper: `validateClosureTransition(currentStatus, newStatus)` — PENDING → CONFIRMED, PENDING → CANCELLED, terminals have no outgoing
- [ ] All mutations use `mutation` from `./functions` (not `_generated/server`) for audit triggers
- [ ] P08-E01-T01 adds `"closures"` to `AUDITED_TABLES` in `convex/functions.ts` (NOT already present). `CLOSURES_INSERT`/`CLOSURES_UPDATE` already in `audit_logs.action` union — do NOT re-add those.
- [ ] All money fields in paise (integer × 100), all dates in Unix ms
- [ ] All admin mutations check exact permission strings via `requirePermission`

### Admin UI

- [ ] "Closures" nav item in admin sidebar (RBAC-gated via `closures.view`), positioned after Visits and before Payouts placeholder
- [ ] Closures board at `/admin/closures` with data table, filters (status, date range, society), pagination (20/page)
- [ ] Table columns: Lead (Building + Flat), Society, Move-In Date, Commission (₹ display), Brokerage (T/O), Status (ClosureStatusBadge), Guard (lead submitter), Payout Status (from joined payout or "Not Created")
- [ ] "Record Closure" primary button → dialog with lead selector (VERIFIED only), financial fields, document upload
- [ ] Closure detail/edit page at `/admin/closures/[id]` — editable when PENDING, read-only when terminal
- [ ] Status action buttons: Confirm (PENDING → CONFIRMED), Cancel (PENDING → CANCELLED)
- [ ] Document upload/management UI: rent agreement (single file, PDF/image) + additional documents (multi-file with name labels)
- [ ] Real-time updates via Convex subscriptions
- [ ] Shared `closure-status-badge.tsx` component consumed from `src/components/shared/` (created in E01-T01)
- [ ] All money displayed in rupees (paise ÷ 100) with ₹ symbol, all dates in IST
- [ ] `react-hook-form` + `zod` for all forms, `sonner` for all toasts

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] All status changes create `audit_logs` entries automatically via triggers
- [ ] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
convex/
  closures.ts                              # New: All closure mutations + queries + helpers

src/app/
  (admin)/admin/closures/
    page.tsx                               # Closures board page
    [id]/
      page.tsx                             # Closure detail/edit page
    components/
      closure-table.tsx                    # Data table with columns, row click, load-more
      record-closure-dialog.tsx            # Record closure modal (lead selector, financials, doc upload)
      document-uploader.tsx                # Reusable file upload component (single + multi-file modes)
      closure-filters.tsx                  # Status/Date/Society filters (URL-synced)
      closure-status-actions.tsx           # Confirm/Cancel buttons (status-conditional)
      closure-detail-panel.tsx             # Sectioned detail view with edit mode and doc display

src/components/shared/
  closure-status-badge.tsx                 # Closure status badge (PENDING/CONFIRMED/CANCELLED)
```

## Scope Boundaries

### IN This Phase

- Closure creation from VERIFIED leads with one-per-lead enforcement and listing_id auto-linking
- Closure status lifecycle: PENDING → CONFIRMED (two-step confirmation), PENDING → CANCELLED
- Document upload via Convex file storage: rent agreement (single) + additional documents (multi-file with name labels)
- Brokerage tracking: tenant-side + owner-side amounts in paise
- DemoRentals deal ID reference (optional text field)
- Cancellation with forward-compatible payout void cascade (voids INITIATED payouts via `payouts.by_closure_id`)
- Admin closures board with filters, record closure dialog, detail/edit page, status action buttons
- Shared closure-status-badge component (created in E01-T01 for parallel-safe consumption)
- `closures.getByLeadId` for "View Closure" vs "Create Closure" toggle in admin UI

### Deferred to Follow-Up

- **Lead detail "Record Closure / View Closure" CTA**: Feature spec lists entry from lead detail page (`/admin/leads/[id]`). Backend query exists (`closures.getByLeadId` in E01-T05), but wiring into P04's lead detail UI is a cross-phase modification. Can be added post-P08 without blocking closure workflows — `/admin/closures` is the primary entry point.

### NOT In This Phase

- Payout creation/lifecycle (INITIATED → APPROVED → PAID) → **P09 (Payouts)**
- Guard earnings view → **P09 (Payouts)**
- Financial analytics (closure counts, brokerage totals) → **P12 (Analytics)**
- Lead status change on closure → Leads stay VERIFIED; closure is a separate entity
- Listing archival on closure → Out of scope (listings have their own status lifecycle)
- Guard-facing closure queries or UI → Guards only see earnings (P09)
- i18n for closure pages → **P14 (i18n)**
