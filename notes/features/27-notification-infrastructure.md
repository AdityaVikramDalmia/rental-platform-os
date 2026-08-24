# Feature: Notification Infrastructure

> **Priority**: #35 in implementation order
> **Personas**: All (Guard, Tenant, Owner, Admin, OPS)
> **Dependencies**: P01 (Auth), P14 (i18n)
> **Route Groups**: All route groups

> **Implementation Note (Feb 2026):** The implementation diverges from this spec in several areas:
>
> - Delivery status tracked on `notification_events.channel_status`, not `notifications` rows
> - Permissions: `notifications.view`, `notifications.manage`, `notification_templates.manage` (not `notifications.view_admin`/`notifications.send_system`)
> - Config keys: `notification_max_retries`, `notification_retry_base_ms`, `notification_quiet_hours_start`, `notification_quiet_hours_end`
> - Templates use `{{var}}` substitution, not ICU format

## Purpose

Notification Infrastructure introduces a single event-driven system for transactional messaging across all personas. It centralizes template rendering, channel selection, retries, quiet-hours behavior, and in-app inbox delivery so every product flow (lead, visit, payout, inquiry, maintenance, move-in) emits notifications consistently.

The canonical channel set is five channels: `PUSH`, `WHATSAPP`, `SMS`, `EMAIL`, `IN_APP`.

### Event Categories

- `LEAD_UPDATE`
- `VISIT_UPDATE`
- `PAYOUT_UPDATE`
- `INQUIRY_UPDATE`
- `MAINTENANCE_UPDATE`
- `MOVE_IN_REMINDER`
- `SYSTEM_ALERT`

## Entities Involved

- `notification_preferences` table (per-user channel toggles + category settings)
- `notification_events` table (event ledger + processing state)
- `notification_templates` table (localized template store for external channels)
- `notifications` table (per-channel notification delivery records, including `IN_APP`)
- `users` table (read-only recipient identity/persona context)
- Existing domain tables that emit events: `leads`, `visits`, `payouts`, `tenant_inquiries`, `maintenance_tickets`, and related lifecycle tables

## Flows

### Flow 1: Domain Event -> Event Queue

```text
1. A domain mutation changes state (example: visit status update)
2. Mutation calls internal.notifications.emitEvent(...) with recipient, category, severity, payload
3. emitEvent writes notification_events row with processed=false
4. Dedup key check drops duplicate events inside notification_dedup_window_ms
```

### Flow 2: Event Processing -> Notification Rows

```text
1. Cron process-notification-queue fetches unprocessed events
2. Always create an IN_APP notifications row for the event
3. Resolve user notification_preferences and category toggles
4. For each enabled external channel (PUSH/WHATSAPP/SMS/EMAIL):
   - resolve template (event_type + channel + locale)
   - interpolate payload into title/body
   - insert notifications row with status=PENDING
5. Mark notification_events.processed=true with processed_at
```

### Flow 3: Delivery + Retry

```text
1. Cron retry-failed-notifications scans notifications where status in (PENDING, FAILED)
2. For each row with retry_count < max_retries:
   - call channel action adapter
   - on dispatch success set SENT, then DELIVERED when confirmed
   - on failure increment retry_count and keep/rewrite FAILED
3. When retry_count reaches max_retries, status remains FAILED and row is treated as dead-letter
```

### Flow 4: In-App Bell and Read State

```text
1. Bell subscribes to notifications for authenticated user
2. Unread badge is derived from IN_APP rows where read_at is null
3. markRead / markAllRead set read_at timestamps
4. READ transition applies to IN_APP rows only
```

## User Stories

### Guard: Receive Visit and Lead Updates Quickly

**As a guard**, I want high-signal operational updates on external channels plus in-app history, so I do not miss earning opportunities.

**Acceptance Criteria**:

- Guard defaults can prioritize external channels while preserving `IN_APP` history
- Guard can toggle channels and categories in notification settings
- `VISIT_UPDATE` and `LEAD_UPDATE` templates are localized
- Guard-facing copy supports `en`, `hi`, and `hinglish`

### Tenant: Track Inquiry Progress in Push + In-App

**As a tenant**, I want push alerts and in-app timeline history for inquiry progress, so I can act quickly and review context later.

**Acceptance Criteria**:

- Tenant receives push for `INQUIRY_UPDATE` when enabled
- In-app feed stores matching timeline entries
- Quiet-hours suppression applies to non-urgent external sends

### Owner: Receive Concise Multi-Channel Updates

