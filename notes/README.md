# Rental Platform OS Documentation Index

> **What is this?** Product & technical documentation for the Rental Platform OS platform — a DemoRentals tool where society security guards submit vacant flat leads for bounties.

---

## Reading Order (Recommended)

### Start Here

| #   | File                                                  | What You'll Learn                                                                                                                                     |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00  | [Product Overview](00-product-overview.md)            | What Rental Platform OS is, personas, V1 scope, design principles                                                                                             |
| 01  | [Tech Stack](01-tech-stack.md)                        | Next.js + Convex + WorkOS + shadcn/ui, auth flows, project structure, Actions, HTTP Router, seed                                                      |
| 01A | [PWA Setup](01-tech-stack.md#progressive-web-app-pwa) | Tier 1 PWA architecture: Serwist setup, separate guard/admin manifests, offline fallback, webpack build constraint, preview workflow, icon generation |
| 13  | [Constants Reference](13-constants-reference.md)      | **Master reference** — all enums, permissions, audit actions, config keys, badge colors                                                               |

### Data & Architecture

| #   | File                                               | What You'll Learn                                                                               |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 02  | [Data Models](02-data-models.md)                   | Every entity, field, type, index. Global conventions (paise, Unix ms, soft delete)              |
| 10  | [Convex Schema](10-convex-schema.md)               | Actual Convex schema.ts — copy-paste ready. Packages, components, indexes, rate limiter, crons  |
| 11  | [Convex Architecture](11-convex-architecture.md)   | Mutation wrappers, auth helpers, Actions layer (WorkOS), HTTP Router, checkDuplicates, triggers |
| 03  | [Roles & Permissions](03-roles-and-permissions.md) | RBAC system, all permissions, default roles, guard permissions, bootstrap/seed process          |
| 04  | [State Machines](04-state-machines.md)             | Every status transition for leads, visits, listings, closures, payouts. Validation code         |

### UX & Flows

| #   | File                                     | What You'll Learn                                                                            |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| 05  | [Guard Portal UX](05-guard-portal-ux.md) | Mobile-first wireframes, login, lead submission, visits, earnings, profile, password change  |
| 06  | [Admin Panel UX](06-admin-panel-ux.md)   | Desktop wireframes, login, lead triage, verification, listing creation, ban dialog, settings |
| 07  | [Audit Trail](07-audit-trail.md)         | Trigger-based auto-logging, audit viewer, what gets logged                                   |
| 08  | [i18n](08-i18n.md)                       | English/Hindi/Hinglish, next-intl setup, translation keys, language selection                |

### Feature Specs (Implementation Detail)

| #   | File                                                      | What You'll Learn                                                                |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| F01 | [Society Registry](features/01-society-registry.md)       | Society + building CRUD, floor labels, flat number templates                     |
| F02 | [Guard Management](features/02-guard-management.md)       | Guard CRUD, shifts, ban flow with auto-flag, password management                 |
| F03 | [Lead Pipeline](features/03-lead-pipeline.md)             | Submission, de-dup, triage, notes_thread, admin actions                          |
| F04 | [Owner Verification](features/04-owner-verification.md)   | Call recording, consent capture, two-step duplicate flow                         |
| F05 | [Listings](features/05-listings.md)                       | Rich listings, photos, public page (SSR via httpRouter), inquiry (Server Action) |
| F06 | [Visit Management](features/06-visit-management.md)       | Scheduling, guard assignment, execution, society_id denormalization              |
| F07 | [Closure & Payouts](features/07-closure-and-payouts.md)   | Deal closure, document upload, payout lifecycle                                  |
| F08 | [Incentive System](features/08-incentive-system.md)       | Cards/badges, auto-award, manual award, thresholds                               |
| F09 | [Quality & Controls](features/09-quality-and-controls.md) | Rate limits, quality scoring, ban process, guard status effects                  |
| F10 | [Analytics](features/10-analytics.md)                     | Dashboards, @convex-dev/aggregate for all counters, snapshots                    |

### Feature Specs — Tenant & Owner (DemoRentals Rentals Merge)

| #   | File                                              | What You'll Learn                                                     |
| --- | ------------------------------------------------- | --------------------------------------------------------------------- |
| F11 | [Tenant Browse](features/11-tenant-browse.md)     | Listing directory, search, filters, sort, favorites, grid/list views  |
| F12 | [Property Detail](features/12-property-detail.md) | Gallery, amenities, commute, roommates, testimonials, contact sidebar |
| F13 | [Tenant Inquiry](features/13-tenant-inquiry.md)   | Inquiry submission, visit request, bounty system, guard acceptance    |
| F14 | [Owner Services](features/14-owner-services.md)   | Owner contact form, service request tracking, onboarding              |
| F15 | [Public Pages](features/15-public-pages.md)       | Homepage, how-it-works, contact hub, newsletter, footer               |
| F16 | [Tenant Tools](features/16-tenant-tools.md)       | Rent calculator, commute estimator, roommate quiz, rental checklist   |

### Feature Specs — Growth & Communication

| #   | File                                                | What You'll Learn                                                                                              |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| F17 | [Referral System](features/17-referral-system.md)   | Guard + DemoRentals referral programs, stacking bonuses, milestone payouts                                         |
| F18 | [Deal Room](features/18-deal-room.md)               | Owner invite lifecycle, AI term extraction, checklist approvals/sign-off, closure linkage, admin chat controls |
| F19 | [Rent Negotiation](features/19-rent-negotiation.md) | P26 - Rent negotiation (3-room brokering, terms, token, closure gate)                                          |

### Feature Specs — Economics & Operations

| #   | File                                                               | What You'll Learn                                                                          |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| F20 | [Deal Economics](features/20-deal-economics.md)                    | Per-deal P&L transparency, ops commission model, anti-gaming controls, config keys         |
| F21 | [Owner Entity & RM Foundation](features/21-owner-entity-and-rm.md) | Canonical owner identity, lifecycle stages, RM assignment model, owner/RM admin operations |

### Feature Specs — Incentive V3 Program

| #   | File                                                                          | What You'll Learn                                                                   |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F24 | [Incentive V3 Overview](features/24-incentive-v3-overview.md)                 | Master architecture, persona strategy, rollout migration, config model, build order |
| F25 | [Commission Engine](features/25-commission-engine.md)                         | Commission formula, modifier framework, optimization bounds, simulation details     |
| F26 | [Multi-Contributor Attribution](features/26-multi-contributor-attribution.md) | Contribution ledger, attribution algorithms, splits, disputes, override flows       |
| F27 | [OPS Gamification](features/27-ops-gamification.md)                           | XP/level system, weekly tiers, quests, progression loops, reward mechanics          |

### Feature Specs — Field Operations (Phase 30)

| #   | File                                                             | What You'll Learn                                                              |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| F30 | [OPS Portal](features/20-ops-portal.md)                          | OPS persona, mobile portal, field operations management                        |
| F31 | [Field Checklists](features/21-field-checklists.md)              | Template/instance model, inspection workflow, photo evidence, scoring          |
| F32 | [Incentive V2](features/22-incentive-v2.md)                      | Quality scoring, tiers, streaks, payout adjustments, leaderboards              |
| F33 | [OPS admin access & Google SSO](features/23-ops-admin-access.md) | OPS access to `/admin/*`, permission-filtered sidebar, two-tier OPS auth model |

## Feature Specs — Strategic Improvement Plan

> **Numbering note**: Feature filenames keep historical document IDs. Rent Negotiation is Phase 26 (`features/19-rent-negotiation.md`), while Transaction Completion Rails is Phase 34 (`features/26-transaction-completion-rails.md`).

| #   | File                                                                            | What You'll Learn                                                                                                           |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| F34 | [Strategic Improvement Plan](features/24-strategic-improvement-plan.md)         | Master roadmap: 7 strategic themes, 10 new phases, competitive analysis, unit economics                                     |
| F35 | [Trust & Verification Display](features/25-trust-verification-display.md)       | Listing trust badges, freshness SLA, badge computation, search ranking                                                      |
| F36 | [Transaction Completion Rails](features/26-transaction-completion-rails.md)     | P34 - Transaction completion rails (KYC, agreement, deposit, move-in)                                                       |
| F37 | [Notification Infrastructure](features/27-notification-infrastructure.md)       | Multi-channel notifications (push, WhatsApp, SMS), preferences, throttling                                                  |
| F38 | [Monetization Foundation](features/28-monetization-foundation.md)               | Transaction fees, Discovery Pass, promoted listings, partner services                                                       |
| F39 | [Post-Move-In Lifecycle](features/29-post-move-in-lifecycle.md)                 | Resident hub, rent tracking, maintenance ticketing, lease renewal, move-out                                                 |
| F40 | [Owner Portal & Dashboard](features/30-owner-portal-dashboard.md)               | Owner route group, property dashboard, financial view, maintenance, RM contact                                              |
| F41 | [Tenant Trust Score & Reviews](features/31-tenant-trust-score-reviews.md)       | Composite trust score (0-100), multi-directional reviews, moderation                                                        |
| F42 | [AI Intelligence Spine](features/32-ai-intelligence-spine.md)                   | Fair rent calculator, lead scoring, fraud detection, photo quality, vacancy heartbeat                                       |
| F43 | [Supply Channel Diversification](features/33-supply-channel-diversification.md) | Owner self-list, secretary channel, resident referrals, corporate relocation                                                |
| F44 | [Financial Products & Insurance](features/34-financial-products-insurance.md)   | Rent Shield, Deposit Lite, deposit financing, rent credit reporting                                                         |
| F45 | [Tenant Portal](features/35-tenant-portal.md)                                   | `/tenant/*` portal shell, dashboard, inquiries, favorites, messages, profile                                                |
| F46 | [OPS Superset Expansion](features/35-ops-superset-expansion.md)                 | OPS does everything Guard can; auth helpers, profile backfill, feature flag rollout                                         |
| F47 | [Multi-Persona Identity Model](features/36-multi-persona-identity.md)           | P45 - Multi-persona identity: array user_types, active_persona routing, persona picker/switcher                             |
| F48 | [CEO Ops Command Center](features/37-ceo-ops-command-center.md)                 | P46 (implemented) - Two-tier CEO/OpsHead command center with KPI targets, warning escalation, and weekly check-in workflows |

### Feature Specs — Voice & Accessibility (Phase 48)

| #   | File                                                      | What You'll Learn                                                                                             |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| F49 | [Voice-to-Text Notes](features/39-voice-to-text-notes.md) | P48 - Whisper transcription via Convex Action, multi-recording, permanent audio audit trail, guard/OPS mobile |

### Reference

| #   | File                                                                      | What You'll Learn                                                                                                                                             |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 09  | [V2 Backlog](09-v2-backlog.md)                                            | V2 items — some pulled to V1 per DemoRentals merge (see strikethrough items)                                                                                      |
| 12  | [Decisions Log](12-decisions-log.md)                                      | Key decisions with rationale (D1-D32 original, D33-D40 DemoRentals merge, D41-D44 PWA, D45-D49 Rent Negotiation, D50-D55 Field Ops) |
| 12A | [PWA Decisions](12-decisions-log.md#progressive-web-app-pwa)              | PWA architecture decisions (D41-D44: Serwist, separate manifests, Tier 1 scope, zero-dep icon generation)                                                     |
| 12B | [P32 Adversarial Validation Report](p32-adversarial-validation-report.md) | Third-pass adversarial audit findings, coverage, and follow-up recommendations                                                                                |
