# Admin Panel UX Flows

> **Platform**: Desktop-optimized web (DemoRentals ops team uses laptops/desktops)
> **Language**: English only (ops team is English-literate)
> **Layout**: Sidebar navigation + top bar
> **Access**: The admin panel is accessible to both **Admin** and **OPS** users. OPS users see a permission-filtered sidebar — only tabs matching their assigned permissions are visible. See [OPS Admin Access](features/23-ops-admin-access.md) for details.

---

## Admin Login Page (`/admin/login`)

Separate from guard login. Admins only see Google SSO.

```
┌─────────────────────────────────────────┐
│                                         │
│           🏠 Rental Platform OS                 │
│           Admin Panel                   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  🔵 Sign in with Google         │   │  ← WorkOS AuthKit SSO
│  └─────────────────────────────────┘   │
│                                         │
│  ─────────────────────────────────────  │
│  Society guard?                         │
│  → Sign in as Guard                     │  ← Link to /guard/login
│                                         │
└─────────────────────────────────────────┘
```

**On click**: Redirects to WorkOS hosted auth → Google SSO → callback at `/api/auth/callback` → Convex user lookup → redirect to `/admin/dashboard`.

**First SSO login**: If no Convex user record exists for this `workos_user_id`, auto-create one (`user_type: ADMIN`, `status: ACTIVE`). The super admin must then assign a role to this new admin before they can access anything (RBAC enforced on every page).

---

## Global Layout

```
┌────────────────────────────────────────────────────────────────┐
│  🏠 Rental Platform OS                    🔔 Admin Name ▼  [Sign Out] │  ← Top bar
├──────────┬─────────────────────────────────────────────────────┤
│          │                                                     │
│ 📊 Dash  │                                                     │
│ 🏘 Soc.  │              [PAGE CONTENT]                         │
│ 👮 Guards │                                                     │
│ 📝 Leads │  ← badge: SUBMITTED count (red)                     │
│ ✅ Verify │                                                     │
│ 🏡 List. │                                                     │
│ 📅 Visits │                                                     │
│ 🤝 Close │                                                     │
│ 💰 Pay   │  ← badge: INITIATED count (red)                     │
│ 🏆 Incen.│                                                     │
│ ───────  │                                                     │
│ 👥 Roles │                                                     │
│ 📜 Audit │                                                     │
│ ⚙️ Config │                                                     │
│          │                                                     │
└──────────┴─────────────────────────────────────────────────────┘
```

### Sidebar Navigation

- Collapsible (icon-only mode for more content space)
- Active item highlighted
- Badge counts: Leads shows SUBMITTED count (red), Payouts shows INITIATED count (red)
- Sections grouped: Operations (Dash through Incentives), Management (Roles, Audit, Config)
- Items hidden based on RBAC permissions
- Verification item is permission-gated (requires `leads.verify` permission)

---

## Dashboard (`/admin/dashboard`)

The dashboard is the ops command center. It gives a real-time snapshot of the entire pipeline at a glance.

### Time Window Selector

A four-button toggle at the top right of the dashboard controls the time range for all metrics and charts:

```
[7d]  [30d]  [90d]  [All]
```

Switching windows re-fetches all KPI cards, charts, and activity tables simultaneously.

### KPI Cards

Seven metric cards arranged in a row across the top:

| Card             | What It Shows                             |
| ---------------- | ----------------------------------------- |
| Total Leads      | Count of all leads in the selected window |
| Verified Rate    | % of leads that reached VERIFIED status   |
| Active Guards    | Guards with ACTIVE status                 |
| Active Societies | Societies with at least one active guard  |
| Pending Payouts  | Payouts in INITIATED or APPROVED status   |
| Total Paid Out   | Sum of all DISBURSED payouts (in ₹)       |
| Conversion Rate  | % of leads that resulted in a closure     |

### Lead Funnel Chart

A horizontal bar/funnel chart (Recharts) showing the pipeline from top to bottom:

