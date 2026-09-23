# Guard Portal UX Flows

> **Platform**: Mobile-first responsive web (guards use cheap Android phones + Chrome)
> **Language**: English / Hindi / Hinglish (selectable)
> **Layout**: Bottom nav + sticky rule banner

---

## Global Layout

```
┌─────────────────────────────────┐
│ ⚠️ Do not negotiate rent...     │  ← Sticky rule banner (ALWAYS visible, non-dismissable)
├─────────────────────────────────┤
│                                 │
│       [PAGE CONTENT]            │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│  🏠    ➕    📋    📅    💰     │  ← Bottom navigation
│  Home  Add  Leads Visits Earn   │
└─────────────────────────────────┘
```

### Rule Banner

- Background: amber/yellow
- Text: depends on selected language (see i18n doc)
- Position: fixed top, below any system browser bars
- Height: ~48px, single line with wrapping
- Cannot be closed, hidden, or scrolled past

### Bottom Navigation

5 tabs. Active tab highlighted. Badge counts on Leads (NEED_INFO count) and Visits (today count).

---

## Guard Login Page (`/guard/login`)

Separate from admin login. Guards never see Google SSO.

```
┌─────────────────────────────────┐
│                                 │
│        🏠 Rental Platform OS            │
│                                 │
│  ── Guard Login ──              │
│                                 │
│  Phone Number                   │
│  ┌─────────────────────────┐   │
│  │ +91  __________         │   │  ← Numeric keypad
│  └─────────────────────────┘   │
│                                 │
│  Password                       │
│  ┌─────────────────────────┐   │
│  │ ••••••••           👁   │   │  ← Toggle visibility
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │       LOG IN             │   │  ← Primary button
│  └─────────────────────────┘   │
│                                 │
│  Forgot password?               │
│  Contact your admin.            │
│                                 │
│  ─────────────────────────────  │
│  DemoRentals team?                  │
│  → Sign in as Admin             │  ← Link to /admin/login
│                                 │
└─────────────────────────────────┘
```

**On submit**:

1. System converts phone to synthetic email: `{phone}@guards.local`
2. Calls WorkOS `authenticateWithPassword()` via Convex Action
3. On success → check `must_change_password` flag
4. If `true` → redirect to `/guard/change-password`
5. If `false` → redirect to `/guard/dashboard`

---

## Flow 1: First Login

```
1. Guard opens app URL in mobile browser
2. Login screen: Phone number + Password fields
3. Guard enters credentials (provided by admin)
4. If must_change_password = true:
   → Redirect to "Change Password" screen
   → New password (min 6 chars) + Confirm password
   → On success: redirect to Home
5. Language selection prompt (one-time):
   → "Choose your language" / "अपनी भाषा चुनें"
   → [English] [हिन्दी] [Hinglish]
   → Saved to user preferences
5.5. If has_seen_onboarding = false:
   → Show 3-step onboarding walkthrough:
     Step 1: "Find a vacant flat in your society"
     Step 2: "Submit the details through this app"
     Step 3: "Earn money when a tenant moves in"
   → "Got it!" button dismisses permanently
   → has_seen_onboarding set to true
   → Never shown again
6. → Home screen
```

---

## Flow 2: Home Screen (`/guard/dashboard`)

