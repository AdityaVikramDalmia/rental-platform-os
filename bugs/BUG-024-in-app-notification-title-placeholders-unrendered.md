# BUG-024: In-app notification titles show raw {{placeholders}}

| Field          | Value                    |
| -------------- | ------------------------ |
| **Severity**   | Medium                   |
| **Status**     | **OPEN**                 |
| **Area**       | Notifications (Phase 35) |
| **Found**      | 2026-09-24               |
| **Fixed**      | —                        |
| **Fix Commit** | —                        |

## Description

Notification templates use `{{variable}}` placeholders in both `subject` and `body`. The seeded templates do this too, for example `subject: "Lead verified for {{flat_number}}"` (`convex/seedDemoTier2.ts:186`). External channels render the subject with the payload (`convex/notifications.ts:847-849`). `emitEvent` builds the in-app inbox row's title from `inAppTemplate?.subject` without rendering it (`convex/notifications.ts:734-736`), although it renders the body two lines later (`convex/notifications.ts:737-739`). The notification bell therefore shows titles such as "Lead verified for {{flat_number}}".

## Repro Steps

Test in `convex/notifications.test.ts`, under `notifications > emitEvent`. It is marked `it.fails`; change `it.fails` to `it` to see it fail.

- `fills payload placeholders in the in-app title as external subjects do (BUG-024)`

```bash
npx vitest run convex/notifications.test.ts -t "BUG-024"
```

## Expected

With subject `"Lead {{flat}} verified"` and payload `{ flat: "B-1203" }`, the in-app title is `"Lead B-1203 verified"`.

## Actual

The in-app title is `"Lead {{flat}} verified"`.

## Fix

Render the in-app title with `renderTemplateText(args.payload, inAppTemplate.subject)`, as `dispatchExternalChannel` does.
