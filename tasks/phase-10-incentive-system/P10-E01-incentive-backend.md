---
id: P10-E01
title: Incentive Backend
phase: 10
status: done
depends_on: ["P01-E02", "P04-E01", "P05-E01", "P07-E01", "P01-E08"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P10-E01: Incentive Backend

## Overview

Implement the incentive system backend foundation for Phase 10: create the `convex/incentives.ts` domain module, implement guard metric query helpers for counting verified leads, completed visits, and computing verified_rate, create the shared `incentive-card-badge.tsx` component so E02 and E03 can consume it without hidden dependencies, implement auto-award suggestion logic triggered when leads are verified or visits completed, add admin confirm/reject mutations for auto-suggestions, add manual award and expiry mutations, and implement the guard-facing badge query with data privacy enforcement. Lifecycle is status-driven (`active`/`redeemed`/`expired`) rather than boolean-driven. Auto-suggested cards are created with `status: "active"` plus metadata review markers; confirm keeps `status: "active"`; soft-reject sets `status: "expired"` plus `rejected_at` (schema addition required). One active card per card_type per guard is enforced.

## Prerequisites

- **Read first**: [P01-E02 Completion Summary](../phase-01-auth/P01-E02-schema-and-infra.md#completion-summary) — **⚠️ `incentive_cards` is NOT in AUDITED_TABLES. Must be added to `convex/functions.ts` AUDITED_TABLES array as a prerequisite.**
- **Read first**: [P01-E08 Completion Summary](../phase-01-auth/P01-E08-seed-and-config.md#completion-summary) — system config CRUD exists. All 13 incentive threshold config keys already seeded with defaults. Threshold read functions already available.
- **Read first**: Leads exist from P04. Lead verification (SUBMITTED → VERIFIED transition) is in P05 — Visits exist from P07. Their indexes are used for metric computation. **Note**: The auto-award hook (`checkAndSuggest`) is NOT yet wired — wiring into `convex/verifications.ts` and `convex/visits.ts` is delivered in P10-E01-T02.

## Task Queue

- [x] P10-E01-T01: Incentive Domain Module + Metric Helpers + Shared Badge
- [x] P10-E01-T02: Auto-Award Suggestion Logic
- [x] P10-E01-T03: Admin Confirm + Reject Auto-Suggestions + Admin Queries
- [x] P10-E01-T04: Manual Award + Expiry
- [x] P10-E01-T05: Guard Badge Query

---

## T01: Incentive Domain Module + Metric Helpers + Shared Badge

### Objective

Create the incentive module scaffold, implement guard metric query helpers (verified lead count, completed visit count, verified_rate), and create a role-agnostic shared incentive card badge component in E01 so E02 admin UI and E03 guard display can consume it.

### Required Reading

- `notes/04-state-machines.md` — "Incentive Card States" section (status lifecycle)
- `notes/10-convex-schema.md` — `incentive_cards` table definition and `audit_logs.action` union
- `notes/11-convex-architecture.md` — "Function Layer Architecture" (mutation import, AUDITED_TABLES)
- `notes/13-constants-reference.md` — Incentive card types, status values, and incentive permissions (`incentives.view`, `incentives.award`, `incentives.manage`, `incentives.expire`)
- `notes/features/08-incentive-system.md` — "Card Types" table, tier progression notes, metric definitions
- `tasks/phase-09-payouts/P09-E01-payout-backend.md` — T01 pattern for shared badge creation

### Key Rules

1. Create `convex/incentives.ts` as the incentive domain module and keep all incentive backend functions in this file.
2. Import `mutation` from `./functions` (audit-enabled path) and import `query` from `./_generated/server` — same pattern as `convex/payouts.ts`.
3. Implement `getGuardMetrics(ctx, guard_user_id)` helper returning `{ verified_leads_count, total_submitted_leads_count, completed_visits_count, verified_rate }`. Use `leads.by_guard_and_status` index (fields: `["submitted_by_guard_id", "status"]` — **note: the index field is `submitted_by_guard_id`, NOT `guard_user_id`**) to count VERIFIED leads and total submitted leads. Use `visits.by_guard_and_status` index (fields: `["assigned_guard_id", "status"]` — **the index field is `assigned_guard_id`**) to count COMPLETED visits.
4. verified_rate = verified_leads_count / total_submitted_leads_count (as percentage 0-100). Handle division by zero (0 leads → rate is 0).
5. Implement `getThresholds(ctx, card_type)` helper that reads from `system_config` for threshold bands used to compute the top-level `level` field (BRONZE/SILVER/GOLD/PLATINUM progression for milestone/quality logic). Also read `incentive_quality_champion_min_leads` for `quality_streak` eligibility.
6. Implement `determineTier(metricValue, thresholds)` helper that returns the highest qualifying tier (`platinum`, `gold`, `silver`, `bronze`), or `null` if below threshold.
7. Create `src/components/shared/incentive-card-badge.tsx` in E01 (not E02 or E03) to avoid hidden dependency.
8. Badge displays card type display name + tier icon (from top-level `level` field — BRONZE/SILVER/GOLD/PLATINUM). Card type display mapping must use schema values: `lead_milestone` -> "Lead Milestone", `visit_milestone` -> "Visit Milestone", `quality_streak` -> "Quality Streak", `speed_bonus` -> "Speed Bonus", `monthly_top` -> "Monthly Top".
9. Badge should also show `status` indicator (`active`, `redeemed`, `expired`) for admin views.
10. **⚠️ `incentive_cards` is NOT in AUDITED_TABLES. Must be added to `convex/functions.ts` AUDITED_TABLES array as a prerequisite.**
11. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `convex/incentives.ts` — Create module skeleton with required imports, `getGuardMetrics` helper, `getThresholds` helper, `determineTier` helper
- [ ] `convex/functions.ts` — Verify `incentive_cards` in `AUDITED_TABLES`; add if missing
- [ ] `src/components/shared/incentive-card-badge.tsx` — Shared role-agnostic badge with card type + status/tier display

### Acceptance Criteria

1. `convex/incentives.ts` exists and imports `mutation` from `./functions` plus `query` from `./_generated/server`.
2. `getGuardMetrics` returns correct counts using proper indexes.
3. `getThresholds` reads the configured threshold bands required for the selected card type. For `quality_streak`, it also reads `incentive_quality_champion_min_leads`.
4. `determineTier` returns highest qualifying tier (`platinum` first, then `gold`, `silver`, `bronze`). Returns `null` if below minimum threshold.
5. `incentive-card-badge.tsx` renders all 5 card types with correct display names and status/tier presentation.
6. Badge is role-agnostic (no admin-only or guard-only imports).
7. `incentive_cards` is present in `AUDITED_TABLES` after this task.
8. `npx tsc --noEmit` passes.
9. Schema migration complete: card types are `lead_milestone/visit_milestone/quality_streak/speed_bonus/monthly_top`.
10. `is_active` replaced with `status: active/expired/redeemed`.
11. New fields present: `title`, `description`, `badge_icon`, `reward_amount_paise`, `earned_at`, `rejected_at`, `redeemed_at`, `expires_at`, `metadata`.
12. `by_status` index added.
13. Permission constants renamed: `incentives.expire` and `incentives.manage` in `lib/constants.ts`.

### Verification

```bash
npx tsc --noEmit
```

Manual check: validate schema migration, metric helpers, and run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, `convex/incentives.ts`, `convex/functions.ts`, and `src/components/shared/incentive-card-badge.tsx`.

### Out of Scope

- Auto-award suggestion logic, admin confirm/reject, manual award, guard-facing query.

---

## T02: Auto-Award Suggestion Logic

### Objective

Implement the auto-award check function that queries guard metrics, compares against configurable thresholds, and creates/updates auto-suggested incentive cards for admin review. This function is called internally after lead verification and visit completion events.

### Required Reading

- `notes/features/08-incentive-system.md` — "Auto-Award Logic" section (when to check, auto-award flow steps 1-7)
- `notes/13-constants-reference.md` — System Config Keys for all 13 incentive thresholds
- `notes/10-convex-schema.md` — `incentive_cards` indexes: `by_guard_user_id`, `by_status`, `by_card_type`

### Key Rules

1. Create `incentives.checkAndSuggest` as an `internalMutation` (called by other domain mutations, not directly by frontend).
2. Args: `{ guard_user_id: v.id("users"), trigger: v.union(v.literal("LEAD_VERIFIED"), v.literal("VISIT_COMPLETED")) }`.
3. On `LEAD_VERIFIED` trigger: check `lead_milestone` (count of verified leads) + `quality_streak` (verified_rate if total leads >= min_leads threshold).
4. On `VISIT_COMPLETED` trigger: check `visit_milestone` (count of completed visits).
5. For each card_type checked: query guard cards via `incentive_cards.by_guard_user_id`, then filter in application code by `card_type` and `status`.
6. Create auto-suggestion card records with ALL required schema fields: `{ guard_user_id, card_type, level, awarded_method: "AUTO", title, description, badge_icon, reward_amount_paise, status: "active", earned_at, metadata }`. The `level` field (top-level, BRONZE/SILVER/GOLD/PLATINUM) is derived from `determineTier()` — it is a REQUIRED schema field, not metadata. `awarded_method` is set to `"AUTO"` for all auto-suggestions. Store additional provenance context (review state, metric snapshot, reason text) inside `metadata`.
7. Do NOT auto-check manual bonus types (`speed_bonus`, `monthly_top`).
8. If guard already has an active auto-suggestion under review for the same card_type at the same or higher tier (compare top-level `level` field precedence: PLATINUM > GOLD > SILVER > BRONZE), do NOT create a duplicate.
9. Wire the auto-award check into lead verification: when a lead transitions to VERIFIED, call `incentives.checkAndSuggest` with `trigger: "LEAD_VERIFIED"` for the submitting guard. This requires modifying the lead verification mutation in `convex/verifications.ts` (P05-E01 — canonical location for lead->VERIFIED transitions) to call `ctx.runMutation(internal.incentives.checkAndSuggest, ...)` after status change.
10. Wire into visit completion: when a visit transitions to COMPLETED, call `incentives.checkAndSuggest` with `trigger: "VISIT_COMPLETED"` for the assigned guard. This requires modifying the visit completion mutation in `convex/visits.ts`.
11. Use `internalMutation` from `./functions` for audit triggers.

### Deliverables

- [ ] `convex/incentives.ts` — Add `checkAndSuggest` internalMutation with metric check, threshold comparison, and suggestion creation
- [ ] `convex/verifications.ts` — Add `checkAndSuggest` call after lead -> VERIFIED transition (for the submitting guard)
- [ ] `convex/visits.ts` — Add `checkAndSuggest` call after visit → COMPLETED transition (for the assigned guard)

### Acceptance Criteria

1. `checkAndSuggest` correctly checks `lead_milestone` + `quality_streak` on `LEAD_VERIFIED` trigger.
2. `checkAndSuggest` correctly checks `visit_milestone` on `VISIT_COMPLETED` trigger.
3. Auto-suggested cards are created as `status: "active"` with required top-level `level` and `awarded_method: "AUTO"`; metadata carries review/source context only (NOT canonical tier).
4. No duplicate auto-suggestions for same card_type at same/higher tier.
5. `quality_streak` skipped if total submitted leads < min_leads threshold.
6. `speed_bonus` and `monthly_top` are never auto-awarded.
7. Lead verification mutation calls `checkAndSuggest` for submitting guard after VERIFIED transition.
8. Visit completion mutation calls `checkAndSuggest` for assigned guard after COMPLETED transition.
9. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Manual check of auto-suggest flow.

### Out of Scope

- Admin confirm/reject UI, manual award, guard-facing display.

---

## T03: Admin Confirm + Reject Auto-Suggestions + Admin Queries

### Objective

Implement admin mutations for confirming and soft-rejecting auto-suggested incentive cards, plus the three admin-facing queries (`listPending`, `listActive`, `getByGuard`) that E02 depends on.

### Required Reading

- `notes/features/08-incentive-system.md` — "Auto-Award Flow" steps 5-7 (confirm/reject lifecycle)
- `notes/03-roles-and-permissions.md` — `incentives.award` permission
- `notes/13-constants-reference.md` — audit actions `INCENTIVE_CARDS_UPDATE`

### Key Rules

1. `incentives.confirm` uses `requirePermission(ctx, "incentives.award")`.
2. `incentives.confirm` args: `{ card_id: v.id("incentive_cards") }`.
3. Confirm keeps `status: "active"` and updates metadata review markers to confirmed. Before confirming, enforce one-active-per-type: if guard already has another active card for this card_type at a lower tier, expire that older card (`status: "expired"`, `expires_at`). If guard has active card at same/higher tier, reject confirmation with error.
4. `incentives.reject` uses `requirePermission(ctx, "incentives.award")`.
5. `incentives.reject` args: `{ card_id: v.id("incentive_cards") }`.
6. Reject is soft-reject: set `status: "expired"` and set `rejected_at: Date.now()` (never hard-delete). **⚠️ Schema modification required**: add `rejected_at: v.optional(v.number())` to `incentive_cards` in `convex/schema.ts` before implementation. Store rejection reason in `metadata.reason`.
7. Both mutations validate that the card exists and that metadata indicates auto-suggestion pending review.
8. `incentives.listPending` uses `requirePermission(ctx, "incentives.view")`. Accepts `paginationOpts`. Returns pending auto-suggestions where `status: "active"`, metadata `award_source: "auto"`, metadata `review_state: "pending"`, and `rejected_at === undefined`, with guard name join. Sorted by `_creationTime` descending.
9. `incentives.listActive` uses `requirePermission(ctx, "incentives.view")`. Accepts `{ guard_user_id?: v.optional(v.id("users")), card_type?: v.optional(...), paginationOpts }`. Returns active cards (`status: "active"`) with guard name join. Filterable by guard and card type. Sorted by `_creationTime` descending.
10. `incentives.getByGuard` uses `requirePermission(ctx, "incentives.view")`. Accepts `{ guard_user_id: v.id("users") }`. Returns ALL cards for a guard (active + expired/redeemed), used by admin guard detail page. Not paginated (guard won't have hundreds of cards).

### Deliverables

- [ ] `convex/incentives.ts` — Add `incentives.confirm` mutation (confirm pending suggestion metadata, expire lower-tier duplicate active card if needed)
- [ ] `convex/schema.ts` — Add `rejected_at: v.optional(v.number())` to `incentive_cards` table (required for soft-reject marker)
- [ ] `convex/incentives.ts` — Add `incentives.reject` mutation (soft-reject: set `status: "expired"`, keep record, set `rejected_at` timestamp)
- [ ] `convex/incentives.ts` — Add `incentives.listPending` paginated query (pending AUTO suggestions for admin)
- [ ] `convex/incentives.ts` — Add `incentives.listActive` paginated query (active cards with guard/type filters for admin)
- [ ] `convex/incentives.ts` — Add `incentives.getByGuard` query (all cards for a specific guard for admin detail page)

### Acceptance Criteria

1. `incentives.confirm` gated by `incentives.award` permission.
2. Confirm keeps card `status: "active"` and marks review metadata as confirmed.
3. If guard has existing active card for same type at lower tier, older card is expired (`status: "expired"`).
4. If guard has existing active card at same or higher tier, confirm is rejected with error.
5. `incentives.reject` gated by `incentives.award` permission.
6. `convex/schema.ts` has `rejected_at: v.optional(v.number())` added to `incentive_cards` table. Rejecting sets `status: "expired"` and `rejected_at = Date.now()` (soft-reject, NOT hard delete). `listPending` excludes rejected cards via `rejected_at === undefined` plus metadata pending-review filters.
7. Both mutations reject non-auto-suggestion or non-pending-review cards.
8. `incentives.listPending` gated by `incentives.view`, returns only pending auto-suggestions with guard name joins, paginated.
9. `incentives.listActive` gated by `incentives.view`, supports optional `guard_user_id` and single optional `card_type` filter, returns `status: "active"` cards with guard name joins, paginated. **Backend contract**: `listActive` accepts a single optional `card_type`; for multi-type filtering, the UI must fan out queries or post-filter client-side.
10. `incentives.getByGuard` gated by `incentives.view`, returns all cards (active + expired/redeemed) for a specific guard.
11. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Admin UI for confirm/reject, manual award, guard display.

---

## T04: Manual Award + Expiry

### Objective

Implement admin mutations for manually awarding incentive cards (immediately active) and expiring active cards.

### Required Reading

- `notes/features/08-incentive-system.md` — "Manual Award Flow", expiry section, Business Rules #1-#7
- `notes/03-roles-and-permissions.md` — `incentives.award` and `incentives.expire` permissions
- `notes/13-constants-reference.md` — audit actions

### Key Rules

1. `incentives.manualAward` uses `requirePermission(ctx, "incentives.award")`.
2. Args use only schema-backed fields: `{ guard_user_id: v.id("users"), card_type, level, title, description, badge_icon, reward_amount_paise, reason: v.optional(v.string()) }`. The `level` field (BRONZE/SILVER/GOLD/PLATINUM) is a REQUIRED top-level schema field — NOT metadata. Set `awarded_method: "MANUAL"` in the insert payload (not from args). Store optional `reason` in `metadata`.
3. Manual awards create/patch cards with `status: "active"`, `earned_at`, and metadata markers (for example `award_source: "manual"`).
4. Enforce one-active-per-type: if guard already has an active card for this card_type at a lower tier, expire older card. If same or higher tier already active, reject with error.
5. `incentives.expire` uses `requirePermission(ctx, "incentives.expire")`.
6. Args: `{ card_id: v.id("incentive_cards"), reason: v.string() }`. Reason is required.
7. Expire sets `status: "expired"` and `expires_at` on the card. Does NOT delete the record — keeps history.
8. Store rejection/expiry reason in the `metadata` field of the incentive_cards record. The audit trigger captures the full row change, so the reason will be preserved in the audit trail.
9. Only active cards can be expired (reject if status is not `"active"`).

### Deliverables

- [ ] `convex/incentives.ts` — Add `incentives.manualAward` mutation (immediately active, one-per-type enforcement)
- [ ] `convex/incentives.ts` — Add `incentives.expire` mutation (`status: "active"` -> `"expired"`, reason persisted in `metadata.reason`)

### Acceptance Criteria

1. `incentives.manualAward` gated by `incentives.award` permission.
2. Manual awards are immediately `status: "active"` with manual/source context in `metadata`.
3. Reason/source context is stored in `metadata`; tier is stored in the required top-level `level` field (NOT metadata).
4. One-active-per-type: lower-tier active card is expired, same/higher-tier active card rejects the new manual award.
5. `incentives.expire` gated by `incentives.expire` permission.
6. Expire sets `status: "expired"`, stores required reason in `metadata.reason`, and does NOT delete.
7. Only active cards can be expired.
8. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Admin UI for manual award/expiry, guard display.

---

## T05: Guard Badge Query

### Objective

Implement the guard-facing badge query that returns active incentive cards for the authenticated guard's profile display.

### Required Reading

- `notes/features/08-incentive-system.md` — "Guard View" section (profile badges wireframe, what guard sees)
- `notes/05-guard-portal-ux.md` — Flow 7: Profile (My Badges section)
- `notes/03-roles-and-permissions.md` — Guard Permissions (hardcoded, not RBAC)
- `notes/10-convex-schema.md` — `incentive_cards.by_guard_user_id` index

### Key Rules

1. `incentives.getMyCards` uses `requireGuard(ctx)` — NOT `requirePermission`. **⚠️ P11 migration note**: P11-E01-T01 will later migrate this query from `requireGuard` to `requireGuardAuth` so INACTIVE guards can view their badges. Do not write hard assertions that INACTIVE guards must be blocked from this query.
2. Query accepts NO args. Uses authenticated guard's user ID from `requireGuard` exclusively.
3. Returns only `status: "active"` cards for the guard. Guard CANNOT see pending suggestions or expired/redeemed cards.
4. Return enriched data per card: card_type display name + tier from top-level `level` field (BRONZE/SILVER/GOLD/PLATINUM) + metric description (for example, "25 verified leads" for `lead_milestone`). To compute metric description, call `getGuardMetrics` to get current values.
5. Guard CANNOT see admin-only metadata keys, pending-review metadata, or threshold configurations.
6. Guard CAN see: card_type display name, tier icon derived from top-level `level` field (BRONZE/SILVER/GOLD/PLATINUM), and metric explanation. Optional guard-facing reason text comes from sanitized `metadata.reason`.
7. Use `incentive_cards.by_guard_user_id` index.
8. Sort by card_type then tier precedence (PLATINUM -> GOLD -> SILVER -> BRONZE) using top-level `level` field.

### Deliverables

- [ ] `convex/incentives.ts` — Add `incentives.getMyCards` query (guard-only, active cards, enriched with metrics)

### Acceptance Criteria

1. `incentives.getMyCards` uses `requireGuard(ctx)`.
2. Returns only `status: "active"` cards.
3. Each card includes display-friendly fields: card_type, tier (from top-level `level` field), metric_description.
4. metric_description computed from current guard metrics (e.g., "27 verified leads", "15 visits completed", "92% verification rate").
5. Guard cannot see admin-only fields/metadata, pending-review markers, or threshold configuration values. Optional guard-facing reason comes from sanitized `metadata.reason` only.
6. Query uses `by_guard_user_id` index.
7. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

### Out of Scope

- Guard profile UI (P10-E03), admin-facing guard badge views.

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- `convex/incentives.ts` (910+ lines) — Full incentive domain module with all mutations, queries, and helpers:
  - `getGuardMetrics()` — counts verified leads (via `leads.by_guard_and_status`), completed visits (via `visits.by_guard_and_status`), computes `verified_rate`
  - `getThresholds()` — reads system_config for tier bands per card_type, includes `min_leads` for quality_streak
  - `determineTier()` — returns highest qualifying tier (PLATINUM > GOLD > SILVER > BRONZE) or null
  - `checkAndSuggest` — internalMutation triggered on LEAD_VERIFIED / VISIT_COMPLETED events. Creates auto-suggestions with `status: "active"`, `awarded_method: "AUTO"`, metadata markers. Expires lower-tier active cards when higher tier qualifies.
  - `confirm` / `reject` — admin mutations for auto-suggestions (gated by `incentives.award`)
  - `manualAward` — admin manual card creation (gated by `incentives.award`), one-active-per-type enforced
  - `expire` — admin card expiry (gated by `incentives.expire`), reason stored in metadata
  - `listPending` / `listActive` / `getByGuard` — admin queries (gated by `incentives.view`)
  - `getMyCards` — guard query (uses `requireGuard`), returns only active non-pending cards with metric enrichment, strips admin metadata
- Schema migration complete: card types renamed, `is_active` replaced with `status` enum, new fields added, `by_status` index added, `rejected_at` field added
- `incentive_cards` added to `AUDITED_TABLES` in `convex/functions.ts`
- Permission constants renamed: `INCENTIVES_EXPIRE`, `INCENTIVES_MANAGE`
- `src/components/shared/incentive-card-badge.tsx` — shared role-agnostic badge component
- Auto-award hooks wired into `convex/verifications.ts` (VERIFIED transition) and `convex/visits.ts` (COMPLETED transition)

### Key File Locations

- Backend: `convex/incentives.ts`
- Schema: `convex/schema.ts` (incentive_cards table, lines ~519-540)
- Constants: `lib/constants.ts` (INCENTIVE_CARD_TYPE, PERMISSIONS, SYSTEM_CONFIG_KEYS)
- Audit: `convex/functions.ts` (AUDITED_TABLES)
- Hooks: `convex/verifications.ts` (~line 86), `convex/visits.ts` (~line 575)
- Shared badge: `src/components/shared/incentive-card-badge.tsx`

### Deviations from Spec

- System config keys intentionally retain old naming (`incentive_lead_submitter_bronze` etc.) — these are database keys, not card type values. Renaming would require data migration.
- `checkAndSuggest` initially did NOT expire lower-tier active cards when creating a higher-tier suggestion — discovered and fixed during Oracle review.

### Gotchas for Next Epic

- `getMyCards` filters out pending auto-suggestions (cards where `metadata.review_state === "pending"` AND `metadata.award_source === "auto"`). E03 must NOT add its own pending filter — the backend handles it.
- Config panel reads/writes via existing `api.systemConfig.getAll` / `api.systemConfig.set` — the backend mutation requires `system.configure` permission (NOT `incentives.manage`). UI must gate on `system.configure`.
- `listActive` accepts a single optional `card_type` — for multi-type filtering, use single-select in UI.
- The `ManualAwardDialog` component accepts optional `defaultGuardUserId` and `lockGuardSelection` props for guard-context mode (E02-T05).
