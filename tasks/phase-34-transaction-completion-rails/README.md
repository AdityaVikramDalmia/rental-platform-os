# Phase 34: Transaction Completion Rails (P34)

## Overview

Build end-to-end transaction rails from verification to move-in handover. This phase introduces transaction records, KYC packet handling, agreement generation and eSign, token/deposit tracking, and completion UX for tenant/admin operations.

## Dependencies

- P08 Closure must be done (transaction rails attach to and gate closure progression)
- P19 Tenant Inquiry Pipeline must be done (transaction initiation anchor)
- P20 Owner Services must be done (owner account lifecycle and contact operations)
- P30 Field Ops must be done (move-in checklist and OPS execution model are reused)
- P31 Owner Entity & RM Foundation must be done (owner linkage and accountable operations)
- P33 Trust & Verification Display is a soft dependency (improves trust UX but not required for transaction logic)

## Key Documentation

- `notes/features/26-transaction-completion-rails.md`
- `notes/features/19-rent-negotiation.md`
- `notes/features/20-deal-economics.md`
- `notes/04-state-machines.md`
- `notes/10-convex-schema.md`
- `notes/13-constants-reference.md`

## Epics

| ID      | Title                              | Tasks | Status  | Depends On                  | Priority |
| ------- | ---------------------------------- | ----- | ------- | --------------------------- | -------- |
| P34-E01 | Transaction Schema & State Machine | 4     | pending | []                          | Critical |
| P34-E02 | KYC & Verification Backend         | 5     | pending | [P34-E01]                   | Critical |
| P34-E03 | Agreement Generation & eSign       | 4     | pending | [P34-E01]                   | High     |
| P34-E04 | Token & Deposit Workflow           | 3     | pending | [P34-E01, P34-E02, P34-E03] | High     |
| P34-E05 | Move-In Handover & UI              | 4     | pending | [P34-E02, P34-E03, P34-E04] | High     |

## Dependency Graph

- `P34-E01 -> P34-E02`
- `P34-E01 -> P34-E03`
- `P34-E01 + P34-E02 + P34-E03 -> P34-E04`
- `P34-E02 + P34-E03 + P34-E04 -> P34-E05`

## Completion Criteria

- [ ] Transaction schema tables exist for transactions, agreements, KYC packets, token bookings, and deposits
- [ ] Transaction lifecycle/state machine rules are enforced in backend mutations
- [ ] KYC packet status can progress through verification flow with auditable outcomes
- [ ] Agreement templates auto-populate, generate PDF, and support eSign status tracking
- [ ] Token booking and deposit workflows handle receipts and refund-policy metadata
- [ ] Handover checklists table exists and gates transaction completion
- [ ] P34 tables registered in `AUDITED_TABLES` for audit trigger coverage
- [ ] Documentation updated: state machines, constants reference, schema docs
- [ ] Tenant and admin transaction dashboards support move-in handover completion

## File Tree

```text
phase-34-transaction-completion-rails/
  README.md
  P34-E01-transaction-schema-state-machine.md
  P34-E02-kyc-verification-backend.md
  P34-E03-agreement-generation-esign.md
  P34-E04-token-deposit-workflow.md
  P34-E05-move-in-handover-ui.md
```

## Scope Boundaries

- In scope: transaction data rails, KYC, agreement lifecycle, token/deposit tracking, handover UX
- Out of scope: escrow wallet products, automated legal advice, cross-country compliance packs
