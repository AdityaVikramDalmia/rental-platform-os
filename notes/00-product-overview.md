# Rental Platform OS - Product Overview

## What Is This

Rental Platform OS is a web platform for DemoRentals (a real estate brokerage operating in India). The platform serves two sides of the rental market:

- **Supply (Rental Platform OS domain)**: Society security guards submit vacant flat leads and coordinate tenant visits — in exchange for a bounty per successful deal closure. DemoRentals's ops team verifies, lists, schedules, closes, and pays.
- **Demand (DemoRentals domain)**: Prospective tenants browse listings, request visits, and use interactive tools to make rental decisions. Property owners express interest in property management via a contact funnel.

Both sides live in a single codebase (`rental-platform-os/`). Guard relations and the vacancy lead pipeline are the Rental Platform OS domain. Tenant relations, owner relations, and public-facing pages are the DemoRentals domain.

Guards are not DemoRentals employees. They are security guards employed by residential housing societies. They observe vacancies as part of their daily work and report them through this platform. DemoRentals's ops team takes the lead from there: verifying with owners, creating listings, scheduling visits, closing deals, and paying the guard.

## The Business Problem

In Indian residential societies (apartment complexes), information about vacant flats is fragmented. Owners don't always list vacancies proactively. Brokers have to physically canvass buildings or rely on word-of-mouth. Security guards are the single best source of real-time vacancy data — they see move-outs, interact with owners, and know the building inside out.

Rental Platform OS turns every society guard into a paid lead source for DemoRentals.

## Core Value Loop

```
Guard spots vacancy
    → Submits lead via platform (earns prospective bounty visibility)
    → DemoRentals ops verifies with owner (call)
    → Ops creates rich listing (photos, rent, details)
    → Ops schedules visit (assigns guard to coordinate on-site)
    → Visit completes with INTERESTED outcome
    → Ops initiates rent negotiation (mediated via 3 private/combined chat rooms)
    → Terms agreed, token collected, documentation complete
    → Tenant moves in (deal closure)
    → Guard gets paid (bounty)
```

After a visit with an `INTERESTED` outcome, ops initiates rent negotiation — a mediated process using three private and combined chat rooms to agree on deal terms (rent, deposit, brokerage, lock-in, move-in date). Both parties sign off on a structured terms proposal. Token advance is collected. A mandatory 10-item documentation checklist gates closure. See [Rent Negotiation](features/19-rent-negotiation.md) for the full workflow.

## Non-Negotiable Guard Rules

Guards NEVER:

- Negotiate rent with tenants or owners
- Collect any money from anyone
- Handle pricing or agreements
- Act as brokers

These rules are enforced via a **permanent sticky banner** on the guard portal. Guards are information providers and on-site coordinators only.

## V1 Scope

### What V1 IS

- **Web-only platform** (no native app, installable as PWA for guard and admin portals)
- Single Next.js application with role-based routing
- **Guard portal**: mobile-first responsive web (guards use cheap Android phones + mobile browser)
- **OPS portal**: mobile-first responsive web for field operations agents (`(ops)/` route group)
- **Admin panel**: desktop-optimized web with hybrid CRM patterns
- **Tenant-facing pages**: public homepage, how-it-works (with interactive tools), contact hub, listing directory, property detail pages, visit request forms
- **Owner services**: public contact/lead capture form for property management inquiries
- **Public pages**: homepage, how-it-works, contact hub, newsletter signup
- **Two lead pipelines**: guard vacancy leads (existing) + tenant inquiry pipeline (new)
- **Guard visit bounty system**: tenant visit requests posted as bounties for guards
- Three languages: English, Hindi, Hinglish (guard portal only)
- WhatsApp manual deep links (`wa.me/...`) for click-to-chat
- Standalone — no integrations with external systems
- **Referral system**: Two programs — Rental Platform OS (guard-to-guard) + DemoRentals (tenant/owner), stacking bonuses, two-tiered milestones, admin-configurable amounts
  - **Deal communication room**: AI-mediated tenant-owner chat (Mastra + OpenAI), PII masking, deal term checklists with formal sign-off, admin master control
  - **Rent negotiation**: Ops-mediated deal brokering via 3-room architecture (OPS_TENANT, OPS_OWNER, COMBINED channels), structured terms proposals with versioning and per-party sign-off, token advance collection with refund policy tracking, brokerage recording, mandatory 10-item post-agreement checklist gating closure. See [Rent Negotiation](features/19-rent-negotiation.md).
