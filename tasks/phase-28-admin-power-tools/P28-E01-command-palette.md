---
id: P28-E01
title: Command Palette + Global Search (⌘K)
phase: 28
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P28-E01: Command Palette + Global Search (⌘K)

## Overview

Add a ⌘K / Ctrl+K command palette to the admin panel that lets power users navigate to any page, search entities (guards, leads, societies), and trigger quick actions — all without touching the mouse. Uses the shadcn/ui `command` component as the foundation. Wired into the admin layout so it's available on every admin page.

## Task Queue

- [x] P28-E01-T01: Install shadcn Command component and create CommandPalette shell
- [x] P28-E01-T02: Add navigation commands with icons and keyboard hints
- [x] P28-E01-T03: Add entity search (guards, leads, societies) with Convex queries
- [x] P28-E01-T04: Add quick actions, recently used items, and wire into admin layout

---

## T01: Install shadcn Command Component and Create CommandPalette Shell

### Objective

Install the shadcn/ui `command` component and create `src/components/admin/CommandPalette.tsx` — a Dialog-wrapped Command component that opens on ⌘K / Ctrl+K and closes on Escape. This task establishes the shell; content is added in T02-T04.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Global Layout" section (admin layout structure, header area)
- `src/app/(admin)/admin-layout-client.tsx` — Read the full file to understand the current layout structure before adding anything
- `src/components/ui/` — Check which shadcn/ui components already exist (dialog.tsx, command.tsx if already present)

### Key Rules

1. Run `npx shadcn@latest add command` to install the component. This creates `src/components/ui/command.tsx`. If it already exists, skip the install.
2. The `CommandPalette` component is a client component (`"use client"`). It manages its own `open` state internally via `useState`.
3. Use shadcn/ui `Dialog` + `DialogContent` to wrap the `Command` component. The `Command` component renders inside the dialog, not as a standalone popover. This gives proper backdrop, focus trap, and Escape-to-close behavior.
4. The keyboard listener for ⌘K / Ctrl+K must be attached via `useEffect` on `document`. Clean up the listener on unmount. Pattern:
   ```typescript
   useEffect(() => {
     const handler = (e: KeyboardEvent) => {
       if ((e.metaKey || e.ctrlKey) && e.key === "k") {
         e.preventDefault();
         setOpen((prev) => !prev);
       }
     };
     document.addEventListener("keydown", handler);
     return () => document.removeEventListener("keydown", handler);
   }, []);
   ```
5. The `CommandPalette` component accepts an `open` prop and `onOpenChange` prop so the parent layout can also control it (for the header button in T04). Alternatively, expose a `ref` with an `open()` method — choose whichever pattern is cleaner, but be consistent with T04.
6. `CommandInput` placeholder text: `"Search pages, guards, leads..."`.
7. `CommandEmpty` text: `"No results found."`.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/ui/command.tsx` — shadcn/ui Command component (installed via CLI, do not hand-write)
- [ ] `src/components/admin/CommandPalette.tsx` — Shell component with Dialog + Command, ⌘K listener, open/close state, empty CommandInput and CommandList

### Acceptance Criteria

1. `npx shadcn@latest add command` runs without error (or component already exists)
2. `CommandPalette` renders a Dialog with a `CommandInput` inside
3. Pressing ⌘K (Mac) or Ctrl+K (Windows/Linux) opens the palette
4. Pressing Escape closes the palette
5. The palette renders with an empty command list (no content yet — that's T02-T04)
6. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx shadcn@latest add command
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/CommandPalette.tsx`.

### Out of Scope

- Navigation commands (T02)
- Entity search (T03)
- Quick actions and recently used items (T04)
- Wiring into the admin layout header (T04)

---

## T02: Add Navigation Commands with Icons and Keyboard Hints

### Objective

Populate the `CommandPalette` with a "Navigation" command group listing all 11 admin pages. Each item shows a lucide-react icon, the page name, and a keyboard shortcut hint (the chord from E02, e.g., "G D"). Selecting an item navigates to that page and closes the palette.

### Required Reading

