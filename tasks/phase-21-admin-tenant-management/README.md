# Phase 21: Support Inbox & CRM Dashboard (P21)

## Overview

Phase 21 delivers the support inquiry lifecycle end-to-end: schema and constants reconciliation, backend mutations/queries for support inquiry operations, and the admin support inbox page at `/admin/support` with status tabs, detail panel, and assignment flow. It also delivers CRM dashboard summary cards that aggregate counts across all three admin-managed entity types: tenant inquiries (from P19), owner service requests (from P20), and support inquiries (from P21). UI built with shadcn/ui components.

**Key Decisions (Oracle-validated)**:

- Reduced scope from skeleton: tenant inquiry admin and owner request admin pages are already fully spec'd in P19-E03 and P20-E03; P21 focuses only on support inquiries plus CRM dashboard cards.
- Support inquiry state machine is forward-only: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED, with allowed shortcuts OPEN -> RESOLVED and OPEN -> CLOSED.
- `ops_notes: v.optional(v.string())` is required in `support_inquiries` despite prior schema doc drift; E01-T01 updates both code and docs.
- V1 CRM dashboard counts use simple `.collect().length` queries, not `@convex-dev/aggregate`.
- P21-E03 uses epic-level dependencies: `P21-E01`, `P19-E02`, and `P20-E01` (IDs, not phase-level dependencies).

## Dependencies

- P01-E01 (auth, permissions, Convex patterns required for support backend functions)
- P19-E02 (tenant inquiry backend lifecycle exists for CRM count cards)
- P20-E01 (owner request backend lifecycle exists for CRM count cards)

**Note**: The original P21 skeleton mixed tenant/owner admin management into this phase. After Oracle review, those admin pages remain in P19-E03 and P20-E03. P21 now owns only support inquiry management and dashboard-level CRM summaries.

## Key Documentation

| Doc                                                                    | Sections to Read                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [features/15-public-pages.md](../../notes/features/15-public-pages.md) | Contact Hub section - `support_inquiries` submission source                    |
| [04-state-machines.md](../../notes/04-state-machines.md)               | Support Inquiry transitions and terminal-state rules                           |
| [10-convex-schema.md](../../notes/10-convex-schema.md)                 | `support_inquiries` schema and indexes                                         |
| [13-constants-reference.md](../../notes/13-constants-reference.md)     | Support Inquiry status values and status-to-color mappings                     |
| [06-admin-panel-ux.md](../../notes/06-admin-panel-ux.md)               | Admin support inbox and dashboard card patterns                                |
| [02-data-models.md](../../notes/02-data-models.md)                     | `support_inquiries` model and relationship context with tenant/owner pipelines |

## ⚠️ Schema Drift Alert

- `support_inquiries` table is not currently defined in `convex/schema.ts`; P21-E01-T01 adds it with indexes.
- `ops_notes` is not currently in the schema doc for `support_inquiries`; P21-E01-T01 reconciles code plus docs.
- `SUPPORT_INQUIRY_STATUS` is not currently in `lib/constants.ts`; P21-E01-T01 adds status union and color mapping.

## ⚠️ Scope Reduction From Skeleton

The original phase skeleton included tenant inquiry admin and owner request admin implementations. Those are already owned by:

- P19-E03 (`/admin/tenant-inquiries`)
- P20-E03 (`/admin/owner-requests`)

P21 does not re-implement those pages. It adds support inquiry management and cross-entity dashboard summarization only.

## Epics

| ID      | Title                                                                             | Tasks | Status | Depends On                |
| ------- | --------------------------------------------------------------------------------- | ----- | ------ | ------------------------- |
| P21-E01 | [Support Inquiries Schema & Backend](P21-E01-support-inquiries-schema-backend.md) | 3     | done   | P01-E01                   |
| P21-E02 | [Support Inbox Admin Page](P21-E02-support-inbox-admin-page.md)                   | 3     | done   | P21-E01                   |
| P21-E03 | [CRM Dashboard Summary Cards](P21-E03-crm-dashboard-summary-cards.md)             | 3     | done   | P21-E01, P19-E02, P20-E01 |

**Total: 3 epics, 9 tasks**

## Dependency Graph

```
P01-E01 --> P21-E01 --> P21-E02
                   \
                    --> P21-E03 <-- P19-E02, P20-E01
```

**Parallel note**: E02 (Support Inbox page) and E03 (CRM dashboard cards) can run in parallel once E01 is complete, as long as P19-E02 and P20-E01 are also complete for E03's cross-entity count queries.

## Completion Criteria

- [x] `support_inquiries` table exists in `convex/schema.ts` with all required fields and indexes
- [x] `SUPPORT_INQUIRY_STATUS` and status colors exist in `lib/constants.ts`
- [x] Full lifecycle mutations and queries exist in `convex/supportInquiries.ts` with forward-only transition validation
- [x] `ops_notes: v.optional(v.string())` exists in schema and is wired through admin mutation paths
- [x] `/admin/support` renders with status tabs, table, detail panel, assignment controls, and ops notes support
- [x] Admin dashboard renders CRM summary cards with aggregate counts for tenant inquiries, owner service requests, and support inquiries
- [x] Convex starts cleanly (`npx convex dev`)
- [x] Build succeeds (`npm run build`)

## File Tree

```
tasks/phase-21-admin-tenant-management/
├── README.md                                          <- this file
├── P21-E01-support-inquiries-schema-backend.md
├── P21-E02-support-inbox-admin-page.md
└── P21-E03-crm-dashboard-summary-cards.md
```

## Scope Boundaries

### IN This Phase

- Support inquiry backend: schema updates, constants, transition-validated mutations, and admin queries
- Support inbox admin page at `/admin/support` with status filtering, detail panel, assignment, and notes
- CRM dashboard summary cards with counts across tenant inquiries (P19), owner requests (P20), and support inquiries (P21)

### NOT In This Phase

- Tenant inquiry admin page (`/admin/tenant-inquiries`) -> **P19-E03**
- Owner request admin page (`/admin/owner-requests`) -> **P20-E03**
- Push notifications for support updates -> **V2**
- Email notifications for assignment/status changes -> **V2**
- SLA tracking, timer-based breach warnings, escalation matrix -> **V2**
- Public support inquiry submission form creation -> covered by **P15 Contact Hub**