```
SUBMITTED  ████████████████████  120
VERIFIED   ████████████          72   (40% drop-off)
LISTING    ████████              48   (33% drop-off)
VISIT      ██████                36   (25% drop-off)
CLOSURE    ████                  24   (33% drop-off)
DISBURSED  ███                   18   (25% drop-off)
```

Each stage shows the count and the drop-off percentage from the previous stage. Helps ops spot where leads are getting stuck.

### Trend Line Chart

A dual-line chart (Recharts) showing daily lead volume over the selected window:

- Blue line: leads submitted per day
- Green line: leads verified per day

Useful for spotting submission spikes and verification lag.

### Recent Activity Tables

Three side-by-side tables, each showing the latest 5 items with clickable rows that navigate to the detail page:

- **Latest Leads**: flat location, guard name, status badge, time ago
- **Latest Visits**: listing, guard, status badge, scheduled time
- **Latest Payouts**: guard name, amount, status badge, time ago

### Status Breakdowns

Three compact breakdowns showing count per status:

- Leads by status (SUBMITTED, NEED_INFO, VERIFIED, etc.)
- Visits by status (ASSIGNED, CONFIRMED, COMPLETED, etc.)
- Payouts by status (INITIATED, APPROVED, DISBURSED, etc.)

### Alerts and Quick Actions

