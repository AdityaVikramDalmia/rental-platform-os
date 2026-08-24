# V2 Backlog

Items explicitly deferred from V1. Tracked here so nothing gets lost.

## Implemented Since Original V1 Plan

- ~~In-App Notifications~~ — ✅ Implemented in Phase 35 (Notification Infrastructure)
- ~~Push Notifications~~ — 🟡 Partially implemented in Phase 35 (in-app is live; push uses stubs/placeholders)
- ~~Chat System~~ — ✅ Implemented in Phase 24 (deal room chat infrastructure)
- ~~Deal Room / Checklists~~ — ✅ Implemented in Phase 25
- ~~Rent Negotiation~~ — ✅ Implemented in Phase 26
- ~~Owner Services Landing Page~~ — ✅ Implemented in Phase 20
- ~~Transaction Rails~~ — ✅ Implemented in Phase 34
- ~~Tenant Inquiry Pipeline~~ — ✅ Implemented in Phase 19
- ~~Referral System~~ — ✅ Implemented in Phase 22
- ~~Trust & Verification Display~~ — ✅ Implemented in Phase 33

---

## V2: Native Android App (React Native + Expo)

**What**: Translate the guard portal from mobile web to a native Android app.
**Why deferred**: Web-first allows faster iteration and easier debugging. Native comes when guard adoption is proven.
**Tech**: React Native + Expo. NativeWind for styling (mirrors Tailwind). Convex React Native SDK exists.
**Scope**: Guard portal only. Admin stays web.

---

## ~~V2: Push Notifications~~ — 🟡 PARTIALLY PULLED TO IMPLEMENTED (Phase 35)

**What**: Real-time push notifications for guards (and potentially admins).
**Notifications to send**:

- Visit assigned to you
- Lead status changed (verified, need info, rejected)
- Payout approved / paid
- New visit reminder (1 hour before scheduled time)

**Tech**: Expo Push Notifications (for native app) or Web Push API (for web). Firebase Cloud Messaging as transport.

**See also**: PWA Tier 2 section below for push notification integration with service worker.

---

## V2: PWA Tier 2 — Offline Data & Push Notifications

**What**: Extend PWA beyond installability to include offline data access and push notifications.
**Why deferred**: V1 focuses on installability and static caching. Convex has NO offline-first support — real-time WebSocket subscriptions die offline, and in-memory mutation queues are lost on tab close. Push notifications require Firebase/Web Push setup.
**V2 scope**:

- Push notifications via Web Push API / Firebase Cloud Messaging (visit assigned, lead status change, payout updates)
- Offline mutation queue with IndexedDB persistence (submit leads offline, sync when back online)
- Background sync for pending mutations
- Offline-first Convex data replication (if Convex adds support)

**Key constraint**: Convex co-founder confirmed: "support for unreliable connections, not true offline support." True offline requires a local-first database layer.

---

## V2: GPS Geofencing

**What**: Capture guard's GPS coordinates on lead submission. Optionally enforce that guard must be within society boundaries.
**Why deferred**: Privacy concerns, battery drain, and false positives (GPS inaccuracy indoors). Adds complexity without clear V1 ROI.
**Implementation**: Capture lat/lng on submission → compare against society's geo-boundary → flag if outside.

---

## V2: Key Custody Module

**What**: Track physical keys held by guards for vacant flats. Full chain of custody with owner consent proof.
**Why deferred**: Liability risk. If a key is lost or flat is burgled, DemoRentals could be liable. Needs legal review.
**Entities**: KeyCustody table with custody_status, owner_consent_proof (OTP/WhatsApp), key_count, photos, timestamps.
**If implemented**: Require owner consent proof (OTP or WhatsApp screenshot), photo of keys, sign-in/sign-out log.

---

## ~~V2: Tenant-Facing Portal~~ → PARTIALLY PULLED TO V1

> **Decision**: Core tenant features moved to V1 per DemoRentals Rentals merge. See [Decisions Log D33-D40](12-decisions-log.md).

**Pulled to V1**:

- Public listing directory with search, filters, sort, grid/list views → [features/11-tenant-browse.md](features/11-tenant-browse.md)
- Property detail pages (gallery, amenities, commute, roommates, testimonials) → [features/12-property-detail.md](features/12-property-detail.md)
- Tenant inquiry & visit request submission → [features/13-tenant-inquiry.md](features/13-tenant-inquiry.md) — ✅ Implemented in Phase 19
- Tenant Google Sign-In for favorites and visit requests
- Public homepage, how-it-works (with interactive tools), contact hub → [features/15-public-pages.md](features/15-public-pages.md)
- Interactive tenant tools (rent calculator, commute estimator, roommate quiz, rental checklist) → [features/16-tenant-tools.md](features/16-tenant-tools.md)
- Owner services landing page + owner request queue → [features/14-owner-services.md](features/14-owner-services.md) — ✅ Implemented in Phase 20

