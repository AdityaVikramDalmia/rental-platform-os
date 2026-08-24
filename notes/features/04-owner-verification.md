# Feature: Owner Verification

> **Priority**: #5 in implementation order
> **Personas**: Admin/Ops (with `leads.verify` permission)
> **Dependencies**: Lead Pipeline

## Purpose

Owner verification is the trust gate. Before a lead becomes actionable (listing, visits), an ops team member must call the flat owner to confirm the vacancy, get consent for DemoRentals to market it, and capture key details. This protects DemoRentals from acting on false/stale leads and ensures the owner is on board.

## Entity Involved

- `owner_verifications` table
- `leads` table (status transitions)

## Entities Involved

| Table                 | Role in Feature                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `owner_verifications` | Stores each verification call attempt, outcome, consent, and notes history per lead.                     |
| `leads`               | Enforces verification eligibility and applies status transitions (`SUBMITTED` -> `VERIFIED`/`REJECTED`). |
| `listings`            | Checked by `lead_id` after successful verification to trigger downstream trust-badge recomputation.      |
| `owners`              | Resolves/links canonical owner identity and progresses lifecycle stage on successful verification.       |
| `users`               | Resolves the admin/ops caller identity (`called_by_admin_id`) for verification attempt history.          |

---

## Workflow

### Step 1: Admin Opens Verification Form

From the Lead Queue, admin clicks "Verify" on a lead with status `SUBMITTED`. If the lead is `POTENTIAL_DUPLICATE`, admin must first clear the flag ("Not a Duplicate" → status becomes `SUBMITTED`), then open verification. This is a two-step process — no direct verification from POTENTIAL_DUPLICATE.

The verification form appears as a side panel or full page with the lead details visible alongside.

### Step 2: Admin Calls the Owner

Admin uses the owner's phone number (displayed prominently with a click-to-call link) to make a phone call. This happens **outside the app** — the app just displays the number.

### Step 3: Admin Records Call Outcome

**Verification Form Fields**:

| Field                                | Type     | Required          | Description                                                                                     |
| ------------------------------------ | -------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| Call Outcome                         | Select   | Yes               | `VERIFIED` / `UNREACHABLE` / `DECLINED` / `FALSE`                                               |
| Owner Consents to DemoRentals Contact    | Checkbox | Yes (if VERIFIED) | "Owner agrees to be contacted by DemoRentals team" — MUST be true to proceed                        |
| Owner Consents to Visit Coordination | Checkbox | No                | "Owner agrees to guard-coordinated visits"                                                      |
| Preferred Visit Slots                | Text     | No                | Free text: "Weekdays 10am-4pm", "Sat/Sun only", etc.                                            |
| Rent Confirmed (₹)                   | Number   | No                | Rent amount confirmed by owner, in paise (₹25,000 = 2500000). May differ from guard's estimate. |
| Notes                                | Textarea | No                | Any additional info from the call                                                               |

### Step 4: System Processes Outcome

| Outcome                      | Lead Status Change | Next Steps                                                     |
| ---------------------------- | ------------------ | -------------------------------------------------------------- |
| `VERIFIED` + consent = true  | → `VERIFIED`       | Lead unlocked for listing + visits. Bounty can be set.         |
| `VERIFIED` + consent = false | No change          | Can't proceed. Admin adds note, may try calling again.         |
| `UNREACHABLE`                | No change          | Lead stays in queue. Admin may try again later.                |
| `DECLINED`                   | → `REJECTED`       | Owner doesn't want DemoRentals involved. Terminal.                 |
| `FALSE`                      | → `REJECTED`       | Vacancy info was wrong. Terminal. Affects guard quality score. |

### Step 5: Multiple Attempts

- Multiple verification records can exist per lead (e.g., first call UNREACHABLE, second call VERIFIED).
- Each attempt is a new `owner_verifications` record.
- Lead status only changes on a decisive outcome (VERIFIED with consent, DECLINED, FALSE).
- Admin can see full call attempt history on the lead.

---

## Admin Panel UI

### Verification Form (Side Panel)

```
┌─────────────────────────────────────┐
│ Verify Lead: Tower A, Fl 12, #1201 │
├─────────────────────────────────────┤
│                                     │
│ Owner: Sharma Ji                    │
│ Phone: +91 98765 43210  [📞 Call]   │
│                                     │
│ ── Call Outcome ──                  │
│ ○ Verified                          │
│ ○ Unreachable                       │
│ ○ Declined                          │
│ ○ False / Wrong Info                │
│                                     │
│ ── Consent (if Verified) ──         │
│ ☐ Owner consents to DemoRentals contact │
│   (Required to proceed)             │
│ ☐ Owner consents to visit coord.    │
│                                     │
│ ── Details ──                       │
│ Preferred Visit Slots: [________]   │
│ Rent Confirmed (₹):   [________]   │
│ Notes:                              │
│ [________________________]          │
│                                     │
│ [Save Verification]                 │
│                                     │
│ ── Previous Attempts ──             │
│ Feb 14, 3:00 PM - UNREACHABLE      │
│   by Priya (ops) - "No answer"     │
└─────────────────────────────────────┘
```

### Lead Queue: Verification Status Indicators

In the lead queue, verified leads show:

- Green badge: "Verified ✓"
- Consent icons (small): contact ✓, visits ✓
- Verified date

---

## Convex Functions

### Queries

```
verifications.listByLead({ lead_id }) → OwnerVerification[]
```

### Mutations

```
verifications.create({
  lead_id,
  call_outcome,
  consent_contact_demorentals,
  consent_visit_coordination?,
  preferred_visit_slots?,
  rent_confirmed?,
  notes?
}) → OwnerVerification
// Side effects:
//   If VERIFIED + consent_contact_demorentals: lead.status → VERIFIED
//   If DECLINED or FALSE: lead.status → REJECTED
//   Audit log: VERIFICATION_RECORDED + LEAD_STATUS_CHANGED (if applicable)
```

---

## Business Rules

1. Only leads with status `SUBMITTED` can be verified. POTENTIAL_DUPLICATE leads must have their flag cleared first (→ SUBMITTED), then verified separately. Two-step flow.
2. `consent_contact_demorentals` MUST be true for lead to transition to `VERIFIED`. This is the legal gate.
3. `FALSE` outcome contributes to the submitting guard's rejection rate (quality scoring).
4. `UNREACHABLE` does not change lead status — admin can retry.
5. There is no timeout on UNREACHABLE leads. They sit in the queue until admin acts.
6. Multiple ops agents can attempt verification on the same lead (tracked via `called_by_admin_id`).
7. Once a lead is `VERIFIED`, it cannot be un-verified (but can be `REJECTED` via separate action if new info emerges).

---

## Edge Cases

- **Owner changes mind after verification**: Admin can still `REJECT` a verified lead with a note. Any in-progress visits should be cancelled.
- **Owner phone is wrong**: Admin marks `FALSE`. Guard's quality score affected.
- **Same owner, multiple flats**: Each flat is a separate lead with separate verification. Owner may be called multiple times (admin should note this).
- **Admin accidentally verifies with wrong outcome**: Create a new verification record with the correct outcome. Latest decisive outcome wins. Note: re-verification requires the lead to be in `SUBMITTED` status. A `VERIFIED` lead must first be rejected (`VERIFIED` → `REJECTED`) and re-submitted before it can be re-verified. The state machine is authoritative.
- **Consent for visits but not for contact**: Contradictory — shouldn't happen. Form validation prevents this (visit consent only shown if contact consent is true).