A panel at the bottom showing urgent counts and action buttons:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ Needs Attention                                             │
│                                                                 │
│  23 leads awaiting triage    5 visits need assignment           │
│  8 payouts pending approval  3 leads flagged as duplicate       │
│                                                                 │
│  [Triage Leads]  [Assign Visits]  [Review Payouts]  [Audit Log] │
└─────────────────────────────────────────────────────────────────┘
```

Each section of the dashboard has its own error boundary, so a single data failure doesn't blank the whole page.

---

## Key Admin Flows

### Flow 1: Lead Triage (Primary Workflow)

This is where ops spend most of their time.

**Lead Queue** (`/admin/leads`):

```
┌─────────────────────────────────────────────────────────────────┐
│  Lead Queue                                    [+ filters] 🔍  │
├─────────────────────────────────────────────────────────────────┤
│  [SUBMITTED (23)] [NEED_INFO (5)] [DUPLICATE? (3)] [VERIFIED]  │  ← Status tabs
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ #↕ │ Society ↕   │ Building/Flat ↕ │ Phone    │ Guard │T│   │  ← sortable headers
│  ├────┼─────────────┼─────────────────┼──────────┼───────┼─┤   │
│  │ 47 │ Maplewood │ TwrA/12/1201    │ 📞98765..│ Rajesh│2h│  │
│  │ 46 │ Maplewood │ TwrB/3/302      │ 📞91234..│ Suresh│3h│  │
│  │ 45 │ Riverstone       │ WngC/5/501      │ 📞99876..│ Mohan │5h│  │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Showing 23 results   ◄ 1 2 3 ... ►                            │
└─────────────────────────────────────────────────────────────────┘
```

Column headers with a ↕ icon are sortable. Clicking toggles ascending/descending. The "Showing X results" line appears below the table.

**Clicking a lead opens detail side panel**:

```
┌──────────────────────────────┬──────────────────────────────────┐
│  Lead Queue (table)          │  Lead #47 Details                │
│  (narrows to ~60% width)     │                                  │
│                              │  Tower A, Floor 12, Flat 1201    │
│                              │  Maplewood Gardens, Mumbai     │
│                              │                                  │
│                              │  ── Owner ──                     │
│                              │  Phone: 📞 +91 98765 43210      │
│                              │  Name: Sharma Ji                 │
│                              │                                  │
│                              │  ── Vacancy ──                   │
│                              │  Available: Vacant Now            │
│                              │  Rent (est): ₹25,000             │
│                              │  Furnishing: Semi-Furnished       │
│                              │                                  │
│                              │  ── Guard ──                     │
│                              │  Rajesh Kumar | Building Guard    │  ← clickable link
│                              │  Quality: 84% verified rate       │
│                              │                                  │
│                              │  ── Actions ──                   │
│                              │  [📞 Call & Verify] [ℹ Need Info]│
│                              │  [❌ Reject]  [🔄 Duplicate]     │
│                              │  [💰 Set Bounty]                 │
│                              │                                  │
│                              │  ── Status History ──            │
│                              │  SUBMITTED — Feb 17, 2:00 PM     │
│                              │  by Rajesh Kumar                 │
└──────────────────────────────┴──────────────────────────────────┘
```

Entity names in the detail panel (guard name, society name, listing) are clickable Next.js links that navigate to the relevant detail page.

A specific lead can be deep-linked via `/admin/leads?id=LEAD_ID`, which opens the side panel directly.

### Flow 2: Owner Verification

**From lead detail, click "Call & Verify"** → Opens verification form in the side panel:

See `features/04-owner-verification.md` for the full form.

Quick summary:

1. Admin sees owner phone prominently → calls outside the app
2. Records outcome (Verified/Unreachable/Declined/False)
3. If Verified: captures consent, visit slots, confirmed rent
4. Save → lead status updates → back to queue

### Flow 3: Create Listing from Verified Lead

**From lead detail (VERIFIED lead), click "Create Listing"** → Opens listing form:

Full page form with:

- Pre-filled fields from lead
- Photo upload zone (drag & drop)
- All listing fields (see `features/05-listings.md`)
- "Save Draft" and "Save & Publish" buttons
- Preview mode (see how public page looks)

### Flow 4: Schedule Visit

**From Visits Board, click "Schedule Visit"**:

Dialog/modal:

1. Select lead (dropdown of VERIFIED leads, searchable)
2. Pick date + time window
3. System shows guard availability grid
4. Select guard (with shift warnings)
5. Save → visit created as ASSIGNED

### Flow 5: Process Closure & Payout

**Two-step process**:

Step 1 - Closure (`/admin/closures` → "Record Closure"):

- Select lead → enter move-in date → upload docs → save as PENDING
- Review docs → Confirm closure

Step 2 - Payout (from confirmed closure → "Create Payout"):

- System shows guard + prospective bounty
- Admin enters actual amount → selects method (optional) → save as pending
- Different admin approves → disburses

### Flow 6: Guard Management

**Guard list** → Click guard → **Guard detail** with tabs:

All eight tabs are fully functional:

- **Profile**: edit guard info, status, type, shift assignment
- **Shifts**: weekly calendar editor
- **Leads**: status filter tabs, stats row (total/verified/rejected), paginated lead table with clickable rows
- **Visits**: upcoming and past sections, stats row, status badges on each visit
- **Earnings**: summary cards (total earned, pending, this month, last payout), status filter, payout table, monthly breakdown bar chart (Recharts)
- **Incentives**: cards + award button
- **Quality**: quality metrics and rate limit info
- **Audit**: latest 10 audit events for this guard, action filter dropdown, expandable diffs showing field-level changes, "View all in Audit Log" link

The guard detail page has a breadcrumb at the top:

```
Admin / Guards / Rajesh Kumar
```

### Ban Guard Dialog

When admin clicks "Ban Guard" on a guard profile:

1. System checks for in-flight data:
   - Pending visits (ASSIGNED or CONFIRMED) assigned to this guard
   - Active leads (SUBMITTED, NEED_INFO) submitted by this guard

2. Dialog shows:

```
┌─────────────────────────────────────────┐
│  Ban Guard: Rajesh Kumar                │
├─────────────────────────────────────────┤
│                                         │
│  ⚠️ This guard has active items:        │
│                                         │
│  • 2 pending visits (need reassignment) │
│  • 3 leads in SUBMITTED status          │
│                                         │
│  Banning will:                          │
│  • Prevent login immediately            │
│  • Flag 2 visits for reassignment       │
│  • Leads will remain in current status  │
│                                         │
│  Reason for ban (required):             │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Cancel]              [Confirm Ban]    │
│                                         │
└─────────────────────────────────────────┘
```

3. On confirm:
   - Convex Action suspends WorkOS account
   - Guard status → BANNED
   - Pending visits get `needs_reassignment = true`
   - Admin can filter visits by `needs_reassignment` to handle them

### Flow 7: Society Onboarding

**Society list** → "Add Society" → minimal form → save
→ Society detail → "Add Building" → repeat
→ "Add Guard" → fill form → get temp password → share with guard

### Society Detail

The society detail page has been enhanced with additional panels below the main tabs:

**Header area** now includes a listing stats card showing active listings / total listings for that society, plus quick action buttons: Add Building, Add Guard, View All Leads.

**Leads tab**: Full filterable table with status filter tabs, summary stats (total/verified/rejected), and pagination. Same pattern as the guard leads tab.

**Activity feed** (below tabs): A 7-day timeline showing all leads submitted and visits completed in this society. Each entry links to the relevant lead or visit detail.

**Guard performance leaderboard** (below activity feed): Top 5 guards in this society ranked by verified leads, with their verified count and quality rate displayed.

### Lead Rejection with Existing Listing

If admin rejects a lead that has a linked PUBLISHED listing:

1. Confirmation dialog: "This lead has a published listing. Rejecting will archive the listing. Continue?"
2. On confirm: Lead → REJECTED, Listing → ARCHIVED automatically
3. Public URL shows "No longer available"

---

## Verification Page (`/admin/verification`)

A dedicated page for the owner verification queue. Previously accessible only from the lead detail side panel; now also a first-class sidebar destination.

The sidebar item is permission-gated (requires `leads.verify`). It was previously shown with a "Soon" badge and is now fully active.

### Verification Queue Table

```
┌─────────────────────────────────────────────────────────────────┐
│  Owner Verification                            [+ filters] 🔍  │
├─────────────────────────────────────────────────────────────────┤
│  [Pending (18)] [Verified (142)] [Rejected (23)] [All]         │  ← status tabs with counts
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Lead↕ │ Society ↕   │ Phone (masked) │ Wait ↕ │ Flags │  │   │
│  ├───────┼─────────────┼────────────────┼────────┼───────┤  │   │
│  │ #47   │ Maplewood │ 📞 987XX X210  │ 3d 🔴  │ ⚠️ Q  │  │   │
│  │ #46   │ Riverstone       │ 📞 912XX X456  │ 1d 🟡  │       │  │   │
│  │ #45   │ Powai Lake  │ 📞 998XX X789  │ 2h 🟢  │       │  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Showing 18 results                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Wait column color coding**: green (same day), yellow (1-2 days), red (3+ days). Helps ops prioritize stale leads.

