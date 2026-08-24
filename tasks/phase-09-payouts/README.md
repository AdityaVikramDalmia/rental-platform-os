# Phase 9: Payouts (P09)

## Overview

Payouts are the guard bounty for sourcing leads that result in successful closures. Linked to CONFIRMED closures only (Business Rule #3). Lifecycle: `pending → approved → disbursed` (happy path), `pending/approved → voided` (manual/system void), and `approved → failed` (disbursement failure). Admin manually sets `amount_paise` per deal — no auto-calculation, because every deal has different economics (shared brokerage, guard performance adjustments, deal value variance). Guard earnings page shows pending vs disbursed with total earned, respecting strict data visibility boundaries (guard cannot see commission, brokerage, rent agreement, or admin notes). Separation of duties (different admin creates vs approves vs disburses) is recommended but NOT system-enforced in V1.

## ⚠️ SCHEMA MIGRATION REQUIRED (E01-T01 prerequisite)

The current `payouts` schema and permissions differ from the target design. E01-T01 MUST perform these schema and permission migrations BEFORE implementing business logic:

**Schema field renames** (in `convex/schema.ts`):

- `amount` → `amount_paise` (clarify it stores paise, not rupees)
- `paid_at` → `disbursed_at`
- `receipt_note` → `payment_reference`
- `initiated_by_admin_id` → keep as-is OR rename to `created_by_admin_id` (spec uses this for mutation context). **⚠️ This field is currently required in schema — `payouts.create` MUST set it from auth context.**
- `approved_by_admin_id` → keep as-is (maps to spec's `approved_by`)

**Schema field decision — `method`**:

- `method: payoutMethodValidator` is currently a REQUIRED field (`CASH`/`UPI`/`BANK_TRANSFER`). Spec APIs do not collect method at creation time. Migration options: (a) make `method` optional and set at disburse time, or (b) default to `CASH` at creation and allow update at disburse. **Choose (a) or (b) during E01-T01 implementation and update both schema and API accordingly.**

**Schema status migration** (in `payoutStatusValidator`):

- `INITIATED` → `pending` (lowercase, matching design spec)
- `APPROVED` → `approved`
- `PAID` → `disbursed`
- `VOIDED` → `voided`
- ADD `failed` status (new — for disbursement failures)

**Schema field additions**:

- `approved_at: v.optional(v.number())` — timestamp when approved
- `failure_reason: v.optional(v.string())` — reason for failed disbursement
- `voided_reason: v.optional(v.string())` — admin reason for void
- `voided_by: v.optional(v.id("users"))` — admin who voided
- `voided_at: v.optional(v.number())` — timestamp of void

**Permission string additions** (in `lib/constants.ts`):

- Rename `PAYOUTS_MARK_PAID` → `PAYOUTS_DISBURSE` with value `"payouts.disburse"`
- Add `PAYOUTS_VOID` with value `"payouts.void"`
- Update `PAYOUTS_CREATE` value from `"payouts.create"` to `"payouts.create"` (no change needed, but spec's `payouts.create` maps to the creation permission — verify this is used for `payouts.create` mutation, NOT `payouts.approve`)

**Seed/role updates**: Update any seeded roles that reference old permission strings.

## Dependencies

| Dependency                        | What It Provides for P09                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P08-E01 (Closure Backend)**     | CONFIRMED closures exist. `closures.getById` available for join data. `payouts.by_closure_id` index already in schema. `closures.cancel` (P08-E01-T03) already handles system-triggered payout void cascade — P09 does NOT re-implement this. P09 only adds standalone `payouts.void`. **⚠️ Current cascade only voids `INITIATED` payouts (pre-migration status). E01-T01 MUST update `closures.cancel` to void both `pending` and `approved` payouts after status migration.** Note: one-payout-per-closure is enforced in P09-E01's `payouts.create`, not in P08. |
| **P01-E02 (Schema & Infra)**      | `convex/functions.ts` audit trigger wrapper. `PAYOUTS_INSERT`/`PAYOUTS_UPDATE` already in `audit_logs.action` union in schema. **⚠️ `payouts` is NOT in AUDITED_TABLES. Must be added to `convex/functions.ts` AUDITED_TABLES array before implementing audit-dependent features.**                                                                                                                                                                                                                                                                                  |
| **P04-E03 (Admin Lead Queue UI)** | Admin table + filter + detail panel patterns for payouts page. URL-synced filters, paginated data table, status actions, detail page layout.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **P07-E02 (Visit Execution)**     | Guard portal layout with bottom navigation already exists. **Current nav tabs**: Dashboard (`Home`), Submit Lead (`Plus`), My Leads (`FileText`), Visits (`Calendar`), Profile (`User`). **⚠️ No "Earn" tab exists yet** — P09-E03 must replace "Profile" as the 5th tab with "Earn" to maintain the existing `grid-cols-5` layout. If Profile must be preserved, switch to `grid-cols-6` (outside the recommended path). `requireGuard` auth helper pattern used by guard-facing visit queries is the same pattern for guard earnings queries.                      |

## Key Documentation

| Doc                                                          | Section                                                                                            | Why You Need It                                                                                                                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/features/07-closure-and-payouts.md`                   | Part 2: Payouts + Payout Voiding + Guard Earnings + Convex Functions + Business Rules + Edge Cases | THE feature spec — payout form, lifecycle, voiding, guard earnings wireframe, admin page, business rules, edge cases                                                                                                |
| `notes/04-state-machines.md`                                 | Payout Status section                                                                              | All valid transitions (`pending → approved → disbursed`, `pending/approved → voided`, `approved → failed`), terminal states, validation code pattern                                                                |
| `notes/02-data-models.md`                                    | Section L (Payout)                                                                                 | Payout entity fields, types, indexes, relationships, business notes                                                                                                                                                 |
| `notes/10-convex-schema.md`                                  | `payouts` table + `audit_logs.action` union                                                        | Exact validators, 4 indexes, confirms `PAYOUTS_INSERT`/`PAYOUTS_UPDATE` already in action literal union                                                                                                             |
| `notes/13-constants-reference.md`                            | Payout statuses/colors, payout permissions, audit actions                                          | Badge colors (`pending`, `approved`, `disbursed`, `failed`, `voided`), `payouts.*` permissions, audit action strings                                                                                                |
| `notes/03-roles-and-permissions.md`                          | Closure & Payout permissions + Ops Agent + Finance role                                            | RBAC matrix: Ops Agent has `payouts.view` ONLY. Finance has all 5 payout permissions (`payouts.view`, `payouts.create`, `payouts.approve`, `payouts.disburse`, `payouts.void`). Guard uses `requireGuard` not RBAC. |
| `notes/11-convex-architecture.md`                            | Function Layer Architecture, AUDITED_TABLES, Auth Helpers                                          | `mutation` from `./functions`, `requirePermission`/`requireGuard` patterns, audit trigger wiring                                                                                                                    |
| `notes/06-admin-panel-ux.md`                                 | Flow 5: Process Closure & Payout                                                                   | Payout creation flow from confirmed closure, admin navigation placement                                                                                                                                             |
| `notes/05-guard-portal-ux.md`                                | Flow 6: Earnings page wireframe                                                                    | Mobile-first earnings layout, Total Earned, empty states, payout status display labels                                                                                                                              |
| `tasks/phase-08-closure/P08-E01-closure-backend.md`          | Pattern reference for backend epic structure                                                       | Epic template, task sections, YAML frontmatter format, shared badge in E01-T01 pattern                                                                                                                              |
| `tasks/phase-08-closure/P08-E02-admin-closure-ui.md`         | Pattern reference for admin UI epic structure                                                      | Admin table, filter bar, detail page, status actions, permission-gated AND hidden buttons                                                                                                                           |
| `tasks/phase-07-visit-management/P07-E02-visit-execution.md` | Pattern reference for guard-facing epic structure                                                  | Guard mobile-first page conventions, card components, section layout, guard nav wiring                                                                                                                              |

## Epics

| ID      | Title                                                 | Tasks | Status | Depends On                  |
| ------- | ----------------------------------------------------- | ----- | ------ | --------------------------- |
| P09-E01 | [Payout Backend](P09-E01-payout-backend.md)           | 5     | done   | [P08-E01, P01-E02]          |
| P09-E02 | [Admin Payout UI](P09-E02-admin-payout-ui.md)         | 5     | done   | [P09-E01, P04-E03, P08-E02] |
| P09-E03 | [Guard Earnings Page](P09-E03-guard-earnings-page.md) | 4     | done   | [P09-E01, P07-E02]          |

## Dependency Graph

```
P08-E01 ──┐
P01-E02 ──┼──► P09-E01 ──┬──► P09-E02
                          │       ▲
                          │   P04-E03 ─┘
                          │   P08-E02 ─┘
                          │
                          └──► P09-E03
                                  ▲
                              P07-E02 ─┘
```

**Parallel note**: E02 (Admin Payout UI) and E03 (Guard Earnings Page) can run in parallel once E01 is complete. E02 depends on P04-E03 for existing admin table/filter UI patterns and P08-E02 for existing closure detail page (T05 adds payout integration to it). E03 depends on P07-E02 for existing guard portal layout with bottom nav (P09-E03 ADDS the "Earn" tab — it does not exist yet).

## Execution Order

1. **P09-E01**: Payout Backend — domain module creation, status transition helper, shared payout-status-badge, CRUD mutations (create/approve/disburse/void/fail), guard earnings query
2. **P09-E02 + P09-E03** _(parallel)_: Admin Payout UI (board, create dialog, filters, status actions, detail page, closure integration) + Guard Earnings Page (pending/disbursed/failed sections, total earned, data privacy enforcement)

## Completion Criteria

### Backend

- [ ] `convex/payouts.ts` exists with all mutations and queries
- [ ] `payouts.create({ closure_id, amount_paise, payment_reference? })` — auto-fills `guard_user_id` from closure→lead→guard chain, auto-fills `lead_id` from closure, enforces one-payout-per-closure via `payouts.by_closure_id` index, enforces closure `status === "CONFIRMED"`, sets `status: "pending"` (RBAC: `payouts.create`)
- [ ] `payouts.approve({ id })` — `pending → approved`, sets `approved_by` from auth context (RBAC: `payouts.approve`)
- [ ] `payouts.disburse({ id, payment_reference? })` — `approved → disbursed`, sets `disbursed_at = Date.now()` (RBAC: `payouts.disburse`)
- [ ] `payouts.fail({ id, failure_reason })` — `approved → failed`, stores `failure_reason` and keeps payout terminal until manually handled
- [ ] `payouts.void({ id, voided_reason? })` — `pending/approved → voided`, stores `voided_reason`, `voided_by`, and `voided_at` (RBAC: `payouts.void`). NOTE: System-triggered voiding is already handled in P08's `closures.cancel` — P09 does NOT duplicate the cascade
- [ ] `payouts.list({ status?, guard_user_id?, date_from?, date_to?, pagination })` — paginated, descending `_creationTime` (newest first, index-compatible), filters via `by_status` / `by_guard_user_id` indexes (RBAC: `payouts.view`)
- [ ] `payouts.getById({ id })` — returns payout + closure + lead + guard + building + society joins, resolves no document URLs (payouts have no file uploads) (RBAC: `payouts.view`)
- [ ] `payouts.getGuardEarnings()` — no args, uses authenticated guard's ID from `requireGuard` exclusively (guard can only view own earnings). Returns `{ pending: Payout[], disbursed: Payout[], failed: Payout[], total_earned: number }`. Business Rule #6: Guard cannot see payout amount until status is `approved`, `disbursed`, or `failed`. Only `pending` hides `amount_paise`. Guard sees prospective bounty from lead as reference. Admin views guard earnings via `payouts.list` with `guard_user_id` filter.
- [ ] Status transition validation helper: `validatePayoutTransition(currentStatus, newStatus)` — `pending → approved → disbursed`, `pending/approved → voided`, `approved → failed`, terminals have no outgoing
- [ ] All mutations use `mutation` from `./functions` (not `_generated/server`) for audit triggers
- [ ] ⚠️ `payouts` is NOT in `AUDITED_TABLES`. Must be added to `convex/functions.ts` `AUDITED_TABLES` array before implementing audit-dependent features. `PAYOUTS_INSERT`/`PAYOUTS_UPDATE` already in `audit_logs.action`
- [ ] All money fields in paise (integer × 100), all dates in Unix ms
- [ ] All admin mutations check exact permission strings via `requirePermission`
- [ ] Guard earnings query uses `requireGuard` (NOT `requirePermission`) — guards have hardcoded capabilities, not RBAC

### Admin UI

- [ ] "Payouts" nav item in admin sidebar (RBAC-gated via `payouts.view`), positioned after Closures
- [ ] Payouts board at `/admin/payouts` with data table, columns: Guard, Lead (Building + Flat), Amount (₹ from `amount_paise`), Payment Reference, Status, Created date, Approved By, Disbursed date
- [ ] "Create Payout" triggered from closure detail page ("Create Payout" button, only when closure CONFIRMED + no payout exists) OR from payouts board — dialog with auto-filled guard/lead/closure, prospective bounty display, admin enters `amount_paise` + optional `payment_reference`
- [ ] Filters: Status (`All`, `pending`, `approved`, `disbursed`, `failed`, `voided`), Guard (searchable selector resolving name → `guard_user_id` for API), Date range (on created date). **Backend contract**: `listPayouts` accepts single optional `status`; multi-status UI must fan out queries or post-filter client-side.
- [ ] Status action buttons: Approve (`pending → approved`), Disburse (`approved → disbursed`), Mark Failed (`approved → failed`), Void (`pending/approved → voided`) — permission-gated AND hidden when user lacks permission
- [ ] Payout detail page at `/admin/payouts/[id]` — read-only detail view with linked closure, lead, guard info, all dates (Created, Disbursed, Voided), `approved_by` admin reference, plus status actions
- [ ] Closure detail page integration: "Payout" section shows payout status badge + link when payout exists, "Create Payout" button when CONFIRMED + no payout
- [ ] Real-time updates via Convex subscriptions
- [ ] Shared `payout-status-badge.tsx` consumed from `src/components/shared/` (created in E01-T01)
- [ ] All money displayed in rupees (paise ÷ 100) with ₹ symbol, all dates in IST
- [ ] `react-hook-form` + `zod` for all forms, `sonner` for all toasts

### Guard UI

- [ ] Guard earnings page at `/guard/earnings` — mobile-first, sections: Pending Payouts (top), Disbursed History (middle), Failed Payouts (bottom)
- [ ] Pending section cards: building + flat reference, closure confirmed date, prospective bounty (from lead), payout status ("Processing" for `pending`, "Approved (payment soon)" for `approved`). Do NOT show payout amount for `pending` (Business Rule #6). Show amount for `approved`.
- [ ] Disbursed history cards: building + flat reference, payout amount (₹ from `amount_paise`), disbursed date, payment reference. Sorted by `disbursed_at` descending.
- [ ] Total Earned counter at bottom of Disbursed History (sum of all `disbursed` payout `amount_paise`, display in ₹)
- [ ] "Earn" nav item ADDED to guard bottom navigation (**no placeholder exists** — current 5th tab is "Profile" with `User` icon). Use `Banknote` or `Wallet` icon from `lucide-react`, `href: "/guard/earnings"`
- [ ] Guard CANNOT see: commission amounts, brokerage breakdown, rent agreement, deal financials, internal admin notes
- [ ] Guard CAN see: flat reference, prospective bounty, payout amount (`approved`/`disbursed` only), payment reference, date, total earned, failed state indicator with `failure_reason` when present
- [ ] Empty states: "No pending payouts", "No disbursed history yet", "No failed payouts"

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] All status changes create `audit_logs` entries automatically via triggers
- [ ] Changed files have clean `lsp_diagnostics`

## Files Created by This Phase

```
convex/
  payouts.ts                               # New: All payout mutations + queries + helpers

src/app/
  (admin)/admin/payouts/
    page.tsx                               # Payouts board page
    [id]/
      page.tsx                             # Payout detail page
    components/
      payout-table.tsx                     # Data table with columns, row click, load-more
      create-payout-dialog.tsx             # Create payout modal (auto-filled fields, amount_paise, payment_reference)
      payout-filters.tsx                   # Status/Guard/Date filters (URL-synced)
      payout-status-actions.tsx            # Approve/Disburse/Mark Failed/Void buttons (status-conditional)
      payout-detail-panel.tsx              # Sectioned detail view with linked entities

  (admin)/admin/closures/
    [id]/
      page.tsx                             # Modified: Add payout integration section

  (guard)/guard/earnings/
    page.tsx                               # Guard earnings page (mobile-first)
    components/
      pending-payout-card.tsx              # Pending payout card (building+flat, status, bounty)
      paid-payout-card.tsx                 # Disbursed payout card (building+flat, amount_paise, date, payment_reference)
      earnings-summary.tsx                 # Total earned counter

src/components/shared/
  payout-status-badge.tsx                  # Payout status badge (pending/approved/disbursed/failed/voided)
```

## Scope Boundaries

### IN This Phase

- Payout creation from CONFIRMED closures with one-payout-per-closure enforcement
- Payout lifecycle: `pending → approved → disbursed` (happy path), `pending/approved → voided` (void path), `approved → failed` (failure path)
- Admin payout board with filters, create payout dialog, status actions, detail page
- Closure detail page integration (payout section with status badge + create button)
- Guard earnings page with pending/disbursed/failed sections, total earned, data privacy enforcement
- Shared payout-status-badge component (created in E01-T01)
- Manual void mutation (`payouts.void`) for admin-initiated voids
- Guard earnings query (`payouts.getGuardEarnings`) using `requireGuard`

### NOT In This Phase

- System-triggered payout void cascade on closure cancellation → **Already in P08-E01-T03** (`closures.cancel` handles this)
- Incentive system (cards, badges, auto-awards) → **P10 (Incentive System)**
- Financial analytics (payout totals, closure counts, brokerage analytics) → **P12 (Analytics)**
- Separation of duties enforcement (who created vs who approved) → **Not system-enforced in V1** (recommended workflow only)
- Guard-facing lead submission or visit features → **Earlier phases (P04, P07)**
- i18n for guard earnings page → **P14 (i18n)**
- Reverse/refund payout after `disbursed` → **Handle offline** (`disbursed` is terminal per Business Rule #8)
