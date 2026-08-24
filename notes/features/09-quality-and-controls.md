# Feature: Quality Scoring & Operational Controls

> **Priority**: #11 in implementation order
> **Personas**: Admin (monitoring + configuration), System (enforcement)
> **Dependencies**: Lead Pipeline + Guard Management

## Purpose

Quality scoring tracks each guard's lead quality metrics. Operational controls (rate limits, bans) protect the platform from spam, fraud, and abuse. Together, they ensure that the lead pipeline stays clean and guards have accountability.

## Entities Involved

| Table            | Role in Feature                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `guard_profiles` | Primary guard profile surface for quality-related fields, leaderboard context, and fingerprint history. |
| `leads`          | Source of lead quality metrics (submitted, verified, rejected, duplicate rates).                        |
| `visits`         | Source of visit reliability metrics (completed/no-show/cancelled) and reassignment checks.              |
| `users`          | Holds guard account status (`ACTIVE`/`INACTIVE`/`BANNED`) used by operational controls.                 |
| `system_config`  | Stores configurable thresholds/limits used by quality scoring and control rules.                        |
| `payouts`        | Provides payout context used in quality views/leaderboard-style admin summaries.                        |

---

## Quality Metrics (Per Guard)

Computed in real-time from lead data. NOT stored as a separate table — calculated via Convex queries.

### Core Metrics

| Metric                  | Formula                                                          | Purpose                   |
| ----------------------- | ---------------------------------------------------------------- | ------------------------- |
| `total_submitted`       | COUNT leads WHERE submitted_by = guard                           | Volume indicator          |
| `verified_count`        | COUNT leads WHERE submitted_by = guard AND status = VERIFIED     | Quality leads             |
| `rejected_count`        | COUNT leads WHERE submitted_by = guard AND status = REJECTED     | Bad leads                 |
| `duplicate_count`       | COUNT leads WHERE submitted_by = guard AND status = DUPLICATE    | Repeat info               |
| `verified_rate`         | verified_count / total_submitted × 100                           | Primary quality indicator |
| `rejection_rate`        | rejected_count / total_submitted × 100                           | Problem indicator         |
| `duplicate_rate`        | duplicate_count / total_submitted × 100                          | Spam indicator            |
| `completed_visits`      | COUNT visits WHERE assigned_guard = guard AND status = COMPLETED | Reliability               |
| `no_show_count`         | COUNT visits WHERE assigned_guard = guard AND status = NO_SHOW   | Unreliability             |
| `visit_completion_rate` | completed_visits / (completed + no_show + cancelled) × 100       | Visit reliability         |

### Time Windows

Metrics should be queryable for different time windows:

- **All time**: Lifetime performance
- **Last 30 days**: Recent performance
- **Last 7 days**: Current trend

### Where Metrics Are Displayed

1. **Guard List** (admin): Show verified_rate, total leads, status
2. **Guard Detail** (admin): Full metrics dashboard with all numbers
3. **Lead Queue** (admin): Flag `GUARD_HIGH_REJECTION` if guard's rejection_rate > 50%
4. **Analytics Dashboards**: Leaderboards, trends, comparisons

---

## Rate Limiting

### Lead Submission Limit

| Setting                       | Default | Configurable By             |
| ----------------------------- | ------- | --------------------------- |
| `max_leads_per_guard_per_day` | 5       | Super Admin (system config) |

**Enforcement**:

```typescript
// In leads.create mutation:
const today = getStartOfDayIST(); // Midnight IST
const count = await ctx.db
  .query("leads")
  .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guardId))
  .filter((q) => q.gte(q._creationTime, today))
  .collect().length;

if (count >= maxLeadsPerDay) {
  throw new Error("Daily lead limit reached");
}
```

**Phone normalization**: All phone numbers are normalized to 10 digits on input using `normalizePhone()` from `lib/validators.ts`. This ensures de-dup matching works correctly regardless of how the guard enters the number (+91, spaces, dashes).

**Guard UX**:

- Show remaining count on submission form: "3 of 5 leads today"
- If limit reached: "You've submitted 5 leads today. Come back tomorrow!" (friendly, not punitive)
- Count resets at midnight IST

> **Rate Limit Window (IST Timezone)**: Rate limit uses a fixed daily window that resets at midnight IST. All guards get their lead count reset at midnight IST simultaneously. Default limit: 5 leads per calendar day (configurable via `system_config.max_leads_per_guard_per_day`).

### Future Considerations (Not V1)

- Per-society rate limits
- Per-guard overrides (some trusted guards get higher limits)
- Dynamic limits based on quality score

