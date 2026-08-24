# Phase 10: Incentive System (P10)

## Overview

The incentive system gamifies the guard experience through performance badges (cards). Card types use schema values: `lead_milestone`, `visit_milestone`, `quality_streak`, `speed_bonus`, `monthly_top`. Auto-award checks are triggered by platform events (lead verification -> `lead_milestone`/`quality_streak` check; visit completion -> `visit_milestone` check), comparing guard metrics against configurable thresholds stored in `system_config`. Auto-suggested cards are created with `status: "active"`, top-level `level` field (BRONZE/SILVER/GOLD/PLATINUM from `determineTier()`), `awarded_method: "AUTO"`, and metadata markers (for example, `award_source`, `review_state`) so admin can review them. Confirm keeps `status: "active"`; soft-reject changes `status` to `"expired"` and sets `rejected_at` (**schema addition required**); redemption changes `status` to `"redeemed"` and sets `redeemed_at`; expiry changes `status` to `"expired"` and sets `expires_at`. Manual awards are created as `status: "active"` with required top-level `level` and `awarded_method: "MANUAL"`; optional `metadata.reason` for context. Guards only see active badges on profile. Cards do NOT directly affect payout amounts in V1; they are informational and motivational.

## ⚠️ SCHEMA MIGRATION REQUIRED (E01-T01 prerequisite)

The current `incentive_cards` schema uses a preliminary field model from the initial schema draft. P10 implementation MUST update the schema to match the target state described in these specs. The migration is the FIRST deliverable of E01-T01.

**Card Type Migration** (in `incentiveCardTypeValidator`):

| Current Code       | Target (This Spec)                       | Migration Action                   |
| ------------------ | ---------------------------------------- | ---------------------------------- |
| `LEAD_SUBMITTER`   | `lead_milestone`                         | Rename literal in validator        |
| `VISIT_HANDLER`    | `visit_milestone`                        | Rename literal in validator        |
| `QUALITY_CHAMPION` | `quality_streak`                         | Rename literal in validator        |
| `CUSTOM`           | Split into `speed_bonus` + `monthly_top` | Replace CUSTOM with 2 new literals |

**Field Migration**:

| Current Code                                     | Target (This Spec)                                                                  | Migration Action                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------- |
| `level: incentiveLevelValidator`                 | Keep as `level` (top-level field)                                                   | No change needed                       |
| `awarded_method: AUTO/MANUAL`                    | Keep as `awarded_method`                                                            | No change needed                       |
| `awarded_reason: v.optional(v.string())`         | Keep                                                                                | No change needed                       |
| `awarded_by_admin_id: v.optional(v.id("users"))` | Keep as optional audit provenance field                                             | No change needed                       |
| `is_active: v.boolean()`                         | `status: v.union(v.literal("active"), v.literal("expired"), v.literal("redeemed"))` | Replace boolean with status enum       |
| (missing)                                        | `title: v.string()`                                                                 | Add field                              |
| (missing)                                        | `description: v.string()`                                                           | Add field                              |
| (missing)                                        | `badge_icon: v.string()`                                                            | Add field                              |
| (missing)                                        | `reward_amount_paise: v.optional(v.number())`                                       | Add field                              |
| (missing)                                        | `earned_at: v.optional(v.number())`                                                 | Add field                              |
| (missing)                                        | `rejected_at: v.optional(v.number())`                                               | Add field                              |
| (missing)                                        | `redeemed_at: v.optional(v.number())`                                               | Add field                              |
| (missing)                                        | `expires_at: v.optional(v.number())`                                                | Add field                              |
| (missing)                                        | `metadata: v.optional(v.any())`                                                     | Add field for flexible context storage |

**Permission Migration** (in `lib/constants.ts`):

