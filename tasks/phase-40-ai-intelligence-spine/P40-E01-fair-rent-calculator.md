---
id: P40-E01
title: Fair Rent Calculator
phase: 40
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P40-E01: Fair Rent Calculator

## Overview

Deliver production-grade fair-rent estimation with strict Convex contracts, OpenAI structured outputs, budget/rate-limit guardrails, cache + stale fallback behavior, and `/tools` integration. This epic also establishes rent-specific AI telemetry so cost and reliability are auditable from day one.

## Prerequisites

- `notes/features/32-ai-intelligence-spine.md` finalized contracts are source of truth.
- Existing tools shell from `src/app/(public)/tools/` is available.
- P12 analytics snapshots exist and can consume P40 AI metrics.

## Task Queue

- [ ] P40-E01-T01: Add rent estimation schema, config keys, and rate-limit keys
- [ ] P40-E01-T02: Implement `aiRent` Convex query/mutation contracts and cache behavior
- [ ] P40-E01-T03: Implement OpenAI rent estimation action with retries, budget cap, and usage tracking
- [ ] P40-E01-T04: Integrate fair-rent calculator UI in `/tools` with confidence + stale states

---

## T01: Add Rent Estimation Schema, Config Keys, and Rate-Limit Keys

### Objective

Create strict data and config foundations for rent estimation so all downstream logic has canonical validators, indexes, and governance keys.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`
- `convex/schema.ts`
- `convex/rateLimiter.ts`
- `lib/constants.ts`

### Key Rules

1. Money fields use paise integers only.
2. Confidence is `0..1` decimal, never `0..100` in storage.
3. Add `ai_cache_ttl_ms`, `ai_rent_confidence_threshold`, and shared AI timeout/retry keys.
4. Add rate-limit key `ai:rent_estimate` at `20/min` per-user.
5. Every table/query path must be index-first; no full-table scans.
6. Model runtime parameters (`temperature`, `max_tokens`, `timeout`, `retry`) are defined in the feature spec Model Configuration section. Use these exact values when configuring OpenAI Action calls.

### Deliverables

- [ ] `convex/schema.ts` - add `ai_rent_estimates` and rent-related fields/indexes exactly as Phase 40 feature spec
- [ ] `convex/rateLimiter.ts` - add `ai:rent_estimate` limiter (`20/min`, key = userId)
- [ ] `lib/constants.ts` - add AI config key constants for rent + shared AI runtime
- [ ] `notes/features/32-ai-intelligence-spine.md` - keep schema/config references aligned if field names changed during implementation

### Acceptance Criteria

1. `ai_rent_estimates` stores request tuple, output paise values, confidence, factors, model version, and expiry timestamps.
2. Table indexes include `by_estimate_key`, `by_society_expires`, and `by_expires`.
3. All required AI rent config keys are seeded/readable through existing config patterns.
4. Rate-limit key enforces `20/min` per authenticated requester.
5. `npx tsc --noEmit` passes with no new type escapes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/schema.ts`, `convex/rateLimiter.ts`, and `lib/constants.ts`.

### Out of Scope

- OpenAI provider calls
- UI rendering
- analytics snapshot wiring

---

## T02: Implement `aiRent` Convex Query/Mutation Contracts and Cache Behavior

### Objective

Implement deterministic request keying, cache lookup, stale response handling, and explicit query/mutation contracts for rent estimation.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Function/API Contracts + Rent Cache Behavior)
- `notes/11-convex-architecture.md`
- `convex/functions.ts`
- `convex/listings.ts`
- `convex/closures.ts`

### Key Rules

1. `aiRent.getEstimate` must expose exact args/return shape from feature spec.
2. Cache key must be deterministic and stable across equivalent input ordering.
3. Expired cache result returns `is_stale: true` if fallback path is used.
4. No external API calls from mutation/query handlers.
5. Every returned payload includes `model_version` and `computed_at`.

### Deliverables

- [ ] `convex/aiRent.ts` - implement `getEstimate` query and `requestEstimateRefresh` mutation with strict validators
- [ ] `convex/aiRent.ts` - cache utilities (`buildEstimateKey`, `isExpired`, `toStaleResponse`)
- [ ] `convex/_generated/api` usage update references in impacted UI/data callers

### Acceptance Criteria

