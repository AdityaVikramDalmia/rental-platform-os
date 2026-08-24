# Phase 13: Audit Trail (P13)

## Overview

The audit trail viewer gives admins a read-only window into every significant platform action. The backend infrastructure already exists: `convex/functions.ts` wraps all mutations with `convex-helpers/server/triggers`, automatically writing to `audit_logs` on every insert, update, or delete across 15 audited tables. Phase 13 builds only what's missing: the Convex query layer and the admin UI at `/admin/audit`.

Three backend queries expose the `audit_logs` table: a paginated list query with multi-field filtering, a single-entry detail query, and a filter options query that returns distinct action types, entity types, and recent actors for dropdown population. The admin UI at `/admin/audit` renders a paginated table with five columns (Time, Actor, Action, Entity, Changes), a filter bar (actor combobox, action dropdown, entity type dropdown, entity ID input, date range picker), expandable rows showing field-level change diffs with old and new values, and clickable entity links that navigate to the relevant detail page. All queries are gated by `audit.view` — the only permission this phase touches. Audit logs are immutable: no editing, no deleting, no write operations of any kind. Data is kept indefinitely in V1.

**Note**: The audit trigger infrastructure (`convex/functions.ts`, `AUDITED_TABLES`, the trigger registration loop, and the `audit_logs` table schema) was delivered in P01-E02. This phase does not modify that infrastructure. It only adds read-path queries and the viewer UI on top of it.

## Dependencies

| Dependency                        | What It Provides for P13                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P01-E02 (Schema & Infra)**      | `audit_logs` table in schema with all fields (`actor_user_id`, `actor_type`, `action`, `entity_type`, `entity_id`, `changes`, `metadata`) and all five indexes (`by_actor_user_id`, `by_entity`, `by_action`, `by_entity_type`, `by_creation_time`). Trigger registration in `convex/functions.ts` already writes audit entries automatically. **⚠️ Drift risk**: executing agent must verify the `audit_logs` table and all five indexes exist in `convex/schema.ts` before writing queries. |
| **P04-E03 (Admin Lead Queue UI)** | Admin table + filter bar + pagination patterns. URL-synced filter state, paginated data table with side panel, shadcn/ui table components. P13's audit table reuses these patterns directly.                                                                                                                                                                                                                                                                                                  |

## Key Documentation

| Doc                                 | Section                                                                    | Why You Need It                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/07-audit-trail.md`           | Full file                                                                  | THE feature spec — trigger setup, what gets logged per entity, change diff format, table columns, filter definitions, use cases, data retention, business rules                                                                                                                                                                   |
| `notes/10-convex-schema.md`         | `audit_logs` table (lines ~561-633)                                        | Exact field validators: `actor_user_id` (optional `v.id("users")`), `actor_type` (5 literals: GUARD, ADMIN, TENANT, OWNER, SYSTEM), `action` (union of ~40 literals), `entity_type` (string), `entity_id` (string), `changes` (optional array of `{field, old_value?, new_value?}`), `metadata` (optional any). All five indexes. |
| `notes/13-constants-reference.md`   | `audit.view` permission (line ~322), Audit Action Strings (lines ~354-454) | Permission string for RBAC gating. Full list of valid `action` literals grouped by domain (societies, users, leads, listings, visits, closures, payouts, incentives, RBAC, referrals, chat).                                                                                                                                      |
| `notes/03-roles-and-permissions.md` | `audit.view` permission, role matrix                                       | Which roles have `audit.view`: Super Admin (all permissions). Ops Agent does NOT have `audit.view` by default — only Super Admin. Verify in role matrix before implementing RBAC check.                                                                                                                                           |
| `notes/06-admin-panel-ux.md`        | Global Layout, Sidebar Navigation                                          | Sidebar structure: "Management" section contains Roles, Audit, Config (in that order). Audit uses 📜 emoji in wireframes — implementation uses `ScrollText` icon from lucide-react (closest match). Route: `/admin/audit`. Items hidden by RBAC.                                                                                  |
| `notes/11-convex-architecture.md`   | Trigger Setup, functions.ts wrapper                                        | How the existing trigger infrastructure works. Confirms `query` from `./functions` is the correct import path for read queries. Confirms `audit_logs` is written automatically — P13 never writes to it directly.                                                                                                                 |

## Epics

| ID      | Title                                                         | Tasks | Status  | Depends On         |
| ------- | ------------------------------------------------------------- | ----- | ------- | ------------------ |
| P13-E01 | [Audit Trail Backend Queries](P13-E01-audit-trail-backend.md) | 3     | pending | [P01-E02]          |
| P13-E02 | [Admin Audit Viewer UI](P13-E02-admin-audit-viewer-ui.md)     | 4     | pending | [P13-E01, P04-E03] |

## Dependency Graph

```
P01-E02 ──► P13-E01 ──► P13-E02
                            ▲
                        P04-E03 ─┘
