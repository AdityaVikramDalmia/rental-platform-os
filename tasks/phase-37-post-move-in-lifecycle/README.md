# Phase 37: Post-Move-In Lifecycle (P37)

## Overview

Extend the product beyond closure with resident operations: rent tracking, maintenance ticketing, lease renewal, move-out workflows, and a tenant home dashboard for ongoing relationship management.

## Dependencies

### Hard Dependencies (must be complete before P37)

- **P01 (Auth)**: User identity for resident profiles
- **P08 (Closures)**: Closure confirmation triggers resident activation
- **P31 (Owner Entity)**: Owner identity resolution for resident-owner linkage

### Soft Dependencies (P37 integrates with but can stub)

- **P34 (Transaction Rails)**: Preferred activation trigger; falls back to closure confirmation
- **P35 (Notifications)**: Event emission; can be stubbed with no-op internal function

### Reverse Dependencies (consume P37 output)

- **P38 (Owner Portal)**: Reads resident and maintenance data via owner-scoped queries

## Locked Cross-Phase Decisions

1. **Resident activation trigger**: `rental_transactions.COMPLETED` (P34); fallback `closures.CONFIRMED` (P08).
2. **Owner linkage**: `resident_profiles.owner_id` → `owners._id` (P31); `owner_user_id` optional denormalized.
3. **Notification emission**: P37 calls `internal.notifications.emitEvent` (P35 API); does NOT implement delivery.
4. **Referral milestone**: Resident activation can trigger `internal.referrals.checkPostMoveInMilestone` (P22).
5. **P37 does NOT depend on P38**: P38 reads P37 data; P37 does not read P38 data.

## Function Coverage Matrix

| Function                                      | Epic | Type                    |
| --------------------------------------------- | ---- | ----------------------- |
| `residentProfiles.activate`                   | E01  | internalMutation        |
| `residentProfiles.getByTenant`                | E01  | query                   |
| `residentProfiles.getByOwner`                 | E01  | query                   |
| `residentProfiles.getByListing`               | E01  | query                   |
| `rentRecords.recordPayment`                   | E01  | mutation                |
| `rentRecords.generateReceipt`                 | E01  | query                   |
| `rentRecords.listByResident`                  | E01  | query                   |
| `maintenanceTickets.create`                   | E02  | mutation                |
| `maintenanceTickets.assign`                   | E02  | mutation                |
| `maintenanceTickets.updateStatus`             | E02  | mutation                |
| `maintenanceTickets.listByResident`           | E02  | query                   |
| `maintenanceTickets.listByProperty`           | E02  | query                   |
| `maintenanceTickets.adminList`                | E02  | query                   |
| `leaseRenewals.initiate`                      | E03  | mutation                |
| `leaseRenewals.respondToRenewal`              | E03  | mutation                |
| `leaseRenewals.requestMoveOut`                | E03  | mutation                |
| `leaseRenewals.computeSettlement`             | E03  | query                   |
| `leaseRenewals.approveSettlement`             | E03  | mutation                |
| `internal.residentProfiles.checkSLAs`         | E01  | internalMutation (cron) |
| `internal.residentProfiles.sendRentReminders` | E01  | internalMutation (cron) |

## Cron Ownership

SLA checking cron (`check-resident-slas`) is owned by E01. E02 only implements the maintenance mutation handlers that the cron calls.

## Key Documentation

- `notes/features/20-deal-economics.md`
- `notes/features/14-owner-services.md`
- `notes/04-state-machines.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`

## Epics

| ID      | Title                         | Tasks | Status  | Depends On                  | Priority |
| ------- | ----------------------------- | ----- | ------- | --------------------------- | -------- |
| P37-E01 | Resident Hub Schema & Backend | 3     | pending | []                          | Critical |
| P37-E02 | Maintenance Ticketing         | 4     | pending | [P37-E01]                   | High     |
| P37-E03 | Lease Renewal & Move-Out      | 4     | pending | [P37-E01, P37-E02]          | High     |
| P37-E04 | Tenant Dashboard UI           | 4     | pending | [P37-E01, P37-E02, P37-E03] | High     |

## Dependency Graph

- `P37-E01 -> P37-E02`
- `P37-E01 + P37-E02 -> P37-E03`
- `P37-E01 + P37-E02 + P37-E03 -> P37-E04`

## Completion Criteria

- [ ] Resident profile and rent tracking schema are created with lifecycle-safe mutations
- [ ] Maintenance ticketing supports routing, SLA tracking, escalation flags, and canonical status transitions
- [ ] Lease renewal and move-out workflows capture checklist and deposit settlement
- [ ] Tenant dashboard `/tenant/home` shows rent records, maintenance status, lease context, and support contacts
- [ ] Post-move workflows integrate with notification triggers for reminders and SLA updates

## File Tree

```text
phase-37-post-move-in-lifecycle/
  README.md
  P37-E01-resident-hub-schema-backend.md
  P37-E02-maintenance-ticketing.md
  P37-E03-lease-renewal-move-out.md
  P37-E04-tenant-dashboard-ui.md
```

## Scope Boundaries

- In scope: resident records, rent receipt generation contract, maintenance lifecycle, renewal/move-out, tenant home UX
- Out of scope: utility bill payments, legal eviction workflows, community social features
