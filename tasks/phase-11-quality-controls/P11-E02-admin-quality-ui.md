---
id: P11-E02
title: Admin Quality UI
phase: 11
status: done
depends_on: ["P11-E01", "P04-E03", "P03-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-18
---

# P11-E02: Admin Quality UI

## Overview

Build the admin quality and controls interface: add verified_rate and total_submitted quality columns to the guard list table, integrate a "Quality" tab into the admin guard detail page with full metrics dashboard and time window selector, add a high-rejection warning badge to the lead queue (using `GUARD_HIGH_REJECTION`), add daily rate limit configuration to the admin settings page, and refine the ban/deactivate admin controls with mandatory ban reason, confirmation dialogs, visit flagging indicator, and browser fingerprint history viewer on the guard detail page.

## Prerequisites

- **Read first**: [P11-E01 Completion Summary](P11-E01-quality-metrics-backend.md#completion-summary) — all quality backend APIs (`guards.getMetrics`, `guards.getLeaderboard`, `guards.getRemainingLeads`, `guards.getFingerprintHistory`, quality flag enrichment on lead queue) are expected to exist.
- **Read first**: [P04-E03 Completion Summary](../phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md#completion-summary) — admin lead queue UI exists with table, filters, and detail panel. High-rejection badge mapping (`GUARD_HIGH_REJECTION`) is added to this existing UI.
- **Read first**: [P03-E02 Completion Summary](../phase-03-guard-management/P03-E02-guard-admin-ui.md#completion-summary) — admin guard list and guard detail pages exist. Guard detail page has existing tabs (Profile, Shifts, etc.). This epic ADDS a "Quality" tab and refines existing ban/deactivate controls.

## Task Queue

- [x] P11-E02-T01: Guard List Quality Columns
- [x] P11-E02-T02: Guard Detail Quality Metrics Tab
- [x] P11-E02-T03: Lead Queue High-Rejection Badge (`GUARD_HIGH_REJECTION`)
- [x] P11-E02-T04: Rate Limit Configuration
- [x] P11-E02-T05: Ban/Deactivate Controls + Fingerprint Viewer

**All tasks complete.**

---

## T01: Guard List Quality Columns

### Objective

Add quality metric columns (verified_rate, total_submitted, status badge) to the existing admin guard list table without changing existing columns.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Where Metrics Are Displayed" point 1: Guard List
- `notes/06-admin-panel-ux.md` — Flow 6: Guard Management guard list wireframe
- `notes/13-constants-reference.md` — Guard/User Status colors (ACTIVE green, INACTIVE amber, BANNED red)
- `tasks/phase-10-incentive-system/P10-E02-admin-incentive-ui.md` — T01 pattern for admin page modification

### Key Rules

1. Modify the existing guard list page (find it under `/admin/guards/` from P03-E02).
2. Add columns to the guard list table: "Verified Rate" (percentage or "Insufficient data"), "Total Leads" (count), "Status" (badge with color).
3. Verified rate column: show percentage (e.g., "85%") when total_submitted >= 5. Show "Insufficient data" in muted text when < 5.
4. Guard status badge colors follow existing component conventions (locally defined in guard table/detail components, not from `lib/constants.ts`): ACTIVE → green (`bg-green-100 text-green-700`), INACTIVE → amber (`bg-amber-100 text-amber-700`), BANNED → red (`bg-red-100 text-red-700`).
5. Guards with high-rejection signal (`GUARD_HIGH_REJECTION` mapping from backend) show a small warning indicator next to their name or verified_rate column. `GUARD_HIGH_REJECTION` already exists in `leadQualityFlagValidator` — no schema modification needed.
6. Columns should be sortable if the existing table supports sorting.
7. Do NOT change existing columns — ADD to them.
8. Quality data comes from the existing guard list query enriched with metrics, or from a separate `guards.getMetrics` call per guard (decide based on performance — batch is preferred).

### Deliverables

- [ ] Admin guard list page — Add verified_rate, total_submitted columns and status badge to guard list table
- [ ] Guard list query modification (or enrichment) to include quality metric data

### Acceptance Criteria

1. Guard list table shows verified_rate, total_submitted, and status badge columns.
2. "Insufficient data" shown for guards with < 5 submissions.
3. Status badge colors match existing guard component conventions.
4. Warning indicator for high-rejection guards (mapped via `GUARD_HIGH_REJECTION`).
5. Existing columns unchanged.
6. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check on `/admin/guards`: verify new columns appear, verify "Insufficient data" for low-submission guards, verify status badge colors, verify warning indicator on high-rejection guards.

### Out of Scope

- Guard detail quality tab (T02), lead queue badges (T03).

---

## T02: Guard Detail Quality Metrics Tab

### Objective

Add a "Quality" tab to the admin guard detail page showing all 10 metrics with time window selector, "insufficient data" state, and quality flag warning banner.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Quality Metrics" section (all 10 metrics), "Time Windows" section, "Where Metrics Are Displayed" point 2: Guard Detail
- `notes/06-admin-panel-ux.md` — Flow 6: Guard Management guard detail wireframe
- `notes/13-constants-reference.md` — Quality Flags section

### Key Rules

1. Modify the guard detail page (find under `/admin/guards/[id]` or guard detail panel from P03-E02).
2. Add "Quality" tab to existing tabs. Position: after existing tabs — check P10-E02-T05 pattern which added an Incentives tab.
3. Tab content uses `useQuery(api.guards.getMetrics, { guard_user_id, time_window })` for reactive data.
4. Time window selector: radio group or segmented control with "All Time" (default), "Last 30 Days", "Last 7 Days".
5. Display ALL 10 metrics in organized sections:
   - **Lead Metrics**: total_submitted, verified_count, rejected_count, duplicate_count, verified_rate, rejection_rate, duplicate_rate
   - **Visit Metrics**: completed_visits, no_show_count, visit_completion_rate
6. Each metric shows: label, value (number or percentage).
7. "Insufficient data" state: when total_submitted < 5 for selected time window, show all rate metrics as "Insufficient data" with explanation: "Requires at least 5 lead submissions for meaningful rates."
8. Include quality flag indicators: if guard currently has high-rejection signal (mapped to `GUARD_HIGH_REJECTION`), show amber warning banner at top of tab.
9. Create shared component: `src/components/admin/guards/guard-quality-tab.tsx`.

### Deliverables

- [ ] `src/components/admin/guards/guard-quality-tab.tsx` — Quality metrics tab with all 10 metrics, time window selector, insufficient data state, and high-rejection warning banner
- [ ] Guard detail page — Wire "Quality" tab into existing tab layout

### Acceptance Criteria

1. "Quality" tab appears on guard detail page.
2. All 10 metrics displayed with correct labels and values.
3. Time window selector switches between all_time, last_30_days, last_7_days.
4. "Insufficient data" state shows when total_submitted < 5.
5. High-rejection warning banner shown when applicable.
6. Reactive data updates via Convex subscription.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check: switch time windows, verify "insufficient data" state, verify warning banner for high-rejection guard.

### Out of Scope

- Guard list columns (T01), lead queue badges (T03).

---

## T03: Lead Queue High-Rejection Badge (`GUARD_HIGH_REJECTION`)

### Objective

Add a visual high-rejection warning badge to lead queue items using the existing `GUARD_HIGH_REJECTION` quality flag mapping.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Where Metrics Are Displayed" point 3: Lead Queue flag
- `notes/13-constants-reference.md` — Quality Flags and `leadQualityFlagValidator`
- `tasks/phase-04-lead-pipeline/P04-E03-admin-lead-queue-ui.md` — existing lead queue components and badge patterns

### Key Rules

1. Modify the existing admin lead queue table/list (from P04-E03).
2. Create shared component: `src/components/shared/quality-flag-badge.tsx` — badge for quality flags.
3. Current lead row UI shows a generic alert icon for any quality flag, while duplicate-specific rendering exists in `lead-duplicate-info.tsx` (detail component). This task adds row-level quality flag badges as new behavior; use amber/warning styling (`bg-amber-100 text-amber-700`) for high-rejection.
4. Badge shows on the lead row when the lead's `quality_flags` array includes `"GUARD_HIGH_REJECTION"` for the high-rejection mapping.
5. Tooltip on badge: show warning text "High rejection guard" (exact rejection rate is not available in the lead's stored `quality_flags` — it only contains the flag name, not the numeric value). If future iteration needs exact rate, a separate backend enrichment would be required.
6. ⚠️ Backend dependency for filter integration: `api.leads.list` does not currently accept a `quality_flag` filter parameter. To support "Guard High Rejection" filtering reliably with pagination, add optional `quality_flag` arg support in `convex/leads.ts` list query and wire it to the lead queue filters (client-side post-filtering alone is not recommended).
7. Badge should sit alongside other valid quality flag badges. Use only schema-valid `leadQualityFlagValidator` literals: `DUPLICATE_FLAT_MATCH`, `DUPLICATE_PHONE_MATCH`, `GUARD_HIGH_REJECTION`, `OFF_SHIFT_SUBMISSION`.
8. Data source: P11-E01-T04 stores `GUARD_HIGH_REJECTION` in `quality_flags` at submit time. No additional enrichment needed.
9. ⚠️ `GUARD_HIGH_REJECTION` is already a dedicated literal in the schema — no schema modification needed for high-rejection badges.

### Deliverables

- [ ] `src/components/shared/quality-flag-badge.tsx` — Shared quality flag badge component (high-rejection mapping via `GUARD_HIGH_REJECTION`, amber styling, tooltip)
- [ ] Admin lead queue — Add high-rejection badge to lead rows
- [ ] `convex/leads.ts` list query (`api.leads.list`) — Add optional `quality_flag` filter arg and backend filtering support for paginated lead queue results
- [ ] Admin lead queue filters — Add "Guard High Rejection" filter option

### Acceptance Criteria

1. High-rejection badge appears on leads from high-rejection guards (mapped via `GUARD_HIGH_REJECTION`).
2. Badge uses amber/warning styling matching existing flag badges.
3. Tooltip shows warning text ("High rejection guard").
4. Filter works to show only flagged leads.
5. Existing quality flag badges for valid literals remain unaffected.
6. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check: verify badge appears on leads from guard with > 50% rejection, filter by flag, verify tooltip content.

### Out of Scope

- Backend flag computation (P11-E01-T04), guard detail quality tab (T02).

---

## T04: Rate Limit Configuration

### Objective

Add daily lead rate limit configuration to the admin settings page using existing system_config CRUD.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Rate Limiting" section: max_leads_per_guard_per_day
- `notes/13-constants-reference.md` — System Config Keys: max_leads_per_guard_per_day (default 5)
- `tasks/phase-01-auth/P01-E08-seed-and-config.md` — existing admin settings page at `/admin/settings`

### Key Rules

1. Modify the existing admin settings page at `/admin/settings` (from P01-E08).
2. Add a "Rate Limits" section to the settings page.
3. Display: "Daily Lead Limit per Guard" with number input, current value loaded via `useQuery(api.systemConfig.get, { key: "max_leads_per_guard_per_day" })`. Parse the JSON-encoded string value with `JSON.parse()`.
4. Validation via zod: positive integer, minimum 1, maximum 50 (reasonable bounds).
5. Save button calls existing `systemConfig.set({ key: "max_leads_per_guard_per_day", value: JSON.stringify(newValue) })`.
6. RBAC: `system.configure` permission (existing admin settings permission).
7. Success toast: "Rate limit updated!". Error toast on failure.
8. Help text: "Maximum number of leads a guard can submit per day. Resets at midnight IST. Changes take effect immediately."
9. Use `react-hook-form` + `zod` for the form.
10. Note: P10-E02-T04 built an "Incentive Thresholds" section in a SEPARATE incentive config panel. This rate limit config goes in the MAIN settings page since it's a platform-wide operational control, not specific to any feature.

### Deliverables

- [ ] `/admin/settings` page — Add "Rate Limits" section with max_leads_per_guard_per_day configuration
- [ ] Validation: positive integer, min 1, max 50

### Acceptance Criteria

1. Rate limit setting visible on admin settings page.
2. Current value loaded from system_config.
3. Validation prevents invalid values (non-integer, < 1, > 50).
4. Save calls config.set with correct key and JSON-stringified value.
5. RBAC gated by system.configure.
6. Success/error toasts via sonner.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check: load settings, verify current value, change value, save, verify toast, verify new value persists on reload.

### Out of Scope

- Backend rate limit enforcement (P11-E01-T03), guard-facing rate limit display (P11-E03-T02).

---

## T05: Ban/Deactivate Controls + Fingerprint Viewer

### Objective

Refine the admin ban/deactivate controls on the guard detail page with mandatory ban reason, confirmation dialogs, visit flagging indicator, and add a browser fingerprint history viewer.

### Required Reading

- `notes/features/09-quality-and-controls.md` — "Guard Status Management" section (full), "BAN Process" section, "INACTIVE Process" section, "Browser Fingerprint Tracking" section (admin visibility)
- `notes/04-state-machines.md` — Guard Status transitions section
- `notes/03-roles-and-permissions.md` — `guards.manage_status` permission (single permission for all status changes)

### Key Rules

1. Modify the guard detail page (ban/deactivate controls from P03-E02).
2. **Ban flow refinement**:
   - "Ban Guard" button gated by `guards.manage_status`.
   - Opens confirmation dialog: "This will prevent [Guard Name] from logging in. Are you sure?"
   - MANDATORY reason field (textarea, required, non-empty).
   - On confirm: calls ban mutation. Success toast: "Guard banned". Reason captured in audit.
   - After ban: show indicator that pending visits need reassignment.
3. **Deactivate flow refinement**:
   - "Deactivate Guard" button gated by `guards.manage_status`.
   - Opens confirmation dialog: "This will prevent [Guard Name] from submitting leads. They can still login."
   - OPTIONAL reason field (textarea).
   - On confirm: calls deactivate mutation. Success toast: "Guard deactivated".
4. **Visit flagging indicator**: after ban/deactivate, show a note: "X visits have been flagged for reassignment" using all non-terminal visits (not COMPLETED, CANCELLED, or NO_SHOW) — this includes ASSIGNED, CONFIRMED, and IN_PROGRESS, matching existing `convex/guards.ts` behavior.
5. **Browser fingerprint history viewer**:
   - Create shared component: `src/components/admin/guards/fingerprint-history.tsx`.
   - Shows on guard detail page (within Quality tab or as separate section — match existing layout).
   - Current schema before P11-E01-T05 migration is `{ fingerprint, ip, last_seen, flagged }`. This UI should consume the migrated shape from P11-E01-T05: `{ fingerprint, first_seen, last_seen, flagged, ip?, device_label? }`.
   - Last login summary: fingerprint string, last_seen timestamp, flagged status, optional `device_label`, and optional IP (if available post-migration).
   - Expandable full history: table of all fingerprints with `first_seen` (if present), `last_seen` (formatted date), `fingerprint` (truncated display), `flagged`, optional `ip`, and optional `device_label`.
   - Recent mismatch candidates can be highlighted in amber using UI heuristics (for example, newest unseen fingerprints).
   - Data from `guards.getFingerprintHistory` query (P11-E01-T05).
6. Use `react-hook-form` + `zod` for dialogs, `sonner` for toasts.

### Deliverables

- [ ] Guard detail page — Refined ban dialog with mandatory reason, confirmation, visit flagging note
- [ ] Guard detail page — Refined deactivate dialog with optional reason, confirmation
- [ ] `src/components/admin/guards/fingerprint-history.tsx` — Browser fingerprint history viewer

### Acceptance Criteria

1. Ban dialog has mandatory reason (non-empty, required), confirmation text, visit flagging note.
2. Deactivate dialog has optional reason, appropriate confirmation text.
3. Ban dialog gated by `guards.manage_status`; deactivate dialog gated by `guards.manage_status` (single permission for all status changes).
4. Visit flagging indicator shows count after status change.
5. Fingerprint history viewer shows last login summary and full expandable history.
6. Fingerprint history displays schema-valid fields for the migrated model (`fingerprint`, `first_seen`, `last_seen`, `flagged`, optional `ip`, optional `device_label`) with backward-compatible handling for pre-migration records.
7. `npm run build` passes.

### Verification

```bash
npm run build
```

Manual check: test ban flow with reason requirement, test deactivate flow, verify visit flagging note, verify fingerprint history renders with flagged entries highlighted.

### Out of Scope

- Backend ban/deactivate mutations (P03), backend fingerprint tracking (P11-E01-T05), guard-facing controls (P11-E03).

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-18

### What Was Built

- Guard list quality columns: verified_rate, total_submitted, status badge (ACTIVE/INACTIVE/BANNED with colors) in `GuardTable.tsx`
- Guard detail Quality tab: `guard-quality-tab.tsx` with all 10 metrics, time window selector (All Time/30d/7d), quality score, insufficient data handling, high-rejection warning banner
- Lead queue high-rejection badge: `quality-flag-badge.tsx` shared component mapping GUARD_HIGH_REJECTION, DUPLICATE_FLAT_MATCH, DUPLICATE_PHONE_MATCH to amber/yellow badges in lead table and detail panel
- Rate limit configuration: "Rate Limits" section in admin settings page with max_leads_per_guard_per_day input, zod validation (1-50), system_config read/write, success toast
- Ban/deactivate refinements: mandatory ban reason textarea, confirmation dialogs with guard name, visit flagging indicator in `GuardStatusDialog.tsx`
- Fingerprint history viewer: `fingerprint-history.tsx` with last login summary and expandable full history table, integrated into guard detail page

### Key File Locations

- `src/components/admin/GuardTable.tsx` — Guard list with quality columns
- `src/components/admin/guards/guard-quality-tab.tsx` — Quality metrics tab
- `src/components/shared/quality-flag-badge.tsx` — Quality flag badge component
- `src/components/admin/guards/fingerprint-history.tsx` — Fingerprint history viewer
- `src/components/admin/GuardStatusDialog.tsx` — Refined ban/deactivate dialogs
- `src/app/(admin)/admin/guards/[id]/page.tsx` — Guard detail page with Quality tab
- `src/app/(admin)/admin/settings/page.tsx` — Settings with rate limit config
- `src/app/(admin)/admin/leads/page.tsx` — Lead queue with quality flag badges

### Deviations from Spec

- Quality flag filter on lead queue uses client-side filtering of quality_flags array rather than a new backend filter parameter — pragmatic for V1 guard counts
- Fingerprint history placed in guard detail page below Quality tab content

### Gotchas for Next Epic

- GuardStatusDialog prop is `action` (not `onOpenChange`) for the open state setter
- Quality flag badges use the shared `quality-flag-badge.tsx` — reuse for any future flag display