```
┌─────────────────────────────────┐
│ ⚠️ Rule banner                  │
├─────────────────────────────────┤
│                                 │
│  Welcome, Rajesh!               │
│  Society: Maplewood Gardens   │
│                                 │
│  ┌─────────────────────────┐   │
│  │  ➕ Add Vacant Flat      │   │  ← Big primary CTA button
│  │  (3 of 5 leads today)   │   │
│  └─────────────────────────┘   │
│                                 │
│  Today's Schedule               │
│  ┌─────────────────────────┐   │
│  │ 06:00-14:00 Tower A     │   │
│  └─────────────────────────┘   │
│                                 │
│  Quality Score                  │
│  ┌─────────────────────────┐   │
│  │  🥇 Gold Tier            │   │
│  │  Score: 78 / 100         │   │
│  │  [━━━━━━━━━━━━━━░░░░░░]  │   │  ← progress bar
│  │  🔥 Daily Active: 7 days │   │
│  └─────────────────────────┘   │
│                                 │
│  Quick Stats                    │
│  ┌──────┐ ┌──────┐ ┌──────┐   │
│  │  12  │ │  8   │ │ ₹2.1K│   │
│  │Leads │ │Visits│ │Earned│   │
│  │(30d) │ │(30d) │ │Total │   │
│  └──────┘ └──────┘ └──────┘   │
│                                 │
│  Recent Activity                │
│  • Lead #45 verified ✓ (2h ago)│
│  • Visit tomorrow 2PM Tower B  │
│  • ₹800 payout received ✓     │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 📇 My Profile / ID Card │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

---

## Flow 3: Add Vacant Flat (`/guard/submit-lead`)

```
┌─────────────────────────────────┐
│ ⚠️ Rule banner                  │
├─────────────────────────────────┤
│  Add Vacant Flat                │
│                                 │
│  Building *                     │
│  ┌─────────────────────────┐   │
│  │ Select Building     ▼   │   │  ← Dropdown of buildings in guard's society
│  └─────────────────────────┘   │
│                                 │
│  Floor *          Flat No *     │
│  ┌──────────┐    ┌──────────┐  │
│  │ e.g. 12  │    │ e.g. 1201│  │
│  └──────────┘    └──────────┘  │
│                                 │
│  Owner Phone *                  │
│  ┌─────────────────────────┐   │
│  │ +91  98765 43210        │   │  ← Numeric keypad opens
│  └─────────────────────────┘   │
│                                 │
│  Availability *                 │
│  [● Vacant Now] [○ Vacant From] │
│                                 │
│  (If "Vacant From" selected):   │
│  ┌─────────────────────────┐   │
│  │ Select Date        📅  │   │
│  └─────────────────────────┘   │
│                                 │
│  ☑ Owner agrees to receive a   │  ← MANDATORY checkbox
│    call from our team *         │
│                                 │
│  ── Optional Details ──         │
│  (collapsed by default, tap     │
│   "Add more details" to expand) │
│                                 │
│  Owner Name                     │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  Expected Rent (₹)             │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  Furnishing                     │
│  [Unfurnished] [Semi] [Fully]   │
│                                 │
│  Notes                          │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │    SUBMIT LEAD          │   │  ← Big green button
│  │    (3 of 5 today)       │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

**On Submit Success**:

```
┌─────────────────────────────────┐
│                                 │
│         ✅ Lead Submitted!      │
│                                 │
│  Tower A, Floor 12, Flat 1201   │
│  Our team will verify with the  │
│  owner soon.                    │
│                                 │
│  [Submit Another]  [View Leads] │
│                                 │
└─────────────────────────────────┘
```

**On Rate Limit**:

```
┌─────────────────────────────────┐
│                                 │
│    ⏳ Daily Limit Reached        │
│                                 │
│  You've submitted 5 leads today.│
│  Come back tomorrow!            │
│                                 │
│  [View My Leads]                │
│                                 │
└─────────────────────────────────┘
```

---

## Flow 4: My Leads (`/guard/leads`)

