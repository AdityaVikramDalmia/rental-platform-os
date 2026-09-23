# Decisions Log

> All design decisions made during documentation review. These are incorporated into the relevant docs but kept here as a quick reference.

---

## Authentication & Identity

| #   | Decision                        | Choice                                        | Rationale                                                                                                                                           |
| --- | ------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Guard auth via WorkOS           | **Synthetic email**: `{phone}@guards.local` | WorkOS requires email for email+password auth. Phone number becomes the synthetic email identifier.                                                 |
| 2   | Phone number canonical format   | **10 digits only** (e.g., `9876543210`)       | Strip everything on input. Store raw 10 digits. Add `+91` only for display/calling. De-dup matches on exact 10-digit string.                        |
| 3   | Admin account creation          | **Super admin enters Google email in UI**     | Super admin fills a form with new admin's Google email. System creates WorkOS user. Admin can then SSO via Google.                                  |
| 4   | Guard password policy           | **WorkOS default**                            | Use whatever WorkOS enforces. No custom override. Less code.                                                                                        |
| 5   | Session duration                | **30 days**                                   | Guards almost never re-login. Maximum convenience. WorkOS refresh tokens handle silent renewal.                                                     |
| 6   | Guard temp password on creation | **Admin sets it manually**                    | Admin types a temp password (e.g., guard's name + '123'). Easier to communicate verbally. `must_change_password` flag forces change on first login. |

---

## Data Formats & Storage

| #   | Decision                  | Choice                                    | Rationale                                                                                                                                                                   |
| --- | ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Money storage             | **Paise (integer × 100)**                 | ₹25,000 stored as `2500000`. Allows ₹8,333.33 as `833333`. Standard financial precision. Display divides by 100.                                                            |
| 8   | Date/time format          | **Everything as number (Unix ms)**        | All dates stored as `v.number()` (Date.now()). Convert to display format in frontend. No string dates anywhere. Consistent.                                                 |
| 9   | Admin notes on leads      | **Array of timestamped notes**            | `notes_thread` field stores `[{note, author_id, author_name, author_type, timestamp}, ...]`. Full history preserved. Guard sees all. Admin can request info multiple times. |
| 10  | Deletion strategy         | **Soft delete (`is_deleted` flag)**       | Never actually remove from DB. Add `is_deleted: boolean` to deletable entities. Filter in all queries. Audit log + soft delete = full history.                              |
| 11  | Photo ordering (listings) | **Explicit order field — separate table** | New `listing_photos` table with `{listing_id, storage_id, display_order}`. Reorder by updating `display_order`. First by order = cover photo.                               |

---

## Flat Number & Building Configuration

| #   | Decision                | Choice                                 | Rationale                                                                                                                     |
| --- | ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 12  | Flat number format      | **Structured template per building**   | Admin defines: optional prefix, floor digits, unit digits. System validates guard input against the template.                 |
| 13  | Guard flat number input | **Text input with validation**         | Guard types flat number. System validates against building's template. Error message shows expected format.                   |
| 14  | Floor definition        | **Full manual list with named floors** | Admin manually enters every floor label: B2, B1, G, 1, 2, ... 20. Supports named floors (G, B1, LG, M). Tedious but accurate. |

---

## State Machines & Workflows

| #   | Decision                       | Choice                                      | Rationale                                                                                                                   |
| --- | ------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 15  | POTENTIAL_DUPLICATE → VERIFIED | **Two-step: clear flag first, then verify** | Admin clicks "Not a Duplicate" (→ SUBMITTED), then opens verification form. No direct POTENTIAL_DUPLICATE → VERIFIED.       |
| 16  | Closure cancellation           | **Add CANCELLED state**                     | `PENDING → CANCELLED` when deal falls through. Linked payout (if any) voided. Explicit, auditable.                          |
| 17  | Lead rejection with listing    | **Warn but allow**                          | Confirmation dialog: "This lead has a published listing. Rejecting will archive it." Auto-archives listing on confirmation. |
| 18  | Visit rescheduling             | **Edit in place**                           | Admin edits `scheduled_start`/`end` on existing visit. Audit trail captures the change. Single record, cleaner.             |
| 19  | Guard banned mid-visit         | **Admin handles manually**                  | Visit stays in current state. Admin sees warning, manually cancels/reassigns. No auto-cascade.                              |

---

## Guard Portal UX

| #   | Decision                  | Choice                                             | Rationale                                                                                                                                   |
| --- | ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 20  | V1 guard communication    | **Admin calls + guard checks app**                 | Admin phones guard for urgent (NEED_INFO, visits). Non-urgent (payouts): guard checks app periodically. No in-app notifications.            |
| 21  | Guard sees duplicate flag | **Yes, yellow badge**                              | Guard sees "Possible Duplicate" badge in My Leads. Transparent. Can't do anything about it — admin resolves.                                |
| 22  | Guard onboarding          | **3-step walkthrough, show once, dismiss forever** | First login: 3-step explainer (Find → Submit → Earn). "Got it" button. Never shown again. `has_seen_onboarding` flag in profile.            |
| 23  | Guard empty state         | **Onboarding walkthrough (as above)**              | New guard with zero data sees the walkthrough, then an encouraging empty state with prominent "Add Vacant Flat" CTA.                        |
| 24  | Rule banner               | **Always visible, no exceptions**                  | Non-dismissable. 48px sticky bar on every guard page. Legal/compliance requirement. No collapse, no hide.                                   |
| 25  | Loading states            | **Simple spinner everywhere**                      | Centered spinner on page load. Toast for mutation results. Good enough for V1.                                                              |
| 26  | Poor connectivity         | **Loading spinner + error toast**                  | Show spinner on button. If mutation fails: "Failed to submit. Check your connection and try again." Convex auto-retries transient failures. |

---

## File Uploads

| #   | Decision            | Choice                                                            | Rationale                                                                                  |
| --- | ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 27  | Guard profile photo | **5MB max, JPEG/PNG/WebP, client-side resize**                    | Resize to ~500KB on client before upload. Better quality + less bandwidth on cheap phones. |
| 28  | Listing photos      | **10MB max per photo, JPEG/PNG/WebP, client-side resize to ~1MB** | Listing photos need better quality. Max 10 photos. Client resize to ~1MB before upload.    |

---

## Admin Panel

| #   | Decision                     | Choice                                                 | Rationale                                                                                                     |
| --- | ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 29  | Settings page UX             | **Grouped form with labels**                           | Friendly form: "Lead Submission" section → "Max leads per guard per day" input. Named fields, not raw keys.   |
| 30  | Cross-guard visit assignment | **Expected, guard doesn't need to know who submitted** | Any active guard in society can be assigned any visit. Visit card shows flat location only.                   |
| 31  | DemoRentals contact number       | **System config**                                      | Stored as `demorentals_contact_phone` and `demorentals_whatsapp_phone` in system_config. Editable from Settings page. |

---

## Project Structure

| #   | Decision     | Choice             | Rationale                                                                                                                                                       |
| --- | ------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 32  | Architecture | **Single package** | One `package.json`. `convex/` for backend, `src/` for frontend, `lib/` for shared constants/utils. Convex auto-generates the type bridge. No monorepo overhead. |

---

## DemoRentals Rentals Merge

> Decisions from integrating an external DemoRentals Rentals reference codebase into the Rental Platform OS platform.

| #   | Decision                            | Choice                                                                                                                      | Rationale                                                                                                                                                                                                     |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 33  | Merge demorentalsrentals into rental-platform-os | **Same-repo route groups** (`(tenant)/`, `(public)/` alongside existing `(guard)/`, `(admin)/`)                             | Single codebase, shared auth (WorkOS), shared schema (Convex), single deployment. No monorepo overhead.                                                                                                       |
| 34  | Two separate lead pipelines         | **Guard lead pipeline (vacancy supply) + Tenant inquiry pipeline (demand)** as separate tables with separate state machines | Guard leads and tenant inquiries have fundamentally different lifecycles. A tenant inquiry attaches to an existing published listing — it does NOT create a new lead.                                         |
| 35  | Tenant visits via bounty system     | **No auto-assignment. Ops posts visit as bounty → guards accept/claim.**                                                    | Explicit permission and transparency at every step. Ops has full control. Guards self-select based on availability.                                                                                           |
| 36  | All auth via WorkOS                 | **Tenants + Owners use Google Sign-In via WorkOS AuthKit** (same as admin flow). Guard phone+password unchanged.            | Single auth provider. No Supabase. Four auth methods: guard (phone+password), tenant (Google SSO), owner (Google SSO), admin (Google SSO).                                                                    |
| 37  | Owner portal V1 scope               | **Contact form only** — owner fills out lead capture form. Plans/ROI/case studies = V2.                                     | V1 focuses on capturing owner interest. Full owner self-service is premature.                                                                                                                                 |
| 38  | WhatsApp scope                      | **Manual deep links (`wa.me/...`) = V1. WhatsApp Business API / bot = V2.**                                                 | Deep links are zero-integration (just URLs). API bot requires vendor setup, templates, webhook sync.                                                                                                          |
| 39  | CSV bulk import                     | **Stays V2** — manual listing creation only in V1.                                                                          | V1 scale (a small number of societies) doesn't justify bulk import tooling.                                                                                                                                                   |
| 40  | Admin panel design approach         | **Hybrid: Rental Platform OS's separate-pages structure + external CRM card/filter UI patterns**                                    | Keep clean page separation for different concerns. Borrow the card-based, filter-heavy interaction patterns from the external code for component design. Two separate tabs: Guard Leads and Tenant Inquiries. |

---

## Progressive Web App (PWA)

| #   | Decision                     | Choice                                                                                           | Rationale                                                                                                                                                                           |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 41  | PWA integration library      | **Serwist (`serwist` + `@serwist/next`) instead of `next-pwa`**                                  | Serwist is the actively maintained modern fork and works cleanly with Next.js 16 service worker compilation flow.                                                                   |
| 42  | Manifest strategy            | **Separate manifests per portal** (`/manifest-guard.webmanifest`, `/manifest-admin.webmanifest`) | Guard and admin are different install surfaces with different users, colors, icons, scopes, and start URLs. Separate manifests keep installation behavior intentional and isolated. |
| 43  | V1 PWA scope                 | **Tier 1 only** — installable + static caching + offline fallback                                | V1 goal is reliability and installability without operational complexity. Push notifications, sync queues, and offline mutations are deferred to later tiers.                       |
| 44  | PWA icon generation approach | **Zero-dependency Node script** (`scripts/generate-pwa-icons.mjs`) for placeholders              | Deterministic, CI-safe icon generation without adding image tooling dependencies; easy to replace later when final brand assets are available.                                      |

---

## Rent Negotiation

| #   | Decision                                        | Choice                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 45  | 3-room architecture for negotiation             | **Each negotiation uses 3 rooms**: `OPS_TENANT`, `OPS_OWNER`, `COMBINED` (not one room with visibility toggles) | Clean separation of concerns for ops-led shuttle diplomacy. Owner should not see tenant's real budget. Combined room opens when terms are close for final sign-off. Alternatives rejected: single room with per-message visibility flags (complex query logic, high leak risk) and two rooms only (no shared space for final alignment/sign-off).           |
| 46  | Ops can show different numbers in private rooms | **Allowed in private rooms** (`OPS_TENANT` and `OPS_OWNER`), with formal alignment in structured proposals      | Standard broker behavior in Indian rental negotiations. Ops needs flexibility to move both sides toward agreement. Truth-lock happens at commitment stage through structured proposal sharing/signatures in combined flow. Alternative rejected: forcing same numbers everywhere (kills negotiation flexibility; pushes ops back to off-platform WhatsApp). |
| 47  | Token advance collected by DemoRentals (V1)         | **Manual token collection** (UPI/cash) with mandatory in-app recording; escrow is deferred to V2                | V1 needs an auditable trail without payment-rail complexity. Full escrow requires gateway integration, RBI/compliance handling, and dispute operations that materially delay launch. Alternatives rejected: no token tracking (no accountability) and full escrow in V1 (estimated multi-month delay).                                                      |
| 48  | Mandatory checklist gates closure confirmation  | **Closure confirmation hard-gated by a mandatory 10-item checklist** on the negotiation record                  | Prevents rushed closures, undocumented side deals, and legal/operational skips by making completion enforceable in workflow. Alternatives rejected: soft warnings only (likely ignored) and fewer required items (insufficient legal/ops coverage).                                                                                                         |
| 49  | Brokerage decided manually per deal             | **No fixed formula** — ops records negotiated brokerage for tenant side and owner side per transaction          | Indian rental deals vary significantly; fixed percentages are too rigid. Manual entry preserves operational flexibility while keeping a traceable record with party sign-off context. Alternatives rejected: fixed percentage model (poor real-world fit) and no brokerage tracking (high leakage/misreporting risk).                                       |

---

## Field Ops Platform

> Decisions from Phase 30: OPS persona, field checklist engine, incentive model v2, document collection.

| #   | Decision                                          | Choice                                                                                                                                   | Rationale                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50  | OPS as distinct user_type                         | **New `user_type: "OPS"`** with dedicated route group, NOT overloaded on guard_profiles                                                  | Clean persona separation. OPS handles admin-like tasks (leads, verification, closures) but operates in the field on mobile. Overloading guard_type would create confused permission boundaries. Alternative rejected: capabilities flags on guard_profiles (pollutes guard model with admin-adjacent operations). |
| 51  | OPS reuses admin mutations                        | **Zero mutation duplication** — OPS calls same mutations as admin, gated by `requirePermission()`                                        | Single code path means single source of bugs. RBAC already controls access. Alternative rejected: separate ops-specific mutations (duplication, drift risk).                                                                                                                                                      |
| 52  | Checklist engine with template/instance model     | **Configurable templates** with sections/items and per-visit instances                                                                   | Templates are reusable across visits. Instances store responses with photos. Depth levels (LIGHT/MEDIUM/FULL) allow progressive detail. Alternative rejected: flat checklist per visit (no reuse, no depth control).                                                                                              |
| 53  | Quality score as 5-component weighted formula     | **Weighted components**: lead_quality 25%, checklist_completeness 30%, visit_reliability 20%, response_time 15%, document_compliance 10% | Quantitative scoring replaces subjective judgment. Weights are configurable via system_config. Checklist completeness is the largest component because it's the most controllable by guards. Alternative rejected: single-metric scoring (misses behavioral nuance).                                              |
| 54  | Hybrid payout model (suggestion + admin override) | **System computes suggested amount** (base × multiplier + bonuses - penalties), **admin sets final**                                     | Guards see transparent breakdown. Admin retains full override power for edge cases. Alternative rejected: fully automatic payouts (no human judgment for exceptions) and fully manual (no quality incentive).                                                                                                     |
| 55  | Offline-first deferred to V2                      | **Online-only in V1** — architecture ready for offline but sync queue not built                                                          | Building reliable offline sync (conflict resolution, retry queues, photo upload queues) is a major infrastructure investment. V1 guards have reliable mobile data in Bangalore. Alternative rejected: full offline-first in V1 (estimated 2+ month delay).                                                        |

---

## Phase 30 Extension (OPS Admin Access + Google SSO)

| #   | Decision                                   | Choice                                                                                                                                                            | Rationale                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 56  | `requireBackoffice()` helper adoption      | **Add a new `requireBackoffice()` helper** for shared backoffice reads instead of broadening `requireAdmin()`                                                     | `requireAdmin()` is a type-specific contract. Expanding it to include OPS would break semantic clarity. `requireBackoffice()` preserves explicit layering: `requireAuth` -> `requireGuard`/`requireAdmin`/`requireOps` -> `requireBackoffice` -> `requirePermission`. |
| 57  | Immutable WorkOS identity binding          | **Never overwrite `workos_user_id` after first bind**; webhook user resolution order is `by_workos_user_id` -> `by_email` -> create                               | Overwriting WorkOS identity from an email match can break login mapping if multiple WorkOS accounts share an email-like identifier. Immutable binding plus ordered lookup keeps identity linkage stable and avoids account takeovers caused by accidental rebinding.  |
| 58  | Two-tier OPS auth model                    | **Allow OPS creation with or without Google email**: Google-email OPS gets Google SSO + phone/password; non-email OPS remains synthetic-email phone/password only | Field OPS work needs phone+password for mobile usage, while backoffice/admin workflows benefit from Google SSO. A dual path lets ops users access both surfaces without forcing one authentication mode on all OPS accounts.                                          |
| 59  | Idempotent OPS provisioning                | **`createOpsInternal` uses upsert-by-`workos_user_id` reconciliation** instead of hard-failing on existing users                                                  | Webhook races (`user.created` and `createOpsInternal`) can attempt duplicate provisioning. Upsert convergence makes both paths land on the same canonical `users` record and prevents race-driven duplicate creation failures.                                        |
| 60  | `guards.create` gates OPS account creation | **`createOpsAccount` requires `guards.create` permission**, not `admins.create`                                                                                   | OPS is field staff operationally closer to guards than admins. Keeping account creation in the `guards` permission scope reflects org boundaries and avoids granting broader admin-account management permissions when only field-staff provisioning is needed.       |

---

## Scale Context

- Designed for a single operator running a small number of societies, not a multi-tenant SaaS platform
- No need for: audit archival, aggressive pagination optimization, per-society RBAC scoping, complex caching

---

## Strategic Improvement Plan

| #   | Decision                       | Choice                                                                                                  | Rationale                                                                                                                                                                                |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 61  | Post-closure transaction rails | **Build booking→move-in pipeline** (agreement, KYC, deposit, handover)                                  | Biggest conversion drop-off is after visit intent. Quinto Andar (Brazil) proved owning the transaction (not just listing) creates category-defining platforms.                           |
| 62  | Trust infrastructure approach  | **Surface existing data as badges** first, then add trust score                                         | Guards already verify owners, inspect properties, conduct visits — this data exists but isn't visible to tenants. Badges are zero-cost trust lift.                                       |
| 63  | Notification channels          | **PWA push + WhatsApp + SMS fallback** with per-user preferences                                        | Guards prefer WhatsApp, tenants prefer push, owners prefer calls. Multi-channel with fallback ensures delivery without over-notifying.                                                   |
| 64  | Monetization model             | **Hybrid: success-fee brokerage + tenant pass + owner subscription**                                    | Rent-band fee slabs (₹9,999-₹22,999) as primary revenue. Discovery Pass and owner RM subscription for recurring. NoBroker's subscription-only model has high churn.                      |
| 65  | Post-move-in strategy          | **Resident hub with rent tracking + maintenance ticketing**                                             | Currently zero post-transaction engagement kills LTV and referrals. Nestaway retains users via post-move-in services. Start lightweight: track rent (don't process), ticket maintenance. |
| 66  | Owner portal                   | **New `(owner)/` route group** with property dashboard                                                  | Owners currently have no portal — just submit a form and wait. Owner retention requires visibility into property status, tenant info, and financial data.                                |
| 67  | Tenant trust scoring           | **Progressive composite score (0-100)** from identity + employment + rental history + platform behavior | India lacks centralized rental credit history. Building a portable trust score creates platform lock-in and enables insurance products downstream.                                       |
| 68  | AI features priority           | **Fair rent calculator + lead scoring first**, fraud detection second                                   | Pricing intelligence and lead prioritization have immediate business impact. Fraud detection is important but less urgent at current scale.                                              |
| 69  | Supply diversification         | **Owner self-list + resident referrals first**, corporate and broker partnerships later                 | Guards are capped at ~5 vacancies/year per society. Owner self-list and resident referrals are lowest-friction new channels. Corporate requires sales infrastructure.                    |
| 70  | Financial products approach    | **Partnership-led (insurer + fintech), NOT balance-sheet risk**                                         | Rent Shield via insurer, Deposit Lite via insurance, deposit financing via fintech partner. Platform earns commissions without regulatory/capital risk.                                  |
| 71  | Phase prioritization           | **Trust + transaction rails before AI and financial products**                                          | Trust and transaction completion fix the core conversion funnel. AI and financial products are scale-phase multipliers that depend on having the data and volume from earlier phases.    |

---

## Phase 39-42 Decision Additions

| #   | Decision                                 | Choice                                                                                                                 | Rationale                                                                                                   |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 72  | Trust score component weighting          | **Fixed 4-component score with weights 30/25/25/20** (`IDENTITY`, `EMPLOYMENT`, `RENTAL_HISTORY`, `PLATFORM_BEHAVIOR`) | Keeps scoring explainable and bounded while preserving signal hierarchy.                                    |
| 73  | Trust score cold-start baseline          | **Default baseline score = 20**                                                                                        | New tenants need a usable initial score before rich behavioral signals accumulate.                          |
| 74  | Trust score decay policy                 | **Decay -2 points/month after 90 inactive days, floor 15**                                                             | Prevents stale high scores while avoiding punitive collapse for low-activity tenants.                       |
| 75  | Review publish delay                     | **48-hour cooling period before public publish**                                                                       | Reduces impulse abuse, allows one correction window, and enables anomaly/moderation checks before exposure. |
| 76  | Review anti-gaming controls              | **Uniqueness + text hash dedupe + anomaly thresholds + moderation pipeline**                                           | Prevents review spam, duplicate content amplification, and rating manipulation.                             |
| 77  | AI model baseline                        | **Use `gpt-4o-mini` as default model**                                                                                 | Best cost/latency trade-off for structured scoring and photo/rent assistance in current workload.           |
| 78  | Deterministic vs AI responsibility split | **Keep core scoring deterministic; use AI for rent and photo enrichment**                                              | Maintains auditability and resilience when provider calls fail or budgets throttle.                         |
| 79  | AI budget guardrail                      | **Daily AI spend cap = $50**                                                                                           | Enforces predictable opex while allowing controlled experimentation and rollout.                            |
| 80  | AI fallback stance                       | **Fallback to cached/stale/rules-only/manual-review paths instead of hard failure**                                    | AI outages must not block lead/listing/inquiry workflows.                                                   |
| 81  | Multi-channel de-dup priority order      | **`GUARD > OWNER > SECRETARY > RESIDENT > BROKER > CORPORATE`**                                                        | Preserves trusted supply signal precedence and reduces payout disputes.                                     |
| 82  | Broker auto-suspension policy            | **Suspend below 10% conversion for 2 consecutive windows**                                                             | Creates objective quality floor and avoids long-tail low-quality broker spam.                               |
| 83  | Collision payout resolution policy       | **Winner takes all by default; split only via explicit admin resolution**                                              | Keeps payout accounting deterministic while preserving an escalation path for ambiguous evidence.           |
| 84  | Regulatory operating model for P42       | **IRDAI Corporate Agent rail for insurance + NBFC partner rail for lending**                                           | Avoids direct underwriting/lending risk and aligns with Indian regulatory boundaries.                       |
| 85  | Financial accounting invariant           | **Double-entry ledger with balanced debit/credit pair per transaction ref**                                            | Prevents financial drift and supports deterministic reconciliation and audits.                              |
| 86  | Cooling-off policy window                | **15 days for policy products (`irdai_cooling_off_days`)**                                                             | Aligns with P42 policy-product cancellation/cooling-off contract and IRDAI-focused compliance posture.      |
| 87  | Credit consent retention                 | **Retain credit-reporting consent artifacts for 8 years**                                                              | Supports DPDP-aligned retention and downstream compliance/audit requirements.                               |
| 88  | P42 eligibility snapshot contract        | **Persist immutable trust eligibility snapshot at issuance-time and never recompute in-place**                         | Guarantees policy decisions are reproducible even if tenant trust inputs change later.                      |
| 89  | Review aggregate read strategy           | **Use materialized aggregate cache for trust/review read paths with event-driven refresh**                             | Keeps tenant-facing reads fast and deterministic while avoiding expensive recompute on every request.       |

---

## Phase 43 Decision Additions (D-P43-1 to D-P43-4)

Reference: [Premium Tenant Portal](features/35-tenant-portal.md)

| Decision ID | Decision                  | Choice                                                                        | Rationale                                                                                  |
| ----------- | ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D-P43-1     | Tenant shell strategy     | **Reuse P38 `PortalShell` + shared mobile navigation pattern**                | Keeps tenant UX consistent with owner/guard/ops shell architecture and reduces divergence. |
| D-P43-2     | Favorites source of truth | **`tenant_favorites` replaces `saved_listings` as canonical favorites store** | Enables cross-device consistency and deterministic backend sync for logged-in tenants.     |
| D-P43-3     | Consolidated inbox scope  | **V1 inbox is read-only merged feed (notifications + messages)**              | Ships unified visibility quickly while deferring complex unified actions to V2.            |
| D-P43-4     | Analytics event sink (V1) | **Tenant analytics events write into `auditLogs` in V1**                      | Avoids premature external analytics dependency while preserving traceability.              |

---

## Phase 44 Decision Additions (D72-D74, D78-D80)

Reference: [OPS Superset Expansion](features/35-ops-superset-expansion.md)

| Decision ID | Decision                          | Choice                                                                                | Rationale                                                                           |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D72         | Profile model reuse               | **Reuse `guard_profiles` for both GUARD and OPS; no `ops_profiles` table**            | Preserves data continuity and avoids duplicate profile models during OPS expansion. |
| D73         | Field-worker auth helper contract | **Introduce `requireFieldWorker` and `requireFieldWorkerAuth`**                       | Separates strict guard-only paths from shared guard/ops field-worker paths.         |
| D74         | Rollout gating strategy           | **Gate OPS field-worker access with global flag + canary user allowlist**             | Provides safe rollout and instant rollback control.                                 |
| D78         | No double-dipping                 | **One operational event maps to exactly one earning source via idempotency keys**     | Prevents payout/incentive duplication across guard and OPS field-worker surfaces.   |
| D79         | Rollout control                   | **Feature-gated OPS field-worker access with kill switch and canary allowlist**       | Enables safe progressive rollout with fast rollback.                                |
| D80         | OPS backfill defaults             | **Backfilled OPS profile defaults to `guard_type: SOCIETY_GUARD` with no shift rows** | Guarantees deterministic provisioning and avoids synthetic shift artifacts.         |

---

## Phase 45 Decision Additions (D-P45-01 through D-P45-04)

Reference: [Multi-Persona Identity Model](features/36-multi-persona-identity.md)

| ID       | Decision                                                                    | Rationale                                                                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P45-01 | Store `user_types` as array on users document, not a junction table         | Max 3-4 personas per user. Array = single doc fetch. Junction table = extra query on every auth check. Trade-off: can't index on array membership — mitigated by `active_persona` scalar for indexed queries. |
| D-P45-02 | Separate `active_persona` field for routing, `user_types` for access checks | Routing needs single deterministic value. Access needs set membership. Two fields with clear semantics beats conflating them.                                                                                 |
| D-P45-03 | Additive-only persona model — no automatic removal                          | Automatic removal was root cause of TENANT→OWNER destructive overwrite bug. Admin-gated removal creates audit trail and prevents data loss.                                                                   |
| D-P45-04 | Feature flag `multi_persona_enabled` for phased rollout                     | Schema migration + backfill are safe to run anytime. UX change (picker, switcher) should be deployed deliberately. Flag allows incremental production deployment.                                             |

---

## Adversarial Audit Decision Additions (D-AUDIT-01)

Reference: Adversarial codebase audit conducted 2026-02-21 across phases 25-28, 43-45 with 5 Oracle agents.

| ID         | Decision                                                                                             | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-AUDIT-01 | `active_persona` is UX routing only — `requireX()` helpers check `user_types` membership, not active | Persona switching is a convenience feature, not a security boundary. Auth helpers (`requireOwner`, `requireTenant`, etc.) check `user_types.includes(type)`, allowing a TENANT+OWNER user to call owner mutations even when `active_persona` is TENANT. This is intentional: the security boundary is the `user_types` array itself (what personas you HAVE), not which one is currently active. Enforcing `active_persona` in mutations would break legitimate cross-portal API calls (e.g., tenant page fetching owner-related data). Channel visibility IS gated by `active_persona` (see VULN-1 fix) to prevent data leakage in the UI layer. |
