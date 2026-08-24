---
id: P13-E02
title: Admin Audit Viewer UI
phase: 13
status: pending
depends_on: ["P13-E01", "P04-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P13-E02: Admin Audit Viewer UI

## Overview

Build the admin audit log viewer end-to-end: add the "Audit" sidebar nav item (gated by `audit.view`, `ScrollText` icon, Management section after Roles), create the `/admin/audit` page with a paginated table (Time, Actor, Action, Entity, Changes), implement the filter bar (actor search, action dropdown, entity type dropdown, entity ID input, date range picker) with URL-synced state, build the expandable change diff view showing field-level old/new values with INSERT/UPDATE/DELETE labeling, and create entity link and actor badge components that make entity references clickable and display actor type with role-colored badges.

## Prerequisites

- **Read first**: [P13-E01 Completion Summary](P13-E01-audit-trail-backend.md#completion-summary) — the `auditLogs.list` query and `auditLogs.getFilterOptions` query are expected to exist. `auditLogs.list` accepts `{ actor_user_id?, actor_type?, action?, entity_type?, entity_id?, date_from?, date_to?, paginationOpts }` and returns paginated `audit_logs` rows with actor name resolved. `actor_type` enables filtering for SYSTEM actors (no `actor_user_id`). `auditLogs.getFilterOptions` returns `{ recent_actors, actions, entity_types }` for populating filter dropdowns.
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — admin table, filter bar, URL-synced filter state, and pagination patterns established. Reuse for the audit table structure and filter bar layout.

## Task Queue

- [ ] P13-E02-T01: Audit Page Shell + Table
- [ ] P13-E02-T02: Filter Bar
- [ ] P13-E02-T03: Expandable Change Diff View
- [ ] P13-E02-T04: Entity Links + Actor Display

---

## T01: Audit Page Shell + Table

### Objective

Create the `/admin/audit` page with a paginated audit log table and add the Audit nav item to the admin sidebar, gated by `audit.view`.

### Required Reading

- `notes/07-audit-trail.md` — "Admin Panel: Audit Log Viewer" section (table columns, use cases, business rules)
- `notes/06-admin-panel-ux.md` — Sidebar navigation structure, Management section placement, table patterns (20 items/page, Load More, real-time via Convex)
- `notes/13-constants-reference.md` — `audit.view` permission, `Audit Actor Type` table (GUARD/ADMIN/TENANT/OWNER/SYSTEM)

### Key Rules

1. Route: `src/app/(admin)/admin/audit/page.tsx`. This is a new page under the existing admin route group.
2. Update `src/app/(admin)/admin-layout-client.tsx` to add an "Audit" nav item: `ScrollText` icon from lucide-react, `href: "/admin/audit"`, `requiredPermission: "audit.view"`, positioned in the Management section after Roles (before Config). Sidebar order: Roles → Audit → Config.
3. Table columns: Time (relative like "2 hours ago" with absolute timestamp on hover tooltip), Actor (name + type badge), Action (human-readable format), Entity (type label + truncated ID), Changes (expand toggle button).
4. Data from `usePaginatedQuery(api.auditLogs.list, { ...filters })` with Convex cursor-based pagination. Initial items: 20.
5. Use the shadcn `Table` component. Rows have alternating background (`bg-muted/30` on even rows) for readability.
6. Pagination: "Load More" button at the bottom, shown only when `status === "CanLoadMore"`. Show count: "Showing N entries" above the table.
7. Empty state: centered message "No audit entries found matching your filters." with a `ScrollText` icon above it.
8. Loading state: 5 skeleton rows (use shadcn `Skeleton`) while the initial query is loading.
9. Time display: use `formatDistanceToNow` from `date-fns` (with `addSuffix: true`) for relative time in the cell. Use `format(date, "PPpp")` from `date-fns` for the absolute timestamp in a shadcn `Tooltip` on hover.
10. The page is read-only. No mutations, no action buttons, no status changes. Audit viewer is display-only per `notes/07-audit-trail.md` business rules.
11. Page title: "Audit Log" with a subtitle "Full history of all platform actions."

### Deliverables

- [ ] `src/app/(admin)/admin-layout-client.tsx` — Audit nav item added with `ScrollText` icon, `audit.view` gate, positioned in Management section after Roles (before Config)
- [ ] `src/app/(admin)/admin/audit/page.tsx` — Audit page with table, pagination, empty state, and loading state
- [ ] `src/app/(admin)/admin/audit/components/audit-table.tsx` — Audit log table component with 5 columns and alternating row backgrounds

### Acceptance Criteria

1. "Audit" nav item appears in the admin sidebar with `ScrollText` icon, `href: "/admin/audit"`, gated by `audit.view`, positioned in the Management section after Roles (before Config). Order: Roles → Audit → Config.
2. Table renders with 5 columns: Time, Actor, Action, Entity, Changes.
3. Time column shows relative time ("2 hours ago") with absolute timestamp in a tooltip on hover.
4. "Load More" button appears when more entries exist and loads the next page on click.
5. "Showing N entries" count updates as more entries are loaded.
6. Empty state renders when no entries match filters.
7. Skeleton rows render during initial load.
8. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on `/admin/audit`: sidebar nav item visible with correct icon and position, table renders with 5 columns, relative timestamps with tooltip, Load More button, empty state, skeleton loading state.

### Out of Scope

- Filter bar (T02)
- Expandable diff view (T03)
- Entity links and actor badges (T04)

---

## T02: Filter Bar

### Objective

Implement the filter bar above the audit table with actor search, action dropdown, entity type dropdown, entity ID input, and date range picker — all synced to URL query params for shareable filter URLs.

### Required Reading

- `notes/07-audit-trail.md` — "Filters" section (5 filter types: Actor, Action, Entity Type, Entity ID, Date Range) and "Use Cases" section (shows how filters combine in real workflows)
- `notes/13-constants-reference.md` — "Audit Action Strings" section (all action values grouped by category: Society & Building, Users & Guards, Leads, Owner Verification, Listings, Visits, Closures & Payouts, Incentives, RBAC & Config, Referrals, Chat & Deal Room)
- `notes/06-admin-panel-ux.md` — Filter bar layout pattern (filter bar sits above table, horizontally laid out on desktop)

### Key Rules

1. Create `src/app/(admin)/admin/audit/components/audit-filter-bar.tsx`. The filter bar is a controlled component that receives current filter values and an `onChange` callback from the parent page.
2. Filter bar layout: horizontal row on desktop (`flex flex-wrap gap-3`), stacked on mobile. "Clear Filters" button at the far right, only enabled when any filter is active.
3. Filters:
   - **Actor**: Searchable combobox (shadcn `Popover` + `Command`) populated from `auditLogs.getFilterOptions().recent_actors`. Each option shows actor name + type badge. For non-SYSTEM actors, passes `actor_user_id` to the query. For the SYSTEM actor (where `user_id` is `null`), passes `actor_type: "SYSTEM"` instead.
   - **Action**: Grouped `Select` dropdown populated from `auditLogs.getFilterOptions().actions`. Groups match the "Audit Action Strings" categories in `notes/13-constants-reference.md`: "Society & Building", "Users & Guards", "Leads", "Owner Verification", "Listings", "Visits", "Closures & Payouts", "Incentives", "RBAC & Config", "Referrals", "Chat & Deal Room". Each group uses `SelectGroup` with a `SelectLabel`. Passes `action` to the query.
   - **Entity Type**: `Select` dropdown populated from `auditLogs.getFilterOptions().entity_types`. Display human-readable labels: `societies` → "Societies", `buildings` → "Buildings", `users` → "Users", `guard_profiles` → "Guard Profiles", `guard_shifts` → "Guard Shifts", `leads` → "Leads", `owner_verifications` → "Owner Verifications", `listings` → "Listings", `visits` → "Visits", `closures` → "Closures", `payouts` → "Payouts", `incentive_cards` → "Incentive Cards", `roles` → "Roles", `user_role_assignments` → "Role Assignments", `system_config` → "System Config". Passes `entity_type` to the query.
   - **Entity ID**: shadcn `Input` (text). Disabled when no Entity Type is selected; enabled only when an Entity Type is selected. Placeholder: "Entity ID...". Passes `entity_id` to the query.
   - **Date Range**: Two shadcn `Popover` + `Calendar` date pickers side by side, labeled "From" and "To". Selected dates converted to Unix milliseconds (`startOfDay(date).getTime()` for From, `endOfDay(date).getTime()` for To) before passing to the query as `date_from` and `date_to`. Default: last 7 days (From = 7 days ago, To = now).
4. Filter state is synced to URL query params using Next.js `useRouter` and `useSearchParams`. Param names: `actor`, `action`, `entity_type`, `entity_id`, `date_from`, `date_to`. Dates stored as Unix ms strings in the URL.
5. Filters trigger re-query on change (controlled state, not form submission). No submit button needed.
6. "Clear Filters" button resets all filters to defaults (date range back to last 7 days, all others cleared) and updates the URL params accordingly.
7. Use `date-fns` functions `startOfDay`, `endOfDay`, `subDays` for date calculations. These are already in project dependencies.

### Deliverables

- [ ] `src/app/(admin)/admin/audit/components/audit-filter-bar.tsx` — Filter bar with all 5 filter types, URL-synced state, and "Clear Filters" button

### Acceptance Criteria

1. All 5 filters render and function correctly.
2. Actor combobox shows recent actors with type badges; selecting one filters the table.
3. Action dropdown is grouped by entity category with `SelectGroup` and `SelectLabel`.
4. Entity Type dropdown shows human-readable labels for all 15 entity types.
5. Entity ID input is disabled when no Entity Type is selected; enabled when one is selected.
6. Date range pickers convert selected dates to Unix ms for the query.
7. Filter state is reflected in URL query params; navigating to the URL with params pre-fills the filters.
8. "Clear Filters" resets all filters to defaults and clears URL params.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check: apply each filter individually and verify table re-queries, verify URL params update on filter change, verify navigating to a URL with params pre-fills filters, verify Entity ID input disabled state, verify "Clear Filters" resets everything.

### Out of Scope

- Expandable diff view (T03)
- Entity links and actor badges (T04)
- Saved filter presets (V2)

---

## T03: Expandable Change Diff View

### Objective

Implement the expandable row detail that shows field-level changes with old and new values, styled with red/green backgrounds for removed/added content, and a collapsible metadata section.

### Required Reading

- `notes/07-audit-trail.md` — "Change Diff Format" section (the `changes` array shape: `{ field, old_value?, new_value? }`) and "What Gets Logged" table (INSERT vs UPDATE vs soft-delete patterns)
- `notes/10-convex-schema.md` — `audit_logs` table definition: `changes: v.optional(v.array(v.object({ field: v.string(), old_value: v.optional(v.any()), new_value: v.optional(v.any()) })))`, `metadata: v.optional(v.any())`

### Key Rules

1. Create `src/app/(admin)/admin/audit/components/audit-change-diff.tsx`. This component receives a single `audit_logs` row as a prop and renders the expanded detail inline below the row.
2. The expand toggle in the "Changes" column is a `ChevronDown` / `ChevronUp` icon button (lucide-react). Clicking it toggles a boolean state in the parent `audit-table.tsx` (track expanded row IDs in a `Set<string>`). Only one row can be expanded at a time — expanding a new row collapses the previous one.
3. The expanded detail renders as a full-width row below the audit entry (use a `<tr>` with `colSpan={5}` and a nested `<td>`).
4. Changes displayed as a two-column diff table inside the expanded row:
   - Column headers: "Field", "Before", "After"
   - Field name: convert `snake_case` to Title Case (`status` → "Status", `notes_thread` → "Notes Thread", `is_deleted` → "Is Deleted", `actor_user_id` → "Actor User ID"). Split on `_` (underscore), capitalize each word, join with space.
   - "Before" cell (old_value): styled with `bg-red-50 text-red-800` and a subtle left border `border-l-2 border-red-300`. Show "—" in muted text if `old_value` is `null` or `undefined`.
   - "After" cell (new_value): styled with `bg-green-50 text-green-800` and a subtle left border `border-l-2 border-green-300`. Show "—" in muted text if `new_value` is `null` or `undefined`.
5. For INSERT actions (action ends with `_INSERT`): show only new values. Label above the diff table: "Created with values:" in muted text. The "Before" column header is hidden; show only "Field" and "After".
6. For UPDATE actions (action ends with `_UPDATE`): show old → new for each changed field. Label: "Changed fields:" in muted text. Show all three columns.
7. For DELETE actions (action ends with `_DELETE`): show only old values. Label: "Deleted record:" in muted text. The "After" column header is hidden; show only "Field" and "Before". Note: soft deletes appear as UPDATE with `is_deleted` field change — they are handled by the UPDATE path, not this path.
8. Values that are objects or arrays: render as formatted JSON in a `<pre className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">` block using `JSON.stringify(value, null, 2)`. Primitive values render as plain text.
9. If `changes` is `null`, `undefined`, or an empty array: show "No field-level changes recorded." in muted text, centered.
10. Metadata section: if `metadata` is present and truthy, show a collapsible "Metadata" section below the diff table. Guard check: `metadata != null && (typeof metadata === "object" ? Object.keys(metadata).length > 0 : true)`. Schema allows `metadata: v.optional(v.any())` so it could be any type. Use a `<details>` element with a `<summary>` label "Metadata". Render metadata as formatted JSON in a `<pre>` block using `JSON.stringify(metadata, null, 2)`.

### Deliverables

- [ ] `src/app/(admin)/admin/audit/components/audit-change-diff.tsx` — Expandable diff view component with INSERT/UPDATE/DELETE labeling, red/green styling, JSON rendering, and collapsible metadata

### Acceptance Criteria

1. Expand/collapse toggle works on each row; expanding one row collapses any previously expanded row.
2. INSERT actions show "Created with values:" label with only "Field" and "After" columns.
3. UPDATE actions show "Changed fields:" label with all three columns and red/green cell styling.
4. DELETE actions show "Deleted record:" label with only "Field" and "Before" columns.
5. Object and array values render as formatted JSON in a `<pre>` block with scroll on overflow.
6. Null/undefined old_value or new_value shows "—" in muted text.
7. Empty or missing `changes` shows "No field-level changes recorded."
8. Non-empty `metadata` renders in a collapsible `<details>` section below the diff table.
9. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check: expand a row with an UPDATE action and verify red/green styling, expand an INSERT row and verify only "After" column shows, verify JSON rendering for object values, verify metadata section collapses/expands, verify empty changes message.

### Out of Scope

- Entity links and actor badges (T04)
- Diff highlighting within a single string value (V2)
- Copy-to-clipboard for diff values (V2)

---

## T04: Entity Links + Actor Display

### Objective

Create reusable components for clickable entity links (mapping entity types to admin detail routes), colored actor type badges, and human-readable action string formatting.

### Required Reading

- `notes/07-audit-trail.md` — "Table View" section (Entity column: "Entity type + link to entity", Actor column: "User name + type badge")
- `notes/13-constants-reference.md` — "Audit Actor Type" table (GUARD/ADMIN/TENANT/OWNER/SYSTEM with descriptions), "Audit Action Strings" section (all action string patterns)
- `notes/06-admin-panel-ux.md` — Existing admin routes referenced in sidebar nav (societies, guards, leads, listings, visits, closures, payouts, incentives, roles, settings)

### Key Rules

1. Create three components: `src/app/(admin)/admin/audit/components/entity-link.tsx`, `src/app/(admin)/admin/audit/components/actor-badge.tsx`, and `src/app/(admin)/admin/audit/components/action-display.tsx`.
2. **Entity links** (`entity-link.tsx`): receives `entity_type: string` and `entity_id: string` as props. Maps `entity_type` to admin detail routes:
   - `societies` → `/admin/societies/${entity_id}`
   - `buildings` → `/admin/societies` (no building-specific detail route exists; link to societies list page where buildings are nested)
   - `users` → `/admin/guards/${entity_id}` (best-effort — most user mutations are guard-related; if the user is not a guard, the guards page will show "not found" which is acceptable for an audit link)
   - `guard_profiles` → `/admin/guards/${entity_id}`
   - `leads` → `/admin/leads?entity_id=${entity_id}`
   - `listings` → `/admin/listings/${entity_id}`
   - `visits` → `/admin/visits?entity_id=${entity_id}`
   - `closures` → `/admin/closures/${entity_id}`
   - `payouts` → `/admin/payouts/${entity_id}`
   - `incentive_cards` → `/admin/incentives?entity_id=${entity_id}`
   - `roles` → `/admin/roles`
   - `user_role_assignments` → `/admin/roles`
   - `system_config` → `/admin/settings`
   - `owner_verifications` → `/admin/leads?entity_id=${entity_id}` (verification is viewed in lead context)
   - `guard_shifts` → `/admin/guards` (no shift-specific route; link to guards list)
   - All other/unknown entity types: render the entity ID as plain text with no link.
3. Entity link display: show the human-readable entity type label (e.g., `leads` → "Lead", `guard_profiles` → "Guard Profile") + truncated ID (first 8 characters + "..."). Wrap in a shadcn `Tooltip` showing the full entity ID on hover. When the entity type has a route, render as a Next.js `Link` with `className` that looks like a subtle link (`text-blue-600 hover:underline`). When no route exists, render as plain `<span>`.
4. **Actor badge** (`actor-badge.tsx`): receives `actor_type: string`, `actor_name: string | null`, and optional `actor_user_id` as props. Renders actor name + a colored shadcn `Badge` for the type:
   - `GUARD`: `bg-blue-100 text-blue-700` (use `variant="outline"` with custom className)
   - `ADMIN`: `bg-purple-100 text-purple-700`
   - `TENANT`: `bg-green-100 text-green-700`
   - `OWNER`: `bg-amber-100 text-amber-700`
   - `SYSTEM`: `bg-gray-100 text-gray-500`
   - When `actor_type === "SYSTEM"` (no user): show "System" as the name with the grey badge. Do not show a blank name.
   - When `actor_name` is null but `actor_type` is not SYSTEM: show "Unknown" as the name.
5. **Action display** (`action-display.tsx`): receives `action: string` as a prop. Converts the action string to human-readable format using this algorithm:
   - Split the action string by `_` (e.g., `GUARD_PROFILES_UPDATE` → `["GUARD", "PROFILES", "UPDATE"]`).
   - The last segment is the operation: `INSERT` → "Created", `UPDATE` → "Updated", `DELETE` → "Deleted".
   - All segments except the last form the entity name. Join them with a space and title-case each word: `GUARD_PROFILES` → "Guard Profiles", `OWNER_VERIFICATIONS` → "Owner Verifications", `USER_ROLE_ASSIGNMENTS` → "User Role Assignments", `SYSTEM_CONFIG` → "System Config".
   - Final format: `"{Entity} {Operation}"` — e.g., `LEADS_UPDATE` → "Lead Updated", `PAYOUTS_INSERT` → "Payout Created", `GUARD_PROFILES_UPDATE` → "Guard Profile Updated".
   - For entity names that are plural in the action string but should be singular in display: `LEADS` → "Lead", `SOCIETIES` → "Society", `BUILDINGS` → "Building", `USERS` → "User", `LISTINGS` → "Listing", `VISITS` → "Visit", `CLOSURES` → "Closure", `PAYOUTS` → "Payout", `ROLES` → "Role", `REFERRALS` → "Referral". Multi-word entities keep their full form: `GUARD_PROFILES` → "Guard Profile", `GUARD_SHIFTS` → "Guard Shift", `OWNER_VERIFICATIONS` → "Owner Verification", `INCENTIVE_CARDS` → "Incentive Card", `USER_ROLE_ASSIGNMENTS` → "Role Assignment", `SYSTEM_CONFIG` → "System Config", `REFERRAL_CODES` → "Referral Code", `REFERRAL_MILESTONES` → "Referral Milestone", `REFERRAL_CONFIG` → "Referral Config", `CHAT_CHANNELS` → "Chat Channel", `CHAT_MESSAGES` → "Chat Message", `DEAL_CHECKLISTS` → "Deal Checklist", `DEAL_CHECKLIST_SIGNATURES` → "Checklist Signature".
   - Render as plain text (no badge, no icon). The action string is informational only.
6. Wire all three components into `audit-table.tsx` (from T01): replace the placeholder cells with `<ActionDisplay action={row.action} />`, `<ActorBadge ... />`, and `<EntityLink ... />`.

### Deliverables

- [ ] `src/app/(admin)/admin/audit/components/entity-link.tsx` — Clickable entity links with route mapping, truncated ID display, and full ID tooltip
- [ ] `src/app/(admin)/admin/audit/components/actor-badge.tsx` — Actor name + colored type badge, SYSTEM fallback to "System"
- [ ] `src/app/(admin)/admin/audit/components/action-display.tsx` — Human-readable action string formatter
- [ ] `src/app/(admin)/admin/audit/components/audit-table.tsx` — Updated to wire in all three display components

### Acceptance Criteria

1. Entity links navigate to correct admin detail pages for all mapped entity types.
2. Unknown entity types render the entity ID as plain text with no link (no broken navigation).
3. Entity link shows truncated ID (8 chars + "...") with full ID in tooltip on hover.
4. Actor badges show correct Tailwind colors per actor_type (blue/purple/green/amber/grey).
5. SYSTEM actor renders "System" as the name with the grey badge.
6. Action strings convert to human-readable format: `LEADS_UPDATE` → "Lead Updated", `PAYOUTS_INSERT` → "Payout Created", `USER_ROLE_ASSIGNMENTS_INSERT` → "Role Assignment Created".
7. All three components are wired into `audit-table.tsx` replacing placeholder cells.
8. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on `/admin/audit`: verify entity links navigate correctly for leads, guards, listings, verify unknown entity types show plain text, verify actor badge colors match the spec, verify SYSTEM actor shows "System", verify action strings are human-readable.

### Out of Scope

- Guard detail page modifications (P03-E02)
- Listing detail page modifications (P06-E02)
- Deep-linking to specific audit entries via URL (V2)

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