1. `aiRent.getEstimate` first serves fresh cache when available.
2. Expired cache with unavailable provider returns stale payload with `is_stale: true`.
3. Missing cache + unavailable provider returns typed `AI_RENT_UNAVAILABLE` error.
4. `requestEstimateRefresh` returns `{ request_id, queued }` and schedules action execution.
5. TypeScript infers correct return types for callers without `as any`.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/aiRent.ts`.

### Out of Scope

- OpenAI prompt formatting
- token/cost tracking persistence

---

## T03: Implement OpenAI Rent Estimation Action With Retries, Budget Cap, and Usage Tracking

### Objective

Build the provider action with structured outputs, fixed retry/backoff policy, daily budget hard stop, and usage telemetry persistence.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (OpenAI Prompt Templates, Cost Governance)
- `notes/11-convex-architecture.md` (Action patterns)
- `convex/actions/chatAI.ts`
- `convex/actions/dealTermExtraction.ts`

### Key Rules

1. Use exact rent system prompt from feature doc (verbatim).
2. Use `response_format: { type: "json_schema" }` with strict parsing.
3. Retry timings must be exactly 1s/2s/4s with max 3 retries.
4. Enforce daily budget using `ai_usage_tracking` before provider call.
5. Persist `input_tokens`, `output_tokens`, and `cost_cents` for each attempt outcome.

### Deliverables

- [ ] `convex/actions/aiRent.ts` - provider action and retry orchestration
- [ ] `convex/aiUsage.ts` - helper mutation/query to read daily spend and insert usage rows
- [ ] `convex/aiRent.ts` - internal mutation(s) to persist successful estimate output

### Acceptance Criteria

1. Action emits valid JSON with required keys only.
2. Final failure path returns fallback-compatible result without crashing caller.
3. Budget cap (`ai_daily_budget_cents`) blocks call initiation when already exhausted.
4. Usage rows are persisted with request id, model, token counts, and cost.
5. Action never directly mutates DB without `ctx.runMutation`.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/actions/aiRent.ts` and `convex/aiUsage.ts`.

### Out of Scope

- UI confidence messaging
- analytics dashboard rendering

---

## T04: Integrate Fair-Rent Calculator UI in `/tools` With Confidence + Stale States

### Objective

Ship a tenant-facing fair-rent tool page that consumes `aiRent.getEstimate`, displays confidence and comparables, and handles stale/insufficient states safely.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md`
- `notes/features/16-tenant-tools.md`
- `src/app/(public)/tools/tools-page-client.tsx`
- `src/components/tenant/rent-calculator.tsx`

### Key Rules

1. Never display rupee floats derived from non-paise sources.
2. Show explicit stale badge when `is_stale: true`.
3. Show low-confidence warning when `confidence_score < ai_rent_confidence_threshold`.
4. Keep mobile-first spacing and accessibility parity with existing tools.
5. Avoid blocking form submission; graceful errors only.

### Deliverables

- [ ] `src/components/tenant/fair-rent-calculator.tsx` - new fair-rent tool component
- [ ] `src/app/(public)/tools/tools-page-client.tsx` - integrate tool card/route state
- [ ] `src/lib/rent-calculator.ts` - add shared formatting helpers for confidence/factor rendering (if needed)

### Acceptance Criteria

1. Tool accepts required input tuple and triggers `aiRent.getEstimate`.
2. UI renders `estimated_rent_paise`, comparable range, confidence, and factors.
3. Stale response state is clearly marked and still renders usable estimate.
4. Low-confidence state displays warning copy without hiding output.
5. Component works in mobile and desktop viewports and passes build.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/tenant/fair-rent-calculator.tsx` and `src/app/(public)/tools/tools-page-client.tsx`.

### Out of Scope

- Personalized negotiation recommendations
- external benchmark data feeds

---

## Epic Verification Scenario (Task-Specific)

Run rent estimation for a test listing with known comparable data. Verify returned estimate is within 10% of manual calculation. Verify one `ai_usage_tracking` row is created with correct token count. Verify fallback by setting an invalid OpenAI API key: with expired cache, function returns stale cached payload (`is_stale: true`); with no cache, function returns typed `AI_RENT_UNAVAILABLE` error.

---

## Completion Summary

> Fill this section when epic status becomes `done`.

**Completed**: YYYY-MM-DD

### What Was Built

- TODO

### Key File Locations

| File               | What |
| ------------------ | ---- |
| `convex/aiRent.ts` | TODO |

### Deviations from Spec

- TODO

### Gotchas for Next Epic

- TODO
