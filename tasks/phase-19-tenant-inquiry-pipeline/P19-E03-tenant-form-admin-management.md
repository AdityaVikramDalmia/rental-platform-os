---
id: P19-E03
title: Tenant Form & Admin Inquiry Management
phase: 19
status: done
depends_on: ["P19-E02"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P19-E03: Tenant Form & Admin Inquiry Management

## Overview

Build the tenant-facing visit request form integrated into the listing detail page, the inquiry status badge component, the admin inquiry queue page with paginated table and status tabs, and the inquiry detail panel with action dialogs for review/reject/postBounty/scheduleVisit.

## Prerequisites

- **Read first**: [P19-E02 Completion Summary](P19-E02-backend-lifecycle-functions.md#completion-summary) — all backend mutations and queries are functional (`tenantInquiries.submit`, `review`, `reject`, `postBounty`, `scheduleVisit`, `list`, `getById`).
- **Read first**: [P19-E01 Completion Summary](P19-E01-schema-auth-constants.md#completion-summary) — `TENANT_INQUIRY_STATUS`, `TENANT_INQUIRY_STATUS_COLORS`, `PERMISSIONS.TENANT_INQUIRIES_VIEW`, and `PERMISSIONS.TENANT_INQUIRIES_MANAGE` exist.
- Existing listing detail page lives at `src/app/listing/[slug]/page.tsx`.
- Existing public contact form pattern lives at `src/app/listing/[slug]/components/contact-form.tsx`.

## Task Queue

- [x] P19-E03-T01: Inquiry Form Component + Status Badge
- [x] P19-E03-T02: Integrate Into Listing Detail Page
- [x] P19-E03-T03: Admin Inquiry Queue Page + Table
- [x] P19-E03-T04: Inquiry Detail Panel + Action Dialogs

---

## T01: Inquiry Form Component + Status Badge

### Objective

Create a reusable tenant inquiry form component with `react-hook-form` + `zod` validation and a reusable inquiry status badge component that maps inquiry statuses to centralized color constants.

### Required Reading

- `notes/features/13-tenant-inquiry.md` — "Tenant: Submit Visit Request" acceptance criteria and submission UX copy
- `notes/13-constants-reference.md` — "Tenant Inquiry Status" color/variant table
- `src/app/listing/[slug]/components/contact-form.tsx` — current listing form submission + success-state pattern
- `src/components/admin/GuardCreateDialog.tsx` — canonical `react-hook-form` + `zodResolver` + shadcn Form pattern
- `src/components/shared/listing-status-badge.tsx` — badge mapping/fallback pattern to replicate
- `lib/constants.ts` — `TENANT_INQUIRY_STATUS` and `TENANT_INQUIRY_STATUS_COLORS`
- `src/components/ui/date-picker.tsx`, `src/components/ui/select.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/badge.tsx` — required shadcn input components

### Key Rules

1. Create `src/components/tenant/inquiry-form.tsx` as a `"use client"` component with props:
   ```typescript
   {
     listingId: Id<"listings">;
     onSuccess?: () => void;
   }
   ```
2. Form implementation must use `react-hook-form` + `zod` + `zodResolver` and shadcn `Form` primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`) following `GuardCreateDialog.tsx` conventions.
3. Required form fields and controls:
   - `preferred_visit_date`: shadcn `DatePicker`
   - `preferred_visit_slot`: shadcn `Select` with exact options: `Morning 9-12`, `Afternoon 12-3`, `Evening 3-6`, `Late Evening 6-9`
   - `message`: shadcn `Textarea` (optional)
4. Do not use native HTML date/time/select/textarea replacements when a shadcn component exists.
5. Submit via `tenantInquiries.submit` mutation with payload shape from E02 (`listing_id`, optional preferred date/slot/message).
6. Include loading and disabled submit states (`isSubmitting`/pending state) and error toast handling for non-rate-limit failures.
7. On successful submit, show success state text exactly: `Visit request submitted! Our team will review and get back to you.` and invoke optional `onSuccess` callback.
8. Handle rate-limit errors explicitly: toast text must be exactly `Too many requests. Please try again later.`.
9. Create `src/components/shared/inquiry-status-badge.tsx` using the same mapping structure as `listing-status-badge.tsx`, but for `TENANT_INQUIRY_STATUS` and `TENANT_INQUIRY_STATUS_COLORS`.
10. Use shadcn `Badge` component for the status badge rendering; include safe fallback classes for unknown status values.
11. Keep all new filenames in kebab-case.
12. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/tenant/inquiry-form.tsx` — tenant visit request form with submit/success/error states
- [ ] `src/components/shared/inquiry-status-badge.tsx` — inquiry status-to-color badge component

### Acceptance Criteria

1. Inquiry form renders DatePicker, time-slot Select, and optional message Textarea using shadcn components.
2. Submit calls `tenantInquiries.submit` and sends `listing_id` + optional fields in backend-compatible shape.
3. Success state displays exact required copy and is reachable on successful mutation.
4. Rate-limit failures display exact required toast copy.
5. `InquiryStatusBadge` maps all tenant inquiry statuses to `TENANT_INQUIRY_STATUS_COLORS` with readable labels.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/tenant/inquiry-form.tsx` and `src/components/shared/inquiry-status-badge.tsx`.

### Out of Scope

- Listing page integration/auth gating (T02)
- Admin queue/table UI (T03)
- Admin detail panel and action dialogs (T04)

---

## T02: Integrate Into Listing Detail Page

### Objective

Integrate the tenant inquiry form into the existing listing detail contact section with auth-aware rendering logic while preserving the current non-tenant contact form experience.

### Required Reading

- `src/app/listing/[slug]/page.tsx` — existing page layout and contact block composition
- `src/app/listing/[slug]/components/contact-form.tsx` — existing non-tenant inquiry form behavior
- `notes/features/13-tenant-inquiry.md` — tenant auth requirement and success UX
- `notes/01-tech-stack.md` — WorkOS AuthKit architecture for sign-in entry flow
- `src/components/tenant/inquiry-form.tsx` — component from T01

### Key Rules

1. Modify `src/app/listing/[slug]/page.tsx` (or the listing contact sidebar composition used by this page) to add the tenant inquiry form without removing existing `ContactForm` behavior for non-tenant users.
2. Auth gate requirements in the listing contact section:
   - Unauthenticated user: show CTA button text `Sign in with Google to request a visit` and route into the existing WorkOS tenant-capable sign-in flow.
   - Authenticated `TENANT` user: show `<InquiryForm />`.
   - Authenticated `ADMIN`/`GUARD` (and any non-tenant role): keep existing `<ContactForm />` path.
3. Keep `WhatsAppButton` and existing section structure intact; inquiry form is an addition, not a replacement.
4. Inquiry submit success must surface via `sonner` toast and/or the form success state from T01.
5. Do not introduce backend logic in this task; consume existing E02 mutations only.
6. Ensure route-level render remains stable for SSR listing data fetches and does not break metadata generation.
7. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/app/listing/[slug]/page.tsx` — tenant-auth-aware inquiry/contact form rendering integrated into contact section

### Acceptance Criteria

1. Unauthenticated visitors see `Sign in with Google to request a visit` CTA in the contact area.
2. Authenticated tenants see the new inquiry form.
3. Authenticated non-tenant users continue to see the existing contact form flow.
4. Existing listing page sections (gallery/details/WhatsApp) continue to render unchanged.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/listing/[slug]/page.tsx`.

### Out of Scope

- Inquiry status badge implementation details (T01)
- Admin inquiry queue and table (T03)
- Admin inquiry detail panel and action dialogs (T04)

---

## T03: Admin Inquiry Queue Page + Table

### Objective

Create the admin tenant inquiry queue page and paginated inquiry table with status tabs, filters, status badges, and row selection for detail-panel handoff.

### Required Reading

- `src/app/(admin)/admin/leads/page.tsx` — admin page composition pattern: permission gate -> tabs/filters -> table -> detail panel
- `notes/features/13-tenant-inquiry.md` — admin queue user story and status tracking expectations
- `lib/constants.ts` — `TENANT_INQUIRY_STATUS`, `PERMISSIONS`, and status color constants
- `src/components/shared/inquiry-status-badge.tsx` — status badge from T01
- `lib/money.ts` — `formatINR()` for bounty display from paise

### Key Rules

1. Create `src/app/(admin)/admin/tenant-inquiries/page.tsx` following the same top-level page pattern as `src/app/(admin)/admin/leads/page.tsx`.
2. Permission gate must enforce `PERMISSIONS.TENANT_INQUIRIES_VIEW`; users without permission get a clear no-access state.
3. Add status tabs for all inquiry statuses from `TENANT_INQUIRY_STATUS`: `SUBMITTED`, `REVIEWED`, `BOUNTY_POSTED`, `GUARD_ACCEPTED`, `VISIT_SCHEDULED`, `VISIT_COMPLETED`, `NEGOTIATION_INITIATED`, `CLOSED`, `REJECTED`, `EXPIRED`, plus `ALL`.
4. Create `src/components/admin/inquiry-table.tsx` using `usePaginatedQuery(api.tenantInquiries.list, ...)` with status filter and cursor-based pagination.
5. Table must use native `<table>` in a Card-style container and include skeleton loading + `Load More` pagination behavior.
6. Required columns in table order:
   - `#`
   - `Listing` (building + flat)
   - `Tenant` (name from users/tenant join)
   - `Status` (`InquiryStatusBadge`)
   - `Bounty` (formatted with `formatINR()` when present)
   - `Guard` (if assigned)
   - `Created`
7. Money convention is mandatory: bounty is stored in paise and must be displayed with `formatINR()` (never raw paise, never float math).
8. Row click sets selected inquiry id for detail panel rendering (state lives at page level).
9. Keep filenames kebab-case and component props typed with generated `Id<>` types where applicable.
10. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/app/(admin)/admin/tenant-inquiries/page.tsx` — admin inquiry queue route with status tabs + permission gate
- [ ] `src/components/admin/inquiry-table.tsx` — paginated inquiry table with status badge and row selection

### Acceptance Criteria

1. Admin route `/admin/tenant-inquiries` renders and respects `TENANT_INQUIRIES_VIEW` permission checks.
2. Status tabs cover all tenant inquiry statuses plus `ALL`.
3. Inquiry table reads from `tenantInquiries.list` via `usePaginatedQuery` and supports `Load More`.
4. Status column uses `InquiryStatusBadge` and bounty values use `formatINR()`.
5. Selecting a row updates the selected inquiry state for detail-panel usage.
6. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/tenant-inquiries/page.tsx` and `src/components/admin/inquiry-table.tsx`.

### Out of Scope

- Inquiry form and listing page integration (T01/T02)
- Guard bounty board UI and acceptance (separate epic)
- Admin action dialogs and mutation execution UI (T04)

---

## T04: Inquiry Detail Panel + Action Dialogs

### Objective

Build the admin inquiry detail panel and mutation-driven action dialogs for review, reject, post bounty, and schedule visit, with contextual action visibility based on inquiry status.

### Required Reading

- `src/app/(admin)/admin/leads/page.tsx` and related lead detail panel pattern — panel behavior and selected-row workflow
- `src/components/admin/GuardCreateDialog.tsx` — canonical `react-hook-form` + `zod` dialog form structure
- `notes/features/13-tenant-inquiry.md` — admin action intent and lifecycle behavior
- `lib/constants.ts` — tenant inquiry status enum/permission constants
- `lib/money.ts` — `rupeesToPaise()` and `formatINR()`
- `src/components/ui/dialog.tsx`, `src/components/ui/date-picker.tsx`, `src/components/ui/time-picker.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/select.tsx` — required dialog/form controls

### Key Rules

1. Create `src/components/admin/inquiry-detail-panel.tsx` that renders full inquiry context:
   - Tenant info
   - Listing info
   - Preferred date/time slot
   - Tenant message
   - Ops notes
   - Linked visit summary (if scheduled) including visit status
   - Bounty summary (amount, expiry, guard assignment)
2. Show contextual actions based on current status:
   - `Review` for `SUBMITTED`
   - `Reject` for `SUBMITTED` and `REVIEWED`
   - `Post Bounty` for `REVIEWED`
   - `Schedule Visit` for `GUARD_ACCEPTED`
3. Implement all action dialogs with shadcn `Dialog` + `react-hook-form` + `zod` + `zodResolver`.
4. Review dialog requirements:
   - Confirm action
   - Optional `ops_notes` textarea
   - Calls `tenantInquiries.review`
5. Reject dialog requirements:
   - `ops_notes` textarea is required (non-empty)
   - Calls `tenantInquiries.reject`
6. Post Bounty dialog requirements:
   - Input `bounty_amount` in rupees
   - Convert to paise with `rupeesToPaise()` before mutation payload
   - `expiry_days` select with allowed values `1-7`
   - Calls `tenantInquiries.postBounty`
   - Display existing bounty values using `formatINR()` (paise -> rupee display)
7. Schedule Visit dialog requirements:
   - `scheduled_start`: DatePicker + TimePicker composition
   - `scheduled_end`: TimePicker
   - Assigned guard shown as read-only (guard is already selected through bounty acceptance)
   - Calls `tenantInquiries.scheduleVisit`
8. All dialog actions must show success toasts (`toast.success`) and failure toasts (`toast.error`) and refresh panel/table state after mutation completion.
9. Keep this task scoped to review/reject/postBounty/scheduleVisit only; do not add close/initiateNegotiation actions in this epic.
10. No `as any`, no `@ts-ignore`.

### Deliverables

- [ ] `src/components/admin/inquiry-detail-panel.tsx` — detail panel plus review/reject/post-bounty/schedule-visit dialogs

### Acceptance Criteria

1. Detail panel renders complete inquiry context and linked visit/bounty summaries.
2. Dialog actions are status-gated correctly and call the matching `tenantInquiries.*` mutations.
3. Reject requires notes; review notes remain optional.
4. Post bounty submits paise values (rupees input converted with `rupeesToPaise`) and displays paise values with `formatINR()`.
5. Schedule visit dialog captures start/end schedule with DatePicker + TimePicker controls.
6. `npx tsc --noEmit` and `npm run build` both pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on `src/components/admin/inquiry-detail-panel.tsx`.

### Out of Scope

- Guard bounty board and acceptance UX (separate epic)
- Inquiry backend lifecycle mutations/queries (P19-E02 scope)
- Negotiation management UI (P23 scope)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: _TBD_

### What Was Built

_TBD_

### Key File Locations

_TBD_

### Deviations from Spec

_TBD_

### Gotchas for Next Epic

_TBD_
