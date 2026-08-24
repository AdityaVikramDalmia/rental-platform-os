---
id: P37-E04
title: Tenant Dashboard UI
phase: 37
status: pending
depends_on: ["P37-E01", "P37-E02", "P37-E03"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P37-E04: Tenant Dashboard UI

## Overview

Build the tenant-facing Resident Hub UI for post-move-in lifecycle management across rent tracking, maintenance operations, renewal, and move-out workflows.

## Task Queue

- [ ] P37-E04-T01: Build resident hub page shell with lifecycle navigation tabs
- [ ] P37-E04-T02: Build rent payment history and receipt download experience
- [ ] P37-E04-T03: Build maintenance ticket submission and tracking UI
- [ ] P37-E04-T04: Build lease renewal status and move-out request UI

---

## T01: Build Resident Hub Page Shell With Lifecycle Navigation Tabs

### Objective

Create `/tenant/home` shell with tabbed information architecture for overview, rent, maintenance, and lease/move-out workflows.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Tenant routes remain tenant-auth protected and must not leak owner/admin controls.
2. Mobile-first layout is mandatory; desktop expands panels without breaking tab flow.
3. Tabs map directly to backend query contracts from E01-E03.
4. Use existing shadcn/ui components for tabs, cards, forms, badges, and dialogs.
5. Loading/error states must be explicit and actionable.

### Deliverables

- [ ] `src/app/(tenant)/tenant/home/page.tsx` - resident hub route shell with tab layout
- [ ] `src/components/tenant/resident-hub/ResidentHubTabs.tsx` - reusable lifecycle tab navigation
- [ ] `src/components/tenant/resident-hub/ResidentHubOverview.tsx` - summary panel (resident, lease, key alerts)

### Acceptance Criteria

1. `/tenant/home` renders only for authenticated tenant users.
2. Page shows tabs for Overview, Rent, Maintenance, and Lease/Move-Out.
3. Mobile layout does not overflow at common device widths.
4. Desktop layout preserves same information architecture with adaptive spacing.
5. Skeleton/loading and empty states exist for each tab.
6. API failures show non-blocking error cards/toasts with retry controls.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T02: Build Rent Payment History and Receipt Download Experience

### Objective

Implement rent timeline UI showing canonical rent lifecycle entries and receipt contract download actions.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. All amounts display INR from paise (`amount_paise / 100`) using locale-safe formatting.
2. Receipt action is enabled only for eligible canonical payment states (for example `PAID` or `PARTIALLY_PAID` per backend contract).
3. Rent states and badge labels match constants exactly.
4. UI must expose payment reference/mode when present.
5. Download/view interactions should be non-blocking with proper progress feedback.

### Deliverables

- [ ] `src/components/tenant/resident-hub/RentSummaryCard.tsx` - next due + outstanding summary
- [ ] `src/components/tenant/resident-hub/RentHistoryList.tsx` - month-wise rent records with statuses
- [ ] `src/components/tenant/resident-hub/ReceiptActions.tsx` - receipt generation/view/download interactions

### Acceptance Criteria

1. Rent tab shows upcoming due amount/date and historical records list.
2. Records display canonical status badges (`UPCOMING`, `DUE`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `WAIVED`).
3. Receipt actions appear only for eligible records and call receipt query contract.
4. Receipt rows show month label, amount, payment mode/reference, and issued timestamp.
5. Empty history state is clear and does not break tab layout.
6. Currency/date formatting follows project conventions.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T03: Build Maintenance Ticket Submission and Tracking UI

### Objective

Allow tenants to create tickets and track progress/escalation status from a dedicated maintenance tab.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Submission form uses `react-hook-form` + `zod` validation.
2. Category/severity options are sourced from constants, not hardcoded magic strings.
3. Ticket timeline reflects backend transition truth; no client-only status simulation.
4. Escalation/SLA risk is visible in list cards.
5. Photo attachments use existing upload conventions and limits.

### Deliverables

- [ ] `src/components/tenant/resident-hub/MaintenanceTicketForm.tsx` - create-ticket form UI
- [ ] `src/components/tenant/resident-hub/MaintenanceTicketList.tsx` - list + filter + status timeline
- [ ] `src/components/tenant/resident-hub/MaintenanceTicketCard.tsx` - per-ticket detail card with SLA indicator

### Acceptance Criteria

1. Tenant can submit maintenance ticket with category, severity, title, description, and optional photos.
2. Submitted tickets appear in list with current status and assignee context.
3. SLA-risk/escalated tickets are visually distinguishable.
4. Ticket detail includes created date, latest update, and resolution notes when available.
5. Form validation blocks invalid submissions with inline errors.
6. List handles empty, loading, and error states cleanly.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T04: Build Lease Renewal Status and Move-Out Request UI

### Objective

Implement tenant lease lifecycle panel showing renewal negotiations and move-out request/settlement visibility.

### Required Reading

- `notes/features/29-post-move-in-lifecycle.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `notes/11-convex-architecture.md`
- `notes/04-state-machines.md`

### Key Rules

1. Renewal status UI must map exactly to backend renewal states.
2. Move-out request flow requires explicit date confirmation.
3. Settlement preview values must display paise-based totals and deduction breakdown.
4. Mutating actions are gated by resident status eligibility.
5. Notification-triggering actions should provide clear success/error feedback.

### Deliverables

- [ ] `src/components/tenant/resident-hub/LeaseRenewalPanel.tsx` - renewal status, responses, and timeline
- [ ] `src/components/tenant/resident-hub/MoveOutRequestDialog.tsx` - move-out request flow
- [ ] `src/components/tenant/resident-hub/SettlementPreviewCard.tsx` - computed settlement breakdown view

### Acceptance Criteria

1. Lease panel shows current renewal status, proposed terms, and actor responses.
2. Tenant can initiate move-out request with planned date and receives confirmation feedback.
3. Settlement preview shows deposit, deductions, total deductions, and refund amount.
4. Invalid or ineligible move-out actions are blocked with clear errors.
5. UI state updates correctly after renewal response or move-out request mutations.
6. Navigation between tabs preserves context without data loss.

### Verification

```bash
npx tsc --noEmit
npm run build
```