**Phone masking**: Middle digits hidden in the table view. Full number visible inside the verification dialog.

**Quality flag badges**: Leads from guards with low quality scores show a ⚠️ badge.

**Bulk actions**: Checkbox column for multi-select. Bulk options: reject as duplicate, assign for verification.

### Inline Verification Dialog

Clicking a row opens a dialog (not a side panel) with the full verification form:

```
┌─────────────────────────────────────────────────────────────────┐
│  Verify Lead #47 — Tower A, Fl 12, Flat 1201                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Owner Phone: +91 98765 43210  [Copy]                           │
│                                                                 │
│  Call Outcome:                                                  │
│  ○ Verified   ○ Unreachable   ○ Declined   ○ False Lead         │
│                                                                 │
│  (if Verified)                                                  │
│  ☐ Owner gave verbal consent for listing                        │
│  ☐ Owner confirmed vacancy                                      │
│                                                                 │
│  Confirmed Rent: ₹ [_______]                                    │
│                                                                 │
│  Preferred Visit Slots:                                         │
│  [Date picker]  [Time picker]  [+ Add slot]                     │
│                                                                 │
│  Notes: [textarea]                                              │
│                                                                 │
│  [Cancel]                              [Save Verification]      │
└─────────────────────────────────────────────────────────────────┘
```

The form uses react-hook-form + zod validation. Required fields are enforced before save. On save, the lead status transitions automatically based on the call outcome.

---

## Cross-Entity Navigation

All entity names throughout the admin panel are clickable Next.js links. Clicking navigates to the detail page for that entity.