```
┌─────────────────────────────────┐
│ ⚠️ Rule banner                  │
├─────────────────────────────────┤
│  My Leads                       │
│                                 │
│  [All] [In Review] [Verified] [Rejected]  │  ← Filter tabs
│                                 │
│  ┌─────────────────────────┐   │
│  │ Tower A, Fl 12, #1201   │   │
│  │ 📱 98765 43210          │   │
│  │ 2 hours ago             │   │
│  │ Status: 🟡 NEED INFO    │   │  ← Tappable → detail
│  │ ⚠️ Potential Duplicate  │   │  ← Warning badge if POTENTIAL_DUPLICATE
│  │ Admin: "Need owner's    │   │
│  │  alternate number"      │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ Tower B, Fl 3, #302     │   │
│  │ 📱 91234 56789          │   │
│  │ Yesterday                │   │
│  │ Status: 🟢 VERIFIED     │   │
│  │ Bounty: ₹800            │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ Tower A, Fl 8, #801     │   │
│  │ 📱 99876 54321          │   │
│  │ 3 days ago              │   │
│  │ Status: 🔴 REJECTED     │   │
│  │ Reason: "False info"    │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

**Tab-to-status mapping**:

- `[All]` — shows all leads by the guard
- `[In Review]` — shows leads with status `SUBMITTED`, `NEED_INFO`, or `POTENTIAL_DUPLICATE`
- `[Verified]` — shows leads with status `VERIFIED`
- `[Rejected]` — shows leads with status `REJECTED` or `DUPLICATE`

**Note**: Tab-to-status mapping: In Review = `SUBMITTED` + `NEED_INFO` + `POTENTIAL_DUPLICATE`; Rejected = `REJECTED` + `DUPLICATE`. See [State Machines](04-state-machines.md) for all lead statuses.

Leads flagged as `POTENTIAL_DUPLICATE` show a warning badge/banner on the lead card.

**NEED_INFO Detail View** (tapping orange card):

- Shows all lead fields (editable)
- Admin note prominently displayed
- "Update & Resubmit" button at bottom

---

## Flow 5: My Visits (`/guard/visits`)

```
┌─────────────────────────────────┐
│ ⚠️ Rule banner                  │
├─────────────────────────────────┤
│  My Visits                      │
│                                 │
│  ── Today ──                    │
│  ┌─────────────────────────┐   │
│  │ Tower A, Fl 12, #1201   │   │
│  │ 2:00 PM - 3:00 PM       │   │
│  │ Status: IN_PROGRESS      │   │  ← Active indicator
│  │                          │   │
│  │ [✓ Complete Visit]       │   │  ← Green button
│  └─────────────────────────┘   │
│                                 │
│  ── Upcoming ──                 │
│  ┌─────────────────────────┐   │
│  │ Tower B, Fl 3, #302     │   │
│  │ Tomorrow, 10:00 AM      │   │
│  │ Status: ASSIGNED         │   │  ← Guard can confirm
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ Tower D, Fl 7, #705     │   │
│  │ Feb 20, 3:00 PM         │   │
│  │ Status: CONFIRMED ✓     │   │  ← Confirmed badge
│  └─────────────────────────┘   │
│                                 │
│  ── Past ──                     │
│  ┌─────────────────────────┐   │
│  │ Tower C, Fl 5, #501     │   │
│  │ Feb 14, COMPLETED ✓     │   │
│  │ Outcome: Interested      │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ Tower E, Fl 2, #201     │   │
│  │ Feb 12, CANCELLED       │   │  ← Greyed out
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ Tower F, Fl 9, #901     │   │
│  │ Feb 10, NO_SHOW         │   │  ← Red badge
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

**Visit status display treatment**:

- `ASSIGNED` — shown in "Upcoming" section, guard can confirm
- `CONFIRMED` — shown in "Upcoming" section with confirmed badge
- `IN_PROGRESS` — shown in "Today" section with active indicator, guard can complete
- `COMPLETED` — shown in "Past" section with outcome
- `CANCELLED` — shown in "Past" section with cancelled badge (greyed out)
- `NO_SHOW` — shown in "Past" section with no-show badge (red)

See [State Machines](04-state-machines.md) for valid visit transitions.

---

## Flow 6: Earnings (`/guard/earnings`)

