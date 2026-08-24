---
id: P27-E05
title: Cross-Entity Navigation & Linking
phase: 27
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P27-E05: Cross-Entity Navigation & Linking

## Overview

Replace plain-text entity names in all admin detail panels with clickable Next.js links, add breadcrumb navigation to key detail pages, and surface a "Related Entities" chain on payout, closure, and visit detail pages. All changes are frontend-only — no new Convex queries needed.

## Task Queue

- [x] P27-E05-T01: Make Entity Names Clickable in Detail Panels
- [x] P27-E05-T02: Add Breadcrumbs to Detail Pages
- [x] P27-E05-T03: Add "Related Entities" Section to Key Detail Pages
- [x] P27-E05-T04: Verify All Navigation Links

---

## T01: Make Entity Names Clickable in Detail Panels

### Objective

Wrap every entity name that is currently plain text in the four detail panels with a Next.js `Link` component pointing to the correct admin detail page. After this task, ops can navigate from any detail panel directly to the related entity without going back to a list page.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Key Admin Flows" section (detail panel wireframes, sidebar nav structure)
- `src/app/(admin)/admin/leads/components/lead-guard-card.tsx` — existing link pattern to follow (`text-blue-600 hover:underline`)

### Key Rules

1. Use Next.js `Link` from `"next/link"` — not `<a>` tags. This preserves client-side navigation and the back button.
2. Style all links with `className="text-blue-600 hover:underline"` — match the existing pattern in `lead-guard-card.tsx`. Do not invent a new style.
3. Guard against null/undefined IDs before rendering a link. If the ID is missing, render the plain text as a fallback — never render a broken `href`.
4. Do not change any data-fetching logic. These panels already receive the entity data they need; you are only changing how names are rendered.
5. Building links go to the society detail page with a buildings tab anchor: `/admin/societies/{society_id}#buildings`. If the society detail page does not have a `#buildings` anchor yet, link to `/admin/societies/{society_id}` without the anchor — do not block this task on that.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx` — Society name links to `/admin/societies/{society_id}`, building name links to `/admin/societies/{society_id}`
- [ ] `src/app/(admin)/admin/visits/components/visit-detail-panel.tsx` — Guard name links to `/admin/guards/{guard_id}`, lead flat/address info links to open the lead detail (use a button or link that sets the selected lead ID in the parent, or links to `/admin/leads?id={lead_id}` if the page supports query-param selection)
- [ ] `src/app/(admin)/admin/closures/components/closure-detail-panel.tsx` — Guard name links to `/admin/guards/{guard_id}`, lead info links to `/admin/leads?id={lead_id}`
- [ ] `src/app/(admin)/admin/payouts/components/payout-detail-panel.tsx` — Guard name links to `/admin/guards/{guard_id}`, "Open Lead" button/link goes to `/admin/leads?id={lead_id}` (specific lead, not generic `/admin/leads`)
- [ ] `src/app/(admin)/admin/listings/[id]/page.tsx` — "Source Lead" label links to `/admin/leads?id={lead_id}`, society name links to `/admin/societies/{society_id}`

### Acceptance Criteria

1. Every entity name listed in the Deliverables section renders as a blue underlined link, not plain text.
2. Each link points to the correct URL with the correct entity ID interpolated.
3. When the entity ID is null or undefined, the name renders as plain text with no broken link.
4. Clicking a guard name link navigates to `/admin/guards/{guard_id}`.
5. The "Open Lead" button in payout detail navigates to the specific lead, not the generic leads list.
6. TypeScript compiles clean — no `as any`, no implicit `any`.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on all five modified files.

### Out of Scope

- Adding a `#buildings` anchor to the society detail page (separate concern)
- Changing the data queries that power these panels
- Cross-linking in guard portal pages (guard portal is i18n-translated, separate concern)

---

## T02: Add Breadcrumbs to Detail Pages

### Objective