### Breadcrumbs

Detail pages for guards, listings, visits, closures, and payouts show a breadcrumb trail at the top:

```
Admin / Guards / Rajesh Kumar
Admin / Leads / #47 — Tower A, Fl 12, Flat 1201
Admin / Visits / #23 — Maplewood, Feb 20
Admin / Payouts / #15 — Rajesh Kumar, ₹25,000
```

### Related Entities Cards

Visit, closure, and payout detail panels include a "Related Entities" section with cards linking to connected records:

- Visit detail → links to the lead, the guard, and the listing
- Closure detail → links to the visit, the lead, and the guard
- Payout detail → links to the closure and the guard

### Lead Deep-Link

Any lead can be opened directly via `/admin/leads?id=LEAD_ID`. The page loads with the side panel already open for that lead. Useful for sharing links in Slack or email.

---

## Settings Page (`/admin/settings`)

Grouped form with friendly labels. Only visible to admins with `system.configure` permission.

### Sections:

**Lead Submission**

- Max leads per guard per day: [number input, default: 5]

**De-Duplication**

- Flat match window (days): [number input, default: 90]
- Phone match window (days): [number input, default: 30]

**Incentive Thresholds**

- Lead Submitter: Bronze [10] Silver [25] Gold [50] Platinum [100]
- Visit Handler: Bronze [10] Silver [25] Gold [50] Platinum [100]
- Quality Champion: Bronze [70%] Silver [80%] Gold [90%] Platinum [95%]
- Quality Champion min leads: [10]

**Contact Information**

- DemoRentals contact phone: [phone input] (shown on public listing pages)
- DemoRentals WhatsApp phone: [phone input] (used for WhatsApp button on listings)

All inputs validated (no negative numbers, no empty required fields). Save button per section.

---

## Keyboard Shortcuts (Power User)

| Shortcut  | Action                                             |
| --------- | -------------------------------------------------- |
| `K`       | Open command palette (search anything)             |
| `N`       | New (context-dependent: new lead, new visit, etc.) |
| `J` / `K` | Navigate up/down in tables                         |
| `Enter`   | Open selected item                                 |
| `Esc`     | Close side panel / modal                           |

### Command Palette (Cmd+K / K)

shadcn/ui `Command` component. Search across:

- Societies by name
- Guards by name or phone
- Leads by flat number or phone
- Navigation items

---

## Table Patterns

All admin tables follow consistent patterns:

- **Pagination**: 20 items per page, "Load More" or page numbers
- **Sorting**: Click column header (↕ icon) to sort ascending/descending
- **Result count**: "Showing X results" line below each table
- **Filtering**: Filter bar above table (dropdowns + search input)
- **Bulk actions**: Checkbox column for multi-select on verification and lead tables
- **Row actions**: Hover reveals action icons, or right-click context menu
- **Real-time**: Tables auto-update via Convex subscriptions (new lead appears without refresh)
- **Empty state**: Friendly illustration + "No [items] found" message

---

## Responsive Behavior

| Breakpoint  | Behavior                                                          |
| ----------- | ----------------------------------------------------------------- |
| < 1024px    | Sidebar collapses to icons. Side panel becomes full-screen modal. |
| 1024-1440px | Sidebar + content. Side panel at 40% width.                       |
| > 1440px    | Full layout. Side panel at 35% width. More table columns visible. |

Admin panel is desktop-first. Mobile is functional but not optimized (ops team uses laptops).

---

## Tenant Inquiry Management

> Separate from the guard lead pipeline. Tenant inquiries are incoming demand — tenants requesting visits on existing published listings.

### Design Note: Hybrid Approach

The admin panel uses **Rental Platform OS's separate-pages structure** (one page per concern) but borrows **CRM card/filter UI patterns** from the external DemoRentals Rentals codebase for component design. Specifically: filterable card grids, status badges, quick-action buttons, and tab-based workflows. See [Decisions Log D40](12-decisions-log.md).

### Tenant Inquiries Page (`/admin/tenant-inquiries`)

