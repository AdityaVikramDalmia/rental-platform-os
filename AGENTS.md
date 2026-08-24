# AGENTS.md — Codebase Guide for AI Agents

> How to navigate this project efficiently. Read this first.

> **⚠️ This project uses OpenCode (not Claude Code). Agent skills live in `.opencode/skills/`.**

## Project Summary

**Rental Platform OS** — a DemoRentals platform with two product lines: (1) society security guards submit vacant flat leads for bounties, and (2) tenants browse listings, submit inquiries, and request visits; property owners submit service requests. Web-only, Next.js + Convex + WorkOS + shadcn/ui.

## Personas

| Persona    | Auth Method                                                                   | Portal                                                               | Description                                                                |
| ---------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Guard**  | Phone + password (synthetic email `{phone}@guards.local`)                   | `(guard)/` — mobile-first                                            | Submits vacant flat leads, handles visits, earns bounties                  |
| **Admin**  | Google SSO via WorkOS                                                         | `(admin)/` — desktop-first                                           | Manages leads, guards, listings, payouts, tenant inquiries, owner requests |
| **Tenant** | Google SSO via WorkOS                                                         | `(public)/` + `(tenant)/` — mobile-first                             | Browses listings, submits inquiries, requests visits                       |
| **Owner**  | Google SSO via WorkOS                                                         | `(public)/` owner services page + `(owner)/` — mobile-first          | Submits service requests and manages owner workflows in dedicated portal   |
| **OPS**    | Phone + password (synthetic email `{phone}@ops.local`) OR Google SSO | `(ops)/` — mobile-first + `(admin)/` — desktop (permission-filtered) | Manages leads, visits, closures, checklists, documents in the field        |

## Current State

Phases 1–12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 30, 31, 32, 33, 34, 35, and 46 are **complete**. Phases 28–29 are **spec'd** (epic files written, ready for implementation). Phase 23 is a **reference-only umbrella** (split into P24+P25+P26, all complete). Strategic plan phases 36–42 remain **spec'd** (task files written, ready for implementation). Phases 43–45 and 48 are **spec'd** (task files written, ready for implementation).

