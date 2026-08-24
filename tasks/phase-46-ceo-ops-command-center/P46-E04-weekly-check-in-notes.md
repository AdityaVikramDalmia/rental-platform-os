---
id: P46-E04
title: Weekly Check-In Notes
phase: 46
status: done
depends_on: ["P46-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-21
---

# P46-E04: Weekly Check-In Notes

## Overview

Implement a lightweight weekly review workflow where CEO/Ops Head users log per-agent check-in notes, track action items, and monitor review compliance/overdue nudges. This epic focuses on operational coaching cadence and accountability history, not formal appraisal workflows.

## Prerequisites

- **Read first**: [P46-E01 Completion Summary](P46-E01-command-center-dashboard.md#completion-summary) - command-center card composition and agent profile sheet integration points.
- P35 notification infrastructure should be available for overdue review nudges.
- OPS user roster and quality signals from P30/P32 must be queryable for check-in context.

## Task Queue

- [x] P46-E04-T01: Schema for `ops_check_in_notes` + Review Compliance Config
- [x] P46-E04-T02: Check-In Backend APIs + Overdue Nudge Cron
- [x] P46-E04-T03: Check-In UI Components and Dashboard Integration
- [x] P46-E04-T04: Pre-Check-In Brief Composer
- [x] P46-E04-T05: Open Action Items Dashboard

---

## T01: Schema for `ops_check_in_notes` + Review Compliance Config

### Objective

Define the check-in note and action-item storage model, required indexes, permission key, and overdue-threshold config.

### Estimated Effort

M

### Required Reading

- `notes/10-convex-schema.md` - nested object validator and index conventions
- `notes/13-constants-reference.md` - config and permission naming patterns
- `convex/schema.ts`, `lib/constants.ts`, `convex/seed.ts` - extension and seeding patterns

### Key Rules

1. Add `ops_check_in_notes` table with exact fields and action-item object structure, including `updated_at: v.number()` (patched on every edit mutation).
2. Add indexes `by_agent` and `by_reviewer` as specified.
3. Add permission `ops_management.write_checkins` to constants.
4. Add config key `checkin_overdue_days` (default `7`) and seed idempotently.
5. Set `sentiment` to `v.optional(v.union(v.literal("POSITIVE"), v.literal("NEUTRAL"), v.literal("NEEDS_IMPROVEMENT")))` (no free-form string sentiment).
6. Add `ops_check_in_notes` to `AUDITED_TABLES` in `convex/functions.ts`.

### Deliverables

- [ ] `convex/schema.ts` - add `ops_check_in_notes` table + indexes
- [ ] `lib/constants.ts` - add check-in permission/sentiment constants
- [ ] `convex/seed.ts` - seed `checkin_overdue_days` default
- [ ] `convex/functions.ts` - include `ops_check_in_notes` in audit trigger tables

### Acceptance Criteria

1. Schema compiles with action-item nested structure and optional due/completed timestamps.
2. New permission and config key are exported and seeded.
3. Audit triggers include check-in note writes.
4. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `lib/constants.ts`, `convex/seed.ts`, and `convex/functions.ts`.

### Out of Scope

- Check-in CRUD/query implementation
- Overdue nudge cron
- Check-in UI

---

## T02: Check-In Backend APIs + Overdue Nudge Cron

### Objective

Implement check-in lifecycle APIs, action-item toggling, review-compliance query surfaces, and daily overdue nudge automation.

### Estimated Effort

M

### Required Reading

- `notes/11-convex-architecture.md` - mutation/query/auth patterns
- `notes/features/20-ops-portal.md` - OPS activity context fields
- `convex/auth.helpers.ts` - permission and actor resolution
- `convex/crons.ts` - cron registration patterns
- `convex/notifications.ts` - event enqueue patterns for nudge delivery

### Key Rules

1. Implement in `convex/opsManagement.ts`:
   - `createCheckIn`
   - `updateCheckIn`
   - `toggleActionItem`
   - `listCheckInsForAgent`
   - `getReviewCompliance`
   - `getLatestCheckIn`
2. Mutations must enforce `requirePermission(ctx, "ops_management.write_checkins")`.
3. Limit `updateCheckIn` edits to within 24 hours from `created_at`.
4. `getReviewCompliance` must return totals, reviewed count, overdue count, and overdue agent list.
5. Register `checkin-overdue-nudge` cron at `08:00 UTC` daily.
6. Overdue nudge scope is CHECK-IN LEVEL only (`agents not reviewed in X days`); action-item due dates are informational in UI and are not cron-enforced.
7. Add audit action literals `ops_check_in.create`, `ops_check_in.update`, `ops_check_in.toggle_action_item` to `AUDIT_ACTIONS` and the audit_logs action validator.

### Deliverables

- [ ] `convex/opsManagement.ts` - check-in mutations/queries and compliance calculators
- [ ] `convex/crons.ts` - register `checkin-overdue-nudge` cron
- [ ] `convex/notifications.ts` - add check-in nudge event enqueue helpers
- [ ] `lib/constants.ts` and audit action validator - add `ops_check_in.create`, `ops_check_in.update`, `ops_check_in.toggle_action_item`

### Acceptance Criteria

1. Check-in create/update/list/toggle flows work with required permission checks.
2. 24-hour edit window is enforced for note updates.
3. Compliance query correctly identifies reviewed vs overdue agents.
4. Daily nudge cron emits events only for overdue check-ins (agents not reviewed within configured window).
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/opsManagement.ts`, `convex/crons.ts`, and `convex/notifications.ts`.

### Out of Scope

- Check-in dashboards/cards UI
- Warning escalation logic
- Monthly appraisal workflows

---

## T03: Check-In UI Components and Dashboard Integration

### Objective

Build form/history/compliance UI for weekly check-ins and integrate it into command center and agent profile workflows.

### Estimated Effort

M

### Required Reading

- `notes/06-admin-panel-ux.md` - form/table/detail patterns
- `src/components/admin/VerificationDialog.tsx` - react-hook-form + zod dialog style
- `src/components/admin/ops-command-center/AgentProfileSheet.tsx` - agent detail integration target from E01/E03
- `src/components/ui/date-picker.tsx` and `src/components/ui/textarea.tsx` - input component conventions

### Key Rules

1. Create `CheckInForm.tsx` with agent header context, notes, dynamic action items, optional sentiment, and next review date.
2. Create `CheckInHistory.tsx` with paginated entries, expandable details, and inline action-item completion toggles.
3. Implement/extend `ReviewComplianceCard.tsx` to show reviewed ratio, progress bar, and overdue agent quick actions.
4. Integrate check-in tab into `AgentProfileSheet.tsx` and compliance card section into command center top summary.
5. Use `react-hook-form` + `zod`, shadcn/ui primitives, and `sonner` for mutation feedback.
6. Add `opsManagement.getPreCheckInBrief` query that composes: last 7-day metrics vs previous 7 days (with delta values), open action items from previous check-in, current target progress, active warnings with evidence, pipeline snapshot with aging, and quality score trend (last 4 points).
7. Add `PreCheckInBrief.tsx` with a `Prepare Check-In` entry point on agent profile; brief content must be deterministic/composed data only (not AI-generated copy).

### Deliverables

- [ ] `src/components/admin/ops-command-center/CheckInForm.tsx` - create/edit check-in form
- [ ] `src/components/admin/ops-command-center/CheckInHistory.tsx` - per-agent history list with expandable details
- [ ] `src/components/admin/ops-command-center/ReviewComplianceCard.tsx` - review compliance visualization and overdue list actions
- [ ] `src/components/admin/ops-command-center/AgentProfileSheet.tsx` - add check-ins tab integration
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - wire check-in form/history/compliance sections
- [ ] `src/components/admin/ops-command-center/PreCheckInBrief.tsx` - pre-brief context panel with `Prepare Check-In` interaction
- [ ] `convex/opsManagement.ts` - `getPreCheckInBrief` query

### Acceptance Criteria

1. Check-in form submits notes and action items successfully.
2. History renders paginated entries with expandable full-note and action-item detail.
3. Action-item completion toggles update backend state and refresh UI.
4. Compliance card counts/percentages match backend query values.
5. "Review Now" actions open check-in form for targeted overdue agents.
6. Pre-check-in brief renders complete context in <2 seconds for any agent.
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on all changed files under `src/components/admin/ops-command-center/` and `src/app/(admin)/admin/ops-command-center/page.tsx`.

### Out of Scope

- Rich-text editor support
- Cross-persona (tenant/owner) review notes
- Quarterly performance review templates

---

## T04: Pre-Check-In Brief Composer

### Objective

Provide a focused pre-brief workflow that assembles the latest operational context before a 1:1 so reviewers enter check-ins with full evidence and trend visibility.

### Estimated Effort

M

### Required Reading

- `notes/features/20-ops-portal.md` - OPS performance and quality context signals
- `tasks/phase-46-ceo-ops-command-center/P46-E01-command-center-dashboard.md` - pipeline aging/fires contracts reused in brief
- `tasks/phase-46-ceo-ops-command-center/P46-E02-kpi-targets-tracking.md` - target progress query outputs used in pre-brief
- `tasks/phase-46-ceo-ops-command-center/P46-E03-warning-escalation-engine.md` - warning evidence fields and severity semantics

### Key Rules

1. `getPreCheckInBrief` must compose all required sections in one typed payload: 7-day vs previous-7-day metric deltas, prior open action items, current target progress, active warnings with evidence, pipeline aging snapshot, and last-4-point quality trend.
2. Data composition must stay read-only and deterministic; do not call any AI generation or external summarization service.
3. `PreCheckInBrief.tsx` should present sections in coaching order (performance delta -> commitments -> risks -> pipeline -> quality trend).
4. `Prepare Check-In` CTA on agent profile should open/render the pre-brief first and then allow direct transition into check-in form.
5. Keep brief fetch latency under 2 seconds for a typical agent by limiting payload fan-out and using indexed query paths.

### Deliverables

- [ ] `convex/opsManagement.ts` - hardened `getPreCheckInBrief` composition query with sectioned payload
- [ ] `src/components/admin/ops-command-center/PreCheckInBrief.tsx` - structured pre-check-in brief UI
- [ ] `src/components/admin/ops-command-center/AgentProfileSheet.tsx` - `Prepare Check-In` trigger and pre-brief rendering state

### Acceptance Criteria

1. Pre-brief shows all required context sections with real values and delta indicators.
2. Query output is non-AI composed data and remains deterministic for the same underlying records.
3. Reviewer can move from pre-brief directly to check-in form for the same agent.
4. Pre-brief data loads in under 2 seconds for any agent under normal local dev conditions.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/opsManagement.ts`, `src/components/admin/ops-command-center/PreCheckInBrief.tsx`, and `src/components/admin/ops-command-center/AgentProfileSheet.tsx`.

### Out of Scope

- AI-generated check-in narratives
- Auto-drafting action items
- Meeting transcription capture

---

## T05: Open Action Items Dashboard

### Objective

Expose all uncompleted check-in commitments in one command-center dashboard panel so Ops Head users can track accountability across the full team.

### Estimated Effort

M

### Required Reading

- `notes/06-admin-panel-ux.md` - dashboard panel and grouped list conventions
- `notes/10-convex-schema.md` - `ops_check_in_notes` nested action-item structure
- `src/components/admin/ops-command-center/CheckInHistory.tsx` - existing action-item rendering conventions

### Key Rules

1. Add `opsManagement.getOpenActionItems` query that scans `ops_check_in_notes` action items where `completed = false` across the last 90 days.
2. Query output must be grouped by agent and sorted by due date with overdue items first.
3. Each action row must include agent name, action description, due date, originating check-in date, and deep-link reference to source check-in.
4. Build `OpenActionItemsPanel.tsx` as a command-center tab/widget with grouped sections per agent and overdue badge styling.
5. Keep query read-only and scoped to unresolved commitments only.

### Deliverables

- [ ] `convex/opsManagement.ts` - `getOpenActionItems` query
- [ ] `src/components/admin/ops-command-center/OpenActionItemsPanel.tsx` - grouped open-action-items panel
- [ ] `src/app/(admin)/admin/ops-command-center/page.tsx` - integrate open action items dashboard section/tab

### Acceptance Criteria

1. Dashboard shows all open action items across team for last 90 days.
2. Overdue items are clearly highlighted and sorted before non-overdue items.
3. Items are grouped by agent and include link/navigation to originating check-in.
4. Panel updates reactively when action-item completion state changes.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/opsManagement.ts`, `src/components/admin/ops-command-center/OpenActionItemsPanel.tsx`, and `src/app/(admin)/admin/ops-command-center/page.tsx`.

### Out of Scope

- Automated escalation for overdue action items
- Cross-phase warning auto-creation from action items
- Non-OPS persona action-item aggregation

---

## Out of Scope (All Tasks)

- Formal appraisal/PIP workflows
- WhatsApp-based check-in reminders
- Compensation or payroll linkage

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-21

### What Was Built

- Added `ops_check_in_notes` schema coverage, check-in permission/config constants, and audit-action coverage.
- Implemented check-in backend lifecycle in `convex/opsManagement.ts` (`createCheckIn`, `updateCheckIn`, `toggleActionItem`, `listCheckInsForAgent`, `getLatestCheckIn`, `getReviewCompliance`, `getMyCheckIns`).
- Implemented overdue review nudge automation with `checkin-overdue-nudge` daily cron and P35 event enqueue integration.
- Implemented pre-check-in context composition (`getPreCheckInBrief`) and open commitments aggregation (`getOpenActionItems`).
- Delivered UI modules (`CheckInForm`, `CheckInHistory`, `ReviewComplianceCard`, `PreCheckInBrief`, `OpenActionItemsPanel`) and integrated them into command-center + agent profile flows.

### Key File Locations

| File                                                               | What                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `convex/schema.ts`                                                 | `ops_check_in_notes` table + indexes                                                 |
| `convex/opsManagement.ts`                                          | Check-in CRUD/toggle/compliance APIs, pre-brief query, open-action-items query       |
| `convex/crons.ts`                                                  | `checkin-overdue-nudge` cron registration                                            |
| `lib/constants.ts`                                                 | `ops_management.write_checkins`, check-in config key/default, check-in audit actions |
| `src/components/admin/ops-command-center/CheckInForm.tsx`          | Check-in create/edit form                                                            |
| `src/components/admin/ops-command-center/CheckInHistory.tsx`       | Agent check-in timeline/history view                                                 |
| `src/components/admin/ops-command-center/ReviewComplianceCard.tsx` | Team review-compliance card and actions                                              |
| `src/components/admin/ops-command-center/PreCheckInBrief.tsx`      | Deterministic check-in prep context panel                                            |
| `src/components/admin/ops-command-center/OpenActionItemsPanel.tsx` | Team-wide open commitments panel                                                     |

### Deviations from Spec

- `updateCheckIn` enforces a strict 24-hour edit window from creation time.
- Overdue nudge automation is check-in-level only (action-item due dates remain informational and are not cron-escalated).
- Pre-brief composition is deterministic and query-derived; no AI summarization step is used.

### Gotchas for Next Epic

- Action item toggles require manager write-checkins permission and patch nested arrays by index; stale UI index assumptions can cause mutation failures if data refresh is skipped.
- Overdue recipient fallback notifies active admins when no valid reviewer recipient is available.
- Open action items query scope is rolling 90 days; older unresolved commitments are intentionally excluded.
