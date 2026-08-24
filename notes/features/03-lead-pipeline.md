# Feature: Lead Pipeline

> **Priority**: #4 in implementation order
> **Personas**: Guard (submission), Admin/OPS (triage + management with permission)
> **Dependencies**: Auth + Society/Building + Guard Management

## Purpose

The lead pipeline is the **core revenue engine**. Guards submit vacancy leads, the system auto-flags duplicates, and ops triages them through a queue toward verification. Every lead has a clear status, every transition is tracked, and de-duplication prevents wasted ops effort.

## Entities Involved

- `leads` table
- `guard_profiles` (for rate limiting)
- `buildings` (for form dropdowns)
- `audit_logs` (every status change)

---

## Guard Flow: Submit a Lead

### Lead Submission Form (`/guard/submit-lead`)

Mobile-first form. Large touch targets. Minimal typing.

**Required fields**:

1. **Building**: Dropdown of all buildings in guard's society. Shows building name.
2. **Floor Number**: Text input (supports "G", "B1", "12", etc.)
3. **Flat Number**: Text input. Validated against building's `flat_number_template`. Error shown if format doesn't match: "Flat number should be like A-0101".
4. **Owner Phone**: Phone input with +91 prefix. Normalized to 10 digits on submit (strip +91, spaces, dashes). Stored as 10 digits only.
5. **Availability**: Toggle — "Vacant Now" or "Vacant From [date picker]"
6. **Consent Checkbox**: "Owner has agreed to receive a call from our team" — MUST be checked to submit.

**Optional fields**: 7. **Owner Name**: Text input 8. **Expected Rent**: Number input (INR) — guard's rough estimate 9. **Furnishing**: Dropdown — Unfurnished / Semi-Furnished / Fully Furnished 10. **Notes**: Textarea — any extra info

**Submit button**: Big, prominent. On tap:

1. Validate all required fields
2. Check rate limit (5/day per guard — show count: "3 of 5 leads today")
3. Run de-dup check (client-side hint, server-side enforcement)
4. Create lead with status `SUBMITTED`
5. Show success screen with lead ID and status badge

### Rate Limiting

- Default: 5 leads per guard per day (configurable in system config)
- Checked server-side on the mutation (not just client-side)
- Uses a fixed daily window that resets at midnight IST. All guards' lead counts reset simultaneously at midnight IST.
- If limit reached, show: "You've submitted 5 leads today. Come back tomorrow!"
- Admin can adjust limit globally or per-guard (future: per-society)

---

## De-Duplication Rules

Auto-executed on every lead submission. Server-side, in the `leads.create` mutation.

### Rule 1: Same Flat

```
IF exists lead WHERE
  society_id = new_lead.society_id
  AND building_id = new_lead.building_id
  AND flat_number = new_lead.flat_number (case-insensitive)
  AND status NOT IN ("REJECTED", "DUPLICATE")
  AND _creationTime > (now - 90 days)
THEN flag new_lead as POTENTIAL_DUPLICATE
  AND add quality_flag: "DUPLICATE_FLAT_MATCH"
  AND store reference to matching lead_id
```

### Rule 2: Same Owner Phone

```
IF exists lead WHERE
  society_id = new_lead.society_id
  AND owner_phone = new_lead.owner_phone
  AND status NOT IN ("REJECTED", "DUPLICATE")
  AND _creationTime > (now - 30 days)
THEN flag new_lead as POTENTIAL_DUPLICATE
  AND add quality_flag: "DUPLICATE_PHONE_MATCH"
  AND store reference to matching lead_id
```

### Important Notes

- De-dup does NOT block submission. Lead is created but status is `POTENTIAL_DUPLICATE` instead of `SUBMITTED`.
- Guard sees their lead in "My Leads" with a yellow badge.
- Admin sees the duplicate flag + reference to the original lead in the queue.
- Admin finalizes: either mark as `DUPLICATE` (terminal) or proceed to verify (clear the flag).

---

## Guard Flow: My Leads