- **Phase 1 (Auth)**: WorkOS integration, guard phone+password login, admin Google SSO, RBAC, audit triggers, seed script — all done
- **Phase 2 (Society Registry)**: Society CRUD + Building CRUD with admin UI — all done (107 tests passing)
- **Phase 3 (Guard Management)**: Guard CRUD, types, shifts, WorkOS Actions — done
- **Phase 4 (Lead Pipeline)**: Lead submission, de-dup, admin queue, NEED_INFO flow — done
- **Phase 5 (Owner Verification)**: Verification form, call outcome, consent capture — done
- **Phase 6 (Listings)**: Listing creation, photos, slugs, public page SSR — done
- **Phase 7 (Visit Management)**: Visit scheduling, guard assignment, execution — done
- **Phase 8 (Closure)**: Closure creation, documents, brokerage, confirmation — done
- **Phase 9 (Payouts)**: Payout lifecycle (pending→approved→disbursed/failed/voided), admin payout board + detail, guard earnings page — done
- **Phase 10 (Incentive System)**: Card types (lead_milestone, visit_milestone, quality_streak, speed_bonus, monthly_top), BRONZE→PLATINUM tiers, auto-award suggestions, admin confirm/reject, manual award/expiry, guard badge display, 3-tab admin incentives page, config panel — all done
- **Phase 11 (Quality & Controls)**: 10 quality metrics per guard (3 time windows), configurable rate limits, GUARD_HIGH_REJECTION flag, 48px sticky rule banner (3 languages), browser fingerprint tracking, ban/deactivate refinement, guard quality tab, leaderboard — all done
- **Phase 12 (Analytics)**: 7 analytics queries, 3 aggregate components (leadCounts, visitCounts, payoutTotals), daily snapshot cron, 5-tab admin analytics dashboard with Recharts (overview KPIs, society comparison, guard leaderboard, financial, operational), time window selector — all done
- **Phase 13 (Audit Trail)**: 3 read-only backend queries (`convex/auditLogs.ts`), admin audit page with paginated table, 5 filters, expandable diff, entity links — done
- **Phase 14 (i18n)**: Guard portal fully translated — `next-intl` non-routing mode, 3 locales (en/hi/hinglish), 271 translation keys, cookie-based locale, language selector — done. See [Internationalization (i18n) Architecture](#internationalization-i18n-architecture) below.
- **Phase 15 (Public Pages)**: `(public)` route group, homepage, how-it-works, contact hub (support inquiry + newsletter), owner services page, public header/footer, WhatsApp widget — all done
- **Phase 16 (Tenant Browse)**: `/listings` page with search, 6 filter types, 4 sort options, grid/list view toggle, property cards, Load More pagination, localStorage favorites — all done. V1 accepted deviations: client-side filter computation, Load More (not page numbers), components at `public/listings/` (not `tenant/`)
- **Phase 17 (Property Detail)**: `/listing/[slug]` page upgraded with `getBySlugPublic`, house rules, commute calculator, location map, roommate profiles, static testimonials, similar listings, sticky contact/request-visit sidebar, and SEO metadata + JSON-LD — all done
- **Phase 18 (Tenant Tools)**: Dedicated `/tools` hub with rent calculator, generic commute estimator, roommate quiz, rental checklist tracker, `useLocalStorage` hook, and slider/data utility files — all done
- **Phase 19 (Tenant Inquiry Pipeline)**: Tenant visit request submission, ops bounty posting, guard bounty board, bounty acceptance, visit scheduling, inquiry lifecycle management, permissions (`tenant_inquiries.manage`), config keys (`tenant_bounty_expiry_days`) — all done
- **Phase 20 (Owner Services)**: Public owner services page with contact form, admin queue for managing owner requests (SUBMITTED → CONTACTED → ONBOARDED → ACTIVE), owner account creation during onboarding (Google SSO via WorkOS), config-backed contact info on public page, DemoRentals branding, ACTIVE status enforcement, isNewOwner flag on onboard, all 6 status tabs in admin UI, 5 dialogs refactored to react-hook-form+zod — all done
- **Phase 21 (Support Inbox & CRM Dashboard)**: Support inquiry lifecycle (OPEN → IN_PROGRESS → RESOLVED → CLOSED), public mutation for contact form submission, rate limiting by phone (not IP), HTTP handler enum validation, admin support inbox with status tabs and detail panel, CRM dashboard cards showing live counts across tenant inquiries + owner requests + support inquiries — all done
- **Phase 22 (Referral System)**: Guard-to-guard referrals (phone-based, ₹500 bounty on first verified lead), DemoRentals referrals (code-based for tenants/owners, stacking bonuses ₹200 sign-up + ₹1,000/₹2,000 finding), 4 schema tables (referral_codes, referrals, referral_milestones, referral_config), config resolution (building > society > global), admin attribution override (DemoRentals-only), analytics with funnel metrics, guard referral section in earnings page, public `/ref/[code]` landing page, admin `/admin/referrals` page with detail panel and config page — all done
- **Phase 24 (Chat Infrastructure)**: AI-masked deal room chat — 4 schema tables (`chat_channels`, `chat_messages`, `chat_message_batches`, `chat_read_receipts`), 6 backend files (`chatChannels.ts`, `chatMessages.ts`, `chatBatching.ts`, `chatReadReceipts.ts`, `chatAIMonitor.ts`, `actions/chatAI.ts`), message batching pipeline (5-second window, OpenAI gpt-4o-mini PII masking), stale batch recovery cron (every 5 min), `chat:send_message` rate limit (20/min), 4 permissions (`chat.view`, `chat.send`, `chat.moderate`, `chat.admin`), 4 config keys (`chat_ai_model`, `chat_batch_window_ms`, `chat_max_message_length`, `chat_pii_fail_action`), 6 chat UI components (MessageBubble, MessageList, SenderPreview, SystemMessage, ChatInput, ChatView), admin `/admin/chat-monitor` page — all done
- **Phase 25 (Deal Room Features)**: Deal checklist system completed (`deal_checklists`, `deal_checklist_signatures`, `owner_invites`), AI term extraction action (`actions/dealTermExtraction.ts`), checklist create/share/regenerate/versioning, tenant+owner item responses and dual sign-off with signature hashing, owner invite lifecycle (generate/consume/regenerate/expire) with optional email identity verification, closure linkage via `closures.deal_checklist_id` validation, and admin chat controls for archive/reopen + system/impersonated sends — all done
- **Phase 26 (Rent Negotiation)**: Full ops-mediated negotiation engine — 3-room chat architecture (OPS_TENANT/OPS_OWNER/COMBINED with strict ACL), 11-field structured terms proposals with versioning and per-party sign-off, token advance collection with 4 refund policies and tenant consent, per-side brokerage recording, mandatory 10-item post-agreement checklist gating closure, 9-status state machine (INITIATED→CLOSED + FAILED/STALLED/EXPIRED), visit completion hook for INTERESTED outcomes, escalation crons (stale/excessive rounds/token-without-agreement), admin `/admin/negotiations` queue with status tabs/search/sorting/analytics and `/admin/negotiations/[id]` detail page with 3-room tabs + sidebar + action dialogs, flag dismissal controls — all done
- **Phase 27 (Admin Panel Polish)**: Dashboard overhauled (KPI cards, funnel chart, trend chart, activity tables, status breakdowns, alerts), guard detail all 8 tabs working, society detail with real leads tab + activity feed + guard perf, verification page created and sidebar enabled, cross-entity clickable links + breadcrumbs + related entities cards, list page sorting + pagination info + sidebar badges — all done
- **Phase 31 (Owner Entity & RM Foundation)**: Canonical owner identity model (`owners` table keyed by normalized phone), identity resolution across guard-lead and owner-service paths, owner lifecycle stages (PROSPECT → VERIFIED → ACTIVE → MANAGED → DORMANT → CHURNED), owner linkage fields on leads/listings/closures, RM assignment core (`owner_rm_assignments`, `rm_check_ins`), closure-confirmation auto-assignment, admin owner pages, RM operations page, reassignment flow, ops automation hooks — all done
- **Phase 30 (Field Ops Platform)**: OPS persona with dedicated `(ops)/` portal and phone+password auth (`{phone}@ops.local`), configurable field checklist engine (templates + instances, 3 depth levels, photo evidence, completeness scoring), incentive model v2 (5-component quality score, BRONZE/SILVER/GOLD/PLATINUM tiers, 4 streak types, bounty multipliers 1.0x-2.0x, penalty deductions, payout adjustment engine, leaderboards), document collection system (requirements + regulatory items, tracking lifecycle, society liaison workflows) — all done
- **Phase 30 Extension (OPS Admin Access + Google SSO)**: OPS users can access `/admin/*` with permission-filtered sidebar visibility, `requireBackoffice()` enables shared backoffice backend checks, OPS account creation supports optional Google email for SSO-based backoffice access while preserving phone+password synthetic-email flow — all done
- **Phase 32 (Incentive v3)**: Multi-persona commission engine (15-22% configurable with BPS+FLAT modifiers), multi-contributor stage-weighted attribution (DISCOVERY 25%/VERIFICATION 35%/CLOSURE 25%/SUPPORT 15%), gamification layer (XP, levels, weekly tiers, daily quests, streaks, badges), versioned config system, shadow-mode migration with delta reporting and rollout controls — all done (68 property tests passing)
- **Phase 33 (Trust & Verification Display)**: Trust badges for listings (`listing_trust_badges` table), freshness states (FRESH/AGING/STALE), automated recomputation cron, public badge display on cards + detail pages, admin stale-listings page, and "Freshness First" sort — all done
- **Phase 34 (Transaction Completion Rails)**: Rental transaction lifecycle (6 tables: `rental_transactions`, `rental_agreements`, `kyc_packets`, `token_bookings`, `deposit_records`, `handover_checklists`), 5 state machines with validated transitions, KYC prerequisite enforcement, agreement expiry sync, deposit mismatch validation, auto-timeout crons, closure confirmation gate, "Start Transaction" in inquiry flow, admin transaction board with status tabs + Sheet detail, and tenant transaction timeline — all done
- **Phase 35 (Notification Infrastructure)**: Multi-channel notification engine (5 tables: `notification_preferences`, `notification_events`, `notification_templates`, `notifications`, `push_subscriptions`), event-driven dispatch with async Action callbacks, 4 channels (IN_APP/PUSH/WHATSAPP/SMS/EMAIL stubs), persona-specific priority routing, throttle caps, quiet hours with timezone, exponential retry + dead-letter, locale-aware templates, service worker push handlers, admin notification monitor with events + dead-letter tabs, and notification bell — all done
- **Phase 46 (CEO Ops Command Center)**: Two-tier CEO/OpsHead command center, KPI target tracking with 9 metric types, 3-level warning escalation engine with auto-detect, weekly check-in system with pre-briefs, P35 notification integration, 4 daily crons — all done
- **PWA Tier 1**: Separate installable PWAs for guard/admin portals — Serwist service worker, offline fallback, placeholder icons — done
- **Strategic Improvement Plan (P33-P42)**: Phase 33 (Trust), Phase 34 (Transaction Rails), and Phase 35 (Notifications) are implemented. Phases 36–42 remain spec'd (task files written, ready for implementation). See `notes/features/24-strategic-improvement-plan.md`.
- Dev environment: `npm run dev:force` starts everything, `/dev/login` page for auth bypass
- All product & technical docs complete (`notes/`)
- All agent skills created (`.opencode/skills/`)
- **Phase 48 (Voice-to-Text Notes)**: spec'd — 1 new table (`voice_transcriptions`), OpenAI Whisper transcription via Convex Action (`convex/actions/transcription.ts`), `useAudioRecorder` + `useVoiceTranscription` hooks, reusable `VoiceTextarea` component, multi-recording per field (unlimited), client-side retries with exponential backoff, permanent audio + transcript retention (soft-delete only for guard/OPS UI, admin sees all), guard/OPS portal priority. See `notes/features/39-voice-to-text-notes.md`.
- Task system framework ready (`tasks/README.md`) — 47 phases (23 original + P24-P26 deal room split + P27 admin polish + P28 power tools + P29 ops intelligence + P30-P35 field ops & strategic phases + P36-P42 strategic improvement phases + P43-P44 tenant portal & ops expansion + P45 multi-persona identity + P46 CEO ops command center + P48 voice-to-text notes)
- External reference codebase (`reference/demorentalsrentals/`) parsed → `reference/INVENTORY.md` + `reference/CORRELATION.md`

External reference codebases from parallel team efforts live in `reference/`. Load the `reference-parser` skill to extract features, correlate with Rental Platform OS docs, and extend the task plan.

Implementation begins with Phase 1 (Auth). See [tasks/README.md](tasks/README.md) for the execution roadmap.

## Documentation

All product and technical documentation lives in `notes/`. Start with `notes/README.md` for a full index.

### Quick Lookup Table

| I need to understand...                       | Read this                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| What the product does                         | `notes/00-product-overview.md`                                                                  |
| Tech stack & project structure                | `notes/01-tech-stack.md`                                                                        |
| PWA architecture & setup                      | `notes/01-tech-stack.md` → Progressive Web App (PWA) section                                    |
| Database schema (copy-paste)                  | `notes/10-convex-schema.md`                                                                     |
| All enums, permissions, config keys           | `notes/13-constants-reference.md`                                                               |
| How auth works (WorkOS)                       | `notes/01-tech-stack.md` → Auth Architecture section                                            |
| How Convex Actions/HTTP Router work           | `notes/11-convex-architecture.md`                                                               |
| Valid status transitions                      | `notes/04-state-machines.md`                                                                    |
| Guard portal screens                          | `notes/05-guard-portal-ux.md`                                                                   |
| Admin panel screens                           | `notes/06-admin-panel-ux.md`                                                                    |
| Tenant browse & listings                      | `notes/features/11-tenant-browse.md`                                                            |
| Property detail pages                         | `notes/features/12-property-detail.md`                                                          |
| Tenant inquiry pipeline                       | `notes/features/13-tenant-inquiry.md`                                                           |
| Owner services                                | `notes/features/14-owner-services.md`                                                           |
| Public pages (homepage, contact)              | `notes/features/15-public-pages.md`                                                             |
| Tenant tools (calculators, quiz)              | `notes/features/16-tenant-tools.md`                                                             |
| Referral system (guard + tenant)              | `notes/features/17-referral-system.md`                                                          |
| Deal room (masked chat + checklists)          | `notes/features/18-deal-room.md`                                                                |
| Deal economics & ops commission               | `notes/features/20-deal-economics.md`                                                           |
| OPS portal screens & field operations         | `notes/features/20-ops-portal.md`                                                               |
| Field checklists (templates + instances)      | `notes/features/21-field-checklists.md`                                                         |
| Incentive v2 (quality score, tiers, streaks)  | `notes/features/22-incentive-v2.md`                                                             |
| Strategic improvement plan                    | `notes/features/24-strategic-improvement-plan.md`                                               |
| Trust badges & freshness                      | `notes/features/25-trust-verification-display.md`                                               |
| Rent negotiation (3-room brokering, terms)    | `notes/features/19-rent-negotiation.md`                                                         |
| Transaction rails                             | `notes/features/26-transaction-completion-rails.md`                                             |
| Notification infrastructure                   | `notes/features/27-notification-infrastructure.md`                                              |
| Monetization & pricing                        | `notes/features/28-monetization-foundation.md`                                                  |
| Post-move-in lifecycle                        | `notes/features/29-post-move-in-lifecycle.md`                                                   |
| Owner portal & dashboard                      | `notes/features/30-owner-portal-dashboard.md`                                                   |
| Tenant trust score & reviews                  | `notes/features/31-tenant-trust-score-reviews.md`                                               |
| AI features (rent calc, scoring)              | `notes/features/32-ai-intelligence-spine.md`                                                    |
| Supply channel diversification                | `notes/features/33-supply-channel-diversification.md`                                           |
| Financial products & insurance                | `notes/features/34-financial-products-insurance.md`                                             |
| Multi-persona identity model                  | `notes/features/36-multi-persona-identity.md`                                                   |
| CEO ops command center                        | `notes/features/37-ceo-ops-command-center.md`                                                   |
| Voice-to-text notes                           | `notes/features/39-voice-to-text-notes.md`                                                      |
| A specific feature                            | `notes/features/` → see index in `notes/README.md`                                              |
| i18n architecture & translation guide         | This file → [Internationalization (i18n) Architecture](#internationalization-i18n-architecture) |
| i18n feature spec (product)                   | `notes/08-i18n.md`                                                                              |
| What's NOT in V1                              | `notes/09-v2-backlog.md`                                                                        |
| Why a decision was made                       | `notes/12-decisions-log.md`                                                                     |
| External reference code                       | `reference/README.md` → then load `reference-parser` skill                                      |
| Hard-won debugging insights                   | `insights/README.md` (proxy.ts, Convex auth, WorkOS, Docker MCP)                                |
| Docker browser pages stuck loading            | `insights/docker-playwright-mcp/README.md` → Issue 2 (Convex WebSocket patch)                   |
| Docker MCP won't connect                      | `insights/docker-playwright-mcp/README.md` → Issue 1 (`--host 0.0.0.0`)                         |
| Dev login silently fails                      | `insights/workos-dev-user-seeding/README.md` — WorkOS user may not exist                        |
| Known bugs & their status                     | `bugs/README.md` — check before debugging any issue                                             |
| What's been tested & results                  | `verification/README.md` — check before re-testing                                              |

## Project Structure (Target)

```
rental-platform-os/
├── .opencode/                  # Agent skills (OpenCode)
│   └── skills/
│       ├── rental-platform-os-arch/    # Convex architecture patterns
│       ├── rental-platform-os-rules/   # Hard conventions (data, auth, imports)
│       ├── browser-automation/ # Docker parallel browser pool + claim protocol
│       │   └── scripts/pool.sh # Start/stop/status Docker Playwright containers
│       ├── convex-api/         # Convex platform API reference
│       ├── doc-navigator/      # Documentation maintenance
│       ├── doc-reconciler/     # Doc drift detection & fixes
│       ├── reference-parser/   # Parse external codebases, correlate to docs, extend tasks
│       ├── skill-writer/       # Skill creation & updates
│       └── task-planner/       # Task execution workflow
├── convex/                     # Backend (Convex functions + schema)
│   ├── schema.ts               # Database schema
│   ├── functions.ts            # Wrapped mutation/query exports (audit triggers)
│   ├── auth.config.ts          # WorkOS JWT config
│   ├── auth.ts                 # WorkOS AuthKit component + event handlers
│   ├── auth.helpers.ts         # Auth utilities (requireGuard, requireAdmin, requireBackoffice, etc.)
│   ├── actions/                # Convex Actions (external API calls)
│   │   ├── workos.ts           # WorkOS user management (create, password, suspend)
│   │   ├── kyc.ts              # KYC provider stubs (P34)
│   │   ├── esign.ts            # eSign provider stubs (P34)
│   │   ├── notifications.ts    # Push/WA/SMS/Email delivery Actions (P35)
│   │   ├── chatAI.ts           # OpenAI PII masking + content rewriting for chat batches (P24)
│   │   ├── dealTermExtraction.ts # AI structured term extraction for deal checklists (P25)
│   │   └── backfillShadowDeltas.ts # One-time backfill for historical shadow deltas (P32)
│   ├── http.ts                 # HTTP Router (AuthKit webhooks + public listing endpoint)
│   ├── seed.ts                 # Bootstrap seed function
│   ├── seedDemo.ts             # Comprehensive demo data seeder
│   ├── admins.ts               # Admin account management functions
│   ├── users.ts                # User directory and persona functions
│   ├── roles.ts                # Role management functions
│   ├── userRoleAssignments.ts  # User-role assignment functions
│   ├── systemConfig.ts         # System config management functions
│   ├── systemConfig.helpers.ts # System config parsing/resolver helpers
│   ├── societies.ts            # Society management functions
│   ├── buildings.ts            # Building management functions
│   ├── guards.ts               # Guard management functions
│   ├── guardShifts.ts          # Guard shift scheduling functions
│   ├── leads.ts                # Lead pipeline functions
│   ├── verifications.ts        # Owner verification functions
│   ├── listings.ts             # Listing functions
│   ├── trustBadges.ts          # Trust badge computation and freshness (P33)
│   ├── tenantProfile.ts        # Tenant profile management functions
│   ├── tenantFavorites.ts      # Tenant favorites functions
│   ├── tenantInbox.ts          # Tenant inbox/message list functions
│   ├── tenantDashboard.ts      # Tenant dashboard aggregate functions
│   ├── tenantInquiries.ts      # Tenant inquiry pipeline functions (P19)
│   ├── ownerServiceRequests.ts # Owner service request queue functions
│   ├── supportInquiries.ts     # Support inquiry inbox lifecycle functions
│   ├── owners.ts               # Canonical owner entity functions
│   ├── rmAssignments.ts        # Relationship manager assignment functions
│   ├── opsManagement.ts        # OPS operations + P46 command center (targets, warnings, check-ins, briefs)
│   ├── opsAssignments.helpers.ts # OPS assignment helper utilities
│   ├── briefing.ts             # OPS daily briefing and feed functions
│   ├── sla.ts                  # SLA tracking and breach computation functions
│   ├── visits.ts               # Visit management functions
│   ├── closures.ts             # Closure functions
│   ├── rentalTransactions.ts   # Rental transaction lifecycle management (P34)
│   ├── rentalAgreements.ts     # Agreement generation, signing, status tracking (P34)
│   ├── kycPackets.ts           # KYC verification workflow (P34)
│   ├── tokenBookings.ts        # Token hold/release/refund lifecycle (P34)
│   ├── depositRecords.ts       # Deposit payment recording and confirmation (P34)
│   ├── transactionFees.ts      # Transaction fee ledger functions
│   ├── revenueLineItems.ts     # Revenue line-item recording functions
│   ├── notifications.ts        # Notification engine + preferences/feed/admin APIs (P35)
│   ├── payouts.ts              # Payout functions
│   ├── incentives.ts           # Incentive system functions
│   ├── gamification.ts         # Gamification profile/quest functions
│   ├── incentiveActors.ts      # Incentive actor profile functions
│   ├── incentiveConfig.ts      # Incentive configuration version functions
│   ├── incentiveDisbursements.ts # Incentive disbursement functions
│   ├── migrateIncentiveV3.ts   # Incentive v3 migration helpers
│   ├── commissionEngine.ts     # Commission calculation engine functions
│   ├── commissionModifierTemplates.ts # Commission modifier template functions
│   ├── attribution.ts          # Deal attribution and split functions
│   ├── dealContributions.ts    # Deal contributor tracking functions
│   ├── monetization.ts         # Monetization product/catalog functions
│   ├── referrals.ts            # Referral system functions (P22)
│   ├── referralCodes.ts        # Referral code CRUD (P22)
│   ├── referralConfig.ts       # Referral config management (P22)
│   ├── referralMilestones.ts   # Referral milestone tracking (P22)
│   ├── newsletterSubscriptions.ts # Newsletter subscription functions
│   ├── chatChannels.ts         # Chat channel CRUD + queries (P24)
│   ├── chatMessages.ts         # Chat message send + list (P24)
│   ├── chatBatching.ts         # Message batch window + stale recovery (P24)
│   ├── chatReadReceipts.ts     # Read receipt upsert + unread counts (P24)
│   ├── chatAIMonitor.ts        # Admin monitor queries — flagged msgs, failed batches (P24)
│   ├── dealChecklists.ts       # Deal checklist create/share/regenerate/versioning (P25)
│   ├── dealChecklistApprovals.ts # Deal checklist item responses, disputes, signatures (P25)
│   ├── ownerInvites.ts         # Owner invite lifecycle for deal room access (P25)
│   ├── checklists.ts           # Checklist instance functions (P30)
│   ├── checklistTemplates.ts   # Checklist template CRUD (P30)
│   ├── documents.ts            # Document collection functions (P30)
│   ├── societyLiaison.ts       # Society liaison workflow functions (P30)
│   ├── fieldWorkerContracts.ts # Field worker contract lifecycle functions
│   ├── fieldWorkerRollout.ts   # Field worker rollout/canary functions
│   ├── negotiations.ts         # Negotiation lifecycle, 3-room ACL, admin queries, escalations (P26)
│   ├── negotiationProposals.ts # Proposal CRUD, sharing, superseding, sign-off (P26)
│   ├── negotiationChecklist.ts # Mandatory checklist items, waive, readiness check (P26)
│   ├── negotiationTokens.ts    # Token advance collection, refund policy, tenant agreement (P26)
│   ├── shadowMode.ts           # Shadow mode delta queries and internal helpers (P32)
│   ├── shadowRollout.ts        # Rollout policy management, migration toggles, decommission (P32)
│   ├── analytics.ts            # Analytics queries
│   ├── auditLogs.ts            # Audit log query endpoints
│   ├── migrations.ts           # One-off data migration utilities
│   ├── crons.ts                # Cron jobs (analytics + negotiations + P46 target/warning/check-in automation)
│   ├── rateLimiter.ts          # Rate limiter config
│   ├── convex.config.ts        # Component registration
│   └── _generated/             # Auto-generated types
├── src/                        # Frontend (Next.js App Router)
│   ├── proxy.ts                # AuthKit proxy (Next.js 16+ — NOT middleware.ts)
│   ├── i18n/
│   │   └── request.ts          # next-intl getRequestConfig (cookie-based locale, named formats)
│   ├── app/
│   │   ├── layout.tsx          # Root layout with providers
│   │   ├── sw.ts               # Serwist service worker source (compiled to public/sw.js)
│   │   ├── ~offline/           # Offline fallback route
│   │   │   └── page.tsx
│   │   ├── callback/           # Auth callback route (WorkOS redirect)
│   │   ├── (auth)/             # Auth routes
│   │   │   ├── guard/login/    # Guard phone+password (custom UI)
│   │   │   ├── guard/change-password/
│   │   │   ├── guard/layout.tsx # Guard auth i18n provider (NextIntlClientProvider)
│   │   │   ├── admin/login/    # Admin Google SSO redirect
│   │   │   └── ops/login/
│   │   │       └── ops-login-client.tsx   # Client component: Google SSO button + phone/password form (P30 ext)
│   │   ├── (guard)/            # Guard portal routes (mobile-first, i18n-enabled)
│   │   ├── (admin)/            # Admin panel routes (desktop-first, English only)
│   │   │   └── admin/
│   │   │       ├── verification/            # Verification page (P27)
│   │   │       │   └── page.tsx
│   │   │       ├── stale-listings/          # Trust freshness admin page (P33)
│   │   │       │   └── page.tsx
│   │   │       ├── notifications/           # Notification monitor page (P35)
│   │   │       │   └── page.tsx
│   │   │       ├── chat-monitor/            # Chat monitor page (P24)
│   │   │       │   └── page.tsx
│   │   │       ├── chat/[channelId]/        # Deal room admin channel page (P25)
│   │   │       │   └── page.tsx
│   │   │       ├── transactions/            # Admin transaction management (P34)
│   │   │       │   └── page.tsx
│   │   │       ├── ops-command-center/      # CEO/OpsHead command center page (P46)
│   │   │       │   └── page.tsx
│   │   │       ├── negotiations/            # Negotiation admin queue (P26)
│   │   │       │   ├── page.tsx
│   │   │       │   ├── components/          # Queue table, status tabs, search, flags, analytics cards
│   │   │       │   └── [id]/               # Negotiation detail page (P26)
│   │   │       │       ├── page.tsx
│   │   │       │       └── components/     # Room tabs, sidebar, status timeline
│   │   │       └── tenant-inquiries/
│   │   │           └── components/
│   │   │               └── start-transaction-dialog.tsx  # Initiate transaction from inquiry (P34)
│   │   ├── (tenant)/           # Tenant portal routes (mobile-first)
│   │   │   ├── layout.tsx      # Tenant portal layout (P34)
│   │   │   └── tenant/
│   │   │       └── transactions/  # Tenant transaction timeline (P34)
│   │   ├── (owner)/            # Owner portal routes (mobile-first)
│   │   │   ├── layout.tsx      # Owner portal layout
│   │   │   ├── owner-layout-client.tsx # Owner portal shell + navigation
│   │   │   └── owner/
│   │   │       ├── dashboard/page.tsx
│   │   │       ├── leads/page.tsx
│   │   │       ├── properties/page.tsx
│   │   │       ├── messages/page.tsx
│   │   │       ├── messages/[channelId]/page.tsx
│   │   │       ├── profile/page.tsx
│   │   │       ├── documents/page.tsx
│   │   │       ├── earnings/page.tsx
│   │   │       ├── service-requests/page.tsx
│   │   │       ├── referrals/page.tsx
│   │   │       └── status/page.tsx
│   │   ├── (ops)/              # OPS portal routes (mobile-first, field operations)
│   │   ├── (public)/           # Public pages (homepage, how-it-works, contact, owner services, tools)
│   │   │   ├── tools/          # Dedicated tenant tools hub (`/tools`)
│   │   │   └── invite/[token]/ # Owner invite accept flow (P25)
│   │   │       ├── page.tsx
│   │   │       └── join/page.tsx
│   │   └── listing/[slug]/     # Public listing pages (SSR, no auth)
│   │       ├── page.tsx        # Listing detail route with SEO + JSON-LD
│   │       └── components/     # Property detail sections (gallery, pricing, rules, commute, map, roommates, sidebar)
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components (see list below)
│   │   ├── guard/              # Guard-specific components
│   │   │   ├── LanguageSelector.tsx  # 3-button locale toggle (en/hi/hinglish)
│   │   │   ├── GuardProfileCard.tsx
│   │   │   ├── GuardShiftList.tsx
│   │   │   ├── GuardOnboarding.tsx
│   │   │   └── GuardPhotoUpload.tsx
│   │   ├── admin/              # Admin-specific components
│   │   │   ├── dashboard/               # Dashboard components (P27)
│   │   │   │   ├── DashboardKPICards.tsx
│   │   │   │   ├── DashboardFunnelChart.tsx
│   │   │   │   ├── DashboardTrendChart.tsx
│   │   │   │   ├── DashboardRecentActivity.tsx
│   │   │   │   ├── DashboardStatusBreakdowns.tsx
│   │   │   │   ├── DashboardAlertsAndActions.tsx
│   │   │   │   ├── DashboardErrorCard.tsx
│   │   │   │   ├── FreshnessSummaryCard.tsx
│   │   │   │   └── TimeWindowSelector.tsx
│   │   │   ├── ops-command-center/       # Phase 46 admin command center components
│   │   │   │   ├── TeamHealthHeatmap.tsx
│   │   │   │   ├── AgentProfileSheet.tsx
│   │   │   │   ├── FiresPanel.tsx
│   │   │   │   ├── CelebrationsPanel.tsx
│   │   │   │   ├── SummaryCards.tsx
│   │   │   │   ├── PipelineAgingPanel.tsx
│   │   │   │   ├── TargetSettingDialog.tsx
│   │   │   │   ├── AgentTargetsView.tsx
│   │   │   │   ├── BulkTargetDialog.tsx
│   │   │   │   ├── WarningDialog.tsx
│   │   │   │   ├── WarningTimeline.tsx
│   │   │   │   ├── CheckInForm.tsx
│   │   │   │   ├── CheckInHistory.tsx
│   │   │   │   ├── PreCheckInBrief.tsx
│   │   │   │   ├── OpenActionItemsPanel.tsx
│   │   │   │   └── metric-options.ts
│   │   │   ├── guards/                  # Guard-specific admin components
│   │   │   │   ├── guard-leads-tab.tsx
│   │   │   │   ├── guard-visits-tab.tsx
│   │   │   │   ├── guard-earnings-tab.tsx
│   │   │   │   ├── guard-audit-tab.tsx
│   │   │   │   ├── guard-quality-tab.tsx      # (pre-existing)
│   │   │   │   └── fingerprint-history.tsx    # (pre-existing)
│   │   │   ├── Breadcrumb.tsx           # Shared admin breadcrumb navigation (P27)
│   │   │   ├── SortableHeader.tsx       # Reusable sortable column header (P27)
│   │   │   ├── SocietyLeadsTab.tsx      # Society leads table with filters (P27)
│   │   │   ├── SocietyActivityFeed.tsx  # Society 7-day activity timeline (P27)
│   │   │   ├── SocietyGuardPerf.tsx     # Society top-5 guard leaderboard (P27)
│   │   │   ├── VerificationTable.tsx    # Verification queue table (P27)
│   │   │   ├── VerificationDialog.tsx   # Owner verification form dialog (P27)
│   │   │   └── OpsCreateDialog.tsx    # Admin dialog to create OPS users with optional Google email (P30 ext)
│   │   ├── tenant/             # Tenant-specific components
│   │   │   ├── inquiry-form.tsx
│   │   │   ├── rent-calculator.tsx
│   │   │   ├── commute-estimator.tsx
│   │   │   ├── roommate-quiz.tsx
│   │   │   └── rental-checklist.tsx
│   │   ├── deal-room/          # Deal room checklist UI components (P25)
│   │   │   ├── ChecklistView.tsx
│   │   │   ├── ChecklistCard.tsx
│   │   │   ├── ChecklistItemCard.tsx
│   │   │   ├── VersionHistory.tsx
│   │   │   └── SignOffDialog.tsx
│   │   ├── negotiation/        # Rent negotiation UI components (P26)
│   │   │   ├── ProposalCard.tsx           # Proposal display (full + compact variants)
│   │   │   ├── ProposalEditor.tsx         # Create/edit proposal form (react-hook-form + zod)
│   │   │   ├── TermsComparison.tsx        # Side-by-side version diff
│   │   │   ├── ProposalSignOff.tsx        # Sign-off dialog + receipt
│   │   │   ├── TokenCollection.tsx        # Admin token collection form
│   │   │   ├── TenantPolicyAgreement.tsx  # Tenant refund policy consent
│   │   │   ├── BrokerageDisplay.tsx       # Per-side brokerage display
│   │   │   ├── MandatoryChecklist.tsx     # 10-item checklist panel with auto/manual items
│   │   │   └── RentAgreementUpload.tsx    # Rent agreement file upload widget
│   │   ├── public/             # Public page components
│   │   └── shared/             # Cross-role components
│   │       ├── trust-badge-chip.tsx   # Trust badge display chip (P33)
│   │       └── transaction-status-badge.tsx  # Transaction status display (P34)
│   ├── hooks/
│   │   ├── usePushNotifications.ts # Web Push subscription hook (P35)
│   │   └── use-local-storage.ts # SSR-safe localStorage hook (P18)
│   └── lib/                    # Frontend utilities
│       ├── rent-calculator.ts  # Tenant tool calculations
│       ├── commute-data.ts     # Commute lookup data/matrix
│       ├── quiz-data.ts        # Roommate quiz dataset/scoring
│       └── checklist-data.ts   # Rental checklist categories/items
├── lib/                        # Shared utilities (Convex + Frontend)
│   ├── constants.ts            # Status enums, permissions (mirrors 13-constants-reference.md)
│   ├── validators.ts           # Phone normalization, flat number validation
│   ├── money.ts                # Paise ↔ rupees conversion
│   ├── dates.ts                # Unix ms ↔ display format helpers
│   └── negotiation.ts          # Negotiation transition maps + helpers (P26)
├── messages/                   # i18n translation files (en, hi, hinglish)
├── public/                     # Static assets
│   ├── manifest-guard.webmanifest # Guard installable PWA manifest (scope: /guard/)
│   ├── manifest-admin.webmanifest # Admin installable PWA manifest (scope: /admin/)
│   ├── favicon.svg             # Shared browser favicon
│   └── icons/
│       ├── guard-192x192.png
│       ├── guard-512x512.png
│       ├── guard-180x180.png
│       ├── admin-192x192.png
│       ├── admin-512x512.png
│       └── admin-180x180.png
├── scripts/                    # Project scripts
│   └── generate-pwa-icons.mjs  # Zero-dependency PWA placeholder icon generator
├── notes/                      # Documentation (READ FIRST)
├── insights/                   # Hard-won debugging knowledge (check when stuck!)
│   ├── README.md               # Index of all insights
│   ├── workos-authkit-nextjs16/ # proxy.ts, initialAuth, header flow
│   ├── convex-workos-auth/     # ctx.auth.getUserIdentity() vs authKit.getAuthUser()
│   └── docker-playwright-mcp/  # Issue 1: --host 0.0.0.0 binding; Issue 2: Convex WebSocket patch
├── reference/                  # External reference codebases (read-only input for agents)
│   ├── README.md               # What this is, how to add new references
│   ├── {app-name}/             # Unzipped external codebase
│   ├── INVENTORY.md            # Agent-generated: screens, models, flows found
│   └── CORRELATION.md          # Agent-generated: mapping to Rental Platform OS docs
├── bugs/                       # Bug tracking (check before debugging!)
│   ├── README.md               # Bug index, severity/status definitions, template
│   └── BUG-NNN-slug.md         # Individual bug reports
├── verification/               # Test history (check before re-testing!)
│   ├── README.md               # Coverage map, what's tested vs not
│   └── {feature-area}.md       # Per-feature test results and DB verifications
├── AGENTS.md                   # This file
└── package.json
```

### shadcn/ui Component Inventory (`src/components/ui/`)

| Component            | File                         | Purpose                                                        |
| -------------------- | ---------------------------- | -------------------------------------------------------------- |
| Accordion            | `accordion.tsx`              | Expand/collapse sections — FAQ, checklist groups               |
| AlertDialog          | `alert-dialog.tsx`           | Confirmation dialogs — bulk actions, destructive operations    |
| AnimatedGradientText | `animated-gradient-text.tsx` | Animated gradient text treatment for hero/callout headings     |
| Avatar               | `avatar.tsx`                 | User/guard profile images with fallback initials               |
| Badge                | `badge.tsx`                  | Status badges (lead, visit, payout, listing, closure)          |
| BlurFade             | `blur-fade.tsx`              | Motion-based blur + fade reveal wrapper for staged entrances   |
| Button               | `button.tsx`                 | All buttons — variants: default, destructive, outline, ghost   |
| Calendar             | `calendar.tsx`               | Month grid (react-day-picker) — used inside DatePicker         |
| Card                 | `card.tsx`                   | Content containers — dashboard cards, detail panels            |
| Carousel             | `carousel.tsx`               | Embla-powered carousel primitives with next/prev controls      |
| Checkbox             | `checkbox.tsx`               | Boolean toggles — consent, filters, form fields                |
| Command              | `command.tsx`                | Command palette primitives (`cmdk`) with searchable actions    |
| DatePicker           | `date-picker.tsx`            | Popover + Calendar — replaces native `<input type="date">`     |
| Dialog               | `dialog.tsx`                 | Modal dialogs — create/edit forms, confirmations               |
| DropdownMenu         | `dropdown-menu.tsx`          | Context menus — action dropdowns                               |
| Form                 | `form.tsx`                   | react-hook-form integration — FormField, FormControl, etc.     |
| Input                | `input.tsx`                  | Text inputs — names, phone numbers, search                     |
| Label                | `label.tsx`                  | Form labels                                                    |
| Marquee              | `marquee.tsx`                | Auto-scrolling marquee container for repeated content strips   |
| NumberTicker         | `number-ticker.tsx`          | Animated count-up/count-down numeric display component         |
| Particles            | `particles.tsx`              | Canvas particle background effect with pointer interaction     |
| Popover              | `popover.tsx`                | Floating content — used by DatePicker                          |
| RadioGroup           | `radio-group.tsx`            | Single-choice groups — call outcomes, verification results     |
| Select               | `select.tsx`                 | Dropdown selects — filters, form fields, entity selection      |
| Separator            | `separator.tsx`              | Visual dividers                                                |
| Sheet                | `sheet.tsx`                  | Slide-out panels                                               |
| ShimmerButton        | `shimmer-button.tsx`         | Glow/shimmer CTA button variant for high-emphasis actions      |
| Slider               | `slider.tsx`                 | Range controls — rent calculator and filter ranges             |
| Skeleton             | `skeleton.tsx`               | Loading placeholders                                           |
| Sonner               | `sonner.tsx`                 | Toast notifications (wraps sonner)                             |
| Switch               | `switch.tsx`                 | Toggle switches                                                |
| Tabs                 | `tabs.tsx`                   | Tab navigation — guard detail, settings                        |
| Textarea             | `textarea.tsx`               | Multi-line text — notes, descriptions, rejection reasons       |
| TimePicker           | `time-picker.tsx`            | Select with time slots — replaces native `<input type="time">` |
| Toggle               | `toggle.tsx`                 | Two-state toggle button primitive (Radix Toggle)               |
| ToggleGroup          | `toggle-group.tsx`           | Multi-option toggle group primitive (single/multi select)      |
| Tooltip              | `tooltip.tsx`                | Hover tooltips                                                 |

**Convention**: All form inputs use shadcn/ui components. No native HTML `<select>`, `<textarea>`, `<input type="date/time/checkbox/radio">`. Use the components above.

## Agent Spawning Rules

**MANDATORY** — every subagent (Sisyphus Junior, Librarian, Explore, Oracle, Deep, Quick, etc.) is **stateless**. They know nothing about this project unless you tell them. Every `task()` prompt MUST include this preamble:

```
FIRST STEP: Read `AGENTS.md` in the project root. It contains the full project context — tech stack, personas, conventions, dev environment, routing rules, test accounts, and file structure. Do this before any other work.

This project uses OpenCode (NOT Claude Code). Skills live in `.opencode/skills/`. Load skills via `load_skills=["skill-name"]`.
```

**Why this is non-negotiable:**

- Subagents don't inherit the parent agent's context
- Without `AGENTS.md`, they'll guess at conventions and get them wrong (phone formats, money in paise, synthetic emails, auth patterns, route groups)
- Without the OpenCode line, they'll assume non-OpenCode conventions and produce broken skill references
- 30 seconds of reading saves 10 minutes of wrong output

**Checklist for every `task()` call:**

- [ ] Prompt includes "Read `AGENTS.md` first" instruction
- [ ] Prompt states "OpenCode, not Claude Code"
- [ ] Prompt specifies `.opencode/skills/` as the skills directory
- [ ] Relevant skills passed via `load_skills=[...]`

## Sub-Agent Performance Rules (MANDATORY)

**Every sub-agent (deep, quick, visual-engineering, ultrabrain, etc.) MUST maximize parallel tool calls.** Sequential tool calls are the #1 cause of slow agent execution. The orchestrator MUST include the following instruction block in every `task()` prompt:

### Parallel Tool Call Mandate

Include this verbatim in every `task()` prompt to sub-agents:

```
**PERFORMANCE RULE — PARALLEL TOOL CALLS (NON-NEGOTIABLE):**
You MUST make tool calls in parallel whenever the calls are independent. This is the single biggest performance optimization available to you.

- **Reading multiple files?** Call Read on ALL of them in ONE message — not one at a time.
- **Searching for multiple patterns?** Fire ALL Grep/Glob calls in ONE message.
- **Reading a file + checking diagnostics?** Do both in ONE message.
- **Multiple independent edits?** Make ALL Edit calls in ONE message.

SEQUENTIAL tool calls are ONLY acceptable when:
1. Call B depends on the RESULT of Call A (e.g., you need a file path from Glob before you can Read it)
2. An edit must be verified before the next edit (chained dependency)

**WRONG (sequential — wastes 5x the time):**
Message 1: Read file A → wait
Message 2: Read file B → wait
Message 3: Read file C → wait

**CORRECT (parallel — all resolve in one round-trip):**
Message 1: Read file A + Read file B + Read file C → wait once

This applies to ALL tool types: Read, Grep, Glob, Edit, Bash, LSP diagnostics, etc.
Before every message, ask yourself: "Are any of these calls independent?" If yes, batch them.
```

### Why This Is Non-Negotiable

- Each sequential tool call adds a full LLM round-trip (~3-10 seconds)
- 5 sequential reads = 15-50 seconds. 5 parallel reads = 3-10 seconds. **5x speedup.**
- Sub-agents routinely read 6-10 files per task. Without parallelism, this alone burns 1-2 minutes doing nothing.
- The orchestrator's context window is expensive — faster sub-agents mean less orchestrator wait time.

### Git Stash Ban

Include this verbatim in every `task()` prompt to sub-agents:

```
**GIT SAFETY RULE — STASH IS BANNED (NON-NEGOTIABLE):**
NEVER use `git stash`, `git stash pop`, or `git stash apply`. These commands are BANNED.
Agents consistently lose or corrupt work with stash operations.

If you need to save work-in-progress:
- Use `git commit -m "wip: [description]"` instead
- You can undo it later with `git reset --soft HEAD~1`

This is a hard rule. No exceptions. No "just this once." NEVER stash.
```

### Why This Is Non-Negotiable

Multiple agents share a single working tree (no git worktrees). `git stash` is a shared, anonymous LIFO stack with no ownership or locking:

1. Agent A stashes → `stash@{0}` is A's work
2. Agent B stashes → `stash@{0}` is now B's work; A's shifted to `stash@{1}`
3. Agent A runs `git stash pop` → pops **B's stash**, not its own. A's work is buried or conflicting.

Why this is unfixable:

- Stashes have no owner — no "my stash" vs "your stash"
- Stashes are invisible to `git log` — other agents can't see them
- The LIFO index shifts every time ANY agent pushes/pops — indices are unstable
- Even a single agent forgets it stashed; multiple agents make it exponentially worse
- A WIP commit is visible in `git log`, recoverable, and unambiguous — stash is none of those
- This rule exists because agents have destroyed work **multiple times** with stash

## Agent Safety Rules

| Rule                                  | Details                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Commit before destructive ops**     | ALWAYS commit before moving, renaming, or deleting files. Agents must never `rm`, `mv`, or overwrite files that haven't been committed. If the operation fails, there's no recovery without a commit to revert to.                                                                                                                                                                 |
| **NEVER use git stash**               | `git stash`, `git stash pop`, `git stash apply` are **BANNED**. Agents consistently lose or corrupt work with stash operations. Multiple agents share one working tree — stash is a shared LIFO stack with no ownership, so agents pop each other's stashes. Use `git commit -m "wip: ..."` to save work-in-progress instead (undo with `git reset --soft HEAD~1`). No exceptions. |
| **No file moves without build check** | After moving/renaming any file, run `npm run build` immediately. Route changes in Next.js App Router are especially fragile — route groups `(name)/` don't add URL segments, so `(guard)/dashboard/` and `(admin)/dashboard/` both resolve to `/dashboard` and will conflict.                                                                                                      |
| **Verify before cleanup**             | Never delete "old" files until the new location is verified working (build + tests pass).                                                                                                                                                                                                                                                                                          |

## Dev Environment

### Starting the Codebase

```bash
npm run dev:force    # Kill ports 3000/3210/6790, then start frontend + backend
npm run seed         # Seed roles, users, system config (run once after fresh DB)
npx convex run seedDemo:seedMega  # Seed demo data (28 core tables, 11 users, 200+ records)
```

- Frontend: http://localhost:3000 (must be port 3000 — WorkOS redirect URI is hardcoded)
- Convex backend: http://127.0.0.1:3210
- Convex dashboard: http://127.0.0.1:6790

### Agent Dev Server Start Guide

Agents that need a running server (e.g. for Playwright verification) should follow this sequence:

```bash
# 1. Kill any stale processes and clear lock files
lsof -ti:3000,3210,6790 | xargs kill -9 2>/dev/null
sleep 1
rm -f .next/dev/lock

# 2. Start Convex backend (background, with log capture)
npx convex dev > /tmp/convex-dev.log 2>&1 &
sleep 8

# 3. Run seed (idempotent — safe to run repeatedly, prints "Already seeded" if done)
npx convex run seed:init

# 4. Start Next.js frontend (background, with log capture)
npx next dev -p 3000 > /tmp/next-dev.log 2>&1 &
sleep 8

# 5. Verify both are running
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000   # expect 200
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3210   # expect 200 or connection
```

**Troubleshooting:**

| Symptom                                   | Fix                                                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Unable to acquire lock` on Next.js start | `rm -f .next/dev/lock` then retry                                                                                                                                                                     |
| Port 3000 already in use                  | `lsof -ti:3000 \| xargs kill -9` then retry                                                                                                                                                           |
| `Internal Server Error` on all routes     | Likely two Next.js processes running — kill all on port 3000, restart one                                                                                                                             |
| `withAuth` errors or auth not working     | See `insights/` — solved, documented there                                                                                                                                                            |
| Seed fails with "Already seeded"          | This is normal — seed is idempotent                                                                                                                                                                   |
| Docker browser pages stuck on spinners    | Convex WebSocket issue — see `insights/docker-playwright-mcp/` Issue 2. Apply the `addInitScript` monkey-patch from `.opencode/skills/browser-automation/SKILL.md` → "Convex WebSocket Patch" section |

**Log locations:** `/tmp/convex-dev.log` (backend), `/tmp/next-dev.log` (frontend). Check these when debugging server errors.

**Stuck on a bug for 15+ minutes?** Check `insights/README.md` first — previous debugging sessions are documented there.

**Important:** The frontend MUST run on port 3000. The WorkOS redirect URI (`http://localhost:3000/callback`) is hardcoded in both `.env.local` and the WorkOS dashboard. If Next.js starts on another port, auth callbacks will fail.

### Dev Test Accounts

All credentials are also in `.env.example`. Use the `/dev/login` page (dev mode only).

Rows marked with `(via seedDemo)` are created by `npx convex run seedDemo:seedMega` (`convex/seedDemo.ts`).

| Persona                        | Email                           | Password        | Role        | Login URL                       |
| ------------------------------ | ------------------------------- | --------------- | ----------- | ------------------------------- |
| **Test Admin**                 | `admin@example.com`            | `DevAdmin123!`  | Super Admin | http://localhost:3000/dev/login |
| **Agent Bot**                  | `agent@example.com`             | `DevAgent123!`  | Super Admin | http://localhost:3000/dev/login |
| **Test Guard**                 | `9999999999@guards.local`     | `DevGuard123!`  | Guard       | http://localhost:3000/dev/login |
| **Guard 2** (via seedDemo)     | `9876543210@guards.local`     | `DevGuard123!`  | Guard       | http://localhost:3000/dev/login |
| **Guard 3** (via seedDemo)     | `9765432109@guards.local`     | `DevGuard123!`  | Guard       | http://localhost:3000/dev/login |
| **Test OPS**                   | `8888888888@ops.local` | `DevOps123!`    | OPS         | http://localhost:3000/dev/login |
| **OPS 2** (via seedDemo)       | `7777777777@ops.local` | `DevOps123!`    | OPS         | http://localhost:3000/dev/login |
| **Test Tenant** (via seedDemo) | `tenant1@test.demorentals.com`      | `DevTenant123!` | Tenant      | http://localhost:3000/dev/login |
| **Tenant 2** (via seedDemo)    | `tenant2@test.demorentals.com`      | `DevTenant123!` | Tenant      | http://localhost:3000/dev/login |
| **Test Owner** (via seedDemo)  | `owner1@test.demorentals.com`       | `DevOwner123!`  | Owner       | http://localhost:3000/dev/login |
| **Owner 2** (via seedDemo)     | `owner2@test.demorentals.com`       | `DevOwner123!`  | Owner       | http://localhost:3000/dev/login |

After login, admins land on `/admin/dashboard`, guards land on `/guard/dashboard`.

The `/dev/login` page has preset buttons for "Test Admin" and "Test Guard". For the Agent Bot account, use the manual email/password form.

### Demo Data Seeding

The project includes a comprehensive demo data seeder that populates core tables with realistic interconnected test data.

```bash
# Seed base infrastructure + core demo data (idempotent, safe to re-run)
npx convex run seedDemo:seedMega

# Or run base seed only (roles, config, core users)
npx convex run seed:init
```

The mega seed creates (28 core tables):

- **11 users** across all 5 personas (Admin, Guard, OPS, Tenant, Owner)
- **3 societies** with 4 buildings total (Test Society, Sunshine Heights, Green Valley)
- **15 leads** across all statuses (SUBMITTED, NEED_INFO, VERIFIED, REJECTED, DUPLICATE, POTENTIAL_DUPLICATE)
- **6 listings** (4 PUBLISHED, 1 DRAFT, 1 ARCHIVED) with roommate profiles, commute landmarks, and inquiries
- **8 tenant inquiries** across the full lifecycle
- **8 visits** across all statuses with outcomes
- **3 closures** (PENDING, CONFIRMED, CANCELLED)
- **5 payouts** across all statuses with payout adjustments
- **Complete engagement data**: referral codes, referrals, milestones, chat channels, messages, support inquiries, owner service requests, newsletter subscriptions
- **OPS data**: checklist instances, document requirements, regulatory items, quality score history, guard streaks, incentive cards
- **RM data**: owner-RM assignments, check-ins
- **Analytics**: 3 days of snapshots

**NOT seeded** (54 tables): Transaction/notification/monetization families (rental_transactions, rental_agreements, kyc_packets, token_bookings, deposit_records, handover_checklists, notifications, notification_preferences, notification_templates, notification_events, push_subscriptions), gamification (gamification_profiles, gamification_quests, user_quest_progress), commission/attribution (commission_modifier_templates, deal_commission_evaluations, deal_contributions, attribution_records, attribution_splits, incentive_disbursements, incentive_actor_profiles, revenue_line_items, transaction_fees, shadow_mode_deltas), monetization (promoted_listings, tenant_passes, partner_services, service_bundles), and other advanced features (deal_checklist_signatures, negotiation_terms_proposals, negotiation_terms_signatures, negotiation_token_records, listing_trust_badges, deal_checklists, owner_invites, checklist_templates, rental_agreements, listing_photos).

The seeder is fully idempotent — safe to run multiple times without duplicating data.

### WorkOS User IDs (for reference)

These are hardcoded in `convex/seed.ts`. If you need to re-create WorkOS users, use the WorkOS REST API with the API key from `.env.local`:

| User       | WorkOS ID                         |
| ---------- | --------------------------------- |
| Test Admin | `user_01ADMIN0000000000000000000` |
| Agent Bot  | `user_01AGENT0000000000000000000` |
| Test Guard | `user_01GUARD0000000000000000000` |
| Test OPS   | `user_01OPSXX0000000000000000000` |

## Next.js App Router Routing

Route groups `(name)/` provide **shared layouts without adding URL segments**. This means:

- `src/app/(guard)/dashboard/page.tsx` → URL: `/dashboard` (NOT `/guard/dashboard`)
- `src/app/(admin)/dashboard/page.tsx` → URL: `/dashboard` (CONFLICT!)

**Correct pattern** for portal pages that need URL prefixes:

```
src/app/
  (auth)/                        # Route group: no layout, no URL segment
    guard/login/page.tsx         → /guard/login
    admin/login/page.tsx         → /admin/login
  (guard)/                       # Route group: guard layout, no URL segment
    layout.tsx                   # Guard portal layout (nav, auth check)
    guard/                       # Real directory: adds /guard/ to URL
      dashboard/page.tsx         → /guard/dashboard
      leads/page.tsx             → /guard/leads
  (admin)/                       # Route group: admin layout, no URL segment
    layout.tsx                   # Admin panel layout (sidebar, auth check)
    admin/                       # Real directory: adds /admin/ to URL
      dashboard/page.tsx         → /admin/dashboard
      roles/page.tsx             → /admin/roles
```

## Internationalization (i18n) Architecture

Guard portal is fully translated using `next-intl` v4.8 in **non-routing mode** (no `/en/`, `/hi/` URL segments). Admin panel is English-only.

### Core Concepts

| Concept              | Implementation                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- |
| **Library**          | `next-intl` v4.8.3                                                                       |
| **Mode**             | Non-routing — locale from cookie, no URL segments, no middleware integration             |
| **Locales**          | `en` (English), `hi` (Hindi/Devanagari), `hinglish` (Roman script, casual)               |
| **Locale storage**   | `locale` cookie (server-readable) + `localStorage` key `"locale"` (client sync)          |
| **Default locale**   | `en` (English) — used when no cookie is set                                              |
| **Translation keys** | 271 keys across 14 namespaces, all under `"guard"` top-level object                      |
| **Scope**            | Guard portal + guard auth pages ONLY. Admin/public/tenant layouts have NO i18n provider. |

### File Map

| File                                        | Role                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/i18n/request.ts`                       | Server-side config — reads `locale` cookie, loads messages, defines named formats            |
| `next.config.ts`                            | Plugin wrapping: `withSerwist(withNextIntl(nextConfig))` — Serwist outside, next-intl inside |
| `messages/en.json`                          | English translations (271 keys)                                                              |
| `messages/hi.json`                          | Hindi translations (Devanagari script, 271 keys, identical key structure)                    |
| `messages/hinglish.json`                    | Hinglish translations (Roman script, casual tone, 271 keys, identical key structure)         |
| `src/app/(guard)/layout.tsx`                | Guard layout — `NextIntlClientProvider` wrapping all guard pages                             |
| `src/app/(auth)/guard/layout.tsx`           | Guard auth layout — `NextIntlClientProvider` for login + change-password                     |
| `src/components/guard/LanguageSelector.tsx` | 3-button toggle (English / हिन्दी / Hinglish) using `LANGUAGE_PREFERENCE` constants          |
| `lib/constants.ts`                          | `LANGUAGE_PREFERENCE` enum: `{ en: "en", hi: "hi", hinglish: "hinglish" }`                   |
| `convex/guards.ts`                          | `updateMyLanguage` mutation — stores preference in `guard_profiles.language_preference`      |

### Translation Namespace Structure

All keys live under the `"guard"` top-level object in each `messages/*.json` file:

| Namespace              | Keys | What it covers                                                                         |
| ---------------------- | ---- | -------------------------------------------------------------------------------------- |
| `guard.nav`            | 5    | Bottom nav labels (home, addLead, myLeads, myVisits, earnings)                         |
| `guard.ruleBanner`     | 1    | Rule banner text                                                                       |
| `guard.login`          | 16   | Guard login page (labels, placeholders, validation, buttons)                           |
| `guard.changePassword` | 13   | Change password page                                                                   |
| `guard.dashboard`      | 14   | Guard dashboard (welcome, stats, CTA)                                                  |
| `guard.submitLead`     | 53   | Submit lead form + rate-limit + success screens                                        |
| `guard.leads`          | 50   | Lead list, detail, filter tabs, need-info form                                         |
| `guard.visits`         | 35   | Visit list, detail, execution, outcome selector                                        |
| `guard.earnings`       | 24   | Earnings summary, payout cards                                                         |
| `guard.profile`        | 15   | Profile page, guard type labels                                                        |
| `guard.shifts`         | 2    | Shifts page                                                                            |
| `guard.onboarding`     | 10   | Onboarding carousel steps                                                              |
| `guard.status`         | 24   | All status label translations (lead, visit, payout, closure, listing, guard)           |
| `guard.common`         | 9    | Shared UI words (loading, error, retry, cancel, save, confirm, back, noData, loadMore) |

### How to Use in Components

**Client components (guard portal):**

```typescript
"use client";
import { useTranslations, useFormatter } from "next-intl";

export default function MyComponent() {
  const t = useTranslations("guard.leads");   // namespace
  const format = useFormatter();

  return (
    <div>
      {/* Simple string */}
      <h1>{t("title")}</h1>

      {/* ICU interpolation */}
      <p>{t("buildingFloor", { building: "Tower A", floor: "5", flat: "501" })}</p>

      {/* Currency (paise → rupees, named format) */}
      <span>{format.number(amountInPaise / 100, "inr")}</span>

      {/* Date (Unix ms → short format) */}
      <span>{format.dateTime(new Date(timestampMs), "short")}</span>

      {/* Relative time */}
      <span>{format.relativeTime(new Date(timestampMs))}</span>
    </div>
  );
}
```

**Named formats** (defined in `src/i18n/request.ts`):

| Name      | Type       | Output example                               |
| --------- | ---------- | -------------------------------------------- |
| `"inr"`   | `number`   | `₹25,000` (no decimals, INR currency symbol) |
| `"short"` | `dateTime` | `17 Feb 2026` (day, short month, year)       |

### Locale Flow (How Language Changes Propagate)

```
Guard picks language in profile page
  → calls updateMyLanguage mutation (saves to DB)
  → sets document.cookie "locale={value}" (server-readable)
  → sets localStorage "locale" (client sync)
  → sets localStorage "hasChosenLanguage" = "true"
  → calls router.refresh() (triggers server re-render with new locale)

