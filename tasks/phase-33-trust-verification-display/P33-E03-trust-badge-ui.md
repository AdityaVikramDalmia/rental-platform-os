---
epic: P33-E03
title: "Trust Badge UI"
phase: 33
status: pending
priority: high
depends_on: ["P33-E01", "P33-E02"]
---

# P33-E03: Trust Badge UI

> Phase 33 · Trust & Verification Display · Status: pending

## Task Queue

- [ ] P33-E03-T01 — Add trust badges to listing cards (grid and list)
- [ ] P33-E03-T02 — Add trust strip and evidence summary to property detail page
- [ ] P33-E03-T03 — Add freshness-first sorting in listing browse controls
- [ ] P33-E03-T04 — Build admin stale listings management page

---

### P33-E03-T01: Add trust badges to listing cards (grid and list)

**Objective**: Render compact trust badges on card and list-item variants using shared badge-chip primitives and backend-provided trust payloads.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:21-52` — badge set and UI placement requirements.
- `src/components/public/listings/property-card.tsx:19-160` — grid-card listing type and render layout.
- `src/components/public/listings/property-list-item.tsx:19-185` — list-item listing type and render layout.
- `src/components/public/listings/listings-directory.tsx:236-257` — where both card variants are rendered from `listPublished` results.
- `src/components/shared/listing-status-badge.tsx:12-41` — fallback label/color chip pattern to mirror for trust badges.
- `lib/constants.ts:1035-1058` — status color map convention to match for trust badge color maps.

**Key Rules**:

1. Create `TrustBadgeChip` using the same fallback pattern as `ListingStatusBadge` (`label ?? map[badge] ?? badge`, color fallback to gray).
2. Trust badge colors/labels must come from `TRUST_BADGE_COLORS` and `TRUST_BADGE_LABELS` in `lib/constants.ts`; no inline literal maps in components.
3. Cards should display a maximum of three prioritized badges to protect mobile readability.
4. Badge rendering must degrade gracefully when trust data is absent (no crash, no layout jump).
5. Keep current clickable-card behavior and favorite button interactions unchanged.
6. Trust badge labels are English-only in V1. Store labels in `TRUST_BADGE_LABELS` in `lib/constants.ts`, not i18n message files. Public browse/detail pages do not use `next-intl` (guard portal only). When tenant/public i18n is added in a future phase, migrate labels to translation keys. Do not add trust badge labels to `messages/*.json` now.

**Deliverables**:

- [ ] `src/components/shared/trust-badge-chip.tsx` — reusable trust badge chip component.
- [ ] `src/components/public/listings/property-card.tsx` — include trust badge row and trust-aware listing type updates.
- [ ] `src/components/public/listings/property-list-item.tsx` — include trust badge row and trust-aware listing type updates.

**Acceptance Criteria**:

- [ ] Grid and list cards show up to 3 trust badges in consistent priority order.
- [ ] Missing/unknown badges render with safe fallback style and label.
- [ ] Card layout remains readable on narrow mobile widths (no overflow clipping).

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
npm run build
```

**Out of Scope**: Property detail trust section, sorting logic, and trust badge label translation (tenant/public pages are English-only in V1).

---

### P33-E03-T02: Add trust strip and evidence summary to property detail page

**Objective**: Show expanded trust badges, freshness state, and concise evidence metadata near the top of the listing detail experience.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:39-157` — detail-page trust strip expectations and acceptance checks.
- `src/app/listing/[slug]/components/property-detail-client.tsx:17-133` — current section hierarchy and insertion point for trust UI.
- `src/app/listing/[slug]/page.tsx:11-74` — detail payload typing and server fetch path.
- `convex/listings.ts:843-929` — `getBySlugPublic` payload structure to extend with trust data.
- `convex/http.ts:44-70` — HTTP transport path used by detail page.

**Key Rules**:

1. Trust UI should be inserted near top-level detail context (after breadcrumb/share controls, before deep content sections).
2. Keep `PropertyDetailClient` component composition clean by introducing a dedicated trust section component rather than inlining all markup.
3. Evidence text must be public-safe (counts, status, timestamps) and must not expose owner/tenant personally identifiable data.
4. Freshness timestamp display must use existing locale/date conventions already used on listing surfaces.
5. Preserve SSR data flow: `page.tsx` typing, HTTP payload, and `PropertyDetailClient` props must remain aligned.

**Deliverables**:

- [ ] `src/app/listing/[slug]/components/trust-section.tsx` (or equivalent) — detail trust strip + evidence list UI.
- [ ] `src/app/listing/[slug]/components/property-detail-client.tsx` — render trust section in the detail hierarchy.
- [ ] `src/app/listing/[slug]/page.tsx` — extend payload type and pass trust data to the client component.

**Acceptance Criteria**:

- [ ] Detail page displays trust badges, freshness state/score, and evidence snippets for active badges.
- [ ] Trust section renders correctly for listings with no badges (empty-state/fallback copy).
- [ ] Existing detail sections (gallery, pricing, commute, contact sidebar) remain intact and functional.

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
npm run build
```

**Out of Scope**: Admin manual recompute action and tooltip/modal deep evidence UX.

---

### P33-E03-T03: Add freshness-first sorting in listing browse controls

**Objective**: Add a trust-aware sort option that prioritizes fresher listings while preserving all existing filter and sort behavior.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:43-46` — freshness-first sort requirement.
- `src/lib/hooks/use-listing-filters.ts:6-21` — `SortOption` union and `VALID_SORTS` list.
- `src/lib/hooks/use-listing-filters.ts:128-131` — URL sort parsing and default fallback behavior.
- `src/lib/hooks/use-listing-filters.ts:171-172` — URL serialization of sort value.
- `src/components/public/listings/sort-dropdown.tsx:17-28` — sort control options list.
- `src/components/public/listings/listings-directory.tsx:61-75` — in-memory sort function switch.

**Key Rules**:

1. Extend `SortOption` with `"freshness_first"` and add it to `VALID_SORTS` so URL parsing remains type-safe.
2. Add `freshness_first` option to the dropdown and ensure it round-trips through URL state like existing sorts.
3. Implement sort logic to prefer higher `freshness_score` first, with deterministic tie-breaker (for example, `_creationTime` desc).
4. Keep all existing sort modes (`newest`, `price_asc`, `price_desc`, `area_desc`) behavior unchanged.
5. Sorting must tolerate missing freshness data by falling back safely (no runtime errors, stable ordering).
6. Add an admin-sidebar entry for trust staleness management so the stale queue page is discoverable in backoffice navigation.

**Deliverables**:

- [ ] `src/lib/hooks/use-listing-filters.ts` — add trust sort option and URL sync support.
- [ ] `src/components/public/listings/sort-dropdown.tsx` — add `Freshness First` dropdown option.
- [ ] `src/components/public/listings/listings-directory.tsx` — implement trust sort branch in `applySortOrder`.
- [ ] `src/app/(admin)/admin-layout-client.tsx` (or equivalent sidebar config) — add navigation item for trust badge staleness page.

**Acceptance Criteria**:

- [ ] Selecting `Freshness First` reorders results by trust freshness score descending.
- [ ] Existing sort options continue to produce current ordering behavior.
- [ ] Reload/share URL preserves the selected trust sort value.
- [ ] Admin sidebar includes a link to the trust staleness management surface.

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
npm run build
```

**Out of Scope**: Weighted ranking blends (price + freshness + conversion), AI ranking, recommendation models, and trust badge label translation (tenant/public pages are English-only in V1).

---

### P33-E03-T04: Build Admin Stale Listings Management Page

**Objective**: Deliver an admin-facing stale listings queue so operations can triage listings where trust freshness is stale.

**Required Reading** (read these BEFORE starting):

- `notes/features/25-trust-verification-display.md:133-156` — admin trust query contracts and stale queue intent.
- `src/app/(admin)/admin/verification/page.tsx` — admin queue page structure and table patterns.
- `src/app/(admin)/admin-layout-client.tsx` — sidebar navigation item pattern and permission-gated visibility.
- `convex/trustBadges.ts` — stale queue query payload fields (`freshness_state`, `freshness_score`, `last_activity_at`).

**Key Rules**:

1. Route must be `src/app/(admin)/admin/stale-listings/page.tsx` and use backoffice auth/permission gating consistent with other admin queue pages.
2. Queue must show only listings where `freshness_state !== "FRESH"` and include listing name, `freshness_state`, `freshness_score`, and `last_activity_at` columns.
3. Table rows must link to the listing detail/admin listing surface so stale entries are actionable.
4. Add a sidebar nav item for stale listings management so the page is discoverable from primary admin navigation.
5. Follow existing admin table UX conventions (pagination controls, loading/empty/error states, deterministic row ordering).

**Deliverables**:

- [ ] `src/app/(admin)/admin/stale-listings/page.tsx` — admin stale listings queue page.
- [ ] `src/app/(admin)/admin-layout-client.tsx` (or equivalent sidebar config) — add stale listings nav entry.
- [ ] `src/components/admin/trust/StaleListingsTable.tsx` (or equivalent) — table rendering stale rows with link-out actions.

**Acceptance Criteria**:

- [ ] Admin can open `/admin/stale-listings` from sidebar navigation.
- [ ] Page lists only non-fresh listings (`freshness_state !== "FRESH"`) with `freshness_state`, `freshness_score`, and `last_activity_at` visible.
- [ ] Each row includes a link to listing detail for follow-up action.
- [ ] Empty state is explicit when no stale listings exist.

**Verification**:

```bash
# Commands to verify this task
npx tsc --noEmit
npx convex dev --typecheck
npm run build
```

**Out of Scope**: Bulk stale-listing mutation actions and automated stale-notification dispatch.