---

## Guard Status Management

### Status Definitions

| Status     | Can Login | Can Submit Leads   | Can Handle Visits | Can View History |
| ---------- | --------- | ------------------ | ----------------- | ---------------- |
| `ACTIVE`   | Yes       | Yes (rate-limited) | Yes               | Yes              |
| `INACTIVE` | Yes       | No                 | No                | Yes              |
| `BANNED`   | No        | No                 | No                | No               |

### Status Transitions

```
ACTIVE ←→ INACTIVE    (admin toggle)
ACTIVE  → BANNED      (admin action, requires reason)
INACTIVE → BANNED     (admin action, requires reason)
BANNED → ACTIVE       (admin reinstatement)
BANNED → INACTIVE     (admin partial reinstatement)
```

### Who Can Change Status

Only admins with `guards.manage_status` permission.

### BAN Process

1. Admin opens guard profile → "Ban Guard"
2. **Mandatory reason field** (e.g., "Submitting false leads repeatedly", "Rude behavior with owners")
3. Confirmation dialog: "This will prevent [Guard Name] from logging in. Are you sure?"
4. On confirm:
   - Guard status → `BANNED`
   - WorkOS user suspended (cannot authenticate)
   - All pending visit assignments for this guard flagged for reassignment
   - Specifically: visits in ASSIGNED or CONFIRMED status get `needs_reassignment = true`
   - Admin sees these in a filtered view on the Visits Board
   - Ban triggers via Convex Action: WorkOS suspension + Convex status update + visit flagging (all in one action)
   - Audit: `GUARD_BANNED` with reason

### INACTIVE Process

Softer than ban. Guard can still login and view history but cannot perform actions.

1. Admin opens guard profile → "Deactivate Guard"
2. Optional reason field
3. On confirm:
   - Guard status → `INACTIVE`
   - Pending visit assignments flagged for reassignment
   - Audit: `GUARD_DEACTIVATED`

---

## Guard Rule Banner

**Always visible sticky banner** on the guard portal. Cannot be dismissed. Shows on every page.

### Content (English)

```
⚠️ IMPORTANT: Do not negotiate rent. Do not collect any money. For pricing and agreements, ask tenant/owner to speak to the DemoRentals team.
```

### Content (Hindi)

```
⚠️ ज़रूरी: किराया तय न करें। कोई पैसा न लें। कीमत और समझौते के लिए किरायेदार/मालिक को DemoRentals टीम से बात करने को कहें।
```

### Content (Hinglish)

```
⚠️ IMPORTANT: Rent negotiate mat karo. Koi paisa mat lo. Pricing aur agreement ke liye tenant/owner ko DemoRentals team se baat karne bolo.
```

### Implementation

- Sticky bar at top of guard layout (below nav, above content)
- Yellow/orange background for visibility
- Always rendered — not conditional
- Text pulled from i18n translation files based on guard's language preference

**Implementation confirmed**: Always visible, non-dismissable, no collapse, no hide. 48px sticky bar. Legal/compliance requirement. This is final.

---

## Browser Fingerprint Tracking

Light anti-fraud measure for web V1.

### What's Tracked

On every guard login:

- Browser User-Agent string
- Screen resolution
- IP address (from request headers)
- Timestamp

Stored in `guard_profiles.browser_fingerprints` array.

### Flagging Logic

```
IF guard logs in with a fingerprint that doesn't match any previous fingerprints:
  AND this is NOT their first login:
  THEN add entry with flagged: true
```

### Admin Visibility

Guard profile shows:

- Last login info (browser, IP, time)
- Flag indicator if suspicious login detected
- Admin can view full fingerprint history

### No Blocking

Fingerprint mismatches do NOT block login. They just flag for admin review. Guards may use different phones, different browsers, etc. — too many false positives to hard-block.

---

## Convex Functions

### Queries

```
guards.getMetrics({ guard_user_id, time_window? }) → QualityMetrics
guards.getLeaderboard({ society_id?, metric, limit }) → GuardMetric[]
config.get({ key }) → ConfigValue
config.list() → SystemConfig[]
```

### Mutations

```
config.set({ key, value })
// Only super admin
// Audit: SYSTEM_CONFIG_UPDATE
```

---

## Business Rules

1. Rate limits are server-enforced. Client shows remaining count.
2. No auto-freeze or auto-ban. All status changes are manual admin decisions.
3. Quality metrics are real-time computed, not cached snapshots.
4. BAN requires a reason (non-negotiable, for audit trail).
5. Rule banner is non-dismissable and always visible on guard portal.
6. Browser fingerprints are informational. Never block logins.
7. Metrics with <5 total submissions show "Insufficient data" instead of percentages (avoid misleading rates).