```

**Sequential note**: E01 (Backend Queries) must complete before E02 (Admin UI) begins — the UI depends on all three queries being available. E02 also depends on P04-E03 for existing admin table and filter UI patterns. No guard-facing epic exists — audit is admin-only.

## Execution Order

1. **P13-E01**: Audit Trail Backend Queries — paginated list query with multi-field filters, single-entry detail query, filter options query for dropdown population. All gated by `audit.view`.
2. **P13-E02**: Admin Audit Viewer UI — sidebar nav item, page shell with paginated table, filter bar (actor combobox, action dropdown, entity type dropdown, entity ID input, date range picker), expandable change diff rows, entity links and actor type badges.

## Completion Criteria

### Backend

- [ ] `convex/auditLogs.ts` exists with all three queries
- [ ] `auditLogs.list({ actor_user_id?, actor_type?, action?, entity_type?, entity_id?, date_from?, date_to?, paginationOpts })` — paginated query using Convex pagination. Applies available indexes: `by_actor_user_id` when `actor_user_id` provided, `by_entity` when both `entity_type` and `entity_id` provided, `by_entity_type` when only `entity_type` provided, `by_action` when only `action` provided, `by_creation_time` as default. Non-indexed filters applied via `.filter()` before `.paginate()`. Returns entries newest-first. `actor_type` filter supports SYSTEM actor selection (no `actor_user_id`).
- [ ] `auditLogs.getById({ id })` — single entry query. Returns the full `audit_logs` document including `changes` array and `metadata`.
- [ ] `auditLogs.getFilterOptions()` — returns hardcoded action types (all valid `action` literals from schema, grouped by entity category), hardcoded entity types from `AUDITED_TABLES`, and recent actors (deduplicated from last 100 audit log entries, with display names joined from `users` table). Used to populate filter dropdowns without expensive full-table scans.
- [ ] All three queries gated by `requirePermission(ctx, "audit.view")`
- [ ] All three queries use `query` from `./functions` (not from `_generated/server` directly)
- [ ] No mutations, no writes — this phase is read-only

### Admin UI

- [ ] "Audit" nav item added to admin sidebar in the Management section, after Roles and before Config. Uses `ScrollText` icon from lucide-react. Gated by `audit.view` permission. Route: `/admin/audit`.
- [ ] `/admin/audit` page renders a paginated table with five columns: Time (relative timestamp + absolute on hover via tooltip), Actor (display name + actor type badge), Action (human-readable label derived from action string), Entity (entity type + clickable link to detail page), Changes (expandable trigger showing diff count)
- [ ] Filter bar with five controls: actor combobox (searchable dropdown populated from `auditLogs.getFilterOptions().recent_actors`), action dropdown (grouped, populated from `auditLogs.getFilterOptions().actions`), entity type dropdown (populated from `auditLogs.getFilterOptions().entity_types`), entity ID input (text, enabled only when entity type selected), date range picker (from/to dates)
- [ ] Filter state synced to URL query params so filtered views are shareable and survive page refresh
- [ ] Convex pagination implemented: "Load more" button or infinite scroll. Audit tables can grow large — no full-table loads.
- [ ] Expandable row (or side panel) showing the full `changes` array as a field-level diff: field name, old value, new value. Empty `changes` array shows "No field changes recorded". `null` old or new values displayed as "—".
- [ ] Entity links navigate to the correct admin detail page per entity type (e.g., `entity_type: "leads"` links to `/admin/leads?entity_id={entity_id}`, `entity_type: "guard_profiles"` links to `/admin/guards/{entity_id}`, `entity_type: "societies"` links to `/admin/societies/{entity_id}`). Full route mapping defined in P13-E02-T04.
- [ ] Actor type badge: GUARD (blue), ADMIN (purple), SYSTEM (grey), TENANT (green), OWNER (amber). `actor_user_id` null (SYSTEM actor) shows "System" as display name.
- [ ] Page is fully read-only. No action buttons, no status changes, no mutations triggered from this page.
- [ ] `sonner` for any error toasts. No `react-hook-form` needed (filter bar uses uncontrolled inputs or simple state — no form submission).

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
convex/
  auditLogs.ts                                    # New: auditLogs.list, auditLogs.getById, auditLogs.getFilterOptions

src/app/
  (admin)/admin/audit/
    page.tsx                                      # Audit viewer page (table + filters + pagination)
    components/
      audit-filter-bar.tsx                        # Filter bar: actor combobox, action dropdown, entity type, entity ID, date range
      audit-table.tsx                             # Paginated table with 5 columns and expandable rows
      audit-change-diff.tsx                       # Expandable change diff view (field, old_value, new_value)
      actor-badge.tsx                             # Actor type badge (GUARD/ADMIN/SYSTEM/TENANT/OWNER)
      entity-link.tsx                             # Clickable entity link routing by entity_type

  (admin)/admin-layout-client.tsx                 # Modified: Add Audit nav item (ScrollText icon, Management section)
```

## Scope Boundaries

### IN This Phase

- Three read-only Convex queries on the `audit_logs` table (list, getById, getFilterOptions)
- Convex pagination for the list query (audit tables grow large)
- Admin audit viewer at `/admin/audit` with paginated table
- Five-column table: Time, Actor, Action, Entity, Changes
- Filter bar with five controls: actor combobox, action dropdown, entity type dropdown, entity ID input, date range picker
- URL-synced filter state for shareable filtered views
- Expandable change diff view showing field-level old/new values
- Entity links navigating to correct admin detail pages per entity type
- Actor type badges (GUARD, ADMIN, SYSTEM, TENANT, OWNER) with color coding
- Sidebar nav item in Management section (after Roles, before Config), gated by `audit.view`
- `audit.view` RBAC gating on all three queries

### NOT In This Phase

- Audit log archival or cleanup cron → **V2** (spec notes `crons.weekly("audit-cleanup")` as future, not active in V1)
- Audit data export to CSV/Excel → **V2**
- Guard-facing audit view → **Not in V1** (audit is admin-only)
- Writing to `audit_logs` directly → **Never** (triggers handle all writes automatically via `convex/functions.ts`)
- Modifying the trigger infrastructure in `convex/functions.ts` → **Not in scope** (delivered in P01-E02)
- Adding new audited tables → **Not in scope** (schema and trigger registration are P01-E02 territory)
- Real-time push notifications for new audit entries → **Not needed** (Convex reactive queries handle this natively)
- i18n for audit viewer → **English only** (admin panel is hardcoded English per convention)
