# BUG-020: Chat PII pre-mask corrupts the message when two matches overlap

| Field          | Value                |
| -------------- | -------------------- |
| **Severity**   | Medium               |
| **Status**     | **OPEN**             |
| **Area**       | Deal Room Chat (PII) |
| **Found**      | 2026-09-24           |
| **Fixed**      | —                    |
| **Fix Commit** | —                    |

## Description

`preMaskPII` builds the text the chat batch sends to the AI rewriter (`convex/chatBatching.ts:305-309`). When two PII matches overlap, it deletes words that are not PII. It can also leave part of an email address in the text.

Common inputs hit this. A `+91`- or `0`-prefixed mobile matches both the prefixed pattern and the bare 10-digit pattern. A `wa.me/91…` link also matches the phone pattern. "my whatsapp is 98…" matches both PHONE and WHATSAPP.

## Repro Steps

Tests in `lib/__tests__/chat-pii.test.ts`, under `lib/chat > preMaskPII`. They are marked `it.fails`, so they pass while the bug exists. Change `it.fails` to `it` to see them fail.

- `keeps the words after a +91-prefixed mobile intact (BUG-020)`
- `keeps the words after a wa.me link intact (BUG-020)`
- `keeps the words after a phone that is also a WhatsApp number intact (BUG-020)`
- `never leaves part of an email behind when a handle overlaps it (BUG-020)`

```bash
npx vitest run lib/__tests__/chat-pii.test.ts -t "BUG-020"
```

## Expected

Each PII span becomes one label, and the rest of the text stays unchanged:

- `"+91 9876543210 thanks"` → `"[PHONE] thanks"`
- `"wa.me/919876543210 bye"` → `"[WHATSAPP] bye"`
- `"a.@b-mail.com hi"` → `"[EMAIL] hi"`

## Actual

- `"+91 9876543210 thanks"` → `"[PHONE]anks"`
- `"wa.me/919876543210 bye"` → `"[WHATSAPP]"`
- `"my whatsapp is 9876543210 ok"` → `"my whatsapp is [WHATSAPP]"`
- `"a.@b-mail.com hi"` → `"[EMAIL]il.com hi"`. The domain tail stays in the text and is sent to the model provider.

## Root Cause

`preScanForPII` removes duplicates only by `type:value` (`lib/chat.ts:158-160`), so it can return overlapping spans with different values or types. `preMaskPII` applies them from the right using each match's original `index` and `value.length` (`lib/chat.ts:176-183`). An earlier replacement has already changed the text's length, so the later slice removes the wrong characters. This conflicts with the rewriter's own rule, "Preserve property and deal details exactly when possible" (`convex/actions/chatAI.ts:81`).

## Fix

Merge overlapping or nested spans into one before replacing, keeping the outermost span and its type. Or rebuild the output in one left-to-right pass over the original text.
