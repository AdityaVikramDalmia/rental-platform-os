---
id: P03-E04
title: Guard Portal Pages
phase: 3
status: done
depends_on: ["P03-E01", "P03-E03"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P03-E04: Guard Portal Pages

## Overview

Build the guard-facing pages: profile page (ID-card-style layout with photo upload), onboarding walkthrough (3-step dismissable overlay on first login), and shift schedule page (read-only next-7-days view). All pages are mobile-first within the existing guard portal layout from Phase 1.

## Prerequisites

- **Read first**: [P03-E01 Completion Summary](P03-E01-guard-account-backend.md#completion-summary) — know the `getMyProfile` query signature and guard auth patterns.
- **Read first**: [P03-E03 Completion Summary](P03-E03-guard-shift-management.md#completion-summary) — know the `getMySchedule` query and computed shift logic.
- Guard backend (E01) provides `getMyProfile` query and `updateMyPhoto` mutation.
- Shift queries (E03) provide `getMySchedule` with computed schedule logic.
- Guard portal layout exists from P01-E06 (bottom nav, auth checks, mobile-first).

## Task Queue

- [x] P03-E04-T01: Guard Profile Page
- [x] P03-E04-T02: Guard Onboarding Walkthrough
- [x] P03-E04-T03: Guard Shift Schedule Page

---

## T01: Guard Profile Page

### Objective

Create the guard profile page at `/guard/profile` with an ID-card-style layout showing the guard's photo, name, phone, society, type, and status. Guard can upload/update their profile photo (client-side resize to ~500KB, stored in Convex file storage). Includes links to change password, language selector, and sign out.

### Required Reading

- `notes/05-guard-portal-ux.md` — "Profile Page" section (ID card wireframe, photo upload, buttons)
- `notes/features/02-guard-management.md` — "Guard: View Own Profile (ID Card)" user story
- `notes/02-data-models.md` — Section D: `photo_storage_id`, `language_preference` fields
- `notes/11-convex-architecture.md` — "File Upload" section (Convex file storage pattern)

### Key Rules

1. Route: `src/app/(guard)/guard/profile/page.tsx`. The `(guard)` route group provides guard layout (bottom nav, auth check).
2. **PREREQUISITE — Update guard layout auth**: The guard layout (`src/app/(guard)/layout.tsx`, created in P01-E06-T03) currently uses `requireGuard(ctx)` which blocks INACTIVE guards. Per the guard management spec, INACTIVE guards can still login and view their profile/history. **Before building this page**, update the guard layout to use `requireAuth(ctx)` + `user_type === "GUARD"` check instead of `requireGuard`. This allows INACTIVE guards through the layout. BANNED guards are still blocked by `requireAuth`. Keep the `must_change_password` redirect as-is.
3. Use `guards.getMyProfile` query (E01-T04) — real-time subscription.
4. **ID Card Layout** (mobile-first):

   ```
   ┌───────────────────────────────┐
   │      [Photo / Avatar]         │
   │      [📷 Upload Photo]        │
   │                               │
   │   RAJESH KUMAR                │
   │   +91 98765 43210             │
   │                               │
   │   Society: Maplewood        │
   │   Type: Building Guard        │  ← Human-readable label
   │   Status: ● Active            │
   └───────────────────────────────┘
   ```

   - Photo: Circle crop, ~120px diameter. Show default avatar (initials or icon) if no photo.
   - Name: Large, bold text.
   - Phone: Formatted +91 XXXXX XXXXX.
   - Society: Society name from enriched query.
   - Type: Display labels — `BUILDING_SPECIFIC` → "Building Guard", `MAIN_GATE` → "Main Gate Guard", `PARK` → "Park Guard", `ROVING` → "Roving Guard".
   - Status: Colored dot — green (ACTIVE), gray (INACTIVE). BANNED guards can't reach this page.

5. **Photo Upload** component (`src/components/guard/GuardPhotoUpload.tsx`):
   - Click "Upload Photo" → native file picker (accept: `image/jpeg, image/png, image/webp`).
   - Client-side validation: Max 5MB before resize.
   - Client-side resize: Use canvas API to resize to max 500px width/height, ~500KB target. Convert to JPEG.
   - Upload flow: `generateUploadUrl()` → `fetch(url, { method: "POST", body: blob })` → get `storageId` → call mutation `guards.updateMyPhoto({ storage_id })`.
   - Show loading spinner during upload.
   - On success: photo updates in real-time (Convex subscription).
   - On error: toast "Failed to upload photo".
6. **Below the card**:
   - "My Badges" section: Show guard's incentive badges (empty state for now — Phase 10 populates). Display: "No badges yet. Submit verified leads to earn badges!"
   - "My Schedule (Next 7 Days)" preview: Compact list of next 3-5 shifts. "View full schedule →" link to `/guard/shifts`.
   - Language selector: Dropdown with options `English`, `Hindi`, `Hinglish`. Calls mutation to update `guard_profiles.language_preference`. Also saves to `localStorage` for offline access. **Scope note**: This stores the guard's language PREFERENCE only. The actual UI translation (next-intl, translation files) is Phase 14. Phase 3 just persists the choice so Phase 14 can use it.
   - "Change Password" button: Navigates to `/guard/change-password` (existing P01-E04 page).
   - "Sign Out" button: Calls WorkOS signOut. Redirects to `/guard/login`.
7. **`updateMyPhoto` mutation** (add to `convex/guards.ts` if not already there):
   - Auth: Use `requireAuth(ctx)` + verify `user_type === "GUARD"`. Do NOT use `requireGuard` — INACTIVE guards should still be able to update their photo. BANNED guards blocked by `requireAuth`.
   - Args: `{ storage_id: v.id("_storage") }`
   - Updates `guard_profiles.photo_storage_id` for the authenticated guard.
8. **`updateMyLanguage` mutation** (add to `convex/guards.ts`):
   - Auth: Use `requireAuth(ctx)` + verify `user_type === "GUARD"` (same pattern — allow INACTIVE).
   - Args: `{ language: v.union(v.literal("en"), v.literal("hi"), v.literal("hinglish")) }`
   - Updates `guard_profiles.language_preference`.
9. Use shadcn/ui: `Card`, `Avatar`, `Badge`, `Button`, `Select`, `Separator`.
10. Minimum body font: 16px. Touch targets: 44×44px minimum.

### Deliverables

- [ ] `src/app/(guard)/layout.tsx` — Updated: auth check changed from `requireGuard` to `requireAuth` + GUARD type check (allows INACTIVE guards)
- [ ] `src/app/(guard)/guard/profile/page.tsx` — Guard profile page
- [ ] `src/components/guard/GuardProfileCard.tsx` — ID card component
- [ ] `src/components/guard/GuardPhotoUpload.tsx` — Photo upload with client-side resize
- [ ] `convex/guards.ts` — Add `updateMyPhoto` and `updateMyLanguage` mutations (if not already in E01)

### Acceptance Criteria

1. INACTIVE guard can access `/guard/profile` (guard layout no longer blocks them)
2. BANNED guard is still redirected to `/guard/login` (blocked by `requireAuth`)
3. Profile page renders at `/guard/profile` within guard layout
4. ID card shows correct name, phone, society, type, status
5. Default avatar shown when no photo uploaded
6. Photo upload: file picker opens, image resized client-side, uploaded to Convex
7. After upload: photo updates in real-time on the card
8. Language selector changes `language_preference` and saves to localStorage
9. "Change Password" navigates to `/guard/change-password`
10. "Sign Out" logs out and redirects to `/guard/login`
11. Badges section shows empty state (no badges yet)
12. Schedule preview shows next few shifts (or empty state)
13. Mobile-first responsive layout (looks good on 375px width)
14. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Badge display content (Phase 10 provides real badge data)
- Profile editing by guard (guard cannot edit name, phone, type — admin only)
- Push notification preferences (V2)
- Dark mode (V2)

---

## T02: Guard Onboarding Walkthrough

### Objective

Create a 3-step onboarding walkthrough overlay that shows on the guard's first login. Steps: "Find vacant flats", "Submit leads", "Earn bounties". Dismissed permanently via "Got it!" button, which sets `has_seen_onboarding: true` on the guard profile.

### Required Reading

- `notes/features/02-guard-management.md` — "Guard: View Own Profile" section (`has_seen_onboarding` flag)
- `notes/05-guard-portal-ux.md` — Onboarding walkthrough description (if present)
- `notes/02-data-models.md` — Section D: `has_seen_onboarding` boolean field

### Key Rules

1. Component: `src/components/guard/GuardOnboarding.tsx`. Renders as a full-screen overlay/modal.
2. **Show condition**: `guard_profiles.has_seen_onboarding === false`. Check via `guards.getMyProfile` query.
3. Place the onboarding check in the guard layout (`src/app/(guard)/layout.tsx`) or the dashboard page — show on any guard page if `has_seen_onboarding` is false.
4. **3 Steps** (swipeable cards or paginated):
   - Step 1: **Find** — "Look for vacant flats in your society. Check for 'To Let' signs, talk to residents, notice empty units." Icon: magnifying glass / binoculars.
   - Step 2: **Submit** — "Submit a lead with the flat details. We'll verify with the owner." Icon: clipboard / form.
   - Step 3: **Earn** — "If the lead is verified and the flat gets rented, you earn a bounty!" Icon: cash / trophy.
5. Navigation: Dot indicators (● ○ ○), "Next" button, "Skip" link. On last step: "Got it!" button.
6. **"Got it!" button**: Calls mutation `guards.dismissOnboarding()` → sets `has_seen_onboarding: true`. Overlay disappears. Never shown again.
7. **`dismissOnboarding` mutation** (add to `convex/guards.ts`):
   - Auth: `requireGuard(ctx)` (doesn't need ACTIVE check — might show during onboarding)
   - No args. Updates own `guard_profiles.has_seen_onboarding = true`.
8. Overlay should be semi-transparent backdrop with a centered card.
9. Mobile-first: full-width on mobile, max-width 400px on larger screens.
10. Animations: Smooth slide transitions between steps. Use CSS transitions or framer-motion if already in deps (check `package.json`).

### Deliverables

- [ ] `src/components/guard/GuardOnboarding.tsx` — 3-step onboarding walkthrough overlay
- [ ] `convex/guards.ts` — Add `dismissOnboarding` mutation

### Acceptance Criteria

1. Onboarding overlay shows when `has_seen_onboarding === false`
2. 3 steps displayed with correct content and icons
3. Dot indicators update as user navigates steps
4. "Next" button advances to next step
5. "Skip" link dismisses onboarding (same as "Got it!")
6. "Got it!" on last step calls mutation and hides overlay permanently
7. After dismissal, onboarding never shows again (even on page refresh)
8. Overlay renders on top of all content with backdrop
9. Mobile-friendly: works on 375px width
10. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
npm run build
```

### Out of Scope

- Onboarding analytics (tracking which step users drop off at — V2)
- Video tutorials (V2)
- Re-triggering onboarding (once dismissed, it's permanent)
- i18n for onboarding content (Phase 14)

---

## T03: Guard Shift Schedule Page

### Objective

Create the guard shift schedule page at `/guard/shifts` showing a read-only view of the guard's upcoming shifts for the next 7 days. Each day shows the scheduled shifts with time and location. Override days are visually marked.

### Required Reading

- `notes/features/02-guard-management.md` — "Guard: View Own Shift Schedule" user story + wireframe
- `notes/05-guard-portal-ux.md` — "Shift Schedule" section (simple list for next 7 days)

### Key Rules

1. Route: `src/app/(guard)/guard/shifts/page.tsx`.
2. Use `guardShifts.getMySchedule` query (E03-T02) with `from_date` = today midnight, `to_date` = 7 days from now midnight.
3. Component: `src/components/guard/GuardShiftList.tsx`. Accept schedule data as prop.
4. **Layout** (mobile-first list):

   ```
   My Schedule

   Today (Mon, 17 Feb)
     06:00 - 14:00 | Tower A

   Tomorrow (Tue, 18 Feb)
     14:00 - 22:00 | Main Gate

   Wed, 19 Feb
     06:00 - 14:00 | Tower B
     18:00 - 22:00 | Park Area    ← split shift

   Thu, 20 Feb
     No shifts scheduled

   Fri, 21 Feb
     06:00 - 14:00 | Tower A [Override]  ← override day

   Sat, 22 Feb
     Day off

   Sun, 23 Feb
     06:00 - 14:00 | Tower A
   ```

5. Day headers: "Today", "Tomorrow", then day name + date for the rest.
6. Each shift entry: `{start_time} - {end_time} | {location_display}`. If source is OVERRIDE, show a small `[Override]` tag.
7. Days with no shifts: "No shifts scheduled" or "Day off" in muted text.
8. Empty state (no shifts at all for the week): "No shifts scheduled for the next 7 days. Contact your admin for shift assignments."
9. **Location display**:
   - BUILDING: Building name (from enriched query)
   - MAIN_GATE: "Main Gate"
   - PARK: "Park Area" or `location_label` if set
   - PARKING: "Parking" or `location_label`
   - OTHER: `location_label` or "Other"
10. No editing — guard view is read-only. If guard has questions, they contact admin.
11. Real-time: If admin changes shifts, the page updates automatically.
12. Minimum font: 16px. Touch-friendly spacing.

### Deliverables

- [ ] `src/app/(guard)/guard/shifts/page.tsx` — Guard shift schedule page
- [ ] `src/components/guard/GuardShiftList.tsx` — 7-day shift list component

### Acceptance Criteria

1. Page renders at `/guard/shifts` within guard layout
2. Shows next 7 days starting from today
3. Today and tomorrow have special labels
4. Each shift shows time range and location
5. Override shifts marked with `[Override]` tag
6. Days with no shifts show "No shifts scheduled"
7. Empty week shows full empty state message
8. Real-time updates when admin changes shifts
9. Mobile-first layout (good on 375px width)
10. `npm run build` succeeds

### Verification

```bash
npm run build
```

### Out of Scope

- Shift swap requests (V2)
- Calendar integration (V2 — add to Google Calendar, iCal)
- Push notifications for shift changes (V2)
- Historical shift view (guard only sees future — past shifts not shown)
- i18n for day names, labels (Phase 14)

---

## Completion Summary

> **Written when epic is marked `done`. Downstream epics reference this via Prerequisites.**

**Completed**: 2026-02-17

### What Was Built

- **Guard Profile Page** (`src/app/(guard)/guard/profile/page.tsx`):
  - ID-card style layout with photo/avatar (120px circle), name (large bold), formatted phone (+91 XXXXX XXXXX), society, guard type (human-readable labels), status (colored dot)
  - Photo upload via `GuardPhotoUpload.tsx` — file picker, client-side resize (Canvas API, max 500px, JPEG, ~500KB), Convex file storage upload flow
  - Language selector (English/Hindi/Hinglish) persisted to guard profile + localStorage
  - "My Badges" section (empty state for now — Phase 10 fills)
  - "My Schedule" preview with next shifts and "View full schedule →" link
  - "Change Password" → `/guard/change-password`, "Sign Out" button
  - Mobile-first: 16px+ fonts, 44px+ touch targets

- **Guard Photo Upload** (`src/components/guard/GuardPhotoUpload.tsx`):
  - File picker (jpeg/png/webp), 5MB pre-resize limit
  - Canvas-based resize to max 500px, JPEG output
  - Upload: generateUploadUrl → POST blob → save storageId via updateMyPhoto mutation
  - Loading spinner, toast on error, real-time update via subscription

- **Guard Profile Card** (`src/components/guard/GuardProfileCard.tsx`):
  - Reusable ID card component with all guard info display

- **Backend mutations** added to `convex/guards.ts`:
  - `generateUploadUrl` — generates Convex storage upload URL (auth required)
  - `updateMyPhoto({ storage_id })` — updates guard profile photo_storage_id
  - `updateMyLanguage({ language })` — updates language_preference
  - `dismissOnboarding()` — sets has_seen_onboarding: true
  - All use `requireAuth` (not `requireGuard`) — INACTIVE guards can use these

- **Guard Onboarding** (`src/components/guard/GuardOnboarding.tsx`):
  - 3-step walkthrough: Find (Search icon) → Submit (ClipboardList) → Earn (IndianRupee)
  - Full-screen overlay (fixed z-50, backdrop), centered card (max-w-400px)
  - Dot indicators, Next/Skip/Got it! navigation
  - Dismisses permanently via `dismissOnboarding` mutation
  - Integrated into guard layout (guard-layout-client.tsx) — shows when `has_seen_onboarding === false`

- **Guard Shift Schedule** (`src/app/(guard)/guard/shifts/page.tsx` + `src/components/guard/GuardShiftList.tsx`):
  - Read-only 7-day view using `getMySchedule` query
  - Day headers: "Today", "Tomorrow", then day name + date
  - Shift entries: time range + location, override badge for override days
  - Empty day: "No shifts scheduled", empty week: full empty state message
  - IST-aware date computation for query range
  - Real-time updates via Convex subscription

### Key File Locations

| File                                        | Purpose                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/app/(guard)/guard/profile/page.tsx`    | Guard profile page → `/guard/profile`                                        |
| `src/app/(guard)/guard/shifts/page.tsx`     | Guard shift schedule → `/guard/shifts`                                       |
| `src/components/guard/GuardProfileCard.tsx` | ID card component                                                            |
| `src/components/guard/GuardPhotoUpload.tsx` | Photo upload with resize                                                     |
| `src/components/guard/GuardOnboarding.tsx`  | 3-step onboarding overlay                                                    |
| `src/components/guard/GuardShiftList.tsx`   | 7-day shift list (read-only)                                                 |
| `src/app/(guard)/guard-layout-client.tsx`   | Updated: onboarding check added                                              |
| `convex/guards.ts`                          | Added: generateUploadUrl, updateMyPhoto, updateMyLanguage, dismissOnboarding |

### Deviations from Spec

1. **Guard layout auth NOT changed**: The spec mentioned updating guard layout from `requireGuard` to `requireAuth + GUARD check`. However, the actual guard layout already uses client-side auth checking via `useQuery(api.users.getCurrentUser)` — it does NOT use `requireGuard` server-side. INACTIVE guards already pass through the layout. No change was needed.
2. **`generateUploadUrl` placed in guards.ts**: Rather than creating a separate `convex/storage.ts` file, the upload URL mutation was added to guards.ts since it's only used for guard photos in this phase. Can be moved to a shared file if other features need file upload.
3. **Photo URL resolution**: The `getMyProfile` query was enhanced to return `photo_url` by calling `ctx.storage.getUrl()` server-side, rather than doing a separate client-side query.

### Gotchas for Next Epic

1. **Phase 3 is now COMPLETE**: All 4 epics (E01-E04) are done. Next phase is P04 (Lead Pipeline).
2. **Test count**: 160 passing tests (136 from P01-P02 + 24 shift tests from E03). No new tests added for E04 (guard portal pages are UI-only, verified via build).
3. **Guard mutations use `requireAuth` not `requireGuard`**: The 4 new guard mutations (generateUploadUrl, updateMyPhoto, updateMyLanguage, dismissOnboarding) all use `requireAuth` to allow INACTIVE guards. Future mutations for guards should follow this pattern unless ACTIVE status is specifically required.
4. **Onboarding in guard layout**: The guard layout now fetches `getMyProfile` in addition to `getCurrentUser`. This adds one extra query per guard page load. Acceptable for V1 (~50 guards).