---

## Edge Cases

- **Guard submits 5 leads, all rejected**: Metrics show 100% rejection rate. Admin sees this in guard profile. No auto-action — admin decides.
- **Guard at 5/5 leads, one gets rejected same day**: Limit doesn't reset. They used their 5 for the day.
- **Rate limit changed mid-day**: Takes effect immediately. If a guard already submitted 5 and new limit is 3, they're over-limit but existing leads are not affected.
- **Timezone edge**: All rate limit resets at midnight IST. Guards near state borders all use IST (India has one timezone).

---

## Multi-Dimensional Quality Score (Phase 30)

Phase 30 extended quality scoring from simple per-metric tracking to a single composite score (0-100) built from five weighted components. This score drives the quality tier and payout multiplier system.

### Component Formula

```
quality_score = (lead_quality × 0.25) + (checklist_completeness × 0.30)
              + (visit_reliability × 0.20) + (response_time × 0.15)
              + (document_compliance × 0.10)
```

| Component                | Weight | Formula                                                               |
| ------------------------ | ------ | --------------------------------------------------------------------- |
| `lead_quality`           | 25%    | `verified_count / total_submitted × 100`                              |
| `checklist_completeness` | 30%    | Average `completeness_score` across all submitted checklist instances |
| `visit_reliability`      | 20%    | `completed_visits / (completed + no_show + cancelled) × 100`          |
| `response_time`          | 15%    | Percentage of visits started within the configured response window    |
| `document_compliance`    | 10%    | Percentage of document collection requests fulfilled on time          |

Component weights are configurable via `system_config`. Guards with fewer than 5 total submissions show "Insufficient data" — no score or tier is assigned until the minimum threshold is met.

### Quality Tiers

| Tier       | Score Range | Payout Multiplier |
| ---------- | ----------- | ----------------- |
| `BRONZE`   | 0-49        | 1.0x              |
| `SILVER`   | 50-69       | 1.25x             |
| `GOLD`     | 70-84       | 1.5x              |
| `PLATINUM` | 85-100      | 2.0x              |

Tier boundaries are configurable via `system_config`. The multiplier is applied to the base bounty in the payout suggestion (see [Closure & Payouts](07-closure-and-payouts.md#payout-adjustment-model-phase-30)).

---

## Penalty Mechanics (Phase 30)

Penalties are per-payout deductions computed at payout creation time. They are NOT applied to the quality score directly — the score reflects behavioral patterns, while penalties are one-time financial adjustments for specific failures.

### Penalty Types

| Penalty Code       | Trigger                                                               | Default Deduction            |
| ------------------ | --------------------------------------------------------------------- | ---------------------------- |
| `LOW_COMPLETENESS` | Checklist completeness_score < 50 on the visit linked to this closure | Configurable (default: ₹100) |
| `MISSING_PHOTOS`   | FULL-depth checklist submitted with mandatory photos missing          | Configurable (default: ₹150) |
| `FALSE_LEAD`       | Lead was REJECTED with reason "false information"                     | Configurable (default: ₹200) |
| `NO_SHOW`          | Guard had a NO_SHOW visit within the lookback window                  | Configurable (default: ₹100) |
| `CONSECUTIVE_POOR` | Guard's last 3 checklists all had completeness_score < 60             | Configurable (default: ₹250) |

### Penalty Application Rules

1. Penalties are computed per-payout using a configurable lookback window (default: last 30 days of activity).
2. Multiple penalties can apply to a single payout — they stack additively.
3. Total penalties cannot exceed the base bounty amount (floor: ₹0 suggested payout).
4. Admin sees the penalty breakdown in the payout creation form and can override the final amount.
5. Penalty deduction amounts are configurable via `system_config` — ops can tune them without a code deploy.

### Escalation Path

Penalties are financial signals, not disciplinary actions. If a guard consistently triggers penalties:

1. Admin sees the pattern in the guard's quality tab (penalty history)
2. Admin can manually reduce the guard's tier (not yet system-enforced — admin judgment)
3. Repeated false leads or no-shows → admin initiates the BAN process (see Guard Status Management above)

There is no automatic ban or automatic tier demotion based on penalties. All escalation is manual admin decision.

See [Incentive V2](22-incentive-v2.md) for the complete penalty configuration reference, streak system, and payout adjustment algorithm.