**Stays V2**:

- Tenant account lifecycle portal (status tracking, saved-search notifications)
- Advanced notification loops (push notifications, in-app notification center)
- Auto-scheduling optimization for tenant visits
- Tenant self-serve reschedule/cancel for visit requests
- Tenant feedback after visit

---

## ~~V2: WhatsApp Integration~~ → SPLIT: Manual Deep Links = V1, Bot/API = V2

> **Decision**: Manual `wa.me` deep links are V1. Business API automation is V2. See [Decisions Log D38](12-decisions-log.md).

**V1 (manual deep links)**:

- Click-to-chat buttons on public pages, listing pages, contact hub, property detail
- Pre-filled WhatsApp message text (e.g., "Hi, I'm interested in {building_name} {flat_number} at {society_name}")
- Uses `window.open('https://wa.me/91XXXXXXXXXX?text=...')` — zero integration required

**Stays V2 (WhatsApp Business API)**:

- Automated outbound messaging (visit confirmations, payout notifications)
- Template-based messages (requires Meta Business verification)
- Webhook-based conversation sync
- Bot / chatbot automation

**Tech (V2)**: WhatsApp Business API (Meta), or third-party providers (Twilio, Gupshup, Interakt).

---

## V2: Phone OTP Auth for Guards

**What**: Replace username+password with phone OTP for guard login. More natural for Indian users.
**Why deferred**: WorkOS doesn't support phone OTP as primary auth. Need separate provider (Firebase Auth, Twilio Verify) or wait for WorkOS to add it.
**Alternative considered**: Continue with password auth but add "remember me" for less frequent logins.

---

## ~~V2: In-App Notifications~~ — ✅ IMPLEMENTED (Phase 35)

**What**: Bell icon + notification feed in the web app.
**Types**:

- Guard: lead status changes, visit assignments, payout updates
- Admin: new lead submissions, visit completions, closure events
  **Implementation**: Convex real-time subscription to a `notifications` table. Unread count badge.

---

## V2: Bulk CSV Import

**What**: Upload CSV files to bulk-create societies, buildings, and guards.
**Why deferred**: V1 is small scale. Manual entry through UI is sufficient for initial onboarding.
**When needed**: When expanding to 50+ societies, onboarding 100+ guards at once.

---

## V2: External Platform Integration

**What**: API integration with DemoRentals's existing platform.
**Scope**:

- Sync verified leads to DemoRentals's listing system
- Pull deal IDs from DemoRentals's CRM
- Push closure data to DemoRentals's accounting
  **Why deferred**: V1 is standalone. Bridge via manual processes (copy-paste deal IDs, manual data entry).

---

## V2: Advanced Analytics

**What**: More sophisticated reporting features.

- Society vacancy heatmaps (which buildings have most vacancies)
- Guard activity timeline (when do they submit most leads)
- Predictive: which societies are likely to have vacancies (seasonal patterns)
- Export to CSV/PDF
- Scheduled email reports to admin

---

## V2: Multi-Language Admin Panel

**What**: Hindi/Hinglish support for admin panel.
**Why deferred**: Current ops team is English-literate. May be needed if ops team expands to include Hindi-primary speakers.

---

## V2: Guard Self-Service Features

- Request shift change (admin approves)
- Report issue with a visit
- Upload documents (own ID proof, etc.)
- In-app chat with ops team

---

## V2: Financial Module

- Guard TDS (Tax Deducted at Source) tracking for payouts above threshold
- Monthly payout summaries
- Integration with accounting software (Tally, Zoho Books)
- Invoice generation for brokerage collected

---

## V2: Data Privacy Compliance