Create a shared `Breadcrumb` component and add it to the top of five admin detail pages. Breadcrumbs replace the existing "Back to X" buttons where present, giving ops a clear sense of location and one-click navigation to any level.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Global Layout" section (sidebar nav labels, page hierarchy)
- `src/app/(admin)/admin/guards/[id]/page.tsx` — existing "Back to Guards" button at the top of the page (line ~30-50) — this is what breadcrumbs replace

### Key Rules

1. Build a simple custom component — do not install a breadcrumb library. The component is 20-30 lines of JSX.
2. Props: `items: Array<{ label: string; href?: string }>`. The last item in the array has no `href` (it is the current page). All other items render as `Link` components.
3. Separator: use a `/` character or a `ChevronRight` icon from `lucide-react` (already installed). Keep it visually subtle — `text-muted-foreground`.
4. The component is admin-only. Place it in `src/components/admin/Breadcrumb.tsx`.
5. On guard detail: remove the existing "Back to Guards" button and replace it with the breadcrumb. Do not leave both.
6. Breadcrumb items for each page:
   - Guard detail: `Guards (/admin/guards)` > `{guard name}`
   - Listing detail: `Listings (/admin/listings)` > `{listing address}`
   - Visit detail: `Visits (/admin/visits)` > `Visit #{visit_id short}`
   - Closure detail: `Closures (/admin/closures)` > `Closure #{closure_id short}`
   - Payout detail: `Payouts (/admin/payouts)` > `Payout #{payout_id short}`

### Deliverables

- [ ] `src/components/admin/Breadcrumb.tsx` — Shared breadcrumb component with `items` prop
- [ ] `src/app/(admin)/admin/guards/[id]/page.tsx` — Replace "Back to Guards" button with `<Breadcrumb>` at top of page
- [ ] `src/app/(admin)/admin/listings/[id]/page.tsx` — Add `<Breadcrumb>` at top of page
- [ ] `src/app/(admin)/admin/visits/[id]/page.tsx` (or visit detail panel if visits use a panel, not a page) — Add `<Breadcrumb>` where appropriate
- [ ] `src/app/(admin)/admin/closures/[id]/page.tsx` (or closure detail panel) — Add `<Breadcrumb>`
- [ ] `src/app/(admin)/admin/payouts/[id]/page.tsx` (or payout detail panel) — Add `<Breadcrumb>`

### Acceptance Criteria

1. `Breadcrumb` component renders a horizontal list of items separated by `/` or `ChevronRight`.
2. All items except the last render as clickable `Link` components.
3. The last item renders as plain text (current page, not a link).
4. Guard detail page no longer has a standalone "Back to Guards" button — the breadcrumb replaces it.
5. Breadcrumb appears at the top of each detail page, above the main content.
6. TypeScript compiles clean.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/Breadcrumb.tsx` and all modified page files.

### Out of Scope

- Breadcrumbs on list pages (list pages don't need them — they are top-level)
- Breadcrumbs on guard portal pages
- Animated transitions between breadcrumb levels
- Mobile-specific breadcrumb truncation

---

## T03: Add "Related Entities" Section to Key Detail Pages

### Objective

Add a compact "Related" card to payout, closure, and visit detail pages that shows the full entity chain as clickable links. This lets ops trace a deal from society all the way to payout without opening multiple tabs.

### Required Reading

- `notes/06-admin-panel-ux.md` — "Flow 5: Process Closure & Payout" section (the chain: lead → listing → visit → closure → payout)
- `notes/04-state-machines.md` — Lead, visit, closure, payout status transitions (to understand what data is always present vs optional)
- `notes/13-constants-reference.md` — Status enums (to label statuses correctly in the chain)

### Key Rules

1. The "Related" section is a compact read-only card — not a full data display. Each item is one line: an icon, a label, and a clickable link. Example: `📝 Lead #47 — Tower A / 1201` linking to `/admin/leads?id={lead_id}`.
2. Use the shadcn/ui `Card` component with a "Related" heading. Keep it visually lightweight — smaller font, muted colors for labels.
3. Show only the entities that exist. If a payout has no linked listing (edge case), skip that row. Never show a broken link.
4. The chain for each page:
   - **Payout detail**: Society → Building/Flat (from lead) → Lead → Listing (if exists) → Visit (if exists) → Closure → This Payout
   - **Closure detail**: Society → Building/Flat → Lead → Listing (if exists) → Visit (if exists) → This Closure
   - **Visit detail**: Society → Building/Flat → Lead → Listing (if exists) → This Visit
