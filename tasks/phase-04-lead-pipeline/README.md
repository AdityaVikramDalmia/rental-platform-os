# Phase 4: Lead Pipeline (P04)

## Overview

The lead pipeline is the core revenue engine. Guards submit vacancy leads through a mobile-first form, the system auto-flags duplicates via two de-dup rules (same flat within 90 days, same owner phone within 30 days), and ops triages them through a real-time queue toward verification. Every lead has a clear status, every transition is tracked via audit triggers, and rate limiting (5/day per guard) prevents spam. This phase delivers both the guard-facing submission flow (form + My Leads + NEED_INFO response) and the admin-facing triage workspace (lead queue table + detail panel + action dialogs).

## Dependencies

| Phase                               | What It Provides for P04                                                                                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P01 (Auth)**                      | Guard login (phone + password), admin login (Google SSO), auth helpers (`requireGuard`, `requireAdmin`, `requirePermission`), RBAC seed with Ops Agent role, audit trigger infrastructure in `functions.ts`                            |
| **P02-E01 (Society CRUD)**          | Society data — societies exist with status lifecycle. Leads reference `society_id`. Society status (ACTIVE) validated on lead submission. Note: guard-to-society assignment comes from P03-E01 (`guard_profiles.society_id`), not P02. |
| **P02-E02 (Building CRUD)**         | Building data — lead submission form uses building dropdown filtered by guard's society. Leads reference `building_id`.                                                                                                                |
| **P03-E01 (Guard Account Backend)** | Guard profiles exist with `society_id` assignment, guard status (ACTIVE/INACTIVE/BANNED) checked on submission. `requireGuard` returns guard profile with society info.                                                                |

## Key Documentation

| Doc                                  | Section                                                               | Why You Need It                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `notes/features/03-lead-pipeline.md` | Full file                                                             | THE feature spec — submission flow, de-dup rules, NEED_INFO flow, admin queue, all Convex functions |
| `notes/04-state-machines.md`         | Lead Status Machine                                                   | All valid transitions, ASCII diagram, validation code pattern                                       |
| `notes/02-data-models.md`            | Section F (Lead)                                                      | Field reference with types, constraints, relationships                                              |
| `notes/10-convex-schema.md`          | `leads` table                                                         | Exact validators, indexes (7 single/compound + 1 search), field definitions                         |
| `notes/13-constants-reference.md`    | Lead statuses, quality flags, permissions, audit actions, config keys | Every enum value, badge colors, permission strings                                                  |
| `notes/11-convex-architecture.md`    | De-dup logic section, Rate limiter, Mutation wrapper                  | Implementation patterns with code examples                                                          |
| `notes/05-guard-portal-ux.md`        | Lead submission + My Leads screens                                    | Guard-facing wireframes, field order, NEED_INFO response flow                                       |
| `notes/06-admin-panel-ux.md`         | Lead Queue / Triage section                                           | Admin table columns, side panel sections, action buttons                                            |
| `notes/03-roles-and-permissions.md`  | Lead permissions                                                      | RBAC matrix — which permissions protect which mutations                                             |

## Epics

| ID      | Title                                                                      | Tasks | Status | Depends On                           |
| ------- | -------------------------------------------------------------------------- | ----- | ------ | ------------------------------------ |
| P04-E01 | [Lead Submission Backend](P04-E01-lead-submission-backend.md)              | 5     | done   | [P01-E08, P02-E01, P02-E02, P03-E01] |
| P04-E02 | [Lead Admin Backend](P04-E02-lead-admin-backend.md)                        | 4     | done   | [P04-E01]                            |
| P04-E03 | [Admin Lead Queue UI](P04-E03-admin-lead-queue-ui.md)                      | 4     | done   | [P04-E02]                            |
| P04-E04 | [Guard Lead Submission & My Leads UI](P04-E04-guard-lead-submission-ui.md) | 5     | done   | [P04-E01]                            |

## Dependency Graph

```
P01-E08 ─┐
P02-E01 ──┤
P02-E02 ──┼──► P04-E01 ──┬──► P04-E02 ──► P04-E03
P03-E01 ──┘              │
                         └──► P04-E04  (parallel with E02→E03)
```

**Shared UI components note**: `lead-status-badge.tsx`, `notes-thread.tsx`, and `status-timeline.tsx` live in `src/components/shared/`. Whichever of E03/E04 runs first creates them. The second epic imports what already exists.

