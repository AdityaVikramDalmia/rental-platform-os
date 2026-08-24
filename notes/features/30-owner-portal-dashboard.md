# Feature: Premium Portal Infrastructure + Owner Portal

> **Priority**: #38 in implementation order
> **Personas**: Owner, Admin
> **Dependencies**: P20 (Owner Services), P31 (Owner Entity & RM), P24 (Chat Infrastructure), P25 (Deal Room Features), P22 (Referral System)
> **Route Groups**: `(owner)/` (NEW route group), `(admin)/`

## Purpose

Phase 38 delivers a comprehensive premium owner portal built on reusable mobile-first portal infrastructure. Instead of a narrow status page, owners get a first-class product experience with dashboard, property management, earnings tracking, deal-room messaging, referral sharing, service request tracking, document management, and profile settings.

This phase introduces three architectural foundations: (1) **Shared Portal Shell** — a reusable layout system for owner and future tenant portals with config-driven navigation, (2) **Auth Redirect Fix** — server-side post-auth resolver that routes users by actual `user_type` instead of email domain heuristics, and (3) **Complete Owner Portal** — 9-route information architecture (4 primary routes + 5 More-menu routes) with full backend support.

### Scope Clarification (P38)

P38 is primarily a read-model phase creating owner-scoped queries over existing entities.

Minimal write operations are included only where essential for owner self-service:

1. `owners.updateMyProfile` - profile edits
2. Owner document upload - owner document submission path in `documents`

These are the only mutations P38 introduces.

## Entities Involved

- Existing read entities:
  - `owners` (canonical owner identity and lifecycle)
  - `owner_rm_assignments` and `rm_check_ins` (relationship manager mapping and history)
  - `listings`, `leads`, `tenant_inquiries`, `visits`, `closures` (pipeline and occupancy context)
  - `payouts` (financial history)
  - `referral_codes`, `referrals`, `referral_milestones` (owner referral program)
  - `owner_service_requests` (service request tracking)
  - `document_requirements` (document collection and management)
  - `chat_channels`, `chat_messages` (deal-room messaging)
- No new schema tables in this phase (all entities pre-exist from P20, P22, P24, P25, P31)

## Flows

### Flow 1: Owner Auth and Portal Bootstrap

```text
1. Owner signs in using Google SSO (existing WorkOS path)
2. Callback routes to /post-auth resolver (NEW in P38-E02)
3. Resolver checks Convex user_type and routes to /owner/dashboard
4. Owner layout verifies user_type=OWNER and ACTIVE owner linkage
5. Bottom nav loads 4 primary routes + More trigger, plus 5 More-menu routes
```

### Flow 2: Dashboard KPI Summary

```text
1. /owner/dashboard aggregates all properties linked to owner
2. KPI cards show:
   - total properties
   - active tenants
   - expected monthly rent
   - pending service requests
3. Recent activity stream shows recent closures, payouts, and RM check-ins
4. RM contact card shows assigned RM and latest check-in
5. Alerts surface lease expiry and pending requests
```

### Flow 3: Property Portfolio and Leads

```text
1. /owner/properties lists owner-linked properties with status chips
2. /owner/leads shows all leads on owner's properties with status filters
3. Owner can view lead details, verification status, and linked listings
4. Property detail shows inquiry funnel, visit history, current tenant, and payout ledger
```

### Flow 4: Financial Tracking

```text
1. /owner/earnings shows payout history with status breakdown
2. Owner can filter by property and date range
3. Payout cards show amount, status, and payment method
4. Summary shows total earned, pending, and approved amounts
```

### Flow 5: Deal-Room Messaging

```text
1. /owner/messages lists active chat channels (inquiries, negotiations)
2. Owner opens a channel to view masked conversation with tenant/ops
3. Chat uses AI-masked messaging from P24 chat infrastructure
4. Deal checklist from P25 is visible in channel context
```

### Flow 6: Referral Sharing and Earnings

```text
1. /owner/referrals shows owner's referral code and sharing options
2. Owner can copy code or share via WhatsApp
3. Referral dashboard shows referred tenants/owners and milestone status
4. Earnings from referrals are tracked and displayed
```

