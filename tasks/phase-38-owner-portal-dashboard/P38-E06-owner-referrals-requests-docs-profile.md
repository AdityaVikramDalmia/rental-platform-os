---
id: P38-E06
title: Owner Referrals, Requests, Documents & Profile
phase: 38
status: pending
depends_on: ["P38-E03"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P38-E06: Owner Referrals, Requests, Documents & Profile

## Overview

Implement all owner "More" surfaces beyond leads: referrals, service requests, documents, and profile. This epic completes the owner IA and closes the gap between owner onboarding lifecycle data and owner self-serve visibility.

## Prerequisites

- P38-E03 owner shell and nav are complete.
- P22 referral flows and shared `ReferralDashboard` component are available.
- P20 owner service requests lifecycle is implemented and admin-facing queue exists.
- Documents foundation from P30 (`document_requirements`) is available for owner-linked read flows.

## Task Queue

- [ ] P38-E06-T01: Add owner-scoped backend queries for requests and documents
- [ ] P38-E06-T02: Build `/owner/referrals` page using shared referral dashboard
- [ ] P38-E06-T03: Build `/owner/service-requests` lifecycle page
- [ ] P38-E06-T04: Build `/owner/documents` required-documents page with upload actions
- [ ] P38-E06-T05: Build `/owner/profile` page and finalize More-sheet route coverage

---

## T01: Add Owner-Scoped Backend Queries for Requests and Documents

### Objective

Add the missing owner-facing backend contracts needed for More-sheet pages by exposing service request history and document requirements scoped to the authenticated owner.

### Required Reading

- `convex/ownerServiceRequests.ts` - existing admin/public request APIs and status transitions
- `convex/documents.ts` - requirement and item models, upload and verification flow
- `convex/owners.ts` - owner identity resolution conventions (`getMyOwnerProfile`)
- `convex/auth.helpers.ts` - `requireOwner` behavior
- `convex/schema.ts` - `owner_service_requests` and `document_requirements` fields/indexes

### Key Rules

1. For `getMyRequests`, return:
   - `requests: Array<{ _id, status, created_at, contacted_at, location, property_type, property_value, owner_visible_notes }>`.
2. For `getMyDocuments`, return:
   - `requirements: Array<{ _id, requirement_type, overall_status, context, items[] }>`
   - where `items[]` includes `{ item_id, label, is_required, status, file_type, file_size, collected_at, rejection_notes }`.
3. Keep response fields owner-safe; do not expose internal admin-only notes beyond what owner should see.
4. Use existing status enums and do not introduce new request/document status values.
5. Ensure both queries return stable empty arrays instead of throwing when no records are found.

### Deliverables

- [ ] `convex/ownerServiceRequests.ts` - `getMyRequests` query
- [ ] `convex/documents.ts` - `getMyDocuments` query

### Acceptance Criteria

1. Owner can fetch their own service request history without admin permissions.
2. Owner can fetch document requirement bundles tied to their properties/deals.
3. Query results are restricted to authenticated owner scope.
4. Queries are resilient when owner has no requests/documents.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `convex/ownerServiceRequests.ts` and `convex/documents.ts`.

### Out of Scope

- Admin queue behavior changes
- Document verification/rejection policy changes
- New schema tables

---

## T02: Build `/owner/referrals` Page Using Shared Referral Dashboard

### Objective

Deliver owner referral visibility under More navigation by reusing the shared referral dashboard with owner-appropriate copy and sharing affordances.

### Required Reading

- `src/components/shared/referral-dashboard.tsx` - reusable dashboard component API
- `src/components/guard/guard-referral-section.tsx` - concrete adapter usage pattern
- `convex/referrals.ts` - `getMyReferrals` and analytics fields
- `convex/referralCodes.ts` - `getMyCode` retrieval/generation APIs
- `convex/referralMilestones.ts` - `getMyMilestones` payout milestone history
- `notes/features/17-referral-system.md` - owner referral UX and stacking bonus expectations

### Key Rules

1. Create route `src/app/(owner)/owner/referrals/page.tsx`.
2. Build adapter component `src/components/owner/referrals/OwnerReferralSection.tsx` that:
   - queries owner referral data (`api.referrals.getMyReferrals`)
   - queries owner code (`api.referralCodes.getMyCode`)
   - queries owner milestones (`api.referralMilestones.getMyMilestones`)
   - computes milestone totals for display in `ReferralDashboard`
3. Reuse `ReferralDashboard` directly; do not fork UI structure for owner variant.
4. Include share actions (copy and Web Share) and owner-focused empty states.
5. Keep referred-user privacy behavior unchanged (`User #N`, no PII leakage).

### Deliverables

- [ ] `src/app/(owner)/owner/referrals/page.tsx` - owner referrals route
- [ ] `src/components/owner/referrals/OwnerReferralSection.tsx` - owner adapter over shared referral dashboard

### Acceptance Criteria

1. `/owner/referrals` renders referral totals, statuses, and share code details.
2. Shared `ReferralDashboard` is reused with owner-specific adapter data.
3. Share and copy interactions work in owner context.
4. Referred-user PII is not exposed.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on owner referrals files.

### Out of Scope

- Admin referral management actions
- Referral config editing
- Referral leaderboard implementation

---

## T03: Build `/owner/service-requests` Lifecycle Page

### Objective

Create owner-facing service request tracking page so owners can see lifecycle progression from submitted to active without visiting admin surfaces.

### Required Reading

- `convex/ownerServiceRequests.ts` - `getMyRequests` contract from T01 and status constants
- `lib/constants.ts` - `OWNER_SERVICE_REQUEST_STATUS`, labels, and status colors
- `notes/features/14-owner-services.md` - request lifecycle and owner expectations
- `src/app/(admin)/admin/owner-requests/page.tsx` - admin status tab UX reference (owner version is read-only)

### Key Rules

1. Add route `src/app/(owner)/owner/service-requests/page.tsx`.
2. Query source must be `api.ownerServiceRequests.getMyRequests` only.
3. Render timeline/list cards with:
   - request created date
   - status badge
   - property/location summary
   - latest ops notes suitable for owner view
4. Include status explanation copy per lifecycle stage (`SUBMITTED`, `CONTACTED`, `ONBOARDED`, `ACTIVE`, `REJECTED`, `DROPPED`).
5. Keep page read-only in this phase; no status-changing owner actions.

### Deliverables

- [ ] `src/app/(owner)/owner/service-requests/page.tsx` - owner service request tracking page
- [ ] `src/components/owner/requests/OwnerRequestTimeline.tsx` - request timeline/list component

### Acceptance Criteria

1. `/owner/service-requests` shows owner-only request history and statuses.
2. Status badge label and color for each request row are sourced from shared owner-service status constants (no hardcoded status strings).
3. Empty state clearly directs owner to submit new request if none exist.
4. Page is read-only and does not expose admin controls.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on owner service request files.

### Out of Scope

- Owner request creation form (public owner-services page already covers submission)
- Admin reassignment and onboarding actions
- SLA escalation automation

---

## T04: Build `/owner/documents` Required-Documents Page with Upload Actions

### Objective

Deliver owner documents page that shows required document bundles and allows owner-safe uploads for pending document items.

### Required Reading

- `convex/documents.ts` - requirement/item model, upload URL generation, collect flow
- `convex/schema.ts` - `document_requirements` item fields and statuses
- `lib/constants.ts` - document status enums/labels
- `notes/features/20-ops-portal.md` and `notes/features/21-field-checklists.md` - document handling expectations

### Key Rules

1. Add route `src/app/(owner)/owner/documents/page.tsx`.
2. Data source must be `api.documents.getMyDocuments` from T01.
3. For each requirement bundle, render:
   - requirement type
   - linked property/deal context
   - overall status
   - item-level status rows (`PENDING`, `COLLECTED`, `VERIFIED`, `REJECTED`, `NA`)
4. Implement owner-safe upload action for pending/rejected items via dedicated owner mutation path (or owner-authorized variant of collect flow) without granting admin-level document permissions.
5. Upload flow must validate content type and size constraints consistent with existing document rules.
6. Show upload success/failure feedback with `sonner` toasts and refresh requirement state after upload.

### Deliverables

- [ ] `src/app/(owner)/owner/documents/page.tsx` - owner documents route
- [ ] `src/components/owner/documents/OwnerDocumentRequirementCard.tsx` - requirement card with item rows and upload controls
- [ ] Owner-safe document upload mutation/query wiring in `convex/documents.ts` (if required for upload path)

### Acceptance Criteria

1. `/owner/documents` shows owner-linked requirement bundles and item statuses.
2. Owner can upload pending/rejected document items through owner-authorized path.
3. Uploaded items transition to collected state with refreshed UI.
4. Invalid file type/size is rejected with clear user feedback.
5. `npx tsc --noEmit` and `npm run build` pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed owner document files and any `convex/documents.ts` owner upload additions.

### Out of Scope

- Admin document verification queue UX
- Regulatory item workflows
- OCR/AI extraction from uploaded documents

---

## T05: Build `/owner/profile` Page and Finalize More-Sheet Route Coverage

### Objective

Create owner profile/settings page with identity + RM contact context and ensure all More-sheet destinations resolve and render correctly.

### Required Reading

- `convex/owners.ts` - owner profile and RM assignment queries (`getMyOwnerProfile`, `getMyRmAssignment`, `getMyCheckIns`)
- `src/app/(owner)/owner/status/page.tsx` - existing owner profile and RM display logic
- `src/config/navigation.ts` - owner More-sheet nav definitions
- `lib/constants.ts` - owner lifecycle and RM labels/colors

### Key Rules

1. Add route `src/app/(owner)/owner/profile/page.tsx`.
2. Profile page must render:
   - owner identity basics (name, email/phone when available)
   - lifecycle stage badge
   - assigned RM contact + status summary
   - recent RM check-ins preview
3. If owner profile mutation support is added, only allow safe editable fields (for example display name, preferred contact method) and keep canonical linkage fields non-editable.
4. Validate that all More-sheet routes from nav config now exist and are reachable:
   - `/owner/leads`
   - `/owner/referrals`
   - `/owner/service-requests`
   - `/owner/documents`
   - `/owner/profile`
5. Keep profile page mobile-first and consistent with owner theme tokens.

### Deliverables

- [ ] `src/app/(owner)/owner/profile/page.tsx` - owner profile route
- [ ] `src/components/owner/profile/OwnerProfileCard.tsx` - owner identity/lifecycle card
- [ ] `src/components/owner/profile/OwnerRmContactCard.tsx` - RM contact/check-in summary card
- [ ] `src/config/navigation.ts` - navigation verification updates ensuring all More-sheet links resolve

### Acceptance Criteria

1. `/owner/profile` renders owner and RM context from owner-scoped queries.
2. Navigation smoke check passes for `/owner/leads`, `/owner/referrals`, `/owner/service-requests`, `/owner/documents`, `/owner/profile` (HTTP 200, no redirect loop).
3. Profile UI preserves owner-only data boundaries.
4. `npx tsc --noEmit` passes.
5. `lsp_diagnostics` reports no errors on owner profile files and touched navigation files.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on owner profile files and any navigation files touched.

### Out of Scope

- Password/security settings management
- Full notification-preferences center
- Tenant profile system work
