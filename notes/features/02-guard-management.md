# Feature: Guard Management

> **Priority**: #3 in implementation order
> **Personas**: Super Admin, Ops Agent (with permissions), Guard (own profile)
> **Dependencies**: Auth + Society Registry

## Purpose

Guard management covers the full lifecycle of a guard on the platform: account creation by admin, profile setup, shift scheduling, type assignment, status management, and the guard's own profile view (ID card).

Guards are NOT DemoRentals employees. They are security staff employed by housing societies. DemoRentals registers them as platform participants.

## Entities Involved

- `users` table (user_type = GUARD)
- `guard_profiles` table
- `guard_shifts` table

---

## User Stories

### Admin: Create Guard Account
**As an admin** with `guards.create` permission, I want to register a new guard so they can start submitting leads.

**Flow**:
1. Admin fills in: name, phone number, society, guard type
2. System creates a WorkOS user with synthetic email ({phone}@guards.local) + admin-set temp password
3. System creates `users` record (user_type = GUARD, must_change_password = true)
4. System creates `guard_profiles` record linked to user and society
5. Admin shares the phone number (username) and temp password with the guard verbally
6. Guard logs in, is forced to change password on first login

**Acceptance Criteria**:
- Phone number must be unique across all guards
- Guard is assigned to exactly one society
- Guard type is set (BUILDING_SPECIFIC / MAIN_GATE / PARK / ROVING)
- Guard status defaults to `ACTIVE`
- Audit log: `GUARD_CREATED`

### Admin: Manage Guard Shifts
**As an admin** with `guards.manage_shifts` permission, I want to set a guard's schedule so ops can coordinate visits.

**Flow**:
1. Admin opens guard profile → Shifts tab
2. Sees a weekly calendar view with existing recurring shifts
3. Can add recurring shift: select day of week, start time, end time, location (building dropdown or society-wide location)
4. Can add one-off override: select specific date, start/end time, location
5. Overrides shown in a different color on the calendar

**Acceptance Criteria**:
- Recurring shifts repeat every week
- Override for a specific date replaces the recurring shift for that day
- Shifts can overlap (guard might cover two areas in one day — split shifts)
- No hard validation — shifts are informational for ops coordination
- Audit log: `GUARD_SHIFT_CREATED`, `GUARD_SHIFT_UPDATED`, `GUARD_SHIFT_DELETED`

### Admin: Change Guard Status
**As an admin** with `guards.manage_status` permission, I want to set a guard as INACTIVE or BANNED.

**Acceptance Criteria**:
- `ACTIVE` → `INACTIVE`: Guard can no longer submit leads or receive visit assignments. Can still view their history.
- `ACTIVE` / `INACTIVE` → `BANNED`: Guard cannot login at all.
- `INACTIVE` → `ACTIVE`: Reinstates the guard.
- `BANNED` → `ACTIVE`: Reinstates (requires explicit admin action).
- Confirmation dialog for BAN with mandatory reason field.
- On ban, system auto-flags pending visits (`needs_reassignment = true`) for this guard.
- Ban dialog shows summary of in-flight items: "2 pending visits, 3 active leads" — admin dismisses to proceed.
- Ban triggers Convex Action → WorkOS account suspension + Convex status update + visit flagging.
- Audit log: `GUARD_STATUS_CHANGED` with old/new status + reason

### Admin: Edit Guard Profile
**As an admin** with `guards.edit` permission, I want to update guard details (name, type, society reassignment).

**Acceptance Criteria**:
- Name, guard type, metadata editable
- Society reassignment: shows confirmation "This guard will be moved from [Society A] to [Society B]. Their existing leads stay linked to Society A."
- Phone number change: rare, requires admin action (updates WorkOS user too)
- Audit log: `GUARD_PROFILE_UPDATED`

### Admin: Reset Guard Password
**As an admin** with `guards.reset_password` permission, I want to reset a guard's password if they forget it.

**Flow**:
1. Admin clicks "Reset Password" on guard profile
2. System generates a new temp password via WorkOS
3. Admin sees the temp password to share with the guard
4. Guard's `must_change_password` flag set to true

### Guard: View Own Profile (ID Card)
**As a guard**, I want to see my profile information.

**Acceptance Criteria**:
- Shows: name, photo, phone, society name, guard type, status badge
- Card-style layout — looks like an employee ID
- Guard can upload/update their own profile photo
- Guard CANNOT edit name, phone, type, or society (admin-only)
- Guard sees onboarding walkthrough on first login (3-step: Find → Submit → Earn). Dismissed permanently via "Got it!" button. `has_seen_onboarding` flag.
- Guard can change password anytime from profile page (current password + new password + confirm). Calls Convex Action → WorkOS API.

### Guard: View Own Shift Schedule
**As a guard**, I want to see my upcoming shifts so I know where I should be.

**Acceptance Criteria**:
- Simple calendar/list view showing next 7 days
- Each entry: date, time, location (building name or "Main Gate" etc.)
- Read-only — guard cannot edit shifts

---

## Guard Types

| Type | Description | Typical Location |
|------|------------|-----------------|
| `BUILDING_SPECIFIC` | Stationed at a specific building/tower | Building lobby, stairwell |
| `MAIN_GATE` | Stationed at society main entry/exit | Main gate, vehicle entry |
| `PARK` | Stationed at common areas (garden, park, clubhouse) | Society grounds |
| `ROVING` | Patrol guard, moves between locations | Across society |