### Flow 7: Service Requests and Documents

```text
1. /owner/service-requests lists submitted service requests with status
2. /owner/documents shows uploaded documents and regulatory items
3. Owner can upload new documents and track collection status
4. Documents are linked to properties and deals
```

### Flow 8: Profile and Settings

```text
1. /owner/profile shows owner identity, contact info, and RM assignment
2. Owner can update contact preferences and notification settings
3. RM assignment and check-in history are visible
4. Owner can request RM follow-up or contact support
```

## User Stories

### Owner: See Portfolio at a Glance

**As an owner**, I want one dashboard for all my properties, so I can quickly understand occupancy, rent, and pending actions.

**Acceptance Criteria**:

- `/owner/dashboard` shows multi-property KPIs (properties, tenants, expected rent, pending requests)
- Recent activity stream shows recent closures, payouts, and RM check-ins
- Alerts surface lease expiry and pending service requests
- Empty states include onboarding CTA when no active properties exist

### Owner: Manage Properties and Leads

**As an owner**, I want to see all my properties and leads in one place, so I can track the rental pipeline.

**Acceptance Criteria**:

- `/owner/properties` lists all owner-linked properties with status chips
- `/owner/leads` shows all leads on owner's properties with status filters
- Property detail includes inquiry funnel, visit history, and payout ledger
- Owner can view lead verification status and linked listings

### Owner: Track Earnings and Payouts

**As an owner**, I want a clear view of my earnings history and payout status, so I can manage my finances.

**Acceptance Criteria**:

- `/owner/earnings` shows payout history with status breakdown (pending, approved, paid)
- Owner can filter by property and date range
- Summary shows total earned, pending, and approved amounts
- Payout cards show amount, status, and payment method

### Owner: Communicate with Tenants and Ops

**As an owner**, I want to message tenants and ops about deals in a secure, masked environment, so I can negotiate terms safely.

**Acceptance Criteria**:

- `/owner/messages` lists active chat channels (inquiries, negotiations)
- Chat uses AI-masked messaging to prevent PII leakage
- Deal checklist is visible in channel context
- Owner can see both original and masked versions of messages

### Owner: Share Referral Code and Earn Bonuses

**As an owner**, I want to share my referral code and track referral earnings, so I can grow my network and earn extra income.

**Acceptance Criteria**:

- `/owner/referrals` shows owner's referral code with copy and WhatsApp share options
- Referral dashboard shows referred tenants/owners and milestone status
- Earnings from referrals are tracked and displayed
- Owner can see stacking bonuses (sign-up + finding bonuses)

### Owner: Manage Service Requests and Documents

**As an owner**, I want to submit and track service requests, and upload required documents, so I can stay compliant and organized.

**Acceptance Criteria**:

- `/owner/service-requests` lists submitted requests with status (submitted, contacted, onboarded, active)
- `/owner/documents` shows uploaded documents and regulatory items
- Owner can upload new documents and track collection status
- Documents are linked to properties and deals

### Owner: Update Profile and Contact RM

**As an owner**, I want to manage my profile, contact preferences, and RM assignment, so I can stay in control of my account.

**Acceptance Criteria**:

- `/owner/profile` shows owner identity, contact info, and RM assignment
- Owner can update contact preferences and notification settings
- RM assignment and check-in history are visible
- Owner can request RM follow-up or contact support

### Admin: Retain Oversight Without Taking Away Owner Control

**As an admin**, I want owner portal activity to remain scoped and auditable, so owners self-serve while governance remains intact.

**Acceptance Criteria**:

- Owner reads are strictly owner-scoped by canonical owner linkage
- Admin can view owner portal events and enforce RM assignment policies
- Missing RM assignment falls back to platform contact block
- All owner actions generate audit events

---

## Convex Functions

### Shared Portal Infrastructure (P38-E01)

```ts
// Navigation config (client-side, no backend)
getPortalConfig(portalId: "owner" | "tenant")
  => PortalNavigationConfig

isPortalNavActive(pathname: string, navItem: PortalNavItem)
  => boolean
```

