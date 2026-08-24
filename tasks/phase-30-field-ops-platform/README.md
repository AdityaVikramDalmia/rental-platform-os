# Phase 30: Field Ops Platform (P30)

## Overview

This phase transforms Rental Platform OS from a guard-first lead capture app into a full field operations platform.

1. Add an `OPS` user type with a dedicated mobile-first portal.
2. Build a configurable property inspection checklist system.
3. Add document collection and society liaison workflows.
4. Overhaul incentives with quality scoring, streaks, and bounty multipliers.
5. Reconcile and update all documentation to reflect the new operating model.

## Dependencies

- **P01 (Auth)**: Existing WorkOS auth foundation, RBAC scaffolding, and user bootstrap patterns.
- **P07 (Visits)**: Visit lifecycle and assignment/execution flows that OPS will manage in the field.
- **P09 (Payouts)**: Existing earnings/payout lifecycle that Incentive Model v2 will extend.
- **P10 (Incentives)**: Existing incentive baseline that will be overhauled in this phase.

## Epics

| ID      | Title                                 | Status | Depends On                           |
| ------- | ------------------------------------- | ------ | ------------------------------------ |
| P30-E01 | Ops Persona Foundation                | done   | []                                   |
| P30-E02 | Property Inspection Checklist Engine  | done   | [P30-E01]                            |
| P30-E03 | Document Collection & Society Liaison | done   | [P30-E01, P30-E02]                   |
| P30-E04 | Incentive Model v2                    | done   | [P30-E02]                            |
| P30-E05 | Documentation Reconciliation          | done   | [P30-E01, P30-E02, P30-E03, P30-E04] |

## Completion Criteria

- [ ] OPS users can log in with phone + password using the `@ops.local` synthetic email flow.
- [ ] OPS users land in a dedicated mobile-first `/ops/*` portal with bottom navigation.
- [ ] OPS portal exposes operational surfaces for checklists, documents, visits, leads, and closures.
- [ ] Guard visit execution is enhanced with inspection checklist capture.
- [ ] Quality scoring and streak systems feed bounty multipliers in Incentive Model v2.
- [ ] Product and technical docs are fully reconciled with Phase 30 architecture and workflows.
