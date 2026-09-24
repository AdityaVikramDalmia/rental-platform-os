# BUG-021: Notification queue crashes and rolls back the whole batch when a user has two push devices

| Field          | Value                    |
| -------------- | ------------------------ |
| **Severity**   | High                     |
| **Status**     | **OPEN**                 |
| **Area**       | Notifications (Phase 35) |
| **Found**      | 2026-09-24               |
| **Fixed**      | —                        |
| **Fix Commit** | —                        |

## Description

`registerPushSubscription` inserts a new active row for every new endpoint, so a user who allows push on a phone and a laptop has two active subscriptions (`convex/notifications.ts:625`). `listMyPushSubscriptions` returns them as a list (`convex/notifications.ts:667-675`). The feature spec also says the push adapter "queries active subscriptions for the target user" (`notes/features/27-notification-infrastructure.md:416`). A missing push token must not crash (`notes/features/27-notification-infrastructure.md:475`).

The dispatcher reads the subscription with `.unique()` (`convex/notifications.ts:854-858`), which throws when there are two rows. `processQueue` has no per-event error handling around `dispatchExternalChannel` (`convex/notifications.ts:1173`, `1376`). The whole mutation fails, and every event already processed in that run rolls back to `PENDING`, including other users' events.

The failing event stays `PENDING` with an old `next_attempt_at`. It is therefore in the first 50 rows (`convex/notifications.ts:1168`) on every run of the 1-minute cron (`convex/crons.ts:126`), and each run throws again. External notification dispatch stops for all users until the extra subscription is removed.

## Repro Steps

Tests in `convex/notifications.test.ts`, under `notifications > processQueue`. They are marked `it.fails`; change `it.fails` to `it` to see them fail.

- `schedules push for a user with two active devices (BUG-021)`. Actual error: `unique() query returned more than one result from table push_subscriptions`.
- `still processes other users' events when one recipient has two active devices (BUG-021)`. The other user's event stays `PENDING` instead of `PROCESSING`.

```bash
npx vitest run convex/notifications.test.ts -t "BUG-021"
```

## Expected

Push is scheduled for the multi-device user (to one or all active subscriptions). Other events in the same run are processed whatever happens to that one.

## Actual

`processQueue` throws, and the other user's event stays `PENDING`. The same event poisons every later run.

## Fix

Send to every active subscription (`.collect()`), or pick one on purpose with `.first()`. Also isolate each event in `processQueue`, so that one event that throws is marked failed rather than aborting the batch.