### My Leads List (`/guard/leads`)

Mobile list showing guard's own submitted leads.

| Info       | Display                                    |
| ---------- | ------------------------------------------ |
| Flat       | "Tower A, Floor 12, Flat 1201"             |
| Submitted  | "2 hours ago" / "Feb 15"                   |
| Status     | Color-coded badge                          |
| Admin Note | Shown if exists (for NEED_INFO especially) |

**Status badge colors**:

- `SUBMITTED`: Blue
- `NEED_INFO`: Orange (with admin note visible)
- `POTENTIAL_DUPLICATE`: Yellow
- `VERIFIED`: Green
- `REJECTED`: Red
- `DUPLICATE`: Grey

**Tap on lead** → Lead detail view:

- All submitted info
- Status history (timeline)
- Prospective bounty (if set by admin, shown after VERIFIED)
- If `NEED_INFO`: editable fields + admin note + "Update Lead" button

### Responding to NEED_INFO

When admin marks a lead as `NEED_INFO`:

1. Lead shows orange badge in guard's list
2. Guard opens lead, sees full history of admin notes (timestamped, with admin name). Latest note highlighted. E.g., "Feb 17, 3:00 PM — Priya: Need owner's alternate number"
3. Guard can edit: owner_phone, owner_name, notes, furnishing, rent_expected, availability
4. Guard can optionally add a reply note (e.g., "Here's the alternate number: 98765xxxxx")
5. Status transitions: `NEED_INFO` → `SUBMITTED` (goes back into admin queue)
   5.5. Guard's reply (if entered) is appended to notes_thread with author_type: GUARD
6. Admin also calls the guard directly (since guards may not check the app promptly)

---

## Admin Flow: Lead Queue

### Lead Queue Page (`/admin/leads`)

The primary ops workspace. Table with real-time updates (Convex subscriptions).

| Column      | Description                                |
| ----------- | ------------------------------------------ |
| ID          | Short lead reference                       |
| Society     | Society name                               |
| Building    | Building name                              |
| Floor/Flat  | Floor + Flat number                        |
| Owner Phone | Clickable (tel: link)                      |
| Guard       | Submitting guard name                      |
| Submitted   | Timestamp                                  |
| Status      | Color badge                                |
| Flags       | Quality flags (duplicate indicators, etc.) |
| Bounty      | Prospective bounty if set                  |
| Actions     | Action buttons                             |

**Filters** (as tabs or dropdown):

- All
- SUBMITTED (default view)
- POTENTIAL_DUPLICATE
- NEED_INFO
- VERIFIED
- REJECTED

**Search**: Full-text search across flat number, owner phone, guard name, society name. Leads are searchable via a denormalized `searchable_text` field on the leads table. This field is computed inline during the lead creation mutation — it concatenates society name, building name, flat number, owner name, and owner phone. It is NOT maintained by a trigger. The search index (`search_leads`) filters by `status` and `society_id`.
**Sort**: By submitted date (newest first default), status, society

### Lead Detail Panel (Side Panel or Modal)

Clicking a lead opens a detail panel:

**Lead Info Section**:

- Full lead data (all fields submitted by guard)
- Guard's profile card (name, phone, type, society)
- Submission timestamp

**Duplicate Info Section** (if POTENTIAL_DUPLICATE):

- "Potential duplicate of Lead #XYZ"
- Link to original lead
- Match reason (same flat / same phone)
- Buttons: "Mark as Duplicate" / "Not a Duplicate — Continue"

**Status History Section**:

- Timeline of all status changes with timestamps and who made the change

**Admin Actions**:

- **Request Info** (`leads.request_info`): Opens a note field. Appends to notes_thread array (timestamped, with admin ID + admin name + author_type: ADMIN). Status → `NEED_INFO`.
- **Verify** (`leads.verify`): Opens Owner Verification form (see feature 04).
- **Reject** (`leads.reject`): Opens a reason field. Status → `REJECTED`.
- **Mark Duplicate** (`leads.mark_duplicate`): Links to original. Status → `DUPLICATE`.
- **Set Bounty** (`leads.set_bounty`): Number input for prospective bounty amount.

