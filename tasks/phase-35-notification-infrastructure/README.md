# Phase 35: Notification Infrastructure (P35)

## Overview

Establish a multi-channel notification foundation that supports in-app, push, WhatsApp, SMS, and email delivery with shared templates, preferences, and throttling controls.

## Dependencies

### Hard Dependencies (must be complete before P35)

- **P01 (Auth)**: User identity for notification targeting
- **P14 (i18n)**: Locale infrastructure for template resolution

### Reverse Dependencies (consume P35 output)

- **P21 (Support CRM)**: Emits support-related notification events
- **P29 (Ops Intelligence)**: Consumes unread/admin monitor contracts for admin bell and operational alert surfaces
- **P30 (Field Ops)**: Emits checklist/document notification events
- **P37 (Post-Move-In)**: Emits maintenance/lease notification events

### Independent (no dependency)

- P35 notification infrastructure is self-contained. Channel adapters (FCM, WhatsApp, SMS, Email) are configured via environment variables and do not depend on other phases.

## Cross-Phase Integration Contracts

### How Other Phases Emit Notifications

Any phase that needs to send notifications MUST call:

```typescript
await ctx.runMutation(internal.notifications.emitEvent, {
  user_id, // Id<"users">
  event_type, // string
  category, // LEAD_UPDATE | VISIT_UPDATE | PAYOUT_UPDATE | INQUIRY_UPDATE | MAINTENANCE_UPDATE | MOVE_IN_REMINDER | SYSTEM_ALERT
  severity, // NORMAL | IMPORTANT | URGENT
  payload, // Record<string, unknown>
  dedup_key, // optional
});
```

### P35 vs P24 (Chat) Boundary

- P24 batching: Content-level batching for PII masking in chat messages.
- P35 retry/dead-letter: Delivery-level reliability for notification channels.
- These are SEPARATE pipelines. P35 does not batch chat content. P24 does not handle notification delivery.

### Notification Category Ownership

| Category             | Owner Phase | Example Events                         |
| -------------------- | ----------- | -------------------------------------- |
| `LEAD_UPDATE`        | P04         | Lead status change, need-info request  |
| `VISIT_UPDATE`       | P07         | Visit scheduled, completed, cancelled  |
| `PAYOUT_UPDATE`      | P09         | Payout approved, disbursed, failed     |
| `INQUIRY_UPDATE`     | P19         | Inquiry status change, bounty posted   |
| `MAINTENANCE_UPDATE` | P37         | Ticket created, assigned, resolved     |
| `MOVE_IN_REMINDER`   | P37         | Lease start approaching, checklist due |
| `SYSTEM_ALERT`       | P35         | System announcements, security alerts  |

## Function Coverage Matrix

| Function                              | Epic | Type             |
| ------------------------------------- | ---- | ---------------- |
| `internal.notifications.emitEvent`    | E01  | internalMutation |
| `internal.notifications.processQueue` | E01  | internalMutation |
| `internal.notifications.retryFailed`  | E01  | internalMutation |
| `notifications.getMyNotifications`    | E04  | query            |
| `notifications.markRead`              | E04  | mutation         |
| `notifications.markAllRead`           | E04  | mutation         |
| `notifications.getUnreadCount`        | E04  | query            |
| `notifications.adminList`             | E04  | query            |
| `notifications.adminGetDeadLetter`    | E04  | query            |
| `notificationPreferences.get`         | E04  | query            |
| `notificationPreferences.update`      | E04  | mutation         |
| `notificationTemplates.list`          | E01  | query            |
| `notificationTemplates.upsert`        | E01  | mutation         |
| `actions.notifications.sendPush`      | E02  | action           |
| `actions.notifications.sendWhatsApp`  | E03  | action           |
| `actions.notifications.sendSMS`       | E03  | action           |
| `actions.notifications.sendEmail`     | E03  | action           |

## Epic Ownership (Single Owner Boundaries)

To avoid overlap between E01/E03/E04, ownership is explicit:

- **E01 owns**: schema contracts, enum/contract normalization, `emitEvent` + queue orchestration (`processQueue`, `retryFailed`), routing policy, quiet-hours evaluation, template resolution helpers, and admin dead-letter query contracts.
- **E02 owns**: push subscription lifecycle, service-worker push UX, and `actions.notifications.sendPush` adapter.
- **E03 owns**: external provider adapters for `sendWhatsApp`, `sendSMS`, `sendEmail`, plus provider receipt/error normalization.
- **E04 owns**: user-facing in-app feed, bell, unread/read UX, and user preference management (`notifications.getMyNotifications`, `notificationPreferences.get`, `notificationPreferences.update`).

If an epic references a cross-cutting concern owned by another epic, it may consume that contract but does not redefine or own it.

## Key Documentation

- `notes/01-tech-stack.md`
- `notes/features/20-ops-portal.md`
- `notes/10-convex-schema.md`
- `notes/11-convex-architecture.md`
- `notes/13-constants-reference.md`

## Epics

| ID      | Title                              | Tasks | Status  | Depends On                  | Priority |
| ------- | ---------------------------------- | ----- | ------- | --------------------------- | -------- |
| P35-E01 | Notification Schema & Engine       | 4     | pending | []                          | Critical |
| P35-E02 | Push Notification Channel          | 3     | pending | [P35-E01]                   | High     |
| P35-E03 | WhatsApp & SMS Channels            | 4     | pending | [P35-E01]                   | High     |
| P35-E04 | In-App Notifications & Preferences | 4     | pending | [P35-E01, P35-E02, P35-E03] | High     |

## Dependency Graph

- `P35-E01 -> P35-E02`
- `P35-E01 -> P35-E03`
- `P35-E01 + P35-E02 + P35-E03 -> P35-E04`

## Completion Criteria

- [ ] Notification tables and event/type enums are added with template bindings
- [ ] Event trigger engine can enqueue notifications for role-scoped recipients
- [ ] Web Push subscriptions are managed and used for delivery fan-out
- [ ] WhatsApp and SMS channels are integrated through Convex Actions with retry handling
- [ ] In-app notification feed and bell UI render unread counts and timeline entries
- [ ] Notification preferences support channel toggles, throttling, and quiet hours

## File Tree

```text
phase-35-notification-infrastructure/
  README.md
  P35-E01-notification-schema-engine.md
  P35-E02-push-notification-channel.md
  P35-E03-whatsapp-sms-channels.md
  P35-E04-in-app-notifications-preferences.md
```

## Scope Boundaries

- In scope: event-driven notification engine, delivery channels, in-app feed, user preferences
- Out of scope: marketing campaign automation, A/B testing for templates, voice call notifications
