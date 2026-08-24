# Phase 41: Supply Channel Diversification (P41)

## Overview

Expand supply acquisition from one-channel (guard-led) intake to a multi-channel model while preserving canonical lead ownership, strict de-dup/collision handling, and auditable payout impact. This phase adds owner self-list, secretary intake, resident referrals, corporate relocation, and broker partnerships with a single source attribution contract.

## Dependencies

### Hard Dependencies

- P04 Lead Pipeline must be done (canonical lead lifecycle + duplicate detection contract)
- P31 Owner Entity and RM must be done (owner phone normalization + canonical owner matching)

### Soft Dependencies

- P40 AI Intelligence Spine (score bands/freshness contract for quality gates; fallback path defined)
- P37 Post-Move-In Lifecycle (resident profile eligibility for resident referral channel)

## Cross-Phase Contracts in Scope

1. P40 -> P41 score interface (HOT/WARM/COOL/COLD gates + 24h freshness TTL + unknown-score fallback)
2. P04 -> P41 de-dup integration (`source_collisions` creation and resolution)
3. P31 -> P41 owner identity matching (10-digit phone normalization and conflict review)
4. P22 -> P41 resident referral payout/milestone reuse
5. P37 -> P41 resident profile eligibility with interim behavior when profile rails are absent

## Key Documentation

- `notes/features/33-supply-channel-diversification.md`
- `notes/features/03-lead-pipeline.md`
- `notes/features/17-referral-system.md`
- `notes/features/21-owner-entity-and-rm.md`
- `notes/features/29-post-move-in-lifecycle.md`
- `notes/features/32-ai-intelligence-spine.md`
- `notes/10-convex-schema.md`
- `notes/11-convex-architecture.md`
- `notes/13-constants-reference.md`

## Epics

| ID      | Title                                   | Tasks | Status  | Depends On | Priority |
| ------- | --------------------------------------- | ----- | ------- | ---------- | -------- |
| P41-E01 | Owner Self-List and Source Foundation   | 4     | pending | []         | Critical |
| P41-E02 | Society Secretary and Resident Channels | 4     | pending | [P41-E01]  | Critical |
| P41-E03 | Corporate Relocation                    | 4     | pending | [P41-E01]  | High     |
| P41-E04 | Broker Partnerships                     | 4     | pending | [P41-E01]  | High     |

**Task Count**: 16 total tasks (4 tasks in each of 4 epics).

## Dependency Graph

```text
P41-E01
  |- P41-E02
  |- P41-E03
  `- P41-E04
```

## Completion Criteria

- [ ] All 9 required P41 tables are defined with validators and indexes (`supply_sources`, `source_collisions`, `owner_direct_leads`, `broker_partnerships`, `corporate_partnerships`, `secretary_intake`, `resident_referrals`, `channel_analytics`, `channel_configs`)
- [ ] `leads` supports backward-compatible source attribution (`source_channel`, `source_reference_id`, typed `source_metadata`, legacy `submitted_by_guard_id` retained)
- [ ] All 6 required lifecycle models are implemented with transition guards and actor permissions (supply source, broker, corporate, secretary, resident, collision)
- [ ] Full 15-pair collision matrix is enforced with deterministic winner + payout impact behavior
- [ ] Supply permissions and config keys are implemented exactly as specified
- [ ] Broker threshold/suspension rules, corporate SLA lifecycle, secretary onboarding, and resident eligibility rules are fully implemented
- [ ] P41 cron and rate-limit contracts are implemented (`resolveStaleCollisions`, `retryPendingCollisions`, `checkBrokerPerformance`, `checkCorporateSLAStages`, `channel_health_check`, channel intake limiters)
- [ ] `npx tsc --noEmit` and `npm run build` pass for implementation changes

## File Tree

```text
phase-41-supply-channel-diversification/
  README.md
  P41-E01-owner-self-list-lead-sources.md
  P41-E02-society-secretary-resident-channels.md
  P41-E03-corporate-relocation.md
  P41-E04-broker-partnerships.md
```

## Scope Boundaries

### In Scope

- Multi-channel lead intake model and source attribution
- Collision detection/resolution with payout impact
- Owner direct lifecycle, secretary and resident channel rails
- Corporate relocation intake and SLA management
- Broker onboarding, quality gates, suspension/reinstatement

### Out of Scope

- Paid ad-marketplace ingestion
- External MLS sync and franchise marketplace APIs
- Cross-cutting doc rewrites outside P41