## Execution Order

1. **P04-E01**: Lead Submission Backend — rate limiter setup, de-dup helper, create mutation, guard queries, tests
2. **P04-E02 + P04-E04** _(parallel)_: Lead Admin Backend + Guard Lead Submission & My Leads UI
3. **P04-E03**: Admin Lead Queue UI _(after E02 completes)_

## Completion Criteria

### Backend

- [ ] Rate limiter component registered in `convex/convex.config.ts`
- [ ] `convex/rateLimiter.ts` has `guard:lead_submission` rule (5/day fixed window, 24h period)
- [ ] `validateLeadTransition` helper enforces all 9 valid transitions from state machine
- [ ] `checkDuplicates` helper implements both rules (flat 90d + phone 30d)
- [ ] `buildSearchableText` concatenates society name + building name + flat number + owner name + owner phone + guard name
- [ ] `leads.create` full pipeline: consent → society ACTIVE → building belongs → rate limit → de-dup → GUARD_HIGH_REJECTION (min 5 leads, >50%) → searchable_text → insert
- [ ] `leads.updateByGuard` only on NEED_INFO status, only by submitting guard, appends to notes_thread, transitions to SUBMITTED
- [ ] `leads.getMyLeads` paginated with optional status filter, returns guard's own leads
- [ ] `leads.getMyLeadById` guard-facing detail query with ownership check and joins
- [ ] `leads.getSubmissionCount` returns today's count (midnight IST reset) for rate limit display
- [ ] `leads.requestInfo` RBAC-protected, appends admin note to notes_thread, transitions SUBMITTED → NEED_INFO
- [ ] `leads.reject` RBAC-protected, appends reason to notes_thread, transitions to REJECTED
- [ ] `leads.markDuplicate` RBAC-protected, sets `duplicate_of_lead_id`, transitions POTENTIAL_DUPLICATE → DUPLICATE
- [ ] `leads.clearDuplicateFlag` RBAC-protected, clears duplicate quality flags, transitions POTENTIAL_DUPLICATE → SUBMITTED
- [ ] `leads.setBounty` RBAC-protected, works on any non-terminal lead, stores amount in paise
- [ ] `leads.list` paginated with status/society/building/guard filters + full-text search via `search_leads` index
- [ ] `leads.getById` returns lead + guard user + guard profile (guard_type from `guard_profiles` table) + building (`total_floors`) + society + duplicate lead reference
- [ ] `leads.getStatusCounts` returns lead counts per status for admin tab badges
- [ ] All mutations use `mutation` from `./functions` (not `_generated/server`) for audit triggers
- [ ] All queries use `query` from `./_generated/server` (queries don't need audit trigger wrapper — reads are not audited)
- [ ] All admin mutations check exact permission strings via `requirePermission`
- [ ] All guard mutations use `requireGuard` for auth + ACTIVE status check
- [ ] Backend tests cover: submission, de-dup flagging, rate limiting, all status transitions, RBAC rejection

### Admin UI

- [ ] "Leads" nav item in admin sidebar (with count badge for SUBMITTED leads)
- [ ] Lead queue page at `/admin/leads` with status tabs (SUBMITTED default, NEED_INFO, POTENTIAL_DUPLICATE, VERIFIED, REJECTED)
- [ ] Data table: columns (#, Society, Building/Flat, Phone, Guard, Time), sortable, paginated (20/page)
- [ ] Full-text search bar wired to `search_leads` index
- [ ] Real-time updates via Convex subscriptions (new leads appear without refresh)
- [ ] Lead detail side panel with sections: Lead Info, Owner, Vacancy, Guard Profile Card, Duplicate Info (conditional), Status History Timeline
- [ ] Action dialogs: Request Info (note field), Reject (reason field), Mark Duplicate (original lead ref), Clear Duplicate Flag (confirm), Set Bounty (amount field)
- [ ] NO "Call & Verify" button — deferred to P05

### Guard UI

- [ ] Lead submission form at `/guard/submit-lead` with building dropdown, required fields, collapsible optional section, consent checkbox
- [ ] Submission success screen with lead info + [Submit Another] + [View Leads] buttons
- [ ] Rate limit exceeded screen with message + [View My Leads] button
- [ ] Rate limit count display on submit button: "(3 of 5 leads today)"
- [ ] My Leads page at `/guard/leads` with filter tabs: All, In Review, Verified, Rejected
- [ ] Lead cards with flat info, owner phone, timestamp, status badge (color-coded), admin note preview (NEED_INFO)
- [ ] Lead detail view with full submitted info, status history timeline, prospective bounty (visible only when VERIFIED + bounty set)
- [ ] NEED_INFO response flow: admin note displayed, editable fields, guard reply textarea, "Update & Resubmit" button

### Cross-Cutting

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] All status changes create `audit_logs` entries automatically via triggers

## Files Created by This Phase

```
convex/
  convex.config.ts              # Updated: @convex-dev/rate-limiter component registered
  rateLimiter.ts                # Rate limiter instance + guard:lead_submission rule
  leads.ts                      # All lead mutations + queries + helper functions
src/
  app/
    (admin)/admin/leads/
      page.tsx                  # Lead queue page
      components/
        lead-table.tsx          # Data table with columns, filters, search
        lead-detail-panel.tsx   # Side panel with all sections
        lead-status-tabs.tsx    # Status filter tabs with counts
        request-info-dialog.tsx # NEED_INFO note dialog
        reject-dialog.tsx       # Reject with reason dialog
        mark-duplicate-dialog.tsx # Duplicate confirmation dialog
        set-bounty-dialog.tsx   # Bounty amount dialog
    (guard)/guard/
      submit-lead/
        page.tsx                # Lead submission form
        components/
          lead-form.tsx         # react-hook-form + zod form component
          success-screen.tsx    # Post-submission success
          rate-limit-screen.tsx # Rate limit exceeded feedback
      leads/
        page.tsx                # My Leads list
        [id]/
          page.tsx              # Lead detail view
        components/
          lead-card.tsx         # Lead list card component
          lead-filter-tabs.tsx  # Filter tabs (All, In Review, Verified, Rejected)
          need-info-form.tsx    # NEED_INFO editable fields + resubmit
  components/
    shared/
      lead-status-badge.tsx     # Lead status badge (color-coded, reused in admin + guard)
      notes-thread.tsx          # Notes thread display (admin notes + guard replies)
      status-timeline.tsx       # Status history timeline component
```

## Scope Boundaries

### IN This Phase

- **`setBounty` mutation and Set Bounty admin dialog** — The `leads.setBounty` mutation and its admin UI dialog are in P04. The master roadmap says "Prospective bounty display (set in P05)" — that refers to the bounty being _meaningful to guards_ only after P05 creates VERIFIED leads. The bounty field can be set by admin on any non-terminal lead (including SUBMITTED), but the guard-facing bounty display only activates when `status === "VERIFIED" && prospective_bounty !== undefined`. So: mutation exists in P04, guard sees value after P05 creates VERIFIED leads.
- Lead submission form (guard-facing, mobile-first) with all required + optional fields
- Rate limiting via `@convex-dev/rate-limiter` (5/day per guard, 24h fixed window)
- De-duplication (same flat 90d + same phone 30d) → `POTENTIAL_DUPLICATE` status + quality flags
- `searchable_text` computation for full-text search
- `GUARD_HIGH_REJECTION` quality flag (min 5 leads, >50% rejection rate)
- Lead queue (admin-facing table with status tabs, filters, search, pagination, real-time)
- Lead detail side panel (admin-facing, all sections)
- Admin triage actions: Request Info, Reject, Mark Duplicate, Clear Duplicate Flag, Set Bounty
- Guard NEED_INFO response flow (edit fields, add reply, resubmit)
- Guard My Leads list + lead detail view
- All RBAC permission checks on admin mutations
- Audit logging via triggers (automatic)
- Backend tests for all mutations and queries

### NOT In This Phase

- Owner verification form + call recording + lead VERIFIED transition → **P05 (Owner Verification)**
- "Call & Verify" admin button → **P05**
- Listing creation from verified leads → **P06 (Listings)**
- Lead rejection → listing auto-archive cascade → **P06** (added when listings exist)
- Visit scheduling from verified leads → **P07 (Visits)**
- `OFF_SHIFT_SUBMISSION` quality flag population → **V2** (requires GPS/shift location matching)
- `system_config` table for configurable rate limit/de-dup windows → **P11 (Quality & Controls)** (hardcoded defaults for now: 5/day, 90d flat, 30d phone)
- Guard incentive cards/badges for lead submission → **P10 (Incentives)**
- Quality scoring dashboard → **P11 (Quality & Controls)**
- i18n translations for guard portal → **P14 (i18n)**
