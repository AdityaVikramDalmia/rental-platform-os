---
id: P04-E04
title: Guard Lead Submission & My Leads UI
phase: 4
status: done
depends_on: ["P04-E01", "P02-E02", "P03-E04"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-17
---

# P04-E04: Guard Lead Submission & My Leads UI

## Overview

Build the guard-facing lead experience: lead submission form (mobile-first with building dropdown, required + optional fields, consent checkbox, rate limit display), submission success and rate limit feedback screens, My Leads list page (filter tabs, lead cards with status badges), lead detail view (status history, bounty display), and the NEED_INFO response flow (editable fields, guard reply, resubmit). All pages are mobile-first, following guard portal conventions.

## Prerequisites

- **Read first**: [P04-E01 Completion Summary](P04-E01-lead-submission-backend.md#completion-summary) — know what backend functions exist (create, updateByGuard, getMyLeads, getMyLeadById, getSubmissionCount).
- P04-E01 is complete: `leads.create`, `leads.updateByGuard`, `leads.getMyLeads`, `leads.getMyLeadById`, `leads.getSubmissionCount` all available.
- Guard layout with bottom navigation exists from P03-E04. "Leads" tab in bottom nav should already be wired (or needs a route update).
- Building queries exist from P02-E02 (`buildings.listBySociety` or equivalent) for the building dropdown.

## Task Queue

- [x] P04-E04-T01: Lead Submission Form Page
- [x] P04-E04-T02: Submission Success & Rate Limit Feedback
- [x] P04-E04-T03: My Leads List Page
- [x] P04-E04-T04: Lead Detail View
- [x] P04-E04-T05: NEED_INFO Response Flow

---

## T01: Lead Submission Form Page

### Objective

Build the guard lead submission form at `/guard/submit-lead` — a mobile-first, single-page form with building dropdown, required fields, collapsible optional section, consent checkbox, and rate limit display on the submit button. Uses `react-hook-form` + `zod` for validation.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Lead Submission Form" section (field order, layout, touch targets, submit flow)
- `notes/features/03-lead-pipeline.md` — "Lead Submission Form" section (required vs optional fields, validation rules)
- `notes/10-convex-schema.md` — `leads` table validators (exact types for each field)
- `notes/13-constants-reference.md` — Availability types (`VACANT_NOW`, `VACANT_FROM`), furnishing enum

### Key Rules

1. **Route**: `src/app/(guard)/guard/submit-lead/page.tsx`. Client component (`"use client"`).
2. **Mobile-first**: Large touch targets (min 44x44px), minimum 16px body font, full-width inputs. Follow guard portal conventions from P03-E04.
3. **Form library**: `react-hook-form` with `zodResolver`. Define a Zod schema that matches the `leads.create` args exactly.
4. **Building dropdown**: Use `useQuery(api.buildings.listBySociety, { society_id: guard.society_id })` (or equivalent query from P02). Show building name. If only 1 building in society, pre-select it.
5. **Field order** (top to bottom):
   - **Building** — Dropdown (required). Label: "Building". If no buildings: show error "No buildings found for your society."
   - **Floor Number** — Text input (required). Label: "Floor". Placeholder: "e.g., 12, G, B1". Keyboard: text (floors can be "G", "B1", etc.).
   - **Flat Number** — Text input (required). Label: "Flat No". Placeholder: "e.g., 1201, A-403". Helper text: matches building's `flat_number_template` if defined. Convert to uppercase on blur.
   - **Owner Phone** — Phone input (required). Label: "Owner's Phone". Prefix: "+91" shown as static label. Keyboard: `inputMode="numeric"`. Strip formatting on change. Validate: exactly 10 digits after stripping.
   - **Availability** — Radio group (required). Options: "Vacant Now" / "Vacant From". Default: "Vacant Now".
   - **Availability Date** — Date picker (conditional, required if "Vacant From"). Only shown when "Vacant From" selected. Min date: today.
   - **Consent Checkbox** — Checkbox (required, must be true). Label: "Owner has agreed to receive a call from our team". Bold, prominent. Not pre-checked.
   - **Divider: "Add more details"** — Collapsible section toggle. Collapsed by default.
   - **Owner Name** — Text input (optional). Label: "Owner's Name".
   - **Expected Rent (₹)** — Number input (optional). Label: "Expected Rent". Placeholder: "e.g., 25000". Keyboard: `inputMode="numeric"`. Stored as paise (convert: `rupeesToPaise(value)`). Display: rupees in input.
   - **Furnishing** — Radio group (optional). Options: "Unfurnished" / "Semi-Furnished" / "Fully Furnished".
   - **Notes** — Textarea (optional). Label: "Any extra info". Max 500 characters.
6. **Submit button**: Large, prominent, full-width. Text: `"Submit Lead (3 of 5 today)"`. Shows current count / daily limit using `leads.getSubmissionCount` query. Disabled + spinner while submitting.
7. **Validation errors**: Inline red text below each field. Show on blur (not on type).
8. **On submit**: Call `leads.create` mutation. Phone normalization happens on backend (but also strip on frontend for clean display). `flat_number` uppercase on backend (also do on frontend for immediate feedback). `rent_expected` converted to paise.
9. **Error handling**: Mutation errors show as toast via `sonner`. Common errors: "Owner consent is required", "Daily lead limit reached", "Building does not belong to your society", "Cannot submit leads for an inactive society".
10. **Sticky rule banner**: Guard portal has a sticky rule banner at top (from P03). Ensure form scrolls under it.

### Deliverables

- [ ] `src/app/(guard)/guard/submit-lead/page.tsx` — Lead submission page
- [ ] `src/app/(guard)/guard/submit-lead/components/lead-form.tsx` — Form component with all fields, validation, submission logic

### Acceptance Criteria

1. Form renders at `/guard/submit-lead` with all fields in correct order
2. Building dropdown populated from guard's society buildings
3. Floor and flat number inputs accept free-form text
4. Phone input shows +91 prefix, accepts only 10 digits
5. Availability radio toggles date picker visibility
6. Consent checkbox is unchecked by default, required to submit
7. Optional section is collapsed by default, expandable via "Add more details"
8. Submit button shows "(N of 5 today)" rate limit count
9. Form validates on blur, shows inline errors
10. On valid submit: calls `leads.create` mutation with correct args
11. Flat number converted to uppercase before display
12. Rent expected converted from rupees to paise before mutation
13. Mutation errors displayed as toast (not inline)
14. Touch targets >= 44x44px, body font >= 16px
15. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Navigate to `/guard/submit-lead` on mobile viewport (375px wide). Fill form, submit. Verify all field types, validation, error messages.

### Out of Scope

- Success screen after submission (T02)
- Rate limit exceeded screen (T02)
- Photo upload field (V2)
- i18n translations (P14)

---

## T02: Submission Success & Rate Limit Feedback

### Objective

Build the post-submission screens: a success screen shown after successful lead creation (with lead info and navigation buttons), and a rate limit exceeded screen shown when the guard hits the daily limit. Also integrate rate limit count display into the submit button.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Lead Submission Success" section (success screen layout, buttons)
- `notes/features/03-lead-pipeline.md` — "Rate Limiting" section (rate limit display, exceeded messaging)

### Key Rules

1. **Success screen**: Shown immediately after successful `leads.create` call. NOT a separate page — inline state change on the same page (form hides, success shows). Content:

   ```
   ✅ Lead Submitted!
   Lead #[short ID]            [Status Badge]
   Tower A, Floor 12, Flat 1201
   Our team will verify with the owner soon.

   [Submit Another]  [View My Leads]
   ```

   - Lead ID: show first 8 characters of the returned `_id` (e.g., `"Lead #j57x8k2m"`). Feature spec requires this.
   - Status badge: Use `lead-status-badge` component showing the lead's initial status (SUBMITTED or POTENTIAL_DUPLICATE).
   - Building/floor/flat from the just-submitted data.
   - `[Submit Another]` resets form to empty state.
   - `[View My Leads]` navigates to `/guard/leads`.

2. **POTENTIAL_DUPLICATE success variant**: If the created lead has status `POTENTIAL_DUPLICATE`, show a yellow banner above the success content: "⚠️ This lead may be a duplicate. Our team will review it." Still show the success content — submission was not blocked.
3. **Rate limit exceeded screen**: Shown when `leads.create` throws a rate limit error (detect by error message pattern). Content:

   ```
   ⏳ Daily Limit Reached
   You've submitted 5 leads today.
   Come back tomorrow!

   [View My Leads]
   ```

   - `[View My Leads]` navigates to `/guard/leads`.

4. **Rate limit count on submit button**: Use `useQuery(api.leads.getSubmissionCount)` to get `{ count, limit }`. Display on submit button: `"Submit Lead (${count} of ${limit} today)"`. If `count >= limit`, disable the submit button and show: `"Daily limit reached (5 of 5)"`.
5. **Pre-check on page load**: If `count >= limit` when the page loads, show the rate limit screen immediately instead of the form. Don't make the guard fill out a form they can't submit.
6. **State machine for page**: Three states: `FORM` (default), `SUCCESS`, `RATE_LIMITED`. Use React state to toggle between them.

### Deliverables

- [ ] `src/app/(guard)/guard/submit-lead/components/success-screen.tsx` — Success screen with lead info and navigation
- [ ] `src/app/(guard)/guard/submit-lead/components/rate-limit-screen.tsx` — Rate limit exceeded screen
- [ ] Update `lead-form.tsx` — Integrate rate limit count display on submit button + pre-check

### Acceptance Criteria

1. After successful submission, form hides and success screen shows with lead ID (first 8 chars), status badge, and flat info
2. Success screen has "Submit Another" (resets form) and "View My Leads" (navigates) buttons
3. POTENTIAL_DUPLICATE leads show yellow warning banner above success content
4. Rate limit count appears on submit button: "(N of 5 today)"
5. Submit button disabled when daily limit reached
6. When page loads with limit already reached, rate limit screen shows immediately (no form)
7. Rate limit error from mutation shows rate limit screen (not generic error toast)
8. "Come back tomorrow!" messaging is shown on rate limit screen
9. All screens are mobile-first (full-width, large touch targets)
10. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Submit a lead → verify success screen. Submit 5 leads → verify rate limit screen. Reload page after limit → verify pre-check shows rate limit screen.

### Out of Scope

- My Leads page (T03)
- Lead detail view (T04)
- Push notifications when guard approaches limit (V2)

---

## T03: My Leads List Page

### Objective

Build the guard's "My Leads" page at `/guard/leads` — a mobile-first list showing the guard's submitted leads with filter tabs (All, In Review, Verified, Rejected), lead cards with status badges and admin note previews, and pagination.

### Required Reading

- `notes/05-guard-portal-ux.md` — "My Leads" screen (filter tabs, card layout, status badges)
- `notes/features/03-lead-pipeline.md` — "My Leads List" section (display fields, status badge colors)
- `notes/10-convex-schema.md` — `leads` table (field names for card display — e.g., `flat_number`, `owner_phone`, `notes_thread`)
- `notes/13-constants-reference.md` — Lead statuses, badge colors (Tailwind classes), quality flag names

### Key Rules

1. **Route**: `src/app/(guard)/guard/leads/page.tsx`. Client component.
2. **Data source**: `usePaginatedQuery(api.leads.getMyLeads, { status_filter: selectedTab }, { initialNumItems: 20 })`. Auto-refreshes via Convex subscriptions.
3. **Filter tabs**: Horizontal scroll tabs at top of page:
   - **All** — `status_filter: undefined` (default)
   - **In Review** — `status_filter: "IN_REVIEW"` (SUBMITTED + NEED_INFO + POTENTIAL_DUPLICATE)
   - **Verified** — `status_filter: "VERIFIED"`
   - **Rejected** — `status_filter: "REJECTED"` (REJECTED + DUPLICATE)
4. **Lead card layout**: Each lead is a tappable card. Content:
   ```
   ┌─────────────────────────────┐
   │ Tower A, Fl 12, #1201       │  ← building + floor + flat
   │ 📱 +91 98765 43210          │  ← owner phone (formatted)
   │ 2 hours ago                 │  ← relative timestamp
   │ [Status Badge]              │  ← color-coded
   │ ⚠️ Potential Duplicate      │  ← warning badge if POTENTIAL_DUPLICATE (conditional)
   │ Admin: "Need owner's        │  ← latest admin note preview (conditional, NEED_INFO only)
   │  alternate number"          │
   └─────────────────────────────┘
   ```
5. **Status badge**: Use `lead-status-badge.tsx` from `src/components/shared/`. **If E03 ran first, this already exists — import it. If E04 runs first, create it here** with the colors below. Colors:
   - SUBMITTED: blue
   - NEED_INFO: amber/orange
   - POTENTIAL_DUPLICATE: yellow
   - VERIFIED: green
   - REJECTED: red
   - DUPLICATE: gray
6. **Admin note preview**: Show only for NEED_INFO leads. Extract latest ADMIN entry from `notes_thread` array. Truncate to ~80 characters with "..." if longer.
7. **POTENTIAL_DUPLICATE badge**: Show ⚠️ warning badge below status badge for leads with `DUPLICATE_FLAT_MATCH` or `DUPLICATE_PHONE_MATCH` in `quality_flags`.
8. **Tap action**: Tapping a card navigates to `/guard/leads/[id]` (lead detail view — T04).
9. **Pagination**: Infinite scroll or "Load more" button. Use Convex `usePaginatedQuery` with `loadMore()`.
10. **Empty states**:
    - All tab empty: "No leads yet. Submit your first lead!" with link to `/guard/submit-lead`.
    - Filtered tab empty: "No [category] leads."
11. **Bottom navigation**: "Leads" tab in bottom nav should be active/highlighted on this page.
12. **Ordering**: Newest first (by `_creationTime` descending).

### Deliverables

- [ ] `src/app/(guard)/guard/leads/page.tsx` — My Leads list page
- [ ] `src/app/(guard)/guard/leads/components/lead-card.tsx` — Lead card component
- [ ] `src/app/(guard)/guard/leads/components/lead-filter-tabs.tsx` — Filter tabs (All, In Review, Verified, Rejected)
- [ ] `src/components/shared/lead-status-badge.tsx` — Shared status badge component. **If E03 ran first, this may already exist — verify and import.**

### Acceptance Criteria

1. Page renders at `/guard/leads` with filter tabs at top
2. "All" tab is active by default, showing all guard's leads
3. Each filter tab correctly filters leads by status category
4. Lead cards show building/floor/flat, phone, relative time, status badge
5. NEED_INFO leads show admin note preview (latest admin entry from notes_thread)
6. POTENTIAL_DUPLICATE leads show ⚠️ warning badge
7. Tapping a card navigates to `/guard/leads/[id]`
8. Pagination works (Load more / infinite scroll)
9. Empty state shown when no leads exist with link to submit form
10. Real-time updates: new leads or status changes appear without refresh
11. Leads ordered newest first
12. Mobile-first layout (touch targets >= 44px, font >= 16px)
13. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Navigate to `/guard/leads`. Verify tabs filter correctly. Tap a card → navigates to detail. Check empty state. Submit a new lead → verify it appears in real-time.

### Out of Scope

- Lead detail view (T04)
- NEED_INFO response form (T05)
- Swipe actions on cards (V2)
- Search within My Leads (guards have fewer leads — not needed in V1)

---

## T04: Lead Detail View

### Objective

Build the guard's lead detail page at `/guard/leads/[id]` — shows all submitted information, status history timeline, prospective bounty (visible only when VERIFIED + bounty set), and the full notes thread conversation.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Lead Detail View" section (layout, sections, prospective bounty display)
- `notes/features/03-lead-pipeline.md` — "My Leads List" section (detail view fields, bounty visibility rules)
- `notes/10-convex-schema.md` — `leads` table (field names and types for detail display — e.g., `prospective_bounty` in paise, `availability_type`, `notes_thread` structure)
- `notes/13-constants-reference.md` — Lead statuses, badge colors, availability types, furnishing enum

### Key Rules

1. **Route**: `src/app/(guard)/guard/leads/[id]/page.tsx`. Client component. The `[id]` param is the lead's `_id`.
2. **Data source**: Use `useQuery(api.leads.getMyLeadById, { lead_id })` — this guard-facing query was added in E01-T04. It uses `requireGuard` + ownership check and returns lead with building/society joins and full notes_thread.
3. **Page layout** (sections top to bottom):
   - **Header**: Status badge (large), flat info "Tower A / Floor 12 / Flat 1201", relative timestamp.
   - **Owner Info**: Owner name (if provided), phone (formatted with +91, clickable `tel:` link).
   - **Vacancy Details**: Availability type + date, expected rent (₹XX,XXX), furnishing.
   - **Notes Thread**: Full conversation thread from `notes_thread` array. Each entry: author name, author type (ADMIN badge blue / GUARD badge green), timestamp, note text. Chronological order. Reuse shared `notes-thread.tsx` component from E03-T03.
   - **Status History**: Timeline of status changes. Reuse shared `status-timeline.tsx` component from E03-T03.
   - **Prospective Bounty** _(conditional)_: Only shown when BOTH conditions met: (a) lead status is `VERIFIED`, AND (b) `prospective_bounty` is set (not undefined). Display: "💰 Prospective Bounty: ₹XX,XXX". Prominent green card/banner.
4. **NEED_INFO state**: When lead status is `NEED_INFO`, show the NEED_INFO response form (T05) below the notes thread. This task just renders the read-only detail; T05 adds the editable form.
5. **Back navigation**: Back arrow in header → navigate to `/guard/leads`.
6. **Money formatting**: Use `formatINR()` from `lib/money.ts`.
7. **Phone formatting**: Use `formatPhoneDisplay()` from `lib/validators.ts`.
8. **Loading state**: Skeleton content while query loads.
9. **Not found state**: If lead ID doesn't exist or doesn't belong to guard, show "Lead not found" with back link.

### Deliverables

- [ ] `src/app/(guard)/guard/leads/[id]/page.tsx` — Lead detail page (uses `leads.getMyLeadById` from E01-T04)
- [ ] `src/components/shared/notes-thread.tsx` — Shared notes thread display. **If E03 ran first, this may already exist — verify and import.**
- [ ] `src/components/shared/status-timeline.tsx` — Shared status history timeline. **If E03 ran first, this may already exist — verify and import.**

### Acceptance Criteria

1. Page renders at `/guard/leads/[id]` with all lead info sections
2. Header shows status badge and flat info
3. Owner phone displayed with +91 prefix as clickable `tel:` link
4. Money values formatted as ₹XX,XXX (from paise)
5. Notes thread displays full conversation with author type badges
6. Status history timeline shows transitions
7. Prospective bounty shown ONLY when status is VERIFIED AND bounty is set
8. Prospective bounty hidden when status is not VERIFIED (even if bounty field exists)
9. Back arrow navigates to `/guard/leads`
10. "Lead not found" shown for invalid or unauthorized lead IDs
11. Loading skeleton shown while data fetches
12. Mobile-first layout (full-width, large text, proper spacing)
13. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Navigate to `/guard/leads/[valid-id]`. Verify all sections render. Check a VERIFIED lead with bounty → bounty visible. Check a SUBMITTED lead → bounty hidden. Check an invalid ID → not found state.

### Out of Scope

- NEED_INFO editable form (T05)
- Visit info on lead (P07)
- Closure/payout info on lead (P08)

---

## T05: NEED_INFO Response Flow

### Objective

Build the NEED_INFO response experience: when a guard views a lead with NEED_INFO status, show the admin's note prominently, make selected fields editable, provide a reply textarea, and include an "Update & Resubmit" button that calls `leads.updateByGuard`.

### Required Reading

- `notes/features/03-lead-pipeline.md` — "Responding to NEED_INFO" section (editable fields, guard reply, transition)
- `notes/05-guard-portal-ux.md` — "NEED_INFO Detail View" section (layout, edit fields, resubmit button)
- `notes/10-convex-schema.md` — `leads` table (editable field types — `owner_phone` string, `rent_expected` number in paise, `furnishing` literal union, `availability_type` literal union)
- `notes/13-constants-reference.md` — Availability types, furnishing enum values (for radio options)
- `notes/04-state-machines.md` — Transition: `NEED_INFO → SUBMITTED`

### Key Rules

1. **Conditional rendering**: The NEED_INFO form only appears on the lead detail page (T04) when `lead.status === "NEED_INFO"`. Otherwise, the page shows read-only detail.
2. **Admin note highlight**: The latest ADMIN entry in `notes_thread` is shown at the top of the edit form in a prominent amber/orange banner: "📋 Admin requested: [note text]". This is the first thing the guard sees.
3. **Editable fields** (pre-filled with current values):
   - **Owner Phone** — Phone input with +91 prefix. Pre-filled with current `owner_phone`.
   - **Owner Name** — Text input. Pre-filled with current `owner_name`.
   - **Expected Rent (₹)** — Number input. Pre-filled with current `rent_expected` (converted from paise to rupees for display).
   - **Furnishing** — Radio group. Pre-filled with current `furnishing`.
   - **Availability** — Radio group + conditional date picker. Pre-filled.
   - **Notes** — Textarea. Pre-filled with current `notes`.
4. **Guard reply textarea**: Below the editable fields. Label: "Your reply to admin (optional)". Placeholder: "e.g., Here's the alternate number...". This goes into `reply_note` arg.
5. **Submit button**: Full-width, prominent. Text: "Update & Resubmit". On tap:
   - Collect all edited field values + reply note
   - Call `leads.updateByGuard({ lead_id, ...editedFields, reply_note })` mutation
   - On success: toast "Lead updated and resubmitted!", navigate to `/guard/leads`
   - On error: toast with error message
6. **Form library**: `react-hook-form` + `zod`. Validate phone (10 digits), rent (positive number if provided).
7. **Fields NOT editable**: `building_id`, `floor_number`, `flat_number` — these are structural and cannot be changed after submission. Show them as read-only in the form header.
8. **Consent**: Not re-shown. Consent was given at submission time and doesn't need to be re-confirmed.
9. **Phone normalization**: Strip formatting on input, store as 10 digits. Same pattern as T01.
10. **Rent conversion**: Input in rupees → convert to paise using `rupeesToPaise()` before mutation. Only send if value changed.

### Deliverables

- [ ] `src/app/(guard)/guard/leads/components/need-info-form.tsx` — NEED_INFO editable form with admin note, fields, reply, resubmit
- [ ] Update `src/app/(guard)/guard/leads/[id]/page.tsx` — Conditionally render NEED_INFO form when status is NEED_INFO

### Acceptance Criteria

1. NEED_INFO form appears only when lead status is NEED_INFO
2. Latest admin note displayed prominently in amber banner at top of form
3. All 6 editable fields pre-filled with current lead values
4. building_id, floor_number, flat_number shown as read-only (not editable)
5. Guard reply textarea is optional (can submit without it)
6. "Update & Resubmit" calls `leads.updateByGuard` with correct args
7. Phone value normalized (10 digits) before submission
8. Rent converted from rupees to paise before submission
9. On success: toast + navigate to `/guard/leads`
10. On error: toast with error message (form stays open)
11. Form uses `react-hook-form` + `zod` validation
12. Mobile-first layout (large touch targets, full-width inputs)
13. `npm run build` passes

### Verification

```bash
npm run build
```

Visual: Create a lead → set its status to NEED_INFO (via admin mutation or DB update) → open lead detail as guard → verify NEED_INFO form appears → edit fields → submit → verify status changes to SUBMITTED + notes_thread has guard entry.

### Out of Scope

- Admin-side NEED_INFO dialog (E03-T04)
- Push notification to guard when NEED_INFO is set (V2)
- i18n for NEED_INFO labels and messages (P14)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- `/guard/submit-lead` — Full lead submission form with all fields, react-hook-form + zod, consent checkbox, collapsible optional section, rate limit count on submit button
- Success screen (POTENTIAL_DUPLICATE yellow banner variant) and rate limit exceeded screen
- `/guard/leads` — My Leads list with filter tabs (All, In Review, Verified, Rejected), lead cards, pagination
- `/guard/leads/[id]` — Lead detail view with all sections (owner, vacancy, notes thread, status timeline, prospective bounty)
- NEED_INFO response form (admin note banner, 6 editable fields, guard reply)
- 3 shared components: `lead-status-badge.tsx`, `notes-thread.tsx`, `status-timeline.tsx`
- `listBySocietyForGuard` query added to `convex/buildings.ts` (guard-facing building list)
- `formatRelativeTime()` utility added to `lib/dates.ts`

### Key File Locations

- Submit lead: `src/app/(guard)/guard/submit-lead/` (page + 3 components)
- My Leads: `src/app/(guard)/guard/leads/` (page + 3 components)
- Lead detail: `src/app/(guard)/guard/leads/[id]/page.tsx`
- NEED_INFO form: `src/app/(guard)/guard/leads/components/need-info-form.tsx`
- Shared: `src/components/shared/lead-status-badge.tsx`, `notes-thread.tsx`, `status-timeline.tsx`

### Deviations from Spec

- Added `listBySocietyForGuard` to `convex/buildings.ts` — existing `listBySociety` requires admin BUILDINGS_VIEW permission which guards don't have. Without this query, the building dropdown can't populate.
- Added `formatRelativeTime` to `lib/dates.ts` — needed for "2h ago" display in lead cards

### Gotchas for Next Epic

- `lead-status-badge.tsx`, `notes-thread.tsx`, `status-timeline.tsx` are shared components available for E03 (admin UI) — import from `@/components/shared/`
- Guard building query returns minimal data: `{ _id, name, flat_number_template, total_floors }`