- DPDP Act (India's data protection law) compliance
- Owner consent management (right to withdraw, data deletion)
- Guard data retention policies
- Privacy policy and terms of service in-app

---

## V2: Owner Service Plans & ROI

**What**: Full owner self-service portal with service plan comparison, ROI calculator, case studies, onboarding timeline.
**Why deferred**: V1 owner funnel is contact form only. Full self-service requires pricing decisions, case study content, and more complex UI. See [Decisions Log D37](12-decisions-log.md) and [features/14-owner-services.md](features/14-owner-services.md).
**V2 scope**: Service tier cards, ROI calculator with sliders, before/after case studies, owner onboarding timeline, FAQ module.

---

## V2: CSV Bulk Import

**What**: Upload CSV files to bulk-create listings, societies, buildings, and guards.
**Why deferred**: V1 scale (3 societies) doesn't justify bulk import tooling. Manual creation is sufficient. See [Decisions Log D39](12-decisions-log.md).
**When needed**: Expanding to 50+ societies or needing to migrate listings from external sources.

---

## V2: Referral Leaderboards

> Core referral system is already live — ✅ Implemented in Phase 22. This section tracks V2 referral extensions only.

**What**: Public or community leaderboard showing top referrers by earnings, sign-ups, or deals closed.
**Why deferred**: V1 focuses on core referral tracking and payouts. Leaderboards add gamification complexity and privacy considerations (displaying earnings publicly).
**Scope**: Referrer ranking by period (weekly/monthly/all-time), opt-in display, achievements/badges.

---

## V2: Tiered Referral Commissions

**What**: Variable referral commission rates based on referrer tier (e.g., Bronze/Silver/Gold referrers earn different percentages).
**Why deferred**: V1 uses flat configurable amounts per scope. Tiered commissions require tracking referrer performance over time and managing tier transitions.
**Scope**: Referrer tiers based on cumulative performance, auto-promotion, tier-specific rates.

---

## V2: Referral Marketing Materials

**What**: Auto-generated shareable content (social media cards, WhatsApp messages, email templates) for referrers.
**Why deferred**: V1 provides basic shareable referral links. Polished marketing materials require design work and content creation.
**Scope**: Branded share cards, pre-written messages, referral landing pages.

---

## V2: Referral-Based Incentive Cards

**What**: Special incentive cards/badges for top referrers, integrated with the guard incentive system (P10).
**Why deferred**: V1 keeps referral program and incentive system separate. Integration requires defining cross-system thresholds.
**Scope**: "Top Referrer" badge, referral milestone celebrations, cross-program rewards.

---

## V2: Guard ↔ Admin Chat

**What**: In-app messaging between guards and ops admins for coordination, questions, and support.
**Why deferred**: V1 deal room schema is extensible for this (sender_role supports GUARD, channel model supports new types), but guard chat has different requirements (no AI masking, different permissions, real-time).
**Scope**: Guard ↔ admin channels, message threading, shift-related coordination, issue reporting.

---

## V2: Chat Push Notifications

**What**: Push notifications for new chat messages in deal room channels.
**Why deferred**: V1 message batching means delivery is already slightly delayed (5-15 seconds). Push notifications require Firebase/Web Push setup.
**Scope**: New message alerts, unread count badges, notification preferences per channel.

---

## V2: Chat Voice/Video Calls

**What**: Voice and video calling within deal room channels.
**Why deferred**: V1 focuses on async text communication with AI masking. Real-time A/V requires WebRTC infrastructure and cannot be AI-masked.
**Scope**: WebRTC integration, call recording (with consent), call scheduling.

---

## V2: Chat File/Image Sharing

**What**: Ability to share files and images within deal room chat channels.
**Why deferred**: V1 text-only chat simplifies AI masking pipeline. File sharing adds storage, preview, and PII-in-images concerns.
**Scope**: Document upload (PDF, images), inline preview, file scanning for PII, storage quota.

---

## V2: WhatsApp Business API for Owner Notifications

**What**: Automated WhatsApp notifications to property owners for chat messages, checklist updates, and invite links.
**Why deferred**: V1 uses manual WhatsApp deep links (admin copies invite link, sends via personal WhatsApp). Business API requires Meta verification and template approval.
**Scope**: Template messages for invite links, new message notifications, checklist reminders, delivery receipts.

---

## V2: Escrow for Token Advance

**What**: Replace manual token collection with in-app escrow. Tenant pays token advance directly through the platform (payment gateway), funds are held in escrow, and released to owner (or refunded to tenant) based on the agreed refund policy — automatically enforced by the system.

**Why deferred**: Escrow is complex — requires payment gateway integration (Razorpay or similar), RBI compliance for holding funds, automated refund policy enforcement, dispute resolution workflows, and legal review of escrow terms. V1 manual collection is sufficient for initial scale.

**V1 approach**: DemoRentals collects token manually via UPI or cash, records the collection in the app (`negotiation_token_records` table), and manually enforces the refund policy. Tenant agrees to the policy in-app but payment happens off-platform.

**V2 scope**:

- Payment gateway integration (Razorpay or similar) for in-app token collection
- Escrow account setup with RBI-compliant fund holding
- Automated refund policy enforcement (system releases or refunds based on policy + trigger events)
- Dispute resolution workflow with admin mediation
- Automated receipts and transaction records
- Integration with `negotiation_token_records` table (status transitions automated)

See [Rent Negotiation](features/19-rent-negotiation.md) for the V1 token advance flow.

---

## V2: Automated Deal Term Compliance

**What**: AI-powered verification that signed deal checklist terms are reflected in the actual rent agreement and closure documents.
**Why deferred**: V1 checklists are for human reference. Automated compliance checking requires document parsing (OCR/NLP on rent agreements) and term matching.
**Scope**: Rent agreement parsing, term-by-term verification, discrepancy alerts, compliance reports.