### Auth Redirect Fix (P38-E02)

```ts
// Server-side post-auth resolver
POST /post-auth
  => { redirect: string }  // Routes to /owner/dashboard, /guard/dashboard, /admin/dashboard, etc.
```

### Owner Dashboard (P38-E03)

```ts
owners.getMyDashboardSummary()
  => {
    kpis: {
      total_properties: number,
      active_tenants: number,
      expected_monthly_rent: number,
      pending_requests: number,
    },
    recent_activity: Array<{
      type: "closure" | "payout" | "check_in",
      timestamp: number,
      details: object,
    }>,
    rm_contact: {
      rm_name: string,
      rm_phone: string,
      last_check_in: number,
    } | null,
    alerts: Array<{
      type: "lease_expiry" | "pending_request",
      property_id: Id<"listings">,
      message: string,
    }>,
  }
```

### Owner Properties & Leads (P38-E04)

```ts
owners.getMyProperties({ cursor?, limit? })
  => { properties: OwnerPropertyCard[], nextCursor? }

owners.getMyLeads({ status?, cursor?, limit? })
  => { leads: OwnerLeadCard[], nextCursor? }

listings.getByIdForOwner({ listing_id })
  => {
    listing,
    inquiry_funnel,
    visit_history,
    current_tenant,
    payout_ledger,
  }
```

### Owner Earnings (P38-E04)

```ts
type OwnerEarningsRow = {
  payout_id: Id<"payouts">;
  closure_id: Id<"closures">;
  lead_id: Id<"leads">;
  status: PayoutStatus;
  amount_paise: number;
  building_name: string | null;
  flat_number: string | null;
  confirmed_at: number | null;
  disbursed_at: number | null;
  payment_reference: string | null;
};

owners.getMyEarnings({ property_id?, from_ts?, to_ts? })
  => {
    summary: {
      pending_paise: number;
      approved_paise: number;
      disbursed_paise: number;
      failed_paise: number;
      voided_paise: number;
      total_disbursed_paise: number;
    },
    rows: OwnerEarningsRow[];
  }
```

### Owner Messages (P38-E05)

```ts
chatChannels.listForOwner({ cursor?, limit? })
  => { channels: ChatChannelCard[], nextCursor? }

chatMessages.listByChannelForOwner({ channel_id, cursor?, limit? })
  => { messages: ChatMessage[], nextCursor? }
```

### Owner Referrals (P38-E06)

```ts
referralCodes.getMyCode()
  => ReferralCode

referrals.getMyReferrals({ cursor?, limit? })
  => { referrals: ReferralCard[], nextCursor? }

referralMilestones.getMyMilestones()
  => ReferralMilestone[]
```

### Owner Service Requests & Documents (P38-E06)

```ts
type OwnerServiceRequestRow = {
  request_id: Id<"owner_service_requests">;
  status: OwnerServiceRequestStatus;
  created_at: number;
  contacted_at: number | null;
  location: string | null;
  property_type: string | null;
  property_value: number | null;
  owner_visible_notes: string | null;
};

type OwnerDocumentBundle = {
  requirement_id: Id<"document_requirements">;
  requirement_type: DocumentRequirementType;
  overall_status: DocumentOverallStatus;
  context: {
    lead_id: Id<"leads"> | null;
    listing_id: Id<"listings"> | null;
    closure_id: Id<"closures"> | null;
    property_label: string | null;
  };
  items: Array<{
    item_id: string;
    label: string;
    is_required: boolean;
    status: DocumentItemStatus;
    file_type: string | null;
    file_size: number | null;
    collected_at: number | null;
    rejection_notes: string | null;
  }>;
};

ownerServiceRequests.getMyRequests({})
  => { requests: OwnerServiceRequestRow[] }

documents.getMyDocuments({})
  => { requirements: OwnerDocumentBundle[] }
```

### Owner Profile (P38-E06)

```ts
owners.getMyProfile()
  => {
    owner_id: Id<"owners">,
    phone: string,
    name: string,
    email: string,
    rm_assignment: RmAssignment | null,
    check_ins: RmCheckIn[],
  }

owners.updateMyProfile({ name?, email?, notification_settings? })
  => Owner
```

