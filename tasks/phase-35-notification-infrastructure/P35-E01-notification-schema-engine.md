---
id: P35-E01
title: Notification Schema & Engine
phase: 35
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P35-E01: Notification Schema & Engine

## Task Queue

- [ ] P35-E01-T01: Add notification tables and indexes
- [ ] P35-E01-T02: Define event type and template contracts
- [ ] P35-E01-T03: Build notification trigger orchestration function
- [ ] P35-E01-T04: Add enqueue/dequeue lifecycle and retry metadata

---

## T01: Add Notification Tables and Indexes

### Objective

Create core notification storage for events, deliveries, templates, and recipient preferences.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — Schema, canonical channel model, delivery policy algorithm
- `tasks/phase-35-notification-infrastructure/README.md` — dependency and function coverage contracts
- `notes/10-convex-schema.md` — schema/index conventions and validator patterns
- `notes/13-constants-reference.md` — enum naming/style conventions

### Key Rules

1. Treat `IN_APP` as a canonical notification channel in `notifications`; provider dispatch adapters apply only to `PUSH`, `WHATSAPP`, `SMS`, and `EMAIL`.
2. Use Unix ms for all timestamps and keep quiet-hours as `HH:MM` strings with timezone-aware interpretation.
3. Add indexes for unread feed lookup, queue scans, retry scans, and admin dead-letter inspection.
4. Keep schema additive and backward-compatible; do not remove existing entities or alter unrelated tables.

### Deliverables

- [ ] `convex/schema.ts` — add `notification_preferences`, `notification_events`, `notification_templates`, `notifications` tables with required fields/indexes
- [ ] `lib/constants.ts` — add notification enums for channel/category/status/severity and defaults used by schema consumers
- [ ] `notes/features/27-notification-infrastructure.md` — schema table documentation matches implementation fields exactly

### Acceptance Criteria

1. `notification_preferences` includes `quiet_hours_start`, `quiet_hours_end`, and `timezone` as optional string fields.
2. `notification_events` stores canonical event envelope + processing flags; per-channel delivery outcomes live in `notifications` rows.
3. `notification_templates` enforces `(event_type, channel, locale)` uniqueness via index strategy.
4. `notifications` supports unread badge queries by user and read state with efficient indexes.
5. All new tables/indexes compile with generated Convex types and no TypeScript errors.

### Verification

```bash
npx convex codegen
npx tsc --noEmit
npm run build
```

## T02: Define Event Type and Template Contracts

### Objective

Standardize notification event enums and template payload shape for all channels.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — event categories, locale fallback, webhook/event emission contract
- `tasks/phase-35-notification-infrastructure/README.md` — category ownership and function coverage matrix
- `notes/08-i18n.md` — ICU/message formatting expectations
- `notes/13-constants-reference.md` — enum conventions

### Key Rules

1. Event/category/channel enums must be shared constants, not duplicated string literals.
2. Template contracts must support ICU placeholders and locale fallback to `en`.
3. Contract validation must fail fast for missing payload variables or unknown event types.
4. Event contract must include optional `dedup_key` for 5-minute dedup window enforcement.

### Deliverables

- [ ] `lib/constants.ts` — `NotificationEventType`, `NotificationCategory`, `NotificationChannel`, `NotificationStatus`, `NotificationSeverity`
- [ ] `lib/notificationContracts.ts` — normalized emit payload and template-variable contract types
- [ ] `convex/notificationTemplates.ts` — template list/upsert contract validators and locale fallback helpers

### Acceptance Criteria

1. `emitEvent` payload contract requires `user_id`, `event_type`, `category`, `severity`, and `payload`.
2. `dedup_key` is optional but validated when present.
3. Template rendering contract validates required placeholders before channel dispatch.
4. Locale resolution follows user preference -> template locale -> `en` fallback.
5. Backend and UI imports resolve shared notification constants from one source.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T03: Build Notification Trigger Orchestration Function

### Objective

Implement a central trigger function that maps domain events to recipient lists and channels.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — delivery policy algorithm and business rules
- `tasks/phase-35-notification-infrastructure/README.md` — cross-phase integration contract
- `notes/11-convex-architecture.md` — internal mutation orchestration patterns
- `notes/03-roles-and-permissions.md` — role-aware targeting constraints

### Key Rules

1. All emitters must call `internal.notifications.emitEvent`; no direct provider calls from domain mutations.
2. Always create `IN_APP` notifications for user-visible events before channel dispatch.
3. Quiet-hours defer non-urgent external sends; urgent events bypass quiet-hours.
4. Preference checks and opt-outs are evaluated at dispatch time using latest user settings.

### Deliverables

- [ ] `convex/notifications.ts` — `internal.notifications.emitEvent` implementation with dedup, preference resolution, and queue write
- [ ] `convex/notifications.ts` — helper functions for quiet-hours checks, channel selection, and template resolution
- [ ] `convex/functions.ts` — exported wrappers for notification mutations/internal mutations with audit-safe imports

### Acceptance Criteria

1. One domain event can enqueue deterministic deliveries for one or many recipients.
2. Every queued event creates an `IN_APP` row regardless of external channel enablement.
3. Channel dispatch selection respects per-category preferences and hard WhatsApp opt-out.
4. Dedup key suppresses duplicates within configured dedup window.
5. Deferred notifications remain queued for retry processing and respect quiet-hours with `URGENT` bypass behavior.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T04: Add Enqueue/Dequeue Lifecycle and Retry Metadata

### Objective

Support delivery queue state transitions and resilient retries with capped attempts.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — retry/backoff and dead-letter behavior
- `tasks/phase-35-notification-infrastructure/README.md` — required internal functions (`processQueue`, `retryFailed`)
- `notes/11-convex-architecture.md` — cron/internal job patterns
- `notes/04-state-machines.md` — transition-validation discipline

### Key Rules

1. Retry/backoff is channel-specific and must match canonical policy from feature spec.
2. Permanent failures move to dead-letter after max retries with final error snapshot.
3. Queue processor must be idempotent and safe for concurrent worker execution.
4. Status transitions must follow canonical notification states: `PENDING` -> `SENT` -> `DELIVERED`, failure path through `FAILED`, and `DELIVERED` -> `READ` for `IN_APP`.

### Deliverables

- [ ] `convex/notifications.ts` — `internal.notifications.processQueue` for pending/deferred dispatches
- [ ] `convex/notifications.ts` — `internal.notifications.retryFailed` for retry-eligible failures and dead-letter transition
- [ ] `convex/crons.ts` — scheduled queue processing and retry jobs
- [ ] `convex/notifications.ts` — dead-letter query contract for admin monitor use

### Acceptance Criteria

1. Failed sends increment retry count and set next retry timestamp per channel policy.
2. Retry engine stops at channel max attempts and keeps status `FAILED` (dead-letter semantics).
3. `processQueue` processes unprocessed events and creates notification rows without duplicate fan-out.
4. Dead-letter query output includes notification id, channel, retry_count, max_retries, last_error, and payload snapshot.
5. Queue/retry flow remains deterministic across re-runs (no duplicate final deliveries).

### Verification

```bash
npx convex codegen
npx tsc --noEmit
npm run build
```