- **Field Ops Platform (Phase 30)**:
  - **OPS persona**: dedicated `(ops)/` portal with phone+password auth (`{phone}@ops.local`), mobile-first, `requireOps()` auth helper
  - **Field Checklist Engine**: configurable inspection checklists (`checklist_templates` + `checklist_instances`), 3 depth levels (LIGHT/MEDIUM/FULL), photo evidence with GPS metadata, condition ratings (EXCELLENT/GOOD/FAIR/POOR/NA), admin review workflow
  - **Incentive Model v2**: quality scoring (0-100, 5 weighted components), quality tiers (BRONZE/SILVER/GOLD/PLATINUM), streak tracking (4 types), bounty multipliers (1.0x-2.0x), penalty deductions, leaderboards. See [Incentive v2](features/22-incentive-v2.md).
  - **Document Collection**: `document_requirements` + `regulatory_items` tables, document tracking lifecycle (PENDING/COLLECTED/VERIFIED/REJECTED), society liaison workflows for police verification, rent registration, society NOC, stamp duty. See [Field Checklists](features/21-field-checklists.md).

### What V1 IS NOT

- No native Android/iOS app (V2)
- No push notifications (V2)
- No GPS geofencing (V2)
- No key custody module (OUT — liability risk)
- No WhatsApp Business API / bot automation (V2 — manual deep links ARE V1)
- No bulk CSV import (V2)
- No external platform integrations
- No tenant account lifecycle portal (status tracking, saved-search notifications — V2)
- No owner service plan comparison / ROI calculator (V2)
- No auto-scheduling optimization for visits (V2)

## Personas

### 1. Guard (Mobile Web)

**Who**: Security guards employed by residential housing societies. Not tech-savvy. Use cheap Android phones. May not read English well — need Hindi/Hinglish support.

**What they do**:

- Submit vacant flat leads (building, floor, flat, owner phone, availability)
- View their lead statuses and respond to admin info requests
- Execute assigned visits (start/complete, record outcomes)
- View their earnings (prospective bounties, paid history)

**Constraints**:

- Cannot negotiate rent or collect money
- Rate-limited to 5 leads/day (configurable)
- Can be set INACTIVE or BANNED by admin (manual)
- Can submit leads for ANY building in their society
- One society at a time (can be re-assigned if they change jobs)

### 2. OPS Agent (OPS Portal + Admin Panel - Mobile-First)

**Who**: DemoRentals internal field operations team. Handle day-to-day operations and on-site field work. Distinct from Super Admin — OPS Agents have a dedicated `(ops)/` portal (mobile-first) in addition to access to the shared admin panel.

**Auth**: Phone + password using synthetic email `{phone}@ops.local`, or Google SSO when account is created with a Google email. See [OPS Admin Access](features/23-ops-admin-access.md).

**What they do**:

- Review and triage incoming leads
- Call owners for verification and consent
- Create rich listings from verified leads
- Schedule and assign visits
- Process deal closures with documentation
- Set prospective bounties on leads
- Execute field checklists during visits (via OPS portal) — LIGHT/MEDIUM/FULL depth inspections with photo evidence and condition ratings
- Collect and verify tenant/owner documents (owner docs, tenant docs, society docs)
- Track regulatory compliance items (police verification, rent registration, society NOC, stamp duty)
- View quality scores, streaks, and leaderboards for guards

**Permissions**: Controlled by RBAC. Typically can manage leads, verification, listings, visits. May or may not have payout/closure authority. OPS users share the same `requirePermission()` gate as ADMIN users — zero mutation duplication.

See [OPS Portal](features/20-ops-portal.md) for the full OPS portal spec.

### 3. Super Admin (Admin Panel - Desktop)

**Who**: DemoRentals founders/senior ops. Full platform control.

**What they do**:

- Everything an Ops Agent does
- Manage societies, buildings, guards
- Create/manage admin accounts and roles
- Configure system settings (rate limits, etc.)
- Approve payouts
- View analytics and reporting
- Manage RBAC permissions

### 4. Prospective Tenant (Public Web + Tenant Portal)

**Who**: People looking to rent a flat in DemoRentals-managed societies. Range from tech professionals to families. Use mobile and desktop browsers.

**What they do**:

- Browse the listing directory (search, filter by locality/price/BHK/amenities, sort, grid/list views)
- View rich property detail pages (gallery, amenities, commute calculator, roommate profiles, testimonials)
- Use interactive tools: rent calculator, commute estimator, roommate quiz, rental checklist tracker
- Submit visit requests on listings they're interested in
- Save favorite listings (requires sign-in)
- Contact DemoRentals via WhatsApp deep links, phone, email, or contact form