Separate sidebar nav item with badge count (SUBMITTED count).

```
┌─────────────────────────────────────────────────────────────────┐
│  Tenant Inquiries                              [+ filters] 🔍  │
├─────────────────────────────────────────────────────────────────┤
│  [SUBMITTED (8)] [REVIEWED (3)] [BOUNTY (5)] [ACCEPTED] [DONE] │  ← Status tabs
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Inquiry │ Listing          │ Tenant       │ Pref. Date │ T │
│  ├─────────┼──────────────────┼──────────────┼────────────┼───┤
│  │ #12     │ TwrA/12/1201 2BHK│ Priya K.     │ Feb 20 AM  │3h│
│  │ #11     │ TwrB/3/302 1BHK  │ Rahul M.     │ Feb 22 PM  │5h│
│  │ #10     │ WngC/5/501 3BHK  │ Sneha T.     │ ASAP       │1d│
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Clicking an inquiry opens detail side panel**:

```
┌──────────────────────────────┬──────────────────────────────────┐
│  Inquiry Queue (table)       │  Inquiry #12 Details              │
│  (narrows to ~60% width)     │                                  │
│                              │  Listing: Tower A, Fl 12, #1201  │
│                              │  2BHK, ₹25,000/mo                │
│                              │                                  │
│                              │  ── Tenant ──                    │
│                              │  Priya Krishnamurthy              │
│                              │  📧 priya.k@example.com            │
│                              │  📱 +91 98765 43210              │
│                              │                                  │
│                              │  ── Request ──                   │
│                              │  Preferred: Feb 20, Morning       │
│                              │  Message: "Would love to see the  │
│                              │  flat. I work nearby."            │
│                              │                                  │
│                              │  ── Actions ──                   │
│                              │  [✅ Review & Post Bounty]        │
│                              │  [❌ Reject]                      │
│                              │  [💰 Set Bounty Amount: ₹___]    │
│                              │                                  │
│                              │  ── Status History ──            │
│                              │  SUBMITTED — Feb 17, 2:00 PM     │
│                              │  by Priya K. (Tenant)             │
│                              │                                  │
│                              │  ── Ops Notes ──                 │
│                              │  [Add note...]                    │
└──────────────────────────────┴──────────────────────────────────┘
```

### Bounty Posting Workflow

From inquiry detail (REVIEWED status), admin clicks "Post Bounty":

1. Set bounty amount (in ₹, stored as paise)
2. Set expiry window (days until bounty expires)
3. Optionally adjust preferred visit date/time
4. Click "Post Bounty" → status → `BOUNTY_POSTED`
5. Bounty appears in guard bounty board for guards in that society

### Bounty Tracking

BOUNTY_POSTED tab shows:

- Which bounties are active (with countdown to expiry)
- Which guard accepted (when accepted)
- Quick action to manually assign if no guard accepts before expiry

---

## Owner Service Request Management (`/admin/owner-requests`)

Simple queue for owner property management leads.

```
┌─────────────────────────────────────────────────────────────────┐
│  Owner Service Requests                        [+ filters] 🔍  │
├─────────────────────────────────────────────────────────────────┤
│  [SUBMITTED (4)] [CONTACTED (2)] [ONBOARDED] [ACTIVE]          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ #  │ Name          │ Phone      │ Location   │ Status │T│  │
│  ├────┼───────────────┼────────────┼────────────┼────────┼─┤  │
│  │ 7  │ Amit Sharma   │ 📞98765.. │ Maplewood│ NEW    │2h│  │
│  │ 6  │ Priya Verma   │ 📞91234.. │ Riverstone      │ CALLED │1d│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Detail panel**: Owner contact info, property details, ops notes, status actions (Contact → Onboard → Activate, or Reject / Drop).

When onboarding: admin creates the WorkOS account for the owner (Google email), which creates the Convex user with `user_type: OWNER`.

---

## Support Inquiry Queue (`/admin/support`)

Queue for general support inquiries from the contact hub.