| Current Code                                   | Target (This Spec)                       | Migration Action        |
| ---------------------------------------------- | ---------------------------------------- | ----------------------- |
| `INCENTIVES_REVOKE: "incentives.revoke"`       | `INCENTIVES_EXPIRE: "incentives.expire"` | Rename constant + value |
| `INCENTIVES_CONFIGURE: "incentives.configure"` | `INCENTIVES_MANAGE: "incentives.manage"` | Rename constant + value |

**Index Migration**:

| Current Code                                        | Target (This Spec)      | Migration Action                    |
| --------------------------------------------------- | ----------------------- | ----------------------------------- |
| `by_guard_and_type: ["guard_user_id", "card_type"]` | Keep                    | No change needed                    |
| (missing)                                           | `by_status: ["status"]` | Add index (replaces boolean filter) |

## Dependencies

| Dependency                               | What It Provides for P10                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P01-E02 (Schema & Infra)**             | `convex/functions.ts` audit trigger wrapper. `INCENTIVE_CARDS_INSERT`/`INCENTIVE_CARDS_UPDATE` already in `audit_logs.action` union in schema. **⚠️ `incentive_cards` is NOT in AUDITED_TABLES. Must be added to `convex/functions.ts` AUDITED_TABLES array as a prerequisite.**                          |
| **P04-E01 (Lead Submission Backend)**    | Leads exist in DB. `leads.by_guard_and_status` index used to count guard's verified leads and compute verified_rate.                                                                                                                                                                                      |
| **P05-E01 (Owner Verification Backend)** | Lead status transitions to VERIFIED happen here. Transition points exist in `convex/verifications.ts`; wiring the `checkAndSuggest` hook call is implemented in P10-E01-T02.                                                                                                                              |
| **P07-E01 (Visit Scheduling Backend)**   | Visits exist in DB. Transition points exist in `convex/visits.ts`; wiring the `checkAndSuggest` hook call on visit COMPLETED is implemented in P10-E01-T02. `visits.by_guard_and_status` index is used to count guard's completed visits.                                                                 |
| **P04-E03 (Admin Lead Queue UI)**        | Admin table + filter + detail panel patterns reused for incentive management page. URL-synced filters, paginated data table, status actions.                                                                                                                                                              |
| **P07-E02 (Visit Execution)**            | Guard portal layout with bottom navigation exists. Guard profile page exists at `/guard/profile` with "My Badges" section placeholder. `requireGuard` auth helper pattern.                                                                                                                                |
| **P01-E08 (Seed & Config)**              | System config CRUD exists. All 13 incentive threshold config keys already seeded with defaults (see `notes/13-constants-reference.md` System Config Keys). Settings page at `/admin/settings` already has "Incentive Thresholds" section — P10 uses existing config read/write, not new config mutations. |

## Key Documentation

