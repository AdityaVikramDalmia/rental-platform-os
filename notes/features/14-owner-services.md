# Feature: Owner Services

> **Priority**: #20 in implementation order
> **Personas**: Property Owner (public), Ops Agent, Super Admin
> **Dependencies**: Auth (P01)
> **Route Groups**: `(public)/`, `(admin)/`

## Purpose

The owner services feature captures property owner leads through a public contact form and tracks them through an ops-managed onboarding pipeline. V1 is a simple lead capture funnel — the full owner self-service portal (service plans, ROI calculator, case studies) is V2.

## Entities Involved

- `owner_service_requests` table (core entity)
- `users` table (created on onboarding with `user_type: OWNER`)

## V1 Scope

### What V1 IS

- Public owner services page with contact/lead capture form
- Form submission persisted as `owner_service_requests` record
- Admin/OPS queue for managing owner requests (SUBMITTED → CONTACTED → ONBOARDED → ACTIVE)
- Owner account creation during onboarding (Google SSO via WorkOS)
- Minimal authenticated owner experience (property status check)

### What V1 IS NOT (V2)

- Service plan comparison cards with pricing tiers
- ROI calculator with slider-driven return simulation
- Before/after case study cards with testimonials
- Owner onboarding timeline visualization
- Owner FAQ module
- Owner dashboard with property analytics

See [V2 Backlog](../09-v2-backlog.md) — "V2: Owner Service Plans & ROI".

## User Stories

### Owner: Submit Contact Form

**As a property owner**, I want to express interest in DemoRentals's property management services so that their team can contact me.

**Acceptance Criteria**:

- Public page at `(public)/owner-services/`
- Hero section: value proposition, trust signals, CTA
- Contact form fields:
  - Name (required)
  - Phone (required, 10-digit Indian phone)
  - Email (optional)
  - Property Type (optional: 1BHK, 2BHK, 3BHK, Villa, Other)
  - Property Location / Society (optional, text input)
  - Approximate Property Value (optional, number input in ₹)
  - Message / Notes (optional, textarea)
- On submit: create `owner_service_requests` record (status: SUBMITTED)
- Toast: "Thank you! Our team will contact you within 24 hours."
- No authentication required

### Admin/Ops: Manage Owner Requests

**As an admin or ops agent with permission**, I want to manage incoming owner requests so I can onboard new property owners.

**Acceptance Criteria**:

- Owner request queue at `(admin)/owner-requests/`
- Status tabs: SUBMITTED, CONTACTED, ONBOARDED, ACTIVE
- Side panel: owner details, property info, ops notes, status actions
- Actions: Contact (→ CONTACTED), Onboard (→ ONBOARDED, creates user account), Activate (→ ACTIVE), Reject, Drop
- When onboarding: admin or OPS user (with `owner_service_requests.manage`) creates WorkOS account with owner's Google email → user created with `user_type: OWNER`

See [Admin Panel UX](../06-admin-panel-ux.md) Owner Service Request Management section for wireframes.

---

## Owner Services Page Layout (V1)

```
┌─────────────────────────────────────────────────────┐
│ [Shared Header with DemoRentals Branding]               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ── Hero Section ──                                 │
│  "Let us manage your property"                      │
│  Trust signals: X properties managed, Y% occupancy  │
│  [Contact Us ↓]                                     │
│                                                     │
│  ── Why Choose DemoRentals ──                           │
│  Benefits grid (4-6 cards):                         │
│  • Guaranteed rent collection                       │
│  • Professional tenant screening                    │
│  • Legal & documentation support                    │
│  • 24/7 property maintenance                        │
│  • Transparent pricing                              │
│  • Regular property reports                         │
│                                                     │
│  ── Contact Form ──                                 │
│  [Name] [Phone] [Email]                             │
│  [Property Type ▼] [Location]                       │
│  [Property Value]                                   │
│  [Message]                                          │
│  [Submit Request]                                   │
│                                                     │
│  ── Trust Signals ──                                │
│  Config-backed contact info (phone, email, address) │
│  DemoRentals branding and licensing info                │
│                                                     │
│ [Shared Footer]                                     │
└─────────────────────────────────────────────────────┘
```

---

## Convex Functions

### Queries

```
ownerServiceRequests.list({ status?, cursor? }) → { requests: OwnerServiceRequest[], nextCursor? }
ownerServiceRequests.getById({ id }) → OwnerServiceRequest
```

### Mutations

```
ownerServiceRequests.submit({ name, phone, email?, property_type?, location?, property_value?, notes? }) → OwnerServiceRequest
ownerServiceRequests.updateStatus({ id, status, ops_notes? }) → OwnerServiceRequest
ownerServiceRequests.onboard({ id, owner_email }) → OwnerServiceRequest + User (creates WorkOS + Convex user)
```

---

## Business Rules

1. Owner contact form is public — no authentication required.
2. Phone numbers stored as 10 digits. See [Data Models](../02-data-models.md) conventions.
3. Property value stored in paise (integer × 100) — must be positive integer.
4. Onboarding creates a WorkOS user with the owner's Google email → user created with `user_type: OWNER`. Returns `isNewOwner` flag to indicate if account was newly created.
5. Status transitions follow [State Machines](../04-state-machines.md) — Owner Service Request section. ACTIVE status is enforced on permission checks.
6. All form submissions are persisted and auditable via Convex mutations. No client-only submissions.
7. Contact info (phone, email) on public page is config-backed via `system_config` keys (`demorentals_contact_phone`, `demorentals_whatsapp_phone`).
8. DemoRentals branding is applied throughout the page (logo, colors, messaging).
9. Admin UI includes ALL 6 status tabs: SUBMITTED, CONTACTED, ONBOARDED, ACTIVE, REJECTED, DROPPED.
10. All 5 action dialogs (Contact, Reject, Drop, Onboard, Activate) are refactored to use react-hook-form + zod for validation.
11. Owner request status transitions and onboarding account creation are available to admin users and OPS users with `owner_service_requests.manage` permission.

---

## Edge Cases

- **Duplicate phone number**: Allow multiple requests from same phone (owner may have multiple properties). Ops can flag duplicates manually.
- **Owner already has account**: If a WorkOS user with that email already exists during onboarding, link to existing user instead of creating new one.
- **Invalid phone format**: Validate 10-digit Indian phone on client and server.
