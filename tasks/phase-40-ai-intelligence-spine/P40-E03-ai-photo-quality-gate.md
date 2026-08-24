---
id: P40-E03
title: AI Photo Quality Gate
phase: 40
status: pending
depends_on: ["P06"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-20
---

# P40-E03: AI Photo Quality Gate

## Overview

Implement photo quality intelligence for listing uploads using strict room taxonomy, standardized quality statuses (`ACCEPTED`, `PENDING_REVIEW`, `RETAKE_REQUIRED`, `REJECTED`), OpenAI vision structured outputs, duplicate hash support, and manual-review fallback paths.

## Prerequisites

- P06 listing photo table and upload flow exists.
- `notes/features/32-ai-intelligence-spine.md` prompt and status contracts are final.
- Guard upload UI from listing/lead flow is available for integration.

## Task Queue

- [ ] P40-E03-T01: Extend listing photo schema with quality fields, room taxonomy, and `image_hash` (dHash)
- [ ] P40-E03-T02: Implement photo-quality action with verbatim prompt, JSON schema output, and retries
- [ ] P40-E03-T03: Implement quality decision mutation/query contracts and guard upload integration
- [ ] P40-E03-T04: Build pending-review admin workflow and override permissions

---

## T01: Extend Listing Photo Schema With Quality Fields, Room Taxonomy, and `image_hash` (dHash)

### Objective

Define canonical data structures for photo quality, duplicate detection, and explainability so action and UI layers consume one normalized model.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md`
- `notes/features/05-listings.md`
- `notes/10-convex-schema.md`
- `convex/schema.ts`
- `lib/constants.ts`

### Key Rules

1. Status enum must be exactly `ACCEPTED`, `PENDING_REVIEW`, `RETAKE_REQUIRED`, `REJECTED`.
2. Use `ai_photo_analyses.image_hash` (dHash, 16-char hex) for duplicate-photo fraud signals.
3. Room taxonomy values must match feature spec exactly.
4. Confidence is stored as `0..1` decimal.
5. Keep all timestamps in Unix ms.
6. Model runtime parameters (`temperature`, `max_tokens`, `timeout`, `retry`) are defined in the feature spec Model Configuration section. Use these exact values when configuring OpenAI Action calls.

### Deliverables

- [ ] `convex/schema.ts` - extend `listing_photos` and add `ai_photo_analyses.image_hash` + quality fields
- [ ] `lib/constants.ts` - add photo quality status and room taxonomy constants
- [ ] `notes/features/32-ai-intelligence-spine.md` - sync names if implementation identifiers differ

### Acceptance Criteria

1. `listing_photos` includes all required quality metadata fields from spec.
2. No legacy enum values (`ACCEPT`, `RETAKE`) remain in AI photo flow.
3. Room taxonomy list is exported and reusable by action + UI.
4. Existing listing photo reads/writes remain backward compatible.
5. TypeScript/build pass without schema validator mismatch.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts` and `lib/constants.ts`.

### Out of Scope

- OpenAI provider calls
- guard UI updates

---

## T02: Implement Photo-Quality Action With Verbatim Prompt, JSON Schema Output, and Retries

### Objective

Build an OpenAI action that evaluates uploaded images on five criteria and returns strict structured output with retry/backoff and budget/usage tracking hooks.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Photo prompt template + fallback policy)
- `notes/11-convex-architecture.md`
- `convex/actions/chatAI.ts`
- `convex/actions/dealTermExtraction.ts`

### Key Rules

1. Use the exact photo system prompt text from feature doc.
2. Use `response_format: { type: "json_schema" }` and validate required keys.
3. Retry with 1s/2s/4s backoff, max 3 retries.
4. On final failure, do not block upload; return fallback marker for pending review.
5. Persist usage telemetry (`input_tokens`, `output_tokens`, `cost_cents`).

### Deliverables

- [ ] `convex/actions/aiPhoto.ts` - photo evaluation action and parser
- [ ] `convex/aiUsage.ts` - write usage row for `PHOTO_QUALITY`
- [ ] `convex/aiPhoto.ts` - helper for provider response normalization to project enums

### Acceptance Criteria

