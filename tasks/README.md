# Rental Platform OS Task System

> Ordered, executable task specs for building the platform phase by phase.

## How This System Works

### Hierarchy

| Level     | What                          | Granularity                   | ID Format                 |
| --------- | ----------------------------- | ----------------------------- | ------------------------- |
| **Phase** | Implementation priority group | Maps to product roadmap       | `P01`, `P02`, ...         |
| **Epic**  | Major feature within a phase  | 1 file, 3-8 tasks inside      | `P01-E01`, `P01-E02`, ... |
| **Task**  | Atomic unit an agent executes | 1 H2 section within epic file | `P01-E01-T01`, ...        |

**IDs are stable.** They NEVER change. Filenames CAN change. `depends_on` always references IDs, not filenames.

### Directory Structure

```
tasks/
  README.md                          # This file (master roadmap)
  phase-01-auth/
    README.md                        # Phase overview + epic list + status
    P01-E01-project-scaffolding.md   # 6 tasks: Next.js init, deps, Convex, shadcn, utils, lint
    P01-E02-schema-and-infra.md      # 5 tasks: schema, config, functions.ts, triggers, tests
    P01-E03-workos-auth-config.md    # 5 tasks: auth.config, auth.ts, http.ts, provider, layout
    P01-E04-guard-login.md           # 6 tasks: login UI, server action, password change, tests
    P01-E05-admin-login.md           # 4 tasks: SSO page, callback, dashboard, tests
    P01-E06-auth-helpers-route-protection.md  # 5 tasks: helpers, middleware, layouts, tests
    P01-E07-rbac-system.md           # 5 tasks: role CRUD, users, role UI, assignment, tests
    P01-E08-seed-and-config.md       # 4 tasks: seed, config CRUD, settings page, tests
  phase-02-society-registry/
    README.md
    P02-E01-society-crud.md
    P02-E02-building-crud.md
  ...
```

### Status Values

| Status        | Where Used       | Meaning                                             |
| ------------- | ---------------- | --------------------------------------------------- |
| `pending`     | Epic frontmatter | Not started                                         |
| `in_progress` | Epic frontmatter | At least one task being worked on                   |
| `done`        | Epic frontmatter | ALL task checkboxes checked AND verification passes |
| `blocked`     | Epic frontmatter | Waiting on a dependency                             |

**Epic status derivation rule:**

- All tasks unchecked → `pending`
- Any task checked, not all → `in_progress`
- All tasks checked + verification passed → `done`
- A `depends_on` is not `done` → `blocked`

**Task completion** is tracked via checkboxes (`- [x]`) in the Task Queue at the top of each epic file.

### Execution Workflow

When an agent picks up work:

1. Read `tasks/README.md` → identify current phase
2. Read `phase-XX/README.md` → find next `pending` or `in_progress` epic
3. Verify all `depends_on` in epic frontmatter are `done`
4. Read the epic file top-to-bottom
5. Load `skills` listed in frontmatter via `load_skills=[...]`
6. For each unchecked task (top-to-bottom order):
   a. Read the task's **Required Reading**
   b. Follow the **Key Rules**
   c. Implement the **Deliverables**
   d. Run the **Verification** (lsp_diagnostics, build, tests)
   e. Check the task's checkbox in the Task Queue
7. When ALL tasks checked: update epic frontmatter → `status: done`, `updated_at: <today>`

### Epic File Format

````markdown
---
id: P01-E01
title: WorkOS Configuration
phase: 1
status: pending
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules"]
updated_at: 2026-02-16
---

# P01-E01: WorkOS Configuration

## Overview

[1-2 sentences: what this epic delivers end-to-end]

## Task Queue

- [ ] P01-E01-T01: Create auth.config.ts
- [ ] P01-E01-T02: Create auth.helpers.ts
- [ ] P01-E01-T03: Set up ESLint import restriction

---

## T01: Create auth.config.ts

### Objective

[What "done" looks like in 1-2 sentences]

### Required Reading

- `notes/01-tech-stack.md` — "Authentication Architecture" section
- `notes/11-convex-architecture.md` — "Auth Helper Layer" section

### Key Rules

1. [Rule extracted from docs]
2. [Rule extracted from docs]

### Deliverables

- [ ] `convex/auth.config.ts` — [what it contains]

### Acceptance Criteria

1. [Testable condition]
2. [Testable condition]

### Verification

```bash
# Commands to verify this task
npx tsc --noEmit
```
````

### Out of Scope

- [What this task does NOT include]

---

## T02: Create auth.helpers.ts

...