---

## Schema

### Existing Tables Consumed (No New Schema in This Phase)

All tables pre-exist from prior phases:

- `owners` (P31) — canonical owner identity and lifecycle
- `owner_rm_assignments` (P31) — RM assignment tracking
- `rm_check_ins` (P31) — RM check-in history
- `listings` (P06) — property listings
- `leads` (P04) — vacant flat leads
- `tenant_inquiries` (P19) — tenant inquiry pipeline
- `visits` (P07) — visit scheduling and execution
- `closures` (P08) — deal closure records
- `payouts` (P09) — payout lifecycle
- `referral_codes` (P22) — owner referral codes
- `referrals` (P22) — referral attribution records
- `referral_milestones` (P22) — referral milestone tracking
- `owner_service_requests` (P20) — service request tracking
- `document_requirements` (P30) — document collection
- `chat_channels` (P24) — deal-room chat channels
- `chat_messages` (P24) — chat messages with AI masking

**No new schema tables are created in Phase 38.** All required data structures exist from prior phases.

---

## Architecture & Design Patterns

### Shared Portal Infrastructure (P38-E01)

**PortalShell** is a reusable layout wrapper for owner and future tenant portals:

```
PortalShell (owner | tenant)
  ├── PortalHeader (sticky, with back button + title)
  ├── {children} (page content)
  └── MobileNav (frosted glass, 4 primary routes + More trigger)
```

**PortalHeader** renders:

- Back button (if not on primary route)
- Portal title (e.g., "Owner Portal")
- Optional action buttons (e.g., notifications, settings)

**MobileNav** renders:

- 5 primary nav items with icons and active state
- "More" button that opens a bottom sheet with 5 secondary items
- Badge counts on nav items (e.g., pending requests)
- Frosted glass background with safe-area spacing

**Navigation Config** (`src/config/navigation.ts`):

- Typed contracts: `PortalId`, `PortalNavItem`, `PortalNavigationConfig`
- Owner nav definition with 9 concrete routes (4 primary + 5 More-menu routes) plus a `More` trigger entry
- Tenant nav definition (future-facing, not implemented in P38)
- Helper utilities: `getPortalConfig()`, `isPortalNavActive()`

### Auth Redirect Fix (P38-E02)

**Problem**: Current callback routes all Google SSO users to `/admin/dashboard` via email domain heuristics.

**Solution**: New server-side `/post-auth` resolver route:

```
1. Google SSO callback → /callback (existing WorkOS flow)
2. /callback → /post-auth (NEW resolver)
3. /post-auth reads Convex user_type from user record
4. Routes to /owner/dashboard, /guard/dashboard, /admin/dashboard, or /tenant/dashboard (`OPS` resolves to `/admin/dashboard`)
5. Fallback: unauthenticated or non-owner users are redirected to `/admin/login` (Google SSO entry point); in development mode, `/dev/login` is also available
```

**Benefits**:

- Eliminates email domain guessing
- Supports multiple user types per email (future-proof)
- Handles first-time non-synthetic users gracefully

### Owner Portal UX (P38-E03 through P38-E06)

**Design Principles**:

- Mobile-first (primary breakpoint: 375px–480px)
- Admin-style SaaS feel (clean, data-dense, action-oriented)
- Frosted glass nav (modern, accessible, safe-area aware)
- Indigo/violet accent palette (distinct from guard green, admin blue)
- Sticky header with back button for deep navigation
- Max-width container (768px) for readability on larger screens

**Information Architecture**:

Canonical IA for Phase 38 is **9 concrete routes**.

The IA consists of 4 primary routes + 5 More-menu routes = total 9 routes.

- Primary routes: Dashboard, Properties, Earnings, Messages
- More-menu routes: Leads, Referrals, Requests, Documents, Profile
- `More` is a navigation trigger, not a standalone route page

