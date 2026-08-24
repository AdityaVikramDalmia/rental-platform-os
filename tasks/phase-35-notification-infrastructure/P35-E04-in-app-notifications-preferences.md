---
id: P35-E04
title: In-App Notifications & Preferences
phase: 35
status: pending
depends_on: ["P35-E01", "P35-E02", "P35-E03"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P35-E04: In-App Notifications & Preferences

## Task Queue

- [ ] P35-E04-T01: Build notification bell and unread counter components
- [ ] P35-E04-T02: Build in-app notification feed views
- [ ] P35-E04-T03: Build notification preference management UI
- [ ] P35-E04-T04: Enforce throttling and quiet-hour controls

---

## T01: Build Notification Bell and Unread Counter Components

### Objective

Add header bell UI with unread indicator and quick preview popover for recent notifications.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — in-app flow and unread behavior
- `tasks/phase-35-notification-infrastructure/README.md` — function coverage (`getUnreadCount`, `getMyNotifications`)
- `notes/06-admin-panel-ux.md` — admin header patterns and component conventions
- `notes/05-guard-portal-ux.md` — mobile touch-target expectations for interactive controls

### Key Rules

1. Bell unread count must be real-time via Convex subscription query.
2. Bell UI must preserve existing layout behavior across admin/guard/ops headers.
3. Clicking preview item should deep-link safely to `action_url` when present.
4. Read-state visual treatment must be consistent with shared badge/typography patterns.

### Deliverables

- [ ] `src/components/shared/notification-bell.tsx` — bell trigger, unread badge, dropdown preview
- [ ] `convex/notifications.ts` — `notifications.getUnreadCount` query
- [ ] `src/components/shared/header-notification-slot.tsx` — integration point for portal headers

### Acceptance Criteria

1. Bell badge updates in real time without full-page refresh.
2. Unread badge is capped (for example `99+`) for high counts.
3. Dropdown preview shows recent notifications ordered by `_creationTime` descending.
4. Read/unread styles are clearly distinguishable and accessible.
5. Empty-state rendering is stable and non-blocking when user has no notifications.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T02: Build In-App Notification Feed Views

### Objective

Create full notification feed page with pagination, filtering, and mark-read actions.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — schema for `notifications` and feed expectations
- `tasks/phase-35-notification-infrastructure/README.md` — required queries/mutations for read state
- `notes/01-tech-stack.md` — App Router and route-group conventions

### Key Rules

1. Feed must support cursor pagination and category/channel filtering.
2. Read operations should update local UI optimistically and reconcile with server result.
3. All timestamps displayed from Unix ms values using existing formatting utilities.
4. Notification feed route must be role-safe and scoped to authenticated user data.

### Deliverables

- [ ] `src/app/(admin)/admin/notifications/page.tsx` — admin feed page
- [ ] `src/components/shared/notification-feed-list.tsx` — reusable list with filters and pagination controls
- [ ] `convex/notifications.ts` — `notifications.getMyNotifications`, `notifications.markRead`, `notifications.markAllRead`

### Acceptance Criteria

1. Feed lists notifications with category/channel/status metadata and action links.
2. Filter state persists in URL query params and restores on reload.
3. `markRead` updates item state and unread badge count in real time.
4. `markAllRead` updates all unread items and returns affected count.
5. Cursor pagination loads additional items without duplications.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T03: Build Notification Preference Management UI

### Objective

Provide channel-level and event-level preference controls for users.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — preference model, quiet-hours and timezone fields
- `tasks/phase-35-notification-infrastructure/README.md` — `notificationPreferences.get` and `notificationPreferences.update`
- `notes/08-i18n.md` — locale handling and translation expectations

### Key Rules

1. Preferences are per category and per channel; defaults apply when row is missing.
2. Quiet-hours inputs use `HH:MM` strings and timezone selection (IANA zone).
3. `IN_APP` must remain effectively always-on for user-visible events.
4. Form must use `react-hook-form` + `zod` and show clear validation errors.

### Deliverables

- [ ] `src/app/(guard)/guard/settings/notifications/page.tsx` — user preferences page
- [ ] `src/components/shared/notification-preferences-form.tsx` — channel/category toggles, quiet-hours, timezone, locale
- [ ] `convex/notificationPreferences.ts` — `get` and `update` query/mutation contracts

### Acceptance Criteria

1. Users can toggle external channels (`PUSH`, `WHATSAPP`, `SMS`, `EMAIL`) per category.
2. Quiet-hours start/end validation enforces `HH:MM` format.
3. Timezone selector stores IANA timezone and defaults to `Asia/Kolkata` when unset.
4. Preference save persists immediately and rehydrates correctly on refresh.
5. Invalid preference payloads are blocked client-side and server-side.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T04: Enforce Throttling and Quiet-Hour Controls

### Objective

Apply user-configured quiet hours and frequency caps during notification dispatch.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — quiet-hours, throttling, retry/dead-letter, admin monitoring contracts
- `tasks/phase-35-notification-infrastructure/README.md` — adminList/adminGetDeadLetter coverage
- `notes/06-admin-panel-ux.md` — admin table/filter/detail-panel patterns

### Key Rules

1. Quiet-hours and throttling are delivery-time policies, not event-drop policies.
2. Deferred notifications must retain payload and scheduled retry timestamp.
3. Admin monitor queries must expose delivery status, retry counts, and final errors.
4. Dead-letter visibility is mandatory for operational debugging.

### Deliverables

- [ ] `convex/notifications.ts` — throttling + quiet-hours evaluator used by dispatch pipeline
- [ ] `convex/notifications.ts` — `notifications.adminList` and `notifications.adminGetDeadLetter` queries
- [ ] `src/app/(admin)/admin/notifications/monitor/page.tsx` — admin delivery monitor with filters
- [ ] `src/components/admin/notifications/dead-letter-table.tsx` — dead-letter list and error details

### Acceptance Criteria

1. Non-urgent notifications during quiet-hours are deferred and retried after quiet-hours end.
2. Urgent notifications bypass quiet-hours and dispatch immediately.
3. Throttling caps are enforced per user/channel/time-window without dropping event records.
4. Admin monitor lists notifications with status/channel/category/date filters and pagination.
5. Dead-letter view exposes `last_error`, `retry_count`, `max_retries`, and `payload_snapshot`.

### Verification

```bash
npx tsc --noEmit
npm run build
```