```
┌─────────────────────────────────────────────────────────────────┐
│  Support Inquiries                             [+ filters] 🔍  │
├─────────────────────────────────────────────────────────────────┤
│  [OPEN (6)] [IN_PROGRESS (2)] [RESOLVED] [CLOSED]              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ #  │ Name        │ Subject        │ Persona │ Status │T│  │
│  ├────┼─────────────┼────────────────┼─────────┼────────┼─┤  │
│  │ 15 │ Raj Kumar   │ Visit issue    │ Tenant  │ OPEN   │1h│  │
│  │ 14 │ Suresh M.   │ Payout delay   │ Guard   │ OPEN   │3h│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Filters**: Status, persona type, preferred contact method.
**Actions**: Assign to admin, update status, add internal notes.

---

## Checklist Review Queue (`/admin/checklists`) — Phase 30

Review queue for submitted field checklists. Admin and OPS can approve, reject, or request revisions.

```
┌─────────────────────────────────────────────────────────────────┐
│  Checklist Review                              [+ filters] 🔍  │
├─────────────────────────────────────────────────────────────────┤
│  [SUBMITTED (4)] [UNDER_REVIEW (2)] [APPROVED] [REJECTED]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ #  │ Guard       │ Visit       │ Template    │ Score │ T │  │
│  ├────┼─────────────┼─────────────┼─────────────┼───────┼───┤  │
│  │ 12 │ Rajesh K.   │ Tower A 501 │ Std. Insp.  │  92%  │2h │  │
│  │ 11 │ Suresh M.   │ Tower B 302 │ Move-in     │  78%  │5h │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Filters**: Status, guard, society, template type (PROPERTY_INSPECTION / MOVE_IN_HANDOVER), date range.

**Checklist Detail View** (opens on row click):

```
┌─────────────────────────────────────────────────────────────────┐
│  Checklist #12 — Rajesh Kumar — Tower A 501                     │
│  Template: Standard Property Inspection (MEDIUM depth)          │
│  Completeness: 92% | Submitted: 2h ago                          │
├─────────────────────────────────────────────────────────────────┤
│  Section: Living Room                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Walls and ceiling condition    [GOOD]  📷 2 photos        │  │
│  │ Flooring condition             [FAIR]  📷 1 photo         │  │
│  │ Windows and grills             [GOOD]  ✓                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Review Notes *                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ (required)                                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Approve]  [Request Revision]  [Reject]                        │
└─────────────────────────────────────────────────────────────────┘
```

**Actions**: Approve (triggers quality score recompute), Request Revision (guard re-opens), Reject (terminal).

---

## Document Tracking Queue (`/admin/documents`) — Phase 30

Tracks document collection requirements across all active deals.

```
┌─────────────────────────────────────────────────────────────────┐
│  Document Requirements                         [+ filters] 🔍  │
├─────────────────────────────────────────────────────────────────┤
│  [NOT_STARTED (3)] [IN_PROGRESS (5)] [COMPLETE (12)] [BLOCKED]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ #  │ Society     │ Flat        │ OPS         │ Status    │  │
│  ├────┼─────────────┼─────────────┼─────────────┼───────────┤  │
│  │  8 │ Maplewood │ Tower A 501 │ Priya S.    │ BLOCKED   │  │
│  │  7 │ Maplewood │ Tower B 302 │ Amit K.     │IN_PROGRESS│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Filters**: Overall status, society, OPS assignee, date range.

**Document Detail View** (opens on row click): Shows all required items with their individual statuses (PENDING / COLLECTED / VERIFIED / REJECTED / NA). Admin can verify or reject individual items. Rejected items return to COLLECTED state for re-submission.

---

## Quality Dashboard (`/admin/quality`) — Phase 30

Platform-wide quality leaderboard and tier distribution.

```
┌─────────────────────────────────────────────────────────────────┐
│  Quality Dashboard                                              │
├─────────────────────────────────────────────────────────────────┤
│  Tier Distribution                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  BRONZE  ████████████  12 guards                         │  │
│  │  SILVER  ████████████████████  20 guards                 │  │
│  │  GOLD    ████████████  12 guards                         │  │
│  │  PLATINUM  ████  4 guards                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Leaderboard  [Daily ▼]  [All Societies ▼]                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Rank │ Guard       │ Society     │ Score │ Tier     │ Str│  │
│  ├──────┼─────────────┼─────────────┼───────┼──────────┼────┤  │
│  │  #1  │ Rajesh K.   │ Maplewood │  94   │ PLATINUM │ 🔥7│  │
│  │  #2  │ Suresh M.   │ Maplewood │  88   │ PLATINUM │ ⚡3│  │
│  │  #3  │ Amit P.     │ Powai       │  82   │ GOLD     │ 🔥5│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Export CSV]                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Filters**: Scope (Daily / Weekly / Monthly / All Time), society.
**Columns**: Rank, guard name, society, quality score, tier, active streak count.
**Actions**: Click guard row → guard detail page (Quality tab).