- `src/app/(admin)/admin-layout-client.tsx` — The sidebar nav items list (names, paths, icons already defined here — reuse them, don't duplicate)
- `notes/06-admin-panel-ux.md` — "Sidebar Navigation" section (all admin pages and their paths)
- `src/components/admin/CommandPalette.tsx` — The shell from T01 (read before editing)

### Key Rules

1. Read `src/app/(admin)/admin-layout-client.tsx` first. The sidebar already defines nav items with labels, paths, and icons. Extract that list into a shared constant or import it directly — do NOT duplicate the page list.
2. The 11 admin pages to include: Dashboard, Guards, Leads, Societies, Visits, Closures, Payouts, Listings, Audit, Verification, Settings. Match the exact paths from the sidebar.
3. Use `CommandGroup` with heading `"Navigation"` to group these items.
4. Each `CommandItem` renders: icon (lucide-react, same icon as sidebar), page name, and a `<kbd>` element showing the chord hint (e.g., `G D` for Dashboard, `G L` for Leads). Style `<kbd>` with `text-xs bg-muted px-1.5 py-0.5 rounded font-mono`.
5. Chord hints to show (matching E02 shortcuts): Dashboard → `G D`, Guards → `G G`, Leads → `G L`, Visits → `G V`, Payouts → `G P`, Societies → `G S`. Pages without a chord (Closures, Listings, Audit, Verification, Settings) show no `<kbd>` hint.
6. Selecting a `CommandItem` calls `router.push(path)` (use `useRouter` from `next/navigation`) and then calls `setOpen(false)`.
7. The `CommandItem` `value` prop must be the page name (lowercase) so the built-in Command filtering works correctly.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/CommandPalette.tsx` — Updated with a "Navigation" `CommandGroup` containing all 11 admin pages with icons and chord hints

### Acceptance Criteria

1. Opening the palette shows a "Navigation" group with all 11 admin pages
2. Each item shows the correct lucide-react icon matching the sidebar
3. Items with chord shortcuts show a styled `<kbd>` hint
4. Typing in the `CommandInput` filters the navigation items by name
5. Clicking or pressing Enter on an item navigates to the correct page and closes the palette
6. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/CommandPalette.tsx`.

### Out of Scope

- Entity search results (T03)
- Quick actions (T04)
- Recently used items (T04)

---

## T03: Add Entity Search (Guards, Leads, Societies)

### Objective

Add a "Search" section to the command palette that queries guards by name/phone, leads by flat number, and societies by name as the user types. Results are grouped by entity type. Uses Convex queries with 300ms debounce. Selecting a result navigates to the entity's detail page.

### Required Reading

- `convex/guards.ts` — Check if `api.guards.list` accepts a `search` or `query` string argument. If not, a lightweight `searchGuards` query needs to be added.
- `convex/leads.ts` — Check if `api.leads.list` accepts a `search` string argument for flat number search.
- `convex/societies.ts` — Check if `api.societies.list` accepts a `search` string argument.
- `notes/10-convex-schema.md` — `guards` / `guard_profiles` / `leads` / `societies` tables (field names for search and display)
- `notes/13-constants-reference.md` — `GUARD_STATUS`, `LEAD_STATUS` (to filter out BANNED guards, REJECTED leads from search results)

### Key Rules

1. **Check existing queries first.** Before adding any new Convex functions, read `convex/guards.ts`, `convex/leads.ts`, and `convex/societies.ts` to see if search arguments already exist. Only add new queries if the existing ones don't support text search.
2. If new search queries are needed, add them to the existing domain files (not a new file). Pattern:
   ```typescript
   export const search = query({
     args: { query: v.string() },
     handler: async (ctx, args) => {
       await requireAdmin(ctx);
       if (args.query.length < 2) return [];
       // Use .filter() with searchable_text or name field
       // Return max 5 results
     },
   });
   ```
3. Debounce the search input: use a `useState` for the raw input and a separate `useState` for the debounced value. Update the debounced value with `setTimeout` (300ms) cleared on each keystroke. Do NOT use a third-party debounce library.
4. Pass the debounced query to `useQuery`. When the debounced query is empty or less than 2 characters, pass `undefined` or skip the query (use Convex's `skip` option: `useQuery(api.guards.search, query.length >= 2 ? { query } : "skip")`).
5. Group results with three `CommandGroup` sections: "Guards", "Leads", "Societies". Only render a group if it has results.
6. Guard result item: show guard name + phone (formatted `+91 XXXXX XXXXX`). Navigate to `/admin/guards/{id}` on select.
7. Lead result item: show flat number + building name + society name. Navigate to `/admin/leads` with the lead selected (append `?id={leadId}` if the leads page supports it, otherwise just `/admin/leads`).
8. Society result item: show society name + city. Navigate to `/admin/societies/{id}` on select.
9. Show a loading indicator (spinner or "Searching..." text) while queries are in-flight. Use `useQuery`'s `undefined` return value to detect loading.
10. If all 3 queries return empty arrays for a non-empty search, the existing `CommandEmpty` ("No results found.") handles it.
11. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/guards.ts` — `search` query added (only if existing `list` doesn't support text search)
- [ ] `convex/leads.ts` — `search` query added (only if existing `list` doesn't support flat number search)
- [ ] `convex/societies.ts` — `search` query added (only if existing `list` doesn't support name search)
- [ ] `src/components/admin/CommandPalette.tsx` — Updated with debounced search input, 3 entity result groups, loading state

### Acceptance Criteria

1. Typing 2+ characters in the palette triggers entity search
2. Results appear grouped under "Guards", "Leads", "Societies" headings
3. Guard results show name + phone; lead results show flat + building + society; society results show name + city
4. Selecting a result navigates to the correct detail page and closes the palette
5. A loading indicator appears while queries are in-flight
6. Typing fewer than 2 characters shows no search results (only navigation commands)
7. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/CommandPalette.tsx` and any modified Convex files.

### Out of Scope

- Full-text search across all entity fields (only name/phone/flat number)
- Fuzzy matching (exact substring match is sufficient)
- Search result pagination (max 5 per entity type)
- Tenant or owner search

---

## T04: Add Quick Actions, Recently Used Items, and Wire into Admin Layout

### Objective

Add a "Quick Actions" group (filtered views like "Pending Leads", "Today's Visits") and a "Recent" group (last 5 items the user navigated to, persisted in localStorage). Then mount `CommandPalette` in the admin layout and add a ⌘K hint button to the header.

### Required Reading

- `src/app/(admin)/admin-layout-client.tsx` — Full file. This is where `CommandPalette` gets mounted and the header button gets added.
- `src/components/admin/CommandPalette.tsx` — The component from T01-T03 (read before editing)
- `notes/06-admin-panel-ux.md` — "Global Layout" section (header area description)

### Key Rules

1. **Quick Actions group** — heading: `"Quick Actions"`. Items:
   - "Pending Leads" → `/admin/leads?status=SUBMITTED` (icon: `ClipboardList`)
   - "Today's Visits" → `/admin/visits?date=today` (icon: `CalendarCheck`)
   - "Pending Payouts" → `/admin/payouts?status=pending` (icon: `Banknote`)
   - "Unverified Leads" → `/admin/leads?status=NEED_INFO` (icon: `AlertCircle`)
   - "Active Guards" → `/admin/guards?status=ACTIVE` (icon: `Shield`)
     All icons from `lucide-react`.
2. **Recently Used group** — heading: `"Recent"`. Persisted in `localStorage` under key `"admin_cmd_recent"`. Max 5 items. Each item is `{ label: string, path: string, icon: string }` where `icon` is a lucide icon name string. When the user selects any item (navigation or quick action), prepend it to the recent list and trim to 5. Render recent items using a dynamic icon lookup map (not dynamic imports — just a static map of icon name → component).
3. Only show the "Recent" group if `localStorage` has at least 1 item. On first use, the group is hidden.
4. **Admin layout header button**: In `src/app/(admin)/admin-layout-client.tsx`, add a button to the header area that opens the palette. The button shows: search icon + `"Search..."` text + `⌘K` badge. Style: `flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-md px-3 py-1.5 hover:bg-muted/80 cursor-pointer`. On click, call `setOpen(true)` on the `CommandPalette` — use a `ref` or lift state to the layout.
5. Mount `<CommandPalette />` once in `admin-layout-client.tsx`, outside the main content area (so it's available on every page). It renders nothing visible when closed.
6. The `CommandPalette` component must handle `localStorage` access safely: wrap in `typeof window !== "undefined"` checks or use `useEffect` to read/write (never read localStorage during SSR).
7. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/CommandPalette.tsx` — Final version with Quick Actions group, Recently Used group, localStorage persistence
- [ ] `src/app/(admin)/admin-layout-client.tsx` — Updated to mount `CommandPalette` and add ⌘K hint button to header

### Acceptance Criteria

1. "Quick Actions" group shows 5 items with correct icons and navigation targets
2. Selecting any item adds it to the "Recent" group (visible on next palette open)
3. "Recent" group shows at most 5 items, newest first
4. "Recent" group is hidden when empty (first use)
5. Recent items persist across page refreshes (localStorage)
6. The admin layout header shows a ⌘K hint button that opens the palette on click
7. `CommandPalette` is mounted once in the layout and available on every admin page
8. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/CommandPalette.tsx` and `src/app/(admin)/admin-layout-client.tsx`.

### Out of Scope

- Syncing recently used items across browser tabs
- Server-side persistence of recently used items
- Keyboard shortcut hints in the Quick Actions group (those are navigation-only in E02)
- Command palette on guard portal (admin-only feature)
