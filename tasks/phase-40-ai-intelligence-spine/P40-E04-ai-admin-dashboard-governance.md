---
id: P40-E04
title: AI Admin Dashboard & Governance
phase: 40
status: pending
depends_on: ["P12", "P40-E01", "P40-E02", "P40-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P40-E04: AI Admin Dashboard & Governance

## Overview

Deliver `/admin/ai-analytics` with actionable operational widgets and governance controls: spend tracking, endpoint volume, latency, score distributions, override-rate visibility, and multi-level budget alerting with hard-stop behavior.

## Prerequisites

- P12 analytics infrastructure is available for dashboard query patterns.
- P40-E01/E02/E03 produce usage, score, and override data contracts.
- `notes/features/32-ai-intelligence-spine.md` remains source of truth for P40 dashboard/governance contracts.

## Task Queue

- [ ] P40-E04-T01: Add dashboard query contracts and aggregations from `ai_usage_tracking`
- [ ] P40-E04-T02: Build `/admin/ai-analytics` page with required widgets and filters
- [ ] P40-E04-T03: Implement cost-alert thresholds (`WARN`, `CRITICAL`, `HARD_STOP`) in AI action path
- [ ] P40-E04-T04: Add override-rate and shadow-mode A/B comparison surfaces

---

## T01: Add Dashboard Query Contracts and Aggregations

### Objective

Provide stable backend contracts for daily spend, endpoint volume, model latency, score distributions, and override-rate metrics.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (AI Analytics Dashboard Spec)
- `notes/features/10-analytics.md`
- `convex/analytics.ts`

### Key Rules

1. Use `ai_usage_tracking` as the source of truth for spend/volume/latency.
2. Support filters for `7d`, `30d`, `90d`, model, and endpoint.
3. Keep query shape stable for frontend rendering and CSV export extension.

### Deliverables

- [ ] `convex/aiAnalytics.ts` - implement `getDashboard(timeWindow)` query
- [ ] `convex/analytics.ts` - wire P40 snapshot extension fields if needed

### Acceptance Criteria

1. Query returns a single typed payload containing spend trend, endpoint volume, latency by model, score distributions, and override-rate metrics.
2. `7d`, `30d`, and `90d` filters are supported and produce deterministic results for the same input args.
3. Optional `model` and `endpoint` filters are applied consistently across all widget datasets in the same response.
4. Aggregations use index-friendly query paths and avoid unbounded `.collect()` on `ai_usage_tracking`.
5. Snapshot extension fields in `convex/analytics.ts` include the P40 cost/call/failure metrics required by the feature spec.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/aiAnalytics.ts` and `convex/analytics.ts`.

### Out of Scope

- Dashboard UI polish/animations

---

## T02: Build `/admin/ai-analytics` Page With Required Widgets and Filters

### Objective

Ship the admin interface for AI analytics with clear budget context and drill-down-friendly visualizations.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (AI Analytics Dashboard Spec)
- `src/app/(admin)/admin/dashboard/page.tsx`
- `src/components/admin/dashboard/`

### Key Rules

1. Widgets must include spend line with budget overlay, endpoint volume bar, latency table, score histograms, and override rate.
2. Filters (`7d`/`30d`/`90d`, model, endpoint) must update all widgets in sync.
3. Mobile and desktop layouts must both remain usable.

### Deliverables

- [ ] `src/app/(admin)/admin/ai-analytics/page.tsx` - analytics page shell
- [ ] `src/components/admin/ai-analytics/ai-analytics-filter-bar.tsx` - global filter controls (`7d`/`30d`/`90d`, model, endpoint)
- [ ] `src/components/admin/ai-analytics/ai-daily-spend-chart.tsx` - spend trend with budget overlay
- [ ] `src/components/admin/ai-analytics/ai-endpoint-volume-chart.tsx` - endpoint volume widget
- [ ] `src/components/admin/ai-analytics/ai-latency-table.tsx` - model latency widget
- [ ] `src/components/admin/ai-analytics/ai-score-distribution-chart.tsx` - score distribution widget
- [ ] `src/components/admin/ai-analytics/ai-override-rate-card.tsx` - override-rate widget

### Acceptance Criteria

1. `/admin/ai-analytics` renders all five required widgets from backend data without schema mismatches.
2. Budget overlay line renders on the daily spend chart using `ai_daily_budget_cents`.
3. Time-window/model/endpoint filters update all widgets in a synchronized refresh.
4. Loading, empty, and error states are explicit for each widget and do not block the full page.
5. Layout is usable on both desktop and mobile breakpoints with no overlapping controls.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed admin analytics UI files.

### Out of Scope

- New charting library migration

---

## T03: Implement Cost-Alert Thresholds and Hard-Stop Governance

### Objective

Enforce spend guardrails at action-invocation time and route alerts to admin channels.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Cost Alerting)
- `convex/actions/aiRent.ts`
- `convex/actions/aiPhoto.ts`
- `convex/notifications.ts`

### Key Rules

1. Check budget on every AI action invocation.
2. Trigger `WARN` at 80%, `CRITICAL` at 95%, and `HARD_STOP` at 100%.
3. `HARD_STOP` blocks non-critical AI calls.
4. Data retention implementation: E04 includes the retention cron `ai_data_retention` (weekly) that soft-deletes expired AI artifacts per retention policy in feature spec. Deliverable: `convex/crons.ts` retention cron entry.

### Deliverables

- [ ] `convex/actions/aiGovernance.ts` - shared budget guard + threshold crossing helper
- [ ] `convex/actions/aiRent.ts` - invoke governance guard before provider calls
- [ ] `convex/actions/aiPhoto.ts` - invoke governance guard before provider calls
- [ ] `convex/actions/aiBatch.ts` - invoke governance guard before provider calls
- [ ] `convex/notifications.ts` - threshold notification hooks for `IN_APP`, `EMAIL`, and `SMS`
- [ ] `convex/crons.ts` - add `ai_data_retention` weekly cron entry for retention policy enforcement

### Acceptance Criteria

1. Every P40 action path checks daily spend before any OpenAI call.
2. `WARN` (80%), `CRITICAL` (95%), and `HARD_STOP` (100%) thresholds trigger exactly once per threshold crossing per UTC day.
3. `HARD_STOP` denies non-critical AI calls deterministically and returns a typed governance error.
4. Alert payloads include spend-to-date, threshold, action type, and request context fields.
5. Weekly `ai_data_retention` cron is registered in `convex/crons.ts` and references the retention handler.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed action and notification files.

### Out of Scope

- Provider billing reconciliation automation

---

## T04: Add Override-Rate and Shadow-Mode A/B Comparison Surfaces

### Objective

Expose governance metrics that compare live and shadow outputs and quantify manual correction rates.

### Required Reading

- `notes/features/32-ai-intelligence-spine.md` (Rollout and Version Migration)
- `convex/shadowMode.ts`
- `src/components/admin/dashboard/`

### Key Rules

1. Override-rate must be computed as `% overridden / total AI decisions`.
2. A/B table must show live vs shadow deltas by endpoint.
3. Dashboard must remain performant for 90-day windows.

### Deliverables

- [ ] `convex/aiAnalytics.ts` - add override-rate trend and shadow-vs-live comparison query payloads
- [ ] `src/app/(admin)/admin/ai-analytics/page.tsx` - wire governance comparison datasets into page state
- [ ] `src/components/admin/ai-analytics/ai-override-rate-trend.tsx` - override-rate trend visualization
- [ ] `src/components/admin/ai-analytics/ai-shadow-comparison-table.tsx` - live vs shadow delta table

### Acceptance Criteria

1. Override-rate trend renders `% overridden / total AI decisions` for the selected filter window.
2. Shadow comparison table renders live vs shadow deltas by endpoint with deterministic sorting.
3. Both widgets use typed query contracts from `convex/aiAnalytics.ts` with no `any` escapes.
4. `7d`, `30d`, and `90d` filters apply consistently to override and shadow datasets.
5. Dashboard remains performant for 90-day windows with index-friendly backend aggregation.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed dashboard query/UI files.

### Out of Scope

- Autonomous model rollout toggles

---

## Epic Verification Scenario (Task-Specific)

Verify dashboard loads with mock data. Verify daily budget chart shows cumulative spend. Verify cost alert fires when spend exceeds 80% of `ai_daily_budget_cents`. Verify A/B comparison table renders shadow-mode results.

---

## Completion Summary

> Fill this section when epic status becomes `done`.

**Completed**: YYYY-MM-DD

### What Was Built

- TODO

### Key File Locations

| File                                          | What |
| --------------------------------------------- | ---- |
| `src/app/(admin)/admin/ai-analytics/page.tsx` | TODO |
| `convex/aiAnalytics.ts`                       | TODO |

### Deviations from Spec

- TODO

### Gotchas for Next Epic

- TODO