**As an owner**, I want concise updates with configurable channel preferences, so communication stays actionable and not noisy.

**Acceptance Criteria**:

- Owner preferences can enable/disable `WHATSAPP`, `SMS`, `EMAIL`, and `PUSH`
- Retries are applied per-channel up to configured max attempts
- In-app history remains available regardless of external channel outcome

### Admin: Monitor Delivery Health by Channel

**As an admin**, I want delivery health visibility by channel and category, so I can tune templates and provider reliability.

**Acceptance Criteria**:

- Admin monitor exposes success/failure by channel + category
- Dead-letter view is represented by `FAILED` notifications with exhausted retries
- Time-window filters follow existing admin analytics conventions

---

## Convex Functions

### Queries

```ts
notifications.getMyNotifications({ cursor?, category?, channel?, status? })
  => { notifications: NotificationItem[]; nextCursor?: string }

notifications.getUnreadCount()
  => { unread_count: number }

notificationPreferences.get()
  => NotificationPreference | null

notificationTemplates.list({ event_type?, channel?, locale? })
  => NotificationTemplate[]

notificationAnalytics.getDeliveryMetrics({ date_from?, date_to?, category?, channel? })
  => { sent: number; delivered: number; failed: number; read_rate?: number }
```

### Mutations

```ts
notificationPreferences.update({
  channel_push,
  channel_whatsapp,
  channel_sms,
  channel_email,
  categories,
  quiet_hours_start?,
  quiet_hours_end?,
  timezone?,
  locale?,
}) => NotificationPreference

notifications.markRead({ notification_id })
  => Notification

notifications.markAllRead()
  => { updated_count: number }

notificationTemplates.upsert({ event_type, channel, locale, title_template, body_template, is_active })
  => NotificationTemplate

notificationTemplates.setActive({ template_id, is_active })
  => NotificationTemplate
```

### Internal Functions

```ts
internal.notifications.emitEvent({
  user_id,
  event_type,
  category,
  severity,
  payload,
  dedup_key?,
}) => { event_id: Id<"notification_events"> }

internal.notifications.processQueue({ limit? })
  => { processed: number; enqueued: number; skipped: number }

internal.notifications.retryFailed({ limit? })
  => { attempted: number; delivered: number; failed: number }
```

### Actions (External Channels)

```ts
actions.notifications.sendPush({ user_id, notification_id, title, body, metadata? })
actions.notifications.sendWhatsApp({ user_id, notification_id, template_name, params })
actions.notifications.sendSMS({ user_id, notification_id, text })
actions.notifications.sendEmail({ user_id, notification_id, subject, html?, text? })
```

### Admin Notification Queries

```typescript
notifications.adminList({
  status?: NotificationStatus,
  channel?: NotificationChannel,
  category?: NotificationCategory,
  user_id?: Id<"users">,
  from_ts?: number,
  to_ts?: number,
  cursor?: string,
  limit?: number,
}) => {
  items: Array<{
    _id: Id<"notifications">;
    user_id: Id<"users">;
    event_id?: Id<"notification_events">;
    channel: "PUSH" | "WHATSAPP" | "SMS" | "EMAIL" | "IN_APP";
    status: "PENDING" | "SENT" | "DELIVERED" | "FAILED" | "READ";
    title: string;
    body: string;
    retry_count: number;
    max_retries: number;
    last_error?: string;
    delivered_at?: number;
    read_at?: number;
  }>;
  nextCursor: string | null;
  totalCount: number;
}

notifications.adminGetDeadLetter({
  from_ts?: number,
  to_ts?: number,
  channel?: NotificationChannel,
  cursor?: string,
  limit?: number,
}) => {
  items: Array<{
    notification_id: Id<"notifications">;
    event_id?: Id<"notification_events">;
    channel: NotificationChannel;
    user_id: Id<"users">;
    retry_count: number;
    max_retries: number;
    last_error?: string;
    payload_snapshot?: object;
  }>;
  nextCursor: string | null;
}
```

### Locale Resolution for Templates

Template resolution follows this priority:

1. `notification_preferences.locale` when set
2. system/app default locale (`en` fallback)
3. template fallback to `en` if requested locale template is missing

Template variables use ICU MessageFormat syntax (same as `next-intl`):

- `{userName}`, `{amount, number, inr}`, `{date, date, short}`

### Webhook/Event Emission Contract

Notification events are emitted by other phases. Each emitting phase calls:

```typescript
await ctx.runMutation(internal.notifications.emitEvent, {
  user_id: targetUserId,
  event_type: "LEAD_STATUS_CHANGED",
  category: "LEAD_UPDATE",
  severity: "NORMAL", // NORMAL | IMPORTANT | URGENT
  payload: { lead_id, old_status, new_status },
  dedup_key: `lead_status_${lead_id}_${new_status}`,
});
```

Dedup prevents duplicate events within `notification_dedup_window_ms`.

## Downstream Consumer Contracts

P35 exposes one canonical producer API consumed by downstream phases:

```ts
internal.notifications.emitEvent({
  user_id: Id<"users">,
  event_type: string,
  category:
    | "LEAD_UPDATE"
    | "VISIT_UPDATE"
    | "PAYOUT_UPDATE"
    | "INQUIRY_UPDATE"
    | "MAINTENANCE_UPDATE"
    | "MOVE_IN_REMINDER"
    | "SYSTEM_ALERT",
  severity: "NORMAL" | "IMPORTANT" | "URGENT",
  payload: Record<string, unknown>,
  dedup_key?: string,
})
```

- **P21 (Support CRM)** consumes this contract for support/admin operational notifications.
- **P30 (Field Ops)** consumes this contract for checklist/document/ops lifecycle notifications.
- **P37 (Post-Move-In)** consumes this contract for maintenance, rent, and move-in reminder notifications.

---

## Schema (Canonical)

> **Note**: `object` fields map to `v.any()` in Convex schema validators.

### `notification_preferences` Table

| Field               | Type        | Required | Description                           |
| ------------------- | ----------- | -------- | ------------------------------------- |
| `user_id`           | Id<"users"> | yes      | Target user                           |
| `channel_push`      | boolean     | yes      | Push notifications enabled            |
| `channel_whatsapp`  | boolean     | yes      | WhatsApp notifications enabled        |
| `channel_sms`       | boolean     | yes      | SMS notifications enabled             |
| `channel_email`     | boolean     | yes      | Email notifications enabled           |
| `categories`        | object      | yes      | Per-category boolean enablement map   |
| `quiet_hours_start` | string      | no       | `HH:MM` format quiet hours start      |
| `quiet_hours_end`   | string      | no       | `HH:MM` format quiet hours end        |
| `timezone`          | string      | no       | IANA timezone, default `Asia/Kolkata` |
| `locale`            | string      | no       | Preferred notification locale         |

`categories` object keys:

- `LEAD_UPDATE`
- `VISIT_UPDATE`
- `PAYOUT_UPDATE`
- `INQUIRY_UPDATE`
- `MAINTENANCE_UPDATE`
- `MOVE_IN_REMINDER`
- `SYSTEM_ALERT`

**Indexes**: `by_user_id`

### `notification_events` Table

| Field          | Type        | Required | Description                                 |
| -------------- | ----------- | -------- | ------------------------------------------- |
| `user_id`      | Id<"users"> | yes      | Target user                                 |
| `event_type`   | string      | yes      | Event type identifier                       |
| `category`     | string      | yes      | Notification category                       |
| `severity`     | string      | yes      | `NORMAL` / `IMPORTANT` / `URGENT`           |
| `payload`      | object      | yes      | Event-specific interpolation payload        |
| `dedup_key`    | string      | no       | Optional dedup key                          |
| `processed`    | boolean     | yes      | Whether queue processor consumed this event |
| `processed_at` | number      | no       | Unix ms                                     |

**Indexes**: `by_user_id`, `by_processed`, `by_dedup_key`

### `notification_templates` Table

| Field            | Type        | Required | Description                           |
| ---------------- | ----------- | -------- | ------------------------------------- |
| `event_type`     | string      | yes      | Event type this template handles      |
| `channel`        | string      | yes      | `PUSH` / `WHATSAPP` / `SMS` / `EMAIL` |
| `locale`         | string      | yes      | Locale code (`en`, `hi`, `hinglish`)  |
| `title_template` | string      | yes      | ICU MessageFormat title template      |
| `body_template`  | string      | yes      | ICU MessageFormat body template       |
| `is_active`      | boolean     | yes      | Template active flag                  |
| `updated_by`     | Id<"users"> | no       | Last editor                           |

**Indexes**: `by_event_type_channel_locale`

### `notifications` Table