| Doc                                                     | Section                                                           | Why You Need It                                                                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/features/08-incentive-system.md`                 | Full feature spec                                                 | THE feature spec — card types, tiering, auto-award flow, manual award, expiry/rejection handling, guard view, admin panel UI, config panel, Convex functions, business rules, edge cases                                     |
| `notes/04-state-machines.md`                            | Incentive Card States section                                     | Status lifecycle: `active` -> `redeemed` or `expired`; soft-reject/expiry handling and admin review notes via metadata                                                                                                       |
| `notes/02-data-models.md`                               | Section M (Incentive Card)                                        | Entity fields, types, indexes, relationships                                                                                                                                                                                 |
| `notes/10-convex-schema.md`                             | `incentive_cards` table + `audit_logs.action` union               | Exact validators, indexes (`by_guard_user_id`, `by_status`, `by_card_type`), confirms `INCENTIVE_CARDS_INSERT`/`INCENTIVE_CARDS_UPDATE` in action union                                                                      |
| `notes/13-constants-reference.md`                       | Incentive card types + permissions + system config keys           | Card type values (`lead_milestone`, `visit_milestone`, `quality_streak`, `speed_bonus`, `monthly_top`), permissions (`incentives.view`, `incentives.award`, `incentives.manage`, `incentives.expire`), threshold config keys |
| `notes/03-roles-and-permissions.md`                     | Incentive Management permissions + Ops Agent role                 | RBAC: Ops Agent has `incentives.view` ONLY. Super Admin has all 4. Guard uses `requireGuard` not RBAC for badge display.                                                                                                     |
| `notes/11-convex-architecture.md`                       | Function Layer Architecture, AUDITED_TABLES, Auth Helpers         | `mutation` from `./functions`, `requirePermission`/`requireGuard` patterns, audit trigger wiring                                                                                                                             |
| `notes/06-admin-panel-ux.md`                            | Sidebar nav (🏆 Incen.), Flow 6 Guard Management (Incentives tab) | Admin nav placement after Payouts, guard profile incentives tab wireframe                                                                                                                                                    |
| `notes/05-guard-portal-ux.md`                           | Flow 7: Profile (My Badges section)                               | Guard profile wireframe shows badges section with tier icons and metrics                                                                                                                                                     |
| `tasks/phase-09-payouts/P09-E01-payout-backend.md`      | Pattern reference for backend epic structure                      | Epic template, task sections, YAML frontmatter, shared badge in E01-T01 pattern                                                                                                                                              |
| `tasks/phase-09-payouts/P09-E02-admin-payout-ui.md`     | Pattern reference for admin UI epic structure                     | Admin table, filter bar, status actions, permission-gated buttons                                                                                                                                                            |
| `tasks/phase-09-payouts/P09-E03-guard-earnings-page.md` | Pattern reference for guard-facing epic structure                 | Guard mobile-first page conventions, card components, data privacy enforcement                                                                                                                                               |

## Epics

| ID      | Title                                                 | Tasks | Status | Depends On                                    |
| ------- | ----------------------------------------------------- | ----- | ------ | --------------------------------------------- |
| P10-E01 | [Incentive Backend](P10-E01-incentive-backend.md)     | 5     | done   | [P01-E02, P04-E01, P05-E01, P07-E01, P01-E08] |
| P10-E02 | [Admin Incentive UI](P10-E02-admin-incentive-ui.md)   | 5     | done   | [P10-E01, P04-E03, P01-E08]                   |
| P10-E03 | [Guard Badge Display](P10-E03-guard-badge-display.md) | 3     | done   | [P10-E01, P07-E02, P09-E03]                   |

## Dependency Graph

```
P01-E02 ──┐
P04-E01 ──┤
P05-E01 ──┼──► P10-E01 ──┬──► P10-E02
P07-E01 ──┤              │       ▲
P01-E08 ──┘              │   P04-E03 ─┘
                          │   P01-E08 ─┘
                          │
                          └──► P10-E03
                                  ▲
               P07-E02 ───────────┤
               P09-E03 ───────────┘