```
┌─────────────────────────────────┐
│ ⚠️ Rule banner                  │
├─────────────────────────────────┤
│  My Earnings                    │
│                                 │
│  ┌─────────────────────────┐   │
│  │  Total Earned: ₹6,200   │   │
│  │  Pending: ₹1,800        │   │
│  └─────────────────────────┘   │
│                                 │
│  ── Pending Payouts ──          │
│  ┌─────────────────────────┐   │
│  │ Tower A, #1201           │   │
│  │ Closure: Feb 15          │   │
│  │ Bounty: ₹1,000          │   │
│  │ Status: 🕐 Pending       │   │  ← pending
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ Tower B, #302            │   │
│  │ Closure: Feb 10          │   │
│  │ Bounty: ₹800            │   │
│  │ Status: ✓ Approved       │   │  ← approved
│  └─────────────────────────┘   │
│                                 │
│  ── Paid ──                     │
│  ┌─────────────────────────┐   │
│  │ Tower C, #501 — ₹1,200  │   │
│  │ Status: 💰 Paid          │   │  ← disbursed
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ Tower A, #803 — ₹900    │   │
│  │ Status: 💰 Paid          │   │  ← disbursed
│  │ Paid: Jan 15 (UPI)      │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

**Payout status display labels**:

- `pending` → displayed as "Pending" (with 🕐 icon)
- `approved` → displayed as "Approved" (with ✓ icon)
- `disbursed` → displayed as "Paid" (with 💰 icon)
- `failed` → displayed as "Failed" (with ✗ icon)

Display labels map to payout statuses defined in [State Machines](04-state-machines.md): `pending`, `approved`, `disbursed`, `failed`.

---

## Flow 7: Profile & ID Card (`/guard/profile`)

```
┌─────────────────────────────────┐
│                                 │
│        [Photo / Avatar]         │
│        [📷 Upload Photo]        │
│                                 │
│    ┌───────────────────────┐   │
│    │  RAJESH KUMAR         │   │
│    │  +91 98765 43210      │   │
│    │                       │   │
│    │  Society: Maplewood │   │
│    │  Type: Building Guard │   │  ← Display label for BUILDING_SPECIFIC
│    │  Status: ● Active     │   │
│    └───────────────────────┘   │
│                                 │
│  **Guard type display labels**: │
│  • BUILDING_SPECIFIC → "Building Guard" │
│  • MAIN_GATE → "Main Gate Guard"        │
│  • PARK → "Park Guard"                   │
│  • ROVING → "Roving Guard"               │
│  Enum values from [Constants Reference](13-constants-reference.md). │
│                                 │
│  ── My Badges ──                │
│  🥈 Silver Lead Submitter       │
│  🥉 Bronze Visit Handler        │
│                                 │
│  ── My Schedule (Next 7 Days) ──│
│  Mon: 06:00-14:00 Tower A      │
│  Tue: 14:00-22:00 Main Gate    │
│  Wed: 06:00-14:00 Tower B      │
│  ...                            │
│                                 │
│  🌐 Language: [English ▼]       │
│  🔒 [Change Password]           │
│  🚪 [Sign Out]                  │
│                                 │
└─────────────────────────────────┘
```

### Change Password Flow

Available in two contexts:

1. **Forced** (first login): Guard redirected here automatically. Cannot navigate away until password is changed.
2. **Voluntary** (from profile): Guard taps "Change Password" → same form.

```
┌─────────────────────────────────┐
│  Change Password                │
│                                 │
│  Current Password               │
│  ┌─────────────────────────┐   │
│  │ ••••••••                │   │
│  └─────────────────────────┘   │
│                                 │
│  New Password                   │
│  ┌─────────────────────────┐   │
│  │                         │   │  ← Min 6 characters
│  └─────────────────────────┘   │
│                                 │
│  Confirm New Password           │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │    CHANGE PASSWORD       │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

**On submit**: Calls Convex Action → WorkOS `updateUser()` to set new password → flips `must_change_password` to `false` (if it was `true`) → redirects to dashboard (forced) or shows success toast (voluntary).

---

## Empty States

### Dashboard (Zero Leads)

- "Add Vacant Flat" CTA button remains prominent
- Quick Stats show: 0 Leads | 0 Visits | ₹0 Earned
- Recent Activity shows: "No activity yet. Submit your first lead!"

### My Leads (Empty)

- "You haven't submitted any leads yet."
- [+ Add Vacant Flat] button

### My Visits (Empty)

- "No visits assigned yet. Keep submitting quality leads!"

### Earnings (Empty)

- Total Earned: ₹0 | Pending: ₹0
- "Your earnings will appear here after successful deal closures."

---

## Loading & Error States

### Loading

- **Page loads**: Centered spinner (consistent across all guard pages)
- **Mutation in progress**: Button shows spinner, disabled state. No double-tap.

### Errors

- **Mutation failure**: Toast notification: "Failed to submit. Check your connection and try again."
- **Convex auto-retries** transient failures. Toast only on final failure.
- **Validation errors**: Inline field errors (red text below field)

### Poor Connectivity

- Guards use cheap Android phones on 3G. No offline queueing in V1.
- If network is down, Convex client shows connection indicator.
- On reconnect, reactive queries auto-refresh.

---

## V1 Communication Protocol

No push notifications, no in-app notifications, no WhatsApp integration in V1.