5. All data needed for this section should already be available in the detail panel's existing query result. If a field is missing (e.g., `society_name` not returned), use the ID as the link label rather than adding a new query.
6. Place the "Related" card below the main detail content, above the status history section.

### Deliverables

- [ ] `src/app/(admin)/admin/payouts/components/payout-detail-panel.tsx` — "Related" card showing full chain from society to payout
- [ ] `src/app/(admin)/admin/closures/components/closure-detail-panel.tsx` — "Related" card showing chain up to closure
- [ ] `src/app/(admin)/admin/visits/components/visit-detail-panel.tsx` — "Related" card showing lead + listing + society

### Acceptance Criteria

1. Each detail panel shows a "Related" card with the entity chain.
2. Every item in the chain is a clickable link pointing to the correct admin page.
3. Items with missing IDs are skipped — no broken links, no empty `href` attributes.
4. The card is visually compact and does not dominate the panel layout.
5. TypeScript compiles clean.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on all three modified panel files.

### Out of Scope

- Adding new Convex queries to fetch missing chain data (use what's already in the panel's query result)
- Showing the chain on lead detail (lead is the start of the chain, not the middle)
- Animated expand/collapse for the related card

---

## T04: Verify All Navigation Links

### Objective

Systematically test every cross-entity link added in T01-T03. Confirm each link renders, navigates to the correct page, and handles null/undefined IDs gracefully. Run `lsp_diagnostics` on all modified files to confirm zero TypeScript errors.

### Required Reading

- This epic file — review the full list of links added in T01-T03
- `src/app/(admin)/admin-layout-client.tsx` — sidebar nav structure (to confirm destination pages exist)

### Key Rules

1. Check every link destination exists as a real route. If a destination page does not exist (e.g., `/admin/visits/[id]` is a panel, not a page), update the link in T01/T02/T03 to use the correct pattern (e.g., query param on the list page).
2. Test null ID handling: for each link, confirm the code has a guard (`if (!entity_id) return <span>{name}</span>`). If any link is missing this guard, add it now.
3. Run `lsp_diagnostics` on every file touched in this epic — not just the ones from T04.
4. If `npm run build` reveals any import errors or missing modules introduced by this epic, fix them before marking this task done.

### Deliverables

- [ ] All files from T01-T03 pass `lsp_diagnostics` with zero errors
- [ ] `npm run build` passes with zero errors

### Acceptance Criteria

1. `lsp_diagnostics` returns zero errors on all files modified in this epic.
2. `npm run build` completes without errors.
3. Every link added in T01-T03 has a null-ID guard that falls back to plain text.
4. No link points to a route that does not exist in the app router.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on:

- `src/app/(admin)/admin/leads/components/lead-detail-panel.tsx`
- `src/app/(admin)/admin/visits/components/visit-detail-panel.tsx`
- `src/app/(admin)/admin/closures/components/closure-detail-panel.tsx`
- `src/app/(admin)/admin/payouts/components/payout-detail-panel.tsx`
- `src/app/(admin)/admin/listings/[id]/page.tsx`
- `src/components/admin/Breadcrumb.tsx`
- All guard/listing/visit/closure/payout detail pages modified in T02

### Out of Scope

- End-to-end Playwright tests (separate verification agent task)
- Testing guard portal navigation
- Performance testing of navigation