**Auth**: Google Sign-In via WorkOS AuthKit. Optional for browsing; required for submitting visit requests and saving favorites.

**Constraints**:

- Cannot directly schedule visits — visit requests go to ops for review
- No account lifecycle portal in V1 (status tracking, notifications = V2)

### 5. Property Owner (Public Web)

**Who**: Flat owners interested in DemoRentals's property management services. Submit a contact form to express interest. Ops team follows up.

**What they do**:

- View the owner services page (V1: contact form only)
- Submit a contact/lead capture form with property details
- After onboarding by ops: can check property status via authenticated portal (minimal V1)

**Auth**: Google Sign-In via WorkOS AuthKit — account created by ops during onboarding. No self-service registration.

**Constraints**:

- V1 is a lead capture funnel only — no service plan comparison, ROI calculator, or case studies (V2)
- Owner portal is minimal post-onboarding; full owner dashboard is V2

### 6. (Future - V2) Finance Role

Dedicated role for payout approvals, commission tracking, brokerage accounting.

## Domain Split

| Domain         | Owns                                                                                                                                                                                                                  | Route Groups                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Rental Platform OS** | Guard relations, guard lead pipeline (vacancy supply), scheduling system, guard portal, guard incentives/payouts, OPS field operations (checklists, document collection, regulatory compliance), OPS agent management | `(guard)/`, `(admin)/`, `(ops)/` |
| **DemoRentals**    | Tenant relations (demand/inquiry), owner relations, public-facing pages (homepage, how-it-works, contact hub), listing browse experience                                                                              | `(tenant)/`, `(public)/`         |

Both domains share the same codebase, database, auth system, and admin panel. The admin panel provides separate views for guard leads and tenant inquiries.

## Implementation Priority (V1)

1. Auth (WorkOS) + Guard profile + Admin accounts + RBAC skeleton
2. Society registry (societies + buildings)
3. Guard management (CRUD, types, shifts)
4. Lead submission + lead queue + de-dup flagging
5. Owner verification module + lead status transitions
6. Listings module (rich listing creation, photo upload, shareable links)
7. Visit scheduling + guard assignment + visit execution
8. Closure module (document upload, brokerage tracking)
9. Payout management + guard earnings view
10. Incentive system (cards/badges)
11. Quality scoring + rate limits + ban controls
12. Analytics dashboards
13. Audit trail
14. i18n (Hindi + Hinglish)
15. Public pages (homepage, how-it-works, contact hub, newsletter)
16. Tenant listing browse (directory, search/filter/sort, property cards, favorites)
17. Property detail pages (gallery, amenities, commute, roommates, testimonials)
18. Tenant tools (rent calculator, commute estimator, roommate quiz, checklist)
19. Tenant inquiry pipeline (inquiry submission, visit request, bounty posting, guard acceptance)
20. Owner services (contact form, service request tracking)
21. Admin tenant management (tenant inquiry tab, bounty management, support queue)
22. Referral system (guard-to-guard + DemoRentals tenant/owner referrals, milestone bonuses)
23. Deal communication room + Rent negotiation (AI-masked chat, 3-room architecture, structured terms proposals, token advance, mandatory documentation checklist gating closure)
24. OPS portal (mobile-first, phone+password auth, `(ops)/` route group)
25. Field Checklist Engine (configurable templates, LIGHT/MEDIUM/FULL depth, photo evidence, condition ratings, admin review)
26. Incentive Model v2 (quality scoring, tiers, streaks, bounty multipliers, penalties, leaderboards)
27. Document Collection (owner/tenant/society docs, regulatory compliance items)

## Key Design Principles

1. **Transparency over trust**: Document everything. Indian real estate is scam-prone. Every interaction, consent, and agreement should be recorded. The platform ensures DemoRentals is never liable for disputes between owners and tenants.

2. **Admin control over automation**: Ops team has final say on everything — payouts, verification, visit assignments, guard status. System provides soft suggestions (shift conflicts, de-dup flags) but never hard-blocks admin decisions.

3. **Guard simplicity**: The guard portal must be dead simple. Mobile-first. Minimal text input. Big buttons. Hindi/Hinglish support. Guards are not tech-savvy.

4. **Ops efficiency**: The admin panel is an operations tool. Speed matters — quick filters, keyboard shortcuts, one-click actions. Tables and forms, not flashy dashboards (though analytics exist separately).

5. **Accountability**: Full audit trail. Every state change tracked. Every admin action logged. When disputes arise, the platform provides the receipts.
