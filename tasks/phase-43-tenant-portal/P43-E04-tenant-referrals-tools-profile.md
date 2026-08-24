---
id: P43-E04
title: Tenant Referrals, Tools & Profile
phase: 43
status: pending
depends_on: ["P38-E01", "P38-E02", "P43-E01", "P34", "P35"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P43-E04: Tenant Referrals, Tools & Profile

## Overview

Implement the tenant "More" destinations (`/tenant/referrals`, `/tenant/tools`, `/tenant/profile`) inside the tenant portal shell, reusing existing referral and tools building blocks while adding missing tenant profile data APIs. This epic keeps tenant routing portal-native (no redirects to public pages), uses `requireTenant(ctx)` identity scoping (no backoffice RBAC checks), and aligns with existing referral/profile conventions.

## Documentation Alignment (Mandatory)

- Follow P43 feature-spec "Offline & Error States" and "Loading Skeleton Specs" for Referrals and Profile pages; Tools remains fully offline and does not require server-loading skeletons.
- Emit analytics events for this epic surfaces: `tenant.referral_shared`, `tenant.tool_used`, and `tenant.profile_updated`.

## Prerequisites

- **Read first**: `P43-E01` for tenant shell composition and More-sheet nav contract.
- Referral backend from P22 exists in `convex/referralCodes.ts` and `convex/referrals.ts`.
- Shared referral UI exists in `src/components/shared/referral-dashboard.tsx` and guard wiring exists in `src/components/guard/guard-referral-section.tsx`.
- Public tools composition exists in `src/app/(public)/tools/tools-page-client.tsx` using tenant tool components.
- `tenant_profiles` table exists in `convex/schema.ts` but tenant self-serve profile read/update APIs are not implemented.

## Task Queue

- [x] P43-E04-T01: Add tenant profile API module (`tenantProfile.getMine`, `tenantProfile.updateMine`)
- [x] P43-E04-T02: Build `/tenant/referrals` page using shared referral dashboard and existing referral APIs
- [x] P43-E04-T03: Build `/tenant/tools` route by composing tenant tools in shell (no redirect)
- [x] P43-E04-T04: Build `/tenant/profile` page with account details and preference editing

---

## Epic Verification (Mandatory)

- Verify cross-tenant isolation by direct query manipulation: tenant A cannot read/update tenant B profile or referral aggregates.
- Verify responsive visual checks at 375px, 390px, and 768px.

---

## T01: Add Tenant Profile API Module (`tenantProfile.getMine`, `tenantProfile.updateMine`)

### Objective

Create tenant-scoped profile read/update APIs so `/tenant/profile` can manage tenant identity and preference fields without reusing guard-only profile mutations.

### Required Reading

- `convex/users.ts`
- `convex/auth.helpers.ts`
- `convex/schema.ts` (`users`, `tenant_profiles`)
- `lib/validators.ts`
- `notes/10-convex-schema.md`
- `notes/11-convex-architecture.md`

### Key Rules

1. Create `convex/tenantProfile.ts` with tenant-auth-guarded APIs using `requireTenant(ctx)`:
   - `getMine` query (args `{}`)
   - `updateMine` mutation with validated profile payload
2. `getMine` must return a normalized shape that combines `users` and `tenant_profiles`:
   ```ts
   {
     user_id: Id<"users">;
     name: string;
     email: string;
     phone: string | null;
     preferences: {
       localities: string[];
       budget_min: number | null;
       budget_max: number | null;
       property_types: string[];
     };
   }
   ```
3. `updateMine` must update `users.name` plus tenant profile fields atomically in one mutation.
4. Create tenant profile row on-demand if missing (idempotent upsert behavior).
5. Validate phone format using shared normalization utilities (`normalizePhone` from `lib/validators.ts`), enforce 10-digit storage, and sanitize all string inputs (`trim`, empty -> undefined/null according to contract).
6. Validate `preferences.property_types` against centralized enum/constants values; reject unknown types.
7. Profile updates must emit audit action `TENANT_PROFILE_UPDATE`.
8. Do not modify guard/ops/admin profile flows and do not add broad `requireAuth` updates that bypass tenant gating.

### Deliverables

- [ ] `convex/tenantProfile.ts` - tenant profile read/update module with strict tenant ownership checks

### Acceptance Criteria

1. `api.tenantProfile.getMine` returns current tenant profile payload even when profile row was previously absent.
2. `api.tenantProfile.updateMine` updates only the current tenant and enforces validation rules.
3. Invalid payloads (bad phone, invalid budget range, invalid property types) fail with clear errors.
4. No behavior change is introduced for existing guard/admin/ops profile APIs.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `convex/tenantProfile.ts`.

### Out of Scope

- Tenant profile page UI
- Referral page implementation
- Tools route implementation

---

## T02: Build `/tenant/referrals` Page Using Shared Referral Dashboard and Existing Referral APIs

### Objective

Deliver a tenant referral screen inside the tenant shell by reusing `ReferralDashboard` and current referral backend APIs (`referralCodes`, `referrals`).

### Required Reading

- `src/components/shared/referral-dashboard.tsx`
- `src/components/guard/guard-referral-section.tsx`
- `convex/referrals.ts` (`listByReferrer`)
- `convex/referralCodes.ts` (`getByUser`, `generate`)
- `lib/constants.ts` (`REFERRAL_TYPE`, `USER_TYPE`, milestone enums)
- `notes/features/17-referral-system.md`

### Key Rules

1. Create page route `src/app/(tenant)/tenant/referrals/page.tsx` as a client page under tenant shell.
2. Use these APIs:
   - `useQuery(api.referrals.listByReferrer, { referral_type: REFERRAL_TYPE.TENANT_FINDING })`
   - `useQuery(api.referralCodes.getByUser)`
   - `useQuery(api.referralMilestones.getEarningsSummary, { user_id: currentUser._id })` (must fail closed for non-owner caller)
   - `useMutation(api.referralCodes.generate)` to create code when missing
3. Reuse shared `ReferralDashboard` component instead of building a tenant-only referral card system.
4. Add tenant wrapper component `src/components/tenant/tenant-referral-section.tsx` to map API payload into `ReferralDashboard` props, including milestone totals in paise from `getEarningsSummary`.
5. Set `userType={USER_TYPE.TENANT}` and include deterministic `share_url` format (`/ref/[code]` on current host).
6. Keep page portal-native and mobile-first; do not link users out to admin or guard referral pages.
7. Referral share actions must emit audit action `TENANT_REFERRAL_SHARE`.

### Deliverables

- [ ] `src/app/(tenant)/tenant/referrals/page.tsx` - tenant referrals route
- [ ] `src/components/tenant/tenant-referral-section.tsx` - tenant-specific wrapper around shared referral dashboard

### Acceptance Criteria

1. `/tenant/referrals` renders referral summary, outgoing referrals, and share actions for tenant users.
2. Missing referral code can be generated from page without reload loops.
3. Monetary values render as INR from paise using existing utilities.
4. Referral earnings totals are sourced from `referralMilestones.getEarningsSummary`.
5. No duplicate referral dashboard implementation is introduced.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/tenant/referrals/page.tsx` and `src/components/tenant/tenant-referral-section.tsx`.

### Out of Scope

- Referral analytics/admin management pages
- Owner referral flows
- Changes to referral state machine or payout logic

---

## T03: Build `/tenant/tools` Route by Composing Tenant Tools in Shell (No Redirect)

### Objective

Create a tenant-shell tools destination that reuses the existing tools composition and components while preserving a `/tenant/tools` URL.

### Required Reading

- `src/app/(public)/tools/page.tsx`
- `src/app/(public)/tools/tools-page-client.tsx`
- `src/components/tenant/rent-calculator.tsx`
- `src/components/tenant/commute-estimator.tsx`
- `src/components/tenant/roommate-quiz.tsx`
- `src/components/tenant/rental-checklist.tsx`
- `notes/features/16-tenant-tools.md`

### Key Rules

1. Create `src/app/(tenant)/tenant/tools/page.tsx` and render an in-shell tools composition (not `redirect("/tools")`).
2. Extract reusable presentation into `src/components/tenant/tenant-tools-page-client.tsx` if needed; avoid duplicating tool internals.
3. Use the same tool tab set and checklist composition as public tools page (`rent-calculator`, `commute-estimator`, `roommate-quiz`, checklist section).
4. Keep layout spacing compatible with tenant shell constraints (header + bottom nav) and mobile one-hand use.
5. Do not break existing public `/tools` route behavior.

### Deliverables

- [ ] `src/app/(tenant)/tenant/tools/page.tsx` - tenant tools page route under shell
- [ ] `src/components/tenant/tenant-tools-page-client.tsx` - tenant-shell tools composition (if extracted)

### Acceptance Criteria

1. `/tenant/tools` renders full tools experience inside tenant shell.
2. Route does not perform redirect to `/tools`.
3. Public `/tools` continues to work unchanged.
4. Tool tabs and checklist function exactly as in existing tools implementation.
5. Page passes visual checks at 375px, 390px, and 768px.
6. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/tenant/tools/page.tsx` and `src/components/tenant/tenant-tools-page-client.tsx` (if created/modified).

### Out of Scope

- New tool algorithms or datasets
- Tool persistence backend migration
- Public tools redesign

---

## T04: Build `/tenant/profile` Page With Account Details and Preference Editing

### Objective

Deliver a tenant profile settings page that edits core profile and search preference fields using the new tenant profile API, and supports referral/share entry points.

### Required Reading

- `src/app/(guard)/guard/profile/page.tsx`
- `src/components/ui/form.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/slider.tsx`
- `convex/tenantProfile.ts` (from T01)
- `convex/users.ts` (`getCurrentUser`)
- `notes/features/11-tenant-browse.md`

### Key Rules

1. Create `src/app/(tenant)/tenant/profile/page.tsx` and fetch profile with `useQuery(api.tenantProfile.getMine)`.
2. Build editable form using `react-hook-form` + `zod` with shadcn controls only (no native date/time/select inputs).
3. Editable fields must include at minimum:
   - name
   - phone
   - preferred localities (multi-entry token list)
   - budget_min / budget_max
   - property_types preferences
4. Save action must call `useMutation(api.tenantProfile.updateMine)` and show `sonner` success/error toasts.
5. Include a "Manage referrals" action linking to `/tenant/referrals` and a "Browse listings" action linking to `/listings`.
6. Provide clear non-editable identity context (email, user type) and robust loading/error/empty states.

### Deliverables

- [ ] `src/app/(tenant)/tenant/profile/page.tsx` - tenant profile settings route
- [ ] `src/components/tenant/profile/tenant-profile-form.tsx` - form component with validation and save workflow

### Acceptance Criteria

1. `/tenant/profile` loads current tenant data and renders editable profile/preferences.
2. Save updates persist through `tenantProfile.updateMine` and survive page reload.
3. Validation errors are visible inline and prevent invalid submissions.
4. Page actions correctly deep-link to `/tenant/referrals` and `/listings`.
5. Page passes visual checks at 375px, 390px, and 768px.
6. Keyboard navigation + visible focus states pass accessibility checks.
7. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/app/(tenant)/tenant/profile/page.tsx`, `src/components/tenant/profile/tenant-profile-form.tsx`, and `convex/tenantProfile.ts`.

### Out of Scope

- Avatar upload and document verification workflows
- Owner or guard profile flows
- Notification preferences and messaging settings