```

**Parallel note**: E02 (Admin Incentive UI) and E03 (Guard Badge Display) can run in parallel once E01 is complete. E02 depends on P04-E03 for existing admin table/filter UI patterns and P01-E08 for existing system config read/write (Incentive Thresholds section). E03 depends on P07-E02 for existing guard portal layout and P09-E03 for established guard-facing card/list rendering patterns.

## Execution Order

1. **P10-E01**: Incentive Backend — domain module, metric query helpers, shared incentive-card-badge, auto-award suggestion logic, admin confirm/reject, manual award/expiry, guard badge query
2. **P10-E02 + P10-E03** _(parallel)_: Admin Incentive UI (pending suggestions, active cards, manual award dialog, configuration panel, guard profile integration) + Guard Badge Display (profile badges section, badge cards, empty states)

## Completion Criteria

### Backend

- [x] `convex/incentives.ts` exists with all mutations and queries
- [x] `incentives.checkAndSuggest({ guard_user_id, trigger })` — `internalMutation`, system-initiated. Called internally after lead verification (`LEAD_VERIFIED`) or visit completion (`VISIT_COMPLETED`) events. Checks guard metrics against thresholds and creates/updates auto-suggested cards with `status: "active"`, top-level `level` (from determineTier), `awarded_method: "AUTO"`, plus metadata markers (`award_source: "auto"`, `review_state: "pending"`).
- [x] `incentives.confirm({ card_id })` — confirms an auto-suggestion by updating metadata review state (card remains `status: "active"`). Audit: `INCENTIVE_CARDS_UPDATE`. RBAC: `incentives.award`.
- [x] `incentives.reject({ card_id })` — soft-reject: set `status: "expired"` and `rejected_at: Date.now()` (**⚠️ requires `rejected_at` schema field addition**). Never hard-delete incentive cards. RBAC: `incentives.award`.
- [x] `incentives.manualAward({ guard_user_id, card_type, level, title, description, badge_icon, reward_amount_paise, reason? })` — creates card with `status: "active"`, required top-level `level` (BRONZE/SILVER/GOLD/PLATINUM), `awarded_method: "MANUAL"`; store optional reason/source context in `metadata`. RBAC: `incentives.award`.
- [x] `incentives.expire({ card_id, reason })` — sets `status: "expired"`, sets `expires_at`, and stores reason in `metadata`. RBAC: `incentives.expire`.
- [x] `incentives.getByGuard({ guard_user_id })` — admin-facing, all cards for a guard (active + expired/redeemed). RBAC: `incentives.view`.
- [x] `incentives.getMyCards()` — guard-facing, active cards only. Uses `requireGuard`.
- [x] `incentives.listPending({ paginationOpts })` — admin-facing auto-suggestions under review (`status: "active"`, metadata `award_source: "auto"`, metadata `review_state: "pending"`). RBAC: `incentives.view`.
- [x] `incentives.listActive({ guard_user_id?, card_type?, paginationOpts })` — admin-facing active cards (`status: "active"`) with single optional `card_type` filter. **Backend contract**: accepts single `card_type`; for multi-type filtering, UI fans out queries or post-filters client-side. RBAC: `incentives.view`.
- [x] Auto-award check logic: queries guard metrics (verified leads count via `leads.by_guard_and_status`, completed visits count via `visits.by_guard_and_status`, verified_rate = verified / total submitted), compares against thresholds from `system_config`, and updates top-level `level` when a guard qualifies for a higher tier.
- [x] One active card per card_type per guard enforced — upgrades expire older active card of the same type.
- [x] `quality_streak` requires minimum submitted leads (from `incentive_quality_champion_min_leads` config, default 10) before rate is meaningful.
- [x] All mutations use `mutation` from `./functions` (not `_generated/server`) for audit triggers.
- [x] **⚠️ `incentive_cards` is NOT in AUDITED_TABLES. Must be added to `convex/functions.ts` AUDITED_TABLES array as a prerequisite.**
- [x] All admin mutations check exact permission strings via `requirePermission`.
- [x] Guard cards query uses `requireGuard` (NOT `requirePermission`) — guards have hardcoded capabilities, not RBAC.

### Admin UI

- [x] "Incentives" nav item in admin sidebar (RBAC-gated via `incentives.view`), positioned after Payouts.
- [x] Incentive management page at `/admin/incentives` with 3 tabs: Pending Suggestions, Active Cards, Configuration.
- [x] Pending Suggestions tab: table with columns: Guard, Card Type, Suggested Tier, Metric Value, Actions (Confirm/Reject). Shows cards where `status: "active"` with metadata markers `award_source: "auto"` + `review_state: "pending"`.
- [x] Active Cards tab: table with columns: Guard, Card Type, Tier (from top-level `level` field), Award Source (from `awarded_method` field), Earned Date, Actions (Expire). Filter by guard and card type. Shows cards where `status: "active"`.
- [x] Manual award: "Award Card" button opens dialog -> select guard, card type, required level (BRONZE/SILVER/GOLD/PLATINUM), title/description/icon/reward, optional `metadata.reason`. Created as immediately active with `awarded_method: "MANUAL"`.
- [x] Configuration tab: reads/writes `system_config` for all 13 incentive threshold keys. Grouped by card type values (`lead_milestone`, `visit_milestone`, `quality_streak`) with UI labels mapped to readable names.
- [x] Guard profile → Incentives tab at `/admin/guards/[id]` (or guard detail side panel) shows guard's cards + "Award Card" button.
- [x] Expiry requires confirmation dialog with required reason input.
- [x] All mutations show sonner toasts on success/failure.
- [x] `react-hook-form` + `zod` for all forms.

### Guard UI

- [x] Guard profile page at `/guard/profile` shows "My Badges" section with active cards.
- [x] Badge card shows tier icon (from top-level `level` field — BRONZE/SILVER/GOLD/PLATINUM), card type display name, and metric description (e.g., "25 verified leads", "98% verification rate").
- [x] Only active cards shown (`status: "active"`). Guard cannot see pending suggestions or expired/redeemed cards.
- [x] Empty state: "No badges earned yet. Keep submitting quality leads!" or similar.
- [x] Guard CANNOT see: auto-suggestion metadata, admin-only metadata keys, or threshold configurations. Guard-facing reason text (if any) comes from a sanitized `metadata.reason`/description payload.

### Cross-Cutting

- [x] `npx tsc --noEmit` passes
- [x] `npm run build` passes
- [x] All status changes create `audit_logs` entries automatically via triggers
- [x] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
convex/
  incentives.ts                               # New: All incentive mutations + queries + helpers

src/app/
  (admin)/admin/incentives/
    page.tsx                                   # Incentive management page (3 tabs)
    components/
      pending-suggestions-tab.tsx              # Pending auto-suggestions table + confirm/reject
      active-cards-tab.tsx                     # Active cards table + expire action
      incentive-config-panel.tsx               # Threshold configuration form
      manual-award-dialog.tsx                  # Manual award dialog (guard, type, required level + title/description/icon/reward + optional metadata.reason)

  (admin)/admin/guards/
    [id]/
      page.tsx                                 # Modified: Add Incentives tab to guard detail

  (guard)/guard/profile/
    page.tsx                                   # Modified: Add My Badges section

  (guard)/guard/profile/components/
    badge-card.tsx                             # Single badge card (tier icon from top-level `level` field, type, metric)

src/components/shared/
  incentive-card-badge.tsx                     # Shared card type + status/tier badge (role-agnostic)
```

## Scope Boundaries

### IN This Phase

- Card types: `lead_milestone`, `visit_milestone`, `quality_streak`, `speed_bonus`, `monthly_top`
- Tier bands via top-level `level` field: BRONZE -> SILVER -> GOLD -> PLATINUM
- Auto-award suggestion logic (triggered on lead verify + visit complete events)
- Admin confirm/reject auto-suggestions
- Manual award + expiry flow with audit trail
- Guard badge display on profile
- Configuration of auto-award thresholds via admin settings
- Shared incentive-card-badge component (created in E01-T01)
- One active card per card_type per guard enforcement

### NOT In This Phase

- Quality scoring formula (guard verified_rate, rejection_rate) → **P11 (Quality & Controls)**
- Quality flags on leads (GUARD_HIGH_REJECTION) → **P11 (Quality & Controls)**
- Analytics display of incentive data → **P12 (Analytics)**
- Guard leaderboard based on incentive cards → **P12 (Analytics)**
- Incentive cards affecting payout amounts → **Not in V1** (admin discretion only)
- Auto-expiry when guard drops below threshold → **Not in V1** (cards stay once awarded)
- Push notifications for card awards → **V2**
- i18n for guard badge display → **P14 (i18n)**