---

## Convex Functions

### Queries

```
leads.list({ society_id?, building_id?, status?, guard_user_id?, search?, pagination }) → Lead[]
leads.getById({ id }) → Lead + guard info + building info + verification records + duplicate references
leads.getMyLeads({ pagination }) → guard's own leads (guard-facing)
leads.getSubmissionCount({ guard_user_id, date }) → number (for rate limit display)
```

### Mutations

```
leads.create({
  building_id, floor_number, flat_number, owner_phone,
  availability_type, availability_date?,
  owner_name?, rent_expected?, furnishing?, notes?,
  owner_consent_to_call
}) → Lead
// Auto-sets: society_id (from guard profile), submitted_by_guard_id (from auth)
// Auto-runs: de-dup check, rate limit check
// Auto-creates: audit log entry

leads.requestInfo({ lead_id, note }) → Lead
// Status: → NEED_INFO
// Appends to notes_thread: { note, author_id, author_name, author_type: "ADMIN", timestamp }
// Audit: LEADS_UPDATE

leads.updateByGuard({ lead_id, ...editable_fields }) → Lead
// Only allowed when status = NEED_INFO
// Status: → SUBMITTED
// Appends guard reply to notes_thread: { note: "Updated fields: ...", author_id, author_name, author_type: "GUARD", timestamp }
// Audit: LEADS_UPDATE

leads.reject({ lead_id, reason }) → Lead
// Status: → REJECTED
// Audit: LEADS_UPDATE

leads.markDuplicate({ lead_id, original_lead_id, reason? }) → Lead
// Status: → DUPLICATE
// Audit: LEADS_UPDATE

leads.clearDuplicateFlag({ lead_id }) → Lead
// Status: POTENTIAL_DUPLICATE → SUBMITTED
// Audit: LEADS_UPDATE

leads.setBounty({ lead_id, amount }) → Lead
// Audit: LEADS_UPDATE
```

---

## Quality Flags

Flags stored in `quality_flags` array on the lead:

| Flag                    | Trigger   | Description                                                   |
| ----------------------- | --------- | ------------------------------------------------------------- |
| `DUPLICATE_FLAT_MATCH`  | Auto      | Same building + flat exists within 90 days                    |
| `DUPLICATE_PHONE_MATCH` | Auto      | Same owner phone in society within 30 days                    |
| `GUARD_HIGH_REJECTION`  | Auto      | Submitting guard has >50% rejection rate                      |
| `OFF_SHIFT_SUBMISSION`  | Auto (V2) | Guard submitted from a building they're not assigned to today |

---

## Business Rules

1. Only `ACTIVE` guards can submit leads.
2. Rate limit: 5/day (configurable). Server-enforced.
3. `owner_consent_to_call` must be `true`. No exceptions.
4. De-dup is advisory — never blocks, only flags.
5. `REJECTED` and `DUPLICATE` are terminal states. No transitions out.
6. Only leads with status `VERIFIED` can have visits created or listings created.
7. Guard can only edit their own leads, and only when status is `NEED_INFO`.
8. Prospective bounty is visible to the guard only after it's set by admin.

---

## Edge Cases

- **Guard submits lead for non-existent flat**: System doesn't validate flat existence (we don't have a flat registry). Building + floor + flat is free-form.
- **Same guard submits duplicate**: Treated the same as any duplicate. Auto-flagged.
- **Lead submitted when society is INACTIVE**: Blocked — guard sees error message.
- **Admin rejects a POTENTIAL_DUPLICATE**: Both REJECTED (the new one) and DUPLICATE flows are available. Admin chooses based on context.
- **Owner phone is same across different societies**: NOT flagged as duplicate (different societies are independent).
- **Guard updates lead and re-triggers de-dup**: De-dup only runs on initial submission, not on NEED_INFO updates.