**Note**: Guard type is metadata — it does NOT restrict what leads they can submit or what visits they can handle. Any guard can submit a lead for any building in their society.

---

## Admin Panel UI

### Guard List Page (`/admin/guards`)

| Column | Description |
|--------|------------|
| Name | Guard name (clickable → profile) |
| Phone | Phone number |
| Society | Society name |
| Type | Guard type badge |
| Status | ACTIVE / INACTIVE / BANNED badge |
| Leads | Total leads submitted |
| Verified Rate | % of leads that were verified |
| Created | Registration date |

**Filters**: Society, Type, Status
**Search**: By name, phone
**Actions**: + Add Guard button

### Guard Detail Page (`/admin/guards/[id]`)

- Header: Guard name, photo, status badge, type badge
- Quick actions: Edit, Reset Password, Change Status
- Tabs:
  - **Profile**: ID card view + editable fields
  - **Shifts**: Weekly calendar + override list
  - **Leads**: Guard's submitted leads (filtered)
  - **Visits**: Guard's assigned visits (filtered)
  - **Earnings**: Guard's payout history
  - **Incentives**: Cards/badges earned
  - **Audit**: Actions related to this guard

### Add Guard Dialog

- Name (required)
- Phone (required, validated as Indian mobile: 10 digits)
- Society (dropdown, required)
- Guard Type (dropdown, required)
- Submit → shows temp password in a modal (one-time view)

### Shift Management Tab

- Weekly grid view (Mon-Sun, rows = time slots)
- Colored blocks for recurring shifts
- Different color for overrides
- Click to add/edit/delete
- Shift form: Day/Date, Start Time, End Time, Location Type dropdown, Building dropdown (if location = BUILDING), Notes

---

## Guard Portal UI

### Profile Page (`/guard/profile`)

Mobile-first card layout:
```
┌─────────────────────────┐
│     [Photo]              │
│     Rajesh Kumar         │
│     +91 98765 43210      │
│                          │
│  Society: Maplewood    │
│  Type: Building Guard    │
│  Status: ● Active        │
│                          │
│  [Upload Photo]          │
└─────────────────────────┘
```

### Shift Schedule (`/guard/shifts`)

Simple list for next 7 days:
```
Today (Mon, 17 Feb)
  06:00 - 14:00 | Tower A

Tomorrow (Tue, 18 Feb)
  14:00 - 22:00 | Main Gate

Wed, 19 Feb
  06:00 - 14:00 | Tower B
  ...
```

---

## Convex Functions

### Queries
```
guards.list({ society_id?, type?, status?, search? }) → GuardWithStats[]
guards.getById({ user_id }) → GuardProfile + User + stats
guards.getShifts({ guard_user_id, from_date, to_date }) → ComputedShift[]
guards.getMyProfile() → own profile (guard-facing)
guards.getMyShifts({ from_date, to_date }) → own shifts (guard-facing)
```

### Mutations
```
guards.create({ name, phone, society_id, guard_type }) → { user_id, temp_password }
guards.updateProfile({ user_id, name?, guard_type?, society_id?, metadata? })
guards.updateStatus({ user_id, status, reason? })
guards.resetPassword({ user_id }) → { temp_password }
guards.createShift({ guard_user_id, shift_type, day_of_week?, specific_date?, start_time, end_time, location_type, building_id?, location_label? })
guards.updateShift({ shift_id, ...fields })
guards.deleteShift({ shift_id })
guards.updateMyPhoto({ storage_id }) → (guard self-service)
```

### Computed Shift Logic
```typescript
// To get a guard's schedule for a specific date:
function getShiftForDate(guard_user_id: Id<"users">, date: string): Shift[] {
  // 1. Check for OVERRIDE entries on this specific_date
  const overrides = query shifts WHERE guard_user_id AND shift_type = "OVERRIDE" AND specific_date = date
  if (overrides.length > 0) return overrides;

  // 2. Fall back to RECURRING for this day_of_week
  const dayOfWeek = getDayOfWeek(date); // 0-6
  const recurring = query shifts WHERE guard_user_id AND shift_type = "RECURRING" AND day_of_week = dayOfWeek
  return recurring;
}
```

---

## Business Rules

1. Phone number uniqueness enforced at creation and edit.
2. One society at a time. Reassignment updates `society_id` on guard_profile. Old leads remain linked to old society.
3. `BANNED` guard's WorkOS account is suspended (cannot login).
4. `INACTIVE` guard can still login and view history, just cannot submit leads or receive new visit assignments.
5. Profile photo is optional. Stored in Convex file storage.
6. Shift data is purely informational. No system enforcement. Used for:
   - Visit assignment soft warnings
   - Ops planning
   - Analytics (guard availability heatmaps)
7. Guard shifts use soft delete. Deleted shifts are filtered from all queries but preserved in DB.

---

## Edge Cases

- **Guard loses phone / gets new phone**: Admin resets password. No device binding in web V1.
- **Guard assigned to society with no buildings**: Can login, view profile, but lead submission form will have empty building dropdown. Show message: "No buildings registered yet. Contact admin."
- **Guard moves to new society**: Admin reassigns. Old leads stay. New leads go to new society. Shift schedule is wiped (new society = new buildings).
- **Multiple guards with same name**: Phone number is the unique identifier, not name.
- **Shift timezone**: All times in IST (Indian Standard Time). Single timezone for V1.
