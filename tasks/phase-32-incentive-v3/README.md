# Phase 32: Incentive v3 - Multi-Persona Commission Engine & Gamification (P32)

## Overview

Phase 32 expands incentives from v2 guard-centric quality multipliers into a multi-persona commission and motivation program. The phase adds dynamic commission evaluation, multi-contributor attribution, gamification loops, and controlled shadow-mode migration so payouts can transition safely from v2 to v3.

## Dependencies

- P30 (Field Ops Platform) must be done for OPS workflows, checklist quality data, and incentive v2 baseline.
- P31 (Owner Entity & RM Foundation) must be done for canonical owner/deal context and RM attribution paths.

## Epics

| ID      | Title                                 | Status | Depends On                  | File               |
| ------- | ------------------------------------- | ------ | --------------------------- | ------------------ |
| P32-E01 | Core Engine + Config Versioning       | spec'd | []                          | `tasks/P32-E01.md` |
| P32-E02 | Commission Engine                     | spec'd | [P32-E01]                   | `tasks/P32-E02.md` |
| P32-E03 | Multi-Contributor Attribution         | spec'd | [P32-E01, P32-E02]          | `tasks/P32-E03.md` |
| P32-E04 | Gamification Layer v1                 | spec'd | [P32-E01]                   | `tasks/P32-E04.md` |
| P32-E05 | Shadow Mode Rollout + Guard Migration | spec'd | [P32-E02, P32-E03, P32-E04] | `tasks/P32-E05.md` |

## Completion Criteria

- [ ] Versioned incentive config and persona actor profiles are live and admin-manageable.
- [ ] Commission engine computes deterministic v3 evaluations with transparent modifier breakdown.
- [ ] Attribution engine logs contributions and computes exact-paise split disbursements.
- [ ] Gamification profile, tier, streak, and quest systems are active for OPS/guard personas.
- [ ] Shadow-mode delta reporting validates parity and enables controlled guard migration to v3 payout source.
