---
id: P20-E02
title: Public Owner Services Page
phase: 20
status: done
depends_on: ["P20-E01", "P15"]
skills: ["rental-platform-os-rules", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P20-E02: Public Owner Services Page

## Overview

Build the public-facing owner services landing page at `(public)/owner-services/` with a conversion-focused hero section, a six-card benefits grid, a validated owner contact form, and trust signals. The form flow must submit to `ownerServiceRequests.submit` with strict phone normalization and paise conversion for property value.

## Prerequisites

- **Read first**: [P20-E01 Completion Summary](P20-E01-schema-constants-backend.md#completion-summary) - confirm `ownerServiceRequests.submit`, `OWNER_SERVICE_REQUEST_STATUS`, and owner-service rate limiting are all implemented and passing verification.
- **Read first**: [P15-E02 Completion Summary](../phase-15-public-pages/P15-E02-public-pages-frontend.md#completion-summary) - the `(public)` route group, shared header/footer, and public layout patterns must already exist.
- If `(public)` layout from P15 does not exist, this epic is **blocked** until P15 is complete.

## Task Queue

- [x] P20-E02-T01: Page Route + Hero + Benefits Grid + Trust Signals
- [x] P20-E02-T02: Contact Form Component
- [x] P20-E02-T03: Form Submission Integration + Toasts

---

## T01: Page Route + Hero + Benefits Grid + Trust Signals

### Objective

Create the owner services landing page route and structure with hero, benefits, contact section anchor, and trust signals so public owners can understand the value proposition before submitting details.

### Required Reading

- `notes/features/14-owner-services.md` - Owner contact story acceptance criteria (lines 44-58)
- `notes/features/14-owner-services.md` - Owner services page layout wireframe (lines 76-109)
- `src/app/(public)/` - verify route group layout exists and follows P15 conventions
- `tasks/phase-15-public-pages/P15-E02-public-pages-frontend.md` - `(public)` layout and metadata patterns

### Key Rules

1. Create `src/app/(public)/owner-services/page.tsx` as a server component with `generateMetadata`.
2. Metadata must include title `Owner Services | DemoRentals` and a description focused on owner-side property management support.
3. Hero section must include heading `Let us manage your property`, a supporting value-prop paragraph, and a CTA that scrolls to the contact form section.
4. Add a `Why Choose DemoRentals` benefits grid with exactly 6 cards: Guaranteed rent collection, Professional tenant screening, Legal & documentation support, 24/7 property maintenance, Transparent pricing, Regular property reports.
5. Each benefits item must render with shadcn `Card`, icon, title, and a short description sentence.
6. Add a trust-signals section below the form area including office address placeholder and support channels (phone, WhatsApp, email).
7. For phone/WhatsApp display, read from `SYSTEM_CONFIG_KEYS.demorentals_contact_phone` and `SYSTEM_CONFIG_KEYS.demorentals_whatsapp_phone` when available; otherwise render explicit fallback placeholders.
8. Layout must be mobile-first responsive: single-column flow on mobile and multi-column grid behavior (2-3 columns) on desktop.
9. Contact section must render `<OwnerContactForm />` from T02 (use a temporary placeholder import/component until T02 exists).
10. Keep filenames kebab-case and avoid native HTML form controls in this task.

### Deliverables

- [ ] `src/app/(public)/owner-services/page.tsx` - server component page with metadata, hero, benefits grid, contact section slot, and trust signals

### Acceptance Criteria

1. Route `/owner-services` renders under the `(public)` shared layout.
2. Hero, six-card benefits grid, and trust-signals sections all render without runtime errors.
3. Layout is responsive on mobile and desktop breakpoints.
4. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(public)/owner-services/page.tsx`.

### Out of Scope

- Contact form component implementation (T02)
- Mutation wiring and toast behavior (T03)
- Admin owner request management UI (P20-E03)

---

## T02: Contact Form Component

### Objective

Build a reusable owner contact form component using `react-hook-form` + `zod` + shadcn form primitives, with all seven required fields and fully typed validation behavior.

### Required Reading

- `notes/features/14-owner-services.md` - Owner contact form field spec (lines 44-58)
- `src/components/admin/GuardCreateDialog.tsx` - canonical `react-hook-form` + `zodResolver` + shadcn Form wiring
- `src/app/(guard)/guard/submit-lead/components/lead-form.tsx` - submit/loading/toast UX patterns
- `src/components/ui/` - available shadcn inputs (`Input`, `Select`, `Textarea`, `Form` primitives)
- `lib/validators.ts` - phone normalization and validation conventions

### Key Rules

1. Create `src/components/public/owner-contact-form.tsx` as a `"use client"` component.
2. Component props must include callback-driven submission and optional success hook:
   ```typescript
   {
     onSubmit: (values: OwnerContactFormValues) => Promise<void> | void;
     onSuccess?: () => void;
     isSubmitting?: boolean;
   }
   ```
3. Use `react-hook-form` + `zod` + `zodResolver` + shadcn form primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`).
4. Implement exactly 7 fields:
   - `name`: shadcn `Input` (required, min 2 chars)
   - `phone`: shadcn `Input` (required, regex `/^[6-9]\d{9}$/`)
   - `email`: shadcn `Input` (optional, must validate email when provided)
   - `property_type`: shadcn `Select` (optional, options: `1BHK`, `2BHK`, `3BHK`, `Villa`, `Other`)
   - `location`: shadcn `Input` (optional, placeholder `Society / Area name`)
   - `property_value`: shadcn `Input` with `type="number"` (optional, label `Approximate Property Value (₹)`, placeholder `e.g. 5000000`)
   - `notes`: shadcn `Textarea` (optional, placeholder `Any additional details about your property`)
5. Do not use native HTML `<select>`, `<textarea>`, date/time inputs, or custom unstyled controls when shadcn equivalents exist.
6. Submit button must use shadcn `Button` and show `Loader2` spinner during submit pending state.
7. Component must not import `api` or call Convex mutations directly; submission happens only through the `onSubmit` prop callback.
8. Emit validated data through `onSubmit` and keep reset/success handling callback-friendly for T03 integration.
9. Keep file and exported component naming aligned with kebab-case file convention.
10. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/public/owner-contact-form.tsx` - validated owner contact form component with 7 fields and callback-based submit interface

### Acceptance Criteria

1. Form renders all 7 fields using the required shadcn components.
2. Zod validation enforces: name required/min length, phone required/10-digit Indian mobile format, optional email format when present.
3. Submit button shows loading spinner and disables duplicate submits while pending.
4. Component accepts an `onSubmit` callback prop and does not invoke Convex directly.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/public/owner-contact-form.tsx`.

### Out of Scope

- Mutation invocation + toast messaging (T03)
- Landing page composition and metadata (T01)
- Admin owner request UI/queues (P20-E03)

---

## T03: Form Submission Integration + Toasts

### Objective

Wire the owner contact form into the page with a client wrapper that calls `ownerServiceRequests.submit`, normalizes phone input, converts rupees to paise, and handles success/error/rate-limit toasts.

### Required Reading

- `notes/features/14-owner-services.md` - submit behavior and success-toast copy (lines 56-57)
- `convex/ownerServiceRequests.ts` - `submit` mutation argument shape from P20-E01
- `src/components/public/owner-contact-form.tsx` - component contract from T02
- `lib/validators.ts` - `normalizePhone` implementation and error behavior
- `lib/money.ts` - `rupeesToPaise` conversion utility

### Key Rules

1. Create `src/app/(public)/owner-services/owner-services-client.tsx` as a `"use client"` wrapper that owns mutation and toast logic.
2. Use `useMutation(api.ownerServiceRequests.submit)` for submission.
3. On submit, normalize phone with `normalizePhone` before mutation payload construction.
4. On submit, convert `property_value` from rupees input to paise via `rupeesToPaise()` when a value is present.
5. Submit payload keys must align with backend schema: `name`, `phone`, optional `email`, optional `property_type`, optional `location`, optional `property_value`, optional `notes`.
6. Success toast must match exactly: `Thank you! Our team will contact you within 24 hours.`
7. Rate-limit failures must show exactly: `Too many requests. Please try again later.`
8. Non-rate-limit failures must surface the error message via toast and preserve form state for correction.
9. On success, reset form state to initial defaults and optionally trigger `onSuccess` callback behavior.
10. Integrate the client wrapper into `src/app/(public)/owner-services/page.tsx` so the contact section renders the live wired form.
11. Disable submit while mutation is pending to prevent duplicate requests.
12. Use `sonner` for all toasts (`toast.success`, `toast.error`).
13. No `as any`, no `@ts-ignore`, no unsafe type assertions.

### Deliverables

- [ ] `src/app/(public)/owner-services/owner-services-client.tsx` - client wrapper composing form + mutation + toast behavior
- [ ] `src/app/(public)/owner-services/page.tsx` - updated contact section integration using the client wrapper

### Acceptance Criteria

1. Form submission calls `ownerServiceRequests.submit` with normalized phone and paise-converted property value.
2. Success path shows exact required toast copy and resets the form.
3. Rate-limit path shows exact required rate-limit toast copy.
4. Pending state prevents double-submission.
5. `npx tsc --noEmit` passes.

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on:

- `src/app/(public)/owner-services/owner-services-client.tsx`
- `src/app/(public)/owner-services/page.tsx`
- `src/components/public/owner-contact-form.tsx`

### Out of Scope

- Admin owner request management route and actions (P20-E03)
- Backend owner-service mutations/state transitions (P20-E01)
- Admin-side property value display formatting (`formatINR` usage belongs to admin views)

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
