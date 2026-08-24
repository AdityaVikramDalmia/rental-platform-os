# Phase 11: Quality & Controls (P11)

## Overview

Quality & Controls gives admins full visibility into guard performance and the tools to act on it. Ten quality metrics per guard (`total_submitted`, `verified_count`, `rejected_count`, `duplicate_count`, `verified_rate`, `rejection_rate`, `duplicate_rate`, `completed_visits`, `no_show_count`, `visit_completion_rate`) are computed in real-time via Convex queries across three time windows (all-time, last 30 days, last 7 days) with no cached snapshots. Guards with fewer than 5 total submissions show "Insufficient data" instead of misleading percentages.

The daily lead submission limit is made configurable via `system_config` (replacing the hardcoded value from P04), with a fixed reset at midnight IST. Guard status management (ACTIVE/INACTIVE/BANNED) is refined: banning requires a mandatory reason, triggers WorkOS suspension, and flags all non-terminal visits (ASSIGNED, CONFIRMED, IN_PROGRESS) for reassignment in a single Convex Action. Deactivation is softer: guard can still login and view history, but cannot submit leads or handle visits.

A high-rejection signal is represented as `GUARD_HIGH_REJECTION` when a guard's `rejection_rate` exceeds 50%, surfacing a badge on the admin lead queue. The de-dup quality flag mapping remains schema-valid and uppercase: same-flat -> `DUPLICATE_FLAT_MATCH`, same-phone -> `DUPLICATE_PHONE_MATCH`. `OFF_SHIFT_SUBMISSION` already exists in the schema but stays out of V1 implementation (V2 feature; requires GPS capture).

The 48px sticky amber rule banner is added to the guard portal layout (non-dismissable, always rendered, translated in English/Hindi/Hinglish). Browser fingerprint tracking is captured on guard login and stored in `guard_profiles.browser_fingerprints`. Current schema shape is `{ fingerprint: string, ip: string, last_seen: number, flagged: boolean }`; P11-E01-T05 migrates it to add `first_seen`, add optional `device_label`, and make `ip` optional. Mismatches are review-only and never block login.

P11 also computes and persists `guard_profiles.quality_score` using configurable weights from `system_config.quality_score_weights` and applies `system_config.min_quality_score_for_incentives` when incentive eligibility is evaluated. P11 creates no new database tables - it extends `convex/guards.ts` (or extracts a `convex/quality.ts` helper) and modifies `convex/leads.ts` to replace the hardcoded rate limit with a `system_config` read.

## Dependencies