| Route                     | Purpose                                 | Primary? | Depends On |
| ------------------------- | --------------------------------------- | -------- | ---------- |
| `/owner/dashboard`        | KPIs, recent activity, RM info, alerts  | YES      | P31, P09   |
| `/owner/properties`       | Property list with status               | YES      | P06, P31   |
| `/owner/earnings`         | Payout history and summary              | YES      | P09        |
| `/owner/messages`         | Chat channels (inquiries, negotiations) | YES      | P24, P25   |
| `/owner/leads`            | Leads on owner's properties             | More     | P04, P31   |
| `/owner/referrals`        | Referral code and earnings              | More     | P22        |
| `/owner/service-requests` | Service request tracking                | More     | P20        |
| `/owner/documents`        | Document uploads and status             | More     | P30        |
| `/owner/profile`          | Owner identity and RM assignment        | More     | P31        |

**Chat Integration** (P38-E05):

Owner messages use `ChatView` component from P24 wrapped in an `InquiryChatPanel`:

```
/owner/messages
  ├── ChatChannelList (list of active channels)
  └── ChatChannelDetail
        └── InquiryChatPanel
              └── ChatView (AI-masked messages)
```

```ts
type InquiryChatPanelProps = {
  channelId: Id<"chat_channels">;
  ownerMode: boolean;
  showBackLink?: boolean;
};
```

Owner sees:

- Original message (what they typed)
- Masked version (what recipient sees)
- Status badges (sending, delivered, failed)
- Deal checklist context (from P25)

**Referral Integration** (P38-E06):

Owner referral dashboard shows:

- Referral code (FLAT-XXXXX format)
- Copy button + WhatsApp share button
- Referred tenants/owners with milestone status
- Earnings breakdown (sign-up bonus + finding bonuses)
- Stacking bonus explanation

**Service Request Integration** (P38-E06):

Owner service request tracking shows:

- Request list with status (submitted, contacted, onboarded, active)
- Request detail with timeline and notes
- Status transitions follow P20 state machine
- Admin actions are visible to owner

**Document Management** (P38-E06):

Owner document uploads show:

- Document list by property
- Upload status and validation
- Linked to deals and closures
- Regulatory item checklist

---

## Business Rules

1. **Owner scope enforcement**: Owners can read/write only data linked to their canonical `owners` identity; cross-owner visibility is forbidden.
2. **Route isolation**: `(owner)/` uses dedicated layout/auth guard and must not inherit admin-only controls.
3. **Auth model reuse**: Owner login uses existing Google SSO via WorkOS, no separate credential stack.
4. **Post-auth routing**: Server-side `/post-auth` resolver routes users by actual Convex `user_type` (GUARD/OPS/ADMIN/TENANT/OWNER), not email domain heuristics.
5. **Shared portal infrastructure**: `PortalShell`, `PortalHeader`, and `MobileNav` components are reusable for owner and future tenant portals; no portal-specific logic in shared components.
6. **Config-driven navigation**: Portal nav items are defined in `src/config/navigation.ts` with typed contracts; no hardcoded nav in components.
7. **Mobile-first design**: Owner portal renders mobile-first with sticky header, frosted bottom nav, safe-area spacing, and max-width container consistency.
8. **Bottom nav structure**: 4 primary routes (Dashboard, Properties, Earnings, Messages) + 5 More-menu routes (Leads, Referrals, Requests, Documents, Profile); `More` is a sheet trigger.
9. **Portfolio rollup**: Multi-property owners get aggregated metrics plus per-property drill-down from the same source of truth.
10. **Financial transparency**: Owner earnings view includes payout history, status breakdown, and filtering by property and date range.
11. **RM visibility**: Owners see assigned RM contact + check-in timeline when assignment exists.
12. **RM fallback**: If no RM assignment exists, UI shows default platform contact and follow-up request path.
13. **Deal-room messaging**: Owner messages use AI-masked chat from P24 infrastructure; owners see both original and masked versions.
14. **Referral sharing**: Owner referral code is shareable via copy or WhatsApp deep link; earnings are tracked and displayed.
15. **Service request tracking**: Owner can submit and track service requests; status transitions follow P20 state machine.
16. **Document management**: Owner can upload documents linked to properties and deals; collection status is tracked.
17. **Auditability**: Owner actions that impact tenant or financial state must generate audit events for admin oversight.
18. **No admin refactoring**: Existing admin, guard, and ops layouts remain unchanged; P38 introduces new owner/tenant infrastructure in parallel.

