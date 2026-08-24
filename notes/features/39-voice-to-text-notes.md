# Feature: Voice-to-Text Notes

> **Priority**: Phase 48 (Voice-to-Text Notes)
> **Personas**: Guard (primary — field workers can't type easily), OPS Agent (field operations), Tenant (mobile inquiry), Admin (desktop — nice-to-have)
> **Dependencies**: P14 (i18n — language preference drives Whisper language parameter), P01 (auth), P24 (Convex file storage pattern already established)
> **Created**: February 2026

---

## Purpose

Field operations workers (guards and OPS agents) frequently need to enter notes while on the move — lead observations, visit outcomes, document rejection reasons, checklist items. Typing on mobile is slow and error-prone, especially for Hindi speakers using a Latin keyboard. Voice-to-text via OpenAI Whisper enables fast, high-quality note capture in Hindi and English across all portals, with no dependency on browser-vendor speech APIs.

---

## Problem Statement

1. Guards submit lead notes and visit outcome notes while standing at building gates, often with one hand occupied
2. OPS agents record inspection findings and document rejection reasons in the field, where typing is impractical
3. Tenants type inquiry messages on mobile during property searches, where voice is faster
4. All personas are slowed by mobile typing, especially Hindi content on Latin keyboards
5. No voice input capability exists anywhere in the platform today

The problem is a frontend gap with a thin backend addition. The backend already stores text notes correctly. The fix is a reusable input component that wraps existing Textarea fields with a record button, backed by OpenAI Whisper for transcription.

---

## Product Principles

1. Zero friction for non-voice users: the record button is additive. Every textarea remains fully functional for typing. Voice is an enhancement, not a replacement.
2. Multiple recordings per field: users can record as many voice clips as they want, one after another. Each transcription appends to the textarea. No limit per session.
3. Locale-aware by default: the Whisper language parameter follows the user's existing i18n preference. Guards who chose Hindi get Hindi transcription without any extra configuration.
4. Resilient by default: if the Whisper API call fails, the client retries automatically up to 3 times with exponential backoff before surfacing an error to the user.
5. Reuse over invention: the Convex Action pattern follows `convex/actions/chatAI.ts`. The file storage upload pattern follows P24 chat attachments. No new packages are required.

---

## Architecture

```
Client (Guard/OPS mobile browser)
  1. User taps mic button → MediaRecorder API starts recording (webm/opus)
  2. User taps stop → audio Blob created in memory
  3. Upload audio Blob to Convex file storage (generateUploadUrl → fetch POST)
  4. Call Convex mutation → triggers internalAction → OpenAI Whisper API
  5. Whisper returns transcript text → mutation returns text to client
  6. Text APPENDED to textarea content (space-separated)
  7. User can immediately record ANOTHER audio clip (no limit)
  8. If transcription fails → client-side retry up to 3 times (1s, 2s, 4s backoff)
```

### Why Whisper

Whisper is a server-side model run via the OpenAI API. The project already has the `openai` package installed and an API key configured (used in `convex/actions/chatAI.ts`). Whisper provides consistent Hindi quality regardless of browser vendor, works on all browsers that support `MediaRecorder` (98%+ coverage), and does not stream audio to any third-party browser vendor.

### Audio Recording

Audio is captured via the browser-native `MediaRecorder` API. No external recording library is needed.

- Preferred format: `audio/webm;codecs=opus` (best compression, widest support)
- Fallback format: `audio/webm` (if opus codec unavailable on device)
- Format detection: `MediaRecorder.isTypeSupported()` at hook initialization
- Max recording duration: 2 minutes (configurable via `system_config` key `voice_max_recording_seconds`, default `120`)
- Max audio file size: 25 MB (Whisper API hard limit; 2 minutes of webm/opus is well under 5 MB in practice)

---

## New Dependencies

None. All required packages are already present:

| Capability                    | How Provided                                                    |
| ----------------------------- | --------------------------------------------------------------- |
| OpenAI Whisper API            | `openai` package already installed; API key already in env      |
| Audio recording               | `MediaRecorder` browser-native API, no library needed           |
| File upload to Convex storage | Pattern established in P24 (`generateUploadUrl` + `fetch POST`) |
| React hooks                   | React already installed                                         |

---

## New Files

### Backend

| File                              | What It Contains                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/actions/transcription.ts` | Whisper transcription Action (~50 lines); receives `storageId` + `language`, fetches audio from Convex storage, calls `openai.audio.transcriptions.create()`, returns transcript string |

### Frontend

| File                                       | What It Contains                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useAudioRecorder.ts`            | MediaRecorder wrapper hook — start/stop recording, produce audio Blob, handle format detection                          |
| `src/hooks/useVoiceTranscription.ts`       | Orchestration hook — upload Blob to Convex storage, call transcription Action, handle retry logic, expose state machine |
| `src/components/shared/voice-textarea.tsx` | `VoiceTextarea` component — wraps shadcn `Textarea` with record button and status display                               |

### Updated

| File                     | Change                                 |
| ------------------------ | -------------------------------------- |
| `messages/en.json`       | Add `guard.voice.*` namespace (8 keys) |
| `messages/hi.json`       | Same keys in Hindi                     |
| `messages/hinglish.json` | Same keys in Hinglish                  |

---

## Locale-to-Language Mapping

The `useVoiceTranscription` hook maps the user's i18n locale to the Whisper `language` parameter. Whisper uses ISO 639-1 two-letter codes.

| i18n Locale      | Whisper Language | Rationale                                                     |
| ---------------- | ---------------- | ------------------------------------------------------------- |
| `en`             | `en`             | English transcription                                         |
| `hi`             | `hi`             | Hindi transcription                                           |
| `hinglish`       | `hi`             | Hindi model handles code-mixed input well; user can edit      |
| (admin, no i18n) | `en`             | Default for admin portal where no locale preference is stored |

The hook reads locale from `next-intl` `useLocale()` in guard portal components. For admin and tenant components (no `NextIntlClientProvider`), it accepts an explicit `language` prop defaulting to `en`.

---

## `useAudioRecorder` Hook Spec

```
src/hooks/useAudioRecorder.ts
```

### Interface

```
useAudioRecorder()

Returns:
{
  isRecording: boolean;
  isSupported: boolean;          // False if MediaRecorder unavailable
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  error: string | null;
}
```

### Behavior

- Calls `navigator.mediaDevices.getUserMedia({ audio: true })` on `startRecording`
- Selects `audio/webm;codecs=opus` if supported, falls back to `audio/webm`
- Accumulates `dataavailable` chunks into an array
- On `stopRecording`: stops the MediaRecorder, resolves with a `Blob` of the recorded audio
- Auto-stops after `voice_max_recording_seconds` via a `setTimeout` guard
- `useEffect` cleanup stops any active recording on component unmount
- Sets `isSupported: false` if `window.MediaRecorder` is undefined (rare, but possible on old iOS)

---

## `useVoiceTranscription` Hook Spec

```
src/hooks/useVoiceTranscription.ts
```

### Interface

```
useVoiceTranscription(options: {
  language?: string;             // Whisper language code. Defaults to "en".
  onTranscript: (text: string) => void;  // Called with transcript on success
})

Returns:
{
  state: VoiceState;             // See state machine below
  retryCount: number;            // Current retry attempt (0-3)
  startRecording: () => void;
  stopRecording: () => void;
  dismiss: () => void;           // Reset from error state back to idle
}
```

### State Machine

```
idle
  → recording       (user taps mic)

recording
  → uploading       (user taps stop; Blob created)
  → idle            (user cancels; Blob discarded)

uploading
  → transcribing    (upload to Convex storage succeeded)
  → retrying        (upload failed; retry attempt starts)

transcribing
  → idle            (Whisper returned transcript; onTranscript called)
  → retrying        (Whisper call failed; retry attempt starts)

retrying
  → uploading       (retry: re-upload)
  → transcribing    (retry: re-transcribe with existing storageId)
  → error           (3 retries exhausted)

error
  → idle            (user dismisses; or user taps mic to start fresh)
```

### Retry Logic

- Maximum 3 retry attempts
- Exponential backoff: 1 second, 2 seconds, 4 seconds between attempts
- On each retry, `retryCount` increments (used by component to show "Retrying 2/3...")
- After 3 failed attempts, state transitions to `error`
- User can dismiss the error and start a fresh recording

---

## `VoiceTextarea` Component Spec

```
src/components/shared/voice-textarea.tsx
```

### Interface

```
VoiceTextarea extends React.TextareaHTMLAttributes<HTMLTextAreaElement> with:
  language?: string;             // Whisper language code. Defaults to "en".
  onValueChange?: (value: string) => void;  // For react-hook-form setValue integration
```

### Visual Design

- Wraps the existing shadcn `Textarea` component with no changes to the textarea itself
- Adds a status row below the textarea (not inside it) containing the record button and status label
- Record button is 32x32px, ghost variant
- Status label is small text, muted color, updated per state

### Button States

| State          | Icon          | Label                             | Color            |
| -------------- | ------------- | --------------------------------- | ---------------- |
| `idle`         | `Mic`         | (none)                            | gray             |
| `recording`    | `MicOff`      | "Recording..."                    | red + pulse ring |
| `uploading`    | `Loader2`     | "Uploading..."                    | blue + spin      |
| `transcribing` | `Loader2`     | "Transcribing..."                 | blue + spin      |
| `retrying`     | `Loader2`     | "Retrying (2/3)..."               | amber + spin     |
| `error`        | `AlertCircle` | "Failed. Tap to retry."           | red              |
| `success`      | `Check`       | (brief 1s flash, returns to idle) | green            |

### Transcript Behavior

- Transcribed text is appended to existing textarea content, not replaced
- A single space is inserted between existing content and new transcript if existing content is non-empty
- The user can edit the combined text freely before form submission
- After appending, the component returns to `idle` state immediately, ready for another recording

### react-hook-form Integration

```
// Usage in a form component:
<VoiceTextarea
  language="hi"
  {...register("notes")}
  onValueChange={(value) => setValue("notes", value)}
/>
```

The component calls `onValueChange` after appending transcript so react-hook-form state stays in sync with the DOM value.

### Unsupported Browser Behavior

When `isSupported` is false (MediaRecorder unavailable), the status row and record button are not rendered. The textarea renders identically to the standard shadcn `Textarea`. No placeholder, no disabled button, no explanatory text.

### Delete Responsibility

The `VoiceTextarea` component does NOT include a delete button. Delete (soft-delete) is handled at the form or page level where the transcription record is displayed after submission — not inside the recording widget itself.

### Accessibility

- Record button has `aria-label` driven by translation key (`guard.voice.startRecording` / `guard.voice.stopRecording`)
- Button has `aria-pressed` reflecting recording state
- Status label region has `aria-live="polite"` so screen readers announce state transitions

---

## `convex/actions/transcription.ts` Spec

Follows the pattern established in `convex/actions/chatAI.ts`.

### Function

```
internalAction: transcribeAudio

Args:
  storageId: v.id("_storage")   // Convex storage ID of the uploaded audio file
  language: v.string()           // ISO 639-1 language code ("hi" or "en")

Returns:
  v.string()                     // Transcript text, or throws on failure
```

### Behavior

1. Fetch audio blob from Convex storage: `ctx.storage.get(storageId)`
2. Convert to `File` object with appropriate MIME type for OpenAI SDK
3. Call `openai.audio.transcriptions.create({ model: "whisper-1", file, language })`
4. Return `transcription.text`
5. On any error, throw — the calling mutation handles retry orchestration

### Cleanup

Audio files are **never deleted** from Convex storage. They are permanent records. The `storageId` is persisted in the `voice_transcriptions` table and remains accessible for admin playback and audit purposes.

---

## Translation Keys (`guard.voice.*`)

Add to all three locale files under the `guard.voice` namespace. Key parity across all three files is mandatory.

| Key                            | English Value                                                |
| ------------------------------ | ------------------------------------------------------------ |
| `guard.voice.startRecording`   | Start voice input                                            |
| `guard.voice.stopRecording`    | Stop recording                                               |
| `guard.voice.recording`        | Recording...                                                 |
| `guard.voice.uploading`        | Uploading...                                                 |
| `guard.voice.transcribing`     | Transcribing...                                              |
| `guard.voice.retrying`         | Retrying ({count}/{max})...                                  |
| `guard.voice.error`            | Failed. Tap to retry.                                        |
| `guard.voice.permissionDenied` | Microphone access denied. Please enable in browser settings. |

Errors surface via `sonner` toast for permission denial. In-progress states use the inline status label to avoid toast spam during normal operation.

---

## Target Fields (Priority Order)

### P1 — Guard Portal (highest impact)

Guards are the primary persona. These four fields cover the most common note-entry moments in the field.

| #   | Field                    | File                  | Form Field      |
| --- | ------------------------ | --------------------- | --------------- |
| 1   | Lead submission notes    | `lead-form.tsx`       | `notes`         |
| 2   | Visit outcome notes      | `visit-execution.tsx` | `outcome_notes` |
| 3   | NEED_INFO response notes | `need-info-form.tsx`  | `notes`         |
| 4   | NEED_INFO reply notes    | `need-info-form.tsx`  | `reply_note`    |

### P2 — OPS Portal

OPS agents work in the field with the same constraints as guards.

| #   | Field                    | File                        | Form Field        |
| --- | ------------------------ | --------------------------- | ----------------- |
| 5   | Document rejection notes | `document-item-actions.tsx` | `rejection_notes` |
| 6   | Handover checklist items | shared `ChecklistItemField` | item text         |

### P3 — Shared Components

These components are used across portals. Adding voice here benefits all personas.

| #   | Field                   | File                    | Form Field       |
| --- | ----------------------- | ----------------------- | ---------------- |
| 7   | Chat message input      | `ChatInput.tsx`         | message textarea |
| 8   | Deal checklist comments | `ChecklistItemCard.tsx` | `comment`        |

### P4 — Tenant and Public (nice-to-have)

Lower priority since tenants are less likely to be in field conditions, but the component swap is trivial once the shared component exists.

| #   | Field                  | File               | Form Field |
| --- | ---------------------- | ------------------ | ---------- |
| 9   | Tenant inquiry message | `inquiry-form.tsx` | `message`  |
| 10  | Contact form message   | `contact-form.tsx` | `message`  |

### P5 — Admin Panel (lowest priority)

Admin users work on desktop with physical keyboards. Add only if the component swap requires no layout changes.

---

## Epics Breakdown

### E01: Voice Infrastructure (4 tasks)

- **T01**: Create `convex/actions/transcription.ts` — Whisper internalAction with storage fetch, OpenAI call, transcript returned to caller; create `voice_transcriptions` table with `is_deleted`, `deleted_by`, `deleted_at` fields
- **T02**: Create `useAudioRecorder` hook — MediaRecorder wrapper with format detection, chunk accumulation, auto-stop timer, cleanup on unmount
- **T03**: Create `useVoiceTranscription` hook — upload-to-storage orchestration, state machine, 3-attempt exponential backoff retry
- **T04**: Create `VoiceTextarea` shared component with 7-state button, status label, `aria-live` region, react-hook-form `onValueChange` integration; add `guard.voice.*` translation keys to all three locale files

### E02: Guard Portal Integration (3 tasks)

- **T01**: Replace `Textarea` with `VoiceTextarea` in lead submission form (`notes` field); wire `language` from `useLocale()`
- **T02**: Replace `Textarea` with `VoiceTextarea` in visit execution form (`outcome_notes` field)
- **T03**: Replace both `Textarea` fields in need-info form (`notes` and `reply_note`)

### E03: OPS and Shared Integration (2 tasks)

- **T01**: Wire `VoiceTextarea` into OPS document rejection field and handover checklist item field
- **T02**: Wire into `ChatInput.tsx` message textarea and `ChecklistItemCard.tsx` comment field

### E04: Extended Portals (2 tasks, optional)

- **T01**: Wire into tenant inquiry form (`message`) and public contact form (`message`)
- **T02**: Wire into highest-value admin fields if the component swap requires no layout changes

---

## Data Retention and Audit

Audio recordings and AI transcriptions are **permanent, append-only records**. They serve as auditable evidence of what was communicated and captured in the field.

### Retention Rules

| Data                           | Storage                              | Retention               | Hard Delete          |
| ------------------------------ | ------------------------------------ | ----------------------- | -------------------- |
| Audio file (Convex `_storage`) | Convex file storage                  | Permanent               | Never                |
| Transcription record           | `voice_transcriptions` table         | Permanent               | Never                |
| Soft-delete flag               | `is_deleted` on transcription record | Toggleable by Guard/OPS | Does not remove data |

### `voice_transcriptions` Table Fields (Relevant to Retention)

| Field         | Type                        | Description                                                  |
| ------------- | --------------------------- | ------------------------------------------------------------ |
| `storage_id`  | `v.id("_storage")`          | Permanent reference to the audio file in Convex storage      |
| `transcript`  | `v.string()`                | Transcribed text returned by Whisper                         |
| `language`    | `v.string()`                | ISO 639-1 language code used for transcription               |
| `user_id`     | `v.id("users")`             | Who recorded this clip                                       |
| `entity_type` | `v.string()`                | What the recording is attached to (e.g. `"lead"`, `"visit"`) |
| `entity_id`   | `v.string()`                | ID of the attached entity                                    |
| `is_deleted`  | `v.boolean()`               | Soft-delete flag — hides from Guard/OPS view only            |
| `deleted_by`  | `v.optional(v.id("users"))` | Who soft-deleted the record                                  |
| `deleted_at`  | `v.optional(v.number())`    | When soft-deleted (Unix ms)                                  |
| `created_at`  | `v.number()`                | Unix ms                                                      |

### Visibility by Role

| Role        | See active transcriptions | See soft-deleted transcriptions | Audio playback | Soft-delete    |
| ----------- | ------------------------- | ------------------------------- | -------------- | -------------- |
| Guard       | Own only                  | No                              | Own only       | Own only       |
| OPS Agent   | Own only                  | No                              | Own only       | Own only       |
| Admin       | All                       | All (marked as deleted)         | All            | No (read-only) |
| Super Admin | All                       | All (marked as deleted)         | All            | No (read-only) |

### UI Behavior

- **Guard/OPS view**: "Delete" button on each transcription record. Tapping it sets `is_deleted: true`. The record disappears from their view. The audio file and transcription text remain in storage and database permanently.
- **Admin view**: All transcriptions visible, including soft-deleted ones. Soft-deleted records shown with a visual indicator (strikethrough or "Deleted by [name] on [date]" label). Audio playback available for all records. No delete action available to admins — they are read-only auditors.
- **Audit log**: Soft-delete actions are logged via the existing audit trigger system (`functions.ts` wrapper).

### Why Permanent

Field voice notes may contain evidence relevant to:

- Dispute resolution between tenants and owners
- Guard/OPS accountability (what was actually reported vs. what was typed)
- Regulatory compliance (property inspection records)
- Internal investigations (fraud, misrepresentation)

Deleting audio evidence would undermine platform trust and legal defensibility.

---

## Integration Points with Existing Infrastructure

| Existing System                                              | How P48 Uses It                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `openai` package + API key                                   | Whisper transcription in `convex/actions/transcription.ts`                                 |
| Convex file storage (`generateUploadUrl`, `ctx.storage.get`) | Audio upload and permanent retrieval; pattern from P24                                     |
| `convex/actions/chatAI.ts`                                   | Structural pattern for the new transcription Action                                        |
| `next-intl` `useLocale()`                                    | Reads current locale to determine Whisper language parameter in guard portal               |
| shadcn `Textarea`                                            | `VoiceTextarea` wraps it with no changes to the base component                             |
| `react-hook-form`                                            | `onValueChange` prop calls `setValue()` to keep form state in sync after transcript append |
| `sonner`                                                     | Permission denial toast; error toast after all retries exhausted                           |
| lucide-react                                                 | `Mic`, `MicOff`, `Loader2`, `AlertCircle`, `Check` icons for button states                 |
| `system_config`                                              | `voice_max_recording_seconds` config key (default `120`)                                   |

---

## Business Rules

1. Voice input is always optional. Every textarea remains fully functional for typing regardless of browser or network state.
2. The record button is hidden (not disabled) when `MediaRecorder` is unavailable. No error state is shown.
3. Transcribed text is appended to existing textarea content, not replaced. A space is inserted between existing content and new transcript.
4. Users can always manually edit transcribed text before form submission. The transcript is just text in a textarea.
5. Multiple recordings per field are supported. Each transcription appends to the textarea. There is no per-field recording limit.
6. Client retries: 3 attempts maximum, exponential backoff (1s, 2s, 4s). After 3 failures, the error state is shown and the user must dismiss and try again.
7. Language follows the user's i18n locale preference in the guard portal. Admin and tenant components default to `en`.
8. Microphone permission is requested on first use via the browser's native permission prompt. No custom dialog precedes it.
9. Max recording duration is 2 minutes, enforced client-side by `useAudioRecorder`. The timer auto-stops recording and proceeds to upload.
10. Max audio file size is 25 MB (Whisper API limit). In practice, 2 minutes of webm/opus is under 5 MB.
11. Cost is approximately Rs. 0.50 per minute of audio. A typical 30-second field note costs approximately Rs. 0.25.
12. Audio recordings are NEVER hard-deleted from Convex storage. Permanent retention.
13. Transcription records follow the project's standard `is_deleted` soft-delete convention.
14. Guard and OPS users can soft-delete their own transcription records. This hides the record from their view only — the audio file and transcription text remain permanently.
15. Admin and Super Admin users see ALL transcription records including soft-deleted ones.
16. Admin audio playback is available for all records regardless of soft-delete status.
17. Soft-delete of a transcription record is logged in the audit trail via the `functions.ts` wrapper.

---

## Edge Cases

| Scenario                                              | Behavior                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `MediaRecorder` unavailable (old iOS, rare)           | Record button not rendered. Textarea works normally.                                                                                      |
| Microphone permission denied                          | `sonner` toast: "Microphone access denied. Please enable in browser settings." State returns to idle.                                     |
| Upload fails (network drop)                           | Retry up to 3 times. After 3 failures, error state shown. User dismisses and tries again.                                                 |
| Whisper API timeout or 5xx                            | Same retry path as upload failure.                                                                                                        |
| Mid-recording page navigation                         | `useEffect` cleanup stops MediaRecorder. Partial audio discarded. No dangling streams.                                                    |
| Multiple `VoiceTextarea` on same page                 | Each has independent state. User can only physically tap one at a time. No cross-instance coordination needed.                            |
| Recording exceeds 2 minutes                           | Auto-stop fires. Upload proceeds with whatever was recorded. User is not notified unless they were still speaking.                        |
| Audio Blob is empty (user tapped stop immediately)    | Upload skipped. State returns to idle silently.                                                                                           |
| Transcript appended to a field at max character limit | Append proceeds; form validation catches the overflow on submit, same as typed overflow.                                                  |
| Form reset while transcribing                         | Transcript arrives after reset; `onValueChange` fires but form field is already cleared. Net result: transcript is discarded. Acceptable. |
| Whisper returns empty string                          | Treat as no-op. State returns to idle. No toast. User can record again.                                                                   |

---

## Known Limitations (Acceptable in V1)

- Requires an internet connection for both upload and Whisper transcription. Offline recording is not supported.
- Transcription latency is 1-3 seconds for a 30-second clip. Users see the "Transcribing..." state during this window.
- Background noise degrades Whisper accuracy. Guards should speak clearly and close to the device.
- No confidence score is displayed. Low-confidence transcripts are shown as-is; the user edits if needed.
- Interim (real-time) results are not shown during recording. The transcript appears only after the full clip is processed. This is a V2 enhancement.
- Hindi-English code-mixing (Hinglish) is handled by the `hi` Whisper model, which performs reasonably well but is not optimized for code-mixed input.

---

## Non-Goals (Phase 48)

1. Browser Web Speech API — not used; quality and vendor dependency are unacceptable
2. `react-speech-recognition` package — not installed
3. Hard deletion of audio or transcription data — permanent by design; soft-delete only
4. Real-time interim transcription display during recording (V2 enhancement)
5. Audio playback in the recording widget itself — playback is an admin-only audit feature, not part of `VoiceTextarea`
6. Voice commands ("submit lead", "go to visits") — this is not a voice assistant
7. Offline voice recording with queue-and-sync
8. Speaker identification or voice biometrics
9. Auto-translation (Hindi voice to English text)
10. Full admin portal coverage — desktop users type fine; admin fields are lowest priority
11. Custom wake words or hands-free mode

---

## Related Documents

- [i18n Architecture](../08-i18n.md) — locale mapping, `useLocale()` hook, `NextIntlClientProvider` scope, translation key conventions
- [Tech Stack](../01-tech-stack.md) — component conventions, shadcn/ui inventory, form patterns, Convex Actions
- [Convex Architecture](../11-convex-architecture.md) — Actions layer, file storage upload pattern, `internalAction` usage
- [Guard Portal UX](../05-guard-portal-ux.md) — guard portal screens where P1 fields live
- [OPS Portal](20-ops-portal.md) — OPS portal screens where P2 fields live
- [Tenant Inquiry](13-tenant-inquiry.md) — tenant inquiry form (P4 target field)
- [Deal Room](18-deal-room.md) — `ChecklistItemCard` and `ChatInput` (P3 target fields)