| Field          | Type                      | Required | Description                                          |
| -------------- | ------------------------- | -------- | ---------------------------------------------------- |
| `user_id`      | Id<"users">               | yes      | Recipient                                            |
| `event_id`     | Id<"notification_events"> | no       | Source event link                                    |
| `channel`      | string                    | yes      | `PUSH` / `WHATSAPP` / `SMS` / `EMAIL` / `IN_APP`     |
| `title`        | string                    | yes      | Rendered title                                       |
| `body`         | string                    | yes      | Rendered body                                        |
| `status`       | string                    | yes      | `PENDING` / `SENT` / `DELIVERED` / `FAILED` / `READ` |
| `retry_count`  | number                    | yes      | Current retry count                                  |
| `max_retries`  | number                    | yes      | Max retries for this channel row                     |
| `last_error`   | string                    | no       | Last delivery error                                  |
| `delivered_at` | number                    | no       | Unix ms                                              |
| `read_at`      | number                    | no       | Unix ms                                              |
| `action_url`   | string                    | no       | Deep-link target                                     |
| `metadata`     | object                    | no       | Additional structured payload                        |

**Indexes**: `by_user_id_status`, `by_channel_status`, `by_user_id_read`

---

## Canonical Channel Model

The notification system uses five channels:

- `PUSH`
- `WHATSAPP`
- `SMS`
- `EMAIL`
- `IN_APP`

#### Push Subscription Storage

Push notification delivery requires browser push subscriptions stored in `push_subscriptions`:

- `user_id` — subscription owner
- `endpoint` — push service endpoint URL
- `keys_p256dh` / `keys_auth` — encryption keys
- `is_active` — whether subscription is valid

Subscriptions are managed via `pushSubscriptions.subscribe` (on permission grant) and `pushSubscriptions.unsubscribe` (on revoke/expiry). The `sendPush` action adapter queries active subscriptions for the target user.

`IN_APP` is always created for each processed event. External channels are additive based on preferences and category toggles.

### Delivery Policy Algorithm

For each `notification_events` record:

1. Create `IN_APP` row in `notifications`.
2. Read `notification_preferences` for category/channel enablement.
3. For each enabled external channel:
   a. Apply quiet-hours logic (`NORMAL`/`IMPORTANT` can defer, `URGENT` bypasses).
   b. Resolve template by `(event_type, channel, locale)`.
   c. Insert `notifications` row with `status = PENDING`.
4. Retry worker dispatches pending rows via channel action adapters.
5. Exhausted retries remain `FAILED` and are surfaced in dead-letter monitor views.

---

## Access Control & Configuration (Phase 35)

### Permissions

| Permission                  | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| `notifications.manage`      | Manage notification templates and system settings     |
| `notifications.view_admin`  | View admin notification monitor and dead-letter queue |
| `notifications.send_system` | Send system-wide notification alerts                  |

### System Config Keys

| Key                                      | Type   | Description                             |
| ---------------------------------------- | ------ | --------------------------------------- |
| `notification_dedup_window_ms`           | number | Deduplication window in milliseconds    |
| `notification_max_retries_push`          | number | Max retry attempts for push channel     |
| `notification_max_retries_whatsapp`      | number | Max retry attempts for WhatsApp channel |
| `notification_max_retries_sms`           | number | Max retry attempts for SMS channel      |
| `notification_max_retries_email`         | number | Max retry attempts for email channel    |
| `notification_quiet_hours_default_start` | string | Default quiet hours start (HH:MM, IST)  |
| `notification_quiet_hours_default_end`   | string | Default quiet hours end (HH:MM, IST)    |
| `notification_batch_size`                | number | Max notifications per batch dispatch    |

---

## Business Rules

1. **Default preferences**: If user has no row in `notification_preferences`, system applies defaults and writes lazily.
2. **Per-category control**: Preferences are stored per category + channel booleans.
3. **Severity contract**: Only `NORMAL`, `IMPORTANT`, `URGENT` are valid severities.
4. **Quiet hours**: Non-urgent external sends can defer; urgent sends dispatch immediately.
5. **In-app durability**: In-app rows are always created for user-visible events.
6. **Template fallback**: locale-specific template first, fallback to `en`.
7. **Retry contract**: retries are bounded by channel-specific max retries from system config.
8. **Dead-letter semantics**: dead-letter is represented by `notifications.status = FAILED` with exhausted retries.

## Edge Cases

- **User with no preferences**: create defaults and continue.
- **Provider outage**: retries progress until max retries; row remains `FAILED` and is visible in admin dead-letter query.
- **No push subscription token**: push row can fail with explicit non-retryable error; no crash.
- **Template variable mismatch**: fail send with deterministic `last_error` for admin debugging.
- **Dedup collisions**: duplicate emits inside dedup window are ignored safely.