---

## Chat Monitor (`/admin/chat-monitor`) — Phase 24

Admin oversight page for the deal room chat infrastructure. Requires both `chat.moderate` and `chat.view` permissions.

```
┌─────────────────────────────────────────────────────────────────┐
│  Chat Monitor                                                   │
├─────────────────────────────────────────────────────────────────┤
│  [Flagged (3)] [Failed Batches (1)] [All Channels]              │  ← Tabs
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Flagged Messages (admin_review_required = true)                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Channel │ Sender   │ Role   │ Sent       │ Reason        │  │
│  ├─────────┼──────────┼────────┼────────────┼───────────────┤  │
│  │ #12     │ Priya K. │ TENANT │ 2h ago     │ PII detected  │  │
│  │ #8      │ Rahul M. │ OWNER  │ 5h ago     │ PII detected  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Failed Batches                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Batch  │ Channel │ Messages │ Failed At  │ Reason        │  │
│  ├────────┼─────────┼──────────┼────────────┼───────────────┤  │
│  │ #45    │ #12     │ 3        │ 1h ago     │ AI timeout    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Tabs**:

- **Flagged**: Messages with `admin_review_required = true` (PII detected post-AI-check). Admin can review original content and decide to approve masked version or delete.
- **Failed Batches**: Batches with status `FAILED`. Admin can retry or mark as resolved.
- **All Channels**: Full list of chat channels with status (ACTIVE / ARCHIVED), linked inquiry, and message count.

**Permissions**: Page access requires BOTH `chat.moderate` and `chat.view`. Sidebar visibility is gated by `chat.moderate`.

---

## Updated Sidebar Navigation

```
│ 📊 Dash    │
│ 🏘 Soc.    │
│ 👮 Guards  │
│ 📝 Leads   │  ← Guard lead pipeline  [badge: SUBMITTED count]
│ 📨 Tenant  │  ← Tenant inquiry pipeline
│ ✅ Verify  │  ← Owner verification queue (permission-gated)
│ 🏡 List.   │
│ 📅 Visits  │
│ 🤝 Close   │
│ 💰 Pay     │  ← [badge: INITIATED count]
│ 🏆 Incen.  │
│ 📋 Checks  │  ← Checklist review queue  [badge: SUBMITTED count]
│ 📄 Docs    │  ← Document tracking queue  [badge: BLOCKED count]
│ ⭐ Quality │  ← Quality leaderboard + tier distribution
│ ───────    │
│ 🏠 Owners  │  ← Owner service requests
│ 💬 Support │  ← Support inquiry queue
│ 💬 Chat    │  ← Chat monitor (sidebar-gated: chat.moderate; page also requires chat.view)
│ 👥 Roles   │
│ 📜 Audit   │
│ ⚙️ Config  │
```

---

## Phase 46 Admin Route Additions

### CEO Ops Command Center (P46)

Route: `/admin/ops-command-center`
Permission: `ops_management.view`

Two-tier dashboard (CEO aggregate / OPS Head individual). Team health heatmap, fires-to-fight panel, celebrations, KPI targets, warnings, and weekly check-in notes. See [CEO Ops Command Center](features/37-ceo-ops-command-center.md).