| Event                   | How Guard Learns                                              |
| ----------------------- | ------------------------------------------------------------- |
| NEED_INFO on their lead | Admin **calls the guard** directly + badge count on Leads tab |
| Visit assigned          | Admin **calls the guard** to inform + appears in My Visits    |
| Payout approved/paid    | Guard checks app periodically. Non-urgent.                    |

Admin calling the guard is the **primary notification mechanism** in V1.

## Flow 8: Visit Bounty Board (`/guard/bounties`)

Guards see available tenant visit requests posted as bounties by ops. Guards can accept/claim bounties for showings in their area.

```
┌─────────────────────────────────┐
│ ⚠️ Rule banner                  │
├─────────────────────────────────┤
│  Visit Bounties                 │
│                                 │
│  [Available] [My Accepted]      │  ← Tabs
│                                 │
│  ── Available Bounties ──       │
│  ┌─────────────────────────┐   │
│  │ 🏠 Tower A, Fl 12, #1201│   │
│  │ Maplewood Gardens      │   │
│  │                          │   │
│  │ Tenant wants: Feb 20,    │   │
│  │ Morning slot             │   │
│  │ 💰 Bounty: ₹500          │   │
│  │                          │   │
│  │ ┌──────────────────────┐│   │
│  │ │   ACCEPT BOUNTY      ││   │  ← Green button
│  │ └──────────────────────┘│   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🏠 Tower B, Fl 3, #302  │   │
│  │ Riverstone Gardens            │   │
│  │                          │   │
│  │ Tenant wants: Feb 22,    │   │
│  │ 2-4 PM                   │   │
│  │ 💰 Bounty: ₹400          │   │
│  │ Expires: 2 days          │   │  ← Countdown badge
│  │                          │   │
│  │ [ACCEPT BOUNTY]          │   │
│  └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

**Bounty Card Details**:

- Listing address (building, floor, flat, society)
- Tenant's preferred visit date and time slot
- Bounty amount (in ₹)
- Expiry countdown (days remaining)
- "Accept Bounty" button

**On Accept**:

1. Guard taps "Accept Bounty" → confirmation dialog: "Accept this showing? You'll be contacted by our team to confirm the schedule."
2. On confirm: tenant inquiry status → `GUARD_ACCEPTED`, `assigned_guard_id` set
3. Toast: "Bounty accepted! Our team will confirm the schedule."
4. Bounty moves from "Available" to "My Accepted" tab
5. Once ops confirms schedule, it appears in the guard's "My Visits" list

**Available Tab**: Shows bounties for listings in the guard's assigned society. Filter: only `BOUNTY_POSTED` status, not expired.

**My Accepted Tab**: Shows bounties the guard has accepted. Status badges: `GUARD_ACCEPTED` (waiting for schedule), `VISIT_SCHEDULED` (confirmed), `VISIT_COMPLETED` (done).

**Empty State**: "No bounties available right now. Check back later!"

See [State Machines](04-state-machines.md) for tenant inquiry status transitions.

---

## Checklist Execution (Phase 30)

When a guard starts a visit that has an assigned checklist instance, a **Checklist** tab appears alongside the standard visit detail tabs. Guards work through the inspection room by room, rating conditions, uploading photos, and submitting when complete.

```
┌─────────────────────────────────┐
│ Visit #12 — Tower A, Flat 501  │
│ [Details] [Checklist] [Photos]  │  ← Tab navigation
├─────────────────────────────────┤
│  📋 Standard Property Inspection │
│  Depth: MEDIUM | Score: --      │
│  Status: IN_PROGRESS            │
├─────────────────────────────────┤
│                                 │
│  ▼ Living Room (3/5 items)      │  ← Collapsible section
│  ┌─────────────────────────┐   │
│  │ Walls & ceiling         │   │
│  │ [EXCELLENT ▼] 📷 +photo │   │
│  │ Notes: ____________     │   │
│  ├─────────────────────────┤   │
│  │ Flooring condition      │   │
│  │ [FAIR ▼]    📷 2 photos │   │
│  │ Notes: Minor scratches  │   │
│  └─────────────────────────┘   │
│                                 │
│  ▶ Kitchen (0/4 items)          │
│  ▶ Bathroom (0/3 items)         │
│  ▶ Bedrooms (0/6 items)         │
│                                 │
│  Progress: ████████░░ 60%       │
│                                 │
│  [Save Draft]  [Submit ✓]       │
└─────────────────────────────────┘
```

**Sections and items**:

- Sections are collapsible — guard works room by room, expanding one at a time
- Each section header shows `(completed/total items)` count
- Required items marked with a red asterisk \*
- Items that need photos show 📷 with the count of uploaded photos
- Completeness score updates in real-time as the guard fills items

**Item type controls**:

| Type            | Input Control                                  | Description                           |
| --------------- | ---------------------------------------------- | ------------------------------------- |
| CONDITION       | Dropdown (EXCELLENT / GOOD / FAIR / POOR / NA) | Rate physical condition               |
| CHECKBOX        | Toggle switch                                  | Yes/no confirmation                   |
| TEXT            | Text area                                      | Free-text observation                 |
| NUMBER          | Number input                                   | Count or measurement                  |
| PHOTO           | Camera/upload button                           | Photo-only evidence                   |
| PHOTO_CONDITION | Dropdown + camera                              | Condition rating with mandatory photo |

**Submit rules**:

- "Submit" button is disabled until all required items have responses
- Photos can be taken directly from the camera or uploaded from the gallery
- Draft saves automatically when the guard navigates away — they can return and continue
- After submit, status changes to `SUBMITTED` and the guard cannot edit unless admin requests `REVISION_REQUESTED`

**Touch targets**: All dropdowns, toggles, and photo buttons are minimum 44x44px.

See [Field Checklists](features/21-field-checklists.md) for the full checklist specification.

---

## Quality Dashboard (Phase 30)

Guards see their quality score, tier, and active streaks on the dashboard page. The block sits below the earnings summary and above the recent leads list.

```
┌─────────────────────────────────┐
│  Your Quality Score              │
│  ┌─────────────────────────┐   │
│  │     ╭──────╮            │   │
│  │     │  78  │  GOLD 🥇   │   │  ← Circular gauge (0-100)
│  │     ╰──────╯            │   │
│  │   Multiplier: 1.5x      │   │
│  ├─────────────────────────┤   │
│  │  Components:             │   │
│  │  Checklist  ████████░░ 85│   │
│  │  Photos     ███████░░░ 72│   │
│  │  Speed      ████████░░ 80│   │
│  │  Verified   ██████░░░░ 65│   │
│  │  Documents  ████████░░ 82│   │
│  └─────────────────────────┘   │
│                                 │
│  🔥 Active Streaks              │
│  ┌─────────────────────────┐   │
│  │ ✅ Verified Leads: 7     │   │
│  │ 📋 Full Checklists: 4   │   │
│  │ ⚡ Fast Response: 3      │   │
│  └─────────────────────────┘   │
│                                 │
│  Leaderboard Position: #3 / 48  │
└─────────────────────────────────┘
```

**Score display rules**:

- Quality score shown as a circular gauge (0-100) with the tier badge beside it
- Guards with fewer than 5 total submissions see "Insufficient data" instead of a score
- Component breakdown shows 5 horizontal progress bars, each scored 0-100
- Multiplier displayed prominently below the gauge (e.g., "1.5x bounty multiplier")

**Tier badge colors**:

| Tier     | Color  |
| -------- | ------ |
| BRONZE   | Amber  |
| SILVER   | Gray   |
| GOLD     | Yellow |
| PLATINUM | Purple |

**Streaks and leaderboard**:

- Active streaks shown with emoji icons and the current streak count
- Leaderboard position shows the guard's rank among all active guards in their society
- Guards do NOT see other guards' individual scores — only their own rank and the total count

See [Incentive V2](features/22-incentive-v2.md) for the full quality scoring specification.

---

## Responsive Behavior

| Breakpoint          | Behavior                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| < 640px (mobile)    | Single column, bottom nav, full-width cards                              |
| 640-1024px (tablet) | Two column where useful, bottom nav                                      |
| > 1024px (desktop)  | Sidebar nav replaces bottom nav. Wider cards. Unlikely usage for guards. |

## Accessibility

- Touch targets: minimum 44x44px
- Font size: minimum 16px body text (prevent zoom on iOS)
- High contrast: status badges use both color AND text labels
- Form labels: always visible (no placeholder-only labels)