| Dependency                               | What It Provides for P11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P01-E02 (Schema & Infra)**             | `convex/functions.ts` audit trigger wrapper. `guard_profiles` is already in schema with `browser_fingerprints` array field. Guard status changes are captured via `GUARD_PROFILES_UPDATE` / `USERS_UPDATE` audit entries (the audit system uses `{TABLE}_{OPERATION}` actions, not custom event names - ban reason goes in audit metadata). **⚠️ Drift risk**: executing agent must verify `guard_profiles`, `leads`, `payouts`, and `incentive_cards` are in `AUDITED_TABLES` in the actual `convex/functions.ts` - add missing entries. Also verify `payouts` and `incentive_cards` are in `AUDITED_TABLES` (they are NOT currently - should have been added by P09 and P10). |
| **P03-E01 (Guard Management Backend)**   | Guard profiles exist with status transitions (ACTIVE/INACTIVE/BANNED). Ban and deactivate mutations exist. WorkOS suspension Action exists in `convex/actions/workos.ts`. P11 REFINES the ban process (mandatory reason enforcement, visit flagging in one Action) but does NOT rebuild it from scratch. Use `guards.manage_status` for all guard status changes (ban, unban, deactivate, reactivate).                                                                                                                                                                                                                                                                          |
| **P04-E01 (Lead Submission Backend)**    | Leads exist with daily rate limit enforcement via `rateLimiter.limit(...)` in `leads.create`; the active hardcoded 5/day cap is configured in `convex/rateLimiter.ts` under `guard:lead_submission` (24h fixed window). `leads.by_submitted_by_guard_id` index used for daily count. `leads.by_guard_and_status` index used for metric computation. **⚠️ Drift risk**: executing agent must verify both `convex/rateLimiter.ts` and the `leads.create` callsite are migrated together for configurable daily limits.                                                                                                                                                            |
| **P05-E01 (Owner Verification Backend)** | Lead status transitions to VERIFIED and REJECTED happen here. These transitions produce the data that quality metrics aggregate (`verified_count`, `rejected_count`, `verified_rate`, `rejection_rate`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **P07-E01 (Visit Scheduling Backend)**   | Visits exist with status transitions to COMPLETED and NO_SHOW. `visits.by_guard_and_status` index used for visit metric computation (`completed_visits`, `no_show_count`, `visit_completion_rate`). `needs_reassignment` flag on visits is set here when guard is banned or deactivated.                                                                                                                                                                                                                                                                                                                                                                                        |
| **P01-E08 (Seed & Config)**              | System config CRUD exists. `max_leads_per_guard_per_day` config key already seeded with default value of 5. Settings page at `/admin/settings` exists. P11 adds a rate limit configuration section to this existing page - no new config mutations needed.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **P09-E01 (Payout Backend)**             | After P09 implementation lands, `payouts.getGuardEarnings` should exist as a guard-facing read query and must be migrated from `requireGuard` to `requireGuardAuth` so INACTIVE guards can view earnings history.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **P10-E01 (Incentive Backend)**          | After P10 implementation lands, `incentives.getMyCards` should exist as a guard-facing read query and must be migrated from `requireGuard` to `requireGuardAuth` so INACTIVE guards can view incentive cards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Key Documentation

| Doc                                         | Section                                                                                           | Why You Need It                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/features/09-quality-and-controls.md` | Full feature spec                                                                                 | THE feature spec - quality metrics (10 metrics, 3 time windows), rate limits (IST midnight reset, configurable), guard status capabilities matrix, ban process, rule banner (3 languages), browser fingerprints, Convex functions, business rules, edge cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `notes/04-state-machines.md`                | Guard Status section                                                                              | Status transitions: ACTIVE<->INACTIVE, ACTIVE->BANNED, INACTIVE->BANNED, BANNED->ACTIVE/INACTIVE. Mandatory reason for ban.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `notes/02-data-models.md`                   | Guard Profile entity                                                                              | `guard_profiles` fields including `browser_fingerprints` array structure, indexes, relationships                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `notes/10-convex-schema.md`                 | `guard_profiles` table, `leads` table indexes, `visits` table indexes                             | Exact validators for `browser_fingerprints` field, `leads.by_guard_and_status` and `leads.by_submitted_by_guard_id` indexes, `visits.by_guard_and_status` index for metric computation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `notes/13-constants-reference.md`           | Quality Flags, Guard/User Status, Guard Management permissions, System Config Keys, audit actions | Valid current `leadQualityFlagValidator` literals are `DUPLICATE_FLAT_MATCH`, `DUPLICATE_PHONE_MATCH`, `GUARD_HIGH_REJECTION`, `OFF_SHIFT_SUBMISSION` (all uppercase, all already in schema). De-dup mapping is same-flat -> `DUPLICATE_FLAT_MATCH`, same-phone -> `DUPLICATE_PHONE_MATCH`. `OFF_SHIFT_SUBMISSION` remains a V2 implementation item because it requires GPS capture, even though the literal already exists. Guard status management uses `guards.manage_status` for ban/unban/deactivate/reactivate. Use `max_leads_per_guard_per_day` for daily lead limits. ⚠️ `quality_score_weights` and `min_quality_score_for_incentives` do not exist in current `SYSTEM_CONFIG_KEYS`; P11 must add them in `lib/constants.ts` and seed defaults in `convex/seed.ts`. |
| `notes/03-roles-and-permissions.md`         | Guard Management permissions                                                                      | Guard status changes should be gated by `guards.manage_status` (single permission for ban/unban/deactivate/reactivate). Guard portal access uses `requireGuard`/`requireGuardAuth` (not RBAC).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `notes/11-convex-architecture.md`           | Function Layer Architecture, Auth Helpers                                                         | `mutation` from `./functions`, `requirePermission`/`requireGuard` patterns, audit trigger wiring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `notes/06-admin-panel-ux.md`                | Flow 6: Guard Management                                                                          | Guard detail page wireframe, quality metrics tab placement, ban dialog wireframe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `notes/05-guard-portal-ux.md`               | Guard portal conventions, rule banner                                                             | 48px sticky amber rule banner spec, mobile-first layout conventions, guard portal layout structure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Previous phase pattern references           | P10/P09 epic files                                                                                | Backend epic, admin UI epic, guard-facing epic structural patterns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Epics

| ID      | Title                                                                    | Tasks | Status | Depends On                                                               |
| ------- | ------------------------------------------------------------------------ | ----- | ------ | ------------------------------------------------------------------------ |
| P11-E01 | [Quality Metrics & Controls Backend](P11-E01-quality-metrics-backend.md) | 5     | done   | [P01-E02, P03-E01, P04-E01, P05-E01, P07-E01, P01-E08, P09-E01, P10-E01] |
| P11-E02 | [Admin Quality UI](P11-E02-admin-quality-ui.md)                          | 5     | done   | [P11-E01, P04-E03, P03-E02]                                              |
| P11-E03 | [Guard Controls & Rule Banner](P11-E03-guard-controls.md)                | 3     | done   | [P11-E01, P07-E02, P04-E04, P09-E03]                                     |

**Phase Status**: ✅ **DONE** — All 3 epics complete, all 13 tasks done, `npx tsc --noEmit` and `npm run build` pass.

## Dependency Graph

```
P01-E02 --┐
P03-E01 --┤
P04-E01 --┼--> P11-E01 --┬--> P11-E02
P05-E01 --┤              │      ▲
P07-E01 --┤              │  P04-E03 --┘
P01-E08 --┤              │  P03-E02 --┘
P09-E01 --┤              │
P10-E01 --┘              │
                          │
                          └--> P11-E03
                                  ▲
                              P07-E02 --┘
                              P04-E04 --┘
                              P09-E03 --┘
```

**Parallel note**: E02 (Admin Quality UI) and E03 (Guard Controls & Rule Banner) can run in parallel once E01 is complete. E02 depends on P04-E03 for existing admin table/filter UI patterns and P03-E02 for the existing guard detail page where the Quality tab is added. E03 depends on P07-E02 for the existing guard portal layout (where the rule banner is inserted), P04-E04 for the existing guard lead submission UI (where the remaining leads counter is added), and P09-E03 to ensure Earn/earnings pages are included in full banner coverage.

## Execution Order

1. **P11-E01**: Quality Metrics & Controls Backend - quality metrics query, quality score computation, leaderboard query, configurable rate limit, guard-facing remaining leads query, `GUARD_HIGH_REJECTION` quality flag for high rejection, browser fingerprint capture and mismatch detection
2. **P11-E02 + P11-E03** _(parallel)_: Admin Quality UI (guard list columns, guard detail Quality tab, lead queue badges, rate limit config, ban/deactivate refinements, fingerprint history viewer) + Guard Controls & Rule Banner (48px sticky amber rule banner, rate limit display on submission form, ACTIVE/INACTIVE/BANNED enforcement)

## Completion Criteria

### Backend

- [x] `guards.getMetrics({ guard_user_id, time_window? })` - query returning all 10 metrics for a guard across the requested time window (all-time, last 30 days, last 7 days). Returns `null` rates (not percentages) when `total_submitted < 5` ("Insufficient data"). RBAC: `quality.view`. ⚠️ `quality.view` does not exist in current `lib/constants.ts`; P11 must add it to `PERMISSIONS` and seed it to admin roles before using it in RBAC gates.
- [x] `guards.getLeaderboard({ society_id?, metric, limit })` - query returning top guards sorted by the requested metric, optionally filtered by society. RBAC: `quality.view`.
- [x] `guards.getRemainingLeads()` - guard-facing query, no args, uses `requireGuardAuth` (NOT `requireGuard` - INACTIVE guards must see the counter). Returns `{ submitted_today: number, limit: number, remaining: number }`. Reads limit from `system_config.max_leads_per_guard_per_day`. Count uses IST midnight as window start.
- [x] `leads.create` daily cap migration completed: reads `max_leads_per_guard_per_day` from `system_config` instead of hardcoded value. IST midnight reset via `getStartOfDayIST()` helper. Throws descriptive error on limit reached.
- [x] High-rejection quality flag on lead submission: if guard's `rejection_rate > 50%` (and `total_submitted >= 5`), add `GUARD_HIGH_REJECTION` to `quality_flags` (computed inline in `leads.create`, NOT via trigger).
- [x] Browser fingerprint capture: on guard login, capture composite fingerprint string and update `guard_profiles.browser_fingerprints`. Current schema shape is `{ fingerprint: string, ip: string, last_seen: number, flagged: boolean }`; P11-E01-T05 migrates this shape to add `first_seen`, add optional `device_label`, and make `ip` optional.
- [x] Fingerprint mismatch detection is review-only and never blocks login.
- [x] All 10 metrics computed real-time via queries - NOT cached snapshots. No new tables created.
- [x] `guards.getMetrics` uses `leads.by_guard_and_status` index for lead counts and `visits.by_guard_and_status` index for visit counts.
- [x] Time window filtering: `all-time` (no date filter), `30d` (creationTime >= now - 30 days), `7d` (creationTime >= now - 7 days).
- [x] `guard_profiles.quality_score` computed and stored using `system_config.quality_score_weights` (default weights: lead_approval_rate 40%, visit_completion_rate 30%, flag_frequency 20%, speed_bonus 10%), recomputed on each lead status change and visit completion. Incentive checks use `system_config.min_quality_score_for_incentives`. ⚠️ These config keys do not exist in current `SYSTEM_CONFIG_KEYS`; P11 must add them to `lib/constants.ts` and seed default values in `convex/seed.ts`.
- [x] Ban process refinement: `suspendGuard` Action enforces mandatory reason (throws if reason is empty or missing), sets guard status to BANNED, suspends WorkOS user, and flags all non-terminal visits (ASSIGNED, CONFIRMED, IN_PROGRESS) with `needs_reassignment = true` - all in one Action call.
- [x] All mutations use `mutation` from `./functions` (not `_generated/server`) for audit triggers.
- [x] All admin queries/mutations check exact permission strings via `requirePermission`.
- [x] Guard-facing read queries use `requireGuardAuth` (allows INACTIVE guards to read). Guard-facing write mutations use `requireGuard` (requires ACTIVE). Neither uses `requirePermission`.
- [x] `requireGuardAuth(ctx)` helper added to `convex/auth.helpers.ts` - checks `user_type === "GUARD"` without enforcing ACTIVE status. BANNED guards are already blocked by `requireAuth`.

### Admin UI

- [x] Guard list table: add `verified_rate` column and `total_submitted` column. Status badge shows ACTIVE/INACTIVE/BANNED with appropriate colors.
- [x] Guard detail page at `/admin/guards/[id]`: add Quality tab with full metrics dashboard showing all 10 metrics. Time window selector (All Time / Last 30 Days / Last 7 Days) switches the displayed data.
- [x] Lead queue: high-rejection badge rendered using `GUARD_HIGH_REJECTION` where applicable. Badge is filterable (filter bar option to show only flagged leads).
- [x] Rate limit configuration in admin settings page: input field for `max_leads_per_guard_per_day` with save button. Reads/writes via existing `system_config` mutations.
- [x] Ban dialog: mandatory reason text input (required, non-empty). Confirmation dialog shows guard name and warns about WorkOS suspension and visit reassignment. Submit disabled until reason is entered.
- [x] Deactivate dialog: optional reason field. Confirmation dialog shows guard name and warns about visit reassignment.
- [x] Fingerprint history viewer on guard detail page: current schema fields are `fingerprint`, `ip`, `last_seen`, `flagged`; after P11-E01-T05 migration include `first_seen` and optional `device_label` (with `ip` optional). Accessible from guard detail page (Security or Quality tab).
- [x] Real-time updates via Convex subscriptions on all admin views.
- [x] `react-hook-form` + `zod` for all forms, `sonner` for all toasts.

### Guard UI

- [x] 48px sticky amber rule banner rendered on every guard portal page - inserted in `(guard)/layout.tsx`, below nav, above page content. Always rendered, never conditional, no dismiss button.
- [x] Rule banner text pulled from i18n translation files (`en.json`, `hi.json`, `hinglish.json`) based on guard's language preference. Content matches the exact text in `notes/features/09-quality-and-controls.md` for all three languages.
- [x] Lead submission form shows remaining leads counter: "X of Y leads today". Reads from `guards.getRemainingLeads()` query.
- [x] When limit is reached, submission form shows friendly message: "You've submitted Y leads today. Come back tomorrow!" Submit button disabled.
- [x] ACTIVE/INACTIVE/BANNED status enforcement verified: INACTIVE guards cannot access lead submission or visit execution routes. BANNED guards cannot login (WorkOS suspension handles this at auth layer).

### Cross-Cutting

- [x] `npx tsc --noEmit` passes
- [x] `npm run build` passes
- [x] All status changes create `audit_logs` entries automatically via triggers
- [x] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
convex/
  guards.ts                              # Modified: Add getMetrics, getLeaderboard, getRemainingLeads queries
  leads.ts                               # Modified: Replace hardcoded rate limit with system_config read, add high-rejection GUARD_HIGH_REJECTION flag
  quality.ts                             # New (optional): Quality metric helper functions if guards.ts gets too large

src/app/
  (admin)/admin/guards/[id]/
    page.tsx                             # Modified: Add Quality tab with metrics dashboard

  (admin)/admin/settings/
    page.tsx                             # Modified: Add rate limit configuration section

  (guard)/
    layout.tsx                           # Modified: Add 48px sticky amber rule banner

  (guard)/guard/submit-lead/
      page.tsx                           # Modified: Add remaining leads counter

src/components/admin/guards/
  guard-quality-tab.tsx                  # Shared admin guard quality tab component
  fingerprint-history.tsx                # Shared admin guard fingerprint history component

src/components/shared/
  quality-flag-badge.tsx                 # Quality flag badge component (maps schema-valid quality flag literals)
  rule-banner.tsx                        # Guard rule banner component (3 languages)

messages/
  en.json                               # Modified: Add rule banner translation
  hi.json                               # Modified: Add rule banner translation (Hindi)
  hinglish.json                         # Modified: Add rule banner translation (Hinglish)
```

## Scope Boundaries

### IN This Phase

- Quality metrics per guard (10 metrics, 3 time windows, real-time computed)
- Guard leaderboard query (society-filterable, metric-sortable)
- Configurable rate limits (system_config-based, IST midnight reset)
- High-rejection signal on leads mapped to `GUARD_HIGH_REJECTION` (`rejection_rate > 50%`, minimum 5 submissions)
- Guard rule banner (48px sticky amber, non-dismissable, 3 languages)
- Browser fingerprint tracking (capture on login, store in guard_profiles, flag mismatches)
- Admin quality UI (guard list columns, guard detail Quality tab, lead queue badges)
- Rate limit config in admin settings
- Ban/deactivate flow refinement (mandatory reason for ban, visit flagging in one Action)
- Guard-facing rate limit display on submission form

### NOT In This Phase

- Analytics dashboard for quality data -> **P12 (Analytics)**
- `OFF_SHIFT_SUBMISSION` implementation -> **V2** (requires GPS, not web V1). The literal already exists in schema, but collection logic is deferred.
- Auto-ban or auto-freeze based on quality scores -> **Not in V1** (all status changes are manual admin decisions per Business Rule #2)
- Per-society or per-guard rate limit overrides -> **Not in V1** (Future Considerations in feature spec)
- Dynamic limits based on quality score -> **Not in V1**
- Quality scoring affecting payout amounts -> **Not in V1**
- i18n for admin quality UI -> **English only** (admin panel is hardcoded English per convention)
