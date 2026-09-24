# BUG-022: Notification throttle counts unsent events, so a burst sends no SMS at all

| Field          | Value                    |
| -------------- | ------------------------ |
| **Severity**   | Medium                   |
| **Status**     | **OPEN**                 |
| **Area**       | Notifications (Phase 35) |
| **Found**      | 2026-09-24               |
| **Fixed**      | —                        |
| **Fix Commit** | —                        |

## Description

The SMS cap is 1 per user per window (`lib/constants.ts:425`; documented as "Max Events / Window" in `notes/13-constants-reference.md:2023-2028`). The throttle is meant to be a "delivery-time" policy, "not event-drop" (`tasks/phase-35-notification-infrastructure/P35-E04-in-app-notifications-preferences.md:157`, `:173`).

`processQueue` counts every event for the user created in the last 60 s whose `channels` list includes the channel (`convex/notifications.ts:1337-1350`). That count includes events that have not been dispatched yet and events whose SMS was itself suppressed. When two SMS-eligible events are in the queue together (for example, two updates in the same minute before the 1-minute cron runs), each one counts the other. Both SMS sends are marked `SUPPRESSED` (`throttled:SMS`), a final state, so the user gets no SMS instead of one.

## Repro Steps

Test in `convex/notifications.test.ts`, under `notifications > processQueue`. It is marked `it.fails`; change `it.fails` to `it` to see it fail.

- `lets the first of two SMS-eligible events queued in the same minute send its SMS (BUG-022)`

```bash
npx vitest run convex/notifications.test.ts -t "BUG-022"
```

## Expected

Exactly one of the two SMS sends is scheduled. The other is throttled, or deferred.

## Actual

Both events end with SMS `SUPPRESSED` / `throttled:SMS`, and no SMS is sent.

## Fix

Count only sends that actually went out on that channel in the window: channel status `SCHEDULED` or `DELIVERED` with a `scheduled_at` or `delivered_at` inside the window. Do not count every recent event that lists the channel.