---

## Edge Cases

- **Owner with no active properties**: Dashboard shows onboarding CTA to submit property/service request and contact RM/platform.
- **Owner without RM assigned**: RM section shows default platform support contact and tracks pending assignment state.
- **Owner linked to many properties across societies**: Portfolio queries must paginate and preserve owner-only access constraints.
- **Property ownership transfer in progress**: Access remains with current linked owner until transfer is confirmed.
- **First-time Google SSO owner**: `/post-auth` resolver checks if owner account exists; if not, routes to owner onboarding flow (P20).
- **Owner with no active chat channels**: Messages page shows empty state with CTA to submit inquiry or contact support.
- **Owner with no referral code**: Referral page shows code generation CTA and explains referral program benefits.
- **Owner with no service requests**: Service requests page shows empty state with CTA to submit new request.
- **Owner with no documents**: Documents page shows empty state with upload CTA and required document checklist.
- **Owner account inactive/suspended**: Owner portal access blocked while admin and audit visibility remain available.
- **Chat channel with failed AI masking**: Message shows admin review flag; owner sees original text with warning badge.
- **Payout with failed payment**: Earnings page shows payout with error status and retry/contact support options.

---

## Implementation Details

See `tasks/phase-38-owner-portal-dashboard/` for the complete task breakdown:

- **P38-E01**: Shared Portal Foundation (4 tasks) — navigation config, PortalHeader, MobileNav, PortalShell
- **P38-E02**: Auth Redirect Fix (3 tasks) — /post-auth resolver, callback flow, fallback handling
- **P38-E03**: Owner Portal Shell & Dashboard (4 tasks) — route scaffolding, getMyDashboardSummary query, dashboard UI, legacy migration
- **P38-E04**: Owner Properties, Leads & Earnings (4 tasks) — properties list, leads list, earnings view, property detail
- **P38-E05**: Owner Messages & Deal Room (4 tasks) — chat channel list, chat detail, InquiryChatPanel wrapper, read receipts
- **P38-E06**: Owner Referrals, Requests, Documents & Profile (5 tasks) — referral dashboard, service requests, documents, profile, RM contact

---

## Actual Epic Filenames (Phase 38)

- `tasks/phase-38-owner-portal-dashboard/P38-E01-shared-portal-foundation.md`
- `tasks/phase-38-owner-portal-dashboard/P38-E02-auth-redirect-fix.md`
- `tasks/phase-38-owner-portal-dashboard/P38-E03-owner-portal-shell-dashboard.md`
- `tasks/phase-38-owner-portal-dashboard/P38-E04-owner-properties-leads-earnings.md`
- `tasks/phase-38-owner-portal-dashboard/P38-E05-owner-messages-deal-room.md`
- `tasks/phase-38-owner-portal-dashboard/P38-E06-owner-referrals-requests-docs-profile.md`

## Related Documents

- [Owner Entity & RM Foundation](21-owner-entity-and-rm.md) — canonical owner identity and RM linkage rules
- [Owner Services](14-owner-services.md) — owner account onboarding and service request lifecycle
- [Deal Room](18-deal-room.md) — owner chat and checklist expectations
- [Referral System](17-referral-system.md) — owner referral UX and payout model
- [Field Checklists](21-field-checklists.md) — document collection and regulatory items
- [Chat Infrastructure](../features/18-deal-room.md) — AI-masked messaging transport
- [Roles & Permissions](../03-roles-and-permissions.md) — permission gating and role-safe access
- [Constants Reference](../13-constants-reference.md) — status enums and nav-safe constants
- [State Machines](../04-state-machines.md) — service request and payout status transitions
- [Multi-Persona Identity](36-multi-persona-identity.md) — P45 enables users to hold OWNER persona alongside other personas. Owner layout will be updated to use `user_types.includes()` pattern.
