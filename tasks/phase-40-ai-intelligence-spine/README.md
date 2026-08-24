# Phase 40: AI Intelligence Spine (P40)

## Overview

Implement the AI intelligence backbone for pricing, conversion prioritization, fraud controls, photo quality gating, and vacancy freshness. This phase is execution-focused: concrete formulas, explicit Convex contracts, strict retry/fallback behavior, budget governance, and cross-phase output contracts consumed by P33/P35/P41/P12.

## Dependencies

- P33 Trust & Verification Display must be done (vacancy freshness statuses consumed by trust surfaces)
- P12 Analytics must be done (AI snapshot contract extends analytics snapshots)
- P06 Listings must be done (listing photo schema required by photo quality + duplicate hash detection)
- P35 Notification Infrastructure is a soft dependency for event delivery wiring (`fraud.alert.*`, `photo.quality.pending_review`, `vacancy.heartbeat.stale`)

## Key Documentation

- `notes/features/32-ai-intelligence-spine.md`
- `notes/features/25-trust-verification-display.md`
- `notes/features/27-notification-infrastructure.md`
- `notes/features/33-supply-channel-diversification.md`
- `notes/features/10-analytics.md`
- `notes/10-convex-schema.md`
- `notes/11-convex-architecture.md`
- `notes/13-constants-reference.md`

## Epics

| ID      | Title                           | Tasks | Status  | Depends On                       | Priority |
| ------- | ------------------------------- | ----- | ------- | -------------------------------- | -------- |
| P40-E01 | Fair Rent Calculator            | 4     | pending | []                               | Critical |
| P40-E02 | Lead Scoring & Fraud Detection  | 4     | pending | []                               | Critical |
| P40-E03 | AI Photo Quality Gate           | 4     | pending | [P06]                            | Critical |
| P40-E04 | AI Admin Dashboard & Governance | 4     | pending | [P12, P40-E01, P40-E02, P40-E03] | High     |
| P40-E05 | Vacancy Heartbeat               | 4     | pending | [P33]                            | High     |

## Dependency Graph

```text
External prerequisites: P06 + P12 + P33

P40-E01 ---------------------------> P40-E04
   |
   +------> P40-E02 ---------------> P40-E04
               ^
               |
P40-E03 --------+ (optional image dedup enrichment)

P40-E03 ---------------------------> P40-E04

P33 -------------------------------> P40-E05
```

E02 lead scoring can proceed without image dedup; optional dHash enrichment is added after E03 completion. Coordination happens through shared config keys, audit actions, and output contracts.

## Completion Criteria

- [ ] Lead conversion score implemented with exact FIT/ENGAGEMENT/ANTI weights, normalization, and HOT/WARM/COOL/COLD banding
- [ ] Fraud risk score implemented with six weighted signals (including dHash duplicate detection) and thresholds (alert >=60, auto-flag >=80)
- [ ] OpenAI integrations defined with strict JSON schema response format and verbatim prompt templates for rent and photo quality
- [ ] `ai_*` config keys, `ai.*` permissions, AI rate limits, and audit actions fully specified and implemented
- [ ] `ai_usage_tracking` cost governance enforces daily budget cap and persists token/cost telemetry
- [ ] Module-level fallback behavior implemented: stale rent, pending-review photo, rules-only lead score, manual-review fraud
- [ ] `fraud_appeals` lifecycle implemented (`SUBMITTED -> UNDER_REVIEW -> UPHELD/OVERTURNED`)
- [ ] Cron schedules implemented exactly: `recomputeLeadScores` daily 2am UTC, `recomputeFraudRisk` daily 3am UTC, `vacancyHeartbeat` every 6h
- [ ] Cross-phase contracts shipped for P41, P33, P35, and P12 with typed payload schemas
- [ ] `/admin/ai-analytics` dashboard ships daily spend, volume, latency, score distribution, and override-rate widgets with budget alerting
- [ ] `npx tsc --noEmit`, `npm run build`, and LSP diagnostics pass for all changed files

## File Tree

```text
phase-40-ai-intelligence-spine/
  README.md
  P40-E01-fair-rent-calculator.md
  P40-E02-lead-scoring-fraud-detection.md
  P40-E03-ai-photo-quality-gate.md
  P40-E04-ai-admin-dashboard-governance.md
  P40-E04-vacancy-heartbeat.md
```

## Scope Boundaries

### In Scope

- Deterministic/rules + AI hybrid scoring contracts
- OpenAI action wiring with retries, timeout, and fallbacks
- AI budget governance, usage tracking, and rate limiting
- Admin explainability and override-ready data shape
- Vacancy freshness contracts aligned to P33 trust semantics

### Out of Scope

- Custom model training pipelines
- Provider multi-region failover infrastructure
- Real-time streaming model inference
- Autonomous enforcement without human override
