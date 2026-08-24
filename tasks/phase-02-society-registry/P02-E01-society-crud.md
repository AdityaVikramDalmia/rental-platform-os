---
id: P02-E01
title: Society CRUD
phase: 2
status: done
depends_on: ["P01-E08"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P02-E01: Society CRUD

## Overview

Implement the full society management system: Convex backend functions (mutations + queries with RBAC and status transition validation), admin UI (list page with search/filter, create/edit dialog, detail page with tab skeleton). Societies are the foundation — guards, buildings, leads, and visits all reference them.

## Task Queue

- [x] P02-E01-T01: Society Mutations (Create + Update)
- [x] P02-E01-T02: Society Queries (List + GetById + Search)
- [x] P02-E01-T03: Admin Sidebar Navigation Update
- [x] P02-E01-T04: Society List Page
- [x] P02-E01-T05: Add/Edit Society Dialog
- [x] P02-E01-T06: Society Detail Page
- [x] P02-E01-T07: Society Backend Tests

---

## T01: Society Mutations (Create + Update)

### Objective

Create `convex/societies.ts` with `create` and `update` mutations. Both require RBAC permission checks. The `update` mutation validates status transitions against the state machine (e.g., `ONBOARDING` → `ACTIVE` only when ≥1 building exists).

### Required Reading

- `notes/features/01-society-registry.md` — "User Stories" and "Business Rules" sections
- `notes/04-state-machines.md` — "Society Status" section (transition table)
- `notes/11-convex-architecture.md` — "Function Layer Architecture" (import from `./functions`, NOT `_generated/server`)
- `notes/13-constants-reference.md` — `SOCIETY_STATUS` enum, `societies.*` permissions, audit actions

### Key Rules

1. Import `mutation` from `./functions` — NEVER from `_generated/server`. This enables automatic audit logging.
2. Use `requirePermission(ctx, "societies.create")` and `requirePermission(ctx, "societies.edit")` for RBAC.
3. Society creation defaults `status` to `"ONBOARDING"`. Admin cannot choose initial status.
4. Set `created_by_admin_id` from the authenticated user's `_id` (from auth context).
5. Status transition validation:
   - `ONBOARDING` → `ACTIVE`: Query buildings table — must have ≥1 non-deleted building. Throw if none exist.
   - `ACTIVE` → `INACTIVE`: Allowed unconditionally. (Frontend shows confirmation; backend doesn't block.)
   - `INACTIVE` → `ACTIVE`: Allowed unconditionally. (Buildings still exist.)
   - `ONBOARDING` → `INACTIVE`: NOT allowed. Must go through `ACTIVE` first.
   - Any → `ONBOARDING`: NOT allowed. `ONBOARDING` is initial-only.
6. Use the `SOCIETY_STATUS` enum from `lib/constants.ts` for status values — never hardcode strings.
7. Validate required fields: `name` (non-empty, trimmed), `city` (non-empty, trimmed).
8. No `is_deleted` on societies — societies are never soft-deleted. They are set to `INACTIVE` instead.

### Deliverables

- [ ] `convex/societies.ts` — Exports `create` mutation: `(ctx, { name, city, address?, notes? }) → Id<"societies">`
- [ ] `convex/societies.ts` — Exports `update` mutation: `(ctx, { id, name?, city?, address?, notes?, status? }) → null`

### Acceptance Criteria

1. `societies.create({ name: "Test", city: "Mumbai" })` succeeds and returns a society ID
2. Created society has `status: "ONBOARDING"` and `created_by_admin_id` set
3. `societies.update({ id, status: "ACTIVE" })` throws when society has 0 buildings
4. `societies.update({ id, status: "ACTIVE" })` succeeds when society has ≥1 building
5. `societies.update({ id, status: "ONBOARDING" })` throws (can't go back to ONBOARDING)
6. Calling without proper permission throws an auth error
7. Audit log entries are automatically created (verify in `audit_logs` table)
8. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Society deletion (societies are set INACTIVE, never deleted)
- Society queries (T02)
- Admin UI (T03-T06)
- Building mutations (E02)

---

## T02: Society Queries (List + GetById + Search)

### Objective

Add query functions to `convex/societies.ts`: a list query with status/city filters, a getById query with aggregated counts (buildings, guards, leads), and a search query using the `search_name` search index.

### Required Reading

- `notes/features/01-society-registry.md` — "Convex Functions: Queries" section
- `notes/10-convex-schema.md` — `societies` table indexes: `by_city`, `by_status`, `by_name`, `search_name`
- `notes/11-convex-architecture.md` — Search index usage pattern

### Key Rules

1. Import `query` from `./functions` (or `_generated/server` — queries don't need wrappers, but be consistent).
2. Use `requirePermission(ctx, "societies.view")` on all queries — societies are admin-only data.
3. `list` query: Support optional filters `status`, `city`. Use `by_status` index when filtering by status, `by_city` index when filtering by city. When no filters, use `by_name` index for alphabetical order. Return all matching societies **enriched with counts** (`building_count`, `guard_count`, `lead_count`) — the list page table needs these columns. V1 scale is ~3 societies, so N+1 count queries are acceptable — add explicit waiver comment: "// V1: ~3 societies, pagination and count optimization deferred".
4. `getById` query: Fetch society + compute aggregated data:
   - `building_count`: Count non-deleted buildings with `by_society_id` index
   - `guard_count`: Count guard_profiles with `by_society_id` index (from guard_profiles table)
   - `lead_stats`: Object with counts per status: `{ total, submitted, verified, rejected, duplicate }` — query leads table with `by_society_id` index, group by status
   - `recent_leads`: Last 5-10 leads for this society (ordered by `_creationTime` desc) — for the detail page header
   - Return these as extra fields alongside the society document
5. `search` query: Use `withSearchIndex("search_name", ...)`. Support optional `city` and `status` filter fields on the search. Limit results to 50.
6. All queries must handle the case where the society ID doesn't exist (return null or throw descriptive error).

### Deliverables

- [ ] `convex/societies.ts` — Exports `list` query: `(ctx, { status?, city? }) → (Society & { building_count, guard_count, lead_count })[]`
- [ ] `convex/societies.ts` — Exports `getById` query: `(ctx, { id }) → Society & { building_count, guard_count, lead_stats: { total, submitted, verified, rejected, duplicate }, recent_leads: Lead[] }`
- [ ] `convex/societies.ts` — Exports `search` query: `(ctx, { search, city?, status? }) → Society[]`

### Acceptance Criteria

1. `societies.list({})` returns all societies ordered by name, each with `building_count`, `guard_count`, `lead_count`
2. `societies.list({ status: "ACTIVE" })` returns only active societies with counts
3. `societies.list({ city: "Mumbai" })` returns only Mumbai societies with counts
4. `societies.getById({ id })` returns society with correct `building_count`, `guard_count`, and `lead_stats` (broken down by status)
5. `societies.getById({ id })` includes `recent_leads` array (last 5-10 leads, ordered newest first)
6. `societies.getById({ id: "nonexistent" })` throws or returns null gracefully
7. `societies.search({ search: "Hiran" })` returns societies matching "Hiran" in name
8. `societies.search({ search: "Hiran", city: "Mumbai" })` filters search results by city
9. All queries reject unauthenticated or unauthorized callers
10. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
npm run build
```

### Out of Scope

- Delete functionality (societies are set INACTIVE, never deleted)
- Building-related fields (E02)

---

## T03: Admin Sidebar Navigation Update

### Objective

Add the "Societies" entry to the admin sidebar navigation. The admin layout (created in P01-E06) has a collapsible sidebar with links to dashboard, roles, settings, etc. Phase 2 adds the "🏘 Societies" link pointing to `/admin/societies`, positioned in the Operations group between Dashboard and Guards (per `06-admin-panel-ux.md` sidebar spec).

### Required Reading

- `notes/06-admin-panel-ux.md` — "Global Layout" and "Sidebar Navigation" sections (item order, grouping, RBAC visibility)
- Existing admin layout file: `src/app/(admin)/layout.tsx` (or wherever the sidebar is defined)

### Key Rules

1. Find the existing admin sidebar component (created in P01-E06). It may be in `src/app/(admin)/layout.tsx` or a separate `src/components/admin/AdminSidebar.tsx`.
2. Add "Societies" link with icon (🏘 or Building2 from lucide-react) to the Operations group.
3. Position: After Dashboard, before Guards (match the order from `06-admin-panel-ux.md`: Dash, Soc., Guards, Leads, Verify, List., Visits, Close, Pay, Incen.).
4. Link target: `/admin/societies`.
5. Highlight active state when URL matches `/admin/societies` or `/admin/societies/*`.
6. RBAC visibility: Only show if user has `societies.view` permission. Use the same permission-gating pattern as other sidebar items.
7. Do NOT add links for items from future phases (Guards, Leads, etc.) — only add Societies.

### Deliverables

- [ ] Admin sidebar component — Updated with "Societies" navigation link, correctly positioned and permission-gated

### Acceptance Criteria

1. "Societies" link appears in the admin sidebar between Dashboard and any existing items
2. Clicking it navigates to `/admin/societies`
3. Link is highlighted when on `/admin/societies` or `/admin/societies/[id]`
4. Link is hidden for users without `societies.view` permission
5. Sidebar icon is visible in both expanded and collapsed modes
6. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Adding sidebar links for future phases (Guards, Leads, etc.)
- Sidebar badge counts for societies (not needed — societies count is static)
- Sidebar restructuring or redesign

---

## T04: Society List Page

### Objective

Create the admin society list page at `/admin/societies`. Route file: `src/app/(admin)/admin/societies/page.tsx` (the `(admin)` route group provides the admin layout; the real `admin/` directory adds the URL prefix). Shows a table of all societies with status badge, counts, search bar, and filters. Links to society detail page. Includes an "Add Society" button that opens the create dialog (T04).

### Required Reading

- `notes/features/01-society-registry.md` — "Admin Panel UI: Society List Page" section
- `notes/06-admin-panel-ux.md` — Admin sidebar navigation, page layout conventions
- `notes/01-tech-stack.md` — "Client-Side Libraries" (shadcn/ui, sonner, react-hook-form)

### Key Rules

1. Route: `src/app/(admin)/admin/societies/page.tsx`. The `(admin)` route group provides admin layout; the real `admin/` directory adds `/admin/` to the URL.
2. Use shadcn/ui components: `Table`, `Badge`, `Input` (search), `Button`, `Select` (filters).
3. Table columns: Name (clickable link to `/admin/societies/[id]`), City, Status (badge), Buildings (count), Guards (count), Leads (count), Created (formatted date).
4. Status badges use color coding: `ONBOARDING` = amber/yellow, `ACTIVE` = green, `INACTIVE` = gray.
5. Filters at top: Status select/tabs (All, Onboarding, Active, Inactive) + City dropdown (populated from unique cities in data).
6. Search bar: Debounced input (300ms). When non-empty, uses `societies.search` query. When empty, uses `societies.list` query.
7. "Add Society" button in header area — opens the create dialog (T05 builds the dialog component; this task just places the button and renders the dialog).
8. Use `useQuery` from `convex/react` for real-time subscriptions — table auto-updates.
9. Empty state: "No societies found. Create your first society to get started."
10. Loading state: Use `Skeleton` components for table rows while query loads.
11. V1 has ~3 societies — pagination intentionally deferred. Add comment: "// V1: ~3 societies, pagination deferred".

### Deliverables

- [ ] `src/app/(admin)/admin/societies/page.tsx` — Society list page with table, filters, search
- [ ] `src/components/admin/SocietyTable.tsx` — Reusable society table component with columns, sorting, status badges

### Acceptance Criteria

1. Page renders at `/admin/societies` within the admin layout
2. Table shows all societies with correct columns and data
3. Status badges display with correct colors (amber/green/gray)
4. Clicking a society name navigates to `/admin/societies/[id]`
5. Status filter works (selecting "Active" shows only active societies)
6. Search input filters societies by name in real-time (debounced)
7. "Add Society" button is visible in the page header
8. Empty state shows when no societies exist
9. Loading skeletons show while data loads
10. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Add/Edit dialog implementation (T05)
- Society detail page (T06)
- City dropdown with autocomplete (V2 — V1 uses simple select from existing data)

---

## T05: Add/Edit Society Dialog

### Objective

Create a reusable dialog component for creating and editing societies. Uses `react-hook-form` + `zod` for validation. In create mode, submits `societies.create`. In edit mode, submits `societies.update`. Shows success toast via `sonner`.

### Required Reading

- `notes/features/01-society-registry.md` — "Add/Edit Society Dialog" section (field list)
- `notes/01-tech-stack.md` — "Forms" (react-hook-form + zod), "Toasts" (sonner)

### Key Rules

1. Component: `src/components/admin/SocietyCreateDialog.tsx`. Accept props: `open`, `onOpenChange`, `society?` (if present = edit mode, if absent = create mode).
2. Use shadcn/ui: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Textarea`, `Button`, `Select` (for status in edit mode), `AlertDialog` (for INACTIVE confirmation).
3. Zod schema for validation:
   - `name`: `z.string().min(1, "Name is required").trim()`
   - `city`: `z.string().min(1, "City is required").trim()`
   - `address`: `z.string().optional()`
   - `notes`: `z.string().optional()`
   - `status`: Only in edit mode. `z.enum(["ONBOARDING", "ACTIVE", "INACTIVE"])`.
4. On submit:
   - Create mode: Call `societies.create` mutation → show "Society created" toast → close dialog.
   - Edit mode: Call `societies.update` mutation → show "Society updated" toast → close dialog.
5. Status field only visible in edit mode. In create mode, status auto-defaults to `ONBOARDING` (backend handles this).
6. **INACTIVE confirmation (mandatory)**: When admin selects `INACTIVE` status in edit mode, intercept the submit and show a confirmation AlertDialog: "Guards in this society will be unable to submit new leads. Are you sure?" Only call the mutation after confirmation. This is required by the feature spec.
7. Handle mutation errors: If status transition fails (e.g., ONBOARDING→ACTIVE with no buildings), show the error message in a toast.
8. Disable submit button while mutation is in-flight (`useMutation` loading state).
9. Wire this dialog into the Society List page (T04) — "Add Society" button opens it.
10. Wire into Society Detail page (T06) — "Edit" button opens it in edit mode.

### Deliverables

- [ ] `src/components/admin/SocietyCreateDialog.tsx` — Dialog component with create/edit modes, form validation, mutation calls, INACTIVE confirmation, toast feedback

### Acceptance Criteria

1. Dialog opens in create mode with empty form fields (no status dropdown)
2. Dialog opens in edit mode with pre-filled fields + status dropdown
3. Submitting with empty name shows validation error "Name is required"
4. Submitting with empty city shows validation error "City is required"
5. Selecting INACTIVE status and submitting shows confirmation dialog with warning text
6. Confirming INACTIVE proceeds with mutation; canceling returns to form
7. Successful create shows "Society created" toast and closes dialog
8. Successful edit shows "Society updated" toast and closes dialog
9. Failed status transition (e.g., ACTIVE with no buildings) shows error toast
10. Submit button is disabled during mutation
11. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
npm run build
```

### Out of Scope

- Delete functionality (societies are set INACTIVE, never deleted)
- Building-related fields (E02)

---

## T06: Society Detail Page

### Objective

Create the society detail page at `/admin/societies/[id]`. Shows society header with name, status badge, and edit button. Below that, a tab layout with 4 tabs: Buildings, Guards, Leads, Analytics. Only the Buildings tab will be populated in E02 — the others show placeholder content indicating they'll be filled by future phases.

### Required Reading

- `notes/features/01-society-registry.md` — "Admin: View Society Detail" section, "Society Detail Page" section
- `notes/06-admin-panel-ux.md` — Page layout conventions, tab patterns

### Key Rules

1. Route: `src/app/(admin)/admin/societies/[id]/page.tsx`. The `(admin)` route group provides admin layout; the real `admin/` directory adds the URL prefix. Extract `id` from params.
2. Use `societies.getById` query (T02) to fetch society + aggregated data.
3. Header section:
   - Society name (large heading)
   - Status badge (same color coding as list page)
   - City + address displayed below name
   - "Edit" button → opens SocietyCreateDialog in edit mode
   - Quick stat cards: Buildings count, Guards count, Lead stats (total + breakdown: submitted/verified/rejected/duplicate)
4. Tab layout using shadcn `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`:
   - **Buildings** tab (default active): Placeholder text "Buildings will be managed here" — E02-T04 replaces this.
   - **Guards** tab: Placeholder "Guard management will be available after Phase 3"
   - **Leads** tab: Placeholder "Lead tracking will be available after Phase 4"
   - **Analytics** tab: Placeholder "Analytics will be available after Phase 12"
5. Handle loading state: Show skeleton for header and tabs while query loads.
6. Handle not found: If `getById` returns null, show "Society not found" with a back link to `/admin/societies`.
7. Breadcrumb: "Societies" → "{Society Name}" (if your admin layout supports breadcrumbs, otherwise skip).

### Deliverables

- [ ] `src/app/(admin)/admin/societies/[id]/page.tsx` — Society detail page with header, stats, and tabbed layout

### Acceptance Criteria

1. Page renders at `/admin/societies/[id]` with correct society data
2. Header shows society name, status badge, city, address (if present), and edit button
3. Stat cards show correct building count, guard count, lead stats (total + breakdown by status)
4. 4 tabs are visible: Buildings, Guards, Leads, Analytics
5. Buildings tab is active by default
6. Non-buildings tabs show placeholder messages with phase references
7. Edit button opens SocietyCreateDialog in edit mode
8. Invalid society ID shows "Society not found" state
9. Loading state shows skeletons
10. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Buildings tab content (E02-T04 populates this)
- Guards tab content (Phase 3)
- Leads tab content (Phase 4)
- Analytics tab content (Phase 12)
- Quick actions: "Add Building" and "Add Guard" (E02 adds the building action; Phase 3 adds guard action)

---

## T07: Society Backend Tests

### Objective

Write comprehensive tests for society mutations and queries using `convex-test`. Cover happy paths, permission enforcement, status transition validation, and edge cases.

### Required Reading

- `notes/11-convex-architecture.md` — "Testing Patterns" section (convex-test setup)
- `notes/04-state-machines.md` — "Society Status" transition table (all valid/invalid transitions)
- Existing test files from P01 (e.g., `convex/*.test.ts`) for format reference

### Key Rules

1. Test file: `convex/societies.test.ts`.
2. Use `convex-test` framework with `vitest`. Import from `convex-test` and `vitest`.
3. Test categories:
   - **Create mutation**: Valid creation, missing required fields, permission denied
   - **Update mutation**: Valid field updates, valid status transitions, invalid status transitions, permission denied
   - **List query**: No filters, status filter, city filter, empty results
   - **GetById query**: Existing society, non-existent ID, aggregated counts
   - **Search query**: Matching name, no matches, filtered search
4. For status transition tests, cover ALL transitions from the state machine:
   - `ONBOARDING` → `ACTIVE` with ≥1 building → success
   - `ONBOARDING` → `ACTIVE` with 0 buildings → throws
   - `ACTIVE` → `INACTIVE` → success
   - `INACTIVE` → `ACTIVE` → success
   - `ONBOARDING` → `INACTIVE` → throws (invalid)
   - `ACTIVE` → `ONBOARDING` → throws (can't go back)
   - `INACTIVE` → `ONBOARDING` → throws (can't go back)
5. Mock auth context for permission tests — test both authorized and unauthorized calls.
6. Follow existing test patterns from Phase 1 test files for consistent style.

### Deliverables

- [ ] `convex/societies.test.ts` — Comprehensive test suite covering mutations, queries, permissions, and status transitions

### Acceptance Criteria

1. All tests pass: `npm run test -- convex/societies.test.ts`
2. Create mutation: ≥3 test cases (happy path, missing fields, unauthorized)
3. Update mutation: ≥5 test cases (field update, each valid transition, each invalid transition, unauthorized)
4. List query: ≥3 test cases (no filter, status filter, city filter)
5. GetById query: ≥2 test cases (found, not found)
6. Search query: ≥2 test cases (match, no match)
7. `npx tsc --noEmit` passes

### Verification

```bash
npm run test -- convex/societies.test.ts
npx tsc --noEmit
```

### Out of Scope

- Building tests (E02-T06)
- UI/component tests (manual verification for V1)
- Integration tests with real WorkOS (mocked auth context is sufficient)