On page load (src/i18n/request.ts):
  → reads "locale" cookie via next/headers cookies()
  → validates against SUPPORTED_LOCALES
  → falls back to "en" if invalid/missing
  → loads messages/{locale}.json
  → returns { locale, messages, formats }

Guard layout client (guard-layout-client.tsx):
  → on mount, compares guard_profiles.language_preference (DB) vs cookie
  → if different (new device), syncs cookie + localStorage to match DB
  → calls router.refresh() to apply
```

### Shared Status Badges Pattern

Shared badge components (`src/components/shared/*-status-badge.tsx`) are used in BOTH guard portal (translated) and admin panel (English only). They use an **optional `label` prop**:

```typescript
type Props = {
  status: LeadStatus;
  label?: string;  // Optional — when provided, overrides the hardcoded English label
};

export function LeadStatusBadge({ status, label }: Props) {
  const displayLabel = label ?? LEAD_STATUS_LABELS[status]; // fallback to English
  return <Badge>{displayLabel}</Badge>;
}
```

**In guard pages** (translated): pass `label={t("status.SUBMITTED")}` from the guard component.
**In admin pages** (English): omit `label` prop — the hardcoded English fallback renders.

### Adding New Guard Translation Keys

When adding a new guard page or component:

1. **Add keys** to ALL 3 files: `messages/en.json`, `messages/hi.json`, `messages/hinglish.json`
2. **Use the same namespace pattern**: nest under `"guard"` → `"yourFeature"` → `"keyName"`
3. **Maintain key parity**: all 3 files MUST have identical key structures. Validate:
   ```bash
   node -e "
   const en = JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));
   const hi = JSON.parse(require('fs').readFileSync('messages/hi.json','utf8'));
   const hl = JSON.parse(require('fs').readFileSync('messages/hinglish.json','utf8'));
   const keys = (o, p='') => Object.entries(o).flatMap(([k,v]) => typeof v==='object' ? keys(v,p+k+'.') : [p+k]);
   console.log('en===hi:', keys(en).sort().join() === keys(hi).sort().join());
   console.log('en===hl:', keys(en).sort().join() === keys(hl).sort().join());
   "
   ```
4. **ICU message format** for dynamic values: `{name}`, `{count, plural, one {# item} other {# items}}`, `{status, select, active {Active} other {Inactive}}`
5. **Hindi (hi.json)**: Devanagari script, formal tone. Brand names ("Rental Platform OS", "DemoRentals") stay in Roman script.
6. **Hinglish (hinglish.json)**: Roman script, casual WhatsApp-style tone. Mix Hindi words with English.
7. **No comments in JSON** — JSON doesn't support comments.

### What NOT to Translate

| Category                                  | Why                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Admin panel**                           | English-only per spec. No `NextIntlClientProvider` in admin layout.                                   |
| **Public/tenant pages**                   | Not in i18n scope yet (future phase).                                                                 |
| **Server actions** (`actions.ts`)         | Run outside React component tree — `useTranslations()` hook unavailable. Error messages stay English. |
| **HTML metadata** (`<title>`, `<meta>`)   | SEO/browser tab titles. Stay English.                                                                 |
| **Convex backend**                        | All backend code is English-only.                                                                     |
| **Timezone constants** (`"Asia/Kolkata"`) | Technical constants, not UI strings.                                                                  |
| **Emojis**                                | Universal — kept as-is in all locales.                                                                |
| **`src/proxy.ts`**                        | AuthKit middleware proxy — do NOT touch.                                                              |

### Import Quick Reference

| What                                           | Import                    |
| ---------------------------------------------- | ------------------------- |
| `createNextIntlPlugin`                         | `from "next-intl/plugin"` |
| `getRequestConfig`                             | `from "next-intl/server"` |
| `getMessages`, `getLocale`, `getTranslations`  | `from "next-intl/server"` |
| `NextIntlClientProvider`                       | `from "next-intl"`        |
| `useTranslations`, `useFormatter`, `useLocale` | `from "next-intl"`        |

### Provider Nesting Order

**Guard portal layout** (`src/app/(guard)/layout.tsx`):

```
ConvexClientProvider
  └── NextIntlClientProvider (messages={await getMessages()})
        └── GuardLayoutInner (nav, rule banner, auth checks)
              └── {children} (page content)
```

**Guard auth layout** (`src/app/(auth)/guard/layout.tsx`):

```
NextIntlClientProvider (messages={await getMessages()})
  └── {children} (login page, change-password page)
```

**Admin layout**: NO `NextIntlClientProvider`. English hardcoded.

### First-Login Language Prompt

After a guard changes their temporary password for the first time, a dialog prompts them to choose a language. This is tracked via `localStorage.getItem("hasChosenLanguage")`:

- If `"true"` → skip prompt, redirect to dashboard
- If absent → show language dialog with `LanguageSelector` component
- On selection or skip → sets `hasChosenLanguage = "true"`, sets cookie, redirects to dashboard

Implementation: `src/app/(auth)/guard/change-password/page.tsx` — `Dialog` component with `LanguageSelector`.

## Key Conventions

| Rule                      | Details                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phone numbers**         | 10 digits only. Strip all formatting. Add `+91` for display only.                                                                                              |
| **Money**                 | Always paise (integer × 100). ₹25,000 = `2500000`. No floats.                                                                                                  |
| **Dates**                 | Unix milliseconds (`Date.now()`). No string dates.                                                                                                             |
| **Soft delete**           | `is_deleted: boolean`. Never hard-delete. Filter in queries.                                                                                                   |
| **Guard auth**            | Synthetic email: `{phone}@guards.local`. WorkOS email+password.                                                                                              |
| **OPS auth**              | Synthetic email (`{phone}@ops.local`) phone+password flow, plus optional Google SSO for OPS accounts created with real email.                         |
| **OPS admin access**      | OPS users can access `/admin/*` — sidebar filtered by permissions. `requireBackoffice()` for shared admin/ops backend checks.                                  |
| **Backoffice access**     | `requireBackoffice(ctx)` for shared admin/OPS read paths. `requireAdmin(ctx)` for admin-only management. `requirePermission(ctx, perm)` for mutation gates.    |
| **Admin auth**            | Google SSO via WorkOS AuthKit.                                                                                                                                 |
| **Tenant auth**           | Google SSO via WorkOS AuthKit. Same flow as admin, different `user_type`.                                                                                      |
| **Owner auth**            | Google SSO via WorkOS AuthKit. Same flow as admin, different `user_type`.                                                                                      |
| **External APIs**         | Only in Convex Actions (`convex/actions/`). Never in mutations/queries.                                                                                        |
| **Notification dispatch** | Mutations/queries enqueue events; channel delivery runs via async Convex Action callbacks (`convex/actions/notifications.ts`) with retry/dead-letter handling. |
| **Status transitions**    | Always validate against `04-state-machines.md`. Never skip.                                                                                                    |
| **Type safety**           | No `as any`, no `@ts-ignore`, no `@ts-expect-error`. Ever.                                                                                                     |
| **Forms**                 | `react-hook-form` + `zod` for validation.                                                                                                                      |
| **Toasts**                | `sonner` for all notifications.                                                                                                                                |
| **i18n**                  | Guard portal: `next-intl` with 3 locales. Admin panel: hardcoded English. See [i18n Architecture](#internationalization-i18n-architecture).                    |
| **PWA architecture**      | Separate installable manifests for guard/admin portals. Tier 1 includes installability + static caching only (no push/sync queue).                             |

## Task System

All implementation tasks live in `tasks/`. See [tasks/README.md](tasks/README.md) for:

- **Phase roadmap**: All 23 phases with scope boundaries and dependencies
- **Hierarchy**: Phase (`P01`) → Epic (`P01-E01`) → Task (`P01-E01-T01`)
- **Execution workflow**: How agents pick up and run tasks
- **Epic file format**: YAML frontmatter + task sections with verification

### Implementation Priority

Follow this order (detailed breakdown in `tasks/README.md`):

1. Auth (WorkOS) + Guard profile + Admin accounts + RBAC skeleton
2. Society registry (societies + buildings)
3. Guard management (CRUD, types, shifts)
4. Lead submission + lead queue + de-dup flagging
5. Owner verification + lead status transitions
6. Listings (creation, photos, public page SSR)
7. Visit scheduling + guard assignment + execution
8. Closure + document upload + payout lifecycle
9. Payout management + guard earnings view
10. Incentive system (cards/badges)
11. Quality scoring + rate limits + ban controls
12. Analytics dashboards
13. Audit trail viewer
14. i18n (Hindi + Hinglish)
15. Public pages (homepage, how-it-works, contact hub)
16. Tenant browse (listings directory, search, filter, sort)
17. Property detail (gallery, pricing, amenities, commute, roommates)
18. Tenant tools (rent calculator, commute estimator, roommate quiz, checklist)
19. Tenant inquiry pipeline (inquiry → bounty → guard visit → closure)
20. Owner services (landing page, contact form, request tracking)
21. Admin tenant management (inquiry CRM, owner requests, support inbox)
22. Referral system (guard-to-guard + DemoRentals tenant/owner referrals, milestone bonuses)
23. Deal communication room + rent negotiation (reference-only umbrella phase; split into P24-P26)
24. Chat Infrastructure (P24)
25. Deal Room Features (P25)
26. Rent Negotiation (P26)
27. Admin panel polish and completeness (P27)
28. Admin power tools (P28)
29. Ops intelligence (P29)
30. Field ops platform (P30)
31. Owner entity & RM foundation (P31)
32. Incentive v3 (P32)
33. Trust & verification display (P33)
34. Transaction completion rails (P34)
35. Notification infrastructure (P35)
36. Monetization foundation (P36)
37. Post-move-in lifecycle (P37)
38. Owner portal & dashboard (P38)
39. Tenant trust score & reviews (P39)
40. AI intelligence spine (P40)
41. Supply channel diversification (P41)
42. Financial products & insurance (P42)
43. Tenant portal (P43)
44. OPS superset expansion (P44)
45. Multi-persona identity model (P45)
46. CEO ops command center (P46)
47. Voice-to-text notes (P48)

## Available Skills

Load these via `load_skills=["skill-name"]` when delegating to subagents.

| Skill                | What It Does                                                                                                                                                                    | When to Load                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `doc-navigator`      | Find, write, and maintain docs + cross-linking                                                                                                                                  | Finding docs, writing new docs, maintaining links                        |
| `task-planner`       | Create and execute Phase/Epic/Task specs                                                                                                                                        | Planning work or implementing a task                                     |
| `rental-platform-os-rules`   | All hard conventions (data formats, status transitions, auth, imports)                                                                                                          | Writing ANY code                                                         |
| `rental-platform-os-arch`    | Architecture patterns (functions.ts, auth helpers, Actions, HTTP Router, file upload)                                                                                           | Implementing Convex functions                                            |
| `convex-api`         | Convex platform API reference (validators, queries, indexes, pagination, storage, components)                                                                                   | Writing ANY Convex function — the API cheat sheet                        |
| `doc-reconciler`     | Detect and fix doc drift against code — truth map, audit workflow, compliance checks                                                                                            | After implementing features, periodic audits, creating new docs          |
| `reference-parser`   | Parse external codebases, extract features, correlate to Rental Platform OS docs, extend task plan                                                                                      | When reference code is added to `reference/` and needs ingestion         |
| `verification-agent` | Systematic feature verification via Playwright + Context7 + code inspection. Templates in `references/`                                                                         | Verifying implemented features, debugging, writing bug reports           |
| `bug-tracker`        | Track, file, look up, and manage bugs in `bugs/` — report format, severity, status lifecycle                                                                                    | Filing bugs, checking known bugs before debugging, updating status       |
| `bug-reporter`       | Two-way bug workflow — report bugs via branch+PR from any checkout, and import/validate/merge incoming bug PRs into master list                                                 | Co-dev filing bugs via PR, or maintainer importing bug PRs into main     |
| `test-history`       | Record and query test history in `verification/` — coverage map, dedup protocol, result recording                                                                               | Recording test results, checking what's been tested, avoiding re-testing |
| `skill-writer`       | OpenCode skill format, YAML frontmatter, best practices                                                                                                                         | Creating or updating skills                                              |
| `browser-automation` | Docker parallel browser pool — replaces `playwright` skill for Docker pool usage. Includes Playwright tool patterns, URL rewriting, claim protocol, **Convex WebSocket patch**. | Any browser-based verification when Docker pool MCPs are available       |

## Browser-Based Verification (Orchestrator Guide)

When spawning sub-agents that need a browser (verification, testing, debugging UI), the orchestrator MUST follow this decision tree.

### Step 1: Check Which Browser MCPs Are Available

| MCP Name         | Type                     | When Available                                           |
| ---------------- | ------------------------ | -------------------------------------------------------- |
| `browser-pool-1` | Docker isolated Chromium | Docker containers running + MCP enabled in opencode.json |
| `browser-pool-2` | Docker isolated Chromium | Docker containers running + MCP enabled in opencode.json |
| `browser-pool-3` | Docker isolated Chromium | Docker containers running + MCP enabled in opencode.json |
| `playwright`     | Shared single browser    | Always available (built-in)                              |

**Preference order: Docker pool MCPs first, `playwright` as fallback.**

### Step 2: Choose Skill Based on Available MCPs

| Docker Pool MCPs Available?           | Skill to Load        | MCP to Use                                           | Max Parallel Agents |
| ------------------------------------- | -------------------- | ---------------------------------------------------- | ------------------- |
| YES (browser-pool-N visible in tools) | `browser-automation` | `browser-pool-1`, `browser-pool-2`, `browser-pool-3` | 3 (one per pool)    |
| NO (only playwright visible)          | `playwright`         | `playwright`                                         | 1 (sequential only) |

**NEVER load both `browser-automation` and `playwright` on the same sub-agent.** They contain conflicting MCP routing instructions. The `browser-automation` skill already includes all Playwright tool patterns — it fully replaces `playwright`.

### Step 3: Spawn Sub-Agents With Explicit MCP Assignment

**With Docker Pool (parallel — up to 3 agents):**

```typescript
task(
  (category = "deep"),
  (load_skills = ["browser-automation", "verification-agent", "rental-platform-os-rules"]),
  (prompt = `FIRST STEP: Read AGENTS.md in the project root.

You are assigned browser-pool-1. Use mcp_name='browser-pool-1' for ALL browser
tool calls via skill_mcp. All URLs must use host.docker.internal:3000 instead of
localhost:3000. Claim your browser before use (see claim protocol in browser-automation skill).

[your verification task here]`),
);

task(
  (category = "deep"),
  (load_skills = ["browser-automation", "verification-agent", "rental-platform-os-rules"]),
  (prompt = `FIRST STEP: Read AGENTS.md in the project root.

You are assigned browser-pool-2. Use mcp_name='browser-pool-2' for ALL browser
tool calls via skill_mcp. All URLs must use host.docker.internal:3000 instead of
localhost:3000. Claim your browser before use (see claim protocol in browser-automation skill).

[your verification task here]`),
);
```

**Without Docker Pool (sequential — 1 agent at a time):**

```typescript
task(
  (category = "deep"),
  (load_skills = ["playwright", "verification-agent", "rental-platform-os-rules"]),
  (prompt = `FIRST STEP: Read AGENTS.md in the project root.

Use mcp_name='playwright' for all browser tool calls via skill_mcp.
Use localhost:3000 for all URLs. You are the ONLY agent using the browser —
do not spawn parallel browser agents.

[your verification task here]`),
);
```

### Step 4: Browser Claim Protocol (ALL Browsers)

**Every browser — Docker pool AND shared playwright — must be claimed before use.** This prevents two agents from corrupting each other's browser state.

#### Claim (Before Any Browser Work)

```
1. List tabs → check if tab 0 title contains "CLAIMED:{other_agent}"
2. If claimed by another agent → STOP, do not use this browser
3. If free → navigate tab 0 to: data:text/html,<title>CLAIMED:{your_session_id}</title>
4. Open a new tab for your work
```

#### Release (When Done With Browser)

```
1. Close all your work tabs
2. Select tab 0
3. Navigate to: data:text/html,<title>FREE</title>
```

#### Why This Applies to Shared Playwright Too

Even the shared `playwright` MCP can be accidentally used by two agents if an orchestrator spawns a background task while another is running. The claim marker makes it immediately visible when a browser is in use.

### Docker Pool Setup

```bash
.opencode/skills/browser-automation/scripts/pool.sh start   # Start 3 Docker Playwright containers
.opencode/skills/browser-automation/scripts/pool.sh status   # Check health
.opencode/skills/browser-automation/scripts/pool.sh stop     # Tear down
```

| MCP Name         | Port | Endpoint                  | Docker Container |
| ---------------- | ---- | ------------------------- | ---------------- |
| `browser-pool-1` | 8931 | http://localhost:8931/mcp | pw-pool-1        |
| `browser-pool-2` | 8932 | http://localhost:8932/mcp | pw-pool-2        |
| `browser-pool-3` | 8933 | http://localhost:8933/mcp | pw-pool-3        |

MCPs are configured in `~/.config/opencode/opencode.json`. Enable before verification work, disable when done to save tokens.

### URL Rewriting Rule

| Browser Type                   | Base URL                           |
| ------------------------------ | ---------------------------------- |
| Docker pool (`browser-pool-N`) | `http://host.docker.internal:3000` |
| Shared (`playwright`)          | `http://localhost:3000`            |

Docker containers cannot reach `localhost` on the host. `host.docker.internal` is Docker's host gateway.

### Troubleshooting

If Docker containers start but MCP connections fail in OpenCode, see `insights/docker-playwright-mcp/README.md`. The most common issue is the server binding to loopback inside Docker — fixed by `--host 0.0.0.0` in the container start command (already handled in `pool.sh`).

OpenCode MCP logs: `~/.local/share/opencode/log/` — search for `browser-pool` to see connection status.

### Convex WebSocket Patch (MANDATORY for Docker Browser Testing)

Docker browsers load Next.js pages fine via `host.docker.internal:3000`, but the Convex SDK's client-side JS tries to connect to `ws://127.0.0.1:3210` (baked into the bundle from `NEXT_PUBLIC_CONVEX_URL`). Inside Docker, `127.0.0.1` is the container's loopback — nothing there. **Result: ALL Convex-powered pages show loading spinners forever.**

**Fix**: Monkey-patch `WebSocket`/`fetch` via Playwright `addInitScript` to rewrite `127.0.0.1:3210` → `host.docker.internal:3210`. Run ONCE per browser pool BEFORE any page navigation.

- **Full patch code + usage instructions**: `.opencode/skills/browser-automation/SKILL.md` → "Convex WebSocket Patch" section
- **Root cause analysis + debugging checklist**: `insights/docker-playwright-mcp/README.md` → Issue 2
- **When to apply**: Every time Docker browser pools are used for testing Convex-powered pages (which is every page in this app)
- **Orchestrator pattern**: Pre-install the patch on all 3 pools via `browser_run_code` BEFORE spawning sub-agents

## Documentation Maintenance

### Cross-Linking Convention

All docs use standard markdown links for cross-references:

```markdown
<!-- Within notes/ — relative paths -->

See [Auth Architecture](notes/01-tech-stack.md#authentication-architecture).

<!-- From tasks/ or root — include path prefix -->

See [Auth Architecture](notes/01-tech-stack.md#authentication-architecture).
```

Section anchors are auto-generated from headers: lowercase, spaces → hyphens.

### Link Maintenance Rules

**When you rename a file or section header, you MUST grep and update all references:**

```bash
# Find all references to a file
grep -rn "old-filename.md" notes/ tasks/ AGENTS.md .opencode/skills/

# Find all references to a section anchor
grep -rn "#old-anchor" notes/ tasks/ AGENTS.md .opencode/skills/
```

**This is non-negotiable.** Broken links cause agents to read wrong content or waste time searching. Load the `doc-navigator` skill for the full cross-linking and maintenance guide.