1. Action returns `overall_score`, `defects`, `room_type`, `is_acceptable` only.
2. Invalid provider output is rejected and retried under backoff policy.
3. Final-failure path returns deterministic fallback contract for `PENDING_REVIEW`.
4. Usage tracking row is inserted for each completed request.
5. Action remains DB-write-free except via `ctx.runMutation`.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/actions/aiPhoto.ts` and `convex/aiPhoto.ts`.

### Out of Scope

- status persistence on `listing_photos`
- admin review UI

---

## T03: Implement Quality Decision Mutation/Query Contracts and Guard Upload Integration

### Objective

Connect action results to listing photo records and guard upload flow with deterministic thresholds, warnings, and retry guidance.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (threshold keys + fallback behavior)
- `src/components/guard/GuardPhotoUpload.tsx`
- `src/components/ui/sonner.tsx`
- `convex/listings.ts`

### Key Rules

1. Apply threshold keys from config (`ai_photo_accept_threshold`, `ai_photo_warn_threshold`).
2. `<= warn_threshold` must map to `RETAKE_REQUIRED` unless fallback forces `PENDING_REVIEW`.
3. Upload completion should never hard fail due to AI timeout/provider outage.
4. Mutation and query validators must match feature doc contracts exactly.
5. Guard feedback must include actionable defect reasons.

### Deliverables

- [ ] `convex/aiPhoto.ts` - `applyQualityResult` mutation and quality read query contracts
- [ ] `src/components/guard/GuardPhotoUpload.tsx` - integrate quality status feedback and retry messaging
- [ ] `src/lib/photo-quality.ts` - decision helper mapping score + defects to status

### Acceptance Criteria

1. Accepted photos persist `ACCEPTED` and quality metadata.
2. Low-score photos persist `RETAKE_REQUIRED` with defect labels.
3. Provider-failure photos persist `PENDING_REVIEW` and allow upload completion.
4. Guard UI surfaces status-specific copy and does not freeze on pending states.
5. Query contract returns status, score, defects, room_type, confidence, and evaluated timestamp.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/aiPhoto.ts`, `src/components/guard/GuardPhotoUpload.tsx`, and `src/lib/photo-quality.ts`.

### Out of Scope

- fraud scoring integration using `image_hash`
- listing publish eligibility redesign beyond existing gating

---

## T04: Build Pending-Review Admin Workflow and Override Permissions

### Objective

Add admin/ops review workflow for pending/rejected photos and enforce `ai.review_pending`/`ai.override` permissions.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (permissions + fallback)
- `convex/auth.helpers.ts`
- `src/app/(admin)/admin/listings/`
- `src/components/admin/`

### Key Rules

1. Review actions require `ai.review_pending`.
2. Override actions require `ai.override`.
3. Override writes must preserve original AI output for auditability.
4. Emit `photo.quality.pending_review` event for P35 integration.
5. Every review/override operation logs dedicated audit action.

### Deliverables

- [ ] `convex/aiPhoto.ts` - review queue query + approve/reject/override mutations
- [ ] `src/app/(admin)/admin/listings/page.tsx` (or listing detail components) - pending-review surface and action controls
- [ ] `convex/notifications.ts` - pending-review event emission hook

### Acceptance Criteria

1. Admin can list photos in `PENDING_REVIEW` with pagination and filters.
2. OPS with `ai.review_pending` can resolve pending items without override privilege.
3. Override mutation updates status and stores override metadata (`reviewer`, `reason`, `at`).
4. Event payloads follow P40 -> P35 contract.
5. Audit logs capture evaluate, pending, and override actions distinctly.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed admin UI files and `convex/aiPhoto.ts`.

### Out of Scope

- redesign of full listing photo gallery UX
- automatic appeal workflow for photo decisions

---

## Epic Verification Scenario (Task-Specific)

Upload a test image and verify dHash is computed and stored. Upload a near-duplicate (`hamming <= 5`) and verify it is flagged. Verify photo quality score is returned with structured feedback. Test with a corrupt image and verify graceful error handling.

---

## Completion Summary

> Fill this section when epic status becomes `done`.

**Completed**: YYYY-MM-DD

### What Was Built

- TODO

### Key File Locations

| File                        | What |
| --------------------------- | ---- |
| `convex/actions/aiPhoto.ts` | TODO |
| `convex/aiPhoto.ts`         | TODO |

### Deviations from Spec

- TODO

### Gotchas for Next Epic

- TODO