```

### Sizing Rules

- **3-8 tasks per epic.** If an epic has more than 8 tasks, split it into two epics.
- **One agent session per epic.** Each epic should be completable in a single agent session.
- **Tasks are ordered.** Execute top-to-bottom. Later tasks may depend on earlier ones within the same epic.

---

## Phase Roadmap

All 47 implementation phases. Phases 1-14 cover the guard pipeline. Phases 15-21 cover tenant/owner/public features. Phases 22-23 cover cross-cutting growth and communication features. Phases 24-26 cover deal communication and rent negotiation (split from original Phase 23). Phase 27 covers admin panel polish and completeness (added Feb 2026 after comprehensive audit, now done). Phases 28-29 cover admin power tools and ops intelligence (added Feb 2026 after comprehensive research across Vercel/Linear/Stripe patterns, shadcn/ui components, and property management competitors). Phase 30 covers the field ops platform - OPS persona, configurable checklists, document collection, and incentive model v2 (added Feb 2026). Phase 31 adds owner entity + relationship-manager foundation and is a sequencing exception that must execute before Phase 20's owner-service rollout. Phase 32 extends incentives into a multi-persona commission and gamification program with shadow-mode migration from v2. Phases 33-42 cover the strategic improvement plan (trust, transactions, notifications, monetization, post-move-in, owner portal, tenant trust, AI, supply channels, financial products). Phases 43-45 cover tenant portal, OPS superset expansion, and multi-persona identity. Phase 46 is complete and delivers the CEO Ops Command Center. Phase 48 adds voice-to-text notes. Detailed task files are created in batches (3-4 phases at a time). High-level boundaries listed here so scope is never lost.

### Completed Outside Phase System

The following work was completed outside the phase system (ad-hoc user requests):

| Work Item | Status | When | Details |
|-----------|--------|------|---------|
| PWA Tier 1 | **Done** | 2026-02-17 | Separate installable PWAs for guard/admin portals. Serwist service worker, offline fallback page, placeholder icons, webpack-based production build (`next build --webpack`), and local production preview (`npm run preview`). See [01-tech-stack.md PWA section](../notes/01-tech-stack.md#progressive-web-app-pwa) and [Decisions D41-D44](../notes/12-decisions-log.md#progressive-web-app-pwa). |

---

### Phase 1: Auth + Accounts + RBAC `(P01)`

**Scope**: WorkOS JWT config (two providers: SSO + email+password), guard login flow (phone+password via synthetic email), admin login flow (Google SSO with auto-create), auth helpers (requireGuard, requireAdmin, requirePermission), route protection middleware, password change gate, RBAC tables + seed script (Super Admin + Ops Agent roles), system_config defaults.

**Delivers**: Both guard and admin can log in. Permission system works. First super admin bootstrapped via seed.

**Depends on**: Nothing (first phase).

**Key docs**: [01-tech-stack.md](../notes/01-tech-stack.md), [03-roles-and-permissions.md](../notes/03-roles-and-permissions.md), [11-convex-architecture.md](../notes/11-convex-architecture.md)

---

### Phase 2: Society Registry `(P02)`

**Scope**: Society CRUD (create with name+city, status lifecycle ONBOARDING→ACTIVE→INACTIVE), building CRUD (name, floors, floor_labels with named floors, flat_number_template), society search index, building soft delete.

**Delivers**: Admin can create and manage societies and buildings. Buildings have floor labels and flat number templates for validation.

**Depends on**: P01 (needs auth + RBAC for admin functions).

**Boundary — NOT in this phase**: Guard assignment to societies (that's P03). Lead submission forms using buildings (that's P04).

**Key docs**: [features/01-society-registry.md](../notes/features/01-society-registry.md), [02-data-models.md](../notes/02-data-models.md) sections A-B

---

### Phase 3: Guard Management `(P03)`

**Scope**: Guard creation via WorkOS Action (createGuardAccount → synthetic email + temp password), guard profile CRUD, guard types (BUILDING_SPECIFIC, MAIN_GATE, PARK, ROVING), shift scheduling (RECURRING + OVERRIDE), guard status management (ACTIVE/INACTIVE/BANNED with WorkOS suspension), password reset via Action, guard profile page (guard-facing).

**Delivers**: Admin can create guard accounts, manage shifts. Guards can log in, see profile, change password.

**Depends on**: P01 (auth), P02 (guards belong to societies).

**Boundary — NOT in this phase**: Lead submission (P04). Visit assignment (P07). Quality scoring/ban controls (P11).

**Key docs**: [features/02-guard-management.md](../notes/features/02-guard-management.md), [04-state-machines.md](../notes/04-state-machines.md) guard status section

---

### Phase 4: Lead Pipeline `(P04)`

**Scope**: Lead submission form (guard-facing, mobile-first), rate limiting (5/day via @convex-dev/rate-limiter), de-duplication (same flat 90d + same phone 30d → POTENTIAL_DUPLICATE), searchable_text computation, lead queue (admin-facing with filters/search/pagination), NEED_INFO flow with notes_thread (admin requests info → guard replies → resubmit), lead rejection.

**Delivers**: Guards submit leads. Admin sees queue with real-time updates. De-dup auto-flags. NEED_INFO round-trip works.

**Depends on**: P01 (auth), P02 (societies/buildings for form dropdowns), P03 (guards submit leads).

**Boundary — NOT in this phase**: Owner verification (P05). Listing creation (P06). Prospective bounty display (set in P05).

**Key docs**: [features/03-lead-pipeline.md](../notes/features/03-lead-pipeline.md), [04-state-machines.md](../notes/04-state-machines.md) lead status section, [11-convex-architecture.md](../notes/11-convex-architecture.md) de-dup logic

---

### Phase 5: Owner Verification `(P05)`

**Scope**: Verification form (call outcome, consent capture, visit slots, rent confirmation), multiple verification attempts per lead, lead status transitions (SUBMITTED→VERIFIED/REJECTED), two-step duplicate flow (POTENTIAL_DUPLICATE→SUBMITTED→VERIFIED), prospective bounty setting, lead rejection cascade (auto-archive linked listing).

**Delivers**: Admin verifies leads via owner calls. Verified leads ready for listings. Duplicate leads resolved.

**Depends on**: P04 (leads exist to verify).

**Boundary — NOT in this phase**: Listing creation from verified leads (P06). Visit scheduling (P07).

**Key docs**: [features/04-owner-verification.md](../notes/features/04-owner-verification.md), [04-state-machines.md](../notes/04-state-machines.md) lead status section

---

### Phase 6: Listings `(P06)`

**Scope**: Listing creation from verified leads (admin-facing), photo upload (max 10, listing_photos table with display_order, client-side resize to ~1MB), slug generation (building-flat-society-bhk format), listing status lifecycle (DRAFT→PUBLISHED→ARCHIVED), public listing page (SSR via HTTP Router endpoint), WhatsApp button, contact form with rate limiting (5/hour/IP via Server Action), SEO meta tags.

**Delivers**: Rich shareable listing pages with photos. Public URL works. Contact form captures inquiries.

**Depends on**: P05 (only verified leads get listings).

**Boundary — NOT in this phase**: Visit scheduling from listings (P07). Closure (P08). Slug collision handling (append -2 if exists).

**Key docs**: [features/05-listings.md](../notes/features/05-listings.md), [11-convex-architecture.md](../notes/11-convex-architecture.md) HTTP Router + file upload sections

---

### Phase 7: Visit Management `(P07)`

**Scope**: Visit scheduling (admin-facing), guard assignment with shift-aware suggestions (soft warnings only, not hard blocks), visit board admin UI, visit execution (guard-facing: ASSIGNED→IN_PROGRESS→COMPLETED with outcome), society_id denormalization on visits, needs_reassignment flag (set when guard banned/deactivated), visit cancellation, no-show marking.

**Delivers**: Full visit lifecycle from scheduling to completion with outcomes.

**Depends on**: P03 (guards for assignment), P05 (verified leads), P06 (optional listing link).

**Boundary — NOT in this phase**: Closure from visits (P08). Guard quality metrics from visit data (P11).

**Key docs**: [features/06-visit-management.md](../notes/features/06-visit-management.md), [04-state-machines.md](../notes/04-state-machines.md) visit status section

---

### Phase 8: Closure `(P08)`

**Scope**: Closure creation (admin-facing), document upload (rent agreement + additional docs via Convex file storage), brokerage tracking (tenant-side + owner-side), demorentals_deal_id reference, two-step confirmation (PENDING→CONFIRMED), cancellation with payout cascade (void INITIATED payouts).

**Delivers**: Deal closure recording with full documentation and brokerage breakdown.

**Depends on**: P05 (verified leads), P07 (visits provide deal context).

**Boundary — NOT in this phase**: Payout creation (P09). Financial analytics (P12).

**Key docs**: [features/07-closure-and-payouts.md](../notes/features/07-closure-and-payouts.md) closure section, [04-state-machines.md](../notes/04-state-machines.md) closure status section

---

### Phase 9: Payouts `(P09)`

**Scope**: Payout initiation (linked to confirmed closure), approval workflow (INITIATED→APPROVED→PAID), manual amount setting by admin, guard earnings view (guard-facing), payout method (CASH/UPI/BANK_TRANSFER), receipt notes.

**Delivers**: Full payout lifecycle. Guards see their earnings history.

**Depends on**: P08 (payouts linked to confirmed closures).

**Boundary — NOT in this phase**: Incentive system (P10). Financial analytics (P12).

**Key docs**: [features/07-closure-and-payouts.md](../notes/features/07-closure-and-payouts.md) payout section, [04-state-machines.md](../notes/04-state-machines.md) payout status section

---

### Phase 10: Incentive System `(P10)`

**Status**: Done (completed Feb 2026).

**Scope**: Card types (LEAD_SUBMITTER, VISIT_HANDLER, QUALITY_CHAMPION, CUSTOM), levels (BRONZE→PLATINUM), auto-award suggestions based on configurable thresholds, admin confirmation of auto-awards, manual award/revocation, guard badge display on profile.

**Delivers**: Guards earn and display performance badges. Admin manages award lifecycle.

**Depends on**: P04 (lead counts for LEAD_SUBMITTER), P07 (visit counts for VISIT_HANDLER).

**Boundary — NOT in this phase**: Quality scoring formula (P11). Analytics display of incentive data (P12).

**Key docs**: [features/08-incentive-system.md](../notes/features/08-incentive-system.md), [13-constants-reference.md](../notes/13-constants-reference.md) incentive sections

---

### Phase 11: Quality & Controls `(P11)`

**Status**: Done (completed Feb 2026).

**Scope**: Quality metrics per guard (verified rate, rejection rate, response time), rate limiting enforcement details, ban process with WorkOS suspension, guard status effects matrix (ACTIVE/INACTIVE/BANNED capabilities), rule banner implementation (48px sticky amber bar, non-dismissable), browser fingerprint tracking on login, quality flags on leads (GUARD_HIGH_REJECTION).

**Delivers**: Admin has full control over guard quality. Platform integrity enforced. Rule banner visible on every guard page.

**Depends on**: P03 (guard management), P04 (leads for quality metrics).

**Boundary — NOT in this phase**: Analytics dashboard for quality data (P12). OFF_SHIFT_SUBMISSION flag (V2 — requires GPS).

**Key docs**: [features/09-quality-and-controls.md](../notes/features/09-quality-and-controls.md)

---

### Phase 12: Analytics `(P12)`

**Status**: Done (completed Feb 2026).

**Scope**: Dashboard sections (overview KPIs, society comparison, guard leaderboard, financial summary, operational funnel), @convex-dev/aggregate for all counters, cron-based daily snapshots, chart library (Recharts or Tremor), real-time reactive queries.

**Delivers**: Admin analytics dashboard with real-time data and historical trends.

**Depends on**: P04-P09 (needs data from full pipeline to be meaningful).

**Boundary — NOT in this phase**: Export to CSV/Excel (V2). Per-society scoped dashboards (V2).

**Key docs**: [features/10-analytics.md](../notes/features/10-analytics.md), [10-convex-schema.md](../notes/10-convex-schema.md) analytics_snapshots + crons sections

---

### Phase 13: Audit Trail `(P13)`

**Status**: Done (completed Feb 2026).

**Scope**: Audit log viewer UI (/admin/audit), table view (time, actor, action, entity, changes), filters (actor, action type, entity type, entity ID, date range), expandable change diff view, pagination.

**Delivers**: Admin can view full audit history of all platform actions with filters.

**Depends on**: P01 (audit triggers already set up in functions.ts — this phase builds the VIEWER UI only).

**Boundary — NOT in this phase**: Audit log archival (V2). Audit data export (V2).

**Key docs**: [07-audit-trail.md](../notes/07-audit-trail.md)

---

### Phase 14: i18n `(P14)`

**Status**: Done (completed Feb 2026).

**Scope**: next-intl setup with App Router, translation files (en.json, hi.json, hinglish.json), language selector component (guard portal), persistent language preference (guard_profile + localStorage), all guard portal strings translated, number/date formatting per locale.

**Delivers**: Guard portal works fully in Hindi and Hinglish. Language persists across sessions.

**Depends on**: P01-P07 (guard-facing features that need translation — must exist before translating).

**Boundary — NOT in this phase**: Admin panel translation (English only, per spec). Dynamic content translation (V2).

**Key docs**: [08-i18n.md](../notes/08-i18n.md)

---

### Phase 15: Public Pages `(P15)`

**Status**: Done (completed Feb 2026).

**Scope**: Homepage (hero section, trust signals, CTA), How-It-Works page (rental process timeline, FAQ accordion), Contact Hub (contact form persisted to `support_inquiries`, FAQ, office info, newsletter signup persisted to `newsletter_subscriptions`), global footer with WhatsApp deep link (`wa.me`). UI built with shadcn/ui components.

**Delivers**: Public homepage, how-it-works, and contact hub pages live. Contact form and newsletter submissions persist to Convex for admin follow-up.

**Depends on**: P01 (auth for form submission persistence via Convex mutations).

**Boundary — NOT in this phase**: Listings browse (P16). Tenant inquiry form (P19). Owner services page (P20).

**Key docs**: [features/15-public-pages.md](../notes/features/15-public-pages.md)

---

### Phase 16: Tenant Browse `(P16)`

**Status**: Done (completed Feb 2026).

**Scope**: Listings directory route (`/listings`), search bar with text query, filter sidebar (locality, BHK, price range, furnishing, availability), sort dropdown (price, newest, area), grid/list view toggle, property cards (grid + list variants) with WhatsApp deep link + favorite toggle, URL-driven filter state for shareable links, pagination. UI built with shadcn/ui components.

**Delivers**: Tenants can browse, search, filter, sort, and paginate all published listings. Favorites persist in localStorage (V1).

**Depends on**: P01 (auth), P06 (published listings must exist to browse).

**Boundary — NOT in this phase**: Property detail page (P17). Tenant inquiry form (P19). Saved searches/notifications (V2).

**Key docs**: [features/11-tenant-browse.md](../notes/features/11-tenant-browse.md)

---

### Phase 17: Property Detail `(P17)`

**Status**: Done (completed Feb 2026).

**Scope**: Property detail page route (`/listing/[slug]`), photo gallery (thumbnail nav + fullscreen), overview/pricing block (rent, deposit, move-in cost summary), amenities section (available/unavailable split), house rules display, commute calculator (distance/time from `listing_commute_landmarks`), location map, roommate info section (from `listing_roommate_profiles`), tenant testimonials block, similar listings strip, and sticky contact sidebar with WhatsApp deep link. SSR for SEO. UI built with shadcn/ui components.

**Delivers**: Full property detail page with all sections rendering. SEO meta tags present.

**Depends on**: P16 (browse page links to detail via property cards).

**Boundary — NOT in this phase**: Tenant inquiry form on detail page (P19). Tenant tools embedded in page (P18).

**Key docs**: [features/12-property-detail.md](../notes/features/12-property-detail.md)

---

### Phase 18: Tenant Tools `(P18)`

**Status**: Done (completed Feb 2026).

**Scope**: Rent calculator (4 sliders → move-in cost breakdown, client-side), generic commute estimator Version A (area-to-area static lookup for 8-10 Bangalore areas, 5 transport modes, client-side), roommate compatibility quiz (5-question personality quiz → 4 types, CSS transitions, client-side), rental checklist tracker (20 items in 5 categories, localStorage persistence, CSV export, Share API). All tools on a dedicated Tools Hub page at `/tools` under `(public)` route group. UI built with shadcn/ui components.

**Delivers**: All 4 tenant tools functional on `/tools` page with tabbed interface. All client-side only — no Convex backend. Checklist persists in localStorage.

**Depends on**: P15-E02 (creates `(public)` route group layout that Tools Hub page lives under).

**Boundary — NOT in this phase**: Listing-specific commute calculator Version B (P17-E03). Server-side tool persistence (V2). AI-powered recommendations (V2). See `tasks/phase-18-tenant-tools/README.md` for known deviations from feature spec.

**Key docs**: [features/16-tenant-tools.md](../notes/features/16-tenant-tools.md)

---

### Phase 19: Tenant Inquiry Pipeline `(P19)`

**Status**: Done (completed Feb 2026).

**Scope**: Schema + auth plumbing (`tenant_inquiries` + `tenant_profiles` tables, `TENANT`/`OWNER` user types, `requireTenant()`, tenant inquiry constants/permissions/rate limiter/config), full backend lifecycle (`convex/tenantInquiries.ts` with 8 mutations + 4 queries + bounty expiry cron), `visits.complete` sync hook, tenant visit request form on listing detail page (auth-gated), admin inquiry queue at `/admin/tenant-inquiries` (paginated table + status tabs + detail panel + action dialogs), guard bounty board at `/guard/bounties` (available/accepted tabs + accept confirmation + status tracking). 10-status state machine: SUBMITTED→REVIEWED→BOUNTY_POSTED→GUARD_ACCEPTED→VISIT_SCHEDULED→VISIT_COMPLETED→NEGOTIATION_INITIATED→CLOSED (+ REJECTED, EXPIRED). UI built with shadcn/ui components.

**Delivers**: Full tenant inquiry pipeline from submission to guard visit to closure. Schema drift resolved. Tenant/owner user types forward-compatible for P20. Separate from guard lead pipeline.

**Depends on**: P01-E01 (auth, user schema, constants patterns). Guard/listing existence are runtime data dependencies, not build-order.

**Epics**: 4 epics, 13 tasks — E01 (Schema/Auth/Constants, 3T) → E02 (Backend Lifecycle, 3T) → E03 (Tenant Form + Admin UI, 4T) ∥ E04 (Guard Bounty Board, 3T).

**Boundary — NOT in this phase**: Full rent negotiation (P23 — P19 stubs `NEGOTIATION_INITIATED` only). Auto-assignment of guards (V2). Tenant self-serve reschedule/cancel (V2). Push notifications (V2).

**Key docs**: [features/13-tenant-inquiry.md](../notes/features/13-tenant-inquiry.md), [04-state-machines.md](../notes/04-state-machines.md)

---

### Phase 31: Owner Entity & RM Foundation `(P31)` - Execute Before P20

**Status**: Done (completed Feb 2026).

**Scope**: Canonical owner identity model (`owners` table keyed by normalized phone), identity resolution across guard-lead and owner-service paths with auto-resolution on VERIFIED status, owner lifecycle stages (PROSPECT -> VERIFIED -> ACTIVE -> MANAGED -> DORMANT -> CHURNED), owner linkage fields on `leads`/`listings`/`closures`, RM assignment core (`owner_rm_assignments`, `rm_check_ins`), closure-confirmation auto-assignment to original lead submitter, admin owner pages (`/admin/owners`, owner detail tabs), RM operations page (`/admin/rm-dashboard`), reassignment flow, ops automation hooks (SLA/check-in/dormancy crons), owner search export, and public admin-callable mutations for RM operations.

**Delivers**: Unified owner record across all products, post-deal owner management model with accountable guard RM ownership, and foundation needed by owner services, referral attribution, deal room, and negotiation owner participation. Dormant owner reactivation on new lead activity.

**Depends on**: P05 (owner verification outcomes), P09 (closure confirmation and post-deal lifecycle), P19-E01 preferred (`OWNER` user type foundation; fallback included in P31-E01 if missing).

**Epics**: 3 epics, 18 tasks - E01 (Owner Entity Foundation, 7T) -> E02 (RM Assignment Core, 6T) -> E03 (RM Operations, 5T).

**Execution note**: **Tier 1 (P31-E01) is the hard prerequisite for P20**. Tiers 2-3 (`P31-E02`, `P31-E03`) can overlap with later owner/deal phases once Tier 1 contracts are stable.

**Boundary - NOT in this phase**: Full owner dashboard product, owner self-service plan management, notification delivery infrastructure, advanced retention analytics beyond defined lifecycle and RM ops baseline.

**Key docs**: [features/21-owner-entity-and-rm.md](../notes/features/21-owner-entity-and-rm.md), [features/14-owner-services.md](../notes/features/14-owner-services.md), [04-state-machines.md](../notes/04-state-machines.md), [10-convex-schema.md](../notes/10-convex-schema.md), [13-constants-reference.md](../notes/13-constants-reference.md)

---

### Phase 20: Owner Services `(P20)`

**Status**: Done (completed Feb 2026).

**Scope**: Schema plumbing (`owner_service_requests` table, constants, permissions, rate limiter `public:owner_service_request` phone-keyed 3/hr, audit coverage), full backend lifecycle (`convex/ownerServiceRequests.ts` with centralized `VALID_TRANSITIONS`, submit/updateStatus/list/getById/statusCounts), `createOwnerAccount` WorkOS Action (Google SSO onboarding, existing-user handling, isNewOwner flag), public landing page at `(public)/owner-services/` (hero + 6-card benefits grid + contact form + DemoRentals branding + config-backed contact info), admin queue at `(admin)/admin/owner-requests/` (all 6 status tabs with counts + paginated table + detail panel + 5 action dialogs: Contact/Reject/Drop/Onboard/Activate refactored to react-hook-form+zod). 6-status state machine: SUBMITTED→CONTACTED→ONBOARDED→ACTIVE (+ REJECTED, DROPPED). UI built with shadcn/ui components.

**Delivers**: Owner submits contact form → persisted → admin manages through lifecycle → onboard creates WorkOS OWNER account with isNewOwner flag. Minimal owner experience (status check) deferred.

**Depends on**: P31-E01 (hard prerequisite: canonical owner entity), P19-E01 (adds `OWNER` user type), P15 (creates `(public)` route group layout).

**Execution note**: P20 should not start until `P31-E01` is done. `P31-E02` and `P31-E03` may continue in parallel once P20 starts.

**Epics**: 3 epics, 9 tasks — E01 (Schema/Constants/Backend, 3T) → E02 (Public Page, 3T) ∥ E03 (Admin Management, 3T).

**Boundary — NOT in this phase**: Minimal owner status view (deferred follow-up). Service plan comparison (V2). ROI calculator (V2). Case studies (V2). Owner dashboard (V2).

**Key docs**: [features/14-owner-services.md](../notes/features/14-owner-services.md), [04-state-machines.md](../notes/04-state-machines.md)

---

### Phase 21: Support Inbox & CRM Dashboard `(P21)`

**Status**: Done (completed Feb 2026).

**Scope**: Support inquiry lifecycle (`support_inquiries` table with `source_channel` field, forward-only state machine OPEN→IN_PROGRESS→RESOLVED→CLOSED, `convex/supportInquiries.ts` with submit/updateStatus/assign/updateOpsNotes mutations + list/getById/statusCounts queries, phone-based rate limiting 3/hr), admin support inbox at `/admin/support` (status tabs, paginated table, detail panel, assignment flow, internal notes, Persona column, source_channel in detail), CRM dashboard summary cards on admin dashboard (aggregate counts for tenant inquiries + owner requests + support inquiries, needs-attention logic). HTTP handler enum validation for `persona_type` and `preferred_contact_method` (returns 400 on invalid). UI built with shadcn/ui components.

**Delivers**: Full support inquiry backend and admin inbox. CRM dashboard cards showing live counts across all 3 admin-managed entity types. Schema drift resolved (`support_inquiries` added to `convex/schema.ts` with `source_channel`, `ops_notes` field documented). Public mutation (not HTTP-only). Rate limiting keyed by phone number.

**Depends on**: P01-E01 (auth + Convex patterns), P19-E02 (tenant inquiry backend for CRM counts), P20-E01 (owner request backend for CRM counts).

**Epics**: 3 epics, 9 tasks — E01 (Schema/Constants/Backend, 3T) → E02 (Support Inbox Admin Page, 3T) ∥ E03 (CRM Dashboard Cards, 3T).

**Boundary — NOT in this phase**: Tenant inquiry admin page (P19-E03). Owner request admin page (P20-E03). Push/email notifications (V2). SLA tracking (V2). Bulk operations (V2). Export to CSV (V2).

**Key docs**: [features/15-public-pages.md](../notes/features/15-public-pages.md), [04-state-machines.md](../notes/04-state-machines.md), [06-admin-panel-ux.md](../notes/06-admin-panel-ux.md)

---

### Phase 22: Referral System `(P22)`

**Status**: Done (completed Feb 2026).

**Scope**: Two separate referral programs. **Rental Platform OS (Guard-only)**: Guard-to-guard referrals tracked by phone number, ₹500 bounty on referred guard's first verified lead (triggered via `convex/verifications.ts`), ops records referrer during guard creation. **DemoRentals (Tenant & Owner)**: Per-user referral codes (FLAT-XXXXX format) with shareable URLs, first-touch sign-up attribution with admin override, stacking bonuses (₹200 sign-up + finding bonus), two-tiered finding bonuses (30% on listing publish, 70% on deal closure — ₹1,000 tenant-finding, ₹2,000 owner-finding), configurable amounts per scope (building > society > global cascade), admin attribution overrides, predicted bonus query (historical average with config fallback), user-visible referral earnings dashboard. 4 schema tables (`referral_codes`, `referrals`, `referral_milestones`, `referral_config`), 4 milestone types, forward-only state machines. UI built with shadcn/ui components.

**Delivers**: Full dual-program referral system. Guards refer guards and earn bounties. Tenants/owners share codes and earn stacking bonuses. Admin manages referrals, configures per-scope bonuses, overrides attribution, approves milestone payouts. Guard referral section in earnings page (no 6th nav item). Referral analytics for admin.

**Depends on**: P01-E01 (auth + Convex patterns), P19-E01 (TENANT/OWNER user types for DemoRentals attribution).

**Epics**: 5 epics, 19 tasks — E01 (Schema/Constants/Config, 4T) → E02 (Guard Referral, 3T) ∥ E03 (DemoRentals Codes/Attribution, 4T) → E04 (Milestone Engine, 4T) → E05 (Admin/Dashboard, 4T).

**Boundary — NOT in this phase**: Referral leaderboards (V2). Tiered referral commissions (V2). Referral-based incentive cards/badges (V2). Auto-generated referral marketing materials (V2). Push notifications for milestones (V2).

**Key docs**: [features/17-referral-system.md](../notes/features/17-referral-system.md), [04-state-machines.md](../notes/04-state-machines.md) referral status section, [10-convex-schema.md](../notes/10-convex-schema.md) referral tables

---

### Phase 23: Deal Communication Room + Rent Negotiation `(P23)` — ⚠️ REFERENCE ONLY

> **⚠️ This phase was split into P24 + P25 + P26 for implementation.** The scope below is preserved as the original reference. See Phase 24 (Chat Infrastructure), Phase 25 (Deal Room Features), and Phase 26 (Rent Negotiation) for the actual implementation task files.

**Scope**: AI-mediated chat system between tenants and property owners, extended with a full ops-mediated rent negotiation workflow.

**Deal Room (original P23 scope)**: **Channel model**: per-inquiry, admin-opened, owner joins via Google SSO invite link. **AI pipeline**: Mastra AI + OpenAI — every message (both sides) fully rewritten for professionalism + PII masking (phone, email, social handles masked; property details preserved). Message batching (5-second window) for efficient API usage. **Sender UX**: sees original + masked side-by-side. **Receiver**: masked only. **Admin god-mode**: send as DemoRentals, impersonate either party, toggle AI on/off per message, full visibility of everything. **Deal terms checklist**: AI auto-extracts terms/concerns from chat history, admin reviews/edits, shared with both parties, per-item approval (agree/disagree/comment), formal sign-off by both parties, stored as closure documentation. **Owner invite flow**: admin generates invite link, manually sends via WhatsApp, owner clicks → Google SSO → accesses chat. Schema designed for future guard ↔ admin chat (extensible `sender_role`, separate channel types).

**Rent Negotiation (expanded scope)**: **3-room architecture**: Three distinct `chat_channels` per negotiation — `OPS_TENANT` (ops + tenant private), `OPS_OWNER` (ops + owner private), `COMBINED` (all three parties). AI masking applies to all three room types. **Structured terms proposals**: Versioned proposals with 11 deal term fields (rent, deposit, lock-in, notice period, move-in date, maintenance, escalation, furnishing, brokerage, token advance, special conditions). All amounts in paise. Per-party sign-off (tenant + owner independently). Terms locked after both sign. **Token advance collection**: Ops records token collection with refund policy (NON_REFUNDABLE / REFUNDABLE_WITHIN_DAYS / PARTIAL_REFUND / CASE_BY_CASE). Tenant must explicitly agree to policy before token is recorded. **Brokerage recording**: Per-deal, per-side (tenant-side + owner-side), manually decided by ops. No formula. **Mandatory post-agreement checklist**: 7 items gate closure — agreed terms, both-party sign-off, token collected, brokerage recorded, police verification status, society NOC status, rent agreement PDF upload. System blocks closure confirmation until all 7 complete. **Anti-scam guardrails**: AI masking prevents PII leakage; private room confidentiality enforced at query level; mandatory checklist prevents rushed closures; full audit trail. **Escalation flags**: System auto-flags stale negotiations (configurable inactivity threshold), too many proposal rounds, and token collected without rent agreement upload. **Negotiation queue**: Admin queue at `/admin/negotiations/` with status tabs, flag indicators, and detail page with three room tabs + checklist panel.

**Delivers**: Full deal communication platform with AI-masked messaging, admin master control, and legal-adjacent deal checklist with formal sign-off. Plus: complete ops-mediated rent negotiation workflow from INTERESTED visit outcome through to closure-ready state. Prevents platform bypass (PII masking), prevents unprofessional communication (full rewrite), creates auditable records (checklist + signatures), controls ops from making side deals, and gates closure on mandatory documentation.

**Depends on**: P01 (auth — Google SSO for owners), P06 (listings — chat is about a listing), P08 (closures — negotiation gates closure confirmation), P19 (tenant inquiries — negotiation triggered by INTERESTED visit outcome), P20 (owner services — owner accounts).

**Boundary — NOT in this phase**: Guard ↔ Admin chat (future — schema extensible). Push notifications for new messages (V2). Voice/video calls (V2). File/image sharing in chat (V2). Automated deal term compliance checking (V2). WhatsApp Business API integration for owner notifications (V2). In-app escrow for token advance (V2 — see [V2 Backlog](../notes/09-v2-backlog.md)).

**Key docs**: [features/18-deal-room.md](../notes/features/18-deal-room.md), [features/19-rent-negotiation.md](../notes/features/19-rent-negotiation.md), [04-state-machines.md](../notes/04-state-machines.md) negotiation + chat + checklist status sections, [02-data-models.md](../notes/02-data-models.md) AJ–AM sections

---

### Phase 24: Chat Infrastructure `(P24)`

**Scope**: Core real-time AI-masked chat system. Chat channel model (per-inquiry, admin-opened), `convex-batch-processor` integration for 5-second message batching, layered PII masking pipeline (regex pre-scan → GPT-4o-mini rewrite → regex post-check → fail-closed admin review), real-time paginated message subscriptions, read receipts, chat message status lifecycle (SUBMITTED→BATCHED→PROCESSING→DELIVERED/FAILED), basic chat UI (sender vs receiver view, original+masked side-by-side for sender, "Sending..." status), admin chat monitor. Schema: `chat_channels`, `chat_messages`, `chat_message_batches`, `chat_read_receipts`. ~8 new enums. 5 system_config keys.

**Delivers**: Reliable real-time AI-masked chat between any two parties. Message batching. Admin visibility. The communication transport layer — no deal logic.

**Depends on**: P01 (auth — WorkOS SSO), P19 (tenant inquiries — chat is per-inquiry).

**Epics**: 4 epics, ~15 tasks — E01 (Schema/Constants/Permissions, 4T) → E02 (Chat Backend + Batching, 4T) → E03 (AI Pipeline, 3T) → E04 (Chat UI + Admin Monitor, 4T).

**Boundary — NOT in this phase**: Deal checklist (P25). Owner invite flow (P25). 3-room architecture (P26). Terms proposals (P26). Admin god-mode (P25).

**Key docs**: [features/18-deal-room.md](../notes/features/18-deal-room.md) chat sections, [04-state-machines.md](../notes/04-state-machines.md) chat status section

---

### Phase 25: Deal Room Features `(P25)`

**Scope**: Full deal communication room on top of P24 chat rails. AI-extracted deal terms checklist (OpenAI structured outputs for term extraction from chat history, admin review/edit, versioning with supersession), multi-party approvals (per-item AGREE/DISAGREE/COMMENT from tenant + owner independently, checklist status derivation, formal sign-off with SHA-256 hash), owner invite flow (token generation, Google SSO binding, email verification, expiry/regeneration), admin god-mode (send as DemoRentals, impersonate, toggle AI per message, full audit trail). Schema: `deal_checklists`, `deal_checklist_signatures`. Extends `closures` with `deal_checklist_id`.

**Delivers**: Full deal-room experience with AI-extracted checklists, multi-party approvals, owner onboarding, and admin master control — all on stable chat rails from P24.

**Depends on**: P24 (chat infrastructure), P06 (listings), P20 (owner accounts for invite flow).

**Epics**: 4 epics, ~15 tasks — E01 (Deal Checklist Model + AI Extraction, 4T) → E02 (Multi-Party Approvals + Sign-Off, 4T) → E03 (Owner Invite Flow, 3T) → E04 (Admin God-Mode + Chat Management, 4T).

**Boundary — NOT in this phase**: 3-room negotiation architecture (P26). Terms proposals (P26). Token advance (P26). Mandatory post-agreement checklist (P26). Negotiation admin queue (P26).

**Key docs**: [features/18-deal-room.md](../notes/features/18-deal-room.md) checklist + owner invite + admin sections

---

### Phase 26: Rent Negotiation `(P26)`

**Scope**: Full ops-mediated rent negotiation engine. 3-room architecture (OPS_TENANT private, OPS_OWNER private, COMBINED — tenant NEVER sees owner room and vice versa, admin sees all), structured 11-field terms proposals (rent, deposit, lock-in, notice period, move-in date, maintenance, escalation, furnishing, brokerage, token advance, special conditions — all amounts in paise, versioned, per-party sign-off, locked after both sign), token advance collection (4 refund policies, tenant agreement capture, collection method recording), brokerage recording (per-side, manual), mandatory 10-item post-agreement checklist gating closure (police verification, society NOC, owner KYC, rent agreement draft, stamp/registration, key handover, inventory, utility transfer, move-in inspection, final confirmation — items 1/2/4 auto-validated, rest require ops action), 9-status negotiation state machine (INITIATED→ROOMS_OPENED→TERMS_PROPOSED→COUNTER_PROPOSED→TERMS_AGREED→TOKEN_COLLECTED→DOCUMENTATION_IN_PROGRESS→READY_FOR_CLOSURE→CLOSED + FAILED/STALLED), escalation crons (stale negotiation, excessive rounds, token without agreement), admin negotiation queue at `/admin/negotiations/` with status tabs and detail page (3 room tabs + checklist panel). Schema: `negotiations`, `negotiation_terms_proposals`, `negotiation_terms_signatures`, `negotiation_token_records`. Extends `closures` with `negotiation_id`. Extends `chat_channels` with `channel_type` and `negotiation_id`.

**Delivers**: Complete ops-mediated rent negotiation workflow from INTERESTED visit outcome through to closure-ready state. 3-room broker model prevents collusion. Mandatory checklist gates closure. Full admin visibility and escalation.

**Depends on**: P25 (deal room features — chat + checklist foundation), P08 (closures — negotiation gates closure confirmation).

**Epics**: 5 epics, ~19 tasks — E01 (3-Room Architecture + ACL, 4T) → E02 (Terms Proposal Engine, 4T) → E03 (Token + Brokerage, 3T) → E04 (Mandatory Checklist + Closure Gate, 4T) → E05 (Admin Queue + Escalation, 4T).

**Boundary — NOT in this phase**: Guard ↔ Admin chat (future — schema extensible). Push notifications (V2). Voice/video calls (V2). File/image sharing in chat (V2). Automated deal term compliance checking (V2). WhatsApp Business API (V2). In-app escrow for token advance (V2).

**Key docs**: [features/19-rent-negotiation.md](../notes/features/19-rent-negotiation.md), [04-state-machines.md](../notes/04-state-machines.md) negotiation status section

---

### Phase 27: Admin Panel Polish & Completeness `(P27)`

**Status**: Done (completed Feb 2026).

**Scope**: Fill all placeholder gaps in admin detail pages, overhaul dashboard into full ops command center (KPI cards, funnel chart, trend chart, recent activity, alerts, quick actions), create standalone verification page with queue/filters/inline actions/bulk ops, replace 4 placeholder tabs in guard detail (Leads, Visits, Earnings, Audit), replace leads placeholder tab in society detail + add activity feed/guard performance/listing stats/quick actions, fix 8+ cross-entity navigation gaps (make all entity names clickable links), add breadcrumbs to detail pages, add column sorting to list tables, add sidebar badge counts, add pagination info. **All frontend-only — every backend query already exists.**

**Delivers**: Admin panel is production-complete. Dashboard is a real ops command center. Every detail page has live data. Every entity name is a clickable link. Verification workflow is accessible. No more "Coming soon" or placeholder text anywhere.

**Depends on**: P01-P09 (all done), P13 (done — audit trail), P14 (done — i18n).

**Epics**: 6 epics, ~30 tasks — E01 (Dashboard Overhaul, 7T) ∥ E02 (Guard Detail Tabs, 5T) ∥ E03 (Society Detail Enhancements, 5T) ∥ E04 (Verification Page, 5T) → E05 (Cross-Entity Navigation, 4T) → E06 (List Page Polish, 4T).

**Boundary — NOT in this phase**: Global search / command palette (V2). Dark mode (V2). Data export CSV/Excel (V2). Push notifications (V2). Bulk actions beyond verification page (V2). Custom date range in analytics (V2).

**Key docs**: [06-admin-panel-ux.md](../notes/06-admin-panel-ux.md), [features/10-analytics.md](../notes/features/10-analytics.md), [features/04-owner-verification.md](../notes/features/04-owner-verification.md)

---

### Phase 28: Admin Power Tools `(P28)`

**Status**: Pending.

**Scope**: Command palette (⌘K) with global search and quick actions, keyboard shortcuts with chord sequences (G→L, G→D) and help dialog, dashboard drill-down (clickable KPIs, funnel stages, status breakdowns), bulk actions framework (lead verify/reject, payout approve/reject with floating action bar), inline table hover actions, and CSV export for all list pages. **Mostly frontend-only** — one new shadcn/ui component (`command`), minimal backend changes.

**Delivers**: Power-user admin experience. ⌘K to navigate anywhere. Bulk-triage 50 leads in minutes. Export any table to CSV. Keyboard-first workflow.

**Depends on**: P27 (done — complete admin panel with real data on every page).

**Epics**: 5 epics, 19 tasks — E01 (Command Palette, 4T) ∥ E02 (Keyboard Shortcuts, 3T) ∥ E03 (Dashboard Drill-Down, 4T) → E04 (Bulk Actions, 4T) → E05 (Inline Actions + Export, 4T).

**Boundary — NOT in this phase**: Dark mode (V2). TanStack Data Table migration (V2). Notification center (P29). SLA tracking (P29). Push notifications (V2).

**Key docs**: [06-admin-panel-ux.md](../notes/06-admin-panel-ux.md), [features/10-analytics.md](../notes/features/10-analytics.md)

---

### Phase 29: Ops Intelligence `(P29)`

**Status**: Pending.

**Scope**: SLA timers with countdown badges (lead verification 24h, visit scheduling 48h, payout processing 5 days), lead priority scoring (0-100 score based on age, rent, guard quality, duplicates), smart queue widget for verification page (top 10 priority leads with one-click actions), visit conflict detection (guard double-booking warnings), "Today's Visits" timeline card on dashboard, morning briefing card (contextual summary 6AM-12PM), notification bell in admin header. **Frontend + lightweight backend** — new Convex queries for SLA computation, lead scoring, conflict detection, and briefing aggregation. No new database tables.

**Delivers**: Intelligent ops dashboard. SLA breaches are visible before they happen. Leads auto-prioritize by urgency. Guard conflicts caught at scheduling time. Morning briefing tells the ops manager exactly what needs attention.

**Depends on**: P27 (done — admin panel complete), P28 recommended but not required (notification bell goes next to ⌘K button).

**Epics**: 4 epics, 15 tasks — E01 (SLA Timers, 4T) → E02 (Lead Priority, 3T) ∥ E03 (Visit Intelligence, 4T) → E04 (Morning Briefing, 4T).

**Boundary — NOT in this phase**: Auto-assignment of leads/visits (V2). Push notifications (V2). Scheduled reports (V2). Anomaly detection (V2). Forecasting (V2).

**Key docs**: [06-admin-panel-ux.md](../notes/06-admin-panel-ux.md), [features/10-analytics.md](../notes/features/10-analytics.md), [04-state-machines.md](../notes/04-state-machines.md)

---

### Phase 30: Field Ops Platform `(P30)`

**Status**: Done (completed Feb 2026).

**Scope**: OPS user type with dedicated mobile-first portal (`(ops)/` route group, phone+password auth via `@ops.local`), configurable property inspection checklist engine (LIGHT/MEDIUM/FULL depth, room-by-room with photo evidence, admin review), document collection & society liaison workflows (owner docs, tenant docs, society submissions, regulatory compliance tracking), Incentive Model v2 (multi-dimensional quality scoring 0-100, bounty multipliers 1.0x–2.0x, streak bonuses, penalty deductions, leaderboards), and full documentation reconciliation (3 new feature specs + updates to 15+ existing docs).

**Delivers**: Guards have enhanced visit execution with structured checklists. OPS users have a mobile ops portal for leads, visits, closures, documents, and checklists. Quality scores drive bounty multiplier suggestions. All documentation reflects the new field ops architecture.

**Depends on**: P01 (auth), P07 (visits), P09 (payouts), P10 (incentives — being overhauled).

**Epics**: 5 epics, 28 tasks — E01 (Ops Persona Foundation, 5T) → E02 (Checklist Engine, 6T) ∥ E03 (Document Collection, 5T) → E04 (Incentive v2, 6T) → E05 (Documentation Reconciliation, 6T).

**Boundary — NOT in this phase**: Offline-first sync (architecture ready but online-only in V1). Push notifications. Third-party contractor portal. Auto-assignment. GPS-based verification.

**Key docs**: [features/20-ops-portal.md](../notes/features/20-ops-portal.md), [features/21-field-checklists.md](../notes/features/21-field-checklists.md), [features/22-incentive-v2.md](../notes/features/22-incentive-v2.md) *(created by P30-E05)*

---

### Phase 32: Incentive v3 - Multi-Persona Commission Engine & Gamification `(P32)`

**Scope**: Dynamic commission engine (15-22% with performance modifiers), multi-contributor attribution (stage-weighted quality splits), gamification layer (XP, levels, weekly tiers, quests), versioned config system, and shadow-mode migration from v2.

**Depends on**: Phase 30 (Field Ops Platform), Phase 31 (Owner Entity & RM)

**Epics**: 5

**Feature specs**: [features/24-incentive-v3-overview.md](../notes/features/24-incentive-v3-overview.md), [features/25-commission-engine.md](../notes/features/25-commission-engine.md), [features/26-multi-contributor-attribution.md](../notes/features/26-multi-contributor-attribution.md), [features/27-ops-gamification.md](../notes/features/27-ops-gamification.md)

---

## Strategic Improvement Phases (P33-P42)

> Added Feb 2026 from comprehensive strategic review. See [Strategic Improvement Plan](../notes/features/24-strategic-improvement-plan.md).

### Tier 1: Before Launch

| Phase | Name | Epics | Tasks | Dependencies | Status |
|---|---|---|---|---|---|
| P33 | [Trust & Verification Display](phase-33-trust-verification-display/) | 3 | 10 | P05, P06, P07 | complete |
| P34 | [Transaction Completion Rails](phase-34-transaction-completion-rails/) | 5 | 19 | P19 (hard), P33 (soft) | complete |
| P35 | [Notification Infrastructure](phase-35-notification-infrastructure/) | 4 | 15 | P01, P14 | complete |
| P36 | [Monetization Foundation](phase-36-monetization-foundation/) | 4 | 13 | P34, P06 | pending |

### Tier 2: Growth Phase

| Phase | Name | Epics | Tasks | Dependencies | Status |
|---|---|---|---|---|---|
| P37 | [Post-Move-In Lifecycle](phase-37-post-move-in-lifecycle/) | 4 | 15 | P34, P35 | pending |
| P38 | [Premium Portal Infrastructure + Owner Portal](phase-38-owner-portal-dashboard/) | 6 | 24 | P20, P31, P24, P25, P22 | pending |
| P39 | [Tenant Trust Score & Reviews](phase-39-tenant-trust-score-reviews/) | 3 | 12 | P33, P34 | pending |
| P40 | [AI Intelligence Spine](phase-40-ai-intelligence-spine/) | 4 | 14 | P33, P12 | pending |

### Tier 3: Scale Phase

| Phase | Name | Epics | Tasks | Dependencies | Status |
|---|---|---|---|---|---|
| P41 | [Supply Channel Diversification](phase-41-supply-channel-diversification/) | 4 | 16 | P33, P20, P22 | pending |
| P42 | [Financial Products & Insurance](phase-42-financial-products-insurance/) | 4 | 13 | P39, P34 | pending |
| P43 | [Tenant Portal](phase-43-tenant-portal/) | 4 | 17 | P38-E01, P38-E02, P19, P16, P22, P24, P25, P34, P35, P18 | pending |
| P45 | [Multi-Persona Identity](phase-45-multi-persona-identity/) | 5 | 18 | P44-E09 (hard), P38, P43 (recommended) | pending |

**Strategic Improvement Total: 12 phases, 48 epics, ~172 tasks**

---

## Operations Management Phase (P46)

> Added Feb 2026 — CEO Ops Command Center for active field-team management.

| Phase | Name | Epics | Tasks | Dependencies | Status |
|---|---|---|---|---|---|
| P46 | [CEO Ops Command Center](phase-46-ceo-ops-command-center/) | 4 | 17 | P30, P32, P35 (soft), P12 | complete |

---

## Voice & Accessibility Phase (P48)

> Added Feb 2026 — Voice-to-Text Notes. OpenAI Whisper transcription via Convex Actions for field workers who can't type easily. Multi-recording per field, permanent audio audit trail, client-side retries, guard/OPS portal priority.

| Phase | Name | Epics | Tasks | Dependencies | Status |
|---|---|---|---|---|---|
| P48 | Voice-to-Text Notes | 4 | 11 | P01, P14, P24 (file storage pattern) | pending — task directory not yet created |

**Epics:**

| Epic | Name | Tasks | Complexity |
|---|---|---|---|
| P48-E01 | Voice Infrastructure (Backend Action + Frontend Hooks + Component) | 4 | M |
| P48-E02 | Guard Portal Integration | 3 | S |
| P48-E03 | OPS + Shared Component Integration | 2 | S |
| P48-E04 | Extended Portals (Tenant, Admin — optional) | 2 | S |

**Key docs**: [Voice-to-Text Notes](../notes/features/39-voice-to-text-notes.md)

---

## Working With This System

### Creating Tasks (Plan Mode)

Load the `task-planner` skill. It has the full epic file template and rules for:
- Creating phase directories and READMEs
- Writing epic files with proper frontmatter
- Breaking features into 3-8 atomic tasks
- Setting dependencies via stable IDs
- Writing Required Reading, Key Rules, Deliverables, Acceptance Criteria, Verification

### Executing Tasks (Execute Mode)

Load the `task-planner` skill plus domain skills (`rental-platform-os-rules`, `rental-platform-os-arch`, etc.). The skill covers:
- How to find the next executable task
- How to verify completion
- How to update status and checkboxes
- When to mark an epic as done

### Verifying Tasks (Verify Mode)

Load the `verification-agent` skill. A separate agent verifies implemented features using browser automation + code inspection. The system uses two levels:

| Level | File | Tests | Runs When |
|-------|------|-------|-----------|
| **Per-Epic** | `PXX-EYY-VERIFY.md` | Isolated feature checks | After Code Agent marks epic `done` |
| **Per-Phase** | `VERIFICATION.md` | Cross-epic integration journeys | After ALL epics in phase pass verification |

**Workflow**: Doc Agent pre-creates VERIFY.md specs → Code Agent refines after implementation → Verify Agent executes using Playwright MCP, Context7, and code inspection → writes structured pass/fail reports.

Templates for verification specs live in `.opencode/skills/verification-agent/references/`.
```
