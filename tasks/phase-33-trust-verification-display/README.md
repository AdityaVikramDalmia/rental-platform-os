# Phase 33: Trust & Verification Display (P33)

## Overview

Surface listing trust quality directly in tenant discovery and detail views. This phase adds trust badge computation, freshness SLA monitoring, and UI treatments that make reliability visible before inquiry submission.

## Dependencies

- P06 Listings must be done (listing lifecycle and card/detail surfaces already exist)
- P12 Analytics must be done (cron and aggregate patterns reused)
- P17 Property Detail must be done (detail page sections extended with trust display)

## Key Documentation

- `notes/features/11-tenant-browse.md`
- `notes/features/12-property-detail.md`
- `notes/04-state-machines.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`

## Epics

| ID      | Title                            | Tasks | Status  | Depends On         | Priority |
| ------- | -------------------------------- | ----- | ------- | ------------------ | -------- |
| P33-E01 | Trust Badge Schema & Computation | 3     | pending | []                 | Critical |
| P33-E02 | Freshness SLA & Cron             | 3     | pending | [P33-E01]          | High     |
| P33-E03 | Trust Badge UI                   | 4     | pending | [P33-E01, P33-E02] | High     |

## Dependency Graph

- `P33-E01 -> P33-E02 -> P33-E03`

## Completion Criteria

- [ ] `listing_trust_badges` schema and trust badge enums are added with validators
- [ ] Badge computation mutation/query set returns stable badge payloads for listing cards and detail pages
- [ ] Freshness SLA scoring runs daily and flags stale listings for admin review
- [ ] Admin staleness view shows stale counts and listing-level drill-down
- [ ] Listing cards and property detail pages render trust badges with clear labels and icons
- [ ] Listing sort supports freshness-first ordering in browse results

## File Tree

```text
phase-33-trust-verification-display/
  README.md
  P33-E01-trust-badge-schema-computation.md
  P33-E02-freshness-sla-cron.md
  P33-E03-trust-badge-ui.md
```

## Scope Boundaries

- In scope: trust badges, freshness scoring, staleness operations surface, browse/detail trust UI
- Out of scope: user-generated reviews, tenant trust scoring, notification delivery for stale listings
